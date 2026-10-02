// after-drain.ts — the single place that schedules "drain the outbox after the response" (CRM C5.4-D r3 ▸ controller ruling R2-N6 ·
//   used by `scheduleDrain` in `outbox-consumers.ts` (every module) and by the CRM's `wakeOutbox`). Imports nothing but `next/server`
//   (no load cycle).
//
// History (why the coalescing exists — do not remove it):
//   • Before C5.4-D every wake registered its own `after()` ⇒ an action that revalidates 5 pages, or several requests at once, chained 5+
//     drains of the WHOLE queue (every shop, every module) and every request's waitUntil waited for that chain (`drainOutbox` serialises
//     in-process) — function time and DB connections.
//   • N9: the `after()` task RETURNS the drain promise — the platform's waitUntil is bound to it (a floating `void` is frozen mid-drain:
//     the 1 Sep 2026 incident, 557–600 s message delays; see `scheduleDrain` in outbox-consumers.ts).
//   • R3-S1: one flag stands for the drains of every module in the instance — a stale flag must never silence the instance for long.
//
// CRM C5.5-fix15 ▸ P-it6-2 (QC run5, reproduced alone): writes followed by a wake waited 28 s … 350 s. Until fix15 a wake that found a
//   registered-but-not-started task registered nothing for 15 s (PENDING_STALE_MS) and trusted that task to start. Next runs an `after()`
//   task only when the REGISTERING request's response emits 'close' (AfterContext.runCallbacksOnClose ← `res.on('close')`), so request B's
//   drain depended on request A's response lifetime — a long-streaming response, a request killed before its after-phase, or a
//   registration made from code that still carries an already-closed request's async context (its 'close' was emitted before the listener
//   was attached ⇒ the task never runs; probe-cf20-drain N0.2) left B's rows to an unrelated later wake (prod: the hourly cron).
//   Which of these happened on the QC server is NOT proven (no server-side instrumentation was available); the design below does not
//   depend on any single `after()` task ever starting.
//
// Model — two layers, both instance-global (`Symbol.for` on globalThis, so duplicated module copies share them):
//   (1) Registration (request side). A wake while a registration is pending (registered, not started, younger than FALLBACK_MS) only
//       records itself in it (`lastWake`) — no second `after()`: 3 wakes in one action, or concurrent requests of different modules,
//       register ONE task (probe-c54d-r2 S3 · probe-c54d-r3 R2N6 / R2N8c). Every registration also arms a FALLBACK timer (unref'd).
//       The registration STARTS exactly once, by whichever comes first: its `after()` task, or the fallback timer FALLBACK_MS later.
//       Starting clears the pending slot ⇒ a later wake registers its own task.
//   (2) Drain (instance side). Starting a registration asks for a drain that covers its last wake: the running drain if it started AFTER
//       that wake (its candidate read is later than the wake ⇒ later than the commit), else the one queued re-run (created on demand,
//       starts when the running drain ends), else a new drain. At most one drain runs and at most one is queued per instance.
//
// Invariants (probe: scripts/pending/cf20/probe-cf20-drain.mts):
//   I1 (no lost write) every wake is followed, within FALLBACK_MS of its registration plus the time of drains already running, by a drain
//      that STARTS after the wake — even if the `after()` task that covers it never starts (U2a/U2b), and also when the wake arrives while
//      a drain is running after its candidate read (U3, U8). Relies on the caller rule below.
//   I2 (bounded) per request at most one `after()` task; per instance at most one running + one queued drain, however many wakes (U4).
//   I3 (N9) the `after()` task returns the promise of the drain that covers its wakes (waitUntil keeps the function alive for it) (U1, U8).
//   I4 out of a request scope (scripts · cron · tests) `after()` throws ⇒ the drain is requested immediately (not awaited) (U6, U7).
//   I5 never fails the user's request: nothing here throws or rejects, even if `run` throws synchronously (U5).
//   I6 the fallback timer is cleared when the task starts, so a normal request leaves nothing behind; a fallback that fires logs one
//      throttled warning — that line in the server log is the evidence that an `after()` task did not start in time.
//
// 🔴 Caller rule (unchanged since C5.4-D r3): every caller wakes AFTER its write has committed — a drain that starts after the wake then
//    sees the row. Every `run` passed in must be equivalent ("drain this instance's whole outbox"): a queued re-run uses the run of the
//    wake that created it.
// Cost of the fallback: when an `after()` task is merely slow (> FALLBACK_MS, e.g. a long-streaming response) the drain starts earlier,
//   from the timer — still after the wake; the late task then returns that drain's promise. Extra drains are harmless anyway (serialised
//   in-process by `drainOutbox` + DB leases on every claim).
// PROD-EXPOSED (every module that calls scheduleDrain/wakeOutbox) — after deploy the controller watches function duration, DB connection
//   count and the "[after-drain] fallback" warning rate.
import { after } from "next/server";

/** A registration whose `after()` task has not started by then is started by its fallback timer. Also the coalescing window. */
const FALLBACK_MS = 3_000;
const WARN_EVERY_MS = 60_000;
// The key name is historical (it held a timestamp until fix15); probes reset it to `undefined` to force a fresh registration.
const PENDING_KEY = Symbol.for("shark.core.after-drain.pendingSince");
const STATE_KEY = Symbol.for("shark.core.after-drain.state");

type Run = () => Promise<unknown>;
type Registration = { since: number; lastWake: number; run: Run; timer: ReturnType<typeof setTimeout> | null; started: Promise<void> | null };
type Drain = { startSeq: number; done: Promise<void> };
type State = { seq: number; running: Drain | null; queued: Promise<void> | null; warnedAt: number };

const holder = globalThis as unknown as Record<symbol, unknown>;

function state(): State {
  let s = holder[STATE_KEY] as State | undefined;
  if (!s || typeof s !== "object") {
    s = { seq: 0, running: null, queued: null, warnedAt: 0 };
    holder[STATE_KEY] = s;
  }
  return s;
}

function pendingRegistration(now: number): Registration | null {
  const r = holder[PENDING_KEY] as Registration | undefined;
  if (!r || typeof r !== "object" || r.started) return null;
  return now - r.since < FALLBACK_MS ? r : null;
}

/** Start one drain now. `done` settles (never rejects) after `run` finished; the running slot is released before `done` settles. */
function startDrain(st: State, run: Run): Promise<void> {
  let settle!: () => void;
  const done = new Promise<void>((r) => {
    settle = r;
  });
  const d: Drain = { startSeq: ++st.seq, done };
  st.running = d;
  void (async () => {
    try {
      await run();
    } catch {
      // best effort — the rows stay PENDING for the next drain / cron
    } finally {
      if (st.running === d) st.running = null;
      settle();
    }
  })();
  return done;
}

/** A drain that starts after wake number `wake`: the running one if it started later, else the (single) queued re-run, else a new one. */
function requestDrain(wake: number, run: Run): Promise<void> {
  const st = state();
  if (st.running && st.running.startSeq > wake) return st.running.done;
  if (st.queued) return st.queued;
  if (!st.running) return startDrain(st, run);
  const q = st.running.done.then(() => {
    st.queued = null;
    return startDrain(st, run);
  });
  st.queued = q;
  return q;
}

function startRegistration(reg: Registration, viaFallback: boolean): Promise<void> {
  if (reg.started) return reg.started;
  if (reg.timer) {
    clearTimeout(reg.timer);
    reg.timer = null;
  }
  if (holder[PENDING_KEY] === reg) holder[PENDING_KEY] = undefined;
  if (viaFallback) {
    const st = state();
    const now = Date.now();
    if (now - st.warnedAt >= WARN_EVERY_MS) {
      st.warnedAt = now;
      console.warn(`[after-drain] fallback drain: an after() task did not start within ${FALLBACK_MS} ms of its registration — draining from the timer`);
    }
  }
  reg.started = requestDrain(reg.lastWake, reg.run);
  return reg.started;
}

/** Drain the outbox after the response (out of a request: now, not awaited) — coalesced; never throws. Call after the write committed. */
export function scheduleCoalescedDrain(run: Run): void {
  try {
    const st = state();
    const wake = ++st.seq;
    const now = Date.now();
    const pending = pendingRegistration(now);
    if (pending) {
      pending.lastWake = wake;
      return;
    }
    const reg: Registration = { since: now, lastWake: wake, run, timer: null, started: null };
    holder[PENDING_KEY] = reg;
    try {
      after(() => startRegistration(reg, false));
    } catch {
      void startRegistration(reg, false); // no request scope (script · cron · test) or no waitUntil ⇒ drain now
      return;
    }
    reg.timer = setTimeout(() => void startRegistration(reg, true), FALLBACK_MS);
    reg.timer.unref?.();
  } catch {
    // I5: waking the queue must never fail the user's request
  }
}

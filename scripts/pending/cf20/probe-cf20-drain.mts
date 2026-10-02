// probe — CRM C5.5-fix15 (P-it6-2): `core/after-drain.ts` unit probe — no DB, no network, fake clock (node:test MockTimers for
//   setTimeout + Date) and an injected Next request scope whose `after()` is controlled by the probe (captured · run at "close" · never run).
//   The "outbox" is a fake: `write(n)` adds a row, a drain (`run`) reads the candidate rows when it STARTS and marks them done when it ends
//   (optionally held open so a wake can arrive while it is running, after it read its candidates).
//   FINDING = the fix15 expectation (RED on bd435157 = reproduced) · control = must be GREEN on both sides.
//   N0 additionally drives Next's REAL `AfterContext` (real timers, before the fake clock) to show the mechanism by which a registered
//   `after()` task can never start: the callback waits for `onClose`; a close that already happened is never seen again.
// Run: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf20/probe-cf20-drain.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { AsyncLocalStorage } from "node:async_hooks";
import { EventEmitter } from "node:events";
import { mock } from "node:test";

(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string)) as Any;
const nextAfter = (await import("next/dist/server/after/after-context.js" as string)) as Any;

const cks: { id: string; ok: boolean; finding: boolean }[] = [];
const chk = (id: string, n: string, ok: unknown, actual: string, finding = false) => {
  cks.push({ id, ok: !!ok, finding });
  console.log(`  ${ok ? "✅" : "❌"} [${id}]${finding ? " (FINDING)" : " (control)"} ${n}\n        — ACTUAL ${actual}`);
};
const info = (id: string, s: string) => console.log(`  ℹ️  [${id}] ${s}`);
const sub = async (id: string, fn: () => Promise<void>) => {
  try {
    await fn();
  } catch (e) {
    chk(id, "block ran", false, e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 600) : String(e));
  }
};
const flush = async (n = 6) => {
  for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r));
};

// ── N0 · Next's real AfterContext (real timers) ──
console.log("\n── N0 Next AfterContext: when does a registered after() task run? ──");
await sub("N0", async () => {
  const mk = () => {
    const res = new EventEmitter();
    const waits: Promise<unknown>[] = [];
    const ctx = new nextAfter.AfterContext({ waitUntil: (p: Promise<unknown>) => waits.push(p), onClose: (cb: () => void) => res.on("close", cb), onTaskError: () => undefined });
    const store = { afterContext: ctx, route: "/x", page: "/x/page", incrementalCache: {}, pendingRevalidatedTags: [] };
    return { res, ctx, store };
  };
  // (a) registered while the response is open, close afterwards ⇒ runs
  const a = mk();
  let ranA = 0;
  nextWork.workAsyncStorage.run(a.store, () => a.ctx.after(() => { ranA += 1; }));
  await new Promise((r) => setTimeout(r, 50));
  const beforeClose = ranA;
  a.res.emit("close");
  await new Promise((r) => setTimeout(r, 100));
  // (b) registered on a scope whose response ALREADY closed (e.g. code running later in a promise chain/timer that inherited that
  //     request's async context) ⇒ the callback waits for a 'close' that will never be emitted again
  const b = mk();
  b.res.emit("close");
  let ranB = 0;
  nextWork.workAsyncStorage.run(b.store, () => b.ctx.after(() => { ranB += 1; }));
  await new Promise((r) => setTimeout(r, 1_000));
  chk("N0.1", "control: Next runs an after() task only when the registering request's response emits 'close' (not before)", beforeClose === 0 && ranA === 1, `before close=${beforeClose} after close=${ranA}`);
  chk("N0.2", "control (mechanism, real Next code): an after() task registered on a scope whose response already closed NEVER starts", ranB === 0, `ran within 1 s = ${ranB}`);
});

// ── fake clock from here on ──
mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_800_000_000_000 });
const advance = async (ms: number, step = 100) => {
  for (let t = 0; t < ms; t += step) {
    mock.timers.tick(Math.min(step, ms - t));
    await flush();
  }
};

const AD = (await import("@/lib/core/after-drain" as string)) as Any;
const PENDING_KEY = Symbol.for("shark.core.after-drain.pendingSince");
const STATE_KEY = Symbol.for("shark.core.after-drain.state");
const holder = globalThis as unknown as Record<symbol, unknown>;
const reset = () => {
  holder[PENDING_KEY] = undefined;
  holder[STATE_KEY] = undefined;
};

// fake outbox + drains
function world() {
  const pending = new Set<number>();
  let runs = 0;
  let hold: (() => void) | null = null;
  let holdNext = false;
  const run = async () => {
    runs += 1;
    const cand = [...pending]; // the candidate read happens when the drain starts
    if (holdNext) {
      holdNext = false;
      await new Promise<void>((r) => { hold = r; });
    }
    await Promise.resolve();
    for (const c of cand) pending.delete(c);
  };
  return {
    pending,
    run,
    get runs() { return runs; },
    holdNextRun() { holdNext = true; },
    release() { const h = hold; hold = null; h?.(); },
  };
}
type Mode = "close" | "never" | "capture";
/** one request: `fn` runs inside a Next work scope · "close" = tasks run when the request ends (like Next on 'close') · "never" = tasks never start */
async function request(mode: Mode, fn: () => void | Promise<void>, sink?: Any[]) {
  const tasks: Any[] = [];
  const store = { route: "/p", page: "/p/page", forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [], afterContext: { after: (t: Any) => { tasks.push(t); } } };
  await nextWork.workAsyncStorage.run(store, async () => { await fn(); });
  const results: unknown[] = [];
  if (mode === "close") for (const t of tasks) results.push(typeof t === "function" ? t() : t);
  if (sink) sink.push(...tasks);
  return { tasks: tasks.length, results };
}

// ── U1 normal ──
console.log("\n── U1 normal: write → wake → the request's after() task drains it ──");
await sub("U1", async () => {
  reset();
  const w = world();
  w.pending.add(1);
  const r = await request("close", () => { AD.scheduleCoalescedDrain(w.run); AD.scheduleCoalescedDrain(w.run); AD.scheduleCoalescedDrain(w.run); });
  const p = r.results[0] as Any;
  const isP = !!p && typeof p.then === "function";
  let settled = false;
  if (isP) void p.then(() => { settled = true; });
  await advance(200);
  chk("U1.1", "control: 3 wakes in one request ⇒ ONE after() task · it returns the drain promise (N9) · the row is drained · one drain", r.tasks === 1 && isP && settled && w.pending.size === 0 && w.runs === 1, `tasks=${r.tasks} returnsPromise=${isP} settled=${settled} pending=${w.pending.size} runs=${w.runs}`);
  await advance(5_000);
  chk("U1.2", "control: no extra drain later (nothing to cover)", w.runs === 1, `runs after 5 s = ${w.runs}`);
});

// ── U2 a registered after() task never starts ──
console.log("\n── U2 P-it6-2: a registered after() task never starts ──");
await sub("U2a", async () => {
  reset();
  const w = world();
  w.pending.add(1);
  await request("never", () => AD.scheduleCoalescedDrain(w.run)); // request A: its task never starts
  await advance(1_000);
  w.pending.add(2);
  const b = await request("close", () => AD.scheduleCoalescedDrain(w.run)); // request B, 1 s later, ordinary request
  await advance(5_000);
  chk("U2a", "FINDING: request A's after() task never starts; request B writes + wakes 1 s later ⇒ B's row (and A's) is drained within 5 s without any other wake",
    !w.pending.has(2) && !w.pending.has(1), `B registered ${b.tasks} after() task(s) · pending after 5 s = ${JSON.stringify([...w.pending])} · drains=${w.runs}`, true);
  await advance(20_000);
});
await sub("U2b", async () => {
  reset();
  const w = world();
  w.pending.add(3);
  await request("never", () => AD.scheduleCoalescedDrain(w.run)); // the write's OWN request never starts its task (nok's case: no other wake for 350 s)
  await advance(5_000);
  chk("U2b", "FINDING: the request's own after() task never starts and nothing else wakes ⇒ its row is still drained within 5 s", w.pending.size === 0, `pending after 5 s = ${JSON.stringify([...w.pending])} · drains=${w.runs}`, true);
  await advance(20_000);
});
await sub("U2c", async () => {
  reset();
  const w = world();
  await request("never", () => AD.scheduleCoalescedDrain(w.run));
  const regs: number[] = [];
  for (let s = 1; s <= 16; s += 1) {
    await advance(1_000);
    const r = await request("never", () => AD.scheduleCoalescedDrain(w.run));
    regs.push(r.tasks);
  }
  const firstReg = regs.findIndex((n) => n > 0) + 1;
  info("U2c", `after a never-starting registration, wakes at +1 s … +16 s registered after() tasks: ${JSON.stringify(regs)} (first registration at +${firstReg} s) · drains run by then: ${w.runs}`);
  chk("U2c", "FINDING: the blackout after a never-starting task is at most the fallback window (≤ 3 s), not 15 s", firstReg > 0 && firstReg <= 4, `first new registration at +${firstReg} s`, true);
  await advance(20_000);
});

// ── U3 wake while a drain is running (after it read its candidates) ──
console.log("\n── U3 wake during a running drain ──");
await sub("U3", async () => {
  reset();
  const w = world();
  w.pending.add(10);
  w.holdNextRun();
  await request("close", () => AD.scheduleCoalescedDrain(w.run)); // drain D starts, reads {10}, is held open
  await advance(200);
  const runsBefore = w.runs;
  w.pending.add(11); // committed after D read its candidates
  const r = await request("close", () => AD.scheduleCoalescedDrain(w.run));
  await advance(200);
  w.release();
  await advance(1_000);
  chk("U3", "control: a write + wake that arrives while a drain is running (after its candidate read) is still drained — by a drain that starts after the wake", runsBefore === 1 && w.pending.size === 0 && w.runs === 2, `runs before=${runsBefore} · second request registered ${r.tasks} task(s) · pending=${JSON.stringify([...w.pending])} · drains=${w.runs}`);
  await advance(10_000);
});

// ── U4 burst of 50 wakes ──
console.log("\n── U4 burst of 50 wakes ──");
await sub("U4a", async () => {
  reset();
  const w = world();
  w.holdNextRun();
  w.pending.add(100);
  await request("close", () => AD.scheduleCoalescedDrain(w.run)); // first drain, held
  await advance(100);
  const regs: number[] = [];
  for (let i = 0; i < 50; i += 1) {
    w.pending.add(200 + i);
    const r = await request("close", () => AD.scheduleCoalescedDrain(w.run)); // 50 requests, each task starts at its close (drain still running)
    regs.push(r.tasks);
    await advance(10, 10);
  }
  w.release();
  await advance(2_000);
  chk("U4a", "FINDING: 50 requests that each write + wake while one drain is running ⇒ every row drained with a BOUNDED number of drains (≤ 2: the running one + one queued re-run)",
    w.pending.size === 0 && w.runs <= 2, `drains=${w.runs} · after() tasks registered=${regs.reduce((a, b) => a + b, 0)} · pending=${w.pending.size}`, true);
  await advance(10_000);
});
await sub("U4b", async () => {
  reset();
  const w = world();
  for (let i = 0; i < 50; i += 1) w.pending.add(300 + i);
  const r = await request("close", () => { for (let i = 0; i < 50; i += 1) AD.scheduleCoalescedDrain(w.run); });
  await advance(1_000);
  chk("U4b", "control: 50 wakes in ONE request ⇒ one after() task, one drain", r.tasks === 1 && w.runs === 1 && w.pending.size === 0, `tasks=${r.tasks} drains=${w.runs} pending=${w.pending.size}`);
  await advance(10_000);
});
await sub("U4c", async () => {
  reset();
  const w = world();
  const sink: Any[] = [];
  for (let i = 0; i < 50; i += 1) {
    w.pending.add(400 + i);
    await request("capture", () => AD.scheduleCoalescedDrain(w.run), sink); // 50 concurrent requests: none has closed yet
  }
  for (const t of sink) void (typeof t === "function" ? t() : t);
  await advance(1_000);
  chk("U4c", "control: 50 concurrent requests (none closed yet) ⇒ ONE after() task in total, one drain, every row drained", sink.length === 1 && w.runs === 1 && w.pending.size === 0, `tasks=${sink.length} drains=${w.runs} pending=${w.pending.size}`);
  await advance(10_000);
});

// ── U5 run() throws ──
console.log("\n── U5 run() throws ──");
await sub("U5", async () => {
  reset();
  let calls = 0;
  const bad = async () => { calls += 1; throw new Error("drain failed"); };
  const r = await request("close", () => AD.scheduleCoalescedDrain(bad));
  let rejected = false;
  await Promise.resolve(r.results[0]).catch(() => { rejected = true; });
  await advance(200);
  const w = world();
  w.pending.add(500);
  const r2 = await request("close", () => AD.scheduleCoalescedDrain(w.run));
  await advance(500);
  chk("U5.1", "control: an async failure of run() never rejects the after() task, and the next wake still drains (state not stuck)", calls === 1 && !rejected && r2.tasks === 1 && w.pending.size === 0, `calls=${calls} rejected=${rejected} nextTasks=${r2.tasks} pending=${w.pending.size}`);
  reset();
  const syncBad = (() => { throw new Error("sync"); }) as unknown as () => Promise<unknown>;
  let threw = false;
  let rej = false;
  try {
    const r3 = await request("close", () => AD.scheduleCoalescedDrain(syncBad));
    await Promise.resolve(r3.results[0]).catch(() => { rej = true; });
  } catch {
    threw = true;
  }
  let threwOut = false;
  try { AD.scheduleCoalescedDrain(syncBad); } catch { threwOut = true; }
  await advance(500);
  const w2 = world();
  w2.pending.add(501);
  await request("close", () => AD.scheduleCoalescedDrain(w2.run));
  await advance(500);
  chk("U5.2", "FINDING: even a run() that throws synchronously never fails the user's request or the after() task, in or out of a request; the next wake still drains", !threw && !rej && !threwOut && w2.pending.size === 0, `threwInRequest=${threw} taskRejected=${rej} threwOutOfRequest=${threwOut} nextPending=${w2.pending.size}`, true);
  await advance(10_000);
});

// ── U6 out of request ──
console.log("\n── U6 out of request (scripts · cron · tests) ──");
await sub("U6", async () => {
  reset();
  const w = world();
  w.pending.add(600);
  AD.scheduleCoalescedDrain(w.run);
  const immediate = w.runs;
  await flush();
  chk("U6.1", "control: outside a request scope the drain starts immediately (synchronously), not awaited, and drains", immediate === 1 && w.pending.size === 0, `runs right after the call=${immediate} pending=${w.pending.size}`);
  // a wake while that drain is running is not lost either
  reset();
  const w2 = world();
  w2.holdNextRun();
  w2.pending.add(601);
  AD.scheduleCoalescedDrain(w2.run);
  w2.pending.add(602);
  AD.scheduleCoalescedDrain(w2.run);
  AD.scheduleCoalescedDrain(w2.run);
  await flush();
  w2.release();
  await advance(500);
  chk("U6.2", "control: out of request, wakes while a drain is running ⇒ every row drained", w2.pending.size === 0, `drains=${w2.runs} pending=${w2.pending.size}`);
  info("U6.2", `out-of-request: 3 wakes while the first drain ran ⇒ ${w2.runs} drain(s) (before fix15: one chained drain per wake)`);
  await advance(10_000);
});

// ── U7 after() itself throws inside a request ──
console.log("\n── U7 after() throws inside a request ──");
await sub("U7", async () => {
  reset();
  const w = world();
  w.pending.add(700);
  let threw = false;
  const store = { route: "/p", page: "/p/page", incrementalCache: {}, pendingRevalidatedTags: [], afterContext: { after: () => { throw new Error("waitUntil not available"); } } };
  try {
    nextWork.workAsyncStorage.run(store, () => AD.scheduleCoalescedDrain(w.run));
  } catch {
    threw = true;
  }
  await advance(200);
  chk("U7", "control: after() throwing inside a request never fails the request and drains immediately", !threw && w.pending.size === 0, `threw=${threw} pending=${w.pending.size} drains=${w.runs}`);
  await advance(10_000);
});

// ── U8 the task's promise covers the drain that covers the wake ──
console.log("\n── U8 waitUntil gets the covering drain ──");
await sub("U8", async () => {
  reset();
  const w = world();
  w.holdNextRun();
  await request("close", () => AD.scheduleCoalescedDrain(w.run)); // drain D held
  await advance(100);
  w.pending.add(800);
  const r = await request("close", () => AD.scheduleCoalescedDrain(w.run)); // wake during D ⇒ needs the re-run
  let settled = false;
  const p = r.results[0] as Any;
  if (p && typeof p.then === "function") void p.then(() => { settled = true; });
  await advance(300);
  const early = settled;
  w.release();
  await advance(500);
  // FINDING (not control): before fix15 only `drainOutbox`'s in-process chain serialised drains — `after-drain` itself started a second,
  //   concurrent run (with the real `run` that run waits on the chain; with this fake it does not) ⇒ the module's own guarantee is new
  chk("U8", "FINDING: the after() task of a wake that arrived during a running drain resolves only after the drain that covers its write (started after D finished) has finished — guaranteed by after-drain itself", r.tasks === 1 && !early && settled && w.pending.size === 0, `tasks=${r.tasks} settledWhileDHeld=${early} settledAtEnd=${settled} pending=${w.pending.size}`, true);
  await advance(10_000);
});

mock.timers.reset();
const controls = cks.filter((c) => !c.finding);
const findings = cks.filter((c) => c.finding);
console.log(`\ncontrols ${controls.filter((c) => c.ok).length}/${controls.length} green · findings GREEN (fixed) ${findings.filter((c) => c.ok).length}/${findings.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ controls: controls.map((c) => [c.id, c.ok]), findings: findings.map((c) => [c.id, c.ok ? "GREEN" : "RED"]) })}`);
process.exit(cks.every((c) => c.ok) ? 0 : 1);

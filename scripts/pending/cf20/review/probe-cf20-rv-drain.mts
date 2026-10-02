// REVIEW probe — CRM C5.5-fix15 (independent reviewer): adversarial unit probe of `src/lib/core/after-drain.ts` (fix) against the
//   bd435157 version (loaded from git into a temp file next to this probe, removed at the end). No DB, no network.
//   Fake clock (node:test MockTimers: setTimeout + Date) · an injected Next request scope whose `after()` tasks run at a chosen "close"
//   time, or never · a fake outbox whose `run` is serialised exactly like the real `drainOutbox` (module-level promise chain), so the
//   OLD module is compared against the same drain semantics the platform really has.
//   Every check is a property the fix must hold (✅/❌). `ℹ️` lines are measurements for the review note (old vs new).
// Run: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf20/review/probe-cf20-rv-drain.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { AsyncLocalStorage } from "node:async_hooks";
import { execFileSync, spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { mock } from "node:test";

(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string)) as Any;

const cks: { id: string; ok: boolean }[] = [];
const chk = (id: string, n: string, ok: unknown, actual: string) => {
  cks.push({ id, ok: !!ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}\n        — ACTUAL ${actual}`);
};
const info = (id: string, s: string) => console.log(`  ℹ️  [${id}] ${s}`);
const sub = async (id: string, fn: () => Promise<void>) => {
  try {
    await fn();
  } catch (e) {
    chk(id, "block ran", false, e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 600) : String(e));
  }
};
const flush = async (n = 8) => {
  for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r));
};

// ── K0 (real timers, before the fake clock): the fallback timer must not keep a CLI/script process alive ──
console.log("\n── K0 unref: a script that registers inside a (stub) request scope exits without waiting for the 3 s fallback ──");
{
  const child = "scripts/pending/cf20/review/.rv-unref-child.tmp.mts";
  writeFileSync(
    child,
    [
      `import { AsyncLocalStorage } from "node:async_hooks";`,
      `(globalThis as any).AsyncLocalStorage ??= AsyncLocalStorage;`,
      `const W = (await import("next/dist/server/app-render/work-async-storage.external.js" as string)) as any;`,
      `const AD = (await import("@/lib/core/after-drain" as string)) as any;`,
      `let ran = 0;`,
      `const store = { route: "/p", page: "/p/page", incrementalCache: {}, pendingRevalidatedTags: [], afterContext: { after: () => undefined } };`,
      `W.workAsyncStorage.run(store, () => AD.scheduleCoalescedDrain(async () => { ran += 1; }));`,
      `process.on("exit", () => console.log("CHILD_EXIT " + Date.now() + " ran=" + ran));`,
      `console.log("CHILD_END " + Date.now());`,
    ].join("\n"),
  );
  try {
    const r = spawnSync("pnpm", ["exec", "tsx", child], { encoding: "utf8", timeout: 60_000 });
    const end = Number(/CHILD_END (\d+)/.exec(r.stdout)?.[1] ?? NaN);
    const exit = Number(/CHILD_EXIT (\d+)/.exec(r.stdout)?.[1] ?? NaN);
    chk("K0", "a pending fallback timer (unref'd) does not hold a script open for 3 s (exit − end of script < 1500 ms)", Number.isFinite(end) && Number.isFinite(exit) && exit - end < 1_500, `end→exit ${exit - end} ms · ${(/ran=\d+/.exec(r.stdout) ?? ["?"])[0]} · status=${r.status} ${String(r.stderr ?? "").slice(0, 200)}`);
  } finally {
    rmSync(child, { force: true });
  }
}

// ── fake clock from here on ──
mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_800_000_000_000 });
const advance = async (ms: number, step = 50) => {
  for (let t = 0; t < ms; t += step) {
    mock.timers.tick(Math.min(step, ms - t));
    await flush();
  }
};
// count the module's timers (installed after the mock; the probe's own timers use ST directly)
const ST = globalThis.setTimeout;
const CT = globalThis.clearTimeout;
const live = new Set<Any>();
let timersCreated = 0;
let maxLive = 0;
(globalThis as Any).setTimeout = (fn: (...a: Any[]) => void, ms?: number, ...a: Any[]) => {
  timersCreated += 1;
  const h: Any = ST(() => {
    live.delete(h);
    fn(...a);
  }, ms);
  live.add(h);
  maxLive = Math.max(maxLive, live.size);
  return h;
};
(globalThis as Any).clearTimeout = (h: Any) => {
  live.delete(h);
  CT(h);
};
const resetTimerStats = () => {
  timersCreated = 0;
  maxLive = live.size;
};

// modules: NEW (fix, from src) · OLD (bd435157, from git) · NEW copy B (second module instance, same file, query string)
const OLD_FILE = "scripts/pending/cf20/review/.old-after-drain.tmp.ts";
writeFileSync(OLD_FILE, execFileSync("git", ["show", "bd435157:src/lib/core/after-drain.ts"], { encoding: "utf8" }));
const NEW = (await import("@/lib/core/after-drain" as string)) as Any;
const OLD = (await import(`./.old-after-drain.tmp.ts` as string)) as Any;
let NEW_B: Any = null;
// a second module INSTANCE of the same source (what a duplicated bundle would be): a byte copy under another path (imports only next/server)
const COPY_FILE = "scripts/pending/cf20/review/.copy-b-after-drain.tmp.ts";
writeFileSync(COPY_FILE, execFileSync("git", ["show", "HEAD:src/lib/core/after-drain.ts"], { encoding: "utf8" }));
try {
  NEW_B = await import(`./.copy-b-after-drain.tmp.ts` as string);
} catch (e) {
  info("K9", `could not load a second module instance: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`);
}
const PENDING_KEY = Symbol.for("shark.core.after-drain.pendingSince");
const STATE_KEY = Symbol.for("shark.core.after-drain.state");
const holder = globalThis as unknown as Record<symbol, unknown>;
const reset = () => {
  holder[PENDING_KEY] = undefined;
  holder[STATE_KEY] = undefined;
};

/** fake outbox; `run` is serialised through a module-level chain exactly like `drainOutbox` (core/outbox.ts:139-150) */
function world(opts: { drainMs?: number } = {}) {
  const pending = new Set<number>();
  let chain: Promise<unknown> = Promise.resolve();
  let calls = 0; // run() calls (what after-drain asked for)
  let reads = 0; // candidate reads (drains that actually executed)
  let hangNext = false;
  let holdNext = false;
  let hold: (() => void) | null = null;
  const doDrain = async () => {
    reads += 1;
    const cand = [...pending];
    if (hangNext) {
      hangNext = false;
      await new Promise<void>(() => undefined); // never settles (hung DB / socket)
    }
    if (holdNext) {
      holdNext = false;
      await new Promise<void>((r) => {
        hold = r;
      });
    }
    if (opts.drainMs) await new Promise((r) => ST(r, opts.drainMs));
    for (const c of cand) pending.delete(c);
  };
  const run = () => {
    calls += 1;
    const r = chain.then(doDrain, doDrain);
    chain = r.catch(() => undefined);
    return r;
  };
  return {
    pending,
    run,
    get calls() {
      return calls;
    },
    get reads() {
      return reads;
    },
    hangNextRun() {
      hangNext = true;
    },
    holdNextRun() {
      holdNext = true;
    },
    release() {
      const h = hold;
      hold = null;
      h?.();
    },
  };
}

/** one request: `fn` runs in a Next work scope; its after() tasks run `closeAfterMs` later (null = never) */
function request(fn: () => void, closeAfterMs: number | null, out?: { results: Any[]; tasks: number }) {
  const tasks: Any[] = [];
  const store = { route: "/p", page: "/p/page", incrementalCache: {}, pendingRevalidatedTags: [], afterContext: { after: (t: Any) => { tasks.push(t); } } };
  nextWork.workAsyncStorage.run(store, fn);
  if (out) out.tasks += tasks.length;
  if (closeAfterMs !== null)
    ST(() => {
      for (const t of tasks) {
        const r = typeof t === "function" ? t() : t;
        out?.results.push(r);
      }
    }, closeAfterMs);
  return tasks.length;
}
const settledFlag = (p: Any) => {
  const s = { done: false };
  if (p && typeof p.then === "function") void p.then(() => { s.done = true; }, () => { s.done = true; });
  return s;
};

// ── K1 same-millisecond ties ──
console.log("\n── K1 same-millisecond ties (the 'started after the wake' rule is a sequence number, not the clock) ──");
await sub("K1", async () => {
  // out of request: drain D1 starts and reads at T; a write + wake in the SAME millisecond after the read must get a later drain
  reset();
  const w = world();
  w.holdNextRun();
  w.pending.add(1);
  NEW.scheduleCoalescedDrain(w.run);
  await flush();
  w.pending.add(2); // written after D1's candidate read, same ms (clock not advanced)
  NEW.scheduleCoalescedDrain(w.run);
  w.release();
  await flush(20);
  chk("K1.1", "out of request, same ms: a wake after the running drain's read is drained by a later drain (no clock advance)", w.pending.size === 0 && w.reads === 2, `pending=${JSON.stringify([...w.pending])} reads=${w.reads}`);
  // in request: A's task starts D1 (held) · B writes + wakes + closes in the same ms ⇒ B's task must not return D1
  reset();
  const w2 = world();
  w2.holdNextRun();
  w2.pending.add(3);
  request(() => NEW.scheduleCoalescedDrain(w2.run), 0);
  mock.timers.tick(0);
  await flush();
  const readsAfterA = w2.reads;
  w2.pending.add(4);
  const outB = { results: [] as Any[], tasks: 0 };
  request(() => NEW.scheduleCoalescedDrain(w2.run), 0, outB);
  mock.timers.tick(0);
  await flush();
  const sB = settledFlag(outB.results[0]);
  await flush();
  const settledWhileHeld = sB.done;
  w2.release();
  await flush(20);
  chk("K1.2", "in request, same ms: B's after() task does not resolve with A's held drain; B's row is drained by a drain started after B's wake", readsAfterA === 1 && !settledWhileHeld && sB.done && w2.pending.size === 0 && w2.reads === 2, `readsAfterA=${readsAfterA} B settled while A held=${settledWhileHeld} B settled=${sB.done} pending=${JSON.stringify([...w2.pending])} reads=${w2.reads}`);
});

// ── K2 a drain that started before the wake but has not read yet ──
console.log("\n── K2 wake between a drain's start and its candidate read ──");
await sub("K2", async () => {
  reset();
  const w = world();
  // emulate drainNow: the read happens only after an async step (lazy import) — D1 started before the wake
  let gate: (() => void) | null = null;
  const slowRun = async () => {
    await new Promise<void>((r) => { gate = r; });
    return w.run();
  };
  w.pending.add(10);
  NEW.scheduleCoalescedDrain(slowRun); // D1 started, not read yet
  w.pending.add(11);
  NEW.scheduleCoalescedDrain(w.run); // wake before D1's read ⇒ conservative: queued re-run
  (gate as unknown as () => void)();
  await flush(20);
  chk("K2", "a wake that arrives after a drain started but before it read is still covered (conservatively: one queued re-run)", w.pending.size === 0, `pending=${JSON.stringify([...w.pending])} run() calls=${w.calls} reads=${w.reads}`);
});

// ── K3 a hung drain ──
console.log("\n── K3 run() never resolves (hung DB): what happens to later wakes — fix vs bd435157 ──");
async function hung(mod: Any, label: string) {
  reset();
  const w = world();
  w.hangNextRun();
  w.pending.add(20);
  const out = { results: [] as Any[], tasks: 0 };
  request(() => mod.scheduleCoalescedDrain(w.run), 10, out);
  await advance(100);
  for (let i = 0; i < 60; i += 1) {
    w.pending.add(100 + i);
    request(() => mod.scheduleCoalescedDrain(w.run), 20, out);
    await advance(1_000);
  }
  const flags = out.results.map(settledFlag);
  await flush(20);
  const unresolved = flags.filter((f) => !f.done).length;
  info("K3", `${label}: 60 requests over 60 s after a hung drain ⇒ after() tasks=${out.tasks} · run() calls=${w.calls} · drains that read=${w.reads} · rows still pending=${w.pending.size} · after() promises unresolved=${unresolved}/${out.results.length}`);
  return { reads: w.reads, pending: w.pending.size, unresolved, tasks: out.tasks };
}
await sub("K3", async () => {
  const o = await hung(OLD, "bd435157");
  const n = await hung(NEW, "fix15");
  chk("K3", "a hung drain blocks later drains on BOTH versions (the real drainOutbox chain serialises) — fix is not worse than bd435157", n.reads <= o.reads && n.pending === o.pending, `old reads=${o.reads} pending=${o.pending} unresolved=${o.unresolved} · new reads=${n.reads} pending=${n.pending} unresolved=${n.unresolved}`);
  info("K3", "neither version has a drain timeout: a drain that never settles holds every later after() promise (waitUntil) in the instance until the platform kills it");
  reset();
});

// ── K4 run() rejects ──
console.log("\n── K4 run() rejects ──");
await sub("K4", async () => {
  reset();
  let n = 0;
  const bad = async () => {
    n += 1;
    throw new Error("x");
  };
  const out = { results: [] as Any[], tasks: 0 };
  request(() => NEW.scheduleCoalescedDrain(bad), 10, out);
  await advance(100);
  let rejected = false;
  await Promise.resolve(out.results[0]).catch(() => { rejected = true; });
  const w = world();
  w.pending.add(30);
  request(() => NEW.scheduleCoalescedDrain(w.run), 10);
  await advance(200);
  chk("K4", "a rejecting run() does not reject the after() task and leaves no stuck running/queued state", n === 1 && !rejected && w.pending.size === 0, `bad calls=${n} rejected=${rejected} next pending=${w.pending.size}`);
});

// ── K5 timers: bounded, cleared ──
console.log("\n── K5 fallback timers: bounded under bursts, cleared on normal requests ──");
await sub("K5", async () => {
  for (const [label, closeMs] of [["normal (close 50 ms)", 50], ["slow (close 5 s)", 5_000], ["never", null]] as const) {
    reset();
    await advance(10_000); // let older timers drain
    resetTimerStats();
    const w = world({ drainMs: 30 });
    for (let i = 0; i < 600; i += 1) {
      w.pending.add(1_000 + i);
      request(() => NEW.scheduleCoalescedDrain(w.run), closeMs);
      await advance(100, 100);
    }
    await advance(10_000);
    info("K5", `${label}: 600 wakes / 60 s ⇒ timers created=${timersCreated} max live=${maxLive} live after=${live.size} · drains read=${w.reads} · rows left=${w.pending.size}`);
    chk(`K5.${label.split(" ")[0]}`, `${label}: live fallback timers stay ≤ 3 at any time and none is left behind; every row drained`, maxLive <= 3 && live.size === 0 && w.pending.size === 0, `maxLive=${maxLive} liveAfter=${live.size} pending=${w.pending.size}`);
  }
});

// ── K6 exactly-once start (after() task vs timer) ──
console.log("\n── K6 exactly-once start ──");
await sub("K6", async () => {
  for (const closeMs of [2_900, 3_000, 3_500]) {
    reset();
    const w = world({ drainMs: 2_000 });
    w.pending.add(40);
    const out = { results: [] as Any[], tasks: 0 };
    request(() => NEW.scheduleCoalescedDrain(w.run), closeMs, out);
    await advance(closeMs + 10, 10);
    const s = settledFlag(out.results[0]);
    await advance(5_000);
    chk(`K6.${closeMs}`, `after() task at +${closeMs} ms vs fallback at +3000 ms ⇒ exactly ONE drain; the task returns a promise that settles after that drain`, w.calls === 1 && w.reads === 1 && s.done && w.pending.size === 0, `run() calls=${w.calls} reads=${w.reads} taskSettled=${s.done}`);
  }
});

// ── K7 sustained traffic: drains per wake (fix vs bd435157) ──
console.log("\n── K7 sustained traffic: one write+wake every 100 ms for 60 s ──");
async function sustained(mod: Any, closeMs: number | null, drainMs: number) {
  reset();
  await advance(20_000);
  const w = world({ drainMs });
  let tasks = 0;
  for (let i = 0; i < 600; i += 1) {
    w.pending.add(5_000 + i);
    tasks += request(() => mod.scheduleCoalescedDrain(w.run), closeMs);
    await advance(100, 100);
  }
  const leftAt60 = w.pending.size;
  await advance(20_000);
  return { calls: w.calls, reads: w.reads, left: w.pending.size, leftAt60, tasks };
}
await sub("K7", async () => {
  const rows: string[] = [];
  let worse = false;
  for (const [closeMs, drainMs] of [[50, 30], [50, 300], [500, 30], [null, 30]] as const) {
    const o = await sustained(OLD, closeMs, drainMs);
    const n = await sustained(NEW, closeMs, drainMs);
    rows.push(`close=${closeMs ?? "never"} drain=${drainMs}ms: OLD after()=${o.tasks} run()=${o.calls} reads=${o.reads} left@60s=${o.leftAt60} left@80s=${o.left} | NEW after()=${n.tasks} run()=${n.calls} reads=${n.reads} left@60s=${n.leftAt60} left@80s=${n.left}`);
    if (closeMs !== null && (n.reads > o.reads || n.tasks > o.tasks)) worse = true;
    if (n.left !== 0) worse = true;
  }
  for (const r of rows) info("K7", r);
  chk("K7", "fix: no more after() registrations and no more drains than bd435157 when tasks start; every row drained in every pattern (incl. tasks that never start)", !worse, rows.join(" ‖ "));
});

// ── K9 two module instances share one state ──
console.log("\n── K9 two module instances (duplicated bundles) share one state ──");
await sub("K9", async () => {
  if (!NEW_B) return info("K9", "skipped (second instance not loadable)");
  info("K9", `distinct module objects: ${NEW_B !== NEW && NEW_B.scheduleCoalescedDrain !== NEW.scheduleCoalescedDrain}`);
  reset();
  const w = world();
  w.holdNextRun();
  w.pending.add(60);
  NEW.scheduleCoalescedDrain(w.run); // out of request · copy A starts D1 (held)
  await flush();
  w.pending.add(61);
  for (let i = 0; i < 5; i += 1) NEW_B.scheduleCoalescedDrain(w.run); // copy B wakes during D1
  w.release();
  await flush(30);
  chk("K9", "wakes from a second module instance during a drain of the first ⇒ one queued re-run (shared state), every row drained", NEW_B !== NEW && NEW_B.scheduleCoalescedDrain !== NEW.scheduleCoalescedDrain && w.pending.size === 0 && w.reads === 2, `distinct=${NEW_B !== NEW} reads=${w.reads} pending=${JSON.stringify([...w.pending])}`);
});

// ── K10 state left by the bd435157 module (hot reload / mixed deploy in dev) ──
console.log("\n── K10 PENDING_KEY holding the old number shape ──");
await sub("K10", async () => {
  reset();
  holder[PENDING_KEY] = Date.now(); // what bd435157 stored
  const w = world();
  w.pending.add(70);
  let threw = false;
  let tasks = 0;
  try {
    tasks = request(() => NEW.scheduleCoalescedDrain(w.run), 10);
  } catch {
    threw = true;
  }
  await advance(200);
  chk("K10", "an old-shape PENDING_KEY (number) does not suppress or crash a wake", !threw && tasks === 1 && w.pending.size === 0, `threw=${threw} tasks=${tasks} pending=${w.pending.size}`);
});

// ── K11 wall clock jumps backwards (NTP) ──
console.log("\n── K11 Date.now jumps back 1 h right after a registration whose task never starts ──");
await sub("K11", async () => {
  reset();
  const w = world();
  w.pending.add(80);
  request(() => NEW.scheduleCoalescedDrain(w.run), null);
  const realNow = Date.now;
  Date.now = () => realNow() - 3_600_000;
  try {
    w.pending.add(81);
    const t2 = request(() => NEW.scheduleCoalescedDrain(w.run), null); // coalesced (registration looks 'young' for an hour)
    await advance(3_500);
    chk("K11", "a backwards clock jump cannot extend the blackout: the monotonic fallback timer still starts the drain ≤ 3.5 s", w.pending.size === 0, `second request tasks=${t2} pending=${JSON.stringify([...w.pending])} reads=${w.reads}`);
    const w2 = world();
    w2.pending.add(82);
    const t3 = request(() => NEW.scheduleCoalescedDrain(w2.run), null);
    await advance(3_500);
    info("K11", `after the jump, a new wake registers ${t3} task(s) and is drained=${w2.pending.size === 0}`);
  } finally {
    Date.now = realNow;
  }
  info("K11", "bd435157 under the same jump: `Date.now() - since < 15000` stays true for 1 h ⇒ every wake in the instance is swallowed for an hour (reasoning; not run)");
});

// ── K12 warning throttle ──
console.log("\n── K12 fallback warning: at most one line per minute ──");
await sub("K12", async () => {
  reset();
  const warn = console.warn;
  const lines: string[] = [];
  console.warn = (...a: unknown[]) => {
    lines.push(a.map(String).join(" "));
  };
  try {
    holder[STATE_KEY] = undefined;
    const w = world();
    for (let i = 0; i < 12; i += 1) {
      request(() => NEW.scheduleCoalescedDrain(w.run), null);
      await advance(5_000, 500);
    } // 60 s of never-starting tasks
    const in60 = lines.length;
    for (let i = 0; i < 3; i += 1) {
      request(() => NEW.scheduleCoalescedDrain(w.run), null);
      await advance(5_000, 500);
    }
    chk("K12", "fallback warnings: 1 line in the first minute (12 fallbacks), a second one after 60 s", in60 === 1 && lines.length === 2 && /\[after-drain\] fallback drain/.test(lines[0] ?? ""), `first minute=${in60} total=${lines.length} · ${String(lines[0] ?? "").slice(0, 120)}`);
  } finally {
    console.warn = warn;
  }
});

// ── K13 N9 ──
console.log("\n── K13 N9: what the after() task returns ──");
await sub("K13", async () => {
  reset();
  const w = world({ drainMs: 1_000 });
  w.pending.add(90);
  const out = { results: [] as Any[], tasks: 0 };
  request(() => NEW.scheduleCoalescedDrain(w.run), 10, out);
  await advance(60, 10);
  const s = settledFlag(out.results[0]);
  await advance(500, 50);
  const mid = s.done;
  await advance(1_000);
  chk("K13.1", "normal path: the after() task returns a promise that is still pending while the drain runs and settles when it ends (waitUntil covers the drain)", !mid && s.done && w.pending.size === 0, `settled mid-drain=${mid} settled after=${s.done}`);
  reset();
  const w2 = world({ drainMs: 4_000 });
  w2.pending.add(91);
  const out2 = { results: [] as Any[], tasks: 0 };
  request(() => NEW.scheduleCoalescedDrain(w2.run), 5_000, out2); // fallback starts the drain at 3 s, the task arrives at 5 s
  await advance(5_050, 50);
  const s2 = settledFlag(out2.results[0]);
  await advance(500, 50);
  const mid2 = s2.done;
  await advance(3_000);
  chk("K13.2", "slow path: the late after() task returns the fallback drain's promise (pending until that drain ends) — waitUntil covers the rest of the drain", !mid2 && s2.done && w2.calls === 1, `settled mid=${mid2} after=${s2.done} run() calls=${w2.calls}`);
  info("K13", "never path: nothing awaits the fallback drain (no after() task ever runs) — it is a floating promise; see review RV15 on frozen instances");
});

// ── K14 out of request: no timer, immediate ──
console.log("\n── K14 out of request ──");
await sub("K14", async () => {
  reset();
  resetTimerStats();
  const w = world();
  w.holdNextRun();
  w.pending.add(95);
  NEW.scheduleCoalescedDrain(w.run);
  const immediate = w.calls;
  w.pending.add(96);
  NEW.scheduleCoalescedDrain(w.run);
  NEW.scheduleCoalescedDrain(w.run);
  NEW.scheduleCoalescedDrain(w.run);
  await flush();
  w.release();
  await flush(30);
  chk("K14", "out of request: drain requested synchronously, NO fallback timer created, wakes during it ⇒ one queued re-run, every row drained", immediate === 1 && timersCreated === 0 && w.pending.size === 0 && w.reads === 2, `immediate=${immediate} timers=${timersCreated} reads=${w.reads} pending=${w.pending.size}`);
  reset();
  const wo = world();
  wo.holdNextRun();
  OLD.scheduleCoalescedDrain(wo.run);
  OLD.scheduleCoalescedDrain(wo.run);
  OLD.scheduleCoalescedDrain(wo.run);
  OLD.scheduleCoalescedDrain(wo.run);
  await flush();
  wo.release();
  await flush(30);
  info("K14", `bd435157 same pattern: run() calls=${wo.calls} reads=${wo.reads} (fix: run() calls=${w.calls} reads=${w.reads})`);
});

// ── K16 re-entrant wake from inside a drain (a consumer that wakes, e.g. chat sendReply → scheduleDrain) ──
console.log("\n── K16 re-entrant wake from inside a running drain ──");
await sub("K16", async () => {
  reset();
  const w = world();
  let wakesLeft = 3;
  const reentrant = async () => {
    const r = w.run();
    if (wakesLeft > 0) {
      wakesLeft -= 1;
      w.pending.add(200 + wakesLeft);
      NEW.scheduleCoalescedDrain(reentrant); // synchronously, inside run()
    }
    await r;
    if (wakesLeft > 0) {
      wakesLeft -= 1;
      w.pending.add(300 + wakesLeft);
      NEW.scheduleCoalescedDrain(reentrant); // asynchronously, at the end of the drain
    }
  };
  w.pending.add(199);
  request(() => NEW.scheduleCoalescedDrain(reentrant), 10);
  await advance(10_000);
  chk("K16", "wakes made from inside a drain terminate (no runaway loop) and every row is drained", w.pending.size === 0 && w.calls <= 6, `run() calls=${w.calls} reads=${w.reads} pending=${JSON.stringify([...w.pending])}`);
});

// ── K17 nested after(): a registration made while Next's after-queue is already running ──
console.log("\n── K17 registration while the scope's after() queue is already running (Next's real AfterContext) ──");
await sub("K17", async () => {
  const nextAfter = (await import("next/dist/server/after/after-context.js" as string)) as Any;
  const { EventEmitter } = await import("node:events");
  reset();
  resetTimerStats();
  const res = new EventEmitter();
  const ctxA = new nextAfter.AfterContext({ waitUntil: () => undefined, onClose: (cb: () => void) => res.on("close", cb), onTaskError: () => undefined });
  const store = { route: "/p", page: "/p/page", incrementalCache: {}, pendingRevalidatedTags: [], afterContext: ctxA };
  const w = world();
  w.pending.add(170);
  let syncStart = -1;
  let liveRight = -1;
  await new Promise<void>((done) => {
    nextWork.workAsyncStorage.run(store, () => {
      ctxA.after(async () => {
        // inside a running after() task (e.g. a consumer that wakes): the queue is started ⇒ Next runs a new callback synchronously
        const before = w.calls;
        NEW.scheduleCoalescedDrain(w.run);
        syncStart = w.calls - before;
        liveRight = live.size;
        done();
      });
    });
    res.emit("close");
  });
  await flush(20);
  await advance(3_500);
  chk("K17", "a registration whose after() callback Next runs synchronously still drains exactly once; the timer armed after it is harmless", w.pending.size === 0 && w.calls === 1, `drain started synchronously inside after()=${syncStart === 1} · live timers right after the call=${liveRight} · run() calls after 3.5 s=${w.calls}`);
  info("K17", `stray fallback timer in this path: ${liveRight > 0 ? "YES — armed after the task already started (fires 3 s later, returns early, no drain, no warning)" : "no"}`);
});

mock.timers.reset();
rmSync(OLD_FILE, { force: true });
rmSync(COPY_FILE, { force: true });
const ok = cks.filter((c) => c.ok).length;
console.log(`\nREVIEW checks ${ok}/${cks.length} green`);
console.log(`JSON_SUMMARY ${JSON.stringify(cks.map((c) => [c.id, c.ok]))}`);
process.exit(ok === cks.length ? 0 : 1);

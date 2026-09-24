// QC — CRM v2 WO C0.5: the minute-job dispatcher (decision C16 as revised by RESOLUTIONS R-C.6)
// Oracle writer · the C0.5 builder must NOT touch this file · QC database only (.env.qc)
// Run: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c0.5.mts
// requires: crm-seed   (house style — this oracle reads NO seeded business row; it creates only its own tagged rows)
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// WHAT THIS FILE PROVES (brief: ledger/crm-briefs/crm-brief-C0.5.md + its "Controller addendum 2026-09-18";
//                        RESOLUTIONS R-C.6; MASTER-PLAN §4 X5)
//
//   S0  structure — exports · the route call site sits AFTER the drain inside its own try/catch ·
//       `crm.heartbeat` every 5 min · no vercel.json entry / no /api/cron/crm route (R-C.6).
//   S4  the runner `scripts/crm-cron.mts minute|hourly|daily` — R-C.6 makes it the ONLY real path to
//       production, so it is EXECUTED: an unknown mode exits non-zero, and `minute` really reaches
//       `runMinuteJobs` (a probe job registered in the same process runs; heartbeat gets a fresh run).
//   S2  isolation — through the REAL route handler (`POST` imported and called): with a throwing job
//       registered the response is BYTE-IDENTICAL to the response without it, the jobs on both sides of
//       the thrower still run, the failure is recorded (OpsEvent + status reader). Plus the library
//       itself: async throw · synchronous throw · `throw "string"` · `reject(undefined)` · a 50 000-char error.
//   S1  due / not-due — the clock is ALWAYS the `now` argument (never a sleep, never the wall clock);
//       aligned and deliberately mid-window start instants, boundaries avoided by ±1 s.
//   S3  budget ≤ 20 s — a dispatcher that trusts its jobs to honour `budgetMs` is caught by two jobs
//       that ignore it (60 s → 10 min each): the call must still return in ≤ 22.5 s, the job queued
//       behind them must run exactly once across this tick and the next, the cut-off jobs must NOT be
//       recorded as successes, and a sequential dispatcher must hand later jobs the REMAINING budget.
//   X5  claiming timed work — overlap: 10 concurrent in-process calls × 3 rounds, and 4 SEPARATE
//       PROCESSES × 3 calls × 2 rounds (released together by a DB signal), each due job runs EXACTLY once;
//       12 distinct jobs finishing together in 4 processes lose no "last run" (lost-update on a shared
//       JSON map) · in-flight: while another process is still running a job, a later tick (schedule says
//       due) must not start a second copy, and a hanging job must not block other jobs (per-job lease,
//       not a global lock) · crash: two worker processes take the lease and SIGKILL themselves mid-job;
//       the 60-minute job MUST run again by now+16 min, exactly once, and the crashed attempt must not be
//       reported as a success. A dispatcher that claims by writing "last run = now" up front (member
//       audit M7/H6) passes every overlap check and fails X5.4/X5.5 — that is what they are for.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// CONTRACT THIS ORACLE ASSUMES (beyond the brief — the controller confirms these in the addendum)
//   K1  `runMinuteJobs(now)` treats `now` as THE clock for due-ness AND for lease expiry. (Otherwise a
//       15-minute lease cannot be tested without sleeping 15 minutes, and every C2 job would inherit an
//       untestable clock.) The dispatcher hands the same `now` to `run(now, budgetMs)`.
//   K2  minute-jobs.ts exports a status reader `getMinuteJobStatus(names?: string[])` (aliases accepted:
//       listMinuteJobStatus · minuteJobStatus · getMinuteJobStates · readMinuteJobStatus · listMinuteJobs)
//       returning rows (or a name-keyed map) with `name`, `everyMinutes`, `lastRunAt` = when the last
//       attempt FINISHED, `lastOkAt` = when the last SUCCESSFUL attempt finished, `lastError` (≤ 4000 chars).
//       Field aliases tolerated: lastFinishedAt/lastSuccessAt/error. This is the "readable by a later
//       integrations page" of the brief.
//   K3  the outbox route's JSON body carries NO minute-job summary (S2 compares bytes).
//   K4  lease ≤ 15 minutes (MASTER-PLAN §4 X5) — measured through K1.
//
// X-GROUPS (D3)
//   X1 scope — n/a: platform code, no tenant data is read or written (the cron secret gate is S2.1).
//   X2 keys/AI — n/a: no op, no tool.   X3 races — covered by X5.1–X5.3 (same code paths).
//   X4 redelivery — n/a: no outbox consumer.   X5 — this file.   X6 dangerous input — n/a: no user input.
//   X7 public endpoint — the only one is the existing cron route: unauthorised ⇒ 401 and NO job runs (S2.1).
//   X8 PDPA — the dispatcher writes only job names + error text; a job's error text is the job author's
//             responsibility (C2 oracles). S2.9 bounds its size.   X9 — n/a: no user mutation.
//   X10 secrets — the 401 body must not echo the secret (S2.1).
//
// HOUSE RULES HONOURED (crm-brief-COMMON.md §"Oracle house style")
//   1) SKIP guard — `src/lib/platform/minute-jobs.ts` absent ⇒ SKIPPED + JSON_SUMMARY {skipped:true} + exit 0,
//      no DB connection opened.
//   2) chk(id, title, ok, expected, actual, sev) with ids `C0.5-S<g>.<n>` / `C0.5-X5.<n>`.
//   3) every row this file creates carries TAG `qc-c05-<rand>` (job names, OpsEvent probe/signal rows,
//      whatever the dispatcher persists for those job names). `finally` removes them — including state rows
//      in whichever table the dispatcher chose (discovered, not assumed; shared JSON maps are scrubbed key by
//      key with compare-and-swap, never overwritten). C0.5-CLEAN proves nothing carrying TAG is left.
//      The shared job `crm.heartbeat` is never asserted on beyond "it ran"; synthetic clocks are hours in
//      the PAST so no shared state is pushed into the future.
//   4) cross-process races re-invoke THIS file with `--c05-worker <base64 json>` (same technique as
//      qc-crm-c0.3 X3.3), synchronised through signal rows in OpsEvent (stdin does not survive `pnpm exec`).
//   5) modules that may not exist yet are imported with `await import("…" as string)`. Last line = JSON_SUMMARY.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, writeSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MOD_FILE = "src/lib/platform/minute-jobs.ts";
const MOD_SPEC = "@/lib/platform/minute-jobs";
const RUNNER_FILE = "scripts/crm-cron.mts";
const ROUTE_FILE = "src/app/api/cron/outbox/route.ts";
const ROUTE_SPEC = "@/app/api/cron/outbox/route";
const SELF = "scripts/qc-crm-c0.5.mts";
const PROBE_SRC = "qc-c05-probe"; // OpsEvent.source of "this job ran" markers written by jobs in ANY process
const SIG_SRC = "qc-c05-signal"; // OpsEvent.source of parent → worker signals (GO / DIE)
const BUDGET_MS = 20_000;
const MIN = 60_000;

const ARGV = process.argv.slice(2);
const WORKER_AT = ARGV.indexOf("--c05-worker");

// ═══════════════════════════════════════════════════════════════════════════════════
// SKIP guard (rule 1) — no DB connection above this line.
// ═══════════════════════════════════════════════════════════════════════════════════
if (WORKER_AT < 0 && !existsSync(MOD_FILE)) {
  console.log(`⚠️  SKIPPED — WO C0.5 not built yet (${MOD_FILE} does not exist)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
// every child (workers AND the runner under test) inherits these: QC env file, and no owner alert e-mails
// for the failures this file provokes on purpose (logOps ERROR would mail OPS_ALERT_EMAIL).
// ORACLE-EDIT C0.5-S4.4 / S4.5a / S4.5b (controller · 23 ก.ย. 2569): บรรทัดนี้เคยตั้งตายตัวเป็น ".env.qc" (QC1)
//   ⇒ เวลารันบน QC2/QC3 (ผ่าน scripts/qc2.sh / qc3.sh) ลูกที่ถูก spawn จะได้ไฟล์ env ของ QC1 แต่ได้ DATABASE_URL ของ QC2/QC3
//   ด่านกันพลาดใน scripts/crm-cron.mts (ของใบ C0.5 เอง) เห็นสองค่าไม่ตรงกันจึงปฏิเสธแล้ว exit 4 = แดงทุกใบที่รันบนฐานที่สอง/สาม
//   แก้: เคารพค่าที่ผู้เรียกตั้งมาแล้ว ถ้าไม่มีค่อย default เป็น QC1 (พฤติกรรมเดิมทุกไบต์เมื่อรันบน QC1)
process.env.QC_ENV_FILE = process.env.QC_ENV_FILE || ".env.qc";
delete process.env.OPS_ALERT_EMAIL;

const out = (s: string) => {
  try {
    writeSync(1, `${s}\n`);
  } catch {
    /* closed pipe */
  }
};
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** a timer that does NOT keep the process alive — for jobs that must hang */
const hang = (ms: number) =>
  new Promise<void>((r) => {
    const t = setTimeout(r, ms);
    (t as Any).unref?.();
  });
const errText = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));
const cut = (s: string, n = 260) => (s.length > n ? `${s.slice(0, n)}…` : s);

// ═══════════════════════════════════════════════════════════════════════════════════
// WORKER MODE — this same file re-invoked as a child process. Each worker = its own process, its own
// PrismaClient, its own pool, its own copy of the job registry (an in-process mutex cannot help it).
//   race   : register jobs (probe = write one marker row per run) → READY → for each round wait for the
//            signal `${tag}|GO|<round>` = "<atMs> <nowMs>" → sleep until atMs → fire `calls` concurrent
//            runMinuteJobs(new Date(nowMs)) → "C05DONE <round> [...]"
//   crash  : register ONE hanging job → READY → wait `${tag}|GO-CRASH` → runMinuteJobs(now) (not awaited) →
//            the job prints C05CLAIMED and never returns → on `${tag}|DIE|<name>` the process SIGKILLs itself
//            (no finally, no graceful disconnect — a real crash after the claim)
//   runner : register a probe job, then import scripts/crm-cron.mts with argv `<mode>` — proves the
//            runner reaches runMinuteJobs of the SAME module instance (R-C.6: the only path to production)
// ═══════════════════════════════════════════════════════════════════════════════════
if (WORKER_AT >= 0) {
  const cfg = JSON.parse(Buffer.from(ARGV[WORKER_AT + 1] ?? "", "base64url").toString("utf8")) as {
    mode: "race" | "crash" | "runner";
    tag: string;
    jobs: { name: string; every: number; kind: "probe" | "hang" }[];
    calls?: number;
    rounds?: number;
    now?: number;
    runnerMode?: string;
  };
  const suicide = setTimeout(() => process.exit(3), 240_000); // never outlive the parent's patience
  const { prisma: wp } = (await import("@/lib/core/db")) as Any;
  const WJ = (await import(MOD_SPEC as string)) as Any;
  const sigWait = async (key: string, maxMs: number): Promise<string | null> => {
    const t = Date.now();
    while (Date.now() - t < maxMs) {
      const r = await wp.opsEvent.findFirst({ where: { source: SIG_SRC, message: key }, select: { detail: true } }).catch(() => null);
      if (r) return String(r.detail ?? "");
      await wait(60);
    }
    return null;
  };
  for (const j of cfg.jobs) {
    WJ.registerMinuteJob({
      name: j.name,
      everyMinutes: j.every,
      run:
        j.kind === "hang"
          ? async () => {
              out(`C05CLAIMED ${j.name}`);
              await new Promise<void>(() => {});
            }
          : async () => {
              await wp.opsEvent.create({ data: { level: "INFO", source: PROBE_SRC, message: `${j.name}|run`, detail: `pid=${process.pid}` } });
            },
    });
  }
  if (cfg.mode === "runner") {
    out("C05RUNNER-START");
    process.argv = [process.argv[0], resolve(RUNNER_FILE), cfg.runnerMode ?? "minute"];
    await import(pathToFileURL(resolve(RUNNER_FILE)).href);
    out("C05RUNNER-RETURNED"); // the runner did not call process.exit itself — still acceptable
    await wp.$disconnect();
    process.exit(0);
  } else if (cfg.mode === "crash") {
    out("C05READY");
    const go = await sigWait(`${cfg.tag}|GO-CRASH`, 200_000);
    if (go === null) process.exit(4);
    void Promise.resolve()
      .then(() => WJ.runMinuteJobs(new Date(cfg.now ?? Date.now())))
      .catch(() => {});
    const die = await sigWait(`${cfg.tag}|DIE|${cfg.jobs[0]?.name ?? ""}`, 200_000);
    out(`C05DYING ${die === null ? "timeout" : "signal"}`);
    process.kill(process.pid, "SIGKILL");
    await new Promise<void>(() => {});
  } else {
    out("C05READY");
    for (let round = 1; round <= (cfg.rounds ?? 1); round += 1) {
      const d = await sigWait(`${cfg.tag}|GO|${round}`, 200_000);
      if (d === null) break;
      const [atMs, nowMs] = d.split(" ").map(Number);
      const w = atMs - Date.now();
      if (w > 0) await wait(w);
      const r = await Promise.all(
        Array.from({ length: cfg.calls ?? 1 }, () =>
          Promise.resolve()
            .then(() => WJ.runMinuteJobs(new Date(nowMs)))
            .then(
              () => "ok",
              (e: unknown) => `ERR:${errText(e)}`,
            ),
        ),
      );
      out(`C05DONE ${round} ${JSON.stringify(r)}`);
    }
    clearTimeout(suicide);
    await wp.$disconnect();
    process.exit(0);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════
// PARENT (the oracle proper) — order: S0 → S4 runner → S2 route → X5 crash → S1 → X5 overlap → S2 library → S3
//   (the route and the crash workers run while the in-process registry is still small; S3 leaves hanging
//   promises behind, so it goes last)
// ═══════════════════════════════════════════════════════════════════════════════════
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const UNPROVEN: string[] = [];
const INFO: Record<string, string> = {};
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");

const rand = randomBytes(4).toString("hex").slice(0, 6);
const TAG = `qc-c05-${rand}`;
const J = (kind: string) => `${TAG}.${kind}`; // every job name carries the tag
// Synthetic clock: an hour boundary THREE HOURS IN THE PAST (aligned to 1/5/60-minute windows, so the
// "interval" and the "aligned window" due-models agree wherever this file asserts; nothing is pushed
// into the future for the shared `crm.heartbeat`).
const BASE = Math.floor(Date.now() / (60 * MIN)) * (60 * MIN) - 3 * 60 * MIN;
const T0_WALL = new Date(Date.now() - 120_000);
console.log(`QC DB ${host} · TAG ${TAG} · synthetic BASE ${new Date(BASE).toISOString()}`);

let MJ: Any = null;
let MOD_ERR = "";
try {
  MJ = await import(MOD_SPEC as string);
} catch (e) {
  MOD_ERR = errText(e);
}

// ─────────── in-process job registry wrapper ───────────
type Beh = (now: Date, budgetMs: number) => unknown;
const BEH = new Map<string, Beh>();
const RUNS = new Map<string, { now: number; budget: number; at: number }[]>();
const REGISTERED: string[] = [];
const noteRun = (name: string, now: unknown, budget: unknown) => {
  const a = RUNS.get(name) ?? [];
  a.push({ now: now instanceof Date ? now.getTime() : Number.NaN, budget: typeof budget === "number" ? budget : Number.NaN, at: Date.now() });
  RUNS.set(name, a);
};
const count = (name: string) => RUNS.get(name)?.length ?? 0;
const counter = (name: string): Beh => async (now, b) => {
  noteRun(name, now, b);
};
const prober = (name: string): Beh => async () => {
  await P.opsEvent.create({ data: { level: "INFO", source: PROBE_SRC, message: `${name}|run`, detail: `pid=${process.pid}` } });
};
/** register a job whose behaviour can be swapped (or retired to a no-op) after its check is done */
function reg(name: string, every: number, beh?: Beh): string {
  REGISTERED.push(name);
  if (beh) BEH.set(name, beh);
  MJ.registerMinuteJob({
    name,
    everyMinutes: every,
    // deliberately NOT async: a behaviour that throws synchronously must throw out of run() itself
    run: (now: Date, budgetMs: number) => {
      const f = BEH.get(name);
      return f ? f(now, budgetMs) : Promise.resolve();
    },
  });
  return name;
}
const retire = (...names: string[]) => names.forEach((n) => BEH.delete(n));

/** one dispatcher tick with a synthetic clock; a hanging dispatcher is measured, not waited for forever */
async function tick(nowMs: number, capMs = 60_000): Promise<{ ms: number; err: string; timedOut: boolean }> {
  const t = Date.now();
  let to: ReturnType<typeof setTimeout> | undefined;
  const r = await Promise.race([
    Promise.resolve()
      .then(() => MJ.runMinuteJobs(new Date(nowMs)))
      .then(
        () => ({ err: "", timedOut: false }),
        (e: unknown) => ({ err: errText(e), timedOut: false }),
      ),
    new Promise<{ err: string; timedOut: boolean }>((res) => {
      to = setTimeout(() => res({ err: "TIMEOUT", timedOut: true }), capMs);
    }),
  ]);
  if (to) clearTimeout(to);
  return { ...r, ms: Date.now() - t };
}
const markers = async (name: string): Promise<number> =>
  Number(await P.opsEvent.count({ where: { source: PROBE_SRC, message: `${name}|run` } }));
/** OpsEvent rows the DISPATCHER wrote about one of our jobs (probe/signal rows excluded) */
const opsFor = async (name: string): Promise<Any[]> =>
  (await P.opsEvent.findMany({
    where: {
      createdAt: { gte: new Date(T0_WALL.getTime() - 60_000) },
      source: { notIn: [PROBE_SRC, SIG_SRC] },
      OR: [{ message: { contains: name } }, { detail: { contains: name } }],
    },
    orderBy: { createdAt: "asc" },
  })) as Any[];
const signal = async (key: string, detail = "") =>
  P.opsEvent.create({ data: { level: "INFO", source: SIG_SRC, message: key, detail } });

// ─────────── status reader (contract K2) ───────────
const STATUS_NAMES = ["getMinuteJobStatus", "listMinuteJobStatus", "minuteJobStatus", "getMinuteJobStates", "readMinuteJobStatus", "listMinuteJobs"];
const statusFnName = MJ ? (STATUS_NAMES.find((n) => typeof MJ?.[n] === "function") ?? null) : null;
type St = { name: string; lastRunAt: number | null; lastOkAt: number | null; lastError: string | null; everyMinutes: number | null };
const toMs = (v: Any): number | null => {
  if (v === null || v === undefined || v === false) return null;
  const n = (v instanceof Date ? v : new Date(v)).getTime();
  return Number.isFinite(n) ? n : null;
};
const pick = (o: Any, keys: string[]): Any => {
  for (const k of keys) if (o && o[k] !== undefined) return o[k];
  return undefined;
};
const OK_KEYS = ["lastOkAt", "lastSuccessAt", "lastSucceededAt", "okAt"];
async function status(names?: string[]): Promise<Map<string, St> | null> {
  if (!statusFnName) return null;
  let r: Any;
  try {
    r = await MJ[statusFnName](names);
  } catch {
    try {
      r = await MJ[statusFnName]();
    } catch {
      return null;
    }
  }
  const rows: Any[] = Array.isArray(r)
    ? r
    : r && typeof r === "object"
      ? Object.entries(r).map(([k, v]) => ({ name: k, ...(v && typeof v === "object" ? (v as Any) : {}) }))
      : [];
  const m = new Map<string, St>();
  for (const row of rows) {
    const name = String(pick(row, ["name", "job", "key"]) ?? "");
    if (!name) continue;
    const lastRunAt = toMs(pick(row, ["lastRunAt", "lastFinishedAt", "lastEndedAt", "finishedAt", "lastRun"]));
    let lastOkAt = toMs(pick(row, OK_KEYS));
    if (pick(row, OK_KEYS) === undefined && pick(row, ["ok", "lastOk", "succeeded"]) === true) lastOkAt = lastRunAt;
    const le = pick(row, ["lastError", "error", "lastErrorMessage"]);
    m.set(name, {
      name,
      lastRunAt,
      lastOkAt,
      lastError: le === null || le === undefined ? null : typeof le === "string" ? le : JSON.stringify(le),
      everyMinutes: typeof row.everyMinutes === "number" ? row.everyMinutes : null,
    });
  }
  return m;
}
const stTxt = (s: St | undefined) =>
  s ? `run=${s.lastRunAt ? new Date(s.lastRunAt).toISOString() : "null"} ok=${s.lastOkAt ? new Date(s.lastOkAt).toISOString() : "null"} err=${s.lastError ? cut(s.lastError, 60) : "null"}` : "(no row)";
let READER_OK = false; // positive control (C0.5-S0.9): the reader reports lastOkAt for a job that DID succeed

// ─────────── child processes ───────────
type Kid = { ch: ChildProcess; out: string; code: number | null; closed: Promise<number | null> };
function kid(args: string[]): Kid {
  const ch = spawn("pnpm", ["exec", "tsx", ...args], { env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  const k: Kid = { ch, out: "", code: null, closed: Promise.resolve(null) };
  ch.stdout?.on("data", (d: Buffer) => {
    k.out += String(d);
  });
  ch.stderr?.on("data", (d: Buffer) => {
    k.out += String(d);
  });
  const to = setTimeout(() => {
    try {
      ch.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  }, 300_000);
  k.closed = new Promise((res) => {
    ch.on("close", (code) => {
      clearTimeout(to);
      k.code = code ?? -9; // killed by a signal (the crash workers SIGKILL themselves)
      res(k.code);
    });
    ch.on("error", () => {
      clearTimeout(to);
      k.code = -1;
      res(-1);
    });
  });
  return k;
}
const worker = (cfg: object) => kid([SELF, "--c05-worker", Buffer.from(JSON.stringify(cfg), "utf8").toString("base64url")]);
async function until(pred: () => boolean, ms: number): Promise<boolean> {
  const t = Date.now();
  while (Date.now() - t < ms) {
    if (pred()) return true;
    await wait(100);
  }
  return pred();
}

// ─────────── state-store discovery (for S2.11 + cleanup) ───────────
// The brief leaves the store open (ChatRateBucket-style upsert · advisory lock · a small JSON row). The
// oracle does not assume one: it looks for our TAG in text/json columns of every table whose name could
// plausibly hold job state. OpsEvent is handled separately.
const CAND = /job|lock|lease|cron|bucket|state|kv|setting|config|task|schedule|minute|platform|rate|idempot|marker|flag|heartbeat|meta/i;
type Loc = { table: string; column: string; type: string; n: number };
async function locate(): Promise<Loc[]> {
  const cols = (await P.$queryRawUnsafe(
    `SELECT table_name, column_name, data_type FROM information_schema.columns
      WHERE table_schema='public' AND data_type IN ('text','character varying','jsonb','json')`,
  ).catch(() => [])) as Any[];
  const found: Loc[] = [];
  for (const c of cols) {
    const t = String(c.table_name);
    const col = String(c.column_name);
    if (!CAND.test(t) || t === "OpsEvent" || !/^[A-Za-z0-9_]+$/.test(t) || !/^[A-Za-z0-9_]+$/.test(col)) continue;
    const expr = String(c.data_type).startsWith("json") ? `"${col}"::text` : `"${col}"`;
    const rows = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE ${expr} LIKE $1`, `%${TAG}%`).catch(() => [{ n: 0 }])) as Any[];
    const n = Number(rows?.[0]?.n ?? 0);
    if (n > 0) found.push({ table: t, column: col, type: String(c.data_type), n });
  }
  return found;
}
const stripTag = (v: Any): Any =>
  Array.isArray(v)
    ? v
        .filter((x) => !(typeof x === "string" && x.includes(TAG)))
        .filter((x) => !(x && typeof x === "object" && Object.values(x).some((y) => typeof y === "string" && y.includes(TAG))))
        .map(stripTag)
    : v && typeof v === "object"
      ? Object.fromEntries(Object.entries(v).filter(([k]) => !k.includes(TAG)).map(([k, x]) => [k, stripTag(x)]))
      : v;
/** remove our traces from one location without touching anybody else's state */
async function scrub(l: Loc): Promise<string> {
  const isJson = l.type.startsWith("json");
  const expr = isJson ? `"${l.column}"::text` : `"${l.column}"`;
  const rows = (await P.$queryRawUnsafe(`SELECT "id"::text AS id, ${expr} AS v FROM "${l.table}" WHERE ${expr} LIKE $1`, `%${TAG}%`).catch(() => null)) as Any[] | null;
  if (rows === null) {
    // no "id" column — only whole-row deletion is possible, and only for short (single-job) values
    const n = await P.$executeRawUnsafe(`DELETE FROM "${l.table}" WHERE ${expr} LIKE $1 AND length(${expr}) <= 300`, `%${TAG}%`).catch(() => -1);
    return `${l.table}.${l.column}: deleted ${n} (no id column)`;
  }
  let del = 0;
  let upd = 0;
  let fail = 0;
  for (const r of rows) {
    const text = String(r.v ?? "");
    let parsed: Any = undefined;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }
    const shared = parsed !== undefined && parsed !== null && typeof parsed === "object" && (isJson || text.length > 300);
    if (!shared) {
      const n = Number(await P.$executeRawUnsafe(`DELETE FROM "${l.table}" WHERE "id"::text = $1`, r.id).catch(() => 0));
      if (n > 0) del += n;
      else fail += 1;
      continue;
    }
    // shared JSON (a map of every job's state): strip our keys, compare-and-swap so a concurrent writer is never clobbered
    let ok = false;
    for (let attempt = 0; attempt < 5 && !ok; attempt += 1) {
      const curRows = (await P.$queryRawUnsafe(`SELECT ${expr} AS v FROM "${l.table}" WHERE "id"::text = $1`, r.id).catch(() => [])) as Any[];
      const cur = String(curRows?.[0]?.v ?? "");
      if (!cur.includes(TAG)) {
        ok = true;
        break;
      }
      const next = JSON.stringify(stripTag(JSON.parse(cur)));
      const cast = l.type === "jsonb" ? "::jsonb" : l.type === "json" ? "::json" : "";
      const n = Number(
        await P.$executeRawUnsafe(`UPDATE "${l.table}" SET "${l.column}" = $1${cast} WHERE "id"::text = $2 AND ${expr} = $3`, next, r.id, cur).catch(() => 0),
      );
      ok = n > 0;
    }
    if (ok) upd += 1;
    else fail += 1;
  }
  return `${l.table}.${l.column}: deleted ${del} · scrubbed ${upd}${fail ? ` · FAILED ${fail}` : ""}`;
}

let dispatchMode = "unknown";
try {
  // ═════════════════════════════════════════════════════════════════════════════
  // ▓▓ S0 — structure ▓▓
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S0 · structure ──");
  const hasCore = !!MJ && typeof MJ.registerMinuteJob === "function" && typeof MJ.runMinuteJobs === "function";
  chk("C0.5-S0.1", "src/lib/platform/minute-jobs.ts exports registerMinuteJob() and runMinuteJobs() (brief · Deliverables)",
    hasCore, "both functions", MJ ? `exports: ${Object.keys(MJ).join(", ")}` : `import failed: ${cut(MOD_ERR)}`);
  chk("C0.5-S0.2", `the module exports a status reader (contract K2 — "readable by a later integrations page", brief) · found: ${statusFnName ?? "none"}`,
    !!statusFnName, STATUS_NAMES.join(" | "), statusFnName ?? "none", "MAJOR");

  const routeSrc = read(ROUTE_FILE);
  {
    const iDrain = routeSrc.indexOf("drainAll(");
    const iRun = routeSrc.indexOf("runMinuteJobs(");
    const tryAt = iRun >= 0 ? Math.max(-1, ...[...routeSrc.matchAll(/\btry\s*\{/g)].map((m) => m.index ?? -1).filter((i) => i < iRun)) : -1;
    const tryBody = tryAt >= 0 ? routeSrc.slice(tryAt, iRun) : "";
    const tail = iRun >= 0 ? routeSrc.slice(iRun) : "";
    const wrappedTry = tryAt > iDrain && !tryBody.includes("drainAll(") && /\}\s*catch\b/.test(tail);
    const wrappedCatch = /runMinuteJobs\([^)]*\)\s*\)?\s*\.catch\(/.test(routeSrc);
    chk("C0.5-S0.3", "the outbox route calls runMinuteJobs AFTER drainAll, inside its OWN try/catch (a catch that also swallows drainAll would change the route's result on a drain failure) and still answers `{ ok: true, ...result }`",
      iDrain >= 0 && iRun > iDrain && (wrappedTry || wrappedCatch) && /NextResponse\.json\(\s*\{\s*ok:\s*true,\s*\.\.\.result\s*\}\s*\)/.test(routeSrc),
      "drainAll(…) → try { runMinuteJobs(…) } catch", `drainAt=${iDrain} runAt=${iRun} try=${wrappedTry} .catch=${wrappedCatch}`, "MAJOR");
    chk("C0.5-S0.4", "…and the call is awaited (a floating promise is frozen the moment a serverless response ends — see scheduleDrain() in outbox-consumers.ts)",
      /await\s+runMinuteJobs\(/.test(routeSrc), "await runMinuteJobs(", cut(routeSrc.slice(Math.max(0, iRun - 40), iRun + 40)), "MINOR");
  }
  {
    const files: string[] = [];
    for (const root of ["src/lib", "src/app"]) {
      try {
        for (const f of readdirSync(root, { recursive: true }) as string[]) if (/\.(ts|tsx)$/.test(f)) files.push(join(root, f));
      } catch {
        /* missing root */
      }
    }
    const hits = files.filter((f) => {
      const s = read(f);
      const i = s.indexOf("crm.heartbeat");
      return i >= 0 && /everyMinutes\s*:\s*5\b/.test(s.slice(Math.max(0, i - 400), i + 400));
    });
    chk("C0.5-S0.5", "a no-op job `crm.heartbeat` is registered with everyMinutes: 5 (brief · Deliverables)",
      hits.length > 0, "registerMinuteJob({ name: \"crm.heartbeat\", everyMinutes: 5 … })", hits.join(", ") || "not found", "MAJOR");
  }
  {
    let crons: string[] = [];
    try {
      crons = ((JSON.parse(read("vercel.json")).crons ?? []) as Any[]).map((c) => String(c.path));
    } catch {
      crons = ["<unparseable>"];
    }
    const ok = crons.length === 2 && crons.includes("/api/cron/tick") && crons.includes("/api/cron/hourly") && !existsSync("src/app/api/cron/crm");
    chk("C0.5-S0.6", "RESOLUTIONS R-C.6: no vercel.json entry and no /api/cron/crm/* route were added (the VPS runner is the path to production)",
      ok, "crons = [/api/cron/tick, /api/cron/hourly] · no src/app/api/cron/crm", `${crons.join(", ")} · crmRoute=${existsSync("src/app/api/cron/crm")}`, "MAJOR");
  }
  {
    const src = read(MOD_FILE);
    chk("C0.5-S0.7", "the lease/claim site is marked `// AUDIT-CLASS X5:` (COMMON · Code rules)", /AUDIT-CLASS X5\b/.test(src), "marker present", "absent", "MINOR");
    chk("C0.5-S0.8", "no `any` in the new src file (COMMON · Code rules)", !/(:\s*any\b|\bas any\b|<any>)/.test(src), "no any", "found `any`", "MINOR");
  }

  if (!hasCore) throw new Error("STOP: registerMinuteJob/runMinuteJobs missing — nothing dynamic can be tested");
  {
    // positive control for every "NOT recorded as a success" check below (X5.7 · S3.5): the reader must
    // report a success when there was one — otherwise "lastOkAt is null" proves nothing
    const rc = reg(J("reader-control"), 1, counter(J("reader-control")));
    const r = await tick(BASE - 30 * MIN);
    const st = (await status([rc]))?.get(rc);
    READER_OK = count(rc) === 1 && !!st && st.lastRunAt !== null && st.lastOkAt !== null && !st.lastError;
    chk("C0.5-S0.9", "[positive control] after a job succeeds the status reader shows lastRunAt AND lastOkAt and no lastError (contract K2)",
      READER_OK, "run · ok · no error", `runs=${count(rc)} ${stTxt(st)} ${r.err ? cut(r.err, 80) : ""}`, "MAJOR");
    retire(rc);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // ▓▓ S4 — the runner scripts/crm-cron.mts (R-C.6: the only real path to production) ▓▓
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S4 · runner scripts/crm-cron.mts ──");
  const runnerSrc = read(RUNNER_FILE);
  {
    const modes = ["minute", "hourly", "daily"].filter((m) => new RegExp(`["'\`]${m}["'\`]`).test(runnerSrc));
    chk("C0.5-S4.1", "scripts/crm-cron.mts exists, knows the modes minute | hourly | daily and reaches runMinuteJobs (RESOLUTIONS R-C.6 · brief ⚠️)",
      runnerSrc.length > 0 && modes.length === 3 && runnerSrc.includes("runMinuteJobs"),
      "file · 3 mode literals · runMinuteJobs", runnerSrc ? `modes=[${modes.join(",")}] runMinuteJobs=${runnerSrc.includes("runMinuteJobs")}` : "file missing");
  }
  const runnerSafe = /QC_ENV_FILE/.test(runnerSrc);
  chk("C0.5-S4.2", "the runner loads its env like its pattern acc-v2-cron-recurring.mts: `process.env.QC_ENV_FILE ?? \".env\"` (otherwise QC cannot run it without reading production secrets — the oracle refuses to execute it)",
    runnerSafe, "QC_ENV_FILE honoured", runnerSrc ? "QC_ENV_FILE not referenced" : "file missing", "MAJOR");
  if (runnerSrc && runnerSafe) {
    const probe = J("s4-runner-probe");
    const kBogus = kid([RUNNER_FILE, "qc-c05-bogus-mode"]);
    const kWrap = worker({ mode: "runner", tag: TAG, runnerMode: "minute", jobs: [{ name: probe, every: 1, kind: "probe" }] });
    const kDirect = kid([RUNNER_FILE, "minute"]);
    const tStart = Date.now();
    const [cBogus, cWrap, cDirect] = await Promise.all([kBogus.closed, kWrap.closed, kDirect.closed]);
    chk("C0.5-S4.3", "an unknown mode is refused with a non-zero exit (a typo in the crontab must not silently do nothing)",
      cBogus !== 0 && cBogus !== null, "exit ≠ 0", `exit=${cBogus} · ${cut(kBogus.out.replace(/\s+/g, " "), 160)}`, "MAJOR");
    const probeRuns = await markers(probe);
    chk("C0.5-S4.4", "`crm-cron.mts minute` really dispatches: a job registered in the same process BEFORE the runner is loaded runs exactly once, exit 0 — proves the runner calls runMinuteJobs of the shared registry (not a stub, not a copy)",
      cWrap === 0 && probeRuns === 1, "exit 0 · probe ran once", `exit=${cWrap} probeRuns=${probeRuns} · ${cut(kWrap.out.replace(/\s+/g, " "), 200)}`);
    chk("C0.5-S4.5a", "`pnpm exec tsx scripts/crm-cron.mts minute` run standalone exits 0 (this is the line C6.1 will put in the VPS crontab)",
      cDirect === 0, "exit 0", `exit=${cDirect} · ${cut(kDirect.out.replace(/\s+/g, " "), 200)}`);
    const st = await status(["crm.heartbeat"]);
    const hb = st?.get("crm.heartbeat");
    chk("C0.5-S4.5b", "…and afterwards `crm.heartbeat` has a finished run no older than its 5-minute period — heartbeat is registered on the runner's import path, not only inside the route",
      !!hb && hb.lastRunAt !== null && hb.lastRunAt >= tStart - 5 * MIN - 90_000, `lastRunAt ≥ ${new Date(tStart - 5 * MIN).toISOString()}`, stTxt(hb), "MAJOR");
  } else {
    chk("C0.5-S4.4", "`crm-cron.mts minute` really dispatches (not executed — S4.1/S4.2 failed)", false, "runner runnable", "not executed");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // ▓▓ S2 — isolation through the REAL route handler ▓▓
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S2 · the outbox route (POST imported and called) ──");
  const SECRET = `qc-c05-cron-${randomBytes(16).toString("hex")}`;
  process.env.SHARK_CRON_SECRET = SECRET; // this process only; isCronAuthorized reads env per request
  let route: Any = null;
  try {
    route = await import(ROUTE_SPEC as string);
  } catch (e) {
    chk("C0.5-S2.0", "the route module imports in a script", false, "import ok", cut(errText(e)), "MAJOR");
  }
  const post = async (auth: boolean): Promise<{ status: number; body: string }> => {
    const res = (await route.POST(
      new Request("http://qc.local/api/cron/outbox", { method: "POST", headers: auth ? { authorization: `Bearer ${SECRET}` } : {} }),
    )) as Response;
    return { status: res.status, body: await res.text() };
  };
  if (route && typeof route.POST === "function") {
    {
      const un = reg(J("s2-unauth"), 1, counter(J("s2-unauth")));
      const r = await post(false);
      await wait(300);
      chk("C0.5-S2.1", "without the cron secret the route answers 401, runs NO job and does not echo the secret (X7/X10)",
        r.status === 401 && count(un) === 0 && !r.body.includes(SECRET), "401 · job not run", `status=${r.status} runs=${count(un)} body=${cut(r.body, 80)}`, "MAJOR");
      retire(un);
    }
    // baseline: the drain part of the body must be stable before bytes can be compared
    let base = await post(true);
    let stable = false;
    for (let i = 0; i < 5 && !stable; i += 1) {
      const again = await post(true);
      stable = again.status === base.status && again.body === base.body;
      base = again;
    }
    chk("C0.5-S2.2", "[positive control] two consecutive authorised calls WITHOUT a throwing job give identical bytes — otherwise S2.3 could not tell noise from damage",
      stable, "identical", cut(base.body, 120), "MAJOR");
    let same = false;
    let goodRan = false;
    let lastPair = "";
    let g1 = "";
    let th = "";
    const BOOM = `qc-c05-boom-${rand}`;
    for (let attempt = 1; attempt <= 3 && !(same && goodRan); attempt += 1) {
      const pre = await post(true);
      g1 = reg(J(`s2-good-a${attempt}`), 1, counter(J(`s2-good-a${attempt}`)));
      th = reg(J(`s2-throw-a${attempt}`), 1, async () => {
        throw new Error(`${BOOM} planted failure (attempt ${attempt})`);
      });
      const g2 = reg(J(`s2-good-b${attempt}`), 1, counter(J(`s2-good-b${attempt}`)));
      const withThrower = await post(true);
      await until(() => count(g1) > 0 && count(g2) > 0, 3000);
      same = withThrower.status === pre.status && withThrower.body === pre.body;
      goodRan = count(g1) === 1 && count(g2) === 1;
      lastPair = `without=${pre.status} ${cut(pre.body, 100)} | with=${withThrower.status} ${cut(withThrower.body, 100)} | g1=${count(g1)} g2=${count(g2)}`;
      retire(g1, g2);
      if (!same) {
        // noise from someone else's outbox event only changes processed/failed — a new key is damage, not noise
        try {
          const a = Object.keys(JSON.parse(pre.body)).sort().join(",");
          const b = Object.keys(JSON.parse(withThrower.body)).sort().join(",");
          if (a !== b) break;
        } catch {
          break;
        }
      }
    }
    chk("C0.5-S2.3", "with a THROWING job registered (between two good ones) the route's status and body are BYTE-IDENTICAL to the call just before without it (brief S2 · contract K3: no job summary in the body)",
      same, "identical bytes", lastPair);
    chk("C0.5-S2.4", "[positive control] the route really called the dispatcher: the good jobs on BOTH sides of the thrower ran exactly once — without this S2.3 would pass for a route that never calls runMinuteJobs",
      goodRan, "g1=1 g2=1", lastPair);
    const ops = await opsFor(th);
    chk("C0.5-S2.5", "the failure is recorded in OpsEvent naming the job (brief: \"an OpsEvent INFO row per failure\" — the integrations page reads it)",
      ops.length >= 1, "≥ 1 row naming the job", `${ops.length} rows ${ops.map((o) => `${o.level}/${o.source}: ${cut(String(o.message), 60)}`).join(" · ")}`);
    const st = await status([th, g1]);
    const thS = st?.get(th);
    const gS = st?.get(g1);
    const errKept = ops.some((o) => `${o.message} ${o.detail ?? ""}`.includes(BOOM)) || (thS?.lastError ?? "").includes(BOOM);
    chk("C0.5-S2.6", "the status reader tells success from failure: the good job has lastOkAt, the thrower has lastError (with the error text) and NO lastOkAt — and the error text is kept (OpsEvent or lastError)",
      !!gS && gS.lastOkAt !== null && !!thS && thS.lastOkAt === null && !!thS.lastError && errKept,
      "good: ok set · thrower: ok null, error set", `good: ${stTxt(gS)} | thrower: ${stTxt(thS)} | errKept=${errKept}`, "MAJOR");
    retire(th);
  } else {
    chk("C0.5-S2.3", "route result unchanged with a throwing job (route not callable)", false, "route POST", "missing");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // ▓▓ X5 — in-flight overlap · per-job lease · crash after claim (M7/H6) ▓▓
  //   Two WORKER processes each claim one hanging job at synthetic BASE and later SIGKILL themselves.
  //   crashA (every 1 min): while its owner is alive, a tick at BASE+90 s / BASE+5 min is "due by schedule"
  //     — the lease alone must stop a second copy. crashB (every 60 min): after the crash it must be
  //     picked up by BASE+16 min (15-min lease + 1). A dispatcher that claimed by writing
  //     "last run = BASE" would call it not-due until BASE+60 min → X5.5 red.
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X5 · in-flight · crash after claim ──");
  {
    const cA = J("x5-crash01");
    const cB = J("x5-crash60");
    const by = J("x5-bystander");
    const kA = worker({ mode: "crash", tag: TAG, now: BASE, jobs: [{ name: cA, every: 1, kind: "hang" }] });
    const kB = worker({ mode: "crash", tag: TAG, now: BASE, jobs: [{ name: cB, every: 60, kind: "hang" }] });
    const ready = await until(() => kA.out.includes("C05READY") && kB.out.includes("C05READY"), 150_000);
    await signal(`${TAG}|GO-CRASH`);
    const tGo = Date.now();
    const claimed = ready && (await until(() => kA.out.includes(`C05CLAIMED ${cA}`) && kB.out.includes(`C05CLAIMED ${cB}`), 60_000));
    const tClaim = Date.now();
    reg(cA, 1, counter(cA));
    reg(cB, 60, counter(cB));
    reg(by, 1, counter(by));
    const t1 = await tick(BASE + 90_000);
    const byRan = count(by);
    const t2 = await tick(BASE + 5 * MIN);
    const inflightA = count(cA);
    const inflightB = count(cB);
    await signal(`${TAG}|DIE|${cA}`);
    await signal(`${TAG}|DIE|${cB}`);
    await Promise.race([Promise.all([kA.closed, kB.closed]), wait(60_000)]);
    const tDie = Date.now();
    const validWindow = tDie - tGo < BUDGET_MS - 3000;
    chk("C0.5-X5.8", "[positive control] both worker processes really took their job (C05CLAIMED) and were killed before their own 20 s budget could release anything — if red, X5.4–X5.7 prove nothing",
      claimed && validWindow && kA.code !== null && kB.code !== null,
      `claimed · GO→kill < ${BUDGET_MS - 3000} ms`, `ready=${ready} claimed=${claimed} GO→claim=${tClaim - tGo}ms GO→kill=${tDie - tGo}ms exits=${kA.code}/${kB.code} · ${cut(`${kA.out} ${kB.out}`.replace(/\s+/g, " "), 200)}`, "MAJOR");
    chk("C0.5-X5.4", "IN-FLIGHT: while another process is still running a job, ticks at BASE+90 s and BASE+5 min (the schedule says \"due\") do NOT start a second copy of it — claiming by \"last run = now\" fails here for the 1-minute job",
      claimed && inflightA === 0 && inflightB === 0, "0 second copies", `crashA=${inflightA} crashB=${inflightB} · ticks ${t1.ms}ms/${t2.ms}ms ${t1.err || t2.err}`);
    chk("C0.5-X5.9", "a job hanging in another process does not block OTHER due jobs (per-job lease as the brief says — not one global dispatcher lock)",
      claimed && byRan === 1, "bystander ran once", `bystander=${byRan}`, "MAJOR");
    const stc = await status([cA, cB]);
    chk("C0.5-X5.7", "after the crash the stored state does NOT report the crashed attempt as finished or successful (lastRunAt and lastOkAt of both still null — contract K2: lastRunAt = last FINISHED attempt; writing it at claim time is the M7 bug) — requires the S0.9 positive control",
      READER_OK && !!stc && [cA, cB].every((n) => (stc.get(n)?.lastOkAt ?? null) === null && (stc.get(n)?.lastRunAt ?? null) === null),
      "lastRunAt null · lastOkAt null · reader proven", `readerProven=${READER_OK} crashA: ${stTxt(stc?.get(cA))} | crashB: ${stTxt(stc?.get(cB))}`, "MAJOR");
    const trail: string[] = [];
    let bFirstAt: number | null = null;
    for (const off of [6, 10, 16, 17]) {
      const r = await tick(BASE + off * MIN);
      if (bFirstAt === null && count(cB) > 0) bFirstAt = off;
      trail.push(`+${off}m: A=${count(cA)} B=${count(cB)}${r.err ? ` err=${cut(r.err, 60)}` : ""}`);
    }
    INFO.leaseStyle = bFirstAt === null ? "never recovered" : bFirstAt <= 10 ? `released at crash (re-run at +${bFirstAt}m — advisory-lock style)` : `row lease (re-run at +${bFirstAt}m)`;
    chk("C0.5-X5.5", "CRASH RECOVERY (M7/H6): the 60-minute job whose owner died mid-run is picked up again by BASE+16 min (lease ≤ 15 min, measured on the `now` argument — contract K1/K4) and runs EXACTLY once over ticks +6/+10/+16/+17 min",
      claimed && count(cB) === 1 && bFirstAt !== null && bFirstAt <= 16, "exactly 1 run, first by +16 min", trail.join(" · "));
    chk("C0.5-X5.6", "…and the 1-minute job of the other dead process is picked up again by BASE+16 min too",
      claimed && count(cA) >= 1, "≥ 1 run", trail.join(" · "), "MAJOR");
    retire(cA, cB, by);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // ▓▓ S1 — due / not-due, clock = the `now` argument ▓▓
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S1 · due / not-due ──");
  {
    const T0 = BASE + 20 * MIN; // aligned to 5 min
    const s1 = reg(J("s1-every5"), 5, counter(J("s1-every5")));
    await tick(T0);
    const c1 = count(s1);
    chk("C0.5-S1.1", "a job that never ran is due at the first tick", c1 === 1, "1", String(c1));
    const r0 = RUNS.get(s1)?.[0];
    chk("C0.5-S1.6", "run() receives the SAME `now` the dispatcher was called with (contract K1) and a numeric budget",
      !!r0 && r0.now === T0 && Number.isFinite(r0.budget), `now=${new Date(T0).toISOString()}`, r0 ? `now=${Number.isFinite(r0.now) ? new Date(r0.now).toISOString() : "not a Date"} budget=${r0.budget}` : "not run", "MAJOR");
    await tick(T0 + 1 * MIN);
    await tick(T0 + 5 * MIN - 1000);
    const c2 = count(s1);
    chk("C0.5-S1.2", "everyMinutes: 5 — NOT run again at +1 min and at +4 min 59 s", c2 === 1, "still 1", String(c2));
    await tick(T0 + 5 * MIN + 1000);
    const c3 = count(s1);
    chk("C0.5-S1.3", "…and run again at +5 min 1 s — the window is measured on `now` (the wall clock moved only seconds; a dispatcher reading Date.now() or storing wall time as \"last run\" fails here)",
      c3 === 2, "2", String(c3));
    const fresh = reg(J("s1-fresh"), 5, counter(J("s1-fresh")));
    const before = count(s1);
    await tick(T0 + 6 * MIN);
    chk("C0.5-S1.4", "in ONE tick a due job runs while a not-due job does not (fresh job at +6 min runs · the 5-minute job that ran at +5 min 1 s does not)",
      count(fresh) === 1 && count(s1) === before, "fresh=1 · every5 unchanged", `fresh=${count(fresh)} every5 ${before}→${count(s1)}`);
    // deliberately NOT window-aligned: first run mid-window, so a test cannot pass by a convenient boundary
    const T1 = BASE + 32 * MIN + 30_000;
    const u = reg(J("s1-unaligned"), 5, counter(J("s1-unaligned")));
    await tick(T1);
    const u1 = count(u);
    await tick(T1 + 1 * MIN);
    const u2 = count(u);
    await tick(T1 + 5 * MIN + 1000);
    const u3 = count(u);
    chk("C0.5-S1.5", "started MID-window (+32 min 30 s): not again 1 min later, again 5 min 1 s later", u1 === 1 && u2 === 1 && u3 === 2, "1 · 1 · 2", `${u1} · ${u2} · ${u3}`);
    // informational: which due model? (interval vs aligned windows) — both satisfy S1.1–S1.5
    const m = reg(J("s1-model"), 5, counter(J("s1-model")));
    const T2 = BASE + 42 * MIN + 30_000;
    await tick(T2);
    await tick(T2 + 4 * MIN);
    INFO.dueModel = count(m) === 2 ? "aligned windows (ran again 4 min later in the next 5-min window)" : "interval (now − lastRun ≥ everyMinutes)";
    console.log(`  ℹ️  due model: ${INFO.dueModel}`);
    retire(s1, fresh, u, m);
    const all = await status();
    const hb = all?.get("crm.heartbeat");
    chk("C0.5-S1.7", "the status reader lists `crm.heartbeat` (every 5 min where the reader exposes everyMinutes)",
      !!hb && (hb.everyMinutes === null || hb.everyMinutes === 5), "listed · 5", hb ? `everyMinutes=${hb.everyMinutes}` : "absent", "MINOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // ▓▓ X5 — overlap: in-process, then separate processes ▓▓
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X5 · overlapping ticks ──");
  {
    const ip = reg(J("x5-inproc"), 1, counter(J("x5-inproc")));
    const seen: number[] = [];
    for (let k = 0; k < 3; k += 1) {
      const nowK = BASE + 50 * MIN + k * 61_000;
      await Promise.all(Array.from({ length: 10 }, () => tick(nowK)));
      seen.push(count(ip));
    }
    chk("C0.5-X5.1", "10 runMinuteJobs calls fired at once with the same `now` (3 rounds, a new minute each round, one process = one pool, several connections) run the due job EXACTLY once per round",
      seen.join(",") === "1,2,3", "1,2,3", seen.join(","));
    retire(ip);
  }
  {
    const ov = J("x5-xproc");
    const lu = (i: number, k: number) => J(`x5-lu${i}${k}`);
    const kids = Array.from({ length: 4 }, (_, i) =>
      worker({
        mode: "race",
        tag: TAG,
        calls: 3,
        rounds: 2,
        jobs: [{ name: ov, every: 1, kind: "probe" }, ...[0, 1, 2].map((k) => ({ name: lu(i, k), every: 1, kind: "probe" }))],
      }),
    );
    const allLu = [0, 1, 2, 3].flatMap((i) => [0, 1, 2].map((k) => lu(i, k)));
    const ready = await until(() => kids.every((k) => k.out.includes("C05READY")), 150_000);
    const R1 = BASE + 60 * MIN;
    await signal(`${TAG}|GO|1`, `${Date.now() + 1500} ${R1}`);
    const done1 = await until(() => kids.every((k) => /C05DONE 1 /.test(k.out)), 90_000);
    const ov1 = await markers(ov);
    const lu1 = await Promise.all(allLu.map(markers));
    const stR1 = await status(allLu);
    const withRun = allLu.filter((n) => (stR1?.get(n)?.lastRunAt ?? null) !== null).length;
    // parent side: same names, probe behaviour — a job whose "last run" was lost would run again at R1+30 s
    for (const n of [ov, ...allLu]) reg(n, 1, prober(n));
    await tick(R1 + 30_000);
    const ovMid = await markers(ov);
    const luMid = await Promise.all(allLu.map(markers));
    for (const n of [ov, ...allLu]) retire(n);
    await signal(`${TAG}|GO|2`, `${Date.now() + 1500} ${R1 + 61_000}`);
    const done2 = await until(() => kids.every((k) => /C05DONE 2 /.test(k.out)), 90_000);
    await Promise.race([Promise.all(kids.map((k) => k.closed)), wait(30_000)]);
    const ov2 = await markers(ov);
    const lu2 = await Promise.all(allLu.map(markers));
    const answers = kids.map((k) => [...k.out.matchAll(/C05DONE \d (\[.*\])/g)].map((m) => JSON.parse(m[1]) as string[]).flat());
    const errs = answers.flat().filter((a) => a !== "ok");
    const pcOk = ready && done1 && done2 && answers.every((a) => a.length === 6) && errs.length === 0 && lu1.every((n) => n === 1);
    chk("C0.5-X5.2a", "[positive control] 4 worker processes ran both rounds (3 concurrent calls each, no call rejected) and the 12 DISTINCT jobs they own each left exactly one marker in round 1 — the counter sees runs in other processes",
      pcOk, "ready · 2×DONE · 24 ok · 12 markers of 1", `ready=${ready} done=${done1}/${done2} answers=${answers.map((a) => a.length).join("/")} errs=${cut(errs.join(" | "), 120) || 0} lu1=[${lu1.join("")}] · ${cut(kids[0].out.replace(/\s+/g, " "), 160)}`, "MAJOR");
    chk("C0.5-X5.2", "4 SEPARATE PROCESSES (separate PrismaClients/pools, released together) × 3 concurrent calls with the same `now` run the shared due job EXACTLY once — round 1 and again exactly once in round 2 (a new minute). An in-process mutex passes X5.1 and fails here",
      pcOk && ov1 === 1 && ov2 === 2, "1 then 2", `after R1=${ov1} after R2=${ov2}`);
    chk("C0.5-X5.3", "no lost \"last run\": 12 jobs finishing at the same instant in 4 processes are ALL not-due 30 s later (0 re-runs from this process) and ALL due again one minute later (exactly 2 each) — a read-modify-write of one shared JSON map loses some of them",
      pcOk && ovMid === ov1 && luMid.every((n, i) => n === lu1[i]) && lu2.every((n) => n === 2), "R1+30 s: +0 · after R2: 2 each",
      `R1+30s ov ${ov1}→${ovMid} lu [${lu1.join("")}]→[${luMid.join("")}] · after R2 lu [${lu2.join("")}]`);
    chk("C0.5-X5.3b", "…and the status reader shows a finished run for all 12 right after round 1",
      withRun === 12, "12/12", `${withRun}/12`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // ▓▓ S2 — isolation in the library itself ▓▓
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S2 · isolation (library) ──");
  {
    const a1 = reg(J("s2-lib-a1"), 1, counter(J("s2-lib-a1")));
    const tA = reg(J("s2-lib-throwasync"), 1, async () => {
      throw new Error("qc-c05 planted async failure");
    });
    const a2 = reg(J("s2-lib-a2"), 1, counter(J("s2-lib-a2")));
    const r = await tick(BASE + 70 * MIN);
    chk("C0.5-S2.7", "runMinuteJobs itself resolves when a job rejects, and the jobs registered before AND after the thrower both run",
      !r.err && count(a1) === 1 && count(a2) === 1, "resolved · a1=1 a2=1", `err=${r.err || "-"} a1=${count(a1)} a2=${count(a2)}`);
    retire(a1, tA, a2);
    const a3 = reg(J("s2-lib-a3"), 1, counter(J("s2-lib-a3")));
    const tS = reg(J("s2-lib-throwsync"), 1, () => {
      throw new Error("qc-c05 planted SYNCHRONOUS failure");
    });
    const tU = reg(J("s2-lib-rejectundef"), 1, () => Promise.reject(undefined));
    const tStr = reg(J("s2-lib-throwstring"), 1, async () => {
      throw "qc-c05 planted string failure";
    });
    const big = `${"x".repeat(50_000)} qc-c05-big-${rand}`;
    const tBig = reg(J("s2-lib-throwbig"), 1, async () => {
      throw new Error(big);
    });
    const a4 = reg(J("s2-lib-a4"), 1, counter(J("s2-lib-a4")));
    const r2 = await tick(BASE + 71 * MIN + 1000);
    chk("C0.5-S2.8", "a run() that throws SYNCHRONOUSLY (not a rejected promise), a `reject(undefined)` and a `throw \"string\"` are isolated too — the jobs around them run and the tick resolves (`jobs.map(j => j.run().catch())` dies on the first)",
      !r2.err && count(a3) === 1 && count(a4) === 1, "resolved · a3=1 a4=1", `err=${r2.err || "-"} a3=${count(a3)} a4=${count(a4)}`, "MAJOR");
    const opsS = await Promise.all([tS, tU, tStr].map(opsFor));
    chk("C0.5-S2.8b", "…and each of those three failures is recorded (OpsEvent naming the job)",
      opsS.every((o) => o.length >= 1), "≥ 1 row each", opsS.map((o) => o.length).join("/"), "MAJOR");
    const opsBig = await opsFor(tBig);
    const stBig = (await status([tBig]))?.get(tBig);
    const maxRow = Math.max(0, ...opsBig.map((o) => String(o.message ?? "").length + String(o.detail ?? "").length));
    chk("C0.5-S2.9", "a 50 000-character error is recorded but bounded: every OpsEvent row ≤ 5 000 chars (message+detail) and lastError ≤ 4 000 (a shared state row must not balloon)",
      opsBig.length >= 1 && maxRow <= 5000 && (stBig?.lastError ?? "").length <= 4000, "rows ≥ 1 · ≤ 5000 · ≤ 4000",
      `rows=${opsBig.length} maxRow=${maxRow} lastError=${(stBig?.lastError ?? "").length}`, "MINOR");
    retire(a3, tS, tU, tStr, tBig, a4);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // ▓▓ S3 — the 20 s budget belongs to the DISPATCHER, not to the jobs ▓▓
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S3 · budget ──");
  {
    const b1 = reg(J("s3-acct1"), 1, async (now, b) => {
      noteRun(J("s3-acct1"), now, b);
      await wait(3000); // a well-behaved job that uses 3 s of the budget
    });
    const b2 = reg(J("s3-acct2"), 1, counter(J("s3-acct2")));
    const b3 = reg(J("s3-acct3"), 1, counter(J("s3-acct3")));
    const callStart = Date.now();
    await tick(BASE + 80 * MIN);
    const recs = [b1, b2, b3].map((n) => ({ n, r: RUNS.get(n)?.[0] }));
    const budgets = recs.map((x) => x.r?.budget ?? Number.NaN);
    chk("C0.5-S3.1", "every job is handed a finite budgetMs in (0, 20 000]", budgets.every((b) => Number.isFinite(b) && b > 0 && b <= BUDGET_MS),
      "0 < budget ≤ 20000", budgets.join(" / "));
    const sl = recs[0].r;
    const later = recs.slice(1).filter((x) => x.r && sl && x.r.at >= sl.at + 2500);
    const parallel = !!sl && recs.slice(1).every((x) => x.r && Math.abs(x.r.at - sl.at) < 1500);
    dispatchMode = parallel ? "parallel" : later.length ? "sequential" : "unknown";
    if (later.length > 0) {
      const bad = later.filter((x) => (x.r?.budget ?? Infinity) > BUDGET_MS - ((x.r?.at ?? 0) - callStart) + 300);
      chk("C0.5-S3.2", "sequential dispatch: a job started after a 3 s job receives the REMAINING budget, not a fresh 20 s (the accounting is the dispatcher's)",
        bad.length === 0, "budget ≤ 20000 − elapsed", later.map((x) => `${x.n.split(".").pop()}: budget=${x.r?.budget} elapsed=${(x.r?.at ?? 0) - callStart}ms`).join(" · "));
    } else if (parallel) {
      console.log("  ℹ️  C0.5-S3.2 n/a — jobs run in parallel under one deadline (S3.3 proves the deadline)");
    } else {
      UNPROVEN.push("C0.5-S3.2 (could not observe a job started after the 3 s job)");
      console.log("  ⚪ C0.5-S3.2 not proven — no job was observed starting after the 3 s job");
    }
    retire(b1, b2, b3);

    const s1n = J("s3-slow1");
    const s2n = J("s3-slow2");
    reg(s1n, 1, async (now, b) => {
      noteRun(s1n, now, b);
      await hang(10 * MIN); // IGNORES budgetMs
    });
    reg(s2n, 1, async (now, b) => {
      noteRun(s2n, now, b);
      await hang(10 * MIN);
    });
    const f = reg(J("s3-fast"), 1, counter(J("s3-fast")));
    const keep = setInterval(() => {}, 1000); // the hanging jobs' timers are unref'd — keep the harness alive
    const R = BASE + 90 * MIN;
    const r = await tick(R, 90_000);
    chk("C0.5-S3.3", "two jobs that IGNORE budgetMs and would take 10 minutes each: runMinuteJobs still returns within 22.5 s (20 s + bookkeeping) — a dispatcher that awaits its jobs, or gives each job its own 20 s, fails",
      !r.timedOut && r.ms <= 22_500, "≤ 22 500 ms", `${r.timedOut ? "did not return within 90 s" : `${r.ms} ms`} ${r.err ? cut(r.err, 80) : ""}`);
    const started = [s1n, s2n].filter((n) => count(n) > 0);
    const stS = await status(started);
    const opsS = await Promise.all(started.map(opsFor));
    const recorded = started.every((n, i) => (stS?.get(n)?.lastOkAt ?? null) === null && ((stS?.get(n)?.lastError ?? null) !== null || opsS[i].length > 0));
    chk("C0.5-S3.5", "the job(s) cut off by the budget are NOT recorded as successes (lastOkAt null) and the cut-off is recorded (lastError or OpsEvent) — requires the S0.9 reader positive control",
      READER_OK && started.length > 0 && recorded, "cut-off ⇒ not ok, recorded",
      `readerProven=${READER_OK} started=${started.length} ${started.map((n) => `${n.split(".").pop()}: ${stTxt(stS?.get(n))} ops=${opsS[started.indexOf(n)].length}`).join(" | ")}`, "MAJOR");
    retire(s1n, s2n);
    const fAfterR = count(f);
    await tick(R + 61_000);
    clearInterval(keep);
    chk("C0.5-S3.4", "the fast job queued behind the slow ones runs EXACTLY once across this tick and the next one (skipped for lack of budget ⇒ still due next minute; never marked as run without running, never run twice)",
      count(f) === 1, "1", `after tick=${fAfterR} after next tick=${count(f)} · dispatch=${dispatchMode}`);
  }
} catch (e) {
  chk("C0.5-FATAL", "the oracle ran to the end without an unexpected exception", false, "no exception",
    cut(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ""}` : String(e), 400), String(e).includes("STOP:") ? "MAJOR" : "CRITICAL");
} finally {
  // ═════════════════════════════════════════════════════════════════════════════
  // CLEANUP — retire every behaviour, find where the dispatcher kept state for OUR job names, remove it
  // (row delete for single-job rows · key-by-key compare-and-swap for shared JSON), then every OpsEvent
  // row carrying TAG (probe markers, signals, the dispatcher's failure rows). C0.5-CLEAN proves 0 left.
  // ═════════════════════════════════════════════════════════════════════════════
  BEH.clear();
  try {
    if (MJ) {
      const locs = await locate();
      INFO.stateAt = locs.map((l) => `${l.table}.${l.column}(${l.type})×${l.n}`).join(" · ") || "not found";
      chk("C0.5-S2.10", `the dispatcher persists its per-job state in the DB (found: ${INFO.stateAt}) — required for the integrations page and for any cross-process guarantee`,
        locs.length > 0, "a table holding rows for our job names", INFO.stateAt, "MAJOR");
      const notes: string[] = [];
      for (const l of locs) notes.push(await scrub(l));
      if (notes.length) console.log(`  🧹 ${notes.join(" · ")}`);
    }
    await P.opsEvent.deleteMany({ where: { OR: [{ message: { contains: TAG } }, { detail: { contains: TAG } }] } });
    await P.opsEvent.deleteMany({ where: { source: { in: [PROBE_SRC, SIG_SRC] }, message: { contains: TAG } } });
    const left = MJ ? await locate() : [];
    const opsLeft = Number(await P.opsEvent.count({ where: { OR: [{ message: { contains: TAG } }, { detail: { contains: TAG } }] } }));
    chk("C0.5-CLEAN", "the oracle gives the QC database back: no row carrying its TAG is left in any job-state table or in OpsEvent (shared state of other jobs untouched)",
      left.length === 0 && opsLeft === 0, "0 rows", `${left.map((l) => `${l.table}.${l.column}×${l.n}`).join(" · ") || "-"} · OpsEvent=${opsLeft}`, "MAJOR");
  } catch (e) {
    chk("C0.5-CLEAN", "the oracle gives the QC database back", false, "0 rows", cut(errText(e)), "MAJOR");
  }
  await prisma.$disconnect().catch(() => {});
}

const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
INFO.dispatch = dispatchMode;
console.log(`\nℹ️  ${Object.entries(INFO).map(([k, v]) => `${k}: ${v}`).join(" · ")}`);
console.log(`\n${passed === total ? "🟢" : "🔴"} C0.5: ${passed}/${total}${UNPROVEN.length ? ` · ${UNPROVEN.length} not proven` : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings, unproven: UNPROVEN, info: INFO })}`);
process.exit(passed === total ? 0 : 1);

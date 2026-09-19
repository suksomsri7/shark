// QC — CRM v2 WO C2.2: Sequences — `src/lib/modules/crm/sequences.ts` (+ sequences-shared.ts) · runDue as the minute job `crm.sequences` ·
//      auto-stop consumers `src/lib/platform/crm-bridges/sequences.ts` (R-D) · events crm.sequence.enrolled / crm.sequence.finished ·
//      editor / enrollment / holiday UI
// Oracle writer · the C2.2 builder must NOT touch this file · QC database only (.env.qc — loaded by scripts/acc-v2-env.mts)
// Run:  bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c2.2.mts
//       `--force-run` = run every check even while C2.0 tables / C2.2 code are absent: sequence checks go red for the right reason
//       ("module/table absent"), fixtures are built and C2.2-CLEAN proves they are all removed. Never crashes.
// requires: crm-seed   (house style — this oracle reads NO seeded row; everything lives in throwaway tenants `qc-c22-<rand>-*`)
//
// SOURCES: crm-brief-C2.2.md · crm-brief-COMMON.md · crm-brief-RESOLUTIONS.md (R-A stopFor owned by C2.2 · R-C.6 minute jobs through
//   crm-cron.mts · R-C.8 keys `<type>#<id>#<seq>` · R-D crm-bridges/sequences.ts · R-E.5 plain send until C2.5 · R-E.9 Thai holidays
//   B.E. 2569–2570 static list · R-E.14 uiVersion 1 ⇒ sequences skip, rows kept, resume at 2) · CRM-RUN §2 "C2.2" (S1–S7 = 28) ·
//   MASTER-PLAN §2 §4 (X1 X3 X4 X5 X6 X8 X9) §5 · blueprint §5.7 §11.5 · mockup 07 (bottom) · decisions C16 (revised) C25 ·
//   C2.0 contract (header of qc-crm-c2.0.mts: CrmSequence.version · CrmSequenceStep.version + UNIQUE(sequenceId, version, index) ·
//   CrmSequenceEnrollment partial UNIQUE(sequenceId, contactId) WHERE status='ACTIVE' + leaseUntil + sequenceVersion) ·
//   C0.5 minute-job dispatcher (aligned windows · lease rows · `now` is the clock) · C1.4 consents.canContact (read at STEP time) ·
//   C1.7 visibility (404-not-403) · C1.8 compose contract for CRM extras · C1.11 PERMANENT RULE (uiVersion-1 cases in every oracle).
//
// REGRESSIONS THE CONTROLLER RUNS WITH THIS FILE (not re-implemented): qc-crm-c2.1 (shared action runner — sequences send through it) ·
//   qc-crm-c0.5 (dispatcher unchanged; crm.sequences is just one more job) · qc-member-fix-s3 (member journeys: H6/H7/M7 lease + consent
//   at send time — the runner is shared) · qc-member-m3.3 · qc-crm-c1.8 (crm.deal.won / crm.contact.updated consumers keep working with
//   the new extras) · every earlier qc-crm-c1.* · qc-member-m1.9 (30/15/10/5 — nothing here touches the seeded tenants).
//
// ══════════════════════════════════ CONTRACT (the builder implements exactly this) ══════════════════════════════════
//   import * as SEQ from "@/lib/modules/crm/sequences"      (also `export * as sequences from "./sequences"` in crm/index.ts)
//   ctx = { tenantId, systemId, actorUserId: string | null } · actor = MemberActor · re-resolve the system (type CRM, this tenant) ·
//   visibleWhere on every read · errors carry `.code` ∈ NOT_FOUND | FORBIDDEN | VALIDATION | CONFLICT with a Thai message that never
//   blames the user and never echoes data of another tenant/system · every mutation writes an AuditLog row `crm.sequence.*` and emits
//   its outbox event INSIDE the same transaction.
//   createSequence(ctx, actor, { name, description?, stopOnReply?, stopOnWon?, stopOnLost?, businessDaysOnly? (default true),
//       sendWindow?: { from: "HH:MM", to: "HH:MM" } | null (Thai time, [from, to) · null = always open), maxActive?, steps: StepInput[] })
//     → { id, version: 1, … }     (needs crm.sequence.manage · STAFF default ⇒ FORBIDDEN)
//     StepInput = { kind: "EMAIL"|"LINE"|"TASK"|"WAIT"|"SMS", subject?, body?, templateId?, waitDays?, waitHours?, taskTitle?,
//                   taskType? (CrmActivityType), channel? } · subject with CR/LF ⇒ VALIDATION (or stored stripped) · bad HH:MM ⇒ VALIDATION
//   updateSequence(ctx, actor, id, patch) — patch.steps while ≥ 1 ACTIVE enrollment exists ⇒ version+1: NEW CrmSequenceStep rows with the
//     new version; the old version's rows are never updated/deleted; enrollments keep `sequenceVersion` and finish on their own steps ·
//     a patch without `steps` never bumps the version
//   enroll(ctx, actor, { sequenceId, contactId, dealId?, replace?: boolean })
//     → { enrollmentId (or id), status: "ENROLLED" | "REPLACED" }  · needs crm.sequence.enroll · contact/deal/sequence invisible or of
//       another system/tenant ⇒ NOT_FOUND · already ACTIVE in that sequence ⇒ CONFLICT (Thai) unless replace ⇒ the old one STOPPED
//       (stoppedReason contains "REPLACE") and a new ACTIVE row at step 0 · contact opted out (marketingOptOut) ⇒ NO row,
//       result `{ skipped: true, reason }` (a refusal with a Thai message is tolerated) · new row: status ACTIVE, stepIndex 0,
//       sequenceVersion = sequence.version, nextAt = now, enrolledBy "USER:<id>" · one ACTIVE per (sequence, contact) also under 10
//       parallel calls (C2.0 partial unique ⇒ the loser answers CONFLICT, never a 500) · emits crm.sequence.enrolled
//   bulkEnroll(ctx, actor, { sequenceId, contactIds, confirm, reason, replace? }) — DANGER (X9): confirm === true + reason ≥ 5 chars,
//     ≤ 500 ids, else refused with nothing written · → { enrolled: number, skipped: number | {contactId, reason}[], conflicts? } ·
//     opted-out / invisible contacts are skipped · audit row carries the reason
//   stop(ctx, actor, enrollmentId, { reason? }) ⇒ STOPPED "MANUAL" · pause ⇒ PAUSED (runDue ignores it) · resume ⇒ ACTIVE ·
//     getEnrollment(ctx, actor, id) → { id, status, stepIndex, sequenceVersion, nextAt, stoppedReason,
//       steps: [{ index, kind, outcome: "SENT"|"DONE"|"SKIPPED"|"FAILED"|null, reason: string|null }] }   (reason Thai when SKIPPED)
//     listEnrollments(ctx, actor, { sequenceId?, contactId?, status? }) → { items: [{ id, … }] } (visibleWhere on the contact)
//     stats(ctx, actor, sequenceId, { version? }) → { version, steps: [{ index, kind, sent, skipped, failed, active }] }
//       sent = executed OK (EMAIL/LINE/SMS delivered to the sender · TASK created · WAIT passed) · active = ACTIVE enrollments whose
//       NEXT step is this index · counters exact under concurrency (no read-modify-write of a JSON map — X3)
//   stopFor(ctx: { tenantId, systemId? }, contactId, reason: "REPLY"|"WON"|"LOST"|"OPT_OUT"|"BOUNCE"|string, opts?: { dealId? })
//     → number stopped — THE auto-stop entry (R-A: C2.4 chat reply / C2.5 e-mail reply+bounce+unsubscribe only CALL it) · tenant-scoped ·
//     honours sequence.stopOnReply / stopOnWon / stopOnLost · each stop emits ONE crm.sequence.finished
//   auto-stop consumers (CRM extras under `compose`, in crm-bridges/sequences.ts, wired in a `// CRM C2.2 ▸ … ◂` block):
//     crm.deal.won ⇒ stop enrollments with that dealId in sequences with stopOnWon (stopOnWon=false stays ACTIVE) · crm.deal.lost ⇒ same
//     with stopOnLost · crm.contact.updated whose contact now has marketingOptOut ⇒ stop all of that contact ("OPT_OUT") ·
//     idempotent (twice / in parallel ⇒ one STOPPED transition, one finished event)
//   importThaiHolidays(ctx, actor, year) — year CE 2026|2027 or BE 2569|2570, static list in code, merged into
//     settings.crm.holidays (items { date: "YYYY-MM-DD", name }) without duplicates through the single-statement jsonb_set writer
//     (other settings.crm keys survive) · other years ⇒ VALIDATION · must include at least the fixed-date holidays
//     01-01 · 04-13 · 04-14 · 04-15 · 12-05 · 12-31
//   settings.crm.businessDays: weekday numbers, default [1,2,3,4,5] (Mon–Fri — the oracle only ever writes [1,2,3,4,5]) ·
//     settings.crm.holidays: { date, name }[] (bare "YYYY-MM-DD" strings accepted too)
//   runDue(now: Date, opts?: { deps?: SequenceDeps; tenantIds?: string[]; batchSize?: number (default 200); deadline?: number (epoch ms);
//       signal?: AbortSignal }) → summary (shape free)
//     `now` is THE clock for due-ness, windows and leases (never the wall clock / DB NOW()) · picks ACTIVE rows with nextAt ≤ now whose
//     lease is free (leaseUntil null or ≤ now), claims them with ONE conditional UPDATE setting leaseUntil = now + 15 min (never by
//     writing DONE/STOPPED or advancing stepIndex first), executes, then advances + clears the lease · loops batch after batch until no
//     due row is left or the deadline/signal says stop · a claimed-then-crashed row is picked again once now ≥ leaseUntil ·
//     `deps`, when given, are the ONLY senders used (tests never reach a real transport) · `tenantIds` restricts the pick (ops/tests;
//     the minute job passes none)
//     step semantics: stepIndex = the NEXT step to execute · non-WAIT step ⇒ stepIndex+1, nextAt = now (so the same call continues) ·
//     WAIT ⇒ stepIndex+1, nextAt = now + waitDays business days (businessDaysOnly: skip weekdays not in businessDays and holidays,
//     keeping the Thai clock time; else calendar days) + waitHours, then clamped into sendWindow (before `from` ⇒ same day `from`;
//     at/after `to` or on a non-business day ⇒ next business day `from`) · EMAIL/LINE/SMS due outside the window ⇒ not sent, nextAt :=
//     next window opening, same step · past the last step ⇒ DONE, nextAt null, crm.sequence.finished once
//     EMAIL: to = contact.email, subject/body with {{contact.firstName}} rendered · LINE: to = contact.lineUserId (or the linked member
//     identity) · consent is decided WHEN THE STEP RUNS through consents.canContact (marketing): withdrawn consent / opt-out / bounced
//     e-mail / no address ⇒ nothing sent, step outcome SKIPPED with a Thai reason, enrollment moves on (opt-out may STOP instead) ·
//     TASK: ONE CrmActivity (type = taskType ?? TASK, title = taskTitle, contactId, dealId, owner = deal owner ?? contact owner,
//     source ≠ MANUAL, dedupe on the enrollment+version+index so a re-run never makes a second one)
//     uiVersion 1 system ⇒ its enrollments are skipped untouched (status, stepIndex, nextAt unchanged; nothing sent) and run again after
//     the switch back to 2 · enroll/createSequence on uiVersion 1 ⇒ refused (CrmV2DisabledError / FORBIDDEN / CRM_V2_DISABLED)
//     SequenceDeps = { email?, line?, sms? } each `(req: { tenantId, systemId, contactId, enrollmentId, channel, to, subject?, body })
//       => Promise<{ ok: boolean; skipped?: boolean; error?: string }>`
//   minute job: registerMinuteJob({ name: "crm.sequences", everyMinutes: 5, cadence "minute", NOT vpsOnly, run: (now, budget, ctrl) =>
//     runDue(now, { deadline: ctrl.deadline, signal: ctrl.signal }) }) — registered when `@/lib/modules/crm/sequences` (or
//     `@/lib/modules/crm/sequences-job`) is imported · scripts/crm-cron.mts imports it
//   events (3 registries, ids only, key `<type>#<enrollmentId>#<n>`, systemId = the CRM system):
//     crm.sequence.enrolled { enrollmentId, sequenceId, contactId, dealId?, sequenceVersion }
//     crm.sequence.finished { enrollmentId, sequenceId, contactId, status: "DONE"|"STOPPED", reason?: CODE }
//   UI: `crm/settings/sequences/page.tsx` (list) · `crm/settings/sequences/[<param>]/page.tsx` (editor + enrollment list + per-step stats)
//     · holiday/business-day settings page under crm/settings with "import Thai public holidays for year N" · enroll button reachable
//     from contacts/[contactId] and bulk enroll from the contacts list (components under src/components/crm/sequences/) · every page
//     type-CRM guard + notFound + requireCrmV2Page · "use server" files export async functions only and call assertCrmV2 ·
//     `/crm/settings/sequences` "ready" in crm/nav.ts CRM_DEEP_NAV · every literal data-testid has a row (wo "C2.2") in
//     scripts/crm-ui-inventory.json
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// WHAT THIS FILE PROVES: S1 enroll/CONFLICT/replace (3) · S2 runDue step kinds + business days + window (8) · S3 five stop causes (5) ·
//   S4 versions (2) · S5 per-step stats (2) · S6 UI static (5) · S7 minute job + loop until quiet (3) · S8 brief extras (events ·
//   pause/resume · permissions · holidays · manual stop · static markers · facade) · S9 PERMANENT RULE uiVersion 1 ·
//   X1 scope · X3 races · X4 redelivery · X5 overlap + crash after claim (real SIGKILL of a worker process) · X6 header/window input ·
//   X8 consent at step time + payload/OpsEvent scan + no real transport · X9 bulk enroll danger · CLEAN.
//   N/A: X2 (no REST op / AI tool in C2.2 — crm_stop_sequence is C3.4) · X7 (no public endpoint) · X10 (no file/secret).
// HOUSE RULES: SKIP guard (no DB before it) · throwaway tenants `qc-c22-<rand>-*` swept in `finally` · outbound fetch stubbed (a real
//   Resend/LINE call is counted and fails X8.6) · fake senders injected through `deps` · synthetic clocks are in the PAST (Sep 2026) ·
//   the shared minute-job state rows of `crm.sequences` (OpsAlertState `minute-job:*:crm.sequences`) are snapshotted and restored ·
//   events consumed here are rows of our own tenants only (no global drain) · cross-process crash = this file re-invoked with
//   `--c22-worker <base64 json>` which SIGKILLs itself inside the send.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync, writeSync } from "node:fs";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

const SEQ_FILE = "src/lib/modules/crm/sequences.ts";
const SEQ_SPEC = "@/lib/modules/crm/sequences";
const SEQ_JOB_SPEC = "@/lib/modules/crm/sequences-job";
const BR_SEQ_FILE = "src/lib/platform/crm-bridges/sequences.ts";
const SCHEMA_DIR = "prisma/schema";
const MIG_ROOT = "prisma/migrations";
const CRM_PAGES = "src/app/app/sys/[id]/crm";
const COMP_DIR = "src/components/crm/sequences";
const NAV_FILE = "src/lib/modules/crm/nav.ts";
const INV_FILE = "scripts/crm-ui-inventory.json";
const CRON_FILE = "scripts/crm-cron.mts";
const CONS_FILE = "src/lib/outbox-consumers.ts";
const SELF = "scripts/qc-crm-c2.2.mts";
const JOB = "crm.sequences";

const ARGV = process.argv.slice(2);
const FORCE = ARGV.includes("--force-run");
const WORKER_AT = ARGV.indexOf("--c22-worker");

const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const walk = (dir: string): string[] => {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
};

// ═══════════════════════════════════════════════════════════════════════════════════
// SKIP guard — prerequisites checked on the filesystem only (no DB connection above this line)
//   C2.0: migration `*_crm_v2_b` + model CrmSequence/CrmSequenceStep/CrmSequenceEnrollment · C2.2: sequences.ts
// ═══════════════════════════════════════════════════════════════════════════════════
const migB = existsSync(MIG_ROOT) ? readdirSync(MIG_ROOT).filter((d) => /^\d+_crm_v2_b$/.test(d)) : [];
const prismaSrc = existsSync(SCHEMA_DIR) ? readdirSync(SCHEMA_DIR).filter((f) => f.endsWith(".prisma")).map((f) => read(join(SCHEMA_DIR, f))).join("\n") : "";
const hasModels = ["CrmSequence", "CrmSequenceStep", "CrmSequenceEnrollment"].every((m) => new RegExp(`\\bmodel\\s+${m}\\s*\\{`).test(prismaSrc));
const missing: string[] = [];
if (migB.length === 0) missing.push("C2.0 migration prisma/migrations/*_crm_v2_b absent");
if (!hasModels) missing.push("C2.0 models CrmSequence/CrmSequenceStep/CrmSequenceEnrollment absent from prisma/schema");
if (!existsSync(SEQ_FILE)) missing.push(`C2.2 not built (${SEQ_FILE} missing)`);
if (WORKER_AT < 0 && missing.length > 0 && !FORCE) {
  console.log(`⚠️  SKIPPED — ${missing.join(" · ")} (C2.2 is built after C2.0; run with --force-run to prove fixtures + cleanup)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true, reason: missing })}`);
  process.exit(0);
}

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
process.env.QC_ENV_FILE = ".env.qc";
delete process.env.OPS_ALERT_EMAIL; // failures provoked on purpose must never mail the owner

// outbound HTTP never leaves the box — a real Resend / LINE call would show up here (X8.6)
const FETCHES: string[] = [];
globalThis.fetch = (async (input: Any): Promise<Response> => {
  FETCHES.push(typeof input === "string" ? input : String(input?.url ?? input));
  return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

const out = (s: string) => {
  try {
    writeSync(1, `${s}\n`);
  } catch {
    /* closed pipe */
  }
};
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ═══════════════════════════════════════════════════════════════════════════════════
// WORKER (X5.4 crash after claim): runDue with a sender that prints C22CLAIMED then SIGKILLs its own process mid-send
// ═══════════════════════════════════════════════════════════════════════════════════
if (WORKER_AT >= 0) {
  const cfg = JSON.parse(Buffer.from(ARGV[WORKER_AT + 1] ?? "", "base64url").toString("utf8")) as { tenantId: string; nowMs: number };
  setTimeout(() => process.exit(3), 180_000).unref();
  const W = (await import(SEQ_SPEC as string).catch(() => ({}))) as Any;
  if (typeof W.runDue !== "function") {
    out("C22NOFN");
    process.exit(5);
  }
  const hang = async (): Promise<{ ok: boolean }> => {
    out("C22CLAIMED");
    setTimeout(() => process.kill(process.pid, "SIGKILL"), 300);
    await new Promise<void>(() => {});
    return { ok: true };
  };
  out("C22READY");
  await Promise.resolve(W.runDue(new Date(cfg.nowMs), { deps: { email: hang, line: hang, sms: hang }, tenantIds: [cfg.tenantId] })).catch((e: unknown) =>
    out(`C22ERR ${e instanceof Error ? e.message : String(e)}`),
  );
  out("C22RETURNED"); // runDue returned without ever calling the sender — the parent reports it
  process.exit(6);
}

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;

// ─────────────────────────── harness ───────────────────────────
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const cut = (v: unknown, n = 260) => {
  const s = String(v ?? "");
  return s.length > n ? `${s.slice(0, n)}…` : s;
};
const j = (v: Any): string =>
  JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x)) ?? "undefined";
type Res = { ok: boolean; v: Any; err: string; code: string; msg: string };
const call = async (fn: Any, ...args: Any[]): Promise<Res> => {
  if (typeof fn !== "function") return { ok: false, v: undefined, err: "MISSING_FUNCTION", code: "MISSING_FUNCTION", msg: "" };
  try {
    return { ok: true, v: await fn(...args), err: "", code: "", msg: "" };
  } catch (e) {
    const x = e as Any;
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, v: undefined, err: `${x?.name ?? "Error"}(${x?.code ?? "-"}): ${cut(msg, 160)}`, code: String(x?.code ?? ""), msg };
  }
};
const thai = (s: string) => /[ก-๙]/.test(s);
const isRefusal = (r: Res, codes: string[]) => !r.ok && (codes.includes(r.code) || codes.some((c) => r.err.includes(c)));
const strings = (v: Any): string[] => (typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === "object" ? Object.values(v).flatMap(strings) : []);
const keysDeep = (v: Any): string[] =>
  Array.isArray(v) ? v.flatMap(keysDeep) : v && typeof v === "object" ? Object.entries(v).flatMap(([k, x]) => [k, ...keysDeep(x)]) : [];
/** Date at Thai wall-clock y-m-d hh:mm (UTC+7) */
const th = (y: number, m: number, d: number, hh: number, mm = 0) => new Date(Date.UTC(y, m - 1, d, hh - 7, mm, 0, 0));
const near = (ms: number | null | undefined, d: Date, tol = 60_000) => typeof ms === "number" && Number.isFinite(ms) && Math.abs(ms - d.getTime()) <= tol;
const iso = (ms: number | null | undefined) => (typeof ms === "number" && Number.isFinite(ms) ? new Date(ms).toISOString() : String(ms));

// ─────────────────────────── state ───────────────────────────
const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-c22-${rand}`;
const NONE = `${TAG}-none`;
let seqNo = 0;
const nx = () => `${++seqNo}`;
const TENANTS: string[] = [];
const USERS: string[] = [];
const PII: string[] = [];
const pii = <T extends string>(s: T): T => {
  PII.push(s);
  return s;
};
let phoneSeq = 0;
const phoneOf = () => `08${String((Math.floor(Math.random() * 9_000_000) + 1_000_000) * 10 + (phoneSeq++ % 10)).padStart(8, "0").slice(-8)}`;
const mailOf = (s: string) => `${TAG}-${s}@qc-crm.example`;
const OPS_KEYS = [`minute-job:lease:${JOB}`, `minute-job:run:${JOB}`, `minute-job:ok:${JOB}`];
let opsSnap: { source: string; lastAlertAt: Date }[] | null = null;
const KIDS: ChildProcess[] = [];

/** fake senders — every call is recorded (the ATTEMPT is what "exactly once" counts) */
type Sent = { channel: string; to: string; subject: string; body: string; enrollmentId: string; contactId: string };
const SENT: Sent[] = [];
const mkDeps = (o: { delayMs?: number; onSend?: (r: Any) => Promise<void> } = {}) => {
  const f = (channel: string) => async (r: Any) => {
    SENT.push({ channel, to: String(r?.to ?? ""), subject: String(r?.subject ?? ""), body: String(r?.body ?? ""), enrollmentId: String(r?.enrollmentId ?? ""), contactId: String(r?.contactId ?? "") });
    if (o.onSend) await o.onSend(r);
    if (o.delayMs) await wait(o.delayMs);
    return { ok: true };
  };
  return { email: f("EMAIL"), line: f("LINE"), sms: f("SMS") };
};
const DEPS = mkDeps();
const sentTo = (to: string, channel?: string) => SENT.filter((s) => s.to === to && (!channel || s.channel === channel)).length;

console.log(`\n═══ QC CRM v2 · C2.2 — sequences ═══`);
console.log(`[env] DB ${host} · tag ${TAG}${missing.length ? ` · --force-run with ${missing.join(" · ")} (sequence checks below are expected red; CLEAN green)` : ""}\n`);

try {
  // ═════════════════════════════════════════════════════════════════════════════
  // modules · static sources
  // ═════════════════════════════════════════════════════════════════════════════
  let seqErr = "";
  const SEQ = (await import(SEQ_SPEC as string).catch((e: Any) => {
    seqErr = e instanceof Error ? e.message : String(e);
    return {};
  })) as Any;
  if (existsSync("src/lib/modules/crm/sequences-job.ts")) await import(SEQ_JOB_SPEC as string).catch(() => ({}));
  const CRM = (await import("@/lib/modules/crm" as string).catch(() => ({}))) as Any;
  const MJ = (await import("@/lib/platform/minute-jobs" as string).catch(() => ({}))) as Any;
  const OBX = (await import("@/lib/outbox-consumers" as string).catch(() => ({}))) as Any;
  const CONS: Any = OBX.consumers ?? {};
  const CT = CRM.contacts ?? {};
  const D = CRM.deals ?? {};
  const seqSrc = walk("src/lib/modules/crm").filter((f) => /\/sequences[^/]*\.tsx?$/.test(f)).map(read).join("\n");
  const brSrc = read(BR_SEQ_FILE);
  const consSrc = read(CONS_FILE);
  const tablesOk = ((await P.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('CrmSequence','CrmSequenceStep','CrmSequenceEnrollment')`,
  ).catch(() => [{ n: 0 }])) as Any[])[0]?.n === 3;
  const ABSENT = `${typeof SEQ.runDue === "function" ? "" : ` · sequences module ${existsSync(SEQ_FILE) && seqErr ? `failed to load (${cut(seqErr, 100)})` : "absent"}`}${tablesOk ? "" : " · C2.0 tables absent"}`;

  // ─────────── raw SQL helpers over the C2.0 tables (never the Prisma delegate — the client may predate C2.0) ───────────
  const q = async (sql: string, ...params: Any[]): Promise<Any[]> => ((await P.$queryRawUnsafe(sql, ...params).catch(() => [])) as Any[]) ?? [];
  const udtCache = new Map<string, string>();
  const udtOf = async (table: string, col: string) => {
    const k = `${table}.${col}`;
    if (!udtCache.has(k)) {
      const r = await q(`SELECT udt_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`, table, col);
      udtCache.set(k, String(r[0]?.udt_name ?? ""));
    }
    return udtCache.get(k) ?? "";
  };
  /** set a timestamp column of one enrollment (fixture: "make it due at the synthetic clock" / "a claim left this lease") */
  const setTs = async (id: string, col: "nextAt" | "leaseUntil", d: Date | null) => {
    if (!d) return P.$executeRawUnsafe(`UPDATE "CrmSequenceEnrollment" SET "${col}" = NULL WHERE id = $1`, id).catch(() => 0);
    const expr = (await udtOf("CrmSequenceEnrollment", col)) === "timestamptz" ? `$1::timestamptz` : `($1::timestamptz AT TIME ZONE 'UTC')`;
    return P.$executeRawUnsafe(`UPDATE "CrmSequenceEnrollment" SET "${col}" = ${expr} WHERE id = $2`, d.toISOString(), id).catch(() => 0);
  };
  const ENR_COLS = `id, "tenantId", "sequenceId", "contactId", "dealId", status::text AS status, "stepIndex", "sequenceVersion", "stoppedReason",
    "enrolledBy", (extract(epoch from "nextAt")*1000)::float8 AS "nextAtMs", (extract(epoch from "leaseUntil")*1000)::float8 AS "leaseMs",
    ("stoppedAt" IS NOT NULL) AS "hasStoppedAt"`;
  const enr = async (id: string): Promise<Any> => (await q(`SELECT ${ENR_COLS} FROM "CrmSequenceEnrollment" WHERE id = $1`, id))[0] ?? null;
  const enrOf = async (seqId: string, contactId: string): Promise<Any[]> =>
    q(`SELECT ${ENR_COLS} FROM "CrmSequenceEnrollment" WHERE "sequenceId" = $1 AND "contactId" = $2 ORDER BY "stepIndex" ASC, id ASC`, seqId, contactId);
  const activeOf = async (seqId: string, contactId: string) => (await enrOf(seqId, contactId)).filter((r) => r.status === "ACTIVE");
  const enrTxt = (r: Any) => (r ? `${r.status}/step${r.stepIndex}/v${r.sequenceVersion}/next=${iso(r.nextAtMs)}/lease=${iso(r.leaseMs)}/why=${r.stoppedReason ?? "-"}` : "(no row)");
  /** park every live enrollment of a tenant — keeps each block's runDue from touching the previous block's rows */
  const park = (tid: string) =>
    P.$executeRawUnsafe(`UPDATE "CrmSequenceEnrollment" SET status = 'STOPPED', "stoppedReason" = 'QC_PARK' WHERE "tenantId" = $1 AND status::text IN ('ACTIVE','PAUSED')`, tid).catch(() => 0);
  const stepRows = async (seqId: string) =>
    q(`SELECT "version", "index", kind::text AS kind, subject, "taskTitle" FROM "CrmSequenceStep" WHERE "sequenceId" = $1 ORDER BY "version", "index"`, seqId);
  const seqRow = async (seqId: string): Promise<Any> => (await q(`SELECT id, version, name FROM "CrmSequence" WHERE id = $1`, seqId))[0] ?? null;

  // ═════════════════════════════════════════════════════════════════════════════
  // SETUP — tA main (crmA v2 + crmA2 v2 second system) · tB other tenant · tV uiVersion lab (crmV1 at 1 · crmVx 2→1→2)
  // ═════════════════════════════════════════════════════════════════════════════
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const mkUser = async (suffix: string) => {
    const u = await P.user.create({ data: { email: `${TAG}${suffix}@qc.invalid`, name: `QC ${suffix || "owner"} ${TAG}` } });
    USERS.push(u.id);
    return u.id as string;
  };
  const userA = await mkUser("");
  const userS = await mkUser("-staff");
  const STAFF_PERMS = { "crm.contact.read": true, "crm.contact.update": true, "crm.sequence.enroll": true };
  const mkTenant = async (suffix: string) => {
    const t = await P.tenant.create({ data: { name: `${TAG}-${suffix}`, slug: `${TAG}-${suffix}` } });
    TENANTS.push(t.id);
    await P.membership.create({ data: { userId: userA, tenantId: t.id, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
    await P.membership.create({ data: { userId: userS, tenantId: t.id, role: "STAFF", unitAccess: ["*"], permissions: STAFF_PERMS, acceptedAt: new Date() } });
    return t.id as string;
  };
  const mk = async (tid: string, type: string, label: string) => (await sysSvc.createSystem(tid, type, `${label} ${TAG}`)).id as string;
  const setCrm = (sysId: string, obj: Record<string, unknown>) =>
    P.$executeRawUnsafe(
      `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END, '{crm}',
        (CASE WHEN jsonb_typeof("settings"->'crm') = 'object' THEN "settings"->'crm' ELSE '{}'::jsonb END) || $1::jsonb, true) WHERE "id" = $2`,
      JSON.stringify(obj), sysId);
  const crmSettings = async (sysId: string): Promise<Any> => ((await P.appSystem.findFirst({ where: { id: sysId }, select: { settings: true } }))?.settings as Any)?.crm ?? {};

  const tidA = await mkTenant("a");
  const crmA = await mk(tidA, "CRM", "CRM");
  const crmA2 = await mk(tidA, "CRM", "CRM สอง");
  const tidB = await mkTenant("b");
  const crmB = await mk(tidB, "CRM", "CRM-B");
  const tidV = await mkTenant("v");
  const crmV1 = await mk(tidV, "CRM", "CRM-V1");
  const crmVx = await mk(tidV, "CRM", "CRM-VX");
  const HOLIDAY = "2026-09-11";
  const CAL = { businessDays: [1, 2, 3, 4, 5], holidays: [{ date: HOLIDAY, name: "วันหยุดทดสอบ" }] };
  await setCrm(crmA, { uiVersion: 2, bridgesEnabled: true, ...CAL });
  await setCrm(crmA2, { uiVersion: 2, bridgesEnabled: true, qcMarker: TAG });
  await setCrm(crmB, { uiVersion: 2, bridgesEnabled: true, ...CAL });
  await setCrm(crmV1, { uiVersion: 1, bridgesEnabled: true });
  await setCrm(crmVx, { uiVersion: 2, bridgesEnabled: true, ...CAL });
  const MY = [tidA, tidB, tidV];
  const owner = { userId: userA, role: "OWNER", unitAccess: [] as string[], permissions: {} as Record<string, unknown> };
  const staff = { userId: userS, role: "STAFF", unitAccess: [] as string[], permissions: STAFF_PERMS as Record<string, unknown> };
  const cA = { tenantId: tidA, systemId: crmA, actorUserId: userA };
  const cA2 = { tenantId: tidA, systemId: crmA2, actorUserId: userA };
  const cAs = { tenantId: tidA, systemId: crmA, actorUserId: userS };
  const cB = { tenantId: tidB, systemId: crmB, actorUserId: userA };
  const cV1 = { tenantId: tidV, systemId: crmV1, actorUserId: userA };
  const cVx = { tenantId: tidV, systemId: crmVx, actorUserId: userA };

  /** contact fixture (raw row — the contacts service is not under test here) */
  const mkContact = async (tid: string, sys: string, label: string, o: { email?: string | null; line?: boolean; ownerUserId?: string | null; optOut?: boolean } = {}) => {
    const first = pii(`${label}${rand}`);
    const email = o.email === null ? null : pii(o.email ?? mailOf(`${label}-${nx()}`));
    const phone = pii(phoneOf());
    const lineUserId = o.line ? pii(`U${rand}${nx()}${"0".repeat(20)}`.slice(0, 33)) : null;
    const row = await P.crmContact.create({
      data: { tenantId: tid, systemId: sys, name: pii(`${first} นามสกุล`), firstName: first, email, phone, lineUserId, ownerUserId: o.ownerUserId === undefined ? userA : o.ownerUserId, marketingOptOut: o.optOut === true },
    });
    return { id: row.id as string, email: email ?? "", first, line: lineUserId ?? "" };
  };
  /** consent row (append-only table — `at` lets a later row win deterministically) */
  const consent = (tid: string, sys: string, contactId: string, channel: string, granted: boolean, at?: Date) =>
    P.crmContactConsent.create({ data: { tenantId: tid, systemId: sys, contactId, channel, granted, source: "STAFF", ...(at ? { createdAt: at } : {}) } });
  const granted = async (tid: string, sys: string, k: { id: string }, ...ch: string[]) => {
    for (const c of ch) await consent(tid, sys, k.id, c, true, new Date(Date.now() - 120_000));
  };

  const OPEN = { businessDaysOnly: false, sendWindow: null };
  const BIZ = { businessDaysOnly: true, sendWindow: { from: "09:00", to: "18:00" } };
  const sid = (v: Any): string => {
    const x = typeof v === "string" ? v : (v?.sequence?.id ?? v?.id ?? "");
    return typeof x === "string" && x ? x : NONE;
  };
  const mkSeq = async (c: Any, name: string, steps: Any[], extra: Record<string, unknown> = {}, actor: Any = owner) => {
    const r = await call(SEQ.createSequence, c, actor, { name: `${name} ${TAG}`, stopOnReply: true, stopOnWon: true, stopOnLost: true, ...OPEN, ...extra, steps });
    return { r, id: sid(r.v) };
  };
  const EMAIL = (subject: string, body = "เรียนคุณ {{contact.firstName}} ขอบคุณที่สนใจค่ะ") => ({ kind: "EMAIL", subject, body });
  const WAIT = (waitDays: number, waitHours = 0) => ({ kind: "WAIT", waitDays, waitHours });
  const TASK = (taskTitle: string) => ({ kind: "TASK", taskTitle, taskType: "TASK" });
  const LINE = (body: string) => ({ kind: "LINE", body });
  const enroll = (c: Any, actor: Any, sequenceId: string, contactId: string, extra: Record<string, unknown> = {}) =>
    call(SEQ.enroll, c, actor, { sequenceId, contactId, ...extra });
  const eidOf = async (r: Res, seqId: string, contactId: string): Promise<string> => {
    const v = r.v;
    const x = typeof v === "string" ? v : (v?.enrollmentId ?? v?.enrollment?.id ?? v?.id ?? "");
    if (typeof x === "string" && x) return x;
    return ((await activeOf(seqId, contactId))[0]?.id as string | undefined) ?? NONE;
  };
  /** enroll + id in one go (fixture) */
  const enrolled = async (c: Any, seqId: string, contactId: string, extra: Record<string, unknown> = {}) => eidOf(await enroll(c, owner, seqId, contactId, extra), seqId, contactId);
  const runDue = (now: Date, extra: Record<string, unknown> = {}) => call(SEQ.runDue, now, { deps: DEPS, tenantIds: [tidA], ...extra });
  const getEnr = (c: Any, id: string, actor: Any = owner) => call(SEQ.getEnrollment, c, actor, id);
  const outcomeAt = (dto: Any, index: number): { outcome: string; reason: string } => {
    const list = (Array.isArray(dto?.steps) ? dto.steps : Array.isArray(dto?.log) ? dto.log : []) as Any[];
    const hit = [...list].reverse().find((s) => Number(s?.index) === index);
    return { outcome: String(hit?.outcome ?? hit?.status ?? ""), reason: String(hit?.reason ?? "") };
  };
  const evts = async (tids: string[], type: string) => (await P.outboxEvent.findMany({ where: { tenantId: { in: tids }, type }, orderBy: { createdAt: "asc" } })) as Any[];
  const finishedOf = async (enrollmentId: string) => (await evts(MY, "crm.sequence.finished")).filter((o) => o.payload?.enrollmentId === enrollmentId);
  const evtOf = (row: Any) => ({ id: row.id, tenantId: row.tenantId, type: row.type, payload: row.payload, systemId: row.systemId, unitId: row.unitId });
  const consume = async (evt: Any) => call(CONS?.[evt?.type], evt);
  /** consume our own tenant's events of these types created since `since` (no global drain — COMMON) */
  const consumeOurs = async (tid: string, types: string[], since: Date) => {
    const rows = (await P.outboxEvent.findMany({ where: { tenantId: tid, type: { in: types }, createdAt: { gte: since } }, orderBy: { createdAt: "asc" } })) as Any[];
    const res: Res[] = [];
    for (const r of rows) res.push(await consume(evtOf(r)));
    return { rows, res };
  };
  const tasksOf = async (tid: string, contactId: string, title: string) => (await P.crmActivity.findMany({ where: { tenantId: tid, contactId, title } })) as Any[];
  const auditOf = async (tid: string) => (await P.auditLog.findMany({ where: { tenantId: tid, action: { startsWith: "crm.sequence" } } })) as Any[];

  // pipeline + lost reason for S3 (won / lost)
  const STD = [
    { name: "ผู้สนใจใหม่", kind: "OPEN", probability: 10 }, { name: "ต่อรอง", kind: "OPEN", probability: 40 },
    { name: "ชนะ", kind: "WON", probability: 100 }, { name: "แพ้", kind: "LOST", probability: 0 },
  ];
  const pipe = (await P.crmPipeline.create({
    data: { tenantId: tidA, systemId: crmA, name: `ขาย ${TAG}`, stages: { create: STD.map((s, i) => ({ tenantId: tidA, systemId: crmA, sortOrder: i, ...s })) } },
    include: { stages: true },
  })) as Any;
  const ST = [...(pipe.stages as Any[])].sort((a, b) => a.sortOrder - b.sortOrder).map((s) => s.id as string);
  const lostReason = (await P.crmLostReason.create({ data: { tenantId: tidA, systemId: crmA, key: `price-${rand}`, label: "ราคาสูงไป" } })).id as string;
  const mkDeal = async (contactId: string) => {
    const title = pii(`ดีลลับ ${nx()} ${rand}`);
    const r = await call(D.createDeal, cA, owner, { pipelineId: pipe.id, stageId: ST[0], title, contactId, valueSatang: 100_000 });
    let id = String(r.v?.deal?.id ?? r.v?.id ?? "");
    if (!id || !(await P.crmDeal.findFirst({ where: { id } }))) {
      id = (await P.crmDeal.create({ data: { tenantId: tidA, systemId: crmA, contactId, pipelineId: pipe.id, stageId: ST[0], title, valueSatang: 100_000, ownerUserId: userA } })).id;
    }
    return id;
  };

  // snapshot the shared dispatcher state of our job (restored in finally)
  opsSnap = (await P.opsAlertState.findMany({ where: { source: { in: OPS_KEYS } }, select: { source: true, lastAlertAt: true } }).catch(() => [])) as Any[];

  // ═════════════════════════════════════════════════════════════════════════════
  // S7 — the minute job (run FIRST: the real job uses the real senders, so only WAIT/TASK rows of ours may be due while it runs)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("── S7 · minute job · loop until quiet ──");
  {
    const reg = (globalThis as Any)[Symbol.for("shark.platform.minute-jobs.registry")] as Map<string, Any> | undefined;
    const job = reg?.get(JOB);
    const st = typeof MJ.getMinuteJobStatus === "function" ? ((await MJ.getMinuteJobStatus([JOB]).catch(() => [])) as Any[]) : [];
    const cron = read(CRON_FILE);
    const cronImports = /crm\/sequences(-job)?["']/.test(cron);
    chk("C2.2-S7.1", `importing the sequences module registers the minute job "${JOB}" — everyMinutes 5 · cadence "minute" · not vpsOnly — and scripts/crm-cron.mts imports it (R-C.6: the runner is the only path to production)`,
      !!job && job.everyMinutes === 5 && (job.cadence ?? "minute") === "minute" && job.vpsOnly !== true && st[0]?.everyMinutes === 5 && cronImports,
      "registered 5/minute · runner imports", `job=${job ? `${job.everyMinutes}/${job.cadence}/vps=${job.vpsOnly}` : "none"} status=${st[0]?.everyMinutes ?? "-"} cronImports=${cronImports}${ABSENT}`);
  }
  const seqL = await mkSeq(cA, "วนจนเงียบ", [WAIT(0, 1), TASK(`ปิดท้ายลูป ${rand}`)]);
  {
    // loop until quiet: 23 due rows, batchSize 5 ⇒ one call must process all of them (5 batches), each exactly once
    const ks = await Promise.all(Array.from({ length: 23 }, (_, i) => mkContact(tidA, crmA, `ลูป${i}`)));
    const ids: string[] = [];
    for (const k of ks) ids.push(await enrolled(cA, seqL.id, k.id));
    const now = new Date(Date.now() + 1_000);
    const r = await runDue(now, { batchSize: 5 });
    const rows = await Promise.all(ids.map(enr));
    const advanced = rows.filter((x) => x && x.status === "ACTIVE" && Number(x.stepIndex) === 1).length;
    const tooFar = rows.filter((x) => x && Number(x.stepIndex) > 1).length;
    const r2 = await runDue(new Date(now.getTime() + 500), { batchSize: 5 });
    const rows2 = await Promise.all(ids.map(enr));
    const still = rows2.filter((x) => x && Number(x.stepIndex) === 1).length;
    chk("C2.2-S7.2", "runDue loops batch after batch until quiet: 23 due rows with batchSize 5 are ALL advanced by ONE call (WAIT executed ⇒ stepIndex 1, nextAt = now + 1 h), none twice; a second call right after executes nothing",
      r.ok && advanced === 23 && tooFar === 0 && r2.ok && still === 23, "23 advanced once", `ok=${r.ok}${r.ok ? "" : ` ${r.err}`} advanced=${advanced}/23 tooFar=${tooFar} after2nd=${still}${ABSENT}`);
  }
  await park(tidA);
  {
    // budget: a spent deadline stops the loop early; the rest is picked by the next call, nothing executed twice · then the REAL job
    const ks = await Promise.all(Array.from({ length: 12 }, (_, i) => mkContact(tidA, crmA, `งบ${i}`)));
    const ids: string[] = [];
    for (const k of ks) ids.push(await enrolled(cA, seqL.id, k.id));
    const now = new Date(Date.now() + 1_000);
    const t0 = Date.now();
    const cutShort = await runDue(now, { batchSize: 3, deadline: Date.now() - 1 });
    const tookMs = Date.now() - t0;
    const afterCut = (await Promise.all(ids.map(enr))).filter((x) => x && Number(x.stepIndex) >= 1).length;
    // the real minute job through the dispatcher — our 12 rows (WAIT only ⇒ no send) must be finished by it
    await P.opsAlertState.deleteMany({ where: { source: { in: OPS_KEYS } } }).catch(() => 0);
    const tick = typeof MJ.runMinuteJobs === "function" ? await MJ.runMinuteJobs(new Date(now.getTime() + 1_000)).catch((e: unknown) => ({ error: String(e) })) : null;
    const outcome = (tick?.results as Any[] | undefined)?.find((x) => x.name === JOB)?.outcome ?? "absent";
    const rows = await Promise.all(ids.map(enr));
    const once = rows.filter((x) => x && x.status === "ACTIVE" && Number(x.stepIndex) === 1).length;
    const tick2 = typeof MJ.runMinuteJobs === "function" ? await MJ.runMinuteJobs(new Date(now.getTime() + 2_000)).catch(() => null) : null;
    const outcome2 = (tick2?.results as Any[] | undefined)?.find((x) => x.name === JOB)?.outcome ?? "absent";
    chk("C2.2-S7.3", "budget: runDue with a deadline already spent returns promptly (< 5 s) having executed at most one batch; the real dispatcher tick (runMinuteJobs) then runs crm.sequences → \"ok\" and finishes every remaining row exactly once; a second tick in the same 5-minute window → \"not-due\"",
      cutShort.ok && tookMs < 5_000 && afterCut <= 3 && outcome === "ok" && once === 12 && outcome2 === "not-due",
      "≤ 1 batch · ok · 12 once · not-due", `cut ok=${cutShort.ok} ${tookMs}ms done=${afterCut} · tick=${outcome} once=${once}/12 · tick2=${outcome2}${ABSENT}`);
  }
  await park(tidA);
  if (opsSnap) {
    await P.opsAlertState.deleteMany({ where: { source: { in: OPS_KEYS } } }).catch(() => 0);
    for (const s of opsSnap) await P.opsAlertState.create({ data: { source: s.source, lastAlertAt: s.lastAlertAt } }).catch(() => 0);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S1 — enroll · CONFLICT · replace
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S1 · enroll ──");
  const seq1 = await mkSeq(cA, "ติดตามใบเสนอราคา", [EMAIL("ติดตามใบเสนอราคา {{contact.firstName}}"), WAIT(3), TASK(`โทรติดตาม ${rand}`)]);
  const k1 = await mkContact(tidA, crmA, "สมหญิง");
  let e1 = NONE;
  {
    const t0 = Date.now();
    const r = await enroll(cA, owner, seq1.id, k1.id);
    e1 = await eidOf(r, seq1.id, k1.id);
    const row = await enr(e1);
    const act = await activeOf(seq1.id, k1.id);
    const ev = (await evts([tidA], "crm.sequence.enrolled")).filter((o) => o.payload?.enrollmentId === e1);
    chk("C2.2-S1.1", "enroll creates ONE ACTIVE row: stepIndex 0 · sequenceVersion = sequence.version (1) · nextAt ≈ now · enrolledBy \"USER:<actor>\" · one crm.sequence.enrolled event in the same transaction",
      seq1.r.ok && r.ok && act.length === 1 && row?.status === "ACTIVE" && Number(row?.stepIndex) === 0 && Number(row?.sequenceVersion) === 1 &&
        typeof row?.nextAtMs === "number" && row.nextAtMs <= Date.now() + 5_000 && row.nextAtMs >= t0 - 60_000 && String(row?.enrolledBy ?? "") === `USER:${userA}` && ev.length === 1,
      "1 ACTIVE · step 0 · v1 · event", `create=${seq1.r.ok ? "ok" : seq1.r.err} enroll=${r.ok ? "ok" : r.err} active=${act.length} ${enrTxt(row)} by=${row?.enrolledBy} ev=${ev.length}${ABSENT}`);
  }
  {
    const r = await enroll(cA, owner, seq1.id, k1.id);
    const act = await activeOf(seq1.id, k1.id);
    chk("C2.2-S1.2", "enrolling the same contact again ⇒ CONFLICT with a calm Thai message (mentions it is already in the sequence, offers \"replace\") · still exactly one ACTIVE, the original row untouched",
      isRefusal(r, ["CONFLICT"]) && thai(r.msg) && act.length === 1 && act[0]?.id === e1, "CONFLICT · 1 ACTIVE", `${r.ok ? `ok ${cut(j(r.v), 80)}` : r.err} active=${act.length} same=${act[0]?.id === e1}${ABSENT}`);
  }
  {
    const r = await enroll(cA, owner, seq1.id, k1.id, { replace: true });
    const all = await enrOf(seq1.id, k1.id);
    const old = all.find((x) => x.id === e1);
    const act = all.filter((x) => x.status === "ACTIVE");
    chk("C2.2-S1.3", "enroll with replace:true ⇒ the old enrollment is STOPPED (stoppedReason contains REPLACE, stoppedAt set) and a NEW ACTIVE row starts at step 0 on the current version — still exactly one ACTIVE",
      r.ok && old?.status === "STOPPED" && /REPLACE/i.test(String(old?.stoppedReason ?? "")) && old?.hasStoppedAt === true && act.length === 1 && act[0]?.id !== e1 && Number(act[0]?.stepIndex) === 0,
      "old STOPPED · new ACTIVE", `${r.ok ? "ok" : r.err} old=${enrTxt(old)} active=${act.length} new=${enrTxt(act[0])}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X3 — parallel enrolls (10 × 2 rounds + replace storm) · parallel stops
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X3 · races ──");
  {
    const probs: string[] = [];
    for (let round = 1; round <= 2; round += 1) {
      const k = await mkContact(tidA, crmA, `แข่ง${round}`);
      const rs = await Promise.all(Array.from({ length: 10 }, () => enroll(cA, owner, seq1.id, k.id)));
      const act = await activeOf(seq1.id, k.id);
      const oks = rs.filter((x) => x.ok).length;
      const bad = rs.filter((x) => !x.ok && x.code !== "CONFLICT");
      if (act.length !== 1 || oks !== 1 || bad.length) probs.push(`r${round}: active=${act.length} ok=${oks} other=${cut(bad[0]?.err, 80)}`);
      const rr = await Promise.all(Array.from({ length: 10 }, () => enroll(cA, owner, seq1.id, k.id, { replace: true })));
      const act2 = await activeOf(seq1.id, k.id);
      const bad2 = rr.filter((x) => !x.ok && x.code !== "CONFLICT");
      if (act2.length !== 1 || bad2.length) probs.push(`r${round} replace: active=${act2.length} other=${cut(bad2[0]?.err, 80)}`);
    }
    chk("C2.2-X3.1", "X3: 10 parallel enrolls of the same contact (× 2 rounds) ⇒ exactly ONE ACTIVE and one success, the other nine answer CONFLICT (never a 500 from the unique index) · 10 parallel replace:true ⇒ still exactly one ACTIVE",
      probs.length === 0 && typeof SEQ.enroll === "function", "1 ACTIVE each time", `${probs.join(" · ") || "-"}${ABSENT}`);
  }
  {
    const k = await mkContact(tidA, crmA, "หยุดพร้อม");
    const e = await enrolled(cA, seq1.id, k.id);
    const rs = await Promise.all([
      ...Array.from({ length: 5 }, () => call(SEQ.stop, cA, owner, e, { reason: "หยุดมือพร้อมกัน" })),
      ...Array.from({ length: 5 }, () => call(SEQ.stopFor, { tenantId: tidA, systemId: crmA }, k.id, "REPLY")),
    ]);
    const row = await enr(e);
    const fin = await finishedOf(e);
    const bad = rs.filter((x) => !x.ok && !["CONFLICT", "NOT_FOUND"].includes(x.code));
    chk("C2.2-X3.2", "X3: 5 parallel stop() + 5 parallel stopFor() on the same ACTIVE enrollment ⇒ ONE transition to STOPPED and exactly ONE crm.sequence.finished event (conditional update, not read-then-write)",
      row?.status === "STOPPED" && fin.length === 1 && bad.length === 0, "1 STOPPED · 1 event", `${enrTxt(row)} finished=${fin.length} errors=${cut(bad[0]?.err, 80) || "-"}${ABSENT}`);
  }
  await park(tidA);

  // ═════════════════════════════════════════════════════════════════════════════
  // S2 — runDue step kinds · business days · send window
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S2 · runDue ──");
  let e21 = NONE;
  {
    const seq = await mkSeq(cA, "อีเมลเดียว", [EMAIL("สวัสดีคุณ {{contact.firstName}}", "เรียนคุณ {{contact.firstName}} ขอบคุณที่แวะมาค่ะ")]);
    const k = await mkContact(tidA, crmA, "มานี");
    await granted(tidA, crmA, k, "EMAIL");
    e21 = await enrolled(cA, seq.id, k.id);
    const r = await runDue(new Date(Date.now() + 1_000));
    const mine = SENT.filter((s) => s.to === k.email);
    await runDue(new Date(Date.now() + 2_000));
    const again = sentTo(k.email);
    const rendered = mine[0] && mine[0].subject.includes(k.first) && mine[0].body.includes(k.first) && !/\{\{/.test(mine[0].subject + mine[0].body);
    chk("C2.2-S2.1", "EMAIL step → the e-mail sender is called ONCE with to = contact.email and {{contact.firstName}} rendered in subject and body · a second runDue sends nothing more",
      r.ok && mine.length === 1 && mine[0]?.channel === "EMAIL" && rendered && again === 1, "1 rendered send", `ok=${r.ok}${r.ok ? "" : ` ${r.err}`} sends=${mine.length}→${again} subj=${cut(mine[0]?.subject, 60)}${ABSENT}`);
  }
  {
    const seq = await mkSeq(cA, "ไม่มีอีเมล", [EMAIL("ข่าวดี {{contact.firstName}}"), TASK(`โทรแทนอีเมล ${rand}`)]);
    const k = await mkContact(tidA, crmA, "ไร้อีเมล", { email: null });
    await granted(tidA, crmA, k, "EMAIL");
    const e = await enrolled(cA, seq.id, k.id);
    const before = SENT.length;
    await runDue(new Date(Date.now() + 1_000));
    const row = await enr(e);
    const dto = (await getEnr(cA, e)).v;
    const o = outcomeAt(dto, 0);
    const tasks = await tasksOf(tidA, k.id, `โทรแทนอีเมล ${rand}`);
    chk("C2.2-S2.2", "EMAIL step for a contact WITHOUT an e-mail address ⇒ nothing sent, step 0 outcome SKIPPED with a Thai reason, and the enrollment MOVES ON (the TASK after it is executed — blueprint §11.5 \"skip to the next step\")",
      SENT.length === before && o.outcome === "SKIPPED" && thai(o.reason) && tasks.length === 1 && row?.status === "DONE", "skipped · moved on",
      `sent=${SENT.length - before} outcome=${o.outcome}/${cut(o.reason, 60)} tasks=${tasks.length} ${enrTxt(row)}${ABSENT}`);
  }
  // synthetic Thai clocks (all in the PAST, Sep 2026; settings.crm.businessDays Mon–Fri, holiday 2026-09-11 Fri)
  const seqW = await mkSeq(cA, "รอหนึ่งวันทำการ", [WAIT(1), TASK(`หลังรอ ${rand}`)], BIZ);
  const seqW2h = await mkSeq(cA, "รอสองชั่วโมง", [WAIT(0, 2), TASK(`หลังรอสองชั่วโมง ${rand}`)], BIZ);
  const seqC = await mkSeq(cA, "รอตามปฏิทิน", [WAIT(1), TASK(`หลังรอปฏิทิน ${rand}`)], OPEN);
  const waitCase = async (seqId: string, label: string, now: Date) => {
    const k = await mkContact(tidA, crmA, label);
    const e = await enrolled(cA, seqId, k.id);
    await setTs(e, "nextAt", new Date(now.getTime() - 60_000));
    const r = await runDue(now);
    return { r, row: await enr(e) };
  };
  {
    const fri = th(2026, 9, 4, 10, 0);
    const a = await waitCase(seqW.id, "รอศุกร์", fri);
    const mon = th(2026, 9, 7, 10, 0);
    const late = th(2026, 9, 7, 17, 30);
    const b = await waitCase(seqW2h.id, "รอเย็น", late);
    const tue9 = th(2026, 9, 8, 9, 0);
    chk("C2.2-S2.3", "WAIT counts BUSINESS days and respects the window: Fri 10:00 (Thai) + 1 business day ⇒ Mon 10:00 (weekend skipped) · Mon 17:30 + 2 h = 19:30 outside 09:00–18:00 ⇒ Tue 09:00 · the WAIT itself advances stepIndex to 1",
      a.r.ok && Number(a.row?.stepIndex) === 1 && near(a.row?.nextAtMs, mon) && b.r.ok && Number(b.row?.stepIndex) === 1 && near(b.row?.nextAtMs, tue9),
      `${mon.toISOString()} · ${tue9.toISOString()}`, `a=${enrTxt(a.row)} b=${enrTxt(b.row)}${a.r.ok ? "" : ` ${a.r.err}`}${ABSENT}`);
  }
  {
    const thu = th(2026, 9, 10, 10, 0);
    const a = await waitCase(seqW.id, "รอวันหยุด", thu);
    const mon = th(2026, 9, 14, 10, 0);
    const fri = th(2026, 9, 4, 10, 0);
    const b = await waitCase(seqC.id, "รอปฏิทิน", fri);
    const sat = th(2026, 9, 5, 10, 0);
    chk("C2.2-S2.4", `holidays (settings.crm.holidays) are not business days: Thu 10 Sep 10:00 + 1 business day with ${HOLIDAY} a holiday ⇒ Mon 14 Sep 10:00 · a sequence with businessDaysOnly=false counts calendar days: Fri 10:00 + 1 day ⇒ Sat 10:00`,
      a.r.ok && near(a.row?.nextAtMs, mon) && b.r.ok && near(b.row?.nextAtMs, sat), `${mon.toISOString()} · ${sat.toISOString()}`, `holiday=${enrTxt(a.row)} calendar=${enrTxt(b.row)}${ABSENT}`);
  }
  {
    const seq = await mkSeq(cA, "อีเมลในเวลา", [EMAIL("แจ้งข่าว {{contact.firstName}}")], BIZ);
    const k = await mkContact(tidA, crmA, "ดึกดื่น");
    await granted(tidA, crmA, k, "EMAIL");
    const e = await enrolled(cA, seq.id, k.id);
    const night = th(2026, 9, 15, 22, 0);
    await setTs(e, "nextAt", new Date(night.getTime() - 60_000));
    const r1 = await runDue(night);
    const sent1 = sentTo(k.email);
    const row1 = await enr(e);
    const open = th(2026, 9, 16, 9, 0);
    const r2 = await runDue(open);
    const sent2 = sentTo(k.email);
    const row2 = await enr(e);
    chk("C2.2-S2.5", "sendWindow: an EMAIL step due Tue 22:00 (Thai) is NOT sent; it stays on the same step with nextAt = Wed 09:00 · runDue at Wed 09:00 sends it exactly once and the single-step enrollment is DONE",
      r1.ok && sent1 === 0 && Number(row1?.stepIndex) === 0 && row1?.status === "ACTIVE" && near(row1?.nextAtMs, open) && r2.ok && sent2 === 1 && row2?.status === "DONE",
      `deferred to ${open.toISOString()} · then 1 send`, `night sent=${sent1} ${enrTxt(row1)} · open sent=${sent2} ${enrTxt(row2)}${ABSENT}`);
  }
  {
    const seq = await mkSeq(cA, "ทวงทางไลน์", [LINE("รบกวนสอบถามความคืบหน้าค่ะ")]);
    const kNo = await mkContact(tidA, crmA, "ไลน์ไม่ยินยอม", { line: true });
    const kYes = await mkContact(tidA, crmA, "ไลน์ยินยอม", { line: true });
    await granted(tidA, crmA, kYes, "LINE");
    const eNo = await enrolled(cA, seq.id, kNo.id);
    const eYes = await enrolled(cA, seq.id, kYes.id);
    const r = await runDue(new Date(Date.now() + 1_000));
    const o = outcomeAt((await getEnr(cA, eNo)).v, 0);
    chk("C2.2-S2.6", "LINE step: a contact with a LINE id but NO LINE consent ⇒ nothing sent, outcome SKIPPED + Thai reason · a contact with consent ⇒ the LINE sender is called once with to = lineUserId",
      r.ok && sentTo(kNo.line, "LINE") === 0 && o.outcome === "SKIPPED" && thai(o.reason) && sentTo(kYes.line, "LINE") === 1 && !!eYes,
      "skip · 1 send", `no=${sentTo(kNo.line)} outcome=${o.outcome}/${cut(o.reason, 50)} yes=${sentTo(kYes.line, "LINE")}${ABSENT}`);
  }
  {
    const title = `งานติดตาม ${rand}`;
    const seq = await mkSeq(cA, "สร้างงาน", [TASK(title)]);
    const k = await mkContact(tidA, crmA, "มีงาน", { ownerUserId: userS });
    const e = await enrolled(cA, seq.id, k.id);
    await runDue(new Date(Date.now() + 1_000));
    // replay: pretend the step was not recorded (crash after the activity insert, before the advance) — the dedupe key must hold
    await P.$executeRawUnsafe(`UPDATE "CrmSequenceEnrollment" SET status = 'ACTIVE', "stepIndex" = 0, "leaseUntil" = NULL WHERE id = $1`, e).catch(() => 0);
    await setTs(e, "nextAt", new Date(Date.now() - 1_000));
    await runDue(new Date(Date.now() + 1_000));
    const t = await tasksOf(tidA, k.id, title);
    chk("C2.2-S2.7", "TASK step → exactly ONE CrmActivity (type TASK, title = taskTitle, contactId, owner = the contact's owner when there is no deal, source ≠ MANUAL) — re-executing the same step (crash replay) does not create a second one",
      t.length === 1 && t[0]?.type === "TASK" && t[0]?.ownerUserId === userS && String(t[0]?.source) !== "MANUAL", "1 activity",
      `activities=${t.length} type=${t[0]?.type} owner=${t[0]?.ownerUserId === userS ? "contact owner" : t[0]?.ownerUserId} source=${t[0]?.source}${ABSENT}`);
  }
  {
    const row = await enr(e21);
    const fin = await finishedOf(e21);
    chk("C2.2-S2.8", "past the last step ⇒ status DONE, nextAt null, lease cleared, and exactly ONE crm.sequence.finished { status: \"DONE\" } for that enrollment",
      row?.status === "DONE" && row?.nextAtMs === null && row?.leaseMs === null && fin.length === 1 && fin[0]?.payload?.status === "DONE", "DONE · 1 event",
      `${enrTxt(row)} finished=${fin.length} status=${fin[0]?.payload?.status}${ABSENT}`);
  }
  await park(tidA);

  // ═════════════════════════════════════════════════════════════════════════════
  // S3 — five stop causes (reply · won · lost · opt-out · bounce)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S3 · auto-stop ──");
  const seqR = await mkSeq(cA, "หยุดอัตโนมัติ", [EMAIL("ครั้งแรก {{contact.firstName}}"), WAIT(2), EMAIL("ครั้งที่สอง")]);
  const seqR2 = await mkSeq(cA, "ไม่หยุดเมื่อชนะ", [WAIT(2), EMAIL("หลังชนะ")], { stopOnWon: false });
  const stoppedAs = async (e: string, re: RegExp) => {
    const row = await enr(e);
    const fin = await finishedOf(e);
    return { ok: row?.status === "STOPPED" && re.test(String(row?.stoppedReason ?? "")) && row?.hasStoppedAt === true && fin.length === 1 && fin[0]?.payload?.status === "STOPPED", txt: `${enrTxt(row)} finished=${fin.length}` };
  };
  {
    const k = await mkContact(tidA, crmA, "ตอบกลับ");
    await granted(tidA, crmA, k, "EMAIL");
    const e = await enrolled(cA, seqR.id, k.id);
    const r = await call(SEQ.stopFor, { tenantId: tidA, systemId: crmA }, k.id, "REPLY");
    await runDue(new Date(Date.now() + 1_000));
    const s = await stoppedAs(e, /REPLY/i);
    chk("C2.2-S3.1", "reply: stopFor(ctx, contactId, \"REPLY\") (the entry C2.4/C2.5 call) ⇒ STOPPED reason REPLY + one finished event · runDue afterwards sends nothing",
      r.ok && s.ok && sentTo(k.email) === 0, "STOPPED REPLY", `${r.ok ? `ok(${j(r.v)})` : r.err} ${s.txt} sent=${sentTo(k.email)}${ABSENT}`);
  }
  let wonEvt: Any = null;
  let eWon = NONE;
  {
    const k = await mkContact(tidA, crmA, "ชนะดีล");
    const deal = await mkDeal(k.id);
    eWon = await enrolled(cA, seqR.id, k.id, { dealId: deal });
    const eKeep = await enrolled(cA, seqR2.id, k.id, { dealId: deal });
    const since = new Date(Date.now() - 1_000);
    const mv = await call(D.moveDeal, cA, owner, deal, { stageId: ST[2] });
    const { rows, res } = await consumeOurs(tidA, ["crm.deal.won"], since);
    wonEvt = rows.find((x) => x.payload?.dealId === deal) ?? null;
    const s = await stoppedAs(eWon, /WON/i);
    const keep = await enr(eKeep);
    chk("C2.2-S3.2", "won: moveDeal → WON emits crm.deal.won; its consumer stops the deal's enrollment in a stopOnWon sequence (STOPPED reason WON + one finished event) while the stopOnWon=false sequence stays ACTIVE",
      mv.ok && !!wonEvt && res.every((x) => x.ok) && s.ok && keep?.status === "ACTIVE", "WON stop · other ACTIVE",
      `move=${mv.ok ? "ok" : mv.err} evt=${!!wonEvt} consume=${res.map((x) => (x.ok ? "ok" : x.err)).join(",") || "-"} ${s.txt} keep=${enrTxt(keep)}${ABSENT}`);
  }
  {
    const k = await mkContact(tidA, crmA, "แพ้ดีล");
    const deal = await mkDeal(k.id);
    const e = await enrolled(cA, seqR.id, k.id, { dealId: deal });
    const since = new Date(Date.now() - 1_000);
    const mv = await call(D.moveDeal, cA, owner, deal, { stageId: ST[3], lostReasonId: lostReason });
    const { res } = await consumeOurs(tidA, ["crm.deal.lost"], since);
    const s = await stoppedAs(e, /LOST/i);
    chk("C2.2-S3.3", "lost: moveDeal → LOST emits crm.deal.lost; its consumer stops the deal's enrollment (STOPPED reason LOST + one finished event)",
      mv.ok && res.length > 0 && res.every((x) => x.ok) && s.ok, "LOST stop", `move=${mv.ok ? "ok" : mv.err} consumed=${res.length} ${s.txt}${ABSENT}`);
  }
  {
    const k = await mkContact(tidA, crmA, "ขอไม่รับ");
    await granted(tidA, crmA, k, "EMAIL");
    const e = await enrolled(cA, seqR.id, k.id);
    const since = new Date(Date.now() - 1_000);
    const r = await call(CT.setOptOut, cA, owner, k.id, { optOut: true });
    const { res } = await consumeOurs(tidA, ["crm.contact.updated"], since);
    await runDue(new Date(Date.now() + 1_000));
    const s = await stoppedAs(e, /OPT.?OUT/i);
    chk("C2.2-S3.4", "opt-out: contacts.setOptOut(optOut:true) → crm.contact.updated; the consumer stops every enrollment of that contact (STOPPED reason OPT_OUT + one finished event) · nothing is sent afterwards",
      r.ok && res.every((x) => x.ok) && s.ok && sentTo(k.email) === 0, "OPT_OUT stop", `${r.ok ? "ok" : r.err} consumed=${res.length} ${s.txt} sent=${sentTo(k.email)}${ABSENT}`);
  }
  {
    const k = await mkContact(tidA, crmA, "อีเมลเด้ง");
    await granted(tidA, crmA, k, "EMAIL");
    const e = await enrolled(cA, seqR.id, k.id);
    const r = await call(SEQ.stopFor, { tenantId: tidA, systemId: crmA }, k.id, "BOUNCE");
    const s = await stoppedAs(e, /BOUNCE/i);
    chk("C2.2-S3.5", "bounce: stopFor(ctx, contactId, \"BOUNCE\") (C2.5's bounce webhook calls this) ⇒ STOPPED reason BOUNCE + one finished event",
      r.ok && s.ok, "BOUNCE stop", `${r.ok ? "ok" : r.err} ${s.txt}${ABSENT}`);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X4 — consumers redelivered
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X4 · redelivery ──");
  {
    let ok = false;
    let txt = "no crm.deal.won event";
    if (wonEvt) {
      const again = [await consume(evtOf(wonEvt)), await consume(evtOf(wonEvt)), ...(await Promise.all(Array.from({ length: 3 }, () => consume(evtOf(wonEvt)))))];
      const row = await enr(eWon);
      const fin = await finishedOf(eWon);
      ok = again.every((x) => x.ok) && row?.status === "STOPPED" && fin.length === 1;
      txt = `consume=${again.map((x) => (x.ok ? "ok" : x.err)).join(",")} ${enrTxt(row)} finished=${fin.length}`;
    }
    chk("C2.2-X4.1", "X4: the same crm.deal.won delivered again twice + 3× in parallel ⇒ no error, the enrollment stays STOPPED and there is still exactly ONE crm.sequence.finished for it",
      ok, "idempotent", `${txt}${ABSENT}`);
  }
  {
    const rows = [...(await evts([tidA], "crm.sequence.enrolled")).slice(-1), ...(await evts([tidA], "crm.sequence.finished")).slice(-1)];
    const probs: string[] = [];
    for (const t of ["crm.sequence.enrolled", "crm.sequence.finished"]) if (typeof CONS?.[t] !== "function") probs.push(`${t}: no consumer`);
    const before = (await P.outboxEvent.count({ where: { tenantId: tidA } })) as number;
    for (const r of rows) {
      const rs = [await consume(evtOf(r)), await consume(evtOf(r)), ...(await Promise.all(Array.from({ length: 3 }, () => consume(evtOf(r)))))];
      const bad = rs.find((x) => !x.ok);
      if (bad) probs.push(`${r.type}: ${bad.err}`);
    }
    const after = (await P.outboxEvent.count({ where: { tenantId: tidA } })) as number;
    chk("C2.2-X4.2", "X4: consumers of crm.sequence.enrolled / crm.sequence.finished exist and tolerate redelivery (2× + 3× in parallel) without error and without emitting new events",
      rows.length === 2 && probs.length === 0 && after === before, "no-op safe", `rows=${rows.length} ${probs.join(" · ") || "-"} outbox ${before}→${after}${ABSENT}`);
  }
  await park(tidA);

  // ═════════════════════════════════════════════════════════════════════════════
  // S4 — versions
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S4 · versions ──");
  {
    const seq = await mkSeq(cA, "มีเวอร์ชัน", [EMAIL(`เวอร์ชันหนึ่ง ${rand}`), WAIT(1), EMAIL(`หนึ่งปิดท้าย ${rand}`)]);
    const k1v = await mkContact(tidA, crmA, "รุ่นแรก");
    const k2v = await mkContact(tidA, crmA, "รุ่นสอง");
    await granted(tidA, crmA, k1v, "EMAIL");
    await granted(tidA, crmA, k2v, "EMAIL");
    const ev1 = await enrolled(cA, seq.id, k1v.id);
    const rn = await call(SEQ.updateSequence, cA, owner, seq.id, { name: `มีเวอร์ชัน (ชื่อใหม่) ${TAG}` });
    const vName = Number((await seqRow(seq.id))?.version);
    const ru = await call(SEQ.updateSequence, cA, owner, seq.id, { steps: [EMAIL(`เวอร์ชันสอง ${rand}`), TASK(`งานเวอร์ชันสอง ${rand}`)] });
    const vNow = Number((await seqRow(seq.id))?.version);
    const steps = await stepRows(seq.id);
    const v1 = steps.filter((s) => Number(s.version) === 1);
    const v2 = steps.filter((s) => Number(s.version) === 2);
    const ev2 = await enrolled(cA, seq.id, k2v.id);
    const r2 = await enr(ev2);
    await runDue(new Date(Date.now() + 1_000));
    const s1 = SENT.filter((s) => s.to === k1v.email).map((s) => s.subject);
    const s2 = SENT.filter((s) => s.to === k2v.email).map((s) => s.subject);
    chk("C2.2-S4.1", "editing the STEPS while an enrollment is ACTIVE ⇒ version 1 → 2 with NEW step rows (v1's three rows intact, v2 has two) · a name-only edit does not bump · the old enrollment runs v1 content, a new enrollment gets sequenceVersion 2 and v2 content",
      rn.ok && vName === 1 && ru.ok && vNow === 2 && v1.length === 3 && v1[0]?.subject === `เวอร์ชันหนึ่ง ${rand}` && v2.length === 2 && Number(r2?.sequenceVersion) === 2 &&
        s1.length === 1 && s1[0]?.includes("เวอร์ชันหนึ่ง") && s2.length === 1 && s2[0]?.includes("เวอร์ชันสอง"),
      "v2 · both step sets · right content", `name-edit v=${vName} steps-edit ${ru.ok ? "ok" : ru.err} v=${vNow} rows v1=${v1.length} v2=${v2.length} e2.v=${r2?.sequenceVersion} sent1=${cut(s1.join("|"), 60)} sent2=${cut(s2.join("|"), 60)}${ABSENT}`);
    // the old enrollment finishes on v1: make its WAIT elapse
    await setTs(ev1, "nextAt", new Date(Date.now() - 1_000));
    await runDue(new Date(Date.now() + 1_000));
    const row1 = await enr(ev1);
    const s1b = SENT.filter((s) => s.to === k1v.email).map((s) => s.subject);
    const tasksOld = await tasksOf(tidA, k1v.id, `งานเวอร์ชันสอง ${rand}`);
    const row2 = await enr(ev2);
    chk("C2.2-S4.2", "the v1 enrollment FINISHES ON v1: after its WAIT it receives v1's closing e-mail (\"หนึ่งปิดท้าย\") and is DONE — no v2 task for it · the v2 enrollment is DONE after v2's task",
      row1?.status === "DONE" && Number(row1?.sequenceVersion) === 1 && s1b.length === 2 && s1b[1]?.includes("หนึ่งปิดท้าย") && tasksOld.length === 0 && row2?.status === "DONE",
      "v1 DONE on v1", `${enrTxt(row1)} sent=${cut(s1b.join("|"), 80)} v2tasksForOld=${tasksOld.length} e2=${enrTxt(row2)}${ABSENT}`);
  }
  await park(tidA);

  // ═════════════════════════════════════════════════════════════════════════════
  // X5 — overlapping runDue · simulated claim · real crash after claim · S5 stats
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X5 · claiming timed work ──");
  const seqX = await mkSeq(cA, "ส่งพร้อมกัน", [EMAIL("ข่าว {{contact.firstName}}")]);
  const xContacts: { id: string; email: string }[] = [];
  {
    const probs: string[] = [];
    const midState: string[] = [];
    let observed = 0;
    const slow = mkDeps({
      delayMs: 150,
      onSend: async (r: Any) => {
        const row = r?.enrollmentId ? await enr(String(r.enrollmentId)) : null;
        if (row) observed += 1;
        if (row && (row.status !== "ACTIVE" || !(typeof row.leaseMs === "number") || Number(row.stepIndex) !== 0)) midState.push(enrTxt(row));
      },
    });
    for (const [round, par] of [[1, 2], [2, 4]] as const) {
      const ks = await Promise.all(Array.from({ length: 12 }, (_, i) => mkContact(tidA, crmA, `พร้อม${round}-${i}`)));
      for (const k of ks) await granted(tidA, crmA, k, "EMAIL");
      for (const k of ks) await enrolled(cA, seqX.id, k.id);
      xContacts.push(...ks);
      const now = new Date(Date.now() + 1_000);
      const rs = await Promise.all(Array.from({ length: par }, () => call(SEQ.runDue, now, { deps: slow, tenantIds: [tidA] })));
      const counts = ks.map((k) => sentTo(k.email));
      if (rs.some((x) => !x.ok) || counts.some((n) => n !== 1)) probs.push(`round${round}×${par}: counts=${counts.join("")} ${rs.find((x) => !x.ok)?.err ?? ""}`);
    }
    chk("C2.2-X5.1", "X5: overlapping runDue calls (2 in parallel, then 4 in parallel; slow sender) ⇒ every due step is executed EXACTLY once (24 contacts × 1 fake send)",
      probs.length === 0 && typeof SEQ.runDue === "function", "24 × 1", `${probs.join(" · ") || "-"}${ABSENT}`);
    chk("C2.2-X5.2", "X5: the claim is a LEASE, never a terminal state — seen from inside the sender (req.enrollmentId), the row being executed is still ACTIVE at its step with leaseUntil set (M7/H6 lesson)",
      midState.length === 0 && observed >= 20, "ACTIVE + lease mid-send (≥ 20 observations)", `observed=${observed} bad=${cut(midState.slice(0, 3).join(" | "), 200) || "-"}${ABSENT}`);
  }
  {
    // S5 per-step stats (after X5.1: 24 concurrent sends on step 0)
    const r = await call(SEQ.stats, cA, owner, seqX.id);
    const s0 = ((r.v?.steps ?? []) as Any[]).find((s) => Number(s.index) === 0);
    chk("C2.2-S5.2", "per-step stats are exact under concurrency: after 24 sends executed by overlapping runDue calls, stats(seqX).steps[0].sent === 24 (no lost update on a shared counter / JSON map — X3)",
      r.ok && Number(s0?.sent) === 24, "sent 24", `${r.ok ? cut(j(r.v?.steps), 160) : r.err}${ABSENT}`);
  }
  {
    const seq = await mkSeq(cA, "สถิติ", [EMAIL("สถิติ {{contact.firstName}}"), WAIT(1), TASK(`งานสถิติ ${rand}`)]);
    const ka = await mkContact(tidA, crmA, "สถิติก");
    const kb = await mkContact(tidA, crmA, "สถิติข");
    const kc = await mkContact(tidA, crmA, "สถิติค", { email: null });
    for (const k of [ka, kb, kc]) await granted(tidA, crmA, k, "EMAIL");
    for (const k of [ka, kb, kc]) await enrolled(cA, seq.id, k.id);
    await runDue(new Date(Date.now() + 1_000));
    const r = await call(SEQ.stats, cA, owner, seq.id);
    const st = (r.v?.steps ?? []) as Any[];
    const at = (i: number) => st.find((s) => Number(s.index) === i) ?? {};
    chk("C2.2-S5.1", "per-step stats: 3 enrollments, one without e-mail ⇒ step 0 {sent 2, skipped 1, failed 0} · step 1 (WAIT) sent 3 · step 2 (TASK) active 3 (waiting to run) — each row carries index + kind",
      r.ok && Number(at(0).sent) === 2 && Number(at(0).skipped) === 1 && Number(at(0).failed ?? 0) === 0 && Number(at(1).sent) === 3 && Number(at(2).active) === 3 && String(at(2).kind) === "TASK",
      "2/1/0 · 3 · active 3", `${r.ok ? cut(j(st), 220) : r.err}${ABSENT}`);
  }
  await park(tidA);
  {
    // simulated claim (a crashed run left exactly this): lease held until now0+15m
    const now0 = th(2026, 9, 2, 10, 0);
    const k = await mkContact(tidA, crmA, "จองค้าง");
    await granted(tidA, crmA, k, "EMAIL");
    const e = await enrolled(cA, seqX.id, k.id);
    await setTs(e, "nextAt", new Date(now0.getTime() - 60_000));
    await setTs(e, "leaseUntil", new Date(now0.getTime() + 15 * 60_000));
    const r1 = await runDue(new Date(now0.getTime() + 60_000));
    const n1 = sentTo(k.email);
    const r2 = await runDue(new Date(now0.getTime() + 16 * 60_000));
    const n2 = sentTo(k.email);
    const row = await enr(e);
    chk("C2.2-X5.3", "X5: a row whose lease is still held (now0 + 15 min) is NOT executed at now0 + 1 min; at now0 + 16 min (lease expired) it is executed exactly once and finishes",
      r1.ok && n1 === 0 && r2.ok && n2 === 1 && row?.status === "DONE", "0 then 1", `+1m sent=${n1} +16m sent=${n2} ${enrTxt(row)}${ABSENT}`);
  }
  await park(tidA);
  {
    // real crash: a worker process claims, enters the sender and SIGKILLs itself
    const now1 = th(2026, 9, 1, 10, 0);
    const k = await mkContact(tidA, crmA, "ตายกลางทาง");
    await granted(tidA, crmA, k, "EMAIL");
    const e = await enrolled(cA, seqX.id, k.id);
    await setTs(e, "nextAt", new Date(now1.getTime() - 60_000));
    let kidOut = "";
    let kidCode: number | null = null;
    if (typeof SEQ.runDue === "function" && tablesOk) {
      const cfg = Buffer.from(JSON.stringify({ tenantId: tidA, nowMs: now1.getTime() }), "utf8").toString("base64url");
      const ch = spawn("pnpm", ["exec", "tsx", SELF, "--c22-worker", cfg], { env: process.env, stdio: ["ignore", "pipe", "pipe"] });
      KIDS.push(ch);
      ch.stdout?.on("data", (d: Buffer) => { kidOut += String(d); });
      ch.stderr?.on("data", (d: Buffer) => { kidOut += String(d); });
      kidCode = await new Promise<number | null>((res) => {
        const to = setTimeout(() => { try { ch.kill("SIGKILL"); } catch { /* gone */ } res(-2); }, 180_000);
        ch.on("close", (code) => { clearTimeout(to); res(code ?? -9); });
        ch.on("error", () => { clearTimeout(to); res(-1); });
      });
    }
    const claimed = /C22CLAIMED/.test(kidOut);
    const mid = await enr(e);
    const leaseOk = typeof mid?.leaseMs === "number" && mid.leaseMs > now1.getTime() && mid.leaseMs <= now1.getTime() + 15 * 60_000 + 1_000;
    const r1 = await runDue(new Date(now1.getTime() + 60_000));
    const n1 = sentTo(k.email);
    const r2 = await runDue(new Date(now1.getTime() + 16 * 60_000));
    const n2 = sentTo(k.email);
    const row = await enr(e);
    chk("C2.2-X5.4", "X5 crash after claim: a worker process claims the row, enters the sender and is SIGKILLed ⇒ the row is still ACTIVE at step 0 with a lease ≤ 15 min (not DONE, not advanced) · runDue at +1 min does nothing · at +16 min the step runs exactly once",
      claimed && mid?.status === "ACTIVE" && Number(mid?.stepIndex) === 0 && leaseOk && r1.ok && n1 === 0 && r2.ok && n2 === 1 && row?.status === "DONE",
      "claimed · held · once after lease", `worker code=${kidCode} claimed=${claimed} mid=${enrTxt(mid)} lease≤15m=${leaseOk} +1m=${n1} +16m=${n2} end=${enrTxt(row)} ${claimed ? "" : cut(kidOut.split("\n").filter((l) => /C22|Error/.test(l)).join(" | "), 160)}${ABSENT}`);
  }
  await park(tidA);

  // ═════════════════════════════════════════════════════════════════════════════
  // X8 — PDPA: consent / opt-out / bounce decided WHEN THE STEP RUNS
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X8 · PDPA ──");
  const seq8 = await mkSeq(cA, "ความยินยอม", [EMAIL("ข่าวสาร {{contact.firstName}}")]);
  {
    const k = await mkContact(tidA, crmA, "ขอไม่รับก่อน", { optOut: true });
    await granted(tidA, crmA, k, "EMAIL");
    const r = await enroll(cA, owner, seq8.id, k.id);
    const rows = await enrOf(seq8.id, k.id);
    chk("C2.2-X8.1", "enroll skips an opted-out contact (marketingOptOut): NO enrollment row · result { skipped: true, reason } (or a calm Thai refusal)",
      rows.length === 0 && ((r.ok && r.v?.skipped === true) || (!r.ok && thai(r.msg) && r.code !== "MISSING_FUNCTION")), "no row · skipped",
      `rows=${rows.length} ${r.ok ? cut(j(r.v), 80) : r.err}${ABSENT}`);
  }
  {
    const kW = await mkContact(tidA, crmA, "ถอนยินยอม");
    const kP = await mkContact(tidA, crmA, "ยังยินยอม");
    await granted(tidA, crmA, kW, "EMAIL");
    await granted(tidA, crmA, kP, "EMAIL");
    const eW = await enrolled(cA, seq8.id, kW.id);
    await enrolled(cA, seq8.id, kP.id);
    await consent(tidA, crmA, kW.id, "EMAIL", false); // withdrawn AFTER enroll, BEFORE the step
    await runDue(new Date(Date.now() + 1_000));
    const o = outcomeAt((await getEnr(cA, eW)).v, 0);
    chk("C2.2-X8.2", "consent withdrawn between enroll and step ⇒ at step time nothing is sent, step outcome SKIPPED with a Thai reason · [positive control] the contact who still consents receives exactly one e-mail in the same run",
      sentTo(kW.email) === 0 && o.outcome === "SKIPPED" && thai(o.reason) && sentTo(kP.email) === 1, "0 · SKIPPED · control 1",
      `withdrawn=${sentTo(kW.email)} outcome=${o.outcome}/${cut(o.reason, 50)} control=${sentTo(kP.email)}${ABSENT}`);
  }
  {
    const kO = await mkContact(tidA, crmA, "ไม่รับทีหลัง");
    const kB = await mkContact(tidA, crmA, "เด้งทีหลัง");
    await granted(tidA, crmA, kO, "EMAIL");
    await granted(tidA, crmA, kB, "EMAIL");
    const eO = await enrolled(cA, seq8.id, kO.id);
    const eB = await enrolled(cA, seq8.id, kB.id);
    // flags flipped directly (no event, no consumer ⇒ the auto-stop has NOT happened) — only the step-time check can save them
    await P.crmContact.update({ where: { id: kO.id }, data: { marketingOptOut: true } });
    await P.crmContact.update({ where: { id: kB.id }, data: { emailBouncedAt: new Date() } });
    await runDue(new Date(Date.now() + 1_000));
    const rO = await enr(eO);
    const rB = await enr(eB);
    chk("C2.2-X8.3", "opt-out set between enroll and step (no consumer ran) ⇒ never sent at step time (the enrollment is SKIPPED-and-moved-on or STOPPED, never SENT)",
      eO !== NONE && sentTo(kO.email) === 0 && !!rO && rO.status !== "ACTIVE", "0 sent", `sent=${sentTo(kO.email)} ${enrTxt(rO)}${ABSENT}`);
    chk("C2.2-X8.4", "e-mail bounced between enroll and step ⇒ never sent at step time (bounce blocks every path, C1.4 ruling 7)",
      eB !== NONE && sentTo(kB.email) === 0 && !!rB && rB.status !== "ACTIVE", "0 sent", `sent=${sentTo(kB.email)} ${enrTxt(rB)}${ABSENT}`);
  }
  await park(tidA);

  // ═════════════════════════════════════════════════════════════════════════════
  // X9 — bulk enroll is a danger op · audit
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X9 · danger ──");
  const seq9 = await mkSeq(cA, "ลงทะเบียนกลุ่ม", [WAIT(5), TASK(`งานกลุ่ม ${rand}`)]);
  {
    const ks = await Promise.all([mkContact(tidA, crmA, "กลุ่มก"), mkContact(tidA, crmA, "กลุ่มข")]);
    const ids = ks.map((k) => k.id);
    const a = await call(SEQ.bulkEnroll, cA, owner, { sequenceId: seq9.id, contactIds: ids });
    const b = await call(SEQ.bulkEnroll, cA, owner, { sequenceId: seq9.id, contactIds: ids, confirm: true, reason: "สั้น" });
    const c = await call(SEQ.bulkEnroll, cA, owner, { sequenceId: seq9.id, contactIds: ids, confirm: false, reason: "ลงทะเบียนลูกค้างานแฟร์" });
    const n = (await q(`SELECT count(*)::int AS n FROM "CrmSequenceEnrollment" WHERE "sequenceId" = $1`, seq9.id))[0]?.n ?? -1;
    chk("C2.2-X9.1", "X9: bulkEnroll without confirm, with a reason < 5 chars, or with confirm:false ⇒ refused (Thai message) and NOTHING written",
      !a.ok && !b.ok && !c.ok && [a, b, c].every((x) => x.code !== "MISSING_FUNCTION" && thai(x.msg)) && Number(n) === 0, "3 refusals · 0 rows",
      `a=${a.err || "ok"} b=${b.err || "ok"} c=${c.err || "ok"} rows=${n}${ABSENT}`);
  }
  {
    const ids = Array.from({ length: 501 }, (_, i) => `${TAG}-fake-${i}`);
    const r = await call(SEQ.bulkEnroll, cA, owner, { sequenceId: seq9.id, contactIds: ids, confirm: true, reason: "ลงทะเบียนลูกค้าทั้งร้าน" });
    const n = (await q(`SELECT count(*)::int AS n FROM "CrmSequenceEnrollment" WHERE "sequenceId" = $1`, seq9.id))[0]?.n ?? -1;
    chk("C2.2-X9.2", "X9: bulkEnroll of 501 contacts ⇒ refused (cap 500) with a Thai message, nothing written",
      !r.ok && r.code !== "MISSING_FUNCTION" && thai(r.msg) && Number(n) === 0, "refused", `${r.ok ? cut(j(r.v), 80) : r.err} rows=${n}${ABSENT}`);
  }
  {
    const ka = await mkContact(tidA, crmA, "กลุ่มค");
    const kb = await mkContact(tidA, crmA, "กลุ่มง");
    const ko = await mkContact(tidA, crmA, "กลุ่มไม่รับ", { optOut: true });
    const reason = `ลงทะเบียนลูกค้างานแฟร์ ${rand}`;
    const r = await call(SEQ.bulkEnroll, cA, owner, { sequenceId: seq9.id, contactIds: [ka.id, kb.id, ko.id], confirm: true, reason });
    const act = await q(`SELECT "contactId" FROM "CrmSequenceEnrollment" WHERE "sequenceId" = $1 AND status::text = 'ACTIVE'`, seq9.id);
    const skipped = Array.isArray(r.v?.skipped) ? r.v.skipped.length : Number(r.v?.skipped ?? -1);
    const aud = (await auditOf(tidA)).filter((x) => j({ b: x.before, a: x.after }).includes(reason));
    chk("C2.2-X9.3", "X9: bulkEnroll with confirm:true + reason ⇒ the 2 eligible contacts enrolled, the opted-out one skipped · an AuditLog row `crm.sequence.*` carries the reason",
      r.ok && Number(r.v?.enrolled) === 2 && skipped === 1 && act.length === 2 && !act.some((x) => x.contactId === ko.id) && aud.length >= 1,
      "2 enrolled · 1 skipped · audit", `${r.ok ? cut(j(r.v), 100) : r.err} active=${act.length} audit=${aud.length}${ABSENT}`);
  }
  {
    const acts = new Set((await auditOf(tidA)).map((x) => String(x.action)));
    const need = [/create/i, /update/i, /enroll/i, /stop/i];
    const miss = need.filter((re) => ![...acts].some((a) => re.test(a))).map(String);
    chk("C2.2-X9.4", "X9: every sequence mutation is audited — AuditLog actions `crm.sequence.*` exist for create, update, enroll and stop in this run",
      miss.length === 0, "4 kinds", `actions=${cut([...acts].join(","), 160) || "-"} missing=${miss.join(",") || "-"}${ABSENT}`, "MAJOR");
  }
  await park(tidA);

  // ═════════════════════════════════════════════════════════════════════════════
  // X1 — scope (404-not-403)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X1 · scope ──");
  {
    const hidden = await mkContact(tidA, crmA, "มองไม่เห็น", { ownerUserId: userA });
    const mine = await mkContact(tidA, crmA, "ของสตาฟ", { ownerUserId: userS });
    const r = await enroll(cAs, staff, seq1.id, hidden.id);
    const rOk = await enroll(cAs, staff, seq1.id, mine.id);
    const rows = await enrOf(seq1.id, hidden.id);
    chk("C2.2-X1.1", "X1: a STAFF user (keys crm.contact.read + crm.sequence.enroll, no team) enrolling a contact owned by someone else ⇒ NOT_FOUND, no row, the message does not echo the contact · [positive control] the same user enrolls their OWN contact",
      isRefusal(r, ["NOT_FOUND"]) && !r.msg.includes(hidden.first) && rows.length === 0 && rOk.ok, "404 · control ok",
      `${r.ok ? "ENROLLED" : r.err} rows=${rows.length} control=${rOk.ok ? "ok" : rOk.err}${ABSENT}`);
  }
  {
    const kA = await mkContact(tidA, crmA, "ข้ามระบบ");
    const kA2 = await mkContact(tidA, crmA2, "ระบบสอง");
    const seqA2 = await mkSeq(cA2, "ระบบสอง", [WAIT(1), TASK(`ระบบสอง ${rand}`)]);
    const r1 = await enroll(cA, owner, seqA2.id, kA.id); // sequence of the other CRM system
    const r2 = await enroll(cA2, owner, seqA2.id, kA.id); // contact of the other CRM system
    const r3 = await enroll(cB, owner, seq1.id, kA.id); // other tenant
    const ok = await enroll(cA2, owner, seqA2.id, kA2.id);
    const leaked = (await enrOf(seqA2.id, kA.id)).length + (await enrOf(seq1.id, kA.id)).length;
    chk("C2.2-X1.2", "X1: sequence of ANOTHER CRM system of the same tenant, contact of another system, or a call from another tenant ⇒ NOT_FOUND (never enrolled) · [positive control] same-system enroll works",
      [r1, r2, r3].every((x) => isRefusal(x, ["NOT_FOUND"])) && leaked === 0 && ok.ok && seqA2.r.ok, "3 × 404 · control",
      `r1=${r1.err || "ok"} r2=${r2.err || "ok"} r3=${r3.err || "ok"} leaked=${leaked} control=${ok.ok ? "ok" : ok.err}${ABSENT}`);
  }
  {
    const k = await mkContact(tidA, crmA, "ข้ามร้าน");
    const e = await enrolled(cA, seq1.id, k.id);
    const g = await getEnr(cB, e);
    const s = await call(SEQ.stop, cB, owner, e, { reason: "ข้ามร้าน" });
    const p = await call(SEQ.pause, cB, owner, e);
    const l = await call(SEQ.listEnrollments, cB, owner, { sequenceId: seq1.id });
    const st = await call(SEQ.stats, cB, owner, seq1.id);
    const row = await enr(e);
    const listed = ((l.v?.items ?? l.v ?? []) as Any[]).some?.((x: Any) => x?.id === e) ?? false;
    chk("C2.2-X1.3", "X1: from another tenant, getEnrollment / stop / pause / stats ⇒ NOT_FOUND and listEnrollments shows nothing of ours · the enrollment is still ACTIVE",
      [g, s, p, st].every((x) => isRefusal(x, ["NOT_FOUND"])) && !listed && row?.status === "ACTIVE", "404 × 4 · untouched",
      `get=${g.err || "ok"} stop=${s.err || "ok"} pause=${p.err || "ok"} stats=${st.err || "ok"} listed=${listed} ${enrTxt(row)}${ABSENT}`);
    const x = await call(SEQ.stopFor, { tenantId: tidB, systemId: crmB }, k.id, "REPLY");
    const row2 = await enr(e);
    chk("C2.2-X1.4", "X1: stopFor with ANOTHER tenant's ctx for our contact id stops nothing (tenant-scoped auto-stop entry)",
      row2?.status === "ACTIVE" && typeof SEQ.stopFor === "function", "still ACTIVE", `${x.ok ? `ok(${j(x.v)})` : x.err} ${enrTxt(row2)}${ABSENT}`);
  }
  await park(tidA);

  // ═════════════════════════════════════════════════════════════════════════════
  // X6 — dangerous input
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X6 · input ──");
  {
    const r = await mkSeq(cA, "หัวอีเมลอันตราย", [EMAIL("ข่าวดี\r\nBcc: attacker@evil.example")]);
    const rows = r.id !== NONE ? await stepRows(r.id) : [];
    const safe = !r.r.ok ? isRefusal(r.r, ["VALIDATION"]) && thai(r.r.msg) : rows.length > 0 && rows.every((x) => !/[\r\n]/.test(String(x.subject ?? "")));
    chk("C2.2-X6.1", "X6: an e-mail step subject containing CR/LF (header injection) ⇒ VALIDATION with a Thai message, or stored with the line breaks removed — never stored as-is",
      safe && typeof SEQ.createSequence === "function", "refused or stripped", `${r.r.ok ? `stored ${cut(j(rows.map((x) => x.subject)), 80)}` : r.r.err}${ABSENT}`);
  }
  {
    const a = await mkSeq(cA, "ช่วงเวลาผิด", [WAIT(1)], { businessDaysOnly: true, sendWindow: { from: "25:00", to: "18:00" } });
    const b = await mkSeq(cA, "ช่วงเวลากลับหัว", [WAIT(1)], { businessDaysOnly: true, sendWindow: { from: "18:00", to: "09:00" } });
    const c = await mkSeq(cA, "รอติดลบ", [WAIT(-1)]);
    chk("C2.2-X6.2", "X6: sendWindow \"25:00\", a window whose from ≥ to, and a negative wait ⇒ VALIDATION (Thai), nothing created",
      [a.r, b.r, c.r].every((x) => isRefusal(x, ["VALIDATION"]) && thai(x.msg)), "3 × VALIDATION", `a=${a.r.err || "ok"} b=${b.r.err || "ok"} c=${c.r.err || "ok"}${ABSENT}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S8 — brief extras
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S8 · extras ──");
  {
    const seq = await mkSeq(cA, "พักได้", [EMAIL("พักแล้วส่ง {{contact.firstName}}")]);
    const k = await mkContact(tidA, crmA, "พักไว้");
    await granted(tidA, crmA, k, "EMAIL");
    const e = await enrolled(cA, seq.id, k.id);
    const p = await call(SEQ.pause, cA, owner, e);
    await runDue(new Date(Date.now() + 1_000));
    const n1 = sentTo(k.email);
    const rp = await enr(e);
    const rs = await call(SEQ.resume, cA, owner, e);
    await runDue(new Date(Date.now() + 1_000));
    const n2 = sentTo(k.email);
    chk("C2.2-S8.1", "pause ⇒ PAUSED and runDue ignores it (0 sends) · resume ⇒ ACTIVE and the pending step runs once",
      p.ok && rp?.status === "PAUSED" && n1 === 0 && rs.ok && n2 === 1, "0 then 1", `pause=${p.ok ? "ok" : p.err} ${enrTxt(rp)} sent=${n1} resume=${rs.ok ? "ok" : rs.err} sent=${n2}${ABSENT}`);
  }
  {
    const k = await mkContact(tidA, crmA, "หยุดมือ");
    const e = await enrolled(cA, seq1.id, k.id);
    const s1 = await call(SEQ.stop, cA, owner, e, { reason: "ลูกค้าขอหยุด" });
    const s2 = await call(SEQ.stop, cA, owner, e, { reason: "กดซ้ำ" });
    const row = await enr(e);
    const fin = await finishedOf(e);
    chk("C2.2-S8.2", "manual stop ⇒ STOPPED reason MANUAL + one finished { status STOPPED } · stopping again changes nothing (no second event; calm CONFLICT or no-op)",
      s1.ok && row?.status === "STOPPED" && /MANUAL/i.test(String(row?.stoppedReason ?? "")) && fin.length === 1 && (s2.ok || s2.code === "CONFLICT"),
      "MANUAL · 1 event", `${s1.ok ? "ok" : s1.err} again=${s2.ok ? "ok" : s2.err} ${enrTxt(row)} finished=${fin.length}${ABSENT}`);
  }
  {
    const r = await mkSeq(cAs, "สตาฟสร้างเอง", [WAIT(1)], {}, staff);
    const e = await call(SEQ.updateSequence, cAs, staff, seq1.id, { name: `แก้โดยสตาฟ ${TAG}` });
    const n = (await q(`SELECT count(*)::int AS n FROM "CrmSequence" WHERE "tenantId" = $1 AND name LIKE $2`, tidA, `สตาฟสร้างเอง%`))[0]?.n ?? -1;
    chk("C2.2-S8.3", "permissions: STAFF without crm.sequence.manage ⇒ createSequence / updateSequence FORBIDDEN with a Thai message, nothing created (enroll itself needs only crm.sequence.enroll — X1.1 control)",
      isRefusal(r.r, ["FORBIDDEN"]) && thai(r.r.msg) && isRefusal(e, ["FORBIDDEN"]) && Number(n) === 0, "FORBIDDEN × 2", `create=${r.r.err || "ok"} update=${e.err || "ok"} rows=${n}${ABSENT}`, "MAJOR");
  }
  {
    const r1 = await call(SEQ.importThaiHolidays, cA2, owner, 2026);
    const s1 = await crmSettings(crmA2);
    const dates = ((s1.holidays ?? []) as Any[]).map((h) => (typeof h === "string" ? h : String(h?.date ?? "")));
    const needD = ["2026-01-01", "2026-04-13", "2026-04-14", "2026-04-15", "2026-12-05", "2026-12-31"];
    const r2 = await call(SEQ.importThaiHolidays, cA2, owner, 2569);
    const s2 = await crmSettings(crmA2);
    const dates2 = ((s2.holidays ?? []) as Any[]).map((h) => (typeof h === "string" ? h : String(h?.date ?? "")));
    const bad = await call(SEQ.importThaiHolidays, cA2, owner, 2030);
    chk("C2.2-S8.4", "importThaiHolidays(2026) fills settings.crm.holidays with the static list (≥ the 6 fixed dates 01-01 · 04-13/14/15 · 12-05 · 12-31) · again with B.E. 2569 adds nothing (no duplicates) · other settings.crm keys survive (single-statement jsonb_set) · year 2030 ⇒ VALIDATION (Thai)",
      r1.ok && needD.every((d) => dates.includes(d)) && r2.ok && dates2.length === dates.length && new Set(dates2).size === dates2.length && s2.qcMarker === TAG && s2.uiVersion === 2 && isRefusal(bad, ["VALIDATION"]) && thai(bad.msg),
      "list · idempotent · keys kept · 2030 refused", `r1=${r1.ok ? "ok" : r1.err} n=${dates.length} missing=${needD.filter((d) => !dates.includes(d)).join(",") || "-"} n2=${dates2.length} marker=${s2.qcMarker === TAG} bad=${bad.err || "ok"}${ABSENT}`, "MAJOR");
  }
  {
    const srcAuto = read("src/lib/automation/labels.ts");
    const srcHook = read("src/lib/webhooks/labels.ts");
    const decl = (src: string, t: string) => (src.match(new RegExp(`value:\\s*"${t.replace(/\./g, "\\.")}"`, "g")) ?? []).length;
    const FORBIDDEN_KEYS = new Set(["name", "firstname", "lastname", "fullname", "phone", "mobile", "email", "title", "note", "body", "subject", "text", "message", "to", "address", "tasktitle"]);
    const probs: string[] = [];
    for (const t of ["crm.sequence.enrolled", "crm.sequence.finished"]) {
      const rs = await evts(MY, t);
      if (rs.length === 0) { probs.push(`${t}: not emitted`); continue; }
      if (typeof CONS?.[t] !== "function") probs.push(`${t}: no consumer`);
      if (decl(srcAuto, t) + decl(srcHook, t) !== 1) probs.push(`${t}: declared ${decl(srcAuto, t) + decl(srcHook, t)}×`);
      const mySys = new Set([crmA, crmA2, crmB, crmV1, crmVx]);
      if (rs.some((r) => !mySys.has(r.systemId))) probs.push(`${t}: systemId`);
      const badKey = rs.filter((r) => !(String(r.idempotencyKey).startsWith(`${t}#${r.payload?.enrollmentId}#`)));
      if (badKey.length) probs.push(`${t}: key ${cut(badKey[0].idempotencyKey, 60)}`);
      const need = t.endsWith("enrolled") ? ["enrollmentId", "sequenceId", "contactId"] : ["enrollmentId", "sequenceId", "contactId", "status"];
      if (rs.some((r) => need.some((kk) => !r.payload?.[kk]))) probs.push(`${t}: payload lacks ${need.join("/")}`);
      const shape = rs.flatMap((r) => [
        ...keysDeep(r.payload).filter((kk) => FORBIDDEN_KEYS.has(kk.toLowerCase())).map((kk) => `key:${kk}`),
        ...strings(r.payload).filter((v) => /\s|[ก-๙@]/.test(v) || v.length > 64).map((v) => `prose:${cut(v, 20)}`),
      ]);
      if (shape.length) probs.push(`${t}: ${cut([...new Set(shape)].slice(0, 4).join(","), 100)}`);
    }
    chk("C2.2-S8.5", "events crm.sequence.enrolled / crm.sequence.finished: emitted by this run · systemId = the CRM system · key `<type>#<enrollmentId>#<n>` (R-C.8) · payload ids/codes only (enrollmentId, sequenceId, contactId, …) · consumer exists · declared exactly ONCE across AUTOMATION_EVENTS / WEBHOOK_EVENTS",
      probs.length === 0, "3 registries · ids only", `${probs.join(" · ") || "-"}${ABSENT}`);
  }
  {
    const marks = ["X3", "X5", "X8", "X9"].filter((x) => !new RegExp(`AUDIT-CLASS ${x}\\b`).test(seqSrc + brSrc));
    const direct = ([...(seqSrc.match(/from\s+["']@\/lib\/(core\/email|core\/sms|core\/push|modules\/chat)["']/g) ?? [])] as string[]).concat(seqSrc.match(/import\(\s*["']@\/lib\/(core\/email|core\/sms|modules\/chat)["']\s*\)/g) ?? []);
    const gate = /crmUiVersion|uiVersion|assertCrmV2/.test(seqSrc);
    chk("C2.2-S8.6", "static: sequences sources mark AUDIT-CLASS X3 · X5 · X8 · X9 · no second transport engine (no direct import of core/email · core/sms · core/push · modules/chat — sends go through the shared action runner / deps) · the uiVersion gate is read (R-E.14) [static]",
      seqSrc.length > 0 && marks.length === 0 && direct.length === 0 && gate, "markers · no direct transport · gate",
      `src=${seqSrc.length} missingMarks=${marks.join(",") || "-"} direct=${direct.join(" ") || "-"} gate=${gate}`, "MINOR");
  }
  {
    const idx = read("src/lib/modules/crm/index.ts");
    const facade = /export\s+\*\s+as\s+sequences\s+from\s+["']\.\/sequences["']/.test(idx);
    const brIdx = read("src/lib/platform/crm-bridges/index.ts");
    const block = /CRM C2\.2 ▸/.test(consSrc);
    chk("C2.2-S8.7", "wiring: crm/index.ts exports the `sequences` namespace · auto-stop consumers live in crm-bridges/sequences.ts (R-D) re-exported by the bridges index · outbox-consumers.ts carries a `// CRM C2.2 ▸ … ◂` block [static]",
      facade && brSrc.length > 0 && /sequences/.test(brIdx) && block, "facade · bridge file · block", `facade=${facade} bridge=${brSrc.length > 0} index=${/sequences/.test(brIdx)} block=${block}`, "MINOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S9 — PERMANENT RULE (C1.11): uiVersion 1 ⇒ sequences skip that system · rows kept · resume at 2
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S9 · uiVersion 1 ──");
  {
    const r1 = await mkSeq(cV1, "ระบบรุ่นหนึ่ง", [WAIT(1)]);
    const n = (await q(`SELECT count(*)::int AS n FROM "CrmSequence" WHERE "systemId" = $1`, crmV1))[0]?.n ?? -1;
    const seqV = await mkSeq(cVx, "สลับรุ่น", [EMAIL("สลับรุ่น {{contact.firstName}}")]);
    const k = await mkContact(tidV, crmVx, "สลับรุ่น");
    await granted(tidV, crmVx, k, "EMAIL");
    const e = await enrolled(cVx, seqV.id, k.id);
    const kLate = await mkContact(tidV, crmVx, "มาหลังปิด");
    await setCrm(crmVx, { uiVersion: 1 });
    const late = await enroll(cVx, owner, seqV.id, kLate.id);
    const lateRows = await enrOf(seqV.id, kLate.id);
    const v1Refused = (x: Res) => !x.ok && (x.code === "FORBIDDEN" || /CRM_V2_DISABLED|CrmV2Disabled/i.test(x.err) || x.code === "CRM_V2_DISABLED") && thai(x.msg);
    chk("C2.2-S9.1", "uiVersion 1: createSequence on a v1 system ⇒ refused (CrmV2DisabledError / FORBIDDEN / CRM_V2_DISABLED, Thai) with no row · after a v2 system is switched to 1, enroll ⇒ refused the same way, no row",
      v1Refused(r1.r) && Number(n) === 0 && seqV.r.ok && v1Refused(late) && lateRows.length === 0, "refused × 2",
      `create=${r1.r.err || "ok"} rows=${n} enrollAfterSwitch=${late.err || "ok"} rows=${lateRows.length}${ABSENT}`);
    const before = await enr(e);
    const r = await call(SEQ.runDue, new Date(Date.now() + 1_000), { deps: DEPS, tenantIds: [tidV] });
    const mid = await enr(e);
    const seqStill = await seqRow(seqV.id);
    chk("C2.2-S9.2", "uiVersion 1: runDue SKIPS that system's due enrollment — nothing sent, status / stepIndex / nextAt unchanged, no lease left behind · the sequence, its steps and the enrollment are kept (never deleted by the switch)",
      r.ok && sentTo(k.email) === 0 && mid?.status === "ACTIVE" && Number(mid?.stepIndex) === Number(before?.stepIndex) && mid?.nextAtMs === before?.nextAtMs &&
        (mid?.leaseMs === null || mid.leaseMs <= Date.now() + 2_000) && !!seqStill && (await stepRows(seqV.id)).length === 1,
      "untouched · kept", `${r.ok ? "ok" : r.err} sent=${sentTo(k.email)} before=${enrTxt(before)} after=${enrTxt(mid)}${ABSENT}`);
    await setCrm(crmVx, { uiVersion: 2 });
    const r2 = await call(SEQ.runDue, new Date(Date.now() + 1_000), { deps: DEPS, tenantIds: [tidV] });
    const end = await enr(e);
    chk("C2.2-S9.3", "uiVersion back to 2 ⇒ the kept enrollment RESUMES: the next runDue sends exactly once and finishes it",
      r2.ok && sentTo(k.email) === 1 && end?.status === "DONE", "1 send · DONE", `${r2.ok ? "ok" : r2.err} sent=${sentTo(k.email)} ${enrTxt(end)}${ABSENT}`);
  }
  {
    const pages = walk(`${CRM_PAGES}/settings`).filter((f) => f.endsWith("/page.tsx") && /sequence|holiday|business-day|วันหยุด/i.test(f + read(f)));
    const noGate = pages.filter((f) => !/requireCrmV2Page/.test(read(f)));
    const actions = [...walk(`${CRM_PAGES}/settings/sequences`), ...walk(COMP_DIR), ...walk("src/lib/modules/crm").filter((f) => /\/sequences[^/]*\.tsx?$/.test(f))].filter((f) => /^\s*["']use server["']/m.test(read(f)));
    const actNoGate = actions.filter((f) => !/assertCrmV2|crmUiVersion/.test(read(f)));
    chk("C2.2-S9.4", "uiVersion 1 on every C2.2 surface [static]: each sequences / holiday settings page calls requireCrmV2Page · each \"use server\" file of sequences calls assertCrmV2 (or crmUiVersion)",
      pages.length >= 2 && noGate.length === 0 && actions.length >= 1 && actNoGate.length === 0, "gated", `pages=${pages.length} ungated=${noGate.join(",") || "-"} actions=${actions.length} ungatedActions=${actNoGate.join(",") || "-"}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // S6 — UI (static)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── S6 · UI ──");
  const seqDir = `${CRM_PAGES}/settings/sequences`;
  const listPage = read(`${seqDir}/page.tsx`);
  const paramDir = existsSync(seqDir) ? readdirSync(seqDir).find((d) => /^\[.+\]$/.test(d) && existsSync(join(seqDir, d, "page.tsx"))) : undefined;
  const editorPage = paramDir ? read(join(seqDir, paramDir, "page.tsx")) : "";
  const comps = walk(COMP_DIR);
  const compSrc = comps.map(read).join("\n");
  const editorAll = (paramDir ? walk(join(seqDir, paramDir)).map(read).join("\n") : "") + compSrc;
  const guard = (s: string) => /type:\s*["']CRM["']/.test(s) && /notFound\s*\(/.test(s) && /requireCrmV2Page/.test(s);
  {
    const nav = read(NAV_FILE);
    const navOk = /path:\s*["']\/crm\/settings\/sequences["'][^}]*status:\s*["']ready["']/.test(nav);
    chk("C2.2-S6.1", "pages: crm/settings/sequences/page.tsx (list) and crm/settings/sequences/[param]/page.tsx (editor) exist, each with the 404 guard (type CRM → notFound) + requireCrmV2Page · \"/crm/settings/sequences\" is \"ready\" in crm/nav.ts [static]",
      guard(listPage) && guard(editorPage) && navOk, "2 guarded pages · nav", `list=${listPage.length > 0 && guard(listPage)} editor=${paramDir ?? "-"}/${guard(editorPage)} nav=${navOk}`, "MAJOR");
  }
  {
    const steps = ["EMAIL", "LINE", "TASK", "WAIT"].every((k) => new RegExp(`["'\`]${k}["'\`]`).test(editorAll));
    const enrolls = /listEnrollments/.test(editorAll);
    const stats = /\bstats\b/.test(editorAll);
    chk("C2.2-S6.2", "editor (mockup 07 bottom): step editor offering EMAIL / LINE / TASK / WAIT, the enrollment list (listEnrollments) and per-step stats (stats) on the editor page [static]",
      editorPage.length > 0 && steps && enrolls && stats, "steps · enrollments · stats", `editor=${editorPage.length > 0} kinds=${steps} enrollments=${enrolls} stats=${stats}`, "MAJOR");
  }
  {
    const contact360 = walk(`${CRM_PAGES}/contacts/[contactId]`).map(read).join("\n");
    const contactList = read(`${CRM_PAGES}/contacts/page.tsx`) + walk("src/components/crm/contacts").map(read).join("\n");
    const btn = /components\/crm\/sequences/.test(contact360);
    const bulk = /components\/crm\/sequences/.test(contactList) || /bulkEnroll/.test(contactList);
    const danger = /bulkEnroll/.test(compSrc + contactList) && /confirm/.test(compSrc) && /reason/.test(compSrc);
    chk("C2.2-S6.3", "enroll button on the contact 360 page (renders a component from components/crm/sequences) and bulk enroll from the contacts list with confirm + reason fields (X9 in the UI) [static]",
      btn && bulk && danger, "button · bulk · confirm+reason", `contact360=${btn} list=${bulk} confirmReason=${danger}`, "MAJOR");
  }
  {
    const settingsAll = walk(`${CRM_PAGES}/settings`).map(read).join("\n") + compSrc;
    const imp = /importThaiHolidays/.test(settingsAll);
    const clientBad = comps.filter((f) => {
      const s = read(f);
      return /^\s*["']use client["']/m.test(s) && /from\s+["'](@\/lib\/core\/db|@prisma\/client|@\/lib\/modules\/crm\/(sequences|contacts|deals|settings|consents)|@\/lib\/modules\/crm)["']/.test(s);
    });
    const useServer = [...walk(seqDir), ...comps, ...walk("src/lib/modules/crm").filter((f) => /\/sequences[^/]*\.tsx?$/.test(f))].filter((f) => /^\s*["']use server["']/m.test(read(f)));
    const badServer = useServer.filter((f) => {
      const s = read(f);
      return /export\s+(type|interface)\s/.test(s) || /export\s+(const|let|class|function\s)/.test(s.replace(/export\s+async\s+function/g, ""));
    });
    chk("C2.2-S6.4", "holiday / business-day settings UI with \"import Thai public holidays for year N\" (calls importThaiHolidays) · 'use client' components import no prisma-reaching module · \"use server\" files export async functions only (no export type) [static]",
      imp && clientBad.length === 0 && useServer.length >= 1 && badServer.length === 0, "holidays UI · client/server hygiene",
      `import=${imp} clientBad=${clientBad.join(",") || "-"} useServer=${useServer.length} bad=${badServer.join(",") || "-"}`, "MAJOR");
  }
  {
    const files = [...walk(seqDir), ...comps];
    const lit = new Set<string>();
    for (const f of files) {
      const s = read(f);
      for (const m of s.matchAll(/data-testid=["']([^"']+)["']/g)) lit.add(m[1]);
      for (const m of s.matchAll(/data-testid=\{`([^`$]*)\$\{/g)) lit.add(`${m[1]}*`);
    }
    let rows: Any[] = [];
    try { rows = (JSON.parse(read(INV_FILE)).rows ?? []) as Any[]; } catch { rows = []; }
    const inv = new Set(rows.filter((r) => r?.wo === "C2.2").map((r) => String(r.testid)));
    const miss = [...lit].filter((t) => !inv.has(t));
    const noTestid = files.filter((f) => /<(button|input|select|textarea)\b/.test(read(f)) && !/data-testid/.test(read(f)));
    chk("C2.2-S6.5", "D8: every interactive element of the C2.2 pages/components carries data-testid and every literal testid has a row with wo \"C2.2\" in scripts/crm-ui-inventory.json [static]",
      files.length > 0 && lit.size >= 5 && miss.length === 0 && noTestid.length === 0, "all registered", `files=${files.length} testids=${lit.size} missing=${cut(miss.join(","), 120) || "-"} noTestid=${noTestid.join(",") || "-"}`, "MAJOR");
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // X8 — payload / OpsEvent scan · no real transport
  // ═════════════════════════════════════════════════════════════════════════════
  console.log("\n── X8 · scans ──");
  {
    const rows = (await P.outboxEvent.findMany({ where: { tenantId: { in: MY }, type: { startsWith: "crm.sequence." } } })) as Any[];
    const bad = rows.filter((o) => PII.some((s) => s && j(o.payload).includes(s)));
    const ops = (await P.opsEvent.findMany({ where: { tenantId: { in: MY } } })) as Any[];
    const opsBad = ops.filter((o) => PII.some((s) => s && j({ m: o.message, d: o.detail }).includes(s)));
    chk("C2.2-X8.5", "PDPA: no crm.sequence.* payload and no OpsEvent of our tenants carries a phone, e-mail, name or LINE id of our fixtures (checked on the rows this run produced)",
      rows.length > 0 && bad.length === 0 && opsBad.length === 0, "none", `events=${rows.length} bad=${bad.length} ops=${ops.length} opsBad=${opsBad.length} ${cut(opsBad[0]?.message, 60)}${ABSENT}`);
  }
  {
    const real = FETCHES.filter((u) => /resend\.com|api\.line\.me|line\.me\/v2|sms/i.test(u));
    chk("C2.2-X8.6", "no real transport was reached: every send of this run went through the injected fake senders (zero outbound calls to Resend / LINE / SMS, even from the real minute job) · [positive control] the fakes recorded sends",
      real.length === 0 && SENT.length > 0, "0 real · fakes used", `real=${real.length} ${cut(real[0], 60)} fakeSends=${SENT.length}`);
  }
  {
    const fin = (await q(`SELECT count(*)::int AS n FROM "CrmSequenceEnrollment" WHERE "tenantId" = ANY($1) AND status::text IN ('DONE','STOPPED') AND ("stoppedReason" IS NULL OR "stoppedReason" <> 'QC_PARK')`, MY))[0]?.n ?? 0;
    const lease = (await q(`SELECT count(*)::int AS n FROM "CrmSequenceEnrollment" WHERE "tenantId" = ANY($1) AND status::text IN ('DONE','STOPPED') AND ("stoppedReason" IS NULL OR "stoppedReason" <> 'QC_PARK') AND "leaseUntil" IS NOT NULL`, MY))[0]?.n ?? 0;
    chk("C2.2-X8.7", "hygiene: rows the engine finished itself (DONE / STOPPED, excluding the oracle's own parking) never keep a lease — a stale lease on a finished row is what a \"claim by terminal state\" shortcut leaves behind · [positive control] ≥ 10 such rows exist",
      Number(fin) >= 10 && Number(lease) === 0, "≥ 10 finished · 0 leases", `finished=${fin} withLease=${lease}${ABSENT}`, "MINOR");
  }
} catch (e) {
  chk("C2.2-FATAL", "the oracle ran to the end without an unexpected exception", false, "no exception", cut(e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ""}` : String(e), 600));
} finally {
  // ═════════════════════════════════════════════════════════════════════════════
  // CLEANUP — child processes · dispatcher state of crm.sequences · every row of the throwaway tenants (4 passes) · users
  // ═════════════════════════════════════════════════════════════════════════════
  for (const k of KIDS) {
    try { k.kill("SIGKILL"); } catch { /* gone */ }
  }
  const del = async (fn: () => Promise<unknown>) => {
    try { await fn(); } catch { /* order/FK — retried next pass */ }
  };
  let opsOk = true;
  if (opsSnap) {
    await del(() => P.opsAlertState.deleteMany({ where: { source: { in: OPS_KEYS } } }));
    for (const s of opsSnap) await del(() => P.opsAlertState.create({ data: { source: s.source, lastAlertAt: s.lastAlertAt } }));
    const now = ((await P.opsAlertState.findMany({ where: { source: { in: OPS_KEYS } }, select: { source: true, lastAlertAt: true } }).catch(() => [])) as Any[]);
    const key = (xs: Any[]) => xs.map((x) => `${x.source}=${new Date(x.lastAlertAt).getTime()}`).sort().join("|");
    opsOk = key(now) === key(opsSnap);
  }
  const ids = TENANTS.filter((x) => /^[a-z0-9]+$/i.test(x));
  if (ids.length > 0) {
    const inList = ids.map((x) => `'${x}'`).join(",");
    const tables = ((await P.$queryRawUnsafe(
      `select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`,
    ).catch(() => [])) as Any[]).map((r) => r.table_name as string).filter((t) => /^[A-Za-z_]+$/.test(t));
    for (let pass = 0; pass < 4; pass += 1)
      for (const t of tables) await del(() => P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" IN (${inList})`));
    for (const id of ids) {
      await del(() => P.appSystemUnit.deleteMany({ where: { tenantId: id } }));
      await del(() => P.appSystem.deleteMany({ where: { tenantId: id } }));
      await del(() => P.businessUnit.deleteMany({ where: { tenantId: id } }));
      await del(() => P.tenant.delete({ where: { id } }));
    }
    for (const uid of USERS) await del(() => P.appNotification.deleteMany({ where: { recipientUserId: uid } }));
    for (const uid of USERS) await del(() => P.user.delete({ where: { id: uid } }));
    try {
      const left: string[] = [];
      for (const t of tables) {
        const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => [{ n: 0 }])) as Any[];
        const n = Number(r?.[0]?.n ?? 0);
        if (n > 0) left.push(`${t}=${n}`);
      }
      const tenants = await P.tenant.count({ where: { id: { in: ids } } });
      const users = USERS.length ? await P.user.count({ where: { id: { in: USERS } } }) : 0;
      chk("C2.2-CLEAN", "the oracle gives the QC database back exactly as found — every throwaway tenant and every row it owned (sequences, steps, enrollments, contacts, consents, deals, activities, outbox, audit) and the throwaway users are gone · the crm.sequences dispatcher state rows are restored byte-for-byte",
        left.length === 0 && tenants === 0 && users === 0 && opsOk, "0 rows · 0 tenants · 0 users · state restored",
        `${left.join(" · ") || "-"} · tenants=${tenants} users=${users} opsRestored=${opsOk}`, "MAJOR");
    } catch (e) {
      chk("C2.2-CLEAN", "the oracle gives the QC database back exactly as found", false, "0 rows", cut(String((e as Error)?.message ?? e)), "MAJOR");
    }
  }
  await prisma.$disconnect();
}

const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} C2.2: ${passed}/${total} · fake sends ${SENT.length} · outbound fetch stubbed ${FETCHES.length}×`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);

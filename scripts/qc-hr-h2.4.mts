// QC — HR V2 · H2.4 — Clock v2: hr/clock.ts (roster-aware next kind · D13b) + pure hr/clock-rules.ts + mobile GPS self clock +
//      kiosk v2 on verifyPin + break in/out + geofence settings (hr/clock-settings.ts) + HQ27 retention + D-F4/midnight debts (Mig)
// ⚠️ Oracle under change control — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit.
// Contract: ledger/hr-briefs/hr-brief-H2.4.md R1–R14 + fixed-text table (DRAFT, defaults in force) · base session/hr d505755d8.
// Fixtures: own tenants `qc-hr-h24-<stamp>` (u1/u2 · HR system A) + `-other` · roster rows in 2031 written raw · time injected via opts.now.
// Signatures (the oracle fixes them — R1/R2/R8–R11):
//   clock.ts: clock(ctx, { employeeId, kind: IN|OUT|BREAK_START|BREAK_END|NEXT, note?, requireActive?, source?, deviceId? }, { tx?, now? }) → ClockOutcome (+ rosterEntryId)
//     nextClockKind(ctx, employeeId, { tx?, now? }) · mobileClock({ tenantId, userId }, { kind, latitude?, longitude?, accuracyM?, deviceId? }, { now? })
//     myClockState({ tenantId, userId }, { now? }) · kioskClock(ctx, { pin, callerKey, unitId?, kind? }, { now? }) · purgeClockPrivacy({ now, tenantId? }) → { geo, photo }
//   clock-rules.ts: CLOCK_RULES · distanceM({lat,lng},{lat,lng}) · pickRosterEntry(kind, at, [{id,start,end}], { earlyMin }) → cand|id|null ·
//     sessionState(last {kind,at,rosterEntryId}|null, lastWindow {start,end}|null, now) → CLOSED|OPEN|ON_BREAK · nextKindOf(state) ·
//     normalizeShiftTimes({startMin,endMin,crossesMidnight}) · workedMinutesWithBreaks([{kind,at}])
//   clock-settings.ts: listClockSites(ctx, viewer) → { ok, items } · saveClockSite(ctx, viewer, { unitId, mobileEnabled, gpsRequired?, centerLat?, centerLng?,
//     radiusM?, minAccuracyM?, photoRequired?, acceptPdpaNotice? }) → { ok, id } | { ok:false, reason } (viewer = { userId, role, unitAccess, permissions })
// SKIP while clock.ts is absent (exit 0) · QC_FORCE=1 / --force-run runs anyway · --list prints the ids.
// Run (lane DB): bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h2.4.mts

// ▸ LIB-CANDIDATE ─── generic QC-HR helpers (no H2.3 knowledge) — controller swaps this block for `import … from "./qc-hr-lib.mts"` ───
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const ROOT = process.cwd();
import { hrQcHostMark } from "./hr-qc-hosts.mjs"; // ORACLE-EDIT (controller 11 Nov): ฐาน QC ต่อเลนใน allowlist
const QC4_HOST_MARK = hrQcHostMark();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rd = (p: string) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : "");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const errText = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).replace(/\s+/g, " ").slice(0, 180);
const short = (v: unknown, n = 200) => {
  try {
    return (typeof v === "string" ? v : JSON.stringify(v) ?? "undefined").replace(/\s+/g, " ").slice(0, n);
  } catch {
    return String(v).slice(0, n);
  }
};
const isThai = (s: string) => /[฀-๿]/.test(s);
const textOf = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") for (const k of ["reason", "message", "error"]) if (typeof (v as Any)[k] === "string" && (v as Any)[k]) return String((v as Any)[k]);
  return "";
};
const srt = (a: Iterable<string>) => [...a].sort().join(",");
const failedKeys = (o: Record<string, unknown>) => Object.entries(o).filter(([, v]) => !v).map(([k]) => k).join(",") || "all";
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const dk = (v: unknown): string => (v instanceof Date ? (Number.isFinite(v.getTime()) ? v.toISOString().slice(0, 10) : "∅") : typeof v === "string" ? v.slice(0, 10) : "∅");
const dbDate = (day: string) => new Date(`${day}T00:00:00Z`);
const addDay = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const CUID_RE = /\bc[a-z0-9]{20,}\b/;

// ── check registry + summary ──
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Base = "RED" | "GREEN";
type Def = readonly [string, string, Sev, Base, string];
const REG = { prefix: "", checks: [] as readonly Def[], title: new Map<string, string>(), sev: new Map<string, Sev>(), base: new Map<string, Base>(), results: new Map<string, { ok: boolean; expected: string; actual: string }>() };
function initRegistry(prefix: string, checks: readonly Def[]): void {
  Object.assign(REG, { prefix, checks });
  for (const [id, , sev, b, t] of checks) {
    REG.title.set(id, t);
    REG.sev.set(id, sev);
    REG.base.set(id, b);
  }
}
function chk(id: string, ok: unknown, expected: unknown, actual: unknown): boolean {
  const full = `${REG.prefix}${id}`;
  if (!REG.title.has(full)) throw new Error(`unregistered check id: ${id}`);
  const r = { ok: !!ok, expected: String(expected), actual: String(actual) };
  REG.results.set(full, r);
  console.log(`  ${r.ok ? "✅" : "❌"} [${full}] ${REG.title.get(full)}${r.ok ? "" : ` — expected ${r.expected} | actual ${r.actual}`}`);
  return r.ok;
}
function listAndExit(suite: string): never {
  for (const [id, g, sev, b, t] of REG.checks) console.log(`${id}\t${g}\t${sev}\t${b}\t${t}`);
  console.log(`${suite}: ${REG.checks.length} checks`);
  process.exit(0);
}
function skipAndExit(suite: string, reasons: string[]): never {
  console.log(`⏭️  SKIPPED — ${suite}`);
  for (const r of reasons) console.log(`   • ${r}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite, total: 0, passed: 0, failed: [], findings: [], skipped: true, reason: reasons, registered: REG.checks.length })}`);
  process.exit(0);
}
function printSummary(suite: string, o: { force: boolean; crashed: string; missing: string[] }): number {
  for (const [id] of REG.checks) if (!REG.results.has(id)) chk(id.slice(REG.prefix.length), false, "checked", o.crashed ? `not reached (harness crashed: ${o.crashed.slice(0, 80)})` : "not reached");
  const res = [...REG.results.entries()];
  const failed = res.filter(([, r]) => !r.ok).map(([id]) => id);
  const asBase = res.filter(([id, r]) => (REG.base.get(id) === "RED" ? !r.ok : r.ok)).length;
  const offBase = res.filter(([id, r]) => (REG.base.get(id) === "RED" ? r.ok : !r.ok)).map(([id, r]) => `${id}(${REG.base.get(id)}→${r.ok ? "pass" : "fail"})`);
  const nRed = REG.checks.filter(([, , , b]) => b === "RED").length;
  console.log(`BASE-EXPECTATION ${asBase}/${res.length} as registered (RED-by-design ${nRed} · GREEN controls ${REG.checks.length - nRed})${offBase.length ? ` · off: ${offBase.join(" ")}` : ""}`);
  console.log(`\n===== ${suite} ===== passed ${res.length - failed.length}/${res.length}${o.force ? " (QC_FORCE)" : ""}${o.crashed ? " · CRASHED" : ""}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite, total: res.length, passed: res.length - failed.length, failed, findings: failed.map((id) => ({ id, sev: REG.sev.get(id) ?? "CRITICAL" })), skipped: false, forced: o.force, crashed: !!o.crashed, missing: o.missing, baseRed: nRed, baseGreen: REG.checks.length - nRed, offBase })}`);
  return failed.length ? 1 : 0;
}

// ── env guard (QC4 only — refuses before any DB import) ──
async function guardQc4Env(suite: string): Promise<void> {
  process.env.QC_ENV_FILE ??= ".env.qc";
  if (process.env.QC_ENV_FILE === ".env") {
    console.error(`🔴 ${suite}: QC_ENV_FILE=.env is production — refused`);
    process.exit(4);
  }
  const { loadLegacyQcEnv } = (await import("./qc-env-guard.mjs" as string)) as Any;
  loadLegacyQcEnv(suite);
  const bad = [["DATABASE_URL", process.env.DATABASE_URL ?? ""], ["DIRECT_URL", process.env.DIRECT_URL ?? ""]].filter(([n, u]) => (n === "DATABASE_URL" || u) && !u!.includes(QC4_HOST_MARK));
  if (bad.length) {
    console.error(`🔴 STOP ${suite}: writes allowed on QC4 (${QC4_HOST_MARK}) only — ${bad.map(([n]) => n).join(", ")} is not (nothing written)`);
    process.exit(4);
  }
  let host = "?";
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname;
  } catch {
    /* host only — never the URL */
  }
  console.log(`[${suite}] DB host = ${host} (${host.includes(QC4_HOST_MARK) ? "QC4 ✓" : "not QC4"})`);
}

// ── git base helpers ──
const git = (args: string[]) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
let BASE_REF = "";
function baseRef(envName = "QC_HR_BASE"): string {
  if (!BASE_REF) {
    try {
      BASE_REF = process.env[envName] || git(["merge-base", "HEAD", "origin/session/hr"]);
    } catch {
      BASE_REF = "";
    }
  }
  return BASE_REF;
}
const fileAtBase = (p: string): string | null => {
  try {
    return execFileSync("git", ["show", `${baseRef()}:${p}`], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20 });
  } catch {
    return null;
  }
};
function changedVsBase(paths: string[]): string {
  try {
    const out = git(["diff", "--name-only", baseRef(), "--", ...paths]);
    return out ? `changed: ${out.replace(/\n/g, ",")}` : "unchanged";
  } catch (e) {
    return `git: ${errText(e).slice(0, 60)}`;
  }
}
/** text minus the WO's marked hunks: block `// <M> ▸` … `◂ <M>` lines, or any single line containing `<M>` · blank lines + trailing ws dropped */
function stripMarked(text: string, marker: string): { text: string; blocks: number } {
  const out: string[] = [];
  let inBlk = false;
  let blocks = 0;
  for (const line of text.split("\n")) {
    if (inBlk) {
      if (line.includes(`◂ ${marker}`)) inBlk = false;
      continue;
    }
    if (line.includes(`${marker} ▸`) && !line.includes("◂")) {
      inBlk = true;
      blocks++;
      continue;
    }
    if (line.includes(marker)) {
      blocks++;
      continue;
    }
    if (line.trim()) out.push(line.replace(/\s+$/, ""));
  }
  return { text: out.join("\n"), blocks };
}

// ── processes ──
function spawnTsx(args: string[], env: Record<string, string | undefined>, timeoutMs = 300_000): Promise<{ code: number; out: string }> {
  return new Promise((res) => {
    const c = spawn("pnpm", ["exec", "tsx", ...args], { env: env as NodeJS.ProcessEnv, cwd: ROOT });
    let o = "";
    c.stdout.on("data", (d) => (o += String(d)));
    c.stderr.on("data", (d) => (o += String(d)));
    const t = setTimeout(() => c.kill("SIGTERM"), timeoutMs); // our own child only
    c.on("error", (e) => (clearTimeout(t), res({ code: -1, out: errText(e) })));
    c.on("close", (code) => (clearTimeout(t), res({ code: code ?? -1, out: o })));
  });
}

// ── fixtures (throwaway tenants · users with sessions · employees) ──
type Who = { id: string; name: string; tenantId: string; role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, boolean> };
const vOf = (w: Who) => ({ role: w.role, unitAccess: w.unitAccess, permissions: w.permissions, userId: w.id });
function makeFixtures(P: Any, coreHash: Any, slug: string) {
  const fx = { tenants: [] as string[], users: [] as string[], names: [] as string[] };
  return {
    ...fx,
    async newTenant(suffix: string, name: string): Promise<string> {
      const t = await P.tenant.create({ data: { name, slug: `${slug}${suffix}` } });
      fx.tenants.push(t.id);
      return t.id;
    },
    async newUnit(tenantId: string, name: string, tag: string): Promise<string> {
      const u = await P.businessUnit.create({ data: { tenantId, type: "SHOP", name, slug: `${slug}-${tag}` } });
      fx.names.push(name);
      return u.id;
    },
    async mkUser(tenantId: string, tag: string, name: string, role: Who["role"], unitAccess: string[], permissions: Record<string, boolean>): Promise<Who> {
      const u = await P.user.create({ data: { email: `${slug}-${tag}@qc.invalid`, name } });
      fx.users.push(u.id);
      fx.names.push(name);
      await P.membership.create({ data: { userId: u.id, tenantId, role, unitAccess, permissions, acceptedAt: new Date() } });
      const token = coreHash.randomToken(32) as string;
      await P.session.create({ data: { userId: u.id, tokenHash: coreHash.sha256(token), idleExpiresAt: new Date(Date.now() + 864e5), expiresAt: new Date(Date.now() + 864e5) } });
      return { id: u.id, name, tenantId, role, unitAccess, permissions };
    },
    async mkEmp(tenantId: string, systemId: string, name: string, o: { linkedUserId?: string | null; unitId?: string | null; status?: string; active?: boolean } = {}): Promise<string> {
      const e = await P.hrEmployee.create({ data: { tenantId, systemId, name, linkedUserId: o.linkedUserId ?? null, ...(o.unitId ? { unitId: o.unitId } : {}), ...(o.status ? { employmentStatus: o.status } : {}), ...(o.active === false ? { active: false } : {}) } });
      fx.names.push(name);
      return e.id;
    },
  };
}
async function rawRows(P: Any, sql: string, ...params: unknown[]): Promise<Any[] | null> {
  try {
    return (await P.$queryRawUnsafe(sql, ...params)) as Any[];
  } catch {
    return null;
  }
}
const HR_RAW_TABLES = ["HrShiftSwapRequest", "HrTimeCorrection", "HrOtRequest", "HrLeaveBalanceTxn", "HrRosterEntry", "HrShift", "HrHoliday", "HrLeavePolicy", "HrEmployeeUnit"];
const MODEL_ORDER = ["approvalDecision", "approvalRequest", "approvalStep", "approvalPolicy", "hrPayrollItem", "hrPayAdjustment", "hrPayrollRun", "hrSalaryProfile", "hrEmployeeDoc", "hrAttendance", "hrLeave", "hrWorkSchedule", "hrEmployee", "outboxEvent", "appNotification", "webhookDelivery", "auditLog", "aiProposal", "aiPlan", "aiMessage", "aiConversation", "party", "membership", "appSystemUnit", "appSystem", "businessUnit"];
async function sweep(P: Any, fx: { tenants: string[]; users: string[] }, slug: string): Promise<void> {
  const d = async (n: string, f: () => Promise<unknown>) => {
    try {
      await f();
    } catch (e) {
      console.log(`  ⚠ cleanup ${n}: ${errText(e).slice(0, 90)}`);
    }
  };
  for (let pass = 0; pass < 2; pass++)
    for (const tid of fx.tenants) {
      for (const t of HR_RAW_TABLES) await d(t, () => P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, tid));
      for (const m of MODEL_ORDER) if (P[m]?.deleteMany) await d(m, () => P[m].deleteMany({ where: { tenantId: tid } }));
      await d("tenant", () => P.tenant.deleteMany({ where: { id: tid } }));
    }
  const extra = ((await P.user.findMany({ where: { email: { startsWith: `${slug}-` } }, select: { id: true } }).catch(() => [])) as Any[]).map((u) => u.id as string);
  for (const uid of [...new Set([...fx.users, ...extra])]) {
    await d("session", () => P.session.deleteMany({ where: { userId: uid } }));
    await d("appNotification(user)", () => P.appNotification.deleteMany({ where: { recipientUserId: uid } }));
    await d("membership(user)", () => P.membership.deleteMany({ where: { userId: uid } }));
    await d("user", () => P.user.deleteMany({ where: { id: uid } }));
  }
}
async function residueOf(P: Any, fx: { tenants: string[]; users: string[] }, slug: string, slugPrefix: string): Promise<string[]> {
  const out: string[] = [];
  for (const tid of fx.tenants) {
    for (const m of ["hrLeave", "hrEmployee", "auditLog", "outboxEvent", "approvalRequest", "approvalPolicy", "membership", "appSystem", "businessUnit"]) {
      const n = await P[m].count({ where: { tenantId: tid } }).catch(() => -1);
      if (n !== 0) out.push(`${m}=${n}`);
    }
    for (const t of HR_RAW_TABLES) {
      const r = await rawRows(P, `SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, tid);
      const n = r ? Number(r[0]?.n ?? -1) : -2;
      if (n !== 0) out.push(`${t}=${n}`);
    }
  }
  const lu = await P.user.count({ where: { OR: [{ id: { in: fx.users.length ? fx.users : ["∅"] } }, { email: { startsWith: `${slug}-` } }] } }).catch(() => -1);
  const ls = fx.users.length ? await P.session.count({ where: { userId: { in: fx.users } } }).catch(() => -1) : 0;
  const lt = await P.tenant.count({ where: { slug: { startsWith: slugPrefix } } }).catch(() => -1);
  if (lu !== 0) out.push(`user=${lu}`);
  if (ls !== 0) out.push(`session=${ls}`);
  if (lt !== 0) out.push(`tenant(${slugPrefix}*)=${lt}`);
  return out;
}

// ── races: a holder lane takes an advisory key; `calls` start and must queue on it; holder runs `during`, commits ──
async function holdAdvisory<R>(P: Any, key: string, during: (tx: Any) => Promise<unknown>, calls: (() => Promise<R>)[]): Promise<{ res: R[]; waited: boolean; holderErr: string }> {
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  let held: () => void = () => {};
  const heldP = new Promise<void>((r) => (held = r));
  let holderErr = "";
  const holder = P.$transaction(
    async (tx: Any) => {
      await tx.$queryRawUnsafe(`SELECT count(pg_advisory_xact_lock(hashtextextended($1::text, 0)))::int AS n`, key);
      held();
      await gate;
      await during(tx);
    },
    { maxWait: 10_000, timeout: 60_000 },
  ).catch((e: unknown) => ((holderErr = errText(e)), held()));
  await heldP;
  const ps = calls.map((c) => c());
  let seen = 0;
  for (let i = 0; i < 80 && seen < calls.length; i++) {
    await sleep(100);
    const w = await rawRows(P, `SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND wait_event = 'advisory'`);
    seen = Math.max(seen, Number(w?.[0]?.n ?? 0));
  }
  release();
  await holder;
  return { res: await Promise.all(ps), waited: seen >= 1, holderErr };
}
/** deliver one outbox row to its consumer (never marks it processed) */
async function deliver(CONS: Any, e: Any): Promise<{ ok: boolean; err: string }> {
  const fn = CONS?.[e?.type];
  if (typeof fn !== "function") return { ok: false, err: `MISSING consumer for ${e?.type}` };
  try {
    await fn({ id: e.id, tenantId: e.tenantId, type: e.type, payload: e.payload, systemId: e.systemId, unitId: e.unitId });
    return { ok: true, err: "" };
  } catch (err) {
    return { ok: false, err: errText(err) };
  }
}
// ── service calls: module absent / function missing ⇒ { ok:false, text:"∅fn" } (RED for the right reason) · refusals recorded ──
type RO = { ok: boolean; text: string; value: Any };
const refusals: { label: string; text: string }[] = [];
const modState = (m: Any, f: string) => (m === null ? `∅ ${f}` : m.__err ? `import error ${m.__err}` : "loaded");
const loadOpt = async (file: string, spec: string) => (existsSync(join(ROOT, file)) ? ((await import(spec).catch((e: unknown) => ({ __err: errText(e) }))) as Any) : null);
async function callMod(M: Any, file: string, fn: string, args: unknown[], label = fn): Promise<RO> {
  const m = M && !M.__err ? M : null;
  if (typeof m?.[fn] !== "function") return { ok: false, text: `∅${fn} (${modState(M, file)})`, value: undefined };
  try {
    const v = (await m[fn](...args)) as Any;
    const ok = !!v && typeof v === "object" && v.ok !== false;
    if (!ok) refusals.push({ label, text: textOf(v) });
    return { ok, text: ok ? "" : textOf(v), value: v };
  } catch (e) {
    refusals.push({ label, text: `THROW ${errText(e)}` });
    return { ok: false, text: `THROW ${errText(e)}`, value: undefined };
  }
}
const said = (r: RO, t: string) => !r.ok && r.text === t;
const shown = (r: RO | null | undefined) => (!r ? "-" : r.ok ? "ok" : `"${short(r.text, 60)}"`);
const idOf = (r: RO) => (r.ok ? String(r.value?.id ?? "") : "");
/** chk over named sub-conditions (actual = the failing names + extra) */
const ck = (id: string, r: Record<string, unknown>, expected: string, extra = "") => chk(id, Object.values(r).every(Boolean), expected, `${failedKeys(r)}${extra ? ` ${extra}` : ""}`);
// ◂ LIB-CANDIDATE ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const SUITE = "qc-hr-h2.4";
const ARGV = process.argv.slice(2);
const FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run");
const SLUG_PREFIX = "qc-hr-h24-";
const HRD = "src/lib/modules/hr/";
const CLOCK = `${HRD}clock.ts`;
const CRULES = `${HRD}clock-rules.ts`;
const CSET = `${HRD}clock-settings.ts`;
const CACT = `${HRD}clock-actions.ts`;
const ROSTER = `${HRD}roster.ts`;
const MIG0 = "prisma/migrations/20261228000000_hr_clock_v2/migration.sql";
const MIG1 = "prisma/migrations/20261228000001_hr_clock_break_kinds/migration.sql";
const RULES_SHA = "75a66c0c1354e932e7ba29609dcbf0919ffe82b51f476a3945fd1a0749833bf7"; // payroll-rules.ts (FREEZE)
const BRAIN_SHA = "edbeb819c3e3fc7d3da28ca7513c71f3168e9d53bae29eabbbe1cd96f36a1fa8"; // rules.ts (FREEZE · workedMinutes)
const SEAM_SHA = "e7822846d2f4d37ba732237a8cd9286d836a6ad5f3c524ef19730e2869a2f508"; // pos-seam.ts at d505755d8 (Q2: untouched)
// ORACLE-EDIT (H4.4 r2 ruling 3, controller): pos-seam.ts may carry exactly the one marked H4.4 hunk (clockSelf requireActive) — that file's sha
const SEAM_SHA_H44 = "9e7bc4ef89815aecd21c980bc262c7bbb4618b68d903d950ab2f25d2f2c575b8";
const FROZEN_CLOCK = "K1=DAY_OFF:-:-|K2=ON_TIME:0:0|K3=NO_SCHEDULE:-:-"; // qc-hr-h2.1 S8.8 (legacy path, unrostered)
const RULES_WANT = { EARLY_IN_MIN: 120, CLOSE_GRACE_MIN: 240, GEO_KEEP_DAYS: 30, PHOTO_KEEP_DAYS: 90 };
// fixed texts (brief table)
const T = {
  mNoEmp: "บัญชีของคุณยังไม่ได้ผูกกับรายชื่อพนักงาน — ลงเวลาที่เครื่องหน้าร้าน หรือขอให้ผู้ดูแลผูกบัญชี",
  mInactive: "สถานะพนักงานของคุณปิดอยู่ — ติดต่อผู้จัดการ",
  mOff: "สาขานี้ยังไม่เปิดให้ลงเวลาด้วยมือถือ — ลงเวลาที่เครื่องหน้าร้าน",
  mNoGps: "เปิดตำแหน่ง (GPS) ของมือถือก่อน แล้วลองใหม่",
  mBadGps: "อ่านตำแหน่งไม่ได้ — ลองใหม่อีกครั้ง",
  mWeak: "สัญญาณ GPS ยังไม่แม่นพอ — ออกไปที่โล่งแล้วลองใหม่",
  mOutside: "คุณอยู่นอกรัศมีของร้าน — เข้าใกล้ร้านแล้วลองใหม่",
  bNotIn: "ยังไม่ได้ลงเวลาเข้างาน — เริ่มพักไม่ได้",
  bOnBreak: 'กำลังพักอยู่ — กด "กลับจากพัก" เมื่อพร้อม',
  bNotOn: "ยังไม่ได้เริ่มพัก",
  sNotice: "เปิดลงเวลาด้วยมือถือครั้งแรก ต้องยืนยันว่าได้แจ้งพนักงานเรื่องการเก็บตำแหน่งแล้ว (PDPA)",
  sCenter: "ตั้งตำแหน่งร้าน (ละติจูด/ลองจิจูด) ก่อนเปิดลงเวลาด้วยมือถือ",
  sRadius: "รัศมีต้องอยู่ระหว่าง 30 ถึง 2,000 เมตร",
  sAcc: "ความแม่นยำขั้นต่ำต้องอยู่ระหว่าง 10 ถึง 500 เมตร",
  sPhoto: "การถ่ายรูปตอนลงเวลายังไม่เปิดให้ใช้",
  noPerm: "คุณไม่มีสิทธิ์ตั้งค่าระบบพนักงาน",
  otherUnit: "รายการนี้เป็นของสาขาอื่น — คุณจัดการได้เฉพาะสาขาของคุณ",
  shopWide: "รายการที่ใช้ทั้งร้านจัดการได้เฉพาะผู้ดูแลทุกสาขา — เลือกสาขาของคุณ",
  pinWrong: "PIN ไม่ถูกต้อง",
} as const;
const FIXED = new Set<string>(Object.values(T));
const LIMITED_RE = /^ลองใหม่ในอีก \d+ วินาที$/;
const SENS = ["lat", "lng", "accuracyM", "photoKey", "deviceId", "latitude", "longitude"];
const OK_KEYS = "at,deduped,distanceM,judgement,kind,lateMin,ok";
const STATE_KEYS = "canBreak,entry,next,ok,site,state";
const ENTRY_KEYS = "crossesMidnight,date,endMin,shiftName,startMin";
const SITE_KEYS = "gpsRequired,radiusM";
const ITEM_KEYS = "centerLat,centerLng,gpsRequired,id,minAccuracyM,mobileEnabled,noticeAcceptedAt,photoRequired,radiusM,unitId";
const CEN = { lat: 13.7563, lng: 100.5018 };
const IN35 = { latitude: 13.756615, longitude: 100.5018 }; // 35 m north
const OUT222 = { latitude: 13.7583, longitude: 100.5018 }; // 222 m north

const D = (id: string, g: string, sev: Sev, base: Base, title: string): Def => [`H2.4-${id}`, g, sev, base, title] as const;
const C = "CRITICAL", M = "MAJOR"; // prettier-ignore
const CHECKS: readonly Def[] = [
  D("S1.1", "R2", M, "RED", "[pure] distanceM haversine vectors (0 · 35 · 108 · 222 · 111 195 m, ±1)"),
  D("S1.2", "R4", C, "RED", "[pure] pickRosterEntry: 05:50 IN ⇒ 06:00 morning (not 22–06 night) · 21:30 ⇒ night · 16:00 ⇒ null · equal distance ⇒ the started one"),
  D("S1.3", "R3", C, "RED", "[pure] sessionState/nextKindOf: none⇒IN · linked IN 02:00 ⇒ OUT · end+240+1 ⇒ IN · unlinked IN yesterday ⇒ IN · BREAK_START ⇒ BREAK_END"),
  D("S1.4", "R14", M, "RED", "[pure] normalizeShiftTimes: 960/0/true ⇒ 960/1440/false · 22–06 and 07–15 unchanged"),
  D("S1.5", "R2", M, "RED", "[pure] workedMinutesWithBreaks: 07–15 with 30-min break = 450 · OUT while on break = 300"),
  D("S1.6", "R2", M, "RED", "[static] clock-rules.ts pure: no DB/service import, no argument-less new Date() · CLOCK_RULES = 120/240/30/90"),
  D("S2.1", "R3", C, "RED", "[D13b] night 22–06: NEXT 21:58 ⇒ IN linked ON_TIME dueMin 1320 · NEXT 06:05 next day ⇒ OUT same rosterEntryId"),
  D("S2.2", "R3", C, "RED", "nextClockKind at 02:00 inside the night session ⇒ OUT"),
  D("S2.3", "R4", M, "RED", "linked IN judged vs the entry + HrShift.graceMin: 07:20 ⇒ LATE 20 dueMin 420 · 07:10 ⇒ ON_TIME 0"),
  D("S2.4", "R4", C, "RED", "tie-break: night IN 21:55 · OUT 05:50 stays on the night entry · IN 05:58 links the 06:00 morning entry"),
  D("S2.5", "R3", M, "RED", "session grace: NEXT at end+230 ⇒ OUT · another session at end+241 ⇒ IN (new session)"),
  D("S2.6", "R4", M, "RED", "unpublished entry is not linked (rosterEntryId null · legacy judgement NO_SCHEDULE)"),
  D("S2.7", "R3", M, "RED", "unrostered: IN 23:00 then NEXT 01:00 ⇒ IN (legacy calendar rule, Q3)"),
  D("S3.1", "R5", C, "RED", "[MINOR-3] unlinked IN 23:59:40 then IN 00:00:10 ⇒ new row (deduped false · 2 rows)"),
  D("S3.2", "R5", M, "RED", "same session IN twice within 30 s ⇒ deduped · NEXT twice ⇒ deduped · 1 row each"),
  D("S3.3", "R1", C, "GREEN", "[control] POS clockSelf inside a caller tx ⇒ ok:true IN + row (seam shape unchanged)"),
  D("S3.4", "R1", C, "RED", "service.clock / nextClockKind / clockWithPin are the clock.ts functions (same export)"),
  D("S4.1", "R6", C, "RED", "breaks: IN · BREAK_START · NEXT⇒BREAK_END · NEXT⇒OUT, all on the same rosterEntryId"),
  D("S4.2", "R6", M, "RED", "break refusals (mobile): BREAK_START closed ⇒ bNotIn · BREAK_END open ⇒ bNotOn · BREAK_START on break ⇒ bOnBreak · 0 rows"),
  D("S4.3", "R6", M, "RED", "explicit OUT while ON_BREAK ⇒ OUT row · readers (monthlyAttendance · onShiftToday) do not throw on break rows"),
  D("S5.1", "R8", C, "RED", "mobile inside radius ⇒ IN · source MOBILE · lat/lng/accuracyM stored · distanceM 35 · inRadius · result keys exact"),
  D("S5.2", "R8", C, "RED", "mobile outside (222 m) ⇒ mOutside + distanceM · 0 rows · audit hr.clock.mobile_refused {code} without coordinates"),
  D("S5.3", "R8", M, "RED", "missing coordinates ⇒ mNoGps · 0 rows"),
  D("S5.4", "R8", C, "RED", "forged/malformed (lat 91 · lng 181 · strings · NaN · Infinity) ⇒ mBadGps · 0 rows"),
  D("S5.5", "R8", M, "RED", "accuracy 250 m > minAccuracyM 100 ⇒ mWeak · 0 rows"),
  D("S5.6", "R8", C, "RED", "branch without a site (u2) ⇒ mOff · site disabled ⇒ mOff"),
  D("S5.7", "R8", M, "RED", "shop-wide site gpsRequired=false ⇒ ok far away · lat/lng/distanceM NOT stored"),
  D("S5.8", "R8", C, "RED", "posted employeeId ignored (row for own employee) · unlinked user ⇒ mNoEmp · inactive ⇒ mInactive"),
  D("S5.9", "R8", M, "RED", "myClockState keys exact · entry of the open session · site {gpsRequired,radiusM} · no coordinates"),
  D("S5.10", "R8", M, "RED", "[static] clock-actions.ts: use server · mobileClockAction + myClockStateAction · no DB import · no employeeId read"),
  // ORACLE-EDIT r2 (controller 12 Nov · R1/R2): kiosk = NAME + PIN again (brief Q8 overruled) — group rewritten
  D("S6.1", "R9", C, "RED", "kioskClock(name + right PIN) ⇒ IN · source KIOSK · employeeName"),
  D("S6.2", "R9", C, "RED", "wrong PIN ⇒ PIN_TEXT.wrong · counts on hr-verifypin:<t>:kiosk:<uid>:<emp> (not on kiosk:<uid>) · no hr-kiosk:* bucket"),
  D("S6.3", "R1", C, "RED", "per-name lock: 10 wrong for one name ⇒ right PIN limited · 1 hr.pin.locked · same kiosk, other name still clocks · same name, other kiosk still clocks"),
  D("S6.4", "R2", C, "RED", "single-branch kiosk [u2] + u1 name ⇒ wrong (counted) · forged employeeId ⇒ wrong (counted) · other-tenant ⇒ wrong · 0 rows"),
  D("S6.5", "R9", M, "RED", "kiosk BREAK_START after IN ⇒ BREAK_START · NEXT ⇒ BREAK_END"),
  D("S6.6", "R1", M, "RED", "[static] kioskClockAction reads employeeId · kioskClock + kiosk:<user> · scope hrScopeOf · no hr-kiosk: · clock.ts kioskClock → pin.ts verifier · KioskClock.tsx name list + PIN + testids"),
  D("S6.7", "R2", C, "RED", "name list = kioskRoster(scope): [u1] ⇒ u1 names only · all-branch ⇒ every name · [static] HrKioskSection passes hrScopeOf"),
  D("S6.9", "R1", C, "RED", "kiosk shop bucket (controller 12 Nov ruling 1): 60 wrong across names ⇒ right PIN of another name limited · key from ctx only · refusal does not consume hr-verifypin:<t>"),
  D("S6.8", "R1", C, "RED", "shop bucket: wrong PINs on different names add to hr-kiosk-shop:<t>:<sys> (not hr-verifypin:<t>) · H0.5 caller limit (10/10 min) is the per-name limit"),
  D("S7.1", "R10", C, "RED", "first enable without acceptPdpaNotice ⇒ sNotice · with ⇒ ok · noticeAcceptedAt/ById · 1 audit hr.clock.notice_accepted"),
  D("S7.2", "R10", M, "RED", "validation: radius 10/3000 ⇒ sRadius · minAccuracy 5 ⇒ sAcc · gps enable without centre ⇒ sCenter · photoRequired ⇒ sPhoto"),
  D("S7.3", "R10", C, "RED", "viewer matrix listClockSites: owner/mgr-all all · mgr-u1 own + no u2 · mgr-role/staff-key/member/payroll/self ⇒ noPerm · other tenant ⇒ none"),
  D("S7.4", "R10", C, "RED", "branch scope on save: mgr-u1 → u2 ⇒ otherUnit · → shop-wide ⇒ shopWide · → u1 ok"),
  D("S7.5", "R10", M, "RED", "item keys exact · one row per (system, unit) · 10 parallel first saves of one unit ⇒ 1 row"),
  D("S8.1", "R11", C, "RED", "purgeClockPrivacy: >30 d ⇒ lat/lng/accuracyM null, distanceM/inRadius kept · >90 d ⇒ photoKey null · ≤30 d untouched"),
  D("S8.2", "R11", M, "RED", "purge twice ⇒ second returns {geo:0, photo:0} · other tenant untouched · [static] hourly cron calls it"),
  D("S9.1", "X6", C, "RED", "[race] 8 lanes NEXT queued on hr:clock:<emp> ⇒ 1 row"), // ORACLE-EDIT r2: 10 → 8 lanes (pool 10 = holder + lanes + poller)
  D("S9.2", "X6", C, "RED", "[race] kiosk ∥ mobile same employee ⇒ 1 IN row · both ok"),
  D("S9.3", "R1", M, "RED", "[race] clock does not wait on a held roster lock · links the entry"),
  D("S9.4", "R4", M, "RED", "removeEntry after a linked IN ⇒ attendance row kept · rosterEntryId null"),
  D("S10.1", "Mig", C, "RED", "schema: timesOverridden · distanceM · inRadius · HrClockSite + 2 partial uniques · enum BREAK_START/BREAK_END"),
  D("S10.2", "Mig", M, "RED", "[static] migration 000000 (backfill + normalise) · 000001 = ALTER TYPE only"),
  D("S10.3", "R13", C, "RED", "timesOverridden: addEntry override ⇒ true · plain ⇒ false · moveEntry to another shift ⇒ false"),
  D("S10.4", "R13", C, "RED", "copyWeek by flag: override then shift edited ⇒ override copied · stale unflagged ⇒ current shift times"),
  D("S10.5", "R14", M, "RED", "normalise on write: createShift 16:00/00:00 ⇒ 1440/false · addEntry override end 0 ⇒ 1440/false"),
  D("S11.1", "R12", C, "RED", "[static] client files (MobileClock · KioskClock · settings) carry no lat/lng/photoKey · callers never pass now:"),
  D("S11.2", "R12", C, "GREEN", "[control] listAttendance top-level keys carry no sensitive field"),
  D("S11.3", "R12", M, "RED", "every refusal seen is a fixed text (or the limiter text) · no id/coordinate inside"),
  D("S12.1", "R3", C, "GREEN", "[control] legacy unrostered judgement digest = " + FROZEN_CLOCK),
  D("S12.2", "-", C, "GREEN", "[control] payroll-rules.ts + rules.ts sha unchanged"),
  D("S12.3", "Q2", M, "GREEN", "[control] pos-seam.ts byte-identical (Q2) · 4 seam names exported"),
  // ORACLE-EDIT r2 (controller 12 Nov): hunter probes P2 · P1 · P6 · P3 as checks
  D("S13.1", "R3", C, "RED", "[hunt P2] linked IN, entry moved to D+2 ⇒ next-day NEXT = IN · entry reassigned to B ⇒ rows on it belong to B only"),
  D("S13.2", "R2", C, "RED", "[hunt P1] multi-branch kiosk [u1,u2]: u3 name ⇒ wrong (counted) · 0 rows · u2 name ⇒ ok"),
  D("S13.3", "R4", C, "RED", "[hunt P6] earlyInMin 0 · 16–24 entry: IN 15:59 ⇒ NEXT 00:30 = OUT · another IN 15:59 ⇒ NEXT 04:01 = IN (end + grace) · stray IN 20:00 D + entry D+1 01:00 ⇒ NEXT 00:55 = IN (r3)"),
  D("S13.4", "R5", M, "RED", "[hunt P3] gpsRequired=false site ⇒ deviceId not stored · cron-mode purge (no tenantId) nulls deviceId with lat/lng, keeps distanceM"),
  // ORACLE-EDIT VIS-1 C (controller ruling 12 Nov, new checks): the kiosk page (names + positions + PIN pad) and kioskClockAction share one gate
  D("S14.1", "VIS-1 C", C, "RED", "canRunKiosk matrix: OWNER · MANAGER (role, [] and [u1]) · STAFF hr.attendance.clock ([] and [u1]) · STAFF hr.* ⇒ true · plain member · STAFF leave.read/leave.request/payroll.read only · null ⇒ false"),
  D("S14.2", "VIS-1 C", C, "RED", "[static] /hr/kiosk page: canRunKiosk(hrViewerOf(auth)) ⇒ notFound() before HrKioskSection · kioskClockAction: canRunKiosk refusal (fixed Thai text) before kioskClock( · assertCan kept"),
  D("Z1", "-", C, "GREEN", "residue: qc-hr-h24-* tenants, users, buckets, rows gone"),
];
initRegistry("H2.4-", CHECKS);
if (ARGV.includes("--list")) listAndExit(SUITE);
const skipReasons: string[] = existsSync(join(ROOT, CLOCK)) ? [] : [`H2.4 not built: ${CLOCK} absent`];
if (skipReasons.length && !FORCE) skipAndExit(SUITE, skipReasons);

// ═════════ statics ═════════
const NB: Record<string, Any> = {};
function runStatic(): void {
  {
    const c = stripComments(rd(CRULES));
    const imps = [...c.matchAll(/from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1] ?? m[2] ?? "").filter((s) => /prisma|core\/db|@\/lib\/core|tenantDb|\.\/service|\.\/clock$|\.\/roster$/.test(s));
    NB.pure = { exists: !!c, imports: !imps.length, clock: !/Date\.now\(|new Date\(\s*\)/.test(c), imps: imps.join(",") };
  }
  {
    const a = stripComments(rd(CACT));
    ck("S5.10", { exists: !!a, useServer: /^\s*["']use server["']/.test(a), actions: ["mobileClockAction", "myClockStateAction"].every((n) => new RegExp(`export\\s+async\\s+function\\s+${n}\\b`).test(a)), noDb: !/@\/lib\/core\/db|\bprisma\b|tenantDb\(/.test(a), noEmp: !/get\(\s*["']employeeId["']\s*\)|employeeId\s*:/.test(a) }, "use server · 2 actions · no DB · no employeeId");
  }
  {
    const act = stripComments(rd(`${HRD}actions.ts`));
    const kfn = act.split(/export\s+async\s+function\s+/).find((x) => x.startsWith("kioskClockAction")) ?? "";
    const k = stripComments(rd(`${HRD}KioskClock.tsx`));
    const clk = stripComments(rd(CLOCK));
    const kcFn = clk.split(/export\s+async\s+function\s+/).find((x) => x.startsWith("kioskClock(")) ?? "";
    const ui = stripComments(rd(`${HRD}ui.tsx`));
    const sec = ui.split(/export\s+async\s+function\s+/).find((x) => x.startsWith("HrKioskSection")) ?? "";
    // ORACLE-EDIT r2 (R1/R2): name + PIN · verifier = pin.ts (per-employee) · scope from the session · no second limiter
    ck("S6.6", { emp: /get\(\s*["']employeeId["']\s*\)/.test(kfn), calls: /kioskClock\(/.test(kfn), caller: /kiosk:\$\{/.test(kfn), scope: /hrScopeOf\(/.test(kfn), noBucket: !!kfn && !/hr-kiosk:|checkRateLimit/.test(kfn), verifier: /verifyPin\w*\(/.test(kcFn) && !/checkRateLimit/.test(clk), ids: ["hr-kiosk-pin", "hr-kiosk-submit", "hr-kiosk-break", "hr-kiosk-name-"].every((t) => k.includes(t)), names: /people\.map\(/.test(k) && /name=["']employeeId["']/.test(k), manager: /source:\s*["']MANAGER["']/.test(act) }, "employeeId · kioskClock · kiosk:<user> · hrScopeOf · no 2nd limiter · pin.ts verifier · name list + PIN · MANAGER source");
    NB.kioskSec = /kioskRoster\(\s*ctx\s*,\s*hrScopeOf\(/.test(sec) && /people=\{/.test(sec);
  }
  {
    const cron = stripComments(rd("src/app/api/cron/hourly/route.ts"));
    NB.cron = /purgeClockPrivacy\(/.test(cron);
  }
  {
    const m0 = rd(MIG0);
    const m1 = stripComments(rd(MIG1).replace(/--.*$/gm, ""));
    ck("S10.2", { m0: /timesOverridden/.test(m0) && /HrClockSite/.test(m0) && /UPDATE\s+"HrRosterEntry"[\s\S]*timesOverridden/i.test(m0) && /"endMin"\s*=\s*1440/.test(m0), m1: /ALTER\s+TYPE\s+"HrAttendanceKind"\s+ADD\s+VALUE\s+'BREAK_START'/i.test(m1) && /'BREAK_END'/.test(m1) && m1.split(";").filter((x) => x.trim()).every((x) => /ALTER\s+TYPE/i.test(x)) }, "000000 backfill+normalise · 000001 ALTER TYPE only");
  }
  {
    const bad: string[] = [];
    for (const f of [`${HRD}MobileClock.tsx`, `${HRD}KioskClock.tsx`]) {
      const c = stripComments(rd(f));
      if (!c) bad.push(`∅${f.split("/").pop()}`);
      else if (/\b(lat|lng|photoKey)\b/.test(c)) bad.push(f.split("/").pop()!);
    }
    let callers: string[] = [];
    try {
      callers = git(["grep", "-lE", "\\bnow\\s*:", "--", "src/app", `${HRD}actions.ts`, `${HRD}clock-actions.ts`, `${HRD}pos-seam.ts`, `${HRD}settings-actions.ts`]).split("\n").filter(Boolean);
    } catch {
      /* none */
    }
    const hrCallers = callers.filter((f) => f.startsWith(HRD) || /\/hr\//.test(f));
    ck("S11.1", { client: !bad.length, now: !hrCallers.length }, "no lat/lng/photoKey in client · no now: in callers", `${bad.join(",")} ${hrCallers.join(",")}`);
  }
  {
    const s1 = sha(rd(`${HRD}payroll-rules.ts`));
    const s2 = sha(rd(`${HRD}rules.ts`));
    chk("S12.2", s1 === RULES_SHA && s2 === BRAIN_SHA, `${RULES_SHA.slice(0, 12)} · ${BRAIN_SHA.slice(0, 12)}`, `${s1.slice(0, 12)} · ${s2.slice(0, 12)}`);
    const seam = sha(rd(`${HRD}pos-seam.ts`));
    const idx = stripComments(rd(`${HRD}index.ts`));
    chk("S12.3", (seam === SEAM_SHA || seam === SEAM_SHA_H44) && /export\s*\{\s*onShiftToday,\s*workedMinutesBetween,\s*clockSelf,\s*adjustmentStatuses\s*\}/.test(idx), "seam sha · 4 names", seam.slice(0, 12));
  }
}

// ═════════ DB ═════════
await guardQc4Env(SUITE);
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — running although: ${skipReasons.join(" · ")} (expect RED for the right reason, no crash)`);
const P = ((await import("@/lib/core/db")) as Any).prisma as Any;
const sysSvc = (await import("@/lib/modules/system/service")) as Any;
const hr = (await import("@/lib/modules/hr/service")) as Any;
const hrIdx = (await import("@/lib/modules/hr" as string)) as Any;
const coreHash = (await import("@/lib/core/hash" as string)) as Any;
const rMod = await loadOpt(ROSTER, "@/lib/modules/hr/roster");
const setMod = (await import("@/lib/modules/hr/settings" as string).catch(() => null)) as Any;
const clMod = await loadOpt(CLOCK, "@/lib/modules/hr/clock");
const crMod = await loadOpt(CRULES, "@/lib/modules/hr/clock-rules");
const csMod = await loadOpt(CSET, "@/lib/modules/hr/clock-settings");
console.log(`[${SUITE}] modules: clock=${modState(clMod, CLOCK)} · clock-rules=${modState(crMod, CRULES)} · clock-settings=${modState(csMod, CSET)}`);

const tag = Math.random().toString(36).slice(2, 6).replace(/\d/g, "x"); // letters only (AI tools mask 9+ digit runs — rows identified by id)
const SLUG = `${SLUG_PREFIX}${Date.now()}${tag}`;
const fx = makeFixtures(P, coreHash, SLUG);
const at = (day: string, hm: string) => new Date(`${day}T${hm.length === 5 ? `${hm}:00` : hm}+07:00`);
const cl = (fn: string, ...a: unknown[]) => callMod(clMod, CLOCK, fn, a, `clock.${fn}`);
const cs = (fn: string, ...a: unknown[]) => callMod(csMod, CSET, fn, a, `settings.${fn}`);
const ro = (fn: string, ...a: unknown[]) => callMod(rMod, ROSTER, fn, a, `roster.${fn}`);
const pure = (fn: string, ...a: unknown[]): Any => {
  const f = crMod && !crMod.__err ? crMod[fn] : undefined;
  if (typeof f !== "function") return `∅${fn}`;
  try {
    return f(...a);
  } catch (e) {
    return `THROW ${errText(e)}`;
  }
};
const pid = (r: Any) => (r && typeof r === "object" ? (r.id ?? null) : (r ?? null));

function runPure(): void {
  const dv = (b: { lat: number; lng: number }) => Number(pure("distanceM", CEN, b));
  const near = (v: number, w: number) => Number.isFinite(v) && Math.abs(v - w) <= 1;
  ck("S1.1", { zero: near(dv(CEN), 0), m35: near(dv({ lat: 13.756615, lng: 100.5018 }), 35), m108: near(dv({ lat: 13.7563, lng: 100.5028 }), 108), m222: near(dv({ lat: 13.7583, lng: 100.5018 }), 222), deg: near(dv({ lat: 14.7563, lng: 100.5018 }), 111195) }, "0/35/108/222/111195", `35→${dv({ lat: 13.756615, lng: 100.5018 })}`);
  const w = (id: string, d: string, s: string, e: string, d2 = d) => ({ id, start: at(d, s), end: at(d2, e) });
  const night = w("night", "2031-03-03", "22:00", "06:00", "2031-03-04");
  const morn = w("morn", "2031-03-04", "06:00", "14:00");
  const o = { earlyMin: 120 };
  const p1 = pid(pure("pickRosterEntry", "IN", at("2031-03-04", "05:50"), [night, morn], o));
  const p2 = pid(pure("pickRosterEntry", "IN", at("2031-03-03", "21:30"), [night, morn], o));
  const p3 = pid(pure("pickRosterEntry", "IN", at("2031-03-04", "16:00"), [morn], o));
  const p4 = pid(pure("pickRosterEntry", "IN", at("2031-03-05", "10:00"), [w("late", "2031-03-05", "11:00", "19:00"), w("early", "2031-03-05", "09:00", "17:00")], o));
  ck("S1.2", { a: p1 === "morn", b: p2 === "night", c: p3 === null, d: p4 === "early" }, "morn/night/null/early", `${p1}/${p2}/${p3}/${p4}`);
  const ss = (last: Any, win: Any, now: Date) => pure("sessionState", last, win, now);
  const nw = { start: night.start, end: night.end };
  const s0 = ss(null, null, at("2031-03-04", "02:00"));
  const s1 = ss({ kind: "IN", at: at("2031-03-03", "21:58"), rosterEntryId: "night" }, nw, at("2031-03-04", "02:00"));
  const s2 = ss({ kind: "IN", at: at("2031-03-03", "21:58"), rosterEntryId: "night" }, nw, at("2031-03-04", "10:01"));
  const s3 = ss({ kind: "IN", at: at("2031-03-03", "23:00"), rosterEntryId: null }, null, at("2031-03-04", "01:00"));
  const s4 = ss({ kind: "BREAK_START", at: at("2031-03-04", "02:00"), rosterEntryId: "night" }, nw, at("2031-03-04", "02:20"));
  const nk = (s: Any) => pure("nextKindOf", s);
  ck("S1.3", { a: s0 === "CLOSED" && nk(s0) === "IN", b: s1 === "OPEN" && nk(s1) === "OUT", c: s2 === "CLOSED", d: s3 === "CLOSED", e: s4 === "ON_BREAK" && nk(s4) === "BREAK_END" }, "CLOSED/OPEN/CLOSED/CLOSED/ON_BREAK", `${s0}/${s1}/${s2}/${s3}/${s4}`);
  const n1 = pure("normalizeShiftTimes", { startMin: 960, endMin: 0, crossesMidnight: true });
  const n2 = pure("normalizeShiftTimes", { startMin: 1320, endMin: 360, crossesMidnight: true });
  const n3 = pure("normalizeShiftTimes", { startMin: 420, endMin: 900, crossesMidnight: false });
  const tt = (x: Any) => (x && typeof x === "object" ? `${x.startMin}/${x.endMin}/${x.crossesMidnight}` : String(x));
  ck("S1.4", { a: tt(n1) === "960/1440/false", b: tt(n2) === "1320/360/true", c: tt(n3) === "420/900/false" }, "960/1440/false", `${tt(n1)} ${tt(n2)} ${tt(n3)}`);
  const d = "2031-03-06";
  const ev = (k: string, hm: string) => ({ kind: k, at: at(d, hm) });
  const w1 = pure("workedMinutesWithBreaks", [ev("IN", "07:00"), ev("BREAK_START", "10:00"), ev("BREAK_END", "10:30"), ev("OUT", "15:00")]);
  const w2 = pure("workedMinutesWithBreaks", [ev("IN", "07:00"), ev("BREAK_START", "12:00"), ev("OUT", "13:00")]);
  ck("S1.5", { a: w1 === 450, b: w2 === 300 }, "450 · 300", `${w1} · ${w2}`);
  const R = (crMod && !crMod.__err ? crMod.CLOCK_RULES : null) as Any;
  const { imps: _imps, ...pureOk } = NB.pure; // ORACLE-EDIT r2: imps = diagnostic string, not a condition
  ck("S1.6", { ...pureOk, rules: !!R && Object.entries(RULES_WANT).every(([k, v]) => R[k] === v) }, "pure · 120/240/30/90", NB.pure.imps);
}

async function runDb(): Promise<void> {
  const TT = await fx.newTenant("", "QC HR H2.4 ลงเวลา");
  const T2 = await fx.newTenant("-other", "QC HR H2.4 ร้านอื่น");
  const u1 = await fx.newUnit(TT, `สาขาเหนือ ${tag}`, "u1");
  const u2 = await fx.newUnit(TT, `สาขาใต้ ${tag}`, "u2");
  const sA = await sysSvc.createSystem(TT, "HR", "ทีมงาน A");
  const sO = await sysSvc.createSystem(T2, "HR", "ทีมร้านอื่น");
  const ctx = { tenantId: TT, systemId: sA.id };
  const ctxO = { tenantId: T2, systemId: sO.id };
  const K = { "hr.employee.create": true };
  const mk = (t: string, r: Who["role"], ua: string[], p: Record<string, boolean>, tid = TT) => fx.mkUser(tid, t, `QC24 ${t} ${tag}`, r, ua, p);
  const U = {
    owner: await mk("owner", "OWNER", [], {}), mgrU1: await mk("mgru1", "MANAGER", [u1], K), mgrAll: await mk("mgrall", "MANAGER", ["*"], K), mgrRole: await mk("mgrrole", "MANAGER", [u1], {}),
    pay: await mk("pay", "STAFF", ["*"], { "hr.payroll.read": true }), staffKey: await mk("staffkey", "STAFF", [u1], { "hr.attendance.clock": true }), kiosk: await mk("kiosk", "STAFF", [u1], { "hr.attendance.clock": true }),
    A: await mk("sa", "STAFF", [u1], {}), B: await mk("sb", "STAFF", [u1], {}), Dd: await mk("sd", "STAFF", [u2], {}), Q: await mk("sq", "STAFF", [u1], {}), Ex: await mk("sx", "STAFF", [u1], {}),
    member: await mk("member", "STAFF", [], {}), other: await mk("other", "OWNER", [], {}, T2),
  };
  const empN = async (n: string, o: Any = {}) => fx.mkEmp(TT, sA.id, `QC24 พนง ${n} ${tag}`, { unitId: u1, ...o });
  const E = {
    A: await empN("เอ", { linkedUserId: U.A.id }), B: await empN("บี", { linkedUserId: U.B.id }), D: await empN("ดี", { linkedUserId: U.Dd.id, unitId: u2 }),
    Q: await empN("คิว", { linkedUserId: U.Q.id }), Ex: await empN("ปิดแล้ว", { linkedUserId: U.Ex.id, active: false }),
  };
  const shift = (name: string, s: number, e: number, cm = false, grace = 15) => P.hrShift.create({ data: { tenantId: TT, systemId: sA.id, name: `${name} ${tag}`, startMin: s, endMin: e, breakMin: 0, graceMin: grace, crossesMidnight: cm } }).then((r: Any) => r.id as string);
  const S = { m: await shift("เช้า", 420, 900), n: await shift("ดึก", 1320, 360, true), mo: await shift("เช้ามืด", 360, 840) };
  const ent = (emp: string, day: string, sh: string, s: number, e: number, cm = false, pub = true) =>
    P.hrRosterEntry.create({ data: { tenantId: TT, systemId: sA.id, employeeId: emp, date: dbDate(day), shiftId: sh, unitId: u1, startMin: s, endMin: e, breakMin: 0, crossesMidnight: cm, published: pub, publishedAt: pub ? new Date() : null, source: "MANUAL" } }).then((r: Any) => r.id as string);
  const rowsOf = (emp: string) => P.hrAttendance.findMany({ where: { tenantId: TT, employeeId: emp }, orderBy: [{ at: "asc" }, { id: "asc" }] }) as Promise<Any[]>;
  const clk = (emp: string, kind: string, now: Date, extra: Any = {}) => cl("clock", ctx, { employeeId: emp, kind, ...extra }, { now });
  const v = (r: RO, k: string) => (r.ok ? r.value?.[k] : undefined);
  const mob = (who: Who, input: Any, now: Date) => cl("mobileClock", { tenantId: TT, userId: who.id }, input, { now });

  // ═══ S2 roster-aware next kind ═══
  console.log("── S2 roster ──");
  const eN = await empN("ดึก");
  const nEnt = await ent(eN, "2031-03-03", S.n, 1320, 360, true);
  const r21a = await clk(eN, "NEXT", at("2031-03-03", "21:58"));
  const k22 = clMod?.nextClockKind ? await clMod.nextClockKind(ctx, eN, { now: at("2031-03-04", "02:00") }).catch((e: unknown) => `THROW ${errText(e)}`) : "∅nextClockKind";
  const r21b = await clk(eN, "NEXT", at("2031-03-04", "06:05"));
  {
    const rows = await rowsOf(eN);
    ck("S2.1", { inK: v(r21a, "kind") === "IN" && rows[0]?.rosterEntryId === nEnt && rows[0]?.judgement === "ON_TIME" && rows[0]?.dueMin === 1320, outK: v(r21b, "kind") === "OUT" && rows[1]?.rosterEntryId === nEnt, n: rows.length === 2 }, "IN linked ON_TIME 1320 · OUT linked", `${shown(r21a)} ${v(r21a, "kind")}/${v(r21b, "kind")} rows=${rows.map((r) => `${r.kind}:${r.rosterEntryId === nEnt ? "n" : r.rosterEntryId ?? "∅"}:${r.judgement ?? "-"}`).join(",")}`);
    chk("S2.2", k22 === "OUT", "OUT", String(k22));
  }
  {
    const eL1 = await empN("สายหนึ่ง");
    const eL2 = await empN("สายสอง");
    await ent(eL1, "2031-03-10", S.m, 420, 900);
    await ent(eL2, "2031-03-10", S.m, 420, 900);
    const a = await clk(eL1, "NEXT", at("2031-03-10", "07:20"));
    const b = await clk(eL2, "NEXT", at("2031-03-10", "07:10"));
    const [ra, rb] = [(await rowsOf(eL1))[0], (await rowsOf(eL2))[0]];
    ck("S2.3", { late: ra?.judgement === "LATE" && ra?.lateMin === 20 && ra?.dueMin === 420 && !!ra?.rosterEntryId, on: rb?.judgement === "ON_TIME" && rb?.lateMin === 0 }, "LATE 20/420 · ON_TIME 0", `${shown(a)} ${ra?.judgement}:${ra?.lateMin}:${ra?.dueMin} · ${shown(b)} ${rb?.judgement}:${rb?.lateMin}`);
  }
  {
    const eT = await empN("ทาย");
    const nE = await ent(eT, "2031-03-11", S.n, 1320, 360, true);
    const mE = await ent(eT, "2031-03-12", S.mo, 360, 840);
    const x1 = await clk(eT, "NEXT", at("2031-03-11", "21:55"));
    const x2 = await clk(eT, "NEXT", at("2031-03-12", "05:50"));
    const x3 = await clk(eT, "NEXT", at("2031-03-12", "05:58"));
    const rows = await rowsOf(eT);
    const sig = rows.map((r) => `${r.kind}:${r.rosterEntryId === nE ? "night" : r.rosterEntryId === mE ? "morn" : "∅"}`).join(",");
    chk("S2.4", sig === "IN:night,OUT:night,IN:morn", "IN:night,OUT:night,IN:morn", `${sig} ${shown(x1)}${shown(x2)}${shown(x3)}`);
  }
  {
    const eG1 = await empN("เกรซหนึ่ง");
    const eG2 = await empN("เกรซสอง");
    await ent(eG1, "2031-03-13", S.m, 420, 900);
    await ent(eG2, "2031-03-13", S.m, 420, 900);
    await clk(eG1, "NEXT", at("2031-03-13", "06:58"));
    await clk(eG2, "NEXT", at("2031-03-13", "06:58"));
    const a = await clk(eG1, "NEXT", at("2031-03-13", "18:50")); // end 15:00 + 230
    const b = await clk(eG2, "NEXT", at("2031-03-13", "19:01")); // end + 241
    ck("S2.5", { within: v(a, "kind") === "OUT", after: v(b, "kind") === "IN" && (await rowsOf(eG2)).length === 2 }, "OUT · IN", `${v(a, "kind") ?? shown(a)} · ${v(b, "kind") ?? shown(b)}`);
  }
  {
    const eU = await empN("ไม่เผยแพร่");
    await ent(eU, "2031-03-14", S.m, 420, 900, false, false);
    const a = await clk(eU, "NEXT", at("2031-03-14", "07:30"));
    const r = (await rowsOf(eU))[0];
    chk("S2.6", a.ok && !!r && r.rosterEntryId === null && r.judgement === "NO_SCHEDULE", "unlinked NO_SCHEDULE", `${shown(a)} link=${r?.rosterEntryId ?? "∅"} ${r?.judgement}`);
  }
  {
    const eL = await empN("ไม่มีกะ");
    await clk(eL, "NEXT", at("2031-03-15", "23:00"));
    const a = await clk(eL, "NEXT", at("2031-03-16", "01:00"));
    chk("S2.7", v(a, "kind") === "IN", "IN", String(v(a, "kind") ?? shown(a)));
  }

  // ═══ S3 dedupe + seam ═══
  console.log("── S3 dedupe / seam ──");
  {
    const eM = await empN("เที่ยงคืน");
    await clk(eM, "IN", at("2031-03-17", "23:59:40"));
    const b = await clk(eM, "IN", at("2031-03-18", "00:00:10"));
    const n = (await rowsOf(eM)).length;
    chk("S3.1", b.ok && v(b, "deduped") === false && n === 2, "new row · 2 rows", `${shown(b)} deduped=${v(b, "deduped")} rows=${n}`);
  }
  {
    const e1 = await empN("ซ้ำหนึ่ง");
    const e2 = await empN("ซ้ำสอง");
    await ent(e1, "2031-03-19", S.m, 420, 900);
    await clk(e1, "IN", at("2031-03-19", "07:00:00"));
    const a = await clk(e1, "IN", at("2031-03-19", "07:00:30"));
    await clk(e2, "NEXT", at("2031-03-19", "08:00:00"));
    const b = await clk(e2, "NEXT", at("2031-03-19", "08:00:20"));
    ck("S3.2", { same: v(a, "deduped") === true && (await rowsOf(e1)).length === 1, next: v(b, "deduped") === true && (await rowsOf(e2)).length === 1 }, "deduped ×2", `${v(a, "deduped")}/${v(b, "deduped")}`);
  }
  {
    const uS = await mk("seam", "STAFF", [u1], {});
    const eS = await empN("ซีม", { linkedUserId: uS.id });
    let r: Any = null;
    try {
      r = await P.$transaction((tx: Any) => hrIdx.clockSelf({ tenantId: TT, userId: uS.id, kind: "IN" }, { tx }), { maxWait: 10_000, timeout: 30_000 });
    } catch (e) {
      r = { THROW: errText(e) };
    }
    const n = (await rowsOf(eS)).length;
    chk("S3.3", r?.ok === true && r?.kind === "IN" && n === 1, "ok IN · 1 row", `${short(r, 80)} rows=${n}`);
  }
  chk("S3.4", !!clMod && !clMod.__err && hr.clock === clMod.clock && hr.nextClockKind === clMod.nextClockKind && hr.clockWithPin === clMod.clockWithPin, "same functions", modState(clMod, CLOCK));

  // ═══ geofence sites (fixture through the service; RED on base) ═══
  const site = (who: Who, input: Any) => cs("saveClockSite", ctx, vOf(who), input);
  const siteU1 = { unitId: u1, mobileEnabled: true, gpsRequired: true, centerLat: CEN.lat, centerLng: CEN.lng, radiusM: 150, minAccuracyM: 100 };
  // ═══ S7 settings ═══
  console.log("── S7 settings ──");
  {
    const a = await site(U.owner, siteU1);
    const b = await site(U.owner, { ...siteU1, acceptPdpaNotice: true });
    const rows = (await rawRows(P, `SELECT "noticeAcceptedAt", "noticeAcceptedById" FROM "HrClockSite" WHERE "tenantId" = $1 AND "unitId" = $2`, TT, u1)) ?? [];
    const au = ((await P.auditLog.findMany({ where: { tenantId: TT, action: "hr.clock.notice_accepted" } })) as Any[]).length;
    ck("S7.1", { refused: said(a, T.sNotice), ok: b.ok, at: !!rows[0]?.noticeAcceptedAt && rows[0]?.noticeAcceptedById === U.owner.id, audit: au === 1 }, "sNotice · ok · accepted · 1 audit", `${shown(a)} ${shown(b)} audit=${au}`);
  }
  {
    const r = [await site(U.owner, { ...siteU1, radiusM: 10 }), await site(U.owner, { ...siteU1, radiusM: 3000 }), await site(U.owner, { ...siteU1, minAccuracyM: 5 }), await site(U.owner, { unitId: u2, mobileEnabled: true, gpsRequired: true, acceptPdpaNotice: true }), await site(U.owner, { ...siteU1, photoRequired: true })];
    const want = [T.sRadius, T.sRadius, T.sAcc, T.sCenter, T.sPhoto];
    chk("S7.2", r.every((x, i) => said(x, want[i]!)), want.join(" | "), r.map(shown).join(" | "));
  }
  {
    const units = async (who: Who, c = ctx) => {
      const r = await cs("listClockSites", c, vOf(who));
      return { r, u: Array.isArray(r.value?.items) ? (r.value.items as Any[]).map((i) => i.unitId ?? "all") : null };
    };
    const own = await units(U.owner);
    const all = await units(U.mgrAll);
    const m1 = await units(U.mgrU1);
    const deny = await Promise.all([U.mgrRole, U.staffKey, U.member, U.pay, U.A].map((w) => units(w)));
    const oth = await units(U.other, ctxO);
    ck("S7.3", { owner: !!own.u?.includes(u1), mgrAll: !!all.u?.includes(u1), mgrU1: !!m1.u?.includes(u1) && !m1.u?.includes(u2), deny: deny.every((d) => said(d.r, T.noPerm)), other: Array.isArray(oth.u) ? !oth.u.includes(u1) : !oth.r.ok }, "matrix", `owner=${own.u} m1=${m1.u} deny=${deny.map((d) => shown(d.r)).join("|")} other=${oth.u ?? shown(oth.r)}`);
    const items = Array.isArray(own.r.value?.items) ? (own.r.value.items as Any[]) : [];
    NB.items = items.length > 0 && items.every((i) => srt(Object.keys(i)) === ITEM_KEYS);
    NB.itemKeys = srt(Object.keys(items[0] ?? {}));
  }
  {
    const off = { mobileEnabled: false, gpsRequired: true };
    const a = await site(U.mgrU1, { unitId: u2, ...off });
    const b = await site(U.mgrU1, { unitId: null, ...off });
    const c = await site(U.mgrU1, { ...siteU1 });
    ck("S7.4", { u2: said(a, T.otherUnit), all: said(b, T.shopWide), u1: c.ok }, "otherUnit · shopWide · ok", `${shown(a)} ${shown(b)} ${shown(c)}`);
  }
  {
    const uR = await fx.newUnit(TT, `สาขาแข่ง ${tag}`, "ur");
    const rs = await Promise.all(Array.from({ length: 10 }, () => site(U.owner, { unitId: uR, mobileEnabled: false, gpsRequired: true })));
    const n1 = await rawRows(P, `SELECT count(*)::int AS n FROM "HrClockSite" WHERE "tenantId" = $1 AND "unitId" = $2`, TT, uR);
    const nu1 = await rawRows(P, `SELECT count(*)::int AS n FROM "HrClockSite" WHERE "tenantId" = $1 AND "unitId" = $2`, TT, u1);
    ck("S7.5", { keys: NB.items, race: Number(n1?.[0]?.n) === 1 && rs.some((r) => r.ok), u1: Number(nu1?.[0]?.n) === 1 }, ITEM_KEYS, `keys=${NB.itemKeys} race=${n1?.[0]?.n ?? "∅"} u1=${nu1?.[0]?.n ?? "∅"}`);
  }

  // ═══ S5 mobile ═══
  console.log("── S5 mobile ──");
  const d5 = "2031-04-01";
  const aEnt = await ent(E.A, d5, S.m, 420, 900);
  const audN = async () => ((await P.auditLog.findMany({ where: { tenantId: TT, action: "hr.clock.mobile_refused" } })) as Any[]);
  {
    const r = await mob(U.A, { kind: "NEXT", ...IN35, accuracyM: 20, deviceId: "dev-qc" }, at(d5, "06:55"));
    const row = (await rowsOf(E.A))[0];
    const keys = r.ok ? srt(Object.keys(r.value)) : "";
    NB.okKeys = keys;
    ck("S5.1", { ok: r.ok && v(r, "kind") === "IN", row: row?.source === "MOBILE" && Number(row?.lat) === IN35.latitude && Number(row?.lng) === IN35.longitude && row?.accuracyM === 20 && row?.distanceM === 35 && row?.inRadius === true && row?.rosterEntryId === aEnt, dist: v(r, "distanceM") === 35, keys: keys === OK_KEYS }, `IN · MOBILE · 35 m · keys ${OK_KEYS}`, `${shown(r)} keys=${keys} row=${row ? `${row.source}:${row.distanceM}:${row.inRadius}` : "∅"}`);
  }
  {
    const n0 = (await rowsOf(E.B)).length;
    const a0 = (await audN()).length;
    const r = await mob(U.B, { kind: "NEXT", ...OUT222, accuracyM: 20 }, at(d5, "07:00"));
    const au = (await audN()).slice(a0);
    const aKeys = au.map((x) => Object.keys(x.after ?? {})).flat();
    ck("S5.2", { text: said(r, T.mOutside), dist: Math.abs(Number(r.value?.distanceM) - 222) <= 1, rows: (await rowsOf(E.B)).length === n0, audit: au.length === 1 && au[0]?.after?.code && aKeys.every((k) => ["code", "employeeId", "systemId", "unitId"].includes(k)) && !/13\.7|100\.5/.test(JSON.stringify(au[0] ?? {})) }, "mOutside · 222 · 0 rows · audit {code}", `${shown(r)} d=${r.value?.distanceM} audits=${au.length} keys=${aKeys}`);
  }
  {
    const r = await mob(U.B, { kind: "NEXT", accuracyM: 20 }, at(d5, "07:01"));
    chk("S5.3", said(r, T.mNoGps) && (await rowsOf(E.B)).length === 0, "mNoGps · 0 rows", shown(r));
  }
  {
    const bad = [{ latitude: 91, longitude: 100.5 }, { latitude: 13.75, longitude: 181 }, { latitude: "13.7563", longitude: "abc" }, { latitude: Number.NaN, longitude: 100.5 }, { latitude: Number.POSITIVE_INFINITY, longitude: 100.5 }];
    const rs: RO[] = [];
    for (const b of bad) rs.push(await mob(U.B, { kind: "NEXT", ...b, accuracyM: 20 }, at(d5, "07:02")));
    chk("S5.4", rs.every((r) => said(r, T.mBadGps)) && (await rowsOf(E.B)).length === 0, "mBadGps ×5 · 0 rows", rs.map(shown).join(" | "));
  }
  {
    const r = await mob(U.B, { kind: "NEXT", ...IN35, accuracyM: 250 }, at(d5, "07:03"));
    chk("S5.5", said(r, T.mWeak) && (await rowsOf(E.B)).length === 0, "mWeak · 0 rows", shown(r));
  }
  {
    const a = await mob(U.Dd, { kind: "NEXT", ...IN35, accuracyM: 20 }, at(d5, "07:04"));
    const uX = await fx.newUnit(TT, `สาขาปิด ${tag}`, "ux");
    await site(U.owner, { unitId: uX, mobileEnabled: false, gpsRequired: true, centerLat: CEN.lat, centerLng: CEN.lng });
    const uXu = await mk("sxu", "STAFF", [uX], {});
    await empN("สาขาปิด", { linkedUserId: uXu.id, unitId: uX });
    const b = await mob(uXu, { kind: "NEXT", ...IN35, accuracyM: 20 }, at(d5, "07:05"));
    ck("S5.6", { noSite: said(a, T.mOff), disabled: said(b, T.mOff) }, "mOff ×2", `${shown(a)} ${shown(b)}`);
  }
  {
    await site(U.owner, { unitId: null, mobileEnabled: true, gpsRequired: false, centerLat: 18.79, centerLng: 98.98, acceptPdpaNotice: true });
    const r = await mob(U.Dd, { kind: "NEXT", ...IN35, accuracyM: 20 }, at(d5, "07:06"));
    const row = (await rowsOf(E.D))[0];
    chk("S5.7", r.ok && !!row && row.lat === null && row.lng === null && row.distanceM == null && row.source === "MOBILE", "ok · nothing stored", `${shown(r)} lat=${row?.lat ?? "∅"} d=${row?.distanceM ?? "∅"}`);
  }
  {
    const a = await mob(U.Q, { kind: "NEXT", ...IN35, accuracyM: 20, employeeId: E.B }, at(d5, "07:07"));
    const b = await mob(U.member, { kind: "NEXT", ...IN35, accuracyM: 20 }, at(d5, "07:08"));
    const c = await mob(U.Ex, { kind: "NEXT", ...IN35, accuracyM: 20 }, at(d5, "07:09"));
    ck("S5.8", { own: a.ok && (await rowsOf(E.Q)).length === 1 && (await rowsOf(E.B)).length === 0, unlinked: said(b, T.mNoEmp), inactive: said(c, T.mInactive) }, "own row · mNoEmp · mInactive", `${shown(a)} ${shown(b)} ${shown(c)}`);
  }
  {
    const r = await cl("myClockState", { tenantId: TT, userId: U.A.id }, { now: at(d5, "08:00") });
    const x = r.value ?? {};
    ck("S5.9", { keys: srt(Object.keys(x)) === STATE_KEYS, st: x.state === "OPEN" && x.next === "OUT" && x.canBreak === true, entry: !!x.entry && srt(Object.keys(x.entry)) === ENTRY_KEYS && x.entry.startMin === 420 && x.entry.date === d5, site: !!x.site && srt(Object.keys(x.site)) === SITE_KEYS && x.site.radiusM === 150, noGeo: !/13\.75|100\.50/.test(JSON.stringify(x)) }, STATE_KEYS, `${shown(r)} ${srt(Object.keys(x))}`);
  }

  // ═══ S4 breaks ═══
  console.log("── S4 breaks ──");
  {
    const d4 = "2031-04-02";
    const bEnt = await ent(E.B, d4, S.m, 420, 900);
    const g = { ...IN35, accuracyM: 20 };
    const r1 = await mob(U.B, { kind: "BREAK_START", ...g }, at(d4, "06:50"));
    await mob(U.B, { kind: "NEXT", ...g }, at(d4, "06:55"));
    const r2 = await mob(U.B, { kind: "BREAK_END", ...g }, at(d4, "08:00"));
    await mob(U.B, { kind: "BREAK_START", ...g }, at(d4, "10:00"));
    const r3 = await mob(U.B, { kind: "BREAK_START", ...g }, at(d4, "10:05"));
    await mob(U.B, { kind: "NEXT", ...g }, at(d4, "10:30"));
    await mob(U.B, { kind: "NEXT", ...g }, at(d4, "15:00"));
    const rows = await rowsOf(E.B);
    const sig = rows.filter((r) => r.at >= at(d4, "00:00")).map((r) => r.kind).join(",");
    chk("S4.1", sig === "IN,BREAK_START,BREAK_END,OUT" && rows.filter((r) => r.at >= at(d4, "00:00")).every((r) => r.rosterEntryId === bEnt), "IN,BREAK_START,BREAK_END,OUT same entry", sig);
    chk("S4.2", said(r1, T.bNotIn) && said(r2, T.bNotOn) && said(r3, T.bOnBreak), `${T.bNotIn} | ${T.bNotOn} | ${T.bOnBreak}`, `${shown(r1)} | ${shown(r2)} | ${shown(r3)}`);
  }
  {
    const eW = await empN("พักออก");
    await ent(eW, "2031-04-03", S.m, 420, 900);
    await clk(eW, "NEXT", at("2031-04-03", "07:00"));
    await clk(eW, "BREAK_START", at("2031-04-03", "12:00"));
    const o = await clk(eW, "OUT", at("2031-04-03", "13:00"));
    let rd1 = "ok";
    try {
      await hr.monthlyAttendance(ctx, eW, new Date("2031-04-01T00:00:00+07:00"));
      await hrIdx.onShiftToday({ tenantId: TT, at: at("2031-04-03", "12:30"), userIds: [U.A.id] });
    } catch (e) {
      rd1 = `THROW ${errText(e)}`;
    }
    const sig = (await rowsOf(eW)).map((r) => r.kind).join(",");
    chk("S4.3", v(o, "kind") === "OUT" && sig === "IN,BREAK_START,OUT" && rd1 === "ok", "IN,BREAK_START,OUT · readers ok", `${sig} ${rd1}`);
  }

  // ═══ S6 kiosk — ORACLE-EDIT r2 (controller 12 Nov · R1 name + PIN · R2 branch scope) ═══
  console.log("── S6 kiosk (name + PIN) ──");
  const eK = await empN("คีออส");
  const pinOk = await hr.setPin(ctx, eK, "482915").catch((e: unknown) => ({ ok: false, reason: errText(e) }));
  if (!pinOk?.ok) console.log(`  ⚠ fixture setPin: ${short(pinOk, 80)}`);
  const kc = (input: Any, now: Date, c = ctx) => cl("kioskClock", c, input, { now });
  const ALL = { unitIds: "*" };
  const ck0 = `kiosk:${U.kiosk.id}`;
  const d6 = "2031-04-07";
  const bucket = async (key: string) => ((await P.chatRateBucket.findUnique({ where: { key }, select: { count: true } }).catch(() => null)) as Any)?.count ?? 0;
  {
    const r = await kc({ employeeId: eK, pin: "482915", callerKey: ck0, scope: ALL }, at(d6, "07:00"));
    const row = (await rowsOf(eK))[0];
    chk("S6.1", r.ok && v(r, "kind") === "IN" && row?.source === "KIOSK" && typeof v(r, "employeeName") === "string", "IN · KIOSK · name", `${shown(r)} src=${row?.source ?? "∅"}`);
  }
  {
    const r = await kc({ employeeId: eK, pin: "000111", callerKey: ck0, scope: ALL }, at(d6, "07:01"));
    const n = await bucket(`hr-verifypin:${TT}:${ck0}:${eK}`);
    const nAcc = await bucket(`hr-verifypin:${TT}:${ck0}`);
    const kb = await P.chatRateBucket.count({ where: { key: { startsWith: "hr-kiosk:" }, AND: [{ key: { contains: TT } }] } });
    chk("S6.2", said(r, T.pinWrong) && n === 1 && nAcc === 0 && kb === 0, "wrong · name bucket 1 · account bucket 0 · no hr-kiosk", `${shown(r)} name=${n} account=${nAcc} hr-kiosk=${kb}`);
  }
  const eK2 = await empN("คีออสสอง");
  await hr.setPin(ctx, eK2, "739164").catch(() => null);
  {
    const ck1 = `kiosk:qc-limit-${tag}`;
    const w: RO[] = [];
    for (let i = 0; i < 10; i++) w.push(await kc({ employeeId: eK, pin: "000222", callerKey: ck1, scope: ALL }, at(d6, "07:02")));
    const r = await kc({ employeeId: eK, pin: "482915", callerKey: ck1, scope: ALL }, at(d6, "09:00"));
    const locked = ((await P.auditLog.findMany({ where: { tenantId: TT, action: "hr.pin.locked" } })) as Any[]).filter((x) => x.after?.callerKey === `${ck1}:${eK}`).length;
    const other = await kc({ employeeId: eK2, pin: "739164", callerKey: ck1, scope: ALL }, at(d6, "07:00"));
    const r2 = await kc({ employeeId: eK, pin: "482915", callerKey: `kiosk:qc-other-${tag}`, kind: "BREAK_START", scope: ALL }, at(d6, "09:00"));
    ck("S6.3", { wrong10: w.every((x) => said(x, T.pinWrong)), limited: !r.ok && LIMITED_RE.test(r.text), audit: locked === 1, otherName: other.ok && v(other, "kind") === "IN", otherKiosk: r2.ok }, "10 wrong · limited · 1 locked audit · other name ok · other kiosk ok", `${shown(r)} audit=${locked} · ${shown(other)} · ${shown(r2)}`);
  }
  {
    const n0 = (await rowsOf(eK)).length;
    const cU2 = `kiosk:qc-u2-${tag}`;
    const a = await kc({ employeeId: eK, pin: "482915", callerKey: cU2, scope: { unitIds: [u2] } }, at(d6, "10:00"));
    const na = await bucket(`hr-verifypin:${TT}:${cU2}:${eK}`);
    const forged = `c${tag}forgedemployeeidxx`;
    const f = await kc({ employeeId: forged, pin: "482915", callerKey: cU2, scope: ALL }, at(d6, "10:00"));
    const nf = await bucket(`hr-verifypin:${TT}:${cU2}:${forged}`);
    const b = await kc({ employeeId: eK, pin: "482915", callerKey: `kiosk:qc-o-${tag}`, scope: ALL }, at(d6, "10:00"), ctxO);
    ck("S6.4", { u2: said(a, T.pinWrong) && na === 1, forged: said(f, T.pinWrong) && nf === 1, other: said(b, T.pinWrong), rows: (await rowsOf(eK)).length === n0 }, "wrong (counted) ×2 · other tenant wrong · 0 rows", `${shown(a)}:${na} ${shown(f)}:${nf} ${shown(b)}`);
  }
  {
    const eK3 = await empN("คีออสสาม");
    await hr.setPin(ctx, eK3, "615283").catch(() => null);
    const ckx = `kiosk:qc-b-${tag}`;
    await kc({ employeeId: eK3, pin: "615283", callerKey: ckx, scope: ALL }, at(d6, "07:00"));
    const a = await kc({ employeeId: eK3, pin: "615283", callerKey: ckx, kind: "BREAK_START", scope: ALL }, at(d6, "10:00"));
    const b = await kc({ employeeId: eK3, pin: "615283", callerKey: ckx, scope: ALL }, at(d6, "10:30"));
    chk("S6.5", v(a, "kind") === "BREAK_START" && v(b, "kind") === "BREAK_END", "BREAK_START · BREAK_END", `${v(a, "kind") ?? shown(a)} · ${v(b, "kind") ?? shown(b)}`);
  }
  const u3 = await fx.newUnit(TT, `สาขากลาง ${tag}`, "u3");
  const eU2 = await empN("สาขาใต้", { unitId: u2 });
  const eU3 = await empN("สาขากลาง", { unitId: u3 });
  await hr.setPin(ctx, eU2, "528461").catch(() => null);
  await hr.setPin(ctx, eU3, "528462").catch(() => null);
  {
    const ids = async (sc: Any) => new Set(((await hr.kioskRoster(ctx, sc).catch(() => [])) as Any[]).map((p) => p.id as string));
    const s1 = await ids({ unitIds: [u1] });
    const sAll = await ids(ALL);
    ck("S6.7", { u1: s1.has(eK) && !s1.has(eU2) && !s1.has(eU3), all: sAll.has(eK) && sAll.has(eU2) && sAll.has(eU3), ui: !!NB.kioskSec }, "[u1] ⇒ u1 only · * ⇒ all · ui passes hrScopeOf", `u1=${s1.has(eK)}/${s1.has(eU2)}/${s1.has(eU3)} all=${sAll.size} ui=${NB.kioskSec}`);
  }
  {
    const tk = `hr-kiosk-shop:${TT}:${sA.id}`; // ORACLE-EDIT r3 (controller ruling r3-2): kiosk shop bucket, never hr-verifypin:<t>
    const t0 = await bucket(tk);
    const v0 = await bucket(`hr-verifypin:${TT}`);
    const names = [eK2, eU2, eU3];
    const rs: RO[] = [];
    for (const e of names) rs.push(await kc({ employeeId: e, pin: "000333", callerKey: `kiosk:qc-shop-${tag}`, scope: ALL }, at(d6, "11:00")));
    const t1 = await bucket(tk);
    const pinMod = (await import("@/lib/modules/hr/pin" as string).catch(() => null)) as Any;
    const v1 = await bucket(`hr-verifypin:${TT}`);
    ck("S6.8", { wrong: rs.every((r) => said(r, T.pinWrong)), shop: t1 - t0 === names.length && v1 === v0, callerLimit: pinMod?.VERIFY_PIN_CALLER_LIMIT?.limit === 10 && pinMod?.VERIFY_PIN_LIMIT?.limit === 120 }, "3 wrong · kiosk shop bucket +3 · hr-verifypin unchanged · H0.5 limits 10/120", `kshop ${t0}→${t1} vp ${v0}→${v1} ${rs.map(shown).join(" ")}`);
  }

  // ORACLE-EDIT r2b (controller 12 Nov, pre-approved): S6.9 kiosk shop-wide bucket 60/60 s on the kiosk path only — own HR system so other groups are not tripped
  {
    const sS = await sysSvc.createSystem(TT, "HR", "ระบบถังร้าน");
    const ctxS = { tenantId: TT, systemId: sS.id };
    const names: string[] = [];
    for (let i = 0; i < 7; i++) {
      const e = await fx.mkEmp(TT, sS.id, `QC24 ถังร้าน ${i} ${tag}`, { unitId: u1 });
      await hr.setPin(ctxS, e, `3170${10 + i}`).catch(() => null);
      names.push(e);
    }
    const ckS = `kiosk:qc-shop9-${tag}`;
    const vpBefore = await bucket(`hr-verifypin:${TT}`); // ORACLE-EDIT r3 (pre-approved): kiosk wrongs never touch the verifyPin shop bucket
    const w: RO[] = [];
    for (let b = 0; b < 6; b++) w.push(...(await Promise.all(Array.from({ length: 10 }, (_, j) => kc({ employeeId: names[j % 6]!, pin: "000999", callerKey: `${ckS}${j}`, scope: ALL }, at(d6, "12:00"), ctxS)))));
    const vp0 = await bucket(`hr-verifypin:${TT}`);
    const pinMod9 = (await import("@/lib/modules/hr/pin" as string).catch(() => null)) as Any;
    const pos = pinMod9?.verifyPin ? await pinMod9.verifyPin({ tenantId: TT, pin: "317010", callerKey: `pos:qc-${tag}` }).catch((e: unknown) => ({ ok: false, reason: errText(e) })) : { ok: false, reason: "∅verifyPin" };
    const vpPos = await bucket(`hr-verifypin:${TT}`);
    const r = await kc({ employeeId: names[6]!, pin: "317016", callerKey: `kiosk:qc-fresh9-${tag}`, scope: ALL }, at(d6, "12:01"), ctxS);
    const vp1 = await bucket(`hr-verifypin:${TT}`);
    const keys = ((await P.chatRateBucket.findMany({ where: { key: { startsWith: "hr-kiosk-shop:" }, AND: [{ key: { contains: TT } }] }, select: { key: true, count: true } })) as Any[]);
    const own = keys.find((k) => k.key === `hr-kiosk-shop:${TT}:${sS.id}`);
    ck("S6.9", { wrong60: w.length === 60 && w.every((x) => said(x, T.pinWrong)), limited: !r.ok && LIMITED_RE.test(r.text) && (await rowsOf(names[6]!)).length === 0, key: !!own && keys.filter((k) => k.key.includes(sS.id)).length === 1, verifyPinUntouched: vp1 === vp0 && vp0 === vpBefore, posFull: pos?.ok === true && vpPos === vp0 }, "60 wrong · 61st limited · 1 server key · hr-verifypin unchanged · POS verifyPin ok", `${shown(r)} keys=${keys.map((k) => `${k.key.split(":").length}:${k.count}`).join(",")} vp ${vpBefore}→${vp0}→${vp1} pos=${short(pos, 40)}:${vpPos}`);
  }

  // ═══ S8 retention ═══
  console.log("── S8 retention ──");
  {
    const eR = await empN("เก็บ");
    const NOW = at("2031-06-30", "12:00");
    const mkA = (daysAgo: number) => P.hrAttendance.create({ data: { tenantId: TT, systemId: sA.id, employeeId: eR, kind: "IN", at: new Date(NOW.getTime() - daysAgo * 864e5), lat: 13.75, lng: 100.5, accuracyM: 12, photoKey: `qc/${tag}/${daysAgo}.jpg`, source: "MOBILE" } }).then((r: Any) => r.id as string);
    const [a29, a31, a91] = [await mkA(29), await mkA(31), await mkA(91)];
    await P.$executeRawUnsafe(`UPDATE "HrAttendance" SET "distanceM" = 40, "inRadius" = true WHERE "employeeId" = $1`, eR).catch(() => null);
    const eO = await fx.mkEmp(T2, sO.id, `QC24 อื่น ${tag}`, {});
    const oId = (await P.hrAttendance.create({ data: { tenantId: T2, systemId: sO.id, employeeId: eO, kind: "IN", at: new Date(NOW.getTime() - 40 * 864e5), lat: 13.75, lng: 100.5 } })).id as string;
    const p1 = await cl("purgeClockPrivacy", { now: NOW, tenantId: TT });
    const g = async (id: string) => (await rawRows(P, `SELECT lat, lng, "accuracyM", "photoKey", "distanceM", "inRadius" FROM "HrAttendance" WHERE id = $1`, id))?.[0] ?? (await P.hrAttendance.findUnique({ where: { id } }));
    const [r29, r31, r91, ro] = [await g(a29), await g(a31), await g(a91), await g(oId)];
    ck("S8.1", { kept29: r29?.lat !== null && r29?.photoKey !== null, geo31: r31?.lat === null && r31?.lng === null && r31?.accuracyM === null && r31?.distanceM === 40 && r31?.inRadius === true && r31?.photoKey !== null, photo91: r91?.lat === null && r91?.photoKey === null }, "29 kept · 31 geo null · 91 photo null", `${shown(p1)} 31=${r31?.lat ?? "∅"}/${r31?.distanceM ?? "∅"} 91=${r91?.photoKey ?? "∅"}`);
    const p2 = await cl("purgeClockPrivacy", { now: NOW, tenantId: TT });
    ck("S8.2", { again: p2.ok && v(p2, "geo") === 0 && v(p2, "photo") === 0, other: ro?.lat !== null && ro?.lat !== undefined, cron: !!NB.cron }, "0/0 · other tenant kept · cron", `${shown(p2)} other=${ro?.lat ?? "∅"} cron=${NB.cron}`);
  }

  // ═══ S9 races ═══
  console.log("── S9 races ──");
  {
    const eX = await empN("แตะรัว");
    const now = at("2031-05-05", "07:00");
    const h = await holdAdvisory(P, `hr:clock:${eX}`, async () => {}, Array.from({ length: 8 }, () => () => clk(eX, "NEXT", now)) /* ORACLE-EDIT r2: 8 lanes */);
    const n = (await rowsOf(eX)).length;
    chk("S9.1", h.waited && n === 1 && h.res.every((r) => r.ok), "queued · 1 row", `waited=${h.waited} rows=${n} ${h.res.filter((r) => !r.ok).map(shown).slice(0, 2).join(",")}${h.holderErr}`);
  }
  {
    const uZ = await mk("sz", "STAFF", [u1], {});
    const eZ = await empN("สองทาง", { linkedUserId: uZ.id });
    await hr.setPin(ctx, eZ, "905173").catch(() => null);
    const now = at("2031-05-06", "07:00");
    const h = await holdAdvisory(P, `hr:clock:${eZ}`, async () => {}, [() => kc({ employeeId: eZ, pin: "905173", callerKey: `kiosk:qc-z-${tag}`, scope: ALL }, now) /* ORACLE-EDIT r2: name + PIN call shape */, () => mob(uZ, { kind: "NEXT", ...IN35, accuracyM: 20 }, now)]);
    const rows = await rowsOf(eZ);
    chk("S9.2", h.waited && rows.length === 1 && rows[0]?.kind === "IN" && h.res.every((r) => r.ok), "1 IN · both ok", `waited=${h.waited} rows=${rows.map((r) => r.kind)} ${h.res.map(shown).join(" ")}`);
  }
  {
    const eY = await empN("ล็อกกะ");
    const day = "2031-05-07";
    const yEnt = await ent(eY, day, S.m, 420, 900);
    let done = 0;
    const h = await holdAdvisory(P, `hr:roster:${sA.id}:${eY}:${day}`, async () => {}, [async () => { const r = await clk(eY, "NEXT", at(day, "07:00")); done = Date.now(); return r; }]);
    const row = (await rowsOf(eY))[0];
    chk("S9.3", !h.waited && done > 0 && row?.rosterEntryId === yEnt, "no wait · linked", `waited=${h.waited} link=${row?.rosterEntryId === yEnt ? "ok" : row?.rosterEntryId ?? "∅"}`);
  }
  {
    const eV = await empN("ลบกะ");
    const day = "2031-05-08";
    const vEnt = await ent(eV, day, S.m, 420, 900);
    await clk(eV, "NEXT", at(day, "07:00"));
    const rm = await ro("removeEntry", ctx, vOf(U.owner), vEnt);
    const rows = await rowsOf(eV);
    chk("S9.4", rm.ok && rows.length === 1 && rows[0]?.rosterEntryId === null, "kept · link null", `${shown(rm)} rows=${rows.length} link=${rows[0]?.rosterEntryId ?? "null"}`);
  }

  // ═══ S13 hunter probes — ORACLE-EDIT r2 (controller 12 Nov) ═══
  console.log("── S13 hunt P2 · P1 · P6 · P3 ──");
  {
    const sD = await shift("กลางวัน", 540, 1020);
    const eA2 = await empN("ย้ายกะเอ");
    const eB2 = await empN("ย้ายกะบี");
    const E2 = await ent(eA2, "2031-05-12", sD, 540, 1020);
    const i2 = await clk(eA2, "NEXT", at("2031-05-12", "09:00"));
    const m2 = await ro("moveEntry", ctx, vOf(U.owner), E2, { date: "2031-05-14" });
    const r2 = await clk(eA2, "NEXT", at("2031-05-13", "09:00"));
    const E1 = await ent(eA2, "2031-05-20", sD, 540, 1020);
    await clk(eA2, "NEXT", at("2031-05-20", "09:00"));
    const m1 = await ro("moveEntry", ctx, vOf(U.owner), E1, { employeeId: eB2 });
    const o1 = await clk(eA2, "NEXT", at("2031-05-20", "17:05"));
    const b1 = await clk(eB2, "NEXT", at("2031-05-20", "09:30"));
    const owners = new Set(((await P.hrAttendance.findMany({ where: { tenantId: TT, rosterEntryId: E1 }, select: { employeeId: true } })) as Any[]).map((r) => r.employeeId));
    ck("S13.1", { linked: v(i2, "rosterEntryId") === E2, moved: m2.ok && m1.ok, nextDay: v(r2, "kind") === "IN", aOut: v(o1, "kind") === "OUT", bIn: v(b1, "kind") === "IN" && v(b1, "rosterEntryId") === E1, owners: owners.size === 1 && owners.has(eB2) }, "next-day IN · rows on the moved entry = B only", `${shown(m2)} ${shown(m1)} 2b=${v(r2, "kind") ?? shown(r2)} 2a owners=${owners.size}`);
  }
  {
    const cM = `kiosk:qc-multi-${tag}`;
    const eZ3 = await empN("สามแซด", { unitId: u3 });
    await hr.setPin(ctx, eZ3, "905174").catch(() => null);
    const eZ2 = await empN("สองแซด", { unitId: u2 });
    await hr.setPin(ctx, eZ2, "905175").catch(() => null);
    const sc = { unitIds: [u1, u2] };
    const r = await kc({ employeeId: eZ3, pin: "905174", callerKey: cM, scope: sc }, at("2031-05-21", "09:00"));
    const n = await bucket(`hr-verifypin:${TT}:${cM}:${eZ3}`);
    const ok2 = await kc({ employeeId: eZ2, pin: "905175", callerKey: cM, scope: sc }, at("2031-05-21", "09:00"));
    ck("S13.2", { u3: said(r, T.pinWrong) && n === 1 && (await rowsOf(eZ3)).length === 0, u2: ok2.ok && v(ok2, "kind") === "IN" }, "u3 wrong (counted) · u2 ok", `${shown(r)}:${n} ${shown(ok2)}`);
  }
  {
    const sP = await sysSvc.createSystem(TT, "HR", "ระบบเข้าก่อน");
    await P.appSystem.update({ where: { id: sP.id }, data: { settings: { hrClock: { earlyInMin: 0, closeGraceMin: 240 } } } });
    const ctxP = { tenantId: TT, systemId: sP.id };
    const shE = (await P.hrShift.create({ data: { tenantId: TT, systemId: sP.id, name: `เย็น ${tag}`, startMin: 960, endMin: 1440, breakMin: 0, graceMin: 15, crossesMidnight: false } })).id as string;
    const mkE = async (n: string, day: string) => {
      const e = await fx.mkEmp(TT, sP.id, `QC24 เข้าก่อน ${n} ${tag}`, { unitId: u1 });
      await P.hrRosterEntry.create({ data: { tenantId: TT, systemId: sP.id, employeeId: e, date: dbDate(day), shiftId: shE, unitId: u1, startMin: 960, endMin: 1440, breakMin: 0, crossesMidnight: false, published: true, publishedAt: new Date(), source: "MANUAL" } });
      return e;
    };
    const c6 = (e: string, now: Date) => cl("clock", ctxP, { employeeId: e, kind: "NEXT", requireActive: true }, { now });
    const e1 = await mkE("หนึ่ง", "2031-09-09");
    const i1 = await c6(e1, at("2031-09-09", "15:59"));
    const o1 = await c6(e1, at("2031-09-10", "00:30"));
    const e2 = await mkE("สอง", "2031-09-11");
    await c6(e2, at("2031-09-11", "15:59"));
    const o2 = await c6(e2, at("2031-09-12", "04:01"));
    // ORACLE-EDIT r3 (pre-approved, review MEDIUM-r2-1): stray IN 20:00 D must not adopt the D+1 01:00–09:00 entry
    const e3 = await fx.mkEmp(TT, sP.id, `QC24 เข้าก่อน สาม ${tag}`, { unitId: u1 });
    const shN = (await P.hrShift.create({ data: { tenantId: TT, systemId: sP.id, name: `ตีหนึ่ง ${tag}`, startMin: 60, endMin: 540, breakMin: 0, graceMin: 15, crossesMidnight: false } })).id as string;
    const nE = (await P.hrRosterEntry.create({ data: { tenantId: TT, systemId: sP.id, employeeId: e3, date: dbDate("2031-09-14"), shiftId: shN, unitId: u1, startMin: 60, endMin: 540, breakMin: 0, crossesMidnight: false, published: true, publishedAt: new Date(), source: "MANUAL" } })).id as string;
    await c6(e3, at("2031-09-13", "20:00"));
    const a3 = await c6(e3, at("2031-09-14", "00:55"));
    const r3 = (await P.hrAttendance.findMany({ where: { tenantId: TT, employeeId: e3 }, orderBy: { at: "asc" } })) as Any[];
    ck("S13.3", { inUnlinked: v(i1, "kind") === "IN", out: v(o1, "kind") === "OUT", fresh: v(o2, "kind") === "IN", nextDay: v(a3, "kind") === "IN" && r3.every((x) => x.kind === "IN") && !r3.some((x) => x.kind === "OUT" && x.rosterEntryId === nE) }, "IN · OUT at 00:30 · IN at 04:01 · stray 20:00 + D+1 01:00 entry ⇒ 00:55 IN", `${v(i1, "kind")}:${v(i1, "rosterEntryId") ?? "∅"} ${v(o1, "kind") ?? shown(o1)} ${v(o2, "kind") ?? shown(o2)} 00:55=${v(a3, "kind") ?? shown(a3)} rows=${r3.map((x) => x.kind).join(",")}`);
  }
  {
    const r = await mob(U.Dd, { kind: "NEXT", ...IN35, accuracyM: 20, deviceId: "iPhone-of-D-serial" }, at("2031-07-01", "09:00"));
    const row = (await rowsOf(E.D)).find((x) => x.at.getTime() === at("2031-07-01", "09:00").getTime());
    const old = (await P.hrAttendance.create({ data: { tenantId: TT, systemId: sA.id, employeeId: E.D, kind: "OUT", at: new Date("1999-10-02T10:00:00Z"), source: "MOBILE", lat: 13.7563, lng: 100.5018, accuracyM: 8, distanceM: 3, inRadius: true, deviceId: "dev-1" } })).id as string;
    const p1 = await cl("purgeClockPrivacy", { now: new Date("2000-01-15T00:00:00Z") });
    const o = (await P.hrAttendance.findUnique({ where: { id: old } })) as Any;
    ck("S13.4", { stored: r.ok && !!row && row.deviceId === null, purged: p1.ok && o?.lat === null && o?.deviceId === null && o?.distanceM === 3 }, "deviceId not stored · purged · distanceM kept", `${shown(r)} dev=${row?.deviceId ?? "∅"} old=${o?.lat ?? "∅"}/${o?.deviceId ?? "∅"}/${o?.distanceM ?? "∅"}`);
  }

  // ═══ S10 migration + D-F4 + midnight ═══
  console.log("── S10 migration ──");
  {
    const col = async (t: string, c: string) => Number((await rawRows(P, `SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`, t, c))?.[0]?.n ?? 0) === 1;
    const idx = (await rawRows(P, `SELECT indexdef FROM pg_indexes WHERE tablename = 'HrClockSite'`)) ?? [];
    const en = ((await rawRows(P, `SELECT e.enumlabel AS l FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'HrAttendanceKind'`)) ?? []).map((r) => r.l);
    ck("S10.1", { flag: await col("HrRosterEntry", "timesOverridden"), dist: await col("HrAttendance", "distanceM"), inR: await col("HrAttendance", "inRadius"), site: await col("HrClockSite", "centerLat"), partial: idx.filter((i) => /UNIQUE/i.test(i.indexdef) && /WHERE/i.test(i.indexdef)).length >= 2, enum: en.includes("BREAK_START") && en.includes("BREAK_END") }, "columns · table · 2 partial uniques · enum", `idx=${idx.length} enum=${en}`);
  }
  {
    const eF = await empN("ธง");
    const day = "2031-06-04";
    const a = await ro("addEntry", ctx, vOf(U.owner), { employeeId: eF, date: day, shiftId: S.m, startMin: 840, endMin: 1200 });
    const b = await ro("addEntry", ctx, vOf(U.owner), { employeeId: eF, date: "2031-06-05", shiftId: S.m });
    const c = await ro("addEntry", ctx, vOf(U.owner), { employeeId: eF, date: "2031-06-06", shiftId: S.m, startMin: 840, endMin: 1200 });
    const mv = c.ok ? await ro("moveEntry", ctx, vOf(U.owner), c.value.id, { shiftId: S.mo }) : c;
    const f = async (r: RO) => (r.ok ? ((await P.hrRosterEntry.findUnique({ where: { id: r.value.id } })) as Any)?.timesOverridden : "∅");
    const [fa, fb, fc] = [await f(a), await f(b), await f(c)];
    chk("S10.3", fa === true && fb === false && mv.ok && fc === false, "true · false · false", `${fa}/${fb}/${shown(mv)}:${fc}`);
  }
  {
    // weeks 2031-06-16 (source) → 2031-06-23 (target) used by nobody else
    const eC1 = await empN("คัดลอกหนึ่ง");
    const eC2 = await empN("คัดลอกสอง");
    const sC = await shift("คัดลอก", 420, 900);
    const ov = await ro("addEntry", ctx, vOf(U.owner), { employeeId: eC1, date: "2031-06-16", shiftId: sC, startMin: 840, endMin: 1200 });
    await sleep(20);
    await P.hrShift.update({ where: { id: sC }, data: { startMin: 480, endMin: 960 } });
    await sleep(20);
    await P.hrRosterEntry.create({ data: { tenantId: TT, systemId: sA.id, employeeId: eC2, date: dbDate("2031-06-17"), shiftId: sC, unitId: u1, startMin: 420, endMin: 900, breakMin: 0, crossesMidnight: false, published: true, publishedAt: new Date(), source: "MANUAL" } });
    const cp = await ro("copyWeek", ctx, vOf(U.owner), { fromWeek: "2031-06-16", toWeek: "2031-06-23" });
    const tgt = async (e: string, d: string) => (await P.hrRosterEntry.findFirst({ where: { employeeId: e, date: dbDate(d) } })) as Any;
    const [t1, t2] = [await tgt(eC1, "2031-06-23"), await tgt(eC2, "2031-06-24")];
    const tt = (x: Any) => (x ? `${x.startMin}-${x.endMin}` : "∅");
    ck("S10.4", { ok: cp.ok && ov.ok, over: tt(t1) === "840-1200" && t1?.timesOverridden === true, stale: tt(t2) === "480-960" }, "840-1200 flagged · 480-960", `${shown(cp)} ${tt(t1)}:${t1?.timesOverridden} ${tt(t2)}`);
  }
  {
    const sh = await callMod(setMod, `${HRD}settings.ts`, "createShift", [ctx, vOf(U.owner), { name: `เที่ยงคืน ${tag}`, startMin: 960, endMin: 0, crossesMidnight: true }]);
    const sRow = sh.ok ? ((await P.hrShift.findUnique({ where: { id: sh.value.id } })) as Any) : null;
    const eO = await empN("เที่ยงคืนตาราง");
    const a = await ro("addEntry", ctx, vOf(U.owner), { employeeId: eO, date: "2031-06-10", shiftId: S.m, startMin: 960, endMin: 0 });
    const eRow = a.ok ? ((await P.hrRosterEntry.findUnique({ where: { id: a.value.id } })) as Any) : null;
    const tt = (x: Any) => (x ? `${x.endMin}/${x.crossesMidnight}` : "∅");
    chk("S10.5", tt(sRow) === "1440/false" && tt(eRow) === "1440/false", "1440/false ×2", `shift ${shown(sh)} ${tt(sRow)} · entry ${shown(a)} ${tt(eRow)}`);
  }

  // ═══ S11 privacy · S12 frozen ═══
  {
    const rows = ((await hr.listAttendance(ctx, 50).catch(() => [])) as Any[]) ?? [];
    const bad = rows.flatMap((r) => Object.keys(r).filter((k) => SENS.includes(k)));
    chk("S11.2", rows.length > 0 && !bad.length, "no sensitive keys", `rows=${rows.length} bad=${[...new Set(bad)]}`);
  }
  {
    const bad = refusals.filter((r) => !r.label.startsWith("roster.") && !r.label.startsWith("settings.createShift") && !(FIXED.has(r.text) || LIMITED_RE.test(r.text)) && !r.text.startsWith("∅"));
    const leaky = refusals.filter((r) => CUID_RE.test(r.text) || /\d{2}\.\d{3}/.test(r.text));
    chk("S11.3", refusals.some((r) => FIXED.has(r.text)) && !bad.length && !leaky.length, "fixed texts only", `${bad.slice(0, 3).map((r) => `${r.label}:"${short(r.text, 50)}"`).join(" ")} leaky=${leaky.length}`);
  }
  {
    const sK = await sysSvc.createSystem(TT, "HR", "ระบบเค");
    const ctxK = { tenantId: TT, systemId: sK.id };
    const today = hr.bkkParts(new Date()).dateStr as string; // placement only (legacy path reads the real clock)
    const shK = await P.hrShift.create({ data: { tenantId: TT, systemId: sK.id, name: `กะเค ${tag}`, startMin: 420, endMin: 900 } });
    const out: string[] = [];
    try {
      const ks: [string, string][] = [];
      for (const k of ["K1", "K2", "K3"]) ks.push([k, await fx.mkEmp(TT, sK.id, `QC24 ${k} ${tag}`, { unitId: u1 })]);
      for (let wd = 0; wd < 7; wd++) {
        await P.hrWorkSchedule.create({ data: { tenantId: TT, systemId: sK.id, employeeId: ks[0]![1], weekday: wd, dayOff: true } });
        await P.hrWorkSchedule.create({ data: { tenantId: TT, systemId: sK.id, employeeId: ks[1]![1], weekday: wd, dayOff: false, startMin: 0, endMin: 1440, graceMin: 1440 } });
      }
      for (const [, id] of ks) for (const dd of [today, addDay(today, -1), addDay(today, 1)]) await P.hrRosterEntry.create({ data: { tenantId: TT, systemId: sK.id, employeeId: id, date: dbDate(dd), shiftId: shK.id, unitId: u1, startMin: 420, endMin: 900, breakMin: 0, crossesMidnight: false, published: false, source: "MANUAL" } });
      for (const [k, id] of ks) {
        const c = await hr.clock(ctxK, { employeeId: id, kind: "IN" });
        const row = (await P.hrAttendance.findUnique({ where: { id: c.id } })) as Any;
        out.push(`${k}=${row?.judgement ?? "∅"}:${row?.dueMin ?? "-"}:${row?.lateMin ?? "-"}`);
      }
    } catch (e) {
      out.push(`THROW ${errText(e)}`);
    }
    chk("S12.1", out.join("|") === FROZEN_CLOCK, FROZEN_CLOCK, out.join("|"));
  }
}

// ═════════ VIS-1 C ▸ kiosk audience (ORACLE-EDIT: new checks) ═════════
function runKioskGate(): void {
  const g = csMod && !csMod.__err && typeof csMod.canRunKiosk === "function" ? (csMod.canRunKiosk as (v: Any) => boolean) : null;
  const m = (role: string, unitAccess: string[], permissions: Record<string, boolean>) => ({ role, unitAccess, permissions, userId: "u" });
  const yes = [m("OWNER", [], {}), m("MANAGER", [], {}), m("MANAGER", ["u1"], {}), m("STAFF", [], { "hr.attendance.clock": true }), m("STAFF", ["u1"], { "hr.attendance.clock": true }), m("STAFF", [], { "hr.*": true })];
  const no = [m("STAFF", [], {}), m("STAFF", [], { "hr.leave.read": true }), m("STAFF", [], { "hr.leave.request": true }), m("STAFF", ["*"], { "hr.payroll.read": true }), null];
  const call = (v: Any) => {
    try {
      return g ? g(v) === true : false;
    } catch {
      return false;
    }
  };
  ck("S14.1", { fn: !!g, yes: yes.every(call), no: no.every((v) => g !== null && !call(v)) }, "6 true · 5 false", `yes=${yes.map((v) => (call(v) ? 1 : 0)).join("")} no=${no.map((v) => (call(v) ? 1 : 0)).join("")}`);
  const page = stripComments(rd("src/app/app/sys/[id]/hr/kiosk/page.tsx"));
  const gateAt = page.search(/if\s*\(\s*!canRunKiosk\(\s*hrViewerOf\(\s*auth\s*\)\s*\)\s*\)\s*notFound\(\)/);
  const secAt = page.search(/<HrKioskSection\b/);
  const act = stripComments(rd(`${HRD}actions.ts`));
  const kfn = act.split(/export\s+async\s+function\s+/).find((x) => x.startsWith("kioskClockAction")) ?? "";
  const refAt = kfn.search(/if\s*\(\s*!canRunKiosk\([^)]*\)\s*\)\s*return\s*\{\s*status:\s*["']error["']\s*,\s*message:\s*KIOSK_REFUSED_TEXT\s*\}/);
  const callAt = kfn.search(/kioskClock\(/);
  const txt = String(csMod?.KIOSK_REFUSED_TEXT ?? "");
  ck(
    "S14.2",
    { page: gateAt >= 0 && secAt > gateAt, action: refAt >= 0 && callAt > refAt && refAt < kfn.search(/formData\.get\(/), assert: /assertHrCan\(\s*auth\s*,\s*["']hr\.attendance\.clock["']\s*\)/.test(kfn), text: isThai(txt) && !CUID_RE.test(txt) && !/\$\{/.test(txt) },
    "page gate · action gate first · assertCan kept · Thai fixed text",
    `gate=${gateAt} sec=${secAt} ref=${refAt} call=${callAt}`,
  );
}

// ═════════ run ═════════
let crashed = "";
let tenantsFx: string[] = [];
try {
  runStatic();
  runKioskGate();
  runPure();
  await runDb();
} catch (e) {
  crashed = errText(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  tenantsFx = [...fx.tenants];
  for (const tid of tenantsFx) {
    await P.$executeRawUnsafe(`DELETE FROM "HrClockSite" WHERE "tenantId" = $1`, tid).catch(() => null);
    await P.chatRateBucket.deleteMany({ where: { OR: [{ key: { startsWith: `hr-verifypin:${tid}` } }, { key: { startsWith: `hr-kiosk:emp:${tid}` } }, { key: { startsWith: `hr-kiosk:sys:${tid}` } }, { key: { startsWith: `hr-kiosk-shop:${tid}` } }] } }).catch(() => null);
  }
  await sweep(P, fx, SLUG);
  const left = await residueOf(P, fx, SLUG, SLUG_PREFIX);
  for (const tid of tenantsFx) {
    const s = await rawRows(P, `SELECT count(*)::int AS n FROM "HrClockSite" WHERE "tenantId" = $1`, tid);
    if (s && Number(s[0]?.n) !== 0) left.push(`HrClockSite=${s[0]?.n}`);
    const b = await P.chatRateBucket.count({ where: { key: { contains: tid } } }).catch(() => -1);
    if (b !== 0) left.push(`ChatRateBucket=${b}`);
  }
  chk("Z1", left.length === 0, "no residue", left.join(",") || "clean");
}
process.exit(printSummary(SUITE, { force: FORCE, crashed, missing: skipReasons }));

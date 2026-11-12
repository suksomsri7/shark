// QC — HR V2 · H2.7 + H2.8 — leave policies · quota ledger · half-day/hourly · attachments · carry/expire job · hr.leave.decided ·
//      Thai holiday preset + shop holidays + day class. Contract: ledger/hr-briefs/hr-brief-H2.7.md (DRAFT, Q1–Q18 defaults) · base d505755d8.
// ⚠️ Oracle under change control — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit.
// Signatures = brief R2–R13 (viewer/actor = { role, unitAccess, permissions, userId } · { ok:true,… } | { ok:false, reason }); service.ts exports unchanged.
// Hunks: `// HR H2.7 ▸ …` … `◂ HR H2.7` blocks or single lines containing `HR H2.7`. Own tenants `qc-hr-h27-*`, dates 2030–2032, swept in finally.
// SKIP while hr/leave.ts is absent (exit 0) · QC_FORCE=1 / --force-run runs anyway · --list prints the ids.
// Run: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h2.7.mts

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

const SUITE = "qc-hr-h2.7";
const ARGV = process.argv.slice(2);
const FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run");
const SLUG_PREFIX = "qc-hr-h27-";
const HRD = "src/lib/modules/hr/";
const LEAVE = `${HRD}leave.ts`;
const RULES = `${HRD}leave-rules.ts`;
const HOL = `${HRD}holidays.ts`;
const SVC = `${HRD}service.ts`;
const JSONS: Record<number, string> = { 2026: `${HRD}holidays-th-2569.json`, 2027: `${HRD}holidays-th-2570.json` };
const RULES_SHA = "75a66c0c1354e932e7ba29609dcbf0919ffe82b51f476a3945fd1a0749833bf7";
const FROZEN = ["payroll", "payroll-rules", "payroll-digest", "privacy-shared", "time-rules", "rules", "roster", "roster-rules", "swap", "swap-rules"].map((f) => `${HRD}${f}.ts`);
const HUNK_FILES = ["src/lib/approval-effects.ts", "src/lib/outbox-consumers.ts", "src/lib/automation/labels.ts", SVC, "src/app/api/cron/hourly/route.ts"];
const MARK = "HR H2.7";
const EV = "hr.leave.decided";
const EV_LABEL = "เมื่อตัดสินใบลา (HR)";
const P_KEYS = "days,employeeId,fromDate,leaveId,previousStatus,status,systemId,toDate";
const DETAIL_KEYS = "category,days,employeeId,employeeName,fromDate,halfDay,hasAttachment,hours,id,needsAttachment,policyId,policyName,status,toDate";
const BAL_KEYS = "adjusted,available,balance,carried,category,expired,granted,name,pending,policyId,unlimited,used";
// brief §3 LEAVE_TEXT (the contract) — existing texts are read from their modules at run time (X)
const T = {
  policyNf: "ไม่พบประเภทการลานี้ หรือปิดใช้แล้ว — กรุณาเลือกใหม่",
  halfNotAllowed: "ประเภทการลานี้ลาครึ่งวันไม่ได้",
  hoursNotAllowed: "ประเภทการลานี้ลาเป็นชั่วโมงไม่ได้",
  hoursBad: "ลาเป็นชั่วโมงได้ครั้งละ 1 วัน จำนวน 1 ถึง 7 ชั่วโมงเต็ม",
  halfAndHours: "เลือกลาครึ่งวันหรือลาเป็นชั่วโมงอย่างใดอย่างหนึ่ง",
  crossYear: "ใบลาข้ามปีการลา — กรุณาแยกเป็น 2 ใบตามปีการลา",
  outOfEmployment: "วันลาอยู่นอกช่วงการจ้างงาน — ตรวจวันที่อีกครั้ง",
  noStart: "ยังไม่ได้บันทึกวันเริ่มงานของพนักงาน — ให้ผู้จัดการบันทึกก่อน",
  notEligible: "ยังไม่ครบอายุงานสำหรับการลาประเภทนี้",
  overlap: "ช่วงนี้มีใบลาที่รออนุมัติหรืออนุมัติแล้ว — ยกเลิกใบเดิมก่อน หรือเลือกวันอื่น",
  zeroDays: "ช่วงที่เลือกเป็นวันหยุดทั้งหมด — ไม่ต้องยื่นลา",
  balance: "วันลาคงเหลือไม่พอสำหรับใบลานี้ — ดูยอดคงเหลือก่อนยื่น",
  fileBad: "ไฟล์แนบไม่ถูกต้อง — แนบรูปหรือ PDF ที่อัปโหลดใหม่",
  attachNotYours: "แนบไฟล์ได้เฉพาะใบลาของคุณ",
  attachClosed: "ใบลานี้ปิดแล้ว — แนบไฟล์เพิ่มไม่ได้",
  balanceDecide: "วันลาคงเหลือของพนักงานไม่พอ — อนุมัติใบนี้ไม่ได้",
  linkNo: "ไม่พบไฟล์แนบ หรือคุณไม่มีสิทธิ์เปิด",
  detailNo: "ไม่พบใบลานี้ หรือคุณไม่มีสิทธิ์ดู",
  balNo: "ไม่พบข้อมูลวันลาของพนักงานคนนี้ หรือคุณไม่มีสิทธิ์ดู",
  presetNone: "ยังไม่มีชุดวันหยุดราชการของปีนี้ — เพิ่มวันหยุดเองได้",
} as const;
const SELF_TEXT = "ใบลานี้เป็นของบัญชีผู้ตัดสินเอง — ให้หัวหน้าหรือเจ้าของกิจการเป็นผู้ตัดสิน"; // hotfix R4.1a
// r2 rulings (D3 · D1 · L5) — fixed texts
const TR2 = {
  attachOff: "ระบบยังไม่รับไฟล์แนบใบลา — ส่งเอกสาร (เช่น ใบรับรองแพทย์) ให้หัวหน้าโดยตรง",
  zeroDaysDecide: "วันลาในใบนี้เป็นวันหยุดทั้งหมดแล้ว — ระบบยกเลิกใบลานี้ให้ ไม่หักวันลา",
  ysmLocked: "เปลี่ยนเดือนเริ่มปีการลาไม่ได้ เพราะประเภทการลานี้มีการบันทึกวันลาแล้ว — สร้างประเภทการลาใหม่แทน",
} as const;

const D = (id: string, g: string, sev: Sev, base: Base, title: string): Def => [`H2.7-${id}`, g, sev, base, title] as const;
const C = "CRITICAL", M = "MAJOR"; // prettier-ignore
const CHECKS: readonly Def[] = [
  D("S1.1", "R13", M, "RED", "holiday JSON shape"),
  D("S1.2", "R13", C, "RED", "JSON ⊇ repo list · extras sourced · pending"),
  D("S1.3", "R2", M, "RED", "leave-rules.ts pure"),
  D("S1.4", "R8", C, "RED", "lock order hr-leave → emp → roster"),
  D("S1.5", "R5", C, "RED", "ledger + event in tx · append-only · bodies in service.ts"),
  D("S1.6", "R1", M, "RED", "actions · testids · inventory"),
  D("S2.1", "R2", M, "RED", "leave year vectors"),
  D("S2.2", "R2", C, "RED", "countLeaveDays vectors"),
  D("S2.3", "Q6", M, "RED", "hourlyLeaveDays vectors"),
  D("S2.4", "Q8", C, "RED", "grantDays vectors"),
  D("S2.5", "R9", M, "RED", "carry/expire vectors"),
  D("S2.6", "§3", M, "RED", "LEAVE_TEXT = brief §3"),
  D("S3.1", "R3", C, "RED", "from > to ⇒ range"),
  D("S3.2", "H1.2", C, "RED", "4-year range ⇒ tooLong"),
  D("S3.3", "Q13", C, "RED", "overlap rules (AM+PM ok)"),
  D("S3.4", "R3", M, "RED", "bad policy ×4 ⇒ policyNf"),
  D("S3.5", "R3", M, "RED", "half / hours refusals"),
  D("S3.6", "Q7", M, "RED", "crossYear ×2 · Apr year 2.0"),
  D("S3.7", "Q8", M, "RED", "employment · eligibility"),
  D("S3.8", "R3", M, "RED", "holiday-only range ⇒ zeroDays"),
  D("S3.9", "Q3", C, "RED", "pending reserves · unlimited"),
  D("S3.10", "Q18", M, "RED", "legacy w/o policy ⇒ 3.0 · no ledger"),
  D("S3.11", "Q18", M, "RED", "legacy ⇒ policy by category"),
  D("S4.1", "R4", C, "RED", "rostered weekend ⇒ 2.0"),
  D("S4.2", "R4", M, "RED", "template day off ⇒ 1.0"),
  D("S4.3", "R4", C, "RED", "holidays out ⇒ 2.0"),
  D("S4.4", "R2", M, "RED", "AM 0.5 · 3 h 0.3"),
  D("S4.5", "R4", M, "RED", "borrowed into u2 holiday ⇒ zeroDays"),
  D("S5.1", "R5", C, "RED", "approve ⇒ GRANT once + USE use:<id>"),
  D("S5.2", "R11", C, "RED", "leaveBalances keys + vectors"),
  D("S5.3", "R6", C, "RED", "revoke ⇒ one use-revert · balance back"),
  D("S5.4", "R6", M, "RED", "reject / cancel PENDING ⇒ no ledger"),
  D("S5.5", "R6", C, "RED", "short at decide ⇒ balanceDecide · PENDING"),
  D("S5.6", "R3", M, "RED", "owner-auto ⇒ USE + event"),
  D("S5.7", "R7", C, "RED", "chain approve · reject · short"),
  D("S6.1", "R9", C, "RED", "CARRY 5.0 · cap 3.0"),
  D("S6.2", "R9", C, "RED", "EXPIRE · 6.0"),
  D("S6.3", "R9", C, "RED", "job re-run ×3 ⇒ ledger unchanged"),
  D("S6.4", "R9", M, "RED", "job writes nothing in sys2"),
  D("S7.1", "R10", C, "RED", "attachLeaveFile refusals + ok"),
  D("S7.2", "R10", C, "RED", "attachment link matrix · viewer-bound"),
  D("S7.3", "R11", C, "RED", "leaveDetail matrix · keys · reason"),
  D("S7.4", "Q17", C, "RED", "balances matrix · my = own"),
  D("S7.5", "Q10", M, "RED", "needsAttachment flag"),
  D("S7.6", "R12", C, "RED", "payload keys"),
  D("S7.7", "§3", M, "RED", "every refusal = fixed Thai text"),
  D("S8.1", "R12", C, "RED", "consumer = withAutomation"),
  D("S8.2", "R12", M, "RED", "one label · WEBHOOK_EVENTS once"),
  D("S8.3", "C.10", C, "RED", "replay ×4 ⇒ no change"),
  D("S8.4", "C.10", M, "RED", "re-emit same key ⇒ 1 row"),
  D("S8.5", "Q12", C, "RED", "one event per decision"),
  D("S9.1", "X6", C, "RED", "5 approvals (pool-safe) ⇒ 1 ok · 1 USE · 1 event"),
  D("S9.2", "X6", C, "RED", "approve ∥ revoke ⇒ REJECTED · 1 revert"),
  D("S9.3", "Q3", C, "RED", "5 requests on one balance ⇒ queued · 1 row"),
  D("S9.4", "R8", C, "RED", "leave decide ∥ swap apply on a held roster key"),
  D("S10.1", "R13", M, "RED", "holidayPreset CE = BE · 2028 null"),
  D("S10.2", "Q15", C, "RED", "preset: missing only · idempotent"),
  D("S10.3", "R13", M, "RED", "preset permission matrix · presetNone"),
  D("S10.4", "R13", C, "RED", "dayClassOf / holidaysBetween"),
  D("S11.1", "C.4", C, "GREEN", "payroll-rules.ts sha"),
  D("S11.2", "R1", C, "GREEN", "frozen files unchanged (n/a in base)"),
  D("S11.3", "R1", C, "GREEN", "hot files = base + hunks (n/a in base)"),
  D("S11.4", "Q11", C, "GREEN", "half-day blocks whole day"),
  D("S11.5", "C.6", C, "GREEN", "self-decision refused (hotfix text)"),
  // r2 (12 Nov) controller rulings L2–L7 · D1 · D3 · D5 — expected balances are literals (scenarios: review M1–M3/D1/D5 · hunt P1/P2/P3/P5)
  D("S12.1", "L2", C, "RED", "carry = transfer · Y−1 pending ⇒ job waits · back-dated Y−1 refused"),
  D("S12.2", "L3", C, "RED", "carry only for leaves ending ≤ expiry"),
  D("S12.3", "L4", C, "RED", "expiry waits for pending ≤ expiry ⇒ EXPIRE −2 · 10.0"),
  D("S12.4", "L4", C, "RED", "revoke after EXPIRE ⇒ expire-late once · 10.0"),
  D("S12.5", "L5", C, "RED", "revert = USE row's year · ysm change refused"),
  D("S12.6", "L6", C, "RED", "property: no op sequence makes a year negative"),
  D("S12.7", "L7", C, "RED", "job quiet: 2nd run 0 tx · bounded · ineligible skipped"),
  D("S12.8", "D1", C, "RED", "days recounted at approval (holiday added/removed)"),
  D("S12.9", "D5", C, "RED", "holiday on a published roster day counts"),
  D("S12.10", "D3", C, "RED", "attachments off: refused · nothing written · no link"),
  D("X1.1", "X1", C, "RED", "5 identical parallel requests ⇒ 1 row"),
  D("X2.1", "X2", C, "RED", "other tenant ⇒ refused · unchanged"),
  D("X12.1", "X12", M, "GREEN", "fitness + fitness-hr ± env"),
  D("Z1", "-", C, "GREEN", "residue none"),
];
initRegistry("H2.7-", CHECKS);
if (ARGV.includes("--list")) listAndExit(SUITE);
const skipReasons: string[] = existsSync(join(ROOT, LEAVE)) ? [] : [`H2.7 not built: ${LEAVE} absent`];
if (skipReasons.length && !FORCE) skipAndExit(SUITE, skipReasons);

// ═════════ statics ═════════
const NB: Record<string, Any> = {};
const h27InBase = () => fileAtBase(LEAVE) !== null; // pattern h13InBase
const fnBody = (src: string, name: string) => {
  const i = src.search(new RegExp(`function\\s+${name}\\(`));
  const j = i < 0 ? -1 : src.indexOf("\n}", i);
  return i < 0 ? "" : src.slice(i, j < 0 ? undefined : j);
};
const ordered = (s: string, ...xs: string[]) => xs.map((x) => s.indexOf(x)).every((v, k, a) => v >= 0 && (k === 0 || a[k - 1]! < v));
const inSrc = (t: string) => {
  try {
    return git(["grep", "-l", "-F", t, "--", "src"]).length > 0;
  } catch {
    return false;
  }
};
function runStatic(): void {
  const s11: Record<string, boolean> = {};
  for (const [ce, f] of Object.entries(JSONS)) {
    const y = Number(ce);
    let j: Any = null;
    try {
      j = JSON.parse(rd(f));
    } catch {
      /* absent */
    }
    NB[`json${y}`] = j;
    const days: Any[] = Array.isArray(j?.days) ? j.days : [];
    const ds = days.map((d) => String(d?.date));
    s11[`${y}head`] = j?.year === y && j?.beYear === y + 543 && typeof j?.status === "string" && !!j?.source;
    s11[`${y}days`] = days.length > 0 && days.every((d) => String(d?.date).startsWith(`${y}-`) && /^\d{4}-\d\d-\d\d$/.test(d.date) && d?.kind === "PUBLIC" && isThai(String(d?.name ?? "")));
    s11[`${y}sorted`] = ds.join() === [...ds].sort().join() && new Set(ds).size === ds.length && Array.isArray(j?.pending);
  }
  ck("S1.1", s11, "well-formed");
  const c = stripComments(rd(RULES));
  const imps = [...c.matchAll(/from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1] ?? m[2] ?? "").filter((s) => /prisma|core\/db|@\/lib\/core|tenantDb|\.\/(service|leave|roster|holidays)$/.test(s));
  ck("S1.3", { exists: !!c, imports: !imps.length, clock: !/Date\.now\(|new Date\(\s*\)/.test(c) }, "pure", imps.join(","));
  const svc = stripComments(rd(SVC));
  const lv = stripComments(rd(LEAVE));
  const [dec, can, req, app] = [fnBody(svc, "decideLeave"), fnBody(svc, "cancelLeave"), fnBody(svc, "requestLeave"), fnBody(lv, "applyLeaveDecision")];
  const helpers = (b: string) => [...b.matchAll(/\b(\w+InTx)\(/g)].map((m) => m[1]!).filter((n) => !/^lock(LeaveEmployee|RosterKeys)InTx$/.test(n));
  const viaEmp = (b: string) => b.includes("lockLeaveEmployeeInTx(") || helpers(b).some((h) => fnBody(lv, h).includes("lockLeaveEmployeeInTx("));
  ck("S1.4", {
    decide: ordered(dec, "hr-leave:", "lockLeaveEmployeeInTx(", "lockRosterKeysInTx("),
    apply: ordered(app, "hr-leave:", "lockLeaveEmployeeInTx(", "lockRosterKeysInTx("),
    cancel: can.includes("hr-leave:") && viaEmp(can),
    request: viaEmp(req),
    empKey: fnBody(lv, "lockLeaveEmployeeInTx").includes("hr-leave-emp:"),
    swap: !!rd(`${HRD}swap.ts`) && !rd(`${HRD}swap.ts`).includes("hr-leave"),
  }, "hr-leave → emp → roster");
  let writers = "";
  try {
    writers = git(["grep", "-l", "-E", "hrLeaveBalanceTxn\\.(update|updateMany|upsert|delete|deleteMany)\\(", "--", "src"]);
  } catch {
    /* none */
  }
  const end = dec.lastIndexOf("LEAVE_LOCK_TX_OPTS");
  ck("S1.5", {
    ledgerInTx: dec.indexOf("leaveLedgerInTx(") > 0 && dec.indexOf("leaveLedgerInTx(") < end,
    eventInTx: dec.indexOf("emitOutbox(tx") > 0 && dec.indexOf("emitOutbox(tx") < end,
    appendOnly: !writers,
    bodies: ["requestLeave", "decideLeave", "cancelLeave", "bulkDecideLeave"].every((n) => new RegExp(`export\\s+async\\s+function\\s+${n}\\(`).test(svc)),
  }, "in tx · append-only · bodies", writers.replace(/\n/g, ","));
  const ids = ["hr-leave-policy", "hr-leave-halfday", "hr-leave-hours", "hr-leave-attach", "hr-holiday-preset"];
  const inv = rd("scripts/hr-ui-inventory.json");
  ck("S1.6", {
    actions: ["attachLeaveFileAction", "leaveAttachmentLinkAction"].every((n) => new RegExp(`export\\s+async\\s+function\\s+${n}\\b`).test(rd(`${HRD}actions.ts`))),
    preset: /export\s+async\s+function\s+applyHolidayPresetAction\b/.test(rd(`${HRD}settings-actions.ts`)),
    testids: ids.every(inSrc),
    inventory: ids.every((t) => inv.includes(t)),
  }, "actions · testids · inventory");
  const e = EV.replace(/\./g, "\\.");
  const auto = stripComments(rd("src/lib/automation/labels.ts"));
  NB.cons = new RegExp(`["']${e}["']\\s*:\\s*withAutomation\\(`).test(stripComments(rd("src/lib/outbox-consumers.ts")));
  NB.label = [...auto.matchAll(new RegExp(`value:\\s*["']${e}["']\\s*,\\s*label:\\s*["']([^"']*)["']`, "g"))].map((m) => m[1]).join("|") === EV_LABEL && auto.split(EV).length === 2 && !rd("src/lib/webhooks/labels.ts").includes(EV);
  const inBase = h27InBase();
  const same = (p: string, max = Infinity) => {
    const b = fileAtBase(p);
    if (b === null) return `∅base ${p}`;
    const h = stripMarked(rd(p), MARK);
    return h.text === stripMarked(b, MARK).text && h.blocks <= max ? "ok" : `${p.split("/").pop()} differs (blocks ${h.blocks})`;
  };
  const join2 = (xs: string[]) => xs.filter((x) => x !== "ok" && x !== "unchanged").join(" · ") || "ok";
  const r2 = inBase ? "n/a" : join2([changedVsBase(FROZEN), changedVsBase(["src/lib/modules/approval"])]);
  chk("S11.2", r2 === "ok" || r2 === "n/a", "unchanged", `${r2} (base ${baseRef().slice(0, 9)})`);
  const r3 = inBase ? "n/a" : join2(HUNK_FILES.map((f) => same(f, f.endsWith("effects.ts") ? 1 : Infinity)));
  chk("S11.3", r3 === "ok" || r3 === "n/a", "base + hunks", r3);
  const rs = sha(rd(`${HRD}payroll-rules.ts`));
  chk("S11.1", rs === RULES_SHA, RULES_SHA.slice(0, 16), rs.slice(0, 16));
}

// ═════════ pure vectors (+ S1.2: JSON vs the repo list) ═════════
function runPure(LR: Any, repoFixed: (y: number) => { date: string; name: string }[], X: Record<string, string>): void {
  const f = (fn: string, ...a: unknown[]): string => {
    if (typeof LR?.[fn] !== "function") return `∅${fn}`;
    try {
      const v = LR[fn](...a);
      return typeof v === "string" || typeof v === "number" ? String(v) : JSON.stringify(v);
    } catch (e) {
      return `!${(e as Error)?.message ?? e}`;
    }
  };
  const vec = (id: string, rows: [string, string][]) => {
    const bad = rows.filter(([g, w]) => g !== w);
    chk(id, !bad.length, `${rows.length} vectors`, bad.slice(0, 3).map(([g, w]) => `${short(g, 50)}≠${short(w, 50)}`).join(" | ") || "all");
  };
  const B = (from: string, to: string) => JSON.stringify({ from, to });
  vec("S2.1", [
    [f("leaveYearOf", "2031-03-31", 1), "2031"], [f("leaveYearOf", "2032-01-01", 1), "2032"], [f("leaveYearOf", "2031-03-31", 4), "2030"], [f("leaveYearOf", "2031-04-01", 4), "2031"],
    [f("leaveYearOf", "2031-09-30", 10), "2030"], [f("leaveYearBounds", 2031, 1), B("2031-01-01", "2031-12-31")], [f("leaveYearBounds", 2031, 4), B("2031-04-01", "2032-03-31")], [f("leaveYearBounds", 2031, 10), B("2031-10-01", "2032-09-30")],
  ]);
  const n = (from: string, to: string, o: Any = {}) => f("countLeaveDays", { from, to, halfDay: o.half ?? null, hours: o.hours ?? null, holidays: new Set(o.hol ?? []), daysOff: new Set(o.off ?? []) });
  vec("S2.2", [
    [n("2031-03-03", "2031-03-07"), "5.0"], [n("2031-03-03", "2031-03-07", { hol: ["2031-03-05"] }), "4.0"], [n("2031-03-06", "2031-03-10", { off: ["2031-03-08", "2031-03-09"] }), "3.0"],
    [n("2031-03-05", "2031-03-05", { half: "AM", hol: ["2031-03-05"] }), "0.0"], [n("2031-03-04", "2031-03-04", { hours: 4 }), "0.5"], [n("2031-03-05", "2031-03-05", { hours: 3, hol: ["2031-03-05"] }), "0.0"],
    [n("2031-03-04", "2031-03-04", { half: "PM", hours: 2 }), `!${T.halfAndHours}`], [n("2031-03-04", "2031-03-05", { half: "AM" }), `!${X.halfDayRange}`], [n("2031-03-04", "2031-03-05", { hours: 2 }), `!${T.hoursBad}`],
    [n("2026-01-01", "2029-12-31"), `!${X.leaveTooLong}`], [n("2031-03-05", "2031-03-04"), `!${X.leaveRange}`],
  ]);
  vec("S2.3", [1, 2, 3, 4, 5, 6, 7, 0, 8, 2.5, -1].map((h, i) => [f("hourlyLeaveDays", h), ["0.1", "0.2", "0.3", "0.5", "0.6", "0.7", "0.8"][i] ?? `!${T.hoursBad}`]));
  const g = (q: string | null, ms: number, pr: boolean, start: string | null, y = 2031, ysm = 1) => f("grantDays", { quotaDays: q, minServiceDays: ms, firstYearProrata: pr }, start, y, ysm);
  const G = (days: string | null, eff: string) => JSON.stringify({ eligible: true, days, effectiveDate: eff });
  const N = (code: string) => JSON.stringify({ eligible: false, code });
  vec("S2.4", [
    [g("30.0", 0, false, "2020-05-01"), G("30.0", "2031-01-01")], [g("6.0", 365, false, "2030-07-01"), G("6.0", "2031-07-01")], [g("6.0", 365, true, "2030-07-01"), G("3.0", "2031-07-01")],
    [g("6.0", 365, false, "2031-03-01"), N("SERVICE")], [g("6.0", 365, false, null), N("NO_START")], [g(null, 0, false, null), G(null, "2031-01-01")], [g("30.0", 0, true, "2031-07-01"), G("15.0", "2031-07-01")],
    [g("3.0", 0, false, "2020-01-01", 2031, 4), G("3.0", "2031-04-01")], [g("30.0", 0, false, "2032-02-01"), N("SERVICE")], [g("6.0", 365, true, "2029-07-01"), G("6.0", "2031-01-01")], [g("30.0", 0, false, "2031-07-01"), G("30.0", "2031-07-01")],
  ]);
  vec("S2.5", [
    [f("carryDays", "4.5", "6.0"), "4.5"], [f("carryDays", "8.0", "6.0"), "6.0"], [f("carryDays", "-1.0", "6.0"), "0.0"], [f("carryDays", "10.0", "3.0"), "3.0"],
    [f("expireDays", "6.0", "2.0"), "4.0"], [f("expireDays", "3.0", "5.0"), "0.0"], [f("expireDays", "5.0", "2.0"), "3.0"],
  ]);
  const diff = Object.entries(T).filter(([k, v]) => LR?.LEAVE_TEXT?.[k] !== v).map(([k]) => k);
  chk("S2.6", !diff.length, "20 texts", diff.join(",") || "all");
  const r: Record<string, boolean> = {};
  for (const y of [2026, 2027]) {
    const j = NB[`json${y}`];
    const days: Any[] = Array.isArray(j?.days) ? j.days : [];
    const fx = repoFixed(y);
    r[`${y}fixed`] = fx.length === 15 && fx.every((h) => days.some((d) => d?.date === h.date && d?.name === h.name));
    r[`${y}sourced`] = days.filter((d) => !fx.some((h) => h.date === d?.date)).every((d) => typeof d?.source === "string" && !!d.source.trim());
    r[`${y}pending`] = Array.isArray(j?.pending) && ["มาฆบูชา", "วิสาขบูชา", "อาสาฬหบูชา", "เข้าพรรษา"].every((w) => JSON.stringify(j.pending).includes(w));
  }
  ck("S1.2", r, "repo dates · extras sourced · pending");
}

// ═════════ DB ═════════
await guardQc4Env(SUITE);
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — running although: ${skipReasons.join(" · ")} (expect RED for the right reason, no crash)`);
const P = ((await import("@/lib/core/db")) as Any).prisma as Any;
const imp = (s: string) => import(s).catch(() => null) as Promise<Any>;
const sysSvc = await imp("@/lib/modules/system/service");
const hr = await imp("@/lib/modules/hr/service");
const settings = await imp("@/lib/modules/hr/settings");
const coreHash = await imp("@/lib/core/hash");
const coreOutbox = await imp("@/lib/core/outbox");
const approval = await imp("@/lib/modules/approval/service");
const seq = await imp("@/lib/modules/crm/sequences-shared");
const X: Record<string, string> = { ...((await imp("@/lib/modules/hr/time-rules"))?.TIME_RULE_TEXT ?? {}), otherBranch: (await imp("@/lib/modules/hr/scope"))?.HR_OTHER_BRANCH_TEXT, ...(settings?.SETTINGS_TEXT ?? {}) };
const FIXED = new Set<string>([...Object.values(T), ...Object.values(X), ...Object.values(TR2), SELF_TEXT]);
const lvMod = await loadOpt(LEAVE, "@/lib/modules/hr/leave");
const lrMod = await loadOpt(RULES, "@/lib/modules/hr/leave-rules");
const hoMod = await loadOpt(HOL, "@/lib/modules/hr/holidays");
const rMod = await loadOpt(`${HRD}roster.ts`, "@/lib/modules/hr/roster");
const swMod = await loadOpt(`${HRD}swap.ts`, "@/lib/modules/hr/swap");
const CONS: Any = (await imp("@/lib/outbox-consumers"))?.consumers ?? {};
const autoLabels = await imp("@/lib/automation/labels");
const hookLabels = await imp("@/lib/webhooks/labels");
console.log(`[${SUITE}] modules: leave=${modState(lvMod, LEAVE)} · leave-rules=${modState(lrMod, RULES)} · holidays=${modState(hoMod, HOL)}`);

const tag = Math.random().toString(36).slice(2, 6).replace(/\d/g, "x"); // letters only (AI tools mask 9+ digit runs — rows identified by id)
const SLUG = `${SLUG_PREFIX}${Date.now()}${tag}`;
const fx = makeFixtures(P, coreHash, SLUG);
const lv = (fn: string, ...a: unknown[]) => callMod(lvMod, LEAVE, fn, a, `leave.${fn}`);
const ho = (fn: string, ...a: unknown[]) => callMod(hoMod, HOL, fn, a, `holidays.${fn}`);
const ro = (fn: string, ...a: unknown[]) => callMod(rMod, `${HRD}roster.ts`, fn, a, `roster.${fn}`);
const sw = (fn: string, ...a: unknown[]) => callMod(swMod, `${HRD}swap.ts`, fn, a, `swap.${fn}`);
/** service.ts call: Hr*Error ⇒ { ok:false, text } (recorded) · any other throw ⇒ THROW … */
async function svc(fn: string, ...a: unknown[]): Promise<RO> {
  try {
    return { ok: true, text: "", value: await hr[fn](...a) };
  } catch (e) {
    const t = e instanceof Error && /^Hr\w*Error$/.test(e.name) ? e.message : `THROW ${errText(e)}`;
    refusals.push({ label: `svc.${fn}`, text: t });
    return { ok: false, text: t, value: undefined };
  }
}
const d1 = (v: unknown) => (v === null || v === undefined ? null : Number(String(v)).toFixed(1));
const fileIds: string[] = [];

async function runDb(): Promise<void> {
  const TT = await fx.newTenant("", "QC HR H2.7 การลา");
  const T2 = await fx.newTenant("-other", "QC HR H2.7 ร้านอื่น");
  const u1 = await fx.newUnit(TT, `u1 ${tag}`, "u1");
  const u2 = await fx.newUnit(TT, `u2 ${tag}`, "u2");
  const sA = await sysSvc.createSystem(TT, "HR", "HR A");
  await sleep(30);
  const s2 = await sysSvc.createSystem(TT, "HR", "HR B");
  const sO = await sysSvc.createSystem(T2, "HR", "HR O");
  const ctx = { tenantId: TT, systemId: sA.id };
  const ctx2 = { tenantId: TT, systemId: s2.id };
  const ctxO = { tenantId: T2, systemId: sO.id };
  const L = { "hr.leave.request": true };
  const mk = (t: string, r: Who["role"], ua: string[], p: Record<string, boolean> = {}, tid = TT) => fx.mkUser(tid, t, `QC27 ${t} ${tag}`, r, ua, p);
  const U = {
    owner: await mk("owner", "OWNER", []), pay: await mk("pay", "STAFF", ["*"], { "hr.payroll.read": true }), mgrU1: await mk("mgru1", "MANAGER", [u1]), mgrU2: await mk("mgru2", "MANAGER", [u2]),
    mgrAll: await mk("mgrall", "MANAGER", []), read: await mk("read", "STAFF", [u1], { "hr.leave.read": true }), dec: await mk("dec", "STAFF", [u1], { "hr.leave.decide": true }),
    key: await mk("key", "STAFF", [u1], { "hr.employee.create": true }), member: await mk("member", "STAFF", []), A: await mk("sa", "STAFF", [u1], L), B: await mk("sb", "STAFF", [u1], L),
    Cc: await mk("sc", "STAFF", [u1], L), V: await mk("sv", "STAFF", [u1], L), W: await mk("sw", "STAFF", [u1], L), R: await mk("sr", "STAFF", [u1], L), G: await mk("sg", "STAFF", [u1], L),
    other: await mk("other", "OWNER", [], {}, T2),
  };
  const emp = async (n: string, o: Any, start: string | null = "2025-01-01", sys = sA.id, tid = TT) => {
    const id = await fx.mkEmp(tid, sys, `QC27 e${n} ${tag}`, o);
    if (start) await P.hrEmployee.update({ where: { id }, data: { startDate: dbDate(start) } });
    return id;
  };
  const lk = (u: Who) => ({ linkedUserId: u.id, unitId: u1 });
  const E = {
    A: await emp("A", lk(U.A)), B: await emp("B", lk(U.B)), C: await emp("C", lk(U.Cc)), V: await emp("V", lk(U.V)), W: await emp("W", lk(U.W)), R: await emp("R", lk(U.R)), G: await emp("G", lk(U.G)),
    O: await emp("O", lk(U.owner)), N: await emp("N", { unitId: u1 }, null), New: await emp("New", { unitId: u1 }, "2031-03-01"), S2: await emp("S2", { unitId: u1 }, "2025-01-01", s2.id), X: await emp("X", {}, "2025-01-01", sO.id, T2),
  };
  const ov = vOf(U.owner);
  const pol = async (c: Any, category: string, name: string, quotaDays: number | null, o: Any = {}) => {
    const r = await settings.createLeavePolicy(c, ov, { unitId: null, category, name, quotaDays, ...o });
    if (!r?.ok) throw new Error(`fixture policy ${name}: ${r?.reason}`);
    return r.id as string;
  };
  const PL = {
    sick: await pol(ctx, "SICK", "ป่วย", 30, { attachmentAfterDays: 3, sortOrder: 1 }), pers: await pol(ctx, "PERSONAL", "กิจ", 3, { sortOrder: 2 }),
    vac: await pol(ctx, "VACATION", "พักร้อน", 6, { minServiceDays: 365, carryMaxDays: 6, carryExpiresMonthDay: "03-31", sortOrder: 3 }),
    vac10: await pol(ctx, "VACATION", "พักร้อน10", 10, { carryMaxDays: 3, carryExpiresMonthDay: "03-31", sortOrder: 4 }), hour: await pol(ctx, "PERSONAL", "กิจชม", 3, { allowHours: true, sortOrder: 5 }),
    unpaid: await pol(ctx, "OTHER", "ไม่รับค่าจ้าง", null, { paid: false, sortOrder: 6 }), apr: await pol(ctx, "PERSONAL", "กิจเม.ย.", 3, { yearStartMonth: 4, sortOrder: 7 }),
    noHalf: await pol(ctx, "PERSONAL", "กิจเต็มวัน", 3, { allowHalfDay: false, sortOrder: 8 }), u2: await pol(ctx, "PERSONAL", "กิจu2", 3, { unitId: u2, sortOrder: 9 }),
    arch: await pol(ctx, "PERSONAL", "กิจเก่า", 3, { sortOrder: 10 }), s2: await pol(ctx2, "SICK", "ป่วยB", 30),
  };
  await settings.archiveLeavePolicy(ctx, ov, PL.arch);
  const hol = async (date: string, name: string, kind: string, unitId: string | null, shopOpen = false) => {
    const r = await settings.upsertHoliday(ctx, ov, { unitId, date, name, kind, shopOpen });
    if (!r?.ok) throw new Error(`fixture holiday ${date}: ${r?.reason}`);
    return r.id as string;
  };
  const H = { pub: await hol("2031-04-14", "QC27 ราชการ", "PUBLIC", null), u2: await hol("2031-04-15", "QC27 ใต้", "SHOP", u2), open: await hol("2031-04-16", "QC27 เปิด", "SHOP", null, true) };
  // ── helpers ──
  const SK = { policyId: PL.sick, type: "SICK" };
  const rq = (who: Who | null, employeeId: string, fromDate: string, toDate: string, o: Any = {}, c: Any = ctx) =>
    svc("requestLeave", c, { employeeId, type: "PERSONAL", fromDate, toDate, ...(who ? { actorUserId: who.id } : {}), ...o });
  const rc = (from: string, to: string, o: Any) => rq(U.Cc, E.C, from, to, o);
  const idv = (r: RO) => (r.ok ? String(r.value?.id ?? "") : "");
  const leave = (id: string) => (id ? P.hrLeave.findUnique({ where: { id } }) : Promise.resolve(null)) as Promise<Any>;
  const daysOf = async (r: RO) => d1((await leave(idv(r)))?.days);
  const nL = (employeeId: string, from: string) => P.hrLeave.count({ where: { tenantId: TT, employeeId, fromDate: dbDate(from) } }) as Promise<number>;
  const txOf = async (where: Any) => (await P.hrLeaveBalanceTxn.findMany({ where: { tenantId: TT, ...where }, orderBy: { createdAt: "asc" } })) as Any[];
  const sum = (rows: Any[]) => rows.reduce((s, r) => s + Number(String(r.days)), 0).toFixed(1);
  const decide = (id: string, status: string, who: Who, from?: string, c: Any = ctx) => svc("decideLeave", c, id, status, who.id, from ? { from } : {});
  const evs = async (id: string) => ((await P.outboxEvent.findMany({ where: { tenantId: TT, type: EV } })) as Any[]).filter((e) => !!id && e.payload?.leaveId === id);
  const itemsOf = (r: RO): Any[] => (Array.isArray(r.value?.items) ? r.value.items : []);
  const bal = async (who: Who, employeeId: string, policyId: string, c: Any = ctx) => {
    const r = await lv("leaveBalances", c, vOf(who), { employeeId, year: 2031 });
    return { r, it: itemsOf(r).find((i) => i?.policyId === policyId) };
  };
  const adj = (employeeId: string, policyId: string, k: string) =>
    P.hrLeaveBalanceTxn.create({ data: { tenantId: TT, systemId: sA.id, employeeId, policyId, kind: "ADJUST", days: -2, leaveYear: 2031, effectiveDate: dbDate("2031-01-02"), sourceKey: `qc27-${k}-${tag}` } });
  const reqOf = (id: string) => P.approvalRequest.findFirst({ where: { tenantId: TT, entityType: "HrLeave", entityId: id || "∅" } }) as Promise<Any>;
  const viaChain = async (who: Who, id: string, decision: string, twice = false) => {
    const q = await reqOf(id);
    const d = q ? await approval.decide(vOf(who), { tenantId: TT }, q.id, { decision }).catch((e: unknown) => ({ ok: false, status: `THROW ${errText(e)}` })) : { ok: false };
    const e = q ? await P.outboxEvent.findFirst({ where: { tenantId: TT, idempotencyKey: { in: ["approved", "rejected"].map((t) => `approval.request.${t}#${q.id}`) } } }) : null;
    const out = e ? [await deliver(CONS, e), ...(twice ? [await deliver(CONS, e), ...(await Promise.all([deliver(CONS, e), deliver(CONS, e)]))] : [])] : [{ ok: false, err: "no event" }];
    return d?.ok !== false && out.every((x) => x.ok);
  };

  // ═══ S3 request validation ═══
  {
    const r = await rc("2031-06-10", "2031-06-09", SK);
    ck("S3.1", { text: said(r, X.leaveRange), rows: (await nL(E.C, "2031-06-10")) === 0 }, "range · 0 rows", shown(r));
    const r2 = await rc("2026-01-01", "2029-12-31", { type: "OTHER" });
    ck("S3.2", { text: said(r2, X.leaveTooLong), rows: (await nL(E.C, "2026-01-01")) === 0 }, "tooLong · 0 rows", shown(r2));
  }
  {
    const a = await rc("2031-06-02", "2031-06-03", { policyId: PL.pers });
    const o = await rc("2031-06-03", "2031-06-03", SK);
    const am = await rc("2031-06-16", "2031-06-16", { ...SK, halfDay: "AM" });
    const pm = await rc("2031-06-16", "2031-06-16", { ...SK, halfDay: "PM" });
    const am2 = await rc("2031-06-16", "2031-06-16", { ...SK, halfDay: "AM" });
    const full = await rc("2031-06-16", "2031-06-16", SK);
    NB.cPend = idv(a);
    ck("S3.3", { first: a.ok, overlap: said(o, T.overlap), am: am.ok, pm: pm.ok, am2: said(am2, T.overlap), full: said(full, T.overlap), rows: (await nL(E.C, "2031-06-16")) === 2 }, "overlap rules", [a, o, am, pm, am2, full].map(shown).join(" "));
  }
  {
    const rs = await Promise.all([PL.arch, PL.s2, PL.u2, `c${tag}nopolicyxxxxxxxxxx`].map((policyId) => rc("2031-06-23", "2031-06-23", { policyId })));
    ck("S3.4", { texts: rs.every((r) => said(r, T.policyNf)), rows: (await nL(E.C, "2031-06-23")) === 0 }, "policyNf ×4", rs.map(shown).join(" "));
  }
  {
    const d = "2031-06-24";
    ck("S3.5", {
      noHalf: said(await rc(d, d, { policyId: PL.noHalf, halfDay: "AM" }), T.halfNotAllowed),
      noHours: said(await rc(d, d, { policyId: PL.pers, hours: 2 }), T.hoursNotAllowed),
      h8: said(await rc(d, d, { policyId: PL.hour, hours: 8 }), T.hoursBad),
      h2days: said(await rc(d, "2031-06-25", { policyId: PL.hour, hours: 2 }), T.hoursBad),
      both: said(await rc(d, d, { policyId: PL.hour, halfDay: "AM", hours: 2 }), T.halfAndHours),
      halfRange: said(await rc(d, "2031-06-25", { ...SK, halfDay: "AM" }), X.halfDayRange),
      rows: (await nL(E.C, d)) === 0,
    }, "6 texts · 0 rows");
  }
  {
    const a = await rc("2031-12-30", "2032-01-02", SK);
    const b = await rc("2032-03-30", "2032-04-02", { policyId: PL.apr });
    const c = await rc("2031-12-31", "2032-01-01", { policyId: PL.apr });
    ck("S3.6", { cal: said(a, T.crossYear), apr: said(b, T.crossYear), inside: c.ok && (await daysOf(c)) === "2.0" }, "crossYear ×2 · 2.0", [a, b, c].map(shown).join(" "));
  }
  {
    const rs = [
      await rq(U.owner, E.New, "2031-02-20", "2031-02-20", { policyId: PL.pers }), await rq(U.owner, E.New, "2031-03-05", "2031-03-05", { policyId: PL.vac, type: "VACATION" }),
      await rq(U.owner, E.N, "2031-03-05", "2031-03-05", { policyId: PL.vac, type: "VACATION" }), await rq(U.owner, E.N, "2031-03-06", "2031-03-06", { policyId: PL.pers }),
    ];
    ck("S3.7", { out: said(rs[0]!, T.outOfEmployment), service: said(rs[1]!, T.notEligible), noStart: said(rs[2]!, T.noStart), ok: rs[3]!.ok }, "texts · ok", rs.map(shown).join(" "));
  }
  {
    const r = await rc("2031-04-14", "2031-04-14", SK);
    ck("S3.8", { text: said(r, T.zeroDays), rows: (await nL(E.C, "2031-04-14")) === 0 }, "zeroDays · 0 rows", shown(r));
  }
  {
    const a = await rq(U.B, E.B, "2031-07-07", "2031-07-08", { policyId: PL.pers });
    const b = await rq(U.B, E.B, "2031-07-14", "2031-07-15", { policyId: PL.pers });
    const u = await rq(U.B, E.B, "2031-08-01", "2031-08-20", { policyId: PL.unpaid, type: "OTHER" });
    NB.bPend = idv(a);
    ck("S3.9", { first: a.ok, second: said(b, T.balance), unlimited: u.ok && (await daysOf(u)) === "20.0" }, "ok · balance · 20.0", [a, b, u].map(shown).join(" "));
  }
  {
    const r = await rq(null, E.S2, "2031-06-02", "2031-06-04", {}, ctx2);
    const l = await leave(idv(r));
    ck("S3.10", { ok: r.ok, days: d1(l?.days) === "3.0", policy: !!l && l.policyId === null, ledger: (await txOf({ employeeId: E.S2 })).length === 0 }, "3.0 · no ledger", shown(r));
    const r2 = await rq(U.A, E.A, "2031-09-01", "2031-09-01");
    const l2 = await leave(idv(r2));
    ck("S3.11", { ok: r2.ok, policy: l2?.policyId === PL.pers, days: d1(l2?.days) === "1.0" }, "กิจ · 1.0", shown(r2));
  }

  // ═══ S4 day count ═══
  const shiftM = (await P.hrShift.create({ data: { tenantId: TT, systemId: sA.id, name: "เช้า", startMin: 540, endMin: 1020, breakMin: 0, crossesMidnight: false } })).id as string;
  const roster = async (employeeId: string, days: string[]) => {
    for (const date of days) if (!(await ro("addEntry", ctx, ov, { employeeId, date, shiftId: shiftM })).ok) throw new Error(`fixture addEntry ${date}`);
    if (!(await ro("publishRoster", ctx, ov, { from: days[0], to: days[days.length - 1] })).ok) throw new Error("fixture publish");
  };
  await roster(E.A, ["10", "11", "12", "13", "14", "17", "18", "19", "20", "21"].map((d) => `2031-03-${d}`));
  const s41 = await rq(U.A, E.A, "2031-03-14", "2031-03-17", SK);
  NB.aLeave = idv(s41);
  chk("S4.1", (await daysOf(s41)) === "2.0", "2.0", `${shown(s41)} ${await daysOf(s41)}`);
  await hr.setSchedule(ctx, E.B, [0, 1, 2, 3, 4, 5, 6].map((wd) => ({ weekday: wd, dayOff: wd === 0 || wd === 6, startMin: 540, endMin: 1020, graceMin: 15 })));
  const s42 = await rq(U.B, E.B, "2031-03-15", "2031-03-17", SK);
  chk("S4.2", (await daysOf(s42)) === "1.0", "1.0", `${shown(s42)} ${await daysOf(s42)}`);
  const s43 = await rc("2031-04-13", "2031-04-16", SK);
  chk("S4.3", (await daysOf(s43)) === "2.0", "2.0", `${shown(s43)} ${await daysOf(s43)}`);
  {
    const h = await rc("2031-05-05", "2031-05-05", { ...SK, halfDay: "AM" });
    const hh = await rc("2031-05-06", "2031-05-06", { policyId: PL.hour, hours: 3 });
    const [lh, lhh] = [await leave(idv(h)), await leave(idv(hh))];
    NB.cHalf = idv(h);
    ck("S4.4", { half: d1(lh?.days) === "0.5" && lh?.halfDay === "AM", hourly: d1(lhh?.days) === "0.3" && d1(lhh?.hours) === "3.0" }, "0.5 AM · 0.3/3.0", `${d1(lh?.days)} ${d1(lhh?.days)}`);
  }
  await P.hrEmployeeUnit.create({ data: { tenantId: TT, systemId: sA.id, employeeId: E.W, unitId: u2, fromDate: dbDate("2031-04-15"), toDate: dbDate("2031-04-15") } });
  const s45 = await rq(U.W, E.W, "2031-04-15", "2031-04-15", SK);
  chk("S4.5", said(s45, T.zeroDays), "zeroDays", shown(s45));

  // ═══ S5 ledger / decide / chain ═══
  const aId: string = NB.aLeave;
  {
    const r = await decide(aId, "APPROVED", U.mgrU1);
    const g = await txOf({ employeeId: E.A, policyId: PL.sick, kind: "GRANT", leaveYear: 2031 });
    const u = await txOf({ leaveId: aId || "∅", kind: "USE" });
    ck("S5.1", { ok: r.ok, grant: g.length === 1 && sum(g) === "30.0" && g[0]?.sourceKey === `grant:${E.A}:${PL.sick}:2031`, use: u.length === 1 && sum(u) === "-2.0" && u[0]?.sourceKey === `use:${aId}` && u[0]?.leaveYear === 2031 && dk(u[0]?.effectiveDate) === "2031-03-14" }, "GRANT 30 · USE −2", `g=${sum(g)} u=${sum(u)}`);
    const a = (await bal(U.owner, E.A, PL.sick)).it;
    const b = (await bal(U.owner, E.B, PL.pers)).it;
    ck("S5.2", {
      keys: !!a && srt(Object.keys(a)) === BAL_KEYS,
      aSick: a?.granted === "30.0" && a?.used === "2.0" && a?.balance === "28.0" && a?.pending === "0.0" && a?.available === "28.0" && a?.unlimited === false,
      bPers: b?.balance === "3.0" && b?.pending === "2.0" && b?.available === "1.0",
      unlimited: (await bal(U.owner, E.B, PL.unpaid)).it?.available === null,
    }, "vectors", short([a, b], 160));
  }
  {
    const r = await decide(aId, "REJECTED", U.mgrU1, "APPROVED");
    const r2 = await decide(aId, "REJECTED", U.mgrU1, "APPROVED");
    const rv = await txOf({ leaveId: aId || "∅", kind: "ADJUST" });
    ck("S5.3", { ok: r.ok, second: !r2.ok, revert: rv.length === 1 && sum(rv) === "2.0" && rv[0]?.sourceKey === `use-revert:${aId}`, back: (await bal(U.owner, E.A, PL.sick)).it?.balance === "30.0" }, "1 revert · 30.0", `${shown(r2)} rv=${rv.length}`);
  }
  {
    const r = await decide(NB.bPend, "REJECTED", U.mgrU1);
    const c = await svc("cancelLeave", ctx, NB.cPend, { actorUserId: U.Cc.id });
    ck("S5.4", { grant: (await txOf({ employeeId: E.B, policyId: PL.pers, kind: "GRANT" })).length === 1, reject: r.ok && (await leave(NB.bPend))?.status === "REJECTED", cancel: c.value?.ok === true, noTx: (await txOf({ leaveId: { in: [NB.bPend, NB.cPend].filter(Boolean) } })).length === 0 }, "no ledger", shown(r));
  }
  {
    const p = await rq(U.W, E.W, "2031-07-07", "2031-07-08", { policyId: PL.pers });
    if (p.ok) await adj(E.W, PL.pers, "w");
    const r = await decide(idv(p), "APPROVED", U.mgrU1);
    ck("S5.5", { pending: p.ok, text: said(r, T.balanceDecide), status: (await leave(idv(p)))?.status === "PENDING", noUse: (await txOf({ leaveId: idv(p) || "∅" })).length === 0 }, "balanceDecide", `${shown(p)} ${shown(r)}`);
  }
  {
    const r = await rq(U.owner, E.O, "2031-07-21", "2031-07-21", { policyId: PL.pers });
    const u = await txOf({ leaveId: idv(r) || "∅", kind: "USE" });
    ck("S5.6", { auto: (await leave(idv(r)))?.status === "APPROVED", use: u.length === 1 && sum(u) === "-1.0", ev: (await evs(idv(r))).length === 1 }, "APPROVED · USE · event", `${shown(r)} u=${u.length}`);
  }
  {
    const pc = await approval.createPolicy({ tenantId: TT }, { name: "QC27 chain", entityType: "HrLeave", systemId: sA.id, steps: [{ order: 1, approverRole: "MANAGER" }] });
    const ok1 = await rq(U.V, E.V, "2031-09-08", "2031-09-08", SK);
    const rj = await rq(U.V, E.V, "2031-09-15", "2031-09-15", SK);
    const sh = await rc("2031-10-06", "2031-10-07", { policyId: PL.pers });
    if (sh.ok) await adj(E.C, PL.pers, "c");
    const [e1, e2, e3] = [await viaChain(U.mgrU1, idv(ok1), "APPROVED", true), await viaChain(U.mgrU1, idv(rj), "REJECTED"), await viaChain(U.mgrU1, idv(sh), "APPROVED")];
    await approval.setPolicyActive({ tenantId: TT }, pc.id, false);
    const l1 = await leave(idv(ok1));
    const ref = ((await P.auditLog.findMany({ where: { tenantId: TT, action: "hr.leave.apply_refused" } })) as Any[]).filter((a) => a.after?.leaveId === idv(sh) && a.after?.code === "BALANCE");
    ck("S5.7", {
      approve: e1 && l1?.status === "APPROVED" && l1?.decidedById === "approval-engine" && (await txOf({ leaveId: idv(ok1) || "∅", kind: "USE" })).length === 1 && (await evs(idv(ok1))).length === 1,
      reject: e2 && (await leave(idv(rj)))?.status === "REJECTED" && (await txOf({ leaveId: idv(rj) || "∅" })).length === 0,
      short: e3 && (await leave(idv(sh)))?.status === "CANCELLED" && ref.length === 1 && (await txOf({ leaveId: idv(sh) || "∅" })).length === 0 && (await reqOf(idv(sh)))?.status === "APPROVED",
    }, "chain", `${l1?.status}/${l1?.decidedById} ${e1}/${e2}/${e3} ref=${ref.length}`);
  }

  // ═══ S6 job ═══
  {
    const job = (asOf: string) => lv("runLeaveYearJob", { tenantId: TT, systemId: sA.id, asOf });
    await job("2030-06-01");
    await decide(idv(await rq(U.V, E.V, "2030-06-03", "2030-06-03", { policyId: PL.vac, type: "VACATION" })), "APPROVED", U.mgrU1);
    await job("2031-01-01");
    const cv = await txOf({ employeeId: E.V, policyId: PL.vac, kind: "CARRY", leaveYear: 2031 });
    const cw = await txOf({ employeeId: E.W, policyId: PL.vac10, kind: "CARRY", leaveYear: 2031 });
    ck("S6.1", { v: cv.length === 1 && sum(cv) === "5.0" && cv[0]?.sourceKey === `carry:${E.V}:${PL.vac}:2031`, w: cw.length === 1 && sum(cw) === "3.0" }, "5.0 · 3.0", `${sum(cv)} ${sum(cw)}`);
    await decide(idv(await rq(U.V, E.V, "2031-02-10", "2031-02-11", { policyId: PL.vac, type: "VACATION" })), "APPROVED", U.mgrU1);
    await job("2031-03-31");
    const x0 = (await txOf({ kind: "EXPIRE", leaveYear: 2031 })).length;
    await job("2031-04-01");
    const xv = await txOf({ employeeId: E.V, policyId: PL.vac, kind: "EXPIRE", leaveYear: 2031 });
    const xw = await txOf({ employeeId: E.W, policyId: PL.vac10, kind: "EXPIRE", leaveYear: 2031 });
    const b = (await bal(U.owner, E.V, PL.vac)).it;
    ck("S6.2", { none: x0 === 0, v: xv.length === 1 && sum(xv) === "-3.0" && xv[0]?.sourceKey === `expire:${E.V}:${PL.vac}:2031`, w: sum(xw) === "-3.0", bal: b?.granted === "6.0" && b?.carried === "5.0" && b?.used === "2.0" && b?.expired === "3.0" && b?.balance === "6.0" }, "expire · 6.0", `x0=${x0} v=${sum(xv)} w=${sum(xw)} ${short(b, 90)}`);
    const snap = async () => { const r = await txOf({}); return `${r.length}:${sum(r)}`; }; // prettier-ignore
    const s0 = await snap();
    const rr = [await job("2031-04-01"), ...(await Promise.all([job("2031-04-01"), job("2031-04-01")]))];
    ck("S6.3", { ok: rr.every((x) => x.ok), same: s0 === (await snap()) }, "unchanged", `${s0} → ${await snap()}`);
    const n2 = await P.hrLeaveBalanceTxn.count({ where: { tenantId: TT, systemId: s2.id } });
    chk("S6.4", rr[0]!.ok && n2 === 0, "sys2 0", `sys2=${n2}`);
  }

  // ═══ S7 privacy + attachments ═══
  const file = async (tid: string, folder: string, k: number, type = "application/pdf") => {
    const path = `t/${tid}/${folder}/${sha(`${SLUG}-${k}`).slice(0, 40)}.pdf`;
    const f = await P.fileAsset.create({ data: { tenantId: tid, kind: "ATTACHMENT", path, cdnUrl: folder === "private" ? `private://${path}` : `https://cdn.invalid/${path}`, contentType: type, bytes: 100 } });
    fileIds.push(f.id);
    return f.id as string;
  };
  const F = { priv: await file(TT, "private", 1), pub: await file(TT, "attachment", 2), other: await file(T2, "private", 3), txt: await file(TT, "private", 4, "text/plain") };
  const REASON = `QC27 เหตุผลป่วย ${tag}`;
  const L7 = idv(await rq(U.A, E.A, "2031-10-13", "2031-10-15", { ...SK, reason: REASON }));
  const s75 = await rq(U.B, E.B, "2031-10-13", "2031-10-15", SK);
  {
    // r2 rewrite (ruling D3): attachments are OFF — every call refused with one fixed text, nothing written
    const at = (who: Who, id: string, fileId: string) => lv("attachLeaveFile", ctx, vOf(who), id, { fileId });
    const rs = [await at(U.B, L7, F.priv), await at(U.A, L7, F.pub), await at(U.A, L7, F.other), await at(U.A, L7, F.txt), await at(U.A, L7, F.priv), await at(U.Cc, NB.cHalf, F.priv), await at(U.A, aId, F.priv)];
    ck("S7.1", {
      off: rs.every((r) => said(r, TR2.attachOff)),
      none: (await P.hrLeave.count({ where: { tenantId: TT, attachmentKey: { not: null } } })) === 0,
    }, "attachOff ×7 · 0 keys", rs.map(shown).join(" "));
  }
  const VIEW: Record<string, Who> = { owner: U.owner, mgrU1: U.mgrU1, mgrAll: U.mgrAll, read: U.read, self: U.A, dec: U.dec, mgrU2: U.mgrU2, pay: U.pay, key: U.key, member: U.member, B: U.B };
  const RV = ["owner", "mgrU1", "mgrAll", "read", "self"]; // reason viewers
  {
    const out: string[] = [];
    let bound = true;
    for (const [n, w] of Object.entries(VIEW)) {
      const r = await lv("leaveAttachmentLink", ctx, vOf(w), L7);
      const m = String(r.value?.url ?? "").match(/^\/api\/files\/([a-z0-9]+)\?exp=(\d+)&sig=([0-9a-f]{64})$/);
      // r2 rewrite (ruling D3): no download link is ever produced — every viewer gets linkNo
      if (m || r.value?.url) bound = false;
      if (!said(r, T.linkNo)) out.push(`${n}:${shown(r)}`);
    }
    const o = await lv("leaveAttachmentLink", ctxO, vOf(U.other), L7);
    if (!said(o, T.linkNo)) out.push(`other:${shown(o)}`);
    chk("S7.2", !out.length && bound, "12 linkNo · no url", out.join(" ") || (bound ? "ok" : "url minted"));
  }
  {
    const out: string[] = [];
    for (const [n, w] of Object.entries(VIEW)) {
      const r = await lv("leaveDetail", ctx, vOf(w), L7);
      if (![...RV, "dec"].includes(n)) {
        if (!said(r, T.detailNo)) out.push(`${n}:${shown(r)}`);
        continue;
      }
      const it = r.value?.item;
      const keys = it ? srt(Object.keys(it).filter((k) => k !== "reason")) : "∅";
      const hasR = !!it && "reason" in it;
      const js = JSON.stringify(it ?? {});
      const leak = /attachmentKey|private/.test(js) || js.includes(F.priv);
      if (!(r.ok && keys === DETAIL_KEYS && hasR === RV.includes(n) && (!hasR || it.reason === REASON) && it?.hasAttachment === false && it?.days === "3.0" && !leak)) out.push(`${n}:${r.ok ? `keys=${keys === DETAIL_KEYS || keys} reason=${hasR} leak=${leak}` : shown(r)}`);
    }
    const o = await lv("leaveDetail", ctxO, vOf(U.other), L7);
    if (!said(o, T.detailNo)) out.push(`other:${shown(o)}`);
    chk("S7.3", !out.length, "6 row viewers (5 reason) · 6 detailNo", out.join(" ") || "ok");
  }
  {
    const out: string[] = [];
    const want: Record<string, string> = { owner: "", mgrU1: "", mgrAll: "", read: "", dec: "", mgrU2: X.otherBranch!, pay: T.balNo, key: T.balNo, member: T.balNo, B: T.balNo };
    for (const [n, exp] of Object.entries(want)) {
      const { r, it } = await bal(VIEW[n]!, E.A, PL.sick);
      if (exp ? !said(r, exp) : !(r.ok && it?.granted === "30.0")) out.push(`${n}:${shown(r)}`);
    }
    const o = (await bal(U.other, E.A, PL.sick, ctxO)).r;
    if (!said(o, T.balNo)) out.push(`other:${shown(o)}`);
    const my = await lv("myLeaveBalances", ctx, vOf(U.A), { year: 2031, employeeId: E.B });
    const mu = itemsOf(my).find((i) => i?.policyId === PL.unpaid);
    if (!(my.ok && mu?.pending === "0.0")) out.push(`my:${shown(my)} ${short(mu, 40)}`);
    chk("S7.4", !out.length, "5 ok · H1.1 · balNo · my = own", out.join(" ") || "ok");
  }
  {
    const r = await lv("leaveDetail", ctx, ov, idv(s75));
    const d = await decide(idv(s75), "APPROVED", U.mgrU1);
    chk("S7.5", r.value?.item?.needsAttachment === true && d.ok, "flag · approved", `${shown(r)} ${shown(d)}`);
  }
  {
    const all = (await P.outboxEvent.findMany({ where: { tenantId: TT, type: EV } })) as Any[];
    const bad = all.filter((e) => srt(Object.keys(e.payload ?? {})) !== P_KEYS || /SICK|PERSONAL|QC27/.test(JSON.stringify(e.payload)));
    chk("S7.6", all.length > 0 && !bad.length, P_KEYS, short(bad[0]?.payload ?? all.length, 80));
  }

  // ═══ S8 events ═══
  chk("S8.1", NB.cons === true && typeof CONS[EV] === "function", "withAutomation", `${NB.cons} ${typeof CONS[EV]}`);
  {
    const n = (list: Any, lbl: boolean) => (Array.isArray(list) ? list.filter((x: Any) => x?.value === EV && (!lbl || x?.label === EV_LABEL)).length : -1);
    chk("S8.2", NB.label === true && n(autoLabels?.AUTOMATION_EVENTS, true) === 1 && n(hookLabels?.WEBHOOK_EVENTS, false) === 1, EV_LABEL, `${NB.label}`);
    const es = (await evs(aId)).slice(0, 2);
    const snapE = async () => JSON.stringify([await leave(aId), await txOf({ leaveId: aId || "∅" }), await P.outboxEvent.count({ where: { tenantId: TT } })]);
    const s0 = await snapE();
    const reps: { ok: boolean; err: string }[] = [];
    for (const e of es) reps.push(await deliver(CONS, e), await deliver(CONS, e), ...(await Promise.all([deliver(CONS, e), deliver(CONS, e)])));
    chk("S8.3", es.length === 2 && reps.every((x) => x.ok) && s0 === (await snapE()), "8 ok · unchanged", reps.find((x) => !x.ok)?.err ?? `${es.length} events`);
    const key = `${EV}#${aId}#APPROVED`;
    const cnt = () => P.outboxEvent.count({ where: { tenantId: TT, idempotencyKey: key } }) as Promise<number>;
    const had = await cnt();
    await coreOutbox.emitOutbox(P, { tenantId: TT, type: EV, idempotencyKey: key, payload: { leaveId: aId } }).catch(() => {});
    chk("S8.4", had === 1 && (await cnt()) === 1, "1 → 1", `${had} → ${await cnt()}`);
    const st = async (id: string) => (await evs(id)).map((e) => e.payload?.status).sort().join(",");
    ck("S8.5", { a: (await st(aId)) === "APPROVED,REJECTED", b: (await st(NB.bPend)) === "REJECTED", c: (await st(NB.cPend)) === "" }, "1 per decision", await st(aId));
  }

  // ═══ S9 races (advisory holder) ═══
  {
    const id = idv(await rq(U.R, E.R, "2031-11-03", "2031-11-03", SK));
    const h = await holdAdvisory(P, `hr-leave:${id}`, async () => {}, Array.from({ length: 5 }, () => () => decide(id, "APPROVED", U.mgrU1)));
    const oks = h.res.filter((r) => r.ok).length;
    ck("S9.1", { waited: h.waited, one: oks === 1, use: (await txOf({ leaveId: id || "∅", kind: "USE" })).length === 1, ev: (await evs(id)).length === 1 }, "1 · 1 · 1", `ok=${oks} ${short(h.res.find((r) => !r.ok)?.text, 150)}`);
    const h2 = await holdAdvisory(P, `hr-leave:${id}`, async () => {}, [0, 1, 2, 3, 4, 5].map((i) => () => (i < 3 ? decide(id, "REJECTED", U.mgrU1, "APPROVED") : decide(id, "APPROVED", U.mgrU1, "PENDING"))));
    const lt = await txOf({ leaveId: id || "∅" });
    ck("S9.2", { waited: h2.waited, revoke: h2.res.slice(0, 3).filter((r) => r.ok).length === 1, approve: h2.res.slice(3).every((r) => !r.ok), final: (await leave(id))?.status === "REJECTED", revert: lt.filter((t) => t.kind === "ADJUST").length === 1, nets: sum(lt) === "0.0" }, "REJECTED · 1 revert", `${lt.length}/${sum(lt)}`);
  }
  {
    const days = Array.from({ length: 5 }, (_, i) => addDay("2031-11-10", 3 * i));
    const h = await holdAdvisory(P, `hr-leave-emp:${sA.id}:${E.R}`, async () => {}, days.map((d) => () => rq(U.R, E.R, d, addDay(d, 1), { policyId: PL.pers })));
    const made = h.res.filter((r) => r.ok).length;
    ck("S9.3", { waited: h.waited, one: made === 1, rest: h.res.filter((r) => !r.ok).every((r) => said(r, T.balance)) }, "queued · 1", `made=${made}`);
  }
  {
    const dS = "2031-12-15";
    await roster(E.R, [dS]);
    const entry = await P.hrRosterEntry.findFirst({ where: { tenantId: TT, employeeId: E.R, date: dbDate(dS) } });
    const gl = await rq(U.G, E.G, dS, dS, SK);
    const sr = await sw("requestSwap", ctx, vOf(U.R), { fromEntryId: entry?.id, targetEmployeeId: E.G, toEntryId: null });
    const swId = idOf(sr);
    await sw("respondSwap", ctx, vOf(U.G), swId, { accept: true });
    let during = "";
    const h = await holdAdvisory(P, `hr:roster:${sA.id}:${E.G}:${dS}`, async (tx) => {
      const q = async (t: string, id: string) => ((await tx.$queryRawUnsafe(`SELECT status::text AS s FROM "${t}" WHERE id = $1`, id || "∅")) as Any[])[0]?.s;
      during = `${await q("HrLeave", idv(gl))}/${await q("HrShiftSwapRequest", swId)}`;
    }, [() => sw("decideSwap", ctx, vOf(U.mgrU1), swId, { decision: "APPROVED" }), () => decide(idv(gl), "APPROVED", U.mgrU1)]);
    const holder = (await P.hrRosterEntry.findUnique({ where: { id: entry?.id ?? "∅" } }))?.employeeId;
    const sst = (await P.hrShiftSwapRequest.findUnique({ where: { id: swId || "∅" } }))?.status;
    ck("S9.4", { setup: gl.ok && sr.ok, waited: h.waited, held: during === "PENDING/PENDING", leave: (await leave(idv(gl)))?.status === "APPROVED", consistent: (sst === "APPROVED") === (holder === E.G) }, "queued · consistent", `${during} ${sst} ${holder === E.G ? "G" : holder === E.R ? "R" : holder}`);
  }

  // ═══ S10 holidays (H2.8) ═══
  {
    const a = await ho("holidayPreset", 2026);
    const b = await ho("holidayPreset", 2569);
    const none = typeof hoMod?.holidayPreset === "function" ? await Promise.resolve(hoMod.holidayPreset(2028)).catch(() => "throw") : "∅";
    chk("S10.1", a.ok && Array.isArray(a.value?.days) && JSON.stringify(a.value) === JSON.stringify(b.value) && none === null, "CE = BE · null", `${shown(a)} ${short(none, 20)}`);
    const nDays = Array.isArray(a.value?.days) ? a.value.days.length : -1;
    await hol("2026-12-31", "QC27 ร้านปิด", "SHOP", null);
    const in26 = { tenantId: TT, systemId: sA.id, date: { gte: dbDate("2026-01-01"), lte: dbDate("2026-12-31") } };
    const r1 = await ho("applyHolidayPreset", ctx, ov, { year: 2026 });
    const rows = (await P.hrHoliday.findMany({ where: in26 })) as Any[];
    const r2 = await ho("applyHolidayPreset", ctx, ov, { year: 2026 });
    const pub = rows.filter((x) => x.kind === "PUBLIC");
    ck("S10.2", {
      add: r1.value?.added === nDays - 1 && r1.value?.skipped === 1,
      rows: pub.length === nDays - 1 && pub.every((x) => x.unitId === null && x.presetYear === 2026),
      kept: rows.some((x) => dk(x.date) === "2026-12-31" && x.kind === "SHOP" && x.name === "QC27 ร้านปิด"),
      again: r2.value?.added === 0 && (await P.hrHoliday.count({ where: in26 })) === rows.length,
    }, "missing only · idempotent", `${short(r1.value, 40)} ${pub.length}/${nDays - 1} ${short(r2.value, 30)}`);
    const ap = (w: Who, year: number) => ho("applyHolidayPreset", ctx, vOf(w), { year });
    ck("S10.3", { mgrU1: said(await ap(U.mgrU1, 2027), X.shopWide!), member: said(await ap(U.member, 2027), X.noPermission!), pay: said(await ap(U.pay, 2027), X.noPermission!), none: said(await ap(U.owner, 2028), T.presetNone), mgrAll: (await ap(U.mgrAll, 2027)).ok }, "matrix");
  }
  {
    const shop = await hol("2031-05-12", "QC27 ทั้งร้าน", "PUBLIC", null);
    const own = await hol("2031-05-12", "QC27 u1", "SHOP", u1, true);
    const dc = async (unitId: string, date: string) => (await ho("dayClassOf", ctx, { unitId, date })).value;
    const [c1, c2, c3, c4] = [await dc(u1, "2031-05-12"), await dc(u2, "2031-05-12"), await dc(u2, "2031-04-15"), await dc(u1, "2031-04-15")];
    const hb = await ho("holidaysBetween", ctx, { unitId: u1, from: "2031-04-13", to: "2031-04-16" });
    const seen = (Array.isArray(hb.value) ? hb.value : []).map((x: Any) => `${dk(x?.date)}:${x?.holidayId === H.pub ? "pub" : x?.holidayId === H.open ? "open" : "?"}:${x?.shopOpen}`).join(",");
    ck("S10.4", {
      unitWins: c1?.dayClass === "HOLIDAY" && c1?.holidayId === own && c1?.shopOpen === true,
      shopWide: c2?.dayClass === "HOLIDAY" && c2?.holidayId === shop && c2?.shopOpen === false,
      u2: c3?.dayClass === "HOLIDAY" && c3?.holidayId === H.u2,
      workday: c4?.dayClass === "WORKDAY" && c4?.holidayId === null,
      between: seen === "2031-04-14:pub:false,2031-04-16:open:true",
    }, "unit row wins · shopOpen", seen);
  }

  // ═══ S12 r2 rulings (own HR systems s3/s4 · every expected balance is a literal) ═══
  {
    const s3 = await sysSvc.createSystem(TT, "HR", "HR C");
    const ctx3 = { tenantId: TT, systemId: s3.id };
    const e3 = (n: string, start = "2025-01-01") => emp(n, { unitId: u1 }, start, s3.id);
    const PQ = await pol(ctx3, "VACATION", "QC27 สะสม", 10, { carryMaxDays: 5, carryExpiresMonthDay: "03-31", sortOrder: 1 });
    const PY = await pol(ctx3, "PERSONAL", "QC27 กิจปี", 3, { sortOrder: 2 });
    const PU = await pol(ctx3, "SICK", "QC27 ป่วยไม่จำกัด", null, { sortOrder: 3 });
    const PN = await pol(ctx3, "OTHER", "QC27 อายุงาน", 6, { minServiceDays: 365, sortOrder: 4 });
    const job3 = (asOf: string, o: Any = {}) => lv("runLeaveYearJob", { tenantId: TT, systemId: s3.id, asOf, ...o });
    const q = (e: string, from: string, to: string, o: Any = {}) => rq(U.mgrAll, e, from, to, { policyId: PQ, type: "VACATION", ...o }, ctx3);
    const ap = (r: RO | string, st = "APPROVED", from?: string) => decide(typeof r === "string" ? r : idv(r), st, U.mgrAll, from, ctx3);
    const sy = async (e: string, y: number, p = PQ) => sum(await txOf({ employeeId: e, policyId: p, leaveYear: y }));
    const key = async (k: string) => (await txOf({ sourceKey: k }))[0] as Any;
    const hol3 = async (date: string, kind = "PUBLIC", shopOpen = false) => {
      const r = await settings.upsertHoliday(ctx3, ov, { unitId: null, date, name: `QC27 s3 ${date}`, kind, shopOpen });
      if (!r?.ok) throw new Error(`fixture holiday3 ${date}: ${r?.reason}`);
      return r.id as string;
    };
    const E3 = { A: await e3("3A"), B: await e3("3B"), C: await e3("3C"), D: await e3("3D"), E: await e3("3E"), F: await e3("3F"), G: await e3("3G"), I: await e3("3I"), J: await e3("3J"), NE: await e3("3NE", "2031-03-01") };
    await job3("2030-06-01"); // GRANT 2030 for everyone
    // ── L2 (hunt P1 A/B · review M2c): A uses 5 · B uses 4 + 3 PENDING at job time
    await ap(await q(E3.A, "2030-06-03", "2030-06-07"));
    await ap(await q(E3.B, "2030-06-03", "2030-06-06"));
    const bPend = await q(E3.B, "2030-11-04", "2030-11-06");
    await job3("2031-01-05");
    const aOut = await key(`carry-out:${E3.A}:${PQ}:2031`);
    const aIn = await key(`carry:${E3.A}:${PQ}:2031`);
    const bWait = !(await key(`carry:${E3.B}:${PQ}:2031`));
    const back = await q(E3.A, "2030-12-23", "2030-12-27");
    await ap(bPend);
    await job3("2031-01-06");
    ck("S12.1", {
      out: d1(aOut?.days) === "-5.0" && aOut?.leaveYear === 2030 && aOut?.kind === "CARRY", in: d1(aIn?.days) === "5.0" && aIn?.leaveYear === 2031,
      a30: (await sy(E3.A, 2030)) === "0.0", a31: (await sy(E3.A, 2031)) === "15.0", backRefused: said(back, T.balance),
      bWait, b30: (await sy(E3.B, 2030)) === "0.0", bIn: d1((await key(`carry:${E3.B}:${PQ}:2031`))?.days) === "3.0", b31: (await sy(E3.B, 2031)) === "13.0",
    }, "A 0.0/15.0 · back refused · B waits → carry 3.0 · 13.0", `a=${await sy(E3.A, 2030)}/${await sy(E3.A, 2031)} back=${shown(back)} b=${await sy(E3.B, 2030)}/${await sy(E3.B, 2031)} wait=${bWait}`);
    // ── L3 (review M1 · hunt P2a): C has 10 + 5 carry; a 15-day October leave may use only the 10
    const c15 = await q(E3.C, "2031-10-01", "2031-10-15");
    const c10 = await q(E3.C, "2031-10-01", "2031-10-10");
    await ap(c10);
    const c5 = await q(E3.C, "2031-03-02", "2031-03-06");
    await ap(c5);
    // ── L4a (review M2a): D 25–27 Mar PENDING when the expiry job runs
    const dPend = await q(E3.D, "2031-03-25", "2031-03-27");
    // ── L4b (review M2b · hunt P2b): E uses 5 carried days in Feb
    const eFeb = await q(E3.E, "2031-02-03", "2031-02-07");
    await ap(eFeb);
    await job3("2031-04-01");
    const dWait = !(await key(`expire:${E3.D}:${PQ}:2031`));
    ck("S12.2", { c15: said(c15, T.balance), c10: c10.ok, c5: c5.ok, x: d1((await key(`expire:${E3.C}:${PQ}:2031`))?.days) === "0.0", c31: (await sy(E3.C, 2031)) === "0.0" }, "15 d refused · EXPIRE 0.0 · 0.0", `${shown(c15)} ${shown(c5)} c31=${await sy(E3.C, 2031)}`);
    await ap(dPend);
    await job3("2031-04-02");
    ck("S12.3", { dWait, x: d1((await key(`expire:${E3.D}:${PQ}:2031`))?.days) === "-2.0", d31: (await sy(E3.D, 2031)) === "10.0" }, "waits · EXPIRE −2.0 · 10.0", `wait=${dWait} d31=${await sy(E3.D, 2031)}`);
    const eRev = await ap(eFeb, "REJECTED", "APPROVED");
    const eRev2 = await ap(eFeb, "REJECTED", "APPROVED");
    const late = await txOf({ sourceKey: { startsWith: "expire-late:" }, employeeId: E3.E });
    ck("S12.4", { rev: eRev.ok, again: !eRev2.ok, late: late.length === 1 && d1(late[0]?.days) === "-5.0" && late[0]?.sourceKey === `expire-late:${idv(eFeb)}`, e31: (await sy(E3.E, 2031)) === "10.0" }, "expire-late −5.0 once · 10.0", `late=${late.length}/${sum(late)} e31=${await sy(E3.E, 2031)}`);
    // ── L5 (review M3 · hunt P3a): revert goes to the USE row's year; changing yearStartMonth is refused once rows exist
    const f = await q(E3.F, "2031-02-10", "2031-02-11", { policyId: PY, type: "PERSONAL" });
    await ap(f);
    await P.hrLeavePolicy.update({ where: { id: PY }, data: { yearStartMonth: 4 } }); // a pre-ruling edit, straight in the DB
    const fRev = await ap(f, "REJECTED", "APPROVED");
    await P.hrLeavePolicy.update({ where: { id: PY }, data: { yearStartMonth: 1 } });
    const rv = await key(`use-revert:${idv(f)}`);
    const locked = await settings.updateLeavePolicy(ctx3, ov, PY, { yearStartMonth: 4 });
    const PZ = await pol(ctx3, "OTHER", "QC27 ไม่มีแถว", 2, { sortOrder: 9 });
    const free = await settings.updateLeavePolicy(ctx3, ov, PZ, { yearStartMonth: 4 });
    ck("S12.5", { rev: fRev.ok, year: rv?.leaveYear === 2031 && rv?.policyId === PY, f31: (await sy(E3.F, 2031, PY)) === "3.0", f30: (await sy(E3.F, 2030, PY)) === "3.0", locked: locked?.ok === false && locked?.reason === TR2.ysmLocked, free: free?.ok === true, ysm: (await P.hrLeavePolicy.findUnique({ where: { id: PY } }))?.yearStartMonth === 1 }, "revert 2031 · 3.0 · refused · free ok", `rv=${rv?.leaveYear} ${short(locked, 80)}`);
    await settings.archiveLeavePolicy(ctx3, ov, PZ);
    // ── D1 (review D1): days recounted at approval
    const g5 = await q(E3.G, "2031-06-02", "2031-06-06");
    await hol3("2031-06-04");
    const g5d = await ap(g5);
    const g1 = await q(E3.G, "2031-06-09", "2031-06-09");
    await hol3("2031-06-09");
    const g1d = await ap(g1);
    const h703 = await hol3("2031-07-03");
    const g6 = await q(E3.G, "2031-07-01", "2031-07-07");
    await settings.deleteHoliday(ctx3, ov, h703);
    const g6d = await ap(g6);
    const [l5, l1, l6] = [await leave(idv(g5)), await leave(idv(g1)), await leave(idv(g6))];
    ck("S12.8", {
      recount: g5d.ok && d1(l5?.days) === "4.0" && d1((await key(`use:${idv(g5)}`))?.days) === "-4.0",
      zero: said(g1d, TR2.zeroDaysDecide) && l1?.status === "CANCELLED" && !(await key(`use:${idv(g1)}`)),
      short: g6.ok && said(g6d, T.balanceDecide) && l6?.status === "PENDING" && d1(l6?.days) === "6.0",
      g31: (await sy(E3.G, 2031)) === "6.0",
    }, "4.0 · zero ⇒ CANCELLED · 7 > 6 ⇒ balanceDecide · 6.0", `${d1(l5?.days)} ${shown(g1d)} ${l1?.status} ${shown(g6d)} g31=${await sy(E3.G, 2031)}`);
    // ── D5 (review D5): a holiday on which the employee has a PUBLISHED roster entry counts
    const sh3 = (await P.hrShift.create({ data: { tenantId: TT, systemId: s3.id, name: "เช้า3", startMin: 540, endMin: 1020, breakMin: 0, crossesMidnight: false } })).id as string;
    const add = await ro("addEntry", ctx3, ov, { employeeId: E3.I, date: "2031-06-16", shiftId: sh3 });
    const pub = await ro("publishRoster", ctx3, ov, { from: "2031-06-16", to: "2031-06-16" });
    await hol3("2031-06-16", "SHOP", true);
    const iS = await q(E3.I, "2031-06-16", "2031-06-16", { policyId: PU, type: "SICK" });
    const jS = await q(E3.J, "2031-06-16", "2031-06-16", { policyId: PU, type: "SICK" });
    ck("S12.9", { setup: add.ok && pub.ok, rostered: iS.ok && (await daysOf(iS)) === "1.0", notRostered: said(jS, T.zeroDays) }, "1.0 · zeroDays", `${shown(iS)} ${await daysOf(iS)} ${shown(jS)}`);
    // ── D3 (review D3 · hunt P5): attachments off
    {
      const a = await lv("attachLeaveFile", ctx3, vOf(U.mgrAll), idv(iS), { fileId: F.priv });
      const k = await lv("leaveAttachmentLink", ctx3, ov, idv(iS));
      const r = await q(E3.J, "2031-06-17", "2031-06-17", { policyId: PU, type: "SICK", attachmentFileId: F.priv });
      const src = stripComments(rd(LEAVE));
      ck("S12.10", { attach: said(a, TR2.attachOff), key: (await leave(idv(iS)))?.attachmentKey === null, link: said(k, T.linkNo) && !k.value?.url, request: said(r, TR2.attachOff) && (await nL(E3.J, "2031-06-17")) === 0, code: !/fileAsset|privateFileUrl\(/.test(src) }, "refused · 0 written · no link · path gone", `${shown(a)} ${shown(k)} ${shown(r)}`);
    }
    // ── L7 (review D2): quiet + bounded + ineligible skipped
    {
      const snap = async () => { const r = await txOf({ systemId: s3.id }); return `${r.length}:${sum(r)}`; }; // prettier-ignore
      const bounded = await job3("2032-01-04", { maxTx: 1 });
      const full = await job3("2032-01-04");
      const s0 = await snap();
      const quiet = await job3("2032-01-04");
      const quiet2 = await job3("2032-01-04");
      const neGrant = await key(`grant:${E3.NE}:${PN}:2032`);
      ck("S12.7", {
        bounded: bounded.value?.txs === 1 && bounded.value?.more === true, full: full.ok && full.value?.more === false,
        quiet: quiet.value?.txs === 0 && quiet2.value?.txs === 0, same: s0 === (await snap()), ineligible: !neGrant,
      }, "1+more · 0 tx ×2 · unchanged · NE skipped", `b=${short(bounded.value, 80)} q=${short(quiet.value, 80)}`);
    }
  }
  // ── L6 property (own system s4): generated request/approve/revoke/job sequences never make a year negative
  {
    const s4 = await sysSvc.createSystem(TT, "HR", "HR D");
    const ctx4 = { tenantId: TT, systemId: s4.id };
    const P4 = await pol(ctx4, "VACATION", "QC27 สุ่ม", 6, { carryMaxDays: 4, carryExpiresMonthDay: "03-31", sortOrder: 1 });
    const es = [await emp("4a", { unitId: u1 }, "2025-01-01", s4.id), await emp("4b", { unitId: u1 }, "2025-01-01", s4.id), await emp("4c", { unitId: u1 }, "2025-01-01", s4.id)];
    const job4 = (asOf: string) => lv("runLeaveYearJob", { tenantId: TT, systemId: s4.id, asOf });
    const q4 = (e: string, from: string, to: string) => rq(U.mgrAll, e, from, to, { policyId: P4, type: "VACATION" }, ctx4);
    const dec4 = (id: string, st: string, from?: string) => decide(id, st, U.mgrAll, from, ctx4);
    let seed = 27;
    const rnd = (n: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return Math.floor((seed / 4294967296) * n); }; // prettier-ignore
    const neg: string[] = [];
    let ops = 0;
    const checkAll = async (label: string) => {
      ops++;
      const g = (await P.hrLeaveBalanceTxn.groupBy({ by: ["employeeId", "leaveYear"], where: { tenantId: TT, systemId: s4.id }, _sum: { days: true } })) as Any[];
      for (const r of g) if (Number(String(r._sum.days)) < 0 && neg.length < 3) neg.push(`${label}:${r.leaveYear}=${Number(String(r._sum.days)).toFixed(1)}`);
    };
    // fixed prefix = hunt P1 A + review M1 (RED on the first build)
    await job4("2030-01-02");
    await checkAll("j0");
    await dec4(idv(await q4(es[0]!, "2030-03-03", "2030-03-05")), "APPROVED");
    await job4("2031-01-03");
    const bk = await q4(es[0]!, "2030-12-01", "2030-12-03");
    if (bk.ok) await dec4(idv(bk), "APPROVED");
    await checkAll("back");
    const oct = await q4(es[0]!, "2031-10-01", "2031-10-09");
    if (oct.ok) await dec4(idv(oct), "APPROVED");
    await job4("2031-04-01");
    await checkAll("prefix");
    let asOf = "2031-04-01";
    for (let i = 0; i < 60; i++) {
      const e = es[rnd(3)]!;
      const op = rnd(10);
      if (op < 4) {
        const y = 2030 + rnd(3);
        const from = `${y}-${String(1 + rnd(12)).padStart(2, "0")}-${String(1 + rnd(24)).padStart(2, "0")}`;
        await q4(e, from, addDay(from, rnd(4)));
      } else if (op < 7) {
        const p = (await P.hrLeave.findMany({ where: { tenantId: TT, systemId: s4.id, employeeId: e, status: "PENDING" }, select: { id: true } })) as Any[];
        if (p.length) await dec4(p[rnd(p.length)]!.id, "APPROVED");
      } else if (op < 9) {
        const a = (await P.hrLeave.findMany({ where: { tenantId: TT, systemId: s4.id, employeeId: e, status: "APPROVED" }, select: { id: true } })) as Any[];
        if (a.length) await dec4(a[rnd(a.length)]!.id, "REJECTED", "APPROVED");
      } else {
        asOf = addDay(asOf, 20 + rnd(60));
        if (asOf > "2032-12-20") asOf = "2032-12-20";
        await job4(asOf);
      }
      await checkAll(`op${i}`);
    }
    ck("S12.6", { prefixBack: !bk.ok, prefixOct: !oct.ok, never: neg.length === 0 }, "0 negative years", `ops=${ops} ${neg.join(" ") || "none"} back=${shown(bk)} oct=${shown(oct)}`);
  }

  // ═══ S11 controls · X ═══
  {
    if (NB.cHalf) await decide(NB.cHalf, "APPROVED", U.mgrU1);
    const day = dbDate("2031-05-05");
    const on = await hr.employeesOnLeave(ctx, [E.C], day);
    const av = await hr.isAvailable(ctx, E.C, day);
    chk("S11.4", !!NB.cHalf && on.has(E.C) && av === false, "whole day", `${on.has(E.C)} ${av}`);
    const p = await rq(U.A, E.A, "2031-11-17", "2031-11-17", SK);
    const r = await decide(idv(p), "APPROVED", U.A);
    chk("S11.5", said(r, SELF_TEXT) && (await leave(idv(p)))?.status === "PENDING", "hotfix text", shown(r));
  }
  {
    const rs = await Promise.all(Array.from({ length: 5 }, () => rq(U.W, E.W, "2031-11-24", "2031-11-24", SK)));
    chk("X1.1", (await nL(E.W, "2031-11-24")) === 1, "1 row", `${await nL(E.W, "2031-11-24")} rows`);
  }
  {
    const s0 = JSON.stringify(await leave(L7));
    const d = await decide(L7, "APPROVED", U.other, undefined, ctxO);
    const a = await lv("applyLeaveDecision", { tenantId: T2, systemId: sO.id, leaveId: L7, requestId: "∅", approved: true });
    const x = await rq(U.owner, E.X, "2031-11-25", "2031-11-25");
    ck("X2.1", { decide: !d.ok, apply: a.ok && a.value?.applied !== true, detail: said(await lv("leaveDetail", ctxO, vOf(U.other), L7), T.detailNo), employee: !x.ok, same: s0 === JSON.stringify(await leave(L7)) }, "refused · unchanged", `${shown(d)} ${shown(a)}`);
  }
  {
    const mine = refusals.filter((r) => /^(svc|leave|holidays)\./.test(r.label));
    const bad = mine.filter((r) => (!FIXED.has(r.text) && !/^(ใบลานี้|ไม่พบ|ระบบไม่ทราบ|ยกเลิกได้|สถานะ)/.test(r.text)) || CUID_RE.test(r.text) || !isThai(r.text) || r.text.includes("QC27"));
    const unseen = [T.overlap, T.balance, T.detailNo, T.linkNo, T.policyNf].filter((t) => !mine.some((r) => r.text === t));
    chk("S7.7", !bad.length && !unseen.length, "fixed Thai texts", bad.slice(0, 2).map((r) => `${r.label}:${short(r.text, 150)}`).join(" | ") || (unseen.length ? `never seen ${unseen.length}` : "ok"));
  }
  {
    const bare = { PATH: process.env.PATH, HOME: process.env.HOME, NODE_OPTIONS: "--max-old-space-size=2048" };
    const res: string[] = [];
    for (const env of [bare, process.env])
      for (const f of ["scripts/fitness.mts", "scripts/fitness-hr.mts"]) {
        const r = await spawnTsx([f], env, 400_000);
        res.push(`${r.code}${r.code ? ` ${short(r.out.split("\n").filter((l) => /❌|FAIL|Error/.test(l)).join(" "), 80)}` : ""}`);
      }
    chk("X12.1", res.every((r) => r === "0"), "0 ×4", res.join(" · "));
  }
}

let crashed = "";
try {
  runStatic();
  runPure(lrMod && !lrMod.__err ? lrMod : null, (y) => (typeof seq?.thaiPublicHolidays === "function" ? seq.thaiPublicHolidays(y) : []), X);
  await runDb();
} catch (e) {
  crashed = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  try {
    await P.fileAsset.deleteMany({ where: { OR: [{ id: { in: fileIds.length ? fileIds : ["∅"] } }, { tenantId: { in: fx.tenants.length ? fx.tenants : ["∅"] } }] } });
    await sweep(P, fx, SLUG);
  } catch (e) {
    console.log(`💥 cleanup: ${errText(e)}`);
  }
}
const residue = await residueOf(P, fx, SLUG, SLUG_PREFIX);
const nFiles = await P.fileAsset.count({ where: { tenantId: { in: fx.tenants.length ? fx.tenants : ["∅"] } } }).catch(() => -1);
if (nFiles !== 0) residue.push(`fileAsset=${nFiles}`);
console.log(`RESIDUE ${residue.length ? residue.join(",") : "none"} (tenants=${fx.tenants.length} users=${fx.users.length})`);
chk("Z1", residue.length === 0 && fx.tenants.length > 0, "none", residue.join(",") || "none");
const exitCode = printSummary(SUITE, { force: FORCE, crashed, missing: skipReasons });
await P.$disconnect?.().catch?.(() => {});
process.exit(exitCode);

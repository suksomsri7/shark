// QC — HF-TENANT (hotfix บน main): ปุ่ม HR 14 ปุ่มรับ systemId จากผู้เรียกโดยไม่ตรวจว่าระบบเป็น "ระบบ HR ของร้านผู้กด"
// brief: ledger/hr-briefs/hr-brief-HF-TENANT.md §1 §2 §3 §5 (session/hr) · notes: ledger/wo-notes/hr-HF-TENANT-oracle.md
// รัน (ฐาน hf_tenant บน host เลน 5 เท่านั้น — ตัวห่อ scripts/qc-hf.sh ตรึง host + ชื่อฐาน):
//   bash scripts/iso.sh bash scripts/qc-hf.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-hf-tenant.mts
// โหมด: (ไม่มี) = ชุดเต็มบนข้อมูลใหม่ แล้วกวาดทิ้ง · --list · --static (T7 อย่างเดียว ไม่แตะ DB)
//        --mig-seed = ลงร้าน A/B + แถวตกค้าง ไว้ถาวร (qc-hr-hft-mig-*) ก่อน migrate · --mig-check = M1–M5 บนชุดนั้นหลัง migrate แล้วกวาดทิ้ง
// SKIP (exit 0) เมื่อยังไม่มี src/lib/modules/hr/hr-target.ts · QC_FORCE=1 = รันทั้งที่ยังไม่มี (ต้องแดงตามเหตุผล ไม่ crash)
// ⚠️ ORACLE-EDIT only — builder ห้ามแก้ไฟล์นี้
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const SUITE = "qc-hr-hf-tenant";
const ROOT = process.cwd();
const ARGS = new Set(process.argv.slice(2));
const FORCE = process.env.QC_FORCE === "1";
const MODE = ARGS.has("--mig-seed") ? "mig-seed" : ARGS.has("--mig-check") ? "mig-check" : ARGS.has("--static") ? "static" : "full";
const HOST_MARK = "ep-orange-dust-aotwbyc7";
const DB_NAME = "hf_tenant";
const PREFIX = "qc-hr-hft-";
/** blob ของ hr-target.ts บน session/hr (bb4f211a9 · commit 2fea7f599) — §2 "คัดลอกทุกตัวอักษร" */
const V2_HR_TARGET_BLOB = "d033fd775909d57ccf5e4874ae3069833b73ac21";

// ═════════════ ทะเบียนข้อ ═════════════
const CHECKS: readonly [string, string][] = [
  ["T1", "setSalaryProfile ข้ามร้าน (XO, XP × SA{ไม่มี emp, eA2, eA1} / U / SN) ไม่เขียนอะไร"],
  ["T2", "createPayrollRun ข้ามร้าน (มีโปรไฟล์ตกค้างบน SA) ไม่เกิดรอบ/items · U / SN ไม่เขียน"],
  ["T3", "approve / reverse / markPaid ข้ามร้าน (runId rA1 · rA2 · รอบตกค้าง) บน SA / U / SN ไม่มี AuditLog / outbox / ไม่แตะรอบ"],
  ["T4", "request / decide / cancel adjustment ข้ามร้าน ไม่เขียน/ไม่ลบ · คำตอบของ SA = คำตอบของ U"],
  ["T5", "พนักงาน 4 ปุ่ม (create / update / remove / restore) ข้ามร้าน ไม่มี HrEmployee / Party"],
  ["T6", "ทุกปุ่ม: ผลของ SA = U = SN (คำตอบ + ชุดตารางที่เปลี่ยน) ต่อผู้กด/ฟอร์มเดียวกัน"],
  ["T7", "[static] 5 ปุ่มอาร์กิวเมนต์ตรงตรวจ typeof เป็นคำสั่งแรกหลัง requireTenant · 22 ปุ่มเรียก hrTargetOwned ก่อน await อื่น (ยกเว้น requireTenant) + ids/คำปฏิเสธตาม §1 + R-F1/R-F2 · kiosk ตรวจก่อนนับถัง PIN · hr-target.ts ไม่มี \"use server\" · blob = V2 · ไม่ re-export"],
  ["T8", "clock + requestLeave บน SA / U / SN ไม่เขียน HrAttendance / HrLeave / outbox"],
  ["T9", "R-F1: XO/XP บนระบบของตัวเอง SB + พนักงานของ A (eA1/eA2) → clock/requestLeave ไม่เขียนอะไร = ผลเดียวกับรหัสพนักงานที่ไม่มี · ท้ายชุด: ไม่มีแถวของ B ที่อ้างพนักงานของ A (นอกจากโปรไฟล์ตกค้างที่ลงเอง)"],
  ["T10", "R-F2: 8 ปุ่มที่เหลือ (save profile · add/remove doc · set PIN · kiosk · decide/bulk-decide leave · schedule) บน SA ด้วยแถวตกค้างของ B ไม่เขียนอะไร · ผล = ผลเมื่อไม่มีแถวตกค้าง"],
  ["T11", "R-R2-1: 5 ปุ่มที่รับ systemId (และ employeeId) เป็นอาร์กิวเมนต์ตรง — ค่าไม่ใช่สตริง ({ not } · { startsWith }) กับแถวตกค้าง → ไม่เขียน/ไม่ audit · ไม่ throw · คำตอบ = ของรหัสที่ไม่มี"],
  ["C1", "เจ้าของ A + พนักงานเงินเดือน A ขับ 14 ปุ่มด้วยฟอร์มครบ ถึงการเขียนจริงทุกปุ่ม"],
  ["C4", "R-F2 control: เจ้าของ A + พนักงาน A ขับ 8 ปุ่มที่เหลือกับพนักงาน/ใบลา/เอกสารของ A เอง ถึงการเขียนจริงทุกปุ่ม"],
  ["C2", "ระบบตัวเอง + runId ไม่มีจริง: approve / reverse / markPaid ยังเขียน audit การปฏิเสธ 1 แถว/ครั้ง ไม่เขียนอื่น"],
  ["C3", "ระบบตัวเอง + employee ไม่มีจริง บน setSalaryProfile ไม่เขียน (เปลี่ยนพฤติกรรมโดยตั้งใจ → แดงก่อนแก้)"],
  ["M1", "ดัชนีใหม่ HrSalaryProfile_tenantId_systemId_employeeId_key / HrPayrollRun_tenantId_systemId_periodKey_key (unique เต็ม คอลัมน์ตรง) · ไม่มีชื่อเก่า"],
  ["M2", "มีแถวตกค้าง (B,SA,eA2)/(B,SA,P2) แล้วเจ้าของ A ยังตั้งโปรไฟล์ eA2 + สร้างรอบ P2 ผ่านปุ่มจริงได้"],
  ["M3", "ซ้ำในร้าน A เอง (โปรไฟล์ eA1 · รอบ P1) ยังได้ P2002"],
  ["M4", "แถวตกค้าง (โปรไฟล์/รอบ/พนักงานของ B บน SA) อยู่ครบค่าเดิม"],
  ["M5", "drift: schema ↔ ฐาน ไม่มีตาราง Hr* ต่าง (ฐานของ main ต่างอยู่แล้ว 1 จุด DormUtilityRate NULLS NOT DISTINCT = ค่าฐาน)"],
  ["Z1", "คืนสภาพ: ร้าน/ผู้ใช้ qc-hr-hft-* ของรอบนี้ถูกลบ · แถวที่มี tenantId/systemId ของร้านเหล่านั้น = 0 · sequence เลขสมุดบัญชี = 0"],
];
if (ARGS.has("--list")) {
  console.log(`${SUITE} — ${CHECKS.length} ข้อ`);
  for (const [id, t] of CHECKS) console.log(`${id}\t${t}`);
  process.exit(0);
}
const TITLE = new Map(CHECKS);
const results = new Map<string, { ok: boolean; detail: string }>();
function chk(id: string, ok: unknown, detail: unknown): boolean {
  if (!TITLE.has(id)) throw new Error(`id ไม่ได้ลงทะเบียน: ${id}`);
  const r = { ok: !!ok, detail: String(detail).slice(0, 1600) };
  results.set(id, r);
  console.log(`  ${r.ok ? "✅" : "❌"} [${id}] ${TITLE.get(id)}${r.ok ? "" : `\n      ↳ ${r.detail}`}`);
  return r.ok;
}
const rd = (p: string) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : "");
const short = (v: unknown, n = 160) => { try { return (typeof v === "string" ? v : JSON.stringify(v) ?? "undefined").slice(0, n); } catch { return String(v).slice(0, n); } };

// ═════════════ T7 — static ═════════════
const PAY = "src/lib/modules/hr/payroll-actions.ts", EMP = "src/lib/modules/hr/actions.ts", TARGET = "src/lib/modules/hr/hr-target.ts";
const GUARD = "if (!(await hrTargetOwned({ tenantId: auth.active.tenantId, systemId }";
/** [ไฟล์, ปุ่ม, ids ที่ต้องส่ง (ข้อความหลัง systemId }), คำปฏิเสธ] — §1 */
const ACTIONS: readonly [string, string, string, string][] = [
  [PAY, "setSalaryProfileAction", ", { employeeId }", "return;"],
  [PAY, "createPayrollRunAction", "", "return;"],
  [PAY, "approvePayrollRunAction", "", "return;"],
  [PAY, "reverseRunAction", "", "return;"],
  [PAY, "markPaidAction", "", "return;"],
  [PAY, "requestAdjustmentAction", "", `return { status: "error", message: "ไม่พบพนักงาน" };`],
  [PAY, "decideAdjustmentAction", "", `return { ok: false, reason: "ไม่พบรายการ" };`],
  [PAY, "cancelAdjustmentAction", "", `return { ok: false, reason: "ไม่พบรายการ" };`],
  [EMP, "createEmployeeAction", "", "return;"],
  [EMP, "updateEmployeeAction", "", "return;"],
  [EMP, "removeEmployeeAction", "", "return;"],
  [EMP, "restoreEmployeeAction", "", "return;"],
  [EMP, "clockAction", ", { employeeId }", "return;"], // R-F1
  [EMP, "requestLeaveAction", ", { employeeId }", "return;"], // R-F1
  // R-F2 — คำปฏิเสธ = คำตอบเดิมของรหัสที่ไม่มีของปุ่มนั้น (service "ไม่พบพนักงาน" / void / ข้อความ "ไม่พบระบบ" เดิมของ bulk)
  [EMP, "saveEmployeeProfileAction", ", { employeeId }", `return { status: "error", message: "ไม่พบพนักงาน" };`],
  [EMP, "addEmployeeDocAction", ", { employeeId }", "return;"],
  [EMP, "removeEmployeeDocAction", "", "return;"],
  [EMP, "setPinAction", ", { employeeId }", `return { status: "error", message: "ไม่พบพนักงาน" };`],
  [EMP, "kioskClockAction", ", { employeeId }", `return { status: "error", message: "ไม่พบพนักงาน" };`],
  [EMP, "decideLeaveAction", "", "return;"],
  [EMP, "bulkDecideLeaveAction", "", `return { status: "error", message: "ไม่พบระบบ" };`],
  [EMP, "setWorkScheduleAction", ", { employeeId }", "return;"],
];
/** R-R2-1: ปุ่มที่รับ id เป็นอาร์กิวเมนต์ตรง (ไม่ผ่าน String(formData…)) — [ไฟล์, ปุ่ม, เงื่อนไข typeof, คำปฏิเสธ = คำปฏิเสธของ guard ความเป็นเจ้าของ] */
const TS = `typeof systemId !== "string"`, TE = `typeof employeeId !== "string"`;
const TYPED: readonly [string, string, string, string][] = [
  [PAY, "requestAdjustmentAction", TS, `return { status: "error", message: "ไม่พบพนักงาน" };`],
  [EMP, "saveEmployeeProfileAction", `${TS} || ${TE}`, `return { status: "error", message: "ไม่พบพนักงาน" };`],
  [EMP, "setPinAction", `${TS} || ${TE}`, `return { status: "error", message: "ไม่พบพนักงาน" };`],
  [EMP, "kioskClockAction", TS, `return { status: "error", message: "ไม่พบพนักงาน" };`],
  [EMP, "bulkDecideLeaveAction", TS, `return { status: "error", message: "ไม่พบระบบ" };`],
];
function fnBody(src: string, name: string): string {
  const i = src.indexOf(`export async function ${name}(`);
  if (i < 0) return "";
  const j = src.indexOf("\nexport ", i + 10);
  return src.slice(i, j < 0 ? undefined : j);
}
const noComments = (s: string) => s.split("\n").map((l) => l.replace(/\s\/\/.*$|^\s*\/\/.*$/, "")).join("\n");
function runStatic(): void {
  const bad: string[] = [];
  for (const [f, name, ids, refusal] of ACTIONS) {
    const body = noComments(fnBody(rd(f), name)).replace(/\s+/g, " ");
    if (!body) { bad.push(`${name}: ไม่พบ`); continue; }
    const awaits = [...body.matchAll(/\bawait\s+([A-Za-z_$][\w$.]*)\s*\(/g)].map((m) => m[1]);
    const first = awaits.filter((a) => a !== "requireTenant")[0];
    if (first !== "hrTargetOwned") { bad.push(`${name}: await แรก (นอก requireTenant) = ${first ?? "ไม่มี"}`); continue; }
    const want = `${GUARD}${ids}))) ${refusal}`;
    if (!body.includes(want)) bad.push(`${name}: ไม่พบ "${want}"`);
    // R-F2: kiosk — ตรวจระบบ/พนักงานก่อนนับถัง PIN (ร้านอื่นเผาถังของพนักงานเราไม่ได้)
    if (name === "kioskClockAction" && !(body.indexOf(GUARD) >= 0 && body.indexOf(GUARD) < body.indexOf("checkRateLimit("))) bad.push(`${name}: guard ต้องมาก่อน checkRateLimit`);
  }
  for (const [f, name, cond, refusal] of TYPED) {
    const body = noComments(fnBody(rd(f), name)).replace(/\s+/g, " ");
    const want = `const auth = await requireTenant(); if (${cond}) ${refusal}`;
    if (!body.includes(want)) bad.push(`${name}: คำสั่งแรกหลัง requireTenant ไม่ใช่ "if (${cond}) ${refusal}"`);
  }
  const tsrc = rd(TARGET);
  let blob = "";
  try { blob = tsrc ? execFileSync("git", ["hash-object", TARGET], { cwd: ROOT, encoding: "utf8" }).trim() : ""; } catch { blob = "?"; }
  if (!tsrc) bad.push(`${TARGET} ไม่มี`);
  else {
    if (/["']use server["']/.test(tsrc)) bad.push(`${TARGET} มี "use server"`);
    if (blob !== V2_HR_TARGET_BLOB) bad.push(`${TARGET} blob ${blob} ≠ V2 ${V2_HR_TARGET_BLOB}`);
  }
  for (const f of [PAY, EMP]) {
    const s = rd(f);
    if (!/^import \{ hrTargetOwned \} from "\.\/hr-target";/m.test(s)) bad.push(`${f}: ไม่มี import { hrTargetOwned } from "./hr-target"`);
    if (/export\s*\{[^}]*hrTargetOwned|export\s*\*\s*from\s*["']\.\/hr-target["']/.test(s)) bad.push(`${f}: re-export hr-target`);
  }
  chk("T7", bad.length === 0, bad.join(" · "));
}

if (MODE === "static") {
  runStatic();
  const f = [...results].filter(([, r]) => !r.ok).map(([id]) => id);
  console.log(`\n${f.length ? "❌" : "✅"} ${SUITE} --static`);
  process.exit(f.length ? 1 : 0);
}

// ═════════════ env: hf_tenant บน host เลน 5 เท่านั้น — ก่อนเขียนแถวแรก ═════════════
if (!process.env.QC_ENV_FILE || process.env.QC_ENV_FILE === ".env") { console.error(`🔴 ${SUITE}: QC_ENV_FILE ต้องเป็น .env.qc-hf (รันผ่าน scripts/qc-hf.sh)`); process.exit(4); }
const { loadLegacyQcEnv } = await import("./qc-env-guard.mjs" as string);
loadLegacyQcEnv(SUITE);
function assertTargetUrls(): void {
  const bad: string[] = [];
  for (const n of ["DATABASE_URL", "DIRECT_URL"]) {
    const u = process.env[n] ?? "";
    let host = "", db = "";
    try { const x = new URL(u); host = x.hostname; db = x.pathname.replace(/^\//, ""); } catch { /* bad */ }
    if (u.includes("ep-royal-night") || !host.startsWith(HOST_MARK) || db !== DB_NAME) bad.push(`${n} (${host || "?"}/${db || "?"})`);
  }
  if (process.env.HF_QC_DB !== DB_NAME) bad.push("HF_QC_DB ไม่ได้ตั้งโดย qc-hf.sh");
  if (bad.length) { console.error(`🔴 หยุด! ${SUITE}: เขียนได้เฉพาะ ${HOST_MARK}/${DB_NAME} — ${bad.join(", ")} (ยังไม่ได้เขียนอะไร)`); process.exit(4); }
}
assertTargetUrls();

const targetMissing = !existsSync(join(ROOT, TARGET));
if (MODE === "full" && targetMissing && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ${TARGET} ยังไม่มี (QC_FORCE=1 เพื่อยืนยันว่าฐานแดง)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true })}`);
  process.exit(0);
}
if (FORCE && targetMissing) console.log("⚠️  QC_FORCE=1 — hr-target.ts ยังไม่มี (คาด: T*/C3/M1/M2 แดงตามเหตุผล · C1/C2 เขียว)");

// ── Next request scope (เทคนิคเดียวกับ qc-hf-o23 / qc-crm-c3.5 บน main) ──
const { AsyncLocalStorage } = await import("node:async_hooks");
(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string)) as Any;
let SCOPE_RUNS = 0;
async function inScope<T>(cookie: string, pathname: string, fn: () => Promise<T>): Promise<T> {
  const req = new Request(`http://qc.local${pathname}`, { headers: { cookie, "user-agent": SUITE } });
  const jar = new nextCookies.RequestCookies(req.headers);
  const ws = { route: pathname, page: `${pathname}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [] };
  const unit = { type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname, search: "" } };
  const out = await nextWork.workAsyncStorage.run(ws, () => nextWorkUnit.workUnitAsyncStorage.run(unit, fn));
  SCOPE_RUNS += 1;
  return out;
}

const { prisma } = (await import("@/lib/core/db")) as Any;
const P = prisma as Any;
{
  const [{ db }] = await P.$queryRawUnsafe(`SELECT current_database() AS db`);
  const [{ n }] = await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'HrPayrollRun' AND column_name = 'reversedAt'`);
  if (db !== DB_NAME || n !== 0) {
    console.error(`🔴 หยุด! ${SUITE}: ฐาน ${db} ${n ? "มี HrPayrollRun.reversedAt (schema V2 — บล็อกรอบของ hotfix เป็น no-op ที่นี่)" : ""} — ต้องเป็น ${DB_NAME} ที่มี schema ของ main เท่านั้น`);
    await P.$disconnect();
    process.exit(4);
  }
}
const sys = (await import("@/lib/modules/system/service")) as Any;
const coreHash = (await import("@/lib/core/hash" as string)) as Any;
const PA = (await import("@/lib/modules/hr/payroll-actions" as string)) as Any;
const EA = (await import("@/lib/modules/hr/actions" as string)) as Any;

// ═════════════ fixture ═════════════
const PERM = { "hr.payroll.read": true, "hr.payroll.create": true, "hr.payroll.approve": true, "hr.payroll.pay": true, "hr.payadjust.request": true, "hr.payadjust.approve": true, "hr.employee.create": true, "hr.attendance.clock": true, "hr.leave.request": true };
const P1 = "2031-01", P2 = "2031-03";
const RES_SALARY = 1_234_500, RES_FAKE = "QC HFT ผู้โจมตี-พนักงานปลอม", RES_PIN = "9876";
type Actor = { label: string; userId: string; cookie: string };
type Fx = {
  stamp: string; A: string; B: string; SA: string; SB: string; SN: string; SAcc: string; U: string;
  eA1: string; eA2: string; rA1: string; rA2: string; adjA: string; fB: string; resProfile: string; resRun: string; resAdj1: string; resAdj2: string;
  resDoc: string; resLv1: string; resLv2: string;
  OA: Actor; AP: Actor; XO: Actor; XP: Actor; XM: Actor;
};
const tenantsOf = async (like: string) => (await P.tenant.findMany({ where: { slug: { startsWith: like } }, select: { id: true, slug: true } })) as { id: string; slug: string }[];

/** F6: ผู้โจมตีที่ไม่ใช่ผู้ดูเงินเดือน — ยื่นรายการเพิ่ม/หักได้อย่างเดียว */
const PERM_NOPAY = { "hr.payadjust.request": true };
async function mkActor(label: string, email: string, tenantId: string, role: "OWNER" | "STAFF", perm: Record<string, boolean> = PERM): Promise<Actor> {
  const u = await P.user.create({ data: { email, name: `QC HFT ${label}` } });
  await P.membership.create({ data: { userId: u.id, tenantId, role, unitAccess: role === "OWNER" ? ["*"] : [], permissions: role === "OWNER" ? {} : perm, acceptedAt: new Date() } });
  return sessionFor(label, u.id, tenantId);
}
async function sessionFor(label: string, userId: string, tenantId: string): Promise<Actor> {
  const token = coreHash.randomToken(32) as string, DAY = 86_400_000;
  await P.session.create({ data: { userId, tokenHash: coreHash.sha256(token), idleExpiresAt: new Date(Date.now() + 30 * DAY), expiresAt: new Date(Date.now() + 90 * DAY) } });
  return { label, userId, cookie: `shark_session=${token}; __Host-shark_session=${token}; shark_tenant=${tenantId}` };
}

async function seed(stamp: string): Promise<void> {
  const ta = await P.tenant.create({ data: { name: "QC HFT ร้าน A (เหยื่อ)", slug: `${PREFIX}${stamp}-a` } });
  const tb = await P.tenant.create({ data: { name: "QC HFT ร้าน B (ผู้โจมตี)", slug: `${PREFIX}${stamp}-b` } });
  const em = (r: string) => `${PREFIX}${stamp}-${r}@qc.invalid`;
  for (const [l, t, role] of [["oa", ta.id, "OWNER"], ["ap", ta.id, "STAFF"], ["xo", tb.id, "OWNER"], ["xp", tb.id, "STAFF"]] as const) await mkActor(l, em(l), t, role);
  await mkActor("xm", em("xm"), tb.id, "STAFF", PERM_NOPAY);
  const SA = await sys.createSystem(ta.id, "HR", "QC HFT SA");
  await sys.createSystem(ta.id, "ACCOUNT", "QC HFT บัญชี A");
  await sys.createSystem(tb.id, "HR", "QC HFT SB");
  await sys.createSystem(tb.id, "POS", "QC HFT SN");
  const emp = (tenantId: string, name: string) => P.hrEmployee.create({ data: { tenantId, systemId: SA.id, name } });
  const eA1 = await emp(ta.id, "QC HFT eA1"), eA2 = await emp(ta.id, "QC HFT eA2");
  await P.hrSalaryProfile.create({ data: { tenantId: ta.id, systemId: SA.id, employeeId: eA1.id, baseSalarySatang: 3_000_000 } });
  await P.hrPayrollRun.create({ data: { tenantId: ta.id, systemId: SA.id, periodKey: P1, payDate: new Date(`${P1}-28T00:00:00Z`), status: "DRAFT" } });
  await P.hrPayrollRun.create({ data: { tenantId: ta.id, systemId: SA.id, periodKey: "2031-02", payDate: new Date("2031-02-28T00:00:00Z"), status: "APPROVED" } });
  await P.hrPayAdjustment.create({ data: { tenantId: ta.id, systemId: SA.id, employeeId: eA1.id, periodKey: "2031-04", kind: "BONUS", amountSatang: 50_000, note: "QC HFT adjA" } });
  // แถวตกค้าง = จำลองการถูกโจมตีในอดีต (ร้าน B บนระบบ SA ของร้าน A)
  const fB = await P.hrEmployee.create({ data: { tenantId: tb.id, systemId: SA.id, name: RES_FAKE, pinCode: RES_PIN } });
  // R-F2: แถวตกค้างของ B บน SA ที่ 8 ปุ่มที่เหลือแตะได้ (เอกสาร · ใบลา 2 ใบ)
  await P.hrEmployeeDoc.create({ data: { tenantId: tb.id, systemId: SA.id, employeeId: fB.id, title: "QC HFT resDoc", url: "https://example.com/res.pdf" } });
  for (const n of ["QC HFT resLv1", "QC HFT resLv2"]) await P.hrLeave.create({ data: { tenantId: tb.id, systemId: SA.id, employeeId: fB.id, type: "PERSONAL", fromDate: new Date("2031-10-01T00:00:00Z"), toDate: new Date("2031-10-02T00:00:00Z"), reason: n } });
  await P.hrSalaryProfile.create({ data: { tenantId: tb.id, systemId: SA.id, employeeId: eA2.id, baseSalarySatang: RES_SALARY } });
  await P.hrPayrollRun.create({ data: { tenantId: tb.id, systemId: SA.id, periodKey: P2, payDate: new Date(`${P2}-28T00:00:00Z`), status: "DRAFT", note: "QC HFT residue run" } });
  for (const n of ["QC HFT resAdj1", "QC HFT resAdj2"]) await P.hrPayAdjustment.create({ data: { tenantId: tb.id, systemId: SA.id, employeeId: fB.id, periodKey: "2031-04", kind: "BONUS", amountSatang: 70_000, note: n } });
}

async function load(stamp: string): Promise<Fx> {
  const t = await tenantsOf(`${PREFIX}${stamp}-`);
  const A = t.find((x) => x.slug.endsWith("-a"))!.id, B = t.find((x) => x.slug.endsWith("-b"))!.id;
  const sysBy = async (tenantId: string, name: string) => (await P.appSystem.findFirst({ where: { tenantId, name }, select: { id: true } })).id as string;
  const SA = await sysBy(A, "QC HFT SA"), SAcc = await sysBy(A, "QC HFT บัญชี A"), SB = await sysBy(B, "QC HFT SB"), SN = await sysBy(B, "QC HFT SN");
  const id = async (m: string, where: Any) => (await P[m].findFirst({ where, select: { id: true } }))?.id as string;
  const eA1 = await id("hrEmployee", { tenantId: A, name: "QC HFT eA1" }), eA2 = await id("hrEmployee", { tenantId: A, name: "QC HFT eA2" });
  const actor = async (r: string, tenantId: string) => {
    const u = await P.user.findFirst({ where: { email: `${PREFIX}${stamp}-${r}@qc.invalid` }, select: { id: true } });
    return sessionFor(r.toUpperCase(), u.id, tenantId);
  };
  return {
    stamp, A, B, SA, SB, SN, SAcc, U: `c${randomBytes(16).toString("hex").slice(0, 24)}`,
    eA1, eA2,
    rA1: await id("hrPayrollRun", { tenantId: A, periodKey: P1 }), rA2: await id("hrPayrollRun", { tenantId: A, periodKey: "2031-02" }),
    adjA: await id("hrPayAdjustment", { tenantId: A, note: "QC HFT adjA" }),
    fB: await id("hrEmployee", { tenantId: B, name: RES_FAKE }),
    resProfile: await id("hrSalaryProfile", { tenantId: B, systemId: SA, employeeId: eA2 }),
    resRun: await id("hrPayrollRun", { tenantId: B, systemId: SA, periodKey: P2 }),
    resAdj1: await id("hrPayAdjustment", { tenantId: B, note: "QC HFT resAdj1" }), resAdj2: await id("hrPayAdjustment", { tenantId: B, note: "QC HFT resAdj2" }),
    resDoc: await id("hrEmployeeDoc", { tenantId: B, title: "QC HFT resDoc" }),
    resLv1: await id("hrLeave", { tenantId: B, reason: "QC HFT resLv1" }), resLv2: await id("hrLeave", { tenantId: B, reason: "QC HFT resLv2" }),
    OA: await actor("oa", A), AP: await actor("ap", A), XO: await actor("xo", B), XP: await actor("xp", B), XM: await actor("xm", B),
  };
}

// ═════════════ ภาพถ่ายก่อน/หลัง (§5): แถว + ลายนิ้วมือ ต่อร้าน · + แถวบน SA ที่ไม่ใช่ของ A ═════════════
const SNAP_TABLES = ["HrSalaryProfile", "HrPayrollRun", "HrPayrollItem", "HrPayAdjustment", "HrEmployee", "Party", "HrAttendance", "HrLeave", "AuditLog", "OutboxEvent", "HrEmployeeDoc", "HrWorkSchedule"];
const SA_TABLES = ["HrSalaryProfile", "HrPayrollRun", "HrPayrollItem", "HrPayAdjustment", "HrEmployee", "HrAttendance", "HrLeave", "HrEmployeeDoc", "HrWorkSchedule"];
/** ตารางที่มี employeeId — ใช้ตรวจ "แถวของ B อ้างพนักงานของ A" (T9) */
const EMP_REF_TABLES = ["HrSalaryProfile", "HrPayrollItem", "HrPayAdjustment", "HrAttendance", "HrLeave", "HrEmployeeDoc", "HrWorkSchedule"];
type Snap = Map<string, string>;
async function snap(fx: Fx): Promise<Snap> {
  const parts: string[] = [];
  for (const t of SNAP_TABLES) parts.push(`SELECT '${t}:'||(CASE WHEN x."tenantId"=$1 THEN 'A' ELSE 'B' END) AS k, count(*)::text||'/'||coalesce(md5(string_agg(x::text,'|' ORDER BY x.id)),'') AS v FROM "${t}" x WHERE x."tenantId" IN ($1,$2) GROUP BY 1`);
  parts.push(`SELECT 'crossSA' AS k, (${SA_TABLES.map((t) => `(SELECT count(*) FROM "${t}" WHERE "systemId"=$3 AND "tenantId"<>$1)`).join("+")})::text AS v`);
  const rows = (await P.$queryRawUnsafe(parts.join(" UNION ALL "), fx.A, fx.B, fx.SA)) as { k: string; v: string }[];
  return new Map(rows.map((r) => [r.k, r.v]));
}
const delta = (a: Snap, b: Snap) => [...new Set([...a.keys(), ...b.keys()])].filter((k) => a.get(k) !== b.get(k)).sort();
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
async function call(actor: Actor, path: string, fn: () => Promise<unknown>): Promise<string> {
  const err = console.error;
  console.error = () => undefined;
  try { return `R:${short(await inScope(actor.cookie, path, fn) ?? null, 240)}`; }
  catch (e) { const x = e as Any; return `X:${x?.code ?? x?.name ?? "Error"}:${String(x?.message ?? e).replace(/\s+/g, " ").slice(0, 120)}`; }
  finally { console.error = err; }
}
type Drive = { res: string; d: string[] };
async function drive(fx: Fx, actor: Actor, fn: () => Promise<unknown>): Promise<Drive> {
  const s0 = await snap(fx);
  const res = await call(actor, `/app/sys/${fx.SA}/hr`, fn);
  return { res, d: delta(s0, await snap(fx)) };
}
// ตาราง T6: key = ปุ่ม|ผู้กด|ฟอร์ม → ผลต่อระบบ (SA/U/SN)
const T6 = new Map<string, Record<string, string>>();
const t6put = (k: string, sysLabel: string, r: Drive) => { const m = T6.get(k) ?? {}; m[sysLabel] = `${r.res} Δ[${r.d.map((x) => x.split(":")[0]).join(",")}]`; T6.set(k, m); };
const sysList = (fx: Fx) => [["SA", fx.SA], ["U", fx.U], ["SN", fx.SN]] as const;

// ═════════════ M1–M5 ═════════════
async function runM(fx: Fx): Promise<void> {
  const idx = (await P.$queryRawUnsafe(`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = current_schema() AND tablename IN ('HrSalaryProfile','HrPayrollRun')`)) as { indexname: string; indexdef: string }[];
  const def = (n: string) => idx.find((i) => i.indexname === n)?.indexdef ?? "";
  const p = def("HrSalaryProfile_tenantId_systemId_employeeId_key"), r = def("HrPayrollRun_tenantId_systemId_periodKey_key");
  const old = idx.filter((i) => ["HrSalaryProfile_systemId_employeeId_key", "HrPayrollRun_systemId_periodKey_key"].includes(i.indexname)).map((i) => i.indexname);
  chk("M1", /^CREATE UNIQUE INDEX .* USING btree \("tenantId", "systemId", "employeeId"\)$/.test(p) && /^CREATE UNIQUE INDEX .* USING btree \("tenantId", "systemId", "periodKey"\)$/.test(r) && old.length === 0,
    `new profile=${p || "ไม่มี"} · new run=${r || "ไม่มี"} · old=${old.join(",") || "ไม่มี"}`);

  const res4 = async () => ({
    p: await P.hrSalaryProfile.findUnique({ where: { id: fx.resProfile ?? "-" }, select: { tenantId: true, systemId: true, employeeId: true, baseSalarySatang: true } }),
    r: await P.hrPayrollRun.findUnique({ where: { id: fx.resRun ?? "-" }, select: { tenantId: true, systemId: true, periodKey: true, status: true, note: true } }),
    e: await P.hrEmployee.findUnique({ where: { id: fx.fB ?? "-" }, select: { tenantId: true, systemId: true, name: true, active: true } }),
  });
  const before = short(await res4(), 2000);

  // M3 — ซ้ำในร้าน A เอง
  const code = async (f: () => Promise<unknown>) => { try { await f(); return "CREATED"; } catch (e) { return (e as Any)?.code ?? (e as Error).message.slice(0, 60); } };
  const d1 = await code(() => P.hrSalaryProfile.create({ data: { tenantId: fx.A, systemId: fx.SA, employeeId: fx.eA1, baseSalarySatang: 1 } }));
  const d2 = await code(() => P.hrPayrollRun.create({ data: { tenantId: fx.A, systemId: fx.SA, periodKey: P1, payDate: new Date(`${P1}-28T00:00:00Z`) } }));
  chk("M3", d1 === "P2002" && d2 === "P2002", `profile=${d1} run=${d2}`);

  // M2 — เจ้าของ A ผ่านปุ่มจริง
  const r1 = await call(fx.OA, `/app/sys/${fx.SA}/hr/payroll`, () => PA.setSalaryProfileAction(fd({ systemId: fx.SA, employeeId: fx.eA2, baseSalaryBaht: "20000", children: "0", ssoEligible: "on" })));
  const r2 = await call(fx.OA, `/app/sys/${fx.SA}/hr/payroll`, () => PA.createPayrollRunAction(fd({ systemId: fx.SA, periodKey: P2, payDate: `${P2}-28` })));
  const prof = await P.hrSalaryProfile.findFirst({ where: { tenantId: fx.A, systemId: fx.SA, employeeId: fx.eA2 }, select: { baseSalarySatang: true } });
  const run = await P.hrPayrollRun.findFirst({ where: { tenantId: fx.A, systemId: fx.SA, periodKey: P2 }, select: { status: true, _count: { select: { items: true } } } });
  chk("M2", prof?.baseSalarySatang === 2_000_000 && run?.status === "DRAFT" && run._count.items >= 2, `setProfile=${r1} → ${short(prof)} · createRun=${r2} → ${short(run)}`);

  const after = short(await res4(), 2000);
  chk("M4", before === after && after.includes(String(RES_SALARY)) && after.includes(RES_FAKE) && after.includes(P2), `before=${before} · after=${after}`);

  let out = "";
  try { out = execFileSync("pnpm", ["exec", "prisma", "migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
  catch (e) { out = `FAILED ${(e as Any)?.stdout ?? ""}${(e as Any)?.stderr ?? ""}`; }
  const tables = [...out.matchAll(/the `([A-Za-z0-9_]+)` table/g)].map((m) => m[1]!);
  chk("M5", !out.startsWith("FAILED") && tables.every((t) => t === "DormUtilityRate") && !/\bHr[A-Z]/.test(out), `changed tables=${[...new Set(tables)].join(",") || "none"} · ${out.replace(/\s+/g, " ").slice(0, 300)}`);
}

// ═════════════ C1–C3 (ร้าน A) ═════════════
async function runC(fx: Fx): Promise<void> {
  const bad: string[] = [];
  const ok = (cond: unknown, msg: string) => { if (!cond) bad.push(msg); };
  const path = `/app/sys/${fx.SA}/hr`;
  const audit = (action: string, targetId: string) => P.auditLog.count({ where: { tenantId: fx.A, action, targetId } });
  const name = `QC HFT C1 ${fx.stamp}`;
  // E1 create
  let r = await call(fx.OA, path, () => EA.createEmployeeAction(fd({ systemId: fx.SA, name, phone: `08${String(Date.now()).slice(-8)}`, position: "พนักงานทดสอบ", pinCode: "" })));
  const e = await P.hrEmployee.findFirst({ where: { tenantId: fx.A, systemId: fx.SA, name }, select: { id: true, partyId: true } });
  ok(e && e.partyId, `E1 create ${r} → ${short(e)}`);
  const eid = e?.id ?? "-";
  // E2 update
  r = await call(fx.AP, path, () => EA.updateEmployeeAction(fd({ systemId: fx.SA, employeeId: eid, name: `${name} แก้`, position: "หัวหน้า", phone: "0811111111" })));
  ok((await P.hrEmployee.findUnique({ where: { id: eid }, select: { name: true } }))?.name === `${name} แก้`, `E2 update ${r}`);
  // E3 remove / E4 restore
  r = await call(fx.OA, path, () => EA.removeEmployeeAction(fd({ systemId: fx.SA, employeeId: eid })));
  ok((await P.hrEmployee.findUnique({ where: { id: eid }, select: { active: true } }))?.active === false, `E3 remove ${r}`);
  r = await call(fx.AP, path, () => EA.restoreEmployeeAction(fd({ systemId: fx.SA, employeeId: eid })));
  ok((await P.hrEmployee.findUnique({ where: { id: eid }, select: { active: true } }))?.active === true, `E4 restore ${r}`);
  // P1 set profile
  r = await call(fx.AP, path, () => PA.setSalaryProfileAction(fd({ systemId: fx.SA, employeeId: eid, baseSalaryBaht: "25,000", children: "1", spouse: "on", ssoEligible: "on", taxId: "1234567890123" })));
  ok((await P.hrSalaryProfile.findFirst({ where: { tenantId: fx.A, systemId: fx.SA, employeeId: eid }, select: { baseSalarySatang: true } }))?.baseSalarySatang === 2_500_000, `P1 setProfile ${r}`);
  // P6 request (2 แถว) → P7 decide · P8 cancel
  const PC = "2031-05";
  const req = (kind: string, amt: string) => call(fx.AP, path, () => PA.requestAdjustmentAction(fx.SA, { status: "idle" }, fd({ employeeId: eid, periodKey: PC, kind, amountBaht: amt, hours: "", note: `QC HFT C1 ${kind}` })));
  const q1 = await req("BONUS", "1000"), q2 = await req("DEDUCTION", "100");
  const adj = await P.hrPayAdjustment.findMany({ where: { tenantId: fx.A, systemId: fx.SA, employeeId: eid, periodKey: PC }, select: { id: true, kind: true, status: true, requestedById: true } });
  const bonus = adj.find((a: Any) => a.kind === "BONUS"), ded = adj.find((a: Any) => a.kind === "DEDUCTION");
  ok(q1.includes(`"status":"ok"`) && q2.includes(`"status":"ok"`) && bonus?.requestedById === fx.AP.userId && ded, `P6 request ${q1} · ${q2} → ${short(adj)}`);
  r = await call(fx.OA, path, () => PA.decideAdjustmentAction(fd({ systemId: fx.SA, id: bonus?.id ?? "-", status: "APPROVED" })));
  ok(r.includes(`"ok":true`) && (await P.hrPayAdjustment.findUnique({ where: { id: bonus?.id ?? "-" }, select: { status: true } }))?.status === "APPROVED" && (await audit("hr.payadjust.approve", bonus?.id ?? "-")) === 1, `P7 decide ${r}`);
  r = await call(fx.OA, path, () => PA.cancelAdjustmentAction(fd({ systemId: fx.SA, id: ded?.id ?? "-" })));
  ok(r.includes(`"ok":true`) && !(await P.hrPayAdjustment.findUnique({ where: { id: ded?.id ?? "-" } })) && (await audit("hr.payadjust.delete", ded?.id ?? "-")) === 1, `P8 cancel ${r}`);
  // P2 create run → P3 approve (ลงบัญชีจริง) → P5 markPaid → P4 reverse
  r = await call(fx.AP, path, () => PA.createPayrollRunAction(fd({ systemId: fx.SA, periodKey: PC, payDate: `${PC}-31` })));
  const run = await P.hrPayrollRun.findFirst({ where: { tenantId: fx.A, systemId: fx.SA, periodKey: PC }, select: { id: true, status: true, totalAddSatang: true, _count: { select: { items: true } } } });
  ok(run?.status === "DRAFT" && run._count.items >= 2 && run.totalAddSatang === 100_000, `P2 createRun ${r} → ${short(run)}`);
  const rid = run?.id ?? "-";
  r = await call(fx.OA, path, () => PA.approvePayrollRunAction(fd({ systemId: fx.SA, runId: rid })));
  const ap = await P.hrPayrollRun.findUnique({ where: { id: rid }, select: { status: true, journalEntryId: true } });
  ok(ap?.status === "APPROVED" && ap.journalEntryId && (await audit("hr.payroll.approve", rid)) === 1, `P3 approve ${r} → ${short(ap)}`);
  r = await call(fx.AP, path, () => PA.markPaidAction(fd({ systemId: fx.SA, runId: rid })));
  const paid = await P.hrPayrollRun.findUnique({ where: { id: rid }, select: { status: true } });
  const ob = await P.outboxEvent.count({ where: { tenantId: fx.A, type: "hr.payroll.paid", idempotencyKey: `hr.payroll.paid#${rid}` } });
  ok(paid?.status === "PAID" && ob === 1 && (await audit("hr.payroll.pay", rid)) === 1, `P5 markPaid ${r} → ${short(paid)} outbox=${ob}`);
  r = await call(fx.OA, path, () => PA.reverseRunAction(fd({ systemId: fx.SA, runId: rid, reason: "QC HFT กลับรายการ" })));
  ok((await P.hrPayrollRun.findUnique({ where: { id: rid }, select: { status: true } }))?.status === "REVERSED" && (await audit("hr.payroll.reverse", rid)) === 1, `P4 reverse ${r}`);
  // clock + requestLeave
  r = await call(fx.AP, path, () => EA.clockAction(fd({ systemId: fx.SA, employeeId: eid, kind: "IN" })));
  ok((await P.hrAttendance.count({ where: { tenantId: fx.A, systemId: fx.SA, employeeId: eid } })) === 1, `clock ${r}`);
  r = await call(fx.AP, path, () => EA.requestLeaveAction(fd({ systemId: fx.SA, employeeId: eid, type: "SICK", fromDate: "2031-06-01", toDate: "2031-06-02", reason: "QC HFT ลาป่วย" })));
  const lv = await P.hrLeave.findFirst({ where: { tenantId: fx.A, systemId: fx.SA, employeeId: eid }, select: { id: true, status: true } });
  ok(lv?.status === "PENDING" && (await P.outboxEvent.count({ where: { tenantId: fx.A, type: "hr.leave.submitted", idempotencyKey: `hr.leave.submitted#${lv.id}` } })) === 1, `requestLeave ${r} → ${short(lv)}`);
  chk("C1", bad.length === 0 && SCOPE_RUNS > 0, bad.join(" · "));

  // C4 (R-F2 control) — 8 ปุ่มที่เหลือ กับพนักงาน eid ของ A เอง (ฟอร์มครบ ถึงการเขียนจริง)
  const c4: string[] = [];
  const idle = { status: "idle" };
  r = await call(fx.OA, path, () => EA.saveEmployeeProfileAction(fx.SA, eid, idle, fd({ name: `${name} โปรไฟล์`, nickname: "ซี", phone: "0812345678", email: "c4@qc.invalid", birthDate: "1991-02-03", position: "พนักงาน", department: "ขาย", startDate: "2030-01-01", addressLine: "1 ถนนทดสอบ", subdistrict: "ก", district: "ข", province: "ค", postcode: "10110", emergencyName: "ญาติ", emergencyPhone: "0800000001", emergencyRelation: "พี่", note: "QC HFT C4", nationalId: "1101700203451", ssoNumber: "1101700203451", bankName: "KBANK", bankAccountNo: "1234567890", bankAccountName: "ซี" })));
  const prof4 = await P.hrEmployee.findUnique({ where: { id: eid }, select: { name: true, nationalId: true } });
  if (!(r.includes(`"status":"ok"`) && prof4?.name === `${name} โปรไฟล์` && prof4?.nationalId === "1101700203451")) c4.push(`saveProfile ${r} → ${short(prof4)}`);
  r = await call(fx.OA, path, () => EA.addEmployeeDocAction(fd({ systemId: fx.SA, employeeId: eid, kind: "OTHER", title: "QC HFT C4 doc", url: "https://example.com/c4.pdf", note: "c4" })));
  const doc4 = await P.hrEmployeeDoc.findFirst({ where: { tenantId: fx.A, systemId: fx.SA, employeeId: eid, title: "QC HFT C4 doc" }, select: { id: true } });
  if (!doc4) c4.push(`addDoc ${r}`);
  r = await call(fx.OA, path, () => EA.removeEmployeeDocAction(fd({ systemId: fx.SA, employeeId: eid, docId: doc4?.id ?? "-" })));
  if (!doc4 || (await P.hrEmployeeDoc.count({ where: { id: doc4.id } })) !== 0) c4.push(`removeDoc ${r}`);
  r = await call(fx.AP, path, () => EA.setPinAction(fx.SA, eid, idle, fd({ pin: "2468" })));
  if (!(r.includes(`"status":"ok"`) && (await P.hrEmployee.findUnique({ where: { id: eid }, select: { pinCode: true } }))?.pinCode === "2468")) c4.push(`setPin ${r}`);
  const att0 = await P.hrAttendance.count({ where: { tenantId: fx.A, systemId: fx.SA, employeeId: eid } });
  r = await call(fx.AP, path, () => EA.kioskClockAction(fx.SA, idle, fd({ employeeId: eid, pin: "2468" })));
  if (!(r.includes(`"status":"ok"`) && (await P.hrAttendance.count({ where: { tenantId: fx.A, systemId: fx.SA, employeeId: eid } })) === att0 + 1)) c4.push(`kioskClock ${r}`);
  r = await call(fx.AP, path, () => EA.setWorkScheduleAction(fd({ systemId: fx.SA, employeeId: eid, "on-1": "on", "start-1": "09:00", "end-1": "18:00", "on-6": "on", "off-6": "on", graceMin: "15" })));
  const sch4 = await P.hrWorkSchedule.findMany({ where: { tenantId: fx.A, systemId: fx.SA, employeeId: eid }, select: { weekday: true, dayOff: true, startMin: true } });
  if (!(sch4.length === 2 && sch4.some((x: Any) => x.weekday === 1 && x.startMin === 540 && !x.dayOff) && sch4.some((x: Any) => x.weekday === 6 && x.dayOff))) c4.push(`setSchedule ${r} → ${short(sch4)}`);
  r = await call(fx.OA, path, () => EA.decideLeaveAction(fd({ systemId: fx.SA, leaveId: lv?.id ?? "-", status: "APPROVED" })));
  if ((await P.hrLeave.findUnique({ where: { id: lv?.id ?? "-" }, select: { status: true } }))?.status !== "APPROVED") c4.push(`decideLeave ${r}`);
  await call(fx.AP, path, () => EA.requestLeaveAction(fd({ systemId: fx.SA, employeeId: eid, type: "PERSONAL", fromDate: "2031-06-10", toDate: "2031-06-11", reason: "QC HFT C4 bulk" })));
  const lv2 = await P.hrLeave.findFirst({ where: { tenantId: fx.A, employeeId: eid, reason: "QC HFT C4 bulk" }, select: { id: true } });
  r = await call(fx.OA, path, () => EA.bulkDecideLeaveAction(fx.SA, idle, (() => { const f = fd({ status: "REJECTED" }); f.append("leaveIds", lv2?.id ?? "-"); return f; })()));
  if (!(r.includes(`"done":1`) && (await P.hrLeave.findUnique({ where: { id: lv2?.id ?? "-" }, select: { status: true } }))?.status === "REJECTED")) c4.push(`bulkDecideLeave ${r}`);
  chk("C4", c4.length === 0, c4.join(" · "));

  // C2 — ระบบตัวเอง + runId ไม่มีจริง ⇒ audit ปฏิเสธเดิม 1 แถว/ครั้ง
  const c2: string[] = [];
  for (const [nm, fn, action] of [
    ["approve", PA.approvePayrollRunAction, "hr.payroll.approve"],
    ["reverse", PA.reverseRunAction, "hr.payroll.reverse"],
    ["markPaid", PA.markPaidAction, "hr.payroll.pay"],
  ] as const) {
    const ghost = `c${randomBytes(16).toString("hex").slice(0, 24)}`;
    const d = await drive(fx, fx.OA, () => (fn as Any)(fd({ systemId: fx.SA, runId: ghost, reason: "QC HFT" })));
    const n = await audit(action, ghost);
    if (!(d.res === "R:null" && n === 1 && d.d.join() === "AuditLog:A")) c2.push(`${nm}: ${d.res} audit=${n} Δ=${d.d.join(",")}`);
  }
  chk("C2", c2.length === 0, c2.join(" · "));

  // C3 — ระบบตัวเอง + employee ไม่มีจริง บน set-profile
  const ghostE = `c${randomBytes(16).toString("hex").slice(0, 24)}`;
  const c3 = await drive(fx, fx.OA, () => PA.setSalaryProfileAction(fd({ systemId: fx.SA, employeeId: ghostE, baseSalaryBaht: "15000", ssoEligible: "on" })));
  chk("C3", c3.d.length === 0 && c3.res === "R:null", `${c3.res} Δ=${c3.d.join(",")}`);
}

// ═════════════ T1–T6, T8 (ร้าน B โจมตี) ═════════════
async function runT(fx: Fx): Promise<void> {
  const fails: Record<string, string[]> = { T1: [], T2: [], T3: [], T4: [], T5: [], T8: [] };
  const rec = (id: string, key: string, sysLabel: string, r: Drive) => {
    t6put(key, sysLabel, r);
    if (r.d.length) fails[id]!.push(`${key}@${sysLabel}: Δ=${r.d.join(",")} ${r.res}`);
  };
  const ghost = `c${randomBytes(16).toString("hex").slice(0, 24)}`;
  // T1 setSalaryProfile
  for (const a of [fx.XO, fx.XP]) {
    for (const [el, e] of [["ghost", ghost], ["eA2", fx.eA2], ["eA1", fx.eA1]] as const) for (const [sl, s] of sysList(fx)) {
      const r = await drive(fx, a, () => PA.setSalaryProfileAction(fd({ systemId: s, employeeId: e, baseSalaryBaht: "99999", children: "2", spouse: "on", ssoEligible: "on", taxId: "1111111111111" })));
      rec("T1", `setProfile|${a.label}|emp=${el}`, sl, r);
    }
  }
  // T2 createPayrollRun
  for (const a of [fx.XO, fx.XP]) for (const [sl, s] of sysList(fx)) rec("T2", `createRun|${a.label}`, sl, await drive(fx, a, () => PA.createPayrollRunAction(fd({ systemId: s, periodKey: "2031-07", payDate: "2031-07-31" }))));
  // T3 approve / markPaid / reverse × rA1 · rA2 · รอบตกค้าง
  for (const a of [fx.XO, fx.XP]) for (const [rl, rid] of [["rA1", fx.rA1], ["rA2", fx.rA2], ["resRun", fx.resRun]] as const) {
    for (const [nm, fn] of [["approve", PA.approvePayrollRunAction], ["markPaid", PA.markPaidAction], ["reverse", PA.reverseRunAction]] as const) {
      for (const [sl, s] of sysList(fx)) rec("T3", `${nm}|${a.label}|${rl}`, sl, await drive(fx, a, () => (fn as Any)(fd({ systemId: s, runId: rid, reason: "QC HFT โจมตี" }))));
    }
  }
  // T4 adjustments
  const t4resp: string[] = [];
  for (const a of [fx.XO, fx.XP, fx.XM]) for (const [el, eid] of [["fB", fx.fB], ["eA1", fx.eA1]] as const) {
    for (const [fl, form] of [["BONUS", { kind: "BONUS", amountBaht: "5000", hours: "" }], ["OT-hours", { kind: "OT", amountBaht: "", hours: "4" }]] as const) {
      for (const [sl, s] of sysList(fx)) rec("T4", `requestAdj|${a.label}|${el}|${fl}`, sl, await drive(fx, a, () => PA.requestAdjustmentAction(s, { status: "idle" }, fd({ employeeId: eid, periodKey: "2031-08", ...form, note: "QC HFT โจมตี" }))));
    }
  }
  for (const [nm, fn, actor] of [["decideAdj", PA.decideAdjustmentAction, fx.XO], ["cancelAdj", PA.cancelAdjustmentAction, fx.XP]] as const) {
    for (const [il, id] of [["res1", fx.resAdj1], ["res2", fx.resAdj2], ["adjA", fx.adjA]] as const) {
      for (const [sl, s] of sysList(fx)) rec("T4", `${nm}|${actor.label}|${il}`, sl, await drive(fx, actor, () => (fn as Any)(fd({ systemId: s, id, status: "APPROVED" }))));
    }
  }
  for (const [k, m] of T6) if (/^(requestAdj|decideAdj|cancelAdj)\|/.test(k) && m.SA !== m.U) t4resp.push(`${k}: SA=${m.SA} ≠ U=${m.U}`);
  // T5 พนักงาน 4 ปุ่ม
  for (const a of [fx.XO, fx.XP]) for (const [sl, s] of sysList(fx)) {
    rec("T5", `createEmp|${a.label}`, sl, await drive(fx, a, () => EA.createEmployeeAction(fd({ systemId: s, name: `QC HFT ปลอม ${a.label}`, phone: `0899${a.label === "XO" ? "11" : "22"}3344`, position: "x", pinCode: "" }))));
  }
  for (const [el, eid] of [["fB", fx.fB], ["eA1", fx.eA1]] as const) for (const [sl, s] of sysList(fx)) {
    rec("T5", `updateEmp|XO|${el}`, sl, await drive(fx, fx.XO, () => EA.updateEmployeeAction(fd({ systemId: s, employeeId: eid, name: "QC HFT ถูกแก้", position: "y", phone: "0800000000" }))));
    rec("T5", `removeEmp|XP|${el}`, sl, await drive(fx, fx.XP, () => EA.removeEmployeeAction(fd({ systemId: s, employeeId: eid }))));
    rec("T5", `restoreEmp|XO|${el}`, sl, await drive(fx, fx.XO, () => EA.restoreEmployeeAction(fd({ systemId: s, employeeId: eid }))));
  }
  // T8 clock + requestLeave
  for (const [el, eid] of [["fB", fx.fB], ["eA1", fx.eA1]] as const) for (const [sl, s] of sysList(fx)) {
    rec("T8", `clock|XP|${el}`, sl, await drive(fx, fx.XP, () => EA.clockAction(fd({ systemId: s, employeeId: eid, kind: "IN" }))));
    rec("T8", `requestLeave|XO|${el}`, sl, await drive(fx, fx.XO, () => EA.requestLeaveAction(fd({ systemId: s, employeeId: eid, type: "VACATION", fromDate: "2031-09-01", toDate: "2031-09-02", reason: "QC HFT โจมตี" }))));
  }
  const show = (a: string[]) => `${a.length} จุด: ${a.slice(0, 6).join(" | ")}${a.length > 6 ? " | …" : ""}`;
  chk("T1", fails.T1!.length === 0, show(fails.T1!));
  chk("T2", fails.T2!.length === 0, show(fails.T2!));
  chk("T3", fails.T3!.length === 0, show(fails.T3!));
  chk("T4", fails.T4!.length === 0 && t4resp.length === 0, show([...fails.T4!, ...t4resp]));
  chk("T5", fails.T5!.length === 0, show(fails.T5!));
  const t6 = [...T6].filter(([, m]) => !(m.SA === m.U && m.U === m.SN)).map(([k, m]) => `${k}: SA=${m.SA} · U=${m.U} · SN=${m.SN}`);
  chk("T6", t6.length === 0 && T6.size > 0, `${t6.length}/${T6.size} ไม่เท่ากัน: ${t6.slice(0, 5).join(" | ")}`);
  chk("T8", fails.T8!.length === 0, show(fails.T8!));

  // ── T9 (R-F1): ระบบของผู้โจมตีเอง (SB) + รหัสพนักงานของ A ──
  const t9: string[] = [];
  const ghostE = `c${randomBytes(16).toString("hex").slice(0, 24)}`;
  for (const a of [fx.XO, fx.XP]) {
    for (const [nm, mk] of [
      ["clock", (e: string) => () => EA.clockAction(fd({ systemId: fx.SB, employeeId: e, kind: "IN" }))],
      ["requestLeave", (e: string) => () => EA.requestLeaveAction(fd({ systemId: fx.SB, employeeId: e, type: "SICK", fromDate: "2031-11-01", toDate: "2031-11-02", reason: "QC HFT T9" }))],
    ] as const) {
      const ref = await drive(fx, a, mk(ghostE));
      if (ref.d.length) t9.push(`${nm}|${a.label}|ghost@SB: Δ=${ref.d.join(",")} ${ref.res}`);
      for (const [el, eid] of [["eA1", fx.eA1], ["eA2", fx.eA2]] as const) {
        const r = await drive(fx, a, mk(eid));
        if (r.d.length) t9.push(`${nm}|${a.label}|${el}@SB: Δ=${r.d.join(",")} ${r.res}`);
        else if (r.res !== ref.res) t9.push(`${nm}|${a.label}|${el}@SB: ${r.res} ≠ ghost ${ref.res}`);
      }
    }
  }
  const refsQ = EMP_REF_TABLES.map((t) => `SELECT '${t}' AS t, x.id FROM "${t}" x JOIN "HrEmployee" e ON e.id = x."employeeId" WHERE x."tenantId" = $1 AND e."tenantId" = $2`).join(" UNION ALL ");
  const refs = ((await P.$queryRawUnsafe(refsQ, fx.B, fx.A)) as { t: string; id: string }[]).filter((r) => r.id !== fx.resProfile);
  if (refs.length) t9.push(`แถวของ B ที่อ้างพนักงานของ A: ${refs.map((r) => r.t).join(",")}`);
  chk("T9", t9.length === 0, show(t9));

  // ── T10 (R-F2): 8 ปุ่มที่เหลือ บน SA ด้วยแถวตกค้างของ B (fB · resDoc · resLv1/2) เทียบกับรหัสที่ไม่มี ──
  const t10: string[] = [];
  const gh = () => `c${randomBytes(16).toString("hex").slice(0, 24)}`;
  const idle = { status: "idle" };
  const profileForm = (n: string) => fd({ name: n, nickname: "ปลอม", phone: "0812345678", email: "x@qc.invalid", birthDate: "1990-01-15", position: "พนักงาน", department: "ขาย", startDate: "2030-01-01", addressLine: "1 ถนนทดสอบ", subdistrict: "ก", district: "ข", province: "ค", postcode: "10110", emergencyName: "ญาติ", emergencyPhone: "0800000001", emergencyRelation: "พี่", note: "QC HFT", nationalId: "1101700203451", ssoNumber: "1101700203451", bankName: "KBANK", bankAccountNo: "1234567890", bankAccountName: "ปลอม" });
  const T10_CASES: [string, (res: boolean) => () => Promise<unknown>][] = [
    ["saveProfile", (res) => () => EA.saveEmployeeProfileAction(fx.SA, res ? fx.fB : gh(), idle, profileForm("QC HFT ถูกแก้โปรไฟล์"))],
    ["addDoc", (res) => () => EA.addEmployeeDocAction(fd({ systemId: fx.SA, employeeId: res ? fx.fB : gh(), kind: "OTHER", title: "QC HFT เอกสารปลอม", url: "https://example.com/x.pdf", note: "x" }))],
    ["removeDoc", (res) => () => EA.removeEmployeeDocAction(fd({ systemId: fx.SA, employeeId: fx.fB, docId: res ? fx.resDoc : gh() }))],
    ["kioskClock", (res) => () => EA.kioskClockAction(fx.SA, idle, fd({ employeeId: res ? fx.fB : gh(), pin: RES_PIN }))],
    ["setPin", (res) => () => EA.setPinAction(fx.SA, res ? fx.fB : gh(), idle, fd({ pin: "13579" }))],
    ["decideLeave", (res) => () => EA.decideLeaveAction(fd({ systemId: fx.SA, leaveId: res ? fx.resLv1 : gh(), status: "APPROVED" }))],
    ["bulkDecideLeave", (res) => () => EA.bulkDecideLeaveAction(fx.SA, idle, (() => { const f = fd({ status: "REJECTED" }); f.append("leaveIds", res ? fx.resLv2 : gh()); return f; })())],
    ["setSchedule", (res) => () => EA.setWorkScheduleAction(fd({ systemId: fx.SA, employeeId: res ? fx.fB : gh(), "on-1": "on", "start-1": "08:00", "end-1": "17:00", "on-2": "on", "off-2": "on", graceMin: "10" }))],
  ];
  // ปุ่มที่คืนข้อความของรหัสที่ส่งมา (bulk) — แทนรหัสด้วย <id> ก่อนเทียบ
  const norm = (r: string) => r.replace(/c[a-z0-9]{24}/g, "<id>");
  for (const [nm, mk] of T10_CASES) {
    const g = await drive(fx, fx.XO, mk(false));
    const r = await drive(fx, fx.XO, mk(true));
    if (g.d.length) t10.push(`${nm}|ghost@SA: Δ=${g.d.join(",")} ${g.res}`);
    if (r.d.length) t10.push(`${nm}|residue@SA: Δ=${r.d.join(",")} ${r.res}`);
    else if (norm(r.res) !== norm(g.res)) t10.push(`${nm}: residue ${r.res} ≠ ghost ${g.res}`);
  }
  chk("T10", t10.length === 0, show(t10));

  // ── T11 (R-R2-1): ค่าไม่ใช่สตริงในอาร์กิวเมนต์ตรง (ไปถึง where ของ Prisma เป็นตัวกรอง) ──
  const t11: string[] = [];
  const OPS: [string, Any][] = [["not", { not: "zzz" }], ["startsWith", { startsWith: "" }]];
  const lvForm = (id: string) => { const f = fd({ status: "REJECTED" }); f.append("leaveIds", id); return f; };
  const T11_CASES: [string, () => () => Promise<unknown>, [string, () => Promise<unknown>][]][] = [
    ["requestAdj", () => () => PA.requestAdjustmentAction(fx.SA, idle, fd({ employeeId: gh(), periodKey: "2031-08", kind: "BONUS", amountBaht: "5000", hours: "", note: "QC HFT T11" })),
      OPS.map(([o, v]) => [`sys=${o}`, () => PA.requestAdjustmentAction(v, idle, fd({ employeeId: fx.fB, periodKey: "2031-08", kind: "BONUS", amountBaht: "5000", hours: "", note: "QC HFT T11" }))])],
    ["saveProfile", () => () => EA.saveEmployeeProfileAction(fx.SA, gh(), idle, profileForm("QC HFT T11")),
      OPS.flatMap(([o, v]) => [[`sys=${o}`, () => EA.saveEmployeeProfileAction(v, fx.fB, idle, profileForm("QC HFT T11"))], [`sys=${o},emp=${o}`, () => EA.saveEmployeeProfileAction(v, v, idle, profileForm("QC HFT T11"))], [`emp=${o}`, () => EA.saveEmployeeProfileAction(fx.SA, v, idle, profileForm("QC HFT T11"))]] as [string, () => Promise<unknown>][])],
    ["setPin", () => () => EA.setPinAction(fx.SA, gh(), idle, fd({ pin: "24680" })),
      OPS.flatMap(([o, v]) => [[`sys=${o}`, () => EA.setPinAction(v, fx.fB, idle, fd({ pin: "24680" }))], [`sys=${o},emp=${o}`, () => EA.setPinAction(v, v, idle, fd({ pin: "24680" }))], [`emp=${o}`, () => EA.setPinAction(fx.SA, v, idle, fd({ pin: "24680" }))]] as [string, () => Promise<unknown>][])],
    ["kioskClock", () => () => EA.kioskClockAction(fx.SA, idle, fd({ employeeId: gh(), pin: RES_PIN })),
      OPS.map(([o, v]) => [`sys=${o}`, () => EA.kioskClockAction(v, idle, fd({ employeeId: fx.fB, pin: RES_PIN }))])],
    ["bulkDecideLeave", () => () => EA.bulkDecideLeaveAction(fx.SA, idle, lvForm(gh())),
      OPS.map(([o, v]) => [`sys=${o}`, () => EA.bulkDecideLeaveAction(v, idle, lvForm(fx.resLv2))])],
  ];
  for (const [nm, ghostFn, variants] of T11_CASES) {
    const g = await drive(fx, fx.XO, ghostFn());
    if (g.d.length) t11.push(`${nm}|ghost@SA: Δ=${g.d.join(",")} ${g.res}`);
    for (const [vl, fn] of variants) {
      const r = await drive(fx, fx.XO, fn);
      if (r.d.length) t11.push(`${nm}|${vl}: Δ=${r.d.join(",")} ${r.res}`);
      else if (r.res.startsWith("X:")) t11.push(`${nm}|${vl}: throw ${r.res}`);
      else if (norm(r.res) !== norm(g.res)) t11.push(`${nm}|${vl}: ${r.res} ≠ ghost ${g.res}`);
    }
  }
  chk("T11", t11.length === 0, `${t11.length} จุด: ${t11.join(" | ")}`);
}

// ═════════════ กวาด + Z1 ═════════════
const SAFE = /^[A-Za-z0-9_-]+$/;
async function sweep(tenantIds: string[], emailLike: string): Promise<string> {
  const ids = tenantIds.filter((i) => SAFE.test(i));
  const users = ((await P.user.findMany({ where: { email: { startsWith: emailLike } }, select: { id: true } })) as { id: string }[]).map((u) => u.id).filter((i) => SAFE.test(i));
  const sysIds = ((await P.appSystem.findMany({ where: { tenantId: { in: ids } }, select: { id: true, type: true } })) as { id: string; type: string }[]);
  for (const s of sysIds.filter((x) => x.type === "ACCOUNT")) await P.$queryRawUnsafe(`SELECT account_jno_drop($1)::text AS x`, s.id).catch(() => undefined);
  const sids = sysIds.map((s) => s.id).filter((i) => SAFE.test(i));
  const arr = (a: string[]) => `ARRAY[${a.map((x) => `'${x}'`).join(",")}]::text[]`;
  if (ids.length || users.length) {
    await P.$executeRawUnsafe(`DO $$ DECLARE r record; ids text[] := ${arr(ids.length ? ids : ["-"])}; sids text[] := ${arr(sids.length ? sids : ["-"])}; uids text[] := ${arr(users.length ? users : ["-"])}; pass int; left_ int;
BEGIN
  FOR pass IN 1..12 LOOP
    left_ := 0;
    FOR r IN SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema() AND column_name IN ('tenantId','systemId') AND table_name NOT IN ('Tenant') LOOP
      BEGIN
        IF r.column_name = 'tenantId' THEN EXECUTE format('DELETE FROM %I WHERE "tenantId" = ANY($1)', r.table_name) USING ids;
        ELSE EXECUTE format('DELETE FROM %I WHERE "systemId" = ANY($1)', r.table_name) USING sids; END IF;
      EXCEPTION WHEN foreign_key_violation OR restrict_violation THEN left_ := left_ + 1; END;
    END LOOP;
    BEGIN DELETE FROM "Session" WHERE "userId" = ANY(uids); DELETE FROM "Tenant" WHERE id = ANY(ids); DELETE FROM "User" WHERE id = ANY(uids);
    EXCEPTION WHEN foreign_key_violation OR restrict_violation THEN left_ := left_ + 1; END;
    EXIT WHEN left_ = 0;
  END LOOP;
END $$;`);
  }
  // Z1 — นับซ้ำทุกตารางที่มี tenantId/systemId
  const cols = (await P.$queryRawUnsafe(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema() AND column_name IN ('tenantId','systemId')`)) as { table_name: string; column_name: string }[];
  const parts = cols.map((c) => `SELECT '${c.table_name}' AS t, count(*)::int AS n FROM "${c.table_name}" WHERE "${c.column_name}" = ANY($${c.column_name === "tenantId" ? 1 : 2}::text[])`);
  const left: string[] = [];
  for (let i = 0; i < parts.length; i += 120) {
    const rows = (await P.$queryRawUnsafe(parts.slice(i, i + 120).join(" UNION ALL "), ids, sids.length ? sids : ["-"])) as { t: string; n: number }[];
    for (const r of rows) if (r.n) left.push(`${r.t}=${r.n}`);
  }
  const [{ n: tn }] = await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "Tenant" WHERE id = ANY($1::text[])`, ids);
  const [{ n: un }] = await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "User" WHERE email LIKE $1`, `${emailLike}%`);
  const [{ n: sq }] = await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_class WHERE relkind = 'S' AND relname LIKE ANY($1::text[])`, sids.length ? sids.map((s) => `acc_jno_${s}%`) : ["-"]);
  if (tn) left.push(`Tenant=${tn}`);
  if (un) left.push(`User=${un}`);
  if (sq) left.push(`sequence=${sq}`);
  return left.join(",");
}

// ═════════════ main ═════════════
let crashed = "";
const stamp = MODE === "mig-seed" ? `mig-${Date.now().toString(36)}` : Date.now().toString(36);
try {
  if (MODE === "mig-seed") {
    await seed(stamp);
    console.log(`🌱 ${SUITE}: ร้าน ${PREFIX}${stamp}-a/-b + แถวตกค้าง ลงแล้ว (ไม่กวาด) — migrate แล้วรัน --mig-check`);
  } else if (MODE === "mig-check") {
    const t = await tenantsOf(`${PREFIX}mig-`);
    const s = [...new Set(t.map((x) => x.slug.slice(PREFIX.length).replace(/-[ab]$/, "")))].sort().at(-1);
    if (!s) throw new Error("ไม่พบชุด --mig-seed (qc-hr-hft-mig-*)");
    await runM(await load(s));
  } else {
    await seed(stamp);
    const fx = await load(stamp);
    console.log(`fixture ${PREFIX}${stamp} · A=${fx.A} B=${fx.B} SA=${fx.SA} U=${fx.U}`);
    await runM(fx);
    await runC(fx);
    await runT(fx);
    runStatic();
  }
} catch (e) {
  crashed = `${(e as Error)?.message ?? e}\n${(e as Error)?.stack?.split("\n").slice(1, 5).join("\n") ?? ""}`;
  console.error(`💥 CRASH: ${crashed}`);
} finally {
  if (MODE !== "mig-seed") {
    // กวาด: ร้านของรอบนี้ + qc-hr-hft-* ที่ค้างจากรอบก่อน (ยกเว้นชุด mig ที่รอ --mig-check เมื่อเป็นโหมด full)
    const like = MODE === "mig-check" ? `${PREFIX}mig-` : PREFIX;
    const all = (await tenantsOf(like)).filter((t) => MODE === "mig-check" || !t.slug.startsWith(`${PREFIX}mig-`));
    let left = "";
    try {
      const own = all.map((t) => t.id);
      const stale = MODE === "full" ? `${PREFIX}${stamp}` : like;
      left = await sweep(own, stale);
      // ผู้ใช้ค้างจากรอบก่อน (ไม่ใช่ mig) — กวาดด้วย
      if (MODE === "full") for (const u of (await P.user.findMany({ where: { email: { startsWith: PREFIX }, NOT: { email: { startsWith: `${PREFIX}mig-` } } }, select: { email: true } })) as { email: string }[]) left += await sweep([], u.email);
    } catch (e) { left = `sweep error ${(e as Error).message.slice(0, 120)}`; }
    if (!crashed) chk("Z1", left === "" && all.length > 0, `เหลือ: ${left} · ร้านที่กวาด=${all.length}`);
  }
  await P.$disconnect();
}
const failed = [...results].filter(([, r]) => !r.ok).map(([id]) => id);
const passed = results.size - failed.length;
console.log(`\n${failed.length || crashed ? "❌" : "✅"} ${SUITE} [${MODE}] — ${passed}/${results.size} ผ่าน${failed.length ? ` · ตก: ${failed.join(", ")}` : ""}${crashed ? " · CRASH" : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: MODE, total: results.size, passed, failed, crashed: !!crashed, registered: CHECKS.length })}`);
process.exit(failed.length || crashed ? 1 : 0);

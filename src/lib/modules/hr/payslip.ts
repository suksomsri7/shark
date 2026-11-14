// HR H3.8 ▸ สลิปเงินเดือน (07c ในแอป + PDF) · ประวัติรายปีตามปีภาษี · หนังสือรับรองเงินเดือน — service (server เท่านั้น) · brief hr-brief-H3.8 R6–R17
//   ด่านสลิป/ประวัติ (R7) = OWNER หรือ hr.payroll.read อ่านซ้ำจากแถว Membership จริง (ยอมรับแล้ว · ร้านเดียวกัน · บทบาทที่ส่งมาต้องตรงกับในฐาน)
//     และต้องผ่านด้วยค่าที่ผู้เรียกส่งมาด้วย · ขอบเขต = สาขาประจำของพนักงาน (HrEmployee.unitId) อยู่ในสาขาของผู้ดู (OWNER / "*" = ทุกสาขา ·
//     ไม่ระบุสาขาประจำ = ผู้ดูทุกสาขาเท่านั้น · ยืมตัวไม่ขยาย — Q2) · ระบบ HR ของร้านเท่านั้น · อื่น ๆ = {ok:false, code:"NO", reason: no} ไบต์เดียวกัน
//   ด่านหนังสือรับรอง = ด่านไฟล์โอนของ H3.5 (bankGateOf) บนสมาชิกภาพจริง · ผู้ไม่ใช่ OWNER ออกให้แถวพนักงานของตัวเองไม่ได้ (OWN)
//   ตัวเอง (R6) = resolveSelf เท่านั้น ไม่รับรหัสพนักงานจาก input/URL · เห็นเฉพาะสลิปที่ออกแล้ว (ISSUED)
//   อ่านสลิป/PDF/ประวัติ = รอบ + รายการในธุรกรรมเดียว ถือแถวรอบ FOR SHARE (R15) · ตัวเลข = ค่าที่เก็บไว้ (payslip-rules) ·
//   ไม่เก็บไบต์ PDF · ลงประวัติเฉพาะการดาวน์โหลด/คำขอ/ออก/ไม่อนุมัติ/ยกเลิก (R16 — ไม่มีชื่อ เลขประจำตัว ฿ หรือเหตุผลการยกเลิก) · ไม่มี outbox ◂
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { writeAudit } from "@/lib/core/audit";
import { reserveSeq } from "@/lib/modules/account/doc-numbering";
import { bankGateOf } from "./bank-files/service";
import { hrScopeOf, type HrScope } from "./scope";
import { resolveSelf, type SelfActor } from "./self";
import {
  SLIP_TEXT,
  bankMaskedOf,
  bkkDayOf,
  finalizedOf,
  isSlipPurpose,
  salaryCertContent,
  slipIncome,
  slipState,
  slipView,
  taxYearOf,
  yearTotals,
  type SalaryCertContent,
  type SlipLine,
  type SlipState,
  type SlipTextKey,
  type YearRow,
  type YearTotal,
} from "./payslip-rules";
import { renderPayslipPdf, renderSalaryCertPdf } from "./payslip-pdf";

type Ctx = { tenantId: string; systemId: string };
type Opts = { now?: Date };
type Db = Prisma.TransactionClient;
type TxRunner = { $transaction: <T>(fn: (tx: Db) => Promise<T>, o: typeof TX_OPTS) => Promise<T> };
export type PayslipViewer = { role: string; unitAccess: unknown; permissions: unknown; userId?: string | null };
export type Refusal = { ok: false; code: string; reason: string };
export type SlipDto = {
  ok: true;
  runId: string;
  periodKey: string;
  payDate: string;
  taxYear: number;
  status: string;
  state: SlipState;
  engineVersion: number;
  employee: { name: string; position: string | null; code: string | null };
  earnings: SlipLine[];
  deductions: SlipLine[];
  earningsSatang: number;
  deductionsSatang: number;
  netSatang: number;
  ssoBaseSatang: number;
  employerSsoSatang: number;
  bankMasked: string | null;
  flags: string[];
};
/** fix round 2 (ruling E): netSatang = null ⇒ แถวกลาง "ข้อมูลสลิปงวดนี้มีปัญหา" ของงวดที่ข้อมูลเสีย (ไม่มีตัวเลข · ไม่รวมในยอดปี) */
export type SlipRowDto = { runId: string; periodKey: string; payDate: string; netSatang: number | null; href: string };
export type YearDto = YearTotal<SlipRowDto>;
export type MySlipsDto = { ok: true; years: YearDto[] };
export type HistoryDto = { ok: true; employeeId: string; name: string; year: YearDto };
export type DownloadOk = { ok: true; fileName: string; contentType: string; bytes: Uint8Array };
export type CertRowDto = { id: string; employeeId: string; name: string; status: string; purpose: string; docNo: string | null; issuedAt: string | null; requestedAt: string | null; voided: boolean; downloads: number; sourceWithdrawn: boolean };
export type MyCertRowDto = { id: string; status: string; purpose: string; docNo: string | null; issuedAt: string | null; requestedAt: string | null; canCancel: boolean };

const T = SLIP_TEXT;
const refuse = (code: string, key: SlipTextKey): Refusal => ({ ok: false, code, reason: T[key] });
const NO = (): Refusal => refuse("NO", "no");
const TX_OPTS = { maxWait: 15_000, timeout: 30_000 } as const;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/;
/** fix round 2 (ruling F): ตัดอักขระควบคุม C0/C1 · bidi (U+202A–202E, U+2066–2069, U+200E/200F) · ตัวแบ่งบรรทัด/ย่อหน้า (U+2028/2029) ก่อนแช่แข็งเนื้อหาหนังสือรับรอง
 *  (ขึ้นบรรทัด/แท็บ = ช่องว่าง) */
const cleanText = (v: string | null | undefined): string =>
  String(v ?? "")
    .replace(/[\t\n\r\u000b\u000c\u2028\u2029]+/g, " ")
    .replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "") // fix round 3: + U+061C (ALM)
    .replace(/ {2,}/g, " ")
    .trim();
const cleanOrNull = (v: string | null | undefined) => cleanText(v) || null;
const obj = (raw: unknown): Record<string, unknown> => (raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {});
const str = (v: unknown) => (typeof v === "string" ? v : "");
const nowOf = (o: Opts | undefined) => (o?.now instanceof Date && Number.isFinite(o.now.getTime()) ? new Date(o.now.getTime()) : new Date());
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
/** JSON คีย์เรียงทุกชั้น (sha ของเนื้อหาหนังสือรับรอง — แบบเดียวกับ H3.6) */
const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, (x as Record<string, unknown>)[k]])) : x));
const runTx = <R,>(ctx: Ctx, fn: (tx: Db) => Promise<R>) => (tenantDb(ctx) as unknown as TxRunner).$transaction(fn, TX_OPTS);
/** ต้นปีเวลาไทย → UTC */
const bkkYearStart = (y: number) => new Date(Date.UTC(y, 0, 1) - 7 * 3_600_000);
const dayOrNull = (d: Date | null | undefined) => (d instanceof Date && Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null);
const ctxOk = (ctx: Ctx | null | undefined): ctx is Ctx => !!ctx && typeof ctx.tenantId === "string" && typeof ctx.systemId === "string" && ID_RE.test(ctx.tenantId) && ID_RE.test(ctx.systemId);

// ═════════════ ด่าน (R7) ═════════════
type Member = { role: string; unitAccess: unknown; permissions: unknown; userId: string };
/** สมาชิกภาพจริงของผู้ดูในร้านของ ctx (บทบาทที่ส่งมาต้องตรงกับในฐาน) + ระบบ HR ของร้าน — null = ไม่ผ่าน */
async function memberOf(ctx: Ctx, viewer: PayslipViewer | null | undefined): Promise<Member | null> {
  if (!ctxOk(ctx)) return null;
  const uid = typeof viewer?.userId === "string" ? viewer.userId : "";
  if (!uid || typeof viewer?.role !== "string") return null;
  const db = tenantDb({ tenantId: ctx.tenantId });
  const m = await db.membership.findFirst({ where: { tenantId: ctx.tenantId, userId: uid, acceptedAt: { not: null } }, select: { role: true, unitAccess: true, permissions: true } });
  if (!m || String(m.role) !== viewer.role) return null;
  const sys = await db.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "HR" }, select: { id: true } });
  if (!sys) return null;
  return { role: String(m.role), unitAccess: m.unitAccess, permissions: m.permissions, userId: uid };
}
/** ผู้ดูเงินเดือน = OWNER หรือ hr.payroll.read (ค่าเดียวกับ canViewPayroll) */
const payrollReader = (v: { role: string; permissions: unknown } | null | undefined) => !!v && (v.role === "OWNER" || obj(v.permissions)["hr.payroll.read"] === true);
async function slipGate(ctx: Ctx, viewer: PayslipViewer | null | undefined): Promise<Member | null> {
  const m = await memberOf(ctx, viewer);
  return m && payrollReader(m) && payrollReader(viewer) ? m : null;
}
/** ด่านหนังสือรับรอง (pure บนผู้ดูที่ส่งมา — กล่องคำขอใช้ตัดสินว่าแสดงชนิด CERT · ตัวจริงอ่านฐานซ้ำใน certGate) */
export function certGateOf(v: { role: string; unitAccess: unknown; permissions: unknown } | null | undefined): boolean {
  return bankGateOf(v);
}
async function certGate(ctx: Ctx, viewer: PayslipViewer | null | undefined): Promise<Member | null> {
  const m = await memberOf(ctx, viewer);
  return m && bankGateOf(m) && bankGateOf(viewer) ? m : null;
}
/** ผู้ดูคนนี้ใช้ส่วนหนังสือรับรองบนหน้าเงินเดือนได้ไหม */
export async function canUseSalaryCerts(ctx: Ctx, viewer: PayslipViewer | null | undefined): Promise<boolean> {
  return !!(await certGate(ctx, viewer));
}
/** สาขาประจำอยู่ในขอบเขตของผู้ดู (ทั้งในฐานและที่ส่งมา) — ไม่ระบุสาขาประจำ = ผู้ดูทุกสาขาเท่านั้น · ยืมตัวไม่นับ (Q2) */
function homeInScope(m: Member, viewer: PayslipViewer, unitId: string | null): boolean {
  const ok = (sc: HrScope) => sc.unitIds === "*" || (!!unitId && sc.unitIds.includes(unitId));
  return ok(hrScopeOf({ role: m.role as "STAFF", unitAccess: m.unitAccess })) && ok(hrScopeOf({ role: viewer.role as "STAFF", unitAccess: viewer.unitAccess }));
}

// ═════════════ อ่านสลิปในธุรกรรม (R15) ═════════════
type RunRow = { id: string; periodKey: string; payDate: Date; status: string; engineVersion: number; finalized: boolean };
const ITEM_SELECT = { grossSatang: true, netSatang: true, ssoBaseSatang: true, ssoEmployeeSatang: true, ssoEmployerSatang: true, whtSatang: true, addSatang: true, deductSatang: true, snapshotJson: true } as const;
const EMP_SELECT = { id: true, name: true, position: true, code: true, unitId: true, bankName: true, bankAccountNo: true, linkedUserId: true } as const;
type EmpRow = { id: string; name: string; position: string | null; code: string | null; unitId: string | null; bankName: string | null; bankAccountNo: string | null; linkedUserId: string | null };
type Loaded = { run: RunRow; item: Record<string, unknown>; emp: EmpRow };

/** แถวรอบ (FOR SHARE — รอการกลับรายการที่กำลังทำอยู่ แล้วเห็นสถานะใหม่) + รายการของพนักงาน + พนักงาน */
async function loadSlip(tx: Db, ctx: Ctx, runId: string, employeeId: string): Promise<Loaded | null> {
  if (!ID_RE.test(runId) || !ID_RE.test(employeeId)) return null;
  const rows = await tx.$queryRaw<RunRow[]>`
    SELECT "id", "periodKey", "payDate", "status"::text AS "status", "engineVersion",
           COALESCE(("stepsJson"->>'finalized')::boolean, false) AS "finalized"
    FROM "HrPayrollRun"
    WHERE "id" = ${runId} AND "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId}
    FOR SHARE`;
  const run = rows[0];
  if (!run) return null;
  const emp = (await tx.hrEmployee.findFirst({ where: { id: employeeId, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: EMP_SELECT })) as EmpRow | null;
  if (!emp) return null;
  const item = await tx.hrPayrollItem.findFirst({ where: { runId: run.id, employeeId: emp.id, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: ITEM_SELECT });
  if (!item) return null;
  return { run, item: item as unknown as Record<string, unknown>, emp };
}
/** สลิป DTO (R10) — คีย์ตายตัว · ไม่มีเลขบัญชีเต็ม/เลขประจำตัว/หมายเหตุ */
function dtoOf(L: Loaded): SlipDto | Refusal {
  const v = slipView({ engineVersion: L.run.engineVersion, item: L.item, notIssued: slipState(L.run) !== "ISSUED" }); // merge round m2: รอบที่ยังไม่ออก = ยอมยอดติดลบ (ป้ายสถานะ) ◂
  if (!v.ok) return refuse("SLIP_DATA", "slipData");
  return {
    ok: true,
    runId: L.run.id,
    periodKey: L.run.periodKey,
    payDate: bkkDayOf(L.run.payDate),
    taxYear: taxYearOf(L.run.payDate),
    status: L.run.status,
    state: slipState(L.run),
    engineVersion: L.run.engineVersion,
    employee: { name: L.emp.name, position: L.emp.position, code: L.emp.code },
    earnings: v.earnings,
    deductions: v.deductions,
    earningsSatang: v.earningsSatang,
    deductionsSatang: v.deductionsSatang,
    netSatang: v.netSatang,
    ssoBaseSatang: v.ssoBaseSatang,
    employerSsoSatang: v.employerSsoSatang,
    bankMasked: bankMaskedOf(L.emp.bankName, L.emp.bankAccountNo),
    flags: v.flags,
  };
}
/** merge round m3: ประวัติการดาวน์โหลดเขียนแบบไม่กลืน error — ล้ม = โยน (ไม่ส่งไฟล์) · ใช้ใน tx เดียวกับตัวนับเมื่อมี */
type AuditRow = { tenantId: string; actorId: string; action: string; targetType: string; targetId: string; after: Record<string, unknown> };
const auditIn = (db: Db, a: AuditRow) => db.auditLog.create({ data: { tenantId: a.tenantId, actorType: "USER", actorId: a.actorId, action: a.action, targetType: a.targetType, targetId: a.targetId, after: a.after as Prisma.InputJsonValue } });
const STATE_REFUSAL: Record<Exclude<SlipState, "ISSUED">, Refusal> = {
  DRAFT: refuse("NOT_ISSUED", "notIssued"),
  NOT_FINAL: refuse("NOT_FINAL", "notFinal"),
  WITHDRAWN: refuse("WITHDRAWN", "withdrawn"),
};
const safeCode = (c: string | null) => (c && /^[A-Za-z0-9_-]{1,20}$/.test(c.trim()) ? c.trim() : "");
async function employerNameOf(ctx: Ctx): Promise<string> {
  const p = await (tenantDb(ctx) as unknown as Db).hrFilingProfile.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { employerName: true } });
  if (p?.employerName?.trim()) return p.employerName.trim();
  return (await tenantDb({ tenantId: ctx.tenantId }).tenant.findFirst({ where: { id: ctx.tenantId }, select: { name: true } }))?.name ?? "";
}
/** สลิปที่ออกแล้ว → PDF (ไม่เก็บไบต์) */
async function slipPdf(ctx: Ctx, d: SlipDto): Promise<DownloadOk> {
  const bytes = await renderPayslipPdf(d, { employerName: await employerNameOf(ctx) });
  const code = safeCode(d.employee.code);
  return { ok: true, fileName: `payslip-${d.periodKey}${code ? `-${code}` : ""}.pdf`, contentType: "application/pdf", bytes };
}

// ═════════════ ผู้ดูเงินเดือน (R7 · R8) ═════════════
/** สลิปในแอป (ทุกสถานะ — หน้าแสดงป้าย DRAFT/NOT_FINAL/WITHDRAWN) */
export async function slipForViewer(ctx: Ctx, viewer: PayslipViewer, input: { runId: unknown; employeeId: unknown }): Promise<SlipDto | Refusal> {
  const m = await slipGate(ctx, viewer);
  if (!m) return NO();
  const i = obj(input);
  const L = await runTx(ctx, (tx) => loadSlip(tx, ctx, str(i.runId), str(i.employeeId)));
  if (!L || !homeInScope(m, viewer, L.emp.unitId)) return NO();
  return dtoOf(L);
}
/** PDF ของสลิป (ISSUED เท่านั้น) + ลงประวัติการดาวน์โหลด */
export async function downloadPayslipPdf(ctx: Ctx, viewer: PayslipViewer, input: { runId: unknown; employeeId: unknown }, opts?: Opts): Promise<DownloadOk | Refusal> {
  void opts;
  const m = await slipGate(ctx, viewer);
  if (!m) return NO();
  const i = obj(input);
  const L = await runTx(ctx, (tx) => loadSlip(tx, ctx, str(i.runId), str(i.employeeId)));
  if (!L || !homeInScope(m, viewer, L.emp.unitId)) return NO();
  const st = slipState(L.run);
  if (st !== "ISSUED") return STATE_REFUSAL[st];
  const d = dtoOf(L);
  if (!d.ok) return d;
  const out = await slipPdf(ctx, d);
  await auditIn(tenantDb({ tenantId: ctx.tenantId }) as unknown as Db, { tenantId: ctx.tenantId, actorId: m.userId, action: "hr.payslip.download", targetType: "HrPayrollRun", targetId: L.run.id, after: { runId: L.run.id, employeeId: L.emp.id, periodKey: L.run.periodKey, by: "GATE" } });
  return out;
}

/** รายการที่ออกแล้วของพนักงาน 1 คน (ทุกปี หรือปีเดียว) → แถวรายปี + งวดที่ข้อมูลเสีย (fix round 2 ruling E: ข้ามแถวเสีย ไม่ทิ้งทั้งรายการ) */
type IssuedRows = { rows: YearRow<SlipRowDto>[]; bad: { payDate: Date; slip: SlipRowDto }[] };
async function issuedRows(tx: Db, ctx: Ctx, employeeId: string, href: (runId: string) => string, year?: number): Promise<IssuedRows> {
  const range = year === undefined ? {} : { payDate: { gte: bkkYearStart(year), lt: bkkYearStart(year + 1) } };
  // merge round m6 + fix round 2 (ruling H): ถือ FOR SHARE เฉพาะรอบ APPROVED/PAID ของพนักงานคนนี้ (ไม่แตะรอบร่าง) เรียงตาม id ก่อนอ่านรายการ —
  //   การกลับรายการที่กำลังทำ = รอแล้วเห็น REVERSED (ไม่นับ) · ผู้เขียนรอบร่างไม่ขวางรายการสลิป
  if (year === undefined)
    await tx.$queryRaw`SELECT r."id" FROM "HrPayrollRun" r WHERE r."tenantId" = ${ctx.tenantId} AND r."systemId" = ${ctx.systemId} AND r."status" IN ('APPROVED'::"PayrollRunStatus", 'PAID'::"PayrollRunStatus") AND EXISTS (SELECT 1 FROM "HrPayrollItem" i WHERE i."runId" = r."id" AND i."employeeId" = ${employeeId}) ORDER BY r."id" FOR SHARE OF r`;
  else
    await tx.$queryRaw`SELECT r."id" FROM "HrPayrollRun" r WHERE r."tenantId" = ${ctx.tenantId} AND r."systemId" = ${ctx.systemId} AND r."status" IN ('APPROVED'::"PayrollRunStatus", 'PAID'::"PayrollRunStatus") AND r."payDate" >= ${bkkYearStart(year)} AND r."payDate" < ${bkkYearStart(year + 1)} AND EXISTS (SELECT 1 FROM "HrPayrollItem" i WHERE i."runId" = r."id" AND i."employeeId" = ${employeeId}) ORDER BY r."id" FOR SHARE OF r`;
  const items = await tx.hrPayrollItem.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId, run: { status: { in: ["APPROVED", "PAID"] }, ...range } },
    select: { ...ITEM_SELECT, runId: true, run: { select: { id: true, periodKey: true, payDate: true, status: true, engineVersion: true, stepsJson: true } } },
    orderBy: [{ run: { payDate: "desc" } }, { runId: "desc" }],
    take: 600,
  });
  const out: IssuedRows = { rows: [], bad: [] };
  for (const it of items) {
    const r = it.run;
    if (slipState({ status: String(r.status), engineVersion: r.engineVersion, finalized: finalizedOf(r.stepsJson) }) !== "ISSUED") continue;
    const row = it as unknown as Record<string, unknown>;
    const v = slipView({ engineVersion: r.engineVersion, item: row });
    const income = slipIncome(r.engineVersion, row);
    const slip = { runId: r.id, periodKey: r.periodKey, payDate: bkkDayOf(r.payDate), netSatang: it.netSatang, href: href(r.id) };
    if (!v.ok || income === null) {
      out.bad.push({ payDate: r.payDate, slip: { ...slip, netSatang: null } }); // ไม่มีตัวเลข · ไม่รวมในยอดปี
      continue;
    }
    out.rows.push({ payDate: r.payDate, grossSatang: it.grossSatang, netSatang: it.netSatang, whtSatang: it.whtSatang, ssoEmployeeSatang: it.ssoEmployeeSatang, incomeSatang: income, slip });
  }
  return out;
}
/** ยอดรายปี (แถวดีเท่านั้น) + แถวกลางของงวดที่ข้อมูลเสีย แทรกตามวันที่จ่าย (ปีใหม่ก่อน · งวดใหม่ก่อน) */
function yearsOf(r: IssuedRows): YearDto[] {
  const years = yearTotals(r.rows) as YearDto[];
  for (const b of r.bad) {
    const ty = taxYearOf(b.payDate);
    let y = years.find((x) => x.taxYear === ty);
    if (!y) years.push((y = emptyYear(ty)));
    y.slips.push(b.slip);
    y.slips.sort((a, c) => (a.payDate === c.payDate ? (a.runId < c.runId ? 1 : -1) : a.payDate < c.payDate ? 1 : -1));
  }
  return years.sort((a, c) => c.taxYear - a.taxYear);
}
const emptyYear = (taxYear: number): YearDto => ({ taxYear, count: 0, grossSatang: 0, incomeSatang: 0, taxSatang: 0, ssoSatang: 0, netSatang: 0, slips: [] });

/** ประวัติรายปีของพนักงาน 1 คน (ผู้ดูเงินเดือน) — income/tax/SSO ตรงกับ 50 ทวิ ของปีเดียวกัน (H3.6) */
export async function slipHistory(ctx: Ctx, viewer: PayslipViewer, input: { employeeId: unknown; taxYear: unknown }): Promise<HistoryDto | Refusal> {
  const m = await slipGate(ctx, viewer);
  if (!m) return NO();
  const q = obj(input);
  const employeeId = str(q.employeeId);
  const rawYear = typeof q.taxYear === "string" && /^\d{4}$/.test(q.taxYear) ? Number(q.taxYear) : q.taxYear;
  if (!ID_RE.test(employeeId) || typeof rawYear !== "number" || !Number.isInteger(rawYear) || rawYear < 2000 || rawYear > 2400) return NO();
  const taxYear = rawYear;
  const out = await runTx(ctx, async (tx) => {
    const emp = (await tx.hrEmployee.findFirst({ where: { id: employeeId, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: EMP_SELECT })) as EmpRow | null;
    if (!emp || !homeInScope(m, viewer, emp.unitId)) return null;
    // fix round 2 (ruling H): ล็อกรอบอยู่ใน issuedRows (APPROVED/PAID ของพนักงานคนนี้ในปีนั้น เรียงตาม id) — ไม่ล็อกรอบร่าง/รอบของคนอื่น
    const rows = await issuedRows(tx, ctx, emp.id, (runId) => `/app/sys/${ctx.systemId}/payroll/${runId}/slip/${emp.id}`, taxYear);
    return { emp, rows };
  });
  if (!out) return NO();
  const year = yearsOf(out.rows).find((y) => y.taxYear === taxYear) ?? emptyYear(taxYear);
  return { ok: true, employeeId: out.emp.id, name: out.emp.name, year };
}

// ═════════════ หนังสือรับรองเงินเดือน — ผู้ผ่านด่าน (R11) ═════════════
const CERT_STATUSES = ["REQUESTED", "ISSUED", "REJECTED", "CANCELLED"] as const;
type CertRow = { id: string; employeeId: string; status: string; purpose: string; docNo: string | null; issuedAt: Date | null; requestedAt: Date | null; voidedAt: Date | null; downloads: number; contentJson: unknown; contentSha256: string | null };
const CERT_SELECT = { id: true, employeeId: true, status: true, purpose: true, docNo: true, issuedAt: true, requestedAt: true, voidedAt: true, downloads: true, contentJson: true, contentSha256: true } as const;
const iso = (d: Date | null) => (d ? d.toISOString() : null);
/** fix round 2 (controller ruling 2): คำขอที่ปิดเพราะมีใบเดิมอยู่แล้ว = CANCELLED + contentJson.fulfilledBy — แสดงเป็น "ออกให้แล้ว" (FULFILLED) ไม่ใช่ "ยกเลิก" */
const fulfilledBy = (r: { status: string; contentJson: unknown }) => (r.status === "CANCELLED" ? str(obj(r.contentJson).fulfilledBy) : "");
/** แถวคำขอที่ได้ใบเดิม (ของระบบนี้ · ถ้าระบุ = ของพนักงานคนนี้) */
async function fulfilledRows(db: Db, ctx: Ctx, employeeId?: string): Promise<CertRow[]> {
  const ids = await db.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "HrSalaryCertificate" WHERE "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId} AND "status" = 'CANCELLED' AND "contentJson" ? 'fulfilledBy'
      AND (${employeeId ?? null}::text IS NULL OR "employeeId" = ${employeeId ?? null}) ORDER BY "createdAt" DESC, "id" DESC LIMIT 200`;
  return ids.length ? ((await db.hrSalaryCertificate.findMany({ where: { id: { in: ids.map((x) => x.id) }, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: CERT_SELECT })) as CertRow[]) : [];
}
/** ใบที่คำขอชี้ไป (id → แถว) */
async function targetsOf(db: Db, ctx: Ctx, rows: CertRow[]): Promise<Map<string, CertRow>> {
  const ids = [...new Set(rows.map(fulfilledBy).filter(Boolean))];
  const ts = ids.length ? ((await db.hrSalaryCertificate.findMany({ where: { id: { in: ids }, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ISSUED" }, select: CERT_SELECT })) as CertRow[]) : [];
  return new Map(ts.map((t) => [t.id, t]));
}

/** รายการคำขอ/ใบที่ออก (ผู้ผ่านด่านหนังสือรับรอง) — ไม่มี ฿ · คำขอที่ผู้ขอยกเลิกเองไม่แสดง */
export async function listSalaryCertificates(ctx: Ctx, viewer: PayslipViewer, input: { status?: unknown } = {}): Promise<{ ok: true; items: CertRowDto[] } | Refusal> {
  if (!(await certGate(ctx, viewer))) return NO();
  const st = obj(input).status;
  const status = ([...CERT_STATUSES, "FULFILLED"] as readonly string[]).includes(st as string) ? (st as string) : null;
  const db = tenantDb(ctx) as unknown as Db;
  // ruling 2 + fix round 3 (NOTE-3): ตัวกรอง "ยกเลิก" ไม่นับคำขอที่ได้ใบแล้ว — ตัดในคิวรีก่อน take 200 (คำขอที่ได้ใบไม่เบียดคำขอที่ยกเลิกจริง)
  const realCancelled = status === "CANCELLED"
    ? (await db.$queryRaw<{ id: string }[]>`SELECT "id" FROM "HrSalaryCertificate" WHERE "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId} AND "status" = 'CANCELLED' AND ("contentJson" IS NULL OR NOT ("contentJson" ? 'fulfilledBy')) ORDER BY "createdAt" DESC, "id" DESC LIMIT 200`).map((x) => x.id)
    : null;
  const base = status === "FULFILLED" ? [] : ((await db.hrSalaryCertificate.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, ...(realCancelled ? { id: { in: realCancelled } } : status ? { status } : { status: { not: "CANCELLED" } }) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 200,
    select: CERT_SELECT,
  })) as CertRow[]).filter((r) => !fulfilledBy(r));
  const ful = !status || status === "FULFILLED" ? await fulfilledRows(db, ctx) : [];
  const tgt = await targetsOf(db, ctx, ful);
  const rows = [...base, ...ful.filter((r) => tgt.has(fulfilledBy(r)))].sort((a, c) => ((c.requestedAt ?? c.issuedAt ?? new Date(0)).getTime() - (a.requestedAt ?? a.issuedAt ?? new Date(0)).getTime()) || (a.id < c.id ? 1 : -1));
  const ids = [...new Set(rows.map((r) => r.employeeId))];
  const names = new Map(ids.length ? (await db.hrEmployee.findMany({ where: { id: { in: ids }, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { id: true, name: true } })).map((e) => [e.id, e.name]) : []);
  // merge round (new ruling): ใบที่ออกแล้วซึ่งรอบต้นทางถูกกลับรายการภายหลัง = ป้าย sourceWithdrawn (ไม่ยกเลิกเอง · ผู้ผ่านด่านยกเลิกได้) — ไม่ส่ง runId ออก
  const docOf = (r: CertRow) => (fulfilledBy(r) ? tgt.get(fulfilledBy(r))! : r);
  const srcOf = (r: CertRow) => str(obj(obj(docOf(r).contentJson).salary).runId);
  const srcIds = [...new Set(rows.filter((r) => docOf(r).status === "ISSUED").map(srcOf).filter(Boolean))];
  const live = new Set(srcIds.length ? (await db.hrPayrollRun.findMany({ where: { id: { in: srcIds }, tenantId: ctx.tenantId, systemId: ctx.systemId, status: { in: ["APPROVED", "PAID"] } }, select: { id: true } })).map((x) => x.id) : []);
  return {
    ok: true,
    items: rows.map((r) => {
      const d = docOf(r); // คำขอที่ได้ใบเดิม = แสดงเลขที่/สถานะของใบนั้น (FULFILLED) — ดาวน์โหลดด้วย id ของคำขอได้ (certPdf ตามไปใบเดิม)
      return {
        id: r.id, employeeId: r.employeeId, name: names.get(r.employeeId) ?? "", status: d === r ? r.status : "FULFILLED", purpose: r.purpose, docNo: d.docNo, issuedAt: iso(d.issuedAt), requestedAt: iso(r.requestedAt), voided: !!d.voidedAt, downloads: d.downloads,
        sourceWithdrawn: d.status === "ISSUED" && !live.has(srcOf(r)),
      };
    }),
  };
}
/** พนักงานที่ออกหนังสือรับรองให้ได้ (ตัวเลือกของฟอร์ม "ออกใหม่") — ชื่อ + รหัสเท่านั้น */
export async function listSalaryCertEmployees(ctx: Ctx, viewer: PayslipViewer): Promise<{ ok: true; items: { employeeId: string; name: string; code: string | null }[] } | Refusal> {
  if (!(await certGate(ctx, viewer))) return NO();
  const rows = await (tenantDb(ctx) as unknown as Db).hrEmployee.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { id: true, name: true, code: true }, orderBy: [{ code: "asc" }, { name: "asc" }, { id: "asc" }], take: 500 });
  return { ok: true, items: rows.map((e) => ({ employeeId: e.id, name: e.name, code: e.code })) };
}

type IssueOk = { ok: true; certId: string; docNo: string };
/** ผลภายในของธุรกรรมออกใบ — audit = แถวประวัติที่ต้องเขียน (null = ไม่มีอะไรเปลี่ยน: คืนใบเดิม) */
type IssueTx = IssueOk & { audit: { certId: string; docNo: string; requestedById?: string | null; requestId?: string } | null };
const lockEmp = (tx: Db, ctx: Ctx, employeeId: string) => tx.$queryRaw`SELECT 1 AS "x" FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`hrsc:${ctx.systemId}:${employeeId}`}, 38))) AS "l"`;
/** สลิปที่ออกแล้วล่าสุดของพนักงาน (ตามวันที่จ่าย) — ถือแถวรอบ FOR SHARE */
async function latestIssued(tx: Db, ctx: Ctx, employeeId: string, now: Date): Promise<{ run: RunRow; item: Record<string, unknown> } | null> {
  // merge round m1: เฉพาะรอบที่วันจ่าย ≤ วันนี้ (เวลาไทย) — รอบที่จ่ายในอนาคตยังอ้างเป็นเงินเดือนไม่ได้
  const dayEnd = new Date(Date.parse(`${bkkDayOf(now)}T00:00:00+07:00`) + 86_400_000);
  const runs = await tx.$queryRaw<RunRow[]>`
    SELECT r."id", r."periodKey", r."payDate", r."status"::text AS "status", r."engineVersion",
           COALESCE((r."stepsJson"->>'finalized')::boolean, false) AS "finalized"
    FROM "HrPayrollRun" r
    WHERE r."tenantId" = ${ctx.tenantId} AND r."systemId" = ${ctx.systemId}
      AND r."status" IN ('APPROVED'::"PayrollRunStatus", 'PAID'::"PayrollRunStatus")
      AND r."payDate" < ${dayEnd}
      AND EXISTS (SELECT 1 FROM "HrPayrollItem" i WHERE i."runId" = r."id" AND i."employeeId" = ${employeeId})
    ORDER BY r."payDate" DESC, r."id" DESC
    FOR SHARE OF r`;
  const run = runs.find((r) => slipState(r) === "ISSUED");
  if (!run) return null;
  const item = await tx.hrPayrollItem.findFirst({ where: { runId: run.id, employeeId, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: ITEM_SELECT });
  return item ? { run, item: item as unknown as Record<string, unknown> } : null;
}

/** ออกหนังสือรับรอง — จากคำขอ ({requestId}) หรือออกตรง ({employeeId, purpose}) · ลำดับล็อก: advisory (ระบบ, พนักงาน) → แถวคำขอ FOR UPDATE →
 *  สลิปล่าสุด (รอบ FOR SHARE) → ข้อมูลผู้จ่ายเงิน → reserveSeq (ล็อกสุดท้าย) → เขียนแถวของตัวเอง · ปฏิเสธก่อน reserveSeq เสมอ (ไม่กินเลข) */
export async function issueSalaryCertificate(ctx: Ctx, viewer: PayslipViewer, input: { requestId?: unknown; employeeId?: unknown; purpose?: unknown }, opts?: Opts): Promise<IssueOk | Refusal> {
  const m = await certGate(ctx, viewer);
  if (!m) return NO();
  const q = obj(input);
  const requestId = str(q.requestId);
  const now = nowOf(opts);
  const db = tenantDb(ctx) as unknown as Db;
  let employeeId: string;
  let purpose: string;
  if (requestId) {
    if (!ID_RE.test(requestId)) return NO();
    const r = await db.hrSalaryCertificate.findFirst({ where: { id: requestId, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { employeeId: true, purpose: true } });
    if (!r) return NO();
    employeeId = r.employeeId;
    purpose = r.purpose;
  } else {
    employeeId = str(q.employeeId);
    if (!ID_RE.test(employeeId)) return NO();
    if (!isSlipPurpose(q.purpose)) return refuse("PURPOSE", "purpose");
    purpose = q.purpose;
  }
  const out = await runTx(ctx, async (tx): Promise<IssueTx | Refusal> => {
    await lockEmp(tx, ctx, employeeId);
    const emp = await tx.hrEmployee.findFirst({ where: { id: employeeId, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { id: true, name: true, position: true, startDate: true, endDate: true, active: true, employmentStatus: true, linkedUserId: true } });
    if (!emp) return NO();
    if (m.role !== "OWNER" && emp.linkedUserId && emp.linkedUserId === m.userId) return refuse("OWN", "own");
    // fix round 2 (ruling D): คำขอที่รออยู่ของพนักงานคนนี้ — ทางคำขอ = แถวที่ระบุ · ทางออกตรง = คำขอที่รออยู่ (ถ้ามี) ถูกปิดในธุรกรรมเดียวกัน
    const reqRows = requestId
      ? await tx.$queryRaw<{ id: string; status: string; requestedById: string | null }[]>`SELECT "id", "status", "requestedById" FROM "HrSalaryCertificate" WHERE "id" = ${requestId} AND "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId} FOR UPDATE`
      : // fix round 3 (MINOR-1): ออกตรงปิดได้เฉพาะคำขอที่วัตถุประสงค์ตรงกัน — คำขอวัตถุประสงค์อื่นค้างไว้ไม่แตะ (อนุมัติภายหลังเป็นใบของตัวเองได้)
        await tx.$queryRaw<{ id: string; status: string; requestedById: string | null }[]>`SELECT "id", "status", "requestedById" FROM "HrSalaryCertificate" WHERE "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId} AND "employeeId" = ${emp.id} AND "status" = 'REQUESTED' AND "purpose" = ${purpose} ORDER BY "id" FOR UPDATE`;
    if (requestId && reqRows[0]?.status !== "REQUESTED") return refuse("NOT_DECIDABLE", "notDecidable");
    const open = reqRows.find((r) => r.status === "REQUESTED") ?? null;
    const src = await latestIssued(tx, ctx, emp.id, now);
    if (!src) return refuse("CERT_NO_SLIP", "certNoSlip");
    const v = slipView({ engineVersion: src.run.engineVersion, item: src.item });
    if (!v.ok) return refuse("SLIP_DATA", "slipData");
    const base = v.earnings.find((l) => l.code === "BASE");
    if (!base || base.amountSatang <= 0) return refuse("CERT_NO_BASE", "certNoBase");
    // fix round 2 (ruling C): ใบที่ยังใช้ได้ (ISSUED · ไม่ถูกยกเลิก) ของพนักงานคนเดิม อ้างรอบเดิม วัตถุประสงค์เดิม = คืนใบเดิม ไม่ออกเลขใหม่ (กดซ้ำ/ส่งซ้ำ)
    // fix round 3 (MINOR-2): ล็อกแถวใบเดิม FOR UPDATE แล้วตรวจซ้ำว่ายังใช้ได้ — ยกเลิกที่เพิ่ง commit = ไม่ใช่ใบเดิม (ออกใหม่) · ไม่คืน/ไม่ปิดคำขอไปที่ใบที่ถูกยกเลิก
    //   ลำดับล็อก: advisory พนักงาน → คำขอ → รอบ (FOR SHARE) → แถวใบเดิม → reserveSeq · ยกเลิก/ดาวน์โหลดถือแค่แถวใบ (ไม่รออะไรต่อ) · กลับรายการไม่แตะแถวใบ ⇒ ไม่มีวงล็อก
    const dup0 = (
      await tx.$queryRaw<{ id: string; docNo: string }[]>`
        SELECT "id", "docNo" FROM "HrSalaryCertificate"
        WHERE "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId} AND "employeeId" = ${emp.id} AND "status" = 'ISSUED' AND "voidedAt" IS NULL
          AND "purpose" = ${purpose} AND "contentJson"->'salary'->>'runId' = ${src.run.id}
        ORDER BY "issuedAt" DESC, "id" DESC LIMIT 1 FOR UPDATE`
    )[0];
    const dup = dup0
      ? (await tx.$queryRaw<{ id: string; docNo: string }[]>`SELECT "id", "docNo" FROM "HrSalaryCertificate" WHERE "id" = ${dup0.id} AND "status" = 'ISSUED' AND "voidedAt" IS NULL`)[0]
      : undefined;
    if (dup) {
      if (!open) return { ok: true, certId: dup.id, docNo: dup.docNo, audit: null };
      // คำขอที่รออยู่ = ได้ใบเดิมแล้ว ⇒ ปิดคำขอ (ผู้ตัดสิน = ผู้ออก · เนื้อหาชี้ไปใบเดิม) — อนุมัติซ้ำภายหลังไม่ได้อีก
      const u = await tx.hrSalaryCertificate.updateMany({
        where: { id: open.id, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "REQUESTED" },
        data: { status: "CANCELLED", decidedById: m.userId, decidedAt: now, contentJson: { fulfilledBy: dup.id, docNo: dup.docNo } as Prisma.InputJsonValue },
      });
      if (u.count !== 1) return refuse("NOT_DECIDABLE", "notDecidable");
      return { ok: true, certId: dup.id, docNo: dup.docNo, audit: { certId: dup.id, docNo: dup.docNo, requestedById: open.requestedById, requestId: open.id } };
    }
    const prof = await tx.hrFilingProfile.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { employerName: true, employerAddress: true, signerName: true } });
    const employerName = cleanText(prof?.employerName);
    const signerName = cleanText(prof?.signerName);
    if (!employerName || !signerName) return refuse("PROFILE", "profile");
    // เลขที่ — ตัวนับของเครื่องออกเลข (ระบบ HR · WHT_CERT · งวด HRSC:<ปี ค.ศ. ของวันออก เวลาไทย>) = ล็อกสุดท้าย
    const issueDate = bkkDayOf(now);
    const seq = await reserveSeq(tx, { tenantId: ctx.tenantId, systemId: ctx.systemId, docType: "WHT_CERT", prefix: "HRSC", periodKey: `HRSC:${issueDate.slice(0, 4)}`, startNo: 1 });
    const content = salaryCertContent({
      seq,
      issueDate,
      purpose,
      employer: { name: employerName, address: cleanOrNull(prof?.employerAddress) },
      employee: { name: cleanText(emp.name), position: cleanOrNull(emp.position), startDate: dayOrNull(emp.startDate), endDate: dayOrNull(emp.endDate), active: emp.active && emp.employmentStatus !== "ENDED" },
      salary: { amountSatang: base.amountSatang, periodKey: src.run.periodKey, runId: src.run.id },
      signerName,
    });
    const data = {
      status: "ISSUED", decidedById: m.userId, decidedAt: now, docSeq: seq, docNo: content.docNo, contentJson: content as unknown as Prisma.InputJsonValue,
      contentSha256: sha256(canon(content)), issuedAt: now, issuedById: m.userId,
    };
    if (open) {
      // ทางคำขอ หรือออกตรงขณะมีคำขอรออยู่ (ruling D) = แถวคำขอกลายเป็นใบที่ออก (วัตถุประสงค์ = ที่ผู้ออกเลือก) · อนุมัติภายหลังไม่ได้อีก
      const u = await tx.hrSalaryCertificate.updateMany({ where: { id: open.id, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "REQUESTED" }, data: { ...data, purpose } });
      if (u.count !== 1) throw new Error("salary-cert request moved under lock");
      return { ok: true, certId: open.id, docNo: content.docNo, audit: { certId: open.id, docNo: content.docNo, requestedById: open.requestedById } };
    }
    const row = await tx.hrSalaryCertificate.create({ data: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: emp.id, purpose, ...data }, select: { id: true } });
    return { ok: true, certId: row.id, docNo: content.docNo, audit: { certId: row.id, docNo: content.docNo } };
  });
  if (!out.ok) return out;
  if (out.audit) await writeAudit({ tenantId: ctx.tenantId, actorType: "USER", actorId: m.userId, action: "hr.salarycert.issue", targetType: "HrSalaryCertificate", targetId: out.audit.certId, after: { certId: out.audit.certId, docNo: out.audit.docNo, employeeId, ...(out.audit.requestedById !== undefined ? { requestedById: out.audit.requestedById, issuedById: m.userId } : {}), ...(out.audit.requestId ? { requestId: out.audit.requestId } : {}) } }); // ruling 3: คำขอ ⇒ ผู้ขอ + ผู้ออก
  return { ok: true, certId: out.certId, docNo: out.docNo };
}

/** ไม่อนุมัติคำขอ (ผู้ผ่านด่าน · ไม่ใช่คำขอของตัวเอง เว้นแต่ OWNER) */
export async function rejectSalaryCertRequest(ctx: Ctx, viewer: PayslipViewer, input: { requestId: unknown }, opts?: Opts): Promise<{ ok: true } | Refusal> {
  const m = await certGate(ctx, viewer);
  const requestId = str(obj(input).requestId);
  if (!m || !ID_RE.test(requestId)) return NO();
  const now = nowOf(opts);
  const db = tenantDb(ctx) as unknown as Db;
  const r = await db.hrSalaryCertificate.findFirst({ where: { id: requestId, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { employeeId: true } });
  if (!r) return NO();
  const out = await runTx(ctx, async (tx): Promise<{ ok: true } | Refusal> => {
    await lockEmp(tx, ctx, r.employeeId);
    const emp = await tx.hrEmployee.findFirst({ where: { id: r.employeeId, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { linkedUserId: true } });
    if (m.role !== "OWNER" && emp?.linkedUserId && emp.linkedUserId === m.userId) return refuse("OWN", "own");
    const rows = await tx.$queryRaw<{ status: string }[]>`SELECT "status" FROM "HrSalaryCertificate" WHERE "id" = ${requestId} AND "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId} FOR UPDATE`;
    if (rows[0]?.status !== "REQUESTED") return refuse("NOT_DECIDABLE", "notDecidable");
    await tx.hrSalaryCertificate.updateMany({ where: { id: requestId, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "REQUESTED" }, data: { status: "REJECTED", decidedById: m.userId, decidedAt: now } });
    return { ok: true };
  });
  if (out.ok) await writeAudit({ tenantId: ctx.tenantId, actorType: "USER", actorId: m.userId, action: "hr.salarycert.reject", targetType: "HrSalaryCertificate", targetId: requestId, after: { certId: requestId } });
  return out;
}

/** ยกเลิกใบที่ออกแล้ว (OWNER เท่านั้น) — เลขไม่ถูกคืน · เหตุผลเก็บในแถว ไม่ลงประวัติ */
export async function voidSalaryCertificate(ctx: Ctx, viewer: PayslipViewer, input: { certId: unknown; reason: unknown }, opts?: Opts): Promise<{ ok: true } | Refusal> {
  const m = await certGate(ctx, viewer);
  const q = obj(input);
  const certId = str(q.certId);
  if (!m || !ID_RE.test(certId)) return NO();
  if (m.role !== "OWNER" || viewer.role !== "OWNER") return refuse("CERT_VOID_OWNER", "certVoidOwner");
  const reason = str(q.reason).trim();
  if (reason.length < 1 || reason.length > 200 || CONTROL.test(reason)) return refuse("VOID_REASON", "voidReason");
  const db = tenantDb(ctx) as unknown as Db;
  const c = await db.hrSalaryCertificate.findFirst({ where: { id: certId, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ISSUED" }, select: { id: true, docNo: true, voidedAt: true } });
  if (!c) return NO();
  if (c.voidedAt) return refuse("VOIDED", "voided");
  const u = await db.hrSalaryCertificate.updateMany({ where: { id: c.id, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ISSUED", voidedAt: null }, data: { voidedAt: nowOf(opts), voidedById: m.userId, voidReason: reason } });
  if (u.count !== 1) return refuse("VOIDED", "voided");
  await writeAudit({ tenantId: ctx.tenantId, actorType: "USER", actorId: m.userId, action: "hr.salarycert.void", targetType: "HrSalaryCertificate", targetId: c.id, after: { certId: c.id, docNo: c.docNo } });
  return { ok: true };
}

/** ใบที่ออกแล้ว → PDF จากเนื้อหาที่แช่แข็ง (ตรวจ sha ก่อน) · นับดาวน์โหลด */
async function certPdf(ctx: Ctx, where: { id: string; employeeId?: string }, liveOnly: boolean, audit: { actorId: string; by: "GATE" | "SELF" }): Promise<(DownloadOk & { certId: string }) | Refusal> {
  if (!ID_RE.test(where.id)) return NO();
  const db = tenantDb(ctx) as unknown as Db;
  // ruling 2: id ของคำขอที่ได้ใบเดิม = ดาวน์โหลดใบนั้น (หนึ่งทอด · พนักงานคนเดียวกันเมื่อเป็นของฉัน)
  const req = await db.hrSalaryCertificate.findFirst({ where: { ...where, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "CANCELLED" }, select: { status: true, contentJson: true } });
  const hop = req ? fulfilledBy(req) : "";
  if (hop) where = { ...where, id: hop };
  const c = (await db.hrSalaryCertificate.findFirst({ where: { ...where, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ISSUED" }, select: CERT_SELECT })) as CertRow | null;
  if (!c || !c.docNo || (liveOnly && c.voidedAt)) return NO();
  if (c.voidedAt) return refuse("VOIDED", "voided");
  if (!c.contentSha256 || sha256(canon(c.contentJson)) !== c.contentSha256) return refuse("CERT_CHANGED", "certChanged");
  const bytes = await renderSalaryCertPdf(c.contentJson as SalaryCertContent);
  // merge round m3: ตัวนับ + ประวัติในธุรกรรมเดียว — ประวัติล้ม = ตัวนับไม่ขยับ และไม่ส่งไฟล์ (โยนออก)
  // fix round 2 (ruling B): ล็อกแถวใบ (FOR UPDATE) แล้วตรวจซ้ำ ISSUED · ไม่ถูกยกเลิก · sha เดิม — ยกเลิกระหว่างดาวน์โหลด = ปฏิเสธ ไม่ส่งไฟล์ ไม่นับ ไม่ลงประวัติ
  const live = await runTx(ctx, async (tx): Promise<"OK" | "VOIDED" | "CHANGED"> => {
    const cur = await tx.$queryRaw<{ status: string; voided: boolean; sha: string | null; same: boolean }[]>`
      SELECT "status", ("voidedAt" IS NOT NULL) AS "voided", "contentSha256" AS "sha", ("contentJson" = ${JSON.stringify(c.contentJson)}::jsonb) AS "same" FROM "HrSalaryCertificate"
      WHERE "id" = ${c.id} AND "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId} FOR UPDATE`;
    if (cur[0]?.status !== "ISSUED" || cur[0].voided) return "VOIDED";
    if (cur[0].sha !== c.contentSha256 || !cur[0].same) return "CHANGED";
    const u = await tx.hrSalaryCertificate.updateMany({ where: { id: c.id, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ISSUED", voidedAt: null }, data: { downloads: { increment: 1 } } });
    if (u.count !== 1) return "VOIDED";
    await auditIn(tx, { tenantId: ctx.tenantId, actorId: audit.actorId, action: "hr.salarycert.download", targetType: "HrSalaryCertificate", targetId: c.id, after: { certId: c.id, by: audit.by } });
    return "OK";
  });
  if (live === "CHANGED") return refuse("CERT_CHANGED", "certChanged");
  if (live !== "OK") return liveOnly ? NO() : refuse("VOIDED", "voided");
  return { ok: true, fileName: `${c.docNo}.pdf`, contentType: "application/pdf", bytes, certId: c.id };
}
export async function downloadSalaryCertificate(ctx: Ctx, viewer: PayslipViewer, input: { certId: unknown }): Promise<DownloadOk | Refusal> {
  const m = await certGate(ctx, viewer);
  if (!m) return NO();
  const r = await certPdf(ctx, { id: str(obj(input).certId) }, false, { actorId: m.userId, by: "GATE" });
  if (!r.ok) return r;
  return { ok: true, fileName: r.fileName, contentType: r.contentType, bytes: r.bytes };
}

// ═════════════ ตัวเอง (R6 · R11) — พนักงานจากเซสชันเท่านั้น (resolveSelf) ═════════════
const mySlipHref = (runId: string) => `/app/me/hr/pay/${runId}`;
const P2002 = (e: unknown) => (e as { code?: string })?.code === "P2002";
async function loadMine(meCtx: Ctx, meEmployeeId: string, runId: string): Promise<Loaded | null> {
  return runTx(meCtx, (tx) => loadSlip(tx, meCtx, runId, meEmployeeId));
}
function myCertDto(r: CertRow): MyCertRowDto {
  return { id: r.id, status: r.status, purpose: r.purpose, docNo: r.docNo, issuedAt: iso(r.issuedAt), requestedAt: iso(r.requestedAt), canCancel: r.status === "REQUESTED" };
}

/** สลิปที่ออกแล้วของฉัน แยกตามปีภาษี (ปีใหม่ก่อน) */
export async function mySlips(actor: SelfActor): Promise<MySlipsDto | Refusal> {
  const me = await resolveSelf(actor);
  if (!me) return NO();
  const rows = await runTx(me.ctx, (tx) => issuedRows(tx, me.ctx, me.employeeId, mySlipHref));
  return { ok: true, years: yearsOf(rows) };
}
/** สลิปของฉัน 1 รอบ (ISSUED เท่านั้น — อื่น ๆ = ไม่พบ) */
export async function mySlip(actor: SelfActor, input: { runId: unknown }): Promise<SlipDto | Refusal> {
  const me = await resolveSelf(actor);
  if (!me) return NO();
  const L = await loadMine(me.ctx, me.employeeId, str(obj(input).runId));
  if (!L || slipState(L.run) !== "ISSUED") return NO();
  return dtoOf(L);
}
export async function downloadMyPayslipPdf(actor: SelfActor, input: { runId: unknown }): Promise<DownloadOk | Refusal> {
  const me = await resolveSelf(actor);
  if (!me) return NO();
  const L = await loadMine(me.ctx, me.employeeId, str(obj(input).runId));
  if (!L || slipState(L.run) !== "ISSUED") return NO();
  const d = dtoOf(L);
  if (!d.ok) return d;
  const out = await slipPdf(me.ctx, d);
  await auditIn(tenantDb({ tenantId: me.ctx.tenantId }) as unknown as Db, { tenantId: me.ctx.tenantId, actorId: me.userId, action: "hr.payslip.download", targetType: "HrPayrollRun", targetId: L.run.id, after: { runId: L.run.id, employeeId: me.employeeId, periodKey: L.run.periodKey, by: "SELF" } });
  return out;
}
/** ขอหนังสือรับรองเงินเดือน (พนักงานที่ยังทำงาน · 1 คำขอที่รอต่อคน) */
export async function requestSalaryCertificate(actor: SelfActor, input: { purpose: unknown }, opts?: Opts): Promise<{ ok: true; certId: string } | Refusal> {
  const me = await resolveSelf(actor);
  if (!me) return NO();
  if (!me.active) return refuse("INACTIVE", "inactive");
  const purpose = obj(input).purpose;
  if (!isSlipPurpose(purpose)) return refuse("PURPOSE", "purpose");
  const db = tenantDb(me.ctx) as unknown as Db;
  const open = await db.hrSalaryCertificate.findFirst({ where: { tenantId: me.ctx.tenantId, systemId: me.ctx.systemId, employeeId: me.employeeId, status: "REQUESTED" }, select: { id: true } });
  if (open) return refuse("CERT_REQ_OPEN", "certReqOpen");
  let certId: string;
  try {
    certId = (await db.hrSalaryCertificate.create({ data: { tenantId: me.ctx.tenantId, systemId: me.ctx.systemId, employeeId: me.employeeId, status: "REQUESTED", purpose, requestedById: me.userId, requestedAt: nowOf(opts) }, select: { id: true } })).id;
  } catch (e) {
    if (P2002(e)) return refuse("CERT_REQ_OPEN", "certReqOpen");
    throw e;
  }
  await writeAudit({ tenantId: me.ctx.tenantId, actorType: "USER", actorId: me.userId, action: "hr.salarycert.request", targetType: "HrSalaryCertificate", targetId: certId, after: { certId, purpose } });
  return { ok: true, certId };
}
/** ยกเลิกคำขอของฉันที่ยังรออยู่ */
export async function cancelMySalaryCertRequest(actor: SelfActor, input: { certId: unknown }, opts?: Opts): Promise<{ ok: true } | Refusal> {
  const me = await resolveSelf(actor);
  const certId = str(obj(input).certId);
  if (!me || !ID_RE.test(certId)) return NO();
  const db = tenantDb(me.ctx) as unknown as Db;
  const r = await db.hrSalaryCertificate.findFirst({ where: { id: certId, tenantId: me.ctx.tenantId, systemId: me.ctx.systemId, employeeId: me.employeeId }, select: { status: true } });
  if (!r) return NO();
  const u = await db.hrSalaryCertificate.updateMany({ where: { id: certId, tenantId: me.ctx.tenantId, systemId: me.ctx.systemId, employeeId: me.employeeId, status: "REQUESTED" }, data: { status: "CANCELLED", decidedById: me.userId, decidedAt: nowOf(opts) } });
  if (u.count !== 1) return refuse("NOT_DECIDABLE", "notDecidable");
  await writeAudit({ tenantId: me.ctx.tenantId, actorType: "USER", actorId: me.userId, action: "hr.salarycert.cancel", targetType: "HrSalaryCertificate", targetId: certId, after: { certId } });
  return { ok: true };
}
/** คำขอ/ใบของฉัน (ยกเลิกคำขอแล้ว · ใบที่ถูกยกเลิก = ไม่แสดง) */
export async function listMySalaryCertificates(actor: SelfActor): Promise<{ ok: true; items: MyCertRowDto[] } | Refusal> {
  const me = await resolveSelf(actor);
  if (!me) return NO();
  const db = tenantDb(me.ctx) as unknown as Db;
  const rows = (await db.hrSalaryCertificate.findMany({
    where: { tenantId: me.ctx.tenantId, systemId: me.ctx.systemId, employeeId: me.employeeId, status: { not: "CANCELLED" }, voidedAt: null },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 50,
    select: CERT_SELECT,
  })) as CertRow[];
  // ruling 2: คำขอที่ได้ใบเดิม = "ออกให้แล้ว — เลขที่ …" (เฉพาะเมื่อใบนั้นยังใช้ได้) · ไม่แสดงเป็นยกเลิก
  const ful = await fulfilledRows(db, me.ctx, me.employeeId);
  const tgt = await targetsOf(db, me.ctx, ful);
  const extra: MyCertRowDto[] = ful.flatMap((r) => {
    const d = tgt.get(fulfilledBy(r));
    return d && !d.voidedAt && d.employeeId === me.employeeId ? [{ id: r.id, status: "FULFILLED", purpose: r.purpose, docNo: d.docNo, issuedAt: iso(d.issuedAt), requestedAt: iso(r.requestedAt), canCancel: false }] : [];
  });
  const items = [...rows.map(myCertDto), ...extra].sort((a, c) => (c.requestedAt ?? c.issuedAt ?? "").localeCompare(a.requestedAt ?? a.issuedAt ?? "") || (a.id < c.id ? 1 : -1));
  return { ok: true, items: items.slice(0, 50) };
}
/** ใบที่ออกแล้วของฉัน (ยังไม่ถูกยกเลิก) → PDF */
export async function downloadMySalaryCertificate(actor: SelfActor, input: { certId: unknown }): Promise<DownloadOk | Refusal> {
  const me = await resolveSelf(actor);
  if (!me) return NO();
  const r = await certPdf(me.ctx, { id: str(obj(input).certId), employeeId: me.employeeId }, true, { actorId: me.userId, by: "SELF" });
  if (!r.ok) return r.code === "CERT_CHANGED" ? r : NO();
  return { ok: true, fileName: r.fileName, contentType: r.contentType, bytes: r.bytes };
}
// ◂ HR H3.8

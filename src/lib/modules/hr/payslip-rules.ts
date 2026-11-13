// HR H3.8 ▸ สลิปเงินเดือน · ประวัติรายปี · หนังสือรับรองเงินเดือน — ชั้น pure (ไม่มีฐานข้อมูล/นาฬิกา/สุ่ม/เข้ารหัส) · brief hr-brief-H3.8 R2–R5 R8 R11 R12
//   🔴 สลิป = ภาพถ่ายของสิ่งที่เก็บไว้: ตัวเลขทุกตัวมาจากคอลัมน์ของ HrPayrollItem + snapshotJson (รุ่น 2 = lines ของ H3.4 · รุ่น 1 = snapshot เดิม)
//      ไม่คำนวณอัตรา/ตัวคูณ/เพดานใด ๆ ใหม่ · ข้อมูลไม่ครบ/ไม่ตรงกัน = ปฏิเสธ SLIP_DATA (ไม่ซ่อม) · หมายเหตุของรายการเพิ่ม/หักรุ่น 1 ไม่ถูกคัดลอก
//   ข้อความ = ถ้อยคำกลาง ๆ ไม่ยืนยันข้อกฎหมาย (skill shark-thai-law [U]) — ส่วนที่ต้องตีความ "โปรดตรวจกับนักบัญชีของร้าน" ◂
import { bahtText } from "@/lib/modules/account/totals";
import { formatDocNo } from "@/lib/modules/account/doc-numbering";
import { itemFigures } from "./filings/figures";

// ═════════════ ข้อความ (R12) ═════════════
export const SLIP_TEXT = {
  no: "ไม่พบสลิปหรือเอกสารนี้ หรือคุณไม่มีสิทธิ์เปิด",
  notIssued: "รอบจ่ายนี้ยังเป็นร่าง — ยังออกสลิปไม่ได้",
  notFinal: "รอบจ่ายนี้ยังปิดงานไม่เสร็จ — ยังออกสลิปไม่ได้",
  withdrawn: "รอบจ่ายนี้ถูกกลับรายการแล้ว — สลิปของรอบนี้ถูกถอนคืน",
  slipData: "ข้อมูลที่บันทึกไว้ของสลิปนี้ไม่ครบหรือไม่ตรงกัน — ระบบไม่แสดงตัวเลข กรุณาแจ้งผู้ดูแลเงินเดือน",
  certReqOpen: "มีคำขอหนังสือรับรองเงินเดือนที่รอดำเนินการอยู่แล้ว — ยกเลิกคำขอเดิมก่อน",
  certNoSlip: "ยังไม่มีสลิปที่ออกแล้วของพนักงานคนนี้ — ออกหนังสือรับรองเงินเดือนไม่ได้",
  certNoBase: "สลิปล่าสุดของพนักงานคนนี้ไม่มีบรรทัดเงินเดือนประจำ — ออกหนังสือรับรองเงินเดือนไม่ได้",
  profile: "ยังไม่ได้กรอกชื่อนายจ้างหรือชื่อผู้ลงนามในข้อมูลผู้จ่ายเงิน — กรอกในหน้าตั้งค่าก่อน",
  own: "ออกหนังสือรับรองเงินเดือนให้ตัวเองไม่ได้ — ให้เจ้าของร้านหรือผู้ดูแลคนอื่นเป็นผู้ออก",
  certVoidOwner: "ยกเลิกหนังสือรับรองเงินเดือนได้เฉพาะเจ้าของร้าน",
  voidReason: "กรุณาใส่เหตุผลการยกเลิก (1–200 ตัวอักษร)",
  voided: "หนังสือรับรองเงินเดือนฉบับนี้ถูกยกเลิกแล้ว",
  certChanged: "เนื้อหาหนังสือรับรองที่เก็บไว้ไม่ตรงกับตอนออก — ระบบไม่สร้างไฟล์ กรุณาแจ้งผู้ดูแล",
  purpose: "กรุณาเลือกวัตถุประสงค์จากรายการ",
  notDecidable: "คำขอนี้ไม่อยู่ในสถานะรอดำเนินการแล้ว — เปิดหน้านี้ใหม่",
  inactive: "คุณพ้นสภาพพนักงานแล้ว — ขอหนังสือรับรองผ่านแอปไม่ได้ ติดต่อผู้จัดการ",
  slipNote: "ตัวเลขในสลิปมาจากรอบจ่ายที่บันทึกไว้ · บัญชีธนาคารที่แสดงคือบัญชีที่บันทึกในระบบตอนนี้ · หากมีข้อสงสัยเรื่องภาษีหรือประกันสังคม โปรดตรวจกับนักบัญชีของร้าน",
  certNote: "ออกจากข้อมูลเงินเดือนที่บันทึกในระบบ ณ วันที่ออก · หากผู้รับต้องการข้อความหรือรูปแบบเฉพาะ โปรดตรวจกับนักบัญชีของร้าน",
} as const;
export type SlipTextKey = keyof typeof SLIP_TEXT;
export const SLIP_TEXT_EN: Record<SlipTextKey, string> = {
  no: "This payslip or document was not found, or you cannot open it.",
  notIssued: "This pay run is still a draft. No payslip yet.",
  notFinal: "This pay run is not finalised yet. No payslip yet.",
  withdrawn: "This pay run was reversed. Its payslips were withdrawn.",
  slipData: "The stored data of this payslip is incomplete or inconsistent. No figures are shown. Please tell the payroll admin.",
  certReqOpen: "You already have a pending salary certificate request. Cancel it first.",
  certNoSlip: "This employee has no issued payslip yet. A salary certificate cannot be issued.",
  certNoBase: "The latest payslip of this employee has no monthly salary line. A salary certificate cannot be issued.",
  profile: "The employer name or signer name is missing in the payer details. Fill them in on the settings page first.",
  own: "You cannot issue a salary certificate for yourself. Ask the owner or another admin.",
  certVoidOwner: "Only the owner can void a salary certificate.",
  voidReason: "Please give a void reason (1-200 characters).",
  voided: "This salary certificate was voided.",
  certChanged: "The stored certificate content no longer matches what was issued. No file was made. Please tell the admin.",
  purpose: "Please choose a purpose from the list.",
  notDecidable: "This request is no longer pending. Reload the page.",
  inactive: "Your employment has ended. You cannot request a certificate in the app. Please contact your manager.",
  slipNote: "Figures come from the stored pay run. The bank account shown is the one on file now. For tax or social security questions, please check with the shop's accountant.",
  certNote: "Issued from the payroll data stored on the issue date. If the recipient needs specific wording or a form, please check with the shop's accountant.",
};
/** ภาษาของข้อความปฏิเสธ — "en" = อังกฤษ · อื่น ๆ/null = ไทย */
export function slipTextFor(locale: string | null | undefined): Record<SlipTextKey, string> {
  return locale === "en" ? SLIP_TEXT_EN : SLIP_TEXT;
}

// ═════════════ รหัสบรรทัด (R4) ═════════════
/** ฝั่งรายได้ (ค่าตามที่เก็บ มีเครื่องหมาย) ตามลำดับที่แสดง */
export const EARN_ORDER = ["BASE", "DAY_WAGE", "HOUR_WAGE", "HOLIDAY_PAY", "HOLIDAY_WORK", "PRORATION", "UNPAID_LEAVE", "UNPAID_CAP", "OT", "COMMISSION", "BONUS", "ALLOWANCE", "REFUND", "V1_OTHER"] as const;
/** ฝั่งรายการหัก (แสดงเป็นบวก) ตามลำดับที่แสดง */
export const DEDUCT_ORDER = ["LATE_RULE", "ABSENT_RULE", "ADVANCE", "DEDUCTION", "V1_OTHER", "SSO", "WHT"] as const;
const V2_EARN = new Set<string>(["BASE", "DAY_WAGE", "HOUR_WAGE", "HOLIDAY_PAY", "HOLIDAY_WORK", "PRORATION", "UNPAID_LEAVE", "UNPAID_CAP", "OT", "COMMISSION", "BONUS", "ALLOWANCE", "REFUND"]);
const V2_DEDUCT = new Set<string>(["LATE_RULE", "ABSENT_RULE", "ADVANCE", "DEDUCTION"]);
const V1_EARN = new Set<string>(["OT", "COMMISSION", "BONUS", "ALLOWANCE"]);
const V1_DEDUCT = new Set<string>(["DEDUCTION", "ADVANCE"]);

export type SlipLine = { code: string; amountSatang: number; count: number; qty: number | null };
export type SlipViewOk = {
  ok: true;
  earnings: SlipLine[];
  deductions: SlipLine[];
  earningsSatang: number;
  deductionsSatang: number;
  netSatang: number;
  ssoBaseSatang: number;
  employerSsoSatang: number;
  flags: string[];
};
export type SlipViewFail = { ok: false; code: "SLIP_DATA" };
const FAIL: SlipViewFail = { ok: false, code: "SLIP_DATA" };

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);
const isSatang = (v: unknown): v is number => isInt(v) && v >= 0;
const objOf = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** รวมแถวรหัสเดียวกัน (count = จำนวนแถว · qty = Σ minutes ที่เก็บไว้ เมื่อทุกแถวมี ไม่งั้น null) */
function merge(rows: { code: string; amountSatang: number; minutes: number | null }[], order: readonly string[]): SlipLine[] {
  const by = new Map<string, { amount: number; count: number; qty: number | null; allQty: boolean }>();
  for (const r of rows) {
    const c = by.get(r.code) ?? { amount: 0, count: 0, qty: 0, allQty: true };
    c.amount += r.amountSatang;
    c.count += 1;
    if (isInt(r.minutes) && r.minutes >= 0 && c.allQty) c.qty = (c.qty ?? 0) + r.minutes;
    else c.allQty = false;
    by.set(r.code, c);
  }
  const out: SlipLine[] = [];
  for (const code of order) {
    const c = by.get(code);
    if (!c) continue;
    if (c.amount === 0 && code !== "SSO" && code !== "WHT") continue;
    out.push({ code, amountSatang: c.amount, count: c.count, qty: c.allQty ? c.qty : null });
  }
  return out;
}

/** แถวรายการเงินเดือนที่เก็บไว้ → สลิป (earnings − deductions = net เสมอ) · ไม่ตรง/ไม่ครบ = SLIP_DATA */
export function slipView(input: { engineVersion: unknown; item: unknown }): SlipViewOk | SlipViewFail {
  const ev = input?.engineVersion;
  const it = objOf(input?.item);
  if (!it || (ev !== 1 && ev !== 2)) return FAIL;
  const { grossSatang, netSatang, ssoBaseSatang, ssoEmployeeSatang, ssoEmployerSatang, whtSatang } = it;
  if (!isSatang(grossSatang) || !isSatang(netSatang) || !isSatang(ssoBaseSatang) || !isSatang(ssoEmployeeSatang) || !isSatang(ssoEmployerSatang) || !isSatang(whtSatang)) return FAIL;
  if (netSatang !== grossSatang - ssoEmployeeSatang - whtSatang) return FAIL;
  const snap = objOf(it.snapshotJson);
  if (!snap) return FAIL;
  const earn: { code: string; amountSatang: number; minutes: number | null }[] = [];
  const ded: { code: string; amountSatang: number; minutes: number | null }[] = [];
  const flags: string[] = [];
  if (ev === 2) {
    const lines = snap.lines;
    if (!Array.isArray(lines)) return FAIL;
    let sum = 0;
    for (const raw of lines) {
      const l = objOf(raw);
      if (!l || typeof l.code !== "string" || !isInt(l.amountSatang)) return FAIL;
      const minutes = l.minutes === null || l.minutes === undefined ? null : isInt(l.minutes) ? l.minutes : NaN;
      if (Number.isNaN(minutes)) return FAIL;
      sum += l.amountSatang;
      if (V2_EARN.has(l.code)) earn.push({ code: l.code, amountSatang: l.amountSatang, minutes: minutes as number | null });
      else if (V2_DEDUCT.has(l.code)) ded.push({ code: l.code, amountSatang: -l.amountSatang, minutes: minutes as number | null });
      else return FAIL;
    }
    if (!Number.isSafeInteger(sum) || sum !== grossSatang) return FAIL;
  } else {
    const base = snap.baseSalarySatang;
    const adj = snap.adjustments;
    if (!isSatang(base) || !Array.isArray(adj)) return FAIL;
    earn.push({ code: "BASE", amountSatang: base, minutes: null });
    let expected = base;
    for (const raw of adj) {
      const a = objOf(raw);
      if (!a || typeof a.kind !== "string" || !isSatang(a.amountSatang)) return FAIL;
      if (V1_EARN.has(a.kind)) {
        earn.push({ code: a.kind, amountSatang: a.amountSatang, minutes: null });
        expected += a.amountSatang;
      } else if (V1_DEDUCT.has(a.kind)) {
        ded.push({ code: a.kind, amountSatang: a.amountSatang, minutes: null });
        expected -= a.amountSatang;
      } else return FAIL;
    }
    if (!Number.isSafeInteger(expected)) return FAIL;
    const gap = grossSatang - expected;
    if (gap > 0) earn.push({ code: "V1_OTHER", amountSatang: gap, minutes: null });
    if (gap < 0) ded.push({ code: "V1_OTHER", amountSatang: -gap, minutes: null });
    if (gap !== 0) flags.push("V1_OTHER");
  }
  ded.push({ code: "SSO", amountSatang: ssoEmployeeSatang, minutes: null }, { code: "WHT", amountSatang: whtSatang, minutes: null });
  const earnings = merge(earn, EARN_ORDER);
  const deductions = merge(ded, DEDUCT_ORDER);
  const earningsSatang = earnings.reduce((a, l) => a + l.amountSatang, 0);
  const deductionsSatang = deductions.reduce((a, l) => a + l.amountSatang, 0);
  if (earningsSatang - deductionsSatang !== netSatang) return FAIL;
  return { ok: true, earnings, deductions, earningsSatang, deductionsSatang, netSatang, ssoBaseSatang, employerSsoSatang: ssoEmployerSatang, flags };
}

// ═════════════ สถานะสลิป (R5) — ตัวเลือกเดียวกับ H3.6 (รุ่น 2 ต้อง stepsJson.finalized) ═════════════
export type SlipState = "ISSUED" | "NOT_FINAL" | "DRAFT" | "WITHDRAWN";
export function slipState(input: { status: unknown; engineVersion: unknown; finalized: unknown }): SlipState {
  const s = input?.status;
  if (s === "REVERSED") return "WITHDRAWN";
  if (s !== "APPROVED" && s !== "PAID") return "DRAFT";
  if (input?.engineVersion === 2) return input?.finalized === true ? "ISSUED" : "NOT_FINAL";
  return "ISSUED";
}
/** stepsJson → ปิดงานแล้ว (H3.4) */
export const finalizedOf = (steps: unknown): boolean => objOf(steps)?.finalized === true;

// ═════════════ ปีภาษี + ยอดรายปี (R8) ═════════════
/** ปีภาษี = ปี ค.ศ. ตามเวลาไทยของวันที่จ่าย */
export function taxYearOf(payDate: Date | string): number {
  const t = (payDate instanceof Date ? payDate : new Date(payDate)).getTime();
  return new Date(t + 7 * 3_600_000).getUTCFullYear();
}
/** "YYYY-MM-DD" ตามเวลาไทย */
export function bkkDayOf(d: Date | string): string {
  const t = (d instanceof Date ? d : new Date(d)).getTime();
  return new Date(t + 7 * 3_600_000).toISOString().slice(0, 10);
}
export type YearRow<S = unknown> = { payDate: Date | string; grossSatang: number; netSatang: number; whtSatang: number; ssoEmployeeSatang: number; incomeSatang: number; slip?: S };
export type YearTotal<S = unknown> = { taxYear: number; count: number; grossSatang: number; incomeSatang: number; taxSatang: number; ssoSatang: number; netSatang: number; slips: S[] };
/** รวมต่อปีภาษี (ปีใหม่ก่อน · สลิปในปีวันจ่ายใหม่ก่อน) — income = เงินได้ 40(1) ของ H3.6 (itemFigures) · gross แยกต่างหาก */
export function yearTotals<S = unknown>(rows: readonly YearRow<S>[]): YearTotal<S>[] {
  const by = new Map<number, { t: YearTotal<S>; rs: YearRow<S>[] }>();
  for (const r of rows) {
    const y = taxYearOf(r.payDate);
    const e = by.get(y) ?? { t: { taxYear: y, count: 0, grossSatang: 0, incomeSatang: 0, taxSatang: 0, ssoSatang: 0, netSatang: 0, slips: [] }, rs: [] };
    e.t.count += 1;
    e.t.grossSatang += r.grossSatang;
    e.t.incomeSatang += r.incomeSatang;
    e.t.taxSatang += r.whtSatang;
    e.t.ssoSatang += r.ssoEmployeeSatang;
    e.t.netSatang += r.netSatang;
    e.rs.push(r);
    by.set(y, e);
  }
  const time = (r: YearRow<S>) => (r.payDate instanceof Date ? r.payDate : new Date(r.payDate)).getTime();
  return [...by.values()]
    .sort((a, b) => b.t.taxYear - a.t.taxYear)
    .map(({ t, rs }) => ({ ...t, slips: [...rs].sort((a, b) => time(b) - time(a)).flatMap((r) => (r.slip === undefined ? [] : [r.slip])) }));
}
/** เงินได้ 40(1) ของแถว (ตัวเดียวกับ 50 ทวิ ของ H3.6) — null = ข้อมูลเสีย */
export function slipIncome(engineVersion: unknown, item: Record<string, unknown>): number | null {
  const f = itemFigures({ engineVersion, whtSatang: item.whtSatang, addSatang: item.addSatang, ssoBaseSatang: item.ssoBaseSatang, ssoEmployeeSatang: item.ssoEmployeeSatang, ssoEmployerSatang: item.ssoEmployerSatang, snapshotJson: item.snapshotJson });
  return f.ok ? f.incomeSatang : null;
}

// ═════════════ บัญชีธนาคาร (R10) — "<ธนาคาร> •••<4 ตัวท้าย>" · ตัวเลข < 4 หลัก = null ═════════════
export function bankMaskedOf(bankName: string | null | undefined, accountNo: string | null | undefined): string | null {
  const digits = String(accountNo ?? "").replace(/\D/g, "");
  if (digits.length < 4) return null;
  const name = String(bankName ?? "").trim();
  return `${name ? `${name} ` : ""}•••${digits.slice(-4)}`;
}

// ═════════════ หนังสือรับรองเงินเดือน (R11) ═════════════
export const SLIP_PURPOSES = ["GENERAL", "BANK", "VISA", "RENTAL", "OTHER"] as const;
export type SlipPurpose = (typeof SLIP_PURPOSES)[number];
export const isSlipPurpose = (v: unknown): v is SlipPurpose => typeof v === "string" && (SLIP_PURPOSES as readonly string[]).includes(v);
/** เลขที่ = formatDocNo("HRSC-{ปี}-{0000}") ด้วยวันออก (เที่ยงวันเวลาไทย) */
export function salaryCertDocNo(seq: number, issueDate: string): string {
  return formatDocNo("HRSC-{ปี}-{0000}", { prefix: "HRSC", date: new Date(`${issueDate}T12:00:00+07:00`), seq });
}
export type SalaryCertContent = {
  v: 1;
  docNo: string;
  issueDate: string;
  purpose: string;
  employer: { name: string; address: string | null };
  employee: { name: string; position: string | null; startDate: string | null; endDate: string | null; active: boolean };
  salary: { basis: "MONTHLY_BASE"; amountSatang: number; words: string; periodKey: string; runId: string };
  signerName: string;
  disclaimer: string;
};
/** เนื้อหาที่แช่แข็ง (ไม่มีเลขประจำตัวประชาชน — Q6) */
export function salaryCertContent(input: {
  seq: number;
  issueDate: string;
  purpose: string;
  employer: SalaryCertContent["employer"];
  employee: SalaryCertContent["employee"];
  salary: { amountSatang: number; periodKey: string; runId: string };
  signerName: string;
}): SalaryCertContent {
  return {
    v: 1,
    docNo: salaryCertDocNo(input.seq, input.issueDate),
    issueDate: input.issueDate,
    purpose: input.purpose,
    employer: input.employer,
    employee: input.employee,
    salary: { basis: "MONTHLY_BASE", amountSatang: input.salary.amountSatang, words: bahtText(input.salary.amountSatang), periodKey: input.salary.periodKey, runId: input.salary.runId },
    signerName: input.signerName,
    disclaimer: SLIP_TEXT.certNote,
  };
}
// ◂ HR H3.8

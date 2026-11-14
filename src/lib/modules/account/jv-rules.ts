// jv-rules.ts — กติกาของ JV มือ (ACC T4.1 · ปิด D1 D2) · pure ล้วน (ฝั่ง client import ได้ — ฟอร์มแสดงคำเตือนล่วงหน้าด้วยตัวเดียวกับ server)
//
//   คำอธิบาย (ข้อ 5 · ข้อ 11) — ว่าง = คำเตือนต้องกดยืนยัน (ไม่บล็อก)
//   เอกสารประกอบ (ข้อ 13) — ไม่มีไฟล์แนบ/เอกสารอ้างอิง = แจ้งให้ทราบ
//   ผู้อนุมัติ (ข้อ 11) — ยังไม่อนุมัติ = แจ้งให้ทราบ
//   ลงรายการช้า (ข้อ 7 · ฉ.161 ข้อ 3) — ตามประเภทผู้ประกอบการ · ค่าตัวเลขจากตาราง "สมุดบัญชี" (th-tax-2569 SYSTEM_BOOK_ROWS · ร้านทับได้)
// design note: ledger/wo-notes/T4.1.md
import { legalWarning, type LegalWarning } from "@/lib/core/settings/legal/warnings";

/** ค่ากฎที่ใช้ (ผู้เรียกอ่านจากตารางค่ากฎหมายของสมุด — bookRuleFrom) · null = ไม่มีแถว (ไม่เตือนข้อนั้น) */
export type JvLateRules = {
  journalDays: number | null;
  journalSource?: string;
  ledgerDays: number | null;
  ledgerSource?: string;
  cashWorkingDays: number | null;
  cashSource?: string;
};

/** ประเภทผู้ประกอบการ (ตรง ENTITY_KINDS) — แยกไว้ไม่ import ตารางทั้งก้อน */
export type JvEntityKind = "UNSET" | "INDIVIDUAL" | "ORDINARY_PARTNERSHIP" | "JURISTIC_PARTNERSHIP" | "COMPANY" | "OTHER";

const DAY = 86_400_000;
const ymdMs = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`);
const msYmd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** ymd + n วันปฏิทิน */
export function addDaysYmd(ymd: string, n: number): string {
  return msYmd(ymdMs(ymd) + n * DAY);
}

/** วันสุดท้ายของเดือนของ ymd */
export function monthEndYmd(ymd: string): string {
  const [y, m] = ymd.split("-").map(Number);
  return msYmd(Date.UTC(y, m, 0));
}

/**
 * ymd + n วันทำการ (จันทร์–ศุกร์) · นับเริ่มวันถัดไป ("ภายใน 3 วันทำการ นับแต่วันที่มีรายได้" — ไม่นับวันแรก)
 * วันหยุดราชการไม่ได้หักออก (skill ไม่มีปฏิทินวันหยุด — ค่าเริ่มต้นของระบบ ดู T4.1.md) ⇒ เตือนเร็วกว่าจริงได้ ไม่ช้ากว่า
 */
export function addWorkingDaysYmd(ymd: string, n: number): string {
  let t = ymdMs(ymd);
  let left = n;
  while (left > 0) {
    t += DAY;
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6) left--;
  }
  return msYmd(t);
}

const daysBetween = (a: string, b: string) => Math.round((ymdMs(b) - ymdMs(a)) / DAY);

/** ใครใช้กติกาไหน — ป้ายที่จอแสดง */
export type JvLateBasis = "JOURNAL" | "CASH_REPORT" | "NONE";

/**
 * กติกากำหนดลงรายการของสมุดนี้:
 *   บจ. / หจก.-หสน. = ผู้มีหน้าที่จัดทำบัญชี (ม.8) → บัญชีรายวัน 15 วัน + แยกประเภท 15 วันหลังสิ้นเดือน [V]
 *   บุคคลธรรมดา / ห้างสามัญ-คณะบุคคล ไม่จด VAT → รายงานเงินสดรับ-จ่าย 3 วันทำการ (ฉ.161) [V] (คณะบุคคล [U] — เตือนตามกฎเดียวกัน)
 *   บุคคลธรรมดา / ห้างสามัญ จด VAT → ไม่อยู่ใต้ พ.ร.บ.การบัญชี และไม่อยู่ใต้ ฉ.161 ⇒ ไม่เตือน (รายงานภาษีมีกำหนดของตัวเอง)
 *   ยังไม่ระบุ / อื่น ๆ → ใช้กติกานิติบุคคลไปก่อน + ป้าย [S] (JV_LATE_ENTRY_ASSUMED)
 */
export function jvLateBasis(entityKind: JvEntityKind, vatRegistered: boolean): { basis: JvLateBasis; assumed: boolean } {
  if (entityKind === "COMPANY" || entityKind === "JURISTIC_PARTNERSHIP") return { basis: "JOURNAL", assumed: false };
  if (entityKind === "INDIVIDUAL" || entityKind === "ORDINARY_PARTNERSHIP") return vatRegistered ? { basis: "NONE", assumed: false } : { basis: "CASH_REPORT", assumed: false };
  return { basis: "JOURNAL", assumed: true };
}

const fmtTh = (ymd: string) => {
  const [y, m, d] = ymd.split("-");
  return `${Number(d)}/${Number(m)}/${y}`;
};

/**
 * คำเตือนลงรายการช้า (pure) — `dateYmd` = วันที่รายการ (วันที่ของ JV) · `recordedYmd` = วันที่บันทึกจริง (เวลาไทย)
 * คืน 0–2 คำเตือน (รายวัน และ/หรือ แยกประเภท) · ไม่บล็อก (ack=false)
 */
export function jvLateWarnings(input: {
  dateYmd: string;
  recordedYmd: string;
  entityKind: JvEntityKind;
  vatRegistered: boolean;
  rules: JvLateRules;
}): LegalWarning[] {
  const { dateYmd, recordedYmd, rules } = input;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd) || !/^\d{4}-\d{2}-\d{2}$/.test(recordedYmd) || recordedYmd <= dateYmd) return [];
  const { basis, assumed } = jvLateBasis(input.entityKind, input.vatRegistered);
  const code = assumed ? "JV_LATE_ENTRY_ASSUMED" : "JV_LATE_ENTRY";
  const out: LegalWarning[] = [];
  const push = (deadline: string, limit: string, rule: string, source: string | undefined) => {
    if (recordedYmd <= deadline) return;
    const over = daysBetween(deadline, recordedYmd);
    out.push(
      legalWarning(code, { date: fmtTh(dateYmd), recorded: fmtTh(recordedYmd), limit, rule, over: `${over} วัน` }, source ? { citation: source } : {}),
    );
  };
  if (basis === "JOURNAL") {
    if (rules.journalDays !== null) push(addDaysYmd(dateYmd, rules.journalDays), `${rules.journalDays} วัน`, "นับแต่วันที่รายการเกิด (บัญชีรายวัน)", rules.journalSource);
    if (rules.ledgerDays !== null) push(addDaysYmd(monthEndYmd(dateYmd), rules.ledgerDays), `${rules.ledgerDays} วัน`, "นับแต่วันสิ้นเดือนของเดือนที่รายการเกิด (บัญชีแยกประเภท)", rules.ledgerSource);
  } else if (basis === "CASH_REPORT" && rules.cashWorkingDays !== null) {
    push(addWorkingDaysYmd(dateYmd, rules.cashWorkingDays), `${rules.cashWorkingDays} วันทำการ`, "นับแต่วันที่มีรายได้หรือรายจ่าย (รายงานเงินสดรับ-จ่าย)", rules.cashSource);
  }
  return out;
}

/**
 * คำเตือนเนื้อหาของ JV มือ (pure):
 *   ไม่มีคำอธิบาย → JV_DESCRIPTION_MISSING (ต้องกดยืนยัน)
 *   ไม่มีไฟล์แนบ/เอกสารอ้างอิง → JV_NO_SUPPORTING_DOC (แจ้ง)
 *   ยังไม่มีผู้อนุมัติ → JV_UNAPPROVED (แจ้ง) — ส่ง approved=undefined เมื่อยังไม่รู้ (เช่น ตอนกรอกฟอร์ม)
 */
/** gl.postManualJV เติมข้อความนี้เมื่อไม่มีคำอธิบาย — ไม่ใช่คำอธิบายรายการจริง (ข้อ 5) ⇒ ถือว่าไม่มีคำอธิบาย */
export const MANUAL_JV_PLACEHOLDER_MEMO = "บันทึกบัญชีด้วยมือ";

export function jvContentWarnings(input: { memo: string | null | undefined; hasSupportingDoc: boolean; approved?: boolean; /** ใบที่บันทึกแล้ว (หน้ารายละเอียด) — ข้อความไม่ชวนกดยืนยัน */ saved?: boolean }): LegalWarning[] {
  const out: LegalWarning[] = [];
  const memo = (input.memo ?? "").trim();
  if (memo.length === 0 || memo === MANUAL_JV_PLACEHOLDER_MEMO) out.push(legalWarning("JV_DESCRIPTION_MISSING", input.saved ? { saved: 1 } : {}));
  if (!input.hasSupportingDoc) out.push(legalWarning("JV_NO_SUPPORTING_DOC"));
  if (input.approved === false) out.push(legalWarning("JV_UNAPPROVED"));
  return out;
}

/** วันไทย "YYYY-MM-DD" ของเวลาหนึ่ง */
export function bkkYmdOf(d: Date): string {
  return new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

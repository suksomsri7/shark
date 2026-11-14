// fiscal-rules.ts — รอบบัญชี: คำเตือนเปลี่ยนรอบ + รอบแรกสั้น · ป้ายงบ "ร่างสำหรับผู้ทำบัญชี/ผู้สอบบัญชี" (ACC T4.6 · ปิด A2 A5) · pure ล้วน
//
//   พ.ร.บ.การบัญชี ม.10 [V]: ปิดบัญชีครั้งแรกภายใน 12 เดือนนับแต่วันเริ่มทำบัญชี · ทุกรอบ 12 เดือน · เปลี่ยนรอบต้องได้รับอนุญาต
//   งบจากระบบ = ร่างสำหรับผู้ทำบัญชี/ผู้สอบบัญชี (domain-accounting-books §ก5 · ม.19 ผู้ทำบัญชีเป็นบุคคล ซอฟต์แวร์แทนไม่ได้ [V])
// design note: ledger/wo-notes/T4.6.md
import { legalWarning, type LegalWarning } from "@/lib/core/settings/legal/warnings";

/** ป้ายงบ (จอ · ใบพิมพ์ · ไฟล์ส่งออก · REST) — ข้อความเดียวทั้งระบบ */
export const STATEMENT_DRAFT_LABEL_TH = "ร่างสำหรับผู้ทำบัญชี/ผู้สอบบัญชี";

/** ก้อนป้ายงบที่ REST/AI ส่งออก */
export function statementDraft(): { draft: true; labelTh: string; warning: LegalWarning } {
  return { draft: true, labelTh: STATEMENT_DRAFT_LABEL_TH, warning: legalWarning("STATEMENT_DRAFT_FOR_ACCOUNTANT") };
}

const MONTH_TH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
export const monthLabelTh = (m: number) => MONTH_TH[(m - 1 + 12) % 12] ?? String(m);
const fmt = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${d} ${monthLabelTh(m)} ${y}`;
};

/**
 * ปีบัญชีแรก = ตั้งแต่วันเริ่มทำบัญชี ถึงวันสิ้นปีบัญชีที่ครอบวันนั้น (ตามเดือนเริ่มปีบัญชี)
 *   months = จำนวนเดือนปฏิทินที่ครอบ (นับเดือนแรกแม้เริ่มกลางเดือน) · fullMonths = เดือนเต็ม (เริ่มกลางเดือน = −1)
 */
export function firstFiscalPeriod(booksStartYmd: string, fiscalStartMonth: number): { start: string; end: string; months: number; fullMonths: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(booksStartYmd) || fiscalStartMonth < 1 || fiscalStartMonth > 12) return null;
  const [y, m, d] = booksStartYmd.split("-").map(Number);
  // ปีบัญชีที่ครอบ: เริ่ม (ปี, fiscalStartMonth) ที่ ≤ วันเริ่ม
  const startYear = m >= fiscalStartMonth ? y : y - 1;
  const endMonthIdx = startYear * 12 + (fiscalStartMonth - 1) + 11; // เดือนสุดท้ายของปีบัญชี (index)
  const ey = Math.floor(endMonthIdx / 12);
  const em = (endMonthIdx % 12) + 1;
  const end = new Date(Date.UTC(ey, em, 0)).toISOString().slice(0, 10);
  const months = endMonthIdx - (y * 12 + (m - 1)) + 1;
  return { start: booksStartYmd, end, months, fullMonths: d > 1 ? months - 1 : months };
}

/** รอบแรกสั้นกว่า 12 เดือน → FIRST_PERIOD_SHORT (แจ้งให้ทราบ) · limitMonths จากตาราง (FIRST_PERIOD_MAX_MONTHS) */
export function firstPeriodWarnings(booksStartYmd: string | null | undefined, fiscalStartMonth: number, limitMonths: number | null, citation?: string): LegalWarning[] {
  if (!booksStartYmd) return [];
  const p = firstFiscalPeriod(booksStartYmd, fiscalStartMonth);
  if (!p) return [];
  const short = p.months < 12 || (p.months === 12 && p.fullMonths < 12);
  if (!short) return [];
  const monthsTxt = p.fullMonths === p.months ? `${p.months}` : `ไม่ถึง ${p.months}`;
  return [legalWarning("FIRST_PERIOD_SHORT", { start: fmt(p.start), end: fmt(p.end), months: monthsTxt, limit: `${limitMonths ?? 12} เดือน` }, citation ? { citation } : {})];
}

/** เปลี่ยนเดือนเริ่มปีบัญชีของสมุดที่มีรายการแล้ว → FISCAL_YEAR_CHANGE (ต้องกดยืนยัน) · สมุดยังว่าง = ตั้งค่าครั้งแรก ไม่เตือน */
export function fiscalYearChangeWarnings(fromMonth: number, toMonth: number, hasEntries: boolean): LegalWarning[] {
  if (fromMonth === toMonth || !hasEntries) return [];
  return [legalWarning("FISCAL_YEAR_CHANGE", { from: monthLabelTh(fromMonth), to: monthLabelTh(toMonth) })];
}

// SVC H.1 ▸ ของใช้ร่วมของจอราคา (ภาพ 15 · ใบสั่ง h.1 §5) — pure ล้วน (ไม่มี directive · import type เท่านั้น)
//   วันที่จากสตริง "YYYY-MM-DD" เท่านั้น (ไม่อ่านนาฬิกา) · เงินเป็นสตางค์ Int
import type { RatePlanDto } from "@/lib/modules/hotel";

export type RatesTabKey = "calendar" | "plans" | "seasons" | "rules";
export const RATES_TABS: { key: RatesTabKey; labelTh: string }[] = [
  { key: "calendar", labelTh: "ปฏิทินราคา" },
  { key: "plans", labelTh: "แผนราคา" },
  { key: "seasons", labelTh: "ฤดู · วันพิเศษ" },
  { key: "rules", labelTh: "กติกา" },
];
export const ratesTabOf = (v: unknown): RatesTabKey => (v === "plans" || v === "seasons" || v === "rules" ? v : "calendar");

/** ผลของ action ราคา */
export type RatesActionResult = { ok: boolean; code?: string; reason?: string; plan?: { id: string } };
export type RatesAction = (input: unknown) => Promise<RatesActionResult>;
export type RatesActions = {
  saveRatePlan: RatesAction;
  archiveRatePlan: RatesAction;
  saveCancelRules: RatesAction;
  saveSeason: RatesAction;
  archiveSeason: RatesAction;
  saveHolidays: RatesAction;
  removeHoliday: RatesAction;
  saveRates: RatesAction;
  setOverride: RatesAction;
  clearOverride: RatesAction;
};

/** วันหยุดนักขัตฤกษ์ไทยที่วันที่คงที่ (เดือน-วัน) — ปุ่ม «ใช้ปฏิทินวันหยุดไทย» เพิ่มของปีที่ดูอยู่ · ร้านลบ/เพิ่มเองได้ (วันทางจันทรคติเพิ่มเอง) */
export const THAI_HOLIDAYS: { date: string; name: string }[] = [
  { date: "01-01", name: "วันขึ้นปีใหม่" },
  { date: "04-06", name: "วันจักรี" },
  { date: "04-13", name: "วันสงกรานต์" },
  { date: "04-14", name: "วันสงกรานต์" },
  { date: "04-15", name: "วันสงกรานต์" },
  { date: "05-01", name: "วันแรงงานแห่งชาติ" },
  { date: "05-04", name: "วันฉัตรมงคล" },
  { date: "06-03", name: "วันเฉลิมพระชนมพรรษาพระราชินี" },
  { date: "07-28", name: "วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว" },
  { date: "08-12", name: "วันแม่แห่งชาติ" },
  { date: "10-13", name: "วันนวมินทรมหาราช" },
  { date: "10-23", name: "วันปิยมหาราช" },
  { date: "12-05", name: "วันพ่อแห่งชาติ" },
  { date: "12-10", name: "วันรัฐธรรมนูญ" },
  { date: "12-31", name: "วันสิ้นปี" },
];

const comma = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
/** สตางค์ → "1,290" (ไม่มี .00) · "1,234.50" (มีเศษสตางค์) */
export function moneyTh(satang: number): string {
  const n = Math.round(Number.isFinite(satang) ? satang : 0);
  const a = Math.abs(n);
  const baht = comma(Math.floor(a / 100));
  const st = a % 100;
  return `${n < 0 ? "-" : ""}${baht}${st ? `.${String(st).padStart(2, "0")}` : ""}`;
}
/** "1,290.50" / "1290" → สตางค์ (ไม่ถูกต้อง ⇒ null) */
export function parseBaht(text: string): number | null {
  const t = String(text ?? "").replace(/[,\s฿]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [b, s = ""] = t.split(".");
  return Number(b) * 100 + Number(s.padEnd(2, "0"));
}
/** bp → "7" / "12.5" (เปอร์เซ็นต์) */
export const pctTh = (bp: number): string => String(Math.round(bp) / 100);

const TH_DOW = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const TH_DOW_FULL = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
/** 0 = อาทิตย์ (คิดจากสตริง · Zeller) */
export function dowOfYmd(ymd: string): number {
  const m = YMD.exec(ymd);
  if (!m) return 0;
  let y = Number(m[1]);
  let mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 3) {
    mo += 12;
    y -= 1;
  }
  const k = y % 100;
  const j = Math.floor(y / 100);
  const h = (d + Math.floor((13 * (mo + 1)) / 5) + k + Math.floor(k / 4) + Math.floor(j / 4) + 5 * j) % 7; // 0 = เสาร์
  return (h + 6) % 7;
}
export const dowShortTh = (ymd: string): string => TH_DOW[dowOfYmd(ymd)] ?? "";
export const dowNameTh = (d: number): string => TH_DOW_FULL[d] ?? "";
export const dayOfMonth = (ymd: string): number => Number(YMD.exec(ymd)?.[3] ?? 0);
/** "2026-11-14" → "14 พ.ย." · withYear ⇒ "14 พ.ย. 2569" */
export function dateTh(ymd: string, withYear = false): string {
  const m = YMD.exec(ymd ?? "");
  if (!m) return "";
  const s = `${Number(m[3])} ${TH_MONTHS[Number(m[2]) - 1] ?? ""}`;
  return withYear ? `${s} ${Number(m[1]) + 543}` : s;
}
/** "2 – 15 พ.ย. 2569" */
export function rangeTh(from: string, to: string): string {
  if (from.slice(0, 7) === to.slice(0, 7)) return `${dayOfMonth(from)} – ${dateTh(to, true)}`;
  return `${dateTh(from)} – ${dateTh(to, true)}`;
}

/** ป้ายโหมดภาษีใต้หัวข้อ (มติ 6) — ตัวเลขจากค่าตั้ง */
export function taxNoteTh(tax: { mode: string; vatBp: number; serviceChargeBp: number }): string {
  if (tax.mode === "EXCLUSIVE") return `ยังไม่รวม VAT ${pctTh(tax.vatBp)}%${tax.serviceChargeBp > 0 ? ` + SC ${pctTh(tax.serviceChargeBp)}%` : ""}`;
  return tax.vatBp > 0 ? `ราคารวมภาษีแล้ว (VAT ${pctTh(tax.vatBp)}%)` : "ราคารวมภาษีแล้ว";
}

export const DEPOSIT_KIND_TH: Record<string, string> = { NONE: "ไม่เก็บมัดจำ", FIRST_NIGHT: "มัดจำคืนแรก", FULL: "จ่ายเต็มตอนจอง", PERCENT: "มัดจำเป็นเปอร์เซ็นต์", FIXED_AMOUNT: "มัดจำจำนวนคงที่" };
export const VISIBILITY_TH: Record<string, string> = { WEB: "หน้าเว็บ", LINE: "LINE", COUNTER: "หน้าเคาน์เตอร์", OTA: "OTA" };
export function depositTh(kind: string, value: number): string {
  if (kind === "PERCENT") return `มัดจำ ${pctTh(value)}%`;
  if (kind === "FIXED_AMOUNT") return `มัดจำ ฿${moneyTh(value)}`;
  return DEPOSIT_KIND_TH[kind] ?? "ตามค่าตั้งโรงแรม";
}
export function cancelRulesTh(rules: { daysBefore: number; refundBp: number }[]): string {
  if (!rules.length) return "ยกเลิกตามค่าตั้งโรงแรม";
  const full = [...rules].filter((r) => r.refundBp >= 10_000).sort((a, b) => a.daysBefore - b.daysBefore)[0];
  if (rules.every((r) => r.refundBp === 0)) return "ไม่คืนเงินเมื่อยกเลิก";
  if (full) return `ยกเลิกฟรีก่อน ${full.daysBefore} วัน`;
  return [...rules]
    .sort((a, b) => b.daysBefore - a.daysBefore)
    .map((r) => `ก่อน ${r.daysBefore} วัน คืน ${pctTh(r.refundBp)}%`)
    .join(" · ");
}
export function visibilityTh(v: string[]): string {
  if (v.length >= 4) return "ทุกช่องทาง";
  return v.map((x) => VISIBILITY_TH[x] ?? x).join(" · ") || "ยังไม่เปิดขาย";
}
/** บรรทัดสรุปการ์ดแผน */
export function planSummaryTh(p: RatePlanDto): string {
  return [p.includeBreakfast ? "รวมอาหารเช้า" : null, cancelRulesTh(p.cancelRules), depositTh(p.depositKind, p.depositValue), p.minNights ? `ขั้นต่ำ ${p.minNights} คืน` : null]
    .filter(Boolean)
    .join(" · ");
}
/** ป้ายช่วงฤดู "1 ธ.ค. 2569 – 28 ก.พ. 2570" */
export const seasonRangeTh = (s: { dateStart: string; dateEnd: string }): string => `${dateTh(s.dateStart, true)} – ${dateTh(s.dateEnd, true)}`;
/** ช่องเหลือขายน้อย (≤ 1 ห้อง) */
export const isLow = (remaining: number, total: number): boolean => total > 0 && remaining > 0 && remaining <= 1;

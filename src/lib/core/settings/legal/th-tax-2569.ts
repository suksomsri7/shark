// ─────────────────────────────────────────────────────────────
// th-tax-2569.ts — ตารางค่ากฎหมายภาษี (VAT · หัก ณ ที่จ่าย · กำหนดยื่นแบบ) มีวันที่มีผล · ACC T0.2
// + ประเภทผู้ประกอบการของสมุดบัญชี (T0.1)
//
// แหล่งค่าเริ่มต้นแหล่งเดียว = skill `shark-thai-law` (/root/.claude/skills/shark-thai-law)
//   ทุกแถวมี ที่มา (ไฟล์ references + §) · ป้าย [V]/[V2]/[S]/[U] ตามที่ skill ติดไว้ · วันที่ตรวจ · ช่วงมีผลตามที่ skill เขียน
//   skill ไม่ให้ค่า ⇒ ไม่มีแถว (ตัวอ่านคืน null + คำเตือน ไม่เดาเอง)
// ร้านเพิ่ม/ทับแถวได้ (ค่าตั้ง `account.legal.*` ชั้น ACCOUNT_BOOK — defs/account.ts) · แถวร้านชนะแถวระบบที่มิติ+วันที่ตรงกัน
// ต่างจากแถวระบบป้าย [V]/[V2] = คำเตือน ไม่บล็อก (หลัก SHARK ข้อ 1–3 · SKILL.md §2)
//
// 🔴 pure ล้วน: ไม่ import db/prisma/next · ไม่อ่านนาฬิกา (ผู้เรียกส่งวันที่มา) — ฝั่ง client import ได้
// 🔴 นี่คือค่าเริ่มต้นจากผลค้นคว้า ไม่ใช่คำรับรองทางกฎหมาย — ข้อความทุกจุดห้ามเขียนว่า "ถูกกฎหมาย"
// ─────────────────────────────────────────────────────────────
import { CHECK_WITH_ACCOUNTANT_TH, legalWarning, type LegalWarning, type LegalWarningCode } from "./warnings";

// ═══════════════════ T0.1 ประเภทผู้ประกอบการ ═══════════════════

export const ENTITY_KINDS = ["UNSET", "INDIVIDUAL", "ORDINARY_PARTNERSHIP", "JURISTIC_PARTNERSHIP", "COMPANY", "OTHER"] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export const ENTITY_KIND_LABEL_TH: Record<EntityKind, string> = {
  UNSET: "ยังไม่ระบุ",
  INDIVIDUAL: "บุคคลธรรมดา",
  ORDINARY_PARTNERSHIP: "ห้างหุ้นส่วนสามัญ (ไม่จดทะเบียน) / คณะบุคคล",
  JURISTIC_PARTNERSHIP: "ห้างหุ้นส่วนจำกัด / ห้างหุ้นส่วนสามัญนิติบุคคล",
  COMPANY: "บริษัทจำกัด",
  OTHER: "อื่น ๆ",
};

export const isEntityKind = (v: unknown): v is EntityKind => typeof v === "string" && (ENTITY_KINDS as readonly string[]).includes(v);

/** ตัวอ่านเดียวของประเภทผู้ประกอบการ — ค่าที่ไม่รู้จัก/ไม่มี = "UNSET" */
export function entityKindOf(settings: { entityKind?: unknown } | null | undefined): EntityKind {
  const v = settings?.entityKind;
  return isEntityKind(v) ? v : "UNSET";
}

/**
 * ผู้จ่ายเป็น "บริษัทหรือห้างหุ้นส่วนนิติบุคคล" ไหม (common-withholding-tax.md §1, §10 — นิยาม "นิติฯ")
 *   true = บจ. / หจก.-หสน. · false = บุคคลธรรมดา / ห้างสามัญ-คณะบุคคล · null = ยังไม่ระบุ / อื่น ๆ (ไม่รู้ — ผู้เรียกต้องเตือน ไม่เดา)
 */
export function isJuristicPayer(kind: EntityKind | { entityKind?: unknown } | null | undefined): boolean | null {
  const k = typeof kind === "string" ? kind : entityKindOf(kind);
  if (k === "COMPANY" || k === "JURISTIC_PARTNERSHIP") return true;
  if (k === "INDIVIDUAL" || k === "ORDINARY_PARTNERSHIP") return false;
  return null;
}

// ═══════════════════ T0.2 รูปแถว ═══════════════════

/** ป้ายความเชื่อมั่นตาม SKILL.md §1 · "SHOP" = แถวที่ร้านใส่เอง */
export const LEGAL_TAGS = ["V", "V2", "S", "U", "SHOP"] as const;
export type LegalTag = (typeof LEGAL_TAGS)[number];

export const LEGAL_TAG_LABEL_TH: Record<LegalTag, string> = {
  V: "เปิดอ่านเอกสารทางการแล้ว",
  V2: "อ่านจากแหล่งรองที่อ้างมาตรา",
  S: "เห็นจากผลค้นหาเท่านั้น",
  U: "ยังไม่ยืนยัน",
  SHOP: "ร้านตั้งเอง",
};

/** วันที่ตามปฏิทินไทย "YYYY-MM-DD" · null = ไม่มีขอบ (แหล่งไม่ระบุ) */
export type Ymd = string;

type RowBase = {
  id: string;
  /** อัตรา (basis point) หรือ วันที่ของเดือน — null เมื่อ method ไม่ใช่อัตราคงที่ */
  value: number | null;
  from: Ymd | null;
  to: Ymd | null;
  /** ที่มา: ไฟล์ references + § (แถวระบบ) · ข้อความของร้าน (แถวร้าน) */
  source: string;
  tag: LegalTag;
  checkedAt: Ymd | null;
  note?: string;
};

export type VatRateRow = RowBase;

export const WHT_PAYERS = ["JURISTIC", "NON_JURISTIC", "ANY"] as const;
export type WhtPayer = (typeof WHT_PAYERS)[number];
export const WHT_RECIPIENTS = ["JURISTIC_TH", "INDIVIDUAL_TH", "FOUNDATION", "FOREIGN_PE", "FOREIGN", "ANY"] as const;
export type WhtRecipient = (typeof WHT_RECIPIENTS)[number];
export const WHT_CHANNELS = ["NORMAL", "EWHT"] as const;
export type WhtChannel = (typeof WHT_CHANNELS)[number];
/** RATE = อัตราคงที่ (value) · NONE = ไม่หัก · PROGRESSIVE = อัตราก้าวหน้า ม.50(1) (ร้าน/นักบัญชีกรอกยอดเอง) */
export const WHT_METHODS = ["RATE", "NONE", "PROGRESSIVE"] as const;
export type WhtMethod = (typeof WHT_METHODS)[number];

export type WhtRateRow = RowBase & {
  /** รหัสประเภทเงินได้ — ตรง enum AccountWhtIncomeType (M40_1…M40_8) หรือรหัสข้อย่อยของ ท.ป.4/2528 (ADVERTISING ฯลฯ) */
  incomeType: string;
  payer: WhtPayer;
  recipient: WhtRecipient;
  channel: WhtChannel;
  method: WhtMethod;
};

// ACC T5.1 (เลน 2) ▸ + แบบรายปี: ภ.ง.ด.50/51 · ภ.ง.ด.90/94 · ยื่นงบการเงิน (ห้างหุ้นส่วนนิติบุคคล / บริษัท) — ความหมายของ value ตาม FILING_FORM_META ◂
export const FILING_FORMS = ["PP30", "PND1", "PND2", "PND3", "PND53", "PND54", "PND50", "PND51", "PND90", "PND94", "FS_PARTNERSHIP", "FS_COMPANY", "PP36"] as const;
export type FilingForm = (typeof FILING_FORMS)[number];
export const FILING_CHANNELS = ["PAPER", "ONLINE"] as const;
export type FilingChannel = (typeof FILING_CHANNELS)[number];

/** value = "ภายในวันที่ N ของเดือนถัดจากเดือนภาษี" · ช่วง from/to ของแถว ONLINE = ช่วงของ "วันครบกำหนดปกติ" ที่ประกาศขยายเวลาครอบ */
export type FilingDeadlineRow = RowBase & { form: FilingForm; channel: FilingChannel };

/**
 * ACC T5.1 ▸ ความหมายของ value ในแถวกำหนดยื่น ต่อแบบ
 *   MONTHLY: แถวกระดาษ/ออนไลน์ = "ภายในวันที่ N ของเดือนถัดจากเดือนภาษี" (เดิมของ T0.2)
 *   ANNUAL : แถวกระดาษ = จำนวน (unit) นับจากจุดตั้งต้น (anchor) · แถวออนไลน์ = วันที่ขยายเพิ่มต่อจากวันครบกำหนดกระดาษ
 *            ช่วง from/to ของแถวออนไลน์ = ช่วงของ "วันครบกำหนดกระดาษ" ที่ประกาศขยายเวลาครอบ (เหมือนแบบรายเดือน)
 *   anchor: FY_END วันสุดท้ายของรอบบัญชี · FY_HALF_END วันสุดท้ายของ 6 เดือนแรกของรอบ · CAL_YEAR_END 31 ธ.ค. ของปีภาษี ·
 *           CAL_HALF_END 30 มิ.ย. ของปีภาษี · AGM วันที่ประชุมใหญ่อนุมัติงบ (ระบบไม่รู้วัน — แสดงเป็นข้อความ ไม่คำนวณวันที่)
 *   unit MONTHS นับแบบสิ้นเดือน (สิ้นเดือน + N เดือน = สิ้นเดือนนั้น เช่น 30 มิ.ย. + 3 = 30 ก.ย. ตรงกับ "ภายในเดือนกันยายน")
 */
export type FilingCadence = "MONTHLY" | "ANNUAL";
export type FilingAnchor = "TAX_MONTH" | "FY_END" | "FY_HALF_END" | "CAL_YEAR_END" | "CAL_HALF_END" | "AGM";
export const FILING_FORM_META: Record<FilingForm, { cadence: FilingCadence; anchor: FilingAnchor; unit: "DAY_OF_NEXT_MONTH" | "DAYS" | "MONTHS"; min: number; max: number }> = {
  PP30: { cadence: "MONTHLY", anchor: "TAX_MONTH", unit: "DAY_OF_NEXT_MONTH", min: 1, max: 31 },
  PND1: { cadence: "MONTHLY", anchor: "TAX_MONTH", unit: "DAY_OF_NEXT_MONTH", min: 1, max: 31 },
  PND2: { cadence: "MONTHLY", anchor: "TAX_MONTH", unit: "DAY_OF_NEXT_MONTH", min: 1, max: 31 },
  PND3: { cadence: "MONTHLY", anchor: "TAX_MONTH", unit: "DAY_OF_NEXT_MONTH", min: 1, max: 31 },
  PND53: { cadence: "MONTHLY", anchor: "TAX_MONTH", unit: "DAY_OF_NEXT_MONTH", min: 1, max: 31 },
  PND54: { cadence: "MONTHLY", anchor: "TAX_MONTH", unit: "DAY_OF_NEXT_MONTH", min: 1, max: 31 },
  PND50: { cadence: "ANNUAL", anchor: "FY_END", unit: "DAYS", min: 1, max: 400 },
  PND51: { cadence: "ANNUAL", anchor: "FY_HALF_END", unit: "MONTHS", min: 1, max: 12 },
  PND90: { cadence: "ANNUAL", anchor: "CAL_YEAR_END", unit: "MONTHS", min: 1, max: 12 },
  PND94: { cadence: "ANNUAL", anchor: "CAL_HALF_END", unit: "MONTHS", min: 1, max: 12 },
  FS_PARTNERSHIP: { cadence: "ANNUAL", anchor: "FY_END", unit: "MONTHS", min: 1, max: 12 },
  FS_COMPANY: { cadence: "ANNUAL", anchor: "AGM", unit: "MONTHS", min: 1, max: 12 },
  PP36: { cadence: "MONTHLY", anchor: "TAX_MONTH", unit: "DAY_OF_NEXT_MONTH", min: 1, max: 31 },
};
/** ช่วงค่าที่รับได้ของแถวกำหนดยื่น (รูปแบบข้อมูล ไม่ใช่ค่ากฎหมาย) — แถวออนไลน์ของแบบรายปี = วันขยาย 0–60 */
export function deadlineValueInRange(form: FilingForm, channel: FilingChannel, value: number): boolean {
  const m = FILING_FORM_META[form];
  if (!m) return false;
  if (m.cadence === "ANNUAL" && channel === "ONLINE") return value >= 0 && value <= 60;
  return value >= m.min && value <= m.max;
}
/** ข้อความค่าของแถวกำหนดยื่น */
export function deadlineValueLabelTh(form: FilingForm, channel: FilingChannel, value: number | null): string {
  if (value === null) return "-";
  const m = FILING_FORM_META[form];
  if (!m || m.cadence === "MONTHLY") return `ภายในวันที่ ${value} ของเดือนถัดไป`;
  if (channel === "ONLINE") return `ขยายอีก ${value} วันนับจากกำหนดยื่นกระดาษ`;
  const from: Record<FilingAnchor, string> = {
    TAX_MONTH: "สิ้นเดือนภาษี",
    FY_END: "วันสุดท้ายของรอบบัญชี",
    FY_HALF_END: "วันสุดท้ายของ 6 เดือนแรกของรอบบัญชี",
    CAL_YEAR_END: "สิ้นปีภาษี (31 ธ.ค.)",
    CAL_HALF_END: "30 มิ.ย. ของปีภาษี",
    AGM: "วันที่ประชุมใหญ่อนุมัติงบ",
  };
  return `ภายใน ${value} ${m.unit === "DAYS" ? "วัน" : "เดือน"}นับแต่${from[m.anchor]}`;
}

// ACC T4 (เลน 2) ▸ ตาราง "สมุดบัญชี/ค่าเสื่อม/รอบบัญชี" — ค่าตัวเลขของ T4.1 T4.3 T4.6 (แถวระบบอยู่ท้ายไฟล์ SYSTEM_BOOK_ROWS) ◂
export const BOOK_RULES = [
  "JOURNAL_ENTRY_DAYS",
  "LEDGER_POST_DAYS_AFTER_MONTH",
  "CASH_REPORT_WORKING_DAYS",
  "FIRST_PERIOD_MAX_MONTHS",
  "DEP_MAX_RATE_BUILDING",
  "DEP_MAX_RATE_TEMP_BUILDING",
  "DEP_MAX_RATE_INTANGIBLE",
  "DEP_MAX_RATE_OTHER",
  "DEP_COMPUTER_MIN_PERIODS",
  "DEP_PASSENGER_CAR_COST_CAP",
  // ACC T5 (เลน 2) ▸ เกณฑ์จด VAT · ค่ารับรอง · หนี้สูญ · อากรแสตมป์ · ตัวเตือนแบบรายปี ◂
  "VAT_REG_THRESHOLD",
  "VAT_REG_WITHIN_DAYS",
  "VAT_REG_NEAR_RATIO",
  "ENTERTAINMENT_CAP_RATE",
  "ENTERTAINMENT_CAP_MAX",
  "ENTERTAINMENT_GIFT_PER_PERSON",
  "DONATION_CAP_RATE",
  "BAD_DEBT_TIER1_MAX",
  "BAD_DEBT_TIER2_MAX",
  "STAMP_HIRE_PER_1000",
  "STAMP_LEASE_PER_1000",
  "STAMP_E_PAY_DAYS",
  "ANNUAL_FILING_REMIND_DAYS",
] as const;
export type BookRule = (typeof BOOK_RULES)[number];
/** หน่วยของค่าในแถว: วัน · วันทำการ · เดือน · basis point ต่อปี · รอบบัญชี · สตางค์ */
export type BookRuleUnit = "DAYS" | "WORKING_DAYS" | "MONTHS" | "BP_PER_YEAR" | "PERIODS" | "SATANG" | "BP";
export const BOOK_RULE_META: Record<BookRule, { labelTh: string; unit: BookRuleUnit; min: number; max: number }> = {
  JOURNAL_ENTRY_DAYS: { labelTh: "ลงบัญชีรายวันภายใน (วันนับแต่วันที่รายการเกิด)", unit: "DAYS", min: 1, max: 365 },
  LEDGER_POST_DAYS_AFTER_MONTH: { labelTh: "ผ่านบัญชีแยกประเภทภายใน (วันนับแต่วันสิ้นเดือน)", unit: "DAYS", min: 1, max: 365 },
  CASH_REPORT_WORKING_DAYS: { labelTh: "รายงานเงินสดรับ-จ่าย ลงภายใน (วันทำการ)", unit: "WORKING_DAYS", min: 1, max: 60 },
  FIRST_PERIOD_MAX_MONTHS: { labelTh: "ปิดบัญชีครั้งแรกภายใน (เดือนนับแต่วันเริ่มทำบัญชี)", unit: "MONTHS", min: 1, max: 24 },
  DEP_MAX_RATE_BUILDING: { labelTh: "เพดานค่าเสื่อมทางภาษี: อาคารถาวร (ต่อปี)", unit: "BP_PER_YEAR", min: 1, max: 10000 },
  DEP_MAX_RATE_TEMP_BUILDING: { labelTh: "เพดานค่าเสื่อมทางภาษี: อาคารชั่วคราว (ต่อปี)", unit: "BP_PER_YEAR", min: 1, max: 10000 },
  DEP_MAX_RATE_INTANGIBLE: { labelTh: "เพดานค่าเสื่อมทางภาษี: กู๊ดวิล/เครื่องหมายการค้า/ลิขสิทธิ์ ไม่มีอายุ (ต่อปี)", unit: "BP_PER_YEAR", min: 1, max: 10000 },
  DEP_MAX_RATE_OTHER: { labelTh: "เพดานค่าเสื่อมทางภาษี: ทรัพย์สินอื่น (ต่อปี)", unit: "BP_PER_YEAR", min: 1, max: 10000 },
  DEP_COMPUTER_MIN_PERIODS: { labelTh: "คอมพิวเตอร์/อุปกรณ์/โปรแกรม หักได้ภายใน (รอบบัญชี)", unit: "PERIODS", min: 1, max: 20 },
  DEP_PASSENGER_CAR_COST_CAP: { labelTh: "ฐานค่าเสื่อมทางภาษีของรถยนต์นั่ง ≤10 ที่นั่ง ไม่เกิน (ต่อคัน)", unit: "SATANG", min: 1, max: 100_000_000_000 },
  VAT_REG_THRESHOLD: { labelTh: "เกณฑ์ต้องจดทะเบียนภาษีมูลค่าเพิ่ม: มูลค่าฐานภาษีต่อปีเกิน", unit: "SATANG", min: 1, max: 100_000_000_000 },
  VAT_REG_WITHIN_DAYS: { labelTh: "ยื่นจดทะเบียนภาษีมูลค่าเพิ่มภายใน (วันนับแต่วันที่ยอดเกินเกณฑ์)", unit: "DAYS", min: 1, max: 365 },
  VAT_REG_NEAR_RATIO: { labelTh: "เริ่มเตือนเมื่อยอดขายสะสมถึง (ร้อยละของเกณฑ์จด VAT)", unit: "BP", min: 1, max: 10000 },
  ENTERTAINMENT_CAP_RATE: { labelTh: "เพดานค่ารับรองทั้งรอบบัญชี (ร้อยละของรายได้หรือทุนชำระแล้ว ที่มากกว่า)", unit: "BP", min: 1, max: 10000 },
  ENTERTAINMENT_CAP_MAX: { labelTh: "เพดานค่ารับรองทั้งรอบบัญชีสูงสุด", unit: "SATANG", min: 1, max: 100_000_000_000 },
  ENTERTAINMENT_GIFT_PER_PERSON: { labelTh: "ค่ารับรองที่เป็นสิ่งของ ไม่เกินคนละ (ต่อคราว)", unit: "SATANG", min: 1, max: 100_000_000 },
  DONATION_CAP_RATE: { labelTh: "บริจาคสาธารณกุศลหักได้ไม่เกิน (ร้อยละของกำไรสุทธิ)", unit: "BP", min: 1, max: 10000 },
  BAD_DEBT_TIER1_MAX: { labelTh: "หนี้สูญต่อราย ไม่เกินยอดนี้: ทวงถามตามสมควร + ฟ้องไม่คุ้ม", unit: "SATANG", min: 1, max: 100_000_000_000 },
  BAD_DEBT_TIER2_MAX: { labelTh: "หนี้สูญต่อราย ไม่เกินยอดนี้: ฟ้องแล้วศาลรับคำฟ้อง (เกินนี้ต้องมีหมายบังคับคดี ฯลฯ)", unit: "SATANG", min: 1, max: 100_000_000_000 },
  STAMP_HIRE_PER_1000: { labelTh: "อากรแสตมป์จ้างทำของ ต่อสินจ้างทุก 1,000 บาทหรือเศษ", unit: "SATANG", min: 1, max: 1_000_000 },
  STAMP_LEASE_PER_1000: { labelTh: "อากรแสตมป์เช่าที่ดิน/โรงเรือน ต่อค่าเช่าทุก 1,000 บาทหรือเศษ", unit: "SATANG", min: 1, max: 1_000_000 },
  STAMP_E_PAY_DAYS: { labelTh: "ตราสารอิเล็กทรอนิกส์: ชำระอากรภายใน (วันนับแต่วันถัดจากวันกระทำตราสาร)", unit: "DAYS", min: 1, max: 365 },
  ANNUAL_FILING_REMIND_DAYS: { labelTh: "เตือนแบบรายปี (ภ.ง.ด.50/51/90/94 · ยื่นงบ) ล่วงหน้า", unit: "DAYS", min: 1, max: 90 },
};
export const isBookRule = (v: unknown): v is BookRule => typeof v === "string" && (BOOK_RULES as readonly string[]).includes(v);
/** แถวตาราง "สมุดบัญชี" — value ตามหน่วยของกฎ (BOOK_RULE_META) */
export type BookRuleRow = RowBase & { rule: BookRule };

export type LegalTableKind = "vat" | "wht" | "deadline" | "book";
export type LegalRowOf<K extends LegalTableKind> = K extends "vat" ? VatRateRow : K extends "wht" ? WhtRateRow : K extends "deadline" ? FilingDeadlineRow : BookRuleRow;

/** มิติของแต่ละตาราง (ใช้จับคู่แถวร้านกับแถวระบบ) */
export const LEGAL_DIMS: { [K in LegalTableKind]: readonly string[] } = {
  vat: [],
  wht: ["incomeType", "payer", "recipient", "channel"],
  deadline: ["form", "channel"],
  book: ["rule"],
};

export const WHT_PAYER_LABEL_TH: Record<WhtPayer, string> = { JURISTIC: "นิติบุคคล", NON_JURISTIC: "บุคคลธรรมดา/ห้างสามัญ/คณะบุคคล", ANY: "ผู้จ่ายทุกประเภท" };
export const WHT_RECIPIENT_LABEL_TH: Record<WhtRecipient, string> = {
  JURISTIC_TH: "บริษัท/ห้างฯ ในไทย",
  INDIVIDUAL_TH: "บุคคลธรรมดาในไทย",
  FOUNDATION: "มูลนิธิ/สมาคม",
  FOREIGN_PE: "บริษัทต่างประเทศมีสาขาถาวรในไทย",
  FOREIGN: "ผู้รับต่างประเทศ",
  ANY: "ผู้รับทุกประเภท",
};
export const WHT_CHANNEL_LABEL_TH: Record<WhtChannel, string> = { NORMAL: "ปกติ", EWHT: "e-Withholding Tax" };
export const WHT_METHOD_LABEL_TH: Record<WhtMethod, string> = { RATE: "อัตราคงที่", NONE: "ไม่หัก", PROGRESSIVE: "อัตราก้าวหน้า ม.50(1) — กรอกยอดเอง" };
export const FILING_FORM_LABEL_TH: Record<FilingForm, string> = {
  PP30: "ภ.พ.30",
  PND1: "ภ.ง.ด.1",
  PND2: "ภ.ง.ด.2",
  PND3: "ภ.ง.ด.3",
  PND53: "ภ.ง.ด.53",
  PND54: "ภ.ง.ด.54",
  PND50: "ภ.ง.ด.50",
  PND51: "ภ.ง.ด.51",
  PND90: "ภ.ง.ด.90",
  PND94: "ภ.ง.ด.94",
  FS_PARTNERSHIP: "ยื่นงบการเงิน (ห้างหุ้นส่วนนิติบุคคล)",
  FS_COMPANY: "ยื่นงบการเงิน (บริษัท)",
  PP36: "ภ.พ.36",
};
export const FILING_CHANNEL_LABEL_TH: Record<FilingChannel, string> = { PAPER: "ยื่นแบบกระดาษ", ONLINE: "ยื่นทางอินเทอร์เน็ต" };

/** ป้ายประเภทเงินได้ (รหัสข้อย่อยที่ยังไม่มีใน dropdown เอกสาร — T3.1 จะเปิดให้เลือก) */
export const WHT_INCOME_LABEL_TH: Record<string, string> = {
  M40_1: "40(1) เงินเดือน/ค่าจ้าง",
  M40_2: "40(2) ค่านายหน้า/รับจ้างทำงาน",
  M40_3: "40(3) ค่าลิขสิทธิ์/goodwill",
  M40_4: "40(4) ดอกเบี้ย",
  M40_5: "40(5) ค่าเช่าทรัพย์สิน",
  M40_6: "40(6) วิชาชีพอิสระ",
  M40_7: "40(7) รับเหมา/จ้างทำของ",
  M40_8: "40(8) ค่าบริการอื่น",
  DIVIDEND: "เงินปันผล/ส่วนแบ่งกำไร",
  ADVERTISING: "ค่าโฆษณา",
  PROMOTION: "รางวัล/ส่วนลดจากการส่งเสริมการขาย",
  NONLIFE_INSURANCE: "เบี้ยประกันวินาศภัย",
  TRANSPORT: "ค่าขนส่ง",
  PRIZE: "รางวัลประกวด แข่งขัน ชิงโชค",
  PERFORMER: "ค่าแสดงของนักแสดงสาธารณะ",
};

// ═══════════════════ แถวของระบบ (จาก skill เท่านั้น) ═══════════════════

const VAT_REF = "references/common-vat-invoice.md";
const WHT_REF = "references/common-withholding-tax.md";

export const SYSTEM_VAT_ROWS: readonly VatRateRow[] = [
  {
    id: "sys-vat-807",
    value: 700,
    from: "2017-10-01",
    to: "2027-09-30",
    source: `${VAT_REF} §12 — พ.ร.ฎ. (ฉ.807) พ.ศ. 2569: อัตราร้อยละ 6.3 สำหรับความรับผิดตั้งแต่ 1 ต.ค. 2560 ถึง 30 ก.ย. 2570 [V] · รวมภาษีท้องถิ่น 1/9 = 7% [V2]`,
    tag: "V2",
    checkedAt: "2026-11-13",
    note: "หลัง 30 ก.ย. 2570 ถ้าไม่มี พ.ร.ฎ. ใหม่ อัตรากลับเป็นตาม ม.80 — skill ให้ค้นซ้ำก่อน (ยังไม่มีแถวหลังวันนั้น)",
  },
];

type WhtSeed = Omit<WhtRateRow, "id" | "from" | "to" | "channel" | "method"> & Partial<Pick<WhtRateRow, "from" | "to" | "channel" | "method">>;
const wht = (id: string, r: WhtSeed): WhtRateRow => ({ id, from: null, to: null, channel: "NORMAL", method: "RATE", ...r });
const S2 = { source: `${WHT_REF} §2 (ท.ป.4/2528)`, tag: "V" as const, checkedAt: "2026-11-13" };
const S3 = { source: `${WHT_REF} §3`, tag: "V" as const, checkedAt: "2026-11-12" };
const S10 = (clause: string) => ({ source: `${WHT_REF} §10 (ท.ป.4/2528 ข้อ ${clause})`, tag: "V" as const, checkedAt: "2026-11-13" });

export const SYSTEM_WHT_ROWS: readonly WhtRateRow[] = [
  // ── ม.40(2) ค่านายหน้า/ค่าธรรมเนียม (§2 ข้อ 3/1 · §3) ──
  wht("sys-wht-40-2-jur", { incomeType: "M40_2", payer: "JURISTIC", recipient: "JURISTIC_TH", value: 300, ...S2, source: `${WHT_REF} §2 (ท.ป.4/2528 ข้อ 3/1(1)) · §3` }),
  wht("sys-wht-40-2-fdn", { incomeType: "M40_2", payer: "JURISTIC", recipient: "FOUNDATION", value: 1000, ...S2, source: `${WHT_REF} §2 (ท.ป.4/2528 ข้อ 3/1(2))` }),
  wht("sys-wht-40-2-nj-jur", { incomeType: "M40_2", payer: "NON_JURISTIC", recipient: "JURISTIC_TH", value: null, method: "NONE", ...S3 }),
  wht("sys-wht-40-2-ind", { incomeType: "M40_2", payer: "ANY", recipient: "INDIVIDUAL_TH", value: null, method: "PROGRESSIVE", ...S3, note: "ม.50(1) · ภ.ง.ด.1 · 50 ทวิ รายปี" }),
  wht("sys-wht-40-2-foreign", { incomeType: "M40_2", payer: "ANY", recipient: "FOREIGN", value: null, method: "NONE", ...S3, note: "ไม่หัก + ยืนยันข้อเท็จจริง + เตือน · skill บันทึกว่าแหล่งขัดกันบางกรณี (§5)" }),
  // ── §10 ตารางอัตรา ท.ป.4/2528 ──
  wht("sys-wht-40-3-jur", { incomeType: "M40_3", payer: "JURISTIC", recipient: "JURISTIC_TH", value: 300, ...S10("3/2") }),
  wht("sys-wht-40-4-jur", { incomeType: "M40_4", payer: "JURISTIC", recipient: "JURISTIC_TH", value: 100, ...S10("4(3)"), note: "ดอกเบี้ยเงินกู้ยืม/หุ้นกู้/ตั๋วเงิน · ผู้จ่ายไม่ใช่สถาบันการเงิน" }),
  wht("sys-wht-40-4-ind", { incomeType: "M40_4", payer: "JURISTIC", recipient: "INDIVIDUAL_TH", value: 1500, ...S10("4(3) หมายเหตุ"), note: "ดอกเบี้ยให้บุคคลธรรมดา = ม.50(2)" }),
  wht("sys-wht-div-jur", { incomeType: "DIVIDEND", payer: "JURISTIC", recipient: "JURISTIC_TH", value: 1000, ...S10("5"), note: "มีข้อยกเว้นเมื่อถือหุ้น ≥25%" }),
  wht("sys-wht-div-ind", { incomeType: "DIVIDEND", payer: "JURISTIC", recipient: "INDIVIDUAL_TH", value: 1000, ...S10("5 หมายเหตุ"), note: "บุคคลธรรมดา = ม.50(2)(จ)" }),
  wht("sys-wht-40-5-jur", { incomeType: "M40_5", payer: "JURISTIC", recipient: "JURISTIC_TH", value: 500, ...S10("6"), note: "ไม่รวมค่าแห่งอาคารหรือโรงเรือนที่ได้รับกรรมสิทธิ์" }),
  wht("sys-wht-40-5-ind", { incomeType: "M40_5", payer: "JURISTIC", recipient: "INDIVIDUAL_TH", value: 500, ...S10("6") }),
  wht("sys-wht-40-6-jur", { incomeType: "M40_6", payer: "JURISTIC", recipient: "JURISTIC_TH", value: 300, ...S10("7") }),
  wht("sys-wht-40-6-ind", { incomeType: "M40_6", payer: "JURISTIC", recipient: "INDIVIDUAL_TH", value: 300, ...S10("7") }),
  wht("sys-wht-40-7-jur", { incomeType: "M40_7", payer: "JURISTIC", recipient: "JURISTIC_TH", value: 300, ...S10("8"), note: "จ้างทำของ/รับเหมา" }),
  wht("sys-wht-40-7-ind", { incomeType: "M40_7", payer: "JURISTIC", recipient: "INDIVIDUAL_TH", value: 300, ...S10("8") }),
  wht("sys-wht-40-7-fpe", { incomeType: "M40_7", payer: "JURISTIC", recipient: "FOREIGN_PE", value: 300, ...S10("8") }),
  wht("sys-wht-40-7-foreign", { incomeType: "M40_7", payer: "ANY", recipient: "FOREIGN", value: 500, ...S10("12"), note: "บริษัทต่างประเทศไม่มีสาขาถาวรในไทย · ผู้จ่ายทุกประเภท" }),
  wht("sys-wht-40-8-jur", { incomeType: "M40_8", payer: "JURISTIC", recipient: "JURISTIC_TH", value: 300, ...S10("12/1"), note: "ไม่รวมค่าบริการโรงแรม ภัตตาคาร เบี้ยประกันชีวิต" }),
  wht("sys-wht-40-8-ind", { incomeType: "M40_8", payer: "JURISTIC", recipient: "INDIVIDUAL_TH", value: 300, ...S10("12/1") }),
  wht("sys-wht-adv-jur", { incomeType: "ADVERTISING", payer: "JURISTIC", recipient: "JURISTIC_TH", value: 200, ...S10("10") }),
  wht("sys-wht-adv-ind", { incomeType: "ADVERTISING", payer: "JURISTIC", recipient: "INDIVIDUAL_TH", value: 200, ...S10("10") }),
  wht("sys-wht-promo-jur", { incomeType: "PROMOTION", payer: "JURISTIC", recipient: "JURISTIC_TH", value: 300, ...S10("12/2"), note: "ไม่ใช้กับผู้บริโภคที่ใช้เอง · ส่วนลดทันทีขณะขายไม่หัก" }),
  wht("sys-wht-promo-ind", { incomeType: "PROMOTION", payer: "JURISTIC", recipient: "INDIVIDUAL_TH", value: 300, ...S10("12/2") }),
  wht("sys-wht-ins-jur", { incomeType: "NONLIFE_INSURANCE", payer: "JURISTIC", recipient: "JURISTIC_TH", value: 100, ...S10("12/3"), note: "ผู้รับ = บริษัทประกันวินาศภัย · ประกันชีวิตไม่หัก" }),
  wht("sys-wht-trans-jur", { incomeType: "TRANSPORT", payer: "JURISTIC", recipient: "JURISTIC_TH", value: 100, ...S10("12/4"), note: "ไม่รวมค่าโดยสารขนส่งสาธารณะ" }),
  wht("sys-wht-trans-ind", { incomeType: "TRANSPORT", payer: "JURISTIC", recipient: "INDIVIDUAL_TH", value: 100, ...S10("12/4") }),
  wht("sys-wht-prize-jur", { incomeType: "PRIZE", payer: "ANY", recipient: "JURISTIC_TH", value: 500, ...S10("9(1)"), note: "ผู้จ่ายทุกประเภท (รวมร้านบุคคลธรรมดา)" }),
  wht("sys-wht-prize-ind", { incomeType: "PRIZE", payer: "ANY", recipient: "INDIVIDUAL_TH", value: 500, ...S10("9(1)") }),
  wht("sys-wht-perf-ind", { incomeType: "PERFORMER", payer: "ANY", recipient: "INDIVIDUAL_TH", value: 500, ...S10("9(2)"), note: "นักแสดงสาธารณะที่มีภูมิลำเนาในไทย · ผู้จ่ายทุกประเภท" }),
  // ── e-Withholding Tax (§6 — กฎกระทรวง ฉ.402) ──
  wht("sys-ewht-40-2-jur", {
    incomeType: "M40_2", payer: "JURISTIC", recipient: "JURISTIC_TH", channel: "EWHT", value: 100,
    from: "2026-01-01", to: "2027-12-31",
    source: `${WHT_REF} §6 — กฎกระทรวง ฉบับที่ 402 (พ.ศ. 2569) จ่ายตั้งแต่ 1 ม.ค. 2569 ถึง 31 ธ.ค. 2570 และนำส่งผ่าน e-WHT`,
    tag: "V", checkedAt: "2026-11-12",
    note: "ใช้เฉพาะรายการที่นำส่งผ่านระบบ e-WHT ของธนาคาร · หมดอายุแล้วระบบกลับไปใช้อัตราปกติ",
  }),
  // ── ACC T3.1 ▸ ผู้จ่ายบุคคลธรรมดา/ห้างสามัญ/คณะบุคคล ไม่มีหน้าที่หักตาม ม.3 เตรส สำหรับค่าเช่า บริการ โฆษณา ขนส่ง ฯลฯ (skill §16 [V] · ข้อ 3/2, 6, 7, 8, 10, 12/1–12/4 ผูกเฉพาะนิติฯ)
  //   ดอกเบี้ยที่บุคคลธรรมดาจ่ายให้ผู้อยู่ในไทยไม่ต้องหัก (ม.50(2)(ง) [V]) · ผู้รับระบุชัด (บริษัท/บุคคลในไทย) — ไม่แตะแถวผู้รับต่างประเทศ (ข้อ 12 ผู้จ่ายทุกคน) ◂
  ...(["M40_3", "M40_4", "M40_5", "M40_6", "M40_7", "M40_8", "ADVERTISING", "PROMOTION", "NONLIFE_INSURANCE", "TRANSPORT"] as const).flatMap((incomeType) =>
    (["JURISTIC_TH", "INDIVIDUAL_TH"] as const).map((recipient) =>
      wht(`sys-wht-nj-${incomeType.toLowerCase().replace(/_/g, "-")}-${recipient.toLowerCase().replace(/_/g, "-")}`, {
        incomeType, payer: "NON_JURISTIC", recipient, value: null, method: "NONE",
        source: `${WHT_REF} §16 — ร้านบุคคลธรรมดา/ห้างสามัญ/คณะบุคคล ไม่มีหน้าที่หักตาม ม.3 เตรส (ข้อ 3/2, 6, 7, 8, 10, 12/1–12/4 ผูกเฉพาะนิติบุคคล)${incomeType === "M40_4" ? " · ดอกเบี้ยที่บุคคลธรรมดาจ่ายให้ผู้อยู่ในไทย ม.50(2)(ง)" : ""}`,
        tag: "V", checkedAt: "2026-11-13",
      }),
    ),
  ),
  // ── ACC T3.7 ▸ e-WHT รายการอื่นที่กฎกระทรวง ฉ.402 ลดเหลือ 1% (skill §14 [V]) · ช่วง 1 ม.ค. 2569 – 31 ธ.ค. 2570 · หลังวันนั้นตัวอ่านถอยไปอัตราปกติเอง (EWHT_NOT_IN_EFFECT)
  //   ไม่ได้ลด (ไม่มีแถว = ใช้อัตราปกติ): ค่าขนส่ง 1% · ประกันวินาศภัย 1% · ดอกเบี้ย · เงินปันผล · มูลนิธิ/สมาคม 10% · ม.50(1) · ม.70 · ข้อ 12 (ต่างประเทศไม่มีสาขา — skill ไม่ได้ระบุ ⇒ ไม่ใส่) ◂
  ...(
    [
      ["M40_3", "JURISTIC", "JURISTIC_TH", "ม.40(3) → บริษัท"],
      ["M40_5", "JURISTIC", "JURISTIC_TH", "ค่าเช่า ม.40(5)(ก) 5%→1%"],
      ["M40_5", "JURISTIC", "INDIVIDUAL_TH", "ค่าเช่า ม.40(5)(ก) 5%→1%"],
      ["M40_6", "JURISTIC", "JURISTIC_TH", "ม.40(6)"],
      ["M40_6", "JURISTIC", "INDIVIDUAL_TH", "ม.40(6)"],
      ["M40_7", "JURISTIC", "JURISTIC_TH", "ม.40(7) จ้างทำของ"],
      ["M40_7", "JURISTIC", "INDIVIDUAL_TH", "ม.40(7) จ้างทำของ"],
      ["M40_7", "JURISTIC", "FOREIGN_PE", "ม.40(7) จ้างทำของ"],
      ["M40_8", "JURISTIC", "JURISTIC_TH", "ม.40(8) บริการอื่น"],
      ["M40_8", "JURISTIC", "INDIVIDUAL_TH", "ม.40(8) บริการอื่น"],
      ["ADVERTISING", "JURISTIC", "JURISTIC_TH", "โฆษณา 2%→1%"],
      ["ADVERTISING", "JURISTIC", "INDIVIDUAL_TH", "โฆษณา 2%→1%"],
      ["PROMOTION", "JURISTIC", "JURISTIC_TH", "ส่งเสริมการขาย"],
      ["PROMOTION", "JURISTIC", "INDIVIDUAL_TH", "ส่งเสริมการขาย"],
      ["PRIZE", "ANY", "JURISTIC_TH", "รางวัลชิงโชค 5%→1%"],
      ["PRIZE", "ANY", "INDIVIDUAL_TH", "รางวัลชิงโชค 5%→1%"],
      ["PERFORMER", "ANY", "INDIVIDUAL_TH", "นักแสดงในไทย 5%→1%"],
    ] as const
  ).map(([incomeType, payer, recipient, what]) =>
    wht(`sys-ewht-${incomeType.toLowerCase().replace(/_/g, "-")}-${recipient.toLowerCase().replace(/_/g, "-")}`, {
      incomeType, payer, recipient, channel: "EWHT", value: 100,
      from: "2026-01-01", to: "2027-12-31",
      source: `${WHT_REF} §14 — กฎกระทรวง ฉบับที่ 402 (พ.ศ. 2569): ${what} เมื่อจ่าย 1 ม.ค. 2569 – 31 ธ.ค. 2570 และนำส่งผ่าน e-WHT`,
      tag: "V", checkedAt: "2026-11-13",
      note: "ใช้เฉพาะรายการที่นำส่งผ่านระบบ e-WHT ของธนาคาร · หลัง 31 ธ.ค. 2570 กลับไปอัตราปกติเอง (skill: ต้องค้นซ้ำ)",
    }),
  ),
];

const dl = (id: string, r: Omit<FilingDeadlineRow, "id">): FilingDeadlineRow => ({ id, ...r });
const TAX_REF_T5 = "references/domain-business-income-tax.md";
const BOOKS_REF_T5 = "references/domain-accounting-books.md";
const MOF_NET_SRC = "ประกาศกระทรวงการคลังเรื่องขยายเวลายื่นทางอินเทอร์เน็ต ฉ.7 รวมแก้ไขถึง ฉ.9 (แบบที่ต้องยื่น 1 ก.พ. 2567 – 31 ม.ค. 2570)";
const PND_ONLINE_SRC = `${WHT_REF} §8 — ประกาศกระทรวงการคลังเรื่องขยายเวลายื่นทางอินเทอร์เน็ต ฉ.7: 15 วันนับแต่สิ้นเดือน สำหรับแบบที่ต้องยื่น 1 ก.พ. 2567 – 31 ม.ค. 2570`;
const PND_PAPER_SRC = `${WHT_REF} §8 — ม.52 + ประกาศกระทรวงการคลัง ลว. 24 ก.ค. 2544: ภายใน 7 วันนับแต่วันสิ้นเดือนที่จ่าย`;

export const SYSTEM_DEADLINE_ROWS: readonly FilingDeadlineRow[] = [
  dl("sys-dl-pp30-paper", {
    form: "PP30", channel: "PAPER", value: 15, from: null, to: null,
    source: `${VAT_REF} §19 — ม.83: ภายในวันที่ 15 ของเดือนถัดไป`, tag: "V", checkedAt: "2026-11-13",
  }),
  dl("sys-dl-pp30-online", {
    form: "PP30", channel: "ONLINE", value: 23, from: "2024-02-01", to: "2027-01-31",
    source: `${VAT_REF} §19 — ประกาศ กค. ขยายเวลายื่นทางอินเทอร์เน็ต ฉ.7 ข้อ 1.6(1): ภายในวันที่ 23 สำหรับแบบที่ต้องยื่น 1 ก.พ. 2567 – 31 ม.ค. 2570`,
    tag: "V", checkedAt: "2026-11-13", note: "หลัง 31 ม.ค. 2570 skill ยังไม่พบประกาศต่ออายุ — ค้นซ้ำ",
  }),
  ...(["PND1", "PND2", "PND3", "PND53", "PND54"] as const).flatMap((form) => [
    dl(`sys-dl-${form.toLowerCase()}-paper`, { form, channel: "PAPER", value: 7, from: null, to: null, source: PND_PAPER_SRC, tag: "V", checkedAt: "2026-11-12" }),
    dl(`sys-dl-${form.toLowerCase()}-online`, {
      form, channel: "ONLINE", value: 15, from: "2024-02-01", to: "2027-01-31", source: PND_ONLINE_SRC, tag: "V", checkedAt: "2026-11-13",
      note: "หลัง 31 ม.ค. 2570 skill ยังไม่พบประกาศต่ออายุ — ค้นซ้ำ",
    }),
  ]),
  // ── ACC T5.1 (เลน 2) ▸ แบบรายปี (references/domain-business-income-tax.md §ก2 §ข · domain-accounting-books.md §ก5) ──
  //   แถวออนไลน์ = วันที่ขยายต่อจากกำหนดกระดาษ ใช้กับแบบที่ "ต้องยื่น" 1 ก.พ. 2567 – 31 ม.ค. 2570 (ประกาศ กค. ขยายเวลายื่นทางอินเทอร์เน็ต ฉ.7 รวมแก้ไขถึง ฉ.9)
  //   หลัง 31 ม.ค. 2570 ไม่มีแถว (skill [U] — ภ.ง.ด.90 ปีภาษี 2569 ยื่น มี.ค. 2570 อยู่นอกช่วงแล้ว) ⇒ ไม่มีวันออนไลน์ ไม่เดา
  dl("sys-dl-pnd50-paper", {
    form: "PND50", channel: "PAPER", value: 150, from: null, to: null,
    source: `${TAX_REF_T5} §ก2 — ประมวลรัษฎากร ม.68 ม.69: "ภายในหนึ่งร้อยห้าสิบวันนับแต่วันสุดท้ายของรอบระยะเวลาบัญชี" (นับเป็นวัน)`, tag: "V", checkedAt: "2026-11-13",
  }),
  dl("sys-dl-pnd50-online", {
    form: "PND50", channel: "ONLINE", value: 8, from: "2024-02-01", to: "2027-01-31",
    source: `${TAX_REF_T5} §ก2 — ${MOF_NET_SRC}: ภ.ง.ด.50 = 158 วัน`, tag: "V", checkedAt: "2026-11-13", note: "หลัง 31 ม.ค. 2570 ยังไม่มีประกาศรองรับ — ค้นซ้ำ",
  }),
  dl("sys-dl-pnd51-paper", {
    form: "PND51", channel: "PAPER", value: 2, from: null, to: null,
    source: `${TAX_REF_T5} §ก2 — ประมวลรัษฎากร ม.67 ทวิ: ภายใน 2 เดือนนับแต่วันสุดท้ายของ 6 เดือนแรกของรอบระยะเวลาบัญชี`, tag: "V", checkedAt: "2026-11-13",
  }),
  dl("sys-dl-pnd51-online", {
    form: "PND51", channel: "ONLINE", value: 8, from: "2024-02-01", to: "2027-01-31",
    source: `${TAX_REF_T5} §ก2 — ${MOF_NET_SRC}: ภ.ง.ด.51 = 2 เดือน 8 วัน`, tag: "V", checkedAt: "2026-11-13", note: "หลัง 31 ม.ค. 2570 ยังไม่มีประกาศรองรับ — ค้นซ้ำ",
  }),
  dl("sys-dl-pnd90-paper", {
    form: "PND90", channel: "PAPER", value: 3, from: null, to: null,
    source: `${TAX_REF_T5} §ข — ประมวลรัษฎากร ม.56: ภายในเดือนมีนาคมของปีถัดไป`, tag: "V", checkedAt: "2026-11-13",
  }),
  dl("sys-dl-pnd90-online", {
    form: "PND90", channel: "ONLINE", value: 8, from: "2024-02-01", to: "2027-01-31",
    source: `${TAX_REF_T5} §ข — ${MOF_NET_SRC}: ภ.ง.ด.90 ออนไลน์ถึง 8 เม.ย.`, tag: "V", checkedAt: "2026-11-13", note: "ภ.ง.ด.90 ปีภาษี 2569 (ยื่น มี.ค. 2570) อยู่นอกช่วงประกาศ — ค้นซ้ำ",
  }),
  dl("sys-dl-pnd94-paper", {
    form: "PND94", channel: "PAPER", value: 3, from: null, to: null,
    source: `${TAX_REF_T5} §ข — ประมวลรัษฎากร ม.56 ทวิ: เงินได้ ม.40(5)–(8) ที่ได้รับ ม.ค.–มิ.ย. ยื่นภายในเดือนกันยายน`, tag: "V", checkedAt: "2026-11-13",
  }),
  dl("sys-dl-pnd94-online", {
    form: "PND94", channel: "ONLINE", value: 8, from: "2024-02-01", to: "2027-01-31",
    source: `${TAX_REF_T5} §ข — ${MOF_NET_SRC}: ภ.ง.ด.94 ออนไลน์ถึง 8 ต.ค.`, tag: "V", checkedAt: "2026-11-13", note: "หลัง 31 ม.ค. 2570 ยังไม่มีประกาศรองรับ — ค้นซ้ำ",
  }),
  dl("sys-dl-fs-partnership", {
    form: "FS_PARTNERSHIP", channel: "PAPER", value: 5, from: null, to: null,
    source: `${BOOKS_REF_T5} §ก5 — พ.ร.บ.การบัญชี พ.ศ. 2543 ม.11: ห้างหุ้นส่วนจดทะเบียน ยื่นงบภายใน 5 เดือนนับแต่วันปิดบัญชี (DBD e-Filing)`, tag: "V", checkedAt: "2026-11-13",
  }),
  dl("sys-dl-fs-company", {
    form: "FS_COMPANY", channel: "PAPER", value: 1, from: null, to: null,
    source: `${BOOKS_REF_T5} §ก5 — พ.ร.บ.การบัญชี พ.ศ. 2543 ม.11: บริษัทจำกัด ยื่นงบภายใน 1 เดือนนับแต่วันที่ที่ประชุมใหญ่อนุมัติงบ (DBD e-Filing)`, tag: "V", checkedAt: "2026-11-13",
    note: "ระบบไม่รู้วันประชุมใหญ่ — ปฏิทินแสดงเป็นข้อความ ไม่คำนวณวันที่",
  }),
  // ── ACC T5.6 ▸ ภ.พ.36 — skill บอกเฉพาะวันออนไลน์ (15 วันนับแต่สิ้นเดือน ช่วงประกาศ) · วันกระดาษไม่ระบุ ⇒ ไม่มีแถวกระดาษ (ไม่เดา) ──
  dl("sys-dl-pp36-online", {
    form: "PP36", channel: "ONLINE", value: 15, from: "2024-02-01", to: "2027-01-31",
    source: `${WHT_REF} §8 — ${MOF_NET_SRC}: ภ.ง.ด.1, 2, 3, 53, 54 และ ภ.พ.36 ยื่นทางอินเทอร์เน็ตภายใน 15 วันนับแต่สิ้นเดือน`, tag: "V", checkedAt: "2026-11-13",
    note: "วันยื่นแบบกระดาษของ ภ.พ.36 skill ไม่ได้ระบุ — ไม่มีแถว",
  }),
];

// ═══════════════════ T1.4 / T1.5 ภาษีซื้อ (แถวระบบ — ร้านไม่ทับ เพราะเป็นตัวบท [V]) ═══════════════════

/** กลุ่มรายจ่ายของภาษีซื้อต้องห้าม (ม.65 ตรี (6 ทวิ)): ม.82/5(4)(6) เป็นรายจ่ายได้ · (1)(2)(3)(5) เป็นรายจ่ายไม่ได้ */
export type NonClaimGroup = "DEDUCTIBLE" | "DISALLOWED";

export type InputVatNonClaimReason = {
  code: string;
  labelTh: string;
  /** มาตราสั้นที่แสดงบนจอ */
  sectionTh: string;
  group: NonClaimGroup;
  source: string;
  tag: LegalTag;
  checkedAt: Ymd;
};

const NC17 = `${VAT_REF} §17 (ม.82/5)`;
const NC_TAX = "references/domain-business-income-tax.md §ก4 (6 ทวิ)";

/** เหตุที่ภาษีซื้อเคลมไม่ได้ — เฉพาะที่ skill ระบุ (common-vat-invoice.md §17) · กลุ่มรายจ่ายตาม domain-business-income-tax.md §ก4 (6 ทวิ) */
export const INPUT_VAT_NONCLAIM_REASONS: readonly InputVatNonClaimReason[] = [
  { code: "ENTERTAINMENT", labelTh: "ค่ารับรอง", sectionTh: "ม.82/5(4) · ประกาศ VAT ฉ.17", group: "DEDUCTIBLE", source: `${NC17}(4) ประกาศ ฉ.17 · ${NC_TAX}`, tag: "V", checkedAt: "2026-11-13" },
  { code: "PASSENGER_CAR", labelTh: "รถยนต์นั่ง/รถโดยสารไม่เกิน 10 ที่นั่ง (ซื้อ เช่า น้ำมัน ซ่อม)", sectionTh: "ม.82/5(6) · ประกาศ VAT ฉ.42", group: "DEDUCTIBLE", source: `${NC17}(6) ประกาศ ฉ.42 · ${NC_TAX}`, tag: "V", checkedAt: "2026-11-13" },
  { code: "ABBREVIATED_INVOICE", labelTh: "ใบกำกับภาษีอย่างย่อ", sectionTh: "ม.82/5(6) · ประกาศ VAT ฉ.42", group: "DEDUCTIBLE", source: `${NC17}(6) ประกาศ ฉ.42 · ${NC_TAX}`, tag: "V", checkedAt: "2026-11-13" },
  { code: "NON_VAT_BUSINESS", labelTh: "ใช้ในกิจการที่ไม่เสียภาษีมูลค่าเพิ่ม", sectionTh: "ม.82/5(6) · ประกาศ VAT ฉ.42", group: "DEDUCTIBLE", source: `${NC17}(6) ประกาศ ฉ.42 · ${NC_TAX}`, tag: "V", checkedAt: "2026-11-13" },
  { code: "COPY_OR_NAME_MISMATCH", labelTh: "สำเนาใบกำกับ / ชื่อผู้ซื้อไม่ตรง", sectionTh: "ม.82/5(6) · ประกาศ VAT ฉ.42", group: "DEDUCTIBLE", source: `${NC17}(6) ประกาศ ฉ.42 · ${NC_TAX}`, tag: "V", checkedAt: "2026-11-13" },
  { code: "NO_TAX_INVOICE", labelTh: "ไม่มีใบกำกับภาษี", sectionTh: "ม.82/5(1)", group: "DISALLOWED", source: `${NC17}(1) · ${NC_TAX}`, tag: "V", checkedAt: "2026-11-13" },
  { code: "INVOICE_INCOMPLETE", labelTh: "ใบกำกับไม่สมบูรณ์ในสาระสำคัญ", sectionTh: "ม.82/5(2)", group: "DISALLOWED", source: `${NC17}(2) · ${NC_TAX}`, tag: "V", checkedAt: "2026-11-13" },
  { code: "NOT_BUSINESS", labelTh: "ไม่เกี่ยวกับกิจการโดยตรง", sectionTh: "ม.82/5(3)", group: "DISALLOWED", source: `${NC17}(3) · ${NC_TAX}`, tag: "V", checkedAt: "2026-11-13" },
  { code: "ISSUER_NOT_ENTITLED", labelTh: "ผู้ออกใบกำกับไม่มีสิทธิออก", sectionTh: "ม.82/5(5)", group: "DISALLOWED", source: `${NC17}(5) · ${NC_TAX}`, tag: "V", checkedAt: "2026-11-13" },
];

/** เหตุเมื่อร้านไม่ระบุ — skill ไม่ได้บอก ⇒ ค่าเริ่มของระบบ [S] (กลุ่มรายจ่ายไม่ได้ = ระมัดระวัง) + คำเตือน INPUT_VAT_NONCLAIM_REASON_DEFAULTED */
export const INPUT_VAT_NONCLAIM_DEFAULT_REASON = "NO_TAX_INVOICE";

export function nonClaimReasonOf(code: string | null | undefined): InputVatNonClaimReason | null {
  return INPUT_VAT_NONCLAIM_REASONS.find((r) => r.code === code) ?? null;
}

/**
 * เพดานเคลมภาษีซื้อข้ามเดือน — value = จำนวนเดือน · countFrom = วิธีนับของ skill:
 *   "MONTH_AFTER_INVOICE_MONTH" = "ไม่เกินหกเดือนนับแต่เดือนถัดจากเดือนที่ออกใบกำกับภาษี" ⇒ ใบเดือน M เคลมได้ M … M+value
 */
export type InputVatLateClaimRow = RowBase & { countFrom: "MONTH_AFTER_INVOICE_MONTH" };

export const SYSTEM_INPUT_VAT_LATE_CLAIM_ROWS: readonly InputVatLateClaimRow[] = [
  {
    id: "sys-inputvat-late-claim",
    value: 6,
    countFrom: "MONTH_AFTER_INVOICE_MONTH",
    from: null,
    to: null,
    source: `${VAT_REF} §17 — ประกาศอธิบดีฯ เรื่อง VAT ฉบับที่ 4 ข้อ 2: ใช้เดือนหลังได้ "ไม่เกินหกเดือนนับแต่เดือนถัดจากเดือนที่ออกใบกำกับภาษี" + ระบุ "ถือเป็นภาษีซื้อในเดือนภาษี…" บนใบ (https://www.rd.go.th/3417.html) · audit-checklist-accounting.md C3`,
    tag: "V",
    checkedAt: "2026-11-13",
    note: "เพดานตัวบท 3 ปี (ม.82/3 ว.สี่) — ใช้ในข้อความเตือนเท่านั้น",
  },
];

/** แถวเพดานที่ครอบวันที่ (ไทย YYYY-MM-DD) · ไม่มี = null (ผู้เรียกเตือน NO_ROW ไม่เดา) */
export function lateClaimRuleAt(ymd: Ymd): InputVatLateClaimRow | null {
  return SYSTEM_INPUT_VAT_LATE_CLAIM_ROWS.find((r) => (r.from === null || r.from <= ymd) && (r.to === null || ymd <= r.to)) ?? null;
}

// ═══════════════════ ACC T4 (เลน 2) ▸ สมุดบัญชี · ค่าเสื่อม · รอบบัญชี ═══════════════════
// skill references/domain-accounting-books.md §ก2 §ก5 §ค · domain-business-income-tax.md §ก5 · design notes ledger/wo-notes/T4.1.md T4.3.md T4.6.md
const BOOKS_REF_T4 = "references/domain-accounting-books.md";
const TAX_REF_T4 = "references/domain-business-income-tax.md";
const DBD_2544 = "ประกาศกรมทะเบียนการค้า เรื่อง กำหนดชนิดของบัญชีที่ต้องจัดทำฯ พ.ศ. 2544 (ฉบับรวม DBD ม.ค. 2563)";
const RD_145 = "พ.ร.ฎ. (ฉบับที่ 145) พ.ศ. 2527 https://www.rd.go.th/2369.html";
const br = (id: string, rule: BookRule, value: number, source: string, note?: string): BookRuleRow => ({ id, rule, value, from: null, to: null, source, tag: "V", checkedAt: "2026-11-13", ...(note ? { note } : {}) });
export const SYSTEM_BOOK_ROWS: readonly BookRuleRow[] = [
  br("sys-book-journal-days", "JOURNAL_ENTRY_DAYS", 15, `${BOOKS_REF_T4} §ก2 — ${DBD_2544} ข้อ 7: บัญชีรายวัน "ภายในสิบห้าวันนับแต่วันที่รายการนั้นเกิดขึ้น"`, "ใช้กับผู้มีหน้าที่จัดทำบัญชีตาม พ.ร.บ.การบัญชี ม.8 (ห้างหุ้นส่วนจดทะเบียน · บริษัท)"),
  br("sys-book-ledger-days", "LEDGER_POST_DAYS_AFTER_MONTH", 15, `${BOOKS_REF_T4} §ก2 — ${DBD_2544} ข้อ 7: บัญชีแยกประเภทและบัญชีสินค้า ภายใน 15 วันนับแต่วันสิ้นเดือนของเดือนที่รายการเกิด`),
  br("sys-book-cash-report-wd", "CASH_REPORT_WORKING_DAYS", 3, `${BOOKS_REF_T4} §ค — ประกาศอธิบดีฯ เกี่ยวกับภาษีเงินได้ (ฉบับที่ 161) ข้อ 3: ลงรายการ "ภายใน 3 วันทำการ นับแต่วันที่มีรายได้หรือรายจ่าย" (https://www.rd.go.th/33300.html)`, "ใช้กับบุคคลธรรมดาที่ไม่จด VAT และมีเงินได้ ม.40(5)–(8) · คณะบุคคลอยู่ในข่ายไหมยังไม่ยืนยัน"),
  br("sys-book-first-period", "FIRST_PERIOD_MAX_MONTHS", 12, `${BOOKS_REF_T4} §ก5 — พ.ร.บ.การบัญชี พ.ศ. 2543 ม.10: ปิดบัญชีครั้งแรกภายใน 12 เดือนนับแต่วันเริ่มทำบัญชี · ทุกรอบ 12 เดือน · เปลี่ยนรอบต้องได้รับอนุญาต`),
  br("sys-dep-building", "DEP_MAX_RATE_BUILDING", 500, `${TAX_REF_T4} §ก5 — ม.65 ทวิ (2) + ${RD_145} ม.4: อาคารถาวร ร้อยละ 5 (เพดานต่อปี)`),
  br("sys-dep-temp-building", "DEP_MAX_RATE_TEMP_BUILDING", 10000, `${TAX_REF_T4} §ก5 — ${RD_145} ม.4: อาคารชั่วคราว ร้อยละ 100`),
  br("sys-dep-intangible", "DEP_MAX_RATE_INTANGIBLE", 1000, `${TAX_REF_T4} §ก5 — ${RD_145} ม.4: กู๊ดวิล/เครื่องหมายการค้า/ลิขสิทธิ์ ร้อยละ 10 (มีอายุ = 100 ÷ จำนวนปี)`),
  br("sys-dep-other", "DEP_MAX_RATE_OTHER", 2000, `${TAX_REF_T4} §ก5 — ${RD_145} ม.4: "ทรัพย์สินอย่างอื่น…นอกจากที่ดินและสินค้า ร้อยละ 20"`),
  br("sys-dep-computer", "DEP_COMPUTER_MIN_PERIODS", 3, `${TAX_REF_T4} §ก5 — ${RD_145} ม.4 จัตวา: คอมพิวเตอร์ อุปกรณ์ โปรแกรม หักได้ภายใน 3 รอบระยะเวลาบัญชี`),
  br("sys-dep-car-cap", "DEP_PASSENGER_CAR_COST_CAP", 100_000_000, `${TAX_REF_T4} §ก5 — ${RD_145} ม.5: รถยนต์นั่ง/รถยนต์โดยสารไม่เกิน 10 ที่นั่ง ฐานคิดค่าเสื่อมไม่เกิน 1,000,000 บาท · ม.65 ตรี (20) + พ.ร.ฎ.315`),

  // ── ACC T5 (เลน 2) ▸ T5.3 เกณฑ์จด VAT · T5.5 ค่ารับรอง/บริจาค · T5.7 หนี้สูญ · T5.6 อากรแสตมป์ · T5.1 ตัวเตือนรายปี ──
  br("sys-vat-reg-threshold", "VAT_REG_THRESHOLD", 180_000_000, `references/common-vat-invoice.md §1 — ม.81/1 + พ.ร.ฎ. (ฉบับที่ 432) พ.ศ. 2548 ม.4: มูลค่าฐานภาษี "ไม่เกินหนึ่งล้านแปดแสนบาทต่อปี" (https://www.rd.go.th/22674.html) · ปี = ปีปฏิทิน (บุคคลธรรมดา) / รอบระยะเวลาบัญชี (นิติบุคคล)`),
  br("sys-vat-reg-within", "VAT_REG_WITHIN_DAYS", 30, `references/common-vat-invoice.md §1 — ม.85/1(1)(ก): ยื่นจด "ภายในสามสิบวันนับแต่วันที่มูลค่าของฐานภาษีในการประกอบกิจการเกิน"`),
  { id: "sys-vat-reg-near", rule: "VAT_REG_NEAR_RATIO", value: 8000, from: null, to: null, source: "ค่าเริ่มต้นของระบบ — skill บอกแค่ \"เตือนเมื่อใกล้เกณฑ์\" ไม่กำหนดว่าใกล้แค่ไหน (SKILL.md §4 · audit-checklist A9)", tag: "S", checkedAt: "2026-11-13", note: "ร้านปรับได้" },
  br("sys-ent-cap-rate", "ENTERTAINMENT_CAP_RATE", 30, `references/domain-business-income-tax.md §ก4 (4) — กฎกระทรวง ฉบับที่ 143: รวมทั้งรอบ "ไม่เกินร้อยละ 0.3" ของรายได้/ยอดขาย หรือของทุนชำระแล้ว ณ สิ้นรอบ แล้วแต่อย่างใดมากกว่า (https://www.rd.go.th/2495.html)`, "ต้องมีผู้อนุมัติและใบรับ · ภาษีซื้อค่ารับรองนับรวมในเพดานไหมยังไม่ยืนยัน"),
  br("sys-ent-cap-max", "ENTERTAINMENT_CAP_MAX", 1_000_000_000, `references/domain-business-income-tax.md §ก4 (4) — กฎกระทรวง ฉบับที่ 143: สูงสุด 10 ล้านบาท`),
  br("sys-ent-gift", "ENTERTAINMENT_GIFT_PER_PERSON", 200_000, `references/domain-business-income-tax.md §ก4 (4) — กฎกระทรวง ฉบับที่ 143: สิ่งของ "ไม่เกินคนละ 2,000 บาท ในแต่ละคราว"`),
  br("sys-donation-cap", "DONATION_CAP_RATE", 200, `references/domain-business-income-tax.md §ก4 (3) — ม.65 ตรี (3): สาธารณกุศลไม่เกินร้อยละ 2 ของกำไรสุทธิ (+ การศึกษา/กีฬา อีกไม่เกินร้อยละ 2)`),
  br("sys-bad-debt-t1", "BAD_DEBT_TIER1_MAX", 20_000_000, `references/domain-business-income-tax.md §ก6 — กฎกระทรวง ฉบับที่ 186 แก้โดย ฉบับที่ 374 (รอบที่เริ่มในหรือหลัง 1 ม.ค. 2563): ไม่เกิน 200,000 บาทต่อราย มีหลักฐานทวงถามตามสมควรและฟ้องไม่คุ้ม (https://www.rd.go.th/2483.html)`),
  br("sys-bad-debt-t2", "BAD_DEBT_TIER2_MAX", 200_000_000, `references/domain-business-income-tax.md §ก6 — กฎกระทรวง ฉบับที่ 186/374: ไม่เกิน 2,000,000 บาท ฟ้องแล้วศาลรับคำฟ้อง · เกิน 2,000,000 ต้องมีหมายบังคับคดี ฯลฯ`),
  br("sys-stamp-hire", "STAMP_HIRE_PER_1000", 100, `references/domain-accounting-books.md §ง5 — บัญชีอัตราอากรแสตมป์ ลักษณะ 4 จ้างทำของ: 1 บาทต่อ 1,000 บาทหรือเศษของสินจ้าง · ผู้รับจ้างเสีย (https://www.rd.go.th/6162.html)`),
  br("sys-stamp-lease", "STAMP_LEASE_PER_1000", 100, `references/domain-accounting-books.md §ง5 — บัญชีอัตราอากรแสตมป์ ลักษณะ 1 เช่าที่ดิน/โรงเรือน: 1 บาทต่อ 1,000 บาทหรือเศษของค่าเช่าตลอดอายุสัญญา · ผู้ให้เช่าเสีย`),
  br("sys-stamp-e-days", "STAMP_E_PAY_DAYS", 15, `references/domain-accounting-books.md §ง5 — ประกาศอธิบดีฯ เกี่ยวกับอากรแสตมป์ ฉบับที่ 66 แก้โดยฉบับที่ 68: ตราสารอิเล็กทรอนิกส์ชำระ (อ.ส.9) "ก่อนกระทำตราสาร หรือภายในสิบห้าวัน นับแต่วันถัดจากวันกระทำตราสาร"`),
  { id: "sys-annual-remind", rule: "ANNUAL_FILING_REMIND_DAYS", value: 14, from: null, to: null, source: "ค่าเริ่มต้นของระบบ — skill ไม่กำหนดวันเตือนล่วงหน้าของแบบรายปี (ภ.พ.30/ภ.ง.ด. รายเดือนเตือนล่วงหน้า 5 วันตามเดิม)", tag: "S", checkedAt: "2026-11-13", note: "ร้านปรับได้" },
];

export const SYSTEM_ROWS: { [K in LegalTableKind]: readonly LegalRowOf<K>[] } = {
  vat: SYSTEM_VAT_ROWS,
  wht: SYSTEM_WHT_ROWS,
  deadline: SYSTEM_DEADLINE_ROWS,
  book: SYSTEM_BOOK_ROWS,
};

/** ค่าของกฎในตาราง "สมุดบัญชี" ตามหน่วย → ข้อความไทย */
export function bookRuleValueLabel(rule: BookRule, value: number | null): string {
  if (value === null) return "-";
  const u = BOOK_RULE_META[rule]?.unit;
  if (u === "DAYS") return `${value} วัน`;
  if (u === "WORKING_DAYS") return `${value} วันทำการ`;
  if (u === "MONTHS") return `${value} เดือน`;
  if (u === "PERIODS") return `${value} รอบบัญชี`;
  if (u === "SATANG") return `${(value / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })} บาท`;
  if (u === "BP") return `${value / 100}%`;
  return `${value / 100}% ต่อปี`;
}

// ═══════════════════ ตัวเลือกแถว (pure) ═══════════════════

// T0.4: ชนิด/รหัส/ข้อความคำเตือนย้ายไปทะเบียนกลาง `./warnings` (ที่เดียว) — re-export ชื่อเดิมให้ผู้เรียก T0.2
export { CHECK_WITH_ACCOUNTANT_TH, legalWarning, type LegalWarning, type LegalWarningCode };

const covers = (r: { from: Ymd | null; to: Ymd | null }, ymd: Ymd): boolean => (r.from === null || r.from <= ymd) && (r.to === null || ymd <= r.to);

const dimsOf = (kind: LegalTableKind) => LEGAL_DIMS[kind];

function matches(kind: LegalTableKind, row: object, query: Record<string, string>): boolean {
  const r = row as Record<string, unknown>;
  for (const d of dimsOf(kind)) {
    const v = r[d];
    if (v === "ANY") continue;
    if (v !== query[d]) return false;
  }
  return true;
}

function specificity(kind: LegalTableKind, row: object): number {
  const r = row as Record<string, unknown>;
  return dimsOf(kind).filter((d) => r[d] !== "ANY").length;
}

/** เรียง: เจาะจงกว่าก่อน → from ล่าสุดก่อน (null = เก่าสุด) */
function better(kind: LegalTableKind, a: RowBase, b: RowBase): number {
  const s = specificity(kind, b) - specificity(kind, a);
  if (s !== 0) return s;
  return (b.from ?? "").localeCompare(a.from ?? "");
}

function distance(r: RowBase, ymd: Ymd): number {
  if (covers(r, ymd)) return 0;
  const t = Date.parse(`${ymd}T00:00:00Z`);
  if (r.to !== null && ymd > r.to) return t - Date.parse(`${r.to}T00:00:00Z`);
  if (r.from !== null && ymd < r.from) return Date.parse(`${r.from}T00:00:00Z`) - t;
  return Number.MAX_SAFE_INTEGER;
}

export type LegalPick<R extends RowBase> = { row: R | null; origin: "SHOP" | "SYSTEM" | null; nearest: boolean };

/** เลือกแถวเดียว: แถวร้านที่ครอบวันที่ → แถวระบบที่ครอบวันที่ → (allowNearest) แถวใกล้วันที่สุด (ร้านก่อน) */
export function pickLegalRow<K extends LegalTableKind>(
  kind: K,
  shopRows: readonly LegalRowOf<K>[],
  systemRows: readonly LegalRowOf<K>[],
  query: Record<string, string>,
  ymd: Ymd,
  opts: { allowNearest?: boolean } = {},
): LegalPick<LegalRowOf<K>> {
  const m = (rows: readonly LegalRowOf<K>[]) => rows.filter((r) => matches(kind, r, query));
  const shop = m(shopRows);
  const sys = m(systemRows);
  const cov = (rows: LegalRowOf<K>[]) => rows.filter((r) => covers(r, ymd)).sort((a, b) => better(kind, a, b))[0];
  const s = cov(shop);
  if (s) return { row: s, origin: "SHOP", nearest: false };
  const y = cov(sys);
  if (y) return { row: y, origin: "SYSTEM", nearest: false };
  if (opts.allowNearest === false) return { row: null, origin: null, nearest: false };
  const all = [...shop.map((r) => ({ r, o: "SHOP" as const })), ...sys.map((r) => ({ r, o: "SYSTEM" as const }))];
  all.sort((a, b) => distance(a.r, ymd) - distance(b.r, ymd) || (a.o === b.o ? better(kind, a.r, b.r) : a.o === "SHOP" ? -1 : 1));
  const n = all[0];
  return n ? { row: n.r, origin: n.o, nearest: true } : { row: null, origin: null, nearest: false };
}

const fmtVal = (kind: LegalTableKind, r: RowBase & { method?: WhtMethod }): string => {
  if (kind === "deadline") {
    const d = r as unknown as FilingDeadlineRow;
    return FILING_FORM_META[d.form]?.cadence === "ANNUAL" ? deadlineValueLabelTh(d.form, d.channel, r.value) : `วันที่ ${r.value ?? "-"}`;
  }
  if (kind === "book") return bookRuleValueLabel((r as unknown as BookRuleRow).rule, r.value);
  if (r.method && r.method !== "RATE") return WHT_METHOD_LABEL_TH[r.method];
  return r.value === null ? "-" : `${r.value / 100}%`;
};

const sameValue = (a: RowBase & { method?: WhtMethod }, b: RowBase & { method?: WhtMethod }) => a.value === b.value && (a.method ?? "RATE") === (b.method ?? "RATE");

/** แถวร้านนี้ต่างจากแถวระบบป้าย [V]/[V2] ที่มิติเดียวกันและช่วงวันที่ทับกันไหม — คืนคำเตือน (ไม่บล็อก) */
export function shopRowWarnings<K extends LegalTableKind>(kind: K, shopRow: LegalRowOf<K>, systemRows: readonly LegalRowOf<K>[] = SYSTEM_ROWS[kind] as readonly LegalRowOf<K>[]): LegalWarning[] {
  const out: LegalWarning[] = [];
  const q = Object.fromEntries(dimsOf(kind).map((d) => [d, String((shopRow as Record<string, unknown>)[d])]));
  for (const s of systemRows) {
    if (s.tag !== "V" && s.tag !== "V2") continue;
    // มิติตรงกันแบบเป๊ะ (แถวร้านที่ตั้ง ANY ก็เทียบกับแถวระบบ ANY)
    if (!dimsOf(kind).every((d) => (s as Record<string, unknown>)[d] === q[d] || (s as Record<string, unknown>)[d] === "ANY")) continue;
    const overlap = (shopRow.from === null || s.to === null || shopRow.from <= s.to) && (shopRow.to === null || s.from === null || s.from <= shopRow.to);
    if (!overlap || sameValue(shopRow, s)) continue;
    out.push(legalWarning("SHOP_DIFFERS_FROM_DEFAULT", { shop: fmtVal(kind, shopRow), system: fmtVal(kind, s) }, { citation: s.source }));
  }
  return out;
}

/**
 * คำเตือนของแถวที่เลือกได้ (ใช้ทุกครั้งที่อ่านค่า)
 *   systemAlt = แถวระบบที่จะถูกใช้ถ้าร้านไม่ได้ทับ (ผู้เรียกหาด้วย pickLegalRow(kind, [], SYSTEM_ROWS…)) — ใช้เทียบคำเตือน "ต่างจากค่าเริ่มต้น"
 */
export function pickWarnings<K extends LegalTableKind>(kind: K, pick: LegalPick<LegalRowOf<K>>, ymd: Ymd, systemAlt: LegalRowOf<K> | null): LegalWarning[] {
  const out: LegalWarning[] = [];
  const r = pick.row;
  if (!r) {
    out.push(legalWarning("NO_ROW"));
    return out;
  }
  if (pick.nearest) {
    out.push(legalWarning("NO_ROW_FOR_DATE", { ymd, value: fmtVal(kind, r) }, { citation: r.source }));
  }
  if (r.tag === "S" || r.tag === "U") out.push(legalWarning("UNVERIFIED_DEFAULT", {}, { citation: r.source }));
  if (pick.origin === "SHOP" && systemAlt && (systemAlt.tag === "V" || systemAlt.tag === "V2") && !sameValue(r, systemAlt)) {
    out.push(legalWarning("SHOP_DIFFERS_FROM_DEFAULT", { shop: fmtVal(kind, r), system: fmtVal(kind, systemAlt) }, { citation: systemAlt.source }));
  }
  return out;
}

// ═══════════════════ T2.3 ใบลดหนี้ / ใบเพิ่มหนี้ (แถวระบบ [V] — ร้านไม่ทับ) ═══════════════════
// skill common-vat-invoice.md §16 [V] (ม.82/9, 82/10, 86/9, 86/10 · ป.80/2542) + §7 [V] (ประกาศ VAT ฉ.82 ข้อ 2) · design note ledger/wo-notes/T2.3.md

/** มาตราที่พิมพ์บนใบ — §16 วาง ม.86/9 คู่ 86/10 และระบุ "รายการ ม.86/10: คำว่า 'ใบลดหนี้'" ⇒ ใบลดหนี้ = 86/10 · ใบเพิ่มหนี้ = 86/9 */
export const ADJUST_NOTE_SECTIONS: Readonly<Record<"CREDIT" | "DEBIT", { sectionTh: string; source: string; tag: LegalTag; checkedAt: Ymd }>> = {
  CREDIT: { sectionTh: "มาตรา 86/10", source: `${VAT_REF} §16 (ม.82/10, 86/10 · ป.80/2542)`, tag: "V", checkedAt: "2026-11-13" },
  DEBIT: { sectionTh: "มาตรา 86/9", source: `${VAT_REF} §16 (ม.82/9, 86/9 · ป.80/2542)`, tag: "V", checkedAt: "2026-11-13" },
};

export type AdjustReasonGroup = "CREDIT" | "DEBIT" | "ANY";
export type AdjustNoteReason = { code: string; labelTh: string; group: AdjustReasonGroup; sectionTh: string; source: string; tag: LegalTag; checkedAt: Ymd };

/**
 * เหตุผลของใบลด/เพิ่มหนี้ — เฉพาะที่ skill ยกมา (ข้อ 2 ที่เหลือของ ฉ.82 skill ไม่ได้ยกมา ⇒ ร้านใช้ "อื่น ๆ" + พิมพ์สาเหตุเอง · ไม่เดาเพิ่ม)
 *   ลดหนี้: ฉ.82 ข้อ 2(2)(5)(6) · เพิ่มหนี้: ม.82/9 "ส่งของเกิน/ให้บริการเกิน/คำนวณราคาต่ำกว่าจริง"
 */
export const ADJUST_NOTE_REASONS: readonly AdjustNoteReason[] = [
  { code: "CN_DEPOSIT_REFUND", labelTh: "คืนเงินจ่ายล่วงหน้า / เงินประกัน / มัดจำ / เงินจองตามข้อตกลง", group: "CREDIT", sectionTh: "ประกาศ VAT ฉ.82 ข้อ 2(2)", source: `${VAT_REF} §7`, tag: "V", checkedAt: "2026-11-13" },
  { code: "CN_SERVICE_DEFECT", labelTh: "บริการบกพร่อง / ไม่ตรงตามข้อกำหนด", group: "CREDIT", sectionTh: "ประกาศ VAT ฉ.82 ข้อ 2(5)", source: `${VAT_REF} §7`, tag: "V", checkedAt: "2026-11-13" },
  { code: "CN_SERVICE_NOT_PROVIDED", labelTh: "ไม่มีการให้บริการตามสัญญา", group: "CREDIT", sectionTh: "ประกาศ VAT ฉ.82 ข้อ 2(6)", source: `${VAT_REF} §7`, tag: "V", checkedAt: "2026-11-13" },
  { code: "DN_GOODS_OVER", labelTh: "ส่งของเกินจำนวนที่ตกลง", group: "DEBIT", sectionTh: "ม.82/9", source: `${VAT_REF} §16`, tag: "V", checkedAt: "2026-11-13" },
  { code: "DN_SERVICE_OVER", labelTh: "ให้บริการเกินกว่าที่ตกลง", group: "DEBIT", sectionTh: "ม.82/9", source: `${VAT_REF} §16`, tag: "V", checkedAt: "2026-11-13" },
  { code: "DN_PRICE_UNDER", labelTh: "คำนวณราคาต่ำกว่าที่เป็นจริง", group: "DEBIT", sectionTh: "ม.82/9", source: `${VAT_REF} §16`, tag: "V", checkedAt: "2026-11-13" },
  { code: "OTHER", labelTh: "อื่น ๆ (ระบุสาเหตุ)", group: "ANY", sectionTh: "", source: `${VAT_REF} §16 (สาเหตุย่อ)`, tag: "V", checkedAt: "2026-11-13" },
];

/** ชนิดเอกสารปรับปรุงหนี้ → กลุ่ม (ฝั่งซื้อใช้กลุ่มเดียวกับฝั่งขาย) · ไม่ใช่ใบลด/เพิ่มหนี้ = null */
export function adjustGroupOfDocType(docType: string): "CREDIT" | "DEBIT" | null {
  if (docType === "CREDIT_NOTE" || docType === "CREDIT_NOTE_RECEIVED") return "CREDIT";
  if (docType === "DEBIT_NOTE" || docType === "DEBIT_NOTE_RECEIVED") return "DEBIT";
  return null;
}
export function adjustReasonOf(code: string | null | undefined): AdjustNoteReason | null {
  return ADJUST_NOTE_REASONS.find((r) => r.code === code) ?? null;
}
/** เหตุผลที่เสนอในฟอร์มของชนิดเอกสาร (กลุ่มของมัน + อื่น ๆ) */
export function adjustReasonsFor(docType: string): AdjustNoteReason[] {
  const g = adjustGroupOfDocType(docType);
  return ADJUST_NOTE_REASONS.filter((r) => r.group === "ANY" || r.group === g);
}


// ═══════════════════ T2c A6 ใบรับ (ใบเสร็จ) ม.105 — เกณฑ์ที่ต้องออกใบรับ (แถวระบบ — ร้านไม่ทับ) ═══════════════════
// skill domain-accounting-books.md §ง1 [V]: ประกาศอธิบดีฯ เกี่ยวกับอากรแสตมป์ ฉ.34 แก้โดย ฉ.49 — ออกใบรับเมื่อรับแต่ละครั้ง "เกิน" จำนวนนี้
//   ผู้จด VAT ที่เป็นกิจการรายย่อยตาม ม.86/8 เกิน 1,000 บาท · ผู้จด VAT อื่น เกิน 100 บาท · ผู้ได้รับยกเว้น VAT ตาม ม.81/ม.81/1 (ร้านไม่จด VAT) เกิน 100 บาท
//   (ผู้เสียภาษีตาม ม.82/16 เกิน 500 — สถานะ ม.82/16 [U] ไม่ใส่) · value = สตางค์ · ใช้ในคำเตือน RECEIPT_AUTO_OFF (ปิดใบเสร็จอัตโนมัติ)
const BOOKS_REF = "references/domain-accounting-books.md";
export type ReceiptDutyWho = "VAT_SMALL_86_8" | "VAT_OTHER" | "NON_VAT";
export type ReceiptDutyRow = RowBase & { who: ReceiptDutyWho; labelTh: string };
const RD_SRC = `${BOOKS_REF} §ง1 — ม.105 · ประกาศอธิบดีฯ เกี่ยวกับอากรแสตมป์ ฉ.34 (https://www.rd.go.th/3435.html) แก้โดย ฉ.49 (https://www.rd.go.th/23375.html)`;
export const SYSTEM_RECEIPT_DUTY_ROWS: readonly ReceiptDutyRow[] = [
  { id: "sys-receipt-duty-vat-small", who: "VAT_SMALL_86_8", labelTh: "ผู้จด VAT ที่เป็นกิจการรายย่อยตาม ม.86/8", value: 100_000, from: null, to: null, source: RD_SRC, tag: "V", checkedAt: "2026-11-13" },
  { id: "sys-receipt-duty-vat-other", who: "VAT_OTHER", labelTh: "ผู้จดทะเบียน VAT", value: 10_000, from: null, to: null, source: RD_SRC, tag: "V", checkedAt: "2026-11-13" },
  { id: "sys-receipt-duty-non-vat", who: "NON_VAT", labelTh: "ผู้ได้รับยกเว้น VAT (ม.81 / ม.81/1 — ร้านที่ไม่จด VAT)", value: 10_000, from: null, to: null, source: RD_SRC, tag: "V", checkedAt: "2026-11-13" },
];
export function receiptDutyRowOf(who: ReceiptDutyWho, ymd: Ymd): ReceiptDutyRow | null {
  return SYSTEM_RECEIPT_DUTY_ROWS.find((r) => r.who === who && covers(r, ymd)) ?? null;
}

// ═══════════════════ T2c Job C เงินมัดจำที่ถูกริบ (skill common-vat-invoice.md §7 [U]) ═══════════════════
/**
 * "ออกใบกำกับมัดจำแล้วต่อมาริบ" [U] — ค่าเริ่มต้นปลอดภัย = ไม่ออกใบลดหนี้ (VAT คงไว้) · ทางเลือก = ใบลดหนี้ + ใบรับค่าเสียหาย ตามนักบัญชี
 * ค่าเงินที่ริบ (ค่าปรับ/ค่าเสียหาย) ไม่อยู่ในบังคับ VAT (ม.77/2 · กค 0811/11473 ข้อ 3.3(1) · กค 0702/530 — §7 [V])
 */
export const DEPOSIT_FORFEIT_RULE = {
  defaultMode: "KEEP_VAT" as const,
  source: `${VAT_REF} §7 — "ออกใบกำกับมัดจำแล้วต่อมาริบ [U]: ค่าเริ่มต้นปลอดภัย = ไม่ออกใบลดหนี้ (VAT คงไว้)" · ค่าปรับ/ค่าเสียหายไม่อยู่ในบังคับ VAT (ม.77/2 · กค 0811/11473 ข้อ 3.3(1)) [V]`,
  tag: "U" as LegalTag,
  checkedAt: "2026-11-13",
};


// ═══════════════════ ACC T3.6 ▸ ขั้นต่ำ 1,000 บาทต่อสัญญา · ออกภาษีให้ (gross-up) ═══════════════════
// skill common-withholding-tax.md §11 [V] (ท.ป.4/2528 ข้อ 12/7 แก้โดย ท.ป.266/2559 · กค 0706/2356) · §13 [V2]/[U] (สูตรออกภาษีให้)

/**
 * ขั้นต่ำการหักตามคำสั่ง ม.3 เตรส (ท.ป.4/2528): "ต้องมีจำนวนตามสัญญารายหนึ่งๆ…ตั้งแต่หนึ่งพันบาทขึ้นไป แม้การจ่ายนั้นจะได้แบ่งจ่ายครั้งหนึ่งๆ ไม่ถึงหนึ่งพันบาท"
 *   value = สตางค์ · ไม่ใช้กับ ม.50 (อัตราก้าวหน้า/เงินเดือน/ดอกเบี้ย/ปันผล) และ ม.69 ทวิ · วัดก่อนหรือรวม VAT = [U] (ระบบเทียบยอดรวม VAT — ระวังด้านไม่หักผิด)
 */
export type WhtMinimumRow = RowBase & { measure: "CONTRACT_TOTAL" };
export const SYSTEM_WHT_MINIMUM_ROWS: readonly WhtMinimumRow[] = [
  {
    id: "sys-wht-min-1000",
    value: 100_000,
    measure: "CONTRACT_TOTAL",
    from: null,
    to: null,
    source: `${WHT_REF} §11 — ท.ป.4/2528 ข้อ 12/7 (แก้โดย ท.ป.266/2559): ยอดตามสัญญารายหนึ่ง ๆ ตั้งแต่ 1,000 บาท แม้แบ่งจ่ายครั้งละไม่ถึง · กค 0706/2356: ยอดสะสมถึง 1,000 ต้องนำยอดครั้งก่อนมารวมหัก`,
    tag: "V",
    checkedAt: "2026-11-13",
    note: "วัดก่อนหรือรวม VAT ยังไม่ยืนยัน [U] — ระบบเทียบยอดรวม VAT ของสัญญา (เตือนว่า \"ไม่ถึงขั้นต่ำ\" เฉพาะเมื่อแน่ใจว่าไม่ถึง) · ผ่อนผันธนาคารพาณิชย์: ค่าบริการแต่ละครั้งไม่ถึง 1,000 ไม่ต้องหัก (กค 0811/7657)",
  },
];
export function whtMinimumAt(ymd: Ymd): WhtMinimumRow | null {
  return SYSTEM_WHT_MINIMUM_ROWS.find((r) => covers(r, ymd)) ?? null;
}

/** เงื่อนไขบน 50 ทวิ (แบบทางการ 3 ช่อง — skill §13 [V]): หัก ณ ที่จ่าย · ออกให้ตลอดไป · ออกให้ครั้งเดียว */
export const WHT_CONDITIONS = ["WITHHOLD", "PAY_ALWAYS", "PAY_ONCE"] as const;
export type WhtCondition = (typeof WHT_CONDITIONS)[number];
export const WHT_CONDITION_LABEL_TH: Record<WhtCondition, string> = { WITHHOLD: "หัก ณ ที่จ่าย", PAY_ALWAYS: "ออกให้ตลอดไป", PAY_ONCE: "ออกให้ครั้งเดียว" };

/**
 * สูตรออกภาษีให้ — กรมสรรพากรไม่มีสูตรทางการ [U] · สูตรที่ใช้กันในวงการ [V2 — bangkokbiznews/Inflow, PEAK] เป็นค่าเริ่มต้น · ร้านเลือกสูตรอื่นได้ (ค่าตั้ง)
 *   GROSS_UP_CONVERGED = สุทธิ × r ÷ (100 − r)  (10,000 @3% → 309.28 · เงินได้ 10,309.28) — ค่าเริ่มของ "ออกให้ตลอดไป"
 *   GROSS_UP_ONE_STEP  = (สุทธิ + สุทธิ × r) × r — ค่าเริ่มของ "ออกให้ครั้งเดียว"
 *   NET_TIMES_RATE     = สุทธิ × r (ไม่คิดภาษีซ้อน)
 */
export const WHT_GROSS_UP_FORMULAS = ["GROSS_UP_CONVERGED", "GROSS_UP_ONE_STEP", "NET_TIMES_RATE"] as const;
export type WhtGrossUpFormula = (typeof WHT_GROSS_UP_FORMULAS)[number];
export const WHT_GROSS_UP_FORMULA_LABEL_TH: Record<WhtGrossUpFormula, string> = {
  GROSS_UP_CONVERGED: "สุทธิ × r ÷ (100 − r)",
  GROSS_UP_ONE_STEP: "(สุทธิ + สุทธิ × r) × r",
  NET_TIMES_RATE: "สุทธิ × r",
};
export const WHT_GROSS_UP_RULE = {
  defaults: { PAY_ALWAYS: "GROSS_UP_CONVERGED", PAY_ONCE: "GROSS_UP_ONE_STEP" } as Record<"PAY_ALWAYS" | "PAY_ONCE", WhtGrossUpFormula>,
  source: `${WHT_REF} §13 — ภาษีที่ออกแทนเป็นเงินได้ของผู้รับ "ไม่ว่าในทอดใด" (ม.40 ว.แรก) [V] · 50 ทวิ มี 3 เงื่อนไข [V] · สูตรทางการไม่พบ [U] · สูตรในวงการ [V2]`,
  tag: "U" as LegalTag,
  checkedAt: "2026-11-13",
};

/** ACC T3.6 ▸ ค่าธรรมเนียมรับบัตร/MDR = ค่าบริการที่ต้องหัก (คำชี้แจงข้อ 2.4 [V]) · ธนาคารพาณิชย์ผ่อนผันเมื่อแต่ละครั้งไม่ถึง 1,000 (กค 0811/7657 [V]) · GP แพลตฟอร์มเดลิเวอรี [U] */
export const WHT_FEE_RULE = {
  bankPerTimeMinSatang: 100_000,
  source: `${WHT_REF} §16 — คำชี้แจง ท.ป.101/2544 ข้อ 2.4: ค่าธรรมเนียมรับบัตรเครดิตเป็นบริการที่ต้องหัก [V] · §11 ผ่อนผันธนาคารพาณิชย์ ค่าบริการแต่ละครั้งไม่ถึง 1,000 (กค 0811/7657) [V] · GP แพลตฟอร์มเดลิเวอรี ไม่มีข้อหารือตรง [U]`,
  tag: "V" as LegalTag,
  checkedAt: "2026-11-13",
};

/** ACC T3.6 ▸ ผู้ขายเป็น "ตัวแทนหักภาษี" (ประกาศอธิบดีฯ ภาษีเงินได้ ฉ.457 แก้โดย ฉ.459 · จ่ายตั้งแต่ 1 ก.ค. 2568) — ผู้จ่ายยกเว้นออก 50 ทวิ [V] · แพลตฟอร์มรายใดใช้ [U] */
export const WHT_AGENT_RULE = {
  from: "2025-07-01",
  source: `${WHT_REF} §16 — ประกาศอธิบดีฯ ภาษีเงินได้ ฉ.457 (แก้โดย ฉ.459) ใช้กับการจ่ายตั้งแต่ 1 ก.ค. 2568: ผู้ถูกหัก (บริษัท) หัก-ยื่น ภ.ง.ด.53-นำส่งแทน · ผู้จ่ายยกเว้นการออก 50 ทวิ [V] · แพลตฟอร์มรายใดใช้ [U]`,
  tag: "V" as LegalTag,
  checkedAt: "2026-11-13",
};
// ═══════════════════ T3.3 / T3.4 แบบ ภ.ง.ด. × ผู้รับ + ช่องบน 50 ทวิ (แถวระบบ — บล็อกของเลน 2) ═══════════════════
// skill common-withholding-tax.md §1 §3 §5 §7 §10 §15 · design note ledger/wo-notes/T3.4.md
// แถวเจาะจง (ประเภทเงินได้ระบุ) ชนะแถว ANY ของผู้รับเดียวกัน · ป้าย U = คำเตือน WHT_FORM_UNVERIFIED (ไม่บล็อก)

export const PND_FORMS = ["PND1", "PND2", "PND3", "PND53", "PND54"] as const;
export type PndForm = (typeof PND_FORMS)[number];
export const WHT_FORM_RECIPIENTS = ["INDIVIDUAL_TH", "JURISTIC_TH", "FOUNDATION", "FOREIGN_PE", "FOREIGN_JURISTIC", "FOREIGN_INDIVIDUAL"] as const;
export type WhtFormRecipient = (typeof WHT_FORM_RECIPIENTS)[number];
export const WHT_FORM_RECIPIENT_LABEL_TH: Record<WhtFormRecipient, string> = {
  INDIVIDUAL_TH: "บุคคลธรรมดาไทย",
  JURISTIC_TH: "นิติบุคคลไทย",
  FOUNDATION: "มูลนิธิ/สมาคม",
  FOREIGN_PE: "บริษัทต่างประเทศมีสาขาถาวรในไทย",
  FOREIGN_JURISTIC: "นิติบุคคลต่างประเทศ (ไม่ได้ประกอบกิจการในไทย)",
  FOREIGN_INDIVIDUAL: "บุคคลธรรมดาต่างประเทศ",
};

/** ช่องชนิดแบบบนหนังสือรับรอง 50 ทวิ (แบบทางการ · WHT §7) */
export const WHT_CERT_FORM_BOXES: readonly { box: 1 | 2 | 3 | 4 | 5 | 6 | 7; labelTh: string }[] = [
  { box: 1, labelTh: "ภ.ง.ด.1ก" },
  { box: 2, labelTh: "ภ.ง.ด.1ก พิเศษ" },
  { box: 3, labelTh: "ภ.ง.ด.2" },
  { box: 4, labelTh: "ภ.ง.ด.3" },
  { box: 5, labelTh: "ภ.ง.ด.2ก" },
  { box: 6, labelTh: "ภ.ง.ด.3ก" },
  { box: 7, labelTh: "ภ.ง.ด.53" },
];

export type WhtFormRow = RowBase & {
  /** รหัสประเภทเงินได้ (M40_1…M40_8) ที่แถวนี้ครอบ · "ANY" = ทุกประเภทที่ไม่มีแถวเจาะจง */
  incomeTypes: readonly string[] | "ANY";
  recipient: WhtFormRecipient;
  form: PndForm;
  /** ช่องบน 50 ทวิ · null = แบบไม่มีช่อง */
  certBox: 1 | 2 | 3 | 4 | 5 | 6 | 7 | null;
  /** แบบสรุปรายปี (ภ.ง.ด.1ก) */
  annualForm: "PND1K" | null;
};

const F1 = `${WHT_REF} §1 (โครงสร้าง ม.50 · ม.3 เตรส · ม.70)`;
const wf = (id: string, r: Omit<WhtFormRow, "id" | "value" | "from" | "to" | "annualForm"> & Partial<Pick<WhtFormRow, "annualForm">>): WhtFormRow => ({ id, value: null, from: null, to: null, annualForm: null, ...r });

export const SYSTEM_WHT_FORM_ROWS: readonly WhtFormRow[] = [
  // ── บุคคลธรรมดาไทย ──
  wf("sys-whtform-ind-50-1", { incomeTypes: ["M40_1", "M40_2"], recipient: "INDIVIDUAL_TH", form: "PND1", certBox: 1, annualForm: "PND1K", source: `${F1} · §3 (ค่านายหน้าให้บุคคลธรรมดา = ม.50(1) ภ.ง.ด.1) · §7 (50 ทวิ ภายใน 15 ก.พ.)`, tag: "V", checkedAt: "2026-11-13", note: "ม.50(1) · 50 ทวิ ออกภายใน 15 ก.พ. ปีถัดไป" }),
  wf("sys-whtform-ind-50-2", { incomeTypes: ["M40_3", "M40_4"], recipient: "INDIVIDUAL_TH", form: "PND2", certBox: 3, source: `${WHT_REF} §10 (ข้อ 3/2 · 4(3) หมายเหตุ: ผู้รับบุคคลธรรมดา = ม.50(2)) · §15 (ภ.ง.ด.2)`, tag: "V", checkedAt: "2026-11-13" }),
  wf("sys-whtform-ind-any", { incomeTypes: "ANY", recipient: "INDIVIDUAL_TH", form: "PND3", certBox: 4, source: F1, tag: "V", checkedAt: "2026-11-13" }),
  // ── นิติบุคคลไทย ──
  wf("sys-whtform-jur-any", { incomeTypes: "ANY", recipient: "JURISTIC_TH", form: "PND53", certBox: 7, source: F1, tag: "V", checkedAt: "2026-11-13" }),
  wf("sys-whtform-fdn-any", { incomeTypes: "ANY", recipient: "FOUNDATION", form: "PND53", certBox: 7, source: `${WHT_REF} §10 (มูลนิธิ/สมาคม 10%) — แหล่งไม่ระบุแบบ`, tag: "U", checkedAt: "2026-11-13", note: "แหล่งระบุอัตราแต่ไม่ระบุแบบ" }),
  wf("sys-whtform-fpe-any", { incomeTypes: "ANY", recipient: "FOREIGN_PE", form: "PND53", certBox: 7, source: `${WHT_REF} §10 (ข้อ 8(3) บริษัทต่างประเทศมีสาขาถาวร 3%) — แหล่งไม่ระบุแบบ`, tag: "U", checkedAt: "2026-11-13", note: "ไม่พบแหล่งที่ระบุแบบของผู้รับประเภทนี้" }),
  // ── ต่างประเทศ ──
  wf("sys-whtform-foreign-70", { incomeTypes: ["M40_2", "M40_3", "M40_4", "M40_5", "M40_6"], recipient: "FOREIGN_JURISTIC", form: "PND54", certBox: null, source: `${F1} · §5 (ม.70 ภ.ง.ด.54 ภายใน 7 วัน) · แบบ 50 ทวิ ไม่มีช่อง ภ.ง.ด.54 [U]`, tag: "V", checkedAt: "2026-11-13", note: "แบบ 50 ทวิ ไม่มีช่อง ภ.ง.ด.54 (ยังไม่ยืนยัน)" }),
  wf("sys-whtform-foreign-any", { incomeTypes: "ANY", recipient: "FOREIGN_JURISTIC", form: "PND53", certBox: 7, source: `${WHT_REF} §10 (ข้อ 12 จ้างทำของ บริษัทต่างประเทศไม่มีสาขาถาวร 5% — คำสั่ง ม.3 เตรส) — แหล่งไม่ระบุแบบ`, tag: "U", checkedAt: "2026-11-13", note: "ไม่พบแหล่งที่ระบุแบบของผู้รับประเภทนี้" }),
  wf("sys-whtform-fi-50-1", { incomeTypes: ["M40_1", "M40_2"], recipient: "FOREIGN_INDIVIDUAL", form: "PND1", certBox: 1, annualForm: "PND1K", source: `${WHT_REF} §5 (ม.50(1) ว.สี่ ร้อยละ 15 · ค่าเริ่มต้นไม่หัก) — แหล่งไม่ระบุแบบ`, tag: "U", checkedAt: "2026-11-13", note: "ไม่พบแหล่งที่ระบุแบบของผู้รับประเภทนี้" }),
  wf("sys-whtform-fi-any", { incomeTypes: "ANY", recipient: "FOREIGN_INDIVIDUAL", form: "PND3", certBox: 4, source: `${WHT_REF} §1 — แหล่งไม่ระบุแบบของผู้รับบุคคลธรรมดาต่างประเทศ`, tag: "U", checkedAt: "2026-11-13", note: "ไม่พบแหล่งที่ระบุแบบของผู้รับประเภทนี้" }),
];

// ═══════════════════ ACC T5.5 (เลน 2) ▸ อนุมาตรารายจ่ายต้องห้าม ม.65 ตรี (ธงต่อบัญชี "อาจต้องบวกกลับ") ═══════════════════
// skill references/domain-business-income-tax.md §ก4 [V ทั้งตาราง] · scope FULL = บวกกลับทั้งจำนวน · EXCESS = เฉพาะส่วนเกินเพดาน (ระบบคำนวณเฉพาะค่ารับรอง)
export type TaxAddBackSection = { code: string; labelTh: string; sectionTh: string; scope: "FULL" | "EXCESS"; source: string; tag: LegalTag; checkedAt: Ymd };
const AB_SRC = "references/domain-business-income-tax.md §ก4";
export const TAX_ADD_BACK_SECTIONS: readonly TaxAddBackSection[] = [
  { code: "S65TRI_1", labelTh: "เงินสำรอง / ค่าเผื่อ / ประมาณการหนี้สิน", sectionTh: "ม.65 ตรี (1)", scope: "FULL", source: `${AB_SRC} (1)`, tag: "V", checkedAt: "2026-11-13" },
  { code: "S65TRI_3", labelTh: "รายจ่ายส่วนตัว · ให้โดยเสน่หา · การกุศล (สาธารณกุศลหักได้ไม่เกินเพดาน)", sectionTh: "ม.65 ตรี (3)", scope: "EXCESS", source: `${AB_SRC} (3)`, tag: "V", checkedAt: "2026-11-13" },
  { code: "S65TRI_4", labelTh: "ค่ารับรองส่วนที่เกินเพดาน", sectionTh: "ม.65 ตรี (4) · กฎกระทรวง ฉบับที่ 143", scope: "EXCESS", source: `${AB_SRC} (4)`, tag: "V", checkedAt: "2026-11-13" },
  { code: "S65TRI_5", labelTh: "รายจ่ายลักษณะลงทุน / ต่อเติมปรับปรุง", sectionTh: "ม.65 ตรี (5)", scope: "FULL", source: `${AB_SRC} (5)`, tag: "V", checkedAt: "2026-11-13" },
  { code: "S65TRI_6", labelTh: "เบี้ยปรับ เงินเพิ่มภาษี ค่าปรับอาญา ภาษีเงินได้นิติบุคคล", sectionTh: "ม.65 ตรี (6)", scope: "FULL", source: `${AB_SRC} (6)`, tag: "V", checkedAt: "2026-11-13" },
  { code: "S65TRI_6BIS", labelTh: "ภาษีซื้อต้องห้ามที่เป็นรายจ่ายไม่ได้", sectionTh: "ม.65 ตรี (6 ทวิ)", scope: "FULL", source: `${AB_SRC} (6 ทวิ)`, tag: "V", checkedAt: "2026-11-13" },
  { code: "S65TRI_9", labelTh: "รายจ่ายที่ไม่ได้จ่ายจริง / รายจ่ายของรอบอื่น", sectionTh: "ม.65 ตรี (9)", scope: "FULL", source: `${AB_SRC} (9)`, tag: "V", checkedAt: "2026-11-13" },
  { code: "S65TRI_13", labelTh: "รายจ่ายที่มิใช่เพื่อหากำไรหรือเพื่อกิจการ", sectionTh: "ม.65 ตรี (13)", scope: "FULL", source: `${AB_SRC} (13)`, tag: "V", checkedAt: "2026-11-13" },
  { code: "S65TRI_17", labelTh: "ค่าทรัพย์สินที่ตีราคาต่ำลง (ด้อยค่า)", sectionTh: "ม.65 ตรี (17)", scope: "FULL", source: `${AB_SRC} (17)`, tag: "V", checkedAt: "2026-11-13" },
  { code: "S65TRI_18", labelTh: "รายจ่ายที่พิสูจน์ไม่ได้ว่าใครเป็นผู้รับ", sectionTh: "ม.65 ตรี (18)", scope: "FULL", source: `${AB_SRC} (18)`, tag: "V", checkedAt: "2026-11-13" },
  { code: "S65TRI_20", labelTh: "รถยนต์นั่ง ≤10 ที่นั่ง ส่วนที่เกินเพดาน (ต้นทุน/ค่าเช่า)", sectionTh: "ม.65 ตรี (20) · พ.ร.ฎ. ฉบับที่ 315", scope: "EXCESS", source: `${AB_SRC} (20)`, tag: "V", checkedAt: "2026-11-13" },
];
export const TAX_ADD_BACK_NONE = "NONE";
export function taxAddBackSectionOf(code: string | null | undefined): TaxAddBackSection | null {
  return TAX_ADD_BACK_SECTIONS.find((s) => s.code === code) ?? null;
}
/** ค่าเริ่มต้นตามรหัสบัญชีของผังบัญชีระบบ (คอลัมน์ taxAddBack = null) — 6970 ภาษีที่ออกแทนผู้รับ [U] ไม่ติดธงอัตโนมัติ */
export const TAX_ADD_BACK_DEFAULT_BY_CODE: Readonly<Record<string, string>> = {
  "6930": "S65TRI_4",
  "6940": "S65TRI_20",
  "6960": "S65TRI_6BIS",
  "6710": "S65TRI_1",
  "6980": "S65TRI_3",
  "6985": "S65TRI_6",
  "6990": "S65TRI_6",
};
/** ธงที่มีผลของบัญชี: คอลัมน์ (ร้านตั้ง/ปลด) ชนะ · null = ค่าเริ่มต้นตามรหัส */
export function effectiveTaxAddBack(ledger: { code: string; taxAddBack: string | null }): string | null {
  if (ledger.taxAddBack === TAX_ADD_BACK_NONE) return null;
  if (ledger.taxAddBack) return ledger.taxAddBack;
  return TAX_ADD_BACK_DEFAULT_BY_CODE[ledger.code] ?? null;
}

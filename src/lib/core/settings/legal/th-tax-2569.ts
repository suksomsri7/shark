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

export const FILING_FORMS = ["PP30", "PND1", "PND2", "PND3", "PND53", "PND54"] as const;
export type FilingForm = (typeof FILING_FORMS)[number];
export const FILING_CHANNELS = ["PAPER", "ONLINE"] as const;
export type FilingChannel = (typeof FILING_CHANNELS)[number];

/** value = "ภายในวันที่ N ของเดือนถัดจากเดือนภาษี" · ช่วง from/to ของแถว ONLINE = ช่วงของ "วันครบกำหนดปกติ" ที่ประกาศขยายเวลาครอบ */
export type FilingDeadlineRow = RowBase & { form: FilingForm; channel: FilingChannel };

export type LegalTableKind = "vat" | "wht" | "deadline";
export type LegalRowOf<K extends LegalTableKind> = K extends "vat" ? VatRateRow : K extends "wht" ? WhtRateRow : FilingDeadlineRow;

/** มิติของแต่ละตาราง (ใช้จับคู่แถวร้านกับแถวระบบ) */
export const LEGAL_DIMS: { [K in LegalTableKind]: readonly string[] } = {
  vat: [],
  wht: ["incomeType", "payer", "recipient", "channel"],
  deadline: ["form", "channel"],
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
];

const dl = (id: string, r: Omit<FilingDeadlineRow, "id">): FilingDeadlineRow => ({ id, ...r });
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
];

export const SYSTEM_ROWS: { [K in LegalTableKind]: readonly LegalRowOf<K>[] } = {
  vat: SYSTEM_VAT_ROWS,
  wht: SYSTEM_WHT_ROWS,
  deadline: SYSTEM_DEADLINE_ROWS,
};

// ═══════════════════ ตัวเลือกแถว (pure) ═══════════════════

export type LegalWarningCode =
  | "SHOP_DIFFERS_FROM_DEFAULT"
  | "UNVERIFIED_DEFAULT"
  | "NO_ROW_FOR_DATE"
  | "NO_ROW"
  | "EWHT_NOT_IN_EFFECT"
  | "ENTITY_KIND_UNSET"
  | "RECIPIENT_ASSUMED";

export type LegalWarning = { code: LegalWarningCode; messageTh: string; citation?: string };

/** ข้อความกลางสำหรับค่าที่ไม่ได้มาจากเอกสารทางการ (กติกาข้อ 1 ของ ACCOUNT-TAX-PLAN) */
export const CHECK_WITH_ACCOUNTANT_TH = "โปรดตรวจกับนักบัญชีของร้าน";

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
  if (kind === "deadline") return `วันที่ ${r.value ?? "-"}`;
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
    out.push({
      code: "SHOP_DIFFERS_FROM_DEFAULT",
      messageTh: `ค่าที่ร้านตั้ง (${fmtVal(kind, shopRow)}) ต่างจากค่าเริ่มต้นของระบบ (${fmtVal(kind, s)}) — ระบบใช้ค่าของร้าน ${CHECK_WITH_ACCOUNTANT_TH}`,
      citation: s.source,
    });
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
    out.push({ code: "NO_ROW", messageTh: `ไม่มีค่าในตารางค่ากฎหมายสำหรับกรณีนี้ — กรอกเองหรือเพิ่มแถวในตั้งค่า ${CHECK_WITH_ACCOUNTANT_TH}` });
    return out;
  }
  if (pick.nearest) {
    out.push({ code: "NO_ROW_FOR_DATE", messageTh: `ไม่มีค่าในตารางที่มีผลวันที่ ${ymd} — ระบบใช้ค่าใกล้ที่สุด (${fmtVal(kind, r)}) ไปก่อน ${CHECK_WITH_ACCOUNTANT_TH}`, citation: r.source });
  }
  if (r.tag === "S" || r.tag === "U") out.push({ code: "UNVERIFIED_DEFAULT", messageTh: `ค่าเริ่มต้นนี้ยังไม่ได้ยืนยันจากเอกสารทางการ — ${CHECK_WITH_ACCOUNTANT_TH}`, citation: r.source });
  if (pick.origin === "SHOP" && systemAlt && (systemAlt.tag === "V" || systemAlt.tag === "V2") && !sameValue(r, systemAlt)) {
    out.push({
      code: "SHOP_DIFFERS_FROM_DEFAULT",
      messageTh: `ค่าที่ร้านตั้ง (${fmtVal(kind, r)}) ต่างจากค่าเริ่มต้นของระบบ (${fmtVal(kind, systemAlt)}) — ระบบใช้ค่าของร้าน ${CHECK_WITH_ACCOUNTANT_TH}`,
      citation: systemAlt.source,
    });
  }
  return out;
}

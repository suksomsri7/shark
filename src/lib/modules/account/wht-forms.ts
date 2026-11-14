// ─────────────────────────────────────────────────────────────
// wht-forms.ts — ACC T3.3/T3.4 · ตัวจับแบบ ภ.ง.ด. + ข้อมูลบนแบบ 50 ทวิ (pure ล้วน — client/ข้อสอบ import ได้)
//   แบบ = ตารางค่ากฎหมาย `SYSTEM_WHT_FORM_ROWS` (th-tax-2569.ts · ป้าย/ที่มาต่อแถว) · ผู้รับ = สำเนาผู้ติดต่อที่ตรึงตอนออกใบ
//   design note ledger/wo-notes/T3.3.md · T3.4.md
// 🔴 ไม่ import prisma/next · ไม่อ่านนาฬิกา
// ─────────────────────────────────────────────────────────────
import {
  SYSTEM_WHT_FORM_ROWS,
  WHT_CERT_FORM_BOXES,
  type PndForm,
  type WhtFormRecipient,
  type WhtFormRow,
} from "@/lib/core/settings/legal/th-tax-2569";
import { legalWarning, type LegalWarning } from "@/lib/core/settings/legal/warnings";

export type { PndForm, WhtFormRecipient, WhtFormRow };

/** เลขแบบที่เก็บใน AccountWhtFiling.form (Int) */
export const PND_FORM_NUMBERS = [1, 2, 3, 53, 54] as const;
export type PndFormNumber = (typeof PND_FORM_NUMBERS)[number];
export const isPndFormNumber = (v: unknown): v is PndFormNumber => typeof v === "number" && (PND_FORM_NUMBERS as readonly number[]).includes(v);

export const PND_FORM_OF_NUMBER: Record<PndFormNumber, PndForm> = { 1: "PND1", 2: "PND2", 3: "PND3", 53: "PND53", 54: "PND54" };
export const PND_NUMBER_OF_FORM: Record<PndForm, PndFormNumber> = { PND1: 1, PND2: 2, PND3: 3, PND53: 53, PND54: 54 };
export const PND_FORM_LABEL_TH: Record<PndFormNumber, string> = { 1: "ภ.ง.ด.1", 2: "ภ.ง.ด.2", 3: "ภ.ง.ด.3", 53: "ภ.ง.ด.53", 54: "ภ.ง.ด.54" };

/** ข้อมูลผู้รับที่ตัวจับแบบใช้ (จากสำเนาผู้ติดต่อ contactSnapshot หรือผู้ติดต่อสด) */
export type RecipientFacts = {
  legalType?: string | null; // PERSON | COMPANY
  taxIdCountry?: string | null;
  country?: string | null;
  legalEntityType?: string | null;
  /** เลน 1 (T3.1) อาจเพิ่มชนิดผู้รับตรง — ส่งมา = ใช้ก่อน */
  whtRecipient?: string | null;
};

const RECIPIENTS: readonly WhtFormRecipient[] = ["INDIVIDUAL_TH", "JURISTIC_TH", "FOUNDATION", "FOREIGN_PE", "FOREIGN_JURISTIC", "FOREIGN_INDIVIDUAL"];

/** ชนิดผู้รับของตัวจับแบบ — ค่าเริ่มต้นของระบบ: ไม่มีข้อมูลประเทศ = ไทย · นิติบุคคลต่างประเทศ = ไม่มีสาขาถาวร (ไม่มีธงในผู้ติดต่อ) */
export function recipientOf(f: RecipientFacts | null | undefined): WhtFormRecipient {
  const direct = f?.whtRecipient;
  if (direct && (RECIPIENTS as readonly string[]).includes(direct)) return direct as WhtFormRecipient;
  if (direct === "FOREIGN") return f?.legalType === "PERSON" ? "FOREIGN_INDIVIDUAL" : "FOREIGN_JURISTIC";
  const person = f?.legalType === "PERSON";
  const c = (f?.taxIdCountry || f?.country || "TH").trim().toUpperCase();
  const foreign = c !== "" && c !== "TH" && c !== "THA" && c !== "THAILAND";
  if (foreign) return person ? "FOREIGN_INDIVIDUAL" : "FOREIGN_JURISTIC";
  if (person) return "INDIVIDUAL_TH";
  if (/มูลนิธิ|สมาคม/.test(f?.legalEntityType ?? "")) return "FOUNDATION";
  return "JURISTIC_TH";
}

export type WhtFormPick = { row: WhtFormRow; form: PndFormNumber; recipient: WhtFormRecipient; warnings: LegalWarning[] };

/** แบบ ภ.ง.ด. ของรายการ — แถวเจาะจง (ประเภทเงินได้ตรง) ชนะแถว ANY · ป้าย U/S = คำเตือน WHT_FORM_UNVERIFIED */
export function whtFormOf(incomeType: string | null | undefined, facts: RecipientFacts | null | undefined, rows: readonly WhtFormRow[] = SYSTEM_WHT_FORM_ROWS): WhtFormPick {
  const recipient = recipientOf(facts);
  const cands = rows.filter((r) => r.recipient === recipient && (r.incomeTypes === "ANY" || (!!incomeType && r.incomeTypes.includes(incomeType))));
  cands.sort((a, b) => (a.incomeTypes === "ANY" ? 1 : 0) - (b.incomeTypes === "ANY" ? 1 : 0));
  // ทุกชนิดผู้รับมีแถว ANY ในตารางระบบ (ข้อสอบตรวจ) — ถ้าไม่มี (ตารางร้านแปลก) ถอยไปกติกาเดิม บุคคล 3 / อื่น 53
  const row: WhtFormRow =
    cands[0] ??
    ({
      id: "fallback",
      incomeTypes: "ANY",
      recipient,
      form: recipient === "INDIVIDUAL_TH" || recipient === "FOREIGN_INDIVIDUAL" ? "PND3" : "PND53",
      certBox: recipient === "INDIVIDUAL_TH" || recipient === "FOREIGN_INDIVIDUAL" ? 4 : 7,
      annualForm: null,
      value: null,
      from: null,
      to: null,
      source: "ค่าเริ่มต้นของระบบ (ไม่มีแถวในตาราง)",
      tag: "U",
      checkedAt: null,
    } satisfies WhtFormRow);
  const warnings: LegalWarning[] = [];
  if (row.tag === "U" || row.tag === "S") warnings.push(legalWarning("WHT_FORM_UNVERIFIED", { form: PND_FORM_LABEL_TH[PND_NUMBER_OF_FORM[row.form]], note: row.note ?? "" }, { citation: row.source }));
  return { row, form: PND_NUMBER_OF_FORM[row.form], recipient, warnings };
}

/** ช่องชนิดแบบบน 50 ทวิ (1–7 · null = แบบไม่มีช่อง เช่น ภ.ง.ด.54) */
export const certBoxLabel = (box: number | null): string | null => (box == null ? null : (WHT_CERT_FORM_BOXES.find((b) => b.box === box)?.labelTh ?? null));

// ═══════════ แถวประเภทเงินได้บนแบบ 50 ทวิ (ข้อ 1–6 ของแบบทางการ) ═══════════

/** แถวของแบบที่ใบนี้กรอก — WHT §7 (ข้อ 1 เงินเดือน · 2 ม.40(2) · 3 ม.40(3) · 4(ก) ดอกเบี้ย · 5 ตามคำสั่ง ม.3 เตรส · 6 อื่น ๆ) */
export function certIncomeRow(incomeType: string | null | undefined): 1 | 2 | 3 | 4 | 5 | 6 {
  switch (incomeType) {
    case "M40_1":
      return 1;
    case "M40_2":
      return 2;
    case "M40_3":
      return 3;
    case "M40_4":
      return 4;
    case "M40_5":
    case "M40_6":
    case "M40_7":
    case "M40_8":
      return 5;
    default:
      return 6;
  }
}

export const CERT_INCOME_ROWS: readonly { row: 1 | 2 | 3 | 4 | 5 | 6; labelTh: string }[] = [
  { row: 1, labelTh: "1. เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ ตามมาตรา 40 (1)" },
  { row: 2, labelTh: "2. ค่าธรรมเนียม ค่านายหน้า ฯลฯ ตามมาตรา 40 (2)" },
  { row: 3, labelTh: "3. ค่าแห่งลิขสิทธิ์ ฯลฯ ตามมาตรา 40 (3)" },
  { row: 4, labelTh: "4. (ก) ดอกเบี้ย ฯลฯ ตามมาตรา 40 (4) (ก)" },
  {
    row: 5,
    labelTh:
      "5. การจ่ายเงินได้ที่ต้องหักภาษี ณ ที่จ่าย ตามคำสั่งกรมสรรพากรที่ออกตามมาตรา 3 เตรส เช่น รางวัล ส่วนลดหรือประโยชน์ใด ๆ เนื่องจากการส่งเสริมการขาย รางวัลในการประกวด การแข่งขัน การชิงโชค ค่าแสดงของนักแสดงสาธารณะ ค่าจ้างทำของ ค่าโฆษณา ค่าเช่า ค่าขนส่ง ค่าบริการ ค่าเบี้ยประกันวินาศภัย ฯลฯ",
  },
  { row: 6, labelTh: "6. อื่น ๆ (ระบุ)" },
];

/**
 * เงื่อนไขของผู้จ่ายบนแบบ (WHT §7 · §13) — ช่อง 1–4 บน 50 ทวิ
 * ที่เก็บมีทางเดียว: `AccountDocument.whtCondition` / `AccountDocumentPayment.whtCondition` เป็นรหัส (TEXT)
 *   WITHHOLD | PAY_ALWAYS | PAY_ONCE (แผงรับ/จ่าย T3.6 — WHT_CONDITIONS ใน th-tax-2569.ts) | OTHER (ช่อง 4 · ใบแทนเลือกได้)
 * แปลงรหัส → เลขช่องที่ helper นี้ที่เดียว (merge T3 lane 1 × lane 2)
 */
export const WHT_CERT_CONDITION_CODES = ["WITHHOLD", "PAY_ALWAYS", "PAY_ONCE", "OTHER"] as const;
export type WhtCertConditionCode = (typeof WHT_CERT_CONDITION_CODES)[number];
export const WHT_CONDITIONS: readonly { value: 1 | 2 | 3 | 4; code: WhtCertConditionCode; labelTh: string }[] = [
  { value: 1, code: "WITHHOLD", labelTh: "หัก ณ ที่จ่าย" },
  { value: 2, code: "PAY_ALWAYS", labelTh: "ออกให้ตลอดไป" },
  { value: 3, code: "PAY_ONCE", labelTh: "ออกให้ครั้งเดียว" },
  { value: 4, code: "OTHER", labelTh: "อื่น ๆ (ระบุ)" },
];
/** รหัสเงื่อนไข → เลขช่องบน 50 ทวิ (null/ไม่รู้จัก = 1 หัก ณ ที่จ่าย) */
export const whtConditionOf = (v: string | null | undefined): 1 | 2 | 3 | 4 => WHT_CONDITIONS.find((c) => c.code === v)?.value ?? 1;
/** เลขช่อง 1–4 (ฟอร์ม/REST ของใบแทน) → รหัสที่เก็บ · อื่น = null */
export const whtConditionCodeOfBox = (n: number | null | undefined): WhtCertConditionCode | null => WHT_CONDITIONS.find((c) => c.value === n)?.code ?? null;
/** รับได้ทั้งเลขช่องและรหัส → รหัส */
export const whtConditionCodeOf = (v: unknown): WhtCertConditionCode | null =>
  typeof v === "number" ? whtConditionCodeOfBox(v) : typeof v === "string" && (WHT_CERT_CONDITION_CODES as readonly string[]).includes(v) ? (v as WhtCertConditionCode) : null;

/** ป้ายฉบับบนแบบ — ข้อความ 2 ฉบับแรกตรงหัวแบบทางการ [V] · สำเนาคู่ฉบับ = ถ้อยคำของระบบ [S] */
export const CERT_PARTS = ["1", "2", "file"] as const;
export type CertPart = (typeof CERT_PARTS)[number];
export const CERT_PART_LABEL_TH: Record<CertPart, string> = {
  "1": "ฉบับที่ 1 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้แนบพร้อมกับแบบแสดงรายการภาษี)",
  "2": "ฉบับที่ 2 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย เก็บไว้เป็นหลักฐาน)",
  file: "สำเนาคู่ฉบับ (สำหรับผู้มีหน้าที่หักภาษี ณ ที่จ่าย เก็บไว้เป็นหลักฐาน)",
};
export function certPartsOf(q: string | null | undefined): CertPart[] {
  if (q === "1" || q === "2" || q === "file") return [q];
  return ["1", "2", "file"];
}

/** เล่มที่ — ค่าเริ่มต้นของระบบ = ปี พ.ศ. ที่ออก (แบบ/skill ไม่บอกวิธีตั้ง) */
export function certBookNo(issueDate: Date): string {
  const y = new Date(issueDate.getTime() + 7 * 3_600_000).getUTCFullYear();
  return String(y + 543);
}

/** "บุคคล" / "นิติบุคคล" ตามที่แบบให้ระบุ */
export const partyKindTh = (legalType: string | null | undefined): string => (legalType === "PERSON" ? "บุคคล" : "นิติบุคคล");

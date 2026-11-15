// ─────────────────────────────────────────────────────────────
// defs/account.ts — ค่าตั้งของสมุดบัญชี (pure) · ACC T0.1 + T0.2
//   ชั้นเดียว ACCOUNT_BOOK (AppSystem ชนิด ACCOUNT) — สมุดเป็นของนิติบุคคล/บุคคลหนึ่งราย ไม่ผูกสาขา
//   ตารางค่ากฎหมาย: ค่าที่เก็บ = "แถวที่ร้านเพิ่ม/ทับ" เท่านั้น · แถวของระบบอยู่ที่ legal/th-tax-2569.ts
//   (เก็บทั้งตาราง ⇒ ร้านที่แก้แถวเดียวจะไม่ได้แถวกฎหมายใหม่ที่ระบบเพิ่มภายหลัง)
// ตัวอ่าน: src/lib/modules/account/legal-values.ts (legalValueAt) · design note ledger/wo-notes/T0.1-T0.2.md
// ─────────────────────────────────────────────────────────────
import { z } from "zod";
import { defineSettings } from "../registry";
import type { SettingDef, TableCellSpecTh } from "../types";
import {
  ENTITY_KINDS,
  ENTITY_KIND_LABEL_TH,
  FILING_CHANNELS,
  FILING_CHANNEL_LABEL_TH,
  FILING_FORMS,
  deadlineValueInRange,
  FILING_FORM_LABEL_TH,
  LEGAL_TAGS,
  WHT_CHANNELS,
  WHT_CHANNEL_LABEL_TH,
  WHT_METHODS,
  WHT_METHOD_LABEL_TH,
  WHT_PAYERS,
  WHT_PAYER_LABEL_TH,
  WHT_RECIPIENTS,
  WHT_RECIPIENT_LABEL_TH,
  WHT_GROSS_UP_FORMULAS,
  WHT_GROSS_UP_FORMULA_LABEL_TH,
  COMPLIANCE_KEYS,
  COMPLIANCE_KEY_LABEL_TH,
  BOOK_RULES,
  BOOK_RULE_META,
  ETAX_TS_ELIGIBILITY,
  ETAX_TS_ELIGIBILITY_LABEL_TH,
  ETAX_TS_SUBJECT_DATE_FORMATS,
  ETAX_TS_SUBJECT_DATE_LABEL_TH,
} from "../legal/th-tax-2569";

const EDIT = "account.settings.manage";

/** ACC T1.3 ▸ ภ.พ.30: ภาษีที่ชำระเกิน → ยกไปเดือนถัดไป / ขอคืน (ม.84 · skill common-vat-invoice §19) ◂ */
export const PP30_EXCESS_CHOICES = ["CARRY_FORWARD", "REFUND"] as const;
export type Pp30ExcessChoice = (typeof PP30_EXCESS_CHOICES)[number];
export const PP30_EXCESS_CHOICE_LABEL_TH: Record<Pp30ExcessChoice, string> = {
  CARRY_FORWARD: "ยกไปหักในเดือนถัดไป",
  REFUND: "ขอคืนเป็นเงินสด",
};

/** ACC T1.1 ▸ รายงานภาษีขาย: วิธีลงใบกำกับภาษีอย่างย่อ (skill §1.3 "1 แถว/วัน/สาขา (หรือ/เครื่อง)") ◂ */
export const SALES_TAX_ABB_MODES = ["DAILY_DEVICE", "DAILY_BRANCH", "PER_BILL"] as const;
export type SalesTaxAbbMode = (typeof SALES_TAX_ABB_MODES)[number];
export const SALES_TAX_ABB_MODE_LABEL_TH: Record<SalesTaxAbbMode, string> = {
  DAILY_DEVICE: "รวม 1 แถวต่อวันต่อเครื่องขาย",
  DAILY_BRANCH: "รวม 1 แถวต่อวันต่อสาขา",
  PER_BILL: "แสดงทุกใบ",
};
const CHAIN = ["ACCOUNT_BOOK"] as const;
/** จำนวนแถวที่ร้านเพิ่มได้ต่อตาราง (กันค่าก้อนใหญ่ผิดปกติ — ไม่ใช่เพดานกฎหมาย) */
const MAX_SHOP_ROWS = 200;

const YMD = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
const rowBase = {
  id: z.string().min(1).max(64),
  from: YMD.nullable(),
  to: YMD.nullable(),
  source: z.string().max(500),
  tag: z.enum(LEGAL_TAGS),
  checkedAt: YMD.nullable(),
  note: z.string().max(500).optional(),
};
const rangeOk = (r: { from: string | null; to: string | null }) => r.from === null || r.to === null || r.from <= r.to;
const RANGE_MSG = "วันที่เริ่มมีผลต้องไม่หลังวันสิ้นสุด";

/** อัตรา basis point: 0–10000 (0%–100%) — ช่วงรูปแบบข้อมูล ไม่ใช่ค่ากฎหมาย */
const RATE_BP = z.number().int().min(0).max(10000);

export const VAT_ROW_SCHEMA = z.object({ ...rowBase, value: RATE_BP }).strict().refine(rangeOk, RANGE_MSG);
export const WHT_ROW_SCHEMA = z
  .object({
    ...rowBase,
    value: RATE_BP.nullable(),
    incomeType: z.string().regex(/^[A-Z][A-Z0-9_:]{1,39}$/),
    payer: z.enum(WHT_PAYERS),
    recipient: z.enum(WHT_RECIPIENTS),
    channel: z.enum(WHT_CHANNELS),
    method: z.enum(WHT_METHODS),
  })
  .strict()
  .refine(rangeOk, RANGE_MSG)
  .refine((r) => (r.method === "RATE") === (r.value !== null), "อัตราคงที่ต้องมีตัวเลข · ไม่หัก/อัตราก้าวหน้าไม่มีตัวเลข");
/** ACC T4.5 · T4.8 ▸ ค่ากฎหมายอื่น (ระยะเก็บเอกสาร · เงินประกันหอ) — ตัวเลขจำนวนเต็มบวก (ช่วงรูปแบบข้อมูล ไม่ใช่ค่ากฎหมาย) ◂ */
export const COMPLIANCE_ROW_SCHEMA = z
  .object({ ...rowBase, value: z.number().int().min(1).max(100), key: z.enum(COMPLIANCE_KEYS) })
  .strict()
  .refine(rangeOk, RANGE_MSG);

/** ACC T5.9 ▸ ใช้ส่วนตัว/ขาด ถือเป็นขาย (WARN = แสดงยอด+เตือน · OFF = ไม่แสดงยอด) ◂ */
export const DEEMED_SALE_MODES = ["WARN", "OFF"] as const;
export type DeemedSaleMode = (typeof DEEMED_SALE_MODES)[number];
export const DEEMED_SALE_MODE_LABEL_TH: Record<DeemedSaleMode, string> = { WARN: "แสดงยอดภาษีขายโดยประมาณ + คำเตือน", OFF: "ไม่แสดงยอด (คำเตือนยังแสดง)" };
/** ACC T5.11 ▸ สาขา (สถานประกอบการ) + วิธียื่น ภ.พ.30 ◂ */
export const BRANCH_ROW_SCHEMA = z
  .object({ code: z.string().regex(/^\d{5}$/, "รหัสสาขาต้องเป็นตัวเลข 5 หลัก").refine((c) => c !== "00000", "00000 คือสำนักงานใหญ่ (มีอยู่แล้ว)"), name: z.string().trim().min(1).max(120), address: z.string().trim().max(300).nullable().optional() })
  .strict();
export type BranchRow = z.infer<typeof BRANCH_ROW_SCHEMA>;
export const VAT_FILING_MODES = ["SEPARATE", "COMBINED"] as const;
export type VatFilingMode = (typeof VAT_FILING_MODES)[number];
export const VAT_FILING_MODE_LABEL_TH: Record<VatFilingMode, string> = { SEPARATE: "แยกยื่นแต่ละสถานประกอบการ", COMBINED: "ยื่นรวม (ได้รับอนุมัติแล้ว)" };

/** ACC T4.7 ▸ ทิปที่รับผ่านจุดขาย 3 ทาง (skill domain-shark-accounting-cases §1.8) ◂ */
export const TIP_TREATMENTS = ["LIABILITY", "REVENUE_VAT", "STAFF_DIRECT"] as const;
export type TipTreatment = (typeof TIP_TREATMENTS)[number];
export const TIP_TREATMENT_LABEL_TH: Record<TipTreatment, string> = {
  LIABILITY: "เงินรับแทนพนักงาน (บัญชีพักทิป · ไม่คิด VAT)",
  REVENUE_VAT: "รายได้ของร้าน (คิด VAT)",
  STAFF_DIRECT: "พนักงานรับเงินสดตรง (ไม่ผ่านบัญชีร้าน)",
};

export const DEADLINE_ROW_SCHEMA = z
  .object({ ...rowBase, value: z.number().int().min(0).max(400), form: z.enum(FILING_FORMS), channel: z.enum(FILING_CHANNELS) })
  .strict()
  .refine(rangeOk, RANGE_MSG)
  // ACC T5.1 ▸ ช่วงค่าตามชนิดแบบ (รายเดือน = วันที่ 1–31 · รายปี = วัน/เดือนนับจากจุดตั้งต้น · ออนไลน์รายปี = วันขยาย) ◂
  .refine((r) => deadlineValueInRange(r.form, r.channel, r.value), "ค่าอยู่นอกช่วงของแบบนี้");

/** ACC T4 ▸ แถวตาราง "สมุดบัญชี/ค่าเสื่อม/รอบบัญชี" — ช่วงค่าตามหน่วยของกฎ (รูปแบบข้อมูล ไม่ใช่ค่ากฎหมาย) ◂ */
export const BOOK_ROW_SCHEMA = z
  .object({ ...rowBase, value: z.number().int().min(0), rule: z.enum(BOOK_RULES) })
  .strict()
  .refine(rangeOk, RANGE_MSG)
  .refine((r) => r.value >= BOOK_RULE_META[r.rule].min && r.value <= BOOK_RULE_META[r.rule].max, "ค่าอยู่นอกช่วงของกฎนี้");

const common: Record<string, TableCellSpecTh> = {
  from: { kind: "text", labelTh: "มีผลตั้งแต่", nullTh: "ไม่ระบุ" },
  to: { kind: "text", labelTh: "ถึง", nullTh: "ไม่ระบุ" },
  source: { kind: "text", labelTh: "ที่มา" },
  note: { kind: "text", labelTh: "หมายเหตุ", optional: true },
};

const DEFS: SettingDef[] = [
  {
    key: "account.entity.kind", domain: "account", group: "entity", type: "enum", labelTh: "ประเภทผู้ประกอบการ",
    helpTh: "ใช้ขับคำเตือน รายงาน ปฏิทินภาษี และสถานะผู้จ่ายของหัก ณ ที่จ่าย — แยกจากสถานะจด VAT",
    schema: z.enum(ENTITY_KINDS),
    enumLabelsTh: ENTITY_KIND_LABEL_TH,
    defaults: { _fallback: "UNSET" },
    chain: CHAIN, editPermission: EDIT,
  },
  {
    key: "account.legal.vatRates", domain: "account", group: "legal", type: "table", labelTh: "อัตราภาษีมูลค่าเพิ่ม (แถวที่ร้านตั้ง)",
    helpTh: "แถวที่ร้านเพิ่มหรือทับค่าเริ่มต้นของระบบ — อัตราตามวันที่จุดรับผิด",
    schema: z.array(VAT_ROW_SCHEMA).max(MAX_SHOP_ROWS),
    defaults: { _fallback: [] },
    chain: CHAIN, editPermission: EDIT, sensitivity: "MONEY",
    tableTh: { item: { kind: "object", labelTh: "แถว", fields: { value: { kind: "bp", labelTh: "อัตรา" }, ...common } }, emptyTh: "ใช้ค่าเริ่มต้นของระบบทั้งหมด" },
  },
  {
    key: "account.legal.whtRates", domain: "account", group: "legal", type: "table", labelTh: "อัตราหัก ณ ที่จ่าย (แถวที่ร้านตั้ง)",
    helpTh: "ประเภทเงินได้ × ผู้จ่าย × ผู้รับ × ช่องทาง — แถวที่ร้านเพิ่มหรือทับค่าเริ่มต้นของระบบ",
    schema: z.array(WHT_ROW_SCHEMA).max(MAX_SHOP_ROWS),
    defaults: { _fallback: [] },
    chain: CHAIN, editPermission: EDIT, sensitivity: "MONEY",
    tableTh: {
      item: {
        kind: "object",
        labelTh: "แถว",
        fields: {
          incomeType: { kind: "text", labelTh: "ประเภทเงินได้" },
          payer: { kind: "enum", labelTh: "ผู้จ่าย", options: WHT_PAYER_LABEL_TH },
          recipient: { kind: "enum", labelTh: "ผู้รับ", options: WHT_RECIPIENT_LABEL_TH },
          channel: { kind: "enum", labelTh: "ช่องทาง", options: WHT_CHANNEL_LABEL_TH },
          method: { kind: "enum", labelTh: "วิธีหัก", options: WHT_METHOD_LABEL_TH },
          value: { kind: "bp", labelTh: "อัตรา", nullTh: "ไม่มีอัตราคงที่" },
          ...common,
        },
      },
      emptyTh: "ใช้ค่าเริ่มต้นของระบบทั้งหมด",
    },
  },
  {
    key: "account.legal.filingDeadlines", domain: "account", group: "legal", type: "table", labelTh: "กำหนดยื่นแบบ (แถวที่ร้านตั้ง)",
    helpTh: "ยื่นภายในวันที่เท่าไรของเดือนถัดจากเดือนภาษี — แยกยื่นกระดาษ/ออนไลน์",
    schema: z.array(DEADLINE_ROW_SCHEMA).max(MAX_SHOP_ROWS),
    defaults: { _fallback: [] },
    chain: CHAIN, editPermission: EDIT,
    tableTh: {
      item: {
        kind: "object",
        labelTh: "แถว",
        fields: {
          form: { kind: "enum", labelTh: "แบบ", options: FILING_FORM_LABEL_TH },
          channel: { kind: "enum", labelTh: "ช่องทาง", options: FILING_CHANNEL_LABEL_TH },
          value: { kind: "int", labelTh: "ภายในวันที่", unitTh: "ของเดือนถัดไป" },
          ...common,
        },
      },
      emptyTh: "ใช้ค่าเริ่มต้นของระบบทั้งหมด",
    },
  },
  {
    // ACC T4 (เลน 2) ▸ ค่าตัวเลขของสมุดบัญชี (กำหนดลงรายการ · รอบแรก) และเพดานค่าเสื่อมทางภาษี — แถวระบบ SYSTEM_BOOK_ROWS ◂
    key: "account.legal.bookRules", domain: "account", group: "legal", type: "table", labelTh: "สมุดบัญชี · ค่าเสื่อม · รอบบัญชี (แถวที่ร้านตั้ง)",
    helpTh: "กำหนดลงรายการ · เพดานค่าเสื่อมทางภาษี · รอบบัญชีแรก — แถวที่ร้านเพิ่มหรือทับค่าเริ่มต้นของระบบ (ใช้กับคำเตือน ไม่บล็อก)",
    schema: z.array(BOOK_ROW_SCHEMA).max(MAX_SHOP_ROWS),
    defaults: { _fallback: [] },
    chain: CHAIN, editPermission: EDIT,
    tableTh: { item: { kind: "object", labelTh: "แถว", fields: { rule: { kind: "enum", labelTh: "กฎ", options: Object.fromEntries(BOOK_RULES.map((r) => [r, BOOK_RULE_META[r].labelTh])) }, value: { kind: "int", labelTh: "ค่า (ตามหน่วยของกฎ)" }, ...common } }, emptyTh: "ใช้ค่าเริ่มต้นของระบบทั้งหมด" },
  },
  {
    key: "account.report.salesTaxAbbMode", domain: "account", group: "report", type: "enum", labelTh: "รายงานภาษีขาย: ใบกำกับภาษีอย่างย่อ",
    helpTh: "ลงยอดรวมรายวัน (ระบุเลขที่ตั้งแต่…ถึง…) ต่อเครื่องขายหรือต่อสาขา หรือแสดงทุกใบ — โปรดตรวจกับนักบัญชีของร้านว่าเครื่องขายได้รับอนุมัติแยกรายเครื่องหรือไม่",
    schema: z.enum(SALES_TAX_ABB_MODES),
    enumLabelsTh: SALES_TAX_ABB_MODE_LABEL_TH,
    defaults: { _fallback: "DAILY_DEVICE" },
    chain: CHAIN, editPermission: EDIT,
  },
  {
    // ACC T1.3 ▸ ม.84: ภาษีซื้อเกินภาษีขาย = ยกไปเป็นเครดิตเดือนถัดไป หรือขอคืน — ค่าเริ่มของสมุด · เลือกต่อเดือนได้ตอนทำเครื่องหมายยื่น ◂
    key: "account.report.pp30ExcessChoice", domain: "account", group: "report", type: "enum", labelTh: "ภ.พ.30: ภาษีที่ชำระเกิน",
    helpTh: "เมื่อภาษีซื้อมากกว่าภาษีขาย จะยกไปหักในเดือนถัดไปหรือขอคืนเป็นเงินสด (ม.84) — เลือกใหม่ได้ทุกเดือนตอนทำเครื่องหมายยื่น",
    schema: z.enum(PP30_EXCESS_CHOICES),
    enumLabelsTh: PP30_EXCESS_CHOICE_LABEL_TH,
    defaults: { _fallback: "CARRY_FORWARD" },
    chain: CHAIN, editPermission: EDIT,
  },
  // ── ACC T3.6 · T3.7 ▸ หัก ณ ที่จ่าย ──
  {
    // skill common-withholding-tax §6/§14 [V]: อัตราลด e-WHT ใช้เฉพาะรายการที่นำส่งผ่านระบบ e-WHT ของธนาคาร · ค่าเริ่ม "ปิด · ร้านเปิดเอง" (SKILL.md สรุป) ◂
    key: "account.wht.ewhtEnabled", domain: "account", group: "wht", type: "bool", labelTh: "ใช้ e-Withholding Tax",
    helpTh: "เปิดเมื่อร้านนำส่งภาษีหัก ณ ที่จ่ายผ่านระบบ e-WHT ของธนาคาร — แผงจ่ายจะมีตัวเลือก \"นำส่งผ่าน e-WHT\" ใช้อัตราลดตามตาราง (มีวันหมดอายุ) และไม่ออก 50 ทวิ",
    schema: z.boolean(),
    defaults: { _fallback: false },
    chain: CHAIN, editPermission: EDIT,
  },
  {
    // skill §13: สูตรทางการไม่พบ [U] · สูตรในวงการ [V2] เป็นค่าเริ่ม — ร้านเลือกได้ (ค่าตั้ง + คำเตือน WHT_GROSS_UP) ◂
    key: "account.wht.grossUpAlways", domain: "account", group: "wht", type: "enum", labelTh: "สูตรออกภาษีให้ตลอดไป",
    helpTh: "ใช้เมื่อเลือกเงื่อนไข \"ออกให้ตลอดไป\" ในแผงจ่าย — กรมสรรพากรไม่มีสูตรทางการ โปรดตรวจกับนักบัญชีของร้าน",
    schema: z.enum(WHT_GROSS_UP_FORMULAS),
    enumLabelsTh: WHT_GROSS_UP_FORMULA_LABEL_TH,
    defaults: { _fallback: "GROSS_UP_CONVERGED" },
    chain: CHAIN, editPermission: EDIT,
  },
  {
    key: "account.wht.grossUpOnce", domain: "account", group: "wht", type: "enum", labelTh: "สูตรออกภาษีให้ครั้งเดียว",
    helpTh: "ใช้เมื่อเลือกเงื่อนไข \"ออกให้ครั้งเดียว\" ในแผงจ่าย — กรมสรรพากรไม่มีสูตรทางการ โปรดตรวจกับนักบัญชีของร้าน",
    schema: z.enum(WHT_GROSS_UP_FORMULAS),
    enumLabelsTh: WHT_GROSS_UP_FORMULA_LABEL_TH,
    defaults: { _fallback: "GROSS_UP_ONE_STEP" },
    chain: CHAIN, editPermission: EDIT,
  },
  // ── ACC T4.5 · T4.7 · T4.8 (เลน 1) ──
  {
    key: "account.legal.complianceValues", domain: "account", group: "legal", type: "table", labelTh: "ค่ากฎหมายอื่น (แถวที่ร้านตั้ง)",
    helpTh: "ระยะเก็บบัญชีและเอกสาร · เงินประกันหอพัก — แถวที่ร้านทับค่าเริ่มต้นของระบบ",
    schema: z.array(COMPLIANCE_ROW_SCHEMA).max(MAX_SHOP_ROWS),
    defaults: { _fallback: [] },
    chain: CHAIN, editPermission: EDIT,
    tableTh: { item: { kind: "object", labelTh: "แถว", fields: { key: { kind: "enum", labelTh: "ค่า", options: COMPLIANCE_KEY_LABEL_TH }, value: { kind: "int", labelTh: "ตัวเลข" }, ...common } }, emptyTh: "ใช้ค่าเริ่มต้นของระบบทั้งหมด" },
  },
  {
    // skill domain-shark-accounting-cases §1.8: ทิปผ่านระบบ เสนอ "รายได้มี VAT" [V ข้อหารือไม่ชี้ตรงว่าต้อง] · ส่งตรงถึงพนักงาน [U] · บัญชีพักทิปแบบหนี้สิน "ต้องทบทวน" [U]
    //   ค่าเริ่ม = LIABILITY (ทางเดิมของ POS P2.9 — เปลี่ยนค่าเริ่มเป็นรายได้ = เปลี่ยน GL ของบิล POS ทุกร้าน · ให้เจ้าของตัดสิน) + คำเตือน ◂
    key: "account.pos.tipTreatment", domain: "account", group: "pos", type: "enum", labelTh: "ทิปที่รับผ่านจุดขาย",
    helpTh: "รายได้ของร้าน (คิด VAT) · เงินรับแทนพนักงาน (บัญชีพักทิป) · พนักงานรับเงินสดตรง (ไม่ผ่านบัญชีร้าน) — โปรดตรวจกับนักบัญชีของร้าน",
    schema: z.enum(TIP_TREATMENTS),
    enumLabelsTh: TIP_TREATMENT_LABEL_TH,
    defaults: { _fallback: "LIABILITY" },
    chain: CHAIN, editPermission: EDIT,
  },
  // ── ACC T5.9 · T5.11 (เลน 1) ──
  {
    // skill domain-shark-accounting-cases §5.3–5.4: ใช้ส่วนตัว/ขาด = ถือเป็นขาย ราคาตลาด [V] · ร้านนับเองถือ "ตรวจพบ" [U] — ค่าเริ่ม WARN (แสดงยอด + เตือน · ไม่ตั้งภาษีขายเอง)
    key: "account.stock.deemedSale", domain: "account", group: "stock", type: "enum", labelTh: "สินค้าใช้ส่วนตัว/ขาด ถือเป็นการขาย",
    helpTh: "แสดงยอดภาษีขายโดยประมาณ (ราคาตลาด) ของสินค้าที่ใช้ส่วนตัวหรือขาด พร้อมคำเตือน · ปิด = ไม่แสดงยอด (ยังมีคำเตือน) — โปรดตรวจกับนักบัญชีของร้าน",
    schema: z.enum(DEEMED_SALE_MODES),
    enumLabelsTh: DEEMED_SALE_MODE_LABEL_TH,
    defaults: { _fallback: "WARN" },
    chain: CHAIN, editPermission: EDIT,
  },
  {
    // skill common-vat-invoice §14 §18 §19: สถานประกอบการ (สำนักงานใหญ่ 00000 / สาขา 5 หลัก) · รายงานแยกสถานประกอบการ [V] · ยื่นรวมต้องได้รับอนุมัติ ม.83 ว.สี่ [V]
    key: "account.entity.branches", domain: "account", group: "entity", type: "table", labelTh: "สถานประกอบการ (สาขา)",
    helpTh: "รายชื่อสาขาที่จดทะเบียนภาษีมูลค่าเพิ่ม (รหัส 5 หลัก) — เอกสารเลือกสาขาที่ออก · เลขที่และรายงานภาษีแยกตามสาขา",
    schema: z.array(BRANCH_ROW_SCHEMA).max(50),
    defaults: { _fallback: [] },
    chain: CHAIN, editPermission: EDIT,
    tableTh: { item: { kind: "object", labelTh: "สาขา", fields: { code: { kind: "text", labelTh: "รหัสสาขา" }, name: { kind: "text", labelTh: "ชื่อสาขา" }, address: { kind: "text", labelTh: "ที่อยู่", optional: true } } }, emptyTh: "มีเฉพาะสำนักงานใหญ่" },
  },
  {
    key: "account.entity.vatFilingMode", domain: "account", group: "entity", type: "enum", labelTh: "การยื่น ภ.พ.30 ของหลายสาขา",
    helpTh: "แยกยื่นแต่ละสถานประกอบการ (ค่าเริ่ม) · ยื่นรวม (ต้องได้รับอนุมัติจากอธิบดี)",
    schema: z.enum(VAT_FILING_MODES),
    enumLabelsTh: VAT_FILING_MODE_LABEL_TH,
    defaults: { _fallback: "SEPARATE" },
    chain: CHAIN, editPermission: EDIT,
  },
  // ── ACC T5c (เลน 2) ▸ วันประชุมใหญ่อนุมัติงบ (บริษัท) — ปฏิทินคำนวณวันยื่นงบจากแถวตาราง FS_COMPANY ◂
  {
    key: "account.entity.statementMeetings", domain: "account", group: "entity", type: "table", labelTh: "วันประชุมใหญ่ผู้ถือหุ้นที่อนุมัติงบ",
    helpTh: "บริษัทยื่นงบการเงินภายใน 1 เดือนนับแต่วันที่ที่ประชุมใหญ่อนุมัติงบ — ใส่วันประชุมของแต่ละรอบบัญชีให้ปฏิทินภาษีคำนวณวันยื่นงบ (ไม่ใส่ = แสดงเป็นข้อความกำหนด)",
    schema: z.array(z.object({ fyEnd: YMD, meetingDate: YMD }).strict()).max(40),
    defaults: { _fallback: [] },
    chain: CHAIN, editPermission: EDIT,
    tableTh: { item: { kind: "object", labelTh: "รอบบัญชี", fields: { fyEnd: { kind: "text", labelTh: "วันสิ้นรอบบัญชี" }, meetingDate: { kind: "text", labelTh: "วันประชุมใหญ่" } } }, emptyTh: "ยังไม่ได้ใส่วันประชุม" },
  },
  // ── ACC T5.4 (เลน 2) ▸ e-Tax Invoice by Time Stamp (ค่าคงที่ของระบบประทับเวลาอยู่ใน SYSTEM_ETAX_TS_ROWS) ◂
  {
    key: "account.etax.tsEnabled", domain: "account", group: "etax", type: "bool", labelTh: "ส่ง e-Tax แบบประทับเวลา (Time Stamp)",
    helpTh: "เปิดเมื่อร้านได้รับประกาศรายชื่อเป็นผู้มีสิทธิจัดทำใบกำกับภาษีโดยการประทับรับรองเวลาแล้ว — ปุ่มส่งจะขึ้นบนใบกำกับภาษี ใบเพิ่มหนี้ ใบลดหนี้",
    schema: z.boolean(),
    defaults: { _fallback: false },
    chain: CHAIN, editPermission: EDIT,
  },
  {
    key: "account.etax.tsAutoOnIssue", domain: "account", group: "etax", type: "bool", labelTh: "ส่งอัตโนมัติเมื่อออกเอกสาร",
    helpTh: "ส่งทันทีหลังออกใบที่มีอีเมลผู้ซื้อ (เฉพาะเมื่อร้านยืนยันสิทธิแล้ว)",
    schema: z.boolean(),
    defaults: { _fallback: false },
    chain: CHAIN, editPermission: EDIT,
  },
  {
    key: "account.etax.tsSenderEmail", domain: "account", group: "etax", type: "text", labelTh: "อีเมลที่ร้านแจ้งกรมสรรพากรไว้สำหรับส่ง",
    helpTh: "ต้องเป็นอีเมลเดียวกับที่แจ้งในระบบของกรมสรรพากร — อีเมลอื่นจะไม่ได้รับการประทับเวลา",
    schema: z.string().trim().max(200).refine((v) => v === "" || /^[^\s<>@,;"]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(v), "รูปแบบอีเมลไม่ถูกต้อง"),
    defaults: { _fallback: "" },
    chain: CHAIN, editPermission: EDIT,
  },
  {
    key: "account.etax.tsCcAddress", domain: "account", group: "etax", type: "text", labelTh: "อีเมลระบบประทับเวลา (สำเนาถึง)",
    helpTh: "ว่าง = ใช้ค่าในตารางค่ากฎหมาย (csemail@etax.teda.th ตามคู่มือกรมสรรพากร) — เปลี่ยนเมื่อกรมสรรพากรประกาศที่อยู่ใหม่",
    schema: z.string().trim().max(200).refine((v) => v === "" || /^[^\s<>@,;"]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(v), "รูปแบบอีเมลไม่ถูกต้อง"),
    defaults: { _fallback: "" },
    chain: CHAIN, editPermission: EDIT,
  },
  {
    key: "account.etax.tsSubjectDateFormat", domain: "account", group: "etax", type: "enum", labelTh: "รูปวันที่ในหัวเรื่องอีเมล",
    helpTh: "ตัวประกาศเขียนว่า [วันเดือนปี] — ตัวอย่างในคู่มือใช้ปี พ.ศ.",
    schema: z.enum(ETAX_TS_SUBJECT_DATE_FORMATS),
    enumLabelsTh: ETAX_TS_SUBJECT_DATE_LABEL_TH,
    defaults: { _fallback: "DDMMYYYY_BE" },
    chain: CHAIN, editPermission: EDIT,
  },
  {
    key: "account.etax.tsEligibility", domain: "account", group: "etax", type: "enum", labelTh: "สิทธิจัดทำใบกำกับภาษีโดยการประทับเวลา",
    helpTh: "ร้านยืนยันเอง — ระบบตรวจรายชื่อกับกรมสรรพากรไม่ได้ · ยังไม่ยืนยัน = ส่งได้หลังกดยืนยันคำเตือนทุกครั้ง และไม่ส่งอัตโนมัติ",
    schema: z.enum(ETAX_TS_ELIGIBILITY),
    enumLabelsTh: ETAX_TS_ELIGIBILITY_LABEL_TH,
    defaults: { _fallback: "UNDECLARED" },
    chain: CHAIN, editPermission: EDIT,
  },
];

defineSettings("account", DEFS, { groupLabelsTh: { entity: "ข้อมูลกิจการ", legal: "ตารางค่ากฎหมาย", report: "รายงาน", wht: "หัก ณ ที่จ่าย", pos: "เชื่อมจุดขาย", stock: "สินค้าคงเหลือ", etax: "e-Tax (ประทับเวลา)" } });

export const ACCOUNT_SETTING_KEYS = {
  entityKind: "account.entity.kind",
  vat: "account.legal.vatRates",
  wht: "account.legal.whtRates",
  deadline: "account.legal.filingDeadlines",
  bookRules: "account.legal.bookRules",
  salesTaxAbbMode: "account.report.salesTaxAbbMode",
  pp30ExcessChoice: "account.report.pp30ExcessChoice",
  ewhtEnabled: "account.wht.ewhtEnabled",
  grossUpAlways: "account.wht.grossUpAlways",
  grossUpOnce: "account.wht.grossUpOnce",
  compliance: "account.legal.complianceValues", // ACC T4.5 · T4.8 ◂
  tipTreatment: "account.pos.tipTreatment", // ACC T4.7 ◂
  deemedSale: "account.stock.deemedSale", // ACC T5.9 ◂
  branches: "account.entity.branches", // ACC T5.11 ◂
  vatFilingMode: "account.entity.vatFilingMode", // ACC T5.11 ◂
  statementMeetings: "account.entity.statementMeetings",
  etaxTsEnabled: "account.etax.tsEnabled",
  etaxTsAutoOnIssue: "account.etax.tsAutoOnIssue",
  etaxTsSenderEmail: "account.etax.tsSenderEmail",
  etaxTsCcAddress: "account.etax.tsCcAddress",
  etaxTsSubjectDateFormat: "account.etax.tsSubjectDateFormat",
  etaxTsEligibility: "account.etax.tsEligibility",
} as const;

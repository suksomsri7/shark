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
} from "../legal/th-tax-2569";

const EDIT = "account.settings.manage";
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
export const DEADLINE_ROW_SCHEMA = z
  .object({ ...rowBase, value: z.number().int().min(1).max(31), form: z.enum(FILING_FORMS), channel: z.enum(FILING_CHANNELS) })
  .strict()
  .refine(rangeOk, RANGE_MSG);

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
];

defineSettings("account", DEFS, { groupLabelsTh: { entity: "ข้อมูลกิจการ", legal: "ตารางค่ากฎหมาย" } });

export const ACCOUNT_SETTING_KEYS = {
  entityKind: "account.entity.kind",
  vat: "account.legal.vatRates",
  wht: "account.legal.whtRates",
  deadline: "account.legal.filingDeadlines",
} as const;

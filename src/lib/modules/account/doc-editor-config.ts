import type { AccountDocType } from "@prisma/client";
import { DOC_LABEL, VISIBLE_DOC_TYPES } from "./service";
import { EXP_DOC_LABEL, EXP_ROUTE, EXPENSE_LIST_TYPES } from "./expense";

// ─────────────────────────────────────────────────────────────
// doc-editor-config.ts — ทะเบียน "ฟอร์มเอกสาร V2" (WO 1.3) · แหล่งเดียวของ route/ขั้นตอน
//
// ใช้โดย: route pages (new/edit) · DocEditorPage.tsx · editor-actions.ts · qc-acc-v2-editor.mts
// ⚠️ ไฟล์นี้อยู่ฝั่ง server (import service/expense ซึ่งแตะ prisma) — ฟอร์ม client รับเป็น props
// ─────────────────────────────────────────────────────────────

export type EditorSide = "revenue" | "expense";

export type EditorDocDef = {
  docType: AccountDocType;
  /** path ใต้ `/app/sys/<id>/account/` — รายรับ = `docs/<DOCTYPE>` · รายจ่าย = slug ของตัวเอง */
  route: string;
  label: string;
  side: EditorSide;
};

/** รายรับ 8 ชนิด (VISIBLE_DOC_TYPES) + รายจ่าย 9 ชนิดที่มี route จริง (EXPENSE_LIST_TYPES) */
export const EDITOR_DOC_TYPES: readonly EditorDocDef[] = [
  ...VISIBLE_DOC_TYPES.map((dt) => ({
    docType: dt,
    route: `docs/${dt}`,
    label: DOC_LABEL[dt] ?? dt,
    side: "revenue" as const,
  })),
  ...EXPENSE_LIST_TYPES.map((t) => ({
    docType: t.docType,
    route: t.route,
    label: EXP_DOC_LABEL[t.docType] ?? t.label,
    side: "expense" as const,
  })),
];

const BY_TYPE = new Map<string, EditorDocDef>(EDITOR_DOC_TYPES.map((d) => [d.docType, d]));

export function editorDefOf(docType: string): EditorDocDef | undefined {
  return BY_TYPE.get(docType);
}

export function sideOf(docType: AccountDocType): EditorSide {
  return EXP_ROUTE[docType] ? "expense" : "revenue";
}

/** `/app/sys/<id>/account/<route>` */
export function editorListPath(base: string, docType: AccountDocType): string {
  return `${base}/${editorDefOf(docType)?.route ?? `docs/${docType}`}`;
}
export function editorNewPath(base: string, docType: AccountDocType): string {
  return `${editorListPath(base, docType)}/new`;
}
export function editorDetailPath(base: string, docType: AccountDocType, docId: string): string {
  return `${editorListPath(base, docType)}/${docId}`;
}
export function editorEditPath(base: string, docType: AccountDocType, docId: string): string {
  return `${editorDetailPath(base, docType, docId)}/edit`;
}

// ─────────────────── §5.2 A — สายการแปลงเอกสาร (stepper) ───────────────────
// รายรับ: QT ··· IV ··· RE ··· TX · รายจ่าย: PO ··· PUR/EXP ··· PTX
// ชนิดที่ไม่อยู่ในสาย (มัดจำ/CN/DN/วางบิล/สินทรัพย์) = ไม่มี stepper (สเปคไม่ได้กำหนดสายให้)

const REVENUE_CHAIN: AccountDocType[] = ["QUOTATION", "INVOICE", "RECEIPT", "TAX_INVOICE"];
const PURCHASE_CHAIN: AccountDocType[] = ["PURCHASE_ORDER", "PURCHASE", "PURCHASE_TAX_INVOICE"];
const EXPENSE_CHAIN: AccountDocType[] = ["PURCHASE_ORDER", "EXPENSE", "PURCHASE_TAX_INVOICE"];

/** ป้ายสั้นบนวงกลม stepper (g17 มือถือใช้ตัวย่อ · g1 เดสก์ท็อปใช้ชื่อเต็ม + ตัวย่อ) */
export const STEP_CODE: Partial<Record<AccountDocType, string>> = {
  QUOTATION: "QT",
  INVOICE: "IV",
  RECEIPT: "RE",
  TAX_INVOICE: "TX",
  PURCHASE_ORDER: "PO",
  PURCHASE: "PUR",
  EXPENSE: "EXP",
  PURCHASE_TAX_INVOICE: "PTX",
};

export function stepChainFor(docType: AccountDocType): AccountDocType[] {
  if (REVENUE_CHAIN.includes(docType)) return REVENUE_CHAIN;
  if (docType === "EXPENSE") return EXPENSE_CHAIN;
  if (PURCHASE_CHAIN.includes(docType)) return PURCHASE_CHAIN;
  return [];
}

export function stepLabelOf(docType: AccountDocType): string {
  return DOC_LABEL[docType] ?? EXP_DOC_LABEL[docType] ?? docType;
}

// ─────────────────── ป้ายวันที่ครบกำหนด (§5.2 B) ───────────────────
export function dueLabelOf(docType: AccountDocType): string {
  if (docType === "QUOTATION") return "ใช้ได้ถึง";
  if (docType === "PURCHASE_ORDER" || docType === "ASSET_PURCHASE_ORDER") return "ต้องการรับของวันที่";
  return "ครบกำหนด";
}

/** ชนิดที่ต้องเลือก "บัญชี" ต่อบรรทัดจริง ๆ (ฝั่งจ่ายบางชนิดบังคับ — ดู expense.variantFor) */
export function requiresLineAccount(docType: AccountDocType): boolean {
  return docType === "EXPENSE" || docType === "ASSET_PURCHASE" || docType === "PURCHASE_TAX_INVOICE";
}

/** ชนิดที่ห้ามสร้างตรง ๆ (เกิดจากการแปลงเท่านั้น — §5.1)
 * WO 1.6: CN/DN/CNR/DNR ย้ายออกจากลิสต์นี้ — เข้า `/new` ได้ตรง ๆ แล้วผ่าน wizard 2 ขั้น (§5.2 J) แทนที่จะบล็อกทิ้ง */
export const CONVERT_ONLY_TYPES: readonly AccountDocType[] = [
  "RECEIPT",
  "TAX_INVOICE",
  "PURCHASE_TAX_INVOICE",
];

export function canCreateDirect(docType: AccountDocType): boolean {
  return !CONVERT_ONLY_TYPES.includes(docType);
}

// ─────────────────── WO 1.6 — wizard เอกสารปรับปรุงหนี้ (§5.2 J) ───────────────────
// CN/DN/CNR/DNR/RPR ("ใบส่งคืนเบิก" GOODS_ISSUE_RETURN) เข้าฟอร์มผ่าน `/new` → ขั้น ① เลือกเอกสารอ้างอิง
// (หรือ "ไม่อ้างอิง") → ขั้น ② ฟอร์มเดิม (B–I) + ช่องเหตุผล + เพดานยอดคงเหลือ

/** 4 ชนิดที่ใช้ DocEditorV2 ในโหมดปรับปรุงหนี้ (ไม่รวม GOODS_ISSUE_RETURN — เส้นทางแยก ไม่ผ่าน DocEditorV2) */
export const ADJUST_DOC_TYPES: readonly AccountDocType[] = [
  "CREDIT_NOTE",
  "DEBIT_NOTE",
  "CREDIT_NOTE_RECEIVED",
  "DEBIT_NOTE_RECEIVED",
];

export function isAdjustType(docType: AccountDocType): boolean {
  return ADJUST_DOC_TYPES.includes(docType);
}

/** ชนิดเอกสารอ้างอิงที่เลือกได้ในขั้น ① ต่อชนิด adjust (§5.2 J ตัวกรอง "ประเภทเอกสาร") */
export function adjustRefDocTypesFor(docType: AccountDocType): AccountDocType[] {
  if (docType === "CREDIT_NOTE" || docType === "DEBIT_NOTE") return ["INVOICE", "RECEIPT", "TAX_INVOICE"];
  if (docType === "CREDIT_NOTE_RECEIVED" || docType === "DEBIT_NOTE_RECEIVED") return ["PURCHASE", "EXPENSE"];
  return [];
}

/** ป้ายเมื่ออ้างอิง (ใช้ทำ chip "อ้างอิง<label> <docNo>" ในหัวฟอร์มขั้น ②) */
export function adjustRefLabelFor(docType: AccountDocType): string {
  if (docType === "CREDIT_NOTE" || docType === "DEBIT_NOTE") return "เอกสารต้นทาง";
  if (docType === "CREDIT_NOTE_RECEIVED" || docType === "DEBIT_NOTE_RECEIVED") return "เอกสารต้นทาง";
  return "PRR";
}

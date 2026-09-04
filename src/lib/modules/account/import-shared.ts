// import-shared.ts — WO 1.8 "นำเข้า CSV": นิยามฟิลด์/เทมเพลต/กติกาตรวจแถว "บริสุทธิ์"
// 🔴 ห้าม import prisma/next-headers ที่นี่ — ไฟล์นี้ถูกดึงเข้า bundle ฝั่ง client (ImportWizard ใช้พรีวิวสด)
//    เหมือน totals.ts/doc-editor-types.ts — server action (import-actions.ts) เรียกตัวเดียวกันตรวจซ้ำก่อนบันทึกจริง
// ใช้ตัวแยก CSV กลางเดิม (src/lib/core/csv.ts — WO Wave6-A) ไม่สร้างตัวแยกใหม่
import { parseCsv, columnIndex, cell, csvCell, neutralizeFormula, type CsvTable } from "@/lib/core/csv";

// ─────────────────── ชนิดของการนำเข้า ───────────────────
export type ImportKind = "documents_revenue" | "documents_expense" | "contacts" | "products" | "chart_of_accounts";

export function importKindOf(base: "documents" | "contacts" | "products", side?: string): ImportKind {
  if (base === "documents") return side === "expense" ? "documents_expense" : "documents_revenue";
  return base;
}

export type ImportFieldDef = {
  key: string;
  label: string;
  required: boolean;
  /** ชื่อหัวคอลัมน์/คำพ้องที่ auto-match ยอมรับ (ตัวแรก = หัวคอลัมน์ในเทมเพลต) */
  aliases: string[];
};

// ─────────────────── นิยามฟิลด์ต่อชนิด ───────────────────
const DOC_FIELDS_REVENUE: ImportFieldDef[] = [
  { key: "ref", label: "เลขอ้างอิง", required: false, aliases: ["เลขอ้างอิง", "ref", "reference"] },
  { key: "docType", label: "ประเภทเอกสาร (QT/IV/RE/DR)", required: false, aliases: ["ประเภทเอกสาร", "doctype", "type"] },
  { key: "date", label: "วันที่ (ค.ศ. YYYY-MM-DD)", required: true, aliases: ["วันที่", "date", "issuedate"] },
  { key: "contactName", label: "ผู้ติดต่อ", required: true, aliases: ["ผู้ติดต่อ", "ลูกค้า", "contact", "customer"] },
  { key: "contactTaxId", label: "เลขผู้เสียภาษีผู้ติดต่อ", required: false, aliases: ["เลขผู้เสียภาษี", "เลขภาษี", "taxid"] },
  { key: "itemName", label: "รายการ/ชื่อสินค้า", required: true, aliases: ["รายการ", "ชื่อสินค้า", "item", "description"] },
  { key: "qty", label: "จำนวน", required: true, aliases: ["จำนวน", "qty", "quantity"] },
  { key: "unit", label: "หน่วย", required: false, aliases: ["หน่วย", "unit"] },
  { key: "unitPrice", label: "ราคาต่อหน่วย (บาท)", required: true, aliases: ["ราคาต่อหน่วย", "unitprice", "price"] },
  { key: "discount", label: "ส่วนลด (บาท)", required: false, aliases: ["ส่วนลด", "discount"] },
  { key: "vatRate", label: "อัตราภาษีมูลค่าเพิ่ม (%)", required: false, aliases: ["อัตราภาษี", "vat", "vatrate"] },
  { key: "note", label: "หมายเหตุ", required: false, aliases: ["หมายเหตุ", "note"] },
];

const DOC_FIELDS_EXPENSE: ImportFieldDef[] = DOC_FIELDS_REVENUE.map((f) =>
  f.key === "docType"
    ? { ...f, label: "ประเภทเอกสาร (PUR/EXP)" }
    : f.key === "contactName"
      ? { ...f, label: "ผู้ขาย", aliases: ["ผู้ขาย", "ผู้ติดต่อ", "vendor", "supplier", "contact"] }
      : f,
);

const CONTACT_FIELDS: ImportFieldDef[] = [
  { key: "name", label: "ชื่อ", required: true, aliases: ["ชื่อ", "name"] },
  { key: "kind", label: "ประเภท (ลูกค้า/ผู้ขาย)", required: false, aliases: ["ประเภท", "kind", "type"] },
  { key: "taxId", label: "เลขผู้เสียภาษี", required: false, aliases: ["เลขผู้เสียภาษี", "เลขภาษี", "taxid"] },
  { key: "branchCode", label: "รหัสสาขา", required: false, aliases: ["รหัสสาขา", "สาขา", "branch", "branchcode"] },
  { key: "phone", label: "เบอร์โทร", required: false, aliases: ["เบอร์โทร", "โทรศัพท์", "phone", "tel"] },
  { key: "email", label: "อีเมล", required: false, aliases: ["อีเมล", "email"] },
  { key: "address", label: "ที่อยู่", required: false, aliases: ["ที่อยู่", "address"] },
  { key: "creditTermDays", label: "เครดิต (วัน)", required: false, aliases: ["เครดิต", "creditterm", "creditdays"] },
];

const PRODUCT_FIELDS: ImportFieldDef[] = [
  { key: "name", label: "ชื่อ", required: true, aliases: ["ชื่อ", "name"] },
  { key: "sku", label: "รหัสสินค้า (SKU)", required: false, aliases: ["รหัสสินค้า", "sku"] },
  { key: "type", label: "ประเภท (สินค้า/บริการ)", required: false, aliases: ["ประเภท", "type"] },
  { key: "unit", label: "หน่วย", required: false, aliases: ["หน่วย", "unit"] },
  { key: "salePrice", label: "ราคาขาย (บาท)", required: false, aliases: ["ราคาขาย", "saleprice"] },
  { key: "buyPrice", label: "ราคาซื้อ (บาท)", required: false, aliases: ["ราคาซื้อ", "buyprice", "ต้นทุน"] },
  { key: "vatRate", label: "อัตราภาษีมูลค่าเพิ่ม (%)", required: false, aliases: ["อัตราภาษี", "vat", "vatrate"] },
];

// WO 6.1 §11.1 — นำเข้าผังบัญชี (CSV): รหัส · ชื่อ · ชื่ออังกฤษ · ประเภท · หมวดย่อย · คำอธิบาย
const CHART_FIELDS: ImportFieldDef[] = [
  { key: "code", label: "รหัสบัญชี", required: true, aliases: ["รหัสบัญชี", "รหัส", "code", "accountcode"] },
  { key: "name", label: "ชื่อบัญชี", required: true, aliases: ["ชื่อบัญชี", "ชื่อ", "name"] },
  { key: "nameEn", label: "ชื่อบัญชี (อังกฤษ)", required: false, aliases: ["ชื่ออังกฤษ", "nameen", "englishname"] },
  { key: "type", label: "ประเภทบัญชี", required: false, aliases: ["ประเภทบัญชี", "ประเภท", "type"] },
  { key: "parentCode", label: "หมวดย่อย (รหัสนำหน้า)", required: false, aliases: ["หมวดย่อย", "parentcode", "parent", "หมวด"] },
  { key: "description", label: "คำอธิบาย", required: false, aliases: ["คำอธิบาย", "description", "note"] },
];

export const IMPORT_FIELDS: Record<ImportKind, ImportFieldDef[]> = {
  documents_revenue: DOC_FIELDS_REVENUE,
  documents_expense: DOC_FIELDS_EXPENSE,
  contacts: CONTACT_FIELDS,
  products: PRODUCT_FIELDS,
  chart_of_accounts: CHART_FIELDS,
};

export const IMPORT_KIND_LABEL: Record<ImportKind, string> = {
  documents_revenue: "เอกสารรายรับ",
  documents_expense: "เอกสารรายจ่าย",
  contacts: "ผู้ติดต่อ",
  products: "สินค้า/บริการ",
  chart_of_accounts: "ผังบัญชี",
};

// ─────────────────── ตัวอย่างแถวเทมเพลต (2 แถว/ชนิด) ───────────────────
const TEMPLATE_SAMPLES: Record<ImportKind, string[][]> = {
  documents_revenue: [
    ["REF-001", "IV", "2026-09-01", "บริษัท ทดสอบ จำกัด", "0105558000001", "ค่าบริการที่ปรึกษา", "1", "งาน", "10000", "0", "7", ""],
    ["REF-002", "IV", "2026-09-02", "ร้านตัวอย่าง", "", "สินค้าตัวอย่าง", "2", "ชิ้น", "500", "0", "7", ""],
  ],
  documents_expense: [
    ["REF-101", "EXP", "2026-09-01", "บริษัท ซัพพลายเออร์ จำกัด", "0105558000002", "ค่าเช่าสำนักงาน", "1", "เดือน", "15000", "0", "7", ""],
    ["REF-102", "PUR", "2026-09-02", "ร้านวัสดุก่อสร้าง", "", "ปูนซีเมนต์", "10", "ถุง", "150", "0", "7", ""],
  ],
  contacts: [
    ["บริษัท ทดสอบ จำกัด", "ลูกค้า", "0105558000001", "00000", "021234567", "test@example.com", "123 ถ.สุขุมวิท กรุงเทพฯ", "30"],
    ["ร้านวัสดุก่อสร้าง", "ผู้ขาย", "", "", "0812345678", "", "", "0"],
  ],
  products: [
    ["สินค้าตัวอย่าง", "SKU-001", "สินค้า", "ชิ้น", "500", "300", "7"],
    ["บริการที่ปรึกษา", "", "บริการ", "งาน", "10000", "", "7"],
  ],
  chart_of_accounts: [
    ["6310", "ค่าโฆษณาออนไลน์", "Online Advertising", "ค่าใช้จ่าย", "631", "ค่ายิงโฆษณาเฟซบุ๊ก/กูเกิล"],
    ["4040", "รายได้ค่าเช่าอุปกรณ์", "Equipment Rental Income", "รายได้", "404", ""],
  ],
};

// ─────────────────── CSV export ปลอดภัย (กัน CSV injection ตอนดาวน์โหลดเทมเพลต) ───────────────────
/** สูตร/ฟังก์ชันของ Excel เริ่มด้วย = + - @ — เติม ' นำหน้าให้เป็นข้อความเฉย ๆ (ไม่ให้ spreadsheet รันสูตร)
 *  WO 9.2 ข้อ 7: ตรรกะจริงย้ายไป `core/csv.ts` แล้ว (ที่เดียวทั้งระบบ) — ชื่อนี้คงไว้ให้ผู้เรียก/QC เดิม */
export const neutralizeFormulaPrefix = neutralizeFormula;

/** สร้างไฟล์เทมเพลต CSV (BOM UTF-8 ให้ Excel เปิดไทยไม่เพี้ยน) — ใช้ทั้งปุ่ม "ดาวน์โหลดเทมเพลต" และ route ดาวน์โหลด */
export function buildTemplateCsv(kind: ImportKind): string {
  const fields = IMPORT_FIELDS[kind];
  const header = fields.map((f) => f.aliases[0] ?? f.label).map(csvCell).join(",");
  const rows = TEMPLATE_SAMPLES[kind].map((r) => r.map(csvCell).join(","));
  return "﻿" + [header, ...rows].join("\n") + "\n";
}

export function templateFilename(kind: ImportKind): string {
  const names: Record<ImportKind, string> = {
    documents_revenue: "เทมเพลต-นำเข้าเอกสารรายรับ.csv",
    documents_expense: "เทมเพลต-นำเข้าเอกสารรายจ่าย.csv",
    contacts: "เทมเพลต-นำเข้าผู้ติดต่อ.csv",
    products: "เทมเพลต-นำเข้าสินค้า.csv",
    chart_of_accounts: "เทมเพลต-นำเข้าผังบัญชี.csv",
  };
  return names[kind];
}

// ─────────────────── parse + auto-match คอลัมน์ ───────────────────
export type ColumnMapping = Record<string, number>; // fieldKey → column index (-1 = ไม่ได้จับคู่)

export function parseImportCsv(text: string): CsvTable {
  return parseCsv(text);
}

/** จับคู่คอลัมน์อัตโนมัติจากชื่อหัว (เหมือน columnIndex ของ csv.ts) — ผู้ใช้ปรับทีหลังได้ในขั้น ② */
export function autoMatchColumns(headers: string[], kind: ImportKind): ColumnMapping {
  const out: ColumnMapping = {};
  for (const f of IMPORT_FIELDS[kind]) out[f.key] = columnIndex(headers, f.aliases);
  return out;
}

/** แปลงตาราง CSV ดิบ → แถวที่ map เป็น fieldKey แล้ว (ใช้ mapping ที่ auto-match หรือผู้ใช้ปรับเอง) */
export function applyMapping(table: CsvTable, kind: ImportKind, mapping: ColumnMapping): Record<string, string>[] {
  const fields = IMPORT_FIELDS[kind];
  return table.rows.map((row) => {
    const out: Record<string, string> = {};
    for (const f of fields) out[f.key] = cell(row, mapping[f.key] ?? -1);
    return out;
  });
}

// ─────────────────── เลขที่/ชนิดเอกสาร ───────────────────
const DOC_TYPE_ALIASES: Record<"revenue" | "expense", Record<string, string>> = {
  revenue: {
    QT: "QUOTATION", QUOTATION: "QUOTATION", ใบเสนอราคา: "QUOTATION",
    IV: "INVOICE", INVOICE: "INVOICE", ใบแจ้งหนี้: "INVOICE",
    RE: "RECEIPT", RECEIPT: "RECEIPT", ใบเสร็จ: "RECEIPT", ใบเสร็จรับเงิน: "RECEIPT",
    DR: "DEPOSIT_RECEIPT", DEPOSIT_RECEIPT: "DEPOSIT_RECEIPT", ใบรับเงินมัดจำ: "DEPOSIT_RECEIPT",
  },
  expense: {
    PUR: "PURCHASE", PC: "PURCHASE", PURCHASE: "PURCHASE", บันทึกซื้อสินค้า: "PURCHASE",
    EXP: "EXPENSE", EX: "EXPENSE", EXPENSE: "EXPENSE", บันทึกค่าใช้จ่าย: "EXPENSE",
  },
};
const DOC_TYPE_DEFAULT: Record<"revenue" | "expense", string> = { revenue: "INVOICE", expense: "EXPENSE" };

/** ชนิดเอกสารจากคอลัมน์ CSV → AccountDocType จริง · ค่าว่าง/ไม่รู้จัก = ค่าเริ่มต้นของฝั่งนั้น */
export function resolveDocType(side: "revenue" | "expense", raw: string): { docType: string; recognized: boolean } {
  const key = raw.trim().toUpperCase().replace(/[\s_-]/g, "");
  if (!key) return { docType: DOC_TYPE_DEFAULT[side], recognized: true }; // ว่าง = ปกติ (ไม่เตือน) ใช้ค่าเริ่มต้น
  const found = DOC_TYPE_ALIASES[side][key] ?? DOC_TYPE_ALIASES[side][raw.trim()];
  return found ? { docType: found, recognized: true } : { docType: DOC_TYPE_DEFAULT[side], recognized: false };
}

// ─────────────────── ตรวจแถว (รูปแบบล้วน — ไม่แตะ DB) ───────────────────
export type RowStatus = "ok" | "warn" | "err";
export type RowCheck = { status: RowStatus; reasons: string[] };

/** วันที่ ค.ศ. YYYY-MM-DD เท่านั้น (ตาม HARD RULES ทั้งระบบ — ห้าม พ.ศ.) */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function parseDateStrict(s: string): Date | null {
  if (!DATE_RE.test(s.trim())) return null;
  const d = new Date(`${s.trim()}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** เลขไทย/มีคอมมา → number · คืน null ถ้าว่าง · คืน NaN ถ้ากรอกแต่แปลงไม่ได้ */
function parseAmount(s: string): number | null {
  const t = s.trim().replace(/,/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

export function validateDocRowFormat(side: "revenue" | "expense", r: Record<string, string>): RowCheck {
  const reasons: string[] = [];
  let status: RowStatus = "ok";
  const err = (msg: string) => { reasons.push(msg); status = "err"; };
  const warn = (msg: string) => { if (status !== "err") status = "warn"; reasons.push(msg); };

  if (!parseDateStrict(r.date ?? "")) err("วันที่ผิดรูปแบบ (ต้องเป็น YYYY-MM-DD)");
  if (!(r.contactName ?? "").trim()) err(side === "revenue" ? "ไม่มีชื่อผู้ติดต่อ" : "ไม่มีชื่อผู้ขาย");
  if (!(r.itemName ?? "").trim()) err("ไม่มีชื่อรายการ");

  const qty = parseAmount(r.qty ?? "");
  if (qty === null || Number.isNaN(qty)) err("จำนวนไม่ถูกต้อง");
  else if (qty <= 0) err("จำนวนต้องมากกว่า 0");

  const unitPrice = parseAmount(r.unitPrice ?? "");
  if (unitPrice === null || Number.isNaN(unitPrice)) err("ราคาต่อหน่วยไม่ถูกต้อง");
  else if (unitPrice < 0) err("ยอดติดลบ");

  const discount = parseAmount(r.discount ?? "");
  if (discount !== null) {
    if (Number.isNaN(discount)) err("ส่วนลดไม่ถูกต้อง");
    else if (discount < 0) err("ยอดติดลบ");
  }

  const vatRate = parseAmount(r.vatRate ?? "");
  if (vatRate !== null && (Number.isNaN(vatRate) || vatRate < 0 || vatRate > 100)) {
    warn("อัตราภาษีไม่ถูกต้อง (ใช้ 7%)");
  }

  const dt = resolveDocType(side, r.docType ?? "");
  if (!dt.recognized) warn("ไม่รู้จักประเภทเอกสาร (ใช้ค่าเริ่มต้น)");

  return { status, reasons };
}

export function validateContactRowFormat(r: Record<string, string>): RowCheck {
  const reasons: string[] = [];
  let status: RowStatus = "ok";
  const err = (msg: string) => { reasons.push(msg); status = "err"; };
  const warn = (msg: string) => { if (status !== "err") status = "warn"; reasons.push(msg); };

  if (!(r.name ?? "").trim()) err("ไม่มีชื่อผู้ติดต่อ");

  const taxId = (r.taxId ?? "").replace(/\D/g, "");
  if (taxId && taxId.length !== 13) warn("เลขผู้เสียภาษีไม่ครบ 13 หลัก (จะบันทึกแบบไม่ตรวจ)");

  const credit = parseAmount(r.creditTermDays ?? "");
  if (credit !== null && (Number.isNaN(credit) || credit < 0)) err("ยอดติดลบ");

  return { status, reasons };
}

export function validateProductRowFormat(r: Record<string, string>): RowCheck {
  const reasons: string[] = [];
  let status: RowStatus = "ok";
  const err = (msg: string) => { reasons.push(msg); status = "err"; };
  const warn = (msg: string) => { if (status !== "err") status = "warn"; reasons.push(msg); };

  if (!(r.name ?? "").trim()) err("ไม่มีชื่อสินค้า/บริการ");

  for (const key of ["salePrice", "buyPrice"] as const) {
    const v = parseAmount(r[key] ?? "");
    if (v !== null) {
      if (Number.isNaN(v)) err(`${key === "salePrice" ? "ราคาขาย" : "ราคาซื้อ"}ไม่ถูกต้อง`);
      else if (v < 0) err("ยอดติดลบ");
    }
  }
  const vatRate = parseAmount(r.vatRate ?? "");
  if (vatRate !== null && (Number.isNaN(vatRate) || vatRate < 0 || vatRate > 100)) {
    warn("อัตราภาษีไม่ถูกต้อง (ใช้ 7%)");
  }
  return { status, reasons };
}

/** ชื่อประเภทบัญชีที่ CSV ยอมรับ → AccountLedgerType (ค่าว่าง = เดาจากตัวเลขนำหน้ารหัส) */
const LEDGER_TYPE_ALIASES: Record<string, string> = {
  ASSET: "ASSET", สินทรัพย์: "ASSET",
  LIABILITY: "LIABILITY", หนี้สิน: "LIABILITY",
  EQUITY: "EQUITY", ส่วนของเจ้าของ: "EQUITY", ทุน: "EQUITY",
  INCOME: "INCOME", รายได้: "INCOME", REVENUE: "INCOME",
  COGS: "COGS", ต้นทุนขาย: "COGS", ต้นทุน: "COGS",
  EXPENSE: "EXPENSE", ค่าใช้จ่าย: "EXPENSE",
};

/** ตัวเลขนำหน้ารหัส → ประเภทบัญชี (1 สินทรัพย์ … 6 ค่าใช้จ่าย) */
const LEDGER_TYPE_BY_DIGIT: Record<string, string> = {
  "1": "ASSET",
  "2": "LIABILITY",
  "3": "EQUITY",
  "4": "INCOME",
  "5": "COGS",
  "6": "EXPENSE",
};

/** ประเภทบัญชีของแถว CSV — คืน null ถ้าระบุมาแล้วไม่รู้จัก/รหัสไม่ขึ้นต้น 1–6 */
export function resolveLedgerType(rawType: string, code: string): { type: string | null; recognized: boolean } {
  const key = rawType.trim().toUpperCase().replace(/[\s_-]/g, "");
  if (key) {
    const found = LEDGER_TYPE_ALIASES[key] ?? LEDGER_TYPE_ALIASES[rawType.trim()];
    if (found) return { type: found, recognized: true };
    return { type: LEDGER_TYPE_BY_DIGIT[code.trim()[0]] ?? null, recognized: false };
  }
  return { type: LEDGER_TYPE_BY_DIGIT[code.trim()[0]] ?? null, recognized: true };
}

/** ตรวจรูปแบบแถว "นำเข้าผังบัญชี" (WO 6.1 · ไม่แตะ DB — รหัสซ้ำใน DB ตรวจอีกชั้นใน import-actions) */
export function validateChartRowFormat(r: Record<string, string>): RowCheck {
  const reasons: string[] = [];
  let status: RowStatus = "ok";
  const err = (msg: string) => { reasons.push(msg); status = "err"; };
  const warn = (msg: string) => { if (status !== "err") status = "warn"; reasons.push(msg); };

  const code = (r.code ?? "").trim();
  const parent = (r.parentCode ?? "").trim();
  if (!code) err("ไม่มีรหัสบัญชี");
  else if (!/^\d{3,6}$/.test(code)) err("รหัสบัญชีต้องเป็นตัวเลข 3–6 หลัก");
  else if (parent) {
    if (!/^\d{1,5}$/.test(parent)) err("รหัสหมวดย่อยต้องเป็นตัวเลข");
    else if (!code.startsWith(parent)) err(`รหัส ${code} อยู่นอกช่วงของหมวดย่อย ${parent} (${parent}0–${parent}9)`);
  }
  if (!(r.name ?? "").trim()) err("ไม่มีชื่อบัญชี");

  if (code && /^\d{3,6}$/.test(code)) {
    const t = resolveLedgerType(r.type ?? "", code);
    if (!t.type) err("รหัสบัญชีต้องขึ้นต้นด้วย 1–6 (หมวดบัญชี)");
    else if (!t.recognized) warn("ไม่รู้จักประเภทบัญชี (ใช้หมวดตามตัวเลขนำหน้ารหัส)");
  }

  return { status, reasons };
}

// ─────────────────── แปลงเป็นสตางค์/จำนวน (ใช้ตอนสร้างจริง — server เท่านั้น แต่ฟังก์ชันบริสุทธิ์) ───────────────────
export function bahtToSatang(s: string, fallback = 0): number {
  const n = parseAmount(s);
  if (n === null || Number.isNaN(n)) return fallback;
  return Math.round(n * 100);
}
export function toQty(s: string, fallback = 0): number {
  const n = parseAmount(s);
  if (n === null || Number.isNaN(n)) return fallback;
  return n;
}
export function toVatRateBp(s: string, fallback = 700): number {
  const n = parseAmount(s);
  if (n === null || Number.isNaN(n)) return fallback;
  return Math.round(n * 100);
}

// ─────────────────── จัดกลุ่มแถวเอกสาร → 1 กลุ่ม = 1 เอกสาร ───────────────────
export type DocGroup = { key: string; rowIndexes: number[] };

/** จัดกลุ่มด้วยคอลัมน์ "เลขอ้างอิง" — ค่าว่าง = แถวนั้นเป็นเอกสารของตัวเอง (ไม่รวมกับแถวว่างอื่น) */
export function groupDocRows(rows: Record<string, string>[]): DocGroup[] {
  const byRef = new Map<string, number[]>();
  const standalone: DocGroup[] = [];
  rows.forEach((r, i) => {
    const ref = (r.ref ?? "").trim();
    if (!ref) {
      standalone.push({ key: `__row_${i}`, rowIndexes: [i] });
      return;
    }
    const arr = byRef.get(ref) ?? [];
    arr.push(i);
    byRef.set(ref, arr);
  });
  return [...standalone, ...[...byRef.entries()].map(([key, rowIndexes]) => ({ key, rowIndexes }))].sort(
    (a, b) => a.rowIndexes[0] - b.rowIndexes[0],
  );
}

// ─────────────────── ตัวช่วยไฟล์แฮช (idempotency — เดียวกับที่ import-actions.ts ใช้) ───────────────────
/** แฮชเบา ๆ (djb2 → hex) — พอสำหรับกันไฟล์เดิมนำเข้าซ้ำ ไม่ใช่ cryptographic hash */
export function fileHashOf(text: string): string {
  let h1 = 5381;
  let h2 = 52711;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = (h1 * 33) ^ c;
    h2 = (h2 * 33) ^ (c + 1);
  }
  return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
}

// ─────────────────── ขอบเขต (HARD RULES) ───────────────────
export const IMPORT_MAX_ROWS = 2000;
export const IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const IMPORT_PREVIEW_ROWS = 20;

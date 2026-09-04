// settings-schema.ts — โครงตั้งค่าเอกสาร (§9.2) แบบมีชนิด + ค่าเริ่มต้น + ตัวอ่าน/ตัวรวม
//
// ทำไมเป็น JSON ไม่ใช่คอลัมน์: ตั้งค่าพวกนี้ "อ่านทั้งก้อนเสมอ" (หน้าตั้งค่า/ตอนพิมพ์/ตอนออกเลข)
// ไม่เคยถูกใช้เป็นเงื่อนไข WHERE หรือ join ⇒ คอลัมน์ละช่องจะได้ migration 30 กว่าครั้งโดยไม่ได้อะไรกลับมา
// สิ่งที่ต้อง index/unique จริง ๆ มีแค่ 2 อย่างและมีตารางของตัวเองแล้ว:
//   · เลขรัน → AccountDocSequence (unique systemId+docType+periodKey — กันเลขซ้ำตอนยิงพร้อมกัน)
//   · แท็ก   → AccountDocTag (unique systemId+name)
//
// 🔴 ไฟล์นี้ต้อง "บริสุทธิ์" (ไม่แตะ DB/prisma) — fitness F5.1 ล็อกจำนวนไฟล์โมดูลที่ import prisma ไว้ที่ 45
//    และตรรกะรูปแบบเลขที่ต้องเทสได้โดยไม่ต้องมีฐานข้อมูล
import type { AccountDocType } from "@prisma/client";

// ─────────────────── ชนิดเอกสารที่มี "เลขรัน" ให้ตั้งค่า (18 ชนิด · §9.2) ───────────────────
// 8 รายรับ + 10 รายจ่าย · ไม่รวม WHT_CERT (50 ทวิ มีเล่ม/เลขของตัวเองตามกฎหมาย)
// และไม่รวม TAX_INVOICE_ABB (ใบกำกับอย่างย่อจาก POS ใช้เลขใบเสร็จของหน้าร้าน ไม่กินเลขรันบัญชี)
export const NUMBERED_DOC_TYPES: readonly AccountDocType[] = [
  "QUOTATION",
  "INVOICE",
  "RECEIPT",
  "TAX_INVOICE",
  "DEPOSIT_RECEIPT",
  "CREDIT_NOTE",
  "DEBIT_NOTE",
  "BILLING_NOTE",
  "PURCHASE_ORDER",
  "PURCHASE",
  "PURCHASE_TAX_INVOICE",
  "EXPENSE",
  "DEPOSIT_PAYMENT",
  "CREDIT_NOTE_RECEIVED",
  "DEBIT_NOTE_RECEIVED",
  "ASSET_PURCHASE_ORDER",
  "ASSET_PURCHASE",
  "COMBINED_PAYMENT",
];

// ─────────────────── คำนำหน้าปริยายต่อชนิด (แหล่งเดียว) ───────────────────
//
// อยู่ที่นี่เพราะทั้ง service.ts (รายรับ) และ expense.ts (รายจ่าย) ต้องใช้ และ 2 ไฟล์นั้น import กันเป็นวง
// อยู่แล้ว — ถ้าตารางอยู่ในไฟล์ใดไฟล์หนึ่ง อีกฝั่งจะต้องคัดลอกไว้เอง แล้ววันหนึ่งจะไม่ตรงกัน
export const REVENUE_DOC_PREFIX: Partial<Record<AccountDocType, string>> = {
  QUOTATION: "QT",
  INVOICE: "IV",
  RECEIPT: "RE",
  TAX_INVOICE: "TX",
  DEPOSIT_RECEIPT: "DR",
  CREDIT_NOTE: "CN",
  DEBIT_NOTE: "DN",
  BILLING_NOTE: "BN",
};

export const EXPENSE_DOC_PREFIX: Partial<Record<AccountDocType, string>> = {
  PURCHASE: "PC",
  EXPENSE: "EX",
  PURCHASE_ORDER: "PO",
  ASSET_PURCHASE_ORDER: "APO",
  ASSET_PURCHASE: "AP",
  PURCHASE_TAX_INVOICE: "PTX",
  DEPOSIT_PAYMENT: "DP",
  CREDIT_NOTE_RECEIVED: "CNR",
  DEBIT_NOTE_RECEIVED: "DNR",
  COMBINED_PAYMENT: "CP",
  WHT_CERT: "WHT",
};

/** คำนำหน้าปริยายของชนิดเอกสารใด ๆ (รายรับ + รายจ่าย) — ไม่รู้จัก = ใช้ชื่อ enum */
export function fallbackPrefixOf(docType: AccountDocType): string {
  return REVENUE_DOC_PREFIX[docType] || EXPENSE_DOC_PREFIX[docType] || docType;
}

/** ชนิดฝั่งรายรับ (ใช้แบ่งหัวข้อในตาราง §9.2 และเลือกเทมเพลตพิมพ์) */
export const REVENUE_DOC_TYPES: readonly AccountDocType[] = NUMBERED_DOC_TYPES.slice(0, 8);
export const EXPENSE_DOC_TYPES: readonly AccountDocType[] = NUMBERED_DOC_TYPES.slice(8);

// ─────────────────── ชนิดค่าตั้งค่า ───────────────────

/** นโยบายรีเซ็ตเลขรัน — ค่าที่เก็บใน DB คงของเดิม (NONE/YEAR/MONTH) เพื่อไม่ทำแถวเลขรันเดิมกำพร้า */
export type SeqReset = "NONE" | "YEAR" | "MONTH";
export const SEQ_RESET_LABEL: Record<SeqReset, string> = {
  NONE: "ไม่รีเซ็ต",
  YEAR: "รายปี",
  MONTH: "รายเดือน",
};

export type SeqConfig = {
  /** คำนำหน้า (ตัวที่ใช้แทน {คำนำหน้า}/{PREFIX} และเป็นค่าตั้งต้นของรูปแบบ) */
  prefix: string;
  /** รูปแบบเต็ม · "" = ใช้รูปแบบเริ่มต้นตามนโยบายรีเซ็ต */
  pattern: string;
  reset: SeqReset;
};

/** นับวันครบกำหนดจาก "วันที่ออก" หรือ "สิ้นเดือนของวันที่ออก" (§9.2 บรรทัดวันครบกำหนด) */
export type DueBasis = "ISSUE" | "MONTH_END";
export const DUE_BASIS_LABEL: Record<DueBasis, string> = {
  ISSUE: "นับจากวันที่ออกเอกสาร",
  MONTH_END: "นับจากสิ้นเดือนของวันที่ออกเอกสาร",
};

/** ออกใบกำกับภาษีอัตโนมัติเมื่อไหร่ */
export type AutoTaxInvoiceMode = "ON_PAYMENT" | "ON_INVOICE" | "MANUAL";
export const AUTO_TAX_MODE_LABEL: Record<AutoTaxInvoiceMode, string> = {
  ON_PAYMENT: "เมื่อรับชำระเงิน",
  ON_INVOICE: "เมื่อออกใบแจ้งหนี้",
  MANUAL: "เลือกเอง (ไม่ออกอัตโนมัติ)",
};

/** เทมเพลตพิมพ์ A4 (§9.2 รายงานเอกสาร) */
export type PrintTemplate = "STANDARD" | "COMPACT" | "WITH_IMAGES";
export const PRINT_TEMPLATE_LABEL: Record<PrintTemplate, string> = {
  STANDARD: "A4 มาตรฐาน",
  COMPACT: "A4 กะทัดรัด",
  WITH_IMAGES: "A4 มีรูปสินค้า",
};

export type PrintLanguage = "TH" | "EN";
export const PRINT_LANGUAGE_LABEL: Record<PrintLanguage, string> = {
  TH: "ไทย",
  EN: "อังกฤษ",
};

/** ฟิลด์ที่เปิด/ปิดได้บนเอกสารพิมพ์ — คีย์ = ชื่อในโค้ดพิมพ์ · ป้าย = ภาษาคน */
export const PRINT_FIELD_LABEL = {
  logo: "โลโก้กิจการ",
  stamp: "ตราประทับ",
  signature: "ลายเซ็น",
  buyerTaxId: "เลขประจำตัวผู้เสียภาษีของลูกค้า",
  buyerAddress: "ที่อยู่ลูกค้า",
  productSku: "รหัสสินค้า",
  productImage: "รูปสินค้า",
  dueDate: "วันครบกำหนด",
  reference: "เลขอ้างอิง",
  note: "หมายเหตุท้ายเอกสาร",
  paymentTerms: "เงื่อนไขการชำระ",
  paymentChannels: "ช่องทางการรับชำระ",
} as const;
export type PrintField = keyof typeof PRINT_FIELD_LABEL;
export const PRINT_FIELDS = Object.keys(PRINT_FIELD_LABEL) as PrintField[];

export type DocNoteConfig = {
  /** ข้อความท้ายเอกสารต่อชนิด (ข้อความสั้น ไม่ใช่ HTML — พิมพ์ลงกระดาษตรง ๆ) */
  footer: string;
  /** เงื่อนไขการชำระเงินต่อชนิด */
  terms: string;
};

export type DocSettings = {
  /** เลขที่เอกสารต่อชนิด (คีย์ = AccountDocType) */
  sequences: Record<string, SeqConfig>;
  /** หมายเหตุ/เงื่อนไขต่อชนิด */
  notes: Record<string, DocNoteConfig>;
  /** วันครบกำหนดเริ่มต้น */
  due: {
    quotationValidDays: number; // QT ใช้ได้ถึง
    invoiceCreditDays: number; // IV เครดิตเทอม
    purchaseOrderDueDays: number; // PO กำหนดส่ง
    basis: DueBasis;
  };
  /** ช่องทางรับชำระที่พิมพ์บนเอกสาร — เก็บ "ลำดับ" (การเปิด/ปิดอยู่ที่ AccountFinance.showOnDocuments §10.1) */
  channels: { order: string[] };
  /** การแสดงข้อมูลสาธารณะของลิงก์ /r/<token> */
  publicView: {
    enabled: boolean;
    showOutstanding: boolean; // แสดงยอดค้าง
    promptPayButton: boolean; // ปุ่มจ่าย PromptPay
    expiryDays: number; // อายุลิงก์ (วัน) · 0 = ไม่หมดอายุ
  };
  /** การออกใบกำกับภาษีอัตโนมัติ */
  autoTaxInvoice: {
    mode: AutoTaxInvoiceMode;
    posAbbreviated: boolean; // สร้างใบกำกับอย่างย่อจากบิล POS
    legalText: string; // ข้อความตามกฎหมายท้ายใบกำกับ
  };
  /** เทมเพลตพิมพ์ */
  print: {
    template: PrintTemplate;
    language: PrintLanguage;
    fields: Record<PrintField, boolean>;
  };
  /** ลิงก์ให้ลูกค้าขอใบกำกับภาษีเอง (QR ท้ายใบเสร็จ) */
  taxRequest: {
    enabled: boolean;
    receiptText: string; // ข้อความที่พิมพ์บนใบเสร็จข้าง QR
    conditionNote: string; // เงื่อนไข (เช่น ขอได้ภายใน 7 วัน)
    minAmountSatang: number; // ยอดขั้นต่ำที่ให้ขอได้ · 0 = ไม่จำกัด
  };
  /** กฎอัตโนมัติของเอกสาร (การ์ดล่างของ f10) */
  rules: {
    lockNumberOnIssue: boolean; // ล็อกเลขที่เอกสารเมื่อออกแล้ว
    warnOnGap: boolean; // เตือนเมื่อเลขที่ข้ามลำดับ
  };
};

/** สีของแท็กที่เลือกได้ — เป็น "คีย์ token" ไม่ใช่ค่า hex (UI_STANDARD ห้าม hex ดิบในโค้ด) */
export const TAG_COLORS = ["slate", "blue", "green", "amber", "red", "purple"] as const;
export type TagColor = (typeof TAG_COLORS)[number];
export const TAG_COLOR_LABEL: Record<TagColor, string> = {
  slate: "เทา",
  blue: "ฟ้า",
  green: "เขียว",
  amber: "เหลือง",
  red: "แดง",
  purple: "ม่วง",
};

// ─────────────────── ค่าเริ่มต้น ───────────────────

export const DEFAULT_LEGAL_TEXT =
  "เอกสารออกเป็นชุด ต้นฉบับ/สำเนา · ใบกำกับภาษีนี้ออกตามมาตรา 86/4 แห่งประมวลรัษฎากร";

export const DEFAULT_TAX_REQUEST_TEXT = "ต้องการใบกำกับภาษีเต็มรูป? สแกน QR แล้วกรอกข้อมูลได้เลย";

export function defaultDocSettings(): DocSettings {
  return {
    sequences: {},
    notes: {},
    due: { quotationValidDays: 30, invoiceCreditDays: 30, purchaseOrderDueDays: 7, basis: "ISSUE" },
    channels: { order: [] },
    publicView: { enabled: true, showOutstanding: true, promptPayButton: true, expiryDays: 0 },
    autoTaxInvoice: { mode: "ON_PAYMENT", posAbbreviated: true, legalText: DEFAULT_LEGAL_TEXT },
    print: {
      template: "STANDARD",
      language: "TH",
      // ค่าเริ่มต้น = สิ่งที่หน้าพิมพ์วันนี้แสดงอยู่แล้ว (เปิดหมด ยกเว้นรูปสินค้า/รหัสสินค้าที่ของเดิมไม่มี)
      fields: {
        logo: true,
        stamp: true,
        signature: true,
        buyerTaxId: true,
        buyerAddress: true,
        productSku: false,
        productImage: false,
        dueDate: true,
        reference: true,
        note: true,
        paymentTerms: true,
        paymentChannels: true,
      },
    },
    taxRequest: {
      enabled: true,
      receiptText: DEFAULT_TAX_REQUEST_TEXT,
      conditionNote: "ขอได้ภายใน 7 วันนับจากวันที่ออกใบเสร็จ",
      minAmountSatang: 0,
    },
    rules: { lockNumberOnIssue: true, warnOnGap: false },
  };
}

// ─────────────────── ตัวอ่านจาก JSON (ทนของเก่า/ของเสีย) ───────────────────

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const str = (v: unknown, dflt: string): string => (typeof v === "string" ? v : dflt);
const bool = (v: unknown, dflt: boolean): boolean => (typeof v === "boolean" ? v : dflt);
const int = (v: unknown, dflt: number, min: number, max: number): number => {
  const n = typeof v === "number" ? Math.trunc(v) : Number.NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : dflt;
};

/** รับได้ทั้ง NONE/YEAR/MONTH (ที่เก็บจริง) และ YEARLY/MONTHLY (ที่ใบสั่งงาน/ผู้ใช้พิมพ์) */
export function toSeqReset(v: unknown): SeqReset {
  const s = String(v ?? "").toUpperCase();
  if (s === "NONE") return "NONE";
  if (s === "YEAR" || s === "YEARLY") return "YEAR";
  if (s === "MONTH" || s === "MONTHLY") return "MONTH";
  return "MONTH"; // ค่าเดิมของระบบก่อน V2
}

/**
 * ที่เก็บใน `AccountSettings.docConfig`:
 *   · `sequences`  — คีย์เดิมตั้งแต่ V1 (อย่าย้าย ไม่งั้นเลขรันของร้านที่ตั้งไว้แล้วหาย)
 *   · `docSettings` — คีย์ใหม่ของ WO 8.1 (ที่เหลือทั้งหมดของ §9.2)
 *   · คีย์อื่น ๆ (orgPrefix / stampUrl / docTypes / taxPointBasis / favorites / …) ไม่แตะ
 */
export const DOC_SETTINGS_KEY = "docSettings";
export const SEQUENCES_KEY = "sequences";

export function parseDocSettings(docConfig: unknown): DocSettings {
  const root = obj(docConfig);
  const d = defaultDocSettings();
  const raw = obj(root[DOC_SETTINGS_KEY]);

  // เลขรัน — อยู่นอก docSettings (คีย์เดิม)
  const sequences: Record<string, SeqConfig> = {};
  for (const [k, v] of Object.entries(obj(root[SEQUENCES_KEY]))) {
    const c = obj(v);
    sequences[k] = {
      prefix: str(c.prefix, ""),
      pattern: str(c.pattern, ""),
      reset: toSeqReset(c.reset), // ไม่ได้ตั้ง = MONTH (ค่าเดิมของระบบก่อน V2)
    };
  }

  const notes: Record<string, DocNoteConfig> = {};
  for (const [k, v] of Object.entries(obj(raw.notes))) {
    const c = obj(v);
    notes[k] = { footer: str(c.footer, ""), terms: str(c.terms, "") };
  }

  const due = obj(raw.due);
  const channels = obj(raw.channels);
  const publicView = obj(raw.publicView);
  const auto = obj(raw.autoTaxInvoice);
  const print = obj(raw.print);
  const printFields = obj(print.fields);
  const taxRequest = obj(raw.taxRequest);
  const rules = obj(raw.rules);

  const fields = { ...d.print.fields };
  for (const f of PRINT_FIELDS) fields[f] = bool(printFields[f], d.print.fields[f]);

  return {
    sequences,
    notes,
    due: {
      quotationValidDays: int(due.quotationValidDays, d.due.quotationValidDays, 0, 3650),
      invoiceCreditDays: int(due.invoiceCreditDays, d.due.invoiceCreditDays, 0, 3650),
      purchaseOrderDueDays: int(due.purchaseOrderDueDays, d.due.purchaseOrderDueDays, 0, 3650),
      basis: due.basis === "MONTH_END" ? "MONTH_END" : "ISSUE",
    },
    channels: {
      order: Array.isArray(channels.order)
        ? (channels.order as unknown[]).filter((x): x is string => typeof x === "string")
        : [],
    },
    publicView: {
      enabled: bool(publicView.enabled, d.publicView.enabled),
      showOutstanding: bool(publicView.showOutstanding, d.publicView.showOutstanding),
      promptPayButton: bool(publicView.promptPayButton, d.publicView.promptPayButton),
      expiryDays: int(publicView.expiryDays, d.publicView.expiryDays, 0, 3650),
    },
    autoTaxInvoice: {
      mode:
        auto.mode === "ON_INVOICE" || auto.mode === "MANUAL" || auto.mode === "ON_PAYMENT"
          ? (auto.mode as AutoTaxInvoiceMode)
          : d.autoTaxInvoice.mode,
      posAbbreviated: bool(auto.posAbbreviated, d.autoTaxInvoice.posAbbreviated),
      legalText: str(auto.legalText, d.autoTaxInvoice.legalText),
    },
    print: {
      template:
        print.template === "COMPACT" || print.template === "WITH_IMAGES" || print.template === "STANDARD"
          ? (print.template as PrintTemplate)
          : d.print.template,
      language: print.language === "EN" ? "EN" : "TH",
      fields,
    },
    taxRequest: {
      enabled: bool(taxRequest.enabled, d.taxRequest.enabled),
      receiptText: str(taxRequest.receiptText, d.taxRequest.receiptText),
      conditionNote: str(taxRequest.conditionNote, d.taxRequest.conditionNote),
      minAmountSatang: int(taxRequest.minAmountSatang, d.taxRequest.minAmountSatang, 0, 1_000_000_00),
    },
    rules: {
      lockNumberOnIssue: bool(rules.lockNumberOnIssue, d.rules.lockNumberOnIssue),
      warnOnGap: bool(rules.warnOnGap, d.rules.warnOnGap),
    },
  };
}

/** ส่วนที่แก้ได้ทีละก้อน (หน้าตั้งค่า 1 หน้า = 1 คีย์) */
export type DocSettingsPatch = Partial<Omit<DocSettings, "sequences" | "notes">> & {
  sequences?: Record<string, Partial<SeqConfig>>;
  notes?: Record<string, Partial<DocNoteConfig>>;
};

/**
 * รวม patch เข้ากับ docConfig เดิม → คืน docConfig ก้อนใหม่ (คีย์ที่ไม่เกี่ยวคงเดิมทุกตัว)
 * 🔴 ไม่ทำ deep-merge อัตโนมัติทั้งก้อน: แต่ละบล็อกของ §9.2 ทับทั้งบล็อกเมื่อถูกส่งมา
 *    (หน้าตั้งค่าส่งบล็อกเต็มเสมอ) — ยกเว้น sequences/notes ที่รวมรายชนิด เพราะตารางอาจส่งมาแค่บางแถว
 */
export function mergeDocSettings(
  docConfig: unknown,
  patch: DocSettingsPatch,
): Record<string, unknown> {
  const root = { ...obj(docConfig) };
  const current = parseDocSettings(root);
  const next = { ...obj(root[DOC_SETTINGS_KEY]) };

  if (patch.sequences) {
    const seqs: Record<string, SeqConfig> = { ...current.sequences };
    for (const [dt, v] of Object.entries(patch.sequences)) {
      const prev = seqs[dt] ?? { prefix: "", pattern: "", reset: "MONTH" as SeqReset };
      seqs[dt] = {
        prefix: v.prefix !== undefined ? v.prefix.trim() : prev.prefix,
        pattern: v.pattern !== undefined ? v.pattern.trim() : prev.pattern,
        reset: v.reset !== undefined ? toSeqReset(v.reset) : prev.reset,
      };
    }
    root[SEQUENCES_KEY] = seqs;
  }
  if (patch.notes) {
    const notes: Record<string, DocNoteConfig> = { ...current.notes };
    for (const [dt, v] of Object.entries(patch.notes)) {
      const prev = notes[dt] ?? { footer: "", terms: "" };
      notes[dt] = {
        footer: v.footer !== undefined ? v.footer : prev.footer,
        terms: v.terms !== undefined ? v.terms : prev.terms,
      };
    }
    next.notes = notes;
  }
  for (const key of ["due", "channels", "publicView", "autoTaxInvoice", "print", "taxRequest", "rules"] as const) {
    if (patch[key] !== undefined) next[key] = patch[key];
  }
  root[DOC_SETTINGS_KEY] = next;
  return root;
}

/**
 * ทับค่า "วันครบกำหนด" 2 ตัวด้วยคอลัมน์เดิมของ AccountSettings
 * 🔴 `defaultValidDays`/`defaultDueDays` เป็นคอลัมน์จริงที่ฟอร์มเอกสาร/สร้างเอกสารต่อ อ่านอยู่แล้ว
 *    ⇒ ถ้า JSON เก็บค่าเดียวกันอีกชุด จะมี 2 แหล่งความจริง แล้ววันหนึ่งจะไม่ตรงกัน
 *    ที่นี่จึงประกาศชัดว่า "คอลัมน์ชนะเสมอ" · JSON เก็บเฉพาะช่องใหม่ (PO / นับจากสิ้นเดือน)
 */
export function applyDueColumns(
  s: DocSettings,
  cols: { defaultValidDays: number; defaultDueDays: number },
): DocSettings {
  s.due.quotationValidDays = cols.defaultValidDays;
  s.due.invoiceCreditDays = cols.defaultDueDays;
  return s;
}

// ─────────────────── วันครบกำหนด (ตรรกะบริสุทธิ์ · ใช้ทั้งฟอร์มและ QC) ───────────────────

/** จำนวนวันเริ่มต้นของชนิดเอกสารตามตั้งค่า (ชนิดที่ไม่มีกำหนดชำระ → null) */
export function defaultDaysFor(s: DocSettings, docType: AccountDocType): number | null {
  if (docType === "QUOTATION") return s.due.quotationValidDays;
  if (docType === "PURCHASE_ORDER" || docType === "ASSET_PURCHASE_ORDER") return s.due.purchaseOrderDueDays;
  if (
    docType === "INVOICE" ||
    docType === "BILLING_NOTE" ||
    docType === "PURCHASE" ||
    docType === "EXPENSE" ||
    docType === "ASSET_PURCHASE"
  )
    return s.due.invoiceCreditDays;
  return null;
}

/**
 * คำนวณวันครบกำหนดจากวันที่ออก (เวลาไทย) ตามนโยบาย
 * · ISSUE     = วันที่ออก + n วัน
 * · MONTH_END = สิ้นเดือนของวันที่ออก + n วัน (เครดิตเทอมแบบ "สิ้นเดือน + 30")
 * ทำงานบน "วันที่ไทย" ล้วน ๆ (YYYY-MM-DD) แล้วค่อยคืนเป็น Date เที่ยงคืน UTC ของวันนั้น
 * — กับดัก getDay()/getMonth() ของ TZ เครื่องจึงเกิดไม่ได้
 */
export function computeDueDate(issueYmd: string, days: number, basis: DueBasis): string {
  const [y, m, d] = issueYmd.split("-").map((x) => Number.parseInt(x, 10));
  if (!y || !m || !d) return issueYmd;
  // นับวันบน UTC ล้วน (ไม่มี DST ไม่มีโซน) — ปลอดภัยกับทุกเครื่อง
  const base = basis === "MONTH_END" ? Date.UTC(y, m, 0) : Date.UTC(y, m - 1, d);
  const t = new Date(base + days * 86_400_000);
  return t.toISOString().slice(0, 10);
}

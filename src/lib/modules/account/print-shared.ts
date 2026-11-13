// print-shared.ts — ACC T2.7 · ส่วนบริสุทธิ์ของการพิมพ์เอกสาร (ใช้ได้ทั้ง server/client · ไม่ import prisma)
//
// กฎ (skill shark-thai-law `common-vat-invoice.md` §14 [V]):
//   · ฉ.39 ข้อ 1 — ใบกำกับที่ไม่ใช่ฉบับแรกของชุดต้องมี "เอกสารออกเป็นชุด" และสำเนามีคำว่า "สำเนาใบกำกับภาษี" (พิมพ์จากระบบ ไม่ใช่ตรายาง)
//   · ป.86/2542 ข้อ 4 — ต้นฉบับให้ผู้ซื้อ สำเนาเก็บ · พิมพ์ซ้ำต้องไม่ได้ "ต้นฉบับ" ใบที่สอง (checklist B6)
//   · ใบแทน (ม.86/12 + ฉ.36) — (1) ใบแทนออกให้ครั้งที่ (2) วันเดือนปีที่ออก (3) สาเหตุย่อ (4) ลายมือชื่อ
// design note ledger/wo-notes/T2.7.md
import type { AccountDocStatus, AccountDocType } from "@prisma/client";

export const PRINT_KINDS = ["ORIGINAL", "COPY", "SET", "SUBSTITUTE", "ORIGINAL_REPRINT"] as const;
export type PrintKind = (typeof PRINT_KINDS)[number];
export const PRINT_CHANNELS = ["SCREEN", "PDF", "EMAIL", "PUBLIC_LINK"] as const;
export type PrintChannel = (typeof PRINT_CHANNELS)[number];
/** สิ่งที่ผู้ใช้กด — ระบบตัดสินชนิดจริงจากประวัติ (กด "พิมพ์" ครั้งแรก = ต้นฉบับ · ครั้งต่อไป = สำเนา) */
export const PRINT_REQUESTS = ["PRINT", "COPY", "SET", "REPRINT_ORIGINAL", "SUBSTITUTE"] as const;
export type PrintRequest = (typeof PRINT_REQUESTS)[number];

export const isPrintChannel = (v: unknown): v is PrintChannel => typeof v === "string" && (PRINT_CHANNELS as readonly string[]).includes(v);
export const isPrintRequest = (v: unknown): v is PrintRequest => typeof v === "string" && (PRINT_REQUESTS as readonly string[]).includes(v);

/** เอกสารที่มีป้ายต้นฉบับ/สำเนา/ใบแทน — skill พูดถึงใบกำกับภาษี (ชนิดอื่นเงียบ ⇒ บันทึกการพิมพ์อย่างเดียว ไม่มีป้าย) */
export const SET_LABEL_DOC_TYPES: readonly AccountDocType[] = ["TAX_INVOICE"];

/** ชนิดที่จะได้จากคำขอ + ประวัติ (ตัดสินในธุรกรรมที่ล็อกเอกสารแล้ว) */
export function decidePrintKind(request: PrintRequest, hasOriginal: boolean): PrintKind {
  switch (request) {
    case "PRINT":
      return hasOriginal ? "COPY" : "ORIGINAL";
    case "SET":
      return hasOriginal ? "COPY" : "SET";
    case "COPY":
      return "COPY";
    case "REPRINT_ORIGINAL":
      return hasOriginal ? "ORIGINAL_REPRINT" : "ORIGINAL";
    case "SUBSTITUTE":
      return "SUBSTITUTE";
  }
}

export const PRINT_KIND_LABEL_TH: Record<PrintKind, string> = {
  ORIGINAL: "ต้นฉบับ",
  COPY: "สำเนา",
  SET: "ชุดต้นฉบับ + สำเนา",
  SUBSTITUTE: "ใบแทน",
  ORIGINAL_REPRINT: "ต้นฉบับ (พิมพ์ซ้ำ — ยืนยันคำเตือนแล้ว)",
};
export const PRINT_CHANNEL_LABEL_TH: Record<PrintChannel, string> = {
  SCREEN: "พิมพ์จากหน้าจอ",
  PDF: "ดาวน์โหลด PDF",
  EMAIL: "ส่งอีเมล",
  PUBLIC_LINK: "ลิงก์สาธารณะ",
};

/** ป้ายบนกระดาษ (ข้อความตรงตาม skill §14 — ห้ามเปลี่ยนถ้อยคำภาษาไทย) */
export const SET_WORDING = {
  TH: {
    original: "ต้นฉบับ",
    copyTitle: "สำเนาใบกำกับภาษี",
    issuedAsSet: "เอกสารออกเป็นชุด",
    substituteTitle: "ใบแทน",
    substituteSeq: (n: number) => `ใบแทนออกให้ครั้งที่ ${n}`,
    substituteDate: "วันที่ออกใบแทน",
    substituteReason: "สาเหตุ",
    substituteRef: "แทนใบกำกับภาษีเลขที่",
    substituteRefDate: "ลงวันที่",
    substituteSign: "ลงชื่อผู้ออกใบแทน",
    reprint: (n: number) => `พิมพ์ต้นฉบับซ้ำครั้งที่ ${n}`,
    draft: "ร่าง",
    draftNote: "ร่าง — ยังไม่ใช่ใบกำกับภาษี",
    draftNoteGeneric: "ร่าง — ยังไม่ได้ออกเอกสาร",
    voided: "ยกเลิกแล้ว",
    preview: "ตัวอย่างการพิมพ์ — ไม่ใช่ต้นฉบับ",
  },
  EN: {
    original: "Original",
    copyTitle: "สำเนาใบกำกับภาษี (Copy)",
    issuedAsSet: "เอกสารออกเป็นชุด (Issued as a set)",
    substituteTitle: "ใบแทน (Substitute)",
    substituteSeq: (n: number) => `ใบแทนออกให้ครั้งที่ ${n} (Substitute no. ${n})`,
    substituteDate: "Date issued",
    substituteReason: "Reason",
    substituteRef: "Replaces tax invoice no.",
    substituteRefDate: "dated",
    substituteSign: "Signed by issuer of the substitute",
    reprint: (n: number) => `Original reprinted (${n})`,
    draft: "DRAFT",
    draftNote: "Draft — not a tax invoice",
    draftNoteGeneric: "Draft — not issued",
    voided: "VOIDED",
    preview: "Print preview — not an original",
  },
} as const;

/** สถานะของหน้าพิมพ์จากสถานะเอกสาร — ร่าง = ลายน้ำ ไม่มีป้ายต้นฉบับ/สำเนา · ยกเลิก = ป้ายยกเลิก */
export function printStateOf(status: AccountDocStatus | string): "DRAFT" | "VOID" | "ISSUED" {
  if (status === "DRAFT") return "DRAFT";
  if (status === "VOIDED" || status === "CANCELLED") return "VOID";
  return "ISSUED";
}

/**
 * เงื่อนไขการชำระเงินที่พิมพ์ (จอนอกข้อ 3): ข้อความของร้านมี "N วัน" ที่ไม่ตรงกับ (ครบกำหนด − วันที่ออก) ⇒ พิมพ์เงื่อนไขจริงของเอกสารแทน
 *   ไม่มีครบกำหนด / ข้อความไม่มีจำนวนวัน / ตรงกัน ⇒ ข้อความของร้านตามเดิม
 */
export function realPaymentTerms(
  shopTerms: string,
  issueDate: Date,
  dueDate: Date | null | undefined,
  dueText: string,
  lang: "TH" | "EN" = "TH",
): string {
  const t = (shopTerms ?? "").trim();
  if (!dueDate) return t;
  const day = (d: Date) => Math.floor((d.getTime() + 7 * 3600_000) / 86_400_000);
  const days = day(dueDate) - day(issueDate);
  const m = t.match(/(\d+)\s*(วัน|days?)/i);
  if (!t || !m || Number(m[1]) === days) return t;
  return lang === "EN" ? `Payment within ${days} days of the document date (due ${dueText})` : `ชำระภายใน ${days} วันนับจากวันที่ออกเอกสาร (ครบกำหนด ${dueText})`;
}

/** หมายเหตุของเอกสารซ้ำกับข้อความท้ายเอกสารของร้าน (จอนอกข้อ 4) ⇒ พิมพ์ครั้งเดียว */
export function dedupeNotes(docNote: string | null | undefined, footerNote: string | null | undefined): { note: string | null; footer: string | null } {
  const n = (docNote ?? "").trim();
  const f = (footerNote ?? "").trim();
  if (n && f && n === f) return { note: n, footer: null };
  return { note: n || null, footer: f || null };
}

// ─────────────────── ACC T2.10 · ข้อความ "ใบกำกับภาษีนี้ออกตามมาตรา 86/4" ───────────────────
// skill §5 [V]: รายการ ม.86/4 (1) คำว่า "ใบกำกับภาษี" (2) ชื่อ ที่อยู่ เลขผู้เสียภาษีของผู้ออก (3) ชื่อ ที่อยู่ผู้ซื้อ (4) หมายเลขลำดับ
//   (5) ชื่อ ชนิด ประเภท ปริมาณ มูลค่า (6) VAT แยกชัดแจ้ง (7) วันเดือนปีที่ออก · §14 [V] ฉ.39 ข้อ 7–9: สาขาของผู้ขาย + เลข/สาขาผู้ซื้อที่จด VAT
//   ข้อความยืนยันว่าใบครบ ⇒ พิมพ์เฉพาะใบที่ครบ (AUTO) · ร้านบังคับ ALWAYS = คำเตือน TAX_INVOICE_SECTION_TEXT_FORCED · NEVER = ไม่พิมพ์
export const SECTION_864_TEXT = { TH: "ใบกำกับภาษีนี้ออกตามมาตรา 86/4 แห่งประมวลรัษฎากร", EN: "Tax invoice issued under section 86/4 of the Revenue Code" } as const;
export const SECTION_864_MODES = ["AUTO", "ALWAYS", "NEVER"] as const;
export type Section864Mode = (typeof SECTION_864_MODES)[number];

export type TaxInvoiceElements = {
  sellerName: string;
  sellerAddress: string | null;
  sellerTaxId: string | null;
  sellerBranch: string;
  buyerName: string;
  buyerAddress: string;
  buyerTaxId: string;
  buyerBranch: string;
  docNo: string | null;
  lineCount: number;
  vatShown: boolean;
};

/** รายการ ม.86/4 ที่ใบนี้ยังขาด (ว่าง = ครบ) */
export function taxInvoiceMissing(e: TaxInvoiceElements): string[] {
  const m: string[] = [];
  const blank = (v: string | null | undefined) => !v || !v.trim();
  if (blank(e.sellerName)) m.push("ชื่อผู้ออก");
  if (blank(e.sellerAddress)) m.push("ที่อยู่ผู้ออก");
  if ((e.sellerTaxId ?? "").replace(/\D/g, "").length !== 13) m.push("เลขประจำตัวผู้เสียภาษีผู้ออก");
  if (blank(e.sellerBranch)) m.push("สำนักงานใหญ่/สาขาผู้ออก");
  if (blank(e.buyerName)) m.push("ชื่อผู้ซื้อ");
  if (blank(e.buyerAddress)) m.push("ที่อยู่ผู้ซื้อ");
  if (!blank(e.buyerTaxId) && blank(e.buyerBranch)) m.push("สำนักงานใหญ่/สาขาผู้ซื้อ");
  if (blank(e.docNo)) m.push("เลขที่");
  if (e.lineCount === 0) m.push("รายการสินค้า/บริการ");
  if (!e.vatShown) m.push("จำนวนภาษีที่แยกชัดแจ้ง");
  return m;
}

/** ข้อความที่พิมพ์ (null = ไม่พิมพ์) */
export function section864Text(mode: Section864Mode, missing: readonly string[], lang: "TH" | "EN" = "TH"): string | null {
  if (mode === "NEVER") return null;
  if (mode === "ALWAYS" || missing.length === 0) return SECTION_864_TEXT[lang];
  return null;
}

/** ข้อความท้ายใบของร้านที่มีประโยค "ออกตามมาตรา 86/4" — ตัดประโยคนั้นออก (ค่าตั้ง section864 เป็นผู้ตัดสินแทน) · ส่วนอื่นของข้อความคงเดิม */
export function stripSection864(legalText: string | null | undefined): string {
  return (legalText ?? "")
    .replace(/(ใบกำกับภาษีนี้)?\s*ออกตามมาตรา\s*86\/4(\s*แห่งประมวลรัษฎากร)?/g, "")
    .replace(/\s*·\s*$/g, "")
    .replace(/^\s*·\s*/g, "")
    .trim();
}

/**
 * ACC T3 (A4) ▸ ป้ายสาขาของผู้ซื้อบนใบพิมพ์ — ผู้ซื้อไม่มีเลขผู้เสียภาษี = ไม่พิมพ์สาขา
 *   (snapshot ของผู้ซื้อไม่มีเลข ตั้งรหัส 00000 ให้เอง ⇒ เดิมพิมพ์ "สำนักงานใหญ่" ให้ผู้บริโภค ซึ่งไม่จริง ·
 *    สาขามีความหมายเฉพาะผู้ซื้อที่จด VAT — ประกาศ VAT ฉ.39 ข้อ 7, 9) ◂
 */
export function buyerBranchLabel(taxId: string | null | undefined, branchCode: string | null | undefined, branchName: string | null | undefined): string {
  if ((taxId ?? "").replace(/\D/g, "").length === 0) return "";
  const code = (branchCode ?? "").trim();
  return (branchName ?? "").trim() || (code === "00000" ? "สำนักงานใหญ่" : code ? `สาขา ${code}` : "");
}

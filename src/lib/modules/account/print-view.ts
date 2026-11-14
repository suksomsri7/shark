// print-view.ts — ACC T2.7 · ข้อมูลหน้าพิมพ์เอกสารบัญชี (server) → PrintView ของ PrintDocument.tsx
//
// รวมไว้ที่เดียว: หน้าพิมพ์ /account/print/[docId] + ข้อสอบ (qc-acc-v2-taxdoc-print · qc-acc-v2-adjust-content) เรียกตัวเดียวกัน
//   · T1.8b §4 แถวสรุป VAT ตามกลุ่มอัตรา (ไม่มี "VAT 7% ฿0.00") · คอลัมน์ VAT "—" เมื่อเอกสารไม่มี VAT
//   · T2.7 จอนอกข้อ 3 เงื่อนไขชำระเงินจริง · ข้อ 4 หมายเหตุไม่ซ้ำ · ข้อ 6 ใบลด/เพิ่มหนี้ไม่พิมพ์ครบกำหนด/ช่องทางชำระ
//   · T2.3 กล่องมูลค่าเดิม/ที่ถูก/ผลต่าง/VAT + มาตราตามชนิด (ตารางค่ากฎหมาย) + ป้ายชนิดจริงของใบเดิม
//   · T2.10 ข้อความ "ออกตามมาตรา 86/4" เฉพาะใบที่ครบ (ค่าตั้ง print.section864)
import { getPublicBranding } from "@/lib/branding/service";
import { formatThaiDateLong } from "@/lib/ui/date";
import { tenantDb } from "@/lib/core/db";
import { ADJUST_NOTE_SECTIONS, adjustGroupOfDocType, adjustReasonOf } from "@/lib/core/settings/legal/th-tax-2569";
import type { PrintAdjustBlock, PrintView } from "@/components/account-v2/PrintDocument";
import { documentPaymentChannels } from "./doc-settings";
import { EXP_DOC_LABEL } from "./expense";
import { isGroupDocType } from "./group";
import { buildPrintOptions } from "./print-options";
import { buyerBranchLabel, dedupeNotes, realPaymentTerms, section864Text, stripSection864, taxInvoiceMissing } from "./print-shared";
import { DOC_LABEL, baht, getDocument, getSettings, orgDisplayName } from "./service";
import { docVatRateGroups, vatSummaryRows } from "./totals";
import { loadPrintNotes, stripReplacementNote } from "./print-notes"; // merge T2.7 × เลน 1 (T2.8/T2.2) ◂
import { readSellerSnapshot } from "./seller-snapshot"; // ACC T2.9 ◂

type Doc = NonNullable<Awaited<ReturnType<typeof getDocument>>>;

const ADJUST_TYPES = new Set(["CREDIT_NOTE", "DEBIT_NOTE", "CREDIT_NOTE_RECEIVED", "DEBIT_NOTE_RECEIVED"]);
const LIVE = { notIn: ["DRAFT", "VOIDED", "CANCELLED"] as ("DRAFT" | "VOIDED" | "CANCELLED")[] };

const labelOf = (docType: string) => DOC_LABEL[docType as keyof typeof DOC_LABEL] ?? EXP_DOC_LABEL[docType as keyof typeof EXP_DOC_LABEL] ?? "เอกสาร";
/** ฐานก่อน VAT หลังส่วนลดทุกชั้น (= ฐานรายได้/ค่าใช้จ่ายของใบ — totals.ts: subTotal − discountAmount) */
const baseOf = (d: { subTotal: number; discountAmount: number }) => d.subTotal - d.discountAmount;

/** T2.3 ▸ กล่องเนื้อหาใบลด/เพิ่มหนี้ (pure ส่วนคิด · ฐานอ่านในตัวโหลด) */
export async function adjustBlockOf(doc: Doc): Promise<PrintAdjustBlock | null> {
  const group = adjustGroupOfDocType(doc.docType);
  if (!group || !ADJUST_TYPES.has(doc.docType)) return null;
  const isCredit = group === "CREDIT";
  const purchase = doc.docType.endsWith("_RECEIVED");
  const reason = adjustReasonOf(doc.adjustReasonCode);
  const reasonText = (doc.adjustReason ?? "").trim() || (reason && reason.code !== "OTHER" ? reason.labelTh : "");
  const difference = baseOf(doc);
  const orig = doc.sourceDocId ? await tenantDb({ tenantId: doc.tenantId, systemId: doc.systemId }).accountDocument.findFirst({ where: { id: doc.sourceDocId }, select: { id: true, docType: true, docNo: true, issueDate: true, subTotal: true, discountAmount: true } }) : null;
  let originalValue: number | null = null;
  let priorNotes = 0;
  if (orig) {
    const prior = await tenantDb({ tenantId: doc.tenantId, systemId: doc.systemId }).accountDocument.findMany({
      where: { sourceDocId: orig.id, id: { not: doc.id }, docType: { in: ["CREDIT_NOTE", "DEBIT_NOTE", "CREDIT_NOTE_RECEIVED", "DEBIT_NOTE_RECEIVED"] }, status: LIVE, OR: [{ issueDate: { lt: doc.issueDate } }, { issueDate: doc.issueDate, createdAt: { lt: doc.createdAt } }] },
      select: { docType: true, subTotal: true, discountAmount: true },
    });
    priorNotes = prior.length;
    originalValue = baseOf(orig) + prior.reduce((n, p) => n + (adjustGroupOfDocType(p.docType) === "CREDIT" ? -baseOf(p) : baseOf(p)), 0);
  }
  return {
    sectionText: ADJUST_NOTE_SECTIONS[group].sectionTh,
    // T2c A2 ▸ ศัพท์ตามกฎหมาย "เลขที่ใบกำกับภาษีเดิม" (ม.86/10 · §16) — ไม่ใช่ป้ายในระบบ "ใบกำกับภาษีขาย" · ชนิดอื่นใช้ป้ายจริงของใบเดิม ◂
    origKindLabel: orig ? (orig.docType === "TAX_INVOICE" ? "ใบกำกับภาษี" : labelOf(orig.docType)) : purchase && doc.reference ? "เอกสารของผู้ขาย" : null,
    origDocNo: orig ? orig.docNo : purchase ? doc.reference : null,
    origDate: orig ? formatThaiDateLong(orig.issueDate) : purchase && doc.vendorInvoiceDate ? formatThaiDateLong(doc.vendorInvoiceDate) : null,
    reasonText,
    originalValue,
    correctValue: originalValue === null ? null : isCredit ? originalValue - difference : originalValue + difference,
    difference,
    differenceVat: doc.vatAmount,
    priorNotes,
    isCredit,
  };
}

export type LoadedPrint = { doc: Doc; view: PrintView; section864Missing: string[] };

export async function loadPrintView(tenantId: string, systemId: string, docId: string): Promise<LoadedPrint | null> {
  const [doc, s, branding] = await Promise.all([getDocument(tenantId, systemId, docId), getSettings(tenantId, systemId), getPublicBranding(tenantId)]);
  if (!doc) return null;
  const po = buildPrintOptions(s.doc, doc.docType, s.footerNote);
  const L = po.labels;
  const en = po.language === "EN";
  const isTaxInvoice = doc.docType === "TAX_INVOICE";
  const isAdjust = ADJUST_TYPES.has(doc.docType);
  const isGroup = isGroupDocType(doc.docType);
  // จอนอกข้อ 6: ใบลด/เพิ่มหนี้ไม่มีครบกำหนดและช่องทางชำระ
  const channels = po.show.paymentChannels && !isAdjust ? await documentPaymentChannels({ tenantId, systemId }) : [];
  const snap = (doc.contactSnapshot as Record<string, unknown> | null) ?? null;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const buyerBranchCode = str(snap?.branchCode) || doc.contact?.branchCode || "";
  const buyerBranchName = str(snap?.branchName) || doc.contact?.branchName || "";
  const buyer = {
    name: str(snap?.name) || doc.contact?.name || "",
    taxId: str(snap?.taxId) || doc.contact?.taxId || "",
    address: str(snap?.address) || doc.contact?.address || "",
    branch: buyerBranchLabel(str(snap?.taxId) || doc.contact?.taxId || "", buyerBranchCode, buyerBranchName), // ACC T3 (A4) ◂
  };
  // ACC T2.9 ▸ ผู้ขาย + ข้อความท้ายใบ = ที่ตรึงไว้ตอนออก (sellerSnapshot) · ยังไม่ตรึง (ร่าง/ใบเก่า) = ค่าตั้งปัจจุบัน ◂
  const frozen = doc.status !== "DRAFT" ? readSellerSnapshot(doc.sellerSnapshot) : null;
  const sellerNow = { name: orgDisplayName(s) || "กิจการของคุณ", address: s.address, taxId: s.taxId, branch: s.branchName || (s.branchCode === "00000" ? "สำนักงานใหญ่" : s.branchCode ? `สาขา ${s.branchCode}` : ""), phone: s.phone, logoUrl: s.logoUrl ?? branding.logoUrl ?? null };
  const seller = frozen ? { name: frozen.seller.name, address: frozen.seller.address, taxId: frozen.seller.taxId, branch: frozen.seller.branch, phone: frozen.seller.phone, logoUrl: frozen.seller.logoUrl ?? branding.logoUrl ?? null } : sellerNow;
  if (frozen) {
    po.footerNote = frozen.text.footerNote;
    po.paymentTerms = frozen.text.paymentTerms;
    po.legalText = frozen.text.legalText;
  }
  const sellerBranch = seller.branch;
  const sellerName = seller.name;

  // T1.8b ▸ VAT ตามกลุ่มอัตรา · เอกสาร VAT 0 (ใบรับมัดจำ ฯลฯ) = ไม่มีแถว/คอลัมน์ "7%" (จอนอกข้อ 7)
  const noVatDoc = doc.vatMode === "NONE" || doc.vatAmount === 0;
  const groups = s.vatRegistered && !isGroup ? docVatRateGroups({ lines: doc.lines.map((l) => ({ amount: l.amount, vatRateBp: l.vatRateBp })), discountAmount: doc.discountAmount, vatMode: doc.vatMode, vatRegistered: true, vatRateBp: s.vatRateBp }) : [];
  const vatRows = vatSummaryRows(groups, po.language, doc.vatAmount)
    .filter((r) => !(r.kind === "vat" && noVatDoc && r.satang === 0))
    .map((r) => ({ ...r, text: baht(r.satang) }));
  const vatCell = (bp: number) => (!s.vatRegistered ? null : bp < 0 ? (en ? "Exempt" : "ยกเว้น") : bp === 0 ? "0%" : noVatDoc ? "—" : `${bp / 100}%`);

  const dueText = doc.dueDate ? formatThaiDateLong(doc.dueDate) : "";
  // merge (เลน 1 T2.8/T2.2) ▸ ร่าง/ได้รับเงินแล้ว/ออกแทน — บรรทัดออกแทนพิมพ์แยกเสมอ แล้วตัดออกจากหมายเหตุ (ไม่พิมพ์ซ้ำ) ◂
  const docNotes = await loadPrintNotes(doc);
  const notes = dedupeNotes(po.show.note ? stripReplacementNote(doc.note, docNotes.replacementNote) : null, po.show.note ? po.footerNote : null);
  const missing = isTaxInvoice
    ? taxInvoiceMissing({
        sellerName,
        sellerAddress: seller.address,
        sellerTaxId: seller.taxId,
        sellerBranch,
        buyerName: buyer.name,
        buyerAddress: buyer.address,
        buyerTaxId: buyer.taxId,
        buyerBranch: buyer.branch,
        docNo: doc.docNo,
        lineCount: doc.lines.length,
        vatShown: s.vatRegistered,
      })
    : [];
  // ACC T2.1 ▸ ใบกำกับเต็มรูปต้องมีที่อยู่ผู้ซื้อ (ม.86/4(3)) และเลข/สาขาของผู้ซื้อที่จด VAT (ฉ.39 ข้อ 7–9) ⇒ ปิด "ที่อยู่ลูกค้า"/"เลขผู้เสียภาษีลูกค้า"
  //   ในเทมเพลตพิมพ์ไม่มีผลกับใบกำกับภาษี (เอกสารชนิดอื่นยังซ่อนตามค่าตั้ง) — หน้าตั้งค่าบอกไว้ใต้ช่อง ◂
  if (isTaxInvoice) po.show = { ...po.show, buyerAddress: true, buyerTaxId: true };
  const view: PrintView = {
    po,
    docTitle: isGroup && doc.docType === "COMBINED_PAYMENT" ? "ใบสำคัญจ่าย (ใบรวมจ่าย)" : labelOf(doc.docType),
    docTypeTaxInvoice: isTaxInvoice,
    isGroup,
    groupLabels: en
      ? { item: L.groupItem, outstanding: L.groupOutstanding, count: L.groupCount, grandTotal: L.groupGrandTotal, unit: "" }
      : { item: "เอกสาร", outstanding: "ยอดค้างชำระ", count: "จำนวนเอกสารในรายการ", grandTotal: "รวมยอดที่ต้องชำระ", unit: "ใบ" },
    docNo: doc.docNo,
    issueDateText: formatThaiDateLong(doc.issueDate),
    dueDateText: po.show.dueDate && doc.dueDate && !isAdjust ? dueText : null,
    validUntilText: po.show.dueDate && doc.validUntil ? formatThaiDateLong(doc.validUntil) : null,
    reference: po.show.reference ? (doc.reference ?? null) : null,
    seller,
    // ACCOUNT-FIX A6 — ชื่ออังกฤษ · อีเมล · เว็บไซต์ จากข้อมูลกิจการ (ค่าปัจจุบัน แบบเดียวกับโลโก้/ตราประทับ) ขึ้นหัวเอกสาร
    sellerExtra: { nameEn: s.orgNameEn?.trim() || null, email: s.email?.trim() || null, website: s.website?.trim() || null },
    sellerFrozenAt: frozen ? formatThaiDateLong(new Date(frozen.frozenAt)) : null,
    buyer,
    lines: doc.lines.map((l) => ({
      id: l.id,
      description: l.description,
      qty: String(Number(l.qty)),
      unitName: l.unitName ?? "",
      unitPrice: baht(l.unitPrice),
      vatCell: vatCell(l.vatRateBp),
      amount: baht(l.amount),
      // ACC T2.1 ▸ ส่วนลดรายบรรทัด (B12 — ส่วนลดแสดงชัด · VAT คิดหลังส่วนลด) · ไม่มีส่วนลดสักบรรทัด = ไม่มีคอลัมน์ ◂
      discount: l.discount > 0 ? baht(l.discount) : null,
      imageUrl: l.product?.imageUrl ?? null,
      sku: l.product?.sku ?? "",
    })),
    totals: {
      subTotal: baht(doc.subTotal),
      discount: doc.discountAmount > 0 ? baht(doc.discountAmount) : null,
      deposit: doc.depositDeducted > 0 ? baht(doc.depositDeducted) : null,
      vatRows,
      grandTotal: baht(doc.grandTotal),
      grandLabel: s.vatRegistered ? L.grandTotal : L.netTotal,
    },
    note: notes.note,
    footerNote: notes.footer,
    paymentTerms: po.show.paymentTerms && po.paymentTerms && !isAdjust ? realPaymentTerms(po.paymentTerms, doc.issueDate, doc.dueDate, dueText, po.language) || null : null,
    channels: channels.map((c) => [c.bankName, c.accountNo, c.accountName].filter(Boolean).join(" · ") || c.promptpayId || c.name),
    // T2.10 ▸ ข้อความ ม.86/4 ในข้อความท้ายใบของร้าน ⇒ ให้ค่าตั้ง print.section864 ตัดสิน (ไม่พิมพ์บนใบที่ไม่ครบโดยอ้อม)
    legalText: stripSection864(po.legalText) || null,
    sectionText: isTaxInvoice && doc.status !== "DRAFT" ? section864Text(s.doc.print.section864, missing, po.language) : null,
    stampUrl: s.stampUrl,
    signatureUrl: s.signatureUrl,
    adjust: isAdjust ? await adjustBlockOf(doc) : null,
    docNotes,
    money: baht,
  };
  return { doc, view, section864Missing: missing };
}

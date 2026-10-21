// platform/etax/render.ts — ตรวจ + เรนเดอร์ XML e-Tax Invoice (P3-SKEL R11 · CD-S8) — ฟังก์ชันบริสุทธิ์ (ไม่มีนาฬิกา · ไม่มี I/O · ไม่โยน)
//
// โครงสร้าง = ส่วนย่อยขั้นต่ำของ ETDA ขมธอ. 3-2560 (CrossIndustryInvoice): ExchangedDocumentContext · ExchangedDocument {ID, Name, TypeCode, IssueDateTime} ·
//   SupplyChainTradeTransaction { ApplicableHeaderTradeAgreement {SellerTradeParty, BuyerTradeParty} · ApplicableHeaderTradeSettlement {ApplicableTradeTax ·
//   SpecifiedTradeSettlementHeaderMonetarySummation {LineTotalAmount, TaxBasisTotalAmount, TaxTotalAmount, GrandTotalAmount}} · IncludedSupplyChainTradeLineItem ×n }
// ⚠️ ผู้ให้บริการที่เจ้าของเลือก (W20) ยืนยันโปรไฟล์จริง (namespace · ลายเซ็นดิจิทัล XAdES · ช่องบังคับเพิ่ม) — เปลี่ยนที่ไฟล์นี้ไฟล์เดียว
// 🔴 import ค่าได้เฉพาะ node:* และไฟล์ในโฟลเดอร์นี้ (ข้อสอบ ET1 ตรวจก่อนโหลด) · ข้อความไทยเป็น UTF-8 ตรง (ไม่ใช้ &#…;)
import { ETAX_TYPE_CODES, type EtaxDocument, type EtaxLine, type EtaxNormalizeResult, type EtaxTypeCode } from "./types";

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);
const bad = (message: string, field?: string): EtaxNormalizeResult => (field ? { ok: false, code: "VALIDATION", message, field } : { ok: false, code: "VALIDATION", message });

/** เลขประจำตัวผู้เสียภาษี 13 หลัก + หลักตรวจ mod-11 (กรมสรรพากร) */
export function thaiTaxIdValid(id: unknown): boolean {
  if (typeof id !== "string" || !/^\d{13}$/.test(id)) return false;
  let s = 0;
  for (let i = 0; i < 12; i++) s += Number(id[i]) * (13 - i);
  return (11 - (s % 11)) % 10 === Number(id[12]);
}

const BRANCH_RE = /^\d{5}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (d: string): boolean => DATE_RE.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;

/** ตรวจ + ทำให้เป็นรูปกลาง — ข้อมูลผิดทุกแบบ = VALIDATION (ไม่โยน) */
export function normalizeEtaxDocument(raw: unknown): EtaxNormalizeResult {
  try {
    if (!isRecord(raw)) return bad("เอกสาร e-Tax ต้องเป็นออบเจกต์");
    const s = raw.seller;
    if (!isRecord(s) || !str(s.name)) return bad("ไม่มีข้อมูลผู้ขาย", "seller");
    if (!thaiTaxIdValid(str(s.taxId))) return bad("เลขประจำตัวผู้เสียภาษีของผู้ขายไม่ถูกต้อง", "seller.taxId");
    const sBranch = str(s.branch) || "00000";
    if (!BRANCH_RE.test(sBranch)) return bad("รหัสสาขาผู้ขายต้องเป็นตัวเลข 5 หลัก", "seller.branch");
    const b = raw.buyer;
    if (!isRecord(b) || !str(b.name)) return bad("ไม่มีข้อมูลผู้ซื้อ", "buyer");
    if (!thaiTaxIdValid(str(b.taxId))) return bad("เลขประจำตัวผู้เสียภาษีของผู้ซื้อไม่ถูกต้อง", "buyer.taxId");
    const bBranch = str(b.branchCode) || "00000";
    if (!BRANCH_RE.test(bBranch)) return bad("รหัสสาขาผู้ซื้อต้องเป็นตัวเลข 5 หลัก", "buyer.branchCode");
    const email = str(b.email);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad("อีเมลผู้ซื้อไม่ถูกต้อง", "buyer.email");
    const d = raw.doc;
    if (!isRecord(d)) return bad("ไม่มีหัวเอกสาร", "doc");
    if (!ETAX_TYPE_CODES.includes(d.typeCode as EtaxTypeCode)) return bad("ชนิดเอกสาร (typeCode) ต้องเป็น 388 · T03 · 81", "doc.typeCode");
    const number = str(d.number);
    if (!number || number.length > 35) return bad("เลขที่เอกสารต้องมี 1–35 ตัวอักษร", "doc.number");
    const issueDate = str(d.issueDate);
    if (!validDate(issueDate)) return bad("วันที่ออกเอกสารต้องเป็น YYYY-MM-DD", "doc.issueDate");
    const refNumber = str(d.refNumber);
    if (d.typeCode === "81" && !refNumber) return bad("ใบลดหนี้ต้องอ้างเลขเอกสารเดิม", "doc.refNumber");
    if (!Array.isArray(raw.lines) || raw.lines.length === 0 || raw.lines.length > 1000) return bad("ต้องมีรายการ 1–1000 บรรทัด", "lines");
    const lines: EtaxLine[] = [];
    for (const [i, l] of raw.lines.entries()) {
      if (!isRecord(l) || !str(l.name)) return bad(`บรรทัดที่ ${i + 1}: ไม่มีชื่อรายการ`, "lines");
      if (typeof l.qty !== "number" || !Number.isFinite(l.qty) || l.qty <= 0) return bad(`บรรทัดที่ ${i + 1}: จำนวนต้องมากกว่า 0`, "lines");
      if (!isInt(l.unitPriceSatang) || !isInt(l.amountSatang)) return bad(`บรรทัดที่ ${i + 1}: ราคา/ยอดต้องเป็นสตางค์จำนวนเต็ม`, "lines");
      lines.push({ name: str(l.name), qty: l.qty, unitPriceSatang: l.unitPriceSatang, amountSatang: l.amountSatang });
    }
    const t = raw.totals;
    if (!isRecord(t) || !isInt(t.netSatang) || !isInt(t.vatSatang) || !isInt(t.grandSatang)) return bad("ยอดรวมต้องเป็นสตางค์จำนวนเต็ม", "totals");
    if (t.vatSatang < 0 || t.grandSatang < 0) return bad("ยอดรวม/ภาษีต้องไม่ติดลบ", "totals");
    if (t.netSatang + t.vatSatang !== t.grandSatang) return bad("มูลค่าก่อนภาษี + ภาษี ≠ ยอดรวม", "totals");
    if (lines.reduce((a, l) => a + l.amountSatang, 0) !== t.grandSatang) return bad("ผลรวมรายการ ≠ ยอดรวม", "lines");
    const v = raw.vat;
    if (!isRecord(v) || !isInt(v.rateBp) || v.rateBp < 0 || v.rateBp > 10_000 || typeof v.inclusive !== "boolean") return bad("อัตราภาษีไม่ถูกต้อง", "vat");
    const doc: EtaxDocument = {
      seller: { name: str(s.name), taxId: str(s.taxId), branch: sBranch, address: str(s.address) },
      buyer: { kind: str(b.kind) || "JURISTIC", name: str(b.name), taxId: str(b.taxId), branchCode: bBranch, address: str(b.address), email },
      doc: { typeCode: d.typeCode as EtaxTypeCode, number, issueDate, ...(refNumber ? { refNumber } : {}) },
      lines,
      totals: { netSatang: t.netSatang, vatSatang: t.vatSatang, grandSatang: t.grandSatang },
      vat: { rateBp: v.rateBp, inclusive: v.inclusive },
    };
    return { ok: true, doc };
  } catch {
    return bad("เอกสาร e-Tax อ่านไม่ได้");
  }
}

const esc = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/** สตางค์ → บาท 2 ตำแหน่ง (เลขจำนวนเต็ม ไม่ผ่านทศนิยมลอยตัว) */
const baht = (satang: unknown): string => {
  const n = typeof satang === "number" && Number.isFinite(satang) ? Math.round(satang) : 0;
  const a = Math.abs(n);
  return `${n < 0 ? "-" : ""}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
};
const rate = (bp: unknown): string => baht(typeof bp === "number" ? bp : 0);

const DOC_NAME: Record<string, string> = { "388": "ใบกำกับภาษี", T03: "ใบเสร็จรับเงิน/ใบกำกับภาษี", "81": "ใบลดหนี้" };
const ROOT: Record<string, string> = { "388": "TaxInvoice_CrossIndustryInvoice", T03: "TaxInvoice_CrossIndustryInvoice", "81": "DebitCreditNote_CrossIndustryInvoice" };
const NS_RSM = "urn:etda:uncefact:data:standard:TaxInvoice_CrossIndustryInvoice:2";
const NS_RAM = "urn:etda:uncefact:data:standard:TaxInvoice_ReusableAggregateBusinessInformationEntity:2";

function party(tag: "SellerTradeParty" | "BuyerTradeParty", p: { name?: unknown; taxId?: unknown; branch?: unknown; address?: unknown; email?: unknown }, pad: string): string {
  const out = [
    `${pad}<ram:${tag}>`,
    `${pad}  <ram:Name>${esc(p.name)}</ram:Name>`,
    `${pad}  <ram:SpecifiedTaxRegistration>`,
    `${pad}    <ram:ID schemeID="TXID">${esc(`${String(p.taxId ?? "")}${String(p.branch ?? "00000")}`)}</ram:ID>`,
    `${pad}  </ram:SpecifiedTaxRegistration>`,
  ];
  if (p.email) out.push(`${pad}  <ram:URIUniversalCommunication>`, `${pad}    <ram:URIID schemeID="EM">${esc(p.email)}</ram:URIID>`, `${pad}  </ram:URIUniversalCommunication>`);
  out.push(`${pad}  <ram:PostalTradeAddress>`, `${pad}    <ram:LineOne>${esc(p.address)}</ram:LineOne>`, `${pad}    <ram:CountryID schemeID="3166-1 alpha-2">TH</ram:CountryID>`, `${pad}  </ram:PostalTradeAddress>`, `${pad}</ram:${tag}>`);
  return out.join("\n");
}

/** XML ของเอกสาร (รับรูปที่ผ่าน normalize แล้ว · ไม่ตรวจซ้ำ) — กำหนดได้: อินพุตเดียวกัน = สตริงเดียวกันทุกไบต์ */
export function renderEtaxXml(doc: EtaxDocument): string {
  const d = isRecord(doc) ? doc : ({} as EtaxDocument);
  const typeCode = String(d.doc?.typeCode ?? "388");
  const root = ROOT[typeCode] ?? ROOT["388"]!;
  const lines = Array.isArray(d.lines) ? d.lines : [];
  const x: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rsm:${root} xmlns:rsm="${NS_RSM}" xmlns:ram="${NS_RAM}">`,
    `  <rsm:ExchangedDocumentContext>`,
    `    <ram:GuidelineSpecifiedDocumentContextParameter>`,
    `      <ram:ID schemeAgencyID="ETDA" schemeVersionID="v2.0">ER3-2560</ram:ID>`,
    `    </ram:GuidelineSpecifiedDocumentContextParameter>`,
    `  </rsm:ExchangedDocumentContext>`,
    `  <rsm:ExchangedDocument>`,
    `    <ram:ID>${esc(d.doc?.number)}</ram:ID>`,
    `    <ram:Name>${esc(DOC_NAME[typeCode] ?? "")}</ram:Name>`,
    `    <ram:TypeCode>${esc(typeCode)}</ram:TypeCode>`,
    `    <ram:IssueDateTime>${esc(d.doc?.issueDate)}T00:00:00</ram:IssueDateTime>`,
    `  </rsm:ExchangedDocument>`,
    `  <rsm:SupplyChainTradeTransaction>`,
    `    <ram:ApplicableHeaderTradeAgreement>`,
    party("SellerTradeParty", { name: d.seller?.name, taxId: d.seller?.taxId, branch: d.seller?.branch, address: d.seller?.address }, "      "),
    party("BuyerTradeParty", { name: d.buyer?.name, taxId: d.buyer?.taxId, branch: d.buyer?.branchCode, address: d.buyer?.address, email: d.buyer?.email }, "      "),
    ...(d.doc?.refNumber ? [`      <ram:AdditionalReferencedDocument>`, `        <ram:IssuerAssignedID>${esc(d.doc.refNumber)}</ram:IssuerAssignedID>`, `      </ram:AdditionalReferencedDocument>`] : []),
    `    </ram:ApplicableHeaderTradeAgreement>`,
    `    <ram:ApplicableHeaderTradeDelivery/>`,
    `    <ram:ApplicableHeaderTradeSettlement>`,
    `      <ram:InvoiceCurrencyCode listID="ISO 4217 3A">THB</ram:InvoiceCurrencyCode>`,
    `      <ram:ApplicableTradeTax>`,
    `        <ram:TypeCode>VAT</ram:TypeCode>`,
    `        <ram:CalculatedRate>${rate(d.vat?.rateBp)}</ram:CalculatedRate>`,
    `        <ram:BasisAmount currencyID="THB">${baht(d.totals?.netSatang)}</ram:BasisAmount>`,
    `        <ram:CalculatedAmount currencyID="THB">${baht(d.totals?.vatSatang)}</ram:CalculatedAmount>`,
    `      </ram:ApplicableTradeTax>`,
    `      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>`,
    `        <ram:LineTotalAmount currencyID="THB">${baht(lines.reduce((a, l) => a + (typeof l?.amountSatang === "number" ? l.amountSatang : 0), 0))}</ram:LineTotalAmount>`,
    `        <ram:TaxBasisTotalAmount currencyID="THB">${baht(d.totals?.netSatang)}</ram:TaxBasisTotalAmount>`,
    `        <ram:TaxTotalAmount currencyID="THB">${baht(d.totals?.vatSatang)}</ram:TaxTotalAmount>`,
    `        <ram:GrandTotalAmount currencyID="THB">${baht(d.totals?.grandSatang)}</ram:GrandTotalAmount>`,
    `      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>`,
    `    </ram:ApplicableHeaderTradeSettlement>`,
  ];
  lines.forEach((l, i) => {
    x.push(
      `    <ram:IncludedSupplyChainTradeLineItem>`,
      `      <ram:AssociatedDocumentLineDocument>`,
      `        <ram:LineID>${i + 1}</ram:LineID>`,
      `      </ram:AssociatedDocumentLineDocument>`,
      `      <ram:SpecifiedTradeProduct>`,
      `        <ram:Name>${esc(l?.name)}</ram:Name>`,
      `      </ram:SpecifiedTradeProduct>`,
      `      <ram:SpecifiedLineTradeAgreement>`,
      `        <ram:GrossPriceProductTradePrice>`,
      `          <ram:ChargeAmount currencyID="THB">${baht(l?.unitPriceSatang)}</ram:ChargeAmount>`,
      `        </ram:GrossPriceProductTradePrice>`,
      `      </ram:SpecifiedLineTradeAgreement>`,
      `      <ram:SpecifiedLineTradeDelivery>`,
      `        <ram:BilledQuantity unitCode="EA">${esc(typeof l?.qty === "number" ? String(l.qty) : "")}</ram:BilledQuantity>`,
      `      </ram:SpecifiedLineTradeDelivery>`,
      `      <ram:SpecifiedLineTradeSettlement>`,
      `        <ram:SpecifiedTradeSettlementLineMonetarySummation>`,
      `          <ram:NetLineTotalAmount currencyID="THB">${baht(l?.amountSatang)}</ram:NetLineTotalAmount>`,
      `        </ram:SpecifiedTradeSettlementLineMonetarySummation>`,
      `      </ram:SpecifiedLineTradeSettlement>`,
      `    </ram:IncludedSupplyChainTradeLineItem>`,
    );
  });
  x.push(`  </rsm:SupplyChainTradeTransaction>`, `</rsm:${root}>`, "");
  return x.join("\n");
}

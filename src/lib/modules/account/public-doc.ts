// public-doc.ts — SEC S3a.5 ▸ หน้าใบเสนอราคาสาธารณะ `/doc/<token>` (มติเจ้าของ 7 พ.ย. 2569 แทน R-Z48) ◂
//
// ทำไมเป็น HTML ทั้งหน้าจากฟังก์ชันบริสุทธิ์ (ไม่ใช่ React server component):
//   หน้าสาธารณะต้องตอบสถานะจริง (404 token ผิด/ร้านปิดลิงก์ · 429 ยิงถี่) + header (noindex · no-referrer · no-store · CSP)
//   ซึ่ง page ของ App Router ตั้งเองไม่ได้ (บันทึกเดียวกับ /r/: "หน้า server component ตั้งสถานะ 429 ไม่ได้")
//   ⇒ route handler + เอกสาร HTML แบบเดียวกับ `pos/reports/print/html/route.ts` · ทดสอบได้โดยไม่ต้องมี next dev
// เนื้อหาตามเทมเพลตพิมพ์เดิม (`app/sys/[id]/account/print/[docId]/page.tsx`): ป้าย/ภาษา/ฟิลด์ที่แสดง/หมายเหตุ/เงื่อนไข จาก
//   `buildPrintOptions` ตัวเดียวกัน · ช่องทางชำระจาก `documentPaymentChannels` ตัวเดียวกัน · โลโก้ระบบบัญชี → โลโก้กิจการ แบบเดียวกัน
// 🔴 ความเป็นส่วนตัว: เลขผู้เสียภาษี/ตัวเลขยาว (เบอร์) ของลูกค้า ⇒ ปิดบังเหลือ 4 หลักท้าย · ข้อมูลของร้าน (ผู้ออกใบ) แสดงตามใบพิมพ์
// 🔴 ไม่ import prisma ตรง (fitness F5.1) — อ่านผ่าน service ของบัญชี

import type { AccountDocType } from "@prisma/client";
import { getPublicBranding } from "@/lib/branding/service";
import { formatThaiDateLong } from "@/lib/ui/date";
import { documentPaymentChannels, type DocChannelView } from "./doc-settings";
import { buildPrintOptions, type PrintOptions } from "./print-options";
import { DOC_LABEL, getDocument, getSettings, orgDisplayName, publicDocumentByToken } from "./service";

export type PublicDocLine = { description: string; qty: string; unitName: string; unitPrice: number; vatRateBp: number; amount: number };
export type PublicDocView = {
  docType: AccountDocType;
  title: string;
  docNo: string;
  issueDate: Date;
  validUntil: Date | null;
  reference: string | null;
  seller: { name: string; address: string | null; branch: string; taxId: string | null; phone: string | null; logoUrl: string | null };
  buyer: { name: string; address: string; taxIdMasked: string; branch: string };
  lines: PublicDocLine[];
  subTotal: number;
  discountAmount: number;
  depositDeducted: number;
  vatAmount: number;
  grandTotal: number;
  vatRegistered: boolean;
  note: string | null;
  channels: DocChannelView[];
  stampUrl: string | null;
  signatureUrl: string | null;
  po: PrintOptions;
};

/** เลขผู้เสียภาษีของลูกค้า: เหลือ 4 หลักท้าย ("0105561000013" → "xxxxxxxxx0013") · ว่าง = "" */
export function maskTaxIdPublic(raw: string | null | undefined): string {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (!d) return "";
  return d.length <= 4 ? "x".repeat(d.length) : `${"x".repeat(d.length - 4)}${d.slice(-4)}`;
}

/** ตัวเลขยาว ≥ 9 หลัก (เบอร์โทร/เลขบัตร/เลขภาษี) ในข้อความของลูกค้า ⇒ เหลือ 4 หลักท้าย · เลขบ้าน/รหัสไปรษณีย์ (สั้น) คงไว้ */
export function maskLongNumbers(text: string | null | undefined): string {
  return String(text ?? "").replace(/\+?\d[\d\s-]{7,}\d/g, (m) => {
    const d = m.replace(/\D/g, "");
    return d.length >= 9 ? `${"x".repeat(d.length - 4)}${d.slice(-4)}` : m;
  });
}

/** token → มุมมองของหน้า (null = ไม่พบ/ไม่เข้าเงื่อนไข ⇒ 404) */
export async function loadPublicDocument(token: string): Promise<PublicDocView | null> {
  const ref = await publicDocumentByToken(token);
  if (!ref) return null;
  const [doc, s, branding] = await Promise.all([getDocument(ref.tenantId, ref.systemId, ref.docId), getSettings(ref.tenantId, ref.systemId), getPublicBranding(ref.tenantId)]);
  if (!doc || !doc.docNo) return null;
  const po = buildPrintOptions(s.doc, doc.docType, s.footerNote);
  const channels = po.show.paymentChannels ? await documentPaymentChannels({ tenantId: ref.tenantId, systemId: ref.systemId }) : [];
  const snap = (doc.contactSnapshot as Record<string, unknown> | null) ?? null;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const buyerBranchCode = str(snap?.branchCode) || doc.contact?.branchCode || "";
  const buyerBranchName = str(snap?.branchName) || doc.contact?.branchName || "";
  const sellerBranch = s.branchName || (s.branchCode === "00000" ? "สำนักงานใหญ่" : s.branchCode ? `สาขา ${s.branchCode}` : "");
  return {
    docType: doc.docType,
    title: DOC_LABEL[doc.docType] ?? "เอกสาร",
    docNo: doc.docNo,
    issueDate: doc.issueDate,
    validUntil: doc.validUntil ?? null,
    reference: doc.reference ?? null,
    seller: { name: orgDisplayName(s) || "กิจการ", address: s.address, branch: sellerBranch, taxId: s.taxId, phone: s.phone, logoUrl: s.logoUrl ?? branding.logoUrl ?? null },
    buyer: {
      name: maskLongNumbers(str(snap?.name) || doc.contact?.name || ""),
      address: maskLongNumbers(str(snap?.address) || doc.contact?.address || ""),
      taxIdMasked: maskTaxIdPublic(str(snap?.taxId) || doc.contact?.taxId || ""),
      branch: buyerBranchName || (buyerBranchCode === "00000" ? "สำนักงานใหญ่" : buyerBranchCode ? `สาขา ${buyerBranchCode}` : ""),
    },
    lines: doc.lines.map((l) => ({ description: l.description, qty: String(Number(l.qty)), unitName: l.unitName ?? "", unitPrice: l.unitPrice, vatRateBp: l.vatRateBp, amount: l.amount })),
    subTotal: doc.subTotal,
    discountAmount: doc.discountAmount,
    depositDeducted: doc.depositDeducted,
    vatAmount: doc.vatAmount,
    grandTotal: doc.grandTotal,
    vatRegistered: s.vatRegistered,
    note: doc.note ? maskLongNumbers(doc.note) : null,
    channels,
    stampUrl: s.stampUrl,
    signatureUrl: s.signatureUrl,
    po,
  };
}

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
/** URL รูปที่ใส่ในหน้าได้: https:/data:image เท่านั้น (ค่าที่ร้านวางเองในตั้งค่า) */
const safeImg = (u: string | null | undefined) => (typeof u === "string" && (/^https:\/\//i.test(u) || /^data:image\//i.test(u)) ? u : null);
const money = (satang: number, en: boolean) => (satang / 100).toLocaleString(en ? "en-GB" : "th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateOf = (d: Date, en: boolean) => (en ? d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" }) : formatThaiDateLong(d));

/** ป้ายของหน้าเว็บ (นอกเหนือจากป้ายบนกระดาษของ print-options) */
const UI = {
  TH: { download: "ดาวน์โหลด PDF", print: "พิมพ์ / บันทึกเป็น PDF", readonly: "เอกสารนี้ส่งถึงคุณโดยร้าน — ดูได้อย่างเดียว", vatExempt: "ยกเว้น" },
  EN: { download: "Download PDF", print: "Print / Save as PDF", readonly: "This document was sent to you by the shop — view only", vatExempt: "Exempt" },
} as const;

/** เอกสาร HTML ทั้งหน้า (มือถือก่อน · พิมพ์ A4) — ทุกค่าจากฐานผ่าน esc() · สคริปต์เดียว = ปุ่มพิมพ์ (ผูก nonce ของ CSP) */
export function renderPublicDocumentHtml(v: PublicDocView, opts: { nonce: string; pdfHref: string }): string {
  const en = v.po.language === "EN";
  const L = v.po.labels;
  const U = UI[v.po.language];
  const show = v.po.show;
  const logo = show.logo ? safeImg(v.seller.logoUrl) : null;
  const stamp = show.stamp ? safeImg(v.stampUrl) : null;
  const sign = show.signature ? safeImg(v.signatureUrl) : null;
  const title = en && v.docType === "QUOTATION" ? "Quotation" : v.title;
  const row = (label: string, value: string, strong = false) =>
    `<div class="row${strong ? " total" : ""}"><span>${esc(label)}</span><span>฿${esc(value)}</span></div>`;
  const vatCell = (bp: number) => (bp < 0 ? U.vatExempt : bp === 0 ? "0%" : `${bp / 100}%`);
  const lines = v.lines
    .map(
      (l) => `<tr><td>${esc(l.description)}</td><td class="r">${esc(l.qty)} ${esc(l.unitName)}</td><td class="r">${esc(money(l.unitPrice, en))}</td>${v.vatRegistered ? `<td class="r">${esc(vatCell(l.vatRateBp))}</td>` : ""}<td class="r">${esc(money(l.amount, en))}</td></tr>`,
    )
    .join("");
  const channels = v.channels.length
    ? `<section class="box" data-testid="doc-channels"><div class="h">${esc(L.channels)}</div>${v.channels
        .map((c) => `<div>${esc([c.bankName, c.accountNo, c.accountName].filter(Boolean).join(" · ") || c.promptpayId || c.name)}</div>`)
        .join("")}</section>`
    : "";
  return `<!doctype html>
<html lang="${en ? "en" : "th"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>${esc(title)} ${esc(v.docNo)} · ${esc(v.seller.name)}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f4f4f5;color:#111;font:14px/1.5 -apple-system,"Segoe UI","Sarabun","Noto Sans Thai",sans-serif}
.page{max-width:720px;margin:0 auto;background:#fff;padding:20px 16px}
.top{display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;border-bottom:1px solid #ddd;padding-bottom:12px}
.seller{display:flex;gap:10px}.seller img{width:56px;height:56px;object-fit:contain}.org{font-weight:700;font-size:16px}.muted{color:#555;font-size:12px}
.doc{text-align:right}.doc .t{font-weight:700;font-size:18px}
.box{border:1px solid #ddd;border-radius:6px;padding:10px;margin-top:12px;font-size:13px}.h{font-weight:600;margin-bottom:4px}
.tbl{width:100%;overflow-x:auto;margin-top:12px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border-bottom:1px solid #e5e5e5;padding:6px 4px;text-align:left;vertical-align:top}th{border-top:1px solid #ccc}.r{text-align:right;white-space:nowrap}
.sum{margin-top:10px;margin-left:auto;max-width:280px;font-size:13px}.row{display:flex;justify-content:space-between;gap:12px}.row.total{border-top:1px solid #333;margin-top:4px;padding-top:4px;font-weight:700;font-size:15px}
.sig{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:28px;text-align:center;font-size:12px}.sig .line{border-top:1px solid #999;padding-top:4px}.sig .space{height:56px;display:flex;align-items:flex-end;justify-content:center;gap:8px}.sig img{max-height:52px}
.actions{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 4px}.btn{flex:1 1 160px;display:inline-block;text-align:center;padding:12px;border-radius:8px;border:1px solid #111;background:#111;color:#fff;text-decoration:none;font-size:14px;cursor:pointer}.btn.alt{background:#fff;color:#111}
.foot{margin-top:12px;font-size:11px;color:#777;text-align:center}
@media print{body{background:#fff}.page{max-width:none;padding:0}.no-print{display:none!important}}
</style>
</head>
<body>
<main class="page" data-testid="public-doc" data-doc-type="${esc(v.docType)}" data-lang="${en ? "EN" : "TH"}">
<div class="actions no-print"><a class="btn" data-testid="doc-download-pdf" href="${esc(opts.pdfHref)}" rel="nofollow">${esc(U.download)}</a><button type="button" class="btn alt" id="doc-print" data-testid="doc-print">${esc(U.print)}</button></div>
<header class="top">
<div class="seller">${logo ? `<img src="${esc(logo)}" alt="logo">` : ""}<div><div class="org" data-testid="doc-org">${esc(v.seller.name)}</div>${v.seller.address ? `<div class="muted">${esc(v.seller.address)}</div>` : ""}${v.seller.branch ? `<div class="muted">${esc(v.seller.branch)}</div>` : ""}${v.seller.taxId ? `<div class="muted">${esc(L.taxId)} ${esc(v.seller.taxId)}</div>` : ""}${v.seller.phone ? `<div class="muted">${esc(L.phone)} ${esc(v.seller.phone)}</div>` : ""}</div></div>
<div class="doc"><div class="t">${esc(title)}</div><div class="muted" data-testid="doc-no">${esc(L.docNo)} ${esc(v.docNo)}</div><div class="muted">${esc(L.date)} ${esc(dateOf(v.issueDate, en))}</div>${show.dueDate && v.validUntil ? `<div class="muted">${esc(L.validUntil)} ${esc(dateOf(v.validUntil, en))}</div>` : ""}${show.reference && v.reference ? `<div class="muted">${esc(L.reference)} ${esc(v.reference)}</div>` : ""}</div>
</header>
<section class="box"><div class="muted">${esc(L.buyer)}</div><div style="font-weight:600">${esc(v.buyer.name || "—")}</div>${show.buyerAddress && v.buyer.address ? `<div class="muted">${esc(v.buyer.address)}</div>` : ""}${(show.buyerTaxId && v.buyer.taxIdMasked) || v.buyer.branch ? `<div class="muted">${show.buyerTaxId && v.buyer.taxIdMasked ? `${esc(L.taxId)} ${esc(v.buyer.taxIdMasked)} ` : ""}${esc(v.buyer.branch)}</div>` : ""}</section>
<div class="tbl"><table data-testid="doc-lines"><thead><tr><th>${esc(L.item)}</th><th class="r">${esc(L.qty)}</th><th class="r">${esc(L.unitPrice)}</th>${v.vatRegistered ? `<th class="r">${esc(L.vat)}</th>` : ""}<th class="r">${esc(L.amount)}</th></tr></thead><tbody>${lines}</tbody></table></div>
<section class="sum">${row(L.subTotal, money(v.subTotal, en))}${v.discountAmount > 0 ? row(L.discount, `-${money(v.discountAmount, en)}`) : ""}${v.depositDeducted > 0 ? row(L.deposit, `-${money(v.depositDeducted, en)}`) : ""}${v.vatRegistered ? row(L.vatAmount, money(v.vatAmount, en)) : ""}<div data-testid="doc-total">${row(v.vatRegistered ? L.grandTotal : L.netTotal, money(v.grandTotal, en), true)}</div></section>
${show.note && v.note ? `<div class="muted" style="margin-top:12px">${esc(L.note)}: ${esc(v.note)}</div>` : ""}${show.note && v.po.footerNote ? `<div class="muted">${esc(v.po.footerNote)}</div>` : ""}${show.paymentTerms && v.po.paymentTerms ? `<div class="muted" data-testid="doc-terms">${esc(L.terms)}: ${esc(v.po.paymentTerms)}</div>` : ""}
${channels}
${v.po.legalText ? `<div class="muted" style="font-size:10px;margin-top:8px">${esc(v.po.legalText)}</div>` : ""}
<div class="sig"><div><div class="space">${stamp ? `<img src="${esc(stamp)}" alt="">` : ""}${sign ? `<img src="${esc(sign)}" alt="">` : ""}</div><div class="line">${esc(L.signature)}</div></div><div><div class="space"></div><div class="line">${esc(L.buyerSignature)}</div></div></div>
<p class="foot no-print">${esc(U.readonly)}</p>
</main>
<script nonce="${esc(opts.nonce)}">document.getElementById("doc-print").addEventListener("click",function(){window.print();});</script>
</body>
</html>`;
}

// ── ด่าน HTTP ของ `/doc/<token>` (route handler export ได้เฉพาะ GET/การตั้งค่า ⇒ ตัวช่วยอยู่ที่นี่) ──
export const PUBLIC_DOC_HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" } as const;
export const PUBLIC_DOC_NOT_FOUND = "ไม่พบเอกสาร หรือลิงก์นี้ถูกปิดไปแล้ว — ติดต่อร้านเพื่อขอลิงก์ใหม่";

/** IP ของผู้เรียก — รูปเดียวกับ publicClientIp ของบัญชี (x-forwarded-for ตัวแรก → x-real-ip → unknown) */
export function publicDocClientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim() || "unknown";
}

/** คำตอบที่ไม่ใช่เอกสาร — ข้อความไทยสั้น ไม่บอกใบ้ว่ามีเอกสารอยู่จริงหรือไม่ */
export function publicDocPlain(status: number, text: string, extra: Record<string, string> = {}): Response {
  return new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8", ...PUBLIC_DOC_HEADERS, ...extra } });
}

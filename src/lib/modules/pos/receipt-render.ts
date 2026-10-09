// receipt-render.ts — ข้อมูลใบเสร็จ (ชนิด + คำบรรยาย th/en) และตัวเรนเดอร์ HTML / ESC-POS (POS P1.10 · มติ R5 R6 · ภาพ 11B)
//
// 🔴 บริสุทธิ์ + ใช้ร่วม client: ห้าม import prisma / server-only / next/* / node:* / ไฟล์ฝั่งเซิร์ฟเวอร์ของ pos
//    (P1.10U import ไฟล์นี้ในเบราว์เซอร์: พรีวิว · WebUSB/Bluetooth · rasterize ภาษาไทยด้วย canvas)
// 🔴 ไม่มี Date.now() / new Date() ไม่มีอาร์กิวเมนต์ / Math.random() — ทุกอย่างมาจาก payload ⇒ เรียกซ้ำได้ผลเดิมทุกไบต์
// 🔴 คำบรรยายทุกคำมาจาก payload.labels[locale] (en = ไม่มีอักษรไทยเลย) · ข้อมูลร้าน/สินค้าพิมพ์ตามที่เก็บ

// ═══════════════════ ชนิดข้อมูล (สัญญา R5) ═══════════════════
export type ReceiptDocType = "SALE" | "REFUND";
// POS P1.13 ▸ R7: TAX_INVOICE_FULL = บิลที่ออกใบกำกับภาษีเต็มรูปแล้ว (สลิปเป็นใบเสร็จ + "ออกใบกำกับภาษีเต็มรูปแล้ว เลขที่ …" · ไม่ใช่หัวใบกำกับอย่างย่อ) ◂
export type ReceiptKind = "TAX_INVOICE_ABB" | "TAX_INVOICE_FULL" | "RECEIPT";
export type ReceiptPayType = "CASH" | "TRANSFER" | "PROMPTPAY" | "DEPOSIT" | "ROOM_CHARGE" | "CARD";
/** สถานะบิล (PosSale.status · แก้รอบ 1 F2) — VOIDED = ประทับ "ยกเลิก / VOID" · REFUNDED พิมพ์ปกติ (ใบลดหนี้แยก · P1.16) */
export type ReceiptSaleStatus = "PAID" | "VOIDED" | "REFUNDED";

export type ReceiptLabels = {
  receipt: string;
  taxInvoiceAbb: string;
  refund: string;
  vatIncluded: string;
  copy: string;
  voided: string;
  taxId: string;
  branchNo: string;
  headOffice: string;
  posRegNo: string;
  phone: string;
  docNo: string;
  date: string;
  cashier: string;
  shift: string;
  refDoc: string;
  items: string;
  subtotal: string;
  lineDiscount: string;
  billDiscount: string;
  coupon: string;
  tierDiscount: string;
  serviceCharge: string;
  grandTotal: string;
  vatBase: string;
  vat: string;
  tip: string;
  tendered: string;
  change: string;
  reference: string;
  member: string;
  tier: string;
  pointEarned: string;
  pointBalance: string;
  note: string;
  weight: string;
  fullTaxInvoiceHint: string;
  /** POS P1.13 ▸ R7 ◂ */
  fullTaxInvoiceIssued: string;
  eReceipt: string;
  pay: Record<ReceiptPayType, string>;
};

export type ReceiptLine = {
  name: string;
  qty: number;
  /** ราคาต่อหน่วยรวมตัวเลือกแล้ว (สตางค์) */
  unitPriceSatang: number;
  lineTotalSatang: number;
  discountSatang: number;
  options: string[];
  note?: string;
  weightGrams?: number;
};
export type ReceiptPayment = { type: ReceiptPayType | string; amountSatang: number; tenderedSatang?: number; changeSatang?: number; reference?: string };

export type ReceiptPayload = {
  docType: ReceiptDocType;
  kind: ReceiptKind;
  status: ReceiptSaleStatus;
  copy: boolean;
  /** ขนาดกระดาษเลือกตอนเรนเดอร์ (ค่าตั้งของเครื่อง) — payload ไม่ผูก */
  paper: null;
  shop: { name: string; branchName: string; address: string; phone: string; taxId?: string; branchNo?: string; logoUrl?: string };
  device: { posRegNo?: string; name?: string };
  /** fullTaxInvoiceNo = เลขใบกำกับภาษีเต็มรูป (kind TAX_INVOICE_FULL · P1.13) */
  doc: { receiptNo: string; issuedAt: string; cashierName?: string; shiftNo?: number; refReceiptNo?: string; fullTaxInvoiceNo?: string };
  lines: ReceiptLine[];
  totals: {
    /** Σ qty × ราคาต่อหน่วย (ก่อนส่วนลดรายการ) */
    subtotalSatang: number;
    lineDiscountSatang: number;
    billDiscountSatang: number;
    couponDiscountSatang: number;
    couponCode?: string;
    tierDiscountSatang: number;
    /**
     * POS P1.12 (R15): สิทธิ์สมาชิกที่ใช้กับบิล (สำเนา PosSale.memberBenefits · ไม่รวมคูปอง) — มีเมื่อบิลมีสำเนา ·
     * billDiscountSatang = discount − คูปอง − Σ บรรทัดนี้ · ไม่มี = บิลเก่า (ส่วนลดระดับอยู่ที่ tierDiscountSatang)
     */
    memberBenefits?: { kind: string; label: string; discountSatang: number }[];
    serviceChargeSatang: number;
    grandTotalSatang: number;
    vatBaseSatang: number;
    vatSatang: number;
    vatRateBp: number;
    tipSatang: number;
  };
  payments: ReceiptPayment[];
  /** POS P1.12 (R15): ชื่อ/รหัส/เบอร์ปิดบัง/ระดับ จากสำเนาตอนขาย (บิลเก่า = ข้อมูลสด) · pointBalance = ยอดสดของระบบแต้มของสาขา */
  member?: { name: string; memberCode?: string; phoneMasked?: string; tierName?: string; pointEarned: number; pointBalance?: number };
  footer: { text: string; qrEReceiptUrl: string | null; fullTaxInvoiceHint: boolean };
  labels: { th: ReceiptLabels; en: ReceiptLabels };
  /** POS P1.18 ▸ R12 มติ Q7: ภาษาที่ "พิมพ์" = ค่าตั้งของระบบ POS (settings.pos.receiptLocale · ปริยาย th) — ภาษาจอของแคชเชียร์ไม่ตัดสิน ◂ */
  printLocale?: "th" | "en";
};

// ═══════════════════ คำบรรยาย (ชุดคีย์เดียวกันทั้งสองภาษา) ═══════════════════
export const RECEIPT_LABELS: { readonly th: ReceiptLabels; readonly en: ReceiptLabels } = {
  th: {
    receipt: "ใบเสร็จรับเงิน",
    taxInvoiceAbb: "ใบกำกับภาษีอย่างย่อ",
    refund: "ใบลดหนี้ / ใบคืนเงิน",
    vatIncluded: "ราคารวมภาษีมูลค่าเพิ่มแล้ว",
    copy: "สำเนา",
    voided: "ยกเลิก / VOID",
    taxId: "เลขประจำตัวผู้เสียภาษี",
    branchNo: "สาขาที่",
    headOffice: "สำนักงานใหญ่",
    posRegNo: "เลขเครื่อง POS",
    phone: "โทร",
    docNo: "เลขที่",
    date: "วันที่",
    cashier: "แคชเชียร์",
    shift: "กะ",
    refDoc: "อ้างอิง",
    items: "รายการ",
    subtotal: "รวม",
    lineDiscount: "ส่วนลดรายการ",
    billDiscount: "ส่วนลดท้ายบิล",
    coupon: "คูปอง",
    tierDiscount: "ส่วนลดสมาชิก",
    serviceCharge: "ค่าบริการ",
    grandTotal: "ยอดสุทธิ",
    vatBase: "มูลค่าก่อนภาษี",
    vat: "ภาษีมูลค่าเพิ่ม",
    tip: "ทิป",
    tendered: "รับเงิน",
    change: "เงินทอน",
    reference: "อ้างอิง",
    member: "สมาชิก",
    tier: "ระดับ",
    pointEarned: "แต้มที่ได้รับ",
    pointBalance: "แต้มคงเหลือ",
    note: "หมายเหตุ",
    weight: "น้ำหนัก",
    fullTaxInvoiceHint: "ขอใบกำกับเต็มรูปได้ภายใน 7 วัน",
    fullTaxInvoiceIssued: "ออกใบกำกับภาษีเต็มรูปแล้ว เลขที่",
    eReceipt: "สแกนรับใบเสร็จอิเล็กทรอนิกส์",
    pay: { CASH: "เงินสด", TRANSFER: "โอนเงิน", PROMPTPAY: "พร้อมเพย์", DEPOSIT: "มัดจำ", ROOM_CHARGE: "ลงบัญชีห้องพัก", CARD: "บัตร" },
  },
  en: {
    receipt: "RECEIPT",
    taxInvoiceAbb: "ABBREVIATED TAX INVOICE",
    refund: "CREDIT NOTE / REFUND",
    vatIncluded: "VAT included",
    copy: "COPY",
    voided: "VOID",
    taxId: "Tax ID",
    branchNo: "Branch",
    headOffice: "Head office",
    posRegNo: "POS No.",
    phone: "Tel",
    docNo: "No.",
    date: "Date",
    cashier: "Cashier",
    shift: "Shift",
    refDoc: "Ref.",
    items: "items",
    subtotal: "Subtotal",
    lineDiscount: "Item discount",
    billDiscount: "Bill discount",
    coupon: "Coupon",
    tierDiscount: "Member discount",
    serviceCharge: "Service charge",
    grandTotal: "TOTAL",
    vatBase: "Before VAT",
    vat: "VAT",
    tip: "Tip",
    tendered: "Received",
    change: "Change",
    reference: "Ref.",
    member: "Member",
    tier: "Tier",
    pointEarned: "Points earned",
    pointBalance: "Points balance",
    note: "Note",
    weight: "Weight",
    fullTaxInvoiceHint: "Full tax invoice available on request within 7 days",
    fullTaxInvoiceIssued: "Full tax invoice issued, no.",
    eReceipt: "Scan for e-receipt",
    pay: { CASH: "Cash", TRANSFER: "Transfer", PROMPTPAY: "PromptPay", DEPOSIT: "Deposit", ROOM_CHARGE: "Room charge", CARD: "Card" },
  },
};

// ═══════════════════ ข้อความปฏิเสธของ receipt-actions (แก้รอบ 1 F11) ═══════════════════
// คีย์อยู่ใต้ `pos.receipt` (ไม่ใช่ pos.register) — แยกจาก REFUSAL_KEY ของ register-shared เพราะที่นั่น INTERNAL = errors.unknown ของหน้าขาย
// จอห้ามแสดง message ไทยของเซิร์ฟเวอร์ · รหัสที่ไม่รู้จัก = errors.internal
const RECEIPT_REFUSAL_KEY: Readonly<Record<string, string>> = {
  SALE_NOT_FOUND: "errors.saleNotFound",
  PERMISSION_DENIED: "errors.permissionDenied",
  INTERNAL: "errors.internal",
  // POS P1.11 ▸ ใบเสร็จออนไลน์ / ส่งใบเสร็จ / แจ้งปัญหา / ขอใบกำกับเต็มรูป / รีวิว (receipt-public-shared.ts) ◂
  VALIDATION: "errors.validation",
  RATE_LIMITED: "errors.rateLimited",
  TOKEN_NOT_FOUND: "public.errors.tokenNotFound",
  NO_MEMBER: "public.errors.noMember",
  ALREADY_REVIEWED: "public.errors.alreadyReviewed",
  REVIEW_EXPIRED: "public.errors.reviewExpired",
  NOT_ELIGIBLE: "taxInvoice.errors.notEligible",
  ALREADY_REQUESTED: "taxInvoice.errors.alreadyRequested",
  SALE_VOIDED: "send.errors.saleVoided",
  NO_LINE_IDENTITY: "send.errors.noLineIdentity",
  NO_EMAIL: "send.errors.noEmail",
  SEND_FAILED: "send.errors.sendFailed",
};
/** รหัสปฏิเสธของ action ใบเสร็จทุกตัว (receiptPayload/reprint · P1.11 ส่งใบเสร็จ + หน้าใบเสร็จออนไลน์) → คีย์ข้อความใต้ `pos.receipt` */
export function receiptRefusalMessageKey(code: string): string {
  return Object.prototype.hasOwnProperty.call(RECEIPT_REFUSAL_KEY, code) ? RECEIPT_REFUSAL_KEY[code]! : "errors.internal";
}

// ═══════════════════ ตัวช่วยร่วม (บริสุทธิ์) ═══════════════════
type Locale = "th" | "en";
const labelsOf = (p: ReceiptPayload, locale: Locale): ReceiptLabels => (locale === "en" ? p.labels?.en : p.labels?.th) ?? RECEIPT_LABELS[locale];

/** สตางค์ → "1,234.00" (ติดลบ = "-1,234.00") */
export function formatSatang(satang: number): string {
  const n = Number.isFinite(satang) ? Math.trunc(satang) : 0;
  const abs = Math.abs(n);
  const baht = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${n < 0 ? "-" : ""}${baht}.${String(abs % 100).padStart(2, "0")}`;
}

/** วันเวลาออกเอกสาร (ISO) → เวลาไทย dd/mm/yyyy HH:MM (th = พ.ศ.) — ไม่อ่านนาฬิกาเครื่อง ไม่พึ่ง locale ของ runtime */
export function formatReceiptDate(iso: string, locale: Locale): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return String(iso ?? "");
  const d = new Date(ms + 7 * 3_600_000);
  const p2 = (v: number) => String(v).padStart(2, "0");
  const year = d.getUTCFullYear() + (locale === "th" ? 543 : 0);
  return `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}/${year} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}

const HEAD_OFFICE_BRANCH = "00000";
const qtyText = (n: number) => String(n);
const weightText = (g: number) => `${(g / 1000).toFixed(3)} kg`;
const vatRateText = (bp: number) => `${bp % 100 === 0 ? String(bp / 100) : (bp / 100).toFixed(2)}%`;
const payLabel = (L: ReceiptLabels, t: string) => (L.pay as Record<string, string>)[t] ?? t;
const titleOf = (p: ReceiptPayload, L: ReceiptLabels) => (p.docType === "REFUND" ? L.refund : p.kind === "TAX_INVOICE_ABB" ? L.taxInvoiceAbb : L.receipt);
const itemCount = (p: ReceiptPayload) => p.lines.reduce((t, l) => t + (l.weightGrams ? 1 : l.qty), 0);
const branchText = (L: ReceiptLabels, branchNo: string) => (branchNo === HEAD_OFFICE_BRANCH ? L.headOffice : `${L.branchNo} ${branchNo}`);

/** แถวยอด (ป้าย · จำนวนเงิน · ลบ?) ตามลำดับภาพ 11B — ใช้ร่วม HTML/ESC-POS · ศูนย์ไม่พิมพ์ (CD4 ทิป · CD5 คูปอง) */
function totalRows(p: ReceiptPayload, L: ReceiptLabels): { label: string; satang: number; minus?: boolean; grand?: boolean }[] {
  const t = p.totals;
  const rows: { label: string; satang: number; minus?: boolean; grand?: boolean }[] = [
    { label: `${L.subtotal} (${itemCount(p)} ${L.items})`, satang: t.subtotalSatang },
  ];
  if (t.lineDiscountSatang > 0) rows.push({ label: L.lineDiscount, satang: t.lineDiscountSatang, minus: true });
  if (t.billDiscountSatang > 0) rows.push({ label: L.billDiscount, satang: t.billDiscountSatang, minus: true });
  if (t.couponDiscountSatang > 0) rows.push({ label: t.couponCode ? `${L.coupon} ${t.couponCode}` : L.coupon, satang: t.couponDiscountSatang, minus: true });
  // POS P1.12 ▸ R15: สิทธิ์สมาชิกแยกบรรทัด (ระดับ · ว่อชเชอร์ · แต้ม) เมื่อบิลมีสำเนา — ระดับใช้ป้ายเดิม · บิลเก่า = แถวส่วนลดระดับเดิม ◂
  if (t.memberBenefits && t.memberBenefits.length) {
    for (const b of t.memberBenefits) if (b.discountSatang > 0) rows.push({ label: b.kind === "TIER" ? L.tierDiscount : b.label, satang: b.discountSatang, minus: true });
  } else if (t.tierDiscountSatang > 0) rows.push({ label: L.tierDiscount, satang: t.tierDiscountSatang, minus: true });
  if (t.serviceChargeSatang > 0) rows.push({ label: L.serviceCharge, satang: t.serviceChargeSatang });
  rows.push({ label: L.grandTotal, satang: t.grandTotalSatang, grand: true });
  return rows;
}
function vatRows(p: ReceiptPayload, L: ReceiptLabels): { label: string; satang: number }[] {
  if (p.kind !== "TAX_INVOICE_ABB" && p.kind !== "TAX_INVOICE_FULL") return [];
  return [
    { label: L.vatBase, satang: p.totals.vatBaseSatang },
    { label: `${L.vat} ${vatRateText(p.totals.vatRateBp)}`, satang: p.totals.vatSatang },
  ];
}

// ═══════════════════ HTML (R6 · พิมพ์ผ่านเบราว์เซอร์ / พรีวิว) ═══════════════════
export type RenderHtmlOptions = { paper: "58" | "80"; locale: Locale };

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
const row = (label: string, value: string, cls = "") => `<div class="row${cls ? ` ${cls}` : ""}"><span class="l">${esc(label)}</span> <span class="r">${esc(value)}</span></div>`;
const line = (text: string, cls = "") => `<div class="${cls || "t"}">${esc(text)}</div>`;

/**
 * ใบเสร็จเป็น HTML (inline CSS · @page กว้าง 58/80 มม. · ดำบนขาว) — ส่วนตามลำดับภาพ 11B พร้อม `data-section`:
 * header → title → doc → lines → totals → payments → member (มีสมาชิก) → footer · สำเนา = ประทับ labels.copy
 */
export function renderReceiptHtml(payload: ReceiptPayload, opts: RenderHtmlOptions): string {
  const p = payload;
  const locale: Locale = opts?.locale === "en" ? "en" : "th";
  const paper = opts?.paper === "58" ? "58" : "80";
  const L = labelsOf(p, locale);
  const out: string[] = [];
  const css = [
    // F5: @page size ต้องเป็นความยาวจริง (auto ใช้ไม่ได้) — ม้วนกระดาษ = ยาว 297 มม. · ความกว้างบังคับซ้ำใน @media print
    `@page { size: ${paper}mm 297mm; margin: 0 }`,
    `@media print { html, body { width: ${paper}mm } }`,
    `html, body { margin: 0; padding: 0; background: #fff; color: #000 }`,
    `body { width: ${paper}mm; font-family: system-ui, -apple-system, Sarabun, Tahoma, sans-serif; font-size: ${paper === "58" ? 11 : 12}px; line-height: 1.35 }`,
    `.receipt { box-sizing: border-box; width: ${paper}mm; padding: 3mm ${paper === "58" ? 2 : 3}mm; position: relative }`,
    `section { border-bottom: 1px dashed #000; padding: 1.5mm 0 }`,
    `section:last-child { border-bottom: 0 }`,
    `.c { text-align: center } .b { font-weight: 700 } .s { font-size: 0.9em }`,
    `.row { display: flex; justify-content: space-between; gap: 2mm } .row .r { text-align: right; white-space: nowrap }`,
    `.opt { padding-left: 4mm } .grand { font-size: 1.35em; font-weight: 700 }`,
    `.logo { display: block; margin: 0 auto 1mm; max-width: 60%; max-height: 18mm }`,
    `.stamp { margin-top: 1mm; display: inline-block; border: 2px solid #000; padding: 0 2mm; font-weight: 700; letter-spacing: 1px }`,
    `.mark { position: absolute; top: 40%; left: 0; right: 0; text-align: center; font-size: 28px; font-weight: 700; opacity: 0.12; transform: rotate(-20deg); pointer-events: none }`,
  ].join("\n");
  out.push(`<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><title>${esc(`${titleOf(p, L)} ${p.doc?.receiptNo ?? ""}`)}</title><style>\n${css}\n</style></head><body>`);
  out.push(`<div class="receipt paper-${paper}">`);
  if (p.copy) out.push(`<div class="mark" aria-hidden="true">${esc(L.copy)}</div>`);

  // header
  const h: string[] = [];
  if (p.shop.logoUrl) h.push(`<img class="logo" src="${esc(p.shop.logoUrl)}" alt="">`);
  h.push(line(p.shop.name, "c b"));
  if (p.shop.branchName) h.push(line(p.shop.branchName, "c"));
  if (p.shop.address) h.push(line(p.shop.address, "c s"));
  if (p.shop.phone) h.push(line(`${L.phone} ${p.shop.phone}`, "c s"));
  if (p.shop.taxId) h.push(line(`${L.taxId} ${p.shop.taxId}`, "c s"));
  if (p.shop.branchNo) h.push(line(branchText(L, p.shop.branchNo), "c s"));
  const dev = [p.device?.posRegNo ? `${L.posRegNo} ${p.device.posRegNo}` : "", p.device?.name ?? ""].filter(Boolean).join(" · ");
  if (dev) h.push(line(dev, "c s"));
  out.push(`<section data-section="header">${h.join("")}</section>`);

  // title
  const ti: string[] = [line(titleOf(p, L), "c b")];
  if (p.kind === "TAX_INVOICE_ABB" || p.kind === "TAX_INVOICE_FULL") ti.push(line(L.vatIncluded, "c s"));
  if (p.kind === "TAX_INVOICE_FULL" && p.doc.fullTaxInvoiceNo) ti.push(line(`${L.fullTaxInvoiceIssued} ${p.doc.fullTaxInvoiceNo}`, "c s")); // POS P1.13 ▸ R7 ◂
  if (p.status === "VOIDED") ti.push(`<div class="c"><span class="stamp void">${esc(L.voided)}</span></div>`);
  if (p.copy) ti.push(`<div class="c"><span class="stamp">${esc(L.copy)}</span></div>`);
  out.push(`<section data-section="title">${ti.join("")}</section>`);

  // doc
  const d: string[] = [row(L.docNo, p.doc.receiptNo), row(L.date, formatReceiptDate(p.doc.issuedAt, locale))];
  if (p.doc.cashierName) d.push(row(L.cashier, p.doc.cashierName));
  if (p.doc.shiftNo !== undefined && p.doc.shiftNo !== null) d.push(row(L.shift, `#${p.doc.shiftNo}`));
  if (p.doc.refReceiptNo) d.push(row(L.refDoc, p.doc.refReceiptNo));
  out.push(`<section data-section="doc">${d.join("")}</section>`);

  // lines
  const ls: string[] = [];
  for (const l of p.lines) {
    ls.push(line(l.name, "b"));
    const qty = l.weightGrams ? `${L.weight} ${weightText(l.weightGrams)}` : `${qtyText(l.qty)} x ${formatSatang(l.unitPriceSatang)}`;
    ls.push(row(qty, formatSatang(l.qty * l.unitPriceSatang), "opt"));
    for (const o of l.options ?? []) ls.push(line(`+ ${o}`, "opt s"));
    if (l.note) ls.push(line(`${L.note}: ${l.note}`, "opt s"));
    if (l.discountSatang > 0) ls.push(row(L.lineDiscount, `−${formatSatang(l.discountSatang)}`, "opt"));
  }
  out.push(`<section data-section="lines">${ls.join("")}</section>`);

  // totals
  const tt: string[] = [];
  for (const r of totalRows(p, L)) tt.push(row(r.label, `${r.minus ? "−" : ""}${formatSatang(r.satang)}`, r.grand ? "grand" : ""));
  for (const r of vatRows(p, L)) tt.push(row(r.label, formatSatang(r.satang), "s"));
  if (p.totals.tipSatang > 0) tt.push(row(L.tip, formatSatang(p.totals.tipSatang)));
  out.push(`<section data-section="totals">${tt.join("")}</section>`);

  // payments
  const pm: string[] = [];
  for (const x of p.payments) {
    pm.push(row(payLabel(L, x.type), formatSatang(x.amountSatang)));
    if (x.tenderedSatang !== undefined && x.tenderedSatang !== null) pm.push(row(L.tendered, formatSatang(x.tenderedSatang), "opt"));
    if (x.changeSatang !== undefined && x.changeSatang !== null) pm.push(row(L.change, formatSatang(x.changeSatang), "opt"));
    if (x.reference) pm.push(row(L.reference, x.reference, "opt s"));
  }
  out.push(`<section data-section="payments">${pm.join("")}</section>`);

  // member
  if (p.member) {
    const m: string[] = [row(L.member, p.member.name)];
    if (p.member.tierName) m.push(row(L.tier, p.member.tierName));
    m.push(row(L.pointEarned, String(p.member.pointEarned)));
    if (p.member.pointBalance !== undefined && p.member.pointBalance !== null) m.push(row(L.pointBalance, String(p.member.pointBalance)));
    out.push(`<section data-section="member">${m.join("")}</section>`);
  }

  // footer
  const f: string[] = [];
  if (p.footer.text) f.push(line(p.footer.text, "c"));
  if (p.footer.qrEReceiptUrl) f.push(`<div class="c s qr" data-qr="${esc(p.footer.qrEReceiptUrl)}">${esc(L.eReceipt)}</div>`);
  if (p.footer.fullTaxInvoiceHint) f.push(line(L.fullTaxInvoiceHint, "c s"));
  out.push(`<section data-section="footer">${f.join("")}</section>`);

  out.push(`</div></body></html>`);
  return out.join("\n");
}

// ═══════════════════ ESC/POS (R6 · เครื่องพิมพ์ความร้อน 58/80 มม.) ═══════════════════
export type EscPosOptions = {
  paper: "58" | "80";
  drawerKick: boolean;
  thaiText: "raster" | "tis620";
  cut?: boolean;
  /** ESC t n ของโค้ดเพจภาษาไทย (TIS-620/CP874) — ต่างกันตามยี่ห้อ · ค่าปริยาย 255 */
  codePage?: number;
  /** ภาษาของคำบรรยาย (ปริยาย th) */
  locale?: Locale;
};
/** ช่อง raster ของบรรทัดภาษาไทย: client วาดข้อความด้วย canvas แล้วแทนที่ `length` ไบต์ที่ `offset` ด้วยคำสั่ง GS v 0 ตัวจริง */
export type EscPosRasterSlot = { offset: number; length: number; text: string; cols: number; align: "left" | "center" | "right"; bold: boolean; big: boolean };
export type EscPosResult = { bytes: Uint8Array; rasterSlots: EscPosRasterSlot[] };

const COLS: Record<"58" | "80", number> = { "58": 32, "80": 48 };
// F6: ช่วงเต็ม U+0E01–U+0E5B (รวม ฿ U+0E3F) — อักษรนอก ASCII อื่น (ละตินมีเครื่องหมาย/CJK/อีโมจิ) ยังเป็น "?"
const THAI_RE = /[ก-๛]/;
/** สระบน/ล่าง วรรณยุกต์ (กว้าง 0 คอลัมน์ — พิมพ์ซ้อนตัวหน้า) */
const isCombining = (cp: number) => cp === 0x0e31 || (cp >= 0x0e34 && cp <= 0x0e3a) || (cp >= 0x0e47 && cp <= 0x0e4e);
/** ความกว้างคอลัมน์ของข้อความ (อักษรผสมไทย = 0) */
export function receiptColumns(s: string): number {
  let w = 0;
  for (const ch of s) w += isCombining(ch.codePointAt(0) ?? 0) ? 0 : 1;
  return w;
}
/** ตัดเป็นกลุ่มอักษร (ตัวหลัก + อักษรผสมที่ตามมา) — ห้ามแยกวรรณยุกต์ออกจากตัวหน้า */
function clusters(s: string): string[] {
  const out: string[] = [];
  // สระหน้า (เ แ โ ใ ไ) ไม่อยู่ท้ายบรรทัดโดดเดี่ยว — ติดไปกับพยัญชนะตัวถัดไป
  const leading = (c: string) => /^[\u0E40-\u0E44]$/.test(c);
  for (const ch of s) {
    const last = out.length ? out[out.length - 1]! : "";
    if (out.length && (isCombining(ch.codePointAt(0) ?? 0) || leading(last))) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
}
/** ตัดบรรทัดตามความกว้างคอลัมน์ — ตัดที่ช่องว่างก่อน · คำยาวเกินบรรทัดตัดตามกลุ่มอักษร */
function wrap(text: string, width: number): string[] {
  const raw = String(text ?? "");
  // ย่อหน้า (ช่องว่างนำหน้า) คงไว้ทุกบรรทัดที่ตัด — ตราบที่ยังเหลือที่ให้ข้อความ
  const lead = (/^ */.exec(raw)?.[0] ?? "").slice(0, Math.max(0, width - 8));
  if (lead) return wrap(raw.trim(), width - lead.length).map((l) => lead + l);
  const src = raw.replace(/\s+/g, " ").trim();
  if (!src) return [];
  const lines: string[] = [];
  let cur = "";
  for (const word of src.split(" ")) {
    const candidate = cur ? `${cur} ${word}` : word;
    if (receiptColumns(candidate) <= width) {
      cur = candidate;
      continue;
    }
    if (cur) lines.push(cur);
    cur = "";
    let piece = "";
    for (const c of clusters(word)) {
      if (receiptColumns(piece + c) > width) {
        lines.push(piece);
        piece = "";
      }
      piece += c;
    }
    cur = piece;
  }
  if (cur) lines.push(cur);
  return lines;
}
/** ป้ายชิดซ้าย + ค่าชิดขวา กว้างพอดี width — ไม่พอ = ป้ายขึ้นบรรทัดก่อน ค่าชิดขวาบรรทัดถัดไป */
function pair(left: string, right: string, width: number): string[] {
  const r = String(right ?? "");
  const rw = receiptColumns(r);
  if (!r) return wrap(left, width);
  const ls = wrap(left, width);
  const last = ls.length ? ls[ls.length - 1]! : "";
  if (receiptColumns(last) + 1 + rw <= width) {
    const merged = last + " ".repeat(width - receiptColumns(last) - rw) + r;
    return ls.length ? [...ls.slice(0, -1), merged] : [merged];
  }
  if (rw > width) return [...ls, ...wrap(r, width)];
  return [...ls, " ".repeat(width - rw) + r];
}

type PLine = { text: string; align: "left" | "center" | "right"; bold?: boolean; big?: boolean } | { rule: true };

/** ข้อความ → TIS-620 (ASCII ตรงตัว · ไทย U+0E01–U+0E5B → 0xA1–0xFB · อื่น = "?") */
function tis620(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0x3f;
    if (cp >= 0x20 && cp <= 0x7e) out.push(cp);
    else if (cp >= 0x0e01 && cp <= 0x0e5b) out.push(cp - 0x0e00 + 0xa0);
    else out.push(0x3f);
  }
  return out;
}
/** ข้อความ → ASCII (อื่น = "?") — ใช้กับบรรทัดที่ไม่มีอักษรไทยในโหมด raster */
function ascii(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0x3f;
    out.push(cp >= 0x20 && cp <= 0x7e ? cp : 0x3f);
  }
  return out;
}

/** เค้าโครงบรรทัดของใบเสร็จ (ลำดับเดียวกับ HTML) — ทุกบรรทัดกว้าง ≤ cols (ตัวใหญ่ ≤ cols/2) */
function layout(p: ReceiptPayload, L: ReceiptLabels, cols: number, locale: Locale): PLine[] {
  const out: PLine[] = [];
  const add = (texts: string[], align: "left" | "center" | "right" = "left", bold = false, big = false) => {
    for (const text of texts) out.push({ text, align, bold, big });
  };
  const rule = () => out.push({ rule: true });
  const ind = "  ";
  // header
  add(wrap(p.shop.name, cols), "center", true);
  if (p.shop.branchName) add(wrap(p.shop.branchName, cols), "center");
  if (p.shop.address) add(wrap(p.shop.address, cols), "center");
  if (p.shop.phone) add(wrap(`${L.phone} ${p.shop.phone}`, cols), "center");
  if (p.shop.taxId) add(wrap(`${L.taxId} ${p.shop.taxId}`, cols), "center");
  if (p.shop.branchNo) add(wrap(branchText(L, p.shop.branchNo), cols), "center");
  if (p.device?.posRegNo) add(wrap(`${L.posRegNo} ${p.device.posRegNo}`, cols), "center");
  rule();
  // title
  add(wrap(titleOf(p, L), cols), "center", true);
  if (p.kind === "TAX_INVOICE_ABB" || p.kind === "TAX_INVOICE_FULL") add(wrap(L.vatIncluded, cols), "center");
  if (p.kind === "TAX_INVOICE_FULL" && p.doc.fullTaxInvoiceNo) add(wrap(`${L.fullTaxInvoiceIssued} ${p.doc.fullTaxInvoiceNo}`, cols), "center"); // POS P1.13 ▸ R7 ◂
  if (p.status === "VOIDED") add(wrap(`*** ${L.voided} ***`, cols), "center", true);
  if (p.copy) add(wrap(`*** ${L.copy} ***`, cols), "center", true);
  rule();
  // doc
  add(pair(L.docNo, p.doc.receiptNo, cols));
  add(pair(L.date, formatReceiptDate(p.doc.issuedAt, locale), cols));
  if (p.doc.cashierName) add(pair(L.cashier, p.doc.cashierName, cols));
  if (p.doc.shiftNo !== undefined && p.doc.shiftNo !== null) add(pair(L.shift, `#${p.doc.shiftNo}`, cols));
  if (p.device?.name) add(pair("POS", p.device.name, cols));
  if (p.doc.refReceiptNo) add(pair(L.refDoc, p.doc.refReceiptNo, cols));
  rule();
  // lines
  for (const l of p.lines) {
    add(wrap(l.name, cols));
    const qty = l.weightGrams ? `${L.weight} ${weightText(l.weightGrams)}` : `${qtyText(l.qty)} x ${formatSatang(l.unitPriceSatang)}`;
    add(pair(ind + qty, formatSatang(l.qty * l.unitPriceSatang), cols));
    for (const o of l.options ?? []) add(wrap(`${ind}+ ${o}`, cols));
    if (l.note) add(wrap(`${ind}${L.note}: ${l.note}`, cols));
    if (l.discountSatang > 0) add(pair(ind + L.lineDiscount, `-${formatSatang(l.discountSatang)}`, cols));
  }
  rule();
  // totals
  for (const r of totalRows(p, L)) {
    if (r.grand) add(pair(r.label, formatSatang(r.satang), Math.floor(cols / 2)), "left", true, true);
    else add(pair(r.label, `${r.minus ? "-" : ""}${formatSatang(r.satang)}`, cols));
  }
  for (const r of vatRows(p, L)) add(pair(r.label, formatSatang(r.satang), cols));
  if (p.totals.tipSatang > 0) add(pair(L.tip, formatSatang(p.totals.tipSatang), cols));
  rule();
  // payments
  for (const x of p.payments) {
    add(pair(payLabel(L, x.type), formatSatang(x.amountSatang), cols));
    if (x.tenderedSatang !== undefined && x.tenderedSatang !== null) add(pair(ind + L.tendered, formatSatang(x.tenderedSatang), cols));
    if (x.changeSatang !== undefined && x.changeSatang !== null) add(pair(ind + L.change, formatSatang(x.changeSatang), cols));
    if (x.reference) add(pair(ind + L.reference, x.reference, cols));
  }
  // member
  if (p.member) {
    rule();
    add(pair(L.member, p.member.name, cols));
    if (p.member.tierName) add(pair(L.tier, p.member.tierName, cols));
    add(pair(L.pointEarned, String(p.member.pointEarned), cols));
    if (p.member.pointBalance !== undefined && p.member.pointBalance !== null) add(pair(L.pointBalance, String(p.member.pointBalance), cols));
  }
  // footer
  rule();
  if (p.footer.text) add(wrap(p.footer.text, cols), "center");
  if (p.footer.fullTaxInvoiceHint) add(wrap(L.fullTaxInvoiceHint, cols), "center");
  return out;
}

/**
 * ใบเสร็จเป็นไบต์ ESC/POS (R6) — ESC @ ก่อนทุกอย่าง · คอลัมน์ 32 (58 มม.) / 48 (80 มม.) · ESC a จัดแนว · ESC E หัวเอกสาร/ยอดสุทธิ ·
 * GS ! 0x11 ยอดสุทธิ · ลิ้นชัก ESC p 0 25 250 เฉพาะ drawerKick และบิลมีเงินสด · GS V 66 0 ตัดกระดาษท้ายสุดเมื่อ cut ·
 * thaiText "tis620" = ESC t <codePage> + ไบต์ TIS-620 · "raster" = บรรทัดที่มีอักษรไทยเป็นช่อง GS v 0 (ว่าง 8 ไบต์) ให้ client วาดแล้วแทนที่
 */
export function encodeEscPos(payload: ReceiptPayload, opts: EscPosOptions): EscPosResult {
  const p = payload;
  const paper = opts?.paper === "58" ? "58" : "80";
  const cols = COLS[paper];
  const mode = opts?.thaiText === "tis620" ? "tis620" : "raster";
  const locale: Locale = opts?.locale === "en" ? "en" : "th";
  const cut = opts?.cut !== false;
  const codePage = Number.isInteger(opts?.codePage) && opts.codePage! >= 0 && opts.codePage! <= 255 ? opts.codePage! : 255;
  const L = labelsOf(p, locale);
  const b: number[] = [];
  const slots: EscPosRasterSlot[] = [];
  const push = (...xs: number[]) => {
    for (const x of xs) b.push(x & 0xff);
  };

  push(0x1b, 0x40); // ESC @
  if (mode === "tis620") push(0x1b, 0x74, codePage); // ESC t n
  if (opts?.drawerKick === true && p.payments.some((x) => x.type === "CASH")) push(0x1b, 0x70, 0x00, 0x19, 0xfa); // ESC p 0 25 250

  const ALIGN = { left: 0, center: 1, right: 2 } as const;
  let align = -1;
  for (const ln of layout(p, L, cols, locale)) {
    if ("rule" in ln) {
      if (align !== 0) push(0x1b, 0x61, 0);
      align = 0;
      push(...ascii("-".repeat(cols)), 0x0a);
      continue;
    }
    const a = ALIGN[ln.align];
    if (a !== align) push(0x1b, 0x61, a);
    align = a;
    if (ln.bold) push(0x1b, 0x45, 0x01);
    if (ln.big) push(0x1d, 0x21, 0x11);
    if (mode === "raster" && THAI_RE.test(ln.text)) {
      slots.push({ offset: b.length, length: 8, text: ln.text, cols: ln.big ? Math.floor(cols / 2) : cols, align: ln.align, bold: !!ln.bold, big: !!ln.big });
      push(0x1d, 0x76, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00); // GS v 0 m=0 x=0 y=0 (ที่ว่างให้ client)
    } else {
      push(...(mode === "tis620" ? tis620(ln.text) : ascii(ln.text)), 0x0a);
    }
    if (ln.big) push(0x1d, 0x21, 0x00);
    if (ln.bold) push(0x1b, 0x45, 0x00);
  }
  if (cut) push(0x1b, 0x64, 0x04, 0x1d, 0x56, 0x42, 0x00); // ESC d 4 · GS V 66 0
  else push(0x1b, 0x64, 0x04);
  return { bytes: Uint8Array.from(b), rasterSlots: slots };
}

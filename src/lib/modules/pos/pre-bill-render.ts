// pre-bill-render.ts — ใบรายการ (pre-bill) ของโต๊ะ/ของใบแยกบิล: ตัวเรนเดอร์ HTML + ESC/POS (POS P2.5 S · R9 · มติ 9 · มติ §11 ข้อ 4)
//
// 🔴 บริสุทธิ์ + ใช้ร่วม client (P2.5U พรีวิว 80 มม. + พิมพ์ที่เครื่องพิมพ์ใบเสร็จของเครื่อง · ไม่มีคิวพิมพ์ฝั่งเซิร์ฟเวอร์): ห้าม import prisma /
//    server-only / next / node: / ไฟล์ฝั่งเซิร์ฟเวอร์ของ pos — ใช้ได้แค่ receipt-render (ตัวช่วยเงิน/วันที่/ความกว้างคอลัมน์ + ชนิด ESC/POS)
// 🔴 ไม่มีนาฬิกา/สุ่ม: เวลาทุกตัวมาจาก payload (printedAt จากเซิร์ฟเวอร์) ⇒ เรียกซ้ำได้ผลเดิมทุกไบต์
// 🔴 ไม่ใช่เอกสารภาษี/ใบเสร็จ: ไม่มีเลขเอกสาร/เลขภาษี/เลขใบเสร็จ · หัว th "ใบรายการ — ไม่ใช่ใบเสร็จรับเงิน/ใบกำกับภาษี" (มติ 9) · en มี "PRE-BILL — NOT A RECEIPT" ·
//    ยอดพิมพ์ตาม payload (= quote ของโต๊ะ/ใบ ทุกสตางค์) · copy = "สำเนา" / "COPY" (ต้นฉบับไม่มีคำนี้)
import { formatReceiptDate, formatSatang, receiptColumns, type EscPosRasterSlot, type EscPosResult } from "./receipt-render";

type Locale = "th" | "en";
export type PreBillLine = { qty: number; name: string; options: string[]; amountSatang: number };
/** payload ของใบรายการ (สร้างที่เซิร์ฟเวอร์ registerTablePreBill · ไม่มีคีย์เลขเอกสารใด ๆ) */
export type PreBillPayload = {
  kind: "PRE_BILL";
  shop: { name: string; branch: string };
  tableName: string;
  guestCount: number | null;
  openedAt: string;
  printedAt: string;
  staffName: string | null;
  part: { no: number; of: number } | null;
  member: { name: string } | null;
  lines: PreBillLine[];
  subtotalSatang: number;
  discountSatang: number;
  serviceCharge: { rateBp: number; satang: number };
  vatIncludedSatang: number;
  totalSatang: number;
  itemsHash: string;
  notReceipt: true;
  copy: boolean;
  locale: Locale;
};
export type PreBillLabels = {
  title: string;
  footer: string;
  copy: string;
  /** "{no}" "{of}" */
  part: string;
  table: string;
  /** "{n}" */
  guests: string;
  opened: string;
  printed: string;
  staff: string;
  member: string;
  subtotal: string;
  discount: string;
  /** "{rate}" */
  serviceCharge: string;
  vatIncluded: string;
  total: string;
};
export const PRE_BILL_LABELS: { readonly th: PreBillLabels; readonly en: PreBillLabels } = {
  th: {
    title: "ใบรายการ — ไม่ใช่ใบเสร็จรับเงิน/ใบกำกับภาษี",
    footer: "ตรวจรายการแล้วแจ้งพนักงานเพื่อชำระเงิน",
    copy: "สำเนา",
    part: "บิล {no} จาก {of}",
    table: "โต๊ะ",
    guests: "{n} คน",
    opened: "เปิดโต๊ะ",
    printed: "พิมพ์",
    staff: "พนักงาน",
    member: "สมาชิก",
    subtotal: "รวม",
    discount: "ส่วนลด",
    serviceCharge: "ค่าบริการ {rate}",
    vatIncluded: "VAT (รวมในยอดแล้ว)",
    total: "ยอดสุทธิ",
  },
  en: {
    title: "PRE-BILL — NOT A RECEIPT",
    footer: "Please check the items, then ask our staff to pay",
    copy: "COPY",
    part: "Bill {no} of {of}",
    table: "Table",
    guests: "{n} guests",
    opened: "Opened",
    printed: "Printed",
    staff: "Staff",
    member: "Member",
    subtotal: "Subtotal",
    discount: "Discount",
    serviceCharge: "Service charge {rate}",
    vatIncluded: "VAT (included)",
    total: "Total",
  },
};

const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, k: string) => (k in v ? String(v[k]) : `{${k}}`));
const rateText = (bp: number) => `${bp % 100 === 0 ? String(bp / 100) : (bp / 100).toFixed(2)}%`;
const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
const localeOf = (p: PreBillPayload, l: unknown): Locale => (l === "en" ? "en" : l === "th" ? "th" : p?.locale === "en" ? "en" : "th");

type Row = { left: string; right: string; bold?: boolean };
/** ส่วนของใบ (ลำดับเดียวกันทั้ง HTML และ ESC/POS) */
function sections(p: PreBillPayload, L: PreBillLabels, locale: Locale) {
  const head = [p.shop?.name ?? "", p.shop?.branch ?? ""].filter((x) => !!x && x.trim());
  const meta: string[] = [
    [`${L.table} ${p.tableName}`, p.guestCount !== null && p.guestCount !== undefined ? fill(L.guests, { n: p.guestCount }) : ""].filter(Boolean).join(" · "),
    `${L.opened} ${formatReceiptDate(p.openedAt, locale)}`,
    `${L.printed} ${formatReceiptDate(p.printedAt, locale)}`,
    p.staffName ? `${L.staff} ${p.staffName}` : "",
    p.member?.name ? `${L.member} ${p.member.name}` : "",
  ].filter((x) => !!x);
  const totals: Row[] = [{ left: L.subtotal, right: formatSatang(p.subtotalSatang) }];
  if (p.discountSatang > 0) totals.push({ left: L.discount, right: `-${formatSatang(p.discountSatang)}` });
  if (p.serviceCharge && p.serviceCharge.satang !== 0) totals.push({ left: fill(L.serviceCharge, { rate: rateText(p.serviceCharge.rateBp) }), right: formatSatang(p.serviceCharge.satang) });
  totals.push({ left: L.total, right: formatSatang(p.totalSatang), bold: true });
  if (p.vatIncludedSatang > 0) totals.push({ left: L.vatIncluded, right: formatSatang(p.vatIncludedSatang) });
  return { head, part: p.part ? fill(L.part, { no: p.part.no, of: p.part.of }) : "", meta, totals };
}

export type PreBillHtmlOptions = { paper: "58" | "80"; locale: Locale };
/** ใบรายการเป็น HTML (inline CSS · กว้าง 58/80 มม. · ดำบนขาว) — ส่วน: head → meta → lines → totals → footer */
export function renderPreBillHtml(payload: PreBillPayload, opts: PreBillHtmlOptions): string {
  const paper = opts?.paper === "58" ? "58" : "80";
  const locale = localeOf(payload, opts?.locale);
  const L = PRE_BILL_LABELS[locale];
  const x = sections(payload, L, locale);
  const css = [
    `@page { size: ${paper}mm 297mm; margin: 0 }`,
    `@media print { html, body { width: ${paper}mm } }`,
    `html, body { margin: 0; padding: 0; background: #fff; color: #000 }`,
    `body { width: ${paper}mm; font-family: system-ui, -apple-system, Sarabun, Tahoma, sans-serif; font-size: ${paper === "58" ? 12 : 13}px; line-height: 1.35 }`,
    `.bill { box-sizing: border-box; width: ${paper}mm; padding: 3mm ${paper === "58" ? 2 : 3}mm }`,
    `section { border-bottom: 1px dashed #000; padding: 1.5mm 0 } section:last-child { border-bottom: 0 }`,
    `.c { text-align: center } .b { font-weight: 700 } .t { font-size: 1.15em; font-weight: 700 } .opt { padding-left: 4mm }`,
    `.row { display: flex; justify-content: space-between; gap: 2mm } .row span:last-child { white-space: nowrap }`,
    `.stamp { display: inline-block; border: 2px solid #000; padding: 0 2mm; font-weight: 700; letter-spacing: 1px }`,
  ].join("\n");
  const row = (r: Row) => `<div class="row${r.bold ? " b" : ""}"><span>${esc(r.left)}</span><span>${esc(r.right)}</span></div>`;
  const out: string[] = [];
  out.push(`<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><title>${esc(L.title)}</title><style>${css}</style></head><body><div class="bill">`);
  out.push(
    `<section data-section="head" class="c">${x.head.map((h, i) => `<div${i === 0 ? ' class="b"' : ""}>${esc(h)}</div>`).join("")}<div class="t">${esc(L.title)}</div>${x.part ? `<div class="b">${esc(x.part)}</div>` : ""}${payload.copy ? `<div class="stamp">${esc(L.copy)}</div>` : ""}</section>`,
  );
  out.push(`<section data-section="meta">${x.meta.map((m) => `<div>${esc(m)}</div>`).join("")}</section>`);
  out.push(`<section data-section="lines">`);
  for (const l of payload.lines ?? []) {
    out.push(row({ left: `${l.qty} x ${l.name}`, right: formatSatang(l.amountSatang) }));
    for (const o of l.options ?? []) out.push(`<div class="opt">${esc(`+ ${o}`)}</div>`);
  }
  out.push(`</section>`);
  out.push(`<section data-section="totals">${x.totals.map(row).join("")}</section>`);
  out.push(`<section data-section="footer" class="c">${esc(L.footer)}</section>`);
  out.push(`</div></body></html>`);
  return out.join("\n");
}

// ═══════════ ESC/POS ═══════════
export type PreBillEscPosOptions = { paper: "58" | "80"; thaiText: "raster" | "tis620"; cut?: boolean; codePage?: number; locale?: Locale };
const COLS: Record<"58" | "80", number> = { "58": 32, "80": 48 };
const THAI_RE = /[ก-๛]/;
const isCombining = (cp: number) => cp === 0x0e31 || (cp >= 0x0e34 && cp <= 0x0e3a) || (cp >= 0x0e47 && cp <= 0x0e4e);
/** ตัดบรรทัดตามคอลัมน์ (ตัดที่ช่องว่างก่อน · คำยาวตัดตามกลุ่มอักษร — วรรณยุกต์ไม่แยกจากตัวหน้า) */
function wrap(text: string, width: number): string[] {
  const src = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!src) return [];
  const lines: string[] = [];
  let cur = "";
  for (const word of src.split(" ")) {
    const cand = cur ? `${cur} ${word}` : word;
    if (receiptColumns(cand) <= width) {
      cur = cand;
      continue;
    }
    if (cur) lines.push(cur);
    cur = "";
    for (const ch of word) {
      const cp = ch.codePointAt(0) ?? 0;
      if (!isCombining(cp) && receiptColumns(cur + ch) > width) {
        lines.push(cur);
        cur = "";
      }
      cur += ch;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}
/** ซ้าย…ขวา ในความกว้างเดียว (ข้อความซ้ายยาว = ตัดบรรทัด แล้วตัวเลขอยู่บรรทัดสุดท้าย) */
function twoCol(left: string, right: string, width: number): string[] {
  const room = Math.max(4, width - receiptColumns(right) - 1);
  const ls = wrap(left, room);
  if (!ls.length) ls.push("");
  const last = ls.pop()!;
  return [...ls, `${last}${" ".repeat(Math.max(1, width - receiptColumns(last) - receiptColumns(right)))}${right}`];
}
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
function ascii(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0x3f;
    out.push(cp >= 0x20 && cp <= 0x7e ? cp : cp === 0x2014 ? 0x2d : 0x3f);
  }
  return out;
}
type PLine = { text: string; align: "left" | "center"; bold: boolean; big: boolean } | { rule: true };

/**
 * ใบรายการเป็นไบต์ ESC/POS — ESC @ · หัว (ร้าน · ชื่อใบ · บิล N จาก M · สำเนา) · ข้อมูลโต๊ะ · รายการ (ซ้าย/ขวา) · ยอด · ท้ายใบ · ตัดกระดาษ (cut ปริยาย true) ·
 * thaiText "tis620" = ESC t <codePage> + TIS-620 · "raster" = บรรทัดไทยเป็นช่อง GS v 0 (8 ไบต์) ให้ client วาดแทน (รูปเดียวกับใบเสร็จ/ใบครัว)
 */
export function renderPreBillEscPos(payload: PreBillPayload, opts: PreBillEscPosOptions): EscPosResult {
  const paper = opts?.paper === "58" ? "58" : "80";
  const cols = COLS[paper];
  const mode = opts?.thaiText === "tis620" ? "tis620" : "raster";
  const locale = localeOf(payload, opts?.locale);
  const cut = opts?.cut !== false;
  const codePage = Number.isInteger(opts?.codePage) && (opts.codePage as number) >= 0 && (opts.codePage as number) <= 255 ? (opts.codePage as number) : 255;
  const L = PRE_BILL_LABELS[locale];
  const x = sections(payload, L, locale);
  const pl: PLine[] = [];
  const add = (texts: string[], align: "left" | "center" = "left", bold = false, big = false) => {
    for (const text of texts) pl.push({ text, align, bold, big });
  };
  x.head.forEach((h, i) => add(wrap(h, cols), "center", i === 0));
  add(wrap(L.title, cols), "center", true);
  if (x.part) add(wrap(x.part, cols), "center", true);
  if (payload.copy) add(wrap(`*** ${L.copy} ***`, cols), "center", true);
  pl.push({ rule: true });
  for (const m of x.meta) add(wrap(m, cols));
  pl.push({ rule: true });
  for (const l of payload.lines ?? []) {
    add(twoCol(`${l.qty} x ${l.name}`, formatSatang(l.amountSatang), cols));
    for (const o of l.options ?? []) add(wrap(`   + ${o}`, cols));
  }
  pl.push({ rule: true });
  for (const r of x.totals) add(twoCol(r.left, r.right, cols), "left", !!r.bold);
  pl.push({ rule: true });
  add(wrap(L.footer, cols), "center");

  const b: number[] = [];
  const slots: EscPosRasterSlot[] = [];
  const push = (...xs: number[]) => {
    for (const v of xs) b.push(v & 0xff);
  };
  push(0x1b, 0x40);
  if (mode === "tis620") push(0x1b, 0x74, codePage);
  const ALIGN = { left: 0, center: 1 } as const;
  let align = -1;
  for (const ln of pl) {
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
    if (mode === "raster" && THAI_RE.test(ln.text)) {
      slots.push({ offset: b.length, length: 8, text: ln.text, cols, align: ln.align, bold: ln.bold, big: ln.big });
      push(0x1d, 0x76, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00);
    } else {
      push(...(mode === "tis620" ? tis620(ln.text) : ascii(ln.text)), 0x0a);
    }
    if (ln.bold) push(0x1b, 0x45, 0x00);
  }
  if (cut) push(0x1b, 0x64, 0x04, 0x1d, 0x56, 0x42, 0x00);
  else push(0x1b, 0x64, 0x04);
  return { bytes: Uint8Array.from(b), rasterSlots: slots };
}

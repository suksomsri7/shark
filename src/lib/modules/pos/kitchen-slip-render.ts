// kitchen-slip-render.ts — ตัวเรนเดอร์ใบครัว/ใบบาร์ต่อสถานี (POS P2.6 S · R14 · CD 13 14 · มติ 8)
//
// 🔴 บริสุทธิ์ + ใช้ร่วม client (P2.6U พิมพ์จากเครื่องที่จับคู่เครื่องพิมพ์ไว้ · ไม่มีคิวพิมพ์ฝั่งเซิร์ฟเวอร์): ห้าม import prisma / server-only / next / node: /
//    ไฟล์ฝั่งเซิร์ฟเวอร์ของ pos — ใช้ได้แค่ kds-shared (ชนิด) + receipt-render (ความกว้างคอลัมน์ + ชนิด ESC/POS)
// 🔴 ไม่มีนาฬิกา/สุ่ม: เวลาในใบมาจาก slip.sentAt ⇒ เรียกซ้ำได้ผลเดิมทุกไบต์ (P2) · ไม่มีเงิน (ราคา/ยอด) ในใบครัวเลย
// 🔴 ป้ายพิมพ์ซ้ำ (copy) = "พิมพ์ซ้ำ" (th) / "REPRINT" (en) — ต้นฉบับไม่มีคำนี้
import { KITCHEN_SLIP_COPY_LABEL, type KitchenSlip } from "./kds-shared";
import { receiptColumns, type EscPosRasterSlot, type EscPosResult } from "./receipt-render";

type Locale = "th" | "en";
const LABELS: Record<Locale, { copy: string; note: string; staff: string; time: string }> = {
  th: { copy: KITCHEN_SLIP_COPY_LABEL.th, note: "หมายเหตุ", staff: "ผู้ส่ง", time: "เวลา" },
  en: { copy: KITCHEN_SLIP_COPY_LABEL.en, note: "Note", staff: "By", time: "Time" },
};

/** "HH:MM" เวลาไทยจาก ISO ของใบ (ไม่ใช้นาฬิกาเครื่อง) */
function hhmm(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  return new Date(t + 7 * 3_600_000).toISOString().slice(11, 16);
}
const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** บรรทัดหัวใบ: "#14 · ครัวร้อน" · ที่มา · ช่องทาง/เลขอ้างอิง · เวลา · ผู้ส่ง */
function headLines(s: KitchenSlip, L: (typeof LABELS)[Locale]): { big: string; lines: string[] } {
  const lines = [s.sourceLabel, [s.channelName, s.externalRef].filter(Boolean).join(" · "), `${L.time} ${hhmm(s.sentAt)}`, s.staffName ? `${L.staff} ${s.staffName}` : ""].filter((x) => !!x && x.trim());
  return { big: `#${s.no} · ${s.stationName}`, lines };
}

export type KitchenSlipHtmlOptions = { paper: "58" | "80"; locale: Locale };
/** ใบครัวเป็น HTML (inline CSS · กว้าง 58/80 มม. · ดำบนขาว) — ส่วน: head → lines → (copy) */
export function renderKitchenSlipHtml(slip: KitchenSlip, opts: KitchenSlipHtmlOptions): string {
  const paper = opts?.paper === "58" ? "58" : "80";
  const locale: Locale = opts?.locale === "en" ? "en" : slip.printLocale === "en" ? "en" : "th";
  const L = LABELS[locale];
  const h = headLines(slip, L);
  const css = [
    `@page { size: ${paper}mm 297mm; margin: 0 }`,
    `@media print { html, body { width: ${paper}mm } }`,
    `html, body { margin: 0; padding: 0; background: #fff; color: #000 }`,
    `body { width: ${paper}mm; font-family: system-ui, -apple-system, Sarabun, Tahoma, sans-serif; font-size: ${paper === "58" ? 13 : 14}px; line-height: 1.35 }`,
    `.slip { box-sizing: border-box; width: ${paper}mm; padding: 3mm ${paper === "58" ? 2 : 3}mm }`,
    `section { border-bottom: 1px dashed #000; padding: 1.5mm 0 } section:last-child { border-bottom: 0 }`,
    `.big { font-size: 1.6em; font-weight: 700 } .b { font-weight: 700 } .opt { padding-left: 5mm } .note { padding-left: 5mm; font-weight: 700 }`,
    `.stamp { display: inline-block; border: 2px solid #000; padding: 0 2mm; font-weight: 700; letter-spacing: 1px }`,
  ].join("\n");
  const out: string[] = [];
  out.push(`<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><title>${esc(h.big)}</title><style>${css}</style></head><body><div class="slip">`);
  out.push(`<section data-section="head"><div class="big">${esc(h.big)}</div>${h.lines.map((l) => `<div>${esc(l)}</div>`).join("")}${slip.copy ? `<div class="stamp">${esc(L.copy)}</div>` : ""}</section>`);
  out.push(`<section data-section="lines">`);
  for (const l of slip.lines) {
    out.push(`<div class="b">${esc(`${l.qty} x ${l.name}`)}</div>`);
    for (const o of l.options) out.push(`<div class="opt">${esc(`+ ${o}`)}</div>`);
    if (l.note) out.push(`<div class="note">${esc(`${L.note}: ${l.note}`)}</div>`);
  }
  out.push(`</section></div></body></html>`);
  return out.join("\n");
}

// ═══════════ ESC/POS ═══════════
export type KitchenSlipEscPosOptions = { paper: "58" | "80"; thaiText: "raster" | "tis620"; cut?: boolean; codePage?: number; locale?: Locale };
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
    out.push(cp >= 0x20 && cp <= 0x7e ? cp : 0x3f);
  }
  return out;
}
type PLine = { text: string; align: "left" | "center"; bold: boolean; big: boolean } | { rule: true };

/**
 * ใบครัวเป็นไบต์ ESC/POS — ESC @ · หัวใบตัวใหญ่ (GS ! 0x11) · รายการตัวหนา · ตัวเลือก/หมายเหตุย่อหน้า · ป้ายพิมพ์ซ้ำ · ตัดกระดาษ (cut ปริยาย true) ·
 * thaiText "tis620" = ESC t <codePage> + TIS-620 · "raster" = บรรทัดไทยเป็นช่อง GS v 0 (8 ไบต์) ให้ client วาดแทน (รูปเดียวกับ encodeEscPos ของใบเสร็จ)
 */
export function renderKitchenSlipEscPos(slip: KitchenSlip, opts: KitchenSlipEscPosOptions): EscPosResult {
  const paper = opts?.paper === "58" ? "58" : "80";
  const cols = COLS[paper];
  const half = Math.floor(cols / 2);
  const mode = opts?.thaiText === "tis620" ? "tis620" : "raster";
  const locale: Locale = opts?.locale === "en" ? "en" : slip.printLocale === "en" ? "en" : "th";
  const cut = opts?.cut !== false;
  const codePage = Number.isInteger(opts?.codePage) && (opts.codePage as number) >= 0 && (opts.codePage as number) <= 255 ? (opts.codePage as number) : 255;
  const L = LABELS[locale];
  const h = headLines(slip, L);
  const pl: PLine[] = [];
  const add = (texts: string[], align: "left" | "center" = "left", bold = false, big = false) => {
    for (const text of texts) pl.push({ text, align, bold, big });
  };
  add(wrap(h.big, half), "center", true, true);
  for (const l of h.lines) add(wrap(l, cols), "center");
  if (slip.copy) add(wrap(`*** ${L.copy} ***`, cols), "center", true);
  pl.push({ rule: true });
  for (const l of slip.lines) {
    add(wrap(`${l.qty} x ${l.name}`, half), "left", true, true);
    for (const o of l.options) add(wrap(`   + ${o}`, cols));
    if (l.note) add(wrap(`   ${L.note}: ${l.note}`, cols), "left", true);
  }
  pl.push({ rule: true });

  const b: number[] = [];
  const slots: EscPosRasterSlot[] = [];
  const push = (...xs: number[]) => {
    for (const x of xs) b.push(x & 0xff);
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
    if (ln.big) push(0x1d, 0x21, 0x11);
    if (mode === "raster" && THAI_RE.test(ln.text)) {
      slots.push({ offset: b.length, length: 8, text: ln.text, cols: ln.big ? half : cols, align: ln.align, bold: ln.bold, big: ln.big });
      push(0x1d, 0x76, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00);
    } else {
      push(...(mode === "tis620" ? tis620(ln.text) : ascii(ln.text)), 0x0a);
    }
    if (ln.big) push(0x1d, 0x21, 0x00);
    if (ln.bold) push(0x1b, 0x45, 0x00);
  }
  if (cut) push(0x1b, 0x64, 0x04, 0x1d, 0x56, 0x42, 0x00);
  else push(0x1b, 0x64, 0x04);
  return { bytes: Uint8Array.from(b), rasterSlots: slots };
}

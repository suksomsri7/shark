// etax-pdf.ts — ACC T5.4 (เลน 2) ▸ ไฟล์ PDF ของเอกสารภาษีที่ออกแล้ว สำหรับ e-Tax Invoice by Time Stamp
//
//   ข้อมูล = PrintView จาก `loadPrintView` (ข้อมูลพิมพ์ชุดเดียวกับหน้าพิมพ์ · ผู้ขาย/ข้อความท้ายใบที่ตรึงตอนออก T2.9) — ไม่คิดตัวเลขใหม่
//   ตัวสร้าง = pdfkit (pure JS · ไม่มีเบราว์เซอร์) โหมด `subset: "PDF/A-3b"`:
//     XMP pdfaid part 3 / conformance B · OutputIntent sRGB (โปรไฟล์ที่มากับ pdfkit) · ฟอนต์ Sarabun ฝังแบบ subset (SIL OFL 1.1 · public/fonts/sarabun/OFL.txt)
//     ไม่เข้ารหัส · ไม่มีรูปจากเครือข่าย (โลโก้/ตรา/ลายเซ็นเป็น URL ภายนอก — ไม่ดึงตอนสร้างไฟล์)
//   🔴 ไม่อ้างว่าผ่าน PDF/A-3: เครื่องนี้ไม่มีตัวตรวจ (veraPDF) — `PDF_CONFORMANCE_NOTE` บอกตรงตามจริง · ตัวตรวจโครงสร้างที่ทำได้อยู่ใน `inspectEtaxPdf`
//   🔴 ตัดบรรทัดไทยเอง (Intl.Segmenter + ความกว้างจริงของฟอนต์) — pdfkit ตัดได้เฉพาะช่องว่าง/กฎ UAX14 ที่ไม่รู้จักคำไทย
//   🔴 ห้าม import ฝั่ง client (fs · pdfkit)
// design note: ledger/wo-notes/T5.4.md §1.3
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { PrintView } from "@/components/account-v2/PrintDocument";

export const PDF_CONFORMANCE_NOTE = "สร้างตามโครงสร้าง PDF/A-3b (pdfkit: XMP pdfaid 3/B · OutputIntent sRGB · ฟอนต์ฝัง) — ยังไม่ผ่านตัวตรวจ PDF/A";

export type EtaxPdfInput = {
  view: PrintView;
  /** ข้อความหัวไฟล์ (Title ของเอกสาร PDF) */
  title: string;
  /** เวลาสร้างไฟล์ (ใส่ใน Info/XMP) */
  createdAt: Date;
  /** บรรทัดท้ายไฟล์ เช่น "ส่งทางระบบประทับรับรองเวลา (Time Stamp)" */
  footer?: string | null;
};

export type EtaxPdfResult = { bytes: Uint8Array; sha256: string; pages: number };

/** อินเทอร์เฟซตัวสร้าง (เปลี่ยนตัวสร้างได้โดยไม่แตะขั้นส่ง) */
export interface EtaxPdfGenerator {
  readonly name: string;
  generate(input: EtaxPdfInput): Promise<EtaxPdfResult>;
}

const FONT_DIR = join(process.cwd(), "public", "fonts", "sarabun");
const FONT_REG = join(FONT_DIR, "Sarabun-Regular.ttf");
const FONT_BOLD = join(FONT_DIR, "Sarabun-Bold.ttf");

type Doc = PDFKit.PDFDocument;

const SEG = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter("th", { granularity: "word" }) : null;
const CLUSTER = /[^ัิ-ฺ็-๎][ัิ-ฺ็-๎]*/g;

/** ตัดบรรทัดตามคำ (ภาษาไทยไม่มีช่องว่างระหว่างคำ) ด้วยความกว้างจริงของฟอนต์ปัจจุบัน */
function wrap(doc: Doc, text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of th(text).split("\n")) {
    if (doc.widthOfString(para) <= width) {
      out.push(para);
      continue;
    }
    const words = SEG ? Array.from(SEG.segment(para), (x) => x.segment) : para.split(/(\s+)/);
    let cur = "";
    const push = () => {
      if (cur.trim()) out.push(cur.trimEnd());
      cur = "";
    };
    for (const w of words) {
      if (doc.widthOfString(cur + w) <= width) {
        cur += w;
        continue;
      }
      push();
      if (doc.widthOfString(w) <= width) {
        cur = w.trimStart();
        continue;
      }
      for (const g of w.match(CLUSTER) ?? [w]) {
        if (doc.widthOfString(cur + g) > width) push();
        cur += g;
      }
    }
    push();
  }
  return out;
}

/**
 * สระอำ (U+0E33) → นิคหิต + สระอา (U+0E4D U+0E32) ก่อนวาง — ฟอนต์แตกสระอำเป็น 2 รูปอยู่แล้ว (หน้าตาเหมือนเดิม)
 * แต่ตารางแปลงกลับเป็นข้อความของ pdfkit ผูกรูปแรกกับ "ำ" และรูปที่สองกับ "า" ⇒ คัดลอก/ค้นข้อความได้ "ำา" ซ้ำ
 * แตกไว้ก่อน = รูปละอักษร · ถอดกลับแล้ว NFKC = "ำ" เดิม
 */
const th = (t: string) => String(t ?? "").replace(/\u0E33/g, "\u0E4D\u0E32");

/** เขียนข้อความหลายบรรทัดที่ (x, y) ความกว้าง w · คืน y ถัดไป */
function block(doc: Doc, text: string, x: number, y: number, w: number, o: { size?: number; bold?: boolean; align?: "left" | "right" | "center"; color?: string; gap?: number } = {}): number {
  doc.font(o.bold ? "SarabunBold" : "Sarabun").fontSize(o.size ?? 9).fillColor(o.color ?? "#111111");
  const lh = (o.size ?? 9) * 1.35;
  for (const line of wrap(doc, text, w)) {
    doc.text(line, x, y, { width: w, align: o.align ?? "left", lineBreak: false });
    y += lh;
  }
  return y + (o.gap ?? 0);
}

const A4 = { w: 595.28, h: 841.89 };
const M = 40;

/** ตัวสร้างจริง — pdfkit + PDF/A-3b */
export const pdfkitEtaxGenerator: EtaxPdfGenerator = {
  name: "pdfkit-pdfa3b",
  async generate(input: EtaxPdfInput): Promise<EtaxPdfResult> {
    const PDFDocument = (await import("pdfkit")).default;
    const v = input.view;
    const doc = new PDFDocument({
      size: "A4",
      margin: M,
      autoFirstPage: false,
      bufferPages: true,
      compress: true,
      pdfVersion: "1.7",
      subset: "PDF/A-3b",
      lang: "th-TH",
      displayTitle: true,
      font: FONT_REG,
      info: { Title: input.title, Author: v.seller.name, Subject: v.docTitle, Creator: "SHARK", Producer: "SHARK e-Tax (pdfkit)", CreationDate: input.createdAt, ModDate: input.createdAt },
    });
    doc.registerFont("Sarabun", FONT_REG);
    doc.registerFont("SarabunBold", FONT_BOLD);
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    const done = new Promise<void>((res, rej) => {
      doc.on("end", () => res());
      doc.on("error", (e: unknown) => rej(e));
    });

    let pages = 0;
    const newPage = () => {
      doc.addPage({ size: "A4", margin: M });
      pages += 1;
    };
    newPage();
    const W = A4.w - M * 2;
    const BOTTOM = A4.h - M - 30;
    let y = M;

    // ── หัว: ผู้ขาย (ซ้าย) · ชื่อเอกสาร + เลขที่ + วันที่ (ขวา) ──
    const leftW = W * 0.58;
    const rightX = M + leftW + 10;
    const rightW = W - leftW - 10;
    let ly = block(doc, v.seller.name, M, y, leftW, { size: 13, bold: true });
    if (v.sellerExtra?.nameEn) ly = block(doc, v.sellerExtra.nameEn, M, ly, leftW, { size: 9 });
    if (v.seller.address) ly = block(doc, v.seller.address, M, ly, leftW, { size: 9 });
    ly = block(doc, `เลขประจำตัวผู้เสียภาษี ${v.seller.taxId ?? "-"}${v.seller.branch ? ` · ${v.seller.branch}` : ""}`, M, ly, leftW, { size: 9 });
    if (v.seller.phone) ly = block(doc, `โทร ${v.seller.phone}`, M, ly, leftW, { size: 9 });
    let ry = block(doc, v.docTitle, rightX, y, rightW, { size: 15, bold: true, align: "right" });
    ry = block(doc, `เลขที่ ${v.docNo ?? "-"}`, rightX, ry, rightW, { size: 10, align: "right" });
    ry = block(doc, `วันที่ ${v.issueDateText}`, rightX, ry, rightW, { size: 10, align: "right" });
    if (v.reference) ry = block(doc, `อ้างอิง ${v.reference}`, rightX, ry, rightW, { size: 9, align: "right" });
    y = Math.max(ly, ry) + 6;
    doc.moveTo(M, y).lineTo(M + W, y).lineWidth(0.6).strokeColor("#999999").stroke();
    y += 8;

    // ── ผู้ซื้อ ──
    y = block(doc, "ผู้ซื้อ / ลูกค้า", M, y, W, { size: 9, bold: true, color: "#444444" });
    y = block(doc, v.buyer.name || "-", M, y, W, { size: 10, bold: true });
    if (v.buyer.address) y = block(doc, v.buyer.address, M, y, W, { size: 9 });
    const buyerTax = [v.buyer.taxId ? `เลขประจำตัวผู้เสียภาษี ${v.buyer.taxId}` : "", v.buyer.branch].filter(Boolean).join(" · ");
    if (buyerTax) y = block(doc, buyerTax, M, y, W, { size: 9 });
    y += 6;

    // ── กล่องใบเพิ่ม/ลดหนี้ (ม.86/9 86/10) ──
    if (v.adjust) {
      const a = v.adjust;
      const lines = [
        `อ้างอิง${a.origKindLabel ?? "เอกสารเดิม"} เลขที่ ${a.origDocNo ?? "-"}${a.origDate ? ` ลงวันที่ ${a.origDate}` : ""}`,
        a.originalValue !== null ? `มูลค่าตามเอกสารเดิม ${v.money(a.originalValue)} บาท · มูลค่าที่ถูกต้อง ${v.money(a.correctValue ?? 0)} บาท` : "",
        `ผลต่าง ${v.money(a.difference)} บาท · ภาษีมูลค่าเพิ่ม ${v.money(a.differenceVat)} บาท`,
        a.reasonText ? `สาเหตุ: ${a.reasonText}` : "",
        a.sectionText,
      ].filter(Boolean);
      for (const t of lines) y = block(doc, t, M, y, W, { size: 9 });
      y += 6;
    }

    // ── ตารางรายการ ──
    const cols = [
      { key: "no", title: "#", w: 22, align: "left" as const },
      { key: "desc", title: "รายการ", w: 0, align: "left" as const },
      { key: "qty", title: "จำนวน", w: 50, align: "right" as const },
      { key: "price", title: "ราคาต่อหน่วย", w: 72, align: "right" as const },
      ...(v.lines.some((l) => l.discount) ? [{ key: "disc", title: "ส่วนลด", w: 56, align: "right" as const }] : []),
      ...(v.lines.some((l) => l.vatCell) ? [{ key: "vat", title: "VAT", w: 36, align: "right" as const }] : []),
      { key: "amt", title: "จำนวนเงิน", w: 78, align: "right" as const },
    ];
    const fixed = cols.reduce((s, c) => s + c.w, 0);
    cols[1].w = W - fixed;
    const header = () => {
      doc.rect(M, y, W, 16).fillColor("#eeeeee").fill();
      let x = M;
      for (const c of cols) {
        doc.font("SarabunBold").fontSize(8.5).fillColor("#222222").text(th(c.title), x + 3, y + 3, { width: c.w - 6, align: c.align, lineBreak: false });
        x += c.w;
      }
      y += 18;
    };
    header();
    v.lines.forEach((l, i) => {
      doc.font("Sarabun").fontSize(9);
      const descLines = wrap(doc, l.description || "-", cols[1].w - 6);
      const h = descLines.length * 12.2 + 3;
      if (y + h > BOTTOM) {
        newPage();
        y = M;
        header();
      }
      const cell: Record<string, string> = { no: String(i + 1), qty: `${l.qty}${l.unitName ? ` ${l.unitName}` : ""}`, price: l.unitPrice, disc: l.discount ?? "", vat: l.vatCell ?? "", amt: l.amount };
      let x = M;
      for (const c of cols) {
        if (c.key === "desc") {
          let dy = y;
          for (const t of descLines) {
            doc.font("Sarabun").fontSize(9).fillColor("#111111").text(t, x + 3, dy, { width: c.w - 6, lineBreak: false });
            dy += 12.2;
          }
        } else {
          doc.font("Sarabun").fontSize(9).fillColor("#111111").text(th(cell[c.key] ?? ""), x + 3, y, { width: c.w - 6, align: c.align, lineBreak: false });
        }
        x += c.w;
      }
      y += h;
      doc.moveTo(M, y - 1).lineTo(M + W, y - 1).lineWidth(0.3).strokeColor("#dddddd").stroke();
    });
    y += 6;

    // ── สรุปยอด ──
    const sumRows: [string, string, boolean][] = [["รวมเป็นเงิน", v.totals.subTotal, false]];
    if (v.totals.discount) sumRows.push(["ส่วนลด", v.totals.discount, false]);
    if (v.totals.deposit) sumRows.push(["หักเงินมัดจำ", v.totals.deposit, false]);
    for (const r of v.totals.vatRows) sumRows.push([r.label, r.text, false]);
    sumRows.push([v.totals.grandLabel, v.totals.grandTotal, true]);
    if (y + sumRows.length * 14 + 20 > BOTTOM) {
      newPage();
      y = M;
    }
    const sx = M + W - 260;
    for (const [label, val, strong] of sumRows) {
      doc.font(strong ? "SarabunBold" : "Sarabun").fontSize(strong ? 10.5 : 9.5).fillColor("#111111");
      doc.text(th(label), sx, y, { width: 160, lineBreak: false });
      doc.text(th(`${val} บาท`), sx + 160, y, { width: 100, align: "right", lineBreak: false });
      y += strong ? 16 : 13.5;
    }
    y += 6;

    // ── หมายเหตุ · ออกแทน · ข้อความกฎหมาย ──
    const tail = [v.docNotes?.replacementNote, v.note ? `หมายเหตุ: ${v.note}` : null, v.footerNote, v.legalText, v.sectionText].filter((t): t is string => !!t && !!t.trim());
    for (const t of tail) {
      doc.font("Sarabun").fontSize(8.5);
      const need = wrap(doc, t, W).length * 11.5 + 4;
      if (y + need > BOTTOM) {
        newPage();
        y = M;
      }
      y = block(doc, t, M, y, W, { size: 8.5, color: "#333333", gap: 3 });
    }

    // ── ท้ายทุกหน้า ──
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const foot = [input.footer, `${v.docTitle} ${v.docNo ?? ""} · หน้า ${i - range.start + 1}/${range.count}`].filter(Boolean).join(" · ");
      doc.font("Sarabun").fontSize(7.5).fillColor("#666666").text(th(foot), M, A4.h - M - 12, { width: W, align: "center", lineBreak: false });
    }
    doc.end();
    await done;
    const bytes = new Uint8Array(Buffer.concat(chunks));
    return { bytes, sha256: createHash("sha256").update(bytes).digest("hex"), pages };
  },
};

/** ตัวตรวจโครงสร้างที่ทำได้โดยไม่มีตัวตรวจ PDF/A (ข้อสอบ + บันทึกในความพยายามส่ง) — ไม่ใช่การรับรองมาตรฐาน */
export function inspectEtaxPdf(bytes: Uint8Array): { header: string; pdfaPart: string | null; pdfaConformance: string | null; outputIntent: boolean; encrypted: boolean; fontFiles: number; sizeBytes: number } {
  const s = Buffer.from(bytes).toString("latin1");
  const part = /<pdfaid:part>(\d)<\/pdfaid:part>/.exec(s)?.[1] ?? null;
  const conf = /<pdfaid:conformance>([A-Z])<\/pdfaid:conformance>/.exec(s)?.[1] ?? null;
  return {
    header: s.slice(0, 8),
    pdfaPart: part,
    pdfaConformance: conf,
    outputIntent: /\/OutputIntents\s*\[/.test(s) && /GTS_PDFA1/.test(s),
    encrypted: /\/Encrypt\s/.test(s),
    fontFiles: (s.match(/\/FontFile2\s/g) ?? []).length,
    sizeBytes: bytes.length,
  };
}

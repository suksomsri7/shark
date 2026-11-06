// public-doc-pdf.tsx — SEC S3a.5 ส่วน B ▸ ไฟล์ PDF ของใบเสนอราคาสาธารณะ (`/doc/<token>/pdf` · มติเจ้าของ 7 พ.ย. 2569) ◂
//   เนื้อหาเดียวกับหน้า A (`PublicDocView` จาก `loadPublicDocument` — ป้าย/ภาษา/ฟิลด์ที่แสดงตาม `buildPrintOptions` · เลขภาษี/เบอร์ลูกค้าปิดแล้ว)
//   ฟอนต์ไทย Sarabun (SIL OFL 1.1 · `public/fonts/sarabun/OFL.txt`) อ่านจากไฟล์ในโปรเจกต์ด้วย path จริงฝั่ง server (ไม่ดึงผ่าน URL) ·
//   react-pdf ฝังเฉพาะตัวอักษรที่ใช้ (subset) ⇒ ไฟล์เล็ก · ไม่มีรูป (โลโก้/ตรา/ลายเซ็นเป็น URL ภายนอก — ไม่ดึงเครือข่ายตอนสร้างไฟล์)
// 🔴 ใช้ได้เฉพาะ Node runtime (route ตั้ง `runtime = "nodejs"`) · `@react-pdf/renderer` อยู่ในรายการ serverExternalPackages ของ Next อยู่แล้ว
// 🔴 โหลดด้วย `import()` ตอนใช้: แพ็กเกจเป็น ESM ล้วน (exports มีแต่เงื่อนไข "import") — require() ของตัวรันสคริปต์ QC แก้ subpath ไม่ได้
import { join } from "node:path";
import type * as React from "react";
import type { Styles } from "@react-pdf/renderer";
import { formatThaiDateLong } from "@/lib/ui/date";
import type { PublicDocView } from "./public-doc";

const FONT_DIR = join(process.cwd(), "public", "fonts", "sarabun");
let fontsReady = false;
type ReactPdf = typeof import("@react-pdf/renderer");

/** ลงทะเบียนฟอนต์ครั้งเดียวต่อโพรเซส · ปิดการตัดคำของ react-pdf (มันใส่ "-" ที่จุดตัด — ผิดสำหรับภาษาไทย · R-Z62) ⇒ ตัดบรรทัดเองด้วย `wrapPdf` */
function ensureFonts(Font: ReactPdf["Font"]): void {
  if (fontsReady) return;
  Font.register({
    family: "Sarabun",
    fonts: [
      { src: join(FONT_DIR, "Sarabun-Regular.ttf"), fontWeight: 400 },
      { src: join(FONT_DIR, "Sarabun-Bold.ttf"), fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((word: string) => [word]);
  fontsReady = true;
}

// ── ตัดบรรทัดภาษาไทยเอง (ไม่มีขีด) ── react-pdf ตัดบรรทัดได้เฉพาะที่เว้นวรรค · ภาษาไทยไม่เว้นวรรคระหว่างคำ ⇒ ข้อความยาวล้นช่อง
//   ⇒ แบ่งคำด้วย Intl.Segmenter แล้วขึ้นบรรทัดใหม่ ("\n") ก่อนคำที่จะล้น · ความกว้างประเมินแบบเผื่อ (วัดจาก Sarabun: อักษรฐานไทยเฉลี่ย ~0.5–0.6 em ·
//   สระบน/ล่าง/วรรณยุกต์ = 0) ⇒ ใช้ 0.64 em (ตัวหนา 0.67) · เว้นวรรค 0.25 em — ตัดเร็วกว่าจริงเล็กน้อยได้ แต่ไม่ล้น
const COMBINING = /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/;
const SEG = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter("th", { granularity: "word" }) : null;
function textWidthPt(text: string, fontSize: number, bold: boolean): number {
  let em = 0;
  for (const ch of text) em += COMBINING.test(ch) ? 0 : ch === " " ? 0.25 : bold ? 0.67 : 0.64;
  return em * fontSize;
}
/** ข้อความ → ข้อความที่มี "\n" ตรงจุดตัดบรรทัด (ตามคำ) ให้พอดีความกว้าง `widthPt` · คำเดียวที่ยาวเกินบรรทัด ⇒ ตัดตามตัวอักษร (ไม่แยกสระ/วรรณยุกต์จากพยัญชนะ) */
export function wrapPdf(text: string, widthPt: number, fontSize: number, bold = false): string {
  if (!text) return text;
  return text
    .split("\n")
    .map((para) => {
      if (textWidthPt(para, fontSize, bold) <= widthPt) return para;
      const words = SEG ? Array.from(SEG.segment(para), (x) => x.segment) : para.split(/(\s+)/);
      const lines: string[] = [];
      let cur = "";
      const push = () => { if (cur.trim()) lines.push(cur.trimEnd()); cur = ""; };
      for (const w of words) {
        if (textWidthPt(cur + w, fontSize, bold) <= widthPt) { cur += w; continue; }
        push();
        if (textWidthPt(w, fontSize, bold) <= widthPt) { cur = w.trimStart(); continue; }
        // คำเดียวยาวเกินบรรทัด: ตัดตามกลุ่มอักษร (อักษรฐาน + เครื่องหมายบน/ล่าง ไม่แยกกัน)
        for (const g of Array.from(w.matchAll(/[^\u0E31\u0E34-\u0E3A\u0E47-\u0E4E][\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]*/g), (m) => m[0])) {
          if (textWidthPt(cur + g, fontSize, bold) > widthPt) push();
          cur += g;
        }
      }
      push();
      return lines.join("\n");
    })
    .join("\n");
}

/** ความกว้างของช่องต่าง ๆ (pt) — A4 กว้าง 595.28 · ขอบ 32 ซ้าย/ขวา */
const CONTENT_W = 595.28 - 64;
const BOX_W = CONTENT_W - 18; // padding 8×2 + เส้นขอบ
const SELLER_W = 300;
const descWidth = (vat: boolean) => (4 / (4 + 1.3 * 3 + (vat ? 0.8 : 0))) * CONTENT_W - 6;

const s: Styles = {
  page: { fontFamily: "Sarabun", fontSize: 10, padding: 32, color: "#111" },
  top: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#ccc", paddingBottom: 8 },
  org: { fontSize: 13, fontWeight: 700 },
  muted: { color: "#555", fontSize: 9 },
  title: { fontSize: 15, fontWeight: 700, textAlign: "right" },
  right: { textAlign: "right" },
  box: { borderWidth: 1, borderColor: "#ddd", borderRadius: 4, padding: 8, marginTop: 10 },
  th: { flexDirection: "row", borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#999", paddingVertical: 4, marginTop: 10, fontWeight: 700 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#e5e5e5", paddingVertical: 4 },
  cDesc: { flex: 4, paddingRight: 4 },
  cNum: { flex: 1.3, textAlign: "right" },
  cVat: { flex: 0.8, textAlign: "right" },
  sum: { marginTop: 8, marginLeft: "auto", width: 220 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  total: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderColor: "#333", marginTop: 3, paddingTop: 3, fontSize: 12, fontWeight: 700 },
  sig: { flexDirection: "row", marginTop: 36 },
  sigCell: { flex: 1, marginHorizontal: 12, borderTopWidth: 1, borderColor: "#999", paddingTop: 3, textAlign: "center", fontSize: 9 },
};

const money = (satang: number, en: boolean) => (satang / 100).toLocaleString(en ? "en-GB" : "th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateOf = (d: Date, en: boolean) => (en ? d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" }) : formatThaiDateLong(d));

/**
 * สระอำ (U+0E33) ⇒ นิคหิต + สระอา (U+0E4D U+0E32): ฟอนต์แตก "ำ" เป็น 2 glyph แต่ตัวจัดบรรทัดของ react-pdf นับเป็น 1 ตัวอักษร
 *   ⇒ ตัวอักษรท้ายข้อความหายไป 1 ตัวต่อ "ำ" 1 ตัว (เห็นจริง: "จำนวน" → "จำนว") · รูปแยกแสดงผลเหมือนเดิมทุกประการ
 */
export function pdfSafeThai(text: string): string {
  return text.replace(/\u0E33/g, "\u0E4D\u0E32");
}

function QuotationPdf({ v, R }: { v: PublicDocView; R: ReactPdf }) {
  const { Document, Page, View } = R;
  const RText = R.Text;
  /** Text ที่แก้สระอำทุกครั้ง (ลูกที่เป็นสตริงเท่านั้น) */
  const Text = ({ style, children }: { style?: Styles[string] | Styles[string][]; children?: React.ReactNode }) => (
    <RText style={style}>{Array.isArray(children) ? children.map((c) => (typeof c === "string" ? pdfSafeThai(c) : c)) : typeof children === "string" ? pdfSafeThai(children) : children}</RText>
  );
  const en = v.po.language === "EN";
  const L = v.po.labels;
  const show = v.po.show;
  const title = en && v.docType === "QUOTATION" ? "Quotation" : v.title;
  const vatCell = (bp: number) => (bp < 0 ? (en ? "Exempt" : "ยกเว้น") : bp === 0 ? "0%" : `${bp / 100}%`);
  const Row = ({ label, value }: { label: string; value: string }) => (
    <View style={s.row}>
      <Text style={s.muted}>{label}</Text>
      <Text>฿{value}</Text>
    </View>
  );
  return (
    <Document title={pdfSafeThai(`${title} ${v.docNo}`)} author={v.seller.name} creator="SHARK" producer="SHARK" language={en ? "en" : "th"}>
      <Page size="A4" style={s.page}>
        <View style={s.top}>
          <View style={{ maxWidth: 300 }}>
            <Text style={s.org}>{wrapPdf(v.seller.name, SELLER_W, 13, true)}</Text>
            {v.seller.address ? <Text style={s.muted}>{wrapPdf(v.seller.address, SELLER_W, 9)}</Text> : null}
            {v.seller.branch ? <Text style={s.muted}>{v.seller.branch}</Text> : null}
            {v.seller.taxId ? <Text style={s.muted}>{`${L.taxId} ${v.seller.taxId}`}</Text> : null}
            {v.seller.phone ? <Text style={s.muted}>{`${L.phone} ${v.seller.phone}`}</Text> : null}
          </View>
          <View>
            <Text style={s.title}>{title}</Text>
            <Text style={[s.muted, s.right]}>{`${L.docNo} ${v.docNo}`}</Text>
            <Text style={[s.muted, s.right]}>{`${L.date} ${dateOf(v.issueDate, en)}`}</Text>
            {show.dueDate && v.validUntil ? <Text style={[s.muted, s.right]}>{`${L.validUntil} ${dateOf(v.validUntil, en)}`}</Text> : null}
            {show.reference && v.reference ? <Text style={[s.muted, s.right]}>{`${L.reference} ${v.reference}`}</Text> : null}
          </View>
        </View>

        <View style={s.box}>
          <Text style={s.muted}>{L.buyer}</Text>
          <Text style={{ fontWeight: 700 }}>{wrapPdf(v.buyer.name || "—", BOX_W, 10, true)}</Text>
          {show.buyerAddress && v.buyer.address ? <Text style={s.muted}>{wrapPdf(v.buyer.address, BOX_W, 9)}</Text> : null}
          {(show.buyerTaxId && v.buyer.taxIdMasked) || v.buyer.branch ? (
            <Text style={s.muted}>{`${show.buyerTaxId && v.buyer.taxIdMasked ? `${L.taxId} ${v.buyer.taxIdMasked} ` : ""}${v.buyer.branch}`}</Text>
          ) : null}
        </View>

        <View style={s.th}>
          <Text style={s.cDesc}>{L.item}</Text>
          <Text style={s.cNum}>{L.qty}</Text>
          <Text style={s.cNum}>{L.unitPrice}</Text>
          {v.vatRegistered ? <Text style={s.cVat}>{L.vat}</Text> : null}
          <Text style={s.cNum}>{L.amount}</Text>
        </View>
        {v.lines.map((l, i) => (
          <View style={s.tr} key={i} wrap={false}>
            <Text style={s.cDesc}>{wrapPdf(l.description, descWidth(v.vatRegistered), 10)}</Text>
            <Text style={s.cNum}>{`${l.qty} ${l.unitName}`.trim()}</Text>
            <Text style={s.cNum}>{money(l.unitPrice, en)}</Text>
            {v.vatRegistered ? <Text style={s.cVat}>{vatCell(l.vatRateBp)}</Text> : null}
            <Text style={s.cNum}>{money(l.amount, en)}</Text>
          </View>
        ))}

        <View style={s.sum} wrap={false}>
          <Row label={L.subTotal} value={money(v.subTotal, en)} />
          {v.discountAmount > 0 ? <Row label={L.discount} value={`-${money(v.discountAmount, en)}`} /> : null}
          {v.depositDeducted > 0 ? <Row label={L.deposit} value={`-${money(v.depositDeducted, en)}`} /> : null}
          {v.vatRegistered ? <Row label={L.vatAmount} value={money(v.vatAmount, en)} /> : null}
          <View style={s.total}>
            <Text>{v.vatRegistered ? L.grandTotal : L.netTotal}</Text>
            <Text>฿{money(v.grandTotal, en)}</Text>
          </View>
        </View>

        {show.note && v.note ? <Text style={[s.muted, { marginTop: 10 }]}>{wrapPdf(`${L.note}: ${v.note}`, CONTENT_W, 9)}</Text> : null}
        {show.note && v.po.footerNote ? <Text style={s.muted}>{wrapPdf(v.po.footerNote, CONTENT_W, 9)}</Text> : null}
        {show.paymentTerms && v.po.paymentTerms ? <Text style={s.muted}>{wrapPdf(`${L.terms}: ${v.po.paymentTerms}`, CONTENT_W, 9)}</Text> : null}
        {v.channels.length > 0 ? (
          <View style={s.box} wrap={false}>
            <Text style={{ fontWeight: 700 }}>{L.channels}</Text>
            {v.channels.map((c) => (
              <Text key={c.id}>{wrapPdf([c.bankName, c.accountNo, c.accountName].filter(Boolean).join(" · ") || c.promptpayId || c.name, BOX_W, 10)}</Text>
            ))}
          </View>
        ) : null}
        {v.po.legalText ? <Text style={[s.muted, { fontSize: 8, marginTop: 6 }]}>{wrapPdf(v.po.legalText, CONTENT_W, 8)}</Text> : null}

        <View style={s.sig} wrap={false}>
          <Text style={s.sigCell}>{L.signature}</Text>
          <Text style={s.sigCell}>{L.buyerSignature}</Text>
        </View>
      </Page>
    </Document>
  );
}

/** มุมมองของหน้า A → ไฟล์ PDF (Buffer) */
export async function renderPublicDocumentPdf(v: PublicDocView): Promise<Buffer> {
  const R = await import("@react-pdf/renderer");
  ensureFonts(R.Font);
  return R.renderToBuffer(<QuotationPdf v={v} R={R} />);
}

/** ชื่อไฟล์: ASCII สำหรับ `filename` (อักขระอื่น ⇒ "_") + RFC 5987 `filename*` (UTF-8 ตรงตัว) */
export function pdfContentDisposition(docNo: string): string {
  const base = (docNo || "quotation").trim();
  const ascii = base.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80) || "quotation";
  return `attachment; filename="${ascii}.pdf"; filename*=UTF-8''${encodeURIComponent(`${base}.pdf`)}`;
}

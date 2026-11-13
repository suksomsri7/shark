// HR H3.6 ▸ หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) เป็น PDF — server เท่านั้น · brief R2 R11 · wo-notes/hr-H3.6-oracle.md §7
//   สร้างใหม่ทุกครั้งจากเนื้อหาที่แช่แข็งไว้ (contentJson — ผู้เรียกตรวจ sha ก่อน) · 2 หน้า = ฉบับที่ 1 / ฉบับที่ 2 (ข้อความกำกับตามแบบของกรม) ·
//   เนื้อหาและลำดับตามแบบ [V]: เล่มที่/เลขที่ · ผู้จ่าย/ผู้ถูกหัก · ลำดับที่ในแบบ + (1) ภ.ง.ด.1ก · แถว 40 (1) · ยอด + ตัวอักษร · กองทุน · เงื่อนไข (1) หัก ณ ที่จ่าย ·
//   ผู้ลงนาม + วันที่ออก · คำเตือน ม.35 · หมายเหตุ pdfNote ([U] PDF/อีเมล) — react-pdf ไม่ให้ไบต์ซ้ำกันทุกครั้ง (subset tag + /ID) ⇒ ไม่เก็บไบต์ ไม่เทียบไบต์
//   ฟอนต์ Sarabun (SIL OFL) อ่านจากไฟล์ในโปรเจกต์ · ตัดบรรทัดไทยด้วย wrapPdf (ตัวช่วยเดิมของ account/public-doc-pdf) ·
//   สระอำ: ไม่แตกเป็น ํ + า (pdfSafeThai) เพราะตาราง ToUnicode ของ subset จะผูก glyph นิคหิตกับ U+0E4D ⇒ คัดลอก/ค้นข้อความใน PDF ได้ "จากัด" แทน "จำกัด" ·
//     ใช้ ำ ตัวจริง + เติมช่องว่างท้ายบรรทัด 1 ตัวต่อ ำ 1 ตัว (ตัวจัดบรรทัดของ react-pdf นับ ำ = 1 แต่ฟอนต์ออก 2 glyph ⇒ ตัวท้ายบรรทัดหายเท่าจำนวน ำ — วัดแล้วว่าหายต่อบรรทัด) ·
//     ข้อความแรกของแต่ละน้ำหนักฟอนต์ในเอกสารมี "า" เดี่ยวก่อน ำ (หัวเรื่องตัวหนา · บรรทัด "ตามมาตรา" ตัวปกติ) ⇒ glyph "า" ผูกกับ U+0E32 ◂
import { join } from "node:path";
import type * as React from "react";
import type { Styles } from "@react-pdf/renderer";
import { wrapPdf } from "@/lib/modules/account/public-doc-pdf";
import { FILING_TEXT } from "./texts";
import type { TaxCertContent } from "./cert";

type ReactPdf = typeof import("@react-pdf/renderer");
const FONT_DIR = join(process.cwd(), "public", "fonts", "sarabun");
let fontsReady = false;
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

const W = 595.28 - 72; // A4 − ขอบ 36 × 2
const MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
/** "YYYY-MM-DD" → "1 กุมภาพันธ์ 2570" */
const thaiDay = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1] ?? ""} ${Number(d.slice(0, 4)) + 543}` : d);
/** สตางค์ → "#,##0.00" */
const money = (s: number) => {
  const n = Math.max(0, Math.trunc(Number(s) || 0));
  return `${Math.floor(n / 100).toLocaleString("en-US")}.${String(n % 100).padStart(2, "0")}`;
};
/** ำ ตัวจริง + ช่องว่างท้ายบรรทัดเท่าจำนวน ำ ของบรรทัดนั้น (ดูหัวไฟล์) */
export const pdfSaraAm = (text: string) =>
  text
    .split("\n")
    .map((l) => l + " ".repeat((l.match(/\u0E33/g) ?? []).length))
    .join("\n");
const COPY = [
  "ฉบับที่ 1 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้แนบพร้อมกับแบบแสดงรายการภาษี)",
  "ฉบับที่ 2 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย เก็บไว้เป็นหลักฐาน)",
];
const FORMS = ["(1) ภ.ง.ด.1ก", "(2) ภ.ง.ด.1ก พิเศษ", "(3) ภ.ง.ด.2", "(4) ภ.ง.ด.3", "(5) ภ.ง.ด.2ก", "(6) ภ.ง.ด.3ก", "(7) ภ.ง.ด.53"];
const CONDITIONS = ["(1) หัก ณ ที่จ่าย", "(2) ออกให้ตลอดไป", "(3) ออกให้ครั้งเดียว", "(4) อื่น ๆ"];
const WARNING = "คำเตือน ผู้มีหน้าที่ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย ฝ่าฝืนไม่ปฏิบัติตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร ต้องรับโทษทางอาญาตามมาตรา 35 แห่งประมวลรัษฎากร";

const s: Styles = {
  page: { fontFamily: "Sarabun", fontSize: 10, paddingVertical: 30, paddingHorizontal: 36, color: "#111" },
  copy: { fontSize: 9, textAlign: "right", color: "#333" },
  title: { fontSize: 15, fontWeight: 700, textAlign: "center", marginTop: 4 },
  sub: { fontSize: 11, textAlign: "center" },
  book: { flexDirection: "row", justifyContent: "flex-end", marginTop: 4 },
  box: { borderWidth: 1, borderColor: "#888", padding: 6, marginTop: 6 },
  label: { fontWeight: 700 },
  row: { flexDirection: "row" },
  th: { flexDirection: "row", borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#888", paddingVertical: 3, marginTop: 6, fontWeight: 700, fontSize: 9 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#ccc", paddingVertical: 3 },
  cType: { width: W * 0.46, paddingRight: 4 },
  cWhen: { width: W * 0.16, textAlign: "center" },
  cAmt: { width: W * 0.19, textAlign: "right" },
  small: { fontSize: 9 },
  muted: { fontSize: 8, color: "#444" },
};

function CertPage({ c, copy, R }: { c: TaxCertContent; copy: number; R: ReactPdf }) {
  const { Page, View } = R;
  const RText = R.Text;
  const Text = ({ style, children }: { style?: Styles[string] | Styles[string][]; children?: string }) => <RText style={style}>{pdfSaraAm(children ?? "")}</RText>;
  const row = c.rows[0]!;
  return (
    <Page size="A4" style={s.page}>
      <Text style={s.title}>หนังสือรับรองการหักภาษี ณ ที่จ่าย</Text>
      <Text style={s.sub}>ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</Text>
      <Text style={s.copy}>{COPY[copy]!}</Text>
      <View style={s.book}>
        <Text>{`เล่มที่ ${c.bookNo}    เลขที่ ${c.docNo}`}</Text>
      </View>
      <View style={s.box}>
        <Text style={s.label}>ผู้มีหน้าที่หักภาษี ณ ที่จ่าย</Text>
        <Text>{wrapPdf(`ชื่อ ${c.payer.name}`, W - 14, 10)}</Text>
        <Text>{`เลขประจำตัวผู้เสียภาษีอากร ${c.payer.taxId}    สาขาที่ ${c.payer.branchNo}`}</Text>
        <Text style={s.small}>{wrapPdf(`ที่อยู่ ${c.payer.address}`, W - 14, 9)}</Text>
      </View>
      <View style={s.box}>
        <Text style={s.label}>ผู้ถูกหักภาษี ณ ที่จ่าย</Text>
        <Text>{wrapPdf(`ชื่อ ${c.payee.name}`, W - 14, 10)}</Text>
        <Text>{`เลขประจำตัวผู้เสียภาษีอากร ${c.payee.taxId}`}</Text>
        <Text style={s.small}>{wrapPdf(`ที่อยู่ ${c.payee.address}`, W - 14, 9)}</Text>
      </View>
      <View style={s.box}>
        <Text>{`ลำดับที่ ${c.formSeq} ในแบบ`}</Text>
        <Text style={s.small}>{wrapPdf(FORMS.map((f, i) => `${i === 0 ? "[X]" : "[  ]"} ${f}`).join("   "), W - 14, 9)}</Text>
      </View>
      <View style={s.th}>
        <Text style={s.cType}>ประเภทเงินได้พึงประเมินที่จ่าย</Text>
        <Text style={s.cWhen}>วัน เดือน หรือปีภาษี ที่จ่าย</Text>
        <Text style={s.cAmt}>จำนวนเงินที่จ่าย</Text>
        <Text style={s.cAmt}>ภาษีที่หักและนำส่งไว้</Text>
      </View>
      <View style={s.tr}>
        <Text style={s.cType}>{wrapPdf(`${row.row}. ${row.label}`, W * 0.46 - 6, 10)}</Text>
        <Text style={s.cWhen}>{row.paidWhen}</Text>
        <Text style={s.cAmt}>{money(row.amountSatang)}</Text>
        <Text style={s.cAmt}>{money(row.taxSatang)}</Text>
      </View>
      <View style={s.tr}>
        <Text style={[s.cType, s.label]}>รวมเงินที่จ่ายและภาษีที่หักนำส่ง</Text>
        <Text style={s.cWhen}> </Text>
        <Text style={[s.cAmt, s.label]}>{money(c.totalSatang)}</Text>
        <Text style={[s.cAmt, s.label]}>{money(c.totalTaxSatang)}</Text>
      </View>
      <View style={s.box}>
        <Text>{wrapPdf(`รวมเงินภาษีที่หักนำส่ง (ตัวอักษร) ${c.totalTaxText}`, W - 14, 10)}</Text>
      </View>
      <View style={s.box}>
        <Text style={s.small}>{`เงินที่จ่ายเข้า กบข./กสจ./กองทุนสงเคราะห์ครูโรงเรียนเอกชน ${money(c.funds.govSatang)} บาท`}</Text>
        <Text style={s.small}>{`กองทุนประกันสังคม ${money(c.funds.ssoSatang)} บาท`}</Text>
        <Text style={s.small}>{`กองทุนสำรองเลี้ยงชีพ ${money(c.funds.providentSatang)} บาท`}</Text>
      </View>
      <View style={s.box}>
        <Text style={s.small}>{`ผู้จ่ายเงิน   ${CONDITIONS.map((x, i) => `${i + 1 === c.payCondition ? "[X]" : "[  ]"} ${x}`).join("   ")}`}</Text>
      </View>
      <View style={s.box}>
        <Text style={s.small}>ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ</Text>
        <Text style={{ marginTop: 14 }}>{"ลงชื่อ ................................................ ผู้จ่ายเงิน"}</Text>
        <Text>{wrapPdf(`(${c.signerName})`, W - 14, 10)}</Text>
        <Text>{`วันที่ออกหนังสือรับรอง ${thaiDay(c.issueDate)}`}</Text>
      </View>
      <Text style={[s.muted, { marginTop: 6 }]}>{wrapPdf(WARNING, W, 8)}</Text>
      <Text style={[s.muted, { marginTop: 3 }]}>{wrapPdf(FILING_TEXT.pdfNote, W, 8)}</Text>
    </Page>
  );
}

/** เนื้อหาที่แช่แข็งไว้ → PDF 2 หน้า (ฉบับที่ 1 / 2) */
export async function renderTaxCertPdf(content: TaxCertContent): Promise<Uint8Array> {
  const R = await import("@react-pdf/renderer");
  ensureFonts(R.Font);
  const { Document } = R;
  const doc = (
    <Document title={`หนังสือรับรองการหักภาษี ณ ที่จ่าย ${content.docNo}`} creator="SHARK" producer="SHARK" language="th">
      <CertPage c={content} copy={0} R={R} />
      <CertPage c={content} copy={1} R={R} />
    </Document>
  );
  const buf = await R.renderToBuffer(doc as React.ReactElement<import("@react-pdf/renderer").DocumentProps>);
  return new Uint8Array(buf);
}

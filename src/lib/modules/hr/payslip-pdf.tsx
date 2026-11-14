// HR H3.8 ▸ สลิปเงินเดือน + หนังสือรับรองเงินเดือน เป็น PDF — server เท่านั้น · brief R9 (ทางเดียวกับ filings/cert-pdf.tsx ของ H3.6)
//   react-pdf + ฟอนต์ Sarabun จาก public/fonts/sarabun + wrapPdf (account/public-doc-pdf) · ไม่มีไลบรารีใหม่ · ไบต์ไม่ถูกเก็บ (สร้างใหม่ทุกครั้ง)
//   สลิป: ตัวเลขจาก DTO ของ slipView (รายได้ก่อนรายการหัก) · บัญชีธนาคารแสดงแบบ •••4 ตัวท้ายเท่านั้น (บัญชีที่บันทึกในระบบตอนนี้) · ไม่มีเลขประจำตัวประชาชน ·
//   หนังสือรับรอง: เนื้อหาที่แช่แข็งไว้ (ผู้เรียกตรวจ sha ก่อน) · ภาษาไทยอย่างเดียว (Q13) · ไม่มีเลขประจำตัวประชาชน (Q6)
//   สระอำ: ใช้ pdfSaraAm ของ H3.6 · ข้อความแรกของแต่ละน้ำหนักฟอนต์มี "า" เดี่ยวก่อน ำ (เหตุผลดูหัวไฟล์ cert-pdf.tsx) ◂
import { join } from "node:path";
import type * as React from "react";
import type { Styles } from "@react-pdf/renderer";
import { wrapPdf } from "@/lib/modules/account/public-doc-pdf";
import { pdfSaraAm } from "./filings/cert-pdf";
import { SLIP_TEXT, type SalaryCertContent, type SlipLine } from "./payslip-rules";

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

const W = 595.28 - 80; // A4 − ขอบ 40 × 2
const MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
/** "YYYY-MM-DD" → "2 ตุลาคม 2569" */
const thaiDay = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1] ?? ""} ${Number(d.slice(0, 4)) + 543}` : "-");
/** "YYYY-MM" → "กันยายน 2569" */
const thaiMonth = (p: string) => (/^\d{4}-\d{2}$/.test(p) ? `${MONTHS[Number(p.slice(5, 7)) - 1] ?? ""} ${Number(p.slice(0, 4)) + 543}` : p);
/** สตางค์ (มีเครื่องหมาย) → "#,##0.00" */
export const pdfMoney = (s: number) => {
  const n = Math.trunc(Number(s) || 0);
  const a = Math.abs(n);
  return `${n < 0 ? "-" : ""}${Math.floor(a / 100).toLocaleString("en-US")}.${String(a % 100).padStart(2, "0")}`;
};
/** ป้ายบรรทัด (ไทย) */
export const LINE_LABEL_TH: Record<string, string> = {
  BASE: "เงินเดือน",
  DAY_WAGE: "ค่าจ้างรายวัน",
  HOUR_WAGE: "ค่าจ้างรายชั่วโมง",
  HOLIDAY_PAY: "ค่าจ้างวันหยุด",
  HOLIDAY_WORK: "ค่าทำงานในวันหยุด",
  PRORATION: "ปรับตามวันที่ทำงานจริงในงวด",
  UNPAID_LEAVE: "ลาไม่รับค่าจ้าง",
  UNPAID_CAP: "ลาเกินวันที่รับค่าจ้าง",
  OT: "ค่าล่วงเวลา (OT)",
  COMMISSION: "ค่าคอมมิชชั่น",
  BONUS: "โบนัส",
  ALLOWANCE: "เบี้ยเลี้ยง",
  REFUND: "คืนเงินรายการหัก",
  LATE_RULE: "หักมาสาย",
  ABSENT_RULE: "หักขาดงาน",
  ADVANCE: "หักเบิกล่วงหน้า",
  DEDUCTION: "หักเงินอื่น ๆ",
  V1_OTHER: "รายการอื่น (รอบเดิม)",
  SSO: "ประกันสังคม (ส่วนลูกจ้าง)",
  WHT: "ภาษีหัก ณ ที่จ่าย",
};
/** จำนวนที่เก็บไว้เท่านั้น: วัน (PRORATION เก็บเป็นวัน) · ชั่วโมง (นาที ÷ 60) · จำนวนรายการ */
export function qtyTextTh(l: SlipLine): string {
  if (l.qty !== null && l.qty > 0) return l.code === "PRORATION" ? `${l.qty} วัน` : `${Math.round((l.qty / 60) * 100) / 100} ชม.`;
  return l.count > 1 ? `${l.count} รายการ` : "";
}

/** วรรณยุกต์ + ำ (เช่น "น้ำ"): ฟอนต์รวมเป็น glyph ที่ไม่มีรหัสในตาราง ToUnicode ⇒ คัดลอก/ค้นข้อความใน PDF ไม่ได้ — คั่นด้วย ZWNJ ให้ได้ glyph ำ ปกติ
 *  (ภาพ: วรรณยุกต์ซ้อนนิคหิตเล็กน้อย · ยอมรับเพื่อให้ชื่อคนค้นได้) */
const pdfToneAm = (text: string) => text.replace(/([\u0E48-\u0E4B])\u0E33/g, "$1\u200C\u0E33");
export type SlipPdfDto = {
  periodKey: string;
  payDate: string | null;
  status: string;
  employee: { name: string; position: string | null; code: string | null };
  earnings: SlipLine[];
  deductions: SlipLine[];
  earningsSatang: number;
  deductionsSatang: number;
  netSatang: number;
  ssoBaseSatang: number;
  employerSsoSatang: number;
  bankMasked: string | null;
};

const s: Styles = {
  page: { fontFamily: "Sarabun", fontSize: 10.5, paddingVertical: 36, paddingHorizontal: 40, color: "#111" },
  title: { fontSize: 16, fontWeight: 700, textAlign: "center" },
  sub: { fontSize: 11, textAlign: "center", marginTop: 2 },
  box: { borderWidth: 1, borderColor: "#999", borderRadius: 4, padding: 8, marginTop: 8 },
  h: { fontSize: 10, fontWeight: 700, color: "#444", marginBottom: 3 },
  row: { flexDirection: "row", paddingVertical: 2 },
  label: { width: W * 0.5 },
  qty: { width: W * 0.2, color: "#555" },
  amt: { width: W * 0.24, textAlign: "right" },
  tot: { flexDirection: "row", paddingTop: 3, marginTop: 2, borderTopWidth: 1, borderColor: "#333", fontWeight: 700 },
  net: { flexDirection: "row", marginTop: 8, padding: 8, borderWidth: 1.5, borderColor: "#111", borderRadius: 4, fontWeight: 700, fontSize: 13 },
  muted: { fontSize: 8.5, color: "#444", marginTop: 6 },
  p: { marginTop: 8, lineHeight: 1.5 },
};

function SlipPage({ d, employerName, R }: { d: SlipPdfDto; employerName: string; R: ReactPdf }) {
  const { Page, View } = R;
  const RText = R.Text;
  const Text = ({ style, children }: { style?: Styles[string] | Styles[string][]; children?: string }) => <RText style={style}>{pdfSaraAm(pdfToneAm(children ?? ""))}</RText>;
  const Line = ({ l, minus }: { l: SlipLine; minus: boolean }) => (
    <View style={s.row}>
      <Text style={s.label}>{wrapPdf(LINE_LABEL_TH[l.code] ?? l.code, W * 0.5 - 4, 10.5)}</Text>
      <Text style={s.qty}>{qtyTextTh(l)}</Text>
      <Text style={s.amt}>{`${minus && l.amountSatang > 0 ? "-" : ""}${pdfMoney(l.amountSatang)}`}</Text>
    </View>
  );
  return (
    <Page size="A4" style={s.page}>
      <Text style={s.title}>ใบแจ้งรายการเงินเดือน (สลิป)</Text>
      <Text style={s.sub}>{wrapPdf(`นายจ้าง ${employerName}`, W, 11)}</Text>
      <Text style={s.sub}>{`งวด ${thaiMonth(d.periodKey)} · วันที่จ่าย ${thaiDay(d.payDate)}`}</Text>
      <View style={s.box}>
        <Text>{wrapPdf(`พนักงาน ${d.employee.name}${d.employee.code ? ` (รหัส ${d.employee.code})` : ""}`, W - 16, 10.5)}</Text>
        {d.employee.position ? <Text>{wrapPdf(`ตำแหน่ง ${d.employee.position}`, W - 16, 10.5)}</Text> : null}
      </View>
      <View style={s.box}>
        <Text style={s.h}>รายได้</Text>
        {d.earnings.map((l) => (
          <Line key={`e-${l.code}`} l={l} minus={false} />
        ))}
        <View style={s.tot}>
          <Text style={s.label}>รวมรับ</Text>
          <Text style={s.qty}> </Text>
          <Text style={s.amt}>{pdfMoney(d.earningsSatang)}</Text>
        </View>
      </View>
      <View style={s.box}>
        <Text style={s.h}>รายการหัก</Text>
        {d.deductions.map((l) => (
          <Line key={`d-${l.code}`} l={l} minus />
        ))}
        <View style={s.tot}>
          <Text style={s.label}>รวมหัก</Text>
          <Text style={s.qty}> </Text>
          <Text style={s.amt}>{`${d.deductionsSatang > 0 ? "-" : ""}${pdfMoney(d.deductionsSatang)}`}</Text>
        </View>
      </View>
      <View style={s.net}>
        <Text style={s.label}>รับสุทธิ</Text>
        <Text style={s.qty}> </Text>
        <Text style={s.amt}>{pdfMoney(d.netSatang)}</Text>
      </View>
      {d.bankMasked ? <Text style={s.p}>{wrapPdf(`บัญชีรับเงินที่บันทึกในระบบตอนนี้ ${d.bankMasked}`, W, 10.5)}</Text> : null}
      <Text style={s.p}>{`ประกันสังคม: ฐานที่บันทึกในรอบ ${pdfMoney(d.ssoBaseSatang)} · ส่วนนายจ้างสมทบ ${pdfMoney(d.employerSsoSatang)}`}</Text>
      <Text style={s.muted}>{wrapPdf(SLIP_TEXT.slipNote, W, 8.5)}</Text>
    </Page>
  );
}

/** DTO ของสลิป (ISSUED) → PDF 1 หน้า */
export async function renderPayslipPdf(dto: SlipPdfDto, opts: { employerName: string }): Promise<Uint8Array> {
  const R = await import("@react-pdf/renderer");
  ensureFonts(R.Font);
  const { Document } = R;
  const doc = (
    <Document title={`สลิปเงินเดือน ${dto.periodKey}`} creator="SHARK" producer="SHARK" language="th">
      <SlipPage d={dto} employerName={opts.employerName} R={R} />
    </Document>
  );
  return new Uint8Array(await R.renderToBuffer(doc as React.ReactElement<import("@react-pdf/renderer").DocumentProps>));
}

const PURPOSE_TH: Record<string, string> = { GENERAL: "ใช้ทั่วไป", BANK: "ยื่นธนาคาร/สถาบันการเงิน", VISA: "ยื่นขอวีซ่า", RENTAL: "ยื่นเช่าที่พัก", OTHER: "อื่น ๆ" };

function CertPage({ c, R }: { c: SalaryCertContent; R: ReactPdf }) {
  const { Page, View } = R;
  const RText = R.Text;
  const Text = ({ style, children }: { style?: Styles[string] | Styles[string][]; children?: string }) => <RText style={style}>{pdfSaraAm(pdfToneAm(children ?? ""))}</RText>;
  const e = c.employee;
  const tenure = e.startDate ? `ตั้งแต่วันที่ ${thaiDay(e.startDate)}${e.active ? " จนถึงปัจจุบัน" : e.endDate ? ` ถึงวันที่ ${thaiDay(e.endDate)}` : ""}` : "";
  const body =
    `ขอรับรองว่า ${e.name}${e.position ? ` ตำแหน่ง ${e.position}` : ""} ${e.active ? "เป็นพนักงานของ" : "เคยเป็นพนักงานของ"} ${c.employer.name}${tenure ? ` ${tenure}` : ""} ` +
    `โดยได้รับเงินเดือนประจำเดือนละ ${pdfMoney(c.salary.amountSatang)} บาท (${c.salary.words}) ตามสลิปเงินเดือนงวด ${thaiMonth(c.salary.periodKey)}`;
  return (
    <Page size="A4" style={s.page}>
      <Text style={s.title}>หนังสือรับรองเงินเดือน</Text>
      <Text style={[s.sub, { textAlign: "right" }]}>{`เลขที่ ${c.docNo}`}</Text>
      <Text style={[s.sub, { textAlign: "right" }]}>{`วันที่ ${thaiDay(c.issueDate)}`}</Text>
      <Text style={s.p}>{wrapPdf(body, W, 10.5)}</Text>
      <Text style={s.p}>{`วัตถุประสงค์: ${PURPOSE_TH[c.purpose] ?? c.purpose}`}</Text>
      <View style={s.box}>
        <Text>{wrapPdf(`นายจ้าง ${c.employer.name}`, W - 16, 10.5)}</Text>
        {c.employer.address ? <Text>{wrapPdf(`ที่อยู่ ${c.employer.address}`, W - 16, 10.5)}</Text> : null}
      </View>
      <Text style={[s.p, { marginTop: 28, textAlign: "right" }]}>{"ลงชื่อ ................................................"}</Text>
      <Text style={[s.p, { textAlign: "right" }]}>{wrapPdf(`(${c.signerName})`, W, 10.5)}</Text>
      <Text style={s.muted}>{wrapPdf(c.disclaimer, W, 8.5)}</Text>
    </Page>
  );
}

/** เนื้อหาที่แช่แข็งไว้ → PDF 1 หน้า */
export async function renderSalaryCertPdf(content: SalaryCertContent): Promise<Uint8Array> {
  const R = await import("@react-pdf/renderer");
  ensureFonts(R.Font);
  const { Document } = R;
  const doc = (
    <Document title={`หนังสือรับรองเงินเดือน ${content.docNo}`} creator="SHARK" producer="SHARK" language="th">
      <CertPage c={content} R={R} />
    </Document>
  );
  return new Uint8Array(await R.renderToBuffer(doc as React.ReactElement<import("@react-pdf/renderer").DocumentProps>));
}
// ◂ HR H3.8

// report-print-shared.ts — POS P2.12 ▸ PD แบบพิมพ์ A4 ของรายงาน (brief P2.12 §4 · มติ 2 · CD-2 CD-3) ◂
// PDF = "พิมพ์เป็น PDF" ของเบราว์เซอร์จากหน้า pos/reports/print (การ์ด U) — ไฟล์นี้ให้ "แบบ" (model) + HTML ที่หน้านั้นแสดง
// 🔴 บริสุทธิ์: ไม่แตะ prisma/db/session · ไม่อ่านนาฬิกา/สุ่ม/env — generatedAt มาจากอินพุตเท่านั้น (envelope.generatedAt ของรายงานไม่ถูกใช้ · ⚠️7)
//    ⇒ อินพุตเดียวกัน = HTML เดียวกันทุกไบต์ (ข้อสอบเทียบ sha256)
// 🔴 ตัวเลข/ข้อความของตาราง = แถว CSV ของรายงาน (reportCsvRows) ช่องต่อช่อง · หัวตารางไทย = CSV_HEADERS (ค่าคงที่อยู่ใน reports.ts — CD-2 อนุญาต import ค่า)
// 🔴 ทุกข้อความผ่าน esc() (& < > " ') · ไม่มี <script> (หน้า print เรียก window.print() เองฝั่ง client)
import { CSV_HEADERS, REPORT_TOTAL_ROW_KINDS, reportRowsNotice, reportTableRows, type AnyReport, type ReportKind } from "./reports"; // POS P2.12 ▸ fix1 F2 H2 ◂

export type ReportPrintLocale = "th" | "en";
export type ReportPrintOptions = {
  locale: string;
  /** ISO เวลาที่สร้าง (ผู้เรียกส่งมา — action ใช้เวลาตอนรับคำขอ) */
  generatedAt: string;
  shopName: string;
  /** ชื่อสาขา หรือ "ทุกสาขา" / "All branches" */
  unitLabel: string;
};
export type ReportPrintModel = {
  kind: ReportKind;
  from: string;
  to: string;
  locale: ReportPrintLocale;
  generatedAt: string;
  shopName: string;
  unitLabel: string;
  title: string;
  /** หัวตาราง (th = CSV_HEADERS[kind] ตรงตัว · en = แปลจำนวนช่องเท่ากัน) */
  headers: string[];
  /** แถวข้อมูล + แถวรวม (ถ้ารายงานชนิดนั้นมี) เป็นข้อความทีละช่อง — th = แถว CSV ตรงตัว */
  rows: string[][];
  /** POS P2.12 ▸ fix1 F2: แถวสุดท้ายของ rows คือแถว "รวม" (ตัดสินจากชนิดรายงาน — ไม่เทียบข้อความในช่อง) ◂ */
  totalRow: boolean;
  /** POS P2.12 ▸ fix1 H2: บรรทัดแจ้งเมื่อถูกตัดแถว ("แสดง N จาก M แถว" / "Showing N of M rows") · ไม่ถูกตัด = null ◂ */
  notice: string | null;
};

const TITLE: Record<ReportPrintLocale, Record<ReportKind, string>> = {
  th: {
    daily: "รายงานยอดขายรายวัน",
    products: "รายงานสินค้าขายดี",
    staff: "รายงานยอดต่อพนักงาน",
    payments: "รายงานวิธีชำระเงิน",
    margin: "รายงานกำไรขั้นต้น",
    shifts: "รายงานกะและเงินขาด/เกิน",
    tax: "รายงานภาษีขาย",
    channels: "รายงานช่องทางการขาย",
    branches: "รายงานเปรียบเทียบสาขา",
    hourly: "รายงานยอดขายรายชั่วโมง",
    anomalies: "รายงานจุดผิดปกติของพนักงาน",
    commission: "รายงานค่าคอมฯ พนักงานขาย", // POS P3.5 ◂
    credit: "รายงานลูกหนี้วางบิล (เครดิตเทอม)", // POS P3.6 ▸ R9 (REPORT_KINDS ต่อท้าย credit ⇒ แผนที่ชนิดต้องครบ) ◂
  },
  en: {
    daily: "Daily sales report",
    products: "Top products report",
    staff: "Sales by staff report",
    payments: "Payment methods report",
    margin: "Gross margin report",
    shifts: "Shifts and over/short report",
    tax: "Output VAT report",
    channels: "Sales channels report",
    branches: "Branch comparison report",
    hourly: "Hourly sales report",
    anomalies: "Staff anomaly report",
    commission: "Staff sales commission report", // POS P3.5 ◂
    credit: "On-account receivables report", // POS P3.6 ▸ R9 ◂
  },
};
/** หัวตารางภาษาอังกฤษ (ลำดับเดียวกับ CSV_HEADERS) — จำนวนช่องไม่เท่า = ใช้หัวไทย (กันตารางเลื่อนช่อง) */
const EN_HEADERS: Record<ReportKind, string[]> = {
  daily: ["Date", "Bills", "Gross", "Discount", "Service charge", "Net sales", "VAT", "Net ex VAT", "Tips", "Voided bills", "Voided total", "Average bill", "Refunds", "Refunded total"], // POS P2.14 ▸ API-11 · fix1 F11: ต่อท้าย ◂
  products: ["Code", "Name", "Qty", "Weight (g)", "Bills", "Gross", "Line discount", "Sales"],
  staff: ["User ID", "Name", "Bills", "Net sales", "Discount", "Tips", "Voided bills", "Voided total", "Average bill"],
  payments: ["Method", "Code", "Payments", "Bills", "Received"],
  margin: ["Code", "Name", "Qty", "Sales", "Cost", "Estimated cost", "Gross margin", "Margin (%)"],
  shifts: ["Shift", "Z no.", "Branch", "Device", "Status", "Opened by", "Opened at", "Closed at", "Bills", "Sales", "Expected cash", "Counted cash", "Over/short"],
  tax: ["Date", "Branch", "First no.", "Last no.", "Bills", "Total incl. VAT", "Tax base", "VAT", "Non-VAT total", "Voided bills", "Voided nos."],
  channels: ["Channel code", "Channel", "Bills", "Sales", "Refunds", "Commission", "Commission VAT", "Net after commission", "Share (%)"],
  branches: ["Branch", "Bills", "Net sales", "Average bill", "Refunds", "Refund total", "Voided bills", "Voided total", "Cash", "Platform", "Commission", "Commission VAT", "Over/short"],
  hourly: ["Hour", "Bills", "Net sales", "Forecast (4-week average)"],
  anomalies: ["Rule", "Finding", "Branch", "Date", "Staff", "Ref type", "Ref ID", "Value", "Threshold", "Count"], // POS P2.12 ▸ fix1 F1 ◂
  commission: ["User ID", "Name", "Earned", "Reversed", "Net", "Sent to payroll", "Not sent", "No HR employee", "HR status"], // POS P3.5 ◂
  credit: ["Company ID (party)", "Company", "On-account bills", "On-account total", "Refunded", "Outstanding", "Overdue", "Oldest due date"], // POS P3.6 ▸ R9 ◂
};
const LABEL: Record<ReportPrintLocale, { range: string; unit: string; generatedAt: string; empty: string; total: string; rows: string }> = {
  th: { range: "ช่วงวันที่", unit: "สาขา", generatedAt: "พิมพ์เมื่อ", empty: "ไม่มีข้อมูลในช่วงนี้", total: "รวม", rows: "แถว" },
  en: { range: "Date range", unit: "Branch", generatedAt: "Generated", empty: "No data in this range", total: "Total", rows: "rows" },
};
// POS P2.12U ▸ มติ 4 · F5 (deviation ที่ prompt อนุญาต — แผนที่ป้ายอังกฤษจุดเดียว): แบบพิมพ์ en ของ anomalies เคยมีป้ายกฎไทย (ANOMALY_RULE_LABEL_TH) ·
//   คำเชื่อมเกณฑ์ "หรือ" · คำ "ขาด/เกิน" ของช่อง A8 — en แทนเฉพาะ 3 ช่องนี้ (ป้ายเดียวกับ pos.report.anomaly.rules ของ en) · แถว th = CSV ทุกช่องเหมือนเดิม ◂
const ANOMALY_LABEL_EN: Readonly<Record<string, string>> = {
  A1: "Frequent voids",
  A2: "Frequent refunds",
  A3: "High discount (staff)",
  A4: "High discount (bill)",
  A5: "Frequent overrides",
  A6: "Custom prices",
  A7: "Repeated reprints",
  A8: "Cash over/short",
  A9: "Repeated cash shortage",
  A10: "Rejected/cancelled orders",
  A11: "Frequent schedule overrides", // POS P3.9 ▸ R11 ◂
};
const enAnomalyRow = (r: string[]): string[] =>
  r.map((c, i) => (i === 1 ? (ANOMALY_LABEL_EN[r[0] ?? ""] ?? c) : i === 7 ? c.replace(/^ขาด /, "short ").replace(/^เกิน /, "over ") : i === 8 ? c.split(" หรือ ").join(" or ") : c));

/** แบบพิมพ์ของรายงานที่สำเร็จ (บริสุทธิ์) */
export function buildReportPrint(report: AnyReport, opts: ReportPrintOptions): ReportPrintModel {
  const locale: ReportPrintLocale = opts.locale === "en" ? "en" : "th";
  const kind = report.kind;
  const th = CSV_HEADERS[kind];
  const en = EN_HEADERS[kind];
  const csvRows = reportTableRows(report); // POS P2.12 ▸ fix1 H2: แถวตาราง = แถว CSV ไม่รวมบรรทัดแจ้ง (บรรทัดแจ้ง → notice) ◂
  const rows = locale === "en" && kind === "anomalies" ? csvRows.map(enAnomalyRow) : csvRows; // POS P2.12U ▸ F5 ◂
  const totalRow = REPORT_TOTAL_ROW_KINDS.has(kind) && rows.length > 0; // POS P2.12 ▸ fix1 F2 ◂
  return {
    kind,
    from: report.from,
    to: report.to,
    locale,
    generatedAt: opts.generatedAt,
    shopName: opts.shopName,
    unitLabel: opts.unitLabel,
    title: TITLE[locale][kind],
    headers: locale === "en" && en.length === th.length ? [...en] : [...th],
    // en: แถวรวมขึ้น "Total" · ช่องอื่นคงเดิม (ชื่อสินค้า/สาขา/ป้ายกฎเป็นข้อมูลของร้าน) — POS P2.12 ▸ fix1 F2: เฉพาะแถวสุดท้ายเมื่อ totalRow (สาขาชื่อ "รวม" ไม่ถูกเปลี่ยน) ◂
    rows: locale === "en" && totalRow ? rows.map((r, i) => (i === rows.length - 1 ? [LABEL.en.total, ...r.slice(1)] : r)) : rows,
    totalRow,
    notice: reportRowsNotice(report, locale), // POS P2.12 ▸ fix1 H2 ◂
  };
}

const esc = (v: string): string => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const pad2 = (n: number) => String(n).padStart(2, "0");
/** ISO → "YYYY-MM-DD HH:mm" เวลาไทย ด้วยเลขคณิตล้วน (ไม่สร้างออบเจกต์เวลา) · อ่านไม่ได้ = ข้อความเดิม */
function bkkStamp(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const ms = t + 7 * 3_600_000;
  const days = Math.floor(ms / 86_400_000);
  const rest = ms - days * 86_400_000;
  // วันจากยุค → ปี/เดือน/วัน (civil-from-days ของ H. Hinnant)
  const z = days + 719_468;
  const era = Math.floor(z / 146_097);
  const doe = z - era * 146_097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  return `${y}-${pad2(m)}-${pad2(d)} ${pad2(Math.floor(rest / 3_600_000))}:${pad2(Math.floor((rest % 3_600_000) / 60_000))}`;
}
const NUMERIC = /^-?\d+(\.\d+)?$/;
/** ตารางกว้าง (> 9 ช่อง) พิมพ์แนวนอน */
const WIDE_COLUMNS = 9;

/** HTML ทั้งหน้า (A4 · @page · หัวตารางซ้ำทุกหน้า · แถวไม่ขาดกลางหน้า) — กำหนดได้ (deterministic) จาก model เท่านั้น */
export function renderReportPrintHtml(model: ReportPrintModel): string {
  const L = LABEL[model.locale === "en" ? "en" : "th"];
  const wide = model.headers.length > WIDE_COLUMNS;
  const range = model.from === model.to ? model.from : `${model.from} – ${model.to}`;
  const head = model.headers.map((h) => `<th scope="col">${esc(h)}</th>`).join("");
  const body = model.rows.length
    ? model.rows
        .map((r, i) => {
          const total = model.totalRow && i === model.rows.length - 1; // POS P2.12 ▸ fix1 F2 ◂
          return `<tr${total ? ' class="total"' : ""}>${r.map((c) => `<td${NUMERIC.test(c) ? ' class="n"' : ""}>${esc(c)}</td>`).join("")}</tr>`;
        })
        .join("\n")
    : `<tr><td class="empty" colspan="${model.headers.length}">${esc(L.empty)}</td></tr>`;
  const css = [
    `@page { size: A4${wide ? " landscape" : ""}; margin: 12mm 10mm; }`,
    "* { box-sizing: border-box; }",
    'body { margin: 0; font-family: "IBM Plex Sans Thai", system-ui, sans-serif; color: #111; font-size: 10pt; }',
    "header { margin-bottom: 8px; }",
    "h1 { font-size: 14pt; margin: 0 0 2px; }",
    ".shop { font-size: 11pt; font-weight: 600; }",
    ".meta { color: #444; font-size: 9pt; }",
    "table { width: 100%; border-collapse: collapse; }",
    "thead { display: table-header-group; }",
    "tr { break-inside: avoid; page-break-inside: avoid; }",
    "th, td { border-bottom: 1px solid #ccc; padding: 3px 4px; text-align: left; vertical-align: top; }",
    "th { background: #f2f2f2; font-weight: 600; }",
    "td.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }",
    "tr.total td { font-weight: 700; border-top: 2px solid #111; }",
    "td.empty { text-align: center; color: #666; padding: 12px; }",
    "footer { margin-top: 6px; color: #666; font-size: 8pt; }",
    ".notice { margin-top: 6px; font-weight: 600; }", // POS P2.12 ▸ fix1 H2 ◂
  ].join("\n");
  return [
    "<!doctype html>",
    `<html lang="${model.locale === "en" ? "en" : "th"}">`,
    "<head>",
    '<meta charset="utf-8">',
    `<meta name="generated-at" content="${esc(model.generatedAt)}">`,
    `<title>${esc(`${model.title} · ${model.shopName} · ${range}`)}</title>`,
    `<style>\n${css}\n</style>`,
    "</head>",
    `<body data-kind="${esc(model.kind)}">`,
    "<header>",
    `<div class="shop">${esc(model.shopName)}</div>`,
    `<h1>${esc(model.title)}</h1>`,
    `<div class="meta">${esc(L.range)} ${esc(range)} · ${esc(L.unit)} ${esc(model.unitLabel)} · ${esc(L.generatedAt)} ${esc(bkkStamp(model.generatedAt))}</div>`,
    "</header>",
    `<table>\n<thead><tr>${head}</tr></thead>\n<tbody>\n${body}\n</tbody>\n</table>`,
    ...(model.notice ? [`<p class="notice">${esc(model.notice)}</p>`] : []), // POS P2.12 ▸ fix1 H2 ◂
    `<footer>${esc(`${model.rows.length} ${L.rows}`)}</footer>`,
    "</body>",
    "</html>",
  ].join("\n");
}

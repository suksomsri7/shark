// SVC H.7 ▸ รายงานโรงแรม — ตัวช่วยแสดงผล (pure ล้วน: ไม่มี directive · ไม่ import ค่า) · ใบสั่ง h.7 §2.7 §4
//   เงินแสดงจากสตางค์ ÷ 100 ทศนิยม 2 · เปอร์เซ็นต์จาก bp ÷ 100 ทศนิยม 1 · วันที่ไทยแบบย่อ (พ.ศ.)

export type ReportTabKey = "occupancy" | "revenue" | "funnel" | "forecast" | "housekeeping" | "deposits";
export type ReportColumn = { key: string; label: string; kind: "text" | "int" | "baht" | "pct" | "num" };

/** แท็บของหน้ารายงาน (ลำดับบนจอ) · ส่งออก CSV ใช้ชื่อ kind เดียวกับ exportCsv */
export const REPORT_TABS: { key: ReportTabKey; label: string; csvKind: string }[] = [
  { key: "occupancy", label: "อัตราเข้าพัก", csvKind: "occupancy" },
  { key: "revenue", label: "รายได้", csvKind: "revenue" },
  { key: "funnel", label: "การจอง", csvKind: "funnel" },
  { key: "forecast", label: "ล่วงหน้า 30 วัน", csvKind: "forecast" },
  { key: "housekeeping", label: "แม่บ้าน", csvKind: "housekeeping" },
  { key: "deposits", label: "มัดจำ", csvKind: "deposits" },
];
export const REVENUE_GROUPS: { key: "source" | "ratePlan" | "roomType"; label: string }[] = [
  { key: "source", label: "ตามแหล่งจอง" },
  { key: "ratePlan", label: "ตามแผนราคา" },
  { key: "roomType", label: "ตามประเภทห้อง" },
];

export const isTabKey = (v: unknown): v is ReportTabKey => typeof v === "string" && REPORT_TABS.some((t) => t.key === v);

/** สตางค์ ⇒ "฿1,234.50" */
export function fmtBaht(satang: number): string {
  const v = Number.isFinite(satang) ? satang : 0;
  return `${v < 0 ? "-" : ""}฿${(Math.abs(v) / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
/** basis point ⇒ "42.8%" */
export function fmtPct(bps: number): string {
  return `${((Number.isFinite(bps) ? bps : 0) / 100).toFixed(1)}%`;
}
export function fmtInt(n: number): string {
  return (Number.isFinite(n) ? n : 0).toLocaleString("th-TH");
}

const MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
/** "2026-11-07" ⇒ "7 พ.ย. 69" · "2026-11" ⇒ "พ.ย. 2569" */
export function fmtThaiDate(ymd: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return `${Number(ymd.slice(8, 10))} ${MONTHS_SHORT[Number(ymd.slice(5, 7)) - 1] ?? ""} ${String(Number(ymd.slice(0, 4)) + 543).slice(2)}`;
  if (/^\d{4}-\d{2}$/.test(ymd)) return `${MONTHS_SHORT[Number(ymd.slice(5, 7)) - 1] ?? ""} ${Number(ymd.slice(0, 4)) + 543}`;
  return ymd;
}

/** ค่าในตาราง ⇒ ข้อความ ตามชนิดคอลัมน์ */
export function fmtCell(kind: ReportColumn["kind"], v: unknown): string {
  if (kind === "text") return typeof v === "string" ? v : v === null || v === undefined ? "" : String(v);
  const n = typeof v === "number" ? v : Number(v ?? 0);
  if (kind === "baht") return fmtBaht(n);
  if (kind === "pct") return fmtPct(n);
  if (kind === "num") return (Number.isFinite(n) ? n : 0).toLocaleString("th-TH", { maximumFractionDigits: 1 });
  return fmtInt(n);
}

/** ลิงก์ส่งออก CSV ของหน้า (route ตรวจสิทธิ์เดียวกับหน้า) */
export function exportHref(base: string, kind: string, q: Record<string, string | undefined>): string {
  const sp = new URLSearchParams({ kind });
  for (const [k, v] of Object.entries(q)) if (v) sp.set(k, v);
  return `${base}/hotel/reports/export?${sp.toString()}`;
}

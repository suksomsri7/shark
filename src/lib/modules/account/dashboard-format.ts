// dashboard-format.ts — เรขาคณิต/สูตรบริสุทธิ์ของหน้าหลัก V2 (WO 2.2)
//
// 🔴 ไฟล์นี้ตั้งใจให้ "ไม่มี React ไม่มี DB" — import ได้ตรง ๆ จาก scripts/qc-acc-v2-home.mts
//    (unit test เรขาคณิตกราฟ/โดนัทโดยไม่ต้องเปิดเบราว์เซอร์ ตาม WO 2.2 หัวข้อ TESTS)
// อ้าง docs/design/account-v2/mockup.html ส่วน f1 (โครง SVG: แท่งคู่ + เส้นกำไร · โดนัทมีศูนย์กลาง)
// จานสี (dataviz skill + UI_STANDARD): accent #1d4ed8 · เทา #0a0a0a/#404040/#737373/#a3a3a3/#d4d4d4/#e5e5e5
// · danger #b91c1c — ห้ามสีเขียว/ส้มนอกชุดนี้

export const DASH_PALETTE = [
  "#1d4ed8", // accent — รายได้/แท่งหลัก
  "#0a0a0a", // ink — เส้นกำไร/แท่งค่าใช้จ่ายเข้ม (โดนัทค่าใช้จ่าย)
  "#404040",
  "#737373",
  "#a3a3a3",
  "#d4d4d4",
  "#e5e5e5",
  "#b91c1c", // danger — เกิน 90 วัน/พ้นกำหนด
  "#ffffff",
] as const;

// ═══════════════ กราฟแท่งคู่ + เส้นกำไร (§4 ข้อ 3) ═══════════════

export type ChartPoint = { key: string; label: string; revenue: number; expense: number; profit: number };

export const CHART_VB = { w: 660, h: 200 };
const PAD_LEFT = 42;
const PAD_RIGHT = 8;
const TOP = 20;
const BOTTOM = 178;

export type ChartBarGeom = {
  key: string;
  label: string;
  cx: number;
  revenue: { x: number; y: number; w: number; h: number };
  expense: { x: number; y: number; w: number; h: number };
  profitPoint: { x: number; y: number };
};

export type ChartGeometry = {
  bars: ChartBarGeom[];
  profitPolyline: string;
  baselineY: number;
  gridLines: { y: number; label: string }[];
  /** ความกว้างช่องของแต่ละจุด (สำหรับพื้นที่ hover ที่ครอบทั้งแท่งคู่ + label) */
  slot: number;
};

/**
 * ตำแหน่ง SVG ของแท่งรายได้/ค่าใช้จ่ายคู่ + จุดเส้นกำไร — สเกลเดียวกันทั้งหมด (แท่งไม่ติดลบ · กำไรติดลบได้)
 * โดเมน y ครอบทั้งค่าสูงสุดของแท่ง และค่าต่ำสุดของกำไร (ถ้าขาดทุน เส้นจะลงไปต่ำกว่าเส้นศูนย์)
 */
export function chartGeometry(points: ChartPoint[]): ChartGeometry {
  const n = Math.max(points.length, 1);
  const usable = CHART_VB.w - PAD_LEFT - PAD_RIGHT;
  const slot = usable / n;
  const barW = Math.min(11, slot * 0.32);
  const gap = 2;

  const domainMax = Math.max(0, ...points.map((p) => p.revenue), ...points.map((p) => p.expense), ...points.map((p) => p.profit));
  const domainMin = Math.min(0, ...points.map((p) => p.profit));
  const range = domainMax - domainMin || 1;
  const scale = (BOTTOM - TOP) / range;
  const yOf = (v: number) => BOTTOM - (v - domainMin) * scale;
  const baselineY = yOf(0);

  const bars: ChartBarGeom[] = points.map((p, i) => {
    const cx = PAD_LEFT + slot * i + slot / 2;
    const revY = yOf(p.revenue);
    const expY = yOf(p.expense);
    return {
      key: p.key,
      label: p.label,
      cx,
      revenue: { x: cx - gap / 2 - barW, y: revY, w: barW, h: Math.max(0, baselineY - revY) },
      expense: { x: cx + gap / 2, y: expY, w: barW, h: Math.max(0, baselineY - expY) },
      profitPoint: { x: cx, y: yOf(p.profit) },
    };
  });

  const profitPolyline = bars.map((b) => `${b.profitPoint.x.toFixed(1)},${b.profitPoint.y.toFixed(1)}`).join(" ");

  // เส้นกริดแนวนอน 3 เส้น (แบ่งเท่า ๆ กันจาก TOP ถึง baseline) — ป้ายเป็นจำนวนเงินโดยประมาณ (k บาท)
  const gridLines = [0.25, 0.5, 0.75].map((frac) => {
    const y = TOP + (BOTTOM - TOP) * frac;
    const v = domainMax - (domainMax - domainMin) * frac; // ประมาณค่าเงิน ณ เส้นนี้ (ใช้ domainMax เป็นฐานบน)
    return { y, label: `฿${Math.round(v / 1000)}k` };
  });

  return { bars, profitPolyline, baselineY, gridLines, slot };
}

/** รวมข้อมูลรายเดือน (12 จุด) เป็นรายไตรมาส (4 จุด) — ใช้ตอนสลับ "รายเดือน/รายไตรมาส" โดยไม่ query ใหม่ */
export function monthsToQuarters(
  months: { periodKey: string; revenue: number; expense: number; profit: number }[],
): ChartPoint[] {
  const quarters: ChartPoint[] = [];
  for (let q = 0; q < 4; q++) {
    const chunk = months.slice(q * 3, q * 3 + 3);
    const revenue = chunk.reduce((s, m) => s + m.revenue, 0);
    const expense = chunk.reduce((s, m) => s + m.expense, 0);
    quarters.push({ key: `Q${q + 1}`, label: `ไตรมาส ${q + 1}`, revenue, expense, profit: revenue - expense });
  }
  return quarters;
}

/** เดือนก่อนหน้า periodKey ("2026-01" → "2025-12") — ใช้คำนวณ "เทียบเดือนก่อน" ของโดนัท (§4 ข้อ 5) */
export function prevPeriodKey(periodKey: string): string {
  const [y, m] = periodKey.split("-").map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return `${py}-${String(pm).padStart(2, "0")}`;
}

export const THAI_MONTH_SHORT = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

export function monthsToChartPoints(
  months: { periodKey: string; revenue: number; expense: number; profit: number }[],
): ChartPoint[] {
  return months.map((m) => ({
    key: m.periodKey,
    label: THAI_MONTH_SHORT[Number(m.periodKey.slice(5, 7)) - 1] ?? m.periodKey,
    revenue: m.revenue,
    expense: m.expense,
    profit: m.profit,
  }));
}

// ═══════════════ โดนัท (§4 ข้อ 5) ═══════════════

export type DonutSlice = { name: string; amount: number; color: string };
export type DonutArc = DonutSlice & { dasharray: string; dashoffset: string; deg: number };

const DONUT_R = 40;
const DONUT_CIRC = 2 * Math.PI * DONUT_R;

/** ส่วนโค้งโดนัท (stroke-dasharray/offset) จากรายการสัดส่วน — Σdeg = 360 เสมอเมื่อ total > 0 */
export function donutArcs(slices: DonutSlice[]): DonutArc[] {
  const total = slices.reduce((s, x) => s + Math.abs(x.amount), 0);
  let offset = 0;
  return slices.map((s) => {
    const frac = total > 0 ? Math.abs(s.amount) / total : 0;
    const len = frac * DONUT_CIRC;
    const arc: DonutArc = {
      ...s,
      dasharray: `${len.toFixed(2)} ${(DONUT_CIRC - len).toFixed(2)}`,
      dashoffset: (-offset).toFixed(2),
      deg: frac * 360,
    };
    offset += len;
    return arc;
  });
}

export const DONUT_VB = { w: 110, h: 110, cx: 55, cy: 55, r: DONUT_R };

// ═══════════════ แถบสัดส่วนแนวนอน (อายุหนี้ / เอกสารที่ออก / เงินคุณอยู่ไหน) ═══════════════

/** % (0–100) ของแถบ — ใช้ shareBp (basis point, 10000=100%) จาก dashboard.ts ตรง ๆ ไม่ปัดเศษเอง */
export function bpToPercent(bp: number): number {
  return Math.max(0, Math.min(100, bp / 100));
}

// ═══════════════ เช็คจานสี (ใช้ใน QC) ═══════════════

export function isPaletteColor(hexOrRgb: string): boolean {
  const v = hexOrRgb.trim().toLowerCase();
  if (v === "none" || v === "transparent") return true;
  if (v.startsWith("#")) return (DASH_PALETTE as readonly string[]).map((c) => c.toLowerCase()).includes(v);
  // rgb(a)(...) — แปลงเป็น hex เทียบ
  const m = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return false;
  const hex =
    "#" +
    [m[1], m[2], m[3]]
      .map((n) => Number(n).toString(16).padStart(2, "0"))
      .join("");
  return (DASH_PALETTE as readonly string[]).map((c) => c.toLowerCase()).includes(hex);
}

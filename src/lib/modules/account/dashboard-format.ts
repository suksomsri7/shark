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

/** ปัดค่าขึ้นเป็น "เลขกลม" ที่คนอ่านสบายตา (1/2/2.5/5/10 × 10^n) — มาตรฐาน "nice number" ของแกนกราฟ */
function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const n = v / base;
  let niceN: number;
  if (n <= 1) niceN = 1;
  else if (n <= 2) niceN = 2;
  else if (n <= 2.5) niceN = 2.5;
  else if (n <= 5) niceN = 5;
  else niceN = 10;
  return niceN * base;
}

/** ป้ายเงินแบบย่อบนแกน (บาทเต็ม ไม่ใช่สตางค์) — "฿0" · "฿200k" · "฿1.2M" */
export function formatBahtShort(baht: number): string {
  const abs = Math.abs(baht);
  const sign = baht < 0 ? "−" : "";
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000;
    return `${sign}฿${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  if (abs >= 1000) return `${sign}฿${Math.round(abs / 1000)}k`;
  return `${sign}฿${Math.round(abs)}`;
}

/**
 * ตำแหน่ง SVG ของแท่งรายได้/ค่าใช้จ่ายคู่ + จุดเส้นกำไร — สเกลเดียวกันทั้งหมด (แท่งไม่ติดลบ · กำไรติดลบได้)
 * แกน y ปัดเป็น "เลขกลม" เสมอ (ไม่ทาบเส้นกริดไปตามค่าสูงสุดดิบ) — เดิมเคยเอาค่าดิบเป็นสตางค์มา /1000
 * ตรง ๆ (ลืมแปลงสตางค์→บาทก่อน) ทำให้ป้ายแกนพัง เช่น "฿39323k" — Fable QC ภาพจริงจับได้
 */
export function chartGeometry(points: ChartPoint[]): ChartGeometry {
  const n = Math.max(points.length, 1);
  const usable = CHART_VB.w - PAD_LEFT - PAD_RIGHT;
  const slot = usable / n;
  const barW = Math.min(11, slot * 0.32);
  const gap = 2;

  const rawMaxSatang = Math.max(0, ...points.map((p) => p.revenue), ...points.map((p) => p.expense), ...points.map((p) => p.profit));
  const rawMinSatang = Math.min(0, ...points.map((p) => p.profit));

  // ทำงานเป็น "บาท" ตอนหาเลขกลม (สตางค์/100) แล้วค่อยแปลงกลับเป็นสตางค์สำหรับสเกล y จริง
  const stepBaht = niceCeil(Math.max(rawMaxSatang / 100, 1) / 3);
  const topBaht = stepBaht * 3;
  const bottomBaht = rawMinSatang < 0 ? -niceCeil(Math.max(-rawMinSatang / 100, 1)) : 0;

  const domainMax = topBaht * 100; // กลับเป็นสตางค์ — ใช้สเกลจริงของแท่ง/เส้น
  const domainMin = bottomBaht * 100;
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

  // เส้นกริดแนวนอน 3 เส้น ที่ 1/3 · 2/3 · 3/3 ของเพดานกลม (topBaht) — ป้ายเป็นเลขกลมเสมอ (0/100k/200k/…)
  const gridLines = [1, 2, 3].map((mult) => {
    const vBaht = stepBaht * mult;
    return { y: yOf(vBaht * 100), label: formatBahtShort(vBaht) };
  });

  return { bars, profitPolyline, baselineY, gridLines, slot };
}

// ═══════════════ กราฟแท่งซ้อน 3 โทน (§6 WO 2.3 — ชำระแล้ว/รอชำระ/พ้นกำหนด) ═══════════════

export type StackPoint = { key: string; label: string; paid: number; awaiting: number; overdue: number };

export type StackBarGeom = {
  key: string;
  label: string;
  cx: number;
  x: number;
  w: number;
  paid: { y: number; h: number };
  awaiting: { y: number; h: number };
  overdue: { y: number; h: number };
  total: number;
};

export type StackChartGeometry = {
  bars: StackBarGeom[];
  baselineY: number;
  gridLines: { y: number; label: string }[];
  slot: number;
};

/** เรขาคณิตกราฟแท่งซ้อน 1 แท่ง/เดือน (ชำระแล้ว ล่าง · รอชำระ กลาง · พ้นกำหนด บน) — แกน y ปัดเลขกลมแบบเดียวกับ
 * `chartGeometry` (nice ticks) แต่สเกลจากผลรวมสูงสุดของแท่ง (ไม่ใช่ค่าดิบแยกซีรีส์) เพราะเป็นแท่งเดียวซ้อนกัน */
export function stackChartGeometry(points: StackPoint[]): StackChartGeometry {
  const n = Math.max(points.length, 1);
  const usable = CHART_VB.w - PAD_LEFT - PAD_RIGHT;
  const slot = usable / n;
  const barW = Math.min(22, slot * 0.55);

  const totals = points.map((p) => p.paid + p.awaiting + p.overdue);
  const rawMaxSatang = Math.max(0, ...totals);
  const stepBaht = niceCeil(Math.max(rawMaxSatang / 100, 1) / 3);
  const topBaht = stepBaht * 3;
  const domainMax = topBaht * 100 || 1;
  const scale = (BOTTOM - TOP) / domainMax;
  const yOf = (v: number) => BOTTOM - v * scale;
  const baselineY = yOf(0);

  const bars: StackBarGeom[] = points.map((p) => {
    const idx = points.indexOf(p);
    const cx = PAD_LEFT + slot * idx + slot / 2;
    let cursor = 0;
    const seg = (v: number) => {
      const y0 = yOf(cursor);
      cursor += v;
      const y1 = yOf(cursor);
      return { y: y1, h: Math.max(0, y0 - y1) };
    };
    const paid = seg(p.paid);
    const awaiting = seg(p.awaiting);
    const overdue = seg(p.overdue);
    return { key: p.key, label: p.label, cx, x: cx - barW / 2, w: barW, paid, awaiting, overdue, total: cursor };
  });

  const gridLines = [1, 2, 3].map((mult) => {
    const vBaht = stepBaht * mult;
    return { y: yOf(vBaht * 100), label: formatBahtShort(vBaht) };
  });

  return { bars, baselineY, gridLines, slot };
}

/** รวมข้อมูลรายเดือน (12 จุด) เป็นรายไตรมาส (4 จุด) — กราฟแท่งซ้อน */
export function stackMonthsToQuarters(months: { periodKey: string; paid: number; awaiting: number; overdue: number }[]): StackPoint[] {
  const quarters: StackPoint[] = [];
  for (let q = 0; q < 4; q++) {
    const chunk = months.slice(q * 3, q * 3 + 3);
    quarters.push({
      key: `Q${q + 1}`,
      label: `ไตรมาส ${q + 1}`,
      paid: chunk.reduce((s, m) => s + m.paid, 0),
      awaiting: chunk.reduce((s, m) => s + m.awaiting, 0),
      overdue: chunk.reduce((s, m) => s + m.overdue, 0),
    });
  }
  return quarters;
}

export function monthsToStackPoints(months: { periodKey: string; paid: number; awaiting: number; overdue: number }[]): StackPoint[] {
  return months.map((m) => ({
    key: m.periodKey,
    label: THAI_MONTH_SHORT[Number(m.periodKey.slice(5, 7)) - 1] ?? m.periodKey,
    paid: m.paid,
    awaiting: m.awaiting,
    overdue: m.overdue,
  }));
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

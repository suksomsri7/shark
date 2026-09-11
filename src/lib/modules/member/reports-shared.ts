// reports-shared.ts — ชนิดข้อมูล/ทะเบียน/ตัวช่วยวันที่ของ "รายงานสมาชิก" (M3.8 · §5.10 · ภาพ 25)
//
// 🔴 ไฟล์ **บริสุทธิ์** (ไม่แตะ prisma/env/facade) — component `'use client'` (ปุ่มส่งออก CSV · โมดัลตั้งเวลา)
//    import ได้โดยไม่ลากไดรเวอร์ฐานข้อมูลเข้าบันเดิลเบราว์เซอร์ (บทเรียน M3.1: tsc ผ่านแต่ next build พัง)
// 🔴 เดือน/วัน = ปฏิทินไทย (UTC+7) เสมอ — ห้ามใช้ getMonth/getDay ของเครื่อง (เครื่องเป็น UTC → เพี้ยนช่วง 17:00–24:00)

// ───────────────────────── แท็บ ─────────────────────────

export const REPORT_TABS = ["overview", "rfm", "tiers", "points", "promotions", "sources", "cohort"] as const;
export type ReportTab = (typeof REPORT_TABS)[number];

export const REPORT_TAB_LABELS: Readonly<Record<ReportTab, string>> = Object.freeze({
  overview: "ภาพรวม",
  rfm: "RFM",
  tiers: "ระดับ",
  points: "แต้ม",
  promotions: "โปรโมชัน",
  sources: "ช่องทางที่มา",
  cohort: "Cohort",
});

export function isReportTab(v: unknown): v is ReportTab {
  return typeof v === "string" && (REPORT_TABS as readonly string[]).includes(v);
}

// ───────────────────────── RFM ─────────────────────────

export const RFM_SEGMENT_KEYS = [
  "champions",
  "loyal",
  "promising",
  "potential",
  "need_attention",
  "new",
  "at_risk",
  "hibernating",
  "lost",
] as const;
export type RfmSegmentKey = (typeof RFM_SEGMENT_KEYS)[number];

/**
 * 9 กลุ่มเรียงตามภาพ 25 (แถวละ 3 ช่อง: ซื้อบ่อย/มูลค่าสูง อยู่ซ้ายบน → ห่างหายนานอยู่ขวาล่าง)
 * ผัง/สีเฉดของกริดเป็นเรื่องหน้าจอ — อยู่ที่ `components/member/ReportRfmGrid.tsx`
 */
export const RFM_SEGMENTS: readonly { key: RfmSegmentKey; label: string; description: string }[] = Object.freeze([
  { key: "champions", label: "Champions", description: "ซื้อล่าสุด ซื้อบ่อย และใช้จ่ายสูง — ลูกค้าที่ดีที่สุดของร้าน" },
  { key: "loyal", label: "Loyal", description: "กลับมาซื้อสม่ำเสมอ — ชวนขึ้นระดับหรือให้สิทธิ์พิเศษ" },
  { key: "promising", label: "Promising", description: "เพิ่งซื้อและใช้จ่ายดี แต่ยังมาไม่บ่อย — ชวนกลับมาครั้งถัดไป" },
  { key: "potential", label: "Potential", description: "เพิ่งซื้อ ยอดยังไม่สูง — มีโอกาสเติบโตถ้าได้ข้อเสนอที่ใช่" },
  { key: "need_attention", label: "Need Attention", description: "ห่างไปพักหนึ่งแล้ว — ควรทักก่อนหายไปนานกว่านี้" },
  { key: "new", label: "New", description: "ซื้อครั้งแรกไม่นานมานี้ — ต้อนรับให้ประทับใจ" },
  { key: "at_risk", label: "At risk", description: "เคยซื้อบ่อยแต่หายไปนาน — เสี่ยงเสียลูกค้า ควรดึงกลับด่วน" },
  { key: "hibernating", label: "Hibernating", description: "ซื้อน้อยและห่างหายไปนาน — ส่งข้อเสนอพิเศษเพื่อปลุก" },
  { key: "lost", label: "Lost", description: "หายไปนานที่สุดและซื้อน้อย — ใช้งบน้อยที่สุดกับกลุ่มนี้" },
]);

/**
 * คะแนน 1–5 แบบควินไทล์ (สัญญาข้อสอบ M3.8): เรียงค่าจากน้อยไปมาก · score = min(5, floor(i × 5 / N) + 1)
 * ค่าเท่ากันได้คะแนนเท่ากัน = คะแนนของตำแหน่งท้ายสุดของกลุ่มค่าเท่ากัน ⇒ monotonic (ค่ามากกว่าไม่ได้คะแนนน้อยกว่า)
 */
export function quintileScores(values: readonly number[]): number[] {
  const n = values.length;
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array<number>(n).fill(1);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && order[j + 1]!.v === order[i]!.v) j += 1;
    const score = Math.min(5, Math.floor((j * 5) / n) + 1);
    for (let k = i; k <= j; k += 1) out[order[k]!.i] = score;
    i = j + 1;
  }
  return out;
}

/** กติกาจัดกลุ่ม (ตรวจตามลำดับ · สัญญาข้อสอบ M3.8 บรรทัดหัวไฟล์) */
export function rfmSegmentOf(s: { r: number; f: number; m: number; frequency: number }): RfmSegmentKey {
  if (s.r <= 1) return s.f >= 3 ? "at_risk" : "lost";
  if (s.r === 2) return s.f >= 3 ? "at_risk" : "hibernating";
  if (s.r === 3) return s.f >= 4 ? "loyal" : "need_attention";
  if (s.f >= 4 && s.m >= 4) return "champions";
  if (s.f >= 4) return "loyal";
  if (s.frequency === 1) return "new";
  return s.m >= 3 ? "promising" : "potential";
}

// ───────────────────────── รูปคืนค่าของรายงาน ─────────────────────────

export type ReportOverview = {
  members: { total: number; newThisMonth: number; active90d: number };
  sales: {
    satang: number;
    billCount: number;
    /** satang ÷ จำนวนสมาชิกที่มีบิลในช่วง (ปัดลง) */
    perMemberSatang: number;
    months: number;
    /** % ของยอดขายทั้งร้านในช่วงเดียวกัน (ร้านไม่มีบิลเลย = null) */
    sharePct: number | null;
  };
  /** สมาชิกที่มีบิล ≥ 2 ใบ ÷ ที่มีบิล ≥ 1 ใบ × 100 (ปัด 0 ตำแหน่ง) */
  retentionPct: number;
  pointsOutstanding: number;
  /** pointsOutstanding × มูลค่าแต้ม (burnRateSatang) */
  pointsLiabilitySatang: number;
  /** ต้นทุน voucher ที่ถูกใช้ + แต้มที่ให้จาก journey/แคมเปญ ในเดือนไทยนี้ */
  promoCostMonthSatang: number;
  newPerMonth: { month: string; count: number }[];
};

export type RfmScore = {
  customerId: string;
  recencyDays: number;
  frequency: number;
  monetarySatang: number;
  r: number;
  f: number;
  m: number;
  segment: RfmSegmentKey;
};

export type ReportRfm = {
  days: number;
  total: number;
  segments: { key: RfmSegmentKey; label: string; count: number; description: string }[];
  scores: RfmScore[];
};

export type ReportTierRow = {
  /** null = สมาชิกที่ยังไม่มีระดับ (ข้อมูลเก่า) */
  tierDefId: string | null;
  name: string;
  /** TagColor ของระดับ (SLATE/BLUE/…) — ชิปใช้โทเคน `--color-tag-*` */
  color: string;
  count: number;
  avgSpend12mSatang: number;
  pointsOutstanding: number;
};

export type ReportTiers = { rows: ReportTierRow[]; total: number };

export type ReportPointsMonth = { month: string; earned: number; burned: number; expired: number };

export type ReportPoints = {
  months: number;
  monthly: ReportPointsMonth[];
  totals: { earned: number; burned: number; expired: number };
  outstanding: number;
  burnRateSatang: number;
  liabilitySatang: number;
};

export type ReportJourneyRow = {
  id: string;
  name: string;
  enabled: boolean;
  /** คนที่เข้า journey ในช่วง (รวมกลุ่มเทียบ) */
  entered: number;
  used: number;
  saleSatang: number;
  /** voucher ที่ใช้ + ค่าส่งข้อความ (สูตร journeyStats) + แต้มที่ให้ × มูลค่าแต้ม */
  costSatang: number;
  pointsCostSatang: number;
  /** ยอดที่เกิด ÷ ต้นทุน (เท่า) · ต้นทุน 0 = null */
  roi: number | null;
  /** % ใช้สิทธิ์ของคนที่ได้รับ − % ของกลุ่มเทียบ · ไม่มีกลุ่มเทียบ = null */
  upliftPct: number | null;
};

export type ReportCampaignRow = {
  id: string;
  name: string;
  status: string;
  sentAt: string | null;
  sent: number;
  used: number;
  saleSatang: number;
  costSatang: number;
  roi: number | null;
  upliftPct: number | null;
};

export type ReportPromotions = {
  days: number;
  journeys: ReportJourneyRow[];
  campaigns: ReportCampaignRow[];
  totals: { costSatang: number; saleSatang: number; roi: number | null };
};

export type ReportSourceRow = {
  source: string | null;
  label: string;
  count: number;
  firstPurchases: number;
  costSatang: number;
  costPerMemberSatang: number;
};

export type ReportSources = { days: number; rows: ReportSourceRow[]; total: number };

export type ReportCohortRow = { month: string; size: number; retained: number[] };

export type ReportCohort = { months: number; rows: ReportCohortRow[] };

// ───────────────────────── ตั้งเวลาส่งอีเมล ─────────────────────────

export type ReportSchedule = {
  enabled: boolean;
  emails: string[];
  /** ชั่วโมงไทย 0–23 ที่เริ่มส่ง (cron รายชั่วโมงส่งรอบแรกที่ถึง/เลยชั่วโมงนี้ของวัน) */
  hour: number;
  tabs: ReportTab[];
  /** วันไทย "YYYY-MM-DD" ที่ส่งไปแล้วล่าสุด — กันส่งซ้ำวันเดียวกัน */
  lastSentDate: string | null;
};

export type ReportScheduleInput = Partial<Pick<ReportSchedule, "enabled" | "emails" | "hour" | "tabs">>;

const DEFAULT_SCHEDULE: ReportSchedule = {
  enabled: false,
  emails: [],
  hour: 6,
  tabs: ["overview", "rfm", "points"],
  lastSentDate: null,
};
export const REPORT_SCHEDULE_DEFAULT: Readonly<ReportSchedule> = Object.freeze(DEFAULT_SCHEDULE);

export const REPORT_SCHEDULE_MAX_EMAILS = 5;

/** ผลของ server action (ชนิดอยู่ที่นี่เพราะไฟล์ "use server" export type ไม่ได้) */
export type ReportActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; reason: string };

// ───────────────────────── วันที่ไทย ─────────────────────────

export const BKK_MS = 7 * 3_600_000;
export const DAY_MS = 86_400_000;

/** "2026-09" ตามปฏิทินไทย */
export function thaiMonthKey(d: Date): string {
  return new Date(d.getTime() + BKK_MS).toISOString().slice(0, 7);
}

/** "2026-09-11" ตามปฏิทินไทย */
export function thaiDateKey(d: Date): string {
  return new Date(d.getTime() + BKK_MS).toISOString().slice(0, 10);
}

/** ชั่วโมงไทย 0–23 */
export function thaiHour(d: Date): number {
  return new Date(d.getTime() + BKK_MS).getUTCHours();
}

/** เลื่อนเดือน "YYYY-MM" ไป k เดือน (ลบได้) */
export function addMonthKey(key: string, k: number): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1 + k, 1)).toISOString().slice(0, 7);
}

/** n เดือนไทยล่าสุดถึงเดือนของ `now` เรียงเก่า → ใหม่ */
export function monthKeysBack(now: Date, n: number): string[] {
  const cur = thaiMonthKey(now);
  const out: string[] = [];
  for (let k = n - 1; k >= 0; k -= 1) out.push(addMonthKey(cur, -k));
  return out;
}

/** เวลาเริ่มเดือนไทย "YYYY-MM" (เป็น Date UTC จริง) */
export function thaiMonthStart(key: string): Date {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1) - BKK_MS);
}

const TH_MONTH_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** "ก.ย." ของเดือน "2026-09" (ป้ายใต้แท่งกราฟ) */
export function thaiMonthShort(key: string): string {
  const m = Number(key.slice(5, 7));
  return TH_MONTH_SHORT[m - 1] ?? key;
}

/** "ก.ย. 69" ของเดือน "2026-09" (หัวตาราง cohort) */
export function thaiMonthLabel(key: string): string {
  const y = Number(key.slice(0, 4)) + 543;
  return `${thaiMonthShort(key)} ${String(y).slice(2)}`;
}

// ───────────────────────── ตัวเลข ─────────────────────────

/** ฿1,234 (ปัดเป็นบาท) */
export function baht(satang: number): string {
  return `฿${Math.round(satang / 100).toLocaleString("th-TH")}`;
}

/** ฿4.2M / ฿184K / ฿3,270 — ช่อง KPI ที่ที่แคบ */
export function bahtCompact(satang: number): string {
  const b = satang / 100;
  if (Math.abs(b) >= 1_000_000) return `฿${(b / 1_000_000).toFixed(1)}M`;
  if (Math.abs(b) >= 100_000) return `฿${Math.round(b / 1_000)}K`;
  return baht(satang);
}

export function int(n: number): string {
  return Math.round(n).toLocaleString("th-TH");
}

/** ROI แบบ "เท่า" ของภาพ 25 (31.6×) · null = ยังไม่มีต้นทุน */
export function roiLabel(roi: number | null): string {
  return roi === null ? "—" : `${roi.toFixed(1)}×`;
}

// reports-shared.ts — ค่าคงที่ · ชนิด · ตัวช่วยเวลาไทย "บริสุทธิ์" ของรายงาน CRM (ใบ C3.1 · พิมพ์เขียว §5.9 · ภาพ 09)
//
// 🔴 ไฟล์นี้ไม่แตะ prisma / next / db — หน้า 'use client' และสคริปต์ import ได้ (กติกา *-shared.ts ของรีโป)
// 🔴 เวลาไทย = +07:00 คงที่ (ไทยไม่มีเวลาออมแสง) — ทุกการคำนวณ "วัน/สัปดาห์/เดือนไทย" ทำด้วยเลขคณิตบน epoch ms
//    แล้วตัดสตริง ISO ของเวลาที่เลื่อน +7 ชม. (ห้ามใช้ getDay()/getDate() ดิบ — เพี้ยน 1 วันบนเครื่อง UTC)
import { DAY_MS, thaiDayKey, thaiDayStartMs } from "./activities-shared";

// 🔴 ช่องเวลาของรายงานตามกำหนด (addendum ข้อ 11) = หน้าต่างตรึงนาฬิกาไทย (วัน · สัปดาห์ ISO เริ่มจันทร์ · เดือน)
//    ไม่ใช่ "24 ชม. นับจากครั้งก่อน" — cron ที่เริ่มช้า/เร็วต่างกันไม่กี่ร้อย ms จะไม่ข้ามรอบ

/** แท็บของรายงาน — ลำดับ = ภาพ 09 = URL ของพิมพ์เขียว §2.2 (`/reports/{…}`) */
export const REPORT_TABS = ["overview", "forecast", "funnel", "reps", "activities", "lost", "sources", "scores"] as const;
export type ReportTab = (typeof REPORT_TABS)[number];

export const REPORT_TAB_LABEL: Readonly<Record<ReportTab, string>> = Object.freeze({
  overview: "ภาพรวม",
  forecast: "Forecast พยากรณ์ยอดขาย",
  funnel: "Funnel ต่อขั้น",
  reps: "ยอดต่อคน/ทีม",
  activities: "กิจกรรม",
  lost: "เหตุผลแพ้",
  sources: "ที่มา/ROI",
  scores: "Lead score คะแนนผู้ติดต่อ",
});

/** ข้อความบนแถบแท็บ = ภาพ 09 ตรงตัว (บางแท็บเป็นคำอังกฤษตามแบบ · ป้ายไทยเต็มอยู่ที่ REPORT_TAB_LABEL) */
export const REPORT_TAB_SHORT: Readonly<Record<ReportTab, string>> = Object.freeze({
  overview: "ภาพรวม",
  forecast: "Forecast",
  funnel: "Funnel",
  reps: "ยอดต่อคน/ทีม",
  activities: "กิจกรรม",
  lost: "เหตุผลแพ้",
  sources: "ที่มา/ROI",
  scores: "Lead score",
});

/** ชื่อไทยเต็มของแท็บ (หัวอีเมล/ไฟล์ — ป้ายแท็บบางตัวเป็นคำอังกฤษตามภาพ 09) */
export const REPORT_TAB_TITLE: Readonly<Record<ReportTab, string>> = Object.freeze({
  overview: "ภาพรวมการขาย",
  forecast: "พยากรณ์ยอดขาย (Forecast)",
  funnel: "Funnel ต่อขั้น",
  reps: "ยอดต่อคน",
  activities: "กิจกรรมต่อคน",
  lost: "เหตุผลที่แพ้",
  sources: "ที่มาของลูกค้าและ ROI",
  scores: "คะแนนผู้ติดต่อ (Lead score)",
});

export const REPORT_SCHEDULE_FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY"] as const;
export type ReportScheduleFrequency = (typeof REPORT_SCHEDULE_FREQUENCIES)[number];
export const REPORT_SCHEDULE_FREQUENCY_LABEL: Readonly<Record<ReportScheduleFrequency, string>> = Object.freeze({
  DAILY: "ทุกวัน",
  WEEKLY: "ทุกสัปดาห์",
  MONTHLY: "ทุกเดือน",
});
export const REPORT_WEEKDAY_LABEL: readonly string[] = Object.freeze(["", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"]);

/** ผู้รับต่อตารางเวลา (addendum ข้อ 9) · จำนวนตารางต่อระบบ · เพดานแถวของไฟล์ส่งออก */
export const REPORT_SCHEDULE_RECIPIENTS_MAX = 20;
export const REPORT_SCHEDULES_MAX = 50;
export const REPORT_EXPORT_DEAL_ROWS_MAX = 5_000;
/** AUDIT-CLASS X5: อายุ lease ของงานส่งออก/ส่งรายงานตามกำหนด (MASTER-PLAN §4 X5 — 15 นาที) */
export const REPORT_LEASE_MS = 15 * 60_000;
/** kind ของแถว `CrmImportJob` ที่เป็นงานส่งออกรายงาน (addendum ข้อ 7 — ตารางงานเดิม ไม่มี migration) */
export const REPORT_EXPORT_KIND = "REPORT_EXPORT";
/** คีย์กลุ่ม "ไม่มีค่า" (ตรงกับ FORECAST_NONE_KEY ของดีล) */
export const REPORT_NONE_KEY = "none";

export function isReportTab(v: unknown): v is ReportTab {
  return typeof v === "string" && (REPORT_TABS as readonly string[]).includes(v);
}
export function isReportFrequency(v: unknown): v is ReportScheduleFrequency {
  return typeof v === "string" && (REPORT_SCHEDULE_FREQUENCIES as readonly string[]).includes(v);
}

// ───────────────────────── ตัวกรอง + DTO ─────────────────────────

/** ตัวกรองของทุกแท็บ — วันไทย "YYYY-MM-DD" รวมปลาย ([from 00:00 +07, to+1 00:00 +07)) · id ต้องเป็นของร้าน/ระบบนี้ */
export type ReportFilters = {
  from?: string | null;
  to?: string | null;
  teamId?: string | null;
  pipelineId?: string | null;
  ownerUserId?: string | null;
};
export type ForecastGroupBy = "month" | "owner" | "team";
export const FORECAST_GROUP_BYS: readonly ForecastGroupBy[] = ["month", "owner", "team"];

export type OverviewReport = {
  openDeals: number;
  openValueSatang: number;
  weightedSatang: number;
  wonDeals: number;
  wonValueSatang: number;
  lostDeals: number;
  winRatePct: number | null;
  avgWonSatang: number | null;
  paidSatang: number;
  activitiesDone: number;
  newLeads: number;
};

export type ForecastRow = {
  key: string;
  label: string;
  deals: number;
  pipelineSatang: number;
  bestCaseSatang: number;
  commitSatang: number;
  weightedSatang: number;
  closedSatang: number;
  /** ตัวยึดที่ของโควตา — null จนกว่าใบ C3.2 จะเติม */
  quotaSatang: number | null;
};
export type ForecastReport = { groupBy: ForecastGroupBy; rows: ForecastRow[] };

export type FunnelStageRow = { stageId: string; name: string; kind: "OPEN" | "WON"; entered: number; left: number; ratePct: number | null; avgDays: number | null };
export type FunnelReport = { pipelineId: string | null; pipelineName: string | null; stages: FunnelStageRow[] };

export type RepRow = {
  key: string;
  label: string;
  wonDeals: number;
  wonValueSatang: number;
  openDeals: number;
  openValueSatang: number;
  lostDeals: number;
  paidSatang: number;
  activitiesDone: number;
  commissionSatang: number;
  quotaSatang: number | null;
  attainmentPct: number | null;
};
export type RepsReport = { rows: RepRow[] };

export type ActivityRow = { key: string; label: string; done: number; open: number; calls: number; callSeconds: number; byType: Record<string, number> };
export type ActivitiesReport = { rows: ActivityRow[]; types: { key: string; label: string }[] };

export type LostRow = { key: string; label: string; deals: number; valueSatang: number; pct: number | null };
export type LostReport = { total: number; valueSatang: number; rows: LostRow[] };

export type SourceRow = { key: string; label: string; leads: number; deals: number; wonDeals: number; wonValueSatang: number; costSatang: number | null; roi: number | null };
export type SourcesReport = { bySource: SourceRow[]; byCampaign: SourceRow[]; byLink: SourceRow[] };

export type ScoreBandRow = { key: string; label: string; contacts: number; avgScore: number | null; withOpenDeal: number; withWonDeal: number };
export type ScoreRuleRow = { key: string; label: string; logs: number; points: number };
export type ScoresReport = { bands: ScoreBandRow[]; topRules: ScoreRuleRow[] };

export type ReportOf = {
  overview: OverviewReport;
  forecast: ForecastReport;
  funnel: FunnelReport;
  reps: RepsReport;
  activities: ActivitiesReport;
  lost: LostReport;
  sources: SourcesReport;
  scores: ScoresReport;
};
export type AnyReport = ReportOf[ReportTab];

export type ReportExportStatus = "QUEUED" | "RUNNING" | "DONE" | "FAILED";
export type ReportExportDto = {
  jobId: string;
  tab: ReportTab | null;
  status: ReportExportStatus;
  rowCount: number;
  filename: string | null;
  /** CSV UTF-8 **ไม่มี BOM** (ชั้นดาวน์โหลดเติม U+FEFF) — มีเฉพาะเมื่อ DONE */
  csv: string | null;
  error: string | null;
};

export type ReportSchedule = {
  id: string;
  tab: ReportTab;
  filters: ReportFilters;
  frequency: ReportScheduleFrequency;
  /** 1 = จันทร์ … 7 = อาทิตย์ (WEEKLY) */
  weekday: number;
  /** 1..28 (MONTHLY) */
  dayOfMonth: number;
  recipientUserIds: string[];
  active: boolean;
  createdById: string | null;
  createdAt: string | null;
};
export type ReportScheduleInput = {
  id?: string | null;
  tab: string;
  filters?: ReportFilters | null;
  frequency: string;
  weekday?: number | null;
  dayOfMonth?: number | null;
  recipientUserIds: string[];
  active?: boolean | null;
};

export type ReportsErrorCode = "VALIDATION" | "FORBIDDEN" | "NOT_FOUND";

/** error ของบริการรายงาน — ข้อความไทยที่ไม่โทษผู้ใช้ · `.code` ให้ action/REST แปลงต่อ */
export class ReportsError extends Error {
  readonly code: ReportsErrorCode;
  constructor(code: ReportsErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "ReportsError";
  }
}

// ───────────────────────── เวลาไทย (+07:00 · ตัวช่วยกลางของ activities-shared) ─────────────────────────

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** วันไทย "YYYY-MM-DD" ของเวลาหนึ่ง */
export function thaiYmdOf(d: Date | number): string {
  return thaiDayKey(typeof d === "number" ? d : d.getTime());
}
/** 00:00 ไทยของวัน "YYYY-MM-DD" */
export function thaiDayStart(ymd: string): Date {
  return new Date(`${ymd}T00:00:00+07:00`);
}
/** "YYYY-MM-DD" ที่เป็นวันจริง (ไม่ใช่ 2026-02-30 / 2026-13-45) */
export function isThaiYmd(v: unknown): v is string {
  if (typeof v !== "string" || !YMD_RE.test(v)) return false;
  const t = thaiDayStart(v).getTime();
  return Number.isFinite(t) && thaiYmdOf(t) === v;
}
export function addDaysYmd(ymd: string, n: number): string {
  return thaiYmdOf(thaiDayStartMs(thaiDayStart(ymd).getTime() + n * DAY_MS + 12 * 3_600_000));
}
/** วันในสัปดาห์แบบ ISO ของวันไทย (1 = จันทร์ … 7 = อาทิตย์) — 1970-01-01 เป็นวันพฤหัส */
export function isoWeekdayOfYmd(ymd: string): number {
  const days = Math.floor(Date.parse(`${ymd}T00:00:00Z`) / DAY_MS);
  return (((days + 3) % 7) + 7) % 7 + 1;
}
/** "31 ต.ค. 2569" */
export function thaiDayLabel(ymd: string): string {
  const m = YMD_RE.exec(ymd);
  if (!m) return ymd;
  return `${Number(m[3])} ${TH_MONTHS[Number(m[2]) - 1]} ${Number(m[1]) + 543}`;
}
/** "2026-10" → "ต.ค. 2569" · "none" → "ไม่ระบุวันปิด" */
export function thaiMonthLabel(key: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return key === REPORT_NONE_KEY ? "ไม่ระบุวันปิด" : key;
  return `${TH_MONTHS[Number(m[2]) - 1]} ${Number(m[1]) + 543}`;
}
/** ป้ายช่วงเวลาของตัวกรอง (หัวอีเมล/ไฟล์) */
export function periodLabel(f: Pick<ReportFilters, "from" | "to">): string {
  const a = f.from ? thaiDayLabel(f.from) : null;
  const b = f.to ? thaiDayLabel(f.to) : null;
  if (a && b) return a === b ? a : `${a} – ${b}`;
  if (a) return `ตั้งแต่ ${a}`;
  if (b) return `ถึง ${b}`;
  return "ทุกช่วงเวลา";
}

// ───────────────────────── ช่องเวลาของรายงานตามกำหนด (addendum ข้อ 11) ─────────────────────────

export type ReportSlot = {
  /** คีย์ของช่อง: DAILY "2026-10-05" · WEEKLY "W2026-10-05" (วันจันทร์) · MONTHLY "M2026-10" */
  key: string;
  /** เริ่มช่อง (00:00 ไทยของวัน / วันจันทร์ / วันที่ 1) */
  start: Date;
  /** ส่งได้ตั้งแต่ (WEEKLY = วันที่เลือกในสัปดาห์ · MONTHLY = วันที่เลือกของเดือน) — พลาดแล้วตามส่งได้ครั้งเดียวในช่องเดียวกัน */
  trigger: Date;
  /** ช่วงข้อมูลของรายงานในอีเมล: วันก่อน / สัปดาห์ก่อน / เดือนก่อน */
  periodFrom: string;
  periodTo: string;
  label: string;
};

export function reportSlotOf(s: Pick<ReportSchedule, "frequency" | "weekday" | "dayOfMonth">, now: Date): ReportSlot {
  const day = thaiYmdOf(now);
  if (s.frequency === "WEEKLY") {
    const mon = addDaysYmd(day, -(isoWeekdayOfYmd(day) - 1));
    const wd = Number.isInteger(s.weekday) && s.weekday >= 1 && s.weekday <= 7 ? s.weekday : 1;
    const from = addDaysYmd(mon, -7);
    const to = addDaysYmd(mon, -1);
    return { key: `W${mon}`, start: thaiDayStart(mon), trigger: thaiDayStart(addDaysYmd(mon, wd - 1)), periodFrom: from, periodTo: to, label: `สัปดาห์ ${thaiDayLabel(from)} – ${thaiDayLabel(to)}` };
  }
  if (s.frequency === "MONTHLY") {
    const first = `${day.slice(0, 7)}-01`;
    const dom = Number.isInteger(s.dayOfMonth) && s.dayOfMonth >= 1 && s.dayOfMonth <= 28 ? s.dayOfMonth : 1;
    const to = addDaysYmd(first, -1);
    const from = `${to.slice(0, 7)}-01`;
    return {
      key: `M${day.slice(0, 7)}`,
      start: thaiDayStart(first),
      trigger: thaiDayStart(addDaysYmd(first, dom - 1)),
      periodFrom: from,
      periodTo: to,
      label: `เดือน ${thaiMonthLabel(from.slice(0, 7))}`,
    };
  }
  const prev = addDaysYmd(day, -1);
  return { key: day, start: thaiDayStart(day), trigger: thaiDayStart(day), periodFrom: prev, periodTo: prev, label: `วันที่ ${thaiDayLabel(prev)}` };
}

// ───────────────────────── ตัวช่วยตัวเลข ─────────────────────────

/** ร้อยละ 1 ตำแหน่ง (null เมื่อตัวหารเป็น 0) */
export function pct1(n: number, d: number): number | null {
  return d > 0 ? Math.round((n * 1000) / d) / 10 : null;
}

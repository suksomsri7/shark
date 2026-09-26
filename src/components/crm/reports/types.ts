// types.ts — ชนิดของหน้ารายงาน CRM (ใบ C3.1 · ภาพ 09) ฝั่งคอมโพเนนต์
// 🔴 ไม่ import อะไรจากโมดูล CRM (ด่าน F2.3 + กติกา 'use client') — หน้า `crm/reports/**` แปลง DTO ของบริการเป็นชนิดเหล่านี้
//    (รูปเดียวกับ DTO ของ `reports-shared.ts` แบบโครงสร้าง ⇒ หน้าส่งผลของบริการเข้ามาได้ตรง ๆ)

export type RvTabKey = "overview" | "forecast" | "funnel" | "reps" | "activities" | "lost" | "sources" | "scores";

export type RvOverview = {
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
export type RvForecastRow = { key: string; label: string; deals: number; pipelineSatang: number; bestCaseSatang: number; commitSatang: number; weightedSatang: number; closedSatang: number; quotaSatang: number | null };
export type RvForecast = { groupBy: string; rows: RvForecastRow[] };
export type RvFunnel = { pipelineId: string | null; pipelineName: string | null; stages: { stageId: string; name: string; kind: string; entered: number; left: number; ratePct: number | null; avgDays: number | null }[] };
export type RvRepRow = {
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
export type RvActivities = { rows: { key: string; label: string; done: number; open: number; calls: number; callSeconds: number; byType: Record<string, number> }[]; types: { key: string; label: string }[] };
export type RvLost = { total: number; valueSatang: number; rows: { key: string; label: string; deals: number; valueSatang: number; pct: number | null }[] };
export type RvSourceRow = { key: string; label: string; leads: number; deals: number; wonDeals: number; wonValueSatang: number; costSatang: number | null; roi: number | null };
export type RvSources = { bySource: RvSourceRow[]; byCampaign: RvSourceRow[]; byLink: RvSourceRow[] };
export type RvScores = {
  bands: { key: string; label: string; contacts: number; avgScore: number | null; withOpenDeal: number; withWonDeal: number }[];
  topRules: { key: string; label: string; logs: number; points: number }[];
};

/** ข้อมูลของแท็บที่เปิดอยู่ (แท็บ forecast = แดชบอร์ดของภาพ 09 จึงพาหลายส่วนมาด้วย) */
export type RvData = {
  overview?: RvOverview;
  forecast?: RvForecast;
  funnel?: RvFunnel;
  reps?: { rows: RvRepRow[] };
  activities?: RvActivities;
  lost?: RvLost;
  sources?: RvSources;
  scores?: RvScores;
};

export type RvOption = { value: string; label: string };

export type RvFilterState = { period: string; team: string; pipeline: string };

export type RvScheduleRow = { id: string; tabLabel: string; frequencyLabel: string; whenLabel: string; recipients: number };

export type RvSchedulePanel = {
  schedules: RvScheduleRow[];
  tabs: RvOption[];
  frequencies: RvOption[];
  weekdays: RvOption[];
  staff: RvOption[];
};

export type RvActionResult<T> = { ok: true; value: T } | { ok: false; error: string };

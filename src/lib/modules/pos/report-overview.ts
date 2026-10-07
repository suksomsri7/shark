// POS P1.17U R6 ▸ ภาพรวมการขาย (ภาพ 08) ในคำขอเดียว — รวมรายงานเดิมของ reports.ts ด้วย Promise.all ฝั่งเซิร์ฟเวอร์ ◂
// เหตุ (ผู้ตรวจ R5 F1): Next 16 ส่ง Server Action จาก client ทีละตัว (node_modules/next/dist/docs/01-app/02-guides/server-actions.md
//   "Sequential dispatch on the client") ⇒ การ์ด 6 ใบ + สาขาละ 2 = สูงสุด 24 คำขอเรียงกัน · ย้ายการขนานมาไว้ที่นี่ (action เดียว)
// 🔴 ไม่คำนวณตัวเลขใหม่: ทุกตัวเลขมาจากฟังก์ชันรายงานเดิม (สิทธิ์/ขอบเขต/ช่วงวันตรวจในฟังก์ชันเหล่านั้นเหมือน posReportAction ทุกประการ)
// 🔴 ปฏิเสธ "ต่อส่วน": แต่ละส่วนคืน {ok:true, data} | {ok:false, code} ของมันเอง — ส่วนหนึ่งถูกปฏิเสธ/ขัดข้อง ส่วนอื่นยังได้ผล
// 🔴 อ่านอย่างเดียว (ไม่มีการเขียน) · ไม่ throw: ขัดข้องที่ไม่คาดคิดของส่วนใดส่วนหนึ่ง = {ok:false, code:"INTERNAL"} เฉพาะส่วนนั้น
import type { PrismaClient } from "@prisma/client";
import { prisma } from "./db";
import { canAccessUnit, evaluate } from "@/lib/core/rbac";
import {
  REPORT_MAX_DAYS,
  REPORT_PERMISSION,
  reportDailySales,
  reportMargin,
  reportPayments,
  reportStaff,
  type DailyRow,
  type DailyTotals,
  type MarginRow,
  type MarginTotals,
  type PaymentRow,
  type PaymentTotals,
  type Report,
  type ReportCtx,
  type ReportRefusal,
  type StaffRow,
  type StaffTotals,
} from "./reports";
import type { RegisterActor } from "./register-shared";

type Db = PrismaClient;

/** ส่วนของภาพรวม (ใช้กับ `only` เพื่อโหลดใหม่เฉพาะส่วน · ปุ่มลองใหม่ในการ์ด) */
export const OVERVIEW_SECTIONS = ["daily", "prev", "margin", "payments", "staff", "chart", "branches"] as const;
export type OverviewSection = (typeof OVERVIEW_SECTIONS)[number];
/** กราฟรายวัน = 14 วันล่าสุดจบที่ `to` เสมอ (คำตัดสิน R5) */
export const OVERVIEW_CHART_DAYS = 14;
/** สาขาในการ์ดเปรียบเทียบสูงสุด (สาขาละ 2 รายงาน) */
export const OVERVIEW_MAX_UNITS = 8;
/** R7 #4 — สาขาที่คำนวณพร้อมกันสูงสุด (สาขาละ 2 รายงาน ⇒ ≤ 6 รายงานพร้อมกันในส่วนสาขา) */
const BRANCH_CONCURRENCY = 3;
/** สินค้าขายดีในภาพรวม (แถวของรายงานกำไร — คีย์/ลำดับ/ยอดเดียวกับรายงานสินค้า) */
const TOP_ROWS = 5;

export type OverviewPart<T> = { ok: true; data: T } | { ok: false; code: string };
export type OverviewBranchRow = { unitId: string; name: string; daily: OverviewPart<DailyTotals>; margin: OverviewPart<MarginTotals> };
export type OverviewBranches = {
  /** สาขาที่ผู้ใช้ดูรายงานได้ทั้งหมด (POS นี้ · ไม่รวม archived — ชุดเดียวกับตัวเลือกสาขาของหน้า) */
  totalUnits: number;
  /** ≤ 8 สาขา · สาขาที่เลือกขึ้นก่อน · เห็น < 2 สาขา = ว่าง (จอไม่แสดงการ์ด) */
  rows: OverviewBranchRow[];
  /** แถว "รวมทุกสาขา" = ขอบเขตทุกสาขาของรายงานเดิม (อาจรวมสาขาที่ archived แล้ว — R13) */
  all: { daily: OverviewPart<DailyTotals>; margin: OverviewPart<MarginTotals> } | null;
};
export type ReportOverview = {
  from: string;
  to: string;
  unitId: string | null;
  prevRange: { from: string; to: string };
  chartRange: { from: string; to: string };
  daily?: OverviewPart<Report<"daily", DailyRow, DailyTotals>>;
  prev?: OverviewPart<Report<"daily", DailyRow, DailyTotals>>;
  margin?: OverviewPart<Report<"margin", MarginRow, MarginTotals>>;
  payments?: OverviewPart<Report<"payments", PaymentRow, PaymentTotals>>;
  staff?: OverviewPart<Report<"staff", StaffRow, StaffTotals>>;
  chart?: OverviewPart<Report<"daily", DailyRow, DailyTotals>>;
  branches?: OverviewPart<OverviewBranches>;
};
export type ReportOverviewResult = { ok: true; overview: ReportOverview } | ReportRefusal;
export type ReportOverviewInput = { from: string; to: string; only?: OverviewSection[] };

const DAY_MS = 86_400_000;
const isDate = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const spanDays = (from: string, to: string) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1;
const isSection = (v: unknown): v is OverviewSection => typeof v === "string" && (OVERVIEW_SECTIONS as readonly string[]).includes(v);
const validation = (message: string): ReportRefusal => ({ ok: false, code: "VALIDATION", message });

type AnyResult<T> = { ok: true; report: T } | { ok: false; code: string };
/** ผลรายงานเดิม → ส่วนของภาพรวม (ปฏิเสธ = รหัสเดิม · throw = INTERNAL เฉพาะส่วนนี้) */
async function part<T, U = T>(name: string, p: Promise<AnyResult<T>>, pick?: (r: T) => U): Promise<OverviewPart<U>> {
  try {
    const r = await p;
    if (r.ok) return { ok: true, data: pick ? pick(r.report) : (r.report as unknown as U) };
    return { ok: false, code: r.code };
  } catch (e) {
    console.error(`[pos/report-overview] ${name}`, e);
    return { ok: false, code: "INTERNAL" };
  }
}

/** map แบบจำกัดจำนวนงานพร้อมกัน (คงลำดับผล) — ไม่เพิ่ม dependency */
async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** สาขาที่ผู้ใช้ดูรายงานได้ = สาขาที่ผูกกับ POS นี้ (ไม่ archived) ∩ เข้าได้ ∩ pos.report.view — ชุดเดียวกับหน้า /pos/reports */
async function reportUnits(db: Db, tenantId: string, systemId: string, actor: RegisterActor): Promise<{ id: string; name: string }[]> {
  const links = await db.appSystemUnit.findMany({ where: { tenantId, systemId, type: "POS" }, select: { unitId: true } });
  if (links.length === 0) return [];
  const units = await db.businessUnit.findMany({
    where: { tenantId, id: { in: links.map((l) => l.unitId) }, status: { not: "ARCHIVED" } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  return units.filter((u) => canAccessUnit(actor, u.id) && evaluate(actor, { module: "pos", action: REPORT_PERMISSION, unitId: u.id }));
}

/**
 * ภาพรวมการขาย (ภาพ 08) — ทุกส่วนยิงพร้อมกัน (ส่วนสาขาจำกัดทีละ 3 สาขา)
 * ctx/actor = ชุดเดียวกับ posReportAction (ร้านจาก session · สิทธิ์/ขอบเขตตัดสินในฟังก์ชันรายงานแต่ละตัว)
 * input: from/to (ช่วงของ KPI) · only = โหลดเฉพาะบางส่วน (ปุ่มลองใหม่) · ไม่ส่ง = ทุกส่วน
 * ช่วงผิดรูป / only มีค่าที่ไม่รู้จัก = VALIDATION ทั้งก้อน (ยังไม่มีส่วนให้คำนวณ) · ที่เหลือปฏิเสธต่อส่วน
 */
export async function reportOverview(ctx: ReportCtx, actor: RegisterActor, input: ReportOverviewInput, client?: Db): Promise<ReportOverviewResult> {
  const db = client ?? prisma;
  const from = input?.from;
  const to = input?.to;
  if (!isDate(from) || !isDate(to) || from > to) return validation("ช่วงวันที่ไม่ถูกต้อง — เลือกวันเริ่ม/วันสิ้นสุด (ไม่เกิน 92 วัน)");
  const onlyRaw = input?.only;
  if (onlyRaw !== undefined && (!Array.isArray(onlyRaw) || onlyRaw.length === 0 || !onlyRaw.every(isSection))) return validation("ไม่รู้จักส่วนของภาพรวมนี้");
  const want = new Set<OverviewSection>(onlyRaw ?? OVERVIEW_SECTIONS);
  const n = spanDays(from, to);
  const prevRange = { from: addDays(from, -n), to: addDays(from, -1) };
  const chartRange = { from: addDays(to, -(OVERVIEW_CHART_DAYS - 1)), to };
  const unitId = typeof ctx?.unitId === "string" && ctx.unitId ? ctx.unitId : null;
  const scoped: ReportCtx = { tenantId: ctx.tenantId, systemId: ctx.systemId, ...(unitId ? { unitId } : {}) };
  const allCtx: ReportCtx = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  const range = { from, to };

  // รายงานหลัก (ขอบเขตที่เลือก) — เริ่มเมื่อมีผู้ใช้จริงเท่านั้น (R7 #6) แล้วใช้ซ้ำกับกราฟ/ด่านสาขา/แถวรวม
  // ผลที่ใช้ซ้ำอาจถูกรอหลายที่ — catch เปล่ากัน unhandled rejection โดยไม่กระทบผู้รอรายอื่น
  let dailyP: Promise<AnyResult<Report<"daily", DailyRow, DailyTotals>>> | null = null;
  let marginP: Promise<AnyResult<Report<"margin", MarginRow, MarginTotals>>> | null = null;
  const getDaily = () => {
    if (!dailyP) void (dailyP = reportDailySales(scoped, actor, range, db)).catch(() => undefined);
    return dailyP;
  };
  const getMargin = () => {
    if (!marginP) void (marginP = reportMargin(scoped, actor, { ...range, limit: TOP_ROWS }, db)).catch(() => undefined);
    return marginP;
  };
  const out: ReportOverview = { from, to, unitId, prevRange, chartRange };
  const jobs: Promise<void>[] = [];
  const job = <K extends keyof ReportOverview>(k: K, p: Promise<ReportOverview[K]>) => jobs.push(p.then((v) => void (out[k] = v)));

  if (want.has("daily")) job("daily", part("daily", getDaily()));
  if (want.has("prev")) job("prev", part("prev", reportDailySales(scoped, actor, prevRange, db)));
  if (want.has("margin")) job("margin", part("margin", getMargin()));
  if (want.has("payments")) job("payments", part("payments", reportPayments(scoped, actor, range, db)));
  if (want.has("staff")) job("staff", part("staff", reportStaff(scoped, actor, range, db)));
  if (want.has("chart")) job("chart", part("chart", chartRange.from === from ? getDaily() : reportDailySales(scoped, actor, chartRange, db)));
  if (want.has("branches")) {
    job(
      "branches",
      (async (): Promise<OverviewPart<OverviewBranches>> => {
        try {
          // R7 #3: ช่วงเกิน 92 วัน = ไม่กระจายต่อสาขาเลย (ส่วนอื่นก็ VALIDATION อยู่แล้ว · กราฟ 14 วันยังได้)
          if (n > REPORT_MAX_DAYS) return { ok: false, code: "VALIDATION" };
          // R7 #2: เลือกสาขา = ด่านเดียวกับส่วนอื่น (รายวันของสาขานั้น) · ไม่เทียบกับ reportUnits เพราะสาขา archived ยังเลือกได้
          if (unitId) {
            const gate = await part("branches gate", getDaily());
            if (!gate.ok) return { ok: false, code: gate.code };
          }
          const units = await reportUnits(db, ctx.tenantId, ctx.systemId, actor);
          if (units.length < 2) return { ok: true, data: { totalUnits: units.length, rows: [], all: null } };
          const picked = [...units.filter((u) => u.id === unitId), ...units.filter((u) => u.id !== unitId)].slice(0, OVERVIEW_MAX_UNITS);
          const totalsOfDaily = (r: Report<"daily", DailyRow, DailyTotals>) => r.totals;
          const totalsOfMargin = (r: Report<"margin", MarginRow, MarginTotals>) => r.totals;
          const [rows, allDaily, allMargin] = await Promise.all([
            // R7 #4: ทีละ BRANCH_CONCURRENCY สาขา (สาขาละ 2 รายงาน) — ไม่ยิง 16 รายงานพร้อมกัน
            mapLimit(picked, BRANCH_CONCURRENCY, async (u) => {
              const uc: ReportCtx = { tenantId: ctx.tenantId, systemId: ctx.systemId, unitId: u.id };
              const [d, m] = await Promise.all([
                part(`branch daily ${u.id}`, reportDailySales(uc, actor, range, db), totalsOfDaily),
                part(`branch margin ${u.id}`, reportMargin(uc, actor, { ...range, limit: 1 }, db), totalsOfMargin),
              ]);
              return { unitId: u.id, name: u.name, daily: d, margin: m };
            }),
            part("all daily", !unitId ? getDaily() : reportDailySales(allCtx, actor, range, db), totalsOfDaily),
            part("all margin", !unitId ? getMargin() : reportMargin(allCtx, actor, { ...range, limit: 1 }, db), totalsOfMargin),
          ]);
          return { ok: true, data: { totalUnits: units.length, rows, all: { daily: allDaily, margin: allMargin } } };
        } catch (e) {
          console.error("[pos/report-overview] branches", e);
          return { ok: false, code: "INTERNAL" };
        }
      })(),
    );
  }
  await Promise.all(jobs);
  return { ok: true, overview: out };
}

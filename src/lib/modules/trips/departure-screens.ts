// ─────────────────────────────────────────────────────────────
// trips/departure-screens.ts — ตัวโหลดจอปฏิทินรอบและที่ว่าง ฝั่งร้าน (ภาพ 11 · RUN TRIPS T1.2 §4)
// ทุกตัว (ctx: { tenantId, actorUserId }, input, opts?: { now? }) · ด่านลำดับเดียวกับ T1.1: zod strict (INVALID_INPUT) → หน่วย (NOT_FOUND/UNIT_NOT_TRIPS) → สิทธิ์ (FORBIDDEN)
//   คืน { ok: true, vm } | { ok: false, code, message } ไม่ throw (ยกเว้นฐานล่ม)
// 🔴 อ่านอย่างเดียว · tenantDb + บริการ T0.3/T0.5 + facade ค่าตั้ง · ไม่ import prisma · ไม่แตะตารางการจอง/เงิน
// 🔴 "เต็ม" · ต่ำกว่าขั้นต่ำ · ปุ่มไหนแสดง · ราคา ตัดสินที่นี่ (คอมโพเนนต์แสดงอย่างเดียว) · ตัวเลขธุรกิจจากค่าตั้ง (เหลือ N · ขั้นต่ำ)
// 🔴 เพดาน + ไม่ N+1: นับรอบต่อวันก่อน (groupBy) → listDepartures ช่วงเดียว (ตัดช่วงเมื่อเกินเพดาน) · ข้อมูลประกอบอ่านเป็นชุดครั้งเดียวต่อจอ
// ─────────────────────────────────────────────────────────────
import { z } from "zod";
import { tenantDb } from "@/lib/core/db";
import type { LineRequest, SellChannel, SellCtx } from "@/lib/core/sellable";
import { resolveSettingsMany } from "@/lib/core/settings";
import { listDepartures, getDeparture, listSchedules, type DepartureDTO } from "./departures";
import { listResources } from "./resources";
import { loadPricingInput } from "./pricing";
import { resolveTripPrice, type PricedItem, type TripPricingInput } from "./pricing-core";
import { addDaysYmd, hhmm, normalizeTimezone, utcToLocal, ymdOf } from "./departures-core";
import { publicLeftOf } from "./capacity-core";
import { tripScheduleExceptionsSchema, tripScheduleRuleSchema } from "./json-schemas";
import { TRIPS_PRODUCT_VIEW_ANY, tripsFail, tripsUnitGate, type TripsFail, type TripsScreenCtx, type TripsUnitGate } from "./pickup";
import {
  calendarMonthDays,
  calendarWeekDays,
  defaultWeekStart,
  departureCellState,
  isCalendarMonth,
  isCalendarYmd,
  isMergeTarget,
  nextMonthOf,
  prevMonthOf,
  type DepartureCellState,
} from "./departure-view-core";

type Opts = { now?: Date };
type ScreenCode = "INVALID_INPUT" | "NOT_FOUND" | "FORBIDDEN" | "UNIT_NOT_TRIPS";
type Fail = TripsFail<ScreenCode | string>;
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isFail = (x: unknown): x is TripsFail => isRec(x) && x.ok === false;
const ID = z.string().min(1).max(128);
const YMD = z.string().refine(isCalendarYmd);
const MONTH = z.string().refine(isCalendarMonth);
const nowOf = (opts?: Opts) => (opts?.now instanceof Date && !Number.isNaN(opts.now.getTime()) ? opts.now : new Date());
const DAY_MS = 86_400_000;
const i18nTh = (v: unknown): string => (isRec(v) && typeof v.th === "string" ? v.th : "");
const i18nEn = (v: unknown): string | null => (isRec(v) && typeof v.en === "string" && v.en.trim() ? v.en : null);

// ═══════════════ เพดาน (ส่งออก · ข้อความบนจอเมื่อถูกตัด) ═══════════════
/** รอบสูงสุดต่อจอ (ทุกสินค้ารวม) — เกิน ⇒ ตัดช่วงให้จบที่วันสุดท้ายที่สะสมไม่เกินเพดาน */
export const TRIPS_CALENDAR_DEPARTURE_CAP = 600;
/** แถวสินค้าสูงสุดต่อจอ */
export const TRIPS_CALENDAR_PRODUCT_CAP = 60;
/** ทริปหลายวันสูงสุดในมุมมอง "ทริปหลายวัน" */
const TRIPS_LIST_CAP = 100;
/** เป้ารวมรอบสูงสุดในแผง */
const MERGE_TARGET_CAP = 50;
/** กฎซ้ำสูงสุดที่อ่านต่อจอ (ส่วนหัวแถว · วันงดตามกฎ · กล่องกฎซ้ำ) */
const SCHEDULE_CAP = 300;

const DEPARTURE_ANY = ["trips.departure.view", "trips.departure.edit", "trips.departure.status"] as const;
const LOW_KEY = "trips.public.showLeftAtOrBelow";
const MIN_KEY = "trips.sell.minToDepart";
const TYPE_ORDER = ["TOUR", "LIVEABOARD", "ATTRACTION"] as const;

function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> | Fail {
  const r = schema.safeParse(input);
  return r.success ? r.data : tripsFail("INVALID_INPUT");
}
/** ด่าน: หน่วย → สิทธิ์รอบ (view|edit|status) */
async function gateDepartures(ctx: TripsScreenCtx, unitId: string): Promise<TripsUnitGate | Fail> {
  const g = await tripsUnitGate(ctx, { unitId });
  if (isFail(g)) return g;
  if (!g.canAny(DEPARTURE_ANY)) return tripsFail("FORBIDDEN");
  return g;
}
async function tzOf(g: TripsUnitGate): Promise<string> {
  const u = await tenantDb({ tenantId: g.tenantId }).businessUnit.findFirst({ where: { id: g.unitId, tenantId: g.tenantId }, select: { settings: true } });
  return normalizeTimezone(isRec(u?.settings) ? u.settings.timezone : null);
}
/** ส่งต่อรหัสของบริการ T0.3 (ข้อความไทยเดิม) */
const passFail = (r: { code: string; message: string }): Fail => ({ ok: false, code: r.code, message: r.message });

const hmOf = (tz: string, iso: string): string => hhmm(utcToLocal(tz, new Date(iso)).minutes);
const timeTextOf = (tz: string, startsAt: string, endsAt: string): string => `${hmOf(tz, startsAt)}–${hmOf(tz, endsAt)}`;
const localOf = (tz: string, iso: string | null): { ymd: string; hm: string } | null => {
  if (!iso) return null;
  const l = utcToLocal(tz, new Date(iso));
  return { ymd: l.ymd, hm: hhmm(l.minutes) };
};
const lowOf = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : null);
const minPaxOf = (v: unknown): number | null => (isRec(v) && typeof v.minPax === "number" ? v.minPax : null);
/** หยุดขายที่ยังมีผล (until ยังไม่ถึง) */
function stopSellOf(v: unknown, now: Date): { channels: string[]; reason: string; until: string | null } | null {
  if (!isRec(v)) return null;
  const until = typeof v.until === "string" ? v.until : null;
  if (until !== null && Date.parse(until) <= now.getTime()) return null;
  return { channels: Array.isArray(v.channels) ? v.channels.filter((x): x is string => typeof x === "string") : [], reason: typeof v.reason === "string" ? v.reason : "", until };
}

// ═══════════════ ชนิด VM ═══════════════
export type CalendarView = "week" | "month" | "trips";
export type CalendarFilter = "all" | "tour" | "dive";
export type DepartureCellVM = {
  departureId: string;
  productId: string;
  optionId: string | null;
  localDate: string;
  endDate: string;
  startsAt: string;
  endsAt: string;
  timeText: string;
  status: string;
  state: DepartureCellState;
  capacity: number;
  sold: number;
  held: number;
  reserved: number;
  /** ตัวเลขบนช่อง = ขาย + ถือ (ภาพ :44 "รวมที่ถือ") · โควตาไม่รวมในตัวเลขแต่หักในที่ว่าง */
  used: number;
  seatsLeft: number;
  minPax: number | null;
  shortBy: number | null;
  waitlist: number;
  cancelReason: string | null;
  decisionAt: string | null;
  /** เวลาตัดสินตามเวลาร้าน (จอแสดง) */
  decisionLocal: { ymd: string; hm: string } | null;
  needsDecision: boolean;
  hasDeparturePrice: boolean;
  stopSell: boolean;
  multiDay: boolean;
};
export type CalendarProductVM = {
  id: string;
  titleTh: string;
  titleEn: string | null;
  productType: string;
  deepDive: boolean;
  status: string;
  header: { boats: string[]; vans: number; guides: number; capacity: number | null; minPax: number | null; unitWord: "SEAT" | "BERTH" };
  nextTrip: { departureId: string; localDate: string; endDate: string; capacity: number; sold: number; held: number } | null;
};
export type DecisionVM = {
  departureId: string;
  productId: string;
  titleTh: string;
  localDate: string;
  timeText: string;
  sold: number;
  used: number;
  minPax: number | null;
  shortBy: number | null;
  decisionAt: string | null;
  decisionLocal: { ymd: string; hm: string } | null;
  overdue: boolean;
  mergeTargets: number;
  /** ชื่อไทยของเป้าแรก (บรรทัด "เสนอ: รวมกับ …") */
  firstTargetTitle: string | null;
};
export type DepartureCalendarVM = {
  unit: { id: string; slug: string; tz: string; today: string; nowIso: string };
  view: CalendarView;
  filter: CalendarFilter;
  range: { from: string; to: string; days: string[] };
  nav: { prev: string; next: string; today: string } | null;
  flags: { canEdit: boolean; canStatus: boolean; canPrice: boolean; canSeePrices: boolean };
  products: CalendarProductVM[];
  productsTotal: number;
  productsTruncated: boolean;
  cells: DepartureCellVM[];
  emptyDays: { productId: string; localDate: string; reason: "SKIPPED" }[];
  decisions: DecisionVM[];
  counts: { belowMin: number; cancelled: { departures: number; pax: number; reasons: { text: string; n: number }[] } };
  trips: { departureId: string; productId: string; titleTh: string; localDate: string; endDate: string; capacity: number; sold: number; held: number; seatsLeft: number; state: DepartureCellState }[];
  tripsTruncated: boolean;
  shown: number;
  total: number;
  cap: number;
  truncated: boolean;
  shownUntil: string | null;
};

// ═══════════════ ตัวช่วยร่วม ═══════════════
type DepFlags = { canEdit: boolean; canStatus: boolean; canPrice: boolean; canSeePrices: boolean };
function flagsOf(g: TripsUnitGate): DepFlags {
  const canSeePrices = g.canAny(TRIPS_PRODUCT_VIEW_ANY);
  return { canEdit: g.can("trips.departure.edit"), canStatus: g.can("trips.departure.status"), canPrice: canSeePrices && g.can("trips.price.edit"), canSeePrices };
}
type CellExtras = { cancelReason: Map<string, string | null>; cancelledAt: Map<string, string | null>; waitlist: Map<string, number>; priced: Set<string> };
/** ข้อมูลประกอบของชุดรอบ: เหตุยกเลิก · รายการรอ · ราคาเฉพาะรอบ — 3 คิวรีต่อจอ (ไม่วนต่อรอบ) */
async function cellExtrasOf(g: TripsUnitGate, items: DepartureDTO[]): Promise<CellExtras> {
  const ids = items.map((d) => d.id);
  const cancelledIds = items.filter((d) => d.status === "CANCELLED").map((d) => d.id);
  if (!ids.length) return { cancelReason: new Map(), cancelledAt: new Map(), waitlist: new Map(), priced: new Set() };
  const [cx, wl, pr] = await Promise.all([
    cancelledIds.length
      ? g.db.tripDeparture.findMany({ where: { tenantId: g.tenantId, unitId: g.unitId, id: { in: cancelledIds } }, select: { id: true, cancelReason: true, cancelledAt: true } })
      : Promise.resolve([]),
    g.db.tripWaitlist.groupBy({ by: ["departureId"], where: { tenantId: g.tenantId, unitId: g.unitId, departureId: { in: ids }, status: { in: ["WAITING", "OFFERED"] } }, _sum: { qty: true } }),
    g.db.tripPrice.groupBy({ by: ["departureId"], where: { tenantId: g.tenantId, unitId: g.unitId, departureId: { in: ids } }, _count: { _all: true } }),
  ]);
  return {
    cancelReason: new Map(cx.map((r) => [r.id, r.cancelReason])),
    cancelledAt: new Map(cx.map((r) => [r.id, r.cancelledAt ? r.cancelledAt.toISOString() : null])),
    waitlist: new Map(wl.map((r) => [r.departureId, r._sum.qty ?? 0])),
    priced: new Set(pr.map((r) => r.departureId).filter((x): x is string => typeof x === "string")),
  };
}
function cellOf(d: DepartureDTO, x: CellExtras, tz: string, now: Date, today: string, low: number | null): DepartureCellVM {
  const state = departureCellState(d, { now, today, lowAtOrBelow: low });
  return {
    departureId: d.id,
    productId: d.productId,
    optionId: d.optionId,
    localDate: d.localDate,
    endDate: utcToLocal(tz, new Date(d.endsAt)).ymd,
    startsAt: d.startsAt,
    endsAt: d.endsAt,
    timeText: timeTextOf(tz, d.startsAt, d.endsAt),
    status: d.status,
    state,
    capacity: d.capacity,
    sold: d.sold,
    held: d.held,
    reserved: d.reserved,
    used: d.sold + d.held,
    seatsLeft: publicLeftOf(d),
    minPax: d.minPax,
    shortBy: state === "BELOW_MIN" && d.minPax !== null ? d.minPax - d.sold : null,
    waitlist: x.waitlist.get(d.id) ?? 0,
    cancelReason: x.cancelReason.get(d.id) ?? null,
    decisionAt: d.decisionAt,
    decisionLocal: localOf(tz, d.decisionAt),
    needsDecision: d.needsDecision,
    hasDeparturePrice: x.priced.has(d.id),
    stopSell: stopSellOf(d.stopSell, now) !== null,
    multiDay: Date.parse(d.endsAt) - Date.parse(d.startsAt) >= DAY_MS,
  };
}
/** ค่าตั้งเหลือ N + ขั้นต่ำ ของหลายสินค้า — resolveSettingsMany ครั้งเดียว */
async function productPolicyOf(g: TripsUnitGate, productIds: string[], now: Date): Promise<Map<string, { low: number | null; minPax: number | null }>> {
  const out = new Map<string, { low: number | null; minPax: number | null }>();
  if (!productIds.length) return out;
  const rs = await resolveSettingsMany({ tenantId: g.tenantId }, [LOW_KEY, MIN_KEY], productIds.map((productId) => ({ unitId: g.unitId, productId })), now);
  productIds.forEach((p, i) => out.set(p, { low: lowOf(rs[i]?.[LOW_KEY]?.value), minPax: minPaxOf(rs[i]?.[MIN_KEY]?.value) }));
  return out;
}

// ═══════════════ 1. ปฏิทิน ═══════════════
const CAL_IN = z.strictObject({
  unitId: ID,
  view: z.enum(["week", "month", "trips"]).optional(),
  start: YMD.optional(),
  month: MONTH.optional(),
  filter: z.enum(["all", "tour", "dive"]).optional(),
});
type ScheduleLite = { id: string; productId: string; optionId: string | null; exceptions: unknown; capacity: number; resourceIds: string[]; dateFrom: Date; dateTo: Date | null; pausedAt: Date | null };

export async function loadDepartureCalendarVM(ctx: TripsScreenCtx, input: unknown, opts?: Opts): Promise<{ ok: true; vm: DepartureCalendarVM } | Fail> {
  const p = parse(CAL_IN, input);
  if (isFail(p)) return p;
  const g = await gateDepartures(ctx, p.unitId);
  if (isFail(g)) return g;
  const now = nowOf(opts);
  const tz = await tzOf(g);
  const today = utcToLocal(tz, now).ymd;
  const view: CalendarView = p.view ?? "week";
  const filter: CalendarFilter = p.filter ?? "all";

  // ── ช่วงวัน + ปุ่มเลื่อน ──
  let days: string[];
  let nav: DepartureCalendarVM["nav"];
  if (view === "week") {
    const start = p.start ?? defaultWeekStart(today);
    days = calendarWeekDays(start);
    nav = { prev: addDaysYmd(start, -7), next: addDaysYmd(start, 7), today: defaultWeekStart(today) };
  } else if (view === "month") {
    const month = p.month ?? today.slice(0, 7);
    days = calendarMonthDays(month);
    nav = { prev: prevMonthOf(month), next: nextMonthOf(month), today: today.slice(0, 7) };
  } else {
    days = Array.from({ length: 366 }, (_, i) => addDaysYmd(today, i));
    nav = null;
  }
  if (!days.length) return tripsFail("INVALID_INPUT");
  const from = days[0];
  const to = days[days.length - 1];

  // ── สินค้า (ไม่ ARCHIVED · ตัวกรอง · เรียง TOUR → LIVEABOARD → ATTRACTION แล้ว createdAt, id · เพดาน) ──
  const typeWhere = filter === "tour" ? { productType: "TOUR", deepDive: false } : filter === "dive" ? { deepDive: true } : {};
  const baseWhere = { tenantId: g.tenantId, unitId: g.unitId, status: { not: "ARCHIVED" }, ...typeWhere };
  const PRODUCT_SELECT = { id: true, title: true, productType: true, deepDive: true, status: true } as const;
  const [productsTotal, ...byType] = await Promise.all([
    g.db.tripProduct.count({ where: baseWhere }),
    ...TYPE_ORDER.map((t) => g.db.tripProduct.findMany({ where: { ...baseWhere, productType: t }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: TRIPS_CALENDAR_PRODUCT_CAP, select: PRODUCT_SELECT })),
    g.db.tripProduct.findMany({ where: { ...baseWhere, productType: { notIn: [...TYPE_ORDER] } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: TRIPS_CALENDAR_PRODUCT_CAP, select: PRODUCT_SELECT }),
  ]);
  const prodRows = byType.flat().slice(0, TRIPS_CALENDAR_PRODUCT_CAP);
  const shownIds = prodRows.map((r) => r.id);
  const shownSet = new Set(shownIds);

  // ── นับรอบต่อวัน/สินค้า (ทั้งหน่วย) ก่อน แล้วอ่านรอบช่วงเดียว (ตัดช่วงเมื่อเกินเพดาน) ──
  const counted =
    view === "trips"
      ? []
      : await g.db.tripDeparture.groupBy({
          by: ["localDate", "productId"],
          where: { tenantId: g.tenantId, unitId: g.unitId, localDate: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T00:00:00.000Z`) } },
          _count: { _all: true },
          orderBy: [{ localDate: "asc" }, { productId: "asc" }],
          take: days.length * (TRIPS_CALENDAR_DEPARTURE_CAP + 1),
        });
  const perDay = new Map<string, number>();
  let total = 0;
  const productsInRange = new Set<string>();
  for (const r of counted) {
    const d = ymdOf(r.localDate);
    perDay.set(d, (perDay.get(d) ?? 0) + r._count._all);
    if (shownSet.has(r.productId)) {
      total += r._count._all;
      productsInRange.add(r.productId);
    }
  }
  let cutTo: string | null = view === "trips" ? null : to;
  let sliceFirstDay = false;
  if (view !== "trips") {
    let cum = 0;
    let last: string | null = null;
    for (const d of days) {
      cum += perDay.get(d) ?? 0;
      if (cum > TRIPS_CALENDAR_DEPARTURE_CAP) break;
      last = d;
    }
    if (cum > TRIPS_CALENDAR_DEPARTURE_CAP) {
      cutTo = last ?? from;
      sliceFirstDay = last === null; // วันแรกวันเดียวเกินเพดาน ⇒ อ่านวันแรกแล้วตัดที่เพดาน
    }
  }
  let all: DepartureDTO[] = [];
  if (cutTo !== null) {
    const r = await listDepartures(ctx, { unitId: g.unitId, from, to: cutTo }, { now });
    if (!r.ok) return passFail(r);
    all = sliceFirstDay ? r.items.slice(0, TRIPS_CALENDAR_DEPARTURE_CAP) : r.items;
  }
  const items = all.filter((d) => shownSet.has(d.productId));

  // ── ข้อมูลประกอบ (เป็นชุด): ค่าตั้ง · กฎ · ตัวเลือก · ทรัพยากร · ประกอบช่อง · ชื่อสินค้าเป้ารวม ──
  const otherProductIds = [...new Set(all.map((d) => d.productId).filter((id) => !shownSet.has(id)))];
  const [policies, options, schedules, extras, otherProducts] = await Promise.all([
    productPolicyOf(g, [...new Set([...shownIds, ...otherProductIds])], now),
    shownIds.length
      ? g.db.tripOption.findMany({ where: { tenantId: g.tenantId, unitId: g.unitId, productId: { in: shownIds }, active: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }], select: { id: true, productId: true } })
      : Promise.resolve([]),
    shownIds.length
      ? g.db.tripSchedule.findMany({
          where: { tenantId: g.tenantId, unitId: g.unitId, productId: { in: shownIds } },
          orderBy: [{ dateFrom: "desc" }, { id: "asc" }],
          take: SCHEDULE_CAP,
          select: { id: true, productId: true, optionId: true, exceptions: true, capacity: true, resourceIds: true, dateFrom: true, dateTo: true, pausedAt: true },
        })
      : Promise.resolve([] as ScheduleLite[]),
    cellExtrasOf(g, items),
    otherProductIds.length
      ? g.db.tripProduct.findMany({ where: { tenantId: g.tenantId, unitId: g.unitId, id: { in: otherProductIds } }, select: { id: true, title: true, status: true } })
      : Promise.resolve([]),
  ]);
  const firstOption = new Map<string, string>();
  for (const o of options) if (!firstOption.has(o.productId)) firstOption.set(o.productId, o.id);
  /** กฎของส่วนหัวแถว: ไม่พัก · ของตัวเลือกแรกที่เปิด (หรือไม่ระบุตัวเลือก) · ครอบช่วงที่ดูก่อน แล้วยังไม่หมดอายุ แล้วล่าสุด */
  const headerSchedule = (productId: string): ScheduleLite | null => {
    const opt = firstOption.get(productId) ?? null;
    const mine = schedules.filter((s) => s.productId === productId && s.pausedAt === null && (s.optionId === opt || s.optionId === null));
    const overlaps = (s: ScheduleLite) => ymdOf(s.dateFrom) <= to && (s.dateTo === null || ymdOf(s.dateTo) >= from);
    const alive = (s: ScheduleLite) => s.dateTo === null || ymdOf(s.dateTo) >= today;
    return mine.find(overlaps) ?? mine.find(alive) ?? mine[0] ?? null;
  };
  const resIds = [...new Set(shownIds.flatMap((id) => headerSchedule(id)?.resourceIds ?? []))];
  const resRows = resIds.length ? await g.db.tripResource.findMany({ where: { tenantId: g.tenantId, unitId: g.unitId, id: { in: resIds } }, select: { id: true, kind: true, name: true } }) : [];
  const resById = new Map(resRows.map((r) => [r.id, r]));

  // ── ช่อง ──
  const cells = items.map((d) => cellOf(d, extras, tz, now, today, policies.get(d.productId)?.low ?? null));
  const shownUntil = view === "trips" ? null : (cutTo ?? to);
  const titleOf = new Map<string, string>([...prodRows.map((r) => [r.id, i18nTh(r.title)] as const), ...otherProducts.map((r) => [r.id, i18nTh(r.title)] as const)]);
  const archived = new Set(otherProducts.filter((r) => r.status === "ARCHIVED").map((r) => r.id));

  // ── วันงดตามกฎ (สัปดาห์เท่านั้น) ──
  const emptyDays: DepartureCalendarVM["emptyDays"] = [];
  if (view === "week") {
    const has = new Set(cells.map((c) => `${c.productId}|${c.localDate}`));
    for (const pid of shownIds) {
      const skips = new Set<string>();
      for (const s of schedules) {
        if (s.productId !== pid) continue;
        const ex = tripScheduleExceptionsSchema.safeParse(s.exceptions);
        if (!ex.success) continue;
        for (const e of ex.data) if (e.action === "SKIP" && e.date >= ymdOf(s.dateFrom) && (s.dateTo === null || e.date <= ymdOf(s.dateTo))) skips.add(e.date);
      }
      for (const d of days) if (shownUntil !== null && d <= shownUntil && skips.has(d) && !has.has(`${pid}|${d}`)) emptyDays.push({ productId: pid, localDate: d, reason: "SKIPPED" });
    }
  }

  // ── ต้องตัดสินใจ (ช่วงที่ดูอยู่ · มติ Q4) ──
  const targetPool = all.filter((d) => !archived.has(d.productId));
  const decisions: DecisionVM[] = cells
    .filter((c) => c.state === "BELOW_MIN")
    .sort((a, b) => (a.decisionAt ?? "9999").localeCompare(b.decisionAt ?? "9999") || a.startsAt.localeCompare(b.startsAt) || a.departureId.localeCompare(b.departureId))
    .map((c) => {
      const src = { id: c.departureId, localDate: c.localDate, sold: c.sold, held: c.held, reserved: c.reserved };
      const targets = targetPool.filter((t) => isMergeTarget(src, t, { now, today }));
      return {
        departureId: c.departureId,
        productId: c.productId,
        titleTh: titleOf.get(c.productId) ?? "",
        localDate: c.localDate,
        timeText: c.timeText,
        sold: c.sold,
        used: c.used,
        minPax: c.minPax,
        shortBy: c.shortBy,
        decisionAt: c.decisionAt,
        decisionLocal: c.decisionLocal,
        overdue: c.needsDecision,
        mergeTargets: targets.length,
        firstTargetTitle: targets.length ? (titleOf.get(targets[0].productId) ?? null) : null,
      };
    });

  // ── ยกเลิก ──
  const cx = cells.filter((c) => c.state === "CANCELLED");
  const reasons = new Map<string, number>();
  for (const c of cx) if (c.cancelReason) reasons.set(c.cancelReason, (reasons.get(c.cancelReason) ?? 0) + 1);
  const counts: DepartureCalendarVM["counts"] = {
    belowMin: decisions.length,
    cancelled: {
      departures: cx.length,
      pax: cx.reduce((s, c) => s + c.used, 0),
      reasons: [...reasons.entries()].map(([text, n]) => ({ text, n })).sort((a, b) => b.n - a.n || a.text.localeCompare(b.text)),
    },
  };

  // ── ทริปถัดไปของสินค้าที่ไม่มีรอบในช่วง (คิวรีเดียว DISTINCT ON) ──
  const noneIds = view === "trips" ? [] : shownIds.filter((id) => !productsInRange.has(id));
  const nexts = noneIds.length
    ? await g.db.$queryRaw<{ id: string; productId: string; localDate: Date; endsAt: Date; capacity: number; sold: number; held: number }[]>`
        SELECT DISTINCT ON ("productId") "id", "productId", "localDate", "endsAt", "capacity", "sold", "held"
        FROM "TripDeparture"
        WHERE "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "productId" = ANY(${noneIds}::text[])
          AND "status" <> 'CANCELLED' AND "localDate" > ${to}::date
        ORDER BY "productId", "startsAt", "id"`
    : [];
  const nextBy = new Map(nexts.map((n) => [n.productId, n]));

  // ── ทริปหลายวัน ──
  let trips: DepartureCalendarVM["trips"] = [];
  let tripsTruncated = false;
  if (view === "trips" && shownIds.length) {
    const rows = await g.db.$queryRaw<{ id: string; productId: string; localDate: Date; startsAt: Date; endsAt: Date; status: string; capacity: number; sold: number; held: number; reserved: number; minPax: number | null }[]>`
      SELECT "id", "productId", "localDate", "startsAt", "endsAt", "status", "capacity", "sold", "held", "reserved", "minPax"
      FROM "TripDeparture"
      WHERE "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "productId" = ANY(${shownIds}::text[])
        AND "status" <> 'CANCELLED' AND "localDate" >= ${today}::date
        AND "endsAt" - "startsAt" >= interval '24 hours'
      ORDER BY "startsAt", "id"
      LIMIT ${TRIPS_LIST_CAP + 1}`;
    tripsTruncated = rows.length > TRIPS_LIST_CAP;
    trips = rows.slice(0, TRIPS_LIST_CAP).map((r) => {
      const localDate = ymdOf(r.localDate);
      return {
        departureId: r.id,
        productId: r.productId,
        titleTh: titleOf.get(r.productId) ?? "",
        localDate,
        endDate: utcToLocal(tz, r.endsAt).ymd,
        capacity: r.capacity,
        sold: r.sold,
        held: r.held,
        seatsLeft: publicLeftOf(r),
        state: departureCellState({ ...r, localDate }, { now, today, lowAtOrBelow: policies.get(r.productId)?.low ?? null }),
      };
    });
  }

  const products: CalendarProductVM[] = prodRows.map((r) => {
    const s = headerSchedule(r.id);
    const res = (s?.resourceIds ?? []).map((id) => resById.get(id)).filter((x): x is { id: string; kind: string; name: string } => !!x);
    const n = nextBy.get(r.id);
    return {
      id: r.id,
      titleTh: i18nTh(r.title),
      titleEn: i18nEn(r.title),
      productType: r.productType,
      deepDive: r.deepDive,
      status: r.status,
      header: {
        boats: res.filter((x) => x.kind === "BOAT").map((x) => x.name),
        vans: res.filter((x) => x.kind === "VAN").length,
        guides: res.filter((x) => x.kind === "GUIDE").length,
        capacity: s?.capacity ?? null,
        minPax: policies.get(r.id)?.minPax ?? null,
        unitWord: r.productType === "LIVEABOARD" ? "BERTH" : "SEAT",
      },
      nextTrip: n ? { departureId: n.id, localDate: ymdOf(n.localDate), endDate: utcToLocal(tz, n.endsAt).ymd, capacity: n.capacity, sold: n.sold, held: n.held } : null,
    };
  });

  return {
    ok: true,
    vm: {
      unit: { id: g.unitId, slug: g.unitSlug, tz, today, nowIso: now.toISOString() },
      view,
      filter,
      range: { from, to, days },
      nav,
      flags: flagsOf(g),
      products,
      productsTotal,
      productsTruncated: productsTotal > products.length,
      cells,
      emptyDays,
      decisions,
      counts,
      trips,
      tripsTruncated,
      shown: cells.length,
      total: view === "trips" ? 0 : total,
      cap: TRIPS_CALENDAR_DEPARTURE_CAP,
      truncated: cells.length < total,
      shownUntil,
    },
  };
}

// ═══════════════ 2. แผงรอบ ═══════════════
const PANEL_IN = z.strictObject({ unitId: ID, departureId: ID });
export type PanelActions = { close: boolean; reopen: boolean; guarantee: boolean; unguarantee: boolean; run: boolean; merge: boolean; cancel: boolean; capacity: boolean; resources: boolean; price: boolean; stopSell: boolean; manifest: boolean; book: boolean };
export type PriceRowVM = { paxTypeId: string; code: string; labelTh: string; satang: number | null; source: "RETAIL" | "SEASON" | "DEPARTURE" | "MISSING"; departurePriceId: string | null };
export type MergeTargetVM = { departureId: string; productId: string; titleTh: string; timeText: string; capacity: number; used: number; seatsLeft: number; resourceClash: boolean };
export type DeparturePanelVM = {
  unit: { id: string; slug: string; tz: string; today: string };
  departure: DepartureCellVM & {
    productTitle: string;
    productType: string;
    optionName: string | null;
    resources: { resourceId: string; kind: string; name: string; seats: number | null }[];
    resourceSummary: { boats: string[]; vans: number; guides: number; others: string[] };
    cutoffGroups: { atIso: string; local: { ymd: string; hm: string }; channels: SellChannel[] }[];
    stopSellInfo: { channels: string[]; reason: string; until: string | null; untilLocal: { ymd: string; hm: string } | null } | null;
    cancelledAt: string | null;
    version: number;
  };
  counts: { capacity: number; sold: number; held: number; reserved: number; used: number; seatsLeft: number; waitlistWaiting: number; waitlistOffered: number };
  /** ต้องมีการจอง (T0.6) — ใบนี้ไม่เติมตัวเลข */
  bookings: null;
  /** ต้องมีเงิน (T0.7/T1.7) — ใบนี้ไม่เติมตัวเลข */
  money: null;
  actions: PanelActions;
  cancelBlocked: boolean;
  mergeTargets: MergeTargetVM[];
  price: { canEdit: boolean; currency: string; productId: string; rows: PriceRowVM[] } | null;
  warnings: { code: "CAPACITY_OVER_SEATS"; resourceName: string; seats: number }[];
};
const SEAT_ORDER = ["ADULT", "CHILD", "INFANT"];
const seatRank = (code: string) => (SEAT_ORDER.includes(code) ? SEAT_ORDER.indexOf(code) : SEAT_ORDER.length);
const NO_ACTIONS: PanelActions = { close: false, reopen: false, guarantee: false, unguarantee: false, run: false, merge: false, cancel: false, capacity: false, resources: false, price: false, stopSell: false, manifest: false, book: false };

export async function loadDeparturePanelVM(ctx: TripsScreenCtx, input: unknown, opts?: Opts): Promise<{ ok: true; vm: DeparturePanelVM } | Fail> {
  const p = parse(PANEL_IN, input);
  if (isFail(p)) return p;
  const g = await gateDepartures(ctx, p.unitId);
  if (isFail(g)) return g;
  const now = nowOf(opts);
  const got = await getDeparture(ctx, { unitId: g.unitId, departureId: p.departureId }, { now });
  if (!got.ok) return passFail(got);
  const d = got.departure;
  const tz = await tzOf(g);
  const today = utcToLocal(tz, now).ymd;
  const flags = flagsOf(g);

  const resIds = d.resources.map((r) => r.resourceId);
  const [prod, opt, row, wl, priced, resRows, policies] = await Promise.all([
    g.db.tripProduct.findFirst({ where: { tenantId: g.tenantId, unitId: g.unitId, id: d.productId }, select: { id: true, title: true, currency: true, productType: true } }),
    d.optionId ? g.db.tripOption.findFirst({ where: { tenantId: g.tenantId, unitId: g.unitId, id: d.optionId }, select: { name: true } }) : Promise.resolve(null),
    g.db.tripDeparture.findFirst({ where: { tenantId: g.tenantId, unitId: g.unitId, id: d.id }, select: { cancelReason: true, cancelledAt: true } }),
    g.db.tripWaitlist.groupBy({ by: ["status"], where: { tenantId: g.tenantId, unitId: g.unitId, departureId: d.id, status: { in: ["WAITING", "OFFERED"] } }, _sum: { qty: true } }),
    g.db.tripPrice.findMany({ where: { tenantId: g.tenantId, unitId: g.unitId, departureId: d.id }, orderBy: [{ id: "asc" }], take: 50, select: { id: true, paxTypeId: true } }),
    resIds.length ? g.db.tripResource.findMany({ where: { tenantId: g.tenantId, unitId: g.unitId, id: { in: resIds } }, select: { id: true, seats: true } }) : Promise.resolve([]),
    productPolicyOf(g, [d.productId], now),
  ]);
  if (!prod) return tripsFail("NOT_FOUND");
  const wlOf = (s: string) => wl.find((x) => x.status === s)?._sum.qty ?? 0;
  const extras: CellExtras = {
    cancelReason: new Map([[d.id, row?.cancelReason ?? null]]),
    cancelledAt: new Map([[d.id, row?.cancelledAt ? row.cancelledAt.toISOString() : null]]),
    waitlist: new Map([[d.id, wlOf("WAITING") + wlOf("OFFERED")]]),
    priced: new Set(priced.length ? [d.id] : []),
  };
  const cell = cellOf(d, extras, tz, now, today, policies.get(d.productId)?.low ?? null);
  const seatsOf = new Map(resRows.map((r) => [r.id, r.seats]));
  const resources = d.resources.map((r) => ({ resourceId: r.resourceId, kind: r.kind, name: r.name, seats: seatsOf.get(r.resourceId) ?? null }));
  const resourceSummary = {
    boats: resources.filter((r) => r.kind === "BOAT").map((r) => r.name),
    vans: resources.filter((r) => r.kind === "VAN").length,
    guides: resources.filter((r) => r.kind === "GUIDE").length,
    others: resources.filter((r) => r.kind !== "BOAT" && r.kind !== "VAN" && r.kind !== "GUIDE").map((r) => r.name),
  };

  // ── ปิดรับต่อช่องทาง: กลุ่มเวลาเดียวกัน เรียงเวลา ──
  const groups = new Map<string, SellChannel[]>();
  for (const [ch, at] of Object.entries(d.cutoffs)) groups.set(at, [...(groups.get(at) ?? []), ch as SellChannel]);
  const cutoffGroups = [...groups.entries()]
    .sort((a, b) => Date.parse(a[0]) - Date.parse(b[0]))
    .map(([atIso, channels]) => ({ atIso, local: localOf(tz, atIso) ?? { ymd: "", hm: "" }, channels }));
  const ss = stopSellOf(d.stopSell, now);
  const stopSellInfo = ss ? { ...ss, untilLocal: localOf(tz, ss.until) } : null;

  // ── ปุ่ม (ตัดสินที่นี่) ──
  const started = Date.parse(d.startsAt) <= now.getTime();
  const people = d.sold + d.held + d.reserved;
  let mergeTargets: MergeTargetVM[] = [];
  if (cell.state === "BELOW_MIN") {
    const same = await listDepartures(ctx, { unitId: g.unitId, from: d.localDate, to: d.localDate }, { now });
    if (same.ok) {
      const pool = same.items.filter((t) => isMergeTarget({ id: d.id, localDate: d.localDate, sold: d.sold, held: d.held, reserved: d.reserved }, t, { now, today }));
      const meta = pool.length
        ? await g.db.tripProduct.findMany({ where: { tenantId: g.tenantId, unitId: g.unitId, id: { in: [...new Set(pool.map((t) => t.productId))] } }, select: { id: true, title: true, status: true } })
        : [];
      const metaBy = new Map(meta.map((m) => [m.id, m]));
      const live = pool.filter((t) => metaBy.get(t.productId) && metaBy.get(t.productId)?.status !== "ARCHIVED").slice(0, MERGE_TARGET_CAP);
      // ทรัพยากรของรอบนี้ถูกใช้กับรอบอื่นในช่วงเวลาของเป้าหรือไม่ (ข้อมูลประกอบ · ไม่บล็อก) — คิวรีเดียว
      const uses =
        resIds.length && live.length
          ? await g.db.tripResourceUse.findMany({
              where: { tenantId: g.tenantId, unitId: g.unitId, resourceId: { in: resIds }, active: true, departureId: { not: d.id }, startsAt: { lt: new Date(Math.max(...live.map((t) => Date.parse(t.endsAt)))) }, endsAt: { gt: new Date(Math.min(...live.map((t) => Date.parse(t.startsAt)))) } },
              take: 500,
              select: { startsAt: true, endsAt: true },
            })
          : [];
      mergeTargets = live.map((t) => ({
        departureId: t.id,
        productId: t.productId,
        titleTh: i18nTh(metaBy.get(t.productId)?.title),
        timeText: timeTextOf(tz, t.startsAt, t.endsAt),
        capacity: t.capacity,
        used: t.sold + t.held,
        seatsLeft: publicLeftOf(t),
        resourceClash: uses.some((u) => u.startsAt.getTime() < Date.parse(t.endsAt) && u.endsAt.getTime() > Date.parse(t.startsAt)),
      }));
    }
  }
  const actions: PanelActions =
    started || d.status === "CANCELLED"
      ? NO_ACTIONS
      : {
          close: flags.canStatus && ["OPEN", "GUARANTEED", "FULL"].includes(d.status),
          reopen: flags.canStatus && d.status === "CLOSED",
          guarantee: flags.canStatus && d.status === "OPEN" && cell.state !== "BELOW_MIN",
          unguarantee: flags.canStatus && d.status === "GUARANTEED",
          run: flags.canStatus && cell.state === "BELOW_MIN",
          merge: flags.canStatus && cell.state === "BELOW_MIN" && people === 0 && mergeTargets.length > 0,
          cancel: flags.canStatus,
          capacity: flags.canEdit,
          resources: flags.canEdit,
          price: flags.canPrice,
          stopSell: flags.canEdit,
          manifest: false,
          book: false,
        };

  // ── ราคา (ตัวคิดราคาจริง: loadPricingInput ครั้งเดียว + resolveTripPrice ต่อประเภทคน · ไม่คูณ % เอง) ──
  let price: DeparturePanelVM["price"] = null;
  if (flags.canSeePrices) {
    const pax = await g.db.tripPaxType.findMany({ where: { tenantId: g.tenantId, unitId: g.unitId, productId: d.productId, active: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], take: 20, select: { id: true, code: true, label: true } });
    pax.sort((a, b) => seatRank(a.code) - seatRank(b.code));
    let pin: TripPricingInput | null = null;
    if (pax.length) {
      const sellCtx: SellCtx = { tenantId: g.tenantId, unitId: g.unitId, channel: "COUNTER", actor: { kind: "STAFF", userId: g.actorUserId }, now, locale: "th" };
      const line: LineRequest = { productKind: "TRIP", unitId: g.unitId, productId: d.productId, slotId: d.id, pax: pax.map((x) => ({ paxTypeId: x.id, qty: 1 })) };
      const li = await loadPricingInput(sellCtx, line);
      // ราคาตั้งของรอบ: ตัดกฎโปร/โค้ด (กรองข้อมูล ไม่คิดเลขเอง) — แผงแสดงราคาก่อนส่วนลด แบบ T1.1
      if (li.ok) pin = { ...li.value, rules: [], promoCode: null, promoProviders: [] };
    }
    const rows: PriceRowVM[] = pax.map((x) => {
      let it: PricedItem | undefined;
      if (pin) {
        const r = resolveTripPrice({ ...pin, pax: [{ paxTypeId: x.id, qty: 1 }] });
        if (r.ok) it = r.value.items.find((i) => i.kind === "SEAT" && i.paxTypeCode === x.code);
      }
      const src = it?.priceSource;
      const own = priced.find((r) => r.paxTypeId === x.id) ?? priced.find((r) => r.paxTypeId === null) ?? null;
      return {
        paxTypeId: x.id,
        code: x.code,
        labelTh: i18nTh(x.label) || x.code,
        satang: it && it.qty > 0 ? Math.round(it.amountSatang / it.qty) : null,
        source: src === "RETAIL" || src === "SEASON" || src === "DEPARTURE" ? src : "MISSING",
        departurePriceId: own?.id ?? null,
      };
    });
    price = { canEdit: flags.canPrice, currency: prod.currency, productId: prod.id, rows };
  }

  // ── คำเตือน: ความจุเกินที่นั่งรวมของเรือที่มอบให้ (หนี้ T0.3 §12 ข้อ 10 · ไม่บล็อก) ──
  const boats = resources.filter((r) => r.kind === "BOAT" && typeof r.seats === "number");
  const boatSeats = boats.reduce((s, r) => s + (r.seats ?? 0), 0);
  const warnings: DeparturePanelVM["warnings"] = boats.length && d.capacity > boatSeats ? [{ code: "CAPACITY_OVER_SEATS", resourceName: boats.map((b) => b.name).join(" · "), seats: boatSeats }] : [];

  return {
    ok: true,
    vm: {
      unit: { id: g.unitId, slug: g.unitSlug, tz, today },
      departure: {
        ...cell,
        productTitle: i18nTh(prod.title),
        productType: prod.productType,
        optionName: opt ? i18nTh(opt.name) || null : null,
        resources,
        resourceSummary,
        cutoffGroups,
        stopSellInfo,
        cancelledAt: extras.cancelledAt.get(d.id) ?? null,
        version: d.version,
      },
      counts: { capacity: d.capacity, sold: d.sold, held: d.held, reserved: d.reserved, used: d.sold + d.held, seatsLeft: publicLeftOf(d), waitlistWaiting: wlOf("WAITING"), waitlistOffered: wlOf("OFFERED") },
      bookings: null,
      money: null,
      actions,
      cancelBlocked: people > 0,
      mergeTargets,
      price,
      warnings,
    },
  };
}

// ═══════════════ 3. กฎซ้ำ + ฟอร์มเพิ่มรอบ ═══════════════
const SCHED_IN = z.strictObject({ unitId: ID });
export type ScheduleItemVM = {
  scheduleId: string;
  productId: string;
  productTitle: string;
  optionId: string | null;
  optionName: string | null;
  ruleKind: "DAILY" | "WEEKLY" | "DATES" | "INVALID";
  weekdays: number[] | null;
  dateCount: number | null;
  departTimeMin: number;
  timeText: string;
  capacity: number;
  minPax: number | null;
  resourceIds: string[];
  resourceNames: string[];
  dateFrom: string;
  dateTo: string | null;
  paused: boolean;
  generatedUntil: string | null;
};
export type DepartureSchedulesVM = {
  canEdit: boolean;
  items: ScheduleItemVM[];
  itemsTruncated: boolean;
  products: { id: string; titleTh: string; productType: string; options: { id: string; nameTh: string; active: boolean; durationMin: number | null; nights: number | null; capacity: number | null; minPax: number | null; departTimeMin: number | null; resourceIds: string[] }[] }[];
  resources: { id: string; kind: string; name: string; seats: number | null; active: boolean }[];
};

export async function loadDepartureSchedulesVM(ctx: TripsScreenCtx, input: unknown, opts?: Opts): Promise<{ ok: true; vm: DepartureSchedulesVM } | Fail> {
  const p = parse(SCHED_IN, input);
  if (isFail(p)) return p;
  const g = await gateDepartures(ctx, p.unitId);
  if (isFail(g)) return g;
  void opts; // ไม่มีค่าที่ขึ้นกับเวลา (ลายเซ็นเดียวกับตัวโหลดอื่น)
  const [ls, lr, prods] = await Promise.all([
    listSchedules(ctx, { unitId: g.unitId }),
    listResources(ctx, { unitId: g.unitId }),
    g.db.tripProduct.findMany({ where: { tenantId: g.tenantId, unitId: g.unitId, status: { not: "ARCHIVED" } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: TRIPS_CALENDAR_PRODUCT_CAP, select: { id: true, title: true, productType: true } }),
  ]);
  if (!ls.ok) return passFail(ls);
  if (!lr.ok) return passFail(lr);
  const all = ls.items;
  const sched = all.slice(0, SCHEDULE_CAP);
  const prodIds = [...new Set([...prods.map((x) => x.id), ...sched.map((s) => s.productId)])];
  const [options, gen, extraProds] = await Promise.all([
    prodIds.length
      ? g.db.tripOption.findMany({ where: { tenantId: g.tenantId, unitId: g.unitId, productId: { in: prodIds } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }], take: 500, select: { id: true, productId: true, name: true, active: true, durationMin: true, nights: true } })
      : Promise.resolve([]),
    sched.length
      ? g.db.tripDeparture.groupBy({ by: ["scheduleId"], where: { tenantId: g.tenantId, unitId: g.unitId, scheduleId: { in: sched.map((s) => s.id) } }, _max: { localDate: true } })
      : Promise.resolve([]),
    g.db.tripProduct.findMany({ where: { tenantId: g.tenantId, unitId: g.unitId, id: { in: sched.map((s) => s.productId).filter((id) => !prods.some((x) => x.id === id)) } }, take: SCHEDULE_CAP, select: { id: true, title: true, productType: true } }),
  ]);
  const titleBy = new Map([...prods, ...extraProds].map((x) => [x.id, i18nTh(x.title)]));
  const optBy = new Map(options.map((o) => [o.id, o]));
  const resBy = new Map(lr.items.map((r) => [r.id, r]));
  const genBy = new Map(gen.map((x) => [x.scheduleId, x._max.localDate ? ymdOf(x._max.localDate) : null]));
  const items: ScheduleItemVM[] = sched.map((s) => {
    const rule = tripScheduleRuleSchema.safeParse(s.rule);
    const o = s.optionId ? optBy.get(s.optionId) : undefined;
    return {
      scheduleId: s.id,
      productId: s.productId,
      productTitle: titleBy.get(s.productId) ?? "",
      optionId: s.optionId,
      optionName: o ? i18nTh(o.name) || null : null,
      ruleKind: rule.success ? rule.data.kind : "INVALID",
      weekdays: rule.success && rule.data.kind === "WEEKLY" ? [...rule.data.weekdays] : null,
      dateCount: rule.success && rule.data.kind === "DATES" ? rule.data.dates.length : null,
      departTimeMin: s.departTimeMin,
      timeText: hhmm(s.departTimeMin),
      capacity: s.capacity,
      minPax: s.minPax,
      resourceIds: s.resourceIds,
      resourceNames: s.resourceIds.map((id) => resBy.get(id)?.name ?? "").filter(Boolean),
      dateFrom: s.dateFrom,
      dateTo: s.dateTo,
      paused: s.paused,
      generatedUntil: genBy.get(s.id) ?? null,
    };
  });
  // ค่าเริ่มของฟอร์มเพิ่มรอบ = กฎล่าสุดที่ไม่พักของตัวเลือกนั้น (ความจุ · ขั้นต่ำ · เวลา · ทรัพยากร)
  const latestFor = (productId: string, optionId: string) => sched.filter((s) => s.productId === productId && !s.paused && (s.optionId === optionId || s.optionId === null)).sort((a, b) => b.dateFrom.localeCompare(a.dateFrom))[0];
  const products = prods.map((x) => ({
    id: x.id,
    titleTh: i18nTh(x.title),
    productType: x.productType,
    options: options
      .filter((o) => o.productId === x.id)
      .map((o) => {
        const s = latestFor(x.id, o.id);
        return { id: o.id, nameTh: i18nTh(o.name), active: o.active, durationMin: o.durationMin, nights: o.nights, capacity: s?.capacity ?? null, minPax: s?.minPax ?? null, departTimeMin: s?.departTimeMin ?? null, resourceIds: s?.resourceIds ?? [] };
      }),
  }));
  return {
    ok: true,
    vm: {
      canEdit: g.can("trips.departure.edit"),
      items,
      itemsTruncated: all.length > sched.length,
      products,
      resources: lr.items.map((r) => ({ id: r.id, kind: r.kind, name: r.name, seats: r.seats, active: r.active })),
    },
  };
}

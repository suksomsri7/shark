// ─────────────────────────────────────────────────────────────
// trips/departures-core.ts — ชนิด · ค่าคงที่ · ฟังก์ชันบริสุทธิ์ของรอบ (กฎซ้ำ · เขตเวลา · ปิดรับ · ขั้นต่ำ · หยุดขาย) · RUN TRIPS T0.3
// ใบสั่ง ledger/trips-briefs/T0.3.md §2 §3.4 §4 ข้อ 1
//
// 🔴 บริสุทธิ์: import ได้เฉพาะ `import type` + ./json-schemas (ข้อสอบ S-5) · ไม่มี I/O · ไม่อ่านนาฬิกาเครื่อง
// 🔴 ห้ามตัวอ่านเวลาตามเครื่อง (ข้อสอบ S-6) — วันในสัปดาห์/วันที่ คิดบน UTC ล้วน · เขตเวลาอื่นใช้ Intl (รองรับ DST)
// 🔴 ไม่มีตัวเลขธุรกิจ (ปิดรับ/ขั้นต่ำ/ระยะล่วงหน้า) — มาจากค่าตั้ง T6 T7 T8 ที่ผู้เรียกส่งเข้า
// ─────────────────────────────────────────────────────────────
import type { SellChannel } from "@/lib/core/sellable";
import { isYmd, tripDepartureStopSellSchema } from "./json-schemas";
import type { TripScheduleExceptions, TripScheduleRule } from "./json-schemas";

// ───────────────────────── สถานะรอบ ─────────────────────────
export const DEPARTURE_STATUSES = ["OPEN", "GUARANTEED", "FULL", "CLOSED", "CANCELLED"] as const;
export type DepartureStatus = (typeof DEPARTURE_STATUSES)[number];
export type DepartureActor = "STAFF" | "SYSTEM";

/** ผังสถานะรอบ (ใบสั่ง §4 ข้อ 1 ตรงตัว) — ไม่อยู่ในตาราง = ไม่ได้ (CANCELLED จบ · CLOSED → GUARANTEED ไม่มี) */
export const DEPARTURE_TRANSITIONS: readonly { from: DepartureStatus; to: DepartureStatus; actors: readonly DepartureActor[] }[] = [
  { from: "OPEN", to: "GUARANTEED", actors: ["STAFF", "SYSTEM"] },
  { from: "GUARANTEED", to: "OPEN", actors: ["STAFF"] },
  { from: "OPEN", to: "CLOSED", actors: ["STAFF"] },
  { from: "GUARANTEED", to: "CLOSED", actors: ["STAFF"] },
  { from: "FULL", to: "CLOSED", actors: ["STAFF"] },
  { from: "CLOSED", to: "OPEN", actors: ["STAFF"] },
  { from: "OPEN", to: "FULL", actors: ["SYSTEM"] },
  { from: "GUARANTEED", to: "FULL", actors: ["SYSTEM"] },
  { from: "FULL", to: "OPEN", actors: ["SYSTEM"] },
  { from: "FULL", to: "GUARANTEED", actors: ["SYSTEM"] },
  { from: "OPEN", to: "CANCELLED", actors: ["STAFF"] },
  { from: "GUARANTEED", to: "CANCELLED", actors: ["STAFF"] },
  { from: "FULL", to: "CANCELLED", actors: ["STAFF"] },
  { from: "CLOSED", to: "CANCELLED", actors: ["STAFF"] },
];

/** การเปลี่ยนที่ต้องเกิดก่อนรอบเริ่ม (`startsAt > now`) — เปิดคืน/ยืนยันรอบที่เริ่มแล้ว = PAST_DEPARTURE */
export const TRANSITIONS_BEFORE_START: readonly (readonly [DepartureStatus, DepartureStatus])[] = [
  ["OPEN", "GUARANTEED"],
  ["GUARANTEED", "OPEN"],
  ["CLOSED", "OPEN"],
];

export function isDepartureStatus(s: unknown): s is DepartureStatus {
  return typeof s === "string" && (DEPARTURE_STATUSES as readonly string[]).includes(s);
}

export function canTransitionDeparture(from: string, to: string, actor: string): boolean {
  return DEPARTURE_TRANSITIONS.some((t) => t.from === from && t.to === to && (t.actors as readonly string[]).includes(actor));
}

// ───────────────────────── รหัสพลาด ─────────────────────────
export const TRIP_DEPARTURE_ERROR_CODES = [
  "INVALID_INPUT",
  "NOT_FOUND",
  "FORBIDDEN",
  "UNIT_NOT_TRIPS",
  "PRODUCT_ARCHIVED",
  "NO_DURATION",
  "SCHEDULE_PAUSED",
  "HORIZON_OFF",
  "DUPLICATE_DEPARTURE",
  "PAST_DEPARTURE",
  "BAD_STATE",
  "FORBIDDEN_TRANSITION",
  "HAS_BOOKINGS",
  "CAPACITY_BELOW_USED",
  "CONFIRM_REQUIRED",
  "RESOURCE_CLASH",
  "RESOURCE_INACTIVE",
  "RESOURCE_IN_USE",
  "AGENT_STOP_SELL_NOT_SUPPORTED",
  "BUSY",
  "OPTION_INACTIVE", // r2 ▸ ตัวเลือกปิดใช้ (จาก assertProductSellableInTx ของ T0.2) ◂
] as const;
export type TripDepartureErrorCode = (typeof TRIP_DEPARTURE_ERROR_CODES)[number];

/** รอบที่ชนทรัพยากร (ร้านเดียวกันเท่านั้น) */
export type DepartureConflict = { departureId: string; productId: string; localDate: string; startsAt: string; endsAt: string; resourceId: string };

export type DepartureFail = {
  ok: false;
  code: TripDepartureErrorCode;
  message: string;
  used?: number;
  conflict?: DepartureConflict;
  departureIds?: string[];
  scheduleIds?: string[];
  resourceIds?: string[];
};

/** ข้อความไทยมาตรฐานต่อรหัส (ผู้เรียกแทนได้เมื่อมีรายละเอียดกว่า) */
export const DEPARTURE_MESSAGES: Record<TripDepartureErrorCode, string> = {
  INVALID_INPUT: "ข้อมูลไม่ถูกต้อง",
  NOT_FOUND: "ไม่พบรายการ",
  FORBIDDEN: "ไม่มีสิทธิ์ทำรายการนี้",
  UNIT_NOT_TRIPS: "หน่วยนี้ไม่ใช่หน่วยทัวร์",
  PRODUCT_ARCHIVED: "สินค้านี้ถูกเก็บแล้ว สร้างรอบไม่ได้",
  NO_DURATION: "ตัวเลือกนี้ไม่มีระยะเวลา กรุณาระบุระยะเวลาของรอบ",
  SCHEDULE_PAUSED: "กฎนี้พักอยู่ ไม่สร้างรอบ",
  HORIZON_OFF: "สินค้านี้ตั้งให้สร้างรอบทีละทริป (ไม่สร้างล่วงหน้าจากกฎ)",
  DUPLICATE_DEPARTURE: "มีรอบของสินค้าและตัวเลือกนี้ในเวลานี้อยู่แล้ว",
  PAST_DEPARTURE: "รอบนี้เริ่มไปแล้ว",
  BAD_STATE: "สถานะปัจจุบันทำรายการนี้ไม่ได้",
  FORBIDDEN_TRANSITION: "เปลี่ยนสถานะรอบแบบนี้ไม่ได้",
  HAS_BOOKINGS: "รอบนี้มีคนจองหรือถือที่อยู่ ยกเลิกรอบไม่ได้",
  CAPACITY_BELOW_USED: "ความจุต้องไม่น้อยกว่าที่นั่งที่ขาย/ถือไว้แล้ว",
  CONFIRM_REQUIRED: "รอบนี้มีคนจองแล้ว ต้องยืนยันก่อนเปลี่ยนเวลา",
  RESOURCE_CLASH: "ทรัพยากรนี้ถูกใช้กับรอบอื่นในช่วงเวลาเดียวกัน",
  RESOURCE_INACTIVE: "ทรัพยากรนี้ปิดใช้อยู่",
  RESOURCE_IN_USE: "ทรัพยากรนี้ยังถูกใช้กับรอบที่ยังไม่ถึง",
  AGENT_STOP_SELL_NOT_SUPPORTED: "หยุดขายรายเอเจนซี่ยังไม่เปิดใช้",
  BUSY: "ระบบกำลังทำรายการเดียวกันอยู่ ลองใหม่อีกครั้ง",
  OPTION_INACTIVE: "ตัวเลือกนี้ปิดใช้อยู่ สร้างรอบไม่ได้",
};

export function failOf(code: TripDepartureErrorCode, message?: string, extra?: Omit<DepartureFail, "ok" | "code" | "message">): DepartureFail {
  return { ok: false, code, message: message ?? DEPARTURE_MESSAGES[code], ...(extra ?? {}) };
}

// ───────────────────────── ช่องทางขาย ─────────────────────────
/** ทุกช่องทางขาย (อ่านจากสคีมาหยุดขายของ T0.1 — แหล่งเดียวกับ `SELL_CHANNELS` · ไฟล์นี้ import ค่าจาก core ไม่ได้) */
export const DEPARTURE_SELL_CHANNELS: readonly SellChannel[] = tripDepartureStopSellSchema.unwrap().shape.channels.element.options;

// ───────────────────────── เวลาและเขตเวลา ─────────────────────────
export const DEFAULT_TIMEZONE = "Asia/Bangkok";
const MS_PER_MIN = 60_000;
export const MIN_PER_DAY = 1440;
const DAY_MS = MIN_PER_DAY * MS_PER_MIN;
const BKK_OFFSET_MIN = 7 * 60;

const FORMATTERS = new Map<string, Intl.DateTimeFormat | null>();
function formatterOf(tz: string): Intl.DateTimeFormat | null {
  if (FORMATTERS.has(tz)) return FORMATTERS.get(tz) ?? null;
  let f: Intl.DateTimeFormat | null = null;
  try {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  } catch {
    f = null;
  }
  FORMATTERS.set(tz, f);
  return f;
}

/** เขตเวลาที่ใช้จริง — ว่าง/ไม่ใช่สตริง/Intl ไม่รู้จัก ⇒ Asia/Bangkok */
export function normalizeTimezone(tz: unknown): string {
  if (typeof tz !== "string" || !tz.trim()) return DEFAULT_TIMEZONE;
  const t = tz.trim();
  if (t === DEFAULT_TIMEZONE) return t;
  return formatterOf(t) ? t : DEFAULT_TIMEZONE;
}

function ymdParts(ymd: string): [number, number, number] {
  const [y, m, d] = ymd.split("-").map(Number);
  return [y, m, d];
}
function ymdOfUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
/** "YYYY-MM-DD" ⇒ ms ของเที่ยงคืน UTC */
function utcMidnight(ymd: string): number {
  const [y, m, d] = ymdParts(ymd);
  return Date.UTC(y, m - 1, d);
}

/** วันในสัปดาห์ของ "YYYY-MM-DD" (0 = อาทิตย์) — UTC ล้วน ไม่ขึ้นกับเขตเวลาเครื่อง */
export function weekdayOfYmd(ymd: string): number {
  return new Date(utcMidnight(ymd)).getUTCDay();
}

export function addDaysYmd(ymd: string, n: number): string {
  return ymdOfUtcMs(utcMidnight(ymd) + n * DAY_MS);
}

/** ค่า @db.Date (เที่ยงคืน UTC) หรือสตริง ⇒ "YYYY-MM-DD" */
export function ymdOf(d: Date | string): string {
  return typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);
}

/** "เวลาผนัง" ของ instant ในเขต tz แทนเป็น ms แบบ UTC (ไม่ใช่ Bangkok) */
function wallMsOf(f: Intl.DateTimeFormat, ms: number): number {
  const parts = f.formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((x) => x.type === type)?.value ?? "0");
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % (MIN_PER_DAY / 60), get("minute"), get("second"));
}

/** วันที่และนาทีของวัน ณ เวลาร้าน */
export function utcToLocal(tz: unknown, d: Date): { ymd: string; minutes: number } {
  const zone = normalizeTimezone(tz);
  const f = zone === DEFAULT_TIMEZONE ? null : formatterOf(zone);
  const wall = f ? wallMsOf(f, d.getTime()) : d.getTime() + BKK_OFFSET_MIN * MS_PER_MIN;
  const ymd = ymdOfUtcMs(wall);
  return { ymd, minutes: Math.floor((wall - utcMidnight(ymd)) / MS_PER_MIN) };
}

/**
 * เวลาร้าน (วัน + นาทีจากเที่ยงคืน) ⇒ instant UTC
 * Bangkok = ลบ 7 ชม. · เขตอื่น = Intl · เวลาที่ไม่มีจริง (DST กระโดด) ⇒ เลื่อนไปข้างหน้าเท่าช่วงกระโดด · เวลาซ้ำ ⇒ ตัวแรก (แบบ Temporal "compatible")
 */
export function localToUtc(tz: unknown, ymd: string, minutes: number): Date {
  const zone = normalizeTimezone(tz);
  const wall = utcMidnight(ymd) + minutes * MS_PER_MIN;
  const f = zone === DEFAULT_TIMEZONE ? null : formatterOf(zone);
  if (!f) return new Date(wall - BKK_OFFSET_MIN * MS_PER_MIN);
  const offBefore = wallMsOf(f, wall - DAY_MS) - (wall - DAY_MS);
  const offAfter = wallMsOf(f, wall + DAY_MS) - (wall + DAY_MS);
  const cands = [...new Set([wall - offBefore, wall - offAfter])].filter((t) => wallMsOf(f, t) === wall).sort((a, b) => a - b);
  if (cands.length) return new Date(cands[0]);
  return new Date(wall - offBefore); // ช่วงกระโดด: ใช้ออฟเซ็ตก่อนกระโดด ⇒ เลื่อนไปข้างหน้า
}

// ───────────────────────── กฎซ้ำ ⇒ วัน ─────────────────────────
export type ScheduleShape = {
  rule: TripScheduleRule;
  exceptions: TripScheduleExceptions;
  dateFrom: string;
  dateTo: string | null;
  departTimeMin: number;
  capacity: number;
  minPax: number | null;
};
export type ExpandedDay = { localDate: string; departTimeMin: number; capacity: number; minPax: number | null | undefined };

/**
 * วันของกฎในหน้าต่าง [fromYmd, toYmdExclusive) ∩ [dateFrom, dateTo] − SKIP · OVERRIDE ทับคีย์ที่ให้มา (เรียงวัน)
 * minPax: OVERRIDE ที่มีคีย์ ⇒ ค่านั้น (null = ไม่มีขั้นต่ำ) · ไม่งั้นค่าของกฎ · กฎ null ⇒ undefined (ผู้เรียกใช้ค่าตั้ง T7)
 */
export function expandSchedule(s: ScheduleShape, w: { fromYmd: string; toYmdExclusive: string }): ExpandedDay[] {
  const from = s.dateFrom > w.fromYmd ? s.dateFrom : w.fromYmd;
  const toEx = s.dateTo && addDaysYmd(s.dateTo, 1) < w.toYmdExclusive ? addDaysYmd(s.dateTo, 1) : w.toYmdExclusive;
  if (from >= toEx) return [];
  const byDate = new Map(s.exceptions.map((e) => [e.date, e]));
  let days: string[] = [];
  if (s.rule.kind === "DATES") {
    days = [...new Set(s.rule.dates)].filter((d) => isYmd(d) && d >= from && d < toEx).sort();
  } else {
    const weekdays = s.rule.kind === "WEEKLY" ? new Set(s.rule.weekdays) : null;
    for (let d = from; d < toEx; d = addDaysYmd(d, 1)) if (!weekdays || weekdays.has(weekdayOfYmd(d))) days.push(d);
  }
  const out: ExpandedDay[] = [];
  for (const d of days) {
    const ex = byDate.get(d);
    if (ex?.action === "SKIP") continue;
    const base: ExpandedDay = { localDate: d, departTimeMin: s.departTimeMin, capacity: s.capacity, minPax: s.minPax ?? undefined };
    if (ex?.action === "OVERRIDE") {
      if (ex.departTimeMin !== undefined) base.departTimeMin = ex.departTimeMin;
      if (ex.capacity !== undefined) base.capacity = ex.capacity;
      if ("minPax" in ex && ex.minPax !== undefined) base.minPax = ex.minPax;
    }
    out.push(base);
  }
  return out;
}

// ───────────────────────── ปิดรับ (T6) · เวลาตัดสิน (T7) ─────────────────────────
export type CutoffSpec = { daysBefore: number; atMin: number };
export type T6Value = CutoffSpec & { perChannel?: Partial<Record<SellChannel, CutoffSpec>> };
export type T7Value = { minPax: number | null; decideDaysBefore: number; decideAtMin: number };
export type DepartureTimeRef = { localDate: string; startsAt: Date };

function beforeStart(dep: DepartureTimeRef, tz: unknown, daysBefore: number, atMin: number): Date {
  const t = localToUtc(tz, addDaysYmd(dep.localDate, -daysBefore), atMin);
  return t.getTime() < dep.startsAt.getTime() ? t : new Date(dep.startsAt.getTime());
}

/** เวลาปิดรับของช่องทาง = min(วัน localDate − daysBefore เวลา atMin ของร้าน, startsAt) · perChannel ทับ */
export function cutoffFor(dep: DepartureTimeRef, t6: T6Value, channel: SellChannel, tz: unknown): Date {
  const spec = t6.perChannel?.[channel] ?? { daysBefore: t6.daysBefore, atMin: t6.atMin };
  return beforeStart(dep, tz, spec.daysBefore, spec.atMin);
}

/** ปิดรับทุกช่องทาง (ISO) */
export function cutoffsFor(dep: DepartureTimeRef, t6: T6Value, tz: unknown): Record<SellChannel, string> {
  const out = {} as Record<SellChannel, string>;
  for (const c of DEPARTURE_SELL_CHANNELS) out[c] = cutoffFor(dep, t6, c, tz).toISOString();
  return out;
}

/** คอลัมน์ cutoffAt = ช่องทางที่ปิดช้าสุด (SQL ถือที่เช็กคอลัมน์เดียว ต้องไม่บล็อกช่องทางที่ยังเปิด) */
export function cutoffAtColumn(dep: DepartureTimeRef, t6: T6Value, tz: unknown): Date {
  let max = -Infinity;
  for (const c of DEPARTURE_SELL_CHANNELS) max = Math.max(max, cutoffFor(dep, t6, c, tz).getTime());
  return new Date(max);
}

export function decisionAtFor(dep: DepartureTimeRef, t7: { decideDaysBefore: number; decideAtMin: number }, tz: unknown): Date {
  return beforeStart(dep, tz, t7.decideDaysBefore, t7.decideAtMin);
}

/** "ต้องตัดสินใจ" = OPEN ∧ minPax ≠ null ∧ sold < minPax ∧ decisionAt ≤ now < startsAt (คำนวณตอนอ่าน) */
export function needsDecision(d: { status: string; minPax: number | null; sold: number; startsAt: Date }, decisionAt: Date | null, now: Date): boolean {
  if (d.status !== "OPEN" || d.minPax === null || d.minPax === undefined || decisionAt === null) return false;
  if (d.sold >= d.minPax) return false;
  return now.getTime() >= decisionAt.getTime() && now.getTime() < d.startsAt.getTime();
}

// ───────────────────────── หยุดขาย · เหตุที่ขายไม่ได้ ─────────────────────────
type StopSellLike = { channels?: readonly string[]; agentAccountIds?: readonly string[]; reason?: string; until?: string } | null | undefined;

function asStopSell(v: unknown): StopSellLike {
  if (v === null || v === undefined || typeof v !== "object" || Array.isArray(v)) return null;
  return v as StopSellLike;
}

export function stopSellBlocks(stopSell: unknown, channel: string, agentAccountId: string | null, now: Date): boolean {
  const s = asStopSell(stopSell);
  if (!s) return false;
  if (typeof s.until === "string" && Date.parse(s.until) <= now.getTime()) return false;
  const channels = Array.isArray(s.channels) ? s.channels : [];
  if (channels.length > 0 && !channels.includes(channel)) return false;
  const agents = Array.isArray(s.agentAccountIds) ? s.agentAccountIds : [];
  if (agents.length > 0) return agentAccountId !== null && agents.includes(agentAccountId);
  return true;
}

export type SaleBlockReason = "STATUS" | "STARTED" | "CUTOFF" | "STOP_SELL";

/** เหตุที่ขายช่องทางนี้ไม่ได้ (ลำดับ STATUS > STARTED > CUTOFF > STOP_SELL) · null = ขายได้ — ให้ T0.4 ใช้ก่อน SQL */
export function saleBlockReason(
  d: { status: string; startsAt: Date; cutoffs: Partial<Record<string, string | Date>> | null | undefined; stopSell: unknown },
  channel: string,
  agentAccountId: string | null,
  now: Date,
): SaleBlockReason | null {
  if (d.status !== "OPEN" && d.status !== "GUARANTEED") return "STATUS";
  if (now.getTime() >= d.startsAt.getTime()) return "STARTED";
  const c = d.cutoffs?.[channel];
  if (c !== undefined && c !== null && now.getTime() >= new Date(c).getTime()) return "CUTOFF";
  if (stopSellBlocks(d.stopSell, channel, agentAccountId, now)) return "STOP_SELL";
  return null;
}

/** "HH:MM" จากนาทีของวัน (ข้อความไทย) */
export function hhmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

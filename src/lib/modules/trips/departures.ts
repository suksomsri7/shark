// ─────────────────────────────────────────────────────────────
// trips/departures.ts — กฎซ้ำ · รอบ · สถานะ · ความจุ · ขั้นต่ำ · ปิดรับ · หยุดขาย · RUN TRIPS T0.3
// ใบสั่ง ledger/trips-briefs/T0.3.md §2 §3.1 §3.2 §4 §6 §7 (มติ §12 ชนะ) · รอบแก้ r2 (REVIEW + HUNT + มติผู้คุม A–I)
//
// 🔴 tenantDb เท่านั้น (ไม่มี prisma ดิบ · F5 +0) · SQL ดิบใส่ "tenantId" + "unitId" เองทุกคำสั่ง · ตรวจจำนวนแถว
// 🔴 ตัวนับ sold/held/reserved อ่านอย่างเดียว · ใบนี้ไม่ตั้ง FULL · ความจุ = คำสั่งเดียวที่มีเงื่อนไขในตัว (CC §D.1 ข้อ 8)
// 🔴 ลำดับล็อก: สินค้า (FOR SHARE · assertProductSellableInTx ของ T0.2) → กฎ (advisory + FOR UPDATE) → แถวรอบ (FOR UPDATE)
//    → ทรัพยากร (FOR SHARE เรียง id) → แถวใช้ทรัพยากร (เรียง id) — CC §D.5 · หลังเรียกด่านสินค้าห้าม UPDATE/FOR UPDATE แถวสินค้าใน tx เดียวกัน
// 🔴 ไม่ขอ connection ที่สองระหว่างถือ tx (ค่าตั้งอ่านก่อนเปิด tx — API ค่าตั้งไม่มีรุ่นที่รับ tx)
// 🔴 เก็บ UTC · localDate = วันของร้าน ตั้งครั้งเดียว · ตัวเลขธุรกิจจากค่าตั้ง T6 T7 T8 หรือ input
// 🔴 ไม่ลบแถว Trip* · ไม่ส่ง object ของผู้ใช้เข้า update({data}) ตรง ๆ (zod เลือกฟิลด์ · TRIPS-RUN §3)
// ─────────────────────────────────────────────────────────────
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { tenantDb } from "@/lib/core/db";
import { emitOutbox } from "@/lib/core/outbox";
import { SELL_CHANNELS } from "@/lib/core/sellable";
import { getDef, resolveSettings, resolveSettingsMany } from "@/lib/core/settings";
import { isYmd, tripDepartureStopSellSchema, tripScheduleExceptionsSchema, tripScheduleRuleSchema } from "./json-schemas";
import {
  DEPARTURE_STATUSES,
  MIN_PER_DAY,
  TRANSITIONS_BEFORE_START,
  addDaysYmd,
  canTransitionDeparture,
  cutoffAtColumn,
  cutoffsFor,
  decisionAtFor,
  expandSchedule,
  failOf,
  localToUtc,
  needsDecision,
  utcToLocal,
  ymdOf,
  type DepartureFail,
  type ScheduleShape,
  type T6Value,
  type T7Value,
} from "./departures-core";
import { TripProductNotSellableError, assertProductSellableInTx } from "./products";
import {
  ID,
  INT4_MAX,
  abortTx,
  assignUseTx,
  auditTx,
  checkResources,
  gateUnit,
  inTx,
  isFail,
  lockDeparture,
  lockResourcesShared,
  moveUsesTx,
  nowOf,
  pgCodeOf,
  releaseUsesTx,
  sortedIds,
  underSavepoint,
  unitDb,
  type Gate,
  type TripCtx,
  type TripOpts,
  type Tx,
} from "./resources";

// ═══════════════════════ ค่าตั้ง ═══════════════════════
const T6_KEY = "trips.sell.cutoff";
const T7_KEY = "trips.sell.minToDepart";
const T8_KEY = "trips.sell.departureHorizonDays";
const SPEC = z.object({ daysBefore: z.number().int().min(0), atMin: z.number().int().min(0) });
const T6S = SPEC.extend({ perChannel: z.partialRecord(z.enum(SELL_CHANNELS), SPEC).optional() });
const T7S = z.object({ minPax: z.number().int().min(1).nullable(), decideDaysBefore: z.number().int().min(0), decideAtMin: z.number().int().min(0) });
const T8S = z.number().int().min(1).nullable();

/** ค่าตั้งของร้านผิดรูป (แถวเสีย) — งานตามเวลาจับเป็นรหัส SETTINGS_INVALID ต่อร้าน ไม่ล้มทั้งงาน */
export class TripSettingsInvalidError extends Error {
  readonly code = "SETTINGS_INVALID";
  constructor(key: string) {
    super(`ค่าตั้ง ${key} ผิดรูป`);
    this.name = "TripSettingsInvalidError";
  }
}
function settingOf<T>(schema: z.ZodType<T>, key: string, v: unknown): T {
  const p = schema.safeParse(v);
  if (!p.success) throw new TripSettingsInvalidError(key);
  return p.data;
}
type Refs = { unitId: string; productId?: string; departureId?: string };
type Policy = { t6: T6Value; t7: T7Value; t8: number | null };
type DepPolicy = { t6: T6Value; t7: T7Value };
async function policyAt(tenantId: string, refs: Refs): Promise<Policy> {
  const r = await resolveSettings({ tenantId }, [T6_KEY, T7_KEY, T8_KEY], refs);
  return { t6: settingOf(T6S, T6_KEY, r[T6_KEY]?.value), t7: settingOf(T7S, T7_KEY, r[T7_KEY]?.value), t8: settingOf(T8S, T8_KEY, r[T8_KEY]?.value) };
}

/** เพดานระยะสร้างล่วงหน้า (วัน) = ค่าสูงสุดที่สคีมาของ T8 ยอม (ทะเบียนค่าตั้ง) — ใช้เป็นกรอบความสมเหตุสมผลของวันที่/ระยะเวลา/จำนวนวันในกฎ */
function horizonMaxDays(): number {
  const s = getDef(T8_KEY)?.schema;
  const inner = s instanceof z.ZodNullable ? s.unwrap() : s;
  const max = inner instanceof z.ZodNumber ? inner.maxValue : null;
  if (typeof max !== "number" || !Number.isFinite(max) || max < 1) throw new Error(`ทะเบียนค่าตั้ง ${T8_KEY} ไม่มีค่าสูงสุด`);
  return max;
}
const HORIZON_MAX_DAYS = horizonMaxDays();

/**
 * ค่าตั้ง T6/T7 ของหลายรอบ — ไม่สร้าง ref ต่อรอบ (เกินเพดานพารามิเตอร์ของฐานที่ ~20,000 รอบ · HUNT B2):
 * แก้ต่อสินค้า (ทีละชุด) + เฉพาะรอบที่มีแถวค่าตั้งชั้น DEPARTURE จริง (ทีละชุด)
 */
const SETTINGS_BATCH = 200;
const ID_BATCH = 1000;
function chunksOf<T>(a: readonly T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}
async function productPolicies(g: Gate, productIds: readonly string[]): Promise<Map<string, DepPolicy>> {
  const out = new Map<string, DepPolicy>();
  for (const part of chunksOf([...new Set(productIds)], SETTINGS_BATCH)) {
    const rs = await resolveSettingsMany({ tenantId: g.tenantId }, [T6_KEY, T7_KEY], part.map((productId) => ({ unitId: g.unitId, productId })));
    part.forEach((p, i) => out.set(p, { t6: settingOf(T6S, T6_KEY, rs[i][T6_KEY]?.value), t7: settingOf(T7S, T7_KEY, rs[i][T7_KEY]?.value) }));
  }
  return out;
}
/** id รอบที่มีแถวค่าตั้งชั้น DEPARTURE (T6/T7) จริง — ดัชนี SettingValue(tenantId, scope, scopeId) */
async function departureIdsWithOverrides(g: Gate, ids: readonly string[], keys: readonly string[]): Promise<Set<string>> {
  const out = new Set<string>();
  const db = tenantDb({ tenantId: g.tenantId });
  for (const part of chunksOf(ids, ID_BATCH)) {
    const rows = await db.settingValue.findMany({ where: { key: { in: [...keys] }, scope: "DEPARTURE", scopeId: { in: part } }, select: { scopeId: true }, distinct: ["scopeId"] });
    for (const r of rows) out.add(r.scopeId);
  }
  return out;
}
async function departurePolicies(g: Gate, rows: readonly { id: string; productId: string }[]): Promise<DepPolicy[]> {
  if (!rows.length) return [];
  const byProduct = await productPolicies(g, rows.map((r) => r.productId));
  const over = await departureIdsWithOverrides(g, rows.map((r) => r.id), [T6_KEY, T7_KEY]);
  const overRows = rows.filter((r) => over.has(r.id));
  const byDep = new Map<string, DepPolicy>();
  for (const part of chunksOf(overRows, SETTINGS_BATCH)) {
    const rs = await resolveSettingsMany({ tenantId: g.tenantId }, [T6_KEY, T7_KEY], part.map((r) => ({ unitId: g.unitId, productId: r.productId, departureId: r.id })));
    part.forEach((r, i) => byDep.set(r.id, { t6: settingOf(T6S, T6_KEY, rs[i][T6_KEY]?.value), t7: settingOf(T7S, T7_KEY, rs[i][T7_KEY]?.value) }));
  }
  return rows.map((r) => {
    const p = byDep.get(r.id) ?? byProduct.get(r.productId);
    if (!p) throw new Error("departurePolicies: ไม่มีค่าตั้งของสินค้า");
    return p;
  });
}

// ═══════════════════════ สถานะหลังตัวนับ/ความจุเปลี่ยน (ใช้ร่วมกับ T0.4) ═══════════════════════
/** ค่าหลังการเปลี่ยนของแถว "TripDeparture" ในรูปนิพจน์ SQL — ทุกตัวต้องเป็นค่า "หลัง" UPDATE (ใน SET ทุกนิพจน์เห็นแถวเก่า) */
export type DepartureCountersAfterSql = {
  /** ความจุใหม่ เช่น ${n} หรือ "capacity" (ไม่เปลี่ยน) */
  capacity: Prisma.Sql;
  /** ยอดใช้ใหม่ = sold + held + reserved หลังเปลี่ยน เช่น ("sold" + "held" + ${n} + "reserved") */
  used: Prisma.Sql;
  /** sold ใหม่ เช่น ("sold" + ${n}) หรือ "sold" (ไม่เปลี่ยน) */
  sold: Prisma.Sql;
};
/** ค่าคงเดิม (ใบ T0.3: แก้ความจุอย่างเดียว ตัวนับไม่เปลี่ยน) */
export function departureCountersUnchangedSql(capacity: Prisma.Sql): DepartureCountersAfterSql {
  return { capacity, used: Prisma.sql`("sold" + "held" + "reserved")`, sold: Prisma.sql`"sold"` };
}
/**
 * นิพจน์ SQL เดียวของ "สถานะหลังตัวนับหรือความจุเปลี่ยน" — T0.4 ใช้ตัวนี้ตรงตัว (มติผู้คุม G · REVIEW M2 · r3 N1)
 *   สถานะเดิม FULL และยอดใช้ใหม่ < ความจุใหม่ ⇒ GUARANTEED เมื่อเคยยืนยันออกแล้ว (guaranteedAt มีค่า) หรือ sold ใหม่ ≥ minPax (ใบสั่ง §4 ข้อ 4) · ไม่งั้น OPEN
 *     ⇒ GUARANTEED ไม่ย้อนเป็น OPEN เพราะความจุเพิ่ม/ยอดลด (มติ: FULL → GUARANTEED เมื่อ sold ≥ minPax ได้แม้ก่อนเวลาตัดสิน)
 *   setFull (T0.4 เท่านั้น): สถานะเดิม OPEN/GUARANTEED และยอดใช้ใหม่ ≥ ความจุใหม่ ⇒ FULL · ใบ T0.3 ส่ง false (ใบนี้ไม่ตั้ง FULL)
 * 🔴 ใน SET ของ Postgres ทุกนิพจน์เห็น "แถวเก่า" ⇒ ผู้เรียกต้องส่งค่าหลังเปลี่ยนเป็นพารามิเตอร์ (ห้ามอ้าง "held" ที่กำลังถูกแก้ใน SET เดียวกันแล้วหวังค่าใหม่)
 * วิธีเรียกของ T0.4 (ถือที่ n ที่):
 *   const c = { capacity: Prisma.sql`"capacity"`, used: Prisma.sql`("sold" + "held" + ${n} + "reserved")`, sold: Prisma.sql`"sold"` };
 *   UPDATE "TripDeparture" SET "held" = "held" + ${n}, "status" = ${departureStatusAfterCountersSql(c, { setFull: true })},
 *     "guaranteedAt" = ${departureGuaranteedAtAfterCountersSql(c, { setFull: true, nowIso })}, "version" = "version" + 1
 *   WHERE … AND "sold" + "held" + "reserved" + ${n} <= "capacity"
 *   (คืนที่: used = ("sold" + "held" - ${n} + "reserved") · ขายจากที่ถือ: used ไม่เปลี่ยน sold = ("sold" + ${n}))
 */
export function departureStatusAfterCountersSql(c: DepartureCountersAfterSql, opts: { setFull: boolean }): Prisma.Sql {
  const full = opts.setFull ? Prisma.sql`WHEN "status" IN ('OPEN', 'GUARANTEED') AND ${c.used} >= ${c.capacity} THEN 'FULL'` : Prisma.empty;
  return Prisma.sql`(CASE WHEN "status" = 'FULL' AND ${c.used} < ${c.capacity}
    THEN (CASE WHEN "guaranteedAt" IS NOT NULL OR ("minPax" IS NOT NULL AND ${c.sold} >= "minPax") THEN 'GUARANTEED' ELSE 'OPEN' END) ${full} ELSE "status" END)`;
}
/** guaranteedAt คู่กับนิพจน์ข้างบน (พารามิเตอร์ชุดเดียวกัน): สถานะใหม่เป็น GUARANTEED และยังไม่เคยตั้ง ⇒ เวลาตอนนี้ · อื่น ๆ คงเดิม (ใช้ใน SET เดียวกัน) */
export function departureGuaranteedAtAfterCountersSql(c: DepartureCountersAfterSql, opts: { setFull: boolean; nowIso: string }): Prisma.Sql {
  return Prisma.sql`(CASE WHEN ${departureStatusAfterCountersSql(c, opts)} = 'GUARANTEED' THEN COALESCE("guaranteedAt", ${opts.nowIso}::timestamp) ELSE "guaranteedAt" END)`;
}

// ═══════════════════════ ชนิด · ตัวช่วย ═══════════════════════
const MS_PER_MIN = 60_000;
const READ_SPAN_MAX_DAYS = 62;
/** จำนวนวันต่อธุรกรรมของ materialize (commit ทีละช่วง · ไม่ใช่ตัวเลขธุรกิจ — ให้ 730 วัน + ทรัพยากรจบใต้เพดานเวลา tx) */
const MATERIALIZE_CHUNK_DAYS = 31;
/** ระยะเวลารอบสูงสุด (นาที) = เพดานระยะสร้างล่วงหน้าของทะเบียน × 1 วัน (ความสมเหตุสมผลของ input · ไม่ใช่ตัวเลขธุรกิจ) */
const MAX_DURATION_MIN = HORIZON_MAX_DAYS * MIN_PER_DAY;
const YMD = z.string().refine(isYmd, { message: "วันที่ต้องเป็นรูปแบบ ปปปป-ดด-วว และเป็นวันที่มีจริง" });
const MIN_OF_DAY = z.number().int().min(0).max(MIN_PER_DAY - 1);
const CAPACITY = z.number().int().min(1).max(INT4_MAX);
const MIN_PAX = z.number().int().min(1).max(INT4_MAX).nullable();
const DURATION = z.number().int().min(1).max(MAX_DURATION_MIN);
const RESOURCE_IDS = z.array(ID).max(50);
/** กฎซ้ำ: วันระบุ (DATES) ไม่เกินเพดานระยะสร้างล่วงหน้า */
const RULE = tripScheduleRuleSchema.refine((r) => r.kind !== "DATES" || r.dates.length <= HORIZON_MAX_DAYS, { message: `ระบุวันได้ไม่เกิน ${HORIZON_MAX_DAYS} วัน` });
/** ข้อยกเว้น: จำนวนไม่เกินเพดาน · ความจุทับ 1..int4 · ขั้นต่ำทับไม่เกิน int4 */
const EXCEPTIONS = tripScheduleExceptionsSchema.superRefine((xs, ctx) => {
  if (xs.length > HORIZON_MAX_DAYS) ctx.addIssue({ code: "custom", message: `ข้อยกเว้นได้ไม่เกิน ${HORIZON_MAX_DAYS} วัน` });
  for (const x of xs) {
    if (x.capacity !== undefined && (x.capacity < 1 || x.capacity > INT4_MAX)) ctx.addIssue({ code: "custom", message: `ความจุของวัน ${x.date} ไม่ถูกต้อง` });
    if (x.minPax !== undefined && x.minPax !== null && x.minPax > INT4_MAX) ctx.addIssue({ code: "custom", message: `ขั้นต่ำของวัน ${x.date} ไม่ถูกต้อง` });
  }
});

const toJson = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const iso = (d: Date) => d.toISOString();
function unitIdOf(input: unknown): unknown {
  return typeof input === "object" && input !== null && !Array.isArray(input) ? (input as { unitId?: unknown }).unitId : undefined;
}
function invalid(e: z.ZodError, extra?: string): DepartureFail {
  const first = e.issues[0];
  return failOf("INVALID_INPUT", extra ?? (first ? `ข้อมูลไม่ถูกต้อง: ${first.path.join(".") || "input"} ${first.message}` : undefined));
}
const badNow = () => failOf("INVALID_INPUT", "เวลาไม่ถูกต้อง");
function inclusiveDays(from: string, to: string): number {
  return Math.round((dbDate(to).getTime() - dbDate(from).getTime()) / (MIN_PER_DAY * MS_PER_MIN)) + 1;
}
/** วันที่ต้องอยู่ในกรอบ [วันนี้ − เพดาน, วันนี้ + เพดาน] ของร้าน (กันค่าไร้สาระ เช่น ปี 9999) */
function dateOutOfRange(g: Gate, now: Date, ymds: readonly (string | null | undefined)[]): DepartureFail | null {
  const today = utcToLocal(g.tz, now).ymd;
  const lo = addDaysYmd(today, -HORIZON_MAX_DAYS);
  const hi = addDaysYmd(today, HORIZON_MAX_DAYS);
  const bad = ymds.find((d) => typeof d === "string" && (d < lo || d > hi));
  return bad ? failOf("INVALID_INPUT", `วันที่ ${bad} อยู่นอกช่วงที่รับได้ (${lo} ถึง ${hi})`) : null;
}
/** ขั้นต่ำต้องไม่เกินความจุ (ค่าจาก input · ข้อยกเว้นเทียบกับความจุของวันนั้น) */
function minPaxOverCapacity(s: { capacity: number; minPax: number | null; exceptions: ScheduleShape["exceptions"] }): DepartureFail | null {
  if (s.minPax !== null && s.minPax > s.capacity) return failOf("INVALID_INPUT", "ขั้นต่ำต้องไม่เกินความจุ");
  for (const x of s.exceptions) {
    if (x.action !== "OVERRIDE") continue;
    const cap = x.capacity ?? s.capacity;
    const mp = x.minPax !== undefined ? x.minPax : s.minPax;
    if (mp !== null && mp > cap) return failOf("INVALID_INPUT", `ขั้นต่ำของวัน ${x.date} ต้องไม่เกินความจุ`);
  }
  return null;
}

export type DepartureEventType = "trips.departure.created" | "trips.departure.status_changed" | "trips.departure.below_min" | "trips.departure.cancelled";
type EventRow = { id: string; productId: string; status: string; sold: number; minPax: number | null };
/** event รอบ — payload ตรง 6 คีย์ (ไม่มีข้อมูลบุคคล) · emit ใน tx เดียวกับการเขียน · คีย์ซ้ำ = เงียบ */
async function emitDeparture(tx: Tx, g: Gate, type: DepartureEventType, key: string, d: EventRow) {
  await emitOutbox(tx, {
    tenantId: g.tenantId,
    unitId: g.unitId,
    type,
    idempotencyKey: key,
    payload: { departureId: d.id, productId: d.productId, unitId: g.unitId, status: d.status, paxSold: d.sold, minPax: d.minPax },
  });
}
const belowMinKey = (id: string, decisionAt: Date) => `trips.departure.below_min:${id}:${decisionAt.getTime()}`;

/**
 * ด่าน "ขายได้" ของ T0.2 ใน tx (สินค้า FOR SHARE · ไม่ ARCHIVED · ตัวเลือกเป็นของสินค้าและเปิดใช้) แล้วอ่านระยะเวลาของตัวเลือก
 * เรียกก่อนล็อกกฎ/รอบใด ๆ · หลังจากนี้ห้าม UPDATE/FOR UPDATE แถวสินค้าใน tx เดียวกัน
 */
async function sellableOptionInTx(tx: Tx, g: Gate, productId: string, optionId: string): Promise<{ durationMin: number | null; nights: number | null } | DepartureFail> {
  try {
    await assertProductSellableInTx(tx, { tenantId: g.tenantId, unitId: g.unitId, productId, optionId });
  } catch (e) {
    if (e instanceof TripProductNotSellableError) {
      return e.code === "NOT_FOUND" ? failOf("NOT_FOUND", "ไม่พบสินค้าหรือตัวเลือกในหน่วยนี้") : failOf(e.code);
    }
    throw e;
  }
  const opt = await tx.tripOption.findFirst({ where: { id: optionId, productId }, select: { durationMin: true, nights: true } });
  return opt ?? failOf("NOT_FOUND", "ไม่พบตัวเลือกของสินค้านี้");
}
/** ระยะเวลา (นาที) = input ?? option.durationMin ?? option.nights × 1440 · ไม่มี/≤ 0 ⇒ NO_DURATION (CHECK endsAt > startsAt) · เกินเพดาน ⇒ INVALID_INPUT */
function durationOf(input: number | undefined, option: { durationMin: number | null; nights: number | null }): number | DepartureFail {
  const d = input ?? option.durationMin ?? (option.nights ? option.nights * MIN_PER_DAY : null);
  if (d === null || d <= 0) return failOf("NO_DURATION");
  if (d > MAX_DURATION_MIN) return failOf("INVALID_INPUT", "ระยะเวลาของรอบยาวเกินไป");
  return d;
}

type NewDeparture = {
  productId: string;
  optionId: string;
  scheduleId: string | null;
  localDate: string;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  minPax: number | null;
  cutoffAt: Date;
};
/** INSERT รอบใต้ SAVEPOINT · ชน unique (NND · scheduleId+localDate) ⇒ { duplicateOf } (id รอบที่ชน ถ้าอ่านได้ · ไม่ล้ม tx) */
async function insertDepartureTx(tx: Tx, g: Gate, d: NewDeparture): Promise<{ id: string } | { duplicateOf: string | null }> {
  const findDup = () =>
    tx.tripDeparture.findFirst({
      where: { OR: [{ productId: d.productId, optionId: d.optionId, startsAt: d.startsAt }, ...(d.scheduleId ? [{ scheduleId: d.scheduleId, localDate: dbDate(d.localDate) }] : [])] },
      select: { id: true },
    });
  const dup = await findDup();
  if (dup) return { duplicateOf: dup.id };
  const res = await underSavepoint(tx, () =>
    tx.tripDeparture.create({
      data: {
        tenantId: g.tenantId,
        unitId: g.unitId,
        productId: d.productId,
        optionId: d.optionId,
        scheduleId: d.scheduleId,
        localDate: dbDate(d.localDate),
        startsAt: d.startsAt,
        endsAt: d.endsAt,
        status: "OPEN",
        capacity: d.capacity,
        minPax: d.minPax,
        cutoffAt: d.cutoffAt,
      },
      select: { id: true },
    }),
  );
  if (res.ok) return res.value;
  if (pgCodeOf(res.error) === "23505") return { duplicateOf: (await findDup())?.id ?? null };
  throw res.error;
}

// ═══════════════════════ DTO ═══════════════════════
export type DepartureDTO = {
  id: string;
  productId: string;
  optionId: string | null;
  scheduleId: string | null;
  localDate: string;
  startsAt: string;
  endsAt: string;
  status: string;
  capacity: number;
  sold: number;
  held: number;
  reserved: number;
  minPax: number | null;
  cutoffAt: string | null;
  stopSell: unknown;
  version: number;
  resources: { resourceId: string; kind: string; name: string }[];
  cutoffs: Record<string, string>;
  decisionAt: string | null;
  needsDecision: boolean;
};
const DEP_SELECT = {
  id: true,
  productId: true,
  optionId: true,
  scheduleId: true,
  localDate: true,
  startsAt: true,
  endsAt: true,
  status: true,
  capacity: true,
  sold: true,
  held: true,
  reserved: true,
  minPax: true,
  cutoffAt: true,
  stopSell: true,
  version: true,
} as const;
type DepRow = Prisma.TripDepartureGetPayload<{ select: typeof DEP_SELECT }>;

async function toDtos(g: Gate, rows: DepRow[], now: Date): Promise<DepartureDTO[]> {
  if (!rows.length) return [];
  const db = unitDb(g);
  const uses: { departureId: string; resourceId: string }[] = [];
  for (const part of chunksOf(rows.map((r) => r.id), ID_BATCH)) {
    uses.push(...(await db.tripResourceUse.findMany({ where: { departureId: { in: part }, active: true }, select: { departureId: true, resourceId: true }, orderBy: { id: "asc" } })));
  }
  const res = uses.length
    ? await db.tripResource.findMany({ where: { id: { in: [...new Set(uses.map((u) => u.resourceId))] } }, select: { id: true, kind: true, name: true } })
    : [];
  const resById = new Map(res.map((r) => [r.id, r]));
  const usesByDep = new Map<string, { resourceId: string; kind: string; name: string }[]>();
  for (const u of uses) {
    const list = usesByDep.get(u.departureId) ?? [];
    list.push({ resourceId: u.resourceId, kind: resById.get(u.resourceId)?.kind ?? "OTHER", name: resById.get(u.resourceId)?.name ?? "" });
    usesByDep.set(u.departureId, list);
  }
  const pols = await departurePolicies(g, rows);
  return rows.map((r, i) => {
    const ref = { localDate: ymdOf(r.localDate), startsAt: r.startsAt };
    const decisionAt = r.minPax === null ? null : decisionAtFor(ref, pols[i].t7, g.tz);
    return {
      id: r.id,
      productId: r.productId,
      optionId: r.optionId,
      scheduleId: r.scheduleId,
      localDate: ref.localDate,
      startsAt: iso(r.startsAt),
      endsAt: iso(r.endsAt),
      status: r.status,
      capacity: r.capacity,
      sold: r.sold,
      held: r.held,
      reserved: r.reserved,
      minPax: r.minPax,
      cutoffAt: r.cutoffAt ? iso(r.cutoffAt) : null,
      stopSell: r.stopSell ?? null,
      version: r.version,
      resources: usesByDep.get(r.id) ?? [],
      cutoffs: cutoffsFor(ref, pols[i].t6, g.tz),
      decisionAt: decisionAt ? iso(decisionAt) : null,
      needsDecision: needsDecision(r, decisionAt, now),
    };
  });
}

// ═══════════════════════ กฎซ้ำ (TripSchedule) ═══════════════════════
const createScheduleInput = z.strictObject({
  unitId: ID,
  productId: ID,
  optionId: ID,
  rule: RULE,
  exceptions: EXCEPTIONS.optional(),
  departTimeMin: MIN_OF_DAY,
  capacity: CAPACITY,
  minPax: MIN_PAX.optional(),
  resourceIds: RESOURCE_IDS.optional(),
  dateFrom: YMD,
  dateTo: YMD.nullable().optional(),
});
const updateScheduleInput = z.strictObject({
  unitId: ID,
  scheduleId: ID,
  rule: RULE.optional(),
  exceptions: EXCEPTIONS.optional(),
  departTimeMin: MIN_OF_DAY.optional(),
  capacity: CAPACITY.optional(),
  minPax: MIN_PAX.optional(),
  resourceIds: RESOURCE_IDS.optional(),
  dateFrom: YMD.optional(),
  dateTo: YMD.nullable().optional(),
});
const scheduleRefInput = z.strictObject({ unitId: ID, scheduleId: ID });
const listSchedulesInput = z.strictObject({ unitId: ID, productId: ID.optional() });

type ScheduleRow = {
  id: string;
  productId: string;
  optionId: string | null;
  rule: Prisma.JsonValue;
  exceptions: Prisma.JsonValue;
  departTimeMin: number;
  capacity: number;
  minPax: number | null;
  resourceIds: string[];
  dateFrom: Date;
  dateTo: Date | null;
  pausedAt: Date | null;
};
function shapeOf(s: ScheduleRow): ScheduleShape | null {
  const rule = tripScheduleRuleSchema.safeParse(s.rule);
  const ex = tripScheduleExceptionsSchema.safeParse(s.exceptions);
  if (!rule.success || !ex.success) return null;
  return {
    rule: rule.data,
    exceptions: ex.data,
    dateFrom: ymdOf(s.dateFrom),
    dateTo: s.dateTo ? ymdOf(s.dateTo) : null,
    departTimeMin: s.departTimeMin,
    capacity: s.capacity,
    minPax: s.minPax,
  };
}
/** ล็อกกฎ: advisory (คีย์เดียวกับ materialize) แล้ว FOR UPDATE แถว — อ่านค่าล่าสุดใต้ล็อก */
async function lockSchedule(tx: Tx, g: Gate, id: string): Promise<ScheduleRow | null> {
  await tx.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtext(${`trips-schedule:${id}`}))`;
  const rows = await tx.$queryRaw<ScheduleRow[]>`
    SELECT "id", "productId", "optionId", "rule", "exceptions", "departTimeMin", "capacity", "minPax", "resourceIds", "dateFrom", "dateTo", "pausedAt"
    FROM "TripSchedule" WHERE "id" = ${id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId}
    FOR UPDATE`;
  return rows[0] ?? null;
}
export type ScheduleItem = {
  id: string;
  productId: string;
  optionId: string | null;
  rule: unknown;
  exceptions: unknown;
  departTimeMin: number;
  capacity: number;
  minPax: number | null;
  resourceIds: string[];
  dateFrom: string;
  dateTo: string | null;
  paused: boolean;
};

export async function createSchedule(ctx: TripCtx, input: unknown, opts?: TripOpts): Promise<{ ok: true; id: string } | DepartureFail> {
  const g = await gateUnit(ctx, unitIdOf(input), "edit");
  if (isFail(g)) return g;
  const p = createScheduleInput.safeParse(input);
  if (!p.success) return invalid(p.error);
  const v = p.data;
  const now = nowOf(opts);
  if (!now) return badNow();
  if (v.dateTo && v.dateFrom > v.dateTo) return failOf("INVALID_INPUT", "วันเริ่มต้องไม่หลังวันสิ้นสุด");
  const range = dateOutOfRange(g, now, [v.dateFrom, v.dateTo, ...(v.rule.kind === "DATES" ? v.rule.dates : []), ...(v.exceptions ?? []).map((x) => x.date)]);
  if (range) return range;
  const over = minPaxOverCapacity({ capacity: v.capacity, minPax: v.minPax ?? null, exceptions: v.exceptions ?? [] });
  if (over) return over;
  const resourceIds = sortedIds(v.resourceIds ?? []);
  return inTx(g, async (tx) => {
    const opt = await sellableOptionInTx(tx, g, v.productId, v.optionId);
    if (isFail(opt)) return opt;
    const dur = durationOf(undefined, opt);
    if (typeof dur !== "number") return dur;
    const bad = await checkResources(tx, g, resourceIds);
    if (bad) return bad;
    const s = await tx.tripSchedule.create({
      data: {
        tenantId: g.tenantId,
        unitId: g.unitId,
        productId: v.productId,
        optionId: v.optionId,
        rule: toJson(v.rule),
        exceptions: toJson(v.exceptions ?? []),
        departTimeMin: v.departTimeMin,
        capacity: v.capacity,
        minPax: v.minPax ?? null,
        resourceIds,
        dateFrom: dbDate(v.dateFrom),
        dateTo: v.dateTo ? dbDate(v.dateTo) : null,
      },
      select: { id: true },
    });
    await auditTx(tx, g, "trips.schedule.create", "TripSchedule", s.id, { productId: v.productId, optionId: v.optionId, rule: toJson(v.rule), dateFrom: v.dateFrom, dateTo: v.dateTo ?? null });
    return { ok: true as const, id: s.id };
  });
}

/** แก้กฎ — ใต้ล็อกกฎ (advisory + FOR UPDATE) ผสานจากค่าล่าสุด (กันแก้ทับกัน) · รอบเดิมไม่ถูกแก้ · mismatched = รอบอนาคตที่ไม่ตรงกฎใหม่ */
export async function updateSchedule(ctx: TripCtx, input: unknown, opts?: TripOpts): Promise<{ ok: true; id: string; mismatched: string[] } | DepartureFail> {
  const g = await gateUnit(ctx, unitIdOf(input), "edit");
  if (isFail(g)) return g;
  const p = updateScheduleInput.safeParse(input);
  if (!p.success) return invalid(p.error);
  const v = p.data;
  const now = nowOf(opts);
  if (!now) return badNow();
  const range = dateOutOfRange(g, now, [v.dateFrom, v.dateTo, ...(v.rule?.kind === "DATES" ? v.rule.dates : []), ...(v.exceptions ?? []).map((x) => x.date)]);
  if (range) return range;
  const head = await unitDb(g).tripSchedule.findFirst({ where: { id: v.scheduleId }, select: { productId: true, optionId: true } });
  if (!head) return failOf("NOT_FOUND");
  const resourceIds = v.resourceIds ? sortedIds(v.resourceIds) : null;
  return inTx(g, async (tx) => {
    // ลำดับล็อก: สินค้า (ด่าน T0.2) → กฎ → ทรัพยากร
    if (head.optionId) {
      const opt = await sellableOptionInTx(tx, g, head.productId, head.optionId);
      if (isFail(opt)) return opt;
    }
    const cur = await lockSchedule(tx, g, v.scheduleId);
    if (!cur) return failOf("NOT_FOUND");
    const curShape = shapeOf(cur);
    if (!curShape) return failOf("INVALID_INPUT", "กฎเดิมผิดรูป");
    const next: ScheduleShape = {
      rule: v.rule ?? curShape.rule,
      exceptions: v.exceptions ?? curShape.exceptions,
      dateFrom: v.dateFrom ?? curShape.dateFrom,
      dateTo: v.dateTo !== undefined ? v.dateTo : curShape.dateTo,
      departTimeMin: v.departTimeMin ?? curShape.departTimeMin,
      capacity: v.capacity ?? curShape.capacity,
      minPax: v.minPax !== undefined ? v.minPax : curShape.minPax,
    };
    if (next.dateTo && next.dateFrom > next.dateTo) return failOf("INVALID_INPUT", "วันเริ่มต้องไม่หลังวันสิ้นสุด");
    const over = minPaxOverCapacity(next);
    if (over) return over;
    if (resourceIds) {
      const bad = await checkResources(tx, g, resourceIds);
      if (bad) return bad;
    }
    const data: Prisma.TripScheduleUpdateManyMutationInput = {
      rule: toJson(next.rule),
      exceptions: toJson(next.exceptions),
      dateFrom: dbDate(next.dateFrom),
      dateTo: next.dateTo ? dbDate(next.dateTo) : null,
      departTimeMin: next.departTimeMin,
      capacity: next.capacity,
      minPax: next.minPax,
    };
    if (resourceIds) data.resourceIds = resourceIds;
    const n = await tx.tripSchedule.updateMany({ where: { id: v.scheduleId }, data });
    if (n.count !== 1) return failOf("NOT_FOUND");
    const deps = await tx.tripDeparture.findMany({
      where: { scheduleId: v.scheduleId, status: { not: "CANCELLED" }, startsAt: { gt: now } },
      select: { id: true, localDate: true, startsAt: true },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    });
    const mismatched: string[] = [];
    if (deps.length) {
      const dates = deps.map((d) => ymdOf(d.localDate)).sort();
      const want = new Map(expandSchedule(next, { fromYmd: dates[0], toYmdExclusive: addDaysYmd(dates[dates.length - 1], 1) }).map((x) => [x.localDate, x]));
      for (const d of deps) {
        const ymd = ymdOf(d.localDate);
        const w = want.get(ymd);
        // เทียบ instant ที่กฎใหม่จะให้ (รวมการเลื่อนช่วงกระโดด DST) ไม่ใช่นาทีของวัน
        if (!w || localToUtc(g.tz, ymd, w.departTimeMin).getTime() !== d.startsAt.getTime()) mismatched.push(d.id);
      }
    }
    await auditTx(tx, g, "trips.schedule.update", "TripSchedule", v.scheduleId, { rule: toJson(next.rule), mismatched: mismatched.length });
    return { ok: true as const, id: v.scheduleId, mismatched };
  });
}

/** พัก/เปิดกฎ — ใต้ล็อกกฎเดียวกับ materialize (พักที่ commit แล้ว ⇒ ช่วงถัดไปของ materialize เห็นทันที) */
async function setPaused(ctx: TripCtx, input: unknown, pause: boolean, opts?: TripOpts): Promise<{ ok: true; id: string } | DepartureFail> {
  const g = await gateUnit(ctx, unitIdOf(input), "edit");
  if (isFail(g)) return g;
  const p = scheduleRefInput.safeParse(input);
  if (!p.success) return invalid(p.error);
  const v = p.data;
  const now = nowOf(opts);
  if (!now) return badNow();
  return inTx(g, async (tx) => {
    const cur = await lockSchedule(tx, g, v.scheduleId);
    if (!cur) return failOf("NOT_FOUND");
    if ((cur.pausedAt !== null) === pause) return failOf("BAD_STATE", pause ? "กฎนี้พักอยู่แล้ว" : "กฎนี้ไม่ได้พักอยู่");
    if (!pause) {
      // เปิดกฎต่อ: ทรัพยากรของกฎต้องยังอยู่และเปิดใช้ (ล็อก FOR SHARE เรียง id ใต้ล็อกกฎ) — ไม่งั้นทุกวันจะกลายเป็น RESOURCE_INACTIVE ในงานรายวัน
      const ids = sortedIds(cur.resourceIds);
      const rows = await lockResourcesShared(tx, g, ids);
      const found = new Map(rows.map((r) => [r.id, r]));
      const bad = ids.filter((id) => !found.get(id)?.active);
      if (bad.length) {
        const names = bad.map((id) => (found.get(id) ? `"${found.get(id)?.name}"` : `${id} (ไม่พบ)`)).join(", ");
        return failOf("RESOURCE_INACTIVE", `เปิดกฎต่อไม่ได้: ทรัพยากรของกฎปิดใช้หรือไม่มีแล้ว ${names} — เปลี่ยนทรัพยากรของกฎก่อน`, { resourceIds: bad });
      }
    }
    await tx.tripSchedule.updateMany({ where: { id: v.scheduleId }, data: { pausedAt: pause ? now : null } });
    await auditTx(tx, g, pause ? "trips.schedule.pause" : "trips.schedule.resume", "TripSchedule", v.scheduleId, { paused: pause });
    return { ok: true as const, id: v.scheduleId };
  });
}
export async function pauseSchedule(ctx: TripCtx, input: unknown, opts?: TripOpts) {
  return setPaused(ctx, input, true, opts);
}
export async function resumeSchedule(ctx: TripCtx, input: unknown, opts?: TripOpts) {
  return setPaused(ctx, input, false, opts);
}

export async function listSchedules(ctx: TripCtx, input: unknown): Promise<{ ok: true; items: ScheduleItem[] } | DepartureFail> {
  const g = await gateUnit(ctx, unitIdOf(input), "read");
  if (isFail(g)) return g;
  const p = listSchedulesInput.safeParse(input);
  if (!p.success) return invalid(p.error);
  const rows = await unitDb(g).tripSchedule.findMany({
    where: p.data.productId ? { productId: p.data.productId } : {},
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return {
    ok: true,
    items: rows.map((s) => ({
      id: s.id,
      productId: s.productId,
      optionId: s.optionId,
      rule: s.rule,
      exceptions: s.exceptions,
      departTimeMin: s.departTimeMin,
      capacity: s.capacity,
      minPax: s.minPax,
      resourceIds: s.resourceIds,
      dateFrom: ymdOf(s.dateFrom),
      dateTo: s.dateTo ? ymdOf(s.dateTo) : null,
      paused: s.pausedAt !== null,
    })),
  };
}

export type MaterializeConflict = {
  localDate: string;
  resourceId: string | null;
  departureId: string | null;
  reason: "RESOURCE_CLASH" | "RESOURCE_INACTIVE" | "DUPLICATE_DEPARTURE";
};
export type MaterializeResult = {
  ok: true;
  created: string[];
  conflicts: MaterializeConflict[];
  windowEnd: string;
  /** true = สร้างครบทั้งหน้าต่างแล้ว · false = หยุดกลางทาง (stoppedBy บอกเหตุ · ช่วงที่ commit แล้วคงอยู่) */
  complete: boolean;
  stoppedBy?: string;
  /** วันแรก (ของร้าน) ที่ยังไม่ได้ประมวล — วันก่อนหน้านี้ในหน้าต่างประมวลแล้ว (complete = true ⇒ เท่าปลายหน้าต่างหรือ dateTo + 1) */
  doneUntil: string;
};
/**
 * งบต่อคำขอของ action (ไม่ใช่งานรายวัน): ประมวลได้ไม่เกินกี่ช่วง (ช่วงละ MATERIALIZE_CHUNK_DAYS วัน) ต่อการกดหนึ่งครั้ง
 * เหตุ: 730 วัน + ทรัพยากรใช้ ~135 วิ เกินเวลาของคำขอเว็บ ⇒ คืน complete: false + doneUntil แล้วงานรายวันทำต่อ (มติผู้คุม r3 ข้อ 5)
 */
export const MATERIALIZE_ACTION_MAX_CHUNKS = 2;
class SkipDay extends Error {
  constructor(readonly conflict: MaterializeConflict | null) {
    super("skip-day");
  }
}

/**
 * สร้างรอบจากกฎ (ตรรกะเดียวของ action + งานรายวัน) — หน้าต่าง [max(dateFrom, วันนี้), min(dateTo+1, วันนี้ + T8)) ของร้าน
 * ทำทีละช่วง MATERIALIZE_CHUNK_DAYS วัน · ช่วงละธุรกรรม (commit ทีละช่วง — ความคืบหน้าคงอยู่):
 *   ด่านสินค้า (T0.2 · FOR SHARE) → ล็อกกฎ (advisory + FOR UPDATE) แล้วอ่านกฎใหม่ (พัก? กฎ/เวลา/ข้อยกเว้น) → ล็อกทรัพยากร FOR SHARE เรียง id
 *   ค่าตั้ง (T6 T7 T8) อ่านใหม่ก่อนเปิดธุรกรรมของแต่ละช่วง (API ค่าตั้งไม่รับ tx — อ่านใน tx = ขอ connection ที่สองระหว่างถือ tx)
 * idempotent: วันที่มีรอบของกฎแล้ว (สถานะใดก็ได้) = ข้าม · ชน unique = ข้าม (savepoint) + จดใน conflicts
 * ทรัพยากรชน/ปิดใช้ ⇒ ไม่สร้างวันนั้น + conflicts · ข้ามวันที่ startsAt ≤ now
 */
export async function materializeCore(g: Gate, scheduleId: string, now: Date, signal?: AbortSignal, maxChunks?: number): Promise<MaterializeResult | DepartureFail> {
  const head = await unitDb(g).tripSchedule.findFirst({ where: { id: scheduleId } });
  if (!head) return failOf("NOT_FOUND");
  const headShape = shapeOf(head);
  if (head.pausedAt) return failOf("SCHEDULE_PAUSED");
  if (!head.optionId) return failOf("NO_DURATION");
  const optionId = head.optionId;
  const today = utcToLocal(g.tz, now).ymd;
  const created: string[] = [];
  const conflicts: MaterializeConflict[] = [];
  let from = ymdOf(head.dateFrom) > today ? ymdOf(head.dateFrom) : today;
  let windowEnd = today;
  let first = true;
  let stoppedBy: string | undefined;
  let complete = false;
  let txChunks = 0;
  for (;;) {
    if (signal?.aborted) {
      stoppedBy = "ABORTED";
      break;
    }
    const pol = await policyAt(g.tenantId, { unitId: g.unitId, productId: head.productId });
    if (pol.t8 === null) {
      if (first) return failOf("HORIZON_OFF");
      stoppedBy = "HORIZON_OFF";
      break;
    }
    windowEnd = addDaysYmd(today, pol.t8);
    const end = head.dateTo && addDaysYmd(ymdOf(head.dateTo), 1) < windowEnd ? addDaysYmd(ymdOf(head.dateTo), 1) : windowEnd;
    if (from >= end) {
      complete = true;
      break;
    }
    const to = addDaysYmd(from, MATERIALIZE_CHUNK_DAYS) < end ? addDaysYmd(from, MATERIALIZE_CHUNK_DAYS) : end;
    // ช่วงที่มีรอบครบทุกวันแล้ว (อ่านไม่ล็อก) ⇒ ไม่เปิดธุรกรรม (รันซ้ำรายวันถูกลง · ไม่มีอะไรให้สร้าง จึงไม่ต้องตรวจพัก/เก็บสินค้า)
    if (headShape && !first) {
      const want = expandSchedule(headShape, { fromYmd: from, toYmdExclusive: to }).filter((d) => localToUtc(g.tz, d.localDate, d.departTimeMin).getTime() > now.getTime());
      const got = new Set(
        (await unitDb(g).tripDeparture.findMany({ where: { scheduleId, localDate: { gte: dbDate(from), lt: dbDate(to) } }, select: { localDate: true } })).map((d) => ymdOf(d.localDate)),
      );
      if (want.every((d) => got.has(d.localDate))) {
        from = to;
        continue;
      }
    }
    if (maxChunks !== undefined && txChunks >= maxChunks) {
      stoppedBy = "CHUNK_LIMIT";
      break;
    }
    txChunks++;
    const r = await inTx(g, (tx) => materializeChunkTx(tx, g, { scheduleId, productId: head.productId, optionId, from, to, now, pol }));
    if (isFail(r)) {
      if (first) return r;
      stoppedBy = r.code;
      break;
    }
    created.push(...r.created);
    conflicts.push(...r.conflicts);
    first = false;
    from = to;
  }
  return { ok: true, created, conflicts, windowEnd, complete, doneUntil: from, ...(stoppedBy ? { stoppedBy } : {}) };
}

async function materializeChunkTx(
  tx: Tx,
  g: Gate,
  c: { scheduleId: string; productId: string; optionId: string; from: string; to: string; now: Date; pol: Policy },
): Promise<{ created: string[]; conflicts: MaterializeConflict[] } | DepartureFail> {
  const opt = await sellableOptionInTx(tx, g, c.productId, c.optionId);
  if (isFail(opt)) return opt;
  const dur = durationOf(undefined, opt);
  if (typeof dur !== "number") return dur;
  const s = await lockSchedule(tx, g, c.scheduleId);
  if (!s) return failOf("NOT_FOUND");
  if (s.pausedAt) return failOf("SCHEDULE_PAUSED");
  if (s.productId !== c.productId || s.optionId !== c.optionId) return failOf("BUSY");
  const shape = shapeOf(s);
  if (!shape) return failOf("INVALID_INPUT", "กฎผิดรูป");
  const resourceIds = sortedIds(s.resourceIds);
  const locked = await lockResourcesShared(tx, g, resourceIds);
  const usable = new Set(locked.filter((r) => r.active).map((r) => r.id));
  const unusable = resourceIds.filter((r) => !usable.has(r));
  const days = expandSchedule(shape, { fromYmd: c.from, toYmdExclusive: c.to });
  const have = new Set(
    (
      await tx.tripDeparture.findMany({ where: { scheduleId: s.id, localDate: { gte: dbDate(c.from), lt: dbDate(c.to) } }, select: { localDate: true } })
    ).map((d) => ymdOf(d.localDate)),
  );
  const created: string[] = [];
  const conflicts: MaterializeConflict[] = [];
  for (const day of days) {
    if (have.has(day.localDate)) continue;
    const startsAt = localToUtc(g.tz, day.localDate, day.departTimeMin);
    if (startsAt.getTime() <= c.now.getTime()) continue;
    if (unusable.length) {
      for (const r of unusable) conflicts.push({ localDate: day.localDate, resourceId: r, departureId: null, reason: "RESOURCE_INACTIVE" });
      continue;
    }
    const endsAt = new Date(startsAt.getTime() + dur * MS_PER_MIN);
    const minPax = day.minPax !== undefined ? day.minPax : c.pol.t7.minPax;
    const res = await underSavepoint(tx, async () => {
      const ins = await insertDepartureTx(tx, g, {
        productId: s.productId,
        optionId: c.optionId,
        scheduleId: s.id,
        localDate: day.localDate,
        startsAt,
        endsAt,
        capacity: day.capacity,
        minPax,
        cutoffAt: cutoffAtColumn({ localDate: day.localDate, startsAt }, c.pol.t6, g.tz),
      });
      if (!("id" in ins)) throw new SkipDay({ localDate: day.localDate, resourceId: null, departureId: ins.duplicateOf, reason: "DUPLICATE_DEPARTURE" });
      for (const r of resourceIds) {
        // assignUseTx ตรวจซ้อนก่อนเขียน 1 ครั้ง + EXCLUDE ใต้ savepoint (ไม่มีตรวจซ้ำในลูปนี้)
        const a = await assignUseTx(tx, g, { id: ins.id, startsAt, endsAt }, r);
        if (!a.ok) throw new SkipDay({ localDate: day.localDate, resourceId: r, departureId: a.conflict?.departureId ?? null, reason: "RESOURCE_CLASH" });
      }
      await emitDeparture(tx, g, "trips.departure.created", `trips.departure.created:${ins.id}`, { id: ins.id, productId: s.productId, status: "OPEN", sold: 0, minPax });
      return ins.id;
    });
    if (res.ok) created.push(res.value);
    else if (res.error instanceof SkipDay) {
      if (res.error.conflict) conflicts.push(res.error.conflict);
    } else throw res.error;
  }
  if (created.length || conflicts.length) {
    await auditTx(tx, g, "trips.schedule.materialize", "TripSchedule", s.id, { created: created.length, conflicts: conflicts.length, from: c.from, to: c.to });
  }
  return { created, conflicts };
}

/** opts.maxChunks = งบช่วงต่อคำขอ (action ส่ง MATERIALIZE_ACTION_MAX_CHUNKS) · ไม่ส่ง = ทำจนครบหน้าต่าง (งานรายวัน/ข้อสอบ) */
export async function materializeSchedule(ctx: TripCtx, input: unknown, opts?: TripOpts & { maxChunks?: number }): Promise<MaterializeResult | DepartureFail> {
  const g = await gateUnit(ctx, unitIdOf(input), "edit");
  if (isFail(g)) return g;
  const p = scheduleRefInput.safeParse(input);
  if (!p.success) return invalid(p.error);
  const now = nowOf(opts);
  if (!now) return badNow();
  const maxChunks = opts?.maxChunks;
  if (maxChunks !== undefined && (!Number.isInteger(maxChunks) || maxChunks < 1)) return failOf("INVALID_INPUT", "จำนวนช่วงต่อคำขอไม่ถูกต้อง");
  return materializeCore(g, p.data.scheduleId, now, undefined, maxChunks);
}

// ═══════════════════════ รอบ (TripDeparture) ═══════════════════════
const createDepartureInput = z.strictObject({
  unitId: ID,
  productId: ID,
  optionId: ID,
  localDate: YMD,
  departTimeMin: MIN_OF_DAY,
  durationMin: DURATION.optional(),
  capacity: CAPACITY,
  minPax: MIN_PAX.optional(),
  resourceIds: RESOURCE_IDS.optional(),
});
const updateDepartureInput = z.strictObject({
  unitId: ID,
  departureId: ID,
  departTimeMin: MIN_OF_DAY.optional(),
  durationMin: DURATION.optional(),
  minPax: MIN_PAX.optional(),
  confirm: z.boolean().optional(),
});
const capacityInput = z.strictObject({ unitId: ID, departureId: ID, capacity: z.number().int().min(0).max(INT4_MAX) });
const statusInput = z.strictObject({ unitId: ID, departureId: ID, status: z.enum(DEPARTURE_STATUSES) });
const cancelInput = z.strictObject({ unitId: ID, departureId: ID, reason: z.string().trim().min(3).max(500) });
const depRefInput = z.strictObject({ unitId: ID, departureId: ID });
const listDeparturesInput = z.strictObject({ unitId: ID, from: YMD, to: YMD, productId: ID.optional(), status: z.enum(DEPARTURE_STATUSES).optional() });
const refreshInput = z.strictObject({ unitId: ID, productId: ID.optional() });
const stopSellInput = z.strictObject({ unitId: ID, departureId: ID, stopSell: z.unknown() });
const unitOnlyInput = z.strictObject({ unitId: ID });

export async function createDeparture(ctx: TripCtx, input: unknown, opts?: TripOpts): Promise<{ ok: true; id: string } | DepartureFail> {
  const g = await gateUnit(ctx, unitIdOf(input), "edit");
  if (isFail(g)) return g;
  const p = createDepartureInput.safeParse(input);
  if (!p.success) return invalid(p.error);
  const v = p.data;
  const now = nowOf(opts);
  if (!now) return badNow();
  const range = dateOutOfRange(g, now, [v.localDate]);
  if (range) return range;
  if (v.minPax !== undefined && v.minPax !== null && v.minPax > v.capacity) return failOf("INVALID_INPUT", "ขั้นต่ำต้องไม่เกินความจุ");
  const startsAt = localToUtc(g.tz, v.localDate, v.departTimeMin);
  if (startsAt.getTime() <= now.getTime()) return failOf("PAST_DEPARTURE", "เวลาออกของรอบนี้ผ่านไปแล้ว");
  const pol = await policyAt(g.tenantId, { unitId: g.unitId, productId: v.productId });
  const minPax = v.minPax !== undefined ? v.minPax : pol.t7.minPax;
  const resourceIds = sortedIds(v.resourceIds ?? []);
  return inTx(g, async (tx) => {
    // ลำดับล็อก: สินค้า → ตัวเลือก (ด่าน T0.2) → รอบใหม่ → ทรัพยากร (FOR SHARE เรียง id) → แถวใช้
    const opt = await sellableOptionInTx(tx, g, v.productId, v.optionId);
    if (isFail(opt)) return opt;
    const dur = durationOf(v.durationMin, opt);
    if (typeof dur !== "number") return dur;
    const endsAt = new Date(startsAt.getTime() + dur * MS_PER_MIN);
    const bad = await checkResources(tx, g, resourceIds);
    if (bad) return bad;
    const ins = await insertDepartureTx(tx, g, {
      productId: v.productId,
      optionId: v.optionId,
      scheduleId: null,
      localDate: v.localDate,
      startsAt,
      endsAt,
      capacity: v.capacity,
      minPax,
      cutoffAt: cutoffAtColumn({ localDate: v.localDate, startsAt }, pol.t6, g.tz),
    });
    if (!("id" in ins)) return failOf("DUPLICATE_DEPARTURE");
    for (const r of resourceIds) {
      const a = await assignUseTx(tx, g, { id: ins.id, startsAt, endsAt }, r);
      if (!a.ok) abortTx(a);
    }
    await emitDeparture(tx, g, "trips.departure.created", `trips.departure.created:${ins.id}`, { id: ins.id, productId: v.productId, status: "OPEN", sold: 0, minPax });
    await auditTx(tx, g, "trips.departure.create", "TripDeparture", ins.id, {
      productId: v.productId,
      optionId: v.optionId,
      localDate: v.localDate,
      startsAt: iso(startsAt),
      capacity: v.capacity,
      minPax,
      resourceIds,
    });
    return { ok: true as const, id: ins.id };
  });
}

export async function updateDeparture(ctx: TripCtx, input: unknown, opts?: TripOpts): Promise<{ ok: true; id: string } | DepartureFail> {
  const g = await gateUnit(ctx, unitIdOf(input), "edit");
  if (isFail(g)) return g;
  const p = updateDepartureInput.safeParse(input);
  if (!p.success) return invalid(p.error);
  const v = p.data;
  const now = nowOf(opts);
  if (!now) return badNow();
  const head = await unitDb(g).tripDeparture.findFirst({ where: { id: v.departureId }, select: { productId: true, localDate: true } });
  if (!head) return failOf("NOT_FOUND");
  const pol = await policyAt(g.tenantId, { unitId: g.unitId, productId: head.productId, departureId: v.departureId });
  return inTx(g, async (tx) => {
    const dep = await lockDeparture(tx, g, v.departureId);
    if (!dep) return failOf("NOT_FOUND");
    if (dep.status === "CANCELLED") return failOf("BAD_STATE", "รอบนี้ยกเลิกแล้ว");
    if (dep.startsAt.getTime() <= now.getTime()) return failOf("PAST_DEPARTURE");
    if (v.minPax !== undefined && v.minPax !== null && v.minPax > dep.capacity) return failOf("INVALID_INPUT", "ขั้นต่ำต้องไม่เกินความจุ");
    const startsAt = v.departTimeMin !== undefined ? localToUtc(g.tz, dep.localDate, v.departTimeMin) : dep.startsAt;
    const dur = v.durationMin ?? Math.round((dep.endsAt.getTime() - dep.startsAt.getTime()) / MS_PER_MIN);
    const endsAt = new Date(startsAt.getTime() + dur * MS_PER_MIN);
    const timeChanged = startsAt.getTime() !== dep.startsAt.getTime() || endsAt.getTime() !== dep.endsAt.getTime();
    const data: Prisma.TripDepartureUpdateManyMutationInput = { version: { increment: 1 }, updatedAt: now };
    if (timeChanged) {
      if (startsAt.getTime() <= now.getTime()) return failOf("PAST_DEPARTURE", "เวลาใหม่ผ่านไปแล้ว");
      if (dep.sold + dep.held + dep.reserved > 0 && v.confirm !== true) return failOf("CONFIRM_REQUIRED", undefined, { used: dep.sold + dep.held + dep.reserved });
      const moved = await moveUsesTx(tx, g, dep.id, startsAt, endsAt, now);
      if (moved) abortTx(moved);
      data.startsAt = startsAt;
      data.endsAt = endsAt;
      data.cutoffAt = cutoffAtColumn({ localDate: dep.localDate, startsAt }, pol.t6, g.tz);
    }
    if (v.minPax !== undefined) data.minPax = v.minPax;
    const res = await underSavepoint(tx, () => tx.tripDeparture.updateMany({ where: { id: dep.id, version: dep.version }, data }));
    if (!res.ok) {
      if (pgCodeOf(res.error) === "23505") abortTx(failOf("DUPLICATE_DEPARTURE"));
      throw res.error;
    }
    if (res.value.count !== 1) abortTx(failOf("BUSY"));
    await auditTx(
      tx,
      g,
      "trips.departure.update",
      "TripDeparture",
      dep.id,
      { startsAt: iso(startsAt), endsAt: iso(endsAt), minPax: v.minPax !== undefined ? v.minPax : dep.minPax, confirmed: v.confirm === true },
      { startsAt: iso(dep.startsAt), endsAt: iso(dep.endsAt), minPax: dep.minPax },
    );
    return { ok: true as const, id: dep.id };
  });
}

/** ความจุ = คำสั่งเดียวที่มีเงื่อนไขในตัว (CC §D.1 ข้อ 8) · FULL + เพิ่มความจุ ⇒ สถานะตาม departureStatusAfterCountersSql · ไม่ตั้ง FULL */
export async function setDepartureCapacity(ctx: TripCtx, input: unknown, opts?: TripOpts): Promise<{ ok: true; capacity: number; status: string } | DepartureFail> {
  const g = await gateUnit(ctx, unitIdOf(input), "edit");
  if (isFail(g)) return g;
  const p = capacityInput.safeParse(input);
  if (!p.success) return invalid(p.error);
  const v = p.data;
  const now = nowOf(opts);
  if (!now) return badNow();
  const nowIso = iso(now);
  const capSql = departureCountersUnchangedSql(Prisma.sql`${v.capacity}`);
  const statusSql = departureStatusAfterCountersSql(capSql, { setFull: false });
  const guaranteedAtSql = departureGuaranteedAtAfterCountersSql(capSql, { setFull: false, nowIso });
  return inTx(g, async (tx) => {
    const before = await lockDeparture(tx, g, v.departureId);
    if (!before) return failOf("NOT_FOUND");
    const upd = await underSavepoint(tx, () =>
      tx.$queryRaw<{ capacity: number; status: string; version: number; sold: number; minPax: number | null; productId: string }[]>`
        UPDATE "TripDeparture" SET "capacity" = ${v.capacity}, "status" = ${statusSql}, "guaranteedAt" = ${guaranteedAtSql}, "version" = "version" + 1, "updatedAt" = ${nowIso}::timestamp
        WHERE "id" = ${v.departureId} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" <> 'CANCELLED' AND "sold" + "held" + "reserved" <= ${v.capacity}
        RETURNING "capacity", "status", "version", "sold", "minPax", "productId"`,
    );
    if (!upd.ok && pgCodeOf(upd.error) !== "23514") throw upd.error;
    const row = upd.ok ? upd.value[0] : undefined;
    if (!row) {
      const cur = await lockDeparture(tx, g, v.departureId);
      if (!cur) return failOf("NOT_FOUND");
      if (cur.status === "CANCELLED") return failOf("BAD_STATE", "รอบนี้ยกเลิกแล้ว");
      const used = cur.sold + cur.held + cur.reserved;
      return failOf("CAPACITY_BELOW_USED", `ความจุต้องไม่น้อยกว่า ${used} ที่ (ขาย/ถือไว้แล้ว)`, { used });
    }
    if (row.status !== before.status) {
      await emitDeparture(tx, g, "trips.departure.status_changed", `trips.departure.status_changed:${v.departureId}:${row.version}`, { id: v.departureId, productId: row.productId, status: row.status, sold: row.sold, minPax: row.minPax });
    }
    await auditTx(tx, g, "trips.departure.capacity", "TripDeparture", v.departureId, { capacity: row.capacity, status: row.status }, { capacity: before.capacity, status: before.status });
    return { ok: true as const, capacity: row.capacity, status: row.status };
  });
}

/** ผังสถานะ §4 ข้อ 1 · CAS (status + version) ใต้ล็อกแถวรอบ · FULL/CANCELLED ผ่านทางนี้ไม่ได้ */
export async function setDepartureStatus(ctx: TripCtx, input: unknown, opts?: TripOpts): Promise<{ ok: true; status: string } | DepartureFail> {
  const g = await gateUnit(ctx, unitIdOf(input), "status");
  if (isFail(g)) return g;
  const p = statusInput.safeParse(input);
  if (!p.success) return invalid(p.error);
  const v = p.data;
  const now = nowOf(opts);
  if (!now) return badNow();
  if (v.status === "FULL" || v.status === "CANCELLED") {
    return failOf("FORBIDDEN_TRANSITION", v.status === "FULL" ? "สถานะเต็มตั้งโดยระบบตามยอดจองเท่านั้น" : "ยกเลิกรอบใช้คำสั่งยกเลิกรอบ");
  }
  return inTx(g, async (tx) => {
    const dep = await lockDeparture(tx, g, v.departureId);
    if (!dep) return failOf("NOT_FOUND");
    if (dep.status === v.status) return failOf("BAD_STATE", "รอบอยู่ในสถานะนี้แล้ว");
    if (!canTransitionDeparture(dep.status, v.status, "STAFF")) return failOf("FORBIDDEN_TRANSITION", `เปลี่ยนจาก ${dep.status} เป็น ${v.status} ไม่ได้`);
    if (TRANSITIONS_BEFORE_START.some(([a, b]) => a === dep.status && b === v.status) && dep.startsAt.getTime() <= now.getTime()) {
      return failOf("PAST_DEPARTURE", "รอบนี้เริ่มไปแล้ว เปิดรับ/ยืนยันออกไม่ได้");
    }
    // มติผู้คุม r3: เปิดรับคืน (CLOSED → OPEN) ของรอบที่เคยยืนยันออก (guaranteedAt มีค่า) ⇒ กลับเป็น GUARANTEED · ล้างการยืนยันได้ทางเดียวคือ GUARANTEED → OPEN
    const to = dep.status === "CLOSED" && v.status === "OPEN" && dep.guaranteedAt !== null ? "GUARANTEED" : v.status;
    const r = await casStatus(tx, g, dep, to, now);
    if (!r) return failOf("BAD_STATE");
    return { ok: true as const, status: to };
  });
}

/**
 * CAS สถานะ + event status_changed + audit ใน tx เดียว · คืน false = แถวเปลี่ยนไปแล้ว
 * → GUARANTEED ตั้ง guaranteedAt (ครั้งแรก) · ล้าง guaranteedAt เฉพาะ GUARANTEED → OPEN (ยกเลิกการยืนยันโดยตั้งใจ · มติผู้คุม r3) ในคำสั่งเดียวกัน
 */
async function casStatus(
  tx: Tx,
  g: Gate,
  dep: { id: string; productId: string; status: string; version: number; sold: number; minPax: number | null; guaranteedAt?: Date | null },
  to: string,
  now: Date,
  audit?: { actorType: "USER" | "SYSTEM"; actorId: string | null; requestedBy?: string | null },
): Promise<boolean> {
  const n = await tx.tripDeparture.updateMany({
    where: { id: dep.id, status: dep.status, version: dep.version },
    data: {
      status: to,
      version: { increment: 1 },
      updatedAt: now,
      ...(to === "GUARANTEED" && !dep.guaranteedAt ? { guaranteedAt: now } : {}),
      ...(dep.status === "GUARANTEED" && to === "OPEN" ? { guaranteedAt: null } : {}),
    },
  });
  if (n.count !== 1) return false;
  const version = dep.version + 1;
  const ag: Gate = audit ? { ...g, actorType: audit.actorType, actorId: audit.actorId } : g;
  await emitDeparture(tx, g, "trips.departure.status_changed", `trips.departure.status_changed:${dep.id}:${version}`, { id: dep.id, productId: dep.productId, status: to, sold: dep.sold, minPax: dep.minPax });
  await auditTx(tx, ag, "trips.departure.status", "TripDeparture", dep.id, { status: to, by: ag.actorType, ...(audit?.requestedBy ? { requestedBy: audit.requestedBy } : {}) }, { status: dep.status });
  return true;
}

/** ยกเลิกรอบว่าง (X9): CAS + เงื่อนไขทั้งหมดในคำสั่งเดียว — มีคนจอง/ถือที่ ⇒ HAS_BOOKINGS ไม่เปลี่ยนอะไร (T1.6) */
export async function cancelDeparture(ctx: TripCtx, input: unknown, opts?: TripOpts): Promise<{ ok: true; status: "CANCELLED" } | DepartureFail> {
  const g = await gateUnit(ctx, unitIdOf(input), "status");
  if (isFail(g)) return g;
  const p = cancelInput.safeParse(input);
  if (!p.success) return invalid(p.error, "ต้องระบุเหตุผลการยกเลิกอย่างน้อย 3 ตัวอักษร");
  const v = p.data;
  const now = nowOf(opts);
  if (!now) return badNow();
  const nowIso = iso(now);
  return inTx(g, async (tx) => {
    const dep = await lockDeparture(tx, g, v.departureId);
    if (!dep) return failOf("NOT_FOUND");
    if (!canTransitionDeparture(dep.status, "CANCELLED", "STAFF")) return failOf("FORBIDDEN_TRANSITION", "รอบนี้ยกเลิกแล้ว");
    const rows = await tx.$queryRaw<{ id: string; version: number }[]>`
      UPDATE "TripDeparture" SET "status" = 'CANCELLED', "version" = "version" + 1, "cancelReason" = ${v.reason}, "cancelledAt" = ${nowIso}::timestamp, "updatedAt" = ${nowIso}::timestamp
      WHERE "id" = ${dep.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" = ${dep.status} AND "version" = ${dep.version}
        AND "sold" = 0 AND "held" = 0 AND "reserved" = 0
        AND NOT EXISTS (SELECT 1 FROM "TripHold" h WHERE h."tenantId" = ${g.tenantId} AND h."unitId" = ${g.unitId} AND h."departureId" = ${dep.id} AND h."status" = 'ACTIVE')
        AND NOT EXISTS (SELECT 1 FROM "TripBooking" b WHERE b."tenantId" = ${g.tenantId} AND b."unitId" = ${g.unitId} AND b."departureId" = ${dep.id}
                          AND b."status" IN ('HOLD', 'PENDING', 'CONFIRMED', 'PART_PAID', 'PAID'))
      RETURNING "id", "version"`;
    if (rows.length !== 1) return failOf("HAS_BOOKINGS", undefined, { used: dep.sold + dep.held + dep.reserved });
    await releaseUsesTx(tx, g, dep.id, now);
    await emitDeparture(tx, g, "trips.departure.cancelled", `trips.departure.cancelled:${dep.id}`, { id: dep.id, productId: dep.productId, status: "CANCELLED", sold: dep.sold, minPax: dep.minPax });
    await auditTx(tx, g, "trips.departure.cancel", "TripDeparture", dep.id, { status: "CANCELLED", reason: v.reason }, { status: dep.status });
    return { ok: true as const, status: "CANCELLED" as const };
  });
}

export async function getDeparture(ctx: TripCtx, input: unknown, opts?: TripOpts): Promise<{ ok: true; departure: DepartureDTO } | DepartureFail> {
  const g = await gateUnit(ctx, unitIdOf(input), "read");
  if (isFail(g)) return g;
  const p = depRefInput.safeParse(input);
  if (!p.success) return invalid(p.error);
  const now = nowOf(opts);
  if (!now) return badNow();
  const row = await unitDb(g).tripDeparture.findFirst({ where: { id: p.data.departureId }, select: DEP_SELECT });
  if (!row) return failOf("NOT_FOUND");
  const [departure] = await toDtos(g, [row], now);
  return { ok: true, departure };
}

export async function listDepartures(ctx: TripCtx, input: unknown, opts?: TripOpts): Promise<{ ok: true; items: DepartureDTO[] } | DepartureFail> {
  const g = await gateUnit(ctx, unitIdOf(input), "read");
  if (isFail(g)) return g;
  const p = listDeparturesInput.safeParse(input);
  if (!p.success) return invalid(p.error);
  const v = p.data;
  const now = nowOf(opts);
  if (!now) return badNow();
  if (v.from > v.to) return failOf("INVALID_INPUT", "วันเริ่มต้องไม่หลังวันสิ้นสุด");
  if (inclusiveDays(v.from, v.to) > READ_SPAN_MAX_DAYS) return failOf("INVALID_INPUT", `ช่วงวันที่อ่านได้ไม่เกิน ${READ_SPAN_MAX_DAYS} วัน`);
  const rows = await unitDb(g).tripDeparture.findMany({
    where: { localDate: { gte: dbDate(v.from), lte: dbDate(v.to) }, ...(v.productId ? { productId: v.productId } : {}), ...(v.status ? { status: v.status } : {}) },
    select: DEP_SELECT,
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
  });
  return { ok: true, items: await toDtos(g, rows, now) };
}

/** คำนวณ cutoffAt ใหม่ให้รอบอนาคตที่ไม่ CANCELLED (หลังเปลี่ยนค่าตั้ง T6) · ค่าตั้งต่อสินค้า + รอบที่มีค่าตั้งของตัวเอง · UPDATE ทีละชุด · updated = แถวที่ค่าเปลี่ยน */
const REFRESH_BATCH = 500;
export async function refreshDeparturePolicy(ctx: TripCtx, input: unknown, opts?: TripOpts): Promise<{ ok: true; updated: number } | DepartureFail> {
  const g = await gateUnit(ctx, unitIdOf(input), "edit");
  if (isFail(g)) return g;
  const p = refreshInput.safeParse(input);
  if (!p.success) return invalid(p.error);
  const now = nowOf(opts);
  if (!now) return badNow();
  const db = unitDb(g);
  const rows = await db.tripDeparture.findMany({
    where: { status: { not: "CANCELLED" }, startsAt: { gt: now }, ...(p.data.productId ? { productId: p.data.productId } : {}) },
    select: { id: true, productId: true, localDate: true, startsAt: true, cutoffAt: true },
    orderBy: { id: "asc" },
  });
  const pols = await departurePolicies(g, rows);
  const changes = rows
    .map((r, i) => ({ r, cutoffAt: cutoffAtColumn({ localDate: ymdOf(r.localDate), startsAt: r.startsAt }, pols[i].t6, g.tz) }))
    .filter((x) => x.r.cutoffAt?.getTime() !== x.cutoffAt.getTime());
  let updated = 0;
  const nowIso = iso(now);
  const batches = chunksOf(changes, REFRESH_BATCH);
  for (const [i, part] of batches.entries()) {
    // ชุดละธุรกรรม: คำสั่งเดียว + audit ของชุดนั้นใน tx เดียวกัน · ไม่แตะรอบที่ถูกยกเลิก/ย้ายเวลาระหว่างนั้น (startsAt ต้องเท่าเดิม)
    const r = await inTx(g, async (tx) => {
      const n = await tx.$executeRaw`
        UPDATE "TripDeparture" AS d SET "cutoffAt" = v.c::timestamp, "updatedAt" = ${nowIso}::timestamp
        FROM unnest(${part.map((x) => x.r.id)}::text[], ${part.map((x) => iso(x.cutoffAt))}::text[], ${part.map((x) => iso(x.r.startsAt))}::text[]) AS v(id, c, s)
        WHERE d."id" = v.id AND d."tenantId" = ${g.tenantId} AND d."unitId" = ${g.unitId} AND d."status" <> 'CANCELLED' AND d."startsAt" = v.s::timestamp`;
      if (n) {
        const after = { updated: n, batch: i + 1, batches: batches.length };
        if (p.data.productId) await auditTx(tx, g, "trips.departure.refresh", "TripProduct", p.data.productId, after);
        else await auditTx(tx, g, "trips.departure.refresh", "BusinessUnit", g.unitId, after);
      }
      return n;
    });
    if (isFail(r)) return r;
    updated += r;
  }
  return { ok: true, updated };
}

/** หยุดขายระดับช่องทางของร้าน (null = ล้าง) · agentAccountIds = A1.4 (ยังไม่รองรับ) */
export async function setDepartureStopSell(ctx: TripCtx, input: unknown, opts?: TripOpts): Promise<{ ok: true; id: string } | DepartureFail> {
  const g = await gateUnit(ctx, unitIdOf(input), "edit");
  if (isFail(g)) return g;
  const p = stopSellInput.safeParse(input);
  if (!p.success) return invalid(p.error);
  const s = tripDepartureStopSellSchema.safeParse(p.data.stopSell);
  if (!s.success) return invalid(s.error);
  if (s.data && s.data.agentAccountIds !== undefined) return failOf("AGENT_STOP_SELL_NOT_SUPPORTED");
  const now = nowOf(opts);
  if (!now) return badNow();
  const value = s.data ? toJson({ channels: s.data.channels, reason: s.data.reason, ...(s.data.until ? { until: s.data.until } : {}) }) : null;
  const departureId = p.data.departureId;
  return inTx(g, async (tx) => {
    const dep = await lockDeparture(tx, g, departureId);
    if (!dep) return failOf("NOT_FOUND");
    if (dep.status === "CANCELLED") return failOf("BAD_STATE", "รอบนี้ยกเลิกแล้ว");
    await tx.tripDeparture.updateMany({ where: { id: dep.id }, data: { stopSell: value ?? Prisma.DbNull, version: { increment: 1 }, updatedAt: now } });
    await auditTx(tx, g, "trips.departure.stopSell", "TripDeparture", dep.id, { stopSell: value });
    return { ok: true as const, id: dep.id };
  });
}

// ═══════════════════════ ขั้นต่ำ ณ เวลาตัดสิน ═══════════════════════
export type MinPaxFailure = { departureId: string; code: string };
export type MinPaxResult = { checked: number; guaranteed: string[]; belowMin: string[]; failed: MinPaxFailure[] };
/**
 * รอบ OPEN ที่ minPax ไม่ null และ decisionAt ≤ now < startsAt (T7 ที่ {unit, product, departure} ตอนประเมิน):
 *   sold ≥ minPax ⇒ CAS OPEN→GUARANTEED (SYSTEM) + status_changed · ไม่ถึง ⇒ below_min ครั้งเดียว (คีย์ id + decisionAt)
 * อ่านเฉพาะรอบที่ "ถึงเวลาตัดสินแล้ว": ต่อสินค้า localDate ∈ [วันนี้ − 1, วันนี้ + decideDaysBefore + 1] สถานะ OPEN
 *   (ดัชนี "TripDeparture_productId_localDate_status_idx" = @@index([productId, localDate, status])) + รอบที่มีค่าตั้ง T7 ชั้นรอบของตัวเอง
 * ต่ำกว่าขั้นต่ำและ event ออกแล้ว ⇒ ไม่เปิด tx/ไม่ล็อกซ้ำ · ต่อรอบ = tx + ล็อกแถว ⇒ งานซ้อนกัน = ผลเดียว · รอบที่ล้ม = จดแล้วไปต่อ
 */
export async function evaluateMinPaxCore(
  g: Gate,
  now: Date,
  signal?: AbortSignal,
  audit?: { actorType: "USER" | "SYSTEM"; actorId: string | null; requestedBy?: string | null },
): Promise<MinPaxResult> {
  const db = unitDb(g);
  const today = utcToLocal(g.tz, now).ymd;
  const lo = dbDate(addDaysYmd(today, -1));
  const products = (await db.tripProduct.findMany({ select: { id: true }, orderBy: { id: "asc" } })).map((x) => x.id);
  const prodPol = await productPolicies(g, products);
  const DUE_SELECT = { id: true, productId: true, localDate: true, startsAt: true, sold: true, minPax: true } as const;
  type DueRow = Prisma.TripDepartureGetPayload<{ select: typeof DUE_SELECT }>;
  const cand = new Map<string, DueRow>();
  for (const productId of products) {
    const pol = prodPol.get(productId);
    if (!pol) continue;
    const hi = dbDate(addDaysYmd(today, pol.t7.decideDaysBefore + 1));
    const rows = await db.tripDeparture.findMany({
      where: { productId, localDate: { gte: lo, lte: hi }, status: "OPEN", minPax: { not: null }, startsAt: { gt: now } },
      select: DUE_SELECT,
    });
    for (const r of rows) cand.set(r.id, r);
  }
  // รอบที่มีค่าตั้ง T7 ชั้นรอบของตัวเอง (อาจตัดสินเร็วกว่าค่าของสินค้า)
  const overRows = await tenantDb({ tenantId: g.tenantId }).settingValue.findMany({ where: { key: T7_KEY, scope: "DEPARTURE" }, select: { scopeId: true }, distinct: ["scopeId"] });
  for (const part of chunksOf(overRows.map((x) => x.scopeId).filter((id) => !cand.has(id)), ID_BATCH)) {
    const rows = await db.tripDeparture.findMany({ where: { id: { in: part }, status: "OPEN", minPax: { not: null }, startsAt: { gt: now } }, select: DUE_SELECT });
    for (const r of rows) cand.set(r.id, r);
  }
  const list = [...cand.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || (a.id < b.id ? -1 : 1));
  const pols = await departurePolicies(g, list);
  const due = list
    .map((r, i) => ({ r, decisionAt: decisionAtFor({ localDate: ymdOf(r.localDate), startsAt: r.startsAt }, pols[i].t7, g.tz) }))
    .filter((x) => x.decisionAt.getTime() <= now.getTime());
  const out: MinPaxResult = { checked: due.length, guaranteed: [], belowMin: [], failed: [] };
  // ต่ำกว่าขั้นต่ำที่ event ออกแล้ว ⇒ ไม่เปิด tx (ไม่ล็อกแถวซ้ำทุกรอบ)
  const belowKeys = due.filter((x) => x.r.minPax !== null && x.r.sold < x.r.minPax).map((x) => belowMinKey(x.r.id, x.decisionAt));
  const emitted = new Set<string>();
  for (const part of chunksOf(belowKeys, ID_BATCH)) {
    const rows = await tenantDb({ tenantId: g.tenantId }).outboxEvent.findMany({ where: { idempotencyKey: { in: part } }, select: { idempotencyKey: true } });
    for (const r of rows) emitted.add(r.idempotencyKey);
  }
  for (const { r, decisionAt } of due) {
    if (signal?.aborted) break;
    if (r.minPax !== null && r.sold < r.minPax && emitted.has(belowMinKey(r.id, decisionAt))) {
      out.belowMin.push(r.id);
      continue;
    }
    try {
      const res = await inTx(g, async (tx) => {
        const dep = await lockDeparture(tx, g, r.id);
        if (!dep || dep.status !== "OPEN" || dep.minPax === null || dep.startsAt.getTime() <= now.getTime()) return "SKIP" as const;
        if (dep.sold >= dep.minPax) return (await casStatus(tx, g, dep, "GUARANTEED", now, audit)) ? ("GUARANTEED" as const) : ("SKIP" as const);
        await emitDeparture(tx, g, "trips.departure.below_min", belowMinKey(dep.id, decisionAt), dep);
        return "BELOW" as const;
      });
      if (res === "GUARANTEED") out.guaranteed.push(r.id);
      else if (res === "BELOW") out.belowMin.push(r.id);
      else if (isFail(res)) out.failed.push({ departureId: r.id, code: res.code });
    } catch (e) {
      out.failed.push({ departureId: r.id, code: errorCodeOf(e) });
    }
  }
  return out;
}

/** รหัสสั้นของ error (ไม่มีข้อความดิบ/ข้อมูลบุคคล) สำหรับรายงานของงานตามเวลา */
export function errorCodeOf(e: unknown): string {
  if (e instanceof TripSettingsInvalidError) return e.code;
  if (e instanceof TripProductNotSellableError) return e.code;
  const pg = pgCodeOf(e);
  if (pg) return pg;
  const code = typeof e === "object" && e !== null ? (e as { code?: unknown }).code : undefined;
  if (typeof code === "string" && /^[A-Z0-9_]{2,40}$/.test(code)) return code;
  return e instanceof Error && /^[A-Za-z]{1,40}$/.test(e.name) ? e.name : "ERROR";
}

/** ประเมินขั้นต่ำของหน่วย (สิทธิ์ status) — การเปลี่ยนเป็น GUARANTEED เป็นการเปลี่ยนของระบบ (§4 ข้อ 1) ⇒ audit actorType SYSTEM + requestedBy = ผู้สั่ง */
export async function evaluateMinPax(ctx: TripCtx, input: unknown, opts?: TripOpts): Promise<{ ok: true; guaranteed: string[]; belowMin: string[] } | DepartureFail> {
  const g = await gateUnit(ctx, unitIdOf(input), "status");
  if (isFail(g)) return g;
  const p = unitOnlyInput.safeParse(input);
  if (!p.success) return invalid(p.error);
  const now = nowOf(opts);
  if (!now) return badNow();
  const r = await evaluateMinPaxCore(g, now, undefined, { actorType: "SYSTEM", actorId: null, requestedBy: g.actorId });
  return { ok: true, guaranteed: r.guaranteed, belowMin: r.belowMin };
}

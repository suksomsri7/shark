// ─────────────────────────────────────────────────────────────
// trips/departures.ts — กฎซ้ำ · รอบ · สถานะ · ความจุ · ขั้นต่ำ · ปิดรับ · หยุดขาย · RUN TRIPS T0.3
// ใบสั่ง ledger/trips-briefs/T0.3.md §2 §3.1 §3.2 §4 §6 §7 (มติ §12 ชนะ)
//
// 🔴 tenantDb เท่านั้น (ไม่มี prisma ดิบ · F5 +0) · SQL ดิบใส่ "tenantId" + "unitId" เองทุกคำสั่ง · ตรวจจำนวนแถว
// 🔴 ตัวนับ sold/held/reserved อ่านอย่างเดียว · ใบนี้ไม่ตั้ง FULL · ความจุ = คำสั่งเดียวที่มีเงื่อนไขในตัว (CC §D.1 ข้อ 8)
// 🔴 ลำดับล็อก: แถวรอบ (FOR UPDATE) ก่อนแถวใช้ทรัพยากร (เรียง id) — CC §D.5 · ไม่ขอ connection ที่สองระหว่างถือ tx
// 🔴 เก็บ UTC · localDate = วันของร้าน ตั้งครั้งเดียว · ตัวเลขธุรกิจจากค่าตั้ง T6 T7 T8 หรือ input
// 🔴 ไม่ลบแถว Trip* · ไม่ส่ง object ของผู้ใช้เข้า update({data}) ตรง ๆ (zod เลือกฟิลด์ · TRIPS-RUN §3)
// ─────────────────────────────────────────────────────────────
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { emitOutbox } from "@/lib/core/outbox";
import { SELL_CHANNELS } from "@/lib/core/sellable";
import { resolveSettings, resolveSettingsMany } from "@/lib/core/settings";
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
  type ExpandedDay,
  type ScheduleShape,
  type T6Value,
  type T7Value,
} from "./departures-core";
import {
  ID,
  abortTx,
  assignUseTx,
  auditTx,
  checkResources,
  findClash,
  gateUnit,
  inTx,
  isFail,
  lockDeparture,
  moveUsesTx,
  pgCodeOf,
  releaseUsesTx,
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

function settingOf<T>(schema: z.ZodType<T>, key: string, v: unknown): T {
  const p = schema.safeParse(v);
  if (!p.success) throw new Error(`ค่าตั้ง ${key} ผิดรูป`);
  return p.data;
}
type Refs = { unitId: string; productId?: string; departureId?: string };
type Policy = { t6: T6Value; t7: T7Value; t8: number | null };
async function policyAt(tenantId: string, refs: Refs): Promise<Policy> {
  const r = await resolveSettings({ tenantId }, [T6_KEY, T7_KEY, T8_KEY], refs);
  return { t6: settingOf(T6S, T6_KEY, r[T6_KEY]?.value), t7: settingOf(T7S, T7_KEY, r[T7_KEY]?.value), t8: settingOf(T8S, T8_KEY, r[T8_KEY]?.value) };
}
async function policiesAt(tenantId: string, refsList: Refs[]): Promise<{ t6: T6Value; t7: T7Value }[]> {
  if (!refsList.length) return [];
  const rs = await resolveSettingsMany({ tenantId }, [T6_KEY, T7_KEY], refsList);
  return rs.map((r) => ({ t6: settingOf(T6S, T6_KEY, r[T6_KEY]?.value), t7: settingOf(T7S, T7_KEY, r[T7_KEY]?.value) }));
}

// ═══════════════════════ ชนิด · ตัวช่วย ═══════════════════════
const MS_PER_MIN = 60_000;
const READ_SPAN_MAX_DAYS = 62;
const YMD = z.string().refine(isYmd, { message: "วันที่ต้องเป็นรูปแบบ ปปปป-ดด-วว และเป็นวันที่มีจริง" });
const MIN_OF_DAY = z.number().int().min(0).max(MIN_PER_DAY - 1);
const CAPACITY = z.number().int().min(1);
const MIN_PAX = z.number().int().min(1).nullable();
const DURATION = z.number().int().min(1);
const RESOURCE_IDS = z.array(ID).max(50);

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
function inclusiveDays(from: string, to: string): number {
  return Math.round((dbDate(to).getTime() - dbDate(from).getTime()) / (MIN_PER_DAY * MS_PER_MIN)) + 1;
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

/** สินค้า + ตัวเลือกของหน่วยนี้ · ARCHIVED ⇒ PRODUCT_ARCHIVED · ไม่อยู่หน่วย/ตัวเลือกไม่ใช่ของสินค้า ⇒ NOT_FOUND */
async function productOption(g: Gate, productId: string, optionId: string): Promise<{ durationMin: number | null; nights: number | null } | DepartureFail> {
  const db = unitDb(g);
  const product = await db.tripProduct.findFirst({ where: { id: productId }, select: { id: true, status: true } });
  if (!product) return failOf("NOT_FOUND", "ไม่พบสินค้าในหน่วยนี้");
  const option = await db.tripOption.findFirst({ where: { id: optionId, productId }, select: { durationMin: true, nights: true } });
  if (!option) return failOf("NOT_FOUND", "ไม่พบตัวเลือกของสินค้านี้");
  if (product.status === "ARCHIVED") return failOf("PRODUCT_ARCHIVED");
  return option;
}
/** ระยะเวลา (นาที) = input ?? option.durationMin ?? option.nights × 1440 · ไม่มี/≤ 0 ⇒ null (NO_DURATION · CHECK endsAt > startsAt) */
function durationOf(input: number | undefined, option: { durationMin: number | null; nights: number | null }): number | null {
  const d = input ?? option.durationMin ?? (option.nights ? option.nights * MIN_PER_DAY : null);
  return d !== null && d > 0 ? d : null;
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
/** INSERT รอบใต้ SAVEPOINT · ชน unique (NND · scheduleId+localDate) ⇒ "DUPLICATE" (ไม่ล้ม tx) */
async function insertDepartureTx(tx: Tx, g: Gate, d: NewDeparture): Promise<{ id: string } | "DUPLICATE"> {
  const dup = await tx.tripDeparture.findFirst({
    where: { OR: [{ productId: d.productId, optionId: d.optionId, startsAt: d.startsAt }, ...(d.scheduleId ? [{ scheduleId: d.scheduleId, localDate: dbDate(d.localDate) }] : [])] },
    select: { id: true },
  });
  if (dup) return "DUPLICATE";
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
  if (pgCodeOf(res.error) === "23505") return "DUPLICATE";
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
  const uses = await db.tripResourceUse.findMany({
    where: { departureId: { in: rows.map((r) => r.id) }, active: true },
    select: { departureId: true, resourceId: true },
    orderBy: { id: "asc" },
  });
  const res = uses.length
    ? await db.tripResource.findMany({ where: { id: { in: [...new Set(uses.map((u) => u.resourceId))] } }, select: { id: true, kind: true, name: true } })
    : [];
  const resById = new Map(res.map((r) => [r.id, r]));
  const pols = await policiesAt(g.tenantId, rows.map((r) => ({ unitId: g.unitId, productId: r.productId, departureId: r.id })));
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
      resources: uses
        .filter((u) => u.departureId === r.id)
        .map((u) => ({ resourceId: u.resourceId, kind: resById.get(u.resourceId)?.kind ?? "OTHER", name: resById.get(u.resourceId)?.name ?? "" })),
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
  rule: tripScheduleRuleSchema,
  exceptions: tripScheduleExceptionsSchema.optional(),
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
  rule: tripScheduleRuleSchema.optional(),
  exceptions: tripScheduleExceptionsSchema.optional(),
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

export async function createSchedule(ctx: TripCtx, input: unknown): Promise<{ ok: true; id: string } | DepartureFail> {
  const g = await gateUnit(ctx, unitIdOf(input), "edit");
  if (isFail(g)) return g;
  const p = createScheduleInput.safeParse(input);
  if (!p.success) return invalid(p.error);
  const v = p.data;
  if (v.dateTo && v.dateFrom > v.dateTo) return failOf("INVALID_INPUT", "วันเริ่มต้องไม่หลังวันสิ้นสุด");
  const po = await productOption(g, v.productId, v.optionId);
  if (isFail(po)) return po;
  if (durationOf(undefined, po) === null) return failOf("NO_DURATION");
  const resourceIds = [...new Set(v.resourceIds ?? [])];
  return inTx(g, async (tx) => {
    const bad = await checkResources(tx, resourceIds);
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

export async function updateSchedule(ctx: TripCtx, input: unknown, opts?: TripOpts): Promise<{ ok: true; id: string; mismatched: string[] } | DepartureFail> {
  const g = await gateUnit(ctx, unitIdOf(input), "edit");
  if (isFail(g)) return g;
  const p = updateScheduleInput.safeParse(input);
  if (!p.success) return invalid(p.error);
  const v = p.data;
  const now = opts?.now ?? new Date();
  const cur = await unitDb(g).tripSchedule.findFirst({ where: { id: v.scheduleId } });
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
  const resourceIds = v.resourceIds ? [...new Set(v.resourceIds)] : null;
  return inTx(g, async (tx) => {
    if (resourceIds) {
      const bad = await checkResources(tx, resourceIds);
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
    // รอบอนาคตของกฎนี้ (ไม่ CANCELLED) ที่ไม่ตรงกฎใหม่ — แจ้งอย่างเดียว ไม่แก้รอบเดิม
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
        const w = want.get(ymdOf(d.localDate));
        if (!w || utcToLocal(g.tz, d.startsAt).minutes !== w.departTimeMin) mismatched.push(d.id);
      }
    }
    await auditTx(tx, g, "trips.schedule.update", "TripSchedule", v.scheduleId, { rule: toJson(next.rule), mismatched: mismatched.length });
    return { ok: true as const, id: v.scheduleId, mismatched };
  });
}

async function setPaused(ctx: TripCtx, input: unknown, pause: boolean, now: Date): Promise<{ ok: true; id: string } | DepartureFail> {
  const g = await gateUnit(ctx, unitIdOf(input), "edit");
  if (isFail(g)) return g;
  const p = scheduleRefInput.safeParse(input);
  if (!p.success) return invalid(p.error);
  const v = p.data;
  return inTx(g, async (tx) => {
    const n = await tx.tripSchedule.updateMany({ where: { id: v.scheduleId, pausedAt: pause ? null : { not: null } }, data: { pausedAt: pause ? now : null } });
    if (n.count !== 1) {
      const exists = await tx.tripSchedule.findFirst({ where: { id: v.scheduleId }, select: { id: true } });
      return exists ? failOf("BAD_STATE", pause ? "กฎนี้พักอยู่แล้ว" : "กฎนี้ไม่ได้พักอยู่") : failOf("NOT_FOUND");
    }
    await auditTx(tx, g, pause ? "trips.schedule.pause" : "trips.schedule.resume", "TripSchedule", v.scheduleId, { paused: pause });
    return { ok: true as const, id: v.scheduleId };
  });
}
export async function pauseSchedule(ctx: TripCtx, input: unknown, opts?: TripOpts) {
  return setPaused(ctx, input, true, opts?.now ?? new Date());
}
export async function resumeSchedule(ctx: TripCtx, input: unknown, opts?: TripOpts) {
  return setPaused(ctx, input, false, opts?.now ?? new Date());
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

export type MaterializeResult = { ok: true; created: string[]; conflicts: { localDate: string; resourceId: string; departureId: string }[]; windowEnd: string };
class SkipDay extends Error {
  constructor(readonly conflict: { localDate: string; resourceId: string; departureId: string } | null) {
    super("skip-day");
  }
}

/**
 * สร้างรอบจากกฎ (ตรรกะเดียวของ action + งานรายวัน) — หน้าต่าง [max(dateFrom, วันนี้), min(dateTo+1, วันนี้ + T8)) ของร้าน
 * idempotent: ธุรกรรมเดียวต่อกฎ + pg_advisory_xact_lock · วันที่มีรอบของกฎแล้ว (สถานะใดก็ได้) = ข้าม · ชน unique = ข้าม (savepoint)
 * ทรัพยากรชน ⇒ ไม่สร้างวันนั้น + conflicts · ข้ามวันที่ startsAt ≤ now
 */
export async function materializeCore(g: Gate, scheduleId: string, now: Date): Promise<MaterializeResult | DepartureFail> {
  const s = await unitDb(g).tripSchedule.findFirst({ where: { id: scheduleId } });
  if (!s) return failOf("NOT_FOUND");
  if (s.pausedAt) return failOf("SCHEDULE_PAUSED");
  const shape = shapeOf(s);
  if (!shape) return failOf("INVALID_INPUT", "กฎผิดรูป");
  if (!s.optionId) return failOf("NO_DURATION");
  const po = await productOption(g, s.productId, s.optionId);
  if (isFail(po)) return po;
  const dur = durationOf(undefined, po);
  if (dur === null) return failOf("NO_DURATION");
  const pol = await policyAt(g.tenantId, { unitId: g.unitId, productId: s.productId });
  if (pol.t8 === null) return failOf("HORIZON_OFF");
  const today = utcToLocal(g.tz, now).ymd;
  const windowEnd = addDaysYmd(today, pol.t8);
  const days: ExpandedDay[] = expandSchedule(shape, { fromYmd: today, toYmdExclusive: windowEnd });
  const optionId = s.optionId;
  const resourceIds = [...new Set(s.resourceIds)];
  return inTx(g, async (tx) => {
    await tx.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtext(${`trips-schedule:${s.id}`}))`;
    const have = new Set((await tx.tripDeparture.findMany({ where: { scheduleId: s.id }, select: { localDate: true } })).map((d) => ymdOf(d.localDate)));
    const created: string[] = [];
    const conflicts: MaterializeResult["conflicts"] = [];
    for (const day of days) {
      if (have.has(day.localDate)) continue;
      const startsAt = localToUtc(g.tz, day.localDate, day.departTimeMin);
      if (startsAt.getTime() <= now.getTime()) continue;
      const endsAt = new Date(startsAt.getTime() + dur * MS_PER_MIN);
      let clashed = false;
      for (const r of resourceIds) {
        const c = await findClash(tx, g, r, startsAt, endsAt, null);
        if (c) {
          conflicts.push({ localDate: day.localDate, resourceId: r, departureId: c.departureId });
          clashed = true;
        }
      }
      if (clashed) continue;
      const minPax = day.minPax !== undefined ? day.minPax : pol.t7.minPax;
      const res = await underSavepoint(tx, async () => {
        const ins = await insertDepartureTx(tx, g, {
          productId: s.productId,
          optionId,
          scheduleId: s.id,
          localDate: day.localDate,
          startsAt,
          endsAt,
          capacity: day.capacity,
          minPax,
          cutoffAt: cutoffAtColumn({ localDate: day.localDate, startsAt }, pol.t6, g.tz),
        });
        if (ins === "DUPLICATE") throw new SkipDay(null);
        for (const r of resourceIds) {
          const a = await assignUseTx(tx, g, { id: ins.id, startsAt, endsAt }, r);
          if (!a.ok) throw new SkipDay(a.conflict ? { localDate: day.localDate, resourceId: r, departureId: a.conflict.departureId } : null);
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
      await auditTx(tx, g, "trips.schedule.materialize", "TripSchedule", s.id, { created: created.length, conflicts: conflicts.length, windowEnd });
    }
    return { ok: true as const, created, conflicts, windowEnd };
  });
}

export async function materializeSchedule(ctx: TripCtx, input: unknown, opts?: TripOpts): Promise<MaterializeResult | DepartureFail> {
  const g = await gateUnit(ctx, unitIdOf(input), "edit");
  if (isFail(g)) return g;
  const p = scheduleRefInput.safeParse(input);
  if (!p.success) return invalid(p.error);
  return materializeCore(g, p.data.scheduleId, opts?.now ?? new Date());
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
const capacityInput = z.strictObject({ unitId: ID, departureId: ID, capacity: z.number().int().min(0) });
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
  const now = opts?.now ?? new Date();
  const po = await productOption(g, v.productId, v.optionId);
  if (isFail(po)) return po;
  const dur = durationOf(v.durationMin, po);
  if (dur === null) return failOf("NO_DURATION");
  const startsAt = localToUtc(g.tz, v.localDate, v.departTimeMin);
  if (startsAt.getTime() <= now.getTime()) return failOf("PAST_DEPARTURE", "เวลาออกของรอบนี้ผ่านไปแล้ว");
  const endsAt = new Date(startsAt.getTime() + dur * MS_PER_MIN);
  const pol = await policyAt(g.tenantId, { unitId: g.unitId, productId: v.productId });
  const minPax = v.minPax !== undefined ? v.minPax : pol.t7.minPax;
  const resourceIds = [...new Set(v.resourceIds ?? [])];
  return inTx(g, async (tx) => {
    const bad = await checkResources(tx, resourceIds);
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
    if (ins === "DUPLICATE") return failOf("DUPLICATE_DEPARTURE");
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
  const now = opts?.now ?? new Date();
  const head = await unitDb(g).tripDeparture.findFirst({ where: { id: v.departureId }, select: { productId: true, localDate: true } });
  if (!head) return failOf("NOT_FOUND");
  const pol = await policyAt(g.tenantId, { unitId: g.unitId, productId: head.productId, departureId: v.departureId });
  return inTx(g, async (tx) => {
    const dep = await lockDeparture(tx, g, v.departureId);
    if (!dep) return failOf("NOT_FOUND");
    if (dep.status === "CANCELLED") return failOf("BAD_STATE", "รอบนี้ยกเลิกแล้ว");
    if (dep.startsAt.getTime() <= now.getTime()) return failOf("PAST_DEPARTURE");
    const startsAt = v.departTimeMin !== undefined ? localToUtc(g.tz, dep.localDate, v.departTimeMin) : dep.startsAt;
    const dur = v.durationMin ?? Math.round((dep.endsAt.getTime() - dep.startsAt.getTime()) / MS_PER_MIN);
    const endsAt = new Date(startsAt.getTime() + dur * MS_PER_MIN);
    const timeChanged = startsAt.getTime() !== dep.startsAt.getTime() || endsAt.getTime() !== dep.endsAt.getTime();
    const data: Prisma.TripDepartureUpdateManyMutationInput = { version: { increment: 1 } };
    if (timeChanged) {
      if (startsAt.getTime() <= now.getTime()) return failOf("PAST_DEPARTURE", "เวลาใหม่ผ่านไปแล้ว");
      if (dep.sold + dep.held + dep.reserved > 0 && v.confirm !== true) return failOf("CONFIRM_REQUIRED", undefined, { used: dep.sold + dep.held + dep.reserved });
      const moved = await moveUsesTx(tx, g, dep.id, startsAt, endsAt);
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
    await auditTx(tx, g, "trips.departure.update", "TripDeparture", dep.id, {
      startsAt: iso(startsAt),
      endsAt: iso(endsAt),
      minPax: v.minPax !== undefined ? v.minPax : dep.minPax,
      confirmed: v.confirm === true,
    }, { startsAt: iso(dep.startsAt), endsAt: iso(dep.endsAt), minPax: dep.minPax });
    return { ok: true as const, id: dep.id };
  });
}

/** ความจุ = คำสั่งเดียวที่มีเงื่อนไขในตัว (CC §D.1 ข้อ 8) · FULL + เพิ่มความจุ ⇒ OPEN/GUARANTEED ในคำสั่งเดียวกัน · ไม่ตั้ง FULL */
export async function setDepartureCapacity(ctx: TripCtx, input: unknown): Promise<{ ok: true; capacity: number; status: string } | DepartureFail> {
  const g = await gateUnit(ctx, unitIdOf(input), "edit");
  if (isFail(g)) return g;
  const p = capacityInput.safeParse(input);
  if (!p.success) return invalid(p.error);
  const v = p.data;
  const nowIso = iso(new Date());
  return inTx(g, async (tx) => {
    const before = await lockDeparture(tx, g, v.departureId);
    if (!before) return failOf("NOT_FOUND");
    const upd = await underSavepoint(tx, () =>
      tx.$queryRaw<{ capacity: number; status: string; version: number; sold: number; minPax: number | null; productId: string }[]>`
        UPDATE "TripDeparture" SET "capacity" = ${v.capacity}, "status" = CASE WHEN "status" = 'FULL' AND "sold" + "held" + "reserved" < ${v.capacity}
          THEN (CASE WHEN "minPax" IS NOT NULL AND "sold" >= "minPax" THEN 'GUARANTEED' ELSE 'OPEN' END) ELSE "status" END,
          "version" = "version" + 1, "updatedAt" = ${nowIso}::timestamp
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
  const now = opts?.now ?? new Date();
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
    const r = await casStatus(tx, g, dep, v.status, now);
    if (!r) return failOf("BAD_STATE");
    return { ok: true as const, status: v.status };
  });
}

/** CAS สถานะ + event status_changed + audit ใน tx เดียว · คืน false = แถวเปลี่ยนไปแล้ว */
async function casStatus(tx: Tx, g: Gate, dep: { id: string; productId: string; status: string; version: number; sold: number; minPax: number | null }, to: string, now: Date): Promise<boolean> {
  const n = await tx.tripDeparture.updateMany({
    where: { id: dep.id, status: dep.status, version: dep.version },
    data: { status: to, version: { increment: 1 }, ...(to === "GUARANTEED" ? { guaranteedAt: now } : {}) },
  });
  if (n.count !== 1) return false;
  const version = dep.version + 1;
  await emitDeparture(tx, g, "trips.departure.status_changed", `trips.departure.status_changed:${dep.id}:${version}`, { id: dep.id, productId: dep.productId, status: to, sold: dep.sold, minPax: dep.minPax });
  await auditTx(tx, g, "trips.departure.status", "TripDeparture", dep.id, { status: to, by: g.actorType }, { status: dep.status });
  return true;
}

/** ยกเลิกรอบว่าง (X9): CAS + เงื่อนไขทั้งหมดในคำสั่งเดียว — มีคนจอง/ถือที่ ⇒ HAS_BOOKINGS ไม่เปลี่ยนอะไร (T1.6) */
export async function cancelDeparture(ctx: TripCtx, input: unknown, opts?: TripOpts): Promise<{ ok: true; status: "CANCELLED" } | DepartureFail> {
  const g = await gateUnit(ctx, unitIdOf(input), "status");
  if (isFail(g)) return g;
  const p = cancelInput.safeParse(input);
  if (!p.success) return invalid(p.error, "ต้องระบุเหตุผลการยกเลิกอย่างน้อย 3 ตัวอักษร");
  const v = p.data;
  const nowIso = iso(opts?.now ?? new Date());
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
    await releaseUsesTx(tx, g, dep.id);
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
  const row = await unitDb(g).tripDeparture.findFirst({ where: { id: p.data.departureId }, select: DEP_SELECT });
  if (!row) return failOf("NOT_FOUND");
  const [departure] = await toDtos(g, [row], opts?.now ?? new Date());
  return { ok: true, departure };
}

export async function listDepartures(ctx: TripCtx, input: unknown, opts?: TripOpts): Promise<{ ok: true; items: DepartureDTO[] } | DepartureFail> {
  const g = await gateUnit(ctx, unitIdOf(input), "read");
  if (isFail(g)) return g;
  const p = listDeparturesInput.safeParse(input);
  if (!p.success) return invalid(p.error);
  const v = p.data;
  if (v.from > v.to) return failOf("INVALID_INPUT", "วันเริ่มต้องไม่หลังวันสิ้นสุด");
  if (inclusiveDays(v.from, v.to) > READ_SPAN_MAX_DAYS) return failOf("INVALID_INPUT", `ช่วงวันที่อ่านได้ไม่เกิน ${READ_SPAN_MAX_DAYS} วัน`);
  const rows = await unitDb(g).tripDeparture.findMany({
    where: { localDate: { gte: dbDate(v.from), lte: dbDate(v.to) }, ...(v.productId ? { productId: v.productId } : {}), ...(v.status ? { status: v.status } : {}) },
    select: DEP_SELECT,
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
  });
  return { ok: true, items: await toDtos(g, rows, opts?.now ?? new Date()) };
}

/** คำนวณ cutoffAt ใหม่ให้รอบอนาคตที่ไม่ CANCELLED (หลังเปลี่ยนค่าตั้ง T6) · updated = แถวที่ค่าเปลี่ยน */
export async function refreshDeparturePolicy(ctx: TripCtx, input: unknown, opts?: TripOpts): Promise<{ ok: true; updated: number } | DepartureFail> {
  const g = await gateUnit(ctx, unitIdOf(input), "edit");
  if (isFail(g)) return g;
  const p = refreshInput.safeParse(input);
  if (!p.success) return invalid(p.error);
  const now = opts?.now ?? new Date();
  const rows = await unitDb(g).tripDeparture.findMany({
    where: { status: { not: "CANCELLED" }, startsAt: { gt: now }, ...(p.data.productId ? { productId: p.data.productId } : {}) },
    select: { id: true, productId: true, localDate: true, startsAt: true, cutoffAt: true },
    orderBy: { id: "asc" },
  });
  const pols = await policiesAt(g.tenantId, rows.map((r) => ({ unitId: g.unitId, productId: r.productId, departureId: r.id })));
  const changes = rows
    .map((r, i) => ({ r, cutoffAt: cutoffAtColumn({ localDate: ymdOf(r.localDate), startsAt: r.startsAt }, pols[i].t6, g.tz) }))
    .filter((x) => x.r.cutoffAt?.getTime() !== x.cutoffAt.getTime());
  if (!changes.length) return { ok: true, updated: 0 };
  return inTx(g, async (tx) => {
    let updated = 0;
    for (const c of changes) {
      const n = await tx.tripDeparture.updateMany({ where: { id: c.r.id, status: { not: "CANCELLED" }, startsAt: c.r.startsAt }, data: { cutoffAt: c.cutoffAt } });
      updated += n.count;
    }
    await auditTx(tx, g, "trips.departure.refresh", "TripProduct", p.data.productId ?? g.unitId, { updated });
    return { ok: true as const, updated };
  });
}

/** หยุดขายระดับช่องทางของร้าน (null = ล้าง) · agentAccountIds = A1.4 (ยังไม่รองรับ) */
export async function setDepartureStopSell(ctx: TripCtx, input: unknown): Promise<{ ok: true; id: string } | DepartureFail> {
  const g = await gateUnit(ctx, unitIdOf(input), "edit");
  if (isFail(g)) return g;
  const p = stopSellInput.safeParse(input);
  if (!p.success) return invalid(p.error);
  const s = tripDepartureStopSellSchema.safeParse(p.data.stopSell);
  if (!s.success) return invalid(s.error);
  if (s.data && s.data.agentAccountIds !== undefined) return failOf("AGENT_STOP_SELL_NOT_SUPPORTED");
  const value = s.data ? toJson({ channels: s.data.channels, reason: s.data.reason, ...(s.data.until ? { until: s.data.until } : {}) }) : null;
  const departureId = p.data.departureId;
  return inTx(g, async (tx) => {
    const dep = await lockDeparture(tx, g, departureId);
    if (!dep) return failOf("NOT_FOUND");
    if (dep.status === "CANCELLED") return failOf("BAD_STATE", "รอบนี้ยกเลิกแล้ว");
    await tx.tripDeparture.updateMany({ where: { id: dep.id }, data: { stopSell: value ?? Prisma.DbNull, version: { increment: 1 } } });
    await auditTx(tx, g, "trips.departure.stopSell", "TripDeparture", dep.id, { stopSell: value });
    return { ok: true as const, id: dep.id };
  });
}

// ═══════════════════════ ขั้นต่ำ ณ เวลาตัดสิน ═══════════════════════
export type MinPaxResult = { checked: number; guaranteed: string[]; belowMin: string[] };
/**
 * รอบ OPEN ที่ minPax ไม่ null และ decisionAt ≤ now < startsAt (T7 ที่ {unit, product, departure} ตอนประเมิน):
 *   sold ≥ minPax ⇒ CAS OPEN→GUARANTEED (SYSTEM) + status_changed · ไม่ถึง ⇒ below_min ครั้งเดียว (คีย์ id + decisionAt)
 * ต่อรอบ = tx + ล็อกแถว ⇒ งานซ้อนกัน = ผลเดียว
 */
export async function evaluateMinPaxCore(g: Gate, now: Date, signal?: AbortSignal): Promise<MinPaxResult> {
  const rows = await unitDb(g).tripDeparture.findMany({
    where: { status: "OPEN", minPax: { not: null }, startsAt: { gt: now } },
    select: { id: true, productId: true, localDate: true, startsAt: true },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
  });
  const pols = await policiesAt(g.tenantId, rows.map((r) => ({ unitId: g.unitId, productId: r.productId, departureId: r.id })));
  const due = rows
    .map((r, i) => ({ r, decisionAt: decisionAtFor({ localDate: ymdOf(r.localDate), startsAt: r.startsAt }, pols[i].t7, g.tz) }))
    .filter((x) => x.decisionAt.getTime() <= now.getTime());
  const out: MinPaxResult = { checked: due.length, guaranteed: [], belowMin: [] };
  for (const { r, decisionAt } of due) {
    if (signal?.aborted) break;
    const res = await inTx(g, async (tx) => {
      const dep = await lockDeparture(tx, g, r.id);
      if (!dep || dep.status !== "OPEN" || dep.minPax === null || dep.startsAt.getTime() <= now.getTime()) return "SKIP" as const;
      if (dep.sold >= dep.minPax) return (await casStatus(tx, g, dep, "GUARANTEED", now)) ? ("GUARANTEED" as const) : ("SKIP" as const);
      await emitDeparture(tx, g, "trips.departure.below_min", `trips.departure.below_min:${dep.id}:${decisionAt.getTime()}`, dep);
      return "BELOW" as const;
    });
    if (res === "GUARANTEED") out.guaranteed.push(r.id);
    else if (res === "BELOW") out.belowMin.push(r.id);
  }
  return out;
}

export async function evaluateMinPax(ctx: TripCtx, input: unknown, opts?: TripOpts): Promise<{ ok: true; guaranteed: string[]; belowMin: string[] } | DepartureFail> {
  const g = await gateUnit(ctx, unitIdOf(input), "status");
  if (isFail(g)) return g;
  const p = unitOnlyInput.safeParse(input);
  if (!p.success) return invalid(p.error);
  const r = await evaluateMinPaxCore(g, opts?.now ?? new Date());
  return { ok: true, guaranteed: r.guaranteed, belowMin: r.belowMin };
}

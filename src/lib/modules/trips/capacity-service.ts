// ─────────────────────────────────────────────────────────────
// trips/capacity-service.ts — ชั้น "เปิดธุรกรรมเอง" ของเครื่องยนต์ความจุ: ที่ว่าง · ตัวห่อ placeHold/extend/convert/release/return/move ·
// ตัวโหลดค่าตั้ง (loadCapacityPolicies) · capacityRowsOf · ตัวกวาดต่อรอบ · บันทึกเหตุผิดปกติ · RUN TRIPS T0.4 r2
//
// 🔴 ค่าตั้ง/หน่วย/rate limit อ่านที่นี่ "ก่อน" เปิด tx เสมอ แล้วส่งเข้า capacity.ts เป็นอาร์กิวเมนต์ (r2 ข้อ 1) — ใน tx ไม่มีการขอ connection ที่สอง
// 🔴 ค่าตั้งเสีย ⇒ VALIDATION details.reason SETTINGS_INVALID (ไม่มี Error ดิบ · r2 ข้อ 7) · CHECK 23514/ตัวนับไม่ตรง ⇒ บันทึก ops หลัง rollback (r2 ข้อ 11)
// 🔴 ผู้กระทำสาธารณะเห็น/ถือได้เฉพาะสินค้า ACTIVE + ตัวเลือกเปิด (r2 ข้อ 4)
// ─────────────────────────────────────────────────────────────
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { tenantDb } from "@/lib/core/db";
import { logOps } from "@/lib/core/ops";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { SELL_CHANNELS, type AvailabilityRow, type CapacityRowRef, type LineRequest, type SellResult } from "@/lib/core/sellable";
import { resolveSettings, resolveSettingsMany } from "@/lib/core/settings";
import { LIST_SPAN_MAX_DAYS, LOCK_RETRIES, QTY_MAX, RATE_WINDOW_MS, inclusiveDaysBetween, publicLeftOf, type HoldDurations } from "./capacity-core";
import {
  CapacityAbort,
  DEP_COLS,
  ID,
  blockOf,
  convertCoreTx,
  extendCoreTx,
  holdInput,
  holdRefInput,
  holdShapeError,
  invalidInput,
  isPublic,
  moveCoreTx,
  moveInput,
  parseCtx,
  placeHoldTx,
  planHold,
  readHold,
  readHoldByKey,
  releaseCoreTx,
  releaseInput,
  rememberPolicies,
  returnCoreTx,
  returnInput,
  sellFail,
  staffOnly,
  sweepDeparturesTx,
  type CapacityPolicies,
  type Clock,
  type ConvertValue,
  type CountersValue,
  type Ctx,
  type DepRow,
  type DeparturePolicy,
  type Failure,
  type Gate,
  type OfferFailure,
  type HoldRow,
  type MoveValue,
  type PlaceHoldValue,
  type ReleaseValue,
  type SweepGroup,
  type Tx,
} from "./capacity";
import { cutoffFor, type SaleBlockReason, type T6Value } from "./departures-core";
import { isYmd } from "./json-schemas";
import { systemGate } from "./resources";

// ── T0.4 capacity ──
// ═══════════════════════ หน่วย · client ═══════════════════════
/** หน่วย TRIPS ของร้าน (ไม่ใช่ ⇒ null ⇒ NOT_FOUND ข้อความเดียวกับ id ที่ไม่มีจริง · X1) */
export async function gateOf(c: { tenantId: string; unitId: string }): Promise<Gate | null> {
  const g = await systemGate(c.tenantId, c.unitId);
  return g ? { tenantId: g.tenantId, unitId: g.unitId, tz: g.tz } : null;
}
export const unitClient = (g: Gate) => tenantDb({ tenantId: g.tenantId, unitId: g.unitId }) as unknown as Tx;

// ═══════════════════════ ค่าตั้ง (แหล่งเดียวของระยะถือ/เพดาน · §4 ข้อ 10) ═══════════════════════
const K = {
  T5: "trips.sell.holdMinutes",
  T6: "trips.sell.cutoff",
  T9: "trips.sell.waitlistHoldMinutes",
  X2: "trips.sell.shopConfirmHours",
  X6: "trips.public.showLeftAtOrBelow",
  X8: "trips.public.rateLimits",
  X10: "trips.public.holdCapPerContact",
  SR: "trips.supplier.respondHours",
  SD: "trips.supplier.shopDecisionHours",
  SA: "trips.supplier.autoCancelOnTimeout",
} as const;
const DEP_KEYS = [K.T5, K.T6, K.T9, K.X2, K.X6, K.SR, K.SD, K.SA];
const INT = z.number().int().min(0);
const POS = z.number().int().min(1);
const SPEC = z.object({ daysBefore: INT, atMin: INT });
const T6S = SPEC.extend({ perChannel: z.partialRecord(z.enum(SELL_CHANNELS), SPEC).optional() });
const X8S = z.object({ holdPerHourPerContact: POS }).passthrough();

/** ค่าตั้งของร้านผิดรูป (แถวเสีย/สคีมาเข้มขึ้น) — ตัวห่อแปลงเป็น VALIDATION reason SETTINGS_INVALID */
export class CapacitySettingsInvalid extends Error {
  constructor(readonly key: string) {
    super(`ค่าตั้ง ${key} ผิดรูป`);
    this.name = "CapacitySettingsInvalid";
  }
}
function settingOf<T>(schema: z.ZodType<T>, key: string, v: unknown): T {
  const p = schema.safeParse(v);
  if (!p.success) throw new CapacitySettingsInvalid(key);
  return p.data;
}
const settingsInvalid = (e: CapacitySettingsInvalid): Failure => sellFail("VALIDATION", { reason: "SETTINGS_INVALID", key: e.key });

type Resolved = Record<string, { value: unknown } | undefined>;
function departurePolicyFrom(d: { id: string; productId: string }, r: Resolved): DeparturePolicy {
  const durations: HoldDurations = {
    holdMinutes: settingOf(POS, K.T5, r[K.T5]?.value),
    waitlistHoldMinutes: settingOf(POS, K.T9, r[K.T9]?.value),
    shopConfirmHours: settingOf(POS, K.X2, r[K.X2]?.value),
    supplierHours: settingOf(POS, K.SR, r[K.SR]?.value) + (settingOf(z.boolean(), K.SA, r[K.SA]?.value) ? 0 : settingOf(POS, K.SD, r[K.SD]?.value)),
  };
  return { departureId: d.id, productId: d.productId, t6: settingOf(T6S, K.T6, r[K.T6]?.value) as T6Value, durations, showLeftAtOrBelow: settingOf(INT, K.X6, r[K.X6]?.value) };
}
/**
 * ค่าตั้งของรอบชุดหนึ่ง (ชุดละ 200 refs) + เพดานถือ X10 ที่ชั้นหน่วย (ค่าเดียวต่อหน่วย · ไม่ขึ้นกับรอบที่โหลดก่อน — X10 มี chain U
 * ใน TRIPS-DEFAULTS จึงไม่มีการทับชั้นสินค้า/รอบ · r3 N1) — โยน CapacitySettingsInvalid เมื่อค่าตั้งเสีย
 * `remember` = เติมแคชสำรองของกระบวนการ (loadCapacityPolicies · capacityRowsOf เท่านั้น)
 */
export async function policiesFor(g: Gate, deps: readonly { id: string; productId: string }[], now: Date, opts: { remember: boolean } = { remember: false }): Promise<CapacityPolicies> {
  const departures: Record<string, DeparturePolicy> = {};
  for (let i = 0; i < deps.length; i += 200) {
    const part = deps.slice(i, i + 200);
    const rs = await resolveSettingsMany({ tenantId: g.tenantId }, DEP_KEYS, part.map((d) => ({ unitId: g.unitId, productId: d.productId, departureId: d.id })), now);
    part.forEach((d, j) => {
      departures[d.id] = departurePolicyFrom(d, rs[j]);
    });
  }
  const u = await resolveSettings({ tenantId: g.tenantId }, [K.X10], { unitId: g.unitId }, now);
  const p: CapacityPolicies = { tenantId: g.tenantId, unitId: g.unitId, holdCap: settingOf(POS, K.X10, u[K.X10]?.value), departures };
  if (opts.remember) rememberPolicies(p);
  return p;
}

/** r3 N3: ตัวที่เปิด connection เอง — ส่ง tx client เข้ามา (มี $queryRaw แต่ไม่มี $transaction) ⇒ ปฏิเสธ VALIDATION reason IN_TRANSACTION */
function looksLikeTx(v: unknown): boolean {
  if (v === null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.$queryRaw === "function" && typeof o.$transaction !== "function";
}
const inTransactionArg = (...args: unknown[]) => args.some(looksLikeTx);

async function depRefs(g: Gate, ids: readonly string[]): Promise<{ id: string; productId: string }[]> {
  if (!ids.length) return [];
  return unitClient(g).$queryRaw<{ id: string; productId: string }[]>`
    SELECT "id", "productId" FROM "TripDeparture" WHERE "id" = ANY(${[...new Set(ids)]}::text[]) AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId}`;
}
const loadInput = z.strictObject({ departureIds: z.array(ID).max(200) });
/**
 * 🔴 ห้ามเรียกในธุรกรรม — ใช้ connection ของตัวเอง (เรียกก่อนเปิด tx เสมอ · ส่ง tx client มา ⇒ VALIDATION reason IN_TRANSACTION · r3 N3)
 * ตัวโหลดค่าตั้งของเครื่องยนต์ความจุ — ผู้เรียก *InTx (T0.6 ตะกร้า/ยืนยัน · T0.7 ยกเลิก · A1.4) รัน "ก่อน" เปิดธุรกรรม แล้วส่งผลให้
 * releaseHoldInTx · returnSoldInTx · moveSoldInTx · rekeyHoldsToContactInTx · reserveInTx · insertHoldInTx (ใน tx ห้ามอ่านค่าตั้งเอง · r2 ข้อ 1)
 * รอบที่ไม่พบ/ไม่ใช่ของหน่วย = ไม่อยู่ใน `departures` (InTx ตัดสิน NOT_FOUND ตอนล็อก) · ค่าตั้งเสีย ⇒ VALIDATION reason SETTINGS_INVALID
 */
export async function loadCapacityPolicies(ctx: unknown, input: unknown): Promise<SellResult<CapacityPolicies>> {
  if (inTransactionArg(ctx, input)) return sellFail("VALIDATION", { reason: "IN_TRANSACTION" });
  const pc = parseCtx(ctx);
  if (!pc.ok) return pc;
  const p = loadInput.safeParse(input);
  if (!p.success) return invalidInput(p.error);
  const g = await gateOf(pc.c);
  if (!g) return sellFail("NOT_FOUND");
  try {
    return { ok: true, value: await policiesFor(g, await depRefs(g, p.data.departureIds), pc.c.clock.now, { remember: true }) };
  } catch (e) {
    if (e instanceof CapacitySettingsInvalid) return settingsInvalid(e);
    throw e;
  }
}
/** ค่าตั้งแบบไม่ล้ม (ใช้เฉพาะการเสนอรายการรอ — ค่าตั้งเสีย ⇒ undefined ⇒ ไม่เสนอ แต่ปล่อยที่ได้) */
async function optionalPolicies(g: Gate, deps: readonly { id: string; productId: string }[], now: Date, remember = false): Promise<CapacityPolicies | undefined> {
  try {
    return await policiesFor(g, deps, now, { remember });
  } catch (e) {
    if (e instanceof CapacitySettingsInvalid) return undefined;
    throw e;
  }
}

// ═══════════════════════ ธุรกรรม · ลองใหม่ · เหตุผิดปกติ ═══════════════════════
const PG_CODES = new Set(["40P01", "55P03", "40001", "23505", "23514"]);
function pgCodeOf(e: unknown): string | null {
  const seen = new Set<unknown>();
  const stack: unknown[] = [e];
  let depth = 0;
  while (stack.length && depth++ < 64) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object" || seen.has(cur)) continue;
    seen.add(cur);
    const o = cur as Record<string, unknown>;
    for (const k of ["originalCode", "code", "sqlState"]) {
      const v = o[k];
      if (typeof v !== "string") continue;
      if (PG_CODES.has(v)) return v;
      if (v === "P2034") return "40001";
      if (v === "P2028") return "TX_TIMEOUT";
    }
    if (typeof o.message === "string") {
      if (/deadlock detected/i.test(o.message)) return "40P01";
      if (/lock not available/i.test(o.message)) return "55P03";
      if (/violates check constraint/i.test(o.message)) return "23514";
      if (/Transaction already closed|expired transaction|Unable to start a transaction/i.test(o.message)) return "TX_TIMEOUT";
    }
    if (o.cause) stack.push(o.cause);
    for (const v of Object.values(o)) if (v && typeof v === "object") stack.push(v);
  }
  return null;
}
/**
 * บันทึกเหตุผิดปกติของข้อมูล (CHECK 23514 / held ไม่พอกับแถว hold ที่ CAS ได้) ลง ops ครั้งเดียวต่อเหตุ — เรียกหลัง rollback (นอก tx)
 * ผู้เรียก *InTx (T0.6) เรียกตัวนี้กับ error ที่จับได้หลังธุรกรรมของตัวเองจบ · คืน true เมื่อเป็นเหตุผิดปกติ
 */
export async function reportCapacityIncident(e: unknown, where: { tenantId: string; unitId?: string }): Promise<boolean> {
  if (!(e instanceof CapacityAbort) || !e.incident) return false;
  await logOps("ERROR", "trips.capacity", `ตัวนับที่นั่งผิดปกติ (${e.incident}) — ${e.code}`, {
    tenantId: where.tenantId,
    detail: JSON.stringify({ unitId: where.unitId ?? null, incident: e.incident, code: e.code, details: e.details ?? null }),
  }).catch(() => undefined);
  return true;
}
/**
 * บันทึกข้อเสนอรายการรอที่ล้ม (ย้อนเฉพาะ savepoint · การปล่อยที่ commit แล้ว) — เรียกหลังธุรกรรม · incident ⇒ ERROR · อื่น (รวม 40P01/40001) ⇒ WARN
 * ผู้เรียก *InTx (T0.6) ส่ง value.offerFailures ของ releaseHoldInTx/returnSoldInTx/moveSoldInTx มาที่นี่หลัง commit · ไม่มีข้อมูลบุคคล (id + รหัสเท่านั้น)
 */
export async function reportOfferFailures(failures: readonly OfferFailure[] | undefined, where: { tenantId: string; unitId?: string }): Promise<void> {
  if (!failures?.length) return;
  const incidents = failures.filter((f) => f.incident);
  const others = failures.filter((f) => !f.incident);
  if (incidents.length) {
    await logOps("ERROR", "trips.waitlist", `เสนอที่รายการรอล้มเพราะข้อมูลตัวนับผิดปกติ ${incidents.length} รายการ`, {
      tenantId: where.tenantId,
      detail: JSON.stringify({ unitId: where.unitId ?? null, failures: incidents.slice(0, 50) }),
    }).catch(() => undefined);
  }
  if (others.length) {
    await logOps("WARN", "trips.waitlist", `เสนอที่รายการรอไม่สำเร็จ ${others.length} รายการ (การปล่อยที่สำเร็จแล้ว)`, {
      tenantId: where.tenantId,
      detail: JSON.stringify({ unitId: where.unitId ?? null, failures: others.slice(0, 50) }),
    }).catch(() => undefined);
  }
}
const TX_OPTS = { maxWait: 30_000, timeout: 60_000 } as const;
/** ธุรกรรมของหน่วย · 40P01/55P03/40001 ⇒ ลองใหม่สูงสุด LOCK_RETRIES ครั้งแล้ว BUSY · CapacityAbort ⇒ SellResult (rollback แล้ว) */
export async function runTx<T>(g: Gate, fn: (tx: Tx) => Promise<T>): Promise<SellResult<T>> {
  for (let attempt = 0; ; attempt++) {
    try {
      const value = await tenantDb({ tenantId: g.tenantId, unitId: g.unitId }).$transaction((t) => fn(t as unknown as Tx), TX_OPTS);
      return { ok: true, value };
    } catch (e) {
      if (e instanceof CapacityAbort) {
        await reportCapacityIncident(e, g);
        return sellFail(e.code, e.details);
      }
      const code = pgCodeOf(e);
      if (code === "40P01" || code === "55P03" || code === "40001") {
        if (attempt < LOCK_RETRIES) continue;
        return sellFail("BUSY");
      }
      if (code === "TX_TIMEOUT") return sellFail("BUSY");
      if (code === "23514") {
        await logOps("ERROR", "trips.capacity", "CHECK ของตัวนับที่นั่งถูกละเมิด (23514)", { tenantId: g.tenantId, detail: g.unitId }).catch(() => undefined);
        return sellFail("STATE_CONFLICT", { reason: "INTEGRITY" });
      }
      throw e;
    }
  }
}

/** runTx ที่ล้างข้อเสนอที่ล้มทุกครั้งที่ลองใหม่ แล้วบันทึกหลัง commit (r3 N4) */
export async function runTxC<T>(g: Gate, c: Ctx, fn: (tx: Tx) => Promise<T>): Promise<SellResult<T>> {
  const r = await runTx(g, (tx) => {
    c.offerFailures.length = 0;
    return fn(tx);
  });
  if (r.ok) await reportOfferFailures(c.offerFailures, g);
  return r;
}

// ═══════════════════════ ที่ว่าง (R2 · ใบสั่ง §3.2 · r2 ข้อ 4) ═══════════════════════
type AvRow = DepRow & { productStatus: string; optionActive: boolean | null };
const AV_FROM = Prisma.sql`FROM "TripDeparture" d
  JOIN "TripProduct" p ON p."id" = d."productId" AND p."tenantId" = d."tenantId" AND p."unitId" = d."unitId"
  LEFT JOIN "TripOption" o ON o."id" = d."optionId" AND o."tenantId" = d."tenantId" AND o."unitId" = d."unitId"`;
/** สาธารณะเห็นเฉพาะสินค้า ACTIVE + ตัวเลือกเปิด */
const publicVisible = (r: AvRow) => r.productStatus === "ACTIVE" && (r.optionId === null || r.optionActive === true);
/** ร้าน/ระบบ: DRAFT ขายได้ · ARCHIVED/ตัวเลือกปิด ⇒ ขายไม่ได้ (STATUS) */
const staffSellable = (r: AvRow) => r.productStatus !== "ARCHIVED" && (r.optionId === null || r.optionActive === true);

export type AvailabilityValue = AvailabilityRow & { saleBlock: SaleBlockReason | null; showLeft: boolean; cutoffAt: string };
function availabilityOf(d: AvRow, pol: DeparturePolicy, tz: string, channel: string, now: Date): AvailabilityValue {
  const saleBlock = staffSellable(d) ? blockOf(d, pol, tz, channel, now, true) : "STATUS";
  const publicLeft = saleBlock === null ? publicLeftOf(d) : 0;
  return {
    slotId: d.id,
    startsAt: d.startsAt.toISOString(),
    localDate: d.localDate,
    status: d.status,
    publicLeft,
    belowMin: d.minPax !== null && d.sold < d.minPax,
    saleBlock,
    showLeft: publicLeft > 0 && publicLeft <= pol.showLeftAtOrBelow,
    cutoffAt: cutoffFor({ localDate: d.localDate, startsAt: d.startsAt }, pol.t6, channel as (typeof SELL_CHANNELS)[number], tz).toISOString(),
  };
}

const getAvailabilityInput = z.strictObject({ departureId: ID });
/** ที่ว่างของรอบ — เลขจริง (c − s − h − r) เมื่อขายได้ · สาธารณะ: สินค้าไม่ ACTIVE/ตัวเลือกปิด ⇒ NOT_FOUND (ไม่มีตัวเลขรั่ว) */
export async function getAvailability(ctx: unknown, input: unknown): Promise<SellResult<AvailabilityValue>> {
  const pc = parseCtx(ctx);
  if (!pc.ok) return pc;
  const p = getAvailabilityInput.safeParse(input);
  if (!p.success) return invalidInput(p.error);
  const g = await gateOf(pc.c);
  if (!g) return sellFail("NOT_FOUND");
  const rows = await unitClient(g).$queryRaw<AvRow[]>`
    SELECT ${DEP_COLS}, p."status" AS "productStatus", o."active" AS "optionActive" ${AV_FROM}
    WHERE d."id" = ${p.data.departureId} AND d."tenantId" = ${g.tenantId} AND d."unitId" = ${g.unitId}`;
  const d = rows[0];
  if (!d || (isPublic(pc.c) && !publicVisible(d))) return sellFail("NOT_FOUND");
  try {
    const pol = (await policiesFor(g, [d], pc.c.clock.now)).departures[d.id];
    return { ok: true, value: availabilityOf(d, pol, g.tz, pc.c.channel, pc.c.clock.now) };
  } catch (e) {
    if (e instanceof CapacitySettingsInvalid) return settingsInvalid(e);
    throw e;
  }
}

const listAvailabilityInput = z.strictObject({
  productId: ID,
  from: z.string().refine(isYmd),
  to: z.string().refine(isYmd),
  optionId: ID.optional(),
  paxTotal: z.number().int().min(0).max(QTY_MAX).optional(), // ตามชนิด AvailabilityQuery ของ CC — ไม่กรองแถว (หน้าจองตัดสินจาก publicLeft เอง)
});
/** รอบของสินค้าในช่วงวัน (≤ 62 วัน) เรียง startsAt, id · รวม CANCELLED (saleBlock STATUS) · สาธารณะ: สินค้าไม่ ACTIVE ⇒ NOT_FOUND · ตัดรอบของตัวเลือกปิด */
export async function listAvailability(ctx: unknown, input: unknown): Promise<SellResult<AvailabilityValue[]>> {
  const pc = parseCtx(ctx);
  if (!pc.ok) return pc;
  const p = listAvailabilityInput.safeParse(input);
  if (!p.success) return invalidInput(p.error);
  const v = p.data;
  const span = inclusiveDaysBetween(v.from, v.to);
  if (span < 1 || span > LIST_SPAN_MAX_DAYS) return sellFail("VALIDATION", { fields: ["to"], maxDays: LIST_SPAN_MAX_DAYS });
  const g = await gateOf(pc.c);
  if (!g) return sellFail("NOT_FOUND");
  const prod = await unitClient(g).$queryRaw<{ status: string }[]>`
    SELECT "status" FROM "TripProduct" WHERE "id" = ${v.productId} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId}`;
  if (!prod[0] || (isPublic(pc.c) && prod[0].status !== "ACTIVE")) return sellFail("NOT_FOUND");
  const optionFilter = v.optionId ? Prisma.sql`AND d."optionId" = ${v.optionId}` : Prisma.empty;
  const all = await unitClient(g).$queryRaw<AvRow[]>`
    SELECT ${DEP_COLS}, p."status" AS "productStatus", o."active" AS "optionActive" ${AV_FROM}
    WHERE d."tenantId" = ${g.tenantId} AND d."unitId" = ${g.unitId} AND d."productId" = ${v.productId} ${optionFilter}
      AND d."localDate" >= ${v.from}::date AND d."localDate" <= ${v.to}::date
    ORDER BY d."startsAt", d."id"`;
  const rows = isPublic(pc.c) ? all.filter(publicVisible) : all;
  try {
    const pols = await policiesFor(g, rows, pc.c.clock.now);
    return { ok: true, value: rows.map((d) => availabilityOf(d, pols.departures[d.id], g.tz, pc.c.channel, pc.c.clock.now)) };
  } catch (e) {
    if (e instanceof CapacitySettingsInvalid) return settingsInvalid(e);
    throw e;
  }
}

// ═══════════════════════ ถือที่ (ใบสั่ง §3.3) ═══════════════════════
async function readDep(g: Gate, id: string): Promise<DepRow | null> {
  const rows = await unitClient(g).$queryRaw<DepRow[]>`SELECT ${DEP_COLS} FROM "TripDeparture" d WHERE d."id" = ${id} AND d."tenantId" = ${g.tenantId} AND d."unitId" = ${g.unitId}`;
  return rows[0] ?? null;
}
async function duplicateValue(g: Gate, h: HoldRow): Promise<PlaceHoldValue> {
  const d = await readDep(g, h.departureId);
  return {
    holdId: h.id,
    departureId: h.departureId,
    qty: h.qtyPublic + h.qtyAllot,
    purpose: h.purpose,
    status: h.status,
    expiresAt: h.expiresAt.toISOString(),
    publicLeft: d ? publicLeftOf(d) : 0,
    duplicated: true,
  };
}

/**
 * ลำดับ (ใบสั่ง §3.3 · r2): zod + รูปคำขอ → PUBLIC: rate limit (ก่อนค้นรอบ ⇒ id ที่ไม่มี/ของร้านอื่นกินโควตาเหมือนกัน · คำขอซ้ำแบบกันซ้ำก็กินโควตา) →
 * อ่านรอบ + ค่าตั้ง (นอก tx) → กันซ้ำ (หน่วยเดียวกัน) → tx: ชั้น 0 เพดาน (PUBLIC) → สินค้า FOR SHARE → 1a → D.1(1) → 2a INSERT → 2h
 */
export async function placeHold(ctx: unknown, input: unknown): Promise<SellResult<PlaceHoldValue>> {
  const pc = parseCtx(ctx);
  if (!pc.ok) return pc;
  const c = pc.c;
  const p = holdInput.safeParse(input);
  if (!p.success) return invalidInput(p.error);
  const v = p.data;
  const shape = holdShapeError(c, v, { trustRefs: false });
  if (shape) return shape;
  if (c.actor.kind === "PUBLIC") {
    let limit: number;
    try {
      const r = await resolveSettings({ tenantId: c.tenantId }, [K.X8], { unitId: c.unitId }, c.clock.now);
      limit = settingOf(X8S, K.X8, r[K.X8]?.value).holdPerHourPerContact;
    } catch (e) {
      if (e instanceof CapacitySettingsInvalid) return settingsInvalid(e);
      throw e;
    }
    const verdict = await checkRateLimitDb(`trips:hold:${c.tenantId}:${c.actor.clientKey}`, { limit, windowMs: RATE_WINDOW_MS }, c.clock.now.getTime());
    if (!verdict.ok) return sellFail("RATE_LIMITED", { retryAfterSec: verdict.retryAfterSec ?? null });
  }
  const g = await gateOf(c);
  if (!g) return sellFail("NOT_FOUND");
  const d0 = await readDep(g, v.departureId);
  if (!d0) return sellFail("NOT_FOUND");
  let policies: CapacityPolicies;
  try {
    policies = await policiesFor(g, [d0], c.clock.now);
  } catch (e) {
    if (e instanceof CapacitySettingsInvalid) return settingsInvalid(e);
    throw e;
  }
  const policy = policies.departures[d0.id];
  const plan = planHold(g, c, v, policy, { trustRefs: false });
  if ("ok" in plan) return plan;
  const resolveDup = async (h: HoldRow): Promise<SellResult<PlaceHoldValue>> =>
    h.requestHash === plan.requestHash ? { ok: true, value: await duplicateValue(g, h) } : sellFail("IDEMPOTENCY_CONFLICT");
  const prior = await readHoldByKey(unitClient(g), g, plan.idemKey);
  if (prior) return resolveDup(prior);
  const r = await runTx(g, (tx) => placeHoldTx(tx, g, c, v, policy, policies.holdCap, plan));
  if (!r.ok) {
    if (r.code === "IDEMPOTENCY_CONFLICT") {
      const h = await readHoldByKey(unitClient(g), g, plan.idemKey);
      return h ? resolveDup(h) : r;
    }
    return r;
  }
  return "dup" in r.value ? resolveDup(r.value.dup) : { ok: true, value: r.value.value };
}

// ═══════════════════════ ต่ออายุ · แปลง · ปล่อย ═══════════════════════
async function holdAndPolicies(g: Gate, holdId: string, now: Date, strict: boolean): Promise<{ hold: HoldRow; policies: CapacityPolicies | undefined } | Failure> {
  const hold = await readHold(unitClient(g), g, holdId);
  if (!hold) return sellFail("HOLD_NOT_FOUND");
  const deps = await depRefs(g, [hold.departureId]);
  if (!strict) return { hold, policies: await optionalPolicies(g, deps, now) };
  try {
    return { hold, policies: await policiesFor(g, deps, now) };
  } catch (e) {
    if (e instanceof CapacitySettingsInvalid) return settingsInvalid(e);
    throw e;
  }
}
/** ต่ออายุ = now + ระยะของ purpose (CAS ใต้ล็อกรอบ) · PAYMENT/WAITLIST_OFFER ต่อไม่ได้ · รอบยกเลิก/เริ่มแล้ว ⇒ SLOT_CLOSED · สาธารณะต้องแสดง capKey ของ hold */
export async function extendHold(ctx: unknown, input: unknown): Promise<SellResult<{ holdId: string; expiresAt: string }>> {
  const pc = parseCtx(ctx);
  if (!pc.ok) return pc;
  const p = holdRefInput.safeParse(input);
  if (!p.success) return invalidInput(p.error);
  const g = await gateOf(pc.c);
  if (!g) return sellFail("HOLD_NOT_FOUND");
  const hp = await holdAndPolicies(g, p.data.holdId, pc.c.clock.now, true);
  if ("ok" in hp) return hp;
  return runTx(g, (tx) => extendCoreTx(tx, g, pc.c, p.data.holdId, p.data.capKey, hp.policies));
}
/** แปลง (D.1(3)) — ไม่ใช้ค่าตั้ง · สาธารณะต้องแสดง capKey ของ hold (r2 ข้อ 9) */
export async function convertHold(ctx: unknown, input: unknown): Promise<SellResult<ConvertValue>> {
  const pc = parseCtx(ctx);
  if (!pc.ok) return pc;
  const p = holdRefInput.safeParse(input);
  if (!p.success) return invalidInput(p.error);
  const g = await gateOf(pc.c);
  if (!g) return sellFail("HOLD_NOT_FOUND");
  return runTx(g, (tx) => convertCoreTx(tx, g, pc.c, p.data.holdId, p.data.capKey));
}
/** ปล่อย (D.1(4)) + เสนอรายการรอในทีเดียวกัน · ค่าตั้งเสีย ⇒ ปล่อยได้แต่ไม่เสนอ · สาธารณะต้องแสดง capKey ของ hold */
export async function releaseHold(ctx: unknown, input: unknown): Promise<SellResult<ReleaseValue>> {
  const pc = parseCtx(ctx);
  if (!pc.ok) return pc;
  const p = releaseInput.safeParse(input);
  if (!p.success) return invalidInput(p.error);
  const g = await gateOf(pc.c);
  if (!g) return sellFail("HOLD_NOT_FOUND");
  const hp = await holdAndPolicies(g, p.data.holdId, pc.c.clock.now, false);
  if ("ok" in hp) return hp;
  return runTxC(g, pc.c, (tx) => releaseCoreTx(tx, g, pc.c, p.data, hp.policies));
}

// ═══════════════════════ คืน · ย้าย (งานของร้าน) ═══════════════════════
export async function returnSold(ctx: unknown, input: unknown): Promise<SellResult<CountersValue>> {
  const pc = parseCtx(ctx);
  if (!pc.ok) return pc;
  const so = staffOnly(pc.c);
  if (so) return so;
  const p = returnInput.safeParse(input);
  if (!p.success) return invalidInput(p.error);
  const g = await gateOf(pc.c);
  if (!g) return sellFail("NOT_FOUND");
  const deps = await depRefs(g, [p.data.departureId]);
  if (!deps.length) return sellFail("NOT_FOUND");
  const policies = await optionalPolicies(g, deps, pc.c.clock.now);
  return runTxC(g, pc.c, (tx) => returnCoreTx(tx, g, pc.c, p.data, policies));
}
export async function moveSold(ctx: unknown, input: unknown): Promise<SellResult<MoveValue>> {
  const pc = parseCtx(ctx);
  if (!pc.ok) return pc;
  const so = staffOnly(pc.c);
  if (so) return so;
  const p = moveInput.safeParse(input);
  if (!p.success) return invalidInput(p.error);
  const g = await gateOf(pc.c);
  if (!g) return sellFail("NOT_FOUND");
  const deps = await depRefs(g, [p.data.fromDepartureId, p.data.toDepartureId]);
  if (deps.length !== 2) return sellFail("NOT_FOUND");
  let policies: CapacityPolicies;
  try {
    policies = await policiesFor(g, deps, pc.c.clock.now);
  } catch (e) {
    if (e instanceof CapacitySettingsInvalid) return settingsInvalid(e);
    throw e;
  }
  return runTxC(g, pc.c, (tx) => moveCoreTx(tx, g, pc.c, p.data, policies));
}

// ═══════════════════════ Sellable เฟส 1: capacityRowsOf (CC :337) ═══════════════════════
/**
 * 🔴 ห้ามเรียกในธุรกรรม — ใช้ connection ของตัวเอง (เรียกก่อนเปิด tx ของตะกร้า · ส่ง tx client มา ⇒ [] · r3 N3)
 * อ่านไม่ล็อก: แถวเฟส 1 ของบรรทัด/ของ hold · ไม่พบ/ctx ผิด/สาธารณะกับสินค้าที่ไม่เปิดขาย = [] (ผู้เรียกถือเป็น NOT_FOUND)
 * โหลดค่าตั้งของรอบนั้นไว้ในแคชของกระบวนการ (ไม่ล้ม) ⇒ reserveInTx 4 อาร์กิวเมนต์ตามหน้าสัมผัส Sellable ใช้ได้โดยไม่อ่านค่าตั้งใน tx
 */
export async function capacityRowsOf(ctx: unknown, line: LineRequest | { holdId: string }): Promise<CapacityRowRef[]> {
  if (inTransactionArg(ctx, line)) throw new CapacityAbort("VALIDATION", { reason: "IN_TRANSACTION" });
  const pc = parseCtx(ctx);
  if (!pc.ok) return [];
  const g = await gateOf(pc.c);
  if (!g || line === null || typeof line !== "object") return [];
  if ("holdId" in line) {
    if (typeof line.holdId !== "string" || !line.holdId) return [];
    const h = await readHold(unitClient(g), g, line.holdId);
    if (!h) return [];
    await optionalPolicies(g, await depRefs(g, [h.departureId]), pc.c.clock.now, true);
    const rows: CapacityRowRef[] = [{ layer: "1a", table: "TripDeparture", id: h.departureId, sortKey: h.departureId }];
    if (h.allotmentId) rows.push({ layer: "1b", table: "AgentAllotment", id: h.allotmentId, sortKey: h.allotmentId });
    return rows;
  }
  if (line.productKind !== "TRIP" || typeof line.slotId !== "string" || !line.slotId) return [];
  const rows = await unitClient(g).$queryRaw<AvRow[]>`
    SELECT ${DEP_COLS}, p."status" AS "productStatus", o."active" AS "optionActive" ${AV_FROM}
    WHERE d."id" = ${line.slotId} AND d."tenantId" = ${g.tenantId} AND d."unitId" = ${g.unitId}`;
  const d = rows[0];
  if (!d || (typeof line.productId === "string" && line.productId && line.productId !== d.productId)) return [];
  if (isPublic(pc.c) && !publicVisible(d)) return [];
  await optionalPolicies(g, [d], pc.c.clock.now, true);
  return [{ layer: "1a", table: "TripDeparture", id: d.id, sortKey: d.id }];
}

// ═══════════════════════ ตัวกวาด (jobs.ts เรียก) ═══════════════════════
/** หน่วยของงาน (แคชต่อรอบงานใน jobs.ts) */
export async function jobGate(tenantId: string, unitId: string): Promise<Gate | null> {
  return gateOf({ tenantId, unitId });
}
/**
 * ค่าตั้งของรอบที่มีคนรอ (ใช้เสนอที่เท่านั้น) — ค่าตั้งเสีย ⇒ ว่าง + `invalid` (ตัวกวาดยังปล่อย hold ได้ เพราะใช้ expiresAt ในแถว · r2 ข้อ 7)
 */
export async function sweepPolicies(g: Gate, deps: readonly { id: string; productId: string }[], now: Date): Promise<{ policies: CapacityPolicies | undefined; invalid: string | null }> {
  if (!deps.length) return { policies: undefined, invalid: null };
  try {
    return { policies: await policiesFor(g, deps, now), invalid: null };
  } catch (e) {
    if (e instanceof CapacitySettingsInvalid) return { policies: undefined, invalid: e.key };
    throw e;
  }
}
export type SweepBatchResult = { expired: number; offered: number; departures: number; failed: { departureId: string; code: string }[]; done: string[] };
/**
 * ตัวกวาดของหน่วยหนึ่ง: ธุรกรรมเดียวต่อชุด (sweepDeparturesTx) · ชุดล้ม (เช่น รอบหนึ่งตัวนับเพี้ยน) ⇒ ลองทีละรอบ (tx ละรอบ) ให้รอบอื่นไปต่อ
 * `done` = รอบที่ไม่ต้องอ่านซ้ำในรอบงานนี้ (ล้ม หรือไม่มีความคืบหน้า)
 */
export async function expireHoldsBatch(g: Gate, groups: readonly SweepGroup[], policies: CapacityPolicies | undefined, now: Date): Promise<SweepBatchResult> {
  const clock: Clock = { now, iso: now.toISOString() };
  const out: SweepBatchResult = { expired: 0, offered: 0, departures: 0, failed: [], done: [] };
  const offerFails: OfferFailure[] = [];
  const apply = (r: { expired: number; offered: number; departures: number; missing: string[]; offerFailures: OfferFailure[] }, ds: readonly SweepGroup[]) => {
    offerFails.push(...r.offerFailures);
    out.expired += r.expired;
    out.offered += r.offered;
    out.departures += r.departures;
    for (const id of r.missing) out.failed.push({ departureId: id, code: "NOT_FOUND" });
    if (r.expired === 0) out.done.push(...ds.map((x) => x.departureId));
  };
  const batch = await runTx(g, (tx) => sweepDeparturesTx(tx, g, groups, policies, clock));
  if (batch.ok) {
    apply(batch.value, groups);
    out.done.push(...batch.value.missing);
    await reportOfferFailures(offerFails, g);
    return out;
  }
  for (const grp of groups) {
    const r = await runTx(g, (tx) => sweepDeparturesTx(tx, g, [grp], policies, clock));
    if (r.ok) {
      apply(r.value, [grp]);
      out.done.push(...r.value.missing);
    } else {
      out.failed.push({ departureId: grp.departureId, code: r.code });
      out.done.push(grp.departureId);
    }
  }
  await reportOfferFailures(offerFails, g);
  return out;
}
// ── /T0.4 capacity ──

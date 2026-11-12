// ─────────────────────────────────────────────────────────────
// trips/capacity.ts — เครื่องยนต์ความจุของรอบแบบตัวนับ: ที่ว่าง · ถือ · แปลง · ปล่อย · คืน · ย้าย · เพดานถือ · ตัวกวาด · ชิ้นเฟส 1 · RUN TRIPS T0.4
// ใบสั่ง ledger/trips-briefs/T0.4.md §2–§7 (§12–§13 มติผู้คุมชนะ) · CC §C §D.0–§D.6 §J
//
// 🔴 ตัวนับ (capacity/sold/held/reserved) = UPDATE คำสั่งเดียวต่อแถว เงื่อนไขทั้งหมดอยู่ใน WHERE + RETURNING + expectRows (0 แถว ⇒ CapacityAbort ⇒ rollback)
//    ห้ามอ่านแล้วเขียนค่าใหม่ · สถานะหลังตัวนับเปลี่ยน = นิพจน์ร่วมของ T0.3 (departureStatusAfterCountersSql setFull) ใน SET เดียวกัน
// 🔴 ลำดับล็อก: สินค้า FOR SHARE (assertProductSellableInTx · ก่อนทุกอย่าง · หลังจากนั้นไม่แตะแถวสินค้า) → ชั้น 0 advisory เพดาน →
//    1a แถวรอบ (เรียง id) → 2a TripHold (CAS/INSERT) → 2a′ TripWaitlist → 2b TripBooking (เรียง id) → 2h outbox
// 🔴 นาฬิกาเดียว = ctx.now (ไม่มี ⇒ new Date()) · เงื่อนไขเวลาใน SQL ใช้ค่าจาก ctx เท่านั้น (ไม่ใช้ now() ของฐาน)
// 🔴 tenantDb + $queryRaw เท่านั้น (ไม่มี prisma ดิบ · F5) · SQL ดิบใส่ "tenantId" + "unitId" เองทุกคำสั่ง · ไม่มีการลบแถว
// ─────────────────────────────────────────────────────────────
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { tenantDb } from "@/lib/core/db";
import { emitOutboxMany } from "@/lib/core/outbox";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import {
  SELL_CHANNELS,
  type AvailabilityRow,
  type CapacityRowRef,
  type LineRequest,
  type Reservation,
  type SellActor,
  type SellChannel,
  type SellErrorCode,
  type SellResult,
} from "@/lib/core/sellable";
import { resolveSettings, resolveSettingsMany } from "@/lib/core/settings";
import {
  HOLD_PURPOSES,
  LIST_SPAN_MAX_DAYS,
  LOCK_RETRIES,
  PUBLIC_CHANNELS,
  QTY_MAX,
  QTY_MIN,
  RATE_WINDOW_MS,
  WAITLIST_CHANNEL,
  holdExpiresAt,
  idemKeyFor,
  inclusiveDaysBetween,
  ownCapKeyOf,
  publicLeftOf,
  sortCapacityRows,
  waitlistCapKey,
  waitlistOfferIdemKey,
  type HoldDurations,
  type HoldPurpose,
} from "./capacity-core";
import { cutoffFor, cutoffsFor, normalizeTimezone, saleBlockReason, type SaleBlockReason, type T6Value } from "./departures-core";
import { isYmd } from "./json-schemas";
import { departureGuaranteedAtAfterCountersSql, departureStatusAfterCountersSql } from "./departures";
import { TripProductNotSellableError, assertProductSellableInTx } from "./products";
import { systemGate } from "./resources";

// ── T0.4 capacity ──
export type Tx = Prisma.TransactionClient;
type Gate = { tenantId: string; unitId: string; tz: string };
/** นาฬิกาของคำขอ (Date + ISO สำหรับ ::timestamp) */
export type Clock = { now: Date; iso: string };
export type Ctx = { tenantId: string; unitId: string; channel: SellChannel; actor: SellActor; clock: Clock };

// ═══════════════════════ ผลพลาด ═══════════════════════
const MESSAGES: Record<SellErrorCode, string> = {
  VALIDATION: "ข้อมูลไม่ถูกต้อง",
  NOT_FOUND: "ไม่พบรายการที่ขอ",
  FORBIDDEN: "ไม่มีสิทธิ์ทำรายการนี้",
  KIND_NOT_SUPPORTED: "ยังไม่รองรับรายการชนิดนี้",
  CURRENCY_NOT_ALLOWED: "สกุลเงินนี้ใช้กับรายการนี้ไม่ได้",
  SOLD_OUT: "ที่นั่งไม่พอสำหรับจำนวนที่ขอ",
  INSUFFICIENT_ALLOTMENT: "โควตาไม่พอสำหรับจำนวนที่ขอ",
  BERTH_TAKEN: "ที่นอนนี้ถูกจองแล้ว",
  SLOT_CLOSED: "รอบนี้ไม่เปิดรับจอง",
  CUTOFF_PASSED: "เลยเวลาปิดรับจองของรอบนี้แล้ว",
  PRICE_CHANGED: "ราคาเปลี่ยนแล้ว",
  BELOW_MIN_SELL_PRICE: "ราคาต่ำกว่าราคาขายขั้นต่ำ",
  DISCOUNT_OVER_CAP: "ส่วนลดเกินเพดาน",
  HOLD_EXPIRED: "ที่ถือไว้หมดเวลาหรือถูกปล่อยแล้ว",
  HOLD_NOT_FOUND: "ไม่พบที่ถือไว้",
  HOLD_LIMIT: "ถือที่พร้อมกันครบจำนวนที่กำหนดแล้ว",
  AGENT_SUSPENDED: "บัญชีเอเจนซี่ถูกระงับ",
  CREDIT_LIMIT: "เกินวงเงินเครดิต",
  REQUIRES_APPROVAL: "รายการนี้ต้องได้รับอนุมัติก่อน",
  IDEMPOTENCY_CONFLICT: "รหัสกันซ้ำนี้ถูกใช้กับคำขออื่นแล้ว",
  RATE_LIMITED: "ทำรายการถี่เกินไป กรุณารอสักครู่แล้วลองใหม่",
  BUSY: "ระบบกำลังทำรายการเดียวกันอยู่ กรุณาลองใหม่อีกครั้ง",
  STATE_CONFLICT: "สถานะของรายการเปลี่ยนไปแล้ว ทำรายการนี้ไม่ได้",
};
const RETRYABLE: ReadonlySet<SellErrorCode> = new Set<SellErrorCode>(["RATE_LIMITED", "BUSY"]);

export function sellFail(code: SellErrorCode, details?: Record<string, unknown>, messageTh?: string): { ok: false; code: SellErrorCode; messageTh: string; retryable: boolean; details?: Record<string, unknown> } {
  return { ok: false, code, messageTh: messageTh ?? MESSAGES[code], retryable: RETRYABLE.has(code), ...(details ? { details } : {}) };
}
type Failure = ReturnType<typeof sellFail>;

/** ผลปฏิเสธในธุรกรรม — โยนเพื่อ rollback ทั้ง tx · ตัวห่อแปลงเป็น SellResult · ใน *InTx ผู้เรียกเป็นคน rollback */
export class CapacityAbort extends Error {
  readonly code: SellErrorCode;
  readonly details?: Record<string, unknown>;
  constructor(code: SellErrorCode, details?: Record<string, unknown>) {
    super(MESSAGES[code]);
    this.name = "CapacityAbort";
    this.code = code;
    this.details = details;
  }
}
/** คำสั่งตัวนับ/CAS ต้องได้แถว — 0 แถว ⇒ CapacityAbort(code) (ไม่มีการปล่อยผ่าน · CC §D.0 ข้อ 2) */
export function expectRows<T>(rows: readonly T[], code: SellErrorCode, details?: Record<string, unknown>): T {
  const first = rows[0];
  if (first === undefined) throw new CapacityAbort(code, details);
  return first;
}
/** INSERT hold ชนคีย์กันซ้ำ (คำขอซ้อน) — ตัวห่ออ่านแถวที่ชนะแล้วคืนแบบ duplicated */
class IdemRace extends Error {
  constructor() {
    super("idempotency race");
    this.name = "IdemRace";
  }
}

// ═══════════════════════ แฮช (node:crypto) ═══════════════════════
/** แฮชของ capKey (basket:/contact:/agent:/st:/sys:/waitlist:) — เก็บแต่แฮช ไม่เก็บข้อความเดิม (X8) */
export function holdCapKeyHash(capKey: string): string {
  return createHash("sha256").update(`trips-holdcap:${capKey}`).digest("hex");
}
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v !== null && typeof v === "object" && !(v instanceof Date)) {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(o)
        .filter((k) => o[k] !== undefined)
        .sort()
        .map((k) => [k, canonical(o[k])]),
    );
  }
  return v;
}
/** canonical JSON (คีย์เรียง · ตัด undefined) → sha256 hex — ไม่ขึ้นกับลำดับคีย์ */
export function holdRequestHash(req: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(canonical(req))).digest("hex");
}
const newId = (prefix: string) => `${prefix}${randomUUID().replace(/-/g, "")}`;

// ═══════════════════════ ctx · input ═══════════════════════
export const ID = z.string().trim().min(1).max(128);
export const QTY = z.number().int().min(QTY_MIN).max(QTY_MAX);
export const IDEM_KEY = z.string().regex(/^[A-Za-z0-9_-]{8,100}$/);
const ACTOR = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("STAFF"), userId: ID }),
  z.object({ kind: z.literal("AGENT"), agentAccountId: ID, agentUserId: ID }),
  z.object({ kind: z.literal("PUBLIC"), clientKey: z.string().min(1).max(256) }),
  z.object({ kind: z.literal("SYSTEM"), job: z.string().min(1).max(64) }),
]);
const CTX = z.object({ tenantId: ID, unitId: ID, channel: z.enum(SELL_CHANNELS), actor: ACTOR, now: z.date().optional(), locale: z.enum(["th", "en"]).optional() });

/** ctx → Ctx · ผิดรูป/ช่องทางสาธารณะผิด ⇒ VALIDATION · AGENT ⇒ FORBIDDEN (AGENCY_NOT_ENABLED จน A1.4) */
export function parseCtx(raw: unknown): { ok: true; c: Ctx } | Failure {
  const p = CTX.safeParse(raw);
  if (!p.success) return sellFail("VALIDATION");
  const v = p.data;
  const now = v.now ?? new Date();
  if (!Number.isFinite(now.getTime())) return sellFail("VALIDATION");
  if (v.actor.kind === "AGENT") return sellFail("FORBIDDEN", { reason: "AGENCY_NOT_ENABLED" });
  if (v.actor.kind === "PUBLIC" && !PUBLIC_CHANNELS.includes(v.channel)) return sellFail("VALIDATION", { field: "channel" });
  return { ok: true, c: { tenantId: v.tenantId, unitId: v.unitId, channel: v.channel, actor: v.actor, clock: { now, iso: now.toISOString() } } };
}
export function invalidInput(e: z.ZodError): Failure {
  return sellFail("VALIDATION", { fields: [...new Set(e.issues.map((i) => i.path.join(".") || "(root)"))].slice(0, 10) });
}
/** หน่วย TRIPS ของร้าน (ไม่ใช่ ⇒ null ⇒ NOT_FOUND ข้อความเดียวกับ id ที่ไม่มีจริง · X1) */
export async function gateOf(c: Ctx): Promise<Gate | null> {
  const g = await systemGate(c.tenantId, c.unitId);
  return g ? { tenantId: g.tenantId, unitId: g.unitId, tz: g.tz } : null;
}
/**
 * หน่วย TRIPS ผ่าน tx ของผู้เรียก — *InTx ห้ามขอ connection ที่สองระหว่างถือ tx (คำขอพร้อมกันจำนวนมาก = pool หมด ⇒ ค้างจนหมดเวลา)
 */
export async function gateOfTx(tx: Tx, c: Ctx): Promise<Gate | null> {
  const rows = await tx.$queryRaw<{ id: string; type: string; settings: unknown }[]>`
    SELECT "id", "type"::text AS "type", "settings" FROM "BusinessUnit" WHERE "id" = ${c.unitId} AND "tenantId" = ${c.tenantId}`;
  const u = rows[0];
  if (!u || u.type !== "TRIPS") return null;
  const st = u.settings !== null && typeof u.settings === "object" && !Array.isArray(u.settings) ? (u.settings as Record<string, unknown>) : {};
  return { tenantId: c.tenantId, unitId: u.id, tz: normalizeTimezone(st.timezone) };
}
export function asTx(tx: unknown): Tx {
  if (tx === null || typeof tx !== "object" || typeof (tx as { $queryRaw?: unknown }).$queryRaw !== "function") throw new Error("capacity: ต้องส่ง tx ของ Prisma");
  return tx as Tx;
}

// ═══════════════════════ ค่าตั้ง (แหล่งเดียวของระยะถือ/เพดาน · ใบสั่ง §4 ข้อ 10) ═══════════════════════
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
const POLICY_KEYS = [K.T5, K.T6, K.T9, K.X2, K.X6, K.X10, K.SR, K.SD, K.SA];
const INT = z.number().int().min(0);
const SPEC = z.object({ daysBefore: INT, atMin: INT });
const T6S = SPEC.extend({ perChannel: z.partialRecord(z.enum(SELL_CHANNELS), SPEC).optional() });
const X8S = z.object({ holdPerHourPerContact: z.number().int().min(1) }).passthrough();
export type Policy = { t6: T6Value; durations: HoldDurations; showLeftAtOrBelow: number; holdCap: number };

function settingOf<T>(schema: z.ZodType<T>, key: string, v: unknown): T {
  const p = schema.safeParse(v);
  if (!p.success) throw new Error(`ค่าตั้ง ${key} ผิดรูป`);
  return p.data;
}
function policyOf(r: Record<string, { value: unknown } | undefined>): Policy {
  const supplier = settingOf(INT, K.SR, r[K.SR]?.value) + (settingOf(z.boolean(), K.SA, r[K.SA]?.value) ? 0 : settingOf(INT, K.SD, r[K.SD]?.value));
  return {
    t6: settingOf(T6S, K.T6, r[K.T6]?.value) as T6Value,
    durations: {
      holdMinutes: settingOf(INT, K.T5, r[K.T5]?.value),
      waitlistHoldMinutes: settingOf(INT, K.T9, r[K.T9]?.value),
      shopConfirmHours: settingOf(INT, K.X2, r[K.X2]?.value),
      supplierHours: supplier,
    },
    showLeftAtOrBelow: settingOf(INT, K.X6, r[K.X6]?.value),
    holdCap: settingOf(INT, K.X10, r[K.X10]?.value),
  };
}
type DepRef = { id: string; productId: string };
/** ค่าตั้งของรอบ ที่ {unitId, productId, departureId} — อ่านก่อนเปิด tx (ระบบค่าตั้งไม่มีตัวอ่านใน tx) */
export async function policyFor(g: Gate, d: DepRef, now: Date): Promise<Policy> {
  return policyOf(await resolveSettings({ tenantId: g.tenantId }, POLICY_KEYS, { unitId: g.unitId, productId: d.productId, departureId: d.id }, now));
}
async function policiesFor(g: Gate, ds: readonly DepRef[], now: Date): Promise<Policy[]> {
  const out: Policy[] = [];
  for (let i = 0; i < ds.length; i += 200) {
    const part = ds.slice(i, i + 200);
    const rs = await resolveSettingsMany({ tenantId: g.tenantId }, POLICY_KEYS, part.map((d) => ({ unitId: g.unitId, productId: d.productId, departureId: d.id })), now);
    out.push(...rs.map(policyOf));
  }
  return out;
}

// ═══════════════════════ แถวรอบ ═══════════════════════
export type DepRow = {
  id: string;
  productId: string;
  optionId: string | null;
  localDate: string;
  startsAt: Date;
  status: string;
  capacity: number;
  sold: number;
  held: number;
  reserved: number;
  minPax: number | null;
  cutoffAt: Date | null;
  stopSell: unknown;
};
type Counters = { capacity: number; sold: number; held: number; reserved: number; status: string };
const DEP_COLS = Prisma.raw(
  `"id", "productId", "optionId", to_char("localDate", 'YYYY-MM-DD') AS "localDate", "startsAt", "status", "capacity", "sold", "held", "reserved", "minPax", "cutoffAt", "stopSell"`,
);
const CNT = Prisma.raw(`"capacity", "sold", "held", "reserved", "status"`);

/** อ่านแถวรอบไม่ล็อก (หา productId/สถานะก่อนเปิด tx) */
export async function readDeparture(g: Gate, id: string, db?: Tx): Promise<DepRow | null> {
  const rows = await (db ?? (tenantDb({ tenantId: g.tenantId, unitId: g.unitId }) as unknown as Tx)).$queryRaw<DepRow[]>`
    SELECT ${DEP_COLS} FROM "TripDeparture" WHERE "id" = ${id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId}`;
  return rows[0] ?? null;
}
/** ล็อกแถวรอบ (ชั้น 1a) — ผู้เรียกที่ต้องล็อกหลายรอบเรียก id จากน้อยไปมาก */
export async function lockDeparture(tx: Tx, g: Gate, id: string): Promise<DepRow | null> {
  const rows = await tx.$queryRaw<DepRow[]>`
    SELECT ${DEP_COLS}
    FROM "TripDeparture" WHERE "id" = ${id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} FOR UPDATE`;
  return rows[0] ?? null;
}
const withCounters = (d: DepRow, c: Counters): DepRow => ({ ...d, capacity: c.capacity, sold: c.sold, held: c.held, reserved: c.reserved, status: c.status });

/** เหตุขายไม่ได้ของช่องทาง (saleBlockReason ของ T0.3) · FULL ไม่ใช่เหตุบล็อก (ที่ว่าง 0 ตามสูตร) เมื่อ fullIsOpen */
export function blockOf(d: DepRow, pol: Policy, tz: string, channel: string, now: Date, fullIsOpen: boolean): SaleBlockReason | null {
  const ref = { localDate: d.localDate, startsAt: d.startsAt };
  return saleBlockReason({ status: fullIsOpen && d.status === "FULL" ? "OPEN" : d.status, startsAt: d.startsAt, cutoffs: cutoffsFor(ref, pol.t6, tz), stopSell: d.stopSell }, channel, null, now);
}
/** เหตุบล็อก ⇒ รหัสของการถือ/ขาย (ใบสั่ง §3.3) */
function blockCode(d: DepRow, b: SaleBlockReason): SellErrorCode {
  if (b === "STATUS") return d.status === "FULL" ? "SOLD_OUT" : "SLOT_CLOSED";
  if (b === "STARTED" || b === "CUTOFF") return "CUTOFF_PASSED";
  return "SLOT_CLOSED";
}
function blockDetails(d: DepRow, b: SaleBlockReason): Record<string, unknown> | undefined {
  return b === "STATUS" && d.status === "FULL" ? { publicLeft: 0 } : undefined;
}

// ═══════════════════════ คำสั่งตัวนับ (คำสั่งเดียวต่อแถว · CC §D.1) ═══════════════════════
/** รันคำสั่งตัวนับ — CHECK 23514 (ด่านสุดท้าย) ⇒ 0 แถว ⇒ ผู้เรียก expectRows โยนรหัสที่มีชื่อ (ไม่มี 23514 ดิบถึงผู้เรียก) */
async function counterSql(tx: Tx, sql: Prisma.Sql): Promise<Counters[]> {
  try {
    return await tx.$queryRaw<Counters[]>(sql);
  } catch (e) {
    if (pgCodeOf(e) === "23514") return [];
    throw e;
  }
}
/**
 * SET ของสถานะ/guaranteedAt หลังตัวนับเปลี่ยน — นิพจน์ร่วมของ T0.3 (มติผู้คุม §13) · c = ค่า "หลังเปลี่ยน"
 * used = sold + held หลังเปลี่ยน (ใบสั่ง §4 ข้อ 3: FULL เมื่อ sold ใหม่ + held ใหม่ ≥ capacity — มีโควตาค้างจึงไม่ FULL · ข้อสอบ H-8)
 */
function statusAfter(used: Prisma.Sql, sold: Prisma.Sql, clock: Clock): Prisma.Sql {
  const c = { capacity: Prisma.sql`"capacity"`, used, sold };
  return Prisma.sql`"status" = ${departureStatusAfterCountersSql(c, { setFull: true })}, "guaranteedAt" = ${departureGuaranteedAtAfterCountersSql(c, { setFull: true, nowIso: clock.iso })}, "version" = "version" + 1, "updatedAt" = now()`;
}

/** 0 แถวของ D.1(1) ⇒ แยกเหตุจากแถว (ล็อกอยู่แล้วใน tx นี้) */
async function holdFailure(tx: Tx, g: Gate, id: string, clock: Clock): Promise<CapacityAbort> {
  const d = await lockDeparture(tx, g, id);
  if (!d) return new CapacityAbort("NOT_FOUND");
  if (d.status === "FULL") return new CapacityAbort("SOLD_OUT", { publicLeft: 0 });
  if (d.status !== "OPEN" && d.status !== "GUARANTEED") return new CapacityAbort("SLOT_CLOSED");
  if (d.cutoffAt && d.cutoffAt.getTime() <= clock.now.getTime()) return new CapacityAbort("CUTOFF_PASSED");
  return new CapacityAbort("SOLD_OUT", { publicLeft: publicLeftOf(d) });
}

/** D.1(1) ถือที่สาธารณะ: held + n */
export async function holdSeatsSql(tx: Tx, g: Gate, id: string, n: number, clock: Clock): Promise<Counters> {
  const set = statusAfter(Prisma.sql`("sold" + "held" + ${n})`, Prisma.sql`"sold"`, clock);
  const rows = await counterSql(tx, Prisma.sql`UPDATE "TripDeparture" SET "held" = "held" + ${n}, ${set}
    WHERE "id" = ${id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" IN ('OPEN', 'GUARANTEED')
      AND ("cutoffAt" IS NULL OR "cutoffAt" > ${clock.iso}::timestamp) AND "sold" + "held" + "reserved" + ${n} <= "capacity"
    RETURNING ${CNT}`);
  if (!rows.length) throw await holdFailure(tx, g, id, clock);
  return expectRows(rows, "SOLD_OUT");
}
/** D.1(2) ครึ่งรอบ: ถือจากโควตา held + n, reserved − n */
async function holdFromReservedSql(tx: Tx, g: Gate, id: string, n: number, clock: Clock): Promise<Counters> {
  const set = statusAfter(Prisma.sql`("sold" + "held" + ${n})`, Prisma.sql`"sold"`, clock);
  const rows = await counterSql(tx, Prisma.sql`UPDATE "TripDeparture" SET "held" = "held" + ${n}, "reserved" = "reserved" - ${n}, ${set}
    WHERE "id" = ${id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" IN ('OPEN', 'GUARANTEED') AND "reserved" >= ${n}
      AND ("cutoffAt" IS NULL OR "cutoffAt" > ${clock.iso}::timestamp)
    RETURNING ${CNT}`);
  return expectRows(rows, "INSUFFICIENT_ALLOTMENT");
}
/** D.1(3e) ถือ → ขาย: held − q, sold + q (q จากแถว hold ที่ CAS ได้) */
async function convertSeatsSql(tx: Tx, g: Gate, id: string, q: number, clock: Clock): Promise<Counters> {
  const set = statusAfter(Prisma.sql`("sold" + "held")`, Prisma.sql`("sold" + ${q})`, clock);
  const rows = await counterSql(tx, Prisma.sql`UPDATE "TripDeparture" SET "held" = "held" - ${q}, "sold" = "sold" + ${q}, ${set}
    WHERE "id" = ${id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "held" >= ${q}
    RETURNING ${CNT}`);
  return expectRows(rows, "STATE_CONFLICT");
}
/** D.1(4) ปล่อยที่ถือ (หมดเวลา/ยกเลิก): held − q (q = ผลรวมของแถว hold ที่ CAS ได้จริง) */
async function releaseSeatsSql(tx: Tx, g: Gate, id: string, q: number, clock: Clock): Promise<Counters> {
  const set = statusAfter(Prisma.sql`("sold" + "held" - ${q})`, Prisma.sql`"sold"`, clock);
  const rows = await counterSql(tx, Prisma.sql`UPDATE "TripDeparture" SET "held" = "held" - ${q}, ${set}
    WHERE "id" = ${id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "held" >= ${q}
    RETURNING ${CNT}`);
  return expectRows(rows, "STATE_CONFLICT");
}
/** D.1(4) ครึ่งรอบ (โควตายังไม่คืน): held − n, reserved + n */
async function unholdToReservedSql(tx: Tx, g: Gate, id: string, n: number, clock: Clock): Promise<Counters> {
  const set = statusAfter(Prisma.sql`("sold" + "held" - ${n})`, Prisma.sql`"sold"`, clock);
  const rows = await counterSql(tx, Prisma.sql`UPDATE "TripDeparture" SET "held" = "held" - ${n}, "reserved" = "reserved" + ${n}, ${set}
    WHERE "id" = ${id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "held" >= ${n}
    RETURNING ${CNT}`);
  return expectRows(rows, "STATE_CONFLICT");
}
/** D.1(5a)/(5c) คืนที่ขายแล้วกลับสาธารณะ: sold − n (ใช้กับต้นทางของการย้ายด้วย) */
async function returnSoldSql(tx: Tx, g: Gate, id: string, n: number, clock: Clock): Promise<Counters> {
  const set = statusAfter(Prisma.sql`("sold" - ${n} + "held")`, Prisma.sql`("sold" - ${n})`, clock);
  const rows = await counterSql(tx, Prisma.sql`UPDATE "TripDeparture" SET "sold" = "sold" - ${n}, ${set}
    WHERE "id" = ${id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "sold" >= ${n}
    RETURNING ${CNT}`);
  return expectRows(rows, "STATE_CONFLICT");
}
/** D.1(5b) ครึ่งรอบ: ที่จากโควตากลับเข้าโควตา sold − n, reserved + n */
async function returnSoldToReservedSql(tx: Tx, g: Gate, id: string, n: number, clock: Clock): Promise<Counters> {
  const set = statusAfter(Prisma.sql`("sold" - ${n} + "held")`, Prisma.sql`("sold" - ${n})`, clock);
  const rows = await counterSql(tx, Prisma.sql`UPDATE "TripDeparture" SET "sold" = "sold" - ${n}, "reserved" = "reserved" + ${n}, ${set}
    WHERE "id" = ${id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "sold" >= ${n}
    RETURNING ${CNT}`);
  return expectRows(rows, "STATE_CONFLICT");
}
/** ย้ายเข้า (ปลายทาง): sold + n ใต้เงื่อนไขสถานะ + ความจุ */
async function moveInSql(tx: Tx, g: Gate, id: string, n: number, clock: Clock): Promise<Counters> {
  const set = statusAfter(Prisma.sql`("sold" + ${n} + "held")`, Prisma.sql`("sold" + ${n})`, clock);
  const rows = await counterSql(tx, Prisma.sql`UPDATE "TripDeparture" SET "sold" = "sold" + ${n}, ${set}
    WHERE "id" = ${id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" IN ('OPEN', 'GUARANTEED')
      AND "sold" + "held" + "reserved" + ${n} <= "capacity"
    RETURNING ${CNT}`);
  return expectRows(rows, "SOLD_OUT");
}
/** D.1(7) ครึ่งรอบ: สร้าง/เพิ่มโควตา reserved + q */
async function reserveSeatsSql(tx: Tx, g: Gate, id: string, q: number, clock: Clock): Promise<Counters> {
  const set = statusAfter(Prisma.sql`("sold" + "held")`, Prisma.sql`"sold"`, clock);
  const rows = await counterSql(tx, Prisma.sql`UPDATE "TripDeparture" SET "reserved" = "reserved" + ${q}, ${set}
    WHERE "id" = ${id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "sold" + "held" + "reserved" + ${q} <= "capacity"
    RETURNING ${CNT}`);
  return expectRows(rows, "SOLD_OUT");
}
/** D.1(6) ครึ่งรอบ: คืนโควตา reserved − q (M-1: 0 แถว ⇒ STATE_CONFLICT ไม่ปล่อยผ่าน) */
async function unreserveSeatsSql(tx: Tx, g: Gate, id: string, q: number, clock: Clock): Promise<Counters> {
  const set = statusAfter(Prisma.sql`("sold" + "held")`, Prisma.sql`"sold"`, clock);
  const rows = await counterSql(tx, Prisma.sql`UPDATE "TripDeparture" SET "reserved" = "reserved" - ${q}, ${set}
    WHERE "id" = ${id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "reserved" >= ${q}
    RETURNING ${CNT}`);
  return expectRows(rows, "STATE_CONFLICT");
}

// ═══════════════════════ แถว hold ═══════════════════════
type HoldRow = {
  id: string;
  departureId: string;
  status: string;
  purpose: string;
  channel: string;
  qtyPublic: number;
  qtyAllot: number;
  expiresAt: Date;
  requestHash: string;
  bookingId: string | null;
  allotmentId: string | null;
};
const HOLD_COLS = Prisma.raw(`"id", "departureId", "status", "purpose", "channel", "qtyPublic", "qtyAllot", "expiresAt", "requestHash", "bookingId", "allotmentId"`);
async function readHold(db: Tx, g: Gate, id: string): Promise<HoldRow | null> {
  const rows = await db.$queryRaw<HoldRow[]>`SELECT ${HOLD_COLS} FROM "TripHold" WHERE "id" = ${id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId}`;
  return rows[0] ?? null;
}
async function readHoldByKey(db: Tx, g: Gate, key: string): Promise<HoldRow | null> {
  const rows = await db.$queryRaw<HoldRow[]>`SELECT ${HOLD_COLS} FROM "TripHold" WHERE "tenantId" = ${g.tenantId} AND "idempotencyKey" = ${key}`;
  return rows[0] ?? null;
}
const unitClient = (g: Gate) => tenantDb({ tenantId: g.tenantId, unitId: g.unitId }) as unknown as Tx;

type NewHold = {
  id: string;
  departureId: string;
  channel: SellChannel;
  qty: number;
  purpose: HoldPurpose;
  capKeyHash: string;
  requestHash: string;
  idempotencyKey: string;
  expiresAt: Date;
  bookingId: string | null;
  basketId: string | null;
};
/** INSERT hold (ชั้น 2a) · ชนคีย์กันซ้ำ ⇒ 0 แถว (ผู้เรียกตัดสิน) */
async function insertHold(tx: Tx, g: Gate, h: NewHold): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO "TripHold" ("id", "tenantId", "unitId", "departureId", "basketId", "bookingId", "channel", "qtyPublic", "qtyAllot", "unitIds", "purpose",
      "capKeyHash", "requestHash", "idempotencyKey", "status", "expiresAt", "createdAt", "updatedAt")
    VALUES (${h.id}, ${g.tenantId}, ${g.unitId}, ${h.departureId}, ${h.basketId}, ${h.bookingId}, ${h.channel}, ${h.qty}, 0, ARRAY[]::text[], ${h.purpose},
      ${h.capKeyHash}, ${h.requestHash}, ${h.idempotencyKey}, 'ACTIVE', ${h.expiresAt.toISOString()}::timestamp, clock_timestamp(), clock_timestamp())
    ON CONFLICT ("tenantId", "idempotencyKey") DO NOTHING
    RETURNING "id"`;
  return rows.length === 1;
}

// ═══════════════════════ outbox · audit ═══════════════════════
type Evt = { type: string; key: string; payload: Record<string, unknown> };
async function emit(tx: Tx, g: Gate, evts: readonly Evt[]) {
  if (!evts.length) return;
  await emitOutboxMany(
    tx,
    evts.map((e) => ({ tenantId: g.tenantId, unitId: g.unitId, type: e.type, idempotencyKey: `${e.type}:${e.key}`, payload: e.payload })),
  );
}
const holdEvt = (type: "trips.hold.created" | "trips.hold.expired", h: { id: string; departureId: string; qty: number; channel: string }): Evt => ({
  type,
  key: h.id,
  payload: { holdId: h.id, departureId: h.departureId, qty: h.qty, channel: h.channel },
});
/** audit ใน tx เดียวกับการเขียน (ไม่มีข้อมูลบุคคล) · ผู้กระทำ PUBLIC ไม่ลง audit (ไม่มีตัวตน · event พอ) */
export async function audit(tx: Tx, g: Gate, c: Ctx, action: string, targetType: string, targetId: string, after: Record<string, string | number | boolean | null>) {
  if (c.actor.kind !== "STAFF" && c.actor.kind !== "SYSTEM") return;
  await tx.auditLog.create({
    data: {
      tenantId: g.tenantId,
      unitId: g.unitId,
      actorType: c.actor.kind === "STAFF" ? "USER" : "SYSTEM",
      actorId: c.actor.kind === "STAFF" ? c.actor.userId : null,
      action,
      targetType,
      targetId,
      after: { ...after },
    },
  });
}

// ═══════════════════════ ธุรกรรม · ลองใหม่ ═══════════════════════
const PG_CODES = new Set(["40P01", "55P03", "40001", "23505", "23514"]);
export function pgCodeOf(e: unknown): string | null {
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
/** ผลพลาดที่รู้จัก ⇒ SellResult · ไม่รู้จัก ⇒ null (ผู้เรียกโยนต่อ = บั๊ก) */
function knownFailure(e: unknown): Failure | null {
  if (e instanceof CapacityAbort) return sellFail(e.code, e.details);
  if (e instanceof TripProductNotSellableError) return sellFail(e.code === "NOT_FOUND" ? "NOT_FOUND" : "SLOT_CLOSED");
  return null;
}
const TX_OPTS = { maxWait: 30_000, timeout: 60_000 } as const;
/** ธุรกรรมของหน่วย · 40P01/55P03/40001 ⇒ ลองใหม่สูงสุด LOCK_RETRIES ครั้งแล้ว BUSY · CapacityAbort ⇒ SellResult (rollback แล้ว) */
export async function runTx<T>(g: Gate, fn: (tx: Tx) => Promise<T>): Promise<SellResult<T> | { ok: false; race: true }> {
  for (let attempt = 0; ; attempt++) {
    try {
      const value = await tenantDb({ tenantId: g.tenantId, unitId: g.unitId }).$transaction((t) => fn(t as unknown as Tx), TX_OPTS);
      return { ok: true, value };
    } catch (e) {
      if (e instanceof IdemRace) return { ok: false, race: true };
      const known = knownFailure(e);
      if (known) return known;
      const code = pgCodeOf(e);
      if (code === "40P01" || code === "55P03" || code === "40001") {
        if (attempt < LOCK_RETRIES) continue;
        return sellFail("BUSY");
      }
      if (code === "TX_TIMEOUT") return sellFail("BUSY");
      if (code === "23514") return sellFail("STATE_CONFLICT");
      throw e;
    }
  }
}
function settled<T>(r: SellResult<T> | { ok: false; race: true }): SellResult<T> {
  return "race" in r ? sellFail("BUSY") : r;
}
/** ใน *InTx: แปลงผลพลาดของ ctx/input เป็นการโยน (ผู้เรียก rollback) */
function throwIfFail(f: Failure): never {
  throw new CapacityAbort(f.code, f.details);
}

// ═══════════════════════ เพดานถือ §D.6 (ชั้น 0) ═══════════════════════
async function lockCap(tx: Tx, capKeyHash: string): Promise<void> {
  await tx.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtext('trips-holdcap:' || ${capKeyHash}))`;
}
async function countCap(tx: Tx, tenantId: string, capKeyHash: string, clock: Clock): Promise<{ holds: number; seats: number }> {
  const rows = await tx.$queryRaw<{ holds: number; seats: number }[]>`
    SELECT count(*)::int AS "holds", COALESCE(sum("qtyPublic" + "qtyAllot"), 0)::int AS "seats" FROM "TripHold"
    WHERE "tenantId" = ${tenantId} AND "capKeyHash" = ${capKeyHash} AND "status" = 'ACTIVE' AND "expiresAt" > ${clock.iso}::timestamp`;
  return rows[0] ?? { holds: 0, seats: 0 };
}

// ═══════════════════════ รายการรอ: เสนอที่ในธุรกรรมที่ปล่อยที่ (ใบสั่ง §3.6) ═══════════════════════
/**
 * ใต้ล็อกแถวรอบ (ผู้เรียกล็อกแล้ว · d = ตัวนับล่าสุด) — FIFO เคร่ง (หัวคิวต้องการมากกว่าที่ว่าง ⇒ หยุด) · ทีละคน:
 * D.1(1) → INSERT hold WAITLIST_OFFER (คีย์ wl:<waitlistId> · ซ้ำ = ไม่มีข้อเสนอที่สอง) → CAS WAITING → OFFERED → event
 * ไม่เสนอเมื่อรอบไม่ OPEN|GUARANTEED หรือช่องทาง WEB ปิดรับ/หยุดขาย/เริ่มแล้ว · ไม่นับเพดาน (capKey ของข้อเสนอ = waitlist:<id> ไม่ปนกับ basket ใด)
 */
export async function offerNextInTx(tx: Tx, g: Gate, d: DepRow, pol: Policy, clock: Clock): Promise<{ offered: string[]; dep: DepRow }> {
  const offered: string[] = [];
  if (d.status !== "OPEN" && d.status !== "GUARANTEED") return { offered, dep: d };
  if (blockOf(d, pol, g.tz, WAITLIST_CHANNEL, clock.now, false) !== null) return { offered, dep: d };
  const exp = holdExpiresAt("WAITLIST_OFFER", pol.durations, clock.now);
  if (!exp) return { offered, dep: d };
  const waiting = await tx.$queryRaw<{ id: string; qty: number }[]>`
    SELECT "id", "qty" FROM "TripWaitlist"
    WHERE "departureId" = ${d.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" = 'WAITING'
    ORDER BY "createdAt", "id"`;
  let cur = d;
  for (const w of waiting) {
    if (w.qty > publicLeftOf(cur)) break; // FIFO เคร่ง
    const idem = waitlistOfferIdemKey(w.id);
    if (await readHoldByKey(tx, g, idem)) continue; // เคยเสนอแล้ว (ไม่ควรเกิด: แถวที่เคย OFFERED ไม่กลับเป็น WAITING)
    const counters = await holdSeatsSql(tx, g, d.id, w.qty, clock);
    cur = withCounters(cur, counters);
    const holdId = newId("th_");
    const ok = await insertHold(tx, g, {
      id: holdId,
      departureId: d.id,
      channel: WAITLIST_CHANNEL,
      qty: w.qty,
      purpose: "WAITLIST_OFFER",
      capKeyHash: holdCapKeyHash(waitlistCapKey(w.id)),
      requestHash: holdRequestHash({ departureId: d.id, qty: w.qty, purpose: "WAITLIST_OFFER" }),
      idempotencyKey: idem,
      expiresAt: exp,
      bookingId: null,
      basketId: null,
    });
    if (!ok) throw new CapacityAbort("STATE_CONFLICT");
    const upd = await tx.$queryRaw<{ id: string }[]>`
      UPDATE "TripWaitlist" SET "status" = 'OFFERED', "offerHoldId" = ${holdId}, "offerExpiresAt" = ${exp.toISOString()}::timestamp, "updatedAt" = now()
      WHERE "id" = ${w.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" = 'WAITING'
      RETURNING "id"`;
    expectRows(upd, "STATE_CONFLICT");
    await emit(tx, g, [
      holdEvt("trips.hold.created", { id: holdId, departureId: d.id, qty: w.qty, channel: WAITLIST_CHANNEL }),
      { type: "trips.waitlist.offered", key: w.id, payload: { waitlistId: w.id, departureId: d.id, holdId } },
    ]);
    offered.push(w.id);
  }
  return { offered, dep: cur };
}

/** CAS แถวรายการรอของข้อเสนอที่ hold นี้ถืออยู่ (OFFERED → to) — ชั้น 2a′ หลัง CAS hold */
async function settleOfferRows(tx: Tx, g: Gate, holdIds: readonly string[], to: "ACCEPTED" | "EXPIRED" | "CANCELLED"): Promise<number> {
  if (!holdIds.length) return 0;
  const rows = await tx.$queryRaw<{ id: string }[]>`
    UPDATE "TripWaitlist" SET "status" = ${to}, "updatedAt" = now()
    WHERE "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "offerHoldId" = ANY(${[...holdIds]}::text[]) AND "status" = 'OFFERED'
    RETURNING "id"`;
  return rows.length;
}

// ═══════════════════════ ที่ว่าง (R2 · ใบสั่ง §3.2) ═══════════════════════
export type AvailabilityValue = AvailabilityRow & { saleBlock: SaleBlockReason | null; showLeft: boolean; cutoffAt: string };
function availabilityOf(d: DepRow, pol: Policy, tz: string, channel: SellChannel, now: Date): AvailabilityValue {
  const saleBlock = blockOf(d, pol, tz, channel, now, true);
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
    cutoffAt: cutoffFor({ localDate: d.localDate, startsAt: d.startsAt }, pol.t6, channel, tz).toISOString(),
  };
}

const getAvailabilityInput = z.strictObject({ departureId: ID });
export async function getAvailability(ctx: unknown, input: unknown): Promise<SellResult<AvailabilityValue>> {
  const pc = parseCtx(ctx);
  if (!pc.ok) return pc;
  const p = getAvailabilityInput.safeParse(input);
  if (!p.success) return invalidInput(p.error);
  const g = await gateOf(pc.c);
  if (!g) return sellFail("NOT_FOUND");
  const d = await readDeparture(g, p.data.departureId);
  if (!d) return sellFail("NOT_FOUND");
  const pol = await policyFor(g, d, pc.c.clock.now);
  return { ok: true, value: availabilityOf(d, pol, g.tz, pc.c.channel, pc.c.clock.now) };
}

const listAvailabilityInput = z.strictObject({
  productId: ID,
  from: z.string().refine(isYmd),
  to: z.string().refine(isYmd),
  optionId: ID.optional(),
  paxTotal: z.number().int().min(0).max(QTY_MAX).optional(),
});
/** รอบของสินค้าในช่วงวัน (≤ 62 วัน) เรียง startsAt, id · รวม CANCELLED (saleBlock STATUS) · สินค้าร้าน/หน่วยอื่น = ว่าง */
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
  const optionFilter = v.optionId ? Prisma.sql`AND "optionId" = ${v.optionId}` : Prisma.empty;
  const rows = await tenantDb({ tenantId: g.tenantId, unitId: g.unitId }).$queryRaw<DepRow[]>`
    SELECT ${DEP_COLS} FROM "TripDeparture"
    WHERE "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "productId" = ${v.productId} ${optionFilter}
      AND "localDate" >= ${v.from}::date AND "localDate" <= ${v.to}::date
    ORDER BY "startsAt", "id"`;
  const pols = await policiesFor(g, rows, pc.c.clock.now);
  return { ok: true, value: rows.map((d, i) => availabilityOf(d, pols[i], g.tz, pc.c.channel, pc.c.clock.now)) };
}

// ═══════════════════════ ถือที่ (ใบสั่ง §3.3) ═══════════════════════
export type PlaceHoldValue = { holdId: string; departureId: string; qty: number; purpose: string; status: string; expiresAt: string; publicLeft: number; duplicated: boolean };
const placeHoldInput = z.strictObject({
  departureId: ID,
  qty: QTY,
  idempotencyKey: IDEM_KEY,
  purpose: z.enum(HOLD_PURPOSES).optional(),
  capKey: z.string().min(1).max(200).optional(),
  bookingId: ID.optional(),
  basketId: ID.optional(),
});
const BASKET_CAP = /^basket:([A-Za-z0-9_-]{8,128})$/;
const PURPOSES_BY_ACTOR: Record<"PUBLIC" | "STAFF" | "SYSTEM", readonly HoldPurpose[]> = {
  PUBLIC: ["PAYMENT"],
  STAFF: ["PAYMENT", "SHOP_CONFIRM"],
  SYSTEM: ["SUPPLIER_REQUEST"],
};

async function duplicateValue(g: Gate, h: HoldRow): Promise<PlaceHoldValue> {
  const d = await readDeparture(g, h.departureId);
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
 * ลำดับ (ใบสั่ง §3.3): zod → PUBLIC: rate limit (ก่อนค้นรอบ) → กันซ้ำ → อ่านรอบ → ปิดรับ/สถานะของ ctx.channel →
 * tx: สินค้า FOR SHARE → ชั้น 0 เพดาน (PUBLIC) → 1a ล็อกรอบ → D.1(1) → 2a INSERT hold → 2h outbox
 */
export async function placeHold(ctx: unknown, input: unknown): Promise<SellResult<PlaceHoldValue>> {
  const pc = parseCtx(ctx);
  if (!pc.ok) return pc;
  const c = pc.c;
  const p = placeHoldInput.safeParse(input);
  if (!p.success) return invalidInput(p.error);
  const v = p.data;
  const purpose: HoldPurpose = v.purpose ?? "PAYMENT";
  const actorKind = c.actor.kind;
  if (actorKind === "AGENT") return sellFail("FORBIDDEN", { reason: "AGENCY_NOT_ENABLED" });
  if (!PURPOSES_BY_ACTOR[actorKind].includes(purpose)) return sellFail("VALIDATION", { fields: ["purpose"] });
  let basketHash: string | undefined;
  if (c.actor.kind === "PUBLIC") {
    const m = BASKET_CAP.exec(v.capKey ?? "");
    if (!m) return sellFail("VALIDATION", { fields: ["capKey"] });
    basketHash = m[1];
    // X7: ก่อนค้นรอบ ⇒ id ที่ไม่มี/ของร้านอื่นกินโควตาเหมือนกัน (CC :965 · ต่อ tenantId + clientKey)
    const r = await resolveSettings({ tenantId: c.tenantId }, [K.X8], { unitId: c.unitId }, c.clock.now);
    const limit = settingOf(X8S, K.X8, r[K.X8]?.value).holdPerHourPerContact;
    const verdict = await checkRateLimitDb(`trips:hold:${c.tenantId}:${c.actor.clientKey}`, { limit, windowMs: RATE_WINDOW_MS }, c.clock.now.getTime());
    if (!verdict.ok) return sellFail("RATE_LIMITED", { retryAfterSec: verdict.retryAfterSec ?? null });
  }
  const g = await gateOf(c);
  if (!g) return sellFail("NOT_FOUND");
  const idem = idemKeyFor(c.actor, v.idempotencyKey, basketHash);
  const requestHash = holdRequestHash({ departureId: v.departureId, qty: v.qty, purpose, bookingId: v.bookingId ?? null, basketId: v.basketId ?? null });
  const resolveDup = async (h: HoldRow): Promise<SellResult<PlaceHoldValue>> =>
    h.requestHash === requestHash ? { ok: true, value: await duplicateValue(g, h) } : sellFail("IDEMPOTENCY_CONFLICT");

  const prior = await readHoldByKey(unitClient(g), g, idem);
  if (prior) return resolveDup(prior);
  const d0 = await readDeparture(g, v.departureId);
  if (!d0) return sellFail("NOT_FOUND");
  const pol = await policyFor(g, d0, c.clock.now);
  const b0 = blockOf(d0, pol, g.tz, c.channel, c.clock.now, false);
  if (b0) return sellFail(blockCode(d0, b0), blockDetails(d0, b0));
  const expiresAt = holdExpiresAt(purpose, pol.durations, c.clock.now);
  if (!expiresAt) return sellFail("VALIDATION", { fields: ["purpose"] });
  const capKey = c.actor.kind === "PUBLIC" ? (v.capKey ?? "") : ownCapKeyOf(c.actor);
  const capKeyHash = holdCapKeyHash(capKey);
  const counted = c.actor.kind === "PUBLIC";

  const r = await runTx(g, async (tx): Promise<{ dup: HoldRow } | { value: PlaceHoldValue }> => {
    await assertProductSellableInTx(tx, { tenantId: g.tenantId, unitId: g.unitId, productId: d0.productId, optionId: d0.optionId });
    if (counted) {
      await lockCap(tx, capKeyHash);
      const dup = await readHoldByKey(tx, g, idem);
      if (dup) return { dup };
      const n = await countCap(tx, g.tenantId, capKeyHash, c.clock);
      if (n.holds + 1 > pol.holdCap) throw new CapacityAbort("HOLD_LIMIT", { limit: pol.holdCap });
    }
    const d = await lockDeparture(tx, g, v.departureId);
    if (!d) throw new CapacityAbort("NOT_FOUND");
    const dup = await readHoldByKey(tx, g, idem);
    if (dup) return { dup };
    const b = blockOf(d, pol, g.tz, c.channel, c.clock.now, false);
    if (b) throw new CapacityAbort(blockCode(d, b), blockDetails(d, b));
    if (publicLeftOf(d) < v.qty) throw new CapacityAbort("SOLD_OUT", { publicLeft: Math.max(0, publicLeftOf(d)) });
    const counters = await holdSeatsSql(tx, g, d.id, v.qty, c.clock);
    const holdId = newId("th_");
    const inserted = await insertHold(tx, g, {
      id: holdId,
      departureId: d.id,
      channel: c.channel,
      qty: v.qty,
      purpose,
      capKeyHash,
      requestHash,
      idempotencyKey: idem,
      expiresAt,
      bookingId: v.bookingId ?? null,
      basketId: v.basketId ?? null,
    });
    if (!inserted) throw new IdemRace();
    await emit(tx, g, [holdEvt("trips.hold.created", { id: holdId, departureId: d.id, qty: v.qty, channel: c.channel })]);
    await audit(tx, g, c, "trips.hold.place", "TripHold", holdId, { departureId: d.id, qty: v.qty, purpose });
    return {
      value: { holdId, departureId: d.id, qty: v.qty, purpose, status: "ACTIVE", expiresAt: expiresAt.toISOString(), publicLeft: publicLeftOf(counters), duplicated: false },
    };
  });
  if ("race" in r) {
    const h = await readHoldByKey(unitClient(g), g, idem);
    return h ? resolveDup(h) : sellFail("BUSY");
  }
  if (!r.ok) return r;
  return "dup" in r.value ? resolveDup(r.value.dup) : { ok: true, value: r.value.value };
}

// ═══════════════════════ ต่ออายุ ═══════════════════════
const holdRefInput = z.strictObject({ holdId: ID });
/** ต่ออายุ = now + ระยะของ purpose (CAS ACTIVE + ยังไม่หมด) · PAYMENT/WAITLIST_OFFER ต่อไม่ได้ */
export async function extendHold(ctx: unknown, input: unknown): Promise<SellResult<{ holdId: string; expiresAt: string }>> {
  const pc = parseCtx(ctx);
  if (!pc.ok) return pc;
  const c = pc.c;
  const p = holdRefInput.safeParse(input);
  if (!p.success) return invalidInput(p.error);
  const g = await gateOf(c);
  if (!g) return sellFail("HOLD_NOT_FOUND");
  const h = await readHold(unitClient(g), g, p.data.holdId);
  if (!h) return sellFail("HOLD_NOT_FOUND");
  if (h.purpose === "PAYMENT" || h.purpose === "WAITLIST_OFFER") return sellFail("STATE_CONFLICT", { reason: "PURPOSE_NOT_EXTENDABLE" });
  const d = await readDeparture(g, h.departureId);
  if (!d) return sellFail("HOLD_NOT_FOUND");
  const exp = holdExpiresAt(h.purpose, (await policyFor(g, d, c.clock.now)).durations, c.clock.now);
  if (!exp) return sellFail("STATE_CONFLICT", { reason: "PURPOSE_NOT_EXTENDABLE" });
  return settled(
    await runTx(g, async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        UPDATE "TripHold" SET "expiresAt" = ${exp.toISOString()}::timestamp, "updatedAt" = now()
        WHERE "id" = ${h.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" = 'ACTIVE' AND "expiresAt" > ${c.clock.iso}::timestamp
        RETURNING "id"`;
      if (!rows.length) {
        const cur = await readHold(tx, g, h.id);
        throw new CapacityAbort(!cur ? "HOLD_NOT_FOUND" : cur.status === "CONVERTED" ? "STATE_CONFLICT" : "HOLD_EXPIRED");
      }
      await audit(tx, g, c, "trips.hold.extend", "TripHold", h.id, { expiresAt: exp.toISOString() });
      return { holdId: h.id, expiresAt: exp.toISOString() };
    }),
  );
}

// ═══════════════════════ แปลง (D.1(3) · M-3) ═══════════════════════
export type ConvertValue = { holdId: string; departureId: string; qty: number; sold: number };
async function convertCore(tx: Tx, g: Gate, c: Ctx, holdId: string): Promise<ConvertValue> {
  const h0 = await readHold(tx, g, holdId);
  if (!h0) throw new CapacityAbort("HOLD_NOT_FOUND");
  if (h0.qtyAllot > 0) throw new CapacityAbort("STATE_CONFLICT", { reason: "ALLOTMENT_NOT_SUPPORTED" });
  const d = await lockDeparture(tx, g, h0.departureId); // 1a
  if (!d) throw new CapacityAbort("HOLD_NOT_FOUND");
  if (d.status === "CANCELLED") throw new CapacityAbort("SLOT_CLOSED");
  const cas = await tx.$queryRaw<{ qtyPublic: number; qtyAllot: number; purpose: string }[]>`
    UPDATE "TripHold" SET "status" = 'CONVERTED', "updatedAt" = now()
    WHERE "id" = ${h0.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "departureId" = ${d.id} AND "status" = 'ACTIVE' AND "expiresAt" > ${c.clock.iso}::timestamp
    RETURNING "qtyPublic", "qtyAllot", "purpose"`;
  if (!cas.length) {
    const cur = await readHold(tx, g, h0.id);
    throw new CapacityAbort(!cur ? "HOLD_NOT_FOUND" : cur.status === "CONVERTED" ? "STATE_CONFLICT" : "HOLD_EXPIRED");
  }
  const h = expectRows(cas, "HOLD_EXPIRED");
  const q = h.qtyPublic + h.qtyAllot;
  const counters = await convertSeatsSql(tx, g, d.id, q, c.clock);
  if (h.purpose === "WAITLIST_OFFER") await settleOfferRows(tx, g, [h0.id], "ACCEPTED");
  await audit(tx, g, c, "trips.hold.convert", "TripHold", h0.id, { departureId: d.id, qty: q });
  return { holdId: h0.id, departureId: d.id, qty: q, sold: counters.sold };
}
export async function convertHold(ctx: unknown, input: unknown): Promise<SellResult<ConvertValue>> {
  const pc = parseCtx(ctx);
  if (!pc.ok) return pc;
  const p = holdRefInput.safeParse(input);
  if (!p.success) return invalidInput(p.error);
  const g = await gateOf(pc.c);
  if (!g) return sellFail("HOLD_NOT_FOUND");
  return settled(await runTx(g, (tx) => convertCore(tx, g, pc.c, p.data.holdId)));
}
/** แปลงในธุรกรรมของผู้เรียก (T0.6 confirm) — ปฏิเสธ ⇒ โยน CapacityAbort */
export async function convertHoldInTx(tx: unknown, ctx: unknown, input: unknown): Promise<SellResult<ConvertValue>> {
  const t = asTx(tx);
  const pc = parseCtx(ctx);
  if (!pc.ok) throwIfFail(pc);
  const p = holdRefInput.safeParse(input);
  if (!p.success) throwIfFail(invalidInput(p.error));
  const g = await gateOfTx(t, pc.c);
  if (!g) throw new CapacityAbort("HOLD_NOT_FOUND");
  return { ok: true, value: await convertCore(t, g, pc.c, p.data.holdId) };
}

// ═══════════════════════ ปล่อย (D.1(4)) ═══════════════════════
export type ReleaseValue = { holdId: string; status: "RELEASED"; duplicated: boolean };
const releaseInput = z.strictObject({ holdId: ID, reason: z.string().trim().min(1).max(200) });

/** ปล่อย hold ที่ CAS ได้ใต้ล็อกรอบ (ผู้เรียกล็อกรอบแล้ว) — คืนตัวนับ · ข้อเสนอที่ถืออยู่ ⇒ แถวรายการรอ (to) · คืนแถวรอบล่าสุด */
export async function releaseLockedHold(tx: Tx, g: Gate, c: Ctx, d: DepRow, holdId: string, reason: string, offerTo: "CANCELLED" | "DECLINED"): Promise<{ dep: DepRow; released: boolean; current: string | null }> {
  const cas = await tx.$queryRaw<{ qtyPublic: number; qtyAllot: number; purpose: string }[]>`
    UPDATE "TripHold" SET "status" = 'RELEASED', "releasedReason" = ${reason}, "updatedAt" = now()
    WHERE "id" = ${holdId} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "departureId" = ${d.id} AND "status" = 'ACTIVE'
    RETURNING "qtyPublic", "qtyAllot", "purpose"`;
  if (!cas.length) {
    const cur = await readHold(tx, g, holdId);
    return { dep: d, released: false, current: cur?.status ?? null };
  }
  const h = expectRows(cas, "HOLD_EXPIRED");
  const counters = await releaseSeatsSql(tx, g, d.id, h.qtyPublic + h.qtyAllot, c.clock);
  if (h.purpose === "WAITLIST_OFFER") {
    await tx.$queryRaw<{ id: string }[]>`
      UPDATE "TripWaitlist" SET "status" = ${offerTo}, "updatedAt" = now()
      WHERE "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "offerHoldId" = ${holdId} AND "status" = 'OFFERED'
      RETURNING "id"`;
  }
  return { dep: withCounters(d, counters), released: true, current: "RELEASED" };
}

async function releaseCore(tx: Tx, g: Gate, c: Ctx, holdId: string, reason: string, pol: Policy | null): Promise<ReleaseValue> {
  const h0 = await readHold(tx, g, holdId);
  if (!h0) throw new CapacityAbort("HOLD_NOT_FOUND");
  if (h0.status === "RELEASED") return { holdId, status: "RELEASED", duplicated: true };
  if (h0.status === "CONVERTED") throw new CapacityAbort("STATE_CONFLICT");
  if (h0.status === "EXPIRED") throw new CapacityAbort("HOLD_EXPIRED");
  if (h0.qtyAllot > 0) throw new CapacityAbort("STATE_CONFLICT", { reason: "ALLOTMENT_NOT_SUPPORTED" });
  let policy = pol;
  if (!policy) {
    // *InTx: ค่าตั้งอ่านก่อนล็อกรอบ (ระบบค่าตั้งไม่มีตัวอ่านใน tx · หนี้ T0.3)
    const d0 = await readDeparture(g, h0.departureId, tx);
    if (!d0) throw new CapacityAbort("HOLD_NOT_FOUND");
    policy = await policyFor(g, d0, c.clock.now);
  }
  const d = await lockDeparture(tx, g, h0.departureId); // 1a
  if (!d) throw new CapacityAbort("HOLD_NOT_FOUND");
  const r = await releaseLockedHold(tx, g, c, d, holdId, reason, "CANCELLED"); // 2a (+2a′)
  if (!r.released) {
    if (r.current === "RELEASED") return { holdId, status: "RELEASED", duplicated: true };
    throw new CapacityAbort(r.current === "CONVERTED" ? "STATE_CONFLICT" : r.current === null ? "HOLD_NOT_FOUND" : "HOLD_EXPIRED");
  }
  await offerNextInTx(tx, g, r.dep, policy, c.clock); // เสนอรายการรอในทีเดียวกัน
  await audit(tx, g, c, "trips.hold.release", "TripHold", holdId, { departureId: d.id });
  return { holdId, status: "RELEASED", duplicated: false };
}
export async function releaseHold(ctx: unknown, input: unknown): Promise<SellResult<ReleaseValue>> {
  const pc = parseCtx(ctx);
  if (!pc.ok) return pc;
  const p = releaseInput.safeParse(input);
  if (!p.success) return invalidInput(p.error);
  const g = await gateOf(pc.c);
  if (!g) return sellFail("HOLD_NOT_FOUND");
  const h = await readHold(unitClient(g), g, p.data.holdId);
  if (!h) return sellFail("HOLD_NOT_FOUND");
  const d = await readDeparture(g, h.departureId);
  if (!d) return sellFail("HOLD_NOT_FOUND");
  const pol = await policyFor(g, d, pc.c.clock.now); // ก่อนเปิด tx
  return settled(await runTx(g, (tx) => releaseCore(tx, g, pc.c, p.data.holdId, p.data.reason, pol)));
}
export async function releaseHoldInTx(tx: unknown, ctx: unknown, input: unknown): Promise<SellResult<ReleaseValue>> {
  const t = asTx(tx);
  const pc = parseCtx(ctx);
  if (!pc.ok) throwIfFail(pc);
  const p = releaseInput.safeParse(input);
  if (!p.success) throwIfFail(invalidInput(p.error));
  const g = await gateOfTx(t, pc.c);
  if (!g) throw new CapacityAbort("HOLD_NOT_FOUND");
  return { ok: true, value: await releaseCore(t, g, pc.c, p.data.holdId, p.data.reason, null) };
}

// ═══════════════════════ คืน · ย้าย (ใบสั่ง §3.4) ═══════════════════════
export type CountersValue = { departureId: string; capacity: number; sold: number; held: number; reserved: number; status: string };
const cv = (id: string, k: Counters): CountersValue => ({ departureId: id, capacity: k.capacity, sold: k.sold, held: k.held, reserved: k.reserved, status: k.status });
const returnInput = z.strictObject({ departureId: ID, qty: QTY, toReserved: z.boolean().optional() });

async function returnCore(tx: Tx, g: Gate, c: Ctx, v: z.infer<typeof returnInput>, pol: Policy | null): Promise<CountersValue> {
  let policy = pol;
  if (!policy && !v.toReserved) {
    const d0 = await readDeparture(g, v.departureId, tx);
    if (!d0) throw new CapacityAbort("NOT_FOUND");
    policy = await policyFor(g, d0, c.clock.now);
  }
  const d = await lockDeparture(tx, g, v.departureId);
  if (!d) throw new CapacityAbort("NOT_FOUND");
  const k = v.toReserved ? await returnSoldToReservedSql(tx, g, d.id, v.qty, c.clock) : await returnSoldSql(tx, g, d.id, v.qty, c.clock);
  if (policy) await offerNextInTx(tx, g, withCounters(d, k), policy, c.clock);
  await audit(tx, g, c, "trips.seat.return", "TripDeparture", d.id, { qty: v.qty, toReserved: v.toReserved === true });
  const after = await lockDeparture(tx, g, d.id);
  return cv(d.id, after ?? k);
}
export async function returnSold(ctx: unknown, input: unknown): Promise<SellResult<CountersValue>> {
  const pc = parseCtx(ctx);
  if (!pc.ok) return pc;
  const p = returnInput.safeParse(input);
  if (!p.success) return invalidInput(p.error);
  const g = await gateOf(pc.c);
  if (!g) return sellFail("NOT_FOUND");
  const d = await readDeparture(g, p.data.departureId);
  if (!d) return sellFail("NOT_FOUND");
  const pol = await policyFor(g, d, pc.c.clock.now);
  return settled(await runTx(g, (tx) => returnCore(tx, g, pc.c, p.data, pol)));
}
export async function returnSoldInTx(tx: unknown, ctx: unknown, input: unknown): Promise<SellResult<CountersValue>> {
  const t = asTx(tx);
  const pc = parseCtx(ctx);
  if (!pc.ok) throwIfFail(pc);
  const p = returnInput.safeParse(input);
  if (!p.success) throwIfFail(invalidInput(p.error));
  const g = await gateOfTx(t, pc.c);
  if (!g) throw new CapacityAbort("NOT_FOUND");
  return { ok: true, value: await returnCore(t, g, pc.c, p.data, null) };
}

const moveInput = z.strictObject({ fromDepartureId: ID, toDepartureId: ID, qty: QTY }).refine((v) => v.fromDepartureId !== v.toDepartureId, { message: "รอบต้นทางและปลายทางต้องต่างกัน" });
export type MoveValue = { from: CountersValue; to: CountersValue; qty: number };
type MovePols = { from: Policy; to: Policy; toProduct: { productId: string; optionId: string | null } };

/** ล็อกทั้งสองรอบเรียง id (1a) → ปลายทางตรวจปิดรับของ ctx.channel → ต้นทาง sold − n → ปลายทาง sold + n · ผลรวม sold คงที่ · ไม่นับเพดาน */
async function moveCore(tx: Tx, g: Gate, c: Ctx, v: z.infer<typeof moveInput>, pols: MovePols): Promise<MoveValue> {
  await assertProductSellableInTx(tx, { tenantId: g.tenantId, unitId: g.unitId, productId: pols.toProduct.productId, optionId: pols.toProduct.optionId });
  const locked = new Map<string, DepRow>();
  for (const id of [v.fromDepartureId, v.toDepartureId].sort()) {
    const d = await lockDeparture(tx, g, id);
    if (!d) throw new CapacityAbort("NOT_FOUND");
    locked.set(id, d);
  }
  const from = locked.get(v.fromDepartureId);
  const to = locked.get(v.toDepartureId);
  if (!from || !to) throw new CapacityAbort("NOT_FOUND");
  const b = blockOf(to, pols.to, g.tz, c.channel, c.clock.now, false);
  if (b) throw new CapacityAbort(blockCode(to, b), blockDetails(to, b));
  const kFrom = await returnSoldSql(tx, g, from.id, v.qty, c.clock);
  const kTo = await moveInSql(tx, g, to.id, v.qty, c.clock);
  await offerNextInTx(tx, g, withCounters(from, kFrom), pols.from, c.clock);
  await audit(tx, g, c, "trips.seat.move", "TripDeparture", from.id, { toDepartureId: to.id, qty: v.qty });
  return { from: cv(from.id, kFrom), to: cv(to.id, kTo), qty: v.qty };
}
async function movePolicies(g: Gate, v: z.infer<typeof moveInput>, now: Date, db?: Tx): Promise<MovePols | null> {
  const from = await readDeparture(g, v.fromDepartureId, db);
  const to = await readDeparture(g, v.toDepartureId, db);
  if (!from || !to) return null;
  const [pf, pt] = await policiesFor(g, [from, to], now);
  return { from: pf, to: pt, toProduct: { productId: to.productId, optionId: to.optionId } };
}
export async function moveSold(ctx: unknown, input: unknown): Promise<SellResult<MoveValue>> {
  const pc = parseCtx(ctx);
  if (!pc.ok) return pc;
  const p = moveInput.safeParse(input);
  if (!p.success) return invalidInput(p.error);
  const g = await gateOf(pc.c);
  if (!g) return sellFail("NOT_FOUND");
  const pols = await movePolicies(g, p.data, pc.c.clock.now);
  if (!pols) return sellFail("NOT_FOUND");
  return settled(await runTx(g, (tx) => moveCore(tx, g, pc.c, p.data, pols)));
}
export async function moveSoldInTx(tx: unknown, ctx: unknown, input: unknown): Promise<SellResult<MoveValue>> {
  const t = asTx(tx);
  const pc = parseCtx(ctx);
  if (!pc.ok) throwIfFail(pc);
  const p = moveInput.safeParse(input);
  if (!p.success) throwIfFail(invalidInput(p.error));
  const g = await gateOfTx(t, pc.c);
  if (!g) throw new CapacityAbort("NOT_FOUND");
  const pols = await movePolicies(g, p.data, pc.c.clock.now, t);
  if (!pols) throw new CapacityAbort("NOT_FOUND");
  return { ok: true, value: await moveCore(t, g, pc.c, p.data, pols) };
}

// ═══════════════════════ ครึ่งฝั่งรอบของโควตา (A1.4 เรียก · ใบสั่ง §3.4) ═══════════════════════
const seatsInput = z.strictObject({ departureId: ID, qty: QTY });
type SeatsSql = (tx: Tx, g: Gate, id: string, n: number, clock: Clock) => Promise<Counters>;
async function seatsInTx(tx: unknown, ctx: unknown, input: unknown, stmt: SeatsSql): Promise<SellResult<CountersValue>> {
  const t = asTx(tx);
  const pc = parseCtx(ctx);
  if (!pc.ok) throwIfFail(pc);
  const p = seatsInput.safeParse(input);
  if (!p.success) throwIfFail(invalidInput(p.error));
  const g = await gateOfTx(t, pc.c);
  if (!g) throw new CapacityAbort("NOT_FOUND");
  const d = await lockDeparture(t, g, p.data.departureId); // 1a
  if (!d) throw new CapacityAbort("NOT_FOUND");
  return { ok: true, value: cv(d.id, await stmt(t, g, d.id, p.data.qty, pc.c.clock)) };
}
/** D.1(7) ครึ่งรอบ: reserved + q ใต้ความจุ (0 แถว ⇒ SOLD_OUT) */
export async function reserveSeatsInTx(tx: unknown, ctx: unknown, input: unknown): Promise<SellResult<CountersValue>> {
  return seatsInTx(tx, ctx, input, reserveSeatsSql);
}
/** D.1(6) ครึ่งรอบ: reserved − q (0 แถว ⇒ STATE_CONFLICT · M-1) */
export async function unreserveSeatsInTx(tx: unknown, ctx: unknown, input: unknown): Promise<SellResult<CountersValue>> {
  return seatsInTx(tx, ctx, input, unreserveSeatsSql);
}
/** D.1(2) ครึ่งรอบ: held + n, reserved − n (0 แถว ⇒ INSUFFICIENT_ALLOTMENT) */
export async function holdFromReservedInTx(tx: unknown, ctx: unknown, input: unknown): Promise<SellResult<CountersValue>> {
  return seatsInTx(tx, ctx, input, holdFromReservedSql);
}
/** D.1(4) ครึ่งรอบ โควตายังไม่คืน: held − n, reserved + n (0 แถว ⇒ STATE_CONFLICT) */
export async function unholdToReservedInTx(tx: unknown, ctx: unknown, input: unknown): Promise<SellResult<CountersValue>> {
  return seatsInTx(tx, ctx, input, unholdToReservedSql);
}

// ═══════════════════════ Sellable เฟส 1 (CC :337 :338 · N-8) ═══════════════════════
/** อ่านไม่ล็อก: แถวเฟส 1 ของบรรทัด/ของ hold · ไม่พบ/ctx ผิด = [] (ผู้เรียกถือเป็น NOT_FOUND) */
export async function capacityRowsOf(ctx: unknown, line: LineRequest | { holdId: string }): Promise<CapacityRowRef[]> {
  const pc = parseCtx(ctx);
  if (!pc.ok) return [];
  const g = await gateOf(pc.c);
  if (!g || line === null || typeof line !== "object") return [];
  if ("holdId" in line) {
    if (typeof line.holdId !== "string" || !line.holdId) return [];
    const h = await readHold(unitClient(g), g, line.holdId);
    if (!h) return [];
    const rows: CapacityRowRef[] = [{ layer: "1a", table: "TripDeparture", id: h.departureId, sortKey: h.departureId }];
    if (h.allotmentId) rows.push({ layer: "1b", table: "AgentAllotment", id: h.allotmentId, sortKey: h.allotmentId });
    return rows;
  }
  if (line.productKind !== "TRIP" || typeof line.slotId !== "string" || !line.slotId) return [];
  const d = await readDeparture(g, line.slotId);
  if (!d || (typeof line.productId === "string" && line.productId && line.productId !== d.productId)) return [];
  return [{ layer: "1a", table: "TripDeparture", id: d.id, sortKey: d.id }];
}

const INTENT = z.object({
  op: z.enum(["HOLD", "CONVERT", "RELEASE", "MOVE"]),
  qtyPublic: z.number().int().min(0).max(QTY_MAX),
  qtyAllot: z.number().int().min(0).max(QTY_MAX),
  allotmentId: ID.optional(),
  unitIds: z.array(ID).max(QTY_MAX).optional(),
});
const ROW = z.object({ layer: z.enum(["1a", "1b", "1c"]), table: z.string().min(1).max(64), id: ID, sortKey: z.string().max(256) });
/**
 * เฟส 1 ทีละแถว (ตะกร้าเรียกตามลำดับ sortCapacityRows) — แถวรอบ + HOLD = D.1(1) ด้วย qtyPublic (+ D.1(2) ด้วย qtyAllot)
 * CONVERT/RELEASE/MOVE = SELECT … FOR UPDATE อย่างเดียว (ตัวนับปรับใน *InTx) · ปฏิเสธ ⇒ โยน CapacityAbort (ผู้เรียก rollback)
 */
export async function reserveInTx(tx: unknown, ctx: unknown, rows: unknown, intent: unknown): Promise<SellResult<Reservation>> {
  const t = asTx(tx);
  const pc = parseCtx(ctx);
  if (!pc.ok) throwIfFail(pc);
  const pr = z.array(ROW).min(1).max(QTY_MAX).safeParse(rows);
  const pi = INTENT.safeParse(intent);
  if (!pr.success) throwIfFail(invalidInput(pr.error));
  if (!pi.success) throwIfFail(invalidInput(pi.error));
  const it = pi.data;
  if (it.op === "HOLD" && it.qtyPublic + it.qtyAllot === 0) throwIfFail(sellFail("VALIDATION", { fields: ["qtyPublic"] }));
  const g = await gateOfTx(t, pc.c);
  if (!g) throw new CapacityAbort("NOT_FOUND");
  let slotId = "";
  for (const r of sortCapacityRows(pr.data)) {
    if (r.table !== "TripDeparture") throw new CapacityAbort("KIND_NOT_SUPPORTED");
    const d = await lockDeparture(t, g, r.id); // 1a
    if (!d) throw new CapacityAbort("NOT_FOUND");
    if (it.op === "HOLD") {
      if (it.qtyAllot > 0) await holdFromReservedSql(t, g, d.id, it.qtyAllot, pc.c.clock);
      if (it.qtyPublic > 0) await holdSeatsSql(t, g, d.id, it.qtyPublic, pc.c.clock);
    }
    slotId = d.id;
  }
  return {
    ok: true,
    value: { kind: "TRIP", slotId, qtyPublic: it.qtyPublic, qtyAllot: it.qtyAllot, unitIds: it.unitIds ?? [], ...(it.allotmentId ? { allotmentId: it.allotmentId } : {}) },
  };
}

const capInput = z.strictObject({ capKey: z.string().min(1).max(200), mode: z.enum(["HOLDS", "SEATS"]), add: z.number().int().min(0).max(2_147_483_647), limit: z.number().int().min(0).max(2_147_483_647) });
/** ชั้น 0: advisory lock ของ capKey แล้วนับ ACTIVE ที่ยังไม่หมดเวลา (HOLDS = แถว · SEATS = Σ qty) · count + add > limit ⇒ HOLD_LIMIT */
export async function acquireHoldCapInTx(tx: unknown, ctx: unknown, input: unknown): Promise<SellResult<{ count: number }>> {
  const t = asTx(tx);
  const pc = parseCtx(ctx);
  if (!pc.ok) throwIfFail(pc);
  const p = capInput.safeParse(input);
  if (!p.success) throwIfFail(invalidInput(p.error));
  const v = p.data;
  const h = holdCapKeyHash(v.capKey);
  await lockCap(t, h);
  const n = await countCap(t, pc.c.tenantId, h, pc.c.clock);
  const count = v.mode === "HOLDS" ? n.holds : n.seats;
  if (count + v.add > v.limit) throw new CapacityAbort("HOLD_LIMIT", { count, limit: v.limit });
  return { ok: true, value: { count } };
}

const rekeyInput = z.strictObject({ holdIds: z.array(ID).min(1).max(QTY_MAX), contactKey: z.string().min(1).max(200) });
/** ตรวจเพดานซ้ำด้วยผู้ติดต่อตอน confirm (D.6 :500 · T0.6 เรียก): นับของ contact (ไม่รวม holdIds) + |holdIds| > X10 ⇒ HOLD_LIMIT ไม่แก้อะไร */
export async function rekeyHoldsToContactInTx(tx: unknown, ctx: unknown, input: unknown): Promise<SellResult<{ holdIds: string[] }>> {
  const t = asTx(tx);
  const pc = parseCtx(ctx);
  if (!pc.ok) throwIfFail(pc);
  const p = rekeyInput.safeParse(input);
  if (!p.success) throwIfFail(invalidInput(p.error));
  const c = pc.c;
  const ids = [...new Set(p.data.holdIds)].sort();
  const g = await gateOfTx(t, c);
  if (!g) throw new CapacityAbort("HOLD_NOT_FOUND");
  const r = await resolveSettings({ tenantId: g.tenantId }, [K.X10], { unitId: g.unitId }, c.clock.now);
  const limit = settingOf(INT, K.X10, r[K.X10]?.value);
  const h = holdCapKeyHash(p.data.contactKey);
  await lockCap(t, h);
  const rows = await t.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS "n" FROM "TripHold"
    WHERE "tenantId" = ${g.tenantId} AND "capKeyHash" = ${h} AND "status" = 'ACTIVE' AND "expiresAt" > ${c.clock.iso}::timestamp AND NOT ("id" = ANY(${ids}::text[]))`;
  const count = rows[0]?.n ?? 0;
  if (count + ids.length > limit) throw new CapacityAbort("HOLD_LIMIT", { count, limit });
  const upd = await t.$queryRaw<{ id: string }[]>`
    UPDATE "TripHold" SET "capKeyHash" = ${h}, "updatedAt" = now()
    WHERE "id" = ANY(${ids}::text[]) AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" = 'ACTIVE' AND "expiresAt" > ${c.clock.iso}::timestamp
    RETURNING "id"`;
  if (upd.length !== ids.length) throw new CapacityAbort("HOLD_EXPIRED");
  return { ok: true, value: { holdIds: ids } };
}

// ═══════════════════════ ตัวกวาด (CC §D.4 · ต่อรอบ · jobs.ts เรียก) ═══════════════════════
type ExpiredHold = { id: string; qtyPublic: number; qtyAllot: number; bookingId: string | null; channel: string };
/**
 * tx ละรอบ: 1a ล็อกรอบ → 2a CAS hold ที่ครบกำหนดจริง (status ACTIVE ∧ expiresAt ≤ now) → คืนตัวนับด้วยผลรวมของแถวที่ CAS ได้ (คำสั่งเดียว) →
 * 2a′ ข้อเสนอของ hold นั้น ⇒ EXPIRED → 2b การจอง HOLD|PENDING ⇒ EXPIRED (CAS · เรียง id) → เสนอคนถัดไป → 2h outbox · ซ้อนกัน = ผลเดียว (X5)
 */
export async function expireDepartureHolds(tenantId: string, unitId: string, departureId: string, holdIds: readonly string[], now: Date): Promise<{ expired: number; offered: number }> {
  const g0 = await systemGate(tenantId, unitId);
  if (!g0) throw new CapacityAbort("NOT_FOUND");
  const g: Gate = { tenantId, unitId: g0.unitId, tz: g0.tz };
  const d0 = await readDeparture(g, departureId);
  if (!d0) throw new CapacityAbort("NOT_FOUND");
  const clock: Clock = { now, iso: now.toISOString() };
  const pol = await policyFor(g, d0, now);
  const c: Ctx = { tenantId, unitId, channel: WAITLIST_CHANNEL, actor: { kind: "SYSTEM", job: "trips.expireHolds" }, clock };
  const ids = [...new Set(holdIds)].sort();
  const r = await runTx(g, async (tx) => {
    const d = await lockDeparture(tx, g, departureId); // 1a
    if (!d) throw new CapacityAbort("NOT_FOUND");
    const cas = await tx.$queryRaw<ExpiredHold[]>`
      UPDATE "TripHold" SET "status" = 'EXPIRED', "updatedAt" = now()
      WHERE "id" = ANY(${ids}::text[]) AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "departureId" = ${d.id}
        AND "status" = 'ACTIVE' AND "expiresAt" <= ${clock.iso}::timestamp
      RETURNING "id", "qtyPublic", "qtyAllot", "bookingId", "channel"`;
    if (!cas.length) return { expired: 0, offered: 0 };
    const total = cas.reduce((s, h) => s + h.qtyPublic + h.qtyAllot, 0);
    const counters = await releaseSeatsSql(tx, g, d.id, total, clock);
    await settleOfferRows(tx, g, cas.map((h) => h.id), "EXPIRED");
    const bookingIds = [...new Set(cas.map((h) => h.bookingId).filter((b): b is string => typeof b === "string" && b.length > 0))].sort();
    const evts: Evt[] = cas.map((h) => holdEvt("trips.hold.expired", { id: h.id, departureId: d.id, qty: h.qtyPublic + h.qtyAllot, channel: h.channel }));
    if (bookingIds.length) {
      const bs = await tx.$queryRaw<{ id: string; channel: string; grossSatang: number; agentAccountId: string | null }[]>`
        WITH "locked" AS (
          SELECT "id" FROM "TripBooking" WHERE "id" = ANY(${bookingIds}::text[]) AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" IN ('HOLD', 'PENDING')
          ORDER BY "id" FOR UPDATE
        )
        UPDATE "TripBooking" b SET "status" = 'EXPIRED', "version" = b."version" + 1, "updatedAt" = now()
        FROM "locked" WHERE b."id" = "locked"."id" AND b."status" IN ('HOLD', 'PENDING')
        RETURNING b."id", b."channel", b."grossSatang", b."agentAccountId"`;
      for (const b of bs.sort((x, y) => (x.id < y.id ? -1 : 1))) {
        evts.push({
          type: "trips.booking.expired",
          key: b.id,
          payload: { bookingId: b.id, unitId: g.unitId, departureId: d.id, status: "EXPIRED", channel: b.channel, amountSatang: b.grossSatang, ...(b.agentAccountId ? { agentAccountId: b.agentAccountId } : {}) },
        });
      }
    }
    const o = await offerNextInTx(tx, g, withCounters(d, counters), pol, clock);
    await emit(tx, g, evts);
    await audit(tx, g, c, "trips.hold.expire", "TripDeparture", d.id, { expired: cas.length, qty: total });
    return { expired: cas.length, offered: o.offered.length };
  });
  if (!r.ok) throw new CapacityAbort("race" in r ? "BUSY" : r.code);
  return r.value;
}
// ── /T0.4 capacity ──

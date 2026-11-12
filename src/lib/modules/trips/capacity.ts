// ─────────────────────────────────────────────────────────────
// trips/capacity.ts — ชั้น "ในธุรกรรม" ของเครื่องยนต์ความจุ: คำสั่งตัวนับ · CAS hold · เสนอที่รายการรอ · ทุกฟังก์ชัน *InTx · RUN TRIPS T0.4
// ใบสั่ง ledger/trips-briefs/T0.4.md §2–§7 (§12–§13 มติผู้คุมชนะ) · CC §C §D.0–§D.6 · รอบแก้ r2 ข้อ 1–14
//
// 🔴 ด่านคงที่ (r2 ข้อ 1 · pool): ไฟล์นี้ทำงานผ่าน `tx` ที่ผู้เรียกส่งมาเท่านั้น — ห้าม import `@/lib/core/db` · `@/lib/core/settings` ·
//    `@/lib/core/rate-limit-db` · `@/lib/core/ops` · `./resources` · `./capacity-service` และห้ามมีชื่อ prisma / tenantDb / resolveSettings / systemGate / logOps
//    (ตรวจ: `grep -nE "^import.*(core/(db|settings|rate-limit-db|ops)|\./(resources|capacity-service|waitlist))|(tenantDb|resolveSettings\w*|systemGate|logOps)\(|\bprisma\." capacity.ts` ต้องว่าง)
//    ค่าตั้งเข้ามาเป็นอาร์กิวเมนต์ `CapacityPolicies` จาก `loadCapacityPolicies` (capacity-service.ts) ที่ผู้เรียกรัน "ก่อน" เปิด tx
//    (หรือแคชของกระบวนการที่ตัวโหลดเติมไว้ — ไม่มีทั้งคู่ ⇒ ข้ามการเสนอที่ หรือปฏิเสธ VALIDATION reason POLICIES_REQUIRED)
// 🔴 ตัวนับ = UPDATE คำสั่งเดียวต่อแถว เงื่อนไขทั้งหมดใน WHERE + RETURNING + expectRows (0 แถว ⇒ CapacityAbort ⇒ rollback) · ห้ามอ่านแล้วเขียน
//    สถานะหลังตัวนับเปลี่ยน = นิพจน์ร่วมของ T0.3 (setFull) ใน SET เดียวกัน · used = sold + held หลังเปลี่ยน (ไม่รวม reserved)
// 🔴 ลำดับล็อก (CC §D.5 · r2 ข้อ 5): ชั้น 0 advisory เพดาน → สินค้า FOR SHARE (assertProductSellableInTx · หลังจากนั้นไม่แตะแถวสินค้า) →
//    1a แถวรอบ (เรียง id) → 2a TripHold (CAS/INSERT) → 2a′ TripWaitlist → 2b TripBooking (เรียง id) → 2h outbox
// 🔴 นาฬิกาเดียว = ctx.now · เงื่อนไขเวลาใน SQL ใช้ค่าจาก ctx (ไม่ใช้ now() ของฐาน) · ไม่มีการลบแถว · ไม่มี any
// ─────────────────────────────────────────────────────────────
import { createHmac, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { sha256 } from "@/lib/core/hash";
import { emitOutboxMany } from "@/lib/core/outbox";
import {
  SELL_CHANNELS,
  type CapacityRowRef,
  type ReserveIntent,
  type Reservation,
  type SellActor,
  type SellChannel,
  type SellErrorCode,
  type SellResult,
} from "@/lib/core/sellable";
import {
  HOLD_PURPOSES,
  PUBLIC_CHANNELS,
  QTY_MAX,
  QTY_MIN,
  WAITLIST_CHANNEL,
  holdExpiresAt,
  idemKeyFor,
  ownCapKeyOf,
  publicLeftOf,
  sortCapacityRows,
  waitlistCapKey,
  waitlistOfferIdemKey,
  type HoldDurations,
  type HoldPurpose,
} from "./capacity-core";
import { cutoffsFor, normalizeTimezone, saleBlockReason, type SaleBlockReason, type T6Value } from "./departures-core";
import { departureGuaranteedAtAfterCountersSql, departureStatusAfterCountersSql } from "./departures";
import { TripProductNotSellableError, assertProductSellableInTx } from "./products";

// ── T0.4 capacity ──
export type Tx = Prisma.TransactionClient;
export type Gate = { tenantId: string; unitId: string; tz: string };
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
/** ข้อความของเหตุเฉพาะ (details.reason) */
export const REASON_TH: Record<string, string> = {
  SETTINGS_INVALID: "ค่าตั้งของหน่วยไม่ถูกต้อง กรุณาตรวจค่าตั้งทัวร์ก่อน",
  POLICIES_REQUIRED: "ต้องโหลดค่าตั้งด้วย loadCapacityPolicies ก่อนเปิดธุรกรรม",
  AGENCY_NOT_ENABLED: "ระบบเอเจนซี่ยังไม่เปิดใช้",
  PUBLIC_NOT_ALLOWED: "ทำรายการนี้ผ่านหน้าสาธารณะไม่ได้",
};

export type Failure = { ok: false; code: SellErrorCode; messageTh: string; retryable: boolean; details?: Record<string, unknown> };
export function sellFail(code: SellErrorCode, details?: Record<string, unknown>, messageTh?: string): Failure {
  const reason = typeof details?.reason === "string" ? REASON_TH[details.reason] : undefined;
  return { ok: false, code, messageTh: messageTh ?? reason ?? MESSAGES[code], retryable: RETRYABLE.has(code), ...(details ? { details } : {}) };
}

/**
 * ผลปฏิเสธในธุรกรรม — โยนเพื่อ rollback ทั้ง tx · ตัวห่อ (capacity-service) แปลงเป็น SellResult · ใน *InTx ผู้เรียกเป็นคน rollback
 * `incident` = ความผิดปกติของข้อมูล (CHECK 23514 / ตัวนับไม่ตรงแถว hold) — ผู้ห่อบันทึก ops หลัง rollback (reportCapacityIncident)
 */
export class CapacityAbort extends Error {
  readonly code: SellErrorCode;
  readonly details?: Record<string, unknown>;
  readonly incident?: string;
  constructor(code: SellErrorCode, details?: Record<string, unknown>, incident?: string) {
    super(MESSAGES[code]);
    this.name = "CapacityAbort";
    this.code = code;
    this.details = details;
    this.incident = incident;
  }
}
/** คำสั่งตัวนับ/CAS ต้องได้แถว — 0 แถว ⇒ CapacityAbort(code) (ไม่มีการปล่อยผ่าน · CC §D.0 ข้อ 2) */
export function expectRows<T>(rows: readonly T[], code: SellErrorCode, details?: Record<string, unknown>, incident?: string): T {
  const first = rows[0];
  if (first === undefined) throw new CapacityAbort(code, details, incident);
  return first;
}
function abortOf(f: Failure): never {
  throw new CapacityAbort(f.code, f.details);
}

// ═══════════════════════ แฮช (r2 ข้อ 10) ═══════════════════════
/**
 * แฮชของ capKey (basket:/contact:/agent:/st:/sys:/waitlist:) = HMAC-SHA256 ด้วยกุญแจเซิร์ฟเวอร์ (SESSION_SECRET ติดป้าย — แบบแผนเดียวกับ
 * core/signed-link · core/phone-auth: อ่าน env ตอนเรียก · ไม่มีกุญแจ (สคริปต์ที่ env ไม่ครบ) ⇒ sha256 ติดป้าย) — เบอร์โทรไล่เดาจากฐานไม่ได้ (X8)
 */
export function holdCapKeyHash(capKey: string): string {
  const secret = String(process.env.SESSION_SECRET ?? "");
  return secret ? createHmac("sha256", `trips-holdcap:v1:${secret}`).update(capKey).digest("hex") : sha256(`trips-holdcap:${capKey}`);
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
  return sha256(JSON.stringify(canonical(req)));
}
const newId = (prefix: string) => `${prefix}${randomUUID().replace(/-/g, "")}`;
/** คีย์กันซ้ำที่เก็บ = namespace ของผู้เรียก (idemKeyFor) + หน่วย (r2 ข้อ 6: ค้น/ชนเฉพาะในหน่วยเดียวกัน) */
const storedIdemKey = (g: Gate, actor: SellActor, key: string, basketHash?: string) => `${idemKeyFor(actor, key, basketHash)}@${g.unitId}`;

// ═══════════════════════ ctx · input ═══════════════════════
export const ID = z.string().trim().min(1).max(128);
export const QTY = z.number().int().min(QTY_MIN).max(QTY_MAX);
export const IDEM_KEY = z.string().regex(/^[A-Za-z0-9_-]{8,100}$/);
export const CAP_KEY = z.string().min(1).max(200);
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
export const isPublic = (c: Ctx) => c.actor.kind === "PUBLIC";
/** งานของร้าน (คืน/ย้าย/โควตา/เสนอรายการรอ) — ผู้กระทำสาธารณะทำไม่ได้ */
export function staffOnly(c: Ctx): Failure | null {
  return isPublic(c) ? sellFail("FORBIDDEN", { reason: "PUBLIC_NOT_ALLOWED" }) : null;
}
/** หน่วย TRIPS ผ่าน tx ของผู้เรียก (ไม่ขอ connection ที่สอง) · ไม่ใช่ ⇒ null ⇒ NOT_FOUND ข้อความเดียวกับ id ที่ไม่มีจริง (X1) */
export async function gateOfTx(tx: Tx, c: { tenantId: string; unitId: string }): Promise<Gate | null> {
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

// ═══════════════════════ ค่าตั้งที่ส่งเข้ามา (r2 ข้อ 1 · แหล่งเดียวของระยะถือ/เพดาน §4 ข้อ 10) ═══════════════════════
/** ค่าตั้งของรอบ (T5 T6 T9 X2 X6 + ผู้ให้บริการ) ณ {unitId, productId, departureId} */
export type DeparturePolicy = { departureId: string; productId: string; t6: T6Value; durations: HoldDurations; showLeftAtOrBelow: number };
/** ผลของ loadCapacityPolicies — ส่งให้ *InTx ทุกตัวที่ต้องใช้ค่าตั้ง (อ่านก่อนเปิด tx) */
export type CapacityPolicies = { tenantId: string; unitId: string; holdCap: number; departures: Readonly<Record<string, DeparturePolicy>> };

/**
 * แคชของกระบวนการ (เติมโดย loadCapacityPolicies เท่านั้น) — ให้ `reserveInTx` ตามหน้าสัมผัส Sellable (4 อาร์กิวเมนต์ · CC :338) ใช้ค่าที่
 * capacityRowsOf โหลดไว้ก่อนเปิด tx ได้ · อายุสั้น (ค่าตั้งเปลี่ยนมีผลในธุรกรรมไม่เกินอายุแคช) · ค่าที่ส่งเป็นอาร์กิวเมนต์ชนะแคชเสมอ
 */
const POLICY_CACHE_MS = 60_000;
const POLICY_CACHE_MAX = 5_000;
const depCache = new Map<string, { p: DeparturePolicy; holdCap: number; at: number }>();
const unitCache = new Map<string, { holdCap: number; at: number }>();
export function rememberPolicies(p: CapacityPolicies): void {
  const at = Date.now();
  if (depCache.size > POLICY_CACHE_MAX) depCache.clear();
  if (unitCache.size > POLICY_CACHE_MAX) unitCache.clear();
  unitCache.set(`${p.tenantId}|${p.unitId}`, { holdCap: p.holdCap, at });
  for (const d of Object.values(p.departures)) depCache.set(`${p.tenantId}|${p.unitId}|${d.departureId}`, { p: d, holdCap: p.holdCap, at });
}
const fresh = (at: number) => Date.now() - at <= POLICY_CACHE_MS;
function explicitOf(policies: CapacityPolicies | undefined, g: Gate): CapacityPolicies | null {
  if (!policies || typeof policies !== "object") return null;
  if (policies.tenantId !== g.tenantId || policies.unitId !== g.unitId) throw new CapacityAbort("VALIDATION", { reason: "POLICIES_REQUIRED", detail: "policies ของหน่วยอื่น" });
  return policies;
}
/** ค่าตั้งของรอบ: อาร์กิวเมนต์ → แคช → null */
export function departurePolicyOf(policies: CapacityPolicies | undefined, g: Gate, departureId: string): DeparturePolicy | null {
  const ex = explicitOf(policies, g);
  if (ex) return ex.departures[departureId] ?? null;
  const c = depCache.get(`${g.tenantId}|${g.unitId}|${departureId}`);
  return c && fresh(c.at) ? c.p : null;
}
/** เพดานถือ X10 ของหน่วย: อาร์กิวเมนต์ → แคช → null */
export function holdCapOf(policies: CapacityPolicies | undefined, g: Gate): number | null {
  const ex = explicitOf(policies, g);
  if (ex) return ex.holdCap;
  const c = unitCache.get(`${g.tenantId}|${g.unitId}`);
  return c && fresh(c.at) ? c.holdCap : null;
}
function requirePolicy(policies: CapacityPolicies | undefined, g: Gate, departureId: string): DeparturePolicy {
  const p = departurePolicyOf(policies, g, departureId);
  if (!p) throw new CapacityAbort("VALIDATION", { reason: "POLICIES_REQUIRED", departureId });
  return p;
}
function requireHoldCap(policies: CapacityPolicies | undefined, g: Gate): number {
  const n = holdCapOf(policies, g);
  if (n === null) throw new CapacityAbort("VALIDATION", { reason: "POLICIES_REQUIRED" });
  return n;
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
export type Counters = { capacity: number; sold: number; held: number; reserved: number; status: string };
/** คอลัมน์รอบ (นามแฝง d) — ใช้ร่วมกับ capacity-service (JOIN สินค้า) */
export const DEP_COLS = Prisma.raw(
  `d."id", d."productId", d."optionId", to_char(d."localDate", 'YYYY-MM-DD') AS "localDate", d."startsAt", d."status", d."capacity", d."sold", d."held", d."reserved", d."minPax", d."cutoffAt", d."stopSell"`,
);
const CNT = Prisma.raw(`"capacity", "sold", "held", "reserved", "status"`);

/** อ่านแถวรอบไม่ล็อกผ่าน tx (หา productId ก่อนล็อกตามลำดับ) */
export async function readDepartureTx(tx: Tx, g: Gate, id: string): Promise<DepRow | null> {
  const rows = await tx.$queryRaw<DepRow[]>`SELECT ${DEP_COLS} FROM "TripDeparture" d WHERE d."id" = ${id} AND d."tenantId" = ${g.tenantId} AND d."unitId" = ${g.unitId}`;
  return rows[0] ?? null;
}
/** ล็อกแถวรอบ (ชั้น 1a) — ผู้เรียกที่ต้องล็อกหลายรอบเรียก id จากน้อยไปมาก */
export async function lockDeparture(tx: Tx, g: Gate, id: string): Promise<DepRow | null> {
  const rows = await tx.$queryRaw<DepRow[]>`
    SELECT ${DEP_COLS}
    FROM "TripDeparture" d WHERE d."id" = ${id} AND d."tenantId" = ${g.tenantId} AND d."unitId" = ${g.unitId} FOR UPDATE`;
  return rows[0] ?? null;
}
const withCounters = (d: DepRow, c: Counters): DepRow => ({ ...d, capacity: c.capacity, sold: c.sold, held: c.held, reserved: c.reserved, status: c.status });

/** เหตุขายไม่ได้ของช่องทาง (saleBlockReason ของ T0.3) · fullIsOpen: FULL ไม่ใช่เหตุบล็อก (ที่ว่าง 0 ตามสูตร) */
export function blockOf(d: DepRow, pol: DeparturePolicy, tz: string, channel: string, now: Date, fullIsOpen: boolean): SaleBlockReason | null {
  const ref = { localDate: d.localDate, startsAt: d.startsAt };
  return saleBlockReason({ status: fullIsOpen && d.status === "FULL" ? "OPEN" : d.status, startsAt: d.startsAt, cutoffs: cutoffsFor(ref, pol.t6, tz), stopSell: d.stopSell }, channel, null, now);
}
/** เหตุบล็อก ⇒ รหัสของการถือ/ขาย (ใบสั่ง §3.3) */
function blockAbort(d: DepRow, b: SaleBlockReason): CapacityAbort {
  if (b === "STATUS") return d.status === "FULL" ? new CapacityAbort("SOLD_OUT", { publicLeft: 0 }) : new CapacityAbort("SLOT_CLOSED");
  if (b === "STARTED" || b === "CUTOFF") return new CapacityAbort("CUTOFF_PASSED");
  return new CapacityAbort("SLOT_CLOSED");
}

// ═══════════════════════ คำสั่งตัวนับ (คำสั่งเดียวต่อแถว · CC §D.1) ═══════════════════════
/**
 * รันคำสั่งตัวนับ — CHECK 23514 (ด่านสุดท้าย) ไม่ใช่ผล 0 แถวปกติ: โยน CapacityAbort(code) ที่ติด incident "CHECK_23514" ทันที
 * (tx ถูก Postgres ยกเลิกแล้ว ⇒ ห้ามรันคำสั่งต่อ — ไม่มี 25P02 ถึงผู้เรียก) · ผู้ห่อบันทึก ops หลัง rollback (r2 ข้อ 11)
 */
async function counterSql(tx: Tx, sql: Prisma.Sql, code: SellErrorCode): Promise<Counters[]> {
  try {
    return await tx.$queryRaw<Counters[]>(sql);
  } catch (e) {
    if (isCheckViolation(e)) throw new CapacityAbort(code, { reason: "INTEGRITY" }, "CHECK_23514");
    throw e;
  }
}
function isCheckViolation(e: unknown): boolean {
  const seen = new Set<unknown>();
  const stack: unknown[] = [e];
  let depth = 0;
  while (stack.length && depth++ < 32) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object" || seen.has(cur)) continue;
    seen.add(cur);
    const o = cur as Record<string, unknown>;
    if (o.code === "23514" || o.originalCode === "23514") return true;
    if (typeof o.message === "string" && /violates check constraint/i.test(o.message)) return true;
    if (o.cause) stack.push(o.cause);
  }
  return false;
}
/**
 * SET ของสถานะ/guaranteedAt หลังตัวนับเปลี่ยน — นิพจน์ร่วมของ T0.3 (มติผู้คุม §13) · c = ค่า "หลังเปลี่ยน"
 * used = sold + held หลังเปลี่ยน (ใบสั่ง §4 ข้อ 3 · r2 ข้อ 13: FULL = ไม่เหลือที่นอกโควตา · ขายหมดสาธารณะดูจาก capacity − sold − held − reserved)
 */
function statusAfter(used: Prisma.Sql, sold: Prisma.Sql, clock: Clock): Prisma.Sql {
  const c = { capacity: Prisma.sql`"capacity"`, used, sold };
  return Prisma.sql`"status" = ${departureStatusAfterCountersSql(c, { setFull: true })}, "guaranteedAt" = ${departureGuaranteedAtAfterCountersSql(c, { setFull: true, nowIso: clock.iso })}, "version" = "version" + 1, "updatedAt" = now()`;
}

/** 0 แถวของ D.1(1) (tx ยังดี — UPDATE 0 แถวไม่ยกเลิก tx) ⇒ แยกเหตุจากแถว */
async function holdFailure(tx: Tx, g: Gate, id: string, clock: Clock): Promise<CapacityAbort> {
  const d = await lockDeparture(tx, g, id);
  if (!d) return new CapacityAbort("NOT_FOUND");
  if (d.status === "FULL") return new CapacityAbort("SOLD_OUT", { publicLeft: 0 });
  if (d.status !== "OPEN" && d.status !== "GUARANTEED") return new CapacityAbort("SLOT_CLOSED");
  if (d.cutoffAt && d.cutoffAt.getTime() <= clock.now.getTime()) return new CapacityAbort("CUTOFF_PASSED");
  return new CapacityAbort("SOLD_OUT", { publicLeft: Math.max(0, publicLeftOf(d)) });
}

/** D.1(1) ถือที่สาธารณะ: held + n */
async function holdSeatsSql(tx: Tx, g: Gate, id: string, n: number, clock: Clock): Promise<Counters> {
  const set = statusAfter(Prisma.sql`("sold" + "held" + ${n})`, Prisma.sql`"sold"`, clock);
  const rows = await counterSql(tx, Prisma.sql`UPDATE "TripDeparture" SET "held" = "held" + ${n}, ${set}
    WHERE "id" = ${id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" IN ('OPEN', 'GUARANTEED')
      AND ("cutoffAt" IS NULL OR "cutoffAt" > ${clock.iso}::timestamp) AND "sold" + "held" + "reserved" + ${n} <= "capacity"
    RETURNING ${CNT}`, "SOLD_OUT");
  if (!rows.length) throw await holdFailure(tx, g, id, clock);
  return expectRows(rows, "SOLD_OUT");
}
/** D.1(2) ครึ่งรอบ: ถือจากโควตา held + n, reserved − n */
async function holdFromReservedSql(tx: Tx, g: Gate, id: string, n: number, clock: Clock): Promise<Counters> {
  const set = statusAfter(Prisma.sql`("sold" + "held" + ${n})`, Prisma.sql`"sold"`, clock);
  const rows = await counterSql(tx, Prisma.sql`UPDATE "TripDeparture" SET "held" = "held" + ${n}, "reserved" = "reserved" - ${n}, ${set}
    WHERE "id" = ${id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" IN ('OPEN', 'GUARANTEED') AND "reserved" >= ${n}
      AND ("cutoffAt" IS NULL OR "cutoffAt" > ${clock.iso}::timestamp)
    RETURNING ${CNT}`, "INSUFFICIENT_ALLOTMENT");
  return expectRows(rows, "INSUFFICIENT_ALLOTMENT");
}
/** D.1(3e) ถือ → ขาย: held − q, sold + q (q จากแถว hold ที่ CAS ได้ · 0 แถว = ตัวนับไม่ตรงแถว hold ⇒ incident) */
async function convertSeatsSql(tx: Tx, g: Gate, id: string, q: number, clock: Clock): Promise<Counters> {
  const set = statusAfter(Prisma.sql`("sold" + "held")`, Prisma.sql`("sold" + ${q})`, clock);
  const rows = await counterSql(tx, Prisma.sql`UPDATE "TripDeparture" SET "held" = "held" - ${q}, "sold" = "sold" + ${q}, ${set}
    WHERE "id" = ${id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "held" >= ${q}
    RETURNING ${CNT}`, "STATE_CONFLICT");
  return expectRows(rows, "STATE_CONFLICT", { reason: "INTEGRITY" }, "HELD_BELOW_HOLDS");
}
/** D.1(4) ปล่อยที่ถือ (หมดเวลา/ยกเลิก): held − q (q = ผลรวมของแถว hold ที่ CAS ได้จริง · 0 แถว ⇒ incident) */
async function releaseSeatsSql(tx: Tx, g: Gate, id: string, q: number, clock: Clock): Promise<Counters> {
  const set = statusAfter(Prisma.sql`("sold" + "held" - ${q})`, Prisma.sql`"sold"`, clock);
  const rows = await counterSql(tx, Prisma.sql`UPDATE "TripDeparture" SET "held" = "held" - ${q}, ${set}
    WHERE "id" = ${id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "held" >= ${q}
    RETURNING ${CNT}`, "STATE_CONFLICT");
  return expectRows(rows, "STATE_CONFLICT", { reason: "INTEGRITY" }, "HELD_BELOW_HOLDS");
}
/** D.1(4) ครึ่งรอบ (โควตายังไม่คืน): held − n, reserved + n */
async function unholdToReservedSql(tx: Tx, g: Gate, id: string, n: number, clock: Clock): Promise<Counters> {
  const set = statusAfter(Prisma.sql`("sold" + "held" - ${n})`, Prisma.sql`"sold"`, clock);
  const rows = await counterSql(tx, Prisma.sql`UPDATE "TripDeparture" SET "held" = "held" - ${n}, "reserved" = "reserved" + ${n}, ${set}
    WHERE "id" = ${id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "held" >= ${n}
    RETURNING ${CNT}`, "STATE_CONFLICT");
  return expectRows(rows, "STATE_CONFLICT");
}
/** D.1(5a)/(5c) คืนที่ขายแล้วกลับสาธารณะ: sold − n (ต้นทางของการย้ายด้วย) */
async function returnSoldSql(tx: Tx, g: Gate, id: string, n: number, clock: Clock): Promise<Counters> {
  const set = statusAfter(Prisma.sql`("sold" - ${n} + "held")`, Prisma.sql`("sold" - ${n})`, clock);
  const rows = await counterSql(tx, Prisma.sql`UPDATE "TripDeparture" SET "sold" = "sold" - ${n}, ${set}
    WHERE "id" = ${id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "sold" >= ${n}
    RETURNING ${CNT}`, "STATE_CONFLICT");
  return expectRows(rows, "STATE_CONFLICT");
}
/** D.1(5b) ครึ่งรอบ: ที่จากโควตากลับเข้าโควตา sold − n, reserved + n */
async function returnSoldToReservedSql(tx: Tx, g: Gate, id: string, n: number, clock: Clock): Promise<Counters> {
  const set = statusAfter(Prisma.sql`("sold" - ${n} + "held")`, Prisma.sql`("sold" - ${n})`, clock);
  const rows = await counterSql(tx, Prisma.sql`UPDATE "TripDeparture" SET "sold" = "sold" - ${n}, "reserved" = "reserved" + ${n}, ${set}
    WHERE "id" = ${id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "sold" >= ${n}
    RETURNING ${CNT}`, "STATE_CONFLICT");
  return expectRows(rows, "STATE_CONFLICT");
}
/** ย้ายเข้า (ปลายทาง): sold + n ใต้เงื่อนไขสถานะ + ความจุ */
async function moveInSql(tx: Tx, g: Gate, id: string, n: number, clock: Clock): Promise<Counters> {
  const set = statusAfter(Prisma.sql`("sold" + ${n} + "held")`, Prisma.sql`("sold" + ${n})`, clock);
  const rows = await counterSql(tx, Prisma.sql`UPDATE "TripDeparture" SET "sold" = "sold" + ${n}, ${set}
    WHERE "id" = ${id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" IN ('OPEN', 'GUARANTEED')
      AND "sold" + "held" + "reserved" + ${n} <= "capacity"
    RETURNING ${CNT}`, "SOLD_OUT");
  return expectRows(rows, "SOLD_OUT");
}
/** D.1(7) ครึ่งรอบ: สร้าง/เพิ่มโควตา reserved + q */
async function reserveSeatsSql(tx: Tx, g: Gate, id: string, q: number, clock: Clock): Promise<Counters> {
  const set = statusAfter(Prisma.sql`("sold" + "held")`, Prisma.sql`"sold"`, clock);
  const rows = await counterSql(tx, Prisma.sql`UPDATE "TripDeparture" SET "reserved" = "reserved" + ${q}, ${set}
    WHERE "id" = ${id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "sold" + "held" + "reserved" + ${q} <= "capacity"
    RETURNING ${CNT}`, "SOLD_OUT");
  return expectRows(rows, "SOLD_OUT");
}
/** D.1(6) ครึ่งรอบ: คืนโควตา reserved − q (M-1: 0 แถว ⇒ STATE_CONFLICT ไม่ปล่อยผ่าน) */
async function unreserveSeatsSql(tx: Tx, g: Gate, id: string, q: number, clock: Clock): Promise<Counters> {
  const set = statusAfter(Prisma.sql`("sold" + "held")`, Prisma.sql`"sold"`, clock);
  const rows = await counterSql(tx, Prisma.sql`UPDATE "TripDeparture" SET "reserved" = "reserved" - ${q}, ${set}
    WHERE "id" = ${id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "reserved" >= ${q}
    RETURNING ${CNT}`, "STATE_CONFLICT");
  return expectRows(rows, "STATE_CONFLICT");
}

// ═══════════════════════ แถว hold ═══════════════════════
export type HoldRow = {
  id: string;
  departureId: string;
  status: string;
  purpose: string;
  channel: string;
  qtyPublic: number;
  qtyAllot: number;
  expiresAt: Date;
  requestHash: string;
  capKeyHash: string;
  bookingId: string | null;
  allotmentId: string | null;
};
const HOLD_COLS = Prisma.raw(`"id", "departureId", "status", "purpose", "channel", "qtyPublic", "qtyAllot", "expiresAt", "requestHash", "capKeyHash", "bookingId", "allotmentId"`);
export async function readHold(db: Tx, g: Gate, id: string): Promise<HoldRow | null> {
  const rows = await db.$queryRaw<HoldRow[]>`SELECT ${HOLD_COLS} FROM "TripHold" WHERE "id" = ${id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId}`;
  return rows[0] ?? null;
}
/** ค้นคีย์กันซ้ำในหน่วยเดียวกัน (r2 ข้อ 6) */
export async function readHoldByKey(db: Tx, g: Gate, key: string): Promise<HoldRow | null> {
  const rows = await db.$queryRaw<HoldRow[]>`SELECT ${HOLD_COLS} FROM "TripHold" WHERE "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "idempotencyKey" = ${key}`;
  return rows[0] ?? null;
}
/** ผู้กระทำสาธารณะต้องแสดง capKey ของ hold เอง (ความลับของตะกร้า · r2 ข้อ 9) — ไม่ใช่ ⇒ HOLD_NOT_FOUND (ไม่บอกว่ามีอยู่) */
function assertHoldOwner(c: Ctx, h: HoldRow, capKey: string | undefined): void {
  if (!isPublic(c)) return;
  if (!capKey || holdCapKeyHash(capKey) !== h.capKeyHash) throw new CapacityAbort("HOLD_NOT_FOUND");
}

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
/** INSERT hold (ชั้น 2a) · ชนคีย์กันซ้ำ ⇒ false (ผู้เรียกตัดสิน) */
async function insertHoldRow(tx: Tx, g: Gate, h: NewHold): Promise<boolean> {
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

// ═══════════════════════ เพดานถือ §D.6 (ชั้น 0) ═══════════════════════
async function lockCap(tx: Tx, capKeyHash: string): Promise<void> {
  await tx.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtext('trips-holdcap:' || ${capKeyHash}))`;
}
/** ไม่รอ: ใช้ในเฟส 1 (หลังชั้น 0 ของตะกร้า) — ล็อกที่ tx นี้ถืออยู่แล้วได้ทันที (advisory ซ้อนได้) · คนอื่นถือ ⇒ false (ไม่เกิดวงรอ) */
async function tryLockCap(tx: Tx, capKeyHash: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext('trips-holdcap:' || ${capKeyHash})) AS "ok"`;
  return rows[0]?.ok === true;
}
/**
 * นับเพดานของ capKey ทั้งร้าน (ไม่แยกหน่วย · r2 ข้อ 6: ตะกร้า/ผู้ติดต่อข้ามหน่วยในร้านเดียวกันได้ ⇒ เพดานเป็นของผู้ซื้อ ไม่ใช่ของหน่วย)
 * นับเฉพาะ ACTIVE ที่ยังไม่หมดเวลา (expiresAt > $now)
 */
async function countCap(tx: Tx, tenantId: string, capKeyHash: string, clock: Clock): Promise<{ holds: number; seats: number }> {
  const rows = await tx.$queryRaw<{ holds: number; seats: number }[]>`
    SELECT count(*)::int AS "holds", COALESCE(sum("qtyPublic" + "qtyAllot"), 0)::int AS "seats" FROM "TripHold"
    WHERE "tenantId" = ${tenantId} AND "capKeyHash" = ${capKeyHash} AND "status" = 'ACTIVE' AND "expiresAt" > ${clock.iso}::timestamp`;
  return rows[0] ?? { holds: 0, seats: 0 };
}

// ═══════════════════════ สินค้า (r2 ข้อ 4) ═══════════════════════
/**
 * สินค้า FOR SHARE (หลังชั้น 0 ก่อน 1a) · สาธารณะ: เฉพาะสินค้า ACTIVE + ตัวเลือกเปิด (อื่น ⇒ NOT_FOUND ข้อความเดียวกับไม่มีจริง)
 * พนักงาน/ระบบ: DRAFT ได้ · ARCHIVED/ตัวเลือกปิด ⇒ SLOT_CLOSED (ไม่มีใครถือบนสินค้า ARCHIVED ได้)
 */
async function productGateInTx(tx: Tx, g: Gate, c: Ctx, d: { productId: string; optionId: string | null }): Promise<void> {
  try {
    const p = await assertProductSellableInTx(tx, { tenantId: g.tenantId, unitId: g.unitId, productId: d.productId, optionId: d.optionId });
    if (isPublic(c) && p.status !== "ACTIVE") throw new CapacityAbort("NOT_FOUND");
  } catch (e) {
    if (e instanceof TripProductNotSellableError) throw new CapacityAbort(isPublic(c) || e.code === "NOT_FOUND" ? "NOT_FOUND" : "SLOT_CLOSED");
    throw e;
  }
}

// ═══════════════════════ เฟส 1 ของการถือ (placeHold + reserveInTx · r2 ข้อ 3: ฟังก์ชันเดียว) ═══════════════════════
type Phase1 = {
  departureId: string;
  qty: number;
  policy: DeparturePolicy;
  /** เพดาน: BLOCK = placeHold (ชั้น 0 ตามลำดับ) · TRY = reserveInTx (ชั้น 0 ทำโดยตะกร้าแล้ว — ห้ามรอหลัง 1a) */
  cap?: { hash: string; limit: number; lock: "BLOCK" | "TRY" };
  /** ตรวจคีย์ซ้ำหลังได้ล็อก (คำขอซ้อน) — คืนแถวเดิม ⇒ หยุด ไม่แตะตัวนับ */
  dupCheck?: () => Promise<HoldRow | null>;
};
/**
 * ชั้น 0 (BLOCK) → สินค้า FOR SHARE → [TRY ชั้น 0] → นับเพดาน → 1a ล็อกรอบ → ตรวจปิดรับ/หยุดขาย/สถานะของ ctx.channel + ที่ว่าง → D.1(1)
 */
async function phase1HoldInTx(tx: Tx, g: Gate, c: Ctx, a: Phase1): Promise<{ dep: DepRow; counters: Counters } | { dup: HoldRow }> {
  if (a.cap?.lock === "BLOCK") await lockCap(tx, a.cap.hash);
  if (a.dupCheck) {
    const dup = await a.dupCheck();
    if (dup) return { dup };
  }
  const d0 = await readDepartureTx(tx, g, a.departureId);
  if (!d0) throw new CapacityAbort("NOT_FOUND");
  await productGateInTx(tx, g, c, d0);
  if (a.cap) {
    if (a.cap.lock === "TRY" && !(await tryLockCap(tx, a.cap.hash))) throw new CapacityAbort("BUSY");
    const n = await countCap(tx, g.tenantId, a.cap.hash, c.clock);
    if (n.holds + 1 > a.cap.limit) throw new CapacityAbort("HOLD_LIMIT", { limit: a.cap.limit });
  }
  const d = await lockDeparture(tx, g, a.departureId); // 1a
  if (!d) throw new CapacityAbort("NOT_FOUND");
  if (a.dupCheck) {
    const dup = await a.dupCheck();
    if (dup) return { dup };
  }
  const b = blockOf(d, a.policy, g.tz, c.channel, c.clock.now, false);
  if (b) throw blockAbort(d, b);
  if (publicLeftOf(d) < a.qty) throw new CapacityAbort("SOLD_OUT", { publicLeft: Math.max(0, publicLeftOf(d)) });
  return { dep: d, counters: await holdSeatsSql(tx, g, d.id, a.qty, c.clock) };
}

// ═══════════════════════ เฟส 2a: แถว hold (ส่งออกให้ T0.6 · r2 ข้อ 3 / m12) ═══════════════════════
const PURPOSES_BY_ACTOR: Record<"PUBLIC" | "STAFF" | "SYSTEM", readonly HoldPurpose[]> = {
  PUBLIC: ["PAYMENT"],
  STAFF: ["PAYMENT", "SHOP_CONFIRM"],
  SYSTEM: ["SUPPLIER_REQUEST"],
};
const BASKET_CAP = /^basket:([A-Za-z0-9_-]{8,128})$/;
export const holdInput = z.strictObject({
  departureId: ID,
  qty: QTY,
  idempotencyKey: IDEM_KEY,
  purpose: z.enum(HOLD_PURPOSES).optional(),
  capKey: CAP_KEY.optional(),
  bookingId: ID.optional(),
  basketId: ID.optional(),
});
export type HoldInput = z.infer<typeof holdInput>;
/** ข้อมูลแถว hold ที่ตรวจแล้ว (purpose ตามผู้กระทำ · capKey · คีย์กันซ้ำ · แฮชคำขอ · เวลาหมดจากค่าตั้งของรอบ — แหล่งเดียว M-3) */
export type HoldPlan = { purpose: HoldPurpose; capKeyHash: string; counted: boolean; idemKey: string; requestHash: string; expiresAt: Date; bookingId: string | null; basketId: string | null };
/** ตรวจรูปคำขอถือที่ไม่ต้องใช้ค่าตั้ง (ก่อน rate limit · ไม่กินโควตา) — purpose ตามผู้กระทำ · capKey ของตะกร้า · ref ที่ไม่เชื่อ */
export function holdShapeError(c: Ctx, v: HoldInput, opts: { trustRefs: boolean }): Failure | null {
  const purpose: HoldPurpose = v.purpose ?? "PAYMENT";
  const kind = c.actor.kind;
  if (kind === "AGENT") return sellFail("FORBIDDEN", { reason: "AGENCY_NOT_ENABLED" });
  if (!PURPOSES_BY_ACTOR[kind].includes(purpose)) return sellFail("VALIDATION", { fields: ["purpose"] });
  if (kind === "PUBLIC") {
    if (!BASKET_CAP.test(v.capKey ?? "")) return sellFail("VALIDATION", { fields: ["capKey"] });
    // r2 ข้อ 9: bookingId/basketId จากผู้เรียกสาธารณะไม่เชื่อ (ตัวกวาดจะไปหมดอายุการจองที่อ้าง) · ตะกร้าของระบบ (T0.6) ส่งผ่าน insertHoldInTx (trustRefs)
    if (!opts.trustRefs && (v.bookingId !== undefined || v.basketId !== undefined)) return sellFail("VALIDATION", { fields: ["bookingId", "basketId"] });
  }
  return null;
}
export function planHold(g: Gate, c: Ctx, v: HoldInput, policy: DeparturePolicy, opts: { trustRefs: boolean }): HoldPlan | Failure {
  const shape = holdShapeError(c, v, opts);
  if (shape) return shape;
  const purpose: HoldPurpose = v.purpose ?? "PAYMENT";
  const basketHash = c.actor.kind === "PUBLIC" ? BASKET_CAP.exec(v.capKey ?? "")?.[1] : undefined;
  const expiresAt = holdExpiresAt(purpose, policy.durations, c.clock.now);
  if (!expiresAt) return sellFail("VALIDATION", { fields: ["purpose"] });
  const capKey = c.actor.kind === "PUBLIC" ? (v.capKey ?? "") : ownCapKeyOf(c.actor);
  const bookingId = v.bookingId ?? null;
  const basketId = v.basketId ?? null;
  return {
    purpose,
    capKeyHash: holdCapKeyHash(capKey),
    counted: c.actor.kind === "PUBLIC",
    idemKey: storedIdemKey(g, c.actor, v.idempotencyKey, basketHash),
    requestHash: holdRequestHash({ departureId: v.departureId, qty: v.qty, purpose, bookingId, basketId }),
    expiresAt,
    bookingId,
    basketId,
  };
}
export type PlaceHoldValue = { holdId: string; departureId: string; qty: number; purpose: string; status: string; expiresAt: string; publicLeft: number; duplicated: boolean };
/** INSERT hold + event + audit (2a · 2h) — คีย์ชน ⇒ CapacityAbort IDEMPOTENCY_CONFLICT (details.holdId · sameRequest) ⇒ ผู้เรียก rollback ตัวนับเฟส 1 */
async function writeHoldTx(tx: Tx, g: Gate, c: Ctx, departureId: string, qty: number, plan: HoldPlan): Promise<string> {
  const holdId = newId("th_");
  const ok = await insertHoldRow(tx, g, {
    id: holdId,
    departureId,
    channel: c.channel,
    qty,
    purpose: plan.purpose,
    capKeyHash: plan.capKeyHash,
    requestHash: plan.requestHash,
    idempotencyKey: plan.idemKey,
    expiresAt: plan.expiresAt,
    bookingId: plan.bookingId,
    basketId: plan.basketId,
  });
  if (!ok) {
    const h = await readHoldByKey(tx, g, plan.idemKey);
    throw new CapacityAbort("IDEMPOTENCY_CONFLICT", { holdId: h?.id ?? null, sameRequest: h?.requestHash === plan.requestHash });
  }
  await emit(tx, g, [holdEvt("trips.hold.created", { id: holdId, departureId, qty, channel: c.channel })]);
  await audit(tx, g, c, "trips.hold.place", "TripHold", holdId, { departureId, qty, purpose: plan.purpose });
  return holdId;
}

/** placeHold ทั้งก้อนในธุรกรรมของตัวห่อ (capacity-service) — คืน dup เมื่อคำขอซ้อน */
export async function placeHoldTx(tx: Tx, g: Gate, c: Ctx, v: HoldInput, policy: DeparturePolicy, holdCap: number, plan: HoldPlan): Promise<{ dup: HoldRow } | { value: PlaceHoldValue }> {
  const r = await phase1HoldInTx(tx, g, c, {
    departureId: v.departureId,
    qty: v.qty,
    policy,
    cap: plan.counted ? { hash: plan.capKeyHash, limit: holdCap, lock: "BLOCK" } : undefined,
    dupCheck: () => readHoldByKey(tx, g, plan.idemKey),
  });
  if ("dup" in r) return r;
  const holdId = await writeHoldTx(tx, g, c, r.dep.id, v.qty, plan);
  return {
    value: { holdId, departureId: r.dep.id, qty: v.qty, purpose: plan.purpose, status: "ACTIVE", expiresAt: plan.expiresAt.toISOString(), publicLeft: publicLeftOf(r.counters), duplicated: false },
  };
}

/**
 * เฟส 2a ของตะกร้า (T0.6 finalizeInTx): INSERT แถว hold ของบรรทัดที่ reserveInTx ปรับตัวนับไว้แล้ว — ไม่แตะตัวนับ · ไม่นับเพดาน (ชั้น 0 ทำแล้ว)
 * ต้องมี `policies` (loadCapacityPolicies ก่อน tx) · คีย์ชน ⇒ โยน IDEMPOTENCY_CONFLICT (details.sameRequest) ให้ผู้เรียก rollback แล้วอ่านผลเดิม
 */
export async function insertHoldInTx(tx: unknown, ctx: unknown, input: unknown, policies: CapacityPolicies): Promise<SellResult<{ holdId: string; departureId: string; qty: number; purpose: string; expiresAt: string }>> {
  const t = asTx(tx);
  const pc = parseCtx(ctx);
  if (!pc.ok) abortOf(pc);
  const p = holdInput.safeParse(input);
  if (!p.success) abortOf(invalidInput(p.error));
  const g = await gateOfTx(t, pc.c);
  if (!g) throw new CapacityAbort("NOT_FOUND");
  const policy = requirePolicy(policies, g, p.data.departureId);
  const plan = planHold(g, pc.c, p.data, policy, { trustRefs: true });
  if ("ok" in plan) abortOf(plan);
  const holdId = await writeHoldTx(t, g, pc.c, p.data.departureId, p.data.qty, plan);
  return { ok: true, value: { holdId, departureId: p.data.departureId, qty: p.data.qty, purpose: plan.purpose, expiresAt: plan.expiresAt.toISOString() } };
}

// ═══════════════════════ รายการรอ: เสนอที่ในธุรกรรมที่ปล่อยที่ (ใบสั่ง §3.6 · r2 ข้อ 2) ═══════════════════════
/**
 * ใต้ล็อกแถวรอบ (ผู้เรียกล็อกแล้ว · d = ตัวนับล่าสุด) — การเสนอ "ไม่มีวัน" ทำให้ธุรกรรมที่ปล่อยที่ล้ม:
 * ไม่มีค่าตั้ง/รอบไม่ OPEN|GUARANTEED/ปิดรับ WEB/หยุดขาย/เริ่มแล้ว/คอลัมน์ cutoffAt เลยแล้ว (ค่าเก่า) ⇒ ไม่เสนอเงียบ ๆ · แต่ละคนทำใต้ SAVEPOINT
 * (ล้ม ⇒ ย้อนเฉพาะข้อเสนอนั้นแล้วหยุด) · FIFO เคร่ง (หัวคิวต้องการมากกว่าที่ว่าง ⇒ หยุด) · ทีละคน: D.1(1) → INSERT hold WAITLIST_OFFER (2a ·
 * คีย์ wl:<id> ซ้ำ = ไม่มีข้อเสนอที่สอง) → CAS WAITING → OFFERED (2a′) → event · ไม่นับเพดาน (capKey = waitlist:<id> ไม่ปนกับ basket ใด ·
 * ไม่ขอ advisory หลัง 1a — คีย์ไม่ซ้ำกับใคร จึงไม่มีอะไรให้เรียงลำดับ)
 */
export async function offerNextInTx(tx: Tx, g: Gate, d: DepRow, pol: DeparturePolicy | null, clock: Clock): Promise<{ offered: string[]; dep: DepRow }> {
  const offered: string[] = [];
  if (!pol || (d.status !== "OPEN" && d.status !== "GUARANTEED")) return { offered, dep: d };
  if (d.cutoffAt && d.cutoffAt.getTime() <= clock.now.getTime()) return { offered, dep: d };
  if (blockOf(d, pol, g.tz, WAITLIST_CHANNEL, clock.now, false) !== null) return { offered, dep: d };
  const exp = holdExpiresAt("WAITLIST_OFFER", pol.durations, clock.now);
  if (!exp || publicLeftOf(d) <= 0) return { offered, dep: d };
  const waiting = await tx.$queryRaw<{ id: string; qty: number }[]>`
    SELECT "id", "qty" FROM "TripWaitlist"
    WHERE "departureId" = ${d.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" = 'WAITING'
    ORDER BY "createdAt", "id"`;
  let cur = d;
  for (const w of waiting) {
    if (w.qty > publicLeftOf(cur)) break; // FIFO เคร่ง
    await tx.$executeRaw`SAVEPOINT trips_t04_offer`;
    try {
      const holdId = newId("th_");
      const counters = await holdSeatsSql(tx, g, d.id, w.qty, clock);
      const ok = await insertHoldRow(tx, g, {
        id: holdId,
        departureId: d.id,
        channel: WAITLIST_CHANNEL,
        qty: w.qty,
        purpose: "WAITLIST_OFFER",
        capKeyHash: holdCapKeyHash(waitlistCapKey(w.id)),
        requestHash: holdRequestHash({ departureId: d.id, qty: w.qty, purpose: "WAITLIST_OFFER" }),
        idempotencyKey: waitlistOfferIdemKey(w.id),
        expiresAt: exp,
        bookingId: null,
        basketId: null,
      });
      if (!ok) throw new CapacityAbort("STATE_CONFLICT"); // เคยเสนอแล้ว (แถวที่เคย OFFERED ไม่กลับเป็น WAITING)
      const upd = await tx.$queryRaw<{ id: string }[]>`
        UPDATE "TripWaitlist" SET "status" = 'OFFERED', "offerHoldId" = ${holdId}, "offerExpiresAt" = ${exp.toISOString()}::timestamp, "updatedAt" = now()
        WHERE "id" = ${w.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" = 'WAITING'
        RETURNING "id"`;
      expectRows(upd, "STATE_CONFLICT");
      await emit(tx, g, [
        holdEvt("trips.hold.created", { id: holdId, departureId: d.id, qty: w.qty, channel: WAITLIST_CHANNEL }),
        { type: "trips.waitlist.offered", key: w.id, payload: { waitlistId: w.id, departureId: d.id, holdId } },
      ]);
      await tx.$executeRaw`RELEASE SAVEPOINT trips_t04_offer`;
      cur = withCounters(cur, counters);
      offered.push(w.id);
    } catch {
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT trips_t04_offer`;
      await tx.$executeRaw`RELEASE SAVEPOINT trips_t04_offer`;
      break;
    }
  }
  return { offered, dep: cur };
}

/** CAS แถวรายการรอของข้อเสนอที่ hold นี้ถืออยู่ (OFFERED → to) — ชั้น 2a′ หลัง CAS hold */
async function settleOfferRows(tx: Tx, g: Gate, holdIds: readonly string[], to: "ACCEPTED" | "EXPIRED" | "CANCELLED" | "DECLINED"): Promise<number> {
  if (!holdIds.length) return 0;
  const rows = await tx.$queryRaw<{ id: string }[]>`
    UPDATE "TripWaitlist" SET "status" = ${to}, "updatedAt" = now()
    WHERE "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "offerHoldId" = ANY(${[...holdIds]}::text[]) AND "status" = 'OFFERED'
    RETURNING "id"`;
  return rows.length;
}

// ═══════════════════════ แปลง (D.1(3) · M-3) ═══════════════════════
export const holdRefInput = z.strictObject({ holdId: ID, capKey: CAP_KEY.optional() });
export type ConvertValue = { holdId: string; departureId: string; qty: number; sold: number };
/** อ่าน hold ไม่ล็อก → 1a ล็อกรอบ → CAS hold ACTIVE → CONVERTED (expiresAt > now) → held − q, sold + q ด้วย q ของแถว → ข้อเสนอ ⇒ ACCEPTED */
export async function convertCoreTx(tx: Tx, g: Gate, c: Ctx, holdId: string, capKey: string | undefined): Promise<ConvertValue> {
  const h0 = await readHold(tx, g, holdId);
  if (!h0) throw new CapacityAbort("HOLD_NOT_FOUND");
  assertHoldOwner(c, h0, capKey);
  if (h0.qtyAllot > 0) throw new CapacityAbort("STATE_CONFLICT", { reason: "AGENCY_NOT_ENABLED" });
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
/**
 * แปลงในธุรกรรมของผู้เรียก (T0.6 confirm) — ไม่ใช้ค่าตั้ง · ปฏิเสธ ⇒ โยน CapacityAbort
 * ลำดับของผู้เรียก: เรียกก่อนล็อกการจอง (2b) · ไม่ถือล็อกรอบอื่นที่ id มากกว่าไว้ก่อน
 */
export async function convertHoldInTx(tx: unknown, ctx: unknown, input: unknown): Promise<SellResult<ConvertValue>> {
  const t = asTx(tx);
  const pc = parseCtx(ctx);
  if (!pc.ok) abortOf(pc);
  const p = holdRefInput.safeParse(input);
  if (!p.success) abortOf(invalidInput(p.error));
  const g = await gateOfTx(t, pc.c);
  if (!g) throw new CapacityAbort("HOLD_NOT_FOUND");
  return { ok: true, value: await convertCoreTx(t, g, pc.c, p.data.holdId, p.data.capKey) };
}

// ═══════════════════════ ปล่อย (D.1(4)) ═══════════════════════
export type ReleaseValue = { holdId: string; status: "RELEASED"; duplicated: boolean };
export const releaseInput = z.strictObject({ holdId: ID, reason: z.string().trim().min(1).max(200), capKey: CAP_KEY.optional() });

/** ปล่อย hold ที่ CAS ได้ใต้ล็อกรอบ (ผู้เรียกล็อกรอบแล้ว) — คืนตัวนับ · ข้อเสนอที่ถืออยู่ ⇒ แถวรายการรอ (offerTo) · คืนแถวรอบล่าสุด */
async function releaseLockedHold(tx: Tx, g: Gate, c: Ctx, d: DepRow, holdId: string, reason: string, offerTo: "CANCELLED" | "DECLINED"): Promise<{ dep: DepRow; released: boolean; current: string | null }> {
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
  if (h.purpose === "WAITLIST_OFFER") await settleOfferRows(tx, g, [holdId], offerTo);
  return { dep: withCounters(d, counters), released: true, current: "RELEASED" };
}

export async function releaseCoreTx(tx: Tx, g: Gate, c: Ctx, v: z.infer<typeof releaseInput>, policies: CapacityPolicies | undefined): Promise<ReleaseValue> {
  const h0 = await readHold(tx, g, v.holdId);
  if (!h0) throw new CapacityAbort("HOLD_NOT_FOUND");
  assertHoldOwner(c, h0, v.capKey);
  if (h0.status === "RELEASED") return { holdId: v.holdId, status: "RELEASED", duplicated: true };
  if (h0.status === "CONVERTED") throw new CapacityAbort("STATE_CONFLICT");
  if (h0.status === "EXPIRED") throw new CapacityAbort("HOLD_EXPIRED");
  if (h0.qtyAllot > 0) throw new CapacityAbort("STATE_CONFLICT", { reason: "AGENCY_NOT_ENABLED" });
  const pol = departurePolicyOf(policies, g, h0.departureId); // ไม่มี ⇒ ไม่เสนอ (งาน 5 นาทีเป็นตัวสำรอง)
  const d = await lockDeparture(tx, g, h0.departureId); // 1a
  if (!d) throw new CapacityAbort("HOLD_NOT_FOUND");
  const r = await releaseLockedHold(tx, g, c, d, v.holdId, v.reason, "CANCELLED"); // 2a (+2a′)
  if (!r.released) {
    if (r.current === "RELEASED") return { holdId: v.holdId, status: "RELEASED", duplicated: true };
    throw new CapacityAbort(r.current === "CONVERTED" ? "STATE_CONFLICT" : r.current === null ? "HOLD_NOT_FOUND" : "HOLD_EXPIRED");
  }
  await offerNextInTx(tx, g, r.dep, pol, c.clock);
  await audit(tx, g, c, "trips.hold.release", "TripHold", v.holdId, { departureId: d.id });
  return { holdId: v.holdId, status: "RELEASED", duplicated: false };
}
/**
 * ปล่อยในธุรกรรมของผู้เรียก · `policies` (ไม่บังคับ) ใช้เสนอที่ให้รายการรอในทีเดียวกัน — ไม่ส่ง (และแคชไม่มี) ⇒ ปล่อยได้ แต่ไม่เสนอ
 */
export async function releaseHoldInTx(tx: unknown, ctx: unknown, input: unknown, policies?: CapacityPolicies): Promise<SellResult<ReleaseValue>> {
  const t = asTx(tx);
  const pc = parseCtx(ctx);
  if (!pc.ok) abortOf(pc);
  const p = releaseInput.safeParse(input);
  if (!p.success) abortOf(invalidInput(p.error));
  const g = await gateOfTx(t, pc.c);
  if (!g) throw new CapacityAbort("HOLD_NOT_FOUND");
  return { ok: true, value: await releaseCoreTx(t, g, pc.c, p.data, policies) };
}

// ═══════════════════════ ต่ออายุ (r2 m13) ═══════════════════════
/** CAS expiresAt ใต้ล็อกรอบ · รอบยกเลิก/เริ่มแล้ว ⇒ SLOT_CLOSED · PAYMENT/WAITLIST_OFFER ต่อไม่ได้ · เอเจนซี่ (ไม่มีระยะ) ⇒ STATE_CONFLICT */
export async function extendCoreTx(tx: Tx, g: Gate, c: Ctx, holdId: string, capKey: string | undefined, policies: CapacityPolicies | undefined): Promise<{ holdId: string; expiresAt: string }> {
  const h = await readHold(tx, g, holdId);
  if (!h) throw new CapacityAbort("HOLD_NOT_FOUND");
  assertHoldOwner(c, h, capKey);
  if (h.purpose === "PAYMENT" || h.purpose === "WAITLIST_OFFER") throw new CapacityAbort("STATE_CONFLICT", { reason: "PURPOSE_NOT_EXTENDABLE" });
  const pol = requirePolicy(policies, g, h.departureId);
  const exp = holdExpiresAt(h.purpose, pol.durations, c.clock.now);
  if (!exp) throw new CapacityAbort("STATE_CONFLICT", { reason: "PURPOSE_NOT_EXTENDABLE" });
  const d = await lockDeparture(tx, g, h.departureId); // 1a
  if (!d) throw new CapacityAbort("HOLD_NOT_FOUND");
  if (d.status === "CANCELLED" || d.startsAt.getTime() <= c.clock.now.getTime()) throw new CapacityAbort("SLOT_CLOSED");
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
}

// ═══════════════════════ คืน · ย้าย (ใบสั่ง §3.4) ═══════════════════════
export type CountersValue = { departureId: string; capacity: number; sold: number; held: number; reserved: number; status: string };
const cv = (id: string, k: Counters): CountersValue => ({ departureId: id, capacity: k.capacity, sold: k.sold, held: k.held, reserved: k.reserved, status: k.status });
export const returnInput = z.strictObject({ departureId: ID, qty: QTY, toReserved: z.boolean().optional() });

export async function returnCoreTx(tx: Tx, g: Gate, c: Ctx, v: z.infer<typeof returnInput>, policies: CapacityPolicies | undefined): Promise<CountersValue> {
  const pol = v.toReserved ? null : departurePolicyOf(policies, g, v.departureId);
  const d = await lockDeparture(tx, g, v.departureId);
  if (!d) throw new CapacityAbort("NOT_FOUND");
  const k = v.toReserved ? await returnSoldToReservedSql(tx, g, d.id, v.qty, c.clock) : await returnSoldSql(tx, g, d.id, v.qty, c.clock);
  const o = await offerNextInTx(tx, g, withCounters(d, k), pol, c.clock);
  await audit(tx, g, c, "trips.seat.return", "TripDeparture", d.id, { qty: v.qty, toReserved: v.toReserved === true });
  return cv(d.id, o.dep);
}
/** คืนที่ขายแล้วในธุรกรรมของผู้เรียก (T0.6/T0.7 ยกเลิก · A1.4 ส่ง toReserved) · `policies` ไม่บังคับ: ใช้เสนอรายการรอ (ไม่มี ⇒ ไม่เสนอ) */
export async function returnSoldInTx(tx: unknown, ctx: unknown, input: unknown, policies?: CapacityPolicies): Promise<SellResult<CountersValue>> {
  const t = asTx(tx);
  const pc = parseCtx(ctx);
  if (!pc.ok) abortOf(pc);
  const so = staffOnly(pc.c);
  if (so) abortOf(so);
  const p = returnInput.safeParse(input);
  if (!p.success) abortOf(invalidInput(p.error));
  const g = await gateOfTx(t, pc.c);
  if (!g) throw new CapacityAbort("NOT_FOUND");
  return { ok: true, value: await returnCoreTx(t, g, pc.c, p.data, policies) };
}

export const moveInput = z.strictObject({ fromDepartureId: ID, toDepartureId: ID, qty: QTY }).refine((v) => v.fromDepartureId !== v.toDepartureId, { message: "รอบต้นทางและปลายทางต้องต่างกัน" });
export type MoveValue = { from: CountersValue; to: CountersValue; qty: number };
/**
 * สินค้าปลายทาง FOR SHARE → ล็อกทั้งสองรอบเรียง id (1a) → ปลายทางตรวจปิดรับของ ctx.channel → ต้นทาง sold − n → ปลายทาง sold + n →
 * เสนอรายการรอของต้นทาง · ผลรวม sold คงที่ · ไม่นับเพดาน (CC :502)
 */
export async function moveCoreTx(tx: Tx, g: Gate, c: Ctx, v: z.infer<typeof moveInput>, policies: CapacityPolicies | undefined): Promise<MoveValue> {
  const polTo = requirePolicy(policies, g, v.toDepartureId);
  const polFrom = departurePolicyOf(policies, g, v.fromDepartureId);
  const to0 = await readDepartureTx(tx, g, v.toDepartureId);
  if (!to0 || !(await readDepartureTx(tx, g, v.fromDepartureId))) throw new CapacityAbort("NOT_FOUND");
  await productGateInTx(tx, g, c, to0);
  const locked = new Map<string, DepRow>();
  for (const id of [v.fromDepartureId, v.toDepartureId].sort()) {
    const d = await lockDeparture(tx, g, id);
    if (!d) throw new CapacityAbort("NOT_FOUND");
    locked.set(id, d);
  }
  const from = locked.get(v.fromDepartureId);
  const to = locked.get(v.toDepartureId);
  if (!from || !to) throw new CapacityAbort("NOT_FOUND");
  const b = blockOf(to, polTo, g.tz, c.channel, c.clock.now, false);
  if (b) throw blockAbort(to, b);
  const kFrom = await returnSoldSql(tx, g, from.id, v.qty, c.clock);
  const kTo = await moveInSql(tx, g, to.id, v.qty, c.clock);
  const o = await offerNextInTx(tx, g, withCounters(from, kFrom), polFrom, c.clock);
  await audit(tx, g, c, "trips.seat.move", "TripDeparture", from.id, { toDepartureId: to.id, qty: v.qty });
  return { from: cv(from.id, o.dep), to: cv(to.id, kTo), qty: v.qty };
}
/**
 * ย้ายในธุรกรรมของผู้เรียก — `policies` บังคับ (ปิดรับของปลายทาง) · ผู้เรียกต้องไม่ถือล็อกแถวรอบใดไว้ก่อน (ฟังก์ชันนี้ล็อกสินค้าแล้วสองรอบเรียง id เอง)
 */
export async function moveSoldInTx(tx: unknown, ctx: unknown, input: unknown, policies: CapacityPolicies): Promise<SellResult<MoveValue>> {
  const t = asTx(tx);
  const pc = parseCtx(ctx);
  if (!pc.ok) abortOf(pc);
  const so = staffOnly(pc.c);
  if (so) abortOf(so);
  const p = moveInput.safeParse(input);
  if (!p.success) abortOf(invalidInput(p.error));
  const g = await gateOfTx(t, pc.c);
  if (!g) throw new CapacityAbort("NOT_FOUND");
  return { ok: true, value: await moveCoreTx(t, g, pc.c, p.data, policies) };
}

// ═══════════════════════ ครึ่งฝั่งรอบของโควตา (A1.4 เรียก · ใบสั่ง §3.4) ═══════════════════════
const seatsInput = z.strictObject({ departureId: ID, qty: QTY });
type SeatsSql = (tx: Tx, g: Gate, id: string, n: number, clock: Clock) => Promise<Counters>;
async function seatsInTx(tx: unknown, ctx: unknown, input: unknown, stmt: SeatsSql): Promise<SellResult<CountersValue>> {
  const t = asTx(tx);
  const pc = parseCtx(ctx);
  if (!pc.ok) abortOf(pc);
  const so = staffOnly(pc.c);
  if (so) abortOf(so);
  const p = seatsInput.safeParse(input);
  if (!p.success) abortOf(invalidInput(p.error));
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
/** D.1(6) ครึ่งรอบ: reserved − q (0 แถว ⇒ STATE_CONFLICT · M-1) · ไม่เสนอรายการรอ (งาน 5 นาทีเป็นตัวสำรอง · A1.4 ตัดสิน) */
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

// ═══════════════════════ Sellable เฟส 1 (CC :338 · N-8 · r2 ข้อ 3) ═══════════════════════
const INTENT = z.object({
  op: z.enum(["HOLD", "CONVERT", "RELEASE", "MOVE"]),
  qtyPublic: z.number().int().min(0).max(QTY_MAX),
  qtyAllot: z.number().int().min(0).max(QTY_MAX),
  allotmentId: ID.optional(),
  unitIds: z.array(ID).max(QTY_MAX).optional(),
  capKey: CAP_KEY.optional(),
});
const ROW = z.object({ layer: z.enum(["1a", "1b", "1c"]), table: z.string().min(1).max(64), id: ID, sortKey: z.string().max(256) });
/** intent ของ trips: ReserveIntent + capKey ของตะกร้า (บังคับเมื่อผู้กระทำสาธารณะ — เพดานถือ) */
export type TripReserveIntent = ReserveIntent & { capKey?: string };
/**
 * เฟส 1 ทีละแถว (ตะกร้าเรียกตามลำดับ sortCapacityRows หลังชั้น 0 = SellBasket + acquireHoldCapInTx) —
 * HOLD = ตรวจเดียวกับ placeHold (phase1HoldInTx: สินค้า/ตัวเลือก · ปิดรับ/หยุดขาย/สถานะของ ctx.channel · เพดานของ capKey แบบไม่รอ) แล้ว D.1(1) ด้วย qtyPublic
 * qtyAllot > 0 ⇒ FORBIDDEN AGENCY_NOT_ENABLED (จน A1.4 มีแถวโควตา) · CONVERT/RELEASE/MOVE = SELECT … FOR UPDATE อย่างเดียว
 * ค่าตั้ง: `policies` (ตัวที่ 5) หรือแคชที่ capacityRowsOf/loadCapacityPolicies เติมไว้ก่อน tx — ไม่มี ⇒ VALIDATION POLICIES_REQUIRED · ปฏิเสธ ⇒ โยน CapacityAbort
 */
export async function reserveInTx(tx: unknown, ctx: unknown, rows: unknown, intent: unknown, policies?: CapacityPolicies): Promise<SellResult<Reservation>> {
  const t = asTx(tx);
  const pc = parseCtx(ctx);
  if (!pc.ok) abortOf(pc);
  const c = pc.c;
  const pr = z.array(ROW).min(1).max(QTY_MAX).safeParse(rows);
  if (!pr.success) abortOf(invalidInput(pr.error));
  const pi = INTENT.safeParse(intent);
  if (!pi.success) abortOf(invalidInput(pi.error));
  const it = pi.data;
  if (it.qtyAllot > 0) throw new CapacityAbort("FORBIDDEN", { reason: "AGENCY_NOT_ENABLED" });
  if (it.op === "HOLD" && it.qtyPublic === 0) abortOf(sellFail("VALIDATION", { fields: ["qtyPublic"] }));
  let capHash: string | null = null;
  if (it.op === "HOLD" && isPublic(c)) {
    if (!it.capKey || !BASKET_CAP.test(it.capKey)) abortOf(sellFail("VALIDATION", { fields: ["capKey"] }));
    capHash = holdCapKeyHash(it.capKey);
  }
  const g = await gateOfTx(t, c);
  if (!g) throw new CapacityAbort("NOT_FOUND");
  let slotId = "";
  for (const r of sortCapacityRows(pr.data)) {
    if (r.table !== "TripDeparture") throw new CapacityAbort("KIND_NOT_SUPPORTED");
    if (it.op === "HOLD") {
      const policy = requirePolicy(policies, g, r.id);
      const cap = capHash ? { hash: capHash, limit: requireHoldCap(policies, g), lock: "TRY" as const } : undefined;
      const res = await phase1HoldInTx(t, g, c, { departureId: r.id, qty: it.qtyPublic, policy, cap });
      if ("dup" in res) throw new CapacityAbort("STATE_CONFLICT");
      slotId = res.dep.id;
    } else {
      const d = await lockDeparture(t, g, r.id); // 1a
      if (!d) throw new CapacityAbort("NOT_FOUND");
      slotId = d.id;
    }
  }
  return { ok: true, value: { kind: "TRIP", slotId, qtyPublic: it.qtyPublic, qtyAllot: 0, unitIds: it.unitIds ?? [] } };
}

const capInput = z.strictObject({ capKey: CAP_KEY, mode: z.enum(["HOLDS", "SEATS"]), add: z.number().int().min(0).max(2_147_483_647), limit: z.number().int().min(0).max(2_147_483_647) });
/** ชั้น 0 (เรียกก่อนทุกล็อกอื่นของ tx): advisory lock ของ capKey แล้วนับ ACTIVE ที่ยังไม่หมดเวลา (HOLDS = แถว · SEATS = Σ qty) · count + add > limit ⇒ HOLD_LIMIT */
export async function acquireHoldCapInTx(tx: unknown, ctx: unknown, input: unknown): Promise<SellResult<{ count: number }>> {
  const t = asTx(tx);
  const pc = parseCtx(ctx);
  if (!pc.ok) abortOf(pc);
  const p = capInput.safeParse(input);
  if (!p.success) abortOf(invalidInput(p.error));
  const v = p.data;
  const h = holdCapKeyHash(v.capKey);
  await lockCap(t, h);
  const n = await countCap(t, pc.c.tenantId, h, pc.c.clock);
  const count = v.mode === "HOLDS" ? n.holds : n.seats;
  if (count + v.add > v.limit) throw new CapacityAbort("HOLD_LIMIT", { count, limit: v.limit });
  return { ok: true, value: { count } };
}

const rekeyInput = z.strictObject({ holdIds: z.array(ID).min(1).max(QTY_MAX), contactKey: CAP_KEY });
/**
 * ตรวจเพดานซ้ำด้วยผู้ติดต่อตอน confirm (D.6 :500 · T0.6 เรียก "ก่อน" ล็อกอื่นของ tx — เป็นชั้น 0):
 * เฉพาะ hold สาธารณะ (purpose PAYMENT ช่องทางสาธารณะ) ของหน่วยนี้ · อื่น/หน่วยอื่น ⇒ HOLD_NOT_FOUND (r2 ข้อ 8)
 * นับของ contact (ไม่รวม holdIds) + |holdIds| > X10 ⇒ HOLD_LIMIT ไม่แก้อะไร · X10 จาก `policies` (หรือแคช) — ไม่มี ⇒ VALIDATION POLICIES_REQUIRED
 */
export async function rekeyHoldsToContactInTx(tx: unknown, ctx: unknown, input: unknown, policies: CapacityPolicies): Promise<SellResult<{ holdIds: string[] }>> {
  const t = asTx(tx);
  const pc = parseCtx(ctx);
  if (!pc.ok) abortOf(pc);
  const p = rekeyInput.safeParse(input);
  if (!p.success) abortOf(invalidInput(p.error));
  const c = pc.c;
  const ids = [...new Set(p.data.holdIds)].sort();
  const g = await gateOfTx(t, c);
  if (!g) throw new CapacityAbort("HOLD_NOT_FOUND");
  const limit = requireHoldCap(policies, g);
  const h = holdCapKeyHash(p.data.contactKey);
  await lockCap(t, h);
  const mine = await t.$queryRaw<{ id: string; status: string; expiresAt: Date }[]>`
    SELECT "id", "status", "expiresAt" FROM "TripHold"
    WHERE "id" = ANY(${ids}::text[]) AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "purpose" = 'PAYMENT' AND "channel" = ANY(${[...PUBLIC_CHANNELS]}::text[])`;
  if (mine.length !== ids.length) throw new CapacityAbort("HOLD_NOT_FOUND");
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

// ═══════════════════════ ตัวกวาด (CC §D.4 · ตัวห่อใน capacity-service · งานใน jobs.ts) ═══════════════════════
type ExpiredHold = { id: string; departureId: string; qtyPublic: number; qtyAllot: number; bookingId: string | null; channel: string; purpose: string };
export type SweepGroup = { departureId: string; holdIds: readonly string[] };
/**
 * หลายรอบของหน่วยเดียวในธุรกรรมเดียว (r2 ข้อ 12 · throughput): 1a ล็อกทุกรอบเรียง id (คำสั่งเดียว) → 2a CAS hold ที่ครบกำหนดจริงทั้งหมด
 * (ACTIVE ∧ expiresAt ≤ now — เวลาที่เก็บในแถว · ไม่พึ่งค่าตั้ง · r2 ข้อ 7) → คืนตัวนับ "คำสั่งเดียวต่อรอบ" ด้วยผลรวมของแถวที่ CAS ได้ →
 * 2a′ ข้อเสนอของ hold เหล่านั้น ⇒ EXPIRED → เสนอคนถัดไป (2a/2a′ · เฉพาะรอบที่มีค่าตั้ง · ไม่มีวันทำให้ tx ล้ม) →
 * 2b การจอง HOLD|PENDING ⇒ EXPIRED (CAS · เรียง id) → 2h outbox + audit · ซ้อนกัน = ผลเดียว (X5) · รอบที่ไม่พบ = `missing`
 */
export async function sweepDeparturesTx(tx: Tx, g: Gate, groups: readonly SweepGroup[], policies: CapacityPolicies | undefined, clock: Clock): Promise<{ expired: number; offered: number; departures: number; missing: string[] }> {
  const depIds = [...new Set(groups.map((x) => x.departureId))].sort();
  const locked = await tx.$queryRaw<DepRow[]>`
    SELECT ${DEP_COLS}
    FROM "TripDeparture" d WHERE d."id" = ANY(${depIds}::text[]) AND d."tenantId" = ${g.tenantId} AND d."unitId" = ${g.unitId} ORDER BY d."id" FOR UPDATE`;
  const byId = new Map(locked.map((d) => [d.id, d]));
  const missing = depIds.filter((id) => !byId.has(id));
  const ids = [...new Set(groups.filter((x) => byId.has(x.departureId)).flatMap((x) => x.holdIds))].sort();
  if (!ids.length) return { expired: 0, offered: 0, departures: 0, missing };
  const cas = await tx.$queryRaw<ExpiredHold[]>`
    UPDATE "TripHold" SET "status" = 'EXPIRED', "updatedAt" = now()
    WHERE "id" = ANY(${ids}::text[]) AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "departureId" = ANY(${[...byId.keys()]}::text[])
      AND "status" = 'ACTIVE' AND "expiresAt" <= ${clock.iso}::timestamp
    RETURNING "id", "departureId", "qtyPublic", "qtyAllot", "bookingId", "channel", "purpose"`;
  if (!cas.length) return { expired: 0, offered: 0, departures: 0, missing };
  const totals = new Map<string, number>();
  for (const h of cas) totals.set(h.departureId, (totals.get(h.departureId) ?? 0) + h.qtyPublic + h.qtyAllot);
  const after = new Map<string, DepRow>();
  for (const id of [...totals.keys()].sort()) {
    const d = byId.get(id);
    if (!d) continue;
    after.set(id, withCounters(d, await releaseSeatsSql(tx, g, id, totals.get(id) ?? 0, clock)));
  }
  await settleOfferRows(tx, g, cas.filter((h) => h.purpose === "WAITLIST_OFFER").map((h) => h.id), "EXPIRED");
  let offered = 0;
  for (const [id, d] of [...after.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    offered += (await offerNextInTx(tx, g, d, departurePolicyOf(policies, g, id), clock)).offered.length;
  }
  const evts: Evt[] = cas.map((h) => holdEvt("trips.hold.expired", { id: h.id, departureId: h.departureId, qty: h.qtyPublic + h.qtyAllot, channel: h.channel }));
  const depOfBooking = new Map(cas.filter((h) => h.bookingId).map((h) => [h.bookingId as string, h.departureId]));
  const bookingIds = [...depOfBooking.keys()].sort();
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
        payload: { bookingId: b.id, unitId: g.unitId, departureId: depOfBooking.get(b.id) ?? null, status: "EXPIRED", channel: b.channel, amountSatang: b.grossSatang, ...(b.agentAccountId ? { agentAccountId: b.agentAccountId } : {}) },
      });
    }
  }
  await emit(tx, g, evts);
  await tx.auditLog.createMany({
    data: [...totals.entries()].map(([id, qty]) => ({
      tenantId: g.tenantId,
      unitId: g.unitId,
      actorType: "SYSTEM" as const,
      actorId: null,
      action: "trips.hold.expire",
      targetType: "TripDeparture",
      targetId: id,
      after: { expired: cas.filter((h) => h.departureId === id).length, qty },
    })),
  });
  return { expired: cas.length, offered, departures: totals.size, missing };
}

// ═══════════════════════ รายการรอ (ส่วนในธุรกรรม · wrapper อยู่ waitlist.ts) ═══════════════════════
export type WaitRow = { id: string; departureId: string; status: string; qty: number; offerHoldId: string | null; offerExpiresAt: Date | null; createdAt: Date };
export async function readWait(db: Tx, g: Gate, id: string): Promise<WaitRow | null> {
  const rows = await db.$queryRaw<WaitRow[]>`
    SELECT "id", "departureId", "status", "qty", "offerHoldId", "offerExpiresAt", "createdAt" FROM "TripWaitlist"
    WHERE "id" = ${id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId}`;
  return rows[0] ?? null;
}
function isUniqueViolation(e: unknown): boolean {
  const seen = new Set<unknown>();
  const stack: unknown[] = [e];
  let depth = 0;
  while (stack.length && depth++ < 32) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object" || seen.has(cur)) continue;
    seen.add(cur);
    const o = cur as Record<string, unknown>;
    if (o.code === "23505" || o.originalCode === "23505") return true;
    if (typeof o.message === "string" && /duplicate key value|unique constraint/i.test(o.message)) return true;
    if (o.cause) stack.push(o.cause);
    if (o.meta && typeof o.meta === "object") stack.push(o.meta);
  }
  return false;
}

/** ฝากชื่อใต้ล็อกรอบ · createdAt เพิ่มขึ้นเคร่งต่อรอบ (GREATEST(clock_timestamp(), ล่าสุด + 1 ms) · r2 ข้อ 12: FIFO ไม่พึ่ง id สุ่ม) */
export async function joinWaitlistTx(tx: Tx, g: Gate, c: Ctx, v: { departureId: string; qty: number; partyId: string }, pol: DeparturePolicy): Promise<{ id: string; duplicated: boolean }> {
  const d = await lockDeparture(tx, g, v.departureId); // 1a
  if (!d) throw new CapacityAbort("NOT_FOUND");
  const mine = async () =>
    (
      await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "TripWaitlist"
        WHERE "departureId" = ${d.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "partyId" = ${v.partyId} AND "status" IN ('WAITING', 'OFFERED')
        ORDER BY "createdAt", "id" LIMIT 1`
    )[0];
  const existing = await mine();
  if (existing) return { id: existing.id, duplicated: true };
  if (d.status !== "OPEN" && d.status !== "GUARANTEED" && d.status !== "FULL") throw new CapacityAbort("SLOT_CLOSED");
  const b = blockOf(d, pol, g.tz, WAITLIST_CHANNEL, c.clock.now, true);
  if (b === "STARTED" || b === "CUTOFF") throw new CapacityAbort("CUTOFF_PASSED");
  if (b !== null) throw new CapacityAbort("SLOT_CLOSED");
  const left = publicLeftOf(d);
  if (left >= v.qty) throw new CapacityAbort("STATE_CONFLICT", { publicLeft: left });
  const id = newId("tw_");
  await tx.$executeRaw`SAVEPOINT trips_t04_join`;
  try {
    await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO "TripWaitlist" ("id", "tenantId", "unitId", "departureId", "partyId", "channel", "qty", "status", "createdAt", "updatedAt")
      VALUES (${id}, ${g.tenantId}, ${g.unitId}, ${d.id}, ${v.partyId}, ${WAITLIST_CHANNEL}, ${v.qty}, 'WAITING',
        GREATEST(clock_timestamp()::timestamp(3), (SELECT max("createdAt") + interval '1 millisecond' FROM "TripWaitlist" WHERE "departureId" = ${d.id} AND "tenantId" = ${g.tenantId})), clock_timestamp())
      RETURNING "id"`;
    await tx.$executeRaw`RELEASE SAVEPOINT trips_t04_join`;
  } catch (e) {
    await tx.$executeRaw`ROLLBACK TO SAVEPOINT trips_t04_join`;
    await tx.$executeRaw`RELEASE SAVEPOINT trips_t04_join`;
    if (!isUniqueViolation(e)) throw e;
    const again = await mine(); // unique บางส่วน (departureId, partyId) = ด่านสุดท้าย ⇒ แถวเดิม
    if (again) return { id: again.id, duplicated: true };
    throw new CapacityAbort("STATE_CONFLICT");
  }
  await audit(tx, g, c, "trips.waitlist.join", "TripWaitlist", id, { departureId: d.id, qty: v.qty });
  return { id, duplicated: false };
}

export type ExitValue = { waitlistId: string; status: string; offered: string[] };
/** 1a ล็อกรอบ → (มีข้อเสนอ) 2a ปล่อย hold ของข้อเสนอ + แถวรายการรอ → 2a′ CAS แถว (ตรวจจำนวนแถว) → เสนอคนถัดไปในทีเดียวกัน */
export async function exitWaitlistTx(tx: Tx, g: Gate, c: Ctx, waitlistId: string, mode: "LEAVE" | "DECLINE", pol: DeparturePolicy | null): Promise<ExitValue> {
  const w0 = await readWait(tx, g, waitlistId);
  if (!w0) throw new CapacityAbort("NOT_FOUND");
  const d = await lockDeparture(tx, g, w0.departureId); // 1a
  if (!d) throw new CapacityAbort("NOT_FOUND");
  const w = await readWait(tx, g, waitlistId); // อ่านใต้ล็อกรอบ (ทุกผู้เขียนรายการรอล็อกรอบก่อน)
  if (!w) throw new CapacityAbort("NOT_FOUND");
  const allowed = mode === "DECLINE" ? ["OFFERED"] : ["WAITING", "OFFERED"];
  if (!allowed.includes(w.status)) throw new CapacityAbort("STATE_CONFLICT");
  const to = mode === "DECLINE" ? "DECLINED" : "CANCELLED";
  let dep: DepRow = d;
  let settled = false;
  if (w.status === "OFFERED" && w.offerHoldId) {
    const r = await releaseLockedHold(tx, g, c, d, w.offerHoldId, mode === "DECLINE" ? "ลูกค้าปฏิเสธข้อเสนอจากรายการรอ" : "ลูกค้าออกจากรายการรอ", to);
    dep = r.dep;
    settled = r.released;
  }
  if (!settled) {
    const upd = await tx.$queryRaw<{ id: string }[]>`
      UPDATE "TripWaitlist" SET "status" = ${to}, "updatedAt" = now()
      WHERE "id" = ${w.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" = ${w.status}
      RETURNING "id"`;
    expectRows(upd, "STATE_CONFLICT");
  }
  const o = await offerNextInTx(tx, g, dep, pol, c.clock);
  await audit(tx, g, c, "trips.waitlist.leave", "TripWaitlist", w.id, { departureId: d.id, status: to });
  return { waitlistId: w.id, status: to, offered: o.offered };
}

export type OfferResult = { offered: string[]; expired: number };
/** ใต้ล็อกรอบ: รอบยกเลิก/เริ่มแล้ว (ทุกสถานะ)/ปิดรับ WEB ⇒ WAITING → EXPIRED · ไม่งั้นเสนอ FIFO เคร่ง */
export async function offerWaitlistTx(tx: Tx, g: Gate, c: Ctx, departureId: string, pol: DeparturePolicy | null): Promise<OfferResult> {
  const d = await lockDeparture(tx, g, departureId);
  if (!d) throw new CapacityAbort("NOT_FOUND");
  const started = d.startsAt.getTime() <= c.clock.now.getTime();
  const b = pol ? blockOf(d, pol, g.tz, WAITLIST_CHANNEL, c.clock.now, true) : null;
  if (d.status === "CANCELLED" || started || b === "STARTED" || b === "CUTOFF") {
    const ex = await tx.$queryRaw<{ id: string }[]>`
      UPDATE "TripWaitlist" SET "status" = 'EXPIRED', "updatedAt" = now()
      WHERE "departureId" = ${d.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" = 'WAITING'
      RETURNING "id"`;
    return { offered: [], expired: ex.length };
  }
  const o = await offerNextInTx(tx, g, d, pol, c.clock);
  if (o.offered.length) await audit(tx, g, c, "trips.waitlist.offer", "TripDeparture", d.id, { offered: o.offered.length });
  return { offered: o.offered, expired: 0 };
}
// ── /T0.4 capacity ──

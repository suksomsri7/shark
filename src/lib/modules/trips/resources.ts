// ─────────────────────────────────────────────────────────────
// trips/resources.ts — ทะเบียนทรัพยากร (เรือ · รถ · ไกด์) · มอบ/ถอน · กันชนข้ามสินค้า + ด่านกลางของใบ T0.3 · RUN TRIPS T0.3
// ใบสั่ง ledger/trips-briefs/T0.3.md §3.3 §4 ข้อ 2 ข้อ 6 · CC §D.5 (แถวรอบล็อกก่อนแถวใช้ทรัพยากร)
//
// 🔴 tenantDb เท่านั้น (ไม่มี prisma ดิบ · F5 +0) · SQL ดิบใส่ "tenantId" + "unitId" เองทุกคำสั่ง
// 🔴 ช่วงใช้ = [startsAt, endsAt) ของรอบ (ต่อกันพอดีได้) · ตรวจซ้อนก่อนเขียนเพื่อได้ conflict ที่อ่านได้
//    EXCLUDE "TripResourceUse_no_overlap" ของ T0.1 = ด่านสุดท้าย: เขียนใต้ SAVEPOINT · 23P01 ⇒ อ่านแถวที่ชนแล้วคืน RESOURCE_CLASH (ไม่มี 500)
// 🔴 ไม่ลบแถว: ถอน/ยกเลิก = active=false · ทรัพยากรต้องอยู่หน่วยเดียวกับรอบ (ไม่ใช่ ⇒ NOT_FOUND)
// ไฟล์นี้ถือ "ด่านกลาง" ของใบด้วย (gateUnit · inTx · underSavepoint · pgCodeOf · audit) — departures.ts import จากที่นี่ทางเดียว (ไม่มีวง import)
// ─────────────────────────────────────────────────────────────
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { tenantDb } from "@/lib/core/db";
import { canAccessUnit, evaluate, type MembershipCtx } from "@/lib/core/rbac";
import {
  failOf,
  hhmm,
  normalizeTimezone,
  utcToLocal,
  type DepartureConflict,
  type DepartureFail,
} from "./departures-core";

// ═══════════════════════ ด่านกลาง ═══════════════════════
export type TripCtx = { tenantId: string; actorUserId: string };
export type TripOpts = { now?: Date };
export type Tx = Prisma.TransactionClient;
export type Gate = { tenantId: string; unitId: string; tz: string; actorId: string | null; actorType: "USER" | "SYSTEM" };
export type GateNeed = "read" | "edit" | "status" | "resource" | "resourceRead";

export const TRIPS_PERM = {
  view: "trips.departure.view",
  edit: "trips.departure.edit",
  status: "trips.departure.status",
  resource: "trips.resource.edit",
} as const;
const NEEDS: Record<GateNeed, readonly string[]> = {
  read: [TRIPS_PERM.view, TRIPS_PERM.edit, TRIPS_PERM.status],
  edit: [TRIPS_PERM.edit],
  status: [TRIPS_PERM.status],
  resource: [TRIPS_PERM.resource],
  resourceRead: [TRIPS_PERM.view, TRIPS_PERM.edit, TRIPS_PERM.status, TRIPS_PERM.resource],
};

export function isFail(x: unknown): x is DepartureFail {
  return typeof x === "object" && x !== null && (x as { ok?: unknown }).ok === false;
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function tzOfSettings(settings: unknown): string {
  return normalizeTimezone(isRecord(settings) ? settings.timezone : null);
}

/**
 * ด่าน (ลำดับตายตัวแบบ T0.2 §5): Membership สด (acceptedAt) → หน่วยของร้าน + canAccessUnit (ไม่ได้ ⇒ NOT_FOUND) → ชนิด TRIPS
 * → evaluate(module "trips") (อ่าน = view‖edit‖status) ไม่ผ่าน ⇒ FORBIDDEN · OWNER/MANAGER ผ่านตาม rbac
 */
export async function gateUnit(ctx: TripCtx, unitId: unknown, need: GateNeed): Promise<Gate | DepartureFail> {
  if (!isRecord(ctx) || typeof ctx.tenantId !== "string" || !ctx.tenantId || typeof ctx.actorUserId !== "string" || !ctx.actorUserId) return failOf("NOT_FOUND");
  if (typeof unitId !== "string" || !unitId) return failOf("INVALID_INPUT", "ต้องระบุหน่วย");
  const db = tenantDb({ tenantId: ctx.tenantId });
  const mem = await db.membership.findFirst({
    where: { tenantId: ctx.tenantId, userId: ctx.actorUserId, acceptedAt: { not: null } },
    select: { role: true, unitAccess: true, permissions: true },
  });
  if (!mem) return failOf("NOT_FOUND");
  const m: MembershipCtx = {
    role: mem.role,
    unitAccess: Array.isArray(mem.unitAccess) ? mem.unitAccess.filter((x): x is string => typeof x === "string") : [],
    permissions: isRecord(mem.permissions) ? mem.permissions : {},
  };
  const unit = await db.businessUnit.findFirst({ where: { id: unitId }, select: { id: true, type: true, settings: true } });
  if (!unit || !canAccessUnit(m, unit.id)) return failOf("NOT_FOUND");
  if (unit.type !== "TRIPS") return failOf("UNIT_NOT_TRIPS");
  if (!NEEDS[need].some((action) => evaluate(m, { module: "trips", action, unitId: unit.id }))) return failOf("FORBIDDEN");
  return { tenantId: ctx.tenantId, unitId: unit.id, tz: tzOfSettings(unit.settings), actorId: ctx.actorUserId, actorType: "USER" };
}

/** ด่านของงานตามเวลา (SYSTEM · ไม่มีผู้ใช้) — หน่วยต้องเป็น TRIPS ของร้าน */
export async function systemGate(tenantId: string, unitId: string): Promise<Gate | null> {
  const unit = await tenantDb({ tenantId }).businessUnit.findFirst({ where: { id: unitId }, select: { id: true, type: true, settings: true } });
  if (!unit || unit.type !== "TRIPS") return null;
  return { tenantId, unitId: unit.id, tz: tzOfSettings(unit.settings), actorId: null, actorType: "SYSTEM" };
}

export function unitDb(g: Gate) {
  return tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
}

// ───────────────────────── รหัส Postgres · SAVEPOINT · ธุรกรรม ─────────────────────────
const PG_CODES = new Set(["23P01", "23505", "23514", "40P01", "40001"]);
/** เดินสาย error (Prisma → driver adapter → pg) หา SQLSTATE · P2002 = 23505 · P2034 = 40001 · P2028 = TX_TIMEOUT */
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
      if (v === "P2002") return "23505";
      if (v === "P2034") return "40001";
      if (v === "P2028") return "TX_TIMEOUT";
    }
    if (typeof o.message === "string") {
      const msg = o.message;
      if (/exclusion constraint|_no_overlap/i.test(msg)) return "23P01";
      if (/duplicate key value|unique constraint/i.test(msg)) return "23505";
      if (/violates check constraint/i.test(msg)) return "23514";
      if (/deadlock detected/i.test(msg)) return "40P01";
    }
    if (o.cause) stack.push(o.cause);
    for (const v of Object.values(o)) if (v && typeof v === "object") stack.push(v);
  }
  return null;
}

/** ทำ fn ใต้ SAVEPOINT — ล้ม = ย้อนเฉพาะส่วนนี้ (tx ผู้เรียกใช้ต่อได้) แล้วคืน error ให้ผู้เรียกแปลง (ซ้อนได้ · ชื่อเดียวกัน = ตัวล่าสุด) */
export async function underSavepoint<T>(tx: Tx, fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  await tx.$executeRaw`SAVEPOINT trips_t03`;
  try {
    const value = await fn();
    await tx.$executeRaw`RELEASE SAVEPOINT trips_t03`;
    return { ok: true, value };
  } catch (error) {
    await tx.$executeRaw`ROLLBACK TO SAVEPOINT trips_t03`;
    await tx.$executeRaw`RELEASE SAVEPOINT trips_t03`;
    return { ok: false, error };
  }
}

/** ยุติธุรกรรมด้วยผลพลาด (ย้อนทั้ง tx) — inTx แปลงกลับเป็น DepartureFail */
class TxAbort extends Error {
  constructor(readonly fail: DepartureFail) {
    super(fail.code);
  }
}
export function abortTx(fail: DepartureFail): never {
  throw new TxAbort(fail);
}

const TX_OPTS = { maxWait: 10_000, timeout: 60_000 } as const;
/** ธุรกรรมของหน่วย (tenantDb ผูก tenantId+unitId) · deadlock/serialization ⇒ ลองใหม่ 1 ครั้ง แล้ว BUSY · ไม่ throw ผลพลาดของธุรกิจ */
export async function inTx<T>(g: Gate, fn: (tx: Tx) => Promise<T>): Promise<T | DepartureFail> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await unitDb(g).$transaction((t) => fn(t as unknown as Tx), TX_OPTS);
    } catch (e) {
      if (e instanceof TxAbort) return e.fail;
      const code = pgCodeOf(e);
      if (code === "40P01" || code === "40001") {
        if (attempt === 0) continue;
        return failOf("BUSY");
      }
      if (code === "TX_TIMEOUT") return failOf("BUSY");
      throw e;
    }
  }
}

/** audit ในธุรกรรมเดียวกับการเขียน · ไม่มีข้อมูลบุคคล · งาน SYSTEM actorId null */
export async function auditTx(tx: Tx, g: Gate, action: string, targetType: string, targetId: string, after?: Prisma.InputJsonValue, before?: Prisma.InputJsonValue) {
  await tx.auditLog.create({
    data: { tenantId: g.tenantId, unitId: g.unitId, actorType: g.actorType, actorId: g.actorId, action, targetType, targetId, after, before },
  });
}

const iso = (d: Date) => d.toISOString();
export const ID = z.string().trim().min(1).max(128);
/** เพดานของคอลัมน์ int4 (Postgres integer) — ตัวเลขจาก input ต้องไม่เกิน (ไม่งั้นเป็น error ดิบของฐาน) */
export const INT4_MAX = 2_147_483_647;
/** เวลา "ตอนนี้" ของผู้เรียก — opts.now ต้องเป็น Date ที่ถูกต้อง (ไม่ส่ง = นาฬิกาจริง) · ผิด ⇒ null (ผู้เรียกคืน INVALID_INPUT) */
export function nowOf(opts?: TripOpts): Date | null {
  const n = opts?.now;
  if (n === undefined) return new Date();
  return n instanceof Date && Number.isFinite(n.getTime()) ? n : null;
}

// ═══════════════════════ กันชนทรัพยากร ═══════════════════════
type ClashRow = { departureId: string; productId: string; localDate: string; startsAt: Date; endsAt: Date; title: string | null; resourceName: string | null; resourceId: string };

/** แถวใช้ทรัพยากร active ที่ทับช่วง [start, end) (ยกเว้นรอบ self) — ตัวแรกตามเวลา */
export async function findClash(tx: Tx, g: Gate, resourceId: string, start: Date, end: Date, selfDepartureId: string | null): Promise<ClashRow | null> {
  const rows = await tx.$queryRaw<ClashRow[]>`
    SELECT u."departureId", u."resourceId", d."productId", to_char(d."localDate", 'YYYY-MM-DD') AS "localDate", u."startsAt", u."endsAt",
           p."title"->>'th' AS "title", r."name" AS "resourceName"
    FROM "TripResourceUse" u
    JOIN "TripDeparture" d ON d."id" = u."departureId" AND d."tenantId" = u."tenantId" AND d."unitId" = u."unitId"
    LEFT JOIN "TripProduct" p ON p."id" = d."productId" AND p."tenantId" = d."tenantId"
    LEFT JOIN "TripResource" r ON r."id" = u."resourceId" AND r."tenantId" = u."tenantId"
    WHERE u."tenantId" = ${g.tenantId} AND u."unitId" = ${g.unitId} AND u."resourceId" = ${resourceId} AND u."active"
      AND u."startsAt" < ${iso(end)}::timestamp AND u."endsAt" > ${iso(start)}::timestamp
      AND u."departureId" <> ${selfDepartureId ?? ""}
    ORDER BY u."startsAt", u."id"
    LIMIT 1`;
  return rows[0] ?? null;
}

function thaiDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${d}/${m}/${y}`;
}

export function clashFail(g: Gate, c: ClashRow): DepartureFail {
  const conflict: DepartureConflict = {
    departureId: c.departureId,
    productId: c.productId,
    localDate: c.localDate,
    startsAt: iso(c.startsAt),
    endsAt: iso(c.endsAt),
    resourceId: c.resourceId,
  };
  const s = utcToLocal(g.tz, c.startsAt);
  const e = utcToLocal(g.tz, c.endsAt);
  const what = c.resourceName ? `"${c.resourceName}"` : "ทรัพยากรนี้";
  const msg = `${what} ถูกใช้แล้วกับรอบ "${c.title ?? c.productId}" วันที่ ${thaiDate(c.localDate)} เวลา ${hhmm(s.minutes)}–${hhmm(e.minutes)} — เลือกทรัพยากรอื่นหรือเปลี่ยนเวลา`;
  return failOf("RESOURCE_CLASH", msg, { conflict });
}

/** id ทรัพยากรไม่ซ้ำ เรียงตามตัวอักษร (ลำดับล็อกเดียวกันทุกทาง — กัน deadlock เมื่อสองทางถือชุดเดียวกันคนละลำดับ) */
export function sortedIds(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort();
}

/** ล็อกแถวทรัพยากร FOR SHARE เรียง id ใน tx ของผู้เรียก · คืนแถวที่พบ (ทรัพยากรของหน่วยนี้เท่านั้น) */
export async function lockResourcesShared(tx: Tx, g: Gate, ids: readonly string[]): Promise<{ id: string; active: boolean; name: string }[]> {
  const uniq = sortedIds(ids);
  if (!uniq.length) return [];
  return tx.$queryRaw<{ id: string; active: boolean; name: string }[]>`
    SELECT "id", "active", "name" FROM "TripResource"
    WHERE "id" = ANY(${uniq}::text[]) AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId}
    ORDER BY "id" FOR SHARE`;
}

/**
 * ทรัพยากรของหน่วยนี้ (ไม่ใช่ ⇒ NOT_FOUND · ปิดใช้ ⇒ RESOURCE_INACTIVE) — ล็อก FOR SHARE เรียง id ใน tx ของผู้เรียก
 * ชนกับ FOR UPDATE ของ setResourceActive ⇒ ปิดใช้แทรกกลางการมอบไม่ได้ · ลำดับ: แถวรอบ (1a) → ทรัพยากร → แถวใช้ (ไม่มีวง: setResourceActive ไม่ล็อกรอบ)
 */
export async function checkResources(tx: Tx, g: Gate, ids: readonly string[]): Promise<DepartureFail | null> {
  const uniq = sortedIds(ids);
  if (!uniq.length) return null;
  const rows = await lockResourcesShared(tx, g, uniq);
  if (rows.length !== uniq.length) return failOf("NOT_FOUND", "ไม่พบทรัพยากรในหน่วยนี้");
  const off = rows.find((r) => !r.active);
  if (off) return failOf("RESOURCE_INACTIVE", `"${off.name}" ปิดใช้อยู่`);
  return null;
}

/**
 * มอบทรัพยากรให้รอบใน tx ของผู้เรียก (ผู้เรียกล็อกแถวรอบแล้ว) · มอบซ้ำ = useId เดิม · ชน ⇒ RESOURCE_CLASH (ไม่เขียน)
 * INSERT ใต้ SAVEPOINT — EXCLUDE (23P01) = ด่านสุดท้ายเมื่อแข่งกัน
 */
export async function assignUseTx(tx: Tx, g: Gate, dep: { id: string; startsAt: Date; endsAt: Date }, resourceId: string): Promise<{ ok: true; useId: string } | DepartureFail> {
  const existing = await tx.tripResourceUse.findFirst({ where: { departureId: dep.id, resourceId, active: true }, select: { id: true }, orderBy: { id: "asc" } });
  if (existing) return { ok: true, useId: existing.id };
  const pre = await findClash(tx, g, resourceId, dep.startsAt, dep.endsAt, dep.id);
  if (pre) return clashFail(g, pre);
  const res = await underSavepoint(tx, () =>
    tx.tripResourceUse.create({
      data: { tenantId: g.tenantId, unitId: g.unitId, resourceId, departureId: dep.id, startsAt: dep.startsAt, endsAt: dep.endsAt, active: true },
      select: { id: true },
    }),
  );
  if (res.ok) return { ok: true, useId: res.value.id };
  if (pgCodeOf(res.error) === "23P01") {
    const c = await findClash(tx, g, resourceId, dep.startsAt, dep.endsAt, dep.id);
    if (c) return clashFail(g, c);
    return failOf("BUSY");
  }
  throw res.error;
}

/** ย้ายช่วงแถวใช้ทรัพยากร active ของรอบ (แก้เวลา) — ล็อกเรียง id (ชั้น 1c) · ชน ⇒ RESOURCE_CLASH (ผู้เรียกย้อนทั้ง tx) */
export async function moveUsesTx(tx: Tx, g: Gate, departureId: string, start: Date, end: Date, now: Date): Promise<DepartureFail | null> {
  const uses = await tx.$queryRaw<{ id: string; resourceId: string }[]>`
    SELECT "id", "resourceId" FROM "TripResourceUse"
    WHERE "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "departureId" = ${departureId} AND "active"
    ORDER BY "id" FOR UPDATE`;
  for (const u of uses) {
    const pre = await findClash(tx, g, u.resourceId, start, end, departureId);
    if (pre) return clashFail(g, pre);
    const res = await underSavepoint(tx, () =>
      tx.$executeRaw`UPDATE "TripResourceUse" SET "startsAt" = ${iso(start)}::timestamp, "endsAt" = ${iso(end)}::timestamp, "updatedAt" = ${iso(now)}::timestamp
        WHERE "id" = ${u.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "active"`,
    );
    if (!res.ok) {
      if (pgCodeOf(res.error) === "23P01") {
        const c = await findClash(tx, g, u.resourceId, start, end, departureId);
        return c ? clashFail(g, c) : failOf("BUSY");
      }
      throw res.error;
    }
  }
  return null;
}

/** ปิดแถวใช้ทรัพยากรทั้งหมดของรอบ (ยกเลิกรอบ) — ไม่ลบ */
export async function releaseUsesTx(tx: Tx, g: Gate, departureId: string, now: Date): Promise<number> {
  return tx.$executeRaw`UPDATE "TripResourceUse" SET "active" = false, "updatedAt" = ${iso(now)}::timestamp
    WHERE "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "departureId" = ${departureId} AND "active"`;
}

/** ล็อกแถวรอบ (ชั้น 1a) — คืนสถานะ/เวลาที่ต้องใช้ */
export type LockedDeparture = {
  id: string;
  productId: string;
  optionId: string | null;
  scheduleId: string | null;
  localDate: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  capacity: number;
  sold: number;
  held: number;
  reserved: number;
  minPax: number | null;
  version: number;
};
export async function lockDeparture(tx: Tx, g: Gate, id: string): Promise<LockedDeparture | null> {
  const rows = await tx.$queryRaw<LockedDeparture[]>`
    SELECT "id", "productId", "optionId", "scheduleId", to_char("localDate", 'YYYY-MM-DD') AS "localDate", "startsAt", "endsAt", "status",
           "capacity", "sold", "held", "reserved", "minPax", "version"
    FROM "TripDeparture"
    WHERE "id" = ${id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId}
    FOR UPDATE`;
  return rows[0] ?? null;
}

// ═══════════════════════ บริการทรัพยากร ═══════════════════════
export const RESOURCE_KINDS = ["BOAT", "VAN", "GUIDE", "OTHER"] as const;
const NAME = z.string().trim().min(1).max(80);
const SEATS = z.number().int().min(1).max(INT4_MAX).nullable();
const HR = z.string().trim().min(1).max(128).nullable();

const createResourceInput = z.strictObject({ unitId: ID, kind: z.enum(RESOURCE_KINDS), name: NAME, seats: SEATS.optional(), hrEmployeeId: HR.optional() });
const updateResourceInput = z.strictObject({ unitId: ID, resourceId: ID, name: NAME.optional(), seats: SEATS.optional(), hrEmployeeId: HR.optional() });
const setActiveInput = z.strictObject({ unitId: ID, resourceId: ID, active: z.boolean() });
const listInput = z.strictObject({ unitId: ID, kind: z.enum(RESOURCE_KINDS).optional(), includeInactive: z.boolean().optional() });
const assignInput = z.strictObject({ unitId: ID, departureId: ID, resourceId: ID });

function unitIdOf(input: unknown): unknown {
  return isRecord(input) ? input.unitId : undefined;
}
function invalid(e: z.ZodError): DepartureFail {
  return failOf("INVALID_INPUT", e.issues[0]?.message ? `ข้อมูลไม่ถูกต้อง: ${e.issues[0].message}` : undefined);
}

export async function createResource(ctx: TripCtx, input: unknown): Promise<{ ok: true; id: string } | DepartureFail> {
  const g = await gateUnit(ctx, unitIdOf(input), "resource");
  if (isFail(g)) return g;
  const p = createResourceInput.safeParse(input);
  if (!p.success) return invalid(p.error);
  const v = p.data;
  return inTx(g, async (tx) => {
    const r = await tx.tripResource.create({
      data: { tenantId: g.tenantId, unitId: g.unitId, kind: v.kind, name: v.name, seats: v.seats ?? null, hrEmployeeId: v.hrEmployeeId ?? null, active: true },
      select: { id: true },
    });
    await auditTx(tx, g, "trips.resource.create", "TripResource", r.id, { kind: v.kind, name: v.name, seats: v.seats ?? null });
    return { ok: true as const, id: r.id };
  });
}

export async function updateResource(ctx: TripCtx, input: unknown): Promise<{ ok: true; id: string } | DepartureFail> {
  const g = await gateUnit(ctx, unitIdOf(input), "resource");
  if (isFail(g)) return g;
  const p = updateResourceInput.safeParse(input);
  if (!p.success) return invalid(p.error);
  const v = p.data;
  const data: Prisma.TripResourceUpdateManyMutationInput = {};
  if (v.name !== undefined) data.name = v.name;
  if (v.seats !== undefined) data.seats = v.seats;
  if (v.hrEmployeeId !== undefined) data.hrEmployeeId = v.hrEmployeeId;
  return inTx(g, async (tx) => {
    const n = await tx.tripResource.updateMany({ where: { id: v.resourceId }, data });
    if (n.count !== 1) return failOf("NOT_FOUND");
    await auditTx(tx, g, "trips.resource.update", "TripResource", v.resourceId, { name: v.name ?? null, seats: v.seats ?? null });
    return { ok: true as const, id: v.resourceId };
  });
}

export async function setResourceActive(ctx: TripCtx, input: unknown, opts?: TripOpts): Promise<{ ok: true; id: string } | DepartureFail> {
  const g = await gateUnit(ctx, unitIdOf(input), "resource");
  if (isFail(g)) return g;
  const p = setActiveInput.safeParse(input);
  if (!p.success) return invalid(p.error);
  const v = p.data;
  const now = nowOf(opts);
  if (!now) return failOf("INVALID_INPUT", "เวลาไม่ถูกต้อง");
  return inTx(g, async (tx) => {
    const r = await tx.$queryRaw<{ id: string; active: boolean }[]>`
      SELECT "id", "active" FROM "TripResource" WHERE "id" = ${v.resourceId} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} FOR UPDATE`;
    if (!r[0]) return failOf("NOT_FOUND");
    if (r[0].active === v.active) return { ok: true as const, id: v.resourceId };
    if (!v.active) {
      const busy = await tx.$queryRaw<{ departureId: string }[]>`
        SELECT DISTINCT u."departureId" FROM "TripResourceUse" u
        JOIN "TripDeparture" d ON d."id" = u."departureId" AND d."tenantId" = u."tenantId" AND d."unitId" = u."unitId"
        WHERE u."tenantId" = ${g.tenantId} AND u."unitId" = ${g.unitId} AND u."resourceId" = ${v.resourceId} AND u."active"
          AND d."status" <> 'CANCELLED' AND d."startsAt" > ${iso(now)}::timestamp`;
      // กฎซ้ำที่ยังไม่พักและยังไม่จบ (dateTo ว่าง หรือไม่ก่อนเมื่อวานตาม UTC — เผื่อเขตเวลา) ที่อ้างทรัพยากรนี้ ⇒ งานรายวันจะมอบต่อ
      const scheds = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "TripSchedule"
        WHERE "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "pausedAt" IS NULL AND ${v.resourceId} = ANY("resourceIds")
          AND ("dateTo" IS NULL OR "dateTo" >= ${iso(now).slice(0, 10)}::date - 1)
        ORDER BY "id"`;
      if (busy.length || scheds.length) {
        return failOf(
          "RESOURCE_IN_USE",
          `ทรัพยากรนี้ยังถูกใช้กับรอบที่ยังไม่ถึง ${busy.length} รอบ และกฎซ้ำที่ยังเปิดอยู่ ${scheds.length} กฎ — ถอนออกหรือพักกฎก่อน`,
          { departureIds: busy.map((b) => b.departureId).sort(), scheduleIds: scheds.map((x) => x.id) },
        );
      }
    }
    await tx.tripResource.updateMany({ where: { id: v.resourceId }, data: { active: v.active } });
    await auditTx(tx, g, "trips.resource.activate", "TripResource", v.resourceId, { active: v.active });
    return { ok: true as const, id: v.resourceId };
  });
}

export type ResourceItem = { id: string; kind: string; name: string; seats: number | null; hrEmployeeId: string | null; active: boolean };
export async function listResources(ctx: TripCtx, input: unknown): Promise<{ ok: true; items: ResourceItem[] } | DepartureFail> {
  const g = await gateUnit(ctx, unitIdOf(input), "resourceRead");
  if (isFail(g)) return g;
  const p = listInput.safeParse(input);
  if (!p.success) return invalid(p.error);
  const v = p.data;
  const items = await unitDb(g).tripResource.findMany({
    where: { ...(v.kind ? { kind: v.kind } : {}), ...(v.includeInactive ? {} : { active: true }) },
    select: { id: true, kind: true, name: true, seats: true, hrEmployeeId: true, active: true },
    orderBy: [{ kind: "asc" }, { name: "asc" }, { id: "asc" }],
  });
  return { ok: true, items };
}

export async function assignResource(ctx: TripCtx, input: unknown): Promise<{ ok: true; useId: string } | DepartureFail> {
  const g = await gateUnit(ctx, unitIdOf(input), "edit");
  if (isFail(g)) return g;
  const p = assignInput.safeParse(input);
  if (!p.success) return invalid(p.error);
  const v = p.data;
  return inTx(g, async (tx) => {
    const dep = await lockDeparture(tx, g, v.departureId);
    if (!dep) return failOf("NOT_FOUND");
    const bad = await checkResources(tx, g, [v.resourceId]);
    if (bad) return bad;
    if (dep.status === "CANCELLED") return failOf("BAD_STATE", "รอบนี้ยกเลิกแล้ว");
    const r = await assignUseTx(tx, g, dep, v.resourceId);
    if (!r.ok) return r;
    await auditTx(tx, g, "trips.resource.assign", "TripDeparture", dep.id, { resourceId: v.resourceId, useId: r.useId });
    return r;
  });
}

export async function unassignResource(ctx: TripCtx, input: unknown): Promise<{ ok: true; id: string } | DepartureFail> {
  const g = await gateUnit(ctx, unitIdOf(input), "edit");
  if (isFail(g)) return g;
  const p = assignInput.safeParse(input);
  if (!p.success) return invalid(p.error);
  const v = p.data;
  return inTx(g, async (tx) => {
    const dep = await lockDeparture(tx, g, v.departureId);
    if (!dep) return failOf("NOT_FOUND");
    const uses = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "TripResourceUse"
      WHERE "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "departureId" = ${dep.id} AND "resourceId" = ${v.resourceId} AND "active"
      ORDER BY "id" FOR UPDATE`;
    if (!uses.length) return failOf("NOT_FOUND", "ทรัพยากรนี้ไม่ได้ถูกมอบให้รอบนี้");
    await tx.tripResourceUse.updateMany({ where: { id: { in: uses.map((u) => u.id) } }, data: { active: false } });
    await auditTx(tx, g, "trips.resource.unassign", "TripDeparture", dep.id, { resourceId: v.resourceId });
    return { ok: true as const, id: uses[0].id };
  });
}

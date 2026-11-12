// ─────────────────────────────────────────────────────────────
// trips/pickup.ts — บริการโซนรับส่งของหน่วย TRIPS (RUN TRIPS T1.1 §5) + ด่านหน่วยที่ตัวโหลดจอ (screens.ts) ใช้ร่วม
// ด่าน: สมาชิกภาพสด → หน่วยของร้าน + canAccessUnit (⇒ NOT_FOUND) → ชนิด TRIPS (⇒ UNIT_NOT_TRIPS) → สิทธิ์ (⇒ FORBIDDEN) → zod strict (⇒ INVALID_INPUT)
// 🔴 tenantDb({ tenantId, unitId }) เท่านั้น · เลือกฟิลด์ก่อน update เสมอ (ไม่ส่งออบเจกต์ของผู้เรียกเข้า data · OQ18) · ไม่มีการลบ (ปิดใช้ด้วย active=false)
// 🔴 ทุกการเขียนอยู่ใต้ advisory lock ต่อหน่วย (ชื่อซ้ำ · เพดาน · ลำดับ ตัดสินใต้ล็อก) · deadlock/หมดเวลา ⇒ BUSY · audit trips.pickup.* ในธุรกรรมเดียวกัน · ไม่มี event ใหม่
// 🔴 สิทธิ์: อ่าน ⇔ trips.product.view|edit|publish · เขียน ⇔ trips.product.edit · ตั้ง/เปลี่ยนค่าบวกเพิ่ม (≠ 0) ต้องมี trips.price.edit เพิ่ม (มติ Q3)
// ⚠️ หนี้ (ใบ W1.2/T0.6): pricing.ts อ่านโซนโดยไม่กรอง active — ตอนจองต้องปฏิเสธโซนที่ปิด
// ─────────────────────────────────────────────────────────────
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { tenantDb } from "@/lib/core/db";
import { canAccessUnit, evaluate, type MembershipCtx } from "@/lib/core/rbac";
import {
  PICKUP_ZONE_LIMIT,
  cleanAreas,
  pickupPolygonOf,
  pickupShapeIssue,
  pickupZoneActiveSchema,
  pickupZoneFromRow,
  pickupZoneInputSchema,
  pickupZoneListSchema,
  pickupZonePatchSchema,
  pickupZoneReorderSchema,
  type PickupErrorCode,
  type PickupZoneDTO,
} from "./pickup-core";

type Tx = Prisma.TransactionClient;
export type TripsScreenCtx = { tenantId: string; actorUserId: string };
export type TripsFail<C extends string = string> = { ok: false; code: C; message: string };

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const ID = z.string().min(1).max(100);
const CTX = z.object({ tenantId: ID, actorUserId: ID });
const UNIT_REF = z.object({ unitId: ID });

const MSG: Record<string, string> = {
  INVALID_INPUT: "ข้อมูลที่ส่งมายังไม่ครบหรือรูปแบบยังไม่ตรง — ตรวจแล้วลองอีกครั้ง",
  NOT_FOUND: "ไม่พบรายการนี้ในหน่วยที่เลือก",
  FORBIDDEN: "บัญชีนี้ยังไม่ได้รับสิทธิ์ทำรายการนี้ — ติดต่อเจ้าของร้านหรือผู้จัดการเพื่อขอสิทธิ์",
  UNIT_NOT_TRIPS: "หน่วยนี้ไม่ใช่หน่วยทัวร์",
  NAME_TAKEN: "มีโซนที่เปิดใช้อยู่ใช้ชื่อนี้แล้ว — ตั้งชื่ออื่นหรือปิดโซนเดิมก่อน",
  ZONE_LIMIT: `โซนที่เปิดใช้อยู่ครบ ${PICKUP_ZONE_LIMIT} โซนแล้ว — ปิดโซนที่ไม่ใช้ก่อนเพิ่มใหม่`,
  BUSY: "มีคนแก้โซนรับส่งของหน่วยนี้อยู่พร้อมกัน — ลองอีกครั้ง",
};
export function tripsFail<C extends string>(code: C, message?: string): TripsFail<C> {
  return { ok: false, code, message: message ?? MSG[code] ?? "ทำรายการไม่สำเร็จ — ลองอีกครั้ง" };
}
const isFail = (x: unknown): x is TripsFail => isRec(x) && x.ok === false;

// ═══════════════ ด่านหน่วย (ใช้ร่วมกับ screens.ts) ═══════════════
export type TripsUnitGate = {
  tenantId: string;
  unitId: string;
  unitSlug: string;
  unitName: string;
  actorUserId: string;
  member: MembershipCtx;
  /** tenantDb ผูกร้าน + หน่วย */
  db: ReturnType<typeof tenantDb>;
  can(action: string): boolean;
  canAny(actions: readonly string[]): boolean;
};
/** สมาชิกภาพสด → หน่วยของร้านที่เข้าได้ (ไม่ได้ ⇒ NOT_FOUND) → ชนิด TRIPS (⇒ UNIT_NOT_TRIPS) — ไม่ตัดสินสิทธิ์ (ผู้เรียกตัดสิน) */
export async function tripsUnitGate(ctx: unknown, input: unknown): Promise<TripsUnitGate | TripsFail<"NOT_FOUND" | "UNIT_NOT_TRIPS" | "INVALID_INPUT">> {
  const c = CTX.safeParse(ctx);
  if (!c.success) return tripsFail("NOT_FOUND");
  const u = UNIT_REF.safeParse(input);
  if (!u.success) return tripsFail("INVALID_INPUT");
  const { tenantId, actorUserId } = c.data;
  const tdb = tenantDb({ tenantId });
  const mem = await tdb.membership.findFirst({ where: { tenantId, userId: actorUserId, acceptedAt: { not: null } }, select: { role: true, unitAccess: true, permissions: true } });
  if (!mem) return tripsFail("NOT_FOUND");
  const member: MembershipCtx = {
    role: mem.role,
    unitAccess: Array.isArray(mem.unitAccess) ? mem.unitAccess.filter((x): x is string => typeof x === "string") : [],
    permissions: isRec(mem.permissions) ? mem.permissions : {},
  };
  const unit = await tdb.businessUnit.findFirst({ where: { id: u.data.unitId, tenantId, status: "ACTIVE" }, select: { id: true, type: true, slug: true, name: true } });
  if (!unit || !canAccessUnit(member, unit.id)) return tripsFail("NOT_FOUND");
  if (unit.type !== "TRIPS") return tripsFail("UNIT_NOT_TRIPS");
  const can = (action: string) => evaluate(member, { module: "trips", action, unitId: unit.id });
  return {
    tenantId,
    unitId: unit.id,
    unitSlug: unit.slug,
    unitName: unit.name,
    actorUserId,
    member,
    db: tenantDb({ tenantId, unitId: unit.id }),
    can,
    canAny: (actions) => actions.some(can),
  };
}

export const TRIPS_PRODUCT_VIEW_ANY = ["trips.product.view", "trips.product.edit", "trips.product.publish"] as const;

// ═══════════════ ธุรกรรม ═══════════════
const TX_OPTS = { maxWait: 20_000, timeout: 30_000 } as const;
class Abort extends Error {
  constructor(readonly fail: TripsFail<PickupErrorCode>) {
    super(fail.code);
  }
}
const abort = (code: PickupErrorCode): never => {
  throw new Abort(tripsFail(code));
};
function pgCode(e: unknown): string {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = JSON.stringify(e.meta ?? {});
    if (/40P01/.test(meta)) return "40P01";
    if (/40001/.test(meta)) return "40001";
    return e.code;
  }
  return e instanceof Error && /deadlock|40P01/i.test(e.message) ? "40P01" : "";
}
/** ธุรกรรมของหน่วยใต้ advisory lock ต่อหน่วย · deadlock/serialization ลองใหม่ 1 ครั้ง · หมดเวลารอ ⇒ BUSY */
async function locked<T>(g: TripsUnitGate, fn: (tx: Tx) => Promise<T>): Promise<T | TripsFail<PickupErrorCode>> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await g.db.$transaction(async (t) => {
        const tx = t as unknown as Tx;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`trips-pickup:${g.tenantId}:${g.unitId}`}, 0))`;
        return fn(tx);
      }, TX_OPTS);
    } catch (e) {
      if (e instanceof Abort) return e.fail;
      const code = pgCode(e);
      if ((code === "40P01" || code === "40001" || code === "P2034") && attempt === 0) continue;
      if (code === "40P01" || code === "40001" || code === "P2034" || code === "P2028") return tripsFail("BUSY");
      throw e;
    }
  }
}
async function audit(tx: Tx, g: TripsUnitGate, action: string, targetId: string, before: unknown, after: unknown): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: g.tenantId,
      unitId: g.unitId,
      actorType: "USER",
      actorId: g.actorUserId,
      action,
      targetType: "TripPickupZone",
      targetId,
      ...(before === null || before === undefined ? {} : { before: before as Prisma.InputJsonValue }),
      ...(after === null || after === undefined ? {} : { after: after as Prisma.InputJsonValue }),
    },
  });
}

const ROW_SELECT = { id: true, unitId: true, name: true, pickupOffsetMin: true, surchargeSatang: true, polygon: true, sortOrder: true } as const;
async function zonesOf(tx: Tx | TripsUnitGate["db"], g: TripsUnitGate): Promise<PickupZoneDTO[]> {
  const rows = await tx.tripPickupZone.findMany({ where: { tenantId: g.tenantId, unitId: g.unitId }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: ROW_SELECT });
  return rows.map(pickupZoneFromRow);
}
const nameKey = (s: string) => s.trim().toLocaleLowerCase("th");
const auditView = (z1: PickupZoneDTO) => ({ kind: z1.kind, name: z1.name, areas: z1.areas, pickupOffsetMin: z1.pickupOffsetMin, windowMin: z1.windowMin, surchargeSatang: z1.surchargeSatang, active: z1.active });

type ReadLevel = "read" | "write";
async function gateFor(ctx: unknown, input: unknown, level: ReadLevel): Promise<TripsUnitGate | TripsFail<PickupErrorCode>> {
  const g = await tripsUnitGate(ctx, input);
  if (isFail(g)) return g as TripsFail<PickupErrorCode>;
  const ok = level === "read" ? g.canAny(TRIPS_PRODUCT_VIEW_ANY) : g.can("trips.product.edit");
  return ok ? g : tripsFail("FORBIDDEN");
}
function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> | TripsFail<"INVALID_INPUT"> {
  const r = schema.safeParse(input);
  return r.success ? r.data : tripsFail("INVALID_INPUT");
}

// ═══════════════ อ่าน ═══════════════
/** โซนของหน่วย เรียง sortOrder, id · ปริยายเฉพาะที่เปิด (includeInactive ⇒ ทั้งหมด) */
export async function listPickupZones(ctx: TripsScreenCtx, input: unknown): Promise<{ ok: true; items: PickupZoneDTO[] } | TripsFail<PickupErrorCode>> {
  const g = await gateFor(ctx, input, "read");
  if (isFail(g)) return g;
  const p = parse(pickupZoneListSchema, input);
  if (isFail(p)) return p;
  const all = await zonesOf(g.db, g);
  return { ok: true, items: p.includeInactive ? all : all.filter((z1) => z1.active) };
}
/** โซนที่เปิดของหน่วยสำหรับตัวโหลดจอ (ผู้เรียกผ่านด่านแล้ว) */
export async function activePickupZonesOf(g: TripsUnitGate): Promise<PickupZoneDTO[]> {
  return (await zonesOf(g.db, g)).filter((z1) => z1.active);
}

// ═══════════════ เขียน ═══════════════
export async function createPickupZone(ctx: TripsScreenCtx, input: unknown): Promise<{ ok: true; id: string } | TripsFail<PickupErrorCode>> {
  const g = await gateFor(ctx, input, "write");
  if (isFail(g)) return g;
  const p = parse(pickupZoneInputSchema, input);
  if (isFail(p)) return p;
  if (p.surchargeSatang !== 0 && !g.can("trips.price.edit")) return tripsFail("FORBIDDEN");
  const dto = {
    kind: p.kind,
    name: { th: p.name.th.trim(), en: p.name.en?.trim() ? p.name.en.trim() : null },
    areas: cleanAreas(p.areas),
    windowMin: p.windowMin,
    active: true,
  };
  return locked(g, async (tx) => {
    const zones = await zonesOf(tx, g);
    const open = zones.filter((z1) => z1.active);
    if (open.some((z1) => nameKey(z1.name.th) === nameKey(dto.name.th))) abort("NAME_TAKEN");
    if (open.length >= PICKUP_ZONE_LIMIT) abort("ZONE_LIMIT");
    const sortOrder = zones.reduce((m, z1) => Math.max(m, z1.sortOrder), -1) + 1;
    const row = await tx.tripPickupZone.create({
      data: {
        tenantId: g.tenantId,
        unitId: g.unitId,
        name: dto.name.th,
        pickupOffsetMin: p.pickupOffsetMin,
        surchargeSatang: p.surchargeSatang,
        polygon: pickupPolygonOf(dto) as Prisma.InputJsonValue,
        sortOrder,
      },
      select: { id: true },
    });
    await audit(tx, g, "trips.pickup.create", row.id, null, { ...dto, pickupOffsetMin: p.pickupOffsetMin, surchargeSatang: p.surchargeSatang, sortOrder });
    return { ok: true as const, id: row.id };
  });
}

export async function updatePickupZone(ctx: TripsScreenCtx, input: unknown): Promise<{ ok: true; id: string } | TripsFail<PickupErrorCode>> {
  const g = await gateFor(ctx, input, "write");
  if (isFail(g)) return g;
  const p = parse(pickupZonePatchSchema, input);
  if (isFail(p)) return p;
  return locked(g, async (tx) => {
    const cur = (await zonesOf(tx, g)).find((z1) => z1.id === p.zoneId);
    if (!cur) return abort("NOT_FOUND");
    const next: PickupZoneDTO = {
      ...cur,
      kind: p.kind ?? cur.kind,
      name: p.name ? { th: p.name.th.trim(), en: p.name.en?.trim() ? p.name.en.trim() : null } : cur.name,
      areas: p.areas === undefined ? cur.areas : cleanAreas(p.areas),
      pickupOffsetMin: p.pickupOffsetMin ?? cur.pickupOffsetMin,
      windowMin: p.windowMin ?? cur.windowMin,
      surchargeSatang: p.surchargeSatang ?? cur.surchargeSatang,
    };
    if (pickupShapeIssue(next)) abort("INVALID_INPUT");
    if (next.surchargeSatang !== cur.surchargeSatang && !g.can("trips.price.edit")) abort("FORBIDDEN");
    if (next.active && nameKey(next.name.th) !== nameKey(cur.name.th)) {
      const others = (await zonesOf(tx, g)).filter((z1) => z1.active && z1.id !== cur.id);
      if (others.some((z1) => nameKey(z1.name.th) === nameKey(next.name.th))) abort("NAME_TAKEN");
    }
    // เลือกฟิลด์เอง — ไม่ส่งออบเจกต์ของผู้เรียกเข้า data
    const n = await tx.tripPickupZone.updateMany({
      where: { id: cur.id, tenantId: g.tenantId, unitId: g.unitId },
      data: { name: next.name.th, pickupOffsetMin: next.pickupOffsetMin, surchargeSatang: next.surchargeSatang, polygon: pickupPolygonOf(next) as Prisma.InputJsonValue },
    });
    if (n.count !== 1) abort("NOT_FOUND");
    await audit(tx, g, "trips.pickup.update", cur.id, auditView(cur), auditView(next));
    return { ok: true as const, id: cur.id };
  });
}

export async function setPickupZoneActive(ctx: TripsScreenCtx, input: unknown): Promise<{ ok: true; id: string } | TripsFail<PickupErrorCode>> {
  const g = await gateFor(ctx, input, "write");
  if (isFail(g)) return g;
  const p = parse(pickupZoneActiveSchema, input);
  if (isFail(p)) return p;
  return locked(g, async (tx) => {
    const zones = await zonesOf(tx, g);
    const cur = zones.find((z1) => z1.id === p.zoneId);
    if (!cur) return abort("NOT_FOUND");
    if (cur.active === p.active) return { ok: true as const, id: cur.id };
    if (p.active) {
      const open = zones.filter((z1) => z1.active);
      if (open.some((z1) => nameKey(z1.name.th) === nameKey(cur.name.th))) abort("NAME_TAKEN");
      if (open.length >= PICKUP_ZONE_LIMIT) abort("ZONE_LIMIT");
    }
    const next = { ...cur, active: p.active };
    const n = await tx.tripPickupZone.updateMany({ where: { id: cur.id, tenantId: g.tenantId, unitId: g.unitId }, data: { polygon: pickupPolygonOf(next) as Prisma.InputJsonValue } });
    if (n.count !== 1) abort("NOT_FOUND");
    await audit(tx, g, "trips.pickup.active", cur.id, { active: cur.active }, { active: p.active });
    return { ok: true as const, id: cur.id };
  });
}

/** ลำดับใหม่ = ทุกโซนของหน่วย (รวมที่ปิด) ครบชุด ไม่ซ้ำ ⇒ sortOrder 0..n−1 · id ของหน่วยอื่น ⇒ NOT_FOUND · ขาด/เกิน/ซ้ำ ⇒ INVALID_INPUT */
export async function reorderPickupZones(ctx: TripsScreenCtx, input: unknown): Promise<{ ok: true } | TripsFail<PickupErrorCode>> {
  const g = await gateFor(ctx, input, "write");
  if (isFail(g)) return g;
  const p = parse(pickupZoneReorderSchema, input);
  if (isFail(p)) return p;
  return locked(g, async (tx) => {
    const zones = await zonesOf(tx, g);
    const mine = new Set(zones.map((z1) => z1.id));
    if (p.ids.some((id) => !mine.has(id))) abort("NOT_FOUND");
    if (new Set(p.ids).size !== p.ids.length || p.ids.length !== zones.length) abort("INVALID_INPUT");
    const before = zones.map((z1) => z1.id);
    for (let i = 0; i < p.ids.length; i++) {
      await tx.tripPickupZone.updateMany({ where: { id: p.ids[i], tenantId: g.tenantId, unitId: g.unitId }, data: { sortOrder: i } });
    }
    await audit(tx, g, "trips.pickup.reorder", g.unitId, { ids: before }, { ids: p.ids });
    return { ok: true as const };
  });
}

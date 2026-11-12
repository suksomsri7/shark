// SVC H.10 ▸ ช่องทาง OTA — ตัวต่อของหน่วย + แม็ปห้อง/แผนราคา/buffer (ใบสั่ง ledger/svc-briefs/svc-brief-h.10.md §1 · §2 ข้อ 5–7 · §3 · §9 · §10)
//   • ตัวต่อ = TenantIntegration kind CHANNEL_MANAGER (ศูนย์เชื่อมต่อ) · connectionId หลวม (ไม่มี FK) ⇒ ทุกการเขียนตรวจ: ร้านเดียวกัน · ชนิด CHANNEL_MANAGER · unitIds ครอบหน่วย
//   • ฟังก์ชันที่มีผู้ใช้รับ (actor, ctx {tenantId}, input {unitId, …}) แบบ hotel/* · ด่าน: หน่วย HOTEL ของร้าน → เข้าหน่วยได้ (ไม่ได้ ⇒ NOT_FOUND) → สิทธิ์ hotel.channel.manage (FORBIDDEN)
//     ตัวต่อ/ประเภทห้อง/แผนนอกร้าน/นอกหน่วย ⇒ NOT_FOUND · ล้มทุกแบบ = { ok:false, code, reason(ไทย) } ไม่ throw
//   • การเขียนแม็ป/buffer ⇒ AuditLog (ไม่มี PII) + channel.ari.dirty ทั้งช่วง (ARI ต้องคำนวณใหม่) ใน tx เดียวกัน
//   • DTO ไม่มีค่าลับ/ฟิลด์ของตัวต่อ (X10) · ตัวภายใน (ไม่มี actor) รับ id ตรง: channelMappingFor(connectionId)
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { tenantDb } from "@/lib/core/db";
import { emitOutbox } from "@/lib/core/outbox";
import { canAccessUnit, evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { bkkYmd } from "@/lib/core/quiet-hours";
import { ymdAdd, type ChannelMapping } from "./types";

export const CHANNEL_MANAGE = "hotel.channel.manage";
export const CHANNEL_KIND = "CHANNEL_MANAGER";
/** ช่วง dirty เต็มเมื่อแม็ปเปลี่ยน (ผู้รวมชุดตัดตาม ariHorizonDays อีกชั้น) */
export const ARI_MAX_HORIZON = 400;

export type ChannelActor = MembershipCtx & { userId: string };
export type ChannelFailCode = "NOT_FOUND" | "FORBIDDEN" | "VALIDATION" | "CONFLICT" | "INVALID_STATUS" | "BUSY";
export type ChannelFail = { ok: false; code: ChannelFailCode; reason: string };
export type ConnectionRow = { id: string; tenantId: string; kind: string; provider: string; label: string; status: string; unitIds: string[]; onFailure: string };

export const R = {
  notFound: "ไม่พบตัวต่อช่องทางหรือโรงแรมนี้ (หรืออยู่นอกสาขาที่คุณดูแล)",
  forbidden: "คุณยังไม่มีสิทธิ์จัดการช่องทาง OTA — ขอสิทธิ์จากเจ้าของร้าน",
  busy: "ระบบไม่ว่าง ลองใหม่อีกครั้ง",
};

export const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
export const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export const fail = (code: ChannelFailCode, reason: string): ChannelFail => ({ ok: false, code, reason });
export const isFail = (v: unknown): v is ChannelFail => isRec(v) && v.ok === false;
export const dbDate = (ymd: string): Date => new Date(`${ymd}T00:00:00.000Z`);
export const ymdOfDb = (d: Date | string): string => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
const zodReason = (e: z.ZodError): string => {
  const m = e.issues[0]?.message ?? "";
  return /[฀-๿]/.test(m) ? m : "ข้อมูลไม่ครบหรือไม่ถูกต้อง";
};
/** ตัวอ่านข้ามร้าน (SQL ดิบ · แบบ sweeper ของ booking.ts) — เขียนจริงผ่าน tenantDb ของร้านนั้นเสมอ */
export const scanDb = () => tenantDb({ tenantId: "hotel-channel-scan" });
export const covers = (unitIds: readonly string[], unitId: string): boolean => unitIds.length === 0 || unitIds.includes(unitId);

function actorOf(a: unknown): ChannelActor | null {
  if (!isRec(a) || !isStr(a.role) || !isStr(a.userId)) return null;
  return {
    role: a.role as MembershipCtx["role"],
    unitAccess: Array.isArray(a.unitAccess) ? a.unitAccess.filter(isStr) : [],
    permissions: isRec(a.permissions) ? a.permissions : {},
    userId: a.userId,
  };
}

export type ChannelGate = { tenantId: string; unitId: string; unitName: string; actor: ChannelActor };
/** ด่านของฟังก์ชันที่มีผู้ใช้: หน่วย HOTEL ของร้าน → เข้าหน่วยได้ → hotel.channel.manage */
export async function channelGate(actorIn: unknown, ctx: unknown, input: unknown): Promise<ChannelGate | ChannelFail> {
  const tenantId = isRec(ctx) ? ctx.tenantId : null;
  const unitId = isRec(input) ? input.unitId : null;
  const actor = actorOf(actorIn);
  if (!actor || !isStr(tenantId) || !isStr(unitId)) return fail("NOT_FOUND", R.notFound);
  const unit = await tenantDb({ tenantId }).businessUnit.findFirst({ where: { id: unitId, type: "HOTEL" }, select: { id: true, name: true } });
  if (!unit || !canAccessUnit(actor, unit.id)) return fail("NOT_FOUND", R.notFound);
  if (!evaluate(actor, { module: "hotel", action: CHANNEL_MANAGE, unitId: unit.id })) return fail("FORBIDDEN", R.forbidden);
  return { tenantId, unitId: unit.id, unitName: unit.name, actor };
}

/** ตัวต่อ CHANNEL_MANAGER ของร้าน (ไม่ส่ง unitId = ไม่ตรวจหน่วย) — ไม่พบ/คนละร้าน/ไม่ครอบหน่วย ⇒ null */
export async function connectionOf(tenantId: string, connectionId: unknown, unitId?: string): Promise<ConnectionRow | null> {
  if (!isStr(connectionId)) return null;
  const row = await tenantDb({ tenantId }).tenantIntegration.findFirst({
    where: { id: connectionId, kind: CHANNEL_KIND },
    select: { id: true, tenantId: true, kind: true, provider: true, label: true, status: true, unitIds: true, onFailure: true },
  });
  if (!row || row.tenantId !== tenantId) return null;
  if (unitId !== undefined && !covers(row.unitIds, unitId)) return null;
  return row;
}

/** ตัวต่อตาม id ข้ามร้าน (ตัวภายใน: งานรายนาที/ข้อสอบ) */
export async function connectionById(connectionId: unknown): Promise<ConnectionRow | null> {
  if (!isStr(connectionId)) return null;
  const rows = await scanDb().$queryRaw<ConnectionRow[]>`
    SELECT "id", "tenantId", "kind", "provider", "label", "status", "unitIds", "onFailure" FROM "TenantIntegration"
     WHERE "id" = ${connectionId} AND "kind" = ${CHANNEL_KIND} LIMIT 1`;
  return rows[0] ?? null;
}

type Tx = Prisma.TransactionClient;
/** channel.ari.dirty ใน tx ของผู้เรียก (ARI ต้องคำนวณใหม่ · payload id/วันล้วน) */
export async function emitDirtyTx(tx: Tx, tenantId: string, unitId: string, roomTypeIds: string[], from: string, to: string): Promise<void> {
  await emitOutbox(tx, {
    tenantId,
    unitId,
    type: "channel.ari.dirty",
    idempotencyKey: `channel.ari.dirty#${randomUUID()}`,
    payload: { unitId, roomTypeIds, from, to },
  });
}
const auditTx = (tx: Tx, g: ChannelGate, action: string, targetId: string, before: unknown, after: unknown) =>
  tx.auditLog.create({
    data: {
      tenantId: g.tenantId,
      unitId: g.unitId,
      actorType: "USER",
      actorId: g.actor.userId,
      action,
      targetType: "ChannelConnection",
      targetId,
      before: before === null ? undefined : (JSON.parse(JSON.stringify(before)) as Prisma.InputJsonValue),
      after: after === null ? undefined : (JSON.parse(JSON.stringify(after)) as Prisma.InputJsonValue),
    },
  });
const fullRange = () => {
  const today = bkkYmd(new Date());
  return { from: today, to: ymdAdd(today, ARI_MAX_HORIZON) };
};
function isUnique(e: unknown): boolean {
  let cur: unknown = e;
  for (let d = 0; d < 5 && cur && typeof cur === "object"; d++) {
    const o = cur as { code?: unknown; cause?: unknown };
    if (o.code === "P2002" || o.code === "23505") return true;
    cur = o.cause;
  }
  return false;
}

// ───────────────────────── รายการตัวต่อของหน่วย ─────────────────────────
export type ChannelConnectionDto = {
  id: string;
  label: string;
  provider: string;
  status: string;
  allUnits: boolean;
  mappedRooms: number;
  mappedRates: number;
  lastAri: { status: string; dateFrom: string; dateTo: string; sentAt: string | null; attempts: number } | null;
  pendingJobs: number;
  inbound7d: number;
  needsRoom: number;
};

/** ตัวต่อ CHANNEL_MANAGER ที่ครอบหน่วยนี้ + สรุปแม็ป/ARI ล่าสุด/การจองเข้า 7 วัน/คิวต้องจัดห้อง — DTO ไม่มีค่าลับ/ฟิลด์ตัวต่อ */
export async function listChannelConnections(actor: unknown, ctx: unknown, input: unknown): Promise<{ ok: true; connections: ChannelConnectionDto[] } | ChannelFail> {
  const g = await channelGate(actor, ctx, input);
  if (isFail(g)) return g;
  const rows = await tenantDb({ tenantId: g.tenantId }).tenantIntegration.findMany({
    where: { kind: CHANNEL_KIND, OR: [{ unitIds: { isEmpty: true } }, { unitIds: { has: g.unitId } }] },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, label: true, provider: true, status: true, unitIds: true },
  });
  if (!rows.length) return { ok: true, connections: [] };
  const ids = rows.map((r) => r.id);
  const db = tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [rm, rp, jobs, pend, inb, need] = await Promise.all([
    db.channelRoomMap.groupBy({ by: ["connectionId"], where: { connectionId: { in: ids }, active: true }, _count: { _all: true } }),
    db.channelRateMap.groupBy({ by: ["connectionId"], where: { connectionId: { in: ids } }, _count: { _all: true } }),
    db.channelAriJob.findMany({ where: { connectionId: { in: ids }, status: { in: ["SENT", "FAILED"] } }, orderBy: { updatedAt: "desc" }, take: 50, select: { connectionId: true, status: true, dateFrom: true, dateTo: true, sentAt: true, attempts: true } }),
    db.channelAriJob.groupBy({ by: ["connectionId"], where: { connectionId: { in: ids }, status: "PENDING" }, _count: { _all: true } }),
    db.channelReservationInbox.groupBy({ by: ["connectionId"], where: { connectionId: { in: ids }, createdAt: { gte: since } }, _count: { _all: true } }),
    db.channelReservationInbox.groupBy({ by: ["connectionId"], where: { connectionId: { in: ids }, status: "NEEDS_ROOM" }, _count: { _all: true } }),
  ]);
  const n = (xs: { connectionId: string; _count: { _all: number } }[], id: string) => xs.find((x) => x.connectionId === id)?._count._all ?? 0;
  return {
    ok: true,
    connections: rows.map((r) => {
      const j = jobs.find((x) => x.connectionId === r.id);
      return {
        id: r.id,
        label: r.label,
        provider: r.provider,
        status: r.status,
        allUnits: r.unitIds.length === 0,
        mappedRooms: n(rm, r.id),
        mappedRates: n(rp, r.id),
        lastAri: j ? { status: j.status, dateFrom: ymdOfDb(j.dateFrom), dateTo: ymdOfDb(j.dateTo), sentAt: j.sentAt?.toISOString() ?? null, attempts: j.attempts } : null,
        pendingJobs: n(pend, r.id),
        inbound7d: n(inb, r.id),
        needsRoom: n(need, r.id),
      };
    }),
  };
}

// ───────────────────────── แม็ปห้อง ─────────────────────────
const extId = z.union([z.string().trim().max(64, { message: "รหัสของช่องทางยาวเกิน 64 ตัวอักษร" }), z.null()]).optional();
const RoomMapInput = z.object({ connectionId: z.string().min(1), roomTypeId: z.string().min(1), externalRoomId: extId });

/** แม็ปประเภทห้อง ↔ รหัสห้องของช่องทาง · ""/null = เลิกขายประเภทนี้ผ่านช่องนี้ (ลบแถว) · รหัสซ้ำในตัวต่อเดียวกัน ⇒ CONFLICT */
export async function saveRoomMap(actor: unknown, ctx: unknown, input: unknown): Promise<{ ok: true; mapped: boolean } | ChannelFail> {
  const g = await channelGate(actor, ctx, input);
  if (isFail(g)) return g;
  const p = RoomMapInput.safeParse(input);
  if (!p.success) return fail("VALIDATION", zodReason(p.error));
  const conn = await connectionOf(g.tenantId, p.data.connectionId, g.unitId);
  if (!conn) return fail("NOT_FOUND", R.notFound);
  const db = tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
  const type = await db.hotelRoomType.findFirst({ where: { id: p.data.roomTypeId }, select: { id: true } });
  if (!type) return fail("NOT_FOUND", "ไม่พบประเภทห้องนี้ในโรงแรมนี้");
  const ext = (p.data.externalRoomId ?? "").trim();
  const range = fullRange();
  try {
    return await db.$transaction(async (t) => {
      const tx = t as unknown as Tx;
      const cur = await tx.channelRoomMap.findFirst({ where: { tenantId: g.tenantId, unitId: g.unitId, connectionId: conn.id, roomTypeId: type.id } });
      if (!ext) {
        if (cur) {
          await tx.channelRoomMap.deleteMany({ where: { id: cur.id, tenantId: g.tenantId, unitId: g.unitId } });
          await auditTx(tx, g, "hotel.channel.roomMap.remove", conn.id, { roomTypeId: type.id, externalRoomId: cur.externalRoomId }, null);
          await emitDirtyTx(tx, g.tenantId, g.unitId, [type.id], range.from, range.to);
        }
        return { ok: true as const, mapped: false };
      }
      const clash = await tx.channelRoomMap.findFirst({ where: { connectionId: conn.id, externalRoomId: ext, NOT: { roomTypeId: type.id } }, select: { id: true } });
      if (clash) return fail("CONFLICT", `รหัสห้อง ${ext} ของช่องทางนี้แม็ปกับประเภทอื่นอยู่แล้ว — ใช้รหัสอื่นหรือเลิกแม็ปประเภทนั้นก่อน`);
      if (cur && cur.externalRoomId === ext && cur.active) return { ok: true as const, mapped: true };
      if (cur) await tx.channelRoomMap.update({ where: { id: cur.id }, data: { externalRoomId: ext, active: true } });
      else await tx.channelRoomMap.create({ data: { tenantId: g.tenantId, unitId: g.unitId, connectionId: conn.id, roomTypeId: type.id, externalRoomId: ext, active: true } });
      await auditTx(tx, g, "hotel.channel.roomMap.save", conn.id, cur ? { roomTypeId: type.id, externalRoomId: cur.externalRoomId } : null, { roomTypeId: type.id, externalRoomId: ext });
      await emitDirtyTx(tx, g.tenantId, g.unitId, [type.id], range.from, range.to);
      return { ok: true as const, mapped: true };
    });
  } catch (e) {
    if (isUnique(e)) return fail("CONFLICT", "รหัสห้องนี้ของช่องทางถูกใช้แล้ว — ลองอีกครั้ง");
    throw e;
  }
}

// ───────────────────────── แม็ปแผนราคา ─────────────────────────
const RateMapInput = z.object({
  connectionId: z.string().min(1),
  ratePlanId: z.string().min(1),
  externalRateId: extId,
  markupBp: z.union([z.number().int().min(-10_000, { message: "ส่วนลดเกิน 100%" }).max(100_000, { message: "เพิ่มราคาได้ไม่เกิน 1,000%" }), z.null()]).optional(),
});

/** แม็ปแผนราคา ↔ รหัสแผนของช่องทาง + สูตร markup (bp) · markupBp null = ใช้ค่าตั้ง rooms.hotel.ota.markupBp · ""/null = เลิกแม็ป */
export async function saveRateMap(actor: unknown, ctx: unknown, input: unknown): Promise<{ ok: true; mapped: boolean } | ChannelFail> {
  const g = await channelGate(actor, ctx, input);
  if (isFail(g)) return g;
  const p = RateMapInput.safeParse(input);
  if (!p.success) return fail("VALIDATION", zodReason(p.error));
  const conn = await connectionOf(g.tenantId, p.data.connectionId, g.unitId);
  if (!conn) return fail("NOT_FOUND", R.notFound);
  const db = tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
  const plan = await db.hotelRatePlan.findFirst({ where: { id: p.data.ratePlanId }, select: { id: true } });
  if (!plan) return fail("NOT_FOUND", "ไม่พบแผนราคานี้ในโรงแรมนี้");
  const ext = (p.data.externalRateId ?? "").trim();
  const bp = p.data.markupBp ?? null;
  const range = fullRange();
  return db.$transaction(async (t) => {
    const tx = t as unknown as Tx;
    const cur = await tx.channelRateMap.findFirst({ where: { tenantId: g.tenantId, unitId: g.unitId, connectionId: conn.id, ratePlanId: plan.id } });
    if (!ext) {
      if (cur) {
        await tx.channelRateMap.deleteMany({ where: { id: cur.id, tenantId: g.tenantId, unitId: g.unitId } });
        await auditTx(tx, g, "hotel.channel.rateMap.remove", conn.id, { ratePlanId: plan.id, externalRateId: cur.externalRateId }, null);
        await emitDirtyTx(tx, g.tenantId, g.unitId, [], range.from, range.to);
      }
      return { ok: true as const, mapped: false };
    }
    const clash = await tx.channelRateMap.findFirst({ where: { connectionId: conn.id, externalRateId: ext, NOT: { ratePlanId: plan.id } }, select: { id: true } });
    if (clash) return fail("CONFLICT", `รหัสแผน ${ext} ของช่องทางนี้แม็ปกับแผนอื่นอยู่แล้ว`);
    const curBp = cur && isRec(cur.formula) && typeof cur.formula.markupBp === "number" ? cur.formula.markupBp : null;
    if (cur && cur.externalRateId === ext && curBp === bp) return { ok: true as const, mapped: true };
    const formula = bp === null ? Prisma.DbNull : ({ markupBp: bp } as Prisma.InputJsonValue);
    if (cur) await tx.channelRateMap.update({ where: { id: cur.id }, data: { externalRateId: ext, formula } });
    else await tx.channelRateMap.create({ data: { tenantId: g.tenantId, unitId: g.unitId, connectionId: conn.id, ratePlanId: plan.id, externalRateId: ext, formula } });
    await auditTx(tx, g, "hotel.channel.rateMap.save", conn.id, cur ? { ratePlanId: plan.id, externalRateId: cur.externalRateId, formula: cur.formula } : null, { ratePlanId: plan.id, externalRateId: ext, markupBp: bp });
    await emitDirtyTx(tx, g.tenantId, g.unitId, [], range.from, range.to);
    return { ok: true as const, mapped: true };
  });
}

// ───────────────────────── buffer ─────────────────────────
const BufferInput = z.object({
  connectionId: z.string().min(1),
  roomTypeId: z.string().min(1),
  rooms: z.number({ message: "ใส่จำนวนห้องที่กันไว้" }).int({ message: "จำนวนห้องต้องเป็นจำนวนเต็ม" }).min(0, { message: "จำนวนห้องที่กันไว้ต้องไม่ติดลบ" }).max(1000, { message: "กันห้องได้ไม่เกิน 1,000 ห้อง" }),
});

/** กันห้องไม่ส่งช่องทาง (ต่อประเภท · ต่อตัวต่อ) — ARI available ลบ buffer · ไม่กระทบห้องว่างจริง · ชนะค่าตั้ง rooms.hotel.ota.buffer */
export async function saveBuffer(actor: unknown, ctx: unknown, input: unknown): Promise<{ ok: true; rooms: number } | ChannelFail> {
  const g = await channelGate(actor, ctx, input);
  if (isFail(g)) return g;
  const p = BufferInput.safeParse(input);
  if (!p.success) return fail("VALIDATION", zodReason(p.error));
  const conn = await connectionOf(g.tenantId, p.data.connectionId, g.unitId);
  if (!conn) return fail("NOT_FOUND", R.notFound);
  const db = tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
  const type = await db.hotelRoomType.findFirst({ where: { id: p.data.roomTypeId }, select: { id: true } });
  if (!type) return fail("NOT_FOUND", "ไม่พบประเภทห้องนี้ในโรงแรมนี้");
  const rooms = p.data.rooms;
  const range = fullRange();
  try {
    return await db.$transaction(async (t) => {
      const tx = t as unknown as Tx;
      const cur = await tx.channelInventoryBuffer.findFirst({ where: { tenantId: g.tenantId, unitId: g.unitId, connectionId: conn.id, roomTypeId: type.id } });
      if (cur && cur.rooms === rooms) return { ok: true as const, rooms };
      if (cur) await tx.channelInventoryBuffer.update({ where: { id: cur.id }, data: { rooms } });
      else await tx.channelInventoryBuffer.create({ data: { tenantId: g.tenantId, unitId: g.unitId, connectionId: conn.id, roomTypeId: type.id, rooms } });
      await auditTx(tx, g, "hotel.channel.buffer.save", conn.id, cur ? { roomTypeId: type.id, rooms: cur.rooms } : null, { roomTypeId: type.id, rooms });
      await emitDirtyTx(tx, g.tenantId, g.unitId, [type.id], range.from, range.to);
      return { ok: true as const, rooms };
    });
  } catch (e) {
    if (isUnique(e)) return fail("CONFLICT", R.busy);
    throw e;
  }
}

// ───────────────────────── แม็ปของตัวต่อ (ภายใน) ─────────────────────────
type MapRow = { k: "R" | "P" | "B"; unitId: string; a: string; b: string; f: unknown; active: boolean; n: number };

/** แม็ปทั้งหมดของตัวต่อ (คิวรีเดียว · ทุกหน่วยที่ตัวต่อครอบ) — ห้องที่ active เท่านั้น */
export async function loadMappings(conn: ConnectionRow): Promise<Map<string, ChannelMapping>> {
  const rows = await scanDb().$queryRaw<MapRow[]>`
    SELECT 'R' AS "k", "unitId", "roomTypeId" AS "a", "externalRoomId" AS "b", NULL::jsonb AS "f", "active", 0 AS "n" FROM "ChannelRoomMap" WHERE "connectionId" = ${conn.id} AND "tenantId" = ${conn.tenantId}
    UNION ALL
    SELECT 'P', "unitId", "ratePlanId", "externalRateId", "formula", true, 0 FROM "ChannelRateMap" WHERE "connectionId" = ${conn.id} AND "tenantId" = ${conn.tenantId}
    UNION ALL
    SELECT 'B', "unitId", "roomTypeId", '', NULL::jsonb, true, "rooms" FROM "ChannelInventoryBuffer" WHERE "connectionId" = ${conn.id} AND "tenantId" = ${conn.tenantId}`;
  const out = new Map<string, ChannelMapping>();
  const of = (unitId: string): ChannelMapping => {
    let m = out.get(unitId);
    if (!m) {
      m = { connectionId: conn.id, unitId, rooms: [], rates: [], buffers: [] };
      out.set(unitId, m);
    }
    return m;
  };
  for (const r of rows) {
    if (!covers(conn.unitIds, r.unitId)) continue;
    if (r.k === "R" && r.active) of(r.unitId).rooms.push({ roomTypeId: r.a, externalRoomId: r.b });
    else if (r.k === "P") {
      const bp = isRec(r.f) && typeof r.f.markupBp === "number" && Number.isInteger(r.f.markupBp) ? r.f.markupBp : null;
      of(r.unitId).rates.push({ ratePlanId: r.a, externalRateId: r.b, markupBp: bp });
    } else if (r.k === "B") of(r.unitId).buffers.push({ roomTypeId: r.a, rooms: Number(r.n) || 0 });
  }
  for (const m of out.values()) {
    m.rooms.sort((x, y) => x.externalRoomId.localeCompare(y.externalRoomId));
    m.rates.sort((x, y) => x.externalRateId.localeCompare(y.externalRateId));
  }
  return out;
}

/**
 * แม็ปของตัวต่อ (ตัวภายใน · ไม่มี actor) — หน่วยเดียว (ระบุ unitId หรือหน่วยแรกที่มีแม็ป) · ไม่พบ ⇒ { ok:false, NOT_FOUND }
 */
export async function channelMappingFor(connectionId: unknown, unitId?: string): Promise<ChannelMapping | ChannelFail> {
  const conn = await connectionById(connectionId);
  if (!conn) return fail("NOT_FOUND", R.notFound);
  const maps = await loadMappings(conn);
  const m = unitId ? maps.get(unitId) : [...maps.values()][0];
  return m ?? { connectionId: conn.id, unitId: unitId ?? conn.unitIds[0] ?? "", rooms: [], rates: [], buffers: [] };
}

/** id ของ dirty ทั้งช่วงสำหรับหน่วย (ใช้ตอนแม็ปเปลี่ยน) */
export const dirtyFullRange = fullRange;

// ───────────────────────── หน้าตั้งค่าตัวต่อ (มีผู้ใช้) ─────────────────────────
export type ChannelDetailDto = {
  connection: { id: string; label: string; provider: string; status: string };
  roomTypes: { id: string; name: string; externalRoomId: string | null; bufferRooms: number | null }[];
  ratePlans: { id: string; code: string; name: string; externalRateId: string | null; markupBp: number | null; otaVisible: boolean }[];
  jobs: { id: string; status: string; dateFrom: string; dateTo: string; attempts: number; sentAt: string | null; lastError: string | null; createdAt: string }[];
};

/** แม็ปห้อง/แผน/buffer ของตัวต่อในหน่วยนี้ + ประวัติงาน ARI 20 รายการล่าสุด — ประเภทห้อง active ทุกตัว (ว่าง = ไม่ขายผ่านช่องนี้) */
export async function channelDetail(actor: unknown, ctx: unknown, input: unknown): Promise<{ ok: true; detail: ChannelDetailDto } | ChannelFail> {
  const g = await channelGate(actor, ctx, input);
  if (isFail(g)) return g;
  const conn = await connectionOf(g.tenantId, isRec(input) ? input.connectionId : null, g.unitId);
  if (!conn) return fail("NOT_FOUND", R.notFound);
  const db = tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
  const [types, plans, rm, rp, buf, jobs] = await Promise.all([
    db.hotelRoomType.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    db.hotelRatePlan.findMany({ where: { status: "ACTIVE" }, orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, code: true, name: true, visibility: true } }),
    db.channelRoomMap.findMany({ where: { connectionId: conn.id, active: true }, select: { roomTypeId: true, externalRoomId: true } }),
    db.channelRateMap.findMany({ where: { connectionId: conn.id }, select: { ratePlanId: true, externalRateId: true, formula: true } }),
    db.channelInventoryBuffer.findMany({ where: { connectionId: conn.id }, select: { roomTypeId: true, rooms: true } }),
    db.channelAriJob.findMany({ where: { connectionId: conn.id }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, status: true, dateFrom: true, dateTo: true, attempts: true, sentAt: true, lastError: true, createdAt: true } }),
  ]);
  const markupOf = (f: unknown): number | null => (isRec(f) && typeof f.markupBp === "number" && Number.isInteger(f.markupBp) ? f.markupBp : null);
  return {
    ok: true,
    detail: {
      connection: { id: conn.id, label: conn.label, provider: conn.provider, status: conn.status },
      roomTypes: types.map((t) => ({ id: t.id, name: t.name, externalRoomId: rm.find((m) => m.roomTypeId === t.id)?.externalRoomId ?? null, bufferRooms: buf.find((b) => b.roomTypeId === t.id)?.rooms ?? null })),
      ratePlans: plans.map((p) => {
        const m = rp.find((x) => x.ratePlanId === p.id);
        return { id: p.id, code: p.code, name: p.name, externalRateId: m?.externalRateId ?? null, markupBp: m ? markupOf(m.formula) : null, otaVisible: Array.isArray(p.visibility) && p.visibility.includes("OTA") };
      }),
      jobs: jobs.map((j) => ({ id: j.id, status: j.status, dateFrom: ymdOfDb(j.dateFrom), dateTo: ymdOfDb(j.dateTo), attempts: j.attempts, sentAt: j.sentAt?.toISOString() ?? null, lastError: j.lastError, createdAt: j.createdAt.toISOString() })),
    },
  };
}

// SVC H.2 ▸ ปิดห้อง (BLOCK) — blockRoom · releaseBlock · listBlocks (ใบสั่ง ledger/svc-briefs/svc-brief-h.2.md §0 · §2 มติ 3 · §3.2 · §7 ข้อ 8–9)
//   • BLOCK = RoomOccupancy kind BLOCK ผ่าน facade rooms (claimRoom · EXCLUDE ของฐานกันทับการจอง/สัญญา/BLOCK อื่น) · refType "HotelRoomBlock" · refId = blockId (cuid ของใบนี้)
//   • ไม่เพิ่มคอลัมน์ (มติ §0): เหตุผลลง AuditLog (action hotel.room.blocked · targetId = blockId · แหล่งของ listBlocks/แถบ) + HotelHousekeepingLog เมื่อห้องเป็น OUT_OF_ORDER
//   • BLOCK ครอบวันนี้ ⇒ hkStatus OUT_OF_ORDER (setHkStatus ของแกนห้อง + affectedByOutOfOrder เป็นคำเตือน) · ปล่อย ⇒ DIRTY (แม่บ้านตรวจก่อนขาย)
//   • ชนการจองที่ถือห้องแล้ว ⇒ ROOM_TAKEN + รายชื่อการจอง (S:1118 ไม่ทับ) · ปิดจนประเภทขาด ⇒ ok พร้อม warning "เกินจอง N คืน" (ไม่ยกเลิกอัตโนมัติ)
//   • ด่าน: หน่วย HOTEL ของร้าน → เข้าหน่วยได้ (ไม่ได้ ⇒ NOT_FOUND) → สิทธิ์ (ปิด/ปล่อย = hotel.booking.manage · ดูรายการ = reservation.create | booking.manage | housekeeping) ⇒ FORBIDDEN
//   • ล็อกชั้นประเภทห้อง pg_advisory_xact_lock(unitId:roomTypeId) เป็นคำสั่งแรกของ tx (ลำดับเดียวกับ booking.ts ของ H.3) ⇒ คำเตือนเกินจองนับบนภาพที่นิ่ง
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { canAccessUnit, evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { bkkYmd } from "@/lib/core/quiet-hours";
import { affectedByOutOfOrder, claimRoom, releaseOccupancy, setHkStatus } from "@/lib/modules/rooms";
import { availabilityInTx } from "./availability";
import { isYmd, nightDates } from "./pricing";

export type BlockActor = MembershipCtx & { userId: string };
export type BlockFailCode = "ROOM_TAKEN" | "INVALID_RANGE" | "INVALID_INPUT" | "NOT_FOUND" | "FORBIDDEN" | "BUSY";
export type BlockFail = { ok: false; code: BlockFailCode; reason: string; conflicts?: { code: string; guestName: string }[] };
export type BlockOk = { ok: true; blockId: string; hkStatus: string | null; warning?: { overbookedNights: number; message: string }; affected?: number };
export type BlockRow = { blockId: string; roomId: string; roomNumber: string; from: string; to: string; reason: string; active: boolean };

export const BLOCK_REF = "HotelRoomBlock";
const ACT_BLOCK = "hotel.room.blocked";
const ACT_RELEASE = "hotel.room.unblocked";
const TX_OPTS = { maxWait: 20_000, timeout: 30_000 } as const;
const MAX_BLOCK_DAYS = 366;
const VIEW_KEYS = ["hotel.reservation.create", "hotel.booking.manage", "hotel.housekeeping"];
const R = {
  notFound: "ไม่พบห้องหรือโรงแรมนี้ (หรืออยู่นอกสาขาที่คุณดูแล)",
  forbidden: "คุณยังไม่มีสิทธิ์ปิดห้อง — ขอสิทธิ์จัดการการจองจากเจ้าของร้าน",
  range: "ช่วงวันปิดห้องไม่ถูกต้อง (วันจบต้องอยู่หลังวันเริ่ม และไม่เกิน 1 ปี)",
  reason: "ใส่เหตุผลที่ปิดห้อง",
  taken: "ห้องนี้มีการจอง/สัญญาอยู่ในช่วงที่จะปิด — ย้ายการจองออกก่อนแล้วค่อยปิดห้อง",
  busy: "ระบบไม่ว่าง ลองใหม่อีกครั้ง",
};

type Tx = Prisma.TransactionClient;
type Gate = { tenantId: string; unitId: string; actor: BlockActor };
const fail = (code: BlockFailCode, reason: string, extra: Partial<BlockFail> = {}): BlockFail => ({ ok: false, code, reason, ...extra });
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isFail = (v: unknown): v is BlockFail => isRec(v) && v.ok === false;
const ymdOf = (d: Date): string => d.toISOString().slice(0, 10);
const dbDate = (ymd: string): Date => new Date(`${ymd}T00:00:00.000Z`);

class Abort extends Error {
  constructor(readonly result: BlockFail) {
    super(result.code);
  }
}
function isTxBusy(e: unknown): boolean {
  let cur: unknown = e;
  for (let d = 0; d < 6 && cur && typeof cur === "object"; d++) {
    const o = cur as { code?: unknown; message?: unknown; cause?: unknown };
    if (o.code === "P2028" || o.code === "P2034" || o.code === "40P01") return true;
    if (typeof o.message === "string" && /deadlock detected|40P01/i.test(o.message)) return true;
    cur = o.cause;
  }
  return false;
}

function actorOf(a: unknown): BlockActor | null {
  if (!isRec(a) || !isStr(a.role) || !isStr(a.userId)) return null;
  return {
    role: a.role as MembershipCtx["role"],
    unitAccess: Array.isArray(a.unitAccess) ? a.unitAccess.filter(isStr) : [],
    permissions: isRec(a.permissions) ? a.permissions : {},
    userId: a.userId,
  };
}

/** ด่าน: โรงแรมของร้าน → เข้าหน่วยได้ → สิทธิ์ (ข้อใดข้อหนึ่งใน need) */
async function gate(actorIn: unknown, ctx: unknown, input: unknown, need: string[]): Promise<Gate | BlockFail> {
  const tenantId = isRec(ctx) ? ctx.tenantId : null;
  const unitId = isRec(input) ? input.unitId : null;
  const actor = actorOf(actorIn);
  if (!isStr(tenantId) || !isStr(unitId) || !actor) return fail("NOT_FOUND", R.notFound);
  const unit = await tenantDb({ tenantId }).businessUnit.findFirst({ where: { id: unitId, type: "HOTEL" }, select: { id: true } });
  if (!unit || !canAccessUnit(actor, unit.id)) return fail("NOT_FOUND", R.notFound);
  if (!need.some((action) => evaluate(actor, { module: "hotel", action, unitId: unit.id }))) return fail("FORBIDDEN", R.forbidden);
  return { tenantId, unitId: unit.id, actor };
}

async function inTx<T>(g: Gate, fn: (tx: Tx) => Promise<T>): Promise<T | BlockFail> {
  try {
    return await tenantDb({ tenantId: g.tenantId, unitId: g.unitId }).$transaction((t) => fn(t as unknown as Tx), TX_OPTS);
  } catch (e) {
    if (e instanceof Abort) return e.result;
    if (isTxBusy(e)) return fail("BUSY", R.busy);
    throw e;
  }
}
async function lockType(tx: Tx, unitId: string, roomTypeId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${unitId}::text || ':' || ${roomTypeId}::text))`;
}

const BlockInput = z.object({
  roomId: z.string().min(1, { message: "เลือกห้อง" }),
  from: z.string(),
  to: z.string(),
  reason: z.string().trim().min(1, { message: R.reason }).max(200, { message: "เหตุผลยาวเกิน 200 ตัวอักษร" }),
});

/** การจองที่ถือห้องนี้ในช่วง (สำหรับรายชื่อชน · ไม่มีเบอร์โทร) */
async function conflictsOn(tx: Tx, g: Gate, roomId: string, from: string, to: string): Promise<{ code: string; guestName: string }[]> {
  const occ = await tx.roomOccupancy.findMany({
    where: { tenantId: g.tenantId, unitId: g.unitId, roomId, active: true, refType: "HotelReservation", startDate: { lt: dbDate(to) }, endDate: { gt: dbDate(from) } },
    select: { refId: true },
  });
  if (!occ.length) return [];
  const rvs = await tx.hotelReservation.findMany({ where: { tenantId: g.tenantId, unitId: g.unitId, id: { in: occ.map((o) => o.refId) } }, select: { code: true, guestName: true }, orderBy: { checkInDate: "asc" } });
  return rvs.map((r) => ({ code: r.code, guestName: r.guestName }));
}

/** ปิดห้อง [from, to) ด้วยเหตุผล — ok พร้อม blockId (+ warning เกินจอง) · ชน ⇒ ROOM_TAKEN + conflicts */
export async function blockRoom(actorIn: unknown, ctx: unknown, input: unknown): Promise<BlockOk | BlockFail> {
  const g = await gate(actorIn, ctx, input, ["hotel.booking.manage"]);
  if (isFail(g)) return g;
  const p = BlockInput.safeParse(input);
  if (!p.success) {
    const field = p.error.issues[0]?.path[0];
    if (field === "from" || field === "to") return fail("INVALID_RANGE", R.range);
    const m = p.error.issues[0]?.message ?? "";
    return fail("INVALID_INPUT", /[฀-๿]/.test(m) ? m : "ข้อมูลไม่ครบหรือไม่ถูกต้อง");
  }
  const { roomId, from, to, reason } = p.data;
  if (!isYmd(from) || !isYmd(to) || !(to > from) || nightDates(from, to).length > MAX_BLOCK_DAYS) return fail("INVALID_RANGE", R.range);
  const today = bkkYmd(new Date());
  if (!(to > today)) return fail("INVALID_RANGE", "ช่วงปิดห้องผ่านไปแล้ว");
  const room = await tenantDb({ tenantId: g.tenantId, unitId: g.unitId }).hotelRoom.findFirst({ where: { id: roomId }, select: { id: true, number: true, roomTypeId: true, hkStatus: true } });
  if (!room) return fail("NOT_FOUND", "ไม่พบห้องนี้ในโรงแรมนี้");
  const blockId = `blk${randomUUID().replace(/-/g, "")}`;
  const coversToday = from <= today && today < to;
  const out = await inTx(g, async (tx) => {
    await lockType(tx, g.unitId, room.roomTypeId);
    const c = await claimRoom(tx, { tenantId: g.tenantId, unitId: g.unitId, roomId: room.id, start: from, end: to, kind: "BLOCK", refType: BLOCK_REF, refId: blockId });
    if (!c.ok) {
      if (c.code === "ROOM_TAKEN") throw new Abort(fail("ROOM_TAKEN", R.taken, { conflicts: await conflictsOn(tx, g, room.id, from, to) }));
      if (c.code === "INVALID_RANGE") throw new Abort(fail("INVALID_RANGE", R.range));
      throw new Abort(fail("NOT_FOUND", "ห้องนี้ปิดใช้งานอยู่หรือไม่อยู่ในโรงแรมนี้"));
    }
    // เกินจอง: คืนที่ ห้องขายได้ − ปิด − รายเดือน − คืนที่นับ < 0 (BLOCK ใหม่นับแล้วใน tx นี้)
    const av = await availabilityInTx(tx, { tenantId: g.tenantId, unitId: g.unitId, roomTypeIds: [room.roomTypeId], from, to });
    let over = 0;
    for (const d of nightDates(from, to)) {
      const cell = av[d]?.[room.roomTypeId];
      if (cell && cell.total - cell.blocked - cell.leased - cell.counted < 0) over++;
    }
    if (coversToday && room.hkStatus !== "OUT_OF_ORDER") {
      await tx.hotelHousekeepingLog.create({ data: { tenantId: g.tenantId, unitId: g.unitId, roomId: room.id, fromStatus: room.hkStatus, toStatus: "OUT_OF_ORDER", byUserId: g.actor.userId, note: `ปิดห้อง: ${reason}` } });
    }
    await tx.auditLog.create({
      data: {
        tenantId: g.tenantId,
        unitId: g.unitId,
        actorType: "USER",
        actorId: g.actor.userId,
        action: ACT_BLOCK,
        targetType: BLOCK_REF,
        targetId: blockId,
        after: { roomId: room.id, roomNumber: room.number, from, to, reason, overbookedNights: over },
      },
    });
    return { over, occupancyId: c.occupancyId };
  });
  if (isFail(out)) return out;
  let hkStatus: string | null = room.hkStatus;
  let affected: number | undefined;
  if (coversToday) {
    const hk = await setHkStatus({ tenantId: g.tenantId }, { unitId: g.unitId, roomId: room.id, hkStatus: "OUT_OF_ORDER" });
    if (hk.ok) hkStatus = "OUT_OF_ORDER";
    // คำเตือน (ไม่บล็อก): สัญญา/การจองที่ยังไม่จบของห้องนี้นอกช่วงปิด — ผู้ใช้ย้ายเอง
    affected = (await affectedByOutOfOrder({ tenantId: g.tenantId }, { unitId: g.unitId, roomId: room.id })).length;
  }
  return {
    ok: true,
    blockId,
    hkStatus,
    ...(out.over > 0 ? { warning: { overbookedNights: out.over, message: `เกินจอง ${out.over} คืน` } } : {}),
    ...(affected ? { affected } : {}),
  };
}

const ReleaseInput = z.object({ blockId: z.string().min(1) });

/** ปล่อยห้องที่ปิดไว้ — ห้อง OUT_OF_ORDER จากการปิดที่ครอบวันนี้ ⇒ DIRTY · ปล่อยซ้ำ ⇒ ok (noop) */
export async function releaseBlock(actorIn: unknown, ctx: unknown, input: unknown): Promise<{ ok: true; noop?: boolean; hkStatus?: string | null } | BlockFail> {
  const g = await gate(actorIn, ctx, input, ["hotel.booking.manage"]);
  if (isFail(g)) return g;
  const p = ReleaseInput.safeParse(input);
  if (!p.success) return fail("INVALID_INPUT", "ไม่ระบุรายการปิดห้อง");
  const db = tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
  const occ = await db.roomOccupancy.findFirst({ where: { kind: "BLOCK", refType: BLOCK_REF, refId: p.data.blockId }, select: { id: true, roomId: true, startDate: true, endDate: true, active: true } });
  if (!occ) return fail("NOT_FOUND", "ไม่พบรายการปิดห้องนี้");
  if (!occ.active) return { ok: true, noop: true };
  const today = bkkYmd(new Date());
  const from = ymdOf(occ.startDate);
  const to = ymdOf(occ.endDate);
  const coversToday = from <= today && today < to;
  const out = await inTx(g, async (tx) => {
    const room = await tx.hotelRoom.findFirst({ where: { tenantId: g.tenantId, unitId: g.unitId, id: occ.roomId }, select: { id: true, number: true, roomTypeId: true, hkStatus: true } });
    if (!room) throw new Abort(fail("NOT_FOUND", "ไม่พบห้องนี้"));
    await lockType(tx, g.unitId, room.roomTypeId);
    const r = await releaseOccupancy(tx, { tenantId: g.tenantId, unitId: g.unitId, occupancyId: occ.id, reason: "ปล่อยห้องที่ปิดไว้" });
    if (!r.ok) throw new Abort(fail("NOT_FOUND", "ไม่พบรายการปิดห้องนี้"));
    if (r.noop) return { noop: true, toDirty: false };
    // ห้องกลับมาขายได้เมื่อไม่มี BLOCK อื่นครอบวันนี้
    const other = coversToday
      ? await tx.roomOccupancy.count({ where: { tenantId: g.tenantId, unitId: g.unitId, roomId: room.id, kind: "BLOCK", active: true, startDate: { lte: dbDate(today) }, endDate: { gt: dbDate(today) } } })
      : 1;
    const toDirty = coversToday && other === 0 && room.hkStatus === "OUT_OF_ORDER";
    if (toDirty) {
      await tx.hotelHousekeepingLog.create({ data: { tenantId: g.tenantId, unitId: g.unitId, roomId: room.id, fromStatus: "OUT_OF_ORDER", toStatus: "DIRTY", byUserId: g.actor.userId, note: "ปล่อยห้องที่ปิดไว้ — รอแม่บ้านตรวจก่อนขาย" } });
    }
    const prev = await tx.auditLog.findFirst({ where: { tenantId: g.tenantId, action: ACT_BLOCK, targetId: p.data.blockId }, orderBy: { createdAt: "desc" }, select: { after: true } });
    const reason = isRec(prev?.after) && typeof prev.after.reason === "string" ? prev.after.reason : null;
    await tx.auditLog.create({
      data: {
        tenantId: g.tenantId,
        unitId: g.unitId,
        actorType: "USER",
        actorId: g.actor.userId,
        action: ACT_RELEASE,
        targetType: BLOCK_REF,
        targetId: p.data.blockId,
        before: { roomId: room.id, roomNumber: room.number, from, to, reason },
        after: { released: true, hkStatus: toDirty ? "DIRTY" : room.hkStatus },
      },
    });
    return { noop: false, toDirty };
  });
  if (isFail(out)) return out;
  if (out.noop) return { ok: true, noop: true };
  if (out.toDirty) {
    const hk = await setHkStatus({ tenantId: g.tenantId }, { unitId: g.unitId, roomId: occ.roomId, hkStatus: "DIRTY" });
    return { ok: true, hkStatus: hk.ok ? "DIRTY" : null };
  }
  return { ok: true };
}

/** รายการปิดห้องที่ยัง active ซ้อนช่วง [from, to) (ไม่ส่ง = ที่ยังไม่จบ) · reason จาก AuditLog ของ blockId */
export async function listBlocks(actorIn: unknown, ctx: unknown, input: unknown): Promise<{ ok: true; blocks: BlockRow[] } | BlockFail> {
  const g = await gate(actorIn, ctx, input, VIEW_KEYS);
  if (isFail(g)) return g;
  const today = bkkYmd(new Date());
  const from = isRec(input) && isYmd(input.from) ? input.from : today;
  const to = isRec(input) && isYmd(input.to) ? input.to : null;
  if (to !== null && !(to > from)) return fail("INVALID_RANGE", R.range);
  const db = tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
  const rows = await db.roomOccupancy.findMany({
    where: { kind: "BLOCK", refType: BLOCK_REF, active: true, endDate: { gt: dbDate(from) }, ...(to ? { startDate: { lt: dbDate(to) } } : {}) },
    orderBy: [{ startDate: "asc" }, { id: "asc" }],
    select: { refId: true, roomId: true, startDate: true, endDate: true, active: true },
  });
  if (!rows.length) return { ok: true, blocks: [] };
  const [audits, rooms] = await Promise.all([
    db.auditLog.findMany({ where: { action: ACT_BLOCK, targetId: { in: rows.map((r) => r.refId) } }, orderBy: { createdAt: "asc" }, select: { targetId: true, after: true } }),
    db.hotelRoom.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.roomId))] } }, select: { id: true, number: true } }),
  ]);
  const reasonOf = new Map<string, string>();
  for (const a of audits) if (a.targetId && isRec(a.after) && typeof a.after.reason === "string") reasonOf.set(a.targetId, a.after.reason);
  const numberOf = new Map(rooms.map((r) => [r.id, r.number]));
  return {
    ok: true,
    blocks: rows.map((r) => ({ blockId: r.refId, roomId: r.roomId, roomNumber: numberOf.get(r.roomId) ?? "", from: ymdOf(r.startDate), to: ymdOf(r.endDate), reason: reasonOf.get(r.refId) ?? "", active: r.active })),
  };
}

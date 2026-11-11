// reservation.ts — POS P2.4 โต๊ะจองแบบย่อของร้านอาหาร (มติ Q2 · R10) — ผู้เขียนตาราง RestaurantReservation ที่เดียว
//   POS เรียกผ่าน facade `restaurant/index.ts` (pos/table.ts ตรวจสิทธิ์ restaurant.session.open + ขอบเขต + ตัวตรวจ input ก่อน)
//   ระบบจอง (Appointment) / คิวหน้าร้าน (QueueTicket) ยังไม่ผูก (PLANNED · แถวแผนใหม่หลัง P2.7)
// 🔴 ทุกคำสั่งกรอง tenantId + unitId · ไม่มี FK (tableId/sessionId = id หลวม — ตรวจตอนเขียน) · ไม่ปล่อย outbox event

import type { Prisma, PrismaClient } from "@prisma/client";
import "./scope";

type Db = Prisma.TransactionClient | PrismaClient;
type Scope = { tenantId: string; unitId: string };

export type PosReservationRow = {
  id: string;
  tableId: string | null;
  name: string;
  phone: string | null;
  partySize: number;
  at: Date;
  holdFromMinutes: number;
  status: "BOOKED" | "SEATED" | "CANCELLED" | "NO_SHOW";
  sessionId: string | null;
};
const SELECT = { id: true, tableId: true, name: true, phone: true, partySize: true, at: true, holdFromMinutes: true, status: true, sessionId: true } as const;

/** จองโต๊ะ (BOOKED) — tableId ต้องเป็นโต๊ะที่ไม่เก็บถาวรของสาขานี้ (ไม่งั้น NO_TABLE · ไม่เขียนอะไร) */
export async function createReservationForPos(
  db: Db,
  s: Scope & { tableId: string | null; name: string; phone: string | null; partySize: number; at: Date; holdFromMinutes: number; createdByUserId: string },
): Promise<{ ok: true; id: string } | { ok: false; code: "NO_TABLE" }> {
  if (s.tableId) {
    const t = await db.restaurantTable.findFirst({ where: { id: s.tableId, tenantId: s.tenantId, unitId: s.unitId, archivedAt: null }, select: { id: true } });
    if (!t) return { ok: false, code: "NO_TABLE" };
  }
  const r = await db.restaurantReservation.create({
    data: {
      tenantId: s.tenantId,
      unitId: s.unitId,
      tableId: s.tableId,
      name: s.name,
      phone: s.phone,
      partySize: s.partySize,
      at: s.at,
      holdFromMinutes: s.holdFromMinutes,
      createdByUserId: s.createdByUserId,
    },
    select: { id: true },
  });
  return { ok: true, id: r.id };
}

/** การจองของสาขานี้ (อื่น/ไม่มีจริง = null) · forUpdate = ล็อกแถวในธุรกรรม (พาลูกค้านั่ง/ยกเลิกพร้อมกัน = ผู้ชนะคนเดียว) */
export async function reservationForPos(db: Db, s: Scope & { reservationId: string; forUpdate?: boolean }): Promise<PosReservationRow | null> {
  if (s.forUpdate) {
    const rows = await (db as Prisma.TransactionClient).$queryRaw<{ id: string }[]>`
      SELECT id FROM "RestaurantReservation" WHERE id = ${s.reservationId} AND "tenantId" = ${s.tenantId} AND "unitId" = ${s.unitId} FOR UPDATE`;
    if (!rows.length) return null;
  }
  const r = await db.restaurantReservation.findFirst({ where: { id: s.reservationId, tenantId: s.tenantId, unitId: s.unitId }, select: SELECT });
  return r ?? null;
}

/** พาลูกค้านั่งแล้ว: BOOKED → SEATED + sessionId (+ โต๊ะที่นั่งจริง) — ไม่ใช่ BOOKED = ไม่แตะ (false) */
export async function markReservationSeatedInTx(tx: Prisma.TransactionClient, s: Scope & { reservationId: string; sessionId: string; tableId: string }): Promise<boolean> {
  const u = await tx.restaurantReservation.updateMany({
    where: { id: s.reservationId, tenantId: s.tenantId, unitId: s.unitId, status: "BOOKED" },
    data: { status: "SEATED", sessionId: s.sessionId, tableId: s.tableId },
  });
  return u.count === 1;
}

/** ยกเลิกการจอง: BOOKED → CANCELLED · ไม่พบ = NOT_FOUND · ไม่ใช่ BOOKED = NOT_BOOKED (ไม่แตะ) */
export async function cancelReservationForPos(db: Db, s: Scope & { reservationId: string }): Promise<{ ok: true } | { ok: false; code: "NOT_FOUND" | "NOT_BOOKED" }> {
  const r = await db.restaurantReservation.findFirst({ where: { id: s.reservationId, tenantId: s.tenantId, unitId: s.unitId }, select: { id: true, status: true } });
  if (!r) return { ok: false, code: "NOT_FOUND" };
  if (r.status === "CANCELLED") return { ok: true }; // เล่นซ้ำ = ผลเดิม
  const u = await db.restaurantReservation.updateMany({ where: { id: r.id, tenantId: s.tenantId, unitId: s.unitId, status: "BOOKED" }, data: { status: "CANCELLED" } });
  return u.count === 1 ? { ok: true } : { ok: false, code: "NOT_BOOKED" };
}

/** การจอง BOOKED ที่ "อาจ" กันโต๊ะนี้ ณ now (at ∈ [now − lateMin, now + maxHoldMin]) — ผู้เรียกตัดสินด้วย reservationHolds */
export async function bookedReservationsOfTable(db: Db, s: Scope & { tableId: string; now: Date; lateMinutes: number; maxHoldMinutes: number }): Promise<PosReservationRow[]> {
  return db.restaurantReservation.findMany({
    where: {
      tenantId: s.tenantId,
      unitId: s.unitId,
      tableId: s.tableId,
      status: "BOOKED",
      at: { gte: new Date(s.now.getTime() - s.lateMinutes * 60_000), lte: new Date(s.now.getTime() + s.maxHoldMinutes * 60_000) },
    },
    orderBy: [{ at: "asc" }, { id: "asc" }],
    select: SELECT,
  });
}

// pos-tables.ts — POS P2.4 โหมดโต๊ะ: ฟังก์ชันของโมดูลร้านอาหารที่ POS เรียกผ่าน facade `restaurant/index.ts` (มติ CD1 · ตารางชื่อแถว 12/13)
//
// 🔴 โมดูลร้านอาหารเป็นผู้เขียนตาราง Restaurant*/TableSession ที่เดียว — POS (modules/pos/**) เรียกผ่าน `import("@/lib/modules/restaurant")` เท่านั้น
// 🔴 ทุกฟังก์ชันรับ client (prisma หรือ tx ของผู้เรียก) + tenantId/unitId ชัด ⇒ ทุกคำสั่งกรองร้าน+สาขา (โต๊ะ/session/รายการของสาขาอื่น = ไม่พบ)
// 🔴 ชื่อ *InTx = ต้องเรียกในธุรกรรมของผู้เรียก (ยึดรายการ + ขาย + ปิดโต๊ะ = ธุรกรรมเดียว · R7) · ไม่มี createSale · ไม่ปล่อย outbox event
// สัญญา: ledger/pos-briefs/pos-brief-P2.4.md §2 R2 R3 R7 R8 R9 · ledger/wo-notes/pos-P2.4-oracle.md CONTROLLER-DECISION 2/4/8/9

import { Prisma, type PrismaClient } from "@prisma/client";
// POS P2.4 ▸ fix 2 F4c: คืนสต็อกเมนูตอนยกเลิกรายการ = ตัวเขียนเดียวกับ cancelOrderItem เดิม (catalog-legacy · F15.1) ◂
import { restoreMenuStock } from "@/lib/modules/pos/catalog-legacy";
import "./scope";

type Db = Prisma.TransactionClient | PrismaClient;
type Scope = { tenantId: string; unitId: string };

// ═══════════ อ่าน: ผัง ═══════════

export type PosFloorSession = {
  id: string;
  tableId: string;
  guestCount: number | null;
  memberId: string | null;
  openedByUserId: string | null;
  openedAt: Date;
  unpaidSatang: number;
  readyCount: number;
  flags: { callStaff: boolean; billRequested: boolean; payNotified: boolean };
};
export type PosFloorData = {
  zones: { id: string; name: string; sortOrder: number }[];
  tables: { id: string; name: string; zoneId: string; seats: number; status: "ACTIVE" | "INACTIVE"; dirtySince: Date | null }[];
  sessions: PosFloorSession[];
  /** การจอง BOOKED ที่ "อาจ" กันโต๊ะ ณ now (at ∈ [now − lateMin, now + maxHoldMin]) — ผู้เรียกตัดสินด้วย reservationHolds */
  reservations: { id: string; tableId: string | null; name: string; phone: string | null; partySize: number; at: Date; holdFromMinutes: number }[];
  /** การจอง BOOKED/SEATED ที่เวลาจองอยู่ใน [dayStart, dayEnd) */
  reservationsToday: number;
  /** ค่าบริการของร้านอาหาร (RestaurantSetting · เช็คบิลเดิมใช้ · ไม่มีแถว = 0) — จอเตือนเมื่อไม่ตรงกับค่าตั้งหน้าขาย (มติ Q3) */
  restaurantServiceChargeBps: number;
};

/** ผังของสาขา (R2): โซน · โต๊ะที่ไม่เก็บถาวร · session OPEN (ยอดค้างจ่าย · พร้อมเสิร์ฟ · ธงคำขอ) · การจองที่อาจกันโต๊ะ */
export async function tableFloorForPos(
  db: Db,
  s: Scope & { now: Date; lateMinutes: number; maxHoldMinutes: number; dayStart: Date; dayEnd: Date },
): Promise<PosFloorData> {
  const { tenantId, unitId } = s;
  const [zones, tables, sessions, reqs, reservations, reservationsToday, setting] = await Promise.all([
    db.restaurantZone.findMany({ where: { tenantId, unitId, archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }], select: { id: true, name: true, sortOrder: true } }),
    db.restaurantTable.findMany({
      where: { tenantId, unitId, archivedAt: null },
      orderBy: [{ zoneId: "asc" }, { name: "asc" }, { id: "asc" }],
      select: { id: true, name: true, zoneId: true, seats: true, status: true, dirtySince: true },
    }),
    db.tableSession.findMany({
      where: { tenantId, unitId, status: "OPEN", table: { archivedAt: null } },
      orderBy: [{ openedAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        tableId: true,
        guestCount: true,
        memberId: true,
        openedByUserId: true,
        openedAt: true,
        orders: { select: { items: { where: { kdsStatus: { not: "CANCELLED" } }, select: { lineTotal: true, saleId: true, kdsStatus: true } } } },
      },
    }),
    db.restaurantServiceRequest.findMany({ where: { tenantId, unitId, status: { in: ["PENDING", "ACKED"] } }, select: { sessionId: true, type: true } }),
    db.restaurantReservation.findMany({
      where: { tenantId, unitId, status: "BOOKED", at: { gte: new Date(s.now.getTime() - s.lateMinutes * 60_000), lte: new Date(s.now.getTime() + s.maxHoldMinutes * 60_000) } },
      orderBy: [{ at: "asc" }, { id: "asc" }],
      select: { id: true, tableId: true, name: true, phone: true, partySize: true, at: true, holdFromMinutes: true },
    }),
    db.restaurantReservation.count({ where: { tenantId, unitId, status: { in: ["BOOKED", "SEATED"] }, at: { gte: s.dayStart, lt: s.dayEnd } } }),
    db.restaurantSetting.findFirst({ where: { tenantId, unitId }, select: { serviceChargeBps: true } }),
  ]);
  const flagsOf = new Map<string, PosFloorSession["flags"]>();
  for (const r of reqs) {
    // ลำดับคีย์ตายตัว (callStaff · billRequested · payNotified) — จอ/ข้อสอบเทียบทั้งก้อน
    const f = flagsOf.get(r.sessionId) ?? { callStaff: false, billRequested: false, payNotified: false };
    if (r.type === "CALL_STAFF") f.callStaff = true;
    if (r.type === "REQUEST_BILL") f.billRequested = true;
    if (r.type === "PAY_PROMPTPAY") f.payNotified = true;
    flagsOf.set(r.sessionId, f);
  }
  return {
    zones,
    tables,
    sessions: sessions.map((x) => {
      const items = x.orders.flatMap((o) => o.items);
      return {
        id: x.id,
        tableId: x.tableId,
        guestCount: x.guestCount,
        memberId: x.memberId,
        openedByUserId: x.openedByUserId,
        openedAt: x.openedAt,
        unpaidSatang: items.filter((i) => !i.saleId).reduce((t, i) => t + i.lineTotal, 0),
        readyCount: items.filter((i) => i.kdsStatus === "READY").length,
        flags: flagsOf.get(x.id) ?? { callStaff: false, billRequested: false, payNotified: false },
      };
    }),
    reservations,
    reservationsToday,
    restaurantServiceChargeBps: setting?.serviceChargeBps ?? 0,
  };
}

// ═══════════ อ่าน: session / รายการของบิล ═══════════

export type PosTableSession = {
  id: string;
  status: "OPEN" | "CLOSED" | "MERGED" | "CANCELLED";
  tableId: string;
  tableName: string;
  guestCount: number | null;
  memberId: string | null;
  openedByUserId: string | null;
  openedAt: Date;
};
/** session ของสาขานี้ (อื่น/ไม่มีจริง = null) */
export async function tableSessionForPos(db: Db, s: Scope & { sessionId: string }): Promise<PosTableSession | null> {
  const r = await db.tableSession.findFirst({
    where: { id: s.sessionId, tenantId: s.tenantId, unitId: s.unitId },
    select: { id: true, status: true, tableId: true, guestCount: true, memberId: true, openedByUserId: true, openedAt: true, table: { select: { name: true } } },
  });
  return r ? { id: r.id, status: r.status, tableId: r.tableId, tableName: r.table.name, guestCount: r.guestCount, memberId: r.memberId, openedByUserId: r.openedByUserId, openedAt: r.openedAt } : null;
}

export type PosTableBillItem = {
  id: string;
  /** item.productId ?? MenuItem.posProductId ?? null (R6) */
  productId: string | null;
  menuItemId: string | null;
  name: string;
  qty: number;
  unitPrice: number;
  optionsTotal: number;
  lineTotal: number;
  /** สำเนาตัวเลือก · groupId = กลุ่มปัจจุบันของตัวเลือก (ตัวเลือกถูกลบ = null) */
  options: { choiceId: string | null; groupId: string | null; groupName: string; choiceName: string; priceDelta: number }[];
};
/** รายการที่ยังไม่จ่ายและไม่ถูกยกเลิกของ session (เรียง createdAt, id · R6) — ราคา = สำเนาตอนส่งรอบ (ไม่คิดใหม่ · CD3) */
export async function tableUnpaidItemsForPos(db: Db, s: Scope & { sessionId: string }): Promise<PosTableBillItem[]> {
  const rows = await db.restaurantOrderItem.findMany({
    where: { tenantId: s.tenantId, unitId: s.unitId, order: { sessionId: s.sessionId }, saleId: null, kdsStatus: { not: "CANCELLED" } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      productId: true,
      menuItemId: true,
      nameSnapshot: true,
      qty: true,
      unitPrice: true,
      optionsTotal: true,
      lineTotal: true,
      menuItem: { select: { posProductId: true } },
      options: { orderBy: { id: "asc" }, select: { choiceId: true, groupSnapshot: true, choiceSnapshot: true, priceDelta: true } },
    },
  });
  const choiceIds = [...new Set(rows.flatMap((r) => r.options.map((o) => o.choiceId)).filter((x): x is string => !!x))];
  const groupOf = new Map(
    choiceIds.length ? (await db.menuOptionChoice.findMany({ where: { tenantId: s.tenantId, id: { in: choiceIds } }, select: { id: true, groupId: true } })).map((c) => [c.id, c.groupId]) : [],
  );
  return rows.map((r) => ({
    id: r.id,
    productId: r.productId ?? r.menuItem?.posProductId ?? null,
    menuItemId: r.menuItemId,
    name: r.nameSnapshot,
    qty: r.qty,
    unitPrice: r.unitPrice,
    optionsTotal: r.optionsTotal,
    lineTotal: r.lineTotal,
    options: r.options.map((o) => ({ choiceId: o.choiceId, groupId: o.choiceId ? (groupOf.get(o.choiceId) ?? null) : null, groupName: o.groupSnapshot, choiceName: o.choiceSnapshot, priceDelta: o.priceDelta })),
  }));
}

/** id รายการที่ผูกบิลนี้ (เทียบคำขอซ้ำของบิลโต๊ะ: ชุดรายการเดิม = คำขอเดิม) */
export async function tableItemIdsOfSale(db: Db, s: Scope & { saleId: string }): Promise<string[]> {
  const rows = await db.restaurantOrderItem.findMany({ where: { tenantId: s.tenantId, unitId: s.unitId, saleId: s.saleId }, select: { id: true } });
  return rows.map((r) => r.id);
}

export type PosTableDetail = {
  rounds: {
    orderId: string;
    dailyNo: number;
    createdAt: Date;
    byStaff: boolean;
    items: {
      id: string;
      name: string;
      qty: number;
      unitPrice: number;
      optionsTotal: number;
      lineTotal: number;
      note: string | null;
      kdsStatus: "NEW" | "COOKING" | "READY" | "SERVED" | "CANCELLED";
      paid: boolean;
      productId: string | null;
      options: { choiceId: string | null; groupName: string; name: string; priceDelta: number }[];
    }[];
  }[];
};
/** แผงโต๊ะ: ทุกรอบของ session (รวมที่จ่ายแล้ว/ยกเลิก — จอแสดงชิป) เรียงตามเวลา */
export async function tableDetailForPos(db: Db, s: Scope & { sessionId: string }): Promise<PosTableDetail> {
  const orders = await db.restaurantOrder.findMany({
    where: { tenantId: s.tenantId, unitId: s.unitId, sessionId: s.sessionId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      dailyNo: true,
      createdAt: true,
      placedByUserId: true,
      items: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          nameSnapshot: true,
          qty: true,
          unitPrice: true,
          optionsTotal: true,
          lineTotal: true,
          note: true,
          kdsStatus: true,
          saleId: true,
          productId: true,
          menuItem: { select: { posProductId: true } },
          options: { orderBy: { id: "asc" }, select: { choiceId: true, groupSnapshot: true, choiceSnapshot: true, priceDelta: true } },
        },
      },
    },
  });
  return {
    rounds: orders.map((o) => ({
      orderId: o.id,
      dailyNo: o.dailyNo,
      createdAt: o.createdAt,
      byStaff: !!o.placedByUserId,
      items: o.items.map((i) => ({
        id: i.id,
        name: i.nameSnapshot,
        qty: i.qty,
        unitPrice: i.unitPrice,
        optionsTotal: i.optionsTotal,
        lineTotal: i.lineTotal,
        note: i.note,
        kdsStatus: i.kdsStatus,
        paid: !!i.saleId,
        productId: i.productId ?? i.menuItem?.posProductId ?? null,
        options: i.options.map((x) => ({ choiceId: x.choiceId, groupName: x.groupSnapshot, name: x.choiceSnapshot, priceDelta: x.priceDelta })),
      })),
    })),
  };
}

// ═══════════ เขียน: บิลโต๊ะ (R7 · ธุรกรรมเดียวกับ createSale) ═══════════

/**
 * ยึดรายการก่อนขาย: ล็อกแถว (FOR UPDATE) ของรายการที่ยังไม่จ่าย/ไม่ยกเลิกของ session นี้ในชุดที่ขอ — คืน id ที่ยึดได้
 * (อีกเครื่องที่จ่ายโต๊ะเดียวกันพร้อมกันรอล็อก แล้วเห็นว่ารายการถูกผูกบิลแล้ว ⇒ ได้น้อยกว่าที่ขอ ⇒ ผู้เรียกปฏิเสธ TABLE_ITEMS_CHANGED + rollback)
 */
export async function claimTableItemsInTx(tx: Prisma.TransactionClient, s: Scope & { sessionId: string; itemIds: string[] }): Promise<string[]> {
  if (!s.itemIds.length) return [];
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT i.id FROM "RestaurantOrderItem" i JOIN "RestaurantOrder" o ON o.id = i."orderId"
    WHERE i.id = ANY(${s.itemIds}::text[]) AND i."tenantId" = ${s.tenantId} AND i."unitId" = ${s.unitId}
      AND o."sessionId" = ${s.sessionId} AND i."saleId" IS NULL AND i."kdsStatus" <> 'CANCELLED'
    ORDER BY i.id
    FOR UPDATE OF i`;
  return rows.map((r) => r.id);
}

/**
 * ผูกรายการที่ยึดแล้วกับบิล (saleId + settledAt) → ไม่มีรายการค้างจ่ายเหลือ และ closeWhenPaid (ไม่มีรอบร่าง HELD) ⇒ session CLOSED + โต๊ะ dirtySince = now
 * (ธุรกรรมเดียวกับบิล · CONTROLLER-DECISION 9: แถวรายการ/session/บรรทัดบิล xmin เดียวกัน)
 */
export async function settleTableItemsInTx(
  tx: Prisma.TransactionClient,
  s: Scope & { sessionId: string; itemIds: string[]; saleId: string; closeWhenPaid: boolean },
): Promise<{ settled: number; sessionClosed: boolean }> {
  const now = new Date();
  const upd = await tx.restaurantOrderItem.updateMany({
    where: { id: { in: s.itemIds }, tenantId: s.tenantId, unitId: s.unitId, saleId: null, kdsStatus: { not: "CANCELLED" } },
    data: { saleId: s.saleId, settledAt: now },
  });
  let sessionClosed = false;
  if (s.closeWhenPaid) {
    // POS P2.4 ▸ fix 2 F2: ล็อกแถว session (FOR UPDATE) ก่อนนับ — รอบที่กำลังส่ง (lockOpenSessionInTx FOR SHARE) ต้อง commit ก่อน แล้วการนับจะเห็นรายการของรอบนั้น
    //   (เดิม NO KEY UPDATE ไม่ชนกับ KEY SHARE ของ FK ⇒ ปิด session ทั้งที่รอบใหม่เพิ่ง commit) ◂
    await tx.$queryRaw`SELECT id FROM "TableSession" WHERE id = ${s.sessionId} AND "tenantId" = ${s.tenantId} AND "unitId" = ${s.unitId} FOR UPDATE`;
    const remaining = await tx.restaurantOrderItem.count({ where: { tenantId: s.tenantId, unitId: s.unitId, order: { sessionId: s.sessionId }, saleId: null, kdsStatus: { not: "CANCELLED" } } });
    if (remaining === 0) {
      const sess = await tx.tableSession.updateMany({ where: { id: s.sessionId, tenantId: s.tenantId, unitId: s.unitId, status: "OPEN" }, data: { status: "CLOSED", closedAt: now } });
      if (sess.count === 1) {
        const t = await tx.tableSession.findFirst({ where: { id: s.sessionId }, select: { tableId: true } });
        if (t) await tx.restaurantTable.updateMany({ where: { id: t.tableId, tenantId: s.tenantId, unitId: s.unitId }, data: { dirtySince: now } });
        sessionClosed = true;
      }
    }
  }
  return { settled: upd.count, sessionClosed };
}

/**
 * ตัวรับ void ของบิลโต๊ะ (R8 · CD5 · CONTROLLER-DECISION 4): ปลดรายการที่ผูกบิลนี้ (saleId/settledAt = null) ของ session ที่บิลอ้าง →
 * ปลดได้ ≥ 1 รายการ และ session ถูกปิด (CLOSED) และโต๊ะไม่มี session OPEN อื่น ⇒ เปิด session กลับ + ล้าง dirtySince (กติกาเดียวกับ voidCheckout)
 * เล่นซ้ำ = 0 แถว ไม่แตะ session (idempotent)
 */
export async function unlinkTableSaleInTx(tx: Prisma.TransactionClient, s: Scope & { sessionId: string; saleId: string }): Promise<{ itemsReset: number; sessionReopened: boolean }> {
  const upd = await tx.restaurantOrderItem.updateMany({
    where: { tenantId: s.tenantId, unitId: s.unitId, saleId: s.saleId, order: { sessionId: s.sessionId } },
    data: { saleId: null, settledAt: null },
  });
  if (upd.count === 0) return { itemsReset: 0, sessionReopened: false };
  const sess = await tx.tableSession.findFirst({ where: { id: s.sessionId, tenantId: s.tenantId, unitId: s.unitId }, select: { id: true, status: true, tableId: true } });
  if (!sess || sess.status !== "CLOSED") return { itemsReset: upd.count, sessionReopened: false };
  const conflicting = await tx.tableSession.findFirst({ where: { tenantId: s.tenantId, unitId: s.unitId, tableId: sess.tableId, status: "OPEN", id: { not: sess.id } }, select: { id: true } });
  if (conflicting) return { itemsReset: upd.count, sessionReopened: false };
  await tx.tableSession.update({ where: { id: sess.id }, data: { status: "OPEN", closedAt: null } });
  await tx.restaurantTable.updateMany({ where: { id: sess.tableId, tenantId: s.tenantId, unitId: s.unitId }, data: { dirtySince: null } });
  return { itemsReset: upd.count, sessionReopened: true };
}

/**
 * POS P2.4 ▸ fix 2 F2: ถือ session ของรอบที่กำลังส่ง (FOR SHARE · ก่อน createOrderInTx ในธุรกรรมเดียวกัน) — ปิดโต๊ะ/จ่ายรายการสุดท้าย (FOR UPDATE)
 *   รอจนรอบนี้ commit · session ไม่ OPEN = NOT_OPEN (รอบนี้ไม่ถูกเขียนลง session ที่ปิดแล้ว) · ไม่พบ/สาขาอื่น = NOT_FOUND ◂
 */
export async function lockOpenSessionInTx(tx: Prisma.TransactionClient, s: Scope & { sessionId: string }): Promise<{ ok: true } | { ok: false; code: "NOT_FOUND" | "NOT_OPEN" }> {
  const rows = await tx.$queryRaw<{ status: string }[]>`
    SELECT status::text AS status FROM "TableSession" WHERE id = ${s.sessionId} AND "tenantId" = ${s.tenantId} AND "unitId" = ${s.unitId} FOR SHARE`;
  if (!rows[0]) return { ok: false, code: "NOT_FOUND" };
  return rows[0].status === "OPEN" ? { ok: true } : { ok: false, code: "NOT_OPEN" };
}

/**
 * POS P2.4 ▸ fix 2 F4c: ยกเลิกรายการจากโหมดโต๊ะ — ล็อกแถวรายการ (FOR UPDATE · เรียงคิวกับการยึดรายการตอนจ่าย) แล้วใช้กติกาเดียวกับ cancelOrderItem เดิม:
 *   ไม่พบ/สาขาอื่น = NOT_FOUND · ผูกบิลแล้ว = PAID (ผู้เรียกตอบ TABLE_ITEMS_CHANGED) · ยกเลิกแล้ว/เสิร์ฟแล้ว = REFUSED + เหตุผลเดิม ·
 *   ยังไม่เริ่มทำ (NEW) + เมนูนับสต็อก = คืนสต็อกเมนู (ตัวเขียนเดิม) · ประตูเดิม cancelOrderItem ไม่ถูกแตะ (R11) ◂
 */
export async function cancelTableItemInTx(
  tx: Prisma.TransactionClient,
  s: Scope & { itemId: string; reason: string; byUserId: string },
): Promise<{ ok: true } | { ok: false; code: "NOT_FOUND" | "PAID" | "REFUSED"; reason: string }> {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "RestaurantOrderItem" WHERE id = ${s.itemId} AND "tenantId" = ${s.tenantId} AND "unitId" = ${s.unitId} FOR UPDATE`;
  if (!locked.length) return { ok: false, code: "NOT_FOUND", reason: "ไม่พบรายการ" };
  const it = await tx.restaurantOrderItem.findFirst({ where: { id: s.itemId, tenantId: s.tenantId, unitId: s.unitId } });
  if (!it) return { ok: false, code: "NOT_FOUND", reason: "ไม่พบรายการ" };
  if (it.saleId) return { ok: false, code: "PAID", reason: "รายการนี้ชำระแล้ว แก้ไม่ได้" };
  if (it.kdsStatus === "CANCELLED") return { ok: false, code: "REFUSED", reason: "ยกเลิกไปแล้ว" };
  if (it.kdsStatus === "SERVED") return { ok: false, code: "REFUSED", reason: "เสิร์ฟแล้ว ยกเลิกไม่ได้" };
  if (it.menuItemId && it.kdsStatus === "NEW") {
    const mi = await tx.menuItem.findFirst({ where: { id: it.menuItemId, tenantId: s.tenantId }, select: { stockQty: true } });
    if (mi?.stockQty != null) await restoreMenuStock(tx, it.menuItemId, it.qty);
  }
  const u = await tx.restaurantOrderItem.updateMany({
    where: { id: it.id, tenantId: s.tenantId, unitId: s.unitId, saleId: null, kdsStatus: it.kdsStatus },
    data: { kdsStatus: "CANCELLED", cancelledAt: new Date(), cancelReason: s.reason, cancelledByUserId: s.byUserId },
  });
  // POS P2.4 ▸ fix 3 N3: ไม่ควรเกิด (ถือ FOR UPDATE อยู่) — throw ให้ธุรกรรมย้อน (ไม่มีคืนสต็อกโดยไม่ได้ยกเลิก) ◂
  if (u.count !== 1) throw new Error("cancelTableItemInTx: item changed under FOR UPDATE — rolled back");
  return { ok: true };
}

// ═══════════ เขียน: ปิด/เก็บโต๊ะ · ผูกสมาชิก (R9) ═══════════

/**
 * ปิดโต๊ะ (ล็อกแถว session ก่อน — รอบที่กำลังส่งพร้อมกันต้องรอ): ไม่พบ/สาขาอื่น = NOT_FOUND · ไม่ OPEN = NOT_OPEN ·
 * มีรายการค้างจ่าย = HAS_UNPAID · ไม่มีรายการ (ที่ไม่ถูกยกเลิก) = CANCELLED · จ่ายครบแล้ว = CLOSED + โต๊ะ dirtySince = now
 */
export async function closeTableSessionInTx(
  tx: Prisma.TransactionClient,
  s: Scope & { sessionId: string },
): Promise<{ ok: true; status: "CLOSED" | "CANCELLED"; tableId: string } | { ok: false; code: "NOT_FOUND" | "NOT_OPEN" | "HAS_UNPAID" }> {
  const rows = await tx.$queryRaw<{ id: string; status: string; tableId: string }[]>`
    SELECT id, status::text AS status, "tableId" FROM "TableSession" WHERE id = ${s.sessionId} AND "tenantId" = ${s.tenantId} AND "unitId" = ${s.unitId} FOR UPDATE`;
  const sess = rows[0];
  if (!sess) return { ok: false, code: "NOT_FOUND" };
  if (sess.status !== "OPEN") return { ok: false, code: "NOT_OPEN" };
  const live = { tenantId: s.tenantId, unitId: s.unitId, order: { sessionId: s.sessionId }, kdsStatus: { not: "CANCELLED" as const } };
  const [items, unpaid] = await Promise.all([tx.restaurantOrderItem.count({ where: live }), tx.restaurantOrderItem.count({ where: { ...live, saleId: null } })]);
  if (unpaid > 0) return { ok: false, code: "HAS_UNPAID" };
  const now = new Date();
  const status = items > 0 ? ("CLOSED" as const) : ("CANCELLED" as const);
  await tx.tableSession.update({ where: { id: sess.id }, data: { status, closedAt: now } });
  if (status === "CLOSED") await tx.restaurantTable.updateMany({ where: { id: sess.tableId, tenantId: s.tenantId, unitId: s.unitId }, data: { dirtySince: now } });
  return { ok: true, status, tableId: sess.tableId };
}

/** เก็บโต๊ะแล้ว (dirtySince = null) — โต๊ะไม่พบ/สาขาอื่น/เก็บถาวร = NO_TABLE */
export async function clearTableForPos(db: Db, s: Scope & { tableId: string }): Promise<{ ok: true; wasDirty: boolean } | { ok: false; code: "NO_TABLE" }> {
  const t = await db.restaurantTable.findFirst({ where: { id: s.tableId, tenantId: s.tenantId, unitId: s.unitId, archivedAt: null }, select: { id: true, dirtySince: true } });
  if (!t) return { ok: false, code: "NO_TABLE" };
  if (t.dirtySince) await db.restaurantTable.updateMany({ where: { id: t.id, tenantId: s.tenantId, unitId: s.unitId }, data: { dirtySince: null } });
  return { ok: true, wasDirty: !!t.dirtySince };
}

/** ผูก/ถอดสมาชิกของ session ที่ยัง OPEN (ผู้เรียกตรวจสมาชิกด้วยด่านของหน้าขายแล้ว) */
export async function setTableSessionMemberForPos(db: Db, s: Scope & { sessionId: string; memberId: string | null }): Promise<{ ok: true } | { ok: false; code: "NOT_FOUND" | "NOT_OPEN" }> {
  const sess = await db.tableSession.findFirst({ where: { id: s.sessionId, tenantId: s.tenantId, unitId: s.unitId }, select: { id: true, status: true } });
  if (!sess) return { ok: false, code: "NOT_FOUND" };
  if (sess.status !== "OPEN") return { ok: false, code: "NOT_OPEN" };
  await db.tableSession.updateMany({ where: { id: sess.id, tenantId: s.tenantId, unitId: s.unitId, status: "OPEN" }, data: { memberId: s.memberId } });
  return { ok: true };
}

// ═══════════ คำขอจากโต๊ะ (เรียกพนักงาน · ขอเช็คบิล · แจ้งจ่ายพร้อมเพย์) ═══════════

export type PosTableRequest = { id: string; type: "CALL_STAFF" | "REQUEST_BILL" | "PAY_PROMPTPAY"; status: "PENDING" | "ACKED"; sessionId: string; tableId: string; tableName: string; note: string | null; createdAt: Date; ackedAt: Date | null };
/** คำขอที่ยังไม่ปิดเรื่องของสาขา (PENDING/ACKED · เก่าก่อน) — เฉพาะ session ที่ยัง OPEN */
export async function tableRequestsForPos(db: Db, s: Scope): Promise<PosTableRequest[]> {
  const rows = await db.restaurantServiceRequest.findMany({
    where: { tenantId: s.tenantId, unitId: s.unitId, status: { in: ["PENDING", "ACKED"] }, session: { status: "OPEN" } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, type: true, status: true, sessionId: true, note: true, createdAt: true, ackedAt: true, session: { select: { tableId: true, table: { select: { name: true } } } } },
  });
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    status: r.status === "ACKED" ? "ACKED" : "PENDING",
    sessionId: r.sessionId,
    tableId: r.session.tableId,
    tableName: r.session.table.name,
    note: r.note,
    createdAt: r.createdAt,
    ackedAt: r.ackedAt,
  }));
}

/** รับทราบ (ACKED · ธงยังอยู่) / ปิดเรื่อง (DONE · ธงหาย) — คำขอของสาขาอื่น/ไม่มีจริง = NOT_FOUND · ปิดเรื่องแล้ว = ไม่แตะ (ok) */
export async function setTableRequestStatusForPos(
  db: Db,
  s: Scope & { requestId: string; to: "ACKED" | "DONE"; byUserId: string },
): Promise<{ ok: true; changed: boolean } | { ok: false; code: "NOT_FOUND" }> {
  const r = await db.restaurantServiceRequest.findFirst({ where: { id: s.requestId, tenantId: s.tenantId, unitId: s.unitId }, select: { id: true, status: true } });
  if (!r) return { ok: false, code: "NOT_FOUND" };
  const now = new Date();
  if (s.to === "ACKED") {
    const u = await db.restaurantServiceRequest.updateMany({ where: { id: r.id, tenantId: s.tenantId, unitId: s.unitId, status: "PENDING" }, data: { status: "ACKED", ackedAt: now, ackedByUserId: s.byUserId } });
    return { ok: true, changed: u.count === 1 };
  }
  const u = await db.restaurantServiceRequest.updateMany({ where: { id: r.id, tenantId: s.tenantId, unitId: s.unitId, status: { in: ["PENDING", "ACKED"] } }, data: { status: "DONE", doneAt: now } });
  return { ok: true, changed: u.count === 1 };
}

/** รายการของสาขานี้ไหม (ยกเลิกรายการผ่าน cancelOrderItem — ด่านเจอ/ไม่เจอให้ POS ตอบ TABLE_NOT_FOUND) */
export async function tableItemExistsForPos(db: Db, s: Scope & { itemId: string }): Promise<boolean> {
  return !!(await db.restaurantOrderItem.findFirst({ where: { id: s.itemId, tenantId: s.tenantId, unitId: s.unitId }, select: { id: true } }));
}

/** จำนวนโต๊ะที่ไม่เก็บถาวรของสาขา (มติ Q5: แท็บ "โต๊ะ" แสดงเมื่อ ≥ 1 หรือผู้ใช้สร้างโต๊ะได้) */
export async function tableCountForPos(db: Db, s: Scope): Promise<number> {
  return db.restaurantTable.count({ where: { tenantId: s.tenantId, unitId: s.unitId, archivedAt: null } });
}

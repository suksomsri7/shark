import { randomUUID } from "crypto";
import { prisma, tenantDb } from "@/lib/core/db";
import type { TableShape, TableStatus } from "@prisma/client";
import "./scope";

// ───────────────────────── Zones ─────────────────────────
export async function listZones(tenantId: string, unitId: string) {
  const db = tenantDb({ tenantId, unitId });
  return db.restaurantZone.findMany({
    where: { archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function createZone(tenantId: string, unitId: string, name: string) {
  const db = tenantDb({ tenantId, unitId });
  const dup = await db.restaurantZone.findFirst({ where: { name, archivedAt: null } });
  if (dup) return { ok: false as const, reason: "มีโซนชื่อนี้แล้ว" };
  const z = await db.restaurantZone.create({ data: { tenantId, unitId, name } });
  return { ok: true as const, id: z.id };
}

export async function archiveZone(tenantId: string, unitId: string, id: string) {
  const db = tenantDb({ tenantId, unitId });
  const tables = await db.restaurantTable.count({ where: { zoneId: id, archivedAt: null } });
  if (tables > 0) return { ok: false as const, reason: "ยังมีโต๊ะในโซนนี้ — ลบโต๊ะก่อน" };
  await db.restaurantZone.update({ where: { id }, data: { archivedAt: new Date() } });
  return { ok: true as const };
}

// ───────────────────────── Tables ─────────────────────────
export async function createTable(
  tenantId: string,
  unitId: string,
  input: { zoneId: string; name: string; seats?: number; shape?: TableShape },
) {
  const db = tenantDb({ tenantId, unitId });
  const zone = await db.restaurantZone.findFirst({ where: { id: input.zoneId, archivedAt: null } });
  if (!zone) return { ok: false as const, reason: "ไม่พบโซน" };
  const dup = await db.restaurantTable.findFirst({ where: { name: input.name, archivedAt: null } });
  if (dup) return { ok: false as const, reason: `มีโต๊ะชื่อ ${input.name} แล้ว` };
  const t = await db.restaurantTable.create({
    data: {
      tenantId,
      unitId,
      zoneId: input.zoneId,
      name: input.name,
      seats: input.seats ?? 4,
      shape: input.shape ?? "RECT",
    },
  });
  return { ok: true as const, id: t.id, qrToken: t.qrToken };
}

export async function updateTable(
  tenantId: string,
  unitId: string,
  id: string,
  data: { name?: string; seats?: number; shape?: TableShape; status?: TableStatus; zoneId?: string },
) {
  const db = tenantDb({ tenantId, unitId });
  return db.restaurantTable.update({ where: { id }, data });
}

export async function archiveTable(tenantId: string, unitId: string, id: string) {
  const db = tenantDb({ tenantId, unitId });
  const open = await db.tableSession.count({ where: { tableId: id, status: "OPEN" } });
  if (open > 0) return { ok: false as const, reason: "โต๊ะนี้มีลูกค้าอยู่ — ปิดโต๊ะก่อน" };
  await db.restaurantTable.update({ where: { id }, data: { archivedAt: new Date() } });
  return { ok: true as const };
}

export async function rotateQr(tenantId: string, unitId: string, id: string) {
  const db = tenantDb({ tenantId, unitId });
  // qrToken มี default cuid() ตอน create เท่านั้น — rotate ต้องส่งค่าใหม่เอง (เดาไม่ได้)
  const fresh = `qr_${randomUUID().replace(/-/g, "")}`;
  const t = await db.restaurantTable.update({ where: { id }, data: { qrToken: fresh } });
  return t.qrToken;
}

// ───────────────────────── Floor plan / สถานะโต๊ะ ─────────────────────────
export type TableCard = {
  id: string;
  name: string;
  zoneId: string;
  zoneName: string;
  seats: number;
  shape: TableShape;
  status: TableStatus;
  posX: number;
  posY: number;
  width: number;
  height: number;
  qrToken: string;
  sessionId: string | null;
  guestCount: number | null;
  totalSatang: number; // ยอดสะสม (รายการยังไม่ยกเลิก)
  openedAt: Date | null;
  hasRequest: boolean;
  hasBillRequest: boolean;
};

// floor plan: โต๊ะทุกตัว + สถานะ session ปัจจุบัน (ยอดสะสม/เวลานั่ง/request ค้าง)
export async function floorPlan(tenantId: string, unitId: string): Promise<TableCard[]> {
  const db = tenantDb({ tenantId, unitId });
  const [tables, zones, openSessions, pendingReqs] = await Promise.all([
    db.restaurantTable.findMany({
      where: { archivedAt: null },
      orderBy: [{ zoneId: "asc" }, { name: "asc" }],
    }),
    db.restaurantZone.findMany({ where: { archivedAt: null } }),
    db.tableSession.findMany({
      where: { status: "OPEN" },
      include: { orders: { include: { items: { where: { kdsStatus: { not: "CANCELLED" } } } } } },
    }),
    db.restaurantServiceRequest.findMany({
      where: { status: { in: ["PENDING", "ACKED"] } },
      select: { sessionId: true, type: true },
    }),
  ]);
  const zoneName = new Map(zones.map((z) => [z.id, z.name]));
  const sessByTable = new Map(openSessions.map((s) => [s.tableId, s]));
  const reqBySession = new Map<string, { call: boolean; bill: boolean }>();
  for (const r of pendingReqs) {
    const cur = reqBySession.get(r.sessionId) ?? { call: false, bill: false };
    if (r.type === "CALL_STAFF") cur.call = true;
    if (r.type === "REQUEST_BILL") cur.bill = true;
    reqBySession.set(r.sessionId, cur);
  }

  return tables.map((t) => {
    const sess = sessByTable.get(t.id);
    let total = 0;
    if (sess) {
      for (const o of sess.orders) for (const it of o.items) total += it.lineTotal;
    }
    const req = sess ? reqBySession.get(sess.id) : undefined;
    return {
      id: t.id,
      name: t.name,
      zoneId: t.zoneId,
      zoneName: zoneName.get(t.zoneId) ?? "",
      seats: t.seats,
      shape: t.shape,
      status: t.status,
      posX: t.posX,
      posY: t.posY,
      width: t.width,
      height: t.height,
      qrToken: t.qrToken,
      sessionId: sess?.id ?? null,
      guestCount: sess?.guestCount ?? null,
      totalSatang: total,
      openedAt: sess?.openedAt ?? null,
      hasRequest: !!req?.call,
      hasBillRequest: !!req?.bill,
    };
  });
}

// ───────────────────────── Sessions ─────────────────────────
// เปิดโต๊ะโดย staff (หรือ get-or-create) — กัน 2 session OPEN ต่อโต๊ะ
export async function openSession(
  tenantId: string,
  unitId: string,
  tableId: string,
  opts?: { guestCount?: number; openedByUserId?: string },
): Promise<{ ok: true; id: string; created: boolean } | { ok: false; reason: string }> {
  try {
    const res = await prisma.$transaction(async (tx) => {
      const table = await tx.restaurantTable.findFirst({ where: { id: tableId, tenantId, unitId } });
      if (!table) throw new Error("NO_TABLE");
      if (table.status !== "ACTIVE") throw new Error("TABLE_INACTIVE");
      const existing = await tx.tableSession.findFirst({ where: { tenantId, unitId, tableId, status: "OPEN" } });
      if (existing) return { id: existing.id, created: false };
      const s = await tx.tableSession.create({
        data: {
          tenantId,
          unitId,
          tableId,
          guestCount: opts?.guestCount ?? null,
          openedByUserId: opts?.openedByUserId ?? null,
        },
      });
      return { id: s.id, created: true };
    });
    return { ok: true, ...res };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "NO_TABLE") return { ok: false, reason: "ไม่พบโต๊ะ" };
    if (msg === "TABLE_INACTIVE") return { ok: false, reason: "โต๊ะนี้ปิดใช้งานอยู่" };
    // partial unique index ชน (2 คนเปิดพร้อมกัน) → อ่านอันเดิม
    const again = await prisma.tableSession.findFirst({ where: { tenantId, unitId, tableId, status: "OPEN" } });
    if (again) return { ok: true, id: again.id, created: false };
    throw e;
  }
}

// รายละเอียด session: orders + items + options + service requests + ยอดค้างชำระ
export async function getSession(tenantId: string, unitId: string, id: string) {
  const db = tenantDb({ tenantId, unitId });
  const session = await db.tableSession.findFirst({
    where: { id },
    include: {
      table: true,
      orders: {
        orderBy: { createdAt: "asc" },
        include: {
          items: {
            orderBy: { createdAt: "asc" },
            include: { options: true, station: true },
          },
        },
      },
      serviceRequests: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!session) return null;
  let total = 0;
  let unpaid = 0;
  for (const o of session.orders) {
    for (const it of o.items) {
      if (it.kdsStatus === "CANCELLED") continue;
      total += it.lineTotal;
      if (!it.saleId) unpaid += it.lineTotal;
    }
  }
  return { ...session, totalSatang: total, unpaidSatang: unpaid };
}

// session OPEN ของโต๊ะ (สำหรับหน้า floor plan → session)
export async function openSessionOfTable(tenantId: string, unitId: string, tableId: string) {
  const db = tenantDb({ tenantId, unitId });
  return db.tableSession.findFirst({ where: { tableId, status: "OPEN" } });
}

// รายการ session OPEN (สำหรับ dropdown คีย์ออเดอร์)
export async function openSessionsList(tenantId: string, unitId: string) {
  const db = tenantDb({ tenantId, unitId });
  const sessions = await db.tableSession.findMany({
    where: { status: "OPEN" },
    include: { table: true },
    orderBy: { openedAt: "asc" },
  });
  return sessions.map((s) => ({ sessionId: s.id, tableName: s.table.name }));
}

export async function linkMember(tenantId: string, unitId: string, sessionId: string, memberId: string) {
  const db = tenantDb({ tenantId, unitId });
  await db.tableSession.update({ where: { id: sessionId }, data: { memberId } });
}

// ปิด session — ได้เฉพาะไม่มีรายการค้างชำระ (หรือยกเลิก session ว่าง)
export async function closeSession(
  tenantId: string,
  unitId: string,
  sessionId: string,
  reason?: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const s = await getSession(tenantId, unitId, sessionId);
  if (!s) return { ok: false, reason: "ไม่พบ session" };
  if (s.status !== "OPEN") return { ok: false, reason: "session นี้ปิดไปแล้ว" };
  const db = tenantDb({ tenantId, unitId });
  const hasItems = s.orders.some((o) => o.items.some((it) => it.kdsStatus !== "CANCELLED"));
  if (s.unpaidSatang > 0) return { ok: false, reason: "ยังมีรายการค้างชำระ — เช็คบิลก่อน" };
  await db.tableSession.update({
    where: { id: sessionId },
    data: { status: hasItems ? "CLOSED" : "CANCELLED", closedAt: new Date() },
  });
  return { ok: true };
}

// ย้ายโต๊ะ: session ทั้งก้อน → โต๊ะใหม่ (ต้องว่าง)
export async function moveSession(
  tenantId: string,
  unitId: string,
  sessionId: string,
  toTableId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await prisma.$transaction(async (tx) => {
      const s = await tx.tableSession.findFirst({ where: { id: sessionId, tenantId, unitId } });
      if (!s || s.status !== "OPEN") throw new Error("BAD_SESSION");
      const to = await tx.restaurantTable.findFirst({ where: { id: toTableId, tenantId, unitId } });
      if (!to) throw new Error("NO_TABLE");
      if (to.status !== "ACTIVE") throw new Error("TABLE_INACTIVE");
      const busy = await tx.tableSession.findFirst({ where: { tenantId, unitId, tableId: toTableId, status: "OPEN" } });
      if (busy) throw new Error("TABLE_BUSY");
      await tx.tableSession.update({ where: { id: sessionId }, data: { tableId: toTableId } });
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    const map: Record<string, string> = {
      BAD_SESSION: "session ไม่พร้อมย้าย",
      NO_TABLE: "ไม่พบโต๊ะปลายทาง",
      TABLE_INACTIVE: "โต๊ะปลายทางปิดใช้งาน",
      TABLE_BUSY: "โต๊ะปลายทางไม่ว่าง — ใช้ 'รวมโต๊ะ' แทน",
    };
    if (map[msg]) return { ok: false, reason: map[msg] };
    throw e;
  }
}

// รวมโต๊ะ: from → into (orders/requests ย้าย, from = MERGED)
export async function mergeSession(
  tenantId: string,
  unitId: string,
  intoSessionId: string,
  fromSessionId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (intoSessionId === fromSessionId) return { ok: false, reason: "เลือกคนละโต๊ะ" };
  try {
    await prisma.$transaction(async (tx) => {
      const into = await tx.tableSession.findFirst({ where: { id: intoSessionId, tenantId, unitId } });
      const from = await tx.tableSession.findFirst({ where: { id: fromSessionId, tenantId, unitId } });
      if (!into || into.status !== "OPEN") throw new Error("BAD_INTO");
      if (!from || from.status !== "OPEN") throw new Error("BAD_FROM");
      await tx.restaurantOrder.updateMany({ where: { sessionId: fromSessionId }, data: { sessionId: intoSessionId } });
      await tx.restaurantServiceRequest.updateMany({ where: { sessionId: fromSessionId }, data: { sessionId: intoSessionId } });
      // ยก member ถ้า into ยังไม่มี
      if (!into.memberId && from.memberId) {
        await tx.tableSession.update({ where: { id: intoSessionId }, data: { memberId: from.memberId } });
      }
      await tx.tableSession.update({
        where: { id: fromSessionId },
        data: { status: "MERGED", mergedIntoId: intoSessionId, closedAt: new Date() },
      });
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    const map: Record<string, string> = {
      BAD_INTO: "โต๊ะปลายทางไม่พร้อม",
      BAD_FROM: "โต๊ะต้นทางไม่พร้อม",
    };
    if (map[msg]) return { ok: false, reason: map[msg] };
    throw e;
  }
}

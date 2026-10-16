// pos-qr-readers.ts — POS P2.7U fix1 ▸ ตัวอ่านอย่างเดียวของจอพนักงานฝั่ง QR (จอ 09 "หน้าร้าน QR N" · QR ของโต๊ะ/แผ่นพิมพ์) ◂
//
// 🔴 อ่านอย่างเดียว — ไม่มีคำสั่งเขียน · ไม่มี createSale · ไม่ปล่อย outbox (ผู้เขียน Restaurant*/TableSession ยังเป็นโมดูลนี้ที่เดียว)
// 🔴 POS (pos/qr-staff.ts) เรียกผ่าน facade `import("@/lib/modules/restaurant")` (บล็อก POS P2.7U ใน index.ts) — ไม่แตะ prisma.restaurant* เอง
// 🔴 "รอบ QR" = ticketSourceOf ของ KDS (session + ไม่มีพนักงาน + ไม่ใช่บิลหน้าขาย/ออเดอร์ออนไลน์) · "วันนี้" = bizDate ของร้าน (bizDateBkk) ไม่ใช่ createdAt
// (แยกไฟล์จาก pos-qr.ts ของใบ S ซึ่งมีตัวเขียนรอบแขก — ไฟล์นี้ต้องอ่านอย่างเดียวทั้งไฟล์)

import type { Prisma, PrismaClient } from "@prisma/client";
import { ticketSourceOf } from "@/lib/modules/pos/kds-shared";
import { bizDateBkk } from "./scope";

type Db = Prisma.TransactionClient | PrismaClient;
type Scope = { tenantId: string; unitId: string };

export type GuestRoundTodayRow = {
  orderId: string;
  dailyNo: number;
  at: Date;
  sessionId: string;
  sessionOpen: boolean;
  tableId: string;
  tableName: string;
  items: { qty: number; lineTotal: number; kdsStatus: "NEW" | "COOKING" | "READY" | "SERVED" | "CANCELLED" }[];
};

/** รอบที่แขกสั่งเองผ่าน QR โต๊ะของวันนี้ (bizDate ของร้าน) ที่สาขา — ใหม่สุด 200 รอบ · ไม่รวมรอบที่ถูกยกเลิกทั้งรอบ */
export async function guestRoundsTodayForPos(db: Db, s: Scope): Promise<GuestRoundTodayRow[]> {
  const rows = await db.restaurantOrder.findMany({
    where: { tenantId: s.tenantId, unitId: s.unitId, type: "DINE_IN", bizDate: bizDateBkk(), sessionId: { not: null }, status: { not: "CANCELLED" } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 200,
    select: {
      id: true,
      dailyNo: true,
      createdAt: true,
      sessionId: true,
      placedByUserId: true,
      posSaleId: true,
      posOrderId: true,
      session: { select: { id: true, status: true, tableId: true, table: { select: { name: true } } } },
      items: { select: { qty: true, lineTotal: true, kdsStatus: true } },
    },
  });
  const out: GuestRoundTodayRow[] = [];
  for (const r of rows) {
    if (!r.session || ticketSourceOf(r) !== "QR") continue;
    out.push({
      orderId: r.id,
      dailyNo: r.dailyNo,
      at: r.createdAt,
      sessionId: r.session.id,
      sessionOpen: r.session.status === "OPEN",
      tableId: r.session.tableId,
      tableName: r.session.table.name,
      items: r.items.map((i) => ({ qty: i.qty, lineTotal: i.lineTotal, kdsStatus: i.kdsStatus })),
    });
  }
  return out;
}

export type TableQrTokenRow = { tableId: string; name: string; zoneId: string; zoneName: string; qrToken: string; active: boolean };
/** QR ของโต๊ะทุกตัวที่ไม่เก็บถาวรของสาขา (เรียงโซน → ชื่อ) */
export async function tableQrTokensForPos(db: Db, s: Scope): Promise<TableQrTokenRow[]> {
  const rows = await db.restaurantTable.findMany({
    where: { tenantId: s.tenantId, unitId: s.unitId, archivedAt: null },
    orderBy: [{ zone: { sortOrder: "asc" } }, { name: "asc" }, { id: "asc" }],
    take: 500,
    select: { id: true, name: true, zoneId: true, qrToken: true, status: true, zone: { select: { name: true } } },
  });
  return rows.map((t) => ({ tableId: t.id, name: t.name, zoneId: t.zoneId, zoneName: t.zone.name, qrToken: t.qrToken, active: t.status === "ACTIVE" }));
}

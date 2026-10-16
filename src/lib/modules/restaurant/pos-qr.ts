// pos-qr.ts — POS P2.7 QR โต๊ะผ่านประตู POS (/q/t/<qrToken>): ฟังก์ชันของโมดูลร้านอาหารที่ POS เรียกผ่าน facade `restaurant/index.ts` (บล็อก POS P2.7)
//
// 🔴 โมดูลร้านอาหารยังเป็นผู้เขียน Restaurant*/TableSession ที่เดียว (มติ 13) — POS (pos/qr-order.ts · pos/table.ts) เรียกผ่าน `import("@/lib/modules/restaurant")`
// 🔴 ข้อบกพร่องของประตูเดิมที่ใบนี้ปิด (§10): ① เปิดหน้า/โพลแล้วเปิด session ผี (resolveTableSession get-or-create) — ที่นี่ "อ่าน" อย่างเดียว ·
//    session ของแขกเปิดตอนส่งรอบแรก (หรือเรียกพนักงาน) เท่านั้น · ② ยอดบนมือถือ ≠ บิลที่แคชเชียร์เก็บ — บิลแขกคิดที่ POS (ไม่ใช่ billPreview ที่ปัดลง)
// 🔴 ส่งรอบ = ล็อก session (FOR SHARE · ตัวเดียวกับรอบของพนักงาน lockOpenSessionInTx) + ตรวจว่ายัง OPEN + ตาม merge chain 1 ชั้น (แบบประตูเดิม) ·
//    หน้าโหลด session หนึ่งไว้แล้วโต๊ะถูกปิด/เปิดใหม่ระหว่างทาง = SESSION_CHANGED (ไม่มีรอบลง session ที่ปิดแล้ว · ไม่เปิด session ใหม่ให้เอง)
// 🔴 ไม่มี createSale · ไม่ปล่อย outbox event (event 86 ของตัวนับเมนู = catalog-legacy ฝั่ง POS) · ประตูเดิม (storefront.ts · API routes) ไม่ถูกแตะ (CD7)
// สัญญา: ledger/pos-briefs/pos-brief-P2.7.md §1(a) · §10 มติ 1 6 13 · ตารางชื่อ ledger/wo-notes/pos-P2.7-oracle.md

import { Prisma, type PrismaClient, type ServiceRequestType } from "@prisma/client";
import { createGuestOrderInTx, createServiceRequest, OrderInTxError, type OrderInTxLine } from "./order";
import { rotateQr } from "./table";
import { kitchenOpenNow } from "./scope";
import "./scope";

type Db = Prisma.TransactionClient | PrismaClient;
type Tx = Prisma.TransactionClient;
type Scope = { tenantId: string; unitId: string };

export type GuestRoundView = {
  id: string;
  no: number;
  at: Date;
  items: { name: string; qty: number; options: string[]; status: "NEW" | "COOKING" | "READY" | "SERVED" | "CANCELLED"; lineTotal: number }[];
};
export type GuestTableView = {
  tenantId: string;
  unitId: string;
  table: { id: string; name: string };
  /** session ที่รอบใหม่จะลง: OPEN ของโต๊ะ หรือปลายทางที่ถูกรวม (MERGED ล่าสุด → OPEN) · null = ยังไม่มี */
  session: { id: string; openedByGuest: boolean; rounds: GuestRoundView[] } | null;
  kitchen: { open: boolean; reason: string | null };
};

/** session ปลายทางของโต๊ะ (อ่านอย่างเดียว): OPEN ของโต๊ะ → MERGED ล่าสุดที่ปลายทางยัง OPEN (1 ชั้น · กติกาเดียวกับประตูเดิม) → null */
async function targetSessionOf(db: Db, s: Scope & { tableId: string }): Promise<{ id: string; openedByUserId: string | null } | null> {
  const open = await db.tableSession.findFirst({ where: { tenantId: s.tenantId, unitId: s.unitId, tableId: s.tableId, status: "OPEN" }, orderBy: [{ openedAt: "asc" }, { id: "asc" }], select: { id: true, openedByUserId: true } });
  if (open) return open;
  const merged = await db.tableSession.findFirst({ where: { tenantId: s.tenantId, unitId: s.unitId, tableId: s.tableId, status: "MERGED" }, orderBy: [{ closedAt: "desc" }, { id: "desc" }], select: { mergedIntoId: true } });
  if (!merged?.mergedIntoId) return null;
  return db.tableSession.findFirst({ where: { id: merged.mergedIntoId, tenantId: s.tenantId, unitId: s.unitId, status: "OPEN" }, select: { id: true, openedByUserId: true } });
}

/** ครัวเปิดรับตอนนี้ไหม (อ่านอย่างเดียว — ไม่สร้างแถวค่าตั้งแบบ getSetting · ไม่มีแถว = ค่าเริ่มต้นของร้าน = เปิด) */
export async function guestKitchenForPos(db: Db, s: Scope): Promise<{ open: boolean; reason: string | null; paused: boolean }> {
  const st = await db.restaurantSetting.findFirst({
    where: { tenantId: s.tenantId, unitId: s.unitId },
    select: { serviceHours: true, specialClosures: true, lastOrderMins: true, kitchenPaused: true, kitchenPausedNote: true },
  });
  const k = kitchenOpenNow(st ?? { serviceHours: [], specialClosures: [], lastOrderMins: 0, kitchenPaused: false, kitchenPausedNote: null });
  return { open: k.open, reason: k.open ? null : (k.reason ?? null), paused: !!st?.kitchenPaused };
}

/**
 * มุมมองโต๊ะของแขกจาก qrToken (อ่านอย่างเดียว · 0 เขียน — มติ 11): โต๊ะต้องไม่เก็บถาวร + ACTIVE (อื่น = null → TOKEN_INVALID) ·
 * session ปลายทาง + รอบที่ไม่ถูกยกเลิก (รายการพร้อมสถานะครัว) · ครัวเปิด/ปิด
 */
export async function guestTableViewForPos(db: Db, input: { qrToken: string }): Promise<GuestTableView | null> {
  if (typeof input?.qrToken !== "string" || !input.qrToken) return null;
  const t = await db.restaurantTable.findUnique({ where: { qrToken: input.qrToken }, select: { id: true, tenantId: true, unitId: true, name: true, status: true, archivedAt: true } });
  if (!t || t.archivedAt || t.status !== "ACTIVE") return null;
  const s = { tenantId: t.tenantId, unitId: t.unitId };
  const [target, kitchen] = await Promise.all([targetSessionOf(db, { ...s, tableId: t.id }), guestKitchenForPos(db, s)]);
  let session: GuestTableView["session"] = null;
  if (target) {
    const orders = await db.restaurantOrder.findMany({
      where: { tenantId: s.tenantId, unitId: s.unitId, sessionId: target.id, status: { not: "CANCELLED" } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, dailyNo: true, createdAt: true, items: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { nameSnapshot: true, qty: true, kdsStatus: true, lineTotal: true, options: { select: { choiceSnapshot: true } } } } },
    });
    session = {
      id: target.id,
      openedByGuest: target.openedByUserId === null,
      rounds: orders.map((o) => ({
        id: o.id,
        no: o.dailyNo,
        at: o.createdAt,
        items: o.items.map((it) => ({ name: it.nameSnapshot, qty: it.qty, options: it.options.map((x) => x.choiceSnapshot), status: it.kdsStatus as GuestRoundView["items"][number]["status"], lineTotal: it.lineTotal })),
      })),
    };
  }
  return { tenantId: t.tenantId, unitId: t.unitId, table: { id: t.id, name: t.name }, session, kitchen };
}

/** เปิด session ของแขก (openedByUserId null) — ถือล็อกโต๊ะเดียวกับ openSession (Q9) แล้วอ่านซ้ำ · โต๊ะใช้ไม่ได้ = null */
async function openGuestSessionInTx(tx: Tx, s: Scope & { tableId: string }): Promise<{ id: string; created: boolean } | null> {
  await tx.$queryRaw`SELECT 1 AS x FROM (SELECT pg_advisory_xact_lock(hashtext(${`restaurant-table:${s.tableId}`}::text))) l`;
  const table = await tx.restaurantTable.findFirst({ where: { id: s.tableId, tenantId: s.tenantId, unitId: s.unitId, archivedAt: null }, select: { id: true, status: true, dirtySince: true } });
  if (!table || table.status !== "ACTIVE") return null;
  const existing = await tx.tableSession.findFirst({ where: { tenantId: s.tenantId, unitId: s.unitId, tableId: s.tableId, status: "OPEN" }, select: { id: true } });
  if (existing) return { id: existing.id, created: false };
  const created = await tx.tableSession.create({ data: { tenantId: s.tenantId, unitId: s.unitId, tableId: s.tableId, openedByUserId: null } });
  if (table.dirtySince) await tx.restaurantTable.updateMany({ where: { id: table.id, tenantId: s.tenantId, unitId: s.unitId }, data: { dirtySince: null } });
  return { id: created.id, created: true };
}

/** ถือ session (FOR SHARE · ก่อนเขียนรอบ) — ไม่ OPEN = false */
async function holdOpenSessionInTx(tx: Tx, s: Scope & { sessionId: string }): Promise<boolean> {
  const rows = await tx.$queryRaw<{ status: string }[]>`
    SELECT status::text AS status FROM "TableSession" WHERE id = ${s.sessionId} AND "tenantId" = ${s.tenantId} AND "unitId" = ${s.unitId} FOR SHARE`;
  return rows[0]?.status === "OPEN";
}

export type GuestRoundInput = {
  tenantId: string;
  unitId: string;
  tableId: string;
  /** session ที่หน้าเห็นตอนโหลด · null/undefined = หน้าไม่เห็น session (รอบแรก) */
  expectedSessionId: string | null | undefined;
  guestToken: string | null;
  /** POS P2.7 ▸ fix2: โน้ตของทั้งรอบ (≤ 200) ◂ */
  note?: string | null;
  /** บรรทัดที่ POS คิดราคาแล้ว (ราคาช่องทาง QR_TABLE · unitPrice ไม่รวมตัวเลือก + optionsTotal) */
  lines: OrderInTxLine[];
};
export type GuestRoundResult =
  | { ok: true; roundId: string; dailyNo: number; sessionId: string; sessionCreated: boolean; menuItemIds: string[] }
  | { ok: false; code: "SESSION_CHANGED" | "NO_TABLE" };

/**
 * ส่งรอบของแขก (ในธุรกรรมของผู้เรียก — POS ถือธุรกรรม · มติ 13): โต๊ะ ACTIVE ไม่เก็บถาวร (อื่น = NO_TABLE) → session ปลายทาง (OPEN / merge chain) →
 *   หน้าเห็น session S: ปลายทางต้องเป็น S หรือ S ถูกรวมเข้าปลายทาง · ไม่มีปลายทาง/คนละใบ = SESSION_CHANGED (ไม่เขียน) ·
 *   หน้าไม่เห็น session: มีปลายทาง = ใช้ · ไม่มี = เปิด session ของแขก (ล็อกโต๊ะ) →
 *   ถือ session FOR SHARE (ปิดโต๊ะ/จ่ายรายการสุดท้าย FOR UPDATE รอรอบนี้) → ไม่ OPEN แล้ว = SESSION_CHANGED → createGuestOrderInTx
 *   บรรทัดผิด (86 · ตัวเลือก · ตัวนับหมด) = throw OrderInTxError (ผู้เรียกให้ธุรกรรม rollback · แปลงเป็นรหัสสาธารณะ + lineIndex)
 */
export async function guestRoundInTx(tx: Tx, input: GuestRoundInput): Promise<GuestRoundResult> {
  const s = { tenantId: input.tenantId, unitId: input.unitId };
  const table = await tx.restaurantTable.findFirst({ where: { id: input.tableId, tenantId: s.tenantId, unitId: s.unitId, archivedAt: null }, select: { id: true, status: true } });
  if (!table || table.status !== "ACTIVE") return { ok: false, code: "NO_TABLE" };
  const target = await targetSessionOf(tx, { ...s, tableId: table.id });
  let sessionId: string;
  let sessionCreated = false;
  const expected = input.expectedSessionId ?? null;
  if (expected) {
    if (!target) return { ok: false, code: "SESSION_CHANGED" };
    if (target.id !== expected) {
      const was = await tx.tableSession.findFirst({ where: { id: expected, tenantId: s.tenantId, unitId: s.unitId }, select: { status: true, mergedIntoId: true } });
      if (!(was?.status === "MERGED" && was.mergedIntoId === target.id)) return { ok: false, code: "SESSION_CHANGED" };
    }
    sessionId = target.id;
  } else if (target) {
    sessionId = target.id;
  } else {
    const opened = await openGuestSessionInTx(tx, { ...s, tableId: table.id });
    if (!opened) return { ok: false, code: "NO_TABLE" };
    sessionId = opened.id;
    sessionCreated = opened.created;
  }
  if (!sessionCreated && !(await holdOpenSessionInTx(tx, { ...s, sessionId }))) return { ok: false, code: "SESSION_CHANGED" };
  const w = await createGuestOrderInTx(tx, { tenantId: s.tenantId, unitId: s.unitId, sessionId, lines: input.lines }, input.guestToken, input.note ?? null);
  const items = w.itemIds.length ? await tx.restaurantOrderItem.findMany({ where: { id: { in: w.itemIds }, tenantId: s.tenantId }, select: { menuItemId: true } }) : [];
  const menuItemIds = [...new Set(items.flatMap((x) => (x.menuItemId ? [x.menuItemId] : [])))];
  return { ok: true, roundId: w.id, dailyNo: w.dailyNo, sessionId, sessionCreated, menuItemIds };
}
export { OrderInTxError as GuestRoundLineError };

/** เปลี่ยน QR ของโต๊ะ (ผู้เรียกตรวจสิทธิ์ restaurant.table.rotateQr แล้ว) — ใช้ rotateQr เดิม · โต๊ะไม่พบ/สาขาอื่น/เก็บถาวร = NO_TABLE */
export async function rotateTableQrForPos(db: Db, s: Scope & { tableId: string }): Promise<{ ok: true; qrToken: string } | { ok: false; code: "NO_TABLE" }> {
  const t = await db.restaurantTable.findFirst({ where: { id: s.tableId, tenantId: s.tenantId, unitId: s.unitId, archivedAt: null }, select: { id: true } });
  if (!t) return { ok: false, code: "NO_TABLE" };
  return { ok: true, qrToken: await rotateQr(s.tenantId, s.unitId, t.id) };
}

/**
 * คำขอจากโต๊ะของแขก (เรียกพนักงาน · ขอเช็คบิล · แจ้งชำระ) — ตัวเขียนเดิม createServiceRequest (กันซ้ำ 2 นาทีในตัว) ลง session ปลายทาง ·
 * ไม่มี session = NO_SESSION ทุกชนิด (POS P2.7 ▸ fix2 R1 F5: ไม่เปิด session ให้ — คำขอต้องผูก session · สติกเกอร์ไม่ทำให้โต๊ะว่างกลายเป็นมีลูกค้า) ◂
 */
export async function guestServiceRequestForPos(
  db: PrismaClient,
  input: Scope & { tableId: string; type: ServiceRequestType; note?: string | null },
): Promise<{ ok: true; sessionId: string } | { ok: false; code: "NO_SESSION" | "NO_TABLE" }> {
  const s = { tenantId: input.tenantId, unitId: input.unitId };
  const target = await targetSessionOf(db, { ...s, tableId: input.tableId });
  if (!target) return { ok: false, code: "NO_SESSION" }; // POS P2.7 ▸ fix2 R1 F5 ◂
  const r = await createServiceRequest(s.tenantId, s.unitId, target.id, input.type, input.note ?? undefined);
  return r.ok ? { ok: true, sessionId: target.id } : { ok: false, code: "NO_SESSION" };
}

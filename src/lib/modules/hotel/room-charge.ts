// SVC H.5 ▸ ลงห้องจาก POS/ร้านอาหาร (ใบสั่ง ledger/svc-briefs/svc-brief-h.5.md §0 §2.3 §2.9 §3.6 · สเปก S §8.3)
//   • โรงแรมไม่แก้ POS: consumer ของ "pos.sale.paid" (มีอยู่) ต่อชั้นนี้ — บิลที่มีแถวจ่าย ROOM_CHARGE ⇒ หาแขก CHECKED_IN ในร้านเดียวกัน (ทุกหน่วย HOTEL)
//     จาก reference ของแถวจ่าย (= เลขห้อง หรือ รหัสจอง) ⇒ POS_CHARGE itemized (บรรทัดของบิล · refType PosSale refId saleId · idempotent ต่อ saleId)
//   • หาไม่ได้/ไม่ CHECKED_IN/folio ปิด/กำกวม ⇒ คิว "บิลลงห้องที่ยังไม่ผูกห้อง" (PosPayment ROOM_CHARGE ที่ไม่มี FolioItem อ้าง — ไม่มีตารางใหม่) +
//     event hotel.folio.charge_unmatched {saleId, unitId, reason} + พนักงานผูกมือ attachRoomCharge
//   • "pos.sale.voided" ⇒ กลับรายการ POS_CHARGE ของบิลนั้นอัตโนมัติ (folio ยังเปิด)
//   • ข้ามร้าน = ไม่พบ (ROOM_NOT_FOUND/NOT_FOUND) · ข้ามหน่วยในร้านเดียวได้ · เลขห้อง/รหัสจองซ้ำหลายหน่วยที่มีแขกพัก ⇒ AMBIGUOUS_ROOM
import { z } from "zod";
import { tenantDb } from "@/lib/core/db";
import { emitOutboxOutsideTx } from "@/lib/core/outbox";
import { reverseRoomChargePosting } from "@/lib/modules/account";
import {
  FolioAbort,
  R,
  auditTx,
  emitFolioTx,
  fail,
  insertItemTx,
  isFolioFail,
  isOpen,
  isRec,
  isStr,
  itemView,
  lockFolio,
  recomputeTx,
  reservationGate,
  unitGate,
  unitTx,
  voidItemTx,
  zodReason,
  type FolioFail,
  type UnitCtx,
} from "./folio";

export type RoomChargeFailCode = "NOT_CHECKED_IN" | "ROOM_NOT_FOUND" | "AMBIGUOUS_ROOM" | "FOLIO_CLOSED" | "DUPLICATE" | "INVALID_INPUT" | "NOT_FOUND" | "FORBIDDEN" | "BUSY";
export type RoomChargeFail = { ok: false; code: RoomChargeFailCode; reason: string };
const rfail = (code: RoomChargeFailCode, reason: string): RoomChargeFail => ({ ok: false, code, reason });
const fromFolio = (f: FolioFail): RoomChargeFail => ({ ok: false, code: f.code === "NOT_ALLOWED" || f.code === "PAY_MISMATCH" ? "INVALID_INPUT" : f.code, reason: f.reason });
const REASON_TH: Record<string, string> = {
  ROOM_NOT_FOUND: "ไม่พบห้องหรือรหัสจองที่มีแขกพักอยู่ตามเลขอ้างอิง",
  NOT_CHECKED_IN: "การจองนี้ยังไม่ได้เช็กอิน",
  AMBIGUOUS_ROOM: "เลขห้อง/รหัสจองซ้ำหลายโรงแรมในร้าน — ระบุโรงแรมให้ชัด",
  FOLIO_CLOSED: "บิลห้องของแขกปิดแล้ว (เช็กเอาต์แล้ว)",
  NO_REFERENCE: "บิลไม่ได้ระบุเลขห้องหรือรหัสจอง",
};
export const roomChargeReasonTh = (code: string): string => REASON_TH[code] ?? "ผูกห้องไม่ได้";
const SYSTEM_ID = "module:hotel";

// ───────────────────────── chargeToRoom (facade · S §8.3) ─────────────────────────
const LineZ = z.object({
  name: z.string().trim().min(1, { message: "ชื่อรายการว่าง" }).max(200),
  qty: z.number().int({ message: "จำนวนต้องเป็นจำนวนเต็ม" }).min(1, { message: "จำนวนต้องตั้งแต่ 1" }).max(1000),
  unitAmountSatang: z.number().int({ message: "ราคาต้องเป็นจำนวนเต็มสตางค์" }).min(0, { message: "ราคาต้องไม่ติดลบ" }).max(100_000_000),
  amountSatang: z.number().int().min(0).max(100_000_000).optional(),
});
const ChargeInput = z.object({
  tenantId: z.string().min(1),
  hotelUnitId: z.string().min(1).optional().nullable(),
  folioRef: z
    .object({ roomNumber: z.string().trim().min(1).max(40).optional(), bookingCode: z.string().trim().min(1).max(60).optional(), reservationId: z.string().min(1).max(200).optional(), reference: z.string().trim().min(1).max(100).optional() })
    .refine((r) => [r.roomNumber, r.bookingCode, r.reservationId, r.reference].filter((x) => x !== undefined).length === 1, { message: "ระบุห้อง รหัสจอง หรือการจองอย่างใดอย่างหนึ่ง" }),
  lines: z.array(LineZ).min(1, { message: "ไม่มีรายการ" }).max(100, { message: "รายการมากเกินไป" }),
  sourceSaleId: z.string().min(1).max(200),
  byUserId: z.string().min(1).max(200).optional().nullable(),
  receiptNo: z.string().max(60).optional().nullable(),
});
export type ChargeToRoomInput = z.input<typeof ChargeInput>;

type Hit = { id: string; unitId: string; status: string };
/** หาแขกจากเลขอ้างอิง (ร้านเดียว · ทุกหน่วย HOTEL หรือหน่วยที่ระบุ) — SQL ระบุ tenantId ตรงทุกคำสั่ง */
async function resolveGuest(tenantId: string, unitIds: string[], ref: { roomNumber?: string; bookingCode?: string; reservationId?: string; reference?: string }): Promise<Hit | RoomChargeFail> {
  const db = tenantDb({ tenantId });
  const byRoom = async (no: string): Promise<Hit | RoomChargeFail | null> => {
    const rows = await db.$queryRaw<Hit[]>`
      SELECT r.id, r."unitId", r.status::text AS status FROM "HotelRoom" h JOIN "HotelReservation" r ON r."roomId" = h.id AND r."tenantId" = h."tenantId"
      WHERE h."tenantId" = ${tenantId} AND h."unitId" = ANY(${unitIds}::text[]) AND h.number = ${no} AND h.active = true AND r.status = 'CHECKED_IN'`;
    if (rows.length > 1) return rfail("AMBIGUOUS_ROOM", REASON_TH.AMBIGUOUS_ROOM!);
    if (rows.length === 1) return rows[0]!;
    const room = await db.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM "HotelRoom" WHERE "tenantId" = ${tenantId} AND "unitId" = ANY(${unitIds}::text[]) AND number = ${no}`;
    return Number(room[0]?.n ?? 0) > 0 ? rfail("ROOM_NOT_FOUND", REASON_TH.ROOM_NOT_FOUND!) : null;
  };
  const byCode = async (code: string): Promise<Hit | RoomChargeFail> => {
    const rows = await db.$queryRaw<Hit[]>`SELECT id, "unitId", status::text AS status FROM "HotelReservation" WHERE "tenantId" = ${tenantId} AND "unitId" = ANY(${unitIds}::text[]) AND code = ${code}`;
    if (!rows.length) return rfail("ROOM_NOT_FOUND", REASON_TH.ROOM_NOT_FOUND!);
    if (rows.length === 1) return rows[0]!;
    const inHouse = rows.filter((r) => r.status === "CHECKED_IN");
    if (inHouse.length === 1) return inHouse[0]!;
    return rfail("AMBIGUOUS_ROOM", REASON_TH.AMBIGUOUS_ROOM!);
  };
  if (ref.reservationId) {
    const rows = await db.$queryRaw<Hit[]>`SELECT id, "unitId", status::text AS status FROM "HotelReservation" WHERE "tenantId" = ${tenantId} AND "unitId" = ANY(${unitIds}::text[]) AND id = ${ref.reservationId} LIMIT 1`;
    return rows[0] ?? rfail("NOT_FOUND", R.notFound);
  }
  if (ref.roomNumber) return (await byRoom(ref.roomNumber)) ?? rfail("ROOM_NOT_FOUND", REASON_TH.ROOM_NOT_FOUND!);
  if (ref.bookingCode) return byCode(ref.bookingCode);
  const r = (ref.reference ?? "").trim();
  if (!r) return rfail("ROOM_NOT_FOUND", REASON_TH.NO_REFERENCE!);
  const room = await byRoom(r);
  if (room && !("ok" in room && room.ok === false && room.code === "ROOM_NOT_FOUND")) return room;
  const code = await byCode(r);
  return "ok" in code && room ? room : code;
}

/** ลงห้อง: บรรทัดของบิลร้าน ⇒ POS_CHARGE ต่อบรรทัด (ใบ §0) · idempotent ต่อ sourceSaleId (ซ้ำ ⇒ DUPLICATE) · ไม่ throw */
export async function chargeToRoom(input: unknown): Promise<{ ok: true; folioItemIds: string[]; reservationId: string; unitId: string } | RoomChargeFail> {
  const p = ChargeInput.safeParse(input);
  if (!p.success) return rfail("INVALID_INPUT", zodReason(p.error));
  const d = p.data;
  const db = tenantDb({ tenantId: d.tenantId });
  const units = await db.businessUnit.findMany({ where: { type: "HOTEL", ...(d.hotelUnitId ? { id: d.hotelUnitId } : {}) }, select: { id: true } });
  if (!units.length) return rfail("NOT_FOUND", R.notFound);
  const hit = await resolveGuest(d.tenantId, units.map((u) => u.id), d.folioRef);
  if ("ok" in hit) return hit;
  const c: UnitCtx = { tenantId: d.tenantId, unitId: hit.unitId };
  const prior = await db.$queryRaw<{ n: bigint }[]>`
    SELECT count(*)::bigint AS n FROM "HotelFolioItem" WHERE "tenantId" = ${d.tenantId} AND type = 'POS_CHARGE' AND "refType" = 'PosSale' AND "refId" = ${d.sourceSaleId}`;
  if (Number(prior[0]?.n ?? 0) > 0) return rfail("DUPLICATE", "บิลนี้ลงห้องไปแล้ว");
  const out = await unitTx(c, async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`hotel-room-charge:${d.tenantId}:${d.sourceSaleId}`}::text))`;
    const again = await tx.$queryRaw<{ n: bigint }[]>`
      SELECT count(*)::bigint AS n FROM "HotelFolioItem" WHERE "tenantId" = ${d.tenantId} AND type = 'POS_CHARGE' AND "refType" = 'PosSale' AND "refId" = ${d.sourceSaleId}`;
    if (Number(again[0]?.n ?? 0) > 0) throw new FolioAbort(fail("NOT_ALLOWED", "DUPLICATE"));
    const rv = await tx.hotelReservation.findFirst({ where: { id: hit.id, tenantId: c.tenantId, unitId: c.unitId }, select: { id: true, status: true } });
    if (!rv) throw new FolioAbort(fail("NOT_FOUND", R.notFound));
    const f = await lockFolio(tx, c, rv.id);
    if (!isOpen(f)) throw new FolioAbort(fail("FOLIO_CLOSED", REASON_TH.FOLIO_CLOSED!));
    if (rv.status !== "CHECKED_IN") throw new FolioAbort(fail("NOT_CHECKED_IN", REASON_TH.NOT_CHECKED_IN!));
    const tag = d.receiptNo ? ` · บิล ${d.receiptNo}` : "";
    const ids: string[] = [];
    const views: ReturnType<typeof itemView>[] = [];
    for (const l of d.lines) {
      const item = await insertItemTx(tx, c, f.id, { type: "POS_CHARGE", description: `${l.name}${tag}`, qty: l.qty, unitAmountSatang: l.unitAmountSatang, amountSatang: l.amountSatang ?? l.qty * l.unitAmountSatang, refType: "PosSale", refId: d.sourceSaleId }, d.byUserId ?? null);
      ids.push(item.id);
      views.push(itemView(item));
    }
    const balance = await recomputeTx(tx, c, f.id);
    await auditTx(tx, c, d.byUserId ?? SYSTEM_ID, "hotel.folio.posted", "HotelReservation", rv.id, null, { via: "chargeToRoom", saleId: d.sourceSaleId, folioId: f.id, items: views, balanceSatang: balance });
    for (const [i, id] of ids.entries()) await emitFolioTx(tx, c, "hotel.folio.posted", id, { reservationId: rv.id, folioId: f.id, itemId: id, saleId: d.sourceSaleId, type: "POS_CHARGE", amountSatang: views[i]!.amountSatang });
    return ids;
  });
  if (isFolioFail(out)) return out.code === "NOT_ALLOWED" ? rfail("DUPLICATE", "บิลนี้ลงห้องไปแล้ว") : fromFolio(out);
  return { ok: true, folioItemIds: out, reservationId: hit.id, unitId: hit.unitId };
}

// ───────────────────────── บิล ROOM_CHARGE ของ POS ─────────────────────────
type RcSale = { id: string; unitId: string; systemId: string; receiptNo: string | null; status: string; billDiscount: number; grand: number; roomCharge: number; reference: string | null };
async function roomChargeSaleOf(tenantId: string, saleId: string): Promise<RcSale | null> {
  const rows = await tenantDb({ tenantId }).$queryRaw<{ id: string; unitId: string; systemId: string; receiptNo: string | null; status: string; billDiscount: number; grand: number; roomCharge: bigint | number | null; reference: string | null }[]>`
    SELECT s.id, s."unitId", s."systemId", s."receiptNo", s.status::text AS status, s."discountSatang" AS "billDiscount", s."grandTotalSatang" AS grand,
      (SELECT sum(p."amountSatang") FROM "PosPayment" p WHERE p."saleId" = s.id AND p.type = 'ROOM_CHARGE') AS "roomCharge",
      (SELECT p.reference FROM "PosPayment" p WHERE p."saleId" = s.id AND p.type = 'ROOM_CHARGE' ORDER BY p."amountSatang" DESC LIMIT 1) AS reference
    FROM "PosSale" s WHERE s.id = ${saleId} AND s."tenantId" = ${tenantId} LIMIT 1`;
  const r = rows[0];
  if (!r || r.roomCharge === null) return null;
  return { ...r, roomCharge: Number(r.roomCharge) };
}
/** บรรทัดของบิล → บรรทัดลงห้อง · บิลมีส่วนลดท้ายบิล/จ่ายลงห้องบางส่วน ⇒ บรรทัดเดียวเท่ายอดที่ลงห้อง (ไม่เกินเงินที่ลงห้องจริง) */
async function chargeLinesOf(tenantId: string, s: RcSale): Promise<{ name: string; qty: number; unitAmountSatang: number; amountSatang: number }[]> {
  const lines = await tenantDb({ tenantId }).$queryRaw<{ name: string; qty: number; unitPriceSatang: number; lineTotalSatang: number }[]>`
    SELECT name, qty, "unitPriceSatang", "lineTotalSatang" FROM "PosSaleLine" WHERE "saleId" = ${s.id} AND "tenantId" = ${tenantId} ORDER BY id`;
  const sum = lines.reduce((t, l) => t + l.lineTotalSatang, 0);
  if (lines.length && sum === s.roomCharge && s.billDiscount === 0) return lines.map((l) => ({ name: l.name, qty: l.qty, unitAmountSatang: l.unitPriceSatang, amountSatang: l.lineTotalSatang }));
  return [{ name: `บิลร้านค้า${s.receiptNo ? ` ${s.receiptNo}` : ""} (ลงห้อง)`, qty: 1, unitAmountSatang: s.roomCharge, amountSatang: s.roomCharge }];
}

async function emitUnmatched(tenantId: string, s: RcSale, code: string): Promise<void> {
  await emitOutboxOutsideTx({ tenantId, unitId: s.unitId, systemId: s.systemId, type: "hotel.folio.charge_unmatched", idempotencyKey: `hotel.folio.charge_unmatched#${s.id}`, payload: { tenantId, unitId: s.unitId, saleId: s.id, reason: code } });
}

/** consumer ชั้นโรงแรมของ "pos.sale.paid" (ต่อท้าย chain · ล้มไม่ล้ม consumer อื่น — outbox-consumers ห่อ try/catch) */
export async function onPosSalePaidRoomCharge(evt: { tenantId: string; payload: unknown }): Promise<void> {
  const saleId = isRec(evt.payload) && isStr(evt.payload.saleId) ? evt.payload.saleId : null;
  if (!saleId) return;
  const s = await roomChargeSaleOf(evt.tenantId, saleId);
  if (!s || s.status !== "PAID" || s.roomCharge <= 0) return;
  const r = await chargeToRoom({ tenantId: evt.tenantId, folioRef: { reference: (s.reference ?? "").trim() || "-" }, lines: await chargeLinesOf(evt.tenantId, s), sourceSaleId: s.id, receiptNo: s.receiptNo });
  if (r.ok) return;
  if (r.code === "DUPLICATE") {
    // ลงห้องแล้ว — ถ้า folio ปิดบิลไปแล้ว (บิลร้านลงบัญชีทีหลังบิลเช็กเอาต์) ⇒ กันรายได้ซ้ำให้ (idempotent)
    const settled = await tenantDb({ tenantId: evt.tenantId }).$queryRaw<{ settledSaleId: string | null }[]>`
      SELECT f."settledSaleId" FROM "HotelFolioItem" i JOIN "HotelFolio" f ON f.id = i."folioId"
      WHERE i."tenantId" = ${evt.tenantId} AND i.type = 'POS_CHARGE' AND i."refType" = 'PosSale' AND i."refId" = ${s.id} AND i."voidedAt" IS NULL AND f.status = 'SETTLED' LIMIT 1`;
    const settleSaleId = settled[0]?.settledSaleId;
    if (settleSaleId) await reverseRoomChargePosting({ tenantId: evt.tenantId, posSystemId: s.systemId, saleId: s.id, settleSaleId, reason: "รวมเข้าบิลเช็กเอาต์ของโรงแรมแล้ว" });
    return;
  }
  await emitUnmatched(evt.tenantId, s, r.code === "NOT_FOUND" ? "ROOM_NOT_FOUND" : r.code);
}

/** consumer ชั้นโรงแรมของ "pos.sale.voided": บิลร้านที่ลงห้องถูก void ⇒ กลับรายการ POS_CHARGE (folio ยังเปิด · idempotent) */
export async function onPosSaleVoidedRoomCharge(evt: { tenantId: string; payload: unknown }): Promise<void> {
  const saleId = isRec(evt.payload) && isStr(evt.payload.saleId) ? evt.payload.saleId : null;
  if (!saleId) return;
  const rows = await tenantDb({ tenantId: evt.tenantId }).$queryRaw<{ unitId: string; reservationId: string }[]>`
    SELECT DISTINCT i."unitId", f."reservationId" FROM "HotelFolioItem" i JOIN "HotelFolio" f ON f.id = i."folioId"
    WHERE i."tenantId" = ${evt.tenantId} AND i.type = 'POS_CHARGE' AND i."refType" = 'PosSale' AND i."refId" = ${saleId} AND i."voidedAt" IS NULL`;
  for (const r of rows) {
    const c = { tenantId: evt.tenantId, unitId: r.unitId };
    const out = await unitTx(c, async (tx) => {
      const f = await lockFolio(tx, c, r.reservationId);
      if (!isOpen(f)) return 0;
      const items = await tx.hotelFolioItem.findMany({ where: { folioId: f.id, type: "POS_CHARGE", refType: "PosSale", refId: saleId, voidedAt: null } });
      for (const it of items) {
        const rev = await voidItemTx(tx, c, it, "ร้านต้นทางยกเลิกบิล (POS)", null);
        await emitFolioTx(tx, c, "hotel.folio.voided", it.id, { reservationId: r.reservationId, folioId: f.id, itemId: it.id, reversalId: rev.id, saleId, type: it.type, amountSatang: it.amountSatang });
      }
      if (items.length) {
        await recomputeTx(tx, c, f.id);
        await auditTx(tx, c, SYSTEM_ID, "hotel.folio.voided", "HotelReservation", r.reservationId, { saleId, items: items.map(itemView) }, { voided: items.length, reason: "ร้านต้นทางยกเลิกบิล (POS)" });
      }
      return items.length;
    });
    if (isFolioFail(out)) throw new Error(`กลับรายการลงห้องของบิลที่ถูกยกเลิกไม่สำเร็จ (${out.code})`);
    if (out === 0) console.warn(`[hotel.room-charge] tenant=${evt.tenantId} sale=${saleId}: บิลร้านถูกยกเลิกหลังบิลห้องปิดแล้ว — ให้ผู้จัดการตรวจ`);
  }
}

// ───────────────────────── คิวบิลลงห้องที่ยังไม่ผูกห้อง ─────────────────────────
export type UnmatchedRow = { saleId: string; receiptNo: string | null; amountSatang: number; reference: string | null; paidAt: string; reason: string; reasonCode: string };
const ListInput = z.object({ unitId: z.string().min(1).max(200) });
export async function listUnmatchedRoomCharges(actorIn: unknown, ctx: unknown, input: unknown): Promise<{ ok: true; rows: UnmatchedRow[] } | RoomChargeFail> {
  const p = ListInput.safeParse(input);
  if (!p.success) return rfail("NOT_FOUND", R.notFound);
  const g = await unitGate(actorIn, ctx, p.data.unitId, ["hotel.folio.post", "hotel.booking.manage"]);
  if (isFolioFail(g)) return fromFolio(g);
  return { ok: true, rows: await unmatchedFor(g.tenantId, g.unitId) };
}
/** จำนวน (badge หน้าเคาน์เตอร์) — อ่านอย่างเดียว */
export async function countUnmatchedRoomCharges(actorIn: unknown, ctx: unknown, input: unknown): Promise<number> {
  const r = await listUnmatchedRoomCharges(actorIn, ctx, input);
  return r.ok ? r.rows.length : 0;
}
async function unmatchedFor(tenantId: string, unitId: string): Promise<UnmatchedRow[]> {
  const db = tenantDb({ tenantId });
  const sys = await db.appSystemUnit.findFirst({ where: { unitId, type: "POS" }, select: { systemId: true } });
  if (!sys) return [];
  const rows = await db.$queryRaw<{ saleId: string; receiptNo: string | null; amountSatang: bigint | number; reference: string | null; paidAt: Date }[]>`
    SELECT s.id AS "saleId", s."receiptNo", sum(p."amountSatang") AS "amountSatang", max(p.reference) AS reference, s."paidAt"
    FROM "PosPayment" p JOIN "PosSale" s ON s.id = p."saleId"
    WHERE p."tenantId" = ${tenantId} AND s."tenantId" = ${tenantId} AND p.type = 'ROOM_CHARGE' AND s.status = 'PAID' AND s."systemId" = ${sys.systemId}
      AND NOT EXISTS (SELECT 1 FROM "HotelFolioItem" f WHERE f."tenantId" = ${tenantId} AND f."refType" = 'PosSale' AND f."refId" = s.id)
    GROUP BY s.id, s."receiptNo", s."paidAt" ORDER BY s."paidAt" DESC LIMIT 200`;
  if (!rows.length) return [];
  const evs = await db.outboxEvent.findMany({ where: { type: "hotel.folio.charge_unmatched", idempotencyKey: { in: rows.map((r) => `hotel.folio.charge_unmatched#${r.saleId}`) } }, select: { payload: true } });
  const why = new Map<string, string>();
  for (const e of evs) if (isRec(e.payload) && isStr(e.payload.saleId) && isStr(e.payload.reason)) why.set(e.payload.saleId, e.payload.reason);
  return rows.map((r) => {
    const code = why.get(r.saleId) ?? "ROOM_NOT_FOUND";
    return { saleId: r.saleId, receiptNo: r.receiptNo, amountSatang: Number(r.amountSatang), reference: r.reference, paidAt: r.paidAt.toISOString(), reason: roomChargeReasonTh(code), reasonCode: code };
  });
}

// ───────────────────────── ผูกมือ ─────────────────────────
const AttachInput = z.object({ saleId: z.string().min(1).max(200), reservationId: z.string().min(1).max(200) });
export async function attachRoomCharge(actorIn: unknown, ctx: unknown, input: unknown): Promise<{ ok: true; folioItemIds: string[] } | RoomChargeFail> {
  const g = await reservationGate(actorIn, ctx, input, ["hotel.folio.post"]);
  if (isFolioFail(g)) return fromFolio(g);
  const p = AttachInput.safeParse(input);
  if (!p.success) return rfail("INVALID_INPUT", zodReason(p.error));
  const s = await roomChargeSaleOf(g.tenantId, p.data.saleId);
  if (!s) return rfail("INVALID_INPUT", "บิลนี้ไม่ได้จ่ายแบบลงห้อง (ไม่มีแถวชำระลงห้อง) — ผูกกับการจองไม่ได้");
  if (s.status !== "PAID") return rfail("INVALID_INPUT", "บิลนี้ถูกยกเลิก/คืนเงินแล้ว — ผูกกับการจองไม่ได้");
  const r = await chargeToRoom({ tenantId: g.tenantId, hotelUnitId: g.unitId, folioRef: { reservationId: g.rv.id }, lines: await chargeLinesOf(g.tenantId, s), sourceSaleId: s.id, byUserId: g.actor.userId, receiptNo: s.receiptNo });
  if (!r.ok) return r;
  const c = { tenantId: g.tenantId, unitId: g.unitId };
  await unitTx(c, async (tx) => {
    await auditTx(tx, c, g.actor.userId, "hotel.folio.attached", "HotelReservation", g.rv.id, { unmatched: true }, { saleId: s.id, folioItemIds: r.folioItemIds });
    return null;
  });
  return { ok: true, folioItemIds: r.folioItemIds };
}
// ◂ SVC H.5

// SVC H.4 ▸ เช็กอิน V2 (ใบสั่ง ledger/svc-briefs/svc-brief-h.4.md §0 §2 §3.1 · สเปก S §7.4) — ธุรกรรมเดียว:
//   CONFIRMED (+ BOOKED แถวเก่า) · วันเข้า ≤ วันนี้ไทย (ก่อนวัน = earlyOverride ของผู้มี hotel.booking.manage + AuditLog) → ห้องของประเภทที่ว่างจริงทั้งช่วง
//   ค่าเริ่มเฉพาะ CLEAN (INSPECTED เมื่อ inspectionRequired) · ห้องยังไม่พร้อม = force {reason} (manage) + AuditLog + HousekeepingLog
//   → ทะเบียนผู้พัก ≥ 1 คน (ร.ร.3 · GUEST_REQUIRED เว้นแต่ปิด requireRegistration) · จำนวนผู้พัก ≤ maxOccupancy (เกิน = occupancyOverride ของ manage)
//   → CHECKED_IN · checkedInAt · occupancy HOLD→STAY / ย้ายห้อง / ถือใหม่ (facade rooms · EXCLUDE ของฐานตัดสินห้องชน · X3) · nights.roomId · ห้อง OCCUPIED
//   → outbox hotel.checked_in {reservationId, roomId, guests, foreigners} (ไม่มี PII) · ตม.30 ของต่างด้าว PENDING ครบกำหนด checkedInAt + 24 ชม.
//   มัดจำค้าง ⇒ ผ่าน + needsDeposit (จอบังคับรับ · มติ §9 ข้อ 5) · เงินประกัน = ขั้นแยกหลัง CHECKED_IN (needsSecurityDeposit · มติ 6) · สมาชิก opt-in หลัง commit
//   ลำดับล็อกเดียวกับ booking.ts: ประเภทห้อง (advisory) → แถว reservation (CAS) → occupancy ⇒ ไม่มี 40P01 · หลุด = BUSY
//   นาฬิกาฉาก: input.at ใช้เฉพาะเมื่อ process.env.SVC_QC_CLOCK === "1" (อ่านในฟังก์ชันทุกครั้ง)
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { emitOutbox } from "@/lib/core/outbox";
import { bkkYmd } from "@/lib/core/quiet-hours";
import { claimRoom, moveOccupancy, releaseOccupancy } from "@/lib/modules/rooms";
import { systemForUnit } from "@/lib/modules/system/service";
import { isSellableNightly } from "./availability";
import {
  GUEST_TX,
  GuestAbort,
  R,
  dropGuestFile,
  gfail,
  guestGate,
  guestSettings,
  hasRequiredGuestFields,
  insertGuestTx,
  isGuestFail,
  isManagerRole,
  isRec,
  isStr,
  isTxBusy,
  prepareGuest,
  tenantOf,
  tm30Initial,
  unitOfReservation,
  uploadGuestFile,
  ymdOfDb,
  zodReason,
  canDo,
  type GuestFail,
  type GuestGate,
  type GuestSettings,
  type PreparedGuest,
} from "./guest";

type Tx = Prisma.TransactionClient;
const HOTEL_REF = "HotelReservation";
const TM30_WINDOW_MS = 24 * 3_600_000;
/**
 * 🔴 ข้อแย้ง oracle (wo-notes svc-h.4 §3 · ผู้คุมตัดสิน): `service.checkIn` เดิม (ไม่มีผู้กระทำ/ไม่มีผู้พัก) ถูกเรียกโดยฉาก h.2/h.3 · qc-svc-r0.8 · qc-svc-h.5
 * ซึ่งคาดว่าเช็กอินสำเร็จโดยไม่มีทะเบียน ⇒ ทางเดิมคงพฤติกรรมเดิม (ไม่บังคับทะเบียน · ไม่ตรวจวันเข้า/แม่บ้าน) · เปลี่ยนเป็น true = บังคับ GUEST_REQUIRED ตามใบ §1
 */
const LEGACY_REQUIRES_GUEST = false;

export type CheckInCode = "NOT_CONFIRMED" | "TOO_EARLY" | "ROOM_TAKEN" | "ROOM_DIRTY" | "ROOM_INACTIVE" | "GUEST_REQUIRED" | "OVER_OCCUPANCY" | "INVALID_ID" | "NOT_FOUND" | "FORBIDDEN";
export type CheckInOk = { ok: true; checkedInAt: string; guestIds: string[]; needsDeposit: boolean; needsSecurityDeposit: boolean; tm30DueAt: string | null; roomId: string; customerId: string | null };
export type AssignableRoom = { roomId: string; number: string; hkStatus: string; sellable: boolean; reason?: string };

const REASON = z.object({ reason: z.string({ error: "ระบุเหตุผล" }).trim().min(3, "ระบุเหตุผลอย่างน้อย 3 ตัวอักษร").max(300, "เหตุผลยาวเกิน 300 ตัวอักษร") });
const CheckInZ = z.object({
  reservationId: z.string().min(1).max(64),
  roomId: z.string({ error: "เลือกห้องที่จะเข้าพัก" }).min(1, "เลือกห้องที่จะเข้าพัก").max(64),
  force: REASON.optional().nullable(),
  earlyOverride: REASON.optional().nullable(),
  occupancyOverride: REASON.optional().nullable(),
  guests: z.array(z.unknown()).max(20, "ลงทะเบียนได้ครั้งละไม่เกิน 20 คน").optional(),
  memberOptIn: z
    .object({
      phone: z.string().trim().max(30).optional().nullable(),
      email: z.string().trim().max(200).optional().nullable(),
      consents: z.array(z.string().max(40)).max(10),
    })
    .optional()
    .nullable(),
  at: z.string().optional(),
});

/** นาฬิกา: at เฉพาะใต้ SVC_QC_CLOCK=1 */
function clockOf(input: unknown): Date {
  if (process.env.SVC_QC_CLOCK === "1" && isRec(input) && typeof input.at === "string") {
    const d = new Date(input.at);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}
const hkReady = (hk: string, inspectionRequired: boolean): boolean => (inspectionRequired ? hk === "INSPECTED" : hk === "CLEAN" || hk === "INSPECTED");
const HK_TH: Record<string, string> = { CLEAN: "สะอาด", DIRTY: "รอทำความสะอาด", INSPECTED: "ตรวจแล้ว", OUT_OF_ORDER: "ปิดซ่อม" };

// ───────────────────────── assignableRooms ─────────────────────────
/**
 * ห้องของประเภทเดียวกับการจองพร้อมสถานะ (ย้ายจาก P1 + เงื่อนไขแม่บ้าน) — sellable = ว่างทั้งช่วง + ขายรายคืนได้ + แม่บ้านพร้อม
 * ไม่พร้อม = sellable false + reason ไทย (เลือกได้ด้วย force) · ข้ามร้าน/หน่วยอื่น ⇒ NOT_FOUND · ผู้เรียก (หน้า) ตรวจสิทธิ์ก่อน
 */
export async function assignableRooms(ctx: unknown, input: unknown): Promise<AssignableRoom[] | GuestFail> {
  const tenantId = tenantOf(ctx);
  if (!tenantId || !isRec(input)) return gfail("NOT_FOUND", R.notFound);
  const unitId = await unitOfReservation(tenantId, input.reservationId);
  if (!unitId) return gfail("NOT_FOUND", R.notFound);
  const unit = await tenantDb({ tenantId }).businessUnit.findFirst({ where: { id: unitId, type: "HOTEL" }, select: { id: true } });
  if (!unit) return gfail("NOT_FOUND", R.notFound);
  const c = { tenantId, unitId };
  const db = tenantDb(c);
  const rv = await db.hotelReservation.findFirst({ where: { id: String(input.reservationId) }, select: { id: true, roomTypeId: true, checkInDate: true, checkOutDate: true } });
  if (!rv) return gfail("NOT_FOUND", R.notFound);
  const st = await guestSettings(tenantId, unitId);
  const rooms = await db.hotelRoom.findMany({
    where: { roomTypeId: rv.roomTypeId, active: true },
    orderBy: { number: "asc" },
    select: { id: true, number: true, active: true, status: true, hkStatus: true, rentMode: true, roomType: { select: { rentMode: true } } },
  });
  const now = new Date();
  const occ = rooms.length
    ? await db.roomOccupancy.findMany({ where: { active: true, roomId: { in: rooms.map((r) => r.id) }, startDate: { lt: rv.checkOutDate }, endDate: { gt: rv.checkInDate } }, select: { roomId: true, kind: true, holdExpiresAt: true, refType: true, refId: true } })
    : [];
  const busy = new Set(occ.filter((o) => !((o.kind === "HOLD" || o.kind === "CHANNEL_HOLD") && o.holdExpiresAt && o.holdExpiresAt <= now)).filter((o) => !(o.refType === HOTEL_REF && o.refId === rv.id)).map((o) => o.roomId));
  return rooms.map((r): AssignableRoom => {
    const sellableNightly = isSellableNightly({ active: r.active, status: r.status, hkStatus: r.hkStatus, rentMode: r.rentMode, typeRentMode: r.roomType.rentMode });
    if (!sellableNightly) return { roomId: r.id, number: r.number, hkStatus: r.hkStatus, sellable: false, reason: r.hkStatus === "OUT_OF_ORDER" || r.status === "OOO" ? "ห้องปิดซ่อมอยู่" : "ห้องนี้ไม่เปิดขายรายคืน" };
    if (busy.has(r.id)) return { roomId: r.id, number: r.number, hkStatus: r.hkStatus, sellable: false, reason: "ห้องนี้มีผู้เข้าพักหรือถูกจองในช่วงนี้แล้ว" };
    if (!hkReady(r.hkStatus, st.inspectionRequired))
      return { roomId: r.id, number: r.number, hkStatus: r.hkStatus, sellable: false, reason: st.inspectionRequired ? `แม่บ้านยังไม่ตรวจห้อง (${HK_TH[r.hkStatus] ?? r.hkStatus}) — ต้องตรวจก่อนให้เข้าพัก` : `ห้องยังไม่พร้อม (${HK_TH[r.hkStatus] ?? r.hkStatus})` };
    return { roomId: r.id, number: r.number, hkStatus: r.hkStatus, sellable: true };
  });
}

// ───────────────────────── checkInV2 ─────────────────────────
type CoreOpts = { legacy: boolean };
async function checkInCore(g: GuestGate | { tenantId: string; unitId: string; unitName: string; actor: null }, input: unknown, o: CoreOpts): Promise<CheckInOk | GuestFail> {
  const p = CheckInZ.safeParse(input);
  if (!p.success) return gfail("INVALID_INPUT", zodReason(p.error));
  const d = p.data;
  const actor = g.actor;
  if (actor && (d.force || d.earlyOverride || d.occupancyOverride) && !canDo({ actor, unitId: g.unitId }, "hotel.booking.manage"))
    return gfail("FORBIDDEN", "ข้ามเงื่อนไข (ห้องยังไม่พร้อม · เข้าก่อนวัน · ผู้พักเกิน) ต้องมีสิทธิ์จัดการการจอง");
  if (d.memberOptIn && !d.memberOptIn.phone && !d.memberOptIn.email) return gfail("INVALID_INPUT", "ผูกสมาชิกต้องมีเบอร์โทรหรืออีเมลของแขก");
  const c = { tenantId: g.tenantId, unitId: g.unitId };
  const db = tenantDb(c);
  const rv = await db.hotelReservation.findFirst({
    where: { id: d.reservationId },
    select: { id: true, status: true, roomTypeId: true, roomId: true, checkInDate: true, checkOutDate: true, depositSatang: true, depositPaidAt: true, source: true, securityDepositSaleId: true, code: true, groupId: true, roomType: { select: { capacity: true, maxOccupancy: true } } },
  });
  if (!rv) return gfail("NOT_FOUND", R.notFound);
  if (rv.status !== "CONFIRMED" && rv.status !== "BOOKED") return gfail("NOT_CONFIRMED", rv.status === "CHECKED_IN" ? "การจองนี้เช็กอินไปแล้ว" : "เช็กอินได้เฉพาะการจองที่ยืนยันแล้ว");
  const now = o.legacy ? new Date() : clockOf(input);
  const today = bkkYmd(now);
  if (!o.legacy && ymdOfDb(rv.checkInDate) > today && !d.earlyOverride) return gfail("TOO_EARLY", `ยังไม่ถึงวันเข้าพัก (${ymdOfDb(rv.checkInDate)}) — เช็กอินก่อนวันต้องให้ผู้จัดการยืนยันพร้อมเหตุผล`);
  const st: GuestSettings = await guestSettings(g.tenantId, g.unitId);

  // ── ทะเบียนผู้พัก (ร.ร.3) ──
  const rawGuests = d.guests ?? [];
  const existing = await db.hotelGuestRecord.count({ where: { reservationId: rv.id } });
  const needGuest = st.requireRegistration && (!o.legacy || LEGACY_REQUIRES_GUEST);
  if (needGuest && rawGuests.length === 0 && existing === 0) return gfail("GUEST_REQUIRED", "ลงทะเบียนผู้เข้าพักหลักก่อนเช็กอิน (ชื่อ · สัญชาติ · ชนิดและเลขเอกสาร) — พ.ร.บ.โรงแรม ม.35");
  if (rawGuests.length && !hasRequiredGuestFields(rawGuests[0]) && existing === 0) return gfail("GUEST_REQUIRED", "ผู้เข้าพักหลักต้องกรอกชื่อ · สัญชาติ · ชนิดและเลขเอกสารให้ครบ");
  const prepared: PreparedGuest[] = [];
  for (const raw of rawGuests) {
    const pg = prepareGuest(raw, st.keepIdImageDefault, today);
    if (isGuestFail(pg)) return pg;
    prepared.push(pg);
  }
  const total = existing + prepared.length;
  const cap = rv.roomType.maxOccupancy ?? rv.roomType.capacity;
  if (total > cap && !d.occupancyOverride) return gfail("OVER_OCCUPANCY", `ห้องประเภทนี้พักได้สูงสุด ${cap} คน (ลงทะเบียน ${total} คน) — เกินต้องให้ผู้จัดการยืนยันพร้อมเหตุผล`);

  // ── ห้อง ──
  const room = await db.hotelRoom.findFirst({ where: { id: d.roomId }, select: { id: true, number: true, active: true, status: true, hkStatus: true, roomTypeId: true, rentMode: true, roomType: { select: { rentMode: true } } } });
  if (!room) return gfail("NOT_FOUND", "ไม่พบห้องนี้ในโรงแรม");
  if (room.roomTypeId !== rv.roomTypeId) return gfail("INVALID_INPUT", `ห้อง ${room.number} ไม่ตรงประเภทของการจอง — เปลี่ยนประเภทใช้ "ย้ายห้อง"`);
  if (!isSellableNightly({ active: room.active, status: room.status, hkStatus: room.hkStatus, rentMode: room.rentMode, typeRentMode: room.roomType.rentMode })) return gfail("ROOM_INACTIVE", `ห้อง ${room.number} ปิดใช้งาน/ปิดซ่อมอยู่`);
  const ready = hkReady(room.hkStatus, st.inspectionRequired);
  if (!o.legacy && !ready && !d.force) return gfail("ROOM_DIRTY", `ห้อง ${room.number} ยังไม่พร้อม (${HK_TH[room.hkStatus] ?? room.hkStatus}) — เลือกห้องอื่น หรือให้ผู้จัดการยืนยันพร้อมเหตุผล`);

  // ── ไฟล์รูปเอกสาร (อัปก่อน tx · tx ล้ม ⇒ ลบทิ้ง) ──
  const files: (string | null)[] = [];
  for (const pg of prepared) {
    if (pg.image && pg.keepImage) {
      const up = await uploadGuestFile(g.tenantId, pg.image, "doc");
      if (isGuestFail(up)) {
        for (const f of files) await dropGuestFile(g.tenantId, f);
        return up;
      }
      files.push(up.fileId);
    } else files.push(null);
  }
  const actorId = actor?.userId ?? null;
  const ci = ymdOfDb(rv.checkInDate);
  const co = ymdOfDb(rv.checkOutDate);
  try {
    const out = await db.$transaction(async (t) => {
      const tx = t as unknown as Tx;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${c.unitId}::text || ':' || ${rv.roomTypeId}::text))`;
      const cas = await tx.hotelReservation.updateMany({ where: { id: rv.id, tenantId: c.tenantId, unitId: c.unitId, status: { in: ["CONFIRMED", "BOOKED"] } }, data: { status: "CHECKED_IN", roomId: room.id, checkedInAt: now } });
      if (cas.count === 0) throw new GuestAbort(gfail("NOT_CONFIRMED", "สถานะการจองเปลี่ยนแล้ว (ถูกยกเลิก/เช็กอินไปแล้ว) — โหลดใหม่"));
      const occ = await tx.roomOccupancy.findMany({ where: { tenantId: c.tenantId, unitId: c.unitId, refType: HOTEL_REF, refId: rv.id, active: true }, select: { id: true, roomId: true, kind: true, startDate: true, endDate: true } });
      const taken = () => new GuestAbort(gfail("ROOM_TAKEN", `ห้อง ${room.number} มีผู้เข้าพักหรือถูกจองในช่วงนี้แล้ว — เลือกห้องอื่น`));
      const inactive = () => new GuestAbort(gfail("ROOM_INACTIVE", `ห้อง ${room.number} รับการเข้าพักนี้ไม่ได้`));
      if (!occ.length) {
        const r = await claimRoom(tx, { ...c, roomId: room.id, start: ci, end: co, kind: "STAY", refType: HOTEL_REF, refId: rv.id, requireRentMode: "NIGHTLY" });
        if (!r.ok) throw r.code === "ROOM_TAKEN" ? taken() : inactive();
      } else {
        for (const x of occ) {
          if (x.roomId !== room.id) {
            const m = await moveOccupancy(tx, { ...c, occupancyId: x.id, toRoomId: room.id });
            if (!m.ok) throw m.code === "ROOM_TAKEN" ? taken() : inactive();
          }
          if (x.kind !== "STAY") {
            await releaseOccupancy(tx, { ...c, occupancyId: x.id, reason: "เช็กอิน" });
            const r = await claimRoom(tx, { ...c, roomId: room.id, start: ymdOfDb(x.startDate), end: ymdOfDb(x.endDate), kind: "STAY", refType: HOTEL_REF, refId: rv.id, requireRentMode: "NIGHTLY" });
            if (!r.ok) throw r.code === "ROOM_TAKEN" ? taken() : inactive();
          }
        }
      }
      await tx.hotelBookingNight.updateMany({ where: { tenantId: c.tenantId, unitId: c.unitId, reservationId: rv.id, counted: true }, data: { roomId: room.id } });
      await tx.hotelRoom.update({ where: { id: room.id }, data: { status: "OCCUPIED" } });
      if (!ready && actor) {
        await tx.hotelHousekeepingLog.create({ data: { tenantId: c.tenantId, unitId: c.unitId, roomId: room.id, fromStatus: room.hkStatus, toStatus: room.hkStatus, byUserId: actorId, reservationId: rv.id, note: `เช็กอินทั้งที่ห้องยังไม่พร้อม: ${d.force?.reason ?? ""}`.slice(0, 500) } });
      }
      // ทะเบียน: แถวใหม่ + แถวที่ลงทะเบียนล่วงหน้า (ตม.30 ครบกำหนดนับจากเวลาเข้าพัก)
      const ids: string[] = [];
      for (let i = 0; i < prepared.length; i++) {
        const pg = prepared[i]!;
        ids.push(
          await insertGuestTx(tx, c, rv, pg, {
            actorId: actorId ?? "module:hotel",
            imageFileId: files[i] ?? null,
            tm30: tm30Initial(pg.nationality, st.tm30Enabled, now),
            retainYears: st.retainYears,
            signedAt: null,
            via: "CHECK_IN",
          }),
        );
      }
      if (st.tm30Enabled) await tx.hotelGuestRecord.updateMany({ where: { reservationId: rv.id, isForeigner: true, tm30Status: "PENDING", tm30DueAt: null }, data: { tm30DueAt: new Date(now.getTime() + TM30_WINDOW_MS) } });
      const all = await tx.hotelGuestRecord.findMany({ where: { reservationId: rv.id }, select: { isForeigner: true, tm30Status: true, tm30DueAt: true } });
      const foreigners = all.filter((x) => x.isForeigner).length;
      const dues = all.filter((x) => x.tm30Status === "PENDING" && x.tm30DueAt).map((x) => x.tm30DueAt!.getTime());
      await emitOutbox(tx, {
        tenantId: c.tenantId,
        unitId: c.unitId,
        type: "hotel.checked_in",
        idempotencyKey: `hotel.checked_in#${rv.id}#${now.getTime()}`,
        payload: { tenantId: c.tenantId, unitId: c.unitId, reservationId: rv.id, roomId: room.id, guests: all.length, foreigners },
      });
      await tx.auditLog.create({
        data: {
          tenantId: c.tenantId,
          unitId: c.unitId,
          actorType: actor ? "USER" : "SYSTEM",
          actorId: actorId ?? "module:hotel",
          action: "hotel.reservation.checked_in",
          targetType: "HotelReservation",
          targetId: rv.id,
          before: { status: rv.status, roomId: rv.roomId },
          after: {
            status: "CHECKED_IN",
            roomId: room.id,
            roomNumber: room.number,
            guests: all.length,
            foreigners,
            ...(o.legacy ? { via: "LEGACY_CHECKIN" } : {}),
            ...(!ready ? { force: { reason: d.force?.reason ?? null, hkStatus: room.hkStatus } } : {}),
            ...(d.earlyOverride && ci > today ? { earlyOverride: { reason: d.earlyOverride.reason, checkIn: ci, today } } : {}),
            ...(d.occupancyOverride && total > cap ? { occupancyOverride: { reason: d.occupancyOverride.reason, cap, guests: total } } : {}),
          },
        },
      });
      return { ids, dueAt: dues.length ? new Date(Math.min(...dues)).toISOString() : null };
    }, GUEST_TX);
    // ── สมาชิก opt-in (หลัง commit · ไม่ทำให้เช็กอินล้ม) ──
    let customerId: string | null = null;
    if (d.memberOptIn && (d.memberOptIn.phone || d.memberOptIn.email)) customerId = await linkMember(c, rv.id, d.memberOptIn, prepared[0]?.fullName ?? null);
    const secNeeded = st.secDepEnabled && st.secDepAmount > 0 && (st.secDepAppliesTo !== "WALK_IN" || rv.source === "WALK_IN") && !rv.securityDepositSaleId;
    return {
      ok: true,
      checkedInAt: now.toISOString(),
      guestIds: out.ids,
      needsDeposit: rv.depositSatang > 0 && !rv.depositPaidAt,
      needsSecurityDeposit: secNeeded,
      tm30DueAt: out.dueAt,
      roomId: room.id,
      customerId,
    };
  } catch (e) {
    for (const f of files) await dropGuestFile(g.tenantId, f);
    if (e instanceof GuestAbort) return e.result;
    if (isTxBusy(e)) return gfail("BUSY", R.busy);
    throw e;
  }
}

/** ผูกสมาชิกเมื่อแขกยินยอม (S §8.6): ระบบสมาชิกที่ผูกหน่วย · findOrCreate source STAFF · ไม่มีระบบ = ข้าม · ล้ม = ข้าม (ไม่ทำให้เช็กอินล้ม) */
async function linkMember(c: { tenantId: string; unitId: string }, reservationId: string, opt: { phone?: string | null; email?: string | null; consents: string[] }, name: string | null): Promise<string | null> {
  try {
    const memberSystemId = await systemForUnit(c.tenantId, c.unitId, "MEMBER");
    if (!memberSystemId) return null;
    const member = await import("@/lib/modules/member");
    const cust = await member.findOrCreate({ tenantId: c.tenantId, memberSystemId, ...(opt.phone ? { phone: opt.phone } : {}), ...(opt.email ? { email: opt.email } : {}), ...(name ? { name } : {}), source: "STAFF", consents: opt.consents });
    if (!cust?.id) return null;
    await tenantDb(c).hotelReservation.updateMany({ where: { id: reservationId }, data: { customerId: cust.id } });
    return cust.id;
  } catch {
    return null;
  }
}

/**
 * เช็กอิน V2 (สิทธิ์ hotel.reservation.checkIn · ข้ามเงื่อนไข = hotel.booking.manage) — ดูหัวไฟล์
 * ผล: { ok, checkedInAt, guestIds, needsDeposit, needsSecurityDeposit, tm30DueAt } | { ok:false, code, reason }
 */
export async function checkInV2(actorIn: unknown, ctx: unknown, input: unknown): Promise<CheckInOk | GuestFail> {
  const tenantId = tenantOf(ctx);
  if (!tenantId || !isRec(input)) return gfail("NOT_FOUND", R.notFound);
  const unitId = await unitOfReservation(tenantId, input.reservationId);
  const g = await guestGate(actorIn, ctx, unitId, ["hotel.reservation.checkIn"]);
  if (isGuestFail(g)) return g;
  return checkInCore(g, input, { legacy: false });
}

/** ทางเดิมของ P1 (`service.checkIn`) — ไม่มีผู้กระทำ · ดู LEGACY_REQUIRES_GUEST */
export async function checkInV2Legacy(tenantId: string, unitId: string, reservationId: string, roomId: string): Promise<CheckInOk | GuestFail> {
  if (!isStr(tenantId) || !isStr(unitId)) return gfail("NOT_FOUND", R.notFound);
  const unit = await tenantDb({ tenantId }).businessUnit.findFirst({ where: { id: unitId, type: "HOTEL" }, select: { id: true, name: true } });
  if (!unit) return gfail("NOT_FOUND", R.notFound);
  if ((await unitOfReservation(tenantId, reservationId)) !== unit.id) return gfail("NOT_FOUND", R.notFound);
  return checkInCore({ tenantId, unitId: unit.id, unitName: unit.name, actor: null }, { reservationId, roomId }, { legacy: true });
}

// ───────────────────────── undoCheckIn (มติ 7) ─────────────────────────
const UndoZ = z.object({ reservationId: z.string().min(1).max(64), reason: z.string({ error: "ระบุเหตุผลที่ย้อนการเช็กอิน" }).trim().min(3, "ระบุเหตุผลอย่างน้อย 3 ตัวอักษร").max(300) });
const UNDO_OK_ITEMS = new Set(["ROOM", "DEPOSIT", "SECURITY_DEPOSIT"]);
/**
 * ย้อนเช็กอินที่ทำผิด (ผู้จัดการ/เจ้าของ + hotel.booking.manage · วันเดียวกันไทย · folio ยังไม่มีรายการนอกค่าห้อง/มัดจำ/ประกัน)
 * CHECKED_IN → CONFIRMED · checkedInAt ล้าง · ห้องจริงยังถือไว้ (STAY) · ห้องไม่ OCCUPIED · ทะเบียนผู้พักคงไว้ (ตม.30 ที่ยังไม่แจ้ง = ยังไม่มีกำหนด) · AuditLog
 */
export async function undoCheckIn(actorIn: unknown, ctx: unknown, input: unknown): Promise<{ ok: true } | GuestFail> {
  const tenantId = tenantOf(ctx);
  if (!tenantId || !isRec(input)) return gfail("NOT_FOUND", R.notFound);
  const unitId = await unitOfReservation(tenantId, input.reservationId);
  const g = await guestGate(actorIn, ctx, unitId, ["hotel.booking.manage"]);
  if (isGuestFail(g)) return g;
  if (!isManagerRole(g.actor)) return gfail("FORBIDDEN", "ย้อนการเช็กอินได้เฉพาะผู้จัดการหรือเจ้าของร้าน");
  const p = UndoZ.safeParse(input);
  if (!p.success) return gfail("INVALID_INPUT", zodReason(p.error));
  const c = { tenantId: g.tenantId, unitId: g.unitId };
  const db = tenantDb(c);
  const rv = await db.hotelReservation.findFirst({ where: { id: p.data.reservationId }, select: { id: true, status: true, roomId: true, roomTypeId: true, checkedInAt: true } });
  if (!rv) return gfail("NOT_FOUND", R.notFound);
  if (rv.status !== "CHECKED_IN" || !rv.checkedInAt) return gfail("INVALID_STATUS", "ย้อนได้เฉพาะการจองที่เช็กอินแล้ว");
  if (bkkYmd(rv.checkedInAt) !== bkkYmd(new Date())) return gfail("NOT_SAME_DAY", "ย้อนการเช็กอินได้ภายในวันเดียวกันเท่านั้น");
  const folio = await db.hotelFolio.findFirst({ where: { reservationId: rv.id }, select: { id: true } });
  if (folio) {
    const items = await db.hotelFolioItem.findMany({ where: { folioId: folio.id, voidedAt: null }, select: { type: true } });
    if (items.some((i) => !UNDO_OK_ITEMS.has(i.type))) return gfail("FOLIO_HAS_ITEMS", "บิลห้องมีรายการอื่นแล้ว (อาหาร/มินิบาร์/บริการ) — ย้อนการเช็กอินไม่ได้");
  }
  try {
    await db.$transaction(async (t) => {
      const tx = t as unknown as Tx;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${c.unitId}::text || ':' || ${rv.roomTypeId}::text))`;
      const cas = await tx.hotelReservation.updateMany({ where: { id: rv.id, status: "CHECKED_IN" }, data: { status: "CONFIRMED", checkedInAt: null } });
      if (cas.count !== 1) throw new GuestAbort(gfail("INVALID_STATUS", "สถานะการจองเปลี่ยนแล้ว — โหลดใหม่"));
      if (rv.roomId) await tx.hotelRoom.updateMany({ where: { id: rv.roomId, status: "OCCUPIED" }, data: { status: "AVAILABLE" } });
      await tx.hotelGuestRecord.updateMany({ where: { reservationId: rv.id, tm30Status: "PENDING" }, data: { tm30DueAt: null } });
      await tx.auditLog.create({
        data: {
          tenantId: c.tenantId,
          unitId: c.unitId,
          actorType: "USER",
          actorId: g.actor.userId,
          action: "hotel.reservation.check_in_undone",
          targetType: "HotelReservation",
          targetId: rv.id,
          before: { status: "CHECKED_IN", checkedInAt: rv.checkedInAt?.toISOString() ?? null, roomId: rv.roomId },
          after: { status: "CONFIRMED", reason: p.data.reason, checkInUndone: true, guestRecordsKept: true },
        },
      });
    }, GUEST_TX);
    return { ok: true };
  } catch (e) {
    if (e instanceof GuestAbort) return e.result;
    if (isTxBusy(e)) return gfail("BUSY", R.busy);
    throw e;
  }
}


// ───────────────────────── ข้อมูลจอเช็กอิน (หน้า [id]?tab=guests) ─────────────────────────
export type CheckinView = {
  ok: true;
  checkedInAt: string | null;
  securityDepositSatang: number;
  settings: { aiIdReader: boolean; rr3OnScreen: boolean; keepIdImageDefault: boolean; tm30Enabled: boolean; securityDeposit: { required: boolean; amountSatang: number } };
};
/** ค่าตั้ง + สถานะเช็กอิน/ประกันของการจองสำหรับจอ (ผู้เรียก = หน้าที่ตรวจสิทธิ์แล้ว) · ข้ามร้าน/หน่วย ⇒ NOT_FOUND */
export async function checkinView(ctx: unknown, input: unknown): Promise<CheckinView | GuestFail> {
  const tenantId = tenantOf(ctx);
  if (!tenantId || !isRec(input) || !isStr(input.unitId)) return gfail("NOT_FOUND", R.notFound);
  const unit = await tenantDb({ tenantId }).businessUnit.findFirst({ where: { id: input.unitId, type: "HOTEL" }, select: { id: true } });
  if (!unit) return gfail("NOT_FOUND", R.notFound);
  const rv = await tenantDb({ tenantId, unitId: unit.id }).hotelReservation.findFirst({ where: { id: String(input.reservationId ?? "") }, select: { checkedInAt: true, securityDepositSatang: true, securityDepositSaleId: true, source: true } });
  if (!rv) return gfail("NOT_FOUND", R.notFound);
  const st = await guestSettings(tenantId, unit.id);
  const required = st.secDepEnabled && st.secDepAmount > 0 && (st.secDepAppliesTo !== "WALK_IN" || rv.source === "WALK_IN");
  return {
    ok: true,
    checkedInAt: rv.checkedInAt?.toISOString() ?? null,
    securityDepositSatang: rv.securityDepositSaleId ? rv.securityDepositSatang : 0,
    settings: { aiIdReader: st.aiIdReader, rr3OnScreen: st.rr3OnScreen, keepIdImageDefault: st.keepIdImageDefault, tm30Enabled: st.tm30Enabled, securityDeposit: { required, amountSatang: st.secDepAmount } },
  };
}

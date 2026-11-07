// svc-qc-hotel-booking-scene.mts — SVC H.3 · ฉากจอง V2 บนร้าน svcqc หน่วยโรงแรม (ใบสั่ง h.3 §6)
//
// ใช้ (ต้อง seed ร้าน svcqc + ฉาก h.1 ก่อน — scripts/seed-svc-qc.mts · scripts/svc-qc-hotel-rates-scene.mts):
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-hotel-booking-scene.mts            # สร้างฉาก (idempotent)
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-hotel-booking-scene.mts --clear    # ลบเฉพาะแถวของฉาก
//
// ฉาก = SQC_HOTEL_BOOKING_SCENE เท่านั้น (ไม่มีตัวเลขในสคริปต์ · วันสัมพัทธ์ SQC_TODAY_BKK + checkInOffset):
//   • ทุกการจองผ่าน createBooking (ผู้กระทำ = เจ้าของ svcqc · source/hold/channelRef ตามรายการ) · note = "<mark> #<key>#"
//   • deposit PAID ⇒ takeBookingDeposit (payType ตามฟิกซ์เจอร์) · สถานะปลาย: CHECKED_IN = checkIn เดิม · NO_SHOW = markNoShow · CANCELLED = cancelBooking(cancelReason)
//   • การจองอดีต (checkInOffset < 0) / HOLD หมดอายุ (holdAgeMinutes) = ส่ง `at` ภายใต้ SVC_QC_CLOCK=1 (ฉากตั้งเอง) — ไม่แก้แถวตรง
// idempotent: รายการที่มีแถวของ key แล้ว = ข้าม ⇒ รันซ้ำ SCENE_SUMMARY {"created":0,"updated":0,"removed":0}
// --clear: แถวที่ note มี mark เท่านั้น — cancelBooking แถว HOLD/CONFIRMED (เหตุผล "SvcQcScene:clear") → ปล่อยห้องจริงที่ยัง active (facade rooms) → ลบแถว (Cascade nights/folio)
// 🔴 รันผ่าน scripts/qc-svc.sh เท่านั้น (ด่าน host qc-svc ใน loadSvcQcEnv)
// บรรทัดท้าย: SCENE_IDS {...ทุกรอบ} แล้ว SCENE_SUMMARY {"created","updated","removed"(,"groupId","rows" เมื่อมีการเปลี่ยน)}
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC, SQC_HOTEL_BOOKING_SCENE as FX, SQC_HOTEL_RATES, SQC_HOTEL_TYPES, SQC_TODAY_BKK, sqcAddDays } from "./svc-qc-data.mjs";

const LABEL = "svc-qc-hotel-booking-scene";
const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(`${LABEL}: สร้างฉากจอง V2 บนร้าน svcqc · --clear ลบเฉพาะแถวฉาก`);
  process.exit(0);
}
const unknownArgs = argv.filter((a) => a !== "--clear");
if (unknownArgs.length) {
  console.error(`🔴 ${LABEL}: ไม่รู้จัก ${unknownArgs.join(" ")} (ใช้ได้: --clear · --help)`);
  process.exit(2);
}
const clear = argv.includes("--clear");
loadSvcQcEnv(LABEL);
process.env.SVC_QC_CLOCK = "1"; // นาฬิกาฉาก (ใบ §2 ข้อ 13) — booking.ts รับ `at` เฉพาะเมื่อมีค่านี้

const { prisma } = await import("@/lib/core/db");
const hotel = await import("@/lib/modules/hotel");
const service = await import("@/lib/modules/hotel/service");
const rooms = await import("@/lib/modules/rooms");

const MARK = FX.mark;
const tenantId = SQC.tenant.id;
const unitId = SQC.units[FX.unit].id;
const ownerU = SQC.users.find((u) => u.key === "owner")!;
const OWNER = { role: ownerU.role, unitAccess: ownerU.unitAccess, permissions: ownerU.permissions, userId: ownerU.userId };
const ctx = { tenantId };
const sum = { created: 0, updated: 0, removed: 0 };
const noteOf = (key: string) => `${MARK} #${key}#`;
const TYPE_BY_NAME = new Map<string, string>(Object.values(SQC_HOTEL_TYPES).map((t) => [t.name, t.id]));
type R = { ok: boolean; code?: string; reason?: string };
const must = <T extends R>(r: T, what: string): T => {
  if (!r.ok) throw new Error(`${what}: ${r.code ?? ""} ${r.reason ?? ""}`.trim());
  return r;
};

const unit = await prisma.businessUnit.findFirst({ where: { id: unitId, tenantId, type: "HOTEL" }, select: { id: true } });
if (!unit) {
  console.error(`🔴 ${LABEL}: ไม่พบหน่วยโรงแรม svcqc (${unitId}) — รัน scripts/seed-svc-qc.mts ก่อน`);
  process.exit(3);
}
const sceneRows = () => prisma.hotelReservation.findMany({ where: { tenantId, unitId, note: { contains: MARK } }, orderBy: [{ createdAt: "asc" }, { code: "asc" }] });

try {
  if (clear) {
    const rows = await sceneRows();
    for (const r of rows.filter((x) => x.status === "HOLD" || x.status === "CONFIRMED")) {
      const c = await hotel.cancelBooking(OWNER, ctx, { unitId, reservationId: r.id, reason: "SvcQcScene:clear" });
      if (!c.ok) console.log(`  ⚠️ ยกเลิก ${r.code} ไม่สำเร็จ: ${c.reason}`);
    }
    const ids = rows.map((r) => r.id);
    if (ids.length) {
      await prisma.$transaction(async (tx) => {
        const occ = await tx.roomOccupancy.findMany({ where: { tenantId, unitId, refType: "HotelReservation", refId: { in: ids }, active: true }, select: { id: true } });
        for (const o of occ) await rooms.releaseOccupancy(tx, { tenantId, unitId, occupancyId: o.id, reason: "SvcQcScene:clear" });
        const roomIds = rows.filter((r) => r.status === "CHECKED_IN" && r.roomId).map((r) => r.roomId as string);
        if (roomIds.length) await tx.hotelRoom.updateMany({ where: { tenantId, unitId, id: { in: roomIds }, status: "OCCUPIED" }, data: { status: "AVAILABLE" } });
        const del = await tx.hotelReservation.deleteMany({ where: { tenantId, unitId, id: { in: ids }, note: { contains: MARK } } });
        sum.removed += del.count;
      }, { timeout: 60_000, maxWait: 15_000 });
    }
  } else {
    const plans = await prisma.hotelRatePlan.findMany({ where: { tenantId, unitId }, select: { id: true, code: true } });
    const planId = (key: string) => {
      const code = SQC_HOTEL_RATES.plans.find((p) => p.key === key)?.code;
      const p = plans.find((x) => x.code === code);
      if (!p) throw new Error(`ไม่พบแผน ${key} (${code}) — รันฉาก h.1 ก่อน`);
      return p.id;
    };
    for (const b of FX.bookings) {
      const have = await prisma.hotelReservation.count({ where: { tenantId, unitId, note: noteOf(b.key) } });
      if (have > 0) continue;
      const roomTypeId = TYPE_BY_NAME.get(b.roomType);
      if (!roomTypeId) throw new Error(`ไม่รู้จักประเภทห้อง ${b.roomType}`);
      const checkIn = sqcAddDays(SQC_TODAY_BKK, b.checkInOffset);
      const checkOut = sqcAddDays(SQC_TODAY_BKK, b.checkInOffset + b.nights);
      const at = b.holdAgeMinutes ? new Date(Date.now() - b.holdAgeMinutes * 60_000).toISOString() : b.checkInOffset < 0 ? `${checkIn}T03:00:00.000Z` : undefined;
      const created = await hotel.createBooking(OWNER, ctx, {
        unitId,
        rooms: Array.from({ length: b.rooms }, () => ({ roomTypeId, adults: b.adults, children: 0 })),
        checkIn,
        checkOut,
        ratePlanId: planId(b.plan),
        source: b.source,
        guest: { name: b.guest },
        note: noteOf(b.key),
        hold: b.hold ?? null,
        ...(b.channelRef ? { channelRef: b.channelRef } : {}),
        ...(at ? { at } : {}),
      });
      const c = must(created, `จอง ${b.key}`);
      if (!c.ok) continue;
      sum.created += c.reservations.length;
      const first = c.reservations[0];
      if (b.deposit === "PAID") must(await hotel.takeBookingDeposit(OWNER, ctx, { unitId, reservationId: first.id, payType: FX.depositPayType }), `มัดจำ ${b.key}`);
      if (b.status === "CHECKED_IN") {
        for (const r of c.reservations) {
          const occ = await prisma.roomOccupancy.findFirst({ where: { tenantId, unitId, refType: "HotelReservation", refId: r.id, active: true }, select: { roomId: true } });
          if (!occ) throw new Error(`เช็กอิน ${b.key}: ไม่มีห้องจริง`);
          must(await service.checkIn(tenantId, unitId, r.id, occ.roomId), `เช็กอิน ${b.key}`);
        }
      } else if (b.status === "NO_SHOW") {
        for (const r of c.reservations) must(await hotel.markNoShow(OWNER, ctx, { unitId, id: r.id }), `ไม่มา ${b.key}`);
      } else if (b.status === "CANCELLED") {
        must(await hotel.cancelBooking(OWNER, ctx, { unitId, ...(c.groupId ? { groupId: c.groupId } : { reservationId: first.id }), reason: FX.cancelReason }), `ยกเลิก ${b.key}`);
      }
    }
  }
  const rows = await sceneRows();
  const keyOf = (note: string | null) => /#([^#]+)#/.exec(note ?? "")?.[1] ?? "";
  const byKey: Record<string, { id: string; code: string; status: string }[]> = {};
  for (const r of rows) (byKey[keyOf(r.note)] ??= []).push({ id: r.id, code: r.code, status: r.status });
  const groupId = rows.find((r) => r.groupId)?.groupId ?? null;
  const head = rows.find((r) => r.groupId && r.depositSatang > 0) ?? null;
  console.log(`SCENE_IDS ${JSON.stringify({ groupId, groupHeadId: head?.id ?? null, rows: byKey })}`);
  const changed = sum.created + sum.updated + sum.removed > 0;
  console.log(`SCENE_SUMMARY ${JSON.stringify(changed ? { ...sum, groupId, groupHeadId: head?.id ?? null, rows: byKey } : sum)}`);
} catch (e) {
  console.error(`🔴 ${LABEL}: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

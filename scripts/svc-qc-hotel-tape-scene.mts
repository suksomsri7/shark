// svc-qc-hotel-tape-scene.mts — SVC H.2 · ฉากปฏิทินห้อง (tape chart · ภาพ 08) บนร้าน svcqc หน่วยโรงแรม (ใบสั่ง h.2 §5)
//
// ใช้ (ต้อง seed ร้าน svcqc + ฉาก h.1 ก่อน · ฉาก h.3 ใช้ห้องชุดเดียวกัน ⇒ --clear ฉาก h.3 ก่อนรันครั้งแรก):
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-hotel-booking-scene.mts --clear
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-hotel-tape-scene.mts            # สร้างฉาก (idempotent)
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-hotel-tape-scene.mts --clear    # ลบเฉพาะแถว/การปิดห้องของฉาก
//
// ฉาก = SQC_HOTEL_TAPE_SCENE เท่านั้น (ไม่มีตัวเลข/ชื่อในสคริปต์ · วันสัมพัทธ์ SQC_TODAY_BKK + offset):
//   • ปิดห้องก่อน (blockRoom ของ H.2 · เหตุผลจากฟิกซ์เจอร์) ⇒ การจองที่ระบบเลือกห้องให้จะไม่ลงห้องที่ปิด
//   • การจองผ่าน createBooking (ผู้กระทำ = เจ้าของ svcqc) · note = "<mark> #<key>#" → ห้องตาม pinRooms ด้วย assignRoom
//     (ห้องถูกการจองอื่นของฉากถือไว้ ⇒ moveBooking/rescheduleBooking ของ H.3 จัดห้องให้รายการที่ขวางใหม่) → มัดจำ PAID = takeBookingDeposit → CHECKED_IN = checkIn เดิม
//   • การจองอดีต (offset < 0) = ส่ง `at` ภายใต้ SVC_QC_CLOCK=1 (ฉากตั้งเอง) — ไม่แก้แถวตรง
// idempotent: key ที่มีแถวแล้ว = ข้าม · การปิดห้องที่มีอยู่แล้ว (ห้อง+ช่วงเดียวกัน) = ข้าม
// --clear: releaseBlock การปิดห้องของฉาก (ห้อง + เหตุผลตามฟิกซ์เจอร์) → cancelBooking แถว HOLD/CONFIRMED → ปล่อยห้องจริงที่ยัง active → ลบแถวที่ note มี mark
// 🔴 รันผ่าน scripts/qc-svc.sh เท่านั้น (ด่าน host qc-svc ใน loadSvcQcEnv)
// บรรทัดท้าย: SCENE_SUMMARY {"blockId", "blocks":{key:id}, "rows":{key:[{id,code}]}} — สถานะของฉาก (รันซ้ำได้ค่าเดิม)
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC, SQC_HOTEL_TAPE_SCENE as FX, SQC_HOTEL_RATES, SQC_HOTEL_TYPES, SQC_TODAY_BKK, sqcAddDays } from "./svc-qc-data.mjs";

const LABEL = "svc-qc-hotel-tape-scene";
const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(`${LABEL}: สร้างฉากปฏิทินห้องบนร้าน svcqc · --clear ลบเฉพาะแถว/การปิดห้องของฉาก`);
  process.exit(0);
}
const unknownArgs = argv.filter((a) => a !== "--clear");
if (unknownArgs.length) {
  console.error(`🔴 ${LABEL}: ไม่รู้จัก ${unknownArgs.join(" ")} (ใช้ได้: --clear · --help)`);
  process.exit(2);
}
const clear = argv.includes("--clear");
loadSvcQcEnv(LABEL);
process.env.SVC_QC_CLOCK = "1"; // นาฬิกาฉาก (มติ h.3 ข้อ 13) — booking.ts รับ `at` เฉพาะเมื่อมีค่านี้

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
const noteOf = (key: string) => `${MARK} #${key}#`;
const TYPE_BY_NAME = new Map<string, string>(Object.values(SQC_HOTEL_TYPES).map((t) => [t.name, t.id]));
type R = { ok: boolean; code?: string; reason?: string };
const must = <T extends R>(r: T, what: string): T => {
  if (!r.ok) throw new Error(`${what}: ${r.code ?? ""} ${r.reason ?? ""}`.trim());
  return r;
};
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

const unit = await prisma.businessUnit.findFirst({ where: { id: unitId, tenantId, type: "HOTEL" }, select: { id: true } });
if (!unit) {
  console.error(`🔴 ${LABEL}: ไม่พบหน่วยโรงแรม svcqc (${unitId}) — รัน scripts/seed-svc-qc.mts ก่อน`);
  process.exit(3);
}
const roomRows = await prisma.hotelRoom.findMany({ where: { tenantId, unitId }, select: { id: true, number: true } });
const roomIdOf = (num: string): string => {
  const r = roomRows.find((x) => x.number === num);
  if (!r) throw new Error(`ไม่พบห้อง ${num} ในหน่วยโรงแรม svcqc`);
  return r.id;
};
const sceneRows = () => prisma.hotelReservation.findMany({ where: { tenantId, unitId, note: { contains: MARK } }, orderBy: [{ createdAt: "asc" }, { code: "asc" }] });
/** การปิดห้องของฉากที่ยัง active (ห้อง + เหตุผลตรงฟิกซ์เจอร์) */
async function sceneBlocks(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const ls = await hotel.listBlocks(OWNER, ctx, { unitId, from: sqcAddDays(SQC_TODAY_BKK, -60) });
  const list = ls.ok ? ls.blocks : [];
  for (const bl of FX.blocks) {
    const rid = roomIdOf(bl.room);
    const from = sqcAddDays(SQC_TODAY_BKK, bl.fromOffset);
    const to = sqcAddDays(SQC_TODAY_BKK, bl.fromOffset + bl.nights);
    const hit = list.find((x) => x.roomId === rid && x.reason === bl.reason && x.from === from && x.to === to);
    if (hit) out[bl.key] = hit.blockId;
  }
  return out;
}

try {
  if (clear) {
    const ls = await hotel.listBlocks(OWNER, ctx, { unitId, from: sqcAddDays(SQC_TODAY_BKK, -60) });
    for (const bl of FX.blocks) {
      const rid = roomIdOf(bl.room);
      for (const x of (ls.ok ? ls.blocks : []).filter((b) => b.roomId === rid && b.reason === bl.reason)) {
        const r = await hotel.releaseBlock(OWNER, ctx, { unitId, blockId: x.blockId });
        if (!r.ok) console.log(`  ⚠️ ปล่อยห้อง ${bl.room} ไม่สำเร็จ: ${r.reason}`);
      }
    }
    const rows = await sceneRows();
    for (const r of rows.filter((x) => x.status === "HOLD" || x.status === "CONFIRMED")) {
      const c = await hotel.cancelBooking(OWNER, ctx, { unitId, reservationId: r.id, reason: "SvcQcScene:clear" });
      if (!c.ok) console.log(`  ⚠️ ยกเลิก ${r.code} ไม่สำเร็จ: ${c.reason}`);
    }
    const ids = rows.map((r) => r.id);
    if (ids.length) {
      await prisma.$transaction(
        async (tx) => {
          const occ = await tx.roomOccupancy.findMany({ where: { tenantId, unitId, refType: "HotelReservation", refId: { in: ids }, active: true }, select: { id: true } });
          for (const o of occ) await rooms.releaseOccupancy(tx, { tenantId, unitId, occupancyId: o.id, reason: "SvcQcScene:clear" });
          const occupied = rows.filter((r) => r.status === "CHECKED_IN" && r.roomId).map((r) => r.roomId as string);
          if (occupied.length) await tx.hotelRoom.updateMany({ where: { tenantId, unitId, id: { in: occupied }, status: "OCCUPIED" }, data: { status: "AVAILABLE" } });
          await tx.hotelReservation.deleteMany({ where: { tenantId, unitId, id: { in: ids }, note: { contains: MARK } } });
        },
        { timeout: 60_000, maxWait: 15_000 },
      );
    }
  } else {
    // 1) ปิดห้องก่อน (ห้อง+ช่วงเดิมที่ยัง active = ข้าม)
    const have = await sceneBlocks();
    for (const bl of FX.blocks) {
      if (have[bl.key]) continue;
      must(
        await hotel.blockRoom(OWNER, ctx, { unitId, roomId: roomIdOf(bl.room), from: sqcAddDays(SQC_TODAY_BKK, bl.fromOffset), to: sqcAddDays(SQC_TODAY_BKK, bl.fromOffset + bl.nights), reason: bl.reason }),
        `ปิดห้อง ${bl.key}`,
      );
    }
    // 2) การจอง
    const plans = await prisma.hotelRatePlan.findMany({ where: { tenantId, unitId }, select: { id: true, code: true } });
    const planId = (key: string) => {
      const code = SQC_HOTEL_RATES.plans.find((p) => p.key === key)?.code;
      const p = plans.find((x) => x.code === code);
      if (!p) throw new Error(`ไม่พบแผน ${key} (${code}) — รันฉาก h.1 ก่อน`);
      return p.id;
    };
    for (const b of FX.bookings) {
      const exists = await prisma.hotelReservation.count({ where: { tenantId, unitId, note: noteOf(b.key) } });
      if (exists > 0) continue;
      const roomTypeId = TYPE_BY_NAME.get(b.roomType);
      if (!roomTypeId) throw new Error(`ไม่รู้จักประเภทห้อง ${b.roomType}`);
      const checkIn = sqcAddDays(SQC_TODAY_BKK, b.checkInOffset);
      const checkOut = sqcAddDays(SQC_TODAY_BKK, b.checkInOffset + b.nights);
      const at = b.checkInOffset < 0 ? `${checkIn}T03:00:00.000Z` : undefined;
      const atIn = at ? { at } : {};
      const created = must(
        await hotel.createBooking(OWNER, ctx, {
          unitId,
          rooms: Array.from({ length: b.rooms }, () => ({ roomTypeId, adults: b.adults, children: 0 })),
          checkIn,
          checkOut,
          ratePlanId: planId(b.plan),
          source: b.source,
          guest: { name: b.guest },
          note: noteOf(b.key),
          ...(b.hold ? { hold: b.hold } : {}),
          ...(b.channelRef ? { channelRef: b.channelRef } : {}),
          ...atIn,
        }),
        `จอง ${b.key}`,
      );
      if (!created.ok) continue;
      // ห้องตาม pinRooms (แถวที่ i ⇒ ห้องที่ i)
      for (const [i, r] of created.reservations.entries()) {
        const pin = b.pinRooms?.[i];
        if (!pin) continue;
        const target = roomIdOf(pin);
        const cur = await prisma.hotelReservation.findFirst({ where: { tenantId, unitId, id: r.id }, select: { roomId: true } });
        if (cur?.roomId === target) continue;
        const a = await hotel.assignRoom(OWNER, ctx, { unitId, id: r.id, roomId: target, ...atIn });
        if (!a.ok) must(await hotel.moveBooking(OWNER, ctx, { unitId, id: r.id, roomId: target, ...atIn }), `ห้อง ${b.key} → ${pin}`);
      }
      const first = created.reservations[0];
      if (b.deposit === "PAID") {
        const st = await prisma.hotelReservation.findFirst({ where: { tenantId, unitId, id: first.id }, select: { status: true } });
        if (st?.status === "HOLD") must(await hotel.takeBookingDeposit(OWNER, ctx, { unitId, reservationId: first.id, payType: FX.depositPayType, ...atIn }), `มัดจำ ${b.key}`);
      }
      if (b.status === "CHECKED_IN") {
        for (const r of created.reservations) {
          const occ = await prisma.roomOccupancy.findFirst({ where: { tenantId, unitId, refType: "HotelReservation", refId: r.id, active: true, startDate: { lte: dbDate(checkIn) } }, select: { roomId: true } });
          if (!occ) throw new Error(`เช็กอิน ${b.key}: ไม่มีห้องจริง`);
          must(await service.checkIn(tenantId, unitId, r.id, occ.roomId), `เช็กอิน ${b.key}`);
        }
      }
    }
  }
  const rows = await sceneRows();
  const keyOf = (note: string | null) => /#([^#]+)#/.exec(note ?? "")?.[1] ?? "";
  const byKey: Record<string, { id: string; code: string }[]> = {};
  for (const r of rows) (byKey[keyOf(r.note)] ??= []).push({ id: r.id, code: r.code });
  const blocks = await sceneBlocks();
  const blockId = Object.values(blocks)[0] ?? null;
  console.log(`SCENE_SUMMARY ${JSON.stringify({ blockId, blocks, rows: byKey })}`);
} catch (e) {
  console.error(`🔴 ${LABEL}: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

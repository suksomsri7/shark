// svc-qc-hotel-audit-scene.mts — SVC H.7 · ฉากปิดวัน (night audit) บนร้าน svcqc หน่วยโรงแรม (ใบสั่ง h.7 §6 · ฟิกซ์เจอร์ SQC_HOTEL_AUDIT_SCENE)
//
// ใช้ (ต้อง seed ร้าน svcqc + ฉาก h.1 + ฉาก h.3 ก่อน — ฉากนี้ยืนบน h.3 เท่านั้น):
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-hotel-audit-scene.mts            # สร้างฉาก (idempotent · ยังไม่ปิดวัน)
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-hotel-audit-scene.mts --clear    # ลบเฉพาะของฉาก + วันปิดของหน่วย
//
// ฉาก = SQC_HOTEL_AUDIT_SCENE เท่านั้น (ไม่มีตัวเลขในสคริปต์ · วันสัมพัทธ์ SQC_TODAY_BKK + checkInOffset):
//   • extraBookings (audit-noshow): createBooking ด้วย `at` = วันเข้า 03:00Z ใต้ SVC_QC_CLOCK=1 · มัดจำ PAID ⇒ takeBookingDeposit · ไม่เช็กอิน · note = "<mark> #<key>#"
//   • ค่าตั้ง UNIT ของหน่วยตาม AS.settings (noShow · dailyHousekeeping · nightAuditTime · audit.autoClose) ผ่าน setSettings
//   • ไม่ปิดวัน (หน้า audit แสดง preview ของเมื่อวาน · ข้อสอบ Q-2 เป็นคนปิด)
// idempotent: มีของแล้ว = ข้าม ⇒ รันซ้ำ SCENE_SUMMARY {"created":0,"updated":0,"removed":0}
// --clear (ให้ฉาก h.5 รันต่อบนฐานเดียวกันได้ · มติผู้คุม §9.10):
//   • แถว HotelNightAudit ของหน่วย svcqc ทั้งหมด · รายการ ROOM ที่ audit โพสต์ (คืนที่มี postedAuditId) ถูกลบ + nights.postedAuditId/folioItemId คืน null + ยอด folio คำนวณใหม่
//   • การจองที่ note มี mark ของฉากนี้ (ปล่อยห้องจริงที่ยัง active แล้วลบ — Cascade nights/folio) · ค่าตั้ง UNIT ตาม AS.settings ถูกถอด · แถวนอกฉากไม่แตะ
// 🔴 รันผ่าน scripts/qc-svc.sh เท่านั้น (ด่าน host qc-svc ใน loadSvcQcEnv)
// บรรทัดท้าย: SCENE_IDS {...ทุกรอบ} แล้ว SCENE_SUMMARY {"created","updated","removed"}
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC, SQC_HOTEL_AUDIT_SCENE as AS, SQC_HOTEL_BOOKING_SCENE as BS, SQC_HOTEL_RATES, SQC_HOTEL_TYPES, SQC_TODAY_BKK, sqcAddDays } from "./svc-qc-data.mjs";

const LABEL = "svc-qc-hotel-audit-scene";
const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(`${LABEL}: สร้างฉากปิดวันบนร้าน svcqc · --clear ลบเฉพาะของฉาก + วันปิดของหน่วย`);
  process.exit(0);
}
const unknownArgs = argv.filter((a) => a !== "--clear");
if (unknownArgs.length) {
  console.error(`🔴 ${LABEL}: ไม่รู้จัก ${unknownArgs.join(" ")} (ใช้ได้: --clear · --help)`);
  process.exit(2);
}
const clear = argv.includes("--clear");
loadSvcQcEnv(LABEL);
process.env.SVC_QC_CLOCK = "1"; // นาฬิกาฉาก — booking.ts รับ `at` เฉพาะเมื่อมีค่านี้

const { prisma } = await import("@/lib/core/db");
const hotel = await import("@/lib/modules/hotel");
const rooms = await import("@/lib/modules/rooms");
const settings = await import("@/lib/core/settings");

const MARK = AS.mark;
const tenantId = SQC.tenant.id;
const unitId = SQC.units[AS.unit].id;
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
    // 1) ROOM ที่ audit โพสต์ + คืนตารางคืน + วันปิดของหน่วย
    const posted = await prisma.hotelBookingNight.findMany({ where: { tenantId, unitId, postedAuditId: { not: null } }, select: { id: true, folioItemId: true, reservationId: true } });
    const itemIds = posted.map((x) => x.folioItemId).filter((x): x is string => typeof x === "string");
    if (itemIds.length) {
      const items = await prisma.hotelFolioItem.findMany({ where: { tenantId, unitId, id: { in: itemIds } }, select: { id: true, folioId: true } });
      const folioIds = [...new Set(items.map((i) => i.folioId))];
      await prisma.hotelFolioItem.deleteMany({ where: { tenantId, unitId, reversalOfId: { in: itemIds } } });
      const del = await prisma.hotelFolioItem.deleteMany({ where: { tenantId, unitId, id: { in: itemIds } } });
      sum.removed += del.count;
      for (const fid of folioIds) {
        const agg = await prisma.hotelFolioItem.aggregate({ where: { folioId: fid }, _sum: { amountSatang: true } });
        await prisma.hotelFolio.updateMany({ where: { id: fid, tenantId, unitId }, data: { balanceSatang: agg._sum.amountSatang ?? 0 } });
      }
    }
    if (posted.length) {
      await prisma.hotelBookingNight.updateMany({ where: { tenantId, unitId, id: { in: posted.map((x) => x.id) } }, data: { folioItemId: null, postedAuditId: null } });
      sum.updated += posted.length;
    }
    const au = await prisma.hotelNightAudit.deleteMany({ where: { tenantId, unitId } });
    sum.removed += au.count;
    // 2) การจองของฉาก
    const rows = await sceneRows();
    const ids = rows.map((r) => r.id);
    if (ids.length) {
      await prisma.$transaction(
        async (tx) => {
          const occ = await tx.roomOccupancy.findMany({ where: { tenantId, unitId, refType: "HotelReservation", refId: { in: ids }, active: true }, select: { id: true } });
          for (const o of occ) await rooms.releaseOccupancy(tx, { tenantId, unitId, occupancyId: o.id, reason: "SvcQcScene:clear" });
          const del = await tx.hotelReservation.deleteMany({ where: { tenantId, unitId, id: { in: ids }, note: { contains: MARK } } });
          sum.removed += del.count;
        },
        { timeout: 60_000, maxWait: 15_000 },
      );
    }
    // 3) ค่าตั้ง UNIT ของฉาก
    for (const key of Object.keys(AS.settings)) {
      const have = await prisma.settingValue.count({ where: { tenantId, scope: "UNIT", scopeId: unitId, key } });
      if (!have) continue;
      const r = await settings.resetSetting(OWNER, ctx, { key, scope: "UNIT", scopeId: unitId });
      if (r.ok) sum.removed++;
      else console.log(`  ⚠️ ถอดค่าตั้ง ${key} ไม่สำเร็จ`);
    }
  } else {
    // ค่าตั้ง UNIT ตามฟิกซ์เจอร์
    const cur = await prisma.settingValue.findMany({ where: { tenantId, scope: "UNIT", scopeId: unitId, key: { in: Object.keys(AS.settings) } }, select: { key: true, value: true } });
    const changes = Object.entries(AS.settings)
      .filter(([k, v]) => JSON.stringify(cur.find((x) => x.key === k)?.value ?? null) !== JSON.stringify(v))
      .map(([key, value]) => ({ key, scope: "UNIT" as const, scopeId: unitId, value }));
    if (changes.length) {
      must(await settings.setSettings(OWNER, ctx, changes), "ตั้งค่าตั้งฉาก");
      // ค่าที่เท่าค่าที่สืบมา setSettings ไม่เก็บแถว (CC §1.2) — ฉากต้องการแถว UNIT ตามฟิกซ์เจอร์ครบ (ปักค่าไว้ ไม่ให้ค่าร้านเปลี่ยนแล้วฉากเพี้ยน)
      //   ⇒ แถวที่ยังไม่มีหลังบันทึก = เขียนแถวเดียวกับที่ setSettings จะเขียน (ค่าผ่าน schema ของ def ก่อน · ค่าที่มีผลไม่เปลี่ยน)
      const after = await prisma.settingValue.findMany({ where: { tenantId, scope: "UNIT", scopeId: unitId, key: { in: changes.map((c) => c.key) } }, select: { key: true } });
      for (const c of changes.filter((x) => !after.some((a) => a.key === x.key))) {
        const def = settings.getDef(c.key);
        if (!def || !def.schema.safeParse(c.value).success) throw new Error(`ค่าตั้งฉาก ${c.key} ไม่ผ่าน schema`);
        await prisma.settingValue.create({ data: { tenantId, key: c.key, scope: "UNIT", scopeId: unitId, value: c.value as never, setById: OWNER.userId, overrideReason: MARK } });
      }
      sum.updated += changes.length;
    }
    // การจองเพิ่มของฉาก (audit-noshow)
    const plans = await prisma.hotelRatePlan.findMany({ where: { tenantId, unitId }, select: { id: true, code: true } });
    for (const b of AS.extraBookings) {
      const have = await prisma.hotelReservation.count({ where: { tenantId, unitId, note: noteOf(b.key) } });
      if (have > 0) continue;
      const roomTypeId = TYPE_BY_NAME.get(b.roomType);
      if (!roomTypeId) throw new Error(`ไม่รู้จักประเภทห้อง ${b.roomType}`);
      const code = SQC_HOTEL_RATES.plans.find((p) => p.key === b.plan)?.code;
      const plan = plans.find((p) => p.code === code);
      if (!plan) throw new Error(`ไม่พบแผน ${b.plan} (${code}) — รันฉาก h.1 ก่อน`);
      const checkIn = sqcAddDays(SQC_TODAY_BKK, b.checkInOffset);
      const checkOut = sqcAddDays(SQC_TODAY_BKK, b.checkInOffset + b.nights);
      const c = must(
        await hotel.createBooking(OWNER, ctx, {
          unitId,
          rooms: Array.from({ length: b.rooms }, () => ({ roomTypeId, adults: b.adults, children: 0 })),
          checkIn,
          checkOut,
          ratePlanId: plan.id,
          source: b.source,
          guest: { name: b.guest },
          note: noteOf(b.key),
          hold: null,
          ...(b.checkInOffset < 0 ? { at: `${checkIn}T03:00:00.000Z` } : {}),
        }),
        `จอง ${b.key}`,
      );
      if (!c.ok) continue;
      sum.created += c.reservations.length;
      if (b.deposit === "PAID") must(await hotel.takeBookingDeposit(OWNER, ctx, { unitId, reservationId: c.reservations[0].id, payType: BS.depositPayType }), `มัดจำ ${b.key}`);
    }
  }
  const rows = await sceneRows();
  const audits = await prisma.hotelNightAudit.count({ where: { tenantId, unitId } });
  console.log(`SCENE_IDS ${JSON.stringify({ unitId, businessDate: sqcAddDays(SQC_TODAY_BKK, AS.businessDateOffset), audits, rows: rows.map((r) => ({ id: r.id, code: r.code, status: r.status })) })}`);
  console.log(`SCENE_SUMMARY ${JSON.stringify(sum)}`);
} catch (e) {
  console.error(`🔴 ${LABEL}: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

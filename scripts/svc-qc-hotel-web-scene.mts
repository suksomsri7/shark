// svc-qc-hotel-web-scene.mts — SVC H.8 · ฉากจองออนไลน์ V2 บนร้าน svcqc หน่วยโรงแรม (ใบสั่ง h.8 §6 · §10.9)
//
// ใช้ (ต้อง seed ร้าน svcqc + ฉาก h.1 ก่อน · ล้างฉาก h.5/h.3/h.2 ก่อน — ยืนบน h.1 เท่านั้น):
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-hotel-web-scene.mts            # สร้างฉาก (idempotent)
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-hotel-web-scene.mts --clear    # ลบเฉพาะของฉาก
//
// ฉาก = SQC_HOTEL_WEB_SCENE เท่านั้น (วันฉาก = ศุกร์ถัดไปเวลาไทย · 2 คืน):
//   • แก้มือดีลักซ์คืนเสาร์ของฉาก (reason มี mark h8) ต่อแผนที่เปิดเว็บ: STANDARD = 169,000 · BREAKFAST = +อาหารเช้าต่อคน × baseOccupancy · NONREF = −10% ปัดลงบาท
//     (ภาพ 16 ก "฿3,180 / ฿3,980 / ฿2,862" · ราคาอ้าง SQC_HOTEL_RATES — ไม่มีตัวเลขตายในสคริปต์)
//   • เคาน์เตอร์: ห้องละ 1 การจอง (createBooking WALK_IN · CONFIRMED · มัดจำเงินสด) · note = "<mark> #<key>-<n>#"
//   • เว็บ: ผ่าน platform/hotel-web.publicCreateHold (locale th) — HOLD มัดจำค้าง · CONFIRMED = แนบสลิป (ไฟล์ทดสอบ · ไม่ยิงที่เก็บไฟล์จริง) → เจ้าของอนุมัติ → consumer สาขา HOTEL
//     แถวเว็บระบุด้วย guestEmail ของฟิกซ์เจอร์ · HOLD ที่หมดเวลา/ถูกยกเลิก = สร้างใหม่ (ฉากต้องสด)
// idempotent: ของที่มีครบแล้ว = ข้าม ⇒ รันซ้ำ SCENE_SUMMARY {"created":0,"updated":0,"removed":0}
// --clear: ยกเลิกแถวฉากที่ยังถือห้อง (cancelBooking เหตุผล SvcQcScene:clear) → ปล่อยห้องจริงที่ค้าง → ลบสลิป+ไฟล์ของฉาก → ลบแถว (Cascade nights/folio) → ลบแก้มือของฉาก
// บรรทัดท้าย: SCENE_IDS {...ทุกรอบ (token + qs สำหรับภาพ)} แล้ว SCENE_SUMMARY {"created","updated","removed"(,"checkIn","checkOut","holdToken","confirmedToken","qs" เมื่อมีการเปลี่ยน)}
// 🔴 รันผ่าน scripts/qc-svc.sh เท่านั้น (ด่าน host qc-svc ใน loadSvcQcEnv)
import { randomBytes } from "node:crypto";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC, SQC_HOTEL_WEB_SCENE as FX, SQC_HOTEL_RATES, SQC_HOTEL_TYPES, SQC_TODAY_BKK, sqcAddDays } from "./svc-qc-data.mjs";

const LABEL = "svc-qc-hotel-web-scene";
const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(`${LABEL}: สร้างฉากจองออนไลน์ V2 บนร้าน svcqc · --clear ลบเฉพาะของฉาก`);
  process.exit(0);
}
const unknownArgs = argv.filter((a) => a !== "--clear");
if (unknownArgs.length) {
  console.error(`🔴 ${LABEL}: ไม่รู้จัก ${unknownArgs.join(" ")} (ใช้ได้: --clear · --help)`);
  process.exit(2);
}
const clear = argv.includes("--clear");
loadSvcQcEnv(LABEL);

const { prisma } = await import("@/lib/core/db");
const hotel = await import("@/lib/modules/hotel");
const rooms = await import("@/lib/modules/rooms");
const web = await import("@/lib/platform/hotel-web");
const slips = await import("@/lib/payment/slip-verify");

const MARK = FX.mark;
const tenantId = SQC.tenant.id;
const unitId = SQC.units[FX.unit].id;
const tenantSlug = SQC.tenant.slug;
const unitSlug = SQC.units[FX.unit].slug;
const ownerU = SQC.users.find((u) => u.key === "owner")!;
const OWNER = { role: ownerU.role, unitAccess: ownerU.unitAccess, permissions: ownerU.permissions, userId: ownerU.userId };
const ctx = { tenantId };
const sum = { created: 0, updated: 0, removed: 0 };
const noteOf = (key: string) => `${MARK} #${key}#`;
const TYPE_BY_NAME = new Map<string, string>(Object.values(SQC_HOTEL_TYPES).map((t) => [t.name, t.id]));
const BASE_OCC = new Map<string, number>(Object.values(SQC_HOTEL_TYPES).map((t) => [t.name, t.baseOccupancy]));
const webMails = FX.webBookings.map((b) => b.guest.email);
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
type R = { ok: boolean; code?: string; reason?: string };
const must = <T extends R>(r: T, what: string): T => {
  if (!r.ok) throw new Error(`${what}: ${r.code ?? ""} ${r.reason ?? ""}`.trim());
  return r;
};
/** ศุกร์ถัดไป (วันนี้ศุกร์ = ศุกร์หน้า) — ไม่ใช้ getDay (นับจากเลขวัน epoch · 1970-01-01 = พฤหัส) */
const dow = (ymd: string) => ((Math.round(Date.parse(`${ymd}T00:00:00Z`) / 86_400_000) + 4) % 7 + 7) % 7;
const ANCHOR = sqcAddDays(SQC_TODAY_BKK, ((5 - dow(SQC_TODAY_BKK) + 7) % 7) || 7);
const ANCHOR_OUT = sqcAddDays(ANCHOR, FX.nights);
const QS = `checkIn=${ANCHOR}&checkOut=${ANCHOR_OUT}&adults=2&rooms=1`;

const unit = await prisma.businessUnit.findFirst({ where: { id: unitId, tenantId, type: "HOTEL" }, select: { id: true } });
if (!unit) {
  console.error(`🔴 ${LABEL}: ไม่พบหน่วยโรงแรม svcqc (${unitId}) — รัน scripts/seed-svc-qc.mts ก่อน`);
  process.exit(3);
}
const counterRows = () => prisma.hotelReservation.findMany({ where: { tenantId, unitId, note: { contains: MARK } }, orderBy: [{ createdAt: "asc" }, { code: "asc" }] });
const webRows = () => prisma.hotelReservation.findMany({ where: { tenantId, unitId, source: "WEB", guestEmail: { in: webMails } }, orderBy: [{ createdAt: "asc" }, { code: "asc" }] });

/** ลบแถวการจองของฉาก (ยกเลิกที่ยังถือห้อง → ปล่อยห้องจริงค้าง → ลบสลิป/ไฟล์ → ลบแถว) */
async function removeRows(rows: Awaited<ReturnType<typeof counterRows>>): Promise<number> {
  for (const r of rows.filter((x) => x.status === "HOLD" || x.status === "CONFIRMED")) {
    const c = await hotel.cancelBooking(OWNER, ctx, { unitId, ...(r.groupId ? { groupId: r.groupId } : { reservationId: r.id }), reason: "SvcQcScene:clear" });
    if (!c.ok && c.code !== "INVALID_STATUS") console.log(`  ⚠️ ยกเลิก ${r.code} ไม่สำเร็จ: ${c.reason}`);
  }
  const ids = rows.map((r) => r.id);
  if (!ids.length) return 0;
  const sl = await prisma.paymentSlip.findMany({ where: { tenantId, refId: { in: ids } }, select: { id: true, fileId: true } });
  let removed = 0;
  await prisma.$transaction(
    async (tx) => {
      const occ = await tx.roomOccupancy.findMany({ where: { tenantId, unitId, refType: "HotelReservation", refId: { in: ids }, active: true }, select: { id: true } });
      for (const o of occ) await rooms.releaseOccupancy(tx, { tenantId, unitId, occupancyId: o.id, reason: "SvcQcScene:clear" });
      await tx.paymentSlip.deleteMany({ where: { tenantId, id: { in: sl.map((s) => s.id) } } });
      if (sl.length) await tx.fileAsset.deleteMany({ where: { tenantId, id: { in: sl.map((s) => s.fileId) } } });
      removed = (await tx.hotelReservation.deleteMany({ where: { tenantId, unitId, id: { in: ids } } })).count;
    },
    { timeout: 60_000, maxWait: 15_000 },
  );
  return removed;
}

try {
  if (clear) {
    sum.removed += await removeRows([...(await counterRows()), ...(await webRows())]);
    sum.removed += (await prisma.hotelRateOverride.deleteMany({ where: { tenantId, unitId, reason: { contains: MARK } } })).count;
  } else {
    const pp = await prisma.paymentProfile.findUnique({ where: { tenantId }, select: { promptpayId: true } });
    if (!pp?.promptpayId) throw new Error("ร้าน svcqc ไม่มี PaymentProfile.promptpayId — QR มัดจำของฉาก h.8 สร้างไม่ได้ (seed ร้าน svcqc ก่อน)");
    const plans = await prisma.hotelRatePlan.findMany({ where: { tenantId, unitId }, select: { id: true, code: true } });
    const planOf = (key: string) => {
      const code = SQC_HOTEL_RATES.plans.find((p) => p.key === key)?.code;
      const p = plans.find((x) => x.code === code);
      if (!p) throw new Error(`ไม่พบแผน ${key} (${code}) — รันฉาก h.1 ก่อน`);
      return p.id;
    };

    // ── แก้มือดีลักซ์คืนเสาร์ของฉาก (ต่อแผนที่เปิดเว็บ) ──
    const ovType = TYPE_BY_NAME.get(FX.override.roomType);
    if (!ovType) throw new Error(`ไม่รู้จักประเภทห้อง ${FX.override.roomType}`);
    const ovDate = sqcAddDays(ANCHOR, FX.override.anchorDayOffset);
    const std = FX.override.priceSatang;
    const want: { plan: string; price: number }[] = [
      { plan: "standard", price: std },
      { plan: "breakfast", price: std + SQC_HOTEL_RATES.breakfastPerPersonSatang * (BASE_OCC.get(FX.override.roomType) ?? 2) },
      { plan: "nonref", price: Math.floor((std * (10_000 - SQC_HOTEL_RATES.nonrefDiscountBp)) / 10_000 / 100) * 100 },
    ];
    const reason = `${MARK} ${FX.override.reason}`;
    sum.removed += (await prisma.hotelRateOverride.deleteMany({ where: { tenantId, unitId, reason: { contains: MARK }, NOT: { date: dbDate(ovDate), roomTypeId: ovType } } })).count;
    for (const w of want) {
      const ratePlanId = planOf(w.plan);
      const cur = await prisma.hotelRateOverride.findFirst({ where: { tenantId, unitId, roomTypeId: ovType, ratePlanId, date: dbDate(ovDate) } });
      if (!cur) {
        await prisma.hotelRateOverride.create({ data: { tenantId, unitId, roomTypeId: ovType, ratePlanId, date: dbDate(ovDate), priceSatang: w.price, reason, setById: ownerU.userId } });
        sum.created++;
      } else if (cur.priceSatang !== w.price || cur.reason !== reason) {
        await prisma.hotelRateOverride.update({ where: { id: cur.id }, data: { priceSatang: w.price, reason, setById: ownerU.userId } });
        sum.updated++;
      }
    }

    // ── เคาน์เตอร์ (ห้องละการจอง · CONFIRMED · มัดจำเงินสด) ──
    for (const b of FX.counterBookings) {
      const roomTypeId = TYPE_BY_NAME.get(b.roomType);
      if (!roomTypeId) throw new Error(`ไม่รู้จักประเภทห้อง ${b.roomType}`);
      const checkIn = sqcAddDays(ANCHOR, b.anchorDayOffset);
      const checkOut = sqcAddDays(checkIn, b.nights);
      for (let i = 1; i <= b.rooms; i++) {
        const note = noteOf(`${b.key}-${i}`);
        if ((await prisma.hotelReservation.count({ where: { tenantId, unitId, note } })) > 0) continue;
        const c = must(await hotel.createBooking(OWNER, ctx, { unitId, rooms: [{ roomTypeId, adults: b.adults, children: 0 }], checkIn, checkOut, ratePlanId: planOf(b.plan), source: "WALK_IN", guest: { name: b.guest }, note }), `จอง ${b.key}-${i}`);
        if (!c.ok) continue;
        sum.created++;
        must(await hotel.takeBookingDeposit(OWNER, ctx, { unitId, reservationId: c.reservations[0].id, payType: "CASH" }), `มัดจำ ${b.key}-${i}`);
      }
    }

    // ── เว็บ (publicCreateHold · locale th) ──
    const clientKey = `svcqc-scene-h8-${Date.now()}-${randomBytes(3).toString("hex")}`;
    const fakeStore = { put: async (_p: string, _d: Uint8Array, _c: string) => {}, del: async (_p: string) => 200 };
    const png = () => Uint8Array.from(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(64)]));
    for (const b of FX.webBookings) {
      const roomTypeId = TYPE_BY_NAME.get(b.roomType);
      if (!roomTypeId) throw new Error(`ไม่รู้จักประเภทห้อง ${b.roomType}`);
      const mine = (await webRows()).filter((r) => r.guestEmail === b.guest.email);
      const live = mine.find((r) => (b.status === "HOLD" ? r.status === "HOLD" && r.holdExpiresAt && r.holdExpiresAt > new Date(Date.now() + 60_000) : r.status === "CONFIRMED" && !!r.depositPaidAt));
      if (live) continue;
      if (mine.length) sum.removed += await removeRows(mine);
      const checkIn = sqcAddDays(ANCHOR, b.anchorDayOffset);
      const checkOut = sqcAddDays(checkIn, b.nights);
      const h = await web.publicCreateHold(
        {
          tenantSlug,
          unitSlug,
          checkIn,
          checkOut,
          adults: b.adults,
          children: 0,
          rooms: [{ roomTypeId, qty: b.rooms, ratePlanId: planOf(b.plan), adults: b.adults, children: 0 }],
          guest: b.guest,
          locale: "th",
          spam: { hp: "", st: web.holdFormStart(unitId, new Date(Date.now() - 10_000)) },
          idempotencyKey: `svcqc-h8-${b.key}-${randomBytes(6).toString("hex")}`,
        },
        { clientKey },
      );
      if (!h.ok || !h.publicToken) throw new Error(`จองเว็บ ${b.key}: ${!h.ok ? `${h.code} ${h.reason}` : "ไม่มี publicToken"}`);
      sum.created++;
      if (b.status !== "CONFIRMED") continue;
      const sl = await web.publicAttachSlip({ tenantSlug, unitSlug, publicToken: h.publicToken, file: { data: png(), contentType: "image/png" }, idempotencyKey: `svcqc-h8-slip-${randomBytes(6).toString("hex")}` }, { clientKey, deps: fakeStore });
      if (!sl.ok || !("slipId" in sl)) throw new Error(`สลิป ${b.key}: ${!sl.ok ? `${sl.code} ${sl.reason}` : ""}`);
      must(await slips.decideSlip({ userId: ownerU.userId }, ctx, sl.slipId, { decision: "APPROVE", reason: "ฉาก h.8 — ตรวจกับแอปธนาคารแล้ว", transRef: `SVCQCH8${randomBytes(5).toString("hex").toUpperCase()}` }), `อนุมัติสลิป ${b.key}`);
      await web.onHotelSlipApproved({ tenantId, unitId, payload: { slipId: sl.slipId, domain: "HOTEL" } });
      const row = await prisma.hotelReservation.findUnique({ where: { publicToken: h.publicToken }, select: { status: true } });
      if (row?.status !== "CONFIRMED") throw new Error(`เว็บ ${b.key}: หลังอนุมัติสลิปสถานะ ${row?.status ?? "-"} (ต้อง CONFIRMED)`);
    }
  }
  const wr = await webRows();
  const holdToken = wr.find((r) => r.status === "HOLD")?.publicToken ?? null;
  const confirmedToken = wr.find((r) => r.status === "CONFIRMED")?.publicToken ?? null;
  const ids = { checkIn: ANCHOR, checkOut: ANCHOR_OUT, holdToken, confirmedToken, qs: QS, counter: (await counterRows()).length, web: wr.length };
  console.log(`SCENE_IDS ${JSON.stringify(ids)}`);
  const changed = sum.created + sum.updated + sum.removed > 0;
  console.log(`SCENE_SUMMARY ${JSON.stringify(changed ? { ...sum, checkIn: ANCHOR, checkOut: ANCHOR_OUT, holdToken, confirmedToken, qs: QS } : sum)}`);
} catch (e) {
  console.error(`🔴 ${LABEL}: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

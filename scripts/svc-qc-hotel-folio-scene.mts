// svc-qc-hotel-folio-scene.mts — SVC H.5 · ฉากบิลระหว่างพัก (folio) บนร้าน svcqc หน่วยโรงแรม (ใบสั่ง h.5 §6 · ฟิกซ์เจอร์ SQC_HOTEL_FOLIO_SCENE)
//
// ใช้ (ต้อง seed ร้าน svcqc + ฉาก h.1 + ฉาก h.3 ก่อน — ฉากนี้ต่อยอดการจอง inhouse-web ของ h.3):
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-hotel-folio-scene.mts            # สร้างฉาก (idempotent)
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-hotel-folio-scene.mts --clear    # ลบเฉพาะของฉาก
//
// ฉาก (เขียนผ่าน API ของ H.5 เท่านั้น — ไม่เขียนแถว folio ตรง):
//   • backfill: DEPOSIT ของการจองฉาก h.3 ที่จ่ายมัดจำแล้วแต่ยังไม่มีแถว (folio.postDeposit · idempotent)
//   • inhouse-web: postRoomNights(upToDate = วันนี้) = คืนที่ผ่าน · บิลร้านอาหาร ROOM_CHARGE (reference = เลขห้อง) → consumer pos.sale.paid ลงห้อง ·
//     รายการ manual ตามฟิกซ์เจอร์ (refType "SvcQcScene" = ป้ายฉาก · void แถวที่มี voidReason) · เงินประกันห้อง (เปิดค่าตั้งเฉพาะหน่วย svcqc) ·
//   • บิล ROOM_CHARGE reference ผิด (B999) ⇒ อยู่คิว unmatched · inhouse-ota ไม่มีรายการเพิ่ม
//   • idempotent: มีของแล้ว = ข้าม ⇒ รันซ้ำ SCENE_SUMMARY {"created":0,"updated":0,"removed":0}
//   • --clear: void + ลบบิล POS ของฉาก (note มี mark) · คืนเงินประกัน · ลบแถว folio ของการจองฉากที่ไม่ใช่ DEPOSIT · คืนตารางคืน (folioItemId/postedAuditId) · แถวนอกฉากไม่แตะ
// 🔴 รันผ่าน scripts/qc-svc.sh เท่านั้น (ด่าน host qc-svc ใน loadSvcQcEnv)
// บรรทัดท้าย: SCENE_IDS {...ทุกรอบ} แล้ว SCENE_SUMMARY {"created","updated","removed"(,"reservationId" เมื่อมีการเปลี่ยน)}
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC, SQC_HOTEL_BOOKING_SCENE as BS, SQC_HOTEL_FOLIO_SCENE as FS, SQC_TODAY_BKK } from "./svc-qc-data.mjs";

const LABEL = "svc-qc-hotel-folio-scene";
const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(`${LABEL}: สร้างฉากบิลระหว่างพักบนร้าน svcqc · --clear ลบเฉพาะของฉาก · --backfill โพสต์ DEPOSIT ย้อนหลังอย่างเดียว`);
  process.exit(0);
}
const unknownArgs = argv.filter((a) => a !== "--clear" && a !== "--backfill");
if (unknownArgs.length) {
  console.error(`🔴 ${LABEL}: ไม่รู้จัก ${unknownArgs.join(" ")} (ใช้ได้: --clear · --backfill · --help)`);
  process.exit(2);
}
const clear = argv.includes("--clear");
const backfillOnly = argv.includes("--backfill");
loadSvcQcEnv(LABEL);

const { prisma } = await import("@/lib/core/db");
const hotel = await import("@/lib/modules/hotel");
const pos = await import("@/lib/modules/pos/service");
const settings = await import("@/lib/core/settings");
const { drainAll } = await import("@/lib/outbox-consumers");

const MARK = FS.mark;
const SCENE_REF = "SvcQcScene";
const tenantId = SQC.tenant.id;
const unitId = SQC.units[FS.unit].id;
const ownerU = SQC.users.find((u) => u.key === "owner")!;
const OWNER = { role: ownerU.role, unitAccess: ownerU.unitAccess, permissions: ownerU.permissions, userId: ownerU.userId };
const ctx = { tenantId };
const c = { tenantId, unitId };
const sum = { created: 0, updated: 0, removed: 0 };
type R = { ok: boolean; code?: string; reason?: string };
const must = <T extends R>(r: T, what: string): T => {
  if (!r.ok) throw new Error(`${what}: ${r.code ?? ""} ${r.reason ?? ""}`.trim());
  return r;
};
const noteOf = (key: string) => `${BS.mark} #${key}#`;

const unit = await prisma.businessUnit.findFirst({ where: { id: unitId, tenantId, type: "HOTEL" }, select: { id: true } });
if (!unit) {
  console.error(`🔴 ${LABEL}: ไม่พบหน่วยโรงแรม svcqc (${unitId}) — รัน scripts/seed-svc-qc.mts ก่อน`);
  process.exit(3);
}
const target = () => prisma.hotelReservation.findFirst({ where: { tenantId, unitId, note: noteOf(FS.target.key), status: "CHECKED_IN" } });
const sceneSales = () => prisma.posSale.findMany({ where: { tenantId, note: { contains: MARK } }, select: { id: true, status: true, unitId: true } });

try {
  if (clear) {
    const rows = await prisma.hotelReservation.findMany({ where: { tenantId, unitId, note: { contains: BS.mark } }, select: { id: true, securityDepositSaleId: true } });
    // เงินประกันของฉาก ⇒ คืนผ่าน POS แล้วล้างคอลัมน์
    for (const r of rows.filter((x) => x.securityDepositSaleId)) {
      const x = await hotel.refundSecurityDeposit(OWNER, ctx, { reservationId: r.id });
      if (!x.ok && x.code !== "NO_SECURITY") console.log(`  ⚠️ คืนเงินประกัน ${r.id}: ${x.reason}`);
      await prisma.hotelReservation.updateMany({ where: { id: r.id, tenantId, unitId }, data: { securityDepositSatang: 0, securityDepositSaleId: null } });
      sum.updated++;
    }
    // แถว folio ที่ไม่ใช่ DEPOSIT ของการจองฉาก + คืนตารางคืน
    const ids = rows.map((r) => r.id);
    if (ids.length) {
      const del = await prisma.hotelFolioItem.deleteMany({ where: { tenantId, unitId, folio: { reservationId: { in: ids } }, type: { not: "DEPOSIT" } } });
      sum.removed += del.count;
      await prisma.hotelBookingNight.updateMany({ where: { tenantId, unitId, reservationId: { in: ids }, folioItemId: { not: null } }, data: { folioItemId: null, postedAuditId: null } });
      for (const f of await prisma.hotelFolio.findMany({ where: { tenantId, unitId, reservationId: { in: ids } }, select: { id: true } })) {
        const agg = await prisma.hotelFolioItem.aggregate({ where: { folioId: f.id }, _sum: { amountSatang: true } });
        await prisma.hotelFolio.update({ where: { id: f.id }, data: { balanceSatang: agg._sum.amountSatang ?? 0 } });
      }
    }
    // บิล POS ของฉาก (ร้านอาหารลงห้อง · B999) ⇒ void แล้วลบ (คิว unmatched นับแถวชำระ ROOM_CHARGE ทุกสถานะ — ต้องไม่ค้าง)
    const sales = await sceneSales();
    for (const s of sales.filter((x) => x.status === "PAID")) {
      try {
        await pos.voidSale(tenantId, s.unitId, s.id);
      } catch (e) {
        console.log(`  ⚠️ void บิลฉาก ${s.id}: ${e instanceof Error ? e.message.slice(0, 80) : e}`);
      }
    }
    await drainAll();
    for (const s of sales) {
      await prisma.posSale.deleteMany({ where: { id: s.id, tenantId } });
      sum.removed++;
    }
    await drainAll();
  } else {
    // backfill DEPOSIT (การจองฉาก h.3 ที่มีใบรับมัดจำ)
    const paid = await prisma.hotelReservation.findMany({ where: { tenantId, unitId, note: { contains: BS.mark }, depositPaidAt: { not: null }, depositSaleId: { not: null }, status: { in: ["CONFIRMED", "CHECKED_IN"] } } });
    for (const r of paid) {
      const x = await hotel.postDeposit(c, { reservationId: r.id, saleId: r.depositSaleId, amountSatang: r.depositSatang });
      if (x.posted) sum.created++;
    }
    const t = backfillOnly ? null : await target();
    if (!backfillOnly && !t) throw new Error(`ไม่พบการจอง ${FS.target.key} (CHECKED_IN) — รันฉาก h.3 ก่อน`);
    if (t) {
      // ค่าห้องคืนที่ผ่าน
      const n = must(await hotel.postRoomNights(ctx, { reservationId: t.id, upToDate: SQC_TODAY_BKK }), "postRoomNights");
      if ("posted" in n) sum.created += n.posted;
      const items = () => prisma.hotelFolioItem.findMany({ where: { tenantId, unitId, folio: { reservationId: t.id } } });
      // บิลร้านอาหาร ROOM_CHARGE (reference = เลขห้องของแขก) ⇒ consumer ลงห้อง
      if (!(await items()).some((i) => i.type === "POS_CHARGE")) {
        const room = t.roomId ? await prisma.hotelRoom.findFirst({ where: { id: t.roomId }, select: { number: true } }) : null;
        if (!room) throw new Error("แขก inhouse-web ไม่มีห้อง");
        const sysId = await prisma.appSystemUnit.findFirst({ where: { tenantId, unitId, type: "POS" }, select: { systemId: true } });
        if (!sysId) throw new Error("หน่วยโรงแรม svcqc ไม่ผูก POS (reseed)");
        const total = FS.roomChargeSale.lines.reduce((s2, l) => s2 + l.qty * l.unitPriceSatang, 0);
        const sale = await pos.createSale({
          tenantId,
          unitId,
          systemId: sysId.systemId,
          sourceModule: "POS",
          idempotencyKey: `svcqc-h5-food-${t.id}`,
          lines: FS.roomChargeSale.lines.map((l) => ({ ...l })),
          payMethods: [{ type: "ROOM_CHARGE", amountSatang: total, reference: room.number }],
          note: `${FS.roomChargeSale.note} · ${MARK}`,
        });
        await drainAll();
        await hotel.onPosSalePaidRoomCharge({ tenantId, payload: { saleId: sale.saleId } });
        sum.created++;
      }
      // รายการ manual (ป้ายฉาก refType SvcQcScene · refId h5:m<i>) + void แถวที่มีเหตุผล
      for (const [i, m] of FS.manual.entries()) {
        const key = `h5:m${i}`;
        let row = (await items()).find((x) => x.refType === SCENE_REF && x.refId === key && x.type !== "VOID_REVERSAL");
        if (!row) {
          const r = must(await hotel.postFolioItem(OWNER, ctx, { reservationId: t.id, type: m.type, description: m.description, qty: m.qty, unitAmountSatang: m.unitAmountSatang, refType: SCENE_REF, refId: key }), `ลงรายการ ${key}`);
          row = (await items()).find((x) => "itemId" in r && x.id === r.itemId);
          sum.created++;
        }
        if (m.voidReason && row && !row.voidedAt) {
          must(await hotel.voidFolioItem(OWNER, ctx, { itemId: row.id, reason: m.voidReason }), `void ${key}`);
          sum.updated++;
        }
      }
      // เงินประกันห้อง (เปิดค่าตั้งเฉพาะหน่วย svcqc)
      const sec = await settings.resolveSettings({ tenantId }, ["rooms.hotel.securityDeposit.enabled"], { unitId });
      if (sec["rooms.hotel.securityDeposit.enabled"]?.value !== true) {
        must(await settings.setSettings(OWNER, { tenantId }, [{ key: "rooms.hotel.securityDeposit.enabled", scope: "UNIT", scopeId: unitId, value: true }]), "เปิดเงินประกัน");
        sum.updated++;
      }
      const g = must(await hotel.getFolio(OWNER, ctx, { reservationId: t.id }), "getFolio");
      if ("folio" in g && g.folio.security.state !== "HELD") {
        const x = must(await hotel.takeSecurityDeposit(OWNER, ctx, { reservationId: t.id, amountSatang: FS.securityDeposit.amountSatang, payType: FS.securityDeposit.payType }), "รับเงินประกัน");
        if (!("duplicated" in x && x.duplicated)) sum.created++;
      }
      // บิล ROOM_CHARGE reference ผิด ⇒ คิว unmatched
      const unKey = `svcqc-h5-unmatched-${t.id}`;
      if (!(await prisma.posSale.findFirst({ where: { tenantId, idempotencyKey: unKey }, select: { id: true } }))) {
        const sysId = await prisma.appSystemUnit.findFirst({ where: { tenantId, unitId, type: "POS" }, select: { systemId: true } });
        if (!sysId) throw new Error("หน่วยโรงแรม svcqc ไม่ผูก POS (reseed)");
        const total = FS.unmatchedSale.lines.reduce((s2, l) => s2 + l.qty * l.unitPriceSatang, 0);
        const sale = await pos.createSale({
          tenantId,
          unitId,
          systemId: sysId.systemId,
          sourceModule: "POS",
          idempotencyKey: unKey,
          lines: FS.unmatchedSale.lines.map((l) => ({ ...l })),
          payMethods: [{ type: "ROOM_CHARGE", amountSatang: total, reference: FS.unmatchedSale.reference }],
          note: `ห้องอาหาร · ${MARK}`,
        });
        await drainAll();
        await hotel.onPosSalePaidRoomCharge({ tenantId, payload: { saleId: sale.saleId } });
        sum.created++;
      }
    }
  }
  const t = await target();
  console.log(`SCENE_IDS ${JSON.stringify({ reservationId: t?.id ?? null, SVC_VIS_H5_RES_ID: t?.id ?? null })}`);
  const changed = sum.created + sum.updated + sum.removed > 0;
  console.log(`SCENE_SUMMARY ${JSON.stringify(changed ? { ...sum, reservationId: t?.id ?? null } : sum)}`);
} catch (e) {
  console.error(`🔴 ${LABEL}: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

// svc-qc-hotel-ota-scene.mts — SVC H.10 · ฉากช่องทาง OTA (ตัวต่อ FAKE) บนร้าน svcqc หน่วยโรงแรม (ใบสั่ง h.10 §6 · §10.11)
//
// ใช้ (ต้อง seed ร้าน svcqc + ฉาก h.1 ก่อน · ฉาก h.3/h.2/h.5/h.8 ใช้ห้องชุดเดียวกัน ⇒ --clear ฉากเหล่านั้นก่อนรันครั้งแรก):
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-hotel-ota-scene.mts            # สร้างฉาก (idempotent)
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-hotel-ota-scene.mts --clear    # ลบเฉพาะของฉาก
//
// ฉาก = SQC_HOTEL_OTA_SCENE เท่านั้น (ไม่มีตัวเลข/ชื่อในสคริปต์ · วันสัมพัทธ์ SQC_TODAY_BKK + offset):
//   1) ตัวต่อ TenantIntegration id คงที่ (kind CHANNEL_MANAGER · provider FAKE · หน่วยโรงแรม · CONNECTED · คีย์ปิดกล่องด้วย INTEGRATIONS_CREDENTIALS_KEY ของ .env.qc-svc)
//   2) ค่าตั้ง ota.* ของหน่วย (ต่างเท่านั้นถึงตั้ง) · 3) แม็ปห้อง/แผน/buffer ผ่าน saveRoomMap/saveRateMap/saveBuffer (ผู้กระทำ = เจ้าของ svcqc)
//   4) การจองเคาน์เตอร์ (ทำซูพีเรียเต็มวัน +5 · note = "<mark> #<key>#") ผ่าน createBooking
//   5) inbound 4 แถว: ป้อนคิวทดสอบของ FAKE → pullAll (จำกัดตัวต่อฉาก) ⇒ APPLIED 2 · REJECTED 1 · NEEDS_ROOM 1 · gross = Σ ราคา STANDARD ฉาก h.1 × (1 + markup) · ค่าคอมฯ ตาม channelCommission
//   6) งาน ARI 1 ชุด วันนี้ → +6 (enqueueAri · ไม่ส่งจริง)
// idempotent: อ่านเทียบก่อน ต่างเท่านั้นถึงเขียน · รันซ้ำ = SCENE_SUMMARY 0/0/0
// --clear: ยกเลิกการจองของฉาก (OTA ของตัวต่อฉาก + เคาน์เตอร์ mark) → ปล่อยห้องจริงที่ค้าง → ลบแถวการจอง/inbox/งาน/แม็ป/buffer/ตัวต่อ → คืนค่าตั้ง ota.*
// 🔴 รันผ่าน scripts/qc-svc.sh เท่านั้น (ด่าน host qc-svc ใน loadSvcQcEnv) · ตั้ง INTEGRATIONS_FAKE=1 ในโพรเซสนี้เอง (ผู้ให้บริการทดสอบ)
// บรรทัดท้าย: SCENE_SUMMARY {"created":n,"updated":n,"removed":n}
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC, SQC_HOTEL_OTA_SCENE as FX, SQC_HOTEL_RATES, SQC_HOTEL_TYPES, SQC_TODAY_BKK, sqcAddDays } from "./svc-qc-data.mjs";

const LABEL = "svc-qc-hotel-ota-scene";
const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(`${LABEL}: สร้างฉากช่องทาง OTA (ตัวต่อ FAKE) บนร้าน svcqc · --clear ลบเฉพาะของฉาก`);
  process.exit(0);
}
const unknownArgs = argv.filter((a) => a !== "--clear");
if (unknownArgs.length) {
  console.error(`🔴 ${LABEL}: ไม่รู้จัก ${unknownArgs.join(" ")} (ใช้ได้: --clear · --help)`);
  process.exit(2);
}
const clear = argv.includes("--clear");
loadSvcQcEnv(LABEL);
process.env.INTEGRATIONS_FAKE = "1";

const { prisma } = await import("@/lib/core/db");
const hotel = await import("@/lib/modules/hotel");
const channel = await import("@/lib/modules/hotel/channel");
const rooms = await import("@/lib/modules/rooms");
const settings = await import("@/lib/core/settings");
const box = await import("@/lib/core/integrations/secret-box");
const { channelCommission } = await import("@/lib/modules/pos/channel-shared");

const MARK = FX.mark;
const CID = FX.connector.id;
const tenantId = SQC.tenant.id;
const unitId = SQC.units[FX.unit].id;
const ownerU = SQC.users.find((u) => u.key === "owner")!;
const OWNER = { role: ownerU.role, unitAccess: ownerU.unitAccess, permissions: ownerU.permissions, userId: ownerU.userId };
const ctx = { tenantId };
const sum = { created: 0, updated: 0, removed: 0 };
const TYPE_BY_NAME = new Map<string, string>(Object.values(SQC_HOTEL_TYPES).map((t) => [t.name, t.id]));
const typeId = (name: string): string => {
  const id = TYPE_BY_NAME.get(name);
  if (!id) throw new Error(`ไม่รู้จักประเภทห้อง ${name}`);
  return id;
};
const noteOf = (key: string) => `${MARK} #${key}#`;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
type R = { ok: boolean; code?: string; reason?: string };
const must = <T extends R>(r: T, what: string): T => {
  if (!r.ok) throw new Error(`${what}: ${r.code ?? ""} ${r.reason ?? ""}`.trim());
  return r;
};
const OTA_KEYS = Object.keys(FX.settings);
// เทียบ JSON แบบไม่ขึ้นกับลำดับคีย์ (jsonb เรียงคีย์ใหม่) — ใช้ ariHash (stableJson) ของโมดูลช่องทาง

const unit = await prisma.businessUnit.findFirst({ where: { id: unitId, tenantId, type: "HOTEL" }, select: { id: true } });
if (!unit) {
  console.error(`🔴 ${LABEL}: ไม่พบหน่วยโรงแรม svcqc (${unitId}) — รัน scripts/seed-svc-qc.mts ก่อน`);
  process.exit(3);
}

/** การจองของฉาก: OTA ของตัวต่อฉาก + เคาน์เตอร์ที่มี mark */
const sceneRows = () => prisma.hotelReservation.findMany({ where: { tenantId, unitId, OR: [{ channelConnectionId: CID }, { note: { contains: MARK } }] }, orderBy: [{ createdAt: "asc" }, { code: "asc" }] });

async function clearScene(): Promise<void> {
  const rows = await sceneRows();
  for (const r of rows.filter((x) => x.status === "HOLD" || x.status === "CONFIRMED")) {
    const c = await hotel.cancelBooking(OWNER, ctx, { unitId, reservationId: r.id, reason: "SvcQcScene:clear" });
    if (!c.ok) console.log(`  ⚠️ ยกเลิก ${r.code} ไม่สำเร็จ: ${c.reason}`);
  }
  const ids = rows.map((r) => r.id);
  await prisma.$transaction(
    async (tx) => {
      if (ids.length) {
        const occ = await tx.roomOccupancy.findMany({ where: { tenantId, unitId, refType: "HotelReservation", refId: { in: ids }, active: true }, select: { id: true } });
        for (const o of occ) await rooms.releaseOccupancy(tx, { tenantId, unitId, occupancyId: o.id, reason: "SvcQcScene:clear" });
        sum.removed += (await tx.hotelReservation.deleteMany({ where: { tenantId, unitId, id: { in: ids } } })).count;
      }
      for (const t of ["channelReservationInbox", "channelAriJob", "channelRoomMap", "channelRateMap", "channelInventoryBuffer"] as const) {
        const d = await (tx[t] as unknown as { deleteMany: (a: { where: { tenantId: string; connectionId: string } }) => Promise<{ count: number }> }).deleteMany({ where: { tenantId, connectionId: CID } });
        sum.removed += d.count;
      }
      await tx.integrationCallLog.deleteMany({ where: { tenantId, integrationId: CID } });
      sum.removed += (await tx.tenantIntegration.deleteMany({ where: { tenantId, id: CID } })).count;
    },
    { timeout: 60_000, maxWait: 15_000 },
  );
  for (const key of OTA_KEYS) {
    const cur = await prisma.settingValue.count({ where: { tenantId, key, scope: "UNIT", scopeId: unitId } });
    if (!cur) continue;
    try {
      await settings.resetSetting(OWNER, ctx, { key, scope: "UNIT", scopeId: unitId });
      sum.removed++;
    } catch {
      console.log(`  ⚠️ คืนค่าตั้ง ${key} ไม่สำเร็จ`);
    }
  }
}

async function buildScene(): Promise<void> {
  // 1) ตัวต่อ FAKE (id คงที่) — คีย์ปิดกล่องด้วย AAD tenantId:id แบบศูนย์เชื่อมต่อ
  if (!box.integrationSecretKeyConfigured()) throw new Error("ไม่มี INTEGRATIONS_CREDENTIALS_KEY (.env.qc-svc) — ปิดกล่องคีย์ตัวต่อไม่ได้");
  const conn = await prisma.tenantIntegration.findFirst({ where: { id: CID } });
  if (conn && conn.tenantId !== tenantId) throw new Error(`id ตัวต่อ ${CID} เป็นของร้านอื่น`);
  const fields = { ...FX.connector.fields } as Record<string, string>;
  const want = { kind: FX.connector.kind, provider: FX.connector.provider, label: FX.connector.label, unitIds: [unitId], status: "CONNECTED" };
  if (!conn) {
    await prisma.tenantIntegration.create({
      data: {
        id: CID,
        tenantId,
        ...want,
        publicFields: fields,
        secretBox: box.sealIntegrationSecret({ apiKey: `svcqc-ota-${CID}` }, `${tenantId}:${CID}`),
        secretNames: ["apiKey"],
        onFailure: "MANUAL",
        lastTestAt: new Date(),
        lastTestOk: true,
        createdById: ownerU.userId,
        updatedById: ownerU.userId,
      },
    });
    sum.created++;
  } else if (conn.status !== "CONNECTED" || JSON.stringify(conn.unitIds) !== JSON.stringify([unitId]) || channel.ariHash(conn.publicFields) !== channel.ariHash(fields) || conn.label !== want.label) {
    await prisma.tenantIntegration.update({ where: { id: CID }, data: { ...want, publicFields: fields, consecutiveFailures: 0, updatedById: ownerU.userId } });
    sum.updated++;
  }

  // 2) ค่าตั้ง ota.* ของหน่วย (ต่างเท่านั้น)
  const cur = await settings.resolveSettings(ctx, OTA_KEYS, { unitId });
  const changes = OTA_KEYS.filter((k) => JSON.stringify(cur[k]?.value) !== JSON.stringify(FX.settings[k])).map((key) => ({ key, scope: "UNIT" as const, scopeId: unitId, value: FX.settings[key] }));
  if (changes.length) {
    const r = await settings.setSettings(OWNER, ctx, changes);
    if (!r.ok) throw new Error(`ตั้งค่า ota: ${JSON.stringify(r).slice(0, 300)}`);
    sum.updated += changes.length;
  }

  // 3) แม็ปห้อง/แผน/buffer
  const plans = await prisma.hotelRatePlan.findMany({ where: { tenantId, unitId }, select: { id: true, code: true } });
  const planId = (key: string) => {
    const code = SQC_HOTEL_RATES.plans.find((p) => p.key === key)?.code;
    const p = plans.find((x) => x.code === code);
    if (!p) throw new Error(`ไม่พบแผน ${key} (${code}) — รันฉาก h.1 ก่อน`);
    return p.id;
  };
  for (const m of FX.roomMaps) {
    const rt = typeId(m.roomType);
    const have = await prisma.channelRoomMap.findFirst({ where: { connectionId: CID, roomTypeId: rt } });
    if (have?.active && have.externalRoomId === m.externalRoomId) continue;
    must(await channel.saveRoomMap(OWNER, ctx, { unitId, connectionId: CID, roomTypeId: rt, externalRoomId: m.externalRoomId }), `แม็ปห้อง ${m.externalRoomId}`);
    if (have) sum.updated++;
    else sum.created++;
  }
  for (const m of FX.rateMaps) {
    const rp = planId(m.plan);
    const have = await prisma.channelRateMap.findFirst({ where: { connectionId: CID, ratePlanId: rp } });
    const haveBp = have && typeof have.formula === "object" && have.formula !== null && !Array.isArray(have.formula) ? (have.formula as Record<string, unknown>).markupBp : undefined;
    if (have && have.externalRateId === m.externalRateId && haveBp === m.markupBp) continue;
    must(await channel.saveRateMap(OWNER, ctx, { unitId, connectionId: CID, ratePlanId: rp, externalRateId: m.externalRateId, markupBp: m.markupBp }), `แม็ปแผน ${m.externalRateId}`);
    if (have) sum.updated++;
    else sum.created++;
  }
  for (const b of FX.buffers) {
    const rt = typeId(b.roomType);
    const have = await prisma.channelInventoryBuffer.findFirst({ where: { connectionId: CID, roomTypeId: rt } });
    if (have?.rooms === b.rooms) continue;
    must(await channel.saveBuffer(OWNER, ctx, { unitId, connectionId: CID, roomTypeId: rt, rooms: b.rooms }), `กันห้อง ${b.roomType}`);
    if (have) sum.updated++;
    else sum.created++;
  }

  // 4) เคาน์เตอร์ทำซูพีเรียเต็มวัน +5
  for (const b of FX.counterBookings) {
    if ((await prisma.hotelReservation.count({ where: { tenantId, unitId, note: noteOf(b.key) } })) > 0) continue;
    const checkIn = sqcAddDays(SQC_TODAY_BKK, b.checkInOffset);
    const created = await hotel.createBooking(OWNER, ctx, {
        unitId,
        rooms: Array.from({ length: b.rooms }, () => ({ roomTypeId: typeId(b.roomType), adults: b.adults, children: 0 })),
        checkIn,
        checkOut: sqcAddDays(checkIn, b.nights),
        ratePlanId: planId(b.plan),
        source: "PHONE",
        guest: { name: b.guest },
        note: noteOf(b.key),
      });
    if (!created.ok) throw new Error(`จองเคาน์เตอร์ ${b.key}: ${created.code} ${created.reason}`);
    sum.created += created.reservations.length;
  }

  // 5) inbound ผ่านคิวทดสอบของ FAKE → pullAll (เฉพาะตัวต่อฉาก) — แถวที่มีใน inbox แล้ว = ข้าม
  const have = await prisma.channelReservationInbox.findMany({ where: { connectionId: CID }, select: { externalId: true, version: true } });
  const todo = FX.inbound.filter((r) => !have.some((h) => h.externalId === r.externalId && h.version === r.version));
  if (todo.length) {
    const rows = [];
    for (const r of todo) {
      const checkIn = sqcAddDays(SQC_TODAY_BKK, r.checkInOffset);
      const checkOut = sqcAddDays(checkIn, r.nights);
      const map = FX.roomMaps.find((m) => m.externalRoomId === r.externalRoomId);
      let gross = 0;
      if (map) {
        const pc = await hotel.loadPricingContext(ctx, unitId, { from: checkIn, to: sqcAddDays(checkOut, -1) });
        const q = pc ? hotel.quoteStay({ ...pc, today: SQC_TODAY_BKK }, { roomTypeId: typeId(map.roomType), ratePlanId: planId("standard"), checkIn, checkOut, limits: { minNights: null, maxNights: null, closedToArrival: false, maxAdvanceBookingDays: 400 } }) : null;
        if (!q?.ok) throw new Error(`ราคาฉาก ${r.externalId}: ${q && !q.ok ? q.error : "ไม่มีบริบทราคา"}`);
        gross = q.nights.reduce((a, n) => a + channel.markupPrice(n.priceSatang, { markupBp: FX.rateMaps[0].markupBp }), 0);
      } else {
        gross = 100_000 * r.nights; // ห้องไม่แม็ป (ถูกปฏิเสธ) — ยอดไม่มีผล
      }
      const commission = channelCommission(gross, { commissionBp: r.commissionBp, commissionFixedSatang: 0, commissionVatBp: 0 }).commissionSatang;
      rows.push({
        externalId: r.externalId,
        version: r.version,
        status: r.status,
        externalRoomId: r.externalRoomId,
        externalRateId: r.externalRateId,
        checkIn,
        checkOut,
        rooms: 1,
        adults: r.adults,
        children: 0,
        guest: { name: r.guest.name, phone: r.guest.phone, email: r.guest.email },
        grossSatang: gross,
        commissionSatang: commission,
        netSatang: gross - commission,
        prepaid: r.prepaid,
        raw: { source: "FAKE-OTA", scene: MARK, bookingRef: r.externalId, rev: r.version, guest: { ...r.guest }, price: { gross, commission } },
      });
    }
    must(await channel.fakeEnqueueInbound(CID, rows), "ป้อนคิวทดสอบ");
    await channel.pullAll(new Date(), 60_000, { tenantId, connectionIds: [CID] });
    const after = await prisma.channelReservationInbox.count({ where: { connectionId: CID } });
    sum.created += Math.max(0, after - have.length);
  }

  // 6) งาน ARI วันนี้ → +6 (ไม่ส่ง · มีงานครอบแล้ว = ข้าม)
  const from = SQC_TODAY_BKK;
  const to = sqcAddDays(SQC_TODAY_BKK, FX.ari.days - 1);
  const jobs = await prisma.channelAriJob.findMany({ where: { connectionId: CID }, select: { dateFrom: true, dateTo: true } });
  if (!jobs.some((j) => ymd(j.dateFrom) <= from && to <= ymd(j.dateTo))) {
    sum.created += await channel.enqueueAri(tenantId, unitId, from, to);
  }
}

try {
  if (clear) await clearScene();
  else await buildScene();
  console.log(`SCENE_SUMMARY ${JSON.stringify(sum)}`);
} catch (e) {
  console.error(`🔴 ${LABEL}: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

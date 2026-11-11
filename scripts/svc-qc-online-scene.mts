// svc-qc-online-scene.mts — SVC B.7 · ฉากจองออนไลน์ (ภาพ จอง 03 ก ข ค · คุณแพรว ดัดผม ช่างนุ่น 15:30) บนร้าน svcqc หน่วยบาร์เบอร์
//
// ใช้:
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-online-scene.mts            # สร้าง/ปรับฉาก ณ วันฉาก
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-online-scene.mts --clear    # ลบนัดฉาก + Party ฉาก
//
// ฉาก: วันฉาก = sqcOnlineSceneDay (วันฉาก B.5 + 14 · เสาร์ · ไม่ชนฉาก B.5/B.6) · อ่านจาก SQC_ONLINE_SCENE + SQC เท่านั้น
//   1) แม่แบบ BARBER (KEEP_CUSTOM ในนามเจ้าของ svcqc)
//   2) Party ตายตัว (SQC_ONLINE_SCENE.party · ตัวตนจากลิงก์เซ็น booking.identity)
//   3) นัดช่างนุ่นตาม SQC_ONLINE_SCENE.bookings (bookAppointment ช่อง STAFF · idempotencyKey = idemPrefix + วันฉาก + "-" + key · PENDING ⇒ CONFIRMED)
//      ⇒ ขั้น 2 มีเวลาขีดฆ่า และ 15:30 ว่าง
// idempotent: ครบแล้ว ⇒ SCENE_SUMMARY 0/0/0 · วันฉากเปลี่ยน/ไม่ครบ ⇒ ลบนัดฉากเก่า (prefix) แล้วสร้างใหม่
// 🔴 รันผ่าน scripts/qc-svc.sh เท่านั้น (ด่าน host qc-svc ใน loadSvcQcEnv)
// บรรทัดท้าย: SCENE_SUMMARY {"created":n,"updated":n,"removed":n}
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC, SQC_ONLINE_SCENE as OSC, sqcOnlineSceneDay } from "./svc-qc-data.mjs";

const LABEL = "svc-qc-online-scene";
loadSvcQcEnv(LABEL);
if (process.env.CI) {
  console.error(`🔴 ${LABEL}: ห้าม export CI`);
  process.exit(4);
}
const argv = process.argv.slice(2);
const unknown = argv.filter((a) => a !== "--clear");
if (unknown.length) {
  console.error(`🔴 ${LABEL}: ไม่รู้จัก ${unknown.join(" ")} (ใช้ได้: --clear)`);
  process.exit(2);
}
const clear = argv.includes("--clear");

const { prisma } = await import("@/lib/core/db");
const { applyTemplate } = await import("@/lib/core/settings");
const { bookAppointment, setAppointmentStatus } = await import("@/lib/modules/booking/service");

const tenantId = SQC.tenant.id;
const unitId = SQC.units.barber.id;
const ctx = { tenantId, unitId };
const D = sqcOnlineSceneDay(new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10));
const PREFIX = OSC.idemPrefix;
const keyOf = (day: string, k: string) => `${PREFIX}${day}-${k}`;
const owner = SQC.users.find((u) => u.key === "owner")!;
const OWNER = { role: "OWNER" as const, unitAccess: ["*"], permissions: {}, userId: owner.userId };
const hm = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};

const sum = { created: 0, updated: 0, removed: 0 };

/** นัดของฉาก (ทุกวัน) ตาม prefix */
async function sceneAppts(): Promise<{ id: string; idempotencyKey: string | null }[]> {
  return prisma.appointment.findMany({ where: { tenantId, unitId, idempotencyKey: { startsWith: PREFIX } }, select: { id: true, idempotencyKey: true } });
}

async function removeAppts(ids: string[]): Promise<void> {
  if (!ids.length) return;
  sum.removed += (await prisma.appointment.deleteMany({ where: { tenantId, unitId, id: { in: ids } } })).count;
}

async function serviceIdOf(sku: string): Promise<string> {
  const s = SQC.barber.services.find((x: { sku: string }) => x.sku === sku) as { sku: string; name: string } | undefined;
  if (!s) throw new Error(`ไม่รู้จักบริการ ${sku} ใน SQC`);
  const items = await prisma.invItem.findMany({ where: { tenantId, sku }, select: { id: true } });
  const proj = items.length
    ? await prisma.bookingService.findFirst({ where: { tenantId, unitId, itemId: { in: items.map((i) => i.id) } }, select: { id: true } })
    : null;
  const byName = proj ?? (await prisma.bookingService.findFirst({ where: { tenantId, unitId, name: s.name }, select: { id: true } }));
  if (!byName) throw new Error(`ไม่พบบริการ ${sku} ${s.name} ของหน่วยบาร์เบอร์ — รัน seed ก่อน`);
  return byName.id;
}

/** Party ฉาก (id ตายตัว) — สร้าง/ปรับให้ตรง */
async function ensureParty(): Promise<void> {
  const p = OSC.party;
  const row = await prisma.party.findUnique({ where: { id: p.id }, select: { tenantId: true, name: true, phone: true, phoneNorm: true, mergedIntoId: true } });
  if (!row) {
    await prisma.party.create({ data: { id: p.id, tenantId, name: p.name, phone: p.phone, phoneNorm: p.phone } });
    sum.created++;
  } else if (row.tenantId !== tenantId) {
    throw new Error(`Party ${p.id} เป็นของร้านอื่น — หยุด`);
  } else if (row.name !== p.name || row.phone !== p.phone || row.phoneNorm !== p.phone || row.mergedIntoId !== null) {
    await prisma.party.update({ where: { id: p.id }, data: { name: p.name, phone: p.phone, phoneNorm: p.phone, mergedIntoId: null } });
    sum.updated++;
  }
}

async function buildDay(): Promise<void> {
  for (const b of OSC.bookings) {
    const r = await bookAppointment(ctx, {
      serviceId: await serviceIdOf(b.sku), staffId: OSC.pick.staffId, dateStr: D, startMin: hm(b.start), channel: "STAFF",
      customerName: b.name, customerPhone: b.phone, idempotencyKey: keyOf(D, b.key),
    });
    if (!r.ok) throw new Error(`จอง ${b.key} ${b.start} ล้ม ${r.code} ${r.reason}`);
    sum.created++;
    if (r.status === "PENDING") {
      const c = await setAppointmentStatus(tenantId, unitId, r.id, "CONFIRMED");
      if (!c.ok) throw new Error(`ยืนยัน ${b.key}: ${c.reason}`);
    }
  }
}

let exitCode = 0;
try {
  const unit = await prisma.businessUnit.findFirst({ where: { id: unitId, tenantId, type: "BOOKING" }, select: { id: true } });
  const staffN = await prisma.bookingStaff.count({ where: { tenantId, unitId, active: true } });
  if (!unit || staffN !== 4) {
    console.error(`🔴 ${LABEL}: หน่วยบาร์เบอร์ svcqc ไม่พร้อม (ช่าง ${staffN} · ต้อง 4) — รัน scripts/seed-svc-qc.mts ก่อน`);
    process.exit(3);
  }
  if (clear) {
    await removeAppts((await sceneAppts()).map((a) => a.id));
    const p = await prisma.party.findFirst({ where: { id: OSC.party.id, tenantId }, select: { id: true } });
    if (p) {
      await prisma.appointment.updateMany({ where: { tenantId, partyId: p.id }, data: { partyId: null } });
      sum.removed += (await prisma.party.deleteMany({ where: { id: p.id, tenantId } })).count;
    }
    console.log(`${LABEL}: --clear ลบนัดฉาก (ทุกวัน) + Party ฉาก`);
  } else {
    const tpl = await applyTemplate(OWNER, { tenantId }, { unitId, domain: "booking", templateKey: "BARBER", overwrite: "KEEP_CUSTOM" });
    if (!tpl.ok) throw new Error(`applyTemplate BARBER: ${tpl.code} ${JSON.stringify(tpl.issues ?? null).slice(0, 200)}`);
    await ensureParty();
    const rows = await sceneAppts();
    const want = new Set(OSC.bookings.map((b) => keyOf(D, b.key)));
    const live = rows.length
      ? await prisma.appointment.count({ where: { tenantId, unitId, id: { in: rows.map((r) => r.id) }, status: "CONFIRMED" } })
      : 0;
    const complete = rows.length === want.size && rows.every((r) => want.has(r.idempotencyKey ?? "")) && live === want.size;
    if (complete) {
      console.log(`${LABEL}: นัดฉากวัน ${D} ครบแล้ว (${rows.length}) — ไม่สร้างใหม่`);
    } else {
      await removeAppts(rows.map((r) => r.id));
      await buildDay();
      console.log(`${LABEL}: สร้างฉากวัน ${D} แล้ว (ช่างนุ่น ${OSC.bookings.map((b) => b.start).join(" · ")} · ${OSC.pick.time} ว่าง)`);
    }
  }
} catch (e) {
  exitCode = 1;
  console.error(`🔴 ${LABEL}: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  await prisma.$disconnect();
}
console.log(`SCENE_SUMMARY ${JSON.stringify(sum)}`);
process.exit(exitCode);

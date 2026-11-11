// svc-qc-booking-settings-scene.mts — SVC B.11 · ฉากจอตั้งค่าจองคิวของร้าน svcqc (ภาพ จอง 08 · 11 · 12 ส่วนคน · 14 · README "ปรับจากแม่แบบ 6 ข้อ")
//
// ใช้:
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-booking-settings-scene.mts            # ตั้งฉาก (รันซ้ำ = 0/0/0)
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-booking-settings-scene.mts --clear    # คืนค่าที่ฉากตั้ง (ไม่ลบโปรไฟล์แม่แบบ)
//
// ฉาก (ค่าจาก SQC_BOOKING_SETTINGS_SCENE + SQC เท่านั้น):
//   บาร์เบอร์ = แม่แบบ BARBER (KEEP_CUSTOM) · unitDiffs 6 ข้อ · noise (เท่าแม่แบบ) · % ออนไลน์รายช่าง 3 คน
//   ร้านนวด   = แม่แบบ SPA · ค่าร้าน · % ออนไลน์รายคน · ค่าคอมฯ รายคน · ค่ารายบริการ · ใครทำได้ (ราคา/เวลาเฉพาะคน)
//   ผู้กระทำ = เจ้าของ svcqc ผ่านเครื่องยนต์ (applyTemplate · setSettings · resetSetting) + setStaffService ของใบ B.11
// 🔴 รันผ่าน scripts/qc-svc.sh เท่านั้น (ด่าน host qc-svc ใน loadSvcQcEnv)
// บรรทัดท้าย: SCENE_SUMMARY {"created":n,"updated":n,"removed":n}
import { isDeepStrictEqual } from "node:util";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC, SQC_BOOKING_SETTINGS_SCENE as SCN } from "./svc-qc-data.mjs";

const LABEL = "svc-qc-booking-settings-scene";
loadSvcQcEnv(LABEL);

const argv = process.argv.slice(2);
const unknown = argv.filter((a) => a !== "--clear");
if (unknown.length) {
  console.error(`🔴 ${LABEL}: ไม่รู้จัก ${unknown.join(" ")} (ใช้ได้: --clear)`);
  process.exit(2);
}
const clear = argv.includes("--clear");

const { prisma } = await import("@/lib/core/db");
const S = await import("@/lib/core/settings");
const BK = await import("@/lib/modules/booking");

const tenantId = SQC.tenant.id;
const ctx = { tenantId };
const ownerUser = SQC.users.find((u) => u.key === "owner");
if (!ownerUser) {
  console.error(`🔴 ${LABEL}: ไม่มีผู้ใช้ owner ใน SQC`);
  process.exit(3);
}
const owner = { role: "OWNER" as const, unitAccess: ["*"], permissions: {}, userId: ownerUser.userId };
const UB = SQC.units.barber.id;
const UM = SQC.units.massage.id;

const sum = { created: 0, updated: 0, removed: 0 };
let exitCode = 0;

type Row = { key: string; scope: string; scopeId: string; value: unknown; unitId: string };

async function idsByName(model: "bookingStaff" | "bookingService", unitId: string): Promise<Map<string, string>> {
  const rows =
    model === "bookingStaff"
      ? await prisma.bookingStaff.findMany({ where: { tenantId, unitId, active: true }, select: { id: true, name: true } })
      : await prisma.bookingService.findMany({ where: { tenantId, unitId, active: true }, select: { id: true, name: true } });
  return new Map(rows.map((r) => [r.name, r.id]));
}

function need(m: Map<string, string>, name: string, what: string): string {
  const id = m.get(name);
  if (!id) throw new Error(`ไม่พบ${what} "${name}" ในร้าน svcqc — รัน seed ก่อน`);
  return id;
}

try {
  const [units, bStaff, mStaff, mSvc] = await Promise.all([
    prisma.businessUnit.count({ where: { tenantId, id: { in: [UB, UM] }, type: "BOOKING" } }),
    idsByName("bookingStaff", UB),
    idsByName("bookingStaff", UM),
    idsByName("bookingService", UM),
  ]);
  if (units !== 2) throw new Error("ร้าน svcqc ยังไม่มีบาร์เบอร์/ร้านนวด — รัน scripts/seed-svc-qc.mts ก่อน");

  const rows: Row[] = [
    ...SCN.barber.unitDiffs.map((d) => ({ key: d.key, scope: "UNIT", scopeId: UB, value: d.value as unknown, unitId: UB })),
    ...SCN.barber.noise.map((d) => ({ key: d.key, scope: "UNIT", scopeId: UB, value: d.value as unknown, unitId: UB })),
    ...Object.entries(SCN.barber.staffOnlinePct).map(([n, v]) => ({ key: "booking.booking.onlineSharePct", scope: "STAFF", scopeId: need(bStaff, n, "ช่าง"), value: v as unknown, unitId: UB })),
    ...SCN.massage.unitValues.map((d) => ({ key: d.key, scope: "UNIT", scopeId: UM, value: d.value as unknown, unitId: UM })),
    ...Object.entries(SCN.massage.staffOnlinePct).map(([n, v]) => ({ key: "booking.booking.onlineSharePct", scope: "STAFF", scopeId: need(mStaff, n, "หมอนวด"), value: v as unknown, unitId: UM })),
    ...Object.entries(SCN.massage.staffCommissionBp).map(([n, v]) => ({
      key: "booking.money.commissionRate",
      scope: "STAFF",
      scopeId: need(mStaff, n, "หมอนวด"),
      value: { serviceBp: v, productBp: 0 } as unknown,
      unitId: UM,
    })),
    ...SCN.massage.serviceValues.map((d) => ({ key: d.key, scope: "SERVICE", scopeId: need(mSvc, d.service, "บริการ"), value: d.value as unknown, unitId: UM })),
  ];
  const scenStaff = SCN.massage.staffServices.map((x) => need(mStaff, x.staff, "หมอนวด"));

  const existing = async (r: Row) =>
    prisma.settingValue.findFirst({ where: { tenantId, key: r.key, scope: r.scope, scopeId: r.scopeId }, select: { value: true } });

  if (clear) {
    for (const r of rows) {
      if (!(await existing(r))) continue;
      const res = await S.resetSetting(owner, ctx, { key: r.key, scope: r.scope, scopeId: r.scopeId });
      if (res.ok) sum.removed += res.removed;
      else {
        exitCode = 1;
        console.error(`🔴 ${LABEL}: คืนค่า ${r.key}@${r.scope} ไม่ได้ ${res.code}`);
      }
    }
    sum.removed += (await prisma.bookingStaffService.deleteMany({ where: { tenantId, unitId: UM, staffId: { in: scenStaff } } })).count;
    console.log(`${LABEL}: --clear คืนค่าที่ฉากตั้ง (โปรไฟล์แม่แบบคงไว้)`);
  } else {
    // 1. แม่แบบ
    for (const [unitId, tpl] of [[UB, SCN.barber.template], [UM, SCN.massage.template]] as const) {
      const prof = await prisma.settingProfile.findFirst({ where: { tenantId, unitId, domain: "booking" }, select: { templateKey: true } });
      if (prof?.templateKey === tpl) continue;
      const r = await BK.applyBookingTemplate(owner, ctx, { unitId, templateKey: tpl, overwrite: "KEEP_CUSTOM" });
      if (!r.ok) throw new Error(`ใช้แม่แบบ ${tpl} ไม่ได้: ${r.code} ${r.issues.map((i) => i.messageTh).join(" · ")}`);
      if (prof) sum.updated++;
      else sum.created++;
      console.log(`${LABEL}: แม่แบบ ${tpl} @ ${unitId}`);
    }
    // 2. ค่าตั้ง (เขียนเฉพาะที่ยังไม่ตรงฉาก)
    const changes: Row[] = [];
    for (const r of rows) {
      const ex = await existing(r);
      if (ex && isDeepStrictEqual(ex.value, r.value)) continue;
      if (!ex) {
        // ค่าเท่าที่มีผลอยู่แล้ว (เช่น noise = เท่าแม่แบบ) — เครื่องยนต์ไม่เขียนแถวซ้ำค่าเดิม ⇒ ไม่นับเป็นการเปลี่ยน
        const refs = r.scope === "STAFF" ? { unitId: r.unitId, staffId: r.scopeId } : r.scope === "SERVICE" ? { unitId: r.unitId, serviceId: r.scopeId } : { unitId: r.unitId };
        const cur = await S.resolveSetting(ctx, r.key, refs);
        if (isDeepStrictEqual(cur.value, r.value)) continue;
      }
      changes.push(r);
      if (ex) sum.updated++;
      else sum.created++;
    }
    if (changes.length) {
      const res = await S.setSettings(owner, ctx, changes);
      if (!res.ok) throw new Error(`setSettings ${res.code}: ${res.issues.map((i) => `${i.key ?? ""} ${i.messageTh}`).join(" · ")}`);
      console.log(`${LABEL}: ค่าตั้ง ${changes.length} แถว`);
    }
    // 3. ใครทำได้ (ราคา/เวลาเฉพาะคน) — ผ่าน setStaffService · ผลสุดท้าย = แถวตามฉากพอดี
    const active = [...mSvc.values()];
    for (const [i, x] of SCN.massage.staffServices.entries()) {
      const staffId = scenStaff[i];
      const want = new Map(x.services.map((s) => [need(mSvc, s.name, "บริการ"), { priceSatang: s.priceSatang ?? null, durationMin: s.durationMin ?? null }]));
      const cur = await prisma.bookingStaffService.findMany({ where: { tenantId, staffId }, select: { serviceId: true, priceSatang: true, durationMin: true } });
      const same =
        cur.length === want.size &&
        cur.every((c) => {
          const w = want.get(c.serviceId);
          return !!w && w.priceSatang === c.priceSatang && w.durationMin === c.durationMin;
        });
      if (same) continue;
      for (const [serviceId, w] of want) {
        const r = await BK.setStaffService(owner, ctx, { unitId: UM, staffId, serviceId, can: true, priceSatang: w.priceSatang, durationMin: w.durationMin });
        if (!r.ok) throw new Error(`ผูก ${x.staff}: ${r.code} ${r.reason}`);
      }
      for (const serviceId of active.filter((id) => !want.has(id))) {
        const r = await BK.setStaffService(owner, ctx, { unitId: UM, staffId, serviceId, can: false, priceSatang: null, durationMin: null });
        if (!r.ok) throw new Error(`เลิกผูก ${x.staff}: ${r.code} ${r.reason}`);
      }
      if (cur.length) sum.updated++;
      else sum.created++;
      console.log(`${LABEL}: ใครทำได้ ${x.staff} ${want.size} บริการ`);
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

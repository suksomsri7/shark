// svc-qc-resource-scene.mts — SVC B.13 · ฉากทรัพยากรร้านนวดของร้าน svcqc (ภาพ จอง 12 ส่วน "ห้อง · เตียง · อุปกรณ์" + 11 คอลัมน์ "ต้องใช้")
//
// ใช้:
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-resource-scene.mts            # ตั้งฉาก (รันซ้ำ = 0/0/0)
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-resource-scene.mts --clear    # ปิดใช้ทรัพยากรฉาก + ล้างปิดซ่อม + คืนค่าตั้งชั้น SERVICE ที่ฉากตั้ง
//
// ฉาก (ค่าจาก SQC_RESOURCE_SCENE + SQC เท่านั้น · ใบสั่ง svc-brief-b.13 §8):
//   ทรัพยากร 12 ชิ้น id ตายตัว (svcqc-res-*) — ยังไม่มี ⇒ สร้างด้วย id ของฉาก (facade createResource ไม่รับ id ⇒ แถวแรกเขียนตรงพร้อม audit) ·
//     มีแล้วแต่ค่าต่าง ⇒ แก้ผ่าน updateResource (facade ของใบ)
//   ปิดซ่อมเตียง 5 สัมพัทธ์วันนี้ไทย 00:00 (fromOffsetDays/untilOffsetDays) — ผ่าน setResourceMaintenance
//   ชนิดที่ 6 บริการต้องใช้ — setSettings ชั้น SERVICE เท่านั้น (🔴 ห้ามเขียนชั้น TENANT/UNIT · ข้อสอบ Q-4) · ไม่สร้างนัด
//   ผู้กระทำ = เจ้าของ svcqc
// 🔴 รันผ่าน scripts/qc-svc.sh เท่านั้น (ด่าน host qc-svc ใน loadSvcQcEnv)
// บรรทัดท้าย: SCENE_SUMMARY {"created":n,"updated":n,"removed":n}
import { isDeepStrictEqual } from "node:util";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC, SQC_RESOURCE_SCENE as SCN } from "./svc-qc-data.mjs";

const LABEL = "svc-qc-resource-scene";
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

const KEY_KINDS = "booking.service.resourceKinds";
const tenantId = SQC.tenant.id;
const ctxT = { tenantId };
const UM = SQC.units[SCN.unit].id;
const rctx = { tenantId, unitId: UM };
const ownerUser = SQC.users.find((u) => u.key === "owner");
if (!ownerUser) {
  console.error(`🔴 ${LABEL}: ไม่มีผู้ใช้ owner ใน SQC`);
  process.exit(3);
}
const owner = { role: "OWNER" as const, unitAccess: ["*"], permissions: {}, userId: ownerUser.userId };
const sum = { created: 0, updated: 0, removed: 0 };
let exitCode = 0;

/** วันนี้ไทย 00:00 + n วัน (epoch + 7 ชม. · ไม่ใช้นาฬิกาเครื่องแบบ getDay/getHours) */
function bkkMidnight(offsetDays: number): Date {
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + offsetDays) - 7 * 3_600_000);
}

try {
  const unit = await prisma.businessUnit.findFirst({ where: { id: UM, tenantId, type: "BOOKING" }, select: { id: true } });
  if (!unit) throw new Error("ร้าน svcqc ยังไม่มีหน่วยนวด — รัน scripts/seed-svc-qc.mts ก่อน");
  const services = await prisma.bookingService.findMany({ where: { tenantId, unitId: UM, active: true }, select: { id: true, name: true } });
  const svcId = (name: string): string => {
    const s = services.find((x) => x.name === name);
    if (!s) throw new Error(`ไม่พบบริการ "${name}" ในร้าน svcqc — รัน seed ก่อน`);
    return s.id;
  };
  const kindRows = Object.entries(SCN.serviceKinds).map(([name, kinds]) => ({ serviceId: svcId(name), kinds: [...kinds] as string[] }));
  const ownKinds = async (serviceId: string) =>
    prisma.settingValue.findFirst({ where: { tenantId, key: KEY_KINDS, scope: "SERVICE", scopeId: serviceId }, select: { id: true } });

  if (clear) {
    // 1) ค่าตั้งชั้น SERVICE ที่ฉากตั้ง
    for (const r of kindRows) {
      if (!(await ownKinds(r.serviceId))) continue;
      const res = await S.resetSetting(owner, ctxT, { key: KEY_KINDS, scope: "SERVICE", scopeId: r.serviceId });
      if (res.ok) sum.removed += res.removed;
      else {
        exitCode = 1;
        console.error(`🔴 ${LABEL}: คืนค่า ${KEY_KINDS}@SERVICE ไม่ได้ ${res.code}`);
      }
    }
    // 2) ปิดซ่อม → ล้าง · ทรัพยากรฉาก → ปิดใช้ (ไม่มีการลบจริง)
    const cur = await BK.listResources(rctx);
    for (const want of SCN.resources) {
      const row = cur.find((x) => x.id === want.id);
      if (!row) continue;
      if (row.maintenance.length) {
        const m = await BK.setResourceMaintenance(owner, rctx, row.id, []);
        if (m.ok) sum.removed++;
        else {
          exitCode = 1;
          console.error(`🔴 ${LABEL}: ล้างปิดซ่อม ${row.name} ไม่ได้ ${m.code} ${m.reason}`);
        }
      }
      if (row.active) {
        const u = await BK.updateResource(owner, rctx, row.id, { active: false });
        if (u.ok) sum.removed++;
        else {
          exitCode = 1;
          console.error(`🔴 ${LABEL}: ปิดใช้ ${row.name} ไม่ได้ ${u.code} ${u.reason}`);
        }
      }
    }
    console.log(`${LABEL}: --clear ปิดใช้ทรัพยากรฉาก + ล้างปิดซ่อม + คืนค่าชนิดของบริการ`);
  } else {
    // 1) ทรัพยากร 12 ชิ้น (id ตายตัว)
    const cur = await BK.listResources(rctx);
    for (const want of SCN.resources) {
      const row = cur.find((x) => x.id === want.id);
      if (!row) {
        const clash = cur.find((x) => x.name === want.name);
        if (clash) throw new Error(`ชื่อ "${want.name}" ใช้อยู่กับทรัพยากรอื่น (${clash.id}) — ฉากต้องใช้ id ${want.id}`);
        await prisma.$transaction(async (tx) => {
          await tx.svcResource.create({
            data: { id: want.id, tenantId, unitId: UM, kind: want.kind, name: want.name, capacity: want.capacity, cleanupMin: want.cleanupMin, sortOrder: want.sortOrder },
          });
          await tx.auditLog.create({
            data: { tenantId, unitId: UM, actorType: "USER", actorId: owner.userId, action: "booking.resource.create", targetType: "SvcResource", targetId: want.id, before: {}, after: { ...want, scene: LABEL } },
          });
        });
        sum.created++;
        continue;
      }
      const patch: Record<string, unknown> = {};
      for (const k of ["name", "kind", "capacity", "cleanupMin", "sortOrder"] as const) if (row[k] !== want[k]) patch[k] = want[k];
      if (!row.active) patch.active = true;
      if (Object.keys(patch).length) {
        const u = await BK.updateResource(owner, rctx, row.id, patch);
        if (!u.ok) throw new Error(`แก้ ${want.name}: ${u.code} ${u.reason}`);
        sum.updated++;
      }
    }
    // 2) ปิดซ่อม (สัมพัทธ์วันนี้ไทย)
    const now = await BK.listResources(rctx);
    for (const m of SCN.maintenance) {
      const windows = [{ startAt: bkkMidnight(m.fromOffsetDays).toISOString(), endAt: bkkMidnight(m.untilOffsetDays).toISOString(), note: m.note }];
      const row = now.find((x) => x.id === m.resourceId);
      const same = !!row && isDeepStrictEqual(row.maintenance.map((w) => ({ startAt: w.startAt, endAt: w.endAt, note: w.note })), windows);
      if (same) continue;
      const r = await BK.setResourceMaintenance(owner, rctx, m.resourceId, windows);
      if (!r.ok) throw new Error(`ปิดซ่อม ${m.resourceId}: ${r.code} ${r.reason}`);
      if (row && row.maintenance.length) sum.updated++;
      else sum.created++;
    }
    // 3) ชนิดที่บริการต้องใช้ — ชั้น SERVICE เท่านั้น
    const changes: { key: string; scope: string; scopeId: string; value: unknown }[] = [];
    for (const r of kindRows) {
      const v = await S.resolveSettings(ctxT, [KEY_KINDS], { unitId: UM, serviceId: r.serviceId });
      if (isDeepStrictEqual(v[KEY_KINDS]?.value, r.kinds)) continue;
      if (await ownKinds(r.serviceId)) sum.updated++;
      else sum.created++;
      changes.push({ key: KEY_KINDS, scope: "SERVICE", scopeId: r.serviceId, value: r.kinds });
    }
    if (changes.length) {
      const res = await S.setSettings(owner, ctxT, changes);
      if (!res.ok) throw new Error(`setSettings ${res.code}: ${res.issues.map((i) => `${i.key ?? ""} ${i.messageTh}`).join(" · ")}`);
      console.log(`${LABEL}: ชนิดของบริการ ${changes.length} บริการ`);
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

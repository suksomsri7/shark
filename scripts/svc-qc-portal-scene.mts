// svc-qc-portal-scene.mts — SVC D.9 · ฉากพอร์ทัลผู้เช่า (ภาพ หอ 05 ข) บนร้าน svcqc
//
// ใช้ (ต้องมีฉาก roomboard → lease → dorm-home (D.13) ก่อน — ใช้บิลของฉาก D.13: 204 จ่ายแล้ว · 106 ค้าง):
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-portal-scene.mts            # สร้าง/ปรับฉาก
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-portal-scene.mts --clear    # ลบเฉพาะค่าตั้งที่ฉาก mark + ไฟล์ฉาก
//
// ฉาก (ค่าจาก SQC_DORM_PORTAL_SCENE เท่านั้น · ไม่สร้างบิล/สัญญา/สลิปเอง):
//   • ไม่ตั้ง payments.receiver ทับชั้นหน่วย (ลบของฉากรุ่นก่อน) · ร้านไม่มีผู้รับเลย ⇒ สร้าง PaymentProfile ของร้าน = SCN.receiver · --clear ลบโปรไฟล์ที่ตรงค่าฉาก
//   • ไฟล์ SCN.sceneFile = { tenantId, unitId, leases{204,106}, bills{204,106} (งวดล่าสุดที่ผู้เช่าเห็น), endedLeaseId }
// idempotent: อ่านเทียบก่อน ต่างเท่านั้นถึงเขียน · รันซ้ำ = SCENE_SUMMARY 0/0/0 · ฉาก D.13 ไม่พร้อม ⇒ exit 3
// 🔴 รันผ่าน scripts/qc-svc.sh เท่านั้น (ด่าน host qc-svc ใน loadSvcQcEnv)
// บรรทัดท้าย: SCENE_SUMMARY {"created":n,"updated":n,"removed":n}
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC, SQC_DORM_PORTAL_SCENE as SCN } from "./svc-qc-data.mjs";

const LABEL = "svc-qc-portal-scene";
const argv = process.argv.slice(2);
const unknown = argv.filter((a) => a !== "--clear");
if (unknown.length) {
  console.error(`🔴 ${LABEL}: ไม่รู้จัก ${unknown.join(" ")} (ใช้ได้: --clear)`);
  process.exit(2);
}
const clear = argv.includes("--clear");
loadSvcQcEnv(LABEL);

const { prisma } = await import("@/lib/core/db");

const tenantId = SQC.tenant.id;
const unitId = SQC.units.dorm.id;
const MARK = SCN.mark;
const FILE = join(process.cwd(), SCN.sceneFile);
const sum = { created: 0, updated: 0, removed: 0 };
const VISIBLE = ["SENT", "PARTIALLY_PAID", "PAID"];

let exitCode = 0;
try {
  const RKEY = "payments.receiver";
  const cur = await prisma.settingValue.findFirst({ where: { tenantId, key: RKEY, scope: "UNIT", scopeId: unitId }, select: { id: true, value: true, setById: true } });
  if (clear) {
    if (cur && cur.setById === MARK) {
      await prisma.settingValue.delete({ where: { id: cur.id } });
      sum.removed++;
    }
    // โปรไฟล์ที่ฉากสร้าง (ค่าตรงฉากทุกช่อง) ⇒ ลบ · ของร้าน/ของข้อสอบอื่นไม่แตะ
    sum.removed += (await prisma.paymentProfile.deleteMany({ where: { tenantId, promptpayId: SCN.receiver.promptpayId, displayName: SCN.receiver.displayName } })).count;
    if (existsSync(FILE)) {
      rmSync(FILE);
      sum.removed++;
    }
    console.log(`${LABEL}: --clear ลบค่าตั้งที่ฉาก mark + ไฟล์ฉาก`);
  } else {
    const rooms = await prisma.hotelRoom.findMany({ where: { tenantId, unitId, number: { in: [SCN.rooms.paid, SCN.rooms.open] } }, select: { id: true, number: true } });
    const leases: Record<string, string> = {};
    const bills: Record<string, string> = {};
    for (const r of rooms) {
      const ls = await prisma.dormLease.findMany({ where: { tenantId, unitId, roomId: r.id, status: { in: ["ACTIVE", "NOTICE"] }, endedAt: null }, select: { id: true }, orderBy: [{ startDate: "desc" }, { id: "asc" }] });
      for (const l of ls) {
        const b = await prisma.dormBill.findFirst({ where: { tenantId, unitId, leaseId: l.id, status: { in: VISIBLE } }, select: { id: true }, orderBy: [{ periodKey: "desc" }] });
        if (b) {
          leases[r.number] = l.id;
          bills[r.number] = b.id;
          break;
        }
      }
    }
    if (!leases[SCN.rooms.paid] || !leases[SCN.rooms.open]) {
      console.error(`🔴 ${LABEL}: ไม่พบสัญญา+บิลของฉาก D.13 ห้อง ${SCN.rooms.paid}/${SCN.rooms.open} — รันก่อน: svc-qc-roomboard-scene → svc-qc-lease-scene → svc-qc-dorm-home-scene`);
      exitCode = 3;
    } else {
      // มติผู้คุม 30 ต.ค.: ห้ามตั้งผู้รับทับชั้นหน่วย (ทับแล้ว r0.6 R-2/A-* ที่คาดผู้รับหอ = พร้อมเพย์ของร้านแดง)
      //   • แถวทับชั้นหน่วยของฉากรุ่นก่อน (setById = mark) ⇒ ลบเสมอ
      //   • ร้านยังไม่มีผู้รับเลย (ไม่มี PaymentProfile · ไม่มีค่าตั้ง payments.receiver ของคนอื่น) ⇒ สร้าง PaymentProfile ของร้านจาก SCN.receiver
      //     (= พร้อมเพย์ของร้านเอง ไม่ใช่การทับ · r0.6 ใช้ของร้านที่มีอยู่แล้ว) · มีอยู่แล้ว ⇒ ไม่แตะ · --clear ลบเฉพาะโปรไฟล์ที่ตรงค่าฉากทุกช่อง
      if (cur && cur.setById === MARK) {
        await prisma.settingValue.delete({ where: { id: cur.id } });
        sum.removed++;
      }
      const pp = await prisma.paymentProfile.findUnique({ where: { tenantId }, select: { id: true } });
      const otherSetting = await prisma.settingValue.count({ where: { tenantId, key: RKEY, NOT: { setById: MARK } } });
      if (!pp && otherSetting === 0) {
        await prisma.paymentProfile.create({ data: { tenantId, promptpayId: SCN.receiver.promptpayId, displayName: SCN.receiver.displayName } });
        sum.created++;
      }
      const ended = await prisma.dormLease.findFirst({ where: { tenantId, unitId, status: "ENDED" }, select: { id: true }, orderBy: [{ id: "asc" }] });
      const want = JSON.stringify({ tenantId, unitId, leases, bills, endedLeaseId: ended?.id ?? null }, null, 2);
      const had = existsSync(FILE) ? readFileSync(FILE, "utf8") : null;
      if (had !== want) {
        mkdirSync(dirname(FILE), { recursive: true });
        writeFileSync(FILE, want);
        if (had === null) sum.created++;
        else sum.updated++;
      }
      console.log(`${LABEL}: ห้อง ${SCN.rooms.paid} (จ่ายแล้ว) · ${SCN.rooms.open} (ค้าง) ⇒ ${SCN.sceneFile}`);
    }
  }
} catch (e) {
  console.error(`🔴 ${LABEL}: ${e instanceof Error ? e.message : String(e)}`);
  exitCode = 1;
} finally {
  await prisma.$disconnect();
}
console.log(`SCENE_SUMMARY ${JSON.stringify(sum)}`);
process.exit(exitCode);

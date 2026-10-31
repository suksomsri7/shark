// svc-qc-repair-scene.mts — SVC D.16 · ฉากแจ้งซ่อมบนหน่วยหอ svcqc (ใบสั่ง ledger/svc-briefs/svc-brief-d.16.md §8)
//
// ใช้ (ต้องมีฉาก roomboard → lease → dorm-home (D.13) ก่อน — สัญญา ACTIVE ของห้อง 204 บนหน่วยหอ svcqc):
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-repair-scene.mts            # สร้าง/ปรับฉาก
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-repair-scene.mts --clear    # ลบเฉพาะแถวของฉาก
//
// ฉาก (ค่าจาก SQC_DORM_REPAIR_SCENE เท่านั้น) — แถว DormRepair ล้วน 1 แถว id ตายตัว:
//   ห้อง 204 · สัญญา ACTIVE ของห้อง (leaseId/partyId) · หมวด/ข้อความ/เวลาสะดวก/ห้ามเข้า ตามบล็อก · IN_PROGRESS · files null · kanbanCardId null
//   🔴 IN_PROGRESS โดยตั้งใจ: หน้าแรกหอ (D.13) นับ "แจ้งซ่อมใหม่" เฉพาะ OPEN ⇒ ฉากนี้ไม่ขยับตัวเลขของ D.13
// 🔴 เขียนเฉพาะแถว DormRepair — ไม่แตะค่าตั้ง/ระบบ/บอร์ดงาน/คิวเหตุการณ์/บันทึกข้อความ (svcqc ไม่มีระบบบอร์ดงาน ⇒ จอช่างขึ้น "ยังไม่มีการ์ด" = ถูกต้อง)
// idempotent: อ่านเทียบก่อน ต่างเท่านั้นถึงเขียน · รันซ้ำ = SCENE_SUMMARY 0/0/0 · ไม่มีสัญญาห้อง 204 ของฉาก D.13 ⇒ exit 3
// 🔴 รันผ่าน scripts/qc-svc.sh เท่านั้น (ด่าน host qc-svc ใน loadSvcQcEnv)
// บรรทัดท้าย: SCENE_SUMMARY {"created":n,"updated":n,"removed":n}
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC_TENANT, SQC_UNITS, SQC_DORM_REPAIR_SCENE as SCN } from "./svc-qc-data.mjs";

const LABEL = "svc-qc-repair-scene";
const argv = process.argv.slice(2);
const unknown = argv.filter((a) => a !== "--clear");
if (unknown.length) {
  console.error(`🔴 ${LABEL}: ไม่รู้จัก ${unknown.join(" ")} (ใช้ได้: --clear)`);
  process.exit(2);
}
const clear = argv.includes("--clear");
loadSvcQcEnv(LABEL);

const { prisma } = await import("@/lib/core/db");

const tenantId = SQC_TENANT.id;
const sum = { created: 0, updated: 0, removed: 0 };

let exitCode = 0;
try {
  const cur = await prisma.dormRepair.findFirst({ where: { id: SCN.id, tenantId } });
  if (clear) {
    if (cur) sum.removed += (await prisma.dormRepair.deleteMany({ where: { id: SCN.id, tenantId } })).count;
    console.log(`${LABEL}: --clear ลบแถวแจ้งซ่อมของฉาก ${sum.removed}`);
  } else {
    const unit = await prisma.businessUnit.findFirst({ where: { tenantId, slug: SQC_UNITS.dorm.slug, type: "DORM" }, select: { id: true } });
    const room = unit ? await prisma.hotelRoom.findFirst({ where: { tenantId, unitId: unit.id, number: SCN.room }, select: { id: true } }) : null;
    const lease = room
      ? await prisma.dormLease.findFirst({
          where: { tenantId, unitId: unit?.id, roomId: room.id, status: "ACTIVE", endedAt: null },
          orderBy: [{ startDate: "desc" }, { id: "asc" }],
          select: { id: true, partyId: true },
        })
      : null;
    if (!unit || !room || !lease) {
      console.error(`🔴 ${LABEL}: ไม่พบหน่วยหอ/ห้อง ${SCN.room}/สัญญา ACTIVE ของฉาก D.13 — รันก่อน: svc-qc-roomboard-scene → svc-qc-lease-scene → svc-qc-dorm-home-scene`);
      exitCode = 3;
    } else {
      const data = {
        unitId: unit.id,
        roomId: room.id,
        leaseId: lease.id,
        partyId: lease.partyId,
        category: SCN.category,
        text: SCN.text,
        preferredTime: SCN.preferredTime,
        allowEntry: SCN.allowEntry,
        status: SCN.status,
        kanbanCardId: null,
        doneAt: null,
        rating: null,
        ratingNote: null,
      };
      if (!cur) {
        await prisma.dormRepair.create({ data: { id: SCN.id, tenantId, ...data } });
        sum.created++;
      } else {
        const same =
          cur.unitId === data.unitId && cur.roomId === data.roomId && cur.leaseId === data.leaseId && cur.partyId === data.partyId && cur.category === data.category &&
          cur.text === data.text && cur.preferredTime === data.preferredTime && cur.allowEntry === data.allowEntry && cur.status === data.status &&
          cur.kanbanCardId === null && cur.doneAt === null && cur.rating === null && cur.ratingNote === null && cur.files === null;
        if (!same) {
          await prisma.$executeRaw`UPDATE "DormRepair" SET "files" = NULL WHERE "id" = ${SCN.id} AND "tenantId" = ${tenantId}`;
          await prisma.dormRepair.update({ where: { id: SCN.id }, data });
          sum.updated++;
        }
      }
      console.log(`${LABEL}: ห้อง ${SCN.room} · ${SCN.category} · ${SCN.status} (ไม่มีการ์ด/รูป · ไม่เขียนค่าตั้ง)`);
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

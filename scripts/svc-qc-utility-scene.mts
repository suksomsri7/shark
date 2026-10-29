// svc-qc-utility-scene.mts — SVC D.7 · ฉากบิลการไฟฟ้า/ประปาของหอ svcqc (ภาพ หอ 10 · README: ไฟ ฿19,824.00 ÷ 4,200 = ฿4.72 · น้ำ ฿3,840.00 ÷ 240 = ฿16.00)
//
// ใช้:
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-utility-scene.mts            # สร้าง/ปรับบิลงวดเดือนก่อน (ไทย)
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-utility-scene.mts --clear    # ลบเฉพาะแถว enteredById "SvcQcScene"
//
// ฉาก: ร้าน svcqc · หอ · อาคาร A · งวดเดือนก่อน (ไทย) — ไฟ ฿19,824.00 / 4,200 หน่วย · น้ำ ฿3,840.00 / 240 หน่วย
//   เขียนผ่าน recordAuthorityBill ของ facade จริง (ctx ร้าน svcqc · ผู้บันทึก "SvcQcScene" ⇒ enteredById ใช้แยกแถวฉาก)
// idempotent: บิลเท่าเดิม = UNCHANGED (ไม่เขียน) ⇒ รันซ้ำ SCENE_SUMMARY 0/0/0 · ไม่แตะค่าตั้ง/ห้อง/มิเตอร์
// 🔴 รันผ่าน scripts/qc-svc.sh เท่านั้น (ด่าน host qc-svc ใน loadSvcQcEnv)
// บรรทัดท้าย: SCENE_SUMMARY {"created":n,"updated":n,"removed":n}
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC } from "./svc-qc-data.mjs";

const LABEL = "svc-qc-utility-scene";
loadSvcQcEnv(LABEL);

const argv = process.argv.slice(2);
const unknown = argv.filter((a) => a !== "--clear");
if (unknown.length) {
  console.error(`🔴 ${LABEL}: ไม่รู้จัก ${unknown.join(" ")} (ใช้ได้: --clear)`);
  process.exit(2);
}
const clear = argv.includes("--clear");

const { prisma } = await import("@/lib/core/db");
const { recordAuthorityBill } = await import("@/lib/modules/dorm");

const ENTERED_BY = "SvcQcScene";
const tenantId = SQC.tenant.id;
const unitId = SQC.units.dorm.id;
const buildingId = SQC.dorm.building.id;
const ctx = { tenantId, actorUserId: ENTERED_BY };
const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const P = (k: number) => {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)) - 1 + k;
  return `${y + Math.floor(m / 12)}-${String((((m % 12) + 12) % 12) + 1).padStart(2, "0")}`;
};
const PERIOD = P(-1);
const BILLS = [
  { kind: "ELEC" as const, billSatang: 1_982_400, units: 4200 },
  { kind: "WATER" as const, billSatang: 384_000, units: 240 },
];

const sum = { created: 0, updated: 0, removed: 0 };
let exitCode = 0;
try {
  if (clear) {
    sum.removed += (await prisma.dormUtilityRate.deleteMany({ where: { tenantId, unitId, enteredById: ENTERED_BY } })).count;
    console.log(`${LABEL}: --clear ลบบิลฉาก (enteredById ${ENTERED_BY}) ${sum.removed} แถว`);
  } else {
    const rooms = await prisma.hotelRoom.count({ where: { tenantId, unitId } });
    if (rooms !== SQC.dorm.rooms.length) {
      console.error(`🔴 ${LABEL}: หอ svcqc มีห้อง ${rooms} (ต้อง ${SQC.dorm.rooms.length}) — รัน seed ก่อน`);
      process.exit(3);
    }
    for (const b of BILLS) {
      const r = await recordAuthorityBill(ctx, { unitId, kind: b.kind, periodKey: PERIOD, buildingId, billSatang: b.billSatang, units: b.units });
      if (!r.ok) {
        exitCode = 1;
        console.error(`🔴 ${LABEL}: ${b.kind} ${PERIOD} ${r.code} ${r.reason}`);
        continue;
      }
      if (r.status === "CREATED") sum.created++;
      else if (r.status === "UPDATED") sum.updated++;
      console.log(`${LABEL}: ${b.kind} ${PERIOD} ${r.status} · ต้นทุน ${r.costRateSatangPerUnit} สตางค์/หน่วย · ตัวตรวจ ${r.legal.level}`);
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

// svc-qc-billing-scene.mts — SVC D.8 · ฉากรอบบิลรายเดือนของหอ svcqc (ภาพ หอ 04 · README "รอบบิล พ.ย.: 31 บิล ··· ฿174,126.40")
//
// ใช้ (ต้องมีฉาก roomboard → lease → meter → utility ก่อน):
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-billing-scene.mts            # เตรียมรอบเดือนนี้ (ไทย) + ค่าปรับมือ 203/211
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-billing-scene.mts --clear    # ลบรอบ+บิลของงวดนี้ (เฉพาะเมื่อยังไม่มีบิลส่งแล้ว)
//
// ฉาก: ร้าน svcqc · หอ · งวดรอบ = เดือนนี้ (ไทย) · น้ำไฟ = เดือนก่อน (ฉากมิเตอร์/ค่าน้ำไฟใส่ไว้แล้ว)
//   prepareBillRun จริงของ facade (ผู้กระทำ = เจ้าของ svcqc) + setBillExtraLines 203 · 211 ค่าปรับ ฿200 "ปรับช้า 4 วัน" · ไม่ส่ง (ภาพ = ขั้นตรวจบิล)
// idempotent: เตรียมซ้ำไม่เขียน · ค่าปรับเท่าเดิมไม่เรียก ⇒ รันซ้ำ SCENE_SUMMARY 0/0/0 · ไม่แตะห้อง/สัญญา/มิเตอร์/ค่าตั้ง
// 🔴 รันผ่าน scripts/qc-svc.sh เท่านั้น (ด่าน host qc-svc ใน loadSvcQcEnv)
// บรรทัดท้าย: SCENE_SUMMARY {"created":n,"updated":n,"removed":n}
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC, SQC_USERS } from "./svc-qc-data.mjs";

const LABEL = "svc-qc-billing-scene";
loadSvcQcEnv(LABEL);

const argv = process.argv.slice(2);
const unknown = argv.filter((a) => a !== "--clear");
if (unknown.length) {
  console.error(`🔴 ${LABEL}: ไม่รู้จัก ${unknown.join(" ")} (ใช้ได้: --clear)`);
  process.exit(2);
}
const clear = argv.includes("--clear");

const { prisma } = await import("@/lib/core/db");
const { prepareBillRun, setBillExtraLines } = await import("@/lib/modules/dorm");

const tenantId = SQC.tenant.id;
const unitId = SQC.units.dorm.id;
const owner = SQC_USERS.find((u) => u.key === "owner");
const ctx = { tenantId, actorUserId: owner?.userId ?? "" };
const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const PERIOD = today.slice(0, 7);
const FEE_ROOMS = ["203", "211"];
const FEE = { kind: "LATE_FEE" as const, labelTh: "ค่าปรับชำระล่าช้า", amountSatang: 20_000, note: "ปรับช้า 4 วัน" };

const sum = { created: 0, updated: 0, removed: 0 };
let exitCode = 0;
try {
  if (clear) {
    const run = await prisma.dormBillRun.findFirst({ where: { tenantId, unitId, periodKey: PERIOD }, select: { id: true } });
    if (run) {
      const sent = await prisma.dormBill.count({ where: { runId: run.id, status: { notIn: ["DRAFT", "HELD"] } } });
      if (sent > 0) {
        console.error(`🔴 ${LABEL}: รอบ ${PERIOD} มีบิลส่งแล้ว ${sent} ใบ — ไม่ลบ (ใบแจ้งหนี้ในบัญชีเป็นหลักฐาน)`);
        await prisma.$disconnect();
        process.exit(3);
      }
      sum.removed += (await prisma.dormBill.deleteMany({ where: { runId: run.id } })).count;
      sum.removed += (await prisma.dormBillRun.deleteMany({ where: { id: run.id } })).count;
    }
    console.log(`${LABEL}: --clear ลบรอบ ${PERIOD} ${sum.removed} แถว`);
  } else {
    if (!owner) throw new Error("ไม่พบผู้ใช้เจ้าของ svcqc ใน SQC_USERS");
    const r = await prepareBillRun(ctx, { unitId, periodKey: PERIOD });
    if (!r.ok) throw new Error(`prepareBillRun ${PERIOD}: ${r.code} ${r.reason}`);
    sum.created += (r.created ? 1 : 0) + r.added;
    sum.updated += r.changed;
    console.log(`${LABEL}: รอบ ${PERIOD} ${r.status} · ${r.billCount} บิล · พัก ${r.heldCount} · ฿${(r.totalSatang / 100).toFixed(2)} · ด่าน ${r.gate.ok ? "ผ่าน" : "ไม่ผ่าน"}`);
    const rooms = await prisma.hotelRoom.findMany({ where: { tenantId, unitId, number: { in: FEE_ROOMS } }, select: { id: true, number: true } });
    for (const room of rooms) {
      const bill = await prisma.dormBill.findFirst({ where: { tenantId, unitId, runId: r.runId, roomId: room.id }, select: { id: true, status: true, lines: true } });
      if (!bill || (bill.status !== "DRAFT" && bill.status !== "HELD")) continue;
      const lines = Array.isArray(bill.lines) ? (bill.lines as { code?: string; amountSatang?: number; meta?: { manual?: number; note?: string } }[]) : [];
      const late = lines.find((l) => l.code === "LATE_FEE");
      if (late && late.amountSatang === FEE.amountSatang && late.meta?.manual === 1 && late.meta?.note === FEE.note) continue;
      const x = await setBillExtraLines(ctx, { unitId, billId: bill.id, lines: [FEE] });
      if (!x.ok) throw new Error(`setBillExtraLines ${room.number}: ${x.code} ${x.reason}`);
      sum.updated++;
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

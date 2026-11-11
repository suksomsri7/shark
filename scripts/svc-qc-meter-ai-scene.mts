// svc-qc-meter-ai-scene.mts — SVC D.14 · ข้อเสนอค้างของระบบอ่านเลขมิเตอร์บนร้าน svcqc (ภาพ หอ 03 แผง ข "อ่านจากรูป · ไม่แน่ใจ · ตรวจกับรูปแล้ว")
//
// ใช้ (ต้องมีฉาก D.6 ก่อน — svc-qc-roomboard-scene.mts แล้ว svc-qc-meter-scene.mts):
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-meter-ai-scene.mts            # สร้างข้อเสนอค้าง (รันซ้ำ = 0/0/0)
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-meter-ai-scene.mts --clear    # ลบเฉพาะข้อเสนอของฉาก (+ FileAsset ของมัน)
//
// ฉาก: ห้อง 209 ไฟ งวดเดือนนี้ไทย · proposeMeterReading จริง (ผู้กระทำ = owner svcqc) · ตัวอ่านตายตัวในสคริปต์
//      (value = เลขก่อนหน้า + unitsOverPrev · confidence 0.62 · token 0 ⇒ ไม่มีแถว USAGE) · deps.put ไม่ออกเน็ต
// 🔴 ไม่เขียน DormMeterReading / SettingValue / OutboxEvent / AiCreditTxn USAGE · ห้อง 209 ยังไม่จด (progress คง 27/36)
// บรรทัดท้าย: SCENE_SUMMARY {"created":n,"updated":n,"removed":n}
import { createHash } from "node:crypto";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC, SQC_USERS, SQC_DORM_METER_AI_SCENE as SCENE, sqcMeterAiPhoto } from "./svc-qc-data.mjs";

const LABEL = "svc-qc-meter-ai-scene";
loadSvcQcEnv(LABEL);

const argv = process.argv.slice(2);
const unknown = argv.filter((a) => a !== "--clear");
if (unknown.length) {
  console.error(`🔴 ${LABEL}: ไม่รู้จัก ${unknown.join(" ")} (ใช้ได้: --clear)`);
  process.exit(2);
}
const clear = argv.includes("--clear");

const { prisma } = await import("@/lib/core/db");
const { meterWalk, proposeMeterReading } = await import("@/lib/modules/dorm");

const tenantId = SQC.tenant.id;
const unitId = SQC.units.dorm.id;
const owner = SQC_USERS.find((u) => u.key === SCENE.actor);
const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const P0 = today.slice(0, 7);
const photo = sqcMeterAiPhoto();
const sha = createHash("sha256").update(photo.data).digest("hex");
const ACTION = "dorm.meter.ai.proposed";

const sum = { created: 0, updated: 0, removed: 0 };
let exitCode = 0;
try {
  if (!owner) {
    console.error(`🔴 ${LABEL}: ไม่พบผู้ใช้ ${SCENE.actor} ของ svcqc`);
    process.exit(3);
  }
  const walk = await meterWalk({ tenantId }, { unitId, periodKey: P0 });
  const room = walk.floors.flatMap((f) => f.rooms).find((r) => r.number === SCENE.room);
  const meter = room?.meters.find((m) => m.kind === SCENE.kind);
  if (!meter) {
    console.error(`🔴 ${LABEL}: ไม่พบมิเตอร์${SCENE.kind} ห้อง ${SCENE.room} — รันก่อน: svc-qc-roomboard-scene.mts แล้ว svc-qc-meter-scene.mts`);
    process.exit(3);
  }
  const ref = `dorm.meter.ai:${meter.meterId}:${P0}:${sha}`;

  if (clear) {
    const rows = await prisma.auditLog.findMany({ where: { tenantId, unitId, action: ACTION, targetType: "DormMeter", targetId: meter.meterId, after: { path: ["ref"], equals: ref } }, select: { id: true, after: true } });
    const files = rows
      .map((r) => (r.after && typeof r.after === "object" && !Array.isArray(r.after) ? (r.after as Record<string, unknown>).fileId : null))
      .filter((x): x is string => typeof x === "string" && x.length > 0);
    if (rows.length) sum.removed += (await prisma.auditLog.deleteMany({ where: { tenantId, id: { in: rows.map((r) => r.id) } } })).count;
    if (files.length) sum.removed += (await prisma.fileAsset.deleteMany({ where: { tenantId, id: { in: files } } })).count;
    console.log(`${LABEL}: --clear ลบข้อเสนอของฉาก ${sum.removed} แถว`);
  } else {
    if (walk.progress.rooms !== SCENE.expect.progress.rooms || walk.progress.done !== SCENE.expect.progress.done) {
      console.error(`🔴 ${LABEL}: ฉาก D.6 ยังไม่ครบ (progress ${JSON.stringify(walk.progress)}) — รันก่อน: bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-meter-scene.mts`);
      process.exit(3);
    }
    if (meter.value !== null) {
      console.error(`🔴 ${LABEL}: ห้อง ${SCENE.room} จดงวดนี้แล้ว — ฉากนี้ต้องการห้องที่ยังไม่จด`);
      process.exit(3);
    }
    const prev = meter.prevValue ?? 0;
    const reader = {
      async read() {
        return { value: prev + SCENE.unitsOverPrev, confidence: SCENE.confidence, model: "svcqc-scene-fixed", tokensIn: 0, tokensOut: 0 };
      },
    };
    const r = await proposeMeterReading(
      { tenantId, actorUserId: owner.userId },
      { unitId, meterId: meter.meterId, periodKey: P0, photo },
      { reader, put: async () => {} },
    );
    if (!r.ok) {
      console.error(`🔴 ${LABEL}: เสนอไม่สำเร็จ ${r.code} ${r.reason}`);
      exitCode = 1;
    } else if (!r.cached) sum.created += 1;
    if (r.ok) console.log(`${LABEL}: ข้อเสนอ ห้อง ${SCENE.room} ${SCENE.kind} = ${r.value ?? "-"} (${r.source}${r.lowConfidence ? " · ไม่แน่ใจ" : ""}) ${r.cached ? "มีอยู่แล้ว" : "สร้างใหม่"}`);
  }
} catch (e) {
  console.error(`🔴 ${LABEL}: ${e instanceof Error ? e.message : String(e)}`);
  exitCode = 1;
}
await prisma.$disconnect();
console.log(`SCENE_SUMMARY ${JSON.stringify(sum)}`);
process.exit(exitCode);

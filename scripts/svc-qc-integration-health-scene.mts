// svc-qc-integration-health-scene.mts — SVC C.3 · ฉากแผงสุขภาพตัวต่อ (ภาพ "จอง 10 / หอ 11 สถานะ" · SQC_VISUAL_SPECS["c.3"] ด้วยผู้ใช้ other-owner)
//
// ใช้:
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-integration-health-scene.mts            # สร้าง/ตรวจฉาก
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-integration-health-scene.mts --clear    # ลบแถวฉาก + log ของแถวนั้น
//
// ฉาก (ค่าจาก SQC_INTEGRATION_HEALTH_SCENE เท่านั้น): ร้าน B ของ svcqc (SQC_OTHER — ไม่แตะร้าน A) · 1 แถว TenantIntegration ชนิด CALENDAR
//   (ไม่มี quota() ⇒ งานรายชั่วโมงไม่เรียก · ไม่มีใครใช้) · FAKE · CONNECTED · ทุกหน่วย · MANUAL · ไม่มีค่าลับ · quota ตาม scene.quota
//   + call log ตาม scene.days ([วันย้อนหลังไทย, ok, fail] · เวลา 10:00+i นาทีไทย · ms = 120+i*7 · fail = PROVIDER_ERROR/TIMEOUT สลับ)
// 🔴 ไม่เขียน SettingValue/OutboxEvent/AppNotification · เขียนตรงด้วย prisma (ไม่ผ่าน service — ไม่มีคีย์ ไม่ยิง event)
// idempotent: มีแถว + log ครบ ⇒ ไม่เขียนอะไร (SCENE_SUMMARY 0/0/0) · log ไม่ครบ ⇒ ลบ log ของแถวแล้วใส่ใหม่ (updated)
// 🔴 รันผ่าน scripts/qc-svc.sh เท่านั้น (ด่าน host qc-svc ใน loadSvcQcEnv)
// บรรทัดท้าย: SCENE_SUMMARY {"created":n,"updated":n,"removed":n}
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC_INTEGRATION_HEALTH_SCENE as S } from "./svc-qc-data.mjs";

const LABEL = "svc-qc-integration-health-scene";
loadSvcQcEnv(LABEL);

const argv = process.argv.slice(2);
const unknown = argv.filter((a) => a !== "--clear");
if (unknown.length) {
  console.error(`🔴 ${LABEL}: ไม่รู้จัก ${unknown.join(" ")} (ใช้ได้: --clear)`);
  process.exit(2);
}
const clear = argv.includes("--clear");

const { prisma } = await import("@/lib/core/db");
const { bkkAt } = await import("@/lib/core/quiet-hours");

const FAIL_CODES = ["PROVIDER_ERROR", "TIMEOUT"] as const;
const sum = { created: 0, updated: 0, removed: 0 };
let exitCode = 0;

/** log ที่ฉากต้องมี (เทียบ/สร้างจากชุดนี้) */
function sceneLogs(now: Date): { op: string; ok: boolean; ms: number; code: string | null; at: Date }[] {
  const out: { op: string; ok: boolean; ms: number; code: string | null; at: Date }[] = [];
  for (const [daysAgo, ok, fail] of S.days) {
    for (let i = 0; i < ok + fail; i++) {
      const isFail = i >= ok;
      out.push({ op: "test", ok: !isFail, ms: 120 + i * 7, code: isFail ? FAIL_CODES[(i - ok) % 2] : null, at: bkkAt(now, 10, i, -daysAgo) });
    }
  }
  return out;
}

try {
  const tenant = await prisma.tenant.findUnique({ where: { id: S.tenantId }, select: { id: true } });
  if (!tenant) throw new Error(`ไม่พบร้าน ${S.tenantId} (รัน seed-svc-qc ก่อน)`);
  const row = await prisma.tenantIntegration.findFirst({ where: { tenantId: S.tenantId, label: S.label } });
  if (clear) {
    if (row) {
      sum.removed += (await prisma.integrationCallLog.deleteMany({ where: { tenantId: S.tenantId, integrationId: row.id } })).count;
      sum.removed += (await prisma.tenantIntegration.deleteMany({ where: { id: row.id, tenantId: S.tenantId } })).count;
    }
    console.log(`${LABEL}: --clear ลบ ${sum.removed} แถว`);
  } else {
    const now = new Date();
    let id = row?.id ?? null;
    if (!row) {
      const t = now.toISOString();
      const created = await prisma.tenantIntegration.create({
        data: {
          tenantId: S.tenantId,
          kind: S.kind,
          provider: S.provider,
          label: S.label,
          unitIds: [],
          status: "CONNECTED",
          publicFields: {},
          secretBox: null,
          secretNames: [],
          onFailure: "MANUAL",
          lastTestAt: now,
          lastTestOk: true,
          consecutiveFailures: 0,
          quota: { remaining: S.quota.remaining, limit: S.quota.limit, resetsAt: null, checkedAt: t, lowAlertedAt: t },
          createdById: S.ownerUserId,
          updatedById: S.ownerUserId,
        },
      });
      id = created.id;
      sum.created++;
    }
    const want = sceneLogs(now);
    const have = await prisma.integrationCallLog.count({ where: { tenantId: S.tenantId, integrationId: id! } });
    if (have !== want.length) {
      if (have) await prisma.integrationCallLog.deleteMany({ where: { tenantId: S.tenantId, integrationId: id! } });
      await prisma.integrationCallLog.createMany({ data: want.map((l) => ({ tenantId: S.tenantId, integrationId: id!, ...l })) });
      if (row) sum.updated++;
      else sum.created += want.length;
    }
    console.log(`${LABEL}: แถว ${id} · log ${want.length} ครั้ง · โควตา ${S.quota.remaining}/${S.quota.limit}`);
  }
} catch (e) {
  console.error(`🔴 ${LABEL}: ${e instanceof Error ? e.message : String(e)}`);
  exitCode = 1;
}
await prisma.$disconnect();
console.log(`SCENE_SUMMARY ${JSON.stringify(sum)}`);
process.exit(exitCode);

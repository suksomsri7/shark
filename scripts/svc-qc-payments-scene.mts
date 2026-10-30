// svc-qc-payments-scene.mts — SVC D.10 · ฉากจอรับเงิน (ภาพ หอ 06) บนร้าน svcqc
//
// ใช้ (ต้องมีฉาก D.13 ก่อน — roomboard → lease → dorm-home):
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-payments-scene.mts            # ปรับฉาก
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-payments-scene.mts --clear    # คืนค่าช่องที่ปรับ
//
// ฉาก (ค่าจาก SQC_DORM_PAY_SCENE เท่านั้น): ปรับเฉพาะสลิป 3 ใบของฉาก D.13 (ระบุด้วย checks.idempotencyKey `svcqc-d13:<ห้อง>:<งวด>`)
//   ช่อง amountSatang · payerName · bankCode · transferredAt · reviewReason + checks.d10 = mark · ไม่แตะ refId/status/fileId/expectedSatang
//   ไม่สร้างบิล/สัญญา · ไม่แตะค่าตั้งระดับร้าน/หน่วย · ฉาก D.13 ไม่พร้อม ⇒ exit 3
// idempotent: อ่านเทียบก่อน ต่างเท่านั้นถึงเขียน · รันซ้ำ = SCENE_SUMMARY 0/0/0
// 🔴 รันผ่าน scripts/qc-svc.sh เท่านั้น (ด่าน host qc-svc ใน loadSvcQcEnv)
import { isDeepStrictEqual } from "node:util";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC_DORM_PAY_SCENE as SCN, SQC_TENANT, SQC_UNITS } from "./svc-qc-data.mjs";

const LABEL = "svc-qc-payments-scene";
const argv = process.argv.slice(2);
const unknown = argv.filter((a) => a !== "--clear");
if (unknown.length) {
  console.error(`🔴 ${LABEL}: ไม่รู้จัก ${unknown.join(" ")} (ใช้ได้: --clear)`);
  process.exit(2);
}
const clear = argv.includes("--clear");
loadSvcQcEnv(LABEL);
const { prisma } = (await import("@/lib/core/db" as string)) as { prisma: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

const stop = async (why: string): Promise<never> => {
  console.error(`🔴 ${LABEL}: ${why}`);
  await prisma.$disconnect();
  process.exit(3);
};
const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
let updated = 0;

const unit = await prisma.businessUnit.findFirst({ where: { tenantId: SQC_TENANT.id, slug: SQC_UNITS.dorm.slug }, select: { id: true } });
if (!unit) await stop("ไม่มีหน่วยหอของ svcqc — รันฉาก roomboard → lease → dorm-home ก่อน");
const slips = await prisma.paymentSlip.findMany({ where: { tenantId: SQC_TENANT.id, unitId: unit.id, domain: "DORM" } });
const keyOf = (s: { checks: unknown }) => (isRec(s.checks) && typeof s.checks.idempotencyKey === "string" ? s.checks.idempotencyKey : "");
for (const [room, want] of Object.entries(SCN.slips)) {
  const s = slips.find((x: { checks: unknown }) => keyOf(x).startsWith(`svcqc-d13:${room}:`));
  if (!s) {
    if (clear) continue;
    await stop(`ไม่พบสลิปฉาก D.13 ห้อง ${room} — รันฉาก dorm-home ก่อน`);
  }
  const checks = isRec(s.checks) ? { ...s.checks } : {};
  if (clear) {
    if (checks.d10 === undefined) continue;
    delete checks.d10;
    await prisma.paymentSlip.update({ where: { id: s.id }, data: { amountSatang: s.expectedSatang, payerName: null, bankCode: null, transferredAt: null, reviewReason: null, checks } });
    updated += 1;
    continue;
  }
  const next = { amountSatang: want.amountSatang, payerName: want.payerName, bankCode: want.bankCode, transferredAt: new Date(want.transferredAt), reviewReason: want.reasons.join(","), checks: { ...checks, d10: SCN.mark } };
  const cur = { amountSatang: s.amountSatang, payerName: s.payerName, bankCode: s.bankCode, transferredAt: s.transferredAt, reviewReason: s.reviewReason, checks: s.checks };
  if (isDeepStrictEqual(cur, next)) continue;
  await prisma.paymentSlip.update({ where: { id: s.id }, data: next });
  updated += 1;
}
console.log(`SCENE_SUMMARY ${JSON.stringify({ created: 0, updated, removed: 0 })}`);
await prisma.$disconnect();

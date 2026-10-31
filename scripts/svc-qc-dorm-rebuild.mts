// svc-qc-dorm-rebuild.mts — SVC G1R2-3 (มติผู้คุม 31 ต.ค. ทาง ข) · ล้างฉากหอทั้งสายแล้วสร้างใหม่ (หลังข้ามเดือนไทย)
//
// ใช้ (ฐาน QC ของ SVC เท่านั้น · ใต้ gate lock ของฐานนั้น):
//   bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/svc-qc-dorm-rebuild.mts            # ล้าง → สร้างใหม่
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-dorm-rebuild.mts --check                                   # ข้ามเดือนจากตอนสร้างแล้วหรือยัง (อ่านอย่างเดียว)
//
// เหตุ: ฉากหอนับงวดจากเดือนไทยปัจจุบัน M (D.8 = M · D.13 = M+1/M−1 · D.19 = M−5..M−2 · D.12 = เดือนของวันนี้−3 · มิเตอร์/ค่าน้ำไฟ = เดือนก่อน)
//   ข้ามเดือน ⇒ รอบบิลที่ฉากหนึ่งสร้างไว้ไปนั่งช่องงวดของอีกฉาก (D.13 exit 3 · D.19 exit 3 · d.8 ได้ SENT) — นิยามงวดของฉาก/ข้อสอบไม่เปลี่ยน (ไม่ทำทาง ก)
// ลำดับล้าง (ย้อนจากลำดับสร้าง · FK Restrict ของ DormBill/DormMoveOut → DormLease ตามหัวบล็อกแต่ละฉาก):
//   report D.19 → moveout D.12 (+ เอกสารบัญชีของฉาก D.12 ที่ระบุได้) → parcel D.18 → repair D.16 → portal D.9 → payments D.10 → overdue D.11
//   → dorm-home D.13 → รอบบิล D.8 ทุกงวด (ผู้สร้าง = เจ้าของ svcqc · เฉพาะเมื่อไม่มีบิลส่ง/เอกสารบัญชี) → utility → meter-ai → meter D.6 → lease D.5 → roomboard R0.9 → import D.4
// ลำดับสร้าง: roomboard → lease → meter → meter-ai → utility → billing D.8 → dorm-home D.13 → overdue → payments → portal → repair → parcel → report D.19 → moveout D.12
//   (moveout ท้ายสุด: วันที่ 1–3 ของเดือน งวดวันออกของ D.12 = M−1 = ช่อง PP ของ D.13 — ถ้าสร้างก่อน D.13 จะเปิดรอบของตัวเองที่งวดนั้นแล้ว D.13 exit 3)
// แตะเฉพาะร้าน svcqc · ลบเฉพาะแถวที่ระบุได้ว่าเป็นของฉาก (ฉากลูกลบตาม mark ของตัวเอง · ที่สคริปต์นี้ลบเอง: รอบ D.8 ผู้สร้าง = เจ้าของ svcqc · เอกสารบัญชี D.12 ที่ผูกคีย์ svcqc-scene:moveout:207)
// idempotent: รันซ้ำ = ล้างแล้วสร้างใหม่ ได้ฉากเดียวกัน (SCENE_SUMMARY รวมของฉากลูก) · ฉากลูกล้ม ⇒ หยุดทันที exit 1 (ไม่ทำขั้นถัดไป)
// บรรทัดท้าย: SCENE_SUMMARY {"created":n,"updated":n,"removed":n}
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC, SQC_USERS, SQC_DORM_MOVEOUT_SCENE as MOVEOUT } from "./svc-qc-data.mjs";

const LABEL = "svc-qc-dorm-rebuild";
loadSvcQcEnv(LABEL);
if (process.env.CI) {
  console.error(`🔴 ${LABEL}: ห้าม export CI`);
  process.exit(4);
}
const argv = process.argv.slice(2);
const unknown = argv.filter((a) => a !== "--check");
if (unknown.length) {
  console.error(`🔴 ${LABEL}: ไม่รู้จัก ${unknown.join(" ")} (ใช้ได้: --check)`);
  process.exit(2);
}
const CHECK = argv.includes("--check");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const { prisma } = await import("@/lib/core/db");
const tenantId = SQC.tenant.id;
const unitId = SQC.units.dorm.id;
const ownerId = SQC_USERS.find((u) => u.key === "owner")?.userId ?? "";
const D12_MARK = "SvcQcScene:d12";
const D12_KEY = MOVEOUT.depositKey; // "svcqc-scene:moveout:207"
const thaiMonth = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 7);

const CLEAR_BEFORE_D8 = ["report", "moveout", "parcel", "repair", "portal", "payments", "overdue", "dorm-home"];
const CLEAR_AFTER_D8 = ["utility", "meter-ai", "meter", "lease", "roomboard", "import"];
const BUILD = ["roomboard", "lease", "meter", "meter-ai", "utility", "billing", "dorm-home", "overdue", "payments", "portal", "repair", "parcel", "report", "moveout", "import"];

const sum = { created: 0, updated: 0, removed: 0 };

function scene(name: string, clear: boolean): void {
  const file = `scripts/svc-qc-${name}-scene.mts`;
  const r = spawnSync("pnpm", ["exec", "tsx", file, ...(clear ? ["--clear"] : [])], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  const m = /SCENE_SUMMARY (\{[^\n]*\})/.exec(out);
  const s = m ? (JSON.parse(m[1]!) as { created?: number; updated?: number; removed?: number }) : null;
  const tag = `${clear ? "ล้าง" : "สร้าง"} ${name}`;
  if (r.status !== 0 || !s) {
    console.error(`🔴 ${LABEL}: ${tag} ล้ม (exit ${r.status}) — ${out.split("\n").filter((l) => /🔴|Error|❌/.test(l)).slice(-3).join(" | ").slice(0, 400)}`);
    throw new Error(`${tag} ล้ม`);
  }
  sum.created += s.created ?? 0;
  sum.updated += s.updated ?? 0;
  sum.removed += s.removed ?? 0;
  console.log(`  ${tag}: ${JSON.stringify(s)}`);
}

/** รอบบิลของฉาก D.8 ทุกงวด (prepareBillRun ในนามเจ้าของ svcqc) — ลบได้เฉพาะเมื่อทุกบิลยัง DRAFT/HELD และไม่มีเอกสารบัญชี */
async function clearD8Runs(): Promise<void> {
  const runs = await prisma.dormBillRun.findMany({ where: { tenantId, unitId, createdById: ownerId }, select: { id: true, periodKey: true } });
  for (const r of runs) {
    const bad = await prisma.dormBill.count({ where: { runId: r.id, OR: [{ status: { notIn: ["DRAFT", "HELD"] } }, { accountDocumentId: { not: null } }] } });
    if (bad) throw new Error(`รอบ D.8 งวด ${r.periodKey} มีบิลส่งแล้ว/มีเอกสารบัญชี ${bad} ใบ (ไม่ใช่ของฉาก D.12) — ไม่ลบ`);
    const bills = (await prisma.dormBill.findMany({ where: { runId: r.id }, select: { id: true } })).map((b) => b.id);
    if (bills.length) sum.removed += (await prisma.paymentSlip.deleteMany({ where: { tenantId, unitId, refType: "DORM_BILL", refId: { in: bills } } })).count;
    sum.removed += (await prisma.dormBill.deleteMany({ where: { runId: r.id } })).count;
    sum.removed += (await prisma.dormBillRun.deleteMany({ where: { id: r.id, tenantId, unitId, createdById: ownerId } })).count;
  }
  console.log(`  ล้าง billing (D.8 ทุกงวด): ${runs.length} รอบ ${runs.map((r) => r.periodKey).join(",") || "—"}`);
}

/** เอกสารบัญชีของฉาก D.12 (ใบแจ้งหนี้งวดวันออก + รับชำระ) — ระบุด้วยคีย์รับชำระ svcqc-scene:moveout:207:pay:* และ refId `<สัญญาฉาก D.12>:<งวด>` เท่านั้น */
async function d12LeaseIds(): Promise<string[]> {
  return (await prisma.dormLease.findMany({ where: { tenantId, unitId, createdById: D12_MARK }, select: { id: true } })).map((l) => l.id);
}
async function clearD12Accounting(leaseIds: string[]): Promise<void> {
  const pays = await prisma.accountDocumentPayment.findMany({ where: { tenantId, idempotencyKey: { contains: `${D12_KEY}:pay:` } }, select: { id: true, documentId: true } });
  const byRef = leaseIds.length
    ? await prisma.accountDocument.findMany({ where: { tenantId, refType: "DormBill", OR: leaseIds.map((id) => ({ refId: { startsWith: `${id}:` } })) }, select: { id: true } })
    : [];
  const docIds = [...new Set([...pays.map((p) => p.documentId), ...byRef.map((d) => d.id)])];
  if (!docIds.length) {
    console.log("  ล้าง เอกสารบัญชี D.12: 0");
    return;
  }
  const payIds = (await prisma.accountDocumentPayment.findMany({ where: { tenantId, documentId: { in: docIds } }, select: { id: true } })).map((p) => p.id);
  const jv = await prisma.accountJournalEntry.findMany({
    where: { tenantId, OR: [{ refType: "AccountDocument", refId: { in: docIds } }, ...(payIds.length ? [{ refType: "AccountDocumentPayment", refId: { in: payIds } }] : []), { idempotencyKey: { contains: `${D12_KEY}:pay:` } }] },
    select: { id: true },
  });
  if (jv.length) sum.removed += (await prisma.accountJournalEntry.deleteMany({ where: { tenantId, id: { in: jv.map((j) => j.id) } } })).count;
  sum.removed += (await prisma.accountDocument.deleteMany({ where: { tenantId, id: { in: docIds } } })).count; // บรรทัด/รับชำระ = onDelete Cascade
  console.log(`  ล้าง เอกสารบัญชี D.12: เอกสาร ${docIds.length} · JV ${jv.length}`);
}

let exitCode = 0;
try {
  const M = thaiMonth();
  const d8 = await prisma.dormBillRun.findMany({ where: { tenantId, unitId, createdById: ownerId }, select: { periodKey: true }, orderBy: { periodKey: "desc" } });
  const built = d8[0]?.periodKey ?? null;
  if (CHECK) {
    const stale = built !== M;
    console.log(`${LABEL}: --check · เดือนไทยตอนนี้ ${M} · ฉาก D.8 สร้างไว้งวด ${built ?? "— (ยังไม่มีฉาก)"}${d8.length > 1 ? ` (+งวดเก่า ${d8.slice(1).map((r) => r.periodKey).join(",")})` : ""} ⇒ ${stale ? "ข้ามเดือนแล้ว/ไม่มีฉาก — ต้อง rebuild" : "ยังเป็นเดือนเดียวกัน"}`);
    console.log(`REBUILD_CHECK ${JSON.stringify({ month: M, built, stale })}`);
    await prisma.$disconnect();
    process.exit(stale ? 1 : 0);
  }
  console.log(`${LABEL}: เดือนไทย ${M} · ฉาก D.8 เดิมงวด ${built ?? "—"} — ล้างทั้งสาย`);
  const leases12 = await d12LeaseIds();
  for (const s of CLEAR_BEFORE_D8) {
    scene(s, true);
    if (s === "moveout") await clearD12Accounting(leases12);
  }
  await clearD8Runs();
  for (const s of CLEAR_AFTER_D8) scene(s, true);
  console.log(`${LABEL}: สร้างใหม่ทั้งสาย`);
  for (const s of BUILD) scene(s, false);
} catch (e) {
  exitCode = 1;
  console.error(`🔴 ${LABEL}: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  await prisma.$disconnect();
}
console.log(`SCENE_SUMMARY ${JSON.stringify(sum)}`);
process.exit(exitCode);

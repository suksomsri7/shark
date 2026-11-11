// svc-backfill-room-occupancy.mts — SVC R0.8 · เติม RoomOccupancy ให้การจองโรงแรมเดิม (ก่อน R0.8 ไม่มีการครองห้อง)
//   ห่อ `backfillHotelOccupancy` ของ facade `@/lib/modules/rooms` (สัญญา ledger/svc-briefs/svc-brief-r0.8.md §3)
//
// ใช้:
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-backfill-room-occupancy.mts --tenant <tenantId>          # dry-run (ค่าปริยาย)
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-backfill-room-occupancy.mts --all --apply                # เขียนจริงทุกร้าน
//
// 🔴 ค่าปริยาย = dry-run (dryRun: true · ไม่เขียนอะไรเลย) — เขียนจริงต้องใส่ `--apply`
// 🔴 ต้องระบุ `--tenant <id>` (ซ้ำได้) หรือ `--all` อย่างใดอย่างหนึ่ง
// 🔴 รันผ่าน scripts/qc-svc.sh เท่านั้น (ด่าน host qc-svc ใน loadSvcQcEnv) — prod = ผู้คุมสั่งหลัง deploy (ใบ R0.8 §7 · carry "ก่อน deploy prod")
// พิมพ์เฉพาะ id/ตัวเลข — ไม่มีชื่อแขก/เบอร์
import { loadSvcQcEnv } from "./svc-qc-env.mjs";

const LABEL = "svc-backfill-room-occupancy";
loadSvcQcEnv(LABEL);

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const all = argv.includes("--all");
const tenants: string[] = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--tenant") {
    const v = argv[i + 1];
    if (!v || v.startsWith("--")) {
      console.error(`🔴 ${LABEL}: --tenant ต้องตามด้วย tenantId`);
      process.exit(2);
    }
    tenants.push(v);
    i++;
  }
}
const unknown = argv.filter((a, i) => a.startsWith("--") && !["--apply", "--all", "--tenant"].includes(a) && argv[i - 1] !== "--tenant");
if (unknown.length) {
  console.error(`🔴 ${LABEL}: ไม่รู้จัก ${unknown.join(" ")}`);
  process.exit(2);
}
if (all === (tenants.length > 0)) {
  console.error(`🔴 ${LABEL}: ระบุ --tenant <id> หรือ --all อย่างใดอย่างหนึ่ง`);
  process.exit(2);
}
const dryRun = !apply;

const { prisma } = await import("@/lib/core/db");
const { backfillHotelOccupancy } = await import("@/lib/modules/rooms");

let exitCode = 0;
try {
  const ids = all
    ? (await prisma.hotelReservation.findMany({ where: { status: { in: ["BOOKED", "CHECKED_IN"] } }, distinct: ["tenantId"], select: { tenantId: true } })).map((r) => r.tenantId)
    : tenants;
  console.log(`${LABEL}: ${dryRun ? "DRY-RUN (ไม่เขียน · ใส่ --apply เพื่อเขียนจริง)" : "APPLY (เขียนจริง)"} · ${ids.length} ร้าน`);
  const sum = { scanned: 0, toCreate: 0, created: 0, conflicts: 0 };
  for (const tenantId of ids) {
    const r = await backfillHotelOccupancy({ tenantId, dryRun });
    sum.scanned += r.scanned;
    sum.toCreate += r.toCreate;
    sum.created += r.created;
    sum.conflicts += r.conflicts.length;
    console.log(`  tenant ${tenantId}: scanned=${r.scanned} toCreate=${r.toCreate} created=${r.created} conflicts=${r.conflicts.length}${r.conflicts.length ? ` [${r.conflicts.map((c) => c.reservationId).join(", ")}]` : ""}`);
  }
  console.log(`รวม: scanned=${sum.scanned} toCreate=${sum.toCreate} created=${sum.created} conflicts=${sum.conflicts}`);
  if (sum.conflicts > 0) console.log("⚠️ มีการจองที่ชนการครองห้องอื่น — ให้พนักงานย้ายห้อง/ติดต่อแขก (รายการ id ด้านบน)");
} catch (e) {
  console.error(`🔴 ${LABEL}: ล้ม — ${e instanceof Error ? e.message : String(e)}`);
  exitCode = 1;
} finally {
  await prisma.$disconnect();
}
process.exit(exitCode);

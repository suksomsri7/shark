// pos-backfill-web-prices.mts — POS P6.1 CD-P61-P8 · ตัวห่อ CLI ของ `backfillWebPrices` (src/lib/modules/pos/catalog.ts · P2.8 R9)
//
// ทำอะไร: เติมแถวราคาเว็บ (PosProductChannelPrice ช่องทาง WEB · ทุกสาขา) ให้สินค้าแคตตาล็อกที่มี ShopProduct เปิดขายชี้อยู่
//   แต่ยังไม่มีแถวนั้น (ข้อมูลก่อน "เขียนคู่" ของ P2.8) — ต้องทำ **ก่อน** เปิดอ่านราคาเว็บสองทาง (HANDOVER-P2 :219 · runbook §8 ขั้น 4)
//   • ตรรกะทั้งหมดอยู่ที่ catalog.ts (ผู้เขียนเดียวของแคตตาล็อก · F15.1) — สคริปต์นี้ = ด่าน + argv + พิมพ์สรุป เท่านั้น
//   • ทีละร้านในธุรกรรมเดียว (ล็อกแถวสินค้าเรียง id) · ร้านใดล้ม = ไม่มีอะไรค้างครึ่งทาง ร้านอื่นเดินต่อ
//   • รันซ้ำได้ (idempotent): รอบสอง `written` = 0 · สินค้าที่ ShopProduct หลายตัวตั้งราคาต่างกัน = นับ `webPriceConflict` ไม่เขียน (เจ้าของตัดสิน)
//   • ไม่แตะ ShopProduct/ราคาเดิม · audit ของแถวที่เขียน = ผู้กระทำ SYSTEM (ตามตัวเขียนใน catalog.ts)
//
// วิธีรัน (ด่าน host = scripts/lib/pos-prod-writer-guard.mts — เหมือน pos-backfill-catalog ทุกข้อ · CD-P61-R3)
//   QC4  : bash scripts/iso.sh bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pos-backfill-web-prices.mts [--tenant=<id|slug>]… --dry-run
//   PROD : (⛔ เจ้าของ · runbook §8.4 · worktree สะอาดที่ SHA ของ PR) ไม่โหลดไฟล์ env ใด ๆ — URL ส่งมาเองหลัง iso.sh
//          bash scripts/iso.sh env DATABASE_URL="$PROD_DIRECT_URL" DIRECT_URL="$PROD_DIRECT_URL" ALLOW_PROD_BACKFILL=1 pnpm exec tsx scripts/pos-backfill-web-prices.mts --tenant=<id> --dry-run
//          … เดียวกันแต่ไม่มี --dry-run = เขียนจริง (ต้องมี dry-run ของ host + ชุดร้านเดียวกันภายใน 24 ชม.) · ทุกร้าน = `--all` ที่พิมพ์เอง
// ผลที่คาด: บรรทัด `[target] … role=prod host=<mark>…` · `ร้าน N · สินค้าที่ตรวจ N · จะเขียน/เขียน N · ราคาเว็บชนกัน N` · รอบสอง เขียน 0
// exit: 0 = ทุกร้านผ่าน (ชนกัน = เตือน ไม่ล้ม) · 1 = มีร้านล้ม · 2 = ใช้ผิด / ไม่มี DATABASE_URL · 4 = ด่านปฏิเสธ
// บรรทัดท้าย = `JSON_SUMMARY {...}`
import { dryRunMarkerPath, guardWriterOrExit, hasRecentDryRun, parseWriterArgv, writeDryRunMarker } from "./lib/pos-prod-writer-guard.mjs";

const SCRIPT = "pos-backfill-web-prices";
const wargs = parseWriterArgv(process.argv.slice(2));
if (wargs.verify) {
  console.error(`🔴 ${SCRIPT}: ไม่มีโหมด --verify — ใช้ --dry-run (อ่านอย่างเดียว · นับสิ่งที่จะเขียน)`);
  process.exit(2);
}
// ไม่โหลดไฟล์ env เลย (ทั้ง prod และ QC) — QC4 ผ่าน scripts/qc4.sh ที่ export DATABASE_URL/DIRECT_URL ให้แล้ว
const target = guardWriterOrExit(SCRIPT, wargs);
const markerPath = dryRunMarkerPath(SCRIPT, target.label, wargs);
if (target.prodLike && !wargs.dryRun && !hasRecentDryRun(markerPath)) {
  console.error(`🔴 หยุด! ${SCRIPT}: ${target.role} ต้องรัน --dry-run ด้วยชุด --tenant เดียวกันก่อน (ภายใน 24 ชม.) — ไม่พบ ${markerPath}`);
  process.exit(4);
}

const { prisma } = await import("@/lib/core/db");
const { backfillWebPrices } = await import("@/lib/modules/pos/catalog");

let tenantIds: string[];
if (wargs.tenants.length) {
  const rows = await prisma.tenant.findMany({ where: { OR: [{ id: { in: wargs.tenants } }, { slug: { in: wargs.tenants } }] }, select: { id: true, slug: true } });
  const missing = wargs.tenants.filter((t) => !rows.some((r) => r.id === t || r.slug === t));
  if (missing.length) {
    console.error(`🔴 ${SCRIPT}: ไม่พบร้าน ${missing.join(", ")}`);
    await prisma.$disconnect();
    process.exit(2);
  }
  tenantIds = rows.map((r) => r.id);
} else {
  tenantIds = (await prisma.tenant.findMany({ orderBy: { createdAt: "asc" }, select: { id: true } })).map((r) => r.id);
}

const t0 = Date.now();
const s = await backfillWebPrices({ tenantIds, dryRun: wargs.dryRun }, prisma);
await prisma.$disconnect();

const verb = wargs.dryRun ? "จะเขียน" : "เขียน";
console.log(`ร้าน ${s.tenants} · สินค้าที่ตรวจ (มี ShopProduct เปิดขายชี้) ${s.scanned} · ${verb} ${s.written} · ราคาเว็บชนกัน ${s.webPriceConflict} · ${Date.now() - t0} ms`);
for (const c of s.conflicts.slice(0, 20)) console.log(`  ⚠️  ชนกัน: สินค้า ${c.posProductId} ← ShopProduct ${c.shopProductIds.join(", ")} (ราคาต่างกัน — เจ้าของเลือกราคาเว็บเองในหน้าสินค้า · สคริปต์ไม่เขียน)`);
if (s.conflicts.length > 20) console.log(`  … อีก ${s.conflicts.length - 20} รายการ (ดู JSON_SUMMARY)`);
for (const f of s.failedTenants) console.error(`🔴 ร้าน ${f.tenantId} ล้ม (ไม่มีอะไรค้างครึ่งทาง): ${f.error}`);
if (target.prodLike && wargs.dryRun && !s.failedTenants.length) {
  writeDryRunMarker(markerPath, { host: target.label, tenants: wargs.tenants, all: wargs.all, written: s.written });
  console.log(`บันทึก dry-run ไว้ที่ ${markerPath} (รันจริงได้ภายใน 24 ชม.)`);
}
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SCRIPT, role: target.role, host: target.label, ...s })}`);
process.exit(s.failedTenants.length ? 1 : 0);

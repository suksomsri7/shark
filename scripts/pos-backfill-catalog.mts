// pos-backfill-catalog.mts — POS WO P1.1a · backfill แคตตาล็อกเดียว (PosProduct) จากของเดิม
//
// ตรรกะทั้งหมดอยู่ที่ `src/lib/modules/pos/catalog.ts` → `backfillCatalog` (ผู้เขียนเดียวของแคตตาล็อก · F15.1)
// สคริปต์นี้ = ด่าน env + อ่าน argv + พิมพ์สรุป เท่านั้น
//   • InvItem → PosProduct ของระบบ POS ที่ขายมันวันนี้ (คลังผูกสาขาเดียวกับ POS · 0 หรือ >1 POS = ข้าม+นับ)
//   • MenuItem → PosProduct kind MENU ของตัวเอง (+ PosCategory จาก MenuCategory · PosProductOptionGroup · RecipeLine ถ้าผูก InvItem)
//   • ShopProduct → POS ตัวแรกของร้าน (ทางเดียวกับ shop checkout) · มี invItemId = แถวเดียวกับ InvItem นั้น
//   • ไม่สร้าง InvItem · ไม่แก้แถวเดิม (นอกจากคอลัมน์เชื่อมใหม่ posProductId — ไม่แตะ updatedAt)
//   • idempotent (รอบสอง created 0 · updated 0) · 2 โปรเซสพร้อมกันปลอดภัย (ล็อกร้าน)
//
// วิธีรัน
//   QC4  : bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pos-backfill-catalog.mts [--tenant=<id|slug>]… [--dry-run]
//   PROD : ALLOW_PROD_BACKFILL=1 pnpm exec tsx scripts/pos-backfill-catalog.mts --tenant=<id> --dry-run   ← ต้องรัน dry-run ก่อนเสมอ
//          ALLOW_PROD_BACKFILL=1 pnpm exec tsx scripts/pos-backfill-catalog.mts --tenant=<id>             ← จริง (ต้องมี dry-run ภายใน 24 ชม. ชุดร้านเดียวกัน)
//          ทุกร้านบน prod ต้องพิมพ์ `--all` เอง (C13: prod ไม่มี --tenant และไม่มี --all = ปฏิเสธ)
// บรรทัดท้าย = `JSON_SUMMARY {...}` (มี `counts` ตัวนับ C7/C9/D3 + `samples` ตัวอย่าง ≤20 ต่อร้าน) · ร้านใดล้ม = exit 1 (ร้านอื่นยังเดินต่อ)
// 🔴 ฐาน QC: ไม่ระบุ --tenant = ทุกร้านในฐานนั้น · รัน backfill นอกเวลาขาย (ล็อกระดับร้านชนกับผู้เขียนแคตตาล็อก — หนี้ P6.1 runbook)

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isProdDbUrl } from "./qc-env-guard.mjs";

const SCRIPT = "pos-backfill-catalog";

// ── argv ──
const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run") || argv.includes("--dryrun");
const allTenants = argv.includes("--all");
const tenantArgs: string[] = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i] ?? "";
  if (a.startsWith("--tenant=")) tenantArgs.push(a.slice("--tenant=".length).trim());
  else if (a === "--tenant") tenantArgs.push((argv[++i] ?? "").trim());
}
if (tenantArgs.some((t) => !t)) {
  console.error(`🔴 ${SCRIPT}: --tenant ว่าง — ใส่ id หรือ slug ของร้าน`);
  process.exit(2);
}

// ── env (แบบ member-backfill-common): QC เป็นค่าปริยาย · prod ต้องตั้ง ALLOW_PROD_BACKFILL=1 เอง ──
const allowProd = process.env.ALLOW_PROD_BACKFILL === "1";
try {
  // loadEnvFile ไม่ทับค่าที่ export มาแล้ว (qc4.sh export ให้แล้ว)
  process.loadEnvFile(allowProd ? (process.env.BACKFILL_ENV_FILE ?? ".env") : (process.env.QC_ENV_FILE ?? ".env.qc"));
} catch {
  /* ไม่มีไฟล์ — ต้อง export DATABASE_URL มาเอง (ตรวจด้านล่าง) */
}
const dbUrl = process.env.DATABASE_URL ?? "";
const directUrl = process.env.DIRECT_URL ?? "";
if (!dbUrl) {
  console.error(`🔴 ${SCRIPT}: ไม่มี DATABASE_URL — รันผ่าน bash scripts/iso.sh bash scripts/qc4.sh …`);
  process.exit(4);
}
const isProd = isProdDbUrl(dbUrl) || isProdDbUrl(directUrl);
const host = (() => {
  try {
    return new URL(dbUrl).hostname;
  } catch {
    return "(อ่าน host ไม่ได้)";
  }
})();
if (isProd && !allowProd) {
  console.error(`🔴 หยุด! ${SCRIPT}: DATABASE_URL ชี้ production — ต้องตั้ง ALLOW_PROD_BACKFILL=1 เอง และรัน --dry-run ก่อน`);
  process.exit(4);
}
// C13: บน prod ต้องเลือกร้านชัด ๆ — --tenant=<id> (ซ้ำได้) หรือ --all ที่พิมพ์เอง (ไม่ระบุอะไรเลย = ปฏิเสธ)
if (isProd && !tenantArgs.length && !allTenants) {
  console.error(`🔴 หยุด! ${SCRIPT}: production ต้องระบุ --tenant=<id> หรือ --all เอง`);
  process.exit(4);
}
if (allTenants && tenantArgs.length) {
  console.error(`🔴 ${SCRIPT}: ใช้ --tenant กับ --all พร้อมกันไม่ได้`);
  process.exit(2);
}
// ด่าน "dry-run ก่อนเสมอ" บน prod: dry-run เขียนบันทึก (ไฟล์ในเครื่อง ไม่ลง git) · รันจริงต้องเจอบันทึกของ host+ชุดร้านเดียวกัน ภายใน 24 ชม.
const markerDir = ".qc-shots/pos";
const markerKey = createHash("sha256").update(`${host}|${allTenants ? "--all" : [...tenantArgs].sort().join(",")}`).digest("hex").slice(0, 16);
const markerPath = `${markerDir}/backfill-dryrun-${markerKey}.json`;
if (isProd && !dryRun) {
  const ok = existsSync(markerPath) && (() => {
    try {
      const m = JSON.parse(readFileSync(markerPath, "utf8")) as { at?: string };
      return !!m.at && Date.now() - Date.parse(m.at) < 24 * 3600_000;
    } catch {
      return false;
    }
  })();
  if (!ok) {
    console.error(`🔴 หยุด! ${SCRIPT}: production ต้องรัน --dry-run ด้วยชุด --tenant เดียวกันก่อน (ภายใน 24 ชม.) — ไม่พบ ${markerPath}`);
    process.exit(4);
  }
}
if (isProd) console.warn(`⚠️  ALLOW_PROD_BACKFILL=1 — กำลังรันบนฐานข้อมูลจริง (${host})${dryRun ? " · dry-run" : ""}`);
console.log(`[env] ${SCRIPT} · DB ${host}${dryRun ? " · DRY-RUN (ไม่เขียนอะไรเลย)" : ""}`);

const { prisma } = await import("@/lib/core/db");
const catalog = await import("@/lib/modules/pos/catalog");

// ── ร้านที่จะทำ: --tenant (id หรือ slug · ไม่พบ = ตายเสียงดัง) · ไม่ระบุ = ทุกร้าน ──
let tenantIds: string[];
if (tenantArgs.length) {
  const rows = await prisma.tenant.findMany({ where: { OR: [{ id: { in: tenantArgs } }, { slug: { in: tenantArgs } }] }, select: { id: true, slug: true } });
  const missing = tenantArgs.filter((t) => !rows.some((r) => r.id === t || r.slug === t));
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
const s = await catalog.backfillCatalog({ tenantIds, dryRun }, prisma);
await prisma.$disconnect();

const verb = dryRun ? "จะ" : "";
console.log(`ร้าน ${s.tenants} · แหล่ง InvItem ${s.sources.invItem} · MenuItem ${s.sources.menuItem} · ShopProduct ${s.sources.shopProduct}`);
for (const [sys, v] of Object.entries(s.perSystem)) console.log(`  ระบบ POS ${sys}: InvItem ${v.invItem} · MenuItem ${v.menuItem} · ShopProduct ${v.shopProduct}`);
console.log(`ข้าม (หา POS ไม่เจอ): InvItem ${s.skippedNoPosSystem.invItem} · MenuItem ${s.skippedNoPosSystem.menuItem} · ShopProduct ${s.skippedNoPosSystem.shopProduct} · เหตุ ${JSON.stringify(s.skipped)}`);
console.log(`ตัวนับ (เจ้าของควรดูก่อนเปิดใช้): ${JSON.stringify(s.counts)}`);
const SAMPLE_LABEL: Record<string, string> = {
  soldAtCostToday: "ลิ้นชักวันนี้คิดราคาทุน → แคตตาล็อกใหม่ \"ยังไม่ตั้งราคา\"",
  apIgnoredButTillPriced: "ลิ้นชักวันนี้คิดราคาจากสินค้าบัญชีที่เก็บถาวร/สมุดอื่น → \"ยังไม่ตั้งราคา\"",
  invalidLegacyPrice: "ราคาเดิมผิดรูป (ติดลบ ฯลฯ) → \"ยังไม่ตั้งราคา\"",
  priceNotSetOther: "ไม่มีราคาขายจากแหล่งใดเลย → \"ยังไม่ตั้งราคา\"",
  servicePriceDiffersFromAccountProduct: "บริการ: ราคาในคลัง ≠ ราคาขายในบัญชี (ใช้ราคาบัญชี)",
  catalogPriceDiffersFromTill: "ราคาแคตตาล็อก ≠ ราคาที่ลิ้นชักคิดวันนี้ (แคตตาล็อก/ลิ้นชัก สตางค์)",
};
// R4/E3: ตัวนับราคา null 4 ตัวแบ่งแถวราคา null ไม่ซ้อนกัน (soldAtCostToday → apIgnoredButTillPriced → invalidLegacyPrice → priceNotSetOther)
const sampleText = (r: { name: string; catalogPriceSatang?: number; tillPriceSatang?: number }) =>
  typeof r.catalogPriceSatang === "number" ? `${r.name} (${r.catalogPriceSatang}/${r.tillPriceSatang})` : r.name;
for (const [k, byTenant] of Object.entries(s.samples))
  for (const [t, rows] of Object.entries(byTenant)) if (rows.length) console.log(`  ร้าน ${t} ${SAMPLE_LABEL[k] ?? k} (ตัวอย่าง ≤20): ${rows.map(sampleText).join(" · ")}`);
console.log(`${verb}สร้าง ${JSON.stringify(s.created)} · ${verb}ผูกคอลัมน์เชื่อม ${JSON.stringify(s.updated)} · มีอยู่แล้ว ${JSON.stringify(s.alreadyDone)} · ${Date.now() - t0} ms`);
for (const f of s.failedTenants) console.error(`🔴 ร้าน ${f.tenantId} ล้ม (ไม่มีอะไรค้างครึ่งทาง): ${f.error}`);
if (isProd && dryRun && !s.failedTenants.length) {
  mkdirSync(markerDir, { recursive: true });
  writeFileSync(markerPath, JSON.stringify({ at: new Date().toISOString(), host, tenants: tenantArgs, created: s.created }, null, 2));
  console.log(`บันทึก dry-run ไว้ที่ ${markerPath} (รันจริงได้ภายใน 24 ชม.)`);
}
console.log(`JSON_SUMMARY ${JSON.stringify(s)}`);
process.exit(s.failedTenants.length ? 1 : 0);

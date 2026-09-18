// CRM v2 backfill (ใบ C1.1 · พิมพ์เขียว 20-crm-v2 §4.6 ข้อ 3) — `stage-history-seed`
//
// ดีลทุกใบที่ยังไม่มีแถว `CrmDealStageHistory` เลย → สร้างแถวแรก 1 แถว = "อยู่ขั้นปัจจุบัน"
//   (fromStageId null · toStageId = stageId ปัจจุบัน · enteredAt = CrmDeal.stageEnteredAt · bySource AUTO)
//   ⇒ รายงานเวลาในขั้น/ความเร็ว pipeline ของ C3.1 มีจุดเริ่มต้นให้ทุกดีล
// 🔴 ไม่เดาประวัติย้อนหลัง (ระบบเดิมไม่เคยเก็บ) · ไม่แตะคอลัมน์ของดีล (stageEnteredAt ของดีลเดิม = เวลาที่ migration รัน
//    ⇒ ดีลเก่าไม่ถูกนับเป็น "ดีลนิ่ง" ทันทีที่เปิดใช้ — ปลอดภัยกว่าเดาจาก updatedAt)
// 🔴 idempotent: INSERT … WHERE NOT EXISTS (แถวของดีลนั้น) — รันซ้ำ = 0 แถว
// 🔴 AUDIT-CLASS X3: ทีละร้านใต้ `pg_advisory_xact_lock` + INSERT…SELECT คำสั่งเดียว ⇒ 2 โปรเซสพร้อมกันไม่เกิดแถวซ้ำ
//
// วิธีรัน
//   QC   :  pnpm exec tsx scripts/crm-backfill-stage-history.mts [--tenant <slug>] [--dry-run]
//   PROD :  ALLOW_PROD_BACKFILL=1 pnpm exec tsx scripts/crm-backfill-stage-history.mts --tenant <slug> --dry-run   (ใบ C6.2 เท่านั้น)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const SCRIPT = "crm-backfill-stage-history";
const common = (await import("./member-backfill-common.mts" as string)) as Any;
const args = common.parseArgs();
await common.loadBackfillEnv(SCRIPT);

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const tenants = await common.pickTenants(prisma, args.tenantSlug);
common.banner(SCRIPT, args, tenants);

const counts = { ร้านที่แก้: 0, ดีลที่ได้ประวัติแถวแรก: 0, ร้านที่ล้ม: 0 };
for (const t of tenants) {
  try {
    const pending = Number((await P.crmDeal.count({ where: { tenantId: t.id, stageHistory: { none: {} } } })) ?? 0);
    if (pending === 0) { console.log(`  · ${t.slug}: ดีลทุกใบมีประวัติขั้นแล้ว`); continue; }
    let done = pending;
    if (!args.dryRun) try {
      done = await P.$transaction(async (tx: Any) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`crm-backfill:stage-history:${t.id}`}))`;
        return tx.$executeRaw`
          INSERT INTO "CrmDealStageHistory" ("id", "tenantId", "dealId", "fromStageId", "toStageId", "bySource", "enteredAt", "note")
          SELECT 'bf' || md5(d."id" || ':stage-history'), d."tenantId", d."id", NULL, d."stageId", 'AUTO'::"CrmActivitySource", d."stageEnteredAt",
                 'ย้ายระบบ CRM v2: ขั้นปัจจุบัน ณ วันเปิดใช้ (ไม่มีประวัติก่อนหน้า)'
            FROM "CrmDeal" d
           WHERE d."tenantId" = ${t.id}
             AND NOT EXISTS (SELECT 1 FROM "CrmDealStageHistory" h WHERE h."dealId" = d."id")
          ON CONFLICT ("id") DO NOTHING`;
      }, { timeout: 600_000, maxWait: 120_000 });
    } catch (e) {
      // 🔴 ร้านหนึ่งล้ม = rollback เฉพาะร้านนั้น · log แค่ id (ไม่มีข้อมูลลูกค้า) แล้วร้านถัดไปเดินต่อ
      counts.ร้านที่ล้ม += 1;
      console.error(`  ❌ ร้าน ${t.id} (${t.slug}): ล้ม — ${e instanceof Error ? e.name : "unknown"} · ข้ามไปร้านถัดไป`);
      continue;
    }
    counts.ร้านที่แก้ += 1;
    counts.ดีลที่ได้ประวัติแถวแรก += Number(done);
    console.log(`  ✏️  ${t.name} (${t.slug}) · ดีลที่${args.dryRun ? "จะ" : ""}ได้ประวัติแถวแรก ${done} ใบ`);
  } catch (e) {
    // 🔴 ร้านหนึ่งล้ม (รวมตอนอ่านข้อมูลก่อนเขียน) = log แค่ tenant id (ไม่มีข้อมูลลูกค้า) แล้วร้านถัดไปเดินต่อ
    counts.ร้านที่ล้ม = (counts.ร้านที่ล้ม ?? 0) + 1;
    console.error(`  ❌ ร้าน ${t.id} (${t.slug}): ล้ม — ${e instanceof Error ? e.name : "unknown"} · ข้ามไปร้านถัดไป`);
  }
}

common.summary(SCRIPT, args, counts);
// ร้านที่ล้ม > 0 = exit 1 (ร้านอื่นทำครบแล้ว — รันซ้ำเก็บตกได้เพราะ idempotent) ให้คนรัน/CI เห็นว่าไม่ครบ
if (counts.ร้านที่ล้ม) process.exitCode = 1;
await prisma.$disconnect();

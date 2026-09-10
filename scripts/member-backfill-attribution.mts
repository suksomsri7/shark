// backfill 5/6 — ช่องทางที่มา (D10 · พิมพ์เขียว §4.6 ข้อ 6 · §7.2)
//
// สมาชิกเดิมไม่มีช่อง "มาจากไหน" เลย ⇒ ต้องเติมให้ทุกคนมี `source` และมี first touch 1 แถว
//   • ไม่มี `source` → ตั้ง `WALK_IN` ("เดินเข้าร้าน") = คำตอบที่ซื่อสัตย์ที่สุดเมื่อไม่มีหลักฐาน
//     ยกเว้นคนที่มีร่องรอยว่ามาจากการนำเข้าไฟล์ (MemberActivity module = "import") → `IMPORT`
//   • ไม่มี `MemberAttribution` touch=FIRST → สร้างจาก source นั้น (occurredAt = วันที่สมัคร · unitId = สาขาหลัก)
//
// 🔴 ไม่ทับของเดิม: คนที่มี source อยู่แล้วคง source เดิม · คนที่มี FIRST อยู่แล้วไม่แตะ
//    (first touch ตามนิยามคือ "เขียนครั้งเดียว" — ถ้า backfill ทับ ข้อมูลจริงจะหายไปเงียบ ๆ)
// 🔴 ไม่สร้าง LAST touch: เราไม่รู้ว่าครั้งล่าสุดเขามาจากไหน การเดา = ทำให้รายงานที่มาผิดทั้งร้าน
//
// วิธีรัน
//   QC   :  pnpm exec tsx scripts/member-backfill-attribution.mts [--tenant <slug>] [--dry-run]
//   PROD :  ALLOW_PROD_BACKFILL=1 pnpm exec tsx scripts/member-backfill-attribution.mts --tenant <slug>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const SCRIPT = "member-backfill-attribution";
const common = (await import("./member-backfill-common.mts" as string)) as Any;
const args = common.parseArgs();
await common.loadBackfillEnv(SCRIPT);

const { prisma } = await import("@/lib/core/db");
const tenants = await common.pickTenants(prisma, args.tenantSlug);
common.banner(SCRIPT, args, tenants);

const counts = { ร้านที่แก้: 0, ตั้งที่มา: 0, จากนำเข้าไฟล์: 0, firstTouchที่สร้าง: 0 };

for (const t of tenants) {
  let touched = false;
  const work = async (tx: Any) => {
    const customers = (await tx.customer.findMany({
      where: { tenantId: t.id },
      select: { id: true, source: true, createdAt: true, homeUnitId: true },
      orderBy: { createdAt: "asc" },
    })) as Any[];
    for (const c of customers) {
      let source: string = c.source ?? "";
      if (!c.source) {
        // หลักฐานเดียวที่เชื่อถือได้ว่า "มาจากการนำเข้า" = ไทม์ไลน์ที่โมดูล import เขียนไว้
        const fromImport = await tx.memberActivity.count({ where: { customerId: c.id, module: "import" } });
        source = fromImport > 0 ? "IMPORT" : "WALK_IN";
        counts.ตั้งที่มา += 1;
        if (source === "IMPORT") counts.จากนำเข้าไฟล์ += 1;
        touched = true;
        if (!args.dryRun) await tx.customer.update({ where: { id: c.id }, data: { source } });
      }
      const hasFirst = await tx.memberAttribution.count({ where: { customerId: c.id, touch: "FIRST" } });
      if (hasFirst === 0) {
        counts.firstTouchที่สร้าง += 1;
        touched = true;
        if (!args.dryRun) {
          await tx.memberAttribution.create({
            data: {
              tenantId: t.id,
              customerId: c.id,
              touch: "FIRST",
              source,
              unitId: c.homeUnitId ?? null,
              occurredAt: c.createdAt,
            },
          });
        }
      }
    }
    if (args.dryRun && customers.length) {
      console.log(`  [dry-run] ${t.slug}: ตรวจสมาชิก ${customers.length} คน — จะเติมที่มา/first touch เฉพาะคนที่ยังว่าง`);
    }
  };

  if (args.dryRun) await work(prisma);
  else await prisma.$transaction(work, { timeout: 180_000, maxWait: 30_000 });
  if (touched) {
    counts.ร้านที่แก้ += 1;
    console.log(`  ✏️  ${t.name} (${t.slug})`);
  }
}

common.summary(SCRIPT, args, counts);
await prisma.$disconnect();

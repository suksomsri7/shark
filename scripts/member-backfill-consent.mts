// backfill 3/6 — ความยินยอมรับข่าวสารต่อช่องทาง (D19 · พิมพ์เขียว §4.6 ข้อ 3)
//
// ของเดิมมีช่องเดียว `Customer.marketingConsent` (จริง/เท็จ) ⇒ ตอบไม่ได้ว่า "ยอมทางไหน"
// v2 เก็บเป็นแถวต่อช่องทาง ⇒ backfill กระจายค่าเดิมออกเป็น 3 ช่องทางที่ส่งจริงได้วันนี้: LINE / EMAIL / SMS
//
// 🔴 คนที่ปฏิเสธ (marketingConsent = false) ก็เขียนแถว granted=false ด้วย — ไม่ใช่ "ไม่มีแถว"
//    เพราะ PDPA ต้องพิสูจน์ได้ว่า "เคยถามแล้วเขาไม่ยอม" ต่างจาก "ไม่เคยถาม"
// 🔴 `source = IMPORT` ทุกแถว: เราไม่รู้จริง ๆ ว่าตอนนั้นเก็บมาจากช่องทางไหน — บอกความจริงว่า "มาจากการย้ายข้อมูล"
//
// วิธีรัน
//   QC   :  pnpm exec tsx scripts/member-backfill-consent.mts [--tenant <slug>] [--dry-run]
//   PROD :  ALLOW_PROD_BACKFILL=1 pnpm exec tsx scripts/member-backfill-consent.mts --tenant <slug>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const SCRIPT = "member-backfill-consent";
const common = (await import("./member-backfill-common.mts" as string)) as Any;
const args = common.parseArgs();
await common.loadBackfillEnv(SCRIPT);

const { prisma } = await import("@/lib/core/db");
const ch = (await import("@/lib/core/channels" as string)) as { isChannelKey: (x: string) => boolean };
const tenants = await common.pickTenants(prisma, args.tenantSlug);
common.banner(SCRIPT, args, tenants);

// ช่องทางที่ค่าเดิมครอบคลุม — ต้องอยู่ในทะเบียนกลางเสมอ (fail-closed)
const CHANNELS = ["LINE", "EMAIL", "SMS"];
for (const c of CHANNELS) {
  if (!ch.isChannelKey(c)) {
    console.error(`🔴 ช่องทาง "${c}" ไม่มีในทะเบียน src/lib/core/channels.ts — หยุดก่อนเขียนข้อมูลผิด`);
    process.exit(1);
  }
}

const counts = { ร้านที่แก้: 0, แถวยินยอมที่สร้าง: 0, ยอมรับ: 0, ปฏิเสธ: 0 };

for (const t of tenants) {
  let touched = false;
  const work = async (tx: Any) => {
    const customers = (await tx.customer.findMany({
      where: { tenantId: t.id },
      select: { id: true, marketingConsent: true, consentAt: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    })) as Any[];
    for (const c of customers) {
      const have = (await tx.memberConsent.findMany({ where: { customerId: c.id }, select: { channel: true } })) as { channel: string }[];
      const haveSet = new Set(have.map((h) => h.channel));
      for (const channel of CHANNELS) {
        if (haveSet.has(channel)) continue;
        counts.แถวยินยอมที่สร้าง += 1;
        if (c.marketingConsent) counts.ยอมรับ += 1;
        else counts.ปฏิเสธ += 1;
        touched = true;
        if (args.dryRun) continue;
        await tx.memberConsent.create({
          data: {
            tenantId: t.id,
            customerId: c.id,
            channel,
            granted: c.marketingConsent,
            source: "IMPORT",
            // ยอมรับ = ใช้เวลาที่บันทึกไว้ (ไม่มี = วันที่สร้างสมาชิก) · ปฏิเสธ = ไม่มีเวลาให้ยอมรับ
            grantedAt: c.marketingConsent ? (c.consentAt ?? c.createdAt) : null,
          },
        });
      }
    }
    if (args.dryRun && customers.length) {
      console.log(`  [dry-run] ${t.slug}: สมาชิก ${customers.length} คน — จะเขียนแถวยินยอมที่ยังขาดของช่องทาง ${CHANNELS.join("/")}`);
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

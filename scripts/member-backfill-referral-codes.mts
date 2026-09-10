// backfill 7/7 — โค้ดแนะนำเพื่อนของสมาชิกเดิม (D6 · พิมพ์เขียว §4.1 `Customer.referralCode`)
//
// 🔴 ทำไมต้องมีสคริปต์นี้ (เพิ่มที่ M1.4 — ไม่ได้อยู่ในรายการ 6 ตัวของ §4.6):
//    `createMember` ของ v2 แจกโค้ดให้สมาชิกใหม่ตั้งแต่วินาทีที่สมัคร แต่สมาชิก **ที่มีอยู่ก่อน v2**
//    (ทุกร้านที่ใช้ SHARK มาก่อน) ยังไม่มีโค้ดเลยสักคน ⇒ ฟีเจอร์ "ชวนเพื่อน" ใช้ไม่ได้กับลูกค้าเก่า
//    ซึ่งเป็นกลุ่มที่ร้านอยากให้ชวนเพื่อนที่สุด · การแจกตอน "กดดูหน้าโปรไฟล์" ก็ไม่ได้ เพราะโค้ด
//    ต้องมีอยู่ก่อนที่ใครจะเอาไปกรอกตอนสมัคร (คนแนะนำไม่ได้เปิดหน้าตัวเองก่อนเสมอไป)
//
// กติกา: โค้ด 8 ตัว A–Z/0–9 (ตัดตัวสับสน 0/O/1/I ชุดเดียวกับรหัสสมาชิก) · unique ต่อ **ร้าน**
//        (partial unique index จาก migration `member_v2_a` — เฉพาะแถวที่ไม่เป็น NULL)
// 🔴 idempotent: แตะเฉพาะแถวที่ `referralCode` ยังว่าง · ของที่มีอยู่แล้วไม่เปลี่ยนเด็ดขาด
//    (โค้ดที่ลูกค้าแชร์ออกไปแล้วเปลี่ยนไม่ได้ — ลิงก์เก่าจะพัง)
//
// วิธีรัน
//   QC   :  pnpm exec tsx scripts/member-backfill-referral-codes.mts [--tenant <slug>] [--dry-run]
//   PROD :  ALLOW_PROD_BACKFILL=1 pnpm exec tsx scripts/member-backfill-referral-codes.mts --tenant <slug>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const SCRIPT = "member-backfill-referral-codes";
const common = (await import("./member-backfill-common.mts" as string)) as Any;
const args = common.parseArgs();
await common.loadBackfillEnv(SCRIPT);

const { prisma } = await import("@/lib/core/db");
const { randomCode } = (await import("@/lib/core/hash")) as { randomCode: (n: number, alphabet: string) => string };
const tenants = await common.pickTenants(prisma, args.tenantSlug);
common.banner(SCRIPT, args, tenants);

const ALPHABET = "ACDEFGHJKLMNPQRSTUVWXY3456789";
const counts = { ร้านที่แก้: 0, โค้ดที่แจก: 0, มีอยู่แล้ว: 0 };

for (const t of tenants) {
  let touched = false;
  const work = async (tx: Any) => {
    const rows = (await tx.customer.findMany({
      where: { tenantId: t.id, referralCode: null },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    })) as { id: string }[];
    counts.มีอยู่แล้ว += await tx.customer.count({ where: { tenantId: t.id, NOT: { referralCode: null } } });
    if (rows.length === 0) return;

    // โค้ดที่ใช้ไปแล้วในร้านนี้ (กันชนกันเองภายในรอบเดียวโดยไม่ต้องยิง DB ทุกครั้ง)
    const used = new Set<string>(
      ((await tx.customer.findMany({
        where: { tenantId: t.id, NOT: { referralCode: null } },
        select: { referralCode: true },
      })) as { referralCode: string }[]).map((r) => r.referralCode),
    );

    for (const row of rows) {
      let code = "";
      for (let i = 0; i < 8 && !code; i += 1) {
        const candidate = randomCode(8, ALPHABET);
        if (!used.has(candidate)) code = candidate;
      }
      if (!code) code = randomCode(8, ALPHABET) + randomCode(4, ALPHABET);
      used.add(code);
      counts.โค้ดที่แจก += 1;
      touched = true;
      if (args.dryRun) continue;
      await tx.customer.update({ where: { id: row.id }, data: { referralCode: code } });
    }
    if (args.dryRun) console.log(`  [dry-run] ${t.slug}: จะแจกโค้ดแนะนำเพื่อน ${rows.length} คน`);
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

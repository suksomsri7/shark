// backfill 6/6 — ผูกพนักงาน HR เข้าบัญชีผู้ใช้ (D17 · มติ Fable ข้อ 1)
//
// D17 ให้ตั้งสิทธิ์ดูข้อมูลอ่อนไหวด้วย "ตำแหน่ง/แผนกจาก HR" (เช่น ตำแหน่ง "พยาบาล" เห็นส่วนสุขภาพได้)
// จะทำอย่างนั้นได้ ระบบต้องรู้ว่า **ผู้ใช้ที่กำลังเปิดหน้าอยู่คือพนักงานคนไหนในทะเบียน HR**
//   ⇒ ผูกด้วย `HrEmployee.linkedUserId` (คอลัมน์เดิม — staff/service.ts เขียนอยู่แล้ว ไม่เพิ่มคอลัมน์ซ้ำ)
//
// กติกาจับคู่: อีเมลตรงกัน (ตัดช่องว่าง · ไม่สนตัวพิมพ์ใหญ่เล็ก) **และ** ผู้ใช้คนนั้นมี Membership ในร้านเดียวกัน
// 🔴 เงื่อนไข "ต้องมี Membership ในร้านนี้" สำคัญ: User เป็นตัวตนข้ามร้าน — ถ้าจับด้วยอีเมลเปล่า
//    พนักงานร้าน ก. ที่ใช้อีเมลเดียวกันจะถูกผูกเข้าทะเบียนของร้าน ข. แล้วได้สิทธิ์ดูข้อมูลอ่อนไหวข้ามร้าน
// 🔴 ไม่มีอีเมล = ไม่แตะ · ผูกไว้แล้ว = ไม่เปลี่ยน (ของที่คนตั้งเองชนะการเดาเสมอ)
//
// วิธีรัน
//   QC   :  pnpm exec tsx scripts/member-backfill-hr-users.mts [--tenant <slug>] [--dry-run]
//   PROD :  ALLOW_PROD_BACKFILL=1 pnpm exec tsx scripts/member-backfill-hr-users.mts --tenant <slug>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const SCRIPT = "member-backfill-hr-users";
const common = (await import("./member-backfill-common.mts" as string)) as Any;
const args = common.parseArgs();
await common.loadBackfillEnv(SCRIPT);

const { prisma } = await import("@/lib/core/db");
const tenants = await common.pickTenants(prisma, args.tenantSlug);
common.banner(SCRIPT, args, tenants);

const counts = { ร้านที่แก้: 0, ผูกสำเร็จ: 0, ไม่มีอีเมล: 0, หาบัญชีไม่เจอ: 0 };

for (const t of tenants) {
  let touched = false;
  const work = async (tx: Any) => {
    const employees = (await tx.hrEmployee.findMany({
      where: { tenantId: t.id, linkedUserId: null },
      select: { id: true, name: true, email: true },
      orderBy: { createdAt: "asc" },
    })) as Any[];
    if (employees.length === 0) return;

    // ผู้ใช้ที่มี Membership ในร้านนี้ (Membership เป็นแกน global — ต้องกรอง tenantId เอง)
    const memberships = (await tx.membership.findMany({
      where: { tenantId: t.id },
      select: { userId: true, user: { select: { email: true } } },
    })) as Any[];
    const byEmail = new Map<string, string>();
    for (const m of memberships) {
      const e = (m.user?.email ?? "").trim().toLowerCase();
      if (e && !byEmail.has(e)) byEmail.set(e, m.userId);
    }

    for (const emp of employees) {
      const e = (emp.email ?? "").trim().toLowerCase();
      if (!e) {
        counts.ไม่มีอีเมล += 1;
        continue;
      }
      const userId = byEmail.get(e);
      if (!userId) {
        counts.หาบัญชีไม่เจอ += 1;
        continue;
      }
      counts.ผูกสำเร็จ += 1;
      touched = true;
      if (args.dryRun) {
        console.log(`  [dry-run] ${t.slug}: จะผูก "${emp.name}" เข้าบัญชีผู้ใช้ ${e}`);
        continue;
      }
      await tx.hrEmployee.update({ where: { id: emp.id }, data: { linkedUserId: userId } });
    }
  };

  if (args.dryRun) await work(prisma);
  else await prisma.$transaction(work, { timeout: 120_000, maxWait: 30_000 });
  if (touched) {
    counts.ร้านที่แก้ += 1;
    console.log(`  ✏️  ${t.name} (${t.slug})`);
  }
}

common.summary(SCRIPT, args, counts);
await prisma.$disconnect();

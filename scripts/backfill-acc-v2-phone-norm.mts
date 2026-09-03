// Backfill ครั้งเดียว (idempotent) — เติม `AccountContact.phoneNorm` จาก `phone` (WO 0.3)
//
// รัน:  QC_ENV_FILE=.env.qc pnpm tsx scripts/backfill-acc-v2-phone-norm.mts
//       (prod: Fable รันเองหลัง deploy ด้วย QC_ENV_FILE=.env — ดู ledger/wo-notes/0.3.md)
//
// ทำไมต้องมี: `phoneNorm` คือกุญแจจับผู้ติดต่อซ้ำจากเบอร์ · แถวเก่าทั้งหมดมี phoneNorm = NULL
//   ถ้าไม่เติม `findContactByPhoneNorm` จะจับคู่ไม่เจอ → ระบบสร้างผู้ติดต่อซ้ำ
//   (โค้ดมีทางสำรองสแกนแบบเดิมไว้ให้เฉพาะระบบที่ยัง backfill ไม่ถึง — ดู service.ts)
//
// คุณสมบัติ:
//   · idempotent — รันซ้ำกี่ครั้งผลเท่าเดิม (คำนวณค่าจาก phone ใหม่ทุกครั้ง เขียนเฉพาะแถวที่ค่าไม่ตรง)
//   · ไม่ทำลายข้อมูล — แตะเฉพาะคอลัมน์ phoneNorm · ไม่ลบ/ไม่รวมผู้ติดต่อ
//   · ครอบทั้งแถวที่ถูกเก็บ (archivedAt) ด้วย — เผื่อถูกกู้คืนภายหลัง
//   · --dry-run = นับอย่างเดียว ไม่เขียน
process.loadEnvFile?.(process.env.QC_ENV_FILE ?? ".env");

const { prisma } = await import("@/lib/core/db");
const { normalizePhoneTh } = await import("@/lib/modules/account/service");

const dryRun = process.argv.includes("--dry-run");
const envFile = process.env.QC_ENV_FILE ?? ".env";
const dbHost = (process.env.DATABASE_URL ?? "").replace(/^.*@/, "").split("/")[0] || "(ไม่พบ DATABASE_URL)";
console.log(`\n===== backfill AccountContact.phoneNorm ${dryRun ? "(ซ้อม — ไม่เขียน)" : ""} =====`);
console.log(`[env] ไฟล์ ${envFile} · DB ${dbHost}\n`);

const BATCH = 1000;
let cursor: string | undefined;
let scanned = 0;
let updated = 0;
let cleared = 0;

for (;;) {
  const rows = await prisma.accountContact.findMany({
    select: { id: true, phone: true, phoneNorm: true },
    orderBy: { id: "asc" },
    take: BATCH,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  if (rows.length === 0) break;
  cursor = rows[rows.length - 1]!.id;
  scanned += rows.length;

  for (const r of rows) {
    const want = normalizePhoneTh(r.phone) || null;
    if (want === r.phoneNorm) continue; // ตรงอยู่แล้ว → ข้าม (นี่คือหัวใจของ idempotent)
    if (!dryRun) await prisma.accountContact.update({ where: { id: r.id }, data: { phoneNorm: want } });
    if (want === null) cleared++;
    else updated++;
  }
  console.log(`  … ตรวจแล้ว ${scanned} แถว · เขียน ${updated} · ล้างเป็นว่าง ${cleared}`);
  if (rows.length < BATCH) break;
}

const remain = await prisma.accountContact.count({ where: { phoneNorm: null, NOT: { phone: null } } });
console.log(`\nสรุป: ตรวจ ${scanned} แถว · เติม/แก้ ${updated} · ตั้งเป็นว่าง ${cleared}`);
console.log(`เหลือแถวที่มีเบอร์แต่ phoneNorm ว่าง: ${remain} ${remain === 0 || dryRun ? "✅" : "⚠️ (เบอร์ที่ normalize แล้วได้ค่าว่าง เช่น มีแต่ตัวอักษร)"}`);
await prisma.$disconnect();

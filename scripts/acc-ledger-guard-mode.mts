// acc-ledger-guard-mode.mts — สลับโหมดด่านกันแก้/ลบสมุดรายวัน + AuditLog ของบัญชี (ACC T4.4 · migration 20270103100000_acc_t44_ledger_guard)
//
//   strict (ค่าเริ่มของ migration · production): ลบ/แก้ได้เฉพาะทางของระบบ (กลับรายการ · ธงตรวจ · กระทบยอด · รวมผู้ติดต่อ · ลบร้านที่ตั้ง shark.ledger_purge)
//   qc     (ฐานทดสอบเท่านั้น): ลบแถวได้ (ชุดทดสอบล้างฟิกซ์เจอร์ของตัวเองด้วย deleteMany) — ยังทดสอบโหมดเข้มได้ด้วย SET LOCAL shark.ledger_guard = 'strict'
//
// ใช้: bash scripts/iso.sh pnpm exec tsx scripts/acc-ledger-guard-mode.mts status|qc|strict
//   🔴 ผ่าน `acc-v2-env.loadQcEnv()` เท่านั้น (ด่าน prod เด็ดขาด) — โหมด qc ห้ามตั้งบน production
//   ฐาน QC ของเลนอื่น: รันคำสั่งเดียวกันด้วย env ของฐานนั้น หรือ SQL ใน ledger/wo-notes/T4.4.md §2
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
const cmd = process.argv[2] ?? "status";
if (!["status", "qc", "strict"].includes(cmd)) {
  console.error("ใช้: acc-ledger-guard-mode.mts status|qc|strict");
  process.exit(3);
}
const { prisma } = await import("@/lib/core/db");
const has = (await prisma.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'account_ledger_guard_mode'`))[0]?.n ?? 0;
if (!has) {
  console.error("🔴 ยังไม่มีฟังก์ชัน account_ledger_guard_mode — รัน acc-qc-migrate.mts deploy ก่อน");
  process.exit(2);
}
if (cmd !== "status") {
  await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION public.account_ledger_guard_mode() RETURNS text LANGUAGE sql STABLE AS $$ SELECT '${cmd}'::text $$`);
}
const mode = (await prisma.$queryRawUnsafe<{ m: string }[]>(`SELECT public.account_ledger_guard_mode() AS m`))[0]?.m;
console.log(`▶ acc-ledger-guard-mode: host = ${host.split(".")[0]} · โหมด = ${mode}`);
await prisma.$disconnect();

// acc-v2-cron-recurring.mts — ตัวห่อสำหรับ cron บน VPS (WO 1.9)
//
// ใช้:
//   pnpm tsx scripts/acc-v2-cron-recurring.mts recurring    # สร้างเอกสารประจำที่ถึงรอบ
//   pnpm tsx scripts/acc-v2-cron-recurring.mts reminders    # เตือนครบกำหนด/เช็ค/ภ.พ.30
//   pnpm tsx scripts/acc-v2-cron-recurring.mts promptpay    # ปิดลิงก์ชำระเงินที่หมดอายุ (WO 5.5)
//   pnpm tsx scripts/acc-v2-cron-recurring.mts email-reports # สรุปบัญชีรายวัน/รายสัปดาห์ทางอีเมล (WO 8.2 §9.3)
//   pnpm tsx scripts/acc-v2-cron-recurring.mts all          # ทั้งหมด (ค่าเริ่มต้น)
//
// บรรทัด crontab (เครื่อง VPS เป็น UTC · เวลาไทย = UTC+7):
//   10 23 * * * cd /root/projects/shark-in-th && pnpm tsx scripts/acc-v2-cron-recurring.mts recurring >> /var/log/shark-acc-cron.log 2>&1   # 06:10 ไทย
//   0  1  * * * cd /root/projects/shark-in-th && pnpm tsx scripts/acc-v2-cron-recurring.mts reminders  >> /var/log/shark-acc-cron.log 2>&1   # 08:00 ไทย
//   30 1  * * * cd /root/projects/shark-in-th && pnpm tsx scripts/acc-v2-cron-recurring.mts email-reports >> /var/log/shark-acc-cron.log 2>&1 # 08:30 ไทย
//
// 🔴 เรียก service ตรง ไม่ผ่าน HTTP — ไม่ต้องมี SHARK_CRON_SECRET และไม่พึ่งว่าเว็บตื่นอยู่
//    (เส้นทาง HTTP ยังมีให้ Vercel Cron ใช้: POST /api/cron/account/{recurring,reminders})
//
// 🔴 ปลอดภัยต่อการรันซ้ำ: ตัวสร้างกันซ้ำด้วย unique(ruleId, periodKey) · ตัวเตือนกันซ้ำด้วยเนื้อความ+วันไทย
//    ⇒ cron ยิงซ้อน/รันมือระหว่างวัน ก็ไม่เกิดเอกสารหรือแจ้งเตือนซ้ำ
//
// env: ใช้ `.env` ของโปรเจกต์ตามปกติ (นี่คืองาน production จริง) — ตั้ง QC_ENV_FILE=.env.qc ได้เวลาทดสอบ
process.loadEnvFile?.(process.env.QC_ENV_FILE ?? ".env");

const mode = (process.argv[2] ?? "all").replace(/^-+/, "");
if (!["recurring", "reminders", "promptpay", "email-reports", "all"].includes(mode)) {
  console.error(`❌ โหมดไม่ถูกต้อง: ${mode} — ใช้ได้: recurring | reminders | promptpay | email-reports | all`);
  process.exit(2);
}

const dbHost = (process.env.DATABASE_URL ?? "").replace(/^.*@/, "").split("/")[0] || "(ไม่พบ DATABASE_URL)";
const startedAt = new Date();
console.log(`[acc-v2-cron] เริ่ม ${startedAt.toISOString()} · โหมด ${mode} · DB ${dbHost}`);

const svc = await import("@/lib/modules/account/service");

let failed = 0;

if (mode === "recurring" || mode === "all") {
  try {
    const r = await svc.runRecurringRules(startedAt);
    console.log(
      `[acc-v2-cron] เอกสารประจำ: ถึงรอบ ${r.processed} · สร้างใหม่ ${r.created} · ออกอัตโนมัติ ${r.issued} · ` +
        `ข้าม(ซ้ำ) ${r.skipped} · ล้มเหลว ${r.failed} · หมดอายุ ${r.finished}`,
    );
  } catch (e) {
    failed += 1;
    console.error(`[acc-v2-cron] ❌ เอกสารประจำล้มทั้งรอบ: ${e instanceof Error ? (e.stack ?? e.message) : e}`);
  }
}

if (mode === "reminders" || mode === "all") {
  try {
    const r = await svc.runAccountReminders(startedAt);
    console.log(
      `[acc-v2-cron] เตือน: ระบบ ${r.systems} ร้าน · ครบกำหนดพรุ่งนี้ ${r.DUE_TOMORROW} · พ้นกำหนด ${r.OVERDUE_TODAY} · ` +
        `ใบกำกับซื้อค้าง ${r.PTX_AWAITING} · เช็ค ${r.CHEQUE_DUE} · ภ.พ.30 ${r.PP30_DUE}`,
    );
  } catch (e) {
    failed += 1;
    console.error(`[acc-v2-cron] ❌ รอบเตือนล้ม: ${e instanceof Error ? (e.stack ?? e.message) : e}`);
  }
}

// WO 5.5 — ปิดคำขอชำระเงิน (ลิงก์+QR PromptPay) ที่เลยวันหมดอายุ · ปลอดภัยต่อการรันซ้ำ
if (mode === "promptpay" || mode === "all") {
  try {
    const acc = await import("@/lib/modules/account/index");
    const r = await acc.expirePaymentRequests(startedAt);
    console.log(`[acc-v2-cron] ลิงก์ชำระเงินหมดอายุ: ปิด ${r.expired} ใบ`);
  } catch (e) {
    failed += 1;
    console.error(`[acc-v2-cron] ❌ ปิดลิงก์ชำระเงินหมดอายุล้ม: ${e instanceof Error ? (e.stack ?? e.message) : e}`);
  }
}

// WO 8.2 (§9.3) — รายงานทางอีเมล · ปลอดภัยต่อการรันซ้ำ (คีย์ต่อวัน/ต่อสัปดาห์ต่อร้าน)
if (mode === "email-reports" || mode === "all") {
  try {
    const r = await svc.runAccountEmailReports(startedAt);
    console.log(
      `[acc-v2-cron] รายงานอีเมล: ร้านที่เปิดไว้ ${r.systems} · ส่ง ${r.sent} · ข้าม(ส่งแล้ว/ไม่มีผู้รับ) ${r.skipped} · ล้มเหลว ${r.failed}`,
    );
  } catch (e) {
    failed += 1;
    console.error(`[acc-v2-cron] ❌ รายงานอีเมลล้มทั้งรอบ: ${e instanceof Error ? (e.stack ?? e.message) : e}`);
  }
}

console.log(`[acc-v2-cron] จบ ${new Date().toISOString()} (ใช้เวลา ${Date.now() - startedAt.getTime()} ms)`);
process.exit(failed === 0 ? 0 : 1);

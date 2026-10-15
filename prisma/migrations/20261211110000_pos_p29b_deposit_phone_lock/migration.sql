-- POS P2.9b fix 2 (มติ 3 · hunter N2): ตัวนับ 4 หลักท้ายของเบอร์ที่ผิดต่อมัดจำ (แบบตัวนับ PIN ของบัตรของขวัญ) — เพิ่มคอลัมน์อย่างเดียว · ค่าเดิม 0/null
SET lock_timeout = '3s';

ALTER TABLE "PosDeposit" ADD COLUMN IF NOT EXISTS "phoneFailedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PosDeposit" ADD COLUMN IF NOT EXISTS "phoneLockedUntil" TIMESTAMP(3);

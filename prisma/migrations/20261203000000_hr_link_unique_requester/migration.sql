-- HR H0.7 — ผู้ยื่นใบลา = user id · ผู้ยื่นแทน · 1 บัญชี ↔ พนักงาน 1 คนต่อร้าน · ผู้ยืนยันการผูกบัญชี
-- Prisma รันไฟล์นี้ใน transaction เดียว · เพิ่มอย่างเดียว (คอลัมน์ nullable 2 ช่อง + partial unique) ⇒ ปลอดภัยกับโค้ดเก่า
-- 🔴 ตรวจก่อน migrate (อ่านอย่างเดียว · ต้องได้ 0 แถว ไม่งั้น CREATE UNIQUE INDEX ล้มทั้งไฟล์):
--   SELECT "tenantId", "linkedUserId", count(*) FROM "HrEmployee" WHERE "linkedUserId" IS NOT NULL GROUP BY 1, 2 HAVING count(*) > 1
-- ลำดับ prod: ตรวจ → migrate → deploy โค้ด → scripts/hr-fix-approval-requester.mts (dry-run) → --apply

-- AlterTable
ALTER TABLE "HrEmployee" ADD COLUMN "linkApprovedById" TEXT;

-- AlterTable
ALTER TABLE "HrLeave" ADD COLUMN "filedById" TEXT;

-- CreateIndex (partial unique — ไม่อยู่ใน schema.prisma เพราะ Prisma ไม่รองรับ WHERE)
CREATE UNIQUE INDEX "HrEmployee_tenantId_linkedUserId_key" ON "HrEmployee" ("tenantId", "linkedUserId") WHERE "linkedUserId" IS NOT NULL;

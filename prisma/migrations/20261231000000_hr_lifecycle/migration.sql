-- HR H4.4 ▸ วงจรพนักงาน (additive) — เหตุผลการสิ้นสุดการจ้าง + ประวัติการสิ้นสุดล่าสุดบน HrEmployee · ดัชนีของตัวกวาดเตือน ·
--   บันทึก/ใบเตือน (HrReviewNote) อยู่รอดการลบพนักงาน: FK employeeId เปลี่ยนเป็น ON DELETE RESTRICT (Q9 — รายการตรวจ HrOnboardingTask คง CASCADE)
--   runbook: migrate ก่อน แล้วจึง deploy โค้ด · enum ใหม่ = CREATE TYPE ในไฟล์นี้ (ไม่มีการเพิ่มค่าให้ enum เดิม ⇒ ไม่มีไฟล์ …000001)

-- CreateEnum
CREATE TYPE "HrOffboardReason" AS ENUM ('RESIGNED', 'CONTRACT_END', 'PROBATION_FAILED', 'TERMINATED', 'OTHER');

-- AlterTable
ALTER TABLE "HrEmployee" ADD COLUMN     "offboardedAt" TIMESTAMP(3),
ADD COLUMN     "offboardReason" "HrOffboardReason",
ADD COLUMN     "offboardNote" TEXT,
ADD COLUMN     "offboardedById" TEXT;

-- หมายเหตุการสิ้นสุดการจ้าง ≤ 500 ตัวอักษร (ด่านสุดท้ายในฐาน — แอปตรวจก่อนด้วยข้อความไทย)
ALTER TABLE "HrEmployee" ADD CONSTRAINT "HrEmployee_offboardNote_len_check" CHECK ("offboardNote" IS NULL OR char_length("offboardNote") <= 500);

-- CreateIndex
CREATE INDEX "HrEmployee_systemId_probationEndAt_idx" ON "HrEmployee"("systemId", "probationEndAt");

-- CreateIndex
CREATE INDEX "HrEmployee_systemId_contractEndAt_idx" ON "HrEmployee"("systemId", "contractEndAt");

-- Retention: บันทึก/ใบเตือนต้องไม่หายตามแถวพนักงาน
ALTER TABLE "HrReviewNote" DROP CONSTRAINT "HrReviewNote_employeeId_fkey";
ALTER TABLE "HrReviewNote" ADD CONSTRAINT "HrReviewNote_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

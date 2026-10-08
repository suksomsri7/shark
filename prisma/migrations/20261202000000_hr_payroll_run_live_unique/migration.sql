-- HR H0.6 — รอบจ่ายที่กลับรายการแล้ว (REVERSED) ไม่จองงวด: unique เต็ม (systemId, periodKey) → partial unique เฉพาะรอบที่ยังมีผล
-- + เวลา/ผู้กลับรายการ (nullable · เพิ่มอย่างเดียว)
-- Prisma รันไฟล์นี้ใน transaction เดียว ⇒ ไม่มีช่วงที่ตารางไม่มี unique (DROP + CREATE อยู่ใน tx เดียวกัน)
-- ลำดับ prod: deploy โค้ดก่อน (โค้ดถูกทั้งใต้ index เก่าและใหม่) แล้วค่อย migrate — ดู ledger/wo-notes/hr-H0.6.md (Builder)

-- AlterTable
ALTER TABLE "HrPayrollRun" ADD COLUMN "reversedAt" TIMESTAMP(3);
ALTER TABLE "HrPayrollRun" ADD COLUMN "reversedById" TEXT;

-- DropIndex
DROP INDEX "HrPayrollRun_systemId_periodKey_key";

-- CreateIndex (partial unique — ไม่อยู่ใน schema.prisma เพราะ Prisma ไม่รองรับ WHERE)
CREATE UNIQUE INDEX "HrPayrollRun_systemId_periodKey_live_key" ON "HrPayrollRun"("systemId", "periodKey") WHERE "status" <> 'REVERSED';

-- CreateIndex
CREATE INDEX "HrPayrollRun_systemId_periodKey_idx" ON "HrPayrollRun"("systemId", "periodKey");

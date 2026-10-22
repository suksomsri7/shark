-- HR H0.6 — รอบจ่ายที่กลับรายการแล้ว (REVERSED) ไม่จองงวด: unique เต็ม (systemId, periodKey) → partial unique เฉพาะรอบที่ยังมีผล
-- + เวลา/ผู้กลับรายการ (nullable · เพิ่มอย่างเดียว)
-- Prisma รันไฟล์นี้ใน transaction เดียว ⇒ ไม่มีช่วงที่ตารางไม่มี unique (DROP + CREATE อยู่ใน tx เดียวกัน)
-- ลำดับ prod: migrate ก่อน แล้วค่อยโค้ด (build prod ของ Vercel รัน `migrate deploy` ก่อน `next build` อยู่แล้ว) — โค้ดใหม่อ่าน/เขียน reversedAt/reversedById
--   ถ้าโค้ดขึ้นก่อน = หน้าเงินเดือน 500 + กลับรายการล้มทุกครั้ง · ไฟล์นี้ปลอดภัยกับโค้ดเก่า (เพิ่มคอลัมน์ nullable · โค้ดเก่าไม่สร้างรอบซ้ำงวด) · รันนอกวันจ่ายเงินเดือน
--   ตรวจก่อน (อ่านอย่างเดียว): รอบ REVERSED เก่าที่ยังผูกรายการอยู่ — มีแถว = เจ้าของตัดสิน (ปลด + ยิง event ย้อนหลัง หรือจดไว้) — ดู ledger/wo-notes/hr-H0.6.md
--   SELECT r."id", r."periodKey", count(a."id") FROM "HrPayrollRun" r JOIN "HrPayAdjustment" a ON a."runId"=r."id" WHERE r."status"='REVERSED' GROUP BY 1,2;

-- AlterTable
ALTER TABLE "HrPayrollRun" ADD COLUMN "reversedAt" TIMESTAMP(3);
ALTER TABLE "HrPayrollRun" ADD COLUMN "reversedById" TEXT;

-- DropIndex
DROP INDEX "HrPayrollRun_systemId_periodKey_key";

-- CreateIndex (partial unique — ไม่อยู่ใน schema.prisma เพราะ Prisma ไม่รองรับ WHERE)
CREATE UNIQUE INDEX "HrPayrollRun_systemId_periodKey_live_key" ON "HrPayrollRun"("systemId", "periodKey") WHERE "status" <> 'REVERSED';

-- CreateIndex
CREATE INDEX "HrPayrollRun_systemId_periodKey_idx" ON "HrPayrollRun"("systemId", "periodKey");

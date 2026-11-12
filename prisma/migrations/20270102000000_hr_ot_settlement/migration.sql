-- HR H2.9 ▸ การจ่าย OT จากคำขอที่อนุมัติ (additive · nullable ล้วน ยกเว้น settleGen ที่มีค่าปริยาย 0) — ตาราง HrOtRequest เท่านั้น
--   paidMinutes/amountSatang/segmentsJson = ผลการจ่ายล่าสุด (นาทีที่จ่าย · สตางค์ · ส่วนตามอัตรา) · basisJson = ฐานค่าจ้าง+กฎหมาย ณ การจ่ายครั้งแรก (ตรึง) ·
--   attendanceDayId/Version = แถวผลการลงเวลาที่ใช้คิด (เปลี่ยนรุ่น ⇒ คิดใหม่ด้วยรายการส่วนต่าง) · lawRowId = แถวกฎหมาย OT (null = ค่าตั้งต้น) ·
--   settleGen = เลขรุ่นของรายการปรับเงินล่าสุด (sourceRef "<id>:<gen>") · settleCode = เหตุที่ยังจ่ายไม่ได้ · revoked* = ยกเลิก OT ที่อนุมัติแล้ว
--   runbook: migrate ก่อน แล้วจึง deploy โค้ด · ไม่มี backfill (แถวเดิมยังไม่มีผู้เขียน — H1.2 ไม่มีตัวเขียน)
--   ตรวจก่อน migrate (นอกไฟล์นี้): SELECT count(*) FROM "HrOtRequest" WHERE "minutes" NOT BETWEEN 1 AND 960 OR "endAt" <= "startAt"; -- ต้องได้ 0

-- AlterTable
ALTER TABLE "HrOtRequest" ADD COLUMN     "paidMinutes" INTEGER,
ADD COLUMN     "amountSatang" INTEGER,
ADD COLUMN     "segmentsJson" JSONB,
ADD COLUMN     "basisJson" JSONB,
ADD COLUMN     "attendanceDayId" TEXT,
ADD COLUMN     "attendanceDayVersion" INTEGER,
ADD COLUMN     "lawRowId" TEXT,
ADD COLUMN     "settleGen" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "settleCode" TEXT,
ADD COLUMN     "settledAt" TIMESTAMP(3),
ADD COLUMN     "revokedAt" TIMESTAMP(3),
ADD COLUMN     "revokedById" TEXT,
ADD COLUMN     "revokeReason" TEXT;

-- ด่านสุดท้ายในฐาน (แอปตรวจก่อนด้วยข้อความไทย)
ALTER TABLE "HrOtRequest" ADD CONSTRAINT "HrOtRequest_minutes_check" CHECK ("minutes" BETWEEN 1 AND 960);
ALTER TABLE "HrOtRequest" ADD CONSTRAINT "HrOtRequest_range_check" CHECK ("endAt" > "startAt");
ALTER TABLE "HrOtRequest" ADD CONSTRAINT "HrOtRequest_paidMinutes_check" CHECK ("paidMinutes" IS NULL OR ("paidMinutes" BETWEEN 0 AND "minutes"));
ALTER TABLE "HrOtRequest" ADD CONSTRAINT "HrOtRequest_amountSatang_check" CHECK ("amountSatang" IS NULL OR "amountSatang" >= 0);
ALTER TABLE "HrOtRequest" ADD CONSTRAINT "HrOtRequest_settleGen_check" CHECK ("settleGen" >= 0);

-- CreateIndex (ตัวจ่ายรายชั่วโมงหาคำขอที่อนุมัติแล้วตามวัน)
CREATE INDEX "HrOtRequest_systemId_status_date_idx" ON "HrOtRequest"("systemId", "status", "date");

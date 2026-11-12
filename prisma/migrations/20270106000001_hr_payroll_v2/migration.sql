-- HR H3.4 ▸ เครื่องคิดเงินเดือนรุ่น 2: คอลัมน์ใหม่ที่ว่างได้ทั้งหมด (additive ล้วน · ไม่ backfill · โค้ดเดิมไม่อ่าน)
--   HrPayrollRun.stepsJson = ขั้นยืนยันชั่วโมงทำงานของสาขา (ไม่บังคับ) · inputDigest = ลายนิ้วมือข้อมูลตอนสร้าง/สร้างใหม่ (อนุมัติเทียบ)
--   HrPayAdjustment.consentAt/consentById = มีหนังสือยินยอมให้หักของลูกจ้าง (ม.77) — เก็บแค่ว่ามี ไม่เก็บไฟล์

-- AlterTable
ALTER TABLE "HrPayrollRun" ADD COLUMN "stepsJson" JSONB,
ADD COLUMN "inputDigest" TEXT;

-- AlterTable
ALTER TABLE "HrPayAdjustment" ADD COLUMN "consentAt" TIMESTAMP(3),
ADD COLUMN "consentById" TEXT;

-- HR H2.6 r2 ▸ (1) ลบดัชนีซ้ำ: HrTimeCorrection_pending_target_key ("attendanceId" WHERE PENDING) = นิยามเดียวกับ
--   HrTimeCorrection_attendanceId_pending_key ของ H1.2 (20261205000000) ซึ่งยังอยู่และบังคับ "ใบรอ 1 ใบต่อแถวการลงเวลา" เหมือนเดิม ·
--   (2) selfApplied = เจ้าของร้านแก้แถวของตัวเอง (มติ Q4) · voidedByCorrectionId/correctionId ไม่มีคำสั่งค้นตามคอลัมน์ ⇒ ไม่เพิ่มดัชนี ◂
DROP INDEX IF EXISTS "HrTimeCorrection_pending_target_key";

-- AlterTable
ALTER TABLE "HrTimeCorrection" ADD COLUMN     "selfApplied" BOOLEAN NOT NULL DEFAULT false;

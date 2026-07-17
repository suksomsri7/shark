-- WO Wave2-K: Payroll reversal — กลับรายการเงินเดือนที่อนุมัติ/จ่ายแล้ว (APPROVED/PAID → REVERSED)
-- AlterEnum: เพิ่มสถานะ REVERSED (immutable ledger — กลับ JV ด้วย reversal เท่านั้น ห้ามลบ/แก้ entry เดิม)
ALTER TYPE "PayrollRunStatus" ADD VALUE IF NOT EXISTS 'REVERSED';

-- WO Wave2-H: กันจองซ้อน (row-lock ใน service) + idempotency ข้าม request
-- เพิ่ม idempotencyKey ให้ Appointment + unique(tenantId, idempotencyKey)
-- Postgres: หลายแถวที่ idempotencyKey = NULL ไม่ชน unique (จองแบบไม่ผูก key ได้ตามเดิม)

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_tenantId_idempotencyKey_key" ON "Appointment"("tenantId", "idempotencyKey");

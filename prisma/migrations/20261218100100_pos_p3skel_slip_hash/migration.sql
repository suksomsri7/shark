-- POS P3-SKEL fix1 H3: ลายนิ้วมือไฟล์สลิป (sha256 hex) — รูปเดิมแนบซ้ำในร้าน = SLIP_DUPLICATE · เพิ่มคอลัมน์ null + unique ในตารางใหม่ของใบนี้เท่านั้น (ไม่แตะตารางเดิม)
SET lock_timeout = '5s';

ALTER TABLE "PosPaymentSlip" ADD COLUMN "sha256" TEXT;

CREATE UNIQUE INDEX "PosPaymentSlip_tenantId_sha256_key" ON "PosPaymentSlip"("tenantId", "sha256");

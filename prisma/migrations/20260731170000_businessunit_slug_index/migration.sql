-- index สำหรับ resolve หน้าร้านสาธารณะด้วยคิวรีเดียว (slug ของสาขา + status)
-- additive ล้วน ปลอดภัยบน prod · CONCURRENTLY ไม่ได้เพราะ prisma migrate ห่อ transaction
CREATE INDEX IF NOT EXISTS "BusinessUnit_slug_status_idx" ON "BusinessUnit"("slug", "status");

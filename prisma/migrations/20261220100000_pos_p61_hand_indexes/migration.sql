-- POS P6.1 CD-P61-P4 (schema parity) — index มือ 14 ตัวของ runbook §5 ประกาศเป็น @@index ใน prisma/schema แล้ว ⇒ migration นี้ทำให้ฐานตรง schema
-- 🔴 ไม่มีอะไรใหม่ถ้าเจ้าของสร้างด้วย CREATE INDEX CONCURRENTLY ไปก่อนแล้ว (IF NOT EXISTS = no-op · ชื่อ = ชื่อปริยายของ prisma)
-- 🔴 ไม่มี DO $$ ⇒ Prisma 7.8 ส่งทีละคำสั่ง (stmt) · ทุกคำสั่งรันซ้ำได้ · ไม่ CONCURRENTLY (migrate รันใน transaction ต่อคำสั่ง — CONCURRENTLY ใช้ไม่ได้)
--    ⇒ ตารางใหญ่ (> 100k แถว · runbook §3.2 ตารางกลยุทธ์) = เจ้าของ `migrate resolve --applied` ไฟล์นี้ก่อน deploy แล้วสร้างมือ CONCURRENTLY ตาม §5
-- 🔴 one_open_session_per_table (partial unique · ต้องนับโต๊ะซ้ำก่อน) ไม่อยู่ที่นี่ — คงเป็นขั้นมือ §5 เท่านั้น (prisma ประกาศ partial index ไม่ได้ · migrate diff ไม่รายงาน)
SET lock_timeout = '5s';

CREATE INDEX IF NOT EXISTS "ShopProduct_posProductId_idx" ON "ShopProduct"("posProductId");
CREATE INDEX IF NOT EXISTS "ShopOrderLine_posProductId_idx" ON "ShopOrderLine"("posProductId");
CREATE INDEX IF NOT EXISTS "PosSaleLine_productId_idx" ON "PosSaleLine"("productId");
CREATE INDEX IF NOT EXISTS "MenuItem_posProductId_idx" ON "MenuItem"("posProductId");
CREATE INDEX IF NOT EXISTS "RestaurantOrderItem_productId_idx" ON "RestaurantOrderItem"("productId");
CREATE INDEX IF NOT EXISTS "InvItem_tenantId_barcode_idx" ON "InvItem"("tenantId", "barcode");
CREATE INDEX IF NOT EXISTS "PosSale_shiftId_idx" ON "PosSale"("shiftId");
CREATE INDEX IF NOT EXISTS "PosSale_refSaleId_idx" ON "PosSale"("refSaleId");
CREATE INDEX IF NOT EXISTS "PosSale_channelId_idx" ON "PosSale"("channelId");
CREATE INDEX IF NOT EXISTS "PosSaleLine_refLineId_idx" ON "PosSaleLine"("refLineId");
CREATE INDEX IF NOT EXISTS "PosSale_customerPartyId_idx" ON "PosSale"("customerPartyId");
CREATE INDEX IF NOT EXISTS "PosSale_crmDealId_idx" ON "PosSale"("crmDealId");
CREATE INDEX IF NOT EXISTS "PosOrderLine_orderId_idx" ON "PosOrderLine"("orderId");
CREATE INDEX IF NOT EXISTS "PosOrderEvent_orderId_idx" ON "PosOrderEvent"("orderId");

RESET lock_timeout;

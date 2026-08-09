-- ธุรกิจที่มีทั้งสินค้าและบริการ (9 ส.ค. 2026)
-- 1) bookable: แยก "บริการที่จองล่วงหน้าได้" ออกจาก "รายการบริการที่ขายหน้าร้านอย่างเดียว"
--    ค่าเริ่มต้น true = ของเดิมทุกแถวเป็นบริการที่จองได้ (พฤติกรรมเดิมไม่เปลี่ยน)
-- 2) serviceId บน PosSaleLine: แยกยอดสินค้า/บริการในรายงานได้จริง
--    (เดิม itemId=null แยกไม่ออกว่าเป็นบริการหรือรายการที่พนักงานพิมพ์เอง)
-- additive ล้วน ปลอดภัยบน prod
ALTER TABLE "BookingService" ADD COLUMN "bookable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PosSaleLine" ADD COLUMN "serviceId" TEXT;

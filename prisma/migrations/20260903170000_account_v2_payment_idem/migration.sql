-- WO 1.4 — รับชำระ/บันทึกจ่ายหลายครั้ง (DESIGN-SPEC-V2 §5.2 F)
--
-- 🔴 additive ล้วน: ADD COLUMN ที่เป็น NULL ได้ + unique index แบบ NULL ซ้ำได้
--    (Postgres ถือ NULL ไม่ชนกันใน UNIQUE) ⇒ ทุกแถวเดิมได้ NULL = ไม่มีการคุมซ้ำ = พฤติกรรมเดิมเป๊ะ
--
-- ทำไมต้องมี: ฟอร์ม "รับชำระเงิน" ส่งการชำระหลายครั้งพร้อมกัน 1 คำสั่ง ถ้าเน็ตสะดุด/กดซ้ำ
-- แล้วยิงซ้ำ ระบบจะสร้าง payment + JV ซ้ำทันที (เงินเข้าบัญชี 2 เท่า) — คีย์นี้ทำให้ครั้งที่ 2 เป็น no-op
ALTER TABLE "AccountDocumentPayment" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "AccountDocumentPayment_idempotencyKey_key" ON "AccountDocumentPayment"("idempotencyKey");

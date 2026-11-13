-- ACC T2.3 — รหัสเหตุผลของใบลด/เพิ่มหนี้ (ขาย/ซื้อ) · additive · null = ใบก่อน T2.3
ALTER TABLE "AccountDocument" ADD COLUMN "adjustReasonCode" TEXT;

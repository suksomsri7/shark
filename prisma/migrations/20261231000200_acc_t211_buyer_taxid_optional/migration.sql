-- ACC T2.11 — ใบกำกับเต็มรูปจาก POS/โรงแรม: เลขผู้เสียภาษีของผู้ซื้อว่างได้ (ประกาศ VAT ฉ.39 ข้อ 7 บังคับเฉพาะผู้ซื้อที่จด VAT)
-- เพิ่มล้วน: ผ่อน NOT NULL — แถวเดิมไม่เปลี่ยน · โค้ดเดิมที่เขียนเลขเสมอยังทำงานเหมือนเดิม
ALTER TABLE "PosTaxInvoiceRequest" ALTER COLUMN "taxId" DROP NOT NULL;
ALTER TABLE "PosBuyerProfile" ALTER COLUMN "taxId" DROP NOT NULL;

-- ใบแจ้งหนี้ 1 ใบ มีใบกำกับภาษี "ที่ไม่ใช่ของงวดรับเงิน" (ไม่มี sourcePaymentId) ที่ยังมีผลได้ 1 ใบเท่านั้น
-- ดัชนีนี้มีอยู่ในฐานข้อมูลมาก่อน (อย่างช้า ก.ย. 2026 · ledger/wo-notes/0.3.md) แต่ไม่เคยอยู่ใน migrations
-- เจ้าของตัดสิน 13 พ.ย. 2026: เก็บไว้ + นำเข้ารีโปให้ถูกต้อง (ledger/wo-notes/T1.2.md)
-- IF NOT EXISTS: ฐานที่มีอยู่แล้วไม่ถูกแตะ · ฐานใหม่ได้ดัชนีเดียวกันเป๊ะ (นิยามคัดจาก pg_indexes ของฐาน QC)
-- Prisma schema เขียน partial index ไม่ได้ และ `prisma migrate diff` มองไม่เห็น partial index ⇒ ไม่เกิด drift
CREATE UNIQUE INDEX IF NOT EXISTS "AccountDocument_taxinvoice_source_uniq" ON public."AccountDocument" USING btree ("systemId", "sourceDocId") WHERE (("docType" = 'TAX_INVOICE'::"AccountDocType") AND ("sourcePaymentId" IS NULL) AND (status <> ALL (ARRAY['VOIDED'::"AccountDocStatus", 'CANCELLED'::"AccountDocStatus"])));

-- POS P1.12 — สมาชิกที่ตะกร้า + สิทธิ์ที่จอชำระ · CD9: เพิ่ม 2 คอลัมน์ nullable บน PosSale อย่างเดียว (บิลเดิม = null)
-- สร้างจาก prisma migrate diff --from-schema <schema ก่อน P1.12> --to-schema prisma/schema --script (ไม่ได้ diff จากฐาน)
ALTER TABLE "PosSale" ADD COLUMN "memberSnapshot" JSONB;
ALTER TABLE "PosSale" ADD COLUMN "memberBenefits" JSONB;

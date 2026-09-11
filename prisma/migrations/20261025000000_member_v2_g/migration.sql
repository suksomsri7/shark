-- M3.1 — กลุ่มลูกค้า (segment) ของระบบสมาชิก v2
-- additive ล้วน: ตารางใหม่ 1 ตัว + ข้อบังคับความสัมพันธ์ที่ "ควรมีตั้งแต่แรก" 5 เส้น
-- (ไม่มี DROP · ไม่เปลี่ยนชนิดข้อมูล · ไม่แตะคอลัมน์เดิม)
--
-- ทำไมต้องผูก FK เพิ่ม: เอนจิน segment ถามคำถามเดียวข้ามตาราง เช่น
--   "สมาชิกในระบบนี้ ที่ระดับ Gold และ ยินยอมรับข่าวทาง LINE และ ระดับใบรับรอง Advanced มีกี่คน"
-- ถ้าไม่มีความสัมพันธ์จริง ต้องอ่าน customerId ออกมาก่อนแล้วยิงซ้ำทีละตาราง (ช้าและเพี้ยนง่าย)
-- ผลพลอยได้ที่สำคัญกว่า: ลบสมาชิกตาม PDPA แล้ว ค่าฟิลด์/ความยินยอม/ยอดแต้ม/voucher ของคนนั้นหายตามจริง
-- ไม่ค้างเป็นข้อมูลส่วนบุคคลที่ไม่มีเจ้าของ (เดิมต้องไล่ลบเองทีละตาราง)

-- CreateTable
CREATE TABLE "MemberSegment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "definition" JSONB NOT NULL DEFAULT '{}',
    "lastCount" INTEGER,
    "lastCountAt" TIMESTAMP(3),
    "ownerUserId" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'TEAM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberSegment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemberSegment_tenantId_idx" ON "MemberSegment"("tenantId");

-- CreateIndex
CREATE INDEX "MemberSegment_systemId_idx" ON "MemberSegment"("systemId");

-- 🔴 เก็บกวาดแถวกำพร้าก่อนผูก FK (แบบเดียวกับ `member_v2_f2_identity_fk` ของ M2.9)
--    แถวที่ชี้ไปยังสมาชิก/ฟิลด์ที่ถูกลบไปแล้ว = ข้อมูลที่ไม่มีใครอ่านได้อีก (หน้าจอ/รายงานทุกที่
--    join กลับ Customer เสมอ) ไม่ใช่ข้อมูลที่ยังใช้งานอยู่ — ปล่อยไว้ = migration ล้มทั้งก้อน
DELETE FROM "MemberFieldValue" v WHERE NOT EXISTS (SELECT 1 FROM "Customer" c WHERE c.id = v."customerId");
DELETE FROM "MemberFieldValue" v WHERE NOT EXISTS (SELECT 1 FROM "MemberField" f WHERE f.id = v."fieldId");
DELETE FROM "MemberConsent" v WHERE NOT EXISTS (SELECT 1 FROM "Customer" c WHERE c.id = v."customerId");
DELETE FROM "PointBalance" v WHERE NOT EXISTS (SELECT 1 FROM "Customer" c WHERE c.id = v."customerId");
DELETE FROM "Voucher" v WHERE NOT EXISTS (SELECT 1 FROM "Customer" c WHERE c.id = v."customerId");

-- AddForeignKey
ALTER TABLE "MemberFieldValue" ADD CONSTRAINT "MemberFieldValue_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberFieldValue" ADD CONSTRAINT "MemberFieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "MemberField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberConsent" ADD CONSTRAINT "MemberConsent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointBalance" ADD CONSTRAINT "PointBalance_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

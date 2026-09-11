-- M2.9 (ต่อจาก member_v2_f2) — ผูก relation จริง MemberChannelIdentity → Customer
-- เหตุ: หน้าลูกค้า `/m/*` + LINE login ต้องถามในคำสั่งเดียวว่า "id ช่องทางนี้เป็นของสมาชิกในระบบสมาชิกไหน"
--       และเมื่อสมาชิกถูกลบ (PDPA) id ช่องทางต้องหายตามทันที ไม่ค้างเป็นกุญแจเข้าบัญชีที่ไม่มีเจ้าของ
-- additive: เพิ่มข้อบังคับความสัมพันธ์อย่างเดียว (ไม่แตะคอลัมน์/ชนิดข้อมูล)

-- แถวที่ชี้ไปยังสมาชิกที่ไม่มีอยู่แล้ว = ขยะที่ใช้งานไม่ได้ (เข้าสู่ระบบด้วย id นี้ก็ไม่เจอใคร)
-- ต้องเก็บกวาดก่อน ไม่งั้นการเพิ่มข้อบังคับจะล้มทั้ง migration
DELETE FROM "MemberChannelIdentity" i
WHERE NOT EXISTS (SELECT 1 FROM "Customer" c WHERE c.id = i."customerId");

-- AddForeignKey
ALTER TABLE "MemberChannelIdentity" ADD CONSTRAINT "MemberChannelIdentity_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

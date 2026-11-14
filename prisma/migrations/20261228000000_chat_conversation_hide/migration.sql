-- ลบแชทออกจากรายการ (ปัดซ้ายในแอป · 14 พ.ย. 2026) — migration `chat_conversation_hide` (additive ล้วน · 2 คอลัมน์ nullable · ไม่ลบข้อมูล)
-- ที่มา: `prisma migrate diff --from-schema <prisma/schema @cbc23c5bc> --to-schema prisma/schema --script` (schema→schema · ไม่แตะฐาน)
-- AlterTable
ALTER TABLE "ChatConversation" ADD COLUMN     "hiddenAt" TIMESTAMP(3),
ADD COLUMN     "hiddenByUserId" TEXT;

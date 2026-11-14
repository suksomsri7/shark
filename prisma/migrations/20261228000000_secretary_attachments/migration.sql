-- เลขา AI — migration `secretary_attachments` (additive ล้วน · 14 พ.ย. 2026 · ไฟล์แนบของข้อความในห้องเลขา)
-- AiMessage.attachments = JSON [{fileId,name,mimeType,size,kind}] (null = ไม่มีไฟล์แนบ · แถวเดิมไม่ถูกแตะ)
-- AlterTable
ALTER TABLE "AiMessage" ADD COLUMN     "attachments" JSONB;

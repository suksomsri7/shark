-- WO-C1 · SHARK Chat Platform v1 (ledger/PLAN-CHAT-PLATFORM.md §4 M1–M6)
-- additive ล้วน: ADD COLUMN แบบ NULL หรือมี DEFAULT + CREATE TABLE + CREATE INDEX
-- ไม่มี DROP / ALTER TYPE / NOT NULL บนคอลัมน์เดิม → ข้อมูลเดิมไม่กระทบแม้แต่แถวเดียว

-- M1 · ChatChannelConnection: widget key + origin allowlist
ALTER TABLE "ChatChannelConnection"
  ADD COLUMN "originAllowlist" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "publicKeyHash" TEXT,
  ADD COLUMN "publicKeyPrefix" TEXT;

CREATE UNIQUE INDEX "ChatChannelConnection_publicKeyHash_key" ON "ChatChannelConnection"("publicKeyHash");

-- M2 · ChatContact: ภาษา + ตัวตนที่ยืนยันแล้ว + id ฝั่งระบบต้นทาง
ALTER TABLE "ChatContact"
  ADD COLUMN "lang" TEXT,
  ADD COLUMN "externalRef" TEXT,
  ADD COLUMN "verifiedEmail" BOOLEAN NOT NULL DEFAULT false;

-- M3 · ChatConversation: เก็บ context (pageUrl/country/userAgent/…)
ALTER TABLE "ChatConversation" ADD COLUMN "meta" JSONB;

-- M4 · ChatMessage: ชื่อผู้ส่งที่ลูกค้าเห็น
ALTER TABLE "ChatMessage" ADD COLUMN "senderName" TEXT;

-- M5 · ChatSetting: ชื่อเล่นผู้ส่ง + ธีม widget
--      (greetingMessage/offlineMessage ยังเป็น JSONB เดิม — เปลี่ยนแค่ "ความหมาย" เป็น map ภาษาเปิด ไม่ต้องแตะคอลัมน์)
ALTER TABLE "ChatSetting"
  ADD COLUMN "senderAlias" TEXT,
  ADD COLUMN "theme" JSONB NOT NULL DEFAULT '{}';

-- M6 · ChatRateBucket: ย้าย rate limit ออกจาก memory (ลอกแนวคิดจาก siamdive2 RateLimitBucket)
CREATE TABLE "ChatRateBucket" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChatRateBucket_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChatRateBucket_key_key" ON "ChatRateBucket"("key");
CREATE INDEX "ChatRateBucket_windowStart_idx" ON "ChatRateBucket"("windowStart");

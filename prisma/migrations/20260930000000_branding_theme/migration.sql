-- B1 — ธีมกิจการ (ตราสินค้า/สี/โทนแถบเมนู) + "แจ้งปัญหาการใช้งาน"
-- สัญญา: ledger/BRANDING-RUN.md §สัญญา B1 · แบบ: ledger/DESIGN-BRANDING.md §6, §7b
--
-- 🔴 เพิ่มอย่างเดียว (additive): ไม่แตะคอลัมน์/ตารางเดิม ไม่เปลี่ยนชนิดข้อมูล
--    คอลัมน์ใหม่บนตารางเดิมเป็น nullable หรือ NOT NULL + DEFAULT คงที่
--    (PostgreSQL 11+ เพิ่มคอลัมน์ที่มี DEFAULT คงที่โดยไม่ rewrite ตาราง ⇒ ไม่ล็อกยาวบน prod)
-- 🔴 รันซ้ำได้ (idempotent): QC รันมือ · prod รันตอน Vercel build

-- enum ใหม่ (CREATE TYPE ไม่มี IF NOT EXISTS → ห่อด้วย DO block)
DO $$ BEGIN
  CREATE TYPE "NavTone" AS ENUM ('LIGHT', 'BRAND', 'DARK');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "IssueKind" AS ENUM ('BUG', 'DISPLAY', 'IDEA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'ACK', 'DONE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- TenantBranding: 5 คอลัมน์ใหม่
ALTER TABLE "TenantBranding" ADD COLUMN IF NOT EXISTS "brandFg" TEXT;
ALTER TABLE "TenantBranding" ADD COLUMN IF NOT EXISTS "navTone" "NavTone" NOT NULL DEFAULT 'LIGHT';
ALTER TABLE "TenantBranding" ADD COLUMN IF NOT EXISTS "applyStorefront" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "TenantBranding" ADD COLUMN IF NOT EXISTS "applyMobile" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "TenantBranding" ADD COLUMN IF NOT EXISTS "updatedById" TEXT;

-- IssueReport: ตารางใหม่ (tenant axis — ลงทะเบียนใน src/lib/core/scope.ts แล้ว)
CREATE TABLE IF NOT EXISTS "IssueReport" (
  "id"            TEXT NOT NULL,
  "tenantId"      TEXT NOT NULL,
  "userId"        TEXT,
  "kind"          "IssueKind" NOT NULL,
  "message"       TEXT NOT NULL,
  "pageUrl"       TEXT NOT NULL,
  "userAgent"     TEXT NOT NULL,
  "appVersion"    TEXT,
  "screenshotUrl" TEXT,
  "status"        "IssueStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IssueReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IssueReport_tenantId_status_idx" ON "IssueReport"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "IssueReport_tenantId_createdAt_idx" ON "IssueReport"("tenantId", "createdAt");

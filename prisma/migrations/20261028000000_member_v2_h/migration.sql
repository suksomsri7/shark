-- member_v2_h — รีวิวลูกค้า (M3.4 · ระบบสมาชิก v2 · พิมพ์เขียว §4.2 §4.3 §5.10 §11.7 · D5)
-- additive ทั้งใบ: สร้าง enum 1 · ตาราง 1 (+ index/unique) · FK ไป Customer · เพิ่มค่า enum ของบอร์ดงาน 1
-- ไม่มี DROP/RENAME/DELETE/UPDATE · ไม่แตะแถวเดิมของตารางใด
-- เขียนมือ (ห้าม migrate dev — worktree มีสคีมาของใบอื่นแก้ค้างอยู่ในโหมดขนาน)

-- AlterEnum (บอร์ดงาน) — การ์ดที่เกิดจากรีวิว ≤ N ดาว
ALTER TYPE "KanbanCardSourceType" ADD VALUE IF NOT EXISTS 'REVIEW';

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('REQUESTED', 'NEW', 'REPLIED', 'ESCALATED', 'HIDDEN');

-- CreateTable
CREATE TABLE "MemberReview" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "unitId" TEXT,
    "refType" TEXT,
    "refId" TEXT,
    "serviceId" TEXT,
    "staffEmployeeId" TEXT,
    "rating" INTEGER NOT NULL DEFAULT 0,
    "body" TEXT,
    "photoFileIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ReviewStatus" NOT NULL DEFAULT 'REQUESTED',
    "replyBody" TEXT,
    "repliedById" TEXT,
    "repliedAt" TIMESTAMP(3),
    "kanbanCardId" TEXT,
    "requestSentAt" TIMESTAMP(3),
    "requestTokenHash" TEXT,
    "submittedAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "hiddenReason" TEXT,
    "source" "MemberConsentSource" NOT NULL DEFAULT 'LIFF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex — 1 รีวิวต่อรายการอ้างอิง (refType/refId เป็น NULL = รีวิวที่ไม่ผูกรายการ ไม่ชนกันเอง)
CREATE UNIQUE INDEX "MemberReview_tenantId_refType_refId_key" ON "MemberReview"("tenantId", "refType", "refId");

-- CreateIndex — ค้นลิงก์ LIFF ด้วย hash ของ token (ล้างเป็น NULL หลังส่ง = ใช้ได้ครั้งเดียว)
CREATE UNIQUE INDEX "MemberReview_requestTokenHash_key" ON "MemberReview"("requestTokenHash");

-- CreateIndex
CREATE INDEX "MemberReview_systemId_createdAt_idx" ON "MemberReview"("systemId", "createdAt");

-- CreateIndex
CREATE INDEX "MemberReview_customerId_idx" ON "MemberReview"("customerId");

-- CreateIndex
CREATE INDEX "MemberReview_systemId_rating_idx" ON "MemberReview"("systemId", "rating");

-- CreateIndex
CREATE INDEX "MemberReview_systemId_status_idx" ON "MemberReview"("systemId", "status");

-- AddForeignKey — ลบสมาชิก (PDPA) = รีวิวหายตาม
ALTER TABLE "MemberReview" ADD CONSTRAINT "MemberReview_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

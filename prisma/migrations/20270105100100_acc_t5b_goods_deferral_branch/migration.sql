-- ACC T5.9 · T5.10 · T5.11 (เลน 1): additive ล้วน — คอลัมน์ว่างได้ + ตารางใหม่ · design notes ledger/wo-notes/T5.9.md T5.10.md T5.11.md

-- T5.9 (H6) waste log: พยาน / การตรวจสภาพของใบเบิก (รูป = ไฟล์แนบของเอกสารเดิม)
ALTER TABLE "AccountDocument" ADD COLUMN "stockEvidence" JSONB;
-- T5.10 (J11) ใครออกส่วนลด (SHOP | PLATFORM | SHARED) — ข้อมูลประกอบ ไม่เปลี่ยนฐานภาษีเอง [U]
ALTER TABLE "AccountDocument" ADD COLUMN "discountFundedBy" TEXT;
-- T5.11 (A7) สถานประกอบการที่ออกเอกสาร (รหัส 5 หลัก · NULL = สำนักงานใหญ่ 00000)
ALTER TABLE "AccountDocument" ADD COLUMN "branchCode" TEXT;
CREATE INDEX "AccountDocument_systemId_branchCode_idx" ON "AccountDocument"("systemId", "branchCode");
-- T5.10 (I5) ชนิดเงินประกันต่อรายการสินค้า/บริการ (NONE | REAL_ESTATE | SERVICE_VAT | HOTEL_DAMAGE)
ALTER TABLE "AccountProduct" ADD COLUMN "depositKind" TEXT;

-- T5.10 (I12) รายได้รับล่วงหน้าทยอยรับรู้
CREATE TABLE "AccountDeferral" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "documentId" TEXT,
    "description" TEXT NOT NULL,
    "totalSatang" INTEGER NOT NULL,
    "startMonth" TEXT NOT NULL,
    "months" INTEGER NOT NULL,
    "incomeAccountId" TEXT NOT NULL,
    "deferredAccountId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "cancelReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountDeferral_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AccountDeferral_systemId_status_idx" ON "AccountDeferral"("systemId", "status");
CREATE INDEX "AccountDeferral_systemId_documentId_idx" ON "AccountDeferral"("systemId", "documentId");

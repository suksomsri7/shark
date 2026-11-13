-- HR H3.5 ▸ ไฟล์โอนเงินเดือน (brief hr-brief-H3.5 R1) — additive ล้วน: 3 ตารางใหม่ · 2 unique · 4 index · CHECK
--   ไม่ ALTER ตาราง/enum เดิม (HrEmployee · HrPayrollRun · HrPayrollItem ไม่เปลี่ยน · คอลัมน์กุญแจไฟล์ธนาคารเดิมของรอบจ่ายยังไม่มีใครเขียน — Q3) · ไม่มี FK
--   HrBankFile ไม่เก็บไบต์ไฟล์ (Q2) — เก็บ sha256 + ตัวเลือกที่ใช้ (ไม่มีเลขบัญชี/ชื่อ) แล้วสร้างใหม่ตอนดาวน์โหลด
--   runbook: migrate ก่อน แล้วจึง deploy โค้ด · ไม่มี backfill · ถอยกลับ = ปิดโค้ด (ตารางว่างเฉย ๆ · โค้ดเดิมไม่รู้จัก)
--   ตรวจก่อน (นอกไฟล์นี้): SELECT to_regclass('"HrBankProfile"'), to_regclass('"HrBankExportPreset"'), to_regclass('"HrBankFile"');  -- ต้องได้ NULL ทั้งสาม
-- CreateTable
CREATE TABLE "HrBankProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "debitBankCode" TEXT NOT NULL,
    "debitAccountNo" TEXT NOT NULL,
    "debitBranchCode" TEXT,
    "companyNameEn" TEXT,
    "ktbCompanyId" TEXT,
    "formatsEnabled" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrBankProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrBankExportPreset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "columnsJson" JSONB NOT NULL,
    "includeHeader" BOOLEAN NOT NULL DEFAULT true,
    "includeSummary" BOOLEAN NOT NULL DEFAULT false,
    "amountStyle" TEXT NOT NULL,
    "dateStyle" TEXT NOT NULL,
    "encoding" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrBankExportPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrBankFile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "optionsJson" JSONB NOT NULL,
    "fileName" TEXT NOT NULL,
    "byteLength" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "totalSatang" INTEGER NOT NULL,
    "excludedCount" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "downloads" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "HrBankFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HrBankProfile_systemId_key" ON "HrBankProfile"("systemId");

-- CreateIndex
CREATE INDEX "HrBankProfile_tenantId_idx" ON "HrBankProfile"("tenantId");

-- CreateIndex
CREATE INDEX "HrBankExportPreset_tenantId_idx" ON "HrBankExportPreset"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "HrBankExportPreset_systemId_name_key" ON "HrBankExportPreset"("systemId", "name");

-- CreateIndex
CREATE INDEX "HrBankFile_systemId_runId_idx" ON "HrBankFile"("systemId", "runId");

-- CreateIndex
CREATE INDEX "HrBankFile_tenantId_idx" ON "HrBankFile"("tenantId");


-- CHECK (ด่านสุดท้ายในฐาน — แอปตรวจก่อนเสมอ) · เงิน = สตางค์จำนวนเต็ม
ALTER TABLE "HrBankProfile" ADD CONSTRAINT "HrBankProfile_bank_check" CHECK ("debitBankCode" IN ('002', '004', '006', '014'));
ALTER TABLE "HrBankProfile" ADD CONSTRAINT "HrBankProfile_account_check" CHECK ("debitAccountNo" ~ '^[0-9]{10}$');
ALTER TABLE "HrBankProfile" ADD CONSTRAINT "HrBankProfile_branch_check" CHECK ("debitBranchCode" IS NULL OR "debitBranchCode" ~ '^[0-9]{4}$');
ALTER TABLE "HrBankProfile" ADD CONSTRAINT "HrBankProfile_company_check" CHECK ("companyNameEn" IS NULL OR char_length("companyNameEn") <= 50);
ALTER TABLE "HrBankProfile" ADD CONSTRAINT "HrBankProfile_ktb_id_check" CHECK ("ktbCompanyId" IS NULL OR char_length("ktbCompanyId") <= 16);
ALTER TABLE "HrBankProfile" ADD CONSTRAINT "HrBankProfile_formats_check" CHECK ("formatsEnabled" <@ ARRAY['KBANK_PCT', 'KTB_IPAY']::TEXT[]);
ALTER TABLE "HrBankExportPreset" ADD CONSTRAINT "HrBankExportPreset_name_check" CHECK (char_length("name") BETWEEN 1 AND 60);
ALTER TABLE "HrBankExportPreset" ADD CONSTRAINT "HrBankExportPreset_kind_check" CHECK ("kind" IN ('CSV', 'XLSX'));
ALTER TABLE "HrBankExportPreset" ADD CONSTRAINT "HrBankExportPreset_amount_check" CHECK ("amountStyle" IN ('BAHT_2DP', 'SATANG'));
ALTER TABLE "HrBankExportPreset" ADD CONSTRAINT "HrBankExportPreset_date_check" CHECK ("dateStyle" IN ('ISO_CE', 'DMY_CE', 'DMY_BE'));
ALTER TABLE "HrBankExportPreset" ADD CONSTRAINT "HrBankExportPreset_encoding_check" CHECK ("encoding" IN ('UTF8_BOM', 'TIS620'));
ALTER TABLE "HrBankFile" ADD CONSTRAINT "HrBankFile_format_check" CHECK ("format" IN ('KBANK_PCT', 'KTB_IPAY', 'CSV', 'XLSX'));
ALTER TABLE "HrBankFile" ADD CONSTRAINT "HrBankFile_counts_check" CHECK ("byteLength" > 0 AND "itemCount" > 0 AND "excludedCount" >= 0 AND "totalSatang" > 0 AND "downloads" >= 0);
ALTER TABLE "HrBankFile" ADD CONSTRAINT "HrBankFile_sha_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$');
ALTER TABLE "HrBankFile" ADD CONSTRAINT "HrBankFile_expiry_check" CHECK ("expiresAt" > "createdAt");

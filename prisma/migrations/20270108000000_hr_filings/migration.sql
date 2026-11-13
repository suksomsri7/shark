-- HR H3.6 ▸ แบบยื่นภาษี/ประกันสังคม (brief hr-brief-H3.6 R1) — additive ล้วน: 4 ตารางใหม่ · unique · index · CHECK · 2 FK ไป HrEmployee (RESTRICT)
--   ไม่ ALTER ตาราง/enum เดิม (HrEmployee · HrPayrollRun · HrPayrollItem ไม่เปลี่ยน · คอลัมน์ filingJson ของรอบจ่ายยังไม่มีใครเขียน)
--   HrFilingFile ไม่เก็บไบต์ไฟล์ — เก็บ sha256 + ตัวเลือกที่ใช้ (ไม่มีเลขประจำตัว/ชื่อ) แล้วสร้างใหม่ตอนดาวน์โหลด
--   HrTaxCertificate: 1 ใบที่ยังไม่ยกเลิกต่อ (ระบบ, พนักงาน, ปีภาษี) = partial unique ท้ายไฟล์ · เลขที่ไม่ซ้ำในระบบ
--   runbook: migrate ก่อน แล้วจึง deploy โค้ด · ไม่มี backfill · ถอยกลับ = ปิดโค้ด (ตารางว่างเฉย ๆ · โค้ดเดิมไม่รู้จัก)
--   ตรวจก่อน (นอกไฟล์นี้): SELECT to_regclass('"HrFilingProfile"'), to_regclass('"HrFilingPerson"'), to_regclass('"HrFilingFile"'), to_regclass('"HrTaxCertificate"');  -- ต้องได้ NULL ทั้งสี่
-- CreateTable
CREATE TABLE "HrFilingProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "taxId" TEXT,
    "branchNo" TEXT NOT NULL DEFAULT '000000',
    "employerName" TEXT,
    "employerAddress" TEXT,
    "deptName" TEXT DEFAULT 'สำนักงานใหญ่',
    "lto" BOOLEAN NOT NULL DEFAULT false,
    "branchType" TEXT NOT NULL DEFAULT '',
    "rdUserId" TEXT,
    "rdFormFlag" INTEGER NOT NULL DEFAULT 2, -- 1 = ยื่นด้วยสื่อ · 2 = ยื่นอินเทอร์เน็ต (RD Format 2.0 FORM_FLAG)
    "ssoAccountNo" TEXT,
    "ssoBranchNo" TEXT NOT NULL DEFAULT '000000',
    "ssoEncoding" TEXT NOT NULL DEFAULT 'TIS620',
    "ssoWageMode" TEXT NOT NULL DEFAULT 'CLAMPED',
    "rdSlashMode" TEXT NOT NULL DEFAULT 'DASH',
    "signerName" TEXT,
    "certPrefix" TEXT NOT NULL DEFAULT 'HR50',
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrFilingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrFilingPerson" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "title" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "ssoPrefix" TEXT,
    "building" TEXT,
    "room" TEXT,
    "floor" TEXT,
    "village" TEXT,
    "houseNo" TEXT,
    "moo" TEXT,
    "soi" TEXT,
    "street" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrFilingPerson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrFilingFile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "runId" TEXT,
    "optionsJson" JSONB NOT NULL,
    "fileName" TEXT NOT NULL,
    "byteLength" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "lineCount" INTEGER NOT NULL,
    "totalSatang" DECIMAL(20,0) NOT NULL,
    "taxSatang" DECIMAL(20,0) NOT NULL,
    "excludedCount" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "downloads" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "HrFilingFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrTaxCertificate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "docSeq" INTEGER NOT NULL,
    "docNo" TEXT NOT NULL,
    "formSeq" INTEGER NOT NULL,
    "contentJson" JSONB NOT NULL,
    "contentSha256" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "issuedById" TEXT NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    "downloads" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "HrTaxCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HrFilingProfile_systemId_key" ON "HrFilingProfile"("systemId");

-- CreateIndex
CREATE INDEX "HrFilingProfile_tenantId_idx" ON "HrFilingProfile"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "HrFilingPerson_employeeId_key" ON "HrFilingPerson"("employeeId");

-- CreateIndex
CREATE INDEX "HrFilingPerson_systemId_idx" ON "HrFilingPerson"("systemId");

-- CreateIndex
CREATE INDEX "HrFilingPerson_tenantId_idx" ON "HrFilingPerson"("tenantId");

-- CreateIndex
CREATE INDEX "HrFilingFile_systemId_kind_period_idx" ON "HrFilingFile"("systemId", "kind", "period");

-- CreateIndex
CREATE INDEX "HrFilingFile_tenantId_idx" ON "HrFilingFile"("tenantId");

-- CreateIndex
CREATE INDEX "HrTaxCertificate_systemId_taxYear_idx" ON "HrTaxCertificate"("systemId", "taxYear");

-- CreateIndex
CREATE INDEX "HrTaxCertificate_employeeId_idx" ON "HrTaxCertificate"("employeeId");

-- CreateIndex
CREATE INDEX "HrTaxCertificate_tenantId_idx" ON "HrTaxCertificate"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "HrTaxCertificate_systemId_docNo_key" ON "HrTaxCertificate"("systemId", "docNo");

-- AddForeignKey
ALTER TABLE "HrFilingPerson" ADD CONSTRAINT "HrFilingPerson_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrTaxCertificate" ADD CONSTRAINT "HrTaxCertificate_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK (ค่าว่าง = NULL ผ่าน · ความครบตรวจตอนสร้างไฟล์)
ALTER TABLE "HrFilingProfile" ADD CONSTRAINT "HrFilingProfile_taxId_chk" CHECK ("taxId" IS NULL OR "taxId" ~ '^[0-9]{13}$');
ALTER TABLE "HrFilingProfile" ADD CONSTRAINT "HrFilingProfile_branchNo_chk" CHECK ("branchNo" ~ '^[0-9]{6}$');
ALTER TABLE "HrFilingProfile" ADD CONSTRAINT "HrFilingProfile_ssoBranchNo_chk" CHECK ("ssoBranchNo" ~ '^[0-9]{6}$');
ALTER TABLE "HrFilingProfile" ADD CONSTRAINT "HrFilingProfile_ssoAccountNo_chk" CHECK ("ssoAccountNo" IS NULL OR "ssoAccountNo" ~ '^[0-9]{10}$');
ALTER TABLE "HrFilingProfile" ADD CONSTRAINT "HrFilingProfile_rdUserId_chk" CHECK ("rdUserId" IS NULL OR "rdUserId" ~ '^[A-Za-z0-9]{1,20}$');
ALTER TABLE "HrFilingProfile" ADD CONSTRAINT "HrFilingProfile_rdFormFlag_chk" CHECK ("rdFormFlag" IN (1, 2));
ALTER TABLE "HrFilingProfile" ADD CONSTRAINT "HrFilingProfile_branchType_chk" CHECK ("branchType" IN ('', 'V', 'S'));
ALTER TABLE "HrFilingProfile" ADD CONSTRAINT "HrFilingProfile_ssoEncoding_chk" CHECK ("ssoEncoding" IN ('TIS620', 'UTF8'));
ALTER TABLE "HrFilingProfile" ADD CONSTRAINT "HrFilingProfile_ssoWageMode_chk" CHECK ("ssoWageMode" IN ('CLAMPED', 'ACTUAL'));
ALTER TABLE "HrFilingProfile" ADD CONSTRAINT "HrFilingProfile_rdSlashMode_chk" CHECK ("rdSlashMode" IN ('DASH', 'EXCLUDE'));
ALTER TABLE "HrFilingProfile" ADD CONSTRAINT "HrFilingProfile_certPrefix_chk" CHECK ("certPrefix" ~ '^[A-Z0-9]{1,8}$');
ALTER TABLE "HrFilingProfile" ADD CONSTRAINT "HrFilingProfile_len_chk" CHECK (char_length(coalesce("employerName", '')) <= 100 AND char_length(coalesce("signerName", '')) <= 100 AND char_length(coalesce("employerAddress", '')) <= 300 AND char_length(coalesce("deptName", '')) <= 80);
ALTER TABLE "HrFilingPerson" ADD CONSTRAINT "HrFilingPerson_ssoPrefix_chk" CHECK ("ssoPrefix" IS NULL OR "ssoPrefix" ~ '^[0-9]{3}$');
ALTER TABLE "HrFilingPerson" ADD CONSTRAINT "HrFilingPerson_len_chk" CHECK (char_length(coalesce("title", '')) <= 100 AND char_length(coalesce("firstName", '')) <= 100 AND char_length(coalesce("lastName", '')) <= 80 AND char_length(coalesce("building", '')) <= 40 AND char_length(coalesce("room", '')) <= 20 AND char_length(coalesce("floor", '')) <= 20 AND char_length(coalesce("village", '')) <= 100 AND char_length(coalesce("houseNo", '')) <= 40 AND char_length(coalesce("moo", '')) <= 20 AND char_length(coalesce("soi", '')) <= 100 AND char_length(coalesce("street", '')) <= 100);
ALTER TABLE "HrFilingFile" ADD CONSTRAINT "HrFilingFile_kind_chk" CHECK ("kind" IN ('PND1', 'PND1A', 'SSO110'));
ALTER TABLE "HrFilingFile" ADD CONSTRAINT "HrFilingFile_num_chk" CHECK ("byteLength" >= 0 AND "lineCount" >= 0 AND "excludedCount" >= 0 AND "downloads" >= 0 AND "totalSatang" >= 0 AND "taxSatang" >= 0);
ALTER TABLE "HrTaxCertificate" ADD CONSTRAINT "HrTaxCertificate_kind_chk" CHECK ("kind" IN ('ANNUAL', 'LEAVER'));
ALTER TABLE "HrTaxCertificate" ADD CONSTRAINT "HrTaxCertificate_seq_chk" CHECK ("docSeq" >= 1 AND "formSeq" >= 1 AND "taxYear" BETWEEN 2000 AND 2400);
ALTER TABLE "HrTaxCertificate" ADD CONSTRAINT "HrTaxCertificate_void_chk" CHECK (("voidedAt" IS NULL AND "voidedById" IS NULL AND "voidReason" IS NULL) OR ("voidedAt" IS NOT NULL AND "voidedById" IS NOT NULL AND char_length(coalesce("voidReason", '')) BETWEEN 1 AND 200));

-- 1 ใบที่ยังไม่ยกเลิกต่อ (ระบบ, พนักงาน, ปีภาษี) — ใบที่ยกเลิกแล้วไม่กันใบใหม่ · เลขที่ไม่คืน
CREATE UNIQUE INDEX "HrTaxCertificate_live_key" ON "HrTaxCertificate"("systemId", "employeeId", "taxYear") WHERE "voidedAt" IS NULL;

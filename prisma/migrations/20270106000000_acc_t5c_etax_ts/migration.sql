-- ACC T5c + T5.4 (เลน 2) ▸ หนี้สูญได้รับคืน · e-Tax Invoice by Time Stamp (ความพยายามส่ง + ไฟล์) — เพิ่มอย่างเดียว ไม่แก้ข้อมูลเดิม

CREATE TABLE "AccountEtaxSubmission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "scheme" TEXT NOT NULL DEFAULT 'TIME_STAMP',
    "mode" TEXT NOT NULL DEFAULT 'SEND',
    "status" TEXT NOT NULL,
    "subjectKind" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "ccAddress" TEXT,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "attachmentName" TEXT NOT NULL,
    "attachmentBytes" INTEGER NOT NULL,
    "pdfSha256" TEXT NOT NULL,
    "pdfFileId" TEXT,
    "pdfConformance" TEXT NOT NULL,
    "transport" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "error" TEXT,
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "stampedFileId" TEXT,
    "stampedSha256" TEXT,
    "stampedAt" TIMESTAMP(3),
    "stampedById" TEXT,
    "idempotencyKey" TEXT,
    "createdById" TEXT,
    "actorType" TEXT NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AccountEtaxSubmission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountEtaxFile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "submissionId" TEXT,
    "role" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountEtaxFile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountBadDebtRecovery" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" INTEGER NOT NULL,
    "channel" "AccountPayChannel" NOT NULL,
    "financeAccountId" TEXT,
    "note" TEXT,
    "entryId" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdById" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountBadDebtRecovery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountEtaxSubmission_idempotencyKey_key" ON "AccountEtaxSubmission"("idempotencyKey");
CREATE UNIQUE INDEX "AccountEtaxSubmission_documentId_attemptNo_key" ON "AccountEtaxSubmission"("documentId", "attemptNo");
CREATE INDEX "AccountEtaxSubmission_tenantId_systemId_documentId_createdAt_idx" ON "AccountEtaxSubmission"("tenantId", "systemId", "documentId", "createdAt");
CREATE INDEX "AccountEtaxFile_tenantId_systemId_documentId_idx" ON "AccountEtaxFile"("tenantId", "systemId", "documentId");
CREATE UNIQUE INDEX "AccountBadDebtRecovery_idempotencyKey_key" ON "AccountBadDebtRecovery"("idempotencyKey");
CREATE INDEX "AccountBadDebtRecovery_tenantId_systemId_documentId_idx" ON "AccountBadDebtRecovery"("tenantId", "systemId", "documentId");

ALTER TABLE "AccountEtaxSubmission" ADD CONSTRAINT "AccountEtaxSubmission_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "AccountDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountEtaxFile" ADD CONSTRAINT "AccountEtaxFile_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "AccountDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountBadDebtRecovery" ADD CONSTRAINT "AccountBadDebtRecovery_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "AccountDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ไฟล์ e-Tax (ที่ส่ง/ที่ประทับเวลา) แก้ไม่ได้ — ประกาศ Time Stamp ข้อ 10 (เก็บรักษาให้ความหมายไม่เปลี่ยนแปลง) · ลบได้เฉพาะตามเอกสาร (cascade)
CREATE OR REPLACE FUNCTION "acc_etax_file_no_update"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AccountEtaxFile is append-only (ACC T5.4)';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "AccountEtaxFile_no_update" BEFORE UPDATE ON "AccountEtaxFile" FOR EACH ROW EXECUTE FUNCTION "acc_etax_file_no_update"();

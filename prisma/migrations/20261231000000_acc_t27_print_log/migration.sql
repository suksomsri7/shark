-- ACC T2.7 — ประวัติการพิมพ์เอกสาร (ต้นฉบับ/สำเนา/ชุด/ใบแทน/ต้นฉบับพิมพ์ซ้ำ) · additive
-- CreateEnum
CREATE TYPE "AccountPrintKind" AS ENUM ('ORIGINAL', 'COPY', 'SET', 'SUBSTITUTE', 'ORIGINAL_REPRINT');

-- CreateEnum
CREATE TYPE "AccountPrintChannel" AS ENUM ('SCREEN', 'PDF', 'EMAIL', 'PUBLIC_LINK');

-- CreateTable
CREATE TABLE "AccountDocumentPrint" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "kind" "AccountPrintKind" NOT NULL,
    "channel" "AccountPrintChannel" NOT NULL,
    "substituteSeq" INTEGER,
    "substituteReason" TEXT,
    "substituteDate" TIMESTAMP(3),
    "actorId" TEXT,
    "actorType" TEXT NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountDocumentPrint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountDocumentPrint_documentId_substituteSeq_key" ON "AccountDocumentPrint"("documentId", "substituteSeq");

-- CreateIndex
CREATE INDEX "AccountDocumentPrint_tenantId_systemId_documentId_createdAt_idx" ON "AccountDocumentPrint"("tenantId", "systemId", "documentId", "createdAt");

-- ต้นฉบับครั้งแรกมีได้แถวเดียวต่อเอกสาร (ORIGINAL หรือ SET) — พิมพ์พร้อมกันสองเครื่อง: ตัวที่แพ้กลายเป็นสำเนา (print-log.ts)
CREATE UNIQUE INDEX "AccountDocumentPrint_one_original" ON "AccountDocumentPrint"("documentId") WHERE "kind" IN ('ORIGINAL', 'SET');

-- AddForeignKey
ALTER TABLE "AccountDocumentPrint" ADD CONSTRAINT "AccountDocumentPrint_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "AccountDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

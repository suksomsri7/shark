-- SVC D.4 · migration svc_d4 — ตารางชุดนำเข้า Excel/CSV ของหอ (DormImportBatch) · RULING-1 ทาง ก (มติผู้คุม 30 ต.ค.)
-- สร้างจาก: prisma migrate diff --from-schema <schema 3f638d37> --to-schema prisma/schema --script (ไม่ใช้ migrate dev) + SQL มือท้ายไฟล์
-- additive ล้วน: ตารางใหม่ 1 ตาราง + ดัชนีของตารางนี้ · ไม่มี DROP/RENAME/ALTER ของตารางเดิม · ไม่แก้ข้อมูล

-- CreateTable
CREATE TABLE "DormImportBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "sheet" TEXT,
    "fileId" TEXT,
    "rowCount" INTEGER NOT NULL,
    "columnCount" INTEGER NOT NULL,
    "parsed" JSONB,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 0,
    "proposal" JSONB,
    "mapping" JSONB,
    "mappingConfirmedById" TEXT,
    "options" JSONB,
    "decisions" JSONB,
    "previewHash" TEXT,
    "summary" JSONB,
    "manifest" JSONB,
    "lastError" JSONB,
    "claimToken" TEXT,
    "claimUntil" TIMESTAMP(3),
    "createdById" TEXT,
    "committedAt" TIMESTAMP(3),
    "undoneAt" TIMESTAMP(3),
    "undoneById" TEXT,
    "undoReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DormImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DormImportBatch_tenantId_unitId_status_idx" ON "DormImportBatch"("tenantId", "unitId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DormImportBatch_unitId_fileHash_key" ON "DormImportBatch"("unitId", "fileHash");


-- CHECK (ใบสั่ง §2.1)
ALTER TABLE "DormImportBatch" ADD CONSTRAINT "DormImportBatch_status_check" CHECK ("status" IN ('DRAFT', 'CREATING', 'CREATED', 'UNDOING', 'UNDONE'));
ALTER TABLE "DormImportBatch" ADD CONSTRAINT "DormImportBatch_format_check" CHECK ("format" IN ('CSV', 'XLSX'));
ALTER TABLE "DormImportBatch" ADD CONSTRAINT "DormImportBatch_rowCount_check" CHECK ("rowCount" >= 0);

-- partial unique: หน่วยหนึ่งมีงานสร้าง/ย้อนที่กำลังทำได้ชุดเดียว (ใบสั่ง §2.8 · ชน = BUSY)
CREATE UNIQUE INDEX "DormImportBatch_unit_active_key" ON "DormImportBatch"("unitId") WHERE "status" IN ('CREATING', 'UNDOING');

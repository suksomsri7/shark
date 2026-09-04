-- WO 8.1 (§9.2) — ตั้งค่าเอกสาร
-- additive ล้วน: ตารางใหม่ 1 ตาราง (นิยามแท็กเอกสาร) · ไม่แตะคอลัมน์/ตารางเดิม
-- ตั้งค่าอื่น ๆ ทั้งหมดของ §9.2 เก็บใน AccountSettings.docConfig (Json ที่มีอยู่แล้ว) — ไม่ต้อง migrate
-- เลขรันใช้ AccountDocSequence เดิม (มี unique (systemId, docType, periodKey) อยู่แล้ว)

-- CreateTable
CREATE TABLE "AccountDocTag" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'slate',
    "docTypes" JSONB NOT NULL DEFAULT '[]',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountDocTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountDocTag_systemId_archivedAt_idx" ON "AccountDocTag"("systemId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccountDocTag_systemId_name_key" ON "AccountDocTag"("systemId", "name");

-- HR H3.8 ▸ หนังสือรับรองเงินเดือน (brief hr-brief-H3.8 R1) — additive ล้วน: 1 ตารางใหม่ · CHECK · unique · index · 1 FK ไป HrEmployee (RESTRICT)
--   ไม่แตะตาราง/enum เดิม (สลิปอ่านจาก HrPayrollRun/HrPayrollItem ที่มีอยู่ ไม่มีตารางสลิป)
--   แถว = คำขอ (REQUESTED) → ออกแล้ว (ISSUED: เลขที่ + เนื้อหาแช่แข็ง + sha) | ไม่อนุมัติ (REJECTED) | ยกเลิกคำขอ (CANCELLED) · ยกเลิกใบที่ออกแล้ว = voidedAt (สถานะคง ISSUED · เลขไม่ถูกใช้ซ้ำ)
--   1 คำขอที่รอต่อ (ระบบ, พนักงาน) = partial unique ท้ายไฟล์ · เลขที่ไม่ซ้ำในระบบ · ไม่เก็บไบต์ PDF · ไม่มีเลขประจำตัวประชาชน
--   runbook: migrate ก่อน แล้วจึง deploy โค้ด · ไม่มี backfill · ถอยกลับ = ปิดโค้ด (ตารางว่างเฉย ๆ)
--   ตรวจก่อน (นอกไฟล์นี้): SELECT to_regclass('"HrSalaryCertificate"');  -- ต้องได้ NULL
-- CreateTable
CREATE TABLE "HrSalaryCertificate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "requestedById" TEXT,
    "requestedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "docSeq" INTEGER,
    "docNo" TEXT,
    "contentJson" JSONB,
    "contentSha256" TEXT,
    "issuedAt" TIMESTAMP(3),
    "issuedById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrSalaryCertificate_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "HrSalaryCertificate_status_check" CHECK ("status" IN ('REQUESTED', 'ISSUED', 'REJECTED', 'CANCELLED')),
    CONSTRAINT "HrSalaryCertificate_purpose_check" CHECK ("purpose" IN ('GENERAL', 'BANK', 'VISA', 'RENTAL', 'OTHER')),
    CONSTRAINT "HrSalaryCertificate_issued_check" CHECK ("status" <> 'ISSUED' OR ("docNo" IS NOT NULL AND "docSeq" IS NOT NULL AND "contentJson" IS NOT NULL AND "contentSha256" IS NOT NULL AND "issuedAt" IS NOT NULL AND "issuedById" IS NOT NULL)),
    CONSTRAINT "HrSalaryCertificate_void_reason_check" CHECK ("voidReason" IS NULL OR char_length("voidReason") BETWEEN 1 AND 200)
);

-- CreateIndex
CREATE UNIQUE INDEX "HrSalaryCertificate_systemId_docNo_key" ON "HrSalaryCertificate"("systemId", "docNo");

-- CreateIndex
CREATE INDEX "HrSalaryCertificate_systemId_employeeId_status_idx" ON "HrSalaryCertificate"("systemId", "employeeId", "status");

-- CreateIndex
CREATE INDEX "HrSalaryCertificate_tenantId_idx" ON "HrSalaryCertificate"("tenantId");

-- AddForeignKey
ALTER TABLE "HrSalaryCertificate" ADD CONSTRAINT "HrSalaryCertificate_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 1 คำขอที่รอดำเนินการต่อ (ระบบ, พนักงาน) — ประกาศเฉพาะที่นี่ (Prisma schema ไม่รองรับ WHERE) · ห้ามใส่ unique เต็มของคู่นี้ใน schema
CREATE UNIQUE INDEX "HrSalaryCertificate_open_request_key" ON "HrSalaryCertificate"("systemId", "employeeId") WHERE "status" = 'REQUESTED';

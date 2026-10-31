-- SVC B.13 · migration svc_b13 — ช่วงปิดซ่อมของทรัพยากร (SvcResourceBlock) · มติผู้คุม R1 ทาง A (31 ต.ค.)
-- สร้างจาก: prisma migrate diff --from-schema <schema f84270a3> --to-schema prisma/schema --script (ไม่ใช้ migrate dev) + CHECK มือท้ายไฟล์
-- additive ล้วน: ตารางใหม่ 1 ตาราง + ดัชนีของตารางนี้ + CHECK ของตารางนี้ · ไม่มี DROP/RENAME/ALTER ของตารางเดิม · ไม่แก้ข้อมูล

-- CreateTable
CREATE TABLE "SvcResourceBlock" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SvcResourceBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SvcResourceBlock_tenantId_resourceId_startAt_idx" ON "SvcResourceBlock"("tenantId", "resourceId", "startAt");

-- CHECK (ใบสั่ง §3.3: ปลาย > ต้น หรือ null = จนกว่าจะปลด) — ตารางใหม่ ไม่มีแถวเดิม
ALTER TABLE "SvcResourceBlock" ADD CONSTRAINT "SvcResourceBlock_range_check" CHECK ("endAt" IS NULL OR "endAt" > "startAt");

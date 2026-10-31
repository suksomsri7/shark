-- SVC B.17 · migration svc_b17 — waitlist "แจ้งฉันถ้ามีคนยกเลิก" (BookingWaitlist) · มติผู้คุม R1 ทาง ก (31 ต.ค. · ต่อคิวหลัง svc_b13)
-- สร้างจาก: prisma migrate diff --from-schema <schema 02ef520a> --to-schema prisma/schema --script (ไม่ใช้ migrate dev) + CHECK มือท้ายไฟล์
-- additive ล้วน: ตารางใหม่ 1 ตาราง + ดัชนี 3 ตัวของตารางนี้ + CHECK 2 ตัวของตารางนี้ · ไม่มี DROP/RENAME/ALTER ของตารางเดิม · ไม่แก้ข้อมูล
-- X8: ไม่มีคอลัมน์ชื่อ/เบอร์/อีเมล (อ่านจาก Party ตอนส่ง)

-- CreateTable
CREATE TABLE "BookingWaitlist" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "staffId" TEXT,
    "dateStr" TEXT NOT NULL,
    "fromMin" INTEGER NOT NULL,
    "toMin" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingWaitlist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingWaitlist_tenantId_unitId_dateStr_status_createdAt_idx" ON "BookingWaitlist"("tenantId", "unitId", "dateStr", "status", "createdAt");

-- CreateIndex
CREATE INDEX "BookingWaitlist_tenantId_partyId_status_idx" ON "BookingWaitlist"("tenantId", "partyId", "status");

-- CreateIndex
CREATE INDEX "BookingWaitlist_status_expiresAt_idx" ON "BookingWaitlist"("status", "expiresAt");


-- CHECK (มือ · ใบสั่ง §4): ช่วงนาทีของวัน + สถานะที่รู้จัก
ALTER TABLE "BookingWaitlist" ADD CONSTRAINT "BookingWaitlist_minutes_check" CHECK ("fromMin" >= 0 AND "fromMin" < "toMin" AND "toMin" <= 1440);
ALTER TABLE "BookingWaitlist" ADD CONSTRAINT "BookingWaitlist_status_check" CHECK ("status" IN ('ACTIVE', 'BOOKED', 'CANCELLED', 'EXPIRED'));

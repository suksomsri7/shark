-- HR H4.5 ▸ แจ้งเตือนพนักงานผ่าน LINE (brief hr-brief-H4.5 R1) — additive ล้วน: 2 ตารางใหม่ · CHECK · partial unique · index · 1 FK ไป HrEmployee (RESTRICT)
--   HrLineLink = การผูก LINE ของพนักงาน (รหัสครั้งเดียว → ACTIVE) · HrNotice = แจ้งเตือนในแอป + สถานะส่ง LINE ต่อพนักงานต่อเหตุการณ์
--   🔴 เก็บ id/สถานะเท่านั้น — ไม่มีชื่อ · LINE user id · ข้อความ · เงิน (ชื่อ/ภาษาอ่านสดจากตารางแชทตอนส่ง)
--   runbook: migrate ก่อน แล้วจึง deploy โค้ด · ไม่มี backfill · ฟีเจอร์ปิดเป็นค่าเริ่มต้นทุกร้าน · ถอยกลับ = ปิดโค้ด (ตารางว่างเฉย ๆ)
--   ตรวจก่อน (นอกไฟล์นี้): SELECT to_regclass('"HrLineLink"'), to_regclass('"HrNotice"');  -- ต้องได้ NULL ทั้งคู่
-- CreateTable
CREATE TABLE "HrLineLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "issuedForUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "connectionId" TEXT,
    "chatContactId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "linkedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrLineLink_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "HrLineLink_status_check" CHECK ("status" IN ('PENDING', 'ACTIVE', 'ENDED', 'CANCELLED')),
    CONSTRAINT "HrLineLink_endReason_check" CHECK ("endReason" IS NULL OR "endReason" IN ('SELF', 'ADMIN', 'LINE', 'RELINK', 'OFFBOARD', 'ACCOUNT', 'BLOCKED', 'CONTACT_REUSED', 'REISSUED')),
    CONSTRAINT "HrLineLink_active_check" CHECK ("status" <> 'ACTIVE' OR ("connectionId" IS NOT NULL AND "chatContactId" IS NOT NULL AND "linkedAt" IS NOT NULL))
);

-- CreateTable
CREATE TABLE "HrNotice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "outcome" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "appNotified" BOOLEAN NOT NULL DEFAULT false,
    "line" TEXT NOT NULL DEFAULT 'NONE',
    "lineAttempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "skipCode" TEXT,
    "digestOf" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrNotice_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "HrNotice_kind_check" CHECK ("kind" IN ('ROSTER', 'LEAVE', 'OT', 'SWAP_ASK', 'SWAP', 'SLIP', 'DIGEST')),
    CONSTRAINT "HrNotice_line_check" CHECK ("line" IN ('NONE', 'PENDING', 'SENDING', 'HELD', 'SENT', 'FAILED', 'QUOTA', 'CAP', 'SKIPPED')),
    CONSTRAINT "HrNotice_attempts_check" CHECK ("lineAttempts" >= 0)
);

-- CreateIndex
CREATE INDEX "HrLineLink_systemId_employeeId_idx" ON "HrLineLink"("systemId", "employeeId");

-- CreateIndex
CREATE INDEX "HrLineLink_tenantId_idx" ON "HrLineLink"("tenantId");

-- CreateIndex
CREATE INDEX "HrLineLink_status_expiresAt_idx" ON "HrLineLink"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "HrNotice_tenantId_dedupeKey_key" ON "HrNotice"("tenantId", "dedupeKey");

-- CreateIndex
CREATE INDEX "HrNotice_line_nextAttemptAt_idx" ON "HrNotice"("line", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "HrNotice_systemId_employeeId_idx" ON "HrNotice"("systemId", "employeeId");

-- CreateIndex
CREATE INDEX "HrNotice_tenantId_idx" ON "HrNotice"("tenantId");

-- AddForeignKey
ALTER TABLE "HrLineLink" ADD CONSTRAINT "HrLineLink_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 1 การผูกที่ใช้งานอยู่ + 1 รหัสที่รอ ต่อ (ระบบ, พนักงาน) · 1 ผู้ติดต่อ LINE ผูกพนักงานได้คนเดียวต่อร้าน — ประกาศเฉพาะที่นี่ (Prisma schema ไม่รองรับ WHERE)
CREATE UNIQUE INDEX "HrLineLink_active_employee_key" ON "HrLineLink"("systemId", "employeeId") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "HrLineLink_pending_employee_key" ON "HrLineLink"("systemId", "employeeId") WHERE "status" = 'PENDING';
CREATE UNIQUE INDEX "HrLineLink_active_contact_key" ON "HrLineLink"("tenantId", "chatContactId") WHERE "status" = 'ACTIVE';

-- แถวสมาชิกของสรุปรายวัน (นับ/ปิดตามสรุป) — เฉพาะแถวที่มี digestOf
CREATE INDEX "HrNotice_digestOf_idx" ON "HrNotice"("digestOf") WHERE "digestOf" IS NOT NULL;

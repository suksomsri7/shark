-- SVC D.0 · migration svc_d — หอพัก 12 ตาราง (Dorm*) + AccountDocSource.DORM + หนี้ดัชนี R0.6/R0.8
-- สร้างจาก: prisma migrate diff --from-schema <schema 93a42093> --to-schema prisma/schema --script (ไม่ใช้ migrate dev) + SQL มือท้ายไฟล์
-- additive ล้วน: ไม่มี DROP/RENAME/เปลี่ยนชนิด/SET NOT NULL/แก้ข้อมูล · ตารางเดิม (RoomOccupancy · HotelRoom · PaymentSlip · IntegrationCallLog) ได้แค่ดัชนี
-- 🔴 deploy prod: ALTER TYPE ลงก่อน client ที่เขียน DORM · ก่อนสร้าง unique STAY/idempotencyKey ตรวจข้อมูลซ้ำ (ดูท้ายไฟล์ + svc-deploy-checklist)

-- AlterEnum
ALTER TYPE "AccountDocSource" ADD VALUE 'DORM';

-- CreateTable
CREATE TABLE "DormLease" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "coTenants" JSONB,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "termType" TEXT NOT NULL DEFAULT 'FIXED',
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "rentSatang" INTEGER NOT NULL,
    "commonFeeSatang" INTEGER NOT NULL DEFAULT 0,
    "depositSatang" INTEGER NOT NULL DEFAULT 0,
    "advanceRentSatang" INTEGER NOT NULL DEFAULT 0,
    "bookingFeeSatang" INTEGER NOT NULL DEFAULT 0,
    "occupancyId" TEXT,
    "signedAt" TIMESTAMP(3),
    "signatureFileId" TEXT,
    "templateKey" TEXT,
    "templateVersion" INTEGER,
    "moveInPhotos" JSONB,
    "depositDocumentId" TEXT,
    "previousLeaseId" TEXT,
    "endReason" TEXT,
    "createdById" TEXT,
    "endedAt" TIMESTAMP(3),
    "policySnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DormLease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DormMeter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "roomId" TEXT,
    "buildingId" TEXT,
    "kind" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ROOM',
    "serial" TEXT,
    "digits" INTEGER,
    "startReading" INTEGER NOT NULL DEFAULT 0,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "replacedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DormMeter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DormMeterReading" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "meterId" TEXT NOT NULL,
    "leaseId" TEXT,
    "periodKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'PERIOD',
    "value" INTEGER NOT NULL,
    "aiValue" INTEGER,
    "photoFileId" TEXT,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readById" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "flag" TEXT,
    "flagNote" TEXT,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DormMeterReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DormUtilityRate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "buildingId" TEXT,
    "kind" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "authorityBillSatang" INTEGER,
    "authorityUnits" INTEGER,
    "rateSatangPerUnit" INTEGER,
    "billPhotoFileId" TEXT,
    "enteredById" TEXT,
    "legalCheck" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DormUtilityRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DormAuthorityTariff" (
    "id" TEXT NOT NULL,
    "authority" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "tariffCode" TEXT NOT NULL,
    "label" TEXT,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "tiers" JSONB NOT NULL,
    "ftE4" INTEGER NOT NULL DEFAULT 0,
    "serviceSatang" INTEGER,
    "sourceUrl" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DormAuthorityTariff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DormBillRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "issueDate" DATE,
    "dueDate" DATE,
    "scheduledSendAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "billCount" INTEGER NOT NULL DEFAULT 0,
    "totalSatang" INTEGER NOT NULL DEFAULT 0,
    "progress" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DormBillRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DormBill" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "holdReason" TEXT,
    "lines" JSONB NOT NULL,
    "subtotalSatang" INTEGER NOT NULL,
    "vatSatang" INTEGER NOT NULL DEFAULT 0,
    "totalSatang" INTEGER NOT NULL,
    "paidSatang" INTEGER NOT NULL DEFAULT 0,
    "carriedSatang" INTEGER NOT NULL DEFAULT 0,
    "dueDate" DATE,
    "accountDocumentId" TEXT,
    "paymentRequestId" TEXT,
    "sentVia" TEXT,
    "sentAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "policySnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DormBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DormMoveOut" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOTICE',
    "noticeAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "moveOutDate" DATE NOT NULL,
    "inspection" JSONB,
    "deductions" JSONB,
    "depositSatang" INTEGER NOT NULL DEFAULT 0,
    "deductSatang" INTEGER NOT NULL DEFAULT 0,
    "refundSatang" INTEGER NOT NULL DEFAULT 0,
    "refundDueAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "settlementDocumentId" TEXT,
    "approvalId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DormMoveOut_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DormRepair" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "leaseId" TEXT,
    "partyId" TEXT,
    "category" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "files" JSONB,
    "preferredTime" TEXT,
    "allowEntry" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "kanbanCardId" TEXT,
    "doneAt" TIMESTAMP(3),
    "rating" INTEGER,
    "ratingNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DormRepair_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DormAnnouncement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'ALL',
    "audienceIds" JSONB,
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DormAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DormAnnouncementRead" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DormAnnouncementRead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DormParcel" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "leaseId" TEXT,
    "partyId" TEXT,
    "carrier" TEXT,
    "trackingNo" TEXT,
    "photoFileId" TEXT,
    "receivedById" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "pickedUpAt" TIMESTAMP(3),
    "pickedUpByPartyId" TEXT,
    "signatureFileId" TEXT,
    "lastRemindedAt" TIMESTAMP(3),
    "remindCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DormParcel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DormLease_tenantId_unitId_status_idx" ON "DormLease"("tenantId", "unitId", "status");

-- CreateIndex
CREATE INDEX "DormLease_roomId_idx" ON "DormLease"("roomId");

-- CreateIndex
CREATE INDEX "DormLease_partyId_idx" ON "DormLease"("partyId");

-- CreateIndex
CREATE INDEX "DormMeter_tenantId_unitId_idx" ON "DormMeter"("tenantId", "unitId");

-- CreateIndex
CREATE INDEX "DormMeterReading_tenantId_unitId_periodKey_idx" ON "DormMeterReading"("tenantId", "unitId", "periodKey");

-- CreateIndex
CREATE INDEX "DormMeterReading_meterId_readAt_idx" ON "DormMeterReading"("meterId", "readAt");

-- CreateIndex
CREATE INDEX "DormUtilityRate_tenantId_unitId_idx" ON "DormUtilityRate"("tenantId", "unitId");

-- CreateIndex
CREATE UNIQUE INDEX "DormAuthorityTariff_authority_kind_tariffCode_effectiveFrom_key" ON "DormAuthorityTariff"("authority", "kind", "tariffCode", "effectiveFrom");

-- CreateIndex
CREATE INDEX "DormBillRun_tenantId_unitId_status_idx" ON "DormBillRun"("tenantId", "unitId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DormBillRun_unitId_periodKey_key" ON "DormBillRun"("unitId", "periodKey");

-- CreateIndex
CREATE INDEX "DormBill_runId_idx" ON "DormBill"("runId");

-- CreateIndex
CREATE INDEX "DormBill_tenantId_unitId_periodKey_idx" ON "DormBill"("tenantId", "unitId", "periodKey");

-- CreateIndex
CREATE INDEX "DormBill_tenantId_unitId_status_idx" ON "DormBill"("tenantId", "unitId", "status");

-- CreateIndex
CREATE INDEX "DormBill_partyId_idx" ON "DormBill"("partyId");

-- CreateIndex
CREATE UNIQUE INDEX "DormBill_leaseId_periodKey_key" ON "DormBill"("leaseId", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "DormBill_accountDocumentId_key" ON "DormBill"("accountDocumentId");

-- CreateIndex
CREATE UNIQUE INDEX "DormMoveOut_leaseId_key" ON "DormMoveOut"("leaseId");

-- CreateIndex
CREATE INDEX "DormMoveOut_tenantId_unitId_status_idx" ON "DormMoveOut"("tenantId", "unitId", "status");

-- CreateIndex
CREATE INDEX "DormMoveOut_refundDueAt_idx" ON "DormMoveOut"("refundDueAt");

-- CreateIndex
CREATE INDEX "DormRepair_tenantId_unitId_status_idx" ON "DormRepair"("tenantId", "unitId", "status");

-- CreateIndex
CREATE INDEX "DormRepair_roomId_idx" ON "DormRepair"("roomId");

-- CreateIndex
CREATE INDEX "DormAnnouncement_tenantId_unitId_publishedAt_idx" ON "DormAnnouncement"("tenantId", "unitId", "publishedAt");

-- CreateIndex
CREATE INDEX "DormAnnouncementRead_tenantId_unitId_idx" ON "DormAnnouncementRead"("tenantId", "unitId");

-- CreateIndex
CREATE UNIQUE INDEX "DormAnnouncementRead_announcementId_partyId_key" ON "DormAnnouncementRead"("announcementId", "partyId");

-- CreateIndex
CREATE INDEX "DormParcel_tenantId_unitId_status_idx" ON "DormParcel"("tenantId", "unitId", "status");

-- CreateIndex
CREATE INDEX "DormParcel_roomId_idx" ON "DormParcel"("roomId");

-- CreateIndex
CREATE INDEX "HotelRoom_buildingId_idx" ON "HotelRoom"("buildingId");

-- CreateIndex
CREATE INDEX "RoomOccupancy_tenantId_refType_refId_idx" ON "RoomOccupancy"("tenantId", "refType", "refId");

-- CreateIndex
CREATE INDEX "RoomOccupancy_tenantId_unitId_startDate_idx" ON "RoomOccupancy"("tenantId", "unitId", "startDate");

-- CreateIndex
CREATE INDEX "IntegrationCallLog_at_idx" ON "IntegrationCallLog"("at");

-- AddForeignKey
ALTER TABLE "DormLease" ADD CONSTRAINT "DormLease_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "HotelRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DormMeter" ADD CONSTRAINT "DormMeter_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "HotelRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DormMeterReading" ADD CONSTRAINT "DormMeterReading_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "DormMeter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DormBill" ADD CONSTRAINT "DormBill_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DormBillRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DormBill" ADD CONSTRAINT "DormBill_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "DormLease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DormMoveOut" ADD CONSTRAINT "DormMoveOut_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "DormLease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DormAnnouncementRead" ADD CONSTRAINT "DormAnnouncementRead_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "DormAnnouncement"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ═══════════════ SQL มือ (prisma ประกาศ CHECK / partial / นิพจน์ / NULLS NOT DISTINCT ไม่ได้) ═══════════════
-- CHECK เฉพาะตารางใหม่ (ว่าง) — ตารางเดิมไม่มี CHECK ใหม่ในใบนี้

-- CHECK: DormLease (ใบสั่ง §2.1)
ALTER TABLE "DormLease" ADD CONSTRAINT "DormLease_status_check" CHECK ("status" IN ('DRAFT', 'ACTIVE', 'NOTICE', 'ENDED', 'CANCELLED'));
ALTER TABLE "DormLease" ADD CONSTRAINT "DormLease_dates_check" CHECK ("endDate" IS NULL OR "endDate" > "startDate");
ALTER TABLE "DormLease" ADD CONSTRAINT "DormLease_rentSatang_check" CHECK ("rentSatang" >= 0);
ALTER TABLE "DormLease" ADD CONSTRAINT "DormLease_commonFeeSatang_check" CHECK ("commonFeeSatang" >= 0);
ALTER TABLE "DormLease" ADD CONSTRAINT "DormLease_depositSatang_check" CHECK ("depositSatang" >= 0);
ALTER TABLE "DormLease" ADD CONSTRAINT "DormLease_advanceRentSatang_check" CHECK ("advanceRentSatang" >= 0);
ALTER TABLE "DormLease" ADD CONSTRAINT "DormLease_bookingFeeSatang_check" CHECK ("bookingFeeSatang" >= 0);

-- CHECK: DormMeter (ใบสั่ง §2.2)
ALTER TABLE "DormMeter" ADD CONSTRAINT "DormMeter_kind_check" CHECK ("kind" IN ('ELEC', 'WATER'));
ALTER TABLE "DormMeter" ADD CONSTRAINT "DormMeter_role_check" CHECK ("role" IN ('ROOM', 'MAIN'));
ALTER TABLE "DormMeter" ADD CONSTRAINT "DormMeter_role_room_check" CHECK (("role" = 'ROOM') = ("roomId" IS NOT NULL));
ALTER TABLE "DormMeter" ADD CONSTRAINT "DormMeter_digits_check" CHECK ("digits" IS NULL OR "digits" BETWEEN 1 AND 12);
ALTER TABLE "DormMeter" ADD CONSTRAINT "DormMeter_startReading_check" CHECK ("startReading" >= 0);

-- CHECK: DormMeterReading (ใบสั่ง §2.3)
ALTER TABLE "DormMeterReading" ADD CONSTRAINT "DormMeterReading_periodKey_check" CHECK ("periodKey" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "DormMeterReading" ADD CONSTRAINT "DormMeterReading_kind_check" CHECK ("kind" IN ('PERIOD', 'MOVE_IN', 'MOVE_OUT', 'REPLACE'));
ALTER TABLE "DormMeterReading" ADD CONSTRAINT "DormMeterReading_value_check" CHECK ("value" >= 0);
ALTER TABLE "DormMeterReading" ADD CONSTRAINT "DormMeterReading_source_check" CHECK ("source" IN ('MANUAL', 'AI', 'IOT', 'IMPORT'));

-- CHECK: DormUtilityRate (ใบสั่ง §2.4)
ALTER TABLE "DormUtilityRate" ADD CONSTRAINT "DormUtilityRate_kind_check" CHECK ("kind" IN ('ELEC', 'WATER'));
ALTER TABLE "DormUtilityRate" ADD CONSTRAINT "DormUtilityRate_periodKey_check" CHECK ("periodKey" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "DormUtilityRate" ADD CONSTRAINT "DormUtilityRate_mode_check" CHECK ("mode" IN ('ACTUAL_COST', 'TARIFF', 'FIXED_RATE', 'FLAT'));
ALTER TABLE "DormUtilityRate" ADD CONSTRAINT "DormUtilityRate_authorityBillSatang_check" CHECK ("authorityBillSatang" IS NULL OR "authorityBillSatang" >= 0);
ALTER TABLE "DormUtilityRate" ADD CONSTRAINT "DormUtilityRate_rateSatangPerUnit_check" CHECK ("rateSatangPerUnit" IS NULL OR "rateSatangPerUnit" >= 0);
ALTER TABLE "DormUtilityRate" ADD CONSTRAINT "DormUtilityRate_authorityUnits_check" CHECK ("authorityUnits" IS NULL OR "authorityUnits" >= 0);

-- CHECK: DormAuthorityTariff (ใบสั่ง §2.5 · ftE4 ติดลบได้ — ไม่มี CHECK)
ALTER TABLE "DormAuthorityTariff" ADD CONSTRAINT "DormAuthorityTariff_kind_check" CHECK ("kind" IN ('ELEC', 'WATER'));
ALTER TABLE "DormAuthorityTariff" ADD CONSTRAINT "DormAuthorityTariff_dates_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom");
ALTER TABLE "DormAuthorityTariff" ADD CONSTRAINT "DormAuthorityTariff_serviceSatang_check" CHECK ("serviceSatang" IS NULL OR "serviceSatang" >= 0);

-- CHECK: DormBillRun (ใบสั่ง §2.6)
ALTER TABLE "DormBillRun" ADD CONSTRAINT "DormBillRun_periodKey_check" CHECK ("periodKey" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "DormBillRun" ADD CONSTRAINT "DormBillRun_status_check" CHECK ("status" IN ('DRAFT', 'REVIEW', 'SENT', 'CLOSED'));
ALTER TABLE "DormBillRun" ADD CONSTRAINT "DormBillRun_billCount_check" CHECK ("billCount" >= 0);
ALTER TABLE "DormBillRun" ADD CONSTRAINT "DormBillRun_totalSatang_check" CHECK ("totalSatang" >= 0);

-- CHECK: DormBill (ใบสั่ง §2.7 · ไม่บังคับความสัมพันธ์ระหว่างยอด — จ่ายเกินได้)
ALTER TABLE "DormBill" ADD CONSTRAINT "DormBill_periodKey_check" CHECK ("periodKey" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "DormBill" ADD CONSTRAINT "DormBill_status_check" CHECK ("status" IN ('DRAFT', 'HELD', 'SENT', 'PARTIALLY_PAID', 'PAID', 'VOID'));
ALTER TABLE "DormBill" ADD CONSTRAINT "DormBill_subtotalSatang_check" CHECK ("subtotalSatang" >= 0);
ALTER TABLE "DormBill" ADD CONSTRAINT "DormBill_vatSatang_check" CHECK ("vatSatang" >= 0);
ALTER TABLE "DormBill" ADD CONSTRAINT "DormBill_totalSatang_check" CHECK ("totalSatang" >= 0);
ALTER TABLE "DormBill" ADD CONSTRAINT "DormBill_paidSatang_check" CHECK ("paidSatang" >= 0);
ALTER TABLE "DormBill" ADD CONSTRAINT "DormBill_carriedSatang_check" CHECK ("carriedSatang" >= 0);

-- CHECK: DormMoveOut (ใบสั่ง §2.8)
ALTER TABLE "DormMoveOut" ADD CONSTRAINT "DormMoveOut_status_check" CHECK ("status" IN ('NOTICE', 'INSPECTED', 'SETTLED', 'REFUNDED', 'CANCELLED'));
ALTER TABLE "DormMoveOut" ADD CONSTRAINT "DormMoveOut_depositSatang_check" CHECK ("depositSatang" >= 0);
ALTER TABLE "DormMoveOut" ADD CONSTRAINT "DormMoveOut_deductSatang_check" CHECK ("deductSatang" >= 0);
ALTER TABLE "DormMoveOut" ADD CONSTRAINT "DormMoveOut_refundSatang_check" CHECK ("refundSatang" >= 0);

-- CHECK: DormRepair · DormAnnouncement · DormParcel (ใบสั่ง §2.9–2.11)
ALTER TABLE "DormRepair" ADD CONSTRAINT "DormRepair_status_check" CHECK ("status" IN ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'));
ALTER TABLE "DormRepair" ADD CONSTRAINT "DormRepair_rating_check" CHECK ("rating" IS NULL OR "rating" BETWEEN 1 AND 5);
ALTER TABLE "DormAnnouncement" ADD CONSTRAINT "DormAnnouncement_audience_check" CHECK ("audience" IN ('ALL', 'BUILDING', 'FLOOR', 'ROOM'));
ALTER TABLE "DormParcel" ADD CONSTRAINT "DormParcel_status_check" CHECK ("status" IN ('WAITING', 'PICKED_UP', 'RETURNED'));
ALTER TABLE "DormParcel" ADD CONSTRAINT "DormParcel_remindCount_check" CHECK ("remindCount" >= 0);

-- partial unique: ห้อง 1 ห้อง มิเตอร์ไฟ/น้ำที่ใช้งานอยู่ชนิดละ 1 (ใบสั่ง §2.2 · เปลี่ยนมิเตอร์ = ตั้ง removedAt ตัวเก่าก่อน)
CREATE UNIQUE INDEX "DormMeter_roomId_kind_active_key" ON "DormMeter"("roomId", "kind") WHERE "removedAt" IS NULL AND "roomId" IS NOT NULL;

-- partial unique: เลขจดงวดละ 1 ต่อมิเตอร์ (ใบสั่ง §2.3 · ออฟไลน์ส่งซ้ำ idempotent · MOVE_IN/MOVE_OUT/REPLACE ไม่ชนงวด)
CREATE UNIQUE INDEX "DormMeterReading_meterId_periodKey_period_key" ON "DormMeterReading"("meterId", "periodKey") WHERE "kind" = 'PERIOD';

-- unique NULLS NOT DISTINCT: อัตราน้ำไฟ หน่วย×อาคาร×ชนิด×งวด (ใบสั่ง §2.4 · อาคาร null ห้ามซ้ำ · PG ≥ 15)
CREATE UNIQUE INDEX "DormUtilityRate_unitId_buildingId_kind_periodKey_key" ON "DormUtilityRate"("unitId", "buildingId", "kind", "periodKey") NULLS NOT DISTINCT;

-- หนี้ดัชนี R0.8 (ใบสั่ง §3 ข้อ 2): expireHolds (rooms/occupancy.ts) ค้นแถวถือห้องหมดอายุข้ามร้าน
CREATE INDEX "RoomOccupancy_holdExpiresAt_hold_idx" ON "RoomOccupancy"("holdExpiresAt") WHERE "active" AND "kind" IN ('HOLD', 'CHANNEL_HOLD');

-- หนี้ดัชนี R0.8 (ใบสั่ง §3 ข้อ 3 · มติผู้คุม): การจองโรงแรมถือห้องจริงได้ 1 แถว active
-- 🔴 prod: ก่อน deploy ตรวจซ้ำ  SELECT "refType","refId",count(*) FROM "RoomOccupancy" WHERE "active" AND "kind" = 'STAY' GROUP BY 1,2 HAVING count(*) > 1;  ต้องว่าง
CREATE UNIQUE INDEX "RoomOccupancy_refType_refId_stay_key" ON "RoomOccupancy"("refType", "refId") WHERE "active" AND "kind" = 'STAY';

-- หนี้ดัชนี R0.6 (ใบสั่ง §3 ข้อ 6): idempotencyKey ของสลิปต่อร้าน — slip-verify findByKey ค้นรูปนิพจน์เดียวกัน ($queryRaw)
-- 🔴 prod: ก่อน deploy ตรวจซ้ำ  SELECT "tenantId", "checks"->>'idempotencyKey', count(*) FROM "PaymentSlip" WHERE "checks" ? 'idempotencyKey' GROUP BY 1,2 HAVING count(*) > 1;  ต้องว่าง
CREATE UNIQUE INDEX "PaymentSlip_tenantId_idempotencyKey_key" ON "PaymentSlip"("tenantId", ("checks"->>'idempotencyKey'));

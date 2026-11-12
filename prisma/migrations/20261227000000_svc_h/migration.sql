-- SVC H.0 · migration svc_h — โรงแรม V2: ราคา (แผน/ฤดู/วันหยุด/ราคา/แก้มือ/กฎยกเลิก) · คืนรายแถว · folio · ทะเบียนแขก · แม่บ้าน · night audit · OTA 5 ตาราง
-- สร้างจาก: prisma migrate diff --from-schema <schema a9aad92d8> --to-schema prisma/schema --script (ไม่ใช้ migrate dev) + SQL มือท้ายไฟล์
-- additive ล้วน: ไม่มี DROP/RENAME/เปลี่ยนชนิด/SET NOT NULL/แก้ข้อมูล · ตารางเดิม (HotelReservation · HotelRoomType · HotelRoom) ได้แค่ ADD COLUMN (nullable/default) + ADD CONSTRAINT
-- 🔴 ALTER TYPE ADD VALUE 3 ค่าแยก statement · ห้ามใช้ค่าใหม่ใน migration นี้ (PG ห้ามใช้ค่า enum ใหม่ใน tx เดียวกัน) ⇒ backfill = scripts/svc-h0-backfill.mts (รันหลัง deploy · --dry ก่อน)
-- 🔴 deploy prod: ALTER TYPE ลงก่อน client ที่เขียน HOLD/CONFIRMED/NO_SHOW · รัน backfill --dry แล้วจริง · ตรวจ CONFLICT ก่อนปล่อย H.3

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "HotelReservationStatus" ADD VALUE 'HOLD';
ALTER TYPE "HotelReservationStatus" ADD VALUE 'CONFIRMED';
ALTER TYPE "HotelReservationStatus" ADD VALUE 'NO_SHOW';

-- AlterTable
ALTER TABLE "HotelRoomType" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "baseOccupancy" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "bedType" TEXT,
ADD COLUMN     "extraBedAllowed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "extraBedPriceSatang" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "images" JSONB,
ADD COLUMN     "maxOccupancy" INTEGER;

-- AlterTable
ALTER TABLE "HotelRoom" ADD COLUMN     "hkNote" TEXT,
ADD COLUMN     "hkUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "HotelReservation" ADD COLUMN     "channelConnectionId" TEXT,
ADD COLUMN     "channelRef" TEXT,
ADD COLUMN     "commissionSatang" INTEGER,
ADD COLUMN     "grossSatang" INTEGER,
ADD COLUMN     "groupId" TEXT,
ADD COLUMN     "holdExpiresAt" TIMESTAMP(3),
ADD COLUMN     "netSatang" INTEGER,
ADD COLUMN     "noShowAt" TIMESTAMP(3),
ADD COLUMN     "policySnapshot" JSONB,
ADD COLUMN     "prepaidByChannel" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ratePlanId" TEXT,
ADD COLUMN     "securityDepositSaleId" TEXT,
ADD COLUMN     "securityDepositSatang" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'WALK_IN',
ADD COLUMN     "taxSnapshot" JSONB;

-- CreateTable
CREATE TABLE "HotelRatePlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "includeBreakfast" BOOLEAN NOT NULL DEFAULT false,
    "minNights" INTEGER,
    "maxNights" INTEGER,
    "depositKind" TEXT NOT NULL DEFAULT 'FIRST_NIGHT',
    "depositValue" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "visibility" JSONB,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelRatePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelSeason" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dateStart" DATE NOT NULL,
    "dateEnd" DATE NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "minNights" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelSeason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelHoliday" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelRate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "ratePlanId" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    "seasonId" TEXT,
    "priceWeekdaySatang" INTEGER NOT NULL,
    "priceWeekendSatang" INTEGER NOT NULL,
    "priceHolidaySatang" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelRateOverride" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    "ratePlanId" TEXT,
    "date" DATE NOT NULL,
    "priceSatang" INTEGER NOT NULL,
    "reason" TEXT,
    "setById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelRateOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelCancelRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "ratePlanId" TEXT NOT NULL,
    "daysBefore" INTEGER NOT NULL,
    "refundBp" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelCancelRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelBookingNight" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    "roomId" TEXT,
    "date" DATE NOT NULL,
    "priceSatang" INTEGER NOT NULL,
    "ratePlanId" TEXT,
    "priceSource" TEXT NOT NULL DEFAULT 'RATE',
    "counted" BOOLEAN NOT NULL DEFAULT true,
    "postedAuditId" TEXT,
    "folioItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelBookingNight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelFolio" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "balanceSatang" INTEGER NOT NULL DEFAULT 0,
    "settledSaleId" TEXT,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelFolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelFolioItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "folioId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "unitAmountSatang" INTEGER NOT NULL,
    "amountSatang" INTEGER NOT NULL,
    "businessDate" DATE NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "postedById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "reversalOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelFolioItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelGuestRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "partyId" TEXT,
    "fullName" TEXT NOT NULL,
    "nationality" TEXT,
    "idType" TEXT,
    "idNumberEnc" TEXT,
    "idNumberLast4" TEXT,
    "dob" DATE,
    "arrivedFrom" TEXT,
    "nextDestination" TEXT,
    "idImageFileId" TEXT,
    "signatureFileId" TEXT,
    "isForeigner" BOOLEAN NOT NULL DEFAULT false,
    "tm30Status" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
    "tm30DueAt" TIMESTAMP(3),
    "tm30Ref" TEXT,
    "tm30FiledAt" TIMESTAMP(3),
    "rr3SignedAt" TIMESTAMP(3),
    "retainUntil" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelGuestRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelHousekeepingLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "byUserId" TEXT,
    "reservationId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelHousekeepingLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelNightAudit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CLOSED',
    "roomsTotal" INTEGER NOT NULL,
    "roomsOOO" INTEGER NOT NULL,
    "roomsAvailable" INTEGER NOT NULL,
    "roomsOccupied" INTEGER NOT NULL,
    "occupancyBps" INTEGER NOT NULL,
    "roomRevenueSatang" INTEGER NOT NULL,
    "adrSatang" INTEGER NOT NULL,
    "revparSatang" INTEGER NOT NULL,
    "arrivals" INTEGER NOT NULL DEFAULT 0,
    "departures" INTEGER NOT NULL DEFAULT 0,
    "noShowCount" INTEGER NOT NULL DEFAULT 0,
    "cancelledCount" INTEGER NOT NULL DEFAULT 0,
    "snapshot" JSONB,
    "closedById" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelNightAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelRoomMap" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    "externalRoomId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelRoomMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelRateMap" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "ratePlanId" TEXT NOT NULL,
    "externalRateId" TEXT NOT NULL,
    "formula" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelRateMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelAriJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "dateFrom" DATE NOT NULL,
    "dateTo" DATE NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelAriJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelReservationInbox" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "raw" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "reservationId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelReservationInbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelInventoryBuffer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    "rooms" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelInventoryBuffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HotelRatePlan_tenantId_unitId_status_idx" ON "HotelRatePlan"("tenantId", "unitId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HotelRatePlan_unitId_code_key" ON "HotelRatePlan"("unitId", "code");

-- CreateIndex
CREATE INDEX "HotelSeason_tenantId_unitId_dateStart_dateEnd_idx" ON "HotelSeason"("tenantId", "unitId", "dateStart", "dateEnd");

-- CreateIndex
CREATE UNIQUE INDEX "HotelHoliday_unitId_date_key" ON "HotelHoliday"("unitId", "date");

-- CreateIndex
CREATE INDEX "HotelRate_tenantId_unitId_idx" ON "HotelRate"("tenantId", "unitId");

-- CreateIndex
-- SQL มือ (แก้จากที่ diff สร้าง): NULLS NOT DISTINCT — แถว seasonId null = ราคาปกติ 1 แถวต่อแผน×ประเภทห้อง (PG ≥ 15)
CREATE UNIQUE INDEX "HotelRate_ratePlanId_roomTypeId_seasonId_key" ON "HotelRate"("ratePlanId", "roomTypeId", "seasonId") NULLS NOT DISTINCT;

-- CreateIndex
CREATE INDEX "HotelRateOverride_tenantId_unitId_date_idx" ON "HotelRateOverride"("tenantId", "unitId", "date");

-- CreateIndex
-- SQL มือ (แก้จากที่ diff สร้าง): NULLS NOT DISTINCT — ratePlanId null (ทุกแผน) วันเดียวกัน 1 แถวต่อประเภทห้อง
CREATE UNIQUE INDEX "HotelRateOverride_roomTypeId_ratePlanId_date_key" ON "HotelRateOverride"("roomTypeId", "ratePlanId", "date") NULLS NOT DISTINCT;

-- CreateIndex
CREATE UNIQUE INDEX "HotelCancelRule_ratePlanId_daysBefore_key" ON "HotelCancelRule"("ratePlanId", "daysBefore");

-- CreateIndex
CREATE INDEX "HotelBookingNight_unitId_roomTypeId_date_counted_idx" ON "HotelBookingNight"("unitId", "roomTypeId", "date", "counted");

-- CreateIndex
CREATE INDEX "HotelBookingNight_unitId_roomId_date_idx" ON "HotelBookingNight"("unitId", "roomId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "HotelBookingNight_reservationId_date_key" ON "HotelBookingNight"("reservationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "HotelFolio_reservationId_key" ON "HotelFolio"("reservationId");

-- CreateIndex
CREATE INDEX "HotelFolio_tenantId_unitId_status_idx" ON "HotelFolio"("tenantId", "unitId", "status");

-- CreateIndex
CREATE INDEX "HotelFolioItem_folioId_businessDate_idx" ON "HotelFolioItem"("folioId", "businessDate");

-- CreateIndex
CREATE INDEX "HotelFolioItem_tenantId_unitId_refType_refId_idx" ON "HotelFolioItem"("tenantId", "unitId", "refType", "refId");

-- CreateIndex
CREATE INDEX "HotelGuestRecord_reservationId_idx" ON "HotelGuestRecord"("reservationId");

-- CreateIndex
CREATE INDEX "HotelGuestRecord_tenantId_unitId_tm30Status_tm30DueAt_idx" ON "HotelGuestRecord"("tenantId", "unitId", "tm30Status", "tm30DueAt");

-- CreateIndex
CREATE INDEX "HotelGuestRecord_retainUntil_idx" ON "HotelGuestRecord"("retainUntil");

-- CreateIndex
CREATE INDEX "HotelHousekeepingLog_tenantId_unitId_createdAt_idx" ON "HotelHousekeepingLog"("tenantId", "unitId", "createdAt");

-- CreateIndex
CREATE INDEX "HotelHousekeepingLog_roomId_createdAt_idx" ON "HotelHousekeepingLog"("roomId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "HotelNightAudit_unitId_businessDate_key" ON "HotelNightAudit"("unitId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelRoomMap_connectionId_roomTypeId_key" ON "ChannelRoomMap"("connectionId", "roomTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelRoomMap_connectionId_externalRoomId_key" ON "ChannelRoomMap"("connectionId", "externalRoomId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelRateMap_connectionId_ratePlanId_key" ON "ChannelRateMap"("connectionId", "ratePlanId");

-- CreateIndex
CREATE INDEX "ChannelAriJob_connectionId_status_createdAt_idx" ON "ChannelAriJob"("connectionId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ChannelReservationInbox_tenantId_unitId_status_idx" ON "ChannelReservationInbox"("tenantId", "unitId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelReservationInbox_connectionId_externalId_version_key" ON "ChannelReservationInbox"("connectionId", "externalId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelInventoryBuffer_connectionId_roomTypeId_key" ON "ChannelInventoryBuffer"("connectionId", "roomTypeId");

-- CreateIndex
CREATE INDEX "HotelReservation_unitId_groupId_idx" ON "HotelReservation"("unitId", "groupId");

-- CreateIndex
CREATE INDEX "HotelReservation_status_holdExpiresAt_idx" ON "HotelReservation"("status", "holdExpiresAt");

-- AddForeignKey
ALTER TABLE "HotelReservation" ADD CONSTRAINT "HotelReservation_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "HotelRatePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelRate" ADD CONSTRAINT "HotelRate_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "HotelRatePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelRate" ADD CONSTRAINT "HotelRate_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "HotelRoomType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelRate" ADD CONSTRAINT "HotelRate_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "HotelSeason"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelRateOverride" ADD CONSTRAINT "HotelRateOverride_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "HotelRoomType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelCancelRule" ADD CONSTRAINT "HotelCancelRule_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "HotelRatePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelBookingNight" ADD CONSTRAINT "HotelBookingNight_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "HotelReservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelFolio" ADD CONSTRAINT "HotelFolio_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "HotelReservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelFolioItem" ADD CONSTRAINT "HotelFolioItem_folioId_fkey" FOREIGN KEY ("folioId") REFERENCES "HotelFolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelGuestRecord" ADD CONSTRAINT "HotelGuestRecord_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "HotelReservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelHousekeepingLog" ADD CONSTRAINT "HotelHousekeepingLog_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "HotelRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelRoomMap" ADD CONSTRAINT "ChannelRoomMap_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "HotelRoomType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelRateMap" ADD CONSTRAINT "ChannelRateMap_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "HotelRatePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelInventoryBuffer" ADD CONSTRAINT "ChannelInventoryBuffer_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "HotelRoomType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ═══════════════ SQL มือ (prisma ประกาศ CHECK / partial unique ไม่ได้) ═══════════════
-- ตารางใหม่ว่าง · ตารางเดิม HotelReservation ได้ CHECK เฉพาะคอลัมน์ใหม่ที่มี default (แถวเดิม = 'WALK_IN' ผ่าน)

-- CHECK: HotelReservation (ใบสั่ง §2.1)
ALTER TABLE "HotelReservation" ADD CONSTRAINT "HotelReservation_source_check" CHECK ("source" IN ('WEB', 'WALK_IN', 'PHONE', 'LINE', 'OTA'));

-- CHECK: HotelRatePlan (ใบสั่ง §2.4)
ALTER TABLE "HotelRatePlan" ADD CONSTRAINT "HotelRatePlan_depositKind_check" CHECK ("depositKind" IN ('NONE', 'FIRST_NIGHT', 'FULL', 'PERCENT', 'FIXED_AMOUNT'));
ALTER TABLE "HotelRatePlan" ADD CONSTRAINT "HotelRatePlan_status_check" CHECK ("status" IN ('ACTIVE', 'ARCHIVED'));

-- CHECK: HotelSeason (ใบสั่ง §2.5 · dateEnd รวมวันจบ ⇒ เท่ากันได้ · minNights มติ §12 ข้อ 10)
ALTER TABLE "HotelSeason" ADD CONSTRAINT "HotelSeason_status_check" CHECK ("status" IN ('ACTIVE', 'ARCHIVED'));
ALTER TABLE "HotelSeason" ADD CONSTRAINT "HotelSeason_dates_check" CHECK ("dateEnd" >= "dateStart");
ALTER TABLE "HotelSeason" ADD CONSTRAINT "HotelSeason_minNights_check" CHECK ("minNights" IS NULL OR "minNights" >= 1);

-- CHECK: HotelRate (ใบสั่ง §2.7 · holiday null = ใช้ราคาวันหยุดสุดสัปดาห์/ปกติ)
ALTER TABLE "HotelRate" ADD CONSTRAINT "HotelRate_priceWeekdaySatang_check" CHECK ("priceWeekdaySatang" >= 0);
ALTER TABLE "HotelRate" ADD CONSTRAINT "HotelRate_priceWeekendSatang_check" CHECK ("priceWeekendSatang" >= 0);
ALTER TABLE "HotelRate" ADD CONSTRAINT "HotelRate_priceHolidaySatang_check" CHECK ("priceHolidaySatang" IS NULL OR "priceHolidaySatang" >= 0);

-- CHECK: HotelRateOverride (ใบสั่ง §2.8)
ALTER TABLE "HotelRateOverride" ADD CONSTRAINT "HotelRateOverride_priceSatang_check" CHECK ("priceSatang" >= 0);

-- CHECK: HotelCancelRule (ใบสั่ง §2.9)
ALTER TABLE "HotelCancelRule" ADD CONSTRAINT "HotelCancelRule_daysBefore_check" CHECK ("daysBefore" BETWEEN 0 AND 365);
ALTER TABLE "HotelCancelRule" ADD CONSTRAINT "HotelCancelRule_refundBp_check" CHECK ("refundBp" BETWEEN 0 AND 10000);

-- CHECK: HotelBookingNight (ใบสั่ง §2.10)
ALTER TABLE "HotelBookingNight" ADD CONSTRAINT "HotelBookingNight_priceSatang_check" CHECK ("priceSatang" >= 0);
ALTER TABLE "HotelBookingNight" ADD CONSTRAINT "HotelBookingNight_priceSource_check" CHECK ("priceSource" IN ('RATE', 'OVERRIDE', 'FALLBACK', 'MANUAL'));

-- CHECK: HotelFolio · HotelFolioItem (ใบสั่ง §2.11 · amount ติดลบได้ = จ่าย/คืน)
ALTER TABLE "HotelFolio" ADD CONSTRAINT "HotelFolio_status_check" CHECK ("status" IN ('OPEN', 'SETTLED', 'VOID'));
ALTER TABLE "HotelFolioItem" ADD CONSTRAINT "HotelFolioItem_type_check" CHECK ("type" IN ('ROOM', 'SERVICE', 'POS_CHARGE', 'MINIBAR', 'DISCOUNT', 'TAX', 'SERVICE_CHARGE', 'DEPOSIT', 'PAYMENT', 'REFUND', 'PENALTY', 'SECURITY_DEPOSIT', 'SECURITY_REFUND', 'VOID_REVERSAL'));

-- CHECK: HotelGuestRecord (ใบสั่ง §2.12 · idType null ได้)
ALTER TABLE "HotelGuestRecord" ADD CONSTRAINT "HotelGuestRecord_idType_check" CHECK ("idType" IS NULL OR "idType" IN ('PASSPORT', 'THAI_ID', 'OTHER'));
ALTER TABLE "HotelGuestRecord" ADD CONSTRAINT "HotelGuestRecord_tm30Status_check" CHECK ("tm30Status" IN ('NOT_REQUIRED', 'PENDING', 'FILED', 'LATE'));

-- CHECK: HotelNightAudit (ใบสั่ง §2.13)
ALTER TABLE "HotelNightAudit" ADD CONSTRAINT "HotelNightAudit_status_check" CHECK ("status" IN ('CLOSED', 'REOPENED'));

-- CHECK: ช่องทาง OTA (ใบสั่ง §2.14)
ALTER TABLE "ChannelAriJob" ADD CONSTRAINT "ChannelAriJob_status_check" CHECK ("status" IN ('PENDING', 'SENT', 'FAILED', 'SUPERSEDED'));
ALTER TABLE "ChannelReservationInbox" ADD CONSTRAINT "ChannelReservationInbox_status_check" CHECK ("status" IN ('RECEIVED', 'APPLIED', 'NEEDS_ROOM', 'REJECTED'));
ALTER TABLE "ChannelInventoryBuffer" ADD CONSTRAINT "ChannelInventoryBuffer_rooms_check" CHECK ("rooms" >= 0);

-- partial unique: แผนเริ่มต้น 1 แผนต่อหน่วย (ใบสั่ง §2.4 · แผน ARCHIVED ที่เคยเป็นค่าเริ่มไม่ชน)
CREATE UNIQUE INDEX "HotelRatePlan_unitId_default_key" ON "HotelRatePlan"("unitId") WHERE "isDefault" AND "status" = 'ACTIVE';

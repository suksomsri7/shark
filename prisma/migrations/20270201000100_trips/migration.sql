-- TRIPS T0.1 · migration trips — ตาราง 34 ตัว (trips.prisma 32 + sellable.prisma 2) + AccountDocument.passThroughSatang + SQL มือท้ายไฟล์
-- สร้างจาก: prisma migrate diff --from-schema <schema f1c567c94> --to-schema prisma/schema --script (ไม่ใช้ migrate dev) · ADD VALUE ย้ายไป 20270201000000_trips_enum
-- additive ล้วน: ตารางใหม่ + ดัชนีของตารางใหม่ + คอลัมน์ใหม่ 1 ตัวบน AccountDocument (NOT NULL DEFAULT 0 · metadata อย่างเดียวบน PG ≥ 11) · ไม่มีคำสั่งลบ/เปลี่ยนชื่อ/เปลี่ยนชนิด · ไม่แก้ข้อมูล
-- ไม่มี FK เข้า/ออกตารางใหม่ (id หลวม · ใบสั่ง §7 ข้อ 21) · ไม่ใช้ค่า enum ใหม่ในไฟล์นี้
-- lock_timeout: AccountDocument เป็นตารางที่ใช้งานหนัก — รอล็อกไม่เกิน 5 วิ แล้วล้ม (ไม่ต่อคิวขวางผู้เขียนอื่น) · deploy นอกเวลาเร่งด่วน

-- AlterTable
SET lock_timeout = '5s';
ALTER TABLE "AccountDocument" ADD COLUMN     "passThroughSatang" INTEGER NOT NULL DEFAULT 0;
RESET lock_timeout;

-- CreateTable
CREATE TABLE "SellBasket" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "agentAccountId" TEXT,
    "status" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "publicTokenHash" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT,
    "attribution" JSONB,
    "unitIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellBasket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellCounter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SellCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripProduct" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "productType" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "supplierId" TEXT,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "title" JSONB NOT NULL,
    "body" JSONB NOT NULL,
    "currency" TEXT NOT NULL,
    "vesselId" TEXT,
    "meetingPoint" JSONB,
    "disclosure" JSONB,
    "formSpec" JSONB,
    "deepDive" BOOLEAN NOT NULL DEFAULT false,
    "crossBorder" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripOption" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "durationMin" INTEGER,
    "nights" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripPaxType" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" JSONB NOT NULL,
    "ageMin" INTEGER,
    "ageMax" INTEGER,
    "countsCapacity" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripPaxType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripExtra" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "productId" TEXT,
    "kind" TEXT NOT NULL,
    "basis" TEXT NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "priceMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "commissionable" BOOLEAN NOT NULL DEFAULT false,
    "discountable" BOOLEAN NOT NULL DEFAULT false,
    "passThrough" BOOLEAN NOT NULL DEFAULT false,
    "taxKind" TEXT NOT NULL,
    "stockItemId" TEXT,
    "name" JSONB NOT NULL DEFAULT '{}',
    "note" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "paxPrices" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripExtra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripPassThroughEvidence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "departureId" TEXT,
    "bookingId" TEXT,
    "extraKind" TEXT NOT NULL,
    "paidToPayee" TEXT NOT NULL,
    "amountSatang" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "fileIds" TEXT[],
    "accountDocId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripPassThroughEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripPickupZone" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pickupOffsetMin" INTEGER NOT NULL,
    "surchargeSatang" INTEGER NOT NULL,
    "polygon" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripPickupZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripSchedule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "optionId" TEXT,
    "rule" JSONB NOT NULL,
    "exceptions" JSONB NOT NULL,
    "departTimeMin" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL,
    "minPax" INTEGER,
    "resourceIds" TEXT[],
    "dateFrom" DATE NOT NULL,
    "dateTo" DATE,
    "pausedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripDeparture" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "optionId" TEXT,
    "scheduleId" TEXT,
    "localDate" DATE NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "sold" INTEGER NOT NULL DEFAULT 0,
    "held" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "minPax" INTEGER,
    "cutoffAt" TIMESTAMP(3),
    "vesselId" TEXT,
    "deckPlanVersionId" TEXT,
    "insurance" JSONB,
    "stopSell" JSONB,
    "version" INTEGER NOT NULL DEFAULT 0,
    "guaranteedAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripDeparture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripResource" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "seats" INTEGER,
    "hrEmployeeId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripResourceUse" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "departureId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripResourceUse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripVehicleRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "departureId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "driverEmployeeId" TEXT,
    "stops" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripVehicleRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripSeason" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dateStart" DATE NOT NULL,
    "dateEnd" DATE NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripSeason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripPrice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "optionId" TEXT,
    "paxTypeId" TEXT,
    "cabinTypeId" TEXT,
    "seasonId" TEXT,
    "departureId" TEXT,
    "currency" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "weekdayMask" INTEGER,
    "bookFrom" DATE,
    "bookTo" DATE,
    "travelFrom" DATE,
    "travelTo" DATE,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripPriceRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "productId" TEXT,
    "kind" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "code" TEXT,
    "dateFrom" DATE,
    "dateTo" DATE,
    "bookFrom" DATE,
    "bookTo" DATE,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripPriceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripPromoRedemption" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "contactKeyHash" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "discountSatang" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripPromoRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripHold" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "departureId" TEXT NOT NULL,
    "basketId" TEXT,
    "bookingId" TEXT,
    "channel" TEXT NOT NULL,
    "agentAccountId" TEXT,
    "allotmentId" TEXT,
    "qtyPublic" INTEGER NOT NULL DEFAULT 0,
    "qtyAllot" INTEGER NOT NULL DEFAULT 0,
    "unitIds" TEXT[],
    "purpose" TEXT NOT NULL,
    "capKeyHash" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "releasedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripBooking" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "publicTokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "departureId" TEXT NOT NULL,
    "travelDate" DATE NOT NULL,
    "basketId" TEXT,
    "channel" TEXT NOT NULL,
    "agentAccountId" TEXT,
    "agentUserId" TEXT,
    "salesStaffId" TEXT,
    "linkId" TEXT,
    "collectMode" TEXT NOT NULL,
    "payMethod" TEXT NOT NULL,
    "bookerPartyId" TEXT,
    "marketingEligible" BOOLEAN NOT NULL DEFAULT false,
    "contactRoute" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "fxRateMicros" INTEGER,
    "grossSatang" INTEGER NOT NULL,
    "discountSatang" INTEGER NOT NULL,
    "agentDiscountSatang" INTEGER NOT NULL,
    "passThroughSatang" INTEGER NOT NULL,
    "vatSatang" INTEGER NOT NULL,
    "commissionSatang" INTEGER NOT NULL,
    "commissionVatSatang" INTEGER NOT NULL,
    "whtSatang" INTEGER NOT NULL,
    "netToShopSatang" INTEGER NOT NULL,
    "agentActualSaleSatang" INTEGER,
    "paidSatang" INTEGER NOT NULL DEFAULT 0,
    "refundedSatang" INTEGER NOT NULL DEFAULT 0,
    "accountingState" TEXT NOT NULL,
    "policySnapshot" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "cancelReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "travelledAt" TIMESTAMP(3),
    "piiPurgedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripBookingItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "departureId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "paxTypeId" TEXT,
    "extraId" TEXT,
    "tripUnitId" TEXT,
    "qty" INTEGER NOT NULL,
    "unitPriceMinor" INTEGER NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "amountSatang" INTEGER NOT NULL,
    "vatSatang" INTEGER NOT NULL,
    "commissionable" BOOLEAN NOT NULL DEFAULT false,
    "discountable" BOOLEAN NOT NULL DEFAULT false,
    "passThrough" BOOLEAN NOT NULL DEFAULT false,
    "taxKind" TEXT NOT NULL,
    "priceSource" TEXT NOT NULL,
    "allotmentId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripBookingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripPassenger" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "itemId" TEXT,
    "partyId" TEXT,
    "fullName" TEXT NOT NULL,
    "nationality" TEXT,
    "dob" DATE,
    "sex" TEXT,
    "docType" TEXT,
    "docNumberEnc" TEXT,
    "docLast4" TEXT,
    "docExpiry" DATE,
    "diver" BOOLEAN,
    "phone" TEXT,
    "birthPlace" TEXT,
    "certLevel" TEXT,
    "diveCount" INTEGER,
    "lastDiveAt" TIMESTAMP(3),
    "isMinor" BOOLEAN NOT NULL DEFAULT false,
    "guardianConsent" JSONB,
    "answers" JSONB NOT NULL,
    "formStatus" TEXT NOT NULL,
    "waiverSignedAt" TIMESTAMP(3),
    "waiverEvidence" JSONB,
    "checkinAt" TIMESTAMP(3),
    "retainUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripPassenger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripPaymentDue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "passengerId" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "amountSatang" INTEGER NOT NULL,
    "vatableSatang" INTEGER NOT NULL,
    "passThroughSatang" INTEGER NOT NULL,
    "amountMinor" INTEGER,
    "paidSatang" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "payTokenHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripPaymentDue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripMoneyEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amountSatang" INTEGER NOT NULL,
    "vatSatang" INTEGER NOT NULL,
    "passThroughSatang" INTEGER NOT NULL,
    "dueId" TEXT,
    "tender" TEXT NOT NULL,
    "accountDocId" TEXT,
    "accountEntryId" TEXT,
    "postingStatus" TEXT NOT NULL,
    "postingAttempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "postedDate" DATE,
    "slipId" TEXT,
    "whtByCustomerSatang" INTEGER,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripMoneyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripRefundRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "by" TEXT NOT NULL,
    "reasonKind" TEXT NOT NULL,
    "deductions" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "computed" JSONB NOT NULL,
    "choice" TEXT NOT NULL,
    "amountSatang" INTEGER NOT NULL,
    "manualDeltaSatang" INTEGER NOT NULL DEFAULT 0,
    "approvalId" TEXT,
    "creditNoteDocId" TEXT,
    "damagesDocId" TEXT,
    "decidedById" TEXT,
    "idempotencyKey" TEXT,
    "requestHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripRefundRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "passengerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "consent" JSONB,
    "retainUntil" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripDocView" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "viewerKind" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripDocView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripPdpaRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "passengerId" TEXT,
    "partyId" TEXT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripPdpaRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripCashClose" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "financeAccountId" TEXT NOT NULL,
    "expectedSatang" INTEGER NOT NULL,
    "countedSatang" INTEGER NOT NULL,
    "varianceSatang" INTEGER NOT NULL,
    "countedById" TEXT NOT NULL,
    "varianceEntryId" TEXT,
    "transferId" TEXT,
    "approvalId" TEXT,
    "closedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripCashClose_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripCheckin" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "passengerId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripCheckin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripWaitlist" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "departureId" TEXT NOT NULL,
    "partyId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'WEB',
    "qty" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "offerHoldId" TEXT,
    "offerExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripWaitlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripCost" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "departureId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amountSatang" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripUnit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "departureId" TEXT NOT NULL,
    "berthId" TEXT NOT NULL,
    "cabinId" TEXT NOT NULL,
    "sortKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "holdId" TEXT,
    "bookingItemId" TEXT,
    "allotmentId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripImportBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "mapping" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "createdRefs" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripLinkStat" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "channel" TEXT NOT NULL,
    "linkId" TEXT,
    "agentAccountId" TEXT,
    "views" INTEGER NOT NULL DEFAULT 0,
    "starts" INTEGER NOT NULL DEFAULT 0,
    "paid" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripLinkStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SellBasket_status_expiresAt_idx" ON "SellBasket"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "SellBasket_tenantId_idempotencyKey_key" ON "SellBasket"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "SellBasket_publicTokenHash_key" ON "SellBasket"("publicTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "SellCounter_tenantId_series_period_key" ON "SellCounter"("tenantId", "series", "period");

-- CreateIndex
CREATE INDEX "TripProduct_tenantId_unitId_status_idx" ON "TripProduct"("tenantId", "unitId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TripProduct_tenantId_slug_key" ON "TripProduct"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "TripOption_productId_active_idx" ON "TripOption"("productId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "TripPaxType_productId_code_key" ON "TripPaxType"("productId", "code");

-- CreateIndex
CREATE INDEX "TripExtra_tenantId_unitId_productId_idx" ON "TripExtra"("tenantId", "unitId", "productId");

-- CreateIndex
CREATE INDEX "TripPassThroughEvidence_departureId_idx" ON "TripPassThroughEvidence"("departureId");

-- CreateIndex
CREATE INDEX "TripPassThroughEvidence_bookingId_idx" ON "TripPassThroughEvidence"("bookingId");

-- CreateIndex
CREATE INDEX "TripPickupZone_tenantId_unitId_idx" ON "TripPickupZone"("tenantId", "unitId");

-- CreateIndex
CREATE INDEX "TripSchedule_productId_idx" ON "TripSchedule"("productId");

-- CreateIndex
CREATE INDEX "TripDeparture_productId_optionId_startsAt_idx" ON "TripDeparture"("productId", "optionId", "startsAt");

-- CreateIndex
CREATE INDEX "TripDeparture_tenantId_unitId_localDate_idx" ON "TripDeparture"("tenantId", "unitId", "localDate");

-- CreateIndex
CREATE INDEX "TripDeparture_productId_localDate_status_idx" ON "TripDeparture"("productId", "localDate", "status");

-- CreateIndex
CREATE INDEX "TripResource_tenantId_unitId_kind_idx" ON "TripResource"("tenantId", "unitId", "kind");

-- CreateIndex
CREATE INDEX "TripResourceUse_resourceId_idx" ON "TripResourceUse"("resourceId");

-- CreateIndex
CREATE INDEX "TripResourceUse_departureId_idx" ON "TripResourceUse"("departureId");

-- CreateIndex
CREATE INDEX "TripVehicleRun_departureId_idx" ON "TripVehicleRun"("departureId");

-- CreateIndex
CREATE INDEX "TripSeason_tenantId_unitId_dateStart_dateEnd_idx" ON "TripSeason"("tenantId", "unitId", "dateStart", "dateEnd");

-- CreateIndex
CREATE INDEX "TripPrice_productId_idx" ON "TripPrice"("productId");

-- CreateIndex
CREATE INDEX "TripPriceRule_tenantId_unitId_kind_active_idx" ON "TripPriceRule"("tenantId", "unitId", "kind", "active");

-- CreateIndex
CREATE INDEX "TripPromoRedemption_ruleId_contactKeyHash_status_idx" ON "TripPromoRedemption"("ruleId", "contactKeyHash", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TripPromoRedemption_ruleId_bookingId_key" ON "TripPromoRedemption"("ruleId", "bookingId");

-- CreateIndex
CREATE INDEX "TripHold_departureId_status_idx" ON "TripHold"("departureId", "status");

-- CreateIndex
CREATE INDEX "TripHold_bookingId_idx" ON "TripHold"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "TripHold_tenantId_idempotencyKey_key" ON "TripHold"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "TripBooking_tenantId_unitId_status_travelDate_idx" ON "TripBooking"("tenantId", "unitId", "status", "travelDate");

-- CreateIndex
CREATE INDEX "TripBooking_departureId_status_idx" ON "TripBooking"("departureId", "status");

-- CreateIndex
CREATE INDEX "TripBooking_agentAccountId_createdAt_idx" ON "TripBooking"("agentAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "TripBooking_bookerPartyId_idx" ON "TripBooking"("bookerPartyId");

-- CreateIndex
CREATE UNIQUE INDEX "TripBooking_tenantId_code_key" ON "TripBooking"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "TripBooking_publicTokenHash_key" ON "TripBooking"("publicTokenHash");

-- CreateIndex
CREATE INDEX "TripBookingItem_bookingId_idx" ON "TripBookingItem"("bookingId");

-- CreateIndex
CREATE INDEX "TripBookingItem_departureId_active_idx" ON "TripBookingItem"("departureId", "active");

-- CreateIndex
CREATE INDEX "TripPassenger_bookingId_idx" ON "TripPassenger"("bookingId");

-- CreateIndex
CREATE INDEX "TripPassenger_retainUntil_idx" ON "TripPassenger"("retainUntil");

-- CreateIndex
CREATE INDEX "TripPaymentDue_status_dueAt_idx" ON "TripPaymentDue"("status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "TripPaymentDue_bookingId_seq_key" ON "TripPaymentDue"("bookingId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "TripPaymentDue_payTokenHash_key" ON "TripPaymentDue"("payTokenHash");

-- CreateIndex
CREATE INDEX "TripMoneyEvent_bookingId_idx" ON "TripMoneyEvent"("bookingId");

-- CreateIndex
CREATE INDEX "TripMoneyEvent_tenantId_postingStatus_idx" ON "TripMoneyEvent"("tenantId", "postingStatus");

-- CreateIndex
CREATE INDEX "TripMoneyEvent_postingStatus_nextAttemptAt_idx" ON "TripMoneyEvent"("postingStatus", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "TripMoneyEvent_tenantId_idempotencyKey_key" ON "TripMoneyEvent"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "TripRefundRequest_tenantId_unitId_status_idx" ON "TripRefundRequest"("tenantId", "unitId", "status");

-- CreateIndex
CREATE INDEX "TripRefundRequest_bookingId_idx" ON "TripRefundRequest"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "TripRefundRequest_tenantId_idempotencyKey_key" ON "TripRefundRequest"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "TripDocument_retainUntil_deletedAt_idx" ON "TripDocument"("retainUntil", "deletedAt");

-- CreateIndex
CREATE INDEX "TripDocument_passengerId_idx" ON "TripDocument"("passengerId");

-- CreateIndex
CREATE INDEX "TripDocView_documentId_at_idx" ON "TripDocView"("documentId", "at");

-- CreateIndex
CREATE INDEX "TripPdpaRequest_tenantId_status_dueAt_idx" ON "TripPdpaRequest"("tenantId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "TripCashClose_unitId_businessDate_key" ON "TripCashClose"("unitId", "businessDate");

-- CreateIndex
CREATE INDEX "TripCheckin_passengerId_idx" ON "TripCheckin"("passengerId");

-- CreateIndex
CREATE INDEX "TripWaitlist_departureId_status_idx" ON "TripWaitlist"("departureId", "status");

-- CreateIndex
CREATE INDEX "TripCost_departureId_idx" ON "TripCost"("departureId");

-- CreateIndex
CREATE INDEX "TripUnit_departureId_status_idx" ON "TripUnit"("departureId", "status");

-- CreateIndex
CREATE INDEX "TripUnit_allotmentId_idx" ON "TripUnit"("allotmentId");

-- CreateIndex
CREATE INDEX "TripUnit_holdId_idx" ON "TripUnit"("holdId");

-- CreateIndex
CREATE UNIQUE INDEX "TripUnit_departureId_berthId_key" ON "TripUnit"("departureId", "berthId");

-- CreateIndex
CREATE INDEX "TripImportBatch_tenantId_unitId_status_idx" ON "TripImportBatch"("tenantId", "unitId", "status");

-- CreateIndex
CREATE INDEX "TripLinkStat_tenantId_unitId_day_idx" ON "TripLinkStat"("tenantId", "unitId", "day");


-- ═════════════════════════ SQL มือ (ใบสั่ง T0.1 §2 ข้อ 3 · CC §B.0) — 🔴 ห้ามลบ · Prisma ประกาศ CHECK/partial/NULLS NOT DISTINCT/EXCLUDE ไม่ได้ ═════════════════════════

-- CHECK ชุดค่าสถานะ/ชนิด (ใบสั่ง §4.1 · CC §B.1 §N.1 §G.1 §G.3 · channel = SELL_CHANNELS ของ core/sellable.ts)
ALTER TABLE "SellBasket" ADD CONSTRAINT "SellBasket_status_check" CHECK ("status" IN ('OPEN', 'CHECKED_OUT', 'EXPIRED', 'ABANDONED'));
ALTER TABLE "SellBasket" ADD CONSTRAINT "SellBasket_channel_check" CHECK ("channel" IN ('WEB', 'LIFF', 'EMBED', 'COUNTER', 'POS', 'AGENT_PORTAL', 'AGENT_LINK', 'AGENT_API', 'OTA', 'API', 'IMPORT', 'CHAT_AI'));
ALTER TABLE "TripProduct" ADD CONSTRAINT "TripProduct_productType_check" CHECK ("productType" IN ('TOUR', 'LIVEABOARD', 'ATTRACTION'));
ALTER TABLE "TripProduct" ADD CONSTRAINT "TripProduct_sourceKind_check" CHECK ("sourceKind" IN ('OWN', 'SUPPLIER'));
ALTER TABLE "TripProduct" ADD CONSTRAINT "TripProduct_status_check" CHECK ("status" IN ('DRAFT', 'ACTIVE', 'ARCHIVED'));
ALTER TABLE "TripExtra" ADD CONSTRAINT "TripExtra_kind_check" CHECK ("kind" IN ('PARK_FEE', 'PORT_FEE', 'FUEL', 'EQUIPMENT', 'NITROX', 'TRANSFER', 'COURSE', 'INSURANCE', 'OTHER'));
ALTER TABLE "TripExtra" ADD CONSTRAINT "TripExtra_basis_check" CHECK ("basis" IN ('PER_PAX', 'PER_BOOKING', 'PER_DAY', 'PER_PAX_DAY', 'PER_BOAT_NIGHT'));
ALTER TABLE "TripExtra" ADD CONSTRAINT "TripExtra_taxKind_check" CHECK ("taxKind" IN ('VAT7', 'EXEMPT', 'NONE'));
ALTER TABLE "TripPassThroughEvidence" ADD CONSTRAINT "TripPassThroughEvidence_extraKind_check" CHECK ("extraKind" IN ('PARK_FEE', 'PORT_FEE', 'FUEL', 'EQUIPMENT', 'NITROX', 'TRANSFER', 'COURSE', 'INSURANCE', 'OTHER'));
ALTER TABLE "TripDeparture" ADD CONSTRAINT "TripDeparture_status_check" CHECK ("status" IN ('OPEN', 'GUARANTEED', 'FULL', 'CLOSED', 'CANCELLED'));
ALTER TABLE "TripResource" ADD CONSTRAINT "TripResource_kind_check" CHECK ("kind" IN ('BOAT', 'VAN', 'GUIDE', 'OTHER'));
ALTER TABLE "TripSeason" ADD CONSTRAINT "TripSeason_status_check" CHECK ("status" IN ('ACTIVE', 'ARCHIVED'));
ALTER TABLE "TripPriceRule" ADD CONSTRAINT "TripPriceRule_kind_check" CHECK ("kind" IN ('EARLY_BIRD', 'LAST_MINUTE', 'GROUP_TIER', 'FREE_LEADER', 'BLACKOUT', 'PROMO_CODE'));
ALTER TABLE "TripHold" ADD CONSTRAINT "TripHold_channel_check" CHECK ("channel" IN ('WEB', 'LIFF', 'EMBED', 'COUNTER', 'POS', 'AGENT_PORTAL', 'AGENT_LINK', 'AGENT_API', 'OTA', 'API', 'IMPORT', 'CHAT_AI'));
ALTER TABLE "TripHold" ADD CONSTRAINT "TripHold_purpose_check" CHECK ("purpose" IN ('PAYMENT', 'SHOP_CONFIRM', 'AGENT_REQUEST', 'SUPPLIER_REQUEST', 'WAITLIST_OFFER', 'AGENT_HOLD'));
ALTER TABLE "TripHold" ADD CONSTRAINT "TripHold_status_check" CHECK ("status" IN ('ACTIVE', 'CONVERTED', 'EXPIRED', 'RELEASED'));
ALTER TABLE "TripBooking" ADD CONSTRAINT "TripBooking_status_check" CHECK ("status" IN ('HOLD', 'PENDING', 'CONFIRMED', 'PART_PAID', 'PAID', 'EXPIRED', 'CANCELLED', 'TRAVELLED', 'NO_SHOW'));
ALTER TABLE "TripBooking" ADD CONSTRAINT "TripBooking_channel_check" CHECK ("channel" IN ('WEB', 'LIFF', 'EMBED', 'COUNTER', 'POS', 'AGENT_PORTAL', 'AGENT_LINK', 'AGENT_API', 'OTA', 'API', 'IMPORT', 'CHAT_AI'));
ALTER TABLE "TripBooking" ADD CONSTRAINT "TripBooking_collectMode_check" CHECK ("collectMode" IN ('SHOP', 'AGENT'));
ALTER TABLE "TripBooking" ADD CONSTRAINT "TripBooking_payMethod_check" CHECK ("payMethod" IN ('PAY_NOW', 'PAY_LATER', 'WALLET', 'CREDIT'));
ALTER TABLE "TripBooking" ADD CONSTRAINT "TripBooking_contactRoute_check" CHECK ("contactRoute" IN ('VIA_AGENT', 'DIRECT'));
ALTER TABLE "TripBooking" ADD CONSTRAINT "TripBooking_accountingState_check" CHECK ("accountingState" IN ('NONE', 'UNEARNED', 'RECOGNISED', 'REVERSED'));
ALTER TABLE "TripBookingItem" ADD CONSTRAINT "TripBookingItem_kind_check" CHECK ("kind" IN ('SEAT', 'BERTH', 'CABIN', 'EXTRA', 'PICKUP', 'FEE', 'ADJUST'));
ALTER TABLE "TripBookingItem" ADD CONSTRAINT "TripBookingItem_taxKind_check" CHECK ("taxKind" IN ('VAT7', 'EXEMPT', 'NONE'));
ALTER TABLE "TripPassenger" ADD CONSTRAINT "TripPassenger_formStatus_check" CHECK ("formStatus" IN ('NOT_REQUIRED', 'PENDING', 'SUBMITTED', 'VERIFIED', 'NEEDS_FIX'));
ALTER TABLE "TripPaymentDue" ADD CONSTRAINT "TripPaymentDue_kind_check" CHECK ("kind" IN ('DEPOSIT', 'BALANCE', 'INSTALMENT', 'PASSENGER_SHARE'));
ALTER TABLE "TripPaymentDue" ADD CONSTRAINT "TripPaymentDue_status_check" CHECK ("status" IN ('OPEN', 'PARTLY_PAID', 'PAID', 'OVERDUE', 'WAIVED', 'CANCELLED'));
ALTER TABLE "TripMoneyEvent" ADD CONSTRAINT "TripMoneyEvent_kind_check" CHECK ("kind" IN ('RECEIVED', 'REFUNDED', 'RETAINED', 'REVENUE_RECOGNISED', 'PASS_THROUGH_PAID', 'CREDIT_ISSUED'));
ALTER TABLE "TripMoneyEvent" ADD CONSTRAINT "TripMoneyEvent_tender_check" CHECK ("tender" IN ('CASH', 'PROMPTPAY', 'TRANSFER', 'CARD', 'AGENCY'));
ALTER TABLE "TripMoneyEvent" ADD CONSTRAINT "TripMoneyEvent_postingStatus_check" CHECK ("postingStatus" IN ('POSTED', 'UNPOSTED', 'FAILED_NEEDS_ACTION'));
ALTER TABLE "TripRefundRequest" ADD CONSTRAINT "TripRefundRequest_by_check" CHECK ("by" IN ('CUSTOMER', 'AGENT', 'STAFF', 'SYSTEM'));
ALTER TABLE "TripRefundRequest" ADD CONSTRAINT "TripRefundRequest_reasonKind_check" CHECK ("reasonKind" IN ('CUSTOMER', 'EXTERNAL', 'MIN_NOT_MET', 'SHOP_FAULT'));
ALTER TABLE "TripRefundRequest" ADD CONSTRAINT "TripRefundRequest_status_check" CHECK ("status" IN ('REQUESTED', 'QUOTED', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'EXECUTING', 'DONE', 'FAILED'));
ALTER TABLE "TripRefundRequest" ADD CONSTRAINT "TripRefundRequest_choice_check" CHECK ("choice" IN ('MONEY', 'CREDIT', 'MOVE_DATE'));
ALTER TABLE "TripDocument" ADD CONSTRAINT "TripDocument_kind_check" CHECK ("kind" IN ('PASSPORT', 'MEDICAL', 'WAIVER', 'CERT', 'PARK_TICKET', 'INSURANCE'));
ALTER TABLE "TripDocView" ADD CONSTRAINT "TripDocView_viewerKind_check" CHECK ("viewerKind" IN ('STAFF', 'AGENT', 'LINK_CUSTOMER', 'CUSTOMER'));
ALTER TABLE "TripPdpaRequest" ADD CONSTRAINT "TripPdpaRequest_kind_check" CHECK ("kind" IN ('ACCESS', 'RECTIFY', 'ERASE', 'OBJECT', 'PORTABILITY'));
ALTER TABLE "TripPdpaRequest" ADD CONSTRAINT "TripPdpaRequest_status_check" CHECK ("status" IN ('RECEIVED', 'IN_PROGRESS', 'DONE', 'REJECTED'));
ALTER TABLE "TripCheckin" ADD CONSTRAINT "TripCheckin_result_check" CHECK ("result" IN ('FIRST', 'DUPLICATE'));
ALTER TABLE "TripWaitlist" ADD CONSTRAINT "TripWaitlist_status_check" CHECK ("status" IN ('WAITING', 'OFFERED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED'));
ALTER TABLE "TripCost" ADD CONSTRAINT "TripCost_kind_check" CHECK ("kind" IN ('BOAT', 'FUEL', 'GUIDE', 'FOOD', 'PARK_FEE', 'TRANSPORT', 'EQUIPMENT', 'OTHER'));
ALTER TABLE "TripUnit" ADD CONSTRAINT "TripUnit_status_check" CHECK ("status" IN ('FREE', 'HELD', 'SOLD', 'BLOCKED', 'ALLOTTED'));
ALTER TABLE "TripImportBatch" ADD CONSTRAINT "TripImportBatch_kind_check" CHECK ("kind" IN ('PRODUCTS', 'DEPARTURES', 'PRICES', 'BOOKINGS', 'SUPPLIER_COSTS'));
ALTER TABLE "TripImportBatch" ADD CONSTRAINT "TripImportBatch_status_check" CHECK ("status" IN ('PREVIEW', 'APPLIED', 'UNDONE'));
ALTER TABLE "TripLinkStat" ADD CONSTRAINT "TripLinkStat_channel_check" CHECK ("channel" IN ('WEB', 'LIFF', 'EMBED', 'COUNTER', 'POS', 'AGENT_PORTAL', 'AGENT_LINK', 'AGENT_API', 'OTA', 'API', 'IMPORT', 'CHAT_AI'));
ALTER TABLE "TripWaitlist" ADD CONSTRAINT "TripWaitlist_channel_check" CHECK ("channel" IN ('WEB', 'LIFF', 'EMBED', 'COUNTER', 'POS', 'AGENT_PORTAL', 'AGENT_LINK', 'AGENT_API', 'OTA', 'API', 'IMPORT', 'CHAT_AI'));
ALTER TABLE "TripPromoRedemption" ADD CONSTRAINT "TripPromoRedemption_status_check" CHECK ("status" IN ('ACTIVE', 'RELEASED'));

-- CHECK >= 0 (เงิน *Satang *Minor · ตัวนับ qty* seq sold held reserved capacity version · ยกเว้น manualDeltaSatang varianceSatang ที่ติดลบได้)
ALTER TABLE "SellCounter" ADD CONSTRAINT "SellCounter_seq_check" CHECK ("seq" >= 0);
ALTER TABLE "TripExtra" ADD CONSTRAINT "TripExtra_priceMinor_check" CHECK ("priceMinor" >= 0);
ALTER TABLE "TripPassThroughEvidence" ADD CONSTRAINT "TripPassThroughEvidence_amountSatang_check" CHECK ("amountSatang" >= 0);
ALTER TABLE "TripPickupZone" ADD CONSTRAINT "TripPickupZone_surchargeSatang_check" CHECK ("surchargeSatang" >= 0);
ALTER TABLE "TripSchedule" ADD CONSTRAINT "TripSchedule_capacity_check" CHECK ("capacity" >= 0);
ALTER TABLE "TripDeparture" ADD CONSTRAINT "TripDeparture_capacity_check" CHECK ("capacity" >= 0);
ALTER TABLE "TripDeparture" ADD CONSTRAINT "TripDeparture_sold_check" CHECK ("sold" >= 0);
ALTER TABLE "TripDeparture" ADD CONSTRAINT "TripDeparture_held_check" CHECK ("held" >= 0);
ALTER TABLE "TripDeparture" ADD CONSTRAINT "TripDeparture_reserved_check" CHECK ("reserved" >= 0);
ALTER TABLE "TripDeparture" ADD CONSTRAINT "TripDeparture_version_check" CHECK ("version" >= 0);
ALTER TABLE "TripPrice" ADD CONSTRAINT "TripPrice_amountMinor_check" CHECK ("amountMinor" >= 0);
ALTER TABLE "TripHold" ADD CONSTRAINT "TripHold_qtyPublic_check" CHECK ("qtyPublic" >= 0);
ALTER TABLE "TripHold" ADD CONSTRAINT "TripHold_qtyAllot_check" CHECK ("qtyAllot" >= 0);
ALTER TABLE "TripBooking" ADD CONSTRAINT "TripBooking_grossSatang_check" CHECK ("grossSatang" >= 0);
ALTER TABLE "TripBooking" ADD CONSTRAINT "TripBooking_discountSatang_check" CHECK ("discountSatang" >= 0);
ALTER TABLE "TripBooking" ADD CONSTRAINT "TripBooking_agentDiscountSatang_check" CHECK ("agentDiscountSatang" >= 0);
ALTER TABLE "TripBooking" ADD CONSTRAINT "TripBooking_passThroughSatang_check" CHECK ("passThroughSatang" >= 0);
ALTER TABLE "TripBooking" ADD CONSTRAINT "TripBooking_vatSatang_check" CHECK ("vatSatang" >= 0);
ALTER TABLE "TripBooking" ADD CONSTRAINT "TripBooking_commissionSatang_check" CHECK ("commissionSatang" >= 0);
ALTER TABLE "TripBooking" ADD CONSTRAINT "TripBooking_commissionVatSatang_check" CHECK ("commissionVatSatang" >= 0);
ALTER TABLE "TripBooking" ADD CONSTRAINT "TripBooking_whtSatang_check" CHECK ("whtSatang" >= 0);
ALTER TABLE "TripBooking" ADD CONSTRAINT "TripBooking_netToShopSatang_check" CHECK ("netToShopSatang" >= 0);
ALTER TABLE "TripBooking" ADD CONSTRAINT "TripBooking_agentActualSaleSatang_check" CHECK ("agentActualSaleSatang" IS NULL OR "agentActualSaleSatang" >= 0);
ALTER TABLE "TripBooking" ADD CONSTRAINT "TripBooking_paidSatang_check" CHECK ("paidSatang" >= 0);
ALTER TABLE "TripBooking" ADD CONSTRAINT "TripBooking_refundedSatang_check" CHECK ("refundedSatang" >= 0);
ALTER TABLE "TripBooking" ADD CONSTRAINT "TripBooking_version_check" CHECK ("version" >= 0);
ALTER TABLE "TripBookingItem" ADD CONSTRAINT "TripBookingItem_qty_check" CHECK ("qty" >= 0);
ALTER TABLE "TripBookingItem" ADD CONSTRAINT "TripBookingItem_unitPriceMinor_check" CHECK ("unitPriceMinor" >= 0);
ALTER TABLE "TripBookingItem" ADD CONSTRAINT "TripBookingItem_amountMinor_check" CHECK ("amountMinor" >= 0);
ALTER TABLE "TripBookingItem" ADD CONSTRAINT "TripBookingItem_amountSatang_check" CHECK ("amountSatang" >= 0);
ALTER TABLE "TripBookingItem" ADD CONSTRAINT "TripBookingItem_vatSatang_check" CHECK ("vatSatang" >= 0);
ALTER TABLE "TripPaymentDue" ADD CONSTRAINT "TripPaymentDue_seq_check" CHECK ("seq" >= 0);
ALTER TABLE "TripPaymentDue" ADD CONSTRAINT "TripPaymentDue_amountSatang_check" CHECK ("amountSatang" >= 0);
ALTER TABLE "TripPaymentDue" ADD CONSTRAINT "TripPaymentDue_vatableSatang_check" CHECK ("vatableSatang" >= 0);
ALTER TABLE "TripPaymentDue" ADD CONSTRAINT "TripPaymentDue_passThroughSatang_check" CHECK ("passThroughSatang" >= 0);
ALTER TABLE "TripPaymentDue" ADD CONSTRAINT "TripPaymentDue_amountMinor_check" CHECK ("amountMinor" IS NULL OR "amountMinor" >= 0);
ALTER TABLE "TripPaymentDue" ADD CONSTRAINT "TripPaymentDue_paidSatang_check" CHECK ("paidSatang" >= 0);
ALTER TABLE "TripMoneyEvent" ADD CONSTRAINT "TripMoneyEvent_amountSatang_check" CHECK ("amountSatang" >= 0);
ALTER TABLE "TripMoneyEvent" ADD CONSTRAINT "TripMoneyEvent_vatSatang_check" CHECK ("vatSatang" >= 0);
ALTER TABLE "TripMoneyEvent" ADD CONSTRAINT "TripMoneyEvent_passThroughSatang_check" CHECK ("passThroughSatang" >= 0);
ALTER TABLE "TripMoneyEvent" ADD CONSTRAINT "TripMoneyEvent_postingAttempts_check" CHECK ("postingAttempts" >= 0);
ALTER TABLE "TripMoneyEvent" ADD CONSTRAINT "TripMoneyEvent_whtByCustomerSatang_check" CHECK ("whtByCustomerSatang" IS NULL OR "whtByCustomerSatang" >= 0);
ALTER TABLE "TripRefundRequest" ADD CONSTRAINT "TripRefundRequest_amountSatang_check" CHECK ("amountSatang" >= 0);
ALTER TABLE "TripCashClose" ADD CONSTRAINT "TripCashClose_expectedSatang_check" CHECK ("expectedSatang" >= 0);
ALTER TABLE "TripCashClose" ADD CONSTRAINT "TripCashClose_countedSatang_check" CHECK ("countedSatang" >= 0);
ALTER TABLE "TripWaitlist" ADD CONSTRAINT "TripWaitlist_qty_check" CHECK ("qty" >= 0);
ALTER TABLE "TripCost" ADD CONSTRAINT "TripCost_amountSatang_check" CHECK ("amountSatang" >= 0);
ALTER TABLE "TripUnit" ADD CONSTRAINT "TripUnit_version_check" CHECK ("version" >= 0);
ALTER TABLE "TripLinkStat" ADD CONSTRAINT "TripLinkStat_views_check" CHECK ("views" >= 0);
ALTER TABLE "TripLinkStat" ADD CONSTRAINT "TripLinkStat_starts_check" CHECK ("starts" >= 0);
ALTER TABLE "TripLinkStat" ADD CONSTRAINT "TripLinkStat_paid_check" CHECK ("paid" >= 0);
ALTER TABLE "TripBooking" ADD CONSTRAINT "TripBooking_fxRateMicros_check" CHECK ("fxRateMicros" IS NULL OR "fxRateMicros" >= 0);
ALTER TABLE "TripResource" ADD CONSTRAINT "TripResource_seats_check" CHECK ("seats" IS NULL OR "seats" >= 0);
ALTER TABLE "TripSchedule" ADD CONSTRAINT "TripSchedule_minPax_check" CHECK ("minPax" IS NULL OR "minPax" >= 0);
ALTER TABLE "TripDeparture" ADD CONSTRAINT "TripDeparture_minPax_check" CHECK ("minPax" IS NULL OR "minPax" >= 0);
ALTER TABLE "TripPassenger" ADD CONSTRAINT "TripPassenger_diveCount_check" CHECK ("diveCount" IS NULL OR "diveCount" >= 0);
ALTER TABLE "TripPaxType" ADD CONSTRAINT "TripPaxType_ageMin_check" CHECK ("ageMin" IS NULL OR "ageMin" >= 0);
ALTER TABLE "TripPaxType" ADD CONSTRAINT "TripPaxType_ageMax_check" CHECK ("ageMax" IS NULL OR "ageMax" >= 0);
ALTER TABLE "TripOption" ADD CONSTRAINT "TripOption_durationMin_check" CHECK ("durationMin" IS NULL OR "durationMin" >= 0);
ALTER TABLE "TripOption" ADD CONSTRAINT "TripOption_nights_check" CHECK ("nights" IS NULL OR "nights" >= 0);
ALTER TABLE "TripPriceRule" ADD CONSTRAINT "TripPriceRule_usedCount_check" CHECK ("usedCount" >= 0);
ALTER TABLE "TripPromoRedemption" ADD CONSTRAINT "TripPromoRedemption_discountSatang_check" CHECK ("discountSatang" >= 0);
ALTER TABLE "TripPickupZone" ADD CONSTRAINT "TripPickupZone_pickupOffsetMin_check" CHECK ("pickupOffsetMin" >= 0);
ALTER TABLE "TripOption" ADD CONSTRAINT "TripOption_sortOrder_check" CHECK ("sortOrder" >= 0);
ALTER TABLE "TripPaxType" ADD CONSTRAINT "TripPaxType_sortOrder_check" CHECK ("sortOrder" >= 0);
ALTER TABLE "TripExtra" ADD CONSTRAINT "TripExtra_sortOrder_check" CHECK ("sortOrder" >= 0);
ALTER TABLE "TripPickupZone" ADD CONSTRAINT "TripPickupZone_sortOrder_check" CHECK ("sortOrder" >= 0);

-- CHECK ข้ามคอลัมน์/ลำดับเวลา (ชื่อที่มีข้อความคงที่เรียงหลัง CHECK ชุดค่าของตาราง — ตัวอ่านชุดค่าของคอลัมน์ใช้ CHECK แรกตามชื่อที่อ้างคอลัมน์นั้น)
ALTER TABLE "TripExtra" ADD CONSTRAINT "TripExtra_passThrough_check" CHECK (NOT "passThrough" OR (NOT "commissionable" AND NOT "discountable" AND "taxKind" = 'NONE'));
ALTER TABLE "TripProduct" ADD CONSTRAINT "TripProduct_thb_unless_liveaboard_check" CHECK ("currency" = 'THB' OR "productType" = 'LIVEABOARD');
ALTER TABLE "TripDeparture" ADD CONSTRAINT "TripDeparture_counters_capacity_check" CHECK ("sold" + "held" + "reserved" <= "capacity");
ALTER TABLE "TripDeparture" ADD CONSTRAINT "TripDeparture_times_check" CHECK ("endsAt" > "startsAt");
ALTER TABLE "TripResourceUse" ADD CONSTRAINT "TripResourceUse_times_check" CHECK ("endsAt" > "startsAt");
ALTER TABLE "TripSeason" ADD CONSTRAINT "TripSeason_dates_check" CHECK ("dateEnd" >= "dateStart");
ALTER TABLE "TripSchedule" ADD CONSTRAINT "TripSchedule_dates_check" CHECK ("dateTo" IS NULL OR "dateTo" >= "dateFrom");
ALTER TABLE "TripSchedule" ADD CONSTRAINT "TripSchedule_departTimeMin_check" CHECK ("departTimeMin" >= 0 AND "departTimeMin" <= 1439);
ALTER TABLE "TripPrice" ADD CONSTRAINT "TripPrice_weekdayMask_check" CHECK ("weekdayMask" IS NULL OR ("weekdayMask" >= 0 AND "weekdayMask" <= 127));

-- UNIQUE NULLS NOT DISTINCT (PG ≥ 15 · ค่า NULL เท่ากัน = แถวเดียว)
CREATE UNIQUE INDEX "TripDeparture_productId_optionId_startsAt_key" ON "TripDeparture"("productId", "optionId", "startsAt") NULLS NOT DISTINCT;
CREATE UNIQUE INDEX "TripPrice_dims_key" ON "TripPrice"("productId", "optionId", "paxTypeId", "cabinTypeId", "seasonId", "departureId", "currency", "weekdayMask", "bookFrom", "travelFrom") NULLS NOT DISTINCT;
CREATE UNIQUE INDEX "TripLinkStat_unitId_day_channel_linkId_key" ON "TripLinkStat"("unitId", "day", "channel", "linkId") NULLS NOT DISTINCT;

-- partial: เช็กอินครั้งแรกต่อผู้เดินทาง 1 แถว · รอบจากกฎ 1 รอบต่อวันท้องถิ่น (T0.3) · ตัวกวาดที่ถือหมดเวลาข้ามร้าน · เพดานถือ (§D.6) · คิวรอเปิดอยู่ 1 แถวต่อคนต่อรอบ (T0.4) · โค้ดโปรที่ใช้อยู่ไม่ซ้ำในหน่วย (T0.5)
CREATE UNIQUE INDEX "TripCheckin_passengerId_first_key" ON "TripCheckin"("passengerId") WHERE "result" = 'FIRST';
CREATE UNIQUE INDEX "TripDeparture_scheduleId_localDate_key" ON "TripDeparture"("scheduleId", "localDate") WHERE "scheduleId" IS NOT NULL;
CREATE INDEX "TripHold_expiresAt_active_idx" ON "TripHold"("expiresAt") WHERE "status" = 'ACTIVE';
CREATE INDEX "TripHold_capKeyHash_active_idx" ON "TripHold"("capKeyHash") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "TripWaitlist_departureId_partyId_open_key" ON "TripWaitlist"("departureId", "partyId") WHERE "status" IN ('WAITING', 'OFFERED');
CREATE UNIQUE INDEX "TripPriceRule_unitId_code_active_key" ON "TripPriceRule"("unitId", lower("code")) WHERE "code" IS NOT NULL AND "active";

-- กันทรัพยากรซ้อนเวลา ต่อร้าน (tenantId + resourceId · r3 R2-6) (btree_gist มีแล้วจาก svc_r0) · tsrange: คอลัมน์ Prisma DateTime = timestamp ไม่มีเขตเวลา (เก็บ UTC) · มติผู้คุม 12 พ.ย.
ALTER TABLE "TripResourceUse" ADD CONSTRAINT "TripResourceUse_no_overlap" EXCLUDE USING gist ("tenantId" WITH =, "resourceId" WITH =, tsrange("startsAt", "endsAt", '[)') WITH &&) WHERE ("active");

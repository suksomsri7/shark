-- TRIPS T1.6a (ใบ ledger/trips-briefs/T1.6.md §3): ร้านยกเลิกรอบที่มีคนจอง — 3 คอลัมน์บน TripDeparture + ตารางผลต่อการจอง (รวม consent/MOVED ที่ a2 ใช้)
ALTER TABLE "TripDeparture" ADD COLUMN "cancelKind" TEXT, ADD COLUMN "cancelDecideBy" TIMESTAMP(3), ADD COLUMN "cancelOptions" JSONB;
ALTER TABLE "TripDeparture" ADD CONSTRAINT "TripDeparture_cancelKind_check"
  CHECK ("cancelKind" IS NULL OR "cancelKind" IN ('EXTERNAL','MIN_NOT_MET','SHOP_FAULT'));
ALTER TABLE "TripDeparture" ADD CONSTRAINT "TripDeparture_cancelWithBookings_check"
  CHECK (("cancelKind" IS NULL AND "cancelDecideBy" IS NULL AND "cancelOptions" IS NULL)
      OR ("cancelKind" IS NOT NULL AND "cancelDecideBy" IS NOT NULL AND "status" = 'CANCELLED' AND jsonb_typeof("cancelOptions") = 'array'));
CREATE INDEX "TripDeparture_cancelDecideBy_idx" ON "TripDeparture" ("tenantId", "cancelDecideBy") WHERE "cancelKind" IS NOT NULL;

CREATE TABLE "TripDepartureCancelOutcome" (
  "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL, "unitId" TEXT NOT NULL,
  "departureId" TEXT NOT NULL REFERENCES "TripDeparture"("id") ON DELETE RESTRICT,
  "bookingId" TEXT NOT NULL REFERENCES "TripBooking"("id") ON DELETE RESTRICT,
  "choice" TEXT NOT NULL, "by" TEXT NOT NULL, "refundRequestId" TEXT, "consent" JSONB,
  "at" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TripDepartureCancelOutcome_choice_check" CHECK ("choice" IN ('PENDING','MOVED','REFUND','NO_MONEY','AGENCY_MONEY_HELD')),
  CONSTRAINT "TripDepartureCancelOutcome_by_check" CHECK ("by" IN ('STAFF','SYSTEM_DEFAULT')),
  CONSTRAINT "TripDepartureCancelOutcome_consent_check" CHECK (("choice" = 'MOVED') = ("consent" IS NOT NULL AND jsonb_typeof("consent") = 'object')),
  CONSTRAINT "TripDepartureCancelOutcome_refund_check" CHECK ("choice" <> 'REFUND' OR "refundRequestId" IS NOT NULL)
);
CREATE UNIQUE INDEX "TripDepartureCancelOutcome_departureId_bookingId_key" ON "TripDepartureCancelOutcome" ("departureId", "bookingId");
CREATE INDEX "TripDepartureCancelOutcome_tenantId_unitId_choice_idx" ON "TripDepartureCancelOutcome" ("tenantId", "unitId", "choice");
CREATE INDEX "TripDepartureCancelOutcome_bookingId_idx" ON "TripDepartureCancelOutcome" ("bookingId");

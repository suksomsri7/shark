-- HR H2.4 r2 ▸ R6 (review MEDIUM-3): partial indexes for the hourly retention purge (purgeClockPrivacy, hr/clock.ts).
-- Predicates are byte-for-byte the purge WHERE clauses so the planner can use them. Both hold ~0 rows at creation
-- (only GPS-site mobile clocks and future photo clocks write these columns).
-- Runbook: on a large "HrAttendance" table create them CONCURRENTLY in a manual step first
-- (CREATE INDEX CONCURRENTLY IF NOT EXISTS … — cannot run inside prisma's migration transaction), then this file is a no-op.
CREATE INDEX IF NOT EXISTS "HrAttendance_purge_geo_idx" ON "HrAttendance" ("tenantId", "at")
  WHERE ("lat" IS NOT NULL OR "lng" IS NOT NULL OR "accuracyM" IS NOT NULL OR "deviceId" IS NOT NULL);

CREATE INDEX IF NOT EXISTS "HrAttendance_purge_photo_idx" ON "HrAttendance" ("tenantId", "at")
  WHERE "photoKey" IS NOT NULL;

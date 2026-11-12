-- HR H2.4 ▸ ลงเวลา v2 (brief hr-brief-H2.4 R8/R10/R13/R14) — คอลัมน์ · ตาราง HrClockSite · unique บางส่วน · backfill timesOverridden · ทำเที่ยงคืนเป็นรูปเดียว
--   ค่า enum BREAK_START/BREAK_END อยู่ในไฟล์ 20261228000001 (ALTER TYPE … ADD VALUE ใช้ในธุรกรรมเดียวกับผู้ใช้ค่าไม่ได้)
--   ลำดับ prod: migrate ก่อน แล้วจึง deploy โค้ด (โค้ดเดิมไม่อ่านคอลัมน์ใหม่) — ตัวนับก่อนรันอยู่ใน ledger/wo-notes/hr-H2.4.md ◂

-- AlterTable
ALTER TABLE "HrAttendance" ADD COLUMN     "distanceM" INTEGER,
ADD COLUMN     "inRadius" BOOLEAN;

-- AlterTable
ALTER TABLE "HrRosterEntry" ADD COLUMN     "timesOverridden" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "HrClockSite" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "unitId" TEXT,
    "mobileEnabled" BOOLEAN NOT NULL DEFAULT false,
    "gpsRequired" BOOLEAN NOT NULL DEFAULT true,
    "centerLat" DECIMAL(9,6),
    "centerLng" DECIMAL(9,6),
    "radiusM" INTEGER NOT NULL DEFAULT 150,
    "minAccuracyM" INTEGER NOT NULL DEFAULT 100,
    "photoRequired" BOOLEAN NOT NULL DEFAULT false,
    "noticeAcceptedAt" TIMESTAMP(3),
    "noticeAcceptedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrClockSite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HrClockSite_tenantId_idx" ON "HrClockSite"("tenantId");

-- CreateIndex
CREATE INDEX "HrClockSite_systemId_idx" ON "HrClockSite"("systemId");

-- HR H2.4 ▸ จุดลงเวลา 1 แถวต่อ (ระบบ, สาขา) และ 1 แถวทั้งร้านต่อระบบ (unique บางส่วน — Prisma schema แสดงไม่ได้)
CREATE UNIQUE INDEX "HrClockSite_system_unit_key" ON "HrClockSite"("systemId", "unitId") WHERE "unitId" IS NOT NULL;
CREATE UNIQUE INDEX "HrClockSite_system_shopwide_key" ON "HrClockSite"("systemId") WHERE "unitId" IS NULL;

-- HR H2.4 ▸ R13 backfill (D-F4): แถวที่เวลาต่างจากกะ "ปัจจุบัน" และเขียนหลังการแก้กะครั้งล่าสุด = เวลาที่ผู้จัดระบุเอง
--   (= ผลเดียวกับตัวเดาเดิม copyTimesOf ของ H2.1 r3 ⇒ คัดลอกสัปดาห์ให้ผลเหมือนวันนี้) · อื่น ๆ = false (ค่าปริยาย)
UPDATE "HrRosterEntry" e
SET "timesOverridden" = true
FROM "HrShift" s
WHERE s."id" = e."shiftId"
  AND (e."startMin" <> s."startMin" OR e."endMin" <> s."endMin" OR e."breakMin" <> s."breakMin" OR e."crossesMidnight" <> s."crossesMidnight")
  AND e."createdAt" >= s."updatedAt";

-- HR H2.4 ▸ R14 เที่ยงคืนรูปเดียว: กะ 16:00–24:00 เคยเก็บได้สองแบบ (1440/false ≡ 0/true) ⇒ เก็บเป็น 1440/false (หลัง backfill — เทียบบนค่าเดิม)
UPDATE "HrShift" SET "endMin" = 1440, "crossesMidnight" = false WHERE "endMin" = 0 AND "crossesMidnight" = true;
UPDATE "HrRosterEntry" SET "endMin" = 1440, "crossesMidnight" = false WHERE "endMin" = 0 AND "crossesMidnight" = true;

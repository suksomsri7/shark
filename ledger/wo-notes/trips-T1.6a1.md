# T1.6a1 — ร้านยกเลิกรอบที่มีคนจอง (a1) · บันทึกผู้สร้าง

- ใบ `ledger/trips-briefs/T1.6.md` ร่างรอบ 2 · ข้อสอบ `scripts/qc-trips-t1.6.mts` (68 ข้อ) · เลน l2 · `wip/trips-t1.6` @c069bdf62
- **สถานะ: หยุดที่ชิ้นแรก (migration + schema + ทะเบียน scope + ตัวช่วยบริสุทธิ์)** — เหตุ 2 ข้อ: (1) งบบรรทัดของ `trips.prisma` เกิน (ข้อหยุดของผู้คุม: เกินงบ ⇒ หยุดรายงาน) (2) session ของผู้สร้างนี้ใช้บริบทไปกับ T1.7a2 สามรอบแล้ว — เส้นเงิน ~1,500 บรรทัดที่เหลือควรให้ session ใหม่ทำต่อจากบันทึกนี้ ไม่ทำครึ่ง ๆ บนทางเงิน

## ที่ทำแล้ว
- `prisma/migrations/20270201000300_trips_t16a_departure_cancel/migration.sql` = §3 ตรงตัว (SQL ด้านล่าง) · ลำดับโฟลเดอร์ต่อจาก `20270201000200_agency` (l1 W1.4a ไม่มี migration)
- ลงฐาน QC ของเลนนี้เท่านั้น: `bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec prisma migrate deploy` ⇒ applied · wrapper เลือกฐานจาก `.env.qc-trips` ของทรีนี้ (ตรวจ host allowlist · ปฏิเสธ prod) · `prisma.config.ts` โหลด `.env` เฉพาะถ้ามี — ทรีนี้ไม่มี `.env` และทดลองแล้วว่า `process.loadEnvFile` ไม่ทับตัวแปรที่ wrapper ตั้ง (Node 20.20.2)
- **ฐาน QC อีก 2 ฐานของ TRIPS ยังไม่ได้ลง** (คำสั่งผู้คุม: ฐานของเลนนี้เท่านั้น)
- `pnpm drift` (ผ่าน wrapper): exit 2 แต่ 23 ตารางที่ต่างเป็นของเดิมทั้งหมด (unique/FK ที่เป็น SQL มือ เช่น TripDeparture (productId, optionId, startsAt) NULLS NOT DISTINCT · HrWorkEntry FK) — **ไม่มีรายการของ T1.6a** (ไม่มี TripDepartureCancelOutcome · cancelKind/cancelDecideBy/cancelOptions · ดัชนีบางส่วนไม่ถูกรายงาน) ⇒ เกณฑ์ "diff ว่าง" ใช้ได้เฉพาะของใบนี้ ไม่ใช่ทั้งฐาน (ความหมายของ `pnpm drift` = เทียบฐานจริงกับ schema ทั้ง repo)
- `prisma/schema/trips.prisma`: 3 คอลัมน์ + model `TripDepartureCancelOutcome` (FK 2 ตัว `onDelete: Restrict, onUpdate: NoAction` ให้ตรงกับ REFERENCES ของ SQL · `createdAt` ไม่มี default ตาม SQL — บริการต้องตั้งเอง) + relation ย้อนกลับบน TripDeparture และ TripBooking · `prisma validate` ผ่าน · `prisma generate` แล้ว (ไม่ได้รัน `prisma format` ทั้ง repo — format เปลี่ยน 25 ไฟล์ของคนอื่น จึงย้อนแล้วแก้มือ)
- `src/lib/core/scope.ts`: `TripDepartureCancelOutcome: unit,` 1 บรรทัด (C12)
- `src/lib/modules/trips/cancel-departure-core.ts` (CANCEL_KINDS · CANCEL_OUTCOMES · CONSENT_CHANNELS · decideByOf · cancelOptionsOf · cancelOutcomeOf · fullRefundSplitOf) + บล็อก facade `// ── T1.6a1 cancel-departure ──` ใน index.ts

## ผลข้อสอบ (รันครั้งเดียว)
`qc-trips-t1.6` **15/68** — PC 9/9 · S 1/8 (S-2 เขียว: migration ตรง §3 · FK RESTRICT 2 · ดัชนี · ทะเบียน scope) · P 5/5 · CD/GD/RF/NM/RC/AC/PG/PM 0 (ยังไม่มีบริการ/action/จอ — แดงตามคาด)
- S-3 แดงเพราะ **`trips.prisma` +26/−0 (งบ +22/−0)** — ขั้นต่ำที่ทำได้: 3 คอลัมน์ + model 20 บรรทัด (12 ช่อง + 2 relation + 3 ดัชนี + เปิด/ปิด/บรรทัดว่าง) + relation ย้อนกลับ 2 บรรทัด (Prisma บังคับเมื่อมี FK ที่ S-2 ตรวจ) + บรรทัดว่างคั่น model 1 · งบ +22 ไม่ได้นับ relation ย้อนกลับ/FK ⇒ **ขอผู้คุมขยายงบเป็น +26** (ไม่ตัด FK เพราะ S-2 และ §3 บังคับ)
- ไม่ได้รัน t0.7 / t1.2 / w1.3 / typecheck / fitness (หยุดก่อนชิ้นบริการ)

## SQL ของ migration
```sql
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
```

## ข้อสังเกตถึง session ถัดไป (ยังไม่ได้ตรวจลึก)
- `createdAt` ของแถวผลไม่มี default ⇒ ทุก INSERT ต้องใส่ `createdAt`/`at` จาก `now` ที่ฉีด
- ลำดับรันของข้อสอบหลัง migration: CD → GD → RF → NM → RC → AC → PG → PM (GD ต้องมาก่อนงวดของ dC ถูกปิด)
- ยังไม่ได้อ่าน refund.ts / money.ts / booking.ts / capacity*.ts / jobs.ts / departure-desk.ts / departure-screens.ts / booking-screens.ts / trips-self*.ts สำหรับรั้ว §6 — ไม่มีข้อแย้งต่อสัญญา §5.4 จากส่วนที่อ่าน

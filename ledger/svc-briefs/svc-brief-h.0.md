# ใบสั่ง H.0 — migration `svc_h` (โรงแรม V2: ราคา · คืนรายแถว · folio · ทะเบียนแขก · audit · OTA) + backfill การจองเดิม + ด่าน `type === "HOTEL"` + scope/registry · ตรวจ **เบา** (ไม่มี UI · ไม่มีเงินไหล)

> แหล่งความจริง: `ledger/SVC-HOTEL-PLAN.md` ร่าง 2 §2 (มติเทคนิค 14 ข้อ) · `ledger/SVC-MASTER-PLAN.md` แถว H.0 · สเปก `docs/modules/01-hotel.md` §4 (S:253–645) · DH §10 · CC §1.2 (scope ใหม่ไม่ต้อง migrate) §1.6 (snapshot) §5.2 (hotel.prisma additive) · แม่แบบใบ = `svc-brief-d.0.md`
> ข้อสอบ (ห้ามแก้): «scripts/qc-svc-h.0.mts» — ผู้เขียนข้อสอบเขียนก่อนเปิดเลน · รับใบ = ผ่านทุกข้อ ไม่มี SKIP · รัน `bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-h.0.mts` (ห้ามครอบ timeout · `--no-regression` ข้าม G ระหว่างทำ)
> builder: **ห้าม build/next · ห้าม commit/push · ห้าม `pnpm install` · ห้าม `prisma format` ทั้งชุด · ห้าม `migrate dev`** · ทำในเลนที่มี node_modules แยก (ผู้คุมกำหนดตอนเปิดเลน — ⚠️ ทรีหลักใช้ Prisma client ร่วมกับทรีเลขา AI ห้าม generate ที่นั่น) · temp ขึ้นต้น `svc-h0-`
> ฐานเทียบ (git diff ในข้อสอบ) = `<ผู้คุมใส่ตอนเปิดเลน>`

## 0. หลักของใบ
- **เพิ่มอย่างเดียว** (additive): ไม่มี DROP/RENAME/เปลี่ยนชนิด/SET NOT NULL บนคอลัมน์เดิม · enum เดิมเพิ่มค่า**ต่อท้าย**เท่านั้น · คอลัมน์ใหม่บนตารางมีข้อมูลต้อง nullable หรือมี default
- ไม่มีโค้ดธุรกิจใหม่ (ราคา/folio/audit = H.1+) · โค้ดที่แตะได้ = scope · settings registry/service · ด่าน type HOTEL ใน hotel actions/pages (เพิ่มบรรทัดเดียวต่อจุด) · backfill script
- ชื่อโมเดลคง `Hotel*` (ไม่ @@map เป็น Room* — DH §13 ข้อ 9 ผู้คุมเคาะ: ไม่เปลี่ยนชื่อ ลดความเสี่ยง)

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ (แตะนอกนี้ = ตีกลับ)
| ไฟล์ | ทำอะไร |
|---|---|
| `prisma/schema/hotel.prisma` | **เพิ่มเท่านั้น**: enum `HotelReservationStatus` + `HOLD` `CONFIRMED` `NO_SHOW` ต่อท้าย · ฟิลด์ใหม่ §2.1–2.3 · โมเดลใหม่ §2.4–2.12 · คอมเมนต์บอก SQL มือทุกตัว |
| `prisma/schema/integration.prisma` | คอมเมนต์อย่างเดียว (kind CHANNEL_MANAGER ใช้ตาราง `TenantIntegration` เดิม · ไม่มีตารางใหม่) |
| «prisma/migrations/`<ts>`_svc_h/migration.sql» | migration เดียวของใบ (§4) · ts 14 หลัก > `20261226000000` |
| `src/lib/core/scope.ts` | เพิ่ม 12 บรรทัด §5 ใต้บล็อก `// Hotel` |
| `src/lib/core/settings/defs/rooms.ts` | (ก) ลบ `hiddenUntil: "PHASE_H"` ออกจาก helper `hotel()` (บรรทัด ~59) ให้คีย์โชว์ · (ข) **เพิ่มคีย์** §6.1 ต่อท้ายบล็อกโรงแรม · (ค) แก้ `requires: { integration: "OTA" }` → `"CHANNEL_MANAGER"` (4 คีย์ ota.*) · (ง) `SNAPSHOTS.reservation` §6.2 · (จ) deposit enum เพิ่ม `FIXED_AMOUNT` + `amountSatang?` · ห้ามแก้คีย์หอ/ค่าเริ่มเดิมแม้ไบต์เดียว |
| `src/lib/core/settings/service.ts` | `SUPPORTED_SCOPES` + `RATE_PLAN` · `REF_FIELD.RATE_PLAN = "ratePlanId"` · `locateMany` รู้จัก `RATE_PLAN` (อ่าน `hotelRatePlan` → unitId · known TENANT/UNIT/RATE_PLAN) · `entitiesOfUnit` รวม rate plan ของหน่วย — เพิ่มเท่านั้น |
| `src/lib/core/permissions.ts` | โมดูล `hotel` เพิ่มคีย์ §7 ต่อท้าย (ป้ายไทย) |
| `src/lib/modules/hotel/actions.ts` · `src/app/app/u/[unitSlug]/hotel/{page,reservations/page,setup/page}.tsx` | เพิ่มด่าน `if (unit.type !== "HOTEL") notFound()` (หน้า) / `throw new Error("NOT_HOTEL_UNIT")` → ตอบ `{ok:false,error}` ตามแบบเดิมของไฟล์ (actions) — บรรทัดเดียวต่อจุด ห้ามแก้อื่น |
| «scripts/svc-h0-backfill.mts» | backfill §3 (idempotent · `--dry` · พิมพ์ `BACKFILL_SUMMARY`) |
| `scripts/svc-qc-data.mts` | **ผู้คุมแก้ให้** (builder ห้ามแตะ): ฟิกซ์เจอร์ H.0 (แผนราคา STANDARD ของ bansuan-hotel · ฤดู/วันหยุดตัวอย่าง — ใช้ใน H.1) |

ห้ามแตะ: `hotel/service.ts` (เส้นเงิน/จอง = H.3/H.5) · `modules/rooms/**` · `prisma/schema/*.prisma` อื่น · ข้อสอบ/oracle ทุกตัว · `core/email.ts` · storefront

## 2. สคีมา (ข้อสอบ T ตรวจชุดคอลัมน์ตรงตัว ชนิด/null/default · ชื่อ constraint/index ตั้งเองได้ยกเว้นที่ระบุ)
กติการ่วมตารางใหม่: `id String @id @default(cuid())` · `tenantId String` · `unitId String` · `createdAt DateTime @default(now())` · `updatedAt DateTime @updatedAt` · เงิน `Int` สตางค์ · วัน `@db.Date` · scope `unit`

### 2.1 `HotelReservation` — เพิ่มคอลัมน์ (ทั้งหมด nullable/default · แถวเดิมไม่ต้องแก้)
| คอลัมน์ | Prisma | หมายเหตุ |
|---|---|---|
| source | `String @default("WALK_IN")` | CHECK `IN ('WEB','WALK_IN','PHONE','LINE','OTA')` (S:195 + DH LINE) |
| channelRef · channelConnectionId | `String?` | OTA (H.10) · connection = `TenantIntegration.id` หลวม |
| ratePlanId | `String?` | FK → `HotelRatePlan` **SetNull** · null = การจองเดิม/ไม่มีแผน |
| groupId | `String?` | กลุ่ม = หลายแถว groupId เดียว (มติ §2 ข้อ 1) · `@@index([unitId, groupId])` |
| holdExpiresAt | `DateTime?` | ใช้คู่ status HOLD · `@@index([status, holdExpiresAt])` (sweeper ข้ามร้าน) |
| policySnapshot | `Json?` | `SNAPSHOTS.reservation` (§6.2) จดตอนจอง/ยืนยัน |
| taxSnapshot | `Json?` | `{mode, vatBp, serviceChargeBp}` ณ ตอนจอง (Q1 ร้านปรับได้) |
| grossSatang · commissionSatang · netSatang | `Int?` | ยอดที่ช่องทางแจ้ง (H.10) |
| prepaidByChannel | `Boolean @default(false)` | ช่องทางเก็บเงินเอง |
| noShowAt | `DateTime?` | คู่ status NO_SHOW |
| securityDepositSatang · securityDepositSaleId | `Int @default(0)` · `String?` | เงินประกันห้อง (Q3 · ค่าเริ่มไม่เก็บ) |
enum `HotelReservationStatus` + `HOLD` `CONFIRMED` `NO_SHOW` **ต่อท้าย** (ALTER TYPE ADD VALUE) · `BOOKED` คงไว้ (backfill §3 แปลงเป็น CONFIRMED · โค้ด H.3 เลิกเขียน BOOKED)

### 2.2 `HotelRoomType` — เพิ่ม: `baseOccupancy Int @default(2)` · `maxOccupancy Int?` (null = capacity) · `extraBedAllowed Boolean @default(false)` · `extraBedPriceSatang Int @default(0)` · `bedType String?` · `images Json?` · `archivedAt DateTime?` (คง `active` เดิม · archive = active=false + archivedAt)
### 2.3 `HotelRoom` — เพิ่ม: `hkNote String?` · `hkUpdatedAt DateTime?` · **ไม่เปลี่ยน** `hkStatus` เป็น enum (คง String · ค่า `OUT_OF_ORDER` เดิม · H.6 ใช้ค่านี้แทน OOO ของสเปก) · `status` P1 คงไว้ ไม่เพิ่มค่า

### 2.4 `HotelRatePlan` (S:361)
name `String` · code `String` · includeBreakfast `Boolean @default(false)` · minNights `Int?` · maxNights `Int?` · depositKind `String @default("FIRST_NIGHT")` CHECK `IN ('NONE','FIRST_NIGHT','FULL','PERCENT','FIXED_AMOUNT')` · depositValue `Int @default(0)` (bp หรือสตางค์ตาม kind) · isDefault `Boolean @default(false)` · visibility `Json?` (ช่องทาง `["WEB","LINE","COUNTER","OTA"]`) · status `String @default("ACTIVE")` CHECK `IN ('ACTIVE','ARCHIVED')` · sortOrder `Int @default(0)` · description `String?`
ดัชนี: `@@unique([unitId, code])` · `@@index([tenantId, unitId, status])` · **SQL มือ** partial unique `ON ("unitId") WHERE "isDefault" AND "status" = 'ACTIVE'` (แผนเริ่มต้น 1 แผนต่อหน่วย)

### 2.5 `HotelSeason` (S:329)
name `String` · dateStart `DateTime @db.Date` · dateEnd `DateTime @db.Date` (**รวมวันจบ** ตามสเปก) · priority `Int @default(0)` · status `String @default("ACTIVE")` CHECK ACTIVE/ARCHIVED · CHECK `"dateEnd" >= "dateStart"` · `@@index([tenantId, unitId, dateStart, dateEnd])`

### 2.6 `HotelHoliday` (S:348)
date `DateTime @db.Date` · name `String` · `@@unique([unitId, date])`

### 2.7 `HotelRate` (S:406)
ratePlanId `String` FK → HotelRatePlan **Restrict** · roomTypeId `String` FK → HotelRoomType **Restrict** · seasonId `String?` FK → HotelSeason **SetNull** · priceWeekdaySatang `Int` · priceWeekendSatang `Int` · priceHolidaySatang `Int?` · CHECK ราคา 3 ตัว `>= 0` (null ยอม)
ดัชนี: **SQL มือ** unique `ON ("ratePlanId","roomTypeId","seasonId") NULLS NOT DISTINCT` (แถว seasonId null = ราคาปกติ 1 แถว) · `@@index([tenantId, unitId])`

### 2.8 `HotelRateOverride` (แก้มือรายวัน · ภาพ 15 · มติ §2 ข้อ 4)
roomTypeId `String` FK Restrict · ratePlanId `String?` (null = ทุกแผน) · date `DateTime @db.Date` · priceSatang `Int` CHECK `>= 0` · reason `String?` · setById `String?`
ดัชนี: **SQL มือ** unique `ON ("roomTypeId","ratePlanId","date") NULLS NOT DISTINCT` · `@@index([tenantId, unitId, date])`

### 2.9 `HotelCancelRule` (S:389)
ratePlanId `String` FK → HotelRatePlan **Cascade** (ชุดกฎเป็นของแผน · `PUT /cancel-rules` แทนทั้งชุด) · daysBefore `Int` CHECK `0..365` · refundBp `Int` CHECK `0..10000` · `@@unique([ratePlanId, daysBefore])`

### 2.10 `HotelBookingNight` (S:503 · ชั้นประเภทห้อง · มติ §2 ข้อ 3)
reservationId `String` FK → HotelReservation **Cascade** · roomTypeId `String` (denorm) · roomId `String?` (ห้องจริงของคืนนั้น · ย้ายห้องเปลี่ยนได้) · date `DateTime @db.Date` · priceSatang `Int` CHECK `>= 0` (snapshot) · ratePlanId `String?` · priceSource `String @default("RATE")` CHECK `IN ('RATE','OVERRIDE','FALLBACK','MANUAL')` · counted `Boolean @default(true)` · postedAuditId `String?` · folioItemId `String?`
ดัชนี: `@@unique([reservationId, date])` · **`@@index([unitId, roomTypeId, date, counted])`** (availability S:521) · `@@index([unitId, roomId, date])` · **ไม่มี** partial unique (roomId,date) — EXCLUDE ของ `RoomOccupancy` เป็นผู้ตัดสินห้องจริง (มติ §2 ข้อ 2)

### 2.11 `HotelFolio` + `HotelFolioItem` (S:532–576)
- **HotelFolio**: reservationId `String @unique` FK Cascade · status `String @default("OPEN")` CHECK `IN ('OPEN','SETTLED','VOID')` · balanceSatang `Int @default(0)` (cache) · settledSaleId `String?` · settledAt `DateTime?` · `@@index([tenantId, unitId, status])`
- **HotelFolioItem**: folioId `String` FK → HotelFolio **Cascade** · type `String` CHECK `IN ('ROOM','SERVICE','POS_CHARGE','MINIBAR','DISCOUNT','TAX','SERVICE_CHARGE','DEPOSIT','PAYMENT','REFUND','PENALTY','SECURITY_DEPOSIT','SECURITY_REFUND','VOID_REVERSAL')` · description `String` · qty `Int @default(1)` · unitAmountSatang `Int` · amountSatang `Int` (เครื่องหมายตามสเปก: ค่าใช้จ่ายบวก · จ่าย/คืนลบ) · businessDate `DateTime @db.Date` · refType · refId · postedById `String?` · voidedAt `DateTime?` · voidReason `String?` · reversalOfId `String?` (self-ref หลวม) · `@@index([folioId, businessDate])` · `@@index([tenantId, unitId, refType, refId])`

### 2.12 `HotelGuestRecord` (DH:329 · ร.ร.3/4 · ตม.30)
reservationId `String` FK Cascade · partyId `String?` · fullName `String` · nationality `String?` (ISO-3) · idType `String?` CHECK `IN ('PASSPORT','THAI_ID','OTHER')` · idNumberEnc `String?` (**เข้ารหัสด้วย secret-box เดิม** · ห้ามเก็บดิบ) · idNumberLast4 `String?` · dob `DateTime? @db.Date` · arrivedFrom · nextDestination `String?` · idImageFileId · signatureFileId `String?` · isForeigner `Boolean @default(false)` · tm30Status `String @default("NOT_REQUIRED")` CHECK `IN ('NOT_REQUIRED','PENDING','FILED','LATE')` · tm30DueAt `DateTime?` · tm30Ref `String?` · tm30FiledAt `DateTime?` · rr3SignedAt `DateTime?` · retainUntil `DateTime? @db.Date` (Q6 · 2 ปี) · `@@index([reservationId])` · `@@index([tenantId, unitId, tm30Status, tm30DueAt])` · `@@index([retainUntil])`

### 2.13 `HotelHousekeepingLog` · `HotelNightAudit` (S:580–627)
- **HotelHousekeepingLog**: roomId `String` FK Restrict · fromStatus · toStatus `String` · byUserId `String?` (null=ระบบ) · reservationId `String?` · note `String?` · `@@index([tenantId, unitId, createdAt])` · `@@index([roomId, createdAt])`
- **HotelNightAudit**: businessDate `DateTime @db.Date` · status `String @default("CLOSED")` CHECK CLOSED/REOPENED · roomsTotal · roomsOOO · roomsAvailable · roomsOccupied `Int` · occupancyBps `Int` · roomRevenueSatang · adrSatang · revparSatang `Int` · arrivals · departures · noShowCount · cancelledCount `Int @default(0)` · snapshot `Json?` · closedById `String?` · reopenedAt `DateTime?` · reopenedById `String?` · `@@unique([unitId, businessDate])`

### 2.14 ช่องทาง OTA (DH §10 · ใช้ใน H.10 · สร้างตารางไว้ก่อน)
- **ChannelRoomMap**: connectionId `String` · roomTypeId `String` FK Restrict · externalRoomId `String` · active `Boolean @default(true)` · `@@unique([connectionId, roomTypeId])` · `@@unique([connectionId, externalRoomId])`
- **ChannelRateMap**: connectionId · ratePlanId FK Restrict · externalRateId `String` · formula `Json?` (`{markupBp}`) · `@@unique([connectionId, ratePlanId])`
- **ChannelAriJob**: connectionId · dateFrom · dateTo `@db.Date` · payloadHash `String` · status `String @default("PENDING")` CHECK `IN ('PENDING','SENT','FAILED','SUPERSEDED')` · attempts `Int @default(0)` · lastError `String?` · sentAt `DateTime?` · `@@index([connectionId, status, createdAt])`
- **ChannelReservationInbox**: connectionId · externalId `String` · version `Int` · raw `Json` · status `String @default("RECEIVED")` CHECK `IN ('RECEIVED','APPLIED','NEEDS_ROOM','REJECTED')` · reservationId `String?` · error `String?` · **`@@unique([connectionId, externalId, version])`** · `@@index([tenantId, unitId, status])`
- **ChannelInventoryBuffer**: connectionId · roomTypeId FK Restrict · rooms `Int @default(0)` CHECK `>= 0` · `@@unique([connectionId, roomTypeId])`
- ไม่สร้าง `HotelChannelConnection` (S:631) — ใช้ `TenantIntegration kind CHANNEL_MANAGER`

**FK ทั้งหมดของใบ (ข้อสอบ K ตรงชุด)**: Reservation.ratePlanId→RatePlan (SET NULL) · Rate.ratePlanId→RatePlan (RESTRICT) · Rate.roomTypeId→RoomType (RESTRICT) · Rate.seasonId→Season (SET NULL) · RateOverride.roomTypeId→RoomType (RESTRICT) · CancelRule.ratePlanId→RatePlan (CASCADE) · BookingNight.reservationId→Reservation (CASCADE) · Folio.reservationId→Reservation (CASCADE) · FolioItem.folioId→Folio (CASCADE) · GuestRecord.reservationId→Reservation (CASCADE) · HousekeepingLog.roomId→Room (RESTRICT) · ChannelRoomMap/RateMap/InventoryBuffer → RoomType/RatePlan (RESTRICT)
⚠️ สคริปต์ล้าง QC ที่ลบ `hotelReservation`/`hotelRoom`/`hotelRoomType` ต้องลบลูกใหม่ก่อน (Cascade ช่วยส่วนใหญ่ · Restrict ที่ Rate/Override/HousekeepingLog/ChannelMap) — จดใน wo-notes ให้ H.1/H.3

## 3. backfill «scripts/svc-h0-backfill.mts» (รันหลัง migrate deploy · idempotent · ข้ามร้าน · `--dry` ก่อนเสมอ)
1. `HotelReservation.status = 'BOOKED'` → `CONFIRMED` (UPDATE ชุดเดียว · นับแถว)
2. ทุกการจอง status ∈ CONFIRMED/CHECKED_IN ที่ยังไม่มี `HotelBookingNight` → สร้างคืน `[checkInDate, checkOutDate)` ราคา = `ratePerNightSatang` · `priceSource='MANUAL'` · `roomId` = reservation.roomId · `counted = true` · CHECKED_OUT/CANCELLED/NO_SHOW/REFUNDED → สร้างด้วย `counted=false` (ประวัติ)
3. การจอง CONFIRMED/CHECKED_IN ที่ไม่มี `RoomOccupancy` active (kind STAY · refType "HotelReservation") และมี `roomId` → `claimRoom` ผ่าน facade rooms (ไม่เขียน occupancy ตรง) · ชน ⇒ รายงาน `CONFLICT` ไม่ทับ (= เส้น legacy ของ `stayLoad` ถอดได้ใน H.3 เมื่อ CONFLICT = 0)
4. `HotelFolio` OPEN ให้การจอง CONFIRMED/CHECKED_IN ที่ไม่มี folio · ไม่สร้าง item (ค่าห้องจะ post โดย audit H.7 · มัดจำเดิมที่ `depositPaidAt` ≠ null → item `DEPOSIT` ลบ refType "PosSale" refId `depositSaleId`)
5. `policySnapshot` ว่างคงว่าง (การจองเดิมไม่มีนโยบาย — H.3 อ่าน null = ไม่มีขั้นบันได คืน 0)
พิมพ์ `BACKFILL_SUMMARY {bookedToConfirmed, nightsCreated, occupancyClaimed, occupancyConflict, foliosCreated}` · รันซ้ำ = ทุกตัว 0 · ข้อสอบรันบนฐาน QC (bansuan-hotel + การจองจาก oracle P1)

## 4. migration (SVC-RUN §1.1 ข้อ 5 · ห้าม migrate dev)
1. schema เดิม: `git archive <ฐาน> prisma/schema | tar -x -C /tmp/svc-h0-base`
2. `bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec prisma migrate diff --from-schema /tmp/svc-h0-base/prisma/schema --to-schema prisma/schema --script > prisma/migrations/<ts>_svc_h/migration.sql`
3. **อ่าน SQL ทุกบรรทัด**: ไม่มี DROP/RENAME/เปลี่ยนชนิด/SET NOT NULL/UPDATE/DELETE · `ALTER TYPE "HotelReservationStatus" ADD VALUE` 3 ค่า (แยก statement · PG ห้ามใช้ค่าใหม่ใน tx เดียวกัน ⇒ backfill เป็นสคริปต์แยก ไม่อยู่ใน migration)
4. เติม SQL มือท้ายไฟล์: CHECK ของ §2 (ตารางใหม่ + คอลัมน์ใหม่ที่มี default) · partial/NULLS NOT DISTINCT unique 3 ตัว (RatePlan default · Rate · RateOverride)
5. ลงฐาน: `migrate deploy` → `prisma generate` **ในเลนที่ node_modules แยกเท่านั้น**
6. ตรวจซ้ำ `migrate diff` ต้องไม่เสนอ DROP ของ index/constraint มือ

## 5. scope (`src/lib/core/scope.ts` · fitness F1)
`HotelRatePlan` `HotelSeason` `HotelHoliday` `HotelRate` `HotelRateOverride` `HotelCancelRule` `HotelBookingNight` `HotelFolio` `HotelFolioItem` `HotelGuestRecord` `HotelHousekeepingLog` `HotelNightAudit` `ChannelRoomMap` `ChannelRateMap` `ChannelAriJob` `ChannelReservationInbox` `ChannelInventoryBuffer` = `unit`

## 6. ค่าตั้ง (registry · ไม่มี migration)
### 6.1 คีย์ใหม่ (ต่อท้ายบล็อกโรงแรม · ป้ายไทย · `chain` ตามตาราง · ทุกคีย์ร้านแก้/ปิดได้เอง = มติ Q1–Q3)
| คีย์ | ชนิด | ค่าเริ่ม | chain | หมายเหตุ |
|---|---|---|---|---|
| `rooms.hotel.bookingMode` | enum `AUTO_CONFIRM\|DEPOSIT_REQUIRED\|MANUAL_APPROVE` | DEPOSIT_REQUIRED | U | S:657 |
| `rooms.hotel.weekendDays` | table `number[]` (0=อาทิตย์) | `[5,6]` | U | S:655 |
| `rooms.hotel.dailyHousekeeping` | bool | true | U_RT | S:660 |
| `rooms.hotel.inspectionRequired` | bool | false | U | S:661 |
| `rooms.hotel.maxAdvanceBookingDays` | int 1..730 | 365 | U | S:662 |
| `rooms.hotel.codePrefix` | text 1..6 | "HR" | U | S:663 · คง HR- เดิม |
| `rooms.hotel.tax.mode` | enum `INCLUSIVE\|EXCLUSIVE` | INCLUSIVE | U | **Q1** · EXCLUSIVE = แยก VAT/เซอร์วิสชาร์จเป็นบรรทัด |
| `rooms.hotel.tax.vatBp` | percent 0..10000 | 700 | U | sensitivity MONEY |
| `rooms.hotel.tax.serviceChargeBp` | percent 0..10000 | 0 | U | MONEY · 1000 = 10% |
| `rooms.hotel.tax.invoiceFromPos` | bool | true | U | ออกใบกำกับจากบิล POS ตอนเช็กเอาต์ |
| `rooms.hotel.securityDeposit.enabled` | bool | **false** | U_RT | **Q3** · `securityDeposit` เดิมเป็นจำนวน |
| `rooms.hotel.securityDeposit.appliesTo` | enum `ALL\|WALK_IN` | ALL | U | |
| `rooms.hotel.guest.retainYears` | int 1..10 | 2 | U | **Q6** · `retainUntil` ของ GuestRecord |
| `rooms.hotel.guest.maskIdForStaff` | bool | true | U | Q6 |
| `rooms.hotel.guest.aiIdReader` | bool | **false** | U | **Q5** · requires integration (H.4 กำหนด kind) |
| `rooms.hotel.notify.channel` | enum `EMAIL\|LINE\|BOTH` | EMAIL | U | **Q9** |
| `rooms.hotel.storefront.customDomain` | bool | false | U | **Q11** · ใช้ `Tenant.customDomain` ที่มีอยู่ (`/app/settings/domain`) — คีย์นี้แค่เปิดเส้นทางโรงแรมบนโดเมนนั้น |
แก้ `rooms.hotel.deposit` schema: `kind` เพิ่ม `FIXED_AMOUNT` + `amountSatang: MONEY.optional()` (ค่าเริ่มคง FIRST_NIGHT) · `rooms.hotel.cancelPolicy` ค่าเริ่ม → `[{daysBefore:7,refundBp:10000},{daysBefore:3,refundBp:5000},{daysBefore:0,refundBp:0}]` (Q2) · `rooms.hotel.holdMinutesOnline` คง 15 (Q2)
### 6.2 `SNAPSHOTS.reservation` (CC §1.6 · H.3 จดตอนจอง)
`rooms.hotel.checkInTime` `checkOutTime` `deposit` `cancelPolicy` `noShow` `holdMinutesOnline` `holdMinutesCounter` `minNights` `securityDeposit` `securityDeposit.enabled` `tax.mode` `tax.vatBp` `tax.serviceChargeBp` `rooms.money.rounding` `rooms.locale.docLanguage`
### 6.3 scope RATE_PLAN (`service.ts`)
`SUPPORTED_SCOPES` + RATE_PLAN · `locateMany`: `hotelRatePlan.findMany({where:{tenantId, id in}})` → `known {TENANT, UNIT, RATE_PLAN}` · `entitiesOfUnit` + rate plan ACTIVE ของหน่วย · chain `RP`/`U_RP`/`RT_RP` ที่ประกาศไว้ใช้ได้จริง (ข้อสอบ: ตั้ง `rooms.hotel.cancelPolicy` ที่ชั้น RATE_PLAN แล้ว `resolveSetting` ด้วย `ratePlanId` ได้ค่านั้น · ratePlan ต่างร้าน ⇒ `SCOPE_NOT_FOUND`)

## 7. สิทธิ์ (`permissions.ts` โมดูล hotel · ต่อท้าย · ป้ายไทย)
`hotel.rates.read` "ดูราคาห้องพัก" · `hotel.rates.write` "ตั้งราคา/ฤดู/แผนราคา" · `hotel.settings.edit` "ตั้งค่าโรงแรม" · `hotel.booking.manage` "จัดการการจอง (ย้าย/ต่อ/ย่น/ไม่มา)" · `hotel.folio.post` "ลงรายการบิลห้อง" · `hotel.folio.void` "ยกเลิกรายการบิลห้อง" · `hotel.guest.register` "ลงทะเบียนผู้เข้าพัก (ร.ร.3/ตม.30)" · `hotel.guest.viewId` "ดูเลขบัตร/พาสปอร์ตเต็ม" · `hotel.housekeeping` "แม่บ้าน" · `hotel.housekeeping.inspect` "ตรวจห้องแม่บ้าน" · `hotel.audit.run` "ปิดวัน (night audit)" · `hotel.reports.read` "รายงานโรงแรม" · `hotel.channel.manage` "ช่องทาง OTA"
`rooms.hotel.*` ทุกคีย์ `editPermission` → `hotel.settings.edit` (เดิม `dorm.settings.edit` ใช้กับคีย์หอเท่านั้น — เปลี่ยนเฉพาะคีย์ใต้ helper `hotel()`)

## 8. ด่าน type HOTEL
hotel actions ทุกตัว + 3 หน้า + storefront `resolveHotelUnit` (มีแล้ว ตรวจ "HOTEL") · ข้อสอบ: หน่วย DORM เรียก `createReservationAction` ⇒ `{ok:false}` · เปิด `/app/u/<dorm>/hotel` ⇒ 404

## 9. regression (หมวด G · exit 0)
`qc-hotel-money` `qc-hotel-public` `qc-hotel-refund` (oracle P1 — ต้องเขียว **หลัง** backfill: การจอง BOOKED ใหม่ที่ oracle สร้างยังเขียนค่า BOOKED ได้ เพราะ enum ยังมี) · `qc-svc-r0.8` `qc-svc-r0.9` `qc-svc-r0.3` `qc-svc-r0.4` (settings) · `qc-svc-d.0` `qc-svc-d.13` (ค่าตั้งหอไม่เปลี่ยน) · `qc-svc-smoke` · fitness 2 โหมด

## 10. เกณฑ์รับ
ข้อสอบเขียวทุกข้อ · typecheck ทรีรวม (`ISO_MEM=9500M NODE_OPTIONS=--max-old-space-size=8192`) · fitness F1 (scope ครบ) · `migrate diff` ซ้ำว่าง · `BACKFILL_SUMMARY` รอบ 2 = 0 ทุกตัว · ไม่มี `any` · รายงานแถว CONFLICT ของ backfill (ควร 0 บน QC)

## 11. ส่งต่อใบหลัง (จดใน wo-notes)
- **H.1**: ตาราง 2.4–2.9 + คีย์ 6.1 + scope RATE_PLAN · ฟิกซ์เจอร์แผน STANDARD (ผู้คุม) · `priceSource` ของ nights
- **H.3**: เลิกเส้น legacy `stayLoad` เมื่อ CONFLICT=0 · เขียน `policySnapshot` ทุกการจองใหม่ · ห้ามเขียน BOOKED · `groupId`
- **H.4**: `idNumberEnc` ผ่าน secret-box · `retainUntil` + งานลบข้ามร้าน · `hotel.guest.viewId`
- **H.5**: folio ที่ backfill ไม่มี ROOM item (audit H.7 post ย้อนหลังเฉพาะคืน ≥ วันเปิดใช้)
- **H.10**: ตาราง 2.14 · `requires.integration` = CHANNEL_MANAGER
- เช็กลิสต์ deploy: `ALTER TYPE ADD VALUE` 3 ค่าลงก่อน client · รัน backfill `--dry` แล้วจริง · ตรวจ CONFLICT ก่อนปล่อย H.3

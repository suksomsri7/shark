# ใบสั่ง D.0 — migration `svc_d` (หอพัก 12 ตาราง + `AccountDocSource.DORM` + หนี้ดัชนีจาก R0.6/R0.8) · ตรวจ **เบา**

> แหล่งความจริง: `ledger/SVC-MASTER-PLAN.md` แถว D.0 · CC §6.2 §9 (ไม่มี DormSlip/DormLinkCode · `policySnapshot`) + ภาคต่อ · `ledger/DESIGN-DORM-HOTEL.md` §10 · หนี้ดัชนี `ledger/wo-notes/svc-r0.8-carry.md` (§"หนี้ดัชนีจาก R0.8" · มติ D.0 · R0.6 ส่งต่อ) · `ledger/wo-notes/svc-deploy-checklist.md` · กติกา `ledger/SVC-RUN.md` §1.1 ข้อ 5
> ข้อสอบ (ห้ามแก้): `scripts/qc-svc-d.0.mts` — รับใบ = **ผ่านทุกข้อ ไม่มี SKIP** (นับจากบรรทัด `JSON_SUMMARY`)
> รัน: `bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.0.mts` (ห้าม `timeout` ครอบ · หมวด G เรียก regression ต่อกันหลายนาที · `SVC_D0_NO_REGRESSION=1` ข้าม G ระหว่างทำงาน แต่ SKIP ไม่นับผ่าน)
> builder: **ห้าม build/next · ห้าม commit/push · ห้าม `pnpm install` · ห้าม `prisma format` ทั้งชุด · ห้าม `migrate dev`** · ทำในเลน l2 เท่านั้น (node_modules แยกของ l2 — `prisma generate` ได้ที่นี่ที่เดียว) · temp ขึ้นต้น `svc-d0-` · รายงานต่อข้อ (id → ผล)
> ฐานเทียบ (git diff ในข้อสอบ) = `93a42093`

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ (แตะนอกนี้ = ตีกลับ)
| ไฟล์ | ทำอะไร |
|---|---|
| «prisma/schema/dorm.prisma» (ใหม่) | 12 โมเดล §2 + คอมเมนต์บอก constraint/index SQL มือทุกตัว (ชื่อ) |
| `prisma/schema/hotel.prisma` | **เพิ่มเท่านั้น**: `RoomOccupancy` 2 `@@index` · `HotelRoom` `@@index([buildingId])` + relation field `dormLeases DormLease[]` `dormMeters DormMeter[]` · คอมเมนต์ index มือ 2 ตัว (§3) |
| `prisma/schema/account.prisma` | `enum AccountDocSource` + `DORM` **ต่อท้าย** (บรรทัดเดียว + คอมเมนต์) |
| `prisma/schema/integration.prisma` | `IntegrationCallLog` + `@@index([at])` |
| `prisma/schema/payment.prisma` | คอมเมนต์อย่างเดียว (บอก index มือ `PaymentSlip_tenantId_idempotencyKey_key`) |
| «prisma/migrations/<ts>_svc_d/migration.sql» | migration เดียวของใบ (§4) |
| `src/lib/core/scope.ts` | 12 บรรทัดเพิ่ม (§5) |
| `src/lib/payment/slip-verify.ts` | เฉพาะ `keyWhere`/`findByKey` → raw query ใช้ดัชนีนิพจน์ (§3 ข้อ 6) · ส่วนอื่นห้ามแตะ |
| `scripts/qc-acc-v2-schema.mts` | บรรทัด `enum AccountDocSource ครบ 8 ค่า` → `ครบ 9 ค่า (… SVC D.0 เพิ่ม DORM)` + ค่าคาด `"MANUAL,AI,IMPORT,INBOX,CRM,POS,RECURRING,API,DORM"` — แก้แค่ข้อนี้ (ข้อสถิตเก่าที่ผูกจำนวนค่า enum) |

ห้ามแตะ: โค้ด `src/**` อื่นทั้งหมด (โมดูลหอ/บัญชีเป็นของ D.2+) · `prisma/schema/*.prisma` อื่น · ชุดข้อสอบอื่น · ข้อสอบ
ไม่มี: `DormSlip` (→ `PaymentSlip`) · `DormLinkCode` (→ `ChatLinkCode`) · `settingsSnapshot` (→ `policySnapshot`) · ตาราง `Setting*`/`Integration*` ใหม่ (CC §9) · ดัชนี `ChatLinkCode.expiresAt` (chat.prisma เป็นของ R0.7 ที่กำลังทำ — ไม่ใส่ในใบนี้)

## 2. ตารางใหม่ (ข้อสอบ T ตรวจ **ชุดคอลัมน์ตรงตัว** ชนิด/null/default · ชื่อ constraint/index ตั้งเองได้ ยกเว้นที่ระบุ)
กติการ่วม: ทุกตารางมี `id String @id @default(cuid())` · `tenantId String` · `unitId String` (ยกเว้น `DormAuthorityTariff`) · `createdAt DateTime @default(now())` · `updatedAt DateTime @updatedAt` (ยกเว้น `DormAnnouncementRead`) — ไม่เขียนซ้ำในตารางล่าง · **เงิน = `Int` สตางค์ ชื่อลงท้าย `Satang` + CHECK `>= 0`** · id ข้ามโมดูล (party/file/user/doc/card/approval) = `String` หลวม **ไม่มี FK** · `periodKey` = `"YYYY-MM"` CHECK `"periodKey" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'` · วัน (`@db.Date`) = วันไทย · `endDate` ไม่รวมวันจบ (แบบ `RoomOccupancy`)

### 2.1 `DormLease` (สัญญา · DH A2)
| คอลัมน์ | Prisma | หมายเหตุ |
|---|---|---|
| roomId | `String` | FK → `HotelRoom` **onDelete: Restrict** |
| partyId | `String` | ผู้เช่าหลัก (Party) |
| coTenants | `Json?` | ผู้พักร่วม/รถ |
| status | `String @default("DRAFT")` | CHECK `IN ('DRAFT','ACTIVE','NOTICE','ENDED','CANCELLED')` |
| termType | `String @default("FIXED")` | ไม่บังคับ CHECK (D.5 เคาะค่า) |
| startDate | `DateTime @db.Date` | |
| endDate | `DateTime? @db.Date` | null = ไม่กำหนดวันจบ (carry: D.5 ตกลงรูปแบบ) · CHECK `"endDate" IS NULL OR "endDate" > "startDate"` |
| rentSatang | `Int` | |
| commonFeeSatang · depositSatang · advanceRentSatang · bookingFeeSatang | `Int @default(0)` | bookingFee = เงินจองก่อนเข้า (หักเข้าประกันวันเข้า) |
| occupancyId | `String?` | แถว `RoomOccupancy(kind LEASE)` |
| signedAt | `DateTime?` | |
| signatureFileId · templateKey | `String?` | |
| templateVersion | `Int?` | |
| moveInPhotos | `Json?` | fileId[] |
| depositDocumentId · previousLeaseId · endReason · createdById | `String?` | previousLeaseId = ต่อสัญญา/ย้ายห้อง |
| endedAt | `DateTime?` | |
| policySnapshot | `Json?` | CC §1.6 (`SNAPSHOT_KEYS.lease` — dueDay/ค่าปรับอ่านจาก snapshot ไม่มีคอลัมน์ซ้ำ) |
ดัชนี: `@@index([tenantId, unitId, status])` · `@@index([roomId])` · `@@index([partyId])` · CHECK เงิน 5 ตัว `>= 0`

### 2.2 `DormMeter` (DH A3)
| คอลัมน์ | Prisma | หมายเหตุ |
|---|---|---|
| roomId | `String?` | FK → `HotelRoom` **Restrict** · null = มิเตอร์หลัก |
| buildingId | `String?` | มิเตอร์หลักต่ออาคาร (id หลวม) |
| kind | `String` | CHECK `IN ('ELEC','WATER')` |
| role | `String @default("ROOM")` | CHECK `IN ('ROOM','MAIN')` + CHECK `("role" = 'ROOM') = ("roomId" IS NOT NULL)` |
| serial · replacedById · note | `String?` | replacedById = มิเตอร์ตัวใหม่ที่มาแทน (ฟลว์เปลี่ยนมิเตอร์) |
| digits | `Int?` | หลักหน้าปัด (rollover · `calc.ts` MeterSegment) CHECK `IS NULL OR BETWEEN 1 AND 12` |
| startReading | `Int @default(0)` | CHECK `>= 0` |
| installedAt | `DateTime @default(now())` | |
| removedAt | `DateTime?` | null = ใช้งานอยู่ |
ดัชนี: `@@index([tenantId, unitId])` · **SQL มือ** partial unique `ON ("roomId","kind") WHERE "removedAt" IS NULL AND "roomId" IS NOT NULL` (ห้อง 1 ห้อง มิเตอร์ไฟ/น้ำที่ใช้งานได้ชนิดละ 1)

### 2.3 `DormMeterReading`
| คอลัมน์ | Prisma | หมายเหตุ |
|---|---|---|
| meterId | `String` | FK → `DormMeter` **Restrict** |
| periodKey | `String` | CHECK รูปแบบ |
| kind | `String @default("PERIOD")` | CHECK `IN ('PERIOD','MOVE_IN','MOVE_OUT','REPLACE')` (มิเตอร์วันเข้า/ออก/เปลี่ยน ไม่ชนงวด) |
| leaseId · photoFileId · flag · flagNote · readById · confirmedById | `String?` | flag = ป้ายผิดปกติ (D.6 เคาะค่า · ไม่บังคับ CHECK) |
| value | `Int` | CHECK `>= 0` |
| aiValue | `Int?` | ค่าที่ AI เสนอ (D.14 · ไม่ใช่ค่าบันทึก) |
| readAt | `DateTime @default(now())` | |
| source | `String @default("MANUAL")` | CHECK `IN ('MANUAL','AI','IOT','IMPORT')` |
| confirmedAt | `DateTime?` | |
ดัชนี: `@@index([tenantId, unitId, periodKey])` · `@@index([meterId, readAt])` · **SQL มือ** partial unique `ON ("meterId","periodKey") WHERE "kind" = 'PERIOD'` (idempotent ต่อ meter×period — D.6 ออฟไลน์ส่งซ้ำ)

### 2.4 `DormUtilityRate` (บิลการไฟฟ้า/ประปารายเดือนของหอ · DH A4)
| คอลัมน์ | Prisma | หมายเหตุ |
|---|---|---|
| buildingId | `String?` | null = ทั้งหน่วย |
| kind | `String` | CHECK `IN ('ELEC','WATER')` |
| periodKey | `String` | CHECK รูปแบบ |
| mode | `String` | CHECK `IN ('ACTUAL_COST','TARIFF','FIXED_RATE','FLAT')` (= `rooms.utility.*.method`) |
| authorityBillSatang · rateSatangPerUnit | `Int?` | CHECK `IS NULL OR >= 0` · rate = ผล `actualCostRate` (สตางค์/หน่วย ปัดลง) |
| authorityUnits | `Int?` | CHECK `IS NULL OR >= 0` |
| billPhotoFileId · enteredById | `String?` | |
| legalCheck | `Json?` | ผลตัวตรวจกฎหมายรายเดือน (D.7) |
ดัชนี: **SQL มือ** unique `ON ("unitId","buildingId","kind","periodKey") NULLS NOT DISTINCT` (PG 18 · null อาคารห้ามซ้ำ) · `@@index([tenantId, unitId])`

### 2.5 `DormAuthorityTariff` (ตารางอัตรา กฟภ./กฟน./ประปา มีวันที่มีผล · **ไม่มี tenantId/unitId** · ใช้ร่วมทุกร้าน)
| คอลัมน์ | Prisma | หมายเหตุ |
|---|---|---|
| authority | `String` | "PEA"/"MEA"/"PWA"/"MWA"/… (ไม่บังคับ CHECK) |
| kind | `String` | CHECK `IN ('ELEC','WATER')` |
| tariffCode | `String` | ประเภทผู้ใช้ เช่น "1.1.2" |
| label · sourceUrl · note | `String?` | |
| effectiveFrom | `DateTime @db.Date` | |
| effectiveTo | `DateTime? @db.Date` | CHECK `IS NULL OR "effectiveTo" > "effectiveFrom"` |
| tiers | `Json` | `[{uptoUnits:int\|null, rateE4:int}]` ตรง `TariffTier` ใน `calc.ts` |
| ftE4 | `Int @default(0)` | **ติดลบได้** (Ft เคยติดลบ) — ไม่มี CHECK |
| serviceSatang | `Int?` | ค่าบริการรายเดือน CHECK `IS NULL OR >= 0` |
ดัชนี: `@@unique([authority, kind, tariffCode, effectiveFrom])`

### 2.6 `DormBillRun` (DH A5)
periodKey `String` (CHECK) · status `String @default("DRAFT")` CHECK `IN ('DRAFT','REVIEW','SENT','CLOSED')` · issueDate `DateTime? @db.Date` · dueDate `DateTime? @db.Date` · scheduledSendAt `DateTime?` · sentAt `DateTime?` · billCount `Int @default(0)` CHECK `>= 0` · totalSatang `Int @default(0)` · progress `Json?` (ทำเป็นชุด รันซ้ำต่อได้ — D.8) · createdById `String?`
ดัชนี: `@@unique([unitId, periodKey])` · `@@index([tenantId, unitId, status])`

### 2.7 `DormBill`
| คอลัมน์ | Prisma | หมายเหตุ |
|---|---|---|
| runId | `String` | FK → `DormBillRun` **Restrict** |
| leaseId | `String` | FK → `DormLease` **Restrict** |
| roomId · partyId | `String` | หลวม (ค้น/รายงาน) |
| periodKey | `String` | CHECK รูปแบบ |
| status | `String @default("DRAFT")` | CHECK `IN ('DRAFT','HELD','SENT','PARTIALLY_PAID','PAID','VOID')` · HELD = พักบิล (มิเตอร์ผิดปกติ) |
| holdReason · accountDocumentId · paymentRequestId · sentVia | `String?` | |
| lines | `Json` | snapshot บรรทัด (`DormBillLine[]` ของ `calc.ts`) |
| subtotalSatang · totalSatang | `Int` | |
| vatSatang · paidSatang · carriedSatang | `Int @default(0)` | carried = ยอดยกไปบิลถัดไป |
| dueDate | `DateTime? @db.Date` | |
| sentAt · paidAt | `DateTime?` | |
| policySnapshot | `Json?` | `SNAPSHOT_KEYS.bill` |
ดัชนี: **`@@unique([leaseId, periodKey])`** (1 สัญญา × 1 งวด = 1 บิล · X3) · `@@unique([accountDocumentId])` · `@@index([runId])` · `@@index([tenantId, unitId, periodKey])` · `@@index([tenantId, unitId, status])` · `@@index([partyId])` · CHECK เงิน 5 ตัว `>= 0` (ไม่บังคับความสัมพันธ์ระหว่างยอด — จ่ายเกินได้)

### 2.8 `DormMoveOut` (DH A9)
leaseId `String @unique` FK → `DormLease` **Restrict** (ยกเลิกแล้วแจ้งใหม่ = ใช้แถวเดิม) · status `String @default("NOTICE")` CHECK `IN ('NOTICE','INSPECTED','SETTLED','REFUNDED','CANCELLED')` · noticeAt `DateTime @default(now())` · moveOutDate `DateTime @db.Date` · inspection `Json?` · deductions `Json?` · depositSatang · deductSatang · refundSatang `Int @default(0)` (CHECK `>= 0`) · refundDueAt `DateTime?` · refundedAt `DateTime?` · settlementDocumentId · approvalId · createdById `String?`
ดัชนี: `@@index([tenantId, unitId, status])` · `@@index([refundDueAt])` (งานนับถอยหลังคืนประกันข้ามร้าน)

### 2.9 `DormRepair` · 2.10 `DormAnnouncement` + `DormAnnouncementRead` · 2.11 `DormParcel` (DH A10 · D2)
- **DormRepair**: roomId `String` (หลวม) · leaseId · partyId · preferredTime · kanbanCardId · ratingNote `String?` · category `String` · text `String` · files `Json?` · allowEntry `Boolean @default(false)` · status `String @default("OPEN")` CHECK `IN ('OPEN','IN_PROGRESS','DONE','CANCELLED')` · rating `Int?` CHECK `IS NULL OR BETWEEN 1 AND 5` · doneAt `DateTime?` — ดัชนี `@@index([tenantId, unitId, status])` · `@@index([roomId])`
- **DormAnnouncement**: title `String` · body `String` · audience `String @default("ALL")` CHECK `IN ('ALL','BUILDING','FLOOR','ROOM')` · audienceIds `Json?` · publishedAt `DateTime?` · createdById `String?` — `@@index([tenantId, unitId, publishedAt])`
- **DormAnnouncementRead** (ไม่มี createdAt/updatedAt): announcementId `String` FK → `DormAnnouncement` **onDelete: Cascade** · partyId `String` · readAt `DateTime @default(now())` — **`@@unique([announcementId, partyId])`** (นับอ่านไม่ซ้ำ) · `@@index([tenantId, unitId])`
- **DormParcel**: roomId `String` (หลวม) · leaseId · partyId · carrier · trackingNo · photoFileId · receivedById · pickedUpByPartyId · signatureFileId `String?` · status `String @default("WAITING")` CHECK `IN ('WAITING','PICKED_UP','RETURNED')` · receivedAt `DateTime @default(now())` · pickedUpAt · lastRemindedAt `DateTime?` · remindCount `Int @default(0)` CHECK `>= 0` — `@@index([tenantId, unitId, status])` · `@@index([roomId])`

**FK ทั้งหมดของใบ (ข้อสอบ K ตรงชุด)**: DormLease.roomId→HotelRoom (RESTRICT) · DormMeter.roomId→HotelRoom (RESTRICT) · DormMeterReading.meterId→DormMeter (RESTRICT) · DormBill.runId→DormBillRun (RESTRICT) · DormBill.leaseId→DormLease (RESTRICT) · DormMoveOut.leaseId→DormLease (RESTRICT) · DormAnnouncementRead.announcementId→DormAnnouncement (CASCADE) — ไม่มี FK อื่น
⚠️ สคริปต์ล้าง QC ที่ลบ `hotelRoom` ต้องลบแถวหอก่อน (แบบ roomOccupancy · carry R0.1) — ใบนี้ไม่แก้สคริปต์ล้าง (ยังไม่มีแถวหอ) · จดใน wo-notes ให้ D.5

## 3. หนี้ดัชนี/constraint (carry R0.6/R0.8 → ใบนี้)
1. `RoomOccupancy` `@@index([tenantId, refType, refId])` · `@@index([tenantId, unitId, startDate])` (Prisma)
2. **SQL มือ** partial index `ON "RoomOccupancy"("holdExpiresAt") WHERE "active" AND "kind" IN ('HOLD','CHANNEL_HOLD')` — ข้อสอบ EXPLAIN คิวรีเดียวกับ `expireHolds` (`rooms/occupancy.ts`) ต้องใช้ดัชนีนี้
3. **SQL มือ** partial unique `ON "RoomOccupancy"("refType","refId") WHERE "active" AND "kind" = 'STAY'` (มติผู้คุม R0.8 — การจองโรงแรมถือห้องจริงได้ 1 แถว active)
4. `HotelRoom` `@@index([buildingId])`
5. `IntegrationCallLog` `@@index([at])` (purge ตามอายุข้ามร้าน)
6. **SQL มือ** unique นิพจน์ `CREATE UNIQUE INDEX "PaymentSlip_tenantId_idempotencyKey_key" ON "PaymentSlip"("tenantId", ("checks"->>'idempotencyKey'))` + แก้ `slip-verify.ts`: `findByKey` = `$queryRaw` `SELECT "id" FROM "PaymentSlip" WHERE "tenantId" = ${tenantId} AND ("checks"->>'idempotencyKey') = ${key} LIMIT 1` แล้วอ่านแถว (select `LITE` เดิม) · ลบ `keyWhere` (JSON path) · advisory lock + จับ unique violation เดิมคงไว้ — ข้อสอบ EXPLAIN รูปคิวรีนี้ต้องใช้ดัชนี · `qc-svc-r0.6` ต้องเขียวเท่าเดิม
- ก่อนสร้าง unique ข้อ 3/6 บน prod: ตรวจข้อมูลซ้ำก่อน (qc-svc ตอนนี้ 0 แถว · ตารางทั้งสองเป็นของ SVC ยังไม่ขึ้น prod) — จดในเช็กลิสต์ deploy

## 4. migration (SVC-RUN §1.1 ข้อ 5 · ห้าม migrate dev)
1. schema เดิม: `mkdir -p /tmp/svc-d0-base && git -C /root/projects/shark-svc-l2 archive 93a42093 prisma/schema | tar -x -C /tmp/svc-d0-base`
2. โฟลเดอร์ `<ts>_svc_d` (ts 14 หลัก **มากกว่า** `20261222000000` เช่น `20261223000000_svc_d`) แล้ว
   `bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec prisma migrate diff --from-schema /tmp/svc-d0-base/prisma/schema --to-schema prisma/schema --script > prisma/migrations/<ts>_svc_d/migration.sql`
3. **อ่าน SQL ทุกบรรทัด**: ไม่มี DROP/RENAME/เปลี่ยนชนิด/SET NOT NULL/UPDATE/DELETE · แตะเฉพาะตาราง `Dorm*` 12 ตัว + **ดัชนี**บน `RoomOccupancy` `HotelRoom` `PaymentSlip` `IntegrationCallLog` + `ALTER TYPE "AccountDocSource" ADD VALUE 'DORM'` (ตัวเดียว) — เจอ Hr*/Pos*/ตารางอื่น/`ALTER TABLE` ตารางเดิม = diff ผิดฐาน → หยุด
4. เติม SQL มือท้ายไฟล์: CHECK ทุกตัวของ §2 (ตารางใหม่เท่านั้น — ตารางเดิม **ไม่มี CHECK ใหม่** ในใบนี้ · ถ้าวันหน้าต้องมีบนตารางมีข้อมูล = `NOT VALID` แล้ว `VALIDATE CONSTRAINT` แยกคำสั่ง ตามเช็กลิสต์) · partial/นิพจน์/NULLS NOT DISTINCT ทั้ง 6 ตัว (§2.2 §2.3 §2.4 §3 ข้อ 2 3 6) · **ห้าม** `CONCURRENTLY` (Prisma 7.8 รันทีละคำสั่ง แต่ห้ามปน) · ห้าม `CREATE EXTENSION`
5. ลงฐาน: `bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec prisma migrate deploy` → `bash scripts/iso.sh pnpm exec prisma generate` (ในเลน l2 เท่านั้น)
6. ตรวจซ้ำ: `migrate diff --from-schema <ฐาน> --to-schema prisma/schema` ต้องไม่เสนอ DROP ของ index/constraint มือ (ถ้าเสนอ = คอมเมนต์บอกใน .prisma แล้วลบบรรทัด DROP จาก SQL)

## 5. scope (`src/lib/core/scope.ts` · fitness F1)
`DormLease` `DormMeter` `DormMeterReading` `DormUtilityRate` `DormBillRun` `DormBill` `DormMoveOut` `DormRepair` `DormAnnouncement` `DormAnnouncementRead` `DormParcel` = `unit` · `DormAuthorityTariff` = `g("ตารางอัตราการไฟฟ้า/ประปาของรัฐ ใช้ร่วมทุกร้าน — เขียนเฉพาะ backoffice/สคริปต์แพลตฟอร์ม")` (global + why)

## 6. regression (ข้อสอบหมวด G เรียกเอง · exit 0)
`qc-hotel-money` `qc-hotel-public` `qc-hotel-refund` · `qc-svc-r0.8` `qc-svc-r0.6` `qc-svc-d.1` `qc-svc-smoke` · บัญชี V2 ที่เขียน/อ่าน `AccountDocument.source`: `qc-acc-v2-schema` (**ยอมแดงเฉพาะข้อ `pnpm drift`** = drift HR ของ qc-svc · baseline ก่อนใบแดงข้อเดียวนี้) `qc-acc-v2-recurring` `qc-acc-v2-import` `qc-account-api-write-docs` `qc-pos-account` (baseline 28 ต.ค. บน qc-svc: เขียวทั้ง 4 · `qc-acc-v2-inbox` ต้องมี seed บัญชี ⇒ ไม่ใช้)

## 7. เกณฑ์รับ
ข้อสอบเขียวทุกข้อ (ไม่มี SKIP) · typecheck ทรีรวม (`ISO_MEM=9000M NODE_OPTIONS=--max-old-space-size=7168`) · fitness 2 โหมด · ไม่มี `any` · รายงานข้อมูลซ้ำก่อนสร้าง unique (ข้อ 3/6) ในรายงาน

## 8. ส่งต่อใบหลัง (จดใน wo-notes ตอนรับใบ)
- **D.2**: `AccountDocSource.DORM` ใช้ได้แล้ว (enum ลงก่อน client ที่เขียน DORM — เช็กลิสต์ deploy) · `DormBill.accountDocumentId` unique · `DormLease.depositDocumentId` · `DormMoveOut.settlementDocumentId`
- **D.5**: รูปแบบสัญญาไม่มีวันจบ (`endDate` null + `termType`) vs `RoomOccupancy.endDate` บังคับ · ค่าที่ล็อก (dueDay/ค่าปรับ) อ่านจาก `policySnapshot` · สคริปต์ล้าง QC ลบแถวหอก่อน `hotelRoom`
- **D.6**: ค่า `flag` · `kind` MOVE_IN/MOVE_OUT/REPLACE ไม่ชนงวด · เปลี่ยนมิเตอร์ = ตั้ง `removedAt` ตัวเก่าก่อนสร้างตัวใหม่ (partial unique)
- **D.7**: ตารางระบบ `DormAuthorityTariff` (global · เขียนเฉพาะ backoffice) · `DormUtilityRate` unique NULLS NOT DISTINCT ⇒ ใช้ findFirst + create ใน tx (Prisma ไม่มี compound unique ให้ upsert)
- **D.8**: `DormBillRun` 1 รอบ/หน่วย/งวด · `progress` · บิล X3 พึ่ง unique (lease, period)
- เช็กลิสต์ deploy: `ALTER TYPE "AccountDocSource" ADD VALUE 'DORM'` ลงก่อน client · ตรวจซ้ำ STAY/idempotencyKey ก่อนสร้าง unique

# ใบสั่ง B.0 — migration `svc_b` (จองคิว + POS 2 คอลัมน์) + ค่าตั้งจองคิว «defs/booking.ts» · ตรวจ **เข้ม** (เงิน: คอลัมน์ POS)

> แหล่งความจริง: `ledger/SVC-MASTER-PLAN.md` แถว B.0 · CC §1.3 §1.6 §6.1 §8 §10 ข้อ 2 · `ledger/DESIGN-BOOKING-QUEUE.md` §4.4 §4.5 §9 + ภาคผนวก ก · กติกา `ledger/SVC-RUN.md` §1 (ข้อ 3 POS 2 จุด · ข้อ 5 migration)
> ข้อสอบ (ห้ามแก้): `scripts/qc-svc-b.0.mts` — รับใบ = **ผ่านทุกข้อ ไม่มี SKIP** (นับข้อจากบรรทัด `JSON_SUMMARY`)
> รัน: `bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-b.0.mts` (ห้าม `timeout` ครอบ · ข้อสอบเรียกชุด regression เองตอนท้าย — นาน)
> builder: **ห้าม build/next · ห้าม commit/push · ห้าม `pnpm install` · ห้าม `prisma format` ทั้งชุด · ห้าม `migrate dev`** · รายงานต่อข้อ (id → ผล)
> ฐานเทียบ (git diff ในข้อสอบ) = `8ff682d5`

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ (แตะนอกนี้ = ตีกลับ)
| ไฟล์ | ทำอะไร |
|---|---|
| `prisma/schema/booking.prisma` | enum `AppointmentStatus` + 3 ค่าต่อท้าย · คอลัมน์ `Appointment` · โมเดล `BookingStaffService` `SvcResource` (+ relation field บน BookingStaff/BookingService ได้) |
| `prisma/schema/queue.prisma` | `QueueTicket.etaAt` |
| `prisma/schema/pos.prisma` | **3 คอลัมน์เท่านั้น** (§2.4) — POS จุดที่ 1–2 ที่เจ้าของอนุญาต |
| «prisma/migrations/<ts>_svc_b/migration.sql» | migration เดียวของใบ (§3) |
| `src/lib/core/scope.ts` | `BookingStaffService: unit` · `SvcResource: unit` (บรรทัดเพิ่ม) |
| «src/lib/core/settings/defs/booking.ts» (ใหม่ · pure) | §4 |
| `src/lib/core/settings/index.ts` | `import "./defs/booking";` (บรรทัดเพิ่ม) |
| `src/lib/core/settings/types.ts` | **เพิ่มอย่างเดียว**: `TemplateDef.hiddenUntil?: string` (ผู้คุมอนุญาตแก้ชิ้นกลางจุดนี้ในใบนี้ — ไม่มีบรรทัดลบ) |
| `src/lib/core/permissions.ts` | โมดูล booking + `booking.settings.edit` "แก้ค่าตั้งจองคิว" · `booking.settings.money` "แก้ค่าตั้งจองคิวเรื่องเงิน (มัดจำ · ค่าคอมฯ)" (คีย์อื่นใน CC §8 ยังเป็นของ B.11) |
| `src/lib/actions/booking.ts` | `setStatusAction` รับเฉพาะ 6 สถานะเดิม (§2.5) |
| ไฟล์ booking/UI อื่นเท่าที่ tsc บังคับ (เช่น ป้ายสถานะ) | แก้ให้ tsc ผ่านเท่านั้น ไม่เพิ่มพฤติกรรม |
| `scripts/pos-qc-env.mts` | §5 (allowlist ทดสอบ — ไม่ใช่โค้ด POS) |

ห้ามแตะ: `src/lib/core/settings/{service,registry,template}.ts` · `legal/` · `defs/{rooms,payments,messaging,_fixture}.ts` · โค้ด POS ทุกไฟล์ (`src/**/pos/**` ฯลฯ — ฟังก์ชัน POS เป็นของ B.10) · `scripts/lib/pos-prod-writer-guard.mts` (allowlist สคริปต์เขียน **production** — ห้ามใส่ ep-mute-scene) · ข้อสอบ

## 2. schema (ข้อสอบ T/I/K/C/N ตรวจตรงตัว · ชื่อดัชนี/constraint ตั้งเองได้)
### 2.1 `Appointment` + คอลัมน์ (เดิมทุกคอลัมน์คงเดิม · `staffId` ยังบังคับ)
| คอลัมน์ | Prisma | หมายเหตุ |
|---|---|---|
| `kind` | `String @default("BOOKED")` | CHECK `IN ('BOOKED','WALKIN')` · แถวเดิมได้ BOOKED เอง (ไม่ backfill) |
| `assignMode` | `String @default("SPECIFIC")` | CHECK `IN ('SPECIFIC','ANY')` |
| `channel` | `String?` | ONLINE/LINE/PHONE/STAFF/KIOSK/REMOTE (ไม่บังคับ CHECK) |
| `checkedInAt` `startedAt` `doneAt` `lateAt` `plannedStartAt` | `DateTime?` | |
| `plannedStaffId` `resourceId` `groupId` `queueTicketId` `manageTokenHash` `heldCartId` `rescheduledFromId` `cancelReason` | `String?` | id หลวม **ไม่มี FK** · `manageTokenHash` = hash ของ token (ไม่เก็บ token ดิบ · X7) |
| `rescheduleCount` | `Int @default(0)` | CHECK `>= 0` |
| `policySnapshot` | `Json?` | CC §1.6 |
ดัชนีเพิ่ม: `@@unique([manageTokenHash])` · `@@index([groupId])` · `@@index([queueTicketId])`
enum: `AppointmentStatus` + `QUEUED` `IN_SERVICE` `LATE` **ต่อท้ายตามลำดับนี้** (SQL `ALTER TYPE … ADD VALUE` ไม่มี BEFORE/AFTER)

### 2.2 `BookingStaffService` (ใหม่ · ไม่มีแถว = ช่างทำทุกบริการ)
`id String @id @default(cuid())` · `tenantId` `unitId` `staffId` `serviceId` (String) · `durationMin Int?` · `priceSatang Int?` · `createdAt @default(now())` · `updatedAt @updatedAt`
— `@@unique([staffId, serviceId])` · `@@index([tenantId, unitId])` · FK `staffId`→BookingStaff **onDelete: Cascade** · `serviceId`→BookingService **onDelete: Cascade** · CHECK `durationMin IS NULL OR durationMin > 0` · `priceSatang IS NULL OR priceSatang >= 0`

### 2.3 `SvcResource` (ใหม่ · ร้านนวดใช้ใน B.13 — สร้างตอนนี้เพื่อไม่ต้องมี migration ใน B2)
`id` · `tenantId` `unitId` `kind` `name` (String) · `capacity Int @default(1)` · `cleanupMin Int @default(0)` · `active Boolean @default(true)` · `sortOrder Int @default(0)` · `createdAt` · `updatedAt`
— `@@unique([unitId, name])` · `@@index([tenantId, unitId])` · CHECK `capacity >= 1` · `cleanupMin >= 0` · ไม่มี FK

### 2.4 คิว + POS (เงิน · เข้ม)
- `QueueTicket.etaAt DateTime?`
- `PosHeldCart.serviceJobId String?` + **partial unique (SQL มือ)** `ON "PosHeldCart"("serviceJobId") WHERE "status" = 'HELD' AND "serviceJobId" IS NOT NULL` (แบบ `PosHeldCart_tableSessionId_held_key`) — 1 งานบริการ = บิลพัก HELD ได้ใบเดียว · คอมเมนต์ในไฟล์ .prisma ว่ามี index มือ
- `PosSaleLine.performerEmployeeId String?` — **ห้ามสร้างดัชนีบน PosSaleLine ใน migration นี้** (ตารางใหญ่ · CREATE INDEX ล็อกเขียนบน prod — ถ้าใบหลังต้องการ = CONCURRENTLY นอก migrate แบบ P6.1)
- `PosStaffCommission.employeeId String?` + `@@index([tenantId, employeeId, periodKey])` — **ผู้คุมเคาะ CC §10 ข้อ 2 = ค่าปลอดภัย**: `userId` คงบังคับ (ผู้ใช้ที่ผูกพนักงาน) · ผู้ให้บริการไม่มีบัญชีผู้ใช้ ⇒ ไม่ลงค่าคอมฯ + เตือน (B.10/B.11) · คอลัมน์นี้ไว้รายงานตามผู้ให้บริการ
- POS นอก 3 คอลัมน์ + 2 ดัชนีนี้ **ห้ามมีใน SQL** (ข้อสอบ M-POS ไล่ทุก statement)

### 2.5 สถานะใหม่ไม่รั่วเข้าทางเดิม
`setStatusAction` (`src/lib/actions/booking.ts`) เปลี่ยน `z.nativeEnum(AppointmentStatus)` → `z.enum([…6 ค่าเดิม])` — QUEUED/IN_SERVICE/LATE เข้าได้ทางเครื่องสถานะของ B.4 เท่านั้น · ข้อสอบตรวจแบบสถิต (N-4)

## 3. migration (SVC-RUN §1.1 ข้อ 5 · ห้าม migrate dev — qc-svc มี drift HR)
1. schema เดิม: `mkdir -p /tmp/svc-b0-base && git -C /root/projects/shark-svc-lN archive 8ff682d5 prisma/schema | tar -x -C /tmp/svc-b0-base`
2. โฟลเดอร์ใหม่ชื่อ `<ts>_svc_b` (ts 14 หลัก **มากกว่า** `20261221000001` เช่น `20261222000000_svc_b`) แล้ว
   `bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec prisma migrate diff --from-schema /tmp/svc-b0-base/prisma/schema --to-schema prisma/schema --script > prisma/migrations/<ts>_svc_b/migration.sql`
3. **อ่าน SQL ทุกบรรทัด**: ไม่มี DROP/RENAME/เปลี่ยนชนิด/SET NOT NULL/UPDATE/DELETE · ADD COLUMN NOT NULL ต้องมี DEFAULT · แตะเฉพาะตาราง `Appointment` `BookingStaffService` `SvcResource` `QueueTicket` `PosHeldCart` `PosSaleLine` `PosStaffCommission` + type `AppointmentStatus` (เจอ Hr*/ตารางอื่น = diff ผิดฐาน → หยุด)
4. เติม SQL มือท้ายไฟล์: CHECK ทั้ง 7 ตัว (§2.1–2.3) · partial unique ของ PosHeldCart (§2.4)
5. ลงฐาน: `bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec prisma migrate deploy` · แล้ว `pnpm exec prisma generate` (ผ่าน iso — node_modules bind ร่วมทุกเลน · additive จึงยอมได้ แจ้งในรายงาน)

## 4. «defs/booking.ts» — ข้อสอบผูก **ทุกคีย์ ทุกค่า ทุกแม่แบบ** (หมวด D)
- `defineSettings("booking", DEFS, { templates, snapshots, groupRules })` · pure (import ได้เฉพาะ zod · `../registry` · `import type`)
- แม่แบบ: `BARBER` `SPA` `CLINIC` (version 1 · labelTh "ตัดผม/เสริมสวย" "นวด/สปา" "คลินิก") · **CLINIC มี `hiddenUntil: "PHASE_CLINIC"`** (BARBER/SPA ไม่มี)
- `group` = ส่วนที่ 2 ของคีย์ · `editPermission` = `booking.settings.edit` ยกเว้นกลุ่ม `deposit` และ `money` = `booking.settings.money` + `sensitivity: "MONEY"` · `booking.privacy.*` = `sensitivity: "PRIVACY"` + `ownerOnly: true`
- `chain` = คอลัมน์ "ขอบเขต" ของภาคผนวก ก ตรงตัว (ตารางล่าง) · `type` ตามตาราง · ห้ามมีคีย์ booking นอกตารางนี้
- `_fallback` (ร้านที่ยังไม่เลือกแม่แบบ = ร้านเดิม) = ค่า **BARBER** ทุกคีย์ **ยกเว้น 3 คีย์ที่ต้องคงพฤติกรรมเดิม**: `booking.queue.singleLine` = `false` · `booking.deposit.amount` = `{mode:"PER_SERVICE"}` (มัดจำตาม `BookingService.depositSatang` แบบเดิม) · `booking.booking.onlineSharePct` = `100` (เดิมไม่มีเพดาน)
- หน่วย: นาที/วัน = จำนวนเต็ม · % = จำนวนเต็ม 0–100 · อัตรา = basis point 0–10000 · เงิน = สตางค์ · "—" ในภาคผนวก = `null` (bool = `false`)

| # | คีย์ | type | chain | BARBER | SPA | CLINIC |
|---|---|---|---|---|---|---|
| 1 | booking.general.shopType | enum BARBER/SPA/CLINIC | UNIT | "BARBER" | "SPA" | "CLINIC" |
| 2 | booking.general.providerLabel | text | UNIT | "ช่าง" | "หมอนวด" | "แพทย์" |
| 3 | booking.general.resourceLabel | text | UNIT | "เก้าอี้" | "เตียง/ห้อง" | "ห้องตรวจ" |
| 4 | booking.general.customerLocales | table (array "th"/"en") | UNIT | ["th","en"] | ["th","en"] | ["th"] |
| 5 | booking.general.defaultHours | table {openMin,closeMin} | UNIT | {600,1200} | {600,1260} | {540,1020} |
| 6 | booking.staff.hoursSource | table (ลำดับ HR_SHIFT/STAFF_WEEKLY/UNIT_HOURS) | STAFF | ["HR_SHIFT","STAFF_WEEKLY","UNIT_HOURS"] ×3 | | |
| 7 | booking.staff.weeklySchedule | enum UNIT_HOURS/OWN_SCHEDULE | STAFF | "UNIT_HOURS" | "UNIT_HOURS" | "OWN_SCHEDULE" |
| 8 | booking.staff.maxJobsPerDay | int (null=ไม่จำกัด) | UNIT→STAFF | null | 6 | null |
| 9 | booking.staff.minBreakMin | minutes | UNIT→STAFF | 0 | 10 | 0 |
| 10 | booking.staff.customerCanChoose | bool | STAFF | true | true | true |
| 11 | booking.staff.servicesMode | enum ALL/ASSIGNED (แถวจริงอยู่ `BookingStaffService`) | STAFF | "ALL" | "ALL" | "ASSIGNED" |
| 12 | booking.service.durationSource | enum CATALOG | SERVICE | "CATALOG" ×3 | | |
| 13 | booking.service.cleanupMin | minutes | UNIT→SERVICE→RESOURCE | 0 | 10 | 5 |
| 14 | booking.service.resourceRule | enum STAFF_CHAIR/PER_SERVICE/EXAM_ROOM | SERVICE | "STAFF_CHAIR" | "PER_SERVICE" | "EXAM_ROOM" |
| 15 | booking.service.staffCount | int ≥1 | SERVICE | 1 | 1 | 1 |
| 16 | booking.service.onlineBookable | bool | SERVICE | true | true | true |
| 17 | booking.service.walkIn | table {enabled, closeAtOrAboveMin:int\|null} | SERVICE | {true,90} | {true,null} | {true,null} |
| 18 | booking.service.rebookAfterDays | days (null=ปิด) | UNIT→SERVICE | 28 | 30 | null |
| 19 | booking.booking.horizonDays | days ≥1 | UNIT | 30 | 30 | 60 |
| 20 | booking.booking.minLeadMin | minutes | UNIT→SERVICE | 60 | 60 | 120 |
| 21 | booking.booking.slotStepMin | minutes ∈ {5,10,15,20,30,60} | UNIT | 15 | 30 | 15 |
| 22 | booking.booking.requireConfirm | bool | UNIT→SERVICE | false | false | true |
| 23 | booking.booking.anyStaffOption | bool | UNIT | true | true | true |
| 24 | booking.booking.onlineSharePct | percent 0–100 | UNIT→STAFF | 60 | 60 | 80 |
| 25 | booking.booking.maxOpenPerPhone | int ≥1 | UNIT | 2 | 2 | 1 |
| 26 | booking.booking.extraFields | enum MASSAGE_NOTE/SYMPTOM_OPTIONAL \| null | UNIT→SERVICE | null | "MASSAGE_NOTE" | "SYMPTOM_OPTIONAL" |
| 27 | booking.late.graceMin | minutes | UNIT | 10 | 15 | 15 |
| 28 | booking.late.afterGrace | enum RELEASE_REQUEUE/WAIT_NOTIFY_COUNTER | UNIT | "RELEASE_REQUEUE" | "RELEASE_REQUEUE" | "WAIT_NOTIFY_COUNTER" |
| 29 | booking.late.noShowAfterMin | minutes | UNIT | 30 | 30 | 60 |
| 30 | booking.late.freeChangeBeforeMin | minutes | UNIT→SERVICE | 180 | 720 | 120 |
| 31 | booking.late.selfRescheduleMax | int ≥0 | UNIT | 2 | 2 | 1 |
| 32 | booking.late.repeatNoShow | table {count,windowDays,action REQUIRE_DEPOSIT/PHONE_ONLY} | UNIT | {2,90,"REQUIRE_DEPOSIT"} | {2,90,"REQUIRE_DEPOSIT"} | {3,180,"PHONE_ONLY"} |
| 33 | booking.deposit.method | enum NONE/PROMPTPAY_SLIP | UNIT | "PROMPTPAY_SLIP" | "PROMPTPAY_SLIP" | "NONE" |
| 34 | booking.deposit.amount | table `{mode:"PERCENT",bp,minDurationMin:int\|null}` \| `{mode:"PER_SERVICE"}` \| null | UNIT→SERVICE | {PERCENT,2000,90} | {mode:"PER_SERVICE"} | null |
| 35 | booking.deposit.payWithinMin | minutes \| null | UNIT | 15 | 30 | null |
| 36 | booking.deposit.forfeitPct | percent \| null | UNIT | 100 | 100 | null |
| 37 | booking.deposit.memberExemptTier | text \| null | UNIT | null | "GOLD" | null |
| 38 | booking.queue.order | enum SINGLE_LINE_BY_TIME/APPOINTMENT_FIRST | UNIT | "SINGLE_LINE_BY_TIME" | "SINGLE_LINE_BY_TIME" | "APPOINTMENT_FIRST" |
| 39 | booking.queue.walkInFillGaps | bool | UNIT | true | true | false |
| 40 | booking.queue.safetyMin | minutes | UNIT | 5 | 10 | 0 |
| 41 | booking.queue.walkInCloseWaitMin | minutes | UNIT | 120 | 90 | 180 |
| 42 | booking.queue.remoteTicket | table {enabled, maxWaitMin:int\|null} | UNIT | {true,90} | {true,60} | {true,null} |
| 43 | booking.queue.skipAfterMin | minutes | UNIT | 10 | 10 | 15 |
| 44 | booking.queue.walkInPickStaff | bool | UNIT→DEVICE | true | true | false |
| 45 | booking.queue.priorityGroups | table (array ELDERLY/MONK/DISABLED) | UNIT | [] | [] | ["ELDERLY","MONK","DISABLED"] |
| 46 | booking.queue.prefixes | table {walkIn,appointment,priority\|null} (ตัวพิมพ์ใหญ่ 1 ตัว) | UNIT | {"A","P",null} | {"A","P",null} | {"A","P","B"} |
| 47 | — ใช้ `messaging.channelOrder` เดิม (R0.3) · **ห้ามสร้างคีย์ booking ซ้ำ** (SMS ตามใบเลื่อน S.1) | | | | | |
| 48 | booking.notify.reminderOffsetsMin | table (array นาที >0) | UNIT | [1440,120] | [1440,180] | [1440] |
| 49 | booking.notify.nearTurnAhead | int ≥1 | UNIT | 2 | 2 | 3 |
| 50 | booking.notify.delayAlertMin | minutes | UNIT | 15 | 15 | 30 |
| 51 | booking.msg.enabled | table {10 ชนิด: bool} | UNIT | ทุกตัว true ยกเว้น courseExpiry=false | ทุกตัว true | ทุกตัว true ยกเว้น rebookInvite=false · courseExpiry=false |
| 51 | booking.msg.<ชนิด> ×10 | template `{th, en?}` | UNIT | ถ้อยคำเขียนเอง (กติกาล่าง) | | |
| 52 | booking.display.tvShow | table {label PROVIDER/RESOURCE, showCustomerName} | DEVICE | {"PROVIDER",false} | {"PROVIDER",false} | {"RESOURCE",false} |
| 53 | booking.display.voice | table (array "th"/"en") | DEVICE | ["th","en"] | ["th"] | ["th"] |
| 54 | booking.display.nextCount | int ≥1 | DEVICE | 3 | 3 | 5 |
| 55 | booking.kiosk.services | enum WALKIN_ENABLED/ALL | DEVICE | "WALKIN_ENABLED" | "ALL" | "ALL" |
| 56 | booking.kiosk.phone | enum OPTIONAL/REQUIRED | DEVICE | "OPTIONAL" | "OPTIONAL" | "REQUIRED" |
| 57 | booking.kiosk.paperTicket | bool | DEVICE | false | false | true |
| 58 | booking.kiosk.pinLock | bool | DEVICE | true | true | true |
| 59 | booking.money.onDone | enum POS_HELD_BILL | UNIT | "POS_HELD_BILL" ×3 | | |
| 60 | booking.money.commissionTo | enum PERFORMER/OFF | UNIT | "PERFORMER" | "PERFORMER" | "OFF" |
| 61 | booking.money.commissionRate | table {serviceBp,productBp} \| null | UNIT→SERVICE→STAFF | {0,0} | {0,0} | null |
| 62 | booking.money.commissionToPayroll | bool | UNIT | true | true | false |
| 63 | booking.course.enabled | bool | UNIT | false | true | false |
| 64 | booking.course.policy | table \| null | UNIT→COURSE | null | {validityMonths:6, extendMonths:1, crossBranch:false, transferable:false, noShowDeductSessions:1, refund:{mode:"REMAINING_PRORATA",feeBp:1000}, expiryWarnDays:30} | null |
| 65 | — สิทธิ์ต่อบทบาท = ค่าเริ่มบทบาทใน `permissions.ts` (B.11) · ไม่ใช่ def | | | | | |
| 66 | booking.privacy.walkInRetentionDays | days \| null | TENANT | 180 | 180 | null |
| + | booking.queue.singleLine | bool (CC §6.1) | UNIT | true | true | true (`_fallback` false) |
| + | booking.queue.overrunExtendMin | minutes (มติ B.2) | UNIT | 5 | 5 | 5 |

- **10 ชนิดข้อความ** (คีย์ `booking.msg.<ชนิด>` และคีย์ใน `booking.msg.enabled` ชื่อเดียวกัน): `confirmation` `reminder` `checkedIn` `ticketIssued` `nearTurn` `yourTurn` `delayed` `noShowRebook` `rebookInvite` `courseExpiry`
  - ค่า = `{ th: string, en?: string }` (`th` ไม่ว่าง) · `templateVars` ต่อคีย์ต้องครอบตัวแปรที่ใช้ (`checkTemplate` ผ่านทุกแม่แบบ) · ตัวแปรไทยในวงเล็บปีกกา เช่น `{ชื่อ}` `{ร้าน}` `{เลขคิว}` `{เวลา}` `{ช่าง}` `{บริการ}` `{ลิงก์บัตร}` `{ลิงก์นัด}` `{อีกกี่คิว}` `{นาทีที่เลื่อน}` `{วันหมดอายุ}`
  - ทุกแม่แบบ: `reminder` มี `{เวลา}` · `ticketIssued` และ `yourTurn` มี `{เลขคิว}` · **CLINIC ห้ามมี `{บริการ}` ในข้อความใดเลย** (ภาคผนวก ก #51)
- schema ต้องปฏิเสธ: % นอก 0–100 · นาทีติดลบ/ทศนิยม · slotStep 7 · prefix ตัวเล็กหรือ 2 ตัว · bp > 10000 · reminder offset ≤ 0 · enum นอกรายการ (ข้อ D-SCH)
- **SNAPSHOT_KEYS.appointment** ⊇ `booking.deposit.{method,amount,payWithinMin,forfeitPct}` · `booking.late.{graceMin,afterGrace,noShowAfterMin,freeChangeBeforeMin,selfRescheduleMax}` · `booking.booking.requireConfirm` (คีย์ booking ล้วน)
- **validateGroup 5 คู่** (ค่าเริ่มทุกแม่แบบต้องไม่ติดเลย) — `issue.key` เป็นคีย์ใดคีย์หนึ่งในคู่:
  | กลุ่ม | ขัดเมื่อ | code |
  |---|---|---|
  | late | `noShowAfterMin <= graceMin` | `NO_SHOW_BEFORE_GRACE` |
  | booking | `minLeadMin >= horizonDays × 1440` | `LEAD_BEYOND_HORIZON` |
  | deposit | `method !== "NONE"` และ `payWithinMin === null` | `DEPOSIT_DEADLINE_REQUIRED` |
  | queue | `remoteTicket.enabled` และ `maxWaitMin` ไม่ null และ `> walkInCloseWaitMin` | `REMOTE_WAIT_OVER_CLOSE` |
  | queue | ตัวอักษรใน `prefixes` (ที่ไม่ null) ซ้ำกัน | `QUEUE_PREFIX_DUPLICATE` |

## 5. ปลดหนี้ SVC-D1: ชุด POS รันบน qc-svc ได้ (สคริปต์ทดสอบ · ไม่ใช่โค้ด POS)
ด่านเขียนของชุด POS อยู่ในแต่ละชุด (`assertQc4BeforeWrite` เทียบ `envMod.POS_QC_HOST_MARK` จาก `scripts/pos-qc-env.mts`) — **ไม่ใช่ scripts/lib** (`pos-prod-writer-guard.mts` เป็นของสคริปต์เขียน prod · ห้ามแตะ)
- `scripts/pos-qc-env.mts`: `POS_QC_HOST_MARK` = `"ep-mute-scene"` **เมื่อ** `process.env.QC_BRANCH === "qc-svc"` **และ** `process.env.POS_QC_ALLOW_HOST === "ep-mute-scene"` (สองค่าที่ `scripts/qc-svc.sh` ตั้ง) · กรณีอื่นทั้งหมด = `"ep-frosty-lab"` เหมือนเดิม · ด่าน prod/QC1–3 เดิมไม่เปลี่ยน · ห้ามแก้ไฟล์ชุด `qc-pos-*`
- ข้อสอบ E-1…E-4 ตรวจด้วยการ import จริงใน process แยก · G รันชุด POS จริง

## 6. regression (ข้อสอบหมวด G เรียกเองตอนท้าย · exit 0 ทุกชุด)
`qc-booking-deposit` `qc-booking-race` `qc-booking-edit-schedule` `qc-booking-hours-hr` `qc-hr-leave-booking` `qc-queue-public` · POS บิลพัก/ค่าคอมฯ `qc-pos-p1.5` `qc-pos-p2.4` `qc-pos-p3.5` · ชิ้นกลาง `qc-svc-r0.3` `qc-svc-smoke`
(ยังไม่มี migration svc_b ⇒ G = SKIP · ตั้ง `SVC_B0_NO_REGRESSION=1` ข้ามได้ระหว่างทำงาน แต่ SKIP ไม่นับผ่าน)

## 7. เกณฑ์รับ
ข้อสอบเขียวทุกข้อ (ไม่มี SKIP) · typecheck ทรีรวม (`ISO_MEM=9000M NODE_OPTIONS=--max-old-space-size=7168`) · fitness 2 โหมด · ไม่มี `any` · ตรวจเข้ม 2 รอบ (คอลัมน์ POS = เงิน)

## 8. ส่งต่อใบหลัง (จดใน wo-notes ตอนรับใบ)
- B.3: ตัวหาช่องว่างเดิม (`slots.ts`) ต้องนับสถานะใหม่ QUEUED/IN_SERVICE/LATE ว่า "ถือช่อง" · B.4: เครื่องสถานะเป็นทางเดียวที่ตั้งสถานะใหม่
- R0.4/B.11: `applyTemplate` ยังไม่ปฏิเสธแม่แบบที่ `hiddenUntil` (UI ต้องซ่อน + ใบแก้ชิ้นกลางถ้าต้องกันฝั่งเซิร์ฟเวอร์) · scope `RESOURCE`/`DEVICE`/`COURSE` ยังไม่อยู่ใน `SUPPORTED_SCOPES` ของ service.ts ⇒ ค่าชั้นนั้นได้จากแม่แบบจนใบแก้ชิ้นกลาง (B.6 อุปกรณ์ · B.13 ทรัพยากร) — คำขอลง wo-notes
- B.8: โหมดมัดจำผ่าน gateway (Beam) = เพิ่มค่า enum + `requires` ในใบนั้น · B.9: ช่องทางต่อชนิดข้อความใช้ `messaging.channelOrder`
- B.10: index ค่าคอมฯ ตามผู้ให้บริการบน PosSaleLine (ถ้าจำเป็น) = CONCURRENTLY นอก migrate

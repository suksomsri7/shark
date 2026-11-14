# โมดูล 32: เลขา AI — ปฏิทิน + เตือนความจำ (CAL) — สัญญาข้อมูล

> เอกสารสัญญา · 14 พ.ย. 2569 · ใบ **CAL0.2** ของ RUN "ปฏิทินเลขา" · ภาษาไทย ชื่อโค้ดอังกฤษ (ตาม `_CONVENTIONS.md`)
> ลำดับความจริง: **มติเจ้าของ M1–M4** (`ledger/SEC-CALENDAR-PLAN.md` §0) > `ledger/cal-briefs/cal-brief-RESOLUTIONS.md` (R-CAL-1…24) > เอกสารนี้ > แผน §1–§3 · โค้ดที่ขึ้นแล้วชนะเอกสารเสมอ (แก้เอกสารตาม)
> แบบที่อนุมัติ: `/root/mockups/secretary-calendar/` — `cal-1.png` (จอ 1–4) · `cal-2.png` (จอ 5–8) · `cal-3.png` (จอ 9–10) · DESIGN.md (ในโฟลเดอร์ภาพ)
> seed QC: `scripts/seed-calendar-qc.mts` (§13) · API มือถือ: §8 ของไฟล์นี้ (ใบ CAL1.6 คัดลอกแถวเข้า `docs/api/SECRETARY-API.md` ตอนสร้าง route)
> ไฟล์ที่ "วางแผน" (ยังไม่มี) เขียนแบบ "ชื่อไฟล์ (แผน · โฟลเดอร์)" — ตามแบบ `31-secretary.md` (fitness F7 ตรวจเฉพาะไฟล์ที่มีจริง)
> เวลาในเอกสาร = เวลาไทย (UTC+7 · ไทยไม่มี DST) เว้นแต่เขียน UTC · เก็บในฐานเป็น UTC เสมอ

---

## 0. มติ + คำตัดสินที่ผูกเอกสารนี้

| # | มติเจ้าของ | ผลต่อสัญญา |
|---|---|---|
| M1 | ไอคอนปฏิทินแถบบน ถัดจาก "ทีม" · badge แดง = เรื่องวันนี้ที่ยังไม่เสร็จ | ช่อง `calendar` ใน `GET secretary/badges` (§8.4) · ไม่รวมใน `total`/ไอคอนแอป (Q3) |
| M2 | สรุปเช้า ผู้ใช้ตั้งเวลาเอง + เปิด/ปิด · ค่าเริ่ม เปิด 08:00 · สรุปเย็น ค่าเริ่ม ปิด 19:00 | `CalPref.morningOn=true/morningMinute=480/eveningOn=false/eveningMinute=1140` (§2.2 · §6) |
| M3 | ปฏิทินเป็นของตัวเอง ไม่มีใครสั่งใคร · ไม่มี "แจ้งใคร" · ไม่มี API/เครื่องมือรับ userId คนอื่น · ขอเตือนคนอื่น → ปฏิเสธ + เสนอการ์ดบอร์ดงาน | §3 (บังคับด้วยโครงสร้าง) · §9.4 |
| M4 | ซิงก์ Google + ปฏิทิน iPhone · ส่วนตัว 100% ร้านมองไม่เห็น | §10 · §3.4 (ตัด CalItem ออกจาก export ของร้าน) |

คำตัดสินจาก CAL0.1 ที่ใช้ตรง ๆ: R-CAL-1 (ราง minute-jobs) · R-CAL-2 (ไฟล์ใหม่วางข้าง `src/lib/modules/calendar/service.ts` เดิม) · R-CAL-3 (`HrPayrollRun.payDate`) · R-CAL-4 (ticket = `TicketEvent`) · R-CAL-5 (นัด "ของฉัน" ผ่าน `myStaffIds`) · R-CAL-6 (บัญชี/หอพัก = แถวสรุป) · R-CAL-7 (ใบลาของฉันเท่านั้น) · R-CAL-8 (TRIPS ปิด) · R-CAL-9 (deepLink) · R-CAL-10 (พ.ศ. ปัก BKK) · R-CAL-11 (ไม่ใช้ quiet hours) · R-CAL-12 (push ไม่กรองร้าน + `data.tenantId`) · R-CAL-13/13b (`categoryId`) · R-CAL-15 (ตารางภาษี) · R-CAL-16 (tokenBox) · R-CAL-17 (google-signin `serverAuthCode`) · R-CAL-18 (เครื่องมือ AI) · R-CAL-19 (badge) · R-CAL-20 (`CalItem.roomId`) · R-CAL-21 (OFF ตัดเฉพาะแหล่งร้าน) · R-CAL-22 (ไม่ push รายการระบบอื่น) · R-CAL-23 (ตรวจสิทธิ์ link ซ้ำตอนแสดง) · R-CAL-24 (CRM นับ `ownerUserId`)

### 0.1 คำตัดสินใหม่ของใบนี้ (R-CAL-25…37) — ต่างจากแผน/ข้อสรุปเดิม + เหตุผล

| รหัส | เรื่อง | คำตัดสิน | เหตุผล |
|---|---|---|---|
| R-CAL-25 | `CalItem.source` แผนมี `GOOGLE` | ค่า = `APP \| CHAT \| SUGGEST` (ตัด GOOGLE · เพิ่ม SUGGEST = กด "เตือนเลย" จากการ์ดนัดชน จอ 10) | อีเวนต์จาก Google อยู่ `CalExternalEvent` เสมอ ไม่เคยเป็น CalItem · ป้าย GOOGLE จะสับสนกับสำเนาที่ส่งออก |
| R-CAL-26 | `CalLink.syncToken` ช่องเดียว (แผน) | syncToken **ต่อปฏิทิน** อยู่ใน `CalLink.calendars[i].syncToken` | syncToken ของ Google ออกต่อ calendarId — ช่องเดียวใช้ได้แค่ปฏิทินเดียว |
| R-CAL-27 | `CalExternalEvent.externalId @unique per link` (แผน) | `@@unique([linkId, calendarId, externalId])` | อีเวนต์เดียวอยู่ได้หลายปฏิทิน (ปฏิทินแชร์) · id ของ Google ไม่ซ้ำแค่ภายในปฏิทิน |
| R-CAL-28 | สถานะ `CalItem` (แผน OPEN/DONE/CANCELLED) | เพิ่ม `DRAFT` = เตือนประจำที่เลขาสร้างจากแชท รอผู้ใช้กด "ใช่ ตั้งเลย" (จอ 5) · ไม่ยิง · หมดอายุ 24 ชม. | จอ 5 มีขั้นยืนยันก่อนตั้งเตือนประจำ — ต้องมีที่เก็บระหว่างรอ โดยไม่เรียกโมเดลซ้ำ |
| R-CAL-29 | ทำซ้ำ + เลื่อน + ย้ำ ในแถวเดียว | เพิ่ม `occursAt` (ครั้งปัจจุบัน) · `firedOccAt` · `snoozeUntil` · `version` · `leaseToken` · `fireAttempts` · `nextFireAt` = ค่าที่คำนวณ (§5) | แผนมีแค่ `nextFireAt/nagAt/leaseUntil` — ไม่พอแยก "ยิงครั้งปกติแล้วหรือยัง" กับ "เลื่อน" และกัน "แก้ระหว่าง job ถือ lease" |
| R-CAL-30 | สรุปเช้า (แผน "นับ + 3 รายการแรก") | ข้อความ = **บรรทัดสรุปเป็นกลุ่มต่อแหล่ง** ≤ 4 บรรทัด (ตามภาพจอ 1/2: "นัดลูกค้า 4 คิว (คิวแรก 09:30) · ใบแจ้งหนี้ครบกำหนด 2 ใบ รวม ฿18,400 · …") ใช้ฟังก์ชันบริสุทธิ์ตัวเดียวกับการ์ด "วันนี้" | ภาพที่อนุมัติชนะแผน |
| R-CAL-31 | Google ใน "สรุปเช้าแยกต่อร้าน" | อีเวนต์ Google (ของคน ไม่ใช่ของร้าน) นับในสรุปของ **กิจการหลักของวันนั้นเท่านั้น** = แถว `CalPref` ที่ `morningOn` และ `morningMinute` น้อยสุด (เท่ากัน → `tenantId` น้อยสุด) · ไม่มีแถว → กิจการแรกตาม `Membership.createdAt` | ไม่ให้นัดส่วนตัวซ้ำในทุกข้อความเมื่อมีหลายร้าน · จอ 10 "สรุปเช้ารวมนัดส่วนตัวด้วย" |
| R-CAL-32 | `CalItem.tenantId` | บังคับ (ไม่ null) = กิจการที่สร้าง · แสดงเฉพาะในปฏิทินของกิจการนั้น · push ใส่ `data.tenantId` นี้ | เตือนผูกของในร้าน (CRM/ใบแจ้งหนี้) · สลับร้านถูกเมื่อแตะ · ลบตามร้านได้ (PDPA purge) |
| R-CAL-33 | 🔴 export ข้อมูลร้าน (`exportTenantData` `src/lib/platform/pdpa.ts:35`) วนทุกตารางแกน tenant | CAL1.1 ต้องเพิ่มรายการยกเว้น `PERSONAL_MODELS = ["CalItem","CalPref"]` ใน export (purge ยังลบ) | ถ้าไม่ยกเว้น เจ้าของร้านกด export PDPA แล้วได้เตือน/นัดส่วนตัวของพนักงาน = ขัด M4 (พบในใบนี้) |
| R-CAL-34 | ปุ่ม "โทรเลย" (จอ 7) | 2 category: `SEC_CAL` (3 ปุ่ม) · `SEC_CAL_CALL` (4 ปุ่ม · เฉพาะเตือนที่ผูกลูกค้ามีเบอร์) · **ไม่ส่งเบอร์ใน payload** — ปุ่มเปิดแอปแล้วแอปดึงเบอร์จาก `GET items/[id]` | category ของ iOS ผูกชุดปุ่มตายตัว · เบอร์ไม่ควรผ่าน APNs/Expo · body แสดงแบบปิด `08x-xxx-4421` |
| R-CAL-35 | เวลาเดินทาง (จอ 10 "ชนกับเวลาเดินทาง… เตือนออกตอน 12:15") | `CalPref.travelMinutes` ค่าเริ่ม **0** (ตามแผน CAL1.9) ⇒ รุ่นนี้เจอแค่ "ทับซ้อน" · ภาพจอ 10 = กรณี `travelMinutes=45` · จอ 8 ไม่มีแถวตั้งค่านี้ → คำถาม Q8 | แผนกำหนด 0 · UI ต้องตรงภาพ ห้ามเพิ่มแถวเอง |
| R-CAL-36 | CRM ติ๊กเสร็จในปฏิทิน | `checkable=true` สำหรับกิจกรรม CRM ของฉันที่ `type ∈ {TASK, CALL, EMAIL, LINE}` (ทำผ่าน `completeActivity`) · `MEETING` และแหล่งร้านอื่น = false | R-CAL-1.2 มี `completeActivity` · คำบรรยายจอ 3 "เฉพาะเตือนฉัน/การ์ดงาน" ตีความว่า "งานที่ติ๊กได้" · ประชุมไม่ใช่งานติ๊ก |
| R-CAL-37 | ส่งออก "นัดลูกค้าที่ฉันรับ (บัตรคิว)" ไป Google (จอ 9) | ใช้ `CalExternalEvent.sharkRef = "appt:<tenantId>:<appointmentId>"` เป็นตารางจับคู่ (แถวที่มี sharkRef ไม่แสดงใน agenda) · ชื่ออีเวนต์ = `<บริการ> · <ชื่อลูกค้า>` ไม่มีเบอร์ · ค่าเริ่ม ปิด | ไม่ต้องสร้างตารางที่ 5 · ข้อมูลลูกค้าออกนอกระบบเฉพาะเมื่อผู้ใช้เปิดเอง (PDPA · กล่องความเป็นส่วนตัวจอ 9) |

---

## 1. ขอบเขต

**ทำ**: (ก) ของส่วนตัว 2 ชนิด — **เตือนฉัน** (`REMINDER`) และ **นัดส่วนตัว** (`EVENT`) (ข) ตัวรวม agenda อ่านอย่างเดียวจาก 8 แหล่งของร้าน + Google (ค) สรุปเช้า/เย็น (ง) เตือนถึงเวลา + ปุ่มลัด + ย้ำ 1 ครั้ง (จ) เครื่องมือเลขา 5 ตัว (ฉ) ซิงก์ Google สองทาง (ช) ปฏิทินในเครื่อง (ฝั่งเครื่องเท่านั้น) (ซ) นัดชน
**ไม่ทำ** (แผน §7): เตือนคนอื่น/ทีม · ปฏิทินร่วมของร้าน (มีหน้า `/app/calendar` เดิม) · เชิญผู้เข้าร่วม · เวลาเดินทางอัตโนมัติ · Outlook · เตือนเชิงรุก · push รายการของระบบอื่นรายตัว (R-CAL-22)

ไฟล์ใหม่ทั้งหมดอยู่ข้างไฟล์เดิมใน `src/lib/modules/calendar/` (R-CAL-2 · **ไม่แตะ** `service.ts`/`actions.ts`):

| ไฟล์ (แผน · `src/lib/modules/calendar/`) | ใบ | pure? | หน้าที่ |
|---|---|---|---|
| next-fire.ts | CAL1.2 | ✅ | `occurrences` · `nextFire` · `afterFire` · `snoozeTarget` · `validateWhen` |
| items.ts | CAL1.2 | – | CRUD ของส่วนตัว (§3.2) |
| agenda.ts | CAL1.3 | – | `agendaFor` · `monthDots` · `todayOpenCount` · adapter ต่อแหล่ง |
| summary.ts | CAL1.3/1.5 | ✅ | `briefLines(items, day, now)` ใช้ทั้งการ์ด "วันนี้" สรุปเช้า/เย็น |
| tax-deadlines.ts | CAL1.3 | ✅ | ตารางกำหนดยื่น (R-CAL-15 · §4.4) |
| conflicts.ts | CAL1.9 | ✅ | `conflicts(items, travelMinutes)` (§11) |
| jobs.ts | CAL1.4/1.5/1.8 | – | ลงทะเบียน `calendar.fire` · `calendar.brief` · `calendar.google` ตอน import |
| push-msg.ts | CAL1.4/1.5 | ✅ | สร้าง title/body/data/categoryId (§7) |
| google.ts | CAL1.8 | – | OAuth แลก code · ดึง/ส่งออก · ถอนเชื่อม (§10) |
| index.ts | – | – | facade (export เฉพาะที่ route/เครื่องมือใช้) |

---

## 2. โมเดลข้อมูล — calendar.prisma (แผน · `prisma/schema/`) (ใบ CAL1.1 · migration `calendar_a` · additive ล้วน)

> 🔴 ใบนี้ **ไม่สร้าง** ไฟล์ schema/migration — ข้อความข้างล่างคือสิ่งที่ CAL1.1 ต้องวางตรงตัว (ปรับได้เฉพาะคอมเมนต์)
> กติการ่วม: ทุกแถวมี `userId` (เจ้าของคนเดียว) · **ไม่มี FK ไป User** (แบบ `PushDevice`/`AiNotifyPref` — core.prisma FROZEN ห้ามเพิ่ม back-relation) ⇒ ลบตามบัญชีผ่าน `deleteUserTraces` (§2.6) · `tenantId` เฉพาะตารางที่เป็น "ของในกิจการ" (CalItem · CalPref) · ตารางของ Google ผูกคน ไม่ผูกร้าน

```prisma
// calendar.prisma — ปฏิทินส่วนตัวของเลขา AI (CAL1.1 · docs/modules/32-secretary-calendar.md §2)
// 🔴 M3: ทุกแถวเป็นของ userId คนเดียว · ไม่มีคอลัมน์ "ผู้รับ" · ไม่มี FK ไป User (แบบ PushDevice — ลบใน deleteUserTraces)

enum CalItemKind {
  REMINDER // เตือนฉัน
  EVENT // นัดส่วนตัว (มีช่วงเวลา)
}

enum CalRepeat {
  NONE
  DAILY
  WEEKLY // ตาม repeatDays
  MONTHLY // วันที่เดียวกับ startAt (29–31 → วันสุดท้ายของเดือนที่สั้นกว่า)
}

enum CalItemStatus {
  DRAFT // เตือนประจำจากแชท รอผู้ใช้ยืนยัน (จอ 5) — ไม่ยิง · หมดอายุ 24 ชม.
  OPEN
  DONE
  CANCELLED
}

enum CalItemSource {
  APP // แผ่นเพิ่มเตือน (จอ 6)
  CHAT // เครื่องมือ calendar_add ในห้องเลขา (จอ 5) — มี roomId
  SUGGEST // ปุ่ม "เตือนเลย" ของการ์ดนัดชน (จอ 10)
}

enum CalLinkType {
  CRM_CONTACT
  CRM_DEAL
  ACCOUNT_DOC
  KANBAN_CARD
}

enum CalProvider {
  GOOGLE
}

enum CalLinkStatus {
  ACTIVE
  NEEDS_RECONNECT // refresh token ตาย/ถูกถอนสิทธิ์ — หยุดซิงก์ แสดงในจอ 8/9
}

model CalItem {
  id           String        @id @default(cuid())
  userId       String // เจ้าของคนเดียว (ไม่มี FK)
  tenantId     String // กิจการที่สร้าง (R-CAL-32)
  kind         CalItemKind   @default(REMINDER)
  title        String // ≤ 200 (ตรวจใน service)
  note         String? // ≤ 2,000
  startAt      DateTime // จุดยึด = เวลาเริ่มของครั้งแรก (UTC) — เวลาของวัน/วันในสัปดาห์/วันที่ของการทำซ้ำอ่านจากนี่ (เวลาไทย)
  endAt        DateTime? // EVENT เท่านั้น (> startAt) · REMINDER = null
  allDay       Boolean       @default(false)
  repeat       CalRepeat     @default(NONE)
  repeatDays   Int[]         @default([]) // WEEKLY: 0=อา … 6=ส (วันไทย) · ว่าง = วันของ startAt
  leadMinutes  Int           @default(0) // เตือนล่วงหน้า ∈ {0,5,10,15,30,60,120,1440}
  linkType     CalLinkType?
  linkId       String?
  linkSystemId String? // AppSystem ของสิ่งที่ผูก — ใช้สร้าง deepLink + ตรวจสิทธิ์ซ้ำตอนแสดง (R-CAL-23)
  status       CalItemStatus @default(OPEN)
  doneAt       DateTime?
  cancelledAt  DateTime?
  occursAt     DateTime // ครั้งปัจจุบัน/ครั้งถัดไป (NONE = startAt) — แถว agenda ของทำซ้ำคำนวณจาก startAt ไม่ใช่จากนี่
  nextFireAt   DateTime? // เวลาที่ calendar.fire ต้องทำงานกับแถวนี้ = min(ยิงครั้งปกติ, snoozeUntil, nagAt) · null = ไม่มีอะไรรอ
  firedOccAt   DateTime? // occurrence ที่ยิงครั้งปกติไปแล้ว (กันยิงซ้ำ)
  lastFiredAt  DateTime?
  snoozeUntil  DateTime?
  nagAt        DateTime? // ย้ำ 1 ครั้ง 30 นาทีหลังยิง (เฉพาะ repeat NONE)
  fireAttempts Int           @default(0) // ส่งล้มด้วยเหตุ transport ซ้ำได้ ≤ 3
  leaseUntil   DateTime?
  leaseToken   String?
  version      Int           @default(0) // +1 ทุกการแก้ของผู้ใช้ (แก้/เสร็จ/เลื่อน/ยกเลิก/ยืนยัน) — job commit แบบมีเงื่อนไข
  source       CalItemSource @default(APP)
  roomId       String? // source CHAT: ห้องเลขาที่สั่ง (R-CAL-20) — แนบใน GET rooms/[id] เฉพาะของผู้เรียก
  externalId   String? // id อีเวนต์ Google ของสำเนาที่ส่งออก
  externalEtag String?
  syncDirty    Boolean       @default(false) // ต้องส่งออก/แก้/ลบใน Google รอบถัดไป
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  @@index([userId, tenantId, status, occursAt]) // agenda + แท็บเตือนฉัน + badge
  @@index([status, nextFireAt]) // calendar.fire
  @@index([userId, roomId]) // การ์ดในห้องเลขา
  @@index([userId, syncDirty]) // calendar.google ส่งออก
  @@index([tenantId]) // purge ร้าน
}

model CalPref {
  id             String   @id @default(cuid())
  userId         String
  tenantId       String
  morningOn      Boolean  @default(true) // M2
  morningMinute  Int      @default(480) // นาทีนับจากเที่ยงคืนไทย 0..1439 (480 = 08:00)
  eveningOn      Boolean  @default(false) // M2
  eveningMinute  Int      @default(1140) // 19:00
  sources        Json     @default("{}") // { booking?, account?, kanban?, crm?, hr?, dorm?, ticket?, trips?: boolean } · ไม่มีคีย์ = เปิด
  travelMinutes  Int      @default(0) // R-CAL-35 · 0..240
  lastMorningDay String? // "YYYY-MM-DD" ไทย — จองสรุปเช้าของวันนั้นแล้ว
  lastEveningDay String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([userId, tenantId])
  @@index([tenantId])
}

model CalLink {
  id               String        @id @default(cuid()) // service ออก id เองก่อน seal (AAD ผูก id · R-CAL-16)
  userId           String // ต่อคน ไม่ต่อร้าน (§2.4)
  provider         CalProvider   @default(GOOGLE)
  email            String
  tokenBox         String // sealIntegrationSecret({refreshToken, accessToken?, expiresAt?}, `cal:${userId}:${id}`)
  scopes           String[]      @default([])
  calendars        Json          @default("[]") // [{id, name, color, primary, accessRole, import, syncToken?, lastSyncAt?}]
  exportCalendarId String? // ปฏิทินปลายทาง (จอ 9 "ไปที่ปฏิทิน") · null = primary
  exportKinds      String[]      @default(["EVENT"]) // ⊆ {EVENT, REMINDER, BOOKING} — จอ 9 ค่าเริ่ม: นัดส่วนตัว เปิด
  status           CalLinkStatus @default(ACTIVE)
  lastSyncAt       DateTime?
  lastError        String? // ข้อความไทยสั้น (ไม่มี token/ข้อความดิบของ Google)
  leaseUntil       DateTime? // กัน sync ซ้อน (job + ปุ่มรีเฟรช)
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt

  events CalExternalEvent[]

  @@unique([userId, provider])
  @@index([status, lastSyncAt])
}

model CalExternalEvent {
  id         String    @id @default(cuid())
  linkId     String
  link       CalLink   @relation(fields: [linkId], references: [id], onDelete: Cascade)
  userId     String // ซ้ำจาก link — ทุก query กรอง userId ตรง (M3)
  calendarId String
  externalId String
  title      String
  location   String?
  startAt    DateTime // all-day = เที่ยงคืนไทยของวันนั้น
  endAt      DateTime? // all-day = เที่ยงคืนไทยของวันถัดจากวันสุดท้าย (exclusive ตาม Google)
  allDay     Boolean   @default(false)
  etag       String
  sharkRef   String? // สำเนาที่เราส่งออก "appt:<tenantId>:<id>" (R-CAL-37) — ไม่แสดงใน agenda
  deletedAt  DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  @@unique([linkId, calendarId, externalId])
  @@index([userId, startAt])
  @@index([linkId, sharkRef])
}
```

### 2.1 เหตุผลรายฟิลด์ที่ไม่ชัด
- `occursAt` แยกจาก `startAt`: `startAt` = จุดยึดของกติกาทำซ้ำ (ไม่เปลี่ยนเมื่อยิง) · `occursAt` = ครั้งที่ "กำลังรอ" (เลื่อนไปข้างหน้าหลังยิงครั้งปกติของเตือนทำซ้ำ) — badge/แท็บ "เตือนฉัน" อ่าน `occursAt` ตรงได้ด้วย index
- `firedOccAt` กันยิงครั้งปกติของ occurrence เดียวกันซ้ำ แม้ `nextFireAt` ถูกคำนวณใหม่ (เช่น ผู้ใช้แก้ชื่อหลังยิง)
- `version` + `leaseToken`: job อ่านแถว (จอง lease) → คำนวณสถานะใหม่ → `updateMany where {id, leaseToken, version}` — ผู้ใช้ เสร็จ/เลื่อน/แก้ ระหว่างนั้น (version เปลี่ยน) ⇒ commit ได้ 0 แถว ⇒ **ไม่ส่ง** (เกณฑ์ CAL1.4)
- `linkSystemId` แทนการเดาระบบจาก id — deepLink ของ CRM/บัญชี/บอร์ดต้องมี systemId
- `roomId` (R-CAL-20) แทน `AiActionLog` (บันทึกที่ OWNER เห็นทุกแถว)
- `CalExternalEvent.userId` ซ้ำซ้อนโดยตั้งใจ: query ทุกตัวต้องเขียน `where: { userId: actor.userId }` ได้โดยไม่ join (กติกา §3)

### 2.2 ค่าเริ่ม `CalPref` เมื่อไม่มีแถว
ไม่มีแถว = ค่าเริ่ม M2 ทุกช่อง (`sources` ทุกตัวเปิด · `travelMinutes 0`) · แถวถูกสร้างเมื่อ (ก) ผู้ใช้ PUT prefs (ข) job สรุปจองวันแรก (upsert พร้อม `lastMorningDay`) — ไม่ backfill

### 2.3 ทะเบียน scope (`src/lib/core/scope.ts`) — CAL1.1 เพิ่ม 4 บรรทัด
`CalItem: tenant` · `CalPref: tenant` · `CalLink: g("ปฏิทิน Google ของ \"คน\" (1 แถว/user/provider) ใช้ข้ามทุกร้าน — ส่วนตัว M4")` · `CalExternalEvent: g("แคชอีเวนต์ Google ของคน — ผูก CalLink ไม่ผูกร้าน")`

### 2.4 ทำไม `CalLink` ต่อคน ไม่ต่อร้าน
บัญชี Google เป็นของคน (M4 "ส่วนตัว 100%") · ถ้าต่อร้าน ผู้ใช้ 2 ร้านต้องล็อกอิน Google 2 ครั้ง + ดึงอีเวนต์ซ้ำ 2 ชุด + token 2 ใบของบัญชีเดียว · ร้านไม่มีสิทธิ์ใด ๆ ต่อแถวนี้ (ไม่มี tenantId = ไม่หลุดใน export/purge ของร้าน) ⇒ อีเวนต์ Google แสดงในปฏิทินของ**ทุก**กิจการที่ผู้ใช้เปิด (นัดชนต้องเห็นชีวิตจริงทั้งหมด) · สรุปเช้านับครั้งเดียว (R-CAL-31) · `exportKinds` ใช้กับทุกกิจการ (เตือน/นัดของทุกร้านส่งไปปฏิทินเดียว)

### 2.5 ตารางเดิมที่ CAL1.x ต้องแตะ (นอก calendar.prisma — ไม่มีคอลัมน์ใหม่)
| ที่ | เปลี่ยน | ใบ |
|---|---|---|
| `src/lib/core/push.ts:14` `PushMsg` | + `categoryId?: string` ส่งใน payload เฉพาะเมื่อผู้เรียกใส่ (R-CAL-13) | CAL1.4 |
| `src/lib/platform/pdpa.ts` `exportTenantData` | ยกเว้น `CalItem`/`CalPref` (R-CAL-33) | CAL1.1 |
| `src/lib/platform/account-deletion.ts` `deleteUserTraces` | + `calItem.deleteMany({userId})` · `calPref.deleteMany` · `calLink.deleteMany` (cascade อีเวนต์) — ถอน token Google แบบพยายาม (ไม่บล็อกการลบ) ก่อนลบ | CAL1.1/1.8 |
| `src/lib/staff/levels.ts:248` `removeStaff` (+ ทางออกจากร้านเอง) | ลบ `CalItem`/`CalPref` ของ (userId, tenantId) นั้น | CAL1.2 |
| `scripts/crm-cron.mts` (ต่อจาก `:84`) + `src/app/api/cron/outbox/route.ts` | `await import("@/lib/modules/calendar/jobs")` | CAL1.4 |
| `docs/modules/31-secretary.md` R-K8 (`:64` `:851`) | ชี้ราง minute-jobs (R-CAL-1) — **แก้แล้วในใบนี้** | CAL0.2 |

### 2.6 ข้อมูลส่วนตัว (PDPA)
- ลบบัญชี = ลบทุกแถว 4 ตาราง · ออกจากร้าน = ลบ CalItem/CalPref ของร้านนั้น · ร้าน purge = ลบ CalItem/CalPref (แกน tenant) · export ร้าน = **ไม่รวม** (R-CAL-33)
- `CANCELLED`/`DONE` (ไม่ทำซ้ำ) อายุ > 90 วัน ลบทิ้งโดย `calendar.fire` (ทีละ ≤ 200 แถว/รอบ) · `DRAFT` > 24 ชม. → `CANCELLED`
- `CalExternalEvent` ที่ `endAt < now − 60 วัน` ลบโดย `calendar.google`
- ไม่มี log/ops ใดพิมพ์ `title`/`note` — logOps ใส่แค่ `itemId`

---

## 3. M3 — บังคับด้วยโครงสร้าง

### 3.1 กติกาเหล็ก
1. **ไม่มีพารามิเตอร์ `userId`** ใน route/ฟังก์ชัน service/เครื่องมือ AI ใด — ตัวตนมาจาก `CalActor` ที่ด่านสร้างเท่านั้น
2. ทุก query ของ 4 ตาราง มี `userId: actor.userId` **ตรงตัวใน where** (ไม่ผ่านตัวแปร where ที่ประกอบจากที่อื่น) — ข้อสอบ grep ใน qc-cal-* (`prisma.cal(Item|Pref|Link|ExternalEvent).\w+\(\{[^}]*where:\s*\{(?![^}]*userId)` = แดง ยกเว้น 3 job ที่ระบุใน §3.3)
3. id ของคนอื่น = **404** `not_found` (ไม่ใช่ 403) — ไม่บอกว่ามีอยู่
4. zod `.strict()` ทุก body ⇒ ส่ง `userId`/`ownerId`/`recipient*`/`assignee*` = 400 `invalid`
5. ระดับเลขาของร้าน **ไม่ตัด**ของส่วนตัว (R-CAL-21 · มติ Q2) · ด่านอนุมัติของร้าน **ไม่ใช้** (ไม่ใช่ `action:true`)

### 3.2 ลายเซ็น service (ครบชุด — ไม่มีตัวอื่นที่เขียนตาราง CAL นอก job)

```ts
// items.ts (แผน)
type CalActor = { userId: string; tenantId: string; membership: MembershipCtx }; // สร้างจากด่านเท่านั้น
type CalItemInput = {
  kind: "REMINDER" | "EVENT"; title: string; note?: string | null;
  startAt: Date; endAt?: Date | null; allDay?: boolean;
  repeat?: "NONE" | "DAILY" | "WEEKLY" | "MONTHLY"; repeatDays?: number[]; leadMinutes?: number;
  link?: { type: CalLinkType; id: string } | null;
};
createItem(actor, input, opts?: { source?: "APP" | "CHAT" | "SUGGEST"; roomId?: string; draft?: boolean; now?: Date }): Promise<CalItemDto>
updateItem(actor, id, patch: Partial<CalItemInput>, now?): Promise<CalItemDto>   // DONE/CANCELLED = 409
confirmItem(actor, id, now?): Promise<CalItemDto>                              // DRAFT → OPEN
cancelItem(actor, id, now?): Promise<{ ok: true }>                             // → CANCELLED (+ syncDirty ถ้ามี externalId)
markDone(actor, id, opts?: { occ?: Date; now?: Date }): Promise<CalItemDto>    // §5.5
reopen(actor, id, now?): Promise<CalItemDto>                                   // DONE → OPEN (repeat NONE เท่านั้น)
snooze(actor, id, to: { preset: "1h" | "tomorrow9" } | { until: Date }, now?): Promise<CalItemDto>
getItem(actor, id): Promise<CalItemDetailDto>                                  // + phone ของลูกค้าที่ผูก (ถ้าอ่านได้) สำหรับ "โทรเลย"
listItems(actor, q: { tab: "today" | "upcoming" | "done"; take?: number; before?: string }, now?): Promise<{ items: CalItemDto[]; nextBefore?: string }>
roomReminders(actor, roomId): Promise<CalItemDto[]>                             // R-CAL-20 · userId = actor เสมอ
getPrefs(actor): Promise<CalPrefsDto>  ·  setPrefs(actor, patch): Promise<CalPrefsDto>

// agenda.ts (แผน)
agendaFor(actor, range: { from: string; to: string /* YYYY-MM-DD ไทย */ }, opts?: { now?: Date; access?: AccessMap }): Promise<AgendaResult>
monthDots(actor, ym: string /* YYYY-MM */, opts?): Promise<Record<string /*YYYY-MM-DD*/, ColorKey[]>>
todayOpenCount(actor, now?): Promise<number>
completeSourceItem(actor, ref: { source: "kanban" | "crm"; id: string }, now?): Promise<{ ok: true } | { ok: false; code: "NO_DONE_COLUMN" | "FORBIDDEN" | "NOT_FOUND" }>

// google.ts (แผน)
googleStatus(userId): Promise<GoogleLinkDto | null>
connectGoogle(userId, serverAuthCode, deps?): Promise<GoogleLinkDto>
updateGoogle(userId, patch: { calendars?: { id: string; import: boolean }[]; exportCalendarId?: string | null; exportKinds?: ("EVENT" | "REMINDER" | "BOOKING")[] }): Promise<GoogleLinkDto>
syncGoogle(userId, opts?: { reason: "job" | "open" | "manual"; deps?: GoogleDeps }): Promise<{ ok: boolean; changed: number }>
disconnectGoogle(userId, deps?): Promise<{ ok: true }>
```
`google.ts` รับ `userId` เพราะ CalLink ไม่ผูกร้าน — ผู้เรียกมีแค่ route (`userGate` · userId จาก token) และ job · **ไม่มี export ไปเครื่องมือ AI**

### 3.3 ข้อยกเว้นที่อ่านข้ามผู้ใช้ (job เท่านั้น · ไม่มีทางเข้าจาก request)
`calendar.fire` (แถวที่ `nextFireAt ≤ now`) · `calendar.brief` (Membership × CalPref) · `calendar.google` (CalLink ที่ถึงรอบ) — ทั้งสามทำงานแทน "เจ้าของแถว" และส่งผลถึงเจ้าของแถวคนเดียวเสมอ (push `sendPushToUser(row.userId)`)

### 3.4 ร้านมองไม่เห็น (M4)
ไม่มี route ฝั่งเว็บ/backoffice/API v1 อ่าน 4 ตาราง · ไม่มีเครื่องมือ AI ที่อ่าน CalItem ของคนอื่น · `AiActionLog` ไม่ถูกเขียน (R-CAL-20) · export ร้านยกเว้น (R-CAL-33) · ผู้ดูแลแพลตฟอร์มดูได้เฉพาะ `getMinuteJobStatus`

---

## 4. Agenda

### 4.1 ชนิด

```ts
export type AgendaSource =
  | "booking" | "account" | "tax" | "kanban" | "crm" | "hr" | "dorm" | "ticket" | "trips" // ของร้าน (อ่านอย่างเดียว)
  | "reminder" | "event"                                                                // CalItem
  | "google"                                                                             // CalExternalEvent
  | "device";                                                                            // แอปเติมเอง (expo-calendar) — เซิร์ฟเวอร์ไม่เคยส่ง

export type ColorKey = "booking" | "account" | "kanban" | "crm" | "hr" | "dorm" | "ticket" | "trips" | "remind" | "personal" | "google" | "device";

export type AgendaDeepLink = { kind: "web"; path: string } | { kind: "app"; path: string } | null; // R-CAL-9

export type AgendaItem = {
  id: string;            // คงที่ข้ามคำขอ: "<source>:<id>" · ทำซ้ำ "reminder:<itemId>@<occISO>" · แถวสรุป "account:due:<sysId>:<YYYY-MM-DD>"
  source: AgendaSource;
  title: string;         // ≤ 120 (ตัดด้วย …)
  sub: string | null;    // บรรทัดรอง (จอ 3: "ครูนิว · สระ 1" · "คุณสั่งเมื่อวาน 18:42" · "การ์ดในบอร์ด \"ทริปสิมิลัน\"")
  label: string;         // ป้ายระบบ (จอ 3/10): บัตรคิว · บัญชี · บอร์ดงาน · CRM · HR · หอพัก · ตั๋ว · ทริป · เตือนฉัน · นัดส่วนตัว · Google · iPhone
  startAt: string;       // ISO UTC · all-day = เที่ยงคืนไทยของวันนั้น
  endAt?: string;
  allDay: boolean;
  timeHint: "DURATION" | "REMIND" | "DUE" | null; // คอลัมน์ซ้าย จอ 3: "1 ชม." / "เตือน" / "ครบกำหนด"
  deepLink: AgendaDeepLink;
  checkable: boolean;    // วงกลมขวา (จอ 3/10)
  done: boolean;
  mine: boolean;         // ผู้ใช้เป็นคนทำ/ไปเอง (ใช้ตัดนัดชน · นัดทั้งสาขาของผู้จัดการ = false)
  colorKey: ColorKey;    // แถบสีซ้าย = sysColor ของแอป (เพิ่มคีย์ remind/personal/google/device ใน apps/mobile/src/components/secretary/sys.ts)
  conflictWith?: string[];                       // id ของ AgendaItem ที่ชน (§11)
  summary?: { count: number; amountSatang?: number }; // แถวสรุป (บัญชี/หอพัก · R-CAL-6) — แตะ = รายการในระบบ
  ref?: { itemId?: string; occ?: string; cardId?: string; activityId?: string; systemId?: string }; // ใช้กับปุ่มติ๊ก/แก้
};

export type AgendaResult = {
  items: AgendaItem[];          // เรียง: วัน → allDay ก่อน → startAt → priority แหล่ง (§4.3) → id
  conflicts: ConflictNote[];    // §11
  notes: { code: "BOOKING_UNLINKED" | "SECTION_FAILED" | "SECTION_OFF"; source: AgendaSource; text: string }[];
  // BOOKING_UNLINKED = ร้านมีจองคิวแต่ผู้ใช้ไม่ผูกพนักงาน (มติ Q1) "ผูกบัญชีกับพนักงานเพื่อเห็นนัดของคุณ"
};
```

### 4.2 กติการ่วมของทุก adapter
- ช่วงคำขอ ≤ 42 วัน (`from..to` วันไทย รวมปลาย) · เกิน = 400
- แต่ละ adapter ห่อแบบ `part()` ของ digest (`digest.ts:95`): ล้ม = `[]` + `logOps("WARN","calendar",…)` + `notes: SECTION_FAILED` — แหล่งอื่นยังมา
- แหล่งของร้าน (booking…trips) ตัดเมื่อ: (ก) ร้านไม่มีระบบ/หน่วย active ของชนิดนั้น (ข) `CalPref.sources[key] === false` (ค) `moduleOff(access, module)` (R-CAL-21 — ตาราง §4.3 คอลัมน์ "โมดูลเลขา") (ง) ตัวกรองสิทธิ์ของแหล่งไม่ผ่าน
- ของส่วนตัว (`reminder` `event` `google`) ไม่ถูก (ค)(ง) ตัด · `google` แสดงทุกกิจการ (§2.4) · `CalItem` เฉพาะ `tenantId` ปัจจุบัน
- เพดานต่อแหล่งต่อวัน 50 แถว + แถว "อีก N รายการ" (`checkable:false`, deepLink = หน้ารายการของระบบ)
- ข้อความทุกช่องจากเซิร์ฟเวอร์เป็นไทยสำเร็จรูป · ไม่มีเบอร์/อีเมลลูกค้าใน `title/sub` (ชื่อได้)

### 4.3 ตาราง adapter

| source | โมดูลเลขา (OFF ตัด) | query | "ของฉัน" / ใครเห็น (ตัวกรองที่ใช้ซ้ำ) | title · sub · label | deepLink | checkable / done |
|---|---|---|---|---|---|---|
| `booking` | `booking` | `Appointment` ต่อหน่วย `tenantDb({tenantId, unitId})` · `startAt` ในช่วง · `status ∉ {CANCELLED, NO_SHOW}` | ต่อหน่วย: **ทั้งสาขา** เมื่อ `evaluate(m,{module:"booking", action, unitId})` ผ่านข้อใดข้อหนึ่งของ `booking.queue.operate · booking.job.runAny · booking.appointment.setStatus` (`src/lib/core/rbac.ts:32`) · ไม่ผ่าน = เฉพาะ `staffId ∈ myStaffIds({tenantId,unitId}, userId)` (`src/lib/modules/booking/today-line.ts:99`) · สาขาที่ `canAccessUnit` ไม่ผ่าน = ข้าม · `mine = staffId ∈ myStaffIds` | title `<บริการ> · <customerName>` (กลุ่ม `groupId` = `<บริการ> (<n> คน)`) · sub `<ชื่อพนักงาน> · <ชื่อ resource>` · บัตรคิว | ช่าง: web `/app/u/<unitSlug>/booking/mine` · ผู้จัดการ: web `/app/u/<unitSlug>/booking/day?date=YYYY-MM-DD` | false / `status = DONE` |
| `account` | `account` | `AccountDocument` ระบบ ACCOUNT active · `direction OUT` · `status ∈ {AWAITING_PAYMENT, PARTIAL}` · `voidedAt null` · `docType ≠ BILLING_NOTE` · `grandTotal − paidTotal > 0` (นิยาม digest `digest.ts:127-152`) | `canReadSystem(m,"account")` = `account.doc.view` (`digest.ts:279`) — ไม่มี "ของฉัน" | **แถวสรุป** (R-CAL-6): ต่อระบบต่อวันที่ `dueDate` ในช่วง → "ใบแจ้งหนี้ครบกำหนด N ใบ" · sub = ชื่อลูกค้า 2 รายแรก + ยอด "Ocean Tour ฿12,000 · คุณมาลี ฿6,400" (+ "และอีก N") · บน**วันนี้**เพิ่ม 1 แถว "เกินกำหนด N ใบ ฿Y" (`dueDate < bkkAt(now,0,0,0)`) · บัญชี | web `/app/sys/<sid>/account/documents` | false / false |
| `tax` | `account` (ภ.พ.30 · ภ.ง.ด.3/53) · `hr` (ภ.ง.ด.1 · ปกส.) | ไม่อ่านฐานนอกจากเงื่อนไขแสดง — `taxDeadlines(range, now)` (§4.4) | ตาม §4.4 | title "ยื่น ภ.พ.30 เดือน ต.ค." · sub "กำหนดยื่น (ตรวจสอบกับสรรพากร) · ยื่นกระดาษภายในวันที่ 15" · บัญชี (ภ.ง.ด.1/ปกส. = HR) | §4.4 | false / false |
| `kanban` | `kanban` | `KanbanCard` `status ACTIVE` · `dueAt` ในช่วง · บอร์ด `visibleBoardsWhere(actor)` (`src/lib/modules/kanban/access.ts:123`) | `assigneeUserId = me ∪ KanbanCardAssignee.userId = me` (นิยาม `myTasksOverview` `kanban/my-tasks.ts:49`) — เฉพาะของฉัน · `mine = true` | title = ชื่อการ์ด · sub `การ์ดในบอร์ด "<ชื่อบอร์ด>"` · `timeHint DUE` · บอร์ดงาน | web `/app/sys/<sid>/kanban/b/<boardId>?card=<cardId>` | **true** เมื่อผู้ใช้เป็น EDITOR ของบอร์ด / `completedAt ≠ null` · ติ๊ก = `completeCard(ctx, cardId)` (`kanban/my-tasks.ts:161`) · บอร์ดไม่มีคอลัมน์เสร็จ = 409 "บอร์ดนี้ยังไม่มีคอลัมน์ 'เสร็จ' — ย้ายการ์ดในบอร์ดแทน" · ติ๊กออก (undo) = ไม่รองรับในปฏิทิน |
| `crm` | `crm` | `crm.activities.calendar(ctx, actor, {from, to, mine: true})` (`src/lib/modules/crm/activities.ts:992` · `activityWhere` + ช่วง `startAt ?? dueAt`) · ระบบ CRM `uiVersion = 2` เท่านั้น | `ownerUserId = me` (R-CAL-24) · actor = `toMemberActor(userId, m)` (`member/access.ts:86`) · `mine = true` | title = ชื่อกิจกรรม · sub `<ประเภทไทย> · <ชื่อผู้ติดต่อ/ดีล>` · CRM | app `/crm/tasks?systemId=<sid>&taskId=<id>` | type ∈ {TASK, CALL, EMAIL, LINE} = true (R-CAL-36) · ติ๊ก = `completeActivity(ctx, actor, id)` (`activities.ts:735`) / `doneAt ≠ null` |
| `hr` | `hr` | (ก) `HrPayrollRun` `payDate` ในช่วง · `status ∈ {APPROVED, PAID}` (ข) `HrLeave` ของฉัน `status ∈ {PENDING, APPROVED}` ซ้อนช่วง | (ก) `canViewPayroll(m)` (`rbac.ts:47`) (ข) `employeeId = employeeOfUser(tenantId, userId)` (`hr/service.ts:811`) — **ไม่ต้องมี `hr.leave.read`** · ใบลาคนอื่นไม่แสดง (R-CAL-7) | (ก) "จ่ายเงินเดือนงวด พ.ย." all-day (ข) "ลา<ประเภท>" all-day ทุกวันในช่วง · sub "รออนุมัติ"/"อนุมัติแล้ว" · HR | (ก) web `/app/sys/<sid>/hr/payroll` (ข) web `/app/sys/<sid>/hr/leave` | false |
| `dorm` | `dorm` | `DormBillRun` `status = SENT` · `dueDate` ในช่วง · นับ `DormBill` ของรอบที่ `status ∈ {SENT, PARTIALLY_PAID}` | `dormAccess(m, unitId).board` (`dorm/access.ts:10` = `dorm.view`) | **แถวสรุป**ต่อรอบ: "ค่าห้อง <งวด> ครบกำหนด" · sub "ค้าง N ห้อง · ฿X" (ค้าง 0 = "เก็บครบแล้ว" + `done:true`) · หอพัก | web `/app/u/<unitSlug>/dorm/billing` | false / ค้าง = 0 |
| `ticket` | `ticket` | `TicketEvent` `status PUBLISHED` · `startAt` ในช่วง (R-CAL-4) | สาขาที่ `canAccessUnit` + (OWNER/MANAGER หรือมีคีย์ `ticket.event.*` ใด ๆ) | title = ชื่ออีเวนต์ · ตั๋ว | web `/app/u/<unitSlug>/ticket` | false |
| `trips` | `ticket` | — | `TRIPS_ADAPTER_ENABLED = false` (ค่าคงที่ในโค้ด · R-CAL-8) ⇒ `[]` | — | — | — |
| `reminder` | — | `CalItem` `userId = me` · `tenantId` ปัจจุบัน · `kind REMINDER` · `status ∈ {OPEN, DONE}` · ขยายครั้งทำซ้ำในช่วง (`occurrences` §5.1 · ≤ 62 ครั้ง) | ของตัวเองเท่านั้น · `mine = true` | title = ชื่อเรื่อง · sub "คุณสั่งเมื่อวาน 18:42" (CHAT) / "ผูกกับ <ชื่อ>" / note บรรทัดแรก · `timeHint REMIND` · เตือนฉัน | ผูกและอ่านได้ → deepLink ของสิ่งที่ผูก (ตาราง §4.5) · ไม่ผูก/อ่านไม่ได้แล้ว → app `/secretary/calendar?day=YYYY-MM-DD&item=<id>` | **true** / ไม่ทำซ้ำ: `status=DONE` · ทำซ้ำ: ครั้ง `< occursAt` = done, ครั้ง `≥ occursAt` = ไม่ done |
| `event` | — | เหมือน reminder แต่ `kind EVENT` | ของตัวเอง · `mine = true` | sub "นัดส่วนตัว · สร้างในแอป" + " → ส่งไป Google แล้ว" เมื่อ `externalId ≠ null` (จอ 10) · `timeHint DURATION` · นัดส่วนตัว | เหมือน reminder | false |
| `google` | — | `CalExternalEvent` `userId = me` · `deletedAt null` · `sharkRef null` · `calendarId ∈ calendars[import=true]` · ซ้อนช่วง | ของตัวเอง · `mine = true` | sub "จากปฏิทิน Google · <ชื่อปฏิทิน>" · Google | `null` (แตะ = แผ่นรายละเอียดในแอป) | false |
| `device` | — | แอปอ่าน `expo-calendar` เอง (§10.6) | — | sub "จากปฏิทิน iPhone" · iPhone | `null` | false |

priority เรียงแหล่ง (เวลาเท่ากัน + สีจุดเดือน): `reminder · event · booking · crm · kanban · account · tax · hr · dorm · ticket · google · device`

### 4.4 ตารางกำหนดยื่น (`tax-deadlines.ts` · R-CAL-15 · มติ Q4)

| แบบ | วันหลัก (ออนไลน์) | บรรทัดรอง | ใครเห็น | เงื่อนไขแสดง | deepLink |
|---|---|---|---|---|---|
| ภ.พ.30 | 23 ของเดือนถัดไป (แบบที่ครบ 1 ก.พ. 2567 – 31 ม.ค. 2570) · หลังนั้น = 15 + sub "ตรวจประกาศขยายเวลา" | "ยื่นกระดาษภายในวันที่ 15" | OWNER หรือ `account.tax.view` | `AccountSettings.vatRegistered = true` ของระบบบัญชี | web `/app/sys/<accSid>/account/reports/pp30` |
| ภ.ง.ด.3 / 53 | 15 ของเดือนถัดไป (ช่วงขยายเดียวกัน) · หลังนั้น = 7 | "ยื่นกระดาษภายในวันที่ 7" | `account.wht.manage` หรือ `account.tax.view` (OWNER ผ่าน) | มี `AccountDocument docType WHT_CERT direction IN` `issueDate` ในเดือนก่อน | web `/app/sys/<accSid>/account/wht` |
| ภ.ง.ด.1 | 15 (ช่วงขยาย) · หลังนั้น = 7 | "ยื่นกระดาษภายในวันที่ 7" | `canViewPayroll` | มีระบบ HR + `HrPayrollRun` งวดเดือนก่อน `status ∉ {DRAFT, REVERSED}` | web `/app/sys/<hrSid>/hr/payroll` |
| ปกส. (สปส.1-10) | 15 ของเดือนถัดไป | – | `canViewPayroll` | งวดเดือนก่อน `totalSsoEmployeeSatang > 0` | web `/app/sys/<hrSid>/hr/payroll` |

- แถว all-day `checkable:false` · title "ยื่น <แบบ> เดือน <ชื่อเดือนย่อของงวด>" · ไม่เลื่อนตามวันหยุด ([U] — แสดงวันตามกฎ) · ข้อความ "กำหนดยื่น (ตรวจสอบกับสรรพากร/ประกันสังคม)" (ไม่ใช่คำปรึกษากฎหมาย)
- ⚠️ คำบรรยายภาพจอ 4 "30 = ส่ง ปกส./ภ.ง.ด.1" เป็นตัวอย่างประกอบ — ปฏิทินใช้วันตามตารางนี้ (ปกส. 15 · ภ.ง.ด.1 15/7) · "25 = จ่ายเงินเดือน" มาจาก `HrPayrollRun.payDate` จริง
- การ์ด "วันนี้"/สรุปเช้า แสดงกำหนดยื่นที่ครบ **ภายใน 7 วันข้างหน้า** เป็นบรรทัด "ยื่น ภ.พ.30 เดือน ต.ค. · อีก 3 วัน" (จอ 1/2) แม้ไม่ใช่วันนี้

### 4.5 deepLink ของสิ่งที่ผูก (`CalItem.linkType`)
| linkType | deepLink | ตรวจสิทธิ์ (สร้าง/แก้ + ตอนแสดง · R-CAL-23) |
|---|---|---|
| `CRM_CONTACT` | web `/app/sys/<sid>/crm/contacts/<id>` | `contactWhere(ctx, actor)` (`crm/where.ts:23`) |
| `CRM_DEAL` | app `/crm?systemId=<sid>&dealId=<id>` | `dealWhere` (crm v2) |
| `ACCOUNT_DOC` | web `/app/sys/<sid>/account/docs/<docType>/<docId>` | `account.doc.view` + เอกสารอยู่ใน `<sid>` |
| `KANBAN_CARD` | web `/app/sys/<sid>/kanban/b/<boardId>?card=<id>` | `visibleBoardsWhere(actor)` |

อ่านไม่ได้แล้ว = แสดงชื่อเรื่องของเตือนเอง + deepLink ของตัวเตือน · ปุ่ม "โทรเลย" หายไป · ข้อความจาก link (ดีล/ยอดค้าง/เบอร์) ไม่ถูกใส่ใน push

### 4.6 การ์ด "วันนี้" + บรรทัดสรุป (`summary.ts` · R-CAL-30)
`briefLines(items: AgendaItem[], day: string, now: Date, opts: { upcomingTax: AgendaItem[] }): BriefLine[]` บริสุทธิ์ — กติกา:
1. ตัด `done` · ตัด google ถ้า `opts.includeGoogle = false` (R-CAL-31)
2. กลุ่มตามลำดับ: booking (นับ "นัดลูกค้า N คิว" · rightText "คิวแรก HH:MM") · account (รวมใบ+ยอด "ใบแจ้งหนี้ครบกำหนด N ใบ" · rightText "฿18,400") · reminder/event รายตัว (title · rightText HH:MM) · kanban ("การ์ดงานครบกำหนด N ใบ") · crm ("งาน CRM N รายการ") · hr/dorm/ticket รายตัว · tax จาก `upcomingTax` ("ยื่น ภ.พ.30 เดือน ต.ค." · rightText "อีก N วัน"/"วันนี้") · google รวม ("นัดในปฏิทินส่วนตัว N นัด")
3. ตัดเหลือ 4 บรรทัดแรก · `count` = จำนวนรายการจริงทั้งหมด (ไม่ใช่จำนวนบรรทัด) · ไม่มีบรรทัด = การ์ดไม่แสดง/ไม่ส่งสรุป
4. `BriefLine = { colorKey, text, rightText }` · ข้อความเช้า "สวัสดีตอนเช้าครับ วันนี้มี N เรื่อง" (คำลงท้ายตามเพศเลขา `AiSecretary` — ใช้ตัวช่วยเดิมของ identity)

---

## 5. เตือน — `next-fire.ts` (บริสุทธิ์ · ข้อสอบครอบคลุม 100%)

### 5.1 occurrences
`occurrences(item, fromUtc, toUtc, cap = 62): Date[]` — เวลาเป็นเวลาไทย (UTC+7 คงที่ · คำนวณบน `t + 7h` ด้วย `getUTC*` แล้วลบกลับ) · เวลาของวัน = HH:MM ของ `startAt` (all-day = 09:00 · `ALL_DAY_FIRE_MINUTE = 540`)
- `NONE`: `[startAt]`
- `DAILY`: ทุกวันตั้งแต่วันของ `startAt`
- `WEEKLY`: วันใน `repeatDays` (ว่าง = วันของ `startAt`) ตั้งแต่วันของ `startAt` · ค่า 0..6 ไม่ซ้ำ เรียง
- `MONTHLY`: วันที่ = วันของ `startAt` (วันยึด D) · เดือนที่ไม่มีวัน D → วันสุดท้ายของเดือน (31 ม.ค. → 28/29 ก.พ. → 31 มี.ค. — **ยึด D เดิมเสมอ** ไม่ลื่นตาม) · ⚠️ `bkkParts().mo` เริ่ม 0
- ไม่มีวันสิ้นสุดการทำซ้ำในรุ่นนี้ (ยกเลิก = หยุด)

### 5.2 nextFire
`nextFire(item, now): { occursAt: Date; fireAt: Date } | null`
- occurrence `o` ตัวแรก (≥ `startAt`) ที่ `o > now` **และ** `o ≠ firedOccAt` · `fireAt = max(o − leadMinutes, now)` (ล่วงหน้าเลยมาแล้วแต่ยังไม่ถึงเวลานัด = ยิงรอบถัดไปของ job)
- `NONE` และ `startAt ≤ now` → `null`
- `nextFireAt` ที่บันทึก = `min(fireAt (ถ้า occurrence นี้ยังไม่ยิง), snoozeUntil, nagAt)` · `status ≠ OPEN` → `null`
- EVENT ใช้กติกาเดียวกัน (เตือนก่อนนัดตาม `leadMinutes` · ค่าเริ่ม EVENT = 15 นาที · REMINDER = 0 — ค่าเริ่มของแผ่นจอ 6 "ตรงเวลา")

### 5.3 ตรวจตอนสร้าง/แก้ (`validateWhen`) — ข้อความไทยตรงตัว
| กรณี | ผล |
|---|---|
| `REMINDER` และ `nextFire = null` (เวลาผ่านแล้ว · เผื่อ 30 วิ) | 400 `past_time` "เวลานี้ผ่านไปแล้ว — เลือกเวลาในอนาคต" |
| `EVENT` เวลาผ่านแล้ว | ยอม (บันทึกย้อนหลัง) · `nextFireAt = null` |
| `endAt ≤ startAt` | 400 `invalid` "เวลาสิ้นสุดต้องหลังเวลาเริ่ม" |
| EVENT ยาว > 14 วัน / ไกล > 2 ปี | 400 "ช่วงเวลานานเกินไป" / "ตั้งล่วงหน้าได้ไม่เกิน 2 ปี" |
| title ว่าง/ > 200 · note > 2,000 | 400 "ใส่เรื่องที่จะเตือน (ไม่เกิน 200 ตัวอักษร)" |
| `repeatDays` นอก 0..6 หรือ repeat ≠ WEEKLY แต่ส่งมา | 400 "วันที่ทำซ้ำไม่ถูกต้อง" |
| `leadMinutes` ∉ ชุดที่อนุญาต | 400 "เวลาเตือนล่วงหน้าไม่ถูกต้อง" |
| link อ่านไม่ได้ | 404 "ไม่พบรายการที่จะผูก หรือคุณยังไม่มีสิทธิ์เห็น" |
| `OPEN` ต่อคนต่อร้าน > 500 | 409 `limit` "มีเตือนค้างเยอะเกินไป — ปิดรายการที่เสร็จแล้วก่อน" |

### 5.4 เลื่อน (snooze · จอ 7)
`snoozeTarget(preset, now)`: `"1h"` = `now + 60 นาที` (ตัดวินาที) · `"tomorrow9"` = `bkkAt(now, 9, 0, 1)` · custom `until` ต้อง `> now + 60 วิ` และ `≤ now + 365 วัน` (ไม่ผ่าน = 400 "เลือกเวลาเลื่อนในอนาคต (ไม่เกิน 1 ปี)")
ผล: `snoozeUntil = เป้า` · `nagAt = null` · `version+1` · `nextFireAt` คำนวณใหม่ · `status` ต้อง `OPEN` (อื่น = 409 "รายการนี้ปิดไปแล้ว") · เลื่อนของทำซ้ำ = เลื่อนเฉพาะการแจ้งของครั้งที่เพิ่งยิง (ครั้งถัดไปตามกติกาเดิม)

### 5.5 เสร็จ / ยกเลิก
- `markDone` · `NONE`: `status DONE` · `doneAt` · `nextFireAt/snoozeUntil/nagAt = null` · ทำซ้ำ: ไม่ปิดแถว — ถ้า `occ` (จาก push/แถว agenda) = `occursAt` (ยังไม่ยิง) → เลื่อน `occursAt` ไปครั้งถัดไป · ถ้า `occ < occursAt` (ยิงแล้ว) → ล้าง `snoozeUntil/nagAt` เท่านั้น · ทำซ้ำได้ (idempotent: ครั้งที่สอง = 200 ค่าเดิม)
- `cancelItem` → `CANCELLED` · `cancelledAt` · `nextFireAt = null` · มี `externalId` → `syncDirty = true` (ลบใน Google)
- `reopen` (`NONE` + DONE เท่านั้น) → `OPEN` · คำนวณ `nextFireAt` ใหม่ (เวลาผ่านแล้ว = ไม่ยิง แต่แสดงค้าง)
- ทุกการเปลี่ยน: `version + 1` · EVENT/REMINDER ที่อยู่ใน `exportKinds` → `syncDirty = true`

### 5.6 minute job `calendar.fire` (`jobs.ts` · CAL1.4)
`registerMinuteJob({ name: "calendar.fire", everyMinutes: 1, ownBudgetMs: 5_000, run })` — ทุกขั้น idempotent · เริ่มใหม่ได้ทุกบรรทัด
1. **จอง**: `token = randomUUID()` · `updateMany({ where: { status: "OPEN", nextFireAt: { lte: now }, OR: [{leaseUntil: null}, {leaseUntil: {lt: now}}] , id: { in: <≤100 id แรกเรียง nextFireAt> } }, data: { leaseUntil: now+120s, leaseToken: token } })` แล้ว `findMany({ where: { leaseToken: token } })`
2. ต่อแถว — ตรวจ Membership `acceptedAt ≠ null` ของ (userId, tenantId) · ไม่มี = `nextFireAt = null` (ไม่ส่ง · ไม่ลบ — ลบเป็นงานของ removeStaff)
3. **ตัดสินเหตุ** (เรียงความสำคัญ): `snoozeUntil ≤ now` → `SNOOZE` · `fireAt ≤ now && firedOccAt ≠ occursAt` → `DUE` · `nagAt ≤ now` → `NAG`
4. **commit ก่อนส่ง**: `updateMany({ where: { id, leaseToken: token, version: <ที่อ่าน> }, data: <สถานะใหม่ + leaseToken null + leaseUntil null> })` · ได้ 0 แถว = ผู้ใช้แก้ระหว่างนั้น ⇒ **ไม่ส่ง**
   - `DUE`: `firedOccAt = occursAt` · `lastFiredAt = now` · NONE → `nagAt = now + 30 นาที` · ทำซ้ำ → `occursAt = ครั้งถัดไป` (ไม่มี nag)
   - `SNOOZE`: `snoozeUntil = null` · NONE → `nagAt = now + 30 นาที`
   - `NAG`: `nagAt = null` (ย้ำ **1 ครั้ง** ต่อการยิงหนึ่งครั้ง · ย้ำแล้วไม่ย้ำอีก)
   - ทุกเหตุ: `nextFireAt` คำนวณใหม่ · `fireAttempts = 0`
5. **ส่ง** `sendPushToUser(userId, msg)` (ไม่ใส่ tenantId · R-CAL-12) นอกทรานแซกชัน · ล้มด้วย transport (exception ไม่ใช่ "ไม่มีเครื่อง") → `updateMany where {id, version}` ตั้ง `nextFireAt = now + 60 วิ` + คืนค่าเหตุ (`firedOccAt` ก่อนหน้า/`snoozeUntil`) + `fireAttempts + 1` · ครบ 3 = เลิก + `logOps("WARN","calendar","push ล้ม 3 ครั้ง",{itemId})` · `sent = 0` เพราะไม่มีเครื่อง = ถือว่าสำเร็จ (ไม่ retry)
6. งานเก็บกวาด (รอบละ ≤ 200): DRAFT > 24 ชม. → CANCELLED · CANCELLED/DONE(NONE) > 90 วัน → ลบ
- **ไม่ push รายการของระบบอื่น** (R-CAL-22) · **ไม่ใช้ quiet hours** (R-CAL-11)
- งบ: `ownBudgetMs 5_000` · เกิน `deadline` = หยุดรับแถวใหม่ (แถวที่จองแล้ว lease หมดใน 2 นาที แล้วรอบหน้าทำต่อ)
- สุขภาพ: `getMinuteJobStatus(["calendar.fire","calendar.brief","calendar.google"])` ใน `src/components/crm/integrations/JobsList.tsx`
- ข้อสอบ CAL1.4 (นาฬิกาปลอม + post ปลอม): 2 รอบซ้อน = ส่ง 1 · เลื่อน/เสร็จระหว่างจอง = 0 · WEEKLY ข้ามเดือน · MONTHLY 31 → ก.พ. · ย้ำ 1 ครั้งเท่านั้น · transport ล้ม 2 ครั้งแล้วสำเร็จ = ส่ง 1

---

## 6. สรุปเช้า/เย็น — job `calendar.brief` (CAL1.5)

`registerMinuteJob({ name: "calendar.brief", everyMinutes: 1, ownBudgetMs: 6_000 })`
1. `today = bkkYmd(now)` · `nowMin` = นาทีไทยของวัน
2. ผู้มีสิทธิ์ (query เดียว · เรียง `(minute, userId, tenantId)`): Membership `acceptedAt ≠ null` · ร้าน ACTIVE · ผู้ใช้มี `PushDevice` ≥ 1 · LEFT JOIN `CalPref` (ไม่มีแถว = ค่าเริ่ม M2) · `morningOn` · `morningMinute ≤ nowMin ≤ morningMinute + 90` · `lastMorningDay ≠ today`
   - เกินหน้าต่าง 90 นาที (ราง minute ล่ม/ตั้งใหม่หลังเวลา) = **ข้ามวันนั้น** (ไม่ส่งสรุปเก่า) และไม่จอง
3. **เป็นชุด**: ≤ 50 คู่ (ผู้ใช้,ร้าน) ต่อรอบ · ที่เหลือรอบถัดไป (ค่าเริ่ม 08:00 ทุกคน ⇒ กระจายเอง ≤ 1–2 นาทีต่อ 50–100 คน · กัน pool Neon ตามบทเรียน `MAX_PUSH_USERS`) · หยุดรับคู่ใหม่เมื่อเลย `deadline`
4. **จอง** ต่อคู่: `updateMany({ where: { userId, tenantId, OR: [{lastMorningDay: null}, {lastMorningDay: {not: today}}] }, data: { lastMorningDay: today } })` · 0 แถวและไม่มีแถว → `create` (unique ชน = คนอื่นจองแล้ว ข้าม) — **จองก่อนส่ง** (ส่งได้ไม่เกิน 1 ครั้ง/วัน)
5. เนื้อหา: `agendaFor(actor, {from: today, to: today})` (ไม่เรียกโมเดล) → `briefLines` (§4.6) · google นับเฉพาะกิจการหลัก (R-CAL-31) · **วันว่าง (ไม่มีบรรทัด) = ไม่ส่ง** (แต่จองแล้ว — ไม่ถามซ้ำทั้งวัน)
6. ส่ง 1 ข้อความ **ต่อกิจการ** (§7.2) ด้วย `sendPushToUser(userId, msg)` ไม่กรองร้าน
- เย็น: เหมือนกันด้วย `eveningOn/eveningMinute/lastEveningDay` · เนื้อหา = **พรุ่งนี้** (`from = to = พรุ่งนี้`)
- เปิด/ปิด/เปลี่ยนเวลาระหว่างวัน: ตั้งเวลาใหม่ที่ยังไม่ถึงและยังไม่จองวันนี้ = ได้วันนี้ · จองแล้ว = พรุ่งนี้
- ⚠️ ซ้อนกับสรุปรายวันของ CRM (`crm/notify-senders.ts:166`) — คงทั้งคู่ (มติ Q5)
- ข้อสอบ CAL1.5: ตั้ง 07:15 ได้ 07:15 ครั้งเดียว · ปิดแล้วไม่ได้ · 2 กิจการ = 2 ข้อความ · วันว่าง = 0 · google ไม่ซ้ำ 2 ข้อความ · 120 คนเวลาเดียวกัน = ครบใน ≤ 3 รอบ

---

## 7. Push

### 7.1 เตือนถึงเวลา (จอ 7)
```jsonc
{
  "title": "🔔 โทรหาคุณเอก เรื่องมัดจำเรือ",           // NAG: "🔔 ย้ำ: <title>" · ≤ 64 ตัว
  "body": "ดีลเช่าเรือ ธ.ค. · ค้างมัดจำ ฿20,000 · เบอร์ 08x-xxx-4421", // ข้อมูลล่าสุดของสิ่งที่ผูก (อ่านได้เท่านั้น) · ไม่ผูก = note บรรทัดแรก หรือ "<HH:MM> · เตือนฉัน" · EVENT = "<HH:MM>–<HH:MM> · นัดส่วนตัว"
  "data": {
    "type": "cal",
    "link": "/secretary/calendar?day=2026-11-17&item=<itemId>",
    "tenantId": "<CalItem.tenantId>",
    "itemId": "<id>",
    "occ": "2026-11-17T08:00:00.000Z"                  // occurrence ที่แจ้ง — ส่งกลับใน done
  },
  "categoryId": "SEC_CAL"                               // หรือ "SEC_CAL_CALL" (R-CAL-34)
}
```
- เบอร์ในข้อความ = ปิด 6 หลักกลาง (`08x-xxx-4421`) · เบอร์เต็มไม่อยู่ใน payload
- body ของ CRM_DEAL: `<ชื่อดีล> · ค้างมัดจำ ฿X` เมื่อมีค่าในดีล · ACCOUNT_DOC: `<เลขที่> · ค้าง ฿X · ครบ <วัน>` · KANBAN_CARD: `การ์ดในบอร์ด "<บอร์ด>"`
- ไม่มี `badge` (Q3 มติ — ปฏิทินไม่ยุ่งตัวเลขไอคอนแอป)

**category (แอปลงทะเบียนตอนเปิด · `setNotificationCategoryAsync` · CAL2.8)**

| categoryId | ปุ่ม (identifier → ข้อความ) | ผล |
|---|---|---|
| `SEC_CAL` | `CAL_DONE` → "✓ เสร็จแล้ว" · `CAL_SNOOZE_1H` → "⏰ เลื่อน 1 ชั่วโมง" · `CAL_SNOOZE_TOMORROW` → "⏰ เลื่อนไปพรุ่งนี้ 09:00" | `POST items/[id]/done {occ}` · `POST items/[id]/snooze {preset:"1h"}` · `{preset:"tomorrow9"}` |
| `SEC_CAL_CALL` | 3 ปุ่มข้างบน + `CAL_CALL` → "📞 โทรเลย" (`opensAppToForeground: true`) | แอปเปิด → `GET items/[id]` → `phone` → `Linking.openURL("tel:…")` |

- `opensAppToForeground`: รุ่นนี้ทุกปุ่ม `true` (ทำได้ด้วย `expo-notifications` ที่มี · ส่ง OTA ได้) · แบบไม่เปิดแอป ต้อง `expo-task-manager` = build รวมตอนท้าย (R-CAL-13b)
- แตะตัวแจ้งเตือน (ไม่กดปุ่ม) = `handleSecretaryPush` เดิม (`apps/mobile/src/lib/push-register.ts:127`) → `switchTenant` ถ้า `data.tenantId` ต่าง → `router.push(data.link)` · เพิ่มแถว `SEC_LINKS` (`push-register.ts:75`): `{ re: /^\/secretary\/calendar(\?(day=\d{4}-\d{2}-\d{2})(&item=[A-Za-z0-9_-]{1,80})?)?$/, to: (l) => l }`
- เลือก `SEC_CAL_CALL` เมื่อ: linkType ∈ {CRM_CONTACT, CRM_DEAL} · อ่านได้ · ผู้ติดต่อ (หรือผู้ติดต่อหลักของดีล) มี `phone`

### 7.2 สรุปเช้า/เย็น (จอ 1)
```jsonc
{
  "title": "☀️ สรุปวันนี้ · SIAM DIVE CENTER",       // เย็น: "🌙 พรุ่งนี้ · <ชื่อกิจการ>"
  "body": "นัดลูกค้า 4 คิว (คิวแรก 09:30) · ใบแจ้งหนี้ครบกำหนด 2 ใบ รวม ฿18,400 · อีก 3 วันยื่น ภ.พ.30 · เตือนของคุณ 1 รายการ", // ≤ 178 ตัว ตัดด้วย "…"
  "data": { "type": "cal_brief", "link": "/secretary/calendar?day=2026-11-16", "tenantId": "<id>" }
  // ไม่มี categoryId · ไม่มี badge
}
```
แตะ = เปิดจอปฏิทินวันนั้นของกิจการนั้น ("แตะ = เปิดหน้า วันนี้" จอ 1)

---

## 8. API แอป — `src/app/api/mobile/secretary/calendar/*` (CAL1.6)

กติการ่วม = `docs/api/SECRETARY-API.md` "กติการ่วม" ข้อ 1–7 ทุกข้อ (Bearer · `x-tenant-id` · `.strict()` · 404 แทน 403 · `withErrors` · 429 รูปมาตรฐาน) และ:
- ด่าน = **สมาชิกร้าน** `gate(req, null)` (`src/app/api/mobile/secretary/_shared.ts:49` · ไม่ต้องมีคีย์ — ปฏิทินส่วนตัวของทุกคน) · `google/*` = `userGate` (ไม่ต้องมีร้าน · CalLink ต่อคน)
- rate limit `withRateLimit("<tenantId>:<userId>", "cal-<route>", n)` · google = `withRateLimit("<userId>", "cal-google-<route>", n)`
- วัน = `"YYYY-MM-DD"` (วันไทย) · เวลา = ISO UTC · body ห้ามมี `userId`/`now`/`tenantId` ของผู้ทำ (400 `invalid`)
- `CalItemDto = { id, kind, title, note, startAt, endAt, allDay, repeat, repeatDays, leadMinutes, link: { type, id, systemId, label } | null, status, doneAt, occursAt, nextFireAt, snoozeUntil, source, roomId, exported: boolean, createdAt, updatedAt }` (ไม่มี lease/version/externalId/etag)

| METHOD | path | request | response 200 | rate | errors (ไทย) | จอ |
|---|---|---|---|---|---|---|
| GET | `calendar/agenda` | query `from`,`to` (YYYY-MM-DD · ≤ 42 วัน · `to` ไม่ส่ง = `from`) | `AgendaResult` (§4.1) | 60 | 400 `invalid` "ช่วงวันไม่ถูกต้อง (ไม่เกิน 42 วัน)" | 3 · 4 (แตะวัน) · 10 |
| GET | `calendar/month` | query `ym` (`YYYY-MM`) | `{ ym, days: { "YYYY-MM-DD": ColorKey[] (≤3 · เรียง priority) } }` — ไม่รวม device (แอปเติม) | 60 | 400 "เดือนไม่ถูกต้อง" | 3 (จุดแถบสัปดาห์) · 4 |
| GET | `calendar/today` | – | `{ day, dateLabel: "จ. 16 พ.ย.", count, greeting, lines: BriefLine[] (≤4), more: boolean }` · `count=0` = แอปซ่อนการ์ด | 60 | – | 2 |
| GET | `calendar/items` | query `tab` (`today`\|`upcoming`\|`done` · ค่าเริ่ม upcoming) · `take` 1..100 (50) · `before` (cursor ISO\|id) | `{ items: CalItemDto[], nextBefore? }` · today = `occursAt` วันนี้ OPEN · upcoming = OPEN/DRAFT `occursAt ≥ พรุ่งนี้` เรียงขึ้น · done = DONE เรียง `doneAt` ลง | 60 | 400 | 3 (แท็บเตือนฉัน) |
| POST | `calendar/items` | `{ kind, title, note?, startAt, endAt?, allDay?, repeat?, repeatDays?, leadMinutes?, link?: {type, id}, origin?: "conflict" }` strict | `{ item: CalItemDto }` (`origin:"conflict"` → `source SUGGEST`) | 30 | 400 ตาราง §5.3 · 404 link · 409 `limit` | 6 · 10 (เตือนเลย) |
| GET | `calendar/items/[id]` | – | `{ item: CalItemDto, phone: string \| null }` (`phone` = E.164 ของลูกค้าที่ผูกเมื่ออ่านได้ — ใช้กับ "โทรเลย" เท่านั้น) | 60 | 404 "ไม่พบรายการนี้ หรือคุณยังไม่มีสิทธิ์เห็น" | 5 · 6 (แก้) · 7 |
| PATCH | `calendar/items/[id]` | ฟิลด์ของ POST ทุกตัวเป็น optional (ยกเว้น `origin`) · `link: null` = ถอดผูก | `{ item }` | 30 | 400 · 404 · 409 `closed` "รายการนี้ปิดไปแล้ว" | 5 (แก้ไข) · 6 |
| DELETE | `calendar/items/[id]` | – | `{ ok: true }` (= CANCELLED · ซ้ำได้) | 30 | 404 | 3 (ปัดซ้าย) · 5 (ยกเลิก) |
| POST | `calendar/items/[id]/done` | `{ occ?: iso }` strict | `{ item }` | 60 | 404 · 409 `closed` (CANCELLED) | 3 (วงกลม/ปัดขวา) · 7 |
| POST | `calendar/items/[id]/reopen` | `{}` | `{ item }` | 30 | 404 · 409 "รายการทำซ้ำติ๊กออกไม่ได้" | 3 (ติ๊กออก) |
| POST | `calendar/items/[id]/snooze` | `{ preset: "1h" \| "tomorrow9" } \| { until: iso }` strict | `{ item }` | 60 | 400 §5.4 · 404 · 409 `closed` | 7 |
| POST | `calendar/items/[id]/confirm` | `{}` | `{ item }` (DRAFT → OPEN) · ซ้ำ = 200 | 30 | 404 · 409 `closed` · 410 `expired` "ข้อเสนอนี้หมดอายุแล้ว — สั่งเลขาใหม่" · 400 `past_time` | 5 (ใช่ ตั้งเลย) |
| POST | `calendar/source-done` | `{ source: "kanban" \| "crm", id }` strict | `{ ok: true }` | 30 | 404 · 403 "บอร์ดนี้คุณดูได้อย่างเดียว" · 409 `no_done_column` "บอร์ดนี้ยังไม่มีคอลัมน์ 'เสร็จ' — ย้ายการ์ดในบอร์ดแทน" | 3 (วงกลมการ์ด/งาน CRM) |
| GET | `calendar/prefs` | – | `{ tenantName, morning: {on, minute}, evening: {on, minute}, travelMinutes, sources: [{ key, label, sub, on }] (เฉพาะแหล่งที่ผู้ใช้มีสิทธิ์ + ร้านเปิด · ลำดับ จอ 8), google: { status: "NONE" \| "ACTIVE" \| "NEEDS_RECONNECT", email \| null } }` | 60 | – | 8 |
| PUT | `calendar/prefs` | `{ morning?: {on?, minute? 0..1439}, evening?: {...}, travelMinutes? 0..240, sources?: Record<key, boolean> }` strict · คีย์ที่ไม่มีสิทธิ์ = เพิกเฉย | เหมือน GET | 30 | 400 "เวลาไม่ถูกต้อง" | 8 |
| GET | `calendar/google` | – | `GoogleLinkDto = { status, email, calendars: [{id, name, color, primary, import}], exportKinds, exportCalendarId, exportCalendarName, lastSyncAt, lastError }` · ไม่เชื่อม = `{ status: "NONE" }` | 60 | – | 8 · 9 |
| POST | `calendar/google/connect` | `{ serverAuthCode: string(≤ 512) }` strict | `GoogleLinkDto` (เชื่อมใหม่/เชื่อมซ้ำแทนที่ token) | 5 | 503 `not_configured` "ระบบยังไม่พร้อมเชื่อม Google" · 400 `scope_missing` "ยังไม่ได้อนุญาตให้เข้าถึงปฏิทิน — ลองใหม่แล้วกดอนุญาต" · 400 `bad_code` "เชื่อม Google ไม่สำเร็จ — ลองใหม่อีกครั้ง" | 9 |
| PUT | `calendar/google` | `{ calendars?: [{id, import}] (≤50), exportKinds?: ("EVENT"\|"REMINDER"\|"BOOKING")[], exportCalendarId?: string \| null }` strict · ปฏิทินปลายทางต้อง `accessRole ∈ {owner, writer}` | `GoogleLinkDto` | 30 | 404 ไม่เชื่อม · 400 "ปฏิทินนี้แก้ไขไม่ได้ เลือกปฏิทินอื่น" | 9 |
| POST | `calendar/google/sync` | `{}` | `{ ok, changed }` | 1 ครั้ง/2 นาที/ผู้ใช้ (เกิน = 429 "เพิ่งซิงก์ไป รออีกสักครู่") | 404 · 409 `needs_reconnect` "ต้องเชื่อม Google ใหม่" | 3 (ดึงลงรีเฟรช) · 9 |
| DELETE | `calendar/google` | – | `{ ok: true }` | 5 | – (ไม่เชื่อม = 200) | 9 (ยกเลิกการเชื่อม) |

### 8.1 เส้นเดิมที่เปลี่ยน
| เส้น | เปลี่ยน |
|---|---|
| `GET secretary/badges` | + `calendar: number` = `todayOpenCount` (R-CAL-19) · **ไม่รวม** ใน `total` · ส่วนนี้ล้ม = 0 + logOps WARN |
| `GET secretary/badge` (`badgeTotalFor`) | ไม่เปลี่ยน (มติ Q3) |
| `GET secretary/rooms/[id]` | + `reminders: CalItemDto[]` = `roomReminders(actor, roomId)` (เฉพาะของผู้เรียก · R-CAL-20) |

### 8.2 `todayOpenCount` (badge)
count ตรง ไม่เรียก `agendaFor` · แคชในหน่วยความจำ 60 วิต่อ (tenantId,userId): `CalItem OPEN` ของร้านนี้ `occursAt` วันนี้ (ทำซ้ำนับครั้งวันนี้ที่ยังไม่ผ่าน `occursAt`) + การ์ดของฉัน `dueAt` วันนี้ `completedAt null` (บอร์ดที่มองเห็น) + กิจกรรม CRM ของฉัน `(startAt ?? dueAt)` วันนี้ `doneAt null` · ไม่นับแหล่งที่ปิดใน `CalPref.sources` หรือระดับเลขา OFF · แต่ละส่วนล้ม = 0

---

## 9. เครื่องมือเลขา AI (CAL1.7 · R-CAL-18)

ที่อยู่: `tools-calendar.ts` (แผน · `src/lib/ai/`) ลงทะเบียนใน `toolRegistry()` (`src/lib/ai/tools.ts:2643`) · `HAND_TOOL_ACCESS` (`tool-access.ts:69`) add/update/cancel = `{ needs: [], writesNow: true }` · list/agenda = `{ needs: [] }` · ทั้ง 5 ใน `HAND_TOOL_CORE` (`:169`) · `calendar_add` + `calendar_agenda` ใน `CORE_TOOLS` (`skills.ts:41`) · ไม่มี `action: true` (ไม่ผ่านด่านอนุมัติ) · ผู้กระทำต้อง `ctx.actor.kind === "member"` — อื่น = ข้อความ "ปฏิทินส่วนตัวใช้ได้เฉพาะสมาชิกในแอป" · `CalActor` สร้างจาก `ctx.actor` เท่านั้น

### 9.1 JSON schema (ไม่มีพารามิเตอร์ผู้รับ/ผู้ใช้ทุกตัว · `additionalProperties: false`)
```jsonc
// calendar_add — "ตั้งเตือนหรือนัดส่วนตัวของผู้ใช้คนที่คุยอยู่เท่านั้น (ห้ามใช้เตือนคนอื่น)"
{ "type": "object", "required": ["title", "whenISO"], "additionalProperties": false, "properties": {
  "kind":        { "type": "string", "enum": ["REMINDER", "EVENT"], "description": "เตือนฉัน (ค่าเริ่ม) หรือ นัดส่วนตัว" },
  "title":       { "type": "string", "maxLength": 200 },
  "whenISO":     { "type": "string", "description": "ISO-8601 พร้อม offset +07:00 เช่น 2026-11-17T15:00:00+07:00" },
  "endISO":      { "type": "string", "description": "EVENT เท่านั้น" },
  "allDay":      { "type": "boolean" },
  "repeat":      { "type": "string", "enum": ["NONE", "DAILY", "WEEKLY", "MONTHLY"] },
  "repeatDays":  { "type": "array", "items": { "type": "integer", "minimum": 0, "maximum": 6 }, "description": "WEEKLY: 0=อาทิตย์" },
  "leadMinutes": { "type": "integer", "enum": [0, 5, 10, 15, 30, 60, 120, 1440] },
  "link":        { "type": "object", "required": ["type", "id"], "additionalProperties": false, "properties": {
                    "type": { "type": "string", "enum": ["CRM_CONTACT", "CRM_DEAL", "ACCOUNT_DOC", "KANBAN_CARD"] }, "id": { "type": "string" } } },
  "note":        { "type": "string", "maxLength": 2000 } } }
// calendar_update — { id (required), title?, whenISO?, endISO?, allDay?, repeat?, repeatDays?, leadMinutes?, link? (null = ถอด), note?, confirm?: boolean (DRAFT → OPEN) }
// calendar_cancel — { id (required) }
// calendar_list   — { status?: "OPEN" | "DONE" (OPEN), take?: 1..20 (10) }  → เฉพาะ CalItem ของผู้ใช้ ร้านนี้
// calendar_agenda — { fromDate: "YYYY-MM-DD" (required), toDate?: "YYYY-MM-DD" (≤ 14 วัน) } → agendaFor + skippedSectionNote ต่อแหล่งที่ OFF
```

### 9.2 ตรวจฝั่งเซิร์ฟเวอร์ (ผลเป็นข้อความถึงโมเดล — โมเดล "ถามกลับ" ผู้ใช้)
| กรณี | ผลของเครื่องมือ |
|---|---|
| `whenISO` ไม่มี offset / offset ≠ +07:00/Z / parse ไม่ได้ | `ERROR need_time: ถามผู้ใช้ว่าวันไหน กี่โมง` |
| เวลาผ่านแล้ว (REMINDER) | `ERROR past_time: เวลานี้ผ่านไปแล้ว ถามผู้ใช้เวลาใหม่` |
| ไกลกว่า 2 ปี / ช่วง EVENT ผิด | `ERROR invalid: <ข้อความ §5.3>` |
| link อ่านไม่ได้ | `ERROR link_not_found: ไม่พบหรือไม่มีสิทธิ์ — ค้นด้วยเครื่องมือ CRM/บัญชีก่อน หรือถามผู้ใช้ว่าหมายถึงใคร` |
| `repeat ≠ NONE` | สร้าง **DRAFT** (R-CAL-28) → `OK draft:<id> — ถามผู้ใช้ยืนยัน "ตั้งเป็นเตือนประจำ <สรุป> ใช่ไหม" (แอปแสดงปุ่ม ใช่ ตั้งเลย / แก้เวลา)` |
| ปกติ | `OK item:<id> · <วันไทย เวลา> · การ์ดแสดงในห้องแล้ว — ตอบสั้น ไม่ทวนรายละเอียดเกินจำเป็น (ห้องร่วมมีคนอื่นเห็น)` |

กรณีถามกลับ (persona + eval): ไม่มีเวลา ("เตือนโทรหาคุณเอก") · คำกำกวม ("ต้นเดือน" · "ช่วงบ่าย" · "สัปดาห์หน้า" ไม่มีวัน) · ลูกค้าชื่อซ้ำ 2 คน · "ทุกวันที่ 31" (บอกว่าเดือนสั้นจะเตือนวันสุดท้าย) · เวลาที่ผ่านแล้ววันนี้ ("เตือน 8 โมง" ตอน 10:00 → ถาม "พรุ่งนี้ 08:00 ไหมครับ")
คำที่โมเดลแปลงเองได้ (ไม่ถาม): "พรุ่งนี้บ่ายสาม" · "อีกครึ่งชั่วโมง" · "ทุกวันจันทร์ 9 โมง" · "วันที่ 5 ทุกเดือน" · "เย็นนี้" (18:00) · "คืนนี้" (20:00)

### 9.3 การ์ดในห้อง (จอ 5)
เครื่องมือคืนข้อความ (สตริง) ตามสัญญา `AiTool.execute` เดิม · การ์ดวาดจาก `CalItem` ที่ `roomId = ห้องนี้` และ `userId = ผู้ดู` (`GET rooms/[id]` → `reminders` · R-CAL-20) วางในไทม์ไลน์ตาม `createdAt`:
- `ReminderCard`: ไอคอน 🔔 · title · ป้าย "เตือนฉัน"/"นัดส่วนตัว" · แถว "เมื่อไหร่" (`อ. 17 พ.ย. 15:00` พ.ศ.ปัก BKK · R-CAL-10) · แถว "ผูกกับ" (`link.label` เช่น "คุณเอก (CRM) · ดีลเช่าเรือ ธ.ค.") · ปุ่ม **แก้ไข** (AddCalSheet โหมดแก้ → PATCH) · **ยกเลิก** (DELETE) · สถานะ CANCELLED = การ์ดจาง "ยกเลิกแล้ว"
- DRAFT = ข้อความยืนยัน "ตั้งเป็น**เตือนประจำ** ทุกวันจันทร์ 09:00 ใช่ไหมครับ" + ปุ่ม **ใช่ ตั้งเลย** (`POST items/[id]/confirm`) · **แก้เวลา** (AddCalSheet โหมดแก้)
- สมาชิกห้องคนอื่นไม่ได้การ์ด (ได้แค่ฟองข้อความของเลขา)

### 9.4 M3 — ขอเตือนคนอื่น
- โครงสร้าง: ไม่มีช่องผู้รับ ⇒ ไม่มีทางสร้างของคนอื่น
- persona (`src/lib/ai/persona.ts` + `secretary/identity.ts:138`): "ขอให้เตือน/นัดให้คนอื่น (ชื่อพนักงาน/ทีม/'ทุกคน') → ตอบสุภาพว่า 'ปฏิทินเป็นของแต่ละคน ผมเตือนได้แค่คุณครับ' แล้วเสนอ 'มอบเป็นการ์ดให้<ชื่อ>แทนไหม' → ผู้ใช้ตกลง = `kanban_create_card` (ข้อเสนอ · ผ่านด่านอนุมัติเดิม) พร้อมผู้รับผิดชอบ + dueAt" · **ห้าม** เรียก `calendar_add` ในกรณีนี้ (แม้ใส่ชื่อคนอื่นใน title)
- แยกจาก `schedule_task`: "เตือนฉัน/นัด" = `calendar_add` · "ให้เลขาทำงาน/สรุปให้ทุกวัน" = `schedule_task`
- eval (`src/lib/ai/eval.ts` `GOLDEN_CASES` · ≥ 20 · ผ่าน ≥ 95%) ต้องมีอย่างน้อย: "เตือนครูนิวให้เช็กถังด้วย" (ไม่สร้าง + เสนอการ์ด) · "บอกทุกคนว่าพรุ่งนี้ประชุม 9 โมง" (ไม่สร้าง) · "เตือนฉันให้โทรหาครูนิวพรุ่งนี้ 10 โมง" (**สร้าง** — ผู้รับคือฉัน)

---

## 10. ซิงก์

### 10.1 Google — เชื่อม (CAL1.8 + CAL2.10 · R-CAL-17)
1. แอป: `GoogleSignin.configure({ webClientId, iosClientId, offlineAccess: true, scopes: [SCOPE_EVENTS, SCOPE_LIST] })` หรือ `addScopes` → `serverAuthCode` → `POST calendar/google/connect` · **ไม่ใช้ `expo-auth-session`**
2. scope (น้อยสุด): `https://www.googleapis.com/auth/calendar.events` · `https://www.googleapis.com/auth/calendar.calendarlist.readonly`
3. เซิร์ฟเวอร์: `integrationSecretKeyConfigured()` ไม่ผ่าน = 503 · `POST https://oauth2.googleapis.com/token` (`code`, `client_id=GOOGLE_WEB_CLIENT_ID`, `client_secret=GOOGLE_WEB_CLIENT_SECRET`, `grant_type=authorization_code`, `redirect_uri=""`) · scope ที่ได้ต้องมีทั้งสอง (ไม่ครบ = 400 `scope_missing`) · ไม่มี `refresh_token` = 400 `bad_code` · email จาก `id_token`
4. `id = cuid()` → `tokenBox = sealIntegrationSecret({refreshToken, accessToken, expiresAt}, \`cal:${userId}:${id}\`)` (R-CAL-16) · upsert ตาม `(userId, GOOGLE)` (เชื่อมซ้ำ = แทนที่ token + ถอน token เดิมแบบพยายาม · calendars เดิมคงค่า import)
5. ดึง `calendarList` → `calendars` (ค่าเริ่ม `import`: primary = true · อื่น = false · ปฏิทินวันหยุด = false) · ซิงก์แรกใน `after()`
6. access token หมด → refresh · `invalid_grant` = `status NEEDS_RECONNECT` + `lastError "ต้องเชื่อม Google ใหม่"` + หยุดซิงก์ (จอ 8 "ต้องเชื่อมใหม่" สีแดง · จอ 9 แถบเตือน + ปุ่ม "เชื่อมใหม่" = ทำขั้น 1–4 ใหม่)
7. token ไม่เคยออกจากเซิร์ฟเวอร์ · ไม่อยู่ใน DTO/log · `openIntegrationSecret` คืน null (AAD ไม่ตรง) = NEEDS_RECONNECT

### 10.2 Google — ดึงเข้า (job `calendar.google` · `everyMinutes: 15` · `ownBudgetMs: 8_000` + ตอนเปิดจอ/ดึงลง)
- เลือก CalLink `status ACTIVE` · `lastSyncAt < now − 14 นาที` · ≤ 20 ลิงก์/รอบ · lease `leaseUntil = now + 5 นาที`
- ต่อปฏิทินที่ `import = true`: มี `syncToken` → `events.list(syncToken)` · ไม่มี → full sync `timeMin = now − 30 วัน` · `singleEvents = true` · หน้า ≤ 250 · `410 Gone` = ล้าง syncToken แล้ว full sync ใหม่ (ลบแคชของปฏิทินนั้นก่อน)
- อีเวนต์ `status cancelled` → `deletedAt` · อีเวนต์ที่ `extendedProperties.private.sharkItemId` หรือ `sharkRef` มีค่า = สำเนาของเรา → **ไม่สร้างแถวแสดง** (ไปขั้นแก้สองทาง §10.3)
- ปิด import ปฏิทิน = ลบแคชของปฏิทินนั้น + ล้าง syncToken
- เพดาน 5,000 แถว/ลิงก์ · ล้าง `endAt < now − 60 วัน` ทุกรอบ

### 10.3 Google — ส่งออก + แก้สองทาง
- ส่งออกเมื่อ `kind ∈ exportKinds` (`EVENT` · `REMINDER`) ไปปฏิทิน `exportCalendarId ?? primary` · `syncDirty = true` → job/`after()` ทำ: ไม่มี `externalId` → insert (`extendedProperties.private = { sharkItemId: id }` · ทำซ้ำ = RRULE จาก repeat · REMINDER = อีเวนต์ 15 นาที) → เก็บ `externalId/externalEtag` · มี → patch · CANCELLED → delete · สำเร็จ = `syncDirty false`
- `BOOKING` (R-CAL-37): นัดที่ `mine` ของผู้ใช้ **ทุกกิจการ** 60 วันข้างหน้า → upsert ตาม `sharkRef = "appt:<tenantId>:<id>"` · นัดถูกยกเลิก/ย้าย/พ้นจากฉัน = delete/patch · ปิดตัวเลือก = ลบสำเนาทั้งหมด
- แก้ใน Google ของอีเวนต์ที่มี `sharkItemId` (etag ต่าง) → ถ้า remote `updated > CalItem.updatedAt` ⇒ เขียน title/startAt/endAt กลับ (`version + 1` · คำนวณ `nextFireAt` ใหม่) · ลบใน Google ⇒ CalItem `CANCELLED` (สองทางตามแผน) · สำเนา BOOKING ถูกแก้ใน Google = เขียนทับกลับ (ฝั่งร้านเป็นต้นฉบับ)
- ปิด `EVENT`/`REMINDER` ใน exportKinds = ลบสำเนาที่ส่งไปแล้วของชนิดนั้น + ล้าง externalId

### 10.4 Google — ยกเลิกเชื่อม (จอ 9 · ยืนยันก่อน)
`DELETE calendar/google` → ลบสำเนาที่ส่งออก (พยายาม · ล้มไม่บล็อก) → `POST https://oauth2.googleapis.com/revoke?token=<refresh>` (พยายาม) → ลบ `CalLink` (cascade `CalExternalEvent`) → `CalItem.externalId/externalEtag = null`, `syncDirty = false` ของผู้ใช้ทุกร้าน · ทันที (PDPA "ยกเลิกเชื่อม = ลบแคชทันที")

### 10.5 การฉีดทดสอบ
`GoogleDeps = { fetch?: typeof fetch; now?: Date }` แบบ `push.ts opts.post` — qc ใช้ transport ปลอมทั้งหมด · ทดสอบจริงบัญชีทดสอบเฉพาะ CAL3.2 (โหมด Testing ≤ 100 ผู้ใช้ · โปรเจกต์ `732040229931`)

### 10.6 ปฏิทินในเครื่อง (CAL2.11 · `expo-calendar` · ฝั่งเครื่องเท่านั้น)
- ไม่มี route เซิร์ฟเวอร์ · ไม่ส่งอีเวนต์ในเครื่องขึ้นเซิร์ฟเวอร์ (รวมถึงไม่ส่งเข้าเครื่องมือ AI) · สรุปเช้า (push) **ไม่รวม** นัดในเครื่อง — การ์ด "วันนี้"/จอปฏิทินรวมเมื่อเปิดแอป
- ขออนุญาตครั้งแรกเมื่อกด "ปฏิทิน iPhone" จอ 8 · `app.json` `NSCalendarsFullAccessUsageDescription` = "SHARK HUB ใช้ปฏิทินในเครื่องเพื่อแสดงนัดของคุณรวมกับงานร้าน และบันทึกนัดส่วนตัวที่คุณสร้าง — ข้อมูลไม่ถูกส่งออกจากเครื่อง" (Android `READ_CALENDAR`/`WRITE_CALENDAR`) ⇒ **build ใหม่ (รอเจ้าของสั่ง)**
- ค่าเลือกปฏิทิน + ตัวเลือกส่งออก + แผนที่ id (`{ [calItemId]: deviceEventId }`) เก็บ `SecureStore`/AsyncStorage คีย์ `cal.device.<userId>` · ส่งออกได้เฉพาะ `event` (นัดส่วนตัว)
- แถว `AgendaItem` source `device` id `"device:<eventId>"` · `mine: true` · รวมในนัดชนฝั่งแอป

---

## 11. นัดชน — `conflicts.ts` (บริสุทธิ์ · CAL1.9 + CAL2.12)

```ts
type ConflictNote = { key: string; kind: "OVERLAP" | "TIGHT"; earlierId: string; laterId: string; text: string; suggestRemindAt: string | null };
conflicts(items: AgendaItem[], travelMinutes: number, now: Date): { byId: Record<string, string[]>; notes: ConflictNote[] }
```
- เข้าเกณฑ์: `mine === true` · `allDay === false` · มี `endAt` · source ∈ {booking, crm, event, google, device} (ไม่นับ reminder/kanban/แถวสรุป/tax) · ไม่ `done`
- `OVERLAP`: `a.start < b.end && b.start < a.end` และทับ ≥ 1 นาที
- `TIGHT` (เฉพาะ `travelMinutes > 0`): `0 ≤ b.start − a.end < travelMinutes` · ข้อความ "⚠️ 13:00 ประชุมธนาคาร ชนกับเวลาเดินทางจาก<sub ของ a> (เลิก 12:00) · อยากให้ผมเตือนออกตอน 12:15 ไหมครับ"
- `suggestRemindAt` = `max(now + 1 นาที, b.start − max(travelMinutes, 15))` ปัดลง 5 นาที · `null` เมื่อ `b.start ≤ now` (ภาพจอ 10 = `travelMinutes 45` → 12:15 · R-CAL-35)
- คู่ที่ชนหลายคู่: 1 note ต่อคู่ติดกันตามเวลา · `key = sha1(earlierId|laterId)` (ปุ่ม "ไม่ต้อง" เก็บ key ในเครื่อง ไม่ส่งเซิร์ฟเวอร์)
- "เตือนเลย" = `POST calendar/items {kind:"REMINDER", title:"ออกไป<title ของ b>", startAt: suggestRemindAt, origin:"conflict"}`
- เซิร์ฟเวอร์คำนวณให้ (`AgendaResult.conflicts` + `conflictWith`) จากแหล่งที่รู้ · แอปคำนวณซ้ำเมื่อรวม `device` ด้วย **สำเนาเดียวกัน** cal-conflicts.ts (แผน · `apps/mobile/src/lib/`) + ข้อสอบ fixture ชุดเดียวกันทั้งสองฝั่ง

---

## 12. จอ ↔ สัญญา (ตรวจไม่มีช่องว่าง)

| จอ | องค์ประกอบที่มองเห็น | ฟิลด์/เส้น/กติกา |
|---|---|---|
| 1 สรุปเช้า | หัว "SHARK · เลขา" | ชื่อแอปของ OS (ไม่ใช่ payload) |
| 1 | "☀️ สรุปวันนี้ · SIAM DIVE CENTER" | §7.2 title · `Tenant.name` |
| 1 | "นัดลูกค้า 4 คิว (คิวแรก 09:30) · ใบแจ้งหนี้ครบกำหนด 2 ใบ รวม ฿18,400 · อีก 3 วันยื่น ภ.พ.30 · เตือนของคุณ 1 รายการ" | `briefLines` §4.6 → body §7.2 |
| 1 | 08:00 · ตั้งเอง/ปิดได้ · แยกต่อร้าน · แตะ = เปิด "วันนี้" | `CalPref.morning*` §6 · 1 ข้อความ/กิจการ · `data.link` |
| 1 | "✅ ทำเสร็จแล้ว 3 งาน · เมื่อวาน" | push เดิมของเลขา (`secretary/notify.ts`) — นอกสัญญานี้ |
| 2 หน้าเลขา | ไอคอนปฏิทินถัดจาก "ทีม" + badge 6 | `SecTopBar` zone `calendar` · `badges.calendar` §8.2 |
| 2 | การ์ด "วันนี้ · จ. 16 พ.ย. · 6 รายการ" · "สวัสดีตอนเช้าครับ วันนี้มี 6 เรื่อง" · 4 บรรทัดสีจุด + ข้อความขวา · "ดูทั้งหมดในปฏิทิน ›" | `GET calendar/today` (`dateLabel`, `count`, `greeting`, `lines[].colorKey/text/rightText`) · หายเมื่อ `count=0` หรือข้ามเที่ยงคืน (แอปเรียกใหม่เมื่อวันเปลี่ยน) |
| 3 วัน | หัว "วันนี้" · "พฤศจิกายน 2569" | แอป (`bkk.ts` พ.ศ. R-CAL-10) |
| 3 | Segment วัน/เดือน/เตือนฉัน | แอป · เตือนฉัน = `GET calendar/items?tab=` |
| 3 | แถบสัปดาห์ อา–ส + จุดใต้วัน | `GET calendar/month` (`days[date].length > 0`) |
| 3 | กลุ่ม "ทั้งวัน" / "ตามเวลา" | `AgendaItem.allDay` |
| 3 | แถว: เวลา + "1 ชม."/"เตือน"/"ครบกำหนด" · title · sub · ป้าย · แถบสีซ้าย | `startAt` · `endAt` + `timeHint` · `title` · `sub` · `label` · `colorKey` |
| 3 | แถวบัญชี "ใบแจ้งหนี้ครบกำหนด 2 ใบ · Ocean Tour ฿12,000 · คุณมาลี ฿6,400" | แถวสรุป `summary` (R-CAL-6) |
| 3 | วงกลมขวา (เตือนฉัน/การ์ด) · แตะแถว = เปิดในระบบ | `checkable/done` · `POST items/[id]/done`·`reopen` · `POST source-done` · `deepLink` (web ผ่าน `router.navigate("/", {open})` + `OPEN_PATH_RE` · app = `router.push`) |
| 3 | ดึงลงรีเฟรช · ว่าง | `GET agenda` (+ `POST google/sync` แบบไม่รอ) · `items=[]` = ข้อความว่าง · `notes` แสดงใต้หัว |
| 4 เดือน | "พฤศจิกายน" · "‹ 2569 ›" · ตารางเริ่มอาทิตย์ · จุดสี ≤ 3 | `GET calendar/month?ym` (`ColorKey[] ≤ 3` เรียง priority) |
| 4 | แตะวัน → "จ. 16 พ.ย. · 6 รายการ" + รายการ | `GET calendar/agenda?from=to=` |
| 4 | "25 = จ่ายเงินเดือน (HR) · 30 = ส่ง ปกส./ภ.ง.ด.1" | `hr` payDate · `tax` §4.4 (วันจริงตามตาราง ไม่ใช่ 30) |
| 5 แชท | พิมพ์ "เตือนพรุ่งนี้บ่ายสามโทรหาคุณเอก เรื่องมัดจำเรือ" → การ์ด 🔔 · "เตือนฉัน" · เมื่อไหร่ "อ. 17 พ.ย. 15:00" · ผูกกับ "คุณเอก (CRM) · ดีลเช่าเรือ ธ.ค." · แก้ไข/ยกเลิก | `calendar_add` §9 · `CalItem.source CHAT, roomId` · `GET rooms/[id].reminders` · `link.label` · PATCH/DELETE |
| 5 | "ทุกวันจันทร์ 9 โมงเตือนเช็กสต็อกอุปกรณ์" → "ตั้งเป็นเตือนประจำ ทุกวันจันทร์ 09:00 ใช่ไหมครับ" + ใช่ ตั้งเลย / แก้เวลา | DRAFT (R-CAL-28) · `POST items/[id]/confirm` · AddCalSheet แก้ |
| 5 | "เตือนครูนิวให้เช็กถังด้วย" → ปฏิเสธ + เสนอการ์ด | §9.4 · `kanban_create_card` |
| 5 | ไม่ชัวร์ = ถามกลับ | §9.2 |
| 6 แผ่นเพิ่มเตือน | Segment เตือนความจำ/นัดหมาย | `kind REMINDER/EVENT` |
| 6 | เรื่อง | `title` (≤200) |
| 6 | เมื่อไหร่: อีก 1 ชม. / เย็นนี้ 18:00 / พรุ่งนี้ 09:00 / เลือกเอง… | แอปคำนวณ `startAt` (เย็นนี้ ผ่าน 18:00 แล้ว = ซ่อนชิป) · นัดหมาย + `endAt` (ค่าเริ่ม +1 ชม.) |
| 6 | ทำซ้ำ "ไม่ซ้ำ ›" | `repeat` + `repeatDays` |
| 6 | ผูกกับ "Ocean Tour · ใบแจ้งหนี้ INV-0312 ›" | `link {type, id}` · ค้นด้วย API ค้นเดิมของแต่ละระบบ (CRM search · account docs · kanban search) |
| 6 | เตือนล่วงหน้า "ตรงเวลา ›" | `leadMinutes` |
| 6 | บันทึก · **ไม่มี "แจ้งใคร"** | `POST calendar/items` · M3 |
| 7 หน้าล็อก | "SHARK · เตือนฉัน" · "🔔 โทรหาคุณเอก เรื่องมัดจำเรือ" · "ดีลเช่าเรือ ธ.ค. · ค้างมัดจำ ฿20,000 · เบอร์ 08x-xxx-4421" | §7.1 title/body (ข้อมูลล่าสุดของ link) |
| 7 | เสร็จแล้ว / เลื่อน 1 ชั่วโมง / เลื่อนไปพรุ่งนี้ 09:00 / โทรเลย | category §7.1 · `done`/`snooze` · `GET items/[id].phone` |
| 7 | ไม่กด 30 นาที → ย้ำ 1 ครั้ง | `nagAt` §5.6 |
| 8 ตั้งค่า | "ตั้งค่าปฏิทิน · SIAM DIVE CENTER" | `GET prefs.tenantName` |
| 8 | ส่งสรุปตอนเช้า + เวลา "08:00 (ค่าเริ่ม)" · สรุปพรุ่งนี้ตอนเย็น + เวลา 19:00 | `morning/evening {on, minute}` · "(ค่าเริ่ม)" เมื่อ `minute = 480` |
| 8 | "แสดงในปฏิทิน (เฉพาะระบบที่คุณมีสิทธิ์)": บัตรคิว นัดลูกค้า · บัญชี ครบกำหนด · ภาษี · บอร์ดงาน การ์ดของฉัน · CRM งาน/นัด · HR เงินเดือน · ลา | `prefs.sources[] {key,label,sub,on}` (หอพัก/ตั๋ว ขึ้นเมื่อร้านมี) · PUT |
| 8 | ซิงก์ปฏิทินนอก: Google Calendar "เชื่อมแล้ว ›" · ปฏิทิน iPhone "เชื่อม ›" | `prefs.google.status` · iPhone = สถานะในเครื่อง §10.6 |
| 9 Google | หัว "Google Calendar" + email | `GET calendar/google.email` |
| 9 | "ดึงเข้ามาแสดงในปฏิทิน SHARK": ส่วนตัว (ของฉัน) · งานบ้าน (แชร์จากแฟน) · วันหยุดไทย | `calendars[] {name, color, primary, import}` · sub "ของฉัน" = primary · "แชร์จาก…" = accessRole reader/writer ที่ไม่ใช่ owner (ชื่อเจ้าของจาก `summaryOverride`/ไม่มี = "แชร์มา") · PUT |
| 9 | "ส่งออกไปที่ Google": นัดส่วนตัวที่สร้างในแอป · เตือนฉัน · นัดลูกค้าที่ฉันรับ (บัตรคิว) · ไปที่ปฏิทิน "ส่วนตัว ›" | `exportKinds` EVENT/REMINDER/BOOKING · `exportCalendarId/Name` |
| 9 | กล่องความเป็นส่วนตัว | ข้อความคงที่ในแอป (M4) |
| 9 | ยกเลิกการเชื่อม | `DELETE calendar/google` §10.4 |
| 10 พรุ่งนี้ | หัว "พรุ่งนี้" · "อ. 17 พ.ย." | แอป |
| 10 | แถว Google "ส่งลูกไปโรงเรียน · จากปฏิทิน Google · งานบ้าน" | source `google` |
| 10 | "ประชุมธนาคาร (สินเชื่อเรือ) · นัดส่วนตัว · สร้างในแอป → ส่งไป Google แล้ว" | source `event` · `exported` |
| 10 | "ทานข้าวกับลูกค้า Ocean Tour · จากปฏิทิน iPhone" | source `device` §10.6 |
| 10 | การ์ด ⚠️ นัดชน + "เตือนเลย"/"ไม่ต้อง" | §11 `ConflictNote` · `POST items {origin:"conflict"}` · ไม่ต้อง = เก็บ key ในเครื่อง |

---

## 13. seed QC — `scripts/seed-calendar-qc.mts`

ใช้ฐาน QC ของเลขา (`wo-sec-qc` · host `ep-calm-flower-aosbmxhm`) ผ่านตัวครอบเดิม:
```
bash scripts/iso.sh bash /root/projects/shark-sec/scripts/qc-sec.sh bash -c 'cd /root/projects/shark-sec-ui && bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/seed-calendar-qc.mts'
```
(`qc-sec.sh` อ่าน `.env.qc-sec` ของทรีที่ตัวมันอยู่ ตรวจ host แล้วส่ง `SEC_QC_HOST` · seed เรียก `loadSecQcEnv` ซ้ำ — prod/QC ของ RUN อื่น = exit 4 ก่อนแตะฐาน)

| สิ่งที่สร้าง (id ขึ้นต้น `calqc-` ทั้งหมด) | ทดสอบอะไร |
|---|---|
| ร้าน A `calqc-tenant` "CALQC Siam Dive" (หน่วย BOOKING + TICKET · ระบบ CRM v2 · KANBAN · ACCOUNT (vatRegistered) · HR) · ร้าน B `calqc-tenant-b` "CALQC Homestay" (หน่วย DORM · ระบบ ACCOUNT) | 2 กิจการ = 2 สรุป · ระบบที่ร้านไม่มี = ไม่มีแถว |
| เจ้าของ (OWNER ทั้ง A และ B) · ครูนิว (STAFF A · ผูก HR+BookingStaff · คีย์ kanban) · ครูบอส (MANAGER A + STAFF B `dorm.view`) | ทั้งสาขา vs ของฉัน · ไม่มีสิทธิ์บัญชีไม่เห็นใบแจ้งหนี้ |
| นัด 6 (วันนี้ 09:30 ครูนิว · 11:00 ครูบอส · 14:00 ยกเลิก · 16:00 ช่างไม่ผูก HR · พรุ่งนี้ 10:00 ครูนิว · พรุ่งนี้ 12:00–14:00 ครูนิว ทับนัดส่วนตัวของครูนิว 12:30) | R-CAL-5 · นัดชน OVERLAP |
| CRM: ผู้ติดต่อ "คุณเอก" (มีเบอร์) · กิจกรรม 4 (ของครูนิว CALL วันนี้ · TASK พรุ่งนี้ · ของเจ้าของ MEETING วันนี้ · ของครูนิวที่เสร็จแล้ว) | `ownerUserId` · done |
| บอร์ด "ทริปสิมิลัน" (TENANT · คอลัมน์ เสร็จ) + บอร์ด "ไม่มีคอลัมน์เสร็จ" · การ์ด 4 (ครูนิว วันนี้ 17:00 · ครูบอสผ่าน `KanbanCardAssignee` · เสร็จแล้ว · บอร์ดไม่มีคอลัมน์เสร็จ) | ติ๊ก = completeCard · `NO_DONE_COLUMN` |
| ใบแจ้งหนี้ 4 (ครบวันนี้ 2 ใบ ฿12,000/฿6,400 · เกินกำหนด PARTIAL · จ่ายแล้ว) + WHT_CERT IN เดือนก่อน | แถวสรุป · ภ.ง.ด.3/53 |
| เงินเดือน: งวดเดือนก่อน PAID (ปกส.>0) · งวดนี้ APPROVED payDate วันที่ 25 · ใบลาครูนิว + ใบลาครูบอส | ภ.ง.ด.1/ปกส. · ใบลาของฉันเท่านั้น |
| หอพัก (ร้าน B): ห้อง 2 · สัญญา 2 · รอบบิล SENT ครบอีก 4 วัน · บิล 2 (จ่ายแล้ว 1 · ค้าง 1) | แถวสรุป "ค้าง 1 ห้อง" |
| ตั๋ว: TicketEvent PUBLISHED พรุ่งนี้ | adapter ticket |
| **CalItem/CalPref** (ตรวจจาก client ตอนรัน — ยังไม่มีโมเดล = พิมพ์ `TODO(CAL1.1)` ข้าม): เตือนเจ้าของ 15:00 ผูกคุณเอก (CHAT) · ประจำทุกจันทร์ 09:00 · DRAFT ประจำวันที่ 5 · นัดส่วนตัวเจ้าของพรุ่งนี้ 13:00–14:00 · นัด/เตือนของครูนิว (เจ้าของห้ามเห็น) · เตือนเจ้าของในร้าน B · DONE 1 · ค่าตั้ง: เจ้าของร้าน B สรุปเช้า 07:15 · ครูบอส HR ปิด + เย็นเปิด + `travelMinutes 45` | M3 · R-CAL-28 · R-CAL-31 |

กติกา (แบบ `seed-secretary-qc.mts`): id ตายตัว · อ่านเทียบก่อนเขียน · **รันซ้ำวันเดียวกัน = ไม่มีการเขียน · รันวันอื่น = แก้วันที่ (ไม่เพิ่มแถว)** · วันอ้างอิง = วันไทยตอนรัน (`CAL_QC_DAY=YYYY-MM-DD` บังคับได้) · ไม่แตะแถวนอก `calqc-*` · ไม่ส่ง push · ไม่เรียกโมเดล · Google/CalLink ไม่ seed (ต้อง token จริง — ใช้ transport ปลอมใน qc-cal-*)

---

## 14. คำถามเจ้าของ

### 14.1 ตัดสินแล้ว (เจ้าของตอบ 14 พ.ย. 2569 · บันทึกท้าย `ledger/cal-briefs/cal-brief-RESOLUTIONS.md` commit `d998ed8d4`) — สัญญานี้ถือเป็นข้อกำหนด

| Q | เรื่อง | มติ |
|---|---|---|
| Q1 | ช่างที่ไม่ผูกบัญชีกับพนักงาน HR ไม่เห็นนัดตัวเอง | **ยอมรับ** · แสดง `notes BOOKING_UNLINKED` "ผูกบัญชีกับพนักงานเพื่อเห็นนัดของคุณ" (§4.1) |
| Q2 | ระดับเลขา "ปฏิทิน" = ปิด | **ไม่ปิดเตือนส่วนตัว** · ระดับนี้คุมแค่ปฏิทินกลางของร้าน (`upcoming_schedule`) (§3.1 ข้อ 5) |
| Q3 | badge ปฏิทินในตัวเลขไอคอนแอป | **ไม่รวม** — เฉพาะไอคอนปฏิทินในแถบบน (§8.1) |
| Q4 | วันหลักของกำหนดยื่นภาษี | **วันออนไลน์เป็นหลัก** + บรรทัดรองวันกระดาษ (§4.4) |
| Q5 | สรุปรายวันของ CRM vs สรุปเช้าปฏิทิน | **คงทั้งคู่** (§6) |
| Q6 | โค้ดเตือนบัญชีเดิม ภ.พ.30 "วันที่ 10" | **นอกขอบเขต CAL** — ส่งให้ RUN บัญชีแล้ว · ปฏิทินใช้ตาราง §4.4 |
| Q7 | ใบที่ร้านต้องจ่าย (รายจ่าย) | **ไม่แสดงในรุ่นนี้** (§4.3 แถว account = `direction OUT` เท่านั้น) |

### 14.2 ยังเปิด (ใหม่จากใบนี้ — ไม่บล็อก · ใช้ค่าเริ่ม)

| Q | คำถาม | ค่าเริ่มที่ใช้ |
|---|---|---|
| Q8 | เวลาเดินทางสำหรับนัดชน (จอ 10 ต้องใช้ ~45 นาที) ตั้งที่ไหน — จอ 8 ไม่มีแถวนี้ | `travelMinutes = 0` (เจอเฉพาะนัดทับกัน) จนกว่าเจ้าของเลือกที่ตั้ง (แถวในจอ 8 = ต้องแก้ภาพก่อน) |
| Q9 | ส่งออก "นัดลูกค้าที่ฉันรับ" ไป Google ใส่ชื่อลูกค้าในชื่ออีเวนต์ (ข้อมูลลูกค้าออกนอกระบบ) — ยอมไหม | ใส่ชื่อ ไม่ใส่เบอร์ · ค่าเริ่มปิด · ผู้ใช้เปิดเองตามจอ 9 |

---

## 15. ส่วนต่างจากสัญญาที่เลน a ตัดสินตอนเขียนโค้ด (CAL1.x · โค้ดชนะเอกสาร — บันทึกเหตุผล)

| รหัส | ใบ | เรื่อง | สิ่งที่ทำ | เหตุผล |
|---|---|---|---|---|
| D-A1 | CAL1.2 | `GET items?tab=today` | = OPEN ที่ `occursAt < พรุ่งนี้` (รวมเตือนที่เลยเวลาแล้วยังไม่ติ๊ก) แทน "occursAt วันนี้" | เตือนเมื่อวานที่ยังไม่เสร็จจะหายจากทุกแท็บ (upcoming = ตั้งแต่พรุ่งนี้ · done = DONE) |
| D-A2 | CAL1.2 | `markDone` ทำซ้ำ `occ > occursAt` | 400 "ติ๊กได้เฉพาะครั้งถัดไปของเตือนทำซ้ำ" · ไม่ส่ง `occ` = ถ้ามีเลื่อน/ย้ำค้าง → ล้างเท่านั้น ไม่งั้นข้ามครั้งถัดไป | ไม่มีที่เก็บ "ข้ามครั้งที่ N" (ไม่มีตารางข้อยกเว้น) · สัญญาไม่ระบุ |
| D-A3 | CAL1.2 | REMINDER ส่ง `endAt` | 400 "เตือนความจำไม่มีเวลาสิ้นสุด — ใช้แบบนัดหมายแทน" · แก้ EVENT→REMINDER ไม่ส่ง endAt = ล้างให้เอง | §2 "REMINDER = null" |
| D-A4 | CAL1.2 | note > 2,000 | ข้อความ "บันทึกยาวเกินไป (ไม่เกิน 2,000 ตัวอักษร)" (ตาราง §5.3 รวมกับข้อความ title) | ข้อความ title พูดถึง "เรื่อง" ไม่ใช่บันทึก |
| D-A5 | CAL1.2 | แก้ชนกัน (version เปลี่ยนระหว่างอ่าน–เขียน) | 409 `conflict` "รายการนี้เพิ่งถูกแก้ — ลองใหม่อีกครั้ง" | ทุกการเขียนของผู้ใช้เป็น `updateMany where version` (คู่กับ job §5.6) |
| D-A6 | CAL1.2 | body push ของ CRM_DEAL (§7.1 "ค้างมัดจำ ฿X") | `<ชื่อดีล> · มูลค่า ฿X · เบอร์ 08x-xxx-1234` | `CrmDeal` ไม่มีฟิลด์มัดจำ/ยอดค้าง — มีแค่ `valueSatang` |
| D-A7 | CAL1.2 | แก้เฉพาะชื่อ/บันทึก/ผูก | ไม่ตรวจ past_time และไม่คำนวณตารางยิงใหม่ (ตรวจ+คำนวณเฉพาะเมื่อแก้ kind/startAt/endAt/allDay/repeat/repeatDays/leadMinutes · แก้เวลา = ล้าง firedOccAt/snooze/nag) | แก้ชื่อของเตือนที่ยิงแล้ว (รอย้ำ) ต้องไม่ติด "เวลานี้ผ่านไปแล้ว" |
| D-A8 | CAL1.2 | `purgeMemberCalendar({userId, tenantId})` | ฟังก์ชันเดียวที่รับ userId — เรียกจาก `removeStaff` เท่านั้น (ด่านตรวจสิทธิ์ผู้ลบแล้ว) · ไม่มี route/เครื่องมือเรียก | §2.5 ต้องลบของคนที่ออกจากร้าน · ถอนสิทธิ์ชั่วคราว (`revokeStaffAccess`) ไม่ลบ (คืนสิทธิ์ได้ · job ไม่ยิงเพราะ acceptedAt null) |
| D-A9 | CAL1.4 | `sendPushToUser` ไม่โยน (กลืน error) ⇒ job แยก "transport ล้ม" กับ "ไม่มีเครื่อง" ไม่ได้ | push.ts คืน `{ sent, transportErrors }` เพิ่ม (additive · ผู้เรียกเดิมอ่านแค่ `sent`) · job: `transportErrors > 0 && sent = 0` = ลองใหม่ | §5.6 ข้อ 5 ต้องแยกสองกรณีนี้ |
| D-A10 | CAL1.4 | ผู้ใช้กด "เลื่อน" ตอนถึงเวลาแล้วแต่ job ยังไม่ยิง | ครั้งปกติถูกรวมเข้ากับการเลื่อน (ส่งครั้งเดียวตอนถึงเวลาเลื่อน แล้วย้ำ 30 นาทีตามปกติ) | ผู้ใช้เลือกเลื่อนเอง · `nextFire` นับเฉพาะ `o > now` (§5.2) |
| D-A11 | CAL1.4 | commit ได้ 0 แถว (ผู้ใช้แก้ระหว่างจอง) | ไม่ส่ง + ปล่อย lease ทันที (`where {id, leaseToken}` · ฟิลด์ของ job ล้วน) แทนรอ lease หมด 2 นาที | การเลื่อน/แก้ที่ทำให้ต้องยิงในนาทีถัดไปไม่ช้าเกินจำเป็น |
| D-A12 | CAL1.4 | logOps ของ job | `{ tenantId, detail: "itemId=<id>…" }` (logOps ไม่มีช่อง itemId) · ไม่มี title/note | §2.6 |
| D-A13 | CAL1.4 | `runCalendarFire(now, { deadline, deps })` | `deps = { post?, scope?: {userIds?, itemIds?}, afterClaim? }` — `scope`/`afterClaim` ใช้ใน QC เท่านั้น (job จริงส่งแค่ deadline) | ฐาน QC มีแถว seed ปน · ต้องจำลอง "ผู้ใช้แก้ระหว่างจอง" |
| D-A14 | CAL1.4 | หน้า integrations (`JobsList.tsx`) | ไม่ได้แก้ — หน้า CRM เรียก `getMinuteJobStatus()` (ไม่ส่งชื่อ = ทุกงานที่ลงทะเบียน) จึงเห็น `calendar.fire` เองเมื่อ jobs.ts ถูก import ในโพรเซสนั้น | ไม่ต้องแตะ UI ของ CRM |

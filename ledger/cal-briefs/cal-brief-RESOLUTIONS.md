# CAL0.1 · RESOLUTIONS — สำรวจโค้ดจริงก่อนเขียนปฏิทินเลขา (อ่านอย่างเดียว)

> สำรวจ 14 พ.ย. 2569 · ทรี `/root/projects/shark-sec-ui` branch `wip/sec-calendar` (tip `73f4d0f00` · main `9d695e14f` เป็นบรรพบุรุษ)
> มติเจ้าของ M1–M4 ใน `ledger/SEC-CALENDAR-PLAN.md` §0 ยึดเหนือทุกข้อในไฟล์นี้ · เลขบรรทัด = ณ tip ข้างบน
> รหัสคำตัดสิน `R-CAL-*` ใช้อ้างในใบ CAL0.2 / CAL1.x / CAL2.x

---

## สรุปสั้น (อ่านก่อน)

| # | เรื่อง | ผล |
|---|---|---|
| 1 | ราง minute-jobs | ✅ เดินบน prod จริง — crontab `* * * * *` จากทรี `/root/projects/shark-in-th` (main) · log ล่าสุด 13:39Z ทุกนาที · DB = `ep-royal-night` (production) · 26 งาน ล้ม 0 · R-K8 "ไม่มีรายนาที" **ล้าสมัยจริง** (R-CAL-1) |
| 2 | โมดูล `calendar` | ⚠️ **มีอยู่แล้ว** — `src/lib/modules/calendar/{service,actions}.ts` (ปฏิทินกลางของร้าน WO-0057 · หน้า `/app/calendar` · คีย์ `calendar.event.read`) + `"calendar"` อยู่ใน `AI_MODULES` แล้ว (R-CAL-2) |
| 3 | เจ้าของนัด booking | ⚠️ `Appointment` **ไม่มี userId** — ต่อผ่าน `staffId → BookingStaff.employeeId → HrEmployee.linkedUserId` (มีตัวช่วย `myStaffIds`) · ร้านไม่มีระบบ HR = พนักงานไม่มี "นัดของฉัน" (R-CAL-5) |
| 4 | push หลายกิจการ | ⚠️ `PushDevice.expoToken @unique` + `tenantId` เดียว ⇒ กรอง `tenantId` = กิจการที่ไม่ active ไม่ได้รับ · ต้องส่งแบบเลขา (ไม่กรองร้าน + `data.tenantId`) (R-CAL-12) |
| 5 | `categoryId` | ❌ `push.ts` ยังไม่รองรับ — ต้องเพิ่มแบบเดียวกับ `badge` (R-CAL-13) |
| 6 | APNs | ⚠️ ยังพิสูจน์จากที่นี่ไม่ได้ (ถูกปฏิเสธสิทธิ์ยิง Expo GraphQL แบบอ่าน) · หลักฐาน: 29 ส.ค. เคย `InvalidCredentials` แล้วผูกกุญแจ `BMM6N65VX9` · ต้องตรวจ `pushKey` ของ bundle `th.in.shark.ai` ก่อน CAL3.2 (R-CAL-14) |
| 7 | การ์ดเตือนในห้อง | ไม่มีชนิดการ์ด "ผลเครื่องมือ" · ห้าม `recordAction` (บันทึกเลขา OWNER เห็นทุกแถว = รั่ว M4) (R-CAL-20) |
| 8 | ภาษี | ภ.พ.30 = 15 (ออนไลน์ 23) · ภ.ง.ด.1/3/53 = 7 วันหลังสิ้นเดือน (ออนไลน์ 15) · ปกส. = 15 · ช่วงขยายออนไลน์ถึงแบบที่ครบ 31 ม.ค. 2570 · ⚠️ โค้ดเตือนบัญชีเดิมใช้ ภ.พ.30 = วันที่ 10 (ขัดกฎหมาย) (§8) |
| 9 | Google | มี Google Sign-In native อยู่แล้ว (`@react-native-google-signin/google-signin` + webClientId) ⇒ ขอ scope ปฏิทิน + `serverAuthCode` ได้โดยไม่เพิ่ม `expo-auth-session` (R-CAL-17) |

---

## 1. แหล่งข้อมูล agenda — โมเดล/ฟิลด์จริง · "ของฉัน" · ตัวกรองสิทธิ์

### 1.0 ตัวกรองสิทธิ์ที่ใช้ซ้ำได้ (รายการกลาง)

| ตัวช่วย | ที่อยู่ | ใช้ทำอะไร |
|---|---|---|
| `evaluate(m, {module, action, unitId?})` | `src/lib/core/rbac.ts:32` | ตัวตัดสินกลาง OWNER=ทั้งหมด · MANAGER=เต็มในสาขาที่คุม · STAFF=ตามคีย์/`<module>.*` |
| `canAccessUnit` / `filterAccessibleUnitIds` | `src/lib/core/rbac.ts:22` / `:69` | ตัดสาขา |
| `canViewPayroll(m)` | `src/lib/core/rbac.ts:47` | OWNER หรือ `hr.payroll.read` (แคบกว่า evaluate โดยตั้งใจ — MANAGER ไม่ผ่าน) |
| `viewerScope(tenantId, m, userId)` → `DigestScope` | `src/lib/ai/secretary/digest.ts:67` | สาขาที่นับได้ต่อส่วน (pos/booking/shop) + crmViewer |
| `canReadSystem(m, system, userId)` | `digest.ts:279` | คีย์อ่านต่อระบบ: account=`account.doc.view` · crm=`crm.contact.read` · hr=`hr.leave.read` · booking/shop=มีสาขา |
| `viewerSees(m, userId, access, system)` | `digest.ts:302` | สิทธิ์ผู้ดู ∩ ระดับเลขาไม่ใช่ OFF |
| `part(tenantId, name, fn)` | `digest.ts:95` | try/catch ต่อส่วน + `logOps("WARN","ai",…)` — แบบที่ adapter ต้องลอก |
| `systemIdsOf(tenantId, type)` | `digest.ts:89` (ไม่ export) | ระบบ active ต่อชนิด — CAL1.3 เขียนตัวเองหรือ export |
| `membershipCan(m, q, userId)` / `actorBranches(actor)` | `src/lib/ai/tool-access.ts:210` / `:330` | ตัวตัดสินที่เครื่องมือ AI ใช้ (ส่งต่อไปยังตัวตัดสินของโมดูล CRM/บัญชี/บอร์ด) |
| `membershipCanAccount(m, action)` | `src/lib/modules/account/api/actor.ts:66` | คีย์บัญชี (รวมตาราง IMPLIES: `doc.create` ⇒ `doc.view`) |
| `activityWhere(ctx, actor)` / `contactWhere` | `src/lib/modules/crm/where.ts:33` / `:23` (export ผ่าน `crm/index.ts:50`) | ขอบเขตแถว CRM v2 (OWN/TEAM/ALL) · async |
| `toMemberActor(userId, membership)` | `src/lib/modules/member/access.ts:86` | actor ที่ CRM ต้องการ |
| `visibleBoardsWhere(actor)` / `canReadKanban` | `src/lib/modules/kanban/access.ts:123` / `:59` | บอร์ดที่มองเห็น |
| `lineAccess(m, unitId)` | `src/lib/modules/booking/line-access.ts` (pure) | view/operate/runOwn/runAny ของจองคิว |
| `myStaffIds(ctx{tenantId,unitId}, userId)` | `src/lib/modules/booking/today-line.ts:99` | BookingStaff ของผู้ใช้ (ผ่าน `employeeOfUser`) |
| `employeeOfUser(tenantId, userId)` | `src/lib/modules/hr/service.ts:811` (export ผ่าน `@/lib/modules/hr`) | พนักงาน HR ที่ผูกผู้ใช้ |
| `dormAccess(m, unitId).board` | `src/lib/modules/dorm/access.ts:10` | `dorm.view` ต่อสาขา |

**ระดับเลขาต่อระบบ** (OFF/READ/DRAFT): ตาราง `AiSystemAccess(tenantId, module, level)` `prisma/schema/secretary.prisma:72-83` · อ่าน `getAccess(tenantId)` `src/lib/ai/secretary/access.ts:36` → `AccessMap` · ตัดสิน `levelVerdict(access, module, write)` `access-rules.ts:94` · ตัวย่อ `moduleOff(access, module)` `access-rules.ts:143` · ค่าเริ่มต้น DRAFT ยกเว้น `chat=READ` (`access-rules.ts:29-31`) · ชื่อโมดูล `AI_MODULES` `access-rules.ts:16-20` (มี `booking crm account kanban hr dorm ticket calendar` ครบ)

### 1.1 บัตรคิว/นัดหมาย (booking)

- โมเดล `Appointment` `prisma/schema/booking.prisma:95` — `tenantId · unitId · staffId (→BookingStaff) · serviceId · startAt · endAt (รวม buffer) · status AppointmentStatus · customerName · customerPhone · kind · checkedInAt/startedAt/doneAt …` · **ไม่มี systemId** (unit-scoped · ใช้ `tenantDb({tenantId, unitId})`)
- `AppointmentStatus` `booking.prisma` enum: `PENDING CONFIRMED ARRIVED DONE NO_SHOW CANCELLED QUEUED IN_SERVICE LATE`
- `BookingStaff` `booking.prisma:46` — `unitId · name · employeeId? (soft link → HrEmployee.id) · active` · **ไม่มี userId**
- "ของฉัน" = `staffId ∈ myStaffIds({tenantId, unitId}, userId)` (`today-line.ts:99` → `employeeOfUser` → `HrEmployee.linkedUserId` `hr.prisma:74`)
- "ทั้งสาขาที่ฉันจัดการ" → ดู R-CAL-5
- อ้างอิงที่มีแล้ว: `tomorrowPart` `digest.ts:202` · `upcomingSchedule` `src/lib/ai/tools.ts:2165` · `getCalendarEvents` `modules/calendar/service.ts:59`
- deep link: เว็บ `/app/u/<unitSlug>/booking/day?date=YYYY-MM-DD` (ผู้จัดการ) · `/app/u/<unitSlug>/booking/mine` (ช่าง) — ต้องรู้ `BusinessUnit.slug` (`core.prisma:92`)

### 1.2 CRM กิจกรรม

- โมเดล `CrmActivity` `prisma/schema/crm.prisma:332` — `tenantId · systemId · contactId? · dealId? · companyId? · type CrmActivityType · title · dueAt? · doneAt? (null=ค้าง) · ownerUserId? · startAt? · endAt? · remindAt? · attendees Json? {userIds[],contactIds[]} · completedById? · kanbanCardId? · priority`
- index ที่ใช้ได้: `@@index([systemId, ownerUserId, startAt])` · `@@index([systemId, dueAt, doneAt])`
- "ของฉัน" = `ownerUserId = userId` (ตรงกับตัวเตือนเดิม `crm/reminders.ts:15` "ผู้รับ = ownerUserId คนเดียว")
- **ใช้ซ้ำ** `crm.activities.calendar(ctx, actor, {from, to, mine: true})` `src/lib/modules/crm/activities.ts:992` — ได้ `activityWhere` + ช่วง `(startAt ?? dueAt)` + `mine` ในตัว (เพดานช่วง `CALENDAR_MAX_SPAN_DAYS`)
- ติ๊กเสร็จ = `completeActivity(ctx, actor, id)` `activities.ts:735`
- ระบบ CRM `uiVersion = 1` ข้าม (กติกาเดียวกับ `reminders.ts:120` `parseCrmSettings(sys.settings).uiVersion !== 2`)
- deep link แอป native: `/crm/tasks?systemId=<sid>&taskId=<id>` (ตัวแปลง `apps/mobile/src/lib/crm-link.ts:20` รับ `/app/sys/<sid>/crm/activities?r=<id>`)

### 1.3 บอร์ดงาน (kanban)

- โมเดล `KanbanCard` `prisma/schema/kanban.prisma:127` — `tenantId · systemId · boardId · columnId · title · assigneeUserId? · dueAt? (UTC) l.139 · status KanbanEntityStatus (ACTIVE/ARCHIVED) · archivedAt? · startAt? · completedAt? (ตั้งเมื่อย้ายเข้าคอลัมน์เสร็จ) · reminderMinutesBefore? · reminderSentAt?`
- ผู้รับผิดชอบหลายคน: `KanbanCardAssignee` `kanban.prisma:249` (`assigneeUserId` = คนแรกของลิสต์ เขียนคู่กัน)
- "ของฉัน" = `assigneeUserId = me` ∪ `KanbanCardAssignee.userId = me` (นิยามเดียวกับ `myTasksOverview` `src/lib/modules/kanban/my-tasks.ts:49`) ∩ บอร์ด `visibleBoardsWhere(actor)` ∩ `status ACTIVE`
- **"ติ๊กเสร็จ" บนบอร์ด** = ย้ายเข้าคอลัมน์ `KanbanColumn.isDoneColumn = true` (`kanban.prisma:116`) ผ่าน `completeCard(ctx, cardId)` `my-tasks.ts:161` → `moveCard` (`moves.ts:221`) ⇒ ได้ `completedAt` + กิจกรรม + undo token 5 นาที · ต้องมีบทบาท EDITOR ของบอร์ด · บอร์ดไม่มีคอลัมน์เสร็จ = `{ok:false, code:"NO_DONE_COLUMN"}` (ไม่ย้าย) · done ในปฏิทิน = `completedAt !== null`
- ทางเดียวกันใน REST/AI: op `cards.complete` → tool `kanban_complete_card` (`src/lib/modules/kanban/api/ops/cards.ts`)
- deep link เว็บ: `/app/sys/<sid>/kanban/b/<boardId>?card=<cardId>` (รูปเดียวกับ `kanban/notify.ts:22`)
- เตือนเดิม: `sweepDueSoonReminders` `src/lib/modules/kanban/reminders.ts:55` (เกาะ `/api/cron/hourly`)

### 1.4 บัญชี — ใบแจ้งหนี้ครบกำหนด/เกินกำหนด

- โมเดล `AccountDocument` `prisma/schema/account.prisma:128` — `systemId · docType AccountDocType · docNo? · status AccountDocStatus · direction (IN/OUT/INTERNAL) · issueDate · dueDate? l.137 · contactId? · grandTotal · paidTotal · voidedAt? · createdById? · salesUserId?` · index `@@index([systemId, docType, dueDate])`
- นิยาม "ค้าง" ใช้ของ digest (`digest.ts:127-152`): `direction OUT · status ∈ {AWAITING_PAYMENT, PARTIAL} · voidedAt null · docType ≠ BILLING_NOTE · grandTotal − paidTotal > 0` · เกินกำหนด = `dueDate < bkkAt(now,0,0,0)`
- ผู้เห็น = `canReadSystem(m,"account")` = `account.doc.view` (เอกสารบัญชีไม่ผูกคน — ไม่มี "ของฉัน") → R-CAL-6 (รวมเป็นแถวสรุป)
- deep link เว็บ: รายการ `/app/sys/<sid>/account/documents` · ใบเดียว `/app/sys/<sid>/account/docs/<docType>/<docId>` (รูปเดียวกับ `account/service.ts:4510`)
- เตือนเดิม: `runAccountReminders` `src/lib/modules/account/service.ts:~7033` (DUE_TOMORROW/OVERDUE_TODAY/PP30_DUE → AppNotification ผู้มี `account.payment.record`)

### 1.5 HR — วันจ่ายเงินเดือน · ปกส. · ใบลาของฉัน

- `HrPayrollRun` `prisma/schema/payroll.prisma:72` (แผนเขียน `HrPayRun` — **ชื่อจริง `HrPayrollRun`**) — `systemId · periodKey "YYYY-MM" · payDate l.77 · status PayrollRunStatus (DRAFT/APPROVED/PAID/REVERSED) · totalSso*` · `@@unique([systemId, periodKey])`
- ⚠️ ไม่มี "วันจ่ายประจำ" ในค่าตั้ง — วันจ่ายมีเมื่อสร้างรอบแล้วเท่านั้น (ตรวจ HR V2 `shark-hr-c` `session/hr` แล้ว ฟิลด์เดิม)
- ผู้เห็นวันจ่าย/ปกส. = `canViewPayroll(m)` (`rbac.ts:47` · OWNER หรือ `hr.payroll.read`)
- `HrLeave` `prisma/schema/hr.prisma:~157` — `systemId · employeeId · type HrLeaveType · fromDate/toDate @db.Date · status HrLeaveStatus` · "ใบลาของฉัน" = `employeeId = employeeOfUser(tenantId, userId).employeeId` (system-scoped: `tenantDb({tenantId, systemId})`) · **ไม่ต้องมี `hr.leave.read`** (ของตัวเอง) · ใบลาของคนอื่น = ไม่แสดงในปฏิทินส่วนตัว (R-CAL-7)
- deep link เว็บ: `/app/sys/<sid>/hr/payroll` · `/app/sys/<sid>/hr/leave`

### 1.6 หอพัก — บิลครบกำหนด

- `DormBillRun` `prisma/schema/dorm.prisma:160` — `unitId · periodKey · status "DRAFT|REVIEW|SENT|CLOSED" · dueDate? @db.Date l.167 · totalSatang` · `DormBill` `dorm.prisma:186` — `runId · leaseId · roomId · status "DRAFT|HELD|SENT|PARTIALLY_PAID|PAID|VOID" · totalSatang · dueDate? l.205 · paidAt?`
- unit-scoped · ผู้เห็น = `dormAccess(m, unitId).board` (`dorm.view`) · รวมเป็นแถวสรุปต่อรอบ (R-CAL-6)
- deep link เว็บ: `/app/u/<unitSlug>/dorm/billing`

### 1.7 ตั๋ว/ทริป

- บนทรีนี้มีแค่ `TicketEvent` `prisma/schema/ticket.prisma:27` (อีเวนต์ขายบัตรรุ่นเดิม · `unitId · name · startAt · endAt? · status DRAFT/PUBLISHED/ENDED/CANCELLED`) — **ไม่ใช่ TRIPS**
- ระบบ TRIPS (`TripDeparture.startsAt/endsAt/status/unitId` ใน `prisma/schema/trips.prisma`) อยู่ที่ `/root/projects/shark-trips` branch `session/trips` (⏸ พักโดยเจ้าของ · 17/72) — **ไม่อยู่บน main และไม่อยู่บนทรีนี้** ⇒ adapter TRIPS ปิด (R-CAL-8)

### 1.8 ของตัวเอง + Google (ใหม่ — CAL1.1)

- ไม่มีโมเดล `Cal*` / `*Reminder` ใน `prisma/schema/` เลย ⇒ ชื่อ `CalItem CalPref CalLink CalExternalEvent` ว่าง ใช้ได้
- ⚠️ ชนิด TS `CalEvent`/`CalEventKind` มีแล้วใน `modules/calendar/service.ts:13-24` (ไม่ชนชื่อ Prisma แต่ชวนสับสน) → R-CAL-2

---

## 2. ราง minute-jobs

- API `src/lib/platform/minute-jobs.ts`: `registerMinuteJob({name, everyMinutes, run(now, budgetMs, {signal, deadline}), cadence?, vpsOnly?, ownBudgetMs?, quietCutOff?})` `:125` · `runMinuteJobs(now, {cadence?, entry?})` `:882` · `getMinuteJobStatus(names?)` `:1038` → `{name, everyMinutes, lastRunAt, lastOkAt, lastError}` · งบรวม `MINUTE_JOB_BUDGET_MS = 20_000` · lease 15 นาที · ถึงรอบแบบหน้าต่างนับจากเที่ยงคืนไทย · ชื่อซ้ำ = แทนที่ (นอก dev ห้ามเปลี่ยน everyMinutes/cadence)
- ทุกงานต้อง idempotent + เริ่มใหม่ได้ทุกบรรทัด (หัวไฟล์ `:20-23`)
- ที่ลงทะเบียน: ในไฟล์ราง (`secretary.roomJobs` `:151` · งาน CRM/booking/dorm ฯลฯ) และไฟล์ "ลงทะเบียนตอน import": `src/lib/ai/secretary/room-jobs-job.ts` (→ `worker.ts:445-458`) · `src/lib/modules/chat/sla-job.ts:13`
- ทางเข้า: `scripts/crm-cron.mts` — `await import(...)` ของไฟล์งาน `:72-84` · route `src/app/api/cron/outbox/route.ts:5-7` (import ไฟล์งาน + `runMinuteJobs` หลังระบายคิว · ไม่มีตัวตั้งเวลาชี้มา)
- **crontab (อ่านแล้ว)**: `* * * * * cd /root/projects/shark-in-th && flock -n /tmp/shark-crm-minute.cron.lock pnpm exec tsx scripts/crm-cron.mts minute >> /var/log/shark-crm-cron.log` + hourly `7 * * * *` + daily `40 20 * * *`
- **log (tail อ่านอย่างเดียว)**: รอบทุกนาทีถึง `2026-11-14T13:39:03Z` · `DB ep-royal-night-aoidednc-pooler…` (= production ตาม `reference_neon_shark`) · "งาน 26 · สำเร็จ 8–22 · ล้ม 0 · งบหมด 0" · ใช้เวลา 3–7 วิ
- ทรีที่ cron รัน = `/root/projects/shark-in-th` branch `main` `9d695e14f`

**R-CAL-1 (ยืนยัน)** R-K8 (`docs/modules/31-secretary.md:64` และ `:851` "ไม่มี cron รายนาที") **ล้าสมัยแล้ว** — รางรายนาทีบน VPS เดินบน prod · ถูกต้องตามแผน · CAL0.2 ต้องแก้ 2 บรรทัดนั้นในเอกสารสัญญาเลขาให้ชี้ราง minute-jobs
- เงื่อนไขทำงานจริง (ใส่ใน CAL1.4/1.5/1.8): ไฟล์งานใหม่ `src/lib/modules/calendar/jobs.ts` (ลงทะเบียนตอน import แบบ `sla-job.ts`) + เพิ่ม `await import("@/lib/modules/calendar/jobs")` ใน `scripts/crm-cron.mts` (ต่อจาก `:84`) + `import` ใน `api/cron/outbox/route.ts` · ⚠️ มีผลบน prod **เมื่อ main ถูกดึงลงทรี `/root/projects/shark-in-th` + `prisma generate`** (ไม่ใช่แค่ deploy Vercel) → ใส่ในเช็กลิสต์ CAL3.3
- `calendar.google` ทุก 15 นาที = `everyMinutes: 15` ราง minute (ไม่ใช่ hourly)
- `calendar.fire` ควรมี `ownBudgetMs` (เช่น 5 วิ) แบบ `secretary.roomJobs` เพื่อไม่ตก no-budget เมื่องานอื่นช้า · สุขภาพ: `getMinuteJobStatus(["calendar.fire","calendar.brief","calendar.google"])` ในหน้า JobsList (`src/components/crm/integrations/JobsList.tsx`)

---

## 3. Push

**เซิร์ฟเวอร์** `src/lib/core/push.ts` (462 บรรทัด)
- `PushMsg = {title, body, data?, badge?}` `:14` · payload Expo ต่อเครื่อง `{to, title, body, data, sound:"default", badge?}` `deliverBatch :51-90` · นับสำเร็จเฉพาะ `status:"ok"` · `DeviceNotRegistered` = ลบแถว · error อื่น → `logOps("ERROR","push")`
- ทางส่ง: `sendPushToUser(userId, msg, {tenantId?, post?})` `:157` · `sendPushToUsers` `:223` (tenantId บังคับ) · `sendPushToTenant` `:106`
- ฉีด transport ทดสอบได้: `opts.post` (รับ array / `{tickets}` / `{data}`)
- **ไม่มี** `categoryId` / `categoryIdentifier` · **ไม่มี** quiet hours ใน push.ts (quiet hours มีเฉพาะฝั่งลูกค้า `core/quiet-hours.ts` `inQuietWindow :58` ที่ `platform/notify-customer.ts`, `booking-notify.ts`, `dorm-line.ts`)
- `PushDevice` `prisma/schema/mobile.prisma:3` — `userId · tenantId? (กิจการ active ตอนลงทะเบียน) · expoToken @unique · platform` · ลงทะเบียน `POST /api/mobile/push/register` `src/app/api/mobile/push/register/route.ts:19-22` (upsert ตาม token ⇒ **1 เครื่อง = 1 tenantId**)
- แบบอย่างเลขา: `src/lib/ai/secretary/notify.ts:7,222,264` — push ห้อง/ช่วยเหลือ = `sendPushToUser(userId)` **ไม่กรองร้าน** (R-K20) + `badge = badgeTotalFor(userId, tenantId)`

**แอป** `apps/mobile`
- `expo-notifications ~57.0.8` (`package.json:20` · plugin `app.json:48`) · ลงทะเบียน `src/lib/push-register.ts:19` (`getExpoPushTokenAsync({projectId})`)
- แตะแจ้งเตือน: `app/(app)/_layout.tsx:165` → `handleSecretaryPush` (`push-register.ts:127`) อ่าน `data.link` + `data.tenantId` → `switchTenant` ถ้าต่างกิจการ → `router.push` · ลิงก์ที่รับ = `SEC_LINKS` `push-register.ts:75-81` (ยังไม่มี calendar) · ถัดไป `conversationId` → `/chat` · CRM `crmRouteFromLink`
- ไม่มี `setNotificationCategoryAsync` ที่ไหนเลย · ไม่มี `expo-task-manager` (ตอบปุ่มลัดตอนแอปถูกปิดโดยไม่เปิดแอป = ต้องเพิ่มแพ็กเกจ native = build ใหม่)
- badge แอป: `syncAppBadge(fetchAppBadge)` `push-register.ts:160` ← `GET secretary/badge`

**APNs / bundle**
- `app.json`: `name "SHARK HUB"` · `slug shark-th` · `ios.bundleIdentifier th.in.shark.ai` · `android.package th.in.shark.ai` · `owner shark-in-ths-team` · `extra.eas.projectId 06c3edc8-…` · `buildNumber 25` · `runtimeVersion policy appVersion` + `expo-updates` (OTA ได้)
- `eas.json`: `production.ios.credentialsSource: "local"` (ใบรับรอง/provisioning เก็บเครื่อง) — **กุญแจ push (APNs) ไม่ได้อยู่ในไฟล์นี้** ต้องผูกที่ Expo ต่อ bundle
- หลักฐาน: คอมเมนต์ `push.ts:38-43` (`InvalidCredentials — Could not find APNs credentials for th.in.shark.ai` 29 ส.ค.) · `ledger/PLAN-CHAT-PLATFORM.md:618-624` (ใช้กุญแจ `BMM6N65VX9` Team-scoped · Apple จำกัด 2 ใบ/ทีม ใช้ครบ · "push ถึง iPhone แล้ว (เจ้าของยืนยัน)") · ความจำ `reference_expo_apns_per_bundle` (กุญแจผูก "ต่อ bundle" · ตรวจด้วย GraphQL `iosAppCredentials{appleAppIdentifier{bundleIdentifier} pushKey{keyIdentifier}}`)
- **R-CAL-14** ยังยืนยันจากที่นี่ไม่ได้ (การยิง GraphQL อ่านอย่างเดียวถูกปฏิเสธสิทธิ์ในรอบนี้) ⇒ ก่อน CAL3.2: ผู้คุมงาน/เจ้าของรัน query ข้างบน (โปรเจกต์ `06c3edc8-…` · token ของ SHARK เท่านั้น ห้ามใช้ของ siamdive) ต้องเห็น `th.in.shark.ai` มี `pushKey` ไม่ใช่ null · ทางรอง (อ่านอย่างเดียว): `OpsEvent` source `push` ย้อนหลัง 30 วัน ไม่มี `InvalidCredentials` · positive control ใน CAL3.2 ยังบังคับ

---

## 4. กล่องความลับ + Google OAuth

- `src/lib/core/integrations/secret-box.ts`: `sealIntegrationSecret(obj, aad?) → "iv.tag.cipher"` (AES-256-GCM · ไม่มีกุญแจ = **โยน** `NOT_CONFIGURED`) · `openIntegrationSecret(box, aad?) → obj | null` (ไม่โยน) · `integrationSecretKeyConfigured()` · env `INTEGRATIONS_CREDENTIALS_KEY` (≥32 ตัว · มีใน `.env.example:64`)
- **R-CAL-16** `CalLink.tokenBox` = `sealIntegrationSecret({refreshToken, accessToken?, expiresAt?}, aad = \`cal:${userId}:${linkId}\`)` — ผูกกล่องกับเจ้าของ+แถว (ย้ายแถว = เปิดไม่ได้) · ก่อนเชื่อม ตรวจ `integrationSecretKeyConfigured()` ไม่มี = ตอบไทย "ระบบยังไม่พร้อมเชื่อม Google" (ไม่โยน 500)
- Google ที่มีแล้ว (ชื่อตัวแปรเท่านั้น): `GOOGLE_WEB_CLIENT_ID` · `GOOGLE_WEB_CLIENT_SECRET` · `GOOGLE_IOS_CLIENT_ID` — ใช้ใน `src/app/api/auth/google/{start,callback}/route.ts` (เว็บ · scope `openid email profile`) และ `src/app/api/mobile/auth/google/route.ts` (ตรวจ idToken · aud = web/iOS client) · ไม่มีใน `.env.example`
- แอปมี `@react-native-google-signin/google-signin ^16.1.2` (`apps/mobile/app/login.tsx:8,27-29` · `iosClientId` + `webClientId` ของโปรเจกต์ Google `732040229931`) + plugin `app.json:59-61`
- **R-CAL-17** CAL2.10 ใช้ `GoogleSignin` ที่มีอยู่ (`configure({webClientId, offlineAccess: true, scopes:[calendar.events, calendar.calendarlist.readonly]})` หรือ `addScopes`) → ได้ `serverAuthCode` → CAL1.8 แลกฝั่งเซิร์ฟเวอร์ด้วย `GOOGLE_WEB_CLIENT_ID/SECRET` · **ไม่เพิ่ม `expo-auth-session`** (ลด native module · อาจส่งผ่าน OTA ได้ ถ้า build ปัจจุบันมี google-signin รุ่นที่รองรับ — ยืนยันใน CAL2.10) · client/consent screen เดียวกับการล็อกอิน ⇒ การยื่นตรวจ Google (scope sensitive) ผูกโปรเจกต์ `732040229931`

---

## 5. Deep link

- WebView หน้าระบบ: `apps/mobile/app/(app)/index.tsx:28` `OPEN_PATH_RE = /^\/app(\/[A-Za-z0-9_\-%/]*)?(\?[A-Za-z0-9_=&\-%]*)?$/` · เปิดด้วย `router.navigate("/", {open: <href>, t: <nonce>})` (`index.tsx:98` ตรวจ regex) · ชีตกิจการ `src/components/secretary/BusinessSwitcherSheet.tsx:9` ใช้ทางเดียวกัน
- รายการระบบ: `GET /api/mobile/secretary/systems` (`src/app/api/mobile/secretary/systems/route.ts` → `navSystems()` `src/lib/core/nav-systems.ts:24`) · href ขึ้นต้น `/app` เสมอ: หน่วย `/app/u/<slug>` · ระบบ `/app/sys/<id>` · fixed
- ตัวแปลง entity เดิม `entityRoute` `apps/mobile/src/api/secretary.ts:653` (regex เข้มกว่า OPEN_PATH_RE: ไม่รับ `%`)
- สีระบบ: `apps/mobile/src/components/secretary/sys.ts` `sysColor(module)` (คีย์ = ชื่อโมดูลเลขา)

**R-CAL-9 รูป `AgendaItem.deepLink`** = `{ kind: "web", path: "/app/…" } | { kind: "app", path: "/crm/tasks?…" | "/secretary/calendar?…" }` · เซิร์ฟเวอร์สร้าง · แอปตรวจ `web` ด้วย OPEN_PATH_RE ก่อนเปิด (ไม่ผ่าน = ไม่เปิด) · ห้ามมีอักขระนอก regex (ใช้ `YYYY-MM-DD`)

| source | deepLink |
|---|---|
| booking (ช่าง) | web `/app/u/<unitSlug>/booking/mine` |
| booking (ผู้จัดการ) | web `/app/u/<unitSlug>/booking/day?date=YYYY-MM-DD` |
| crm | app `/crm/tasks?systemId=<sid>&taskId=<id>` |
| kanban | web `/app/sys/<sid>/kanban/b/<boardId>?card=<cardId>` |
| account (แถวสรุป) | web `/app/sys/<sid>/account/documents` |
| tax | web `/app/sys/<accSid>/account/reports/pp30` (ภ.พ.30) · `/app/sys/<accSid>/account/wht` (ภ.ง.ด.3/53) · `/app/sys/<hrSid>/hr/payroll` (ภ.ง.ด.1/ปกส.) |
| hr payroll | web `/app/sys/<sid>/hr/payroll` |
| hr leave (ของฉัน) | web `/app/sys/<sid>/hr/leave` |
| dorm | web `/app/u/<unitSlug>/dorm/billing` |
| ticket (TicketEvent) | web `/app/u/<unitSlug>/ticket` |
| ของตัวเอง (CalItem) | app `/secretary/calendar?day=YYYY-MM-DD&item=<id>` · ถ้าผูก linkType → deepLink ของสิ่งที่ผูก |
| google | ไม่มี (`null` · แตะ = เปิดรายละเอียดในแอป) |

- push ของปฏิทิน: `data = { type:"cal", link:"/secretary/calendar?day=…&item=…", tenantId, itemId }` และเพิ่มแถว `SEC_LINKS` (`push-register.ts:75`) รับ `^/secretary/calendar$` + query `day`/`item` (R-CAL-12)

---

## 6. เครื่องมือเลขา AI

- ทะเบียน: `src/lib/ai/tools.ts` `type AiTool {def, action?, execute}` `:72` · `ToolCtx {tenantId, actor, conversationId?, systemId?, access?, sight?}` `:48` · รายชื่อ `toolRegistry()` `:2643` · `runTool` `:2737` (ตรวจ `toolVerdict` ทุกครั้ง)
- สิทธิ์: `src/lib/ai/tool-access.ts` — `HAND_TOOL_ACCESS` `:69` (เครื่องมือเขียนมือ · `needs` / `writesNow` / `branchScoped` …) · `HAND_TOOL_MODULE` `:148` (เครื่องมือ → โมดูลสำหรับระดับเลขา) · `HAND_TOOL_CORE` `:169` (แกนกลาง ไม่ถูกระดับตัด) · ชื่อที่ไม่อยู่ในทะเบียนใดเลย = ปฏิเสธ (`__unmapped__`) · ข้อสอบ B-0 ตรวจความครบ (`access-rules.ts` หัวไฟล์)
- สกิล: `src/lib/ai/skills.ts` `CORE_TOOLS` `:41` (ยื่นทุกคำขอ) · `SKILLS` `:52` (โหลดด้วย `load_skill`) — `upcoming_schedule` อยู่สกิล booking `:142` · `schedule_task` อยู่สกิล automation `:277`
- ข้อเสนอ/อนุมัติ: เครื่องมือ `action: true` → `AiProposal` → การ์ดอนุมัติ (`ApprovalCard`) · `HAND_ACTION_KIND` `tool-access.ts:~108` · kind/ชั้นเสี่ยง `ai/secretary/kind-class.ts` · ด่านร้าน `ai/secretary/approval-gate.ts`
- การ์ดในห้องเลขา (แอป `apps/mobile/src/components/secretary/RoomView.tsx:402-460`): ฟองข้อความ (user/assistant/system/member) · `StepList` (แผน) · `ApprovalCard` (ข้อเสนอ) · `DoneCard` (`AiActionLog` ของห้อง) — **ไม่มีการ์ด "ผลเครื่องมือ" ทั่วไป** และ `AiMessage` ไม่มีช่อง meta (`ai.prisma:23` มีแค่ `content` + `attachments Json?`)
- persona: `src/lib/ai/persona.ts` `buildSystemPrompt` `:70` (บรรทัด `schedule_task` `:138`) · บล็อกตัวตนเลขา `src/lib/ai/secretary/identity.ts:138` `secretaryPromptBlock` · ข้อสอบเลือกเครื่องมือ `src/lib/ai/eval.ts` (`GOLDEN_CASES`) + `scripts/qc-ai-eval.mts`
- เครื่องมือปฏิทินเดิม: `upcoming_schedule` (`tools.ts:2165` · ต้อง `calendar.event.read` · `tool-access.ts:95`) = ปฏิทินของร้าน ไม่ใช่ส่วนตัว
- บอร์ดงานสำหรับข้อเสนอแทน M3: `kanban_create_card` (สร้างการ์ด · ข้อเสนอ) · `kanban_assign_card` · `kanban_inbox_add` (`modules/kanban/api/ops/*.ts`)

**R-CAL-18 ตำแหน่ง/ด่านของ `calendar_*`**
- เขียนมือใน `src/lib/ai/tools.ts` (หรือไฟล์ใหม่ `src/lib/ai/tools-calendar.ts` แบบ `tools-kanban.ts`) · ลงทะเบียนใน `toolRegistry()`
- `HAND_TOOL_ACCESS`: `calendar_add/update/cancel` = `{ needs: [], writesNow: true }` (คีย์ API ใช้ไม่ได้ทุกใบ — ถูกต้อง: ข้อมูลส่วนตัว) · `calendar_list` = `{ needs: [] }` · `calendar_agenda` = `{ needs: [] }`
- ใส่ทั้ง 5 ตัวใน `HAND_TOOL_CORE` (ระดับเลขาของร้านไม่ตัด — ปฏิทินส่วนตัวไม่ใช่ข้อมูลร้าน · M3/M4) · `calendar_agenda` ตัดแหล่งของร้านในตัวด้วย `moduleOff(ctx.access, <module>)` + `skippedSectionNote` แบบ `upcoming_schedule` · ระดับ `"calendar"` ใน AI_MODULES คงความหมายเดิม = ปฏิทินกลางของร้าน (`upcoming_schedule`) — ดูคำถามเจ้าของ Q2
- ใส่ใน `CORE_TOOLS` (`skills.ts:41`) อย่างน้อย `calendar_add` + `calendar_agenda` (ใช้บ่อยทุกห้อง) หรือสกิลใหม่ `calendar` — เลือก CORE_TOOLS เพราะประโยค "เตือนฉัน…" ต้องไม่ต้องโหลดสกิลก่อน
- ผู้กระทำต้องเป็น `actor.kind === "member"` เท่านั้น (คีย์ API/งานภายใน = ปฏิเสธ) · ไม่มีพารามิเตอร์ userId/ผู้รับ — owner = `ctx.actor.userId` เสมอ
- ไม่ผ่านด่านอนุมัติของร้าน (ไม่ใช่ `action: true`) — เขียนทันทีแล้วแสดงการ์ดให้ "แก้ไข/ยกเลิก" (จอ 5)
- persona: เพิ่มกติกา "ขอเตือนคนอื่น → ปฏิเสธสุภาพตาม M3 + เสนอ `kanban_create_card`" และแยกจาก `schedule_task` ("เตือนฉัน/นัด" = `calendar_add` · "ให้เลขาทำงาน/สรุปทุกวัน" = `schedule_task`) — ใส่ใน eval ≥ 20 ข้อ (`eval.ts` GOLDEN_CASES)

**R-CAL-20 การ์ดเตือนในห้อง (จอ 5) — ห้ามใช้ `AiActionLog`**
- `recordAction` (`ai/secretary/actions.ts:158`) เขียน `AiActionLog` ซึ่ง `GET secretary/log` แสดง **"OWNER ทุกแถว"** (`src/app/api/mobile/secretary/log/route.ts:2`) ⇒ เจ้าของร้านเห็นเตือนส่วนตัวของพนักงาน = ขัด M4
- ทางที่เลือก: `CalItem` เพิ่ม `roomId String?` (+ `@@index([userId, roomId])`) เมื่อ `source = CHAT` · `GET secretary/rooms/[id]` แนบ `reminders: CalItem[]` **เฉพาะของผู้เรียก** (`userId = viewer`) · แอปวาด `ReminderCard` ในไทม์ไลน์ตามเวลา `createdAt` · สมาชิกห้องคนอื่นเห็นแค่ฟองข้อความของเลขา (ข้อความ "ตั้งเตือนให้แล้ว" ในห้องร่วมเป็นสิ่งที่ผู้ใช้พิมพ์เองในห้องร่วม — ระบุใน persona ให้ไม่ทวนรายละเอียดเกินจำเป็นในห้องที่มีสมาชิกหลายคน)

---

## 7. เวลา

- เซิร์ฟเวอร์ `src/lib/core/quiet-hours.ts`: `bkkParts(d) → {y, mo (0-based!), day, h, mi}` `:17` · `bkkAt(base, hour, minute=0, dayOffset=0)` `:23` · `bkkYmd(d) "YYYY-MM-DD"` `:29` · `bkkDayStart(d)` `:35` · `parseHM/isHM` · `inQuietWindow(now, from, to)` `:58` · `nextQuietEnd` · ไฟล์ไม่อ่านนาฬิกาเอง (`now` จากผู้เรียก) — ⚠️ `mo` เริ่ม 0 (กับดักสิ้นเดือนใน `nextFire`)
- แอป `apps/mobile/src/components/secretary/bkk.ts`: `hhmmBkk(iso)` · `dayBkk(ms) "YYYY-MM-DD"` · `dateBkk(iso) {date, month 1..12}` · `daysUntil` · `bahtText` — ไม่มี พ.ศ.
- พ.ศ. ในแอป: `shortDate(iso, lang)` `apps/mobile/src/api/secretary.ts:1450` ("14 ธ.ค. 2569") — ⚠️ ใช้ `getDate()/getFullYear()` ตามเขตเวลาเครื่อง (ไม่ปัก BKK) · **R-CAL-10** จอปฏิทินเขียนตัวช่วย พ.ศ. ใหม่ใน `bkk.ts` (เลื่อน +7 ชม. + `getUTC*` + 543 · ชื่อเดือนย่อ/เต็มไทย) ไม่ใช้ `shortDate`
- quiet hours: **R-CAL-11** ไม่ใช้กับ `calendar.fire`/`calendar.brief` — เวลาที่ผู้ใช้ตั้งเองคือความประสงค์ของผู้ใช้ (ไม่มีกติกา quiet hours ของ push พนักงานให้เคารพ) · บันทึกใน CAL0.2

---

## 8. กำหนดยื่นภาษี/ปกส. (แถวสร้างจากกติกา ไม่ใช่จากฐาน)

ที่มา: skill `shark-thai-law` — `SKILL.md:106` (ภ.พ.30) และตารางแรงงาน (ปกส.) · `references/common-vat-invoice.md:122` · `references/common-withholding-tax.md:66-69, 128` · `references/domain-labour-payroll.md:186, 219, 246`

| แบบ | กระดาษ | ออนไลน์ (e-filing) | ที่มา / ป้าย | ใครเห็น | เงื่อนไขแสดง |
|---|---|---|---|---|---|
| ภ.พ.30 | วันที่ 15 ของเดือนถัดไป (ม.83 · ยื่นแม้ไม่มีขาย) | วันที่ 23 — สำหรับแบบที่ต้องยื่น 1 ก.พ. 2567 – 31 ม.ค. 2570 (ประกาศ กค. ขยายเวลายื่นทางอินเทอร์เน็ต ฉ.7) | common-vat-invoice §18–19 `:122` [V] · หลัง 31 ม.ค. 2570 [U] | `account.tax.view` (หรือ OWNER) | `AccountSettings.vatRegistered = true` (`account.prisma:548`) |
| ภ.ง.ด.1 | 7 วันนับแต่สิ้นเดือนที่จ่าย | 15 วัน (ช่วงขยายเดียวกัน) | domain-labour-payroll `:219` · common-withholding-tax §8 [V] | `canViewPayroll` (OWNER/`hr.payroll.read`) | มีระบบ HR และมี `HrPayrollRun` ของงวดเดือนก่อน status ≠ DRAFT/REVERSED |
| ภ.ง.ด.3 / 53 | 7 วันนับแต่สิ้นเดือนที่จ่าย (ม.52) | 15 วัน (ช่วงขยายเดียวกัน) | common-withholding-tax §8 `:66-69` [V] | `account.wht.manage` หรือ `account.tax.view` | มีเอกสาร WHT (`docType WHT_CERT` direction IN) ในเดือนก่อน |
| ปกส. (สปส.1-10) | ภายในวันที่ 15 ของเดือนถัดจากเดือนที่หัก (ม.47 วรรคสอง) | ไม่มีข้อมูลขยายใน skill → ใช้วันที่ 15 | domain-labour-payroll `:186` [V2]/[V] | `canViewPayroll` | มีรอบเงินเดือนเดือนก่อนที่ `totalSsoEmployeeSatang > 0` |

- **R-CAL-15** ตารางนี้เป็นค่าคงที่แบบมีช่วงวันที่ (`validFrom/validTo`) ในไฟล์ pure `src/lib/modules/calendar/tax-deadlines.ts` · หลัง 31 ม.ค. 2570 ไม่มีประกาศต่ออายุ = กลับใช้วันตามกฎหมาย (กระดาษ) และแสดงคำว่า "ตรวจประกาศขยายเวลา" · แถวเป็น all-day `checkable: false` · ค่าเริ่ม: แสดง **วันออนไลน์** เป็นวันหลัก + บรรทัดรอง "ยื่นกระดาษภายในวันที่ X" (คำถามเจ้าของ Q4)
- วันหยุด/เสาร์-อาทิตย์เลื่อนกำหนดไหม — **skill ไม่มีข้อมูล [U]** ⇒ ไม่เลื่อนเอง · แสดงวันตามกฎ (ปลอดภัยกว่า = เร็วกว่า)
- ไม่ใช่คำปรึกษากฎหมาย — ข้อความในแอปใช้ "กำหนดยื่น (ตรวจสอบกับสรรพากร/ประกันสังคม)" ตาม SKILL.md
- ⚠️ **ขัดกับโค้ดเดิม** `src/lib/modules/account/service.ts:7023` `PP30_DUE_DAY = 10` (เตือนวันที่ 5 ว่า "ยื่นภายในวันที่ 10") — ผิดจาก skill (15/23) · นอกขอบเขต CAL (ไม่แก้ในงานนี้) → แจ้งเจ้าของ/RUN บัญชี (Q6)

---

## 9. ตัวนับ badge

- `GET /api/mobile/secretary/badges` `src/app/api/mobile/secretary/badges/route.ts` — `{approvals, customers, team:{invites, help, support}, total}` · `gate(req, null)` · 60/นาที ต่อสมาชิก · count ล้วน
- `GET /api/mobile/secretary/badge` (`…/badge/route.ts`) → `badgeTotalFor(userId, tenantId)` `src/lib/ai/secretary/notify.ts:137` = ตัวเลขบนไอคอนแอป
- **R-CAL-19** เพิ่มช่อง `calendar: number` ใน `badges` (ไม่เพิ่มเส้น `GET calendar/badge` แยก) = `todayOpenCount(viewer, tenantId, now)` · **ไม่รวมใน `total` และไม่รวมใน `badgeTotalFor`** (ไอคอนแอปจะค้างแดงทั้งวันด้วยงานที่ยังไม่ถึงเวลา — คำถามเจ้าของ Q3) · นิยาม = รายการวันนี้ (วันไทย) ที่ `checkable && !done` ของผู้ดู: `CalItem OPEN` ที่ `startAt` วันนี้ + การ์ดบอร์ดของฉัน `dueAt` วันนี้ `completedAt null` + กิจกรรม CRM ของฉัน `(startAt ?? dueAt)` วันนี้ `doneAt null` · ใช้ count query ตรง (ไม่เรียก `agendaFor` เต็ม) + แคชในหน่วยความจำ 60 วิ ต่อ (tenant,user) · แต่ละส่วนล้ม = 0 + logOps WARN
- แอป: `SecTopBar` (`apps/mobile/src/components/secretary/SecTopBar.tsx:26` `ZoneBadges`) เพิ่มคีย์ `calendar`

---

## 10. คำตัดสิน (ข้อขัดระหว่างแผนกับโค้ด) + เหตุผล

| รหัส | เรื่อง | คำตัดสิน | เหตุผล |
|---|---|---|---|
| R-CAL-1 | R-K8 ไม่มีรายนาที | ล้าสมัย — ใช้ราง minute-jobs (§2) | crontab + log prod ยืนยัน |
| R-CAL-2 | แผน §2.1 "โมดูลใหม่ `src/lib/modules/calendar/`" | โฟลเดอร์ **มีอยู่แล้ว** (ปฏิทินกลางของร้าน) ⇒ ใส่ของใหม่ในโฟลเดอร์เดิมเป็นไฟล์แยก: `items.ts · agenda.ts · jobs.ts · google.ts · conflicts.ts · tax-deadlines.ts · next-fire.ts` + `index.ts` (facade) · **ไม่แตะ** `service.ts/actions.ts` เดิม · ชนิดใหม่ชื่อ `AgendaItem` (ห้ามใช้ `CalEvent` ซ้ำ) | ชื่อโฟลเดอร์ชนกัน · หน้า `/app/calendar` + `upcoming_schedule` ยังใช้ของเดิม |
| R-CAL-3 | แผน §1 `HrPayRun?.payDate` | ชื่อจริง `HrPayrollRun.payDate` (`payroll.prisma:77`) | ตรวจ schema |
| R-CAL-4 | แผน §1 "ตั๋ว/ทริป `startAt` (ticket.prisma)" | `ticket.prisma` = `TicketEvent` (อีเวนต์ขายบัตรเดิม) ไม่ใช่ TRIPS · adapter `ticket` = TicketEvent `status PUBLISHED` `startAt` ในช่วง · สาขาที่ `canAccessUnit` · ผู้มี `ticket.event.*` หรือ MANAGER/OWNER (ไม่มีคีย์อ่าน — ใช้ประตูสาขาแบบ `ticket_event_sales` BRANCH) | ตรวจ schema |
| R-CAL-5 | booking "นัดที่ฉันรับ ∪ ทั้งสาขาที่ฉันจัดการ" | ต่อสาขา `unitId`: **ทั้งสาขา** เมื่อ `evaluate(m,{module:"booking", action, unitId})` ผ่านอย่างใดอย่างหนึ่งของ `booking.queue.operate · booking.job.runAny · booking.appointment.setStatus` (OWNER/MANAGER ที่คุมสาขาผ่านเสมอ) · **ของฉัน** = `staffId ∈ myStaffIds` · นอกนั้น = ไม่มีแถว · status ∉ {CANCELLED, NO_SHOW} · เพดาน 50 ต่อวันต่อสาขา + แถว "อีก N นัด" | `Appointment` ไม่มี userId · คีย์ชุดนี้คือ "จัดการนัดของคนอื่น" ใน `permissions.ts:222-247` / `line-access.ts` · พนักงานที่ไม่ผูก HR จะไม่เห็นนัดตัวเอง (ความเสี่ยง) |
| R-CAL-6 | บัญชี/หอพัก "ใบแจ้งหนี้/บิลครบกำหนด" | **แถวสรุป all-day** ไม่ใช่รายใบ: บัญชี = ต่อระบบต่อวันที่ครบ "ใบแจ้งหนี้ครบกำหนด N ใบ ฿X" + บนวันนี้ 1 แถว "เกินกำหนด N ใบ ฿Y" · หอพัก = ต่อ `DormBillRun` (status SENT) ที่ `dueDate` ในช่วง "ค่าห้อง <period> ครบกำหนด · ค้าง N ห้อง" · `checkable: false` | เอกสารไม่ผูกคน · ร้านมีหลายสิบ–ร้อยใบ = ปฏิทินพัง · ตรงจอ 3 (ป้ายระบบ) |
| R-CAL-7 | HR "ใบลาของฉัน" | เฉพาะใบลาของพนักงานที่ผูกผู้ใช้ (PENDING/APPROVED) · วันลาคนอื่น **ไม่แสดง** แม้มี `hr.leave.read` | ปฏิทินเป็นของตัวเอง (M3) · วันลาป่วย = ข้อมูลสุขภาพ (PDPA · `calendar/service.ts:133`) · ดูของทั้งร้านมีหน้า `/app/calendar` อยู่แล้ว |
| R-CAL-8 | ทริป TRIPS | adapter `trips` เขียนเป็นตัวว่างที่คืน `[]` + ธง `TRIPS_ADAPTER_ENABLED=false` (ค่าคงที่ในโค้ด ไม่ใช่ env) จน `TripDeparture` ขึ้น main | TRIPS อยู่ `session/trips` (พัก) |
| R-CAL-9 | deepLink | ตาราง §5 | — |
| R-CAL-10 | พ.ศ. ในแอป | ตัวช่วยใหม่ใน `bkk.ts` (ปัก BKK) | `shortDate` ใช้เขตเวลาเครื่อง |
| R-CAL-11 | quiet hours | ไม่ใช้กับปฏิทิน | §7 |
| R-CAL-12 | push หลายกิจการ (แผน CAL1.5 "2 กิจการ = 2 ข้อความ") | ส่งด้วย `sendPushToUser(userId, msg)` **ไม่ใส่ tenantId** (แบบ R-K20 ของเลขา) · `data = {type:"cal", link, tenantId, itemId}` · แอปใช้ `handleSecretaryPush` เดิม (switchTenant) + เพิ่ม SEC_LINKS · ข้อความสรุปเช้าใส่ชื่อกิจการในหัวเรื่อง | `PushDevice` 1 เครื่อง = 1 tenantId ⇒ กรองร้าน = กิจการที่ไม่ active เงียบหาย |
| R-CAL-13 | `categoryId` | เพิ่ม `categoryId?: string` ใน `PushMsg` (`push.ts:14`) และใส่ใน payload `deliverBatch` **เฉพาะเมื่อผู้เรียกส่ง** (payload เดิมทุกไบต์ไม่เปลี่ยน — กติกาเดียวกับ `badge` S1.23) · ชื่อฟิลด์ Expo push = `categoryId` · แอป `setNotificationCategoryAsync("SEC_CAL", …)` | ไม่มีใน push.ts วันนี้ |
| R-CAL-13b | CAL2.8 "ตัวรับคำตอบทำงานแม้แอปปิด" | ปุ่มแบบ `opensAppToForeground: true` ทำได้ด้วย `expo-notifications` ที่มีอยู่ (ส่งผ่าน OTA ได้) · แบบไม่เปิดแอปเลย ต้อง `expo-task-manager` (native) = รวมใน build เดียวตอนท้ายตามแผน §4 | ไม่มี `expo-task-manager` ใน `package.json` |
| R-CAL-14 | APNs | §3 — ตรวจ `pushKey` ก่อน CAL3.2 | ยิง GraphQL จากที่นี่ไม่ได้รับสิทธิ์ |
| R-CAL-15 | ภาษี | §8 | skill |
| R-CAL-16 | tokenBox | §4 | — |
| R-CAL-17 | `expo-auth-session` (CAL2.10) | ใช้ `@react-native-google-signin` ที่มีอยู่ + `serverAuthCode` | ไม่เพิ่ม native module · client เดิม |
| R-CAL-18 | เครื่องมือ AI | §6 | — |
| R-CAL-19 | badge | §9 | — |
| R-CAL-20 | การ์ดเตือนในห้อง | §6 — `CalItem.roomId` + แนบเฉพาะของผู้เรียก · ห้าม `recordAction` | log OWNER เห็นทุกแถว |
| R-CAL-21 | ระดับเลขา OFF ของระบบ (แผน CAL1.3 "OFF = ไม่แสดง") | คงตามแผนสำหรับ **แหล่งของร้าน** ในจอปฏิทิน/สรุปเช้า (กติกาเดียวกับ `viewerSees` ของ digest) · ของส่วนตัว (`CalItem`, Google) ไม่ถูกตัด | ตรงกับ digest · M4 |
| R-CAL-22 | กันเตือนซ้ำ (แผน CAL1.4) | ยืนยัน: `calendar.fire` push เฉพาะ `CalItem` · แต่ ⚠️ CRM มีสรุปรายวันต่อคนอยู่แล้ว (`crm/notify-senders.ts:166` `tasksTodayDigest` ที่ `notifications.digestHour`) ⇒ สรุปเช้าของปฏิทินจะซ้อนกับของ CRM — ค่าเริ่ม: คงทั้งคู่ (คนละช่องทาง: CRM = แจ้งเตือนในแอป AppNotification + push) และถามเจ้าของ Q5 | พบในโค้ด |
| R-CAL-23 | CalItem `linkId` "ต้องอ่านได้ด้วยสิทธิ์ผู้ใช้" (CAL1.2) | ตรวจตอนสร้าง/แก้ด้วยตัวกรองของแหล่งนั้น (`contactWhere`/`dealWhere` · `account.doc.view` · `visibleBoardsWhere`) · ตอนแสดงตรวจซ้ำ: อ่านไม่ได้แล้ว = แสดงชื่อเรื่องของเตือนเอง ไม่ใส่ deepLink | สิทธิ์เปลี่ยนได้ภายหลัง |
| R-CAL-24 | CRM ผู้เข้าร่วม (`attendees.userIds`) | รุ่นนี้นับเฉพาะ `ownerUserId` (ตามแผน) · ผู้เข้าร่วมเป็นงานถัดไป | `attendees` เป็น Json — query ยาก · ตัวเตือนเดิมแจ้งผู้เข้าร่วมอยู่แล้ว (`notify-senders.ts:11`) |

---

## 11. ความเสี่ยง (เพิ่มจากแผน §6)

1. **ช่างไม่ผูก HR = ไม่เห็นนัดตัวเอง** — `BookingStaff.employeeId` + `HrEmployee.linkedUserId` ต้องตั้งครบ (POS-RESUME เคยพบ "8 HR employees · 0 linked" บน prod) ⇒ จอปฏิทินแสดงคำแนะนำ "ผูกบัญชีกับพนักงาน" เมื่อร้านมีระบบจองแต่ผู้ใช้ไม่มี staff
2. **ตัวรัน cron อยู่คนละทรีกับ Vercel** — งานใหม่มีผลเมื่อ `/root/projects/shark-in-th` ดึง main + `prisma generate` (ไม่ใช่แค่ deploy) · ลืม = เตือนไม่ออกเงียบ ๆ ⇒ เช็กลิสต์ CAL3.3/3.4 + ดู `getMinuteJobStatus`
3. **push ไม่ถึง iOS** ถ้า `th.in.shark.ai` ไม่มี `pushKey` (R-CAL-14) · Apple จำกัดกุญแจ 2 ใบ/ทีม ใช้ครบ — ห้ามสร้างใหม่ (ลบเดิม = SiamDive พัง)
4. **ภาระ query** — `agendaFor` วิ่ง ~9 แหล่งต่อคำขอ · สรุปเช้าวนผู้ใช้ทุกคนที่ถึงเวลาในนาทีเดียวกัน (08:00 ค่าเริ่ม = ทุกคนพร้อมกัน) ⇒ `calendar.brief` ทำเป็นชุด (เช่น ≤ 50 คน/รอบ + ทำต่อรอบถัดไปภายในนาทีเดียวกันไม่ได้ ⇒ ยอมเลื่อน ≤ 1–2 นาที) · ตั้ง `ownBudgetMs` · ไม่ใช้ pool เกิน (บทเรียน Neon pool `push.ts` MAX_PUSH_USERS)
5. **HR V2 กำลังรัน** (`shark-hr-c` session/hr 80%) — `HrLeave/HrPayrollRun` อาจเปลี่ยนตอน merge · ตรวจซ้ำก่อน CAL1.3
6. **node_modules ร่วม** — `prisma generate` ของ CAL1.1 กระทบทรีอื่น (แผนมีแล้ว)
7. **ภาษีหลัง 31 ม.ค. 2570** — วันออนไลน์ไม่มีประกาศรองรับ [U] · ต้องค้นซ้ำ (skill บันทึกไว้)
8. **Google verification** — scope `calendar.events` = sensitive · consent screen เดียวกับล็อกอิน (โปรเจกต์ `732040229931`) ⇒ การยื่นตรวจกระทบหน้าจอยินยอมของการล็อกอินด้วย
9. **`INTEGRATIONS_CREDENTIALS_KEY` บน prod** — ถ้าไม่ได้ตั้ง `seal` โยน ⇒ เชื่อม Google ไม่ได้ (ตรวจด้วยหน้าศูนย์เชื่อมต่อ "ยังไม่ตั้งกุญแจ" — ไม่อ่านค่า)
10. **ห้องเลขาร่วม** — คำสั่ง "เตือนฉัน…" ในห้องที่มีสมาชิกหลายคน ข้อความเห็นทั้งห้อง (ไม่ใช่การรั่วของระบบ แต่ผู้ใช้อาจไม่คาด) ⇒ persona ไม่ทวนรายละเอียดส่วนตัวในห้องร่วม
11. **badge แพง** — `badges` ถูกเรียกบ่อย (focus/foreground) · `todayOpenCount` ต้องเป็น count ตรง + แคช 60 วิ

---

## 12. คำถามเจ้าของ (ไม่บล็อกงาน — ใช้ค่าเริ่มที่ระบุจนกว่าจะตอบ)

| Q | คำถาม | ค่าเริ่มที่ใช้ |
|---|---|---|
| Q1 | ช่างที่ไม่ผูกบัญชีกับพนักงาน HR จะไม่เห็นนัดตัวเอง — ยอมรับไหม หรือให้ผูก `BookingStaff` กับผู้ใช้ตรง ๆ (เพิ่มฟิลด์ = งานนอก CAL) | ยอมรับ + แสดงคำแนะนำในจอ |
| Q2 | เจ้าของตั้งระดับเลขา "ปฏิทิน" เป็น ปิด — ควรปิดเตือนส่วนตัวของพนักงานด้วยไหม | ไม่ปิด (ส่วนตัว · M3/M4) · ระดับ "ปฏิทิน" คุมแค่ปฏิทินกลางของร้าน |
| Q3 | badge แดงของปฏิทินควรรวมในตัวเลขบนไอคอนแอปไหม | ไม่รวม (เฉพาะไอคอนปฏิทินในแถบบน) |
| Q4 | กำหนดยื่นภาษีแสดงวันไหนเป็นหลัก | วันออนไลน์ (23/15) + บรรทัดรองวันกระดาษ |
| Q5 | CRM มีสรุปงานรายวันต่อคนอยู่แล้ว — ปิดของ CRM เมื่อเปิดสรุปเช้าปฏิทินไหม | คงทั้งคู่ |
| Q6 | โค้ดเตือนบัญชีเดิมบอก ภ.พ.30 "ยื่นภายในวันที่ 10" (ถูกคือ 15 / ออนไลน์ 23) — ให้ RUN บัญชีแก้ไหม | แจ้งเท่านั้น ไม่แก้ในงาน CAL |
| Q7 | บัญชี: แสดง "ใบที่ร้านต้องจ่าย" (ฝั่งรายจ่าย ครบกำหนด) ด้วยไหม | ไม่แสดงในรุ่นนี้ (แผนระบุแค่ใบแจ้งหนี้) |

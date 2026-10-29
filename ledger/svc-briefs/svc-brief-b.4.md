# ใบสั่ง B.4 — เช็กอิน · walk-in · บัตร P/A · สาย/ไม่มา · ตรวจ: เข้ม 2 รอบ (ตัวจัดคิว) · ห้ามตัด: กันจองซ้อน (X3) · แยกร้าน (X1) · cron ซ้อน (X5)

> อ้างอิง: MASTER-PLAN แถว B.4 · `DESIGN-BOOKING-QUEUE.md` §4.1 (วงจร 1 งาน) §4.2 (การรัน) R4 · BQ-4 · ภาคผนวก ก #27–32 #38–46 · CC §1.6 (snapshot ชนะ) §6.1 (คิวบนหน่วย BOOKING) §7 (event 3 ทะเบียน · payload ไม่มี PII) + ภาคต่อ 28 ต.ค. · ใบ B.2 §3 (`planDay`/`quoteWalkIn`) · ใบ B.3 §3 (`bookAppointment` · ล็อก idem→เบอร์→ช่าง · CAS ของ `setAppointmentStatus`) §6 ข้อ 9 (walk-in ถือช่อง) §7 (หนี้ bufferMin → B.4) · `/root/svc-runs/fix/b3.md`
> ข้อสอบ (ห้ามแก้): «scripts/qc-svc-b.4.mts» — รับใบ = **ผ่านทุกข้อ ไม่มี SKIP** (นับจาก `JSON_SUMMARY`)
> รัน: `bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-b.4.mts` (ห้าม `timeout` ครอบ · ข้อสอบเปิดลูกโพรเซส 5 ตัว + ท้ายชุดรัน regression เอง — นาน) · ต่อท้าย `--no-regression` = ข้าม G เป็น SKIP (ไม่นับผ่าน · iso.sh ทิ้ง env จึงใช้ argv)
> builder: **ห้าม build/next · ห้าม commit/push · ห้าม `pnpm install` · ห้ามแตะ schema/migration (คอลัมน์ขาด = หยุด รายงานผู้คุม) · ห้ามแก้ข้อสอบ/สคริปต์ใน `scripts/`** · รายงานต่อข้อ (id → ผล)

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ (แตะนอกนี้ = ตีกลับ · ข้อสอบ ST-1 ไล่ `git status` ของ src/ prisma/)
| ไฟล์ | ทำอะไร |
|---|---|
| «src/lib/modules/booking/queue-line.ts» (ใหม่) | §3.2 เช็กอิน · walk-in · เครื่องสถานะงาน (เรียก/เริ่ม/เสร็จ) · ยกเลิก/เลื่อนฝั่งร้าน |
| «src/lib/modules/booking/planner-run.ts» (ใหม่) | §3.3 ตัวห่อ `planDay` (`runPlanner`) + งานรายนาที `runLineTick` (สาย/ไม่มา/สิ้นวัน) |
| `src/lib/modules/booking/service.ts` | §3.4 บัตรเดินตาม `setAppointmentStatus` · `policySnapshot.job` ใน `bookAppointment` · `busyRowsOf` อ่าน buffer จาก snapshot (หนี้ B.3) — **พฤติกรรมอื่นคงเดิมทุกไบต์** |
| `src/lib/modules/booking/index.ts` | re-export ได้ถ้าจำเป็น |
| `src/lib/modules/queue/service.ts` | §3.5 additive ล้วน — หน่วย QUEUE เดิมต้องได้ผลเดิมทุกไบต์ |
| `src/lib/platform/minute-jobs.ts` | **เพิ่ม 2 บล็อก** (§3.6) — ไม่แตะบรรทัดอื่น |
| `src/lib/outbox-consumers.ts` · `src/lib/automation/labels.ts` · `src/lib/webhooks/labels.ts` | §3.7 event 8 ตัว (บล็อกเดียวต่อไฟล์ `// SVC B.4 ▸ … ◂` · คง C2.9 static block เดิม) |

ห้ามแตะ: `prisma/**` · `src/lib/core/**` (ใช้ `signLink`/`verifyLink`/`snapshotPolicy`/`resolveSettings` ตามที่มี) · `planner.ts` (B.2) · `plan-settings.ts` · `staff-hours.ts` · route/หน้าจอทั้งหมด (`src/app/**` · `src/lib/actions/**` = B.5/B.6/B.9) · `scripts/**`
**เส้น import ใหม่ `booking→queue`**: ผู้คุมเพิ่มใน `scripts/fitness.mts` ALLOWED_EDGES ตอนรับใบ (builder ห้ามแตะ) — ห้ามเส้นอื่น (queue ห้าม import booking)

## 2. หลักการ (ข้อสอบตรวจทุกข้อ)
- **ทุกฟังก์ชันรับ `now` ฉีดได้** (`opts.now ?? new Date()`) และใช้นาฬิกาเดียวนั้นตลอด: วันไทยของงาน · `businessDate` ของบัตร · เวลาที่จด (`checkedInAt/lateAt/startedAt/doneAt`) · ตัดสินสาย/ไม่มา — ข้อสอบใช้วันอนาคตคงที่ (กันเปราะเวลาแบบ B-4 ของ B.3) · เวลาไทยผ่าน `localToUtc`/`bkk*` **ห้าม `getDay()/getHours()/getDate()` ดิบ** (ข้อสอบรัน TZ −11 / +14)
- **โหมดแถวเดียว** = ค่าตั้ง `booking.queue.singleLine` (UNIT) = true · ทุกฟังก์ชันของใบนี้ทำงานเฉพาะหน่วย BOOKING ที่เปิดโหมดนี้ · ร้านเดิม (`_fallback` = false) ⇒ `NOT_SINGLE_LINE` / `ran:false` / ไม่ถูก tick แตะ (คงพฤติกรรมรุ่นแรก — สถานะ LATE ไม่โผล่ในจอเดิม)
- **เขียนสถานะ = CAS ตามวินัย B.3 G7**: `updateMany where { id, tenantId, unitId, status: <สถานะที่อ่าน> }` (หรือ `status IN (...)` + เงื่อนไขเวลา ใน UPDATE เดียว) · count = 0 ⇒ แพ้ ⇒ ไม่ยิง event · ห้าม `appointment.update(`/`queueTicket.update(` แบบไม่มีเงื่อนไขสถานะในไฟล์ใหม่ (ST-5)
- **ล็อก** (ลำดับคงที่ กัน deadlock): ทางที่ย้ายช่อง (walk-in · `runPlanner` · เลื่อน) = `pg_advisory_xact_lock(<สาขา>)` → `BookingStaff … ORDER BY sortOrder, createdAt, id FOR UPDATE` (ช่างทุกคนของสาขา = ลำดับเดียวกับ B.3) · เช็กอิน = `Appointment … FOR UPDATE` แถวเดียว · ตัวกันในหน่วยความจำ = แดง (ข้อสอบยิง 5 โพรเซสแยก)
- **ห้ามใช้ connection ที่สองขณะถือล็อก** (B.3 G2): ออกบัตรใน tx เดียวกับสถานะผ่าน `issueTicketTx(tx, …)` · ผูก Party หลัง commit · `runPlanner` เรียก **หลัง commit** (ไม่ซ้อนใน tx ของเหตุการณ์) — ล้ม = log ไม่ทำให้เหตุการณ์ล้ม
- **ค่าตั้งของนัด = snapshot ชนะ** (CC §1.6): ผ่อนผัน/ไม่มา/หลังผ่อนผัน อ่านจาก `policySnapshot.values` ของแถว · แถวไม่มี snapshot (รุ่นแรก) ⇒ resolve ค่าปัจจุบันของสาขา · `noShowAfterMin = null` ⇒ ไม่ตั้งไม่มาอัตโนมัติ · แปลงค่าใช้ `planSettingsFrom` (B.3) — **ห้ามเก็บ PlanSettings เป็น JSON** (Infinity)
- เหตุผลไทยไม่โทษผู้ใช้ · payload event/คำตอบสาธารณะไม่มีชื่อ/เบอร์ (X8) · ข้อผิดพลาดคืน `{ ok:false, code, reason }` ไม่ throw

## 3. สัญญา (ข้อสอบมีสำเนาชนิด — ชื่อ field ต้องตรง)

### 3.1 สถานะงาน ↔ บัตร (BQ-4 · "บัตรเดินตามงาน")
| งาน (Appointment) | บัตร (QueueTicket) |
|---|---|
| ARRIVED (นัดเช็กอิน) · QUEUED (walk-in) | WAITING (ออกบัตรตอนเข้าแถว) |
| — เรียก (`callJob` · สถานะงานไม่เปลี่ยน) | CALLED (`callCount++` · `calledAt`) |
| IN_SERVICE (`startedAt`) | SERVING (`servedAt`) |
| DONE (`doneAt`) | DONE (`doneAt`) |
| NO_SHOW | NO_SHOW |
| CANCELLED | CANCELLED (`cancelledAt` · `cancelReason` STAFF/END_OF_DAY) |
ทุกการเปลี่ยนบัตรเขียน `QueueTicketEvent` (action ตาม enum เดิม · actorType SYSTEM/STAFF) ใน tx เดียวกับงาน · บัตรของแถวเดียวใช้ `refType="APPOINTMENT"` · `refId=appointmentId` · `Appointment.queueTicketId` ชี้กลับ · บัตรไม่เก็บชื่อ/เบอร์ (`contactName/contactPhone = null` · `partyId` = ของนัด)
**ประเภทบัตรของระบบ** (สร้างเองครั้งแรกที่ใช้ · `INSERT … ON CONFLICT DO NOTHING` กันพร้อมกัน): `QueueType(code "APPOINTMENT", prefix = booking.queue.prefixes.appointment ("P"), isSystem true, priority 0)` · `QueueType(code "WALKIN", prefix = prefixes.walkIn ("A"), isSystem true, priority 0)` · เลขบัตรต่อ (สาขา × ประเภท × `businessDate` = วันไทยของ `now`) ด้วย `QueueDailySequence` เดิม (P001 P002 … · A001 …)

### 3.2 «queue-line.ts»
```ts
export type LineCtx = { tenantId: string; unitId: string; actorUserId?: string };
export type CheckInBy = { appointmentId: string } | { token: string } | { phone: string };
export type CheckInVia = "QR" | "LINE" | "PHONE" | "STAFF";
export type CheckInFail = "NOT_FOUND" | "NOT_TODAY" | "TOO_LATE" | "NOT_CONFIRMED" | "BAD_STATE" | "AMBIGUOUS" | "NOT_SINGLE_LINE" | "BAD_INPUT";
export type CheckInResult =
  | { ok: true; appointmentId: string; ticketId: string; ticketNumber: string; already: boolean; asWalkIn: boolean }
  | { ok: false; code: CheckInFail; reason: string; candidates?: { appointmentId: string; startAt: Date; staffId: string }[] };
export async function checkInToken(ctx: LineCtx, appointmentId: string): Promise<string | null>;
export async function checkIn(ctx: LineCtx, by: CheckInBy, opts: { via: CheckInVia; now?: Date }): Promise<CheckInResult>;

export type WalkInChannel = "KIOSK" | "STAFF" | "REMOTE";
export type WalkInInput = { serviceId: string; staffId: string | null; channel: WalkInChannel; customerName?: string; customerPhone?: string; priority?: boolean };
export type WalkInFail = "NOT_FOUND" | "NOT_SINGLE_LINE" | "WALKIN_DISABLED" | "WALKIN_CLOSED" | "BAD_INPUT";
export type WalkInResult =
  | { ok: true; appointmentId: string; ticketId: string; ticketNumber: string; staffId: string | null; plannedStartAt: Date | null; waitMin: number | null }
  | { ok: false; code: WalkInFail; reason: string };
export async function createWalkIn(ctx: LineCtx, i: WalkInInput, opts?: { now?: Date }): Promise<WalkInResult>;

export type JobFail = "NOT_FOUND" | "BAD_STATE" | "LOST_RACE";
export type JobResult = { ok: true } | { ok: false; code: JobFail; reason: string };
export async function callJob(ctx: LineCtx, appointmentId: string, opts?: { now?: Date }): Promise<JobResult>;
export async function startJob(ctx: LineCtx, appointmentId: string, opts?: { now?: Date }): Promise<JobResult>;
export async function completeJob(ctx: LineCtx, appointmentId: string, opts?: { now?: Date }): Promise<JobResult>;
export async function cancelByShop(ctx: LineCtx, appointmentId: string, opts?: { now?: Date; note?: string }): Promise<JobResult>;
export type RescheduleFail = JobFail | "FULL" | "PAST" | "BAD_INPUT" | "ON_LEAVE" | "NOT_QUALIFIED";
export async function rescheduleByShop(ctx: LineCtx, appointmentId: string, to: { dateStr: string; startMin: number; staffId?: string },
  opts?: { now?: Date }): Promise<{ ok: true } | { ok: false; code: RescheduleFail; reason: string }>;
```
**เช็กอิน** (3 ทาง + ทาง B.9):
- `token` = `signLink({ tenantId, purpose: "booking.checkin", subjectId: appointmentId, expMin })` (CC §4.5) ที่ `checkInToken` ออก (หมดอายุ = สิ้นวันนัด + 1 วัน · ไม่เกินเพดาน) · คืน `null` เมื่อนัดไม่ใช่ของ ctx (X1) · `verifyLink` ล้ม / tenant หรือสาขาไม่ตรง / ไม่พบ ⇒ `NOT_FOUND` ด้วย **reason เดียวกันทุกกรณี** (X7)
- `phone` = เทียบด้วยคีย์เบอร์ของ B.3 (`bookingPhoneKey` — `+66 82-345-6789` = `0823456789`) · นัดของสาขานี้ที่ startAt อยู่ในวันไทยของ `now` และสถานะ CONFIRMED/LATE · 1 นัด ⇒ เช็กอิน · ≥ 2 ⇒ `AMBIGUOUS` + `candidates` (ไม่มีชื่อ/เบอร์) · 0 ⇒ `NOT_FOUND`
- `appointmentId` = ปุ่ม LINE (B.9 ตรวจว่าเป็นของผู้กดเอง) / พนักงาน · นัดของร้าน/สาขาอื่น ⇒ `NOT_FOUND`
- ลำดับตรวจ: หน่วยไม่ใช่แถวเดียว ⇒ `NOT_SINGLE_LINE` → หาแถว (ไม่พบ/ข้ามขอบเขต ⇒ `NOT_FOUND`) → ใต้ `FOR UPDATE` ของแถว: มี `queueTicketId` แล้ว (ARRIVED/IN_SERVICE) ⇒ `{ ok:true, already:true, ticketId เดิม }` · PENDING ⇒ `NOT_CONFIRMED` · สถานะอื่นที่ไม่ใช่ CONFIRMED/LATE ⇒ `BAD_STATE` · วันไทยของ startAt ≠ วันไทยของ `now` ⇒ `NOT_TODAY` · `noShowAfterMin`(snapshot) ≠ null และ `now ≥ startAt + noShowAfterMin` ⇒ `TOO_LATE` (ไม่เปลี่ยนแถว — tick ตั้ง NO_SHOW) → CAS CONFIRMED|LATE → ARRIVED (`checkedInAt = now` · `lateAt` คงเดิม) + ออกบัตร P (channel `BOOKING`) + `queueTicketId` + event `booking.checked_in` ใน tx เดียว → หลัง commit `runPlanner`
- `asWalkIn` = `now ≥ startAt + graceMin` **และ** `afterGrace`(snapshot) = `RELEASE_REQUEUE` (มาภายในเวลาไม่มา ⇒ เข้าแถวแบบ walk-in: ตัววางคิวจัด `LATE_ARRIVAL_AS_WALKIN` เอง — บัตรยังเป็น P)
- พร้อมกัน 10 ทาง (ผสม token/เบอร์/id ข้ามโพรเซส) ⇒ ทุกคำขอ `ok` ได้ `ticketId` เดียว · `already:false` ครั้งเดียว · บัตร 1 ใบ · event 1
- แข่งกับ tick ไม่มา ⇒ ผลอย่างใดอย่างหนึ่งเท่านั้น (ARRIVED + บัตร WAITING) หรือ (NO_SHOW + ไม่มีบัตร active)

**walk-in**:
- ลำดับตรวจ: แถวเดียว ⇒ `NOT_SINGLE_LINE` · บริการไม่พบ/inactive/ร้านหรือสาขาอื่น · ช่างที่ระบุไม่ใช่ของสาขา ⇒ `NOT_FOUND` · ค่าตั้ง `booking.service.walkIn` (refs serviceId): `enabled=false` หรือ `durationMin ≥ closeAtOrAboveMin` ⇒ `WALKIN_DISABLED` · `booking.queue.walkInPickStaff=false` ⇒ ช่างที่ระบุถูกละ (ANY)
- ใต้ล็อก (advisory สาขา → ช่างทั้งหมด): สร้าง `PlanInput` จากฐาน (เหมือน `runPlanner`) → `quoteWalkIn` → `closed` ⇒ `WALKIN_CLOSED` (ไม่มีช่องวันนี้ หรือรอเกิน `walkInCloseWaitMin`) → แถว `Appointment { kind "WALKIN", status "QUEUED", channel = input.channel, source "STAFF", assignMode ANY|SPECIFIC, staffId = ช่างที่ quote, startAt = เวลาที่ quote, endAt = startAt + dur + buffer, checkedInAt = now, priceSatang = ราคาเฉพาะคน ?? ราคาบริการ, depositSatang 0, customerName = input ?? "ลูกค้า walk-in", customerPhone = input ?? "", policySnapshot = snapshotPolicy(…) + job }` + บัตร A (channel KIOSK/STAFF/ONLINE(REMOTE)) + `queueTicketId` + event `booking.created` (kind WALKIN) ใน tx เดียว → หลัง commit `runPlanner` · คืน `plannedStartAt`/`staffId` หลัง runPlanner
- **walk-in ถือช่องจริง** (B.3 §6 ข้อ 9): ตลอดที่ QUEUED แถว `staffId/startAt/endAt` = แผนล่าสุด (runPlanner เขียนใต้ล็อกช่าง) · เริ่มงาน ⇒ `startAt = startedAt` · `endAt = startedAt + dur + buffer` ⇒ `findSlots`/`bookAppointment` (STAFF) เห็นช่องนั้นไม่ว่าง · walk-in ∥ จอง STAFF ช่างเดียวกันเวลาเดียวกัน (ข้ามโพรเซส) ⇒ ไม่มีแถวถือช่องซ้อนกัน
- 10 walk-in พร้อมกัน (5 ช่าง) ⇒ 10 ใบ เลข A001–A010 ไม่ซ้ำ · งาน↔บัตร 1:1 · แผนไม่ซ้อนต่อช่าง (5 ที่ 10:00 · 5 ที่ 11:00)

**งาน** (ทุกตัว: ไม่พบ/ข้ามขอบเขต ⇒ `NOT_FOUND` · สถานะไม่ตรง ⇒ `BAD_STATE` · แพ้ CAS ⇒ `LOST_RACE`):
- `callJob`: งาน ARRIVED/QUEUED ที่บัตร WAITING/CALLED ⇒ บัตร CALLED `callCount+1` · event `queue.ticket.called` (คีย์ `queue.ticket.called#<ticketId>#<callCount>` ⇒ เรียกซ้ำ = event ใหม่) · สถานะงานไม่เปลี่ยน
- `startJob`: ARRIVED/QUEUED ⇒ IN_SERVICE `startedAt=now` · บัตร SERVING · event `booking.started` · CONFIRMED/PENDING/DONE/… ⇒ `BAD_STATE`
- `completeJob`: IN_SERVICE ⇒ DONE `doneAt=now` · บัตร DONE · event `booking.completed` (คีย์เดิม `booking.completed#<id>`) + `queue.ticket.done` · **ไม่ยิง `queue.served`** (ไม่ให้ CRM ลง VISIT ซ้ำกับ booking.completed) · (B.10 จะสลับเป็นบิลพัก POS)
- `cancelByShop`: PENDING/CONFIRMED/LATE/ARRIVED/QUEUED ⇒ CANCELLED `cancelReason "SHOP"` · บัตร CANCELLED (STAFF) · event `booking.cancelled` · อื่น ⇒ `BAD_STATE` (มัดจำ: ไม่แตะ — คนตัดสินที่หน้าบิลแบบ O8b)
- `rescheduleByShop`: PENDING/CONFIRMED/LATE เท่านั้น (ARRIVED+ ⇒ `BAD_STATE`) · ใต้ล็อกช่าง (ตัวเดิม+ตัวใหม่ตาม sortOrder) · กติการ้านจองให้ของ B.3 (ห้ามซ้อน ไม่นับตัวเอง · ช่างลา ⇒ `ON_LEAVE` · ทำบริการไม่ได้ ⇒ `NOT_QUALIFIED` · `startAt ≤ now` ⇒ `PAST` · ชน ⇒ `FULL` · วัน/นาทีผิดรูป ⇒ `BAD_INPUT`) · ย้าย `startAt/endAt/staffId` · LATE ⇒ CONFIRMED + `lateAt=null` · `policySnapshot` **ไม่เปลี่ยน** · ไม่นับ `rescheduleCount` (นับเฉพาะลูกค้าเลื่อนเอง — B.7) · event `booking.rescheduled` (คีย์มีเวลาใหม่)

### 3.3 «planner-run.ts»
```ts
export async function runPlanner(ctx: { tenantId: string; unitId: string }, opts?: { now?: Date }): Promise<{ ran: boolean; planned: number }>;
export async function runLineTick(now: Date, opts?: { tenantIds?: string[] }): Promise<{ late: number; noShow: number; endOfDay: number; units: number }>;
```
- `runPlanner`: ไม่ใช่แถวเดียว ⇒ `{ ran:false }` ไม่เขียนอะไร · ใต้ล็อก (advisory สาขา → ช่าง) อ่าน: `staffDayProfiles(วันไทยของ now)` → `PlanStaff` · บริการ (`bufferAfterMin` = `BookingService.bufferMin`) · `planSettingsFrom(resolve(PLAN_SETTING_KEYS))` · งานของวันไทยนั้น (ทุกสถานะ · DONE นับงาน/วัน) → `PlanJob` (status ตรงชื่อ · `issuedAt` = walk-in: `checkedInAt` · นัด: `createdAt` · `policy` จาก snapshot) → `planDay` → เขียน `plannedStaffId/plannedStartAt` ของงานที่ยังไม่จบ (UNPLACED/RELEASED_LATE/NO_SHOW_DUE ⇒ null) · `QueueTicket.etaAt = plannedStartAt` · walk-in QUEUED ⇒ `staffId/startAt/endAt` ตามแผน (ไม่วางได้ ⇒ คงเดิม)
- `runLineTick` (ข้ามร้าน · `tenantIds` = จำกัดขอบเขต — minute-job ไม่ส่ง · **ข้อสอบส่งเสมอ** ห้ามแตะร้านอื่น):
  1. สาย: `status='CONFIRMED' AND checkedInAt IS NULL AND startAt + graceMin ≤ now` ⇒ LATE `lateAt=now` + event `booking.late` (คีย์ `booking.late#<id>`)
  2. ไม่มา: `status IN ('CONFIRMED','LATE') AND checkedInAt IS NULL AND noShowAfterMin IS NOT NULL AND startAt + noShowAfterMin ≤ now` ⇒ NO_SHOW (CONFIRMED ข้ามไป NO_SHOW ตรง ไม่ยิง late) ผ่านทางเดียวกับ `setAppointmentStatus` (event `booking.no_show` คีย์เดิม + ริบมัดจำหลัง commit + บัตรเดินตาม)
  3. สิ้นวัน: walk-in `QUEUED` ที่วันไทยของ `startAt` < วันไทยของ `now` ⇒ CANCELLED `cancelReason "END_OF_DAY"` + บัตร CANCELLED END_OF_DAY
  4. `runPlanner` ทุกหน่วยแถวเดียว (ในขอบเขต) ที่มีงานไม่จบในวันไทยของ `now`
  - ขอบเขตแถว: หน่วย BOOKING แถวเดียวเท่านั้น · PENDING ไม่ถูกแตะ (ร้านยืนยัน/ปล่อยมัดจำ = B.3/B.5) · startAt ย้อนไม่เกินวันไทยก่อนหน้า 1 วัน
  - ทุกข้อเป็น UPDATE แบบมีเงื่อนไขสถานะ (+ `FOR UPDATE SKIP LOCKED` เป็นก้อนแบบ `expireDepositHolds`) ⇒ **tick ซ้อน 2 โพรเซส: ผลรวม `late`/`noShow` = จำนวนแถวที่เปลี่ยนจริง · event ต่อแถว 1** (X5) · คืนจำนวนที่ "ฉัน" เปลี่ยนจริง
  - ค่าผ่อนผัน/ไม่มา **จาก snapshot ของแถว** (แถวไม่มี snapshot ⇒ ค่าปัจจุบันของสาขา) — แก้ค่าตั้งหลังจองไม่กระทบนัดเดิม

### 3.4 `service.ts` (เพิ่ม · ไม่เปลี่ยนพฤติกรรมเดิม)
- `setAppointmentStatus`: งานที่มี `queueTicketId` ⇒ บัตรเดินตามตาราง §3.1 ใน tx เดียวกับ CAS (เช่น ARRIVED → CANCELLED ⇒ บัตร CANCELLED · → NO_SHOW ⇒ บัตร NO_SHOW) · หน่วยแถวเดียว ⇒ `runPlanner` หลัง commit · ทางอื่นคงเดิม
- **หนี้ B.3 (bufferMin)**: แถวใหม่ทุกช่องทางของ `bookAppointment` + walk-in จด `policySnapshot.job = { durationMin, bufferMin }` (นาทีเฉพาะคน · buffer ของบริการตอนจอง — คีย์ระดับบนข้าง `values` · ไม่แตะ core) · `busyRowsOf` ใช้ `COALESCE((policySnapshot->'job'->>'bufferMin')::int, service.bufferMin, 0)` ⇒ แก้ buffer ของบริการทีหลังไม่ขยับช่องรอบนัดเดิม (ข้อสอบ D-1: พักขั้นต่ำ 10 · buffer 15→0)
- `createAppointment` รุ่นแรก: ไม่แตะ

### 3.5 `queue/service.ts` (additive · หน่วย QUEUE เหมือนเดิม)
- `issueTicketTx(tx, input & { businessDate: string; actorType })` — ตัวเดียวกับ `issueTicket` แต่ใช้ tx ของผู้เรียก (ไม่ผูก Party ใน tx) · `issueTicket` เดิมเรียกตัวนี้ได้ (ผลเดิม)
- ตัวช่วยเปลี่ยนสถานะบัตรใน tx ของผู้เรียก (ตาราง §3.1 + `QueueTicketEvent`) — ชื่ออิสระ
- `resetDaily(ctx, now?)` · `expireSkipped(ctx, now?)` — ไม่ส่ง `now` = เดิมทุกไบต์ · ส่ง = ใช้วันไทย/cutoff จาก `now`
- `runQueueHousekeeping(now: Date, opts?: { tenantIds?: string[] }) → { cancelled: number; expired: number }` — `resetDaily`+`expireSkipped` ทุกหน่วยที่มีบัตรค้าง · **ข้ามบัตร `refType='APPOINTMENT'`** (ของจองคิว — สิ้นวันทำใน `runLineTick`)
- `resolveQueueUnit`: หน่วย QUEUE เหมือนเดิม + หน่วย BOOKING ที่ `booking.queue.singleLine=true` (CC §6.1) · BOOKING ปิดโหมด ⇒ `null`
- `getTicketStatus`: บัตรที่มี `etaAt` ⇒ `estimateMin = max(0, ceil((etaAt − now)/60 000))` (ETA จากตัววางคิว · BQ-4) · ไม่มี ⇒ สูตรเดิม
- ห้าม import booking (ทิศทางเดียว booking→queue)

### 3.6 minute-jobs (2 บล็อก · โหลดตอนรัน)
- `registerMinuteJob({ name: "booking.line.tick", everyMinutes: 1, cadence: "minute", run: async (now) => (await import("@/lib/modules/booking/planner-run")).runLineTick(now) })`
- `registerMinuteJob({ name: "queue.housekeeping", everyMinutes: 5, cadence: "minute", run: async (now) => (await import("@/lib/modules/queue/service")).runQueueHousekeeping(now) })`
- ไม่ใช่ vpsOnly

### 3.7 Event 8 ตัว (CC §7 · 3 ทะเบียนในใบนี้ · consumer = `withAutomation(async () => {})` เว้นแต่มีเหตุ)
`booking.created` · `booking.rescheduled` · `booking.cancelled` · `booking.checked_in` · `booking.late` · `booking.started` · `queue.ticket.called` · `queue.ticket.done` — ป้ายไทยใน `AUTOMATION_EVENTS` ครั้งเดียว · `WEBHOOK_EVENTS` ได้ผ่าน spread (ห้ามประกาศซ้ำ) · payload ⊇ `{ appointmentId, unitId, staffId, kind, channel }` (+ `ticketId` ของ queue.*) · **ห้ามมีชื่อ/เบอร์/อีเมล** · ใบนี้ยิง: created (walk-in) · rescheduled/cancelled (ฝั่งร้าน) · checked_in · late · started · queue.* — created/cancelled ของทางออนไลน์ = B.7

## 4. ไม่ใช่เรื่องของใบนี้
- จอ/ปุ่ม/ข้าม (#43 `skipAfterMin`)/ย้ายช่าง = **B.5** (ใช้ตัวช่วยบัตร §3.5 + CAS แบบใบนี้) · หน้า `src/app/app/u/[unitSlug]/queue/page.tsx` ยอม BOOKING = B.5 · ตู้/ทีวี/หน้าบัตร = **B.6** · ปุ่ม LINE/postback/แจ้งเตือน = **B.9** · บิลพัก POS แทน DONE ตรง = **B.10** · created/cancelled ออนไลน์ + ลูกค้าเลื่อนเอง = **B.7** · ไม่มาซ้ำ (#32) = B.7/B.8

## 5. เกณฑ์รับ
- «scripts/qc-svc-b.4.mts» เขียวทุกข้อ — หมวด: **T** แม่แบบ · **C0** ตัวควบคุม (snapshot ของ B.3 · `planDay` ให้ตัวเลขตามฉาก · ออกบัตรหน่วย QUEUE เดิม) · **K** เช็กอิน 3 ทาง + รหัสล้ม + X1/X7 · **W** walk-in + ถือช่อง + เลขบัตร · **J** เรียก/เริ่ม/เสร็จ/ยกเลิก/เลื่อน + บัตรเดินตาม (รวมทางเดิม `setAppointmentStatus`) · **L** ตัวจัดคิวเข้ม (สาย 10 ⇒ LATE + ช่องไป walk-in · มาภายใน 30 ⇒ เข้าแถวแบบ walk-in · 30 ⇒ NO_SHOW ครั้งเดียว · snapshot ชนะ 2 ทิศ · HOLD ไม่ปล่อยช่อง · ร้านเดิมไม่ถูกแตะ · แถวไม่มี snapshot · สิ้นวัน · X1 ของ tick) · **D** หนี้ bufferMin · **Q** คิวบนหน่วย BOOKING + หน่วย QUEUE เดิม · **EV** 3 ทะเบียน + payload ไม่มี PII · **MJ** minute-job · **X** ข้ามโพรเซส (X-0 ตัวควบคุม · เช็กอิน 10 ทาง ⇒ บัตร 1 · walk-in 10 ทาง ⇒ A001–A010 · tick ซ้อน 2 โพรเซส 3 รอบ ⇒ ครั้งเดียว · เช็กอิน ∥ ไม่มา · walk-in ∥ จอง STAFF ⇒ ไม่ซ้อน) · **TZ** · **Z** · **ST** · **G** regression
- regression (G): `qc-queue-public` · `qc-systems` (บรรทัด Queue ต้อง ✅) · `qc-booking-race` · `qc-booking-deposit` · `qc-booking-edit-schedule` · `qc-svc-b.3` (`SVC_B3_NO_REGRESSION=1` · ไม่มี FAIL · SKIP เฉพาะ G-*/ST-1) · `qc-svc-b.2` · `qc-svc-smoke`
- typecheck + fitness 2 โหมด (ผู้คุมรัน · เพิ่มเส้น `booking→queue`) · ตรวจเข้ม 2 รอบ (ตัวจัดคิว)
- ข้อสอบตรวจตัวเองแล้ว 29 ต.ค. (โค้ดก่อน B.4 · 74 ข้อ · log `/tmp/svc-b4-oracle-1.log`): **เขียวอยู่แล้วและต้องเขียวต่อ 13 ข้อ** = T-0 · F-0 · C0-1 · C0-2 (ค่าคาดของหมวด L พิสูจน์ด้วย planDay จริง) · C0-3 · Q-2a · Q-4b · X-0 (สายยิงข้ามโพรเซสทำงาน) · XS-1 · Z-1 · ST-3 · ST-4 · ST-6 · แดง 53 ข้อเพราะยังไม่มี `queue-line.ts`/`planner-run.ts`/`runQueueHousekeeping`/พารามิเตอร์ `now`/`policySnapshot.job`/event/minute-job · G-1…G-8 SKIP (ยังไม่มีงาน)

## 6. จุดที่แบบไม่ชัด — ผู้เขียนข้อสอบเลือกแล้ว (ผู้คุมเคาะได้ · เปลี่ยน = ORACLE-EDIT)
1. **ไม่ต้องมีคอลัมน์ใหม่**: บัตร↔งานใช้ `refType/refId` + `Appointment.queueTicketId` · เวลารับ walk-in = `checkedInAt` · ETA = `QueueTicket.etaAt` · แคชแผน = `plannedStaffId/plannedStartAt` (B.0) · ไม่มี unique (refType, refId) ⇒ กันบัตรซ้ำด้วยล็อกแถวนัด (หนี้ดัชนี: partial unique `QueueTicket(refId) WHERE refType='APPOINTMENT' AND status IN active` ให้ migration ถัดไป)
2. LATE = **เลยผ่อนผัน** (แบบ §4.1) — คอมเมนต์ใน schema "อยู่ในช่วงผ่อนผัน" ไม่ตรงแบบ (แก้คอมเมนต์ในใบ migration ถัดไป) · HOLD (`WAIT_NOTIFY_COUNTER`) ก็ขึ้น LATE แต่ตัววางคิวถือช่องไว้
3. มาสายแต่ภายในเวลาไม่มา ⇒ ยังเป็นบัตร **P** (อ้างนัด) แต่ลำดับ/เวลาเริ่มเป็นแบบ walk-in (`asWalkIn:true`) · เลยเวลาไม่มา ⇒ `TOO_LATE` (ร้านออกบัตร A ให้แทนได้)
4. เช็กอินได้เฉพาะ **วันไทยเดียวกับนัด** (มาก่อนเวลาได้) · PENDING เช็กอินไม่ได้ (ร้านยืนยันก่อน) · tick ไม่แตะ PENDING
5. tick ทำเฉพาะหน่วยแถวเดียว — ร้านเดิมไม่มี LATE/NO_SHOW อัตโนมัติ (จอเดิมรู้จัก 6 สถานะ)
6. CONFIRMED ที่เลยเวลาไม่มาในรอบเดียว ⇒ NO_SHOW ตรง (ไม่ยิง `booking.late`)
7. บัตรของแถวเดียวไม่เก็บชื่อ/เบอร์ (ข้อมูลอยู่ที่นัด · PDPA) · ประเภทบัตร P/A priority เท่ากัน (ลำดับมาจากตัววางคิว ไม่ใช่ priority ของบัตร)
8. `queue.served` ไม่ยิงจากบัตรแถวเดียว (booking.completed ทำหน้าที่ VISIT แล้ว)
9. ยกเลิกฝั่งร้าน `cancelReason "SHOP"` · เลื่อนฝั่งร้านไม่นับ `rescheduleCount` · snapshot ไม่เปลี่ยนเมื่อเลื่อน
10. housekeeping ของคิวข้ามบัตรของจองคิว (ไม่งั้น `resetDaily` ยกเลิกบัตร P/A ของวันอื่น) — สิ้นวันของ walk-in ทำใน `runLineTick` (ARRIVED ค้างข้ามวัน = ร้านปิดเองบนจอ B.5)
11. หนี้ bufferMin: เก็บใน `policySnapshot.job` (คีย์ใหม่ระดับบน ข้าง `values`) แทนคอลัมน์ — `planDay` ยังใช้ buffer ปัจจุบันของบริการ (PlanService ไม่มี buffer รายงาน — ส่งต่อ B.13 ถ้าต้อง)
12. `runLineTick` รับ `tenantIds` (ข้อสอบจำกัดขอบเขตกันแตะ seed ของฐาน QC) · ย้อนไม่เกิน 1 วันไทย

## 7. ส่งต่อใบหลัง
- **B.5**: ข้าม/เรียกคืน (#43) · ย้ายช่าง (ANY ที่ยังไม่เช็กอิน) · หน้า queue ยอม BOOKING · ARRIVED ค้างข้ามวัน · แจ้ง "ต้องจัดการ" จาก LATE/HOLD · `src/lib/actions/booking.ts` เรียก `cancelByShop`/`rescheduleByShop`
- **B.6**: ตู้/หน้าบัตรใช้ `createWalkIn(channel KIOSK/REMOTE)` · `checkIn(token)` · `getTicketStatus` (ETA จาก etaAt) · rate limit
- **B.9**: postback `booking.checkin?a=<id>` ⇒ `checkIn({appointmentId}, {via:"LINE"})` หลังตรวจเจ้าของ · QR บนใบนัด = `checkInToken`
- **B.10**: `completeJob` → บิลพัก + DONE เมื่อจ่าย (คง `queue.ticket.done`)

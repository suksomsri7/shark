# ใบสั่ง B.5 — จอคิววันนี้แถวเดียว (ภาพ จอง 01) · มือถือช่าง "ของฉัน" · ปฏิทินรายวันตามคน · ตรวจ: **เบา** (รอบเดียว) · ห้ามตัด: แยกร้าน (X1) · ไม่มีเบอร์เต็มในจอพนักงาน (X8) · กันจองซ้อน (ย้ายช่าง/ข้าม ไม่ทำให้มีแถวถือช่องซ้อน) · UI ตรงแบบ

> อ้างอิง: MASTER-PLAN แถว B.5 · `DESIGN-BOOKING-QUEUE.md` R5 · R6 (ย่อ: รายวันตามคน) · §7 ("ช่างเห็นงานของตัวเอง + แถวรวม") · ภาคผนวก ก #43 (ข้ามหลังเรียกแล้วไม่มา) · ภาพ `ledger/design-booking/01-today-line.png` (+ `.body.html` · README ฉาก "ส. 31 ต.ค. 14:20") · ใบ B.4 §3 (facade `queue-line.ts` / `planner-run.ts`) §7 (หนี้ส่งต่อ) · `/root/svc-runs/fix/b4.md` (หนี้: ถอย ARRIVED · manualHold ข้ามเที่ยงคืน) · CC §8 (คีย์สิทธิ์) · ใบ B.11 (เลน l3 · ยังไม่ merge) §7–§8
> ข้อสอบ (ห้ามแก้): «scripts/qc-svc-b.5.mts» — รับใบ = **ผ่านทุกข้อ** (นับจาก `JSON_SUMMARY`) · SKIP ที่ยอมได้ระหว่างทำ: `H-*` `E-1` `V-*` (ไม่มี QC_BASE) · `Q-*` (svcqc ยังไม่ seed) · `G-*` (ต่อท้าย `--no-regression`) — ผู้คุมรันซ้ำครบก่อนรับ
> รัน: `bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-b.5.mts [--no-regression]` (ห้าม `timeout` ครอบ · ห้าม kill กลางคัน — ล้างข้อมูลอยู่ใน finally)
> builder: **ห้าม build/next · ห้าม commit/push · ห้าม `pnpm install` · ห้าม migration/แตะ `prisma/**` · ห้ามแก้ข้อสอบ/`scripts/svc-qc-data.mts`/สคริปต์อื่นใน `scripts/`** (ยกเว้นไฟล์ฉากใหม่ §5) · temp ขึ้นต้น `svc-b5-` · รายงานต่อข้อ (id → ผล)
> ผู้คุมแก้ให้แล้วในใบนี้ (builder ห้ามแตะ): `scripts/svc-qc-data.mts` — ek ได้ `booking.job.run` · cashier ได้ `booking.checkin` `booking.walkin.create` · `SQC_TODAY_LINE_SCENE` + `sqcLineSceneDate`/`sqcLineSceneAt`/`SQC_LINE_SCENE_DAY` · `SQC_VISUAL_SPECS["b.5"]` (ต้อง reseed ก่อนถ่ายภาพ — ผู้คุมทำ)

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ (แตะนอกนี้ = ตีกลับ · ข้อสอบ S-1 ไล่ `git status` ของ src/ prisma/)
| ไฟล์ | ทำอะไร |
|---|---|
| «src/lib/modules/booking/line-access.ts» (ใหม่) | §3.1 `lineAccess` — **pure** (import ค่าได้แค่ `@/lib/core/rbac`) |
| «src/lib/modules/booking/today-line.ts» (ใหม่) | §3.2 ตัวโหลดจอ `loadTodayLine` · `loadDayCalendar` · ด่าน `authorizeLineOp` · `myStaffIds` · ชนิด DTO (export type) |
| «src/lib/modules/booking/line-ops.ts» (ใหม่) | §3.3 `skipJob` · `recallJob` · `moveJobStaff` (CAS + ล็อกแบบ B.4) |
| `src/lib/modules/booking/planner-run.ts` | §3.3 งานที่บัตร SKIPPED = ท้ายแถว · tick ข้อ 5 ข้ามเอง (#43) · คืน `skipped` (เพิ่ม field) — พฤติกรรมอื่นคงเดิม |
| `src/lib/modules/booking/queue-line.ts` | §3.4 (ข) นัด manualHold ของเมื่อวานเช็กอินได้ · ใช้ตัวช่วยใหม่ได้ — สัญญา B.4 คงเดิมทุกข้อ |
| `src/lib/modules/booking/service.ts` | §3.4 (ก) `setAppointmentStatus` ถอย ARRIVED ⇒ ล้างเช็กอิน+ยกเลิกบัตร (เพิ่มเท่านั้น) |
| `src/lib/modules/booking/index.ts` | re-export ได้ถ้าจำเป็น |
| `src/lib/modules/queue/service.ts` | §3.3 additive: ย้ายบัตร CALLED→SKIPPED (`skippedAt`) · SKIPPED→CALLED (เรียกคืน `callCount+1`) ใน tx ของผู้เรียก — หน่วย QUEUE เดิมได้ผลเดิมทุกไบต์ · ห้าม import booking |
| `src/lib/modules/queue/actions.ts` | §3.4 (จ) `ticketCtxOf` — action ที่แตะบัตรปฏิเสธหน่วยที่ไม่ใช่ QUEUE |
| «src/lib/actions/booking-line.ts» (ใหม่) | §3.5 server actions ของจอ |
| `src/lib/actions/booking.ts` | §3.4 (ค) **บรรทัดเดียว**: เงื่อนไข WARN `pos.deposit.forfeit_failed` |
| `src/lib/core/permissions.ts` | §3.1 คีย์ 5 ตัว **เฉพาะเมื่อยังไม่มีที่ HEAD** (B.11 merge ก่อน = ไม่ต้องแตะ) |
| `src/app/app/u/[unitSlug]/booking/page.tsx` · `layout.tsx` | §3.6 จอแถวเดียว (ร้านที่ไม่เปิดโหมด = จอเดิม) · ความกว้าง/แท็บ |
| «src/app/app/u/[unitSlug]/booking/mine/page.tsx» · «…/booking/day/page.tsx» (ใหม่) | §3.6 มือถือช่าง "ของฉัน" · ปฏิทินรายวันตามคน |
| `src/app/app/u/[unitSlug]/queue/page.tsx` | §3.4 (ง) หน่วย BOOKING แถวเดียว ⇒ redirect `/booking` |
| «src/components/booking/TodayLine.tsx» · «MyQueue.tsx» · «DayCalendar.tsx» (+ไฟล์ย่อยใต้ `src/components/booking/`) | §4 คอมโพเนนต์ (default export) |
| «scripts/svc-qc-today-line-scene.mts» (ใหม่) | §5 ฉากภาพบน svcqc |

ห้ามแตะ: `planner.ts` (B.2) · `plan-settings.ts` · `staff-hours.ts` · `src/lib/core/**` อื่น (ใช้ `evaluate` · `resolveSettings` ตามที่มี) · HR (ใช้ facade `employeeOfUser` จาก `@/lib/modules/hr` — มีแล้ว · เส้น `booking→hr` มีใน ALLOWED_EDGES) · 3 ทะเบียน event (ใบนี้ไม่มี event ใหม่ — S-9) · `src/components/queue-auto-refresh.tsx` (ใช้ตามเดิม)

## 2. หลักการ (ข้อสอบตรวจทุกข้อ)
- **ทุกฟังก์ชันรับ `now` ฉีดได้** (`opts.now ?? new Date()`) และใช้นาฬิกาเดียวนั้นตลอด · เวลาไทยผ่าน `bkkDayOf`/`localToUtc`/`BKK_OFFSET_MIN` — ห้าม `.getDay()/.getHours()/.getMinutes()/.getDate()/.getMonth()/.getFullYear()` ดิบในไฟล์ใหม่+คอมโพเนนต์ (S-7 · จอแสดงเวลาใช้ `Intl`/`toLocaleTimeString` พร้อม `timeZone: "Asia/Bangkok"` หรือคำนวณจาก epoch+7 ชม.)
- **ทำงานเฉพาะหน่วย BOOKING ที่ `booking.queue.singleLine = true`** (`lineSettingsOf` ของ B.4) — ร้านเดิม ⇒ ตัวโหลดคืน `null` ⇒ หน้าแสดงจอเดิมตามเดิม (ข้อความ "รายการนัด" ยังอยู่ · S-4 · regression `qc-booking-*`)
- **ขอบเขต (X1)**: ทุกคิวรีผูก `tenantId + unitId` ของ ctx · ของร้าน/สาขาอื่น ⇒ ตัวโหลด `null` · ฟังก์ชันเขียน `NOT_FOUND` · `authorizeLineOp` `NOT_FOUND`
- **เขียนสถานะ = CAS ตามวินัย B.4** (`updateMany where { id, tenantId, unitId, status }` · บัตรใช้ `status + callCount`) · แพ้ ⇒ `LOST_RACE` ไม่เขียนอะไร · ห้าม `.appointment.update(`/`.queueTicket.update(` ใน «line-ops.ts» (S-8) · ทางที่ย้ายช่อง (ย้ายช่าง · ข้าม/เรียกคืนที่ทำให้วางใหม่) ⇒ ล็อก `lockUnitTx` (advisory สาขา → ช่างทั้งสาขา) ก่อนแถวนัด · runPlanner **หลัง commit** · ชนชั่วคราว ⇒ `retryBusy` แบบ B.4 ⇒ `BUSY` · ข้อผิดพลาดคืน `{ ok:false, code, reason ไทยไม่โทษผู้ใช้ }` ไม่ throw
- **ความเป็นส่วนตัว (X8)**: DTO ของผู้ที่ `fullPhone = false` **ต้องไม่มีเบอร์เต็มที่ใดเลย** (ข้อสอบ `JSON.stringify(view)` + HTML/RSC จาก server) · `phoneMasked` = `"•••-•••-" + 4 หลักท้าย` (ใช้ `maskPhone` ของ B.11 ถ้ามีที่ HEAD — ไม่งั้นเขียนรูปเดียวกันในไฟล์ของใบนี้) · ชื่อลูกค้าแสดงได้ (พนักงานต้องเรียกชื่อ)

## 3. สัญญา (ข้อสอบมีสำเนาชนิด — ชื่อ field ต้องตรง)

### 3.1 «line-access.ts» + คีย์สิทธิ์
```ts
export type LineMember = { role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown> };
export type LineAccess = { view: boolean; operate: boolean; checkIn: boolean; walkIn: boolean; runOwn: boolean; runAny: boolean; fullPhone: boolean };
export function lineAccess(m: LineMember | null, unitId: string): LineAccess;
```
`can(k) = evaluate(m, { module: "booking", action: k, unitId })` (OWNER/MANAGER ที่มีสาขา = ทุกข้อ · `booking.*` = ทุกข้อ · ไม่มีสาขา/null = ไม่มีอะไร)
- `operate = can("booking.queue.operate")` · `checkIn = can("booking.checkin")` · `walkIn = can("booking.walkin.create")` · `runAny = can("booking.job.runAny")` · `runOwn = runAny || can("booking.job.run")` · `fullPhone = can("booking.customer.phoneFull")` (คีย์ของ B.11 — ใบนี้ไม่ลงทะเบียน แต่ evaluate ได้)
- `view = operate || checkIn || walkIn || runOwn || can("booking.appointment.setStatus")` (คีย์เดิม = ดูได้อย่างเดียว · ไม่ให้ปุ่มใหม่)
- คีย์ใหม่ใน `permissions.ts` (โมดูล booking · ต่อท้ายบล็อก `// SVC B.5`) **ถ้ายังไม่มีที่ HEAD**: `booking.queue.operate` "ดูแลแถวคิววันนี้ (เรียก · ข้าม · ย้ายช่างของทุกคน)" · `booking.checkin` "เช็กอินลูกค้าที่จองไว้" · `booking.walkin.create` "รับลูกค้า walk-in (ออกบัตรคิว)" · `booking.job.run` "เรียก · เริ่ม · เสร็จ งานของตัวเอง" · `booking.job.runAny` "เรียก · เริ่ม · เสร็จ งานของทุกคน" (P-1: `isPermissionKey` + ป้ายมีอักษรไทย)

### 3.2 «today-line.ts»
```ts
export type LineAction = "call" | "recall" | "skip" | "start" | "done" | "move" | "checkin" | "noshow" | "cancel";
export type LineViewer = { userId: string; access: LineAccess };
export type LineJob = {
  appointmentId: string; kind: "BOOKED" | "WALKIN"; status: string; assignMode: "SPECIFIC" | "ANY";
  ticketNumber: string | null; ticketStatus: string | null;   // บัตรปัจจุบัน (queueTicketId) · ยังไม่มี = null
  label: string;            // นัด = customerName · walk-in = ชื่อบริการ (ห้ามมีเบอร์)
  serviceName: string;
  staffId: string | null; staffName: string | null;            // ช่างตามแผน: plannedStaffId ?? staffId
  bookedStartMs: number | null;                                // นัด = startAt · walk-in = null
  plannedStartMs: number | null; plannedEndMs: number | null;  // จาก planDay ณ now (กำลังทำ = startedAt)
  waitMin: number | null;   // max(0, round((plannedStart − now)/นาที))
  waitedMin: number | null; // อยู่ในร้าน (ARRIVED/QUEUED): floor((now − checkedInAt)/นาที) · อื่น null
  whyText: string | null;   // why.text ของตัววางคิว (walk-in ที่วาง) · อื่น null
  phoneMasked: string | null; phone: string | null;            // phone เต็มเฉพาะ access.fullPhone · walk-in ไม่มีเบอร์ = ทั้งคู่ null
  mine: boolean;            // staffId หรือ plannedStaffId ∈ myStaffIds
  actions: LineAction[];    // §3.2.1
};
export type LineBlock = { appointmentId: string; staffId: string; look: "now" | "arrived" | "booked" | "placed" | "noshow" | "done"; startMs: number; endMs: number; ticketNumber: string | null; label: string };
export type LineTodo = { appointmentId: string; kind: "LATE" | "SOON" | "STALE"; title: string; detail: string; actions: LineAction[]; phone: string | null };
export type TodayLineView = {
  unitId: string; dayStr: string; nowMs: number; openMin: number | null; closeMin: number | null; axisStartMs: number; axisEndMs: number;
  kpi: { booked: number; arrived: number; absent: number; upcoming: number; walkIns: number; walkInsLeft: number; waiting: number; longestWaitMin: number | null; longestWaitTicket: string | null; done: number };
  staff: { staffId: string; name: string; seat: number; mine: boolean; blocks: LineBlock[] }[];
  waiting: LineJob[]; inService: LineJob[]; skipped: LineJob[]; todo: LineTodo[];
  why: { appointmentId: string; ticketNumber: string | null; staffName: string | null; startMs: number | null; text: string } | null;
  access: LineAccess; myStaffIds: string[];
  walkInForm: { services: { id: string; name: string; durationMin: number }[]; staff: { id: string; name: string }[] } | null;
};
export async function loadTodayLine(ctx: { tenantId: string; unitId: string }, viewer: LineViewer, opts?: { now?: Date }): Promise<TodayLineView | null>;
export type DayCalendarView = { unitId: string; dateStr: string; prevDateStr: string; nextDateStr: string; openMin: number | null; closeMin: number | null;
  staff: { staffId: string; name: string; blocks: { appointmentId: string; startMs: number; endMs: number; status: string; label: string; ticketNumber: string | null }[] }[] };
export async function loadDayCalendar(ctx, viewer: LineViewer, opts: { dateStr: string; now?: Date }): Promise<DayCalendarView | null>;
export async function myStaffIds(ctx, userId: string): Promise<string[]>;
export async function authorizeLineOp(ctx, viewer: LineViewer, op: LineAction | "walkin", appointmentId: string | null, opts?: { now?: Date })
  : Promise<{ ok: true } | { ok: false; code: "FORBIDDEN" | "NOT_FOUND"; reason: string }>;
```
**ตัวโหลด** (`loadTodayLine`): ไม่ใช่แถวเดียว / หน่วยไม่ใช่ของ tenant / `!viewer.access.view` ⇒ `null` · อ่าน (ไม่ล็อก ไม่เขียน) `planPreOf` + `jobRowsOf(prisma…)` ของวันไทยของ `now` → `planDay` (ตัวเดียวกับ runPlanner — **แผนในจอคิดสด ณ now** ไม่ใช่แคช) · ยกเว้นงานที่บัตร SKIPPED จัดตาม §3.3
- `dayStr` = วันไทยของ now · `openMin/closeMin` = เวลาร้านของวัน (`BookingHours`/วันพิเศษ · ปิด = null) · แกน `axisStartMs ≤ nowMs ≤ axisEndMs` · อยู่ในเวลาร้าน · ยาว ≥ 3 ชม. (ภาพ: 13:00–18:00 ตอน 14:20 — ค่าแนะนำ: ชั่วโมงก่อน now −1 ชม. ถึง +4 ชม. ตัดด้วยเวลาร้าน)
- `staff` = ช่าง active เรียง `sortOrder, createdAt, id` · `seat` = ลำดับ 1… · `blocks` = **ทุกงานของวัน ยกเว้น CANCELLED** อยู่แถวช่าง `plannedStaffId ?? staffId` ครั้งเดียว: กำลังทำ `now` · DONE `done` · นัดเช็กอินแล้ว `arrived` · นัดยังไม่มา `booked` · walk-in รอ (QUEUED) `placed` (เวลา/ช่างตามแผน) · LATE ที่ตัววางคิวปล่อยช่อง / NO_SHOW `noshow`
- `waiting` = ลำดับ `plan.line` (ไม่รวมกำลังทำ · ไม่รวมบัตร SKIPPED · ไม่รวมงานจบ/ยกเลิก/ปล่อยช่อง) — รวมนัดที่ยังไม่มา (แสดงแบบ "ยังไม่มา" ในภาพ) · `inService` = IN_SERVICE · `skipped` = ARRIVED/QUEUED ที่บัตร SKIPPED
- `why` = walk-in QUEUED ที่ออกบัตรล่าสุดและมี why จากตัววางคิว (ภาพ: A011)
- `todo`: `LATE` = นัด LATE หรือ CONFIRMED ที่ `now ≥ startAt + ผ่อนผัน(snapshot)` ยังไม่เช็กอิน (ข้อความบอกปล่อยช่องแล้ว/ถ้ามาก่อน HH:MM เข้าแถวแบบ walk-in/หลังนั้นนับไม่มา · ไม่มีมัดจำ/มีมัดจำ) · `SOON` = CONFIRMED ที่เริ่มภายใน 60 นาทีข้างหน้า ยังไม่เช็กอิน · `STALE` = ARRIVED/QUEUED/IN_SERVICE ของวันไทยก่อนหน้า (หนี้ B.4 "ARRIVED ค้างข้ามวัน" — ปุ่ม done/cancel ให้ร้านปิดเอง) · `phone` เต็มเฉพาะ fullPhone (ปุ่ม "โทรหา" = `tel:`) · title/detail ห้ามมีเบอร์
- `kpi` (ภาพการ์ด 4 ใบ): นัด `booked` = BOOKED ของวัน ยกเว้น CANCELLED · `arrived` = ARRIVED/IN_SERVICE/DONE · `absent` = LATE+NO_SHOW · `upcoming` = PENDING/CONFIRMED · walk-in `walkIns` = WALKIN ทั้งหมดของวัน · `walkInsLeft` = WALKIN CANCELLED · `waiting` = ARRIVED+QUEUED · `longestWaitMin/Ticket` = มากสุดของ `now − checkedInAt` ในกลุ่ม waiting · `done` = DONE ทั้งหมด
- `walkInForm` = มีเฉพาะ `access.walkIn` (บริการ active ที่รับ walk-in · ช่าง active) · อื่น `null`
- `myStaffIds(ctx, userId)` = `BookingStaff` active ของสาขาที่ `employeeId` = `employeeOfUser(tenantId, userId)?.employeeId` (facade HR) · ไม่มี ⇒ `[]`
- `loadDayCalendar`: เงื่อนไข null เหมือนตัวโหลดจอ · ทุกงานของ `dateStr` ยกเว้น CANCELLED ในคอลัมน์ช่างตาม `plannedStaffId ?? staffId` · เวลา = แผน (walk-in รอ) ไม่งั้น startAt/endAt · `prev/nextDateStr` = ±1 วัน · ไม่มีเบอร์ (อ่านอย่างเดียว · ลากย้าย = ใบหลัง)

#### 3.2.1 ปุ่มต่องาน (`actions`) — ด่านเดียวกับ `authorizeLineOp` (ฟังก์ชันเดียวคิดทั้งสองที่)
`mine` = งานของช่างใน myStaffIds · `own = access.runAny || (access.runOwn && mine)`
| action | สถานะงาน/บัตร | สิทธิ์ |
|---|---|---|
| `call` | ARRIVED/QUEUED · บัตร WAITING/CALLED | `own || operate` |
| `skip` | ARRIVED/QUEUED · บัตร CALLED | `own || operate` |
| `recall` | ARRIVED/QUEUED · บัตร SKIPPED | `own || operate` |
| `start` | ARRIVED/QUEUED | `own` |
| `done` | IN_SERVICE | `own` |
| `move` | BOOKED `assignMode ANY` สถานะ PENDING/CONFIRMED/LATE · WALKIN QUEUED | `runAny || operate` |
| `checkin` | BOOKED CONFIRMED/LATE · ยังไม่เลยเวลาไม่มา (หรือ manualHold) · วันไทยเดียวกับ now | `checkIn` |
| `noshow` | BOOKED LATE หรือ CONFIRMED เลยผ่อนผัน (ยังไม่เช็กอิน) | `runAny || operate` |
| `cancel` | งานใน todo STALE (ARRIVED/QUEUED) | `runAny || operate || can("booking.appointment.reschedule")` |
- `authorizeLineOp`: งานไม่พบ/ข้ามขอบเขต ⇒ `NOT_FOUND` · action ไม่อยู่ใน actions ของงานนั้น ณ now ⇒ `FORBIDDEN` (reason ไทย) · `op="walkin"` + id null ⇒ ตาม `access.walkIn`

### 3.3 «line-ops.ts» + ตัววางคิว (ข้าม #43 · ย้ายช่าง)
```ts
export type JobResult = /* ของ B.4 */ { ok: true } | { ok: false; code: "NOT_FOUND" | "BAD_STATE" | "LOST_RACE" | "BUSY" | "CLASH"; reason: string };
export async function skipJob(ctx: LineCtx, appointmentId: string, opts?: { now?: Date }): Promise<JobResult>;
export async function recallJob(ctx: LineCtx, appointmentId: string, opts?: { now?: Date }): Promise<JobResult>;
export type MoveFail = "NOT_FOUND" | "BAD_STATE" | "LOST_RACE" | "BUSY" | "CLASH" | "FULL" | "ON_LEAVE" | "NOT_QUALIFIED" | "BAD_INPUT";
export async function moveJobStaff(ctx: LineCtx, appointmentId: string, toStaffId: string, opts?: { now?: Date }): Promise<{ ok: true } | { ok: false; code: MoveFail; reason: string }>;
```
- **ข้าม** `skipJob`: งาน ARRIVED/QUEUED ที่บัตร CALLED ⇒ บัตร SKIPPED (`skippedAt = now` · `QueueTicketEvent` action SKIPPED actor STAFF) · สถานะงานคงเดิม · แผนของงานล้าง (`plannedStartAt/StaffId` null) แล้ว runPlanner · บัตรไม่ใช่ CALLED / งานสถานะอื่น ⇒ `BAD_STATE` · ไม่ยิง event ใหม่
- **ความหมายของ "ข้าม" ในตัววางคิว** (planner-run · ไม่แตะ planner.ts): งานที่บัตร SKIPPED = **ไปท้ายแถว** — walk-in: `issuedAt = skippedAt` · นัดที่เช็กอินแล้ว: ส่งเข้า planDay แบบ "มาสายเข้าแถวแบบ walk-in" (`checkedInAt = skippedAt` + policy RELEASE ผ่อนผัน 0) — ยังถูกวาง (ถือช่องจริงตามแผน · walk-in QUEUED เขียน staffId/startAt/endAt ตามแผนเหมือนเดิม ⇒ ไม่มีแถวถือช่องซ้อน) · ใน `TodayLineView` อยู่ `skipped` ไม่อยู่ `waiting` (ข้อสอบ O-1: A009 ถูกวางหลัง A011 · A011 เร็วกว่า 15:25 · ไม่มีซ้อน)
- **เรียกคืน** `recallJob`: บัตร SKIPPED ⇒ CALLED (`callCount + 1` · `calledAt = now` · QueueTicketEvent RECALLED/CALLED) + event `queue.ticket.called` (คีย์ `queue.ticket.called#<ticketId>#<callCount>` เดิมของ B.4) · กลับลำดับเดิม (issuedAt/เวลานัดเดิม) · บัตรไม่ใช่ SKIPPED ⇒ `BAD_STATE`
- **ข้ามเอง** (tick ข้อ 5 ใน `runLineTick` · คืน `skipped` เพิ่มจาก 4 field เดิม): บัตรแถวเดียว (`refType APPOINTMENT`) CALLED ที่ `calledAt + booking.queue.skipAfterMin(สาขา) ≤ now` และงาน ARRIVED/QUEUED ⇒ SKIPPED (actor SYSTEM) · ค่า null ⇒ ไม่ข้ามเอง · UPDATE มีเงื่อนไข (`status='CALLED' AND "callCount"=<ที่อ่าน>`) + SKIP LOCKED ⇒ tick ซ้อน = ครั้งเดียว (X5 · O-3) · หลังข้าม runPlanner ตามข้อ 4 เดิม
- `queue/service.ts`: เพิ่มปลายทาง `"SKIPPED"` ใน `moveTicketTx` (จาก CALLED · ตั้ง `skippedAt`) และให้ `"CALLED"` มาจาก `SKIPPED` ได้ (action RECALLED) — ต้องไม่เปลี่ยนผล `callJob` เดิม (B.4 เรียกบัตร SKIPPED = BAD_STATE ยังคงอยู่ที่ระดับ `callJob`: ตรวจสถานะบัตรก่อนเรียก moveTicketTx) · `issueTicket`/หน่วย QUEUE เดิมไม่เปลี่ยน
- **ย้ายช่าง** `moveJobStaff` (ใต้ `lockUnitTx` → แถวนัด FOR UPDATE · ลำดับตรวจ): งานไม่พบ/ข้ามขอบเขต ⇒ `NOT_FOUND` → ช่างปลายทางไม่ใช่ของสาขา/ไม่ active ⇒ `NOT_FOUND` · ว่าง ⇒ `BAD_INPUT` → ชนิด/สถานะไม่เข้า (§3.2.1 `move`) ⇒ `BAD_STATE` (นัดระบุช่าง · มาแล้ว · กำลังทำ) → ช่างลาวันนั้น ⇒ `ON_LEAVE` · ทำบริการไม่ได้ ⇒ `NOT_QUALIFIED` (`staffServiceTerms`) →
  - นัด (ANY): เวลาเดิม · `endAt = startAt + นาทีของช่างใหม่ + buffer(snapshot)` · ชนแถวถือช่องของช่างใหม่ (กติกาเดียวกับ `rescheduleByShop` + ช่อง J5 ของงานที่มาแล้ว/กำลังทำ) ⇒ `FULL` ไม่เขียน · ผ่าน ⇒ CAS `{ staffId, endAt, assignMode: "SPECIFIC", plannedStaffId/StartAt: null }` · LATE คง LATE · snapshot ไม่เปลี่ยน · `rescheduleCount` ไม่นับ · event `booking.rescheduled` (คีย์ `booking.rescheduled#<id>#<startAt ISO>#<staffId>` · payload `by: "SHOP"`)
  - walk-in QUEUED: CAS `{ staffId: ใหม่, assignMode: "SPECIFIC" }` แล้ว **ใน tx เดียวกัน** `planAndWriteTx` · ถ้าแผนวางงานนี้ไม่ได้วันนี้ ⇒ ถอยทั้ง tx คืน `FULL` · ผ่าน ⇒ staffId/plannedStaffId = ช่างใหม่ · event `booking.rescheduled` เหมือนนัด
  - หลัง commit runPlanner · ไม่มีแถวถือช่องซ้อน (O-4 ไล่ทุกช่าง)

### 3.4 หนี้ที่ใบนี้ปิด
- (ก) **ถอย ARRIVED** (`setAppointmentStatus` · b4.md): ARRIVED → CONFIRMED/PENDING ⇒ ใน CAS เดียวกัน `checkedInAt = null` · `queueTicketId = null` + บัตรเดิม (ถ้ายัง active) → CANCELLED (`cancelReason STAFF` · QueueTicketEvent) ใน tx เดียว · เช็กอินใหม่ได้บัตรใหม่ (O-6) · ร้านเดิม (ไม่มีบัตร) ผลเดิม
- (ข) **นัด manualHold ข้ามเที่ยงคืน**: `checkIn` นัดของวันไทยก่อนหน้าที่ `policySnapshot.job.manualHold = true` (ร้านถอยไม่มาเอง) ⇒ เช็กอินได้ (ไม่ `NOT_TODAY`/`TOO_LATE`) · ตัวควบคุม: นัดเมื่อวานที่ไม่ถอยและเลยเวลาไม่มา ยังเป็น `TOO_LATE` (O-7/O-7c)
- (ค) **WARN ผิดเรื่อง** (`src/lib/actions/booking.ts` ~บรรทัด 128 · หนี้ B.3): `logOps("WARN", "pos.deposit.forfeit_failed", …)` ยิงเฉพาะเมื่อผลมี `forfeit` (`"forfeit" in st`) — ล้มเพราะแพ้ CAS/ปลุกนัดชน/ไม่พบนัด/คืนบิลริบไม่ได้ ⇒ ไม่ log ว่าริบล้ม (S-6) · ส่วนอื่นของไฟล์ห้ามแตะ (B.11 แก้ทั้งไฟล์ — ลดชน)
- (ง) **หน้า /queue ยอมหน่วย BOOKING**: หน่วย BOOKING ที่เปิดแถวเดียว ⇒ `redirect("/app/u/<slug>/booking")` (จอคิวของหน่วยนี้คือจอแถวเดียว) · BOOKING ไม่เปิด / ชนิดอื่น ⇒ `notFound()` เหมือนเดิม · หน่วย QUEUE เดิมทุกไบต์ (H-5)
- (จ) **action คิวเดิมแตะบัตรแถวเดียวได้** (รูรั่วจาก B.4): เพิ่ม `ticketCtxOf(unitSlug, action)` = `ctxOf` + `unit.type !== "QUEUE"` ⇒ `notFound()` · ใช้ใน `issueTicketAction` `callNextAction` `recallSkippedAction` `transferAction` และ `opById` (recall/skip/serve/done/cancel) · action ตั้งค่า (ประเภท/ช่อง/จอ) ใช้ `ctxOf` เดิม (B.6 ใช้ display) (S-5)
- (ฉ) **"งานของตัวเอง"** (`booking.job.run` · หนี้ใน B.11 §11): ตรวจด้วย `myStaffIds` ใน `authorizeLineOp` (A-6)

### 3.5 «src/lib/actions/booking-line.ts» (`"use server"` · export async function เท่านั้น)
`callJobAction` `recallJobAction` `skipJobAction` `startJobAction` `completeJobAction` `moveJobStaffAction` `checkInAction` `noShowAction` `walkInAction` (+ `cancelJobAction` ถ้าทำ todo STALE) — ทุกตัว `(unitSlug: string, formData: FormData)`:
1. `requireUnit(unitSlug)` → `lineAccess(<membership ของ auth.active>, unit.id)` → **`authorizeLineOp(ctx, { userId: auth.user.id, access }, op, appointmentId, { now })` ก่อนเรียก facade** (S-3 ไล่ลำดับ requireUnit < authorizeLineOp < facade ต่อฟังก์ชัน) → facade ด้วย ctx `{ tenantId, unitId, actorUserId: auth.user.id }`
2. facade: call=`callJob` · recall=`recallJob` · skip=`skipJob` · start=`startJob` · done=`completeJob` · move=`moveJobStaff(toStaffId)` · checkin=`checkIn({appointmentId},{via:"STAFF"})` · noshow=`setAppointmentStatus(…,"NO_SHOW",{actorUserId})` · walkin=`createWalkIn({serviceId, staffId|null, channel:"STAFF", customerName?, customerPhone?})` · cancel=`cancelByShop`
3. ผล `ok:false` / FORBIDDEN ⇒ `redirect(<หน้าเดิม>?err=<reason ≤300>)` (แบบจอเดิม) · สำเร็จ ⇒ `scheduleDrain()` + `revalidatePath` ของ `/booking` · `/booking/mine` · `/booking/day`
4. **นาฬิกา QC**: อ่านฟิลด์ `at` จากฟอร์ม **เฉพาะเมื่อ `process.env.SVC_QC_CLOCK === "1"`** ⇒ `now = new Date(at)` (ใช้กับทั้ง authorizeLineOp และ facade) · ไม่ตั้ง = นาฬิกาจริงเสมอ (S-3)

### 3.6 หน้า
- `booking/page.tsx`: `requireUnit` → `access = lineAccess(...)` → `now` (QC: `?at=` เฉพาะ `SVC_QC_CLOCK=1` · S-4) → `loadTodayLine` → `null` และหน่วยไม่เปิดแถวเดียว ⇒ **จอเดิมทั้งก้อนตามเดิม** (B.11 อาจแก้จอเดิมให้ซ่อนเบอร์ — ผู้คุม merge ภายหลังรวมให้) · เปิดแถวเดียวแต่ `!access.view` ⇒ `notFound()` · ได้ view ⇒ `<AutoRefresh />` (ตัวเดิม `src/components/queue-auto-refresh.tsx`) + `<TodayLine view unitSlug actions at? />` (actions = server actions ของ §3.5 bind unitSlug · `at` ส่งเฉพาะโหมด QC)
- `booking/mine/page.tsx`: เหมือนกันแต่ `<MyQueue>` (มือถือ 390 · ไม่มี view ⇒ notFound) · `booking/day/page.tsx`: `?date=` (ไม่ส่ง/ผิดรูป = วันนี้ไทย) → `loadDayCalendar` → null ⇒ notFound → `<DayCalendar>`
- `layout.tsx`: หน่วยแถวเดียว ⇒ แท็บ "คิววันนี้" (`/booking`) · "ปฏิทินนัด" (`/booking/day`) · "ของฉัน" (`/booking/mine`) + แท็บเดิม · ร้านเดิม = แท็บเดิมทุกตัว · ความกว้าง: จอแถวเดียว (ราก `data-booking-wide`) ต้องไม่ถูกบีบ `max-w-2xl` (เช่น `has-[[data-booking-wide]]:max-w-none` · Tailwind 4) — หน้าย่อยอื่นคงกว้างเดิม · **390 px ต้องไม่ล้นแนวนอนทั้งหน้า** (ตารางช่างเลื่อนภายในกล่อง `overflow-x-auto`) — visual-svc ตรวจ

## 4. สัญญา DOM (ข้อสอบ U/H/E · คอมโพเนนต์ default export · props `{ view, unitSlug, actions, at? }` · `actions` = `Record<"call"|"recall"|"skip"|"start"|"done"|"move"|"checkin"|"noshow"|"cancel"|"walkin", (fd: FormData) => Promise<void>>`)
- คอมโพเนนต์ **ห้าม import ค่า** จาก `@/lib/modules/**`/`@/lib/core/db`/`@prisma/client` (ใช้ `import type` ได้) — import ได้: react · `next/*` · `@/components/**` · `@/lib/ui/**` · ไฟล์ข้าง ๆ (U-0)
- **TodayLine**: ราก `data-today-line` + `data-booking-wide` · การ์ดบน `data-line-kpi="booked|walkin|waiting|done"` · แถวช่าง `data-line-staff="<staffId>"` (ลำดับ = view.staff) · บล็อก `data-line-block="<appointmentId>" data-look="<look>"` (ครบทุกบล็อกใน view) · เส้นตอนนี้ `data-now-line` · แถวรอ `data-line-wait="<appointmentId>"` (ลำดับ = view.waiting) · ข้ามแล้ว (ส่วนแยก) · กล่องทำไม `data-line-why="<appointmentId>"` (ข้อความ why เต็ม) · การ์ด "ต้องจัดการ" `data-line-todo="<appointmentId>"` (+ ปุ่มโทรหา `href="tel:<phone>"` เฉพาะ phone ไม่ null)
- **ปุ่ม ⇔ actions (U-2 ตรวจสองทาง)**: ทุก action ของทุกงาน (waiting · inService · skipped) และทุก todo มีปุ่ม `<button data-line-action="<a>" data-appointment-id="<id>">` **อยู่ใน `<form action={actions[a]}>` ที่มี `<input type="hidden" name="appointmentId" value="<id>">`** · `noshow`/`cancel` = `ConfirmDialog` เดิม `testId="line-<a>-<id>"` (trigger `data-testid="line-<a>-<id>-trigger"` · ปุ่มยืนยันในชีต `button[type=submit]`) · **ห้ามมีปุ่ม data-line-action ที่ไม่อยู่ใน actions ของงานนั้น** · ย้ายช่าง: `<form data-line-move="<id>">` มี `<select name="toStaffId">` (ช่างอื่นของสาขา) + ปุ่ม `data-line-action="move"` (อยู่ใน `<details>` ได้ — ข้อสอบเปิดเอง) · walk-in: `<form data-line-walkin-form>` (ใน `<details>` ได้) มี `<select name="serviceId">` + `<select name="staffId">` (option `value=""` = "ใครก็ได้") + `button[type=submit]` (data-line-action="walkin" ได้) — แสดงเฉพาะ `view.walkInForm`
- โหมด QC (`at` prop): **ทุกฟอร์ม** ของปุ่มและฟอร์ม walk-in มี `<input type="hidden" name="at" value="<at>">` · ไม่ส่ง prop = ห้ามมี input `at` (U-6)
- **MyQueue** (มือถือ): ราก `data-my-queue` · `data-my-current` (งานกำลังทำของฉัน + ปุ่ม done) · `data-my-next` (แถวรอของฉัน `data-line-wait` ตามลำดับ + ปุ่มตาม actions) · `data-my-line` (แถวรวมทั้งร้าน `data-line-wait` ตามลำดับ view.waiting — ปุ่มได้เฉพาะที่อยู่ใน actions) · ไม่มีเบอร์
- **DayCalendar**: ราก `data-day-calendar` · คอลัมน์ `data-cal-staff="<staffId>"` · บล็อก `data-cal-block="<appointmentId>"` · ลิงก์ `<a data-cal-prev href="…?date=<prev>">` `<a data-cal-next href="…?date=<next>">`
- หน้าตาเทียบภาพ 01: หัว "คิววันนี้ · <วัน>" + บรรทัดเวลาเปิด/ช่าง/เก้าอี้ · ปุ่ม จอทีวี (B.6 — แสดงแบบปิดใช้พร้อม title ได้) · จองให้ลูกค้า (ลิงก์หน้าจองสาธารณะเดิม) · + รับ walk-in · การ์ด 4 ใบ · คำอธิบายสัญลักษณ์ · ตารางช่างแนวนอน (กำลังทำ=ดำ · นัดมาแล้ว=กรอบทึบ · ยังไม่มา=กรอบประ · walk-in ระบบวาง=เทา+กรอบฟ้า · ไม่มา=ประแดง) + เส้นตอนนี้ฟ้า · การ์ด "ต้องจัดการ" 2 คอลัมน์ · ขวา: แถวรอแถวเดียว + กล่องทำไม (พื้นฟ้า) + การ์ด "เชื่อมกับระบบอื่น" (แสดงเท่าที่มีข้อมูล · ไม่ทดสอบ)

## 5. ฉากภาพ «scripts/svc-qc-today-line-scene.mts» (builder · แบบ `svc-qc-utility-scene.mts`)
- ด่าน `loadSvcQcEnv` · อ่านจาก `SQC_TODAY_LINE_SCENE` + `SQC` + `SQC_LINE_SCENE_DAY` เท่านั้น (ห้ามฮาร์ดโค้ดซ้ำ) · ร้าน svcqc หน่วย barber
- ทำ: แม่แบบ BARBER (`applyTemplate` KEEP_CUSTOM ในนามเจ้าของ svcqc) · `hrLink`: `AppSystem` HR id `svcqc-scene-hr` + `HrEmployee` id `svcqc-scene-emp-ek` (`linkedUserId = svcqc-user-ek`) + `BookingStaff(ช่างเอก).employeeId` · ฉากตามลำดับเดียวกับข้อสอบ F-0 (ดูโค้ด F-0 ใน «qc-svc-b.5.mts» — ตัวอ้างอิงที่เขียวแล้ว): `bookings` (bookAppointment STAFF · `idempotencyKey = "svcqc-line-<วันฉาก>-<key>"` · PENDING ⇒ CONFIRMED) → `events` ตามเวลา (`now` ฉีด = วันฉาก + at · tick ส่ง `tenantIds:[svcqc]`) → `runPlanner` ณ 14:20
- idempotent: นัดของฉาก (idempotencyKey ขึ้นต้น `svcqc-line-`) มีครบตามวันฉาก ⇒ ไม่ทำอะไร (0/0/0) · วันฉากเปลี่ยน/ไม่ครบ ⇒ ลบงาน+บัตร+ลำดับเลขบัตรของหน่วย barber ในวันฉากเดิม/ใหม่ (เฉพาะ refType APPOINTMENT ของงานฉาก) แล้วสร้างใหม่ทั้งชุด (นับ created/removed) · `--clear` ลบทั้งฉาก + คืน `employeeId` ของช่างเอก + ลบ HR ของฉาก (ไม่ลบค่าตั้งแม่แบบ)
- พิมพ์บรรทัดท้าย `SCENE_SUMMARY {"created":n,"updated":n,"removed":n}` · รันซ้ำ = 0/0/0 (Q-3) · ผล ณ 14:20 = `SQC_TODAY_LINE_SCENE.expect` (Q-2)
- ภาพ (ผู้คุม): reseed → ฉาก → QC server เปิดด้วย `SVC_QC_CLOCK=1` → `visual-svc b.5 --user owner|ek|cashier` → PARITY `booking-today-line-desktop` เทียบ `01-today-line.png`

## 6. จุดที่แบบไม่ชัด — ผู้เขียนข้อสอบเลือกแล้ว (ผู้คุมเคาะได้ · เปลี่ยน = ORACLE-EDIT)
1. **สิทธิ์ตามตาราง B.11 (ภาพ 14)**: ช่าง (PROVIDER) = `job.run` ⇒ เรียก/ข้าม/เริ่ม/เสร็จ **งานของตัวเอง** · หัวหน้า (LEAD) = `queue.operate`/`job.runAny` ⇒ งานทุกคน + ย้ายช่าง + ไม่มา · แคชเชียร์ = `checkin` + `walkin.create` ⇒ **ไม่มีเรียก/เริ่ม/เสร็จ** (ตรงเกณฑ์ MASTER-PLAN) · `booking.appointment.setStatus` เดิม = ดูได้อย่างเดียวบนจอใหม่ (ร้านเดิมยังใช้จอเดิมได้) · เบอร์เต็ม = `booking.customer.phoneFull` (คีย์ B.11 · ช่างไม่มี)
2. **ผูกช่าง↔ผู้ใช้** ผ่าน HR (`BookingStaff.employeeId` → `HrEmployee.linkedUserId`) ด้วย facade `employeeOfUser` — ช่างที่ไม่ผูก HR ⇒ ไม่มี "ของฉัน" (job.run ไม่ได้ปุ่มใด ๆ · ไม่เดา)
3. **แผนบนจอคิดสด** (planDay ณ now · ไม่ล็อก ไม่เขียน) — แคช `plannedStartAt` ใช้กับบัตร/ETA (B.4) · จอจึงตรงนาฬิกาเสมอแม้ tick ยังไม่รัน
4. **ข้าม = ไปท้ายแถว** (ไม่ใช่ถอดออกจากแผน) — ไม่ให้ walk-in ที่ข้ามแล้วค้างถือช่องเดิมซ้อนกับคนที่ขึ้นแทน · เรียกคืน = เรียกอีกครั้ง (callCount+1) และกลับลำดับเดิม · ข้ามเองหลัง `skipAfterMin` (#43) อยู่ใน tick เดิม (ไม่เพิ่ม minute-job)
5. **ย้ายช่าง** ได้เฉพาะนัด "ใครก็ได้" ที่ยังไม่เช็กอิน + walk-in ที่รอ (b4 §7) · ย้ายแล้วเป็น `SPECIFIC` (ร้านเลือกเอง — ตัววางคิวไม่ย้ายกลับ) · นัดระบุช่าง ⇒ ใช้เลื่อนนัด (ใบหลัง) · ไม่มี event ใหม่ (ใช้ `booking.rescheduled`)
6. **KPI "กำลังรอในร้าน" = ARRIVED + QUEUED** (ฉาก = 4: P006 + A009 A010 A011) — ภาพเขียน "3 คน" (นับเฉพาะ walk-in) · ยึดความหมาย "อยู่ในร้าน" · "ไม่มา" = LATE + NO_SHOW (ภาพ: คุณต่อปล่อยช่องแล้ว = ไม่มา 1) · "รอเฉลี่ย walk-in" ในภาพไม่บังคับ
7. **ฉากต่างจากภาพโดยตั้งใจ**: คุณต่อ = โกน/แต่งหนวด 20 นาที (ตัดผม 45 จะชน P006 14:45 ในฐาน) · ฉากใช้วันเสาร์ ≥ วันนี้+3 (อนาคตเสมอ) แทน 31 ต.ค. จริง · ภาพถ่ายผ่าน `?at=` (นาฬิกา QC)
8. **นาฬิกา QC** `?at=` / ฟิลด์ `at` = **เฉพาะ `SVC_QC_CLOCK=1`** (prod ไม่ตั้ง ⇒ ไม่มีผล) — จำเป็นเพราะภาพ 01 คือ 14:20 และ server action ต้องใช้เวลาเดียวกับจอ
9. "ต้องจัดการ" SOON = 60 นาที (ค่าคงที่ — ภาพ: บีม 55 นาที อยู่ · แพรว 70 นาที ไม่อยู่) · STALE = งานค้างข้ามวัน (หนี้ B.4)
10. ปฏิทินรายวัน = อ่านอย่างเดียว (ลาก/คลิกจอง = B2 ตามแบบ R6)
11. หน้า /queue ของหน่วย BOOKING = redirect (ไม่ใช่วาดกระดานคิวเดิม — action คิวเดิมจะข้ามเครื่องสถานะงาน)

## 7. เกณฑ์รับ
- «scripts/qc-svc-b.5.mts» เขียวทุกข้อ — หมวด: **T/F** แม่แบบ+ฉากผ่าน facade · **C0** ตัวควบคุม · **P** คีย์+lineAccess · **L** ตัวโหลด (หัวจอ · บล็อก · แถวรอ · ทำไม · ต้องจัดการ · KPI · ปฏิทิน) · **A** ปุ่มต่อบทบาท (เจ้าของ · ช่างแจ๊ค · แคชเชียร์ · หัวหน้า) + ไม่มีเบอร์ + authorizeLineOp + myStaffIds · **U** DOM · **H** server จริง · **E** ปุ่มทุกปุ่มเปลี่ยนฐานจริง (browser) · **O** ข้าม/เรียกคืน/ข้ามเอง/ย้ายช่าง/หนี้ B.4/X1 · **S** ไฟล์+สัญญาโค้ด · **Q** ฉาก svcqc · **V** ภาพ · **G** regression · **Z**
- regression (G): `qc-svc-b.4 --no-regression` (ไม่มี FAIL · SKIP เฉพาะ G-*/ST-1) · `qc-svc-b.3` (`SVC_B3_NO_REGRESSION=1`) · `qc-svc-b.2` · `qc-booking-race` · `qc-booking-deposit` · `qc-booking-edit-schedule` · `qc-queue-public` · `qc-systems` (บรรทัด Queue ✅) · `qc-svc-r0.2` (หลัง reseed) · `qc-svc-smoke`
- typecheck + fitness 2 โหมด (ผู้คุม) · ตรวจรอบเดียว · build QC + ภาพ 1 ใบต่อจอ (`booking-today-line` desktop = PARITY ภาพ 01 · mine 390 · day)
- ข้อสอบตรวจตัวเองแล้ว 29 ต.ค. (โค้ด f62daaf8 · 71 ข้อ · log `/tmp/svc-b5-oracle-2.log`): **เขียวอยู่แล้วและต้องเขียวต่อ 9 ข้อ** = T-0 · F-0 (ฉากภาพ 01 ทั้งวันสร้างได้ด้วย facade ของ B.3/B.4) · C0-1 (เลขบัตร P001–P006/A001–A011) · C0-2 (runPlanner 14:20 = ตัวเลขภาพ: A009 แจ๊ค 14:40 · A010 นุ่น 15:00 · A011 แจ๊ค 15:25 · คุณบีมที่ช่างเอก) · C0-3 (ตัวช่วย DOM/เบอร์ของข้อสอบ) · O-7c · Z-1 · S-2 · S-9 · **แดง 42 ข้อ** เพราะยังไม่มี `line-access.ts`/`today-line.ts`/`line-ops.ts`/คอมโพเนนต์/หน้า/action/คีย์สิทธิ์/ฉาก + หนี้ 3 ข้อแดงด้วยพฤติกรรมเดิมจริง (O-6 ถอยแล้ว checkedInAt/บัตรค้าง · O-7 เช็กอินนัด manualHold หลังเที่ยงคืนได้ TOO_LATE · S-6 WARN ใต้ `!("unforfeit" in st)`) · SKIP 20 = H-1…6 · E-1 · V-1…3 (ไม่มี QC_BASE) · G-1…10 (ยังไม่มีงาน)

## 8. ไม่ใช่เรื่องของใบนี้ / หนี้ส่งต่อ
- ตู้/ทีวี/หน้าบัตร = B.6 (ปุ่ม "จอทีวี" แค่ที่วาง) · LINE เตือน/ถึงคิว = B.9 · เสร็จ → บิลพัก POS = B.10 (ปุ่ม done ยังเป็น `completeJob`) · ตั้งค่า/ชุดสิทธิ์ = B.11 · ลาก/คลิกจองในปฏิทิน + เลื่อนนัดระบุช่างบนจอ = B2/ใบหลัง · ทรัพยากร (เก้าอี้/เตียง) = B.13
- partial unique บัตร active ต่อนัด (หนี้ B.4 §6 ข้อ 1) — migration ถัดไป
- **ประสานกับ B.11 (เลน l3)**: ทั้งสองใบแตะ `permissions.ts` · `booking/page.tsx` · `actions/booking.ts` · `svc-qc-data.mts` — ผู้คุม merge ใบที่สองแก้ชนเอง (B.11 merge ก่อน ⇒ builder B.5 reset ที่ tip ใหม่ · ไม่ต้องเพิ่มคีย์ · ใช้ `maskPhone`/`phoneForViewer` ของ B.11 ในจอเดิม)

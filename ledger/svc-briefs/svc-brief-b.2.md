# ใบสั่ง B.2 — ตัววางคิว `planDay` (pure) · ตรวจ: เข้ม (ตัวจัดคิว) + perf

> อ้างอิง: MASTER-PLAN แถว B.2 · `DESIGN-BOOKING-QUEUE.md` §4.1 §4.2 §4.4 + ภาคผนวก ก #8 #9 #13 #27–29 #38–41 #45 · ภาพ `design-booking/01-today-line.png` (+ 04 ตู้ · 06 บัตรลูกค้า สำหรับตัวเลขที่ตรงกัน) · CC §1.6 (snapshot ชนะค่าตั้ง)
> ข้อสอบ: «scripts/qc-svc-b.2.mts» (ไม่ต้องมี DB) · รัน: `bash scripts/iso.sh pnpm exec tsx scripts/qc-svc-b.2.mts`

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ (แตะได้เท่านี้)
- «src/lib/modules/booking/planner.ts» (ใหม่ · ไฟล์เดียว · แยกไฟล์ช่วยภายใน `planner-*.ts` ได้ถ้าจำเป็น แต่ต้อง pure เหมือนกัน)
- ห้ามแตะ: `service.ts` `slots.ts` `index.ts` (facade) · schema · ค่าตั้ง (defs เป็นของ B.0) · ข้อสอบ
- ตัวห่อ «planner-run.ts» (advisory lock · อ่าน DB · เขียนแคช `plannedStaffId/plannedStartAt` · `QueueTicket.etaAt`) = **ใบ B.4 ไม่ใช่ใบนี้**

## 2. ความบริสุทธิ์ (ข้อสอบสแกนซอร์ส — ละเมิด = แดง)
- import ได้เฉพาะไฟล์ pure: ไฟล์ข้างเคียง `./planner-*` หรือ `@/lib/core/quiet-hours` (ถ้าจะใช้จัดรูปเวลา) — **ห้าม** `@prisma/*` · `@/lib/db*` · `next/*` · `server-only` · `"use server"` · โมดูลใดที่ลากถึง prisma
- ห้าม `Date.now()` · `new Date()` ไม่มีอาร์กิวเมนต์ · `Math.random` — เวลาปัจจุบันมาจาก `input.now` เท่านั้น
- ห้ามแก้ object ที่รับเข้ามา (ข้อสอบ deep-freeze input) · ผลต้อง deterministic และ **ไม่ขึ้นกับลำดับ array** ที่ส่งมา (ข้อสอบสลับลำดับ jobs/staff)
- ไม่มี `any` · TypeScript strict

## 3. สัญญา (ข้อสอบมีสำเนาชนิดนี้ — ชื่อ field ต้องตรง)
เวลาเป็น **epoch ms (number)** ทั้งหมด · นาทีเป็น number · ไม่ปัดเวลา (UI ปัดเอง)

```ts
export type PlanJobStatus = "PENDING"|"CONFIRMED"|"ARRIVED"|"QUEUED"|"IN_SERVICE"|"LATE"|"DONE"|"NO_SHOW"|"CANCELLED";

export type PlanSettings = {            // ตัวห่อ (B.4) อ่านด้วย resolveSettings แล้วส่งมา — planner ไม่อ่านค่าตั้งเอง
  queueOrder: "SINGLE_LINE" | "APPOINTMENT_FIRST"; // #38 แถวเดียวตามเวลา | นัดก่อนเสมอ
  backfill: boolean;                    // #39 walk-in แทรกช่องเล็ก
  safetyBeforeBookingMin: number;       // #40 เผื่อก่อนนัดถัดไป
  graceMin: number;                     // #27
  noShowAfterMin: number;               // #29
  lateAction: "RELEASE" | "HOLD";       // #28 ปล่อยช่อง+ต่อคิวท้าย | รอต่อ (คลินิก)
  priorityEnabled: boolean;             // #45 สิทธิ์คิวก่อน
  walkInMaxWaitMin: number;             // #41 ใช้ใน quoteWalkIn เท่านั้น
  overrunExtendMin: number;             // §4.2 "เลยแล้ว = ยืดถึงตอนนี้+5" (ไม่มีในภาคผนวก — ค่าคงที่ 5 จนกว่า B.0 จะนิยาม)
  minBreakMin: number;                  // #9 ระดับสาขา (ทับรายช่างด้วย PlanStaff.minBreakMin)
  maxJobsPerDay: number | null;         // #8 ระดับสาขา (ทับรายช่าง) · null = ไม่จำกัด
};
export type PlanStaff = {
  id: string; name: string; sortOrder: number;
  windows: { startAt: number; endAt: number }[];   // หน้าต่างทำงานวันนี้ หัก ลา/ปิดแล้ว (B.1 คำนวณ) · [] = ไม่ทำงาน
  services: { serviceId: string; durationMin?: number }[] | null; // null = ทำทุกบริการ · durationMin = เวลาเฉพาะคน
  minBreakMin?: number; maxJobsPerDay?: number | null;
};
export type PlanService = { id: string; name: string; durationMin: number; bufferAfterMin: number }; // #12 #13
export type PlanJob = {
  id: string; label: string; kind: "BOOKED" | "WALKIN"; status: PlanJobStatus;
  serviceId: string; durationMin?: number;       // ระบุ = ชนะทุกชั้น (งานรวมหลายบริการ)
  assignMode: "SPECIFIC" | "ANY";
  staffId: string | null;     // BOOKED: ช่างที่นัด/ที่ระบบวางไว้ · WALKIN: ช่างที่ขอ (SPECIFIC) หรือ null · IN_SERVICE: ช่างที่ทำอยู่
  startAt: number | null;     // BOOKED = เวลานัด (ล็อก) · WALKIN = null
  issuedAt: number;           // เวลาออกบัตร/จอง (ลำดับ walk-in)
  checkedInAt: number | null; startedAt: number | null;
  priority: boolean;          // สิทธิ์คิวก่อน (มีผลเมื่อ priorityEnabled)
  policy?: { graceMin?: number; noShowAfterMin?: number; lateAction?: "RELEASE" | "HOLD" }; // จาก policySnapshot — ชนะ settings
};
export type PlanInput = { now: number; settings: PlanSettings; staff: PlanStaff[]; services: PlanService[]; jobs: PlanJob[] };

export type PlanState = "IN_SERVICE" | "SCHEDULED" | "RELEASED_LATE" | "NO_SHOW_DUE" | "UNPLACED";
export type PlanReason =
  | "IN_SERVICE" | "IN_SERVICE_OVERRUN"
  | "BOOKED_ON_TIME" | "BOOKED_DELAYED" | "BOOKED_MOVED_STAFF" | "BOOKED_EARLY" | "STAFF_UNAVAILABLE"
  | "WALKIN_EARLIEST" | "WALKIN_GAP_BEFORE_BOOKING" | "WALKIN_REQUESTED_STAFF" | "LATE_ARRIVAL_AS_WALKIN"
  | "LATE_RELEASED" | "NO_SHOW_DUE" | "NO_SLOT_TODAY";
export type WhyCandidate = {
  staffId: string;
  verdict: "CHOSEN" | "LATER" | "NO_FIT" | "NOT_QUALIFIED" | "NOT_REQUESTED" | "MAX_JOBS";
  earliestFitAt: number | null;
  blockedGap: { freeAt: number; nextBookingAt: number } | null;
};
export type WhyInfo = { candidates: WhyCandidate[]; text: string };
export type PlannedJob = {
  jobId: string; kind: "BOOKED" | "WALKIN"; staffId: string | null;
  startAt: number | null; endAt: number | null; state: PlanState; reason: PlanReason;
  late: boolean; waitMin: number | null; etaPlusMinusMin: number; why: WhyInfo | null;
};
export type Plan = { now: number; jobs: PlannedJob[]; line: string[] };

export function planDay(input: PlanInput): Plan;
export function quoteWalkIn(input: PlanInput, req: { serviceId: string; staffId?: string | null; priority?: boolean }):
  { staffId: string | null; startAt: number | null; endAt: number | null; waitMin: number | null; closed: boolean; why: WhyInfo | null };
```

## 4. กติกา (ลำดับการคำนวณ)
**ตัวช่วย**: `dur(job, staff)` = `job.durationMin` ?? `staff.services[serviceId].durationMin` ?? `service.durationMin` · `gap(job, staff)` = `max(service.bufferAfterMin, staff.minBreakMin ?? settings.minBreakMin)` · `eff(job)` = settings ทับด้วย `job.policy` (snapshot ชนะ) · ทำได้ (qualified) = `services === null` หรือมี serviceId · "อยู่ในหน้าต่าง" = `[s, s+dur)` อยู่ใน window เดียว

1. **ไม่อยู่ในผล**: DONE · NO_SHOW · CANCELLED (ไม่กินเวลาช่าง · แต่ DONE/IN_SERVICE นับใน maxJobsPerDay)
2. **IN_SERVICE**: ช่าง = staffId · `endAt = startedAt + dur` · ถ้า `≤ now` ⇒ `endAt = now + overrunExtendMin` reason `IN_SERVICE_OVERRUN` (ไม่งั้น `IN_SERVICE`)
3. **BOOKED ยังไม่เริ่ม** (PENDING/CONFIRMED/ARRIVED/LATE): `arrived = checkedInAt≠null || status=ARRIVED`
   - ไม่มา และ `now ≥ startAt + eff.noShowAfterMin` ⇒ `NO_SHOW_DUE` (ไม่กินเวลา)
   - ไม่มา และ (`status=LATE` หรือ `now ≥ startAt + eff.graceMin`) ⇒ `late=true` · RELEASE ⇒ `RELEASED_LATE`/`LATE_RELEASED` (ปล่อยช่อง) · HOLD ⇒ ถือช่องเดิมต่อ
   - มาแล้วแต่ `checkedInAt ≥ startAt + eff.graceMin` และ RELEASE ⇒ **เข้าแถวแบบ walk-in** (ลำดับ = checkedInAt · SPECIFIC ขอช่างเดิม · ANY ใครก็ได้) reason `LATE_ARRIVAL_AS_WALKIN`
   - ที่เหลือ = ล็อกเวลา: ต่อช่าง เรียงตาม startAt · `start = max(startAt, จบงานก่อนหน้าบนช่างนั้น)` (ไม่บวก gap ระหว่างนัด — เชื่อ slots) · `=startAt` ⇒ `BOOKED_ON_TIME` · มากกว่า ⇒ `BOOKED_DELAYED` (เกิดได้จากงานเลยเวลาเท่านั้น) · ช่างไม่มีหน้าต่างครอบ ⇒ `STAFF_UNAVAILABLE` (เวลาเดิม ช่างเดิม)
   - **ANY ที่ยังไม่เช็กอิน** (กติกา 1): ถ้าช่างเดิมทำตรงเวลาไม่ได้ (เลยเวลา/ไม่มีหน้าต่าง/ทำไม่ได้) ⇒ ย้ายไปช่างที่ทำได้ ว่าง `[startAt, startAt+dur)` ทั้งช่วงและอยู่ในหน้าต่าง เลือกตาม `sortOrder` แล้ว `id` · **เวลาไม่เปลี่ยน** · reason `BOOKED_MOVED_STAFF` · ไม่มีใครว่าง = อยู่ช่างเดิม (DELAYED/UNAVAILABLE) · ANY ที่เช็กอินแล้ว ไม่ย้าย
   - **APPOINTMENT_FIRST เท่านั้น**: นัดที่ **มาแล้ว** ดึงขึ้นเร็วได้บนช่างเดิม = จุดลงได้เร็วสุด (กติกาเดียวกับ walk-in ข้อ 4) ที่ `≥ now` และ `< startAt` ⇒ reason `BOOKED_EARLY` · ทำก่อนวาง walk-in ทุกใบ · SINGLE_LINE ไม่ดึง (ภาพ 01: P006 เช็กอิน 14:12 ยังรอ 14:45 ทั้งที่ช่างบอยว่าง 14:36)
   - การวาง walk-in **ห้ามทำให้นัดใดเปลี่ยน** (ข้อสอบเทียบผลมี/ไม่มี walk-in) · maxJobsPerDay ไม่ใช้กับนัด (นัดที่รับแล้วไม่ถูกปฏิเสธ)
4. **walk-in** (WALKIN ที่ QUEUED/ARRIVED + มาสายแบบข้อ 3): เรียงลำดับ = (`priority && priorityEnabled` ก่อน) → เวลาเรียง (issuedAt หรือ checkedInAt) → id · วางทีละใบ **ใบก่อนวางก่อน แล้วไม่ถูกขยับ** (= backfill ไม่ทำให้ใบก่อนช้า)
   - ช่างที่เป็นผู้สมัคร: SPECIFIC = ช่างที่ขอเท่านั้น · ANY = ทุกช่างที่ทำได้ · ตัดช่างที่ถึง maxJobsPerDay (นับ DONE + IN_SERVICE + งานที่วางแล้วบนช่างนั้นทั้งนัดและ walk-in)
   - ลงที่เวลา `t` บนช่าง s ได้ถ้า: `t ≥ now` · อยู่ในหน้าต่าง · `t ≥ จบงานก่อนหน้า + gap(งานก่อนหน้า)` · งานถัดไปบน s เริ่ม n: ถ้าเป็นนัด (BOOKED) ⇒ `t + dur + gap ≤ n − safetyBeforeBookingMin` · ถ้าเป็น walk-in ⇒ `t + dur + gap ≤ n` · ค้นแบบต่อเนื่อง (จุดเริ่มช่อง = max(now, ต้นหน้าต่าง, จบก่อนหน้า+gap)) **ไม่ปัดเป็นช่วง 15 นาที**
   - `backfill=false` ⇒ เพิ่ม `t ≥ start` ของทุก walk-in ใบก่อนที่เป็น ANY หรือขอช่าง s คนเดียวกัน (ใบที่ขอช่างคนอื่นไม่ขวาง)
   - เลือก t เร็วสุด · เท่ากัน ⇒ `sortOrder` แล้ว `id` · ไม่มีที่ลงวันนี้ ⇒ `UNPLACED`/`NO_SLOT_TODAY`
   - reason (ลำดับความสำคัญ): มาสาย ⇒ `LATE_ARRIVAL_AS_WALKIN` · SPECIFIC ⇒ `WALKIN_REQUESTED_STAFF` · งานถัดไปบนช่างเป็นนัด ⇒ `WALKIN_GAP_BEFORE_BOOKING` · อื่น ⇒ `WALKIN_EARLIEST`
   - ในกติกาเผื่อ งาน `LATE_ARRIVAL_AS_WALKIN` นับเป็น walk-in (ไม่ใช่นัด) · งาน `BOOKED_EARLY` นับเป็นนัด
5. **why** (เฉพาะ walk-in ที่วางได้ · คิด ณ ตอนวางใบนั้น): candidates = ช่างทุกคนใน input · `earliestFitAt` = จุดลงเร็วสุดของช่างนั้น · `blockedGap` = **ช่องแรก** ที่ `freeAt ≥ now`, งานถัดไปเป็นนัด, ลงไม่ได้เพราะกติกาเผื่อ, ยาว `nextBookingAt − freeAt ≥ 10 นาที` (ช่องสั้นกว่านี้ไม่นับว่า "ว่าง" — ทำให้ตรงภาพ: ช่างบอยช่อง 14:36–14:45 ไม่ถูกพูดถึง) และอยู่ก่อน earliestFitAt
   - `text` (ไทย · เวลา HH:MM กรุงเทพ · คั่นด้วย " · "): มี blockedGap ⇒ `{ชื่อ}ว่าง {freeAt} แต่มีนัด {nextBookingAt}` · ไม่มี ⇒ `{ชื่อ}ว่าง {earliestFitAt}` · ผู้ถูกเลือก ⇒ `{ชื่อ}เร็วสุด {start}` · ข้าม NOT_QUALIFIED/NOT_REQUESTED/MAX_JOBS · ลำดับวลีไม่บังคับ
6. **ETA**: `waitMin = max(0, round((start − now)/60000))` (เฉพาะ SCHEDULED · อื่น null) · `etaPlusMinusMin`: นัดตรงเวลา/BOOKED_EARLY/IN_SERVICE/ไม่ได้วาง = 0 · walk-in และนัดที่ DELAYED = `min(30, max(5, ceil(0.15·waitMin/5)·5))` (A011 รอ 65 ⇒ ±10 ตรงจอ 06)
7. **line** = id ของงาน SCHEDULED (ไม่รวม IN_SERVICE) เรียง start → BOOKED ก่อน WALKIN → issuedAt → id
8. **quoteWalkIn** = วางงาน walk-in สมมติ (issuedAt = now · ต่อท้ายลำดับ เว้นแต่ priority) โดยไม่แตะงานอื่น · `closed = startAt===null || waitMin > walkInMaxWaitMin` (เท่ากับ = ยังเปิด) · ใช้กับตู้ "ใครก็ได้ vs ขอช่าง" (กติกา 4)

## 5. ไม่ใช่เรื่องของ planner (อย่าใส่)
- **% เปิดจองออนไลน์** (#24 · §4.3) = เพดานตอน **จองออนไลน์** ใน slots/B.3 · planner รับนัดที่จองแล้วเป็นข้อเท็จจริง · ช่าง 0% (ช่างแจ๊ค) ยังรับ walk-in/นัดที่พนักงานลงได้ — ข้อสอบส่ง field เกิน `onlineSharePct` มาด้วยและต้องไม่มีผล
- ปิดรับ walk-in/ตู้ · ข้าม/เรียกคืนบัตร · เปลี่ยนสถานะใน DB (LATE/NO_SHOW จริง = B.4) — planner แค่ **บอก** `RELEASED_LATE` / `NO_SHOW_DUE`
- จำนวน "ข้างหน้า N คิว" (จอ 04 = 3 · จอ 06 = 2 นับต่างกัน) = เรื่องจอ B.5/B.6
- ทรัพยากร/ห้อง (B.13 จะขยายสัญญานี้ — อย่าปิดทาง: ใส่ field ใหม่แบบ optional ได้ภายหลัง) · ML เวลาบริการ

## 6. เกณฑ์รับ
- ข้อสอบ «scripts/qc-svc-b.2.mts» เขียวทุกข้อ (ฉากภาพ 01 · ฉากกติกา · property 3,000 ชุด seed คงที่ · สแกนความบริสุทธิ์ · **perf: 12 ช่าง · นัดรวม 120 · walk-in 40 ⇒ p95 < 50 ms** วัด 200 รอบหลังอุ่น 20)
- typecheck ผ่าน · fitness 2 โหมด (ผู้คุมรัน)
- regression: ไม่มี (ไม่แตะไฟล์เดิม) · smoke «scripts/qc-svc-smoke.mts» เมื่อมี
- ตรวจเข้ม 2 รอบ (ตัวจัดคิว)
- ข้อสอบตรวจตัวเองแล้ว 27 ต.ค.: ตัวอ้างอิงทิ้งได้ (ไม่อยู่ในรีโป) ผ่าน 74/74 · กลายพันธุ์ 4 แบบ (ตัดเผื่อ · ตัด backfill-off · ตัดยืดงานเลยเวลา · เสมอเลือกผิดช่าง) ถูกจับทุกแบบ · ตัวแปร `QC_B2_PLANNER_PATH` ใช้ชี้ไฟล์อื่นเพื่อตรวจข้อสอบเท่านั้น

## 7. จุดที่แบบไม่ชัด — ผู้เขียนข้อสอบเลือกแล้ว (ผู้คุมเคาะได้ · เปลี่ยน = ORACLE-EDIT)
1. "ลำดับคิว 3 แบบ" (MASTER-PLAN) แต่ภาคผนวก #38 มี 2 ค่า ⇒ ตีความเป็น 3 ชุด: แถวเดียว+แทรก (ตัดผม) · แถวเดียวไม่แทรก · นัดก่อนเสมอ (คลินิก) = `queueOrder × backfill`
2. "นัดก่อนเสมอ" แบบไม่ได้นิยามเชิงตาราง ⇒ เลือก: นัดที่มาแล้วดึงขึ้นเร็วได้บนช่างเดิมก่อนวาง walk-in (ข้อ 3) — ไม่ขยับนัดไปช้ากว่าเดิมเหมือนทุกโหมด
3. กล่อง "ทำไม" ในภาพพูดถึงช่างบอยว่า "ว่าง 15:30" ไม่ใช่ "ว่าง 14:36 แต่มีนัด 14:45" ⇒ ใช้เกณฑ์ช่อง ≥ 10 นาที (ข้อ 5)
4. buffer หลังบริการ (#13) กับพักขั้นต่ำ (#9) รวมกันอย่างไร ⇒ ใช้ค่ามากกว่า ไม่บวกกัน
5. "±10 นาที" (จอ 06) ไม่มีสูตร ⇒ สูตรข้อ 6 (ตรงทั้ง 14:20 และ 14:50)
6. จอ 04 ตู้ 14:18 เขียน "รอราว 65 นาที" (ที่ 14:18 ควรเป็น 67) — ข้อสอบใช้ now = 14:20 ตามจอ 01
7. "12 ช่าง × 120 นัด" ⇒ นัด **รวม** 120 (12 ช่างละ 120 = 1,440 นัดในวันเดียวเป็นไปไม่ได้)
8. แบบข้อ 1 "ANY ที่ยังไม่เช็กอินย้ายช่างได้" vs ภาพ "ย้ายช่างได้ถ้ามาก่อนเวลา" ⇒ planner ย้ายเองเฉพาะที่ยังไม่เช็กอินและช่างเดิมทำตรงเวลาไม่ได้ · ปุ่ม "ย้ายช่าง" บนจอเป็นการกระทำมือ (B.5)
9. งานของคุณต่อในภาพไม่ระบุบริการ ⇒ ใช้ตัดผมชาย 45 นาที · ช่างบอยแบบ SPECIFIC
10. ขอบเวลา: `now = startAt + grace` ⇒ นับว่าสายแล้ว · `now = startAt + noShowAfter` ⇒ ไม่มา · `waitMin = walkInMaxWaitMin` ⇒ ยังรับ

## 8. มติหลังผู้ตรวจ 27 ต.ค. (ผู้คุมเคาะ · ทับ §3–§4 ที่ขัดกัน · ORACLE-EDIT B.2-R1…R6)
สัญญาเพิ่ม: `PlanReason` + `"UNKNOWN_SERVICE"` · `PlannedJob` + `overWindow: boolean`
1. **[BLOCKER] ห้ามใช้เวลาในอดีต**: นัดที่ยังไม่เริ่มและไม่ถูกปล่อย (เช็กอินแล้ว · ยังไม่มาแต่อยู่ในผ่อนผัน · HOLD) ⇒ `start = max(startAt, now, จบงานก่อนหน้า + gap(งานก่อนหน้า))` · start > startAt ⇒ `BOOKED_DELAYED` · walk-in ห้ามวางทับช่วงนี้ · gap ใช้ระหว่างนัดด้วย (ทับ §4 ข้อ 3 "ไม่บวก gap ระหว่างนัด") · ข้อสอบที่แก้: **S17 S19 S23** (เดิมคาดเวลานัดในอดีต) · ฉากใหม่ R1a–R1f · property P10 (SCHEDULED เริ่ม ≥ now ยกเว้น STAFF_UNAVAILABLE) · ตัวสุ่ม: นัดเว้น gap ตาม minBreak ของช่าง · P2 ใช้ชุดที่ไม่มีนัดค้างในอดีต
2. ANY ที่ระบบย้ายช่าง ต้องลงช่องได้จริงบนช่างใหม่: `จบก่อนหน้า + gap ≤ startAt` · `startAt + dur + gap ≤ งานถัดไป − (นัด ? safety : 0)` · อยู่ในหน้าต่าง · ทำบริการได้ · maxJobsPerDay ยังไม่เต็ม — ไม่ได้ ⇒ อยู่ช่างเดิม (R2a–R2d)
3. `serviceId` ไม่อยู่ใน `services` (ทั้งนัดและ walk-in) ⇒ `UNPLACED` / `UNKNOWN_SERVICE` · startAt=null · ไม่กินเวลาใคร · ไม่อยู่ใน line (R3)
4. `STAFF_UNAVAILABLE` (ไม่มีหน้าต่างครอบ หรือช่างทำบริการไม่ได้ และย้ายไม่ได้) ⇒ ใช้ startAt เดิมเสมอ ไม่ถูกงานค้างดัน (R4 · P4) · ไม่นับในตรวจงานซ้อน (P1) · ผลอื่นของงานนี้ต่อ walk-in ไม่ได้ทดสอบ
5. หน้าต่างเวลาที่ไม่เรียง/ซ้อน/ชิดกัน ⇒ planner **เรียง+รวมเอง** · ผล (รวม why) ไม่ขึ้นกับลำดับหน้าต่าง (R5a–R5c · P8 สลับหน้าต่างด้วย) · ตรวจ "อยู่ในหน้าต่าง" ใช้หน้าต่างที่รวมแล้ว (P5)
6. `overWindow = true` เมื่องาน SCHEDULED/IN_SERVICE ที่มีช่าง ไม่อยู่ในหน้าต่าง (รวมแล้ว) ของช่างนั้นทั้งช่วง (เช่น นัดถูกดันจนเลยปิดร้าน · งานกำลังทำที่ยืดเลยปิด · STAFF_UNAVAILABLE) · สถานะอื่น = false · walk-in ไม่มีทางเป็น true (R6a R6b · P11)
- ข้อสอบรวม 74 → **93 ข้อ** · ข้อเดิมที่ยังถูกต้องไม่แตะ · กลายพันธุ์ตรวจแล้ว: ถอด "max(…, now)" ⇒ แดง 9 ข้อ (S17 S19 S23 R1a–e P10) · ถอด overWindow ⇒ แดง R6a P11

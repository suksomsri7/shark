# ใบสั่ง B.14 — ปฏิทินนัด วัน/สัปดาห์ · ตามคน/ตามห้อง · ลากย้าย · คลิกช่องว่างจองให้ลูกค้า · ตรวจ: เบา (1 รอบ) — แต่ **ห้ามตัด: กันจองซ้อน (X3) · แยกร้าน (X1) · UI ตรงแบบ**

> อ้างอิง: MASTER-PLAN แถว B.14 (ภาพ จอง 02 · ขึ้นกับ B.13) · `DESIGN-BOOKING-QUEUE.md` R6 (+ R5 ปุ่ม · R7 ทรัพยากร) · ภาพ `ledger/design-booking/02-calendar-resources.png` (+ README "บ้านนวดใบเตย · ส. 31 ต.ค. 14:20") · CC §6.1 · §8 (สิทธิ์)
> ใบก่อนหน้าที่ต้องรู้: B.3 (`bookAppointment` · ด่านคนแบบ J5 `busyRowsOf`/`slotClear`) · B.4 (`rescheduleByShop` · CAS · J5) · B.5 (`/booking/day` ปฏิทินอย่างง่าย · `lineAccess`) · B.13 (`loadGate`/`pick`/`readHolds` · `walkInNowByService` · ลำดับล็อก §5 · มติ Q1–Q19 ใน `/root/svc-runs/fix/b13.md`) · B.16 (การ์ดลูกค้า `loadJobCustomerNotes`)
> ข้อสอบ (ห้ามแก้): «scripts/qc-svc-b.14.mts» — รับใบ = **ผ่านทุกข้อ** (SKIP ที่ยอม: V-1 ไม่มี QC_BASE · Q-* svcqc ยังไม่ seed · G-* เมื่อ `--no-regression` · SF-1 หลัง merge · A-* จนเจ้าของตอบ §9 ข้อ 1)
> รัน: `bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-b.14.mts [--no-regression] [--arrival]` (ห้าม `timeout` ครอบ · ลูกโพรเซส 5 ตัว)
> builder: **ห้าม build/next · ห้าม commit/push · ห้าม `pnpm install` · ห้าม prisma generate · ห้ามแตะ `prisma/**`** (ใบนี้ไม่มี migration — ต้องการคอลัมน์ = หยุด รายงานผู้คุม) · ห้ามแก้ข้อสอบ/`scripts/` (ยกเว้นไฟล์ฉาก §8) · รายงานต่อข้อ (id → ผล)

## 0. ภาพรวม
จอปฏิทินนัดของหน่วย BOOKING แถวเดียว: **วัน** (คอลัมน์ = คน หรือ ห้อง/เตียง) และ **สัปดาห์** (7 คอลัมน์วัน ของคน/ห้อง 1 ตัวที่เลือก) · ลากบล็อกนัดไปเวลา/คน/ห้องใหม่ = **เลื่อนนัดฝั่งร้านผ่านด่านเดียวกับการจอง** (คนแบบ J5 + ทรัพยากรแบบ B.13 · ตรวจใต้ล็อก · ล้ม ⇒ ไม่เขียนอะไร + ข้อความไทย + บล็อกกลับที่เดิม) · คลิกช่องว่าง/ปุ่ม "+ จองให้ลูกค้า" = `bookAppointment` ช่อง STAFF · คนที่ลา (ใบลาอนุมัติในระบบพนักงาน) = คอลัมน์ปิด · กล่องข้าง: "รับ walk-in ตอนนี้ได้ไหม" (ฟังก์ชัน B.13) · "ห้อง/เตียง ตอนนี้" · การ์ดงานที่เลือก · **ไม่มี migration · ไม่มี event ใหม่** (ใช้ `booking.rescheduled` เดิม)

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ (แตะนอกนี้ = ตีกลับ · ข้อสอบ SF-1 ไล่ `git status` · accept-time)
| ไฟล์ | ทำอะไร |
|---|---|
| «src/lib/modules/booking/calendar.ts» (ใหม่) | §3.1 `loadCalendar` · §3.2 `moveAppointment` · §3.3 `bookForCustomer` · (§9 ข้อ 1 `correctArrivalTime` เมื่อเจ้าของตอบ "เอา") |
| `src/lib/modules/booking/queue-line.ts` | §3.2 ขยาย `rescheduleByShop` (เพิ่มอย่างเดียว · ร้านเดิม/ข้อสอบเก่าเรียกแบบเดิมต้องได้ผลเดิม) |
| `src/lib/modules/booking/service.ts` | export ตัวช่วยด่านคน (ห่อ `busyRowsOf` + `slotClear` แบบ non-self) ให้ queue-line ใช้ — **เพิ่มบรรทัดเท่านั้น** (≤ 3 บรรทัดแก้) |
| `src/lib/modules/booking/access.ts` | `BOOKING_ACTIONS` + `moveAppointmentAction: ["booking.appointment.reschedule"]` · `bookForCustomerAction: ["booking.appointment.create"]` (+ `correctArrivalTimeAction` ถ้า §9 ข้อ 1) |
| `src/lib/modules/booking/index.ts` | re-export |
| «src/lib/actions/booking-calendar.ts» (ใหม่ · `"use server"`) | `moveAppointmentAction` · `bookForCustomerAction` — `requireUnit` → `assertBookingActionAllowed` → facade (actor จาก session) → `scheduleDrain` + revalidate `/booking` `/booking/calendar` `/booking/mine` · ล้ม ⇒ redirect `?err=` (แบบ `booking-line.ts`) · นาฬิกา QC เฉพาะ `SVC_QC_CLOCK=1` |
| «src/app/app/u/[unitSlug]/booking/calendar/page.tsx» (ใหม่) | หน้า · `?date= &range=day|week &by=staff|resource &who= &appt= &at=` · `loadCalendar` null ⇒ `notFound()` · `force-dynamic` |
| `src/app/app/u/[unitSlug]/booking/layout.tsx` | แท็บ "ปฏิทินนัด" ชี้ `/booking/calendar` (ลำดับตามภาพ: คิววันนี้ · ปฏิทินนัด · <คำเรียก> · บริการ · เวลาทำการ · ตั้งค่า — ข้อสอบ b.11 S-7 ต้องเขียว) |
| «src/components/booking/CalendarBoard.tsx» (ใหม่ · `'use client'`) + «src/components/booking/calendar/*» (ใหม่) | §4 จอ |
| «scripts/svc-qc-calendar-scene.mts» (ใหม่ · builder เขียน) | §8 ฉาก svcqc |

ห้ามแตะ: `prisma/**` · `src/lib/core/**` · `planner.ts` `planner-*.ts` `planner-run.ts` · `resources.ts` (ด่านทรัพยากร B.13 — ใช้ `loadGate`/`pick({fixed,prefer})`/`needKinds` ตามที่มี · ต้องแก้ = หยุด รายงาน) · `today-line.ts` `line-ops.ts` `line-access.ts` · `DayCalendar.tsx` + `booking/day/page.tsx` (จอ B.5 คงไว้ทุกไบต์ — ข้อสอบ b.5 U-5/H-6/S-4) · `online.ts` `deposit.ts` `finish.ts` `public-line.ts` · POS/HR · 3 ทะเบียน event · `scripts/svc-qc-data.mts` (บล็อก B.14 ผู้เขียนข้อสอบตั้งแล้ว)

## 2. หลักการ
- **ด่านเดียวกับการจอง**: ลากย้าย = `rescheduleByShop` (ตัวเดียวทั้งลากและฟอร์ม "เลื่อนนัด/ย้ายหมอ·ห้อง") · ด่านคน = นิยาม J5 ของ `bookAppointment` ช่อง STAFF (`busyRowsOf` + `slotClear` non-self: ARRIVED/IN_SERVICE ยืดถึงแผน/เริ่มจริง + ความยาว) — **ห้ามสูตรที่สอง** · ด่านทรัพยากร = `loadGate` + `pick` ของ B.13 (นิยาม §4.6 + Q1–Q19)
- **ตรวจ→เขียนใน tx เดียวใต้ล็อก ตามลำดับ §5 ของ B.13**: `lockUnitTx` (advisory สาขา + ช่างทั้งสาขา) → **SvcResource ของสาขา `ORDER BY id FOR UPDATE` (`loadGate({lock:true})`) เมื่อบริการประกาศชนิดหรือแถวถือทรัพยากร** → `lockAppt` → ตรวจ → CAS · **ห้ามล็อก SvcResource หลังล็อกแถวนัด** (ของเดิมใช้ `lock:false` หลัง `lockAppt` ⇒ แข่งกับ `setResourceMaintenance`/`updateResource` ได้ — ใบนี้ปิด · ข้อสอบ XC-5)
- **ล้ม = ไม่เขียนอะไรเลย** (แถวนัดทุกคอลัมน์ · outbox · audit) · ไม่ throw ออกจาก facade (40P01/40001/P2028 ⇒ ลองใหม่ 1 ครั้ง ⇒ `BUSY`)
- **กันข้อมูลเก่า (optimistic)**: ทุกการย้ายส่ง `expect` = เวลา/คนที่ผู้ใช้เห็นตอนลาก · ใต้ล็อกไม่ตรง ⇒ `LOST_RACE` (ข้อความ "นัดนี้ถูกเปลี่ยนไปแล้ว …") — ลากซ้ำจากจอเก่า 10 ทางพร้อมกัน ⇒ สำเร็จ 1
- เวลาไทยผ่าน `localToUtc`/`bkk*` · ไม่มี `getDay()` ดิบ · ไม่มี `any` · zod v4 · ข้อความไทยไม่โทษผู้ใช้
- **X10**: DTO ของจอ (ทั้ง view และ props คอมโพเนนต์) ไม่มีเบอร์ (เต็ม/ปิดบางส่วน) · อีเมล · token · `policySnapshot` ดิบ · `idempotencyKey` · `partyId`/`customerId` — ชื่อลูกค้าแสดงได้ (จำเป็นต่อการทำงาน) · ความชอบลูกค้าบนการ์ด = ผ่าน `loadJobCustomerNotes` (B.16 · สิทธิ์ของมันเอง) เท่านั้น

## 3. สัญญา (ข้อสอบมีสำเนาชนิด — ชื่อ field ต้องตรง)

### 3.1 `loadCalendar` (อ่านอย่างเดียว · ไม่ล็อก ไม่เขียน)
```ts
export type CalendarActor = { role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown>; userId: string };
export type CalMode = "STAFF" | "RESOURCE";
export type CalRange = "DAY" | "WEEK";
export type CalBlock = {
  appointmentId: string; kind: "BOOKED" | "WALKIN"; status: string;
  startMs: number; endMs: number;   // แสดง: เริ่ม = IN_SERVICE: startedAt ?? startAt · QUEUED/ARRIVED ที่มี plannedStartAt: plannedStartAt · อื่น: startAt
                                    // endMs = เริ่ม + นาทีบริการ (job.durationMin ?? endAt − startAt − (job.bufferMin ?? service.bufferMin)) — ไม่รวม buffer
  holdEndMs: number;                // STAFF: เริ่ม + (endAt − startAt) (รวม buffer ของหมอ) · RESOURCE: endMs + cleanupMin ของทรัพยากรคอลัมน์นั้น · UNASSIGNED: endMs
  label: string;                    // BOOKED: customerName · WALKIN: `${ticketNumber ?? ""} walk-in`.trim()
  serviceName: string; staffId: string | null; staffName: string | null;
  resourceIds: string[]; resourceNames: string[];   // ตาม resourceIdsOfRow (job.resourceIds ?? [resourceId]) · ชื่อจาก SvcResource ของหน่วย
  ticketNumber: string | null;
  movable: boolean;                 // actor ย้ายได้ ∧ kind BOOKED ∧ status ∈ {PENDING, CONFIRMED, LATE} ∧ startAt > now
};
export type CalColumn = {
  key: string;                      // DAY: staffId/resourceId (หรือ "UNASSIGNED") · WEEK: dateStr
  kind: "STAFF" | "RESOURCE" | "UNASSIGNED"; id: string | null; name: string;
  sub: string;                      // STAFF: ชื่อบริการที่ทำได้ (ย่อ) · RESOURCE: ป้ายไทยของชนิด (RESOURCE_KIND_LABELS_TH)
  dateStr: string;
  closed: null | { code: "LEAVE" | "OFF" | "SHOP_CLOSED" | "MAINTENANCE"; reasonTh: string };
  maintenance: { startMs: number; endMs: number }[];   // RESOURCE เท่านั้น (ช่วงปิดซ่อมที่ตัดวันนั้น) · STAFF = []
  blocks: CalBlock[];               // เรียง startMs, appointmentId
};
export type CalendarView = {
  unitId: string; mode: CalMode; range: CalRange;
  dateStr: string; days: string[];  // DAY: [dateStr] · WEEK: 7 วัน จันทร์–อาทิตย์ที่มี dateStr
  prevDateStr: string; nextDateStr: string;   // ±1 วัน (DAY) · ±7 วัน (WEEK)
  todayStr: string; nowMs: number;
  openMin: number | null; closeMin: number | null;   // เวลาร้านของ dateStr (ปิด = null)
  providerLabel: string;            // booking.general.providerLabel ("หมอนวด")
  focusId: string | null;           // WEEK: คน/ห้องที่เลือก (ไม่ส่ง/ไม่ใช่ของหน่วย ⇒ ตัวแรก) · DAY: null
  focusOptions: { id: string; name: string }[];      // คน (หรือห้อง) ของหน่วยให้เลือก
  columns: CalColumn[];
  access: { move: boolean; book: boolean };
  summary: { staffWorking: number; staffOnLeave: number; resources: { kind: string; labelTh: string; count: number }[] };
  walkInNow: WalkInNowRow[] | null;                  // = walkInNowByService(ctx,{now}) เมื่อ dateStr = วันนี้ (ไทยของ now) · วันอื่น null
  resourcesNow: { id: string; name: string; kind: string; state: "BUSY" | "NEXT" | "FREE" | "MAINT"; nextStartMs: number | null }[] | null;  // วันนี้เท่านั้น
};
export async function loadCalendar(ctx: { tenantId: string; unitId: string }, actor: CalendarActor,
  opts: { dateStr: string; range?: CalRange; mode?: CalMode; focusId?: string; now?: Date }): Promise<CalendarView | null>;
```
- **null** (หน้า ⇒ 404): ctx ผิดรูป/หน่วยไม่ใช่ของ tenant/ไม่ใช่ BOOKING แถวเดียว (`lineSettingsOf` null) · actor ดูไม่ได้ (`lineAccess(actor, unitId).view` false) · dateStr ไม่ใช่วันจริง
- **คอลัมน์ DAY · STAFF**: ช่าง active ของหน่วย เรียง sortOrder, createdAt, id · ลาทั้งวัน (`staffDayProfiles(...).onLeave`) ⇒ `closed.code "LEAVE"` reasonTh มีคำว่า "ลา" · ไม่มีกรอบเวลาวันนั้น (ไม่ลา) ⇒ `"OFF"` · ร้านปิดทั้งวัน ⇒ ทุกคอลัมน์ `"SHOP_CLOSED"` · **คอลัมน์ปิดยังแสดงบล็อกที่มีอยู่** (นัดค้างของคนลา = ต้องจัดการ)
- **คอลัมน์ DAY · RESOURCE** (มติผู้คุม: ทรัพยากร B.13 = คอลัมน์ "ตามห้อง"): `SvcResource` active ของหน่วย เรียง sortOrder, createdAt, id · inactive ไม่แสดง · ช่วงปิดซ่อมใน `maintenance` · ปิดซ่อมคลุมเวลาร้านทั้งวัน ⇒ `closed.code "MAINTENANCE"` · บล็อก = นัดที่ถือชิ้นนี้ (นัดหลายชนิดขึ้นทุกคอลัมน์ที่ถือ) · นัดของบริการที่ประกาศชนิดแต่ยังไม่ได้ทรัพยากร ⇒ คอลัมน์ท้าย `kind "UNASSIGNED"` ชื่อ "ยังไม่ได้ห้อง" (มีเฉพาะเมื่อมีบล็อก) · บริการไม่ใช้ทรัพยากร = ไม่แสดงในมุมนี้
- **WEEK**: 7 คอลัมน์ (`kind` = ชนิดของ mode · `id` = focusId · `key` = `dateStr` ของวัน) · closed ต่อวันตามกติกาข้างบน
- งานที่นับ: ทุกแถวของหน่วยที่ "เริ่มแสดง" ตกในวันไทยนั้น · ไม่รวม CANCELLED · คอลัมน์คนของงาน = `plannedStaffId ?? staffId`
- `summary`: staffWorking = คอลัมน์คนไม่ปิด · staffOnLeave = LEAVE · resources = นับชิ้น active ไม่ปิดซ่อมทั้งวัน ต่อชนิด (ลำดับ RESOURCE_KINDS)
- `resourcesNow` (วันนี้ · ลำดับเดียวกับคอลัมน์ห้อง · active เท่านั้น): ลำดับตัดสิน MAINT (ปิดซ่อมคร่อม now) → BUSY (มีงานถือคร่อม now · นิยาม `readHolds`) → NEXT (งานถัดไปเริ่มภายใน 60 นาที) → FREE · `nextStartMs` มีค่าเฉพาะ NEXT (อื่น = null)
- `access.move` = `canBookingAction(actor, unitId, "moveAppointmentAction")` · `access.book` = `canBookingAction(..., "bookForCustomerAction")`

### 3.2 `moveAppointment` + ขยาย `rescheduleByShop`
```ts
export type CalMoveTo = { dateStr: string; startMin: number; staffId?: string; resourceId?: string };
export type CalMoveFail = "FORBIDDEN" | "NOT_FOUND" | "BAD_INPUT" | "BAD_STATE" | "FULL" | "PAST" | "ON_LEAVE" | "NOT_QUALIFIED" | "OUTSIDE_HOURS" | "LOST_RACE" | "BUSY";
export type CalMoveResult = { ok: true; appointmentId: string; startAt: Date; staffId: string; resourceIds: string[] } | { ok: false; code: CalMoveFail; reason: string };
export async function moveAppointment(actor: CalendarActor, ctx: { tenantId: string; unitId: string },
  appointmentId: string, to: CalMoveTo, opts: { expect: { startAt: string; staffId: string }; now?: Date }): Promise<CalMoveResult>;
// queue-line.ts (เพิ่มแบบ optional — เรียกแบบเดิม = ผลเดิม):
rescheduleByShop(ctx, id, to: { dateStr; startMin; staffId?; resourceId? }, opts?: { now?: Date; expect?: { startAt: Date | string; staffId: string } })
```
**ลำดับตรวจ** (ข้อสอบเช็ก): ① actor ไม่มีสิทธิ์ที่หน่วย ⇒ `FORBIDDEN` (ก่อนแตะแถว — ไม่บอกว่ามีนัดไหม) → ② ctx/แถวไม่พบ/ข้ามร้าน/ข้ามหน่วย ⇒ `NOT_FOUND` ข้อความเดียวกันทุกกรณี → ③ รูปข้อมูล (`expect` ไม่ครบ · dateStr ไม่จริง · startMin ไม่ใช่ int 0–1439 · staffId/resourceId ว่าง) ⇒ `BAD_INPUT` → ④ staffId/resourceId ไม่ใช่ของหน่วย/ปิดใช้ ⇒ `NOT_FOUND` · resourceId ชนิดที่บริการไม่ใช้ ⇒ `BAD_INPUT` → ⑤ สถานะไม่ใช่ PENDING/CONFIRMED/LATE หรือเป็น WALKIN ⇒ `BAD_STATE` → ⑥ อดีต ⇒ `PAST` · ลา ⇒ `ON_LEAVE` · ทำบริการไม่ได้ ⇒ `NOT_QUALIFIED` · ช่วงบริการไม่อยู่ในกรอบเวลาของคนวันนั้น ⇒ `OUTSIDE_HOURS` → **ใต้ล็อก**: ⑦ สถานะซ้ำ (BAD_STATE) → ⑧ `expect` ไม่ตรงแถว ⇒ `LOST_RACE` → ⑨ ด่านคน J5 (ไม่นับตัวเอง) ⇒ `FULL` → ⑩ ด่านทรัพยากร (ไม่นับตัวเอง · ชิ้นเดิมก่อน · `resourceId` ระบุ = **ต้องเป็นชิ้นนั้น** (`pick({fixed})`) ไม่ว่าง ⇒ `FULL` ห้ามสลับเงียบ) ⇒ `FULL` + ข้อความ "ห้อง/เตียง…ไม่ว่าง" → ⑪ CAS
- เขียน: `startAt` · `endAt = startAt + นาทีของคนปลายทาง + buffer(snapshot ?? บริการ)` · `staffId` · `assignMode "SPECIFIC"` (เมื่อเปลี่ยนคน) · `plannedStartAt/plannedStaffId = null` · `resourceId` = ชิ้นแรก + `policySnapshot.job.resourceIds` (ลำดับชนิด) · LATE ⇒ CONFIRMED + `lateAt null` · `rescheduleCount` ไม่นับ · มัดจำ/ลูกค้า/snapshot อื่นไม่แตะ (ตามกติกาเดิมของ rescheduleByShop)
- event `booking.rescheduled` (by SHOP · payload เดิม · ไม่มี PII) **ทุกการย้ายที่สำเร็จ** — คีย์ idempotency ต้องไม่ชนเมื่อย้ายไป-กลับ (A→B→A→B = 3 แถว) · แนะนำต่อท้ายคีย์เดิมด้วย `#<updatedAt ก่อนเขียน ms>` (ลองใหม่ใน tx เดียวกันได้คีย์เดิม)
- หลัง commit `replan` (เดิม)

### 3.3 `bookForCustomer` (คลิกช่องว่าง · ปุ่ม "+ จองให้ลูกค้า")
```ts
export async function bookForCustomer(actor: CalendarActor, ctx: { tenantId: string; unitId: string },
  i: { serviceId: string; staffId: string | null; dateStr: string; startMin: number; customerName: string; customerPhone: string; note?: string; idempotencyKey: string }): Promise<BookResult | { ok: false; code: "FORBIDDEN"; reason: string }>;
```
- ไม่มีสิทธิ์ ⇒ `FORBIDDEN` (ไม่เขียน) · ผ่าน ⇒ `bookAppointment(ctx, { ...i, channel: "STAFF" })` ตรงตัว (ผลทุกรหัสเป็นของ B.3/B.13) · มุมห้อง: คลิกช่องของห้อง ⇒ staffId null (ใครก็ได้) · ห้องเลือกโดยด่าน (first-fit — §9 ข้อ 5)

## 4. จอ (ภาพ จอง 02 · เดสก์ท็อป 1440 · ไม่ทำแบบมือถือ)
- หัว: "ปฏิทินนัด · <วัน>" + บรรทัดสรุป `เปิด HH:MM–HH:MM · <providerLabel> N คนมาวันนี้ (ลา k) · <ชนิด> n …` + ปุ่ม `[data-cal-book]` "+ จองให้ลูกค้า" (เฉพาะ `access.book`) · ‹ วันที่ › (`[data-cal-prev]` `[data-cal-next]`) · สลับ `[data-cal-range="DAY"|"WEEK"]` "วัน/สัปดาห์" · `[data-cal-mode="STAFF"|"RESOURCE"]` "ตาม<providerLabel>" / "ตามห้อง/เตียง"
- ราก `[data-bq-calendar]` · คอลัมน์ `[data-cal-col="<key>"]` ตามลำดับ `columns` · คอลัมน์ปิด `data-closed="<code>"` + ข้อความ reasonTh (ลาย hatch ตามภาพ) · บล็อก `[data-cal-block="<appointmentId>"]` · บล็อกที่ `movable` มี `draggable="true"` + `data-movable` — ไม่ movable ห้ามมี `draggable="true"` · ชิปทรัพยากร (ชื่อ) ในบล็อกมุมคน · เส้นตอนนี้ `[data-cal-now]` (วันนี้)
- ลาก (client): ระหว่างลากแสดงตำแหน่งปลายทาง · ปล่อย ⇒ ส่ง `moveAppointmentAction` (FormData: `appointmentId` `dateStr` `startMin` `staffId?` `resourceId?` `expectStartAt` `expectStaffId` `at?`) · ล้ม ⇒ บล็อกกลับที่เดิม + แถบข้อความไทยจาก `?err=` · ห้ามคำนวณชน/ว่างฝั่ง client เป็นตัวตัดสิน (ช่วยไฮไลต์ได้ แต่ server ตัดสิน)
- คลิกช่องว่างในคอลัมน์ที่ไม่ปิด (เฉพาะ `access.book`) ⇒ ฟอร์มจอง (บริการ · เวลา · ชื่อ · เบอร์) prefill คอลัมน์/เวลา ⇒ `bookForCustomerAction`
- กล่องข้าง (เฉพาะเมื่อ `walkInNow`/`resourcesNow` ไม่ null): `[data-bq-walkin-now]` (จาก `walkInNow` · ข้อความตาม `reasonTh` ของ B.13 · เวลาแดงเมื่อ limitedBy ≠ NONE) · `[data-bq-res-now]` ห้อง/เตียงตอนนี้ — ชิ้นละ `[data-res-now="<id>"][data-state="<state>"]` ตามลำดับ `resourcesNow` (ดำ = BUSY · เส้นประ+เวลา = NEXT · กรอบเทา = FREE · ลาย = MAINT · คำอธิบายใต้กล่องตามภาพ) · การ์ดงาน `[data-cal-card="<appointmentId>"]` (`?appt=` · ไม่ส่ง ⇒ งาน ARRIVED ที่รอนานสุดของวันนี้ถ้ามี) — บริการ · หมอ·ห้อง · ลูกค้า (B.16 `loadJobCustomerNotes` ตามสิทธิ์) · ปุ่มตามสิทธิ์/สถานะ: "เริ่ม…" (ARRIVED · ใช้ action เดิม B.5 `startJobAction`) · "ย้ายหมอ/ห้อง" + "เลื่อนนัด" (เฉพาะ movable · เปิดฟอร์มย้ายที่ส่ง `moveAppointmentAction` ตัวเดียวกับการลาก)
- คอมโพเนนต์รับ `actions` เป็น props (แบบ `line-page.ts`) — **ห้าม import ค่าจาก** `@/lib/modules/*` (ยกเว้น pure `resource-kinds` · `line-parts` ฝั่ง components) · `@/lib/actions/*` · `@/lib/core/db` · `@prisma/client`
- `/booking/day` (B.5) คงไว้ (ไม่ลิงก์จากแท็บแล้ว — ลบ/redirect ที่ B.18)

## 5. เกณฑ์รับ (เบา · แต่ X1/X3/UI ห้ามตัด)
- «scripts/qc-svc-b.14.mts» เขียวทุกข้อ — หมวด **C** (view วัน/สัปดาห์ × คน/ห้อง เทียบฐาน · ลาปิดคอลัมน์ · ปิดซ่อม · สรุป · ตอนนี้ · X10) · **M** (ลากสำเร็จ/ชนคน/ชน J5/ชนห้อง/ห้องที่ระบุ/ลา/ไม่มีสิทธิ์ทำ/นอกเวลา/อดีต/สถานะ/ข้อมูลเก่า/event ไป-กลับ · ไม่เขียนเมื่อล้ม) · **P** สิทธิ์ · **X1** ข้ามร้าน/หน่วย · **K** จองจากปฏิทิน · **XC** ยิงพร้อมกัน 5 โพรเซส ≥ 10 ทาง (ช่องเดียว ⇒ 1 · ห้องเดียว ⇒ 1 · จอเก่า 10 ทาง ⇒ 1 · ลาก ∥ จอง ⇒ 1 · ลาก ∥ ปิดซ่อม ⇒ ไม่ซ้อน · deadlock 0) · **U** DOM/ไฟล์จอ · **Q** ฉาก · **V-1** ภาพ · **SF** · **G** · **Z**
- typecheck + fitness 2 โหมด (ผู้คุม) · build QC + ภาพ 1 ใบ MOCKUP|RENDER (`02-calendar-resources.png`) → PARITY
- ผู้ตรวจ 1 ตัว (ใบเบา) — ให้ดู §2 ลำดับล็อก + XC-5 เป็นพิเศษ

## 6. regression (G) — ข้อ "ไฟล์ของใบ" ของชุดเก่าเป็น accept-time ⇒ แดงได้เฉพาะข้อที่ระบุ ระหว่างไฟล์ B.14 ยังไม่ commit
| G | ชุด | เกณฑ์ |
|---|---|---|
| 1 | `qc-svc-b.2` | findings ว่าง (ไม่แตะตัววางคิว) |
| 2 | `qc-svc-b.13 --no-regression` | FAIL ได้เฉพาะ SF-1 · SKIP เฉพาะ V-1/Q-*/G-*/SF-1 |
| 3 | `qc-svc-b.3` (`SVC_B3_NO_REGRESSION=1`) | FAIL ได้เฉพาะ ST-1 (+ S-9 เมื่อรันหลัง 22:00 ไทย — หนี้ §3.2) · SKIP เฉพาะ G-*/ST-1 |
| 4 | `qc-svc-b.4 --no-regression` | FAIL ได้เฉพาะ ST-1 · SKIP เฉพาะ G-*/ST-1 |
| 5 | `qc-svc-b.5 --no-regression` | FAIL ได้เฉพาะ S-1 · SKIP เฉพาะ H/E/V/Q/G/S-1 |
| 6 | `qc-svc-b.7 --no-regression` | FAIL ได้เฉพาะ S-1/S-2/S-3 (queue-line/service ถูกแตะ) · SKIP เฉพาะ H/V/Q/G/S-1 |
| 7 | `qc-svc-smoke` | exit 0 |
- (ผู้คุมรันเพิ่มตอนรับ: `qc-svc-b.11` S-7 แท็บ · `qc-svc-b.16` — ไม่อยู่ใน G เพราะ b.16 มีข้อห้ามแตะ queue-line/service ที่เป็น accept-time ของมันเอง)

## 7. ห้าม
- ห้ามสูตรชน/ว่างชุดที่สอง (คนหรือห้อง) · ห้ามตัวกันในหน่วยความจำ · ห้ามเลือกห้องอื่นเงียบเมื่อผู้ใช้ปล่อยบนห้องที่ระบุ · ห้ามย้าย walk-in/ARRIVED/IN_SERVICE ผ่านทางนี้ (ใช้ปุ่ม B.5) · ห้ามแตะเวลาเช็กอิน/ยุคการมาถึง (Q18) นอก §9 ข้อ 1 · ห้ามส่งเบอร์ลง client · ห้ามแก้ `/booking/day`

## 8. ฉาก svcqc («scripts/svc-qc-calendar-scene.mts» · builder เขียน)
- ด่าน `loadSvcQcEnv` · อ่านจาก `SQC_CALENDAR_SCENE` เท่านั้น (บล็อก B.14 ใน `scripts/svc-qc-data.mts` — ผู้เขียนข้อสอบตั้งแล้ว) · ร้าน svcqc หน่วย massage · วันฉาก = `SQC_CALENDAR_SCENE.day` (เสาร์อนาคต) · ต้องรันหลัง seed → ฉาก B.11 → ฉาก B.13 (ทรัพยากร)
- ทำ: (1) ลาของพี่ศรี: AppSystem HR `leave.hrSystemId` (สร้างถ้าไม่มี) + HrEmployee `leave.employeeId` → `BookingStaff(พี่ศรี).employeeId` → HrLeave APPROVED วันฉาก (type VACATION) (2) นัดตาม `bookings` ผ่าน `bookAppointment` ช่อง STAFF (idempotencyKey `idemPrefix + day + key`) แล้วพาไปสถานะตาม `then` ด้วย now ฉีด (checkIn/startJob/completeJob ของ B.4/B.5) (3) walk-in ตาม `walkIns` (createWalkIn ณ เวลาที่กำหนด → startJob/completeJob) (4) runPlanner ณ `at`
- **ห้ามเขียนค่าตั้งชั้น TENANT/UNIT** (ข้อสอบ Q-4) · idempotent: ครบแล้ว ⇒ 0/0/0 · `--clear` ลบนัด/บัตรของฉาก + ใบลา/พนักงานของฉาก + คืน `employeeId` พี่ศรี · บรรทัดท้าย `SCENE_SUMMARY {"created":n,"updated":n,"removed":n}`
- ภาพ: `SQC_VISUAL_SPECS["b.14"]` (1 ภาพ · `--user owner` · QC server `SVC_QC_CLOCK=1`)

## 9. คำถามเปิด + ค่าที่แนะนำ (ผู้เขียนข้อสอบเลือกตามค่าแนะนำแล้ว · เปลี่ยน = ORACLE-EDIT)
1. **ช่อง "แก้เวลามาถึงจริง" ให้พนักงาน** (คำถามเจ้าของ B.13 ใน `SVC-OWNER-QUESTIONS.md`) — **ทำเมื่อเจ้าของตอบ "เอา" เท่านั้น** · ระหว่างรอ: ข้อสอบ A-* SKIP (เปิดด้วย `--arrival`) · แบบที่เตรียมไว้: `correctArrivalTime(actor, ctx, appointmentId, arrivedAtIso, { now })` สิทธิ์ `booking.checkin` · เฉพาะแถว ARRIVED ของวันนี้ที่มี `checkedInAt` · เวลาใหม่ ≤ `checkedInAt` เดิม และ ≥ `startAt − 60 นาที` และไม่ใช่อนาคต · CAS ตั้ง `checkedInAt` ใหม่ (= ยุคการมาถึงใหม่ตามมติ Q18 ⇒ เครื่องหมาย unplaced เดิมหมดผล) + ล้าง `job.unplacedAt/unplacedFor` · `writeAudit` before/after · หลัง commit runPlanner (มาตรงเวลา ⇒ กลับช่องนัดเดิม/ห้องเดิมถ้าว่าง) · ไม่เปลี่ยนสถานะ ไม่ปล่อยคิว · **แนะนำ: เอา** (กดช้าแล้วลูกค้าโดนต่อท้ายคิว = เสียลูกค้า)
2. **สิทธิ์ย้าย**: ต้องมี `booking.appointment.reschedule` (เลื่อนนัดแทนลูกค้า) · ช่างที่มีแค่ `booking.job.run` **ย้ายนัดตัวเองไม่ได้** · `booking.queue.operate`/`runAny` ไม่พอ (เป็นสิทธิ์จัดคิววันนี้) — แนะนำค่านี้ (ปลอดภัย · ตรงตารางสิทธิ์ภาพ 14 แถว "ยกเลิกนัด · เลื่อนนัดแทนลูกค้า")
3. **ย้ายลูกค้าที่มาถึงแล้ว (ARRIVED เช่นคุณนิดในภาพ)** — รุ่นนี้ `BAD_STATE` · การ์ดแสดงปุ่ม "เริ่ม…" เท่านั้นสำหรับ ARRIVED · ปุ่ม "ย้ายหมอ/ห้อง" ของ ARRIVED (เปลี่ยนห้องเวลาเดิม) = หนี้ → ใบหลัง (ต้องผ่านตัววางคิว/ยุคการมาถึง) — PARITY: ภาพมี 3 ปุ่มบนการ์ด ARRIVED ⇒ ยอมรับต่างได้ 2 ปุ่มนี้ (ผู้คุมเขียนใน PARITY)
4. **ลากออกนอกกรอบเวลาของคน** ⇒ `OUTSIDE_HOURS` (เหมือน `moveJobStaff` · ต่างจาก bookAppointment ช่อง STAFF ที่ยอมนอกเวลา) — แนะนำค่านี้ (ปล่อยผิดช่องบ่อยกว่าตั้งใจทำล่วงเวลา · ทำล่วงเวลาให้แก้เวลาคนก่อน)
5. **คลิกช่องในมุมห้อง** ⇒ จองแบบ "ใครก็ได้" + ห้องเลือกโดยด่าน (ไม่ตรึงห้องที่คลิก — `BookInput` ไม่มีช่องห้อง · ไม่แตะ service.ts ส่วนจอง) · ต้องการตรึง ⇒ ลากย้ายหลังจอง
6. **สัปดาห์เริ่มวันจันทร์** (ISO) · สัปดาห์ = คน/ห้อง 1 ตัวต่อจอ (7 คอลัมน์วัน) — ทุกคน × 7 วันอ่านไม่ออก
7. **ป้ายลา** = "ลา · อนุมัติแล้วในระบบพนักงาน · ปิดรับจองทั้งวัน" (ไม่บอกชนิดลา "ลาพักร้อน" เพราะ facade HR ไม่มีชนิด และใบนี้แตะ HR ไม่ได้) — PARITY ยอมรับต่างคำ
8. **"จ่ายด้วย คอร์ส 7/10" บนการ์ด** — ระบบคอร์สยังไม่มีใน RUN นี้ ⇒ แสดงมัดจำ/ยอดบริการแทน · PARITY ยอมรับ
9. **ลาครึ่งวัน/กะ** — `staffOnLeave` เป็นทั้งวัน ⇒ ลาทั้งวันเท่านั้น (ลาบางช่วง = รอ RUN HR X-HR.1 ผ่าน `staffWindows`)
10. **ระบบเดิมไม่ใช่แถวเดียว** ⇒ ไม่มีปฏิทินนี้ (404) — เหมือน B.5

## 10. migration
**ไม่มี** (ทุกอย่างใช้คอลัมน์เดิม: `Appointment.resourceId` + `policySnapshot.job.resourceIds` · `SvcResource(Block)` · `HrLeave` ผ่าน `staffDayProfiles`) — ข้อสอบ SF-2 ตรวจ `prisma/` สะอาด

## มติผู้คุม (31 ต.ค.)
- คำถามเปิด 1–10 ✅ ตามค่าที่แนะนำทั้งหมด · ข้อ 1 (correctArrivalTime) ออกแบบไว้แต่ **ไม่ทำ** จนเจ้าของตอบ (A-* SKIP)
- 🔴 ข้อค้นพบ B.13: rescheduleByShop อ่านด่านทรัพยากรแบบ lock:false หลังล็อกแถวนัด ⇒ ใบนี้แก้ให้ล็อกตามลำดับ สาขา → ช่าง → ทรัพยากร → แถวนัด (SF-6 · XC-5) **และแก้ rescheduleBySelf (B.7) แบบเดียวกัน** + เพิ่มฉากแข่ง "เลื่อน ∥ ปิดซ่อม/ลดความจุ" ให้ทั้งสองเส้น (ORACLE-EDIT เพิ่มอย่างเดียว · ผู้สร้างได้รับอนุมัติ) · หนี้ B.13 ปิดในใบนี้
- เจ้าของ rescheduleByShop/BySelf ช่วงนี้ = B.14 · B.15 เรียกผ่าน ไม่แก้ตัวมัน (ประสานกับเลน l3)

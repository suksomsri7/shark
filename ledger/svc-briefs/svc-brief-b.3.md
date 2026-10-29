# ใบสั่ง B.3 — หาเวลาว่าง v2 + จองแบบมีกติกา · ตรวจ: เข้ม 2 รอบ (กันจองซ้อน) · ห้ามตัด: กันจองซ้อน (X3) · แยกร้าน (X1)

> อ้างอิง: MASTER-PLAN แถว B.3 · `DESIGN-BOOKING-QUEUE.md` R3 · §4.3 (% ออนไลน์) · §9 · ภาคผนวก ก #8 #9 #19–#25 #33–#35 · CC §1.4 (resolver) §1.6 (snapshot) · ใบ B.0 §8–§9 (`_fallback` = รุ่นแรก · carry "แปลงค่าตั้ง → PlanSettings" + "คอลัมน์เดิมชนะค่าตั้ง" + "QUEUED/IN_SERVICE/LATE ถือช่อง") · ใบ B.1 §4 (บังคับ % ออนไลน์/งานสูงสุด/พักขั้นต่ำ/ตรวจหน้าต่าง = B.3) · ใบ B.2 §3 (`PlanSettings`)
> ข้อสอบ (ห้ามแก้): «scripts/qc-svc-b.3.mts» — รับใบ = **ผ่านทุกข้อ ไม่มี SKIP** (นับจาก `JSON_SUMMARY`)
> รัน: `bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-b.3.mts` (ห้าม `timeout` ครอบ · ข้อสอบเปิดลูกโพรเซส 5 ตัวยิงพร้อมกัน + ท้ายชุดรัน regression เอง — นาน · `SVC_B3_NO_REGRESSION=1` = ข้าม G เป็น SKIP ซึ่งไม่นับผ่าน)
> builder: **ห้าม build/next · ห้าม commit/push · ห้าม `pnpm install` · ห้ามแตะ schema/migration · ห้ามแก้ข้อสอบ** · รายงานต่อข้อ (id → ผล)

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ (แตะนอกนี้ = ตีกลับ · ข้อสอบ ST-1 ไล่ `git status` ของ src/ prisma/)
| ไฟล์ | ทำอะไร |
|---|---|
| `src/lib/modules/booking/service.ts` | §3.2 `findSlots` · `bookAppointment` · `expireDepositHolds` (+ ตัวช่วยภายใน) · **`getAvailableSlots` / `createAppointment` คงพฤติกรรมเดิมทุกไบต์** (ใช้ตัวกันซ้อนเดียวกันได้ แต่ผลเดิม) · §3.4 (ORACLE-EDIT 28 ต.ค.) `recordDeposit` · `setAppointmentStatus` |
| `src/lib/modules/booking/slots.ts` (pure) | §3.1 `computeDepositSatang` (+ ตัวช่วย pure อื่นได้) |
| «src/lib/modules/booking/plan-settings.ts» (ใหม่ · **pure**) | §3.1 `PLAN_SETTING_KEYS` · `planSettingsFrom` (carry ใบ B.0) |
| `src/lib/modules/booking/index.ts` | re-export ได้ถ้าจำเป็น |
| `src/lib/platform/minute-jobs.ts` | **เพิ่มบล็อกเดียว** งาน `booking.depositHolds.expire` (§3.3) — ไม่แตะบรรทัดอื่น |

ห้ามแตะ: `prisma/**` (ไม่มี migration — §6 ข้อ 1) · `src/lib/core/settings/**` · `planner.ts` · `staff-hours.ts` · route สาธารณะ `api/store/**` + `public-booking.tsx` (สลับไปใช้ v2 = **B.7**) · ข้อสอบทุกไฟล์

## 2. หลักการ
- **ช่องทาง** `BookingChannel = "ONLINE" | "LINE" | "STAFF" | "PHONE"` · **ลูกค้าจองเอง (SELF)** = `ONLINE` `LINE` · **ร้านจองให้** = `STAFF` `PHONE`
- กติกาออนไลน์ทั้งหมด (horizon · lead · ช่องทุก N · หน้าต่างเวลา · % ออนไลน์ · งานสูงสุด/วัน · พักขั้นต่ำ · เพดานต่อเบอร์ · ใครก็ได้เปิด/ปิด · bookable · ร้านยืนยันก่อน · ถือช่องมัดจำ) ใช้กับ **SELF เท่านั้น** · ร้านจองให้ = พฤติกรรมรุ่นแรก (ห้ามซ้อน · ช่างลา · ทำบริการได้ · ไม่ใช่อดีต · จองนอกเวลา/เกินเพดานได้ — พนักงานตัดสินเอง)
- ค่าตั้งอ่านผ่าน resolver ทุกครั้ง (refs `{ unitId, staffId, serviceId }` ตามขอบเขตของคีย์) · ห้ามแคชข้ามคำขอ · **คอลัมน์เดิมชนะค่าตั้ง**: `BookingService.bufferMin` (ไม่ใช่ `service.cleanupMin`) · `BookingService.bookable` (ไม่ใช่ `service.onlineBookable`) · ตาราง `BookingHours` (ผ่าน `staffDayProfiles` B.1)
- เวลาไทยแบบ `slots.ts` (`localToUtc`) · **ห้าม `getDay()/getHours()/getDate()/getMinutes()` ดิบ** (ข้อสอบรัน TZ +14 / −11)
- **กันจองซ้อนต้องบังคับที่ฐาน** (ล็อกแถว/advisory lock ใน transaction) — ข้อสอบยิงจาก **5 โพรเซสแยก × 2 คำขอพร้อมกัน** ตัวกันในหน่วยความจำ (Map/mutex ในโมดูล) จะแดง · ทุกการตรวจที่เป็น "ตัวนับ" (ซ้อน · % ออนไลน์ · งานสูงสุด/วัน · เพดานต่อเบอร์) ต้องตรวจซ้ำ **ภายใต้ล็อก** ก่อน insert · ล็อกหลายตัวต้องลำดับคงที่ (เบอร์ → ช่างตาม sortOrder) กัน deadlock · ตั้ง `$transaction` `maxWait/timeout` ให้พอสำหรับ 10 คำขอรอคิวกัน (ข้อสอบไม่ยอมให้ `bookAppointment` throw)
- ล็อกของ `bookAppointment` ต้อง **กันกับ `createAppointment` เดิมด้วย** (ตัวเดิมล็อก `SELECT … FROM "BookingStaff" … FOR UPDATE` — ใช้ล็อกเดียวกัน) — ข้อสอบ X3-7 ผสมสองทางพร้อมกัน

## 3. สัญญา (ข้อสอบมีสำเนาชนิด — ชื่อ field ต้องตรง)

### 3.1 pure
```ts
// slots.ts
/** amount = ค่า resolve ของ booking.deposit.amount · null ⇒ 0 · PER_SERVICE ⇒ serviceDepositSatang ·
 *  PERCENT ⇒ (minDurationMin === null || durationMin >= minDurationMin) ? Math.round(priceSatang * bp / 10000) : 0 · รูปอื่น ⇒ throw */
export function computeDepositSatang(amount: unknown, i: { priceSatang: number; durationMin: number; serviceDepositSatang: number }): number;

// plan-settings.ts (import ได้เฉพาะ `import type` จาก ./planner · ไม่มี prisma/next/Date.now/new Date()/Math.random)
export const PLAN_SETTING_KEYS: readonly string[];   // 11 คีย์ตามตารางล่าง (ไม่มากไม่น้อย)
export function planSettingsFrom(values: Readonly<Record<string, unknown>>): PlanSettings; // คีย์ขาด/ชนิดผิด ⇒ throw · ห้ามแก้ input
```
| PlanSettings | คีย์ | แปลง |
|---|---|---|
| queueOrder | booking.queue.order | `SINGLE_LINE_BY_TIME`→`SINGLE_LINE` · `APPOINTMENT_FIRST`→เดิม |
| backfill | booking.queue.walkInFillGaps | ตรง |
| safetyBeforeBookingMin | booking.queue.safetyMin | ตรง |
| graceMin | booking.late.graceMin | ตรง |
| noShowAfterMin | booking.late.noShowAfterMin | `null` ⇒ `Number.POSITIVE_INFINITY` (ไม่ตั้งไม่มาอัตโนมัติ) |
| lateAction | booking.late.afterGrace | `RELEASE_REQUEUE`→`RELEASE` · `WAIT_NOTIFY_COUNTER`→`HOLD` |
| priorityEnabled | booking.queue.priorityGroups | array ไม่ว่าง |
| walkInMaxWaitMin | booking.queue.walkInCloseWaitMin | ตรง |
| overrunExtendMin | booking.queue.overrunExtendMin | ตรง |
| minBreakMin | booking.staff.minBreakMin | ตรง |
| maxJobsPerDay | booking.staff.maxJobsPerDay | ตรง (null = ไม่จำกัด) |
แนะนำเขียนเป็น `switch` ครบทุกค่า enum (เพิ่มค่าใหม่แล้ว tsc เตือน)

### 3.2 `service.ts`
```ts
export type BookingChannel = "ONLINE" | "LINE" | "STAFF" | "PHONE";
export async function findSlots(ctx: BookingCtx, q: { serviceId: string; staffId: string | null; dateStr: string; channel: BookingChannel }): Promise<SlotOption[]>;
// SlotOption เดิม { hhmm, startMin, staffId } · เรียง startMin · ไม่มีเวลาซ้ำ

export type BookInput = { serviceId: string; staffId: string | null; dateStr: string; startMin: number; channel: BookingChannel;
  customerName: string; customerPhone: string; note?: string; idempotencyKey?: string };
export type BookFailCode = "FULL" | "PAST" | "LEAD_TIME" | "BEYOND_HORIZON" | "OFF_GRID" | "OUTSIDE_HOURS" | "PHONE_LIMIT"
  | "NOT_QUALIFIED" | "ON_LEAVE" | "NOT_FOUND" | "ANY_DISABLED" | "BAD_INPUT"
  | "RELEASED";   // ORACLE-EDIT 28 ต.ค. (review G3)
export type BookResult =
  | { ok: true; id: string; staffId: string; status: "PENDING" | "CONFIRMED"; holdUntil: Date | null }
  | { ok: false; code: BookFailCode; reason: string };          // reason ไทย ไม่โทษผู้ใช้
export async function bookAppointment(ctx: BookingCtx, i: BookInput): Promise<BookResult>;
export async function expireDepositHolds(now: Date): Promise<{ expired: number }>;   // ข้ามร้าน (minute-job)
```

**ช่องเวลา (`findSlots`)** — ช่าง = `staffDayProfiles` (B.1) ของ `ctx.unitId` · ข้ามช่าง `windows=[]` / ทำบริการไม่ได้ (`staffServiceTerms=null`) · `dur` = นาทีเฉพาะคน · `buf` = `service.bufferMin`
1. บริการ: `active` (ทุกช่อง) + `bookable` (SELF) · ไม่พบ/ร้านอื่น/สาขาอื่น/วันที่ไม่จริง ⇒ `[]`
2. กริด: `t` = ผลคูณของ `booking.booking.slotStepMin` **นับจากเที่ยงคืน** ภายในหน้าต่างช่าง โดย `t + dur ≤ ปลายหน้าต่าง` (buffer เลยปิดได้ = รุ่นแรก) · ใช้ step เดียวกันทุกช่อง
3. เวลา: STAFF/PHONE ⇒ `startAt > now` (รุ่นแรก) · SELF ⇒ `startAt ≥ now + minLeadMin` (refs มี serviceId) และ `dateStr ≤ วันนี้(ไทย) + horizonDays − 1` (`_fallback` 14 = `nextDays(14)` รุ่นแรก)
4. นัดที่ถือช่อง = สถานะใดก็ได้ **ยกเว้น CANCELLED/NO_SHOW** (รวม PENDING/ถือมัดจำ · QUEUED · IN_SERVICE · LATE · DONE) ของช่างนั้นในวันนั้น
5. ชน: STAFF/PHONE = ซ้อนช่วง `[t, t+dur+buf)` กับ `[startAt, endAt)` · SELF = **พักขั้นต่ำแบบค่ามาก** (B.2 §7 ข้อ 4): ผ่านเมื่อ `t + dur + max(buf, m) ≤ x.start` หรือ `t ≥ x.end − x.buf + max(x.buf, m)` (`m` = `booking.staff.minBreakMin` ของช่าง · `x.buf` = bufferMin ของบริการของนัดนั้น) — m = 0 ได้เท่ารุ่นแรก
6. SELF เพิ่ม: **% ออนไลน์** (§4.3) — `ใช้แล้ว + (dur+buf) ≤ floor(pct × นาทีทำงานวันนั้น / 100)` · นาทีทำงาน = ผลรวมความยาว `profile.windows` · ใช้แล้ว = ผลรวม `endAt−startAt` ของนัดช่างนั้นวันนั้นที่ไม่ CANCELLED/NO_SHOW และ **ช่องทางจริงเป็น SELF** (`channel ∈ {ONLINE, LINE}` หรือ `channel IS NULL AND source = 'ONLINE'` — แถวรุ่นแรก) · `pct = 0` ⇒ ช่างไม่โผล่เลย · **งานสูงสุด/วัน** — นับนัดทุกช่องทางที่ไม่ CANCELLED/NO_SHOW ≥ `maxJobsPerDay` ⇒ ไม่โผล่
7. **ใครก็ได้** (`staffId=null`) = รวมเวลาของทุกช่างที่ผ่านข้อ 1–6 · `staffId` ต่อเวลา = ช่างแรกตาม `sortOrder → createdAt → id` ที่ว่างเวลานั้น · SELF และ `booking.booking.anyStaffOption=false` ⇒ `[]`
8. ช่างที่ระบุแต่ไม่ใช่ของสาขา/ร้านนี้ ⇒ `[]`

**`bookAppointment`** — ตรวจตามลำดับนี้ (รหัสแรกที่ล้ม):
1. บริการ/ช่างไม่พบ · inactive · ร้าน/สาขาอื่น · SELF + `bookable=false` ⇒ `NOT_FOUND` · `staffId=null` + SELF + anyStaffOption ปิด ⇒ `ANY_DISABLED` · วันที่/นาทีผิดรูป ⇒ `BAD_INPUT`
2. ช่างระบุตัว: ลา ⇒ `ON_LEAVE` · ทำบริการไม่ได้ ⇒ `NOT_QUALIFIED`
3. `startAt ≤ now` ⇒ `PAST` (ทุกช่อง) · SELF: เกิน horizon ⇒ `BEYOND_HORIZON` · ไม่ถึง lead ⇒ `LEAD_TIME` · ไม่ลงกริด ⇒ `OFF_GRID` · ช่างระบุตัวและช่วงไม่อยู่ในหน้าต่าง ⇒ `OUTSIDE_HOURS`
4. ใต้ล็อก: SELF + `maxOpenPerPhone ≠ null` ⇒ นับ **นัดค้าง** ของเบอร์ในสาขานี้ (สถานะ PENDING/CONFIRMED · `startAt > now` · ทุกช่องทาง · เทียบเบอร์ด้วย `normalizePartyPhone` — `081-234-5678` = `0812345678` = `+66812345678`) ≥ เพดาน ⇒ `PHONE_LIMIT` · ร้านจองให้ไม่ติดเพดาน (แต่ถูกนับ)
5. ใต้ล็อกช่าง: ชน (ข้อ 5 ของช่อง) / % ออนไลน์เต็ม / งานสูงสุดเต็ม ⇒ `FULL` — **SELF เห็นแค่ "เต็ม"**: `reason` ของ 3 กรณีนี้ต้อง **เป็นข้อความเดียวกัน** (ไม่บอกว่ากันไว้ให้ walk-in · §4.3) · ใครก็ได้ = ลองช่างที่เข้าเกณฑ์ไล่ตามลำดับข้อ 7 ภายใต้ล็อก — ช่างแรกเต็มเพราะคำขออื่นเพิ่งได้ไป ⇒ ลองคนถัดไป (10 คำขอพร้อมกัน ช่างว่าง 5 คน ⇒ ได้ 5 พอดี)
6. idempotencyKey ซ้ำ (ทั้งลำดับและพร้อมกัน) ⇒ `ok:true` id เดิม (ไม่ติดเพดานใด) · แถวเดียว
   **ORACLE-EDIT 28 ต.ค. (review G1 G3):** ล็อกลำดับคงที่ **idem → เบอร์ → ช่าง** — ล็อก advisory ของ `(tenantId, idempotencyKey)` เป็นตัวแรก แล้วค้นแถวเดิมซ้ำใต้ล็อกนั้น (คำขอที่แพ้ต้องได้แถวผู้ชนะ ไม่ใช่ `FULL` — แม้สาขาไม่มีเพดานเบอร์ / ช่อง STAFF) · key มีอยู่แต่เป็นของ **สาขาอื่น** ⇒ `BAD_INPUT` (ทั้งทางเช็กใน tx และทาง P2002 — ห้ามคืน id ข้ามสาขา) · key เดิมแต่ข้อมูลจองต่าง (บริการ · ช่าง/ANY · วัน · startMin · เบอร์ที่ normalize แล้ว) ⇒ `BAD_INPUT` · แถวเดิมเป็น CANCELLED/NO_SHOW (รวมปล่อยเพราะมัดจำ) ⇒ `{ ok:false, code:"RELEASED", reason:"การจองนี้ถูกยกเลิกแล้ว…" }` — ห้ามแปลงสถานะที่ไม่รู้จักเป็น CONFIRMED
   **ธุรกรรม (G2):** ห้ามใช้ connection ที่สองขณะถือล็อก — หา/สร้างลูกค้า (member.findOrCreate) + Party **นอกธุรกรรม ก่อนล็อก** (ชน P2002 `Customer(memberSystemId, phone)` ⇒ อ่านแถวผู้ชนะซ้ำ) แล้วส่ง id เข้า tx · `$transaction` `maxWait ≤ 20 000` · `timeout ≤ 30 000` ms · สาขาเชื่อมสมาชิก ลูกค้าใหม่ 20 ทางในโพรเซสเดียว ⇒ ไม่มี throw
   **เบอร์ (G6):** คีย์เพดานเบอร์ = เบอร์ที่ normalize ฝั่งจองคิว (JS และ SQL ต้องเท่ากัน): `0066…`/`+66…`/`66…` ⇒ ขึ้นต้น `0` แบบเดียวกับ `08…` (`0066874441234` = `0874441234`) · ห้ามแก้ `normalizePartyPhone` ของ party · เหลือแค่ `"0"` หรือว่าง ⇒ `BAD_INPUT
7. แถวที่เขียน: `kind="BOOKED"` · `channel` = ช่องที่ส่ง · `source` = `"ONLINE"` (SELF) / `"STAFF"` (ร้าน) · `assignMode` = `"ANY"` ถ้า `staffId=null` ไม่งั้น `"SPECIFIC"` · `endAt = start + dur + buf` (ความหมายเดิม — พักขั้นต่ำไม่ใส่ใน endAt) · `priceSatang` = ราคาเฉพาะคน ?? ราคาบริการ · `depositSatang = computeDepositSatang(booking.deposit.amount, { priceSatang: ราคาเฉพาะคน, durationMin: dur, serviceDepositSatang })` · `policySnapshot = snapshotPolicy(ctx, "appointment", { unitId, staffId, serviceId })` (**ทุกช่องทาง**) · สมาชิก/ไทม์ไลน์/Party แบบ `createAppointment`
8. สถานะ: ร้านจองให้ ⇒ `CONFIRMED` · SELF ⇒ `PENDING` ถ้า `requireConfirm` (refs มี serviceId) **หรือ** ถือช่องมัดจำ ไม่งั้น `CONFIRMED`
9. **ถือช่องมัดจำ** = SELF และ `deposit.method ≠ "NONE"` และ `depositSatang > 0` และ `payWithinMin ≠ null` ⇒ `holdUntil = createdAt + payWithinMin นาที` (ค่าจาก snapshot) · อื่น ⇒ `holdUntil = null` · ร้านจองให้ไม่ถือ (เก็บมัดจำที่เคาน์เตอร์แบบเดิม)

### 3.3 ปล่อยช่องที่ไม่จ่ายมัดจำ (minute-job)
- `expireDepositHolds(now)`: นัด `status='PENDING'` · `depositPaidAt IS NULL` · `depositSatang > 0` · `channel IN ('ONLINE','LINE')` · snapshot `deposit.method ≠ 'NONE'` · snapshot `payWithinMin` เป็นตัวเลข · `createdAt + payWithinMin ≤ now` ⇒ `CANCELLED` + `cancelReason='DEPOSIT_TIMEOUT'` · **ค่าจาก snapshot ชนะค่าตั้งปัจจุบัน** (CC §1.6) · `UPDATE … WHERE` มีเงื่อนไขสถานะ (+ `FOR UPDATE SKIP LOCKED` เป็นก้อน แบบ `rooms.expireHolds`) ⇒ เรียกซ้อน 2 รอบ แต่ละแถวถูกปล่อยครั้งเดียว (X5) · คืนจำนวนที่ปล่อยจริง · ไม่ยิง event (event `booking.cancelled` = B.7 — ส่งต่อ §7)
- ลงทะเบียนใน `minute-jobs.ts`: `registerMinuteJob({ name: "booking.depositHolds.expire", everyMinutes: 1, cadence: "minute", run: async (now) => (await import("@/lib/modules/booking/service")).expireDepositHolds(now) })` (ไม่ใช่ vpsOnly · โหลดตอนรัน)

### 3.4 ทางเดิมที่ต้องอุดเพราะ B.3 สร้างนัดถูกปล่อยอัตโนมัติ (ORACLE-EDIT 28 ต.ค. · review G4 G5)
- **`recordDeposit`** (G4): claim อะตอมมิก — อัปเดตเฉพาะเมื่อ `status ∈ {PENDING, CONFIRMED}` **และ** `depositPaidAt IS NULL` · ตรวจสถานะก่อนเปิดบิล POS · นัดถูกยกเลิก/ปล่อยแล้ว ⇒ `{ ok:false, reason ไทย }` ไม่เปิดบิล ไม่ปั๊ม `depositPaidAt` · แข่งกับ `expireDepositHolds` ⇒ ได้ผลอย่างใดอย่างหนึ่งเท่านั้น (จ่ายแล้วไม่ถูกปล่อย หรือ ปล่อยแล้วจ่ายไม่ได้) · ไม่มีแถว `CANCELLED` ที่ `depositPaidAt` ไม่ว่าง
- **`setAppointmentStatus`** (G5): จาก CANCELLED/NO_SHOW กลับเป็นสถานะที่ถือช่อง ⇒ ล็อก `BookingStaff FOR UPDATE` (ตัวเดียวกัน) + ตรวจชนกับนัด active ของช่าง · ชน ⇒ `{ ok:false, reason ไทย }` แถวไม่เปลี่ยน · สำเร็จ ⇒ ล้าง `cancelReason` · เปลี่ยนสถานะอื่นพฤติกรรมเดิม

## 4. ไม่ใช่เรื่องของใบนี้
- route สาธารณะ/หน้าจองลูกค้า/ลิงก์จัดการนัด/event created-cancelled = **B.7** (สลับ route ไปใช้ `findSlots`/`bookAppointment` ช่อง ONLINE/LINE) · ระหว่างนี้ route เดิมยังเรียกตัวรุ่นแรก (ตั้งใจ — ร้านเดิมไม่เปลี่ยนจนกว่า B.7)
- รับสลิป/ยืนยันมัดจำ ⇒ CONFIRMED · ยกเว้นสมาชิกระดับ (#37) · สลิปมาหลังช่องหมดเวลา = **B.8**
- ร้านกดยืนยันนัด PENDING (ไม่มีมัดจำ) และหมดอายุของ PENDING แบบนั้น = จอ B.5 (ไม่มีค่าตั้งให้หมดอายุ)
- ช่าง "ลูกค้าเลือกชื่อได้" (#10) · ซ่อนช่าง 0% จากตัวเลือกบนหน้าจอง = B.7 (ใบนี้ซ่อนในช่องเวลาแล้ว)
- walk-in/บัตรคิว (ช่อง KIOSK/REMOTE) = B.4

## 5. เกณฑ์รับ
- «scripts/qc-svc-b.3.mts» เขียวทุกข้อ — หมวด: **P** pure (planSettingsFrom 4 แม่แบบ · คีย์ · throw/ไม่แก้ input · computeDepositSatang · ความบริสุทธิ์) · **PS** resolve จริง → PlanSettings · **S** findSlots (เท่ารุ่นแรกช่อง STAFF · หน้าต่าง/skill/นาทีเฉพาะคน · ใครก็ได้ = รวม · 0% · % ออนไลน์ · งานสูงสุด · พักขั้นต่ำค่ามาก · สถานะถือช่อง · lead (+รายบริการ) · horizon · step · คอลัมน์ชนะ · ใครก็ได้ปิด · X1) · **B** bookAppointment (แถวที่เขียน · รหัสล้มทุกตัว · ร้านยืนยันก่อน · เพดานต่อเบอร์ · % ออนไลน์ "เต็ม" แต่พนักงานจองได้ · ถือช่องมัดจำ · ร้านเดิม · idempotency · X1) · **H** ปล่อยช่อง (ยังไม่ถึง/ถึง · snapshot ชนะ · ไม่แตะแถวที่ไม่ใช่ hold · X5 · minute-job) · **X** ยิงพร้อมกันข้ามโพรเซส (X3-0 ตัวควบคุมรุ่นแรก · ช่องเดียว 10 ⇒ 1 · ใครก็ได้ 10 ⇒ 5 · % ออนไลน์ 10 ⇒ 2 · เบอร์เดียว 10 ⇒ 2 · ตัวควบคุมบวก 10 ⇒ 10 สองชุด · ผสมตัวเก่า/ใหม่ ⇒ 1 · idempotency 10 ⇒ แถวเดียว) · **TZ** · **Z** ล้างข้อมูลหมด · **ST** ไฟล์/ไม่มี migration/เวลาไทย/pure/minute-job · **G** regression
- regression (G): `qc-booking-race` `qc-booking-deposit` `qc-booking-edit-schedule` `qc-booking-hours-hr` `qc-hr-leave-booking` `qc-svc-b.1` (รันด้วย `SVC_B1_NO_REGRESSION=1` · ผ่าน = ไม่มี FAIL และ SKIP มีแค่ G-*/ST-1) `qc-svc-b.2` `qc-svc-smoke`
- typecheck + fitness 2 โหมด (ผู้คุมรัน) · ตรวจเข้ม 2 รอบ (กันจองซ้อน)
- ข้อสอบตรวจตัวเองแล้ว 28 ต.ค. (โค้ดก่อน B.3): **เขียวอยู่แล้วและต้องเขียวต่อ** = P-0 (ค่าแม่แบบในข้อสอบตรงทะเบียน) · S-0 (getAvailableSlots ตัวเดิมยังทำงานบนแม่แบบตัดผม) · X3-0 (สายยิงข้ามโพรเซสทำงาน + ตัวกันเดิมให้ 1) · ST-2 · ST-4 · Z-1 · ที่เหลือแดงเพราะยังไม่มี export/งาน (ดูผลรันใน wo-notes)

## 5b. ORACLE-EDIT 28 ต.ค. (review) — ข้อสอบเพิ่ม 10 ข้อ (65 → 75)
B-16 (key เดิมข้อมูลต่าง/สาขาอื่น ⇒ BAD_INPUT · เบอร์ "+66"/"66"/"0066"/ว่าง ⇒ BAD_INPUT) · H-6 (replay หลังปล่อย/NO_SHOW ⇒ RELEASED) · H-7 (recordDeposit หลังปล่อย ⇒ ปฏิเสธ + แข่ง 10 รอบ) · H-8 (ปลุกนัดทับช่องที่ถูกจอง ⇒ ปฏิเสธ · ช่องว่าง ⇒ ได้) · X3-4b (เบอร์ 10 รูปแบบ ⇒ 2) · X3-9/X3-9b (key เดียว 10 ทาง สาขาไม่มีเพดานเบอร์ ONLINE/STAFF ⇒ ok id เดียว) · X3-10 (key เดียว 2 สาขา ⇒ สาขาที่สอง BAD_INPUT) · X3-11 (สาขาเชื่อมสมาชิก ลูกค้าใหม่ 20 ทางโพรเซสเดียว ⇒ 0 throw · ได้ 6 = จำนวนช่าง) · X3-12 (เบอร์ใหม่เดียว 10 ทาง STAFF+ONLINE ⇒ 0 throw · Customer 1 แถว) · B-4 ใช้วันพรุ่งนี้แทน now+75 (เปราะ 22:00–22:30 ไทย)

## 6. จุดที่แบบไม่ชัด — ผู้เขียนข้อสอบเลือกแล้ว (ผู้คุมเคาะได้ · เปลี่ยน = ORACLE-EDIT)
1. **ไม่ต้องมีคอลัมน์ใหม่**: เวลาหมดของการถือช่อง = `createdAt + snapshot payWithinMin` (มี `policySnapshot` จาก B.0 แล้ว) · ช่องทางจาก `channel` (B.0) · เหตุผลจาก `cancelReason` (B.0) — หนี้ดัชนี: partial `Appointment(createdAt) WHERE status='PENDING' AND "depositPaidAt" IS NULL` ให้ migration ถัดไป (ตอนนี้ minute-job สแกนตามดัชนี tenantId/startAt ไม่ได้ — ปริมาณ QC เล็ก)
2. **เพิ่มฟังก์ชันใหม่ ไม่แก้ตัวเดิม**: `getAvailableSlots`/`createAppointment` = รุ่นแรก (+B.1) ใช้ต่อในหน้าร้าน/AI/seed · ทางออนไลน์ใหม่ = `findSlots`/`bookAppointment` (B.7 สลับ route) — เพราะ `qc-booking-race` จองช่อง ONLINE ปี 2031 บนร้าน `_fallback` (horizon 14) ถ้าบังคับในตัวเดิมจะแดง
3. "เฉพาะช่อง ONLINE" ตีความเป็น SELF = `ONLINE` + `LINE` (ลูกค้าจองเองผ่าน OA ก็คือออนไลน์) · แถวรุ่นแรก `channel=null, source='ONLINE'` นับด้วย
4. นาที % ออนไลน์ = `endAt−startAt` (รวม buffer = เวลาที่ช่างถูกกิน) · ปัดลง (`floor`) · ต่อวันไทย
5. horizon นับเป็นวัน: วันนี้ถึงวันนี้+N−1 (ตรง `nextDays(14)`) · lead/horizon/step/หน้าต่าง/พักขั้นต่ำ/งานสูงสุด **ไม่ใช้กับร้านจองให้** (คงรุ่นแรก)
6. กริด step นับจากเที่ยงคืน (รุ่นแรกนับจากเวลาเปิด — เท่ากันเมื่อเวลาเปิดลงกริด) · ร้านจองให้นาทีใดก็ได้
7. พักขั้นต่ำกับ buffer ใช้ **ค่ามาก** (ตรง B.2 §7 ข้อ 4) · ใช้เฉพาะ SELF
8. นัดค้างต่อเบอร์ = PENDING/CONFIRMED ที่ยังไม่ถึงเวลา ในสาขาเดียวกัน (#25 ขอบเขตสาขา) · นับทุกช่องทาง แต่บังคับเฉพาะ SELF
9. นัดถือช่อง = ทุกสถานะยกเว้น CANCELLED/NO_SHOW (carry B.0: QUEUED/IN_SERVICE/LATE) — walk-in QUEUED จะถือช่องที่ `startAt` ของแถว (B.4 ต้องตั้ง startAt/endAt ของ walk-in ให้มีความหมาย หรือแยกการนับ — ส่งต่อ)
10. ร้านยืนยันก่อน + ถือมัดจำซ้อนกัน: สถานะ PENDING เดียว · หมดเวลาตาม hold · จ่ายแล้วยังรอร้านยืนยัน = B.8 เคาะ
11. `ON_LEAVE` ยังบอกชื่อช่างลาแบบรุ่นแรก (ไม่รวมเป็น FULL)
12. `computeDepositSatang` ปัด `Math.round` (ครึ่งขึ้น) · ใช้ราคา/นาทีเฉพาะคน · `method=NONE` + `PER_SERVICE` = มัดจำเคาน์เตอร์แบบรุ่นแรก (ไม่ถือช่อง)
13. `noShowAfterMin=null` ⇒ `Infinity` ใน PlanSettings (planner คูณแล้วไม่ถึงเสมอ — B.4 ห้ามเก็บ PlanSettings เป็น JSON โดยตรง)

## 7. ส่งต่อใบหลัง
- **B.7**: route ใช้ `findSlots`/`bookAppointment(channel ONLINE/LINE)` · แปลง `FULL` เป็น "เต็ม" · event `booking.created`/`booking.cancelled` (+ ปล่อยช่องมัดจำต้องยิง `booking.cancelled` reason DEPOSIT_TIMEOUT เมื่อมี event แล้ว — แก้ `expireDepositHolds` ในใบนั้น) · ซ่อนช่าง 0%/customerCanChoose=false บนหน้าจอง
- **B.8**: จ่ายมัดจำแข่งกับหมดเวลา — `expireDepositHolds` เงื่อนไข `depositPaidAt IS NULL` ใน UPDATE · `recordDeposit` ปิดฝั่งกลับแล้วใน B.3 (§3.4) · ทางสลิปของ B.8 ต้อง claim แบบเดียวกัน · นัดจ่ายแล้วยังค้าง PENDING ⇒ B.8 ยืนยัน
- **หนี้หลังผู้ตรวจ (ไม่บล็อก · /root/svc-runs/fix/b3.md)**: bufferMin ของนัดเดิมใช้ค่าบริการปัจจุบัน (ควรอยู่ใน snapshot — B.4) · "ใครก็ได้" ถือล็อกช่างคนก่อนจน commit · โปรไฟล์ช่าง/ลาอ่านนอกล็อก · cast ใน expireDepositHolds อาจล้มทั้งงานเมื่อ snapshot เสีย · createdAt (นาฬิกา DB) เทียบนาฬิกาแอประดับวินาที · createAppointment รุ่นแรกคืน id ข้ามสาขา (B.7 สลับ route) · `member.findOrCreate` ไม่ส่ง client ต่อให้ Party (เจ้าของโมดูลสมาชิก)
- **B.4**: ใช้ `PLAN_SETTING_KEYS` + `planSettingsFrom` · walk-in ถือช่อง (ข้อ 6.9)

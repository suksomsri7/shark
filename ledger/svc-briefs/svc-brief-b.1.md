# ใบสั่ง B.1 — เวลาต่อช่าง + ช่าง↔บริการ · ตรวจ: เบา (รอบเดียว) · ห้ามตัด: แยกร้าน (X1)

> อ้างอิง: MASTER-PLAN แถว B.1 · `DESIGN-BOOKING-QUEUE.md` §4.2 (ข้อมูลเข้า) · R1 · BQ-1 · §9 `BookingStaffService` · ภาคผนวก ก #5–#11 #24 · CC §1.4 (resolver) §6.1 · ใบ B.0 §8 (`_fallback` = รุ่นแรก) §9 · ใบ B.2 §3 (`PlanStaff.windows/services`) §8 ข้อ 5 (planner รวมหน้าต่างเองได้)
> ข้อสอบ (ห้ามแก้): «scripts/qc-svc-b.1.mts» — รับใบ = **ผ่านทุกข้อ ไม่มี SKIP** (นับจาก `JSON_SUMMARY`)
> รัน: `bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-b.1.mts` (ห้าม `timeout` ครอบ · ท้ายชุดเรียก regression เอง — นาน · `SVC_B1_NO_REGRESSION=1` = ข้าม G เป็น SKIP ซึ่งไม่นับผ่าน)
> builder: **ห้าม build/next · ห้าม commit/push · ห้าม `pnpm install` · ห้ามแตะ schema/migration · ห้ามแก้ข้อสอบ** · รายงานต่อข้อ (id → ผล)
> ฐานเทียบ (git diff ในข้อสอบหมวด ST) = `b505f61f`

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ (แตะนอกนี้ = ตีกลับ · ข้อสอบ ST-3 ไล่ git diff)
| ไฟล์ | ทำอะไร |
|---|---|
| «src/lib/modules/booking/staff-hours.ts» (ใหม่ · **pure**) | §3.1 |
| `src/lib/modules/booking/service.ts` | §3.2 `staffDayProfiles` · `getAvailableSlots` · `createAppointment` |
| `src/lib/modules/booking/slots.ts` · `src/lib/modules/booking/index.ts` | แก้ได้ถ้าจำเป็น (เพิ่ม re-export ใน facade ได้) |
| `src/lib/modules/hr/index.ts` | §3.3 `staffWindows()` คืน `[]` — **HR จุดเดียวที่แตะได้** (SVC-RUN §1.1 ข้อ 3) · เพิ่มอย่างเดียว ไม่ลบบรรทัด · ห้าม import `@/lib/core/db` |

ห้ามแตะ: `prisma/**` · ไฟล์ HR อื่นทุกไฟล์ · `src/lib/core/settings/**` (defs เป็นของ B.0) · `planner.ts` (B.2) · หน้าจอ (จอช่าง/ตั้งค่า = B.11) · ข้อสอบ

## 2. หลักการ
- ร้านเดิม (ยังไม่เลือกแม่แบบ ⇒ `_fallback`: `booking.staff.hoursSource = ["UNIT_HOURS"]` · `servicesMode = "ALL"`) **ได้ผล `getAvailableSlots` เหมือนรุ่นแรกทุกไบต์** (`JSON.stringify` เทียบกับตัวอ้างอิงรุ่นแรกในข้อสอบ — ลำดับ key `{ startMin, hhmm, staffId }` เดิม) แม้มีแถว `BookingStaffHours` ค้างจากสมัยก่อน (รุ่นแรกไม่อ่านตารางนั้น)
- ค่าตั้งอ่านผ่าน resolver เท่านั้น (`resolveSettingsMany(ctx, keys, refs[])` refs = `{ unitId, staffId }`) · ห้ามแคชข้ามคำขอ
- เวลาไทยแบบ `slots.ts` (`localToUtc` · `localWeekday` ใช้ `getUTCDay` ของสตริงวันที่) · **ห้าม `getDay()/getHours()/getDate()/getMinutes()` ดิบ** ในไฟล์ที่ใบแตะ (ข้อสอบรันใน TZ +14 / −11 / New York เทียบผล)

## 3. สัญญา (ข้อสอบมีสำเนาชนิด — ชื่อ field ต้องตรง)

### 3.1 «staff-hours.ts» (pure: import ได้เฉพาะ `./slots` + `import type` · ไม่มี prisma/db/next · ไม่มี `Date.now()` / `new Date()` ไม่มีอาร์กิวเมนต์ / `Math.random` · ห้ามแก้ object ที่รับเข้า)
```ts
export type HoursSource = "HR_SHIFT" | "STAFF_WEEKLY" | "UNIT_HOURS";
export type MinWindow = { startMin: number; endMin: number };            // นาทีจากเที่ยงคืนของวันไทย
export type UnitHoursRow = { weekday: number; openMin: number; closeMin: number; closed: boolean }; // = แบบ getUnitHours

/** เวลาร้านของวันนั้น (BookingHours 7 แถว + BookingClosure) — ตรรกะเดิมของ getAvailableSlots ทุกกรณี (รวมกรณีแปลก: closure เปิดแต่ไม่ใส่เวลา ⇒ ใช้เวลาของ weekday แม้วันนั้นปิด) */
export function unitDayWindows(i: { dateStr: string; hours: readonly UnitHoursRow[];
  closure: { closed: boolean; openMin: number | null; closeMin: number | null } | null }): MinWindow[];   // [] = ปิด · มากสุด 1 ช่วง

export type StaffDayInput = {
  dateStr: string;                          // "YYYY-MM-DD" ไทย — weekday คิดจากสตริง
  order: readonly HoursSource[];            // booking.staff.hoursSource ที่ resolve แล้ว
  hrShift: { windows: MinWindow[]; breaks: MinWindow[] } | null;   // null = ไม่มีกะ (ไม่มี HR/ไม่ผูกพนักงาน/HR ไม่คืนแถวของคนนี้)
  weekly: { weekday: number; startMin: number; endMin: number }[]; // BookingStaffHours ทุกแถวของช่าง (ทุก weekday)
  unitDay: MinWindow[];                     // ผลของ unitDayWindows
  onLeave: boolean;                         // C-2 (employeesUnavailable)
};
export type StaffDayWindows = { source: HoursSource | null; windows: MinWindow[] };
export function staffDayWindows(i: StaffDayInput): StaffDayWindows;

/** หน้าต่างนาที → epoch ms (ป้อน PlanStaff.windows ของ B.2) */
export function windowsToEpoch(dateStr: string, w: readonly MinWindow[]): { startAt: number; endAt: number }[];

export type StaffServiceRow = { serviceId: string; durationMin: number | null; priceSatang: number | null };
/** null = ช่างทำบริการนี้ไม่ได้ · ค่าเฉพาะคนชนะของบริการ (null ในแถว = ตามบริการ) */
export function staffServiceTerms(services: readonly StaffServiceRow[] | null,
  service: { id: string; durationMin: number; priceSatang: number }): { durationMin: number; priceSatang: number } | null;
```
**กติกา `staffDayWindows`** (ลำดับ):
1. แหล่ง "มีข้อมูล" เมื่อ — `HR_SHIFT`: `hrShift !== null` (แม้ `windows=[]` = วันหยุดตามกะ ⇒ **ไม่ตกไปแหล่งถัดไป**) · `STAFF_WEEKLY`: มีแถวที่ถูกต้อง ≥ 1 แถว (weekday 0–6 · start < end) ของ **weekday ใดก็ได้** — ไม่มีแถวของวันนี้ = ไม่ทำงานวันนี้ · `UNIT_HOURS`: เสมอ
2. ไล่ `order` เอาแหล่งแรกที่มีข้อมูล ⇒ `source` · ไม่มีเลย ⇒ `{ source: null, windows: [] }`
3. หน้าต่าง: HR = `windows − breaks` · WEEKLY = แถวของ weekday นี้ · UNIT = `unitDay`
4. **ตัดด้วยเวลาร้านของวัน** (`∩ unitDay` — ร้านปิด/ปิดพิเศษ ⇒ ไม่มีช่องแม้ช่างมีกะ)
5. ทำให้เป็นแบบเดียว: ตัดเข้า `[0, 1440]` (กะข้ามเที่ยงคืน ⇒ ส่วนเกิน 24:00 ทิ้ง · ไม่ยกไปวันถัดไป) · ทิ้งช่วงว่าง · เรียง · รวมช่วงที่ซ้อน/ชิดกัน
6. `onLeave` ⇒ `windows = []` (ชนะทุกแหล่ง · `source` คงค่าที่คิดได้)

### 3.2 `service.ts`
```ts
export type StaffWindowsFn = (i: { tenantId: string; unitId: string; date: string; employeeIds: string[] }) =>
  Promise<{ employeeId: string; windows: MinWindow[]; breaks: MinWindow[] }[]>;
export type StaffDayProfile = {
  staffId: string; name: string; sortOrder: number; employeeId: string | null; dateStr: string;
  source: HoursSource | null; onLeave: boolean; windows: MinWindow[];
  services: StaffServiceRow[] | null;     // null = ทำทุกบริการ · [] = ไม่มีบริการที่ทำได้
  onlineSharePct: number; maxJobsPerDay: number | null; minBreakMin: number;   // #24 #8 #9 ที่ resolve ต่อช่าง
};
export async function staffDayProfiles(ctx: BookingCtx, dateStr: string,
  opts?: { staffIds?: string[]; hrWindows?: StaffWindowsFn }): Promise<StaffDayProfile[]>;
```
- ช่าง `active` ของ `ctx.unitId` เท่านั้น (tenantDb) เรียง `sortOrder` → `createdAt` → `id` · `staffIds` ที่เป็นของสาขา/ร้านอื่น = ตัดทิ้งเงียบ · `dateStr` ไม่ใช่วันที่จริง (`2031-02-30` · `abc`) ⇒ `[]`
- ค่าตั้งต่อช่าง: `booking.staff.hoursSource` · `booking.staff.servicesMode` · `booking.booking.onlineSharePct` · `booking.staff.maxJobsPerDay` · `booking.staff.minBreakMin` (refs `{unitId, staffId}` · คิวรีชุดเดียว)
- HR: เรียก `opts.hrWindows ?? hr.staffWindows` (จาก facade `@/lib/modules/hr`) **ครั้งเดียวต่อคำขอ** ด้วย `employeeIds` = ช่างที่ผูกพนักงานและ `order` มี `HR_SHIFT` (ไม่ซ้ำ) · ไม่มีใครเข้าเกณฑ์ ⇒ **ไม่เรียกเลย** (ร้านเดิม `_fallback` ไม่แตะ HR) · แถวที่ `employeeId` ไม่อยู่ในชุด = ทิ้ง · HR throw ⇒ ปล่อย throw (ไม่เดา)
- ลา = `staffOnLeave` เดิม (C-2) · เวลาร้าน = `getUnitHours` + `BookingClosure` ของวันผ่าน `unitDayWindows`
- บริการ: แถว `BookingStaffService` ของช่าง **ที่ tenantId+unitId ตรงสาขา** (แถวผิดร้าน/ผิดสาขา = ไม่มีอยู่) · มีแถว ≥ 1 ⇒ เฉพาะแถวนั้น (ทุกโหมด) · ไม่มีแถว ⇒ `servicesMode` `ALL` = `null` · `ASSIGNED` = `[]`

**`getAvailableSlots`** (ลายเซ็นเดิม · ผลแบบเดิม `{ startMin, hhmm, staffId }[]`): บริการตามเดิม (`active && bookable`) · ช่าง = `staffDayProfiles` (กรอง `staffId` ถ้าส่งมา) · ข้ามช่างที่ `staffServiceTerms = null` · กรอบ = `profile.windows` · ระยะ = `terms.durationMin` ของช่างคนนั้น + `service.bufferMin` · ที่เหลือ (นัดที่ถือช่อง · ช่องละ 15 นาที · ช่างแรกตาม sortOrder ต่อเวลา) **ตามเดิม**
**`createAppointment`**: ช่างทำบริการไม่ได้ ⇒ `{ ok: false, reason }` ไทย (ไม่สร้างแถว) · `endAt` = ระยะเฉพาะคน + buffer · `priceSatang` = ราคาเฉพาะคน ?? ราคาบริการ · `depositSatang` ตามบริการเดิม · **ไม่เพิ่ม** การตรวจหน้าต่างเวลา (ของ B.3 — คงพฤติกรรมเดิม: พนักงานลงนัดนอกเวลาได้)

### 3.3 HR facade (`src/lib/modules/hr/index.ts` · BQ-1)
```ts
export type StaffWindowsInput = { tenantId: string; unitId: string; date: string; employeeIds: string[] };
export type StaffWindowsRow = { employeeId: string; windows: { startMin: number; endMin: number }[]; breaks: { startMin: number; endMin: number }[] };
/** กะรายวัน → หน้าต่างเวลาช่าง · ยังไม่มีกะบน main ⇒ [] เสมอ (RUN HR เติมของจริงจาก HrRosterEntry ใบ X-HR.1 · ห้ามเปลี่ยนลายเซ็น) */
export async function staffWindows(_i: StaffWindowsInput): Promise<StaffWindowsRow[]> { return []; }
```

## 4. ไม่ใช่เรื่องของใบนี้
- บังคับ % ออนไลน์ · `maxJobsPerDay` · `minBreakMin` ตอนหาช่อง/จอง = **B.3** (ใบนี้แค่ resolve ใส่ profile · planner B.2 ใช้ผ่าน PlanStaff) · horizon/minLead/ถือช่อง = B.3
- ตัวห่อ planner (แปลง profile → PlanStaff · `windowsToEpoch`) = B.4 · จอช่าง/ตารางสัปดาห์/ผูกบริการ = B.11
- `booking.staff.weeklySchedule` (#7) = ค่าตั้งต้นของจอ B.11 (ช่างใหม่เห็นเวลาร้าน) — ไม่มีผลกับการคำนวณ (แหล่งตัดสินด้วย `hoursSource` + มีแถวหรือไม่)

## 5. เกณฑ์รับ
- «scripts/qc-svc-b.1.mts» เขียวทุกข้อ (P pure + TZ 3 เขต · H facade · FB ร้านเดิมทุกไบต์ · T แม่แบบ/แหล่งเวลา/HR ฉีด/ลา/ปิดร้าน · S ช่าง↔บริการ · X ข้ามร้าน/สาขา · Z TZ ระดับ DB · ST ไฟล์ · G regression `qc-booking-deposit` `qc-booking-race` `qc-booking-edit-schedule` `qc-booking-hours-hr` `qc-hr-leave-booking` `qc-svc-b.2` `qc-svc-smoke`)
- typecheck + fitness 2 โหมด (ผู้คุมรัน · booking→hr ผ่าน facade อยู่ใน ALLOWED_EDGES เดิม)
- ข้อสอบ 60 ข้อ (P 19 · H 2 · FB 5 · T 12 · Z 1 · S 7 · X 4 · ST 3 · G 7) · ตรวจตัวเองแล้ว 28 ต.ค.: FB-3 (ตัวอ้างอิงรุ่นแรก) เขียวกับโค้ดก่อน B.1 = ตัวควบคุมบวก · หมวด P ผ่าน 19/19 กับตัวอ้างอิงทิ้งได้ (`QC_B1_PURE_PATH` ชี้ไฟล์อื่น — ใช้ตรวจข้อสอบเท่านั้น) · กลายพันธุ์ `new Date(ds).getDay()` ถูก P-TZ จับ (TZ −11)

## 6. จุดที่แบบไม่ชัด — ผู้เขียนข้อสอบเลือกแล้ว (ผู้คุมเคาะได้ · เปลี่ยน = ORACLE-EDIT)
1. **เวลาร้านเป็นเพดาน** ของทุกแหล่ง (∩ unitDay) — แบบเขียนแค่ลำดับแหล่ง · เลือกแบบปลอดภัย: ไม่เสนอช่องตอนร้านปิด/ปิดพิเศษ แม้ช่างมีกะ/ตาราง
2. "มีข้อมูล" ของ STAFF_WEEKLY = มีแถวของ weekday ใดก็ได้ (แถวมีแต่ไม่มีวันนี้ = วันหยุดช่าง) · HR คืนแถวของคนนั้นแม้ `windows=[]` = วันหยุดตามกะ (ไม่ตกไปตารางสัปดาห์)
3. **มีแถว `BookingStaffService` = จำกัดเฉพาะแถว ทุกโหมด** (ตามแบบ §9 "ไม่มีแถวเลย = ทำทุกบริการ") · `servicesMode` มีผลเฉพาะช่างที่ไม่มีแถว (ASSIGNED ⇒ ทำไม่ได้เลย — แม่แบบคลินิก) · ผลข้างเคียง: อยากตั้งราคาเฉพาะคนแค่บริการเดียว ต้องผูกทุกบริการที่ทำ (จอ B.11 ต้องบอก)
4. กะข้ามเที่ยงคืน ตัดที่ 24:00 ไม่ยกไปวันถัดไป (ร้านตัดผม/นวด/คลินิกไม่มีเคส · ทำหลังถ้ามีร้าน 24 ชม.)
5. `createAppointment` ไม่ตรวจหน้าต่าง (คงรุ่นแรก — พนักงานลงนอกเวลาได้) · ตรวจแค่ช่างทำบริการได้ (ร้านเดิมไม่มีแถว ⇒ ไม่กระทบ)
6. ลำดับช่างเท่ากัน (sortOrder ซ้ำ) รุ่นแรกไม่กำหนด ⇒ ใช้ `createdAt → id` (ตัวอ้างอิงในข้อสอบใช้ลำดับนี้)
7. HR ฉีดผ่าน `opts.hrWindows` (ทางทดสอบ — facade จริงคืน `[]` จน RUN HR) · `getAvailableSlots` ใช้ facade จริงเสมอ
8. แถวเวลาสัปดาห์ที่ผิด (`start ≥ end` · weekday นอก 0–6) ทิ้ง — ถ้าเหลือ 0 แถว = ไม่มีตารางสัปดาห์

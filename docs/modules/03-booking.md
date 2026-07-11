# โมดูล 3: Booking — จองคิวนัดหมายตามเวลา (Appointment Scheduling)

> 🔄 REVISED หลัง QC — สอดคล้อง RESOLUTIONS.md (2026-07-11)
> scope: **unit** (ทุกตารางมี `tenantId + unitId`) · ยึด `_CONVENTIONS.md` + `BLUEPRINT.md` + `BLUEPRINT_BUSINESS_UNITS.md`
> กลุ่มเป้าหมาย: ร้านตัดผม / ทำเล็บ / ทำผม / นวด / สปา / คลินิก (ธุรกิจบริการที่ขาย "เวลา + คน")
> คู่แฝด: โมดูล 4 (Q) = walk-in มาก่อนได้ก่อน · Booking = นัดล่วงหน้าตามเวลา — มี handoff ระหว่างกัน (ดูข้อ 8.6)

---

## 1. ภาพรวม + ขอบเขต

### ทำอะไร (v1 / MVP ✅)
- **Service catalog**: หมวดบริการ + บริการ (ชื่อ, ระยะเวลา, ราคา, buffer ก่อน/หลัง, รูป, สถานะเปิด/ปิดรับจอง)
- **Staff (ช่าง/หมอ/หมอนวด)**: โปรไฟล์ + skill mapping (ใครทำบริการไหนได้ + override ระยะเวลา/ราคา รายคน)
- **ตารางเวลา**: เวลาทำงานรายสัปดาห์ต่อช่าง, พักเบรก, วันหยุดร้าน, ลารายวัน/รายชั่วโมง
- **Slot engine**: คำนวณช่องว่างจริงจาก duration + buffer + ตารางช่าง + นัดที่มีอยู่ — กันจองซ้ำด้วย transaction lock
- **ช่องทางจอง**: storefront (ลูกค้าเลือกบริการ → ช่างหรือ "ช่างคนไหนก็ได้" → เวลา) + หน้าร้าน/รับโทรศัพท์ (staff สร้างให้)
- **วงจรสถานะนัด**: `PENDING → CONFIRMED → ARRIVED → IN_SERVICE → DONE` + `NO_SHOW` / `CANCELLED`
- **เลื่อน/ยกเลิกนัด** + นโยบาย (ล่วงหน้ากี่ชั่วโมง, เลื่อนได้กี่ครั้ง, ใครยกเลิกได้)
- **เตือนก่อนถึงนัด** ผ่าน notify contract (email/LINE) — ตั้งได้หลายรอบ (เช่น 24 ชม. + 2 ชม.)
- **No-show tracking + blacklist policy** (นับสถิติรายลูกค้า → บังคับยืนยัน/บล็อกจองออนไลน์อัตโนมัติ)
- **ปฏิทินร้าน**: day view / week view แยกคอลัมน์ต่อช่าง, drag ดูรายละเอียด, สร้างนัด walk-in เร็ว
- **ชำระจบงานผ่าน POS** (`createSale` sourceModule `BOOKING`) → แต้ม/บัญชีไหลอัตโนมัติ
- **รายงาน**: utilization ต่อช่าง, no-show rate, บริการยอดนิยม, รายได้ตามบริการ/ช่าง

### ยังไม่ทำใน v1 (🔜 Phase ถัดไป)
- 🔜 **มัดจำ (deposit)** — เก็บเงินล่วงหน้าตอนจองผ่าน PromptPay/gateway, คืน/ยึดตามนโยบาย (schema เผื่อ field ไว้แล้ว)
- 🔜 **Recurring appointment** — นัดประจำทุกสัปดาห์/เดือน (คอร์สนวด 10 ครั้ง, ติดตามอาการคลินิก)
- 🔜 **ทรัพยากรประกอบ (Resource)** — ห้อง/เตียง/เก้าอี้เป็นคอขวดที่สอง (v1 ถือว่าช่าง 1 คน = 1 slot)
- 🔜 **บริการหลายช่างพร้อมกัน** (เช่น นวด 4 มือ), **แพ็กเกจ/คอร์ส** (ตัดรอบจากคอร์สที่ซื้อไว้)
- 🔜 **Waitlist** (คิวรอเสียบเมื่อมีคนยกเลิก), **Google Calendar sync ต่อช่าง**
- ❌ ไม่ทำ: payroll/คอมมิชชั่นช่าง (อยู่โมดูล Account/HR อนาคต), ระบบเวชระเบียน (เกิน scope คลินิกทั่วไป — v1 มีแค่ note ต่อนัด)

---

## 2. Persona & User Stories

| Persona | บทบาทในโมดูลนี้ |
|---|---|
| **Owner** (เจ้าของร้าน) | ตั้งค่า catalog/นโยบาย, ดูรายงานทุกหน่วย, จัดการทุกอย่างได้ |
| **Manager** (ผู้จัดการหน่วย) | จัดตารางช่าง, อนุมัติลา, แก้นัด, ดูรายงานหน่วยตัวเอง |
| **Staff — Front desk** (พนักงานหน้าร้าน) | รับจองโทร/walk-in, เช็คอินลูกค้า, เลื่อน/ยกเลิก, เก็บเงินผ่าน POS |
| **Staff — Service provider** (ช่าง/หมอ — อาจไม่มี login) | เห็นตารางตัวเอง (ถ้ามี login), ถูก assign นัด |
| **Customer** (ลูกค้า) | จองออนไลน์, เลื่อน/ยกเลิกเองในกรอบนโยบาย, รับการแจ้งเตือน, สะสมแต้ม |

User stories หลัก:
1. (Customer) เลือก "ทำสีผม 2 ชม. กับช่างเมย์ พฤหัสบ่าย" จากมือถือ ใน 4 จอจบ ไม่ต้องโทร
2. (Customer) เลือก "ช่างคนไหนก็ได้" แล้วระบบหาช่างว่างที่ทำบริการนี้เป็นให้เอง
3. (Front desk) ลูกค้าโทรมา → พิมพ์ชื่อ/เบอร์ → เห็น slot ว่างทันที → จองใน 30 วินาที
4. (Front desk) ลูกค้ามาถึง → กด ARRIVED → (ถ้าเปิด Q) ได้บัตรคิวลัดอัตโนมัติ → ช่างว่างกด IN_SERVICE
5. (Manager) ช่างลาป่วยเช้านี้ → กดลาให้ → ระบบชี้นัดที่ชนให้เลื่อน/ย้ายช่างเป็นรายนัด
6. (Owner) เห็นเลยว่าช่างคนไหน utilization 90% คนไหน 40% และบริการไหนควรขึ้นราคา
7. (Owner) ลูกค้าเบี้ยว 3 ครั้ง → ระบบบล็อกจองออนไลน์อัตโนมัติตามนโยบายที่ตั้งไว้

---

## 3. ฟังก์ชันทั้งหมด

### 3.1 Service Catalog ✅
- หมวดบริการ (`BookingCategory`): ชื่อ TH/EN, ลำดับ, ซ่อน/แสดง
- บริการ (`BookingService`):
  - ชื่อ TH/EN, คำอธิบาย, รูป (≤5), หมวด
  - `durationMin` (นาทีให้บริการจริง เช่น 60)
  - `bufferBeforeMin` / `bufferAfterMin` (เตรียมของ/เก็บกวาด เช่น ทำสีผมต้องล้างอุปกรณ์ 15 นาที) — buffer กินเวลาช่างแต่**ไม่แสดง**ให้ลูกค้าเห็นเป็นเวลานัด
  - `priceSatang Int` (เงินสตางค์เสมอ), `priceNote` ("เริ่มต้น" สำหรับราคาแปรผัน)
  - `onlineBookable` (บางบริการรับเฉพาะหน้าร้าน เช่น เคสซับซ้อนของคลินิก)
  - `maxPerDay?` (จำกัดจำนวนรับต่อวันทั้งร้าน เช่น ทำสีผมรับ 3 คิว/วัน)
  - สถานะ ACTIVE/HIDDEN/ARCHIVED (soft delete)
- นัด 1 ครั้งเลือกได้**หลายบริการ** (ตัด+สระ+ทำสี) → duration รวม, ราคารวม, ช่างคนเดียวทำต่อเนื่อง (หลายช่างต่อนัด = 🔜)

### 3.2 Staff + Skill Mapping ✅
- `BookingStaff`: ชื่อเล่นที่ลูกค้าเห็น, รูป, bio สั้น, สี label บนปฏิทิน, `userId?` (ผูก login ถ้าช่างมีบัญชี — ไม่บังคับ, ช่างจำนวนมากไม่ล็อกอิน), `visibleOnline` (ให้ลูกค้าเลือกจากหน้าเว็บได้ไหม), ลำดับแสดงผล
- `BookingStaffService` (skill mapping): ช่าง×บริการ — ใครทำอะไรได้ + override รายคน:
  - `durationMinOverride?` (ช่างอาวุโสตัดเร็วกว่า), `priceSatangOverride?` (ช่างระดับ director แพงกว่า)
- ช่างที่ไม่มี mapping กับบริการ = ไม่โผล่เป็นตัวเลือกและ slot engine ไม่จัดให้

### 3.3 ตารางเวลา ✅
- **เวลาทำงานรายสัปดาห์** (`BookingStaffSchedule`): ต่อช่าง ต่อวันในสัปดาห์ (0–6) หลายช่วงได้ (เช้า 09:00–13:00 + บ่าย 14:00–18:00 → 2 แถว) — ช่วง 13:00–14:00 คือพักเที่ยงโดยปริยาย
- **วันหยุด/ลา/บล็อกเวลา** (`BookingTimeOff`): ผูกช่างคนเดียว (`staffId`) หรือทั้งร้าน (`staffId = null` เช่น หยุดสงกรานต์) — ระบุช่วง `startAt–endAt` ละเอียดถึงนาที (ลาครึ่งวัน/ออกไปธุระ 2 ชม. ได้), เหตุผล, ใครบันทึก
- **เวลาเปิดร้าน**: อ่านจาก `unit.settings.openHours` (ชั้น BusinessUnit) — slot ของช่างถูก intersect กับเวลาเปิดร้านเสมอ
- ตารางช่างแก้ล่วงหน้าได้ (effective ทันที) — นัดเดิมที่ตกนอกตารางใหม่**ไม่ถูกยกเลิกอัตโนมัติ** แต่ขึ้น warning ในปฏิทินให้ front desk จัดการ

### 3.4 Slot Engine ✅ (หัวใจของโมดูล)
**Input:** `unitId`, รายการ `serviceIds[]`, `staffId | "any"`, `date`
**Output:** รายการเวลาเริ่มที่จองได้ (slot) ต่อช่าง

ขั้นคำนวณ (ต่อช่าง 1 คน):
1. `totalMin = Σ(duration ของแต่ละบริการ โดยใช้ override ของช่างถ้ามี)` และ `blockMin = bufferBefore(บริการแรก) + totalMin + bufferAfter(บริการสุดท้าย)`
2. เอา working intervals ของวันนั้น (schedule ∩ เวลาเปิดร้าน) − TimeOff (ช่าง+ทั้งร้าน) − นัดที่มีอยู่ (สถานะ `PENDING/CONFIRMED/ARRIVED/IN_SERVICE` — รวม buffer ของนัดนั้นๆ) = ช่วงว่างจริง
3. เดินกริดตาม `slotGranularityMin` (นโยบายร้าน: 15/30/60 นาที, default 30) — จุดเริ่ม slot ที่ `start + blockMin ≤ ปลายช่วงว่าง` = จองได้
4. ตัด slot ที่ `start < now + minLeadTimeMin` (จองล่วงหน้าขั้นต่ำ, default 60 นาที) และเกิน `maxAdvanceDays` (default 60 วัน)
5. ตรวจ `maxPerDay` ของบริการ (นับนัด ACTIVE ของวันนั้นทั้งร้าน)
6. โหมด **any**: union slot ของทุกช่างที่ทำครบทุกบริการใน `serviceIds` — ตอนยืนยันเลือกช่างให้ตามนโยบาย `anyStaffStrategy`: `LEAST_BUSY` (default — ช่างที่มีนาทีจองน้อยสุดของวันนั้น, กระจายงานแฟร์) / `ROUND_ROBIN` / `FIRST_AVAILABLE`

**กันจองซ้ำ (double-booking) — 2 ชั้น:**
- ชั้น 1 (application, ใน `prisma.$transaction` isolation `Serializable`):
  ```
  1. SELECT id FROM "BookingStaff" WHERE id = $staffId FOR UPDATE   -- serialize ต่อช่าง
  2. ตรวจ overlap: EXISTS นัด active ของช่างที่ [blockStart, blockEnd) ทับกัน → ถ้าทับ abort 409 SLOT_TAKEN
  3. ตรวจ TimeOff/ตารางซ้ำอีกรอบ (กัน schedule เพิ่งเปลี่ยน)
  4. INSERT Appointment + AppointmentItem + StatusLog
  ```
- ชั้น 2 (database hardening, raw SQL migration): Postgres exclusion constraint
  ```sql
  ALTER TABLE "Appointment" ADD CONSTRAINT no_staff_overlap
  EXCLUDE USING gist (
    "staffId" WITH =,
    tstzrange("blockStartAt", "blockEndAt") WITH &&
  ) WHERE (status IN ('PENDING','CONFIRMED','ARRIVED','IN_SERVICE'));
  ```
  (Prisma ไม่รองรับ EXCLUDE → ใส่ผ่าน migration SQL, กันได้แม้โค้ดชั้น 1 มีบั๊ก)
- ทุก error 409 ตอบพร้อม slot ใกล้เคียง 3 ตัวถัดไป (UX: "เวลานี้เพิ่งถูกจอง ลองเวลานี้ไหม")

### 3.5 ช่องทางจอง ✅
- **Storefront** (`/s/[tenantSlug]/[unitSlug]/booking` หรือ custom domain): wizard 4 ขั้น — บริการ (เลือกได้หลายรายการ) → ช่าง (การ์ดช่าง + "ใครก็ได้") → วัน+เวลา (ปฏิทิน + slot) → ข้อมูลลูกค้า+ยืนยัน
  - ลูกค้า login (OTP ผ่าน `member.sendOtp/verifyOtp` channel phone/email — contract 2.6) หรือ **guest** (ชื่อ+เบอร์+email) — guest ถูก match/สร้างผ่าน `member.findOrCreate({tenantId, phone (normalize E.164), name, source:'BOOKING'})` (D6) ให้แต้มย้อนหลังได้เมื่อสมัคร
  - หลังจอง: หน้า confirmation + ลิงก์จัดการนัด (`manageToken` — ดู/เลื่อน/ยกเลิกได้โดยไม่ต้อง login)
- **หน้าร้าน/โทร** (dashboard): quick-create จากปฏิทิน (คลิกช่องว่าง → ฟอร์มสั้น) หรือปุ่ม "จองใหม่" — front desk ข้ามกฎ `minLeadTime`/`onlineBookable` ได้ (สิทธิ์ walk-in), และ **force-book** ทับ buffer ได้ถ้ามีสิทธิ์ MANAGER ขึ้นไป (มี audit log)

### 3.6 วงจรสถานะนัด ✅
```
PENDING ──confirm──► CONFIRMED ──checkin──► ARRIVED ──start──► IN_SERVICE ──finish──► DONE
   │                    │                      │
   └──── cancel ────────┴──────────────────────┘        CONFIRMED เลยเวลา + grace ──► NO_SHOW
   (CANCELLED — เก็บ cancelledBy: CUSTOMER|STAFF|SYSTEM + reason)
```
- `PENDING` ใช้เมื่อร้านตั้ง `autoConfirm = false` (คลินิกอยากคัดกรองก่อน) — default `true` → จองออนไลน์ได้ `CONFIRMED` ทันที
- `PENDING` เกิน `pendingTtlHours` (default 24) ไม่มีใครกดยืนยัน → SYSTEM cancel + แจ้งลูกค้า
- `NO_SHOW`: กดมือจากปฏิทิน หรือ auto โดย cron เมื่อเลยเวลานัด + `noShowGraceMin` (default 30) และยังไม่ ARRIVED — auto-flag เปิด/ปิดได้ (`autoNoShow`)
- ทุกการเปลี่ยนสถานะเขียน `AppointmentStatusLog` (ใคร/เมื่อไร/จากอะไรเป็นอะไร/เหตุผล)
- แก้สถานะย้อน (เช่น NO_SHOW → ARRIVED ลูกค้ามาช้า): ทำได้ภายใน business date เดียวกัน สิทธิ์ MANAGER+, ลง log

### 3.7 เลื่อน / ยกเลิก + นโยบาย ✅
นโยบายเก็บใน `BookingPolicy` (1 แถวต่อ unit):
- `cancelMinHours` (ลูกค้ายกเลิกเองล่วงหน้าอย่างน้อย X ชม., default 2) · `rescheduleMinHours` (default 2) · `maxRescheduleCount` (default 2)
- เลื่อน = **นัดเดิม** เปลี่ยน `staffId/startAt` ผ่าน slot engine + lock เดิม (ไม่สร้างนัดใหม่ — ประวัติ/แต้ม/ลิงก์เดิมอยู่ครบ), `rescheduleCount++`, ลง StatusLog `RESCHEDULED` (สถานะหลักไม่เปลี่ยน)
- ลูกค้าทำเองผ่าน manageToken ในกรอบนโยบาย / staff ทำได้เสมอ (เกินกรอบ = ต้อง MANAGER+)
- ยกเลิกโดยร้าน (ช่างป่วย): เลือกนัดหลายรายการ → cancel พร้อม notify ลูกค้า + เสนอ slot ใหม่ในข้อความ
- 🔜 เมื่อมี deposit: นโยบายยึด/คืนมัดจำผูกกับ `cancelMinHours`

### 3.8 มัดจำ 🔜
- field เผื่อไว้แล้วใน schema: `Appointment.depositSatang`, `depositStatus (NONE|PENDING|PAID|REFUNDED|FORFEITED)`, `BookingService.depositSatang?`
- flow อนาคต: จองออนไลน์ → สร้าง PromptPay QR ผ่าน payment gateway → จ่ายใน 15 นาที ไม่จ่าย = auto-cancel → ตอนจบงาน deposit หักจากบิล POS (`payMethods: VOUCHER-like`)
- v1: ทุกนัด `depositStatus = NONE`, UI ไม่แสดงส่วนนี้

### 3.9 Recurring Appointment 🔜
- field เผื่อ: `Appointment.seriesId?` → model `BookingSeries` (RRULE-lite: ทุก N สัปดาห์ × M ครั้ง)
- สร้างนัดลูกล่วงหน้าเป็นชุด ผ่าน slot engine ทีละนัด — นัดที่ชนให้ผู้สร้างเลือก slot อื่นเป็นรายตัว
- v1: ไม่มี UI, `seriesId` เป็น null เสมอ

### 3.10 เตือนก่อนถึงนัด (notify contract) ✅
- ตั้งค่าใน `BookingPolicy.reminderOffsetsMin Json` (default `[1440, 120]` = 24 ชม. + 2 ชม.)
- Cron ทุก 5 นาที: หานัด `CONFIRMED` ที่ `startAt - offset` ตกใน window และยังไม่เคยส่ง (กันซ้ำด้วย `AppointmentReminder @@unique([appointmentId, offsetMin])`) → ยิง `notify({ channel: EMAIL|LINE, template: 'booking.reminder', data: {ชื่อร้าน, บริการ, ช่าง, เวลา, ลิงก์จัดการนัด} })`
- ส่งทันทีเมื่อ: จองสำเร็จ (`booking.confirmed`), ถูกยืนยันจาก PENDING, เลื่อน (`booking.rescheduled`), ยกเลิก (`booking.cancelled`)
- ช่องทางตามที่ลูกค้ามี: memberId → ตามช่องที่ผูก / guest → email+SMS(อนาคต) ที่กรอก

### 3.11 No-show tracking + Blacklist ✅
- ทุกนัด `NO_SHOW` นับเข้าสถิติของ `memberId` (guest นับด้วยเบอร์โทร normalize)
- `BookingPolicy`: `noShowBlacklistThreshold` (default 3 ครั้ง) ใน `noShowWindowDays` (default 90 วัน) → เกิน = สร้าง `BookingBlock` อัตโนมัติ (SYSTEM)
- ผลของ block: จอง**ออนไลน์**ไม่ได้ (ขึ้นข้อความสุภาพ "กรุณาติดต่อร้านโดยตรง") — หน้าร้านจองให้ได้เสมอ (ร้านตัดสินใจเอง), front desk เห็น badge "no-show X ครั้ง" ตอนสร้างนัด
- ปลด block ได้ (MANAGER+, ลง audit log), block มือก็ได้พร้อมเหตุผล
- NO_SHOW ที่ถูกแก้กลับ (ลูกค้ามาช้า) → ลบออกจากสถิติอัตโนมัติ

### 3.12 ปฏิทินร้าน ✅
- **Day view** (default): คอลัมน์ = ช่าง, แถว = เวลา (กริดตาม granularity), บล็อกนัดโชว์ ชื่อลูกค้า+บริการ+สถานะสี, บล็อกเทา = พัก/ลา/นอกตาราง, เส้นแดง = เวลาปัจจุบัน
- **Week view**: ต่อช่างคนเดียว (เลือกช่าง) 7 วัน
- คลิกช่องว่าง = quick-create · คลิกนัด = drawer รายละเอียด (เปลี่ยนสถานะ, เลื่อน, ยกเลิก, ไป POS)
- refresh อัตโนมัติ (SSE `booking.changed` ต่อ unit ต่อวัน) — สองเครื่องหน้าร้านเห็นตรงกัน
- มือถือ: day view แนวตั้งทีละช่าง, swipe เปลี่ยนช่าง/วัน

### 3.13 ชำระจบงานผ่าน POS ✅
- ปุ่ม "เก็บเงิน" บนนัดสถานะ `IN_SERVICE/DONE` → เปิด POS พร้อม lines จาก AppointmentItem (แก้ราคา/เพิ่มรายการขายหน้าร้านได้) → `createSale` (ดูข้อ 8.1)
- จ่ายสำเร็จ → นัดบันทึก `saleId` + ถ้ายังไม่ DONE ให้เปลี่ยนเป็น DONE อัตโนมัติ
- นัดที่ DONE โดยไม่เก็บเงินผ่าน POS ได้ (เคสเคลียร์บิลรวมท้ายเดือน) — รายงานแยก "DONE ยังไม่มีบิล"

### 3.14 รายงาน ✅ — ดูข้อ 10

---

## 4. Data Model (Prisma)

> ทุก model: `tenantId + unitId`, เงิน Int สตางค์, เวลา UTC (`DateTime`), id cuid, มี `createdAt/updatedAt`
> ชื่อ model นำหน้า `Booking` กันชนข้ามโมดูล (ยกเว้น `Appointment*` ซึ่งเป็นเอกลักษณ์ของโมดูลนี้)

```prisma
// ---------- Catalog ----------

enum BookingServiceStatus { ACTIVE HIDDEN ARCHIVED }

model BookingCategory {
  id        String   @id @default(cuid())
  tenantId  String
  unitId    String
  name      String            // TH default
  nameEn    String?
  sortOrder Int      @default(0)
  status    BookingServiceStatus @default(ACTIVE)
  services  BookingService[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([unitId, name])
  @@index([tenantId])
  @@index([unitId, status])
}

model BookingService {
  id              String   @id @default(cuid())
  tenantId        String
  unitId          String
  categoryId      String?
  category        BookingCategory? @relation(fields: [categoryId], references: [id])
  name            String
  nameEn          String?
  description     String?
  images          Json     @default("[]")   // [url]
  durationMin     Int                        // เวลาให้บริการจริง
  bufferBeforeMin Int      @default(0)
  bufferAfterMin  Int      @default(0)
  priceSatang     Int                        // เงินสตางค์
  priceNote       String?                    // "เริ่มต้น"
  depositSatang   Int?                       // 🔜 มัดจำ
  onlineBookable  Boolean  @default(true)
  maxPerDay       Int?                       // จำกัดคิว/วัน ทั้งร้าน
  sortOrder       Int      @default(0)
  status          BookingServiceStatus @default(ACTIVE)
  staffLinks      BookingStaffService[]
  items           AppointmentItem[]
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([unitId, name])
  @@index([tenantId])
  @@index([unitId, status, sortOrder])
}

// ---------- Staff & Schedule ----------

enum BookingStaffStatus { ACTIVE INACTIVE ARCHIVED }

model BookingStaff {
  id            String   @id @default(cuid())
  tenantId      String
  unitId        String
  userId        String?             // ผูก login ถ้าช่างมีบัญชี (optional)
  displayName   String              // ชื่อที่ลูกค้าเห็น เช่น "ช่างเมย์"
  bio           String?
  imageUrl      String?
  color         String   @default("#111111") // สี label บนปฏิทิน (B&W + เทา)
  visibleOnline Boolean  @default(true)
  sortOrder     Int      @default(0)
  status        BookingStaffStatus @default(ACTIVE)
  services      BookingStaffService[]
  schedules     BookingStaffSchedule[]
  timeOffs      BookingTimeOff[]
  appointments  Appointment[]
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([unitId, displayName])
  @@index([tenantId])
  @@index([unitId, status])
}

model BookingStaffService {          // skill mapping + override รายคน
  id                  String  @id @default(cuid())
  tenantId            String
  unitId              String
  staffId             String
  staff               BookingStaff   @relation(fields: [staffId], references: [id])
  serviceId           String
  service             BookingService @relation(fields: [serviceId], references: [id])
  durationMinOverride Int?
  priceSatangOverride Int?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  @@unique([staffId, serviceId])
  @@index([tenantId])
  @@index([unitId, serviceId])
}

model BookingStaffSchedule {         // เวลาทำงานรายสัปดาห์ (หลายช่วง/วันได้)
  id        String  @id @default(cuid())
  tenantId  String
  unitId    String
  staffId   String
  staff     BookingStaff @relation(fields: [staffId], references: [id])
  dayOfWeek Int              // 0=อาทิตย์ … 6=เสาร์ (ตาม timezone ของ unit)
  startTime String           // "09:00" เวลาท้องถิ่นร้าน (HH:mm)
  endTime   String           // "13:00"
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([tenantId])
  @@index([unitId, staffId, dayOfWeek])
}

enum BookingTimeOffType { LEAVE SICK HOLIDAY BREAK OTHER }

model BookingTimeOff {               // ลา/หยุด/บล็อกเวลา — staffId null = ทั้งร้าน
  id        String   @id @default(cuid())
  tenantId  String
  unitId    String
  staffId   String?
  staff     BookingStaff? @relation(fields: [staffId], references: [id])
  type      BookingTimeOffType @default(LEAVE)
  startAt   DateTime          // UTC
  endAt     DateTime
  reason    String?
  createdBy String            // userId ผู้บันทึก
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([tenantId])
  @@index([unitId, staffId, startAt])
  @@index([unitId, startAt, endAt])
}

// ---------- Policy ----------

model BookingPolicy {                // 1 แถว / unit
  id                       String  @id @default(cuid())
  tenantId                 String
  unitId                   String  @unique
  slotGranularityMin       Int     @default(30)
  minLeadTimeMin           Int     @default(60)
  maxAdvanceDays           Int     @default(60)
  autoConfirm              Boolean @default(true)
  pendingTtlHours          Int     @default(24)
  cancelMinHours           Int     @default(2)
  rescheduleMinHours       Int     @default(2)
  maxRescheduleCount       Int     @default(2)
  noShowGraceMin           Int     @default(30)
  autoNoShow               Boolean @default(true)
  noShowBlacklistThreshold Int     @default(3)
  noShowWindowDays         Int     @default(90)
  anyStaffStrategy         String  @default("LEAST_BUSY") // LEAST_BUSY|ROUND_ROBIN|FIRST_AVAILABLE
  reminderOffsetsMin       Json    @default("[1440,120]")
  createdAt                DateTime @default(now())
  updatedAt                DateTime @updatedAt

  @@index([tenantId])
}

// ---------- Appointment ----------

enum AppointmentStatus { PENDING CONFIRMED ARRIVED IN_SERVICE DONE NO_SHOW CANCELLED }
enum AppointmentSource  { ONLINE FRONT_DESK PHONE WALK_IN }
enum CancelledBy        { CUSTOMER STAFF SYSTEM }
enum DepositStatus      { NONE PENDING PAID REFUNDED FORFEITED }   // 🔜

model Appointment {
  id            String   @id @default(cuid())
  tenantId      String
  unitId        String
  code          String                   // เลขนัดอ่านง่าย เช่น BK-20260711-0042
  staffId       String
  staff         BookingStaff @relation(fields: [staffId], references: [id])
  memberId      String?                  // CustomerProfile (tenant-level) — contract 2.6
  guestName     String?                  // snapshot เฉพาะ guest
  guestPhone    String?                  // normalize E.164
  guestEmail    String?
  startAt       DateTime                 // เวลานัดที่ลูกค้าเห็น (UTC)
  endAt         DateTime                 // startAt + Σduration
  blockStartAt  DateTime                 // startAt - bufferBefore (ใช้กันชน)
  blockEndAt    DateTime                 // endAt + bufferAfter
  status        AppointmentStatus @default(CONFIRMED)
  source        AppointmentSource @default(ONLINE)
  note          String?                  // โน้ตร้าน (ลูกค้าไม่เห็น)
  customerNote  String?                  // ลูกค้าฝากถึงร้าน
  totalSatang   Int                      // ราคารวม snapshot ตอนจอง
  depositSatang Int      @default(0)     // 🔜
  depositStatus DepositStatus @default(NONE) // 🔜
  seriesId      String?                  // 🔜 recurring
  rescheduleCount Int    @default(0)
  manageToken   String   @unique @default(cuid()) // ลิงก์จัดการนัดของลูกค้า
  saleId        String?                  // PosSale.id จาก POS หลังเก็บเงิน (D8)
  cancelledBy   CancelledBy?
  cancelReason  String?
  noShowAt      DateTime?
  arrivedAt     DateTime?
  startedAt     DateTime?                // เข้า IN_SERVICE
  finishedAt    DateTime?                // DONE
  items         AppointmentItem[]
  statusLogs    AppointmentStatusLog[]
  reminders     AppointmentReminder[]
  createdBy     String?                  // userId ของ staff ที่คีย์ (null = ลูกค้าจองเอง)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([unitId, code])
  @@index([tenantId])
  @@index([unitId, startAt])
  @@index([unitId, staffId, blockStartAt, blockEndAt])   // slot overlap check
  @@index([unitId, status, startAt])                      // cron no-show / reminder
  @@index([memberId])
}
// + raw SQL migration: EXCLUDE USING gist (staffId, tstzrange(blockStartAt, blockEndAt))
//   WHERE status IN ('PENDING','CONFIRMED','ARRIVED','IN_SERVICE')  — ดูข้อ 3.4

model AppointmentItem {              // นัด 1 ครั้ง หลายบริการ — snapshot ราคา/เวลา
  id           String  @id @default(cuid())
  tenantId     String
  unitId       String
  appointmentId String
  appointment  Appointment    @relation(fields: [appointmentId], references: [id])
  serviceId    String
  service      BookingService @relation(fields: [serviceId], references: [id])
  nameSnapshot String                 // freeze ชื่อ ณ วันจอง
  durationMin  Int                    // หลัง apply override ของช่าง
  priceSatang  Int                    // หลัง apply override
  sortOrder    Int     @default(0)
  createdAt    DateTime @default(now())

  @@index([tenantId])
  @@index([appointmentId])
  @@index([unitId, serviceId])       // รายงานบริการยอดนิยม
}

model AppointmentStatusLog {
  id            String   @id @default(cuid())
  tenantId      String
  unitId        String
  appointmentId String
  appointment   Appointment @relation(fields: [appointmentId], references: [id])
  fromStatus    String?
  toStatus      String            // รวม event พิเศษ: "RESCHEDULED"
  detail        Json?             // เช่น { oldStartAt, newStartAt, oldStaffId }
  actorType     String            // CUSTOMER | STAFF | SYSTEM
  actorId       String?           // userId / memberId
  createdAt     DateTime @default(now())

  @@index([tenantId])
  @@index([appointmentId, createdAt])
}

model AppointmentReminder {         // กันส่งเตือนซ้ำ
  id            String   @id @default(cuid())
  tenantId      String
  unitId        String
  appointmentId String
  appointment   Appointment @relation(fields: [appointmentId], references: [id])
  offsetMin     Int
  sentAt        DateTime @default(now())

  @@unique([appointmentId, offsetMin])
  @@index([tenantId])
}

// ---------- No-show / Blacklist ----------

model BookingBlock {                 // บล็อกจองออนไลน์ (auto จาก no-show หรือมือ)
  id        String   @id @default(cuid())
  tenantId  String
  unitId    String
  memberId  String?                 // อย่างใดอย่างหนึ่ง memberId หรือ phone
  phone     String?                 // guest — E.164
  reason    String                  // "no-show 3 ครั้งใน 90 วัน" / manual
  createdByType String              // SYSTEM | STAFF
  createdBy String?                 // userId ถ้า manual
  liftedAt  DateTime?               // ปลดบล็อกเมื่อไร (null = ยัง block)
  liftedBy  String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([tenantId])
  @@index([unitId, memberId, liftedAt])
  @@index([unitId, phone, liftedAt])
}

// 🔜 model BookingSeries { id, tenantId, unitId, rule Json, count Int, ... } — recurring
```

หมายเหตุ schema:
- `blockStartAt/blockEndAt` = denormalize ช่วงกินเวลาช่างจริง (รวม buffer) — ทุกการตรวจ overlap ใช้คู่นี้ ไม่คำนวณสดจาก items (เร็ว + ใช้กับ EXCLUDE constraint ได้)
- `code` gen ต่อวันต่อ unit: `BK-YYYYMMDD-NNNN` (sequence ใน tx เดียวกับ insert)
- ไม่มี hard delete: บริการ/ช่าง = ARCHIVED (นัดเก่ายัง join ได้), นัด = CANCELLED

---

## 5. API Endpoints

> ฐาน dashboard: `/api/u/[unitId]/booking/...` — middleware ตรวจ `unitId ∈ tenant` + `can(user, {tenantId, unitId, module:'BOOKING', action})` ก่อนเข้า handler เสมอ
> ฐาน storefront (public): `/api/store/[tenantSlug]/[unitSlug]/booking/...` — ไม่ต้อง auth (หรือ session ลูกค้า), rate-limited

### Catalog (dashboard)
| Method | Path | Body หลัก | สิทธิ์ (action) |
|---|---|---|---|
| GET | `/api/u/:unitId/booking/categories` | — | `booking.read` |
| POST | `/api/u/:unitId/booking/categories` | `{name, nameEn?, sortOrder}` | `booking.catalog.manage` |
| PATCH/DELETE | `/api/u/:unitId/booking/categories/:id` | partial / archive | `booking.catalog.manage` |
| GET | `/api/u/:unitId/booking/services` | `?status=&categoryId=` | `booking.read` |
| POST | `/api/u/:unitId/booking/services` | `{name, durationMin, priceSatang, bufferBeforeMin?, bufferAfterMin?, ...}` | `booking.catalog.manage` |
| PATCH/DELETE | `/api/u/:unitId/booking/services/:id` | partial / archive | `booking.catalog.manage` |

### Staff & Schedule (dashboard)
| Method | Path | Body หลัก | สิทธิ์ |
|---|---|---|---|
| GET/POST | `/api/u/:unitId/booking/staff` | `{displayName, userId?, visibleOnline, ...}` | read: `booking.read` · write: `booking.staff.manage` |
| PATCH/DELETE | `/api/u/:unitId/booking/staff/:id` | partial / archive | `booking.staff.manage` |
| PUT | `/api/u/:unitId/booking/staff/:id/services` | `[{serviceId, durationMinOverride?, priceSatangOverride?}]` (replace ทั้งชุด) | `booking.staff.manage` |
| PUT | `/api/u/:unitId/booking/staff/:id/schedule` | `[{dayOfWeek, startTime, endTime}]` (replace ทั้งชุด) | `booking.schedule.manage` |
| GET/POST | `/api/u/:unitId/booking/timeoff` | `{staffId?, type, startAt, endAt, reason?}` → ตอบพร้อม `conflicts: [appointmentId]` | `booking.schedule.manage` |
| DELETE | `/api/u/:unitId/booking/timeoff/:id` | — | `booking.schedule.manage` |

### Slot & Appointment (dashboard)
| Method | Path | Body หลัก | สิทธิ์ |
|---|---|---|---|
| GET | `/api/u/:unitId/booking/slots` | `?serviceIds=a,b&staffId=any&date=2026-07-11` → `{staffId: [ "10:00", ... ]}` | `booking.read` |
| GET | `/api/u/:unitId/booking/appointments` | `?date=&staffId=&status=&q=` (q=ชื่อ/เบอร์/code) | `booking.read` |
| POST | `/api/u/:unitId/booking/appointments` | `{serviceIds[], staffId|"any", startAt, memberId?|guest{}, note?, source, force?}` → 201 หรือ 409 `{error:'SLOT_TAKEN', suggestions[]}` | `booking.appointment.create` (force: `booking.appointment.force`) |
| GET | `/api/u/:unitId/booking/appointments/:id` | รวม items + statusLogs | `booking.read` |
| POST | `/api/u/:unitId/booking/appointments/:id/status` | `{action: confirm|checkin|start|finish|noshow|cancel|revert, reason?}` | `booking.appointment.update` (revert: MANAGER+) |
| POST | `/api/u/:unitId/booking/appointments/:id/reschedule` | `{startAt, staffId?}` (slot engine + lock) | `booking.appointment.update` |
| POST | `/api/u/:unitId/booking/appointments/:id/checkout` | `{extraLines?, couponCode?, payMethods[]}` → proxy `createSale` (ข้อ 8.1) | `booking.appointment.checkout` |
| GET | `/api/u/:unitId/booking/calendar` | `?date=&view=day|week&staffId=` → payload ปฏิทิน (นัด+ตาราง+timeoff รวมจบ) | `booking.read` |
| GET | `/api/u/:unitId/booking/stream` | SSE: event `booking.changed {date}` | `booking.read` |

### Blacklist & Policy (dashboard)
| Method | Path | สิทธิ์ |
|---|---|---|
| GET/POST | `/api/u/:unitId/booking/blocks` · POST `{memberId?|phone?, reason}` | `booking.policy.manage` |
| POST | `/api/u/:unitId/booking/blocks/:id/lift` | `booking.policy.manage` |
| GET/PUT | `/api/u/:unitId/booking/policy` | read: `booking.read` · write: `booking.policy.manage` |

### Reports (dashboard)
| Method | Path | สิทธิ์ |
|---|---|---|
| GET | `/api/u/:unitId/booking/reports/utilization?from=&to=` | `booking.report.read` |
| GET | `/api/u/:unitId/booking/reports/no-show?from=&to=` | `booking.report.read` |
| GET | `/api/u/:unitId/booking/reports/services?from=&to=` | `booking.report.read` |

### Storefront (public)
| Method | Path | หมายเหตุ |
|---|---|---|
| GET | `/api/store/:tenantSlug/:unitSlug/booking/services` | เฉพาะ ACTIVE + onlineBookable |
| GET | `/api/store/:tenantSlug/:unitSlug/booking/staff?serviceIds=` | เฉพาะ visibleOnline ที่ทำครบทุกบริการ |
| GET | `/api/store/:tenantSlug/:unitSlug/booking/slots?serviceIds=&staffId=&date=` | rate limit 30 req/นาที/IP |
| POST | `/api/store/:tenantSlug/:unitSlug/booking/appointments` | `{serviceIds[], staffId|"any", startAt, customer{name, phone, email?}, customerNote?}` — ตรวจ BookingBlock ก่อน; 429 เมื่อจองถี่ผิดปกติ |
| GET | `/api/store/booking/manage/:manageToken` | ดูนัด (ไม่ต้อง login) |
| POST | `/api/store/booking/manage/:manageToken/cancel` · `/reschedule` | ในกรอบ policy เท่านั้น |

---

## 6. UI Screens

### Dashboard (`/app/u/[unitSlug]/booking/...`)
| Route | หน้าจอ | จุดสำคัญ |
|---|---|---|
| `/booking` | **ปฏิทิน** (default, day view) | คอลัมน์ต่อช่าง, สีสถานะ (โครงร่าง B&W: เส้น/เฉดเทา + จุดสถานะ), ปุ่ม "จองใหม่", ตัวสลับ day/week, SSE auto-refresh, เส้นเวลาปัจจุบัน |
| `/booking/appointments` | **รายการนัด** (list) | ตาราง+filter (วัน/สถานะ/ช่าง/ค้นหาชื่อ-เบอร์-code), bulk cancel (เคสช่างป่วย), badge no-show ของลูกค้า |
| `/booking/appointments/[id]` | รายละเอียดนัด (drawer/page) | timeline สถานะ, ปุ่ม action ตามสถานะปัจจุบัน, ลิงก์ member profile, ปุ่มเก็บเงิน → POS |
| `/booking/services` | จัดการบริการ+หมวด | ตาราง inline edit, ลาก sortOrder, toggle online, ราคาแสดงบาท (เก็บสตางค์) |
| `/booking/staff` | จัดการช่าง | การ์ดช่าง + tab: ข้อมูล / บริการที่ทำได้ (checkbox matrix + override) / ตารางเวลา (week grid editor) |
| `/booking/timeoff` | วันหยุด/ลา | ปฏิทินเดือน + รายการ, ฟอร์มลาโชว์ conflict นัดที่ชนพร้อมปุ่มไปจัดการ |
| `/booking/blocks` | Blacklist | รายการ block (auto/manual), ปุ่มปลด, ประวัติ no-show ต่อคน |
| `/booking/reports` | รายงาน | 3 tab: utilization / no-show / บริการ (ดูข้อ 10) |
| `/booking/settings` | นโยบาย | ฟอร์ม BookingPolicy จัดกลุ่ม: การจอง / ยกเลิก-เลื่อน / no-show / แจ้งเตือน |

Mobile behavior: ปฏิทิน = ทีละช่าง + swipe · ทุก list เป็น card · quick-create เป็น bottom-sheet 3 ขั้น (บริการ→เวลา→ลูกค้า)

### Storefront (`/s/[tenantSlug]/[unitSlug]/booking` หรือ custom domain)
| หน้า | เนื้อหา |
|---|---|
| Step 1 บริการ | list ตามหมวด, เลือกหลายรายการ, สรุปเวลารวม+ราคารวมท้ายจอ (sticky bar) |
| Step 2 ช่าง | การ์ดช่าง (รูป+ชื่อ+ราคา override ถ้ามี) + ตัวเลือกแรก "ช่างคนไหนก็ได้" |
| Step 3 เวลา | ปฏิทินเดือน (วันเต็ม = จาง) + slot ช่วงเช้า/บ่าย/เย็น, timezone ร้าน |
| Step 4 ยืนยัน | สรุป + login OTP หรือกรอก guest + customerNote + consent → ปุ่มยืนยัน |
| Confirmation | code นัด, ปุ่ม add-to-calendar (.ics), ลิงก์จัดการนัด (แสดง+ส่ง email) |
| Manage (`/booking/manage/[token]`) | ดูนัด, ปุ่มเลื่อน (เข้า Step 3 ใหม่), ยกเลิก (confirm 2 ชั้น + เหตุผล optional), แสดงกรอบนโยบาย ("เลื่อนได้ถึง 11 ก.ค. 13:00") |

ทุกหน้า: i18n TH/EN · empty/loading/error state ครบ · mobile-first

---

## 7. Business Flows

### 7.1 ลูกค้าจองออนไลน์ (happy path + failure)
```
1. เลือกบริการ [ตัดผม 60น. + สระ 30น.] → เลือกช่าง "any" → GET /slots (union ทุกช่างที่ทำได้ทั้งคู่)
2. เลือก 14:00 พฤ. → กรอก guest → POST /appointments
3. Server: ตรวจ BookingBlock(phone/member) → ผ่าน
4. resolve "any" → LEAST_BUSY เลือกช่างบี
5. $transaction(Serializable):
     lock BookingStaff(บี) FOR UPDATE
     ตรวจ overlap [13:45–15:45) (รวม buffer) → ว่าง
     ตรวจ schedule/timeoff/maxPerDay ซ้ำ
     INSERT Appointment(code BK-...-0042, CONFIRMED) + 2 items + log
6. notify(booking.confirmed → email) + SSE booking.changed → ปฏิทินร้านเด้ง
FAIL: ชน slot (มีคนกดตัดหน้า) → EXCLUDE/overlap เด้ง → 409 + suggestions 3 เวลา → UI เสนอทันที ไม่ต้องเริ่มใหม่
FAIL: ติด BookingBlock → 403 BLOCKED + ข้อความ "กรุณาติดต่อร้านโดยตรง"
```

### 7.2 หน้าร้านรับโทรจอง
```
Front desk คลิกช่องว่างช่างเมย์ 15:00 บนปฏิทิน → bottom-sheet: เลือกบริการ → ค้นเบอร์ลูกค้า
→ พบ member (badge: no-show 1 ครั้ง) → ยืนยัน → source=PHONE, createdBy=userId
→ front desk ข้าม minLeadTime ได้ (จองอีก 10 นาทีข้างหน้าได้)
```

### 7.3 วันให้บริการ (check-in → เก็บเงิน)
```
ลูกค้าถึงร้าน → front desk ค้นนัด → กด ARRIVED (arrivedAt)
  └─ ถ้า unit เปิดโมดูล Q + policy handoff: สร้าง QueueTicket type=APPOINTMENT อัตโนมัติ (ข้อ 8.6)
ช่างว่าง → กด IN_SERVICE → ทำเสร็จ → "เก็บเงิน" → POS prefill 2 รายการ + ลูกค้าเพิ่มแชมพู 1 ขวด
→ createSale(BOOKING, appointmentId, lines 3 รายการ, PROMPTPAY) → saleId กลับมาเก็บที่นัด → DONE
→ POS ยิง point.earn + account.post เอง (Booking ไม่ต้องทำ)
```

### 7.4 เลื่อนนัดโดยลูกค้า
```
กดลิงก์จัดการนัด → ตรวจ: status=CONFIRMED? เกิน rescheduleMinHours? rescheduleCount < max?
→ ผ่าน → เลือก slot ใหม่ (engine เดิม แต่ exclude นัดตัวเองออกจาก overlap)
→ tx เดิม (lock ช่างใหม่+เก่า เรียง id กัน deadlock) → update startAt/staffId/block* + rescheduleCount++
→ log RESCHEDULED {oldStartAt, newStartAt} → notify(booking.rescheduled)
FAIL เกินกรอบ → 422 + ข้อความ "เลยกำหนดเลื่อน กรุณาติดต่อร้าน" (โชว์เบอร์ร้าน)
```

### 7.5 ช่างลาป่วยกะทันหัน
```
Manager เพิ่ม TimeOff(SICK วันนี้ 09:00–18:00) → ตอบกลับ conflicts: 4 นัด
→ UI list 4 นัด ต่อรายการเลือก: [ย้ายช่าง] เสนอช่างว่างที่ทำบริการนั้นได้ / [เลื่อน] / [ยกเลิก+notify]
→ นัดที่ยังไม่จัดการ = ยังอยู่ แต่ปฏิทินแสดง ⚠ conflict (ไม่ auto-cancel เด็ดขาด)
```

### 7.6 Cron (ทุก 5 นาที ต่อ unit ที่เปิดโมดูล)
```
a) Reminder: นัด CONFIRMED ที่ startAt-offset ∈ window ∧ ไม่มี AppointmentReminder(offset) → notify + insert reminder
b) Auto no-show (ถ้า autoNoShow): CONFIRMED ∧ startAt + grace < now → NO_SHOW + log(SYSTEM) + นับ blacklist
c) Pending TTL: PENDING ∧ createdAt + ttl < now → CANCELLED(SYSTEM) + notify
d) Blacklist: หลังนับ no-show ≥ threshold ใน window ∧ ไม่มี block active → INSERT BookingBlock(SYSTEM) 
```

---

## 8. Integration

| Contract | จุดที่เรียก | รายละเอียด |
|---|---|---|
| **8.1 POS `createSale`** (2.1) | checkout นัด (7.3) | `createSale({tenantId, unitId, memberId?, sourceModule:'BOOKING', sourceId: appointmentId, lines: itemsSnapshot(+extra), couponCode?, payMethods})` → เก็บ `saleId` ที่นัด · Booking **ไม่**คิดแต้ม/ไม่แตะบัญชีเอง — POS จัดการต่อ |
| **8.2 Point** (2.2) | ไม่เรียกตรง | แต้มเกิดผ่าน POS เท่านั้น (ทำเสร็จแต่ไม่จ่าย = ยังไม่มีแต้ม — ถูกต้องตามธุรกิจ) |
| **8.3 Coupon** (2.3) | ผ่าน POS ตอน checkout | v1 ไม่มีคูปองตอนจองออนไลน์ (ไม่มีการเงินตอนจอง) — 🔜 พร้อม deposit |
| **8.4 Account** (2.4) | ไม่เรียกตรง | ไหลผ่าน POS posting |
| **8.5 Notify** (2.5) | ยืนยัน/เลื่อน/ยกเลิก/เตือน/PENDING หมดอายุ | templates: `booking.confirmed`, `booking.pending`, `booking.rescheduled`, `booking.cancelled`, `booking.reminder` — data มีชื่อหน่วย, บริการ, ช่าง, เวลา (โซนร้าน), ลิงก์ manage |
| **8.6 Q handoff** (โมดูล 4) | ตอนกด ARRIVED | ถ้า unit เดียวกันเปิด Q + `BookingPolicy` เชื่อม (`unit.settings.booking.queueHandoff = {enabled, queueTypeCode:'APPOINTMENT'}`): เรียก `queue.issueTicket({tenantId, unitId, typeCode:'APPOINTMENT', refType:'Appointment', refId: appointmentId, memberId?})` (refType = ชื่อ Prisma model ตรงตัวตาม D8) → ได้บัตรคิว priority (ดูสเปคฝั่ง Q ข้อ 3.9/8.2) · ถ้า Q ปิด = ข้ามเงียบๆ |
| **8.7 Member** (2.6) | ทุกนัด | อ้าง `memberId` — guest identity ผ่าน `member.findOrCreate({tenantId, phone (normalize E.164), name, source:'BOOKING'})` + ยืนยันตัวด้วย `member.sendOtp/verifyOtp({channel:'phone'|'email'})` ตาม contract 2.6 (D6) · เก็บ snapshot ชื่อ/เบอร์ในนัดเท่านั้น (เอกสาร freeze ได้ตามกติกา) + match เป็น member ภายหลังด้วยเบอร์ |
| **8.8 AuditLog กลาง** | force-book, revert status, ปลด block, แก้ policy | who/what/before/after ตามกติการ่วมข้อ 5 |
| **8.9 activity.log** (2.7) | นัด `DONE` / `NO_SHOW` | `activity.log({tenantId, memberId, unitId, module:'BOOKING', type:'APPOINTMENT_DONE'\|'APPOINTMENT_NO_SHOW', refType:'Appointment', refId: appointmentId, summary})` ผ่าน outbox กลาง — เฉพาะนัดที่มี memberId (producer บังคับตาม D6) |

---

## 9. Permissions (action × role)

module = `BOOKING` · ตรวจผ่าน `can(user, {tenantId, unitId, module, action})` 4 มิติเสมอ

| Action | OWNER | MANAGER (unit) | STAFF (default) | หมายเหตุ custom |
|---|---|---|---|---|
| `booking.read` (ปฏิทิน/รายการ/slot) | ✅ | ✅ | ✅ | ช่างที่มี login เห็นเฉพาะตารางตัวเองได้ (flag `ownScheduleOnly`) |
| `booking.appointment.create` | ✅ | ✅ | ✅ | |
| `booking.appointment.update` (สถานะ/เลื่อน/ยกเลิก) | ✅ | ✅ | ✅ | revert สถานะย้อน = MANAGER+ เท่านั้น |
| `booking.appointment.force` (ทับ buffer/นอกเวลา) | ✅ | ✅ | ❌ | ลง AuditLog |
| `booking.appointment.checkout` (→POS) | ✅ | ✅ | ✅ | ต้องมีสิทธิ์ `pos.sale.create` ด้วย |
| `booking.catalog.manage` | ✅ | ✅ | ❌ | |
| `booking.staff.manage` | ✅ | ✅ | ❌ | |
| `booking.schedule.manage` (ตาราง/ลา) | ✅ | ✅ | ❌ | เปิดให้ staff ลงลาตัวเองได้ (flag `ownTimeOff`) |
| `booking.policy.manage` (นโยบาย/blacklist) | ✅ | ✅ | ❌ | ปลด block ลง AuditLog |
| `booking.report.read` | ✅ | ✅ | ❌ | |

Customer (storefront): จอง/ดู/เลื่อน/ยกเลิกเฉพาะนัดตัวเอง (session member หรือ manageToken) — ไม่ผ่าน RBAC ร้าน

---

## 10. Reports & Metrics

ทุกรายงาน: เลือกช่วงวัน, export CSV, เงินแสดงบาท (คำนวณจากสตางค์), เทียบช่วงก่อนหน้า

1. **Staff Utilization** — ต่อช่าง: ชม.ที่ถูกจอง (duration ไม่รวม buffer) ÷ ชม.ทำงานตามตาราง (หัก timeoff) = % · แยกวัน/สัปดาห์ · ชี้ช่างว่างเกิน/แน่นเกิน
2. **No-show Report** — no-show rate = NO_SHOW ÷ (DONE+NO_SHOW) · แนวโน้มรายสัปดาห์ · top ลูกค้า no-show · เทียบ source (ONLINE เบี้ยวมากกว่า PHONE ไหม) · จำนวน block active
3. **บริการยอดนิยม** — จำนวนครั้ง + รายได้ (จาก AppointmentItem ของนัด DONE) ต่อบริการ/หมวด · ราคาเฉลี่ยจริงเทียบราคาตั้ง
4. **ภาพรวมการจอง** — นัด/วัน แยกสถานะ · lead time เฉลี่ย (จองล่วงหน้ากี่วัน) · สัดส่วน ONLINE:หน้าร้าน:โทร · ชั่วโมงพีค (heatmap วัน×ชม.)
5. **Cancellation** — อัตรายกเลิก แยก CUSTOMER/STAFF/SYSTEM · ยกเลิกก่อนนัดเฉลี่ยกี่ชม.
6. **KPI สำหรับการ์ด Overview "ทุกกิจการ"** (BLUEPRINT_BUSINESS_UNITS ข้อ 4): `นัดวันนี้ / เสร็จแล้ว / no-show วันนี้ / คิวถัดไป`

---

## 11. Edge Cases & Rules

1. **Race จองพร้อมกัน** — lock ต่อช่าง + Serializable + EXCLUDE constraint (3 ชั้น) · retry อัตโนมัติ 1 ครั้งเมื่อ serialization failure ก่อนตอบ 409
2. **Reschedule ตัวเอง** — ตรวจ overlap ต้อง exclude appointment id ตัวเอง ไม่งั้นเลื่อน 30 นาทีในช่วงติดกันไม่ได้
3. **ย้ายช่างตอนเลื่อน** — lock ช่างทั้งเก่า+ใหม่ เรียงตาม id (กัน deadlock)
4. **DST/timezone** — เก็บ UTC, คำนวณ slot ใน timezone ร้าน (`unit.settings.timezone`, default Asia/Bangkok — ไทยไม่มี DST แต่โค้ดต้องไม่ hardcode offset)
5. **เที่ยงคืนคาบเกี่ยว** — v1 จำกัด `endTime > startTime` วันเดียวกัน (ร้านนวดปิดเที่ยงคืนพอดีได้: `24:00` เก็บเป็น `23:59` — ระบุใน validator) · กะข้ามคืน = 🔜
6. **แก้ duration/ราคา ของบริการ** — ไม่กระทบนัดเดิม (snapshot ใน AppointmentItem/blockEndAt แล้ว) — ห้าม recompute ย้อนหลัง
7. **Archive ช่าง/บริการที่มีนัดค้าง** — block พร้อม list นัดค้างให้จัดการก่อน (ยกเว้น force + auto-เสนอย้าย)
8. **Unit PAUSED** (BLUEPRINT_BUSINESS_UNITS ข้อ 8.4) — storefront ปิดจองใหม่ทันที, นัดเดิม honor + dashboard ใช้ได้, cron reminder ยังส่ง
9. **maxPerDay ต้องนับใน transaction** — นับเฉพาะสถานะ active, นับก่อน insert ภายใน lock ไม่งั้น 2 คนจองพร้อมกันทะลุโควตา
10. **Guest phone = identity อ่อน** — normalize E.164 ก่อน match/นับ no-show · เบอร์ซ้ำหลาย guest = คนเดียวกันในสถิติ
11. **นัดหลายบริการ = บล็อกต่อเนื่องเดียว** — ห้ามแตกเป็นหลายบล็อกมีรูตรงกลาง (v1) · buffer ใช้ของบริการแรก(ก่อน)+สุดท้าย(หลัง) ไม่ใช่ผลรวมทุกตัว
12. **ปฏิทินร้านเป็น source of truth** — ทุกจอ (มือถือ front desk 2 เครื่อง) sync ผ่าน SSE · action บนข้อมูล stale ให้ server ตัดสิน (ตอบ 409/422 พร้อม state ล่าสุด)
13. **เงินเป็น Int สตางค์ทุกจุด** — แปลงเป็นบาทที่ชั้น UI เท่านั้น · ห้าม float ในทุก calculation
14. **ห้ามลบข้อมูลธุรกรรม** — Appointment ทุกสถานะอยู่ถาวร (soft ผ่าน status)

---

## 12. QC Checklist (เกณฑ์ตรวจรับ)

**Functional**
- [ ] จองออนไลน์ครบ 4 ขั้น ทั้งแบบ member และ guest, ได้ email ยืนยัน + ลิงก์จัดการนัด
- [ ] "ช่างคนไหนก็ได้" เลือกช่างตาม LEAST_BUSY จริง (เขียน test กระจายงาน)
- [ ] ยิงจอง slot เดียวกันพร้อมกัน 20 requests → สำเร็จ 1, ที่เหลือ 409 + suggestions (load test บังคับ)
- [ ] buffer กันเวลาช่างจริง แต่ไม่โผล่ในเวลานัดฝั่งลูกค้า
- [ ] เลื่อนนัด: ในกรอบ policy ผ่าน / นอกกรอบ 422 / เกิน maxRescheduleCount ถูกกัน
- [ ] cron: reminder ส่งครั้งเดียวต่อ offset (รัน cron ซ้ำต้องไม่ส่งซ้ำ), auto no-show + grace ทำงาน, PENDING TTL ทำงาน
- [ ] no-show ครบ threshold → block อัตโนมัติ → จองออนไลน์ถูกกัน + หน้าร้านยังจองได้
- [ ] TimeOff ที่ชนนัด → ตอบ conflicts + ปฏิทินโชว์ ⚠ + ไม่ auto-cancel
- [ ] checkout → POS ได้ saleId, แต้มเข้า (ผ่าน POS), นัดเป็น DONE
- [ ] ARRIVED + เปิด Q handoff → เกิด QueueTicket type APPOINTMENT (integration test ข้ามโมดูล)

**Isolation (multi-tenant/unit)**
- [ ] ทุก query มี tenantId+unitId — ทดสอบ user ร้าน A เรียก `/api/u/{unitId ร้าน B}/...` ต้อง 403/404 ทุก endpoint
- [ ] manageToken ของ tenant หนึ่ง ใช้ข้ามร้านไม่ได้, เดา token ไม่ได้ (cuid + ไม่มี enumeration)
- [ ] slot ของ unit A ไม่โชว์ช่าง/นัดของ unit B (ร้านเดียวกัน 2 สาขา)
- [ ] EXCLUDE constraint อยู่จริงใน migration (ตรวจ `\d "Appointment"`)

**i18n / UI / มาตรฐานร่วม**
- [ ] ทุกหน้า TH/EN สลับได้, ราคาแสดงบาทถูกต้องจากสตางค์ (ไม่มีเศษ float)
- [ ] เวลาแสดงตาม timezone ร้านทุกจุด (dashboard + storefront + email)
- [ ] empty/loading/error state ครบทุกหน้า, mobile ปฏิทิน+wizard ใช้ได้จริงบนจอ 375px
- [ ] AuditLog เกิดครบ: force-book, revert, ปลด block, แก้ policy
- [ ] rate limit endpoint public (slots/appointments) ทำงาน

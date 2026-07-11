# โมดูล 1: Hotel — ระบบโรงแรม (สเปคระดับ Production)

> 🔄 REVISED หลัง QC — สอดคล้อง RESOLUTIONS.md (2026-07-11)
> scope: **unit** (ทุกตารางมี `tenantId + unitId`) — ตาม `_CONVENTIONS.md` ข้อ 1
> อ่านคู่กับ: `../BLUEPRINT.md` · `../BLUEPRINT_BUSINESS_UNITS.md` · `_CONVENTIONS.md`
> เงินทุกจำนวน = `Int` หน่วย**สตางค์** (satang) · เวลาเก็บ UTC, แสดงตาม `unit.settings.timezone` (default `Asia/Bangkok`)
> สถานะเอกสาร: SPEC FINAL v1 — พร้อม implement (Phase 3 ตาม roadmap)

---

## 1. ภาพรวม + ขอบเขต

### 1.1 โมดูลนี้ทำอะไร

ระบบบริหารโรงแรม/รีสอร์ต/เกสต์เฮาส์ขนาด SME (5–150 ห้อง) ครบวงจรใน 1 unit:

- **Inventory:** ประเภทห้อง (RoomType) → ห้องจริง (Room) → สถานะแม่บ้าน (housekeeping)
- **Pricing:** Rate Plan หลายแบบ (มาตรฐาน/รวมอาหารเช้า/non-refundable) × ฤดูกาล (Season) × วันธรรมดา/สุดสัปดาห์/วันหยุดนักขัตฤกษ์
- **Booking engine:** ปฏิทินห้องว่าง (availability calendar), จองจากหน้าเว็บ (storefront), walk-in, โทรจอง — กันจองเกิน (overbooking) ด้วย transaction lock
- **Front desk:** check-in / check-out, มอบหมายห้อง, ย้ายห้องกลางการเข้าพัก, ขยาย/ย่นจำนวนคืน
- **Folio:** บิลค่าใช้จ่ายต่อการเข้าพัก — ค่าห้องรายคืน + ค่าใช้จ่ายขึ้นห้อง (room charge จาก POS/Restaurant) + ส่วนลด/มัดจำ → ปิดยอดครั้งเดียวตอน check-out ผ่าน POS
- **Housekeeping board:** DIRTY / CLEAN / INSPECTED / OOO แบบ realtime สำหรับแม่บ้าน
- **Night audit:** ปิดวันทางธุรกิจ (business date) — mark no-show อัตโนมัติ, post ค่าห้องเข้า folio, freeze สถิติรายวัน
- **Reports:** Occupancy %, ADR, RevPAR, รายได้แยก rate plan / source, no-show & cancellation
- **นโยบายเงิน:** มัดจำ (ไม่เก็บ/คงที่/เปอร์เซ็นต์/คืนแรก) + นโยบายยกเลิกแบบขั้นบันได (คืนเงินกี่ % ตามจำนวนวันก่อนเช็คอิน)
- **เชื่อมแกนกลาง:** Member (ลูกค้าพัก), Point (สะสมแต้มจากยอดจ่ายจริง), Coupon (ส่วนลด), POS (จุดตัดเงินเดียว), Account (ผ่าน POS), Notification (อีเมลยืนยัน/เตือน)

### 1.2 ไม่ทำใน v1 (ตัดสินแล้ว — อย่าลักไก่ทำ)

| นอกขอบเขต v1 | เหตุผล / แผน |
|---|---|
| Channel manager (OTA: Agoda/Booking.com) | 🔜 Phase ถัดไป — v1 เตรียม `HotelBooking.source=OTA` + `channelRef` + ตาราง `HotelChannelConnection` ไว้แล้ว (ดูข้อ 4.9) |
| Dynamic pricing / yield management | 🔜 — v1 มี season + weekday/weekend/holiday พอสำหรับ SME |
| หลายสกุลเงิน | THB เท่านั้น (field `currency` เตรียมไว้) |
| ใบกำกับภาษีเต็มรูป / แยก VAT+service charge บนบิล | v1 ราคา inclusive (รวมภาษีแล้ว) — breakdown 🔜 ฝั่ง POS/Account |
| Group booking / allotment บริษัททัวร์ | 🔜 — v1 จองได้หลายห้องใน 1 booking แต่ไม่มีสัญญา allotment |
| Hourly / day-use booking | 🔜 — v1 หน่วยขายคือ "คืน" เท่านั้น |
| City ledger (ลูกหนี้บริษัท เก็บเงินทีหลัง) | 🔜 — v1 ต้องชำระครบตอน check-out |
| Kiosk / self check-in | 🔜 |

### 1.3 หลักการออกแบบที่ยึด

1. **คืน (night) คือหน่วยข้อมูลจริง** — ทุกการจองแตกเป็นแถวรายคืน (`HotelBookingNight`) → availability, ย้ายห้อง, ขยายคืน, ราคาต่อคืน, รายงาน ทำงานบนตารางเดียวกัน ไม่มีสูตรพิเศษ
2. **ราคาถูก snapshot ตอนจอง** — แก้ rate ทีหลังไม่กระทบ booking เดิม
3. **Hotel ไม่แตะเงินเอง** — เงินเข้า/ออกทุกบาทวิ่งผ่าน POS (`createSale`) ตาม contract 2.1; Hotel ถือแค่ folio (ยอดค้างภายใน)
4. **เอกสารเงิน immutable** — folio item แก้ไม่ได้ ใช้ void + โพสต์รายการใหม่อ้างรายการเดิม
5. **unit = 1 โรงแรม** — โรงแรม 2 แห่งของ tenant เดียว คือ 2 BusinessUnit แยกข้อมูลสิ้นเชิง แต่ลูกค้า/แต้มร่วมกันที่ชั้น tenant

---

## 2. Persona & User Stories

### Persona

| Persona | บทบาทในระบบ | ใช้อะไร |
|---|---|---|
| **เจ้าของ (Owner)** | OWNER — ทุก unit ทุกโมดูล | ดูรายงานรวม, ตั้งราคา/นโยบาย, night audit |
| **ผู้จัดการโรงแรม (Manager)** | MANAGER ประจำ unit | ทุกอย่างใน unit: ราคา, จัดการจอง, ปิดวัน, รายงาน |
| **พนักงานต้อนรับ (Front desk)** | STAFF + สิทธิ์ hotel.frontdesk | จอง/เช็คอิน/เช็คเอาต์/folio/ย้ายห้อง |
| **แม่บ้าน (Housekeeper)** | STAFF + สิทธิ์ hotel.housekeeping | เห็นเฉพาะ housekeeping board, อัปเดตสถานะห้อง |
| **ลูกค้า (Guest)** | Customer (User + CustomerProfile) หรือ guest ไม่ login | จองผ่าน storefront, ดู/ยกเลิกการจองตัวเอง, สะสมแต้ม |

### User Stories (ครบทุก persona)

**Owner/Manager**
- ในฐานะเจ้าของ ฉันตั้งราคาห้อง Deluxe ช่วงสงกรานต์แพงกว่าปกติ 40% ได้โดยสร้าง Season ทับช่วงวันที่ โดยไม่กระทบการจองที่รับไว้แล้ว
- ในฐานะผู้จัดการ ฉันเปิดหน้าปฏิทิน (tape chart) แล้วเห็นทุกห้อง × 14 วันข้างหน้า พร้อมลากจองใหม่ walk-in ได้ใน 30 วินาที
- ในฐานะเจ้าของ ฉันเห็น Occupancy / ADR / RevPAR รายวัน-รายเดือน และเทียบเดือนก่อนได้
- ในฐานะผู้จัดการ ฉันกดปิด night audit ทุกคืน แล้วระบบ mark no-show + post ค่าห้อง อัตโนมัติ
- ในฐานะเจ้าของ ฉันกำหนดว่าจองหน้าเว็บต้องจ่ายมัดจำ 50% ภายใน 30 นาที ไม่งั้น HOLD หลุดคืนห้องอัตโนมัติ

**Front desk**
- ในฐานะพนักงานต้อนรับ ฉันรับโทรจองแล้วสร้าง booking สถานะ CONFIRMED พร้อมบันทึกมัดจำโอนผ่าน PromptPay ได้ในหน้าเดียว
- ในฐานะพนักงานต้อนรับ ตอน check-in ฉันเลือกห้องจริงจากห้องที่ CLEAN/INSPECTED เท่านั้น และระบบเตือนถ้าเลือกห้อง DIRTY
- ในฐานะพนักงานต้อนรับ ลูกค้าขออยู่ต่ออีก 2 คืน ฉันกด extend ระบบตรวจห้องว่าง+คิดราคาคืนเพิ่มตาม rate ปัจจุบันให้
- ในฐานะพนักงานต้อนรับ แอร์ห้อง 203 เสีย ฉันย้ายแขกไป 305 กลางการเข้าพัก folio ตามไปถูกห้อง และ 203 ถูกตั้ง OOO
- ในฐานะพนักงานต้อนรับ ตอน check-out ฉันเห็น folio ครบ (ค่าห้อง + มินิบาร์ + อาหารที่สั่งขึ้นห้อง − มัดจำ) แล้วกดชำระผ่าน POS ใบเสร็จเดียวจบ

**Housekeeper**
- ในฐานะแม่บ้าน ฉันเปิดบอร์ดบนมือถือ เห็นห้องที่ต้องทำ (DIRTY) เรียงตามชั้น กดเปลี่ยนเป็น CLEAN เมื่อทำเสร็จ
- ในฐานะหัวหน้าแม่บ้าน ฉันตรวจห้อง CLEAN แล้วกด INSPECTED เพื่อปล่อยขาย

**Guest**
- ในฐานะลูกค้า ฉันเลือกวันที่เข้า-ออกบนหน้าเว็บโรงแรม เห็นเฉพาะประเภทห้องที่ว่างจริงพร้อมราคารวม จองและจ่ายมัดจำได้เลย
- ในฐานะลูกค้า ฉันดูการจองของฉันด้วยรหัสจอง+อีเมล และยกเลิกเองได้ตามนโยบาย (เห็นชัดว่าได้เงินคืนกี่บาท)
- ในฐานะสมาชิก ฉันพักโรงแรม A ของร้าน ได้แต้มไปใช้ที่ร้านอาหาร B ของร้านเดียวกัน (Point เป็น tenant-level)

---

## 3. ฟังก์ชันทั้งหมด (MVP ✅ / Phase ถัดไป 🔜)

### 3.1 Inventory — ห้องพัก
- ✅ RoomType: ชื่อ, รายละเอียด, จำนวนคนมาตรฐาน/สูงสุด, เตียงเสริม (อนุญาต+ราคา), ขนาด, ประเภทเตียง, สิ่งอำนวยความสะดวก (amenities), รูปหลายรูป, ลำดับแสดง
- ✅ Room: เลขห้อง (unique ต่อ unit), ชั้น, ผูก RoomType, สถานะใช้งาน/เลิกใช้, โน้ต
- ✅ Room block (OOO ช่วงวันที่): ปิดห้องซ่อม/ใช้ภายใน — ตัดออกจาก availability
- ✅ Archive RoomType/Room (soft delete) — ห้ามลบถ้ามี booking อนาคตค้าง
- 🔜 Connecting rooms, room features รายห้อง (วิวทะเล/ชั้นสูง) เป็น attribute ค้นหาได้

### 3.2 Pricing — ราคา
- ✅ RatePlan หลายแผน: มาตรฐาน / รวมอาหารเช้า / non-refundable ฯลฯ + `minNights/maxNights`
- ✅ Season: ช่วงวันที่ + priority (ซ้อนกันได้ ตัวเลข priority สูงชนะ) เช่น "High season พ.ย.–ก.พ." ทับด้วย "สงกรานต์"
- ✅ ราคาต่อ (RatePlan × RoomType × Season?) แยก **weekday / weekend / holiday** — weekend days ตั้งได้ต่อ unit (default ศุกร์-เสาร์)
- ✅ ตารางวันหยุดนักขัตฤกษ์ (HotelHoliday) ต่อ unit — วันในตารางใช้ราคา holiday (ถ้าตั้งไว้) แทน weekday/weekend
- ✅ Rate resolution + snapshot ราคาต่อคืนตอนจอง (ดู flow 7.1)
- ✅ ราคาเตียงเสริมต่อคืน (per RoomType)
- 🔜 Daily rate override (ทับราคารายวันเฉพาะวัน), ราคาตามจำนวนผู้เข้าพัก (occupancy-based), promotion code ระดับ rate (ใช้ Coupon แทนใน v1)

### 3.3 Availability & Booking
- ✅ Availability calendar: จำนวนห้องว่างต่อ RoomType ต่อวัน = ห้อง ACTIVE − ห้อง block − คืนที่ขายแล้ว (HOLD ยังไม่หมดอายุ/CONFIRMED/CHECKED_IN)
- ✅ Quote engine: เลือก RoomType+RatePlan+ช่วงวัน → ราคาแตกรายคืน + มัดจำที่ต้องจ่าย + นโยบายยกเลิก (snapshot)
- ✅ จอง 3 ช่องทาง: **storefront** (ลูกค้าเอง), **walk-in**, **โทรจอง** (front desk คีย์) — source บันทึกทุกใบ
- ✅ 1 booking จองได้หลายห้อง/หลายประเภท (หลาย BookingRoom) ช่วงวันเดียวกัน
- ✅ สถานะ: `HOLD → CONFIRMED → CHECKED_IN → CHECKED_OUT` + `NO_SHOW`, `CANCELLED` (state machine ข้อ 7.8)
- ✅ HOLD หมดอายุอัตโนมัติ (`holdExpiresAt`, default 30 นาที ตั้งได้) — sweeper ปล่อยห้องคืน
- ✅ Overbooking guard: advisory lock ต่อ (unit, roomType) + นับซ้ำใน transaction ก่อน insert คืน (ข้อ 7.2)
- ✅ โหมดยืนยันจองหน้าเว็บ ตั้งได้ต่อ unit: `AUTO_CONFIRM` (ไม่ต้องมัดจำ) / `DEPOSIT_REQUIRED` (จ่ายมัดจำจึง CONFIRMED) / `MANUAL_APPROVE` (พนักงานกดยืนยัน)
- ✅ ค้นหา/กรองการจอง: ช่วงวัน, สถานะ, source, ชื่อ/เบอร์/รหัสจอง, ห้อง
- 🔜 Group booking, waitlist, จองข้ามคืนไม่ติดกัน (split stay)

### 3.4 มัดจำ & นโยบายยกเลิก
- ✅ Deposit ต่อ RatePlan: `NONE / FIXED_AMOUNT / PERCENT / FIRST_NIGHT`
- ✅ Cancellation rules ต่อ RatePlan แบบขั้นบันได: `daysBefore ≥ N → คืน X%` (หลาย tier), นอก tier = คืน 0%
- ✅ Snapshot นโยบายลงใน booking ตอนจอง (แก้นโยบายทีหลังไม่กระทบ)
- ✅ ยกเลิกโดยพนักงาน + ยกเลิก self-service บน storefront (คำนวณเงินคืนอัตโนมัติ แสดงก่อนยืนยัน)
- ✅ คืนเงินมัดจำ = ยิง refund ผ่าน POS (อ้าง sale เดิม) — Hotel ไม่จ่ายเงินเอง
- 🔜 เก็บบัตร/ตัดบัตรอัตโนมัติเมื่อ no-show (ต้องมี card gateway)

### 3.5 Front desk — check-in / check-out / ระหว่างพัก
- ✅ Assign ห้องจริงล่วงหน้าหรือ ณ check-in — เลือกได้เฉพาะห้องว่างจริงช่วงนั้น, เตือนถ้าห้องไม่ CLEAN/INSPECTED (override ได้พร้อม log)
- ✅ Check-in: บันทึกเวลา, ผูก Member (ค้นหา/สร้างใหม่จากเบอร์-อีเมล), เปลี่ยนสถานะห้องอัตโนมัติ
- ✅ Early check-in / late check-out: บันทึกได้ + ค่าธรรมเนียมเป็น folio item (จำนวนเงินพนักงานกำหนด, 🔜 กติกาอัตโนมัติ)
- ✅ ย้ายห้อง (room move) กลางการเข้าพัก: มีผลตั้งแต่คืนที่เลือกเป็นต้นไป, ตรวจว่างห้องใหม่ใน lock, log เหตุผล, ห้องเดิมกลายเป็น DIRTY
- ✅ ขยายคืน (extend): ตรวจว่าง + คิดราคาคืนเพิ่มตาม rate ณ วันกด (ไม่ใช่ rate เดิม), เตือนถ้าห้องเดิมไม่ว่างต่อ → เสนอย้ายห้อง
- ✅ ย่นคืน (shorten / early departure): ตัดคืนอนาคตออกจาก folio (คืนที่ผ่าน night audit แล้วไม่คืนเงิน — ดู edge case 11.6)
- ✅ Check-out: บังคับ folio balance = 0 (ชำระผ่าน POS) ก่อนปิด, ห้องเป็น DIRTY อัตโนมัติ
- 🔜 พิมพ์ registration card, เก็บสำเนาเอกสารแขก (ตม.30 export)

### 3.6 Folio — บิลค่าใช้จ่ายต่อการเข้าพัก
- ✅ Folio เปิดอัตโนมัติเมื่อ CONFIRMED (1 booking = 1 folio ใน v1)
- ✅ รายการ: ค่าห้องรายคืน (post โดย night audit หรือ ณ check-out), เตียงเสริม, ค่าบริการอื่น (manual), **room charge จาก POS/Restaurant** (สั่งอาหาร/มินิบาร์ขึ้นห้อง — ดู contract 8.3), ส่วนลด, มัดจำ (payment ติดลบ), ค่าปรับ
- ✅ Void รายการ (immutable — สร้างรายการกลับรายการอ้างของเดิม, ต้องใส่เหตุผล, audit log)
- ✅ Settle ตอน check-out: ยอดคงเหลือทั้งก้อน → `createSale` ที่ POS ใบเดียว (itemized lines) → ได้เลขใบเสร็จ, แต้ม, posting บัญชี
- ✅ พิมพ์/ส่ง folio ให้แขกดูระหว่างพัก (guest bill preview)
- 🔜 หลาย folio ต่อ booking (แยกบิลบริษัท/ส่วนตัว), split payment ข้ามหลายใบเสร็จ

### 3.7 Housekeeping
- ✅ สถานะห้อง 4 ค่า: `DIRTY / CLEAN / INSPECTED / OOO` + กติกาเปลี่ยนอัตโนมัติ (check-out→DIRTY, ห้องที่มีแขกพักข้ามคืน→DIRTY ทุกเช้าหลัง night audit สำหรับทำความสะอาดรายวัน — เปิด/ปิดได้)
- ✅ บอร์ดแม่บ้าน: grid ตามชั้น, กรองตามสถานะ, มือถือ-first, ปุ่มใหญ่กดเปลี่ยนสถานะ, badge "แขกออกวันนี้ / แขกพักต่อ / ห้องว่าง"
- ✅ Inspect flow (เปิด/ปิดได้): DIRTY → CLEAN (แม่บ้าน) → INSPECTED (หัวหน้า) จึงขายได้; ปิด flow = CLEAN ขายได้เลย
- ✅ OOO ผูกกับ Room block (มีช่วงวันที่+เหตุผล) — ห้อง OOO ไม่ขึ้นให้ assign
- ✅ Log ทุกการเปลี่ยนสถานะ (ใคร เมื่อไหร่ จากอะไรเป็นอะไร)
- 🔜 มอบหมายห้องให้แม่บ้านรายคน, เวลาเฉลี่ยต่อห้อง, minibar posting จากแม่บ้าน

### 3.8 Night audit
- ✅ Business date ต่อ unit — วันปิดล่าสุด +1; ปิดวันได้ทั้ง manual (ปุ่ม) และ auto (cron เวลา `auditAutoTime` default 03:00)
- ✅ ขั้นตอนปิดวัน: (1) mark NO_SHOW ทุก CONFIRMED ที่ไม่เช็คอินภายในวันนั้น (2) post ค่าห้องของคืนนั้นเข้า folio ของทุก booking ที่ CHECKED_IN (3) สั่งห้องพักต่อเป็น DIRTY (ถ้าเปิด daily clean) (4) freeze สถิติ (occupied, available, revenue, ADR, RevPAR, no-show) ลง `HotelNightAudit` (5) แจ้งสรุปทาง notification
- ✅ ห้ามแก้ folio item ของ business date ที่ปิดแล้ว (void ได้อย่างเดียว โดยรายการ void ลงวันปัจจุบัน)
- ✅ Reopen วันล่าสุดได้ (MANAGER ขึ้นไป, audit log) — เฉพาะวันล่าสุดวันเดียว
- 🔜 รายงาน audit pack PDF อัตโนมัติส่งอีเมลเจ้าของ

### 3.9 Storefront (หน้าจองสาธารณะ)
- ✅ หน้าโรงแรมบน `shark.in.th/s/[tenantSlug]/[unitSlug]` + custom domain: รูป/รายละเอียด/สิ่งอำนวยความสะดวก/แผนที่
- ✅ Search: วันเข้า-ออก + จำนวนผู้ใหญ่/เด็ก → list RoomType ที่ว่าง พร้อมราคารวมและราคา/คืน, rate plan ให้เลือก, badge "เหลือ N ห้องสุดท้าย" (N≤3)
- ✅ Booking form: ข้อมูลผู้จอง (ชื่อ เบอร์ อีเมล), ผูกบัญชี Member ถ้า login, ใส่โค้ดคูปอง (validate ทันที), แสดงมัดจำ+นโยบายยกเลิกก่อนกดยืนยัน
- ✅ ชำระมัดจำ (D1): เรียก POS `createSale` แบบ `paymentMode:'PENDING_PAYMENT'` → POS สร้าง `PosPaymentIntent` (PromptPay QR / โอนแนบสลิป, มี expireAt) — ยืนยันเงินเข้า (v1 = staff/FINANCE ยืนยันสลิป, gateway webhook 🔜) → POS emit `pos.sale.paid` → HOLD → CONFIRMED อัตโนมัติ
- ✅ หน้า "การจองของฉัน": lookup ด้วยรหัสจอง+อีเมล (ไม่ต้อง login) หรือ list ทั้งหมดถ้า login, ยกเลิก self-service
- ✅ อีเมลยืนยัน/ยกเลิก/เตือนก่อนเช็คอิน 1 วัน (ผ่าน notify contract)
- ✅ i18n TH/EN, mobile-first, B&W minimal
- 🔜 รีวิวจากแขก, gallery ต่อห้องแบบ lightbox, upsell add-on ตอนจอง (รถรับส่ง ฯลฯ)

### 3.10 Channel manager (OTA) — 🔜 ทั้งหมด (v1 วางโครงรับไว้)
- 🔜 เชื่อม OTA ผ่าน channel manager กลาง: push availability/rate, pull booking
- ✅ (โครงใน v1) `HotelBooking.source = OTA` + `channelRef`, ตาราง `HotelChannelConnection`, availability engine เป็น service เดียวที่ OTA sync จะเรียกซ้ำได้ idempotent

---

## 4. Data Model (Prisma)

> ทุก model: `tenantId + unitId`, unique ภายในหน่วย = `@@unique([unitId, ...])`
> relation ไปตาราง core (`Tenant`, `BusinessUnit`, `User`, `CustomerProfile`) ผูกฝั่ง core schema — ในไฟล์นี้อ้างด้วย scalar FK + comment
> เงินทุก field = Int สตางค์

```prisma
// ───────────────────────── ENUMS ─────────────────────────

enum HotelBookingStatus {
  HOLD          // จองชั่วคราว รอจ่ายมัดจำ/รออนุมัติ — กันห้องไว้จนกว่า holdExpiresAt
  CONFIRMED     // ยืนยันแล้ว
  CHECKED_IN    // เข้าพักอยู่
  CHECKED_OUT   // ออกแล้ว (folio ปิด)
  NO_SHOW       // ไม่มาตาม cutoff — night audit ตั้งให้
  CANCELLED     // ยกเลิก (โดยแขก/พนักงาน/HOLD หมดอายุ)
}

enum HotelBookingSource {
  WEB           // storefront
  WALK_IN
  PHONE
  OTA           // 🔜 channel manager
}

enum HotelHkStatus {
  DIRTY
  CLEAN
  INSPECTED
  OOO           // out of order — มาจาก HotelRoomBlock ที่ active
}

enum HotelRoomStatus {
  ACTIVE
  ARCHIVED      // เลิกใช้ (soft delete)
}

enum HotelDepositType {
  NONE
  FIXED_AMOUNT  // depositValue = สตางค์
  PERCENT       // depositValue = 0–100
  FIRST_NIGHT   // มัดจำ = ราคาคืนแรก (รวมทุกห้องใน booking)
}

enum HotelFolioStatus {
  OPEN
  SETTLED       // ชำระครบ ปิดแล้ว
  VOID          // booking ถูกยกเลิกก่อนมีรายการเงินจริง
}

enum HotelFolioItemType {
  ROOM          // ค่าห้องรายคืน (night audit / checkout post)
  EXTRA_BED
  SERVICE       // ค่าบริการอื่น พนักงานคีย์ (early check-in, ซักรีด ฯลฯ)
  POS_CHARGE    // ค่าใช้จ่ายขึ้นห้องจาก POS/Restaurant (contract 8.3)
  DISCOUNT      // ส่วนลด (ติดลบ) — รวมคูปองที่ apply ระดับ folio
  PENALTY       // ค่าปรับ (no-show/ยกเลิกส่วนที่ไม่คืน)
  PAYMENT       // เงินที่รับแล้ว (ติดลบ) เช่น มัดจำ — อ้าง POS sale
  REFUND        // คืนเงิน (บวกกลับ) — อ้าง POS refund
  VOID_REVERSAL // กลับรายการของ item ที่ void
}

enum HotelRoomBlockReason {
  OUT_OF_ORDER  // เสีย/ซ่อม
  MAINTENANCE   // ปิดปรับปรุงตามแผน
  INTERNAL_USE  // ใช้ภายใน (พนักงานพัก ฯลฯ)
  OTHER
}

enum HotelNightAuditStatus {
  CLOSED
  REOPENED      // ถูกเปิดแก้ (ปิดซ้ำจะสร้างสถิติทับ + log)
}

// ─────────────────────── INVENTORY ───────────────────────

model HotelRoomType {
  id             String   @id @default(cuid())
  tenantId       String
  unitId         String
  name           String                    // "Deluxe Sea View"
  code           String?                   // "DLX" ใช้ในรายงาน/tape chart
  description    String?  @db.Text
  baseOccupancy  Int      @default(2)      // จำนวนคนในราคาปกติ
  maxOccupancy   Int      @default(2)      // สูงสุด (รวมเตียงเสริม)
  extraBedAllowed Boolean @default(false)
  extraBedPrice  Int      @default(0)      // สตางค์/คืน
  sizeSqm        Int?
  bedType        String?                   // "King", "Twin"
  amenities      Json     @default("[]")   // ["WIFI","AC","BATHTUB",...]
  images         Json     @default("[]")   // [{url, alt, sortOrder}]
  sortOrder      Int      @default(0)
  status         HotelRoomStatus @default(ACTIVE)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  rooms          HotelRoom[]
  rates          HotelRate[]
  bookingRooms   HotelBookingRoom[]

  @@unique([unitId, name])
  @@index([tenantId])
  @@index([unitId, status, sortOrder])
}

model HotelRoom {
  id          String   @id @default(cuid())
  tenantId    String
  unitId      String
  roomTypeId  String
  roomType    HotelRoomType @relation(fields: [roomTypeId], references: [id])
  number      String                     // "203"
  floor       String?                    // "2"
  hkStatus    HotelHkStatus @default(CLEAN)
  status      HotelRoomStatus @default(ACTIVE)
  note        String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  blocks      HotelRoomBlock[]
  bookingRooms HotelBookingRoom[]        // ห้องปัจจุบันที่ assign
  nights      HotelBookingNight[]
  hkLogs      HotelHousekeepingLog[]

  @@unique([unitId, number])
  @@index([tenantId])
  @@index([unitId, roomTypeId, status])
  @@index([unitId, hkStatus])
}

model HotelRoomBlock {
  id          String   @id @default(cuid())
  tenantId    String
  unitId      String
  roomId      String
  room        HotelRoom @relation(fields: [roomId], references: [id])
  dateStart   DateTime @db.Date          // รวมวันนี้
  dateEnd     DateTime @db.Date          // exclusive (คืนสุดท้ายที่ block = dateEnd-1)
  reason      HotelRoomBlockReason
  note        String?
  createdById String                     // User.id
  releasedAt  DateTime?                  // ปลด block ก่อนกำหนด (soft delete)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([tenantId])
  @@index([unitId, roomId, dateStart, dateEnd])
  @@index([unitId, dateStart, dateEnd])
}

// ─────────────────────── PRICING ─────────────────────────

model HotelSeason {
  id        String   @id @default(cuid())
  tenantId  String
  unitId    String
  name      String                       // "High Season", "สงกรานต์"
  dateStart DateTime @db.Date
  dateEnd   DateTime @db.Date            // inclusive วันสุดท้ายของ season
  priority  Int      @default(0)         // ซ้อนกันได้ — สูงชนะ
  status    HotelRoomStatus @default(ACTIVE)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  rates     HotelRate[]

  @@unique([unitId, name])
  @@index([tenantId])
  @@index([unitId, dateStart, dateEnd])
}

model HotelHoliday {
  id        String   @id @default(cuid())
  tenantId  String
  unitId    String
  date      DateTime @db.Date
  name      String                       // "วันสงกรานต์"
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([unitId, date])
  @@index([tenantId])
}

model HotelRatePlan {
  id            String   @id @default(cuid())
  tenantId      String
  unitId        String
  name          String                   // "Standard", "รวมอาหารเช้า", "Non-refundable"
  code          String?
  description   String?
  includeBreakfast Boolean @default(false)
  minNights     Int      @default(1)
  maxNights     Int?
  depositType   HotelDepositType @default(NONE)
  depositValue  Int      @default(0)     // FIXED=สตางค์ · PERCENT=0–100
  isDefault     Boolean  @default(false) // แผนหลักของ storefront
  visibility    Json     @default("[\"WEB\",\"WALK_IN\",\"PHONE\"]") // ช่องทางที่ขายแผนนี้
  status        HotelRoomStatus @default(ACTIVE)
  sortOrder     Int      @default(0)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  rates         HotelRate[]
  cancelRules   HotelCancelRule[]
  bookingRooms  HotelBookingRoom[]

  @@unique([unitId, name])
  @@index([tenantId])
  @@index([unitId, status, sortOrder])
}

model HotelCancelRule {
  id           String @id @default(cuid())
  tenantId     String
  unitId       String
  ratePlanId   String
  ratePlan     HotelRatePlan @relation(fields: [ratePlanId], references: [id])
  daysBefore   Int                       // ยกเลิก ≥ N วันก่อนเช็คอิน (นับตาม timezone ร้าน)
  refundPercent Int                      // 0–100 — % ของมัดจำที่คืน
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@unique([ratePlanId, daysBefore])
  @@index([tenantId])
  @@index([unitId])
}
// ตัวอย่าง: [{daysBefore:7, refund:100}, {daysBefore:3, refund:50}] → <3 วัน = คืน 0%

model HotelRate {
  id           String  @id @default(cuid())
  tenantId     String
  unitId       String
  ratePlanId   String
  ratePlan     HotelRatePlan @relation(fields: [ratePlanId], references: [id])
  roomTypeId   String
  roomType     HotelRoomType @relation(fields: [roomTypeId], references: [id])
  seasonId     String?                   // null = ราคา default (นอกทุก season)
  season       HotelSeason? @relation(fields: [seasonId], references: [id])
  priceWeekday Int                       // สตางค์/คืน
  priceWeekend Int
  priceHoliday Int?                      // null = ใช้กติกา weekday/weekend ตามวันจริง
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@unique([ratePlanId, roomTypeId, seasonId])
  @@index([tenantId])
  @@index([unitId, roomTypeId])
}

// ─────────────────────── BOOKING ─────────────────────────

model HotelBooking {
  id            String   @id @default(cuid())
  tenantId      String
  unitId        String
  code          String                   // รหัสจอง เช่น "HB-24070001" (running ต่อ unit)
  status        HotelBookingStatus @default(HOLD)
  source        HotelBookingSource
  channelRef    String?                  // 🔜 เลขอ้างอิง OTA
  memberId      String?                  // CustomerProfile.id (contract 2.6)
  guestName     String                   // snapshot — เอกสารต้อง freeze
  guestPhone    String?
  guestEmail    String?
  guestNote     String?  @db.Text        // คำขอพิเศษ
  adults        Int      @default(2)
  children      Int      @default(0)
  checkInDate   DateTime @db.Date        // วันเข้าพัก (business date)
  checkOutDate  DateTime @db.Date        // วันออก (exclusive — คืนสุดท้าย = checkOutDate-1)
  holdExpiresAt DateTime?                // เฉพาะ HOLD
  couponCode    String?                  // validate แล้วตอนจอง — redeem จริงตอน settle
  couponDiscount Int     @default(0)     // ส่วนลดที่ validate ได้ (snapshot, สตางค์)
  roomTotal     Int      @default(0)     // ค่าห้องรวมทุกคืนทุกห้อง (snapshot ตอนจอง)
  depositRequired Int    @default(0)     // มัดจำที่ต้องจ่าย (คิดจาก policy ตอนจอง)
  depositPaid   Int      @default(0)     // จ่ายแล้วเท่าไร (อัปเดตจาก folio PAYMENT)
  currency      String   @default("THB")
  policySnapshot Json                    // {depositType, depositValue, cancelRules:[...], ratePlanNames}
  cancelledAt   DateTime?
  cancelReason  String?                  // "GUEST_REQUEST" | "HOLD_EXPIRED" | "STAFF" | ...
  refundAmount  Int?                     // เงินคืนตามนโยบาย (สตางค์) เมื่อยกเลิก
  noShowAt      DateTime?
  checkedInAt   DateTime?
  checkedOutAt  DateTime?
  createdById   String?                  // User.id พนักงาน (null = ลูกค้าจองเอง)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  rooms         HotelBookingRoom[]
  folio         HotelFolio?

  @@unique([unitId, code])
  @@index([tenantId])
  @@index([unitId, status, checkInDate])
  @@index([unitId, checkInDate, checkOutDate])
  @@index([unitId, memberId])
  @@index([unitId, guestPhone])
  @@index([status, holdExpiresAt])       // sweeper HOLD หมดอายุ (ข้าม unit)
}

model HotelBookingRoom {
  id          String   @id @default(cuid())
  tenantId    String
  unitId      String
  bookingId   String
  booking     HotelBooking @relation(fields: [bookingId], references: [id])
  roomTypeId  String
  roomType    HotelRoomType @relation(fields: [roomTypeId], references: [id])
  ratePlanId  String
  ratePlan    HotelRatePlan @relation(fields: [ratePlanId], references: [id])
  roomId      String?                    // ห้องจริงปัจจุบัน (assign ล่วงหน้า/ตอน check-in)
  room        HotelRoom? @relation(fields: [roomId], references: [id])
  guestName   String?                    // ชื่อผู้พักห้องนี้ (ถ้าต่างจากผู้จอง)
  adults      Int      @default(2)
  children    Int      @default(0)
  extraBed    Boolean  @default(false)
  amount      Int      @default(0)       // รวมค่าห้อง+เตียงเสริมทุกคืนของแถวนี้ (snapshot)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  nights      HotelBookingNight[]

  @@index([tenantId])
  @@index([unitId, bookingId])
  @@index([unitId, roomId])
}

model HotelBookingNight {
  id            String   @id @default(cuid())
  tenantId      String
  unitId        String
  bookingRoomId String
  bookingRoom   HotelBookingRoom @relation(fields: [bookingRoomId], references: [id])
  roomTypeId    String                   // denormalize เพื่อ availability query เร็ว
  roomId        String?                  // ห้องจริงของ "คืนนี้" — รองรับย้ายห้องกลางทาง
  room          HotelRoom? @relation(fields: [roomId], references: [id])
  date          DateTime @db.Date        // คืนวันที่ (คืนของ business date นี้)
  price         Int                      // ค่าห้องคืนนี้ (snapshot รวมเตียงเสริม, สตางค์)
  counted       Boolean  @default(true)  // false เมื่อ booking CANCELLED/NO_SHOW/ย่นคืน → ไม่กินห้องว่าง
  postedAuditId String?                  // HotelNightAudit ที่ post ค่าห้องคืนนี้แล้ว (กัน post ซ้ำ)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([bookingRoomId, date])
  @@index([tenantId])
  @@index([unitId, roomTypeId, date, counted])   // ← หัวใจ availability
  @@index([unitId, roomId, date])
}
// + raw SQL migration (Prisma ยังเขียน partial unique ไม่ได้):
// CREATE UNIQUE INDEX hotel_night_room_date_uniq
//   ON "HotelBookingNight" ("roomId", "date")
//   WHERE "roomId" IS NOT NULL AND "counted" = true;
// → DB-level กันห้องจริงถูก assign ซ้อนคืนเดียวกันเด็ดขาด

// ─────────────────────── FOLIO ───────────────────────────

model HotelFolio {
  id         String   @id @default(cuid())
  tenantId   String
  unitId     String
  bookingId  String   @unique
  booking    HotelBooking @relation(fields: [bookingId], references: [id])
  status     HotelFolioStatus @default(OPEN)
  balance    Int      @default(0)        // cache = SUM(items.amount) — recompute ใน tx เดียวกับ insert
  settledSaleId String?                  // PosSale.id ใบปิดยอด (POS)
  settledAt  DateTime?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  items      HotelFolioItem[]

  @@index([tenantId])
  @@index([unitId, status])
}

model HotelFolioItem {
  id           String   @id @default(cuid())
  tenantId     String
  unitId       String
  folioId      String
  folio        HotelFolio @relation(fields: [folioId], references: [id])
  type         HotelFolioItemType
  description  String                    // "ค่าห้อง 203 คืน 12 ก.ค.", "ต้มยำกุ้ง x1"
  qty          Int      @default(1)
  unitAmount   Int                       // สตางค์ (ติดลบสำหรับ PAYMENT/DISCOUNT)
  amount       Int                       // qty × unitAmount — sign convention: charge บวก / payment-discount ลบ
  businessDate DateTime @db.Date         // วันทางธุรกิจที่รายการเกิด
  refType      String?                   // ชื่อ Prisma model ตรงตัว (D8): "PosSale" | "HotelBookingNight" | ...
  refId        String?
  postedById   String?                   // User.id (null = ระบบ/night audit)
  voidedAt     DateTime?
  voidReason   String?
  reversalOfId String?                   // VOID_REVERSAL ชี้ item ต้นทาง
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([tenantId])
  @@index([unitId, folioId])
  @@index([unitId, businessDate, type])
  @@index([refType, refId])
}

// ─────────────────── HOUSEKEEPING / AUDIT ────────────────

model HotelHousekeepingLog {
  id         String   @id @default(cuid())
  tenantId   String
  unitId     String
  roomId     String
  room       HotelRoom @relation(fields: [roomId], references: [id])
  fromStatus HotelHkStatus
  toStatus   HotelHkStatus
  byUserId   String?                     // null = ระบบ (auto จาก check-out/audit)
  bookingId  String?                     // บริบท (ถ้าเกิดจาก check-in/out)
  note       String?
  createdAt  DateTime @default(now())

  @@index([tenantId])
  @@index([unitId, roomId, createdAt])
  @@index([unitId, createdAt])
}

model HotelNightAudit {
  id             String   @id @default(cuid())
  tenantId       String
  unitId         String
  businessDate   DateTime @db.Date
  status         HotelNightAuditStatus @default(CLOSED)
  roomsTotal     Int                    // ห้อง ACTIVE ทั้งหมด
  roomsOOO       Int                    // ถูก block คืนนั้น
  roomsAvailable Int                    // total - OOO
  roomsOccupied  Int                    // คืนที่ขาย (counted nights)
  occupancyBps   Int                    // occupancy × 10000 (basis points — เลี่ยง Float)
  roomRevenue    Int                    // สตางค์ (ค่าห้องคืนนั้นที่ post)
  adr            Int                    // สตางค์ = roomRevenue / roomsOccupied (0 ถ้าไม่มี)
  revpar         Int                    // สตางค์ = roomRevenue / roomsAvailable
  arrivals       Int
  departures     Int
  noShowCount    Int
  cancelledCount Int
  snapshot       Json                   // breakdown เพิ่มเติม {byRoomType, bySource, byRatePlan}
  closedById     String?                // null = auto cron
  closedAt       DateTime @default(now())
  reopenedAt     DateTime?
  reopenedById   String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([unitId, businessDate])
  @@index([tenantId])
  @@index([unitId, businessDate])
}

// ─────────────── CHANNEL MANAGER (🔜 โครงรับไว้) ──────────

model HotelChannelConnection {
  id         String   @id @default(cuid())
  tenantId   String
  unitId     String
  provider   String                      // "SITEMINDER" | "BOOKING_COM" | ...
  status     String   @default("DISABLED") // DISABLED | PENDING | ACTIVE | ERROR
  config     Json     @default("{}")     // credentials/mapping (encrypt at rest)
  lastSyncAt DateTime?
  lastError  String?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@unique([unitId, provider])
  @@index([tenantId])
}
```

### 4.1 การตั้งค่าระดับ unit (เก็บใน `BusinessUnit.settings.hotel` — ไม่มีตารางเพิ่ม)

```jsonc
{
  "hotel": {
    "checkInTime": "14:00",          // แสดงผล + คำนวณ early/late
    "checkOutTime": "12:00",
    "weekendDays": [5, 6],           // 0=อาทิตย์ … 5=ศุกร์ 6=เสาร์ (default ศ-ส)
    "holdMinutes": 30,               // อายุ HOLD จาก storefront
    "bookingMode": "DEPOSIT_REQUIRED", // AUTO_CONFIRM | DEPOSIT_REQUIRED | MANUAL_APPROVE
    "noShowCutoff": "AUDIT",         // mark no-show ตอนปิดวัน (v1 ค่าเดียว)
    "auditAutoTime": "03:00",        // เวลา cron ปิดวันอัตโนมัติ (ปิด = "" ถ้า manual เท่านั้น)
    "dailyHousekeeping": true,       // ห้องพักต่อ → DIRTY ทุกเช้า
    "inspectionRequired": false,     // ต้องผ่าน INSPECTED ก่อนขาย
    "maxAdvanceBookingDays": 365,
    "bookingCodePrefix": "HB"
  }
}
```

### 4.2 นิยาม Availability (สูตรเดียว ใช้ทุกที่)

```
available(roomTypeId, date) =
    count(HotelRoom ACTIVE ของ type)
  − count(HotelRoomBlock active ที่ dateStart ≤ date < dateEnd และ room เป็น type นั้น)
  − count(HotelBookingNight: unitId+roomTypeId+date, counted = true)
```

- คืนของ `HOLD` มี `counted = true` จนกว่า sweeper จะ expire → HOLD กันห้องจริง
- `CANCELLED / NO_SHOW / ย่นคืน` → ตั้ง `counted = false` + ปลด `roomId = null` (คืน slot ทั้ง type-level และ room-level)
- ฟังก์ชันนี้เป็น service เดียว `hotelAvailability.get(unitId, roomTypeId?, from, to)` — dashboard, storefront, quote, OTA sync (🔜) เรียกที่เดียวกัน

---

## 5. API Endpoints

> Dashboard: prefix `/api/u/[unitId]/hotel` — ทุก route ผ่าน middleware ตรวจ `unitId ∈ tenant` + `can(user, {tenantId, unitId, module:'HOTEL', action})`
> Storefront (public): prefix `/api/store/[tenantSlug]/[unitSlug]/hotel` — rate limit เข้มข้น, ไม่ต้อง auth (lookup ใช้ code+email)
> ทุก mutation ที่แตะเงิน/สถานะ → เขียน `AuditLog` กลาง

### 5.1 Inventory

| Method | Path | ทำอะไร | สิทธิ์ (action) |
|---|---|---|---|
| GET | `/room-types` | list (รวม archived ถ้า `?all=1`) | `hotel.inventory.read` |
| POST | `/room-types` | สร้าง `{name, baseOccupancy, maxOccupancy, extraBedAllowed, extraBedPrice, amenities[], images[], ...}` | `hotel.inventory.write` |
| GET | `/room-types/:id` | รายละเอียด + จำนวนห้อง | `hotel.inventory.read` |
| PATCH | `/room-types/:id` | แก้ไข | `hotel.inventory.write` |
| POST | `/room-types/:id/archive` | soft delete — reject ถ้ามี booking อนาคต active | `hotel.inventory.write` |
| GET | `/rooms` | list `?roomTypeId=&hkStatus=&floor=` | `hotel.inventory.read` |
| POST | `/rooms` | สร้าง `{roomTypeId, number, floor}` (รองรับ bulk `numbers[]`) | `hotel.inventory.write` |
| PATCH | `/rooms/:id` | แก้เลข/ชั้น/type/โน้ต — เปลี่ยน type ได้เมื่อไม่มี booking อนาคตที่ assign ห้องนี้ | `hotel.inventory.write` |
| POST | `/rooms/:id/archive` | เลิกใช้ห้อง (เงื่อนไขเดียวกับ block) | `hotel.inventory.write` |
| POST | `/rooms/:id/blocks` | ปิดห้อง `{dateStart, dateEnd, reason, note}` — reject ถ้าช่วงนั้นมี night assign ห้องนี้ (เสนอย้ายห้องก่อน) | `hotel.inventory.write` |
| POST | `/blocks/:id/release` | ปลด block ก่อนกำหนด | `hotel.inventory.write` |

### 5.2 Pricing

| Method | Path | ทำอะไร | สิทธิ์ |
|---|---|---|---|
| GET | `/seasons` · POST `/seasons` · PATCH `/seasons/:id` · POST `/seasons/:id/archive` | จัดการ season | `hotel.rates.write` (read = `.read`) |
| GET | `/holidays?year=` · POST `/holidays` (bulk `dates[]`) · DELETE `/holidays/:id` | ตารางวันหยุด | `hotel.rates.write` |
| GET | `/rate-plans` · POST `/rate-plans` · GET/PATCH `/rate-plans/:id` · POST `/rate-plans/:id/archive` | จัดการแผนราคา + deposit policy | `hotel.rates.write` |
| PUT | `/rate-plans/:id/cancel-rules` | replace ทั้งชุด `[{daysBefore, refundPercent}]` | `hotel.rates.write` |
| PUT | `/rate-plans/:id/rates` | bulk upsert matrix `[{roomTypeId, seasonId?, priceWeekday, priceWeekend, priceHoliday?}]` | `hotel.rates.write` |
| GET | `/rates/preview?roomTypeId&ratePlanId&from&to` | ราคา resolve รายวัน (ตรวจก่อนเปิดขาย) | `hotel.rates.read` |

### 5.3 Availability & Quote

| Method | Path | ทำอะไร | สิทธิ์ |
|---|---|---|---|
| GET | `/availability?from&to&roomTypeId?` | matrix `{roomTypeId: {date: availableCount}}` | `hotel.booking.read` |
| GET | `/quote?checkIn&checkOut&rooms=[{roomTypeId,ratePlanId,adults,children,extraBed}]&couponCode?` | คืน `{nights[], roomTotal, couponDiscount, depositRequired, policySnapshot}` — ไม่กันห้อง | `hotel.booking.read` |
| GET | `/tape-chart?from&to` | ห้องจริง × วัน: booking bar + block + hkStatus (หน้าปฏิทินหลัก) | `hotel.booking.read` |

### 5.4 Booking lifecycle

| Method | Path | ทำอะไร | สิทธิ์ |
|---|---|---|---|
| GET | `/bookings?status=&from=&to=&q=&source=&page=` | ค้นหา/กรอง | `hotel.booking.read` |
| POST | `/bookings` | สร้าง (walk-in/phone) `{source, guest{...}, memberId?, checkIn, checkOut, rooms[], couponCode?, confirmNow?: true}` → ทำใน overbooking-guard tx | `hotel.booking.write` |
| GET | `/bookings/:id` | รายละเอียด + rooms + nights + folio summary | `hotel.booking.read` |
| PATCH | `/bookings/:id` | แก้ข้อมูลแขก/โน้ต (ไม่แตะวัน/ห้อง/เงิน) | `hotel.booking.write` |
| POST | `/bookings/:id/confirm` | HOLD→CONFIRMED (MANUAL_APPROVE หรือรับมัดจำมือ) | `hotel.booking.write` |
| POST | `/bookings/:id/deposit` | บันทึกมัดจำ: เรียก POS `createSale` + โพสต์ folio PAYMENT `{payMethods[]}` | `hotel.booking.write` |
| POST | `/bookings/:id/cancel` | ยกเลิก `{reason}` — คำนวณ refund ตาม policySnapshot, ปลดคืน, สั่ง refund ผ่าน POS ถ้ามีมัดจำ | `hotel.booking.cancel` |
| POST | `/bookings/:id/assign-room` | `{bookingRoomId, roomId}` — ตรวจชน room-level ใน tx | `hotel.booking.write` |
| POST | `/bookings/:id/check-in` | `{bookingRoomIds?}` — ต้อง assign ครบ, เตือนห้องไม่พร้อม (`force:true` + log) | `hotel.frontdesk.checkin` |
| POST | `/bookings/:id/check-out` | ต้อง folio balance = 0 → CHECKED_OUT, ห้อง DIRTY | `hotel.frontdesk.checkout` |
| POST | `/bookings/:id/move-room` | `{bookingRoomId, toRoomId, fromDate, reason}` — ย้าย nights ตั้งแต่ fromDate ใน tx | `hotel.frontdesk.checkin` |
| POST | `/bookings/:id/extend` | `{newCheckOutDate}` — เพิ่ม nights ราคาปัจจุบัน ใน overbooking-guard tx | `hotel.booking.write` |
| POST | `/bookings/:id/shorten` | `{newCheckOutDate}` — ตัดคืนอนาคต (counted=false) + ปรับ folio | `hotel.booking.write` |
| POST | `/bookings/:id/no-show` | mark manual (นอกรอบ audit) | `hotel.booking.cancel` |

### 5.5 Folio

| Method | Path | ทำอะไร | สิทธิ์ |
|---|---|---|---|
| GET | `/folios/:id` | รายการเต็ม + balance | `hotel.folio.read` |
| POST | `/folios/:id/items` | โพสต์รายการ manual `{type: SERVICE\|EXTRA_BED\|DISCOUNT\|PENALTY, description, qty, unitAmount}` | `hotel.folio.write` |
| POST | `/folios/:id/items/:itemId/void` | void `{reason}` → สร้าง VOID_REVERSAL (ลง business date ปัจจุบัน) | `hotel.folio.void` |
| POST | `/folios/:id/settle` | ปิดยอด: post ค่าห้องคืนที่ค้าง → เรียก POS `createSale` (itemized + couponCode) `{payMethods[]}` → SETTLED | `hotel.frontdesk.checkout` |
| GET | `/folios/:id/print` | guest bill (HTML/PDF) | `hotel.folio.read` |

### 5.6 Housekeeping / Night audit / Reports

| Method | Path | ทำอะไร | สิทธิ์ |
|---|---|---|---|
| GET | `/housekeeping/board` | ห้องทั้งหมด + hkStatus + บริบทวันนี้ (แขกออก/พักต่อ/ว่าง) — SSE push อัปเดต | `hotel.housekeeping.read` |
| POST | `/housekeeping/rooms/:roomId/status` | `{toStatus, note?}` — enforce transition (ข้อ 7.6) + log | `hotel.housekeeping.write` |
| GET | `/housekeeping/logs?roomId=&from=&to=` | ประวัติ | `hotel.housekeeping.read` |
| GET | `/night-audit/current` | preview วันที่จะปิด: no-show ที่จะโดน, ค่าห้องที่จะ post, KPI | `hotel.audit.read` |
| POST | `/night-audit/close` | ปิดวัน (idempotent — ปิดซ้ำวันเดิม = 409) | `hotel.audit.close` |
| POST | `/night-audit/:id/reopen` | เปิดวันล่าสุด `{reason}` | `hotel.audit.close` (MANAGER+) |
| GET | `/night-audit/history?from&to` | รายการวันปิด | `hotel.audit.read` |
| GET | `/reports/occupancy?from&to&groupBy=day\|month` | occupancy/ADR/RevPAR series | `hotel.reports.read` |
| GET | `/reports/revenue?from&to&groupBy=ratePlan\|roomType\|source` | รายได้ห้องแยกมิติ | `hotel.reports.read` |
| GET | `/reports/bookings?from&to` | funnel: จอง/ยกเลิก/no-show/lead time | `hotel.reports.read` |
| GET | `/reports/housekeeping?from&to` | จำนวนห้องทำ/คน/วัน | `hotel.reports.read` |

### 5.7 Storefront (public)

| Method | Path | ทำอะไร | หมายเหตุ |
|---|---|---|---|
| GET | `/info` | ข้อมูลโรงแรม + room types (ACTIVE) + รูป | cache ได้ |
| GET | `/search?checkIn&checkOut&adults&children` | room types ว่าง + ราคา (rate plans ที่ visibility มี WEB) + `remaining` | เรียก availability service |
| GET | `/quote` | เหมือน 5.3 (+ ตรวจ coupon ผ่าน `coupon.validate`) | rate limit |
| POST | `/bookings` | สร้าง HOLD `{guest{name,phone,email}, checkIn, checkOut, rooms[], couponCode?}` → `{bookingId, code, holdExpiresAt, depositRequired, paymentIntent?}` | overbooking-guard tx · reCAPTCHA/turnstile |
| POST | `/bookings/:id/pay-deposit` | เรียก POS `createSale({paymentMode:'PENDING_PAYMENT', sourceModule:'HOTEL', sourceId: bookingId, idempotencyKey})` → คืน `PosPaymentIntent` (PromptPay QR/แนบสลิป) — POS ยืนยันเงินเข้าแล้ว emit `pos.sale.paid` → CONFIRMED (D1) | idempotent ด้วย idempotencyKey + paymentRef ฝั่ง POS |
| GET | `/bookings/lookup?code&email` | ดูการจอง (ไม่ login) / ถ้า login เห็น list ตัวเอง | ตรวจคู่ code+email ตรงกัน |
| POST | `/bookings/:id/cancel` | self-service `{code, email}` — แสดง refund ก่อนยืนยัน | ตาม policySnapshot |

**รวม: 54 endpoints (dashboard 47 + storefront 7)**

---

## 6. UI Screens

> ทุกหน้า: i18n TH/EN · B&W minimal · responsive mobile-first · empty/loading/error state ครบ (ตาม _CONVENTIONS ข้อ 5)
> path dashboard: `/app/u/[unitSlug]/hotel/...`

### Dashboard (14 หน้า)

| # | หน้า | path | สาระสำคัญ | mobile behavior |
|---|---|---|---|---|
| D1 | **Hotel Today** (หน้าแรกโมดูล) | `/hotel` | การ์ด: เช็คอินวันนี้ / เช็คเอาต์วันนี้ / occupancy วันนี้ / ห้อง DIRTY ค้าง / HOLD ใกล้หมดอายุ / ยอดค้าง folio · ลัดไปงานถัดไป | การ์ดเรียง 1 คอลัมน์ |
| D2 | **Tape chart** (ปฏิทินห้อง) | `/hotel/calendar` | grid ห้องจริง (แถว, group ตาม type) × วัน (คอลัมน์) — bar การจองสีตามสถานะ, block เป็นแถบลาย, คลิกช่องว่างลากสร้าง booking, drag bar = ย้ายห้อง/เลื่อนวัน (ยืนยันก่อน commit) | สลับเป็น list รายวัน + mini availability strip |
| D3 | **Availability calendar** (ระดับ type) | `/hotel/availability` | เดือน × room type: ตัวเลขห้องว่าง/ราคา — มุมมองผู้จัดการตั้งราคา | scroll แนวนอน sticky คอลัมน์แรก |
| D4 | **Bookings list** | `/hotel/bookings` | ตาราง + filter (สถานะ/วัน/source/ค้นหา) + badge สี status | card list |
| D5 | **Booking detail** | `/hotel/bookings/[id]` | header สถานะ+action ตาม state machine · tabs: ข้อมูลแขก / ห้อง&คืน (nightly breakdown) / folio / ประวัติ (audit) | tabs เป็น accordion |
| D6 | **New booking** (walk-in/โทร) | `/hotel/bookings/new` | wizard 3 step: วัน+ห้อง (เห็นว่างจริง) → ข้อมูลแขก (ค้น Member จากเบอร์) → สรุป+มัดจำ (เลือกวิธีจ่าย → POS) — จบได้ใน 1 นาที | full-screen step |
| D7 | **Check-in** | modal จาก D2/D4/D5 | เลือกห้องต่อ bookingRoom (list เฉพาะพร้อมขาย + เตือนไม่พร้อม), ยืนยันข้อมูลแขก, ปุ่มผูก Member | bottom sheet |
| D8 | **Check-out & settle** | `/hotel/bookings/[id]/checkout` | folio เต็ม (charge/payment/ยอดคงเหลือ) → ปุ่มชำระ: เงินสด/โอน/PromptPay/บัตร (ผ่าน POS) → ใบเสร็จ | ตารางย่อเป็น list |
| D9 | **Housekeeping board** | `/hotel/housekeeping` | grid ห้องตามชั้น สี hkStatus, badge บริบท (ออกวันนี้/พักต่อ), แตะห้อง = เปลี่ยนสถานะ + โน้ต — SSE realtime | **หน้าหลักของแม่บ้าน**: ปุ่มใหญ่, offline-tolerant (retry queue) |
| D10 | **Rooms & Room types** | `/hotel/settings/rooms` | 2 tabs: room types (CRUD + รูป + amenities) / ห้องจริง (CRUD + bulk สร้างเลขห้อง + block OOO) | ฟอร์ม full-screen |
| D11 | **Rates** | `/hotel/settings/rates` | seasons timeline + วันหยุด + matrix ราคา (rate plan × room type × season, ช่อง weekday/weekend/holiday) + ปุ่ม preview ราคารายวัน | matrix → ฟอร์มทีละ type |
| D12 | **Policies** | `/hotel/settings/policies` | ต่อ rate plan: มัดจำ + ตารางขั้นบันไดยกเลิก + ตัวอย่างข้อความที่ลูกค้าเห็น | — |
| D13 | **Night audit** | `/hotel/night-audit` | preview วันปัจจุบัน (no-show ที่จะโดน, ค่าห้องจะ post, KPI) → ปุ่มปิดวัน · ประวัติวันปิด + reopen | — |
| D14 | **Reports** | `/hotel/reports` | occupancy/ADR/RevPAR chart + ตาราง, รายได้แยก rate plan/source/type, export CSV | chart ย่อ + ตาราง scroll |

### Storefront (6 หน้า) — `/s/[tenantSlug]/[unitSlug]` หรือ custom domain

| # | หน้า | สาระสำคัญ |
|---|---|---|
| S1 | **Hotel landing** | hero รูป, จุดขาย, date picker เข้า-ออก + ผู้เข้าพัก → ค้นหา |
| S2 | **ผลค้นหา / เลือกห้อง** | card ต่อ room type: รูป, สิ่งอำนวยความสะดวก, rate plans (ราคา/คืน + รวม, เงื่อนไขยกเลิกย่อ), "เหลือ N ห้องสุดท้าย", ปุ่มเลือก (หลายห้องได้) |
| S3 | **กรอกข้อมูล + คูปอง** | ฟอร์มผู้จอง (ถ้า login prefill จาก Member), ช่องคูปอง (validate สด), สรุปราคา + มัดจำ + นโยบายยกเลิกเต็ม (ต้องกดรับทราบ) |
| S4 | **ชำระมัดจำ** | PromptPay QR + นับถอยหลัง holdExpiresAt — จ่ายแล้วเด้งหน้า S5 (poll/SSE) · โหมด AUTO_CONFIRM ข้ามหน้านี้ |
| S5 | **ยืนยันสำเร็จ** | รหัสจอง, สรุป, ปุ่ม add-to-calendar, ลิงก์ "การจองของฉัน" (+ อีเมลยืนยันอัตโนมัติ) |
| S6 | **การจองของฉัน** | lookup code+email หรือ list (login) — สถานะ, รายละเอียด, ปุ่มยกเลิก (แสดงเงินคืนก่อนยืนยัน), แต้มที่จะได้ |

**รวม 20 หน้าจอ (dashboard 14 + storefront 6)**

---

## 7. Business Flows

### 7.1 Rate resolution (คิดราคา 1 คืน)

```
input: roomTypeId, ratePlanId, date (business date), unit settings
1. หา season: HotelSeason ACTIVE ที่ dateStart ≤ date ≤ dateEnd → เลือก priority สูงสุด (เสมอกัน → dateStart ล่าสุด)
2. หา HotelRate ของ (ratePlanId, roomTypeId, seasonId) → ไม่มี → fallback แถว seasonId = null
   → ไม่มีอีก → ขายไม่ได้ (storefront ซ่อน, dashboard เตือน "ยังไม่ตั้งราคา")
3. เลือกช่องราคา:
   a. date ∈ HotelHoliday และ rate.priceHoliday ≠ null → priceHoliday
   b. dayOfWeek(date, unit.tz) ∈ weekendDays → priceWeekend
   c. else → priceWeekday
4. + extraBedPrice ถ้าเลือกเตียงเสริม
→ snapshot ลง HotelBookingNight.price ตอนสร้างจอง — ไม่คิดใหม่อีก
```

### 7.2 สร้างการจอง + Overbooking guard (ทุกช่องทางใช้ path เดียว)

```
createBooking(input) — ภายใน 1 Prisma transaction:
1. validate: ช่วงวัน (checkIn < checkOut, ≤ maxAdvanceBookingDays, ไม่ย้อนหลัง),
   minNights/maxNights ของ rate plan, occupancy ≤ maxOccupancy
2. สำหรับทุก roomTypeId ที่ขอ (เรียง id กันdeadlock):
     SELECT pg_advisory_xact_lock(hashtext(unitId || ':' || roomTypeId))
3. นับ availability ใหม่ทุกคืนที่ขอ (สูตร 4.2) — คืนไหนไม่พอ → abort 409 AVAILABILITY_CHANGED
   (ตอบกลับพร้อมคืนที่เต็ม ให้ UI แนะนำวัน/type อื่น)
4. คิดราคาต่อคืน (7.1) + coupon.validate ถ้ามี code + คิด depositRequired ตาม policy
5. insert HotelBooking (code = running number ต่อ unit, gen ใน tx เดียวกัน)
   + HotelBookingRoom + HotelBookingNight (counted=true)
   + snapshot policySnapshot
6. สถานะเริ่มต้น:
   - storefront: HOLD + holdExpiresAt = now + holdMinutes
     (bookingMode=AUTO_CONFIRM → CONFIRMED ทันที)
   - walk-in/phone: CONFIRMED (หรือ HOLD ถ้าพนักงานเลือก "รอโอนมัดจำ")
7. เปิด HotelFolio (status OPEN) เมื่อ CONFIRMED
commit → notify (ยืนยันจอง/แจ้งโอนมัดจำ) → AuditLog
```

**Failure paths:** ห้องเต็มระหว่างกรอกฟอร์ม → 409 + refresh availability · coupon ไม่ผ่าน → จองต่อได้โดยไม่มีส่วนลด (แจ้งเหตุผล) · gen code ชน (race) → retry ใน tx สูงสุด 3 ครั้ง

### 7.3 HOLD → CONFIRMED / หมดอายุ

```
จ่ายมัดจำสำเร็จ — subscribe event `pos.sale.paid {saleId, sourceModule:'HOTEL', sourceId: bookingId}` จาก POS
(D1: sale มัดจำสร้างแบบ PENDING_PAYMENT + PosPaymentIntent — ยืนยันเงินเข้า v1 = staff/FINANCE ยืนยันสลิป,
 webhook 🔜; idempotent ฝั่ง POS ด้วย paymentRef):
1. ตรวจ booking ยัง HOLD และไม่หมดอายุ → CONFIRMED, depositPaid += amount
2. โพสต์ FolioItem PAYMENT (ติดลบ, refType 'PosSale', refId saleId)
3. notify ยืนยันจอง
subscribe `pos.sale.expired` (PaymentIntent หมดอายุไม่จ่าย) → ปล่อย HOLD (CANCELLED reason HOLD_EXPIRED — idempotent ร่วมกับ sweeper)
⚠️ จ่ายสำเร็จหลัง HOLD หมดอายุแต่ห้องยังว่าง → auto re-book ใน guard tx เดิม;
   ห้องไม่ว่างแล้ว → สร้างเคสให้พนักงาน + คืนเงินอัตโนมัติ (POS refund) + notify ขอโทษ

Sweeper (cron ทุก 1 นาที, ข้าม unit ผ่าน index [status, holdExpiresAt]):
HOLD ที่ holdExpiresAt < now → CANCELLED (reason HOLD_EXPIRED),
nights.counted=false, roomId=null, folio → VOID (ยังไม่มีรายการเงิน), notify แจ้งหมดอายุ
```

### 7.4 Check-in

```
1. ต้องเป็น CONFIRMED และ checkInDate ≤ business date ปัจจุบัน
   (early check-in ก่อนวันจอง → MANAGER override + log)
2. ทุก bookingRoom ต้องมี roomId:
   - list ห้องว่างจริงตลอดช่วงพัก (query nights + blocks ระดับห้อง)
   - default เฉพาะ CLEAN (หรือ INSPECTED ถ้าเปิด inspectionRequired)
   - เลือกห้อง DIRTY → confirm dialog + force:true + log
3. assign เขียน roomId ลง bookingRoom + ทุก night ของแถวนั้น (ใน tx —
   partial unique index (roomId,date) กันชนระดับ DB)
4. status → CHECKED_IN, checkedInAt = now
5. ยังไม่จ่ายมัดจำ (walk-in) → หน้าจอบังคับเก็บก่อน (เรียก 5.4 /deposit)
6. ผูก/สร้าง Member จากเบอร์-อีเมล (opt-in) → booking.memberId
→ notify ทีมแม่บ้าน (ห้องมีแขก) + AuditLog
```

### 7.5 ระหว่างพัก — room charge / ย้ายห้อง / ขยายคืน

**Room charge จาก POS/Restaurant (contract 8.3, D12):** แขกสั่งอาหารขึ้นห้อง → พนักงานร้าน (unit ร้านอาหาร) checkout ผ่าน POS เลือก payMethod `ROOM_CHARGE` → เลือกโรงแรม unit + ห้อง/รหัสจอง → POS เรียก `hotel.chargeToRoom` (crossUnit) → Hotel ตรวจว่า booking CHECKED_IN → โพสต์ `FolioItem POS_CHARGE` (itemized, refType 'PosSale') → บิลต้นทางไม่ยิง point/account — เงินตัดครั้งเดียวตอน check-out

**ย้ายห้อง:**
```
moveRoom(bookingRoomId, toRoomId, fromDate, reason) — ใน tx:
1. booking ต้อง CHECKED_IN (หรือ CONFIRMED = เปลี่ยน assign ล่วงหน้า)
2. ตรวจ toRoom ว่างทุกคืนตั้งแต่ fromDate → checkout (nights + blocks) — ไม่ว่าง → 409
3. update nights [fromDate, end): roomId = toRoomId · bookingRoom.roomId = toRoomId
4. ห้องเดิม → DIRTY + hk log · log การย้าย (AuditLog: before/after)
หมายเหตุ: ราคาไม่เปลี่ยนแม้ต่าง type (นโยบาย v1: upgrade ฟรี/ตามข้อตกลงหน้างาน —
ผู้จัดการโพสต์ SERVICE เพิ่มเองถ้าจะเก็บส่วนต่าง) 🔜 auto ส่วนต่างราคา
```

**ขยายคืน (extend):**
```
1. เข้า overbooking-guard tx (7.2) เฉพาะคืนใหม่ [checkOutเดิม, checkOutใหม่)
2. ราคา = rate resolution ณ ปัจจุบัน (ไม่ใช่ราคาตอนจองเดิม) — แสดงให้แขกยืนยันก่อน
3. ห้องเดิมไม่ว่างคืนใหม่ → เสนอ (ก) ย้ายห้องทั้งช่วงใหม่ (ข) ยกเลิก extend
4. insert nights + update checkOutDate, roomTotal — คืนใหม่จะถูก post โดย night audit ตามปกติ
```

**ย่นคืน (shorten):** ตัด nights อนาคต (`counted=false`) + ปรับ `checkOutDate/roomTotal` — คืนที่ post ค่าห้องแล้ว (ผ่าน audit) ไม่ถอน ค่าห้องคืนนั้นยังอยู่ใน folio (นโยบาย early departure v1; ผู้จัดการ void ได้ถ้าจะคืนให้)

### 7.6 Housekeeping state machine

```
DIRTY → CLEAN            (แม่บ้าน)
CLEAN → INSPECTED        (หัวหน้า — เมื่อเปิด inspectionRequired)
CLEAN|INSPECTED → DIRTY  (ใช้งาน/สั่งทำใหม่)
* → OOO                  (ระบบ ตอน block active เท่านั้น — คนตรงๆ ห้าม ต้องสร้าง block)
OOO → DIRTY              (ระบบ ตอน block หมด/ถูก release)
อัตโนมัติ: check-out → DIRTY · night audit + dailyHousekeeping → ห้องพักต่อเป็น DIRTY
ทุก transition → HotelHousekeepingLog + SSE push บอร์ด
```

### 7.7 Check-out & settle + Night audit

**Check-out:**
```
1. post ค่าห้องคืนค้าง (คืนที่ postedAuditId = null และ date < วันออก) เข้า folio — กันหลุดกรณีออกก่อนรอบ audit
2. แสดง folio: charges − payments = balance
3. balance > 0 → settle ผ่าน POS (paymentMode:'PAID_NOW'):
   createSale({ sourceModule:'HOTEL', sourceId: bookingId, memberId,
     lines: [รายการ folio ที่ยังไม่เข้าใบเสร็จ: ค่าห้อง(สรุปต่อ room type × คืน),
             SERVICE/POS_CHARGE itemized, DISCOUNT — ห้ามมี line ติดลบ],
     couponCode: booking.couponCode,
     payMethods: [{type:'DEPOSIT', amount: depositPaid, refSaleId: depositSaleId},
                  ...วิธีจ่ายจริงของยอดส่วนที่เหลือ] })
   (D2: มัดจำหักเป็น "วิธีชำระ" DEPOSIT อ้างบิลมัดจำเดิม — ไม่ใช่ line ติดลบ →
    ไม่กระทบฐาน VAT ของบิล settle และไม่ earn แต้มซ้ำ:
    POS คิด earn จาก Σ payMethods ที่ไม่ใช่ DEPOSIT/ROOM_CHARGE)
   → โพสต์ FolioItem PAYMENT อ้าง saleId → balance = 0
   balance < 0 (จ่ายเกิน/ลดทีหลัง) → POS refund ก่อนปิด
4. status → CHECKED_OUT, folio → SETTLED (settledSaleId), ห้อง → DIRTY
5. แต้ม: POS เป็นคนยิง point.earn จากยอดจ่ายจริงของ sale — มัดจำ earn ไปแล้วในบิลมัดจำ,
   บิล settle earn เฉพาะ payMethods ที่ไม่ใช่ DEPOSIT/ROOM_CHARGE (Hotel ไม่คิดเอง)
6. notify ใบเสร็จ + ขอบคุณ + แต้มที่ได้
Failure: จ่ายไม่ผ่าน → folio ยัง OPEN, booking ยัง CHECKED_IN — ห้าม check-out ค้างยอด
```

**Night audit (manual หรือ cron `auditAutoTime`):** ต่อ 1 business date, idempotent
```
1. lock: unique(unitId, businessDate) — ปิดซ้ำ → 409
2. no-show: CONFIRMED ที่ checkInDate = businessDate และยังไม่ check-in
   → NO_SHOW, nights.counted=false + roomId=null (ปลดห้องทุกคืน),
     ค่าปรับตาม policy (มัดจำที่ริบ → FolioItem PENALTY + settle folio อัตโนมัติถ้า balance 0)
3. post ค่าห้อง: ทุก HotelBookingNight ของ businessDate ที่ booking CHECKED_IN และยังไม่ post
   → FolioItem ROOM (refType 'HotelBookingNight') + ตั้ง postedAuditId
4. dailyHousekeeping: ห้องที่มีแขกพักต่อ → DIRTY
5. คำนวณ + freeze KPI ลง HotelNightAudit (สูตรข้อ 10)
6. notify สรุปวันให้ OWNER/MANAGER
Reopen: ได้เฉพาะวันล่าสุด — สถิติจะถูกคำนวณทับตอนปิดใหม่, ทุกครั้งลง AuditLog
```

### 7.8 Booking state machine (สรุปทางเดียว)

```
HOLD ──confirm/pay──► CONFIRMED ──check-in──► CHECKED_IN ──check-out──► CHECKED_OUT ✦จบ
 │                        │                        (ห้ามยกเลิก — ใช้ shorten/void folio)
 ├─expire/cancel──► CANCELLED ✦จบ
 │                        ├─cancel──► CANCELLED ✦จบ
 │                        └─audit/manual──► NO_SHOW ✦จบ
ห้ามข้าม state · ห้ามถอยหลัง (ยกเว้น NO_SHOW → CONFIRMED โดย MANAGER ภายในวันเดียว —
แขกมาช้าหลัง audit — ต้องยังมีห้องว่าง, ผ่าน guard tx, log)
```

---

## 8. Integration (contract กลาง — _CONVENTIONS ข้อ 2)

### 8.1 POS (contract 2.1) — จุดตัดเงินเดียว
- **มัดจำ storefront (D1):** `createSale({sourceModule:'HOTEL', sourceId: bookingId, paymentMode:'PENDING_PAYMENT', idempotencyKey, lines:[{name:'มัดจำการจอง '+code, qty:1, unitPriceSatang: amount}]})` → POS สร้าง `PosPaymentIntent` → subscribe **`pos.sale.paid {saleId, sourceModule, sourceId}`** จึงโพสต์ folio PAYMENT + CONFIRMED · หมดอายุไม่จ่าย → **`pos.sale.expired`** → ปล่อย HOLD
- **มัดจำ front desk (รับเงินเอง):** `createSale` แบบ `paymentMode:'PAID_NOW'` (Σ payMethods = grandTotal) → folio PAYMENT ทันที
- **Settle check-out (D2):** createSale itemized `PAID_NOW` (7.7) — หักมัดจำด้วย `payMethods:[{type:'DEPOSIT', amount, refSaleId}]` (ห้าม line ติดลบ) — POS เป็นผู้: redeem coupon, ยิง point, post Account (facade), ออกเลขใบเสร็จ
- **Refund ยกเลิก/จ่ายเกิน:** เรียก POS refund/void อ้าง sale เดิม (เอกสาร immutable — ใบใหม่อ้างใบเดิม)
- Hotel **ไม่เขียน** ตาราง POS/Account ตรงเด็ดขาด

### 8.2 Point (contract 2.2)
- Hotel **ไม่ยิง point.earn เอง** — POS ยิงจากยอด sale: บิลมัดจำ earn ตอนเงินเข้าจริง, บิล settle earn จาก Σ payMethods ที่ไม่ใช่ DEPOSIT/ROOM_CHARGE → มัดจำ + ยอดปิด = แต้มครบไม่ซ้ำ (D2)
- Refund → POS ยิง `point.reverse` อ้าง (refType 'PosSale', refId saleId) — ห้ามใช้ adjust (ฝั่ง POS spec, D5)
- Ledger tag `unitId` = โรงแรมนี้ → รายงานแต้มแยกหน่วยได้

### 8.3 Room charge inbound (contract ที่ Hotel **เปิดให้โมดูลอื่นเรียก** — เพิ่มใหม่ในสเปคนี้)
```
hotel.chargeToRoom({ tenantId, hotelUnitId, folioRef: { roomNumber | bookingCode },
  lines: [{name, qty, unitAmount}], sourceSaleId,
  refType: 'PosSale', refId: sourceSaleId, byUserId, crossUnit: true })
→ { ok, folioItemIds } | error NOT_CHECKED_IN | ROOM_NOT_FOUND | FOLIO_CLOSED
```
- ผู้เรียก (D12): **POS (14)** เมื่อบิลเลือก payMethod `ROOM_CHARGE` — ครอบคลุมบิล Restaurant (02) ที่ checkout ผ่าน POS ด้วย payMethod เดียวกัน · ตัวเลือกนี้แสดงเฉพาะ tenant ที่มี unit type HOTEL ที่ ACTIVE (ไม่งั้นซ่อน)
- ตรวจ: booking CHECKED_IN ของห้องนั้น (ห้องซ้ำหลาย booking ไม่มีทาง — partial unique index) · ข้าม unit ได้เฉพาะภายใน tenant เดียวกัน
- ฝั่ง POS/Restaurant ต้องบันทึกว่า order นั้น "จ่ายแบบ ROOM_CHARGE" และ **ไม่ยิง point/บัญชี** (จะเกิดตอน settle ที่โรงแรม)

### 8.4 Coupon (contract 2.3) — 2 จังหวะ
- จังหวะ 1 `coupon.validate({code, tenantId, unitId, memberId?, amount: roomTotal, module:'HOTEL'})` ตอน quote/จอง → เก็บ code+discount ใน booking
- จังหวะ 2 `coupon.redeem` — เกิดใน POS ตอน settle (ส่ง couponCode ใน createSale) — atomic กันใช้ซ้ำ
- ยกเลิกก่อน settle → ไม่เคย redeem → ไม่ต้อง release

### 8.5 Account (contract 2.4)
- v1: posting ทั้งหมดมาจาก POS ตอน sale/refund (cash basis) — Hotel ไม่ยิง `account.post` ตรง
- 🔜 accrual: night audit ยิง posting รายได้ค่าห้องรายวัน + deposit liability

### 8.6 Member (contract 2.6)
- อ้าง `memberId` เสมอ, snapshot เฉพาะ `guestName/phone/email` บน booking (เอกสาร freeze ได้ตามข้อยกเว้น)
- Walk-in/check-in เสนอผูก Member จากเบอร์ (opt-in PDPA) — สร้าง CustomerProfile ผ่าน Member service ไม่ insert เอง

### 8.7 Notification (contract 2.5)
| เหตุการณ์ | template | ช่อง |
|---|---|---|
| จองสำเร็จ (HOLD) | `hotel.booking.hold` (+ลิงก์จ่ายมัดจำ, หมดเวลา) | EMAIL |
| ยืนยันแล้ว | `hotel.booking.confirmed` | EMAIL (🔜 LINE) |
| เตือนก่อนเช็คอิน 1 วัน | `hotel.booking.reminder` (เวลาเช็คอิน, แผนที่) | EMAIL |
| ยกเลิก/refund | `hotel.booking.cancelled` (ยอดคืน) | EMAIL |
| HOLD หมดอายุ | `hotel.booking.expired` | EMAIL |
| ใบเสร็จ check-out | `hotel.checkout.receipt` (+แต้มที่ได้) | EMAIL |
| สรุป night audit | `hotel.audit.summary` | EMAIL/WEB (OWNER/MANAGER) |

### 8.8 AuditLog กลาง (conventions ข้อ 5)
บังคับ log: สร้าง/ยกเลิกจอง, confirm, check-in/out, ย้ายห้อง, extend/shorten, folio post/void/settle, เปลี่ยนราคา/นโยบาย, force ห้อง DIRTY, night audit close/reopen, NO_SHOW→CONFIRMED — เก็บ who/what/when/before/after

### 8.9 Activity timeline (contract 2.7 — producer บังคับตาม D6)
ยิง `activity.log({tenantId, memberId, unitId, module:'HOTEL', type, refType:'HotelBooking', refId: bookingId, summary})` ผ่าน outbox กลาง (เฉพาะ booking ที่มี memberId):

| เหตุการณ์ | type |
|---|---|
| ยืนยันการจอง (→ CONFIRMED) | `BOOKING_CONFIRMED` |
| check-in | `BOOKING_CHECKED_IN` |
| check-out (settle แล้ว) | `BOOKING_CHECKED_OUT` |

---

## 9. Permissions (action × role)

> ผ่าน `can(user, {tenantId, unitId, module:'HOTEL', action})` — 4 มิติ
> STAFF กำหนด custom ราย action ได้ผ่าน `Membership.permissions` — คอลัมน์ STAFF ด้านล่างคือ preset 2 แบบที่ ship มากับระบบ

| action | OWNER | MANAGER (unit) | STAFF preset "Front desk" | STAFF preset "Housekeeping" |
|---|---|---|---|---|
| `hotel.inventory.read` | ✅ | ✅ | ✅ | ✅ (เฉพาะบอร์ด) |
| `hotel.inventory.write` (ห้อง/type/block) | ✅ | ✅ | ❌ | ❌ |
| `hotel.rates.read` | ✅ | ✅ | ✅ | ❌ |
| `hotel.rates.write` (ราคา/season/นโยบาย) | ✅ | ✅ | ❌ | ❌ |
| `hotel.booking.read` | ✅ | ✅ | ✅ | ❌ |
| `hotel.booking.write` (จอง/แก้/extend/assign) | ✅ | ✅ | ✅ | ❌ |
| `hotel.booking.cancel` (ยกเลิก/no-show) | ✅ | ✅ | ✅ (มัดจำ=0) / MANAGER ถ้ามี refund | ❌ |
| `hotel.frontdesk.checkin` (+ย้ายห้อง) | ✅ | ✅ | ✅ | ❌ |
| `hotel.frontdesk.checkout` (+settle) | ✅ | ✅ | ✅ | ❌ |
| `hotel.folio.read` | ✅ | ✅ | ✅ | ❌ |
| `hotel.folio.write` (โพสต์รายการ) | ✅ | ✅ | ✅ | ❌ |
| `hotel.folio.void` | ✅ | ✅ | ❌ (ขอ MANAGER) | ❌ |
| `hotel.housekeeping.read` | ✅ | ✅ | ✅ | ✅ |
| `hotel.housekeeping.write` | ✅ | ✅ | ✅ | ✅ (INSPECTED เฉพาะถ้าได้ flag `inspector`) |
| `hotel.audit.read` | ✅ | ✅ | ❌ | ❌ |
| `hotel.audit.close` (+reopen) | ✅ | ✅ | ❌ | ❌ |
| `hotel.reports.read` | ✅ | ✅ | ❌ | ❌ |
| `hotel.settings.write` (unit hotel settings) | ✅ | ✅ | ❌ | ❌ |
| override พิเศษ: force check-in ห้อง DIRTY, NO_SHOW→CONFIRMED, void หลัง audit | ✅ | ✅ | ❌ | ❌ |

- Customer (storefront): เห็น/ยกเลิกเฉพาะ booking ตัวเอง (ตรวจ code+email หรือ session memberId) — ไม่มี action ฝั่ง dashboard
- แม่บ้านเข้าหน้าอื่นของโมดูล → 403 + UI ซ่อนเมนูตั้งแต่ต้น (can() ใช้ร่วม UI/API)

---

## 10. Reports & Metrics

> แหล่งข้อมูล: วันปิดแล้ว = `HotelNightAudit` (freeze) · วันยังไม่ปิด = คำนวณสด — ตัวเลขรายงานย้อนหลังนิ่ง 100%
> ตัวเลขเงินทุกช่อง = Int สตางค์ · เปอร์เซ็นต์ = basis points (Int)

| รายงาน | สูตร/นิยาม | มุมมอง |
|---|---|---|
| **Occupancy %** | roomsOccupied ÷ roomsAvailable (available = ACTIVE − OOO) | รายวัน/เดือน/ช่วง, เทียบช่วงก่อน |
| **ADR** (Average Daily Rate) | roomRevenue ÷ roomsOccupied | เส้นเวลา + แยก room type |
| **RevPAR** | roomRevenue ÷ roomsAvailable (= ADR × Occ) | เส้นเวลา |
| **รายได้ห้อง** | Σ FolioItem ROOM (net void) ตาม businessDate | แยก ratePlan / roomType / source |
| **รายได้อื่นใน folio** | Σ SERVICE + POS_CHARGE + EXTRA_BED | ต่อวัน/ต่อ booking (เห็นยอด F&B ขึ้นห้อง) |
| **Booking funnel** | จองใหม่ / ยืนยัน / ยกเลิก (แยก reason) / no-show + cancellation rate, no-show rate | ต่อ source (WEB/WALK_IN/PHONE/OTA) |
| **Lead time** | avg(checkInDate − createdAt) | ต่อ source |
| **ALOS** (avg length of stay) | Σ nights ÷ จำนวน booking | ต่อเดือน |
| **Forecast 30 วัน** | occupancy จองแล้วล่วงหน้า (on-the-books) รายวัน | ตาราง+chart หน้า D3 |
| **Housekeeping** | ห้องทำ/วัน, ต่อคน (จาก hk log), ห้อง OOO ค้าง | ต่อวัน |
| **มัดจำค้าง / HOLD หลุด** | HOLD active, expired รายวัน, มัดจำที่ริบ (PENALTY) | operational |
| **Export** | ทุกตาราง CSV — 🔜 PDF audit pack | — |

KPI ที่ส่งขึ้น **Overview "ทุกกิจการ"** (การ์ด unit ตาม BLUEPRINT_BUSINESS_UNITS ข้อ 4): occupancy วันนี้, เช็คอินวันนี้, รายได้ห้องเมื่อวาน, แชร์ผ่าน internal hook `getUnitKpi(unitId)`

---

## 11. Edge Cases & Rules

1. **Race จองพร้อมกัน:** ทุก path ที่กินห้อง (create/extend/move/assign/re-book หลังจ่ายช้า) ต้องผ่าน advisory lock ต่อ (unit, roomType) + recount ใน tx — ห้ามเช็คว่างนอก tx แล้วค่อย insert · ระดับห้องจริงมี partial unique `(roomId, date) WHERE counted` เป็นตาข่ายสุดท้าย
2. **HOLD ครอบห้องจริง:** HOLD นับใน availability เสมอจนหมดอายุ — อย่า "เผื่อขาย" ทับ HOLD; sweeper ต้อง idempotent (สถานะเปลี่ยนไปแล้ว → ข้าม)
3. **จ่ายมัดจำสำเร็จหลังหมดอายุ:** ดู 7.3 — ห้าม CONFIRMED โดยไม่ตรวจห้องซ้ำ; เงินลูกค้าต้องได้คืนอัตโนมัติถ้า re-book ไม่ได้
4. **แก้ราคา/season/นโยบายย้อนหลัง:** กระทบเฉพาะ quote ใหม่ — booking เดิมใช้ snapshot; ลบ season ที่มี booking อ้าง = ทำได้ (snapshot อยู่ที่ night แล้ว) แต่ archive เท่านั้น ไม่ hard delete
5. **Timezone/เที่ยงคืน:** "วัน" ทุกที่ = business date ตาม `unit.settings.timezone`; เทียบ `daysBefore` ของ cancel rule นับจากเที่ยงคืนวันเช็คอิน เวลาร้าน; ระวังจองข้ามเที่ยงคืน (ลูกค้าจอง 00:30 สำหรับ "คืนนี้") — checkInDate ต้อง ≥ business date ปัจจุบัน ไม่ใช่ calendar date UTC
6. **Early departure หลัง audit post แล้ว:** คืนที่ post ไปแล้วไม่ auto-refund (นโยบาย v1) — MANAGER void รายการ ROOM ได้ (ลง business date ปัจจุบัน + reversal) ถ้าตกลงคืนเงิน
7. **ย่น/ยกเลิกที่มี room charge ค้าง:** ยกเลิก booking ที่ folio มี POS_CHARGE → ห้ามยกเลิกจนเคลียร์ (settle mini-sale หรือ void โดยผู้มีสิทธิ์) — กันหนี้หาย
8. **Block ห้องชนกับจองที่ assign แล้ว:** สร้าง block ทับคืนที่มี night(roomId) → reject พร้อมรายชื่อ booking — ต้องย้ายห้องก่อน; block ทับ type-level availability จนห้องไม่พอสำหรับ CONFIRMED เดิม → เตือน overbooked list ให้ผู้จัดการจัดการเอง (ระบบไม่ auto-ยกเลิกแขก)
9. **เปลี่ยน RoomType ของห้อง / archive:** ทำได้เมื่อไม่มี night อนาคต (counted) อ้างห้องนั้น — ไม่งั้น reject
10. **เลขใบจอง/ใบเสร็จ:** `code` running ต่อ unit gen ใน tx (retry on conflict) — ห้าม gen ฝั่ง client; เลขใบเสร็จเป็นของ POS
11. **Folio หลัง SETTLED:** โพสต์เพิ่มไม่ได้ (รวม chargeToRoom → error FOLIO_CLOSED — ร้านอาหารต้องเก็บเงินสดแทน); พบผิดหลังปิด → POS void/reissue ใบเสร็จ ไม่แก้ folio
12. **No-show ที่มากลางดึกหลัง audit:** MANAGER กด NO_SHOW→CONFIRMED ภายในวันถัดไป (ผ่าน guard tx — ห้องอาจถูกขายไปแล้ว) — ถ้าห้องเต็ม ต้องจัดการเป็นจองใหม่
13. **ลบ/พัก unit (BLUEPRINT_BUSINESS_UNITS ข้อ 8.4):** PAUSED → storefront ปิดจองใหม่ (search คืนว่าง 0 + banner) แต่ booking เดิม honor ทั้งหมด: check-in/out, folio, audit ทำงานต่อ; ก่อนพักระบบแจ้งจำนวน booking อนาคตค้าง
14. **Coupon จำกัดหน่วย:** `applicableUnitIds` ตรวจกับ hotelUnitId ทั้งจังหวะ validate และ redeem (ฝั่ง Coupon)
15. **PDPA:** ข้อมูลแขก (ชื่อ/เบอร์/อีเมล) เก็บเท่าที่จำเป็น, lookup สาธารณะต้องคู่ code+email เป๊ะ, ไม่ leak ชื่อผ่าน API search ใดๆ ที่ไม่ auth
16. **Isolation:** ทุก query ผ่าน Prisma extension inject tenantId + unit-guard (dev throw ถ้าไม่ส่ง unitId) — ยกเว้น flag `crossUnit:true` เฉพาะ: sweeper HOLD, chargeToRoom (ตรวจ tenant ตรงกันเองใน service), รายงานรวม tenant

---

## 12. QC Checklist (เกณฑ์ตรวจรับ)

### Functional
- [ ] สร้าง RoomType/Room/Season/RatePlan/Rate ครบ แล้ว storefront แสดงราคาถูกต้องทั้ง weekday/weekend/holiday/season ซ้อน (ทดสอบ 4 กรณี: ปกติ, เสาร์, วันหยุดในตาราง, สงกรานต์ทับ high season → priority ชนะ)
- [ ] จองครบ 3 ช่องทาง (WEB/WALK_IN/PHONE) — state machine ครบทุกเส้น (HOLD expire, cancel มี/ไม่มีมัดจำ, no-show, NO_SHOW→CONFIRMED)
- [ ] ยิงจองพร้อมกัน 20 request ห้องเหลือ 1 → สำเร็จ 1 เดียว, ที่เหลือ 409 (ทดสอบ load จริง ไม่ใช่ unit test อย่างเดียว)
- [ ] HOLD หมดอายุคืนห้องภายใน ≤ 2 นาที และจ่ายช้าหลังหมดอายุ → re-book หรือ refund อัตโนมัติ
- [ ] Check-in บังคับ assign ห้อง + ห้อง DIRTY ต้อง force พร้อม log · check-out บังคับ balance = 0
- [ ] ย้ายห้องกลาง stay: folio ตามถูกห้อง, ห้องเดิม DIRTY, partial unique index กันซ้อนพิสูจน์ด้วย insert ตรงๆ ต้อง fail
- [ ] Extend ใช้ราคาปัจจุบัน + แสดงยืนยันก่อน · shorten ไม่ถอนคืนที่ audit แล้ว
- [ ] chargeToRoom จากโมดูล Restaurant → โผล่ใน folio itemized และตัดเงินครั้งเดียวตอน settle (ไม่เกิด sale ซ้ำ, แต้มไม่ซ้ำ)
- [ ] Night audit: no-show ถูก mark, ค่าห้อง post ครบทุก CHECKED_IN, ปิดซ้ำ = 409, reopen ได้เฉพาะวันล่าสุด, ตัวเลข ADR/RevPAR ตรงกับคำนวณมือ
- [ ] Settle ผ่าน POS: ใบเสร็จ itemized, หักมัดจำด้วย payMethod DEPOSIT {refSaleId} (ไม่มี line ติดลบ), coupon redeem จังหวะเดียว, point.earn จากยอดจ่ายจริง (มัดจำ+ยอดปิด = แต้มเท่ายอดเต็ม ไม่ earn ซ้ำจาก DEPOSIT), refund ยกเลิก → แต้มถูก reverse (point.reverse)
- [ ] นโยบายยกเลิกขั้นบันได: ทดสอบ 3 tier (คืน 100/50/0%) ตรงตามวันตัด timezone ร้าน

### Isolation & Security
- [ ] สร้าง 2 tenants × 2 hotel units — query/API ทุกเส้นไม่เห็นข้ามหน่วย (รวม tape chart, รายงาน, chargeToRoom ข้าม tenant ต้อง fail)
- [ ] STAFF preset แม่บ้าน: API อื่นทุกเส้น 403 + เมนูซ่อน · Front desk void folio ไม่ได้
- [ ] Storefront lookup: code ถูก email ผิด → ไม่เจอ, ไม่ leak ว่า code มีจริง
- [ ] ทุก mutation เงิน/สถานะมี AuditLog ครบ before/after · rate limit หน้า public ทำงาน

### i18n / UI
- [ ] ทุกหน้า dashboard + storefront สลับ TH/EN สมบูรณ์ (รวมอีเมล template, สถานะ, ข้อความ error)
- [ ] Empty/loading/error state ครบ 20 หน้าจอ — บอร์ดแม่บ้านใช้บนมือถือจริงลื่น (ปุ่มใหญ่, SSE reconnect)
- [ ] ราคาแสดงเป็นบาทถูกต้องจากสตางค์ทุกจุด (ไม่มีทศนิยมเพี้ยน) — ตรวจ 1,234.50 บาท round-trip
- [ ] วันที่/เวลาแสดงตาม timezone ร้าน ทั้ง dashboard/storefront/อีเมล

### Performance
- [ ] Availability query 100 ห้อง × 365 วัน < 200ms (ใช้ index `[unitId, roomTypeId, date, counted]`)
- [ ] Tape chart 100 ห้อง × 31 วันโหลด < 1s · housekeeping SSE push < 2s หลังเปลี่ยนสถานะ

---

*จบสเปคโมดูล 01-hotel — โมดูลถัดไปที่พึ่งไฟล์นี้: 02-restaurant (ROOM_CHARGE), 14-pos (createSale HOTEL), 12-account (posting จาก POS), 06/09 (member/point)*

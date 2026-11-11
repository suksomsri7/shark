# โมดูล 3 — Booking (จองคิว/นัดหมาย) · V2 as-built · scope = **unit**

> **V2 as-built** (1 พ.ย. 2569 · SVC B.18 ส่วนเอกสาร) — อธิบายของที่สร้างจริง ณ `session/svc` `b3de0dce` (ใบ B.0–B.17 ของ RUN SVC · ยังไม่ deploy) · โครงสร้าง/ตัวเลข/หนี้ละเอียดอยู่ที่ `docs/sds/modules/booking.md` · แผน `ledger/SVC-MASTER-PLAN.md` §4.B · แบบ `ledger/DESIGN-BOOKING-QUEUE.md` · ภาพ `ledger/design-booking/*.png`
> ชุด UAT: ร้านตัดผม `ledger/wo-notes/svc-uat-u1-barber.md` (U1) · ร้านนวด `ledger/wo-notes/svc-uat-u3-massage.md` (U3)
> สเปกเดิม v1 (ก.ค. 2569) ย้ายไป "ภาคผนวก — v1 design notes" ท้ายไฟล์ · **เครื่องหมาย ✅ ในภาคผนวกถูกแก้ให้ตรงโค้ดแล้ว** (ของที่ไม่มีจริงเปลี่ยนเป็น ❌/⚠️ พร้อมเหตุผล) · เมื่อขัดกัน หมวด V2 และโค้ดชนะ
> คู่แฝด: บัตรคิว `docs/modules/04-queue.md` — ใน V2 จองคิวใช้ `QueueTicket` เป็นบัตร P/A ของ "แถวเดียว" เอง (ไม่ใช่ handoff ไปหน่วย QUEUE)

ระบบจองคิว V2 = นัดล่วงหน้า + walk-in ใน **แถวเดียว** ของสาขาบริการ (ร้านตัดผม · ร้านนวด/สปา · คลินิกซ่อนไว้) — ตัววางคิววางทั้งวันให้เอง พร้อมเหตุผล "ทำไม" · เงินไหลผ่าน POS (มัดจำ = ใบรับมัดจำ POS · จบงาน = บิลพัก POS) · ข้อความถึงลูกค้าผ่าน LINE OA ของร้าน (`notifyCustomer`) · ทุกนโยบายเป็นค่าตั้งจากทะเบียน (84 คีย์ · แม่แบบต่อประเภทร้าน) · ร้านที่ยังไม่เลือกแม่แบบทำงานแบบรุ่นแรกทุกอย่าง

## 1. แม่แบบกิจการ + ค่าตั้ง (B.0 · B.11)
- แม่แบบ 3 แบบ (`src/lib/core/settings/defs/booking.ts` `BOOKING_TEMPLATES`): **BARBER** "ตัดผม/เสริมสวย" · **SPA** "นวด/สปา" · **CLINIC** "คลินิก" (ซ่อน `hiddenUntil PHASE_CLINIC`) · ไม่มีแม่แบบชื่อ MASSAGE (ร้านนวด = SPA)
- เลือกแม่แบบที่ จองคิว → ตั้งค่า (`/app/u/<สาขา>/booking/settings` · `applyBookingTemplate` · ถามก่อนทับ) · ป้าย "ปรับจากแม่แบบ N ข้อ" นับเฉพาะข้อที่แก้
- ค่าตั้ง 84 คีย์ ใน 15 กลุ่ม (ทั่วไป · ผู้ให้บริการ · บริการ · ตัววางคิว · การจอง · มาสาย/ไม่มา · มัดจำ · คิว · แจ้งเตือน · ข้อความ · จอ · ตู้ · เงิน · คอร์ส · ความเป็นส่วนตัว) · ชั้นค่า UNIT/TENANT/STAFF/SERVICE/RESOURCE/DEVICE · นัดจด snapshot 11 คีย์ตอนจอง (ค่าตั้งใหม่ไม่กระทบนัดเดิม)
- จอตั้งค่า (สร้างจากทะเบียน · ภาพ จอง 08 11 12 14): `/booking/settings` (แม่แบบ+นโยบาย) · `/booking/services` (บริการ · ใครทำได้ + ราคา/เวลาเฉพาะคน · ค่าตั้งชั้นบริการ) · `/booking/staff` (คน · % ออนไลน์ · งานสูงสุด/วัน · พักขั้นต่ำ + ส่วนทรัพยากร) · `/booking/hours` · `/booking/settings/messages` (ข้อความ 11 ชนิด · ทีวี/ตู้ · ตารางสิทธิ์) · `/booking/devices`
- ร้านเดิม (ไม่เลือกแม่แบบ = `_fallback`): จองล่วงหน้า 14 วัน · ไม่มีขั้นต่ำ · ไม่จำกัดต่อเบอร์ · ไม่มีไม่มาอัตโนมัติ · ไม่ส่งข้อความ · มัดจำไม่เก็บออนไลน์ · ค่าคอมฯ ตามคนขาย · ไม่ลบข้อมูล · ไม่มีแถวเดียว (`FALLBACK_LEGACY`)

## 2. บริการ · ผู้ให้บริการ · เวลา (B.1)
- บริการต้นฉบับอยู่แคตตาล็อกกลาง (`InvItem` kind SERVICE · `/app/sys/<inventory>/inventory/services`) · `BookingService` = บริการที่สาขาเปิดรับจอง (ติ๊กที่ `/booking/services` · ปุ่ม "ย้ายเข้าแคตตาล็อก" สำหรับบริการรุ่นแรก)
- ผู้ให้บริการ = ทะเบียนพนักงาน HR (`/app/sys/<hr>/hr/employees`) → ติ๊ก "รับคิวที่สาขานี้" · ช่างรุ่นแรกที่ไม่อยู่ HR กด "ขึ้นทะเบียนให้" · คำเรียกตามแม่แบบ (ช่าง/หมอนวด/แพทย์)
- ช่าง ↔ บริการ (`BookingStaffService`): ไม่มีแถว = ทำทุกบริการ (`booking.staff.servicesMode` = ALL) · ราคา/นาทีเฉพาะคน
- หน้าต่างเวลาต่อช่าง: กะ HR → `BookingStaffHours` → เวลาร้าน (`BookingHours` · ไม่มีแถว = 10:00–20:00) − วันหยุดพิเศษ (`BookingClosure`) − ลาที่อนุมัติใน HR · ⚠️ กะ HR ยังเป็น `[]` (`hr/index.ts#staffWindows`)
- % เปิดจองออนไลน์ต่อช่างต่อวัน (นับเฉพาะช่อง ONLINE · พนักงานจองไม่นับ) · งานสูงสุด/วัน · พักขั้นต่ำ

## 3. หาเวลาว่าง + ตัววางคิว (B.2 · B.3)
- ตัววางคิว `planDay` (pure · `src/lib/modules/booking/planner.ts`): กติกา 5 ข้อ · ลำดับคิว (`SINGLE_LINE_BY_TIME` / `APPOINTMENT_FIRST`) · walk-in แทรกช่องว่าง · เผื่อเวลาก่อนนัดถัดไป · ขอช่างเฉพาะ · ETA "~15:25 ±10" + เหตุผล "ทำไม" ต่องาน · perf 12 ช่าง × 120 นัด + 40 walk-in p95 ~11 ms
- หาเวลาว่าง `findSlots` + จอง `bookAppointment` (ทางจองเดียวของทุกช่องทาง · `service.ts`): horizon/lead/ช่องเวลาทุก N นาที · ร้านยืนยันก่อน (PENDING) · เพดานนัดค้างต่อเบอร์ · ถือช่องระหว่างจ่ายมัดจำ · "ใครก็ได้" = รวมทุกช่างที่ทำได้ · กันจองซ้อนด้วยล็อก (idem → เบอร์ → สาขา → ช่าง → ทรัพยากร) — ไม่มี EXCLUDE constraint

## 4. แถวเดียว: เช็กอิน · walk-in · บัตร P/A · สาย/ไม่มา (B.4)
- เช็กอิน 3 ทาง: สแกน QR บัตรนัด · ปุ่มใน LINE · ค้นเบอร์ (+ปุ่มพนักงาน "มาถึง" = เวลาตอนกด) ⇒ ARRIVED + บัตร **P###** · walk-in ⇒ `Appointment(kind WALKIN, QUEUED)` + บัตร **A###** (ตัวอักษรจาก `booking.queue.prefixes`)
- สถานะงาน: PENDING · CONFIRMED · LATE · ARRIVED · QUEUED · IN_SERVICE · DONE · NO_SHOW · CANCELLED · บัตรเดินตามงาน
- งานรายนาที `booking.line.tick`: เลยผ่อนผัน ⇒ LATE (ปล่อยช่องให้ walk-in · มาภายในเวลา ⇒ เข้าแถวแบบ walk-in) · เลย `noShowAfterMin` ⇒ NO_SHOW + event ครั้งเดียว · สิ้นวัน · วางคิวใหม่ (เฉพาะหน่วยแถวเดียว)
- เลื่อน/ยกเลิกฝั่งร้าน (`rescheduleByShop` · `cancelByShop`)

## 5. จอคิววันนี้ · ของฉัน (B.5)
- `/app/u/<สาขา>/booking` (ภาพ จอง 01): ตารางช่างแนวนอน · เส้นตอนนี้ · walk-in ที่ระบบวาง (กรอบฟ้า) · แถวรอเรียงตามเวลา · ปุ่ม เรียก/เรียกซ้ำ/เริ่ม/เสร็จ/ข้าม/ย้ายช่าง/ไม่มา/ยกเลิก · "ต้องจัดการ" · กล่อง "ทำไม" · คิวมัดจำ (B.8) · รีเฟรชแบบ `AutoRefresh`
- `/booking/mine` (มือถือช่าง): เห็นเฉพาะงานตัวเอง + แถวรวม · ไม่เห็นเบอร์เต็ม · "เสร็จ + เพิ่มของ" (B.10) · ความชอบลูกค้า (B.16)
- `/booking/day` ปฏิทินรายวันตามคน (อ่านอย่างเดียว · ไม่มีแท็บ — แท็บ "ปฏิทินนัด" ชี้ B.14)
- แคชเชียร์ไม่มีปุ่มเริ่ม/เสร็จ

## 6. ตู้ · ทีวี · หน้าบัตร · บัตรจากมือถือ (B.6 · B.9)
- อุปกรณ์ = แถว `QueueDisplay` ของหน่วย (token 256 บิต แสดงครั้งเดียว · เก็บ sha256) · จัดการที่ `/booking/devices` + ค่าตั้งรายเครื่อง (DEVICE)
- ทีวี `/bq/tv/[token]` (เลขอย่างเดียว · ไม่มีชื่อ/เบอร์) · ตู้ `/bq/kiosk/[token]` (เช็กอิน · walk-in เลือกบริการ/ช่าง · rate limit) · หน้าบัตร `/bq/t/[token]` (ตำแหน่ง + เวลา · ขอเลื่อนคิวหลัง/ยกเลิก)
- รับบัตรคิวจากมือถือ `/s/<ร้าน>/<สาขา>/remote` (#42 · `booking-remote.ts` · เวลารอสูงสุด · เพดานต่อชั่วโมง)
- ⚠️ ไม่มี SSE · เสียงเรียก · พิมพ์บัตรความร้อน (ใบเลื่อน KT.1) — ค่าตั้ง `display.voice` `kiosk.paperTicket` มีแต่ยังไม่มีผล

## 7. จองออนไลน์ + ลิงก์จัดการนัด (B.7)
- หน้าร้าน `/s/<ร้าน>/<สาขา>` (`src/components/public-booking.tsx` · ภาพ จอง 03): 3 ขั้น บริการ → ช่าง/"ใครก็ได้" → เวลา+ข้อมูล · เปิดจากเมนู OA (ลิงก์เซ็น = รู้ตัวตน) หรือชื่อ+เบอร์ · ช่องข้อมูลเพิ่มตามค่าตั้ง (เช่น จุดที่ปวด/แรงนวด) · สรุปกติกาจาก snapshot · ไทย/อังกฤษ
- ลิงก์จัดการนัด `/bq/m/[token]` (token hash ≥128 บิต): ดู · เลื่อน (ไม่เกิน `selfRescheduleMax`) · ยกเลิกตามกติกา · ยกเลิกช้า = BLOCK/FORFEIT · เพิ่มลงปฏิทินมือถือ `.ics` · token นัดอื่น/ร้านอื่น = คำตอบเดียวกัน
- ⚠️ ต้องเปิดใช้พร้อม B.8 (deploy checklist)

## 8. มัดจำ (B.8 · B.15)
- PromptPay QR ยอดล็อก + แนบสลิป (ตัวตรวจสลิปกลาง) บนลิงก์จัดการนัด · หรือร้านกดยืนยันจากคิวมัดจำ (`booking.deposit.confirm`) · ไม่จ่ายใน `payWithinMin` ⇒ ปล่อยช่อง
- ใบรับมัดจำ POS คีย์ `booking-deposit-<นัด>` (ทุกทาง = ใบเดียว) · ไม่มา ⇒ ริบตาม % หรือ "รอร้านตัดสิน" · ยกเลิกในเวลาฟรี ⇒ ค้างคืน (ร้านกดคืน) · ยกเว้นสมาชิกระดับ (ตัวตนยืนยันเท่านั้น) · ใช้มัดจำหักในบิลจากคิว
- กลุ่ม: คิดต่อคน · จ่ายครั้งเดียวผ่านหัวกลุ่ม · ใบรับต่อคน · ริบปัดลงต่อคน · ป้ายต้นทางสลิป `[slip:id]`
- ⚠️ ไม่มี Beam/ตัดบัตร (ใบเลื่อน P.1) · ตัวต่อตรวจสลิปอัตโนมัติรอ C.1

## 9. แจ้งเตือน + ผูก LINE (B.9)
- ข้อความ 11 ชนิด (ค่าตั้ง `booking.msg.*` · เปิด/ปิดรายชนิด · แก้ถ้อยคำได้): ยืนยันนัด · เตือนก่อนนัด · เช็กอินแล้ว · ได้บัตร · ใกล้ถึงคิว · ถึงคิว · คิวล่าช้า · ไม่มา-ชวนนัดใหม่ · ชวนกลับมา · มีคิวว่าง (waitlist B.17) · เตือนคอร์ส (มีค่าตั้งแต่ไม่ส่ง)
- ส่งผ่าน `notifyCustomer` เท่านั้น (เวลาเงียบ · OA ต่อหน่วย · dedupe · ไม่มีเบอร์ใน log) · ซ่อนชื่อบริการได้ (`notify.hideServiceName`)
- ผูก LINE: walk-in ด้วยรหัส `QUEUE_TICKET` · นัดด้วย `APPOINTMENT` · postback `booking.*` (เช็กอิน · เลื่อน · ไปไม่ทัน) ตัดสินจาก connection ของ webhook

## 10. จบงาน → บิลจากคิว + ค่าคอมฯ (B.10)
- เสร็จ = งาน DONE + บิลพัก POS ในธุรกรรมเดียว (บรรทัดบริการ + ของที่ทำเพิ่ม · ผู้ให้บริการต่อบรรทัด · หักมัดจำ) · เรียกขึ้นได้ทุกเครื่องในสาขา · จ่าย ⇒ แต้ม/สแตมป์/ไทม์ไลน์ตาม event เดิม + `booking.paid`
- ค่าคอมฯ ลงตามผู้ให้บริการ (อัตรา ร้าน → บริการ → คน) ไม่ใช่คนกดขาย · คืนบิล ⇒ ค่าคอมฯ กลับรายการ
- ร้านไม่เปิด POS ⇒ ปุ่ม "รับเงินแล้ว" · void บิลจ่ายแล้วจากฝั่งจองคิว · เลิกเปิดบิล CASH เองในหน่วยแถวเดียว (ร้านเดิมยังเป็นทางเดิม)

## 11. สิทธิ์ · ความเป็นส่วนตัว (B.11 · B.16)
- คีย์ `booking.*` 26 (ป้ายไทย) · ทุก server action ผ่านด่าน `BOOKING_ACTIONS` (fail closed) · ตารางสิทธิ์ตามบทบาท 11 แถว + ชุดสำเร็จ หัวหน้า/ผู้ให้บริการ/แคชเชียร์ (คลินิก + ผู้ช่วย)
- ซ่อนเบอร์เลขกลางบนจอพนักงาน (เว้น `booking.customer.phoneFull`) · ลบชื่อ/เบอร์ walk-in ที่ไม่ใช่สมาชิกเมื่อครบ `privacy.walkInRetentionDays` (งานรายชั่วโมง)
- ความชอบ/ข้อห้ามลูกค้า (B.16): ฟิลด์สมาชิกที่ร้านเลือก (`booking.privacy.jobCardFields` · ค่าเริ่ม SPA = แรงกด + แพ้สารเคมี) บนการ์ดงาน/มือถือหมอ/ปฏิทิน · เฉพาะผู้ถือ `booking.customer.notes` · ฟิลด์อ่อนไหวตามนโยบายสมาชิก · ไม่มี engine ฟิลด์ใหม่

## 12. ทรัพยากร ห้อง/เตียง/อุปกรณ์ (B.13)
- `SvcResource` 7 ชนิด (เก้าอี้ · เตียง · โซฟา · ห้อง · ห้องคู่ · อุปกรณ์ · ห้องตรวจ) · ความจุ · เวลาเก็บ · ปิดใช้ (ไม่ลบ) · ปิดซ่อมเป็นช่วง (`SvcResourceBlock`) — จัดการที่ `/booking/staff` ส่วนทรัพยากร (ภาพ จอง 12)
- บริการประกาศชนิดที่ต้องใช้ (`booking.service.resourceKinds` ชั้นบริการ · ค่าเริ่ม `[]` = ไม่ใช้ทรัพยากร ทุกแม่แบบ) · จอง/ตัววางคิวต้องว่างทั้งคนและทรัพยากร (สูตรเดียว) · เลื่อนนัดเพราะห้องไม่ว่างได้ไม่เกิน `planner.resourceShiftMaxMin`
- ปิดซ่อม/ลดความจุ/ปิดใช้ ทับนัดที่ถืออยู่ ⇒ ปฏิเสธ IN_USE · กล่อง "รับ walk-in ตอนนี้ได้ไหม" แยกเหตุผลคน/ห้อง (บนปฏิทิน)

## 13. ปฏิทินนัด ลากย้าย (B.14)
- `/booking/calendar` (ภาพ จอง 02): วัน/สัปดาห์ · ตามคน/ตามห้อง · ลากย้าย = `rescheduleByShop` (ตรวจชนก่อนวาง · ชน ⇒ ปฏิเสธ + คืนตำแหน่ง · สำเร็จ = event rescheduled) · คลิกช่องว่าง "จองให้ลูกค้า" = `bookAppointment` · หมอลา ⇒ คอลัมน์ปิด · การ์ดงานข้าง (ไม่มีเบอร์) + ความชอบลูกค้า
- สิทธิ์: ลาก = `booking.appointment.reschedule` · จอง = `booking.appointment.create`

## 14. คู่รัก/กลุ่ม (B.15)
- 1 การจอง = หลายงาน (`groupId` · หัวกลุ่ม = แถวแรก) · เริ่มพร้อมกัน · ห้อง/เตียงชิ้นเดียวที่จุทั้งกลุ่ม (ไม่มี ⇒ เต็ม · ไม่แยกห้อง) · ได้ครบหรือไม่ได้เลย (atomic) · ขนาด 2–10
- ทางเข้าที่ใช้ได้วันนี้: **บริการที่ตั้ง "จำนวนผู้ให้บริการต่องาน" (`booking.service.staffCount`) ≥ 2** — จองออนไลน์/จากปฏิทินของบริการนั้นกลายเป็นกลุ่มเอง (หมอคนแรก = ที่เลือก · ที่เหลือ = ระบบหา)
- เช็กอินเบอร์/QR = ทั้งกลุ่ม · มาไม่พร้อมกัน ⇒ เริ่มพร้อมกันที่เวลาช้าสุด · ร้านยกเลิกรายคนได้ · เลื่อนรายคน ⇒ ปฏิเสธ (GROUP) · ลูกค้าเลื่อน/ยกเลิกผ่านลิงก์หัวกลุ่ม = ทั้งกลุ่ม · มัดจำรวม (§8)
- ⚠️ ไม่มีหน้าจอ "จองหลายคนผสมบริการ" (`bookGroup` มีแต่ไม่มีผู้เรียกจากหน้า) · ปฏิทินลากสมาชิกกลุ่ม = ปฏิเสธ · ร้านยกเลิก/เลื่อนทั้งกลุ่มจากจอไม่ได้ (ดู SDS §10)

## 15. waitlist + ไม่มาซ้ำ (B.17)
- "แจ้งฉันถ้ามีคนยกเลิก" บนหน้าจอง (ตัวตนจากลิงก์ LINE เท่านั้น · รอได้พร้อมกัน `waitlistMaxActive`) · โหมด `booking.booking.waitlistMode` OFF/FIRST/ALL (ตัดผม ALL · สปา FIRST · คลินิก OFF · ร้านเดิม OFF) · ข้อเสนอไม่ถือช่อง — ลิงก์พาไปหน้าจองเดิม · ส่งครั้งเดียวต่อช่อง (dedupe) · งาน `booking.waitlist.tick`
- ไม่มาซ้ำ (`booking.late.repeatNoShow` · เช่น 2 ครั้งใน 90 วัน) ⇒ บังคับมัดจำ หรือ ต้องโทรจอง (ข้อความปฏิเสธไม่บอกเหตุ) · ร้าน "ยกเว้นไม่มาครั้งนี้" (`booking.deposit.waive`)
- ⚠️ ยังไม่มีปุ่ม "ออกจากคิวรอ" บนหน้า · FIRST ไม่ส่งต่อเมื่อคนแรกออก (หนี้)

## 16. ยังไม่มี (ที่สเปก v1 เคยติ๊ก ✅ หรือแผนกล่าวถึง)
หมวดบริการ · รูป/คำอธิบายบริการ · หลายบริการต่อ 1 นัด (ทำเพิ่มได้ตอนจบงานเท่านั้น) · `maxPerDay` ต่อบริการ · กลยุทธ์ "ใครก็ได้" LEAST_BUSY/ROUND_ROBIN (ตัววางคิวเลือกเอง) · log สถานะแยก (`AppointmentStatusLog`) · PENDING หมดอายุอัตโนมัติ · blacklist/บล็อกลูกค้า (แทนด้วยไม่มาซ้ำ B.17) · OTP ลูกค้า · SSE/realtime · รายงาน/สถิติจองคิว (`booking.report.view` = planned) · คอร์ส/แพ็กเกจ (CO.x) · นัดประจำ (recurring) · Google Calendar sync (มีแค่ .ics) · EXCLUDE constraint · นำเข้า CSV บริการ/พนักงาน

## 17. หนี้ที่รู้
ตาราง §10 ของ `docs/sds/modules/booking.md` (จาก `ledger/SVC-RUN.md` §3.2/§4 + `ledger/SVC-OWNER-QUESTIONS.md`) — ย่อ: คืนส่วนเกินมัดจำ · PB-12 · เปิดบิลใหม่หลัง void · walk-in/ปฏิทินข้ามเที่ยงคืน · ปุ่ม "มาถึง" = เวลากด · ทางเข้ากลุ่มหน้าจอ · waitlist FIRST/ปุ่มออก · กะ HR `[]` · ไม่มีรายงาน

---

## ภาคผนวก — v1 design notes (สเปกเดิมก่อนสร้าง · ก.ค. 2569)

> สเปกเดิม (REVISED หลัง QC 2026-07-11) เก็บเฉพาะ §1–§3 ไว้เป็นเจตนา/บริบท · **หัวข้อที่เคยติ๊ก ✅ ถูกแก้ตามโค้ด `b3de0dce`** (✅ = มีจริง · ✅ (แบบต่าง) = มีแต่ต่างจากสเปก · ⚠️ = บางส่วน · ❌ = ไม่มี) พร้อมบรรทัด "as-built" ใต้หัวข้อ · ข้อความในตัวสเปกเดิมใต้บรรทัดนั้นไม่ได้แก้ — ถ้าขัด ให้เชื่อบรรทัด as-built
> §4–§12 ของสเปกเดิมแทนที่แล้ว (เหลือตัวชี้) · ฉบับเต็มก่อนแก้: `git show b3de0dce:docs/modules/03-booking.md`

### (หัวเดิม) โมดูล 3: Booking — จองคิวนัดหมายตามเวลา (Appointment Scheduling)

> 🔄 REVISED หลัง QC — สอดคล้อง RESOLUTIONS.md (2026-07-11)
> scope: **unit** (ทุกตารางมี `tenantId + unitId`) · ยึด `_CONVENTIONS.md` + `BLUEPRINT.md` + `BLUEPRINT_BUSINESS_UNITS.md`
> กลุ่มเป้าหมาย: ร้านตัดผม / ทำเล็บ / ทำผม / นวด / สปา / คลินิก (ธุรกิจบริการที่ขาย "เวลา + คน")
> คู่แฝด: โมดูล 4 (Q) = walk-in มาก่อนได้ก่อน · Booking = นัดล่วงหน้าตามเวลา — มี handoff ระหว่างกัน (ดูข้อ 8.6)

---
### 1. ภาพรวม + ขอบเขต

#### ทำอะไร (v1 แบบเดิม — สถานะจริงต่อข้อดู §3 ด้านล่าง + หมวด V2)
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

#### ยังไม่ทำใน v1 (🔜 Phase ถัดไป) — สถานะ ณ `b3de0dce`: มัดจำ ✅ B.8 · ทรัพยากร ✅ B.13 · หลายช่างพร้อมกัน ✅ B.15 (ผ่าน `staffCount`) · waitlist ✅ B.17 · ค่าคอมฯ ช่าง ✅ B.10 · recurring/คอร์ส/Google Calendar ยัง 🔜
- 🔜 **มัดจำ (deposit)** — เก็บเงินล่วงหน้าตอนจองผ่าน PromptPay/gateway, คืน/ยึดตามนโยบาย (schema เผื่อ field ไว้แล้ว)
- 🔜 **Recurring appointment** — นัดประจำทุกสัปดาห์/เดือน (คอร์สนวด 10 ครั้ง, ติดตามอาการคลินิก)
- 🔜 **ทรัพยากรประกอบ (Resource)** — ห้อง/เตียง/เก้าอี้เป็นคอขวดที่สอง (v1 ถือว่าช่าง 1 คน = 1 slot)
- 🔜 **บริการหลายช่างพร้อมกัน** (เช่น นวด 4 มือ), **แพ็กเกจ/คอร์ส** (ตัดรอบจากคอร์สที่ซื้อไว้)
- 🔜 **Waitlist** (คิวรอเสียบเมื่อมีคนยกเลิก), **Google Calendar sync ต่อช่าง**
- ❌ ไม่ทำ: payroll/คอมมิชชั่นช่าง (อยู่โมดูล Account/HR อนาคต), ระบบเวชระเบียน (เกิน scope คลินิกทั่วไป — v1 มีแค่ note ต่อนัด)

---

### 2. Persona & User Stories

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

### 3. ฟังก์ชันทั้งหมด

#### 3.1 Service Catalog ⚠️ บางส่วน
> as-built: บริการต้นฉบับ = แคตตาล็อกกลาง `InvItem` + `BookingService` (นาที · ราคา · มัดจำ · เวลาเก็บ `bufferMin` ตัวเดียว · `bookable`) · ❌ ไม่มี: หมวดบริการ `BookingCategory` · ชื่อ EN/คำอธิบาย/รูป · `priceNote` · `bufferBefore/After` แยก · `maxPerDay` · หลายบริการต่อนัด (ของทำเพิ่มใส่ตอนจบงาน B.10)
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

#### 3.2 Staff + Skill Mapping ✅ (แบบต่าง)
> as-built: `BookingStaff` (ชื่อ · `employeeId` ผูก HR · ไม่มีรูป/bio/สี/`visibleOnline`) · `BookingStaffService` มีแล้ว (B.0/B.1) แต่ **ไม่มีแถว = ทำทุกบริการ** เมื่อ `booking.staff.servicesMode` = ALL (คลินิก = ASSIGNED)
- `BookingStaff`: ชื่อเล่นที่ลูกค้าเห็น, รูป, bio สั้น, สี label บนปฏิทิน, `userId?` (ผูก login ถ้าช่างมีบัญชี — ไม่บังคับ, ช่างจำนวนมากไม่ล็อกอิน), `visibleOnline` (ให้ลูกค้าเลือกจากหน้าเว็บได้ไหม), ลำดับแสดงผล
- `BookingStaffService` (skill mapping): ช่าง×บริการ — ใครทำอะไรได้ + override รายคน:
  - `durationMinOverride?` (ช่างอาวุโสตัดเร็วกว่า), `priceSatangOverride?` (ช่างระดับ director แพงกว่า)
- ช่างที่ไม่มี mapping กับบริการ = ไม่โผล่เป็นตัวเลือกและ slot engine ไม่จัดให้

#### 3.3 ตารางเวลา ⚠️ บางส่วน
> as-built: `BookingHours` (ร้านรายสัปดาห์) · `BookingStaffHours` · `BookingClosure` (วันหยุด/เวลาพิเศษรายวัน) · ลาจาก HR (ใบลาอนุมัติ) · ❌ ไม่มี `BookingStaffSchedule`/`BookingTimeOff` · ❌ กะ HR ยัง `[]` (`staffWindows`)
- **เวลาทำงานรายสัปดาห์** (`BookingStaffSchedule`): ต่อช่าง ต่อวันในสัปดาห์ (0–6) หลายช่วงได้ (เช้า 09:00–13:00 + บ่าย 14:00–18:00 → 2 แถว) — ช่วง 13:00–14:00 คือพักเที่ยงโดยปริยาย
- **วันหยุด/ลา/บล็อกเวลา** (`BookingTimeOff`): ผูกช่างคนเดียว (`staffId`) หรือทั้งร้าน (`staffId = null` เช่น หยุดสงกรานต์) — ระบุช่วง `startAt–endAt` ละเอียดถึงนาที (ลาครึ่งวัน/ออกไปธุระ 2 ชม. ได้), เหตุผล, ใครบันทึก
- **เวลาเปิดร้าน**: อ่านจาก `unit.settings.openHours` (ชั้น BusinessUnit) — slot ของช่างถูก intersect กับเวลาเปิดร้านเสมอ
- ตารางช่างแก้ล่วงหน้าได้ (effective ทันที) — นัดเดิมที่ตกนอกตารางใหม่**ไม่ถูกยกเลิกอัตโนมัติ** แต่ขึ้น warning ในปฏิทินให้ front desk จัดการ

#### 3.4 Slot Engine ✅ (แบบต่าง · หัวใจของโมดูล)
> as-built: `findSlots`/`bookAppointment` (`service.ts`) + ตัววางคิว `planDay` (B.2/B.3) · กันจองซ้อนด้วยล็อก (idem → เบอร์ → สาขา → `BookingStaff FOR UPDATE` → `SvcResource`) + CAS · ❌ ไม่มี EXCLUDE constraint `no_staff_overlap` · ❌ ไม่มี `anyStaffStrategy` (LEAST_BUSY/ROUND_ROBIN — ตัววางคิวเลือก) · ❌ ไม่มี `maxPerDay` · ❌ 409 พร้อม slot ใกล้เคียง
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

#### 3.5 ช่องทางจอง ✅ (แบบต่าง)
> as-built: หน้าร้าน `/s/<ร้าน>/<สาขา>` 3 ขั้น (B.7) · ตัวตนจากลิงก์ LINE ที่เซ็น หรือชื่อ+เบอร์ (❌ ไม่มี OTP · ❌ ไม่ผูกสมาชิกจากเบอร์ที่ไม่ยืนยัน) · ลิงก์จัดการนัด `/bq/m/[token]` · พนักงาน/ปฏิทิน (B.14) · walk-in/ตู้/มือถือ (B.4/B.6/B.9) · ❌ ไม่มี force-book ทับ buffer
- **Storefront** (`/s/[tenantSlug]/[unitSlug]/booking` หรือ custom domain): wizard 4 ขั้น — บริการ (เลือกได้หลายรายการ) → ช่าง (การ์ดช่าง + "ใครก็ได้") → วัน+เวลา (ปฏิทิน + slot) → ข้อมูลลูกค้า+ยืนยัน
  - ลูกค้า login (OTP ผ่าน `member.sendOtp/verifyOtp` channel phone/email — contract 2.6) หรือ **guest** (ชื่อ+เบอร์+email) — guest ถูก match/สร้างผ่าน `member.findOrCreate({tenantId, phone (normalize E.164), name, source:'BOOKING'})` (D6) ให้แต้มย้อนหลังได้เมื่อสมัคร
  - หลังจอง: หน้า confirmation + ลิงก์จัดการนัด (`manageToken` — ดู/เลื่อน/ยกเลิกได้โดยไม่ต้อง login)
- **หน้าร้าน/โทร** (dashboard): quick-create จากปฏิทิน (คลิกช่องว่าง → ฟอร์มสั้น) หรือปุ่ม "จองใหม่" — front desk ข้ามกฎ `minLeadTime`/`onlineBookable` ได้ (สิทธิ์ walk-in), และ **force-book** ทับ buffer ได้ถ้ามีสิทธิ์ MANAGER ขึ้นไป (มี audit log)

#### 3.6 วงจรสถานะนัด ✅ (แบบต่าง)
> as-built: 9 สถานะ (เดิม 6 + QUEUED · IN_SERVICE · LATE) · ไม่มาอัตโนมัติ `booking.late.noShowAfterMin` (B.4) · ❌ ไม่มี `pendingTtlHours` (PENDING หมดอายุ) · ❌ ไม่มี `AppointmentStatusLog` (ใช้ outbox event + AuditLog) · ❌ ไม่มีแก้สถานะย้อน
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

#### 3.7 เลื่อน / ยกเลิก + นโยบาย ✅ (แบบต่าง)
> as-built: นโยบาย = ค่าตั้ง `booking.late.*` + snapshot ต่อนัด (❌ ไม่มีตาราง `BookingPolicy`) · ลูกค้าเลื่อนเองไม่เกิน `selfRescheduleMax` · เลื่อน/ยกเลิกฟรีก่อน `freeChangeBeforeMin` · ยกเลิกช้า BLOCK/FORFEIT (B.7/B.8) · ร้านเลื่อน/ยกเลิก (B.4/B.14)
นโยบายเก็บใน `BookingPolicy` (1 แถวต่อ unit):
- `cancelMinHours` (ลูกค้ายกเลิกเองล่วงหน้าอย่างน้อย X ชม., default 2) · `rescheduleMinHours` (default 2) · `maxRescheduleCount` (default 2)
- เลื่อน = **นัดเดิม** เปลี่ยน `staffId/startAt` ผ่าน slot engine + lock เดิม (ไม่สร้างนัดใหม่ — ประวัติ/แต้ม/ลิงก์เดิมอยู่ครบ), `rescheduleCount++`, ลง StatusLog `RESCHEDULED` (สถานะหลักไม่เปลี่ยน)
- ลูกค้าทำเองผ่าน manageToken ในกรอบนโยบาย / staff ทำได้เสมอ (เกินกรอบ = ต้อง MANAGER+)
- ยกเลิกโดยร้าน (ช่างป่วย): เลือกนัดหลายรายการ → cancel พร้อม notify ลูกค้า + เสนอ slot ใหม่ในข้อความ
- 🔜 เมื่อมี deposit: นโยบายยึด/คืนมัดจำผูกกับ `cancelMinHours`

#### 3.8 มัดจำ ✅ B.8 (แบบต่าง)
> as-built: QR พร้อมเพย์ + แนบสลิป / ร้านกดยืนยัน · ใบรับมัดจำ POS คีย์ `booking-deposit-<id>` · ถือช่อง `payWithinMin` · ริบ/คืนตาม snapshot — ฟิลด์ `depositStatus` ด้านล่างไม่มีจริง (สถานะคิดจากข้อมูล 12 แบบ · `deposit.ts`)
- field เผื่อไว้แล้วใน schema: `Appointment.depositSatang`, `depositStatus (NONE|PENDING|PAID|REFUNDED|FORFEITED)`, `BookingService.depositSatang?`
- flow อนาคต: จองออนไลน์ → สร้าง PromptPay QR ผ่าน payment gateway → จ่ายใน 15 นาที ไม่จ่าย = auto-cancel → ตอนจบงาน deposit หักจากบิล POS (`payMethods: VOUCHER-like`)
- v1: ทุกนัด `depositStatus = NONE`, UI ไม่แสดงส่วนนี้

#### 3.9 Recurring Appointment 🔜 (ยังไม่มี · ไม่มี `seriesId`/`BookingSeries`)
- field เผื่อ: `Appointment.seriesId?` → model `BookingSeries` (RRULE-lite: ทุก N สัปดาห์ × M ครั้ง)
- สร้างนัดลูกล่วงหน้าเป็นชุด ผ่าน slot engine ทีละนัด — นัดที่ชนให้ผู้สร้างเลือก slot อื่นเป็นรายตัว
- v1: ไม่มี UI, `seriesId` เป็น null เสมอ

#### 3.10 เตือนก่อนถึงนัด ✅ B.9 (แบบต่าง)
> as-built: `booking.notify.reminderOffsetsMin` + งาน `booking.notify.tick` ทุก 1 นาที · ส่งผ่าน `notifyCustomer` (LINE OA ของร้าน · dedupeKey · เวลาเงียบ) · ❌ ไม่มี `AppointmentReminder` · ❌ ไม่มี email/SMS
- ตั้งค่าใน `BookingPolicy.reminderOffsetsMin Json` (default `[1440, 120]` = 24 ชม. + 2 ชม.)
- Cron ทุก 5 นาที: หานัด `CONFIRMED` ที่ `startAt - offset` ตกใน window และยังไม่เคยส่ง (กันซ้ำด้วย `AppointmentReminder @@unique([appointmentId, offsetMin])`) → ยิง `notify({ channel: EMAIL|LINE, template: 'booking.reminder', data: {ชื่อร้าน, บริการ, ช่าง, เวลา, ลิงก์จัดการนัด} })`
- ส่งทันทีเมื่อ: จองสำเร็จ (`booking.confirmed`), ถูกยืนยันจาก PENDING, เลื่อน (`booking.rescheduled`), ยกเลิก (`booking.cancelled`)
- ช่องทางตามที่ลูกค้ามี: memberId → ตามช่องที่ผูก / guest → email+SMS(อนาคต) ที่กรอก

#### 3.11 No-show tracking + Blacklist ❌ (แทนด้วย "ไม่มาซ้ำ" B.17)
> as-built: ❌ ไม่มี `BookingBlock`/blacklist/badge · ✅ แทนด้วย `booking.late.repeatNoShow` (นับตามตัวตนยืนยัน/คีย์เบอร์ ⇒ บังคับมัดจำ หรือ ต้องโทรจอง · ร้านยกเว้นรายนัด)
- ทุกนัด `NO_SHOW` นับเข้าสถิติของ `memberId` (guest นับด้วยเบอร์โทร normalize)
- `BookingPolicy`: `noShowBlacklistThreshold` (default 3 ครั้ง) ใน `noShowWindowDays` (default 90 วัน) → เกิน = สร้าง `BookingBlock` อัตโนมัติ (SYSTEM)
- ผลของ block: จอง**ออนไลน์**ไม่ได้ (ขึ้นข้อความสุภาพ "กรุณาติดต่อร้านโดยตรง") — หน้าร้านจองให้ได้เสมอ (ร้านตัดสินใจเอง), front desk เห็น badge "no-show X ครั้ง" ตอนสร้างนัด
- ปลด block ได้ (MANAGER+, ลง audit log), block มือก็ได้พร้อมเหตุผล
- NO_SHOW ที่ถูกแก้กลับ (ลูกค้ามาช้า) → ลบออกจากสถิติอัตโนมัติ

#### 3.12 ปฏิทินร้าน ✅ B.14 (แบบต่าง)
> as-built: `/booking/calendar` วัน/สัปดาห์ · ตามคน/ตามห้อง · ลากย้าย + คลิกช่องว่างจอง · ❌ ไม่มี SSE `booking.changed` (รีเฟรชตามหน้า) · ❌ ไม่มี swipe มือถือ
- **Day view** (default): คอลัมน์ = ช่าง, แถว = เวลา (กริดตาม granularity), บล็อกนัดโชว์ ชื่อลูกค้า+บริการ+สถานะสี, บล็อกเทา = พัก/ลา/นอกตาราง, เส้นแดง = เวลาปัจจุบัน
- **Week view**: ต่อช่างคนเดียว (เลือกช่าง) 7 วัน
- คลิกช่องว่าง = quick-create · คลิกนัด = drawer รายละเอียด (เปลี่ยนสถานะ, เลื่อน, ยกเลิก, ไป POS)
- refresh อัตโนมัติ (SSE `booking.changed` ต่อ unit ต่อวัน) — สองเครื่องหน้าร้านเห็นตรงกัน
- มือถือ: day view แนวตั้งทีละช่าง, swipe เปลี่ยนช่าง/วัน

#### 3.13 ชำระจบงานผ่าน POS ✅ B.10 (แบบต่าง)
> as-built: จบงาน = บิลพัก POS ("บิลจากคิว" · ไม่ใช่ปุ่มเปิด POS) · จ่าย ⇒ `booking.paid` · ร้านไม่เปิด POS ⇒ "รับเงินแล้ว" · ❌ ไม่มี `AppointmentItem` · ❌ ไม่มีรายงาน "DONE ยังไม่มีบิล"
- ปุ่ม "เก็บเงิน" บนนัดสถานะ `IN_SERVICE/DONE` → เปิด POS พร้อม lines จาก AppointmentItem (แก้ราคา/เพิ่มรายการขายหน้าร้านได้) → `createSale` (ดูข้อ 8.1)
- จ่ายสำเร็จ → นัดบันทึก `saleId` + ถ้ายังไม่ DONE ให้เปลี่ยนเป็น DONE อัตโนมัติ
- นัดที่ DONE โดยไม่เก็บเงินผ่าน POS ได้ (เคสเคลียร์บิลรวมท้ายเดือน) — รายงานแยก "DONE ยังไม่มีบิล"

#### 3.14 รายงาน ❌ — ยังไม่มีหน้ารายงานจองคิว (`booking.report.view` = planned · ใบเลื่อน RP.x)

---

### 4. Data Model — แทนที่แล้ว
โครงข้อมูลที่สร้างจริง (10 model ใน `prisma/schema/booking.prisma` + คอลัมน์ POS/บัตรคิว) อยู่ที่ `docs/sds/modules/booking.md` §2 · ร่าง Prisma ของสเปก v1 (`BookingCategory` · `AppointmentItem` · `AppointmentStatusLog` · `BookingPolicy` · `BookingBlock` · `BookingTimeOff` · `AppointmentReminder` · `DepositStatus` · `BookingSeries`) **ไม่มีในโค้ด** — อ่านร่างได้ที่ `git show b3de0dce:docs/modules/03-booking.md`

### 5. API Endpoints — แทนที่แล้ว
ใช้ server action (`src/lib/actions/booking*.ts` · ด่าน `BOOKING_ACTIONS`) + สาธารณะ `POST /api/store/[tenantSlug]/[unitSlug]/book` · `GET .../slots` · action สาธารณะใต้ `src/app/(store)/bq/*` — ไม่มี REST `/api/u/...` ตามสเปก v1 · ไม่มี REST v1 ของจองคิว (ใบเลื่อน API.x)

### 6. UI Screens — แทนที่แล้ว
หน้าที่สร้างจริง = หมวด V2 §1–§15 (`/app/u/[unitSlug]/booking/*` · `/s/<ร้าน>/<สาขา>` · `/bq/*`) ตามภาพ `ledger/design-booking/` · ❌ ไม่มี `/booking/appointments` · `/booking/timeoff` · `/booking/blocks` · `/booking/reports` · `/s/.../booking/manage/[token]`

### 7. Business Flows — แทนที่แล้ว
flow จริง: ชุด UAT U1 (ร้านตัดผม) และ U3 (ร้านนวด) §2 · cron ทุก 5 นาทีของสเปก v1 ไม่มี — งานรายนาที 5 ตัว (`docs/sds/modules/booking.md` §3)

### 8. Integration — แทนที่แล้ว
POS: มัดจำ (`moduleTakeDeposit` …) + บิลจากคิว (`serviceBills.openServiceBill`) · สมาชิก/CRM ผ่าน outbox `booking.completed`/`booking.no_show` · แชท/LINE ผ่าน `notifyCustomer` + postback · HR ลา/กะ · ❌ ไม่มี handoff ไปหน่วย QUEUE ตอน ARRIVED (แถวเดียวออกบัตร P ของตัวเอง) — รายละเอียด SDS §3 §8

### 9. Permissions — แทนที่แล้ว
คีย์ของสเปก v1 (`booking.read` · `booking.appointment.update` · `.force` · `.checkout` · `booking.catalog.manage` · `booking.staff.manage` · `booking.schedule.manage` · `booking.policy.manage` · `booking.report.read`) **ไม่มีในโค้ด** — คีย์จริง 26 ตัว ดูหมวด V2 §11 + SDS §5

### 10. Reports & Metrics — ยังไม่มี
ไม่มีรายงานจองคิว (utilization · no-show rate · บริการยอดนิยม · cancellation · KPI การ์ด) — ใบเลื่อน RP.x

### 11. Edge Cases & Rules — แทนที่แล้ว
กติกาจริง (ลำดับล็อก · snapshot · X1/X5/X7/X8 · ข้ามเที่ยงคืน = หนี้) อยู่ในหัวไฟล์โค้ดแต่ละไฟล์ + SDS §7 · ข้อ 1 (EXCLUDE) · 9 (`maxPerDay`) · 11 (หลายบริการต่อนัด) · 12 (SSE) ของสเปก v1 ไม่มีจริง

### 12. QC Checklist — แทนที่แล้ว
ข้อสอบจริง `scripts/qc-svc-b.*.mts` (17) · `scripts/probe-b*-b.mts` (10) · regression `qc-booking-*` — ผลตอนรับใบใน SDS §9 · ด่านเต็ม G1 ✅ · G3 ⬜

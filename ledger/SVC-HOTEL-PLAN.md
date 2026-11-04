# SVC-HOTEL-PLAN — แผนเฟส H (โรงแรม V2) · ร่าง 1 (4 พ.ย. 2569 · ผู้คุม)

> สถานะ: **📝 วางแผน (เจ้าของสั่ง 4 พ.ย.) · ยังไม่แตะโค้ด** · เริ่มสร้างเมื่อ (1) เจ้าของตอบคำถาม §5 (2) RUN เลขา AI จบ (เครื่อง 4 vCPU ใช้ร่วม)
> ยึด: สเปก `docs/modules/01-hotel.md` (S) · แบบ `ledger/DESIGN-DORM-HOTEL.md` §7/§7.1/§10 (DH) · ภาพ `ledger/design-dorm/` 08 · 09 · 11 · 13 · 15 · 16 · แผนแม่บท `SVC-MASTER-PLAN.md` §6.1
> กติกาเหล็กเดิมของ SVC-RUN §1 ใช้ทั้งหมด (ห้าม push main · QC DB ผ่าน qc-svc.sh · migration เฉพาะ H.0 · ORACLE-EDIT เฉพาะผู้คุม · ภาพคู่ MOCKUP|RENDER ทุกจอ)

## 1. ของที่มีอยู่แล้ว (ตรวจโค้ด 4 พ.ย.)
| ชิ้น | สภาพ | ใช้ใน H |
|---|---|---|
| โรงแรม P1 (`hotel/service.ts` 966 บรรทัด · 3 หน้า + storefront 3 หน้า) | จอง/เช็กอิน/เช็กเอาต์/ยกเลิก/คืนเงิน/มัดจำ PromptPay ทำงานจริง · ราคา = baseRate×คืน · **เช็กเอาต์ปิดบิล POS ด้วย CASH ตายตัว** (`service.ts:640–642`) · ยกเลิกไม่คืน/ริบมัดจำ · ไม่มี HOLD/no-show/ย้ายห้อง/ต่อคืน | ต่อยอด ไม่เขียนใหม่ |
| แกนห้อง R0 (`modules/rooms`) | `RoomOccupancy` + EXCLUDE gist · claim/move/resize/release · `expireHolds` (minute-job) · `roomBoard`/`occupancyRange` · hkStatus · OOO กระทบใคร | ใช้ตรง = ชั้น "ห้องจริง" |
| ทะเบียนค่าตั้ง | `rooms.hotel.*` 24 คีย์ประกาศแล้ว (`defs/rooms.ts:642–716`) ซ่อน `hiddenUntil:"PHASE_H"` · scope RATE_PLAN ยังไม่รองรับใน service | เปิดใช้ + เติมคีย์ที่ขาด |
| ศูนย์เชื่อมต่อ | `TenantIntegration` · kind `CHANNEL_MANAGER` มี (ready:false) · adapter interface `pushAri/pullReservations/ackReservation` (ชนิด unknown) · provider fake | H.10 นิยามชนิด + fake adapter ทดสอบ |
| POS | `createSale` หลาย tender (DEPOSIT+CASH+CARD+PROMPTPAY+TRANSFER+ON_ACCOUNT) · `moduleTakeDeposit/Forfeit/Refund` · `ROOM_CHARGE` เป็นแค่ลูกหนี้ 1100 ยังไม่ผูกห้อง | H.5 ใช้ API ที่มี ไม่แก้สัญญา POS |
| หอ: แจ้งซ่อม · พัสดุ · ขอบเขตอาคาร · สะพานบอร์ดงาน · LINE notify | ด่านตรวจ `type === "DORM"` แข็ง | เปิดเป็น "หน่วยที่มีห้อง" (DORM|HOTEL) |
| หอ: LINE portal · ตรวจสลิป/รับเงิน · ประกาศ | ผูก DormLease/DormBill | เขียนใหม่ฝั่งแขก (ต่อยอด `publicToken`) |
| QC | oracle 3 ตัว (`qc-hotel-money/refund/public`) · ฟิกซ์เจอร์ bansuan-hotel 14 ห้อง · ภาพ `hotel-today` 1 ใบ · ไม่มี scene/walker/ข้อสอบรายใบ | ต้องสร้างข้อสอบ+ฉาก+walker ใหม่ทุกใบ |

## 2. มติเทคนิค (ผู้คุมเคาะ · แก้ข้อขัดแย้ง S ↔ DH)
1. **ใช้ `HotelReservation` เดิม + `groupId`** (1 แถว = 1 ห้อง · กลุ่ม = หลายแถว) ตาม DH/MP · ไม่สร้าง `HotelBooking` ใหม่ · folio ต่อ reservation (กลุ่ม = หลาย folio ปิดทีละใบ หรือปิดรวมเป็นบิล POS ใบเดียวได้) · สถานะขยาย `HOLD/CONFIRMED/CHECKED_IN/CHECKED_OUT/NO_SHOW/CANCELLED` · map `BOOKED→CONFIRMED` · `REFUNDED` คงเป็นสถานะปลาย (ของเดิม)
2. **ชั้นห้องจริง = `RoomOccupancy` อย่างเดียว** (STAY/HOLD/BLOCK + EXCLUDE) · ไม่สร้าง `HotelRoomBlock`/partial unique (roomId,date) ซ้ำ · BLOCK เพิ่ม `reason/note` · sweeper เดียว = `expireHolds` เดิม + ปลด `HotelBookingNight.counted`
3. **ชั้นประเภทห้อง = `HotelBookingNight.counted`** + advisory lock ต่อ (unit, roomType) ตาม S §7.2 · availability สูตรเดียว S §4.2 ใช้ทุกที่ (storefront · tape chart · OTA)
4. **ราคา**: `HotelRatePlan/HotelSeason/HotelRate/HotelHoliday/HotelCancelRule` ตาม S §4 + `HotelRateOverride`(roomTypeId, ratePlanId?, date, price) สำหรับ "แก้มือรายวัน" (ภาพ 15) · `rooms.hotel.baseRate/dayOfWeekAdjustBp` = fallback เมื่อไม่มีแถว HotelRate · ราคาเก็บเป็น snapshot รายคืน
5. **ค่าตั้งทั้งหมดผ่าน registry `rooms.hotel.*`** (ไม่ใช้ `BusinessUnit.settings.hotel` ตาม S:648) · เติมคีย์ที่ขาด: bookingMode · weekendDays · dailyHousekeeping · inspectionRequired · maxAdvanceBookingDays · codePrefix · deposit enum ขยายให้มี FIXED_AMOUNT · เปิด scope RATE_PLAN · snapshot kind ใหม่ `reservation` (= policySnapshot) · editPermission ใหม่ `hotel.settings.edit` · `requires.integration` แก้ "OTA"→"CHANNEL_MANAGER"
6. **สถานะห้อง**: `hkStatus` enum `DIRTY/CLEAN/INSPECTED/OOO` เป็นแหล่งเดียว · `HotelRoom.status` P1 เลิกใช้ (derive จาก occupancy+hkStatus) · แดชบอร์ดนับจาก hkStatus
7. **ด่านหน่วย**: ทุก action/หน้าโรงแรมตรวจ `unit.type === "HOTEL"` (เหมือน `dormStaffGate`) · ชิ้นร่วม (ซ่อม/พัสดุ/ขอบเขต/สะพานบอร์ด) เปิดด่านเป็น `DORM|HOTEL`
8. **เงินทุกบาทผ่าน POS** (S:44): มัดจำ = `moduleTakeDeposit` (รับ payType จาก UI) · no-show ริบ = `moduleForfeitDeposit` · ยกเลิก = refund ตาม policySnapshot ผ่าน POS · เช็กเอาต์ = `createSale` ใบเดียว lines รายคืน/บริการ + tenders จริงจาก UI + `shiftId` เคาน์เตอร์ (แก้ CASH ตายตัว) · เงินประกันห้อง (ถ้าเจ้าของเอา) = `moduleTakeDeposit` keyBase แยก + FolioItem `SECURITY_DEPOSIT/SECURITY_REFUND`
9. `source` เพิ่ม `LINE` · OTA ใช้ `TenantIntegration kind CHANNEL_MANAGER` (ไม่สร้าง `HotelChannelConnection`) · ตาราง OTA ตาม DH §10
10. ย้ายห้องไม่คิดส่วนต่างราคา (S:911) · early departure ไม่คืนอัตโนมัติ (S:923) · night audit ครบ 6 ขั้นตาม S §7.7 ("ย่อ" ของ DH = ไม่มี audit pack PDF) · เช็กอิน 14:00 / เช็กเอาต์ 12:00 / audit 03:00 เป็นค่าเริ่ม (ตั้งได้)
11. วันที่: รวม `todayBkk/parseDate` ของ hotel เข้ากับ `rooms/occupancy.ts` (toYmd/ymdToDb) ก่อน night audit · business date ตาม timezone ร้าน
12. ล็อกลำดับ: ประเภทห้อง (advisory) → แถวห้อง FOR SHARE (ย้าย `lockDormRoomShared` ขึ้น rooms facade) → occupancy — ปิดช่อง race "ปิดห้อง ∥ จอง" ฝั่งโรงแรม
13. AI อ่านพาสปอร์ต = abstraction AI กลางที่มี + **คนยืนยันเสมอ** · ตม.30 = เตรียมข้อมูล+ไฟล์ตามแบบอัปโหลด + ช่องเลขรับแจ้ง (ไม่ส่งอัตโนมัติ · DH:148) · ร.ร.3/ร.ร.4 พิมพ์ PDF แบบราชการ
14. oracle P1 3 ตัว: ผู้คุม ORACLE-EDIT ตอน H.5 (ลายบิล/tender เปลี่ยน) · ข้อสอบใหม่ `qc-svc-h.N.mts` ต่อใบ + ฉาก `svc-qc-hotel-scene.mts` + walker โรงแรม (ต่อจาก g2-d15/walker)

## 3. ใบงาน (11 ใบ · ลำดับทำจริง · ขนาด = หน่วยเดิมของแผนแม่บท)
| # | ใบ | งานหลัก | ขึ้นกับ | ขนาด | ภาพ | ความเข้ม |
|---|---|---|---|---|---|---|
| 1 | **H.0** | migration `svc_h` (ตาราง §2 ข้อ 1–4, 9 · ฟิลด์ใหม่ HotelReservation/RoomType/Room · enum สถานะ · index `[unitId,roomTypeId,date,counted]`) · scope ลงทะเบียน · เปิด `PHASE_H` · backfill การจองเก่า (BOOKED→CONFIRMED · nights · occupancy) · ด่าน type HOTEL | — | 1 | — | migration (ขอ exception) |
| 2 | **H.1** | ราคา: ฤดู/วันหยุด/แผนราคา/ขั้นบันไดยกเลิก/matrix/override รายวัน · rate resolution S §7.1 · preview · จอราคา + นโยบาย · ค่าตั้ง `/hotel/settings` | H.0 | 2 | 15 · 17 | เงิน |
| 3 | **H.3** | จอง V2: createBooking ใน tx (advisory lock · recount · ราคา snapshot · policySnapshot · code gen) · หลายห้อง/groupId · HOLD รอมัดจำ + sweeper · source · ยกเลิกตามขั้นบันได (POS refund) · ต่อ/ย่นคืน · no-show manual · จอรายการ/รายละเอียด/วิซาร์ด | H.1 | 1.5 | — | กันจองซ้อน (load test 20 คำขอ) |
| 4 | **H.2** | tape chart สัปดาห์/2 สัปดาห์/เดือน · ลากย้ายห้อง/ยืดคืน (ยืนยันก่อน) · ปิดห้อง BLOCK+เหตุผล · สัญญาหอบนแกนเดียว · อัตราเข้าพักรายคืน · KPI แถบบน · มือถือ = รายการรายวัน | H.3 | 2 | 08 | กันจองซ้อน |
| 5 | **H.5** | folio (เปิดเมื่อ CONFIRMED · item 9 ชนิด · void=reversal) · `hotel.chargeToRoom` ให้ POS/ร้านอาหาร (ผูก ROOM_CHARGE กับห้องจริง) · เช็กเอาต์ปิดบิล POS ใบเดียว tenders จริง + shiftId · แยกจ่าย (หลาย tender ในใบเดียว) · คืนประกัน · ORACLE-EDIT oracle P1 | H.3 | 2 | 09 ขวา | เงิน |
| 6 | **H.4** | เช็กอิน: assign ห้องว่างจริง · DIRTY ต้อง force+log · บังคับมัดจำ walk-in · ผูกสมาชิกจากเบอร์ (opt-in) · `HotelGuestRecord` · สแกนพาสปอร์ต AI→คนยืนยัน · ร.ร.3 ลงชื่อบนจอ → ร.ร.4 PDF · คิว ตม.30 (24 ชม. · เตือน · ไฟล์ · เลขรับแจ้ง) · เงินประกันห้อง · จอหน้าเคาน์เตอร์ | H.5 | 2 | 09 ซ้าย | กฎหมาย · PDPA |
| 7 | **H.6** | แม่บ้านมือถือ: บอร์ดตามชั้น (SSE) · state machine hk · เช็กลิสต์ต่อประเภทห้อง · มินิบาร์→folio · แจ้งของเสีย→ปิดห้อง/ซ่อม (ใช้ repair ของหอ ด่าน DORM\|HOTEL) · offline retry | H.5 | 1.5 | 13 | เบา |
| 8 | **H.7** | night audit 6 ขั้น (no-show ริบมัดจำ · post ค่าห้อง · DIRTY รายวัน · freeze KPI · แจ้ง · reopen) · cron ต่อ unit ตาม timezone · รายงาน Occ/ADR/RevPAR/รายได้ตามแหล่ง/funnel/forecast 30 วัน · CSV · `getUnitKpi` ขึ้น Overview | H.5 | 1.5 | — | เงิน |
| 9 | **H.8** | จองออนไลน์ V2: search/quote/HOLD 15 นาที + PromptPay/สลิป → CONFIRMED · โหมดยืนยัน 3 แบบ · หลายห้อง · แผนราคา · คูปอง · ห้องเต็มบอกคืน · หน้าสถานะ + เพิ่มเพื่อน OA · lookup code+email · self-cancel แสดงคืนเงิน · TH/EN · rate limit/turnstile | H.3 · H.1 | 1.5 | 16 | สาธารณะ |
| 10 | **H.10** | โครง OTA: ChannelRoomMap/RateMap(+สูตร)/AriJob/ReservationInbox/InventoryBuffer · ARI ขาออก outbox→รวมชุด→pushAri · ขาเข้า idempotent (ตัวต่อ, externalId, version) → reservation+occupancy tx เดียว · คิว "ต้องจัดห้อง" · gross/commission/net · fake adapter + ข้อสอบ | H.3 · H.1 | 2 | 11 | กันจองซ้อน |
| 11 | **H.9** | ปิดเฟส H: ด่านเต็ม (qc:all + ไล่กดทุกบทบาท owner/ผู้จัดการ/หน้าเคาน์เตอร์/แม่บ้าน/ช่าง/แขกสาธารณะ) · smoke ปลายทาง จองเว็บ→HOLD→มัดจำ→เช็กอิน→ตม.30→ลงห้องจาก POS→audit→เช็กเอาต์→GL · PARITY 08/09/13/15/16 · แพ็ก UAT โรงแรม · isolation 2 ร้าน×2 หน่วย | ทั้งหมด | 1 | ทั้งหมด | ผู้คุม |

รวม 11 ใบ · ~18 หน่วย · **ตัวนับ RUN: `📊 HOTEL · NN% (x/11)`** (แยกจาก SVC 52) · H2.1–H2.3 (ตัวต่อ channel manager เจ้าจริง) อยู่นอกตัวนับ รอเจ้าของเลือกเจ้า
ประมาณเวลา (เครื่องว่าง · 3 เลน · คุณภาพเท่า SVC): H.0–H.1 2 วัน · H.3/H.2/H.5 3 วัน · H.4/H.6/H.7 3 วัน · H.8/H.10 2 วัน · H.9 1–2 วัน ⇒ **ราว 11–13 วันทำงาน**

ข้อสอบต่อใบ (เหมือน SVC): ข้อสอบ `qc-svc-h.N.mts` ≥ 60 ข้อ (S/V/G) · probe ผู้ตรวจ · ฉาก QC · walker · ภาพคู่ · ชุดโมดูลที่แตะ (pos-p*, r0.*, d.* ที่ใช้ร่วม) · tsc · fitness · build QC ผ่าน iso

## 4. ความเสี่ยงหลัก
1. **เครื่องร่วม**: RUN เลขา AI ยังรัน (4 vCPU) — build โรงแรมรอ RAM นาน ⇒ เริ่มหลังเลขาจบ · ถ้าต้องขนานให้เลนโรงแรม 1 เลนเบา (ออกแบบ/ข้อสอบ) ไม่ build
2. **การจองเก่า P1** ไม่มี nights/occupancy ครบ (stayLoad นับแบบ legacy) — H.0 ต้อง backfill แล้วเลิกเส้น legacy ให้หมดก่อน H.3
3. **oracle Fable 3 ตัว** ผูกลายบิล CASH — ผู้คุม ORACLE-EDIT เองตอน H.5 พร้อมเหตุผล (ห้ามผู้สร้างแตะ)
4. **PDPA ทะเบียนแขก** (เลขพาสปอร์ต/รูป/ลายเซ็น): ไฟล์ private · masking · ระยะเก็บ · สิทธิ์ — ต้องมีมติเจ้าของก่อน H.4
5. **ภาษี**: สเปกราคา inclusive ไม่แยก VAT/service charge — ถ้าเจ้าของให้แยก ต้องออกแบบบรรทัดภาษีใน folio+POS ก่อน H.5
6. **ช่องทางแจ้งแขก**: สเปกเป็นอีเมลล้วน แบบเป็น LINE — โรงแรมจริงใช้ LINE มากกว่า แต่แขกต่างชาติไม่มี LINE ⇒ ต้องรองรับทั้งคู่ (notifyCustomer มี LINE · อีเมลต้องดูว่ามี provider ไหม)
7. **C.2 ของ SVC ยังรอ LINE OA** — H.8/H.4 ใช้ OA ตัวเดียวกัน ถ้าได้ OA ทดสอบมาจะปิด C.2 และทดสอบโรงแรมได้พร้อมกัน

## 5. คำถามถึงเจ้าของ (ต้องตอบก่อนเริ่มใบที่ระบุ · ค่าปลอดภัยถ้าไม่ตอบ)
| # | เรื่อง | ทางเลือก | ค่าปลอดภัย | ต้องก่อน |
|---|---|---|---|---|
| Q1 | **ภาษี/เซอร์วิสชาร์จ**: ราคาที่กรอกรวมภาษีแล้ว แสดงยอดเดียว (สเปก) หรือแยก VAT 7% / service charge 10% เป็นบรรทัด + ออกใบกำกับภาษีจาก POS | รวม / แยก | รวม (ตามสเปก) · แยกเลื่อนไปใบหลัง | H.1 |
| Q2 | **ค่าเริ่มต้นนโยบาย**: มัดจำ (ไม่มี / คืนแรก / %) · ขั้นบันไดยกเลิก (เช่น ก่อน 7 วันคืน 100% · 3 วัน 50% · หลังนั้น 0) · ถือห้องออนไลน์ 15 หรือ 30 นาที · โหมดยืนยัน (อัตโนมัติ / ต้องมัดจำ / พนักงานอนุมัติ) · no-show (ริบมัดจำ / คิดคืนแรก / ไม่คิด) | — | คืนแรก · 7d100/3d50/0 · 15 นาที · ต้องมัดจำ · ริบมัดจำ | H.1 |
| Q3 | **เงินประกันห้อง** (ตามแบบ ฿1,000): เก็บทุกแขก / เฉพาะ walk-in / ไม่เก็บ · วิธีรับ (เงินสด/QR) · คืนตอนเช็กเอาต์ผ่าน POS | — | ตั้งได้ ค่าเริ่ม "ไม่เก็บ" | H.4 |
| Q4 | **ตม.30**: แค่หน้าจอข้อมูล+เตือน+ช่องเลขรับแจ้ง หรือผลิตไฟล์ตามแบบอัปโหลดของสำนักงาน ตม. ด้วย · ร.ร.3/ร.ร.4 พิมพ์ PDF แบบราชการไหม | — | ทั้งไฟล์อัปโหลด + PDF ร.ร.3/4 (ทำครั้งเดียวคุ้ม) | H.4 |
| Q5 | **AI อ่านพาสปอร์ต**: ยอมส่งรูปบัตรไปผู้ให้บริการ AI ภายนอก (ค่าใช้จ่ายต่อครั้ง ร้านจ่ายเอง) หรือกรอกมือก่อน | ใช้ AI / กรอกมือ | สวิตช์ตั้งได้ · ค่าเริ่มปิด (กรอกมือ) · เปิดเมื่อร้านยืนยัน | H.4 |
| Q6 | **PDPA ทะเบียนแขก**: เก็บเลขบัตร/พาสปอร์ต/รูป/ลายเซ็นนานเท่าไร (กฎหมายโรงแรมให้เก็บ ร.ร.4 อย่างน้อย 1 ปี) · ใครเห็นเลขเต็ม (เจ้าของ+ผู้จัดการ · พนักงานเห็นแบบปิดบางส่วน) | — | 2 ปีแล้วลบอัตโนมัติ · masking สำหรับพนักงาน · ต้องมีที่ปรึกษากฎหมายดู (มติ 27 ต.ค. ข้อ 1) | H.4 |
| Q7 | **มินิบาร์/ซักรีด**: แม่บ้านบันทึกลง folio ตรง (ราคาจากค่าตั้ง · ไม่ตัดสต็อก) หรือผ่าน POS ขายห้อง (ตัดสต็อก) | ตรง / POS | ตรง (POS ตัดสต็อกเป็นใบหลัง) | H.6 |
| Q8 | **"กลุ่ม"**: หลายห้องในใบจองเดียว (ทำใน H) พอไหม หรือต้องมี master folio / บิลบริษัทเดียว (ใบหลัง) | — | หลายห้อง + ปิดบิลรวมใบเดียวได้ · master folio ใบหลัง | H.3 |
| Q9 | **แจ้งแขก**: LINE OA · อีเมล · ทั้งคู่ (แขกต่างชาติไม่มี LINE) | — | ทั้งคู่ · LINE ก่อน อีเมลถ้ามี provider | H.8 |
| Q10 | **OTA เจ้าแรก** สำหรับ H2 (ตัวต่อจริง) · ใช้ iCal ชั่วคราวได้ไหม | ชื่อเจ้า | H.10 ทำโครง + fake · H2 รอชื่อจากลูกค้าโรงแรมรายแรก | H2 |
| Q11 | **โดเมน storefront**: ใช้ `/s/<ร้าน>/<หน่วย>` ของ SHARK ก่อน หรือ custom domain ของโรงแรมตั้งแต่ H.8 | — | path SHARK ก่อน · custom domain ใบหลัง | H.8 |
| Q12 | **โรงแรมจริงสำหรับ UAT**: มีลูกค้าโรงแรม/เกสต์เฮาส์ที่จะทดลองไหม (ไม่มี = UAT บนฟิกซ์เจอร์ 14 ห้อง + ผู้คุมเล่นเอง) | — | ฟิกซ์เจอร์ | H.9 |

เคาะแล้วไม่ต้องถาม: เช็กอิน/เอาต์ 14:00/12:00 · audit 03:00 · ย้ายห้องไม่คิดส่วนต่าง · early departure ไม่คืนอัตโนมัติ · buffer OTA 0 · ร้านจ่ายค่าบริการภายนอกเอง (มติ 27 ต.ค. ข้อ 4) · โรงแรม P1 ไม่เปิดใช้ก่อน V2 (มติ 27 ต.ค. ข้อ 5)

## 6. ขั้นถัดไป
1. เจ้าของตอบ Q1–Q12 (หรือรับค่าปลอดภัย) → ผู้คุมปรับร่างนี้เป็นร่าง 2 + เขียนใบสั่ง H.0/H.1
2. RUN เลขา AI จบ → เปิดเลน H.0 (ผู้คุมขอ exception migration ตามกติกา) · ตั้งตัวนับ `HOTEL x/11` + ตัวเฝ้าทุกงานยาว
3. ได้ LINE OA ทดสอบ → ปิด C.2 (SVC 100%) และใช้ OA เดียวกันทดสอบ H.4/H.8

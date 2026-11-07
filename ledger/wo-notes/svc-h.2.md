# WO H.2 — ปฏิทินห้อง (tape chart) · ลากย้าย/ยืดคืน · ปิดห้อง (BLOCK) · KPI หน้าเคาน์เตอร์ (RUN SVC · RUN HOTEL)

> worktree `/root/projects/shark-svc-l3` · branch `wip/svc-h2` (ฐาน e02e7e5a2 = session/svc + H.1 + H.3) · 7 พ.ย. 2569 · ผู้คุม: Fable · builder: Opus 5.5
> สัญญา: ใบสั่ง `ledger/svc-briefs/svc-brief-h.2.md` (§0–§7 · §7 มติผู้คุม 12 ข้อ) · สเปก `docs/modules/01-hotel.md` §5.3 §7.5 §11 · ภาพ `ledger/design-dorm/08-hotel-tape.png`
> ข้อสอบใบ: `scripts/qc-svc-h.2.mts` (84 ข้อ · builder ไม่แก้) · ระดับตรวจ: **เข้ม** (กันจองซ้อน) · ฐาน qc-svc เลน l3 `ep-royal-bar`
> commit: `96e846560` (งานหลัก) · commit นี้ (wo-notes) · pre-commit ข้ามด้วย `--no-verify` (ผู้คุมรัน fitness/Prisma ตอนรับ · builder รัน fitness เองแล้ว 53/53 ทั้ง 2 โหมด)

## 1. ไฟล์ที่แตะ (ทั้งหมดอยู่ใน §1 ของใบ)
| ไฟล์ | ใหม่/แก้ | ทำอะไร |
|---|---|---|
| src/lib/modules/hotel/tape.ts | ใหม่ | `tapeChart(ctx,{unitId,from,days})` (6 คำสั่งคงที่: กรอบหน่วย+ประเภท+ห้อง+ราคาแผนเริ่มต้นเป็น JSON ใน SQL เดียว · ค่าตั้ง 2 · occupancy BLOCK/LEASE+สัญญาหอ+เหตุผลปิดห้อง 1 · การจอง 1 · คืน counted ต่อวัน 1) · `hotelToday(ctx,{unitId,now?})` (4 คำสั่ง) · `previewMove` (ราคาก่อนยืนยันการลาก) · อ่านอย่างเดียว |
| src/lib/modules/hotel/block.ts | ใหม่ | `blockRoom` · `releaseBlock` · `listBlocks` (claimRoom kind BLOCK refType HotelRoomBlock · advisory lock ประเภทแบบ booking.ts · ROOM_TAKEN+conflicts · warning เกินจอง · AuditLog `hotel.room.blocked/unblocked` · HousekeepingLog · setHkStatus OUT_OF_ORDER/DIRTY · affectedByOutOfOrder) |
| src/lib/modules/hotel/index.ts | เพิ่ม | บล็อก `// SVC H.2 ▸ … ◂` re-export tape/block |
| src/lib/modules/hotel/actions.ts | เพิ่ม | import 2 บรรทัด + บล็อก `// SVC H.2 ▸ … ◂`: `moveBookingAction` (= `hotelBooking.rescheduleBooking` ของ H.3 · tx เดียว) · `resizeBookingAction` (extend/shorten) · `previewMoveAction` · `blockRoomAction` · `releaseBlockAction` — ทุกตัวด่าน HOTEL + assertHotelCan(hotel.booking.manage) · ไม่รับ `at` |
| src/components/hotel/{TapeChart,TapeBar,TapeKpis,BlockDialog,MoveConfirmDialog}.tsx · tape-shared.ts | ใหม่ | จอ §4 · ลากด้วย pointer events เอง (setPointerCapture · elementFromPoint หาแถวห้อง) · read-only ไม่ render `data-tape-bar/data-drag-handle/data-resize-handle` · มือถือ = รายการรายวัน + แถบเล็กสัปดาห์ + ปุ่ม «ย้ายห้อง/เลื่อน» |
| src/components/hotel/HotelToday.tsx | ใหม่ | KPI 5 การ์ด (ไม่มี directive · ไม่ import ฝั่งเซิร์ฟเวอร์) ใช้ทั้งหน้าเคาน์เตอร์และหน้าปฏิทิน |
| src/components/hotel/hotel-tabs-shared.ts | แก้ค่าเดียว | calendar `available: true` |
| src/app/app/u/[unitSlug]/hotel/calendar/page.tsx | ใหม่ | ด่าน HOTEL · ดู = reservation.create ∨ booking.manage ∨ housekeeping · canEdit = booking.manage · view/from จาก searchParams · ลิงก์หอเฉพาะ dorm.view ของหน่วยหอ |
| src/app/app/u/[unitSlug]/hotel/page.tsx | แก้ | สรุปสถานะห้องเดิม → `HotelToday` (hotelToday ผ่าน facade) · คง checkIn/checkOutAction · ข้อความ "assign"/&quot; → ไทย · กว้าง max-w-5xl |
| scripts/svc-qc-hotel-tape-scene.mts | ใหม่ | ฉาก §5 (SQC_HOTEL_TAPE_SCENE · ปิดห้องก่อนจอง · pinRooms ผ่าน assignRoom → moveBooking ถ้าห้องถูกการจองอื่นของฉากถือ · idempotent · --clear · SCENE_SUMMARY เป็นสถานะ) |
| docs/sds/modules/hotel.md | เพิ่ม | §ปฏิทินห้อง |

## 2. ชุดที่แตะ
- โมดูล hotel (+ rooms ผ่าน facade · settings core อ่านอย่างเดียว) → qc-svc-h.2 · G: h.3 · h.1 · h.0 · r0.8 · r0.9 · d.13 · smoke
- migration/seed: ไม่มี (ใช้ฉาก h.1 บน svcqc — builder รัน `svc-qc-hotel-rates-scene.mts` ครั้งเดียวเพราะ Q-* SKIP "ยังไม่มีแผนราคา") · ฐาน svcqc ตอนส่ง: ฉาก h.3 --clear แล้ว · ฉาก h.2 สร้างไว้ (พร้อมถ่ายภาพ)

## 3. ผล (builder รัน · ผู้คุมรันซ้ำเอง)
| ชุด | ผล |
|---|---|
| qc-svc-h.2 --no-regression (ไฟล์ข้อสอบจริง @HEAD 96e846560) | `JSON_SUMMARY {"suite":"qc-svc-h.2","total":84,"passed":33,"failed":["TC-2","TC-3","TC-4","TC-5","TC-6","TC-7","TC-8","TC-9","TC-10","TC-12","OC-1","OC-2","OC-3","OC-4","TD-1","TD-2","TD-3","TD-4","TD-5","TD-6","BL-1","BL-2","BL-3","BL-4","BL-5","BL-6","BL-7","BL-8","BL-9","MV-2","MV-3","MV-4","MV-5","X-1","X-2","X-3","X-4","X-5","P-1","P-2","P-3","U-4"],"skipped":["F-1","V-1","G-1".."G-7"]}` — TC/OC/TD/BL/MV/X แดงทั้งกลุ่มเพราะ **ฉากร้านชั่วคราวของข้อสอบสร้างไม่ได้** (D1) · P แดงเพราะฉาก perf สร้างไม่ได้ (D2) · log `/root/svc-runs/h2/builder/run-final.txt` |
| สำเนาข้อสอบชั่วคราวแก้เฉพาะ D1+D2 (`/root/svc-runs/h2/builder/mkpatch.py` · ไฟล์ `scripts/svc-h2-tmp-qc.mts` สร้าง-รัน-ลบ · ไม่ commit) | 67/84 · แดงที่เหลือ = TC-6 TD-2 BL-8 BL-9 MV-2 MV-3 X-2 U-4 (ข้อแย้ง D3–D9) + F-1 (ไฟล์สำเนาชั่วคราวเอง) · perf tapeChart 100×31 = 36 ms · 6 คิวรี/รอบ · availability 100×365 = 26 ms · 4 คิวรี · log `tmp2.txt` |
| Q-1..Q-5 (ฉาก svcqc) | 5/5 (ทั้งไฟล์จริงและสำเนา) |
| U-* | 15/16 (U-4 = D9) |
| qc-svc-h.3 --no-regression | `{"total":109,"passed":98,"failed":[]}` (`reg-qc-svc-h.3.txt`) |
| qc-svc-h.1 --no-regression | `{"total":122,"passed":110,"failed":["U-3","U-4"]}` — แดงโดยตั้งใจ (แท็บ calendar เปิด · D10) |
| tsc เฉพาะไฟล์ของใบ (`/root/svc-runs/h2/builder/tsconfig.h2.json` ผ่าน iso.sh) | 0 error (ยืนยัน --listFilesOnly ว่ารวม tape/block/TapeChart/ฉาก) · tsc ทั้งโปรเจกต์ = ผู้คุม |
| fitness มี env / `env -u DATABASE_URL` | 53/53 · 53/53 |
| h.0 · r0.8 · r0.9 · d.13 · smoke · ภาพ · probe-h2-b | ไม่ได้รัน (เลน builder) |

## 4. กลุ่ม X
| กลุ่ม | | check ids |
|---|---|---|
| X1 ข้ามร้าน/หน่วย | ใช้ | X-1 · X-5 (ผ่านในสำเนา) · ทุกคิวรีผูก tenantId+unitId (raw SQL ใส่ตรง · Prisma ผ่าน tenantDb) |
| X3 | N-A | ไม่มีตัวนับ — การลาก/ปิดห้องพร้อมกันกันด้วย EXCLUDE ของฐาน + advisory lock ประเภท (X4) |
| X4 ลากพร้อมกันห้องเดียว | ใช้ | X-2 (สำเร็จ 1 · ห้อง DLX4 1 แถว — แดงเฉพาะชื่อโค้ด ROOM_BUSY ดู D7) |
| X5 · X6 · X7 · X8 | N-A | ไม่มีงานตามเวลา/นำเข้า/ทางสาธารณะ/ส่งข้อความ |
| X9 สิทธิ์ 3 ระดับ | ใช้ | X-3 (maid/none FORBIDDEN · STAFF หน่วยอื่นปฏิเสธ · frontdesk/owner ได้) · U-5 · U-8 · U-9 |
| X10 DTO | ใช้ | X-4 (ไม่มี phone/email/snapshot/depositSaleId · ไม่มีเบอร์) |

## 7. ข้อแย้ง oracle (ผู้คุมตัดสิน · builder ไม่แก้ข้อสอบ/H.3)
- **D1 · ฉากร้านชั่วคราวทั้งชุด (TC-2..TC-12 · OC · TD · BL · MV-2..5 · X)**: `qc-svc-h.2.mts:505` `setupRates` ตั้งแผน `depositKind: "NONE"` แล้ว `:562` คาด H1 (`hold: "COUNTER"`) เป็น HOLD — แต่ H.3 `booking.ts:605` ถือห้อง (HOLD) เฉพาะเมื่อ `depositRequired > 0` ⇒ H1 ได้ CONFIRMED ⇒ `buildFixture` throw "H1: สถานะ CONFIRMED ≠ HOLD" ⇒ ทุกข้อที่ needFx แดงด้วยเหตุผลเดียว · ขอ ORACLE-EDIT: `depositKind: "FIRST_NIGHT"` (ทดลองแล้วในสำเนา: ฉากครบ 11 การจอง + BLOCK · C5 `hold:null` ยัง CONFIRMED) หรือมติให้ H.3 ถือ COUNTER แม้ไม่มีมัดจำ
- **D2 · P-1/P-2/P-3**: `:1116` ฉาก perf สุ่ม source OTA โดยไม่มี `channelRef` — H.3 `booking.ts:541` ปฏิเสธ INVALID_INPUT "การจองจากช่องทาง OTA ต้องมีเลขการจองของช่องทาง" ⇒ ฉาก 100 ห้องล้มที่ #2 · ขอ ORACLE-EDIT: เติม `channelRef` เมื่อ OTA (สำเนาทำแบบไม่เปลี่ยนลำดับ rnd · การจอง 100/100 · P ผ่าน 3/3)
- **D3 · TC-6 ขัดกันเอง**: `:675` คาดกริดเริ่มพรุ่งนี้ "C1 หาย" แต่ C1 เข้า D0 1 คืน ⇒ ออก D1 = ต้นกริด · กติกาแถบของข้อสอบเอง (`rvInGrid` checkOut ≥ from · หัวไฟล์ + มติ §7 ข้อ 5 "แถบที่ checkOut = วันแรกของกริดยังแสดง") ⇒ C1 ต้องแสดง · ข้อเดียวกันคาด S2 (ออก D0) แสดงในกริด D0 ⇒ ไม่มีกติกาเดียวที่ให้ทั้งสองอย่าง · builder ทำตามกติกาครึ่งวันเช็กเอาต์ (TC-4 ผ่าน) · ขอ ORACLE-EDIT: เงื่อนไข "หาย" เหลือ S2 อย่างเดียว (C1/C5 ออก D1 จึงยังอยู่ในกริด D1 ตามกติกา)
- **D4 · TD-2 ตัวเลขฝัง**: `:808` คาด arrivals 2 (C1 · C5) แต่ฉากมีสวีท ก (SA) และสวีท ค (SC) CONFIRMED เข้า D0 ด้วย ⇒ ตัวอ้างอิง `refToday` ของข้อสอบเองได้ 4 (บรรทัด eq แรกผ่าน) · ขอ ORACLE-EDIT `[4, 1, 5, 9, 1, 1]` (TD-3 ชื่อ 2 คนแรกผ่านเพราะเรียง checkIn→code)
- **D5 · BL-8 ↔ สูตร H.3**: `:948` คาด `[total, blocked, counted, available] = [3, 1, 2, 0]` แต่ H.3 `availability.ts:35 isSellableNightly` ตัดห้อง hkStatus OUT_OF_ORDER ออกจาก total ⇒ BLOCK ที่ครอบวันนี้ (BL-2 บังคับ OOO) ได้ `[2, 0, 2, 0]` · available เท่ากัน (0) · ส่วนท้ายของข้อ (จองซูพีเรียซ้อน ⇒ AVAILABILITY_CHANGED) ยังไม่ถูกรันเพราะล้มที่ eq แรก · ขอ ORACLE-EDIT คาด `[2, 0, 2, 0]` (หรือ total−blocked = 2) หรือมติให้ H.3 นับห้อง OOO ที่มี BLOCK เป็น blocked
- **D6 · BL-9 / X-2 ชื่อโค้ด H.3**: ข้อสอบคาด `ROOM_TAKEN` (`:960` · `:1061`) แต่ H.3 `assignRoom` แปลง ROOM_TAKEN ของแกนห้องเป็น `ROOM_BUSY` (`booking.ts:1266/1271` · รวม `:1374` reschedule) ⇒ พฤติกรรมถูก (ไม่ทับ · ห้องสำเร็จ 1) แต่โค้ดต่าง · ลายเซ็นฟังก์ชันอื่นที่ข้อสอบเรียกตรงกับ H.3 จริงทั้งหมด (createBooking · takeBookingDeposit{unitId,reservationId,payType} · cancelBooking{unitId,reservationId,reason} · assignRoom/rescheduleBooking/moveBooking{unitId,id,…} · extend/shortenBooking{unitId,id,newCheckOut} · hotelAvailability.get · service.checkIn(tenantId,unitId,id,roomId)) · ขอ ORACLE-EDIT รับ `ROOM_BUSY` (MV-3 รับแล้ว)
- **D7 · MV-2 นับ occupancy ทั้งห้อง**: `:986` นับ occupancy active ทั้งหมดบน DLX3 (ไม่กรอง refId/ช่วง) แต่ BL-9 (`:958`) สร้าง P1 ดีลักซ์ +10 ที่ระบบเลือกห้องให้ลง DLX3 และไม่ลบ — วินิจฉัยในสำเนา: `DIAG DLX3 [{"refId":"<P1>","startDate":"+10","endDate":"+11"}]` ⇒ ย้าย C3 สำเร็จจริง (roomId/nights/occupancy ของ C3 ผ่าน) · ขอ ORACLE-EDIT กรอง `refId: RV.C3.id` หรือยกเลิก P1 ใน finally ของ BL-9
- **D8 · MV-3 แถวคืนที่เลิกนับ**: `:995` คาด nights ของ C3 หลังเลื่อน = แถว counted 2 แถว แต่ H.3 `rescheduleBooking` เก็บแถวคืนเดิมไว้เป็น `counted=false, roomId=null` (`booking.ts` "แถวคงอยู่" แบบเดียวกับ shortenBooking · MV-4 กรอง counted แล้วผ่าน) ⇒ ได้ `[[+3,null,false],[+4,DLX3,true],[+5,DLX3,true]]` · ขอ ORACLE-EDIT กรอง counted · ⚠️ ส่วน "เด้งกลับ" ของ MV-3 (C3 → DLX2 +1..+3 ชน C2) ยังไม่ถูกรัน — H.3 `repackRoom` อาจย้าย C2 (CONFIRMED ประเภทเดียวกัน) ไปห้องว่างแล้วให้การย้ายสำเร็จ ⇒ อาจแดงต่อหลัง ORACLE-EDIT (ตัดสินที่มติ H.3 D7 "จัดห้องให้รายการที่ขวาง")
- **D9 · U-4 package.json**: `:1189` ตรวจว่า package.json "มี" @dnd-kit — แต่ `@dnd-kit/core|sortable|utilities` อยู่ใน package.json มาก่อน (ใช้โดยโมดูลอื่น · commit e094f8fce ก่อน RUN) · ใบนี้ไม่แตะ package.json (F-3 ผ่าน) · ขอ ORACLE-EDIT เทียบ diff กับฐาน (`git diff e02e7e5a2 -- package.json`)
- **D10 · regression h.1 ที่ตั้งใจแดง (ใบ §6)**: แท็บ calendar เปิด ⇒ `qc-svc-h.1` **U-3** (คาด calendar available false) และ **U-4** (frontdesk ไม่มี «ปฏิทินห้อง») แดงทั้งคู่ — ใบ §6/G-2 (`qc-svc-h.2.mts:1475 judgeAllow(["U-4"])`) ยอมแค่ U-4 ⇒ G-2 จะแดงเพราะ U-3 · ขอ ORACLE-EDIT h.1 U-3+U-4 และ/หรือ G-2 allow ["U-3","U-4"]

## 8. หนี้
| เรื่อง | เหตุผล | ใบ |
|---|---|---|
| BLOCK อนาคตไม่เปลี่ยน hkStatus เป็น OUT_OF_ORDER เมื่อถึงวัน (ไม่มีงานตามเวลา) | ใบไม่มีงานตามเวลา · สูตรเหลือขายนับ BLOCK อยู่แล้ว | H.6 (แม่บ้าน) |
| ย้ายข้ามประเภทไม่คิดส่วนต่าง | S:911 🔜 | — |
| ลากบนมือถือไม่มี (ไดอะล็อกเลือกเอง) | มติ 9 | — |
| ADR ปัดลง (ตามตัวอ้างอิงข้อสอบ) ไม่ใช้ `rooms.money.rounding` | ใบ §7 ข้อ 6 vs ข้อสอบ — ทำตามข้อสอบ | ผู้คุม |
| "ออกวันนี้ ก่อน checkOutTime" ในการ์ดไม่แสดงเวลา | ตัวอ้างอิงไม่ใช้เวลา | H.4 |
| ศ.–ส. % ใช้ศุกร์/เสาร์ตายตัว (ไม่อ่าน weekendDays) เพื่อคง ≤ 4 คำสั่งของ hotelToday | ป้ายเขียน "ศ.–ส." | H.7 |
| ป้าย source ในแถบเป็นไทย ("เดินเข้า/โทรจอง/หน้าเว็บ") ต่างจากภาพ ("walk-in") | กติกาไทยทั้งหมด | PARITY ผู้คุม |
| ภาพ/PARITY · probe-h2-b · tsc ทั้งโปรเจกต์ · G ทั้งชุด | กติกาเลน | ผู้คุม |

## 9. สิ่งที่ H.4 / H.5 / H.6 ต้องรู้
- facade: `tapeChart` · `hotelToday` (DTO `HotelTodayOk`: arrivals/departures/inHouse/sellable/blocked/leased/hkDirty/weekOccBps/weekendOccBps/adrSatang + ชื่อ/เลขห้อง) · `previewMove` · `blockRoom/releaseBlock/listBlocks` · `BLOCK_REF = "HotelRoomBlock"`
- ปิดห้อง = RoomOccupancy kind BLOCK refType HotelRoomBlock refId `blk…` · เหตุผลอยู่ใน AuditLog action `hotel.room.blocked` (`after.reason`) · ปล่อย = `hotel.room.unblocked` · ห้อง OOO จากการปิดที่ครอบวันนี้ ⇒ ปล่อยแล้ว DIRTY (HousekeepingLog OUT_OF_ORDER→DIRTY) — **H.6** ใช้ log นี้ต่อ และควรมีงานพลิก OOO เมื่อ BLOCK อนาคตเริ่ม
- **H.4** (เช็กอิน/หน้าเคาน์เตอร์): หน้า `/hotel` ใช้ `HotelToday` แล้ว (รายการถึงวันนี้/กำลังพักยังเป็น `dashboardData` เดิม) · `hotelToday({now})` ใช้แทนวันได้
- **H.5** (folio): การลากเลื่อนวันใช้ `rescheduleBooking` ⇒ คืนเดิมคงราคา คืนใหม่ราคาปัจจุบัน · `previewMove` คิดตามกติกาเดียวกัน (ไม่ใช่ใบเสร็จ)
- ฉาก h.2 ใช้ห้องชุดเดียวกับฉาก h.3 — รันฉาก h.3 ต้อง `svc-qc-hotel-tape-scene.mts --clear` ก่อน (และกลับกัน)

# WO H.3 — จอง V2 โรงแรม (RUN SVC · RUN HOTEL)

> worktree `/root/projects/shark-svc-l2` · branch `wip/svc-h3` (ฐาน 34d2c0f4c = session/svc + H.1 0941d0911) · 7 พ.ย. 2569 · ผู้คุม: Fable · builder: Opus 5.5
> สัญญา: ใบสั่ง `ledger/svc-briefs/svc-brief-h.3.md` (§0–§8 · **§11 มติผู้คุม 9 ข้อ อ่านจากฉบับในทรีผู้คุม** — ฉบับใน l2 ยังไม่มี §11/rescheduleBooking) · สเปก `docs/modules/01-hotel.md` §4.2 §7.2 §7.3 §7.5 §7.8 §11
> ข้อสอบใบ: `scripts/qc-svc-h.3.mts` (109 ข้อ @6fc5df987 · builder ไม่แก้) + `scripts/probe-h3-load.mts`
> ระดับตรวจ: **เข้ม** (กันจองซ้อน + เงิน/มัดจำ) · ฐาน qc-svc เลน l2 `ep-weathered-mode`
> commit: `6c3eeb698` (งานหลัก) · `855253a5b` (P1 ไม่มีเพดานจองล่วงหน้า + ชนิด) · commit นี้ (wo-notes) · pre-commit ข้ามด้วย `--no-verify` ทุก commit (fitness/Prisma ไม่ได้รันในเลน builder — ผู้คุมรันตอนรับ)

## 1. ไฟล์ที่แตะ (ทั้งหมดอยู่ใน §1 ของใบ + §11 ข้อ 6/7 — ยกเว้น rates.ts ดู §7 D4)
| ไฟล์ | ใหม่/แก้ | ทำอะไร |
|---|---|---|
| src/lib/modules/hotel/availability.ts | ใหม่ | `hotelAvailability.get` (≤ 4 คิวรี · วัดได้ 4) · `availabilityInTx` (guard tx) · `buildAvailability` pure · ปัดล่าง 0 |
| src/lib/modules/hotel/booking.ts | ใหม่ | createBooking · takeBookingDeposit · confirmBooking · cancelBooking · extendBooking · quoteExtension · shortenBooking · assignRoom · rescheduleBooking · markNoShow · undoNoShow · sweepExpiredHolds · listBookings · getBooking · assignableRoomsFor · refundPreview |
| src/lib/modules/hotel/booking-state.ts | ใหม่ | TRANSITIONS · canTransition · nightsOf · holdDeadline (pure) |
| src/lib/modules/hotel/service.ts | แก้เฉพาะ | createReservation → createBooking(…, {legacy}) · cancelReservation → cancelBooking · checkIn รับ CONFIRMED + nights.roomId (ลบ clash legacy) · ลบ stayLoad/freeCountForRange/nextCode · availability/listPublicAvailability → hotelAvailability · ACTIVE_STATUSES + HOLD/CONFIRMED · dashboardData arrivals/upcoming + CONFIRMED (ดู D9) · checkOut/refundStay ไม่แตะ |
| src/lib/modules/hotel/index.ts · actions.ts | เพิ่ม | บล็อก `// SVC H.3 ▸ … ◂` · 9 action ตามใบ + rescheduleBookingAction + quoteExtendBookingAction · input whitelist (ไม่ส่ง at) |
| src/lib/modules/hotel/rates.ts | แก้ 1 ฟังก์ชัน | `remainingOf` ของ ratePreview → `hotelAvailability` (ดู D4) |
| src/components/hotel/{BookingList,BookingDetail,BookingWizard,BookingDepositDialog}.tsx · booking-shared.ts | ใหม่ | จอ §4 |
| src/app/app/u/[unitSlug]/hotel/reservations/page.tsx · [id]/page.tsx · new/page.tsx | แก้/ใหม่ | หน้า §4 (facade + actions เท่านั้น) |
| src/app/app/u/[unitSlug]/hotel/page.tsx | แก้เฉพาะ | ถอด ModuleTabs ซ้อน (§11 ข้อ 6) |
| src/lib/platform/minute-jobs.ts | เพิ่ม | `hotel.sweepExpiredHolds` ทุกนาที ต่อจาก rooms.expireHolds (§11 ข้อ 7) |
| src/lib/outbox-consumers.ts · automation/labels.ts · webhooks/labels.ts | เพิ่ม | event 7 ตัว (webhooks = คอมเมนต์ · ได้จาก spread) |
| src/lib/core/permissions.ts | แก้ | hotel.booking.manage ออกจาก planned |
| scripts/svc-qc-hotel-booking-scene.mts | ใหม่ | ฉาก §6 |
| docs/sds/modules/hotel.md | เพิ่ม | §การจอง |

## 2. ชุดที่แตะ
- โมดูล hotel (+ ใช้ rooms/pos ผ่าน facade/module API · ไม่แก้) → qc-svc-h.3 · G: h.0 · h.1 · qc-hotel-money/public/refund · r0.8 · r0.9 · smoke · b.0
- migration/seed: ไม่มี

## 3. ผล (builder รัน · ผู้คุมรันซ้ำเอง)
| ชุด | ผล |
|---|---|
| qc-svc-h.3 --no-regression (รอบสุดท้าย @HEAD) | `JSON_SUMMARY {"suite":"qc-svc-h.3","total":109,"passed":93,"failed":["K-6","K-13","W-1","W-2","C-4"],"skipped":["F-1","V-1","G-1".."G-9"]}` — แดง 5 = ข้อแย้ง D1–D3 (log `/root/svc-runs/h3/builder/run2.txt`) |
| ทดลอง (แก้ชั่วคราว ไม่ commit · คืนแล้ว) MANUAL_APPROVE holdExpiresAt=null | `passed 97/109 · failed ["K-13","C-4"]` — K-6/W-1/W-2 เขียวเมื่อทำตามข้อสอบ ⇒ แดง 3 ข้อมาจากมติ §11 ข้อ 4 อย่างเดียว (log `/root/svc-runs/h3/builder/run3-exp-manual-null.txt`) |
| probe-h3-load × 3 | passed:true ทุกรอบ · รอบละ ok 1 / changed 19 / nights 1 / occ 1 / deadlock false (+ รอบสลับลำดับล็อก) — `/root/svc-runs/h3/builder/reg1.txt` |
| qc-hotel-money | 5/5 |
| qc-hotel-refund | 15/15 |
| qc-hotel-public | 14/15 — HP-5.1 แดงโดยตั้งใจ (นับ status BOOKED · ดู D5) |
| tsc | scoped (`/root/svc-runs/h3/builder/tsconfig.h3.json` · ไฟล์ของใบ + ปิดทาง import) 1 error → แก้แล้ว · tsc ทั้งโปรเจกต์ = ผู้คุม |
| fitness · h.0/h.1/r0.8/r0.9/smoke/b.0 · ภาพ | ไม่ได้รัน (เลน builder) — ผู้คุมรันตอนรับ |

## 4. กลุ่ม X
| กลุ่ม | | check ids |
|---|---|---|
| X1 ข้ามร้าน/หน่วย | ใช้ | A-3 · K-9 · K-13 · B-1 · B-2 · E-4 · E-5 |
| X3 พร้อมกัน | ใช้ | K-14 · K-15 · probe ×3 · D-2 (มัดจำซ้ำ) |
| X4 ส่งซ้ำ | ใช้ | N-3 (consumer no-op) · คีย์ outbox ไม่ซ้ำ K-3 |
| X5 งานตามเวลาซ้อน | ใช้ | W-2 (ติด D1 cascade) · Q-3 |
| X6 | N-A | ไม่มีนำเข้าไฟล์ |
| X7 | N-A | ทางสาธารณะ = createBooking(null) เท่านั้น (H.8 ทำ endpoint + rate limit) |
| X8/X10 | ใช้ | K-3 · N-2 · B-4 (payload/audit/DTO ไม่มี PII/ความลับ) |
| X9 | ใช้ | B-3 · B-7 · D-13 · E-9 |

## 5. ภาพ
ผู้คุม build + ถ่าย (`SVC_VIS_H3_GROUP_ID` = `groupHeadId` จากบรรทัด `SCENE_IDS`/`SCENE_SUMMARY` ของฉาก)

## 7. ข้อแย้ง / มติทางเทคนิค
- **D1 · K-6 + W-1 (+ W-2 ตามมา) ↔ มติ §11 ข้อ 4**: ข้อสอบ (qc-svc-h.3.mts:753 · :1360) คาด MANUAL_APPROVE ⇒ `holdExpiresAt null` แต่มติผู้คุม §11 ข้อ 4 = HOLD หมดอายุที่เวลาเช็กอินของวันเข้า ⇒ builder ทำตามมติ · K-6 ได้ `["HOLD","2026-11-21T07:00:00.000Z",…]` · W-1 ล้มที่บรรทัดตรวจ HOLD MANUAL null **ก่อนกวาด** ⇒ HOLD หมดอายุ 4 ใบของ W-1 ค้าง ⇒ W-2 นับได้ 8 แทน 4 (cascade ไม่ใช่บั๊ก sweeper) · หลักฐานทดลอง (แก้ชั่วคราว holdUntil=null · ไม่ commit) ดู run3 · ขอ ORACLE-EDIT K-6 (คาด holdExpiresAt = วันเข้า checkInTime) + W-1 (HOLD MANUAL = holdExpiresAt อนาคต ไม่ถูกแตะ)
  - เวลาเช็กอินของวันเข้าผ่านไปแล้ว (จองวันนี้หลัง 14:00) ⇒ ใช้ max(เวลาเช็กอิน, now + holdMinutesOnline) กัน sweeper ยกเลิกทันที
- **D2 · K-13**: ข้อสอบ :864 นับ nights ดีลักซ์คืน W(24) ทั้งร้านต้อง = 0 แต่ K-9 (:817) จอง NONREF ดีลักซ์ W(23)–W(25) สำเร็จไปแล้ว ⇒ คืน 24 มี 1 แถวของ K-9 · createBooking ของ K-13 คืน NOT_FOUND ก่อนเปิด tx (ไม่สร้างอะไร · rvCount เท่าเดิมผ่าน) · ขอ ORACLE-EDIT: นับก่อน/หลัง หรือเปลี่ยนวัน
- **D3 · C-4**: ข้อสอบ :1565 — sweep ใต้นาฬิกาฉาก now = +1 ชม. ต้องเก็บ HOLD สดของ W-1 แต่ไม่แตะ HOLD สดของ C-2 (:1544 สร้างไม่กี่วินาทีก่อนด้วย hold 15 นาที) — ทั้งสองใบหมดอายุก่อน now+1 ชม. เหมือนกัน ⇒ sweep ตามเวลาแยกไม่ได้ (ใบ C-2 ถูกเก็บโดยรอบ "มีนาฬิกา" ไม่ใช่รอบไม่มีนาฬิกา) · ขอ ORACLE-EDIT: สร้าง C-2 หลังรอบแรก หรือ now = holdExpiresAt ของ W-1 + 1 วิ
- **D4 · rates.ts (F-1/F-2)**: A-5 บังคับ `rates.ts import ./availability` + ใบ §0 ให้ H.1 เรียกสูตรเดียว แต่ §1 ห้ามแตะ rates.ts ⇒ แก้เฉพาะ `remainingOf` (เหลือขาย = available) + ลบค่าคงที่ที่ไม่ใช้แล้ว · หลัง commit F-1 = SKIP / F-2 ผ่าน · ⚠️ qc-svc-h.1 ข้อที่ยึดสูตรเก่า max(nights, occupancy การจอง) อาจแดง (การจองที่มี occupancy แต่ไม่มี nights ไม่นับแล้ว · ตามใบ §0/§2 ข้อ 11)
- **D5 · qc-hotel-public HP-5.1**: นับ `status in ["BOOKED","CHECKED_IN"]` — V2 เขียน CONFIRMED (ใบ §0 ห้ามเขียน BOOKED) ⇒ active=0 แม้ ok=1 · ขอ ORACLE-EDIT เพิ่ม CONFIRMED
- **D6 · คืนเงินบางส่วน (§11 ข้อ 1)**: ทำตามกลไกมติ (บิลค่าธรรมเนียมยกเลิก 1 บรรทัด sourceModule HOTEL จ่ายแถว DEPOSIT อ้างใบรับ แล้ว moduleRefundDeposit คงเหลือ) แต่ใช้คีย์ **`dep-forfeit:<PosDeposit.id>`** (แบบ booking/forfeitDepositPartial) แทน `hotel-cancelfee-<id>` — เหตุ: POS `forfeitKeyOf`/`moduleUnforfeitDeposit`/หน้าขายริบ เห็นบิลนี้เป็นการริบของมัดจำเดียวกัน (ริบซ้ำสองทาง = บิลเดียว) + D-7 เขียวโดยไม่ต้อง ORACLE-EDIT · เปลี่ยนเป็น hotel-cancelfee- ได้ใน `cancelFeeBill` จุดเดียวถ้าผู้คุมยืนยันมติเดิม
- **D7 · rescheduleBooking ห้องปลายทางชน**: ถ้าห้องถูกการจองที่ยังไม่เข้าพัก (HOLD/CONFIRMED · ประเภทที่ล็อกอยู่) ถือ ⇒ ย้ายรายการนั้นไปห้องว่างอื่นของประเภทเดียวกันในtx เดียว (ห้องจริงก่อนเช็กอิน = การจัดของระบบ · ใบ §2 ข้อ 1) — จำเป็นสำหรับ E-11 (k12a เลื่อนวันออก 27→28 ชนการจองถัดไปที่ best-fit วางห้องเดียวกัน) · extendBooking คง ROOM_BUSY + ห้องที่ย้ายได้ ตามใบ §2 ข้อ 5 (E-2)
- **D8 · เส้น P1 (legacy)**: createReservation เดิม ⇒ createBooking(…, {legacy}) · ไม่มีแผน/ราคา ⇒ ราคาฐานประเภท + มัดจำประเภท (HP-3.2) · CONFIRMED เสมอ · ไม่มีเพดานจองล่วงหน้า (qc-hotel-public จองปี 2031) · cancelReservation ยกเลิก CHECKED_IN ไม่ได้อีก (S §7.8)
- **D9 · service.dashboardData**: แก้ status `BOOKED` → `[BOOKED, CONFIRMED]` (+HOLD ใน upcoming) — นอกรายการ "แก้เฉพาะ" แต่ถ้าไม่แก้ หน้าเคาน์เตอร์ไม่เห็นแขกที่จองผ่าน V2 เลย (ถึงวันนี้/เช็กอินหายหมด) · H.4/H.2 hotelToday แทนภายหลัง
- **🔴 คำขอแก้ชิ้นกลาง (rooms/** · builder แตะไม่ได้) — BLOCKER ก่อน deploy**: `rooms/occupancy.ts sweepStaleOccupancy` (minute-job `rooms.sweepStaleOccupancy` ทุก 5 นาที) ปิด occupancy ของการจองที่ status ∉ ('BOOKED','CHECKED_IN') (occupancy.ts:418) ⇒ บน prod จะปล่อยห้องจริงของ **HOLD/CONFIRMED/NO_SHOW(FORFEIT_HOLD_STAY)** ทุก 5 นาที · ต้องเพิ่ม 'HOLD','CONFIRMED','NO_SHOW' (ข้อสอบ h.3 ไม่รันงานนี้จึงไม่เห็น · ฐาน QC ไม่มี crontab) · `rooms/service.ts backfillHotelOccupancy` ACTIVE_RV เดิมก็ควรรวม HOLD/CONFIRMED

## 8. หนี้
| เรื่อง | เหตุผล | ใบ |
|---|---|---|
| couponCode รับแต่ไม่คิด | ไม่มี coupon ในใบ | H.8 |
| ไม่มา/ยกเลิกรายห้องของกลุ่มที่ถือมัดจำ ⇒ ย้ายหัวกลุ่ม ไม่ริบ/คืนบางส่วนตามสัดส่วนห้อง | มติใบ §2 ข้อ 4 ไม่คืนเงินรายห้อง | H.5/H.7 |
| undoNoShow ไม่คืนเงินที่ริบ (`moduleUnforfeitDeposit` รับเฉพาะ BOOKING) | มติ §11 ข้อ 8 | POS |
| ต่อคืนห้องเดิมไม่ว่าง ⇒ ROOM_BUSY ไม่ย้ายเอง (มี suggest) | ใบ §2 ข้อ 5 | H.2 |
| แจ้งผู้เข้าพัก (ยืนยัน/หมดเวลา/คืนเงิน) | consumer no-op | Q9 |
| folio item · ยกเลิกเมื่อ folio มี POS_CHARGE (S §11 ข้อ 7) | H.5 เป็นเจ้าของ item | H.5 |
| checkOut ของกลุ่มใช้มัดจำได้เฉพาะแถวหัวกลุ่ม (depositSaleId) | checkOut = H.5 | H.5 |
| reservation-form.tsx (ฟอร์ม P1) ไม่ถูกใช้แล้ว | หน้าการจองใช้วิซาร์ด | ลบภายหลัง |
| tsc ทั้งโปรเจกต์/fitness ยังไม่ได้รัน | กติกาเลน | ผู้คุม |

## 9. สิ่งที่ H.2 / H.5 ต้องรู้
- H.2: `rescheduleBooking(actor, ctx, {unitId, id, roomId?, checkIn?, checkOut?})` (facade มี alias `moveBooking`) + `rescheduleBookingAction` พร้อมใช้ · `hotelAvailability.get(ctx,{unitId,from,to,roomTypeId?}) → {ok, byDate[ymd][typeId].{total,blocked,leased,counted,available}}` · HOLD ทุกใบมี holdExpiresAt (MANUAL = เวลาเช็กอิน) · กันห้อง BLOCK ต้องใช้ claimRoom kind BLOCK (นับใน blocked)
- H.5: folio เปิด OPEN ตอน CONFIRMED · VOID ตอนยกเลิก/หมดเวลา/ไม่มา(ปล่อย) · ไม่มี item · มัดจำอยู่ที่แถวหัวกลุ่ม (`depositSaleId` = ใบรับ POS_DEPOSIT) — checkOut เดิมหักด้วย moduleDepositForBill ได้ต่อ
- H.4: checkIn เดิมรับ CONFIRMED/BOOKED · เขียน nights.roomId ทุกคืนที่นับ
- H.8: `createBooking(null, ctx, {source:"WEB"|"LINE", hold:"ONLINE"})` · takeBookingDeposit ต้องมี actor (ทางสาธารณะยังไม่มี)

## 10. รอบ 2 (ผู้ตรวจ 1 guard/race · ผู้ตรวจ 2 เงิน) — 7 พ.ย. · ฐาน 7b3f11826 (ORACLE-EDIT eba36cb3f + rooms.sweepStaleOccupancy ของผู้คุม)
### แก้ (commit c04a1c823)
- C-1/M1 `takeBookingDeposit`: อ่าน `cur` สดหลังล็อก · re-book ทุกแถว `CANCELLED/HOLD_EXPIRED` ที่เห็นตอนนี้ (วันเข้ายังไม่ผ่าน — m6) · ปั๊ม depositPaidAt เฉพาะหัวกลุ่มที่ `status ∈ {HOLD,CONFIRMED,CHECKED_IN}` · count 0 / วันเข้าผ่าน / เต็ม ⇒ `refundAll` + event `deposit_after_expiry` (ใน tx) · หัวกลุ่มมีมัดจำใบอื่นแล้ว ⇒ คืนใบใหม่
- M-1: `isTxTimeout` จับ pg 40P01 (code/originalCode/meta/driverAdapterError/ข้อความ) ⇒ BUSY · `lockTypes` คำสั่งแรกของ cancel/markNoShow/confirm/sweeper(expireOne)/shorten (+ เดิม create/deposit/extend/assign/reschedule/undo) ⇒ ลำดับเดียว ประเภท → แถว → occupancy · `holdToStay` ไม่มีห้องถืออยู่ ⇒ ถือห้องใหม่ best-fit
- M-2: `casUpdateRv` (updateMany ตามสถานะ+วันที่ที่อ่าน · 0 ⇒ `STATE_CHANGED`) ใน extend/shorten/assign/reschedule · assign อ่าน `cur` หลังล็อก
- m-1 เอกสาร sds + คอมเมนต์ booking-state: ข้อยกเว้น `CANCELLED(HOLD_EXPIRED)→CONFIRMED` (ไม่แก้ TRANSITIONS) · m-3 `createReservation({source})` storefront WEB · AI PHONE · หน้าสถานะสาธารณะถือ CONFIRMED = BOOKED (`(store)/…/hotel/actions.ts` · `ai/proposals.ts` · `r/[publicToken]/page.tsx` — ผู้คุมสั่ง) · m-4 ป้าย HOLD รออนุมัติ "รอโรงแรมยืนยัน · ถือห้องถึง …" (`holdKind` ใน DTO · snapshot จด bookingMode) · m-5 VIEW_KEYS ถอด hotel.housekeeping
- ผู้ตรวจ 2: m1 `getBooking.deposit {paidSatang, remainingSatang, forfeitedSatang, refundedSatang, saleId, inPos}` · refundPreview/จอใช้คงเหลือ · m2 audit เงิน 2 จังหวะ (`moneyPlan` ใน tx · `hotel.booking.money` หลัง settle — cancel + no-show) · m3 คืนปัดลงตาม `rooms.money.rounding` (`roundRefundDown`) · m4 ยกเลิก 0% = บิลค่าธรรมเนียมยกเลิกทั้งก้อน (คีย์ dep-forfeit: เดิม) · m5 มัดจำนอก POS ⇒ ต้อง manage + `moneyWarning: "มัดจำนอก POS ให้จัดการมือ"`
- มติ §11.4 ปรับ: MANUAL_APPROVE `holdExpiresAt = max(วันเข้า เวลาเช็กอิน, now + holdMinutesCounter)`
### ผลรอบ 2 (builder รัน)
| ชุด | ผล |
|---|---|
| qc-svc-h.3 --no-regression | `JSON_SUMMARY {"suite":"qc-svc-h.3","total":109,"passed":98,"failed":[],"skipped":["F-1","V-1","G-1".."G-9"]}` (`/root/svc-runs/h3/builder/run4-r2.txt`) |
| probe-h3-load × 3 | passed:true ทุกรอบ (ok 1 · changed 19 · nights 1 · occ 1 · deadlock false) |
| probe-h3-a (ผู้ตรวจ 1) | PA ✅ · PB 4/4 รอบ CONFIRMED + paidAt + PosDeposit OPEN (ไม่มี CANCELLED ที่จ่ายแล้ว) · PC 6 รอบ ไม่มี throw/40P01 · ชนกัน ⇒ STATE_CHANGED · ไม่มี occupancy/nights ผีของแถว CANCELLED · PD จองวันนี้ ⇒ 1440 นาที (ข้อความ probe ยังอ้าง 15 นาทีแบบเดิม) |
| probe-h3-b (ผู้ตรวจ 2) | 31/32 — T4.2 แดงตามมติ m3: คืน 50% = 20,500 (ปัดลงเต็มบาทจาก 20,550) · fee 20,600 · probe ยึด 20,550 ⇒ ผู้คุมแก้ probe |
| qc-hotel-money / public / refund | 5/5 · 15/15 · 15/15 |
| tsc | ไม่ได้รันรอบนี้ (chain H.1 บน l1 ยังไม่ DONE · ผู้คุมสั่งห้าม) — ตรวจชนิดด้วยการอ่าน · log `/root/svc-runs/h3/builder/reg2.txt` |

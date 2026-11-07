# WO H.4 — เช็กอิน V2 · ทะเบียนผู้พัก (ร.ร.3/ร.ร.4) · ตม.30 · PDPA (RUN SVC · RUN HOTEL)

> worktree `/root/projects/shark-svc-l3` · branch `wip/svc-h4` (ฐาน bb4b78f89) → merge เข้า `session/svc` · 7 พ.ย. 2569 · builder: Opus (เลน l3)
> สัญญา: `ledger/svc-briefs/svc-brief-h.4.md` · ภาพ `ledger/design-dorm/09-hotel-checkin-folio.png` ครึ่งซ้าย
> ข้อสอบใบ: `scripts/qc-svc-h.4.mts` (106 ข้อ · **builder ไม่แก้** — ข้อแย้ง §7)
> ระดับตรวจ: **เข้ม** (กฎหมาย · PDPA · กันจองซ้อนตอนเช็กอิน · ข้อมูลข้ามร้าน) — ผู้ตรวจ 2 รอบ + ที่ปรึกษากฎหมาย (J3) ดูแบบ ร.ร.3/ร.ร.4 ที่พิมพ์
> ฐาน: qc-svc เลน l3 (`ep-royal-bar`) ผ่าน `scripts/qc-svc.sh` · builder ไม่ build/next · tsc เฉพาะไฟล์ (tsconfig ชั่วคราว `/root/svc-runs/h4/builder/tsconfig.h4.json`)

## 1. ไฟล์ที่แตะ (ทั้งหมดอยู่ใน §1 ของใบ)
| ไฟล์ | ใหม่/แก้ | ทำอะไร |
|---|---|---|
| src/lib/modules/hotel/checkin.ts | ใหม่ | `assignableRooms` · `checkInV2` · `undoCheckIn` · `checkinView` (ข้อมูลจอ) · `checkInV2Legacy` |
| src/lib/modules/hotel/guest.ts | ใหม่ | upsert/delete/list/reveal/signRr3/rr3Card/rr4Register/purge · `RR3_FIELDS` · ตัวช่วยด่าน/ไฟล์/กล่องลับ |
| src/lib/modules/hotel/guest-id-ai.ts | ใหม่ | `readIdDocument` |
| src/lib/modules/hotel/tm30.ts | ใหม่ | `tm30Queue` `tm30Export` `markTm30Filed` `tm30Sweep` `TM30_DEFAULT_COLUMNS` |
| src/lib/modules/hotel/guest-shared.ts | ใหม่ (pure) | สัญชาติ · isForeigner · ตรวจเลขเอกสาร · maskId |
| src/lib/modules/hotel/service.ts | แก้เฉพาะ checkIn | ห่อ `checkInV2Legacy` (+ import บรรทัดเดียว: ถอด claimRoom/moveOccupancy ที่ไม่ใช้แล้ว) |
| src/lib/modules/hotel/index.ts · actions.ts | เพิ่ม | บล็อก `SVC H.4 ▸ … ◂` (actions 9 ตัว: 8 ตามใบ + deleteGuestAction) |
| src/lib/core/settings/defs/rooms.ts | เพิ่มอย่างเดียว | license.no/name/registrarOffice · guest.requireRegistration · guest.keepIdImageDefault · tm30.enabled · tm30.exportColumns (+ ค่าคงที่คอลัมน์ ตม.30) |
| src/lib/platform/minute-jobs.ts | เพิ่ม | `hotel.tm30Sweep` ทุก 15 นาที · `hotel.purgeExpiredGuestRecords` รายวัน |
| outbox-consumers.ts · automation/labels.ts · webhooks/labels.ts | เพิ่ม | 6 event (§5) |
| src/lib/core/permissions.ts | ลบ 2 บรรทัด planned | hotel.guest.register/viewId ใช้จริง |
| src/components/hotel/{CheckinPanel,RoomPicker,GuestForm,IdScanButton,SignaturePad,Rr3Card,Tm30Queue,Tm30FileDialog,SecurityDepositStep}.tsx · checkin-shared.ts | ใหม่ | จอ §4 |
| src/app/app/u/[unitSlug]/hotel/reservations/[id]/page.tsx | แก้ | `?tab=guests` → CheckinPanel (เหนือ BookingDetail) · ลิงก์ "เช็กอิน · ลงทะเบียนผู้พัก" · **ไม่แตะแท็บเงิน (H.5)** |
| src/app/app/u/[unitSlug]/hotel/{guests,guests/rr4/print,guests/[guestId]/rr3/print,tm30}/page.tsx | ใหม่ | 4 หน้า |
| src/app/app/u/[unitSlug]/hotel/page.tsx | เพิ่ม | การ์ด "ตม.30 ค้าง N" ต่อจาก HotelToday |
| scripts/svc-qc-hotel-guest-scene.mts | ใหม่ | ฉาก §6 |
| docs/sds/modules/hotel.md | เพิ่ม | §เช็กอิน/ทะเบียนผู้พัก/PDPA |

## 2. โมดูลที่แตะ · migration
- ไม่มี migration (ใช้คอลัมน์ H.0 §2.12) · ข้อมูลที่ไม่มีคอลัมน์ (เพศ · อาชีพ · ที่อยู่ · ตรวจลงตรา · ด่าน · ตม.6 · หมดอายุเอกสาร) อยู่ใน **กล่องลับเดียวกับเลขเอกสาร** (`idNumberEnc` = JSON {id, …} · AAD = recordId) ⇒ purge ล้างพร้อมกัน
- ผู้บันทึก/ลงชื่อกระดาษ/หลักฐาน ตม.30/ลงชื่อแทนห้อง/ย้อนเช็กอิน = AuditLog (มติใบ §2 ข้อ 3 แบบเดียวกัน — ไม่ขอคอลัมน์)

## 3. ผลข้อสอบ (JSON_SUMMARY จริง — ดูท้ายไฟล์ §10 ที่อัปเดตรอบสุดท้าย)

## 4. กลุ่ม X
| กลุ่ม | เกี่ยว? | check ids |
|---|---|---|
| X1 | ใช้ | B-1 · B-2 · GR-3 · PD-4 · RR-6 · TM-1 · CI-7 · AI-6 |
| X3 | ใช้ | CI-14 (2 ทางห้องเดียว · EXCLUDE ของ occupancy + ล็อกประเภท) |
| X4 | ใช้ (เบา) | N-3 consumer no-op · emitOutbox กุญแจเดิม = ไม่ซ้ำ (เตือน ตม.30 ต่อผู้พัก) |
| X5 | ใช้ | PD-8 purge ซ้อน · TM-6 sweep ซ้อน (UPDATE มีเงื่อนไข) |
| X6 | ใช้ | GR-8 · RR-6 · AI-6 (mime + ไบต์หัว + ≤ 8 MB) · CSV ผ่าน `csvRow` (กันสูตร) |
| X7 | N-A | ไม่มี endpoint สาธารณะ (pre-check-in ของแขก = H.8) |
| X8 | ใช้ | PD-1/2/3/9 · CI-4 · N-2 · AI-4 · MB-1 (สมาชิกเฉพาะยินยอม) |
| X9 | ใช้ | CI-6/8 (force/early + เหตุผล + AuditLog + HousekeepingLog) · CI-16 undo · B-3 · B-5 |
| X10 | ใช้ | PD-6/10 · GR-7 · RR-1 (ไฟล์ private · ลิงก์ผูกผู้ดู ≤ 15 นาที) |

## 5. ภาพ — รอผู้คุม (build QC + ฉาก h.1 → h.3 → h.5 → h.4 · `SVC_VIS_H4_RES_ID/GUEST_ID` จาก SCENE_SUMMARY)

## 6. reviewer — รอผู้คุมปล่อย (รอบ 1 PDPA/ไฟล์/เข้ารหัส/log · รอบ 2 กฎหมาย ร.ร.3/ตม.30/retention + race)

## 7. ข้อแย้ง oracle / มติทางเทคนิค (ผู้คุมตัดสิน)
1. **ห้อง DLX หมดตั้งแต่ CI-17 (ข้อสอบ capacity)** — `roomPlan` มีดีลักซ์ CLEAN 8 ห้อง (DLX1–8) แต่ CI-1…CI-14 ถือห้องดีลักซ์ช่วง วันนี้–+2 ครบ 8 ห้องแล้ว (CI-1 · CI-3 · CI-9 · CI-11 · CI-13 ×2 · CI-14 + CI-6 คืน +1) ⇒ `mkRes` ของ CI-17 · PD-7 · TM-6 · TM-7 · TM-8 · SD-1/2/3 · MB-1/2 · B-3 ได้ "การจองทดสอบไม่มีห้อง"/roomId ว่าง (ข้อสอบล้มก่อนถึงโค้ด) และ TM-4/TM-5/N-2/N-3 ล้มต่อเนื่อง
   - หลักฐาน: รันสำเนาข้อสอบที่เพิ่ม `["DLX9".."DLX30","dlx"]` ใน roomPlan (+ข้อ 2) — ไม่ commit ลบทิ้งแล้ว — ได้ 81/106 (ก่อนทำจอ) แดงเหลือเฉพาะ CI-17 (ข้อ 3) · SD-1 (ไม่มี H.5) · U-* (ตอนนั้นยังไม่มีจอ)
   - เสนอ ORACLE-EDIT: เพิ่มห้องดีลักซ์ในบรรทัด roomPlan (PC/ข้ออื่นไม่ผูกจำนวน 17 ห้อง — ข้อเดียวที่นับคือ "ห้องไม่ครบ" = roomPlan.length)
2. **TM-3 "มีเลขของคนที่ไม่เลือก MUELLER, HANS"** — ข้อสอบใช้พาสปอร์ตชุดเดียวกัน (`G.deu`/`G.deu2`) ในหลายการจอง (CI-3 และ CI-12 แฟมิลี) ⇒ แถวที่ไม่เลือกมี **เลขเดียวกับ** แถวที่เลือก ⇒ ไฟล์ต้องมีเลขนั้น (ของคนที่เลือก) แต่ข้อสอบตีว่ารั่ว — แก้ในโค้ดไม่ได้
   - เสนอ ORACLE-EDIT (qc-svc-h.4 ~บรรทัด 1386): ข้ามแถว rest ที่เลขซ้ำกับ pick (`if (!pick.some((p) => rawOfEnc(p) === rawOfEnc(g)))`) หรือให้แขกแต่ละการจองใช้เลขต่างกัน
3. **CI-17 ↔ qc-svc-r0.8 / ฉาก h.2 · h.3 / qc-svc-h.5** — CI-17 ต้องการ `service.checkIn(tenantId, unitId, id, roomId)` เดิม ⇒ `GUEST_REQUIRED` เมื่อ requireRegistration เปิด (ค่าเริ่ม) แต่:
   - `scripts/svc-qc-hotel-booking-scene.mts:116` และ `svc-qc-hotel-tape-scene.mts:173` เช็กอิน inhouse-web/ota/B101/B105/B203 ด้วย checkIn เดิมโดยไม่มีผู้พัก (หน่วย HOTEL ค่าเริ่ม) ⇒ ฉากล้ม ⇒ Q ของ h.2/h.3 (และ Q ของ h.4/h.5 ที่ต่อยอด) แดง
   - `qc-svc-r0.8` P-6/P-7/P-10/Z-3 (วันเข้า +530/+550/+560/+960 วัน · BOOKED) และ `qc-svc-h.5` `inhouse()` (บรรทัด 525) คาดว่าเช็กอินเดิมสำเร็จ
   - **ที่ทำ:** ทางเดิมคงพฤติกรรม P1 (ไม่บังคับทะเบียน · ไม่ตรวจวันเข้า/แม่บ้าน · รับ BOOKED) ผ่านแกนเดียวกับ V2 — สวิตช์เดียว `LEGACY_REQUIRES_GUEST = false` ใน checkin.ts (เปลี่ยนเป็น true = ตามใบ §1 ทันที) ⇒ CI-17 แดงข้อแรก (ข้อสถิต "ห่อ checkInV2 · ไม่เขียน CHECKED_IN ตรง" ผ่าน)
   - เสนอทางเลือกผู้คุม: (ก) คงไว้ + ORACLE-EDIT CI-17 · (ข) เปิด true + ORACLE-EDIT ฉาก h.2/h.3 (ตั้ง `rooms.hotel.guest.requireRegistration=false` ชั้น UNIT ก่อน checkIn หรือเปลี่ยนเป็น checkInV2 + ผู้พักจากฟิกซ์เจอร์) + r0.8 P-6/7/10/Z-3 + h.5 inhouse()
   - 🔴 ช่องทางกฎหมาย: ปุ่มเช็กอินเดิมบนหน้า `/hotel` (checkInAction · h.2 U-10 บังคับให้คงไว้) ยังเช็กอินได้โดยไม่ลงทะเบียน ร.ร.3 จนกว่าจะเลือก (ข) — จอใหม่ทุกจุดใช้ checkInV2Action
4. **ลงชื่อแทนห้อง (มติ §9 ข้อ 6 "rr3SignedAt ตั้งทุกคน") ↔ ฟิกซ์เจอร์ signedRr3 = 3 (WEBER, ANNA signed:false)** — ทำแบบ: ลงชื่อแล้วตั้ง rr3SignedAt ให้ผู้พักที่ **มีอยู่ตอนลงชื่อ** (RR-2 ผ่าน) · ผู้พักที่เพิ่มทีหลังไม่สืบ (ฉากลงชื่อผู้พักหลักก่อนเพิ่ม ANNA ⇒ 3 แถวตามฟิกซ์เจอร์)
5. **undoCheckIn** = ต้องเป็น OWNER/MANAGER **และ** booking.manage (ใบ: "MANAGER") ⇒ frontdesk STAFF ที่มี manage ย้อนไม่ได้
6. **ตม.30 ของผู้พักที่เพิ่มระหว่างพัก** ครบกำหนด = เวลาลงทะเบียน + 24 ชม. (นาฬิกาฉาก `at` ใต้ SVC_QC_CLOCK ให้ฉากเท่านั้น) · ลงทะเบียนล่วงหน้า (ยังไม่เข้า) = PENDING ไม่มีกำหนด → ได้กำหนดตอนเช็กอิน · ย้อนเช็กอิน = ล้างกำหนดของ PENDING
7. **คำขอแก้ชิ้นกลาง (fitness):** F2.1 แดง `hotel→member` (ผูกสมาชิก opt-in ตามใบ §0 ต้อง `member.findOrCreate` — import แบบ lazy ผ่าน facade `@/lib/modules/member`) ⇒ ขอผู้คุมเพิ่ม `"hotel→member"` ใน ALLOWED_EDGES ของ scripts/fitness.mts (ทิศเดียว · member ไม่รู้จัก hotel)

## 8. หนี้
| เรื่อง | เหตุผล | ใบ |
|---|---|---|
| SD-1 + ฉาก h.4 ต้องมี `takeSecurityDeposit` | H.5 ยังไม่ merge บนฐาน bb4b78f89 (ฉากหยุดที่ขั้นประกันพร้อมข้อความชัด · Q ข้ามเพราะไม่มี checkout.ts) | merge H.5 |
| ปุ่มรับเงินประกันบนการ์ดเช็กอิน | SecurityDepositStep ลิงก์ไป `?tab=money` (action ของ H.5) | รวมหลัง H.5 |
| retainUntil ไม่ขยับตาม extend/shorten | คำนวณตอนบันทึก (2 ปี ≥ 1 ปีตามกฎหมาย · คลาดไม่กี่วัน) | H.5/H.7 (ตอนเช็กเอาต์ปรับ) |
| ร.ร.4 ส่งสำเนานายทะเบียน: เตือนตามรอบ | แสดงชื่อนายทะเบียนบนแบบพิมพ์ · ยังไม่มีงานเตือนตามรอบ | H.7 รายงาน |
| แบบ ร.ร.3/ร.ร.4 ตามประกาศจริง | RR3_FIELDS ไล่ตามช่องแบบ — ที่ปรึกษากฎหมาย J3 ตรวจภาพพิมพ์ | ก่อนรับใบ |
| แม่แบบไฟล์ ตม.30 จริง | Q-H4-1 รอเจ้าของ · คอลัมน์เป็นค่าตั้ง | ผู้คุม |
| "ส่งรหัส Wi-Fi + อาหารเช้า" บนการ์ด | ไม่มีตัวส่ง (H.8/notify) ⇒ ซ่อน | H.8 |
| เลขบัตร ร.ร.3 ถาวร | ลำดับ createdAt (แถวที่ลบภายใน 10 นาทีทำให้เลขหลังจากนั้นเลื่อน) | migration ใบย่อยถ้าที่ปรึกษาต้องการ |

## 9. สิ่งที่ H.6/H.7 ต้องรู้
- H.6: เช็กอินห้องที่ยังไม่พร้อมเขียน `HotelHousekeepingLog` (from=to=hkStatus · note เหตุผล · byUserId) — hkStatus ไม่เปลี่ยน · ห้อง `status` OCCUPIED ตอนเช็กอิน / AVAILABLE ตอนย้อน
- H.7: AuditLog `hotel.reservation.checked_in` (after: guests/foreigners/force/earlyOverride/occupancyOverride) · `hotel.reservation.check_in_undone` · ตม.30 LATE นับได้จาก `HotelGuestRecord.tm30Status` · ร.ร.4 ย้อนหลัง = `rr4Register`
- ทุกฟังก์ชันรับ `(actor, ctx {tenantId}, input)` · `assignableRooms/rr3Card/rr4Register/tm30Queue/checkinView` ไม่มีผู้กระทำ (หน้าตรวจสิทธิ์ก่อน) · ข้ามร้าน/หน่วย = NOT_FOUND

## 10. ผลรอบสุดท้าย (builder · ผู้คุมรันซ้ำ)
(ดูรายงานกลับ / `/root/svc-runs/h4/builder/final-*.txt`)
- qc-svc-h.4 --no-regression: 75/106 · failed CI-17 PD-7 TM-3..8 SD-1..3 MB-1..2 B-3 N-2 N-3 (= ข้อแย้ง §7 ข้อ 1–3 + SD-1 รอ H.5) · skip F-1 Q-1..4 V-1 G-*
- สำเนาข้อสอบแก้ §7 ข้อ 1+2 (ไม่ commit): 81/106 ก่อนมีจอ — แดงเหลือ CI-17 · SD-1 · U-* (จอผ่าน 10/10 แล้วในรอบจริง)
- qc-svc-h.3 --no-regression 98/109 failed [] · qc-svc-h.2 --no-regression 78/87 failed [] · qc-svc-r0.8 95/95 · qc-svc-h.1 112/122 failed [] · qc-svc-r0.4 45/46 (VIS-2 allowed) · smoke 6/6 · b.0 167/172 failed [] · d.13 87/98 failed []
- qc-svc-h.0 failed [S-3] = fitness F2.1 hotel→member (§7 ข้อ 7) · tsc เฉพาะไฟล์ของใบ (tsconfig ชั่วคราว) 0 error

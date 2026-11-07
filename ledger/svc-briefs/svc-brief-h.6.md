# ใบสั่ง H.6 — แม่บ้านมือถือ (ภาพ 13 ก/ข): บอร์ดงานห้องวันนี้ (เรียงด่วน · SSE/polling) · state machine hk (S §7.6) · เช็กลิสต์ต่อประเภทห้อง · มินิบาร์ → folio · แจ้งของเสีย → ปิดห้อง (BLOCK) / แจ้งช่าง (ใช้แจ้งซ่อมของหอ ด่าน DORM|HOTEL) · offline retry · ตรวจ **เบา** (ผู้ตรวจ 1 รอบ) + PARITY ภาพ 13

> ร่างโดยผู้คุม 7 พ.ย. 2569 — **เปิดเลนได้เมื่อ H.5 merge** (ใช้ `postFolioItem(type MINIBAR)`) · H.2 merge แล้ว (`blockRoom`) · ผู้คุมใส่ฟิกซ์เจอร์ "SVC H.6" (`SQC_HOTEL_HK_SCENE` · `SQC_VISUAL_SPECS["h.6"]` · ผู้ใช้ `maid` มีแล้ว · +ผู้ใช้ `hk-lead` (hotel.housekeeping + housekeeping.inspect)) ก่อน
> แหล่งความจริง: `SVC-HOTEL-PLAN.md` §2 ข้อ 6–7 · §5.1 Q7 (มินิบาร์ลง folio ตรง · ไม่ตัดสต็อก) · สเปก S §3.7 (S:146–153) §5.6 housekeeping (S:755–757) §7.6 (S:925–936) §9 preset Housekeeping (S:1053–1083) §12 (SSE push < 2 วิ · บอร์ดลื่นบนมือถือ) · DH §7 "แม่บ้าน (มือถือ)" (DH:266) · ภาพ `ledger/design-dorm/13-housekeeping-repair.png` **ก + ข** (ค = ช่างหอ ไม่ใช่ใบนี้) + `.body.html` · ใบ H.0 §2.13 (`HotelHousekeepingLog`) §2.3 (`HotelRoom.hkNote/hkUpdatedAt` · `hkStatus` String ค่า `OUT_OF_ORDER` แทน OOO) · ใบ H.2 (`blockRoom` · `hotelToday.hkDirty`) · ใบ H.5 (`postFolioItem` MINIBAR · FOLIO_CLOSED) · แกนห้อง `setHkStatus/roomBoard/affectedByOutOfOrder` (`rooms/service.ts`) · ค่าตั้ง `rooms.hotel.housekeepingChecklist` (#74 · ต่อประเภทห้อง) `rooms.hotel.minibar` (#75) `dailyHousekeeping` `inspectionRequired` · realtime `src/lib/realtime/*` (Ably เมื่อตั้งคีย์ · ไม่ตั้ง = polling · แบบ `subscribeBoard` ของบอร์ดงาน) · แจ้งซ่อมหอ `dorm/repair.ts` (`submitPortalRepair`/`listDormRepairs`/`dormRepairJob` ด่าน `dormStaffGate`)
> ข้อสอบ (ห้ามแก้): «scripts/qc-svc-h.6.mts» · ภาพ `SQC_VISUAL_SPECS["h.6"]` (มือถือ 390 เป็นหลัก)
> builder: **ห้าม build/next · ห้าม commit/push session/svc · ห้าม pnpm install · ห้าม prisma/** · ห้ามเพิ่มไลบรารี** · temp `svc-h6-`

## 0. หลักของใบ
- **แหล่งความจริงสถานะห้อง = `HotelRoom.hkStatus`** (DIRTY/CLEAN/INSPECTED/OUT_OF_ORDER) ผ่าน `setHkStatus` ของแกนห้องเท่านั้น · ทุก transition ลง `HotelHousekeepingLog` (from/to/by/reservationId/note) · OUT_OF_ORDER เข้าได้เฉพาะจาก BLOCK (H.2) · คนกดตรงไม่ได้ (`USE_BLOCK`)
- **state machine** (S §7.6): `DIRTY→CLEAN` (แม่บ้าน) · `CLEAN→INSPECTED` (`hotel.housekeeping.inspect` · เมื่อ `inspectionRequired` เปิด; ปิด = CLEAN ขายได้) · `CLEAN|INSPECTED→DIRTY` (สั่งทำใหม่/ใช้งาน) · `*→OUT_OF_ORDER`/`OUT_OF_ORDER→DIRTY` = ระบบจาก block เท่านั้น · pure `canHkTransition(from,to,{role,inspectionRequired})` ข้อสอบยิงครบทุกคู่
- **งานห้องวันนี้ = มุมมอง** คำนวณสด (ไม่มีตารางงาน): ต่อห้อง = {ห้อง · ประเภท · hkStatus · บริบท: ออกแล้ว/ออกวันนี้ (CHECKED_IN checkOut=วันนี้) · แขกเข้าวันนี้ (CONFIRMED checkIn=วันนี้ · เวลาเช็กอิน) · ค้างต่อ (CHECKED_IN ข้ามคืน · `dailyHousekeeping`) · ว่าง · ปิดซ่อม · คำขอแขก (`hkNote`)} · ลำดับด่วน: ออกแล้ว+มีแขกเข้าวันนี้ → แขกเข้าวันนี้ → ออกแล้ว → ค้างต่อ → ว่าง DIRTY → อื่น · "ของฉัน" = ห้องที่ฉันกด "เริ่มทำ" (เก็บใน `hkNote` JSON? **ไม่** — เก็บเป็น HousekeepingLog toStatus เดิม+note `START:<userId>` **ไม่** ⇒ **มติ: เพิ่มสถานะย่อยในหน่วยความจำไม่ได้ · ใช้ `HotelRoom.hkNote` เก็บ `{assignedTo, startedAt, guestRequest}` JSON string** (คอลัมน์มีแล้ว H.0 · ไม่ขอคอลัมน์ใหม่) · นับ "ทั้งหมด/เสร็จ/ของฉัน" จากมุมมองนี้
- **ทำห้อง (ภาพ ข)**: เริ่มทำ → เช็กลิสต์ตามประเภทห้อง (ค่าตั้ง #74 · ติ๊กเก็บชั่วคราวฝั่ง client · บันทึกครบตอน "เสร็จ" เป็น note ของ log) → **มินิบาร์ที่ใช้** (รายการจากค่าตั้ง #75 · ราคา/ชื่อ · ปรับ −/+ จำนวน) → `postFolioItem(MINIBAR)` ต่อรายการ (idempotency `svc-h6-minibar-<roomId>-<ymd>-<itemKey>`) · แขกออกไปแล้ว (ไม่มี folio OPEN ของห้องนี้) ⇒ บันทึก "มินิบาร์ค้างเก็บ" เป็น event `hotel.hk.minibar_unbilled` + รายการในคิวหน้าเคาน์เตอร์ (เรียกเก็บ/ยกให้ — ไม่มีตาราง: ใช้ HousekeepingLog note JSON + สถานะใน event) → แจ้งของเสีย/ของหาย (รูป → เลือก "ปิดห้องซ่อม" = `blockRoom` H.2 หรือ "แจ้งช่าง" = แจ้งซ่อมของหอเปิดด่าน DORM|HOTEL) → "เสร็จ · ส่งให้ตรวจ" = CLEAN (+ แจ้งหัวหน้าเมื่อ inspectionRequired) · เวลาที่ใช้ = log start→done
- **แจ้งซ่อมจากแม่บ้าน**: ใช้โมดูลซ่อมของหอ (`dorm/repair.ts`) **เปิดด่านเป็น `DORM|HOTEL`** (PLAN §2 ข้อ 7 · แก้ `dormStaffGate` ให้รับ unit.type HOTEL ตามพารามิเตอร์ `allowTypes` — เพิ่มอย่างเดียว · หอยังเดิมทุกไบต์ · r0.x/d.x ต้องเขียว) · การ์ดบอร์ดงานเดิมของหอใช้ได้ · ผู้แจ้ง = พนักงาน (ไม่ใช่ผู้เช่า) ⇒ ใช้เส้น staff ของ repair (ถ้าไม่มี = ขอผู้คุม · ห้ามเขียนระบบซ่อมใหม่)
- **realtime**: บอร์ดรับสัญญาณ `EV_HOTEL_HK` ผ่านช่อง `hotel:hk:<unitId>` (Ably เมื่อตั้งค่า · ไม่ตั้ง = polling 15 วิ แบบบอร์ดงาน) · publish หลัง tx ทุก transition (ล้ม = log ไม่ย้อน) · เป้า < 2 วิ (S §12)
- **offline retry**: action จากมือถือใส่ `idempotencyKey` (client สร้าง) · client เก็บคิวใน localStorage ส่งซ้ำเมื่อกลับออนไลน์ · server idempotent ต่อคีย์ (ตรวจ log ที่มี note.key เดิม)
- **night audit + dailyHousekeeping ⇒ ห้องค้างต่อเป็น DIRTY** เป็นของ H.7 (ใบนี้ให้ `markStayoversDirty(unitId, businessDate)` ให้ H.7 เรียก)
- ไม่ทำ: มอบหมายรายคนโดยหัวหน้า (🔜 · ของฉัน = กดเอง) · เวลาเฉลี่ยต่อห้องเป็นรายงาน (H.7 อ่าน log) · ตัดสต็อกมินิบาร์ผ่าน POS (Q7 ใบหลัง)

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ
| ไฟล์ | | เนื้อหา |
|---|---|---|
| «src/lib/modules/hotel/housekeeping.ts» | ใหม่ (server) | `hkBoard` `hkSetStatus` `hkStart` `hkFinish` `hkInspect` `hkLogs` `postMinibar` `reportDefect` `markStayoversDirty` §3 |
| «src/lib/modules/hotel/hk-state.ts» | ใหม่ (pure) | `HK_TRANSITIONS` · `canHkTransition` · `hkPriority(room)` · `parseHkNote/serializeHkNote` |
| `src/lib/modules/hotel/index.ts` · `actions.ts` | เพิ่ม | facade + actions (`// SVC H.6 ▸ … ◂`) |
| `src/lib/modules/dorm/portal.ts` | **เพิ่มพารามิเตอร์อย่างเดียว** | `dormStaffGate(ctx, unitId, action, opts?: {allowTypes?: ("DORM"\|"HOTEL")[]})` ค่าเริ่ม `["DORM"]` (พฤติกรรมเดิมทุกไบต์) |
| `src/lib/modules/dorm/repair.ts` | **เพิ่มฟังก์ชันเดียว + แก้จุดเรียก gate** (มติ 7 พ.ย. ข้อ 6): `createStaffRepair(actor, ctx, {unitId, roomId, category, text, photos?, allowEntry: true})` (พนักงานแจ้งเอง · leaseId/partyId null · หมวดจาก `rooms.repair.categories` resolve บนหน่วย (fallback) · ไฟล์ private · event `dorm.repair.created` เดิม · ส่งออกผ่าน dorm facade) · `listDormRepairs`/`dormRepairJob`/`completeDormRepair` ส่ง `allowTypes ["DORM","HOTEL"]` · ป้าย/ข้อความหอไม่เปลี่ยน |
| `src/lib/core/settings/defs/rooms.ts` | **เพิ่มอย่างเดียว** | `rooms.hotel.minibar` (#75) schema เป็น union `{productId, priceSatang?} \| {key, name, priceSatang}` (มติ ข้อ 5 · ค่าเดิมยังผ่าน) · คีย์ใหม่ `rooms.hotel.hk.canBlock` (bool เริ่ม true · unitTypes HOTEL) · enumLabelsTh/tableTh ครบ |
| `src/lib/modules/rooms/index.ts` (ชิ้นกลาง) | **ผู้คุมอนุญาต 1 บรรทัด** | re-export `HK_STATUSES` type/const จาก service.ts (มติ ข้อ 11) |
| `src/lib/realtime/events.ts` · `index.ts` | เพิ่ม | `EV_HOTEL_HK` · `hotelHkChannel(unitId)` · ใน SAFE_KEYS เฉพาะ {roomId, hkStatus, at} |
| «src/app/api/realtime/hotel-hk-token/route.ts» | ใหม่ | แบบ `kanban-token` (ตรวจสิทธิ์ housekeeping ของหน่วย) |
| «src/components/hotel/hk/{HkBoard,HkRoomCard,HkRoomSheet,HkChecklist,HkMinibar,HkDefectDialog,HkOfflineQueue}.tsx» + `hk-shared.ts` | ใหม่ (`'use client'`) | จอ §4 มือถือ-first |
| «src/app/app/u/[unitSlug]/hotel/housekeeping/page.tsx» · «…/housekeeping/[roomId]/page.tsx» · «…/housekeeping/logs/page.tsx» | ใหม่ | ด่าน HOTEL · สิทธิ์ `hotel.housekeeping` |
| `src/components/hotel/hotel-tabs-shared.ts` | แก้ค่าเดียว | แท็บ housekeeping `available: true` (⚠️ h.1 U-4 · h.2 ข้อสอบแท็บ ⇒ ORACLE-EDIT ผู้คุมตอนรับ) |
| `src/lib/outbox-consumers.ts` · `automation/labels.ts` · `webhooks/labels.ts` | เพิ่ม | event §5 |
| «scripts/svc-qc-hotel-hk-scene.mts» | ใหม่ | ฉาก §6 |
| `docs/sds/modules/hotel.md` | เพิ่ม §แม่บ้าน | state machine · hkNote JSON · มินิบาร์ · ด่าน DORM\|HOTEL |

ห้ามแตะ: `prisma/**` · `rooms/**` (ใช้ `setHkStatus`) · `folio.ts` (ใช้ `postFolioItem`) · `tape.ts/block.ts` (ใช้ `blockRoom`) · ส่วนอื่นของ dorm · oracle

## 2. มติของใบนี้
1. สิทธิ์: บอร์ด/เปลี่ยนสถานะ = `hotel.housekeeping` · INSPECTED = `hotel.housekeeping.inspect` · มินิบาร์ลง folio = `hotel.housekeeping` (ไม่ต้อง folio.post — แม่บ้านโพสต์ได้เฉพาะชนิด MINIBAR ราคาจากค่าตั้งเท่านั้น) · ปิดห้องซ่อม = `hotel.booking.manage` **หรือ** `hotel.housekeeping` เมื่อ `rooms.hotel.hk.canBlock` (คีย์ใหม่ bool เริ่ม true · อย่างเดียว) · แม่บ้านเข้าหน้าอื่นของโมดูล ⇒ FORBIDDEN + แท็บซ่อน (S §9)
2. `hkSetStatus({roomId, to, note?, idempotencyKey})`: ตรวจ transition · OUT_OF_ORDER ⇒ `USE_BLOCK` · ห้องมีแขก CHECKED_IN กด CLEAN ได้ (ทำระหว่างพัก) · log + publish · idempotent ต่อคีย์ (ซ้ำ = คืนผลเดิม ไม่ log ซ้ำ)
3. `hkStart({roomId})` เก็บ `{assignedTo, startedAt}` ใน hkNote · คนอื่นเริ่มซ้ำ ⇒ `TAKEN` (หัวหน้า override) · `hkFinish({roomId, checklist: {key: boolean}[], minibar: {key, qty}[], note?})` = postMinibar + CLEAN + ล้าง assignedTo + log note JSON {checklist, durationSec}
4. มินิบาร์: ราคา/ชื่อจาก `rooms.hotel.minibar` ณ เวลาโพสต์ (snapshot ใน description) · qty 1–20 · ไม่มี folio OPEN ⇒ `hotel.hk.minibar_unbilled` + ไม่โพสต์ · folio SETTLED ⇒ เดียวกัน · ไม่ตัดสต็อก
5. แจ้งของเสีย: รูป ≤ 3 (private file · ≤ 8 MB · mime jpeg/png/webp) · เลือก: (ก) ปิดห้องซ่อม N วัน → `blockRoom` (ชนการจอง ⇒ แสดง ROOM_TAKEN ให้เลือก "แจ้งช่างแทน") · (ข) แจ้งช่าง → ใบซ่อม (dorm/repair เส้น staff) + ไม่เปลี่ยน hkStatus · ทั้งคู่ log note
6. `markStayoversDirty(ctx,{unitId, businessDate})`: ห้อง CHECKED_IN ที่พักข้ามคืน businessDate และ `dailyHousekeeping` เปิด ⇒ DIRTY (log by=null note "night audit") · idempotent · H.7 เรียก
7. บอร์ด ≤ 5 คิวรี · 100 ห้อง < 500 ms
8. ข้ามร้าน/หน่วย NOT_FOUND · token realtime ผูกหน่วย

## 3. สัญญาโค้ด (ย่อ)
`hkBoard(ctx,{unitId, mine?: userId}) → {counts: {mine, total, done}, rooms: [{roomId, number, floor, typeName, hkStatus, context: "DEPARTED"|"DEPARTING"|"ARRIVING"|"STAYOVER"|"VACANT"|"OOO", arrivalTime?, guestRequest?, assignedTo?, startedAt?, priority}]}` · `hkSetStatus` · `hkStart` · `hkFinish` · `hkInspect({roomId, pass: boolean, note?})` (ไม่ผ่าน ⇒ DIRTY + note) · `hkLogs({unitId|roomId, from, to})` · `postMinibar({roomId, items})` · `reportDefect({roomId, text, photos, action: "BLOCK"|"REPAIR", blockDays?})` · `markStayoversDirty` · actions: `hkSetStatusAction` `hkStartAction` `hkFinishAction` `hkInspectAction` `reportDefectAction`

## 4. จอ (ภาพ 13 ก/ข · มือถือ 390 หลัก · เดสก์ท็อปใช้ได้ · ไทย)
**ก งานห้องวันนี้**: หัว "แม่บ้าน · งานวันนี้ (โรงแรม)" · ชิป ของฉัน N / ทั้งหมด N / เสร็จ N · การ์ดห้องเรียงด่วน: "B203 ออกแล้ว · ทำความสะอาด · ขายได้หลังตรวจ · เป้า 14:00 · ด่วน" / "B102 แขกเข้า 14:00 · ตรวจห้อง · ประเสริฐ · walk-in" / "B101 ค้างต่อ · ทำระหว่างพัก · แขกขอทำหลัง 13:00" / "B105 ค้างต่อ · เปลี่ยนผ้าเช็ดตัว · ป้าย 'ไม่ต้องทำ' เมื่อวาน" / "B202 ตรวจแล้ว ✓ พร้อมรับ Weber" · แถบล่าง: งานห้อง · แจ้งเสีย · ของใช้(🔜 ซ่อน) · ฉัน · **ข ทำห้อง**: "B203 · ดีลักซ์ · ออกแล้ว 10:12 · กำลังทำ 18 นาที" · เช็กลิสต์ (ตั้งได้ต่อประเภทห้อง) · "มินิบาร์ที่ใช้ → ลงบิลห้องแขก" รายการ −/+ · ข้อความ "แขกออกไปแล้ว → ระบบถามหน้าเคาน์เตอร์ว่าเรียกเก็บหรือยกให้" · ปุ่ม "แจ้งของเสีย/ของหาย (รูป → ช่าง)" · ปุ่มใหญ่ "เสร็จ · ส่งให้ตรวจ" · ปุ่มใหญ่กดง่าย · read-only (ไม่มี housekeeping) ⇒ ไม่เห็นหน้า · `data-scroll-hint` ไม่ต้อง (การ์ดแนวตั้ง)

## 5. event
`hotel.hk.changed` {roomId, from, to} · `hotel.hk.minibar_posted` {reservationId, items: n} · `hotel.hk.minibar_unbilled` {roomId, items: n} · `hotel.hk.defect` {roomId, action} · ไม่มี PII

## 6. ฉาก «svc-qc-hotel-hk-scene.mts» (ต่อยอดฉาก h.2 — ภาพ 13 ใช้ห้องชุดเดียวกับภาพ 08)
แหล่งความจริง = `SQC_HOTEL_HK_SCENE` (ผู้คุมใส่): B203 ออกแล้ว DIRTY (เช็กเอาต์ B203-out ด้วย H.5) · B102/B204 แขกเข้าวันนี้ (B102 DIRTY · B204 INSPECTED) · B101 ค้างต่อ guestRequest "แขกขอทำหลัง 13:00" · B105 ค้างต่อ note "ไม่ต้องทำ" · B202 INSPECTED · B103 OUT_OF_ORDER (BLOCK ของ h.2) · ของฉัน (maid) = 5 ห้อง · เสร็จ 1 · กำลังทำ B203 18 นาที (startedAt = now−18m) · มินิบาร์ที่โพสต์แล้ว 1 รายการบน B105

## 7. เกณฑ์รับ · regression · X
- «qc-svc-h.6.mts» ผ่าน · tsc 0 · fitness 2 โหมด · ภาพ h.6 มือถือ (board · room sheet · defect) --user maid · hk-lead · owner · PARITY ภาพ 13 ก/ข
- G: qc-svc-h.2 · h.3 · h.5 · h.0 · r0.8 (hkStatus/OOO ของแกนห้อง) · r0.9 · d.13 · **d.x ซ่อมหอ** (ชุดใบ D ที่ครอบ repair — ตามคอลัมน์ข้อสอบ MASTER-PLAN) · smoke · b.0
- X1 ข้ามร้าน · X3 idempotency key (hkSetStatus/minibar ซ้ำ) · X4 2 แม่บ้านกด CLEAN ห้องเดียวพร้อมกัน = log 1 · X6 รูป mime/ขนาด · X9 maid/hk-lead/frontdesk(ไม่มี housekeeping ⇒ FORBIDDEN) · X10
- ผู้ตรวจ 1 รอบ (เบา): ด่าน DORM|HOTEL ไม่ทำหอเปลี่ยน · state machine · มินิบาร์ราคาจากค่าตั้ง

## 8. ส่งต่อ
H.7: `markStayoversDirty` + รายงานแม่บ้านจาก log · H.9: ไล่กดบทบาทแม่บ้าน (เมนูซ่อน · 403)

## 9. มติผู้คุมต่อคำถามผู้เขียนข้อสอบ (7 พ.ย. · ข้อสอบ 95 ข้อ @8044dec38)
1. `hkBoard(ctx, {unitId, mine?})` และ `hkLogs(ctx, {unitId|roomId, from, to})` ไม่มี actor (อ่านอย่างเดียว · สิทธิ์ตรวจที่ page/action) · ตัวอื่น `(actor, ctx, input)` · input ไม่มี unitId (roomId ชี้หน่วย)
2. hkNote JSON `{assignedTo, startedAt, guestRequest}` · hkFinish ล้าง assignedTo/startedAt **คง guestRequest** · hkNote ข้อความเดิม (ไม่ใช่ JSON) ต้องไม่ทำบอร์ดพัง · เพิ่ม `setGuestRequest(actor, ctx, {roomId, text|null})` (สิทธิ์ `hotel.housekeeping` หรือ `hotel.reservation.create`) — ฉาก h.6 ใช้ตัวนี้ ห้ามเขียนคอลัมน์ตรง
3. B202 = `VACANT` + INSPECTED + ป้าย "พร้อมรับ <แขก>" เมื่อมีจองใน 7 วัน (ฟิกซ์เจอร์แก้แล้ว)
4. counts: total = ห้องมีบริบท (ไม่ VACANT) + ว่าง DIRTY (+ VACANT ที่มีจองใน 7 วัน) · ไม่รวม OOO · done = CLEAN/INSPECTED และไม่มี guestRequest ค้าง · mine = assignedTo = ฉัน (คอมเมนต์ในฟิกซ์เจอร์)
5. def #75 ขยาย union รับ `{key, name, priceSatang}` (§1) · ฟิกซ์เจอร์คง
6. เส้น staff แจ้งซ่อม: `createStaffRepair` ใน dorm/repair.ts (§1) · หมวด fallback จาก registry
7. ช่อง realtime `hotel:hk:<tenantId>:<unitId>` · route `/api/realtime/hotel-hk-token?unitId=` (requireTenant/Unit · HOTEL · housekeeping · no-store) · client `subscribeHotelHk` · polling 15 วิ
8. `hkStart({roomId, override?: true, at?})` (override = `hotel.housekeeping.inspect`) · checklist `[{key, done}]` · `canHkTransition(from, to, {role: "MAID"|"INSPECTOR"|"SYSTEM", inspectionRequired})` export `HK_ROLES`
9. BLOCK จาก reportDefect: `hotel.booking.manage` ได้แม้ไม่มี housekeeping (frontdesk) · REPAIR ต้อง housekeeping — ตามข้อสอบ DF-7
10. `hkStart`/`hkSetStatus` รับ `at` เฉพาะใต้ `SVC_QC_CLOCK=1` (แบบ h.3 ข้อ 13)
11. `HK_STATUSES` re-export ใน rooms/index.ts (ผู้คุมอนุญาต · §1)


## 10. มติผู้คุมหลังผู้ตรวจรอบ 1 (7 พ.ย. · 9bf9eddae · probe `/root/svc-runs/h6/review/probe-h6-b.mts` 21 ข้อ)
1. **M1 pool หมดเมื่อหลายห้องพร้อมกัน** (`withLock` ถือ connection ใน tx + `setHkStatus` เปิด connection ที่ 2 · pool pg 10 ⇒ 12 ห้องพร้อมกัน: tx timeout 30 วิ ย้อน log/outbox แต่ setHkStatus commit สถานะทีหลัง ⇒ ห้องเปลี่ยนไร้ log/event/realtime): **ยกเว้น §1 แคบ ๆ** — `src/lib/modules/rooms/service.ts` `setHkStatus(ctx, input, opts?: { tx?: Tx })` **เพิ่มพารามิเตอร์ตัวเลือกอย่างเดียว** (ไม่ส่ง = พฤติกรรมเดิมทุกไบต์ · ส่ง tx = ใช้ tx นั้นแทน tenantDb ของตัวเอง) · housekeeping ส่ง tx ของ withLock ทุกจุด ⇒ 1 connection ต่อ op · regression r0.8/r0.9/d.13/d.16 ต้องเขียวเท่าเดิม · ข้อสอบใหม่ ST-8 (12 ห้องพร้อมกัน ok ครบ · log 12 · event 12 · < 10 วิ) · ห้ามใช้ semaphore แทน
2. **M2 มินิบาร์ครึ่งชุด**: ตรวจทั้งชุด **ก่อน** โพสต์ (คีย์มีในค่าตั้ง · qty 1–20 · `qty×ราคา` และราคาต่อหน่วย ≤ `rooms.hotel.folio.manualItemMaxSatang` · folio OPEN) ⇒ รายการใดไม่ผ่าน = INVALID_INPUT ทั้งชุด ไม่มี FolioItem เพิ่ม · **ของฟรี (priceSatang 0) ถูกต้องตามค่าตั้ง: ไม่ลง folio** (postFolioItem ปฏิเสธ 0) แต่บันทึกใน log/summary ของ hkFinish (`items[{key,qty,priceSatang:0}]`) และนับใน `posted` ไม่ได้ (posted = ที่ลง folio) · ข้อสอบใหม่ MB-8 · ถ้าทำให้ postFolioItem หลายรายการอยู่ใน tx เดียวได้โดยไม่แตะ folio.ts ให้ทำ ไม่งั้นตรวจก่อนก็พอ (dup-check ต่อวัน/ห้อง/คีย์ยังเป็นด่านกันเงินซ้ำ)
3. minor m1 conflicts ส่งชื่อแขกเป็นชื่อแรกเท่านั้น · m3 ข้อความ "ไม่เกิน 3 รูป" ให้ตรงกับด่าน (ด่าน ≤3 ⇒ ตัดที่รูปที่ 4) · m4 คิวออฟไลน์เข้าคิวเฉพาะ error เครือข่าย (TypeError/`Failed to fetch`/AbortError) — error ฝั่งเซิร์ฟเวอร์แสดงผลทันที ไม่ retry
4. m2 race blockRoom ↔ transition ห้องเดียวกัน (H.2 ไม่ถือล็อก `hotel.hk:room`) = **หนี้ H.9** (syncBlockedRooms ตอน night audit แก้ให้ · ช่องแคบ) จดใน wo-notes · m5 lead กด INSPECTED บนห้องมีแขก **รับได้** (ตรวจหลังทำห้องระหว่างพัก) ไม่แก้
5. probe ผู้ตรวจส่วน A (ด่านหอ) · D (syncBlockedRooms) · E (pool) ผู้คุมจะย้ายเข้าทรีเป็น `scripts/probe-h6-review-b.mts` ตอนรับงาน (แก้ D-0 ให้ BLK2 ใช้ BLOCK เดียว)

# ใบสั่ง R0.8 — แกนห้อง + RoomOccupancy (กันจองซ้อนข้ามหอ/เคาน์เตอร์/ออนไลน์) · ตรวจ **เข้ม** (กันจองซ้อน · ข้ามร้าน)

> แหล่งความจริง: `ledger/SVC-MASTER-PLAN.md` แถว R0.8 · `ledger/SVC-CORE-CONTRACT.md` (CC) §5 · `ledger/DESIGN-DORM-HOTEL.md` §5.1 · **`ledger/wo-notes/svc-r0.8-carry.md` (บังคับทุกข้อที่เกี่ยว)** · กติกา `ledger/SVC-RUN.md` §1
> ข้อสอบ (ห้ามแก้): «scripts/qc-svc-r0.8.mts» — รับใบ = **ผ่านทุกข้อ · SKIP 0**
> รัน: `bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-r0.8.mts` (ห้ามครอบ timeout · ห้าม kill กลางคัน — cleanup อยู่ใน finally)
> builder: **ห้าม build/next · ห้าม commit/push · ห้าม `pnpm install` · ห้าม migration** · รายงานต่อข้อ (id → ผล)

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ (แตะนอกนี้ = ตีกลับ)
| ไฟล์ | ทำอะไร |
|---|---|
| «src/lib/modules/rooms/index.ts» (ใหม่) | facade — re-export ชื่อใน §3 เท่านั้น · หอ/โรงแรมเรียกผ่านทางนี้ |
| «src/lib/modules/rooms/occupancy.ts» (ใหม่) | claim/release/move/resize/expireHolds/exclusiveEnd/วันที่ไทย/event · **ไฟล์เดียวในโมดูลที่ import `prisma` ดิบได้** (expireHolds ข้ามร้าน) |
| «src/lib/modules/rooms/service.ts» (ใหม่) | อาคาร/ชั้น/rentMode/hkStatus CRUD · availability · roomBoard · backfillHotelOccupancy |
| `src/lib/modules/hotel/service.ts` | เขียน/ปล่อย occupancy ใน tx เดียวกับการจอง (§4) · แมป status↔hkStatus |
| `src/lib/platform/minute-jobs.ts` | + งาน `rooms.expireHolds` (บล็อกเพิ่ม · lazy import facade ตอนรัน แบบงาน CRM) |
| `src/lib/outbox-consumers.ts` · `src/lib/automation/labels.ts` · `src/lib/webhooks/labels.ts` | ลง event `rooms.occupancy.changed` 3 ทะเบียน (consumer = no-op ได้ · H.10 ใช้ภายหลัง) |
| `scripts/fitness.mts` | + `"hotel→rooms"` ใน ALLOWED_EDGES · F5 baseline +1 (rooms/occupancy.ts) พร้อมเหตุผลในคอมเมนต์ |
| «scripts/svc-backfill-room-occupancy.mts» (ใหม่) | CLI ห่อ `backfillHotelOccupancy` · **ค่าปริยาย dry-run** · เขียนจริงต้อง `--apply` · ต้องระบุ `--tenant <id>` หรือ `--all` · รันผ่าน qc-svc.sh เท่านั้น |
| สคริปต์ล้าง QC ที่ลบ `hotelRoom`: `scripts/qc-hotel-money.mts` `qc-hotel-public.mts` `qc-hotel-refund.mts` `qc-systems.mts` `qc-ai-phase-b1.mts` | **แก้เฉพาะลำดับลบ**: ลบ `roomOccupancy` (ด้วย tenantId) **ก่อน** `hotelRoom` (FK RESTRICT · carry) — ห้ามแตะส่วนอื่นของไฟล์ |

ห้าม migration (ใบนี้ไม่มีสิทธิ์ · RUN §1.1 ข้อ 5) — ดัชนีที่ carry แนะนำ (`RoomOccupancy(refType,refId)` · `(tenantId,unitId,startDate)` · `HotelRoom.buildingId`) ⇒ บันทึกเป็นหนี้ใน wo-notes ให้ D.0 ใส่

## 2. กติกาแกน (ข้อสอบตรวจทุกข้อ)
- **วันที่**: รับ `"YYYY-MM-DD"` (วันไทย) หรือ `Date` (เวลาจริง ⇒ แปลงเป็นวันไทยด้วย `bkkYmd` จาก `src/lib/core/quiet-hours.ts` · ห้าม `getDay()`/`toISOString` ตรงกับ Date ของผู้ใช้) · เก็บ `@db.Date` = เที่ยงคืน UTC ของวันนั้น (เหมือน `hotel.parseDate`) · `endDate` **ไม่รวมวันจบ** `[start,end)` · `exclusiveEnd("2031-01-31") === "2031-02-01"` (สัญญาถึง 31 ม.ค. เก็บ 1 ก.พ.)
- **ขอบเขต (X1 · carry ข้อ 1)**: อ่านห้องใน tx เดียวกันด้วย `where: { id, tenantId, unitId }` ก่อน insert/update · ห้องร้านอื่น/หน่วยอื่น/ไม่มีจริง ⇒ `ROOM_NOT_FOUND` (หน่วยอื่นใช้ `UNIT_MISMATCH` ได้) ไม่มีแถวถูกเขียน · ห้าม nested `room: { connect }` (ใช้ `roomId` scalar หลังตรวจแล้ว) · occupancy ที่อ้างด้วย id ต้องตรง `tenantId+unitId` ของผู้เรียก ไม่งั้น `NOT_FOUND`
- **ชนกัน**: ให้ EXCLUDE ของฐานเป็นตัวตัดสิน — Postgres `23P01` ⇒ `ROOM_TAKEN` (ไม่ใช่ P2002) · CHECK `23514` ⇒ `INVALID_RANGE` · **ต้องใช้ SAVEPOINT** (หรือเทียบเท่า) ⇒ หลังได้ `ok:false` tx ของผู้เรียกยังใช้ต่อและ commit ได้ (ข้อ C-12) · ห้าม throw ออกไปเมื่อชน
- **conflict ไม่บอกของคนอื่น**: `conflict = { kind, refType }` เท่านั้น — ห้าม refId/occupancyId/ชื่อแขก/ร้าน (ทั้งใน result และข้อความโรงแรม)
- **HOLD/CHANNEL_HOLD** ต้องมี `holdExpiresAt` · claim ทับ HOLD/CHANNEL_HOLD ที่ **หมดเวลาแล้วแต่ยัง active** ⇒ ปิดตัวนั้น (`active=false`) ใน tx เดียวกันก่อน insert แล้วจองได้ (ไม่ต้องรอ minute-job) · availability นับ hold หมดเวลาเป็น "ว่าง"
- **event** `rooms.occupancy.changed` ทุกการเปลี่ยนที่สำเร็จ (claim · release · move · resize · expire · backfill-apply) ผ่าน `emitOutbox(tx, …)` **ใน tx เดียวกัน** · `unitId` ของแถว outbox = หน่วย · payload **ตรง 4 คีย์** `{ unitId, roomId, from, to }` (`from`/`to` = `"YYYY-MM-DD"` · `to` ไม่รวม) · move = 2 event (ห้องเดิม + ห้องใหม่ ช่วงเดิม) · resize = 1 event ช่วง union เดิม∪ใหม่ · ล้ม/ปล่อยซ้ำ = ไม่มี event · `idempotencyKey` ไม่ซ้ำต่อการเปลี่ยน (resize 2 ครั้ง = 2 event)

## 3. สัญญาฟังก์ชัน (facade `@/lib/modules/rooms` · ชื่อ/รูปต้องตรง)
```ts
type Tx = Prisma.TransactionClient; type Ctx = { tenantId: string };
type DateIn = string /* YYYY-MM-DD วันไทย */ | Date;
type Kind = "LEASE" | "STAY" | "HOLD" | "BLOCK" | "CHANNEL_HOLD";
type Fail<C extends string> = { ok: false; code: C; message?: string; conflict?: { kind: string; refType: string } };

claimRoom(tx, { tenantId, unitId, roomId, start: DateIn, end: DateIn, kind: Kind, refType: string, refId: string, holdExpiresAt?: Date | null })
  → { ok: true; occupancyId: string } | Fail<"ROOM_TAKEN" | "ROOM_NOT_FOUND" | "UNIT_MISMATCH" | "ROOM_INACTIVE" | "INVALID_RANGE" | "INVALID_INPUT">
  // INVALID_INPUT: kind นอกชุด · refType/refId ว่าง · HOLD/CHANNEL_HOLD ไม่มี holdExpiresAt · ROOM_INACTIVE: HotelRoom.active=false
releaseOccupancy(tx, { tenantId, unitId, occupancyId, reason: string }) → { ok: true; noop?: boolean } | Fail<"NOT_FOUND">   // ปล่อยซ้ำ = ok + noop · ไม่มี event ซ้ำ
moveOccupancy(tx, { tenantId, unitId, occupancyId, toRoomId }) → { ok: true } | Fail<"NOT_FOUND" | "INACTIVE" | "ROOM_NOT_FOUND" | "UNIT_MISMATCH" | "ROOM_INACTIVE" | "ROOM_TAKEN">
resizeOccupancy(tx, { tenantId, unitId, occupancyId, start?: DateIn, end?: DateIn }) → { ok: true } | Fail<"NOT_FOUND" | "INACTIVE" | "INVALID_RANGE" | "ROOM_TAKEN">
  // ล้มทุกกรณี = แถวเดิมไม่เปลี่ยน (ห้อง/วัน/active)
expireHolds(now: Date) → { expired: number }   // HOLD/CHANNEL_HOLD active ที่ holdExpiresAt <= now ⇒ active=false · ไม่แตะ LEASE/STAY/BLOCK แม้มี holdExpiresAt
  // X5: เรียกซ้อน 2 ตัวพร้อมกัน = แต่ละแถวปิดครั้งเดียว event ครั้งเดียว (updateMany มีเงื่อนไข active=true แล้ว event เฉพาะแถวที่ตัวเองปิด หรือ FOR UPDATE SKIP LOCKED)
exclusiveEnd(lastDayYmd: string) → string

availability(ctx, { unitId, roomTypeId?, start: DateIn, end: DateIn, rentMode: "NIGHTLY" | "MONTHLY" }) → { roomId: string; free: boolean }[]
  // ห้อง active ของหน่วยนี้ (ร้านอื่น ⇒ []) · rentMode จริง = room.rentMode ?? roomType.rentMode · NIGHTLY รับ NIGHTLY|BOTH · MONTHLY รับ MONTHLY|BOTH (ไม่ตรง = ไม่อยู่ในผล)
  // free = ไม่มี occupancy active ซ้อนช่วง (hold หมดเวลานับว่าง) และ hkStatus ≠ OUT_OF_ORDER และ status ≠ OOO
roomBoard(ctx, { unitId, date: DateIn }) → RoomBoardCell[]   // ห้อง active ของหน่วยนี้ ห้องละ 1 ช่อง (ร้านอื่น ⇒ [])
type RoomBoardCell = { roomId; number; roomTypeId; buildingId: string | null; floorNo: number | null; rentMode /* จริง */; hkStatus;
  use: "VACANT" | "LEASED" | "GUEST" | "HOLD" | "BLOCKED";   // จาก occupancy active ที่ start <= date < end · LEASE→LEASED · STAY→GUEST · HOLD/CHANNEL_HOLD→HOLD · BLOCK→BLOCKED
  occupancy: null | { occupancyId; kind; refType; refId; startDate: "YYYY-MM-DD"; endDate: "YYYY-MM-DD" };
  finance: null }                                             // ช่องป้ายการเงิน ผู้เรียก (หอ D.13) เติม

// CRUD — คืน { ok: true; id? } | { ok: false; code; message } เสมอ (ไม่ throw กับข้อมูลผิด)
createBuilding(ctx, { unitId, name, floors, sortOrder? })       // name ไม่ว่าง · floors จำนวนเต็ม ≥ 1 · unitId ต้องเป็นของ tenant (ไม่ใช่ ⇒ ok:false)
updateBuilding(ctx, { unitId, buildingId, name?, floors?, sortOrder? })
deleteBuilding(ctx, { unitId, buildingId })                      // มีห้องผูก ⇒ { ok:false, code:"BUILDING_IN_USE" }
listBuildings(ctx, { unitId }) → { id, name, floors, sortOrder }[]   // เรียง sortOrder · ร้านอื่น ⇒ []
setRoomLayout(ctx, { unitId, roomId, buildingId?: string | null, floorNo?: number | null, rentMode?: "NIGHTLY" | "MONTHLY" | "BOTH" | null })
  // อาคารต้องอยู่หน่วยเดียวกับห้อง · มีอาคาร ⇒ floorNo ∈ 1..floors · rentMode null = ตามประเภท · ค่าอื่น ⇒ ok:false
setHkStatus(ctx, { unitId, roomId, hkStatus: "CLEAN" | "DIRTY" | "INSPECTED" | "OUT_OF_ORDER" })
setRoomTypeRent(ctx, { unitId, roomTypeId, rentMode: "NIGHTLY" | "MONTHLY" | "BOTH", monthlyRateSatang?: number | null })  // สตางค์จำนวนเต็ม ≥ 0

backfillHotelOccupancy({ tenantId: string; dryRun: boolean }) → { scanned: number; toCreate: number; created: number; conflicts: { reservationId: string }[] }
  // เฉพาะ tenant ที่ระบุ · HotelReservation BOOKED/CHECKED_IN ที่ checkOutDate > วันนี้ (ไทย) และยังไม่มี occupancy active (refType "HotelReservation", refId = id)
  // มี roomId ⇒ claim ห้องนั้น · ไม่มี roomId ⇒ เลือกห้องว่างของประเภท (วิธีเดียวกับ createReservation) · **ทำแบบมี roomId ก่อน** แล้วค่อยแบบไม่มี
  // ชน ⇒ ใส่ conflicts (ไม่ throw · รายการอื่นทำต่อ) · dryRun = ไม่เขียนอะไรเลย (occupancy/outbox/reservation) · รันซ้ำ = created 0
```

## 4. โรงแรม P1 (`hotel/service.ts`) — occupancy ใน tx เดียวกับการจอง
- **มติผู้คุม (R0.8)**: การจองโรงแรมถือ "ห้องจริง" ตั้งแต่ตอนจอง ⇒ `createReservation` ใน tx เดิม (หลัง lock ประเภทห้อง): เลือกห้องของประเภทที่ active · ไม่ OOO/OUT_OF_ORDER · rentMode จริง ∈ NIGHTLY|BOTH · ไม่มี occupancy active ซ้อน → `claimRoom(kind "STAY", refType "HotelReservation", refId = reservation.id)` · ไม่มีห้องเหลือ/ชน `23P01` ⇒ `{ ok:false, reason }` **ไม่ throw และไม่มีแถว HotelReservation ค้าง** · (ตั้ง `HotelReservation.roomId` ตอนจองหรือไม่ก็ได้ — ข้อสอบอ่านจาก occupancy)
- ตัวนับ "ประเภทเหลือกี่ห้อง" (`availability` · `listPublicAvailability` · `freeCountForRange`) ต้องหักห้องที่ถูกถือโดย occupancy ที่ไม่ใช่ของโรงแรม (เช่น LEASE ของหอ) และไม่นับห้อง rentMode จริง = MONTHLY · การจองเดิมที่ยังไม่มี occupancy (ก่อน backfill) ต้องยังนับเหมือนเดิม
- `checkIn(roomId)`: ห้องที่เลือก ≠ ห้องใน occupancy ⇒ `moveOccupancy` · ชน ⇒ `{ ok:false, reason:"ห้องนี้ถูกใช้ในช่วงเวลานี้แล้ว" }` (สถานะคง BOOKED · occupancy เดิมไม่ขยับ) · การจองเก่าไม่มี occupancy ⇒ claim ห้องที่เลือก
- `cancelReservation` · `checkOut` ⇒ `releaseOccupancy` ใน tx เดิม · ทาง rollback ของ checkOut (POS ล้ม → กลับ CHECKED_IN) ต้องเปิด occupancy คืน (ไม่มีข้อสอบ — ผู้ตรวจอ่าน)
- `assignableRooms` ตัดห้องที่มี occupancy active ซ้อนช่วง (ยกเว้นของการจองนี้เอง)
- **แหล่งความจริงสถานะกายภาพ = `hkStatus`** (carry ข้อ 5 · มติผู้คุม): `status` เดิมคงไว้ให้หน้าจอ P1 · แมปสองทาง —
  `hotel.setRoomStatus`: CLEANING→hk DIRTY · OOO→OUT_OF_ORDER · AVAILABLE→CLEAN · (OCCUPIED ไม่แตะ hk) · `checkOut` ⇒ status CLEANING + hk DIRTY ·
  `rooms.setHkStatus`: OUT_OF_ORDER→status OOO · DIRTY→CLEANING (ถ้า status ≠ OCCUPIED) · CLEAN/INSPECTED→AVAILABLE (ถ้า status ∈ CLEANING|OOO)
- import โมดูล rooms จาก hotel ผ่าน `"@/lib/modules/rooms"` เท่านั้น (ห้าม subpath) · rooms ห้าม import โมดูลอื่นใด (`@/lib/modules/*`) — ใช้ `@/lib/core/*` ได้

## 5. งานตามเวลา
`registerMinuteJob({ name: "rooms.expireHolds", everyMinutes: 1, cadence: "minute", run: async (now) => (await import("@/lib/modules/rooms")).expireHolds(now) })` ใน `src/lib/platform/minute-jobs.ts` (ห้ามเพิ่ม vercel.json)

## 6. เกณฑ์รับ (ผู้คุมรันเอง)
1. ข้อสอบใบ: ผ่านทุกข้อ · SKIP 0 (ข้อสอบรัน regression `qc-hotel-money` `qc-hotel-public` `qc-hotel-refund` ในตัว — กลุ่ม G)
2. ชุดโมดูลที่แตะ: `qc-booking-race` · `qc-systems` · `qc-ai-phase-b1` (เขียวเท่า baseline) · smoke (ถ้า R0.2 ลงแล้ว)
3. typecheck (ISO_MEM=9000M NODE_OPTIONS=--max-old-space-size=7168) + `scripts/fitness.mts` 2 โหมด — F2 (hotel→rooms) · F5 (+1 มีเหตุผล)
4. ตรวจเข้ม 2 รอบ: (ก) กันจองซ้อน/SAVEPOINT/ลำดับ lock (ประเภทห้อง → ห้อง) ไม่ deadlock · (ข) ข้ามร้าน/ข้ามหน่วย + conflict ไม่รั่ว

## 7. ห้าม
- migration/แก้ schema · แตะ POS/HR/booking · แก้ข้อสอบ `scripts/qc-svc-r0.8.mts` (ผิดจริง = เขียนแย้งในรายงาน · RUN §1.3 ข้อ 11)
- `any` · ข้อความ error ภาษาอังกฤษถึงผู้ใช้ · payload event ที่มีชื่อ/เบอร์/อีเมล · `getDay()` ดิบ
- รัน backfill `--apply` บนฐานใดนอกข้อสอบ (prod = ผู้คุมสั่งหลัง deploy เท่านั้น · ก่อน deploy ดู carry ข้อ "ก่อน deploy prod")

## 8. มติหลังผู้ตรวจ 27 ต.ค. (ORACLE-EDIT R0.8-Z · ข้อสอบกลุ่ม Z — builder แก้คู่กัน)
1. **[BLOCKER] การจองทุกแถวเป็นภาระของประเภทเสมอ** (Z-1a/b/c/d/e): nightLoad ต่อคืน (แบบ P1) = การจอง BOOKED/CHECKED_IN ที่ซ้อนทุกแถว (มี/ไม่มี occupancy · ห้องจะ OOO/MONTHLY ก็นับ) + ห้องของประเภทที่ถูกถือโดย occupancy ที่ไม่ใช่ HotelReservation (LEASE/BLOCK/HOLD ที่ยังไม่หมดเวลา) คืนนั้น · ตัวนับประเภท = ห้องที่ขายรายคืนได้ (active · ไม่ OOO/OUT_OF_ORDER · rentMode จริง NIGHTLY|BOTH) − nightLoad — การจองที่ห้องของมันถูกปิดซ่อม/เปลี่ยนเป็นรายเดือนภายหลัง **ยังนับ** ⇒ ประเภท 2 ห้อง จอง 1 แล้วปิดห้องนั้น ⇒ ว่าง 0 · จองเพิ่ม ⇒ ล้ม
2. **แจ้งผลกระทบ ไม่บล็อก** (Z-2/Z-2b): `hotel.setRoomStatus(OOO)` · `setHkStatus(OUT_OF_ORDER)` · `setRoomLayout(rentMode)` คืน `{ ok:true, id, affected: { occupancyId, kind, refType, refId, startDate, endDate }[] }` = occupancy active ที่ endDate > วันนี้ (ไทย) และขัดกับค่าใหม่ — OUT_OF_ORDER: ทุกชนิดยกเว้น BLOCK · MONTHLY: STAY · NIGHTLY: LEASE · occupancy คงเดิม (ผู้เรียกตัดสินใจย้ายเอง)
3. **checkOut ปล่อยห้องหลัง POS สำเร็จเท่านั้น** (Z-3): releaseStay ใน tx เล็กแยก หลัง `pos.createSale` ผ่าน (และหลังทางไม่ผูก POS) ⇒ rollback ไม่ต้อง re-claim · POS ล้ม ⇒ แถว occupancy ไม่ถูกแตะเลย (updatedAt เดิม · ไม่มี event) สถานะกลับ CHECKED_IN — ไม่มีช่วงที่คนอื่น claim ห้องได้ (แทนข้อ "rollback เปิดคืน" ใน §4)
4. **ตัวนับแบบช่วง = จำนวนห้องที่ว่างตลอดช่วง** (Z-4): `listPublicAvailability` · `freeCountForRange` = min(ว่างต่อคืนเดิม, ห้องที่ไม่มี occupancy ซ้อนตลอดช่วง − การจองเก่าที่ยังไม่มีห้อง) — หน้าแสดงกับผลจองต้องตรงกัน · ห้องว่างรายคืนพอแต่ไม่มีห้องเดียวว่างตลอด ⇒ `reason` = **"ไม่มีห้องเดียวที่ว่างตลอดช่วง ลองเลื่อนวัน"** (ตรงตัว)
5. **เลือกห้อง best-fit** (Z-5): ห้องที่ช่องว่าง (จาก occupancy ก่อนหน้าถึงตัวถัดไป) แคบที่สุดที่ยังครอบช่วงถูกเลือกก่อน · เสมอกันใช้เลขห้อง
6. **backfill dry-run ไม่ถือล็อก** (Z-6): dryRun ห้าม `FOR UPDATE`/advisory lock บน HotelRoomType — อ่านอย่างเดียว · createReservation พร้อมกันไม่รอ · apply ใช้ tx สั้นต่อการจอง 1 รายการ
7. **expireHolds ชุดใหญ่** (Z-7): 300 แถวหมดเวลาพร้อมกัน ⇒ ปิดครบในการเรียกครั้งเดียว · event ครบ · ไม่ throw · แบ่งชุดละ 50 + timeout tx ชัด + emit หลายแถวต่อชุด
8. **claimRoom `requireRentMode?: "MONTHLY" | "NIGHTLY"`** (Z-8): rentMode จริงไม่รับ ⇒ `RENT_MODE_MISMATCH` (BOTH รับทั้งคู่) · ห้อง hkStatus OUT_OF_ORDER ⇒ LEASE/STAY/HOLD/CHANNEL_HOLD ได้ `ROOM_INACTIVE` · **BLOCK ได้** (ใช้ปิดซ่อม) · SAVEPOINT: `ROLLBACK TO` แล้วต้อง `RELEASE SAVEPOINT` เสมอ (Z-8b ชน 70 ครั้งใน tx เดียวแล้วยัง commit ได้ · Z-8c ตรวจซอร์ส)
9. **แข่งหนัก** (Z-9): createReservation 30 ทางพร้อมกันบนประเภท 3 ห้อง ⇒ ไม่มี throw — tx โรงแรมตั้ง maxWait/timeout ชัด · P2028 (รอ tx/ล็อกนาน) แปลงเป็น `{ ok:false, reason: "ระบบไม่ว่าง ลองใหม่" }` · สำเร็จ ≤ 3 · การจอง/occupancy active = จำนวนสำเร็จ

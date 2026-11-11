# ใบสั่ง R0.9 — ผังห้องร่วม `RoomBoard` + occupancyRange + เก็บกวาด occupancy ค้าง · ตรวจ **เบา** (แต่ "ห้ามตัด": ข้ามร้าน · UI ตรงแบบ · ข้อห้าม สคบ.)

> แหล่งความจริง: `ledger/SVC-MASTER-PLAN.md` แถว R0.9 · CC §5 · `ledger/DESIGN-DORM-HOTEL.md` §5.1 + A1 · ภาพ `ledger/design-dorm/01-floorplan.png` (ส่วนผัง · KPI/ต้องทำวันนี้/รอบบิล = D.13) · `ledger/wo-notes/svc-r0.8-carry.md` (ข้อที่ระบุ R0.9) · ใบ R0.8 `svc-brief-r0.8.md` §2–§3 (กติกาวันที่/ขอบเขต/event ใช้ต่อทั้งหมด) · กติกา `ledger/SVC-RUN.md` §1
> ข้อสอบ (ห้ามแก้): «scripts/qc-svc-r0.9.mts» — รับใบ = **ผ่านทุกข้อ** · SKIP ที่ยอมได้ระหว่างทำ = V-1 (ไม่มี QC_BASE) เท่านั้น — ผู้คุมรันซ้ำพร้อม QC server ก่อนรับ
> รัน: `bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-r0.9.mts` (ห้ามครอบ timeout · ห้าม kill กลางคัน)
> builder: **ห้าม build/next · ห้าม commit/push · ห้าม `pnpm install` · ห้าม migration · ห้ามแตะ seed/สคริปต์ล้างของใบอื่น** · รายงานต่อข้อ (id → ผล)

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ (แตะนอกนี้ = ตีกลับ)
| ไฟล์ | ทำอะไร |
|---|---|
| «src/components/rooms/RoomBoard.tsx» (ใหม่) | คอมโพเนนต์ผังห้อง §4 · `'use client'` |
| `src/lib/modules/rooms/service.ts` | `occupancyRange` · `roomBoard` เพิ่มช่อง `next` · `setRoomTypeRent` คืน `affected` · `AffectedOccupancy` + `roomId` |
| `src/lib/modules/rooms/occupancy.ts` | `sweepStaleOccupancy(now)` (ข้ามร้าน ⇒ อยู่ไฟล์นี้ที่ import prisma ได้อยู่แล้ว · F5 baseline ไม่เพิ่ม) |
| `src/lib/modules/rooms/index.ts` | + export `occupancyRange` `sweepStaleOccupancy` + type `RoomBoardCell` (ปรับ) |
| `src/lib/platform/minute-jobs.ts` | + บล็อกงาน `rooms.sweepStaleOccupancy` (lazy import facade แบบ `rooms.expireHolds`) |
| «src/app/app/u/[unitSlug]/dorm/page.tsx» (ใหม่ · ขั้นต่ำ) | หน้าผังห้องหอ: `requireUnit` · `unit.type !== "DORM"` ⇒ `notFound()` · `roomBoard(ctx,{unitId,date: bkkYmd(new Date())})` + `listBuildings` ผ่าน facade `@/lib/modules/rooms` → `<RoomBoard cells date buildings />` (ไม่ส่ง finance/ชื่อ — D.13 เติม · D.13 ขยายไฟล์นี้ต่อ: KPI/ต้องทำวันนี้/รอบบิล) · server component · ไม่แตะ prisma |
| «scripts/svc-qc-roomboard-scene.mts» (ใหม่) | ฉากภาพ §6 |

## 2. occupancyRange (มติผู้คุม R0.8 — ปฏิทิน 08 / หอ)
```ts
occupancyRange(ctx: { tenantId }, { unitId, start: DateIn, end: DateIn, roomId?: string })
  → { occupancyId; roomId; kind; refType; refId; startDate: "YYYY-MM-DD"; endDate: "YYYY-MM-DD" }[]
```
- active เท่านั้น · ซ้อนช่วงแบบ `[)` (`startDate < end && endDate > start`) · HOLD/CHANNEL_HOLD ที่ `holdExpiresAt <= now` ไม่นับ (กติกาเดียวกับ `liveOcc`)
- ขอบเขต: `tenantDb({tenantId, unitId})` — หน่วยของร้านอื่น/roomId ของหน่วยอื่น ⇒ `[]` (X1)
- วันที่แปลงด้วย `toYmd` (Date ⇒ วันไทย) · ผิดรูป/ไม่ส่ง/`end <= start`/**ช่วงเกิน 400 วัน** ⇒ `[]` ไม่ throw
- เรียง `startDate` จากน้อยไปมาก (แล้วเลขห้อง)

## 3. roomBoard / setRoomTypeRent / sweepStaleOccupancy / hkStatus
- **`RoomBoardCell.next`** (เพิ่ม · R0.x แก้ชิ้นกลางได้): `null | { kind; startDate }` = occupancy active ตัวแรก (เรียง startDate) ของห้องนั้นที่ `startDate > date` และไม่ใช่ hold หมดเวลา — ไม่มีขอบเวลา (คอมโพเนนต์ตัดสินว่า "จอง" หรือ "ว่าง") · `finance` ยัง `null` เสมอ
- **`setRoomTypeRent`** (carry · ผู้ตรวจยืนยันซ้ำ): ok ⇒ คืน `affected: AffectedOccupancy[]` **ทุกครั้ง** (ไม่มีก็ `[]`) = occupancy ที่ยังไม่จบ (`endDate > วันนี้ไทย`) ซึ่งขัดกับโหมดใหม่ (`clashOfRentMode`: MONTHLY ⇒ STAY · NIGHTLY ⇒ LEASE · BOTH ⇒ ไม่มี) **ของห้องที่ตามประเภท** (`HotelRoom.rentMode` null) · ห้อง override ไม่นับ · ไม่บล็อก (เปลี่ยนประเภทจริง) · `AffectedOccupancy` เพิ่ม `roomId` (ทุกที่ที่คืน affected)
- **`sweepStaleOccupancy(now: Date) → { released: number }`** (carry ผู้คุม 27 ต.ค.): ปิด (`active=false`) occupancy active ที่ `refType = 'HotelReservation'` และการจอง **ไม่ใช่** BOOKED/CHECKED_IN — รวม CHECKED_OUT · CANCELLED · REFUNDED · ไม่พบการจอง · การจองเป็นของ tenant อื่น (join ด้วย `id = refId AND tenantId = o.tenantId`)
  - ไม่แตะ: BOOKED/CHECKED_IN (รวม BOOKED ที่เลยวันแล้ว — ไม่ใช่งานนี้) · refType อื่นทุกชนิด (LEASE/BLOCK/HOLD) · แถว inactive (`updatedAt` ต้องไม่ขยับ)
  - แบบเดียวกับ `expireHolds`: SQL เดียวต่อชุด `UPDATE … WHERE id IN (SELECT … LIMIT 50 FOR UPDATE SKIP LOCKED) AND active RETURNING …` วนจนชุดไม่เต็ม (เพดานชุด) · event `rooms.occupancy.changed` ต่อแถวที่ **ตัวเอง** ปิด ใน tx เดียวกัน (payload 4 คีย์ ช่วงเดิม · `emitClosed`) · X5: เรียกซ้อน 2 ตัว = แต่ละแถวปิด/event ครั้งเดียว · รันซ้ำ = 0
  - minute-job `rooms.sweepStaleOccupancy` · `everyMinutes` 1–15 (แนะนำ 5) · cadence minute · ไม่ vpsOnly · `run: async (now) => (await import("@/lib/modules/rooms")).sweepStaleOccupancy(now)`
- **hkStatus = แหล่งความจริง** (carry ข้อ 5): ผัง/roomBoard อ่านสถานะกายภาพจาก `hkStatus` เท่านั้น — `HotelRoom.status` เดิม (OOO/CLEANING) ห้ามใช้ตัดสินในผัง (ข้อ W-3/U-16: status OOO แต่ hk CLEAN ⇒ ไม่ใช่ "ปิดซ่อม")

## 4. RoomBoard (`src/components/rooms/RoomBoard.tsx`)
- `'use client'` บรรทัดแรก · import จาก `@/lib/modules/rooms` ได้เฉพาะ **`import type`** · ห้าม prisma/`@/lib/core/db`/โมดูล server ใด ๆ (รวม dorm/account/payments/pos) · **ไม่ใช้ hook ของ Next (useRouter/useSearchParams/Link)** — ต้อง `renderToStaticMarkup` ได้นอก router · ลิงก์ใช้ `<a>` · ตัวกรอง/มุมมองเป็น state ภายใน
- **ผังไม่รู้เรื่องเงิน**: ไม่มีสตางค์/`฿`/`toFixed(2)`/คำนวณยอด — แสดง `finance[roomId].text` ตามที่ผู้เรียกส่งเท่านั้น
- **ข้อห้ามกฎหมาย**: ไม่มีปุ่ม/ข้อความ ล็อกห้อง · ตัดน้ำ/ไฟ · ระงับน้ำไฟ · ยึดทรัพย์ · ขนของออก (ทั้งซอร์สและ markup)
- props (export `default` หรือ `RoomBoard`):
```ts
type RoomBoardFinance = { tone: "overdue" | "pending" | "unpaid" | "paid"; text: string };
{ cells: RoomBoardCell[]; date: string /* YYYY-MM-DD วันของผัง */;
  buildings?: { id: string; name: string }[];            // ลำดับกลุ่มอาคาร
  occupantLabels?: Record<string, string>;               // roomId → ชื่อผู้เช่า/แขก (ผู้เรียกเติม)
  finance?: Record<string, RoomBoardFinance>;            // roomId → ป้ายการเงิน (ผู้เรียกเติม)
  hrefTemplate?: string;                                 // "…/{roomId}" ⇒ ช่องเป็น <a href>
  initialView?: "floor" | "list";                        // ค่าปริยาย floor
  initialFilter?: { status?: RoomStatus | "ALL"; q?: string; finance?: RoomBoardFinance["tone"] };
  bookedWithinDays?: number;                             // ค่าปริยาย 31
  occupiedLabel?: string }                               // ค่าปริยาย "มีผู้เช่า"
```
- **สถานะที่แสดง** (`RoomStatus`) — ป้ายข้อความ + `data-shape` (ตายตัว · ข้อสอบตรวจตรงตัว):

| สถานะ | เมื่อ | ป้าย | data-shape |
|---|---|---|---|
| LEASED | use LEASED | มีผู้เช่า | solid |
| GUEST | use GUEST | มีแขก | filled |
| HOLD | use HOLD | ถือไว้ | double |
| REPAIR | use BLOCKED · หรือ VACANT + hk OUT_OF_ORDER | ปิดซ่อม | hatched |
| BOOKED | VACANT + `next` (LEASE/STAY/HOLD) เริ่มภายใน `bookedWithinDays` วัน | จอง (+ "เข้า <วันไทยสั้น>") | tinted |
| VACANT | อื่น ๆ | ว่าง | dashed |
  - hk ≠ CLEAN และสถานะไม่ใช่ REPAIR ⇒ แสดงข้อความ hk ในช่องด้วย: DIRTY "รอทำ" · INSPECTED "ตรวจแล้ว" · OUT_OF_ORDER "ปิดซ่อม" (เช่น มีผู้เช่าแต่ปิดซ่อม)
  - วันที่ "เข้า 15 พ.ย." แปลงจากสตริง YYYY-MM-DD เอง (ห้าม `getDay/getDate/getMonth` ดิบ)
- **DOM สัญญา** (ข้อสอบอ่าน attr):
  - ช่องห้อง 1 กล่อง/ห้อง: `data-room-id` `data-room-number` `data-status` `data-shape` `data-hk` · มี finance ⇒ `data-finance="<tone>"` + ข้อความ · tone overdue ⇒ `data-alert="true"` (ขอบ/รูปทรงต่าง ไม่ใช่สีอย่างเดียว) · ไม่มี finance ⇒ ไม่มี `data-finance`
  - ตัวห่อ `data-view="floor"|"list"` · ตามชั้น: กล่อง `data-floor-group` **ห่อทั้งหัวกลุ่มและช่องห้อง** · หัว = "ชั้น N" (+ ชื่ออาคารเมื่อมีหลายอาคาร) + `"{occupiedLabel} x/y"` (x = LEASED+GUEST · y = ห้องในกลุ่ม) · ห้องไม่มีอาคาร/ชั้น ⇒ กลุ่ม "ไม่ระบุ" ท้ายสุด · กลุ่มเรียง อาคาร(ตาม `buildings`) → ชั้นน้อยไปมาก · ห้องเรียงเลขห้อง · กลุ่มที่กรองแล้วไม่เหลือห้อง ⇒ ไม่แสดง
  - รายการ: แถวละห้อง (มี attr เดียวกัน) มีเลขห้อง + ป้ายสถานะ + ชื่อ + ป้ายเงิน
  - คำอธิบายสัญลักษณ์ `data-legend` มีป้ายครบ 6 สถานะ (ห้ามมี `data-room-id` ข้างใน)
  - ตัวควบคุม: ปุ่ม "ตามชั้น"/"รายการ" · `<input type="search">` (หรือ placeholder มี "ค้น") · ตัวกรองสถานะ (`<select>` หรือปุ่ม `data-filter-status`)
  - ค้นหา `q` = เลขห้องหรือชื่อ (occupantLabels) แบบ substring · ไม่เหลือห้อง ⇒ ข้อความ "ไม่พบห้อง"
- 390px ไม่ล้นแนวนอน (กริดยืดหยุ่น) · หน้าตาตามภาพ 01 (ช่องการ์ด เลขห้องตัวหนา ป้าย "ใหญ่" ไม่บังคับ)

## 5. ข้อสอบ (กลุ่ม) — `scripts/qc-svc-r0.9.mts`
S โครงสร้าง 9 · O occupancyRange 8 · W roomBoard 3 · U RoomBoard render 17 · K setRoomTypeRent 3 · Y sweep 7 · Q ฉาก 4 · V ภาพ 1 · G regression 4 (qc-svc-r0.8 · qc-hotel-money/public/refund) — วันที่สัมพัทธ์กับวันนี้ไทยทั้งไฟล์

## 6. ฉากภาพ — `scripts/svc-qc-roomboard-scene.mts`
- ด่าน `loadSvcQcEnv("svc-qc-roomboard-scene")` ก่อนแตะฐาน · อ่าน `SQC` + `SQC_DORM_BOARD_SCENE` จาก `./svc-qc-data.mjs` (ห้ามฮาร์ดโค้ดซ้ำ)
- ร้าน `svcqc-tenant` หน่วยหอ: LEASE 31 ห้อง `[วันนี้-150, วันนี้+215)` · 207 LEASE `[+12,+377)` · 302 BLOCK `[-2,+2)` · 108/210/311 ไม่มี · refType `SvcQcScene` refId `scene-<เลขห้อง>` · เขียนผ่าน `claimRoom` ใน tx (เคารพ EXCLUDE)
- idempotent: อ่านเทียบก่อน ต่างเท่านั้นถึงเขียน (วันเลื่อน ⇒ resize/สร้างใหม่) · แถว `SvcQcScene` เกินฉาก ⇒ ลบ · **ไม่แตะ** ห้อง/hkStatus/occupancy refType อื่น · `--clear` ลบเฉพาะ `SvcQcScene` ของร้าน svcqc · ห้องหอยังไม่ seed (≠36) ⇒ exit 3 พร้อมข้อความให้รัน seed
- บรรทัดท้าย `SCENE_SUMMARY {"created":n,"updated":n,"removed":n}` · รันซ้ำ = 0/0/0
- ถ้าสคริปต์ลบ `hotelRoom` ที่ใดก็ตาม ต้องลบ `"roomOccupancy"` ก่อน (R0.8 S-6 สแกนทุกสคริปต์) — ใบนี้ไม่ควรลบห้องเลย

## 7. ห้าม / หมายเหตุ
- ห้ามเพิ่ม KPI/ต้องทำวันนี้/ความคืบหน้ารอบบิล (D.13) · ห้ามเมนูหน่วย DORM (D.13) · ห้ามแตะ hotel P1 หน้าจอเดิม
- โมดูล rooms ห้าม import โมดูลอื่น (ตาราง `HotelReservation` อ่านผ่าน SQL/tx ได้ — แบบ backfill) · ไม่มี `any` · zod ไม่จำเป็น (อินพุตภายใน)
- regression ที่ต้องเขียวเท่าเดิม: `qc-svc-r0.8` (S-2 ชื่อเดิมครบ · W-2 ช่อง cell เดิมครบ · B-4 setRoomTypeRent) · `qc-hotel-*` ×3
- X ที่เกี่ยว: X1 (O-4/O-5/K-3) · X5 (Y-5) · X ที่เหลือไม่เกี่ยว (ไม่มี endpoint สาธารณะ/ไฟล์/PII ใหม่)

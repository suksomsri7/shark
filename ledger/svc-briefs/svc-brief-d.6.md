# ใบสั่ง D.6 — มิเตอร์ + จดมือถือ (ไล่ทีละห้อง · ออฟไลน์แล้วส่งทีหลัง · ผิดปกติ 3 แบบ · พักบิล) · ตรวจ **เบา** (แต่ "ห้ามตัด": ข้ามร้าน · ส่งซ้ำ = ค่าเดียว · UI ตรงแบบ · ข้อห้าม สคบ.)

> แหล่งความจริง: `ledger/SVC-MASTER-PLAN.md` แถว D.6 · `ledger/DESIGN-DORM-HOTEL.md` A3 + ภาคผนวก ก หอ #9 #14 #16 #17 · ภาพ `ledger/design-dorm/03-meter-mobile.png` (+ README ตัวเลขห้อง 204/207) · CC §7 (`dorm.meter.flagged`) §8 (`dorm.view` · `dorm.meter.read`) · schema D.0 `prisma/schema/dorm.prisma` (`DormMeter` · `DormMeterReading` — **ไม่มี migration ในใบนี้**) · กติกา `ledger/SVC-RUN.md` §1
> ข้อสอบ (ห้ามแก้): «scripts/qc-svc-d.6.mts» — รับใบ = **ผ่านทุกข้อ** · SKIP ที่ยอมได้ระหว่างทำ = V-1/V-2 (ไม่มี QC_BASE) และ G-* เมื่อต่อท้าย `--no-regression` (iso.sh ทิ้ง env — ใช้ตัวแปร env ผ่าน iso ไม่ได้) — ผู้คุมรันซ้ำครบก่อนรับ
> รัน: `bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.6.mts` (ห้ามครอบ timeout · ห้าม kill กลางคัน — ล้างข้อมูลอยู่ใน finally)
> builder: **ห้าม build/next · ห้าม commit/push · ห้าม `pnpm install` · ห้าม migration/แตะ `prisma/schema`** · ทำในเลน l3 · temp ขึ้นต้น `svc-d6-` · รายงานต่อข้อ (id → ผล)
> คอลัมน์ที่ใช้มีครบใน D.0 แล้ว (`DormMeter.removedAt/replacedById/startReading/digits` · `DormMeterReading.kind/flag/flagNote/confirmedById/confirmedAt/photoFileId/source/readById` + ดัชนี unique `DormMeterReading_meterId_periodKey_period_key` (kind PERIOD) + `DormMeter_roomId_kind_active_key`) — ขาดอะไร = หยุดถามผู้คุม ห้ามเพิ่มคอลัมน์

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ (แตะนอกนี้ = ตีกลับ)
| ไฟล์ | ทำอะไร |
|---|---|
| «src/lib/modules/dorm/meter.ts» (ใหม่) | service มิเตอร์ §3 — เขียน/อ่านผ่าน `tenantDb({tenantId, unitId})` + `$transaction` ของมัน (**ห้าม** `import { prisma } from "@/lib/core/db"` — fitness F5.1 baseline ห้ามเพิ่ม) |
| «src/lib/modules/dorm/access.ts» (ใหม่) | `dormAccess(m, unitId)` §5 (pure · import ได้แค่ `@/lib/core/rbac`) |
| «src/lib/modules/dorm/meter-queue.ts» (ใหม่) | คิวออฟไลน์ฝั่งเบราว์เซอร์ §6 — **pure ล้วน** (ไม่มี import นอกจาก `import type`) |
| «src/lib/modules/dorm/index.ts» (ใหม่ถ้ายังไม่มี · มีแล้ว = เพิ่มบรรทัด export) | facade: export ชื่อใน §3 §5 §6 + type `MeterFlag` `MeterWalk` `SubmitReadingsResult` `QueuedReading` |
| «src/components/dorm/MeterWalk.tsx» (ใหม่) | จอจดมิเตอร์มือถือ §7 · `'use client'` |
| «src/app/app/u/[unitSlug]/dorm/meter/page.tsx» (ใหม่) | หน้าจด §7 (server component) |
| «src/app/app/u/[unitSlug]/dorm/meter/actions.ts» (ใหม่) | `"use server"` §7 |
| `src/app/app/u/[unitSlug]/dorm/page.tsx` | **เพิ่มด่านเดียว** ใต้ `requireUnit`: `if (!dormAccess(<membership>, unit.id).board) notFound();` (ส่วนอื่นของ R0.9 ห้ามแตะ) |
| `src/lib/core/permissions.ts` | โมดูล `dorm` (ป้าย "หอพัก" · group เดียวกับ hotel) + คีย์ `dorm.view` "ดูผังห้องและข้อมูลหอ" · `dorm.meter.read` "จดเลขมิเตอร์" (คีย์หออื่นใน CC §8 = D.13 · ห้ามเพิ่มล่วงหน้า) |
| `src/lib/outbox-consumers.ts` · `src/lib/automation/labels.ts` | event `dorm.meter.flagged` (consumer `withAutomation(async () => {})` แบบ `rooms.occupancy.changed` · ป้ายไทย) — `webhooks/labels.ts` ได้จาก spread (ห้ามซ้ำ) |
| `scripts/fitness.mts` | เฉพาะบรรทัด `ALLOWED_EDGES` ที่ใบนี้ใช้จริง (คาด `"dorm→rooms"` · `"dorm→kanban"`) + คอมเมนต์ขึ้นต้น `// SVC D.6` ภายใน 3 บรรทัดเหนือ · ห้ามแตะอย่างอื่น |
| «scripts/svc-qc-meter-scene.mts» (ใหม่) | ฉากภาพ §8 |

ผู้คุมแก้ให้แล้วในใบนี้ (builder ห้ามแตะ): `scripts/svc-qc-data.mts` — ผู้ใช้ `meter` ได้ `dorm.meter.read` · `fai` ได้ `dorm.view` เพิ่ม · `SQC_VISUAL_SPECS["d.6"]` (ต้อง reseed ก่อนถ่ายภาพ — ผู้คุมทำ)

ห้าม: migration · แตะ `rooms/*` (ใช้ facade `@/lib/modules/rooms` เท่านั้น — `occupancyRange` · `listBuildings`) · แตะ kanban (ใช้ประตูเดียว `createCardFromExternal` จาก `@/lib/modules/kanban/links`) · คิดเงิน/อัตราในใบนี้ (กล่อง "ประมาณค่าน้ำไฟ" ในภาพ = D.7) · ชื่อผู้เช่าในจอ (D.5/D.13 เติม) · AI อ่านเลข (D.14) · เมนูล่างของหน่วยหอ (D.13) · `any` · `getDay()` ดิบ

## 2. ศัพท์ · กติกา
- **งวด** `periodKey` = `"YYYY-MM"` (regex เดียวกับ CHECK) · หนึ่งมิเตอร์ × หนึ่งงวด = **1 แถว `kind PERIOD`** (ดัชนี unique ของ D.0) — ทุกทางเขียนต้องยอมรับการชน unique (P2002) แล้วอ่านแถวผู้ชนะ ไม่ใช่ throw
- **เลขก่อนหน้า** (`prevValue`) ของมิเตอร์ในงวด P = ค่าของแถว PERIOD ล่าสุดที่ `periodKey < P` บนมิเตอร์นั้น · ไม่มี ⇒ `DormMeter.startReading`
- **หน่วยของงวด** = `meterUnits(segments)` ของ D.1 (`src/lib/modules/dorm/calc.ts`) — มิเตอร์ที่ถูกเปลี่ยนในงวด: segment ตัวเก่า `prevValue → ค่า REPLACE` + segment ตัวใหม่ `startReading → ค่าที่จด` · **หน่วยไม่มีวันติดลบ**: เลขถอยหลังที่ยังไม่แก้ ⇒ `units = null` (ไม่ใช่ลบ ไม่ใช่ 0)
- **ค่าเฉลี่ย 3 เดือน** = เฉลี่ยหน่วยของงวด P−1 · P−2 · P−3 เท่าที่คำนวณได้ (≥ 1 งวด) · ไม่มีเลย หรือเฉลี่ย = 0 ⇒ ไม่ตรวจ ±%
- **ห้องว่าง** = ไม่มี occupancy active ชนิด `LEASE` หรือ `STAY` ซ้อนช่วง `[วันของ readAt ของแถว PERIOD ก่อนหน้า (ไม่มี ⇒ วันที่ 1 ของงวด), วันของ readAt ที่จด + 1)` (วันไทย · อ่านผ่าน `occupancyRange` ของ facade rooms)
- **ค่าตั้ง** `rooms.meter.anomaly` (ชั้น UNIT · `{ pctFromAvg3, vacantMaxUnits, flagBackwards }` · ค่าเริ่ม 50/5/true) อ่านด้วย `resolveSetting(ctx, "rooms.meter.anomaly", { unitId })` ทุกครั้ง (ห้ามฮาร์ดโค้ด · ข้อสอบ A-8 ตั้งค่าระดับหน่วยแล้วดูผล)

### 2.1 ป้ายผิดปกติ (`DormMeterReading.flag` · `MeterFlag`) — เลือกตัวแรกตามลำดับนี้
| flag | เมื่อ | ผล |
|---|---|---|
| `BACKWARDS` | `value < prevValue` (และ `flagBackwards` = true) | `units = null` · พักบิล · ยืนยันเฉย ๆ ไม่ได้ → ต้อง `replaceMeter` หรือจดใหม่ |
| `VACANT_USAGE` | มิเตอร์ ROOM · ห้องว่าง (§2) · `units > vacantMaxUnits` | พักบิล + **การ์ดบอร์ดงาน 1 ใบต่อมิเตอร์×งวด** (§4) |
| `HIGH` | ไม่ใช่ห้องว่าง · `units × 100 × n > sum × (100 + pct)` (n = จำนวนงวดที่ใช้เฉลี่ย · sum = ผลรวม · **มากกว่าเท่านั้น** — เท่ากับเกณฑ์ = ปกติ) | พักบิล |
| `LOW` | ไม่ใช่ห้องว่าง · `units × 100 × n < sum × (100 − pct)` (pct ≥ 100 ⇒ ไม่มี LOW) | พักบิล |
- ห้องว่างไม่ตรวจ ±% (ห้องว่างใช้ 3 หน่วย = ปกติ) · มิเตอร์ MAIN ไม่ตรวจห้องว่าง แต่ตรวจ ±% ได้ · MAIN ไม่ทำให้ห้องใดถูกพัก
- **พักบิล (held)** = แถวมี `flag` และ `confirmedAt IS NULL` · D.8 อ่าน `heldRooms` แล้วตั้ง `DormBill.status = HELD` (ใบนี้ไม่แตะบิล)

## 3. สัญญา (ชื่อ/ชนิดตรงตัว — ข้อสอบผูก) — ออกทาง `@/lib/modules/dorm`
```ts
export type MeterCtx = { tenantId: string; actorUserId?: string | null };
export type MeterFlag = "HIGH" | "LOW" | "BACKWARDS" | "VACANT_USAGE";
type Fail = { ok: false; code: string; reason: string };   // reason ไทยไม่ว่าง ไม่โทษผู้ใช้ · ห้าม throw (ยกเว้นบั๊กจริง)
```
ทุกฟังก์ชัน: หน่วยต้องเป็น `BusinessUnit` ของ `ctx.tenantId` และ `type = "DORM"` · ไม่ใช่ ⇒ `NOT_FOUND` (ฟังก์ชันเขียน) / ผลว่าง (ฟังก์ชันอ่าน) — **ไม่บอกว่ามีอยู่ (X1)**

### 3.1 มิเตอร์
```ts
createMeter(ctx, { unitId; kind: "ELEC" | "WATER"; role?: "ROOM" | "MAIN"; roomId?: string | null; buildingId?: string | null;
                   serial?: string | null; digits?: number | null; startReading?: number; note?: string | null })
  → Promise<{ ok: true; meterId: string } | Fail>
listMeters(ctx, { unitId }) → Promise<{ meterId; roomId: string | null; buildingId: string | null; kind; role; serial: string | null; digits: number | null; startReading: number }[]>   // active เท่านั้น
```
- `role` ค่าเริ่ม ROOM · ROOM ต้องมี `roomId` ของหน่วยนี้ (ห้องหน่วยอื่น/ร้านอื่น ⇒ `NOT_FOUND`) · MAIN ต้อง `roomId` ว่าง (ส่งมา ⇒ `INVALID_INPUT`) · `buildingId` (ถ้าส่ง) ต้องเป็นอาคารของหน่วย ⇒ ไม่ใช่ `NOT_FOUND`
- kind นอก 2 ค่า · `startReading` ไม่ใช่จำนวนเต็ม ≥ 0 · `digits` นอก 1–12 ⇒ `INVALID_INPUT` · ห้องมีมิเตอร์ชนิดเดียวกันที่ active อยู่ ⇒ `DUPLICATE` (ดัชนี D.0 กันซ้ำจริงอีกชั้น — ชนกันพร้อมกันก็ต้องได้ `DUPLICATE` ไม่ใช่ throw)

### 3.2 ส่งเลข (ทางเดียวที่เขียนแถว PERIOD — หน้าจด · คิวออฟไลน์ · ฉาก · D.4 นำเข้าใช้ตัวนี้)
```ts
submitReadings(ctx, {
  unitId: string; periodKey: string;
  items: { meterId: string; value: number; readAt?: string /* ISO · ไม่ส่ง = ตอนนี้ */; clientKey?: string;
           photo?: { data: Uint8Array; contentType: string } | null }[];          // 1–200 รายการ
}, deps?: { put?: (path: string, data: Uint8Array, contentType: string) => Promise<void>; now?: Date })
→ Promise<{ ok: true; results: SubmitItemResult[] } | Fail>
type SubmitItemResult = { meterId: string; status: "CREATED" | "UPDATED" | "UNCHANGED" | "LOCKED" | "REJECTED";
  readingId: string | null; flag: MeterFlag | null; held: boolean; units: number | null; code?: string; cardId?: string | null };
```
- ระดับชุด (`Fail`): หน่วยไม่ใช่ของร้าน/ไม่ใช่ DORM ⇒ `NOT_FOUND` · `periodKey` ผิดรูป/ไม่มี items/รูปแบบผิด ⇒ `INVALID_INPUT` · > 200 ⇒ `TOO_MANY`
- ระดับรายการ (`REJECTED` + `code` · รายการอื่นในชุดยังทำต่อ): มิเตอร์ไม่ใช่ของหน่วยนี้/ร้านนี้ ⇒ `NOT_FOUND` · มิเตอร์ถูกถอดแล้ว (`removedAt`) ⇒ `METER_REMOVED` · `value` ไม่ใช่จำนวนเต็ม 0…999,999,999,999 ⇒ `INVALID_VALUE` — ไม่มีแถว/ไฟล์/event เกิด
- **idempotent ต่อ มิเตอร์ × งวด** (หัวใจของคิวออฟไลน์): ยังไม่มีแถว ⇒ `CREATED` · มีแล้วค่าเท่าเดิม ⇒ `UNCHANGED` (ไม่เขียน — `updatedAt` ไม่ขยับ · ไม่อัปรูป · ไม่มี event/การ์ดเพิ่ม) · ค่าต่าง + ยังไม่ยืนยัน ⇒ `UPDATED` (ตรวจผิดปกติใหม่) · ค่าต่าง + ยืนยันแล้ว (`confirmedAt`) ⇒ `LOCKED` (ไม่เปลี่ยน) — **ส่งพร้อมกัน N ทาง = แถวเดียว · `CREATED` ตัวเดียว · ไม่มีรายการไหน REJECTED/throw**
- เขียนแถว: `kind PERIOD` · `source MANUAL` · `readById = ctx.actorUserId` · `readAt` · `tenantId/unitId` ของมิเตอร์ · `flag` ตาม §2.1 · ถูกยกเลิกป้าย (ค่าใหม่ปกติ) ⇒ `flag = null`
- **รูป** (ไม่บังคับในใบนี้ · `rooms.meter.requirePhoto` = หนี้ D.14): อัปเฉพาะเมื่อผลเป็น CREATED/UPDATED ผ่าน `uploadFile(…, { kind: "ATTACHMENT", visibility: "private" }, deps.put ? { put } : undefined)` ⇒ `photoFileId` · อัปไม่สำเร็จ = เก็บเลขต่อ (ไม่มีรูป) ไม่ปฏิเสธรายการ
- event + การ์ด: §4

### 3.3 ตรวจ · ยืนยัน · เปลี่ยนมิเตอร์
```ts
confirmReading(ctx, { unitId; readingId; action: "ACCEPT" | "REREAD"; value?: number; note?: string | null })
  → Promise<{ ok: true; flag: MeterFlag | null; held: boolean; units: number | null } | Fail>
replaceMeter(ctx, { unitId; meterId; oldFinalReading: number; newStartReading: number; readingId?: string | null;
                    serial?: string | null; digits?: number | null; readAt?: string })
  → Promise<{ ok: true; oldMeterId: string; newMeterId: string; units: number | null } | Fail>
```
- `ACCEPT` ("ยืนยันค่านี้" / "ข้าม" ในภาพ ค): ตั้ง `confirmedById/confirmedAt` · `flag` คงไว้เป็นประวัติ (+ `flagNote = note`) ⇒ ไม่พัก · **BACKWARDS ⇒ `BACKWARDS_NEEDS_REPLACE`** (ไม่เปลี่ยนอะไร) · ไม่มีป้าย/ยืนยันแล้ว ⇒ ok ไม่เปลี่ยน
- `REREAD` ("จดใหม่"/"จดผิด แก้"): ต้องมี `value` (ไม่ใช่ ⇒ `INVALID_INPUT`) · ยืนยันแล้ว ⇒ `LOCKED` · อื่น ๆ = เหมือน submit ค่าใหม่ (ตรวจใหม่ · event ป้ายใหม่ถ้าเปลี่ยน)
- `replaceMeter` ("เปลี่ยนมิเตอร์"): ใน tx เดียว — ตัวเก่า `removedAt = now` · `replacedById = ตัวใหม่` · แถว `kind REPLACE` บนตัวเก่า `value = oldFinalReading` งวดเดียวกับ `readingId` (ไม่ส่ง = งวดของ `readAt`/เดือนนี้) · ตัวใหม่ (`roomId/buildingId/kind/role` เดิม · `startReading = newStartReading` · `serial/digits` ที่ส่ง) · ถ้าส่ง `readingId` (ต้องเป็นแถว PERIOD ของตัวเก่า) ⇒ **ย้ายแถวนั้นไปตัวใหม่** (`meterId`) + ตรวจใหม่ด้วย segment 2 ช่วง (ป้าย BACKWARDS หาย) · คืน `units` ของงวด = (oldFinal − prev) + (value − newStart)
  - ปฏิเสธ (ไม่เปลี่ยนอะไรเลย): `oldFinalReading < prevValue` หรือ `newStartReading > value ของ readingId` หรือไม่ใช่จำนวนเต็ม ≥ 0 ⇒ `INVALID_INPUT` · มิเตอร์ถูกถอดแล้ว ⇒ `METER_REMOVED` · ไม่ใช่ของหน่วย/ร้าน ⇒ `NOT_FOUND`
  - หลังเปลี่ยน: ส่งเลขเข้ามิเตอร์ตัวเก่า (คิวออฟไลน์ค้าง) ⇒ `REJECTED METER_REMOVED`

### 3.4 อ่าน (หน้าจอ · D.7/D.8)
```ts
meterWalk(ctx, { unitId; periodKey }) → Promise<MeterWalk>
type MeterWalk = { periodKey: string;
  floors: { key: string; label: string; buildingId: string | null; floorNo: number | null;
    rooms: { roomId: string; number: string; vacant: boolean; done: boolean; flag: MeterFlag | null;
      meters: { meterId: string; kind: "ELEC" | "WATER"; prevValue: number | null; value: number | null; readingId: string | null;
                units: number | null; flag: MeterFlag | null; held: boolean; photo: boolean }[] }[] }[];
  main: { meterId: string; kind: "ELEC" | "WATER"; buildingId: string | null; prevValue: number | null; value: number | null; readingId: string | null; units: number | null; flag: MeterFlag | null }[];
  progress: { rooms: number; done: number; flagged: number } };
meterFlags(ctx, { unitId; periodKey }) → Promise<{ readingId; meterId; roomId: string | null; roomNumber: string | null; kind; flag: MeterFlag; value: number; prevValue: number | null; units: number | null; avg3: number | null }[]>   // ที่ยังพักอยู่เท่านั้น
heldRooms(ctx, { unitId; periodKey }) → Promise<string[]>        // roomId ที่มีแถวพัก (ไม่รวม MAIN) · เรียงไม่สำคัญ · ไม่ซ้ำ
periodUsage(ctx, { unitId; periodKey }) → Promise<{ meterId; roomId: string | null; role: "ROOM" | "MAIN"; kind; prevValue: number | null; value: number | null;
  units: number | null; flag: MeterFlag | null; held: boolean; segments: { start: number; end: number }[] }[]>   // มิเตอร์ active ทุกตัว
```
- `meterWalk`: เฉพาะห้องที่มีมิเตอร์ ROOM active ≥ 1 (รวม **ห้องว่าง** — `vacant` ตาม §2 ณ วันนี้ไทย) · กลุ่มชั้นเรียง อาคาร (`listBuildings` sortOrder) → `floorNo` น้อยไปมาก (ไม่มีชั้นท้ายสุด) · ห้องเรียงเลขห้อง · `label` = "ชั้น N" (หลายอาคาร ⇒ "<อาคาร> · ชั้น N") · `key` ไม่ซ้ำ · `done` = ทุกมิเตอร์ของห้องมีแถวงวดนี้ · `room.flag` = ป้ายที่ยังพักตัวแรกตามลำดับ §2.1 · `progress` = {ห้องในรายการ, ห้อง done, ห้องที่มีป้ายพัก} · มิเตอร์ MAIN อยู่ `main`
- `units`/`prevValue` ทุกจุด = กติกาเดียวกับ §2 (หลังเปลี่ยนมิเตอร์ ตัวใหม่ได้ units รวม 2 segment)

## 4. event `dorm.meter.flagged` · การ์ดห้องว่าง
- event ใน tx เดียวกับการเขียนแถว (`emitOutbox(tx, …)`) เมื่อแถวได้ป้าย **ใหม่** (ไม่มี → มี · หรือเปลี่ยนชนิด) · `idempotencyKey = "dorm.meter.flagged:<readingId>:<flag>"` ⇒ ส่งซ้ำ/พร้อมกันกี่รอบ = 1 แถว outbox · `unitId` ของแถว outbox = หน่วย
- payload **ตรง 6 คีย์**: `{ unitId, meterId, roomId /* null = MAIN */, readingId, periodKey, flag }` — ไม่มีชื่อ/เบอร์/ค่าเงิน
- ลง 3 ทะเบียน (`outbox-consumers` · `automation/labels` ป้ายไทย · webhooks ผ่าน spread)
- **การ์ด** (ป้าย `VACANT_USAGE` เท่านั้น · หลัง tx commit): `createCardFromExternal({ tenantId, systemId: <ของบอร์ด>, actorUserId: null }, { boardId, title, description, sourceType: "AUTOMATION", sourceKey: "dorm.meter.vacant:<meterId>:<periodKey>" })`
  - บอร์ด: ชื่อบอร์ดจาก `rooms.repair.categories` (ELEC ⇒ แถว `code ELECTRIC` · WATER ⇒ `PLUMBING`) → บอร์ด ACTIVE ของร้านที่ชื่อตรงตัว (เก่าสุดก่อน) → ไม่มี ⇒ บอร์ด ACTIVE เก่าสุดของร้าน → ไม่มีระบบบอร์ดงาน/บอร์ด ⇒ ไม่มีการ์ด (`cardId: null`) **ป้ายยังติด · ไม่ throw**
  - `title` มีเลขห้อง + "ห้องว่าง" + หน่วย (เช่น `ห้อง 210 ห้องว่างใช้ไฟ 18 หน่วย — เช็กตู้เย็น/ปลั๊ก`) · ไม่มีชื่อผู้เช่า/เบอร์
  - ผลรายการของ submit คืน `cardId` (ส่งซ้ำ = ใบเดิม) · ล้มตอนสร้างการ์ด = log แล้วคืน `cardId: null` (แถว+ป้ายอยู่แล้ว)

## 5. สิทธิ์ — "คนจดมิเตอร์เห็นแค่หน้าจด"
```ts
dormAccess(m: MembershipCtx | null, unitId: string) → { board: boolean; meter: boolean }
// board = evaluate(m, { module: "dorm", action: "dorm.view", unitId }) · meter = evaluate(m, { module: "dorm", action: "dorm.meter.read", unitId })
```
- หน้า `/dorm` (ผัง R0.9) ⇒ `!board` ⇒ `notFound()` · หน้า `/dorm/meter` ⇒ `!meter` ⇒ `notFound()` · action ⇒ `!meter` ⇒ คืนข้อความปฏิเสธ (ไม่ throw ให้ผู้ใช้เห็น stack) · หน้า `/dorm/settings` มีด่านของ R0.4 อยู่แล้ว (ไม่แตะ)
- ผู้ใช้ QC: `meter` (STAFF · หอ · `dorm.meter.read`) ⇒ `{board:false, meter:true}` · `fai` (+`dorm.view`) ⇒ `{board:true, meter:false}` · OWNER/MANAGER ที่คุมหน่วย ⇒ ทั้งคู่

## 6. คิวออฟไลน์ (pure · `meter-queue.ts` · client import ได้)
```ts
export type QueuedReading = { meterId: string; periodKey: string; value: number; readAt: string; clientKey: string; photo?: { dataUrl: string; contentType: string } | null };
enqueueReading(queue: readonly QueuedReading[], item: QueuedReading): QueuedReading[]
nextBatch(queue: readonly QueuedReading[], max?: number /* ค่าเริ่ม 50 · เพดาน 200 */): { periodKey: string; items: QueuedReading[] } | null
settleBatch(queue: readonly QueuedReading[], sent: readonly QueuedReading[], results: readonly { meterId: string; status: string; code?: string }[]): { queue: QueuedReading[]; rejected: { meterId: string; code: string | null }[] }
```
- ไม่แก้อาร์เรย์เดิม (คืนอาร์เรย์ใหม่) · `enqueueReading` = แทนที่รายการ มิเตอร์×งวด เดิม (ค่าใหม่ชนะ · รายการใหม่ไม่มีรูป ⇒ คงรูปเดิม) — จดซ้ำ 3 ครั้งออฟไลน์ = 1 รายการ
- `nextBatch`: งวดเก่าสุดก่อน · รายการเรียงตามที่เข้าคิว · ไม่เกิน `max` · คิวว่าง ⇒ `null`
- `settleBatch`: เอาออกเฉพาะรายการที่ส่งไป **และ `clientKey` ยังตรงกับในคิว** (ระหว่างส่งมีคนจดค่าใหม่ ⇒ เก็บค่าใหม่ไว้ส่งรอบหน้า) · สถานะ CREATED/UPDATED/UNCHANGED/LOCKED/REJECTED = เสร็จ (REJECTED/LOCKED เข้า `rejected` พร้อม code) · ไม่มีผลของรายการนั้น (เน็ตหลุดกลางทาง) ⇒ คงไว้
- คอมโพเนนต์เก็บคิวใน `localStorage` (หรือ IndexedDB) คีย์ต่อหน่วย · ส่งเมื่อ `navigator.onLine` / event `online` · แสดง "รอส่ง N"

## 7. จอ (ภาพ หอ 03 · มือถือ 390 เป็นหลัก)
- «page.tsx»: server component · `requireUnit` · `unit.type !== "DORM"` ⇒ `notFound()` · `dormAccess(...).meter` ไม่ผ่าน ⇒ `notFound()` · งวด = `searchParams.period` ที่ถูกรูป ไม่งั้นเดือนนี้ไทย (`bkkYmd`) · `searchParams.view === "flags"` ⇒ `initialView="flags"` (ภาพ ค · สเปคภาพ `dorm-meter-flags`) · `meterWalk` + `meterFlags` ผ่าน facade `@/lib/modules/dorm` (ไม่แตะ prisma) → `<MeterWalk … submit={submitMeterReadingsAction} />`
- «actions.ts»: `"use server"` · export async function เท่านั้น · `submitMeterReadingsAction(unitSlug, input)` · `confirmMeterReadingAction(unitSlug, input)` · `replaceMeterAction(unitSlug, input)` — ทุกตัว `requireUnit` + `dormAccess(...).meter` · ร้าน/ผู้กระทำจาก session เท่านั้น (`actorUserId = auth.active.userId`) · รูปรับเป็น base64/dataURL (≤ 5 MB) แปลงเป็น `Uint8Array`
- «MeterWalk.tsx» (`'use client'` บรรทัดแรก · import โมดูล server ไม่ได้ ยกเว้น `import type` + `@/lib/modules/dorm/meter-queue` · **ไม่ import actions** — รับ `submit` เป็น prop · ไม่ใช้ hook ของ Next — `renderToStaticMarkup` ได้):
```ts
props: { unitId: string; periodKey: string; walk: MeterWalk; flags?: Awaited<ReturnType<typeof meterFlags>>;
         submit: (input: { periodKey: string; items: {...}[] }) => Promise<unknown>;
         initialFloor?: string /* floors[].key */; initialRoomId?: string; initialView?: "walk" | "flags" }
```
  - DOM สัญญา: ตัวห่อ `data-meter-walk` + `data-period` · หัว "จดแล้ว {done} / {rooms} ห้อง" · มีป้ายพัก ⇒ "ผิดปกติ {n}" · แถบชั้นปุ่ม `data-floor-tab="<key>"` ข้อความ = `label` · แถวห้อง (เฉพาะชั้นที่เลือก · ค่าเริ่ม = ชั้นแรกที่ยังไม่ครบ ไม่มี ⇒ ชั้นแรก) `data-room-id` `data-room-number` `data-vacant="true|false"` `data-done="true|false"` (+ `data-flag="<flag>"` เมื่อพัก) · ห้องว่างมีข้อความ "ห้องว่าง" · ข้อความ "ออฟไลน์ได้" + "รอส่ง {n}"
  - `initialRoomId` ⇒ แผงห้อง: เลขห้องตัวหนา · ต่อมิเตอร์ `data-meter-input="<meterId>"` บน `<input inputmode="numeric">` + เลขก่อนหน้าแสดงคู่ · ปุ่มถ่ายรูป `<input type="file" accept="image/*" capture="environment">` · ปุ่มบันทึก "บันทึก"
  - `initialView="flags"` ⇒ รายการตรวจค่าผิดปกติ: การ์ดต่อแถว `data-flag-reading="<readingId>"` + ปุ่มตามชนิด (HIGH/LOW: "จดใหม่" · "ยืนยันค่านี้" · BACKWARDS: "จดผิด แก้" · "เปลี่ยนมิเตอร์" · VACANT_USAGE: "ข้าม" · "สร้างงานตรวจ"/"ดูงานตรวจ")
  - ไม่มีเงิน/฿/คำนวณยอด (D.7) · **ไม่มีคำต้องห้าม สคบ.** (ตัดไฟ/ตัดน้ำ/ล็อกห้อง/ระงับน้ำไฟ ฯลฯ — ห้องผิดปกติ = "พักบิลรอตรวจ")
  - 390 px ไม่ล้นแนวนอน · หน้าตาตามภาพ 03 (การ์ดความคืบหน้า + แถบชั้น + แถวห้อง · แผงห้อง · รายการตรวจ)

## 8. ฉากภาพ «scripts/svc-qc-meter-scene.mts»
- ด่าน `loadSvcQcEnv("svc-qc-meter-scene")` ก่อนแตะฐาน · อ่าน `SQC` จาก `./svc-qc-data.mjs` · ต้องมีฉากผังของ R0.9 แล้ว (occupancy `SvcQcScene` LEASE ≥ 31) ไม่งั้น exit 3 พร้อมข้อความให้รัน `scripts/svc-qc-roomboard-scene.mts`
- ร้าน svcqc หอ: มิเตอร์ ELEC + WATER ทุกห้อง (72) + MAIN ELEC ของอาคาร A · `note = "SvcQcScene"` · ประวัติ 3 งวดก่อน (เขียนตรงได้ `source IMPORT`) · งวดนี้จด **27/36 ห้อง** (ชั้น 1 ครบ 12 · ชั้น 2 7/12 · ชั้น 3 8/12) ผ่าน `submitReadings` จริง · ผิดปกติ 3 = 309 HIGH (412 หน่วย · เฉลี่ย ~131) · 112 BACKWARDS (8,904 → 126) · 210 VACANT_USAGE (18 หน่วย) · ห้อง 204 ไฟ 1,287 → 1,412 · น้ำ 312 → 318 (README)
- idempotent (`SCENE_SUMMARY {"created":n,"updated":n,"removed":n}` · รันซ้ำ = 0/0/0) · `--clear` ลบเฉพาะแถว `SvcQcScene` (readings ก่อน meters) · ไม่แตะห้อง/occupancy/ข้อมูลอื่น

## 9. ข้อสอบ (กลุ่ม) — «scripts/qc-svc-d.6.mts»
S โครงสร้าง 14 · M มิเตอร์ 7 · R ส่งเลข+idempotent 10 · A ผิดปกติ 9 · E event 3 · K การ์ด 5 · H พักบิล/ยืนยัน/เปลี่ยนมิเตอร์ 10 · W walk 5 · P สิทธิ์ 3 · X ข้ามร้าน/ข้ามหน่วย 6 · U จอ+คิว 9 · Q ฉาก 3 · V ภาพ 2 · G regression 2 · Z ล้าง 1 = **89 ข้อ** — งวดสัมพัทธ์กับเดือนนี้ไทย · ลำดับข้อในไฟล์ต่อกัน (สถานะสะสม — ข้อหลังใช้ผลข้อก่อน) · ฟังก์ชันใน facade ขาด = FAIL (ไม่ใช่ SKIP)
- ข้อมูลทดสอบ (หน่วย DA): ประวัติ 4 งวดก่อน 1000/1100/1200/1300 (เฉลี่ย 100) · มีผู้เช่า 101–106 · 201 · 206 · ห้องว่าง 202 203 205 · 204 สัญญาจบ D−200 · 207 ไม่มีมิเตอร์ · DA2 ตั้ง pct 20/ว่าง ≤ 30 · บอร์ด "งานทั่วไป" (เก่าสุด) + "ซ่อมหอ" · ร้าน B ไม่มีบอร์ดงาน

## 10. regression · X · ส่งต่อ
- ต้องเขียวเท่าเดิม: `qc-svc-r0.9` (หน้า dorm เพิ่มด่าน) · `qc-svc-r0.2` (ผู้ใช้ seed) · fitness 2 โหมด (F2.1 เส้นใหม่ · F5.1 ไม่เพิ่ม) · typecheck
- X ที่เกี่ยว: X1 (X-1..6) · X3 (R-5/K-3: 10 ทางพร้อมกัน) · X4 (R-2/E-2: ส่งซ้ำ = ผลครั้งเดียว) · X8 (E-1 payload ไม่มี PII) · X10 (R-9 รูปเป็นไฟล์ส่วนตัว) · ที่เหลือไม่เกี่ยว (ไม่มี endpoint สาธารณะ/งานตามเวลา/นำเข้า)
- ส่งต่อ: **D.7** อ่าน `periodUsage` (MAIN = ต้นทุนตึก) + กล่องประมาณเงินในจอ 03 · **D.8** `heldRooms` ⇒ `DormBill HELD` + "จดครบ → ไปออกบิล" · **D.4** นำเข้าเลขล่าสุดผ่าน `createMeter` + `submitReadings` (source IMPORT = ใบ D.4 เติมพารามิเตอร์) · **D.13** ชื่อผู้เช่าในแถว + เมนูล่าง (จดมิเตอร์/ผังห้อง/งานซ่อม/ฉัน) + คีย์หอที่เหลือ · **D.14** AI อ่านเลข + บังคับรูป (`rooms.meter.requirePhoto`) · หนี้: rollover หน้าปัด (`digits`) ยังตัดสินเป็น BACKWARDS → ใช้ `replaceMeter`/จดใหม่ไปก่อน · MOVE_IN/MOVE_OUT = D.5/D.12

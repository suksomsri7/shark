# ใบสั่ง B.6 — ตู้ · ทีวี · หน้าบัตร (ภาพ จอง 04 · 05 · 06ก) · ตรวจ: **เบา** (รอบเดียว — ดูคำถาม Q5) · ห้ามตัด: แยกร้าน (X1) · ไม่มีชื่อ/เบอร์ลูกค้าบนหน้าสาธารณะ (X8) · token ผิด = คำตอบเดียวกับไม่มี (X7) · rate limit ตู้/บัตร · ค่าตั้งต่ออุปกรณ์มีผลจริง · UI ตรงแบบ

> อ้างอิง: MASTER-PLAN แถว B.6 · `DESIGN-BOOKING-QUEUE.md` R4 · §7 (หน้าสาธารณะ: เลข+เวลาเท่านั้น) · ภาคผนวก ก #44 #52–58 · ภาพ `ledger/design-booking/04-kiosk.png` `05-tv-display.png` `06-customer-line.png` (ส่วน ก) + README (ตัวเลขร่วมจอ 01/04/05/06) · CC §1 (ค่าตั้ง · scope DEVICE) §4.5 (`checkInToken`) · `issueLinkCode` (CC บรรทัด 237 · `src/lib/modules/chat/link-code.ts`) · ใบ B.4 §7 ("B.6 ใช้ createWalkIn KIOSK/REMOTE · checkIn(token) · rate limit") · ใบ B.5 §8 · ใบ B.11 §2 ข้อ 7 + §11 (scope DEVICE "เปิดแก้จริง = B.6 + core-fix")
> ข้อสอบ (ห้ามแก้): «scripts/qc-svc-b.6.mts» — รับใบ = **ผ่านทุกข้อ** (นับจาก `JSON_SUMMARY`) · SKIP ที่ยอมได้ระหว่างทำ: `H-*` `V-*` (ไม่มี QC_BASE) · `Q-*` (svcqc ยังไม่ seed) · `G-*` (`--no-regression`) — ผู้คุมรันครบก่อนรับ
> รัน: `bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-b.6.mts [--no-regression]` (ห้าม `timeout` ครอบ · ห้าม kill กลางคัน — ล้างข้อมูลอยู่ใน finally)
> builder: **ห้าม build/next · ห้าม commit/push · ห้าม `pnpm install` · ห้าม migration/แตะ `prisma/**` · ห้ามแก้ข้อสอบ/`scripts/svc-qc-data.mts`/สคริปต์อื่นใน `scripts/`** (ยกเว้นไฟล์ฉากใหม่ §6) · temp ขึ้นต้น `svc-b6-` · รายงานต่อข้อ (id → ผล)
> ผู้คุมแก้ให้แล้วในใบนี้ (builder ห้ามแตะ): `scripts/svc-qc-data.mts` ต่อท้าย `SQC_DEVICE_SCENE` · `sqcDeviceSceneDay` · `sqcTicketToken` · `SQC_VISUAL_SPECS["b.6"]`

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ (แตะนอกนี้ = ตีกลับ · ข้อสอบ S-1 ไล่ `git status` ของ src/ prisma/)
| ไฟล์ | ทำอะไร |
|---|---|
| «src/lib/modules/booking/devices.ts» (ใหม่) | §3.1 อุปกรณ์ (สร้าง · รายการ · เปลี่ยน token · ถอน) + `deviceByToken` |
| «src/lib/modules/booking/public-line.ts» (ใหม่) | §3.2–§3.4 ตัวโหลดทีวี/ตู้/หน้าบัตร · ตู้เช็กอิน/walk-in · ลูกค้าเลื่อน/ยกเลิก · `ticketToken` |
| `src/lib/modules/booking/index.ts` | re-export ได้ถ้าจำเป็น |
| `src/lib/core/settings/service.ts` | **core-fix (Q1)** §3.6 เพิ่มชั้น DEVICE — **เพิ่มเท่านั้น** (S-9 ไล่ diff) |
| `src/lib/modules/queue/service.ts` | §3.7 (ก)(ข) ปิดทางสาธารณะเดิมของบัตร/จอแถวเดียว — เพิ่มเท่านั้น · หน่วย QUEUE ได้ผลเดิมทุกไบต์ |
| `src/lib/modules/queue/actions.ts` | §3.7 (ค) `createDisplayAction`/`revokeDisplayAction` ใช้ `ticketCtxOf` (หน่วย QUEUE เท่านั้น) |
| «src/lib/actions/booking-public.ts» (ใหม่) | §3.5 server actions สาธารณะ (ตู้ · หน้าบัตร) |
| «src/lib/actions/booking-devices.ts» (ใหม่) | §3.5 server actions จัดการอุปกรณ์ (พนักงาน) |
| «src/app/(store)/bq/tv/[token]/page.tsx» · «…/bq/kiosk/[token]/page.tsx» · «…/bq/t/[token]/page.tsx» (ใหม่) | §5 หน้าสาธารณะ |
| «src/app/app/u/[unitSlug]/booking/devices/page.tsx» (ใหม่) | §5 หน้าจัดการจอ/ตู้ + ฟอร์มค่าตั้งรายเครื่อง (`SettingsForm` ชั้น DEVICE) |
| «src/components/booking/public/TvBoard.tsx» · «Kiosk.tsx» · «TicketCard.tsx» · «src/components/booking/DevicesPanel.tsx» (+ไฟล์ย่อยใต้ `src/components/booking/public/`) | §4 คอมโพเนนต์ (default export) |
| `src/components/booking/TodayLine.tsx` | **บรรทัดปุ่ม "จอทีวี" เท่านั้น**: ปุ่ม disabled ⇒ ลิงก์ `href="/app/u/<unitSlug>/booking/devices"` |
| «scripts/svc-qc-device-scene.mts» (ใหม่) | §6 ฉากภาพบน svcqc |

ห้ามแตะ: `planner.ts` · `planner-run.ts` · `queue-line.ts` · `today-line.ts` · `line-ops.ts` (ใช้ facade ที่มี: `createWalkIn` · `checkIn` · `checkInToken` · `loadTodayLine`/ตัวช่วยอ่านแผน · `lockUnitTx`/`casAppt`/`replan` ฯลฯ — ต้องการเพิ่มของในไฟล์เหล่านี้ = เขียนคำขอใน wo-notes) · `src/lib/core/**` อื่นนอก service.ts · `permissions.ts` (ใช้ `booking.devices.manage` ของ B.11 ที่มีแล้ว) · 3 ทะเบียน event (ไม่มี event ใหม่ — ยกเลิกโดยลูกค้าใช้ `booking.cancelled` เดิม) · ไฟล์ของ B.11 (`settings-model.ts` · หน้า settings/*)

## 2. หลักการ (ข้อสอบตรวจทุกข้อ)
- **หน้าสาธารณะแยกร้านด้วย token เท่านั้น** (ไม่มี slug ใน URL): `/bq/tv/<deviceToken>` · `/bq/kiosk/<deviceToken>` · `/bq/t/<ticketToken>` · token ทุกตัว ≥ 256 บิต · token ใช้ไม่ได้ทุกกรณี (สุ่ม · ถอนแล้ว · ผิดชนิด · หน่วยปิดแถวเดียว · หมดอายุ · ปลอมลายเซ็น · ร้านอื่น) ⇒ **ผลเดียวกันทุกไบต์** (ตัวโหลด `null` · ฟังก์ชันเขียน `{ ok:false, code:"NOT_FOUND", reason: <ข้อความเดียว> }` · หน้า `notFound()`)
- **ไม่มี PII บนหน้าสาธารณะ (X8)**: DTO ทุกตัวใน §3.2–§3.4 **ห้ามมีชื่อ/เบอร์ลูกค้า** (ข้อสอบ `JSON.stringify` + HTML/RSC จาก server) · ชื่อช่างแสดงได้ (`booking.display.tvShow.label = PROVIDER`) · `showCustomerName = true` **ไม่มีผล** (Q2) · ผลเช็กอินที่ตู้ไม่ทักชื่อ (ต่างจากภาพ 04ข โดยตั้งใจ — คนพิมพ์เบอร์คนอื่นได้)
- **นโยบายร้านทุกข้อผ่านทะเบียนค่าตั้ง**: อ่าน `resolveSettings({tenantId}, keys, { unitId, deviceId })` ต่อคำขอ (ไม่แคชข้ามคำขอ) — ค่าทีวี/ตู้ #52–58 + `booking.queue.walkInPickStaff` (#44 · UNIT→DEVICE) · ห้ามเก็บนโยบายใน `QueueDisplay.settings` (เก็บได้แค่ `{ kind }`) · ห้ามฮาร์ดโค้ดค่าแม่แบบใน tsx (S-6)
- **ทุกฟังก์ชันรับ `now` ฉีดได้** (`opts.now ?? new Date()`) ใช้นาฬิกาเดียวตลอด · เวลาไทยผ่าน `bkkDayOf`/`localToUtc` · ห้าม `.getDay()/.getHours()/.getMinutes()/.getDate()/.getMonth()/.getFullYear()` ดิบในไฟล์ใหม่ (S-7 · จอใช้ `Intl`/`toLocaleTimeString` + `timeZone: "Asia/Bangkok"`)
- **ขอบเขต (X1)**: ทุกคิวรีผูก `tenantId + unitId` ที่ได้จาก token/ctx · ทำงานเฉพาะหน่วย BOOKING ที่ `booking.queue.singleLine = true` (ไม่เปิด ⇒ เหมือน token ใช้ไม่ได้)
- **เขียนสถานะ = วินัย B.4/B.5** (CAS `updateMany where { id, tenantId, unitId, status }` · ทางที่เปลี่ยนลำดับแถว ⇒ `lockUnitTx` ก่อนแถวนัด · `replan` หลัง commit · ห้าม `.appointment.update(`/`.queueTicket.update(` ใน public-line.ts — S-8) · ข้อผิดพลาดคืน `{ ok:false, code, reason ไทยไม่โทษผู้ใช้ }` ไม่ throw
- **rate limit ด้วย `checkRateLimitDb` เท่านั้น** (ข้ามเครื่องได้ · ห้าม Map ในหน่วยความจำ) — นับทุกครั้งที่เรียก (สำเร็จหรือไม่) **ก่อน** ค้นฐาน · ใช้ `now` ที่ฉีด

## 3. สัญญา (ข้อสอบมีสำเนาชนิด — ชื่อ field ต้องตรง)

### 3.1 «devices.ts» — อุปกรณ์ = แถว `QueueDisplay` ของหน่วย BOOKING
```ts
export type DeviceKind = "TV" | "KIOSK";
export type BookingDevice = { id: string; unitId: string; kind: DeviceKind; name: string; createdAt: Date };   // ห้ามมี token/hash
export type DeviceCtx = { tenantId: string; unitId: string; actorUserId?: string };
export type DeviceFail = "NOT_FOUND" | "NOT_SINGLE_LINE" | "BAD_INPUT" | "DUPLICATE";
export async function createDevice(ctx: DeviceCtx, i: { kind: DeviceKind; name: string }): Promise<{ ok: true; device: BookingDevice; token: string } | { ok: false; code: DeviceFail; reason: string }>;
export async function listDevices(ctx: DeviceCtx): Promise<BookingDevice[]>;            // ยังไม่ถอน · เรียง createdAt, id
export async function rotateDeviceToken(ctx: DeviceCtx, deviceId: string): Promise<{ ok: true; token: string } | { ok: false; code: "NOT_FOUND"; reason: string }>;
export async function revokeDevice(ctx: DeviceCtx, deviceId: string): Promise<{ ok: true } | { ok: false; code: "NOT_FOUND"; reason: string }>;
export async function deviceByToken(token: unknown, kind: DeviceKind): Promise<{ tenantId: string; unitId: string; deviceId: string; name: string } | null>;
```
- **การเก็บ (ข้อสอบสร้างอุปกรณ์ทดสอบตรงตามนี้)**: token = `randomBytes(32).toString("base64url")` (43 ตัว) · `QueueDisplay { tenantId, unitId, name, displayToken: "sha256:" + sha256hex(token), settings: { kind }, revokedAt }` · token ดิบคืน **ครั้งเดียว** ตอน create/rotate (ไม่เก็บ ไม่ log)
- `deviceByToken`: ไม่ใช่สตริง 43 ตัว base64url ⇒ null ก่อนแตะฐาน · หา `displayToken = "sha256:"+hex` · `revokedAt` ไม่ null / `settings.kind ≠ kind` / หน่วยไม่ใช่ BOOKING แถวเดียว ⇒ null
- `createDevice`: ctx ข้ามร้าน/หน่วยไม่พบ ⇒ `NOT_FOUND` · หน่วยไม่เปิดแถวเดียว ⇒ `NOT_SINGLE_LINE` · kind ผิด / ชื่อว่าง / ยาว > 60 ⇒ `BAD_INPUT` · ชื่อซ้ำในหน่วย (รวมแถวที่ถอนแล้ว — `@@unique([unitId,name])`) ⇒ `DUPLICATE`
- `rotateDeviceToken` / `revokeDevice`: อุปกรณ์ต้องเป็นของ ctx และมี `settings.kind` (แถว QueueDisplay ของคิวเดิมไม่นับ) และยังไม่ถอน ⇒ ไม่งั้น `NOT_FOUND` · ถอน = `revokedAt = now` (ค่าตั้งชั้น DEVICE คงไว้)
- audit (`writeAudit`): `booking.device.created` · `booking.device.rotated` · `booking.device.revoked` (targetType `QueueDisplay` · targetId = id · after = `{ kind, name }` — **ห้ามมี token/hash**)

### 3.2 «public-line.ts» — ทีวี
```ts
export type TvChair = { seat: number; staffName: string | null; state: "BUSY" | "CALLING" | "FREE"; ticketNumber: string | null; nextTicketNumber: string | null };
export type TvNext = { ticketNumber: string; startMs: number | null; seat: number | null; staffName: string | null; booked: boolean };
export type TvView = {
  unitName: string; dayStr: string; nowMs: number;
  calling: { ticketNumber: string; seat: number | null; staffName: string | null; serviceName: string } | null;
  chairs: TvChair[]; next: TvNext[]; walkInWaitMin: number | null; voice: string[];
};
export async function loadTvView(token: unknown, opts?: { now?: Date }): Promise<TvView | null>;
```
- ข้อมูลมาจากแผนสดชุดเดียวกับจอแถวเดียว (B.5 `loadTodayLine` ณ now — คิดด้วยผู้ดูภายในที่ `view=true` หรือตัวช่วยอ่านแผนเดียวกัน) แล้ว**ตัดเหลือเลข/เวลา** · `seat` = ลำดับเก้าอี้แบบ B.5 (ช่าง active เรียง sortOrder, createdAt, id → 1…)
- `chairs` = ช่าง active ทุกคน: มีงาน IN_SERVICE ⇒ `BUSY` + `ticketNumber` ของงานนั้น · ไม่มีแต่มีงานที่บัตร CALLED วางที่ช่างนี้ ⇒ `CALLING` + เลขนั้น · อื่น ⇒ `FREE` (`ticketNumber` null) · `nextTicketNumber` = บัตร WAITING แรกในแถวที่แผนวางที่ช่างนี้ (ไม่มี = null)
- `calling` = บัตร CALLED ของงาน ARRIVED/QUEUED ที่ `calledAt` ล่าสุด (ไม่มี = null) · `next` = งานในแถว (ลำดับ `waiting` ของ B.5) ที่**มีบัตรสถานะ WAITING** ตัดที่ `booking.display.nextCount` · `booked` = งาน BOOKED · `startMs` = เวลาเริ่มตามแผน
- `staffName` ทุกที่ = ชื่อช่างเมื่อ `booking.display.tvShow.label = "PROVIDER"` · `"RESOURCE"` ⇒ `null` (เก้าอี้เป็นเลขอย่างเดียว · ทรัพยากรจริง = B.13)
- `walkInWaitMin` = ราคาเวลารอของ walk-in "ใครก็ได้" ของ**บริการแรก** (sortOrder, createdAt, id) ที่รับ walk-in (`booking.service.walkIn`) — คิดแบบ `quoteWalkIn` ณ now **อ่านอย่างเดียว** (ไม่ล็อก ไม่เขียน) · ปิดรับ/ไม่มีบริการ ⇒ null (ข้อสอบเทียบกับ `waitMin` ของ walk-in จริงที่ตู้ ณ เวลาเดียวกัน ±5 นาที)
- `voice` = ค่า #53 (ยังไม่มีเสียง — KT.1) · `dayStr` = วันไทยของ now · `unitName` = ชื่อหน่วย

### 3.3 «public-line.ts» — ตู้
```ts
export type KioskService = { id: string; name: string; durationMin: number; priceSatang: number; walkIn: boolean };
export type KioskView = {
  unitName: string; dayStr: string; nowMs: number;
  busyCount: number; seatCount: number; waitingCount: number; nextTicketNumber: string | null; walkInWaitMin: number | null;
  services: KioskService[]; staff: { id: string; name: string }[] | null;
  phone: "OPTIONAL" | "REQUIRED"; paperTicket: boolean; pinLock: boolean;
};
export type KioskTicket = { ticketNumber: string; serviceName: string; staffName: string | null; seat: number | null; plannedStartMs: number | null; waitMin: number | null; aheadCount: number; ticketUrl: string; lineLink: string | null };
export type KioskCheckedIn = KioskTicket & { bookedStartMs: number };
export type KioskFail = "NOT_FOUND" | "BAD_INPUT" | "RATE_LIMITED" | "BUSY";
export async function loadKioskView(token: unknown, opts?: { now?: Date }): Promise<KioskView | null>;
export async function kioskCheckIn(token: unknown, by: { phone: string } | { qr: string }, opts?: { now?: Date })
  : Promise<{ ok: true; ticket: KioskCheckedIn } | { ok: false; code: KioskFail | "NOT_TODAY" | "TOO_LATE" | "NOT_CONFIRMED" | "BAD_STATE" | "AMBIGUOUS"; reason: string }>;
export async function kioskWalkIn(token: unknown, i: { serviceId: string; staffId: string | null; phone?: string }, opts?: { now?: Date })
  : Promise<{ ok: true; ticket: KioskTicket } | { ok: false; code: KioskFail | "PHONE_REQUIRED" | "WALKIN_DISABLED" | "WALKIN_CLOSED"; reason: string }>;
export const KIOSK_RATE: { checkIn: { limit: 20; windowMs: 300000 }; walkIn: { limit: 30; windowMs: 600000 } };
```
- หน้าแรก: `busyCount` = ช่างที่มีงาน IN_SERVICE · `seatCount` = ช่าง active · `waitingCount` = ARRIVED+QUEUED (= KPI "รอในร้าน" ของ B.5) · `nextTicketNumber` = บัตรแรกในแถว (WAITING หรือ CALLED)
- `services` (#55 `booking.kiosk.services`): `WALKIN_ENABLED` ⇒ เฉพาะบริการ active ที่รับ walk-in ได้ (ตาม `booking.service.walkIn` ของบริการ — `enabled` และ `closeAtOrAboveMin`) ทั้งหมด `walkIn:true` · `ALL` ⇒ บริการ active ทั้งหมด (ที่รับ walk-in ไม่ได้ = `walkIn:false` · จอแสดง "จองล่วงหน้า" — ภาพ 04ค) · เรียง sortOrder, createdAt, id
- `staff` (#44 `booking.queue.walkInPickStaff` ชั้น UNIT→DEVICE): true ⇒ ช่าง active (`id`,`name`) · false ⇒ `null` · `phone` (#56) · `paperTicket` (#57) · `pinLock` (#58)
- `kioskCheckIn`: rate limit ก่อน (คีย์ `bq:kiosk:checkin:<deviceId>` ตาม `KIOSK_RATE.checkIn` · เกิน ⇒ `RATE_LIMITED`) → `checkIn(ctx, …, { via })` ของ B.4: `{phone}` ⇒ via `PHONE` · `{qr}` ⇒ via `QR` ด้วย `{ token }` — `qr` = token ตรง ๆ หรือ URL ที่มี token เป็น query `t`/`token` หรือ path ท้ายสุด · ผลของ B.4 ส่งต่อ (code เดิม) **ยกเว้น** `AMBIGUOUS` ⇒ คืนโดย **ไม่มี `candidates`** · `NOT_FOUND` ⇒ reason เดียวกับ token ใช้ไม่ได้ (ไม่บอกว่าเบอร์มีนัดไหม) · สำเร็จ ⇒ `KioskCheckedIn` ของบัตร P (ไม่มีชื่อ)
- `kioskWalkIn`: rate limit (`bq:kiosk:walkin:<deviceId>`) → `phone = REQUIRED` และไม่ส่ง/ว่าง ⇒ `PHONE_REQUIRED` → บริการไม่อยู่ใน `services` ของเครื่อง (หรือ `walkIn:false`) ⇒ `WALKIN_DISABLED` · ไม่พบ ⇒ `NOT_FOUND` → `staff = null` ⇒ ส่ง `staffId: null` เสมอ (ละค่าที่ส่งมา) → `createWalkIn(ctx, { serviceId, staffId, channel: "KIOSK", customerPhone? }, { now })` ของ B.4 → `KioskTicket`
- `KioskTicket`: `aheadCount` = จำนวนงานในแถว (ลำดับ B.5) ก่อนบัตรนี้ (ไม่นับงานที่กำลังทำ) · `ticketUrl` = `"/bq/t/" + ticketToken(...)` ของบัตรนั้น · `lineLink` = `issueLinkCode({ tenantId }, { purpose: "QUEUE_TICKET", refId: <ticketId>, ttlMin: นาทีถึงสิ้นวันไทย (1–43200), connectionId: <messaging.lineConnectionId ของหน่วย> })` ⇒ `deepLink` เมื่อได้ (OA มี basicId) · ไม่ได้/ไม่ตั้ง ⇒ `null` (จอใช้ `ticketUrl` ทำ QR แทน) · ผูกจริงเมื่อลูกค้าส่งรหัส = B.9

### 3.4 «public-line.ts» — หน้าบัตรลูกค้า
```ts
export function ticketToken(t: { tenantId: string; unitId: string; businessDate: string; number: string }): string;
export async function ticketTokenFor(ctx: { tenantId: string; unitId: string }, ticketId: string): Promise<string | null>;
export type TicketAhead = { kind: "NOW" | "WAIT" | "BOOKED" | "ME"; ticketNumber: string | null; startMs: number | null; seat: number | null };
export type TicketView = {
  unitName: string; ticketNumber: string; status: "WAITING" | "CALLED" | "SERVING" | "DONE" | "SKIPPED" | "CANCELLED" | "NO_SHOW";
  kind: "BOOKED" | "WALKIN"; serviceName: string; staffName: string | null; seat: number | null;
  issuedAtMs: number; bookedStartMs: number | null; plannedStartMs: number | null; returnByMs: number | null;
  aheadCount: number | null; ahead: TicketAhead[]; canDefer: boolean; canCancel: boolean;
};
export async function loadTicketView(token: unknown, opts?: { now?: Date }): Promise<TicketView | null>;
export type TicketOpFail = "NOT_FOUND" | "BAD_STATE" | "LOST_RACE" | "BUSY" | "RATE_LIMITED";
export async function deferTicket(token: unknown, opts?: { now?: Date }): Promise<{ ok: true } | { ok: false; code: TicketOpFail; reason: string }>;
export async function cancelTicket(token: unknown, opts?: { now?: Date }): Promise<{ ok: true } | { ok: false; code: TicketOpFail; reason: string }>;
export const TICKET_RATE: { limit: 10; windowMs: 600000 };
```
- **token (ไม่เก็บในฐาน · กำหนดแน่นอน — ฉากภาพคิดเองได้)**: `P = base64url("v1|" + tenantId + "|" + unitId + "|" + businessDate + "|" + number)` · `S = base64url(HMAC-SHA256(key = "booking-ticket:v1:" + SESSION_SECRET, P))` · token = `P + "." + S` · ตรวจ: รูป 2 ส่วน → ลายเซ็น timing-safe + รูปเดียว (canonical) → บัตร `(tenantId, unitId, businessDate, number)` มีจริง `refType = "APPOINTMENT"` และหน่วยแถวเดียว → **อายุ: `businessDate` = วันไทยของ now หรือเมื่อวาน** (อื่น ⇒ ใช้ไม่ได้) · ไม่มี `SESSION_SECRET` ⇒ ใช้ไม่ได้ (ไม่ throw)
- `ticketTokenFor`: บัตรของ ctx ที่ `refType APPOINTMENT` ⇒ token · อื่น ⇒ null
- `TicketView`: `status` = สถานะบัตร · `kind`/`serviceName`/`staffName`/`seat` จากงาน (ช่างตามแผน `plannedStaffId ?? staffId` · กติกาชื่อช่างเดียวกับทีวีชั้น UNIT) · `issuedAtMs` = ออกบัตร · `bookedStartMs` = นัด (walk-in null) · บัตร WAITING/CALLED: `plannedStartMs` = แผนสด · `returnByMs` = plannedStart − 5 นาที · `ahead` = [งาน IN_SERVICE ของช่างตามแผนของฉัน (`NOW` ถ้ามี)] + งานในแถว**ก่อนฉัน** (มีบัตร ⇒ `WAIT` + เลข · นัดที่ยังไม่มา ⇒ `BOOKED` + `ticketNumber: null` = "คิวนัดหมาย") + `ME` · `aheadCount` = จำนวน `WAIT`+`BOOKED` · บัตรสถานะอื่น ⇒ `plannedStartMs/returnByMs/aheadCount` null · `ahead` []
- `canDefer` = งาน WALKIN สถานะ QUEUED · บัตร WAITING · มี walk-in อื่น (QUEUED · บัตร WAITING/CALLED) อยู่**หลัง**ในแถว · `canCancel` = งาน WALKIN QUEUED · บัตร WAITING/CALLED (นัด = ใช้ลิงก์จัดการนัดของ B.7)
- `deferTicket` ("ขอเลื่อนไปคิวหลัง" = ถอย 1 คิว): rate limit (`bq:ticket:<tenantId>:<unitId>:<date>:<number>` ตาม `TICKET_RATE`) → token ใช้ไม่ได้ ⇒ `NOT_FOUND` → ใต้ `lockUnitTx` + แถวนัด: ไม่ตรง `canDefer` ⇒ `BAD_STATE` → walk-in ที่อยู่ถัดหลังฉัน (ลำดับ `checkedInAt, id` ของ walk-in QUEUED บัตรไม่ SKIPPED ของวัน) = X ⇒ CAS `checkedInAt = X.checkedInAt + 1 ms` + `QueueTicketEvent { action: "DEFERRED", actorType: "CUSTOMER" }` ใน tx เดียว → `replan` หลัง commit (ข้อสอบ: ลำดับแถวของ B.5 สลับ)
- `cancelTicket`: rate limit (ถังเดียวกัน) → `NOT_FOUND` → ไม่ตรง `canCancel` ⇒ `BAD_STATE` → CAS งาน QUEUED → CANCELLED + บัตร → CANCELLED (`cancelReason "CUSTOMER"` · QueueTicketEvent actor CUSTOMER) + outbox `booking.cancelled` (คีย์ `booking.cancelled#<appointmentId>` เดียวกับร้านยกเลิก · payload ตามแบบ `evPayload` ของ B.4 + `reason: "CUSTOMER"` · ไม่มีชื่อ/เบอร์) ใน tx เดียว → `replan`

### 3.5 server actions
- «src/lib/actions/booking-public.ts» (`"use server"` · export async function เท่านั้น · **ไม่มี** requireUnit/session — token คือสิทธิ์): `kioskCheckInAction(deviceToken, prev, formData)` · `kioskWalkInAction(deviceToken, prev, formData)` (คืนผลของ facade ให้คอมโพเนนต์ client แสดง — ใช้กับ `useActionState`) · `deferTicketAction(ticketToken, formData)` · `cancelTicketAction(ticketToken, formData)` (เสร็จ ⇒ `redirect("/bq/t/<token>")` · ล้ม ⇒ `?err=<reason ≤ 200>`) · ฟิลด์: `phone` `qr` `serviceId` `staffId` (`""` = ใครก็ได้) · **นาฬิกา QC**: อ่าน `at` จากฟอร์มเฉพาะ `process.env.SVC_QC_CLOCK === "1"` (S-3)
- «src/lib/actions/booking-devices.ts» (`"use server"`): `createDeviceAction(unitSlug, prev, formData)` ⇒ `{ ok: true; deviceId; url } | { ok: false; reason }` (`url` = `/bq/tv/<token>` หรือ `/bq/kiosk/<token>` — แสดงครั้งเดียว) · `rotateDeviceTokenAction(unitSlug, prev, formData)` (เหมือนกัน) · `revokeDeviceAction(unitSlug, formData)` · ทุกตัว: `requireUnit(unitSlug)` → `assertCan`/`evaluate` `{ module: "booking", action: "booking.devices.manage", unitId }` → facade ด้วย ctx `{ tenantId, unitId, actorUserId }` (S-4 ไล่ลำดับ)

### 3.6 core-fix: ชั้น DEVICE ในเครื่องยนต์ค่าตั้ง (`src/lib/core/settings/service.ts` · Q1)
- `SUPPORTED_SCOPES` + `"DEVICE"` · `locateMany`: DEVICE = `queueDisplay` `{ tenantId: T, id ∈ ids }` (ไม่ต้องสนใจ `settings.kind`/revokedAt) ⇒ `{ unitId: r.unitId, known: { TENANT, UNIT: r.unitId, DEVICE: r.id } }` · `entitiesOfUnit` + อุปกรณ์ของหน่วย (`revokedAt: null`) เป็น `{ scope: "DEVICE" }` · **เพิ่มบรรทัดเท่านั้น** (ข้อสอบ S-9: ไม่มีบรรทัดถูกลบ · บรรทัดเพิ่มทุกบรรทัดเกี่ยว DEVICE/queueDisplay) · ผล: `setSettings` ชั้น DEVICE ได้ (ด่านสิทธิ์/zod/สาขาเดิม) · อุปกรณ์ร้านอื่น/สาขาที่เข้าไม่ได้ ⇒ `NOT_FOUND` · `loadSettingsForm(…, { scope: "DEVICE", scopeId })` ได้ฟอร์ม (ช่อง `booking.display.*` `booking.kiosk.*` `booking.queue.walkInPickStaff`)

### 3.7 ปิดทางสาธารณะเดิมของหน่วยแถวเดียว (CC §6.1 · Q4)
- (ก) `getTicketStatus(unitId, publicToken)`: บัตร `refType = "APPOINTMENT"` ⇒ `null` (หน้าบัตรของแถวเดียวคือ `/bq/t` ที่ token แข็งแรง — `publicToken` เดิมเป็น cuid) · บัตรหน่วย QUEUE ผลเดิม
- (ข) `getDisplaySnapshot(unitId, displayToken)`: แถวที่มี `settings.kind` (อุปกรณ์ B.6) ⇒ `null` (ส่ง hash ที่เก็บไว้เป็น token ต้องเปิดไม่ได้)
- (ค) `createDisplayAction` / `revokeDisplayAction` ใน `queue/actions.ts` ใช้ `ticketCtxOf` (หน่วยที่ไม่ใช่ QUEUE ⇒ `notFound()`) — อุปกรณ์ของหน่วย BOOKING จัดการที่ `/booking/devices` เท่านั้น

## 4. สัญญา DOM (ข้อสอบ U/H · default export · คอมโพเนนต์ **ห้าม import ค่า** จาก `@/lib/modules/**`/`@/lib/core/db`/`@prisma/client` — `import type` ได้)
- **TvBoard** `{ view: TvView }`: ราก `data-tv-board` · กำลังเรียก `data-tv-calling` + `data-ticket="<เลข>"` (ไม่มีเมื่อ `calling` null) · เก้าอี้ `data-tv-chair="<seat>"` + `data-state="BUSY|CALLING|FREE"` (ลำดับ = view.chairs) · คิวถัดไป `data-tv-next="<เลข>"` (ลำดับ = view.next) · เวลารอ `data-tv-wait` · ไม่มีปุ่ม/ฟอร์ม
- **Kiosk** (`'use client'`) `{ view: KioskView; actions: { checkIn: (prev, fd) => Promise<unknown>; walkIn: (prev, fd) => Promise<unknown> }; at?: string; initial?: { screen: "home" | "checkin" | "walkin" } | { screen: "ticket"; ticket: KioskTicket } | { screen: "checkedIn"; ticket: KioskCheckedIn } }` (ไม่ส่ง `initial` = home):
  - ราก `data-kiosk` · home `data-kiosk-home` + ปุ่ม `data-kiosk-go="checkin"` / `data-kiosk-go="walkin"` · ลิงก์ออก `data-kiosk-exit` **มีเฉพาะ `pinLock = false`**
  - checkin `<form data-kiosk-checkin-form>` มี `input[name=phone]` + `input[name=qr]` · walkin `<form data-kiosk-walkin-form>`: บริการ `walkIn:true` = `<input type="radio" name="serviceId" value="<id>">` · `walkIn:false` = `data-kiosk-bookonly="<id>"` (ไม่มี input) · `view.staff` ไม่ null ⇒ `name="staffId"` (radio/select · มีตัวเลือก `value=""` = ใครก็ได้) · null ⇒ ไม่มี `staffId` · `input[name=phone]` มี `required` **เฉพาะ** `phone = REQUIRED`
  - ticket `data-kiosk-ticket="<เลข>"` + QR `data-kiosk-qr` ที่มี `data-href` = `lineLink ?? ticketUrl` + ปุ่มพิมพ์ `data-kiosk-print` **เฉพาะ `paperTicket`** · checkedIn `data-kiosk-checkedin="<เลข>"`
  - `at` prop ⇒ **ทุกฟอร์ม** มี `<input type="hidden" name="at" value="<at>">` · ไม่ส่ง ⇒ ห้ามมี
- **TicketCard** `{ view: TicketView; token: string; actions: { defer: (fd) => Promise<void>; cancel: (fd) => Promise<void> }; at?: string }`: ราก `data-ticket-card` + `data-ticket="<เลข>"` · รายการ `data-ticket-ahead="<kind>"` ลำดับ = view.ahead (มี `data-ticket` เมื่อมีเลข) · ปุ่ม `<form action={actions.defer}>` ที่มี `button[data-ticket-defer]` **เฉพาะ canDefer** · `button[data-ticket-cancel]` (ConfirmDialog ได้) **เฉพาะ canCancel** · `at` ตามกติกาเดียวกับตู้
- **DevicesPanel** `{ unitSlug: string; devices: BookingDevice[]; actions: { create; rotate; revoke } }`: ราก `data-bq-devices` · แถว `data-bq-device="<id>"` + `data-kind` · ฟอร์มสร้าง `data-bq-device-create` (`select[name=kind]` TV/KIOSK + `input[name=name]`) · ถอน `data-bq-device-revoke="<id>"` (มี hidden `deviceId`) · HTML ห้ามมี token/`sha256:`
- หน้าตาเทียบภาพ: 04 = แท็บเล็ตแนวนอน ปุ่มใหญ่ 2 ปุ่ม (≥ 44 px) + แถบสถานะล่าง · ขั้นเลือกบริการ 2 คอลัมน์ + ชิปช่าง · บัตร A ใหญ่ + QR · 05 = พื้นเข้ม เลขใหญ่ "เชิญหมายเลข" + เก้าอี้ 4 ช่อง + คิวถัดไปพร้อมเวลา + เวลารอ walk-in · 06ก = มือถือ 390: บัตรดำเลขใหญ่ + "ประมาณ HH:MM · ช่าง…" + แถบตำแหน่ง + รายการข้างหน้า + ปุ่ม "ขอเลื่อนไปคิวหลัง" / "ยกเลิกบัตร"

## 5. หน้า
- `/bq/tv/[token]`: `loadTvView` → null ⇒ `notFound()` · `<AutoRefresh ms={5000} />` (ตัวเดิม) + `<TvBoard>` · `/bq/kiosk/[token]`: `loadKioskView` → null ⇒ `notFound()` · `<AutoRefresh />` **เฉพาะหน้า home** (ห้ามรีเฟรชทับระหว่างกรอก — ใส่ใน Kiosk เองได้) · `/bq/t/[token]`: `loadTicketView` → null ⇒ `notFound()` · AutoRefresh เมื่อบัตร active
- ทั้ง 3 หน้า: `export const dynamic = "force-dynamic"` · `metadata` = `{ robots: { index: false, follow: false }, referrer: "no-referrer" }` (token อยู่ใน path) · `?at=` อ่านเฉพาะ `SVC_QC_CLOCK === "1"` (S-5)
- `/app/u/[unitSlug]/booking/devices`: `requireUnit` → ไม่มี `booking.devices.manage` ⇒ `notFound()` · หน่วยไม่เปิดแถวเดียว ⇒ แสดงข้อความ "เปิดโหมดคิวแถวเดียวก่อน" · `listDevices` → `<DevicesPanel>` + ต่ออุปกรณ์ `<SettingsForm>` ของ `loadSettingsForm(actor, { tenantId }, { domains: ["booking"], unitId, scope: "DEVICE", scopeId: <id> })` ในกล่อง `data-bq-device-settings="<id>"` (กฎ §1.3 ข้อ 16 — ห้ามวาดช่องค่าตั้งเอง)

## 6. ฉากภาพ «scripts/svc-qc-device-scene.mts» (builder · แบบ `svc-qc-today-line-scene.mts`)
- ด่าน `loadSvcQcEnv` · อ่านจาก `SQC_DEVICE_SCENE` + `SQC_TODAY_LINE_SCENE` + `SQC` เท่านั้น · ร้าน svcqc หน่วย barber · **วันฉาก = `sqcDeviceSceneDay`** (= วันฉาก B.5 + 7 — คนละวันกับฉาก B.5 · ไม่ชน)
- ทำ: แม่แบบ BARBER (KEEP_CUSTOM) → นัด `SQC_TODAY_LINE_SCENE.bookings` (`idempotencyKey = "svcqc-dev-<วันฉาก>-<key>"`) → `events` ตามด้วย `SQC_DEVICE_SCENE.extraEvents` (op `call` = `callJob`) ตามเวลา (now ฉีด · tick ส่ง `tenantIds:[svcqc]`) → runPlanner ณ `SQC_DEVICE_SCENE.at` → อุปกรณ์ 2 เครื่องตาม `SQC_DEVICE_SCENE.devices` (id/ชื่อ/token ตายตัว · เก็บตาม §3.1) → ค่าตั้งชั้น DEVICE ของตู้ตาม `devices.kiosk.overrides` ผ่าน `setSettings` ในนามเจ้าของ (ให้ตรงภาพ 04: ทุกบริการ + ปุ่มพิมพ์)
- idempotent: ครบแล้ว ⇒ 0/0/0 · วันฉากเปลี่ยน/ไม่ครบ ⇒ ลบงาน+บัตร+ลำดับเลขบัตรของงานฉาก (prefix `svcqc-dev-`) แล้วสร้างใหม่ · `--clear` ลบงานฉาก + อุปกรณ์ฉาก + ค่าตั้ง DEVICE ของอุปกรณ์ฉาก · บรรทัดท้าย `SCENE_SUMMARY {"created":n,"updated":n,"removed":n}`
- ภาพ (ผู้คุม): reseed → ฉาก → QC server `SVC_QC_CLOCK=1` → `visual-svc b.6 --user owner` → PARITY: `kiosk-home` ↔ 04 (ส่วน ก) · `tv-display` ↔ 05 · `ticket-card` ↔ 06 (ส่วน ก)

## 7. จุดที่แบบไม่ชัด — ผู้เขียนข้อสอบเลือกแล้ว (ผู้คุมเคาะได้ · เปลี่ยน = ORACLE-EDIT)
1. **URL ไม่มี slug** (`/bq/...`) — เดาไม่ได้ทั้งเส้น · ร้านแยกด้วย token อย่างเดียว · หน้าคิวเดิม `/s/<t>/<u>/queue/*` ไม่ใช้กับแถวเดียว (§3.7)
2. **อุปกรณ์ = `QueueDisplay` เดิม** (ไม่มี migration) · token เก็บเป็น `sha256:` · `settings` เก็บแค่ `kind` · นโยบายรายเครื่องอยู่ในทะเบียนค่าตั้งชั้น DEVICE (ต้อง core-fix §3.6)
3. **token หน้าบัตร = HMAC กำหนดแน่นอน** (ไม่เก็บ · ไม่หมุน) อายุถึงสิ้นวันถัดไป — ลิงก์ใน LINE (B.9) ใช้ตัวเดียวกัน · ฉากภาพคำนวณได้
4. **ไม่มีชื่อลูกค้าบนหน้าสาธารณะเลย** — ทีวีไม่สน `showCustomerName` (Q2) · ตู้เช็กอินไม่ทักชื่อ/ไม่บอกแต้มสมาชิก (ภาพ 04ข มีชื่อ+แต้ม — ตัดโดยตั้งใจ · แต้ม = งานสมาชิกภายหลัง) · AMBIGUOUS ไม่บอกเวลานัด
5. **#55 `ALL`** = แสดงทุกบริการ แต่ที่ปิด walk-in เป็น "จองล่วงหน้า" (กดรับบัตรไม่ได้ — `createWalkIn` ปฏิเสธอยู่แล้ว) · ฉากภาพตั้งตู้เป็น ALL เพื่อให้ตรงภาพ 04ค
6. **#58 `pinLock`** = true ⇒ หน้าไม่มีทางออกไปแอป (ไม่มี `data-kiosk-exit`) · การใส่ PIN ปลดล็อก + โหมดล็อกเครื่อง = KT.1 (Q3) · **#57** = ปุ่มพิมพ์ของเบราว์เซอร์ (`window.print`) · เครื่องพิมพ์ความร้อน = KT.1 · **#53** = ค่าผ่าน DTO เท่านั้น (เสียง = KT.1)
7. **ขอเลื่อนไปคิวหลัง = ถอย 1 คิว** (สลับกับ walk-in คนถัดไป) — เฉพาะ walk-in · ยกเลิกบัตร = เฉพาะ walk-in (นัดยกเลิกผ่านลิงก์จัดการนัด B.7 ตามกติกามัดจำ)
8. **เวลารอ walk-in บนทีวี/ตู้** = บริการ walk-in แรกของร้าน ใครก็ได้ (ภาพ "~50 นาที" / "รอประมาณ 1 ชม.")
9. **rate limit** เป็นค่าคงที่ความปลอดภัย (ไม่ใช่นโยบายร้าน): ตู้เช็กอิน 20/5 นาที/เครื่อง · ตู้ออกบัตร 30/10 นาที/เครื่อง · ปุ่มหน้าบัตร 10/10 นาที/บัตร
10. **ฉากภาพ = 14:40** (ตรงภาพ 05) — ภาพ 06ก เป็น 14:50 ⇒ ตัวเลข "ข้างหน้า N คิว" ต่างจากภาพโดยตั้งใจ (PARITY ดูหน้าตา) · ภาพ 04 ถ่ายเฉพาะหน้าแรก (ขั้นอื่นตรวจด้วย U)
11. QR ตู้ = ลิงก์เปิดแชท OA พร้อมรหัส (`issueLinkCode` QUEUE_TICKET) เมื่อสาขาตั้ง `messaging.lineConnectionId` และ OA มี basicId · ไม่งั้น QR = หน้าบัตร

## 8. เกณฑ์รับ
- «scripts/qc-svc-b.6.mts» เขียวทุกข้อ — หมวด **T/F** แม่แบบ + ฉาก 14:40 · **PC** ตัวควบคุม (เขียวก่อนมีงาน) · **D** core-fix DEVICE · **M** อุปกรณ์ · **TV** · **K** ตู้ (มุมมอง · เช็กอิน · walk-in · ค่าตั้งรายเครื่อง · rate limit) · **C** หน้าบัตร (token · มุมมอง · เลื่อน · ยกเลิก · rate limit) · **L** ทางเดิม · **U** DOM · **H** server จริง · **S** ไฟล์/สัญญาโค้ด · **Q** ฉาก svcqc · **V** ภาพ · **G** regression · **Z**
- regression (G · รันหลังล้างข้อมูล): `qc-svc-b.5 --no-regression` · `qc-svc-b.4 --no-regression` · `qc-svc-b.11 --no-regression` (S-8 ของ B.11 ไล่ไฟล์ service.ts ⇒ ยอมให้แดงข้อเดียวนี้ระหว่างที่ core-fix ยังไม่ commit — Q1) · `qc-queue-public` (แตะ queue/service) · `qc-svc-smoke`
- typecheck + fitness 2 โหมด (ผู้คุม) · ตรวจรอบเดียว (ดู Q5) · build QC + ภาพ 3 ใบ (PARITY 04/05/06ก)

## 9. ไม่ใช่เรื่องของใบนี้ / หนี้ส่งต่อ
- KT.1: SSE · เสียงเรียก · เครื่องพิมพ์ความร้อน · PIN ปลดล็อกตู้ · กล้องสแกน QR ในหน้าเว็บ (ตอนนี้ใช้เครื่องอ่านที่พิมพ์ข้อความลงช่อง `qr` ได้)
- B.9: ผูก LINE จากรหัส (`consumeLinkCode` QUEUE_TICKET) · ส่งลิงก์หน้าบัตรใน LINE · ปุ่ม "เช็กอิน" ใน LINE · "ยังไม่พร้อม · เลื่อนไปคิวหลัง" ใน LINE (เรียก `deferTicket` ตัวเดียวกัน)
- B.7: ลิงก์ "ขอวันอื่นแทน · จองล่วงหน้า" บนตู้ (ใช้หน้าจองสาธารณะเดิมไปก่อน) · ยกเลิกนัดโดยลูกค้า
- รับบัตรจากมือถือโดยไม่มาร้าน (#42 `booking.queue.remoteTicket` · ช่อง REMOTE) — ยังไม่มีใบเจ้าของในแผน (ผู้คุมเคาะว่าอยู่ B.9 หรือใบใหม่)
- ตัวเลือกช่างพร้อมเวลาเทียบ ("อยากได้ช่างบอย ~15:30" ภาพ 04ง) — ไม่บังคับในใบนี้

## มติผู้คุม (29 ต.ค.) — ตอบคำถาม Q1–Q6
- Q1: core-fix ชั้น DEVICE อยู่ใน B.6 · แก้ settings/service.ts แบบเพิ่มเท่านั้น (S-9 ตรวจ) · b.11 S-8 แดงใน G-3 ได้เฉพาะก่อน commit
- Q2: ทีวีไม่แสดงชื่อลูกค้าเด็ดขาด · `booking.display.tvShow.showCustomerName` ไม่มีผล และซ่อนจากหน้าตั้งค่า
- Q3: pinLock = ไม่มีทางออกไปแอป · PIN ปลดล็อก = หนี้ KT.1
- Q4: ปิดทางสาธารณะเดิมของหน่วยแถวเดียวตาม §3.7 · จดหนี้แก้ถ้อยคำ CC §6.1 ตอนปิดเฟส (B.18)
- Q5: B.6 เปลี่ยนเป็น **เข้ม** (ลิงก์สาธารณะ/token ข้ามร้าน) ⇒ ผู้ตรวจ 2 คน
- Q6: remoteTicket (#42) ย้ายไป B.9

# ใบสั่ง B.7 — จองออนไลน์ใหม่ + ลิงก์จัดการนัด (ภาพ จอง 03) · ตรวจ: **เข้ม** (ทางสาธารณะ · กันจองซ้อน · ข้ามร้าน · PII) · ห้ามตัด: แยกร้าน (X1) · กันจองซ้อนข้ามโพรเซส (X3) · token ผิด = คำตอบเดียว (X7) · rate limit ข้ามเครื่อง · ไม่มีชื่อ/เบอร์บนหน้าสาธารณะ (X8) · UI ตรงแบบ

> อ้างอิง: MASTER-PLAN แถว B.7 · `DESIGN-BOOKING-QUEUE.md` R3 · §7 (ลิงก์จัดการนัด = token ≥128 บิต · หมดอายุหลังนัด 7 วัน) · ภาคผนวก ก #4 #10 #16 #19–26 #27–31 #33–36 · ภาพ `ledger/design-booking/03-online-booking.png` (+ `.body.html`) + README (คุณแพรว ดัดผม ช่างนุ่น 15:30 มัดจำ ฿300) · CC §1.6 (snapshot ชนะค่าตั้งใหม่) §4.5 (`signLink`) §6.1 · ใบ B.3 (`bookAppointment`/`findSlots` · ลำดับล็อก key → เบอร์ → ช่าง) · ใบ B.4 (`rescheduleByShop` · `lockUnitTx` → `lockAppt` · CAS) · ใบ B.6 (บทเรียน: token HMAC · คำตอบเดียวทุกกรณีเสีย · rate limit `checkRateLimitDb` นับก่อนค้นฐาน · ไม่มี PII · action สาธารณะอยู่ใต้ `src/app/(store)/…` เพราะ fitness F6 · F5 ห้ามเพิ่มไฟล์ prisma ดิบในโมดูล) · `/root/svc-runs/fix/b3.md` (หนี้ "createAppointment รุ่นแรกคืน id ข้ามสาขา (B.7 สลับ route)")
> ข้อสอบ (ห้ามแก้): «scripts/qc-svc-b.7.mts» — รับใบ = **ผ่านทุกข้อ** (นับจาก `JSON_SUMMARY`) · SKIP ที่ยอมได้ระหว่างทำ: `H-*` `V-*` (ไม่มี QC_BASE) · `Q-*` (svcqc ยังไม่ seed) · `G-*` (`--no-regression`) — ผู้คุมรันครบก่อนรับ
> รัน: `bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-b.7.mts [--no-regression]` (ห้าม `timeout` ครอบ · ห้าม kill กลางคัน — ล้างข้อมูลอยู่ใน finally · ล็อกหมดเวลา = รันซ้ำ)
> builder: **ห้าม build/next · ห้าม commit/push · ห้าม `pnpm install` · ห้าม migration/แตะ `prisma/**` · ห้ามแก้ข้อสอบ/`scripts/svc-qc-data.mts`/สคริปต์อื่นใน `scripts/`** (ยกเว้นไฟล์ฉากใหม่ §7) · temp ขึ้นต้น `svc-b7-` · รายงานต่อข้อ (id → ผล)
> ผู้คุมแก้ให้แล้วในใบนี้ (builder ห้ามแตะ): `scripts/svc-qc-data.mts` บล็อก B.7 ท้ายไฟล์ (`SQC_ONLINE_SCENE` · `sqcOnlineSceneDay` · `sqcIdentityToken` · `sqcManageToken` · `SQC_VISUAL_SPECS["b.7"]`)
> **ไม่มี migration** — คอลัมน์ที่ใช้มีครบจาก B.0 (`Appointment.manageTokenHash @unique` · `rescheduleCount` · `cancelReason` · `channel` · `policySnapshot` · `partyId`) · **ไม่มีคีย์ค่าตั้งใหม่** — นโยบายร้านทุกข้ออ่านจากทะเบียนเดิม (§2) · **ไม่มี event ใหม่** (ใช้ `booking.created/rescheduled/cancelled` ที่ลง 3 ทะเบียนแล้วใน B.4)

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ (แตะนอกนี้ = ตีกลับ · ข้อสอบ S-1 ไล่ `git status` ของ src/ prisma/)
| ไฟล์ | ทำอะไร |
|---|---|
| «src/lib/modules/booking/manage-token.ts» (ใหม่ · pure ไม่มี prisma) | §3.1 `manageToken` · `manageTokenHash` (ใช้ทั้ง service.ts และ online.ts — กันวงโหลด) |
| «src/lib/modules/booking/online.ts» (ใหม่ · **ห้าม import `prisma` ดิบ** — F5 baseline 50 ห้ามเพิ่ม · ใช้ `tenantDb` หลังรู้ร้าน · หา token ผ่านตัวช่วยใน service.ts) | §3.2–§3.6 หน้าจอง · จอง · ลิงก์จัดการนัด · เลื่อน · ยกเลิก · .ics · ลิงก์ตัวตน LINE · rate limit |
| `src/lib/modules/booking/service.ts` | **เพิ่มเท่านั้น** (§3.7): `bookAppointment` ช่อง SELF เขียน `manageTokenHash` + ยิง `booking.created` ใน tx เดียว + `partyId` ที่ยืนยันแล้ว · `findSlots` รับ opt `{ now?, excludeAppointmentId? }` · `rescheduleBySelf` (กติกาเดียวกับ bookAppointment) · ตัวหาแถวจาก hash (`appointmentByManageHash`) · ตัวช่วยตรวจกติกาที่ต้อง export เพิ่ม |
| `src/lib/modules/booking/index.ts` | re-export ได้ |
| `src/lib/modules/booking/public-line.ts` · `src/components/booking/public/Kiosk.tsx` | **หนี้ B.6 §9 เท่านั้น**: `KioskView.bookUrl` + QR "จองวันอื่นล่วงหน้า" (§3.8) — เพิ่มบรรทัดเท่านั้น |
| `src/app/api/store/[tenantSlug]/[unitSlug]/book/route.ts` | เขียนใหม่ → `bookOnline` (เลิก `createAppointment` + `checkRateLimit` ในหน่วยความจำ) |
| `src/app/api/store/[tenantSlug]/[unitSlug]/slots/route.ts` | เขียนใหม่ → `findSlots(channel ONLINE)` + `checkRateLimitDb` (เลิก `getAvailableSlots`) |
| `src/app/(store)/s/[tenantSlug]/[unitSlug]/page.tsx` | ทาง BOOKING เท่านั้น: `loadOnlineBooking` → `<PublicBooking>` (ทางเด้งประเภทอื่นคงเดิมทุกไบต์) |
| `src/components/public-booking.tsx` (เขียนใหม่ · **default export** `PublicBooking` · `'use client'`) + ไฟล์ย่อยใต้ «src/components/booking/online/» | §4 3 ขั้นตามภาพ 03 |
| «src/components/booking/online/ManageCard.tsx» (ใหม่ · default export) | §4 หน้าจัดการนัด |
| «src/app/(store)/bq/m/[token]/page.tsx» · «…/bq/m/[token]/ics/route.ts» · «…/bq/m/actions.ts» (ใหม่) | §5 หน้าจัดการนัด · ไฟล์ .ics · server actions สาธารณะ (token = สิทธิ์ · ใต้ app/(store) ตามบทเรียน B.6 F6) |
| `src/lib/i18n/dict.ts` | **เพิ่มคีย์เท่านั้น** (th/en คู่กันทุกคีย์) |
| «scripts/svc-qc-online-scene.mts» (ใหม่) | §7 ฉากภาพบน svcqc |

ห้ามแตะ: `planner.ts` · `planner-run.ts` · `queue-line.ts` · `today-line.ts` · `line-ops.ts` · `devices.ts` · `settings-model.ts` · `src/lib/core/**` (รวม settings/defs — ไม่มีคีย์ใหม่) · `permissions.ts` · 3 ทะเบียน event (`outbox-consumers.ts` · `automation/labels.ts` · `webhooks/labels.ts` — ป้าย "เมื่อร้านเลื่อนนัด" ที่ตอนนี้รวมลูกค้าเลื่อนด้วย = หนี้ B.18) · `src/lib/platform/**` (ข้อความยืนยัน/เตือน = B.9) · `src/lib/actions/**` (F6)

## 2. หลักการ (ข้อสอบตรวจทุกข้อ)
- **นโยบายร้านทุกข้ออ่านจากทะเบียนค่าตั้ง ต่อคำขอ (ไม่แคช)** — จองล่วงหน้าได้กี่วัน `booking.booking.horizonDays` · ต้องจองก่อน `minLeadMin` · ช่องทุก `slotStepMin` · มี "ใครก็ได้" `anyStaffOption` · ร้านต้องยืนยัน `requireConfirm` · ข้อมูลขอเพิ่ม `extraFields` · ภาษาที่ลูกค้าเลือกได้ `booking.general.customerLocales` · ลูกค้าเลือกชื่อช่างได้ `booking.staff.customerCanChoose` (STAFF) · % ออนไลน์ `onlineSharePct` (STAFF) · มัดจำ `booking.deposit.*` · ผ่อนผัน `booking.late.graceMin`/`afterGrace` · **เลื่อน/ยกเลิกฟรีก่อน `booking.late.freeChangeBeforeMin`** · **เลื่อนเองได้สูงสุด `booking.late.selfRescheduleMax`** — ห้ามฮาร์ดโค้ดค่าแม่แบบใน tsx/ts ใหม่ (S-8)
- **กติกาของนัดที่จองแล้ว = `policySnapshot`** (CC §1.6): ยกเลิก/เลื่อนฟรีถึง `startAt − freeChangeBeforeMin(snapshot)` · เลื่อนได้ `selfRescheduleMax(snapshot)` ครั้ง · ผ่อนผัน/มัดจำที่แสดงในหน้าจัดการนัด = ค่าจาก snapshot · ค่าหายใน snapshot (แถวเก่า) ⇒ resolver ปัจจุบัน · **เวลาใหม่ตอนเลื่อน** ตรวจด้วยกติกาจองปัจจุบัน (horizon · lead · ช่อง · % ออนไลน์ · ชน) เหมือนจองใหม่
- **กันจองซ้อน = ของ B.3 ทั้งหมด** (ห้ามเขียนตัวตรวจชนใหม่): จอง = `bookAppointment(ctx, { channel: "ONLINE" | "LINE" })` · เลื่อน = `rescheduleBySelf` ใน service.ts ที่ใช้ `busyRowsOf`/`slotClear`/`selfQuotaOk`/`candOf` ชุดเดียวกัน (ไม่นับแถวของตัวเอง) ใต้ลำดับล็อก **`lockUnitTx` (advisory สาขา → ช่างทั้งสาขาตาม sortOrder) → `lockAppt`** แบบ `rescheduleByShop` · เขียนด้วย CAS `where { id, tenantId, unitId, status, rescheduleCount }` · ไม่มี connection ที่สองใต้ล็อก · 40P01/P2028 ⇒ `BUSY` (ไม่ throw)
- **token ลิงก์จัดการนัดใช้ไม่ได้ทุกกรณี ⇒ คำตอบเดียวกันทุกไบต์** (สุ่ม · รูปผิด · ปลอมลายเซ็น · token ของงานอื่น (บัตร/เช็กอิน) · hash ถูกล้าง · หมดอายุ · ไม่ใช่สตริง): ตัวโหลด `{ ok:false, code:"NOT_FOUND" }` · ฟังก์ชันเขียน `{ ok:false, code:"NOT_FOUND", reason: <ข้อความเดียว> }` · .ics `null` · หน้า/route `notFound()`/404 เดียวกัน
- **ลิงก์ตัวตน LINE ใช้ไม่ได้ทุกกรณี ⇒ เหมือนไม่ได้ส่งมา** (view เท่ากับไม่มี `who` ทุกไบต์ · จองต้องกรอกชื่อ/เบอร์เอง) — ไม่บอกว่าเสียเพราะอะไร
- **ไม่มี PII บนหน้าสาธารณะ (X8)**: หน้าจัดการนัด/.ics/คำตอบ API/payload event **ไม่มีชื่อ/เบอร์ลูกค้า** · หน้าจองแสดงตัวตนจาก LINE เฉพาะ `name` + เบอร์ปิด (`maskPhone` ของ `privacy-shared.ts`) · ข้อสอบ `JSON.stringify` + HTML จาก server
- **ขอบเขต (X1)**: หน่วยจาก slug (`resolvePublicUnit` ประเภท BOOKING) หรือจากแถวนัดของ token · ทุกคิวรีผูก `tenantId + unitId` · บริการ/ช่างที่ไม่ใช่ของหน่วยนั้น ⇒ `NOT_FOUND` (ไม่หลุดข้อมูล) · id ที่ส่งกลับให้สาธารณะ = ไม่มี id นัด (มีแต่ลิงก์ token)
- **rate limit ด้วย `checkRateLimitDb` เท่านั้น** (§3.6) — นับทุกครั้ง (สำเร็จหรือไม่) **ก่อน**ค้นฐาน/ตรวจข้อมูล · ห้าม Map ในหน่วยความจำ
- **เวลา**: ฟังก์ชันหน้าจัดการนัดรับ `now` ฉีดได้ (`opts.now ?? new Date()`) ใช้นาฬิกาเดียวตลอด · เวลาไทยผ่าน `localToUtc`/`bkkDayOf` · ห้าม `.getDay()/.getHours()/.getMinutes()/.getDate()/.getMonth()/.getFullYear()` ดิบในไฟล์ใหม่ (S-7 · จอใช้ `Intl` + `timeZone: "Asia/Bangkok"`) · `?at=`/ฟิลด์ `at` อ่านเฉพาะ `process.env.SVC_QC_CLOCK === "1"`
- ข้อผิดพลาดคืน `{ ok:false, code, reason }` ไทยไม่โทษผู้ใช้ — ไม่ throw ในทางปกติ (รวมยิงพร้อมกัน)

## 3. สัญญา (ข้อสอบมีสำเนาชนิด — ชื่อ field ต้องตรง)

### 3.1 «manage-token.ts» (pure)
```ts
export const MANAGE_TOKEN_LABEL = "booking-manage:v1:";
export function manageToken(appointmentId: string): string | null;   // base64url(HMAC-SHA256(key = MANAGE_TOKEN_LABEL + SESSION_SECRET, appointmentId)) = 43 ตัว · ไม่มี/สั้นกว่า 32 ⇒ null (อ่าน env ตอนเรียก)
export function manageTokenHash(token: string): string;              // sha256 hex 64 ตัวเล็ก ของ token (เก็บใน Appointment.manageTokenHash)
```
- token **กำหนดแน่นอนจาก id** (ไม่สุ่ม): ส่งซ้ำด้วย idempotency key เดิมได้ลิงก์เดิม · B.9 ใส่ `ลิงก์นัด` ได้โดยไม่ต้องเก็บ token ดิบ · ≥128 บิต (256) เพราะกุญแจลับ · เก็บแค่ hash (`@unique`) ไว้หาแถว · ตรวจ: รูป 43 ตัว base64url → หาแถวด้วย hash → คำนวณ `manageToken(row.id)` แล้วเทียบ timing-safe อีกชั้น
- ไม่เก็บ/ไม่ log token ดิบ · log/audit/outbox ห้ามมี token หรือ hash

### 3.2 «online.ts» — หน้าจอง (ภาพ 03 ก ข ค)
```ts
export type OnlineLocale = "th" | "en";
export type OnlineService = { id: string; name: string; durationMin: number; priceSatang: number; depositSatang: number };
export type OnlineStaff = { id: string; name: string };
export type OnlineDay = { dateStr: string; closed: boolean };
export type OnlineTime = { startMin: number; hhmm: string; free: boolean };
export type OnlinePolicy = {
  graceMin: number | null; afterGrace: "RELEASE_REQUEUE" | "WAIT_NOTIFY_COUNTER" | null;
  freeChangeBeforeMin: number; selfRescheduleMax: number; requireConfirm: boolean;
  depositMethod: string; payWithinMin: number | null; forfeitPct: number | null;
};
export type OnlineQuery = { svc?: string; staff?: string; date?: string; time?: string; who?: string; lang?: string };
export type OnlineBookingView = {
  tenantName: string; unitName: string; locale: OnlineLocale; locales: OnlineLocale[];
  identity: { name: string; phoneMasked: string } | null;
  step: 1 | 2 | 3;
  services: OnlineService[]; service: OnlineService | null;
  anyStaff: boolean; staff: OnlineStaff[]; staffSel: string | null;          // "any" | id
  days: OnlineDay[]; dateSel: string | null;
  times: OnlineTime[]; timeSel: { startMin: number; hhmm: string } | null;
  summary: { startMs: number; endMs: number; staffName: string | null; priceSatang: number; depositSatang: number; payAtShopSatang: number; freeUntilMs: number } | null;
  policy: OnlinePolicy | null;
  extraField: { key: "MASSAGE_NOTE" | "SYMPTOM_OPTIONAL"; label: string } | null;
};
export async function loadOnlineBooking(ref: { tenantSlug: string; unitSlug: string }, q: OnlineQuery, opts?: { ip?: string; now?: Date })
  : Promise<{ ok: true; view: OnlineBookingView } | { ok: false; code: "NOT_FOUND" | "RATE_LIMITED" }>;
```
- หน่วย: `resolvePublicUnit(tenantSlug, unitSlug)` ประเภท BOOKING เท่านั้น · ไม่พบ/ไม่ใช่ BOOKING/slug คู่ข้ามร้าน ⇒ `NOT_FOUND` (คำตอบเดียว)
- `services` = บริการ active **และ** `bookable` ของหน่วย เรียง sortOrder, createdAt, id · `depositSatang` = `computeDepositSatang(booking.deposit.amount ชั้น UNIT→SERVICE, { priceSatang, durationMin, serviceDepositSatang })` เมื่อ `booking.deposit.method ≠ "NONE"` · NONE ⇒ 0
- `svc` = id บริการของหน่วยนั้น **หรือชื่อบริการตรงตัว** (ทางของฉากภาพ — id บน svcqc ไม่คงที่) · ไม่พบ/ไม่ bookable/ของหน่วยอื่น ⇒ ไม่เลือก (step 1)
- `staff` (step ≥ 2) = ช่าง active ที่ทำบริการนี้ได้ (`BookingStaffService` · ไม่มีแถว = ทำได้ทุกบริการ) และ `customerCanChoose = true` และ `onlineSharePct > 0` เรียงแบบ B.3 · `anyStaff` = `anyStaffOption` · `staffSel`: `"any"` (เมื่อ anyStaff) / id ในรายการ · ไม่ส่ง ⇒ `"any"` ถ้า anyStaff ไม่งั้น `null` · id อื่น ⇒ ค่าปริยายนั้น
- `days` (step ≥ 2) = วันไทยตั้งแต่วันนี้ถึง `วันนี้ + horizonDays − 1` (สูงสุด 60 รายการ) · `closed` = ร้านปิดทั้งวัน (`BookingHours.closed` / `BookingClosure` ทั้งวัน) หรือไม่มีช่างในรายการ (หรือ "ใครก็ได้") มีหน้าต่างเวลา · `dateSel` = `date` เมื่ออยู่ใน days และไม่ closed · ไม่ส่ง ⇒ วันแรกที่ไม่ closed
- `times` (เมื่อมี dateSel + staffSel) = ช่องตาราง `slotStepMin` ในหน้าต่างของช่าง (ใครก็ได้ = รวมทุกคนในรายการ) ที่เริ่ม ≥ now + minLeadMin · `free` = มีใน `findSlots(ctx, { serviceId, staffId: any ? null : id, dateStr, channel: "ONLINE" })` **ทุกช่อง free ต้องตรง findSlots ทุกตัว** (ข้อสอบเทียบ) · ช่องที่ไม่ free = "เต็มแล้ว" (ขีดฆ่า) — ไม่บอกว่าเต็มเพราะ walk-in/โควตา
- `step`: ไม่มี service ⇒ 1 · มี service แต่ `time` ไม่ใช่ช่อง free ของ dateSel ⇒ 2 (`timeSel` null) · ครบ ⇒ 3 · `summary` (step 3) = เวลาเริ่ม/จบ (จบ = เริ่ม + นาทีบริการของช่างที่ findSlots ให้ ไม่รวม buffer) · `staffName` = ชื่อช่างที่เลือก (ใครก็ได้ ⇒ `null`) · ราคา/มัดจำตามช่างที่ findSlots ให้ช่องนั้น · `payAtShopSatang = price − deposit` · `freeUntilMs = startMs − freeChangeBeforeMin·60000`
- `policy` (step ≥ 2) = ค่าตั้งปัจจุบันของหน่วย+บริการ(+ช่างที่เลือก) ของคีย์ใน `SNAPSHOT_KEYS.appointment` + `graceMin` — ตัวเดียวกับที่ snapshot จะจด (ข้อสอบแก้ค่าตั้งแล้วเห็นผลทันที)
- `extraField` = `booking.booking.extraFields` (UNIT→SERVICE) ของบริการที่เลือก · null ⇒ ไม่มีช่อง · ป้ายจาก `labelTh` ของ enum ในทะเบียน (en = ข้อความใน dict)
- **ภาษา**: `lang` อยู่ใน `customerLocales` ⇒ ใช้ · ไม่งั้นตัวแรกของ `customerLocales` · `locales` = ค่านั้น
- **ตัวตนจาก LINE (`who`)**: `verifyLink(who, "booking.identity")` → `{ tenantId = ร้านของหน้า, subjectId = partyId }` → Party ของร้านนั้น (ไม่ถูกรวม) ⇒ `identity = { name: party.name, phoneMasked: maskPhone(party.phone) }` · ไม่ผ่านทุกกรณี ⇒ `null` (view เท่ากับไม่ส่ง who ทุกไบต์)
- rate limit: `bq:view:<tenantSlug>/<unitSlug>:<ip>` ตาม `ONLINE_RATE.view` ก่อนค้นฐาน · เกิน ⇒ `RATE_LIMITED`

### 3.3 «online.ts» — จอง
```ts
export type OnlineBookInput = { serviceId: string; staffId: string | null; dateStr: string; startMin: number; name?: string; phone?: string; note?: string; idempotencyKey?: string; who?: string };
export async function bookOnline(ref: { tenantSlug: string; unitSlug: string }, i: OnlineBookInput, opts?: { ip?: string })
  : Promise<{ ok: true; manageUrl: string | null; status: "PENDING" | "CONFIRMED"; startMs: number; holdUntilMs: number | null; depositSatang: number }
          | { ok: false; code: BookFailCode | "RATE_LIMITED"; reason: string }>;
export function bookingIdentityToken(ctx: { tenantId: string }, partyId: string, ttlMin?: number): string;   // signLink purpose "booking.identity" · ค่าเริ่ม 1440 นาที (B.9 ใช้ตอนตอบเมนู OA)
```
- ลำดับ: rate limit `bq:book:<tenantSlug>/<unitSlug>:<ip>` (`ONLINE_RATE.book` · ก่อนทุกอย่าง) → หน่วย (ไม่พบ ⇒ `NOT_FOUND`) → รูปข้อมูล (`note` ยาว > 300 · ชื่อ > 80 · เบอร์ > 20 ⇒ `BAD_INPUT`) → ช่างที่ `customerCanChoose = false` หรือไม่อยู่ในหน่วย ⇒ `NOT_FOUND` → ตัวตน: `who` ผ่าน ⇒ ใช้ชื่อ/เบอร์ของ Party (ละค่าที่ส่งมา) + `channel "LINE"` + `partyId` · ไม่ผ่าน/ไม่ส่ง ⇒ ใช้ name/phone ที่กรอก + `channel "ONLINE"` → `bookAppointment(ctx, { …, channel, idempotencyKey, partyId? })` → ผลของ B.3 ส่งต่อ (code/reason เดิม)
- สำเร็จ ⇒ `manageUrl = "/bq/m/" + manageToken(id)` (ไม่มี SESSION_SECRET ⇒ `null` แต่จองสำเร็จ) · `holdUntilMs` = `holdUntil` ของ B.3 · `depositSatang` = ของแถว · ส่งซ้ำ key เดิม ⇒ ผลเดิม + ลิงก์เดิม (token กำหนดแน่นอน) · **ไม่มี id นัด ไม่มีชื่อ/เบอร์ในคำตอบ**
- นัดของวันนี้ในหน่วยแถวเดียว ⇒ `replan` หลัง commit (walk-in ถูกจัดใหม่)
- มัดจำ: B.7 **ไม่รับเงิน** — แสดงยอด + เวลาที่ต้องจ่าย (`holdUntilMs`) + ช่อง `data-bk-deposit-slot` ให้ B.8 ใส่ QR/แนบสลิป (§4) · ระหว่างนี้นัดที่ถือช่องหมดเวลาด้วย `expireDepositHolds` เดิม ⇒ **B.7 เปิดให้ลูกค้าจริงพร้อม B.8 เท่านั้น** (B.12 ต้องมีทั้งคู่)

### 3.4 «online.ts» — ลิงก์จัดการนัด
```ts
export type ManageStatus = "PENDING" | "CONFIRMED" | "LATE" | "ARRIVED" | "QUEUED" | "IN_SERVICE" | "DONE" | "CANCELLED" | "NO_SHOW";
export type ManageBlock = "LATE_CHANGE" | "MAX_RESCHEDULE" | "BAD_STATE" | null;
export type ManageView = {
  tenantName: string; unitName: string; locale: OnlineLocale;
  serviceName: string; staffName: string | null; anyStaff: boolean;
  startMs: number; endMs: number; status: ManageStatus; cancelReason: string | null;
  priceSatang: number; depositSatang: number; depositPaid: boolean; holdUntilMs: number | null;
  policy: OnlinePolicy; freeUntilMs: number; rescheduleCount: number; rescheduleLeft: number;
  canCancel: boolean; canReschedule: boolean; cancelBlock: ManageBlock; rescheduleBlock: ManageBlock;
  icsPath: string;
  reschedule: { staff: OnlineStaff[]; staffSel: string | null; days: OnlineDay[]; dateSel: string | null; times: OnlineTime[] } | null;
};
export async function manageLinkFor(ctx: { tenantId: string; unitId: string }, appointmentId: string): Promise<string | null>;
export async function loadManageView(token: unknown, opts?: { now?: Date; ip?: string; lang?: string; reschedule?: { date?: string; staff?: string } })
  : Promise<{ ok: true; view: ManageView } | { ok: false; code: "NOT_FOUND" | "RATE_LIMITED" }>;
```
- **หา token**: rate limit (§3.6) → รูป 43 ตัว base64url (อื่น ⇒ NOT_FOUND ก่อนแตะฐาน) → `appointmentByManageHash(hash)` (service.ts · แถว `kind = "BOOKED"`) → timing-safe เทียบ `manageToken(row.id)` → หน่วยยังเป็น BOOKING ACTIVE → **อายุ: `now ≤ startAt + 7 วัน`** (อื่น ⇒ NOT_FOUND) · ไม่มี SESSION_SECRET ⇒ NOT_FOUND ทุก token
- `manageLinkFor` (ทางพนักงาน/B.9): นัด `kind BOOKED` ของ ctx ⇒ `"/bq/m/" + token` และตั้ง `manageTokenHash` ถ้ายังว่าง (CAS `manageTokenHash: null`) · WALKIN/ไม่พบ/ร้านอื่น/ไม่มีกุญแจ ⇒ `null`
- view: `staffName` = ช่างของแถว (`plannedStaffId ?? staffId`) · `anyStaff` = `assignMode ANY` · `endMs` = `startAt + job.durationMin` (snapshot · ไม่รวม buffer · แถวเก่า = endAt − bufferMin ของบริการ) · `depositPaid = depositPaidAt ≠ null` · `holdUntilMs` = เวลาสิ้นสุดถือช่องมัดจำ (สูตร `holdMinutesOf` ของ B.3) เมื่อยังถือ · อื่น null · `policy` = จาก **snapshot** (§2) · `freeUntilMs = startMs − freeChangeBeforeMin·60000` · `rescheduleLeft = max(0, selfRescheduleMax − rescheduleCount)`
- `canCancel` = สถานะ PENDING/CONFIRMED **และ** `now ≤ freeUntilMs` · `cancelBlock`: สถานะอื่น ⇒ `BAD_STATE` · เลยเวลา ⇒ `LATE_CHANGE` · ได้ ⇒ null
- `canReschedule` = สถานะ PENDING/CONFIRMED และ `now ≤ freeUntilMs` และ `rescheduleLeft > 0` · `rescheduleBlock` ลำดับ: `BAD_STATE` → `LATE_CHANGE` → `MAX_RESCHEDULE`
- `reschedule` (เมื่อส่ง `opts.reschedule` และ canReschedule): รูปเดียวกับขั้น 2 ของหน้าจอง (บริการเดิม) · `times.free` = `findSlots(…, channel "ONLINE", { now, excludeAppointmentId: id })` · ไม่งั้น null
- `icsPath = "/bq/m/" + token + "/ics"` · **ไม่มีชื่อ/เบอร์/note ลูกค้า** ใน view

### 3.5 «online.ts» — เลื่อน · ยกเลิก · ปฏิทิน
```ts
export type ManageFail = "NOT_FOUND" | "RATE_LIMITED" | "LATE_CHANGE" | "MAX_RESCHEDULE" | "BAD_STATE" | "LOST_RACE" | "BUSY"
  | "FULL" | "PAST" | "LEAD_TIME" | "BEYOND_HORIZON" | "OFF_GRID" | "OUTSIDE_HOURS" | "NOT_QUALIFIED" | "ON_LEAVE" | "BAD_INPUT";
export async function rescheduleOnline(token: unknown, to: { dateStr: string; startMin: number; staffId: string | null }, opts?: { now?: Date; ip?: string })
  : Promise<{ ok: true; startMs: number } | { ok: false; code: ManageFail; reason: string }>;
export async function cancelOnline(token: unknown, opts?: { now?: Date; ip?: string }): Promise<{ ok: true } | { ok: false; code: ManageFail; reason: string }>;
export async function loadManageIcs(token: unknown, opts?: { now?: Date; ip?: string }): Promise<string | null>;
export const ONLINE_RATE: { book: { limit: 10; windowMs: 60000 }; view: { limit: 60; windowMs: 60000 }; manageIp: { limit: 60; windowMs: 600000 }; manageToken: { limit: 10; windowMs: 600000 } };
```
- **ลำดับตรวจ (ทั้งเลื่อนและยกเลิก)**: rate limit (ip → token) → token (NOT_FOUND) → สถานะ ∉ {PENDING, CONFIRMED} ⇒ `BAD_STATE` → `now > freeUntilMs` ⇒ `LATE_CHANGE` → (เลื่อน) `rescheduleCount ≥ selfRescheduleMax(snapshot)` ⇒ `MAX_RESCHEDULE` → (เลื่อน) รูปข้อมูล ⇒ `BAD_INPUT` → กติกาช่อง → ล็อก + CAS
- **เลื่อน** = `rescheduleBySelf(ctx, id, to, { now })` (service.ts §3.7): ปลายทางตรวจเหมือน `bookAppointment` ช่อง SELF ทุกข้อ (`PAST` · `BEYOND_HORIZON` · `LEAD_TIME` · `OFF_GRID` · `OUTSIDE_HOURS` · `NOT_QUALIFIED` · `ON_LEAVE` · โควตา % ออนไลน์ + งานสูงสุด/วัน + ชน ⇒ `FULL` ข้อความเดียวกับ B.3 · **ไม่นับแถวของตัวเอง**) · ช่างของหน่วยอื่น/ร้านอื่น/`customerCanChoose = false` ⇒ `NOT_FOUND` · `staffId: null` = ใครก็ได้ (ได้เมื่อ `anyStaffOption` · ผล `assignMode ANY`) · ระบุช่าง ⇒ `assignMode SPECIFIC`
  - ใต้ `lockUnitTx` → `lockAppt` → ตรวจสถานะ/นับครั้ง/ชนซ้ำ → CAS `{ startAt, endAt (= start + นาทีช่างใหม่ + buffer ใน snapshot), staffId, assignMode, rescheduleCount + 1, plannedStartAt: null, plannedStaffId: null, lateAt: null, policySnapshot ล้าง job.manualHold (แบบ N1 ของ B.4) }` · **`requireConfirm` ใน snapshot = true ⇒ สถานะกลับเป็น PENDING** (ร้านยืนยันเวลาใหม่) · มัดจำที่จ่ายแล้วติดไปกับแถว (แถวเดิม · id เดิม · ลิงก์เดิม)
  - outbox `booking.rescheduled` (คีย์ `booking.rescheduled#<id>#<startAtISO>#<staffId>` แบบ B.4 · payload แบบ `evPayload` + `{ fromStartAt, fromStaffId, startAt, by: "CUSTOMER" }`) ใน tx เดียว → `replan` หลัง commit · แพ้ CAS ⇒ `LOST_RACE` · ยิงพร้อมกัน N ทาง ⇒ สำเร็จ ≤ `selfRescheduleMax − rescheduleCount` ครั้งพอดี (X3)
- **ยกเลิก**: ใต้ `lockAppt` (ไม่ต้องล็อกช่าง — ปล่อยช่องอย่างเดียว) → CAS `{ status: CANCELLED, cancelReason: "CUSTOMER", plannedStartAt: null, plannedStaffId: null }` + outbox `booking.cancelled` (คีย์ `booking.cancelled#<id>` เดียวกับร้าน/B.6 · payload `evPayload` + `{ reason: "CUSTOMER", from, depositSatang, depositPaid }`) ใน tx เดียว → `replan` · ซ้ำ ⇒ `BAD_STATE` (event ไม่ซ้ำ) · **มัดจำที่จ่ายแล้ว: B.7 ไม่คืนเงิน** — `depositPaid: true` ใน payload คือจุดต่อให้ B.8 (`moduleRefundDeposit`)
- **.ics**: token ใช้ไม่ได้ ⇒ `null` · ได้ ⇒ VCALENDAR (VERSION 2.0 · PRODID) + VEVENT: `UID:appt-<manageTokenHash 16 ตัวแรก>@shark.in.th` (คงที่ข้ามการเลื่อน) · `DTSTAMP` · `DTSTART`/`DTEND` เป็น UTC `YYYYMMDDTHHMMSSZ` = startMs/endMs ของ view · `SUMMARY` = บริการ · หน่วย · `DESCRIPTION` มีลิงก์จัดการนัด (path) · `SEQUENCE:<rescheduleCount>` · `STATUS:CANCELLED` เมื่อยกเลิก ไม่งั้น `CONFIRMED` · CRLF · escape `,;\` · **ไม่มีชื่อ/เบอร์ลูกค้า**

### 3.6 rate limit (ค่าคงที่ความปลอดภัย · ไม่ใช่นโยบายร้าน)
| ถัง | คีย์ | เพดาน |
|---|---|---|
| ดูหน้าจอง | `bq:view:<tenantSlug>/<unitSlug>:<ip>` | 60 / นาที |
| จอง | `bq:book:<tenantSlug>/<unitSlug>:<ip>` | 10 / นาที (ตัวเลขเดิมของ route) |
| ลิงก์จัดการนัด ต่อ IP (ดู · เลื่อน · ยกเลิก · .ics) | `bq:manage:ip:<ip>` | 60 / 10 นาที |
| ลิงก์จัดการนัด ต่อ token (เลื่อน · ยกเลิก) | `bq:manage:tk:<manageTokenHash(token) 32 ตัวแรก>` | 10 / 10 นาที |
- ใช้ `now` ที่ฉีด (`checkRateLimitDb(key, rate, now.getTime())`) · ip ไม่ส่ง ⇒ `"unknown"` · route/หน้า/action อ่าน IP จาก `x-forwarded-for` ตัวแรก
- slots route: `bq:slots:<tenantSlug>/<unitSlug>:<ip>` 60/นาที

### 3.7 service.ts — เพิ่มเท่านั้น (ข้อสอบ S-3 ไล่ diff: ลบ/แก้ ≤ 12 บรรทัด · `busyRowsOf` `slotClear` `selfQuotaOk` `openCountForPhone` `replayOf` ต้องเท่า HEAD ทุกไบต์ — ต้องการต่างให้ห่อ/เรียกซ้ำ ไม่แก้ตัวเดิม · ห้ามแก้พฤติกรรมเดิมของช่อง STAFF/PHONE)
- `BookInput` + `partyId?: string` (ใช้เฉพาะช่อง LINE ที่ผู้เรียกยืนยันตัวตนแล้ว ⇒ ใส่ใน create · ข้าม `linkPartyAfterCommit`)
- `bookAppointment` ช่อง ONLINE/LINE: ใน tx เดียวกับ create ⇒ `manageTokenHash` (มีกุญแจ) + `emitOutbox booking.created` (คีย์ `booking.created#<id>` · payload `{ appointmentId, unitId, staffId, kind: "BOOKED", channel, serviceId, assignMode, status }` · ไม่มีชื่อ/เบอร์) · ช่อง STAFF/PHONE ไม่เปลี่ยน
- `findSlots(ctx, q, opts?: { now?: Date; excludeAppointmentId?: string })` — ไม่ส่ง opts = ผลเดิมทุกไบต์ (b.3 regression)
- `rescheduleBySelf(ctx, appointmentId, to, opts)` (หรือชื่ออื่นที่ online.ts เรียก) ตาม §3.5 · `appointmentByManageHash(hash)` — ไฟล์นี้นับใน F5 อยู่แล้ว (online.ts ห้ามมี prisma ดิบ)

### 3.8 หนี้ B.6 §9 — ตู้ "จองวันอื่นล่วงหน้า"
- `KioskView` + `bookUrl: string` = `"/s/" + tenantSlug + "/" + unitSlug` · `Kiosk.tsx` หน้าแรก + บริการ `walkIn:false` มี QR `data-kiosk-book-qr` ที่ `data-href` = bookUrl (ลูกค้าสแกนไปจองบนมือถือ — ไม่พาตู้ออกจากโหมดตู้)

## 4. สัญญา DOM (ข้อสอบ U/H · default export · คอมโพเนนต์ **ห้าม import ค่า** จาก `@/lib/modules/**`/`@/lib/core/db`/`@prisma/client` — `import type` ได้)
- **PublicBooking** (`'use client'`) `{ view: OnlineBookingView; basePath: string; query: OnlineQuery; idempotencyKey: string }`: ราก `data-bk-online` + `data-step` + `data-locale` · ทุกลิงก์เปลี่ยนขั้นเป็น `<a href>` แบบ GET (`basePath?svc=…&staff=…&date=…&time=…` คง `who`/`lang`) — ขั้นทั้งหมด render จาก server ได้ (ไม่มีสถานะลับใน client)
  - ตัวตน: `[data-bk-identity]` **เฉพาะ** identity ≠ null (ชื่อ + เบอร์ปิด · ห้ามเบอร์เต็ม)
  - ขั้น 1: บริการ `a[data-bk-service="<id>"]` (href มี `svc=<id>`) · มัดจำ > 0 ⇒ ป้าย `[data-bk-deposit]` ในการ์ด
  - ขั้น 2: ช่าง `a[data-bk-staff="any"|"<id>"]` (ตัวที่เลือกมี `data-on`) · `any` มีเฉพาะ anyStaff · วัน `[data-bk-day="<YYYY-MM-DD>"]` (closed ⇒ มี `data-closed` และไม่ใช่ลิงก์) · เวลา `[data-bk-time="<HH:MM>"]` + `data-free="1"` (ลิงก์ href มี `time=HH:MM`) / `data-free="0"` (ขีดฆ่า ไม่ใช่ลิงก์) · ลำดับ = view.times
  - ขั้น 3: `[data-bk-summary]` + `data-start="<startMs>"` · `[data-bk-policy]` ข้อความกติกาที่มีตัวเลข `graceMin` และเวลา `HH:MM` (ไทย) ของ `freeUntilMs` · มัดจำ > 0 ⇒ `[data-bk-deposit-now]` + `data-satang` · `[data-bk-pay-at-shop]` + `data-satang` · `[data-bk-deposit-slot]` (B.8 ใส่ QR) · มัดจำ 0 ⇒ ไม่มีทั้ง 3 · `<form data-bk-confirm-form>`: `input[name=name]` + `input[name=phone]` **เฉพาะ identity null** · `input[type=hidden][name=idempotencyKey]` value = prop · `textarea[name=note]` **เฉพาะ** extraField · ปุ่ม `[data-bk-submit]` · ส่ง = `fetch POST /api/store/<t>/<u>/book` (JSON ตาม `OnlineBookInput` + `who`) → ok ⇒ ไป `manageUrl` · ล้ม ⇒ ข้อความจาก dict ตาม `code` ในภาษาของหน้า
  - ภาษา: ข้อความทุกตัวจาก dict (`src/lib/i18n/dict.ts`) ตาม `view.locale` · วันที่/เวลาแบบ `Intl` (`en-GB` / `th-TH` · `Asia/Bangkok`) · หน้า en ต้องไม่มีอักษรไทยนอกข้อมูลร้าน (ข้อสอบใช้ร้านที่ตั้งชื่อเป็นอังกฤษล้วน)
- **ManageCard** `{ view: ManageView; token: string; actions: { cancel: (fd: FormData) => Promise<void>; reschedule: (fd: FormData) => Promise<void> }; at?: string; err?: string | null }`: ราก `data-bk-manage` + `data-status` · `[data-bk-manage-when]` + `data-start` · `[data-bk-manage-policy]` · ยกเลิก `<form data-bk-cancel>` + ปุ่ม `[data-bk-cancel-btn]` (ConfirmDialog ได้) **เฉพาะ canCancel** · ลิงก์ `a[data-bk-reschedule]` (href มี `r=1`) **เฉพาะ canReschedule และ view.reschedule null** · โหมดเลื่อน (view.reschedule ≠ null): วัน/ช่าง/เวลา attr เดียวกับขั้น 2 · เวลา free แต่ละช่อง = `<form data-bk-reschedule-form>` (hidden `date` `startMin` `staffId` (`""` = ใครก็ได้)) · ไม่มีปุ่มยกเลิก/เลื่อน ⇒ `[data-bk-late]` + `data-code="<cancelBlock>"` (ข้อความอธิบาย + มัดจำตามกติกา) · `a[data-bk-ics]` href = icsPath · ถือช่องมัดจำ (`holdUntilMs`) ⇒ `[data-bk-deposit-slot]` · `at` prop ⇒ ทุกฟอร์มมี `input[type=hidden][name=at]` · ไม่ส่ง ⇒ ห้ามมี · `err` = รหัส → ข้อความ dict (ไม่แสดงข้อความอิสระ — บทเรียน K2)
- หน้าตาเทียบภาพ 03 (มือถือ 390): หัวร้าน + แถบขั้น 3 ช่อง · "ขั้น n/3" · การ์ดบริการ (ชื่อ · นาที · ราคา · ป้ายมัดจำ) · ปุ่มดำล่าง "ต่อไป · <บริการ>" · ชิปช่าง ("ใครก็ได้ · เร็วสุด") + บรรทัด "<บริการ>ทำได้: …" · ชิปวัน 5 ช่อง (ปิด = จาง) · ตารางเวลา 4 คอลัมน์ (เต็ม = ขีดฆ่า) · กล่อง "ใช้ N ชั่วโมง · จะเสร็จราว HH:MM" · ขั้น 3 การ์ดสรุป + กล่องกติกา (มาสายได้ไม่เกิน N นาที … · เลื่อน/ยกเลิกฟรีถึง … ) + ช่องมัดจำ + ปุ่ม "ยืนยันนัด" (B.8 เปลี่ยนเป็น "จ่ายมัดจำ ฿… · ยืนยันนัด")
- ต่างจากภาพโดยตั้งใจ (PARITY ดูหน้าตา): ไม่มี checkbox "แจ้งเตือนทาง LINE" (ข้อความบริการไม่ต้องขอยินยอม · B.9 — แสดงเป็นบรรทัดแจ้งเมื่อมาจาก LINE) · ไม่มีกล่อง "ไม่อยากจองล่วงหน้า? กดรับบัตรคิวออนไลน์" (รับบัตรจากมือถือ = B.9 #42) · QR พร้อมเพย์ = B.8

## 5. หน้า · route · action
- `/s/[tenantSlug]/[unitSlug]` (BOOKING): `loadOnlineBooking(ref, searchParams, { ip })` → NOT_FOUND ⇒ `notFound()` · RATE_LIMITED ⇒ ข้อความ "ลองใหม่ในอีกสักครู่" · `idempotencyKey = randomUUID()` ต่อการ render ขั้น 3 · มี `who` ⇒ `metadata.referrer = "no-referrer"` + robots noindex (token อยู่ใน URL) · ประเภทอื่นเด้งเหมือนเดิม
- `POST /api/store/[t]/[u]/book` → `bookOnline` · 200 `{ ok:true, manageUrl, status, startMs, holdUntilMs, depositSatang }` · ล้ม: `RATE_LIMITED` ⇒ 429 (+Retry-After) · `NOT_FOUND` ⇒ 404 · `BAD_INPUT` ⇒ 400 · อื่น ⇒ 409 `{ ok:false, code, reason }` · body ไม่ใช่ JSON ⇒ 400 · ไม่มี id นัด/PII
- `GET /api/store/[t]/[u]/slots?serviceId&staffId(any)&date` → `findSlots(channel "ONLINE")` (ช่าง 0% ไม่โผล่) + rate limit DB
- `/bq/m/[token]`: `loadManageView(token, { now, ip, lang, reschedule: r=1 ? { date, staff } : undefined })` → NOT_FOUND ⇒ `notFound()` · `<ManageCard>` · `force-dynamic` · `metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" }` · `?at=` เฉพาะ `SVC_QC_CLOCK === "1"` · `?err=<CODE>` เฉพาะรูป `^[A-Z_]{1,40}$`
- `GET /bq/m/[token]/ics` → `loadManageIcs` · `text/calendar; charset=utf-8` · `Content-Disposition: attachment; filename="booking.ics"` · `Cache-Control: no-store` · `Referrer-Policy: no-referrer` · null ⇒ 404 (body เดียวทุกกรณี)
- «src/app/(store)/bq/m/actions.ts» (`"use server"` · export async function เท่านั้น · **ไม่มี** requireUnit/session): `cancelBookingAction(token, formData)` · `rescheduleBookingAction(token, formData)` (ฟิลด์ `date` `startMin` `staffId` (`""` = ใครก็ได้) `at`) → facade (ip จาก `headers()`) → สำเร็จ `redirect("/bq/m/<token>")` · ล้ม `?err=<code>` · นาฬิกา QC อ่าน `at` เฉพาะ `SVC_QC_CLOCK === "1"`

## 6. จุดที่แบบไม่ชัด — ผู้เขียนข้อสอบเลือกแล้ว (ผู้คุมเคาะได้ · เปลี่ยน = ORACLE-EDIT)
1. **token = HMAC(id) กำหนดแน่นอน + เก็บ hash** (ไม่ใช่สุ่มเก็บ hash แบบ payment-request) — เหตุ: ส่งซ้ำ key เดิมต้องได้ลิงก์เดิม (ดับเบิลคลิก/เน็ตหลุด) · B.9 ส่งลิงก์ได้โดยไม่เก็บ token ดิบ · ความแข็ง = กุญแจลับ 256 บิต · ข้อเสีย: หมุน token รายนัดไม่ได้ (เปลี่ยน SESSION_SECRET = ล้างทุกลิงก์) · ล้าง hash = ปิดลิงก์ได้ (manageLinkFor เปิดคืนด้วย token เดิม)
2. **URL หน้าจัดการนัดไม่มี slug** (`/bq/m/<token>`) แบบ B.6 · หน้าจองใช้ slug ร้าน (หน้าร้านสาธารณะเดิม)
3. **เลยเวลาฟรี ⇒ เลื่อน/ยกเลิกเองไม่ได้ทั้งคู่** (`LATE_CHANGE` · หน้าแสดง "ติดต่อร้าน" + กติกามัดจำ) — ไม่ทำ "ยกเลิกช้าแล้วยอมริบมัดจำ" ใน B.7 (เงิน = B.8) ⇒ Q1
4. **เลื่อน = แก้แถวเดิม** (id/ลิงก์/มัดจำคงเดิม · `rescheduleCount + 1`) · ไม่สร้างแถวใหม่ (`rescheduledFromId` ว่างไว้ให้ B.14) · `requireConfirm(snapshot)` ⇒ กลับ PENDING
5. **ตัวตนจาก LINE = ลิงก์เซ็น `booking.identity` (subject = partyId · ระดับร้าน)** — B.9 ออกลิงก์ตอนลูกค้ากดเมนู OA (`bookingIdentityToken`) · ช่อง `LINE` · `partyId` ผูกตรง · หน้าแสดงชื่อ + เบอร์ปิดเท่านั้น
6. **หน้าจัดการนัดไม่แสดงชื่อลูกค้า** (ลิงก์อาจถูกส่งต่อ) — แสดงบริการ/เวลา/ช่าง/สถานะ/กติกา/มัดจำ
7. **ช่องที่ไม่ว่างแสดงเป็น "เต็มแล้ว" (ขีดฆ่า) ทุกเหตุผล** (ชน · โควตาออนไลน์ · งานสูงสุด) — ไม่บอกว่ากันไว้ให้ walk-in (B.3 §4.3)
8. **ลิงก์หมดอายุ = เวลานัด + 7 วัน** (DESIGN §7) — ค่าคงที่ความปลอดภัย ไม่ใช่ค่าตั้ง
9. **`booking.created` ยิงเฉพาะช่อง ONLINE/LINE** — ช่อง STAFF/PHONE ของ bookAppointment คงพฤติกรรม B.3 (ไม่ยิง) ⇒ Q2
10. **ขั้นทั้งหมดอยู่ใน URL** (GET) — ทดสอบ/ถ่ายภาพได้ทีละขั้น · กดย้อนของเบราว์เซอร์ทำงาน
11. ราคา/มัดจำ "ใครก็ได้" ในขั้น 3 = ของช่างที่ findSlots เสนอช่องนั้น (ช่างจริงตัดสินใต้ล็อกตอนจอง — ปกติคนเดียวกัน)

## 7. ฉากภาพ «scripts/svc-qc-online-scene.mts» (builder · แบบ `svc-qc-device-scene.mts`)
- ด่าน `loadSvcQcEnv` · อ่านจาก `SQC_ONLINE_SCENE` + `SQC` เท่านั้น · ร้าน svcqc หน่วย barber · **วันฉาก = `sqcOnlineSceneDay`** (= วันฉาก B.5 + 14 · เสาร์ · ไม่ชน B.5/B.6)
- ทำ: แม่แบบ BARBER (KEEP_CUSTOM) → Party `SQC_ONLINE_SCENE.party` (id ตายตัว) → นัดช่างนุ่นตาม `SQC_ONLINE_SCENE.bookings` (`bookAppointment` ช่อง STAFF · `idempotencyKey = idemPrefix + วันฉาก + "-" + key` · PENDING ⇒ CONFIRMED) ให้ขั้น 2 มีช่องขีดฆ่า และ 15:30 ว่าง
- idempotent: ครบแล้ว ⇒ 0/0/0 · วันฉากเปลี่ยน ⇒ ลบนัดฉากเก่า (prefix) แล้วสร้างใหม่ · `--clear` ลบนัดฉาก + Party ฉาก · บรรทัดท้าย `SCENE_SUMMARY {"created":n,"updated":n,"removed":n}`
- ภาพ (ผู้คุม): reseed → ฉาก → QC server → `visual-svc b.7 --user owner` → PARITY `online-step1` ↔ 03ก · `online-step2` ↔ 03ข · `online-step3` ↔ 03ค (หน้าจัดการนัดไม่มีภาพแบบ ⇒ ตรวจด้วย U/H)

## 8. เกณฑ์รับ
- «scripts/qc-svc-b.7.mts» เขียวทุกข้อ — หมวด **T** ข้อมูล/แม่แบบ · **PC** ตัวควบคุม (เขียวก่อนมีงาน) · **W** หน้าจอง (view) · **B** จอง · **X** ยิงพร้อมกันข้ามโพรเซส (ช่องเดียว · key เดียว · ใครก็ได้ · เลื่อน∥จอง · เลื่อนซ้ำเกินเพดาน · ยกเลิก∥เลื่อน · จอง∥walk-in∥ย้ายช่าง) · **M** ลิงก์จัดการนัด (token ทุกแบบเสีย ⇒ คำตอบเดียว · อายุ · snapshot) · **R** เลื่อน · **C** ยกเลิก · **I** .ics · **RL** rate limit · **K** ตู้ (หนี้ B.6) · **U** DOM · **H** server จริง · **S** ไฟล์/สัญญาโค้ด · **Q** ฉาก svcqc · **V** ภาพ · **G** regression · **Z**
- regression (G · รันหลังล้างข้อมูล): `qc-svc-b.3` (SVC_B3_NO_REGRESSION=1) · `qc-svc-b.4 --no-regression` · `qc-svc-b.5 --no-regression` · `qc-svc-b.6 --no-regression` · `qc-booking-race` · `qc-booking-deposit` · `qc-svc-smoke` — ไม่มี FAIL ยกเว้นข้อ "แตะเฉพาะไฟล์ของใบ" ของชุดนั้น (b.3/b.4 ST-1 · b.5/b.6 S-1 · b.6 S-9 diff core-fix หลัง merge) ระหว่างงาน B.7 ยังไม่ commit
- typecheck + fitness 2 โหมด (ผู้คุม · F5 ต้องเท่าเดิม 50 · F6 ไม่มีไฟล์ action ใหม่ใน src/lib/actions) · ตรวจ 2 รอบ (เข้ม) · build QC + ภาพ 3 ใบ (PARITY 03 ก ข ค)

## 9. ไม่ใช่เรื่องของใบนี้ / หนี้ส่งต่อ
- **B.8**: QR พร้อมเพย์/แนบสลิปใน `data-bk-deposit-slot` (หน้าจองขั้น 3 + หน้าจัดการนัด) · คืนมัดจำเมื่อ `booking.cancelled` ที่ `reason CUSTOMER` + `depositPaid` · ปุ่ม "จ่ายมัดจำ · ยืนยันนัด" · ยกเลิกช้าแล้วริบมัดจำ (ถ้า Q1 = อนุญาต)
- **B.9**: ฟัง `booking.created` (ออนไลน์) ส่งใบนัด + `ลิงก์นัด` = origin + `manageLinkFor` · ปุ่ม "เลื่อนนัด" แบบ uri · ตอบเมนู OA "จองคิว" ด้วย `bookingIdentityToken` · แสดงรหัสผูก LINE (`issueBookingLinkCode`) ในหน้าจัดการนัด (ใบที่ merge หลังเป็นคนต่อ — หน้าอยู่ชั้น app import platform ได้)
- **B.14**: ลากย้าย = `rescheduledFromId`/ประวัติเลื่อน · **B.17**: waitlist เมื่อยกเลิก · **B.18**: ป้าย automation "เมื่อร้านเลื่อนนัด/ยกเลิกนัด" ให้รวมลูกค้า · แก้ถ้อยคำ CC §6.1 (หนี้ B.6) · `createAppointment` รุ่นแรก (ไม่มีผู้เรียกสาธารณะแล้ว — ลบได้ตอนปิดเฟส)
- ร้านที่ไม่เลือกแม่แบบ (`_fallback`): `selfRescheduleMax = 0` ⇒ เลื่อนเองไม่ได้ · ยกเลิกได้ตาม `freeChangeBeforeMin` ของ BARBER (180)

## 10. คำถามผู้คุม (ค่าปลอดภัยใช้ไปก่อน)
- **Q1 ยกเลิกเลยเวลาฟรี**: ห้ามทั้งหมด (ค่าปลอดภัย · ลูกค้าโทรร้าน) หรือให้ยกเลิกได้พร้อมยืนยัน "ร้านเก็บมัดจำ X%" (ต้องมี B.8 + ถ้าเปิดต้องเป็นค่าตั้งใหม่ `booking.late.lateCancelMode` ⇒ ORACLE-EDIT b.0 D-KEYS)
- **Q2 `booking.created` ของนัดที่พนักงานจอง (STAFF/PHONE)**: ยิงด้วยไหม (B.9 จะส่งใบนัดให้ลูกค้าที่โทรจอง) · ค่าปลอดภัย: ไม่ยิง (คงพฤติกรรม B.3 · ไม่กระทบ b.4/b.5)
- **Q3 หน้าจัดการนัดไม่มีภาพแบบ** — ผู้คุมต้องการภาพแบบก่อน B.12 ไหม (ตอนนี้ตรวจด้วย DOM/H เท่านั้น)

## 11. คำถามกฎหมาย (ลง `ledger/wo-notes/svc-legal-questions.md` · ที่ปรึกษา J5/J3)
- **PDPA**: `extraFields = SYMPTOM_OPTIONAL` (คลินิก · ซ่อนอยู่) = ข้อมูลสุขภาพ (ข้อมูลอ่อนไหว ม.26) ⇒ ต้องขอความยินยอมโดยชัดแจ้งก่อนเก็บในช่องหมายเหตุนัดหรือไม่ · ระยะเก็บ
- **PDPA**: ลิงก์ตัวตนจาก LINE แสดงชื่อ + เบอร์ปิดบนหน้าจอง (ลิงก์ส่วนตัวอายุ 1 วัน) — พอเป็นมาตรการคุ้มครองหรือไม่ ถ้าลิงก์ถูกส่งต่อ
- **สคบ. (ธุรกิจบริการ/สัญญาสำเร็จรูป)**: กติกา "เลยเวลาฟรีแล้วเลื่อน/ยกเลิกเองไม่ได้ · ไม่มา = ร้านเก็บมัดจำ 100%" ที่ลูกค้ายอมรับตอนจอง — ข้อความในขั้น 3 เพียงพอเป็นการแจ้งเงื่อนไขก่อนทำสัญญาหรือไม่ · มัดจำ 100% เข้าข่ายเบี้ยปรับสูงเกินส่วนหรือไม่

## มติผู้คุม (29 ต.ค.)
- Q1: เลยเวลาฟรี = ห้ามเลื่อน/ยกเลิกเองไปก่อน · คีย์ `booking.late.lateCancelMode` (ยกเลิกได้โดยเสียมัดจำ) ย้ายไปทำใน B.8 พร้อม ORACLE-EDIT b.0 D-KEYS
- Q2: นัดที่พนักงานจอง (STAFF/PHONE) ไม่ยิง booking.created (ค่าปลอดภัย) · B.9 ส่งยืนยันจากทางเดิมที่มีอยู่
- Q3: หน้าจัดการนัดไม่มีภาพแบบ ⇒ ถ่ายภาพจริงให้เจ้าของดูตอน B.12 (ไม่บล็อกใบนี้)
- ป้าย automation "ร้านเลื่อน/ยกเลิก" รวมกรณีลูกค้า = หนี้ B.18
- คำถามกฎหมาย §11 ลง ledger/wo-notes/svc-legal-questions.md แล้ว
- B.7 เปิดให้ลูกค้าจริงพร้อม B.8 เท่านั้น (deploy checklist)

# ใบสั่ง B.9 — แจ้งเตือนลูกค้า 9 ชนิด + ผูก LINE + postback + รับบัตรคิวจากมือถือ (#42) · ตรวจ: **เบา** (รอบเดียว) — ⚠️ คำถาม Q1: แตะทางสาธารณะ (หน้ารับบัตรมือถือ) + postback ข้ามลูกค้า/ข้ามร้าน ⇒ เสนอยกเป็น **เข้ม** · ห้ามตัด: แยกร้าน (X1) · ไม่ส่งซ้ำ (X4/X5) · PDPA ตอนส่ง + ไม่มีเบอร์ใน log/payload (X8) · คำตอบเดียวเมื่อไม่ใช่ของตัวเอง (X7)

> อ้างอิง: MASTER-PLAN แถว B.9 · `DESIGN-BOOKING-QUEUE.md` §4.1 (วงจรงาน · "เตือน LINE 1 วัน/2 ชม. ปุ่ม เช็กอิน · เลื่อน · แจ้งไปไม่ทัน") · R9 · ภาคผนวก ก #42 #47–51 · ภาพ `ledger/design-booking/06-customer-line.png` (ส่วน ข + ค · ถ้อยคำ/ปุ่ม) · `14-messages-devices-roles.png` (ตัวอย่างข้อความ = B.11) · CC §4 (notifyCustomer · ChatLinkCode · postback-routes · signLink) · ใบ R0.7 (สัญญา route §3.4 ใน `src/lib/platform/postback-routes.ts` หัวไฟล์ ข้อ 1–4) · ใบ B.4 §7 ("B.9: postback booking.checkin ⇒ checkIn via LINE หลังตรวจเจ้าของ") · ใบ B.6 §3.4 + §9 (`ticketToken`/`ticketTokenFor` · `deferTicket` · "remoteTicket ย้ายไป B.9" มติ Q6)
> ข้อสอบ (ห้ามแก้): «scripts/qc-svc-b.9.mts» — รับใบ = **ผ่านทุกข้อ** (นับจาก `JSON_SUMMARY`) · SKIP ที่ยอมได้ระหว่างทำ: `G-*` (`--no-regression`) · `S-1` (หลัง merge)
> รัน: `bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-b.9.mts [--no-regression]` (ห้าม `timeout` ครอบ · ห้าม kill กลางคัน — ล้างข้อมูลอยู่ใน finally) · ข้อสอบเปิดตัวจำลอง LINE เอง (127.0.0.1 + `LINE_API_BASE`) และบล็อกคำขอออกนอกเครื่อง — **ไม่ยิง LINE จริง**
> **ฐานของ builder = `session/svc` หลัง merge B.6** (ใช้ `ticketToken`/`ticketTokenFor`/`deferTicket`/`loadTicketView` ของ `src/lib/modules/booking/public-line.ts`) — เริ่มก่อน B.6 merge ได้เฉพาะส่วนที่ไม่พึ่ง (ข้อ K-8 R-2 แดงจนกว่า B.6 เข้า)
> builder: **ห้าม build/next · ห้าม commit/push · ห้าม `pnpm install` · ห้าม migration/แตะ `prisma/**` · ห้ามแก้ข้อสอบ/`scripts/**`** · temp ขึ้นต้น `svc-b9-` · รายงานต่อข้อ (id → ผล)
> ผู้คุมแก้ให้แล้ว (builder ห้ามแตะ): `scripts/svc-qc-data.mts` ต่อท้าย `SQC_VISUAL_SPECS["b.9"]` (หน้ารับบัตรมือถือ 390 · ไม่มีภาพแบบ ⇒ ตรวจล้น/HTTP เท่านั้น)

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ (แตะนอกนี้ = ตีกลับ · ข้อสอบ S-1 ไล่ `git status` ของ src/ prisma/)
| ไฟล์ | ทำอะไร |
|---|---|
| «src/lib/platform/booking-notify.ts» (ใหม่) | §3.1 `notifyBooking` · `runBookingNotifyTick` · `onBookingNotifyEvent` — **ประตูเดียวของข้อความจองคิว** (ข้างในเรียก `notifyCustomer` เท่านั้น) |
| «src/lib/platform/booking-line-link.ts» (ใหม่) | §3.2 รหัสผูก (`issueBookingLinkCode`) · ตัวจัดการ postback/ผูก (`resolveBookingParty` · `onBookingPostback` · `onBookingLinked`) · `BOOKING_POSTBACK_NOT_FOUND` |
| «src/lib/platform/booking-remote.ts» (ใหม่) | §3.3 รับบัตรคิวจากมือถือ (#42): `loadRemoteTicketForm` · `takeRemoteTicket` · `REMOTE_RATE` |
| `src/lib/platform/postback-routes.ts` | §3.4 **เพิ่มบรรทัดลงทะเบียน route `booking.` เท่านั้น** (lazy import · ไม่ลบบรรทัดใด — S-7) |
| `src/lib/platform/minute-jobs.ts` | §3.4 ลงทะเบียน `booking.notify.tick` (ทุก 1 นาที · lazy import) — เพิ่มบล็อกเดียว |
| `src/lib/outbox-consumers.ts` | §3.4 ต่อ `onBookingNotifyEvent` เข้า 4 บรรทัดที่มีอยู่ (`booking.created` · `booking.checked_in` · `queue.ticket.called` · `booking.no_show`) — **ไม่มี event ใหม่** (3 ทะเบียนป้ายไม่ถูกแตะ — S-2) |
| `src/lib/modules/booking/queue-line.ts` · `index.ts` | §3.3 **เพิ่มเท่านั้น**: ตัวคำนวณราคาเวลารอ walk-in แบบอ่านอย่างเดียว (ไม่ล็อก ไม่เขียน — ใช้ `quoteWalkIn`/`planInputOf`/`skippedOf` ชุดเดียวกับ `createWalkIn`) + re-export ที่จำเป็น · พฤติกรรมเดิมทุกฟังก์ชันคงเดิม (G-2 b.4) |
| «src/lib/actions/booking-remote.ts» (ใหม่) | §3.3 server action สาธารณะ `takeRemoteTicketAction(tenantSlug, unitSlug, prev, formData)` |
| «src/app/(store)/s/[tenantSlug]/[unitSlug]/remote/page.tsx» (ใหม่) | §5 หน้ารับบัตรคิวจากมือถือ |
| «src/components/booking/public/RemoteTicket.tsx» (ใหม่ · `'use client'`) | §4 คอมโพเนนต์ (default export) |

ห้ามแตะ: `prisma/**` · `src/lib/core/**` (ใช้ `resolveSettings` · `renderTemplate` · `getDef` · `signLink` · `checkRateLimitDb` · `writeAudit` · `bkkParts`/`bkkYmd` ตามที่มี) · `src/lib/platform/notify-customer.ts` (ชิ้นกลาง R0.7 — ต้องการเพิ่ม = คำขอใน wo-notes) · `src/lib/modules/chat/**` (ใช้ facade `@/lib/modules/chat`: `issueLinkCode`) · `planner*.ts` · `today-line.ts` · `line-ops.ts` · `public-line.ts` (B.6 — ใช้ export ที่มี) · `src/lib/core/settings/defs/**` (ไม่มีคีย์ใหม่ — §6 ข้อ 3) · `src/lib/automation/labels.ts` · `src/lib/webhooks/labels.ts`
> ทำไมอยู่ชั้น platform: ต้อง import ทั้ง booking + chat + notifyCustomer (ไม่มีเส้น booking→chat ใน ALLOWED_EDGES · ไม่เพิ่ม raw prisma ในโมดูล — F5) · แบบเดียวกับ `kanban-bridges.ts` · import โมดูลผ่าน facade (`@/lib/modules/booking` · `@/lib/modules/chat`) หรือไฟล์ที่ใบก่อนเปิดไว้ให้ (`queue-line.ts` · `public-line.ts`)

## 2. หลักการ (ข้อสอบตรวจทุกข้อ)
- **ตัวเชื่อมสลับได้**: ส่งข้อความทุกชนิดผ่าน `notifyCustomer` (ลำดับช่องทาง `messaging.channelOrder` · OA ต่อหน่วย `messaging.lineConnectionId` · เวลาเงียบ `messaging.quietHours` · optOut · dedupe) — ไฟล์ของใบนี้ **ห้าม** เรียกตัวส่ง LINE ตรง (`pushLineMessagesToContact` `pushFlexToParty` `sendLineToParty` `pushToContact` `replyFlex` · ไม่มี `api.line.me`) — S-3 · คำตอบ postback/ผูกรหัสคืนเป็น `PostbackReply` ให้ webhook ตอบเอง
- **นโยบายร้านผ่านทะเบียนค่าตั้งเท่านั้น** (อ่าน `resolveSettings` ต่อคำขอ/ต่อหน่วย · ไม่แคชข้ามคำขอ): `booking.msg.enabled` (เปิด/ปิดต่อชนิด) · `booking.msg.<ชนิด>` (ถ้อยคำ — notifyCustomer render) · `booking.notify.reminderOffsetsMin` · `booking.notify.nearTurnAhead` · `booking.notify.delayAlertMin` · `booking.service.rebookAfterDays` (ชั้น UNIT→SERVICE) · `booking.queue.remoteTicket` · `booking.queue.walkInPickStaff` · ห้ามฮาร์ดโค้ดตัวเลขนโยบาย (S-4: ไม่มี `1440` `120` ในไฟล์ notify)
- **ทุกฟังก์ชันรับ `now` ฉีดได้** (`opts.now ?? new Date()` · ส่งต่อเป็น `at` ของ notifyCustomer และ `now` ของ facade B.4/B.6) · เวลาไทยผ่าน `bkkParts`/`bkkYmd`/`localToUtc` — ห้าม `.getDay()/.getHours()/.getMinutes()/.getDate()/.getMonth()/.getFullYear()` ดิบในไฟล์ใหม่ (S-5)
- **ขอบเขต (X1)**: ทุกคิวรีผูก `tenantId` (+ `unitId` เมื่อมี ctx) · ctx ของ postback มาจากแถว connection เสมอ (ห้ามอ่าน tenant/party จาก data) · tick รับ `tenantIds` (ข้อสอบจำกัดขอบเขต)
- **PII (X8)**: dedupeKey ประกอบจาก id/ตัวเลขเท่านั้น · payload outbox/audit/ops log/console ไม่มีเบอร์/ชื่อ · ผลคืนของทุกฟังก์ชัน (รวม `takeRemoteTicket` · คำตอบ postback) ไม่มีเบอร์ · ข้อความถึงลูกค้ามีชื่อของเขาเองได้ (แม่แบบ `{ชื่อ}`) แต่ไม่มีเบอร์
- **ไม่ throw ในทางปกติ** · consumer ไม่ทำให้ event ล้ม (ข้อความ = ของแถม — ล้ม = แถว `ServiceMessageLog` FAILED · รอบหน้าของ tick ลองใหม่ได้สำหรับชนิดตามเวลา)

## 3. สัญญา (ข้อสอบมีสำเนาชนิด — ชื่อ/ฟิลด์ต้องตรง)

### 3.1 «booking-notify.ts»
```ts
export const BOOKING_MSG_KINDS = ["confirmation","reminder","checkedIn","ticketIssued","nearTurn","yourTurn","delayed","noShowRebook","rebookInvite","courseExpiry"] as const;
export type BookingMsgKind = (typeof BOOKING_MSG_KINDS)[number];
export type BookingNotifyStatus = "SENT" | "SKIPPED_CONSENT" | "SKIPPED_QUIET" | "NO_CHANNEL" | "FAILED" | "SENDING"   // จาก notifyCustomer
  | "DISABLED" | "NOT_FOUND" | "BAD_STATE" | "NO_RECIPIENT";                                                            // ตัดสินก่อนถึง notifyCustomer (ไม่เขียน log)
export type BookingNotifyOutcome = { kind: BookingMsgKind; status: BookingNotifyStatus; dedupeKey: string | null; duplicate: boolean; retryAt: Date | null };
export async function notifyBooking(ctx: { tenantId: string; unitId: string }, i: { appointmentId: string; kind: BookingMsgKind; offsetMin?: number }, opts?: { now?: Date }): Promise<BookingNotifyOutcome>;
export async function runBookingNotifyTick(now: Date, opts?: { tenantIds?: string[] }): Promise<{ units: number; reminder: number; nearTurn: number; delayed: number; rebookInvite: number }>;
export async function onBookingNotifyEvent(evt: { id: string; tenantId: string; type: string; payload: unknown; unitId: string | null }): Promise<void>;
```
**ลำดับตัดสินของ `notifyBooking`** (คืนข้อแรกที่เข้า · `dedupeKey: null` ทุกข้อก่อนถึง notifyCustomer):
1. นัดไม่พบใน `{tenantId, unitId}` (รวม ctx ข้ามร้าน/ข้ามสาขา · id ว่าง) ⇒ `NOT_FOUND`
2. `booking.msg.enabled[kind] !== true` (ค่าที่ resolve ของหน่วย) ⇒ `DISABLED` — **ตรวจก่อนสถานะ** (ทุกชนิดปิดได้ — N-5)
3. `courseExpiry` ⇒ `BAD_STATE` เสมอ (คอร์ส = เฟส CO · หนี้) · สถานะไม่เข้าตาราง ⇒ `BAD_STATE`
4. หาผู้รับ (§3.1.2) ไม่ได้ ⇒ `NO_RECIPIENT`
5. `notifyCustomer(ctx, { unitId, domain: "booking", messageKey: kind, chatContactId? | partyId?, vars, buttons?, dedupeKey, at: now, bypassQuiet })` ⇒ `status` = ผลของ notifyCustomer (QUOTA ⇒ `FAILED`) · `duplicate` = ผล `duplicate === true` · `retryAt` = ผล `retryAt ?? null`

#### 3.1.1 ตารางชนิด (สถานะที่ส่งได้ · dedupeKey · เวลาเงียบ · ปุ่ม) — `m(x)` = `Math.floor(x.getTime()/60000)`
| ชนิด | งาน/บัตรที่ส่งได้ | dedupeKey (ตรงตัว) | ข้ามเวลาเงียบ | ปุ่ม (`NotifyButton`) |
|---|---|---|---|---|
| confirmation | BOOKED · CONFIRMED | `booking:confirmation:<apptId>:<m(startAt)>` | ✓ | postback "เลื่อนนัด" `booking.reschedule?a=<id>` |
| reminder | BOOKED · CONFIRMED · `startAt > now` · ต้องส่ง `offsetMin` (จำนวนเต็ม ≥1) ไม่งั้น BAD_STATE | `booking:reminder:<apptId>:<offsetMin>:<m(startAt)>` | ✗ | postback "เช็กอินเมื่อถึงร้าน" `booking.checkin?a=<id>` + "ไปไม่ทัน · แจ้งร้าน" `booking.late?a=<id>` |
| checkedIn | BOOKED · ARRIVED/IN_SERVICE · มีบัตร | `booking:checkedIn:<apptId>:<queueTicketId>` | ✓ | uri "ดูคิวสด" (เฉพาะ URL `https://`) |
| ticketIssued | WALKIN · QUEUED/ARRIVED · มีบัตร | `booking:ticketIssued:<queueTicketId>` | ✓ | uri "ดูคิวสด" (เฉพาะ `https://`) |
| nearTurn | ARRIVED/QUEUED · บัตร WAITING | `booking:nearTurn:<queueTicketId>` | ✓ | WALKIN: postback "ยังไม่พร้อม · เลื่อนไปคิวหลัง" `booking.defer?a=<id>` |
| yourTurn | ARRIVED/QUEUED · บัตร CALLED | `booking:yourTurn:<queueTicketId>:<callCount>` | ✓ | — |
| delayed | BOOKED · CONFIRMED/ARRIVED (ยังไม่เริ่ม) | `booking:delayed:<apptId>:<m(startAt)>` | ✗ | — |
| noShowRebook | NO_SHOW | `booking:noShowRebook:<apptId>` | ✗ | — |
| rebookInvite | DONE | `booking:rebookInvite:<apptId>` | ✗ | — |
- ตัวแปร (ชื่อตาม `templateVars` ของ defs): `ชื่อ` = customerName (ชื่อระบบของ walk-in "ลูกค้า walk-in" ⇒ "ลูกค้า") · `ร้าน` = ชื่อหน่วย · `เวลา` = เวลานัด (walk-in = เวลาตามแผน) แบบไทย มี `HH:MM` 24 ชม. เวลาไทย (เช่น "ส. 31 ต.ค. 15:30") · `ช่าง` = ชื่อช่างตามแผน (`plannedStaffId ?? staffId`) · `บริการ` = ชื่อบริการ (**หน่วยที่ใช้แม่แบบ CLINIC ⇒ `""` เสมอ** — §6 ข้อ 3) · `เลขคิว` = เลขบัตร · `อีกกี่คิว` = จำนวนงานก่อนหน้าในแถว (นิยามเดียวกับ B.6 `aheadCount`) · `ลิงก์บัตร` = origin + `"/bq/t/" + ticketTokenFor(...)` (B.6) · `ลิงก์นัด` = `""` จนกว่า B.7 มีลิงก์จัดการนัด (หนี้) · `นาทีที่เลื่อน` = `round((แผน − startAt)/นาที)`
- ปุ่มเป็น `NotifyButton` ของ notifyCustomer (uri ต้อง `https://` — ไม่ใช่ https ⇒ ไม่ใส่ปุ่ม uri นั้น ไม่ใช่ส่งล้ม)

#### 3.1.2 ผู้รับ
1. **ผูกด้วยรหัส**: แถว `ChatLinkCode` ของร้าน ที่ `usedAt` ไม่ null และ (`purpose APPOINTMENT · refId = apptId`) หรือ (`purpose QUEUE_TICKET · refId` = บัตรใดของงานนี้ `refType APPOINTMENT · refId = apptId`) → ล่าสุด (`usedAt desc`) → `chatContactId = usedByChatContactId` — **ยกเว้น** ผู้ติดต่อนั้นมี `partyId` และนัดมี `partyId` และไม่ตรงกัน (partyMismatch · สัญญา R0.7 ข้อ 3) ⇒ ไม่ใช้แถวนั้น
2. ไม่งั้น `appointment.partyId` ⇒ `partyId` (notifyCustomer หา LINE ของ Party บน OA ของหน่วย)
3. ไม่มีทั้งคู่ ⇒ `NO_RECIPIENT` (ไม่เรียก notifyCustomer · ไม่มีแถว log)

#### 3.1.3 tick (`runBookingNotifyTick` · minute-job `booking.notify.tick` ทุก 1 นาที · ข้ามร้าน · idempotent ด้วย dedupeKey)
หน่วย BOOKING ของ `tenantIds` (ไม่ส่ง = ทุกร้าน) — ต่อหน่วย resolve ค่าตั้งครั้งเดียว · ชนิดที่ปิด ⇒ ข้ามทั้งหมวด:
- **reminder**: นัด BOOKED CONFIRMED ที่ `now < startAt ≤ now + max(offsets)` · offset `o` "ถึงกำหนด" เมื่อ `startAt − o ≤ now` **และ** `createdAt ≤ startAt − o` (จองก่อนถึงจุดเตือน) · ส่ง **เฉพาะ o ที่เล็กที่สุดที่ถึงกำหนด** (ตัวใหญ่ถูกแทน) ⇒ `notifyBooking(reminder, offsetMin o)` · offsets ว่าง ⇒ ไม่เตือน
- **nearTurn** (หน่วยแถวเดียว): แผนสด ณ now (ลำดับ `waiting` เดียวกับ B.5 `loadTodayLine`) — งานที่บัตร WAITING และจำนวนงานข้างหน้า ≤ `nearTurnAhead` ⇒ `notifyBooking(nearTurn)`
- **delayed** (หน่วยแถวเดียว · `delayAlertMin` ไม่ null): นัด BOOKED ของวันไทยของ now สถานะ CONFIRMED/ARRIVED ยังไม่เริ่ม ที่ `เวลาเริ่มตามแผนสด − startAt ≥ delayAlertMin` ⇒ `notifyBooking(delayed)`
- **rebookInvite**: งาน DONE ที่มี `partyId` และ `rebookAfterDays` (บริการของงาน) ไม่ null · `doneAt + days ≤ now < doneAt + days + 7 วัน` · Party นี้ไม่มีงานอื่นในหน่วยที่สร้างหลัง `doneAt` (ยกเว้น CANCELLED) ⇒ `notifyBooking(rebookInvite)`
- tick ซ้อน 2 รอบ/หลายโพรเซส = ส่งครั้งเดียว (dedupe ของ notifyCustomer) · คืนจำนวนที่ได้ `SENT` ต่อหมวด

#### 3.1.4 event (`onBookingNotifyEvent` · ไม่ throw · payload ต้องมี `appointmentId` · unit = `evt.unitId ?? payload.unitId`)
| event | ทำ |
|---|---|
| `booking.created` | `payload.kind === "BOOKED"` ⇒ confirmation · `"WALKIN"` ⇒ ticketIssued |
| `booking.checked_in` | checkedIn |
| `queue.ticket.called` | yourTurn |
| `booking.no_show` | noShowRebook |
- ต่อใน `outbox-consumers.ts`: บรรทัดเดิมที่เป็น `withAutomation(async () => {})` ⇒ งานหลัก = `async (evt) => (await import("@/lib/platform/booking-notify")).onBookingNotifyEvent(evt)` · `booking.no_show` ⇒ `compose(<เดิม>, <นี้>)` (ของเดิมวิ่งก่อนเหมือนเดิม)
- นัด PENDING → CONFIRMED (มัดจำ/ร้านยืนยัน) ไม่มี event ⇒ B.7/B.8 เรียก `notifyBooking(confirmation)` เองหลังยืนยัน (หนี้ส่งต่อ §7)

### 3.2 «booking-line-link.ts»
```ts
export const BOOKING_POSTBACK_NOT_FOUND: string; // ข้อความกลาง เช่น "ไม่พบรายการนี้ — ติดต่อร้านทางแชทนี้ได้เลย"
export async function issueBookingLinkCode(ctx: { tenantId: string; unitId: string }, i: { appointmentId: string }, opts?: { now?: Date })
  : Promise<{ ok: true; purpose: "APPOINTMENT" | "QUEUE_TICKET"; code: string; deepLink: string | null; expiresAt: Date } | { ok: false; code: "NOT_FOUND" | "NOT_CONFIGURED" | "BAD_STATE"; reason: string }>;
export async function resolveBookingParty(ctx: { tenantId: string }, a: { purpose: string; refId: string }): Promise<string | null>;
export async function onBookingPostback(ctx: PostbackCtx, evt: PostbackEvent, opts?: { now?: Date }): Promise<PostbackReply>;
export async function onBookingLinked(ctx: PostbackCtx, a: LinkedInfo, opts?: { now?: Date }): Promise<PostbackReply>;
```
(`PostbackCtx` `PostbackEvent` `PostbackReply` `LinkedInfo` = `import type` จาก `postback-routes.ts`)
- **issueBookingLinkCode**: นัดไม่พบใน ctx ⇒ `NOT_FOUND` · หน่วยไม่มี `messaging.lineConnectionId` ⇒ `NOT_CONFIGURED` · BOOKED สถานะ PENDING/CONFIRMED/LATE/ARRIVED ⇒ `issueLinkCode({tenantId}, { purpose: "APPOINTMENT", refId: apptId, ttlMin: clamp(ceil((startAt + 1 วัน − now)/นาที), 1, 43200), connectionId })` · WALKIN QUEUED/ARRIVED ที่มีบัตร ⇒ `QUEUE_TICKET · refId = queueTicketId · ttlMin` ถึงสิ้นวันไทย (1–43200 · แบบ B.6) · อื่น ⇒ `BAD_STATE` · `deepLink` = ของ issueLinkCode (OA มี basicId) · `code` คืนครั้งเดียว ห้าม log
- **resolveBookingParty**: `APPOINTMENT` ⇒ `partyId` ของนัด (ร้านนี้) · `QUEUE_TICKET` ⇒ บัตรของร้านนี้ `refType APPOINTMENT` → `partyId` ของงาน · อื่น/ไม่พบ/ร้านอื่น ⇒ `null`
- **ความเป็นเจ้าของ** (`owns(ctx, appt)` — ใช้กับทุก postback): นัดอยู่ร้าน `ctx.tenantId` **และ** `messaging.lineConnectionId` ของหน่วยของนัด = `ctx.connectionId` **และ** (มีแถว ChatLinkCode ตาม §3.1.2 ข้อ 1 ที่ `usedByChatContactId = ctx.chatContactId` · หรือ `appt.partyId` ไม่ null และ = `ctx.partyId`)
- **onBookingPostback** (`evt.action` · พารามิเตอร์ `a` = appointmentId): ไม่มี `a` / นัดไม่พบ / ไม่ใช่เจ้าของ / action ไม่รู้จัก ⇒ `{ text: BOOKING_POSTBACK_NOT_FOUND }` **ข้อความเดียวกันทุกไบต์** (X7) และไม่เขียนอะไร
  - `checkin` ⇒ `checkIn({tenantId, unitId: appt.unitId}, { appointmentId }, { via: "LINE", now })` (B.4 · กดซ้ำ/พร้อมกัน = บัตรเดิม) · สำเร็จ ⇒ ข้อความมีเลขบัตร · ล้ม ⇒ `reason` ของ B.4
  - `late` ("ไปไม่ทัน · แจ้งร้าน"): BOOKED CONFIRMED/LATE ยังไม่เช็กอิน ⇒ `writeAudit({ tenantId, actorType: "SYSTEM", action: "booking.customer.running_late", targetType: "Appointment", targetId, after: { unitId } })` **ครั้งเดียวต่อนัด** (มีแถวแล้ว ⇒ ไม่เขียนซ้ำ) · ตอบข้อความรับทราบ (บอกเวลาผ่อนผันจาก snapshot ได้) · สถานะนัดไม่เปลี่ยน · สถานะอื่น ⇒ ข้อความแจ้งว่าทำไม่ได้ (ไม่ใช่ข้อความกลาง)
  - `defer` (walk-in): `deferTicket(ticketTokenFor(...), { now })` ของ B.6 ⇒ สำเร็จ = ข้อความรับทราบ · ล้ม = reason ของ B.6
  - `reschedule`: ตอบข้อความวิธีเลื่อนนัด (ลิงก์จัดการนัดของ B.7 เมื่อมี · ตอนนี้ "ติดต่อร้านทางแชทนี้เพื่อเลื่อนนัด") — ไม่ใช่ข้อความกลาง
- **onBookingLinked**: `partyMismatch` ⇒ `{ text: LINK_OK_TEXT }` ตรงตัว (ไม่บอกรายละเอียดของ ref) · `QUEUE_TICKET` ⇒ ข้อความยืนยันที่มี **เลขบัตร** (ใช้แม่แบบ `ticketIssued` ที่ render แล้วเมื่อชนิดเปิด · ปิด ⇒ "ผูก LINE แล้ว · บัตร <เลข>") · `APPOINTMENT` ⇒ ข้อความที่มีเวลานัด `HH:MM` · ไม่มีเบอร์ทุกกรณี

### 3.3 «booking-remote.ts» — รับบัตรคิวจากมือถือโดยไม่ต้องมาร้าน (#42)
```ts
export type RemoteTicketForm = { unitName: string; services: { id: string; name: string; durationMin: number }[]; staff: { id: string; name: string }[] | null; waitMin: number | null; maxWaitMin: number | null };
export const REMOTE_RATE: { perClient: { limit: 5; windowMs: 600000 } };
export type RemoteFail = "NOT_FOUND" | "BAD_INPUT" | "RATE_LIMITED" | "TOO_LONG" | "ALREADY" | "WALKIN_DISABLED" | "WALKIN_CLOSED" | "BUSY";
export async function loadRemoteTicketForm(tenantSlug: string, unitSlug: string, opts?: { now?: Date }): Promise<RemoteTicketForm | null>;
export async function takeRemoteTicket(tenantSlug: string, unitSlug: string, i: { serviceId: string; staffId: string | null; phone: string; clientKey: string }, opts?: { now?: Date })
  : Promise<{ ok: true; ticketNumber: string; waitMin: number | null; ticketUrl: string; lineLink: string | null } | { ok: false; code: RemoteFail; reason: string }>;
```
- หน่วยใช้ได้ = slug ร้าน+สาขาตรง · `type BOOKING` · `booking.queue.singleLine = true` · `booking.queue.remoteTicket.enabled = true` — ไม่ครบข้อใด ⇒ ตัวโหลด `null` / `takeRemoteTicket` `NOT_FOUND` **reason เดียวกันทุกกรณี** (X7)
- `takeRemoteTicket` ลำดับ: **rate limit ก่อนแตะฐาน** (`checkRateLimitDb("bq:remote:" + tenantSlug + "/" + unitSlug + ":" + clientKey, REMOTE_RATE.perClient, now)` · เกิน ⇒ `RATE_LIMITED`) → หน่วย (`NOT_FOUND`) → เบอร์ (ต้องมี · `bookingPhoneKey` ≥ 9 หลัก ⇒ ไม่งั้น `BAD_INPUT`) → **เบอร์นี้มีงาน WALKIN ของวันไทยนี้ในหน่วยที่ยัง active (QUEUED/ARRIVED/IN_SERVICE) ⇒ `ALREADY` โดยไม่คืนลิงก์บัตร** (กันคนพิมพ์เบอร์คนอื่นแล้วได้ลิงก์ยกเลิกบัตร) → ราคาเวลารออ่านอย่างเดียว ณ now (บริการ/ช่างที่ขอ) `> maxWaitMin` (ไม่ null) ⇒ `TOO_LONG` **ไม่สร้างแถว** → `createWalkIn(ctx, { serviceId, staffId, channel: "REMOTE", customerPhone: phone }, { now })` (B.4 · ผล WALKIN_* / BUSY / NOT_FOUND ส่งต่อ) → `ticketUrl = "/bq/t/" + ticketTokenFor(ctx, ticketId)` (B.6) · `lineLink` = `issueLinkCode QUEUE_TICKET` (แบบ B.6 KioskTicket) ⇒ `deepLink` หรือ `null`
- `loadRemoteTicketForm`: บริการ active ที่รับ walk-in (`booking.service.walkIn`) เรียง sortOrder,createdAt,id · `staff` ตาม `booking.queue.walkInPickStaff` (false ⇒ null) · `waitMin` = ราคาเวลารอของบริการแรกแบบใครก็ได้ · `maxWaitMin` = ค่าตั้ง
- ผลคืน/ข้อผิดพลาด **ไม่มีเบอร์/ชื่อ**
- action «booking-remote.ts» (`"use server"` · export async function เท่านั้น · ไม่มี session): อ่าน `serviceId` `staffId` (`""` = ใครก็ได้) `phone` · `clientKey` = IP แรกของ `x-forwarded-for` (ไม่มี = "unknown") · คืนผลของ facade ให้ `useActionState`

### 3.4 การต่อสาย
- `postback-routes.ts`: `POSTBACK_ROUTES` มี `{ prefix: "booking.", resolveParty, onPostback, onLinked }` ที่ lazy import «booking-line-link.ts» (`(await import(...)).onBookingPostback(ctx, evt)` — route ไม่ส่ง now) — ไม่แก้บรรทัดอื่น
- `minute-jobs.ts`: `registerMinuteJob({ name: "booking.notify.tick", everyMinutes: 1, cadence: "minute", run: async (now) => (await import("@/lib/platform/booking-notify")).runBookingNotifyTick(now) })`
- `outbox-consumers.ts`: §3.1.4

## 4. สัญญา DOM — «RemoteTicket.tsx» (`'use client'` · default export · props `{ form: RemoteTicketForm; action: (prev: unknown, fd: FormData) => Promise<unknown>; initial?: <ผลของ takeRemoteTicket> }` · ห้าม import ค่าจาก `@/lib/modules/**`/`@/lib/platform/**`/`@/lib/core/db`/`@prisma/client` — `import type` ได้)
- ราก `data-bq-remote` · ฟอร์ม `<form data-bq-remote-form>`: บริการ = `input[type=radio][name=serviceId]` ต่อบริการ · `form.staff` ไม่ null ⇒ `name="staffId"` (มีตัวเลือก `value=""` = ใครก็ได้) · `input[name=phone]` มี `required` · `button[type=submit]` ≥ 44px · แสดงเวลารอโดยประมาณ (`form.waitMin`)
- ผลสำเร็จ (`initial` หรือ state): `data-bq-remote-ticket="<เลขบัตร>"` · ลิงก์ `a[data-bq-remote-open]` `href = ticketUrl` · `a[data-bq-remote-line]` `href = lineLink` **เฉพาะเมื่อไม่ null** · ผลล้ม: `data-bq-remote-error` + reason · HTML ไม่มีเบอร์
- มือถือ 390 ไม่ล้นแนวนอน (V-1)

## 5. หน้า
- `/s/[tenantSlug]/[unitSlug]/remote`: `loadRemoteTicketForm` → null ⇒ `notFound()` · `<RemoteTicket form action={takeRemoteTicketAction.bind(null, tenantSlug, unitSlug)} />` · `export const dynamic = "force-dynamic"` · `metadata.robots = { index: false, follow: false }`

## 6. จุดที่แบบไม่ชัด — ผู้เขียนข้อสอบเลือกแล้ว (ผู้คุมเคาะได้ · เปลี่ยน = ORACLE-EDIT)
1. **ชั้น platform** ไม่ใช่ `modules/booking` (เหตุผล §1) — ไม่ต้องเพิ่มเส้น booking→chat / ไม่เพิ่ม F5
2. **ผู้รับ = ผูกด้วยรหัสก่อน แล้วค่อย Party** · walk-in ที่ไม่มีเบอร์ผูกได้ด้วยรหัสบัตรอย่างเดียว (ไม่สร้าง Party) · ไม่ต้องมี migration (อ่าน `ChatLinkCode.usedByChatContactId`)
3. **คลินิกซ่อนชื่อบริการ** ด้วยแม่แบบของหน่วย (`SettingProfile.templateKey = "CLINIC"` ⇒ ตัวแปร `บริการ` ว่างเสมอ แม้ร้านแก้ถ้อยคำใส่ `{บริการ}`) — ทางที่สะอาดกว่าคือคีย์ใหม่ `booking.notify.hideServiceName` แต่ชน b.0 `D-KEYS` (ต้อง ORACLE-EDIT) ⇒ Q2
4. **ไม่มี event ใหม่** · ข้อความล้มไม่ทำให้ event retry (ของแถม) · ชนิดตามเวลาลองใหม่ได้เองรอบหน้า (dedupe เดิมคืน FAILED/SKIPPED_QUIET ให้ลองใหม่)
5. **reminder**: ส่งเฉพาะ offset ที่เล็กที่สุดที่ถึงกำหนด + ต้องจองก่อนจุดเตือน (จอง 1 ชม. ก่อนนัด ⇒ ไม่เตือน 2 ชม.) · เวลาเงียบเลื่อนไปส่งหลังเวลาเงียบ (tick รอบถัดไปลองใหม่) ตราบที่ยังไม่ถึงเวลานัด
6. **ข้ามเวลาเงียบ** เฉพาะข้อความที่ลูกค้ารอทันที (ยืนยัน · เช็กอินแล้ว · ได้บัตร · ใกล้ถึงคิว · ถึงคิว) · เตือน/เลื่อน/ไม่มา/ชวนกลับ เคารพเวลาเงียบ
7. **rebookInvite / noShowRebook = ข้อความบริการ** (ไม่ต้องยินยอมการตลาด · optOut ยังบล็อก) — รอที่ปรึกษา PDPA J5 (Q3) · ถ้อยคำห้ามมีโปรโมชัน
8. **"ไปไม่ทัน"** = บันทึก audit ครั้งเดียวต่อนัด + ตอบรับทราบ (ไม่เปลี่ยนสถานะ · การแสดงบนจอ "ต้องจัดการ" ของ B.5 = หนี้)
9. **remoteTicket**: ต้องใส่เบอร์ · เบอร์ซ้ำวันเดียวกัน = `ALREADY` ไม่คืนลิงก์ · ตรวจ maxWaitMin ก่อนสร้าง (แข่งพร้อมกันอาจเกินเล็กน้อย — ยอม) · rate limit 5/10 นาที/ผู้ใช้ (ค่าคงที่ความปลอดภัย) · หน้าใช้ slug ได้ (หน้าร้านสาธารณะเดิมใช้ slug อยู่แล้ว) — ลิงก์บัตรที่ได้คือ token ของ B.6
10. **nearTurn ส่งเมื่อข้างหน้า ≤ N** แม้เพิ่งรับบัตร (คนที่คิวสั้นอยู่แล้วได้ทั้ง "ได้บัตร" และ "ใกล้ถึงคิว") — ยอม (ข้อความต่างกัน)
11. `courseExpiry` ไม่ส่ง (คอร์ส = เฟส CO) · `ลิงก์นัด` ว่างจนถึง B.7

## 7. เกณฑ์รับ
- «scripts/qc-svc-b.9.mts» เขียวทุกข้อ — หมวด **PC** ตัวควบคุม (เขียวก่อนมีงาน: ข้อมูล · ตัวจำลอง LINE + notifyCustomer + dedupe · ผูกรหัสของ R0.7) · **N** notifyBooking (เปิด/ปิด · ถ้อยคำแก้ · เวลาเงียบ · ผู้รับ · X1 · คลินิก · optOut · ไม่มี OA · ผูกรหัส · partyMismatch) · **E** consumer ส่งซ้ำ/พร้อมกัน + **หลายโพรเซสพร้อมกัน = ข้อความเดียว** · **T** tick (reminder · จองหลังจุดเตือน · nearTurn · delayed · rebookInvite · tick ซ้อน · tenantIds) · **K** รหัสผูก + postback (เจ้าของ · ข้ามลูกค้า · ข้ามร้าน · ไปไม่ทัน · เลื่อนคิว · ทะเบียน) · **R** remoteTicket · **U** DOM · **P** สแกน PII · **S** ไฟล์/สัญญาโค้ด · **G** regression · **Z**
- regression (G · รันหลังล้างข้อมูล): `qc-svc-b.5 --no-regression` · `qc-svc-b.4 --no-regression` · `qc-svc-b.11 --no-regression` · `qc-svc-r0.7` (postback-routes) · `qc-svc-smoke` — ไม่มี FAIL
- typecheck + fitness 2 โหมด (ผู้คุม) · ภาพ V-1 (ผู้คุม: QC server + `visual-svc b.9`) · ตรวจรอบเดียว (หรือ 2 ถ้าผู้คุมเคาะ Q1)

## 8. ไม่ใช่เรื่องของใบนี้ / หนี้ส่งต่อ
- **B.7**: ยิง `booking.created` ของนัดออนไลน์ (ใบนี้ฟังอยู่แล้ว) · ลิงก์จัดการนัด ⇒ เติม `ลิงก์นัด` + ปุ่ม "เลื่อนนัด" แบบ uri · แสดงรหัส/ลิงก์ผูก LINE (`issueBookingLinkCode`) ในหน้ายืนยันการจอง
- **B.8**: PENDING → CONFIRMED (มัดจำผ่าน) เรียก `notifyBooking(confirmation)`
- **B.5 (ใบแก้)**: แสดง "ลูกค้าแจ้งไปไม่ทัน" (audit `booking.customer.running_late`) ในการ์ด "ต้องจัดการ" · ปุ่ม "ผูก LINE" (แสดงรหัส) บนจอพนักงาน
- **C.2**: ทดสอบลิงก์เปิดแชทพร้อมรหัส/ปุ่ม postback กับ LINE จริง · คู่มือร้าน
- **CO**: courseExpiry · **S.1**: SMS (ใส่ใน `messaging.channelOrder` แล้วใช้ได้ทันทีเพราะผ่าน notifyCustomer)
- consumer ที่ล้มชั่วคราว (FAILED) ของชนิด event (ยืนยัน/เช็กอิน/ถึงคิว) ไม่ลองซ้ำอัตโนมัติ — งานกวาดซ้ำ = ใบหลังถ้าเจอจริง

## 9. คำถามผู้คุม (ค่าปลอดภัยใช้ไปก่อน)
- **Q1 ระดับตรวจ**: ใบนี้เปิดทางสาธารณะใหม่ (หน้ารับบัตรมือถือ · rate limit · กันลิงก์บัตรรั่วด้วยเบอร์) + postback ที่ต้องตรวจเจ้าของข้ามลูกค้า/ข้ามร้าน ⇒ เสนอ **เข้ม (2 ผู้ตรวจ)** แบบเดียวกับมติ B.6 Q5 · ค่าปลอดภัย: เข้ม
- **Q2 คลินิกซ่อนบริการ**: ใช้แม่แบบ CLINIC (§6 ข้อ 3) หรือเพิ่มคีย์ `booking.notify.hideServiceName` (ต้อง ORACLE-EDIT b.0 D-KEYS + B.11 การ์ด notify แสดงเพิ่มอัตโนมัติ) · ค่าปลอดภัย: แม่แบบ (ไม่แตะ defs)
- **Q3 PDPA (J5)**: rebookInvite/noShowRebook ถือเป็นข้อความบริการ — ถ้าที่ปรึกษาตีเป็นการตลาด ⇒ ต้องเช็กยินยอม `MemberConsent(LINE, granted)` ก่อนส่ง (ใบแก้เล็ก)
- **Q4 ฐาน builder**: ต้องรอ B.6 merge (K-8 R-2 พึ่ง `public-line.ts`) — เปิด builder หลัง B.6 เข้า `session/svc`

## มติผู้คุม (29 ต.ค.)
- Q1: B.9 = **เข้ม** (ทางสาธารณะใหม่ + postback ข้ามลูกค้า/ร้าน) ⇒ ผู้ตรวจ 2 คน
- Q2: ซ่อนชื่อบริการ = คีย์ค่าตั้ง `booking.notify.hideServiceName` (แม่แบบ CLINIC ค่าเริ่ม true · อื่น false) ตามหลัก "ทุกนโยบายร้าน = ค่าตั้ง" · ผู้คุม ORACLE-EDIT b.0 D-KEYS ตอน merge
- Q3: rebookInvite / noShowRebook = ข้อความบริการไปก่อน · ถามที่ปรึกษา J5 (PDPA) แล้ว · ถ้าตีเป็นการตลาดต้องเช็กความยินยอม (หนี้)
- Q4: builder เริ่มหลัง B.6 merge เข้า session/svc แล้ว rebase เลนนี้

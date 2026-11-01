# SDS — บัตรคิว (QUEUE / Q) · AS-BUILT V2

> as of `b3de0dce` (`session/svc` · 1 พ.ย. 2569 · SVC B.18 ส่วนเอกสาร) — สร้างจากโค้ด · แทนที่ฉบับ AS-BUILT 2026-07-16 (เนื้อหาเดิมที่ยังจริงคงไว้ · เพิ่มส่วนที่ RUN SVC แตะ: บัตรแถวเดียวของจองคิว · `etaAt` · งานรายนาที · event)
> คู่กับสเปกฟังก์ชัน `docs/modules/04-queue.md` (V2) · จองคิว `docs/sds/modules/booking.md` · แผน `ledger/SVC-MASTER-PLAN.md` (B.4 · B.6 · B.9)
> ตัวเลขนับจากโค้ดวันนี้: model 8 + enum 4 (`prisma/schema/queue.prisma`) · คีย์ outbox `queue.*` ที่มีตัวรับ 3 · export ของ `src/lib/modules/queue/service.ts` 30 ชื่อ (ค่า 27 + type 3) · server action `src/lib/modules/queue/actions.ts` 18 · คีย์สิทธิ์ `queue.*` 18 · งานรายนาที 1 · **ไม่มี facade `index.ts`** (ผู้เรียกนอกโมดูล import `service.ts` ตรง)

## 1. หน้าที่ · ชั้น · ไฟล์
บัตรคิว walk-in มาก่อนได้ก่อน: ออกบัตร → เรียกต่อเคาน์เตอร์ → จบบริการ + จอทีวีสาธารณะ · Layer 3 · scope = unit · ไม่มีคอลัมน์เงิน (การเงินอยู่ POS) · ใช้ 2 แบบ:
1. **หน่วย QUEUE (บัตรคิวทั่วไป · รุ่นแรก)** — ประเภทคิว/เคาน์เตอร์/จอที่ร้านตั้งเอง · หน้า `/app/u/[unitSlug]/queue` · พฤติกรรมเดิม (RUN SVC ไม่เปลี่ยน · ยืนยันด้วย regression `qc-queue-public` + ชุด queue ใน `qc-systems`)
2. **บัตรแถวเดียวของจองคิว (หน่วย BOOKING · SVC B.4)** — `QueueTicket` เป็นบัตร P (นัดที่เช็กอิน) / A (walk-in) ผูก `refType = "APPOINTMENT"` + `refId` · สถานะบัตรเดินตามงาน (`booking/queue-line.ts` ผ่าน `moveTicketTx`) · ประเภทระบบ `APPOINTMENT` + `WALKIN` (`ensureSystemQueueType` · ตัวอักษรนำจาก `booking.queue.prefixes`) · `etaAt` เขียนโดยตัววางคิว (`booking/planner-run.ts`) · หน้าบัตร/ทีวี/ตู้ใช้ของจองคิว (`src/app/(store)/bq/*`) ไม่ใช่หน้า `/s/.../queue/*`

- โค้ด: `src/lib/modules/queue/service.ts` (740 บรรทัด) · `src/lib/modules/queue/actions.ts` (server action ของหน้าพนักงาน · `assertCan` ทุกตัว) · `src/app/(store)/s/[tenantSlug]/[unitSlug]/queue/actions.ts` (รับบัตรออนไลน์ สาธารณะ)
- หน้าพนักงาน: `/app/u/[unitSlug]/queue` (บอร์ด: ออกบัตร · เปิด/ปิดเคาน์เตอร์ · เรียกถัดไป · เรียกซ้ำ · เริ่ม · ข้าม · จบ · โอน · เรียกคืนที่ข้าม · ยกเลิก · `AutoRefresh`) · `/app/u/[unitSlug]/queue/setup` (ประเภท · เคาน์เตอร์ · จอ)
- หน้าสาธารณะ: `/s/<ร้าน>/<สาขา>/queue` (รับบัตรออนไลน์) · `/s/<ร้าน>/<สาขา>/queue/t/[publicToken]` (สถานะบัตร: เหลือกี่คิว + เวลารอโดยประมาณ) · `/s/<ร้าน>/<สาขา>/queue/display/[displayToken]` (จอทีวี) — ทุกหน้ารีเฟรชด้วย `src/components/queue-auto-refresh.tsx` (`router.refresh()` ทุก 5 วินาที · ไม่มี SSE)
- REST: `GET /api/v1/queue/tickets?date=&take=` (`src/app/api/v1/queue/tickets/route.ts` · คีย์ API แบบเต็มสิทธิ์รุ่นเดิมเท่านั้น `requireLegacyFullAccessKey` · ≤ 200 แถว/หน่วย)
- ผู้เรียกนอกโมดูล (grep): `booking/queue-line.ts` · `booking/line-ops.ts` · `booking/planner-run.ts` · `booking/public-line.ts` · `booking/service.ts` · `src/lib/ai/proposals.ts` · `src/lib/platform/minute-jobs.ts`

## 2. Models (8 · `prisma/schema/queue.prisma`)
| model | หน้าที่ | หมายเหตุ as-built |
|---|---|---|
| `QueueType` | ประเภทคิว `code` (GENERAL/PREMIUM/APPOINTMENT/WALKIN/อื่น) `prefix` `priority` `onlineIssuable` `kioskIssuable` `requireContact` `avgServiceMinFallback` `status` `isSystem` · unique `[unitId,code]` `[unitId,prefix]` | APPOINTMENT/WALKIN ของจองคิวสร้างโดยระบบ (`ensureSystemQueueType`) |
| `QueueCounter` | เคาน์เตอร์ `code` `name` `status` OPEN/CLOSED/ARCHIVED `activeUserId` | เปิดเคาน์เตอร์ = ตั้ง `activeUserId` เป็นผู้กด · ปิด = null |
| `QueueCounterType` | เคาน์เตอร์ ↔ ประเภทที่รับ (ไม่มีแถว = รับทุกประเภท) | |
| `QueuePolicy` | 1 แถว/หน่วย: `notifyBeforeCount` `skippedExpiryMin` `recallAnnounceMax` `transferToFront` `onlineIssueOpen` `starvationRatio` | โค้ดอ่านจริงเฉพาะ `onlineIssueOpen` (รับบัตรออนไลน์) และ `skippedExpiryMin` (ข้าม → ไม่มา · ค่าเริ่ม 60) · ที่เหลือไม่มีผู้อ่าน (grep) |
| `QueueDailySequence` | ตัวนับเลขต่อ (หน่วย × ประเภท × วันทำการ) · increment atomic ผ่าน raw upsert · reset โดย key | |
| `QueueTicket` | บัตร `businessDate` `seq` `number` `status` (WAITING CALLED SERVING DONE SKIPPED NO_SHOW CANCELLED) `priority` snapshot `channel` (KIOSK ONLINE STAFF BOOKING) `counterId` `memberId` `contact*` `refType/refId` `publicToken` (unique) `callCount` `partyId` · **`etaAt`** (SVC B.0 · เวลาคาดถึงคิวจากตัววางคิว) | `notifiedAt` ไม่มีผู้เขียน |
| `QueueTicketEvent` | audit ทุกการเปลี่ยน `action` `actorType` `detail` | |
| `QueueDisplay` | จอทีวี `displayToken` (unique) `settings` `revokedAt` | หน่วย BOOKING ใช้แถวนี้เป็นอุปกรณ์ทีวี/ตู้ (B.6 · `displayToken` = `sha256:<hex>` · `settings.kind`) |

enum: `QueueTypeStatus` · `QueueCounterStatus` · `QueueTicketStatus` · `QueueIssueChannel`

## 3. Outbox events (3 `queue.*` · `src/lib/outbox-consumers.ts`)
| คีย์ | ผู้ผลิต (grep) | ตัวรับ |
|---|---|---|
| `queue.served` | `queue/service.ts#markDone` (บัตรทั่วไปจบบริการ · ใน tx เดียวกับสถานะ · CRM C2.9) | CRM VISIT (`crmBridge("onBusinessEvent")`) |
| `queue.ticket.called` | `booking/queue-line.ts` · `booking/line-ops.ts` (บัตรแถวเดียว · เรียก/เรียกซ้ำ) | `booking-notify.ts#onBookingNotifyEvent` (ข้อความ "ถึงคิว") |
| `queue.ticket.done` | `booking/queue-line.ts` (บัตรแถวเดียว) | no-op |

บัตรแถวเดียว **ไม่ยิง** `queue.served` (`moveTicketTx` หัวฟังก์ชัน · booking.completed ทำหน้าที่ VISIT แล้ว ไม่ลงซ้ำ)
**งานรายนาที 1** (`src/lib/platform/minute-jobs.ts`): `queue.housekeeping` ทุก 5 นาที → `runQueueHousekeeping` = `resetDaily` (บัตรค้างข้ามวัน → CANCELLED `END_OF_DAY`) + `expireSkipped` (SKIPPED เกิน `skippedExpiryMin` → NO_SHOW) ทุกหน่วยที่มีบัตรค้าง · **ข้ามบัตร `refType APPOINTMENT`** (สิ้นวันของจองคิวทำใน `booking.line.tick`) · updateMany มีเงื่อนไขสถานะ ⇒ ยิงซ้อนได้

## 4. Service API (`src/lib/modules/queue/service.ts` · ค่า 27)
- วัน/หน่วย: `businessDateOf(tz,d)` · `resolveQueueUnit(tenantSlug,unitSlug)`
- อ่าน: `listOnlineTypes` · `getPublicOverview` · `listTypes` · `listCounters` · `listDisplays` · `getBoard` · `listWaiting` · `getTicketStatus(unitId,publicToken)` (ตำแหน่ง + เวลารอ) · `getDisplaySnapshot(unitId,displayToken)`
- ออกบัตร: `issueTicket` · `issueTicketTx` (ใช้ใน tx ของผู้เรียก — จองคิวออกบัตร P/A) · `ensureSystemQueueType` (B.4) · `findActiveTicketByPhone`
- เปลี่ยนสถานะ: `callNext` (เลือก `priority DESC, createdAt ASC` ตามประเภทที่เคาน์เตอร์รับ) · `recall` · `skip` · `recallSkipped` · `serve` · `markDone` · `cancel` · `transfer` (กลับ WAITING ที่เคาน์เตอร์ใหม่ · เลขเดิม · เรียงตาม `createdAt` เดิม) · `moveTicketTx` (B.4 · บัตรแถวเดียว · ไม่ยิง outbox)
- งาน: `resetDaily` · `expireSkipped` · `runQueueHousekeeping` (B.4)
- type: `Ctx` · `IssueTicketInput` · `TicketMove`

## 5. สิทธิ์ (`src/lib/core/permissions.ts` module `queue` · 18 คีย์ · ทุก action ผ่าน `ctxOf(unitSlug, คีย์)` → `assertCan` ใน `queue/actions.ts` · action ที่แตะบัตรรับเฉพาะหน่วยชนิด `QUEUE` (`ticketCtxOf` · SVC B.5 — บัตรแถวเดียวห้ามเปลี่ยนผ่านทางคิวเดิม))
`queue.type.create` · `queue.type.delete` · `queue.counter.create` · `queue.counter.delete` · `queue.counter.open` · `queue.counter.close` · `queue.counter.setTypes` · `queue.display.create` · `queue.display.revoke` · `queue.ticket.issue` · `queue.ticket.callNext` · `queue.ticket.recall` · `queue.ticket.recallSkipped` · `queue.ticket.serve` · `queue.ticket.done` · `queue.ticket.skip` · `queue.ticket.cancel` · `queue.ticket.transfer`
- บัตรแถวเดียวของจองคิวใช้คีย์ `booking.*` (`booking.queue.operate` · `booking.checkin` · `booking.walkin.create` · `booking.job.run(Any)` — ดู SDS booking §5) ไม่ใช้คีย์ `queue.*`
- สาธารณะ: รับบัตรออนไลน์ rate limit 5 ครั้ง/นาที/IP/หน่วย (`checkRateLimit` in-memory) · ประเภทต้อง ACTIVE + `onlineIssuable` · `requireContact` ⇒ เบอร์ 9–15 หลัก · เบอร์มีบัตร active วันนี้ ⇒ พาไปบัตรเดิม · สถานะบัตร/จอ = `publicToken`/`displayToken` (cuid · เดาไม่ได้)

## 6. เวลารอ (หน้าสถานะบัตร)
`estimateMin = ceil((คิวข้างหน้า + 1) ÷ เคาน์เตอร์ที่เปิด × avgServiceMinFallback)` (`getTicketStatus`) · บัตรที่มี `etaAt` (แถวเดียว) ⇒ ใช้ `etaAt − now` แทน · ไม่มีค่าเฉลี่ยจากเวลาจริง

## 7. ข้อสอบ
- `scripts/qc-queue-public.mts` (รับบัตรออนไลน์ · หน้าสถานะ) · ชุด queue ใน `scripts/qc-systems.mts` (issue → call → done)
- บัตรแถวเดียว: `scripts/qc-svc-b.4.mts` (บัตร P ผูก ref ถูก · หน่วย QUEUE เดิมทำงานเหมือนเดิม · housekeeping ข้ามบัตรจองคิว) · `qc-svc-b.5.mts` · `qc-svc-b.6.mts` (ทีวี/หน้าบัตรไม่มีชื่อ/เบอร์ X8 · token ผิด = คำตอบเดียว X7) · `qc-svc-b.9.mts` (ถึงคิว/ใกล้ถึงคิว · บัตรจากมือถือ)

## 8. หนี้ที่รู้ (as-built)
- ไม่มี facade `src/lib/modules/queue/index.ts` — จองคิว import `queue/service.ts` ตรง (ขัดแบบแผน facade ของ RUN อื่น)
- บัตรคิวทั่วไป: ไม่มีแจ้งเตือนใกล้ถึงคิว (`notifyBeforeCount`/`notifiedAt` ไม่มีผู้ใช้ — แจ้งเตือนมีเฉพาะบัตรแถวเดียวผ่าน `booking-notify.ts`) · ไม่มีเสียงเรียก/SSE (จอรีเฟรช 5 วินาที) · ไม่มีหน้าตู้ kiosk ของหน่วย QUEUE (ตู้มีเฉพาะจองคิว `/bq/kiosk/[token]`) · ลูกค้ายกเลิกบัตรเองจากหน้าสถานะไม่ได้ · ไม่มีรายงาน/สถิติคิว
- `QueuePolicy.transferToFront` · `recallAnnounceMax` · `starvationRatio` ไม่มีผู้อ่าน (strict priority) · rate limit รับบัตรออนไลน์เป็น in-memory ต่อ instance (ไม่ข้ามเครื่อง · ต่างจากของจองคิวที่ใช้ `checkRateLimitDb`)
- ใบเลื่อน KT.1: SSE · เสียงเรียก · พิมพ์บัตรความร้อน (ทั้งบัตรทั่วไปและแถวเดียว)

# Queue / บัตรคิว (Q) (AS-BUILT 2026-07-16)

## หน้าที่ · ผู้ใช้ · ตำแหน่งในชั้น (อ้าง 02)
ระบบบัตรคิว walk-in: ออกบัตร → เรียกคิวต่อเคาน์เตอร์ → จบบริการ + จอ TV สาธารณะ. ผู้ใช้: staff (เรียกคิว) + ลูกค้า (รับบัตร kiosk/online/ดูสถานะ). **Layer 3: Business** — scope=unit. ไม่มี field เงิน (การเงินอยู่ POS).
โค้ด: `src/lib/modules/queue/service.ts` · `src/lib/modules/queue/actions.ts` · schema `prisma/schema/queue.prisma`.

## Data model (prisma/schema/queue.prisma)
- **QueueType** — ประเภทคิว: `code`(GENERAL/PREMIUM/APPOINTMENT/custom) `prefix`(1-3 ตัว) `priority` `onlineIssuable/kioskIssuable` `requireContact` `avgServiceMinFallback` `status`(ACTIVE/HIDDEN/ARCHIVED) `isSystem`. unique `[unitId,code]` และ `[unitId,prefix]`.
- **QueueCounter** — เคาน์เตอร์: `code` `name` `status`(OPEN/CLOSED/ARCHIVED) `activeUserId?`. unique `[unitId,code]`,`[unitId,name]`.
- **QueueCounterType** — mapping counter↔type ที่รับ (ไม่มีแถว=รับทุกประเภท). unique `[counterId,typeId]`.
- **QueuePolicy** — 1 แถว/unit: `notifyBeforeCount` `skippedExpiryMin` `recallAnnounceMax` `transferToFront` `onlineIssueOpen` `starvationRatio?`. `@@unique unitId`.
- **QueueDailySequence** — ตัวนับต่อ (unit×type×businessDate): `value` increment atomic ผ่าน raw upsert · reset รายวันโดย key. unique `[unitId,typeId,businessDate]`.
- **QueueTicket** — บัตร: `businessDate` `seq` `number`(prefix+pad) `status`(WAITING/CALLED/SERVING/DONE/SKIPPED/NO_SHOW/CANCELLED) `priority`(snapshot) `channel`(KIOSK/ONLINE/STAFF/BOOKING) `counterId?` `memberId?`(scalar) `contact*` `refType/refId`(handoff Booking) `publicToken`(unique) `callCount` `notifiedAt` ...timestamps. unique `[unitId,typeId,businessDate,seq]`. index call-next `[unitId,businessDate,status,priority,createdAt]` + กันรับซ้ำ `[unitId,contactPhone,businessDate,status]`.
- **QueueTicketEvent** — audit ทุก transition: `action`(ISSUED/CALLED/RECALLED/SKIPPED/TRANSFERRED/SERVING/DONE/NO_SHOW/CANCELLED/NOTIFIED) `actorType` `detail`.
- **QueueDisplay** — จอ TV: `displayToken`(unique) `settings`(voice/lang/chime) `revokedAt?`.

## Service API (src/lib/modules/queue/service.ts)
- `businessDateOf(tz,d)` — วัน BKK · `resolveQueueUnit(tenantSlug,unitSlug)`.
- `listTypes/listCounters/listDisplays(ctx,...)` — อ่านทะเบียน.
- `issueTicket({...})` — ออกบัตร: จองเลขจาก QueueDailySequence (atomic), snapshot priority, ตรวจ channel issuable + กันรับซ้ำต่อเบอร์/วัน, log event ISSUED.
- `findActiveTicketByPhone(ctx,phone)` — หาบัตร active ของเบอร์.
- `callNext(...)` — เลือกบัตรถัดไปตาม priority+เวลา สำหรับ counter (คำนึง type ที่ counter รับ), →CALLED.
- `recall/skip/recallSkipped/serve/markDone/cancel/transfer(...)` — state transitions (แต่ละตัว log event).
- `getBoard/listWaiting(ctx)` — สถานะบอร์ด staff · `getTicketStatus(unitId,publicToken)` · `getDisplaySnapshot(unitId,displayToken)` — public read.
- `resetDaily(ctx)` · `expireSkipped(ctx)` — งาน cron/รายวัน (SKIPPED เกิน expiry → NO_SHOW).

## การเชื่อมต่อ
- **Booking (handoff)**: บัตร refType="APPOINTMENT" refId=appointmentId (channel BOOKING).
- **Member**: `memberId` scalar → Customer.id (ไม่ผูก relation ข้ามโมดูล).
- ไม่มี outbox event · ไม่มีเส้นเงิน.

## Permissions (assertCan ใน actions.ts)
`queue.type.create` · `queue.type.delete` · `queue.counter.create` · `queue.counter.delete` · `queue.counter.open` · `queue.counter.close` · `queue.display.create` · `queue.display.revoke` · `queue.ticket.issue` · `queue.ticket.recall` · `queue.ticket.skip` · `queue.ticket.serve` · `queue.ticket.done` · `queue.ticket.cancel` · `queue.ticket.transfer`.

## UI
- Backoffice: `/app/u/[unitSlug]/queue` (เรียกคิว) · `/app/u/[unitSlug]/queue/setup` (ประเภท/เคาน์เตอร์/จอ).
- Public: `/(store)/s/[tenantSlug]/[unitSlug]/queue/display/[displayToken]` (จอ TV) · หน้า unit สำหรับรับบัตร/ดูสถานะ (publicToken).

## การทดสอบ
- `scripts/qc-systems.mts` — queue อยู่ในชุด 7 ระบบ (happy path issue→call→done ผ่าน service จริง, ~30 assertion รวมทุกระบบ).

## ข้อจำกัด/หนี้ที่รู้ + WO อนาคต
- `starvationRatio` = null → strict priority (starvation prevention ยังไม่เปิด).
- แจ้งเตือนลูกค้า (notifiedAt) เป็น field — การส่งจริงผ่าน LINE รอ WO-0067 (LINE OA ลึก).
- i18n จอ TV/เมนู → WO-0066 (i18n v2).

# Ticket / ตั๋ว-อีเวนต์ (AS-BUILT 2026-07-16)

## หน้าที่ · ผู้ใช้ · ตำแหน่งในชั้น (อ้าง 02)
ขายตั๋วอีเวนต์: อีเวนต์ + ประเภทตั๋ว(quota) + ออเดอร์ขาย/จอง manual + ตั๋วรายใบ(code) + เช็คอิน. ผู้ใช้: staff (ขาย/เช็คอินหน้างาน). **Layer 3: Business** — scope=unit. ชำระเงินเข้าเส้นเงินผ่าน POS (markPaid).
โค้ด: `src/lib/modules/ticket/service.ts` · `src/lib/modules/ticket/actions.ts` · schema `prisma/schema/ticket.prisma`.

## Data model (prisma/schema/ticket.prisma)
- **TicketEvent** — งาน: `name` `venue?` `coverImageUrl?` `startAt/endAt?` `status`(DRAFT/PUBLISHED/ENDED/CANCELLED) `publishedAt/archivedAt`.
- **TicketType** — ประเภทตั๋ว: `name` `priceSatang` `quota` `sold`(ตัดแล้ว=PENDING+PAID ที่ยังไม่ยกเลิก) `active`.
- **TicketOrder** — ออเดอร์: `orderNo`(TO-YYMMDD-#### running ต่อ unit/วัน) `customerId?` `buyerName/Phone`(snapshot) `status`(PENDING/PAID/CANCELLED) `totalSatang` `channel`(STAFF|ONLINE) `paidAt/cancelledAt`. unique `[unitId,orderNo]`.
- **TicketAdmission** — ตั๋วรายใบ: `code`(opaque QR, unique `[unitId,code]`) `priceSatang`(snapshot) `attendeeName?` `status`(VALID/CHECKED_IN/VOID) `checkedInAt/By`.
- เงิน Int สตางค์ · เวลา UTC แสดง BKK.

## Service API (src/lib/modules/ticket/service.ts) — ctx {tenantId,unitId}
- `listEvents/getEvent/eventSummary` — อ่าน (summary รวมยอดขาย/เช็คอิน).
- `createEvent/updateEvent/setEventStatus/publishEvent/archiveEvent`.
- `addTicketType/updateTicketType/deactivateTicketType`.
- `createOrder(...)` — สร้างออเดอร์ PENDING: ตัดโควตา (sold+=), gen orderNo, สร้าง TicketAdmission ต่อใบ (code) status VALID, snapshot buyer.
- `markPaid(ctx, orderId)` — PENDING→PAID: **สร้าง PosSale ผ่าน createSale** (payMethods CASH totalSatang, service.ts:346) sourceModule TICKET → outbox → บัญชี, ตั้ง paidAt.
- `cancelOrder(ctx, orderId, client)` — →CANCELLED: คืนโควตา (sold-=), admissions→VOID; ถ้า PAID มาก่อน จะ void PosSale ตามเส้นเงิน.
- `checkIn(...)` — สแกน code → VALID→CHECKED_IN (กันเช็คอินซ้ำ), บันทึก checkedInBy.
- `listAdmissions/listOrders/resolveUnit`.

## การเชื่อมต่อ
- **ออก → POS**: `markPaid` เรียก `createSale` (sourceModule=TICKET) → PosSale → outbox `pos.sale.paid` → account-bridge → บัญชี (เส้นเงินกลาง 02). void ผ่าน cancelOrder ตามเส้นเดียวกัน.
- **Member**: TicketOrder.customerId → Customer.id (optional).
- ไม่มี outbox event ของตัวเอง.

## Permissions (assertCan ใน actions.ts)
`ticket.event.create` · `ticket.event.archive` · `ticket.type.create` · `ticket.type.delete` · `ticket.order.create` · `ticket.order.cancel` · `ticket.checkin.scan`.

## UI
- `/app/u/[unitSlug]/ticket` (รายการงาน) · `/app/u/[unitSlug]/ticket/event/[id]` (จัดการงาน/ประเภท/ออเดอร์) · `/app/u/[unitSlug]/ticket/checkin` (เช็คอิน).

## การทดสอบ
- `scripts/qc-ticket-money.mts` (Fable oracle, WO-0007) — ขายตั๋ว markPaid → รายได้เข้าบัญชีอัตโนมัติ (ชุด TK-2.*, severity CRITICAL). fail-before: ticket ไม่เคยเรียก POS → TK-2.* แดง.
- `scripts/qc-systems.mts` — ticket ในชุด 7 ระบบ (happy path).

## ข้อจำกัด/หนี้ที่รู้ + WO อนาคต
- Defer: ชำระออนไลน์จริง (PaymentIntent), สแกน QR กล้อง, storefront ขายสาธารณะ, seat map, หลายรอบ(session), point earn, refund policy.
- เข้าเส้นเงินด้วย CASH คงที่ (ยังไม่มีหลายวิธีจ่ายที่ ticket layer).

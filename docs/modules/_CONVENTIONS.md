# SHARK — มาตรฐานกลางสำหรับสเปคทุกโมดูล (_CONVENTIONS)

> ทุกสเปคโมดูล (01–14) ต้องยึดเอกสารนี้ + `../BLUEPRINT.md` + `../BLUEPRINT_BUSINESS_UNITS.md`
> ภาษา: เขียนสเปคเป็นภาษาไทย, ชื่อ code/model/field เป็นอังกฤษ

## 1. Scope ข้อมูล (ห้ามเถียง — ตัดสินแล้ว)

| โมดูล | ไฟล์ | scope |
|---|---|---|
| Hotel | 01-hotel.md | unit |
| Restaurant | 02-restaurant.md | unit |
| Booking (นัดหมาย) | 03-booking.md | unit |
| Q (บัตรคิว) | 04-queue.md | unit |
| Ticket (อีเวนต์) | 05-ticket.md | unit |
| Member (CRM) | 06-member.md | **tenant** |
| Reward | 07-reward.md | **tenant** (+applicableUnitIds) |
| Coupon & Voucher | 08-coupon.md | **tenant** (+applicableUnitIds) |
| Point | 09-point.md | **tenant** (ledger tag unitId?) |
| Chat (ลูกค้า↔ร้าน) | 10-chat.md | **tenant** (message tag unitId?) |
| Meeting (ภายใน) | 11-meeting.md | **tenant** |
| Account | 12-account.md | unit ledger + tenant consolidated view |
| Kanban | 13-kanban.md | **tenant** (บอร์ด link unitId? ได้) |
| POS | 14-pos.md | unit |

- unit-scoped: ทุกตารางมี `tenantId + unitId`, unique = `@@unique([unitId, ...])`
- tenant-scoped: มี `tenantId`, unique = `@@unique([tenantId, ...])`

## 2. Integration Contracts — **v2 (หลัง QC — ดู docs/qc/RESOLUTIONS.md ประกอบ)**

> refType ทุกที่ = **ชื่อ Prisma model ตรงตัว** (`'PosSale'`, `'RewardRedemption'`, `'Appointment'`, …)
> Event naming = `<module>.<entity>.<pastTense>` (เช่น `pos.sale.paid`) — registry ใน CORE_API.md
> ทุก mutation service รับ `tx?` (Prisma tx client) optional เพื่อ join transaction ผู้เรียก

### 2.1 Payment — POS เป็นจุดตัดเงินเดียว (เอกสารจริง = model `PosSale`)
```
createSale({ tenantId, unitId, memberId?, sourceModule: 'HOTEL'|'RESTAURANT'|'BOOKING'|'TICKET'|'POS',
  sourceId,                       // บังคับเมื่อ sourceModule ≠ POS
  idempotencyKey,                 // บังคับเสมอ — deterministic ต่อการชำระ 1 ครั้ง
  paymentMode: 'PAID_NOW' | 'PENDING_PAYMENT',
  lines: [{name, qty>0, unitPriceSatang≥0, discount?}],   // ห้าม line ติดลบ
  couponCode?, burnPoints?,       // ใช้แต้มเป็นส่วนลด (POS เรียก point.quoteBurn/burn)
  payMethods: [{type: CASH|TRANSFER|PROMPTPAY|CARD🔜|VOUCHER🔜|DEPOSIT|ROOM_CHARGE, amount, refSaleId?}] })
→ { saleId, receiptNo?, grandTotal, pointEarned? /*nullable — earn เป็น post-commit outbox*/ }
```
- **ลำดับคำนวณตายตัว:** ส่วนลดบรรทัด → ท้ายบิล → coupon.redeem → point.burn (ส่วนลดแต้ม) → total → VAT (อ่านจาก `unit.settings.account.*` ที่เดียว) → ตรวจ Σ payMethods
- **PENDING_PAYMENT** (Ticket/Hotel online): สร้าง sale + PaymentIntent → ยืนยันเงินเข้า (v1 manual/สลิป, webhook 🔜) → emit `pos.sale.paid {saleId, sourceModule, sourceId}` → side effects ทั้งหมดเกิดตอนนั้น · หมดอายุ → `pos.sale.expired`
- **DEPOSIT** = วิธีชำระอ้างบิลมัดจำเดิม (`refSaleId`) — ไม่กระทบฐาน VAT, **ไม่ earn แต้มซ้ำ** (earn คิดจาก Σ payMethods ที่ไม่ใช่ DEPOSIT/ROOM_CHARGE)
- **ROOM_CHARGE** → เรียก `hotel.chargeToRoom()` (cross-unit) — บิลต้นทางไม่ยิง point/account (ไปเกิดตอน settle ที่โรงแรม)
- Void/refund ผ่าน POS เท่านั้น (`voidSale/refundSale`) → reverse ทุก side effect + emit `pos.sale.voided` / `pos.sale.refunded`
- Side effects (point/account/member.recordSpend/activity.log) = **post-commit ผ่าน outbox กลาง + retry** — บิลไม่ล้มเพราะโมดูลอื่นล่ม

### 2.2 Point — Point เป็นผู้คำนวณแต้มเสมอ (ผู้เรียกส่งยอดเงิน ไม่ส่ง delta)
```
point.earn({ tenantId, memberId, unitId?, amountSatang, sourceModule, refType, refId, idempotencyKey, tx? })
point.burn({ tenantId, memberId, points, refType, refId, idempotencyKey, tx? })      // throw ถ้า balance ไม่พอ
point.quoteBurn({...})                        // read-only preview
point.reverse({ tenantId, refType, refId, idempotencyKey })   // void/refund/ยกเลิกแลก — คงอายุ lot เดิม ยอมติดลบได้
point.adjust({...+reason})                    // staff แก้มือเท่านั้น + audit
```
`idempotencyKey` บังคับทุก mutation (`@@unique([tenantId, idempotencyKey])` เป็นด่านสุดท้าย)

### 2.3 Coupon — ตรวจ 2 จังหวะ + คืนสถานะ
```
coupon.validate({ code, tenantId, unitId, memberId?, amountSatang /*ฐาน = subtotal หลังส่วนลดบรรทัด+ท้ายบิล ก่อนแต้ม/VAT*/, module })  // read-only เรียกซ้ำได้
coupon.redeem({ ...validate args, saleId, tx })    // atomic re-validate ใน tx เดียวกับบิล
coupon.release({ tenantId, saleId, reason, tx? })  // เรียกโดย voidSale/refundSale
```

### 2.4 Account — semantic facade เท่านั้น (โมดูลอื่นห้ามรู้ account code)
```
account.postSale / postRefund / postVoid ({ tenantId, unitId, saleId, docType, grandTotal, vatAmount,
  discountTotal, pointDiscount, payMethods[], sourceModule, businessDate, idempotencyKey })
→ { journalId, abbInvoiceNo }        // POS เก็บ abbInvoiceNo ลง PosSale แปะใบเสร็จ
account.postPointBurn / postExpense (...)
```
`account.post` (raw lines) = internal ของโมดูล Account เท่านั้น · mapping: unit override → tenant default → seed → suspense 9999+needsReview (ไม่ block การขาย) · idempotent ด้วย `(refType, refId)`

### 2.5 Notification — service กลาง + consent gate
```
notify({ tenantId, to: {memberId|userId|email|phone}, channel: EMAIL|LINE🔜|WEB, template, data })
```
- template naming: dot.case `<module>.<event>` — registry กลาง (~71 ใบ) ใน CORE_API.md
- ทุก template ระบุ class `TRANSACTIONAL` (ส่งได้เสมอ) | `MARKETING` (**notify() บังคับตรวจ consent เอง** — รวมแจกคูปอง manual)
- มี NotificationLog + dedupe tag

### 2.6 Member identity + services
ลูกค้าอ้างด้วย `memberId` เสมอ — โมดูลอื่นไม่ copy ชื่อ/เบอร์ไปเก็บ (snapshot ได้เฉพาะเอกสาร freeze เช่น ใบเสร็จ)
```
member.findOrCreate({ tenantId, phone?|email?, name?, source, consents?, tx? })   // เบอร์ normalize E.164
member.sendOtp / verifyOtp({ channel: 'phone'|'email', ... })   // guest→member ที่โต๊ะ/check-in/หน้างาน
member.recordSpend({ tenantId, memberId, unitId, amountSatang, saleId })  // POS เรียกหลังปิดบิล (outbox) — trigger เดียวของ tier engine
member.getProfile / resolveSegmentMembers({ segmentId })        // อ่าน (Chat panel / แจกคูปอง)
```

### 2.7 Activity timeline — ทุกโมดูลธุรกิจต้องยิง
```
activity.log({ tenantId, memberId, unitId?, module, type, refType, refId, summary })   // ผ่าน outbox กลาง
```
Producer บังคับ: POS·Hotel·Restaurant·Booking·Ticket·Reward·Coupon·Point·Chat (ตาราง event ใน RESOLUTIONS D6)

### 2.8 มาตรฐานกลางเพิ่มเติม (หลัง QC)
- **SSE topic:** `t:{tenantId}:u:{unitId}:{module}:{topic}` · tenant: `t:{tenantId}:{module}:{topic}` · public: `pub:{unitId}:{module}:{topic}`
- **Public storefront API:** `/api/store/[tenantSlug]/[unitSlug]/<module>/...` · tenant-level `/api/store/[tenantSlug]/<module>/...`
- **Permission action:** `<module>.<entity>.<action>` (มี module prefix เสมอ)
- **DailyStat กลางตัวเดียว** (REPORTS.md) — โมดูลห้ามสร้างตาราง summary เอง (ยกเว้น Hotel night audit)
- **VAT/ภาษี:** `unit.settings.account.*` เป็น source of truth เดียว
- **Outbox/retry queue กลาง** = platform infra (Stage A2a) — side effects ทุก contract วิ่งผ่านตัวนี้

## 3. Prisma / Naming
- Model: PascalCase นำหน้าด้วยโดเมนเมื่อชนกันได้ (`HotelRoom`, `PosProduct`, `QueueTicket` — กันชน `Ticket` โมดูลอีเวนต์)
- Enum: SCREAMING_SNAKE ค่า, ชื่อ enum PascalCase
- เงิน: `Int` สตางค์ (satang) ทุกที่ — ห้าม Float. currency THB default
- เวลา: `DateTime` UTC, timezone ร้านอยู่ `unit.settings.timezone` (default Asia/Bangkok)
- ทุกตาราง: `createdAt`, `updatedAt`, soft-delete ใช้ `status`/`archivedAt` — ไม่มี hard delete ข้อมูลธุรกรรม
- id: cuid()

## 4. โครงสเปคแต่ละไฟล์ (ทุกไฟล์ต้องมีครบ 12 หัวข้อ)
1. **ภาพรวม + ขอบเขต** (ทำอะไร/ไม่ทำอะไรใน v1)
2. **Persona & User Stories** (Owner/Manager/Staff/Customer ที่เกี่ยว)
3. **ฟังก์ชันทั้งหมด** (แตก feature list ครบ ระดับ production — แยก MVP ✅ / Phase ถัดไป 🔜)
4. **Data Model** (Prisma schema จริง compile ได้ ครบ relation/index/unique)
5. **API Endpoints** (REST path + method + payload หลัก + สิทธิ์)
6. **UI Screens** (ทุกหน้าจอ dashboard + storefront ถ้ามี, mobile behavior)
7. **Business Flows** (sequence หลัก step-by-step รวม failure path)
8. **Integration** (เรียก contract ข้อ 2 ตรงไหน อย่างไร)
9. **Permissions** (ตาราง action × role: OWNER/MANAGER/STAFF + custom)
10. **Reports & Metrics** (รายงานที่ผู้ประกอบการต้องได้)
11. **Edge Cases & Rules** (กติกาธุรกิจ, race condition, ข้อควรระวัง)
12. **QC Checklist** (เกณฑ์ตรวจรับของโมดูลนี้ — functional + isolation + i18n)

## 5. กติการ่วมอื่น
- ทุกหน้า UI: i18n TH/EN, B&W minimal, responsive (mobile-first), empty state + loading + error state ครบ
- Realtime ใช้ SSE เป็น default (Q display, KDS, Chat) — WebSocket เฉพาะที่จำเป็น
- Rate limit + audit log (`AuditLog` กลาง: who/what/when/before/after) กับ action ที่แตะเงิน/แต้ม/สิทธิ์
- เอกสารเงิน (ใบเสร็จ/บิล) ต้อง immutable — แก้ = ออกใบใหม่อ้างใบเดิม (void/reissue)

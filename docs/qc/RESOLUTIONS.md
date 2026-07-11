# SHARK — คำตัดสินหลัง QC (RESOLUTIONS) — FINAL

> สถานะ: **ตัดสินแล้ว มีผลเหนือสเปคทุกไฟล์** — ไฟล์โมดูลที่ขัดกับเอกสารนี้ต้องแก้ตาม
> ที่มา: QC1-money-path, QC2-crm-chain, QC3-schema-convention, QC4-core-platform (83 findings)
> ตัดสินโดย: Fable 5 (architect) 2026-07-11 · ผู้พัฒนา (Opus 4.8) ต้องอ่านไฟล์นี้ + _CONVENTIONS v2 ก่อนเริ่มโค้ด

## D1 — Payment Intent / จ่ายออนไลน์แบบ pending (ปิด QC1-C1, C2)
POS v1 เพิ่มความสามารถ **PENDING_PAYMENT sale**:
- `createSale` รับ `paymentMode: 'PAID_NOW' | 'PENDING_PAYMENT'` — PAID_NOW = พฤติกรรมเดิม (Σ payMethods = grandTotal)
- PENDING_PAYMENT: สร้าง sale สถานะ `PENDING_PAYMENT` + `PosPaymentIntent` (PromptPay QR / โอนแนบสลิป, expireAt) → ยังไม่ยิง point/account/ใบเสร็จ
- ยืนยันเงินเข้า: v1 = staff/FINANCE กดยืนยันสลิป (idempotent ด้วย paymentRef) · gateway webhook = 🔜 (interface รองรับแล้ว)
- เมื่อยืนยัน → sale เป็น PAID → ออกเลขใบเสร็จ + side effects ทั้งหมด + emit **`pos.sale.paid {saleId, sourceModule, sourceId}`**
- หมดอายุไม่จ่าย → `pos.sale.expired` → ต้นทาง (Ticket ปล่อย hold, Hotel ปล่อย HOLD)
- ผู้ใช้: Ticket checkout, Hotel storefront มัดจำ — in-store ใช้ PAID_NOW เหมือนเดิม

## D2 — มัดจำ: ห้าม line ติดลบ → payMethod `DEPOSIT` (ปิด QC1-C3)
- มัดจำถูกเก็บเป็น sale ปกติตอนจ่าย (VAT + แต้ม earn ณ ตอนนั้น)
- ตอน settle: หักด้วย `payMethods: [{type:'DEPOSIT', amount, refSaleId}]` — เป็น "วิธีชำระ" ไม่ใช่ line → ไม่กระทบฐาน VAT ของบิล settle และ **ไม่ earn แต้มซ้ำ** (earn คิดจาก Σ payMethods ที่ไม่ใช่ DEPOSIT/ROOM_CHARGE)
- Account: DEPOSIT method โพสต์เป็นการล้าง liability (facade จัดการเอง)

## D3 — POS → Account ใช้ facade เท่านั้น (ปิด QC1-C4, QC3-C2, M7)
- POS เรียก `account.postSale / postRefund / postVoid` — **ห้ามรู้ account code** (mapping อยู่ฝั่ง Account)
- payload: `{unitId, saleId, docType, grandTotal, vatAmount, discountTotal, pointDiscount, payMethods[], sourceModule, businessDate}`
- Account คืน `abbInvoiceNo` → เพิ่ม field `PosSale.abbInvoiceNo String?` แปะบนใบเสร็จ
- ตัวเลขผัง 1010/2100 ฯลฯ ในสเปค 14 = ตัวอย่างผิด ให้ลบ

## D4 — Voucher (ปิด QC1-M4, QC3-C1)
ยึดคำตัดสิน 08: **v1 voucher = ส่วนลดผ่าน `coupon.redeem` จุดเดียว** — ตัด payMethod `VOUCHER` ออกจาก POS v1 (enum เก็บไว้ ทำงาน 🔜 พร้อมระบบขาย gift voucher)

## D5 — Point service signatures (ปิด QC1-M1, M2, QC2-M1..M3)
ยึด 09 ทั้งหมด + approve ข้อเสนอ _CONVENTIONS ทั้ง 4:
- `point.earn({tenantId, memberId, unitId?, amountSatang, sourceModule, refType, refId, idempotencyKey, tx?})` — **Point เป็นผู้คำนวณแต้มเสมอ** โมดูลอื่นส่งยอดเงิน ไม่ส่ง delta
- `point.burn({tenantId, memberId, points, refType, refId, idempotencyKey, tx?})` · `point.quoteBurn(...)` read-only
- `point.reverse({tenantId, refType, refId, idempotencyKey})` — ใช้กับ void/refund/ยกเลิกแลกรางวัล (**ห้ามใช้ adjust แทน** — reverse คงอายุ lot เดิม)
- `point.adjust` = staff แก้มือ + เหตุผล + audit เท่านั้น
- `idempotencyKey` บังคับทุก mutation · ทุก service รับ `tx?` optional (join transaction ผู้เรียก)
- **POS v1 ต้องมี "ใช้แต้มเป็นส่วนลด"** (จุดขายแพลตฟอร์ม): ลำดับใน createSale = validate → coupon → **quoteBurn/burn แต้ม** → total → VAT → payMethods → (post-commit) earn จากยอดจ่ายจริง — earn fail ไม่ rollback บิล (outbox), `pointEarned` ใน response เป็น nullable
- Reward คืนแต้ม/ยกเลิก → `point.reverse` (ไม่ใช่ adjust+)

## D6 — Member services + timeline (ปิด QC2-C1, C2, M4, M7, QC1-M3)
- เพิ่ม contract **2.6b `member.findOrCreate({tenantId, phone?|email?, name?, source, consents?, tx?})`** + **`member.sendOtp / verifyOtp`** (channel phone/email) — ใช้โดย Restaurant โต๊ะ, Hotel check-in, Ticket guest, Booking
- เพิ่ม contract **2.7 `activity.log({tenantId, memberId, unitId?, module, type, refType, refId, summary})`** — ยิงผ่าน outbox เดียวกับ point/notify
- **ตาราง producer บังคับ:** POS(sale) · Hotel(booking, checkin/out) · Restaurant(order ปิดบิล) · Booking(นัด DONE/NO_SHOW) · Ticket(ซื้อ/เข้างาน) · Reward(แลก) · Coupon(ใช้) · Point(earn/burn/expire) · Chat(เธรด resolved) — โมดูลเหล่านี้ต้องเพิ่มแถว Integration ในสเปคตัวเอง
- **POS ต้องเรียก `member.recordSpend({memberId, amountSatang, unitId, saleId})` หลังปิดบิล (outbox)** — เป็น trigger เดียวของ tier engine
- Merge: 06 เพิ่ม step ย้าย `CouponCode.memberId` + `RewardRedemption.memberId` ใน transaction merge + กติกา per-member limit หลัง merge = นับรวม (union) + โค้ด PERSONAL ซ้ำแคมเปญ → เก็บทั้งคู่แต่ redeem ได้ตาม limit รวม
- Ticket guest checkout: ระบุ earn-attach (09 §3.3) — สมัครสมาชิกภายหลังผูกแต้มบิลย้อนหลังตาม policy

## D7 — Event naming standard (ปิด QC4-C3, QC1-minor)
รูปแบบเดียว: **`<module>.<entity>.<pastTense>`** — registry กลางอยู่ QC4 §ค + CORE_API.md
`pos.sale.paid` · `pos.sale.voided` · `pos.sale.refunded` · `pos.sale.expired` · `core.membership.unitAccessChanged` · `core.membership.removed` · `queue.ticket.done` ฯลฯ — subscriber ทุกไฟล์แก้ให้ใช้ชื่อเต็ม (ห้าม `sale.voided` / `sale.paid` เปล่า)

## D8 — refType standard (ปิด QC3-C3)
ใช้**ชื่อ Prisma model ตรงตัว**: `'PosSale'`, `'RewardRedemption'`, `'Appointment'`, `'HotelBooking'`, `'TicketOrder'` — แก้ทุกที่ที่ใช้ `'SaleDocument'`/`'SALE_DOCUMENT'`/`'POS_SALE'` ให้เป็น `'PosSale'` · คำว่า `SaleDocument` ใน _CONVENTIONS = ชื่อแนวคิด ไม่ใช่ model

## D9 — VAT/ภาษี source of truth เดียว (ปิด QC4-C2, QC3-M2)
`unit.settings.account.*` (vatMode, vatRate, taxId, หัวใบกำกับ) เป็นแหล่งเดียว — **ลบ `settings.pos.vat`** POS อ่านจาก account settings

## D10 — Public API prefix มาตรฐานเดียว (ปิด QC3-M1)
- unit-scoped storefront: `/api/store/[tenantSlug]/[unitSlug]/<module>/...`
- tenant-scoped storefront: `/api/store/[tenantSlug]/<module>/...` (member/point/chat widget)
- แก้ 01-05 (`/api/store|/api/s|/api/public` เดิม) ให้ตรง

## D11 — DailyStat กลางตัวเดียว (ปิด QC4-M7, QC3-M5)
`ChatDailyStat` ยุบเข้า `DailyStat` กลาง (module=CHAT) — ยกเว้นเดียวที่มี summary ตัวเอง = Hotel night audit (ruling เดิมใน REPORTS) · `PlatformDailyStat` (15) อยู่ได้ (คนละชั้น platform-level)

## D12 — ROOM_CHARGE ผู้เรียกชัดเจน (ปิด QC1-M6)
- POS + Restaurant เพิ่ม payMethod `ROOM_CHARGE` (แสดงเฉพาะ tenant ที่มี unit type HOTEL ที่ ACTIVE) → เรียก `hotel.chargeToRoom({folioRef, amount, sourceSaleId})` (cross-unit ผ่าน flag `crossUnit:true`)
- บิลที่จ่าย ROOM_CHARGE: **ไม่ยิง point/account ที่ต้นทาง** — เกิดตอน settle ที่โรงแรม (ตาม 01)
- เป็น MVP ✅ เมื่อเปิดโมดูล Hotel ร่วม, ไม่งั้นซ่อน

## D13 — Impersonation ยึด 15-backoffice (ปิด QC4-M4, M5)
30 นาที read-only default + WRITE ต้อง SUPER_ADMIN + blocklist = union ของ SECURITY∪15 + audit ทั้งสองชั้น (middleware กลาง) — SECURITY.md แก้ตาม · session backoffice ยึดของ 15: `__Host-bo_session` 60m idle/12h absolute

## D14 — SSE topic scheme เดียว (ปิด QC4-M2)
`t:{tenantId}:u:{unitId}:{module}:{topic}` · tenant-level: `t:{tenantId}:{module}:{topic}` · public (จอคิว/TV): `pub:{unitId}:{module}:{topic}` — ทุกโมดูลแก้ตาม

## D15 — Notify template naming เดียว (ปิด QC4-M3)
dot.case: `<module>.<event>` เช่น `booking.confirmed`, `queue.almost`, `hotel.booking.confirmed` — registry กลางใน QC4 (~71 templates) ย้ายเข้า CORE_API.md ตอน Stage A + ทุก template ระบุ class `TRANSACTIONAL|MARKETING` — **notify() เป็นผู้บังคับ consent gate** (MARKETING ต้องมี consent, TRANSACTIONAL ส่งได้เสมอ) — ปิด QC2-M5, M6: แจกคูปอง manual ก็ผ่าน gate นี้

## D16 — Stage A ใหม่ (ปิด QC4-C1, M1, M8..M13)
ยึด **QC4 §ข checklist 47 รายการ** เป็น Stage A อย่างเป็นทางการ แบ่ง:
- **A1** (23): foundation + Tenant.status ครบค่า + resolver + event bus + membership.* events + permissions JSON schema + bizDate + naming standards 3 ชุด (D7/D14/D15)
- **A2a** (block Stage B): AuditLog, notify()+consent gate+NotificationLog, cron runner+X-Cron-Secret, **outbox/retry queue กลาง** (นิยามเป็น infra ถาวร), DailyStat+statUpsert, Tenant.limits
- **A2b** (block Stage C+BO): SSE hub, object storage+upload service (2 โหมด presigned+endpoint sniff), feature flags, platformPrisma, ExportService, backoffice slots (widget/banner/imp middleware)
- **A3** (10 กลุ่ม stubs): contract stubs ทุกตัวใน _CONVENTIONS v2 + getUnitKpi registry + StatProvider
- ปล่อย **Stage B หลัง A1+A2a+A3** (A2b ทำขนานกับ Stage B ได้) · โมดูล 15 = Stage D ใน WORKPLAN · gate ใช้ v2 12 ข้อจาก QC4

## D17 — เรื่องย่อยที่ตัดสินตาม QC เสนอ
- Kanban MANAGER exception: **ยอมรับ** — บันทึกใน BLUEPRINT_BUSINESS_UNITS §3 (บอร์ดสิทธิ์ตาม membership ไม่ auto ตาม unitAccess)
- Permission action naming: `<module>.<entity>.<action>` มี module prefix เสมอ (แก้ 05, 12)
- เงินสดจากบิล source อื่นที่จ่ายที่หน้าร้าน: ถ้ามี shift เปิด ให้ผูก shiftId เข้ากะเสมอ (แก้ 14 §กะ)
- Model name registry = QC3 §ข (161 models) เป็นทะเบียนกลาง — model ใหม่ห้ามซ้ำ
- 07 อ้าง `tierLevel` → ใช้ `MemberTier.level` ตาม 06
- MINOR ที่เหลือ (timestamps ครบ, ชื่อ field เงิน `*Satang` เสมอ ฯลฯ) — แก้ตามรายงาน QC ระหว่าง implement, ไม่ block

## ผลกระทบต่อไฟล์ (ใครต้องแก้อะไร — fix pass)
| ไฟล์ | แก้ตาม |
|---|---|
| _CONVENTIONS.md | v2 ทั้ง section 2 (D1-D10, D15) ✅ แก้แล้ว |
| 14-pos.md | D1,D2,D3,D4,D5,D6,D7,D9,D12,D17 |
| 12-account.md | D2,D3,D9 (รับ DEPOSIT/facade payload) |
| 01-hotel.md | D1,D2,D7,D8,D10,D12 |
| 02-restaurant.md | D6,D7,D8,D10,D12 |
| 05-ticket.md | D1,D6,D7,D8,D10,D17(prefix) |
| 03-booking.md | D6,D8,D10 |
| 06-member.md | D6 (OTP service, merge steps, recordSpend spec) |
| 09-point.md | D5 (ยืนยัน signatures เป็นทางการ) |
| 07-reward.md | D5 (reverse แทน adjust), D17 (tierLevel) |
| 08-coupon.md | D6 (merge/limit), D15 (consent gate) |
| 10-chat.md | D11 (DailyStat), D14 |
| 11-meeting.md | D14 |
| 04-queue.md | D7,D10,D14 |
| 15-backoffice.md | D13 (ยืนยัน), D16 |
| SECURITY.md | D13 |
| REPORTS.md | D11 (CHAT module enum) |
| BLUEPRINT_BUSINESS_UNITS.md | D17 (Kanban exception) |
| WORKPLAN_PARALLEL.md | D16 ✅ แก้แล้ว |

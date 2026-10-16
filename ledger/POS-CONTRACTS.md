# POS ใหม่ — สัญญาการเชื่อมต่อ (contracts C-6 … C-13) + event ทั้งหมด

> 1 ต.ค. 2569 · ต่อจาก `docs/BLUEPRINT_CONNECTIONS.md` (C-1…C-5) และ `docs/modules/_CONVENTIONS.md` (2.1…2.8) · คู่กับ `ledger/DESIGN-POS.md` §5
> กติกาเดิมทุกข้อคง: เชื่อม = opt-in ต่อสาขา · ไม่เชื่อมก็ขายได้ · idempotencyKey ทุก mutation · refType = ชื่อ Prisma model · side effect ผ่าน outbox กลาง (`src/lib/core/outbox.ts emitOutbox` ใน tx เดียวกับเอกสารเงิน) · POS ไม่รู้ผังบัญชี
> ⚠️ เอกสารแบบ ยังไม่แตะโค้ด · ชื่อฟังก์ชันเป็นข้อเสนอ ให้ oracle writer/builder ยึดเป็นสัญญา

## 0. หลักการ 4 ข้อที่ทุก contract ต้องเป็นไปตาม
1. **เงินทุกบาทผ่าน `createSale`** (contract 2.1 เดิม) — ช่องทางใหม่ (LINE MAN/Grab/เว็บ/แชท) สร้าง `PosOrder` ก่อน (P2.8 มติ 1 · เดิมเขียน `ExternalOrder`) แล้วค่อยกลายเป็น `PosSale` ด้วย createSale เสมอ
2. **สต็อกทุกชิ้นผ่าน Inventory C-1** — BOM = POS คำนวณบรรทัดวัตถุดิบแล้วเรียก `inv.consume` ชุดเดียว ไม่แตะ onHand เอง
3. **ลูกค้า = `memberId` (Customer.id) + `partyId`** — ตามสมาชิก v2 · บิลเก็บ `memberSnapshot`
4. **ของที่สมาชิก v2 สร้างไว้แล้ว ใช้ของเดิม**: ว่อชเชอร์ (`Voucher`/`VoucherTemplate`) · บัตรของขวัญ (`GiftCard`/`GiftCardTxn`) · สแตมป์ (`StampCard`/`StampEvent`) · ที่มาลูกค้า (`MemberAttribution`) · สิทธิ์ระดับ (`MemberTierBenefit`) — `PosSale` มีคอลัมน์รองรับแล้ว (`voucherUseIds` `giftCardTxnId` `tierDiscountSatang` `stampEventIds` `attributionId` `giftCardId`) **ห้ามสร้างตารางซ้ำ**

## C-6 ช่องทางขาย (SalesChannel) — "ทุกบิลรู้ว่ามาจากไหน"
```ts
// src/lib/modules/pos/channel.ts
channel.list({ tenantId, unitId })                    // → SalesChannel[] (BUILTIN: STORE, QR_TABLE, WEB, CHAT + EXTERNAL: LINEMAN, GRAB, FOODPANDA, SHOPEE, LAZADA, TIKTOK, MANUAL)
channel.priceFor({ tenantId, unitId, channelId, productId, variantId?, at: Date })
   // → { unitPriceSatang, source: 'BASE'|'CHANNEL'|'CAMPAIGN'|'TIER', campaignId? }   // ลำดับ: campaign (การตลาด) > channel > base
channel.commission({ channelId, grossSatang })        // → { commissionSatang, bp, payoutMethod: 'PLATFORM'|'DIRECT' }
```
- `PosSale.channelId` **บังคับ** (default = STORE) · `createSale` รับ `channelId` และ snapshot `channelCode`/`commissionSatang` ลงบิล
- บัญชี (2.4): facade เพิ่ม `account.postSale({..., channelCode, commissionSatang, payoutMethod})` → Account map เป็น ค่าใช้จ่ายค่าคอมฯ + ลูกหนี้แพลตฟอร์ม (Account เป็นผู้รู้เลขบัญชี)
- รายงาน: ทุก aggregate group by `channelId` ได้
- การตลาด (MktCampaign): แคมเปญชนิด `PRICE_RULE` ประกาศ `{productIds, channelIds, unitIds, from, to, priceSatang|discountBp}` → `channel.priceFor` อ่านผ่าน `marketing.activePriceRules(unitId, at)` (read-only facade ฝั่งการตลาด)

## C-7 ออเดอร์ทุกช่องทาง (`PosOrder` + `PosOrderLine` + `PosOrderEvent` — เดิมชื่อ ExternalOrder · P2.8 มติ 1) + adapter
> **ตามที่สร้างจริง (P2.8 S):** facade `orders.*` (`pos/order.ts` ผู้เขียนเดียว) · adapter registry `ORDER_ADAPTERS` (`pos/order-adapters.ts` · MANUAL/WEB/CHAT = no-op) · บิล PLATFORM สร้างตอนรับ (`posorder-<id>`) · DIRECT สร้างตอนจ่าย (`payOrder` หรือ ECOM ของเว็บร้าน) · สถานะ NEW → ACCEPTED → PREPARING → READY → HANDED | REJECTED | CANCELLED · โค้ดด้านล่าง = ร่างเดิมของสัญญา (ชื่อ externalOrder.* อ่านเป็น orders.*)
```ts
// src/lib/modules/pos/external/adapter.ts — interface เดียว ทุกแพลตฟอร์ม implement
interface ChannelAdapter {
  code: 'LINEMAN'|'GRAB'|'FOODPANDA'|'SHOPEE'|'LAZADA'|'TIKTOK'|'MANUAL'
  pullOrders(ctx, since): Promise<ExternalOrderInput[]>          // หรือ webhook → normalize เป็น input เดียวกัน
  accept(ctx, extId, { prepMinutes }): Promise<void>
  reject(ctx, extId, { reasonCode }): Promise<void>
  setReady(ctx, extId): Promise<void>
  syncMenu(ctx, items: ChannelMenuItem[]): Promise<SyncReport>   // ราคา/รูป/ตัวเลือก/86
  setAvailability(ctx, productIds, available: boolean): Promise<void>  // 86 รายตัว
  setStoreStatus(ctx, open: boolean, hours?): Promise<void>
}
// service
externalOrder.ingest({ tenantId, unitId, channelId, extId, payload, idempotencyKey: `${channelId}:${extId}` }) // → ExternalOrder (NEW)
externalOrder.accept({ id, prepMinutes, byUserId })   // → adapter.accept + สร้าง RestaurantOrder (ถ้ามีครัว) + emit pos.order.accepted
externalOrder.reject({ id, reasonCode, byUserId })
externalOrder.ready({ id })                           // → adapter.setReady + emit pos.order.ready
externalOrder.settle({ id })                          // → createSale({ channelId, payMethods:[{type:'PLATFORM', amount}], sourceModule:'POS', sourceId:id, idempotencyKey:`extorder-${id}` })
```
- สถานะ `ExternalOrder.status`: NEW → ACCEPTED → PREPARING → READY → COMPLETED | REJECTED | CANCELLED_BY_PLATFORM · เก็บ `payload` ดิบไว้ตรวจ
- **MANUAL adapter** (ทำก่อน ไม่ต้องรอ partner API): พนักงานคีย์ออเดอร์จากแท็บเล็ตแพลตฟอร์ม → ได้ยอด/สต็อก/บัญชี/ค่าคอมฯ ครบ
- รับอัตโนมัติ: `SalesChannel.autoAccept` + กติกา "พักรับอัตโนมัติเมื่อครัวค้าง > N ใบ" (อ่าน `kds.stationQueue`)
- เว็บร้าน (`ShopOrder`) และแชท = channel BUILTIN: ShopOrder ยืนยันเงิน → `createSale({channelId: WEB})` (แก้ของเดิมให้ส่ง channelId) · แชทสั่งผ่าน `chat.*` → `externalOrder.ingest(channel: CHAT)` + PENDING_PAYMENT (D1)

## C-8 กะ · เครื่อง · PIN (POS ↔ HR)
```ts
shift.open({ tenantId, unitId, deviceId, byUserId, floatSatang })        // 1 เครื่อง 1 กะ OPEN
shift.close({ shiftId, countedSatang, countDetail, note, byUserId })      // → Z snapshot + emit pos.shift.closed {overShortSatang}
shift.xReport({ shiftId })
staff.verifyPin({ tenantId, unitId, pin })   // → { userId, employeeId? } — PIN เก็บที่ PosStaffPin (hash) · ถ้า HR เชื่อม: ใช้ HrEmployee.pinCode เดิมได้ (sync ทางเดียว HR→POS)
hr.onShiftToday({ tenantId, unitId, date })  // C-2 เดิม — รายชื่อที่ควรเปิดกะได้ (ลา = ไม่ขึ้น)
hr.recordCommission({ employeeId, saleId, lineId, amountSatang, kind:'SERVICE'|'PRODUCT', idempotencyKey })  // outbox consumer ของ pos.sale.paid เมื่อ HR เชื่อม
```
- บิลเงินสดจาก source อื่นตอนไม่มีกะ → `PosSale.shiftId = null` + โผล่รายงาน "เงินสดนอกกะ" (D17 เดิม)
- ปิดกะ: Account consumer `pos.shift.closed` → JV เงินขาด/เกิน (บัญชีเป็นผู้เลือกผัง) · Kanban consumer → การ์ด "ตรวจเงิน" ถ้า |overShort| > เกณฑ์ · Meeting/LINE เจ้าของ → สรุปกะ

## C-9 อนุมัติ (POS ↔ Approval core) — แทนที่ "ขอ PIN ผู้จัดการ" เมื่อร้านตั้งนโยบาย
```ts
approval.resolvePolicy(ctx, { module:'POS', action:'VOID'|'REFUND'|'DISCOUNT_OVER'|'PRICE_OVERRIDE'|'OPEN_DRAWER', amountSatang })  // มีอยู่แล้ว
approval.submitForApproval(ctx, { module:'POS', refType:'PosSale'|'PosHeldCart', refId, action, payload, requestedBy })             // มีอยู่แล้ว
// POS: ถ้า resolvePolicy คืน policy → บิลเข้า status PENDING_APPROVAL (void/refund ยังไม่เกิด) → consumer approval.decided {approved} → ทำ voidSale/refundSale ด้วย idempotencyKey = requestId
// ไม่มี policy → fallback PIN ผู้จัดการบนเครื่อง (เร็ว ไม่ต้องรอ)
```
- ผู้อนุมัติกดจากมือถือ (หน้า approval เดิม) หรือจากแชท/ประชุม (notify 2.5)

## C-10 ลูกค้า · สมาชิก v2 · CRM
```ts
// ⚠️ แก้ 9 ต.ค. 2026 (P1.12 brief §9 Q5) — ชื่อจริงในโค้ด: POS เข้าถึงสิทธิ์สมาชิกผ่าน wallet ของสมาชิก v2 เท่านั้น (`member/wallet.ts` ห้ามเรียก voucher/point/stamp/giftcard ตรง)
member.listMembers + briefFor + resolveCardToken   // = lookup เบอร์/ชื่อ/รหัส/QR — งบ p95 ≤300ms บน QC (ไม่มี index เบอร์/ชื่อ · normalise ตัวเลข) · POS ห่อเป็น registerMemberLookup
member.createMember({ source:"POS", consents[], idempotencyKey })   // = quickRegister → Customer + MemberConsent (+ attribution ผ่าน bridge) · POS ห่อเป็น registerQuickMember
member.getWallet(ctx, customerId, { cart }) + getPointSettings   // = benefitsFor → tier · vouchers(applicable/reason) · points · stamps · giftCards(อ่านอย่างเดียว) · POS ห่อเป็น registerMemberBenefits
member.quoteApply / applyOnSale(ctx, input, tx) / releaseOnVoid   // = quote · ใช้สิทธิ์ใน tx เดียวกับบิล (createSale มีแล้ว) · คืนสิทธิ์ตอน void/คืนเงิน · แต้ม = ส่วนลด (ไม่ใช่วิธีชำระ) · บัตรของขวัญเป็นวิธีชำระ = P2.9
crm.onSale (consumer pos.sale.paid เมื่อ CRM เชื่อม): บิล ≥ เกณฑ์ หรือ taxInvoice.taxId เป็นนิติบุคคล → createDeal/ผูก CrmCompany + กิจกรรม "ซื้อหน้าร้าน" บน contact
crm.creditTerms({ partyId })                                     // ลูกค้าองค์กร: วงเงิน/เครดิตเทอม → payMethod STORE_CREDIT → Account ออกใบแจ้งหนี้
```
- บิลเก็บ `memberSnapshot {name, phone, tier}` · ใบเสร็จออนไลน์แสดงแต้ม/สแตมป์จาก member v2 (อ่านสด ไม่ snapshot)

## C-11 แชท (POS ↔ Chat)
```ts
chat.pushToContact({ tenantId, partyId|memberId, template:'pos-receipt'|'pos-order-status'|'pos-refund', data })   // มี pushToContact/sendLineToParty แล้ว
chat.onCustomerAsk('order_status') → อ่าน externalOrder/PosSale ล่าสุดของ party → ตอบอัตโนมัติ (KB C-5 + tool)
```
- ส่งใบเสร็จทาง LINE = ทางเลือกในจอชำระ (ถ้าลูกค้ามี MemberChannelIdentity LINE) · ไม่มี = ซ่อนปุ่ม

## C-12 บอร์ดงาน · ประชุม · การตลาด · ฟอร์ม · ไฟล์
- Kanban: AutomationRule เดิม + event ใหม่ (ตารางข้างล่าง) → การ์ด: ของหมด (86) · ผลต่างกะ · ปฏิเสธออเดอร์ · ร้องเรียนบิล (จากใบเสร็จออนไลน์ "แจ้งปัญหาบิลนี้")
- Meeting (C-4): สรุปกะ/วัน · เตือนใกล้หมด · ออเดอร์ค้างเกิน N นาที
- Marketing: อ่าน price rule (C-6) · เขียน: "ซื้อครบ X แจกคูปอง" = consumer `pos.sale.paid` ฝั่งการตลาด (มี journey engine ใน member v2)
- Forms: `FormDef` ชนิด "ใบสมัครสมาชิกหน้าร้าน" ใช้ใน quickRegister (ฟิลด์ตามร้านตั้ง) · ตั้งค่าได้ ไม่บังคับ
- Storage (Bunny): รูปสินค้าผ่าน `storage.upload` เดิม (เหมือนคลังเอกสารบัญชี) · ใบเสร็จ PDF ไม่เก็บ (render สด)
- i18n: ทุกสตริง POS อยู่ `src/messages/{th,en}.json` key `pos.*` · ใบเสร็จพิมพ์ตามภาษาตั้งค่าของระบบ POS (`settings.pos.receiptLocale` · P1.18 มติ Q7 9 ต.ค. — เดิมเขียน "สาขา") · ชื่อสินค้ามี `nameEn?`

## C-13 ออฟไลน์ (P3) — สัญญาระหว่าง client กับ server
```ts
POST /sync/sales  { deviceId, items:[{ offlineRef:'OFF-C1-0007', idempotencyKey, createSaleInput, createdAtLocal }] }
  → ต่อรายการ: { offlineRef, status:'OK'|'DUPLICATE'|'REJECTED', receiptNo?, reason? }  // ลำดับตาม createdAtLocal · เลขจริงออกตอน sync
```
- ออฟไลน์ขายได้เฉพาะ: เงินสด · โอน(แนบสลิป) · สินค้าในแคช · ไม่ใช้แต้ม/คูปอง/ว่อชเชอร์/บัตร (ต้องออนไลน์) · ใบเสร็จพิมพ์ "รอออกเลขจริง"
- ขัดแย้ง (สินค้าถูกลบ/ราคาเปลี่ยน) → REJECTED + ผู้จัดการแก้มือ
- **v2 (P3.4 S as-built · มติ 2 3 4 6 10 · CD-P34a)** — แทนสองบรรทัดบนเมื่อขัดกัน:
  ```ts
  // REST: POST /api/v1/pos/sync/sales (op sync.sales · scope pos.offline.sync · kind write) { unitId, deviceId, items[≤50] }
  // หน้าขายของร้าน: POST /api/pos/sync (route ของ session · pos.sale.create ของผู้ใช้ · ไม่ใช้ scope) { systemId, unitId, deviceId, items[≤50] }
  item   = { offlineRef:'OFF-C1-0007', idempotencyKey, soldAt (ISO เครื่อง), shiftId?, staffToken?, sellerUserId?, snapshotHash, sale: RegisterSubmitInput − {idempotencyKey, staffToken} }
  result = { offlineRef, status:'OK'|'DUPLICATE'|'REJECTED', offlineSaleId?, saleId?, receiptNo?, reason?, drift? }   // ทำทีละรายการเรียง (soldAt, seq)
  ```
  - ราคา (มติ 10 · R6 hybrid): คิดใหม่ ณ soldAt (โปร ณ เวลาขาย) — ตรงยอดที่เครื่องอ้าง (`sale.expectedGrandTotalSatang`) = OK · ไม่ตรงแต่ตรงราคา snapshot ของเครื่อง = OK ที่ราคา snapshot + `drift` (audit) · ไม่ตรงทั้งคู่ = REJECTED `PRICE_MISMATCH`
  - ขายได้: เงินสด · โอน (เลขอ้างอิงไม่บังคับ · ไม่มีรูปสลิป — P3.10) · walk-in เท่านั้น · ห้าม พร้อมเพย์/บัตร/บัตรของขวัญ/เครดิตร้าน/มัดจำ/แต้ม/คูปอง/ว่อชเชอร์/โต๊ะ/บิลพัก/ช่องทาง → REJECTED `VALIDATION`
  - เลขจริงออกตอนซิงก์จากตัวนับเดือนของ soldAt · `paidAt = soldAt` · `createdAt` = เวลาเซิร์ฟเวอร์ · สลิปออฟไลน์ = "ใบรับเงินชั่วคราว — รอออกเลขจริง" (ไม่ใช่ ABB · ไม่มี QR)
  - เหตุผลที่ปฏิเสธ: `PRICE_MISMATCH CLOCK_INVALID SHIFT_CLOSED SELLER_MISMATCH OFFLINE_REF_TAKEN STOCK_INSUFFICIENT SNAPSHOT_UNKNOWN DEVICE_REVOKED STAFF_TOKEN_INVALID VALIDATION` (+ รหัสของหน้าขาย) → คิวผู้จัดการ (pos.shift.manage: รับ = นอกกะ · ทิ้ง = เหตุผล ≥ 5 ตัว)

## Event ใหม่ทั้งหมด (ทุกตัวต้องมี consumer อย่างน้อย 1 — กฎ reference_outbox_new_event_needs_consumer)
| event | payload หลัก | consumer (เมื่อเชื่อม) |
|---|---|---|
| `pos.sale.paid` (เดิม) | saleId · channelId · commissionSatang · shiftId · memberId | Account · Point · Member.recordSpend · HR.commission · CRM.onSale · Marketing journey · Chat receipt (opt-in) |
| `pos.sale.voided` (เดิม) | saleId · reason · approvalRequestId? | Account reverse · Point reverse · Inventory reverse · Voucher/GiftCard/Stamp reverse |
| **`pos.sale.refunded`** | saleId · refundSaleId · lines · refundMethod | Account CN · Point partial reverse · Inventory return · Stamp/Voucher partial |
| ~~`pos.sale.expired`~~ (สเปก D1 · **แทนที่โดย P2.7 มติ 8**) → ออเดอร์จ่ายก่อนที่เลยเวลาจ่าย = `pos.order.cancelled` + PosOrderEvent `expired` (payload reason `PAYMENT_EXPIRED`) · ใบขอรับเงิน EXPIRED · ไม่มีบิลค้างรอเงิน | orderId · channelCode · status CANCELLED · paymentState PENDING_PAYMENT | ต้นทาง (หน้าสถานะ /q/o · จอ 09) · KDS (ไม่มีรอบ) · กฎอัตโนมัติ |
| **`pos.shift.opened` / `pos.shift.closed`** | shiftId · deviceId · overShortSatang · zNumber | Account JV ขาด/เกิน · Kanban การ์ดตรวจเงิน · Meeting/LINE สรุป |
| **`pos.product.availability`** | productId · available · source (KDS/STOCK/MANUAL) | adapter ทุกช่องทาง (setAvailability) · Kanban ของหมด |
| **`pos.order.received/accepted/rejected/ready/completed`** | externalOrderId · channelId | KDS · Chat สถานะ · Kanban ปฏิเสธ · Meeting ค้างนาน |
| **`pos.stockCount.confirmed`** | countId · diffs[] | Inventory adjust (มี) · Account ผลต่าง (C-1) — P2.14 DOC-5: ชื่อจริงใน `outbox-consumers.ts` (เดิมในเอกสาร `stockcount`) |
| **`pos.receipt.issue_reported`** | saleId · message · channel | Kanban การ์ด · Chat ตอบรับ |
| **`pos.receipt.taxInvoiceRequested`** (P1.11) | requestId · saleId · unitId | ไม่มีผลข้างเคียง (ตัวรับว่าง · webhook ของร้าน) — คำขอใบกำกับเต็มรูปจากใบเสร็จออนไลน์ รอร้านออก/ปฏิเสธ |
| **`pos.payment.intent_paid`** (P1.7 · P2.7) | intentId · unitId · amountSatang · via · kind · lateWebhook | `orders.onIntentPaid` (ออเดอร์จ่ายก่อน → PREPAID · เงินเข้าหลังปิด = late_payment + refund_needed) · จอลูกค้า |
| **`pos.sale.taxInvoiceIssued`** (P1.13) | saleId · docId · unitId · via (LATER/REQUEST) · requestId? | ไม่มีผลข้างเคียง (ตัวรับว่าง · webhook ของร้าน) — ออกใบกำกับเต็มรูปแทนใบอย่างย่อแล้ว |

## ตารางสิทธิ์เพิ่มจากสเปก §9
`pos.channel.manage` · `pos.order.accept` · `pos.order.reject` · `pos.approval.decide` (ผ่าน approval core) · `pos.offline.sync` · `pos.price.rule` (การตลาด/ผู้จัดการ)

### ตารางสิทธิ์ของ POS ตามที่สร้างจริง (as-built ปิด P2 · P2.14 ruling 7 · ที่มา `src/lib/core/permissions.ts`)
| คีย์ | ใช้ที่ | หมายเหตุ |
|---|---|---|
| `pos.sale.create` | หน้าขาย · โต๊ะ · ออเดอร์ (รับเงิน) · จอลูกค้า (ส่งภาพ) · 86 · REST `sales.create`/`sales.quote` | ขายได้ที่สาขาที่เข้าถึง |
| `pos.sale.read` | บิลวันนี้ · ใบเสร็จ/สำเนา · REST อ่านบิล | ผู้มี `pos.sale.create` อ่านได้โดยปริยาย |
| `pos.sale.void` · `pos.sale.refund` | ลิ้นชักบิล · ยกเลิกออเดอร์ที่มีบิล · REST void/refund | กติกาอนุมัติ POS_VOID/POS_REFUND · PIN ผู้จัดการแทนได้ |
| `pos.sale.priceOverride` | รายการกำหนดเอง/ราคาเปิด · REST custom lines | |
| `pos.sale.manage` | บิลพัก/ส่วนลดที่อนุมัติแล้วของคนอื่น | |
| `pos.shift.operate` · `pos.shift.manage` | กะของตัวเอง · กะของคนอื่น/Z/ยืนยันเงินเข้าเอง | `manualConfirmRequiresManager` = ต้องมี `pos.shift.manage` |
| `pos.product.manage` · `pos.product.setPrice` · `pos.price.rule` | แคตตาล็อก · ราคา · โปร/happy hour | ผู้เขียนเดียว `pos/catalog.ts` |
| `pos.channel.manage` | ตั้งค่าช่องทาง · ลิงก์สั่งล่วงหน้า · ราคาช่องทาง | |
| `pos.order.accept` · `pos.order.reject` | จอออเดอร์ · REST orders.* · พักรับช่องทาง | ยกเลิกออเดอร์ที่มีบิล = ต้องมี `pos.sale.void` ด้วย |
| `pos.report.view` · `pos.report.anomaly` | รายงาน · CSV · แบบพิมพ์ · จุดผิดปกติ (PDPA = คีย์แยก) | |
| `pos.stock.count` | ตรวจนับสต็อกจากหน้าขาย | |
| `pos.device.manage` | ทะเบียนเครื่อง · เครื่องพิมพ์ · จอลูกค้า (เปิด/ยกเลิก) | |
| `pos.staff.manage` | PIN ของพนักงานคนอื่น | |
| `pos.taxinvoice.issue` | ใบกำกับเต็มรูป · คำขอจากใบเสร็จออนไลน์ | REST: คีย์บริการ `pos-api:<keyId>:<saleId>` (P2.14 API-5) |
| `pos.settings.manage` · `pos.settings.payment` | ตั้งค่าหน้าขาย · คีย์ API (+ `api.key.create`/`api.key.revoke`) · วิธีรับเงิน (เจ้าของ) | เพิกถอนคีย์ได้เฉพาะคีย์ที่ดูแลครบทุกสาขา (P2.14 API-2) |


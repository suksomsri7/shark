# E-commerce / Storefront (DESIGN — สำหรับ WO-0053)

> ต่อยอด Inventory (สินค้า/สต็อก) + Customer + เส้นเงิน POS + PromptPay (Payment) · path อนาคตเขียนธรรมดา

## เป้าหมาย · ผู้ใช้ · เหตุผลเชิงธุรกิจ
- **เป้าหมาย:** หน้าร้านออนไลน์ (storefront) · catalog · ตะกร้า · checkout ด้วย PromptPay · order → เส้นเงิน + ตัดสต็อก
- **ผู้ใช้:** ร้านค้าปลีก/แบรนด์ SME ไทยที่อยากขายออนไลน์ต่อ URL ตัวเอง (custom domain ที่มีอยู่)
- **เหตุผล:** อ้าง `docs/sds/01_VISION.md` — ปิดวงจร online↔offline บนสต็อก+บัญชีชุดเดียว · reuse Inventory (ไม่ทำ catalog ซ้ำ)

## Data model เสนอ
โมดูลใหม่ `ecommerce` — axis = **system** (AppSystem type ใหม่ `ECOMMERCE` หรือ `STORE`). สินค้าอ้าง InvItem เดิม (ไม่ทำ product ซ้ำ) + ตารางเสริมฝั่งขายออนไลน์.

- `StoreSettings` (axis: system, 1/ระบบ) — ตั้งค่าร้านออนไลน์
  - `id` · `tenantId` · `systemId` @unique · `storeName` · `slug` (path สาธารณะ) · `logoUrl` · `themeJson` Json
  - `promptpayId` String? · `shippingFlatSatang` Int @default(0) · `active` Boolean
- `StoreProduct` (axis: system) — สินค้าที่ขายออนไลน์ (mapping + ข้อมูลหน้าร้าน)
  - `id` · `tenantId` · `systemId` · `invItemId` String? (ผูก InvItem — สต็อก/ราคาต้นทางที่นี่) · `title` · `descriptionHtml` String? · `imageUrls` Json
  - `priceSatang` Int (ราคาขายออนไลน์ · default = InvItem.priceSatang) · `published` Boolean
  - `@@index([systemId, published])` · `@@unique([systemId, invItemId])`
- `StoreOrder` (axis: system) — คำสั่งซื้อ
  - `id` · `tenantId` · `systemId` · `orderNo` (รันต่อระบบ/เดือน แบบ PosReceiptCounter) · `customerId` String?
  - `customerName` · `customerPhone` · `shippingAddress` String?
  - `status` enum `StoreOrderStatus` (`PENDING_PAYMENT | PAID | PACKING | SHIPPED | COMPLETED | CANCELLED`)
  - `subtotalSatang` · `shippingSatang` · `grandTotalSatang` Int
  - `saleId` String? (PosSale เมื่อจ่ายสำเร็จ) · `idempotencyKey` String
  - `@@unique([tenantId, idempotencyKey])` · `@@unique([systemId, orderNo])` · `@@index([systemId, status])`
- `StoreOrderLine` (axis: system) — `id` · `tenantId` · `systemId` · `orderId` · `storeProductId` · `title` (snapshot) · `qty` · `unitPriceSatang` · `lineTotalSatang`

**Idempotency:** checkout สร้าง order ด้วย cart signature; ชำระ = idempotencyKey ป้องกันตัดเงิน/สต็อกซ้ำ.

## Service API เสนอ (ไฟล์อนาคต src/lib/modules/ecommerce/service.ts)
- `getStorefront(slug)` — public no-auth resolve ร้าน+สินค้า published (แบบ `resolveUnit` ใน booking)
- `createOrder(ctx, { lines[], customer, shipping })` — คำนวณยอด, ตรวจสต็อก (soft) → `PENDING_PAYMENT`
- `confirmPayment(ctx, orderId, { proof/promptpayRef })` — ยืนยันชำระ → **createSale (POS sourceModule `ECOMMERCE`)** + **ตัดสต็อกผ่าน invSvc (movement OUT, idempotencyKey `store-<orderId>`)** ใน flow เดียว → `PAID`
- `updateFulfillment(ctx, orderId, status)` — PACKING/SHIPPED/COMPLETED
- `cancelOrder(ctx, orderId)` — คืนสต็อก (ถ้าตัดแล้ว) + บิล refund (append-only)
- **Edge cases:** สต็อกหมดระหว่าง checkout → กันตัดติดลบใน tx (สต็อกจริงตัดตอน confirmPayment ไม่ใช่ตอนหยิบใส่ตะกร้า) · จ่ายซ้ำ → idempotent · ยกเลิกหลังจ่าย → refund + คืนสต็อก · ราคาสินค้าเปลี่ยนระหว่าง cart → ยึด snapshot ในบิล

## การเชื่อมต่อ
- **เส้นเงิน (บังคับ):** order ที่จ่ายแล้ว → `PosSale` (`sourceModule="ECOMMERCE"`, `sourceId=orderId`) → outbox `pos.sale.paid` → account-bridge. PromptPay → `PosPayType.PROMPTPAY` (map เข้าธนาคารฝั่งบัญชี ดู `src/lib/modules/pos/account-bridge.ts`)
- **Inventory:** ตัดสต็อกผ่าน service เดิม (composition root) — ไม่แตะ InvMovement ตรง
- **Payment/PromptPay:** ใช้ PaymentProfile + PromptPay QR เดิมของแพลตฟอร์ม (BYO promptpayId ต่อร้าน) · การยืนยันจริงผ่านธนาคาร = 🔑 owner (สแกน QR ทดสอบ)
- **Customer กลาง:** ลูกค้าออนไลน์ = Customer + MemberActivity `ORDER_PLACED`
- **Outbox ใหม่:** `store.order.paid` · `store.order.shipped` (ให้ Automation/แจ้งเตือน+Delivery 0060 เกาะ)
- **White label (0064):** theme/โลโก้/โดเมน ต่อ storefront

## AI actions
- **read:** `store_pending_orders` (ออเดอร์รอจ่าย/รอส่ง) · `store_bestsellers`
- **action:** `store_mark_shipped` → ProposalKind `store_ship` → dispatch `ecomSvc.updateFulfillment`
- KIND_ACCESS `{ module: "ecommerce", action: "ecommerce.order.fulfill" }`

## Permissions เสนอ
- `ecommerce.product.manage` · `ecommerce.order.view` · `ecommerce.order.fulfill` · `ecommerce.settings.manage`

## UI หน้าจอหลัก (`docs/UI_STANDARD.md`)
- **storefront สาธารณะ** (`max-w-md mx-auto` mobile-first) — grid สินค้า, หน้า detail, ตะกร้า, checkout (PromptPay QR)
- **หลังบ้าน: หน้าออเดอร์** — `DataList` + `StatusChip` สถานะ → หน้า detail อัปเดต fulfillment ผ่าน `ConfirmDialog`
- **หน้าสินค้าออนไลน์** — เผยแพร่/ซ่อน, ตั้งราคาออนไลน์ (`MoneyText`)
- **หน้าตั้งค่าร้าน** — ชื่อ/slug/โลโก้/PromptPay/ค่าส่ง

## ข้อสอบ oracle ที่ต้องมี
1. createOrder → PENDING_PAYMENT, ยอดถูก (subtotal+shipping), ยังไม่ตัดสต็อก
2. confirmPayment → PosSale sourceModule=ECOMMERCE + InvMovement OUT + status PAID, บัญชีเขียว
3. จ่ายซ้ำ (idempotencyKey) → ไม่ตัดเงิน/สต็อกซ้ำ
4. สต็อกไม่พอตอน confirm → ปฏิเสธ ไม่ติดลบ
5. cancel หลังจ่าย → คืนสต็อก + refund append-only
6. storefront สาธารณะเห็นเฉพาะสินค้า published ของร้านที่ active
7. tenant/system อื่นมองไม่เห็น order
8. ราคาเปลี่ยนหลังใส่ตะกร้า → บิลใช้ราคา snapshot ตอน checkout
9. qc:account เขียว (ECOMMERCE เข้าเส้นเดียว)
10. AI store_pending_orders อ่านเฉพาะร้านตัวเอง · store_ship เดินเส้น proposal

## ความเสี่ยง / คำถามเปิด
- 🔑 การยืนยัน PromptPay อัตโนมัติ (webhook ธนาคาร) ยังไม่มี — v1 = ยืนยันด้วยมือ/แนบสลิป · owner ต้องสแกน QR ทดสอบจริง
- 🔑 stock reservation model: ตัดสต็อกตอนจ่าย (เสนอ) vs จองตอนใส่ตะกร้า (กัน oversell แต่ซับซ้อน) — ตัดสินใจ
- host-routing storefront บนโดเมนลูกค้า = ขึ้นกับ ADR A6 / WO-0065

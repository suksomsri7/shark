# POS ใหม่ — API (ส่วนต่างจากสเปกเดิม `docs/modules/14-pos.md` §5) + REST v1 สำหรับระบบภายนอก/AI + tool manifest

> 1 ต.ค. 2569 · แบบอย่างเดียว · ของเดิม §5.1–5.7 (sales/products/stock/shifts/devices/held-carts/reports/public) **ยังใช้ทั้งหมด** · ที่นี่คือส่วน "เพิ่ม/แก้"
> เส้นทางภายใน: `/api/u/[unitId]/pos/...` (unit-scoped + `X-Pos-Device`) · เส้นทางภายนอก: `/api/v1/pos/...` (API key แบบบัญชี/CRM: scope · ผูกระบบ · expiresAt · Idempotency-Key · rate limit DB — ทะเบียนเดียว 3 ผิวหน้าแบบ `account/api/registry.ts`)

## 1. แก้ของเดิม
| เดิม | แก้เป็น | เหตุผล |
|---|---|---|
| `POST /sales` payload | + `channelId` (default STORE) · + `lines[].options[]` (choiceId/priceDelta snapshot) · + payMethods type เพิ่ม `CARD` `VOUCHER` `GIFT_CARD` `STORE_CREDIT` `PLATFORM` · + `tip`/`serviceChargeBp` · + `burnVouchers[]` `giftCardCode` · + `attributionId?` | C-6 · ตัวเลือกสินค้า · วิธีชำระใหม่ · สมาชิก v2 |
| `GET /products` | ตอบ `PosProduct` (ชั้นขาย) แทน InvItem ดิบ: `{id, invItemId, name, nameEn, kind, categoryId, basePriceSatang, images[], optionGroups[], variants[], recipe[], channelPrices[], availability{unitId→bool}, stock{unitId→qty}}` | แคตตาล็อกเดียว |
| `GET /products/lookup?barcode=` | รองรับบาร์โค้ดน้ำหนัก/ราคา EAN-13 prefix 2x → `{product, qty|priceSatang}` | สินค้าชั่ง |
| `POST /shifts/open` | + `pin` (ตรวจ staff.verifyPin) | C-8 |
| `GET /reports/*` | + `?channelId=&unitIds[]=` ทุกรายงาน · + `/reports/channels` `/reports/branches` `/reports/anomalies` | รายงานใหม่ |

## 2. เพิ่มใหม่ (unit-scoped)
| Method | Path | ทำอะไร | สิทธิ์ |
|---|---|---|---|
| GET/POST/PATCH | `/channels` `/channels/:id` | ช่องทางขาย: เปิด/ปิด · autoAccept · prepMinutes · ค่าคอมฯ · adapter config (secret เก็บ encrypted) | `pos.channel.manage` |
| POST | `/channels/:id/sync-menu` | ดันเมนู/ราคา/86 ออกช่องทาง → SyncReport | `pos.channel.manage` |
| POST | `/channels/:id/pause` `/resume` | ปิดรับชั่วคราว | `pos.order.accept` |
| GET | `/orders?status=&channelId=` | ออเดอร์ทุกช่องทาง (ExternalOrder + RestaurantOrder + ShopOrder รวมมุมมองเดียว) | `pos.sale.read` |
| POST | `/orders/:id/accept` `{prepMinutes}` · `/reject` `{reasonCode}` · `/ready` · `/complete` | วงจรออเดอร์ (C-7) | `pos.order.accept/reject` |
| POST | `/orders/manual` | คีย์ออเดอร์แพลตฟอร์มด้วยมือ (MANUAL adapter) | `pos.sale.create` |
| POST | `/webhooks/:channelCode` | รับ webhook แพลตฟอร์ม (public + signature) → ingest | — |
| GET/PUT | `/products/:id/options` `/products/:id/recipe` `/products/:id/channel-prices` | ตัวเลือก · สูตร BOM · ราคาต่อช่องทาง/ช่วงเวลา/สาขา | `pos.product.manage` |
| POST | `/products/:id/availability` `{unitId?, channelIds?, available}` | 86/คืนขาย (→ event) | `pos.sale.create` |
| POST | `/sales/:id/split` `{mode:'ITEMS'|'EQUAL'|'SEATS', parts}` | แยกบิลจาก session โต๊ะ → หลาย sale PENDING | `pos.sale.create` |
| POST | `/sales/:id/request-approval` `{action, payload}` | ส่งเข้า approval core (C-9) | `pos.sale.void/refund` |
| POST | `/staff/verify-pin` | สลับพนักงานบนเครื่อง | `pos.sale.create` |
| GET/PUT | `/staff/pins` | ตั้ง PIN (ผู้จัดการ) | `pos.settings.manage` |
| POST | `/members/quick-register` | สมัครสมาชิกจากหน้าขาย (C-10) | `pos.sale.create` |
| GET | `/members/:id/benefits` | สิทธิ์/ว่อชเชอร์/สแตมป์/บัตรของขวัญ ที่ใช้ได้กับบิลนี้ | `pos.sale.create` |
| POST | `/sync/sales` | ออฟไลน์ (C-13, P3) | `pos.offline.sync` |
| GET | `/catalog/snapshot` | แคตตาล็อก+ราคา+หมวด แบบก้อนเดียวสำหรับแคชออฟไลน์ (ETag) | `pos.sale.create` |
| POST | `/receipts/:token/report-issue` (public) | ลูกค้าแจ้งปัญหาบิล → event | — |

## 3. REST v1 ภายนอก `/api/v1/pos/*` (ทำแบบบัญชี/CRM: catch-all route + registry ~45 op)
- อ่าน: `sales` (list/get/receipt) · `shifts` · `products` · `channels` · `orders` · `reports/{daily,products,channels,staff,margin}`
- เขียน (scope เขียน + Idempotency-Key): `sales` (createSale เต็ม — ให้ระบบภายนอก/AI เปิดบิล) · `sales/:id/refund` · `products` (CRUD + availability) · `orders/:id/accept|reject|ready` · `stock/counts`
- Webhook ออก (ทะเบียนเดียวกับสมาชิก/บัญชี): ทุก event ในตาราง POS-CONTRACTS
- สกิล `.claude/skills/shark-pos-api` + `docs/api/POS-API.md` + `/developers/pos` generate จาก registry (แบบเดียวกับ account/crm/member/kanban)

## 4. Tool manifest สำหรับพนักงาน AI (C-3) — ต่อจาก `src/lib/ai/tools.ts` (มี `sales_summary` `low_stock` แล้ว)
อ่าน (ตาม permission ของ AI ตัวนั้น): `pos_sales_summary(range, unitIds?, channelId?)` · `pos_top_products` · `pos_shift_report(shiftId|today)` · `pos_anomalies(range)` (ส่วนลด/void/ขาดเกิน) · `pos_orders_pending` · `pos_product_find(q)` · `pos_stock_forecast(productIds)`
เสนอ (proposal ต้องคนยืนยัน — ProposalKind ใหม่): `pos_draft_purchase_order` · `pos_set_availability` · `pos_draft_price_change` · `pos_open_sale` (WO-0045 เดิม) · `pos_create_task` (บอร์ดงาน) · `pos_reply_order_status` (แชท)

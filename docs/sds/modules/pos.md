# SDS — POS / จุดตัดเงินกลาง · AS-BUILT V2

> as of `6c2352f7` (`session/pos` · 24 ต.ค. 2569 · POS P6.2) — สร้างจากโค้ด: model · event · facade · สิทธิ์ (มติ 7 ของ brief P6) · แทนที่ฉบับ AS-BUILT 2026-07-16 (POS v1 = PosSale/Line/Payment/ReceiptCounter)
> คู่กับ `docs/modules/14-pos.md` (V2 · ฟังก์ชันต่อหมวด) · ส่งมอบ ledger/HANDOVER-2026-10-POS.md (ไฟล์ของผู้คุม) · สัญญา REST `docs/api/POS-API.md` · ตารางสิทธิ์ทุกพื้นผิว `scripts/pos-authz-matrix.json`
> ตัวเลขที่ข้อสอบ `scripts/qc-pos-p6.2.mts` (D2) อ่านจากโค้ดวันนี้: model 48 · คีย์ outbox `pos.*` 17 · export ของ facade 79 + `export type *` 1 · คีย์สิทธิ์ 24 · การ์ดเชื่อม 13 · op REST 49 ใน 9 กลุ่ม

## 1. หน้าที่ · ชั้น · ไฟล์
- **จุดตัดเงินกลาง** (contract 2.1): ทุกบิลเกิดที่ `createSale` (`src/lib/modules/pos/service.ts`) ในธุรกรรมเดียว (บิล + บรรทัด + วิธีจ่าย + เลขใบเสร็จ + แต้ม/คูปอง/สิทธิ์สมาชิกที่ใช้ + outbox) · ผู้เรียกที่มีธุรกรรมเองส่ง `callerTx` แล้วเรียก `afterSaleCommitted` หลัง commit (HF-TX)
- Layer 3 · scope = unit · ทุกแถวผูก `tenantId` + `systemId` (AppSystem type POS) + `unitId` (BusinessUnit) · ไม่มี FK ข้ามโมดูล (id หลวม) · เงินเป็นสตางค์ (Int) ทุกคอลัมน์ `*Satang`
- โค้ด: `src/lib/modules/pos/*` (ผู้เขียนเดียวต่อตาราง — ระบุในตาราง §2) · หน้า `src/app/app/sys/[id]/pos/**` · หน้าสาธารณะ `src/app/(store)/{r,q,d}` · REST `src/app/api/v1/pos/[...path]` · route ภายใน `src/app/api/pos/{sync,print-agent,platform}` · composition root `src/lib/pos-board-bridges.ts` `src/lib/pos-chat-bridges.ts` `src/lib/pos-receipt-bridges.ts` `src/lib/pos-integrations.ts`
- schema: `prisma/schema/pos.prisma` (44 model) + `prisma/schema/pos_order.prisma` (4 model) · migration ของ RUN ลำดับตาม timestamp (`docs/pos/DEPLOY-RUNBOOK.md`)

## 2. Models (48)
| model | ไฟล์ schema | หน้าที่ | ผู้เขียน |
|---|---|---|---|
| `PosSale` | pos.prisma | บิลขาย/ใบคืน (docType SALE/REFUND) · สถานะ PAID/VOIDED/REFUNDED · ยอด/VAT/ส่วนลด/แต้ม · ช่องทาง+ค่าคอมฯ · กะ/เครื่อง/ผู้ขาย · สมาชิก snapshot · idempotencyKey unique ต่อร้าน | `service.ts` · `refund.ts` |
| `PosSaleLine` | pos.prisma | บรรทัดบิล (ชื่อ/ราคา/ส่วนลด/ต้นทุน snapshot · ผู้ให้บริการ) | `service.ts` |
| `PosSaleLineOption` | pos.prisma | ตัวเลือกที่เลือกบนบรรทัด (สำเนา ณ เวลาขาย) | `service.ts` |
| `PosPayment` | pos.prisma | แถววิธีจ่ายของบิล (`PosPayType` 10 ค่า · อ้างอิงใบขอรับเงิน/บัตร/มัดจำ) | `service.ts` · `tender.ts` |
| `PosReceiptCounter` | pos.prisma | เลขใบเสร็จขายรันต่อสาขา/เดือน | `service.ts` |
| `PosDocCounter` | pos.prisma | เลขเอกสารอื่น (ใบคืน CN) ต่อสาขา/ชนิด/เดือน | `refund.ts` |
| `PosCategory` | pos.prisma | หมวดขาย (ลำดับ · ซ่อน · ช่วงเวลาขาย) | `catalog.ts` |
| `PosProduct` | pos.prisma | แคตตาล็อกเดียว (PRODUCT/SERVICE/MENU/BUNDLE · ระดับระบบ · unitId null = ทุกสาขา · ผูก InvItem 1:1) | `catalog.ts` |
| `PosProductOptionGroup` | pos.prisma | ผูกสินค้า ↔ กลุ่มตัวเลือก (MenuOptionGroup เดิม) | `catalog.ts` |
| `RecipeLine` | pos.prisma | สูตร/BOM ต่อ 1 หน่วยขาย (InvItem × จำนวน) · ส่วนประกอบชุด | `catalog.ts` |
| `PosRecipeChoiceLine` | pos.prisma | ส่วนต่างของสูตรต่อตัวเลือก (จำนวนเต็มมีเครื่องหมาย) | `catalog.ts` |
| `PosHeldCart` | pos.prisma | บิลพัก (ทุกเครื่องในสาขา · เรียกคืนครั้งเดียว · หมดอายุ N วัน) | `held-cart.ts` |
| `PosShift` | pos.prisma | กะต่อเครื่อง (เงินตั้งต้น · ยอดคาด/นับจริง · ผลต่าง · Z แช่แข็ง) | `shift.ts` |
| `PosCashMovement` | pos.prisma | เงินเข้า-ออกลิ้นชักระหว่างกะ | `shift.ts` |
| `PosShiftCounter` | pos.prisma | ตัวนับเลขกะ/เลข Z ต่อสาขา | `shift.ts` |
| `PosShiftRecount` | pos.prisma | การนับย้อนหลังของกะที่ระบบบังคับปิด (ครั้งเดียว) | `shift.ts` |
| `PosDevice` | pos.prisma | เครื่องขายต่อสาขา (deviceCode · ค่าตั้งเครื่องพิมพ์ · heartbeat · เพิกถอน) | `device.ts` |
| `PosStockCount` | pos.prisma | รอบตรวจนับ (ทั้งหมด/หมวด · blind · ยืนยันโดยผู้จัดการ) | `stock-count.ts` |
| `PosStockCountLine` | pos.prisma | บรรทัดของรอบ (ยอดในระบบ ณ เปิดรอบ · นับได้ · ผลต่าง) | `stock-count.ts` |
| `PosStockCountEntry` | pos.prisma | รายการสแกน/กรอกแต่ละครั้ง (idempotent) | `stock-count.ts` |
| `PosReceiptIssue` | pos.prisma | ลูกค้าแจ้งปัญหาบิลจากใบเสร็จออนไลน์ (→ การ์ดบอร์ด) | `receipt-issue.ts` |
| `PosTaxInvoiceRequest` | pos.prisma | คำขอใบกำกับเต็มรูปจากใบเสร็จออนไลน์ (รอร้านออก/ปฏิเสธ) | `receipt-tax-request.ts` · `tax-invoice.ts` |
| `PosBuyerProfile` | pos.prisma | ผู้ซื้อที่จำไว้ต่อสมาชิก (ฟอร์มใบกำกับครั้งหน้า) | `tax-invoice.ts` |
| `PosPaymentIntent` | pos.prisma | ใบขอรับเงิน PromptPay ไดนามิก/Beam/บัตร/ยืนยันเอง (ใช้กับบิลได้ครั้งเดียว · หมดอายุ) | `payment-intent.ts` |
| `PosStaffPin` | pos.prisma | PIN พนักงานต่อสาขา (scrypt · ล็อกหลังผิด 5 ครั้ง) | `staff-pin.ts` |
| `PosApprovalPayload` | pos.prisma | snapshot ของคำขออนุมัติ POS_VOID/POS_REFUND/POS_DISCOUNT_OVER + ผล | `pos-approval.ts` · `pos-approval-consumer.ts` |
| `SalesChannel` | pos.prisma | ช่องทางขายต่อสาขา (BUILTIN/EXTERNAL/CUSTOM · adapter · payout · ค่าคอมฯ · รับอัตโนมัติ · พักรับ) | `channel.ts` |
| `PosProductChannelPrice` | pos.prisma | ราคาต่อช่องทาง/สาขา (unique NULLS NOT DISTINCT · ไม่ขายในช่องทาง) | `catalog.ts` |
| `PosPriceRule` | pos.prisma | กติการาคา happy hour/โปร (เวลาไทย · วันในสัปดาห์ · ช่วงวันที่) | `price-rule.ts` |
| `PosAvailabilityMark` | pos.prisma | ของหมด (86) ต่อสาขา (ที่มา KDS/STOCK/MANUAL) | `catalog.ts` |
| `PosTableSplit` | pos.prisma | การแยกบิลโต๊ะ (ITEM/EQUAL/SEAT) | `table-split.ts` |
| `PosTableSplitPart` | pos.prisma | ส่วนของการแยก (OPEN/PAID · ผูกบิล) | `table-split.ts` |
| `PosTableSplitLine` | pos.prisma | รายการที่อยู่ในแต่ละส่วน | `table-split.ts` |
| `PosDeposit` | pos.prisma | มัดจำของลูกค้า (ยอด/ใช้/คืน · ล็อกเบอร์ผิดซ้ำ · หมดอายุ) | `deposit.ts` |
| `PosDepositTxn` | pos.prisma | สมุดมัดจำ (รับ · ใช้ · คืนสภาพ · คืนเงิน) | `deposit.ts` |
| `PosCustomerDisplay` | pos.prisma | จอลูกค้าที่จับคู่กับเครื่อง (รหัส/โทเคน hash · ภาพบิลล่าสุด · ค่าตั้งจอ) | `display.ts` |
| `PosStaffCommission` | pos.prisma | ค่าคอมฯ พนักงานขายต่อบรรทัด (ขาย/void/คืน · งวด · ส่งเข้า HR) | `staff-commission.ts` |
| `PosOfflineSale` | pos.prisma | บิลที่ส่งมาซิงก์จากเครื่องออฟไลน์ (SYNCED/REJECTED/ACCEPTED_BY_MANAGER/DISCARDED) | `offline-sync.ts` |
| `PosOfflineSnapshot` | pos.prisma | หลักฐานราคาที่เครื่องได้ไป (2 แถวล่าสุดต่อเครื่อง · hash = ETag) | `offline-sync.ts` |
| `PosCreditAccount` | pos.prisma | วงเงิน/เทอมของลูกค้าองค์กรต่อระบบ POS (วางบิล) | `credit.ts` |
| `PosIntegrationCredential` | pos.prisma | ค่าที่เจ้าของวางจากแพลตฟอร์ม/ผู้ให้บริการ (ค่าลับเข้ารหัส AES-256-GCM) | `integration-creds.ts` |
| `PosPaymentSlip` | pos.prisma | สลิปโอนที่แนบเป็นหลักฐาน (ไฟล์ส่วนตัว · ลบตามอายุเก็บ) | `payment-slip.ts` |
| `PosPrintAgent` | pos.prisma | ตัวช่วยพิมพ์ LAN ของร้าน (tokenHash · รายการเครื่องพิมพ์) | `print-relay.ts` |
| `PosPrintJob` | pos.prisma | งานพิมพ์ผ่าน relay (QUEUED→SENT→DONE/FAILED/EXPIRED · ล้างไบต์เมื่อจบ) | `print-relay.ts` |
| `PosOrder` | pos_order.prisma | ออเดอร์ทุกช่องทาง (สถานะ · สถานะชำระ · การรับ · ช่องทาง · externalRef · ผูกบิล) | `order.ts` |
| `PosOrderLine` | pos_order.prisma | บรรทัดออเดอร์ (ราคาแช่แข็งตอนรับ · สำเนาตัวเลือก) | `order.ts` |
| `PosOrderEvent` | pos_order.prisma | ประวัติการเปลี่ยนสถานะออเดอร์ (+ payload ของ adapter/เหตุผล) | `order.ts` |
| `PosOrderLink` | pos_order.prisma | ลิงก์สั่งล่วงหน้า `/q/<token>` (ACTIVE หนึ่งลิงก์ต่อสาขา · หมุนได้) | `order.ts` |

enum ที่สำคัญ: `PosSaleStatus` · `PosPayType` · `PosSaleDocType` · `SalesChannelKind`/`SalesChannelAdapter`/`SalesChannelPayout` · `PosOrderStatus`/`PosOrderPaymentState`/`PosOrderFulfilment` · `PosTableSplitMode` · `PosDepositStatus` · `PosStaffCommissionKind` (ไฟล์เดียวกับ model) · index มือที่ prisma มองไม่เห็นระบุใน migration และ runbook

## 3. Outbox events `pos.*` (17)
ตัวรับทุกตัวห่อ `withAutomation` (กฎอัตโนมัติ + webhook ของร้าน) ใน `src/lib/outbox-consumers.ts` · "งานหลัก" ล้ม = event retry (idempotent) · "ของแถม" ล้ม = WARN · ตาราง payload = `ledger/POS-CONTRACTS.md` ## Event
| คีย์ | ผู้ผลิต | ตัวรับ |
|---|---|---|
| `pos.sale.paid` | `service.ts` createSale | บัญชี (`account-bridge.ts`) + ค่าคอมฯ พนักงาน (งานหลักคู่) → สแตมป์ → สมาชิก (ยอดสะสม/แต้ม/ระดับ/ไทม์ไลน์) → CRM → ใบเสร็จในแชท |
| `pos.sale.voided` | `service.ts` voidSale · `table.ts` | กลับบัญชี · ปลดโต๊ะ · รอบครัว · บัตร/เครดิต · มัดจำ · ออเดอร์ของบิล · ค่าคอมฯ (งานหลัก) → การ์ดบิลยกเลิก → สแตมป์ → สมาชิก → CRM |
| `pos.sale.refunded` | `refund.ts` · `deposit.ts` | ใบลดหนี้ + JV + รับของคืน + แต้ม/ยอดสะสม (`refund-consumer.ts`) + ค่าคอมฯ → แจ้งคืนเงินในแชท |
| `pos.shift.opened` | `shift.ts` | กฎอัตโนมัติเท่านั้น |
| `pos.shift.closed` | `shift.ts` | การ์ดตรวจเงินกะ + โพสต์ Z ห้องทีม (`pos-board-bridges.ts` · ปิดอยู่โดยปริยาย) |
| `pos.stockCount.confirmed` | `stock-count.ts` | กฎอัตโนมัติเท่านั้น (ปรับคลังทำในธุรกรรมยืนยัน) |
| `pos.receipt.issue_reported` | `receipt-issue.ts` | การ์ดรับเรื่อง + ตอบรับ LINE (`pos-receipt-bridges.ts`) |
| `pos.receipt.taxInvoiceRequested` | `receipt-tax-request.ts` | กฎอัตโนมัติ/webhook เท่านั้น |
| `pos.payment.intent_paid` | `payment-intent.ts` | `orders.onIntentPaid` (ออเดอร์จ่ายก่อน → PREPAID) → "ได้รับเงิน" ในแชท |
| `pos.sale.taxInvoiceIssued` | `tax-invoice.ts` · `account-bridge.ts` | กฎอัตโนมัติ/webhook เท่านั้น |
| `pos.order.received` | `order.ts` | กฎอัตโนมัติเท่านั้น |
| `pos.order.accepted` | `order.ts` | สถานะในแชท |
| `pos.order.rejected` | `order.ts` | ยกเลิก ShopOrder เว็บร้านที่ยังไม่จ่าย + ปิดรอบครัว (งานหลัก) → สถานะในแชท |
| `pos.order.ready` | `order.ts` | สถานะในแชท |
| `pos.order.completed` | `order.ts` | กฎอัตโนมัติเท่านั้น |
| `pos.order.cancelled` | `order.ts` (รวมเลยเวลาจ่าย `expirePreorders`) | เหมือน rejected (งานหลัก) → สถานะในแชท |
| `pos.product.availability` | `catalog.ts` setAvailability | KDS/adapter ทุกช่องทางที่ active ของสาขา (`kdsOnAvailability`) |

`pos.sale.expired` ของสเปก v1 ไม่มี — แทนด้วย `pos.order.cancelled` + PosOrderEvent `expired` (P2.7 มติ 8) · ข้อสอบ `scripts/qc-pos-p2.14.mts` H2 ตรึงว่าตาราง Event ⊇ ทุกคีย์ในทะเบียนตัวรับ

## 4. Facade `src/lib/modules/pos/index.ts` (79 ชื่อ + `export type * from "./order-shared"`)
ห่อบางล้วน ไม่มีตรรกะ · ผู้เรียกนอกโมดูลใช้ไฟล์นี้ (ภายในโมดูล import ไฟล์ย่อยได้) · fitness F15.5 กันตัวบ่งชี้ระบบหลุด
- **บิล/ปิดวัน** (`service.ts`): `createSale` · `afterSaleCommitted` · `voidSale` · `closeDaySummary` · `closeDayBills` · `bkkToday` · `posSystemForSale` · `saleStatusByKey` · `PosSaleError` · types `CreateSaleInput` `MemberSaleChoices` `SaleResult` `CloseCtx` `PosDaySummary` `PosDayBill` `PayMethodLine`
- **แคตตาล็อก** (`catalog.ts`): namespace `catalog` (createProduct · updateProduct · setPrice · archive · restore · listForUnit · byBarcode · ensureForInvItem · createCategory · checkCatalogWrite · createOptionGroup · setProductOptionGroups · setRecipe · setRecipeChoiceLines · setBomEnabled · setChannelPrices · bulkChannelMarkup · webPricesForShop · setAvailability · availabilityFor) · `CatalogError` · types `CatalogCtx` `CatalogActor` `CatalogClient` `CatalogErrorCode` `CatalogRowScope` `CatalogWriteVerdict` `PosProductView` `PosOptionGroupView` `TrackStockMode`
- **ราคา** (`price.ts` · `price-shared.ts`): `resolvePrices` · types `ResolvePricesInput` `ResolvePricesResult` `ResolvedPriceItem` `PriceScope` `PriceSource` `ChannelPriceView` `ChannelPriceInputRow`
- **สูตร/BOM** (`recipe-shared.ts` · `recipe.ts`): `expandRecipe` · `RECIPE_MAX_COMPONENTS` · `recipeCost` · types `RecipeBaseLine` `RecipeChoiceLine` `RecipeComponent` `ExpandRecipeResult` `RecipeCostCtx` `RecipeCostItem` `RecipeCostLine` `RecipeCostResult`
- **ออเดอร์** (`order.ts` · `order-adapters.ts` · `order-shared`): namespace `orders` (ingestOrder · ingestInTx · sourceCancelledInTx · afterCommit · acceptOrder · rejectOrder · markPreparing · markReady · handOver · cancelOrder · payOrder · setPrepMinutes · setChannelOrderSettings · listOrders · getOrder · onShopOrderPaid · onSaleVoided · webLineSources · webClaimInTx · webSaleBoundInTx · webClaimRevertInTx · onIntentPaid · expirePreorders · kitchenProgressInTx) · `ORDER_ADAPTERS` · types `OrderAdapter` `OrderAdapterKind` · `export type *` ของ `order-shared` (ชนิดสถานะ/ผลของออเดอร์)
- **แชท** (`chat-link.ts` · `chat-order.ts` · `chat-link-shared.ts`): namespace `chatLink` (settingsOf · systemForUnit · setSettings · receiptPlan · refundPlan · orderPlan · orderIdOfIntent · ordersForChat · statusUrl · preorderLink · requestPayment) · `POS_CHAT_DEFAULTS` · `POS_CHAT_STATUS_LABELS` · `bangkokHHmm` · `chatMoney` · `chatReasonLabel` · `chatText` · `matchBotIntent` · `posChatLang` · `posChatSettings` · `withStatusLink` · types `ChatPaymentPosResult` `ChatPaymentRefusal` `ChatPaymentCode` `PosChatTarget` `ReceiptChatPlan` `RefundChatPlan` `OrderChatPlan` `OrderChatFacts` `ChatOrderItem` `ChatPreorderLinkResult` `PosChatSettingsResult` `PosBotIntent` `PosChatLang` `PosChatSettings` `PosChatStatusKind` `PosChatTextKey`
- **ชนิดของหน้าขาย** (`register-shared.ts`): `RegisterActor` · `RegisterCtx`

## 5. Permissions (24 คีย์ · `src/lib/core/permissions.ts`)
OWNER ผ่านทุกอย่าง · MANAGER ผ่านในสาขาที่ดูแล · STAFF ต้องได้คีย์ (หรือ `pos.*`) — คำอธิบายต่อคีย์ + บทบาทปริยาย = `docs/modules/14-pos.md` §13
- ขาย/บิล: `pos.sale.create` · `pos.sale.read` · `pos.sale.void` · `pos.sale.refund` · `pos.sale.priceOverride` · `pos.sale.manage` · `pos.taxinvoice.issue` · `pos.credit.manage`
- กะ/สต็อก/เครื่อง/พนักงาน: `pos.shift.operate` · `pos.shift.manage` · `pos.stock.count` · `pos.device.manage` · `pos.staff.manage`
- แคตตาล็อก/ราคา/ช่องทาง/ออเดอร์: `pos.product.manage` · `pos.product.setPrice` · `pos.price.rule` · `pos.channel.manage` · `pos.order.accept` · `pos.order.reject`
- รายงาน/ตั้งค่า/ออฟไลน์: `pos.report.view` · `pos.report.anomaly` · `pos.settings.manage` · `pos.settings.payment` · `pos.offline.sync`
- ด่านหน้าจอ = deciders บริสุทธิ์ใน `src/lib/modules/pos/access.ts` · ด่าน action = `assertCan`/`evaluate` ต่อสาขาในไฟล์ action/บริการ · REST = scope ของคีย์ (`src/lib/api-keys/scopes.ts` ชุด pos-read/pos-operate/pos-admin)

## 6. Integration cards (13 · `src/lib/pos-integrations.ts`)
`MEMBER` · `POINT` · `COUPON` · `REWARD` · `ACCOUNT` · `INVENTORY` · `HR` · `CRM` · `CHAT` · `KANBAN` · `MARKETING` · `BOOKING` · `AI` — การ์ดอ่านอย่างเดียวที่ ตั้งค่า › การเชื่อมต่อระบบ SHARK (สถานะ LINKED/OFF/NO_SYSTEM/PLANNED + ข้อเท็จจริงสด + backlog outbox) · สวิตช์จริงอยู่ที่หน้าของแต่ละระบบ/แท็บตั้งค่า · ทางเชื่อม: ACCOUNT `account-bridge.ts` · HR `hr-link.ts` + `staff-commission.ts` · CRM `crm-link.ts` · CHAT `pos-chat-bridges.ts` · KANBAN `pos-board-bridges.ts` · INVENTORY `catalog.ts`/`stock-count.ts`/`ai-insights.ts` · MEMBER/POINT/COUPON/REWARD `register-member.ts` + สะพานสมาชิกใน outbox · e-Tax `etax-link.ts` · ข้อสอบ `scripts/qc-pos-p3.12.mts` (การ์ด) · `scripts/qc-pos-p2.14.mts` K1 (facts)

## 7. Offline · sync · device binding · print relay
- **ออฟไลน์** (P3.4): ธง `settings.pos.offline.enabled` ของระบบ POS (เจ้าของเปิด · `offline-shared.ts`) · เครื่องเก็บ snapshot ราคา (`PosOfflineSnapshot` · ETag) · ขายเงินสด/โอน · เลข `OFF-<deviceCode>-<seq>` · ซิงก์ผ่าน route session `src/app/api/pos/sync` หรือ REST `POST /sync/sales` (`pos.offline.sync`) → `syncOfflineSales` (`offline-sync.ts`): คิดราคา ณ soldAt/snapshot · ตรวจนาฬิกา กะ เครื่อง ผู้ขาย (โทเคนผู้ขายไม่ถูกเก็บ) · ผลรายบิล OK/DUPLICATE/REJECTED → คิวผู้จัดการที่หน้ากะ · ข้อสอบ `scripts/qc-pos-p3.4.mts`
- **ผูกเครื่อง** (P5.2 D1): จับคู่ = `registerDeviceAction` (`pos.device.manage`) ตั้งคุกกี้ `v1.<claim>.<HMAC-SHA256>` ลงนามด้วย env `POS_DEVICE_KEY` (ไม่ตั้ง/สั้นกว่า 32 = จับคู่ไม่ได้ · `device-cookie.ts`) · เปิดกะ/X/ข้อมูลหน้ากะอ่าน "เครื่องที่ยืนอยู่" จากคุกกี้เท่านั้น · เพดานเครื่อง ACTIVE ต่อสาขาปริยาย 3 · ข้อสอบ `scripts/qc-pos-p5.2.mts`
- **ตัวช่วยพิมพ์ LAN** (P3-SKEL): `print-relay.ts` + route `src/app/api/pos/print-agent` + สคริปต์ร้าน `tools/pos-print-agent/agent.mjs` (ต่อออก · โทเคนแสดงครั้งเดียว · sha256) · ไบต์ ESC/POS ≤ 256 KB แจกครั้งเดียว · หมดอายุ 10 นาที · ล้างไบต์เมื่อจบ · ข้อสอบ `scripts/qc-pos-p3-skel.mts`
- **หน้าสาธารณะ**: เพดานอัตราต่อ IP (`public-rate.ts`) · โทเคนใบเสร็จ 12 ตัว Crockford · ลิงก์สั่งล่วงหน้า 16 ตัว · QR โต๊ะ 128 บิต · คุกกี้จอลูกค้า 32 ไบต์ (hash)

## 8. REST `/api/v1/pos`
ทะเบียน `src/lib/modules/pos/api/registry.ts` (op 49 · กลุ่ม `/units` `/sales` `/products` `/channels` `/orders` `/shifts` `/devices` `/reports` `/sync`) · `definePosOp` (`api/op.ts`) · dispatch + idempotency + เพดานต่อคีย์ (`api/dispatch.ts`) · OpenAPI + เอกสาร `docs/api/POS-API.md` สร้างด้วย `scripts/gen-pos-api-docs.mts` (`--check` ในด่าน) · tool ผู้ช่วย AI = op ที่ประกาศ `tool` (`api/tools.ts`) · สกิล `skills/shark-pos-api/`

## 9. สัญญาที่ข้อสอบตรึง (ตัวชี้)
| สัญญา | ข้อสอบ |
|---|---|
| createSale/void · ลำดับคิดเงิน · หน้าขาย | `scripts/qc-pos-p1.3.mts` · `scripts/qc-pos-p1.6.mts` · `scripts/qc-hf-tx.mts` |
| แคตตาล็อกเดียว + backfill | `scripts/qc-pos-p1.1.mts` |
| คืนเงิน + CN + ตัวรับ | `scripts/qc-pos-p1.8.mts` |
| กะ/X/Z/นับย้อนหลัง | `scripts/qc-pos-p1.9.mts` · `scripts/qc-pos-p1.9b.mts` |
| ใบขอรับเงิน PromptPay/Beam | `scripts/qc-pos-p1.7.mts` |
| PIN/เพดาน/อนุมัติ | `scripts/qc-pos-p1.15.mts` |
| ช่องทาง · ราคา · BOM | `scripts/qc-pos-p2.1.mts` · `scripts/qc-pos-p2.2.mts` · `scripts/qc-pos-p2.3.mts` |
| โต๊ะ · แยกบิล · KDS · QR · ออเดอร์ | `scripts/qc-pos-p2.4.mts` · `scripts/qc-pos-p2.5.mts` · `scripts/qc-pos-p2.6.mts` · `scripts/qc-pos-p2.7.mts` · `scripts/qc-pos-p2.8.mts` |
| บัตร/เครดิต/ทิป · มัดจำ · จอลูกค้า · หลายสาขา · รายงาน | `scripts/qc-pos-p2.9.mts` · `scripts/qc-pos-p2.9b.mts` · `scripts/qc-pos-p2.10.mts` · `scripts/qc-pos-p2.11.mts` · `scripts/qc-pos-p2.12.mts` |
| REST + สกิล | `scripts/qc-pos-p2.13.mts` · `scripts/qc-pos-api-skill.mts` |
| ออฟไลน์ · HR · CRM · แชท · บอร์ด · AI · โครงแพลตฟอร์ม | `scripts/qc-pos-p3.4.mts` · `scripts/qc-pos-p3.5.mts` · `scripts/qc-pos-p3.6.mts` · `scripts/qc-pos-p3.7.mts` · `scripts/qc-pos-p3.8.mts` · `scripts/qc-pos-p3.9.mts` · `scripts/qc-pos-p3-skel.mts` |
| ทะเบียนปุ่ม · สิทธิ์ทุกพื้นผิว · สิทธิ์หน้า | `scripts/qc-pos-p4.1.mts` · `scripts/qc-pos-p5.2.mts` · `scripts/qc-hf-pos-page-authz.mts` |
| เอกสาร · คู่มือ · สกิล (ใบนี้) | `scripts/qc-pos-p6.2.mts` |

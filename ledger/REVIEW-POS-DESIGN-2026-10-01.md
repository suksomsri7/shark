# REVIEW — POS design vs. code as-built (SURVEY-P1 · lane 5 · read-only)

> 1 Oct 2026 · worktree `/root/projects/shark-pos-e` · base `d0e6e514` (origin/main 04d2ade9 + POS P0.1 tooling) · surveyor: Opus 5.5
> Method: read code only (grep/sed/cat); every fact = `file:line`. **C** = CONFIRMED (traced in code) · **P** = PLAUSIBLE (inferred, not fully traced).
> Note: P0.2 files (`src/lib/modules/pos/api/*`) are NOT in this base — they live on `wip/pos-p0.2` (lane 2). Findings about them come from `/root/projects/shark-pos-b/ledger/wo-notes/pos-P0.2.md` only.

Sections: 1 names · 2 catalogue · 3 createSale/voidSale · 4 tenancy (+ P0.2 verdicts) · 5 numbering/close/shift/coupon/stock · 6 conflicts + rulings · 7 consistent.

---

## 1. Name corrections (design docs → code today)
Legend: **E** exists as named · **A** exists under another name · **N** does not exist (new — fine) · **X** contradicts code. All rows **C** unless marked.

### 1.1 Models / enums / fields
| name in docs | where named | status | code reality |
|---|---|---|---|
| `PosSale` `PosSaleLine` `PosPayment` `PosReceiptCounter` | DESIGN §3 | E | `prisma/schema/pos.prisma:19,61,79,94` |
| `PosSaleLine.itemId/serviceId` | DESIGN §3, MIG §0 | E | `pos.prisma:72-73` |
| `PosPayment` types CASH/TRANSFER/PROMPTPAY/DEPOSIT/ROOM_CHARGE | DESIGN §3 | E | enum `PosPayType` `pos.prisma:11-17`; ROOM_CHARGE has **no producer** (no caller sends it) |
| `PosPayMethodType` | DESIGN §7 | **A** | `PosPayType` (MIG §3 uses the right name) |
| `PosSaleStatus` PENDING_PAYMENT / PENDING_APPROVAL | CONTRACTS C-9, 14-pos §S12 "✅" | **X** | enum = `PAID, VOIDED, REFUNDED` only `pos.prisma:5-9`; spec 14-pos.md:98 marks S12 ✅ but nothing exists |
| `PosSale.memberSnapshot` ("คง" / "บิลเก็บ memberSnapshot") | DESIGN §7, CONTRACTS §0.3/C-10 | **X** | no such column; bill stores `memberId` only `pos.prisma:24` |
| `PosSale.partyId` (CONTRACTS §0.3 "memberId + partyId") | CONTRACTS §0.3 | N | resolved at posting time via `Customer.partyId` (`outbox-consumers.ts:150-155`) |
| `voucherUseIds giftCardTxnId tierDiscountSatang stampEventIds attributionId giftCardId` | CONTRACTS §0.4, COMMON §5 | E | `pos.prisma:42-51`; written by `service.ts:252-261` (voucher/tier/gift) and member bridges (stamps/attribution — **P**) |
| `PosSale.channelId commissionSatang docType refSaleId shiftId deviceId staffUserId vatMode vatRateBp tipSatang serviceChargeSatang offlineRef syncedAt approvalRequestId` | MIG §1 | N | none exist; `refSaleId` exists only on `PosPayment` `pos.prisma:87` |
| `costSnapshot` per line | DESIGN M5 | N | `PosSaleLine` has no cost; COGS comes from `InvMovement` |
| `PosProduct PosCategory PosVariant RecipeLine PosProductOptionGroup SalesChannel PosProductChannelPrice ExternalOrder ExternalOrderEvent PosShift PosDevice PosHeldCart PosPaymentIntent PosReceiptToken PosStockCount(Line) PosStaffPin PosDocCounter` | DESIGN §7, MIG §1, brief P1.1a | N | none in `prisma/schema/**` |
| `InvItem` "ไม่มีช่องราคาขาย" / price = `AccountProduct.salePrice` only | DESIGN §3, MIG §0, brief P1.1a "Why" | **X** | `InvItem.priceSatang` exists `inventory.prisma:90` and is the live price for services/CRM; `AccountProduct.posPrice` `account_gl.prisma:178` also exists (unused by POS) |
| `InvItem kind=SERVICE` | DESIGN §3 | E | `InvItemKind{PRODUCT,SERVICE}` `inventory.prisma:14-17` |
| `InvItem kind=MENU` ("สร้าง InvItem ใหม่ kind=MENU") | MIG §2 step 1 | **X** | no MENU value — needs `ALTER TYPE … ADD VALUE` (non-transactional) |
| "variant = `InvItem` ลูก" | DESIGN §7 | N | no `parentId` on InvItem |
| `MenuItem` + `MenuCategory` + `MenuOptionGroup/Choice` + `KdsStation` + `stockQty/dailyStockQty/isOutOfStock` | MIG §0 | E | `restaurant.prisma:111-249` (all **unit-scoped**) |
| `MenuItemOptionGroup` (keep) | MIG §2 | E | `restaurant.prisma:216-229` |
| `MenuItem.posProductId` | brief P1.1a | N | (note `MenuItem.invItemId` **already exists**, unused `:161`) |
| `ShopProduct.posProductId` | brief P1.1a, MIG §2 | N | `ShopProduct.invItemId` exists `ecommerce.prisma:17` |
| `ShopOrderLine` "+ nullable `productId`" | **brief P1.1a §1** | **X** | `ShopOrderLine.productId` **already exists** (required FK → ShopProduct) `ecommerce.prisma:58-59`; MIG §0 correctly says `posProductId` |
| `RestaurantOrderItem.menuItemId` (+`productId`) | MIG §0 | E (+N) | `restaurant.prisma:383`; also has `saleId` per item `:404` |
| `Voucher VoucherTemplate GiftCard GiftCardTxn StampCard StampEvent MemberAttribution MemberTierBenefit Customer MemberConsent MemberChannelIdentity` | CONTRACTS §0/C-10 | E | `voucher.prisma:52,76` · `giftcard.prisma:28,63` · `stamp.prisma:35,92` · `member.prisma:638,687,11,435,567` |
| `HrEmployee.pinCode` | CONTRACTS C-8 | E | `hr.prisma:73` (kiosk clock-in) |
| `CrmCompany`, `FormDef`, `MktCampaign`, `AutomationRule`, `ApprovalPolicy/Request`, `Shipment`, `InvLocation` | CONTRACTS/DESIGN | E | `crm.prisma:385`, `forms.prisma:2`, `marketing.prisma:18`, `automation.prisma:34`, `approval.prisma:20,51`, `delivery.prisma:9`, `inventory.prisma:117` |
| `MktCampaign` type `PRICE_RULE` | CONTRACTS C-6 | N | no such value |
| `AccountDocType` CN for refunds | DESIGN M3 | E | `CREDIT_NOTE` `account.prisma:14`; `TAX_INVOICE_ABB` `:12` |
| `abbInvoiceNo` ("เลขจากบัญชี") | DESIGN M3 | **X** | no field; ABB doc number **= `PosSale.receiptNo`** (`account/index.ts:213`, `account/settings-schema.ts:15`) |
| `@@unique([unitId,receiptNo])`, `@@unique([tenantId,idempotencyKey])` "คงเดิม" | MIG §1 | E | `pos.prisma:56-57` |

### 1.2 Functions / services
| name in docs | status | code reality |
|---|---|---|
| `createSale`, `voidSale`, `listSales`, `daySummary`, `closeDay*` | E | `service.ts:97,350,437,448,517,582,625`; `listSales` has no caller |
| `refundSale` | N | – |
| `confirmSalePaid` ("interface D1 มี") | **X** | does not exist anywhere |
| `emitOutbox` (`src/lib/core/outbox.ts`) | E | used `service.ts:289,356` |
| `inv.consume` "ชุดเดียว" (batch) | **A** | `inventory.consume(ctx,{itemId,qty,…})` **one item per call, own tx** `inventory/service.ts:504-525` — no batch API |
| `account.postSale({…channelCode, commissionSatang, payoutMethod})` | **A/N** | `applyExternalSale` `account/index.ts:87` (no channel/commission fields); reverse = `reverseExternalSale` `:262` (whole bill only; no CN/partial API) |
| `member.lookup` / `member.quickRegister` | N | register uses `posMembers` (200 newest) `register.ts:305-313`; `findOrCreate` `member/service.ts:144` |
| `member.benefitsFor({memberId,unitId})` → vouchers/stamps/giftCards | **X** | `benefitsFor(ctx, customerId)` returns tier benefits only `member/tiers.ts:756`; the wallet the register uses = `member.getWallet` (`member/wallet.ts:308`) + `quoteApply`/`applyOnSale` (`member/wallet.ts:667,732`) |
| `recordSpend`, `findOrCreate` | E | `member/service.ts:310,144` (called from `member-bridges.ts:117`) |
| `quoteBurn` | A | REST op `points.quoteBurn` `member/api/ops/points.ts:131`; in-process = `member.quoteApply` |
| `voucher.quote/redeem/release` | A | `voucher.validate/redeem/release/releaseForSale` `voucher/service.ts:1020` |
| `giftcard.charge/reverse` | A | `giftcard.use` / `refundUse` `:834` / `refundUsesForSale` `:899` |
| `stamp.earn/reverse` | A | `autoStampFromSale(Event)` / `voidStampsForSale(Event)` / `refundStamps` `stamp/service.ts:989` |
| partial reverse of points ("Point partial reverse") | N | `point.reverseWithLots` reverses **all** entries of a ref `point/lots.ts:328` |
| `approval.resolvePolicy(ctx,{module,action,amountSatang})` / `submitForApproval(ctx,{module,refType,refId,action,payload,requestedBy})` | **X (shape)** | `resolvePolicy(ctx,{entityType,unitId,systemId,amountSatang})` `approval/service.ts:40-45,139`; `submitForApproval(ctx,{entityType,entityId,unitId,systemId,amountSatang,requestedById})` `:47-54,168`; **no payload**, idempotency `approval-<entityType>-<entityId>` `:180` ⇒ one request per entity ever |
| `chat.pushToContact({tenantId, partyId\|memberId, template, data})` | **X (shape)** | `pushToContact({tenantId, channel, externalUserId, text, systemId?})` `chat/push.ts:18-32,75`; `sendLineToParty` `chat/party-bridge.ts:49` |
| `hr.onShiftToday`, `hr.recordCommission` | N | – |
| `marketing.activePriceRules` | N | – |
| `kds.stationQueue` | E | `restaurant/kds.ts:14` |
| `storage.upload` | P | not checked |
| `crm.creditTerms`, `createDeal` from POS | N | POS→CRM today = `posOpenDeals`/`posLinkSaleToDeal` `register.ts:335-372` |
| "AI ยังไม่มี เปิดบิล POS (WO-0045 ค้าง)" / `pos_open_sale` new | **X** | `pos_create_sale` tool + proposal exist `ai/tools.ts:1038`, `ai/proposals.ts:751`; `void_sale` too `tools.ts:1010` |
| DESIGN §3 "Point/Coupon/Member/Inventory เรียกใน tx" | **X** | only coupon + member-rights in tx; points/stamps via outbox (`service.ts:11-17`); stock after commit `:306-311` |
| MIG §0 "AccountProduct ซิงก์ตาม (เดิมมี sync 2 ทาง)" for price | **X** | price never syncs; only name/sku/unit/cost/qty (`account/inventory-link.ts:87,138`); `salePrice` copied once on link-create `:227` |

### 1.3 Events / permissions
| name | status | code reality |
|---|---|---|
| `pos.sale.paid`, `pos.sale.voided` | E | `service.ts:291,358`; consumers `outbox-consumers.ts:673,678-680` |
| `pos.sale.refunded/expired`, `pos.shift.*`, `pos.product.availability`, `pos.order.*`, `pos.stockcount.confirmed`, `pos.receipt.issue_reported` | N | – |
| `approval.decided` | **A** | `approval.request.approved` / `approval.request.rejected` (`outbox-consumers.ts:695-696`; effects in `src/lib/approval-effects.ts`) |
| `pos.sale.create`, `pos.product.setPrice`, `pos.sale.void` | E | `permissions.ts:129-137` |
| `pos.sale.read/refund`, `pos.product.manage`, `pos.settings.manage`, `pos.channel.manage`, `pos.order.accept/reject`, `pos.approval.decide`, `pos.offline.sync`, `pos.price.rule`, `pos.shift.*`, `pos.device.manage`, `pos.stock.*`, `pos.sale.discount/priceOverride/confirmPayment` | N | only 3 keys exist; spec 14-pos §9 names the rest |
| `maxDiscountBp` | N | comment only (`rbac.ts:18`, `permissions.ts:746`) |

### 1.4 Files / routes / scripts
| name | status | reality |
|---|---|---|
| `src/lib/modules/pos/catalog.ts`, `channel.ts`, `external/adapter.ts` | N | – |
| `pos/api/registry.ts` | N in this base | exists only on lane-2 `wip/pos-p0.2` (P0.2 notes §1) |
| `account/api/registry.ts` (pattern) | E | `src/lib/modules/account/api/registry.ts` |
| `/api/u/[unitId]/pos/...` + `X-Pos-Device` | **X** | no `src/app/api/u/`; POS UI = server actions + system-scoped pages `src/app/app/sys/[id]/pos/*`; restaurant is **unit-scoped** `src/app/app/u/[unitSlug]/restaurant/*` |
| `/api/v1/pos/*` | N | legacy `/api/v1/sales` exists `src/app/api/v1/sales/route.ts` |
| `/api/payment/beam/webhook` | E | `src/app/api/payment/beam/webhook/route.ts` — shared with AI top-up + accounting (`referenceId` prefix `acc:`); POS needs its own prefix branch |
| `/r/[token]` | N | – |
| `src/messages/{th,en}.json` key `pos.*` | **X** | files are `src/messages/{th,en}/common.json` only (26 lines); `src/i18n/request.ts:11` loads **only `common.json`**; 1 file in `src/` uses translations (`src/app/page.tsx`) ⇒ i18n infra for POS does not exist |
| `vercel-build.sh` | A | `scripts/vercel-build.sh` (migrate deploy on prod build `:21-24`) |
| `-- @concurrent` / `CREATE INDEX CONCURRENTLY` "ตามแนว `perf_indexes`" | **X** | `20260915000000_account_v2_perf_indexes` uses plain `CREATE INDEX`; repo note: "CONCURRENTLY ไม่ได้เพราะ prisma migrate ห่อ transaction" (`20260731170000_businessunit_slug_index/migration.sql:2`) |
| partial unique "เหมือน `one_open_session_per_table`" | **X** | exists only as a schema comment `restaurant.prisma:317-318`; **no migration creates it** ⇒ no precedent in repo |
| `AUTHZ_BASELINE` (ratchet pattern) | E | `scripts/fitness.mts:601` |
| `scripts/qc-pos-account.mts` `qc-account-cpa.mts` `qc-restaurant-money.mts` `qc-shop-refund.mts` `qc-hotel-money.mts` `qc-ticket-money.mts` `qc-subscription-money.mts` (MASTER §1, COMMON §7) | E | all present in `scripts/` (counts 16/107 not re-verified — **P**) |
| `pos-qc-env.mts` `seed-pos-qc.mts` `visual-pos.mts` `pos-ui-inventory.json` `wo-notes/TEMPLATE-pos.md` `fitness-pos.mts` `pos-sale-contract.json` (P0.1) | E | present |
| `qc-pos-p1.1.mts`, `qc-pos-p1.3.mts` ("already exists from P0.3" — brief P1.1a §5) | N | P0.3 not in this base |
| `qc-pos-catalog-backfill.mts` (MIG §2) vs `qc-pos-p1.1.mts` (MASTER/brief) | **X** | two names for one oracle — pick one |
| `pos-backfill-catalog.mts`, `verify-prod-pos.mts` | N | – |
| `scripts/qc-pos-catalog.mts` (named in `pos/tabs.ts:2`) | **X** | does not exist |
| `docs/UI_STANDARD.md` `docs/sds/modules/pos.md` `docs/BLUEPRINT_CONNECTIONS.md` `docs/modules/_CONVENTIONS.md` `ledger/crm-briefs/crm-brief-COMMON.md` | E | present |
| DESIGN §3 sizes "service.ts 570 · register-ui 422 · 1,350 lines" | X (stale) | `service.ts` 652, `register-ui.tsx` 868, module total 2,062 lines |
| Money regression set misses createSale/voidSale callers | gap | also exist and touch the money path: `qc-booking-deposit`, `qc-clinic-refund`, `qc-school-refund`, `qc-rental-refund`, `qc-hotel-refund`, `qc-ticket-cancel`, `qc-restaurant-void`, `qc-member-m2.6` (gift card, tx caller), `qc-member-m2.8` (wallet in sale), `qc-pos-register/products/coupon/closeday/inventory` |

---

## 2. Catalogue as-built

### 2.1 Models and scope (C — schema read)
| model | scope | price field(s) | key fields for P1.1a | file |
|---|---|---|---|---|
| `InvItem` | `tenantId`+`systemId` (**inventory system**, not unit) | `priceSatang Int @default(0)` (services; CRM deals; copied once from `salePrice` on link) `:90` · `costSatang` `:97` | `kind InvItemKind{PRODUCT,SERVICE}` (**no MENU**) `inventory.prisma:14-17,89` · `barcode String?` `:83` · `sku` `@@unique([systemId,sku])` `:110` · `categoryId` (loose → `InvCategory`) `:87` · `accountProductId` (loose) `:103` · `onHand` cache `:98` · images = `InvItemImage` `:63-76` · **no parentId/variant** | `prisma/schema/inventory.prisma:78-113` |
| `InvLocation`/`InvLocationStock` | system / per location | – | stock per location; sum = `InvItem.onHand` | `inventory.prisma:117-141` |
| `MenuCategory` | `tenantId`+**`unitId`** | – | `@@unique([unitId,name])`, `availableFrom/To` | `restaurant.prisma:111-131` |
| `MenuItem` | `tenantId`+**`unitId`** | `basePrice Int` (no default) `:147` | `categoryId`/`stationId` **required** FKs · `stockQty/dailyStockQty/isOutOfStock` · `invItemId String?` `:161` (**exists, never written/read** by restaurant code) · `@@unique([unitId,sku])` | `restaurant.prisma:133-174` |
| `MenuOptionGroup` / `MenuOptionChoice` | **unit** | `MenuOptionChoice.priceDelta` `:203` | `@@unique([unitId,name])` ⇒ groups are per branch, not shareable | `restaurant.prisma:176-214` |
| `MenuItemOptionGroup` (link) | unit | – | `@@unique([itemId,groupId])` | `restaurant.prisma:216-229` |
| `KdsStation` | unit | – | – | `restaurant.prisma:233-249` |
| `ShopProduct` | `tenantId`+**`unitId`** | `priceSatang Int @default(0)` | `invItemId String?` (loose) · `imageUrl` single | `ecommerce.prisma:10-27` |
| `ShopOrderLine` | tenant | `unitPriceSatang` snapshot | `productId` → `ShopProduct` (already named `productId`) | `ecommerce.prisma:54-66` |
| `RestaurantOrderItem` | unit | `unitPrice`+`optionsTotal` snapshot | `menuItemId String?` · **`saleId String?` (per-item settlement already exists)** | `restaurant.prisma:378-416` |
| `AccountProduct` | `tenantId`+`systemId` (**account system**) | `salePrice Int?` `:154` · **`posPrice Int?` `:178`** · `buyPrice` · `vatRateBp` | `posEnabled`, `posCategory` `:176-177` (UI-only, POS never reads) · `barcode` `:165` · `invItemId` `:191` · `type{GOODS,SERVICE,BUNDLE}` + `AccountProductBundleItem` | `account_gl.prisma:145-212` |
| `BookingService` | unit | `priceSatang` (copy of `InvItem.priceSatang`, re-synced on read `booking/service.ts:240-254`) | `itemId` → InvItem `booking.prisma:31` | `booking.prisma:17-38` |

⇒ Price lives in **6** places today, not 3: `AccountProduct.salePrice`, `AccountProduct.posPrice` (dead for POS), `InvItem.priceSatang`, `BookingService.priceSatang`, `MenuItem.basePrice`(+`priceDelta`), `ShopProduct.priceSatang`. **C**

### 2.2 Where the sale price really comes from per selling path
| path | source | server re-prices? |
|---|---|---|
| POS register — products | `posCatalog`: `AccountProduct.salePrice` if >0 else **`InvItem.costSatang`** (`pos/register.ts:137-152`); list capped at **200 newest PRODUCT items** (`inventory/service.ts:793-799`) | **no** — client `unitPriceSatang` passed through (`actions/pos.ts:84,435`) |
| POS register — services | `posServices`: `InvItem.priceSatang` (kind SERVICE) `register.ts:168-178`, fallback `BookingService.priceSatang` `:186-197` | no |
| AI `pos_create_sale` | AI payload `proposals.ts:756-760` | no |
| Restaurant | `MenuItem.basePrice` + `MenuOptionChoice.priceDelta` → snapshot on order → checkout (`restaurant/order.ts:405-417`) | yes (snapshot) |
| Shop | `ShopProduct.priceSatang` → `ShopOrderLine` snapshot (`shop/service.ts:136-138`) | yes |
| Booking / Hotel / Ticket / School / Rental / Clinic / Subscription | `Appointment.priceSatang`←`BookingService` · `HotelReservation.totalSatang`←`RoomType.baseRateSatang` · `TicketType.priceSatang` · `SchoolCourse.priceSatang` · `RentalAsset.dailyRateSatang` (current, not snapshot) · typed fee · `MemberPlan.priceSatang` | yes (none of these are catalogue items) |
**C** (POS/restaurant/shop re-read; others from sub-search, P for exact lines)

### 2.3 Writers (src/) and their entry points
| model.field | writer fn · file:line | entry points |
|---|---|---|
| `MenuItem` create/update | `restaurant/menu.ts` `createItem :254` · `updateItem :296` (no caller) · `duplicateItem :318` · `archiveItem :343` · `setItemStock :354` · `resetDailyStock :417` | `src/lib/actions/restaurant.ts:155,186,192,179,198`; `scripts/seed-pos-qc.mts:265` |
| `MenuItem.stockQty/isOutOfStock` | `restaurant/order.ts` `createOrder :168,:177` · `cancelOrderItem :280` | staff order action; **public** `POST /api/store/[tenantSlug]/[unitSlug]/restaurant/order` (via `storefront.ts:210`) |
| `MenuOptionChoice.priceDelta` | `menu.ts:163` (`createOptionGroup`) | `actions/restaurant.ts:95` |
| `ShopProduct` | `shop/service.ts:49` (`createProduct`) · `:92` (`updateProduct`, updateMany) | `shop/actions.ts:50,73,87` |
| `AccountProduct.salePrice` | `account/service.ts:573` (`updateAccountProductSalePrice`) · `:589` (`createAccountProductWithSalePrice`, sets only `InvItem.accountProductId` half-link) | `pos/register.ts:286,296` ← `actions/pos.ts:490` ← `/pos/products` |
| `AccountProduct.salePrice/posPrice` | `account/product.ts:532` (`createProduct`) · `:601` (`updateProduct`) | `account/product-actions.ts:519,515`; import `import-core.ts:512`; REST ops `account/api/ops/products-write.ts:244,266` (= `/api/v1/account/*` **and** AI tool `account_create_product` via `src/lib/ai/account-ops.ts`) |
| `InvItem.priceSatang` | `inventory/service.ts:191` (`createItem`) · `:350` (`updateItem`) · `account/inventory-link.ts:221-227` (copies `salePrice` once) | `inventory/actions.ts:67,88,302,329`; import; **AI proposal `inventory_create_item` `proposals.ts:618`**; `booking/service.ts:329` (`importServicesToCatalog`) |
| `BookingService.priceSatang` | `booking/service.ts:254` (re-sync inside `serviceRoster` read) · `:301-302` | booking pages |
No raw SQL, no `tx[model]`, no nested relation writes for these models in `src/`. **C** (sub-search; spot-checked `inventory-link.ts:227`, `booking/service.ts:254`, `MenuItem.invItemId` unused)

### 2.4 Readers that matter for P1.1
`pos/register.ts:137-152,232-258` (POS) · `restaurant/menu.ts` + `storefront.ts` (QR menu, public) · `shop/service.ts` + storefront pages (`src/app/(store)/…`) · `crm/deals.ts:471` reads `InvItem.priceSatang` via `inventory.getItemsByIds` (`inventory/service.ts:828-832`) · account product pages read `posEnabled/posPrice`. **P** (not exhaustive for storefront pages)

### 2.5 F15.1 baseline (`scripts/fitness-pos.mts:75-81`, regexes `:82-87`) — missing writers
All 5 baseline files are genuine writers. **Not covered by the ratchet** (C unless noted):
1. **`InvItem.priceSatang`** — POS service price + CRM deal price + booking source; writers in `inventory/service.ts`, `account/inventory-link.ts`, `ai/proposals.ts:618`, `booking/service.ts:329`. Not a target of any regex. **Largest gap** if `PosProduct.basePriceSatang` becomes the price master.
2. **`BookingService.priceSatang`** (`booking/service.ts:254,301`) — a second copy of the service price.
3. **`AccountProduct.posPrice`** — only caught by accident (same file as `salePrice`).
4. **`MenuOptionChoice.priceDelta` / `MenuItemOptionGroup` / `MenuCategory` / `KdsStation`** — option/category writers that P1.1b must also route through `catalog.ts`; regex covers only `menuItem|shopProduct`.
5. `scripts/` is not scanned (`scanCatalogWriters` walks `src` only `:92`); QC scripts write `accountProduct.create({salePrice})` directly (`qc-pos-register.mts:55`, `qc-pos-products.mts:106`) and delete `menuItem/shopProduct` via `(prisma as any)[m]` — fine for QC, but the brief must say "src only".
Also: F15.1's CATALOG_WRITER_BASELINE comment says `MenuItem` writes include "สต็อกเมนู/86" — stock-only writes on `MenuItem` (`order.ts:168,177,280`) are **availability**, not catalogue; P1.1b should decide whether they move to `catalog.ts` or to an availability service (else F15.1 can never reach zero without moving order logic).

---

## 3. `createSale` / `voidSale` call graph (as-built)

### 3.1 Contract today
- `CreateSaleInput` `src/lib/modules/pos/service.ts:42-63` · `createSale(input, client = prisma)` `:97` · `voidSale(tenantId, unitId, saleId)` `:350` (no actor, no reason, no idempotency key) · facade re-export `src/lib/modules/pos/index.ts:9-29` · snapshot `scripts/pos-sale-contract.json` (F15.2). **C**
- `refundSale` **does not exist**; `PosSaleStatus.REFUNDED` exists (`prisma/schema/pos.prisma:8`) but is never written — only status writes are `service.ts:177` (PAID) and `:354` (VOIDED). **C**
- `src/lib/contracts.ts:17-29,79,94` = dead Stage-A stub with a *different* `CreateSaleInput` shape (`paymentMode`, `burnPoints`, `payMethods.amount`); nothing imports it. F15.2's caller scan lists it as a createSale caller (`pos-sale-contract.json` callers). **C**
- VAT: `createSale` hard-codes `vat = 0` (`service.ts:143`); VAT is extracted later by Accounting from the VAT-inclusive gross: `src/lib/modules/account/index.ts:124-125` (`base = Math.round(gross/(1+rate))`, `vat = gross-base`) and only when the POS system is linked to Accounting (`account/service.ts:551-561`, `linkedKind:"POS"`, `linkedId: posSystemId`). **C**

### 3.2 Callers (19 call sites in `src/`) — argument shape
| # | call site | enclosing fn ← caller | systemId resolved by | line price source | itemId | serviceId | memberId | sourceModule | idempotencyKey | payMethods | tx client? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `src/lib/actions/pos.ts:425` | `registerSaleAction` ← `register-ui.tsx` confirm | client `systemId`+`unitId`, checked `posUnitIsLinked` `:363` | **client** (`normalizeLines` `:78-94`); UI fills from `AccountProduct.salePrice` → fallback `InvItem.costSatang` (`register.ts:147-150`) or service price | **client, unchecked** | client, checked vs `BookingService` of unit `:411-422` | `safeMemberId` (tenant only) `:132-138` | POS | client UUID | 1 × CASH/PROMPTPAY/TRANSFER | no |
| 2 | `src/lib/actions/booking.ts:140` | `setStatusAction` (DONE) | `systemForUnit(POS)` | `Appointment.priceSatang` (fallback `BookingService.priceSatang`) | – | yes | `appt.customerId` | BOOKING | `booking-sale-${appt.id}` | CASH | no |
| 3 | `src/lib/ai/proposals.ts:771` | `dispatch` kind `pos_create_sale` ← `executeProposal`/`runKind` | **first POS of tenant** `:1396-1402`; unit = any ACTIVE unit `:1375-1393` | **AI payload** `:756-760` | – | – | – | AI | `ai-${proposalId}` | 1 × CASH/TRANSFER/PROMPTPAY | no |
| 4 | `src/lib/modules/shop/service.ts:228` | `confirmOrderPaid` ← `shop/actions.ts:95`, AI | **first POS of tenant** `:216-217` | `ShopOrderLine.unitPriceSatang` (snapshot of `ShopProduct.priceSatang`) | – (stock cut separately `:265-283`) | – | – | ECOM | `ecom-${orderId}` | PROMPTPAY | no |
| 5 | `src/lib/modules/booking/service.ts:818` | `recordDeposit` | `systemForUnit` | `Appointment.depositSatang` | – | yes | – | BOOKING | `booking-deposit-${id}` | DEPOSIT | no |
| 6 | `src/lib/modules/clinic/service.ts:274` | `billVisit` | **first POS of tenant** `:242` | `ClinicVisit.feeSatang` (staff-typed) | – | – | – | CLINIC | `clinic-${visitId}` | CASH | no |
| 7 | `src/lib/modules/ticket/service.ts:364` | `markPaid` | `systemForUnit` | `TicketOrder.totalSatang` (1 line) | – | – | `order.customerId` | TICKET | `ticket-sale-${orderId}` | CASH | no |
| 8 | `src/lib/modules/school/service.ts:242` | `markPaid` | **first POS of tenant** | `SchoolEnrollment.priceSatang` | – | – | – | SCHOOL | `school-${enrollmentId}` | CASH | no |
| 9 | `src/lib/modules/giftcard/service.ts:403` | `sell` ← UI + REST `giftcards.sell` | `resolvePosForMember` (UI) / per unit (API) | client `satang` | – | – | – (deliberate) | MEMBER | `giftcard-sell-${idem}` | caller-chosen | **yes (tx)** |
| 10 | `src/lib/modules/giftcard/service.ts:673` | `reload` | same | client | – | – | – | MEMBER | `giftcard-reload-${idem}` | caller | **yes (tx)** |
| 11 | `src/lib/modules/rental/service.ts:244` | `returnAsset` | **first POS of tenant** `:212` | days × current `RentalAsset.dailyRateSatang` + late fee | – | – | – | RENTAL | `rental-${bookingId}` | CASH | no |
| 12 | `src/lib/modules/rental/service.ts:425` | `recordRentalDeposit` | `systemForUnit` | `RentalBooking.depositSatang` | – | – | – | RENTAL | `rental-deposit-${id}` | DEPOSIT | no |
| 13 | `src/lib/modules/member/subscription.ts:113` | `subscribe` | `resolvePosForMember` | `MemberPlan.priceSatang` | – | – | `customerId` | MEMBER | `subscription-${sub.id}` | CASH/PROMPTPAY | no |
| 14 | `src/lib/modules/restaurant/order.ts:430` | `checkout` ← checkout/PromptPay confirm/AI | `systemForUnit` `:422` | `RestaurantOrderItem.unitPrice + optionsTotal` (snapshot of `MenuItem.basePrice`+`MenuOptionChoice.priceDelta`) + service-charge line `Math.floor` `:414-417` | **– (MenuItem stock only)** | – | input/session | RESTAURANT | `rest-`+sha256(session:sorted itemIds)[0..40] `:419` | 1 × CASH/TRANSFER/PROMPTPAY | no |
| 15 | `src/lib/modules/hotel/service.ts:452` | `checkOut` | `systemForUnit` | `HotelReservation.totalSatang` | – | – | `rv.customerId` | HOTEL | `hotel-sale-${id}` | CASH | no |
| 16 | `src/lib/modules/hotel/service.ts:714` | `recordDeposit` | `systemForUnit` | `rv.depositSatang` | – | – | – | HOTEL | `hotel-deposit-${id}` | DEPOSIT | no |
(+ seeds `scripts/seed-member-qc.mts:196`, `seed-acc-v2-qc.mts:1196`, `seed-review-shop.mts:170`.) **C** (rows 1,3,4,14 re-read by me; others traced by a sub-search, spot-checked 4 rows)

Fields actually relied on by outside callers: `tenantId unitId systemId pointSystemId memberId sourceModule sourceId idempotencyKey lines[].{name,qty,unitPriceSatang,serviceId} payMethods[].{type,amountSatang}` (+ `client` by giftcard). **Only #1 uses** `itemId`, `discountSatang`(never sent by anyone), `billDiscountSatang`, `couponSystemId/couponCode`, `memberSystemId`, `memberChoices`. `payMethods[].refSaleId` is sent by **nobody**. **C**

### 3.3 Side effects of `createSale` today
| effect | where | in sale tx? | notes |
|---|---|---|---|
| idempotency lookup | `service.ts:102-112` | yes | returns the existing sale **whatever its status (incl. VOIDED)** and without comparing payload |
| coupon validate → redeem | `:127-141`, `:269-286` | yes | usage limit atomic via conditional `updateMany` (`coupon/service.ts:331-337`); `perMemberLimit` is a count-then-insert (race, **P**) |
| receipt counter | `:159-165` | yes | see §5 |
| member rights (voucher / point burn / gift card) | `member.applyOnSale` `:197-245` | yes | `MemberNotFound` swallowed only when nothing was asked `:84-95` |
| outbox `pos.sale.paid` | `:289-296` | yes | key `PosSale#<id>#PAID` |
| stock cut | `consumeSaleInventory` `:309,321-347` | **no — after commit, only if `ownsTx`** | per line `itemId`; failure **silently swallowed** (`catch {}` `:343`, no log); location = default location of the inventory system (`inventory/service.ts:544`), not per branch |
| drain | `scheduleDrain()` `:310` | after commit, only if `ownsTx` | giftcard (#9/#10) never drains → cron |
| consumers of `pos.sale.paid` | `src/lib/outbox-consumers.ts:673` | queue | `withAutomation(compose(compose(compose(posSalePaid → bridgePosSalePaid/applyExternalSale), stampFromSale), memberSaleBridge("onPosSalePaid")), crmBridge("onPosSalePaid")))`; `compose` runs extras even if base fails `:418-439`; gift-card sales skipped `:144` |

### 3.4 `voidSale` — reverses vs. does NOT reverse
Callers: `proposals.ts:923` (AI `void_sale`), `shop/service.ts:322`, `booking/service.ts:868`, `clinic/service.ts:325`, `ticket/service.ts:436`, `restaurant/order.ts:521`, `school/service.ts:292`, `rental/service.ts:294`, `hotel/service.ts:546`. **No POS screen voids** (`src/lib/actions/pos.ts` has no void action). **C**
| reversed | how | | NOT reversed / gaps |
|---|---|---|---|
| status → VOIDED | `service.ts:354` (whole bill only) | | no partial refund, no CN document, receipt number not re-used/annotated |
| coupons released | `service.ts:365-372` (tx) | | `PosPayment` rows untouched; DEPOSIT/ROOM_CHARGE refs not unwound |
| Accounting reversed | `pos.sale.voided` → `bridgePosSaleVoided` → `reverseExternalSale` (`account-bridge.ts:118-128`) | | void is **not idempotent**: 2nd call throws "บิลนี้ void ไม่ได้" `:353` |
| vouchers, points (burn+earn), gift-card uses | `member-bridges.ts:316-337` → `member.releaseOnVoid` (`member/wallet.ts:827-852`) | | only when unit has a MEMBER system (`member-bridges.ts:319-320`) |
| stamps | `stampVoidForSale` + `stamp.voidStampsForSale` | | deposit sales of hotel/rental are not voided on refund (module paths) |
| stock | `restoreVoidedInventory` `service.ts:395-434` (after commit, swallowed errors) | | module claim runs before `voidSale` outside any tx in all 9 module refund paths → module REFUNDED while sale stays PAID if void throws |
| kanban card / CRM deal amount | `outbox-consumers.ts:678-680` | | no actor/reason/audit row written by `voidSale` itself |

**Duplicate-key trap (C):** restaurant `voidCheckout` resets items, re-checkout of the same item set recomputes the same `rest-<hash>` key (`restaurant/order.ts:419`) → `createSale` returns the **VOIDED** sale (`service.ts:102-111`) → no new revenue. Same pattern for `booking-deposit-${id}` (P).

### 3.5 Is `idempotencyKey` enforced?
- Unique index `@@unique([tenantId, idempotencyKey])` `prisma/schema/pos.prisma:56` + lookup-before-insert inside the tx `service.ts:102`. **C**
- Race: two concurrent calls with the same key both miss the lookup; the 2nd blocks on the counter row (`:160`) until the 1st commits, then `posSale.create` violates the unique index → whole tx rolls back (counter/coupon/member undone) and the caller gets a **Prisma P2002 error instead of the first result**. Money-safe, UX-wrong (cashier sees "ขายไม่สำเร็จ" for a sale that exists). `registerSaleAction` pre-check `actions/pos.ts:373-379` narrows but does not close it. **C** (code) / behaviour under PG READ COMMITTED **P**.
- Keys are tenant-scoped free strings; no payload hash ⇒ same key + different cart returns the old sale silently. **C**

---

## 4. Tenancy / authorization as-built (POS surfaces)

Primitives: `requireTenant()` → `auth.active.{tenantId,role,unitAccess,permissions}`; `assertCan(m,{module,action,unitId?})` → `evaluate` (`src/lib/core/rbac.ts:31-41`): OWNER = all; **`unitId` omitted ⇒ unit check skipped** (`canAccessUnit` `:21-25` returns true); MANAGER = all in accessible units; STAFF = explicit key or `pos.*`. POS keys today: only `pos.sale.create`, `pos.product.setPrice`, `pos.sale.void` (`src/lib/core/permissions.ts:129-137`). Unit↔POS link check = `posUnitIsLinked` (`pos/register.ts:116-122`, unique `AppSystemUnit[tenantId,unitId,type=POS]`). `_maxDiscountBp` is a comment only — nothing reads it (`permissions.ts:746`, `rbac.ts:18`). **C**

| surface | file:line | tenant | system | unit | actor permission | client-trusted ids |
|---|---|---|---|---|---|---|
| page `/pos/register` | `src/app/app/sys/[id]/pos/register/page.tsx:25-58` | session | `appSystem{id,tenantId,type:POS}` | `?unit=` ∈ `posUnits` (**not filtered by `unitAccess`**) | **none** (page) | – |
| page `/pos/sales` | `…/pos/sales/page.tsx:20-30` | session | as above | **all units of the system** | **none** — any member of the tenant sees last 100 bills | – |
| page `/pos/products` | `…/pos/products/page.tsx:28-45` | session | as above | – | `pos.product.setPrice` **without unitId** | – |
| page `/pos/close` | `…/pos/close/page.tsx:28-47` | session | as above | system-wide (all units) | `pos.sale.create` **without unitId** | `?date=` |
| `registerSaleAction` | `src/lib/actions/pos.ts:361-463` | session | client `systemId` + `posUnitIsLinked` `:363` | client `unitId`, linked + `assertPosCan(…,unitId)` `:366` | `pos.sale.create@unit` ✔ | **`lines[].itemId` (unchecked)**, `lines[].unitPriceSatang` (never re-priced), `memberId` (tenant-only `:132-138`), `memberChoices` (validated inside member module — **P**), `serviceId` (checked `:411-422`), `dealId` (CRM-scoped `register.ts:355-372`), `idempotencyKey` |
| `posQuoteAction` / `posMemberRightsAction` / `posOpenDealsAction` | `pos.ts:293-339`, `:186-239`, `:245-251` | session | linked | linked + unit assert ✔ | `pos.sale.create@unit` | same as above (read-only) |
| `exportDaySalesCsvAction` | `pos.ts:343-358` | session | `appSystem` check | **none** | `pos.sale.create` without unitId ⇒ unit-limited staff export all branches | `businessDate` |
| `setItemSalePriceAction` | `pos.ts:467-496` → `register.ts:266-302` | session | `appSystem` check | – | `pos.product.setPrice` (no unit) | `itemId` (scoped tenant+inventory system ✔ `register.ts:281`); price is **tenant-wide** (`AccountProduct`), not per branch |
| AI proposal `pos_create_sale` | `src/lib/ai/proposals.ts:751-783`; access `:157`, check `:406`/`:467` | ctx | **first POS of tenant** `:1396-1402` | **any ACTIVE unit** `:1375-1393`, not checked against the POS | `pos.sale.create` **without unitId** | lines/prices from AI payload |
| AI proposal `void_sale` | `proposals.ts:916-925`; access `:181` | `posSale{tenantId,id}` raw prisma `:921` | **none** | unit taken *from the sale* ⇒ no unit restriction | `pos.sale.void` **without unitId** | `saleId` |
| AI read `sales_summary` / `sales_by_day` | `src/lib/ai/tools.ts:93-123` / `:222-261` (`findSystem` `:60-66`) | ctx | **first POS only** | – | skill-level only (`ai/skills.ts:56`) — **P** | `days` (rolling N×24h; by-day buckets via `dayKeyBangkok`) |
| AI read `financial_summary` | `tools.ts:1808-1845` | raw `prisma` tenant-wide | all POS + all account docs | – | skill-level — **P** | – |
| REST `GET /api/v1/sales` | `src/app/api/v1/sales/route.ts:11-44` | API key tenant | **all POS systems** | – | **key `scopes` and `systemId` binding ignored** (`route-auth.ts:58-65` returns them; route never reads them) | `take` |
| `createSale` (engine) | `service.ts:97-313` | input | **trusted** | **trusted** (no unit↔system pairing check) | none (callers' job) | `itemId`, `memberId`, `serviceId`, `refSaleId` all trusted |
| `voidSale` (engine) | `service.ts:350-386` | input | sale's own | `{id,tenantId,unitId}` | none | – |
| giftcard `sell` (createSale caller) | `giftcard/service.ts:325-415` | ctx | `resolvePosForMember` (UI) | **client `input.unitId` unchecked** | member actions | – (**P**, from sub-search) |

### Verdict on `/root/projects/shark-pos-b/ledger/wo-notes/pos-P0.2.md` §3 findings
| # | claim | verdict | evidence |
|---|---|---|---|
| 1 | `pos_create_sale`: `resolveUnit` picks any ACTIVE unit, not checked against `resolveSystem` (first POS) | **CONFIRMED, worse**: also `assertCan` has no `unitId` ⇒ unit-limited STAFF/MANAGER can sell at any branch | `proposals.ts:754-756,1375-1402,157,406` |
| 2 | `void_sale`: saleId looked up by tenant only (raw prisma), not system | **CONFIRMED, worse**: no unit restriction either (unit read from the sale; `assertCan` without unitId) | `proposals.ts:916-925,181,406` |
| 3 | `createSale` trusts `unitId/systemId/itemId/memberId` | **CONFIRMED**; plus `registerSaleAction` validates `serviceId` but **not `itemId`** and never re-prices lines | `service.ts:97-187`, `actions/pos.ts:78-94,411-422,435` |
| 4 | `sales_summary`/`sales_by_day` use first POS; `sales_summary` = N×24h not Thai day | **CONFIRMED**; `sales_by_day` also starts at `now−N×24h` (first bucket partial) | `tools.ts:60-66,113,243` |
| 5 | `financial_summary` raw prisma cross-module | **CONFIRMED** (tenant-scoped, so no leak; ownership issue only) | `tools.ts:1808-1845` |
| 6 | legacy `/api/v1/sales` outside registry | **CONFIRMED, worse**: ignores API-key scopes and system binding — any valid key of the tenant reads POS bills incl. `memberId` | `api/v1/sales/route.ts:11-44` |
| 7 | permissions: only 3 POS keys, no read key | **CONFIRMED** | `permissions.ts:129-137` |
| (8) | `with-gate-lock.sh` heap 3584 MB OOM | out of scope here (tooling) — not re-verified | – |

---

## 5. Receipt numbering · close-day · shift · coupon · inventory bridge

| area | as-built | uniqueness / guarantee | race window | Thai-day handling |
|---|---|---|---|---|
| Receipt no. | `PosReceiptCounter{unitId,period YYYYMM,seq}` upsert-increment **inside** the sale tx (`service.ts:159-165`); format `YYYYMM-NNNN` | `@@unique([unitId,period])` `pos.prisma:101` + `@@unique([unitId,receiptNo])` `:57` | row lock on the counter serialises all sales of a unit (every module: hotel/booking/… share the unit counter) — gap-free because rollback also undoes the increment. First sale of a month: concurrent upsert may hit P2002 if Prisma 7 does not use native `ON CONFLICT` for the compound key (**P**) | `bkkPeriod()` = `Date.now()+7h` + `getUTC*` `service.ts:27-30` ✔ (fixed +07, OK for TH) |
| Abbreviated tax invoice | Accounting creates `TAX_INVOICE_ABB` with **`docNo = PosSale.receiptNo`** (`account/index.ts:189,213`; `account/settings-schema.ts:15`) when `posAbbreviatedInvoice` is on | inherits receipt uniqueness | – | – |
| Close day | `closeDaySummary/closeDayBills/closeDayCsv` read-only, **per POS system (all units)** by `createdAt` (`service.ts:517-652`) | none (no Z, nothing frozen) | n/a | `bkkToday()` via `Intl … Asia/Bangkok` `:498-505`; `bkkDayRange` fixed −7h `:492-495` ✔ |
| `daySummary` | today by fixed +7h (`service.ts:448-457`); used by `src/app/app/u/[unitSlug]/booking/page.tsx:45` | – | – | ✔ |
| `listSales` | `sinceDateStr+"T00:00:00Z"` = **UTC midnight** (`service.ts:437-445`) | – | – | ✖ 7h off — but **dead code** (no caller) |
| Shift / drawer | **none** — no table, no state; "cash in drawer" = Σ CASH payments of the day (`service.ts:574`) | – | – | – |
| Coupon | validate (read) → redeem in sale tx; `usedCount` guarded by conditional `updateMany` (`coupon/service.ts:328-337`) → `RACE_LOST` | `Coupon @@unique([systemId,code])`; **no unique on redemption per sale** (idempotency comes from the sale key) | `perMemberLimit` = count then insert (`coupon/service.ts:~290-302`) → two concurrent bills of the same member can both pass (**P**) | – |
| Inventory bridge | `inventory.consume` per `itemId` line **after commit** (`service.ts:309,321-347`); void → `inventory.receive` per OUT movement (`:395-434`) | movement idempotency `pos-consume-<sale>-<line>` / `pos-refund-<sale>-<mv>` (lookup `inventory/service.ts:536-537`) | crash between commit and consume = stock never cut (no outbox, no cron retry); errors swallowed **without log** (`:343`, `:430`) | – |
| Raw day maths in POS code | grep of `getDay()/getDate()/getHours()/setHours/getMonth()` in `src/lib/modules/pos/**`, `src/lib/actions/pos.ts`, `src/app/app/sys/[id]/pos/**` → **0 hits** | | | AI tools: `sales_summary`/`sales_by_day` use rolling `now−N×86400000` (`tools.ts:113,243`); `memberSinceLabel` uses 30-day months (`actions/pos.ts:152-159`, cosmetic) |

---

## 6. Design ↔ code conflicts that change a P1 work order (ordered by impact)

| # | conflict (evidence) | WO hit | recommended ruling |
|---|---|---|---|
| 1 | **Catalogue scopes don't line up.** `InvItem` is per *inventory system* (`inventory.prisma:80-81,110`); `MenuItem`/`MenuCategory`/`MenuOptionGroup`/`ShopProduct` are per *unit* (`restaurant.prisma:113-114,135-136,178-179`, `ecommerce.prisma:12-13`); a restaurant/shop unit may have no INVENTORY system; `InvItemKind` has no `MENU` (`inventory.prisma:14-17`). MIG §2 "every MenuItem → PosProduct + new InvItem kind=MENU" and "PosProduct 1:1 InvItem" are not executable as written. `MenuItem.invItemId` already exists and is unused (`restaurant.prisma:161`). | P1.1a, P1.1b, P1.2 | Scope `PosProduct` = `tenantId + systemId (POS)` with **nullable `unitId`** (null = all branches) and **nullable `invItemId` (@unique when set)**; `kind` lives on `PosProduct` (PRODUCT/SERVICE/MENU/BUNDLE) — **do not add MENU to `InvItemKind`** and do not create InvItems for menus in P1.1a. Backfill 1 MenuItem → 1 PosProduct (unitId set, no cross-branch dedupe), link via existing `MenuItem.invItemId` when present. Option groups stay unit-scoped (`MenuOptionGroup`) and are linked through `PosProductOptionGroup`; "shared across branches" is P2.11. |
| 2 | **Six price sources, and the register never re-prices.** `InvItem.priceSatang` (services/CRM) `inventory.prisma:90`, `AccountProduct.salePrice`/`posPrice` `account_gl.prisma:154,178`, `BookingService.priceSatang`, `MenuItem.basePrice`, `ShopProduct.priceSatang`; register falls back to **cost** (`register.ts:149`) and passes the client price straight to `createSale` (`actions/pos.ts:84,435`). Brief P1.1a says "copy price from `AccountProduct.salePrice`" only. | P1.1a, P1.1b, P1.3, P1.15 | Backfill precedence: `posPrice` → `salePrice` → `InvItem.priceSatang` (SERVICE) → menu `basePrice` / shop `priceSatang` for their rows → else **null** (never cost). Extend F15.1 to `InvItem.priceSatang` and `BookingService.priceSatang` writers (and option/category writers). P1.3: server re-prices every catalogue line from `PosProduct`; a differing client price = "open price" requiring permission (P1.15). |
| 3 | **Brief P1.1a column name collision:** "nullable `productId` on `ShopOrderLine`" — `ShopOrderLine.productId` already exists as the required FK to `ShopProduct` (`ecommerce.prisma:58-59`). | P1.1a | Use `posProductId` on `ShopOrderLine`, `MenuItem`, `ShopProduct` (as MIG §0 says); `productId` only on `PosSaleLine` and `RestaurantOrderItem`. Fix the brief before dispatch. |
| 4 | **i18n infrastructure does not exist.** Only `src/messages/{th,en}/common.json` (26 lines); `src/i18n/request.ts:11` imports only `common.json`; one file in `src/` uses next-intl. COMMON §6 / CONTRACTS C-12 / MASTER §9 assume `src/messages/{th,en}.json` key `pos.*`; mockup 20 is an English register. | P1.3 (+ every UI WO, P1.18, F15.4) | Add to P1.3: `src/messages/{th,en}/pos.json` + a minimal hunk in `src/i18n/request.ts` merging module files (append-only, marked `// POS P1.3 ▸ … ◂`); correct the path in COMMON §6. Existing Thai-hardcoded pages untouched. |
| 5 | **VAT is not POS's today.** `createSale` stores `vatSatang = 0` (`service.ts:143`); Accounting extracts VAT from the gross at posting with `Math.round(gross/(1+rate))` (`account/index.ts:124-125`) and only if the POS system is linked (`account/service.ts:551-561`). DoD "VAT round-half-up at bill level", "VAT 3 modes", receipt/ABB print need VAT at sale time. | P1.6, P1.10, P1.13, P1.17 | P1.6 computes VAT in POS from the Accounting VAT settings via one shared facade function (same rounding), stores `vatSatang/vatMode/vatRateBp` on `PosSale`; Accounting must consume the stored value instead of re-deriving (else receipt ≠ GL by 1 satang). Shops without Accounting: VAT off. |
| 6 | **Refund needs APIs that don't exist.** No `refundSale`; `REFUNDED` never written; Accounting has only whole-bill `reverseExternalSale` (`account/index.ts:262`), no POS CN entry point; points `reverseWithLots` is whole-ref (`point/lots.ts:328`); `voidSale` is not idempotent, has no actor/reason (`service.ts:350-354`). | P1.8 (+P1.16) | Widen P1.8 to include: Accounting facade `applyExternalRefund` (CN, partial lines), point partial reverse (by amount, keyed), stock return per refunded line, gift-card/voucher partial handling; `voidSale` gains an **optional** 4th arg `{actorUserId?, reason?, idempotencyKey?}` (F15.2-safe); `refundSale` creates a `docType=REFUND` sale (`refSaleId`) rather than mutating the original. |
| 7 | **Approval core shape differs from C-9.** `resolvePolicy(ctx,{entityType,unitId,systemId,amountSatang})`, `submitForApproval(ctx,{entityType,entityId,…,requestedById})` — no `module/action/payload`; idempotency `approval-<entityType>-<entityId>` = **one request per entity ever** (`approval/service.ts:40-54,139,168,180`); decision events are `approval.request.approved/rejected` (`outbox-consumers.ts:695-696`), effects in `src/lib/approval-effects.ts`. | P1.15 (+P1.8, P1.16) | Each approvable action gets its own entity row (e.g. `PosApprovalTicket{saleId, action, payload}`), `entityType = "PosVoid"|"PosRefund"|"PosDiscount"…`, `entityId` = that row; effect handler added in `approval-effects.ts` (shared file — smallest hunk). Rename C-9 "approval.decided" in CONTRACTS. |
| 8 | **Authorization holes in today's POS surfaces** (all C, §4): `/pos/sales` page has no permission check; `/pos/close` + CSV + `/pos/products` + AI `pos_create_sale`/`void_sale` call `assertCan` **without `unitId`** (unit check skipped `rbac.ts:23`); `/api/v1/sales` ignores API-key scopes/system binding; register page lists units not filtered by `unitAccess`. | P1.15 (or a small P1.0) · P2.13 | Add `pos.sale.read` in P1.15 (decides D2 of P0.2) and pass `unitId` everywhere; fix `/api/v1/sales` scope check now (one-line guard) rather than waiting for P2.13 — it leaks `memberId` to any tenant key. |
| 9 | **Idempotency semantics** (C, §3.5): duplicate key returns the stored sale even if **VOIDED** and without payload comparison (`service.ts:102-111`) → restaurant re-checkout after void returns the voided bill (`restaurant/order.ts:419`); concurrent duplicate surfaces as P2002 error instead of the original result. | P1.6 (owns createSale changes), P2.4 | P1.6: catch P2002 on `posSale.create` and re-read → return original; optional `payloadHash` stored on new column to reject key reuse with a different cart. Restaurant key must include a void/attempt counter (P2.4, or a one-line fix in P1.6 regression scope). |
| 10 | **Stock path is narrower and weaker than the design assumes.** Only register lines carry `itemId` (§3.2); restaurant sales never cut `InvItem` (MenuItem stock only); shop cuts outside POS (`shop/service.ts:265-283`); POS cut runs after commit, only when `createSale` owns the tx, errors swallowed without log, no retry (`service.ts:306-347`); always the default location; register catalogue capped at 200 items (`inventory/service.ts:793-799`). "BOM → `inv.consume` ชุดเดียว" has no batch API. | P1.3, P1.8, P1.14, P2.3, P2.11 | P1.3: lift the 200 cap / paginate + search server-side. P1.6/P1.8: move stock cut/return into the `pos.sale.paid`/`voided`/`refunded` consumer chain (retryable, idempotent keys already exist) or at least `logOps` on failure. P2.3 gets an `inventory.consumeMany` facade. |
| 11 | **Receipt number = abbreviated tax-invoice number.** `TAX_INVOICE_ABB.docNo = PosSale.receiptNo` (`account/index.ts:213`, `settings-schema.ts:15`); counter is per unit/month across all modules (`service.ts:159-165`). MIG §3 `PosDocCounter` and P1.10 per-device numbering change a tax document sequence. | P1.8, P1.10 | Keep `PosReceiptCounter` + `YYYYMM-NNNN` for SALE through P1; refunds/CN get a separate counter key; any per-device prefix is an owner/tax decision (RD POS registration) — park as a question, do not change in P1.10 by default. |
| 12 | **Register drops service links**: services come from `InvItem` (kind SERVICE) ids (`register.ts:168-178`, `register-ui.tsx:172`) but `registerSaleAction` keeps `serviceId` only if it is a `BookingService.id` (`actions/pos.ts:411-422`) ⇒ service revenue reported as "other" and posted to 4000 instead of 4030 (`outbox-consumers.ts:147-148`). (**P** until an oracle shows it.) | P1.3 | P1.3 oracle must sell a catalogue service and assert `serviceId` kept; accept `InvItem` SERVICE ids (validated by tenant+inventory system). |
| 13 | **"First POS of tenant" callers** (shop `:216`, clinic `:242`, school, rental `:212`, AI `proposals.ts:1396`) + `createSale` never checks unit↔system pairing ⇒ multi-POS tenants get bills whose `systemId` is not the unit's POS (close-day/reports are per system). | P1.6, P2.1, P2.11 | P1.6: add a **non-throwing** pairing check (logOps WARN) inside `createSale`; switch those callers to `systemForUnit(POS)` in P2.1 before making it throw. |
| 14 | **Migration mechanics in MIG/brief are not possible here**: `CREATE INDEX CONCURRENTLY` / `-- @concurrent` (no precedent; `perf_indexes` uses plain `CREATE INDEX`; repo note says CONCURRENTLY is impossible inside prisma migrate); the cited partial-unique precedent `one_open_session_per_table` was **never migrated** (`restaurant.prisma:317-318`). | P1.1a, P1.9 | P1.1a: plain `CREATE INDEX IF NOT EXISTS` (new tables are empty). P1.9: hand-written partial unique in the migration + check that CI's migrate/drift step accepts it (first in repo). |
| 15 | **Routing/API convention**: `/api/u/[unitId]/pos/*` + `X-Pos-Device` (POS-API) do not exist; POS is server actions + `/app/sys/[id]/pos/*` (system-scoped), restaurant is `/app/u/[unitSlug]/restaurant/*` (unit-scoped). | P1.3–P1.18, P2.4 | P1 WOs use server actions on the existing sys-scoped pages; REST only in P2.13 via registry. P2.4 must decide how the sys-scoped POS hosts a unit-scoped table mode. |
| 16 | **Things the design says exist but don't**: `confirmSalePaid`/PaymentIntent "D1 interface มี" (spec 14-pos.md:98 marks ✅), `PENDING_PAYMENT` on `PosSale`, ROOM_CHARGE producer, `memberSnapshot`, `abbInvoiceNo`, price 2-way sync. Conversely AI `pos_create_sale`/`void_sale` **do** exist (design says WO-0045 pending). | P1.7, P1.12, P2.7, P3.9 | Size P1.7 as greenfield (intent table + confirm + expire + Beam prefix branch in the shared webhook `api/payment/beam/webhook/route.ts`). P1.12 adds `memberSnapshot` column. P3.9 must migrate the existing tools, not add `pos_open_sale`. |
| 17 | **Accounting link is per POS system, not per branch** (`findAccountLinkForPos` `account/service.ts:551-561`); price setting writes tenant-wide `AccountProduct` (`register.ts:266-302`). Design "opt-in per branch" and branch prices (P2.2/P2.11). | P1.18, P2.2, P2.11 | Settings cards in P1.18 show link state per POS system (truth today); per-branch link is a P2 decision. |
| 18 | **Money regression set is incomplete** for "every caller of createSale/voidSale" (MASTER §1, COMMON §7). | all money WOs | Add `qc-pos-register/products/coupon/closeday/inventory`, `qc-member-m2.6` (gift card = tx caller), `qc-member-m2.8`, `qc-booking-deposit`, `qc-clinic-refund`, `qc-school-refund`, `qc-rental-refund`, `qc-hotel-refund`, `qc-ticket-cancel`, `qc-restaurant-void` (all exist in `scripts/`). |

---

## 7. Checked and consistent (short)
- `createSale`/`voidSale` signatures match `scripts/pos-sale-contract.json` and the facade `pos/index.ts`; F15.2 caller list = 14 files, matches grep (incl. dead `contracts.ts`). **C**
- Unique indexes the plan says to keep exist (`pos.prisma:56-57`). **C**
- Member v2 link columns on `PosSale` exist and the member/voucher/gift-card/stamp tables exist with the names CONTRACTS §0 uses. **C**
- `pos.sale.paid`/`voided` each have consumers; `compose` runs later steps even if accounting fails (`outbox-consumers.ts:418-439`) — the "first step blocks the rest" lesson is already handled for POS. **C**
- Coupon redeem inside the sale tx with an atomic usage guard; void releases coupons in-tx. **C**
- Thai-day handling in POS service is correct (fixed +07 / `Asia/Bangkok`); no raw `getDay/getDate` in POS code. **C**
- Inventory movements from POS are idempotent per line/movement. **C**
- `MenuOptionGroup/Choice`, `MenuItemOptionGroup`, `KdsStation`, `RestaurantOrderItem.menuItemId`, `ShopProduct.invItemId`, `InvLocation`, `HrEmployee.pinCode`, `kds.stationQueue`, Beam webhook route all exist as named. **C**
- P0.1 tooling files named in MASTER P0.1 all exist. **C**

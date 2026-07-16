# Restaurant / ร้านอาหาร (AS-BUILT 2026-07-16)

## หน้าที่ · ผู้ใช้ · ตำแหน่งในชั้น (อ้าง 02)
Dine-in loop ครบ: เมนู/หมวด/ตัวเลือก · 86(ของหมด)/สต็อกระดับเมนู · โซน/โต๊ะ/floor plan · session เปิด-ปิดโต๊ะ · ออเดอร์+รายการ+ตัวเลือก · KDS · เรียกพนักงาน/ขอเช็คบิล · บิล→ชำระผ่าน POS · เวลาเปิด-ปิดครัว · storefront QR สั่งอาหาร (public). ผู้ใช้: staff (เคาน์เตอร์/ครัว/แคชเชียร์) + ลูกค้า (QR สั่งเอง). **Layer 3: Business** — scope=unit.
โค้ด: `src/lib/modules/restaurant/{menu,table,order,kds,storefront,scope}.ts` · schema `prisma/schema/restaurant.prisma`.

## Data model (prisma/schema/restaurant.prisma) — scope=unit
- **RestaurantSetting** (1:1 unit) — `serviceChargeBps` `requireApproval` `serviceHours`(json) `specialClosures` `lastOrderMins` `kitchenPaused/Note` `kdsWarnMins/kdsCriticalMins` `pickupEnabled/pickupSlotMins/pickupLeadMins`. unique `@@unique unitId`.
- เมนู: **MenuCategory**(`name/nameEn` `availableFrom/To` `isVisible` unique `[unitId,name]`) · **MenuItem**(`categoryId` `stationId` `basePrice` `images`json `tags` `status`(ACTIVE/HIDDEN/ARCHIVED) `isOutOfStock`(86) `stockQty?`(0=auto-86) `dailyStockQty?`; unique `[unitId,sku]`) · **MenuOptionGroup**(`minSelect/maxSelect`) · **MenuOptionChoice**(`priceDelta` `isOutOfStock`) · **MenuItemOptionGroup**(link item↔group).
- KDS: **KdsStation**(`name` unique `[unitId,name]`).
- โต๊ะ: **RestaurantZone** · **RestaurantTable**(`seats` `shape` `posX/Y/width/height`(floor plan) `qrToken`(unique ถาวร rotate ได้) `status`).
- Session: **TableSession**(`tableId` `status`(OPEN/CLOSED/MERGED/CANCELLED) `guestCount` `memberId?` `mergedIntoId?`; ⚠️ partial unique index `one_open_session_per_table WHERE status='OPEN'` — migration SQL).
- ออเดอร์: **RestaurantDailyCounter**(atomic seq ต่อ unit/bizDate) · **RestaurantOrder**(`type`(DINE_IN/TAKEAWAY/PICKUP/DELIVERY) `status` `sessionId?` `bizDate/dailyNo` unique `[unitId,bizDate,dailyNo]`; `guestToken`(cookie QR) `pickupStatus?` `isRush`) · **RestaurantOrderItem**(`nameSnapshot` `unitPrice` `optionsTotal` `qty` `lineTotal` `kdsStatus`(NEW/COOKING/READY/SERVED/CANCELLED) `saleId?`+`settledAt?`(lock เมื่อชำระ) — index `[unitId,stationId,kdsStatus]`,`[saleId]`) · **RestaurantOrderItemOption**(snapshot group/choice/priceDelta).
- บริการ: **RestaurantServiceRequest**(`type`(CALL_STAFF/REQUEST_BILL) `status`(PENDING/ACKED/DONE)).
- เงิน Int สตางค์ · idempotency: การชำระผ่าน PosSale.idempotencyKey.

## Service API (per file)
- **menu.ts**: `getSetting/updateSetting/setKitchenPause` · `ensureDefaultStations/listStations/createStation` · หมวด `listCategories/createCategory/archiveCategory` · ตัวเลือก `listOptionGroups/createOptionGroup/setChoiceStock/archiveOptionGroup` · เมนู `listItems/getItem/createItem/updateItem/setItemOptionGroups/duplicateItem/archiveItem/setItemStock` · `orderingMenu(...)`(เมนูสั่งได้) · `resetDailyStock`.
- **table.ts**: โซน `listZones/createZone/archiveZone` · โต๊ะ `createTable/updateTable/archiveTable/rotateQr` · `floorPlan(...)`(TableCard[]) · session `openSession/getSession/openSessionOfTable/openSessionsList/linkMember/closeSession/moveSession/mergeSession`.
- **order.ts**: `createOrder({...})`(สร้างออเดอร์+รายการ+ตัวเลือก, ตัด stockQty ตอน confirm) · `confirmOrder` · `cancelOrderItem` · `setOrderRush` · service req `createServiceRequest/ackServiceRequest/doneServiceRequest/listServiceRequests` · `billPreview(...)`(รวมยอด+service charge) · **`checkout({...})`**(ปิดบิล → createSale เข้าเส้นเงิน, lock รายการ saleId) · `ordersToday`.
- **kds.ts**: `stationQueue` · `advanceItem`(NEW→COOKING→READY→SERVED) · `recallItem` · `expoQueue`.
- **storefront.ts** (public): `resolveUnit` · `publicMenu` · `resolveTableSession`(QR) · `tableStatusForGuest` · `placeGuestOrder({...})`(ลูกค้าสั่งเอง, เคารพ requireApproval).
- **scope.ts**: helper BKK `bizDateBkk/nowMinutesBkk/dowBkk/baht/hhmmToMin/kitchenOpenNow`.

## การเชื่อมต่อ
- **ออก → POS**: `order.checkout` เรียก `createSale` (sourceModule=RESTAURANT) → PosSale → outbox `pos.sale.paid` → account-bridge → บัญชี (เส้นเงินกลาง 02). รายการที่ชำระ lock ด้วย `saleId`/`settledAt`.
- **Member**: TableSession.memberId / RestaurantOrder.memberId → Customer.id (สะสมแต้ม/ยอด via linkMember).
- ไม่มี outbox event ของตัวเอง.

## Permissions
ตรวจสิทธิ์ที่ action/route layer ผ่าน requireTenant+resolveUnit (ไม่มี `assertCan "restaurant.*"` string ในโมดูล — grep = ว่าง). Storefront เป็น public (guestToken). — เป็นหนี้เชิงมาตรฐาน (ดูข้อจำกัด).

## UI
- Backoffice: `/app/u/[unitSlug]/restaurant` (หน้าหลัก) · `.../restaurant/setup` · เมนู `.../restaurant/menu` `.../menu/options` `.../menu/stock` · โต๊ะ `.../restaurant/tables/[sessionId]` · ออเดอร์ `.../restaurant/order` · KDS `.../restaurant/kds` + `.../kds/[stationId]` · เช็คบิล `.../restaurant/checkout/[sessionId]`.
- Public: `/(store)/s/[tenantSlug]/[unitSlug]/restaurant` + `.../restaurant/t/[qrToken]` (สั่งจากโต๊ะ) · API `POST .../restaurant/{session,order,service-request}`.

## การทดสอบ
- `scripts/qc-restaurant.mts` (Fable oracle) — happy path ผ่าน menu/table/order/kds จริง (สร้าง tenant+unit RESTAURANT, ~6+ assertion `ok()/bad()`).
- `scripts/qc-restaurant-money.mts` — สายเงินครบวงจร: เปิดโต๊ะ→สั่ง→เช็คบิล→POS→บัญชี (persona ร้านจด VAT: Dr 1000 / Cr 4000 ฐาน / Cr 2200 VAT).

## ข้อจำกัด/หนี้ที่รู้ + WO อนาคต
- ไม่มี assertCan string เฉพาะโมดูล.
- Defer (Phase 2): สต็อกวัตถุดิบ Recipe/BOM (Ingredient/RecipeLine/IngredientMovement จองไว้ท้าย schema), แยกบิลซับซ้อน, custom domain ร้าน, delivery, pickup prepaid.
- partial unique index (one_open_session_per_table) ต้องมาจาก migration SQL (Prisma ประกาศ partial ไม่ได้).

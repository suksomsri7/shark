# P1.2: options · variants · bundles/combos · weighed products (brief DRAFT · oracle writer · cloud run · 4 Oct 2026)

> Status: DRAFT, written without DB access. Before builder S starts: (1) the controller ratifies §2 and the invented names in `ledger/wo-notes/pos-P1.2-oracle.md`; (2) the owner answers §6 (P1–P7). The oracle may run with the defaults. Lane rules and COMMON apply. The money regression set (COMMON §7 + `qc-pos-account`) is mandatory, because P1.2 changes how the unit price and stock are worked out.
> Base: `session/pos` 5f34e116 (P1.5 accepted; P1.6 oracle only, P1.6 not built). Mockups: `ledger/design-pos/01-register.png` (option popover), `06-products.png` (options / BOM / bundle tab). Plan row: `POS-MASTER-PLAN.md:55`. Design: `DESIGN-POS.md:170-171, 200-201, 350-351`.

## 1. Facts as built (verified 4 Oct on 5f34e116)
- **No `PosVariant` table.** A variant is a child `PosProduct` row: `parentId`, self-relation `PosProductVariants`, `onDelete: SetNull` (`prisma/schema/pos.prisma:151-152, 182`). The comment reads "P1.2 owns it". The catalogue view `variants` is always `[]` (`catalog.ts:104, 976`). `createProduct` does not accept `parentId` (`CREATE_KEYS` `catalog.ts:1144`).
- `PosProductKind` already contains `BUNDLE` (`pos.prisma:117`). `createProduct` refuses to link a BUNDLE or MENU straight to an `InvItem` ("use the recipe", `catalog.ts:1183`). `RecipeLine(productId, invItemId, qty Int)` exists (`pos.prisma:201-215`), but **no catalogue writer** exists for it and nothing consumes it at sale time.
- Option groups are the restaurant tables, reused with no copy: `PosProductOptionGroup.groupId` → `MenuOptionGroup` (`pos.prisma:186-199`). `MenuOptionGroup` is **per unit** (`unitId` NOT NULL, `@@unique([unitId,name])`, `minSelect` default 0, `maxSelect` default 1; `restaurant.prisma:179-196`). `MenuOptionChoice.priceDelta` is Int satang and may be negative, and the choice also has `isDefault` and `isOutOfStock` (86) (`restaurant.prisma:198-217`).
- P1.1b dual-write: `catalog-legacy.ts:142-160` `setMenuItemOptionGroups` (restaurant → POS link mirror) and `:225-245` create/archive group. The catalogue reads groups and choices **live** (`catalog.ts:915-975`). There is **no POS-side writer** for groups or links.
- Restaurant reference semantics (`restaurant/order.ts:76-105`):
  - It checks `picked < minSelect || picked > maxSelect` and returns `BAD_OPTIONS`.
  - It silently ignores unknown choiceIds.
  - Choosing an 86'd choice makes the item unavailable.
  - `unitPrice + optionsTotal` per unit, and `RestaurantOrderItemOption` snapshots the group, the choice and the delta (`restaurant.prisma:427-440`).
  - Checkout sends `createSale` lines **without options** (`order.ts:435`).
- Register today:
  - `REG_LINE_KEYS` has no `options` (`register.ts:737`), so a line carrying `options` is refused with `VALIDATION` (`regParseCart :755-801`).
  - `regPrice` refuses any product that has a required group: `OPTIONS_REQUIRED` (`:907`, P1.3 Q6 / S3.26).
  - `requiredOptionGroupCount` counts groups with `minSelect ≥ 1` and that are not archived (`:592-628`).
  - Stock is cut only for `kind=PRODUCT && invItemId && trackStock` (`:912`).
  - `regVisibleWhere` does **not** filter on `parentId`, so variant children appear on the grid and in search today (`:552-558`).
  - `registerScan` matches an exact barcode only, on the row or its `InvItem` (`:707-727`).
- Idempotency compares the request with the stored sale line by line (`regLinesEqual :1060-1087`, `regSameSubmission :1092-1100`) on `(unitPrice, qty, discount)`, plus name for custom lines. **Options and weight are not stored, so they cannot be compared today.**
- `cartAddProduct` (+1 merge) matches on productId and requires no discount and no open price. The comment there says P1.2 must add options (`register-shared.ts:219-232`). The UI's `pick` shows `errors.optionsRequired` for required groups (`RegisterScreen.tsx:643-648`).
- `createSale` lines are `{name, qty, unitPriceSatang, discountSatang?, itemId?, serviceId?, productId?}` (`service.ts:58`). Stock is consumed after commit, one movement per line, with key `pos-consume-<saleId>-<lineId>` (`service.ts:332-360`). `registerStatus` counts a line as "pending stock" with that same key (`register.ts:1208-1213`). Void restores by movement (`service.ts:408-450`).
- `PosSaleLine.qty` is Int and `InvMovement.qtyDelta` is Int. There is no decimal or weight anywhere. `inventory` has a `BarcodeType` (`EAN13`) for labels only (`inventory/service.ts:1153`). There is **no weighed-barcode code** anywhere.
- F15.1 holds: writes to `menuOptionGroup / menuOptionChoice / menuItemOptionGroup / posProductOptionGroup / recipeLine` exist only in `catalog.ts` and `catalog-legacy.ts` (grep, 0 hits elsewhere).

## 2. Contract (proposed rulings for the controller; additive only, F15.2)
**Options**
- **R1 Options on a register line.**
  - `lines[].options?: {choiceId: string}[]` (≤ 20 per line, `REGISTER_MAX_OPTIONS_PER_LINE`).
  - Inside an entry, `priceDeltaSatang` and `name` are accepted and **ignored**. That copies the R2 rule for client prices: never trusted.
  - Any other key, a duplicate choiceId, a non-array, or a missing choiceId gives `VALIDATION`.
  - The server loads the groups linked to the product (for a variant: its parent's links, R6) live from `MenuOptionGroup/Choice`.
  - **Unit price = base price + Σ priceDelta.** Line discount and bill discount apply on top of that.
  - A unit price below 0 gives `INVALID_LINE`.
- **R2 Choice rules, checked in this order:**
  - A choiceId that is not an active choice of a linked, non-archived group (another group, another tenant, archived, or not existing) gives **`OPTIONS_INVALID`**.
  - A choice that is 86'd (`isOutOfStock`) gives **`OPTION_UNAVAILABLE`**.
  - Any group with fewer than `minSelect` picks gives **`OPTIONS_REQUIRED`**. This keeps P1.3 S3.26 exactly: no `options` key at all also gives `OPTIONS_REQUIRED`.
  - More than `maxSelect` picks gives `OPTIONS_INVALID`.
  - All of these carry `lineIndex` and no totals.
  - The server never applies `isDefault` choices; the UI only preselects them.
  - Open price together with options gives `VALIDATION` in P1.2.
- **R3 Quote line** gains `optionsSatang` (Σ delta per unit, 0 when none) and `options: {choiceId, groupId, name, priceDeltaSatang}[]`. `unitPriceSatang` is base plus options.
- **R4 Stored snapshot.**
  - New table `PosSaleLineOption {id, tenantId, saleId, lineId, choiceId, groupId, groupName, choiceName, priceDeltaSatang}`, modelled on `RestaurantOrderItemOption`.
  - `PosSaleLine.unitPriceSatang` stays the full unit price, so the account bridge, reports and refunds are unchanged.
  - `createSale` lines gain optional `options?: {choiceId, groupId, groupName, choiceName, priceDeltaSatang}[]`. Legacy callers send nothing and behave as today.
  - A later price change to a choice does not alter stored sales; the live read affects new quotes only.
- **R5 POS-side writers in `catalog.ts`** (F15.1 writer):
  - `createOptionGroup(ctx, {unitId, name, nameEn?, minSelect, maxSelect, choices:[{name, nameEn?, priceDelta, isDefault?}]}) → {id}`.
    - The unit must be linked to `ctx.systemId`; otherwise `NOT_FOUND`.
    - Require `0 ≤ min ≤ max ≥ 1`; otherwise `VALIDATION`.
  - `setProductOptionGroups(ctx, productId, groupIds[])`.
    - Replaces the whole set, in the given order.
    - It is idempotent.
    - A group of another tenant, or of a unit not on this POS, gives `NOT_FOUND`.
    - A variant row gives `VALIDATION` (R6).
    - **MENU rows with a `MenuItem` twin also write `MenuItemOptionGroup` in the same tx.** This is the reverse of `catalog-legacy.setMenuItemOptionGroups`, so it does not ping-pong (G4c).
  - **"Shared" means the same group linked to many products.** A group belongs to one unit for editing, but its link is honoured at every unit where the product sells.

**Variants**
- **R6 Variants = child `PosProduct`** (one level).
  - `createProduct` accepts `parentId`. The parent must be in the same system, not archived, not itself a variant, and of kind PRODUCT or MENU; anything else gives `VALIDATION`. A parent in another system gives `NOT_FOUND`.
  - The child has its own `invItemId` (C-1: the variant's stock lives in its own `InvItem`), its own barcode (barcode clash gives `CONFLICT`, as today), and its own `basePriceSatang`. **null inherits the parent's price** (P5).
  - Options linked to the parent apply to all its variants; a child cannot have its own links (P6).
  - Grid and search show parents only, with `parentId` and `variantCount` on `RegisterProduct`.
  - Selling a parent that has active children gives **`VARIANT_REQUIRED`**.
  - Scanning a child's barcode gives `match:"one"` (the child). Scanning a parent that has children gives `match:"choose"`, listing exactly the active children.
  - An archived parent makes its children unsellable (`PRODUCT_NOT_FOUND`).
  - `catalog.listForUnit` fills `variants: [{id}]`.
- **R7 Picker read.** New `registerProductOptions(ctx, actor, {productId})` returns `{ok, productId, groups[{groupId,name,nameEn,minSelect,maxSelect,choices[{choiceId,name,nameEn,priceDeltaSatang,isDefault,unavailable}]}], variants[{id,name,priceSatang,barcode,soldOut}]}`.
  - Groups come in link order. Archived choices are omitted; 86'd choices are shown with `unavailable:true`.
  - It has the same scope gate as the catalogue.
  - Action: `registerProductOptionsAction` (use server, catch, no throw).

**Bundles**
- **R8 Bundle = `PosProduct kind BUNDLE`** with its own price (the price of the set, **not** the sum of its parts).
  - Components are `RecipeLine` rows, written by new `catalog.setRecipe(ctx, productId, [{invItemId, qty≥1}])`.
    - It accepts only a BUNDLE row in P1.2. A MENU row's BOM is P2.3, and any other kind gives `VALIDATION`.
    - A component `InvItem` must belong to an inventory that sells through this POS; otherwise `NOT_FOUND`.
  - At sale time the components are **snapshotted** on the line as new column `PosSaleLine.components Json?` (`[{invItemId, qty}]` per unit). `createSale` lines gain optional `components?`.
  - `consumeSaleInventory` consumes every component `qty × line.qty` with key **`pos-consume-<saleId>-<lineId>-<invItemId>`**. The existing per-line key stays for `itemId` lines.
  - `registerStatus` pending-stock counts a line with components until every component key exists.
  - Void restores the components through the existing movement-based restore.
  - A bundle line has `itemId = null`. A bundle with 0 components sells like a non-stock product.
  - Options are allowed on bundles. Component substitution by choice is P2.3.

**Weighed products**
- **R9 Weighed products.**
  - New columns: `PosProduct.soldByWeight Boolean @default(false)` and `PosProduct.scalePlu String?` (5 digits, unique among active rows of one POS system; a clash gives `CONFLICT`).
  - For these rows `basePriceSatang` = **price per kilogram**.
  - `createProduct` and `updateProduct` accept both keys.
  - Their stock unit is **grams** (P3): consumption qty = grams.
- **R10 Weighed EAN-13** (pure helpers in `scan-shared.ts`):
  - Layout: `PP IIIII VVVVV C`, where PP is the prefix, IIIII is the PLU, VVVVV is the value and C is the EAN-13 check digit (weights 1/3).
  - Setting: `AppSystem(POS).settings.pos.weighedBarcode = {enabled, rules:[{prefix:"20"…"29", kind:"WEIGHT"|"PRICE"}]}`, **off by default** (P1). The reader `weighedBarcodeSettings(settings)` drops malformed rules.
  - `parseWeighedBarcode(code, settings)` returns `{prefix, itemCode, kind, grams|null, priceSatang|null}` or `null` (disabled, wrong length, non-digit, unknown prefix, **bad check digit**).
  - `ean13CheckDigit(first12)`.
  - `weighedPriceSatang(grams, perKg) = roundHalfUp(grams×perKg, 1000)`.
  - `weighedGramsFromPrice(price, perKg) = roundHalfUp(price×1000, perKg)`.
  - The PRICE kind carries satang (P2).
- **R11 Scan order.**
  - (1) An exact registered barcode wins, as today.
  - (2) Otherwise, if the setting is on and a rule matches, the PLU is resolved among `soldByWeight` rows of this POS that are visible at the unit, giving `match:"one"` plus `weighed:{code, grams, priceSatang}`.
  - (3) Otherwise `none`. A bad check digit gives `none`, with no fallback.
- **R12 Weighed line.**
  - `{productId, qty:1, weighedBarcode}` or `{productId, qty:1, weightGrams}` (manual entry, 1–99999).
  - The server re-parses the barcode; client prices and weights are ignored.
  - The barcode's PLU must be this product; otherwise `VALIDATION`.
  - qty ≠ 1 gives `INVALID_LINE`. Both fields together give `VALIDATION`.
  - A `soldByWeight` row with neither field gives **`WEIGHT_REQUIRED`**.
  - **Manual weight needs `pos.sale.priceOverride`**; otherwise `PERMISSION_DENIED` (P4).
  - Unit price: WEIGHT kind uses `weighedPriceSatang`; PRICE kind uses the embedded price.
  - Stored as `PosSaleLine.weightGrams Int?`, qty 1. Stock is consumed in grams when the product tracks stock.
  - A weighed line never +1-merges.

**Cart and idempotency**
- **R13 Cart line identity (+1)** in `register-shared.ts`.
  - `cartAddProduct(cart, productId, key, options?: string[])` merges only into a line of the same product that has no discount, no open price, no weight, and the **same multiset of choiceIds** (order-insensitive; `undefined ≡ []`).
  - `RegisterCartLine` (product) gains `options?: string[]`, `weighedBarcode?` and `weightGrams?`.
  - `cartToQuoteInput` sends them, and `quoteInputToCart` and `registerCanonicalCart` (P1.5) keep them, so a recalled held cart keeps its options and weight.
  - The UI picker calls `cartAddProduct` with the chosen ids.
- **R14 Idempotency payload.** `regSameSubmission` adds, per line, the sorted choiceId set (from `PosSaleLineOption`) and `weightGrams`/`weighedBarcode` to the comparison.
  - Same options in another order gives the stored sale (`duplicated:true`).
  - Different options on the same key gives `IDEMPOTENCY_CONFLICT` (with the sale fields, as P1.3).
  - A different weight on the same key gives `IDEMPOTENCY_CONFLICT`.
  - Legacy and P1.3-shaped payloads compare exactly as today.

**Messages and UI**
- **R15 Refusal codes and messages.**
  - New codes: `OPTIONS_INVALID`, `OPTION_UNAVAILABLE`, `VARIANT_REQUIRED`, `WEIGHT_REQUIRED`. They are returned as data and map to `errors.optionsInvalid / optionUnavailable / variantRequired / weightRequired` (th+en).
  - UI keys: `pos.register.options.{title,required,optional,pickUpTo,confirm,unavailable}` and `pos.register.variants.title`.
- **R16 UI** (mockup 01 popover):
  - `pick` opens the picker when `optionGroupCount > 0 || variantCount > 0`. The `optionsRequired` toast is removed from `pick`.
  - Test ids, all ≥44px: `pos-reg-options-dialog`, `pos-reg-option-<choiceId>`, `pos-reg-options-confirm`, `pos-reg-variant-<id>`.
  - The cart line shows the option names, and the receipt line will too (P1.10).
  - Shortcut: Esc closes and Enter confirms.

## 3. Restaurant interaction (P1.1b sync)
- Groups and choices stay restaurant-owned tables, read live. A restaurant edit to a delta or an 86 is visible to the next POS quote with no copy (oracle M1).
- `setProductOptionGroups` on a MENU twin mirrors to `MenuItemOptionGroup` (M2), and the restaurant gate keeps mirroring the other way through `catalog-legacy`.
- Restaurant checkout keeps sending option-free lines whose unit price already includes the options (`order.ts:435`). It is not changed in P1.2; moving it onto `options[]` is P2.4.
- The restaurant suites (`qc-restaurant*`) must stay green unchanged.

## 4. Order of work
1. Oracle (this run): `scripts/qc-pos-p1.2.mts`, 46 checks. Base: unforced SKIPPED exit 0; forced 4 green (P1 S3 Z1 Z2) / 42 red; `--no-db` 1 green (S3) / 9 red. See notes.
2. Builder S (one migration, additive):
   - `PosSaleLineOption`.
   - `PosSaleLine.components` and `weightGrams`.
   - `PosProduct.soldByWeight` and `scalePlu`, with a partial unique index (systemId, scalePlu) WHERE archivedAt IS NULL, written as hand SQL as in M5.
   - Then the writers R5 R6 R8 R9 → register R1–R3 R7 R11–R14 → consumption R8 → the pure helpers R10 R13.
3. Builder U (picker, variant chooser, cart line). Then controller visual (01 × 3 sizes + EN) → parity → code review → hunter (money lane) → accept.

## 5. Acceptance
- `qc-pos-p1.2` green ×2 with no residue.
- `qc-pos-p1.3` (incl. S3.26, S1.23, S5.13), `qc-pos-p1.4`, `qc-pos-p1.5`, `qc-pos-p1.1` (incl. S1.32 shape) unchanged.
- The money set (COMMON §7 + `qc-pos-account` + `qc-restaurant-money`) identical before and after.
- Fitness in both modes (F15.1) · typecheck · build · visual parity.

## 6. Owner questions (oracle runs with the defaults)
- **P1 Weighed barcode layout**: default is off, configurable per POS, EAN-13 `PP IIIII VVVVV C`, prefixes 20–29. — *ร้านใช้เครื่องชั่งพิมพ์บาร์โค้ดแบบไหน (ขึ้นต้น 20–29 · รหัสสินค้า 5 หลัก · น้ำหนัก/ราคา 5 หลัก) ตั้งค่าแยกต่อจุดขายได้ ใช่ไหม*
- **P2 Price-embedded labels**: the 5-digit value is in **satang** (max ฿999.99, default) or in baht. — *ป้ายแบบฝังราคา ตัวเลข 5 หลักเป็นสตางค์ (สูงสุด ฿999.99) หรือเป็นบาท*
- **P3 Weighed stock**: count the linked stock item in **grams** (default) or do not track weighed goods. — *สินค้าชั่งนับสต็อกเป็นกรัม (แนะนำ) หรือไม่นับสต็อกเลย*
- **P4 Manual weight**: typing a weight needs the "set price" permission (default yes). — *พิมพ์น้ำหนักเองต้องมีสิทธิ์ตั้งราคาเอง (กันโกงตาชั่ง) ใช่ไหม*
- **P5 Variant price**: a variant with no own price uses the parent's (default yes). — *ตัวแปร (ขนาด/สี) ที่ไม่ตั้งราคา ใช้ราคาสินค้าแม่ ใช่ไหม*
- **P6 Options on variants**: option groups are set on the parent and apply to all variants, with no per-variant options (default yes). — *ตัวเลือกตั้งที่สินค้าแม่ครั้งเดียว ใช้กับทุกขนาด/สี ใช่ไหม*
- **P7 Bundle**: the set has its own price and cuts each component's stock, and changing components inside a set is P2.3 (default yes). — *ชุดคอมโบตั้งราคาชุดเอง ตัดสต็อกของทุกชิ้นในชุด · การเปลี่ยนของในชุดทำทีหลัง (P2.3) ใช่ไหม*

## 7. Out of scope
- BOM for MENU and recipe consumption for menus (P2.3).
- Component substitution in combos (P2.3).
- Matrix variants (two dimensions).
- Decimal qty and price per 100 g.
- Scale hardware integration over serial/USB (P3).
- Restaurant checkout sending `options[]` (P2.4).
- Channel prices per variant (P2.2).
- Printing options on the receipt (P1.10).
- Options in the legacy register `actions/pos.ts`.

## Owner answers (4 Oct 2026)
- Owner: use all recommended defaults for every owner question in this brief (see POS-RESUME 4 Oct).

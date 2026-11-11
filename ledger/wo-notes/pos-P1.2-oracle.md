# P1.2 oracle notes: options · variants · bundles · weighed (oracle writer · cloud · 4 Oct 2026)

Brief: `ledger/pos-briefs/pos-brief-P1.2.md`. Oracle: `scripts/qc-pos-p1.2.mts`, 46 checks. Base: `session/pos` 5f34e116. No DB in this run, so nothing has been run against QC4 yet.

## Verified here (no DB)
- esbuild syntax: OK.
- `tsc` on the file, through a temporary config that extends the repo tsconfig: 0 errors.
- `--list`: exit 0, 46 checks. X-coverage: X4=23, -=16, X1=4, X2=1, X3=1, X11=1.
- `--no-db`: exit 1, 1/10 pass.
  - S3 green.
  - E1–E5 red: `MISSING:<fn>` in `scan-shared`.
  - C1 red: merges different option sets and merges weighed lines.
  - C2 red: options and weight are dropped.
  - S1 red: 4 codes map to `errors.unknown`, keys are missing.
  - S2 red: `pick` still shows the toast, there is no picker, no action, no test ids.

## Expected on the VPS against base (please run both)
- **Unforced**: `⏭️ SKIPPED`, exit 0, with 8 reasons:
  - scan-shared ×3: parseWeighedBarcode, ean13CheckDigit, weighedBarcodeSettings.
  - catalog ×3: createOptionGroup, setProductOptionGroups, setRecipe.
  - register ×1: registerProductOptions.
  - schema ×1: PosSaleLine.components and weightGrams; PosProduct.soldByWeight and scalePlu; PosSaleLineOption.*.
- **Forced** (`QC_FORCE=1`): **4 green / 42 red**, exit 1.
  - Green: **P1** (P1.3 compatibility), **S3** (F15.1), **Z1**, **Z2**.
  - Red, with these reasons:
    - O*, I1–I2, H1, X1: `options` key gives `VALIDATION` (`register.ts:737`).
    - O10, O11, B1, M2: `MISSING:<fn>`.
    - V*: fixture, because `createProduct` refuses `parentId`.
    - B2–B3: no component consumption (stock 20/20). B4: pending count is unchanged.
    - W*, I3: fixture, because `updateProduct` refuses `soldByWeight`/`scalePlu`.
    - R1: wrong codes.
    - O9: `optionsSatang` is missing on the quote line.
  - If any other check is green on base, or Z1/Z2 is red, please send me the log line.

## Check ids
| group | ids | DB | what |
|---|---|---|---|
| E | E1–E5 | no | EAN-13 check digit, WEIGHT/PRICE decode, rejections, settings reader, rounding |
| C | C1–C2 | no | +1 merge identity (options multiset; weighed never merges), quote-input round trip |
| S | S1–S3 | no | new refusal keys and i18n; picker UI statics + action; F15.1 guard |
| O | O1–O11 | yes | price incl. deltas, snapshot rows, required/min/max, invalid/VALIDATION, tamper, negative and discount, 86/archived, defaults and open price, picker read, writers and shared group |
| M | M1–M2 | yes | live restaurant edits (delta/86) vs stored snapshot; MENU twin `MenuItemOptionGroup` dual-write |
| V | V1–V5 | yes | grid hides children; scan child/parent; price inheritance; parent's options; variant stock; writer rules; archived parent |
| B | B1–B4 | yes | `setRecipe`; bundle sale price, snapshot, per-component consumption keys; void restore; pending-stock |
| W | W1–W5 | yes | weighed scan; quote; PRICE label; submit plus gram stock; WEIGHT_REQUIRED and manual-weight permission |
| I | I1–I3 | yes | idempotency with options (order-insensitive, conflict when options differ but totals are equal) and weight |
| H X P R Z | H1 X1 P1 R1 Z1 Z2 | yes | held-cart round trip; cross-tenant; P1.3 S3.26 kept; refusals as data; residue |

Fixtures are created through Prisma directly for the tables that already exist (`MenuOptionGroup/Choice`, `PosProductOptionGroup`, `RecipeLine`). That way the O and B checks fail on base because the feature is missing, not because a fixture broke. Products are made through `catalog.createProduct`; stock through `inventory.createItem/receive`. Variant and weighed fixtures need the new writer keys, so on base those checks report `fixture:` reasons (expected).

## Names I had to invent (controller to ratify)
- **Schema**:
  - `PosSaleLineOption {id, tenantId, saleId, lineId, choiceId, groupId, groupName, choiceName, priceDeltaSatang}`.
  - `PosSaleLine.components Json?` and `PosSaleLine.weightGrams Int?`.
  - `PosProduct.soldByWeight Boolean @default(false)` and `PosProduct.scalePlu String?`.
- **scan-shared**: `ean13CheckDigit`, `weighedBarcodeSettings`, `parseWeighedBarcode` (returns `{prefix, itemCode, kind, grams, priceSatang}`), `weighedPriceSatang`, `weighedGramsFromPrice`, and type `WeighedBarcodeRule {prefix, kind: "WEIGHT"|"PRICE"}`.
- **Setting**: `AppSystem(POS).settings.pos.weighedBarcode {enabled, rules[]}`.
- **register-shared**:
  - `cartAddProduct(cart, productId, key, options?)`.
  - Cart line fields `options` (string[] of choiceIds), `weighedBarcode`, `weightGrams`.
  - `REGISTER_MAX_OPTIONS_PER_LINE = 20`.
  - Codes `OPTIONS_INVALID`, `OPTION_UNAVAILABLE`, `VARIANT_REQUIRED`, `WEIGHT_REQUIRED` → `errors.optionsInvalid / optionUnavailable / variantRequired / weightRequired`.
  - Keys `pos.register.options.{title,required,optional,pickUpTo,confirm,unavailable}` and `pos.register.variants.title`.
- **register**:
  - Line input `options: [{choiceId}]` (`priceDeltaSatang`/`name` tolerated and ignored), `weighedBarcode`, `weightGrams`.
  - Quote line `optionsSatang` and `options[{choiceId, groupId, name, priceDeltaSatang}]`.
  - `RegisterProduct.parentId` and `variantCount`.
  - Scan result field `weighed {code, grams, priceSatang}`.
  - `registerProductOptions(ctx, actor, {productId})` and its result shape (brief R7); `registerProductOptionsAction`.
- **catalog**: `createOptionGroup(ctx, {unitId, name, nameEn?, minSelect, maxSelect, choices[{name, nameEn?, priceDelta, isDefault?}]})`, `setProductOptionGroups(ctx, productId, groupIds)`, `setRecipe(ctx, productId, [{invItemId, qty}])`; `createProduct`/`updateProduct` keys `parentId`, `soldByWeight`, `scalePlu`.
- **service**:
  - `createSale` lines `options?`, `components?`, `weightGrams?`.
  - Consumption key `pos-consume-<saleId>-<lineId>-<invItemId>` for components.
- **UI test ids**: `pos-reg-options-dialog`, `pos-reg-option-<choiceId>`, `pos-reg-options-confirm`, `pos-reg-variant-<id>`.

## Drift (brief/task vs code)
1. **There is no `PosVariant` model.** The task text says "PosVariant models", but a variant is `PosProduct.parentId` (`pos.prisma:151`). Cleanup code in P1.5/P1.6 deletes from `posVariant` (a no-op); P1.2's cleanup omits it.
2. **The grid shows variant children today.** `regVisibleWhere` has no `parentId` filter (`register.ts:552`). P1.2 must hide them (V1). The P1.3 grid shape S1.3 is unaffected, because only new fields are added.
3. **`MenuOptionGroup` is per unit.** "Shared" is therefore defined as one group linked to many products (brief R5). The group's unit must sit on the same POS.
4. **The restaurant ignores unknown choiceIds** (`order.ts:80`). POS is stricter (`OPTIONS_INVALID`). Restaurant behaviour is not changed in P1.2.
5. **The `registerStatus` pending query is keyed per line** (`register.ts:1213`). Bundle components need the new key, so the query must change (B4).
6. **Restaurant checkout bakes the options into the unit price and sends no `options`** (`order.ts:435`). Left as is until P2.4.

## Questions for the controller
- Q1: Is "tolerated and ignored" right for client `priceDeltaSatang`/`name` inside an option entry, or should they be `VALIDATION`? O6 asserts ignored.
- Q2: Is a missing-required-group with other options given correctly classified as `OPTIONS_REQUIRED`, and is exceeding max `OPTIONS_INVALID` (O3/O4)?
- Q3: Is `match:"choose"` right when scanning a parent that has variants (V2)?
- Q4: Should manual weight need `pos.sale.priceOverride` (W5, owner P4)?

## Commands for the VPS (lane rules)
```
bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p1.2.mts            # expect SKIPPED exit 0
QC_FORCE=1 bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p1.2.mts # expect 4/46, Z1 Z2 green
```

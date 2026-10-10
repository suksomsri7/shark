# POS P2.2 — oracle notes (`scripts/qc-pos-p2.2.mts`)

Oracle writer · VPS (account B, lane 3) · 9 Oct 2026 · tree `/root/projects/shark-pos-c` · branch `wip/pos-p2.2-oracle` from local ref `tmp/p118u-merge` **348c6d47** (session/pos + P1.18U trial merge; P2.1 S merged at 206a48df).
Contract: `ledger/pos-briefs/pos-brief-P2.2.md` §2 R1–R12, §3, §4, §5 CD1–CD10, **§9 controller rulings (binding)**. The U half (06 table/drawer, rule editor, register badges, bills drawer UI) is not tested here.

**42 checks** · families ST (4) + S3 static · B pure (7) · C channel/branch rows (6) · P price rules (5) · Q register (10) · S sale (S1 S2 S4) · H held carts (2) · R refund/void (2) · Z (2).
Modes: `--list` (no DB) · `--no-db` (ST1–ST4, S3, B1–B7; never loads prisma; exit 1 when red) · DB run SKIPs (exit 0 + reasons) until the P2.2 files/exports/delegates/columns exist · `QC_FORCE=1` runs anyway (red by reason, no crash).
Run: `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p2.2.mts` (drop `QC_FORCE=1` once built).

**Time gate (CD10, no test clock).** DB rules are built around the real `now`: window = Bangkok now ±60 min, clamped to `00:00`/`23:59` (no overnight, CD8), weekday = today (Bangkok), date range now ±1 day. The suite refuses to start (exit 0, `JSON_SUMMARY skipped:true reason`) when the window head < 2 min or tail < 20 min (i.e. Bangkok 00:00–00:01 and 23:40–23:59) — the run takes several minutes and the window must outlive it. Exact boundaries are proven only on the pure resolver (B4).

**Fixtures** (module functions; prisma only for tenant/unit/membership/account-link/AccountProduct rows and raw-SQL cleanup): temp tenant `posqc-p22-<rand>` — one POS system linked to units **A, B** (VAT book linked; MEMBER + COUPON + INVENTORY on A), second tenant **T2** (`-t2`, unit X, own POS). Memberships in the temp tenant: coffee owner = OWNER `*`, coffee cashier = **MANAGER [A]**, resto cashier = **STAFF [A]** `{pos.sale.create}` (catalog reads rights from `Membership`; register/rule services take the actor object). Device + open shift on A. Channels: builtins on A/B, `LINEMAN` on A (30 %, PLATFORM), `CUSTOM_OLD` archived. Catalog (system actor): category กาแฟ; latte 7 500 (กาแฟ, option group ขนาด S +0 / **M +1 000** at A), americano 6 000 (กาแฟ), unpriced (กาแฟ), espresso 5 000 (PAR product — never gets rows/rules), matcha 6 500, greentea 5 500 (P-family target), croissant 4 500, mocha 6 500 + variant mochaKid (no own price), tea 4 000, tea2 4 200, weighed 120 000/kg (`soldByWeight`, random PLU), T2 latte 7 500; an InvItem↔AccountProduct-linked product (8 800) for C4; member X (Gold 5 % cap ฿100) + coupon `PCT10` (10 %, cap ฿100).
Cleanup: whole temp tenants deleted in `finally` (every table with `tenantId`), Z1 residue 0, Z2 leaks 0 + new-table fingerprint of all non-`posqc-p22-*` tenants before = after. Network blocked (fetch guard).

**Positive control for B.** B1–B7 were run against a throw-away reference resolver written in the scratch dir (not committed, see "Reference resolver" below): 7/7 green. So B reds on 348c6d47 are "module missing", not oracle errors.

## CONTROLLER-DECISION (read first — the oracle encodes my proposal for each)
1. **Refusal style of the catalog writers (C2/C3/C6).** `setChannelPrices` / `bulkChannelMarkup` live in `catalog.ts`, whose house style is to **throw `CatalogError`**. The oracle accepts either a thrown error with `.code` or a returned `{ok:false, code}`; success = no throw and not `{ok:false}` (return value otherwise free). Codes: `VALIDATION`, `PERMISSION_DENIED`, and **`PRODUCT_NOT_FOUND`** (brief R2 wording) for another tenant's/system's or unknown product — today `CatalogErrorCode` has `NOT_FOUND`, so the builder must add `PRODUCT_NOT_FOUND` to the union. If the controller prefers the existing `NOT_FOUND`, it is a one-line ORACLE-EDIT in C3.
2. **`listPriceSatang` meaning (B/Q/S).** = step-② list price = own base, else the parent's base (variant); **excludes option deltas** (Q6: unit 6 900, list 7 500) and is the same for BASE/BRANCH/CHANNEL/RULE. For OPEN / CUSTOM / WEIGHED the oracle requires **`null`** (Q7, S1 custom line). Readers (R11) show "ปกติ ฿75" from it.
3. **Variant row lookup order (B2/B6).** Per level, the variant's own row beats the parent's row of the **same** level; levels keep R4 order ((code,unit) → (code,all) → (all,unit)). The oracle does not test own (code,all) vs parent (code,unit) — the reference resolver walks `own(code,unit), parent(code,unit), own(code,all), parent(code,all), own(all,unit), parent(all,unit)`. Rules match the product id **or the parent id**, category = own `categoryId ?? parent.categoryId`. A variant's own base price (not null) becomes its list price and is not overridden by the parent's base.
4. **notSold on a branch row (B6).** `(null, unit, notSold)` is allowed; it wins only when no channel row exists for the cart's channel ⇒ `CHANNEL_NOT_SOLD`; a channel row (code,all) still prices the line. A notSold winner is never rescued by a rule.
5. **Bulk markup rounding (B7 · CD6 · Q6).** Single rounding of the exact value: `roundTo × halfUp(base × (10000 + bp) / (10000 × roundTo))`. Discriminating case: 115 × 3 000 bp, roundTo 100 ⇒ **100** (two-stage rounding would give 200). Bulk **upserts only the (code, unit) row** of each product (other rows kept, C6 tea2), writes absolute prices, skips products with base null, audits **one row per product written** (C6 makes latte change 9 400 → 9 500 so a builder that skips no-op writes is not punished). Input: exactly one of `productIds` (≤ 500) / `categoryId`; `markupBp` 1..20 000; `roundTo` 1|100; unknown key ⇒ VALIDATION. Permission = `pos.product.setPrice` with the row scope of `unitId` (null ⇒ every linked unit).
6. **Replacing rows needs the rights of the rows written (C3).** Tested only with a manager writing unit-A rows on a product that has no all-branch row. Proposal for the builder: rows **removed** by a full replace need the same scope as rows written (a unit-A manager cannot silently delete an all-branch row). Not asserted.
7. **Rule input/outputs (P1).** `savePriceRule(ctx, actor, input)`: input keys exactly `{id?, name, kind, active?, priority?, productIds?, categoryIds?, channelCodes?, unitIds?, adjust, valueSatang?, valueBp?, startsAt?, endsAt?, weekdays?, timeFrom?, timeTo?}` — the oracle **omits** the value key that does not belong to `adjust` (PRICE/AMOUNT_OFF send `valueSatang`, PERCENT_OFF sends `valueBp`); dates are ISO strings or null; defaults `active true`, `priority 0`, arrays `[]`. Result item has **exactly 18 keys** (`RULE_ITEM_KEYS` below) with `startsAt/endsAt` as ISO string|null and `archived` boolean (no createdAt/updatedAt in the DTO). `channelCodes` entries must match `CHANNEL_CODE_RE` (`lineman` ⇒ VALIDATION); the oracle does not require them to exist as channels. `productIds` used by the oracle always exist (it does not test unknown product ids).
8. **Rule permissions (P3 · Q5).** list needs `pos.sale.read|pos.sale.create` at `ctx.unitId`; writes need `pos.price.rule` at **every** unit in `unitIds`, or at every linked unit of the system when `unitIds = []` — the same check for archive. STAFF holding the key at A and B may save an all-branch rule (positive control); STAFF holding it only at A may not.
9. **Rule limit (P2).** 100 non-archived rules per system **including inactive ones**; archived ones do not count.
10. **Catalog tile fields (Q4 · R6).** `registerCatalog` products gain `listPriceSatang`, `priceSource`, `priceRule {id, name, endsAt}|null`; `priceSatang` = STORE effective price at `at`. The oracle checks `priceRule.id` only (not `endsAt`). Result gains `priceValidUntil` (ISO string or Date or null): must be in the future and ≤ the end of the current happy-hour window (+1 min tolerance).
11. **`listForUnit.channelPrices` scope (C5).** Only rows with `unitId` null or = the requested unit; entries have exactly `{channelId, channelCode, unitId, priceSatang, notSold}`; `channelId` = the requested unit's SalesChannel id for that code, `null` when the unit has no such channel or the row is a branch row (code null).
12. **createSale validation (S2).** `priceSource` ∉ 7 values, `priceRuleId` > 40 chars / non-string, `listPriceSatang` not an int ≥ 0 ⇒ `VALIDATION` (thrown `PosSaleError`, nothing written). A replay of the same key with different snapshot fields returns the original bill (fields are not in `samePayload`).
13. **H2 static marker.** H2 also fails while `held-cart.ts` (comments stripped) never mentions `channelId` — the only way to show the `:292` bug on 348c6d47, where channel prices do not exist yet. Any sane fix mentions `cart.channelId`.
14. **Refund docs (R1 · R8).** REFUND `PosSaleLine` rows keep all 3 snapshot columns `null` (readers join `refLineId`).

## Drift (brief vs code at 348c6d47)
- `CatalogErrorCode` has no `PRODUCT_NOT_FOUND` (CD-1); catalog writers throw instead of returning refusals.
- `catalog.ts:111–112` declares `channelPrices: {channelId, priceSatang}[]` and `toViews` returns `channelPrices: []` (`:994`); R6 widens the element (additive) — ST3 fails while the literal `channelPrices: []` remains.
- `held-cart.ts:292` probe builds `{ lines }` without `channelId` (the file never mentions channels) — H2.
- `RegisterProduct` (register-shared.ts:210) has no price-source fields; `RegisterCatalogResult` has no `priceValidUntil`.
- `RegisterQuoteLine` (register-shared.ts:296) has 8 keys; PAR (Q1) allows only `priceSource`, `listPriceSatang`, `priceRule` to be added.
- `BillDetail.lines` (bills-shared.ts:102) is `{name, qty, unitPriceSatang, discountSatang, lineTotalSatang, options}` — R11 adds 3 keys.
- `pos.json` has no `price` block and no `register.errors.channelNotSold|priceRuleNotFound|priceRuleLimit`.
- `PRICE_MAX_SATANG` = 2 147 483 647 (int4 max) — "MAX+1" cases send 2 147 483 648.
- STAFF cap default `REGISTER_STAFF_MAX_DISCOUNT_BP` = 1 000 (Q9 uses 10 % / 10.01 %).
- AuditLog column is `actorId` (as in P2.1).
- The register line name for catalog lines is the product name (S1/billDetail match by name/productId).

## Names table (exactly as the oracle calls them — builder S must match)
| # | name | shape / where |
|---|---|---|
| 1 | `model PosProductChannelPrice` | `id tenantId systemId productId(String) channelCode String? unitId String? priceSatang Int? notSold Boolean @default(false) updatedByUserId createdAt updatedAt` · `@@index([tenantId, systemId, productId])` · no `@relation` |
| 2 | `model PosPriceRule` | `id tenantId systemId name kind PosPriceRuleKind active Boolean priority Int productIds String[] categoryIds String[] channelCodes String[] unitIds String[] adjust PosPriceRuleAdjust valueSatang Int? valueBp Int? startsAt DateTime? endsAt DateTime? weekdays Int[] timeFrom String? timeTo String? archivedAt DateTime? createdByUserId updatedByUserId createdAt updatedAt` · `@@index([tenantId, systemId, archivedAt])` |
| 3 | enums | `PosPriceSource {BASE BRANCH CHANNEL RULE OPEN CUSTOM WEIGHED}` · `PosPriceRuleKind {HAPPY_HOUR PROMO}` · `PosPriceRuleAdjust {PRICE PERCENT_OFF AMOUNT_OFF}` |
| 4 | `PosSaleLine` | `+ priceSource PosPriceSource?` `+ priceRuleId String?` `+ listPriceSatang Int?` |
| 5 | migration | dir `prisma/migrations/20261204100000_pos_p22_prices/` · only: `SET/RESET lock_timeout`, `CREATE TYPE` ×3 (DO-guard allowed), `CREATE TABLE IF NOT EXISTS` ×2 (no FK), `CREATE [UNIQUE] INDEX IF NOT EXISTS … ON` the two tables, optional `ALTER TABLE "PosProductChannelPrice" ADD CONSTRAINT … CHECK`, `ALTER TABLE "PosSaleLine" ADD COLUMN IF NOT EXISTS` ×3 nullable (`"PosPriceSource"`, `TEXT`, `INTEGER`) · CHECK must contain the 3 brief conditions verbatim (`"channelCode" IS NOT NULL OR "unitId" IS NOT NULL` · `NOT "notSold" OR "priceSatang" IS NULL` · `"notSold" OR "priceSatang" IS NOT NULL`) · `CREATE UNIQUE INDEX [IF NOT EXISTS] "PosProductChannelPrice_product_code_unit_key" ON "PosProductChannelPrice" ("productId","channelCode","unitId") NULLS NOT DISTINCT` (or a `coalesce` expression index with that name) · indexes `(tenantId, systemId, productId)` and `PosPriceRule(tenantId, systemId, archivedAt)` |
| 6 | schema doc | the index name `PosProductChannelPrice_product_code_unit_key` appears in a `///` comment next to the model with "ห้ามลบ" or "do not remove" (PosCategory M5 style) |
| 7 | `core/scope.ts` | `PosProductChannelPrice: sys(),` `PosPriceRule: sys(),` |
| 8 | `scripts/pos-qc-env.mts` | `POS_MODELS.posProductChannelPrice {model: "PosProductChannelPrice", …}` · `POS_MODELS.posPriceRule {model: "PosPriceRule", …}` · `"PosProductChannelPrice"` removed from `POS_FUTURE_MODELS` |
| 9 | `core/permissions.ts` | `"pos.price.rule": "ตั้งโปรราคาและ happy hour…"` (label must contain `ตั้งโปรราคาและ happy hour`) |
| 10 | refusal codes | `RegisterRefusalCode += CHANNEL_NOT_SOLD PRICE_RULE_NOT_FOUND PRICE_RULE_LIMIT` · `REFUSAL_KEY` → `errors.channelNotSold` `errors.priceRuleNotFound` `errors.priceRuleLimit` · `src/messages/{th,en}/pos.json` `register.errors.*` (th Thai) + a non-empty `price` block (th Thai) |
| 11 | `pos/price-shared.ts` (pure — may import only `./pricing-shared` / `./register-shared` / `./channel-shared` / `@/lib/ui/*`) | `PRICE_SOURCES = ["BASE","BRANCH","CHANNEL","RULE","OPEN","CUSTOM","WEIGHED"]` (this order) · `PRICE_RULE_LIMIT = 100` · `CHANNEL_PRICE_ROWS_MAX = 60` · `BULK_MARKUP_BP_MAX = 20000` · `PRICE_RULE_PRODUCTS_MAX = 500` · `PRICE_RULE_CATEGORIES_MAX = 50` · `channelMarkupPrice(baseSatang, markupBp, roundTo: 1 \| 100): number` · `resolveUnitPrice(input): result` (below) |
| 12 | `resolveUnitPrice` input | `{ product: {id, basePriceSatang: number\|null, categoryId: string\|null, parentId: string\|null, soldByWeight?}, parent?: {id, basePriceSatang, categoryId} \| null, channelCode: string, unitId: string, rows: {productId, channelCode: string\|null, unitId: string\|null, priceSatang: number\|null, notSold: boolean}[], rules: {id, name, kind?, active, archivedAt: Date\|string\|null, priority, productIds, categoryIds, channelCodes, unitIds, adjust, valueSatang: number\|null, valueBp: number\|null, startsAt: Date\|string\|null, endsAt: Date\|string\|null, weekdays: number[], timeFrom: "HH:MM"\|null, timeTo: "HH:MM"\|null, createdAt: Date\|string}[], at: Date, override?: {source: "OPEN"\|"CUSTOM"\|"WEIGHED", priceSatang: number}, optionDeltaSatang?: number }` — rows/rules of other products are passed and must be ignored |
| 13 | `resolveUnitPrice` result | `{ok: true, source: PriceSource, priceSatang (before options), unitPriceSatang (= priceSatang + optionDeltaSatang), listPriceSatang: number\|null, ruleId: string\|null, ruleName: string\|null}` \| `{ok: false, code: "PRICE_NOT_SET" \| "CHANNEL_NOT_SOLD"}` (returned, not thrown) |
| 14 | `pos/price.ts` | `resolvePrices(db, {tenantId, systemId, unitId}, {channelId? \| channelCode?, at?: Date, items: {productId, optionDeltaSatang?}[]}) → {ok: true, items: {unitPriceSatang, listPriceSatang, source, ruleId}[]} \| {ok:false, code, message}` · re-exported on the facade: `pos/index.ts` exports `resolvePrices`; `catalog` facade object gains `setChannelPrices`, `bulkChannelMarkup` |
| 15 | `catalog.setChannelPrices(ctx: CatalogCtx, {productId, rows: {channelCode: string\|null, unitId: string\|null, priceSatang: number\|null, notSold?: boolean}[]})` | full replace in one tx · exact keys (row + top) · ≤ 60 rows · dup (code,unit) / (null,null) / notSold+price / !notSold+null / price ∉ int 0..PRICE_MAX / code not builtin and not a non-archived SalesChannel code of the system / bad code shape / weighed product ⇒ `VALIDATION` · rights `pos.product.setPrice` per row scope · unknown/other tenant ⇒ `PRODUCT_NOT_FOUND` · writes `updatedByUserId` = actor · audit `pos.product.channelPrice` (actorId = user, targetId or after mentions productId, `after` contains the new rows, a clear has `after: []`) · never writes AccountProduct / InvItem |
| 16 | `catalog.bulkChannelMarkup(ctx, {channelCode, unitId: string\|null, markupBp, roundTo, productIds? \| categoryId?})` | CD-5 |
| 17 | `catalog.listForUnit` | `items[].channelPrices: {channelId, channelCode, unitId, priceSatang, notSold}[]` (CD-11) |
| 18 | `pos/price-rule.ts` | `listPriceRules(ctx, actor, {includeArchived?}) → {ok:true, items}` · `savePriceRule(ctx, actor, input) → {ok:true, rule}` · `archivePriceRule(ctx, actor, {id}) → {ok:true, rule}` · refusals returned `{ok:false, code, message(th)}`: `VALIDATION PERMISSION_DENIED PRICE_RULE_NOT_FOUND PRICE_RULE_LIMIT` · ctx = `{tenantId, systemId, unitId}` (RegisterCtx) · actor = RegisterActor |
| 19 | rule item (18 keys) | `id name kind active priority productIds categoryIds channelCodes unitIds adjust valueSatang valueBp startsAt endsAt weekdays timeFrom timeTo archived` |
| 20 | audits (rules) | `pos.priceRule.created` / `pos.priceRule.updated` / `pos.priceRule.archived` · actorId = user · mentions ruleId · updated carries before/after (after contains the new name) |
| 21 | `pos/price-rule-actions.ts` ("use server") | `listPriceRulesAction` `savePriceRuleAction` `archivePriceRuleAction` — each calls its service fn, has `catch`, file calls `requireTenant` |
| 22 | quote line | `+ priceSource`, `+ listPriceSatang`, `+ priceRule: {id, name} \| null` (other line keys unchanged) |
| 23 | catalog tile / result | `RegisterProduct + listPriceSatang priceSource priceRule {id, name, endsAt}\|null` · `RegisterCatalogResult + priceValidUntil` |
| 24 | refusal at quote/submit | `{ok:false, code:"CHANNEL_NOT_SOLD", lineIndex, message ⊃ "ไม่ขายในช่องทางนี้"}` |
| 25 | `createSale` `lines[]` | `+ priceSource?: "BASE"\|…\|"WEIGHED"` `+ priceRuleId?: string (≤ 40)` `+ listPriceSatang?: int ≥ 0` · contract JSON keys `lines[].priceSource` `lines[].priceRuleId` (type `string`) `lines[].listPriceSatang` (type `number`), all optional; base hash of the 45 old keys = `773a37ae7f05e813` |
| 26 | `billDetail().bill.lines[]` | `+ priceSource` `+ priceRuleName` (rule name by id, null if none) `+ listPriceSatang` |
| 27 | held carts | `held-cart.ts` probe quote carries the cart's `channelId` |
| 28 | Q8 invariants kept | `register.ts` still contains `P2.2 ▸ channel price here` · `pos-integrations.ts` still has `["happyHourPricing", false, "P2.2"]` |

## Expected values used by the DB checks (for the builder)
latte LINEMAN row 9 400 (C1) → bulk 27 %/100 ⇒ **9 500**; americano (null, A) 5 500, bulk ⇒ LINEMAN 7 600; mocha LINEMAN 8 500 (variant inherits); matcha LINEMAN notSold; tea2 manager rows (null,A) 4 000 + (LINEMAN,A) 4 600 → bulk (LINEMAN,A) 5 300.
Happy hour `บ่ายชิล <rand>` = PRICE 5 900, STORE only, latte, priority 10, window now ±60. `ลด 20% ทุกช่องทาง <rand>` = PERCENT_OFF 2 000 bp, all channels, latte, priority 0 ⇒ LINEMAN 7 600, STORE stays 5 900. Both archived at the "flip"; then latte base → 8 000 (R).
Q9: latte ×2 at 5 900 + member Gold + `PCT10` must equal a custom-line cart 5 900 ×2 on subtotal/coupon/tier/memberDiscount/net/vat/grand/pointsToEarn (coupon 1 180) and differ from the 7 500 cart.

## Reference resolver (scratch, not committed)
`/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p22-o/price-shared-ref.ts` — ~70 lines implementing rows 11–13; a copy of the oracle pointed at it gave B1–B7 7/7 green.

## Runs at 348c6d47 (this branch)
- `pnpm exec tsx scripts/qc-pos-p2.2.mts --list` → exit 0, 42 ids (below).
- `--no-db` → exit 1 · 0/12 (ST1–ST4, S3, B1–B7 red: files/exports/schema missing; S3 = base hash `773a37ae7f05e813` matches, new fields absent).
- Scratch copy pointed at the reference resolver → B1–B7 **7/7 green** (positive control of the pure family).
- Forced QC4 run (`QC_FORCE=1`, host ep-frosty-lab, 9 Oct ~22:20Z, window 04:20–06:20 Bangkok) → exit 1 · **3/42 green: Q1 (PAR — by design green on base), Z1, Z2**; residue 0 in both temp tenants (321 tables each); no crash.
  Red reasons: ST1–ST4/S3/B* = missing schema/files/exports; C1–C6 = `MISSING:setChannelPrices/bulkChannelMarkup` + no `PosProductChannelPrice` table; P1–P5 = `MISSING:savePriceRule/listPriceRules` + no `PosPriceRule`; Q2/Q3/Q8 = base prices (no rows) and no `CHANNEL_NOT_SOLD` (Q8's LINEMAN submit even wrote a bill — the refusal does not exist yet); Q4–Q7/Q9 = no rules ⇒ BASE 7 500, no `priceSource`; S1/S2/S4/Q10/R1/R2 = no line columns, rule-priced submits get `PRICE_CHANGED` (expected 5 900 vs 7 500) so R has no sale; H1 = held 7 500 not 5 900.
  **H2 is red for the right reason**: `held-cart.ts ไม่ส่ง channelId ให้ probe (บั๊ก :292 — probe คิดราคา STORE)` + held prices not at LINEMAN/rule level (no channel prices yet).
- Fixture positive signals seen on base: control quotes/bills work (Q9 control cart: coupon 1 500 / tier 750 on 15 000; R2 control PAID `1000:17700/0 2200:0/1158 4000:0/16542`), InvItem↔AccountProduct product created with base 8 800.
- Typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck` → exit 0.

## `--list`
```
qc-pos-p2.2 — 42 ข้อ (id · X · หัวข้อ)	
P2.2-ST1	S
P2.2-ST2	S
P2.2-ST3	S
P2.2-ST4	S
P2.2-S3	S
P2.2-B1	P
P2.2-B2	P
P2.2-B3	P
P2.2-B4	P
P2.2-B5	P
P2.2-B6	P
P2.2-B7	P
P2.2-C1	-
P2.2-C2	X5
P2.2-C3	X3
P2.2-C4	X5
P2.2-C5	-
P2.2-C6	X4
P2.2-P1	-
P2.2-P2	-
P2.2-P3	X3
P2.2-P4	X2
P2.2-P5	X5
P2.2-Q1	X4
P2.2-Q2	-
P2.2-Q3	-
P2.2-Q4	X4
P2.2-Q5	-
P2.2-Q6	X4
P2.2-Q7	-
P2.2-Q8	X5
P2.2-Q9	X4
P2.2-Q10	X5
P2.2-S1	X4
P2.2-S2	X5
P2.2-S4	X1
P2.2-H1	-
P2.2-H2	X2
P2.2-R1	X4
P2.2-R2	X4
P2.2-Z1	-
P2.2-Z2	-
X-coverage: S=5 P=7 -=11 X5=6 X3=2 X4=8 X2=2 X1=1	
```

## ORACLE-EDIT — builder S (controller ruling 1) · 9 Oct 2026 · account B
- Commit `18244782` `test(pos P2.2): ORACLE-EDIT C3 — catalog NOT_FOUND (controller ruling 1)` — **own commit, oracle only** (`scripts/qc-pos-p2.2.mts` C3: title text + two `codeIs(…, "NOT_FOUND")` asserts + chk label). Count **42 unchanged**.
- Why: C3 expected `PRODUCT_NOT_FOUND` for another tenant's / unknown product; ruling 1 keeps the existing `CatalogErrorCode` `NOT_FOUND` (house style, union not widened).
- Red before (pre-edit oracle, step-2 code): `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p22/runs/s2-forced1.log` — C3 red only on PRODUCT_NOT_FOUND vs NOT_FOUND. Green from step 6 on (42/42). Accepted by reviewer S (`pos-P2.2-review-S.md` "ORACLE-EDIT").

## ORACLE-EDIT — fix round 1 (reviewer F1, F2 · controller rulings 9 Oct 23:2xZ) · builder S (account B)
- Commit `b78896fb` `test(pos P2.2): ORACLE-EDIT Q8 — open price refused on a notSold row (reviewer F1)` — **own commit, oracle only**: one assert inside Q8 — LINEMAN cart `[matcha {openPrice:true, unitPriceSatang:4000}]` (matcha has (LINEMAN, all) notSold) ⇒ `CHANNEL_NOT_SOLD` lineIndex 0 (+ Q8 D-text). Count **42 unchanged**.
- Commit `a6c1f0b0` `test(pos P2.2): ORACLE-EDIT C6 — bulk markup keeps notSold rows (reviewer F2)` — **own commit, oracle only**: one assert inside C6 — owner `bulkChannelMarkup({LINEMAN, unitId:null, 2700 bp, roundTo 100, productIds:[matcha]})` ⇒ ok · written 0 · skipped 1 · row still `LINEMAN|*|X` · channelPrice audit +0 (+ C6 D-text). Count **42 unchanged**.
- Red before: `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p22-fix/runs/red-p22-forced.log` (a6c1f0b0, no fixes) 39/42 — C6 (matcha → written 1, `LINEMAN|*|8300`, audit +1) with C5/Q8 cascade · `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p22-fix/runs/red2-p22-forced-noF1.log` (b2c8b0c6, F2–F4 fixed) 41/42 — only the new Q8 assert. Green at 5244b8eb (42/42 ×3).

## ORACLE-EDIT — fix round 2 (reviewer R2 F6 · controller ruling 9 Oct 23:5xZ) · builder S (account B)
- Commit `ec074d01` `test(pos P2.2): ORACLE-EDIT Q8 — base-null product notSold refuses open price (reviewer F6)` — **own commit, oracle only**: one more assert inside Q8 — set (LINEMAN, all) notSold on the base-null fixture "ขนมไม่ตั้งราคา" (`PR.unpriced`) → LINEMAN quote `[unpriced {openPrice:true, unitPriceSatang:4000}]` ⇒ `CHANNEL_NOT_SOLD` lineIndex 0 → clear the rows again (before Q8's `counts()` snapshot; no later check reads `unpriced` or channelPrice audits) (+ Q8 D-text). Count **42 unchanged**.
- Red before: `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p22-fix/runs/r2-red-p22-forced-noF6.log` (ec074d01, F6 not fixed) 41/42 — only Q8: "ราคาเปิด LINEMAN ขนมไม่ตั้งราคา(ไม่ขาย) → OK (คาด CHANNEL_NOT_SOLD @0 · ตั้งแถว VALUE · ล้าง VALUE)". Green after f4e96cac + f6cb73c2 (42/42 ×3).

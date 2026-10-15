# POS P2.11 S — builder notes (หลายสาขา · lane B · tree c)

Builder · VPS (account B) · 15 Oct 2026 · tree `/root/projects/shark-pos-c` · branch `wip/pos-p2.11` from oracle `wip/pos-p2.11-oracle` **5576c15b** + merge `origin/session/pos` (ledger only: 8febc167 → 501f78ab).
Contract: `ledger/pos-briefs/pos-brief-P2.11.md` §0–§9 + §10 rulings 1–19 · oracle names table `ledger/wo-notes/pos-P2.11-oracle.md` · prompt `pos-prompt-accountB-P2.11.md`.
No migration / schema change (ST1). Lane-A files untouched (ST4: `service.ts` `register*` `tender*` `refund*` `account-bridge.ts` `outbox-consumers.ts` `account/**`); `receipt.ts` = 3 marked hunks only.

## Commits (prefix `pos P2.11 S:`)
| step | commit | what |
|---|---|---|
| 1+3 | d467343a | PR F4 widened + branch-scoped save · l-price `field`/`reason` (bulk BULK_TOO_MANY, dead rows PRICE_ROW_DEAD) · `price.errors.*` th/en |
| 2 | dc02890d | `copyUnitPrices` + `unitPriceMatrix` + `"use server"` actions |
| 4 | 13ec7d8a (+ f7353edb type import) | RN `receiptUnitOverride` / `updatePosReceiptUnitSettings` / `receipt.ts` order |
| 5 | ae887222 | RP `reportChannels` + overview `channels` + CSV kind `channels` + `report.kinds.channels` |
| 6 | 304feda4 | SK `posUnitInventoryMap` exported once · both private copies removed |
| 7 | 2c9ec150 | FU2 m(i) recipe choice lines deleted on unlink/archive |
| 8 | f3d1a097 | `test(qc-pos-p2.2)` ORACLE-EDIT ST1 filter (FU1 k · ruling 18) |
| 9 | (ledger) | owner lines `POS-OWNER-PENDING.md` · these notes |

Steps 1 and 3 share one commit: the l-price `field`/`reason` plumbing (CatalogError options, `invalidAt`) is the same code the dead-row refusal needs, and the bulk refusals are 3 lines next to it.

## Hunks (file:line at head)
- `pos/catalog.ts` (lane B · writer of record):
  - `:36` import `PriceRefusalReason` · `:67–80` `CatalogError` + `readonly field?/reason?` (options) · `:84–86` `invalidAt(message, field, reason?)`.
  - `:420–452` **`posUnitInventoryMap`** (+ type `PosUnitInventoryMap`) and private `posInventoryIds` (replaces `inventorySystemsOfPos`; 4 call sites `:336 :802 :1408 :1436` now read the one map).
  - `:2068–2071` `setProductOptionGroups`: dropped groups → `dropRecipeChoiceLinesOfGroupsInTx(tx, ctx, dropped, [productId])`.
  - `:2216–2248` **`dropRecipeChoiceLinesOfGroupsInTx`** (exported; audit `pos.product.recipeChoices` per product, `via:"groupRemoved"`).
  - `:2327–2345` `cleanCpRow` refusals carry `field:"rows"`.
  - `:2384–2472` **`setChannelPrices`** rewritten (doc block `:2385–2398`).
  - `:2515–2533` `bulkChannelMarkup`: `BULK_TOO_MANY@productIds` · `BULK_TOO_MANY@categoryId` · dead code/unit `PRICE_ROW_DEAD@channelCode|unitId`.
  - `:2591–2800` **`copyUnitPrices`** `:2621` · **`unitPriceMatrix`** `:2737` (+ types `UnitPriceMatrix`, `UnitPriceMatrixCell`).
- `pos/catalog-legacy.ts:321–322` `archiveMenuOptionGroup` → `C.dropRecipeChoiceLinesOfGroupsInTx(tx, {tenantId, systemId:"", actorUserId: CATALOG_SYSTEM_ACTOR}, [id])` (writer stays catalog.ts — ruling 17 / p2.3 ST3).
- `pos/catalog-price-actions.ts`: `:15–23` `PriceActionRefusal.reason?` + `refusalOf` passes `field`/`reason` · `:28–33` `sessionCtx(args, readOnly)` · `:92–143` **`copyUnitPricesAction`** / **`unitPriceMatrixAction`** (read-only: tenant member, no permission key — ruling 16 / oracle CD7).
- `pos/price-shared.ts:44–49` `PRICE_REFUSAL_REASONS = ["PRICE_ROW_DEAD","BULK_TOO_MANY"]` + `PriceRefusalReason` (pure).
- `pos/receipt-settings-shared.ts:131–197` `TAX_BRANCH_NO_RE` · `RECEIPT_UNIT_KEYS` · types · **`receiptUnitOverride`** `:149` · `mergeReceiptUnitPatch` · `storedReceiptUnit` (pure).
- `pos/receipt-settings.ts`: `:9` value import `Prisma` · `:16–21` imports · `:107–109` `updatePosReceiptSettings` keeps `receipt.byUnit` · `:135–209` `rawReceiptByUnit` + **`updatePosReceiptUnitSettings`** `:153`.
- `pos/receipt.ts` (lane-A-adjacent, marked hunks only): `:28` import · `:215` `uo = receiptUnitOverride(...)` · `:301–303` address/phone/branchNo order.
- `pos/recipe-actions.ts:19, :151–156` uses `posUnitInventoryMap` (no own `type: "INVENTORY"` lookup).
- `pos/reports.ts`: `:20` import · `:43` `REPORT_KINDS += "channels"` · `:195–209` `ChannelRow`/`ChannelTotals` · `:233, :241–242` result union · `:979–1040` **`reportChannels`** `:986` · `:1072` `CSV_HEADERS.channels` · `:1166–1170` CSV rows · `:1182` `REPORT_FN.channels`.
- `pos/report-overview.ts:17–19` imports · `:37` `OVERVIEW_SECTIONS += "channels"` · `:71–72` `ReportOverview.channels` · `:167` section job.
- `pos/report-actions.ts:23, :43` `KIND_FN.channels`.
- `messages/{th,en}/pos.json`: `report.kinds.channels` · `price.errors.priceRowDead` · `price.errors.bulkTooMany` (`{max}`).
- `scripts/qc-pos-p2.2.mts:309–327` `p22MigrationTouched` (oracle draft verbatim) · `:374–375` ST1 filter uses it (dated ORACLE-EDIT marker, own `test(qc-pos-p2.2)` commit).

## Semantics as built (names table = contract)
- **setChannelPrices**: dead = code not live in this POS (no non-archived SalesChannel with that code, builtins always live) **or** unit not linked-and-live; outside reach = `requirePriceRowScope` ≠ OK (unit rows: setPrice at that unit; all-branch rows: product scope, as before). Stored out-of-reach rows absent from input → kept; input rows equal to stored → accepted (no permission needed, no write); changed/new dead → `VALIDATION reason PRICE_ROW_DEAD field "rows"`; changed/new outside reach → `PERMISSION_DENIED`; in-reach omitted → deleted (ruling 12). All checks before the first write. Audit before/after = full stored set (ruling 11); result `rows` = full stored set (the 06 drawer refreshes from it — kept rows were loaded rows anyway). The "branch-only product, other branch row" refusal now applies to changed/new rows only (unchanged resend accepted). Unknown codes/units (never existed) are dead too ⇒ `PRICE_ROW_DEAD` (still VALIDATION — p2.2 C2 PAR).
- **copyUnitPrices**: from/to = unit of another tenant / unknown → NOT_FOUND; this tenant but archived/unlinked → `VALIDATION field fromUnitId|toUnitId reason PRICE_ROW_DEAD`; from = to → `VALIDATION field toUnitId`. Permission: setPrice at `toUnitId` (+ `canAccessUnit(from)`), else PERMISSION_DENIED. Per product (locked, sorted): source rows `(code, from)` → `(code, to)`; dead code → skipped; target equal → nothing (not counted); target differs + overwrite false → skipped; overwrite true → updated; rows only at `to` never deleted. Weighed products / branch-only products of another branch → skipped (all their source rows). No `productIds` = all products with rows at `from` (> 500 → BULK_TOO_MANY). Audit 1/product written, `via:"copy"`, full set before/after.
- **unitPriceMatrix**: read-only (no tx). Default units = live POS units the actor can access, sorted by name; explicit unit outside that set → NOT_FOUND; product of another tenant/system or of an invisible branch → NOT_FOUND. Default codes = `STORE` + distinct live channel codes at those units. Cell = `priceOf(loadPriceBook(unit), product, code)` at one `at` — a branch-only product is still priced at every unit (the screen hides; same as the resolver).
- **RN**: override per field → system header → book (address/phone); branchNo override → book → `00000` (ABB and FULL only — RECEIPT prints none). Writer: patch keys exactly `taxBranchNo|address|phone`, `null`/"" clears, empty patch / odd key → VALIDATION `field:"patch"`; unit check → `VALIDATION field:"unitId"`; `pos.device.manage` at that unit; key `taxBranchNo` present (even null) → OWNER/`*` only. Stored value holds only the set fields; all cleared → key removed. Same values → `ok`, no write, no audit. Audit `{unitId, receipt.byUnit.<unitId>}` before/after, phone masked (`maskAuditPhones`). The system writer (`updatePosReceiptSettings`) re-attaches the stored `byUnit` block (parse drops unknown keys).
- **RP**: `reportChannels` uses `prepare` (REPORT_PERMISSION, `scopeOf`, cut-off). One extra `posSale.findMany` (PAID + REFUNDED · `channelCode` `sourceModule` `channelCommission*`) + one `salesChannel.findMany` for names. Name rank: selected unit's live row → selected unit archived → first scope unit (id order) live → archived → `channelFallbackName`. CSV: header + one line per row (no "รวม" line — oracle counts rows + 1); share printed with 1 decimal.
- **SK**: `posUnitInventoryMap(tenantId, posSystemId, client?)` units sorted by id; groups sorted by inventory id; null-inventory units listed in `units`, not in `groups`.
- **FU2**: unlink deletes that product's lines of the dropped groups' choices (incl. archived choices); archive deletes the group's lines on every product of the tenant. Re-link starts empty.

## Deviations / CONTROLLER-DECISION
- None of the rulings needed bending. Small choices inside the rulings (all listed above): unknown code/unit = `PRICE_ROW_DEAD` (ruling 2 "dead"); dead copy source/target carry `reason PRICE_ROW_DEAD` besides the field; matrix action skips the role gate (ruling 16 "no permission key").
- **Pre-existing red, not P2.11**: `qc-pos-p2.2` S3 (contract snapshot vs base 348c6d47 — `payMethods[].giftCard*` from P2.9) is red on the base tree as well (`--no-db` on 33322595 = same 11/12). See gate table for the full DB run.

## P2.11U contract (S side frozen here)
- **Actions** (`catalog-price-actions.ts`): `setChannelPricesAction({systemId, productId, rows})` → `{ok, productId, rows (full stored set), changed}` · `bulkChannelMarkupAction(...)` · `copyUnitPricesAction({systemId, fromUnitId, toUnitId, overwrite, productIds?})` → `{ok, changed, written, skipped, productIds}` · `unitPriceMatrixAction({systemId, productIds, unitIds?, channelCodes?})` → `{ok, units:[{unitId,name}], channelCodes, cells:[{productId, unitId, channelCode, unitPriceSatang|null, source|null, refusal: "PRICE_NOT_SET"|"CHANNEL_NOT_SOLD"|null}]}`. Refusal `{ok:false, code, message, field?, reason?}` — pick the key by `reason` first (`pos.price.errors.<camel(reason)>`: `priceRowDead`, `bulkTooMany` with `{max}`), then `code`.
- **Receipt per branch** (`receipt-settings.ts`): `updatePosReceiptUnitSettings({tenantId, systemId}, actor, {unitId, patch:{taxBranchNo?, address?, phone?}})` → `{ok, unitId, override:{taxBranchNo|null, address|null, phone|null}}` | `{ok:false, code: NOT_FOUND|PERMISSION_DENIED|VALIDATION|UNKNOWN, message, field?: "unitId"|"taxBranchNo"|"address"|"phone"|"patch"}` · reader `receiptUnitOverride(settings, unitId)` (pure, client-safe) · settings shape `settings.pos.receipt.byUnit.<unitId> = {taxBranchNo?: /^\d{5}$/, address? ≤ 200, phone? ≤ 30}`. U needs a thin `"use server"` wrapper (session actor) — none added in S (no S consumer).
- **Reports**: kind `channels` in `posReportAction` / `posReportCsvAction` (via `REPORT_FN`/`KIND_FN`) · overview section `channels` (`OverviewPart<Report<"channels", ChannelRow, ChannelTotals>>`) — `ReportsOverview.tsx` `ALL_SECTIONS` / `ReportsClient.tsx` `KINDS` still list the old kinds (U adds them; `ReportBody` renders nothing for `channels` until then) · label `pos.report.kinds.channels`.
- **Stock**: `posUnitInventoryMap` (server only; U passes `groups[].shared` + unit names to 06/16 notices).
- **Visual states** (brief §9): `products-branch-filter` · `products-branch-copy` · `products-branch-compare` · `products-dead-row-note` · `products-manager-branch` (+ `qc-hf-pos-page-authz` P-7 ORACLE-EDIT in U) · `reports-channels` · `settings-receipt-branch` · `stock-shared-inventory` · `bills-all-branches` — owner + manager{A}, 1440×900 · 1024×768 · 390×844, th/en at merge. Keys for U: `pos.products.branch*` · `pos.reports.channels*` (in this file the namespace is `pos.report.*`) · `pos.settings.receipt.byUnit*`.

## Gates (logs: scratch `p211/gates-r1/*.log`, each headed `tree= head= dirty=`)
Code head for all gates = **f7353edb** (gate run at a21486a9 = f7353edb + ledger + merge of ledger-only 501f78ab; final merge f9185cfe adds ledger only — `git diff --name-only a21486a9 f9185cfe` = ledger/*).

| gate | head | result |
|---|---|---|
| typecheck #1 | f3d1a097 | rc 2 — 1 error (`PosReceiptUnitPatch` type import) → fixed f7353edb |
| typecheck #2 (final) | f9185cfe | **rc 0** |
| fitness no-env / env (qc4) | a21486a9 | 50/50 · 50/50 |
| fitness-pos | a21486a9 | 8/8 |
| qc-pos-p2.11 forced #1 / #2 / unforced | f3d1a097 / a21486a9 / a21486a9 | **31/31 · 31/31 · 31/31** (residue 0 · leaks 0 · guard hits 0 · unforced not skipped) |
| qc-pos-p2.2 | a21486a9 | 41/42 — S3 stale contract pin (CD-1 → re-pinned, 42/42 after fix 1) · ST1 green with the ORACLE-EDIT |
| qc-pos-p2.1 | a21486a9 | 54/55 — **S8 red pre-existing** (CD-1) |
| qc-pos-p2.3 | a21486a9 | 45/46 — **ST4 red pre-existing** (contract sha only; "use server" part green · CD-1) · FU2 behaviour: all P2.3 DB checks green |
| qc-pos-p1.17 | a21486a9 | 40/40 (OV4 PAR) |
| qc-pos-p1.16 | a21486a9 | 28/28 |
| qc-pos-products | a21486a9 | 24/24 |
| qc-pos-p1.18 | a21486a9 | 81/81 (phase U) |
| qc-pos-p1.10 | a21486a9 | 40/40 (P1/P5 green) |
| qc-pos-p1.10u-print | a21486a9 | 8/8 |
| qc-pos-p1.14 | a21486a9 | 30/30 (R16) |
| qc-pos-closeday | a21486a9 | 22/22 |
| qc-pos-p1.8 | a21486a9 | 49/49 |
| qc-pos-p1.1 | a21486a9 | 180/180 |
| qc-pos-p1.3 | a21486a9 | 128/128 |
| qc-hf-pos-page-authz | a21486a9 | 81/81 (P-7 unchanged — ORACLE-EDIT is U) |
| qc-pos-inventory / qc-inventory | a21486a9 | 25/25 · 12/12 |
| qc-pos-p2.9 / qc-pos-p2.5 | a21486a9 | 62/62 · 49/49 |
| qc-pos-p2.8 | a21486a9 | 61/61 (ST6 green — no lane-A file differs) |

### CD-1 (CONTROLLER-DECISION · not edited) — contract-snapshot pins red before P2.11
`qc-pos-p2.2` S3, `qc-pos-p2.1` S8 and `qc-pos-p2.3` ST4 all compare `scripts/pos-sale-contract.json` with an older base; the file changed in **0e9e3144** (P2.9 S, `payMethods[].giftCard{,.number,.pin}`, CD-P29-1 approved 14 Oct). P2.11 does not touch the file (`git diff 5576c15b HEAD -- scripts/pos-sale-contract.json` = empty) and p2.2 S3 is red with the base suite on the base tree too (`--no-db` 11/12 at 33322595). The prompt's "p2.2 42 / p2.1 55" therefore cannot be reached without an ORACLE-EDIT of these three pins (add the 3 giftCard fields / new sha) — that is P2.9's follow-up, outside the approved P2.11 edit (ruling 7/18), so left for the controller.

## Fix round 1 (rulings in `pos-P2.11-review.md` "Controller rulings — fix round 1")
| finding | commit | change |
|---|---|---|
| CD-1 re-pins | 409dc9ae · bd96e593 · c21b6018 | `qc-pos-p2.1` S8 / `qc-pos-p2.2` S3: accept the 3 `payMethods[].giftCard*` fields only when the contract file sha = 72afb258…; `qc-pos-p2.3` ST4 `CONTRACT_SHA_B694` → 72afb258… (old 7a418de17b44… kept in the marker) — S8/S3 had no file sha, so the re-pin is the file-sha gate on the extra-field list; nothing else changed |
| ORACLE-ADD | 4b925e37 · c578a275 (second: drop PR12's B-only case — omitting in-reach A rows deletes them = a real change) | PR10 PR11 PR12, dated marker `ORACLE-ADD ผู้คุม 15 ต.ค. (P2.11 fix รอบ 1 · มติ 1–3 …)` |
| red-before block 2 | 20762bc8 | forced at code f7353edb: **31/34**, red = PR10 (NOT_FOUND) · PR11 (`purgeDead` unknown key ⇒ VALIDATION) · PR12 (MANAGER{A} B-row-first ⇒ PERMISSION_DENIED) — all by reason, no fixture note |
| R1 F3 (ruling 1) | 99821954 | `copyUnitPrices` without `productIds`: products the actor cannot see (single-unit, unit out of reach) are left out of the copy and their source rows counted in `skipped`; with explicit `productIds` still NOT_FOUND |
| hunt L1 (ruling 2) | 9afe7d83 | `setChannelPrices({…, purgeDead: true})` (+ action passthrough): product-wide scope = setPrice + access at every live POS unit (none live ⇒ OWNER/`*`), checked before any write else PERMISSION_DENIED; deletes every dead row of the product (sent or not); non-boolean ⇒ VALIDATION `field purgeDead`; audit after has `via:"purgeDead", purged:[…]`; default unchanged |
| hunt L2 (ruling 3) | 6be822ae | no-change path: ok when the actor has product scope **or** any live branch row of the input is in reach (order-independent) |
| hunt L3 (ruling 4) | ledger | owner line + P2.11U contract line below; no code |
| R1 F2 | ledger | owner line (matrix readable without a POS key, ruling 16) |

P2.11U contract addition: the 06 save should send a precondition of the set it loaded (hash of rows or max `updatedAt`) so a concurrent save is refused instead of silently replaced (hunt L3 · P2.11U or P2.12 — needs a server param then); `purgeDead` = the "ล้างแถวที่เลิกใช้" action of `products-dead-row-note` (show only when the actor has product-wide scope).

ORACLE-EDIT / ORACLE-ADD list: f3d1a097 `qc-pos-p2.2` ST1 filter (ruling 18) · 409dc9ae `qc-pos-p2.1` S8 · bd96e593 `qc-pos-p2.2` S3 · c21b6018 `qc-pos-p2.3` ST4 (CD-1) · 4b925e37 + c578a275 `qc-pos-p2.11` PR10–PR12 (fix 1).

### Gates after fix 1 — one systemd-run unit (`iso.sh` → `p211-gates-unit.sh`), head **34b060ea** (code **6be822ae**), dirty=0 · logs scratch `p211/gates-f1/*.log`
| gate | result |
|---|---|
| typecheck | rc 0 |
| fitness no-env / env (qc4) · fitness-pos | 50/50 · 50/50 · 8/8 |
| qc-pos-p2.11 forced ×2 / unforced | **34/34 · 34/34 · 34/34** (residue 0 · leaks 0 · guard hits 0) |
| qc-pos-p2.2 / p2.1 / p2.3 | **42/42 · 55/55 · 46/46** (CD-1 re-pins) |
| qc-pos-products / p1.18 / hf-pos-page-authz | 24/24 · 81/81 · 81/81 |
| qc-pos-p1.17 / p1.10 | 40/40 · 40/40 — receipt code unchanged since f7353edb (`git diff f7353edb HEAD -- receipt*.ts` empty) |
| qc-pos-p2.8 | 61/61 |
Earlier CD-1-only re-run (head c21b6018): p2.1 55/55 · p2.2 42/42 · p2.3 46/46 · typecheck 0.

## Hunter focus (money lane, ruling 10)
`setChannelPrices` out-of-reach classification (dead vs permission, all checks before first write, kept rows not re-written) · `copyUnitPrices` permission at target + from access · `unitPriceMatrix` = `priceOf` (no write) · `reportChannels` sums vs bills (refund commission share sign) · receipt identity order (`receipt.ts:301–303`) · `updatePosReceiptSettings` keeping `byUnit`.

## Visual states for the controller
None for S (U card — brief §9 list above).

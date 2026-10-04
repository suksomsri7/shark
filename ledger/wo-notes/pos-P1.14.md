# POS P1.14 S — builder notes (stock count from the POS + receive / transfer / adjust shortcuts)

Builder S · cloud run · 4 Oct 2026 · branch `p114-local` (= `wip/pos-p1.14-oracle` 6e6983cb + merge of `origin/session/pos`) → pushed to `wip/pos-p1.14`.
Brief `ledger/pos-briefs/pos-brief-P1.14.md` (R1–R16 ratified · owner Q1/Q2 = defaults: no PO receive from the POS, no ledger posting of variance). Oracle `scripts/qc-pos-p1.14.mts` (30 checks, not edited).
No DB here: no DB run, no `prisma migrate`. Controller runs the DB oracle on the VPS (QC4) after `prisma migrate deploy` of the new migration.

## Migration (`prisma/migrations/20261127000000_pos_p114_stock_count/migration.sql`)
- Additive only: `CREATE TYPE` ×2 (`PosStockCountStatus` OPEN/CONFIRMED/CANCELLED · `PosStockCountScope` ALL/CATEGORY) · `CREATE TABLE` ×3 (`PosStockCount`, `PosStockCountLine`, `PosStockCountEntry`) · 7 indexes from Prisma (`@@unique([tenantId, openKey])`, `@@unique([unitId, countNo])`, `@@index([tenantId, unitId, status])`, `@@unique([countId, itemId])`, `@@index([tenantId])`, `@@unique([tenantId, idempotencyKey])`, `@@index([countId])`).
- Hand SQL at the end: `CREATE UNIQUE INDEX "PosStockCount_open_location_key" ON "PosStockCount"("inventorySystemId", "locationId") WHERE "status" = 'OPEN'`.
- Everything under `SET lock_timeout = '3s'` is verbatim `prisma migrate diff --from-schema <schema before P1.14> --to-schema prisma/schema --script` (diff re-run after writing = only the hand partial index differs). No ALTER of any existing table, no FK, no DROP/RENAME/SET NOT NULL.
- `scope.ts`: `PosStockCount: sys()`, `PosStockCountLine: tenant`, `PosStockCountEntry: tenant` (head of MODULE_SCOPES next to P1.9/P1.9b). `prisma generate` run.

## Steps / commits
| step | commit | content |
|---|---|---|
| S1 | cf05b982 | schema (pos.prisma) + migration + scope.ts |
| S2 | b1ae4bae | `inventory/service.ts`: `adjustInTx(tx, ctx, input)` extracted from `adjust` (same statements, where-clauses use `scope(ctx)` = what `tenantDb` injected; `adjust` = `withStockRetry` + tx + `adjustInTx` + AccountProduct sync — external behaviour identical, `bulkCount` untouched). `AdjustInput` + optional `sourceModule/refType/refId` (omitted → null, as before). Additive exports `syncAccountProductAfterTx(ctx, itemId)`, `isStockContention(e)`. |
| S3 | 7f265fba | `pos/stock-count.ts` (9 functions) · `pos/stock-count-shared.ts` (13 codes, th/en, limits, views) · `permissions.ts` `pos.stock.count` · `outbox-consumers.ts` no-op consumer `pos.stockCount.confirmed` · `automation/labels.ts` label (append-only hunks marked `POS P1.14 ▸ … ◂`) |

Checks on the final head (each step re-ran them): `NODE_OPTIONS=--max-old-space-size=5632 pnpm typecheck` exit 0 · `env -u DATABASE_URL -u DIRECT_URL pnpm fitness` 41/41 exit 0 · `scripts/fitness-pos.mts` 8/8 · `qc-pos-p1.14 --no-db` **7/7** exit 0 (base was 1/7) · `--list` 30 ids · `--no-db`: p1.17 6/6 · p1.9b 8/8 · p1.9 13/13 · p1.4 13/13 · p1.5 5/5.
Not touched: `src/lib/actions/pos.ts`, legacy `register-ui.tsx`, `account/service.ts`, `ai/proposals.ts`, `.env*`, `scripts/*-expected.json`, fixtures.

## Expected DB run (QC4, after migrate deploy)
Unforced: no SKIP (file, delegates, columns all present) → **30/30, exit 0**; `QC_FORCE=1` identical. Second run the same (all rows tagged + cleaned).
| check | expected | traced through |
|---|---|---|
| ST1–ST7 | green | `--no-db` 7/7 here |
| OC1 | green | open ALL default loc: lines = PRODUCT & archivedAt null (A,B,N,C,U,W); snapshot via `locQtyMap` (no rows + default → onHand) |
| OC2 | green | restoCat → category count ≠ → VALIDATION · `[]` · ALL+ids · `hack` · `SOME` · key "short" → VALIDATION before any write; CATEGORY catA → A,B,N |
| OC3 | green | new key → COUNT_ALREADY_OPEN+countId (checked in tx after per-unit advisory lock) · same key → `prior()` duplicated · loc2 → countNo+1 blind · race: advisory lock serialises, losers see OPEN; partial unique is the backstop (P2002 → re-read) |
| RE1 | green | SET 9 / ADD 1 / SET 8, expected 10 (locQty under item lock), 3 entries byUserId owner |
| RE2 | green | barcode → A (19, exp 20) · SKU → C · unknown → UNKNOWN_CODE · S/X by code and X/resto by itemId → NOT_IN_COUNT (lookup includes services/archived) · +2 entries |
| RE3 | green | label 21 WEIGHT → PosProduct scalePlu → W, 1250 g · ADD 3000 → 4250 · `weighed` from PosProduct.soldByWeight · label+qty → VALIDATION |
| RE4 | green | replay (countId/mode/code/itemId/qty equal) → duplicated · qty 3001 → IDEMPOTENCY_CONFLICT · 10 bad inputs → VALIDATION before count lookup |
| RE5 | green | 8 lanes: count FOR SHARE → line FOR NO KEY UPDATE (locking read returns the newest row) → 8 / 8 entries |
| AB1 | green | createSale cuts after commit (awaited) → exp 18 |
| AB2 | green | exp C 8, variance 0; invariant holds — `snapshotAt`/`countedAt` are app-clock `new Date()` like Prisma's `InvMovement.createdAt` |
| PM1 | green | sell-only DENIED · counter records, cannot confirm (needs `inventory.movement.adjust`) nor cancel the owner's count · STAFF of u2 on u1 → `evaluate` unit check → DENIED · u2 → NO_INVENTORY · other unit/tenant → NOT_FOUND · blind hides for counter only |
| CF1 | green | count FOR UPDATE → lockItemsInTx(sorted) → `adjustInTx(newQty = locked onHand + variance)` → A 11, B 8, C 10 (var 0, no movement), W 4250, N 8, U untouched; keys `pos-count-<count>-<item>`, POS/PosStockCount/countId, location = count location |
| CF2 | green | NOTHING_COUNTED (SKIP, none counted) · C NOT_IN_COUNT · A exp 11 · ZERO → B 0 (var −7), N 0, A 10 |
| CF3 | green | 1 outbox row `PosStockCount#<id>#CONFIRMED` (countedLines 5, adjustedLines 4, varianceValueSatang = Σ var×line.costSatang, unit u1, system POS) · 1 audit · replay → duplicated from frozen lines, nothing written |
| CF4 | green | new-key confirm / record / cancel on CONFIRMED → COUNT_NOT_OPEN, row untouched |
| CF5 | green | 6 lanes: 1 OK, 5 wait on FOR UPDATE then COUNT_NOT_OPEN; B 7, one ADJUST, one event |
| CA1 | green | exp at loc2 = 2 · blank reason VALIDATION · CANCELLED + audit · replay dup · record/confirm COUNT_NOT_OPEN · reopen OK |
| SH1 | green | `inventory.receive` key `pos-recv-<k>`, POS/PosUnit/u1, cost = current average · dup by movement-key pre-lookup · code → barcode · service NOT_STOCKED · qty 0 VALIDATION · counter DENIED · audit `pos.stock.receive` |
| SH2 | green | `inventory.transfer` key `pos-tf-<k>` · dup via `-out` pre-lookup · from=to VALIDATION (checked before location lookup) · resto location NOT_FOUND · DENIED |
| SH3 | green | own tx: lockItemsInTx → key re-check → `adjustInTx(onHand+delta)` key `pos-adj-<k>`, note = reason · dup by pre-lookup (qtyDelta compare, so replay never conflicts on balanceAfter) · VALIDATION ×3 · DENIED |
| RF1 | green | every function wrapped in `guard` (never throws); 11 provokable codes all hit |
| Z1/Z2 | green | all rows tagged by sandbox units/systems; audits carry unitId u1; default location created via inventory is deleted with the system |

Inventory oracles in the acceptance list (`qc-inventory`, `qc-inventory-item`, `qc-inventory-account`, `qc-lot`, `qc-hf-inventory-atomic`, `qc-hf-inventory-authz`, `qc-pos-inventory`): expected unchanged (adjust statement sequence identical) — CONTROLLER-RUN.

## Rules I had to invent (controller to ratify)
1. STAFF without access to the ctx unit → `PERMISSION_DENIED` (via `evaluate`), not NOT_FOUND as in shift.ts (oracle PM1 requires DENIED).
2. `NO_INVENTORY` only for open and the 3 shortcuts; record/confirm/cancel/get/list use the count's stored `inventorySystemId`.
3. Replays: the key lookup comes before the status check, so replaying a record/confirm/cancel key after the count closed still returns `duplicated`. Record replay equality = same countId, mode, code (or null), itemId (if sent), qty (if sent).
4. Record: `itemId` requires `qty`; a matched scale label forbids `qty`; a PRICE label needs `basePriceSatang > 0` (per-kg) else VALIDATION; a 13-digit code that parses as a label but matches no weighed product falls through to barcode → SKU (then `qty` is required). Several InvItems with the same barcode: the one with a line wins. Accumulated `countedQty` above 2,000,000,000 → VALIDATION. Codes ≤ 128 chars.
5. `snapshotAt` and `countedAt` use the app clock (`new Date()` inside the tx, `countedAt` after the item lock) instead of DB `now()`, to compare with Prisma-generated `InvMovement.createdAt` (R6 invariant).
6. Open with no `locationId` calls `inventory.ensureDefaultLocation` (may create "คลังหลัก", same as any first stock write). Lines are created even if the inventory has 0 products (count with 0 lines; confirm → NOTHING_COUNTED).
7. Confirm `ZERO` with nothing counted is allowed when the count has lines (all become 0); NOTHING_COUNTED only when there is nothing to apply. Lines processed in itemId order. Audit `after` carries the summary; payload exactly R10.
8. No audit row on open / record (entries are the audit trail); audits on confirm, cancel, shortcuts only.
9. Shortcuts: `code` resolves barcode → SKU only (scale labels are not used for receive/transfer/adjust); unknown `itemId` → NOT_FOUND; archived or SERVICE → NOT_STOCKED. Duplicate detection = pre-lookup of the namespaced movement key (receive: same item/IN/qty; transfer: same item/qty/from/to; adjust: same item/ADJUST/qtyDelta) else IDEMPOTENCY_CONFLICT. A concurrent same-key receive can still write a second audit row (inventory returns the old movement silently) — stock is never doubled.
10. `posReceiveStock`: `costSatang` 0…2,000,000,000; `lotCode` ≤ 64; `expiryDate` = ISO string and only with `lotCode`. `posAdjustStock`: `locationId` optional (default location), retries once on lock contention then `STOCK_BUSY`.
11. `getStockCount` lines sorted by item name (th) then id; `summary` and the VARIANCE filter use the real numbers even when blind hides them. `listStockCounts`: default limit 20, max 100, newest `countNo` first.
12. Inventory additive exports `syncAccountProductAfterTx` and `isStockContention` (needed for R7.6 and STOCK_BUSY mapping).
13. Texts: permission `pos.stock.count` = "ตรวจนับสต็อกจากหน้าขาย (เปิดรอบ · สแกน/กรอกจำนวน · ยกเลิกรอบที่ตัวเองเปิด)"; automation label "เมื่อยืนยันผลตรวจนับสต็อก (POS)".

## Next
Controller: `prisma migrate deploy` on QC4 → `qc-pos-p1.14` unforced + forced ×2 → inventory/POS acceptance suites → reviewer/hunter (R6 races, C-1) → card U (05ค, 16).

## R2 — controller rulings F1–F4 (builder · 4 Oct 2026 · pushed to `wip/pos-p1.14-r2`; `wip/pos-p1.14` untouched, pinned by the VPS run)
| fix | commit | change (`pos/stock-count.ts` · `pos/stock-count-shared.ts`) |
|---|---|---|
| F1 | a2017e7f | confirm tx has its own `timeout: 120_000` (maxWait 10 s unchanged; other txs stay 30 s). New code `COUNT_TOO_LARGE` (14th code, th/en in `STOCK_COUNT_MESSAGES`, `STOCK_COUNT_CONFIRM_MAX_LINES = 2_000`): under the count FOR UPDATE, if the lines to apply (counted, + uncounted when ZERO) exceed 2,000 → refusal as data, rolled back **before** `lockItemsInTx`; count stays OPEN. Checked after NOTHING_COUNTED. |
| F2 | bb2250bb | caller under blind (`c.blind && !canAdjust`) → `summary.withVariance = null` (type now `number \| null`) and `filter: "VARIANCE"` → VALIDATION (checked after the count lookup, so NOT_FOUND still wins). Supersedes notes rule 11 ("summary and VARIANCE filter use the real numbers even when blind"). Oracle has no assertion on `summary`/`VARIANCE` → no conflict. |
| F3 | 2cdc832d | `afterCommit(what, ids, fn)`: post-commit `syncAccountProductAfterTx` (confirm loop + posAdjustStock) and `shortcutAudit` (receive/transfer/adjust) are try/catch → `console.warn` with ids + error code/name only; the call still returns ok. |
| F4 | a2cfa0cf | confirm: after `lockItemsInTx`, every target line's item is re-read with `kind`/`archivedAt`; missing, non-PRODUCT or archived → `NOT_STOCKED` with `itemId` (new optional field on `StockCountRefusal`), tx rolled back, count stays OPEN (user cancels; no remove-line function in P1.14 — card U shows the item name from the line). The old `throw new Error("…item missing")` → INTERNAL path is gone. |

Checks on R2 head (re-run after each fix): typecheck exit 0 · `env -u DATABASE_URL -u DIRECT_URL pnpm fitness` 41/41 · `fitness-pos` 8/8 · `qc-pos-p1.14 --no-db` 7/7 (30 registered). Oracle not edited. RF1 unaffected (COUNT_TOO_LARGE is not provoked; it is in `STOCK_COUNT_REFUSAL_CODES`, so a sighting would not be flagged).

### Notes (no code)
- **N3 (next to R6):** the add-back rule is exact for SET, and for ADD entries with no sale between them. ADD entries interleaved with sales: each ADD re-snapshots `expectedAtCount` under the item lock, so stock sold *between* two ADD scans of the same shelf is subtracted once via the sale and once via the moved expected — a counter who scans part of a shelf, a sale happens, then scans the rest with ADD, can under-state by the sold qty. Mitigation for U: prefer SET for the final figure / don't sell from a shelf mid-scan; documented limit, not fixed.
- **N6:** back-office `bulkCount` / `adjust` on an item while a POS count for its location is OPEN is not seen by the count; confirm then applies `onHand + (counted − expectedAtCount)` on top, i.e. the back-office correction and the count both land (double-apply). Card U should warn on the count screen ("มีรอบตรวจนับเปิดอยู่") and/or a follow-up guard in inventory (refuse or warn on `bulkCount`/`adjust` for a location with an OPEN `PosStockCount`) — follow-up WO, not P1.14.
- **N7 (int4 edge):** `countedQty` accumulation is capped at 2,000,000,000 and per-entry qty at 10,000,000, but `onHand + variance` at confirm and `variance × costSatang` (`varianceValueSatang`, JS number → outbox JSON) are not range-checked: an item near the int4 limit could make `adjustInTx` fail (→ INTERNAL, tx rolled back, nothing written) and very large value sums lose integer precision beyond 2^53 only in theory. Acceptable at shop scale; note for a later bound check.

# POS P2.5 S — split bill (ITEM · EQUAL · SEAT) · move/merge tables · pre-bill · builder notes

Builder S · VPS (account B) · 14 Oct 2026 · tree `/root/projects/shark-pos-c` · branch `wip/pos-p2.5` from the oracle `wip/pos-p2.5-oracle` **e50c132b** + merge `origin/session/pos` ebfb1e67 (ledger-only, contains 057a2bae).
Contract: `ledger/pos-briefs/pos-brief-P2.5.md` §0–§9 + §10 rulings 1–12 + **§11 rulings 1–13** · oracle `scripts/qc-pos-p2.5.mts` (40 checks · **not edited**) + names table `ledger/wo-notes/pos-P2.5-oracle.md`.
Red-before (oracle notes): 5/40 forced on c1a256ef (L1–L3 Z1 Z2).

## Migration (QC4 only)
`prisma/migrations/20261210100000_pos_p25_split/migration.sql` — hand-written from `prisma migrate diff` (base e50c132b schema → new schema): `SET/RESET lock_timeout '3s'` · 3 enums in `DO $$ … duplicate_object` · `CREATE TABLE IF NOT EXISTS` PosTableSplit / PosTableSplitPart / PosTableSplitLine · indexes incl. **`PosTableSplit_session_open_key` UNIQUE ("sessionId") WHERE status='OPEN'** and **`PosTableSplitPart_saleId_key` UNIQUE ("saleId") WHERE "saleId" IS NOT NULL** · `@@unique([splitId, no])`. **No FK at all** (loose ids — none to TableSession/RestaurantOrderItem/PosSale, and none between the three tables, so every statement is idempotent and the oracle's DO-block rule holds). Schema: `prisma/schema/pos.prisma` (no @relation). Scope: `PosTableSplit: sys()`, Part/Line `tenant` (ruling 11.3). `POS_MODELS` +3.
Deploy (`bash scripts/iso.sh bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec prisma migrate deploy`, 14 Oct ~18:4xZ, `scratchpad/p25/runs/migrate-deploy.log`):
```
Datasource "db": PostgreSQL database "neondb", schema "public" at "ep-frosty-lab-aoylqlv8.c-2.ap-southeast-1.aws.neon.tech"
176 migrations found in prisma/migrations
Applying migration `20261210100000_pos_p25_split`
All migrations have been successfully applied.   (exit 0)
```
`pnpm exec prisma generate` in tree c (own node_modules). QC5 not touched (controller).

## Steps (commit per step · one-pass build — only the head is gated)
| step | commit | content |
|---|---|---|
| 1 | 7877d5a4 | migration + schema + scope + POS_MODELS |
| 2 | a4201c02 | pure `pos/table-split-shared.ts` (`allocateTableSplit` · LR ties→lower · EQUAL ruling 11.1) — `--no-db` M6 green |
| 3 | b31e5d84 · f3e19d82 | `pos/table-split.ts` (create/replace/cancel/detail + in-tx helpers) · 7 codes (`register-shared.ts`) · facade block `restaurant/index.ts` + `restaurant/pos-tables.ts` · `table-shared.ts` additive types · PIN override audit |
| 4 | ba22ce4e | `register.ts` part quote/submit (`tableSplitPartId`/`expectedSplitVersion`) · share lines · fixed service · `regSubmitSplitPart` · TABLE_SPLIT_OPEN guards · `registerTableBillPreview` |
| 5–6 | 419000b6 | `pos/table.ts` void hunk · `registerMoveTable` · `registerMergeTables` · floor/detail `split` · cancel-item guard · `held-cart.ts` draft helpers |
| 7 | 7212ca0b | `pos/pre-bill-render.ts` (+ `registerTablePreBill` in 419000b6) |
| 8a | ebfbde63 | `table-split-actions.ts` (6 doors) · `pos.json` th/en · owner lines |
| — | 86392e7d | comment wording (qc-pos-p2.6 ST3 counts raw `ticketForSale` tokens) |
| merge | fbad0b15 | `origin/session/pos` a477c9e5 (ledger-only; P2.9 S **not yet merged** upstream — see Status) |

## Hunks (file:line at fbad0b15 · every foreign/shared hunk marked `POS P2.5 ▸ … ◂`)
- New files: `pos/table-split-shared.ts` (pure allocator + view/input types) · `pos/table-split.ts` (plan doors + in-tx helpers) · `pos/pre-bill-render.ts` (pure) · `pos/table-split-actions.ts` ("use server", 6 doors) · migration dir.
- `pos/register.ts`: imports :433 · REG_MESSAGE 7 codes :593 · parsed types :1103–1105 (`share`, `RegSplitBill`) · REG_QUOTE_KEYS :1119 · REG_SUBMIT_KEYS (`expectedSplitVersion` on the first line, away from P2.9's REG_PAY_KEYS) :1127 · cart field :1133 · regParseCart split block :1224 · regPrice share lines :1477 + fixed service/cap :1579 · `regFixedServiceCharge` :1662 · regTableLines TABLE_SPLIT_OPEN :1703 · regTableOut `split` + `regSplitCart` + `registerTableBillPreview` :1741–1871 · quote doors :1887/1910/1963/2011/2053 · parsed submit :2104/2132 · regParseSubmit :2208 · regSameSubmission :2239 · submit load/stage/dispatch :2372/2437/2492 · regSubmitTable in-tx guard :2779 · `regSubmitSplitPart` :2832 · registerPriceTableRound :2955. **Not touched:** P2.9 regions (pay-row parsing, REG_PAY_KEYS, REG_MESSAGE tender lines, submit tender block, createSale payMethods mapping, `./service` import line); `git merge-tree` against `origin/wip/pos-p2.9` 2612ee53 → code auto-merges (only `ledger/POS-OWNER-PENDING.md` conflicts — append both).
- `pos/register-shared.ts`: codes :210 · `tableSplitPartId` + `RegisterQuoteSplit` :332–337 · quote `split` :400 · `expectedSplitVersion` :444 · REFUSAL_KEY :921.
- `pos/table.ts`: imports :34–36 · floor `split` :116/142 · detail `split` :194/233 · cancel-item guard :483 · **void consumer hunk inside `tableSaleVoided` :637** · move/merge/pre-bill :658–843.
- `pos/table-shared.ts` :98–101/140 (additive optional `split`) · `pos/held-cart.ts` :390–400 (`heldTableDraftSessions`, `repointTableDraftsInTx`).
- `restaurant/pos-tables.ts` :485–663 (`lockTableSessionInTx`, `tableItemsByIdsForPos`, `tableItemNamesForPos`, `unlinkTableItemsInTx`, `moveTableSessionInTx`, `mergeTableSessionsInTx`) · `restaurant/index.ts` :76–87 (one `POS P2.5 ▸ … ◂` block). Legacy `moveSession`/`mergeSession` and all L1-pinned exports untouched.
- `core/scope.ts` :347 · `scripts/pos-qc-env.mts` :179–182 · `src/messages/{th,en}/pos.json` (`register.errors.*` ×7 after `versionChanged` · `tables.split|move|merge|preBill` 61 keys, same set th/en, en has no Thai incl. no "฿") · `ledger/POS-OWNER-PENDING.md` (7 P2.5 lines).
- Not touched: `createSale`/`service.ts`, `scripts/pos-sale-contract.json` (sha 7a418de1…97cd), `outbox-consumers.ts` (void consumer already wired; change is inside `tableSaleVoided`), `restaurant/table.ts`, `restaurant/order.ts`, `kds.ts`, `giftcard/**`, tree b, the oracle.

## Deviations / decisions (numbered · ruling refs)
1. **Replace (splitId + expectedVersion) uses the plan's own item set; `expectedItemsHash` is not compared on replace** (names row 13 states the hash rule for the session's unpaid items). While a plan is OPEN the whole-table quote is refused (P3 · R5) so the client has no whole-table hash — the oracle sends `"none"` for every replace (M2/M4/P4) and for the duplicate create (P4 `TABLE_SPLIT_EXISTS`). Order: create = OPEN plan ⇒ `TABLE_SPLIT_EXISTS {splitId, version}` before the hash check; replace = `TABLE_SPLIT_NOT_FOUND` → `TABLE_SPLIT_LOCKED` → `VERSION_CHANGED` → plan items still unpaid (else `TABLE_ITEMS_CHANGED`) → allocate → cap. Rounds sent after the plan stay outside a replaced plan too.
2. **Move/merge lock order = session rows FOR UPDATE (id order) → table advisory locks (sorted)** (R7/R8 text lists advisory → session). Reason: the P2.4 void consumer (`unlinkTableSaleInTx`, fix 4 H1) and the new `unlinkTableItemsInTx` lock session → advisory; the reverse order in move/merge would form a 2-lock cycle with a concurrent void. Ruling 11.2 holds (no item rows; pay keeps items → part → session). C5(a)(b) and C6 green.
3. **EQUAL with service off: negative per-part service.** Ruling 11.1 (`s_i = t_i − b_i + d_i`) can give s_i = −1/−2 satang when the shop's service charge is 0 (e.g. 124,000 ÷ 3 ⇒ s = [0, −1, +1]). The plan stores s_i exactly (pure result); the sale books `serviceChargeSatang = max(0, s_i)` and moves a negative s_i into the bill discount (`tableSplitSaleAmounts`) ⇒ sale grand = t_i to the satang. Owner line added.
4. **Part quote is lenient, submit is strict.** Quote/pre-bill of a part build lines from the plan + item snapshots even if an item was cancelled/paid outside the plan (P6 pays such a part through quote → submit and expects `TABLE_ITEMS_CHANGED` at submit with no rows written); submit re-checks against live unpaid items before pricing and claims them `FOR UPDATE` in the tx.
5. Part member: the bill's member = the part's `memberId`; a client `memberId` must equal it (else `VALIDATION`) — the pay dialog sends it with `memberChoices` (regParseCart still requires memberId for choices). Coupon/choices on a part without member ⇒ `VALIDATION` (M7).
6. Part pay ignores the payer's discount cap (cap checked when the plan is saved, ruling 5 / R5); `heldCartId` with a part ⇒ `VALIDATION`; manager PIN on the plan writes `pos.discount.override {via:"pin", splitId}`.
7. Whole-table pre-bill while a plan is OPEN ⇒ `TABLE_SPLIT_OPEN` (same code path as the quote, R9 "totals = the table quote"). Part pre-bill works. Shop name = receipt header name ?? tenant name ?? unit name; branch = unit name. `discountSatang` = subtotal − net (line + bill + coupon + member).
8. `registerSplitDetail` returns the OPEN plan, else the latest DONE plan, else `null` (outsideItemIds `[]` when null). Replace deletes and recreates part/line rows (part ids change — U re-reads). Cancel of a CANCELLED plan = `ok` (idempotent). `TOO_MANY_LINES` = pure (>200 items) + any part > 200 sale lines.
9. Merge: `guestCount` = Σ non-null (all null ⇒ null) · member = into ?? first from (input order) · from tables dirty only if not the into table · single from-draft re-pointed (version + 1) in the same tx · audits `pos.table.move` / `pos.table.merge` / `pos.table.split.save|cancel` / `pos.table.preBill` (prisma `AuditLog`, no outbox).
10. Rounds follow the session (ruling 11.5): `RestaurantOrder` has no table column — `kdsBoard` already reads `session.table.name` (T1 label N2); no code needed.

## CONTROLLER-DECISION (oracle NOT edited)
- **CD-P25-B1 — M4 control quote conflicts with P3.** M4 creates the 10 % plan on A3 and *then* runs its control `wq(s.sid, {billDiscount 10%})` expecting `ok` 122760; P3 (and R5/ruling 6/names row 15) require a whole-table quote while a plan is OPEN to be `TABLE_SPLIT_OPEN`. Both cannot hold (on the base the control passed only because no plan was created). **Proposal ORACLE-EDIT (2 lines moved, no assertion changed):** run the control quote before `mkSplit` in M4 (`qc-pos-p2.5.mts:1660–1661` → before `:1652`). Positive control: scratch copy with exactly that move (+ absolute `pos-qc-env` import so it runs from the scratchpad) on head fbad0b15 → **40/40 · PAR 3/3 · residue 0 · exit 0** (`scratchpad/p25/gates/p25-oracle-edit-B1.log`). Unmodified oracle: **39/40** (M4 only) forced ×2 + unforced.

## Drift vs the names table
No rename. Additions beyond the table (all additive): facade `lockTableSessionInTx`, `tableItemsByIdsForPos`, `tableItemNamesForPos`, `PosMergeSession`; `table-split.ts` in-tx helpers (`splitPartForPay`, `lockSplitPartInTx`, `checkSplitPlanInTx`, `markSplitPartPaidInTx`, `releaseSplitPartInTx`, `splitPartOfSale`, `openSplitOfSession`, `openSplitSessions`, `itemInOpenSplit`, `splitSummariesOf`); `register.ts` `registerTableBillPreview`; `table-split-shared.ts` `largestRemainderSplit`, `tableSplitShareName`, `tableSplitSaleAmounts`, `TABLE_SPLIT_MAX_ITEMS`, `TABLE_SPLIT_MAX_PART_LINES`; `PRE_BILL_LABELS` carries extra label keys (part/table/guests/…); payload adds `locale` (in row 21) only.

## P2.5U contract (mockups 15B/15C + 03 · no JSX in S)
Actions `src/lib/modules/pos/table-split-actions.ts` (args `{systemId, unitId, deviceId?}` + input · refusals `{ok:false, code, message}` → `refusalMessageKey(code)` → `pos.register.errors.*`):
- `registerSplitTableAction({split: RegisterSplitTableInput})` → `{split: SplitPlanView}` (types in `table-split-shared.ts`). Create: `{tableSessionId, mode ITEM|EQUAL|SEAT, partCount 2..20, expectedItemsHash = whole-table quote.table.itemsHash, allocations?: [{itemId, partNo | null (กลางโต๊ะ, SEAT), qty}], billDiscount?, parts?: [{no, label?, memberId? (null = none)}], managerPin?/managerUserId?}`. Replace: same + `splitId` + `expectedVersion` (hash ignored). Preview on the client with `allocateTableSplit` (pure) — server values win. Refusals: `TABLE_SPLIT_EXISTS` (+ top-level `splitId`, `version` ⇒ reload), `VERSION_CHANGED`, `TABLE_SPLIT_LOCKED`, `TABLE_ITEMS_CHANGED`, `VALIDATION` ("ยังมีรายการที่ยังไม่ได้เลือกบิล/ที่นั่ง" · empty bill), `TOO_MANY_LINES` ("แยกเป็นรายรายการ"), `DISCOUNT_EXCEEDS_LIMIT` (PIN), `BILL_DISCOUNT_EXCEEDS_TOTAL`.
- `registerCancelSplitAction({splitId, expectedVersion})` · `registerSplitDetailAction({tableSessionId})` → `{split | null, outsideItemIds}` (`split-new-items` = outsideItemIds.length).
- `SplitPlanView.parts[]`: `{id, no, label, memberId, base/discount/serviceCharge/total/vatSatang, status OPEN|PAID, saleId, lines[{itemId, name ("<item> (u/N)" for shares), qty | null, shareNum, shareDen, amountSatang, stockOwner}]}` — 15B bill cards, 15C seat rows, "บิล 1 ✓ เงินสด" via `saleId` (bills drawer).
- **Part pay** = existing pay dialog: `quoteRegisterCartAction({cart:{lines: [], tableSplitPartId, memberId?: part.memberId, couponCode?, memberChoices?}})` → normal totals + `table` + `split {splitId, partId, partNo, partCount, version}` → `submitRegisterSaleAction({sale:{lines: [], tableSplitPartId, expectedSplitVersion: quote.split.version, idempotencyKey, expectedGrandTotalSatang, payMethods, cashReceivedSatang, tipSatang?, taxInvoice?, staffToken?, …}})`. `TABLE_SPLIT_PART_PAID` (other device) · `VERSION_CHANGED` / `TABLE_SPLIT_NOT_FOUND` (plan edited/cancelled ⇒ reload) · `TABLE_ITEMS_CHANGED` · `TABLE_SESSION_CLOSED`. No `billDiscount`/`channelId`/`heldCartId`/`tableSessionId` with a part.
- Whole-table checkout while a plan is OPEN ⇒ `TABLE_SPLIT_OPEN` — 03 button becomes "ชำระทีละใบ · เหลือ ฿…" from `registerTableDetailAction().split {splitId, mode, paidParts, partCount, remainingSatang}`; floor card `split {paidParts, partCount}` ("แยกบิล 2/4"). Cancel item on a plan item ⇒ `TABLE_SPLIT_OPEN`.
- `registerMoveTableAction({tableSessionId, toTableId})` → `{changed, reservationOverridden?}` (`TABLE_BUSY` "ใช้รวมโต๊ะแทน" · `TABLE_INACTIVE` · toast `tables.move.kitchenNote`) · `registerMergeTablesAction({intoSessionId, fromSessionIds 1..5})` → `{changed}` (`TABLE_HAS_DRAFT` · `TABLE_SPLIT_OPEN`). Keys `restaurant.session.move|merge` (CASHIER without them ⇒ `PERMISSION_DENIED`).
- `registerTablePreBillAction({tableSessionId | tableSplitPartId, locale?, copy?})` → `{payload: PreBillPayload}` → `renderPreBillHtml(payload, {paper, locale})` (preview / browser print) or `renderPreBillEscPos(payload, {paper, thaiText, locale})` (device receipt printer, same transports as receipts). One audit row per call.
- Messages `pos.tables.split|move|merge|preBill.*` (th/en, 61 keys) + `pos.register.errors.tableSplit*|tableBusy|tableHasDraft`. Visual states for the controller: §9 list (`tbl-panel-actions`, `split-items`, `split-equal`, `split-seat`, `split-locked`, `split-new-items`, `move-sheet`, `merge-sheet`, `prebill-preview`).

## Gates (final set on head **fbad0b15** = code 86392e7d + ledger merge · logs `scratchpad/p25/gates/*.log`, each first line `tree=/root/projects/shark-pos-c head=fbad0b15 dirty=0`)
| gate | result |
|---|---|
| typecheck (iso · pos-gate.lock · 5632 MB) | exit 0 |
| fitness no-env / env (qc4) · fitness-pos | 50/50 · 50/50 · 8/8 (contract sha unchanged) |
| qc-pos-p2.5 forced #1 / #2 / unforced | **39/40 · 39/40 · 39/40** — M4 only (CD-P25-B1) · PAR 3/3 · SKIP 0 · residue 0 · leaks 0 |
| qc-pos-p2.5 scratch copy with CD-P25-B1 edit only (positive control) | **40/40** · residue 0 · exit 0 |
| qc-pos-p2.5 --no-db | 7/7 |
| qc-pos-p2.6 | 67/67 |
| qc-pos-p2.8 | 60/61 — ST6 PAR (`register.ts` changed vs merge-base · ruling 11.11: accepted on wip, re-run at merge) |

Pre-merge regression run on head **f3e19d82** (code identical to 86392e7d except one comment line in `register.ts`; logs `scratchpad/p25/gates-pre/*.log`, header `head=f3e19d82 dirty=0`): qc-pos-p2.4 **50/50** · qc-hf-tx **22/22** · qc-pos-p1.3 **128/128** · qc-restaurant 6/6 · -money 6/6 · -pay 19/19 · -void 11/11 · qc-pos-p1.6 **48/48** (call-site registry unchanged) · qc-pos-p1.8 49/49 · qc-pos-p1.10 **40/40** · qc-pos-p1.18 81/81 (ST7 0) · qc-hf-pos-page-authz 81/81 · qc-pos-p2.3 46/46 · qc-pos-p1.12 72/72 · qc-pos-p1.13 33/33 · qc-pos-p1.15 39/39 · qc-pos-p1.16 28/28 · qc-pos-p1.1 **180/180** · (qc-pos-p2.6 66/67 there — ST3 counted a `ticketForSale` word in a comment → fixed in 86392e7d → 67/67 above).
Not run yet: **qc-pos-p2.9** (P2.9 S not merged into `session/pos`).

## Follow-ups
- F1 Report qty per product counts shares (P2.12) · share-line refund with restock (owner line).
- F2 Orphan HELD drafts sweep (P2.4 F2) → P2.11 (ruling 11.12).
- F3 Guest QR of a moved/merged table opens a new session (P2.7).
- F4 Part voided after the table re-opened for new guests stays unpayable (`TABLE_SESSION_CLOSED`) — U helper / owner line.
- F5 EQUAL rounding with service off books ±1–2 satang as service/discount (deviation 3) — a "rounding" line would be a new card.

## Status
⏳ **Waiting for the P2.9 S merge SHA** (upstream `session/pos` a477c9e5 still has P2.9 in fix round 2). On arrival: `git merge origin/session/pos` (expected conflict only in `ledger/POS-OWNER-PENDING.md` — keep both; REG_MESSAGE/REFUSAL_KEY/union/pos.json additions are in separate regions and auto-merge per `git merge-tree`) → rerun typecheck · fitness ±env · fitness-pos · qc-pos-p2.5 ×3 · qc-pos-p2.9 · qc-hf-tx · p2.4 · p2.6 · p2.8 · p1.x set · qc-restaurant-*.

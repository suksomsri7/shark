# POS P2.14 — oracle writer notes (fail-before) · ปิดเฟส 2

Account B · 16 Oct 2026 · tree `/root/projects/shark-pos-d` · branch `wip/pos-p2.14-oracle` from `session/pos` **92b7149d** (local tip of session/pos minus ledger-only commits; origin/session/pos now contains it, tip da27141d).
Brief: `ledger/pos-briefs/pos-brief-P2.14.md` (§10 rulings 1–11 binding; §10 wins over §2). The brief and prompt live in the controller tree (ledger-only commits after the base) — read from there.

Deliverables of this lane (no product code touched):
- `scripts/qc-pos-p2.14.mts` — **56 checks**, ids exactly §2 (L1–L5 · A1–A11 · D1 · Q1–Q6 · O1–O5 · P1–P6 · R1–R5 · U1 · K1–K3 · G1–G4 · V1–V4 · H1–H3 · Z1–Z2).
- `scripts/pos-gates.json` — P2 gate set manifest (86 suites + 8 commands, accepted reds with reasons).
- `scripts/pos-visual-sweep.json` — parity sweep manifest (23 runs, page map, exemptions).
- this file + `ledger/wo-notes/P2.14-red.txt`.

Run modes: `--list` (no DB) · `--no-db` (15 static checks: K1–K3 G1–G4 V1–V4 H1–H3 A9; no prisma) · unforced = SKIP (exit 0) while `legacy-door.ts`, `pos-gates-all.sh`, `qc-all-discovery.mts`, `sync-skills.sh`, `skills/shark-pos-api/SKILL.md` are missing · `QC_FORCE=1` = full run.
QC4 only: `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p2.14.mts` (I ran it with `ISO_MEM=7G` because Q5/Q6 spawn two child tsx processes inside the same unit; 5G default is probably enough, 7G is a margin).
SKIP-with-reason (ruling 10, counted as pass even under QC_FORCE): V1/V3 parts that need P2.7U (`qr-public` in POS_PAGES, `/q/**` inventory rows) and K3 (until the end-of-card re-pin batch, ruling 3).

## 1. Names table (the contract)

| id | builder must make true |
|---|---|
| L1 | `src/lib/modules/pos/legacy-door.ts` exports `posLinkedLegacyDoor(tenantId, unitId, opts?: { write?: boolean; db?: client }): Promise<boolean>` (true = unit is POS-linked ⇒ legacy doors closed; also accepted if re-exported from `qr-order.ts` or the pos index). The 5 legacy routes (`api/store/[t]/[u]/restaurant/{order,session,service-request}/route.ts`, `(store)/s/[t]/[u]/restaurant/{bill,notify-payment}/route.ts`) call it (directly, through a name imported from `legacy-door`, or through a local helper that calls one of those) **before** any storefront call (`placeGuestOrder`/`resolveTableSession`/`guestBill`/`notifyPromptpayPayment`) and answer `409 {error:"POS_LINKED", door:"/q/t/<qrToken>"}` (raw or URI-encoded token). No TableSession / RestaurantOrder / RestaurantServiceRequest row is written. |
| L2 | Control: unit N (RESTAURANT, not POS-linked) gets the legacy answers (200 `{ok:true…}` for session, order, service-request, bill, notify-payment). Each of the 5 route files = `git show 92b7149d:<file>` after removing lines of `// POS P2.14 ▸ … ◂` blocks (blank lines ignored). Green at the base by design (control). |
| L3 | `src/lib/actions/restaurant.ts`: `checkoutAction`, `confirmPromptpayPaymentAction`, `cancelOrderItemAction`, `mergeSessionAction`, `advanceItemAction`, `recallItemAction` refuse on POS-linked units — `checkoutAction`/`advanceItemAction` return `{ok:false, code:"POS_LINKED"}`; void-returning actions refuse by `redirect()` (NEXT_REDIRECT) or an error whose code/message is `POS_LINKED`; each body mentions `POS_LINKED` or calls the guard (same name rule as L1). No sale, no cancel, no merge, no KDS move. Control: `advanceItemAction` on unit N moves NEW→COOKING. The 5 legacy staff pages (`checkout/[sessionId]`, `tables/[sessionId]`, `order`, `kds`, `kds/[stationId]`) call `posLinkedLegacyDoor(` and `redirect(` to a `/pos/` path (banner = builder's choice). Actions are called in-process with a real session cookie (Next request scope, technique of qc-hf-o23). |
| L4 | `src/lib/ai/proposals.ts` `runKind(..., "restaurant_close_bill", {tableName, payMethod, unitName})` on a POS-linked table **throws** (refusal); 0 PosSale; session stays OPEN; the file mentions `POS_LINKED` or calls the guard (same name rule as L1). |
| L5 | `posLinkedLegacyDoor(T, A) === true`, `(T, N) === false`, `(T, N, {write:true, db: <client that throws on any access>}) === true` (fail-closed), never throws. |
| A1 | `POST /sales` CASH, no `shiftId`: `settings.pos.shift.required.otherSources` off ⇒ 200 + **`data.outOfShift === true`** + bill `shiftId null`; on + 0 open shifts ⇒ refused (409 or 422, Thai message mentions กะ) 0 bills; on + 1 open shift ⇒ bound to it; on + **≥ 2 open shifts ⇒ refused `SHIFT_REQUIRED`** 0 bills; ≥ 2 + explicit valid `shiftId` ⇒ bound to it. (Status: see drift D1 — the current map is SHIFT_REQUIRED → 409 state_conflict, pinned by p2.13; the oracle accepts 409 or 422.) |
| A2 | `revokePosApiKeyAction({systemId, keyId})` by a STAFF with `pos.settings.manage` + `api.key.revoke` and `unitAccess [A]`: key filtered to B ⇒ `PERMISSION_DENIED`, not revoked; key **without** unit filter (= all units) ⇒ `PERMISSION_DENIED`; key filtered to A ⇒ ok, revoked. Control: OWNER revokes an unfiltered key. |
| A3 | Catalog audit rows (`pos.product.*`, targetType PosProduct) written by a REST key write: `actorType "API_KEY"`, `actorId = ApiKey.id`; no AuditLog row of the tenant has `actorId` starting `apikey:`. |
| A4 | `posApprovalCards(tenantId, [requestId])`: payload `requestedById = keyId` ⇒ `requesterName === "API: <ApiKey.name>"`; a real user ⇒ the user's name (control). |
| A5 | `ops/sales.ts` `sales.taxInvoice` handler builds **`serviceKey: "pos-api:<keyId>:<saleId>"`** and passes it to the facade; the `pos.taxinvoice.issued` audit row has `after.serviceKey` = exactly that; a second call with a new Idempotency-Key returns the same `docId`. |
| A6 | REST void ⇒ AuditLog `pos.sale.void` of the bill has `after.source === "API"`; REST refund ⇒ `pos.sale.refund` (targetId = refund doc) `after.source === "API"`; a human void via `voidSaleByActor` ⇒ `after.source !== "API"`. (`VoidSaleAudit` is not in `pos-sale-contract.json` types, so an optional field there is F15.2-safe.) |
| A7 | Verification only (API-6): REST void of an order bill in ACCEPTED / PREPARING / READY ⇒ after drain CANCELLED + REFUNDED; HANDED ⇒ HANDED + REFUNDED; a second drain changes nothing (status/paymentState/version). **Already green at the base** (the `pos.sale.voided` consumer covers every status). |
| A8 | `POST /sales` replay after the 24 h TTL (oracle deletes the key's `ApiIdempotency` rows) **without** `expectedGrandTotalSatang` while the product is 86 ⇒ 200 with the original `saleId` (dedupe lookup before quote); still 1 bill with that idempotency key. |
| A9 | Static law over `src/lib/modules/pos/api/ops/*.ts`: no `definePosOp` of kind `write`/`danger` has `return posData(` in its handler — return `posResult(...)` or an explicit object so the reply shape never changes on `duplicated`. Today 13 ops violate it (channels.pause/resume, orders.create/accept/reject/preparing/ready/complete/…, sales.create/refund/taxInvoice …). |
| A10 | `GET /sales/{id}` `data.totals` = integers `subtotalSatang lineDiscountSatang billDiscountSatang couponSatang tierSatang serviceChargeSatang vatSatang grandTotalSatang tipSatang refundedSatang` (`vatRateBp` may stay), none of the old keys (`subtotal lineDiscount billDiscount coupon tier serviceCharge grandTotal tip refunded`); values equal the bill columns; `subtotalSatang` = drawer `billDetail().bill.totals.subtotal`. The facade `billDetail` keeps its old keys (drawer DTO unchanged). `gen-pos-api-docs --check` exit 0. |
| A11 | `CSV_HEADERS.daily` has `จำนวนคืนเงิน` and `ยอดคืนเงิน`; on a day with a refund, the CSV cells equal `refundCount` and `refundTotalSatang` (baht text or satang) of `reportDailySales`. |
| D1 | `publishDisplayState(ctx, actor, {deviceCode, seq, state})`: the display written is the one of **`ctx.deviceId`** (the register's own device code, same value its heartbeat/shift use). `input.deviceCode ≠ ctx.deviceId` ⇒ nothing written (`{ok:true, paired:false}` or a refusal); ctx without `deviceId` ⇒ nothing written; X → X writes (control). p2.10 publishes with `ctxOf(unit, DV[dev])` + the same deviceCode, so it stays green. |
| Q1 | `orders.expirePreorders(tenantId)` also closes NEW + **PREPAID** orders whose intent `paidAt + PAYMENT_INTENT_CONSUME_WINDOW_MS ≤ now` ⇒ `status CANCELLED` (**no new enum** — ruling 9), one `PosOrderEvent {type:"expired_paid"}`, one OpsEvent whose message/detail contains `pos.payment.refund_needed` **and** the order id or code; `qr.orderStatus(token).view.refundPending === true`; `acceptOrder` afterwards is refused with something other than `INTENT_EXPIRED`. |
| Q2 | `releaseHeldOrders(tenantId, unitId)` sweeps held orders of earlier days too (no `receivedAt ≥ day start` bound; "bizDate ≤ today"). |
| Q3 | Replays: `expirePreorders` ×2 + drain ×2 ⇒ `expired_paid` 1 · refund_needed ops 1 · outbox `pos.order.cancelled` (payload has the order id) 1; second late money for Q4 ⇒ `refund_needed` event still 1. |
| Q4 | Order rejected while PENDING_PAYMENT, then `markIntentPaid(intent, {via:"WEBHOOK"})` (+ `onIntentPaid`) ⇒ exactly one `PosOrderEvent {type:"refund_needed"}` (free-string type, no migration); `orderStatus().view.refundPending === true` and **stays true** after the intent row moves to EXPIRED (durable marker — the view reads the event). |
| Q5 | `qr.placeTableRound` with the same `guestToken` + cart from **two OS processes** at the same instant ⇒ 1 RestaurantOrder round on the table's sessions (DB advisory lock `hashtext(tableId|guestToken|cartHash)` + 10 s lookup; in-memory single-flight is per process). |
| Q6 | `qr.placePreorder` with the same idempotency key from two processes, fake Beam (enabled, `createCharge` takes 1.5 s, counted per process) ⇒ `createCharge` total 1 · 1 order · 1 intent (DB key checked before preparing the charge, under the same lock). |
| O1 | While another tx holds `pg_advisory_xact_lock(hashtext('posorder-release:<tenantId>:<unitId>'))`, `releaseHeldOrders` returns in < 2 s with **`swept: false`** and accepts nothing; after release it accepts. The function body uses `pg_try_advisory_xact_lock` and re-reads the channel with `FOR SHARE` (ORD-6). |
| O2 | `ingestOrder` auto-accept takes the same lock: while it is held, ingest either waits (≥ hold − 0.5 s) or returns NEW + a `held` event — never ACCEPTED quickly. |
| O3 | `held-cart.ts sweepOrphanTableDrafts` locks the TableSession row before the re-read: a concurrent tx holding the session `FOR UPDATE` and re-opening it ⇒ the draft stays HELD. |
| O4 | `handOver` of an order whose bill is fully REFUNDED is refused; the order is not HANDED. |
| O5 | `ingestInTx` (web door) applies the C3 warehouse visibility of the register (`regVisibleWhere`): an inventory product at a unit without inventory ⇒ `{ok:false, code:"PRODUCT_NOT_FOUND", lineIndex:0}`; unit A (has the warehouse) ⇒ ok. |
| P1 | `DEPOSIT_NOT_FOUND` / `DEPOSIT_NOT_OWNER` / `DEPOSIT_LOCKED` refusals of `submitRegisterSale` carry **`depositId`** (the row's id; additive). |
| P2 | `bulkChannelMarkup` level-aware: (code, all units) notSold ⇒ a markup at (code, A) is skipped; (null, A) notSold ⇒ a markup at (code, all) is skipped (when it would outrank the notSold at a linked unit); the matrix cell stays `CHANNEL_NOT_SOLD`. |
| P3 | `saveChannel` update without `name` ⇒ ok, name unchanged (rename race); the `pos.channel.updated` audit is written in the same transaction as the channel row (oracle compares `xmin` of the two rows). |
| P4 | `UnitPriceMatrixCell` gains **`origin: "own" \| "inherited" \| null`** (own = winning row keyed to this unit, inherited = tenant-level `(code, null)` row, null = base/refusal); `source` (PriceSource) unchanged. (drift D8: the brief wrote `source: "own"\|"inherited"` — `source` is taken.) |
| P5 | Static `account-bridge.ts`: the tax-invoice WARN branch and the `console.warn` "lines rejected" condition exclude `reason === "other-book"`. |
| P6 | `display-shared.ts displayStateSchema`: a `totals.member` row without `kind` is rejected (`kind` required); with `kind` passes. `(store)/d/actions.ts` exports `clearDisplayCookieAction` (sets `maxAge: 0` or deletes `DISPLAY_COOKIE`); `(store)/d/page.tsx` passes `staleCookie` + `clearDisplayCookieAction` when the SSR read is `DISPLAY_NOT_PAIRED`. |
| R1 | `reportAnomalies` A5 counts `pos.discount.override` / `pos.approval.pin_override` audits with `targetType "PosTableSplit"` (unit from the split row): 3 splits by one approver at B in a day ⇒ one A5 row, count 3. |
| R2 | `reportStaff` rows gain **`staffDiscountSatang`** (A3 base: line + bill − coupon − member) and **`a3Flag`** (`staffDiscount × 10000 > net × A3.bp`); bill discount 30% ⇒ 3000 / true; member-only discount ⇒ `discountSatang` 3000 kept, `staffDiscountSatang` 0, false. |
| R3 | `billsPageData` groups by **business day** (`settings.pos.reports.dayCutoffMinutes`): with cut-off 240, a bill at 02:00 BKK of day D is listed on D−1, not D. (Control at cut-off 0: listed on D.) |
| R4 | `billsPageData({unitId:"*", date, pageSize, channelCode:"LINEMAN"})` ⇒ exactly the LINEMAN bills of every unit. |
| R5 | `billDetail().bill.lines[i]` gain `costSatang` (Σ the bill's stock-movement cost for that line) and `marginSatang = lineTotalSatang − costSatang` (water ×2 at cost 400 ⇒ 800); `posStockHistoryAction` movements of a sale carry `sale: {receiptNo, lineName, qty}`. |
| U1 | `kds.ts` exports **`saleNeedsKitchen(tenantId, unitId, saleId): Promise<boolean>`** (any line maps to an active station); `kdsQueueNoAction` returns `kitchen` from it; `PayDone.tsx` shows `done.kitchenNoTicket` only when `kitchen` is true. |
| K1 | `pos-integrations.ts` FACTS: `platformCommission` [true, null] · `tableReservationsOnMap` [true, null] · `callQueueFromTable` / `voucherPayment` / `advanceBookingBill` [false, "P3"]; every P2.1–P2.13 row of `POS-MASTER-PLAN.md` carries ✅ (ruling 7 "P2 ticks"); no false fact carries the phase tag of a closed card (P0/P1 rows + ticked P2 rows). |
| K2 | `git ls-files skills/shark-pos-api/` lists `SKILL.md`, `references/recipes.md`, `references/endpoints.md`; `gen-pos-api-docs.mts`, `qc-pos-p2.13.mts`, `qc-pos-api-skill.mts` read `skills/shark-pos-api` and no longer `.claude/skills/shark-pos-api` (code, comments ignored); tracked `scripts/sync-skills.sh` copies to `/root/.claude/skills` and `/root/.claude-b/skills`, compares bytes (cmp/diff/sha256sum), no `export CI`; existing home copies equal the tracked copy. |
| K3 | No `scripts/qc-*.mts` (except this suite) contains both `merge-base` and `origin/session/pos` in code. SKIP-with-reason while none of the pending set (6 suites of ⚠️3 + p2.7, see CD-7) has been re-pinned; once one is re-pinned the check is real and the allow-list is empty. A new suite using that merge-base is red at once. |
| G1 | `scripts/pos-gates.json` ⊇ every `qc-pos-*`, `qc-hf-*`, `qc-account-api-*`, the ruling-5 regression set, the accepted set and the MASTER-PLAN §1 money line; commands `fitness-noenv fitness-qc4 fitness-pos gen-check typecheck visual-list visual-dry-th visual-dry-en` (typecheck with heap 8192). Runner **`scripts/pos-gates-all.sh`**: no `export CI` (comments ignored), contains `pos-gates.json qc4.sh /tmp/shark-gate-pos.lock with-gate-lock.sh iso.sh SUMMARY.txt DONE HEAD.txt QC_FORCE=1 10500M /tmp/pos-gate.lock --dry`; **`bash scripts/pos-gates-all.sh --dry`** exits 0 and prints `PLAN <name> <forced\|unforced\|command>` for every suite then every command in manifest order (runs nothing). Out dir/format in the manifest `$runner`. |
| G2 | Every manifest suite file exists; `mode` ∈ forced/unforced and = forced iff the suite contains `QC_FORCE`; `needs` = the `// requires: <x>-seed` marker of its first 40 lines (or absent); no duplicate names; commands have `name` + `run`. |
| G3 | **`scripts/qc-all-discovery.mts`** (pure, no side effects) exports `isQcAllSuite(file): boolean` (+ `QC_ALL_EXCLUDE`), `qc-all.mts` uses it via a marked hunk; every manifest suite passes it. (drift D9: `qc-all.mts` runs everything at import, so a one-line export inside it cannot be imported.) |
| G4 | Every `accepted` entry has `reason` (≥ 10 chars), `owner`, `opRef` that occurs in `ledger/POS-OWNER-PENDING.md`; the 5 P1 accepted reds are present with `accepted`. Today red only for `qc-acc-v2-pos-lines` (no OP line yet — the builder adds one). |
| V1 | `scripts/pos-visual-sweep.json`: every POS_PAGES entry (+ qr-public) has a th run and an en run; `visual-pos.mts` declares `EN_MOBILE_PAGES` ⊇ register, sales, receipt-public, display (+ qr-public after P2.7U) and the LOCALE=en viewport choice uses it (ruling 6 one-line harness change). qr-public part = SKIP-with-reason until P2.7U. |
| V2 | Every `/^p…/i.test(WO)` constant of `visual-pos.mts` matches the `wo` of at least one run (19 today — green with the manifest). |
| V3 | Every `page.tsx` under `src/app/app/sys/[id]/pos/**`, `(store)/{d,r,q}/**`, `developers/pos` maps to a `pages` key that is in POS_PAGES, or an `exempt` entry (parent in POS_PAGES + why); public pages have pos-ui-inventory rows. `/q/**` = SKIP-with-reason until P2.7U. |
| V4 | Every staff POS page has pos-ui-inventory rows and either an authz pin in `qc-hf-pos-page-authz.mts` (the file path appears) or `refusals[route]` testid listed in the sweep manifest and present in the inventory. Red today for stock, shifts, settings, reports, products/price-rules (ORACLE-ADD prepared, §3). |
| H1 | `ledger/HANDOVER-2026-10-xx-POS-P2.md`: sections §0–§7; a table row per P2.1…P2.14 + P2.9b with SHAs (backticked hex) that are ancestors of HEAD; each U card either has its own token (`P2.xU`) on a line with SHAs or the P2.x row has `U \`sha\``; HF-TX HF-PP HF-PP2 HF-GC HF-GC2 HF-FU on a line with ancestor SHAs. |
| H2 | `POS-CONTRACTS.md` "## Event…" table (first cell, struck text removed, `a/b/c` groups expanded) ⊇ every `"pos.*":` key of `outbox-consumers.ts`, exact case. Missing today: `pos.stockCount.confirmed` (doc says `stockcount`), `pos.receipt.taxInvoiceRequested`, `pos.payment.intent_paid`, `pos.sale.taxInvoiceIssued`. |
| H3 | `ledger/wo-notes/pos-P2.14-parity.md`: a table with a `status` column, ≥ 1 row, 0 OPEN, every DEVIATION cites a ruling (`(ref`, `→`, มติ or ruling), only MATCH/DEVIATION/OPEN. |
| Z1/Z2 | Temp tenant `posqc-p214-<rand>` 0 rows in every table with `tenantId`, Tenant deleted, users/sessions of the run 0, rate buckets of the run 0 · fingerprint of PosSale, PosOrder, PosProduct, SalesChannel, TableSession, PosCustomerDisplay outside the temp tenant + seed ApiKeys unchanged. |

Fixture (one temp tenant): units A (RESTAURANT · POS + inventory + VAT book · DEV1 with open shift · DEV2), B (RESTAURANT · POS, no inventory · DEVB1/DEVB2), N (RESTAURANT, **not** POS-linked = legacy control); users OWNER, MGR (A,B), CASH (STAFF A), KADMIN (STAFF A + pos.settings.manage + api.key.revoke), K2/C2 (STAFF B sellers); channels LINEMAN A/B, CUSTOM_WALK (DIRECT), GRAB A/B (auto-accept), CUSTOM_AUTO B, CUSTOM_PRC (P3); menu with stations at A and N; water (inventory, cost 400, price 1000) + 5 catalog products; tables at A/N; order link at A; 7 API keys. Raw SQL is limited to temp-tenant rows (intent/order `paidAt` −25 h, `receivedAt` yesterday, ApiIdempotency delete, TableSession status, PosSale `createdAt/paidAt`, `memberBenefits` of one oracle bill, display state rows read).

## 2. Drift vs the brief (at 92b7149d)

- **D1 SHIFT_REQUIRED status** — brief §2 F2 / ruling 2 say "422 `SHIFT_REQUIRED`"; `api/http-errors.ts:139` maps `SHIFT_REQUIRED → 409 state_conflict` and `qc-pos-p2.13.mts:219` (REFUSAL_EXPECT) + OR7 pin 409. The oracle accepts 409 **or** 422 (Thai message mentions กะ) so neither choice forces an unlisted ORACLE-EDIT. → CD-1.
- **D2 legacy route byte pin** — `qc-pos-p2.7.mts:885–887` (ST3) requires `storefront.ts` + every file under `api/store/[t]/[u]/restaurant/**` byte-identical to its base; LEG-1 adds hunks to 3 of those routes ⇒ ST3 red. Not in the §3 list (§3 names only `:2382`). → CD-2.
- **D3 `qc-pos-p2.7.mts:2382` and `qc-restaurant-pay`** call storefront **module functions** (`resolveTableSession`, `guestBill`, `notifyPromptpayPayment`, `order.checkout` at `qc-restaurant-pay.mts:61, :74, :81, :93`), never the routes/actions. With the guard in routes/actions/pages only (bodies stay hash-pinned) both stay green; keep them on the list but apply only if they turn red. Same for `qc-pos-p2.4` L1/L3 (`:1122–1181`, `:670–679` pin module bodies and export signatures, not routes).
- **D4 QR-1(b) vs HF-FU HN1** — `qc-hf-fu.mts:1156–1157` moves `receivedAt` of `hOld` before the Thai day start and `:1169`, `:1176–1177` assert it is **not** swept (stays NEW). Q2 requires the opposite. → CD-3.
- **D5 TL-5 `kind` required vs p2.10 fixtures** — `qc-pos-p2.10.mts:723` (`TOTALS.member` without `kind`, used by CT1/PY/… states) is rejected once `kind` is required. → CD-4.
- **D6 API-11 vs p1.17** — `qc-pos-p1.17.mts:209–210` (CSV_HEADERS.daily copy) + `:1214` (exact header compare) go red when the two refund columns are added. → CD-5.
- **D7 API-10 vs p2.13 SH2** — `qc-pos-p2.13.mts:1784–1786` PARs `GET /sales/{id}` with the facade `billDetail` (old keys). Mapping `totals.*Satang` in the op breaks that PAR. → CD-6.
- **D8 PRC-3 name** — brief: matrix DTO `source: "own"|"inherited"`; `UnitPriceMatrixCell.source` already holds `PriceSource` (read by the 06 compare UI and p2.11). Contract = additive `origin`.
- **D9 qc-all export** — `scripts/qc-all.mts` has top-level side effects (prod guard `:36–47`, discovery `:64–68`, seeds `:83–282`, runs suites): importing it would run the whole repo. Contract = new pure `scripts/qc-all-discovery.mts` (`isQcAllSuite`, `QC_ALL_EXCLUDE`) + a marked import/one-line `.filter(isQcAllSuite)` in `qc-all.mts` (shared hot file). → CD-8 (confirm).
- **D10 seventh merge-base pin** — besides the six of ⚠️3 (`qc-hf-fu.mts:235`, `qc-pos-p2.8.mts:297`, `qc-pos-p2.11.mts:268`, `qc-pos-p2.12.mts:271`, `qc-pos-p2.13.mts:351`, `qc-pos-p2.10.mts:222`), `qc-pos-p2.7.mts:361` also calls `merge-base HEAD origin/session/pos` (robust variant). K3 lists it in the pending set; ruling 3 says allow-list empty ⇒ p2.7 must be re-pinned too, or the controller allows it (one-line ORACLE-EDIT of `REPIN_ALLOW_AFTER`). → CD-7.
- **D11 `/q/**` pages already exist** — `(store)/q/t/[qrToken]`, `(store)/q/[linkToken]`, `(store)/q/o/[orderToken]` page.tsx are on the base (P2.7 S). What P2.7U adds is `qr-public` in POS_PAGES + inventory rows + plan; V1/V3 SKIP on that, not on the files.
- **D12 H2 count** — brief ⚠️10 counts 8 missing events; the table already lists `pos.order.{received,accepted,rejected,ready,completed}` as one grouped row and `pos.order.cancelled` in the replacement text of the struck `pos.sale.expired` row. Real gaps = 4 (above, incl. the `stockCount` case).
- **D13 A7 (API-6) is green at the base** — `order.ts onSaleVoided :1629–1648` handles every status; the check is a verification, not a fix.
- **D14 LEG-3 also breaks a non-POS suite** — `qc-ai-wave5b.mts:113–115` links POS to its restaurant unit and `:130–135` (W5B-3.2/3.3) expect `restaurant_close_bill` to close the bill. → CD-9.
- **D15 accepted reds** — `qc-acc-v2-pos-lines` has no line in `POS-OWNER-PENDING.md` (only HANDOVER-P1 `:61`), so G4 is red until the builder adds one. The 5 `qc-account-api-*` suites marked `// requires: acc-v2-seed` (read-docs/-finance/-gl/-master, settings) will most likely be red on QC4 for the same reason (no acc-v2 seed) — not marked accepted (no evidence). → CD-10.
- **D16 p1.18 planned-card rule** — `qc-pos-p1.18.mts:323` (`PLANNED_PHASE.BOOKING "P2.4"`) + `:1480` require every fact of a PLANNED card to be `live false` and one to carry the planned phase. DOC-1 makes BOOKING `tableReservationsOnMap` true ⇒ red. Part of the p1.18 facts ORACLE-EDIT (lines beyond `:311–320`). → in §3 list below.
- **D17 SUMMARY format** — `/root/pos-runs/gates101-c-*/SUMMARY.txt` = `<name> <exit>` lines + `DONE`, with `HEAD.txt` separate (`tree= head= dirty= time`); the runner contract copies that.
- **D18 brief line refs** — ⚠️3 lines are slightly off on the base (hf-fu 222/233–238 → code at :221/:235; p2.8 286/295–300 → :285/:297; p2.11 :259/:267–271 → :258/:268; p2.12 :262/:270–274 → :261/:271; p2.13 :55/:350–353 → :54/:351; p2.10 :47/:221–224 → :46/:222). Brief §0 merge SHAs: all 34 checked as ancestors of 92b7149d.

## 3. ORACLE-EDIT / ORACLE-ADD list (each its own `test(...)` commit with count before/after; apply at the step that needs it)

From brief §3 (approved):
1. `scripts/qc-restaurant-pay.mts:43–44` (POS-linked fixture) — only if LEG turns it red (D3; module calls `:61 :74 :81 :93`).
2. `scripts/qc-pos-p2.4.mts` L1 `:112` + body `:1122–1181`, L3 `:114` + `:392–400` / `:670–679` — only if red (D3).
3. `scripts/qc-pos-p2.7.mts:2382–2383` (control `resolveTableSession`) — only if red (D3).
4. Facts (DOC-1): `scripts/qc-pos-p1.18.mts:308–321` (FACTS table: COUPON `:311` voucherPayment → "P3", ACCOUNT `:313` platformCommission → true/null, BOOKING `:320` → true/null · false "P3" · false "P3") **+ `:323` PLANNED_PHASE / `:1480` planned-card rule (D16)**; `scripts/qc-pos-p2.4.mts:56` (ST4 title) + `:640–641` (ST4 regexes "P2.4").
5. `scripts/qc-hf-fu.mts` ZE3 `:80` (title) + `:1986–2076` (body): give the fixture lines an `itemId` and drive the refund through the other-book branch (ACC-3).
6. `scripts/qc-pos-p2.9b.mts:197` (stripComments regex) used by ST2 `:328–330` (scope.ts) — replace with a string/line-comment aware stripper (TL-2; `stripCode` in qc-pos-p2.14 is a ready model).
7. Lane pins (ruling 3, one batch at the end, pinned SHA = P2.14 merge's first parent): `qc-hf-fu.mts:221–238` ST1, `qc-pos-p2.8.mts:285–300` ST1/ST6, `qc-pos-p2.11.mts:258–271` ST1/ST4, `qc-pos-p2.12.mts:261–274` ST1, `qc-pos-p2.13.mts:54–55, :350–353` ST5, `qc-pos-p2.10.mts:46–47, :221–224` ST2 (+ `qc-pos-p2.7.mts:342–364` per CD-7).
8. ORACLE-ADD `scripts/qc-pos-p1.15.mts` PIN-1 (P1.15 staff token × manual-confirm gate, HF-PP review): new D(...) after `:94` (CHECKS ends `:95`) + body.
9. ORACLE-ADD `scripts/qc-pos-p2.12.mts` AN13 `:68` (title) + body ending `:1581`: assert the member half (a bill whose discount is only a member benefit has no A4 row and adds nothing to A3).
10. ORACLE-ADD `scripts/qc-hf-pos-page-authz.mts` (V4) — prepared here, **not applied**: after RP-1 (`:142–160`) add static pins PG-1…PG-5 for `stock`, `shifts`, `settings`, `reports`, `products/price-rules` pages, each: `has(page, 'const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "POS" } }); if (!sys) notFound();', 'const m = posMembership(auth.active);', '.filter((u) => canAccessUnit(m, u.id))', 'if (units.length === 0) notFound();')` + `?unit=` must be ∈ units (`units.some((u) => u.id === unit)`) + no `assertCan(` + the in-page refusal testid where the page has one (`pos-stock-refusal`, `pos-shift-refusal`, `pos-report-refusal`; settings/price-rules: the builder names theirs). With the pin, V4 turns green for that page (alternative: list `refusals[route]` in `pos-visual-sweep.json`).
11. Skill paths (ruling 4): `scripts/qc-pos-p2.13.mts:334` (`skillEndpoints`) and `:21` comment; `scripts/qc-pos-api-skill.mts:86–87` (`SKILL_DIR`, `HOME_DIR` → compare the tracked copy with both homes), `:402–403`; generator `scripts/gen-pos-api-docs.mts:27`, `:456` (code, not an oracle).
12. `scripts/qc-pos-p2.10.mts` ST2 — only if DSP-1 touches its zero-hunk files (keep the hunk in `display*.ts`).

Found by this oracle — need a CONTROLLER-DECISION before the builder edits (§4).

## 4. CONTROLLER-DECISION items

- **CD-1** SHIFT_REQUIRED via REST: keep 409 state_conflict (no edit; oracle accepts it) or move to 422 as the brief says (then ORACLE-EDIT `qc-pos-p2.13.mts:219` + OR7 and re-gen docs). Rec: keep 409 (p2.13 + skill already document it).
- **CD-2** ORACLE-EDIT `qc-pos-p2.7.mts:885–887` (ST3 byte parity of `api/store/…/restaurant/**`) → "= base + `// POS P2.14 ▸ … ◂` blocks" (same rule as L2). Needed for LEG-1.
- **CD-3** ORACLE-EDIT `qc-hf-fu.mts` HN1 `:1156–1157`, `:1169`, `:1176–1177` (yesterday's held order is now swept). Needed for QR-1(b).
- **CD-4** ORACLE-EDIT `qc-pos-p2.10.mts:723` (`kind: "TIER"` on the member row) for TL-5; or rule TL-5 "kind required" out.
- **CD-5** ORACLE-EDIT `qc-pos-p1.17.mts:209–210` (+2 daily columns) — `:1214` then passes. Needed for API-11.
- **CD-6** ORACLE-EDIT `qc-pos-p2.13.mts:1784–1786` (SH2: compare `sales.get` with the mapped totals) for API-10.
- **CD-7** p2.7's robust merge-base (`qc-pos-p2.7.mts:342–364`, `:361`): re-pin in the batch (rec — allow-list stays empty) or allow (`REPIN_ALLOW_AFTER` in qc-pos-p2.14 gets "qc-pos-p2.7.mts").
- **CD-8** Confirm the `scripts/qc-all-discovery.mts` contract (D9) and the marked hunk in the shared hot file `scripts/qc-all.mts`.
- **CD-9** `qc-ai-wave5b.mts:113–115, :130–135` (AI module suite, not POS): after LEG-3 the POS-linked restaurant close-bill is refused. Rec: ORACLE-EDIT by the AI owner/controller — drop the POS link of that fixture unit (the legacy path stays covered) and add one line asserting the refusal on a POS-linked unit; or keep LEG-3 out.
- **CD-10** Accepted reds: add an OP line for `qc-acc-v2-pos-lines` (G4); decide whether the 5 `acc-v2-seed` account-api suites are accepted on QC4 (needs a reason + OP line each) or run where the acc-v2 seed exists.
- **CD-11** Mode rule of the manifest (forced iff the suite has a SKIP gate). The brief's "unforced where the suite supports it" is read as: suites without QC_FORCE run unforced; SKIP-gated suites run forced so missing code is red. If the controller also wants the "unforced twice after merge" proof (gates104 did it for p2.7), add it as extra runner entries — G2 would then need a one-line ORACLE-EDIT.
- **CD-12** O4 (ORD-5) may hit suites that hand over a refunded order's bill (none found by grep); and the actions refusal redirect of L3 must target a page that reads `?err=` (`qc-pos-p1.1.mts:3223` S2.R2.6 checks every `?err=` redirect in `actions/restaurant.ts`).

## 5. Runs (oracle head d4e67784, dirty 0, QC4 ep-frosty-lab)

| run | result |
|---|---|
| `--list` | 56 ids (L5 A11 D1 Q6 O5 P6 R5 U1 K3 G4 V4 H3 Z2) — below |
| `--no-db` | 4/15 pass, SKIP 2 (K3, V3) — no prisma loaded |
| unforced on QC4 | SKIPPED, exit 0 (5 missing pieces listed) |
| **forced on QC4** | **8/56 pass · 2 SKIP-with-reason (K3, V3) · 46 red by reason · crashed false · residue 0 · Z1 Z2 green** → `ledger/wo-notes/P2.14-red.txt` (line 1 = tree/head/dirty) |
| typecheck (heap 8192, ISO_MEM 10500M, /tmp/pos-gate.lock) | EXIT 0 (full repo incl. qc-pos-p2.14.mts) |

Green at the base by design: L2 (non-linked control), A7 (API-6 verification, D13), G2 + V2 (they check the two manifests this lane wrote), Z1, Z2. Every other check is red with the reason of its fix (no `(fixture)` notes in the final run: all fixtures — temp shop, REST keys, session-scoped actions, pre-orders, held orders, deposits, displays, two child processes — worked). Runtime ≈ 4 min per forced run.
Harness notes for the builder: Q5/Q6 spawn `--child q5|q6` copies of this suite (stdout `CHILD_READY` / `CHILD_RESULT`, stdin `GO`); actions run in a Next request scope with a real `Session` row (the `AsyncLocalStorage` global is set before any app import — otherwise Next throws "Invariant: AsyncLocalStorage accessed…").

## `--list` output
```
qc-pos-p2.14 — 56 ข้อ (id · X · หัวข้อ)
P2.14-L1	L	[F1 LEG-1 มติ 1] route เดิม 5 ตัว (api/store/…/restaurant/{order,session,service-request} · (store)/s/…/restaurant/{bill,notify-payment}) บนสาขา A ที่ผูก POS → 409 {error POS_LINKED, door /q/t/<qrToken>} · ไม่มี TableSession/RestaurantOrder/คำขอบริการใหม่ · ทุก route เรียก posLinkedLegacyDoor ก่อน storefront
P2.14-L2	L	[F1 ตัวควบคุม] สาขา N ไม่ผูก POS: route เดิม 5 ตัวตอบแบบเดิม (session/order/service-request/bill/notify-payment = 200 ok) · ไฟล์ route ทั้ง 5 = ฐาน 92b7149d + บล็อก // POS P2.14 ▸ … ◂ เท่านั้น
P2.14-L3	L	[F1 LEG-2/4] action เดิมบนสาขา A ปฏิเสธ (checkoutAction · confirmPromptpayPaymentAction · cancelOrderItemAction · mergeSessionAction · advanceItemAction · recallItemAction) ไม่มีบิล/ไม่ยกเลิก/ไม่รวม/ไม่เลื่อน · ตัวควบคุม: advanceItemAction ที่สาขา N เลื่อนได้ · หน้าเดิม 5 หน้า (checkout/[sessionId] tables/[sessionId] order kds kds/[stationId]) เรียก guard + redirect ไป /pos/
P2.14-L4	L	[F1 LEG-3] ข้อเสนอ AI restaurant_close_bill บนโต๊ะของสาขา A (runKind) → ปฏิเสธ (throw) · ไม่มี PosSale · session ยัง OPEN
P2.14-L5	L	[F1 มติ 1 fail-closed] posLinkedLegacyDoor(T, A) = true · (T, N) = false · DB ล้ม (client ที่ throw) + write → true (ปิด) · ไม่ throw
P2.14-A1	A	[F2 API-1 มติ 2] POST /sales เงินสดไม่ส่ง shiftId: otherSources ปิด → 200 data.outOfShift true (บิลไม่มีกะ) · เปิด + 0 กะ → ปฏิเสธ 0 บิล · 1 กะ → ผูกกะนั้น · ≥ 2 กะ → ปฏิเสธ SHIFT_REQUIRED 0 บิล · ≥ 2 กะ + shiftId ที่ถูก → ผูกกะนั้น
P2.14-A2	A	[F4 API-2] revokePosApiKeyAction ของคนที่ดูแลสาขา A เท่านั้น: คีย์จำกัดสาขา B / คีย์ไม่จำกัดสาขา → PERMISSION_DENIED ไม่ถูกเพิกถอน · คีย์จำกัดสาขา A → ok · ตัวควบคุม: เจ้าของเพิกถอนคีย์ไม่จำกัดสาขาได้
P2.14-A3	A	[F4 API-3 มติ 9] POST /products ด้วยคีย์ pos-admin → แถว audit ของ catalog (pos.product.*) actorType API_KEY · actorId = keyId · ไม่มีแถว actorId ขึ้นต้น apikey:
P2.14-A4	A	[F4 API-4] posApprovalCards: คำขอที่ requestedById = keyId → requesterName "API: <ชื่อคีย์>" · คำขอของคนจริง → ชื่อคน (ตัวควบคุม)
P2.14-A5	A	[F4 API-5] tax-invoice ผ่าน REST: ops/sales.ts ส่ง serviceKey pos-api:<keyId>:<saleId> · audit pos.taxinvoice.issued after.serviceKey ตรงตัว · ยิงซ้ำคีย์ Idempotency ใหม่ = เอกสารเดิม
P2.14-A6	A	[F4 API-9] REST void → audit pos.sale.void after.source "API" · REST refund → audit pos.sale.refund after.source "API" · void ของคนที่ลิ้นชักบิล → ไม่มี source API
P2.14-A7	A	[C9 API-6] REST void บิลของออเดอร์ทุกสถานะ (ACCEPTED PREPARING READY HANDED) → ระบายคิว: ยังไม่ส่งมอบ = CANCELLED + REFUNDED · ส่งมอบแล้ว = HANDED + REFUNDED · ระบายซ้ำไม่เปลี่ยน
P2.14-A8	A	[C9 API-7] เล่นซ้ำหลัง TTL 24 ชม. (ลบแถว ApiIdempotency) โดยไม่ส่ง expectedGrandTotalSatang ขณะสินค้าถูก 86 → 200 saleId เดิม (ค้นคีย์ก่อน quote) · ยังคง 1 บิล
P2.14-A9	A	[C9 API-8 static] กฎรูปคำตอบทั้งทะเบียน: op ชนิด write/danger ทุกตัวคืน data รูปคงที่ (ไม่ return posData( ตรงจาก facade ที่ผลมีฟิลด์ duplicated ได้) — posResult/วัตถุระบุคีย์
P2.14-A10	A	[C10 API-10 มติ 8] GET /sales/{id} data.totals = 10 คีย์ *Satang ตัวเลขตรงบิล · ไม่มีคีย์เดิม (subtotal grandTotal refunded …) · billDetail ของลิ้นชักคงคีย์เดิม · gen-pos-api-docs --check exit 0
P2.14-A11	A	[C10 API-11 มติ 8] CSV daily มีคอลัมน์ จำนวนคืนเงิน · ยอดคืนเงิน = refundCount / refundTotalSatang ของ JSON (วันที่มีใบคืน)
P2.14-D1	D	[F3 DSP-1 มติ 9] แคชเชียร์บนเครื่อง X (ctx.deviceId X) ส่งภาพให้จอของ Y → จอ Y ไม่ถูกเขียน · ctx ไม่มี deviceId → ไม่เขียน · ตัวควบคุม: deviceCode X จาก X → เขียนจอ X
P2.14-Q1	Q	[F5 QR-1a มติ 9] ออเดอร์ PREPAID ที่ไม่มีใครรับ เงินเข้าเกิน 24 ชม. → expirePreorders → CANCELLED · PosOrderEvent expired_paid 1 · ops pos.payment.refund_needed 1 · หน้าสถานะ refundPending true · acceptOrder หลังนั้นไม่ใช่ INTENT_EXPIRED ค้าง
P2.14-Q2	Q	[F5 QR-1b] ออเดอร์ held (พักครัว) ที่รับเข้าเมื่อวาน → releaseHeldOrders → ACCEPTED (ไม่จำกัดต้นวันนี้)
P2.14-Q3	Q	[F5 X9] เล่นซ้ำ: expirePreorders ×2 + ระบาย ×2 → expired_paid 1 · ops refund_needed 1 · outbox pos.order.cancelled 1 · เงินเข้าซ้ำของ Q4 → refund_needed 1
P2.14-Q4	Q	[F6 QR-2] ปฏิเสธตอนรอเงิน แล้วเงินเข้า → PosOrderEvent refund_needed 1 · orderStatus refundPending true · ใบเปลี่ยนสถานะภายหลัง (EXPIRED) → refundPending ยัง true (ถาวร)
P2.14-Q5	Q	[F7 QR-3 มติ 9] รอบของแขก (guestToken + ตะกร้าเดียวกัน) ส่งพร้อมกันจาก 2 โปรเซส → รอบครัว 1 รอบ
P2.14-Q6	Q	[F7 QR-3] สั่งล่วงหน้าคีย์เดียวกันพร้อมกันจาก 2 โปรเซส (Beam ปลอม 1.5 วิ) → ออเดอร์ 1 · ใบขอรับเงิน 1 · createCharge 1
P2.14-O1	O	[C8 ORD-2/6] ล็อก posorder-release ถูกถือ → releaseHeldOrders (ทางอ่าน) คืนเร็ว (< 2 วิ) swept:false ไม่รับ · ปล่อยล็อกแล้วกวาด = ACCEPTED · re-read ช่องทาง FOR SHARE
P2.14-O2	O	[C8 ORD-3] ingest รับอัตโนมัติถือล็อกเดียวกับตัวกวาด: ระหว่างล็อกถูกถือ ingest ไม่รับอัตโนมัติจนกว่าล็อกจะว่าง (รอ หรือคง NEW + held)
P2.14-O3	O	[C8 ORD-4] ทิ้งรอบร่างกำพร้า: ล็อก session ก่อนอ่านซ้ำ — ธุรกรรมอื่นถือ session (เปิดกลับ OPEN) ขณะกวาด → ร่างยัง HELD
P2.14-O4	O	[C8 ORD-5] บิลของออเดอร์ถูกคืนเงินครบ (REFUNDED) → handOver ปฏิเสธ · ออเดอร์ไม่เป็น HANDED
P2.14-O5	O	[C8 ORD-1] ประตูเว็บ ingestInTx ใช้การมองเห็นตามคลังของสาขา (C3): สินค้าคลังที่สาขา B (ไม่มีคลัง) → PRODUCT_NOT_FOUND lineIndex 0 · สาขา A → ok
P2.14-P1	P	[C11 DEP-1] คำปฏิเสธ DEPOSIT_NOT_FOUND / DEPOSIT_NOT_OWNER / DEPOSIT_LOCKED มี depositId ของแถวนั้น
P2.14-P2	P	[C11 PRC-1] bulkChannelMarkup level-aware: (code, ทุกสาขา) notSold → ปรับที่ (code, A) ข้าม · (null, A) notSold → ปรับที่ (code, ทุกสาขา) ข้าม · สินค้ายังไม่ขาย
P2.14-P3	P	[C11 PRC-2] saveChannel แก้โดยไม่ส่ง name → ok ชื่อเดิม · audit pos.channel.updated อยู่ในธุรกรรมเดียวกับการเขียน (xmin เดียวกัน)
P2.14-P4	P	[C11 PRC-3] unitPriceMatrix เซลล์มี origin: แถว (code, A) = own ที่ A · (code, ทุกสาขา) = inherited ที่ B · ราคาฐาน = null · source เดิมคงอยู่
P2.14-P5	P	[C11 ACC-2 static] account-bridge: reason other-book ไม่เข้าข้อความ WARN "บรรทัดถูกปฏิเสธ/สมุดออกไม่ได้" ทั้งสองทาง
P2.14-P6	P	[C11 TL-5] displayStateSchema ปฏิเสธ totals.member ที่ไม่มี kind · /d ล้างคุกกี้ค้างเมื่อ SSR อ่านได้ DISPLAY_NOT_PAIRED (clearDisplayCookieAction + staleCookie)
P2.14-R1	R	[C12 RPT-1] A5 นับ pos.discount.override บน PosTableSplit (ผู้อนุมัติคนเดียว 3 แผน/วัน → แถว A5 count 3)
P2.14-R2	R	[C12 RPT-2] reportStaff แถวมี staffDiscountSatang (ฐาน A3) + a3Flag: ส่วนลดท้ายบิลของพนักงาน 30% → true · ส่วนลดสมาชิกล้วน → staffDiscount 0 · false
P2.14-R3	R	[C12 RPT-3] บิลวันนี้จัดวันตามวันธุรกิจ (ตัดวัน 04:00): บิล 02:00 ของเมื่อวาน = วันก่อนหน้า ไม่ใช่เมื่อวาน
P2.14-R4	R	[C12 RPT-5] บิลทุกสาขา กรองรหัสช่องทาง (channelCode LINEMAN) ข้ามสาขา → เฉพาะบิล LINEMAN ของ A และ B
P2.14-R5	R	[U13 UI-4] billDetail บรรทัดมี costSatang (จากความเคลื่อนไหวสต็อกของบิล) + marginSatang · ประวัติสต็อก (posStockHistoryAction) แถวของบิลมี sale {receiptNo lineName qty}
P2.14-U1	U	[U13 UI-8] saleNeedsKitchen: บิลสินค้าปลีกล้วน → false · บิลเมนูที่มีสถานี → true · kdsQueueNoAction คืน kitchen · PayDone แสดง kitchenNoTicket เฉพาะเมื่อ kitchen
P2.14-K1	K	[D14 DOC-1 มติ 8] facts การ์ด 10: platformCommission true · tableReservationsOnMap true · callQueueFromTable/voucherPayment/advanceBookingBill false "P3" · ไม่มี fact false ที่ติดป้ายใบที่ปิดแล้ว (แถว P2 ✅ ใน POS-MASTER-PLAN = P2.1–P2.13)
P2.14-K2	K	[D15 DOC-2 มติ 4] git ls-files skills/shark-pos-api/{SKILL.md, references/recipes.md, references/endpoints.md} · gen-pos-api-docs/qc-pos-p2.13/qc-pos-api-skill อ่านทางนี้ (ไม่อ่าน .claude/skills/shark-pos-api) · scripts/sync-skills.sh (สองบ้าน · เทียบไบต์)
P2.14-K3	K	[D16 TL-1 มติ 3] ไม่มี qc-* ใช้ merge-base กับ origin/session/pos (allow-list ว่างหลังชุด re-pin) — SKIP-with-reason จนชุด re-pin ท้ายใบลง
P2.14-G1	G	[D17 มติ 5] scripts/pos-gates.json ครอบทุก qc-pos-* · qc-hf-* · ชุด regression (MASTER-PLAN §1 + มติ 5) · คำสั่ง fitness ±env/fitness-pos/gen-check/typecheck/visual · runner scripts/pos-gates-all.sh (ไม่ export CI · QC4 + ล็อก POS · SUMMARY.txt · --dry = แผนครบทุกแถว)
P2.14-G2	G	[D17] ไม่มีแถวชี้ไฟล์ที่ไม่มี · mode forced|unforced ตามด่าน SKIP ของชุด · needs ตรงเครื่องหมาย // requires: · ไม่มีชื่อซ้ำ
P2.14-G3	G	[D17] ทุกชุดในแผนผ่านตัวกรองของ qc-all เอง (scripts/qc-all-discovery.mts isQcAllSuite · qc-all.mts ใช้ตัวเดียวกัน)
P2.14-G4	G	[D17 มติ 5] แดงที่ยอมรับ (accepted) มี reason + owner + opRef ที่มีอยู่จริงใน POS-OWNER-PENDING.md
P2.14-V1	V	[D18 มติ 6] scripts/pos-visual-sweep.json: ทุก POS_PAGES มีรอบ th และ en · visual-pos มี EN_MOBILE_PAGES (register sales receipt-public display + qr-public) — qr-public SKIP-with-reason จน P2.7U
P2.14-V2	V	[D18] ทุกค่าคงที่ wo-gated (/^p…/i.test(WO)) ของ visual-pos.mts มีรอบที่ wo ตรง
P2.14-V3	V	[D18] ทุก page.tsx ใต้ sys/[id]/pos/** · (store)/{d,r,q}/** · developers/pos แมปกับหน้าใน POS_PAGES หรือข้อยกเว้นที่ระบุ · หน้าสาธารณะมีแถวทะเบียนปุ่ม — /q/** SKIP-with-reason จน P2.7U
P2.14-V4	V	[D18 ⚠️6] ทุกหน้าพนักงานของ POS มีแถว pos-ui-inventory.json และ (หมุดสิทธิ์ใน qc-hf-pos-page-authz หรือการ์ดปฏิเสธในหน้าที่ระบุในแมนิเฟสต์) — ORACLE-ADD stock/shifts/settings/reports/price-rules
P2.14-H1	H	[D19 มติ 7] ledger/HANDOVER-2026-10-xx-POS-P2.md มี §0–§7 · ทุกแถว P2.1–P2.14 + P2.9b + ใบ U ทุกใบ + HF ของเฟส มี SHA ที่เป็นบรรพบุรุษของ HEAD
P2.14-H2	H	[D19 DOC-5] POS-CONTRACTS.md ตาราง event ⊇ ทุกคีย์ pos.* ใน outbox-consumers.ts (ตรงตัวพิมพ์)
P2.14-H3	H	[D19] ledger/wo-notes/pos-P2.14-parity.md มีแถว · OPEN 0 · DEVIATION มีอ้างอิงมติ
P2.14-Z1	-	QC4 คืนสภาพ: ร้านชั่วคราว 0 แถวทุกตารางที่มี tenantId + Tenant ถูกลบ · ผู้ใช้/เซสชันของรอบ 0 · ถังเพดานอัตราของรอบ 0
P2.14-Z2	-	ลายนิ้วมือนอกร้านชั่วคราว (PosSale · PosOrder · PosProduct · SalesChannel · TableSession · PosCustomerDisplay · ApiKey ของร้าน seed) เท่าเดิม
X-coverage: L=5 A=11 D=1 Q=6 O=5 P=6 R=5 U=1 K=3 G=4 V=4 H=3 -=2
```

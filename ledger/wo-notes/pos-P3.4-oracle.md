# P3.4 S — oracle writer notes (fail-before) · `scripts/qc-pos-p3.4.mts`

Base `session/pos` **72669941** (controller tip · product tree c5fc223b · F0 = CD-FU2a e2957aca) · tree `/root/projects/shark-pos-p11` · branch `wip/pos-p3.4-oracle`.
Brief `ledger/pos-briefs/pos-brief-P3.4.md` (§10 rulings 1–15 binding). Suite = 40 checks + Z1–Z2 = **42** (ST 8 · Q 7 · SY 17 · RS 5 · SEC 3 · Z 2). U-only items are listed in §6 and are **not** in the suite (not counted green).

## 1. Names table (the contract the builder implements)

| Kind | Name | Contract |
|---|---|---|
| shared (pure, client-safe) | `src/lib/modules/pos/offline-shared.ts` | no import chain reaching `@/lib/core/db` · `@prisma/client` · `server-only` · `next/*` · `node:*` · a `"use server"` file; no `Date.now()` / `new Date()` / `Math.random()`; no directive |
| const | `OFFLINE_TENDERS` | `["CASH","TRANSFER"]` (ruling 4) |
| const | `OFFLINE_SYNC_BATCH_MAX` `OFFLINE_MAX_AGE_MS` `OFFLINE_MAX_BILLS` `OFFLINE_PRICE_GRACE_MS` `OFFLINE_CLOCK_SKEW_MS` `OFFLINE_SHIFT_SLACK_MS` | 50 · 86_400_000 · 300 · 900_000 · 120_000 · 300_000 (ruling 6 · R7) |
| const | `OFFLINE_REFUSAL_CODES` | contains `PRICE_MISMATCH CLOCK_INVALID SHIFT_CLOSED SELLER_MISMATCH OFFLINE_REF_TAKEN STOCK_INSUFFICIENT` |
| fn | `posOfflineEnabled(settings)` | `AppSystem(POS).settings.pos.offline.enabled === true` only; default false |
| fn | `offlineRef(code, seq)` / `parseOfflineRef(ref)` | `OFF-<code>-<seq ≥ 4 digits>` (e.g. `OFF-C1-0007`, `OFF-C12-10000`); code `C<n>`; bad code/seq (≤0, non-int, NaN) → `null`; parse round-trips, rejects `OFF-C1-007`, `-0000`, lower case |
| fn | `nextOfflineSeq(local, server)` | `max(local, server, 0) + 1` (non-int/negative → 0) |
| fn | `offlineSaleRefusal(sale)` | `null` for walk-in CASH / TRANSFER (ref optional) / CASH+TRANSFER / bill discount; `{code:"VALIDATION", field}` for PROMPTPAY CARD GIFT_CARD STORE_CREDIT DEPOSIT PLATFORM tenders and `memberId` `couponCode` `memberChoices` `tableSessionId` `tableSplitPartId` `heldCartId` `channelId` |
| fn | `offlineCartTotals(snapshot, cart: RegisterQuoteInput)` | equals `priceCart` on snapshot prices (`unitPriceSatang` = product `priceSatang`, weighed = `weighedPriceSatang(grams, perKg)`, option deltas from `product.choices[].priceDeltaSatang`, `snapshot.vat`, `snapshot.serviceChargeBp`); product not in snapshot / foreign choice → `ok:false` |
| fn | `offlineBatches(items, size?)` | stable sort by `(soldAt, seq parsed from offlineRef)`, chunks ≤ 50 (size > 50 clamped), input not mutated |
| fn | `classifyOfflineResult(r \| null)` | OK/DUPLICATE → `"remove"` · REJECTED → `"park"` · null/undefined/unknown → `"keep"` |
| fn | `offlineSellGate({enabled, deviceActive, snapshotIssuedAt, priceValidUntil, queueLength, now})` | `{ok:true}` or `{ok:false, reason}`; stop when disabled · device not active · no snapshot · age > 24 h · now > priceValidUntil + 15 min · queue ≥ 300; `now` = ms or Date |
| fn | `offlineSlipPayload(input)` | returns `ReceiptPayload` (`receipt-render.ts:83`): `kind:"RECEIPT"`, `doc.receiptNo = offlineRef`, `footer.qrEReceiptUrl:null`; `renderReceiptHtml(th)` shows "ใบรับเงินชั่วคราว — รอออกเลขจริง", never "ใบกำกับภาษีอย่างย่อ", no `/r/`; en render has no Thai outside shop/product data. Input = `{offlineRef, soldAt, shop{name,branchName,address,phone,taxId?,branchNo?}, cashierName?, lines[{name,qty,unitPriceSatang,discountSatang?,lineTotalSatang}], totals: PriceCartOk, payments[{type,amountSatang,tenderedSatang?,changeSatang?,reference?}], printLocale?}` |
| fn | `offlineRefusalMessageKey(code)` | key under `pos.register` for each of the 6 codes, all distinct, present in th (Thai) + en (no Thai) |
| facade | `src/lib/modules/pos/offline-sync.ts` | no directive; exports 5 async fns; never calls `createSale` directly (goes through `submitRegisterSale`) |
| fn | `issueOfflineSnapshot(ctx{tenantId,systemId,unitId,deviceId}, actor, opts?{now?}, client?)` | `{ok:true, snapshot:{hash, issuedAt, priceValidUntil, offlineCode, offlineSeq, vat{mode,rateBp}, serviceChargeBp, products[RegisterProduct whitelist + choices[{choiceId,groupId,name,priceDeltaSatang}]]}}`; refused (`ok:false`): device unknown/other unit, flag off, no `pos.sale.create`; stores `PosOfflineSnapshot` (keep last 2/device); assigns `PosDevice.offlineCode` on first issue (unique per unit) |
| fn | `syncOfflineSales(ctx, actor, {deviceId, items[≤50]}, opts?{now?}, client?)` | `{ok:true, results:[{offlineRef, status:"OK"\|"DUPLICATE"\|"REJECTED", offlineSaleId?, saleId?, receiptNo?, reason?, drift?}]}`; batch refusal `{ok:false, code}` writes nothing (other tenant/unit device, unknown device, actor without `pos.sale.create`/unit access, flag off, > 50 items, `deviceId ≠ ctx.deviceId`) |
| item | `{offlineRef, idempotencyKey, soldAt ISO, shiftId?, staffToken?, sellerUserId?, snapshotHash, sale}` | `sale` = `RegisterSubmitInput` without `idempotencyKey`/`staffToken`; **price claim = `sale.expectedGrandTotalSatang`** (CD-4); `deviceId` = device code (same as `RegisterCtx.deviceId`) |
| fn | `listOfflineRejected(ctx, actor, {limit?})` | `pos.shift.manage`; `{ok:true, items:[{id, offlineRef, deviceId, soldAt, reason, status:"REJECTED", …}]}` of the unit only |
| fn | `acceptOfflineSale(ctx, actor, {id})` | `pos.shift.manage`; `{ok:true, saleId, receiptNo, duplicated?}`; idempotent; SHIFT_CLOSED item → sale `shiftId null`; row → `ACCEPTED_BY_MANAGER` + `resolvedByUserId`; refused after discard |
| fn | `discardOfflineSale(ctx, actor, {id, reason ≥ 5})` | `pos.shift.manage`; `{ok:true, duplicated?}`; idempotent; row → `DISCARDED`; refused after accept; reason < 5 → VALIDATION |
| route | `src/app/api/pos/sync/route.ts` | `POST`; session via `@/lib/core/context` (`getAuth`/`requireTenant`); calls `syncOfflineSales` with the session user (facade enforces `pos.sale.create`); not `"use server"`; no direct prisma. **No POS session route folder exists at 72669941** (all `src/app/api/**` POS routes are `/api/v1/pos/*` API-key routes); nearest session-route pattern = `src/app/api/calendar/month/route.ts` (getAuth + 401 JSON) — so the brief's default path is used |
| REST | op `sync.sales` | `POST /sync/sales`, `action: "pos.offline.sync"`, kind `write`, body `{unitId, deviceId, items}` → `data.results`; total **49** ops; `POS_SCOPES` gains `pos.offline.sync`; key in `core/permissions.ts` (module pos) and `isApiScope` true; docs (`docs/api/POS-API.md`, `skills/shark-pos-api/references/endpoints.md`) via `gen-pos-api-docs` |
| staff-pin | `staffActorFromToken(ctx, token, client?, opts?{at?: Date})` | one `// POS P3.4 ▸ … ◂` block; expiry checked against `at` when given; `verifyStaffPin` untouched (ruling 12) |
| createSale | `input.offline?: {ref, soldAt}` | `PosSale.offlineRef`, `syncedAt = now`, `paidAt = soldAt`, receipt number from the **soldAt** month counter, `createdAt` = server time (ruling 3) |
| DB (R1) | `PosSale.offlineRef String?` · `PosSale.syncedAt DateTime?` · partial unique `("unitId","offlineRef") WHERE "offlineRef" IS NOT NULL` · `PosDevice.offlineCode String?` · `PosDevice.offlineSeq Int @default(0)` | migration dir `*_pos_p34_offline` (one, hand-written, additive) |
| DB | `PosOfflineSale` | `tenantId unitId systemId deviceId offlineRef idempotencyKey payload(Json) soldAt status(String) reason? drift(Json?) saleId? resolvedByUserId? createdAt` · `@@unique([tenantId, idempotencyKey])`; status `SYNCED REJECTED ACCEPTED_BY_MANAGER DISCARDED`; payload never holds the raw staff token |
| DB | `PosOfflineSnapshot` | `tenantId unitId deviceId issuedAt priceMap(Json {productId\|choiceId: satang}) hash` (tenantId/unitId = CD-2) |
| audit | `pos.sale.offline_synced` (target PosSale) | `after{offlineRef, deviceId, soldAt, syncedAt, drift?, via?}`; manager accept → `after.via = "manager"`, actor = manager |
| audit | `pos.sale.offline_discarded` (target PosOfflineSale) | `after.reason` (CD-7) |
| flag | `settings.pos.offline.enabled` | on the POS AppSystem |

## 2. Drift vs the brief (surveyed at 3d2f6db8) at 72669941
Cited code lines re-checked at 72669941 and still valid: `register.ts:2472` submitRegisterSale · `:3266` KDS ticket (also `:2804` on the payment-intent path — offline never takes it) · `service.ts:884` period · `:918` `paidAt: new Date()` · `staff-pin.ts:315` expiry · `:320` revoked device · `kds.ts:300` heal · `register-shared.ts:277` `stockLeft`.
1. **Heal creates kitchen rounds for synced bills**: `healMissingTickets` (`kds.ts:300`) picks every PAID POS bill without `sourceId` from the last 12 h. Skipping `register.ts:3266` is not enough; SY16 pins "no round even after heal" → needs a `kds.ts` exclusion (CD-1).
2. `staffActorFromToken` also refuses a revoked device (`staff-pin.ts:320`) — a token bill sold before `revokedAt` would still be refused unless the `at` block also covers that check. SY8 tests the no-token path only (CD-12).
3. Base prices have no history: "price at soldAt" = today's base + rule windows at soldAt. A base change after the snapshot is explainable only by the snapshot (SY4); rule windows are exact at soldAt (SY6).
4. Register VAT modes are `INCLUDED | NONE` (`RegisterQuoteTotals.vatMode`); Q3 uses those two (brief says "VAT inc/exc").
5. R5 item has no per-line price; drift is decided on the bill total (CD-4).
6. R1 snapshot table lacks tenancy columns (CD-2).
7. `p1.18` pins no offline fact as PLANNED at 72669941 (`PLANNED_PHASE` :323 has no OFFLINE; :357 already pins tab `offline` live) → nothing to re-pin in S.

## 3. ORACLE-EDIT list (file:line at 72669941) — builder-prepared `test(pos)` commits unless marked controller
- `scripts/qc-pos-p2.13.mts` ST1: `:147` comment "48 op" → 49 · `OPS_SPEC` `:148` add `["sync.sales","POST","/sync/sales","pos.offline.sync","write"]` · `:417` op count and `:1084` openapi count follow `OPS_SPEC.length` · titles `:1`, `:65`, `:68` say 48 · bundle table (`BUNDLE_SPEC`) only if a bundle gains the scope (CD-8).
- `scripts/qc-pos-api-skill.mts` K5: `:44` title "48" · `:91–92` `OP_PATHS` add `"POST /sync/sales"` · `:301` "48/48" text.
- `scripts/qc-pos-p1.18.mts`: no edit for S (see drift 7); re-check at U (settings offline card/tab strings).
- `scripts/pos-ui-inventory.json`: S adds no testid (ST7 green); U rows at P3.4U.
- `scripts/pos-gates.json`: append `{ "suite": "qc-pos-p3.4", "mode": "forced" }` after the p2.14 row (`:178`). **Needed now**: p2.14 G1 fails for any qc-pos-* missing from this list (CD-10).
- `scripts/pos-sale-contract.json`: `types.CreateSaleInput.offline` via `pnpm exec tsx scripts/fitness-pos.mts --update-pos-contract` (additive only; ST2 checks every base leaf unchanged).
- Lane pins for the controller at the S and U merges (CD-B1b pattern; builder never edits): `qc-pos-p2.7` ST3 `:49`, `:342–361` (05975437) · `qc-pos-p2.8` ST6 `:58`, `:295` · `qc-pos-p2.10` ST2 `:221` LANE_PIN 3d2f6db8, `:246` regex `POS P2\.(10|14) ▸` gains `3\.4` (U, RegisterScreen), `:360` "existing oracles unchanged" uses `--diff-filter=M` (new suite file is fine) · `qc-pos-p2.11` ST1/ST4 `:47`, `:267` · `qc-pos-p2.12` ST1 `:40`, `:270`, lane-A `:356–370` (service.ts, register*, outbox) · `qc-pos-p2.13` ST5 `:350` · `qc-hf-fu` ST1 `:41`, `:233`, NEVER_TOUCH `:285–296` (register*/service.ts) — `:299` CALL_SITES stays (ST2 pins unchanged callers).
- Unchanged: `qc-pos-p1.3` S4.1 (`:184`, server `pendingSyncCount` 0) and S5.17.

## 4. CONTROLLER-DECISION
- **CD-1** `kds.ts` hunk (heal must skip `offlineRef IS NOT NULL`) — not on the brief's file list; `kds.ts` is outside p2.12 lane-A regex. Accept the hunk, or drop the heal half of SY16.
- **CD-2** `PosOfflineSnapshot` gets `tenantId` + `unitId` (tenancy, Z wipe, fingerprint).
- **CD-3** item field `sellerUserId?` = the "claimed user" of R8 (absent → seller = session user; present ≠ session user without token → `SELLER_MISMATCH`).
- **CD-4** price claim = `sale.expectedGrandTotalSatang`; server accepts if it equals the total at soldAt (OK) or at the device's stored snapshot prices (OK + drift), else `PRICE_MISMATCH`.
- **CD-5** snapshot keeps `stockLeft` (a `RegisterProduct` field already shown to the cashier); SEC1 forbids keys matching cost/margin/onHand/phone/email/member/token/secret/password.
- **CD-6** test seam `opts.now` on `issueOfflineSnapshot`/`syncOfflineSales` (month-crossing receipt + JE in SY1, clock clamps); default `new Date()`.
- **CD-7** audit `pos.sale.offline_discarded` for discard; accept reuses `pos.sale.offline_synced` with `after.via:"manager"`.
- **CD-8** which key bundle carries `pos.offline.sync` (pos-operate? new bundle?) — the suite does not pin it (RS keys use pos-operate + the explicit scope).
- **CD-9** raw staff token never stored in `PosOfflineSale.payload` (SY9).
- **CD-10** add the `pos-gates.json` row now (else qc-pos-p2.14 G1 is red from this commit on).
- **CD-11** P3.5 lane: ST2 pins `staff-pin.ts` = 72669941 + one P3.4 block and `verifyStaffPin` unchanged; if P3.5 S merges first, re-pin ST2's base for staff-pin (env `P34_BASE` or edit `BASE_REV`).
- **CD-12** token bill on a device revoked after soldAt: OK or REJECTED? (R8 says OK; `staffActorFromToken` refuses revoked devices). Not pinned.

## 5. `--list` (42)
ST1 ST2 ST3 ST4 ST5 ST6 ST7 ST8 · Q1 Q2 Q3 Q4 Q5 Q6 Q7 · SY1 SY2 SY3 SY4 SY5 SY6 SY7 SY8 SY9 SY10 SY11 SY12 SY13 SY14 SY15 SY16 SY17 · RS1 RS2 RS3 RS4 RS5 · SEC1 SEC2 SEC3 · Z1 Z2 (X-coverage ST=8 Q=7 SY=17 RS=5 SEC=3 Z=2 · prefix `P3.4-`).

## 6. SKIP list — U-only (P3.4U · CONTROLLER-RUN · not in this suite, not counted green)
- V `offline-sale` · `offline-queue` · `offline-tenders` · `offline-sync-back` · `offline-rejected` (derived screen, owner-ack like P2.8) · `settings-offline-live` — fresh incognito context each + flag on; existing `offline` / `settings-offline` keep flag off (today's pixels).
- ST3-U IndexedDB never writes `managerPin|pin|phoneLast4|cost`; DB name `shark-pos-off:<systemId>:<unitId>`; snapshot wiped on logout / `STAFF_TOKEN_INVALID`.
- ST6-U `register.offline.*` (19ง banner/chips) + live `settings.offline.*` strings.
- ST7-U ui-inventory rows for every new screen testid.
- ST8-U OfflineCard / offline tab with flag off = today's render.
- Q-U Web Locks leader · backoff · device shift close blocked while queue > 0 · unsynced bills not voidable/refundable · offline PIN verifier PBKDF2-SHA256 ≥ 310k (ruling 8).

## 7. Runs (this tree)
- `pnpm exec tsx scripts/qc-pos-p3.4.mts --list` → 42 ids (no DB).
- `--no-db` → 2/15 (ST4 no-SW guard, ST7 no new untracked testid = green guards; ST1–ST3 ST5 ST6 ST8 Q1–Q7 red by reason: files/op/scope/migration missing). ST2's contract-subset, CALL_SITES and outbox byte-identity parts are already green; it is red only on the missing P3.4 blocks / `offline` contract field.
- Positive control (oracle self-test, not the card): a throwaway reference `offline-shared` in scratch via `P34_SHARED_PATH` → Q1–Q7 + ST8 green; ST6 correctly flags keys that do not exist.
- Forced on QC4 (`bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p3.4.mts`) → see `ledger/wo-notes/P3.4-red.txt`: 4/42 (ST4 ST7 Z1 Z2), 38 red by reason (`MISSING:<fn>`, op 48, scope unknown), no crash, residue 0, fingerprint unchanged, network guard 0. Fixture controls worked: online sale, online kitchen round (SY16 control), PIN/token issue, closeShift, revokeDevice, BLOCK toggle.
- Typecheck: see §8.

## 8. Typecheck
`env NODE_OPTIONS=--max-old-space-size=8192 ISO_MEM=10500M bash scripts/iso.sh flock -w 1200 /tmp/pos-gate.lock pnpm typecheck` → **exit 0** (full repo tsc, lock acquired without the 20-min fallback; suite content identical to the committed one).

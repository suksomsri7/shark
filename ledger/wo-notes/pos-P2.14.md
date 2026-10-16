# POS P2.14 S — builder notes (tree d · branch `wip/pos-p2.14`)

Base `64923c13` (P2.7U merge) + `origin/wip/pos-p2.14-oracle` 5fe09f6b merged first (`163f27db`). Oracle = `scripts/qc-pos-p2.14.mts` (56 checks, §1 of `pos-P2.14-oracle.md`). Brief = `ledger/pos-briefs/pos-brief-P2.14.md` §10 rulings 1–24.
Head / gate results: see §7 (filled at the end of the card).

## 1. Files and hunks per ruling / row

Every new hunk in an existing file is marked `// POS P2.14 ▸ … ◂` (JSX: `{/* POS P2.14 ▸ … ◂ */}`). No migration, no new enum, no new outbox event. `createSale`/`voidSale`/`refundSale` signatures untouched, `pos-sale-contract.json` not regenerated. Single writers unchanged (PosOrder*/PosOrderLink = `order.ts` · intents = `payment-intent.ts` · Restaurant*/TableSession = restaurant module, reached through `restaurant/index.ts`).

| row(s) · ruling | commit | files (hunks) |
|---|---|---|
| LEG-1 (r1) | `086094ca` | new `src/lib/modules/pos/legacy-door.ts` (`posLinkedLegacyDoor` fail-closed for writes · `legacyQrDoor` · `posLinkedBody` · `posLinkedLegacyPage`) · 5 legacy guest routes `api/store/…/restaurant/{order,session,service-request}` + `(store)/s/…/restaurant/{bill,notify-payment}` — one marked import + one marked 409 block each (`storefront.ts` untouched) |
| LEG-2 / LEG-4 (r1) | `7dd87a55` | `src/lib/actions/restaurant.ts` (`posLinkedUnit` + `POS_LINKED_REFUSAL`; checkout / confirmPromptpay / cancelOrderItem / mergeSession / kds advance+recall refuse; void actions redirect `?err=POS_LINKED`) · 5 legacy staff pages redirect to `/app/sys/<id>/pos/{tables|kds|register}?unit=…&from=legacy` · new `src/components/pos/LegacyDoorNotice.tsx` (non-interactive) on POS tables/kds pages · restaurant hub maps `err=POS_LINKED` · i18n `tables.legacy.*`, `kds.legacyFrom` |
| LEG-3 (r1) | `1150caa7` | `src/lib/ai/proposals.ts` — `restaurant_close_bill` throws `POS_LINKED: …` on POS-linked units |
| API-1 / API-7 / API-8 (r2, r12) | `840ba3e9` | `api/ops/sales.ts` (prior-sale lookup before shift/quote; shift rule 0 → SHIFT_REQUIRED · ≥2 + CASH → SHIFT_REQUIRED · 1 → bind; fixed reply shape) · `api/units.ts` (`posApiPriorSale`, `posSaleShiftId`, `posApiShiftState`) · `api/ops/{channels,orders,products}.ts` fixed reply shapes (`orderCardReply`, `.channel`, refund `{refund, sale, duplicated}`, taxInvoice `{docId, docNo}`) |
| API-2/3/4/5/9 | `a42aeddc` | `api-key-actions.ts` (revoke = unit-cover check) · `catalog.ts` (audit actorType API_KEY) · `pos-approval.ts` ("API: <name>") · `tax-invoice.ts` (`serviceKey` input → audit `after.serviceKey`) · `service.ts` (`VoidSaleAudit.source?: "API"`) · `bills.ts` (`voidSaleByActor` viaApi) · `refund.ts` (apiTag auditExtra) |
| DSP-1 | `162668ab` | `display.ts` (ctx.deviceId must equal the bound deviceCode) · `display-actions.ts` (args.deviceId) · `use-display-publish.ts` |
| QR-1/2/3 · ORD-2/3/5/6 (r14) | `6d5d8269` | `order.ts` (releaseHeldOrders try-lock → `{accepted, swept}`, 7-day lookback, channel FOR SHARE; ingest auto-accept takes the release lock; `HANDOVER_SALE_REFUNDED`; `expirePaidOneInTx`/`expireDuePaidPreorders`; `addRefundNeededInTx`; exported `recordOrderRefundNeeded`) · `payment-intent.ts` (opsAfter INTENT_CANCELLED → refund marker) · `qr-order.ts` (orderStatus reads refund_needed; guest-round advisory lock + `pos.qr.round` audit marker 10 s; pre-order one tx under `posqr-pre:` lock, intent prepared once) · i18n `orders.errors.saleRefunded` |
| ORD-1 / ORD-4 / DEP-1 | `6dc205e8` | `register.ts` (`registerVisibleProductIds`; deposit refusals carry depositId) · `order.ts` (ingest visibility) · `held-cart.ts` (sweep locks the session first via `rest.lockOpenSessionInTx`) |
| API-10 / API-11 | `2234a99a` | `api/ops/sales.ts` (sales.get totals via exported `posApiBillTotals`) · `reports.ts` + `report-print-shared.ts` (daily CSV refund count/total) · `register-shared.ts` (`RegisterRefusal.depositId`) |
| PRC-1/2/3 · ACC-2 · TL-5 | `005a860d` + `113d4ca7` | `catalog.ts` (bulk markup skips outranked-notSold) · `channel.ts` / `channel-shared.ts` (name optional on update; update + audit in one runTx) · `price-shared.ts` / `price.ts` (`channelRowOrigin` / `channelOriginOf`, matrix cell origin) · `account-bridge.ts` (other-book rows excluded + WARN) · `display-shared.ts` (published-state schema requires member kind; shared type keeps it optional — view rows have none) · `(store)/d/{actions,page}.tsx` + `DisplayScreen.tsx` (stale cookie clear) |
| RPT-1/2/3/5 · R5 reader (UI-4) | `3d9e16cf` | `reports.ts` (A5 split audits; `staffDiscountBySale` + per-staff A3 base/flag) · `ReportsOverview.tsx` (uses `a3Flag`) · `bills.ts` (business-day cutoff in bkkRange/dayWhere; channelCode filter; line costSatang/marginSatang) · `bills-shared.ts` · `stock-count-actions.ts` (movement `sale {receiptNo, lineName, qty}`) |
| UI-8 server+client (U1) | `3f56a136` | `restaurant/kitchen.ts` (new read-only `kitchenRoutesForPos`, marked block) + `restaurant/index.ts` (marked re-export) · `kds.ts` (`saleNeedsKitchen`) · `kds-actions.ts` (kdsQueueNoAction returns kitchen) · `PayDone.tsx` |
| DOC-1 | `47f66ed4` | `src/lib/pos-integrations.ts` (FACTS) · `ledger/POS-MASTER-PLAN.md` (P2.1–P2.13 ✅) |
| DOC-2 (r4) | `a4c10fc1` | tracked `skills/shark-pos-api/{SKILL.md, references/recipes.md, references/endpoints.md}` · new `scripts/sync-skills.sh` (homes `/root/.claude/skills`, `/root/.claude-b/skills`, tree `.claude/skills` when present; `cmp`; `--check`) · `gen-pos-api-docs.mts` → skills path + "Money in reports and bills" · `docs/api/POS-API.md` regenerated · sales.create `shiftId` describe. Sync run once: 3 destinations OK |
| G3 | `f4378208` | new `scripts/qc-all-discovery.mts` (`QC_ALL_EXCLUDE`, `isQcAllSuite`) · `qc-all.mts` one marked hunk |
| G1 (r5) | `ede9f5a2` | new `scripts/pos-gates-all.sh` (manifest `scripts/pos-gates.json`; `--dry` / `--out` / `--only`; typecheck rule guard; p2.14 ISO_MEM 7G; never exports CI) |
| V1 | `3aa64242` | `scripts/visual-pos.mts` (`EN_MOBILE_PAGES` + jobsPlanned filter) — **2 lines, not one** (deviation D1) |
| H2 + docs | `368e7c56` | `ledger/POS-CONTRACTS.md` (event table +4 + stockCount case + as-built permission table) · `ledger/POS-OWNER-PENDING.md` OP line · `ledger/POS-API.md` / `ledger/DESIGN-POS.md` / `docs/modules/14-pos.md` pointers |
| G4 / CD-10 | `d543c1d7` | `scripts/pos-gates.json` (5 acc-v2-seed account-api suites accepted, `opRef "acc-v2-seed account-api ×5"`) + OP line |
| UI-5 · UI-6 | `ec2f1102` | `TablesScreen.tsx` (planFailedKey + 5 s retry) · `TablePanel.tsx` (`planFailed` → "—" + `pos-tbl-plan-error`, non-interactive) · `developers/pos/page.tsx` (two `overflow-x-auto` wrappers) · i18n `tables.panel.planLoadFailed` |
| UI-9 | `5d96669f` | `service.ts` (`PosSaleError.giftCardRow/attemptsLeft` + `tagGiftPinRow` in preverify + prepare; attempts parsed from the gift-card module message "เหลืออีก N ครั้ง") · `register.ts` (`regPinRow` at the 6 PosSaleError refusal sites) · `register-shared.ts` (RegisterRefusal fields) · `InterimPayDialog.tsx` (`PayError` fields, `payErrorPinMeta`, row-only re-ask, "n tries left") · `RegisterScreen.tsx` / `TableCheckout.tsx` / `OrderPay.tsx` pass the meta · i18n `register.pay.gc.pinLeft` |
| UI-10 | `feff8ad6` | settings `page.tsx` (`isOwner`) · `PaymentSettings.tsx` · `TipSettingsCard.tsx` / `DepositSettingsCard.tsx` (non-owner = owner-only note, no load, no switches) |
| UI-12 | `5bfcd73d` | `register-shared.ts` (HeldCartNoticeCode + CHANNEL_NOT_SOLD) · `held-cart.ts` probe · `RegisterScreen.tsx` notice · i18n `register.held.noticeChannelNotSold` |
| UI-13 | `7353f425` | `use-orders-badge.ts` (`media` param) · `RegisterTopContext.tsx` (mobile `pos-reg-mobile-orders` link + badge, only when new > 0) · `RegisterScreen.tsx` (`ordersHref`) · inventory row |
| RPT-6 | `ba3f040e` | `reports/print/PrintFrame.tsx` (Ctrl/⌘+P → frame print; `@media print` hides the shell) — keyboard + print-CSS variant, not the route-response variant (deviation D5) |
| UI-1 | `7f8de59f` | `PayIntentPanel.tsx` (19ค red card: title · reason · new QR · other method · ref) · `InterimPayDialog.tsx` (`onOtherMethod` → cash) · `PrintStatus.tsx` (`variant="toast"`) · `PayDone.tsx` · i18n `register.pay.intent.{failedTitle,failedTitleCard,otherMethod,failedManualHint,ref}`, `print.failedToast` · inventory row `pos-pay-intent-other-method` |
| UI-2 | `513ec720` | `MobileCartBar.tsx` (`pos-reg-cart-bar-held` on empty cart) · `RegisterScreen.tsx` · inventory row |
| UI-4 (UI half) | `05b70812` | `StockShortcuts.tsx` (bill movements: "ตัดตามสูตร/คืนจากบิล {ของ}" + "{บรรทัด} · บิล {เลข}") · `BillsClient.tsx` + sales `page.tsx` (`canSeeCost` = pos.report.view → `pos-bill-line-cost-<i>`) · i18n `stock.history.{saleCut,saleReturn,saleRef}`, `bills.drawer.lineCost` |
| UI-7 | `905b6973` | `OrderCardView.tsx` (card label `orders.actions.acceptCard`: th "รับออเดอร์" · en "Accept"; panel keeps the long label) · `scripts/visual-pos.mts` orders-manual-sheet: scrollTop 0 of the product list after the click (P2.8U V2) |

## 2. ORACLE-EDIT / ORACLE-ADD (each its own `test(...)` commit · marker `// ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 <id>)`)

| id | commit | file:line (markers) | checks before → after |
|---|---|---|---|
| CD-2 | `27ddcbfe` | `qc-pos-p2.7.mts:394` (`sameAsBaseOrP214Marked` for LEGACY_API_DIR) | 42 → 42 |
| LEG-3 · CD-9 | `6fea40f0` | `qc-ai-wave5b.mts:115, :134, :145` (fixture unit unlinked · W5B-3.3 items rest-… + 0 PosSale · new W5B-3.6) | 24 → 25 |
| CD-3 | `12f8f1f3` | `qc-hf-fu.mts:1157–1176` (HN1 yesterday's held order swept) | 29 → 29 |
| CD-6 | `44092540` | `qc-pos-p2.13.mts:1787` (SH2 sales.get vs billDetail mapped to *Satang) | 54 → 54 |
| CD-5 | `0c8a92f7` | `qc-pos-p1.17.mts:210` (daily CSV header + จำนวนคืนเงิน · ยอดคืนเงิน) | 40 → 40 |
| CD-4 | `2e3e9c4d` | `qc-pos-p2.10.mts:730` (TOTALS_PUB member row kind TIER, inside the fixture block) | 13 → 13 |
| ACC-3 | `4a9bfdb9` | `qc-hf-fu.mts:2031–2106` (ZE3 bill z3b3 stock-tracked, other-book refund, mv0+1) | 29 → 29 |
| PIN-1 (ADD) | `2d3aa24b` | `qc-pos-p1.15.mts:90, :1499` (TK-PP) | 39 → 40 |
| TL-2 | `f0c437e5` | `qc-pos-p2.9b.mts:197` (char-scanner stripComments) | 53 → 53 |
| RPT-4 (ADD) | `315b1c23` | `qc-pos-p2.12.mts:68, :1034, :1588` (AN13 member half, M1 day DM = TD − 8) | 33 → 33 (AN13 half added to an existing id) |
| DOC-1 | `9310613e` | `qc-pos-p1.18.mts:311–323, :1475, :1480` (FACTS · PLANNED_PHASE BOOKING P3 · I8 rule) · `qc-pos-p2.4.mts:56, :640` (ST4 BOOKING facts) | p1.18 unchanged · p2.4 unchanged |
| DOC-2 | `898b9679` | `qc-pos-api-skill.mts:40, :45, :86–88, :311, :405` (SKILL_DIR + both homes) · `qc-pos-p2.13.mts:334` | 12 → 12 · 54 → 54 |
| V4 (ADD) | `9e2b8c82` | `qc-hf-pos-page-authz.mts:160` (PG-1…PG-5) | 82 → 87 |
| lane-pin (r3 · TL-1) | `d688a07b` | `qc-hf-fu.mts:233, :236` · `qc-pos-p2.8.mts:58, :295, :298` · `qc-pos-p2.11.mts:47, :267, :269` · `qc-pos-p2.12.mts:40, :270, :272` · `qc-pos-p2.13.mts:54, :350, :352` · `qc-pos-p2.10.mts:46, :221, :223` · `qc-pos-p2.7.mts:49, :361` | all unchanged (`--list`: hf-fu 29 · p2.8 61 · p2.11 34 · p2.12 33 · p2.13 54 · p2.10 13 · p2.7 42 — the commit message of `d688a07b` says p2.8 60 · p2.11 33 by mistake; no D() was added or removed) |
| PIN-1 fix | `a88687b1` | `qc-pos-p1.15.mts:1517` (TK-PP clears the temp shop's C1/MGR PIN lock before asking for tokens) | 40 → 40 |
| DOC-2 · K2 | `48016985` | `qc-pos-api-skill.mts:45, :88` (home paths via `join`, K6 text without the old skill path) | 12 → 12 |

Lane-pin batch (ruling 3, one commit): the lane base of the seven suites is `rev-parse 64923c13` (fallback = each suite's own `BASE_REV`, unchanged); no `merge-base` call and no `origin/session/pos` string remain in code; four check descriptions that named the origin merge-base were reworded (p2.7:49 · p2.8:58 · p2.11:47 · p2.12:40) — those description lines are outside the §3 line ranges, recorded here. **K3 real and green** after the batch (`--no-db`, and forced run §7).

## 3. LEG commits (veto-droppable)
`086094ca` LEG-1 · `7dd87a55` LEG-2/4 · `1150caa7` LEG-3 · test `6fea40f0` (CD-9, goes with LEG-3) · test `27ddcbfe` (CD-2, goes with LEG-1).

## 4. acc-v2-seed evidence (G4 / CD-10) — `/root/pos-runs/p214-builder/accv2-20261016T045411Z/`
```
qc-account-api-read-docs-unforced 1     ❌ [CRASH] จบ — exp จบ | act ไม่พบระบบที่จะผูกคีย์ในร้านนี้   ผ่าน 0/1
qc-account-api-read-finance-unforced 1  (same)
qc-account-api-read-gl-unforced 1       (same)
qc-account-api-read-master-unforced 1   (same)
qc-account-api-settings-unforced 1      ❌ CRASH — No element found for selector: [data-testid="api-key-name"]   ผ่าน 0/9
```
read-* ×4 need the acc-v2 seed on QC4 (not reseeded — rule); settings additionally needs a served build (:3215 — builders never serve). Accepted in `pos-gates.json` with `opRef`.

## 5. Deviations
- **D1 V1** = 2 lines in `visual-pos.mts` (set + viewport rule, plus the jobsPlanned filter for en mobile) instead of "one line".
- **D2 DEP-1**: the in-tx member-owner refusal (`DEPOSIT_NOT_OWNER` raised inside `createSale`) carries no `depositId` (S does not name the row); register-level refusals do.
- **D3 DSP-1** binding = `ctx.deviceId` (the register's client localStorage device code, same source as register-actions).
- **D4 LEG-2**: POS-linked units with registerV2 off redirect to `/pos/register` (no tables/kds page there).
- **D5 RPT-6**: keyboard Ctrl/⌘+P is intercepted on the print page and prints the frame; browser-menu print uses a print stylesheet that hides the shell and shows only the frame (iframes may print on one page in some browsers). The route-response variant (`text/html` + in-document `print()`) was not built.
- **D6 UI-1**: the 19ค card has "สร้าง QR ใหม่" + "เลือกวิธีอื่น" + ref; "ยืนยันเองเมื่อเห็นเงินเข้า" is not on the failed card because S refuses manual confirm of an expired intent (`INTENT_EXPIRED`, `payment-intent.ts` markPaidCore `refuseExpired`) — a hint line points to the button on the fresh QR. The print-failed toast keeps the old testids (`pos-print-error` + `data-variant="toast"`, `pos-print-retry`, `pos-print-browser`); settings / shift pages keep the card.
- **D7 UI-9**: tries-left is read from the gift-card module's message ("เหลืออีก N ครั้ง", `giftcard/service.ts` verifyPin) — no field in that module; when the text does not match, the row still gets "PIN ไม่ถูกต้อง" without a count. Row = ordinal among GIFT_CARD pay rows (client maps it to its N-th gift-card row).
- **D8 UI-13**: the mobile orders button shows only when new orders > 0 (390 header space); polling runs only < 768 on the register page.
- **D9 UI-4**: `billDetail` returns cost/margin to every bill reader (R5 reader as oracle-pinned); the drawer shows it only with `pos.report.view`. Stock-history `sale.qty` = |movement qty| (R5 check pins qty).
- **D10 UI-7**: card accept label shortened via a new key (en "Accept"); the panel keeps "Accept order".
- Not done (no oracle row, left for the controller): RPT-5 UI half (channel-code filter control), DEP-1 / PRC-3 UI halves, DOC-3, DOC-6, developers kanban/account overflow (other modules' pages).

## 6. CONTROLLER-DECISIONs
- **CD-B1 lane pins vs P2.14's own edits** — with the fixed base `64923c13`, the old lanes' "untouched since base" pins see P2.14's legitimate edits and go red: `qc-hf-fu.mts:533–547` ST1 (restaurant dir — UI-8 `kitchen.ts` facade · `visual-pos.mts` V1/UI-7 · InterimPayDialog/PayDone/BillsClient · service/account-bridge · register*/refund*) · `qc-pos-p2.8.mts:726–745` ST6 (register.ts · service.ts · channel.ts) · `qc-pos-p2.11.mts:271` ST4 (service · account-bridge · refund · register*) · `qc-pos-p2.12.mts:274` ST1 (lane A files incl. display*, RegisterScreen, InterimPayDialog) · `qc-pos-p2.10.mts:329–368` ST2 (register*/service/payment-intent/held-cart hunks, RegisterScreen/InterimPayDialog unmarked lines, and every P2.14 ORACLE-EDIT of another qc file counted as "ข้อสอบเดิมถูกแก้") · `qc-pos-p2.7.mts:388–415` ST2/ST3 (order.ts onIntentPaid block · register.ts/service.ts vs base). These are not regressions; the pins need a second accepted base after P2.14 lands (e.g. the P2.14 merge itself) or per-lane "P2.14-marked hunks allowed" rules — controller call. Builder kept the literal ruling (single fixed pin `64923c13`).
- **CD-B2** `qc-pos-p1.17.mts:~1190` CSV1 `toCells` builds the daily CSV row without the two refund cells added by API-11 — outside CD-5's approved :210 → not edited; p1.17 CSV1 expected red until the controller allows the edit.
- **CD-B3** `qc-account-api-settings` needs a served build in addition to the acc-v2 seed — accepted in `pos-gates.json` with the other four anyway (CD-10).

- **CD-B4 LEG-3 vs P2.5 P8** — `qc-pos-p2.5.mts:2206–2232` P8 expects the AI `restaurant_close_bill` on a table with an OPEN split plan to throw the split-guard reason; the fixture unit is POS-linked, so LEG-3 now refuses earlier with `POS_LINKED` (both the split case and the no-plan control). Stronger refusal, no bill — test outside the §3 list ⇒ not edited (fixture needs a non-linked unit, as CD-9 did for wave5b).
- **CD-B5 ORD-1 vs P2.8 web fixture** — `qc-pos-p2.8.mts:1043–1050` links `S.INV` only to unit A; the web-shop unit S sells inventory-backed `เสื้อ` (`:1149`). With ORD-1 (oracle O5: the web door applies the register's C3 visibility) the shirt is invisible at S ⇒ `ingestInTx` refuses `PRODUCT_NOT_FOUND` ⇒ no PosOrder ⇒ W1 / W3 / W12 red. Fixture fix would be `linkUnit(T, S.INV, U.S)`; outside §3 ⇒ not edited. ⚠️ Product note for the controller: a real web shop whose unit has no INVENTORY link but sells inventory products would stop producing POS orders (ShopOrder still created) — same rule as the register, but worth an owner line.
- **CD-B6 HF-FU staged-lock harnesses vs ORD-2/4/6** — `qc-hf-fu.mts:1289–1351` HN4 flips the channel inside `holdLock(o1)`; with ORD-6 (`SalesChannel … FOR SHARE` before the accept, oracle O1) the flip waits for sweeper S1, which waits for the harness row lock ⇒ harness tx expires at 90 s. `:1359–1426` HN5 (ข) stages a sweeper *waiting* on `posorder-release`; ORD-2 makes the read-path sweep a try-lock (oracle O1: returns `swept:false` < 2 s) ⇒ "(จัดฉากไม่ถึง)". `:1696–1731` OD3 holds the draft row while void + drain reopen the session; ORD-4 (oracle O3) locks the session first ⇒ the reopen waits for the sweeper, the sweeper for the harness ⇒ 90 s expiry. All three are harness orderings that the P2.14 lock rules make impossible; not edited (outside §3).
- **CD-B7 seed-dependent suites (not P2.14)** — `qc-account-api-ai-external`, `qc-account-api-ai-skill` (seed tenant has no account system on QC4: "ยังไม่ได้เปิดระบบบัญชี") and `qc-acc-v2-pos-lines` (OP line, acc-v2 seed) fail like the five accepted acc-v2-seed suites; `qc-member-m1.7 / m2.6 / m2.7 / m2.8` crash at fixture "Cannot read properties of null (reading 'role')" (QC4 member seed user missing). P2.14 does not touch account/member modules (`git log 64923c13..HEAD -- src/lib/modules/account src/lib/modules/member` empty). Controller: accept like CD-10 or reseed (builders never reseed).
- **CD-B8 `qc-pos-p1.6` R2** — `src/lib/modules/pos/qr-staff-actions.ts` (P2.7U `86875e98`, already at base 64923c13; untouched by P2.14) has actions without `catch` ⇒ P1.6-R2 red at base too. Not a P2.14 change.

## 7. Results

**Gate set** (`scripts/pos-gates-all.sh --only <all 93 except typecheck>`, unit `pos-gates-p214-*`, QC4, lock `/tmp/shark-gate-pos.lock`): `/root/pos-runs/p214-close-shark-pos-d-20261016T053356Z/SUMMARY.txt` (HEAD.txt: head `48016985` dirty 0). 93 entries; reds (exit 1) with reason:

| suite | result | reason |
|---|---|---|
| qc-pos-p1.6 | 47/48 · R2 | CD-B8 pre-existing (qr-staff-actions.ts, P2.7U) |
| qc-pos-p1.15 | 39/40 · TK-PP | own ORACLE-ADD was order-dependent (MGR PIN locked by PN-F2 in the same run) → fixed in `a88687b1`; rerun forced **40/40** at `a88687b1` (`/root/pos-runs/p214-builder/p115-rerun-20261016T062634Z/`) |
| qc-pos-p1.17 | 39/40 · CSV1 | CD-B2 |
| qc-pos-p2.5 | 48/49 · P8 | CD-B4 (LEG-3) |
| qc-pos-p2.7 | 40/42 · ST2 ST3 | CD-B1 |
| qc-pos-p2.8 | 57/61 · ST6 W1 W3 W12 | ST6 CD-B1 · W1/W3/W12 CD-B5 (ORD-1) |
| qc-pos-p2.10 | 12/13 · ST2 | CD-B1 |
| qc-pos-p2.11 | 33/34 · ST4 | CD-B1 |
| qc-pos-p2.12 | 32/33 · ST1 | CD-B1 |
| qc-pos-p2.14 | **54/56** · H1 H3 | allowed (HANDOVER-P2 + parity sheet = controller) |
| qc-hf-fu | 25/29 · ST1 HN4 HN5 OD3 | ST1 CD-B1 · HN4/HN5/OD3 CD-B6 |
| qc-account-api-ai-external / ai-skill · qc-acc-v2-pos-lines | crash / seed | CD-B7 |
| qc-account-api-read-{docs,finance,gl,master} · settings | crash | accepted (CD-10) |
| qc-member-m1.7 / m2.6 / m2.7 / m2.8 | crash at fixture | CD-B7 |

Green in the set: every other suite (incl. p2.13 54/54, p2.9b, p2.4, p2.6, p1.18, api-skill, ai-wave5b, hf-pos-page-authz 87) and all commands: fitness-noenv 0 · fitness-qc4 0 · fitness-pos 0 · gen-check 0 · visual-list 0 · visual-dry-th 0 (218 shots) · visual-dry-en 0 (139 shots).

**qc-pos-p2.14**: forced #1 **54/56** (H1 H3) · unforced **54/56** (H1 H3) — `/root/pos-runs/p214-builder/p214-run1-20261016T053126Z/` (head `48016985` dirty 0) · forced #2 **54/56** (H1 H3) in the gate set. crashed false · residue 0 · guardHits 0. K3 green (real) after the lane-pin batch.

**Typecheck**: run once at the final head (see the final report / `typecheck.log` in the gate-set folder).

**`--state` list for the controller to shoot** (QC5 tree d, `--states --state …`): `paydlg-promptpay-timeout` (UI-1 card, th+en) · `paydone-print-failed` (UI-1 toast) · `register default @390` + `held-drawer` (UI-2 entry on the empty cart bar) · `paydlg-giftcard-pin-error` (UI-9 row + tries left) · `settings-payments`, `settings-tip-ledger`, `settings-deposit-toggle` as cashier and owner (UI-10) · `register-tab-badge` @390 (UI-13) · `orders-manual-sheet`, `orders-mixed` en 1024/768 (UI-7) · `reports-print-overview` (RPT-6; Ctrl+P not in harness) · `stock-default` (UI-4 history label) · `bills-drawer` owner vs cashier (UI-4 cost line) · `developers-pos` @390 (UI-6) · `tables-floor-split` (UI-5, failure path needs a forced fetch error — not a harness state).

## 8. Fix round 1 (controller 16 Oct · R1 MERGEABLE-AFTER-FIXES · hunter FINDINGS) — from `6e6a66ac`

Evidence provenance (R1 F10): the earlier gate set `p214-close-shark-pos-d-20261016T053356Z` ran at `48016985` with `--only` (typecheck later at `6e6a66ac`); its HEAD.txt said dirty 0 but the builder notes file was untracked during the run (dirty 1 at the p1.15 rerun). **Superseded**: the fix-round gate set runs the whole manifest (typecheck included) once at the final head with the runner's new dirty-0 guard — path, VERDICT and reds are in the final report.

| # | item | commit(s) | counts / notes |
|---|---|---|---|
| 1 | F3/H1 ORD-1b (CD-B5 re-ruled) | code `7141e7cc` (order.ts: C3 filter only on inventory-linked units; shop/service.ts P2.8-area block throws on `PRODUCT_NOT_FOUND`) · OWNER line `6c39051e` · test `7a11e2a1` (`qc-pos-p2.8.mts:1052` link S.INV → U.S, 61 → 61) · test `3cf694f6` (p2.14 O5 edited: refusal on unit W linked to a 2nd inventory, unlinked B keeps the old rule · new **O5b** through shop `createOrder`, 56 → 57) | p2.8 now 60/61 (ST6 lane-pin only) |
| 2 | F1/H2 cost/margin | code `7673ac45` (bills.ts `canCost` = `pos.report.view` at the unit; REST `sales.get` drops null fields; API doc line) · test `53f8fb16` **R5b** (57 → 58) | `gen --check` 0 |
| 3 | F2/H3 legacy door completeness (droppable LEG set) | code `dbdb68ed` **LEG-2b** (guards on voidCheckout · createStaffOrder · create/duplicateItem · open/close/moveSession · setTableStatus · rotateQr · linkMemberByPhone · confirmOrder · rushOrder · ack/doneRequest; hub page redirects to POS) · test `2ce422d0` L3 rows (voidCheckout 0 VOIDED / bill PAID / table unchanged · createStaffOrder 0 rounds · static list covers all 20) | count unchanged. Config writers kept open (settings · stations · categories · option groups · item stock · zones · tables · archive): POS has no UI of its own for them (deviation D11) |
| 4 | F4/H4 DSP-1b | code `a560af7d` (server device = actor's OPEN PosShift device at the unit; `args.deviceId` ignored; else `DEVICE_NOT_REGISTERED`) · test `d9154d0e` **D1b** (58 → 59) | P1.10 has no device cookie/registration identity (`device.ts` heartbeat takes `deviceCode` from the client) ⇒ the controller's fallback rule. Deviation D12: a register without an open shift by the session user cannot drive its customer display |
| 5 | F6/H6 preorder dup | `c313ab9f` (`qr-order.ts` dup branch → `orderIntentUnused(prepared, "DUPLICATE")`) | — |
| 6 | F7 one shift resolver | `e3ed1ebd` (`shift.ts resolveApiSaleShift` used by POST /sales and orders.pay · `api/units.ts` duplicate removed · `REG_KEY_PREFIX` exported and reused) | **CD-F7** below |
| 7 | H5 runner | `f130dd31` (VERDICT line · exit 1 on non-accepted rc≠0 / unmatched `--only` · dirty>0 refused with porcelain · accepted needs `evidence`, optional `checks` = only those ids may fail) · manifest `acad9309` | tested: `--only bogus` ⇒ VERDICT red rc 1 · dirty ⇒ rc 2 |
| 8 | CD-B8 (R1) | test `d6d163dc` (`qc-pos-p1.6.mts:501–513` R2 accepts actions returning through a same-file try/catch wrapper) | 48 → 48 · p1.6 48/48 |
| 9 | CD-B2 + F11 | code `22fb89d2` (daily CSV refund columns moved to the END, after เฉลี่ยต่อบิล / "Average bill"; docs + SKILL.md text; skills synced) · test `b16d2601` (`qc-pos-p1.17.mts:210` header order + `:1191` toCells two cells at the end) | 40 → 40 · p1.17 40/40 |
| 10 | CD-B4 (R1) | test `f5d74b1c` (`qc-pos-p2.5.mts:2206–2234` P8 fixture stays POS-linked; POS_LINKED accepted as the refusal; no-plan case asserts POS_LINKED · no bill · table OPEN) | 49 → 49 · p2.5 49/49 |
| 11 | CD-B6 re-stage | `b63fb633` HN4 (channel changed after the sweep) · `8a9244a8` HN5(ข) (held release lock ⇒ `swept:false` < 2 s, next call accepts: 1 bill 1 round) · `11f91af4` OD3 (third tx holds + reopens the session; sweeper waits on the session lock; draft stays HELD) | 29 → 29 · hf-fu 28/29 (ST1 lane-pin only) |
| 12 | CD-B3/B7 manifest | `acad9309` + OP lines | excerpts below |
| 13 | F11 small · DOC-3 · F8 · RPT-5 · HF-FU2 | `b5c42222` (kitchen.ts block above the `kitchenStationsForPos` JSDoc · UI-5 retries only on a failed fetch) · `ac723409` (DOC-3 LANE-RULES §5 = 8192 / 10500M · F8 tax-invoice summary "one per bill, request key audit-only") · `375a0608` **RPT-5** (all-branches channel-code filter `pos-bills-channel-code-filter` + inventory row) · `f48c4f98` HF-FU2 line (PRC-1 over-skip · RPT-6 route variant · developers kanban/account overflow · CD-F7) | DOC-6 was already true at base (`register.ts:2742` HF-TX rewrote the regCreateSale comment) — nothing to change |

Pre-gate check at `f48c4f98` (dirty 0, `/root/pos-runs/builder` runs `fx1-pre-20261016T071346Z`): p2.14 forced **57/59** (H1 H3) · p2.8 60/61 (ST6) · hf-fu 28/29 (ST1) · p2.5 49/49 · p1.17 40/40 · p1.6 48/48 · p2.13 54/54.

### Accepted-red evidence (ruling 21) — manifest `accepted.evidence`
- `qc-account-api-ai-skill` (gate log): `❌ [E1-K2.1] account_dashboard … act {"error":"ยังไม่ได้เปิดระบบบัญชี …` (all E1-K2.x the same) — seed tenant has no account system on QC4.
- `qc-account-api-ai-external` (controller base run `/root/pos-runs/aiext-base-c-20261016T064733Z/`, `tree=…shark-pos-c head=64923c13 dirty=0`): `❌ [CRASH] จบ — exp จบ | act Cannot read properties of undefined (reading 'slice')` · `ผ่าน 0/1` — identical at base.
- `qc-acc-v2-pos-lines`: `❌ PL1.1 เอกสารบิลขายหน้าร้าน 2 ใบ — ได้ 0 · ควรได้ 2` (PL1.x read 0 documents; R14 exception).
- `qc-member-m1.7 / m2.6 / m2.7 / m2.8`: `❌ [M?.?-ERR] ข้อสอบรันจนจบ — exp จบ | act Cannot read properties of null (reading 'role')` (fixture; member seed).
- `qc-account-api-settings`: `❌ S1.1 เปิดแท็บแอปภายนอก/API ได้ (มี connections-api) — ไม่พบ connections-api` (needs a served build — account-api lane).
- acc-v2-seed ×4: `❌ [CRASH] … act ไม่พบระบบที่จะผูกคีย์ในร้านนี้` (`accv2-20261016T045411Z`).
- Lane-pin class (CD-B1, accepted with `checks`): hf-fu ST1 · p2.7 ST2/ST3 · p2.8 ST6 · p2.10 ST2 · p2.11 ST4 · p2.12 ST1 — any other failure in those suites is red. p2.14 accepted with `checks` H1 H3 only.

### Fix-round deviations / CONTROLLER-DECISIONs
- **D11** LEG-2b guards only the operational writers; setup writers stay open (POS has no zone/table/station/menu-category UI of its own — closing them would leave POS-linked shops unable to set up tables).
- **D12** DSP-1b uses the session user's OPEN shift device (no server-side device identity in P1.10). Displays on registers selling without a shift by that user, or where another staff member opened the shift, are refused `DEVICE_NOT_REGISTERED`.
- **CD-F7** `orders.pay` via REST keeps "cash always in a shift" (`strictCash`, `order.ts` payOrder ≈:1341) because `qc-pos-p2.13.mts:1591–1612` OR7 (controller ORACLE-ADD, P2.13 fix 1 H3) pins `requiredOtherSources` off + no open shift + cash ⇒ 409 SHIFT_REQUIRED. F7's "otherSources off ⇒ outOfShift, no bind" for orders.pay would turn OR7 red and put REST cash outside any shift. One resolver is shared (`shift.ts resolveApiSaleShift`); flipping `strictCash` to false is a one-line change + an OR7 ORACLE-EDIT if the controller rules that way.
- O5 (oracle) was edited, not only O5b added: with ORD-1b the unlinked unit B no longer refuses, so O5's refusal moved to a unit linked to a second inventory (W) and B became the "old rule" control.

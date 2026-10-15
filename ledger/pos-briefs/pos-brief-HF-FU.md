# Brief: HF-FU — follow-up bucket (server hygiene) · lane C · ⏮ P2.11 S+U, P2.9b S · DRAFT by brief drafter (account B) 15 Oct 2026. The controller rules in §10.

Brief draft · 15 Oct 2026 · read-only survey of `session/pos` **c3c52ef1** (local merge, not pushed; code = P2.11U `5f554f9e` + P2.9b S `c3c52ef1`). Every path:line below is at c3c52ef1 (`git show c3c52ef1:<path>`). Scope source = `pos-brief-P2.11.md` §3 table rows a b c d i j n p s + l-rest (`:73–91`), the card line `:95` (+ P2.8 hunt nits, P2.8U F3), §10 ruling 3; the P2.9b infos in `wo-notes/pos-P2.9b-review.md` §"Controller decision" (last line); the small server-side P2.11/P2.11U follow-ups (`pos-P2.11U-review.md:28, :66`, `pos-P2.11U.md:177`, `pos-P2.11.md:108`).

⚠️ Prompt-vs-code (read first):
1. **`order.ts:1026` is `voidRefusal`'s doc comment**, not a reader. The reader for item n is `getOrder` (`order.ts:1342–1391`). Its `OrderDetail` has `saleId` but no sale status (`order-shared.ts:178, :196`).
2. **Nothing records "held by the kitchen" on an order.** At ingest a blocked auto-accept just returns `accepted:"none"` (`order.ts:632–633`). `PosOrder` has no such field (`pos_order.prisma:32–72`). `PosOrderEvent.type` is a free string (`:99`). So a sweeper cannot tell "held by the kitchen" from "channel had autoAccept off" without a marker (§2 a). The 09 "held" badge is computed client-side from today's settings (`OrdersScreen.tsx:466–467, :653`).
3. **The kitchen pause writer is the frozen restaurant module.** It is `menu.setKitchenPause` (`restaurant/menu.ts:48–60`), called by `kitchenPauseAction` (`actions/restaurant.ts:63–70`), which is also used by the new KDS screen (`KdsScreen.tsx:33, :274`). Its body is hash-pinned (`qc-pos-p2.6.mts:420` SIGS_BASE `menu.setKitchenPause`, the same for `table.mergeSession`/`closeSession`, `order.checkout` `:418–419`). So unpause hooks go in the **actions layer** (the P2.5 N2/F2 pattern), never in `restaurant/**`.
4. **d is half done.** The legacy merge already refuses an OPEN plan on either side (`actions/restaurant.ts:291–293` → `legacyMergeSplitGuard` `table-split.ts:604–609`). What is left is hunter Low A: DONE plans on the from-session are not repointed (`pos-P2.5-review.md:123–124`). `qc-pos-p2.5` T5's positive control **pins today's behaviour**: "DONE plans only ⇒ legacy merge ok" (`qc-pos-p2.5.mts:2583–2592`). So the "refuse" variant needs an ORACLE-EDIT of T5.
5. **The P2.9b infos live in `account/**`** (`account/index.ts:755–759`, `account/gl.ts:1793–1806`). That set was lane A in flight; it is free now that P2.9b has merged.
6. **Marker windows pin the `pos.sale.voided` key line.** `qc-pos-p2.4` ST3 (`:620–622`), `qc-pos-p2.6` ST3 (`:700–708`) and `qc-pos-p2.8` ST3 (`:683–687`) each look for their `POS P2.x ▸` marker within ±8 lines of `"pos.sale.voided":` (`outbox-consumers.ts:728`). The markers sit at `:724/:725/:727`.
   - At most **4** new lines may go above `:728`.
   - Item j's hunk must go **below** the key line, inside the main try-chain (`:758–764`).

## 0. What exists (verified at c3c52ef1)
- **a held-NEW**:
  - Ingest: `auto = start==="NEW" && ch.autoAccept && !isManual && !autoAcceptBlockedInTx` (`order.ts:632`). Blocked = kitchen paused, or any station's open tickets ≥ `autoAcceptMaxOpen` (`kds.ts:380–387`).
  - Accept: `acceptInTx` NEW→ACCEPTED, plus the kitchen round, plus the PLATFORM sale in the same tx (`order.ts:504–529`). Its after-commit work is `afterSaleCommit`, adapter `accept`, audit and `scheduleDrain` (`order.ts:642–649, :937–942`).
  - Ceiling writer: `kdsSetAutoAcceptMax` (`kds.ts:738–749`). Backlog falls through `moveTicket` (`kds.ts:551–565`) and the kitchen cancel consumers (`kds.ts:753–776`).
  - Read-path write precedent: `kdsBoard` heals tickets on read (`kds.ts:624`). Hourly cron already runs POS sweeps (`api/cron/hourly/route.ts:10–11, :87–98`).
  - Pin: `qc-pos-p2.6` O4 holds a CHAT order NEW at ceiling 1, then clears the ceiling and ingests a **new** order (`:2052–2083`). It never re-reads the held one.
- **b orphan drafts**:
  - POS close discards HELD table drafts in the same tx (`table.ts:430–436` → `held-cart.ts:361–388`, audit `via:"table_closed"`).
  - The legacy paths close sessions without that step: `closeSessionAction` → `table.closeSession` (`actions/restaurant.ts:272–276`, `restaurant/table.ts:293–310`), `checkoutAction` (`:403–421`), the AI close-bill path, and legacy merge (sets MERGED + `mergedIntoId`, `restaurant/table.ts:366`).
  - Drafts are excluded from the drawer (`held-cart.ts:429–435`). Session status reader: `tableSessionForPos` (`restaurant/pos-tables.ts:121–127`).
- **c EQUAL**:
  - Per-item shared remainder goes to `p <= r` (always the low parts) (`table-split-shared.ts:152`).
  - EQUAL totals are `q+1` to parts 1..r, then `s = t − b + d` (`:168–174`). A negative `s` moves into the bill discount (`:203–207`).
  - The UI preview uses the same pure function (`TableSplitDialog.tsx:18, :213`, `table-split-ui.ts:163`).
  - Pins: oracle reference `refAlloc` share loop (`qc-pos-p2.5.mts:275`), M2 text "ฐาน 41334/41334/41332 … เศษไปใบต่ำ" (`:57`), M6 500-plan property vs `refAlloc` (`:900–941`).
- **i C7** (`qc-pos-p2.5.mts:2371–2400`): 10 parallel wrong-PIN part submits. It was green before the fix it pins (`pos-P2.5-review.md:116, :123`). The pre-fix ancestor is `1a964205`; the fix is `c4194261` (`preverifySaleGiftPins`).
- **j**:
  - The main steps run inside one try-chain, and any failure rethrows, so the event is retried (`outbox-consumers.ts:729–764`).
  - `posOrderOnSaleVoided` is the **last `compose` extra** (`:765`), and `compose` swallows extras with a WARN (`:452–470`).
  - `orders.onSaleVoided` (`order.ts:1427–1446`) is idempotent: a closed order or an already REFUNDED one does nothing.
- **n**:
  - The panel computes `noCancel = … d?.saleId && !p.saleVoided && !p.perms.voidSale` (`OrderPanel.tsx:61`). `saleVoided` is only set after a failed hand-over (`OrdersScreen.tsx:241, :399, :505`).
  - The server already cancels an order whose bill is VOIDED without `pos.sale.void`, because the void branch runs only for PAID (`order.ts:1059–1078`).
- **p**:
  - th title `"ใบรายการ — ไม่ใช่ใบเสร็จรับเงิน/ใบกำกับภาษี"` (`pre-bill-render.ts:56`) is rendered as one `.t` div (`:143`) and also as `<title>` (`:141`). ESC/POS wraps at spaces (`:164–180, :235`).
  - Pins: B3 needs `html.includes(PREBILL_TITLE_TH)` and `PRE_BILL_LABELS.th.title ===` the same string (`qc-pos-p2.5.mts:485, :961, :975`). ST3 needs the renderer pure, importing only `*-shared`/`receipt-render` (`:714–720`).
- **s**:
  - `planView` returns `memberId` only, and no paid methods (`table-split.ts:83–125`; type `table-split-shared.ts:211–224`).
  - The dialog makes N `billDetailAction` calls for the methods (`TableSplitDialog.tsx:152–173`). Names come only from the session member or picks (`:108, :328, :839`).
  - The reader `registerMemberBriefs` (`register-member.ts:122`) is already imported by `table-split.ts` (`:17`).
- **l-rest**:
  - Recipe: `recipeRefusalText` shows the service's Thai message inside `errors.serverValidation` (`recipe-ui.tsx:53–57`). The writer's VALIDATION messages are Thai-only with no sub-code (`catalog.ts:2104–2113, :2152–2153, :2178–2190, :2262–2266`). The price precedent is `invalidAt(message, field, reason)` (`catalog.ts:85`, `PriceRefusalReason` `price-shared.ts:48`).
  - Orders F7: `assertCustomerLinks` returns VALIDATION with Thai text and no `messageKey` (`order.ts:652–661`). The UI prefers `messageKey` (`ManualOrderEntry.tsx:235`).
  - P2.8U F3: a raw `prisma.salesChannel.findMany` in the action (`order-ui-actions.ts:46–48`).
- **hunt nits** (`pos-P2.8-hunt.md:108, :129`):
  - The handOver sale read is outside the tx (`order.ts:983–986`).
  - `webOrderForUpdate` locks `WHERE "shopOrderId"=…` with no tenant predicate (`order.ts:852–857`).
- **P2.9b infos**:
  - `posSalePosted` = PAID JV only (`account/index.ts:755–759`). Its readers: refund consumer steps (`refund-consumer.ts:60, :77`) and `ensureDepositReceiptsPosted` (`account-bridge.ts:201–205`).
  - Marker = AuditLog `account.external.zeroEntry`, written once under an advisory lock, filtered by **tenant + targetId only** (`gl.ts:1793–1806`). It is written at `index.ts:267`. The commission gate accepts PAID or the marker (`index.ts:723`).
  - A10 replays at `qc-pos-p2.9b.mts:2102–2114` but never counts markers.
- **P2.11 FUs**:
  - `report.channels.empty` = "ยังไม่มียอดวันนี้" / "No sales yet today" for any range (`messages/th|en/pos.json`). A sibling exists: "ไม่มีข้อมูลในช่วงนี้" (`th/pos.json:882`).
  - `unitProducts` returns `truncated` per unit but drops it per unit (`products-data.ts:77–92, :212`), and a `CatalogError` returns `truncated:false` (`:88`). The drawer marks every unit with `available[u]===undefined` as unstocked (`ProductPanel.tsx:101, :296–299`).
  - L3: `setChannelPrices` input `{productId, rows, purgeDead?}` locks the product, then reads `beforeRows` (`catalog.ts:2399–2429`). There is no precondition.

## 1. Goal / out of scope
Goal: close every server-side item below with the smallest marked hunk, each pinned by a check that is red at c3c52ef1 (or by a named PAR control). No migration (expect none; a held marker is a `PosOrderEvent` row, and book-scoping is a JSON field on the existing AuditLog row). Refusals stay `{ok:false, code, message(th)}` plus `messageKey`/`reason` where new. th+en keys, ST7. Facades only across modules.
Out: e (legacy guards outside the tx) → P2.14 · f, o → UI/owner lines · g (PIN hashed twice; contract field) → P2.13 · q, r → P2.9bU · m(ii)/(iii), G2, bills chip, F7 compare source → P2.12 · stale MANAGER membership sweep (harness only) → the next visual-harness touch.

## 2. Items: defect → smallest fix (owner · size · risk · oracle)
| # | Defect (evidence) | Smallest fix (proposal) | Owner · size · risk | Oracle |
|---|---|---|---|---|
| a | A NEW order held by pause or ceiling stays NEW for good once the kitchen frees (§⚠️2, `order.ts:632`) | (1) At ingest, when `auto` was false only because of `autoAcceptBlockedInTx`, add event `type:"held"`, payload `{reason:"paused"\|"backlog"}`, from NEW to NEW. (2) `releaseHeldOrders(tenantId, unitId, {limit:20})` in `order.ts`: candidates are NEW at the unit with a `held` event, channel still `active && autoAccept && !MANUAL && !paused`, oldest `receivedAt` first. Each runs in its own `mutate` tx: re-check `autoAcceptBlockedInTx`, stop at the first blocked one, then `acceptInTx(auto:true)`. A sale refusal (`OrderAbort`) ⇒ skip, stays NEW, gets a `held` payload `{reason:"sale_refused"}` so it is not retried every poll. Same after-commit work as ingest (`afterSaleCommit` · adapter `accept` · audit `pos.order.accept {auto:true, swept:true}` · `scheduleDrain`). (3) Triggers (Q1): `kitchenPauseAction` after `paused=false` (actions layer), after `kdsSetAutoAcceptMax`, and on read in `listOrders` + `kdsBoard` (the heal precedent). UI: add `held` to `EVENT_TYPES` (`OrderPanel.tsx:24`) + key `orders.event.held` | POS `order.ts`, `kds.ts`, `actions/restaurant.ts` (1 marked line) · M · Med (accepts money-bearing PLATFORM bills) | ADD HN1–HN3 · regression p2.6 O4/K-family, p2.8, hf-tx (sweeper → `orderCreateSale`) |
| b | Legacy close/checkout/merge leaves HELD table drafts on non-OPEN sessions (hidden, never expired) (`pos-P2.4.md:98`, OP `:170`) | `sweepOrphanTableDrafts(db, {tenantId, systemId, unitId, limit 50})` in `held-cart.ts`: HELD drafts with a `tableSessionId` whose session (via `tableSessionForPos`) is not OPEN ⇒ DISCARDED + audit `pos.heldCart.discard` `via:"session_not_open"` with actor SYSTEM, the same row shape as `:373–385`. Called on read from `registerTables` (`table.ts:112`). No age window (Q2). MERGED: discard (rec) or repoint to `mergedIntoId` (Q2) | POS `held-cart.ts`, `table.ts` · S · Low | ADD OD1–OD2 · regression p2.4 (P2 "HELD draft ⇒ stays OPEN"), p2.5 |
| c | EQUAL shares put every per-item remainder on the low parts ⇒ phantom service up to the item count (`pos-P2.5-review.md:10–14`, OP `:167`) | Rotate the share remainder: keep a running offset `rot` across shared items. Part p gets +1 when `((p−1−rot) mod N) < r`, then `rot = (rot + r) mod N` (`table-split-shared.ts:147–153`). The `stockOwner` rule is unchanged (part 1). Totals t are unchanged (`:168–172`). Q3: EQUAL only, or SEAT shares too (rec: both, one rule) | POS pure · S · Low money (Σ exact, VAT on t_i) | ADD EQ1–EQ2 · **ORACLE-EDIT p2.5** `refAlloc` `:275` (same rotation) + M2 D-text `:57` (bases). M2/M6 must stay green with the edited reference. Hunter on the allocator |
| d | Legacy merge with DONE plans on the from-session ⇒ a later part void re-opens the plan on the MERGED session (`pos-P2.5-review.md:123–124`) | Rec **refuse**: `legacyMergeSplitGuard` also refuses when the from-session has a DONE plan (`table-split.ts:607`, status `in [OPEN]` → OPEN on either side, or DONE on from). Alt **repoint after**: `repointSplitPlansInTx` in its own tx right after `table.mergeSession` returns ok (a ms race window remains) (Q4) | POS `table-split.ts` (+ action unchanged) · S · Low | ADD DM1 · refuse ⇒ **ORACLE-EDIT p2.5 T5** control (`:2583–2592` → "no plan ⇒ merge ok"; DONE-from ⇒ refused) |
| i | C7 cannot fail on its defect (`pos-P2.5-review.md:123`) | Hunter probe: tx3 holds the card row `FOR UPDATE`, one wrong-PIN part submit is fired, tx4 runs `SELECT … FROM "RestaurantOrderItem" WHERE id IN (part items) FOR UPDATE NOWAIT` ⇒ must succeed (the pre-verify runs before any part/item lock). Release tx3 ⇒ the submit returns `GIFT_CARD_PIN` | oracle only · S | **ORACLE-EDIT p2.5 C7** (`:2371–2400`, dated marker). Fail-before = the probe run on `1a964205` (pre-`c4194261`) ⇒ NOWAIT 55P03 (controller-run, scratch worktree) |
| j | `orders.onSaleVoided` failure is swallowed; a voided order can stay READY (`pos-P2.8.md:192`, OP `:114`) | Move `posOrderOnSaleVoided` from the outer `compose` (`:765`) into the main try-chain after the deposit step (`:758–763`), same `failed/err` pattern. Marked `// POS HF-FU ▸ j ◂` **below** the key line (§⚠️6). No new event (Q5) | shared hot `outbox-consumers.ts` · S · Med | ADD VO1 · regression p2.8 (W-family, ST3), p2.4/p2.6 ST3 windows, p2.9/p2.9b void chains |
| n | Cancel stays disabled for a user without void permission while the voided-bill consumer lags or fails (`pos-P2.8U-review.md:10, :18`) | `OrderDetail.saleStatus: "PAID"\|"VOIDED"\|"REFUNDED"\|null` (additive, read in `getOrder` with one `posSale` select). `OrderPanel.tsx:61` treats `d.saleStatus==="VOIDED"` like `saleVoided`. Server unchanged (already allows it, `order.ts:1059–1078`) | POS `order.ts`, `order-shared.ts` + `OrderPanel.tsx` · S · Low | ADD CN1–CN2 |
| p | th pre-bill title wraps mid-word at 80 mm (`pos-P2.5U.md:59, :87`) | HTML only: `.t` renders two no-break spans, "ใบรายการ —" and "ไม่ใช่ใบเสร็จรับเงิน/ใบกำกับภาษี" (`white-space:nowrap`, second span `font-size:.95em`, `<wbr>` after "/" for 58 mm). `L.title` and `<title>` are unchanged, so B3 stays green. ESC/POS bytes are unchanged | POS pure renderer · S · cosmetic | ADD PB1 · regression p2.5 B3/B1/B2 |
| s | Split cards lack member names (non-table members) and paid methods (N calls) (`pos-P2.5U.md:53–55, :60`) | `SplitPlanPartView.memberName: string\|null` and `paidMethods: PosPayType[]\|null` (additive). Filled in `registerSplitDetail`/`registerSplitTable`: names via `registerMemberBriefs(actor)` (other system or not permitted ⇒ null, never another tenant), methods = distinct `posPayment.type` of the part's PAID sale in one query. The dialog uses them and drops the per-part `billDetailAction` loop | POS `table-split*.ts` + `TableSplitDialog.tsx` · S · Low | ADD SM1–SM2 |
| l1 | Recipe VALIDATION shows Thai service text in en (`pos-P2.3U-review.md:16, :61`) | Recipe writers throw `invalidAt(msg, field, reason)` with `RECIPE_REFUSAL_REASONS` = KIND · ITEM_ARCHIVED · ITEM_SERVICE · DUPLICATE · NO_LINES · SHAPE (`catalog.ts:2104–2266`). `recipeRefusalText` maps `reason` → `pos.products.recipe.errors.<reason>` before the service text | `catalog.ts` (F15.1 single writer) + `recipe-ui.tsx` · S · Low | ADD LK1 · regression p2.3 (recipe pins), p1.1 G4 |
| l2 | Orders F7: bogus member/party/conversation ⇒ generic text (`pos-P2.8U-review.md:2`) | `assertCustomerLinks` refusals carry `messageKey` `orders.errors.memberNotFound \| partyNotFound \| conversationNotFound` (th/en) | `order.ts` · S | ADD LK2 (with F3) |
| F3 | Raw prisma read in the action (`order-ui-actions.ts:46–48`) | Module reader `orderChannelSettings(ctx, actor)` in `order.ts` (same select, the scope of `listChannels`). The action calls it | `order.ts` + action · S | LK2 static part |
| h1 | handOver reads the sale outside the tx (`order.ts:983–986`) | Inside the `mutate` callback: `SELECT status FROM "PosSale" WHERE id=… AND "tenantId"=… FOR SHARE`. VOIDED ⇒ `OrderAbort(stateInvalid … saleVoided)`. Lock order: PosOrder CAS, then PosSale share (void never locks PosOrder in its tx) | `order.ts` · S · Low | ADD HU1 |
| h2 | `webOrderForUpdate` lock without a tenant predicate (`order.ts:853`) | Add `AND "tenantId" = ${tenantId}` when given | `order.ts` · XS | HU1 static |
| z1 | R5 F2: `posSalePosted` ignores the marker ⇒ every refund re-runs `bridgePosSalePaid` | `posSalePosted` = PAID JV **or** (marker **and** the sale document exists). The doc condition keeps the healing path of R5 F1/hunter "marker without a document" (Q6) | `account/index.ts` · S · Low | **ORACLE-EDIT p2.9b A10** (+2 asserts after `:2104`/`:2111`: `posSalePosted(b2)===true`, marker rows `==1`) |
| z2 | R5 F3/H3: marker count not pinned | as z1 (same edit) | oracle | in z1 |
| z3 | H1: the marker opens the commission gate in another book after a relink (`gl.ts:1796`) | `recordExternalSaleZeroEntry` writes `after.bookSystemId = ctx.systemId`. `externalSaleZeroEntryRecorded` filters `after: {path:["bookSystemId"], equals: ctx.systemId}`. Pre-prod markers (QC only) without the field are ignored (Q7) | `account/gl.ts` · S · Low | ADD ZE1–ZE2 |
| z4 | H2: owner line missing the "cash-only bill after de-registration strands 2200" half | `POS-OWNER-PENDING.md` (P2.9b ruling-2 line extended) | ledger | ST2 grep |
| f1 | `report.channels.empty` says "today" for any range (`pos-P2.11U-review.md:28`) | th "ไม่มียอดในช่วงนี้" / en "No sales in this period" | messages · XS | FU1 |
| f2 | Unstocked line is also shown when a unit's list is truncated or fails (`pos-P2.11U.md:177`) | `ProductsData.incompleteUnitIds` (truncated or `CatalogError`, `products-data.ts:77–92`). The drawer shows `branch.unstocked` only for complete units, and a neutral `branch.incomplete` ("ยังโหลดสินค้าของสาขา {unit} ไม่ครบ") otherwise. Rows stay in the payload (P2.11U ruling 1 unchanged) | products page data + `ProductPanel.tsx` · S | FU1 |
| f3 | Hunt L3: whole-set save without a precondition (`pos-P2.11.md:108`) | **≤ 1 param ⇒ eligible**: optional `expectedRowsHash` on `setChannelPrices` (`CP_TOP_KEYS`), compared under the existing product lock with a pure `channelRowsHash` (`price-shared.ts`). Mismatch ⇒ `CONFLICT` "ราคาของสินค้านี้ถูกแก้จากที่อื่น — โหลดใหม่". Absent ⇒ today's behaviour. The loader sends the hash and the drawer echoes it (Q8) | `catalog.ts`, `price-shared.ts`, `products-data.ts`, `ProductPanel.tsx`, price action · S–M · Low | FU2 · regression p2.11 PR family, p2.2 |

## 3. Schema / migration
None. `PosOrderEvent.type` is a string (`pos_order.prisma:99`). `AuditLog.after` is JSON. Static ST1 pins "no migration, `prisma/` unchanged".

## 4. Sequencing / lane / hot files
- **Tree c is free; run HF-FU there now**, from `origin/session/pos` once c3c52ef1 is pushed (oracle-first: `wip/pos-hf-fu-oracle` → builder `wip/pos-hf-fu`). Tree b keeps the P2.9b merge gates, then P2.9bU. The lane ceiling stays 2.
- **HF-FU never touches**: lane-A core `register*.ts`, `service.ts`, `tender*.ts`, `refund*.ts`, `deposit.ts`, `account-bridge.ts`, `refund-consumer.ts`; pay UI `InterimPayDialog.tsx`, `PayDone.tsx`, `BillsClient.tsx`; `restaurant/**`;
  - `scripts/visual-pos.mts` (no new harness state, §9).
- **Hot files vs P2.9bU** (`pos-P2.9b.md:90–103` + rows q/r of `pos-brief-P2.11.md:89–90`):
  - `messages/{th,en}/pos.json` (append-only keys) and `POS-OWNER-PENDING.md`: keep both sides.
  - `order.ts`: only if P2.9bU takes r's `payOrder` tender. HF-FU hunks sit in other functions (`ingestInTx` tail, new `releaseHeldOrders`, `getOrder`, `step`, `webOrderForUpdate`, `assertCustomerLinks`).
  - `TableSplitDialog.tsx` / `table-split-shared.ts` types: r's part-pay tenders vs s.
  - No overlap with `register.ts`, `deposit.ts` or the pay dialog.
- **Hot files vs P2.10** (customer display, lane A, `POS-MASTER-PLAN.md:85`): only `messages/*` (and `visual-pos.mts`, which HF-FU leaves alone).
- **Hot files vs P2.12** (lane B, `:87`): `catalog.ts`/`products-data.ts`, only if f3 is in. P2.12 starts after.
- **Merge order (rec)**: (1) HF-FU **before** P2.9bU if it is ready first (smaller, server-side; c and j change the void chain and the split allocator, which P2.9bU's part-pay work should build on). (2) The second card merges `origin/session/pos` before its final gates. (3) P2.10 after both. (4) Do not wait: if P2.9bU finishes first, HF-FU merges upstream and re-runs p2.9b + p2.9.

## 5. Open questions (controller decides; recommendation first)
1. **a cadence** — Rec: after-commit at unpause (`kitchenPauseAction`) and ceiling change, plus on read in `listOrders`/`kdsBoard` (screens poll; precedent `kds.ts:624`), with `limit 20` per call. No cron (hourly is too coarse; it can be added to `api/cron/hourly` later). Also: should the sweep accept orders held longer than X (e.g. older than the business day)? Rec: same bizDate only (`posDayStart`), older ones stay for staff.
2. **b orphan expiry** — Rec: discard as soon as the session is not OPEN (the same semantics as POS close, P2.4 CD 8), no age window. MERGED sessions: discard (rec, the legacy page retires in P2.14) vs repoint to `mergedIntoId` with `repointTableDraftsInTx` (`held-cart.ts:401`, needs `mergedIntoId` from a facade read).
3. **c rule** — Rec: rotate in EQUAL **and** SEAT shared items (one share rule; M3's yum 3,750 × 4 divides evenly, so 15C numbers are unchanged). Stored plans are not recomputed. EQUAL totals stay `q+1` to parts 1..r.
4. **d** — Rec: **refuse** when the from-session has a DONE plan (no race; ORACLE-EDIT T5 control). Alt: repoint after `mergeSession` (T5 green, ms race with a concurrent part void).
5. **j shape** — Rec: a step in the voided main chain (6 lines, retries with the event; every step is idempotent). A new outbox event would need its own consumer + a replay ×2 oracle (COMMON 4) for no extra safety.
6. **z1 rule** — Rec: marker **and** document. Marker alone would stop a refund from healing a sale document lost after FAILED retries (R5 F1).
7. **z3 legacy markers** — Rec: strict book filter. Markers without `bookSystemId` exist only on QC (P2.9b is not on `main`) ⇒ ignored. Alt: treat a missing field as a match (keeps H1 open for old rows).
8. **f3 L3** — Rec: **in** (one optional server param + loader/drawer echo + FU2). Alt: P2.12 as planned (`pos-P2.11U.md:69`).

## 6. Oracle plan — `scripts/qc-hf-fu.mts` (25 checks; red-before `ledger/wo-notes/HF-FU-red.txt`)
**Fixtures:** temp tenant `posqc-hffu-<rand>` (+ `-t2` for X2): POS unit A (+ B for scope), kitchen stations, channels CHAT (autoAccept), LINEMAN (PLATFORM payout, autoAccept), MANUAL; OWNER, STAFF (no `pos.sale.void`); two ACCOUNT books (relink for ZE1). Module functions only. Raw SQL only for timestamps and the C7/HU locks.

**Checks:**
- **ST1–ST2 static**:
  - ST1: no migration; `prisma/` unchanged; no hunk in the §4 never-touch files; `restaurant/**` bodies hash-PAR (SIGS_BASE); outbox j hunk below `"pos.sale.voided":`; pure modules stay pure.
  - ST2: new keys th = en, no Thai in en; `EVENT_TYPES` has `held`; owner line z4 present.
- **HN1–HN3 (a)**:
  - HN1: pause, ingest CHAT ⇒ NEW + one `held` event; unpause through the action path ⇒ ACCEPTED (`acceptedByUserId` null, round created, audit `swept:true`). A second sweep is a no-op.
  - HN2: ceiling 1 with a backlog ⇒ 3 held. `kdsTicketDone` then the read sweep ⇒ FIFO, stops at the first blocked. A LINEMAN held order whose sale is refused (`STOCK_INSUFFICIENT`) stays NEW, is not retried, and the next one is accepted.
  - HN3: sweep ‖ staff `acceptOrder` on the same order (parallel) ⇒ one ACCEPTED, one PLATFORM sale, one round. Controls never swept: autoAccept off, MANUAL, NEW without `held`, channel paused, another unit/tenant.
- **OD1–OD2 (b)**:
  - OD1: a draft on a session closed by `table.closeSession` (legacy) ⇒ floor read ⇒ DISCARDED + audit once (a replayed read adds none).
  - OD2: an OPEN session's draft, the drawer carts (`tableSessionId` null) and other units are untouched (PAR).
- **EQ1–EQ2 (c, pure)**:
  - EQ1: 30 odd-priced items, EQUAL-3, service 0 ⇒ `max b − min b ≤ 1`, `|s_i| ≤ 1`, Σ t exact.
  - EQ2: 500 seeded plans (EQUAL/SEAT) ⇒ the bases of the shared parts are within ±1, Σ exact, the server plan equals the pure result (one DB plan), deterministic.
- **DM1 (d)**: legacy merge with a DONE plan on from ⇒ refused, orders not moved, plan unchanged (or, under Q4-alt, plan `sessionId` = into). Control: no plan ⇒ merge ok.
- **VO1 (j)**: static (the step is inside the main chain, not a compose extra) + behaviour (void the bill of a READY LINEMAN order ⇒ drain ⇒ CANCELLED/REFUNDED; replay ×2 ⇒ one `cancelled` event).
- **CN1–CN2 (n)**:
  - CN1: bill voided, consumer not drained ⇒ `getOrder.saleStatus === "VOIDED"`; PAID / null cases.
  - CN2: STAFF (no void) cancels it ⇒ ok, one void only (PAR, server) + static `OrderPanel` uses `saleStatus`.
- **PB1 (p, pure)**: th HTML has both nowrap spans; `<title>` = full title; `L.title` unchanged; ESC/POS hex = base renderer output for the B3 payload (golden from c3c52ef1).
- **SM1–SM2 (s)**:
  - SM1: SEAT plan with 2 members ⇒ `memberName` per part; a member of another system or tenant ⇒ null.
  - SM2: paid part ⇒ `paidMethods` = distinct types (CASH+CARD); OPEN ⇒ null.
- **LK1–LK2 (l)**:
  - LK1: each recipe refusal case ⇒ `reason` ∈ the list, en key exists, no Thai in en.
  - LK2: bogus member/party/conversation ⇒ `messageKey` per case; `order-ui-actions.ts` has no `prisma.` (F3).
- **HU1**: static — the handOver sale status is read in the tx with `FOR SHARE`; `webOrderForUpdate` SQL has the tenant predicate. Behaviour: void committed between read and hand-over ⇒ refused `saleVoided`.
- **ZE1–ZE2 (z3)**:
  - ZE1: a marker recorded for bill X in book A, POS relinked to book B ⇒ `applyExternalChannelCommission` returns `no-paid`; relink back ⇒ `posted`/`already`.
  - ZE2: `posSalePosted` true for marker + document, false for a marker without a document (z1 rule).
- **FU1–FU2**:
  - FU1: `report.channels.empty` th/en carry no "วันนี้"/"today"; `loadProductsData` with a unit forced over the cap ⇒ that unit is in `incompleteUnitIds`.
  - FU2: stale `expectedRowsHash` ⇒ CONFLICT, nothing written; matching ⇒ ok; absent ⇒ PAR.
- **Z1–Z2**: residue 0 (orders/events/rounds, held carts, plans, sales, AuditLog, settings restored) + non-temp fingerprint identical.

**Expected red-before:** ≈ 20/25. Green-before = PAR: ST1, OD2, CN2 (server part), Z1–Z2.
**Existing-check edits (each its own `test(...)` commit, dated marker `// ORACLE-EDIT ผู้คุม <date> (HF-FU …)`):**
- `qc-pos-p2.5`: `refAlloc` `:275` + M2 D-text `:57` (c); T5 control `:2583–2592` (d, if refuse); C7 `:2371–2400` (i).
- `qc-pos-p2.9b`: A10 `:2103–2114` (z1/z2).

Any other pin turning red = CONTROLLER-DECISION. Watch p2.6 O4 (`:2052–2083`): the ceiling clear may now sweep the held CHAT order and shift later counts.

## 7. Pins / boundaries
- `createSale` contract untouched: the sweeper reuses `acceptInTx` → `orderCreateSale`; registries U4/HT6/L2 unchanged.
- HF-TX: no new `createSale(` site; `qc-hf-tx` in the merge set (order.ts touched).
- F15.1: recipe writes stay in `catalog.ts`.
- POS never writes restaurant tables: b reads sessions through the facade; d is read-only (refuse) or a POS-table update (repoint).
- `'use client'` files do not import `pos/table(-split)`, `pos/order`, `pos/kds`.
- Shared hot files: `outbox-consumers.ts` and `messages/*` get append-only marked hunks.

## 8. Gates (merge set)
- Base: typecheck (pos lock, 5632 MB) · fitness ±env · fitness-pos · `qc-hf-fu` ×2 · `qc-pos-p2.5` 49 (with edits) · `qc-pos-p2.6` 67 · `qc-pos-p2.4` 50 · `qc-pos-p2.8` 61 · `qc-pos-p2.9` 62 · `qc-pos-p2.9b` 53 (A10 edit) · `qc-hf-tx` 22 · `qc-pos-p1.1` 180 + `qc-pos-p1.3` 128 (merge-point rule) · `qc-pos-p1.8` 49 (refund consumer) · `qc-pos-p2.3` 46 (l1) · `qc-pos-p2.11` 34 + `qc-pos-p2.2` 42 (f3) · `qc-pos-p1.18` 81 (ST7) · `qc-hf-pos-page-authz` 81 · restaurant ×4 (legacy actions) · `qc-account` 16 + `qc-account-cpa` 107 (z1/z3)
- **Hunter at merge** (money lane): sweeper (double-accept / double-sale, after-commit, lock order with KDS) · EQUAL rotation Σ/VAT · j retry semantics · z1/z3 gate correctness.

## 9. Visual (fix-round rule: only the states the card touches · `--states --state …`)
Touched UI: n (`OrderPanel` cancel enablement + timeline `held` label) · s (split cards) · p (pre-bill HTML) · f2 (drawer line) · l1/l2 (en refusal text) · f1 (copy).

States (reuse existing, no new harness state):
- `--page tables`: `split-locked,split-seat,split-equal,prebill-preview` (owner th 1440 + 390; en spot)
- `--page products`: `products-branch-filter` (drawer: unstocked vs incomplete line)
- `--page orders`: `orders-detail-platform` (timeline)

`orders` cancel-enable on a voided bill and the en refusal texts are judged by the oracle (CN1/CN2, LK1/LK2) plus `--dry` (a new state would need a lagging-consumer fixture, not worth it).

## 10. Controller rulings (account B · 15 Oct 2026 · binding)
**Scope**: all 21 items in §2 are IN, incl. f3 (Q8 — one optional server param). Out-list in §1 stands. Base = `session/pos` **c3c52ef1** (local merge; the pushed SHA will be identical — oracle writer may start from the local object now; builder starts after the push).
1. **a cadence (Q1) = rec**: sweep after-commit at unpause (`kitchenPauseAction`, actions layer, 1 marked line) and after `kdsSetAutoAcceptMax`, plus on read in `listOrders` and `kdsBoard` (heal precedent), `limit 20`, oldest first, stop at first blocked. Same bizDate only (`posDayStart`); older held orders stay NEW for staff. The read-path sweep must never fail or block the read: run before the read, each candidate in its own `mutate`, errors ⇒ WARN + continue to the read. `held {reason:"sale_refused"}` orders are never auto-retried (staff accepts manually). Audit `pos.order.accept {auto:true, swept:true}`, `acceptedByUserId` null. `held` event NEW→NEW is fine.
2. **b (Q2) = rec**: discard as soon as the session is not OPEN, no age window, incl. MERGED (no repoint — legacy page retires in P2.14). Audit `pos.heldCart.discard via:"session_not_open"`, actor SYSTEM, same row shape as POS close. Call from `registerTables` read only.
3. **c (Q3) = rec**: rotate the share remainder in EQUAL **and** SEAT shared items (one rule); `stockOwner` stays part 1; EQUAL totals stay `q+1` to parts 1..r; stored plans are not recomputed. ORACLE-EDIT p2.5 `refAlloc` + M2 D-text with dated marker; M2/M6 must stay green with the edited reference. Hunter on the allocator at merge.
4. **d (Q4) = refuse**: `legacyMergeSplitGuard` also refuses a DONE plan on the from-session (new code `SPLIT_PLAN_EXISTS`-style, reuse the existing refusal code if one fits, th+en key). ORACLE-EDIT p2.5 T5 control → "no plan ⇒ merge ok; DONE on from ⇒ refused".
5. **i**: C7 ORACLE-EDIT per §2 (NOWAIT probe). **Fail-before is the oracle writer's job**: on tree c, before creating the oracle branch, `git checkout --detach 1a964205` + `prisma generate`, run only the new C7 probe (a scratch copy of the probe in the scratchpad, QC4 under the gate lock) ⇒ expect 55P03; paste the output into `HF-FU-red.txt` §C7; then return to c3c52ef1 + `prisma generate`. If 1a964205 cannot generate/typecheck quickly (> 20 min), skip and mark CONTROLLER-DECISION.
6. **j (Q5) = rec**: a step inside the voided main try-chain after the deposit step, marked `// POS HF-FU ▸ j ◂`, **below** `"pos.sale.voided":`; ≤ 4 new lines above it in the whole file (§⚠️6). No new outbox event.
7. **n/s/p/l1/l2/F3/h1/h2/f1/f2 = as proposed in §2** (additive DTO fields only; `OrderPanel` reads `saleStatus`; the split dialog drops the per-part `billDetailAction` loop; pre-bill HTML only, ESC/POS bytes golden-identical; `RECIPE_REFUSAL_REASONS` 6 values; `orders.errors.*NotFound` keys; `FOR SHARE` sale read inside the hand-over tx; tenant predicate on `webOrderForUpdate`; copy "ไม่มียอดในช่วงนี้" / "No sales in this period"; `incompleteUnitIds` + `branch.incomplete`).
8. **z1/z2 (Q6) = rec**: `posSalePosted` = PAID JV **or** (marker **and** sale document exists). ORACLE-EDIT p2.9b A10 (+2 asserts).
9. **z3 (Q7) = strict**: `after.bookSystemId` written and filtered; markers without the field are ignored (QC only). z4 owner line extended (ST2 grep).
10. **f3 (Q8) = IN**: optional `expectedRowsHash` on `setChannelPrices`, compared under the existing product lock; absent ⇒ today's behaviour; mismatch ⇒ `CONFLICT` + key `pos.products.branch.conflict`. Loader sends the hash, drawer echoes it. If the builder's round budget runs out, f3 is the one item allowed to fall to P2.12 — say so in the notes.
11. **Pins**: p2.6 O4 may legitimately shift once the ceiling clear sweeps the held CHAT order. Pre-approved ORACLE-EDIT (dated marker): O4 asserts the held order is ACCEPTED after the clear and adjusts later counts accordingly — only that. Any other existing pin turning red = CONTROLLER-DECISION (report, do not edit). p2.11 ST1/ST4 and p2.8 ST6 are lane pins expected red on a wip branch.
12. **Lane/order**: oracle writer on tree c now (`wip/pos-hf-fu-oracle` @ c3c52ef1) → builder S on tree c (`wip/pos-hf-fu`) → independent reviewer → fix rounds → hunter at merge (money lane) → merge gates §8 + images. P2.9bU builds on tree b in parallel; whichever merges second pulls `origin/session/pos` before its final gates (§4 rec stands).
13. **Images**: fix rounds shoot only the §9 states; the merge gate runs the full `--states` on tree d as every card.


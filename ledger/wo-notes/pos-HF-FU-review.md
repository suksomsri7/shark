# HF-FU — review file (controller tree · account B · 15 Oct 2026)

## R1 (verbatim · head f5e1c8a4 vs oracle base 9e2b1d27)
# HF-FU R1 review: `wip/pos-hf-fu` f5e1c8a4 vs oracle base 9e2b1d27 (read-only, tree c)

**Verdict: MERGEABLE.** I found no money, lock or idempotency defect. There are 3 Low findings and 2 info items; any of them can be a fix-round item or a follow-up. Line numbers are at f5e1c8a4.
## Findings
- **F1 Low (b, race).** `sweepOrphanTableDrafts` reads the session status outside the discard tx (`held-cart.ts:403`). The discard tx itself only does a CAS on the draft (`:411`). A sale void can reopen a CLOSED session (`restaurant/pos-tables.ts:346, :584`). If that void commits between the read and the discard, the HELD draft of a now-OPEN table is DISCARDED. Smallest fix: inside the discard tx, re-read `tableSessionForPos(tx, …)` and skip when the session is OPEN.
- **F2 Low (a, ceiling).** `autoAcceptBlockedInTx` is an unlocked count (`kds.ts:380–387`). The sweeper now runs on every `listOrders` and `kdsBoard` poll, on every screen. Concurrent sweepers each pass the check (`order.ts:987`) and accept different orders, so open tickets can go over `autoAcceptMaxOpen` by up to (sweepers − 1). Ingest already has the same race; the read-path triggers make it more likely. Fix: take a per-unit `pg_advisory_xact_lock('posorder-release:<unit>')` first in each sweep tx.
- **F3 Low (a, robustness).** Two paths abort the whole loop through the outer catch (`:1017`):
  - A non-`OrderAbort` error in a candidate tx is rethrown (`order.ts:1007`). That order is tried first on every poll, never gets a `sale_refused` marker, and blocks every later held order.
  - A throw from `afterSaleCommit`, adapter or `writeAudit` (`:1013–1015`) loses the `swept` audit of an accept that has already committed.
  - Fix: per candidate, WARN and `continue`; wrap each after-commit step in its own try/WARN.
- **F4 Info (h1).** The `stateInvalid(...)` refusal reads `cardsOf` through the global `prisma`. It is built inside the `mutate` callback (`order.ts:1068`) while the tx holds the PosOrder row, so it takes a second pool connection mid-tx. A burst of these could starve the pool. Fix: return a sentinel from the tx and build the refusal after rollback.
- **F5 Info (z1).** A book with the POS document layer turned off never gets a sale document. Its zero-entry bills therefore stay `posSalePosted === false` (`account/index.ts:762`). Each refund then re-runs `bridgePosSalePaid` (`refund-consumer.ts:77–80`). That re-run is idempotent and has no money effect, but R5 F2 stays open for that setup. Controller decides.
## Verified OK
- **a (sweeper):** The `held` marker is written only when the channel has autoAccept on, is not MANUAL, and the kitchen check blocked it (`order.ts:633–635`).
  - System-gate PLATFORM orders get no marker, because the channel is passed with `autoAccept:false` (`:818`).
  - Each candidate runs in its own `runTx`. It re-checks the block, re-reads the order (NEW, tenant and unit), then calls `acceptInTx`. The CAS on status+version (`:367–371`) runs before the sale is created (`:518`).
  - Sweep ‖ staff `acceptOrder`: the loser's CAS gets 0 rows ⇒ `OrderRaced` ⇒ rollback. So one ACCEPTED, one sale, one round.
  - Sale refused: `OrderAbort` rolls back everything. One `sale_refused` marker is written under `PosOrder FOR UPDATE` with a re-check (`:998–1004`), and those orders are excluded from later sweeps (`:973`).
  - Same bizDate only (`posDayStart`), `limit ≤ 20`, oldest first (receivedAt, id), stops at the first blocked one, never throws. Read paths: `listOrders:1399` and `kdsBoard:629–633` wrap it in try/WARN.
  - After commit (none of it inside the tx): `afterSaleCommit`, adapter `accept` (all no-ops, `order-adapters.ts:31–35`), audit SYSTEM `{auto, swept, saleId}`, then `scheduleDrain`.
  - `kitchenPauseAction` gets 1 marked line that runs only when `!paused` (`actions/restaurant.ts:68`). `restaurant/**` is untouched. Every query is scoped to tenant + unit.
- **b (orphan drafts):** Drafts are filtered by tenant, system and unit. The hint holds only this unit's OPEN sessions (`pos-tables.ts:55`), so it can only prevent discards.
  - A session the facade cannot read ⇒ null ⇒ the draft is not touched.
  - Audit row shape matches POS close (`held-cart.ts:375–386`): SYSTEM, `via:"session_not_open"`, version +1. Called only from `registerTables:111`.
- **c (rotation):** Rotation is at `table-split-shared.ts:147, :156–158`. It applies to SEAT and EQUAL only; ITEM refuses shared lines (`:129`).
  - Σ is exact per item, bases stay within ±1, `stockOwner` stays part 1, and the EQUAL totals at `:168–174` are untouched.
  - The UI preview gets `unpaidItemIds` in `tableUnpaidItemsForPos` order (`table.ts:203`, `pos-tables.ts:146` createdAt, id). The server passes the same list (`table-split.ts:301, :322`), so preview == server plan. Stored plans are not recomputed.
- **d:** Only DONE on the from-session is refused, with Thai `{ok:false, reason}` (`table-split.ts:619–621`). The action layer is unchanged.
- **j:** The order step sits inside the main chain after the deposit step (`outbox-consumers.ts:764–770`), before `if (failed) throw err`. It is no longer a compose extra, and 0 lines were added above the key line at `:728`. `onSaleVoided` is idempotent.
- **n / s:** n: `saleStatus` comes from one `posSale` select inside the existing `Promise.all` (`order.ts:1483`). s: `memberName` comes from `registerMemberBriefs(s, …)` with the caller's actor and this tenant (`table-split.ts:94`); `paidMethods` uses one distinct query restricted to `sale.status PAID` (`:95`).
  - The dialog no longer calls `billDetailAction`. The only new client import is type-only (`PosPayType`).
- **l1 / l2 / F3:** l1: all 6 reasons are used in `setRecipe`, `setRecipeChoiceLines`, `setBomEnabled` and `assertRecipeItem`. `recipeShape` maps `ownFields` errors to SHAPE. `recipeRefusalText` checks `reason` before the service text.
  - l2: the 3 `messageKey`s are in place. F3: `orderChannelSettings` uses the same read scope, and `order-ui-actions.ts` has no `prisma.` left.
- **h1 / h2:** h1: the CAS runs first, then `PosSale FOR SHARE` with the tenant predicate, in the same `mutate`; VOIDED ⇒ `OrderAbort` (`order.ts:1061–1071`). h2: `webOrderForUpdate` now has the tenant predicate (`:858`).
  - No deadlock path: `voidSale` touches only PosSale, PosShift, AuditLog, outbox and coupons (`service.ts:1403–1460`), and `voidSaleByActor` only calls it (`bills.ts:661`).
- **z1 / z3 / z4:** z1: the document check is per book and per sale (`findExternalSaleDoc(link.systemId, refId)`, `service.ts:5164`).
  - z3: the marker carries `bookSystemId` (`gl.ts:1806`) and is read per book (`:1798`). It is still written once per book under the advisory lock. Refund callers are unaffected (heal only).
- **p:** two nowrap spans with `<wbr>` after "/" (`pre-bill-render.ts:138–146`). `<title>`, `L.title` and the ESC/POS path are untouched.
- **f1 / f2 / f3:** f2: `incomplete` is set from a truncated list or a `CatalogError` (`products-data.ts:93, :226`). Rows stay in the payload.
  - f3: the hash covers all stored rows of the product, sorted (`:210–215`, `price-shared.ts:53–71`). It is checked under the product lock before any write (`catalog.ts:2447`); absent ⇒ old behaviour. Purge sends it too.
  - f3: the client recomputes the hash from the returned rows, which equal the stored set (`ProductsClient.tsx:113`). Both sides hash a notSold row without its price.
- **Hygiene:** Nothing in the §4 never-touch files, `scripts/qc-*` or `prisma/` changed.
  - Every hunk in a foreign file is marked (`actions/restaurant.ts`, `outbox-consumers.ts`, `account/{gl,index}.ts`).
  - th and en have the same 11 new or changed keys, and en has no Thai.
  - The upstream merge `afef29e7..f0387417` is ledger-only (6 files).
## Follow-ups
F1–F3 can go into this card's fix round or into P2.14. F5 needs a one-line controller or owner decision.
## Brief for the money hunter
1. Fire N parallel `listOrders`/`kdsBoard` sweeps plus `acceptOrder` on one held PLATFORM order. Expect exactly 1 sale and 1 round. Then check how far the ceiling overshoots (F2).
2. Hold a ticket at the ceiling, void a PLATFORM bill mid-sweep, and recount stock deduction for swept sales after commit (F3).
3. EQUAL/SEAT with many odd-priced shared items: check per-part VAT on t_i, `|s_i| ≤ 1`, and that a negative s lands in the discount.
4. z1/z3: relink a book after a real commission (tenant-wide idempotency key, oracle drift 8). Also refund a zero-entry bill in a book with documents off.

## Controller rulings — fix round 1 (15 Oct ~12:4xZ · binding)
R1 = MERGEABLE, but F1–F3 are real race/robustness holes in money-adjacent code (sweeper accepts PLATFORM bills) ⇒ one fix round before the hunter.
1. **F1 (b race) = fix**: inside the discard tx re-read the session through the facade with the tx client (`tableSessionForPos(tx, …)`) and skip when OPEN (or unreadable). Keep the hint logic.
2. **F2 (a ceiling) = fix**: every sweep tx takes `pg_advisory_xact_lock(hashtext('posorder-release:<tenant>:<unit>'))` first (before `autoAcceptBlockedInTx`), so concurrent read-path sweeps serialise per unit. Ingest's own race is out of scope (note it as follow-up).
3. **F3 (a robustness) = fix**: per candidate, a non-`OrderAbort` error ⇒ WARN + `continue` (never rethrow out of the loop); each after-commit step (`afterSaleCommit` · adapter · audit · `scheduleDrain`) in its own try/WARN so a committed accept always gets its audit attempt and later candidates still run.
4. **F4 (h1 pool) = fix**: return a sentinel from the `mutate` callback and build the `stateInvalid` refusal (which reads `cardsOf` via global prisma) after rollback — no second pool connection inside the tx.
5. **F5 (z1, documents-off book) = accept as is**: a book with the document layer off never has a sale document, so zero-entry bills stay `posSalePosted=false` and refunds re-run the idempotent bridge; no money effect. Record as a follow-up line in the notes (not an owner line).
6. **Oracle (test-first, builder writes it in its own `test(...)` commit with the dated marker `// ORACLE-ADD ผู้คุม 15 ต.ค. (HF-FU fix 1)`)**: `qc-hf-fu` **HN4** = 3 held orders at ceiling 1, 6 parallel `releaseHeldOrders` (and/or `listOrders`) ⇒ exactly 1 ACCEPTED, open tickets ≤ ceiling, 1 sale, 1 round (red-before = F2 overshoot; capture in `HF-FU-red.txt` §fix1); **OD3** = draft of a CLOSED session whose session is re-opened by a concurrent void (use the `holdLock` third-tx pattern on the session row or an advisory lock to order the race) ⇒ draft stays HELD (red-before = F1). If OD3 cannot be made deterministic within ~30 min, replace it with a static check that the discard tx re-reads the session (name the function) and say so. HN1–HN3 must stay green. The suite stays 25 + 2 = 27 checks.
7. Gates after the fix: `qc-hf-fu` 27/27 ×2 unforced · `qc-pos-p2.6` 67 · `qc-pos-p2.4` 50 · `qc-pos-p2.8` 61 · `qc-hf-tx` 22 · `qc-pos-p1.1` 180 · `qc-pos-p1.3` 128 · typecheck 0 · fitness ±env. Then merge `origin/session/pos` (P2.9bU merged at 616db657 — pushed only after gates91; if not yet on origin when you finish, say so and the controller merges) before the final `qc-hf-fu` run.
→ hunter (money lane) after fix 1: R1's 4-line brief + F2 overshoot re-probe.

## R2 (re-verify fix round 1 · Opus read-only · tree c @aff51c68 · 15 Oct ~13:3xZ) — verbatim
**Verdict: MERGEABLE.** All 4 code fixes match rulings 1–4. The oracle follows ruling 6, and the merge is clean. Nothing new in money, lock order or idempotency.
- **G1 Info (F2 × F3, latency).** Read-path sweep waits on a *blocking* `pg_advisory_xact_lock` (`order.ts:989`) inside `runTx` (maxWait 15 s, timeout 30 s); `listOrders` awaits the sweep (`:1432`). N polling screens while one accept is slow ⇒ N pool connections parked on the lock; a degenerate pool where every candidate times out makes one read wait up to limit × wait. No correctness/money effect. Smallest fix (P2.14): `pg_try_advisory_xact_lock`, return `"blocked"` when false.
- **G2 Info (F1 residual).** Re-read at `held-cart.ts:415` is unlocked; a void committing between `:415` and `:417` can still discard. Locking the session would invert the close-table lock order (session → drafts) ⇒ P2.14 follow-up is correct.
- Verified OK: ruling 1 (`held-cart.ts:410–418` FOR UPDATE draft first → `tableSessionForPos(tx)` → skip null/OPEN; hint/CAS/audit unchanged) · ruling 2 (`order.ts:989` lock first statement, same tx as `acceptInTx`, key exact, xact-scoped) · ruling 3 (`:997–1050` OrderRaced/OrderAbort/other ⇒ continue; after-commit steps each try/WARN; return `{accepted}` unchanged) · ruling 4 (`:1078/:1099/:1104` frozen module sentinel thrown inside OrderAbort ⇒ rollback; `mutate` returns refusal by identity; stateInvalid built after rollback only) · ruling 5 follow-up line · ruling 6 (979d5ac0 test-only, 4 marker lines, 0 removed, 27 `D(` rows; HN4 third tx parks S1 past the ceiling, S2–S6 run ⇒ 1 ACCEPTED/1 sale/1 round/backlog ≤ 1; red-before 25/27 `ACCEPTED,ACCEPTED,NEW · 2 sales · 2 rounds · backlog 2`; OD3 deterministic via holdLock + `waitBlocked(1)` on `pg_blocking_pids`) · merge 120b0e16 (no markers; OWNER-PENDING 0 removed; messages diff byte-identical to HF-FU's own; 18 P2.9bU files differ only in messages; c/j/f spot-check 0-line diff since f5e1c8a4) · hygiene (fix commits touch only held-cart.ts, order.ts, qc-hf-fu.mts; register-shared.ts = P2.9bU identical to 616db657; 9 hunks marked; no `prisma.` in `*-actions.ts`).
- Process note: one `cd` into its scratch dir to diff temp files; repo/git/DB untouched.

**Controller ruling (15 Oct 13:3xZ):** R2 MERGEABLE accepted. G1 + G2 = follow-up lines for P2.14 (append to `pos-HF-FU.md` Follow-ups at merge, not owner lines). Waiting on the money hunter before merge.

## Money hunter (Opus read-only · tree c @aff51c68 · 15 Oct ~13:3xZ) — verbatim
# HF-FU money hunt (read-only) · head aff51c68 · tree shark-pos-c

**Verdict: FINDINGS.** 2 Low, 0 High/Med. No path found that produces a double sale, a double stock cut or a lost tender. Both findings already existed before HF-FU. HF-FU makes H1 more likely and does not close H2.

**H1 · Low · `pos/order.ts:981,993` → `:513`.** The swept accept decides money from a channel row it read before the tx.
- `ch` comes from the outer `findMany`. Inside the locked tx it is never re-read. `acceptInTx` makes a sale only when `ch.payout === "PLATFORM"`, not from `o.paymentState`.
- Input: an order is held (PLATFORM_PAID), then the owner edits the custom channel's payout to DIRECT. That edit is allowed for non-builtin channels (`channel.ts:231`). On unpause, the sweep accepts the order with **no sale**, and `payOrder` refuses PLATFORM_PAID. The platform revenue is never booked.
- The reverse flip (DIRECT→PLATFORM) creates a PLATFORM bill for an UNPAID order. `payOrder` then hits IDEMPOTENCY_CONFLICT on `posorder-<id>`.
- Separately, autoAccept-off, a channel pause or an archived channel is not re-checked in the tx either (HN4's S1 accepts o1 after its autoAccept went off). Manual `acceptOrder` has the same flaw; the held window (minutes to hours) is what makes it reachable.
- Smallest fix: inside the sweep tx, re-read the channel after the advisory lock and re-apply the `live` predicate. In `acceptInTx`, refuse with OrderAbort when `(ch.payout === "PLATFORM") !== (o.paymentState === "PLATFORM_PAID")`. That marks the order `sale_refused` and leaves it NEW for staff.
- Missing check: HN5 — hold a PLATFORM order, flip payout (or autoAccept off) in the tx, sweep ⇒ order still NEW + `sale_refused`, 0 sales.

**H2 · Low · `account/index.ts:723` + `gl.ts:1927` + `refund-consumer.ts:77,91`.** z3 does not cover the refund flow after a relink (drift 8).
- Input: a zero-entry PLATFORM bill with commission (marker + COMMISSION in book A), then POS is relinked to book B, then the bill is refunded.
- Step 1a: `posSalePosted(B)` = false (JV and marker are both book-scoped), so `bridgePosSalePaid` runs in B. It writes **marker B** (now book-scoped, so it is written) and a second sale document in B.
- That marker opens the commission gate in B. `postExternalChannelCommission` checks `alreadyPosted` only for book B, so the insert of `PosSale#X#COMMISSION` hits the tenant-wide `@@unique([tenantId,idempotencyKey])` ⇒ P2002 on every retry. The refund event ends FAILED.
- COMMISSION_REFUNDED is never posted, because the reverse gate looks for COMMISSION in B. The commission stays overstated.
- Before HF-FU the result was the same (the tenant-wide marker opened the gate). Not verified: `doc.created` in B may run `consumeBundleComponentsForDoc` a second time.
- Smallest fix: in `postExternalChannelCommission` (and `postExternalSale`), treat a key that exists anywhere in the tenant as `{skipped:true}`.
- Missing check: ZE3 — relink after a real commission, then refund ⇒ event DONE, 0 P2002, 0 COMMISSION rows in B.

**Probed OK**
1. **Sweeper and ceiling.**
   - The advisory lock is the first statement of the same tx as the CAS, the round and the sale (READ COMMITTED, so each later statement sees the earlier holder's round). Manual `acceptOrder` does not take the lock, but the version CAS gives one winner and `posorder-<id>` makes the sale idempotent: 1 sale, 1 round, 1 stock key per line.
   - With ceiling 2, 3 candidates and 6 sweepers: serialised, each re-checks `autoAcceptBlockedInTx`, so at most 2 accepts. The ceiling is per station.
   - Lock key and backlog are per unit, so no cross-unit leak.
   - Ingest does not take `posorder-release`, so ingest ‖ sweep can overshoot the ceiling by one. Kitchen only, no money (builder follow-up, P2.14).
   - Lock order cannot deadlock: the release lock comes first and ingest never waits on it while holding a row the sweeper needs.
2. **After commit (F3).**
   - Stock cuts use the idempotent key `pos-consume-<sale>-<line>`, healed by `retryPendingStockCuts`. A throwing `afterSaleCommit` leaves the order ACCEPTED, so it is never swept again. The receipt counter is consumed in the rolled-back or committed tx only. The swept audit is still attempted.
   - A voided bill's order is ACCEPTED or later, never NEW. `onSaleVoided` only moves it to CANCELLED/REFUNDED, never re-opens it. `transition` emits the close event, so kitchen tickets fall and the ceiling clears. j now retries with the main chain; all main steps are idempotent and the extras still run.
3. **Orphan drafts.**
   - `PosHeldCart` holds only cart JSON (no tenders, no deposit rows, no sale link). Deposits and interim payments live only in the pay-dialog state and on sales.
   - The sweep touches only HELD drafts with `tableSessionId` on a non-OPEN session. A stale `openSessionIds` hint can only skip a draft, never discard one. F1 residual (unsent items lost, no money) is documented.
4. **Allocator.**
   - Fuzz of 192k EQUAL/SEAT plans (2–7 parts, ฿33.33 prices, service 0–10 %, % and fixed discounts, VAT 7 %): Σt = total, Σlines = base and `tableSplitSaleAmounts` reproduces t in every plan. EQUAL sᵢ stays within ±1 of S/N, a negative s moves into the discount (never above base), and VAT is computed on tᵢ.
   - Preview and server use the same item order: both come from `tableUnpaidItemsForPos` (`createdAt, id`). The replace path refuses a missing item, so the client's appended "rest" is always empty when accepted.
   - `legacyMergeSplitGuard` has one entry point (`mergeSessionAction`).
5. **h1/h2.**
   - The CAS and the sentinel throw are in one `runTx`. The refusal is built only after rollback; no path commits HANDED with a VOIDED sale.
   - Every `webOrderForUpdate` caller passes the tenant (`shop/service.ts:262,288,321`). The NULL branch keeps the old behaviour for callers that pass no tenant.
   - Info: a fully REFUNDED (not voided) bill can still be handed over. This predates HF-FU and was never in h1's scope.
6. **z1/z3.**
   - JV and marker are both book-scoped, so `posSalePosted` is never true from an old book.
   - Docs-off zero-entry refund: `posSalePosted` = false ⇒ re-bridge ⇒ 0 JV, marker exists (no write), no document. COMMISSION shows "already"; then the refund's own entries run as before. HF-FU adds 0 rows.
   - Old markers without `bookSystemId` count as unposted. That is the safe side: an idempotent re-bridge writes a scoped marker.
7. **P2.9bU merge.**
   - HF-FU touches neither `register-shared.ts` nor deposit code (`git diff 9e2b1d27 0e870195`). `expectedRowsHash` covers channel-price rows only. j runs after `depositSaleVoided`, and the two are independent. `paidMethods` may list DEPOSIT, which is display only.

## Controller rulings — fix round 2 (15 Oct 13:4xZ · binding)
Hunter = FINDINGS (2 Low). Quality over speed: both are in money-adjacent code this card owns (sweeper = item a; z1/z3 = account markers), both have small fixes ⇒ one more fix round before merge.
1. **H1 (sweep decides money from a stale channel row) = fix.** Inside the sweep tx, after the advisory lock, re-read the order's channel row with the tx client and re-apply the `live` predicate (autoAccept on · not paused · not archived · payout); a candidate whose channel is no longer live ⇒ skip (leave NEW, no marker — staff decide). In `acceptInTx` (shared by sweep and manual `acceptOrder`): refuse with `OrderAbort` when `(ch.payout === "PLATFORM") !== (o.paymentState === "PLATFORM_PAID")` ⇒ sweep path marks `held {reason:"sale_refused"}`, manual path surfaces the existing refusal shape (reuse an existing reason code if one fits; else one new reason + th/en key, named in the notes). No sale is ever created from a mismatched pair.
2. **H2 (refund after book relink ⇒ P2002 loop, event FAILED) = fix, time-boxed.** In `postExternalChannelCommission` and `postExternalSale`, before inserting, check the idempotency key **tenant-wide** (`tenantId` + key, any system) ⇒ `{skipped:true}` (reason text names "other book"). The reverse (COMMISSION_REFUNDED) gate stays book-scoped — the reversal is **not** posted into book B when COMMISSION lives in book A; this is an owner matter, not a code guess: append one line to `ledger/POS-OWNER-PENDING.md` (append-only): "refund of a PLATFORM bill after the POS was relinked to another book: the commission reversal is not posted automatically (original COMMISSION lives in the old book) — staff adjust in the old book / HF-FU2 decides cross-book reversal". Verify the hunter's open point: does `doc.created` in book B re-run `consumeBundleComponentsForDoc` (double stock consume)? Assert stock-movement count in ZE3; if it double-consumes, STOP that part and report CONTROLLER-DECISION (do not patch stock code).
3. **ORACLE-ADD (test-first, own `test(...)` commit, marker `// ORACLE-ADD ผู้คุม 15 ต.ค. (HF-FU fix 2)`)**: `qc-hf-fu` **HN5** = hold a PLATFORM order (PLATFORM_PAID) at the ceiling, flip the custom channel's payout to DIRECT (and, as a second sub-case, autoAccept off) *before* the sweep ⇒ order still NEW, `sale_refused` marker (payout case) / no marker (autoAccept case), 0 sales, 0 rounds; red-before at aff51c68 = sale missing or wrong (record in `HF-FU-red.txt` §fix2). **ZE3** = reuse the ZE1 relink fixture: zero-entry PLATFORM bill with a real COMMISSION in book A → relink to B → refund ⇒ refund outbox event DONE, 0 P2002 in the log, 0 COMMISSION rows in B, COMMISSION_REFUNDED count in B = 0 (pinned, see ruling 2), stock movements unchanged by the B-side bridge; red-before = event FAILED / P2002. Suite = 27 + 2 = 29. HN1–HN4, OD1–OD3, ZE1–ZE2 stay green.
4. **Follow-up lines** (append to `pos-HF-FU.md` Follow-ups, not owner lines): R2 G1 (blocking advisory lock ⇒ `pg_try_advisory_xact_lock` + "blocked" in P2.14) · R2 G2 (F1 residual, session-first lock order) · hunter info: a fully REFUNDED (not voided) bill can still be handed over (predates HF-FU; P2.14 h1 scope) · hunter: ingest ‖ sweep overshoot by one (already listed).
5. **Gates after fix 2**: `qc-hf-fu` 29/29 ×2 unforced · `qc-pos-p2.6` 67 · `qc-pos-p2.8` 61 · `qc-pos-p2.9b` 53 · `qc-pos-p1.8` 49 · `qc-pos-account` 16 · `qc-account-cpa` 107 · `qc-hf-tx` 22 · `qc-pos-p1.1` 180 · `qc-pos-p1.3` 128 · typecheck 0 · fitness ±env. `origin/session/pos` is still 57a8b19a (already merged) — fetch and confirm; if it moved, merge before the final `qc-hf-fu`.
→ then controller: merge into session/pos → gates93 (§8 full) ‖ chain79 images → push → 37/55. No further hunter unless fix 2 touches code outside rulings 1–2.

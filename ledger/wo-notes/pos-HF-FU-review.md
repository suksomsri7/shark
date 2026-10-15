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

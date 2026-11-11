# P2.4 S: money-lane hunt H (read-only) · head wip/pos-p2.4 29ea05d5 (code d4ecad76) · tree shark-pos-c · base 45f7c05a
**R3: OK** · **Verdict: FINDINGS** (2 × Low; no Medium+; nothing that double-posts, double-cuts or loses a bill on the main paths)

## Part A: R3 prelude (fix round 3 = e21d4cc4 + ORACLE-EDIT 5fdb8da7)
- **N1 OK**: `held-cart.ts:263` refuses unless `newDraft` or `heldCartId`+`expectedVersion` (VALIDATION "ต้องระบุร่างและรุ่นของร่าง"; th/en `tables.errors.draftModeRequired` added in both). The field-less update-or-create loop is gone. Edit mode is a single conditional `updateMany {HELD, session, id, version}` (`:320-322`).
- **No other caller reaches a table draft without fields.** `holdRegisterCartAction` (`register-actions.ts:215`) forwards only cart/label/staffToken. `tableSessionId` inside the cart is VALIDATION (`register.ts:1804`, also via `holdCore` → `registerCanonicalCart`). `holdCartForApproval` takes the same `holdCore` path. Restaurant/legacy code never writes PosHeldCart. The only `posHeldCart.create` with a session is `held-cart.ts:312` (newDraft).
- **N2 OK**: same line. `heldCartId` without a version, or a version without an id, is VALIDATION. D7 checks that the version is untouched.
- **N3 OK**: `pos-tables.ts:361` throws, so the stock restore at `:354` rolls back with the tx (the guard maps it to INTERNAL).
- **ORACLE-EDIT 5fdb8da7 is mechanical; nothing was weakened.** The helper defaults to `newDraft:true`, so D2's VALIDATION/TABLE_NOT_FOUND cases still fail on their own cause, not on the mode. D1's re-hold now uses id+version. D7 gains 2 cases. 0 assertions were removed or loosened, and the count stays 46. Red-before `p24/runs/red-before-fix3-D7.log` is 45/46 (D7 red: "heldCartId ไม่มี expectedVersion → OK v3→4 · พักไม่ระบุร่างหลังส่ง → OK HELD 1"). Gates-E at d4ecad76 are green.
- Nit: the stale docstring `table-actions.ts:135` "พักซ้ำ = แก้แถวเดิม" should read "newDraft หรือ heldCartId+expectedVersion".

## Part B: findings
**H1 Low: the void consumer does not serialize with pay, close or open of the same table** (`pos-tables.ts:309-321`). `unlinkTableSaleInTx` takes no TableSession lock and no table advisory lock. It reads the session status unlocked (`:315`) and checks for another OPEN session unlocked (`:317`).
- (a) **Bill strands on a CLOSED session.** Setup: S is OPEN with I1 paid by bill X and I2 unpaid (partial bills arise from a HELD draft at pay time, or a round sent during pay).
  1. Staff voids X; the drain runs consumer C.
  2. C runs `UPDATE items SET saleId=null WHERE saleId=X` (I1 is now row-locked and uncommitted).
  3. Cashier P pays I2: claim I2 → createSale → settle takes S FOR UPDATE (`:290`, free) → `count(saleId null)` (`:291`). P's snapshot still shows I1 with saleId=X, so the count is 0 → S becomes CLOSED (`:293`).
  4. C reads S as OPEN (P is uncommitted), so it skips the reopen. Both commit.
  - End state: X VOIDED (journal reversed, stock restored); I1 is unpaid and not cancelled on a CLOSED session. POS cannot bill it: `regTableLines` returns TABLE_SESSION_CLOSED (`register.ts:1645`) and the floor lists OPEN sessions only. Silent revenue gap of I1.
  - Same result with `registerCloseTable` in place of the pay (`:381` counts I1 as paid).
- (b) **Two OPEN sessions on one table.**
  1. X closed S; C finds no other OPEN session (`:317`).
  2. `registerOpenTable` takes the advisory lock and still sees S as CLOSED, so it creates S2.
  3. C reopens S (`:319`).
  - End state: two OPEN sessions on one table. The floor shows only the oldest (`table.ts:104`), so rounds on S2 are hidden from billing.
- **Smallest fix**, in `unlinkTableSaleInTx` before the item update:
  - `SELECT … FROM "TableSession" WHERE id=… FOR UPDATE`, then read the status under the lock.
  - Before the conflict check: `pg_advisory_xact_lock(hashtext('restaurant-table:'||tableId))`, the same key as `restaurant/table.ts:176,227`.
  - Lock order stays session → items. Pay is items → session, but C never touches the payer's items, so there is no cycle.
- **ORACLE-ADD V6** (red-before required):
  - Setup: an extra table. Send round I1 → hold a draft → pay X (the session stays OPEN) → send the draft (I2) → `voidSaleByActor(X)` without draining.
  - (a) Open a tx that calls `unlinkTableSaleInTx(X)` and sleeps 2.5 s before commit; meanwhile quote+submit I2. Assert: the session is OPEN, I1 has `saleId` null, and `tq` lists I1.
  - (b) After a full-close bill plus void, hold `unlinkTableSaleInTx` open while `registerOpenTable` runs on the same table. Assert: exactly one OPEN session, and open returns `created:false`.

**H2 Low: after a legacy merge, the void consumer misses the items of the voided bill** (`pos-tables.ts:311`, filter `order: { sessionId }`).
- Interleaving:
  1. A is partly paid (I1 → X) and still OPEN.
  2. A legacy `mergeSession(B ← A)` moves A's orders to B (`restaurant/table.ts:358`).
  3. X is voided; the consumer runs `updateMany {saleId: X, order.sessionId: A}`, which matches 0 rows.
- End state: X is VOIDED (money returned, journal reversed), but I1 keeps `saleId=X`. It reads as paid forever, never re-billed, and is missing from B's unpaid total. Replays are no-ops, so it never self-heals.
- **Smallest fix**: filter by `tenantId`+`unitId`+`saleId` only (the saleId already scopes the bill). Reopen only the session that now owns the items: `order.session` of the unlinked rows, under the H1 locks.
- **ORACLE-ADD V7**: partial bill on A (HELD draft keeps it open) → legacy `mergeSession(B, A)` → void X + drain. Assert: I1 has `saleId` null and B's quote lists I1. Red-before: I1 still has `saleId=X`.

## Walked clean (traced, no defect)
- **Pay claim tx** (`register.ts:2519-2536`): advisory key lock → `existed` short-circuit → items FOR UPDATE ORDER BY id (EvalPlanQual re-checks CANCELLED/saleId) → createSale via `regCallerTx` (same xid) → settle `count === itemIds`. A loser rolls back with no sale, counter or outbox.
- **Retries** on P2034/P2028/P2002 re-enter the key lock, then `existed` returns the same bill. The post-commit `consumeSaleInventory` keys are per sale+line, so a replay or retry never cuts twice. STOCK_CUT_FAILED is logged only for a new bill.
- **Pay ⇄ send ⇄ close**:
  - Send holds S FOR SHARE (`table.ts:351`) before the draft claim and `createOrderInTx`. Settle and close FOR UPDATE wait, then count the new items. The `closeWhenPaid` draft count sees the sender's draft as still HELD, so no close.
  - No lock cycle: pay is items → session; send is session → draft → menu; close is session → draft.
- **Pay ⇄ `cancelTableItemInTx`**: whoever gets the item lock first wins. A cancel after a claim answers PAID → TABLE_ITEMS_CHANGED. A claim after a cancel gets a short count and rolls back. Menu stock is restored only together with the cancel (N3).
- **Draft versions**: edit and send both condition on `version` (`held-cart.ts:320`, `:335`); exactly one winner. newDraft relies on the partial unique index (migration line 13). A hold after close matches 0 rows → VERSION_CHANGED.
- **Send price is computed once** (`registerPriceTableRound`, channel = the table's) and frozen in `unitPrice`/`optionsTotal`/`lineTotal`. The bill uses `unitPrice+optionsTotal` (`register.ts:1659`), which equals `lineTotal/qty` and the floor `unpaidSatang`. Quote and submit use the same `regTableLines` + `regPrice`, the same channel, member `?? sess.memberId`, the same service charge/VAT and the same hash. Nothing is priced twice with different rules.
- **Stock**:
  - Menu `stockQty` (portion counter) is cut at send and restored on cancel of a NEW item.
  - Inventory is cut once at bill time: `itemId`/components from `expandRecipe` (`register.ts:1430-1437`); a recipe error gives `components=[]` plus a log.
  - Void restores via the existing `restoreVoidedInventory`. A re-bill cuts again under new keys, so the net is correct.
- **Void consumer wrapper** (`outbox-consumers.ts:687-703`): both steps always run and the first error is rethrown. `reverseFor` is idempotent and unlink is a no-op on replay, so a retry never re-posts.
- **Reservation seat**: reservation FOR UPDATE → table advisory lock → `!o.created` refusal with no writes; a replay of SEATED returns the same session.
- **COGS / `priceSource` null**: no accounting path reads `priceSource`; `bridgePosSalePaid` uses `lineTotal`/`itemId` only. COGS comes from inventory movements.

## Owner notes
- **บัญชี**:
  - Table-bill lines have no `priceSource`, so price-tier reports show them as "unknown". Revenue/VAT/COGS are unaffected.
  - Voiding a table bill sends its food back to unpaid. Re-billing creates a new receipt; the voided receipt keeps its reversal.
- **คลัง**:
  - Ingredients are cut at bill time, not when cooked. Food cancelled after COOKING/READY never cuts ingredients (waste is not recorded).
  - The legacy เช็คบิล door cuts no inventory for the same food. Stock depends on which door billed it (P2.4U hides legacy เช็คบิล).
- **ร้านอาหาร**:
  - The POS bill includes items of QR orders still PENDING approval (same as legacy `billPreview`/`checkout`).
  - Voiding a table bill after the table was re-seated leaves that food unpaid on a closed session POS cannot bill. Re-ring it by hand (by design, CD4; H1 fixes only the race).
  - A PromptPay/card intent paid against a bill refused as TABLE_ITEMS_CHANGED stays PAID and unconsumed: re-quote and reuse it, or refund.
- **เว็บช็อป**: no impact (no shop paths touched).

---
## Controller rulings (account A, 10 Oct 06:1xZ) — fix round 4 before merge (quality-first: both Lows are silent money gaps, fixes are two locks + a filter)
- **R3 OK** accepted. Docstring nit `table-actions.ts:135` → fix.
- **H1 fix**: `unlinkTableSaleInTx` takes `TableSession … FOR UPDATE` first, reads status under the lock, then `pg_advisory_xact_lock(hashtext('restaurant-table:'||tableId))` (same key as `restaurant/table.ts:176,227`) before the "other OPEN session" check and the reopen; lock order session → items. **ORACLE-ADD V6a/V6b** exactly as proposed, red-before logs.
- **H2 fix**: unlink filter = `tenantId`+`unitId`+`saleId` (drop `order.sessionId`); reopen the session that owns the unlinked rows (from the rows' `order.sessionId`) under the H1 locks; if the rows span 2 sessions, reopen each CLOSED one. **ORACLE-ADD V7** as proposed (legacy `mergeSession(B ← A)` then void + drain ⇒ I1 `saleId` null, B's quote lists I1), red-before.
- Count 46 → **49**. Gates: p2.4 ×3 forced + unforced, `--no-db`, p1.3, p1.8 (void), p1.16, restaurant ×4, pos-account, fitness ±env, typecheck. Then R4 = same hunter re-verifies H1/H2 (read-only) → merge.
- Owner notes → `POS-OWNER-PENDING.md` (บัญชี priceSource/void-rebill · คลัง cut-at-bill/legacy door · ร้านอาหาร PENDING QR items in bill / void after re-seat / paid intent after TABLE_ITEMS_CHANGED) — builder adds the lines in fix 4.

---
## R4 (hunter re-verify, 10 Oct 06:5xZ) — head b2c2aa84 (code 3bbb4a51, fix 8de9cb70)
**R4: OK · Merge GO from the money lane.** H1 closed (lock order session → table advisory → items; template string identical to `restaurant/table.ts:176,227`; no cycle with pay/send/close/open/two consumers). H2 closed (filter tenant+unit+saleId; every CLOSED owner reopened; replay no-op). V6a/V6b/V7 discriminating (red-before = exact H1a/H1b/H2 end states); direct in-tx call with a ~3 s hold is the consumer's own path made deterministic. `one_open_session_per_table` on QC4 = hand-applied (design docs only: `docs/qc/QC3-schema-convention.md`, `docs/modules/02-restaurant.md:507`, `restaurant.prisma:353`); the fix does not depend on it (V6b would still be red on the old code without it). Caveat P2.7: QR door `storefront.resolveTableSession` takes no advisory lock. R4-1 info: owner re-read loop may end on a stale set after 3 concurrent merges in one tx (reopen only) — optional throw → P2.11 line.
Controller: accepted; R4-1 → P2.11 follow-up line.

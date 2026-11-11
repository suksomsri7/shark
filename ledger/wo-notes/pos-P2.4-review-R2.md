# P2.4 S review R2: head 74044c87 (code 7f915ad2 = fix 85d3bcfe + ledger-only merge)
**Verdict: MERGEABLE-AFTER-FIXES.** F2–F8 are fixed. F1 is partial: the keyed modes are correct, but the R1 race is still reachable through the field-less path (N1). One more small fix is needed (N2). N3 and N4 are nits.

## Answer to the controller's F1 question: YES, the race is still reachable
- `holdTableDraftAction` (`table-actions.ts:136-150`, a "use server" file) declares all three fields optional and forwards `?? null`. `holdTableDraft` (`held-cart.ts:322-`) then takes the old update-or-create loop. Any client that leaves the fields out still gets both R1 races:
  - (a) last writer wins;
  - (b) A sends (draft RECALLED), then B's field-less hold finds 0 HELD rows and creates a new HELD draft with the lines that were already sent, so the next send cooks and bills them twice.
- No screen calls this action today (P2.4U is not built), so a client is the only way in. But the server is what must enforce the contract.
- **N1 (Medium)**: in table mode, refuse a hold that sends none of the three fields with VALIDATION. Then delete the old loop, or keep it only behind an internal flag the action cannot set.
- That needs a mechanical **ORACLE-EDIT** in `qc-pos-p2.4.mts` (assertions unchanged):
  - the `hold` helper `:1073` passes `newDraft:true`;
  - D1's re-hold `:1250` passes `heldCartId` + `expectedVersion` (read from `h1`);
  - 13 call sites use the helper: D1, D2 (VALIDATION/TABLE_NOT_FOUND cases unchanged), D4–D6, B6, P6, V4, T6 fixtures.
- How strong D7 is: strong for the keyed modes. It checks sequential and parallel holds on the same version (exactly one ok, version +1, winner's ข้าว kept and ต้มยำ absent), newDraft while a HELD draft exists, a hold after send refused with 0 HELD rows, and newDraft after send giving a new id. It does not cover the field-less hold after send (the exact R1 (b) case) or a `heldCartId` without a version. Add both to D7 as part of the N1 ORACLE-EDIT.

## New findings
- **N1 (Medium)**: above.
- **N2 (Low)**: with `heldCartId` and no `expectedVersion`, the condition is `{HELD, id}` only (`held-cart.ts:314-320`). That is a blind overwrite, so race (a) is still open in that mode. Fix: require `expectedVersion` whenever `heldCartId` is sent, otherwise VALIDATION. The P2.4U contract already sends both.
- **N3 (nit)**: `cancelTableItemInTx` restores menu stock (`pos-tables.ts:354`), then *returns* `{ok:false}` when `u.count !== 1` (`:360`). Returning does not roll back, so the stock restore would commit without the cancel. Under the item FOR UPDATE (`:345`) this branch can't happen, but throw anyway so the tx rolls back.
- **N4 (info, not a defect)**: V5 part (a), close during the round, was already green before the fix. Close's `FOR UPDATE` (`pos-tables.ts:375`) already conflicts with the FK KEY SHARE taken by the round insert. Only parts (c) and (b) are discriminating, and the red-before log confirms both. V5 calls the facade directly; the send wiring (`table.ts:350-351`) is checked by code review only.

## Per finding
- **F1 partial**: keyed modes OK at `held-cart.ts:243-320`. newDraft does a check, then create with P2002 ⇒ VERSION_CHANGED (`:304-312`). The conditional `updateMany` includes the version (`:314-320`). VERSION_CHANGED is wired at `register-shared.ts:218,898`, `register.ts:597` and th/en `errors.versionChanged`. Open: N1, N2.
- **F2 fixed**: `settleTableItemsInTx` takes the session FOR UPDATE before `count` (`pos-tables.ts:290`). `lockOpenSessionInTx` FOR SHARE + OPEN (`:328-333`) runs first in the send tx (`table.ts:350-351`), before the draft claim and `createOrderInTx`. Lock order (session, then draft) matches close (`table.ts:422-425`). `writeOrderTx` never updates TableSession, so two parallel sends can't deadlock by upgrading their shared lock.
  - V5 is genuinely concurrent: the round tx is held open 4 s / 2.5 s on its own connection, and pay/close run while it holds the lock. Part (b) is sequential.
  - The owner line names the QR/legacy doors (check-then-insert with no OPEN check under a lock; P2.7).
- **F3 fixed**: `table.ts:541-542`. `openSessionCore` returns early with no writes for an existing session (`restaurant/table.ts:200`). Replay of SEATED returns before that (`table.ts:535`). R4 asserts the exact th message, BOOKED with no sessionId, and that the occupant's session is unchanged.
- **F4 fixed**:
  - (a) Owner line names the POS⇄legacy double charge and the cancel race.
  - (b) The P2.4U contract line is in the notes (hide legacy เช็คบิล/ยกเลิกรายการ).
  - (c) `cancelTableItemInTx` (`pos-tables.ts:340-362`) locks the item FOR UPDATE and refuses when `saleId` is set (PAID ⇒ TABLE_ITEMS_CHANGED, `table.ts:473-474`). Its rules and messages match legacy `cancelOrderItem` byte for byte, and the item scope is the same as the old `tableItemExistsForPos`.
  - `git diff --stat` shows `restaurant/order.ts` has 0 changes (R11 holds).
- **F5 fixed**: `held-cart.ts:458,521,571,573` add `tableSessionId: null`. The non-table rows match as before (they already had a null `tableSessionId`).
- **F6 fixed**:
  - `register.ts:1428-1438`: a product that isn't visible ⇒ NOT_VISIBLE; a recipe error ⇒ `components=[]` + RECIPE (no longer INVALID_LINE).
  - The quote line gets `stockCut:false` only (`:1583`). No schema change.
  - The log runs after commit and drain, and only for a new bill (`:2543-2546`), not inside the tx.
  - Other lines keep their components: `components` is per line (`:1427`) and copied per line into the sale (`:2311`).
  - Nit: a recipe line that also has a tracked `invItemId` still cuts that item (same rule as register `:1509`), so the "not cut" badge can be partly wrong there.
- **F7 fixed**: `isTxConflict` (`table.ts:294`).
  - Send retries the whole loop (draft re-read, re-price, new tx) once, then BUSY (`:393-398`).
  - Close re-runs `once()` once, then BUSY (`:430-443`).
  - A conflict rolls back the whole tx, so nothing is half-applied. Send has no idempotency key; the claim on `draft.version` does that job, and close is naturally idempotent.
- **F8 fixed**: `gates-summary-D.txt` (header head 7f915ad2; 74044c87 adds notes only) shows p1.15 39/39 and shop-refund 12, hotel-money 5, ticket-money 6, subscription-money 14, all with rc 0. Every other §4 suite matches the brief.
  - Fix-round diff outside the ledger: only P2.4 files (held-cart, register(-shared), table(-actions), restaurant/index, pos-tables, messages, oracle).

## Oracle (item 9)
- The diff on `qc-pos-p2.4.mts` adds D7, V5, R4 and the `mkExtraTable` helper. There are 0 removed or changed lines, so nothing was weakened.
- Red-before logs are under `scratchpad/p24/runs/`:
  - D7: 43/44, B overwrote A.
  - V5: 43/45, lock missing; the session was CLOSED with 1 item stranded and dirtySince set.
  - R4: 43/46, the reservation was SEATED into the occupant's session.
- Each log has a tree/head header. Final run: 46/46 ×3, PAR 4/4, residue 0.

## Follow-ups
- Fix round 3, small: N1 (refuse field-less + ORACLE-EDIT helper/D1 + extend D7), N2, N3. After that, a quick R3 or the controller's own check is enough.
- P2.4U: always send `newDraft` or `heldCartId+expectedVersion`.
- P2.5: newDraft can race a close and leave an orphan HELD draft on a CLOSED session (harmless: send refuses it).
- P2.7: QR door lock + OPEN check.

## Controller rulings (account A, 10 Oct 05:3xZ) — fix round 3 (small)
- **N1 accept**: table-mode hold with none of `newDraft` / `heldCartId`+`expectedVersion` ⇒ VALIDATION (th "ต้องระบุร่างและรุ่นของร่าง" / en); delete the old update-or-create loop for table drafts (non-table path untouched). **ORACLE-EDIT (mechanical, assertions unchanged)**: `hold` helper `:1073` passes `newDraft:true`; D1 re-hold `:1250` passes `heldCartId`+`expectedVersion`; **extend D7** with (i) field-less hold after send ⇒ VALIDATION and 0 new HELD rows, (ii) `heldCartId` without `expectedVersion` ⇒ VALIDATION. Count stays 46.
- **N2 accept**: `heldCartId` requires `expectedVersion` (covered by D7 (ii)).
- **N3 accept**: `cancelTableItemInTx` throws on `u.count !== 1` so the tx rolls back (no stock restore without cancel).
- F6 nit (recipe line with tracked `invItemId` still cuts that item ⇒ badge partly wrong) → P2.4U contract note: badge text "ไม่ได้ตัดวัตถุดิบตามสูตร" (not "ไม่ได้ตัดสต็อก").
- After fix 3: quick **R3** (same reviewer, read-only, N1–N3 + oracle diff only) → **H** (money-lane hunter) → merge. Builder cap 2 ⇒ fix 3 starts when a slot frees (P2.8 fix 2 / P2.3U building).

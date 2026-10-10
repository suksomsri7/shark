# P2.4U review — head wip/pos-p2.4u daa0296d (code 2136e3c2) · tree shark-pos-p11 · read-only

**Verdict: MERGEABLE-AFTER-FIXES.** Two must-fix items, both one-liners (F1 breaks the binding "no money in UI" rule; F3 is a small money-risk). F2 is recommended. F4 needs a controller ruling. F5–F7 are nits. Server code is untouched, the merge is clean and the gates hold up.

## Findings
- **F1 (Medium · binding rule) — money is summed in the UI.** `src/components/pos/tables/TablePanel.tsx:334` does `moneyText(hidden.reduce((a,x)=>a+x.lineTotalSatang,0))` on the collapsed "เสิร์ฟแล้วอีก N รายการ" row. Example: a round with 5 served lines shows a ฿ figure the client added up from 3 snapshots. This is display-only and can't change a bill, but the rule says money is never computed in `components/pos/tables/**`. It is the only `+` on satang there. TableCheckout:269/312 mirror RegisterScreen:1819/2687; :362 is a bp ratio (see F5). Fix: drop the amount from the collapsed row (count + names only), or have S add a sum to the round DTO later.
- **F3 (Low · money-risk) — PromptPay confirm can open the wrong session.** The PAY_PROMPTPAY "ยืนยันรับเงิน" button finds the card by table, not by session (`TablesScreen.tsx:610-611`, `x.id === r.tableId`). The requests call is `.catch(()=>null)` and the old list stays (`:207/:216`) while the floor still refreshes. Example: the A8 bill is paid and the table reopens for new guests, and the last requests fetch failed. The old alert then opens a checkout for the **new** session with PROMPTPAY preselected, and the cashier confirms money that belongs to the old bill. Fix: match `x.sessionId === r.sessionId`; if nothing matches, refresh and show a toast. Apply the same to `onOpen` at :607.
- **F2 (Low · wrong message in the race the refusal exists for).** The seat refusal is mapped to `tables.errors.occupied` only when the **local** card already has a session (`TablesScreen.tsx:456`, `ReservationsDialog.tsx:79`). Example: device B opens reserved X9; device A, polled 15 s earlier, taps นั่งโต๊ะ. The server returns VALIDATION/tableOccupied (`table.ts` seat `!o.created`), but the UI shows the generic register VALIDATION text and does not refresh. Fix: on a VALIDATION seat refusal, run `refreshFloor()`, then pick the occupied message from the fresh card (or ask S for a distinct code in P2.5).
- **F4 (Low · controller ruling) — the P1.7 manager rule is skipped on the PromptPay preset.** `TableCheckout.tsx:390` passes `intent:null` when `promptpayPreset`. InterimPayDialog then uses the P1.6 static-QR confirm (`InterimPayDialog.tsx:208/680`), so `manualConfirmRequiresManager` is not honoured: any cashier can confirm PromptPay on a table bill. A CARD switch in that dialog also loses Beam. The server accepts PROMPTPAY without a `pi_` reference (`register.ts:2334`), so nothing catches it. D4 accepted "no new request"; this side effect was not stated. Smallest fix: if `payIntent.manualRequiresManager && !canManageShift`, open the normal checkout (with intent) instead of the preset, or disable the button with a reason.
- **F5 (Nit) — wrong "requested %" for amount discounts.** `TableCheckout.tsx:362` computes `wantBp` from `p.initialQuote`, which is null on the restore path and when the panel quote is stale/missing. An AMOUNT discount then shows 0 % requested in DiscountOverSheet. Fix: keep the subtotal of the last good quote in a ref.
- **F6 (Nit) — line highlight can land on the wrong line.** `RegisterScreen.tsx:1207`: `tblErr.lineIndex` is only cleared on the next send. If the cashier deletes a line above the refused one, the highlight moves to the wrong line. Fix: clear `tblErr` in `changeCart` while in table mode.
- **F7 (Nit) — hygiene.** (a) Every batch-A log header says `head=fce75068`, including fitness/fitness-pos/visual-dry/p1.18/p1.3. By timestamp those ran after 2136e3c2 was committed (08:08–08:13 vs 07:53), so the header is stamped once at batch start. Results are valid; the headers mislead. (b) Marker style: close `page.tsx` `tableUnits` line has `// POS P2.4U ◂` with no ▸. In the legacy floor `page.tsx`, the `) : (` / `)}` lines of the ternary are unmarked.

## Verified OK
1. **Draft save.** Every hold sends `newDraft:true` or `heldCartId`+`expectedVersion`: RegisterScreen:1929 (tableSave), :1982 and :1988 (bill-type append on VERSION_CHANGED). No field-less call exists, and the fixture uses `newDraft:true`.
   - VERSION_CHANGED / ALREADY_RECALLED: reloads the detail and appends only lines whose keys were not in the last loaded/saved draft (:1903, :1866-1885). Never a blind overwrite.
   - Send = hold first, then `registerSendTableRoundAction` with the held id (:1951).
   - `lineIndex` highlight (:1207); BUSY → retry node `pos-tbl-send-retry` (:2297); closed/not-found → banner.
2. **Checkout.** Quote `{lines:[],tableSessionId,billDiscount?,couponCode?}` (TableCheckout:133). Submit carries `expectedTableItemsHash: q.table.itemsHash` and `expectedGrandTotalSatang: q.grandTotalSatang` (:273-283).
   - Idempotency key: one per mount (:95); the layer is unmounted on close, so each dialog open gets a fresh key.
   - TABLE_ITEMS_CHANGED: toast + requote; the dialog stays open and confirm is disabled until the new quote arrives (`setQuote(null)` :142).
   - TABLE_EMPTY/CLOSED/NOT_FOUND → closes and reloads.
   - Manager PIN only: `canRequest={false}` → override quote.
   - Receipt: PayDone flow is the same as the register.
   - No `heldCartId`/`channelId` is sent; the server applies the member.
3. **Panel/cards.** Totals come only from the quote (TablePanel:359-379). The shown quote requires `quote.hash === itemsHash` (TablesScreen:294), and it re-quotes on hash or member change.
   - Served lines collapse when more than 3 are served (:307). KDS chips; `stockCut:false` badge "ไม่ได้ตัดวัตถุดิบตามสูตร" mapped through `quote.table.itemIds[i]` (1:1, per `regTableLines`).
   - ⋯ menu: close (TABLE_HAS_UNPAID/BUSY stay in the dialog), member link/unlink. Clear lives on the no-session panel.
   - `serviceCharge.differs` shows a warning. The 20 s poll and visibility listener are cleared on unmount (:310-318).
   - HF-418: every minute/clock text is gated on `now !== null`.
4. **Bill-type chip.** Free table → `registerOpenTableAction`, then `newDraft:true`. A seated table goes through the VERSION_CHANGED append. The strip confirm covers discount, member, coupon, channel, weighed lines and the bill note (table-ui.ts:59-69). The overridden toast is shown.
5. **Reservations/alerts.** ack/done call the right actions and refresh. PAY_PROMPTPAY → checkout with PROMPTPAY and no intent (subject to F3/F4).
6. **Permissions.** T-1 static gate before any table read; T-2…T-6 pass (62/62). The setup CTA only appears when `canCreateTables`, and the route `/app/u/[unitSlug]/restaurant/setup/page.tsx` exists.
   - D3 thin actions are OK: same VIEW_PERMS/`registerScopeFor` as `registerTables` (table.ts:40,67). They read through `registerProductsByIds` or the `tableFloorForPos` facade only, with no writes.
7. **Q10 line and legacy pages.** OpenTablesInfo is display-only, inside markers (shifts X card; close page for today). The legacy floor/session pages hide เช็คบิล, ยกเลิก and PromptPay ยืนยันรับเงิน. The owner line is quoted (POS-OWNER-PENDING.md:89).
8. **Keys, ST7, inventory, spec.** `pos.tables` has 197 keys in both th and en, with no duplicate keys. Every literal `t()` key used exists. ST7 = 0 (p1.18 81/81). fitness-pos F15.3a is green.
   - Fixture: built only through module functions. Each run has its own letter, and zones tagged "QC P2.4U" older than 1 h are swept. Cleanup is by id, in `finally` and on signals. Nothing is paid; cleanup throws if any fixture item has a `saleId`.
   - Cashier `tables-empty` hazard is real but fails loudly (StepError at `pos-tbl-empty`), not as a wrong shot. A concurrent owner/en run, a register run in the same invocation, or a crashed run (< 1 h) leaves tables in สีลม. Safe order: (1) cashier `--page tables --state tables-empty`, th then en, alone, after checking that no "QC P2.4U" zone exists in สีลม; (2) owner tables-empty (อารีย์); (3) everything else, in parallel if wanted. Watch for pid%24 letter collisions.
9. **`--no-verify`.** Only `.githooks/pre-commit` exists (fitness only). The final fitness ran green with no env and with the QC4 env (41/41 ×2). No `.qc-shots` or stray files are committed.
10. **Merge f63a393f.** The builder diff (7365d4db→c4fb9120) equals 1c613e52→f63a393f byte for byte, and the P2.8 diff equals c4fb9120→f63a393f. The `--cc` hunk is a pos.json adjacent auto-merge; the JSON is valid and `orders` is kept.
11. **Gates.** Notes match the logs (p2.4 49/49 · p2.3 46 · p2.2 42 · p2.1 55 · p1.3 128 · p1.5 21 · p1.9 53 · p1.12 72 · p1.15 39 · p1.16 28 · p1.18 81 · products 24 · authz 62 · restaurant ×4 · fitness ±env · fitness-pos 8/8 · dry ×4 rc 0). Typecheck is 0 on 2136e3c2.
    - The two post-batch commits touch only `TablesScreen.tsx` (+member re-quote trigger) and `TableCheckout.tsx` (+`setQuote(null)`), with no strings, testids or server code. The ST7/testid scanners and fitness ran after them, so no re-run is needed.

## Follow-ups
- **P2.12:** tax-invoice toggle and points/voucher on table checkout (D4/F-U1). Decide F4.
- **P2.5:**
  - A way to discard an unsent table draft. An empty cart is never saved, and recall/discard filter out table drafts, so a draft badge can stick until the table closes.
  - S should expose per-action `restaurant.*` rights so open/seat/cancel/close/reserve can be hidden for cashiers who will be refused.
  - A distinct "occupied" refusal code (F2).
  - `placedByUserId` on rounds (F-U5).
  - A sum for the served-collapse row (F1).
- **P2.11/P2.14:** legacy `/restaurant/checkout/<id>` still bills when opened by direct URL (F-U2, owner line exists).
- **Controller:** paid-fixture decision for the NEEDS_CLEARING shot (F-U3, D6). The code path was read and is OK (TableCardView:55 + clear button; TablePanel:181-205).

---
## Controller rulings (account A, 10 Oct 08:4xZ) — fix round 1 on `wip/pos-p2.4u`
- **F1 ✅ fix**: collapsed "เสิร์ฟแล้วอีก N รายการ" row shows count + names only (no satang sum in the UI); S follow-up P2.5 "sum on the round DTO".
- **F3 ✅ fix**: alerts match `x.sessionId === r.sessionId` (both the PromptPay confirm and `onOpen`); no match ⇒ `refreshFloor()` + toast "โต๊ะเปลี่ยนสถานะแล้ว — โหลดใหม่"; a failed requests fetch clears the stale list (or marks it stale and disables its buttons).
- **F2 ✅ fix**: on a VALIDATION seat refusal run `refreshFloor()` and show `tables.errors.occupied` when the fresh card has a session, else the generic text; P2.5 follow-up: distinct code.
- **F4 ✅ ruling**: the PromptPay preset keeps D4 (no new request) **but honours P1.7**: when `payIntent.manualConfirmRequiresManager && !canManageShift` the confirm requires the manager PIN exactly like the register's static-QR confirm (reuse that gate); in preset mode the method is locked to PROMPTPAY — switching ⇒ close and open the normal checkout (with intent). Note in the P2.4U notes + spec.
- **F5 ✅ fix** (keep the last good quote subtotal in a ref) · **F6 ✅ fix** (clear `tblErr` in `changeCart` while in table mode) · **F7 ✅ fix** (log header stamped per gate; markers ▸…◂ complete).
- D6/F-U3 paid fixture for NEEDS_CLEARING shot: **no** — stays unshot until P2.5 (code path read OK).
- Visual: vis64 (daa0296d) = controller's full view of 03 (money page); after the fix re-shoot only `tables-panel-rounds,tables-alerts,tables-checkout-dialog` (+ `register-table-mode` if F6 changes rendering) via `--state`.
- Gates after fix: typecheck · p2.4 49 · p1.3 128 · p1.18 81 · products · authz 62 · restaurant ×4 · fitness ±env · fitness-pos · visual `--dry` tables/register · **+ `qc-pos-p1.1`** (merge-gate rule, new) — note: S2.33 is red on the base until MAIN-MERGE lands the `recipe-actions.ts` rename; report its status, do not fix it here.

## Controller vis64 (head daa0296d = pre-fix1, QC5, 10 Oct 08:3xZ) — 03 viewed in full (money page)
- Floor/legend/zone tabs/stat line/cards/reservations sheet/alerts list/mobile 390 = match mockup 03 (walk-in queue = เร็ว ๆ นี้ per ruling; member line · service charge · NEEDS_CLEARING = P2.12/P2.5 follow-ups as recorded).
- **V1 (Medium, controller):** in the xl right column (`TablesScreen.tsx:850` `<aside … flex flex-col overflow-y-auto>`) the panel `<section data-testid="pos-tbl-panel" className="flex min-h-0 flex-col">` (`TablePanel.tsx:286`) shrinks when the orders list is tall and its totals/action buttons/เช็คบิล (`pos-tbl-totals` `mt-auto`) overflow onto the "แจ้งเตือนจากโต๊ะ" list below — visible in tables-floor/panel-rounds owner th+en 1440 and (smaller) cashier draft-unsent "เปิดกะก่อนเริ่มขาย" over the alerts heading. Ruling: inside the aside the panel must not shrink (`shrink-0`, aside scrolls as one column like mockup 03); the iPad/mobile `pos-tbl-panel-frame` (panel is its only child) stays as is. Fix in round 1 (own commit), then controller re-shoots `tables-panel-rounds,tables-alerts,tables-checkout-dialog,tables-draft-unsent` × owner/cashier th + owner en.
- tables-checkout-dialog ❌ on daa0296d (owner: `pos-reg-paydlg` not visible · cashier: เช็คบิล did not open in 15 s) — expected to clear with F2/F3/F4 fix1; re-shoot is in the list above.
- Register th run aborted by the controller's own `--state default,cart3,line-editor` (not in the p2.4u plan) ⇒ register th shots missing; en `register-table-mode`/`register-billtype-menu` taken. Controller re-shoots register th `--state register-table-mode,register-billtype-menu` owner+cashier after fix1.

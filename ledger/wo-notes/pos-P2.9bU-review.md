# P2.9bU — review file (controller tree · account B · 15 Oct 2026)

## R1 (verbatim · head d4b7dbb8 · code 081d2546)
# P2.9bU R1 review: wip/pos-p2.9bu d4b7dbb8 (code 081d2546, base c3c52ef1). Read-only, nothing run.
**Verdict: MERGEABLE-AFTER-FIXES.** One Medium finding (F1, wrong UI, no money impact). F2–F7 are Low or info and can go to follow-ups.

## Findings
- **F1 Medium**: `InterimPayDialog.tsx:722-736` (DEPOSIT_NOT_OWNER). If any row needs the last 4, the whole refusal is put on those rows. Input: a walk-in bill with deposit A (walk-in with phone, last 4 already checked by lookup) and deposit B (member X's, added by exact receipt no; S `deposit.ts:366` shows its balance, so it can be used). Confirm → `service.ts:417` NOT_OWNER for B. The UI shows "4 หลักท้ายไม่ถูกต้อง" on A, clears A's last 4 and keeps B. Re-entering the right digits gives NOT_OWNER again, so the cashier loops on the wrong row. Smallest fix: on the in-page path (`!sentStripped`, rows already checked by the panel), drop the `memberLinked` rows first with `errors.depositNotOwner`. Blame the last-4 rows only when there is no member-linked row, or on the stripped/forRow path. Optionally, tag rows that came from the bill-member list.
- **F2 Low**: `InterimPayDialog.tsx:790` (dev. 5). After a reload, every rebuilt DEPOSIT row is `needsLast4:true`, including member and no-phone deposits. The cashier must type 4 digits nobody knows. S ignores them (`register.ts:2524`), so this only confuses. Follow-up: an S reader by depositId, or prompt only for the first row.
- **F3 Low**: `DepositReceiveDialog.tsx:232`. Once the PromptPay intent is PAID, `canClose` stays false until done. If S then refuses for good (setting switched off → VALIDATION "ร้านยังไม่เปิดรับมัดจำ", or PERMISSION_DENIED), the sheet cannot be closed and the paid intent has no deposit. Only a reload gets out. Fix: allow close when the refusal is definite, and leave the intent to the register's existing paid-intent handling.
- **F4 Low**: `DepositReceiveDialog.tsx:275`. The preview `<iframe srcDoc>` has no `sandbox="allow-same-origin"`, unlike ReceiptSettings and TablePreBill. The renderer escapes (`receipt-render.ts:313`), so this is defense in depth: add the attribute.
- **F5 Low (visual fixture)**: `visual-pos.mts` refund-deposit uses `P29BU.sale`, which lives only in that process's memory. The notes tell the controller to run `--page sales` as a separate run, so it always falls back to a fresh ฿1,000 fixture. The claim "uses the sale-done receipt" does not hold. Also, the register run's cleanup refunds the sale deposit. Fix: run register + sales in one call, or fix the note.
- **F6 Info**: the `deposit-receive` state types the fixture phone into a visible text input, so the screenshots show it in clear. Names and logs are clean (grep: no match in ledger or runs/*). Controller call.
- **F7 Info**: `DepositSettingsCard.tsx:73-92` shows the switch to non-owners who hold `pos.settings.payment`. S refuses them → "เฉพาะเจ้าของร้าน…". This is the same pattern as the P2.9U TipSettingsCard, so OWNER-only is enforced on the server only. Nit: the refund chips reuse the P1.8 labels "คืนเข้า PromptPay เดิม" and "คืนเข้าบัญชีที่โอนมา", which may not match how the deposit was taken.

## Verified OK
- **R1**: tile `:1515-1531` uses `tenders.deposit` from the one-per-open tenders effect. `visible:false` ⇒ null. Off ⇒ `pay.depositTileOff` "ยังไม่เปิดใช้". testid kept.
- **R2**: placeholder "เลขใบเสร็จ / ชื่อ" (`:1810`). There is no phone hint in the search placeholder, helper, error or en text. The phone fields are only in the receive sheet and the last-4 label.
  - Search needs ≥ 3 chars (`DEPOSIT_QUERY_MIN`). The member list via `{memberId}` loads when the tile is chosen.
  - A balance-less row is looked up again by `receiptNo`, with the last 4 only when `needsPhoneLast4` (`depPick/depVerify`).
  - Amount = min(due, remaining), capped at the balance in `depPress`, over-due blocked, short hint "รับส่วนต่างด้วยวิธีอื่น". ≤ 3, each once (`:919`).
  - The tip claim is true: `REGISTER_CASH_LIKE_PAY` `register-shared.ts:825` = CASH/PROMPTPAY/TRANSFER/CARD, used by `cashLikeRows/tipAllowed/tipFundOk` `:357-360`. `gcRows` counts GIFT_CARD only.
  - UI money = DTO remaining − row amount, display only.
- **R3**: `last4Ref`/`depLast4Ref` plus an uncontrolled password input. `stripPayPins` marked hunk `register-shared.ts:838-843` covers savePending (`RegisterScreen.tsx:735`), `pendingSubmit` (:1756) and the done layer (:1767). Cleared by `clearPins` (:508), unmount, removeRow and the rows effect.
  - Grep of the diff: `phoneLast4` never reaches storage, URL, `data-*`, console, toast or testid values. The `deposit-actions.ts` `unexpected()` logs only the location and the error.
  - c20c8f06 is correct. Restore (`opts.restore`, :1792) → pinAgain rebuild "again". In-page retry → the dialog keeps its rows and `sentStripped` (:1299) sets note "again". S checks the phone before the prior key (`register.ts:2524` vs :2533), so both paths reach a duplicate after the digits are entered again. Neither path leaks the digits.
- **R4**: NOT_FOUND/CLOSED → `depDropClosed` (rows removed + note). LOCKED → last-4 rows removed + `errors.depositLocked` "15 นาที". EXCEEDS → `depRelookup` runs once per new error, re-caps and shows the banner, with no resubmit and so no loop. VALIDATION → toast `pay.depositValidation` (:1800). DEPOSIT_* → `REFUSAL_KEY` `register-shared.ts:1003-1007`. All 76 new keys exist in th and en with the same key set.
- **R5**: the menu shows when tenders `deposit.enabled` is true (`RegisterScreen.tsx:360`). Selling is checked by the page gate plus wrapper `assertCan pos.sale.create` and S `regScope REG_SELL_PERMS` (`register.ts:701-703`).
  - Walk-in phone is required (`depositPhoneOk` = S regex `deposit.ts:196`). The member path sends `memberId` without a phone.
  - CASH always sends `cashReceivedSatang` (:145). PROMPTPAY uses the same `usePayIntent`/`PayIntentPanel` (no copy), with HF-PP `manualBlocked` + `submitRefusalMessageKey`. CARD sends the EDC ref.
  - The title comes from S `titleOf` `receipt-render.ts:279`, unedited. Setting off ⇒ `pay.depositRcvDisabled`.
- **R6**: `PayDone.tsx` reads `payments[].deposit.receiptNo/remainingAfterSatang` from the receipt payload. Renderer untouched.
- **R7**: `bills.ts` is not edited. The existing `channel` filter = `sourceModule` (`bills.ts:133-135, :265`). Tag, row title and drawer title are present.
  - Refund (DepositRefund): amount read-only = lookup remaining, chips CASH/PROMPTPAY/TRANSFER with no reference (no `pi_`), reason required.
  - PERMISSION_DENIED → the same `ManagerPinPad` as P1.8. Refusals are mapped. The approval queue is listed as a follow-up.
- **R8**: the wrapper passes `patch` through whole (`payment-settings-actions.ts:57-61`), so no hunk was needed. Helper text matches ruling 14 exactly.
- **R9**: all 10 states are present; the cashier gets pick/split/receive/sale-done.
  - Fixtures go through `registerTakeDeposit`. Locked = 5 × `checkDepositPhone` wrong.
  - Cleanup runs at the last job, in `finally` (:7302) and on signal (:1296). It refunds the OPEN remainders by TRANSFER and restores the setting; bills stay.
  - refund-deposit returns before submit. `--dry` rc 0 for owner (28) and cashier (10); sale-done-deposit is 1440 only (one PAID bill per user).
- **R10**: all listed testids are in the code and `pos-ui-inventory.json`. The spec file exists. The §pay addendum is in `pos-spec-P1.3-register-ui.md`; there is no `pos-spec-register.md` file.
- **R11**: no hunk in any forbidden file (diff `--name-only` is empty).
  - `deposit-actions.ts` is thin (session → scope → S), `"use server"` with async exports only and type-only imports. Client imports are `*-shared`, pure modules or `*-actions` (receipt-render is already used by clients).
  - Hunks are marked. ST7 = 0 (`runs/qc-pos-p1.18.out`). Only tokens are used, apart from `bg-white` and `bg-black/40`, which match the base. Controls are ≥ 44 px. The gate logs are headed `head=081d2546 dirty=0`; p2.9b unforced 53/53.

## Follow-ups
Refund approval queue (S dev. 4) · an additive `depositId` on NOT_OWNER/LOCKED/NOT_FOUND refusals (fixes F1/F2 at the root) · an S reader for receipt → remaining for managers (dev. 2) · `qc-pos-p1.1` merge gate and the QC5 shots are CONTROLLER-RUN.

## Controller rulings — fix round 1 (15 Oct ~11:5xZ · binding)
1. **F1 (Medium) = fix as proposed**: tag deposit rows by origin (`memberLinked` = came from the bill-member list or an exact receipt-no lookup that returned a balance without last-4). On the in-page path (`!sentStripped`, rows already checked by the panel) a `DEPOSIT_NOT_OWNER` blames the member-linked rows first (remove + `errors.depositNotOwner`); last-4 rows are blamed only when there is no member-linked row, or on the stripped / `forRow` path (clear last-4 + "4 หลักท้ายไม่ถูกต้อง"). Never loop on the same row twice: a second NOT_OWNER on the same row set after a correct re-entry ⇒ remove the remaining deposit rows with a generic note.
2. **F2 (Low) = follow-up** (root fix = additive `depositId` on NOT_OWNER/LOCKED/NOT_FOUND refusals + S reader by depositId — add to `POS-OWNER-PENDING.md`/HF-FU2 bucket). UI only: after a reload the "again" note must say the row may not need the digits ("ใส่ 4 หลักท้าย (ถ้ามี) อีกครั้ง") — one key change, th+en.
3. **F3 (Low) = fix**: after a PAID PromptPay intent, a definite S refusal (`VALIDATION` setting-off, `PERMISSION_DENIED`) must allow closing the sheet; show the intent reference in the error line ("ชำระแล้ว อ้างอิง …") so staff can reconcile, and cite the register's existing paid-intent-without-sale handling (if none exists, say so — the owner line then covers it).
4. **F4 (Low) = fix**: `sandbox="allow-same-origin"` on the preview iframe (match ReceiptSettings/TablePreBill).
5. **F5 (Low) = fix the note only**: `refund-deposit` under a separate `--page sales` run uses the fresh ฿1,000 fixture — rewrite the `--state` note accordingly (the controller already shoots it that way); fixture behaviour unchanged.
6. **F6 (info) = accepted**: the receive sheet shows the typed phone in clear (real UI does too). Builder confirms the fixture constant is an obviously fake number (08x-000-xxxx style) and that `.qc-shots/` is git-ignored; no masking.
7. **F7 (info)**: switch visibility stays as the P2.9U TipSettingsCard pattern (follow-up, both cards together). **Refund chip labels = fix**: deposit-neutral labels "คืนเงินสด" / "คืนผ่าน PromptPay" / "คืนโดยโอน" (new keys th+en, ST7).
8. Re-run gates: typecheck · `qc-pos-p1.18` (ST7) · `qc-pos-p1.3` · `qc-pos-p2.9b` unforced · `qc-hf-pos-page-authz` · fitness ±env · `--dry` owner+cashier. Touched visual states to re-shoot (controller): `paydlg-deposit-notowner`, `deposit-receive`, `refund-deposit`.

## Controller image review — vis79 @d4b7dbb8 (15 Oct ~11:50Z · 50 shots · all runs rc 0)
Compared with `design-pos/02-payment.png` (02 + 02b), `12-bills-refund.png`, `17-settings-3.png`, `19-states.png`. Owner 1440 th all 10 states + 390 pick/receive + en split/refund + cashier receive.
- ✅ 02 tile "มัดจำที่ชำระไว้ · เลขใบเสร็จ / ชื่อ" · pick panel (search · result row with masked phone + balance · masked last-4 + helper · amount · "ใช้มัดจำนี้ ฿625" · numpad) · split rows "มัดจำ #… ฿325 ✓ · คงเหลือ ฿745", tile "✓ 1 ใบ" · exceeds banner + re-capped row · notowner / locked inline notes · receive sheet (amount · name · phone required · note · cash/PromptPay/card · change) · 02b "มัดจำ #… ฿625 · คงเหลือ ฿375" · bills chip "มัดจำ" + tag + title "ใบรับเงินมัดจำ" · refund sheet (read-only whole remainder · 3 chips · reason) · settings card "มัดจำ" toggle + helper · cashier receive identical · en copy clean.
- ⚠️ V1 (Low · en copy): lookup row says "Balance after ฿1,070" — should be "Balance ฿x" (split row keeps "Balance after"). → ruling 9 (sent to fix-1 builder).
- ⚠️ V2 (Low · 390): pick panel's "ใช้มัดจำนี้" + numpad below the fold of the sheet; builder must confirm the panel scrolls (or make it). → ruling 10.
- ℹ️ exceeds shot keeps the typed cash 125 while the remainder became 126 after the re-cap — expected (cash row not yet added); full-page captures duplicate the sticky header (capture artifact, as in earlier cards).
- Re-shoot after fix 1: `paydlg-deposit-notowner`, `deposit-receive`, `refund-deposit` (ruling 8) + `paydlg-deposit-pick` 390 + en (rulings 9–10).

## Fix round 1 delivered (builder · head 36e0be7c · 15 Oct ~11:58Z)
Rulings 1–10 done (commits c63bb676 · 815bac5a · 4ca02b70 · c3edbae2 · 0aa39bef · notes 36e0be7c); no server change; gates at 0aa39bef dirty 0: typecheck 0 · fitness 50/50 ±env · p2.9b unforced 53 · p1.18 81 (ST7 0) · p1.3 128 · authz 81 · --dry owner 28 / cashier 10. Ruling 10: already scrolls (`InterimPayDialog.tsx:1237` body `overflow-y-auto`; numpad `hidden md:grid`). Ruling 3 precedent: `TERMINAL_SUBMIT` :245 / close :414 / `pay.intent.refundYourself` :2058 — server has no reconciliation for PAID intents without a sale.
**Owner lines to add to `POS-OWNER-PENDING.md` at merge (controller)**: (1) deposit refusals carry no `depositId` — UI blames rows by origin (fix 1 ruling 1); root fix = additive `depositId` on NOT_OWNER/LOCKED/NOT_FOUND + S reader by depositId (HF-FU2 bucket). (2) a PromptPay intent PAID for a deposit whose take is then refused (setting off / permission) stays PAID with no deposit — staff reconcile from the `pi_` reference shown; no server reconciliation yet (same as the register).
→ R2 (verification) + chain78 re-shoot `paydlg-deposit-pick` · `paydlg-deposit-notowner` · `deposit-receive` · `refund-deposit` th+en @36e0be7c.

## R2 (verbatim · head 36e0be7c vs d4b7dbb8)
# P2.9bU R2: fix round 1 on wip/pos-p2.9bu 36e0be7c (vs d4b7dbb8). Read-only, nothing run.
**Verdict: MERGEABLE.** F1–F7 and V1–V2 are closed as the rulings say. G1 is Low and allowed by ruling 1, so it can be a follow-up. G2 and G3 are info only.

## Findings
- **G1 Low** `InterimPayDialog.tsx:752`. The "same set twice" step drops every deposit row, including a walk-in row the cashier re-entered correctly, even when a member row is the real cause. Input: walk-in A (has a phone) plus member B (another member's, from an exact receipt-no lookup). Unknown result → retry (stripped) → NOT_OWNER → A gets "again" (:754). The cashier enters A's correct digits. NOT_OWNER again (from B) → sig matches → A and B both removed with the generic `depositNotOwnerAgain`. The same happens after any forRow re-entry. It stops after 2 tries and has no money impact, and ruling 1 allows it. Smallest fix: in step (0), when `own.length`, drop only `own` with `errors.depositNotOwner` first, and drop all only when no member row is left.
- **G2 Info** `th/en pos.json:334`. "ใส่ 4 หลักท้าย (ถ้ามี) อีกครั้ง" / "(if any)" reads as optional, but `depLast4Missing` (:357, gating confirm at :401) still blocks a rebuilt member or no-phone row until 4 digits are typed. Wording only, per ruling 2. The real fix stays with the F2 follow-up (`depositId` on the refusal plus an S reader).
- **G3 Info** `ledger/wo-notes/pos-P2.9bU.md:97` spells out the fixture number `0800000427`. It is obviously fake, so there is no impact, but the visual-pos comment (:6186) says it should not appear in any summary. Nit: write `080-000-xxxx`. The run logs are clean (grep `0427|081999` in `runs/fix1-final/*` finds nothing).

## Verified OK
- **R1 (F1)**: tags are correct on every path.
  - Panel add, `:945`: `memberLinked = sel.memberLinked && !needsPhoneLast4` (S makes these exclusive, `deposit.ts:364/367`). `l4Checked = needsPhoneLast4`. This is sound because `depCanUse` needs `depBal` (:904), and that is set only by a depVerify hit; any edit hides the balance again (:891).
  - forRow re-entry, `:928`: `l4Checked:false`. Reload rebuild, `:809`: `memberLinked:false, l4Checked:false`.
  - Blame order, `:752-756`: (0) set seen before → drop all + `depositNotOwnerAgain`. (1) stripped retry → all last-4 rows "again"; otherwise unchecked last-4 rows "wrong". (2) member rows dropped + `depositNotOwner`. (3) last-4 rows "wrong". (4) drop all.
  - Case A checked + B member, in-page: suspects are empty, so B is dropped and A is kept. A alone with wrong forRow digits → "wrong"; a second refusal → removed. No path loops.
  - The sig is the sorted numeric `PayRow.id` list (:731), not object identity, so a re-render cannot defeat it. It is reset in `clearPins` (:512) and on any drop (:742).
  - Only (0) and (4) remove a verified walk-in row (see G1).
- **R2**: only `depositLast4Again` changed, th and en. Nothing else on the replay path changed (`:774-792` untouched).
- **R3**: `paidRef` is set only for VALIDATION with the setting confirmed off via tenders (`DepositReceiveDialog.tsx:173-176`) and for PERMISSION_DENIED (:178).
  - The ref is the request's own `pi_` id (:158), which is not a secret. The `pos-reg-deprcv-paid-ref` line is at :513.
  - `canClose` (:242) uses `!paidRef`. `close` cancels only PENDING intents (:246), so a PAID intent is neither cancelled nor refunded.
  - Precedent checked: `TERMINAL_SUBMIT` :245 and `tryClose`/`terminalRefusal` :414 are real and equivalent. `pay.intent.refundYourself` is at :2060, not :2058 as cited (comment nit only).
- **R4**: the iframe has `sandbox="allow-same-origin"` only (:285).
- **R5–6**: the `--state` note and the dry-run text are rewritten, fixture behaviour is unchanged, and `P29BU_PHONE="0800000427"` appears only in `visual-pos.mts:6189` (plus G3). `.gitignore:46` has `.qc-shots/`.
- **R7**: `bills.deposit.refundMCash/MPromptpay/MTransfer` exist in th and en with the ruled text, mapped to CASH/PROMPTPAY/TRANSFER (`DepositRefund.tsx:21-25`, namespace `pos.bills`). There is no `pi_`.
- **R9**: the lookup row uses `pay.gc.balance` (:1881). Its text is generic, "Balance {amount}" / "คงเหลือ {amount}", and is shared with store credit (:2006). Split rows keep `gc.rowLeft` "Balance after" (:1373).
- **R10**: `:1237 overflow-y-auto` (closes at :2118) contains the panel, `deposit-use` (:1986) and the numpad `hidden … md:grid` (:2074). The confirm footer (:2235) is outside it.
- **Sweep**:
  - The diff touches only 3 client files, 2 message files, visual-pos, the inventory and the ledger. No server file. Hunks are marked `POS P2.9bU ▸ fix1`.
  - th and en have the same key set (3289 = 3289, symmetric difference empty).
  - `0aa39bef..36e0be7c` = `ledger/wo-notes/pos-P2.9bU.md` only. Every gate log is headed `head=0aa39bef dirty=0`: p1.18 81/81 with ST7 ✅, p2.9b unforced 53/53, rc 0.

## Follow-ups
G1 (prefer member rows in step 0) · F2 root fix (`depositId` on refusals plus an S reader) · F7 switch visibility for both cards · CONTROLLER re-shoots: notowner, deposit-receive, refund-deposit, pick 390 + en.

## Controller rulings — fix round 2 (15 Oct ~12:1xZ)
R2 = MERGEABLE. G1 (Low, allowed by ruling 1) is still a cashier dead-end on a money tender, and the fix is a few lines ⇒ **fix round 2 = G1 + G3 nit only** (sent to the fix-1 builder): step (0) drops member-linked rows first with `errors.depositNotOwner`, "drop all" only when no member row remains; notes write the fixture phone masked. Gates: typecheck · p1.18 · --dry. R2 reviewer re-verifies the diff (R3-lite). G2 = F2 follow-up (root fix `depositId` on refusals + S reader, HF-FU2 bucket).

## Fix round 2 delivered + R2 re-verify (head 692a02d7 · 15 Oct ~12:3xZ)
Builder: 9c20f704 G1 (step 0 drops member rows first, remaining rows = new watched set; drop-all only when no member row left) · d87addd3 G3 (masked phone in notes) · gates fix2 @d87addd3 dirty 0: typecheck 0 · p1.18 81 ST7 0 · --dry owner rc 0.
R2 re-verify = **MERGEABLE**: A+M keeps A in every ordering, ≤ 1 extra attempt, sig reset correct, single 7-line marked hunk, keys unchanged. Info H1 (refusal has no depositId ⇒ wrong-row drop possible when the member's own deposit is valid and the walk-in digits are wrong twice — root fix follow-up) · H2 (merge gate runs the full set — gates91).
**Controller decision: merge 692a02d7 into `session/pos` after vis80 (fix-1 re-shoot) is judged; gates91 (19 suites) on tree b; owner lines (2) + H1 appended to POS-OWNER-PENDING at merge.**

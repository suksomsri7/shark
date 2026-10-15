# POS P2.9bU — มัดจำ UI (จอชำระ 02 ช่อง "มัดจำที่ชำระไว้" + แผงเลือกมัดจำ · รับมัดจำจากหน้าขาย · 02b · บิล 12 ตัวกรอง/คืนมัดจำ · ตั้งค่าเปิดรับมัดจำ)

Prompt `ledger/pos-briefs/pos-prompt-accountB-P2.9bU.md` (rulings 1–11) · builder account B · tree `/root/projects/shark-pos-b` · branch `wip/pos-p2.9bu` from `origin/session/pos` a1d8af43 (code c3c52ef1 = P2.9b S merged).
Spec: `ledger/pos-briefs/pos-spec-P2.9b-deposit-ui.md` (+ addenda in `pos-spec-P2.9-tender-ui.md`, `pos-spec-P1.3-register-ui.md` §pay). **No server behaviour change** — no edit to register.ts / service.ts / deposit.ts / deposit-links.ts / tender.ts / refund*.ts / payment-settings.ts / receipt*.ts / bills.ts / outbox-consumers.ts / pos-sale-contract.json / prisma.

## Status (commit per step)
- [x] 1 `cartToSubmitInput` depositId/phoneLast4 pass-through · `stripPayPins` drops phoneLast4 (savePending / retry copy / 02b) · `deposit-actions.ts` · replay NOT_OWNER → "again" (6668b9a4)
- [x] 2–3 tile + pick panel + split rows + DEPOSIT_* refusals + th/en keys + inventory rows (5793743e)
- [x] 4–5 receive dialog + deposit receipt done/preview/print · 02b applying-bill lines (6140cc7f)
- [x] 6 bills 12 chip/tag/title/drawer lines/refund sheet (cf56e004)
- [x] 7 settings toggle (a4f92f4e)
- [x] fixes after self-review (c20c8f06): replay NOT_OWNER only on the restore path · last-4 edit hides the balance until re-verified · mobile bills card title
- [x] 8 visual-pos wo p2.9bu + spec (081d2546)
- [x] 9 merge `origin/session/pos`: still a1d8af43 at 10:47Z (base = tip) ⇒ nothing to merge (HF-FU not pushed yet)
- [x] gates (table below)

## Components / files
| file | what |
|---|---|
| `src/lib/modules/pos/deposit-actions.ts` (new, "use server") | `registerTakeDepositAction` · `registerDepositLookupAction` · `registerRefundDepositAction` — session → ctx/actor (copy of `register-actions.ts sessionScope`: canAccessUnit + `pos.sale.create`); S does every other check |
| `register-shared.ts` (marked hunks) | `cartToSubmitInput` DEPOSIT rows `{depositId, phoneLast4?}` · `stripPayPins` drops `phoneLast4` · `REGISTER_MAX_DEPOSITS` 3 · `DEPOSIT_QUERY_MIN` 3 · `hasLast4lessDeposit` · `DEPOSIT_INLINE_CODES` · `depositPhoneOk` (mirror of the S check) |
| `InterimPayDialog.tsx` | tile (ruling 1) · pick panel (2) · `last4Ref` (3) · inline refusals + banner (4) · prop `memberId` |
| `DepositReceiveDialog.tsx` (new) | receive dialog (5) · done = "ใบรับเงินมัดจำ #… ฿x" + iframe preview (`renderReceiptHtml` of S payload) + print |
| `RegisterScreen.tsx` | `depositOn` (tenders on mount) · `openDepositReceive` (key = `newKey()` per open) · layer `depositReceive` · `memberId` → dialog · send(): replay NOT_OWNER (restore) → pinAgain · VALIDATION with deposit rows → toast · savePending comment |
| `RegisterModeTabs.tsx` / `RegisterMoreMenu.tsx` / `RegisterTopContext.tsx` | "⋯" item `pos-reg-menu-deposit-receive` · mobile header button `pos-reg-mobile-deposit-receive` |
| `PayDone.tsx` | DEPOSIT rows → "มัดจำ #… ฿x · คงเหลือ ฿y" from payload `payments[].deposit` (6) |
| `BillsClient.tsx` / `bills-ui.tsx` / `DepositRefund.tsx` (new) | chip (server `channel` = sourceModule filter) · tag/title · drawer deposit lines · refund sheet + manager PIN (7) |
| `DepositSettingsCard.tsx` (new) + `PaymentSettings.tsx` | toggle + helper (8) |
| `src/messages/{th,en}/pos.json` | `register.pay.deposit*` (47) · `register.more.depositReceive` · `bills.deposit.*` (23) · `settings.payments.deposit*` (5) — th 1:1 en, en no Thai |
| `scripts/pos-ui-inventory.json` | 38 rows (+ `pos-reg-paydlg-method-deposit` expect updated) |
| `scripts/visual-pos.mts` | wo `p2.9bu` |

## Rulings — how each is met (citations)
1. Tile: `tenders.deposit.enabled` (one `registerPayTendersAction` per open, P2.9U effect) · off ⇒ "ยังไม่เปิดใช้" · `visible:false` ⇒ null · testid kept.
2. Panel: placeholder "เลขใบเสร็จ / ชื่อ" (no phone) · ≥ 3 · member list via `{memberId}` · rows/balance per DTO · balance-less ⇒ re-lookup by receiptNo (+ last 4) · amount = min(remaining, balance), capped, "รับส่วนต่างด้วยวิธีอื่น" · ≤ 3, each once · **tip from cash-like only**: `REGISTER_CASH_LIKE_PAY` (`register-shared.ts:823`) drives `cashLikeRows`/`tipAllowed`/`tipFundOk` in `InterimPayDialog.tsx` (P2.9U "มติ 6" lines) — DEPOSIT not in the set; deposits are not counted in `gcRows` (GIFT_CARD only).
3. Hygiene: `last4Ref` + uncontrolled password input (`.value` set directly) · `clearPins` / unmount / removeRow / rows-effect clear · `stripPayPins` ⇒ savePending, `pendingSubmit`, done layer · replay without it ⇒ NOT_OWNER ⇒ "กรุณาใส่ 4 หลักท้ายอีกครั้ง".
4. Refusals inline (error card suppressed for DEPOSIT_INLINE_CODES) — see spec §1.
5. Receive dialog — menu iff setting on (tenders) and actor may sell (page gate `posRegisterView` + `deposit-actions.ts sessionScope` + S `registerScopeCheck` `REG_SELL_PERMS`, `register.ts:687–703`) · phone required for walk-in · `cashReceivedSatang` always on cash · PromptPay = `usePayIntent`/`PayIntentPanel` (pi_) · manual = HF-PP manager rule (`submitRefusalMessageKey`) · done + preview (title from `payload.depositReceipt`, `receipt-render.ts:279`) + print.
6. 02b lines from `payments[].deposit` (receipt payload, `receipt.ts:353`) — renderer untouched.
7. Bills: server source filter exists (`bills.ts:133–135, :265` `channel` = sourceModule) ⇒ **no client-side filtering, no deviation needed** · refund sheet: whole remaining, cash-like chips (CASH / PROMPTPAY manual / TRANSFER), reason required · manager-PIN path = `ManagerPinPad` (same component as `BillsClient` P1.8/P1.15 `mgrPinSubmit`) · approval queue not wired (S deviation 4) → follow-up.
8. Settings: `updatePosPaymentSettingsAction` passes `args.patch` whole (`payment-settings-actions.ts:57–61`) ⇒ `{deposit:{enabled}}` works without a hunk.
9–10. Visual states + testids + inventory + spec — below.

## Deviations (ruling touched)
1. **Wrappers** (prompt): `deposit-actions.ts` = 3 thin `"use server"` wrappers; `sessionScope` duplicated (register-actions' is not exportable from a "use server" file).
2. **Receipt lookup for the refund button** (7): there is no S reader "receipt bill → deposit + remaining"; the drawer uses `registerDepositLookupAction({query: receiptNo})`. Member/no-phone deposits show "คืนมัดจำ (คงเหลือ ฿y)"; **walk-in deposits with a phone show "คืนมัดจำ"** and the sheet asks the last 4 (+ "ดูยอด") before the fixed amount appears — the S lookup hides their balance without the last 4 (counted by `checkDepositPhone`). No server read added.
3. **NOT_OWNER has two S causes** (4): wrong/missing last 4 (rows needing last 4 kept, last 4 cleared, "4 หลักท้ายไม่ถูกต้อง", panel reopens) vs another member's deposit / member deposit on a walk-in bill (no last-4 row ⇒ member rows removed + `errors.depositNotOwner`). The `paydlg-deposit-notowner` state shoots the second (a submit-level wrong last 4 is only reachable via the forRow path after a replay — the panel verifies the last 4 by lookup before "ใช้มัดจำนี้").
4. **DEPOSIT_NOT_FOUND / CLOSED carry no row** (4): rows re-looked up by receipt no (status is visible without balance) and the bad ones removed; nothing identifiable ⇒ all deposit rows removed. **DEPOSIT_LOCKED** removes every last-4 row (refusal names none).
5. **Replay rows** (3): a reload-rebuilt DEPOSIT row knows only `depositId` (stored request) ⇒ shown "มัดจำ" without receipt no / balance, marked "ใส่ 4 หลักท้ายอีกครั้ง" (all rebuilt deposit rows assumed to need the last 4). In-page "ลองอีกครั้ง" of a stripped request ⇒ same "again" note (dialog flag `sentStripped`); the reload/restore path goes through `pinAgain` (RegisterScreen `send(..., {restore})` only).
6. **VALIDATION** (4): toast `pay.depositValidation` only when the bill has deposit rows (dialog stays in form, key kept); other VALIDATION = unchanged.
7. **Receive entry on mobile** (5): < 768 has no mode tabs/"⋯" ⇒ header icon button `pos-reg-mobile-deposit-receive` (same condition); hidden in table mode.
8. **Receive VALIDATION mapping** (5): VALIDATION ⇒ re-read tenders; setting off ⇒ "ร้านยังไม่เปิดรับมัดจำ", else "ข้อมูลมัดจำไม่ครบหรือไม่ถูกต้อง…" (S returns one code for both).
9. Component names avoid the `*Sheet` suffix (fitness F14/F15.3 treats it as an interactive component needing a testid): `DepositReceiveDialog`, `RefundDepositDialog`.
10. Pay-dialog amount on mobile = default min(remaining, balance) (numpad md+ only) — same as the P2.9U gift-card panel.

## Fixtures (visual-pos p2.9bu)
`ensureP29buFixture` / `cleanupP29bu` (after the last p2.9bu job · finally · signal): setting `pos.deposit.enabled` on via `updatePosPaymentSettings` (restored) · deposits via `registerTakeDeposit` (TRANSFER, device DEVICE_ID whose shift the owner opens — `openShiftAsOwner` now also runs for p2.9bu jobs) · walk-in name + phone constant in fixture code only (never logged) · pick/split ฿1,070 reused · exceeds/locked ฿500 fresh per shot · notowner = QC member's deposit ฿500 · sale-done ฿1,000 fresh (+ 1 PAID bill/user) · refund-deposit = a fresh ฿1,000 fixture deposit (the sale-done receipt only when register + sales run in one call; a separate `--page sales` run always takes the fresh fixture — fix1 ruling 5) · exceeds = ฿1 bill via `submitRegisterSale` (DEPOSIT ฿1) between pick and confirm · locked = 5 × `checkDepositPhone` wrong · cleanup = `registerRefundDeposit` (TRANSFER, whole remaining) for every round deposit still OPEN; bills stay (like sale-done).

## `--state` list for the controller (CONTROLLER-RUN · `visual-pos.mts p2.9bu --states --page <p> [--state …]` · 1440/1024/390 · th + LOCALE=en)
- owner · register: `paydlg-deposit-pick,paydlg-deposit-split,paydlg-deposit-exceeds,paydlg-deposit-notowner,paydlg-deposit-locked,deposit-receive,sale-done-deposit`
- owner · sales: `bills-deposit-filter,refund-deposit` (a separate `--page sales` run ⇒ refund-deposit opens on a fresh ฿1,000 fixture deposit — fix1 ruling 5)
- owner · settings: `settings-deposit-toggle`
- cashier · register: `paydlg-deposit-pick,paydlg-deposit-split,deposit-receive,sale-done-deposit`
`--dry` rc 0: owner 28 shots · cashier 10 shots (`runs/visual-dry-owner.log`, `runs/visual-dry-cashier.log`).

## Follow-ups
- Refund-deposit approval queue (POS_REFUND) not wired (S deviation 4).
- S reader for "receipt bill → deposit remaining" (for managers) would let the drawer show the balance of phone-protected walk-in deposits without the last 4 (deviation 2) — owner/controller call.
- NOT_OWNER / LOCKED / NOT_FOUND refusals carry no deposit id; an additive `depositId` on the refusal would let the dialog act on exactly one row (deviations 3–4).
- `qc-pos-p1.1` merge gate = CONTROLLER-RUN.

## Gates (final · one systemd-run unit `ISO_MEM=7000M bash scripts/iso.sh bash scratchpad/p29bu/run-gates.sh …` · logs `/tmp/claude-0/-root/a129a720-3235-582c-8bcd-f2169f38cd68/scratchpad/p29bu/runs/*.out`, every log headed `tree=/root/projects/shark-pos-b head=081d2546 dirty=0` · 10:47–11:15Z · DB = QC4 via qc4.sh + pos gate lock · QC_FORCE=1 except p2.9b)
| gate | result | log |
|---|---|---|
| typecheck (pos-gate.lock · heap 5632) | rc 0 (mid-run at 6668b9a4+wip: rc 0, `runs/typecheck-mid.log`) | runs/typecheck.out |
| fitness no-env / env (qc4) | 50/50 · 50/50 | runs/fitness-noenv.out · fitness-env.out |
| fitness-pos (F15.2 contract unchanged · F15.3 inventory 922 rows · F15.4 th/en) | rc 0 | runs/fitness-pos.out |
| qc-pos-p2.9b **unforced** | **53/53** (no server change) | runs/p29b-u.out |
| qc-pos-p2.9 | 62/62 | runs/qc-pos-p2.9.out |
| qc-pos-p1.3 | 128/128 (S5.20/S5.21 static: no key created outside RegisterScreen generator) | runs/qc-pos-p1.3.out |
| qc-pos-p1.8 · p1.12 | 49/49 · 72/72 | runs/qc-pos-p1.8.out · qc-pos-p1.12.out |
| qc-pos-p1.18 | 81/81 · U-phase · **ST7 = 0** | runs/qc-pos-p1.18.out |
| qc-pos-p1.10 · p1.16 · p1.6 | 40/40 · 28/28 · 48/48 | runs/qc-pos-p1.10.out · p1.16 · p1.6 |
| qc-hf-pos-page-authz | 81/81 (no new page; count unchanged) | runs/qc-hf-pos-page-authz.out |
| qc-pos-p2.8 | 61/61 · PAR 4/4 (ST6 green — register.ts/service.ts untouched) | runs/qc-pos-p2.8.out |
| visual-pos p2.9bu --states --dry (CI=1) owner / cashier | rc 0 (28 / 10 shots) | runs/visual-dry-owner.log · visual-dry-cashier.log |
Not run here (CONTROLLER-RUN): qc-pos-p1.1 (merge gate), the visual shots (needs a server).

## Fix round 1 (R1 MERGEABLE-AFTER-FIXES · controller rulings 1–10 · base d4b7dbb8 · no server code · never-touch list respected)
Commits: c63bb676 (rulings 1–2) · 815bac5a (3, 4, 7) · 4ca02b70 (5–6) · c3edbae2 (spec + inventory) · 0aa39bef (9) · this notes commit. All hunks inside P2.9bU-owned code or `// POS P2.9bU ▸ fix1 … ◂` marks; th + en same key set (+3 keys `pos.bills.deposit.refundM*`, +1 `pos.register.pay.depositRcvPaidRef`, +1 `pos.register.errors.depositNotOwnerAgain`; 1 value changed `pos.register.pay.depositLast4Again`); ST7 = 0.

- **Ruling 1 (F1 · DEPOSIT_NOT_OWNER blame by origin)** — `InterimPayDialog.tsx`: dep row type + `l4Checked` (true = digits passed the panel's `depVerify` lookup; false after a `forRow` re-entry, a NOT_OWNER blame, or a reload rebuild); `memberLinked` = S `memberLinked` (customerId) ∧ seen with a balance without last 4 (bill-member list / exact receipt no — the only rows `service.ts:417` can refuse without digits; a no-phone walk-in deposit can never raise NOT_OWNER, so it is not tagged). New ref `notOwnerSet` (reset in `clearPins`). Handler order: (0) same deposit-row set refused again after a re-entry ⇒ remove all remaining deposit rows + `errors.depositNotOwnerAgain` "ใช้มัดจำที่เลือกกับบิลนี้ไม่ได้ — นำออกจากรายการแล้ว…" (no loop) · (1) stripped retry ⇒ all last-4 rows / in-page ⇒ last-4 rows with unchecked digits (forRow path) ⇒ clear + "อีกครั้ง"/"4 หลักท้ายไม่ถูกต้อง" + panel reopened · (2) member-linked rows ⇒ removed + `errors.depositNotOwner` · (3) no member-linked row ⇒ checked last-4 rows "ไม่ถูกต้อง" · nothing ⇒ all removed. R1 input (walk-in A checked by lookup + member X's B by receipt no) ⇒ step 2 removes B, A kept with its digits. `paydlg-deposit-notowner` fixture path (member deposit only) unchanged ⇒ step 2.
- **Ruling 2 (F2 · UI only)** — `pay.depositLast4Again` th "ใส่ 4 หลักท้าย (ถ้ามี) อีกครั้ง" / en "Enter the last 4 digits again (if any)". Root fix (additive `depositId` on NOT_OWNER/LOCKED/NOT_FOUND + S reader by depositId) = follow-up for the controller to carry into `POS-OWNER-PENDING.md` / HF-FU2 bucket (not edited here — controller file).
- **Ruling 3 (F3)** — `DepositReceiveDialog.tsx`: `paidRef` state = the `pi_` reference sent with the request; set on a definite refusal while the PromptPay intent is PAID (`VALIDATION` with tenders `deposit.enabled` false · `PERMISSION_DENIED`, incl. the manual-confirm-manager message); `canClose` allows close when `paidRef` is set (intent not cancelled — stays PAID); line `pos-reg-deprcv-paid-ref` "ชำระแล้ว อ้างอิง {ref} — ยังไม่ได้บันทึกมัดจำ คืนเงินลูกค้าเองหรือแจ้งเจ้าของร้าน". **Register paid-intent-without-sale handling cited**: `InterimPayDialog.tsx` `TERMINAL_SUBMIT` (:245) → `terminalRefusal` lets `tryClose` close with money in (:414) and shows `pay.intent.refundYourself` "บิลนี้บันทึกไม่ได้แล้ว แต่เงินเข้าแล้ว — คืนเงินลูกค้าเอง" (:2058). That is UI only: the server (`payment-intent.ts`) has **no** sweep/reconciliation of PAID-but-unconsumed intents (statuses PENDING/PAID/CONSUMED/EXPIRED/CANCELLED; only `submitRegisterSale` consumes) ⇒ the owner line covers the reconciliation (staff use the `pi_` reference + the `pos.payment.intent_paid` event).
- **Ruling 4 (F4)** — preview `<iframe>` `sandbox="allow-same-origin"` (as `TablePreBillDialog.tsx:120` / ReceiptSettings).
- **Ruling 5 (F5 · note only)** — `visual-pos.mts` `refund-deposit` state note, the `--dry` plan text and the `P29BU.sale` comment now say: a separate `--page sales` run always opens a fresh ฿1,000 fixture deposit (the sale-done receipt only when register + sales run in one call); fixture behaviour unchanged. Same correction in this file's fixtures line and `--state` list.
- **Ruling 6 (F6 · confirmed)** — fixture constant was `081-999-xxxx` (not obviously fake) ⇒ changed to `P29BU_PHONE` = `080-000-xxxx` (080-000-xxxx style, same last 4, so lock/wrong-4 fixtures unchanged); only in `visual-pos.mts` fixture code (grep: no match in ledger/ or runs/*). `.qc-shots/` is git-ignored (`.gitignore:46`, `git check-ignore` ✓). No masking.
- **Ruling 7 (F7)** — switch visibility unchanged (TipSettingsCard pattern · follow-up with both cards). `DepositRefund.tsx` chips: `pos.bills.deposit.refundMCash|refundMPromptpay|refundMTransfer` = "คืนเงินสด" / "คืนผ่าน PromptPay" / "คืนโดยโอน" (en "Cash refund" / "Refund via PromptPay" / "Refund by transfer"); P1.8 `refund.m.*` untouched.
- **Ruling 9 (V1 · en copy)** — lookup result row (`pos-reg-paydlg-deposit-row-<n>`) now uses `pay.gc.balance` (en "Balance ฿x", th "คงเหลือ ฿x" — identical th text) instead of `pay.gc.rowLeft`; "Balance after ฿y" stays on the split rows (`pay.gc.rowLeft`, :1373). No key added/changed.
- **Ruling 10 (V2 · 390 pick panel · confirmed, no change)** — below md the pay sheet body is the scroll container: `pos-reg-paydlg` `h-[100dvh] flex-col overflow-hidden` → form `min-h-0 flex-1 flex-col` → body `div` (`InterimPayDialog.tsx:1237`) `min-h-0 flex-1 flex-col overflow-y-auto md:overflow-hidden`; the right column (:1617, no clipping below md) holds `pos-reg-paydlg-deposit-panel` (:1815) and `pos-reg-paydlg-deposit-use` (:1986) inside that body (closes :2118), while the footer (:2120) is a sibling outside it ⇒ the button scrolls into reach. The numpad is `hidden md:grid` (:2074) — not rendered below md. The full-page shot shows everything below the fold of the visible sheet; no layout change.
- Spec `pos-spec-P2.9b-deposit-ui.md` + `pos-ui-inventory.json` (`pos-reg-deprcv-submit` anyOf + `pos-reg-deprcv-paid-ref`) updated.
- Re-shoot (controller): `paydlg-deposit-notowner`, `deposit-receive`, `refund-deposit` (separate `--page sales` run ⇒ fresh ฿1,000 fixture) + `paydlg-deposit-pick` 390 + en.

### Gates fix 1 (one systemd-run unit `ISO_MEM=7000M bash scripts/iso.sh bash scratchpad/p29bu/run-gates-fix1-final.sh …` · logs `scratchpad/p29bu/runs/fix1-final/*.out`, each headed `tree=/root/projects/shark-pos-b head=0aa39bef dirty=0` · QC4 via qc4.sh + pos gate lock · QC_FORCE=1 except p2.9b; an earlier full run at c3edbae2 (before ruling 9) is in `runs/fix1/` — all green)
| gate | result | log |
|---|---|---|
| typecheck (pos-gate.lock · heap 5632 · incremental tsconfig) | rc 0 | runs/fix1-final/typecheck.out |
| fitness no-env / env (qc4) | 50/50 · 50/50 | runs/fix1-final/fitness-noenv.out · fitness-env.out |
| qc-pos-p2.9b **unforced** | **53/53** (no server change) | runs/fix1-final/p29b-u.out |
| qc-pos-p1.18 | 81/81 · U-phase · **ST7 = 0** | runs/fix1-final/qc-pos-p1.18.out |
| qc-pos-p1.3 | 128/128 | runs/fix1-final/qc-pos-p1.3.out |
| qc-hf-pos-page-authz | 81/81 (no new page) | runs/fix1-final/qc-hf-pos-page-authz.out |
| visual-pos p2.9bu --states --dry (CI=1) owner / cashier | rc 0 (28 / 10 shots · fixture phone not printed) | runs/fix1-final/visual-dry-owner.out · visual-dry-cashier.out |

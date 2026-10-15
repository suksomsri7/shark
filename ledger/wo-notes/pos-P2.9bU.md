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
`ensureP29buFixture` / `cleanupP29bu` (after the last p2.9bu job · finally · signal): setting `pos.deposit.enabled` on via `updatePosPaymentSettings` (restored) · deposits via `registerTakeDeposit` (TRANSFER, device DEVICE_ID whose shift the owner opens — `openShiftAsOwner` now also runs for p2.9bu jobs) · walk-in name + phone constant in fixture code only (never logged) · pick/split ฿1,070 reused · exceeds/locked ฿500 fresh per shot · notowner = QC member's deposit ฿500 · sale-done ฿1,000 fresh (+ 1 PAID bill/user) · refund-deposit = the sale-done receipt (fallback fixture ฿1,000) · exceeds = ฿1 bill via `submitRegisterSale` (DEPOSIT ฿1) between pick and confirm · locked = 5 × `checkDepositPhone` wrong · cleanup = `registerRefundDeposit` (TRANSFER, whole remaining) for every round deposit still OPEN; bills stay (like sale-done).

## `--state` list for the controller (CONTROLLER-RUN · `visual-pos.mts p2.9bu --states --page <p> [--state …]` · 1440/1024/390 · th + LOCALE=en)
- owner · register: `paydlg-deposit-pick,paydlg-deposit-split,paydlg-deposit-exceeds,paydlg-deposit-notowner,paydlg-deposit-locked,deposit-receive,sale-done-deposit`
- owner · sales: `bills-deposit-filter,refund-deposit` (run after register so refund-deposit uses the sale-done receipt)
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

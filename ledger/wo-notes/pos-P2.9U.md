# POS P2.9U — tender UI: 02 row-2 tiles · gift-card panel + PIN · store credit · tips · 02b lines · 12 refund to card · tips ledger setting

Prompt `ledger/pos-briefs/pos-prompt-accountB-P2.9U.md` (rulings 1–12 binding) · builder account B · tree `/root/projects/shark-pos-b` · branch `wip/pos-p2.9u` from `session/pos` 4967ce2d (code d871877c = P2.9 S merged) · spec `ledger/pos-briefs/pos-spec-P2.9-tender-ui.md` (+ addendum in `pos-spec-P1.3-register-ui.md`).
No server behaviour change: no edit to `register.ts`, `service.ts`, `tender.ts`, `tender-cards.ts`, `refund.ts`, `payment-settings.ts`, `giftcard/**`, `member/**`, `outbox-consumers.ts`, `scripts/pos-sale-contract.json`. Two new read-only "use server" wrappers (deviations 3–4).

## Status (build order, ruling 12 — one commit per step)
- [x] 1 `cartToSubmitInput` carries `giftCard` · `stripPayPins` · pure helpers (9a15143a)
- [x] 2–5 pay dialog: tiles + tenders reader · gift-card panel + PIN + rows · store credit + tip · refusal mapping · inventory rows (4b6d0437, fix f1148fa2)
- [x] 6 02b PayDone lines (f7d46a8e)
- [x] 7 12 refund to card / store credit (80591d42)
- [x] 8 settings tip ledger (80871fb9)
- [x] 9 visual states + inventory + spec (64caf14c harness · c5e98962 spec)
- [x] 10 merge `origin/session/pos` d341ed7f (ledger only — P2.5 S not merged yet) → 0fb244fd → final gates (table below)

## Components / hunks (all foreign hunks marked `// POS P2.9U ▸ … ◂`)
- `src/lib/modules/pos/register-shared.ts` — `cartToSubmitInput` GIFT_CARD `giftCard` (PIN-less rows keep `number` only) · block "POS P2.9U ▸ วิธีชำระบัตร…": `REGISTER_CASH_LIKE_PAY`, `REGISTER_MAX_GIFT_CARDS`, `GIFT_CARD_PIN_MIN/MAX`, `giftCardNumberKey`, `stripPayPins`, `hasPinlessGiftCard`, `giftCardKindOf`, `storeCreditOf`, `submitInputToCart` (pure).
- `src/components/pos/register/InterimPayDialog.tsx` — props `tenders · member · onScanGiftCard · scannedGiftCard · pinAgain`; row-2 tiles (ruling 1); gift-card panel (ruling 2); `pinsRef` + uncontrolled PIN input (ruling 3); refusal effect (ruling 4); store credit round/row (ruling 5); tip footer + "รวมทิป" (ruling 6). Legacy row kept when `tenders` is absent (TableCheckout / OrderPay).
- `src/components/pos/register/RegisterScreen.tsx` — `savePending` + in-memory `pendingSubmit` + done layer use `stripPayPins`; camera layer `forGiftCard`; `pinAgain` on VALIDATION of a PIN-less request (+ `submitInputToCart` after reload); `STORE_CREDIT_NOT_OWNER` toast; PayDialog props; PayDone `tipSatang`/`duplicated`.
- `src/components/pos/register/PayDone.tsx` — `pos-reg-done-pay-lines` from `receiptPayloadAction` payments[].card + tip line.
- `src/app/app/sys/[id]/pos/sales/BillsClient.tsx` — refund chips per card / store credit / caps · `allocateRefund` rows · reason text required for the unusable-card cash share.
- New: `src/lib/modules/pos/refund-tenders-shared.ts` (types + pure `allocateRefund`) · `refund-tenders.ts` (reader) · `refund-tender-actions.ts` ("use server") · `tip-ledger-shared.ts` · `tip-ledger-actions.ts` ("use server") · `src/app/app/sys/[id]/pos/settings/TipSettingsCard.tsx`; `PaymentSettings.tsx` renders it.
- `scripts/visual-pos.mts` — wo `p2.9u` (plans, jobs, --dry/--list, fixture `ensureP29uFixture`, `runP29uState`, cleanup in last-job/finally/signal; wo p2.9u skips the P1.10U/P1.16 seeds).
- `scripts/pos-ui-inventory.json` — +13 rows, −1 (`pos-bills-refund-method-credit`), notes of 6 existing rows updated (tiles · tip).

## Messages (th + en, `src/messages/{th,en}/pos.json`) — S keys reused (`register.errors.giftCard*`, `storeCreditNotOwner`, `register.pay.giftCard/storeCredit`)
`register.pay.gc.*` (39: tiles · panel · reasons · rows · banner · tip lines) · `register.done.tip` · `bills.refund.m.storeCredit|storeCreditSub` · `bills.refund.tender.*` (9) · `settings.payments.tip*` (13). F15.4 green (3009 keys), ST7 (no Thai outside `t()` in the two UI trees).

## testids (ruling 11)
Register: `pos-reg-paydlg-method-giftcard|storecredit|deposit|roomcharge` (unchanged ids) · `pos-reg-paydlg-giftcard-number|-scan|-lookup|-amount|-pin|-use|-row-<n>|-row-note-<n>|-row-pin-<n>|-panel|-result|-unusable|-notfound|-insufficient|-error|-note|-changed|-changed-close` · `pos-reg-paydlg-storecredit-row|-info` · `pos-reg-paydlg-tip` (existing id) `-tip-toggle|-tip-total|-tip-cashonly|-tip-over|-over-due` · 02b `pos-reg-done-pay-lines`.
Bills: `pos-bills-refund-method-card-<giftCardId>` · `pos-bills-refund-method-storecredit` · `pos-bills-refund-cash-cap|-split|-card-cash|-uncovered`.
Settings: `pos-settings-tip-card|-tip-enabled|-tip-ledger|-tip-ledger-error|-tip-save|-tip-saved|-tip-owner-only|-tip-load-error`.
Inventory rows = interactive ids only (F15.3 kinds); display-only ids listed in the spec.

## Ruling 9 (verified, no change)
`shift.method.GIFT_CARD|STORE_CREDIT` th "บัตรของขวัญ/เครดิตร้าน" en "Gift card/Store credit" → `ShiftsClient.tsx:49` · `report.closeDay.method.*` → `close/page.tsx:49` (`t.has(method.X)`), `ReportsClient.tsx:57/:240`, `ReportsOverview.tsx:85/:576` · `receipt.public.pay.*` → `PosPublicReceipt.tsx:44` · receipt renderer prints card + "คงเหลือ" (`receipt-render.ts:394–395, :582–583`) — not edited.

## Deviations (ruling each touches)
1. **Ruling 1/5 · F4** — `registerMemberBenefits.giftCards[]` has **no `kind`** on the base: `member/wallet.ts:367–373` maps `id/numberMasked/balanceSatang/expiresAt/status` only (the `kind` added to `giftcard.listForCustomer` at `giftcard/service.ts:1224` is dropped there) and `register-member.ts:398` maps `numberMasked/balanceSatang/expiresAt`. No server edit: `giftCardKindOf` uses `kind` when present, else the mask prefix (`SC-••••` = STORE_CREDIT — `maskTenderNumber` `giftcard/service.ts:1274`, used for SC at :1225). Follow-up (member owner): pass `kind` through wallet + register-member.
2. **Ruling 4** — the `GIFT_CARD_PIN` refusal carries **no row index and no attempts-left** (`register.ts:602` message · `service.ts:291–299 tenderStep` → `PosSaleError(code, message)` · `RegisterRefusal.lineIndex` unset) ⇒ every gift-card row shows "PIN ไม่ถูกต้อง" (one card = that card) and no "(เหลือ N ครั้ง)". `GIFT_CARD_LOCKED`/`CHANGED` re-look up the rows to find the card(s).
3. **Ruling 8** — the bill/refund DTOs have no per-card cap (`SaleForRefund.payments` = type/amount/reference; bill `card` = kind/masked/balanceAfter, no `giftCardId`) ⇒ new read-only wrapper **`refundTenderOptionsAction`** (`refund-tender-actions.ts`, first gate pos.sale.refund|create like `saleForRefundAction` → `refund-tenders.ts`: `saleForRefund` scope/permission first, then the bill's PosPayment rows, prior REFUND docs, `member.tenderCardInfo`, `member.giftCardRefundable`) + pure `allocateRefund` for multi-row refunds (chosen chip up to its cap → cards → store credit (member) → cash-like cap → unusable-card share as cash (walk-in, reason)). `refundSale` still decides.
4. **Ruling 6** — no account ledger list action reachable from POS (`listLedgers` `account/coa.ts:217` is not in the account facade; F2 forbids pos→account internals) ⇒ new read-only wrapper **`posTipLedgersAction`** (`tip-ledger-actions.ts`, perm `pos.settings.payment` like `posPaymentSettingsAction`, same link query as `payment-settings.tipLedgerOk`, returns the linked book's non-archived ledgers) + client-side LIABILITY filter; the server validates on save. There was **no UI** for `payment-settings.ts` fields (no P1.6 form — grep of `updatePosPaymentSettingsAction` in `src/**/*.tsx` = 0) ⇒ new `TipSettingsCard` in the payments tab (`PaymentSettings.tsx`) with its own save button (the tab's save writes the intent settings, a different store).
5. **Ruling 1** — `TableCheckout`/`OrderPay` (tables/online orders) keep the P1.12U disabled row: `payOrder` refuses GIFT_CARD/STORE_CREDIT (CD-P29-1 b) and table checkout is not in this card. Owner line exists (gift card via API/online orders = later card).
6. **Ruling 3** — besides `savePending`, the **in-memory retry request and the 02b layer are PIN-stripped** too: an "unknown" retry of an uncommitted key comes back VALIDATION ⇒ "กรุณาใส่ PIN อีกครั้ง" on the rows (no PIN re-sent from memory). Detection = VALIDATION on a request with a PIN-less GIFT_CARD row (`hasPinlessGiftCard`; the server text `register.ts:2255` is not exported). After a reload the cart is rebuilt (`submitInputToCart`, same key) and the rows are recreated once the new quote equals the stored total (else "ยอดบิลเปลี่ยน — รับเงินใหม่ทั้งบิล").
7. **Ruling 6** — tips off ⇒ the toggle is **hidden** (P1.6 showed it disabled with `errors.tipNotAvailable`); the tip is editable while rows exist (P1.6: only before the first row) because card/credit rows come first; tip decreased below what was taken ⇒ `pos-reg-paydlg-over-due` (remove a row).
8. **Ruling 8** — P1.16's disabled chip `pos-bills-refund-method-credit` is replaced by `pos-bills-refund-method-storecredit` (member bills only); inventory row swapped.
9. **Ruling 7** — 02b reads `receiptPayloadAction` once for the card lines (fresh bill = original, no audit — `receipt.ts:129–141`); `duplicated` results do not read (avoids a copy + audit on an old bill).
10. **Ruling 10 fixtures** — no module "set PIN" exists ⇒ after `giftcard.sell` the fixture sets `pinHash` with the module's own formula `sha256("<number>:<PIN>")` (`giftcard/service.ts:512`) to a constant kept in the harness only (never logged); `GIFT_CARD_CHANGED` uses legacy `giftcard.use` (a USE txn with a QC refId; `postGiftCardUse` JV only when the QC shop's `accountingLink` is on and the card has `accountingDocId`); the QC member's store credit is issued once per day (`member.issueStoreCredit`, key per day — not cleaned: wallet balance, no module debit); gift-card **sale bills stay** (like sale-done); run cards are suspended in cleanup; gift-card/tip settings restored.

## Visual states for the controller (`--state` list · QC5)
`visual-pos.mts p2.9u --states --page register --state paydlg-giftcard-entry,paydlg-giftcard-split,paydlg-giftcard-pin-error,paydlg-giftcard-insufficient,paydlg-giftcard-changed,paydlg-storecredit,paydlg-tip,sale-done-giftcard`
`visual-pos.mts p2.9u --states --page sales --state refund-to-card` (after the register run — reuses the sale-done-giftcard bill; alone = newest gift-card bill of today in the unit)
`visual-pos.mts p2.9u --states --page settings --state settings-tip-ledger`
× owner/cashier × th (+ LOCALE=en = 1440). ⚠️ writes: 4 gift cards + 4 card-sale bills per run (suspended after), 1 PAID bill per user (sale-done-giftcard), legacy USE on the CHANGED card, QC member store credit ฿200 once per day, tips enabled then restored. Pages also touched by these states and worth a look: 02 legacy row (tables) unchanged; P1.12U member states now show the store-credit tile when the QC member holds credit.

## Follow-ups
- Member owner: `kind` through `wallet.getWallet().giftCards` + `registerMemberBenefits` (deviation 1).
- S owner (optional): refusal `lineIndex` / attempts-left on `GIFT_CARD_PIN` would let the UI mark the exact row (deviation 2).
- Gift card / store credit at table checkout and online orders = later card (deviation 5).
- QC member store credit accumulates by ฿200/day of visual runs (no module debit) — controller line if it matters.
- (fix 1 · owner line a) S owner, P2.11: one shared pure `refundTenderCaps` used by `refund.ts planRefundTenders` and `refund-tenders.ts` (the UI reader recomputes the same caps today).
- (fix 1 · owner line b) member owner: `registerMemberBenefits.giftCards` lacks `kind` and `status` — a SUSPENDED store-credit card still enables the tile until the server answers at submit.

## Gates (final)
All logs headed `tree=/root/projects/shark-pos-b head=0fb244fd dirty=0` (14 Oct 23:01–23:16Z) in `scratchpad/p29u/runs/final/*.log` (runner `scratchpad/p29u/gates.sh`, sequential); head 0fb244fd = code f1148fa2 + spec c5e98962 + upstream d341ed7f (ledger only). The notes commit after it is ledger-only. Mid-way typecheck at 80871fb9: rc 0 (`runs/typecheck-mid.log`).
| gate | log | result |
|---|---|---|
| typecheck (pos-gate.lock · 5632/6500M) | typecheck.log | rc 0 |
| qc-pos-p2.9 **unforced** | qc-pos-p2.9.log | **62/62** (residue 0 · guardHits 0 · APIN green) |
| qc-pos-p1.3 | qc-pos-p1.3.log | 128/128 |
| qc-pos-p1.8 (refund) | qc-pos-p1.8.log | 49/49 |
| qc-pos-p1.12 | qc-pos-p1.12.log | 72/72 |
| qc-pos-p1.18 (ST7 U-phase = 0 · nav pins) | qc-pos-p1.18.log | 81/81 |
| qc-pos-p1.10 | qc-pos-p1.10.log | 40/40 |
| qc-pos-p1.16 | qc-pos-p1.16.log | 28/28 |
| qc-pos-p1.6 | qc-pos-p1.6.log | 48/48 |
| qc-hf-pos-page-authz | qc-hf-pos-page-authz.log | 81/81 |
| qc-pos-p2.8 (ST6 — register.ts/service.ts untouched) | qc-pos-p2.8.log | 61/61 |
| fitness no-env / env (qc4) | fitness-noenv.log · fitness-env.log | 50/50 · 50/50 |
| fitness-pos | fitness-pos.log | 8/8 (F15.3 814 rows · F15.4 3009 keys) |
| visual-pos p2.9u --states --dry (CI=1) register/sales/settings × owner/cashier | visual-dry-*.log | rc 0 ×6 (22 / 3 / 3 shots per user · LOCALE=en register 8) |
Not run (not in this card's gate list): qc-pos-p1.1 (CONTROLLER-RUN at merge per LANE-RULES), money set, real screenshots (QC5 = controller).

## Fix round 1 (R1 MERGEABLE + controller screenshots vis72 · rulings L1 L3 I7 V1–V4 + owner lines, 15 Oct)
| finding | commit | change |
|---|---|---|
| L1 raw prisma in a "use server" file | 8e7efb8d | new read-only reader `src/lib/modules/pos/tip-ledger.ts posTipLedgers` (same link query as `tipLedgerOk`); `tip-ledger-actions.ts` only checks session/permission and calls it |
| L3 REASON_REQUIRED mapping | d158d0fd | `BillsClient.tsx`: `REASON_REQUIRED` (server) and the client pre-check ⇒ `pos-bills-refund-reason-error` "พิมพ์เหตุผลการคืนเงินที่ช่องนี้ก่อนยืนยัน…" at the reason field (`bills.refund.tender.reasonRequired` th/en), reason text input opened |
| I7 unmarked hunk | e3550fed | `RegisterScreen.tsx` PayDone `duplicated=` line inside `// POS P2.9U ▸ … ◂` |
| V1 CHANGED → manual "ใส่ PIN" | 48f64a64 | `relookupRows` returns the kept rows; after `GIFT_CARD_CHANGED` the panel of the first kept row opens with the PIN target (focus on fine pointers) |
| V2 02 overflow at 1440×900 | 23aad710 | dialog height ≤ 840px (1440×900 = 840 ≈ mockup 830; 1024×768 unchanged 736) · left column md gap 14 / xl 18, pb 14 · amount header `pos-reg-paydlg-due-head` sticky md+ (40px / xl 52px) · tiles 60 / xl 70 (gap 10/12) · remaining row py 8 · `PayBenefits.tsx` points card py 10 gap 8, section gap 10 (md+ only; 390 keeps the sheet scroll) |
| V3 refund-to-card chip disabled | f380b93f | harness: the `sale-done-giftcard` card is not suspended in cleanup (stays ACTIVE, ฿175); refund-to-card fallback = newest gift-card bill of today whose card is ACTIVE; step fails if the chip is disabled; changed state waits for the auto-opened PIN panel |
| V4 "คงเหลือ" truncated at 390 | ee047ec7 | card/credit rows < md: balance text `order-last basis-full` second line under the row (remove button `ml-auto`) |
| owner lines (a)(b) | 4eb3de1d | `ledger/POS-OWNER-PENDING.md` §P2.9U + follow-ups above |
Each visual run now leaves: 4 card-sale bills (cards suspended) **except the sale-done-giftcard card kept ACTIVE with ฿175** (one per user run that includes sale-done-giftcard) · 1 PAID card+cash bill per user · the CHANGED card's legacy USE · QC member store credit ฿200 once per day · settings restored.
Not verified in a browser (no server in the builder lane): V2 fit at 1440/1024 and V4 at 390 — controller re-shoot: register `paydlg-storecredit,paydlg-tip,paydlg-giftcard-split,paydlg-giftcard-changed` · sales `refund-to-card` (after the register run).

### Gates — fix round 1
All logs headed `tree=/root/projects/shark-pos-b head=4eb3de1d dirty=0` in `scratchpad/p29u/runs/fix1/*.log` (code head f380b93f + ledger owner lines; upstream unchanged). Diff touches `src/lib/modules/pos/` only in `tip-ledger*.ts` ⇒ p2.9/p2.8 not re-run (per ruling).
| gate | result |
|---|---|
| typecheck | rc 0 |
| qc-pos-p1.18 (ST7 0) | 81/81 |
| qc-pos-p1.8 | 49/49 |
| qc-pos-p1.6 | 48/48 |
| qc-pos-p1.12 | 72/72 |
| qc-hf-pos-page-authz | 81/81 |
| fitness no-env / env | 50/50 · 50/50 |
| fitness-pos | 8/8 |
| visual-pos p2.9u --states --dry × 6 | rc 0 ×6 |

## Merge of P2.5 S (origin/session/pos 363bff1e · code 96cc5f4f) · 15 Oct
`git merge origin/session/pos` → **526413a5** · conflict only in `ledger/POS-OWNER-PENDING.md` (both kept: P2.5 fix2 line, then the P2.9U section) · `register-shared.ts` and `src/messages/{th,en}/pos.json` auto-merged (P2.5 split-part hunks and P2.9U hunks both present, order unchanged) · `visual-pos.mts` untouched by P2.5 · `pnpm exec prisma generate` once (P2.5 tables).
Server-file rule vs 363bff1e: `git diff 363bff1e -- src/lib/modules/pos/register.ts src/lib/modules/pos/service.ts src/lib/modules/pos/tender.ts src/lib/modules/pos/refund.ts src/lib/modules/giftcard src/lib/modules/member` = **empty**.

### Gates — merged head (one systemd-run unit via `scripts/iso.sh`, runner `scratchpad/p29u/gates-merge-inner.sh`)
All logs headed `tree=/root/projects/shark-pos-b head=526413a5 dirty=0` (same unit id) in `scratchpad/p29u/runs/merge/*.log`.
| gate | result |
|---|---|
| typecheck | rc 0 |
| qc-pos-p2.9 (unforced) | 62/62 |
| qc-pos-p2.5 | 49/49 |
| qc-pos-p1.3 | 128/128 |
| qc-pos-p1.8 | 49/49 |
| qc-pos-p1.12 | 72/72 |
| qc-pos-p1.16 | 28/28 |
| qc-pos-p1.10 | 40/40 |
| qc-pos-p1.18 (ST7 0) | 81/81 |
| qc-hf-pos-page-authz | 81/81 |
| qc-pos-p2.8 (ST6/L2 green) | 61/61 |
| fitness no-env / env | 50/50 · 50/50 |
| fitness-pos | 8/8 |
| visual-pos p2.9u --states --dry × 6 | rc 0 ×6 |

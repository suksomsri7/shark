# POS P1.6 U — builder U notes (pay screen · branch wip/pos-p1.6u · base origin/session/pos 17e8cf8f · tree /root/projects/shark-pos-b)

Started 2026-10-07 11:05 UTC (account B). Server side of P1.6 is accepted; this WO is UI only (R9 · mockups 02 / 02b / 05ข).

## Status
- [x] Pay dialog (mockup 02 / 05ข) · done screen (02b) · bill note dialog · line note · service-charge line · tip toggle (disabled, reason shown)
- [x] th + en keys · inventory rows · SaleDone.tsx deleted
- [ ] typecheck · qc-pos-p1.6 · p1.3/p1.4/p1.5/p1.9 forced · fitness both modes  ← next
- [ ] commit + push wip/pos-p1.6u

## What was built
- `src/components/pos/register/InterimPayDialog.tsx` → exports **`PayDialog`** (the whole mockup-02 modal). The file keeps its old name on purpose: `qc-pos-p1.3` S5.20 reads exactly this path (quotePending/quoteError guards). Renaming to `PayDialog.tsx` needs a path-only ORACLE-EDIT in S5.20 (see open questions).
  - Header: wallet icon · title · item-count chip · "Esc ปิด" · ✕ (mobile: back chevron at the left, same `pos-reg-paydlg-close`).
  - Left column: amount due (44/56 px) + breakdown from the quote (รวม · ส่วนลดรายการ · ส่วนลดท้ายบิล · ค่าบริการ · ทิป · VAT x% รวมในราคา) · bill note line · error / conflict / unknown cards (unchanged B2.x behaviour) · split list (rows with ✓, cash "รับมา/ทอน", reference, remove ✕) + "คงเหลือ" row (accent-soft) · 4 method tiles (CASH · PROMPTPAY · TRANSFER · CARD; 66/78 px, radius 16).
  - Right column (surface-2): PromptPay QR locked to *this round's* amount + manual confirm text · reference field for CARD/TRANSFER (≤100) · amount box (cash = received; others = amount, default = remaining exact) · change (cash) · numpad 7-8-9/4-5-6/1-2-3/00-0-⌫ (64 px, md+ only; mobile uses the device keyboard as in 05ข) · quick 100 / 500 / 1,000 / พอดี.
  - Footer: tip switch (disabled + `errors.tipNotAvailable` text while `tipEnabled` is false — always false until P1.6b) · ย้อนกลับ · primary "ยืนยันรับเงิน ฿X (F4)" or "แยกจ่าย {method} ฿X".
  - Money rules (pure `payRoundPlan` in the same file): Σ rows + this round = grand + tip exactly; every row ≥ 1 satang; ≤ 10 rows (9 split rows + final); one CASH row only (tendered/change on it; partial cash row = tendered = amount); non-cash ≤ remaining; 0-baht bill = `payMethods: []`. Due change (new quote / PRICE_CHANGED) clears split rows. Tip editable only while there are no split rows.
  - Keys: F4 inside the dialog = primary action; Enter submits the form (= primary); Esc closes (global handler, form phase only).
- `PayDone.tsx` (02b): ink circle ✓ · "ชำระแล้ว ฿X" · stats (เงินทอน · เลขใบเสร็จ · วิธีชำระ list) · "ขายต่อ (อัตโนมัติ N วินาที)" — auto-next after 5 s as in the mockup. Points / ABB / accounting status / reprint / LINE / receipt QR are later WOs (P1.10/P1.12/P1.13) — not shown.
- `SaleDone.tsx` deleted.
- `BillNoteDialog.tsx`: the cart "หมายเหตุ" button is live (was soon). Note ≤ 500 chars, stored in `RegisterCart.note`, sent with submit only (not part of the quote ⇒ no re-quote). Dot + bold border on the button when a note exists.
- `LineEditor.tsx`: "หมายเหตุรายการ" textarea (`pos-reg-line-note-<key>`), ≤ 500; `CartLine` shows the note under the name.
- `CartPanel.tsx`: "ค่าบริการ" row (`pos-reg-service-charge-line`, display) when the quote has `serviceChargeSatang > 0`.
- `register-shared.ts`: `RegisterCartLine.note?`, `RegisterCart.note?`; `cartToQuoteInput` sends a non-empty line note. (Held carts drop notes — server `registerCanonicalCart` does not keep them.)
- `RegisterScreen.tsx`: mounts PayDialog/PayDone/BillNoteDialog; `confirmPay` re-checks Σ = grand + tip, rows > 0, ≤ 10, cash received ≥ cash part, then `cartToSubmitInput(… payMethods, cashReceivedSatang, tipSatang, note …)`. Key lifecycle, single submit, beforeunload, sessionStorage pending, focus restore untouched.
- `register/page.tsx`: passes `tipEnabled={parsePosPaymentSettings(sys.settings).tip.enabled}`.
- `RegisterIcon.tsx`: wallet · back · bank · card.

## Keys added (pos.register.*, th + en)
totals.serviceCharge · totals.tip · pay.{escClose, back, splitTitle, remaining, methodsTitle, transfer, card, promptpayHint, transferHint, cardHint, cashUsed, amountCash, amountFor, reference, referenceHint, rowCash, rowRef, removeRow, addSplit, confirm, overRemaining, promptpayRound, numpad, backspace, tip, tipAmount, tipHint, billNote, breakdownVat} · done.{paid, receiptNo, paidBy, auto, nextShort} · editor.{note, notePlaceholder} · note.{title, placeholder, count, save, clear, tooLong, has}

## Inventory (scripts/pos-ui-inventory.json)
- `pos-reg-paydlg-method-cash` + `-promptpay` rows → one pattern row `pos-reg-paydlg-method-*`.
- New rows: paydlg-key-* · paydlg-reference · paydlg-add-split · paydlg-row-remove-* · paydlg-tip-toggle · paydlg-tip · paydlg-back · note-close · note-form · note-input · note-clear · note-save · line-note-*.
- `pos-reg-note` expect: toast(soon) → modal `pos-reg-note-dialog`. `paydlg-received` / `paydlg-confirm` notes updated.

## Commands + exit codes
| command | result |
|---|---|
| `env -u DATABASE_URL -u DIRECT_URL pnpm exec tsx scripts/fitness-pos.mts` | 8/8, exit 0 |
| `qc-pos-p1.4 --no-db` · `p1.5 --no-db` · `p1.9 --no-db` | 13/13 · 5/5 · 13/13, exit 0 |
| `qc-pos-p1.2 --no-db` | 10/12 (S1 S2 red = P1.2 U scope, expected) |

## Open questions
1. File name: keep `InterimPayDialog.tsx` (pinned by qc-pos-p1.3 S5.20) or approve a path-only ORACLE-EDIT so it can be `git mv`'d to `PayDialog.tsx`?
2. Done screen auto-advances after 5 s (mockup 02b). OK for cashiers who still need the change figure? (Enter / button also advance.)
3. Tip: switch is shown disabled with the P1.6b reason; the input path (tip > 0, Σpay = grand + tip) is built but untestable in UI until `TIP_POSTING_READY`.

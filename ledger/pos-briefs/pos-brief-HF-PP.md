# POS HF-PP — manager gate for PROMPTPAY "paid" without a payment intent (server side)

Origin: P2.4U R2 F8 (10 Oct 09:2xZ, reviewer; controller ruling = separate hotfix S card, before go-live). Severity **Low** today (needs a crafted client or the P1.6 path with intents on), money-relevant: a cashier-level actor can record a PROMPTPAY sale as paid while the shop setting says only a manager may confirm QR money.

## Facts
- Setting `manualConfirmRequiresManager` (`pos/payment-intent-shared.ts:30/58`) is enforced only in `confirmPaymentIntentManual` (`pos/payment-intent.ts:423`: no `pos.shift.manage` ⇒ `PERMISSION_DENIED`).
- `submitRegisterSale` (`pos/register.ts` ≈2334–2345): a PROMPTPAY/CARD pay method **without** a `pi_` reference takes the P1.6 path (`regCreate` / `regSubmitTable`) with no setting check at all. The P2.4U table preset ("โต๊ะแจ้งจ่ายพร้อมเพย์แล้ว") and any register client that omits the intent reference therefore bypass the gate. UI-side both pages disable the button (P2.4U `TableCheckout.tsx` `presetManagerOnly`, register `PayIntentPanel.tsx` `manualAllowed`), server does not.

## Scope (IN)
1. In `submitRegisterSale`, after the pay-method parse: if intent settings `manualConfirmRequiresManager` is true **and** any pay method is `PROMPTPAY` **or** `CARD` **without** an intent reference (`isPaymentIntentId` false), require `pos.shift.manage@unit` on the actor; otherwise refuse `PERMISSION_DENIED` with the same Thai message as `payment-intent.ts:423` ("ร้านตั้งให้ผู้จัดการเป็นผู้ยืนยันเงินเข้าเท่านั้น") before any write. Applies to both `regCreate` and `regSubmitTable` paths (one check above the branch). Setting read through the same reader as `createPaymentIntent` (`readIntentSettings`/`scopeOf` equivalent) — no new reader.
2. Token sales (P1.15 `actor` replaced by the token holder) use the token holder's rights, same as today.
3. Messages: existing key, no new th/en key unless the register surfaces the refusal differently (then `register.refusal.manualConfirmManager` th+en).
4. Oracle: `qc-pos-p1.7` +1 check **R4b** (count 32 → 33): setting on · cashier (no `pos.shift.manage`) · PROMPTPAY without `pi_` ⇒ `PERMISSION_DENIED`, 0 PosSale/PosPayment rows; owner ⇒ ok; setting off ⇒ cashier ok (positive control); CASH unaffected; `qc-pos-p2.4` +1 (table preset path, 49 → 50) same matrix via `regSubmitTable`. Red-before saved to `ledger/wo-notes/HF-PP-red.txt`.

## OUT
No change to the intent flow, Beam, static QR, receipts, `createSale` input/contract sha, schema. P1.6 cash path untouched.

## Gates
typecheck · fitness ±env · fitness-pos · qc-pos-p1.7 (33) · qc-pos-p2.4 (50) · qc-pos-p1.6 · qc-pos-p1.3 · qc-pos-p1.15 (token actor) · qc-pos-p1.12 · qc-pos-p1.1 · qc-hf-pos-page-authz · reviewer (read-only) · money-lane hunter not needed (one guard, no money math) — controller decides at merge.

## §9 Controller rulings (account A, 10 Oct 09:3xZ)
1. Sequence: after HF-TX merges (same files `register.ts`); single lane, one builder, reviewer on the card. Base = `session/pos` at launch (fill `__BASE__`).
2. Refusal shape `{ok:false, code:"PERMISSION_DENIED", message}` — the register and table checkout already render it (P2.4U F4 shows the UI gate first; the server refusal is the backstop).
3. CARD without an intent reference is included (manual card entry has the same trust problem); if the owner objects, flip CARD off in one place (`manualMethods` set) — note in `POS-OWNER-PENDING.md` (P1.7 owner line).

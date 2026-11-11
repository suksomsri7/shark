# POS HF-PP2 — manager gate for manual PROMPTPAY/CARD in `orders.payOrder` (server backstop)

Origin: P2.8U R1 F1 (10 Oct 12:1xZ). HF-PP (merged ca5a07b4) gated `submitRegisterSale` only; `pos/order.ts payOrder` (≈1065–1148) calls `createSale` directly with the pay method from the 09 pay dialog, so with `manualConfirmRequiresManager` on a STAFF can mark a DIRECT/CHAT order PAID via static PromptPay or EDC card without a manager. P2.8U fix round 1 adds the UI gate; this card adds the server backstop.

## Scope (IN)
1. In `payOrder`, after permission/scope and before any write: if the unit's intent settings `manualConfirmRequiresManager` is true and the pay method is `PROMPTPAY` or `CARD` without a valid `pi_` intent reference ⇒ require `pos.shift.manage@unit` on the actor, else `{ok:false, code:"PERMISSION_DENIED", message: REGISTER_MANUAL_MANAGER_MESSAGE}` (import the shared constant from `register-shared.ts`; same reader `parsePosIntentSettings` as HF-PP). Mark `// POS HF-PP2 ▸ … ◂`. No change to the order state machine, WEB/PLATFORM paths (they never pass a manual method — confirm and cite), receipts, `createSale` input/contract sha, schema.
2. Oracle `qc-pos-p2.8` +1 (**P10**, 60 → 61): setting on · STAFF (pos.sale.create + pos.order.accept, no shift.manage) pays an ACCEPTED DIRECT order PROMPTPAY without intent ⇒ PERMISSION_DENIED, 0 PosSale/PosPayment rows, order still ACCEPTED/unpaid, no PosOrderEvent; CARD same; owner ⇒ PAID; STAFF CASH ⇒ PAID; setting off ⇒ STAFF PROMPTPAY PAID. Red-before saved `ledger/wo-notes/HF-PP2-red.txt`.
3. Owner line (P1.7/P2.8 owner): REST/API-key order pay paths (if any) are listed with their gate status.

## OUT
No UI (P2.8U fix1 owns it). No change to `submitRegisterSale`.

## Gates
typecheck · fitness ±env · fitness-pos · `qc-pos-p2.8` (61 ×2) · `qc-pos-p1.7` · `qc-hf-tx` · `qc-pos-p1.3` · `qc-pos-p1.1` · `qc-pos-p2.4` · reviewer (read-only, ≤ 30 lines).

## §9 Controller rulings (account A, 10 Oct 12:2xZ)
1. Lane opens on a free builder tree after P2.8U merges (P2.6 S holds tree c and edits `order.ts` — HF-PP2 must be small and marked so the P2.6 S upstream merge is trivial; if P2.6 S is still open when HF-PP2 merges, the P2.6 builder merges upstream and keeps both hunks).
2. Same refusal shape/message as HF-PP; CARD included (owner may flip via the shared `REG_MANUAL_METHODS`).

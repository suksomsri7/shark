# P1.15 builder S — fix round 1 (reviewer verdict MERGEABLE-AFTER-FIXES on 1386a2f9). Controller rulings are binding.

Tree `/root/projects/shark-pos-b`, branch `wip/pos-p1.15`. Same rules as the S prompt (QC4 only, POS gate lock, no build/server/.env/Telegram, `git -C`/absolute paths, never touch other trees).

## Fixes
- **F1 (High, must):** approved discount must bind to the cart and the amount. Store in `PosApprovalPayload` snapshot a canonical cart hash (sha256 of sorted lines `productId|variantId|qty|unitPriceSatang` + discountBp + subtotalSatang) and `discountSatang`. In `regDiscountOver` ①: require the submitted cart hash to equal the snapshot hash AND the quote's `discountSatang ≤ snap.discountSatang`; require the held cart to belong to this unit, status not DISCARDED, and `heldByUserId` = token user (or a user with `pos.sale.manage`). Any mismatch ⇒ `APPROVAL_MISMATCH` (th/en message key).
- **F2 (High, must):** `managerPin` without `managerUserId` ⇒ `VALIDATION` in void/refund/submit actions and in `verifyManagerPin` (no "match every row" branch for manager PINs). Every miss counts on that user's row.
- **F3 (must, cheap part):** in the no-`userId` `verifyStaffPin` branch, a match on a locked row returns `PIN_INVALID` (never `PIN_LOCKED`). Per-device throttle and the `PIN_TAKEN` probe stay follow-ups (list them under P1.18 close items in the notes).
- **F5 (must):** auto-hold for an over-cap discount is idempotent on the submit `idempotencyKey`: store it in the snapshot; a retry with the same key returns the same `PENDING_APPROVAL` refusal (same requestId/heldCartId) and creates nothing.
- **F6 (must):** use async `crypto.scrypt` (promisified) everywhere; no `scryptSync` on request paths.
- **F8 (must):** manager-PIN discount override without `heldCartId` also writes `pos.approval.pin_override` (same shape as void/refund).
- **F9:** fix the `shift.ts` header comment.
- **F7:** follow-up only (note it).
- **Audit leak (Low from "Verified OK"):** make sure no `console.error` prints arguments containing `pinHash`/`salt`; log `e.name` + code only.
- **ORACLE-EDITs (approved, each in its own commit titled `test(pos …): ORACLE-EDIT …`):**
  1. `scripts/qc-pos-p1.15.mts`: add AP-F1 (same percentage, bigger cart with the approved `heldCartId` ⇒ `APPROVAL_MISMATCH`; the approved cart itself passes) and PN-F2 (`managerPin` without `managerUserId` ⇒ `VALIDATION`; 5 wrong manager PINs with id ⇒ `PIN_LOCKED`). Update the oracle notes count 34→36.
  2. `scripts/qc-pos-p1.9.mts` ST8: drop only the "no model PosStaffPin" condition (P1.15 R1 supersedes); keep "PosShift has no pin column" and "shift.ts does not read pinCode/hrEmployee". Update its description text.

## Gates before "done"
typecheck 0 · `qc-pos-p1.15` forced ×2 + unforced (36/36, residue 0) · `qc-pos-p1.9` 53/53 · `qc-pos-p1.3/p1.5/p1.6/p1.8/p1.10/p1.16/p1.17` · the three approval suites · `qc-hf-pos-page-authz` · `pnpm fitness` with/without env · `fitness-pos.mts`. Append a "Fix round 1" section to `ledger/wo-notes/pos-P1.15.md` with exit codes and the P1.15U follow-ups (F4 staffToken on void/refund; 13B sends ids; recall quotes approved cap; discard held cart on reject). Commit per fix, push `wip/pos-p1.15`, report ≤20 lines with head SHA. Do not merge.

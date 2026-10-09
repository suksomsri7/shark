# P1.7 builder S — fix round 1 (reviewer verdict MERGEABLE-AFTER-FIXES on 0fc35040). Controller rulings are binding.

Tree `/root/projects/shark-pos-d`, branch `wip/pos-p1.7`. Same rules as the S prompt (QC4 only, POS gate lock, no build/server/.env/Telegram, `git -C`/absolute paths, never touch other trees).

## Fixes
- **F1 (money, must):** (a) `regParseSubmit`: a reference matching `^pi_` on any pay type other than PROMPTPAY/CARD ⇒ `VALIDATION`. (b) The "already consumed in this tx?" decision at `register.ts` ~1711 must not be a row count over all payment types — decide from the sale itself (the sale is new in this tx ⇒ consume; an existing sale returned by the idempotency replay ⇒ skip) or restrict the count to `type in (PROMPTPAY, CARD)`; prefer the former. (c) **ORACLE-EDIT (approved):** add one check to `scripts/qc-pos-p1.7.mts` in a separate commit titled `test(pos P1.7): ORACLE-EDIT C31 — pi_ on TRANSFER refused + intent consumed exactly once` — submit with `[{TRANSFER,100,ref:"pi_X"},{PROMPTPAY,A,ref:"pi_X"}]` ⇒ VALIDATION and pi_X still PAID with no saleId; then a correct submit consumes it; a second bill with pi_X ⇒ `INTENT_CONSUMED`. Update the oracle notes count 30→31.
- **F2 (delivery, must):** `route.ts` `pos-` branch: outcome `INTERNAL` ⇒ HTTP 503 (Beam redelivers; handling is idempotent). Business refusals (AMOUNT_MISMATCH, cancelled/expired, unknown reference) stay 200. Signature failure stays as before (401).
- **F3 (ruling):** manual confirm refuses `CARD_BEAM` intents (`MANUAL_NOT_ALLOWED`, th/en message); for `PROMPTPAY_BEAM` require `pos.shift.manage` in addition to the existing permission; STATIC unchanged. Audit unchanged.
- **F4:** add a note to the `qc-pos-p1.6` U4 caller registry comment (or wherever the 18 sites are listed) that `regCreateSale` has two modes (own tx / caller tx) with the after-commit stock cut + `scheduleDrain` duplicated at the caller.
- **F5:** no code change; keep the "untested against real Beam" markers in the notes.

## Gates before "done"
typecheck 0 · `qc-pos-p1.7` forced ×2 + unforced (31/31, residue 0) · `qc-pos-p1.6` (U4 18/15) · `qc-pos-p1.3` · `qc-pos-p1.8` · `qc-pos-p1.10` · `qc-pos-account` · `qc-hf-pos-page-authz` · `pnpm fitness` with/without env · `fitness-pos.mts`. Append a "Fix round 1" section to `ledger/wo-notes/pos-P1.7.md` with exit codes. Commit per fix, push `wip/pos-p1.7`, report ≤20 lines with head SHA. Do not merge.

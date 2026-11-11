# P1.11 S — fix round 1 (controller rulings on the reviewer's findings; head reviewed 8a0aa5c5 + cherry-picked ORACLE-EDIT 9dc16522)

Reviewer verdict: MERGEABLE-AFTER-FIXES. Work on `wip/pos-p1.11` in `/root/projects/shark-pos-c` **after** the controller's gates26 run finishes (`/root/pos-runs/gates26-p111-*/SUMMARY.txt` shows `DONE`; never edit while a suite runs in the tree). Rules unchanged (CD5 server-only scope now includes these fixes; no UI; explicit-path commits; QC4 commands with `env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock` after `qc4.sh`).

| # | Ruling | What to do |
|---|--------|------------|
| F1 | done by controller | 9dc16522 is now on the branch (cherry-pick). Expect `qc-pos-p1.11` 38/38 and `qc-pos-p1.10` 40/40 — verify after your fixes. |
| F2 | ▶ fix (option b) | `reviewStateForRef` / `publicReceipt`: a REQUESTED row whose `requestSentAt` is older than the member module's link validity (30 d) is **not reviewable** → `actions.review = false`; `submitReceiptReview` on such a row ⇒ `REVIEW_EXPIRED` (new refusal code + th/en message). Do not touch the journey hash. |
| F3 | ▶ fix | `PublicReceipt` gets `serviceChargeSatang` and `tipSatang` from `payload.totals` (0 when absent) so Σlines − discount + serviceCharge = grandTotal and Σpayments = grandTotal + tip. Add them to the names table in your notes. |
| F4 | ▶ accept, make explicit | Keep the dynamic import of `@/lib/pos-receipt-bridges` in `receipt-send.ts` as the only such link; add a one-line comment `// POS P1.11 ▸ composition-root link (controller-accepted F4)` and list it in the notes' drift section. No oracle change. |
| F5 | ▶ fix | In `pos-receipt-bridges.ts`, wrap `createCardFromExternal`: a board without an active column (or any `createCardFromExternal` throw) ⇒ `{ posted:false, reason:"no-board" }`, LINE ack still sent, no retry storm. |
| F6a | ▶ fix | Count the 5/24 h sends under the sale row's `FOR UPDATE` lock (same pattern as issues) and count only successful sends (audit rows). |
| F6b | ▶ fix | When `input.email` is given (typed by the cashier), render the email HTML without the member block. |
| FU | note only | per-IP guard on public reads, `CONCURRENTLY` index for prod, U-half dispatcher/noindex/404, rating as number, ST6 deferral removal at U — write them in the notes' follow-ups. |

Then: typecheck, `qc-pos-p1.11` forced ×2 + unforced, `qc-pos-p1.10`, `qc-pos-p1.16`, `qc-pos-p1.8`, `fitness` ×2, `fitness-pos`; update `ledger/wo-notes/pos-P1.11.md` (gates table + contract additions); push; report ≤20 lines with the head SHA.

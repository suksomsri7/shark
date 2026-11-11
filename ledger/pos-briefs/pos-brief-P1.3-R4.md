# P1.3 round R4 — fixes from the code hunter (controller rulings · cloud run · 3 Oct 2026)

Source: `pos-brief-P1.3-HUNT-CODE.md` report on 5f97add4 (CRITICAL 0 · MAJOR 2 · MINOR 4 · not ship-blocking with flag off; must be fixed before any tenant turns `registerV2` on ⇒ fixed now). Tree `/home/user/shark-p13`, branch `wip/pos-p1.3`. No DB in the cloud: DB checks are written blind and run by the controller via `scripts/pos-vps-run-p1.3.sh` on the VPS.

## Rulings
- **K1 (MAJOR-1 key squatting)**: register idempotency keys live in their own namespace — the server stores/looks up `reg2:` + client key (client key: 8–100 chars `[A-Za-z0-9_-]`, UI sends a UUID). A register submit can therefore never find or occupy `hotel-sale-…`, `rental-…`, `booking-deposit-…` or any other module's key. Legacy `actions/pos.ts` is NOT touched in P1.3 (same hole exists on prod today → owner item O23, separate hotfix).
- **K2 (m1 cross-branch leak)**: `IDEMPOTENCY_CONFLICT` carries `saleId/receiptNo/saleStatus` only when the found sale is `sourceModule POS` AND same `unitId` as the request AND visible to the actor; otherwise a bare conflict.
- **K3 (MAJOR-2 double sale)**: the client keeps the bill's key until `resetBill` (new sale / clear bill / hold later). Any refusal (PRICE_CHANGED, PRODUCT_UNAVAILABLE, MEMBER_RIGHTS_UNSUPPORTED, …) keeps the key; resubmitting the changed payload with the same key either succeeds once or returns `IDEMPOTENCY_CONFLICT` (already handled by the dialog). Server: same key + different payload while the first attempt is uncommitted must end with exactly one sale (P2002 path) — prove with the blocked-counter recipe.
- **K4 (m3)**: replay path validates `cashReceivedSatang ≥ cash portion` exactly like the first submit (or clamps change to ≥0 and refuses invalid input before lookup — prefer refusing: same validation order for first submit and replay).
- **K5 (m4)**: pending request (key + payload + phase) persisted in `sessionStorage` per POS system + unit until resolved; on reload/Back the screen restores the "unknown" card and retries with the SAME key. Wrap storage in try/catch (private mode).
- **m2 (`pos.*` grants `pos.sale.priceOverride`)**: keep the S3.47 ruling (wildcard = all `pos.*` keys); add a line to the deploy checklist (`ledger/POS-DEPLOY-REQUEST…`/runbook) that STAFF with `pos.*` gain open-price at the moment V2 is enabled. No code change.
- NOTEs (member probing, `_maxDiscountBp` not owner-settable, VAT display vs stored 0, ½-satang allowance): recorded; no change in P1.3 (`_maxDiscountBp` → P1.15).

## Order
1. Oracle writer (this round): add checks to `scripts/qc-pos-p1.3.mts` for K1–K5 from the hunter's DB probe recipes 1–3 and 5 (probe 4 = existing S3.47 behaviour, add an assertion documenting it), plus statics where possible (K3 key only rotated in resetBill; K5 sessionStorage restore). Mark ORACLE-WRITE; cannot run here — `--list` only; typecheck must pass. Fixtures must clean up (residue S9).
2. Builder fixes K1–K5 (typecheck + fitness no-env; statics run via a standalone copy as in B2.x).
3. Controller: VPS run (full, not ONLY_VISUAL) → reviewer on the R4 diff → accept.

# H4.6 — builder notes (wip/hr-h4.6 · lane l2 · base d11ba25a2)

## Rulings applied
- Q8 → OPTION 2 (controller 12 Nov): no ALLOWANCE refund row, no new kind, frozen files untouched.
  (a) APPROVED, unbound → guarded `updateMany` APPROVED→REJECTED under the period lock (`hr:payroll:run:<sys>:<period>`) → charge `withdrawOutcome` CANCELLED (status CANCELLED).
  (b) APPROVED, bound to a DRAFT run → charge marked CANCELLING in tx 1, then the existing `cancelAdjustment` (→ `cancelBoundDraftAdjustment`, draft recomputed), then tx 2 → CANCELLED (run approved meanwhile ⇒ REFUND_OWED; failure ⇒ stays CANCELLING, a retry resumes).
  (c) APPROVED, bound to an APPROVED/PAID (or REVERSED) run → payroll untouched; `refundOwedSatang` = charged amount, `withdrawnById/At` + `refundReason`; `markStockRefundRepaid` (OWNER or approve ∧ payroll viewer, ref 1–80, idempotent) sets `repaidAt/ById/Ref`.
- Q5 consent at request · Q7 ENDED/inactive refused · Q10 flags only (`overCap` 10 % in the DTO; period 1/5 via `stockPeriodCapFlags`, Σ DEDUCTION+ADVANCE PENDING/APPROVED ×5 > MONTHLY base) · Q13 REMOVED derived when the adjustment row is gone.

## ORACLE-EDITs
- qc-hr-h4.6: S1.3 field `refundAdjustmentId`→`refundOwedSatang` · LIST_KEYS `refundAdjustmentId`→`refund` · S6.2/S6.3/S6.6 rewritten to cases (a)/(b)/(c) (titles changed in the registry).
- qc-hr-h1.3 S6.1: `hr/stock-charge.ts` exempt for the token `sourceRef` only.

## Atomicity with inventory
Stock first via `consumeBatch` (key `hr-stock:<hrSys>:<requestKey>`, inventory returns the same movement on retry) → one HR tx under `hr:stock:<sys>:<requestKey>` (adjustment + charge + outbox). Same key + same input ⇒ replayed; other input ⇒ replayDiff before touching stock. Crash between ⇒ retry with the key completes the HR side (S4.4).
Orphan visibility: NOT built — HR may not read inventory tables and the facade has no movement reader (= D7); a "needs attention" list needs a facade reader → debt D1/D7.

## Debts
- D-H46-refund-kind: when H3.4 opens the payroll engine, add a non-taxable, non-SSO reversal kind so case (c) can flow through payroll.
- D1 orphan-movement sweeper + visible list (needs inventory facade movement reader, D7).
- (closed) requesters without `hr.payroll.read`: "คำขอของฉัน" list (`myFiledStockCharges` — own filed, PENDING, no amounts) + withdraw button.
- DEBT: any tenant-wipe path must delete HrStockCharge before employees. Tenant-deletion order: `HrStockCharge` FK RESTRICT on HrEmployee — any tenant-wipe path deleting employees must delete HrStockCharge first (script HR_DELETE_ORDER lists not updated; seed tenants create none).

## Accountant
A1–A7 (brief §9) · A8: refund of an amount already deducted from wages in an approved/paid run, repaid outside payroll — confirm it is not income for WHT (ภ.ง.ด.1) / SSO wage, and the GL side (credit cash vs the H3.7 recovery account).

## Runs (head after 9956fa536) — see hr-H4.6-green.txt
qc-hr-h4.6 forced ×2 56/56 + unforced 56/56 (residue none) · seed-hr-qc ×2 33/33 identical counts · h1.3 63/63 · h0.1 67/67 (after ORACLE-EDIT S4.2) · h0.2 58/58 · h0.6 55/55 ·
payadjust 27/27 · payroll 19/19 · payroll-reverse 14/14 · bulk-ops 13/13 · hf-hr-privacy 192/194 · inventory 12/12 · inventory-item 11/11 · hf-inventory-atomic 143/143 · pos-p2.3 refuses lane DB.

## ORACLE-EDIT requested (not applied)
qc-hf-hr-privacy S-20 (no file but payroll.ts writes HrPayAdjustment) and F1-10 (cancelAdjustment called only from cancelAdjustmentAction) —
both hit hr/stock-charge.ts by design (brief R6/R7 + Q8 ruling (b)). Proposed: exempt `src/lib/modules/hr/stock-charge.ts` from adjWriters, and allow its one
`cancelAdjustment(ctx, adjustmentId, { userId: uid, isOwner })` call (uid = session viewer, after isPayApprover + self gates).
qc-hr-h0.1 S4.2 SCHEMA_SHA 686b1910df915a45f292cdf5d178e0446288736da55577d415748d902d875397 → c9fb1ab3a330eb6d93ed0227f903bea17fd7d4fc9403753b708bc6757cea9389 (payroll.prisma diff vs base: 0 removed lines).

## Round 2 (controller ruling on S-20/F1-10 — no exemption)
payroll.ts gains one marked `HR H4.6` pure-addition block (+ 1 marked type-import line): `writeStockChargeAdjustmentInTx` · `cancelStockChargeAdjustmentInTx` ·
`cancelStockChargeDraftAdjustment` (delegates to the existing `cancelBoundDraftAdjustment`). stock-charge.ts no longer creates/updates HrPayAdjustment and no longer
calls `cancelAdjustment`. The source pair is passed as one object (`StockAdjustmentSource`) and spread by payroll.ts, so payroll.ts adds no `sourceRef` token
(qc-hr-h1.3 S6.1 ratchet unchanged). ORACLE-EDIT qc-hr-h4.6 S14.1: payroll.ts ⇒ only marked HR H4.6 pure-addition hunks.

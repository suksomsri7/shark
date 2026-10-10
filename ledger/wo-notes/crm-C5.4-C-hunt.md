# C5.4-C MONEY HUNT — 28 Sep 2026 (read-only · QC2 throwaway tenants qc-hunt54c-* · CLEAN 0 rows ×2)
Probes: `scripts/pending/hunt-54c/probe-hunt.mts` (H1–H4, R1–R3) · `probe-race.mts` (R4). Logs /tmp/hunt54c/p1.log, p2.log. All paths are REAL account functions + real bridge handlers.

## Findings
**F1 HIGH · CONFIRMED · customer asked for / pays the wrong amount.** The only credit notes that reduce what the customer owes are those whose `sourceDocId` is the invoice itself. That rule is used in `recordPayment` F-05 (service.ts:2580), `liveCreditTotalInTx` (:2487), `creditNoteTotalOf` → `paymentOutstandingOf` (:2996, used by the portal, payment requests ×4 and the payment panel ×3), `listPortalDocs` and `rederiveInvoiceStatusInTx` (it returns without doing anything when the source is not an INVOICE). But the UI lets a CN point at INVOICE, RECEIPT or TAX_INVOICE (`doc-editor-config.ts:135`), and a Thai credit note legally refers to the tax invoice.
H1: IV 107,000 unpaid → TI issued → CN 10,700 on the TI (ok). IV outstanding stays **107,000**. `recordPayment` 107,000 is accepted → IV PAID. Credited plus paid = 117,700 against a 107,000 sale, so the customer overpays 10,700. CRM shows won 9,000,000 but commission 1,000,000 (10% of 10,000,000).
Fix: one "invoice-family credit" helper, `sourceDocId = IV OR sourceDocId IN (docs whose sourceDocId = IV)` (the same subquery `docWonBasis` already uses). Use it in all the places above. When the CN's source is a TI or RECEIPT, lock and rederive the parent IV.

**F2 HIGH · CONFIRMED · a refund never reaches CRM paid, quota or commission.** A CN on a PAID invoice is refused (H2b: "คงเหลือ ฿0.00", creditAvailable :1723). So the real way to refund after full payment is a CN on the RECEIPT or TI. `reconcileCredit(receipt|TI)` caps at the money counted *from that doc*, which is 0 (payments live on the IV), so no CREDIT_NOTE row is ever created.
- H2: after a full refund of 107,000 via a CN on the RECEIPT → paid 10,700,000 · **won 0** · commission 1,000,000 · quota PAID 10,700,000, all unchanged.
- H2c: partial refund of 53,500 via a CN on the TI → won 5,000,000 · paid 10,700,000 · comm 1,000,000.
- The CREDIT_NOTE row, clawback, DEDUCTION and COMMISSION-restore machinery is only reachable from a DB-inserted CN on a paid invoice. That is what probe-cn B did (`P.accountDocument.create status ISSUED`). Real account functions cannot produce that state.

Fix: in `onCreditNoteChanged`, map the source to its money doc (RECEIPT/TI whose `sourceDocId` is an INVOICE → the IV). Run `reconcileCredit` and `reconcileDocSettle` on the IV using the family credit from F1. The refund becomes clamp(tieOff + family CN − grand, 0, CN), which gives −10,700,000 → paid 0 and a clawback of 1,000,000 in H2.

**F3 MED · CONFIRMED 3/3 · deadlock added by batch C.** `voidDocument(CN1)` ∥ `issueDocument(CN2)` on the same IV → **40P01 deadlock detected** (R4.0–2, ~1.25 s). The CN void is the victim and the user sees "ยกเลิกเอกสารไม่สำเร็จ"; state stays consistent (IV PARTIAL = expected).
Cause: voidDocument takes the CN lock, then `reverseFor` takes GL rows, then `rederiveInvoiceStatusInTx` locks the source (:3233). issueDocument takes the CN2 lock, then the source (:2164), then the GL in `postDocument`.
- voidPayment ∥ void CN did not deadlock (R4.3–5, 0/3).
- recordPayment ∥ void CN is PLAUSIBLE (same invoice→GL order as issue).

Fix: in voidDocument, for a CN with `sourceDocId`, `lockDocumentRow(source)` right after the CN lock and before `reverseFor`.

**F4 MED · CONFIRMED · over-credit (existing cap, same root as F1).** IV 107,000 unpaid: CN 107,000 on the IV **and** CN 107,000 on its TI are both accepted, so **214,000 is credited on a 107,000 sale**. The cap in `creditAvailable` is per `sourceDocId`. Fix: cap on the invoice family under the IV lock (F1 helper).

**F5 LOW · PLAUSIBLE (not run).** REST `createDocument` accepts any `sourceDocId` for a CN (documents-write.ts:233, no type check), so a CN on a DEPOSIT_RECEIPT works. On a partly paid deposit plus a CN for the rest:
- The account side never sees it as fully paid (recordPayment excludes CN for deposits; rederive only handles INVOICE), so the deposit stays PARTIAL, is never posted and never reaches AWAITING_DEDUCT.
- CRM `paidInFull` counts the CN, so it treats the same deposit as fully paid.

Fix: `issueDocument` rejects a CN whose source is not INVOICE, RECEIPT or TAX_INVOICE.

## What held (CONFIRMED on QC2 unless noted)
- `account.invoice.paid` is emitted once per document (idempotency key). It is not emitted on a zero-cash CN.
- H4 (WHT): cash 51,000 + WHT 1,500 → PARTIAL; then CN → PAID with 1 event; CRM PAYMENT 5,100,000 + DOC_SETTLE 150,000; won 4,906,542; comm 490,654 (exact). Void CN → PARTIAL, settle reversed, comm 476,635. Re-issue CN → back to the same numbers, still 1 event.
- Races on the same IV, 3 rounds each:
  - 2 CNs for the same remainder → exactly one accepted.
  - pay ∥ CN ∥ CN → paid + CN = grand exactly, 1 event.
  - voidPayment ∥ voidDoc(CN) → status matches `receivableStatusOf`.
  - No negative outstanding and no duplicate CN rows.
- m3: capping at 2³¹−1 gives the same decision because policy thresholds are Int (read, not run). The audit keeps the real `discountSatang`. Commission approval uses `abs`. Clawback rows are born APPROVED.
- Backfill (read, not run with --apply): dry-run by default; per-row `FOR UPDATE` plus recheck; `updateMany` guarded on status=PARTIAL; no outbox events; idempotent; only touches INVOICE PARTIAL with paid>0 and paid+CN≥grand, so it is safe to --apply. Nits:
  - `::int` on the CN sum overflows above ฿21.47M → the script crashes (no damage).
  - It ignores family CNs, so it needs a re-run after the F1 fix.
- Surfaces that agree: home weighted (per-deal round), leaderboard, quotas and reports won via `COALESCE(wonValueSatang, valueSatang)`. The reps `cm` total (APPROVED+PAID+REVERSED) equals `commissions.report` netSatang (commissions.ts:1950). netOfPayments rounds once per ratio.

## Re-check after builder R4 (28 Sep · QC2 · probes probe-hunt / probe-race / probe-family · logs /tmp/hunt54c/r2-*.log · CLEAN ×3)
F1–F5 HOLD: H1 outstanding 96,300 + pay 107,000 REFUSED · H2 refund via RC → paid 0 / won 0 / comm 0 (CREDIT_NOTE −10,700,000) · H2c 5,350,000/5,000,000/500,000 · H3 2nd CN REFUSED · H4 unchanged exact · R1–R3 exact · R4 0 deadlocks (6/6) · N1 Q→IV→RC→TI CN on TI ok, over-cap on RC/IV refused, CN on Q refused · N2b deposit-deducting IV → TI → refund CN 85,600: paid 2,140,000 · won 2,000,000 · comm 200,000 ✓.
**G1 MED CONFIRMED — CN on the TAX_INVOICE of a DEPOSIT_RECEIPT escapes every family.** `invoiceOfDocInTx` stops at DEPOSIT_RECEIPT (null) ⇒ own cap only; F5 allows it (TAX_INVOICE). N2a: dep 21,400 paid → dep-TI → CN 21,400 ok → deposit stays AWAITING_DEDUCT 21,400 · final IV deducts 21,400, outstanding 85,600, paid ⇒ cash 107,000 vs GL AR −21,400 (owed back). CRM: won 8,000,000 while anchored on Q, then **10,000,000** once IV anchored (IV family excludes dep-TI) · paid 10,700,000 · comm 1,000,000 — CN ignored. Fix (min): refuse a CN whose source is not in an invoice family (invoiceOfDocInTx null for TI/RECEIPT with a source), or make the deposit a family root (depositAvailable − family CN · CRM money doc = deposit).
**G2 LOW CONFIRMED — CN on a VOIDED source accepted** (N3: void RC, new CN 107,000 on the voided RC ok → CRM refund −10,700,000, AR −107,000). Fix: issueDocument(CN) requires source status ∉ DRAFT/VOIDED/CANCELLED.
**G3 LOW CONFIRMED (pre-existing) — voiding an invoice that carries a live CN** (N4: IV unpaid + CN 107,000 → void IV ok, CN stays live, AR −107,000 phantom). Fix: voidDocument refuses while a live CN exists in the family.
Held: void RC carrying a CN keeps family/CRM consistent (CN still counted; void CN restores paid 10,700,000/won 10,000,000/comm 1,000,000).

# P3.6 S — R1 + hunter (account B · 21 Oct 2026 16:4xZ · head b6e9838c · base b92d5598)

MERGEABLE-AFTER-FIXES — P3.6 S @ b6e9838c (base b92d5598) · R1 + hunter · read-only · 2 pure probes (credit-shared goldens · exposure combine logic) · must fix F1 (High) · F2 fix or rule · rest Low/follow-up

## R1 (reviewer)
**Findings**
- **F1 High (credit limit bypass · wrong AR contact)** — `account/service.ts:7412/7422` `posCreditOpenDocs` counts a doc as open only if its contact has `partyId = customerPartyId`, but the INVOICE contact comes from `findOrCreateCustomerContact` (`account/index.ts:1607`): partyId first, else **buyer taxId+branch** (`service.ts:4513`), which returns an existing contact without re-pointing its partyId (backfill only when null, by taxId → may be another Party). Input: book has contact C_old (taxId T, partyId P_old ≠ CRM company P1, or P1's Party has no taxId) → every P1 credit INVOICE goes to C_old → bill is in `docRefIds` (not lag) and not `open` ⇒ counts 0. Probe: 2 drained bills ฿11,000, limit ฿10,000 → exposure 0, next ฿9,000 passes. Aging row (`:7445`) is 0 and contact term (`:7391`) is ignored too. Same hole when the cashier types another company's taxId as buyer (requireBuyer does not tie taxId to the company: AR lands on that company). There is also a short window: the first drain commits the contact between the contacts read and the docs read (separate statements, though the comment says "one statement"). Smallest fix: in `posCreditOpenDocs`, a row matched by `refType PosSale ∧ refId ∈ saleRefIds` is open whatever its contact (`isOpen = statusOpen && (contacts.includes(c) || refMatched)`). Optional: make `posCreditContact` resolve the contact by partyId only (`ensureAccountContact`).
- **F2 Medium (ruling 4/W16)** — the early return at `account/index.ts:294` skips the P1.13 TAX_INVOICE layer for every credit bill, and the later `supersedeAbbWithTaxInvoice` answers NO_ABB. So the company buyer (always present, requireBuyer=true) never gets a tax invoice in the book, although VAT is booked at sale. On top of that, `pos/account-bridge.ts:188–195` logs WARN `pos.taxInvoice` "สมุดออกไม่ได้" on **every** credit bill. Fix: flag the credit doc so the WARN is skipped, and get a controller/W16 ruling: INVOICE as "ใบแจ้งหนี้/ใบกำกับภาษี", or a separate no-GL TAX_INVOICE.
- **F3 Low** — `pos/reports.ts:1790` (reportCredit) filters refunds with `createdAt: {gte: r.start}` and no `lt: r.end`, so refunds made after a past range still count in its `refundedSatang`. Fix: add `lt: r.end`.
- **F4 Info** — `register.ts` has 7 marked hunks (REG_MESSAGE, regPinRow, REG_SUBMIT_KEYS, :2741 call, :2811 assign, :2830 mask, regP36 :3379–3410), not literally one block; all are marked. In `crm/payments.ts:1112` the original `if (targets.length===0)` line is now dead after the new early return (kept to stay −0). Both harmless.

**Verified OK (per ruling)**
1. `PosCreditAccount` model + migration (3 nullable ADD COLUMN · CREATE TABLE · unique(systemId,partyId)). Only writer is `credit.ts:105–106` (grep). Key `pos.credit.manage` at `permissions.ts:156`. `scope.ts` sys().
2. Override: `register.ts:3398–3406` calls `verifyManagerPin` (wrong-PIN count on the manager row, `staff-pin.ts:548`) and requires `pos.credit.manage`. createSale re-checks in `credit.ts:196–200`. Audit `pos.credit.override` keys are exactly {saleId, partyId, byUserId, overSatang}, written in the sale tx. REG_SUBMIT_KEYS has no `creditOverrideByUserId` / `memberAttachOnly`.
3. Account code: marked blocks in `index.ts` (unions + end block) and `service.ts:5165–5167` + `:7286–7476` (CD-P36-B4). AR1 lock + re-check sit in `upsertPosCreditInvoiceDocument`. Retry is P2002-only and ON_ACCOUNT-only (`account-bridge.ts`, CD-P36-B5); the B5 OP follow-up line is in notes.
4. INVOICE AWAITING_PAYMENT with dueDate (BKK midnight), no doc GL. JV via the existing `postExternalSale`, ON_ACCOUNT→AR + company contact (`index.ts:217`). Refund CN `sourceDocId` = INVOICE (`findExternalSaleDoc` `service.ts:5166`). Void → `voidExternalSaleDocument` → INVOICE. Channel `ON_ACCOUNT` is in both the sale and refund unions.
5. `crmDealId` written once in the sale tx. `countPosSale` → `posIntentCount` (flag-first). Hourly sweeper is additions only.
6. Terms precedence + CD-3: probe `resolve(null,0,30)=30` · `(0,45,30)=0` ⇒ TERM_ZERO · contact 0 ⇒ null (`service.ts:7391`).
7. Facts: bigBillDeal [false,"P3.x"] · corporateCredit [true,null].
8. `order.ts` `orderMemberOnBill`: every channel, needs a member system, default true. Attach-only + memberChoices/STORE_CREDIT ⇒ VALIDATION; `!p36.attachOnly` skips applyOnSale.
9. Enum in its own file (ADD VALUE IF NOT EXISTS only). th "วางบิล (เครดิตเทอม)" / en "On account"; no Thai in the en diff (grep). `posCreditSettings` is exactly {enabled:false, requireBuyer:true}.
10. `staff-commission.ts:115–116` is one hunk, skipDealBills default true.
11–12. Shape S; U handoff + `--state` list in notes; base b92d5598 + merge 36f2a654.

Boundaries:
- `register-ui.tsx`, `shift.ts`, `verifyStaffPin`: no diff.
- `CreateSaleInput` +4 optional keys. 6 new codes; CREDIT_LIMIT_EXCEEDED carries limit/exposure.
- `REFUSAL_KEY` +7. `RegisterPayType` = Exclude<…,"ON_ACCOUNT"> (every prior member kept).
- `refund.ts:550–560` = one ON_ACCOUNT row, else REFUND_METHOD_INVALID. outbox +5 lines.
- `crm/index.ts` end re-export. `pos-seam` has no raw SQL and no writes. `crm-link` is the only CRM importer (index only).
- Contract: 4 optional keys.
- REPORT_KINDS ends with "credit". REST reports are explicit per-kind ops (`api/ops/reports.ts`, no credit/commission), so the RP2 allowlist is separate. `CSV_HEADERS.credit` present.
- ORACLE-EDITs B1/B2/B3 are own commits and in scope (PV3 skips exactly `account.contact.`; delete-probe in §fix1).
- `credit-actions`: "use server", async only, no `throw`, boolean `assertCan`.

## Hunter (money)
- **(1) Limit race — OK apart from F1.** The sale tx is READ COMMITTED. `pg_advisory_xact_lock(hashtext('pos:credit:<tenant>:<party>'))` is taken in-tx before the exposure read (`credit.ts:181–182`), so the loser sees the winner's committed bill as lag. Queued (undrained) bills count as lag; held carts are not sales.
- **(2) Refund/void.** Two partial refunds stay Σ ≤ grand (P1.8 caps). Void after a refund ⇒ HAS_REFUNDS. Void vs payment: the INVOICE is locked FOR UPDATE in the void tx (`service.ts:1554` → `posCreditInvoicePaidInTx`).
  - **H2 Medium (design → controller/owner)** — refund of a PAID or PARTIAL credit INVOICE: `refund.ts:554` forces a single ON_ACCOUNT row, so a CN (PAID) + Cr 1100 is issued against the paid INVOICE. Example: INVOICE ฿10,000, paid ฿6,000, refund ฿8,000 ⇒ remain −4,000 (clamped to 0 in exposure/aging) = customer credit with no cash path and no ops signal. Neither refused nor handled. Fix: cap the ON_ACCOUNT refund at the invoice remaining (facade read under the sale lock) and refuse the rest (accountant refunds), or accept it with an OP line.
  - **H3 Low** — a payment recorded between the void commit and the voided drain: JV is reversed, `voidDocument` refuses (has payment) and `bridgePosSaleVoided` returns `{docVoided:false}` silently ⇒ VOIDED bill + PAID INVOICE. Fix: logOps WARN or throw-to-retry when a credit INVOICE could not be voided.
- **(3) Idempotency — OK.** Upsert lock `acc:pos-credit-invoice:<book>:<bill>` + re-check without a status filter, so a cancelled INVOICE blocks re-creation after void. JV key `PosSale#id#PAID`. The paid consumer skips any status ≠ PAID (`outbox-consumers.ts:144`). The F8 refund path re-reads the full row, so onAccount survives. The paid-drain vs void race is pre-existing for all bills.
- **(4) Due date — OK** (probe):
  - 16 Oct 17:30Z +30 → 2026-11-16
  - 31 Jan BKK +30 → 03-02
  - 30 Jan 16:59:59.999Z +1 → 01-31; 17:00Z +1 → 02-01
  - 2028-02-29 +1 → 03-01; 365 days across the year boundary OK
  - Rule is paidAt + N days (no month-end rule, matches the brief). `paidAt = new Date()` is the same as base createSale.
- **(5) Override — OK; one Low.** Correct so far: a cashier cannot inject an approver id; the PIN counter is on the manager row; audit keys are exact.
  - **H4 Low** — no role gate: a STAFF granted `pos.credit.manage` passes `verifyManagerPin` (`staff-pin.ts:548`), `register.ts:3405` and `approverOf` (`credit.ts:200`), so they can approve their own over-limit sale with their own PIN. If CD-2 means role, add role ∈ {OWNER, MANAGER} in `approverOf` + regP36, or refuse byUserId = seller.
- **(6) Members — OK.** Attach-only gives tier 0, benefits null, grand = order total, PLATFORM included (W17). Points are per sale and the order key is `posorder-<id>`, so no double award. Register/REST cannot set `memberAttachOnly`.
- **(7) VAT — OK.** JV VAT = existing bill-level `splitIncludedVat`. ON_ACCOUNT is exactly one row (SPLIT_INVALID otherwise), tip 0, no cash tendered, and PAYMENT_MISMATCH keeps Σ = grand; mixed tender is refused (brief OUT). Info: the INVOICE doc VAT uses per-line `computeTotals` rounding, same as today's ABB doc; pp30 reads journal 2200.
- **(8) skipDealBills — OK.** Reversals are ACCRUE-based, so refund shares of deal bills reverse 0.
  - **H5 Low** — the skip keys on `crmDealId` only. A deal that never materialises (CLOSED/GATE/TAKEN) ⇒ neither staff nor CRM commission. Legacy-path COUNTED rows (R12 "or COUNTED row") are not skipped ⇒ possible double commission on legacy deal bills.
- **H6 Low (scale)** — `credit.ts:141–145` reads every ON_ACCOUNT bill the party ever had (no customerPartyId index, per P6.1) and sends all ids as `refId IN (…)` under the lock. At ~32k bills the Postgres bind limit makes every credit sale for that company fail INTERNAL. Fix: only undrained bills (NOT EXISTS doc) or a time window. Separately, the sweeper (`crm-link.ts:144`) takes the oldest 500 in 7 days and rescans already-linked bills, so it starves when there are more than 500 deal bills a week.

## Controller rulings (B · 21 Oct 16:5xZ) — fix round 2 on `wip/pos-p3.6` tree b
- **CD-P36-F1 (High)**: (a) `posCreditOpenDocs` — a doc matched by `refType PosSale ∧ refId ∈ saleRefIds` is open whatever its contact; (b) for ON_ACCOUNT bills the INVOICE contact is resolved by `customerPartyId` only (`ensureAccountContact`-style, create if missing) — never the buyer taxId fallback; buyer taxId/branch stays printed on the doc. Both inside the P3.6 marked blocks. Oracle: add/extend a check (CR-x) that a pre-existing contact with the same taxId but another partyId does not absorb the credit INVOICE and exposure counts it (own ORACLE-EDIT commit, red-before on the current code, counts in the note).
- **CD-P36-F2 (W16)**: suppress the `pos.taxInvoice` WARN for credit bills (flag the credit doc). No separate TAX_INVOICE row: default = the INVOICE doc is the "ใบแจ้งหนี้/ใบกำกับภาษี" of the credit bill; printing the full tax invoice from the credit bill = P3.6U handoff item. Owner/accountant question → OP **W23**.
- **F3**: add `lt: r.end` to the refund filter in `reportCredit`.
- **H2 (Medium)**: cap the ON_ACCOUNT refund at the INVOICE remaining (read under the same party lock); excess ⇒ new additive refusal `CREDIT_REFUND_EXCEEDS_REMAINING` (th/en `register.errors.*` + `REFUSAL_KEY`); accountant handles the rest in ACCOUNT (OP line).
- **H3**: when the credit INVOICE could not be voided (payment recorded in between) → `logOps` WARN `pos.credit.void_unposted` with saleId/docId (no throw-to-retry).
- **H4**: approver must be role ∈ {OWNER, MANAGER} **and** `byUserId ≠ seller` in `approverOf` + the register block (CD-2 means role, not only the key).
- **H5**: implement R12 as written — skip when `crmDealId` is set **or** a COUNTED CrmCommission row exists for the sale; if the reader is not available from the CRM facade, leave the second half as a P3.6U/CRM follow-up line and say so.
- **H6**: exposure read = undrained ON_ACCOUNT bills only (NOT EXISTS doc) or a 90-day window — pick the one the oracle CR/AR goldens tolerate; sweeper excludes already-linked bills from the 500 batch.
- F4 info accepted (7 marked hunks in register.ts; dead line in payments.ts kept for −0).
- Gates fix2 (exception: one more pre-submit + one typecheck): `qc-pos-p3.6` forced ×2 + `--no-db` · `pos-pre-submit.sh --set core,money --also qc-pos-p3.5,qc-pos-p2.9,qc-pos-p2.9b,qc-pos-p2.12,qc-pos-p2.14,qc-hf-tx` · typecheck at the final head. Then R2 = reviewer re-check of F1–F3 + H2–H6.

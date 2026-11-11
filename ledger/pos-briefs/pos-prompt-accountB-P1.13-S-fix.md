# Prompt — P1.13 S fix round 1. Controller: reviewer verdict on `wip/pos-p1.13` 211573c6 = MERGEABLE-AFTER-FIXES (F1–F5 + follow-ups). Rulings below are binding. Tree `/root/projects/shark-pos-d`, branch `wip/pos-p1.13`.

---

You are the P1.13 BUILDER continuing on `wip/pos-p1.13` (head 211573c6). One commit per item (`fix(pos P1.13): F<n> …`), typecheck before every push, push after each commit. Scratch/logs only in `scratchpad/p113/`. Same rules as before (no build/server/deploy/.env/Telegram/real DBD network, no `pkill -f`, wrappers for every DB command).

## Fixes
- **F1 (must)** Buyer/doc mismatch race: `supersedeExternalSaleAbb` (facade `supersedeAbbWithTaxInvoice`) takes the parsed buyer; when it returns `created:false` it also returns whether the existing doc's `contactSnapshot` (taxId, branchCode, name) matches that buyer. `issueCore`: `created:false` + mismatch ⇒ `ALREADY_ISSUED` with **no POS write** (no snapshot, audit, event, request update). Add `status:"PAID", refundedSatang:0` to the `updateMany` that claims `taxInvoiceDocId` (closes issue-vs-refund race); when it matches 0 rows re-read and return idempotent/ALREADY_ISSUED/HAS_REFUNDS accordingly.
- **F2 (must)** `lookupBuyerByTaxId`: verify the unit with `appSystemUnit {tenantId, systemId, unitId, type:"POS"}` (same as `buyerProfileForMemberAction`) before anything else ⇒ `PERMISSION_DENIED`/`VALIDATION` on a foreign unit; move the 30/min per-unit check **before** the `TAX_ID_INVALID` audit; add a per-tenant cap of 100/min (`RATE_LIMITED`).
- **F3 (must, account side, record in `POS-OWNER-PENDING.md`)** `account/dashboard.ts` `SALES_WHERE`: add `{ docType: "TAX_INVOICE", source: "POS" }` so full-invoice POS bills stay in the sales dashboard.
- **F4 (ruling)** The legal invoice shows what the buyer typed: keep the matched `contactId` but write the document's `contactSnapshot` from the buyer fields (name, address, taxId, branchCode, email). Do not update the contact row. **ORACLE-EDIT approved** for S2 ("same contact, other name" ⇒ snapshot = typed name, contactId = existing) in a separate commit `test(pos P1.13): ORACLE-EDIT S2 snapshot from buyer (ruling F4)`.
- **F5** Later issue without `requestId`: mark the sale's open P1.11 request ISSUED only when its taxId matches the issued buyer; otherwise set REJECTED with system reason "ออกใบกำกับภาษีเต็มรูปให้ผู้ซื้อรายอื่นแล้ว" and an audit row.
- **Follow-up 1 (do now)** `parseTaxInvoiceBuyer`: strip spaces and dashes from `taxId` and `branchCode` before validation; `branchCode: ""` ⇒ default `00000` (not VALIDATION).
- **Follow-up 2 (do now)** Align P1.11 request limits in `receipt-tax-request.ts` to name ≤120 / address ≤300 (same messages).
- **Follow-up 3 (ruling)** Pay-time: in `submitRegisterSale`, when `taxInvoice` is present but the sale would not get an ABB (`receiptKindOf` conditions: VAT book linked, book taxId, ABB on, VAT > 0) ⇒ refuse `NOT_ELIGIBLE` with key `pos.register.errors.taxInvoiceNotEligible` ("ร้านนี้ยังออกใบกำกับภาษีไม่ได้ · ตรวจการเชื่อมบัญชี/เลขผู้เสียภาษี") th+en, before any write. Consumer: if the book is ineligible at consume time, fall back to the plain ABB/receipt path and clear nothing (defensive; log ops warn). Add oracle checks only if cheap (ORACLE-EDIT `S5` pay-time ineligible ⇒ NOT_ELIGIBLE), same separate-commit rule.
- **Follow-ups 4–5 (record only)** in `ledger/wo-notes/pos-P1.13.md` + `POS-OWNER-PENDING.md`: accountant TAX_INVOICE list void/credit-note bypass POS reversal; output-VAT report lacks TX no./buyer taxId for POS bills; supersede ignores locked period; held cart / approval re-submit must resend `taxInvoice` (P1.13U/P1.15U).

## Gates before "done"
`qc-pos-p1.13` forced ×2 + unforced (count after edits; residue 0) · `qc-pos-p1.11` · `qc-pos-p1.8` · `qc-pos-p1.16` · `qc-pos-p1.3` · `qc-pos-p1.10` · money set COMMON §7 identical · `qc-hf-pos-page-authz` · `pnpm fitness` with/without env · `scripts/fitness-pos.mts` · typecheck 0 (log must contain the exit line). Then merge `origin/session/pos` into your branch (ledger-only commits since ff4e559f are expected; resolve conflicts yourself; re-run typecheck + `qc-pos-p1.13` after the merge).

## Done =
Append "## Fix round 1" to `ledger/wo-notes/pos-P1.13.md` (per item: commit, change, verification) · push · report ≤25 lines with head SHA. Do not merge into `session/pos`, never touch `main`.

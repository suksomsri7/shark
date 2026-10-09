# POS P1.13 — builder S notes (full tax invoice · later issue / from request · DBD facade · buyer profile)

Builder S · VPS account B · 9 Oct 2026 · tree `/root/projects/shark-pos-d` · branch `wip/pos-p1.13` from `origin/session/pos` ff4e559f (oracle 0a049f30 merged).
Contract: `ledger/pos-briefs/pos-brief-P1.13.md` + controller rulings 1–15 (`pos-prompt-accountB-P1.13-S.md`) + oracle `scripts/qc-pos-p1.13.mts`.

## ⚠️ ORACLE-EDIT? ST1 · Q1 · Q2 · Q3 (ruling 8 vs the oracle)
Ruling 8 (binding): no `PosTaxInvoiceRequest.issuedDocId` column — the issued doc goes into the existing `accountDocId`. The oracle as written
requires the column: ST1 (schema + migration), Q1 (`issuedDocId = docId`) and — through the `NCOL("issued", …)` gate — Q2 and Q3 too
(both are functionally green: "ครบ"). I followed ruling 8 and did **not** edit those checks (only L6 was approved).
**Approved by the controller and committed** as its own ORACLE-EDIT commit (drop issuedDocId from ST1/COL gate; Q1 asserts `accountDocId = docId`).
Verified with that patch applied locally (uncommitted, reverted): forced run **31/31, residue 0**.
If the controller prefers the column instead: add `issuedDocId String?` + one migration and write it next to `accountDocId` in `tax-invoice.ts#issueCore`.

## Migration (QC4 only · additive · schema-to-schema diff)
`prisma/migrations/20261201100000_pos_p113_tax_invoice/migration.sql` = `prisma migrate diff --from-schema <copy of pre-change prisma/schema> --to-schema prisma/schema --script`:
`ALTER TABLE "AccountDocument" ADD COLUMN "supersededByDocId" TEXT` · `ALTER TABLE "PosSale" ADD COLUMN "taxInvoice" JSONB, ADD COLUMN "taxInvoiceDocId" TEXT` ·
`CREATE TABLE "PosBuyerProfile"` (id, tenantId, customerId, kind, name, taxId, branchCode default '00000', address, email?, updatedAt) ·
`CREATE UNIQUE INDEX PosBuyerProfile_customerId_key` · `CREATE INDEX PosBuyerProfile_tenantId_taxId_idx`. Nothing else.
(Timestamp 20261201**1**00000 because QC4 already holds another lane's `20261201000000_hr_pin_hash`.)
`migrate status` before: only this folder pending (QC4 also holds 6 other lanes' migrations, untouched) · `migrate deploy` (iso → qc4 → POS gate lock) **0** · status after "up to date" · `prisma generate` (own node_modules) **0**.
Registered: `scope.ts PosBuyerProfile: tenant` · `pos-qc-env POS_MODELS.posBuyerProfile` · `POS-OWNER-PENDING.md` (account-schema touch, CD5).

## What was built (per step · each step typechecked 0 then committed + pushed)
1. `1efea829` `pos/tax-invoice-shared.ts` (pure): `parseTaxInvoiceBuyer` (trim · kind/name≤120/address≤300/branch 5 digits default 00000/email≤120 RFC-light/source default MANUAL · unknown keys VALIDATION · every tax-id problem TAX_ID_INVALID, ruling 6), `isValidThaiTaxIdChecksum` (mod-11), `maskTaxId`, `buyerKindFromTaxId`, `sameTaxInvoiceBuyer`, `snapshotBuyer`, `taxInvoiceRefusalKey` (ruling 13), codes + Thai messages · migration · permission `pos.taxinvoice.issue` · messages `pos.taxInvoice.errors.*` th/en (+ `hasRefunds`) and `register.errors.taxIdInvalid` · register code `TAX_ID_INVALID`.
2. `db66c2e2` pay time: `submitRegisterSale` + top-level `taxInvoice` / `rememberBuyer` (parsed before the idempotency lookup ⇒ bad buyer writes nothing) · `CreateSaleInput.taxInvoice?` (snapshot in the sale tx; F15.2 contract +1 additive field via `--update-pos-contract`) · facade `applyExternalSale({buyer})` ⇒ `TAX_INVOICE` (refType PosSale/refId sale, `nextDocNo(…"TAX_INVOICE", paidAt)` = TX series, contact via `findOrCreateCustomerContact({taxId, branchCode, name, address, email, legalType})` **without partyId** — ruling 1; GL path untouched) · `findExternalSaleDoc` prefers live TAX_INVOICE (ruling 2) and `voidExternalSaleDocument` follows it · `account-bridge` reads `PosSale.taxInvoice` from the row the consumer already passes (no hunk in the paid consumer), sets `taxInvoiceDocId` + emits `pos.sale.taxInvoiceIssued` in one tx only when still null · no-op consumer + automation label · rememberBuyer upsert (member bills only).
3. `84e17c5b` `pos/tax-invoice.ts`: `issueFullTaxInvoice` · `issueFromTaxInvoiceRequest` · `rejectTaxInvoiceRequest`; facade `supersedeAbbWithTaxInvoice` (= `convertAbbToTaxInvoice` alias for the oracle) → `account/service.supersedeExternalSaleAbb` (lock ABB, copy lines/amounts/date, TX number, `sourceDocId = ABB`, ABB → CANCELLED + `supersededByDocId`, **no GL** — ruling 4).
4. `c88d6656` `lookupBuyerByTaxId` (facade `lookupJuristic` re-exported with `DBD_REASON`/`isDbdConfigured`/`DbdLookupResult`; ruling 10 mapping; ruling 11 permission + 30/min/unit) · `buyerProfileForMember` · `pos/tax-invoice-actions.ts` (5 actions).
   `fc12dfb7` ORACLE-EDIT L6 (ruling 15) — separate commit; oracle notes count 30→31.
5. `3a516b25` readers: `receiptPayload.kind = "TAX_INVOICE_FULL"` + `doc.fullTaxInvoiceNo` (+ shop taxId/branch, VAT rows, hint false) · renderer line "ออกใบกำกับภาษีเต็มรูปแล้ว เลขที่ <no>" (HTML + ESC/POS, label `fullTaxInvoiceIssued` th/en; title = ใบเสร็จรับเงิน) · `publicReceipt.actions.taxInvoice = "ISSUED"` when `taxInvoiceDocId` (token select + 1 line) · `BillDetail.taxInvoice` · `applyExternalRefund`/`posSaleAccountingRef` → TAX_INVOICE through the facade preference (R8).

## Rules as implemented (server)
- Issue order: permission (`pos.sale.read|create` + `pos.taxinvoice.issue` at ctx.unitId) → input/buyer parse → sale (same tenant/system/unit, docType SALE, else SALE_NOT_FOUND) → VOIDED ⇒ SALE_VOIDED → already issued (same buyer after parse ⇒ `{ok, docId, docNo}` with no new audit/event; other ⇒ ALREADY_ISSUED) → refunds ⇒ HAS_REFUNDS → not PAID ⇒ NOT_ELIGIBLE → paidAt older than 7 d ⇒ TOO_LATE → receipt kind ≠ ABB (unlinked / non-VAT / ABB off / no book taxId / no VAT on bill) ⇒ NOT_ELIGIBLE → facade: no ABB yet ⇒ ACCOUNT_PENDING (nothing written on either side).
- First issue writes snapshot + `taxInvoiceDocId` (conditional on null — race-safe), open REQUESTED request(s) of the sale → ISSUED + `accountDocId` (ruling 8), event `pos.sale.taxInvoiceIssued {tenantId, saleId, docId, unitId, via LATER|REQUEST|PAY, requestId?}` key `pos.sale.taxInvoiceIssued:<saleId>` (ruling 12), audit `pos.taxinvoice.issued` (masked taxId), then rememberBuyer.
- Request rows: kind from taxId (`0…` JURISTIC), source MANUAL (ruling 7); P1.11 rows can be longer than R1 limits (name 200 / address 500) ⇒ such a row gets VALIDATION. REJECTED/ISSUED requests: reject ⇒ NOT_ELIGIBLE; issue from ISSUED ⇒ idempotent repeat.
- DBD audit row: `targetType "BusinessUnit"`, `targetId = unitId`, `after {unitId, taxId: xxxxxxxxx1234, outcome}` on every call (also TAX_ID_INVALID and RATE_LIMITED calls).

## P1.13U contract
Actions (`src/lib/modules/pos/tax-invoice-actions.ts`, all return data, never throw):
- `issueFullTaxInvoiceAction({systemId, unitId, saleId, buyer, requestId?, rememberBuyer?})` → `{ok:true, docId, docNo}` | refusal
- `issueFromTaxInvoiceRequestAction({systemId, unitId, requestId, rememberBuyer?})` → same
- `rejectTaxInvoiceRequestAction({systemId, unitId, requestId, reason})` → `{ok:true}` | refusal
- `lookupBuyerByTaxIdAction({systemId, unitId, taxId})` → `{ok:true, found:true, buyer:{kind:"JURISTIC", name, taxId, branchCode:"00000", address, status}}` | `{ok:true, found:false}` | refusal (DBD_NOT_CONFIGURED ⇒ show "กรอกเอง")
- `buyerProfileForMemberAction({systemId, unitId, memberId})` → `{ok:true, profile: {kind, name, taxId, branchCode, address, email} | null}`
- Pay screen: `submitRegisterSaleAction` input gains `taxInvoice: {kind, name, taxId, branchCode?, address, email?, source?: "MANUAL"|"DBD"|"PROFILE"}` + `rememberBuyer?: boolean`; refusals `TAX_ID_INVALID` (key `pos.register.errors.taxIdInvalid`) / `VALIDATION`.
- Shapes: `BillDetail.taxInvoice {status:"NONE"|"REQUESTED"|"ISSUED", docNo?, buyerName?, requestId?}` (drawer "ออกใบกำกับเต็มรูป" / approve-reject a REQUESTED one) · `ReceiptPayload.kind "TAX_INVOICE_FULL"` + `doc.fullTaxInvoiceNo` · `BillDetail.receiptKind` unchanged (2 values) · `BillDetail.accounting` points at the TAX_INVOICE.
- Codes → `taxInvoiceRefusalKey(code)` → `pos.taxInvoice.errors.{validation, taxIdInvalid, tooLate, saleVoided, alreadyIssued, notEligible, accountPending, hasRefunds, permissionDenied, saleNotFound, notFound, dbdNotConfigured, dbdUnavailable, rateLimited, internal, unknown}`.
- Settings: none new. Permission `pos.taxinvoice.issue` (OWNER/MANAGER implicit). DBD key = env `DBD_API_KEY` on prod only (none on QC).

## Results (QC4 `ep-frosty-lab-aoylqlv8-pooler…` · POS gate lock · 9 Oct UTC)
- Per step forced `qc-pos-p1.13`: step 2 → 11/30 (S1–S4 green) · step 3 → 17/30 (L1–L5) · step 4 → 24/30 · step 5 → 26/30 · + ORACLE-EDIT L6 → 27/31.
- Final: `qc-pos-p1.13` forced #1 **27/31** · forced #2 **27/31** (red = ST1/Q1/Q2/Q3 only — ruling 8, see top; residue 0, Tenant 0, guardHits 0 each run) ·
  unforced = **SKIPPED exit 0** (skip gate: "ฐาน QC4 ยังไม่มี PosTaxInvoiceRequest.issuedDocId" — same ORACLE-EDIT) ·
  with the proposed ruling-8 patch applied locally: forced **31/31 exit 0**, residue 0.
- `qc-pos-p1.11` 0 · 38/38 · `qc-pos-p1.8` 0 · 49/49 · `qc-pos-p1.16` 0 · 28/28 · `qc-pos-p1.6` 0 · 48/48 · `qc-pos-p1.10` 0 · 40/40 ·
  `qc-pos-p1.3` 0 · 128/128 and `qc-pos-p1.7` 0 · 31/31 (first pass 126/128 S9.1/S9.2 and 30/31 Z2 = seed-tenant drift from the concurrent
  `shark-pos-c` visual-pos run on the coffee tenant (posProduct/posSale/posDevice rows); both green on re-run) · `qc-hf-pos-page-authz` 0 · 56/56.
- Money set COMMON §7 before → after (identical): `qc-pos-account` 16/16 → 16/16 · `qc-account-cpa` 107/107 → 107/107 · `qc-restaurant-money` 6/6 → 6/6 ·
  `qc-shop-refund` 12/12 → 12/12 · `qc-hotel-money` 5/5 → 5/5 · `qc-ticket-money` 6/6 → 6/6 · `qc-subscription-money` 14/14 → 14/14 (all exit 0).
- `pnpm fitness` without env 0 · 41/41 · with QC4 env 0 · 41/41 · `scripts/fitness-pos.mts` 0 · 8/8 (F15.2: +`CreateSaleInput.taxInvoice?` recorded with `--update-pos-contract`).
- `pnpm typecheck` (iso + /tmp/pos-gate.lock, 5632 MB) exit 0 before every push (5×).

## Follow-ups / open
1. ORACLE-EDIT? ST1/Q1/Q2/Q3 (above).
2. Voiding a sale that carries a full TAX_INVOICE voids the TAX_INVOICE (facade preference); a superseded ABB stays CANCELLED. Not oracle-tested.
3. Credit notes created **before** a later issue cannot exist (HAS_REFUNDS, ruling 15) — no re-pointing needed.
4. `createSale` callers other than the register (hotel/restaurant/…) can pass `taxInvoice` but nothing validates it there (only the register parses it).
5. Account session: review `supersedeExternalSaleAbb`, `upsertExternalSaleDocument({fullTaxInvoice})`, `findOrCreateCustomerContact({address, legalType})` (POS-OWNER-PENDING).

## After ORACLE-EDIT ST1/Q1/Q2/Q3 (ruling 8 · approved)
- `qc-pos-p1.13` forced #1 **0 · 31/31** · forced #2 **0 · 31/31** · unforced **0 · 31/31** (no SKIP) — residue 0, Tenant 0, guardHits 0 each run · typecheck 0.

## Fix round 1 (reviewer verdict on 211573c6 = MERGEABLE-AFTER-FIXES · prompt `pos-prompt-accountB-P1.13-S-fix.md`)
| item | commit | change | verification |
|---|---|---|---|
| F1 | 64c0e33d | `supersedeExternalSaleAbb` takes the buyer; `created:false` returns `buyerMatches` (contactSnapshot taxId/branch/name) → `issueCore` ALREADY_ISSUED with no POS write · claim of `taxInvoiceDocId` requires `status PAID, refundedSatang 0`; 0 rows ⇒ re-read ⇒ idempotent / ALREADY_ISSUED / HAS_REFUNDS / SALE_VOIDED | L1–L6 green (idempotent repeat, other buyer, refunds) |
| F2 | 9e837395 | `lookupBuyerByTaxId`: appSystemUnit {tenant, system, unit, POS} first (PERMISSION_DENIED) · 30/min/unit + new 100/min/tenant checked before any audit (incl. TAX_ID_INVALID) | D1–D3 green |
| F3 | 0fd07421 | `account/dashboard.ts` SALES_WHERE + `{TAX_INVOICE, source POS}` · POS-OWNER-PENDING line | qc-pos-account 16/16 · qc-account-cpa 107/107 |
| F4 | b0efc9a9 | full-invoice `contactSnapshot` = buyer as typed (name/address/taxId/branch/email/legalType) at pay time and later issue; contact row untouched | ORACLE-EDIT S2 (b340f16a) green |
| F5 | f5aa62c2 | later issue without requestId: open request ISSUED only when its taxId matches, else REJECTED + audit `pos.taxinvoice.rejected` (reason "ออกใบกำกับภาษีเต็มรูปให้ผู้ซื้อรายอื่นแล้ว", `after.system`) | Q1–Q3 + P1 green (not separately oracle-tested) |
| FU1 | 14d87c87 | parser strips spaces/dashes from taxId + branchCode · `branchCode ""` = 00000 | B1–B4 green + ad-hoc: "0-1055-61177-63-9" ok · "00 001" → 00001 · letters still TAX_ID_INVALID / VALIDATION |
| FU2 | cf6adbfe · 0e16a906 | P1.11 request limits name ≤120 / address ≤300 (server) + P1.11U form `maxLength` aligned after the merge | qc-pos-p1.11 38/38 (before and after merge) |
| FU3 | 801a3542 | pay time: `taxInvoice` on a bill that gets no tax invoice (unlinked / non-VAT / ABB off / no book taxId / VAT 0) ⇒ `NOT_ELIGIBLE` before any write (key `pos.register.errors.taxInvoiceNotEligible` th+en) · consumer falls back to the plain path when the book is ineligible at consume time (snapshot kept, ops WARN, no buyer data) | ORACLE-EDIT S5 (c82d9b8f · bTN moved out of S1 · count 32) green |
| FU4–5 | 0d7553cc | recorded in POS-OWNER-PENDING + below | — |

Follow-ups recorded (not fixed): (a) accountant can void / credit-note a POS TAX_INVOICE from the account list, bypassing the POS reversal · (b) output-VAT report lacks the TX no. / buyer taxId for POS bills · (c) `supersedeExternalSaleAbb` ignores a locked period · (d) held cart / approval re-submit must resend `taxInvoice` (P1.13U / P1.15U). Also: a race where the account doc is superseded but the POS claim then hits a refund leaves a live TAX_INVOICE with POS answering HAS_REFUNDS (accepted by ruling F1).

Merge: `f2545922` = `origin/session/pos` 9ba7834b (P1.11U) into `wip/pos-p1.13`, no conflicts.

Gates (QC4 `ep-frosty-lab-aoylqlv8-pooler…`, POS gate lock):
- Before the merge (tip 0d7553cc): `qc-pos-p1.13` forced #1 0 · 32/32 · forced #2 0 · 32/32 · unforced 0 · 32/32 (residue 0, Tenant 0 each) · p1.11 38/38 · p1.8 49/49 · p1.16 28/28 · p1.3 128/128 · p1.10 40/40 · hf-pos-page-authz 56/56 · money set identical (16 · 107 · 6 · 12 · 5 · 6 · 14, all exit 0) · fitness without env 0 · 41/41 · with QC4 env 0 · 41/41 · fitness-pos 0 · 8/8.
- After the merge (tip 0e16a906): typecheck `TC_EXIT=0` (log `scratchpad/p113/tc-0e16a906.log`) · `qc-pos-p1.13` forced #1/#2 + unforced 0 · 32/32 each (residue 0) · `qc-pos-p1.11` 0 · 38/38.
- Typecheck runs on a `git archive` copy of each pushed commit (node_modules symlinked), so the tree stayed editable while the POS lock was busy; pushes happened only after `TC_EXIT=0` (9e837395, 0fd07421, then 0e16a906 carrying the rest, because of lock contention).

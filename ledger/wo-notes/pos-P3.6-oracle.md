# P3.6 S oracle — `scripts/qc-pos-p3.6.mts` (fail-before) · oracle writer (account A) · 16 Oct 2026 ~21:4xZ

Tree `/root/projects/shark-pos-e` · branch `wip/pos-p3.6-oracle` from `72669941` (session/pos · product c5fc223b) · brief `ledger/pos-briefs/pos-brief-P3.6.md` (§10 rulings 1–12 binding) · red-before `ledger/wo-notes/P3.6-red.txt`.

**47 checks** = CP1–4 · CR1–9 · AR1–6 · VR1–6 · DL1–6 · CM1–2 · MB1–5 · PV1–3 · ST1–4 · Z1–Z2 (ids of brief §4 exactly; §4 says ≈ 40 + Z).
Modes: `--list` (no DB, no imports) · `--no-db` (ST1–ST4, file reads + git only, no prisma) · DB run SKIPs (exit 0 + reasons) while the 5 new files are missing; `QC_FORCE=1` = red by reason, never crash, Z green.
Run (QC4 only): `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p3.6.mts` (full path to iso.sh from outside the tree). `P36_ST_ALL=1` prints every static problem; `P36_PIN=<sha>` moves the pin (controller re-pin).

## 1. Names table (the contract — builder implements exactly these)
| Where | Name | Shape / rule (check) |
|---|---|---|
| `src/lib/modules/crm/pos-seam.ts` (CRM-owned, written by this lane, R1) | `companiesForPos({tenantId, q?, partyIds?, limit?})` | array (or `{items}`) of `{partyId, companyId, systemId, name, taxId, branchCode}` only · non-archived/non-merged · all CRM systems of the tenant · limit default/max 20 (CP1 CP2) |
| | `companiesOfParty({tenantId, partyId})` | same row shape · CrmContact(partyId) → CrmCompanyContact with `endedAt` null (CP3) |
| | `linkPosSaleSystem(ctx{tenantId, systemId}, {dealId, saleId})` | = `linkSaleToDeal` without actor, same locks/flag/gift-card refusal (DL1 DL6) |
| | `onPosSaleRefunded(ctx, {saleId, refundSaleId, satang})` | negative `CrmDealPayment` refType `POS_REFUND` refId = refund sale · Σ ≥ −counted · `afterPaymentsReversed` (DL5) |
| | no raw SQL, no `.create/.update/.delete/.upsert*` in the seam itself (ST3) | writes go through marked block `// POS P3.6 ▸ … ◂` in `crm/payments.ts` (ST1: no removed lines there) |
| `src/lib/modules/crm/index.ts` | one hunk at file end `// POS P3.6 ▸ … ◂` | only `export … from "./pos-seam"` (ST1) |
| `src/lib/modules/pos/crm-link.ts` (only POS file importing `@/lib/modules/crm`) | `registerCompanySearch(ctx, actor, {q})` · `registerMemberCompanies(ctx, actor, {memberId})` | `{ok:true, items: CompanyOption[]}` · gate `pos.sale.create` (cashier with zero CRM keys gets results; no POS key ⇒ `PERMISSION_DENIED`) (CP2–CP4) |
| | `registerDealOptions(ctx, actor, {memberId?, customerPartyId?})` | `{ok:true, items}` keys ⊆ `{id, systemId, title, valueSatang, stageName}` · empty without `crm.deal.update` (DL4) |
| | `sweepDealIntents({tenantId?, now?, deadline?})` | links PAID bills with `crmDealId` and no POS_SALE row (7-day window) · idempotent (DL6) · minute-jobs hourly (not asserted) |
| `pos/credit.ts` (single writer of `PosCreditAccount`, ST3) | `saveCreditAccount(ctx{tenantId, systemId(POS)}, actor, {partyId, limitSatang, termDays?, active?, note?})` | key `pos.credit.manage` (OWNER/MANAGER default) · limit > 0 · termDays 0..365 or null else `VALIDATION` · audit `pos.credit.account_updated` (no name/phone/email/address/note/taxId keys or values) (CR4 PV3) |
| | `listCreditAccounts(ctx, actor)` | `{ok:true, items}` · cashier ⇒ `PERMISSION_DENIED` (PV2) |
| | `registerCreditStatus(ctx, actor, {customerPartyId, amountSatang?})` | `{ok:true, enabled, allowed, sufficient, termDays, dueDate}` + `limitSatang exposureSatang remainingSatang` **only** for holders of `pos.credit.manage` (PV2 VR1 VR5 CR6) |
| `pos/credit-shared.ts` (pure, no prisma/db/server-only) | `creditDueDate(paidAt: Date, termDays)` → `"YYYY-MM-DD"` (Bangkok date + days) · `resolveCreditTermDays(account, contact, bookDefault)` | pure golden in CR1: `creditDueDate(2026-10-16T17:30Z, 30) = 2026-11-16` · `(16:59Z, 15) = 2026-10-31` · `resolve(null,30,45)=30 · (15,30,45)=15 · (null,null,45)=45` |
| `pos/credit-actions.ts` | `"use server"` · async exports only · `assertCan` | `saveCreditAccountAction` · `listCreditAccountsAction` · `registerCreditStatusAction` (ST1 ST3) |
| `pos/service.ts` | `CreateSaleInput` += `customerPartyId?` `crmDealId?` `memberAttachOnly?` `creditOverrideByUserId?` · `payMethods[].type` `ON_ACCOUNT` | contract JSON additions only, 4 keys optional (ST1) |
| | `PosSaleErrorCode` += `CREDIT_DISABLED CREDIT_NOT_ALLOWED CREDIT_TERM_ZERO CREDIT_LIMIT_EXCEEDED CREDIT_INVOICE_PAID CUSTOMER_INVALID` · `CREDIT_LIMIT_EXCEEDED` error carries `.limitSatang .exposureSatang` (like `giftCardRow`) | CR2–CR9 VR2 |
| | `PAY_TYPE_ORDER` += `ON_ACCOUNT` · `PAY_TYPE_LABEL_TH.ON_ACCOUNT = "วางบิล (เครดิตเทอม)"` | ST1 |
| | `PosSale.customerPartyId` · `crmDealId` · `creditTerms {termDays, dueDate, limitSatang, exposureSatang, overrideBy?}` written once in the sale tx | CR1 CR2 CR8 DL1 |
| `pos/register-shared.ts` | `RegisterSubmitInput` += `customerPartyId?` `crmDealId?` `creditOverride?: {managerUserId, managerPin}` · `REGISTER_PAY_TYPES` += `ON_ACCOUNT` · `RegisterRefusalCode` += 6 credit codes + `DEAL_INVALID` · `REFUSAL_KEY` has all 7 (ST1) | register refusal `CREDIT_LIMIT_EXCEEDED` carries numbers only for a `pos.credit.manage` actor (CR7 PV2) · wrong PIN = `PIN_INVALID`, failedCount on the manager row (CR8) |
| `pos/refund-shared.ts` | `REFUND_PAY_TYPES` += `ON_ACCOUNT` | credit bill refunds = one `ON_ACCOUNT` row; cash/transfer ⇒ `REFUND_METHOD_INVALID` (or `REFUND_TENDER_MISMATCH`, CD-6) (VR3 VR4) |
| `pos/settings-shared.ts` | `posCreditSettings(settings)` → `{enabled:false, requireBuyer:true}` (exactly 2 keys; junk ⇒ default) · `posOrderMemberOnBill(settings)` → boolean, default `true` (`settings.pos.orders.memberOnBill`) | CR6 MB1 |
| `pos/reports.ts` | `REPORT_KINDS` ends with `"credit"` · `CSV_HEADERS.credit` · `export reportCredit` | ST1 only (amounts = aging; not REST in P3.6) |
| `core/permissions.ts` · `core/scope.ts` · `scripts/pos-qc-env.mts` | `"pos.credit.manage": "<ไทย>"` · `PosCreditAccount: sys()` · `POS_MODELS.posCreditAccount {model:"PosCreditAccount"}` | ST1 |
| `account/index.ts` (account-lane code, additive) | `applyExternalSale` input `onAccount?: {partyId, dueDate, termDays}` · channel `"ON_ACCOUNT"` in sale **and** refund unions | ⇒ JV Dr 1100 (contact = company's book contact by partyId) / Cr revenue + 2200 · document **INVOICE** AWAITING_PAYMENT with `dueDate`, refType PosSale, no ABB/TAX_INVOICE doc for that bill · refund ⇒ CREDIT_NOTE `sourceDocId` = INVOICE · void ⇒ INVOICE VOIDED (AR1 AR2 VR1 VR3) |
| `pos/account-bridge.ts` | `channelOf` `case "ON_ACCOUNT"` | ST1 |
| audit | `pos.credit.account_updated` · `pos.credit.override {saleId, partyId, byUserId, overSatang}` | CR4 CR8 PV3 |
| messages th/en `pos.json` | `pos.register.credit.*` · `pos.register.deal.*` · `pos.settings.credit.*` · `pos.report.credit.*` (or `pos.reports.credit.*`) · `ON_ACCOUNT` under `shift.method` · `report.closeDay.method` · `receipt.public.pay` — th contains "วางบิล", never "เครดิตร้าน"; en "On account", no Thai | ST1 |
| facts `src/lib/pos-integrations.ts` | CRM `["corporateCredit", true, null]` · `["bigBillDeal", false, …]` | ST1 |
| schema/migrations | `…_pos_p36_credit_enum` = `ALTER TYPE "PosPayType" ADD VALUE [IF NOT EXISTS] 'ON_ACCOUNT'` only (+ `SET lock_timeout`) · `…_pos_p36_credit` (later timestamp) = `ALTER TABLE "PosSale" ADD COLUMN "customerPartyId" TEXT, "crmDealId" TEXT, "creditTerms" JSONB` (nullable, no DEFAULT) + `CREATE TABLE "PosCreditAccount"` + `CREATE UNIQUE INDEX … ("systemId","partyId")` (+ optional CREATE INDEX) · no DROP/UPDATE/DELETE/RENAME/ALTER COLUMN/NOT NULL · model fields `tenantId systemId partyId limitSatang Int termDays Int? active Boolean note String? updatedById updatedAt @@unique([systemId, partyId])` · schema diff vs pin removes nothing | ST2 |
| untouched | `pos/register-ui.tsx` · `pos/shift.ts` byte-equal to pin | ST4 |

## 2. Fixture plan (no seeds — temp tenants `posqc-p36-<rand>` + `-t2`, wiped in `finally`)
- Units A (T) / X (T2) · systems POS, ACCOUNT (VAT on, `defaultDueDays` 45 via `saveSettings` + raw update of the temp row so the book default ≠ the contact term 30), CRM v2 (`uiVersion 2 · bridgesEnabled true`, raw `settings.crm` patch as qc-crm-c2.7), MEMBER + POINT linked to A, T2 POS + CRM. Account link POS→ACCOUNT, ACCOUNT→CRM. BANK finance account for `recordPayment`.
- Users (real Membership rows): OWNER · MGR (MANAGER, unit A, PIN 4826 via `setStaffPin`) · CASH (STAFF `pos.sale.create` only) · SALES1 (STAFF + `crm.deal.read/update`, `crm.contact.read`; owner of all deals) · NOPERM · OWNER2 (T2).
- Device + open shift (register/refund/Z) · products ก ฿300 · ข ฿200 · ค ฿100 · channels CHAT (builtin, pay at pickup) + LINEMAN (PLATFORM, 10 %).
- Member M1: Gold tier 10 % (`createTierDef` + `setBenefits` + `applyTierChange`), point settings 1 pt / ฿10.
- CRM rows written raw (Party COMPANY + CrmCompany, phone/email sentinels): CO1 (book contact AC1 via `findOrCreateCustomerContact` + creditTermDays 30, `accountContactId`) · CO2 · CO3 archived · CO4 · CO5 · CO6 · CO7 · COX (T2). Contact CT1 = party of M1 (phone/email sentinels), active link CO1, ended link CO4; CT2 other person. Pipeline 4 stages; deals D1 (CO1, value 98,765,432 sentinel) · D2 (CT2) · D3 (CO1, credit bill) · D4 (WON) all owned by SALES1. CRM commission rule PCT 5 % basis PAID via `commissions.createRule`.
- Credit accounts **through the writer** `saveCreditAccount` (missing ⇒ fixture note, checks red by reason): CO1 ฿10,000 term null · CO2 ฿1,000 term 15 · CO4 ฿10,000 null · CO5 ฿10,000 term 7 · CO6 term 0 · CO7 inactive.
- Outbox: tenant-scoped pump (PENDING rows of T/T2, consumers map, mark DONE) + `replay(type, saleId)` calling the consumer directly. No `drainAll`, no other tenant touched.
- Raw SQL only on temp rows (settings patches, CRM fixtures, contact term, reads of new columns). Fetch guard on; no network.
- Exposure ledger for P1: CR1 4,000 → CR7 refused at 4,000 → CR8 7,000 (override) + 300 (register PIN) → AR4 pays CR1 → VR3 refunds 3,000 (VR5 −300,000).

## 3. Drift vs the brief at 72669941
1. **No `pos.payType.*` namespace** (R15). Pay-type labels live at `pos.shift.method.*`, `pos.report.closeDay.method.*`, `pos.receipt.public.pay.*` (th/en) and `PAY_TYPE_LABEL_TH`/`PAY_TYPE_ORDER` (`service.ts:1627–1628`, p2.1 ST5 precedent). Oracle pins those, not `pos.payType`.
2. **`REFUND_TENDER_MISMATCH` does not exist** (R8). Precedent for "wrong tender on a platform bill" = `REFUND_METHOD_INVALID` (`refund.ts:538–546`). Oracle accepts either (CD-6).
3. **Audit name**: R6 `pos.credit.over_limit` vs ruling 2 `pos.credit.override` — oracle uses ruling 2.
4. **Messages namespace** is `pos.report` (singular), brief says `pos.reports.credit.*` — oracle accepts both.
5. **Orders cannot be ingested on STORE** (§4 "order channels STORE/PLATFORM"): STORE = register. Oracle uses CHAT (DIRECT, `payOrder` CASH) + LINEMAN (PLATFORM bill at accept).
6. **`AccountContact.creditTermDays` defaults to 0 ("0 = เงินสด")** — every contact the bridge auto-creates has 0, so "contact 0 ⇒ CREDIT_TERM_ZERO" would block a company after its first drained bill. Oracle: contact 0 = unset (falls through to book default); `CREDIT_TERM_ZERO` only from an explicit credit-account `termDays 0` (CR2, CD-3).
7. **`outstandingByContacts` ignores credit notes** (⚠️5): VR5 asserts exposure drops by the refund ⇒ exposure must use aging-equivalent maths.
8. **Deal select keeps `valueSatang`** (legacy `PosDealOption`, `register.ts:346`) although R14 bans deal values on picker/receipt/bills: oracle allows it in deal options only (DL4) and forbids it on receipt/public receipt/bill detail (PV1).
9. `CrmDeal.contactId` is required — company deals D1/D3 use CT1 + `companyId`.
10. Register over-limit PIN input is unnamed in the brief — oracle names `RegisterSubmitInput.creditOverride {managerUserId, managerPin}` (CD-1).
11. P3.5 oracle CM6 (`qc-pos-p3.5.mts:666, :678` on `wip/pos-p3.5-oracle`) pins `posStaffCommission` to 5 keys — ruling 10's `skipDealBills` (default true) needs an ORACLE-EDIT there.
12. `qc-pos-p3.9.mts` ST4 (f6df707c :107) pins `prisma/`, `register*.ts`, `service.ts`, `refund*.ts`, `outbox-consumers.ts`, contract vs 72669941 — P3.6 trips it (re-pin, like the P2 pins).

## 4. ORACLE-EDIT list (own `test(...)` commits by controller/builder at merge)
1. `scripts/qc-pos-p1.18.mts:316` — `["corporateCredit", true, null]`; `bigBillDeal` stays `false` (phase string: CD-7).
2. `scripts/qc-pos-p2.12.mts:71` (PD1 title "(11)") · `:298–299` (`NEW_KINDS`/`ALL_KINDS`) · `:1816` ("คาด 11 ชนิด") · `:1850` — P3.5 makes 12 (+ commission), P3.6 makes **13 (+ credit)**.
3. `scripts/pos-gates.json` — append `{"suite": "qc-pos-p3.6", "mode": "forced"}` (else `qc-pos-p2.14.mts:114` G1 is red because this file exists).
4. `scripts/qc-pos-p3.5.mts:666` + `:678` — default `posStaffCommission({})` gains `skipDealBills: true`; allowed top-level keys += `skipDealBills`.
5. Lane re-pins at merge (controller, CD-B1b style): `qc-pos-p2.7.mts:49` ST3 · `qc-pos-p2.8.mts:58` ST6 · `qc-pos-p2.10.mts:58` ST2 · `qc-pos-p2.11.mts:47` ST1 / `:50` ST4 · `qc-pos-p2.12.mts:40` ST1 · `qc-pos-p2.13.mts:69` ST5 · `qc-hf-fu.mts:41` ST1 · `qc-pos-p3.5.mts:63` ST2 · `qc-pos-p3.9.mts:107` ST4 · P3.4 ST2 (`:63`, contract additive incl. `offline`) only if it pins exact key sets.
6. U side (P3.6U): `pos-ui-inventory.json` rows; CRM `crm-ui-inventory.json` if `pos-deal-select` testid moves to the new register.
7. Check at merge: `qc-pos-p2.13.mts:1687` RP2 reads `REPORT_KINDS` — `"credit"` must not become a REST kind in P3.6 (R9) · `gen-pos-api-docs --check`.

## 5. CONTROLLER-DECISION items
- **CD-1** Register over-limit PIN field `creditOverride {managerUserId, managerPin}` (separate from the discount `managerPin/managerUserId` pair).
- **CD-2** `createSale` re-verifies `creditOverrideByUserId` (MANAGER/OWNER of the tenant, or a member holding `pos.credit.manage`); a cashier id ⇒ still `CREDIT_LIMIT_EXCEEDED` (CR8). Without it any server caller can bypass the limit with any user id.
- **CD-3** Term precedence with contact `creditTermDays 0` = unset (drift 6). Alternative (0 ⇒ `CREDIT_TERM_ZERO`) breaks every company after the first auto-created contact.
- **CD-4** `CREDIT_LIMIT_EXCEEDED` numbers only to `pos.credit.manage` holders on the register path (R14); `createSale` (server) always carries them.
- **CD-5** CR5 refusal codes are not pinned (any refusal, no sale): mixed tender/short/tip/cashTendered/`POS_DEPOSIT`/no buyer. Pin codes now if wanted (`SPLIT_INVALID`/`PAYMENT_MISMATCH`/`VALIDATION`/`CREDIT_NOT_ALLOWED`).
- **CD-6** Cash-out on a credit bill: `REFUND_METHOD_INVALID` (existing) vs brief's new `REFUND_TENDER_MISMATCH` — oracle accepts both; pick one.
- **CD-7** `bigBillDeal` phase string after P3.6 (`"P3.6"` → `"P3.x"`/automation lane) — oracle only asserts `false`.
- **CD-8** `reportCredit` behaviour is not DB-tested (only names, ST1): its amounts come from aging and the screen is P3.6U/08. Add a DB check if the controller wants R9 numbers pinned in S.
- **CD-9** Exposure = book outstanding by contact **incl. credit notes** + undrained PAID ON_ACCOUNT bills − their refunds (VR5 + CR9 `exposureSatang 600,000`).
- **CD-10** P3.4 `syncOfflineSales` must reject `ON_ACCOUNT` (C-13) — one-line follow-up, not tested here.
- **CD-11** Z2 fingerprints only rows created before the run (other QC4 lanes write concurrently); Z1 covers every temp-tenant table.

## 6. `--list` (47)
`P3.6-CP1 CP2 CP3 CP4 · CR1 CR2 CR3 CR4 CR5 CR6 CR7 CR8 CR9 · AR1 AR2 AR3 AR4 AR5 AR6 · VR1 VR2 VR3 VR4 VR5 VR6 · DL1 DL2 DL3 DL4 DL5 DL6 · CM1 CM2 · MB1 MB2 MB3 MB4 MB5 · PV1 PV2 PV3 · ST1 ST2 ST3 ST4 · Z1 Z2` · X-coverage `X2=6 -=6 X3=5 X4=15 X5=6 X1=5 S=4`.

## 7. Red-before (16 Oct 21:36Z) — `ledger/wo-notes/P3.6-red.txt`
- `--no-db`: 1/4 (ST1 ST2 ST3 red by reason · ST4 green).
- Forced QC4: exit 1 · **6/47** = ST4 MB5 Z1 Z2 green + CM1 CM2 SKIP-with-reason (`pos/staff-commission.ts` absent) · 41 red by reason (missing files/exports; DB has no `ON_ACCOUNT` / `PosCreditAccount` / PosSale columns; order bills carry no member). Fixture notes 6 (all `saveCreditAccount` missing) · pump errors 0 · fetch guard 0 · residue 0 (337 tables × 2 tenants).
- Unforced = SKIPPED (exit 0) with the 5 missing files.
- Typecheck: `env NODE_OPTIONS=--max-old-space-size=8192 ISO_MEM=10500M bash scripts/iso.sh flock -w 1200 /tmp/pos-gate.lock pnpm typecheck` exit 0 (21:33–21:36Z); later small edits (codeOf, pump error text, ST1 `PAY_TYPE_ORDER`/label) re-checked with single-file `tsc -p` in scratch → exit 0.
- Expected must-stay greens: ST4 (pins) · MB5 (register tier discount unchanged) · Z1 Z2.

# P3.6 S builder notes — CRM: บริษัท/วางบิล (ON_ACCOUNT) · ดีล · สมาชิกบนบิลออเดอร์ · tree b · branch `wip/pos-p3.6`

Base `session/pos` b92d5598 (merge 4e43dd57 of 731caa0c) · oracle `scripts/qc-pos-p3.6.mts` (47 checks, CD-P36-O1 LANE_PIN + ownHunks kept) · prompt `ledger/pos-briefs/pos-prompt-accountA-P3.6-BUILD.md`.
Builder session 1 (killed ~13:10Z 21 Oct, cgroup OOM) did steps 1–7; session 2 (resume 13:15Z) committed its 2 dirty files, gates, notes.

## Status / resume
- Steps 1–7 done (commits 4e43dd57 → cfd3b5d2). Step 8 = this file. Step 9 = pre-submit + typecheck (results below).
- Restart: `git -C /root/projects/shark-pos-b log --oneline b92d5598..` · run commands in §Gates. Never run tsx/tsc in-session (5 GB cgroup) — always `scripts/iso.sh`.

## Commits (per step)
- 4e43dd57 merge session/pos 731caa0c (keep-both pos-gates.json p3.8 p3.7 p3.6; facts CRM line)
- (steps 2–3 were committed in the pre-resume WIP, carried by the merge: migrations · schema · scope · POS_MODELS · credit-shared · settings · messages · PAY_TYPE_* · channelOf · facts)
- 6acc51ea step 4 CRM seam + crm-link + refunded main step + hourly sweeper
- 13149859 step 5 credit-actions (+ credit.ts core)
- 09cb419c step 6 register block · REPORT_KINDS credit · account facade aging
- 9559e8e0 step 7 order bills member attach-only
- 5efc21d8 test contract JSON (fitness-pos --update-pos-contract, 4 optional keys)
- eb6f0de3 fix reportCredit scope + register.errors th/en
- 54be4470 / ef216548 / 59228797 ORACLE-EDITs (below)
- cfd3b5d2 fix AR1 credit-bill drain race (advisory xact lock on INVOICE upsert + retry-once on P2002, ON_ACCOUNT bills only)

## Migration (QC4 only)
- `20261219100000_pos_p36_credit_enum` (SET lock_timeout + `ALTER TYPE "PosPayType" ADD VALUE IF NOT EXISTS 'ON_ACCOUNT'`) · `20261219100100_pos_p36_credit` (3 nullable PosSale columns + CREATE TABLE PosCreditAccount + unique (systemId, partyId)).
- QC4 `_prisma_migrations` (read 21 Oct 13:2xZ, newest first): p36_credit ✓ · p36_credit_enum ✓ (both 2026-10-17 07:02) · p34_offline ✓ (10-16 21:48) · p35_staff_commission ✓ (10-16 21:04) · p27_qr_orders · p210_customer_display · p29b ×2 · p25_split · p29_tenders · p26 ×2 — all finished. No re-deploy needed.

## Files / hunks per ruling
- R1/R10/R11 CRM seam: `crm/pos-seam.ts` (new; reads + calls into payments.ts block, no raw SQL/writes) · `crm/index.ts` end hunk `export * as posSeam from "./pos-seam"` · `crm/payments.ts` one marked block (+136 −0: `linkPosSaleIntent`, `netPosSaleRefund`, intent branch in the paid bridge path, refund-won-value netting).
- R2: `pos/crm-link.ts` = only POS importer of `@/lib/modules/crm` (registerCompanySearch · registerMemberCompanies · registerDealOptions · sweepDealIntents · dealOnSaleRefunded).
- R3 `settings-shared.ts` posCreditSettings {enabled:false, requireBuyer:true} · posOrderMemberOnBill (default true).
- R4 `pos/credit.ts` (single writer PosCreditAccount · saveCreditAccount/listCreditAccounts/registerCreditStatus · CD-9 exposure) · `credit-shared.ts` (pure) · `credit-actions.ts` ("use server", async only, no `throw`, boolean assertCan guard) · `core/permissions.ts` `pos.credit.manage` · `core/scope.ts` · `pos-qc-env.mts`.
- R5/R6 `service.ts` CreateSaleInput +4 optional · ON_ACCOUNT block (advisory lock per party, CD-2 override re-check, CD-9 exposure, creditTerms written once) · 6 error codes · PAY_TYPE_ORDER/LABEL_TH · voidSale CREDIT_INVOICE_PAID hunk (R8). Contract JSON additions only.
- `register.ts` one block (regP36: customerPartyId · crmDealId ∈ registerDealOptions else DEAL_INVALID · creditOverride → existing `verifyManagerPin` (PIN_INVALID + failedCount on manager row) · CD-4 masking) + REG_MESSAGE rows + REG_SUBMIT_KEYS. `verifyStaffPin` untouched. `register-shared.ts` input fields · REGISTER_PAY_TYPES · 7 refusal codes + REFUSAL_KEY.
- R7 account-lane code (owner line ACCOUNT): `account/index.ts` additive marked blocks (applyExternalSale `onAccount?` + channel ON_ACCOUNT in sale and refund unions · INVOICE layer · posCreditBook/ExposureParts/InvoicePaid/Aging facade) + **`account/service.ts` one marked block at file end** (upsertPosCreditInvoiceDocument · findPosCreditInvoice · posCreditTermsOfParty · posCreditOpenDocs · posCreditInvoicePaidInTx · posCreditAgingByParty) + 3-line hunk in `findExternalSaleDoc` (credit INVOICE wins so CREDIT_NOTE/void reference it). `pos/account-bridge.ts` channelOf case · company contact/onAccount · retry-once wrapper.
- R8 `refund.ts` + `refund-shared.ts` (credit bill ⇒ one ON_ACCOUNT row, else REFUND_METHOD_INVALID — CD-6).
- R9 `reports.ts` REPORT_KINDS … "credit" + CSV_HEADERS.credit + reportCredit · `report-print-shared.ts` labels (kind map must be total).
- R11 `outbox-consumers.ts` one marked block: `pos.sale.refunded` = bothMain(existing, crm-link.dealOnSaleRefunded) (ruling R11 needs it).
- R10 sweeper: `src/app/api/cron/hourly/route.ts` additive try-block.
- R12 `staff-commission.ts` one P3.6 hunk (skipDealBills).
- R13 `order.ts` member-on-bill block (single `createSale(` call kept — p2.8 ST3).
- R15 messages th/en, facts `pos-integrations.ts` (corporateCredit true,null · bigBillDeal false,"P3.x").

## Deviations (for reviewer)
1. Account document code lives in `account/service.ts` (marked block) because the facade `account/index.ts` must not touch prisma (fitness F5); index.ts only wraps it. Prompt listed only index.ts.
2. `report-print-shared.ts` +3 lines (kind label maps are `Record<ReportKind,…>` — typecheck needs the new kind).
3. `account-bridge.ts` retry-once on P2002 for ON_ACCOUNT bills (concurrent drains of the same `pos.sale.paid`: loser hits the JV idempotency unique; second call sees the posted JV + the locked INVOICE). Other bills call `applyExternalSale` exactly once as before.
4. Bill account contact = company (customerPartyId) is resolved in `account-bridge.ts`, not via the `outbox-consumers.ts:150–170` customer hunk the brief suggested.

## ORACLE-EDITs (own `test(pos)` commits · marker `// ORACLE-EDIT ผู้คุม POS 17 ต.ค. (P3.6 <id>)`)
1. 54be4470 `qc-pos-p1.18.mts:316` I12 — CRM facts `corporateCredit [true,null]` · `bigBillDeal [false,"P3.x"]` (CD-7) · before 79/81 (I12 + ST6) → ST6 fixed in code (eb6f0de3) → after: pre-submit table.
2. ef216548 `qc-pos-p2.12.mts` PD1 — REPORT_KINDS 12 → 13 (+credit · KIND_FN credit = reportCredit) · before 30/33 (ST1 lane pin · ST2 fixed in code · PD1) → after: table.
3. 59228797 `qc-pos-p3.5.mts:666/:678` CM6 — `posStaffCommission({})` default + allowed keys gain `skipDealBills:true` · before 52/55 (ST2 lane pin · ST3 see CD-B6 · CM6) → after: table.
4. `pos-gates.json` `qc-pos-p3.6` forced — already appended (merge 4e43dd57, keep-both with p3.7/p3.8).
5. Controller CD-P36-O1 on `qc-pos-p3.6.mts` (LANE_PIN + ownHunks) kept unchanged.

## Oracle runs (QC4 · forced · P36_PIN=b92d5598)
- red-before at new base (session 1, 12:33Z): 23/47 (3 files missing) · db flags all true (migrations already on QC4).
- 12:55Z (session 1, before cfd3b5d2): 44/47 — AR1 (pump P2002), DL3, PV3.
- 13:2xZ at cfd3b5d2: **45/47** — DL3, PV3 · AR1 green · pump errors 1 (P2002 on a later `pos.sale.paid`, no check reads it after AR1; timing-dependent).
- Probe (untracked copy, deleted; ASCII DL3 labels + PV3 detail): **46/47** — DL3 green ⇒ DL3 red = oracle key defect · PV3 only `account.contact.created` CO1name contact=AC1 (fixture) + CO2name contact=new (account module) · pump errors 0.

## CONTROLLER-DECISION items
- **CD-B1 DL3 oracle key** — `scripts/qc-pos-p3.6.mts:1699–1700`: labels `"D4 ปิดแล้ว"`/`"id มั่ว"` go into `newKey(label)` ⇒ idempotency key with space/Thai ⇒ `regIsIdemKey` (`register.ts:677`, `^[A-Za-z0-9_-]{8,100}$`) refuses `VALIDATION` before the deal check. Code path for D4/junk id = `regP36` → `DEAL_INVALID` (proved by probe: ASCII labels ⇒ DL3 green). Proposed ORACLE-EDIT: `reg(\`dl3-${i}\`, …)` (ASCII label).
- **CD-B2 PV3 scope** — `scripts/qc-pos-p3.6.mts:1948–1952` scans every outbox payload of the temp tenant; `account.contact.created` (account module webhook contract `contactPayload` = `{contactId, code, name, kind, taxId, phone, email}`, `account/events.ts`) carries the company name by design — the oracle's own fixture `findOrCreateCustomerContact` for CO1 (`:1043`) emits it after RUN_START, so PV3 cannot pass for any build. POS/CRM P3.6 payloads (pos.*, crm.*, audit pos.credit.*) are clean (probe). Proposed ORACLE-EDIT: skip `account.contact.*` (or scan only `pos.*`/`crm.*` + audit), with a negative probe (put a name into a `pos.credit.*` audit ⇒ red).
- **CD-B3 qc-pos-p3.5 ST3** — `scripts/qc-pos-p3.5.mts:510` requires `REPORT_KINDS` to end with `"commission"`; P3.6 oracle ST1 requires it to end with `"credit"` (ruling R9). Proposed ORACLE-EDIT: p3.5 ST3 `"commission" ∈ REPORT_KINDS` (not last).
- **CD-B4** account document code placed in `account/service.ts` marked block (F5 forbids prisma in `account/index.ts`) — accept or move.
- **CD-B5** residual intermittent pump P2002 (concurrent product after-commit drain vs oracle pump) on non-AR1 bills; the outbox retries in production. Retry-once is scoped to ON_ACCOUNT bills only to keep other bills byte-identical — widen only if the controller wants.

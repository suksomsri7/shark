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

## Later code commits (session 2)
- 7548315e POS_REFUSAL_HTTP rows ×7 (`pos/api/http-errors.ts`, Record completeness · p2.13 ST6) + regenerated `docs/api/POS-API.md` (deviation: file not on the prompt's list; needed by typecheck + p2.13 ST6, P3.5 precedent).
- 5e39b5eb typecheck fixes: `report-actions.ts` KIND_FN credit (deviation: not on the list; Record<ReportKind>) · `credit.ts` unitAccess Json→string[] · `crm/payments.ts` narrowing inside the P3.6 block.

## Gates (final · head 5e39b5eb · dirty 0 · QC4 · never `export CI`)
- typecheck `env NODE_OPTIONS=--max-old-space-size=8192 ISO_MEM=10500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck`: run 1 at 7548315e exit 2 (3 errors, fixed in 5e39b5eb) · **run 2 at 5e39b5eb exit 0** (14:14:00Z → 14:14:46Z, incremental).
- pre-submit run 1 at 45fc19ca (13:22Z) found p2.13 ST6 (7 codes without POS_REFUSAL_HTTP rows) → fixed. Run 2 (final, logs `/root/pos-runs/presubmit-shark-pos-b-20261021T141504Z`):
```
PRESUBMIT-TABLE head=5e39b5eb tree=/root/projects/shark-pos-b
suite                        exit pass/total     s  failed
wo-qc-pos-p3.6-run1          1    45/47         90  P3.6-DL3,P3.6-PV3
wo-qc-pos-p3.6-run2          1    45/47        149  P3.6-DL3,P3.6-PV3
wo-qc-pos-p3.6-nodb          0    4/4          111  
qc-pos-p1.1                  0    180/180      282  
qc-pos-p1.3                  0    128/128      160  
qc-pos-p1.6                  0    48/48        113  
qc-pos-p1.13                 0    33/33         92  
qc-pos-p1.18                 0    81/81        118  
qc-pos-p2.1                  1    54/55        122  P2.1-S8
qc-pos-p2.7                  1    40/42        112  P2.7-ST1,P2.7-ST3  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-pos-p2.8                  1    58/61        212  P2.8-ST1,P2.8-ST6,P2.8-L2
qc-pos-p2.9                  1    61/62        155  P2.9-L1
qc-pos-p2.9b                 1    52/53        148  P2.9b-L1
qc-pos-p2.10                 1    12/13         32  P2.10-ST2  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-pos-p2.11                 1    32/34         80  P2.11-ST1,P2.11-ST4  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-pos-p2.12                 1    32/33         64  P2.12-ST1  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-pos-p2.13                 1    53/54         78  P2.13-ST5  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-pos-p2.14                 1    59/60         77  P2.14-V2
qc-pos-p3.5                  1    53/55         58  P3.5-ST2,P3.5-ST3  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-pos-p3.4                  1    49/51         85  P3.4-ST1,P3.4-ST2  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-pos-p3.9                  1    47/48         57  P3.9-ST4  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-hf-fu                     1    28/29        112  HF-FU-ST1  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-hf-tx                     0    22/22         25  
qc-hf-fu2                    1    30/31         23  HF-FU2-ST1  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-restaurant-money          0    6/6            4  
qc-shop-refund               0    12/12          5  
qc-hotel-money               0    5/5            4  
qc-ticket-money              0    6/6            4  
qc-subscription-money        0    14/14          4  
qc-account-cpa               0    107/107       12  
qc-crm-c3.3                  0    90/90        536  
qc-account-api-core          0    64/64         12  
qc-account-api-settings      0    0/0            1  
qc-acc-v2-pos-lines          1    65/79          8  PL1.1,PL1.2,PL1.3,PL1.4,PL1.6,PL1.7 … [accepted]
fitness-noenv                0    53/53         12  
fitness-qc4                  0    53/53         14  
fitness-pos                  0    8/8            8  
gen-check                    0    -              1  
PRESUBMIT head=5e39b5eb green=20 red=18 expected-lane-pin=10 unexpected-red=wo-qc-pos-p3.6-run1,wo-qc-pos-p3.6-run2,qc-pos-p2.1,qc-pos-p2.8,qc-pos-p2.9,qc-pos-p2.9b,qc-pos-p2.14,qc-acc-v2-pos-lines · wo: qc-pos-p3.6-run1=45/47 · qc-pos-p3.6-run2=45/47 · qc-pos-p3.6-nodb=4/4 · VERDICT red (16: qc-account-api-settings qc-pos-p2.1 qc-pos-p2.7 qc-pos-p2.8 qc-pos-p2.9 qc-pos-p2.9b qc-pos-p2.10 qc-pos-p2.11 qc-pos-p2.12 qc-pos-p2.13 qc-pos-p2.14 qc-pos-p3.5 qc-pos-p3.4 qc-pos-p3.9 qc-hf-fu qc-hf-fu2)
```

## Reds explained (file:line · failing text)
- Lane pins (controller re-pins at merge): `qc-pos-p2.7.mts:728` ST1 "PosSale ฟิลด์เปลี่ยนจากฐาน" · `:931` ST3 "register.ts ต่างจากฐาน…" · `qc-pos-p2.8.mts:564` ST1 "PosSale ฟิลด์เปลี่ยน (เกิน offlineRef,syncedAt,customerPartyId,crmDealId,creditTerms)" · `:746` ST6 "register.ts/service.ts/pos-sale-contract.json เปลี่ยน" · `:764` L2 "pos-sale-contract.json เปลี่ยน (sha 762e073cd5f8)" · `qc-pos-p2.10.mts:420` ST2 "register-shared/register/service/outbox hunks" · `qc-pos-p2.11.mts:364` ST1 "prisma/ ต่างจากฐาน (p36 migrations)" · `:420` ST4 "ไฟล์เลน A ถูกแตะ: service.ts, account-bridge.ts, outbox-consumers.ts, refund*, register*" · `qc-pos-p2.12.mts:425` ST1 "prisma/ ต่างจากฐาน" · `qc-pos-p2.13.mts:57/:570` ST5 "contract sha 762e073cd5f8 (คาด ba68f669fa21) · prisma/ เปลี่ยน" · `qc-pos-p3.5.mts:443` ST2 "refund-shared.ts/refund.ts มี hunk" · `qc-pos-p3.4.mts:548` ST1 "migration ใหม่อื่น: p36 ×2" · `:605` ST2 "outbox-consumers.ts ไม่ตรงไบต์ · register.ts แก้นอกบล็อก" (P3.4 ST2 pins bytes of outbox-consumers/register, not contract key sets) · `qc-pos-p3.9.mts:486` ST4 "แก้ไฟล์ต้องห้าม: p36 migrations…" · `qc-hf-fu.mts:591` ST1 "prisma เปลี่ยนจากฐาน…" · `qc-hf-fu2.mts:419` ST1 "prisma/ ต่างจากหมุด · outbox-consumers.ts มี hunk".
- Contract re-pins (same class as CD-RP1 of P3.4; tagged unexpected by the script): `qc-pos-p2.1.mts:553–556` S8 (accepted contract sha list) "ฟิลด์ใหม่ = …creditOverrideByUserId,crmDealId,customerPartyId,memberAttachOnly…" · `qc-pos-p2.9.mts:377` L1 "CreateSaleInput.customerPartyId/crmDealId/memberAttachOnly/creditOverrideByUserId ใหม่นอกขอบเขต" · `qc-pos-p2.9b.mts:47` L1 CONTRACT_SHA "actual 762e073cd5f8". New contract sha = `762e073cd5f80eeeb915835ae6b85e5793956facdfe233f90d65484db04dac55` (ba68f669 + 4 optional CreateSaleInput keys).
- Not P3.6: `qc-pos-p2.14.mts:685` V2 "ไม่มีรอบของ /^p3\.?5u/" (`visual-pos.mts` unchanged vs b92d5598 — P3.5U leftover on the tip) · `qc-acc-v2-pos-lines` 65/79 PL1.x/PL10.x = identical failing set to gates117-c (17 Oct tip; seeded QC dataset absent) · `qc-account-api-settings` 0/0 SKIPPED (needs :3215 server = CONTROLLER-RUN).
- Oracle defects: P3.6-DL3 + P3.6-PV3 = CD-B1 / CD-B2 above (probe 46/47 with the DL3 fix).

## U-only handoff list (P3.6U)
- 01/02 company chip + picker sheet (search `registerCompanySearchAction` · from member `registerMemberCompaniesAction` · recent) → `customerPartyId` on submit; buyer prefill from the company (name/taxId/branch) for `requireBuyer`.
- 02 "วางบิล (เครดิตเทอม)" tile (hidden unless `settings.pos.credit.enabled`) + `registerCreditStatusAction` (cashier: sufficient yes/no only; `pos.credit.manage`: limit/exposure/remaining) + over-limit manager PIN sheet → `creditOverride {managerUserId, managerPin}`; refusal keys `pos.register.credit.*`.
- 01 deal select on the new register (port of legacy `pos-deal-select`; `registerDealOptions`) → `crmDealId`; `DEAL_INVALID` refusal.
- 08 report tab "ลูกหนี้" (kind `credit` · `reportCredit` · CSV `CSV_HEADERS.credit`).
- 10/settings "ลูกค้าเครดิต" card (enabled · requireBuyer · credit accounts list/save via `listCreditAccountsAction`/`saveCreditAccountAction`) + `settings.pos.orders.memberOnBill` switch.
- PayDone/receipt "ครบกำหนด <dueDate>" line for ON_ACCOUNT bills; refund sheet forces a single ON_ACCOUNT row on credit bills.
- `pos-ui-inventory.json` rows (ORACLE-EDIT of the U card); CRM `crm-ui-inventory.json` only if `pos-deal-select` testid moves.

## `--state` list for P3.6U (controller shoots · th 3 sizes + en 1440 · owner/cashier)
`01-company-chip` · `01-company-picker-search` · `01-company-picker-member` · `01-deal-select` · `02-tile-on-account` · `02-on-account-sufficient-cashier` · `02-on-account-limit-manager` · `02-over-limit-pin-sheet` · `02-over-limit-wrong-pin` · `02-credit-disabled-hidden` · `07-paydone-due-date` · `12-bill-detail-on-account` · `12-refund-on-account-only` · `08-report-credit-owner` · `08-report-credit-denied` · `10-settings-credit-card` · `10-settings-credit-account-edit` · `10-settings-order-member-on-bill`.

## OP lines (POS-OWNER-PENDING.md — controller pastes)
- §"แจ้งเจ้าของโมดูล ACCOUNT": P3.6 เพิ่มบล็อก `// POS P3.6 ▸ … ◂` (เพิ่มล้วน) ใน `account/index.ts` (applyExternalSale `onAccount?` + ช่อง `ON_ACCOUNT` ทั้งขาย/คืน ⇒ JV Dr 1100 ผู้ติดต่อบริษัท / Cr รายได้+2200 · ใบแจ้งหนี้ INVOICE AWAITING_PAYMENT + dueDate · คืน ⇒ CREDIT_NOTE อ้าง INVOICE · void ⇒ INVOICE VOIDED · facade posCreditBook/posCreditExposureParts/posCreditInvoicePaid/posCreditAging) + บล็อกท้าย `account/service.ts` (upsertPosCreditInvoiceDocument · findPosCreditInvoice · posCreditTermsOfParty · posCreditOpenDocs (CD-9 หักใบลดหนี้) · posCreditInvoicePaidInTx · posCreditAgingByParty) + 3 บรรทัดใน `findExternalSaleDoc` (ใบแจ้งหนี้ของบิลวางบิลมาก่อน) — W16 นักบัญชี: VAT ลงตอนขาย (ค่าปริยาย) หรือ "ใบกำกับตอนรับเงิน" สำหรับบริการ.
- §"CRM": ไฟล์ใหม่ `crm/pos-seam.ts` (companiesForPos · companiesOfParty · linkPosSaleSystem · onPosSaleRefunded — อ่าน/เรียกผ่านภายใน CRM ไม่มี raw SQL) · `crm/index.ts` ท้ายไฟล์ `export * as posSeam from "./pos-seam"` · `crm/payments.ts` บล็อกเดียว +136 −0 (linkPosSaleIntent = linkSaleToDeal ไม่มี actor · netPosSaleRefund แถว POS_REFUND ติดลบ · intent ใน posIntentCount ของสะพาน pos.sale.paid) · ค่าคอมฯ ดีลผ่าน afterPaymentCounted/afterPaymentsReversed เดิม.
- W17 (เจ้าของ): แต้มสมาชิกบนบิลออเดอร์ทุกช่องทางรวม PLATFORM (ราคาแพลตฟอร์ม) — ค่าปริยายเปิด (`memberOnBill` true).

## §fix1 — controller rulings CD-P36-B1..B5 (controller B · 21 Oct 15:1xZ · session/pos 36f2a654)
- **CD-P36-B1** cf886c53 ORACLE-EDIT `scripts/qc-pos-p3.6.mts:1699–1703` DL3: keys = ASCII slugs `dl3-d2` / `dl3-d4-closed` / `dl3-nodeal` (+ RAND via newKey) · Thai labels only in failure text · p3.6 before 45/47 (DL3 PV3) → after 47/47.
- **CD-P36-B2** 07f20ab0 ORACLE-EDIT `scripts/qc-pos-p3.6.mts:1951–1953` PV3: skip only `type` starting `account.contact.` · rest scanned. **Delete-probe** (uncommitted temporary hunk in `pos/service.ts:1212`: `pos.sale.paid` payload + `probeBuyer: taxInvoice.name`, reverted with `git checkout`): forced run 46/47, PV3 red "outbox pos.sale.paid มี QC36d6vq…" (DL3 green) ⇒ PV3 still catches a company name in a POS event. After revert: 47/47.
- **CD-P36-B3** bea8357c ORACLE-EDIT `scripts/qc-pos-p3.5.mts:510–514` ST3: `commission` ∈ REPORT_KINDS and `credit` (if present) after it · p3.5 before 53/55 (ST2 ST3) → after 54/55 (ST2 lane pin only). CM6 edits (59228797) unchanged.
- **CD-P36-B4** accepted — code stays in `account/service.ts`; OP line below.
- **CD-P36-B5** retry stays narrow (ON_ACCOUNT only); follow-up line below.
- Merge 6688d9d7 = origin/session/pos 36f2a654 (clean: p3.5u sweep rows, visual-pos fix, hf-fu/p2.10 re-pins).
- Oracle at 6688d9d7 (QC4 · P36_PIN=b92d5598): forced run1 **47/47** · run2 **47/47** (exit 0 · residue 0 · guard 0 · pump errors 0) · `--no-db` **4/4**.
- Pre-submit (granted extra run · `--set core --also qc-pos-p3.5,qc-pos-p2.12,qc-pos-p2.14,qc-pos-p2.1,qc-pos-p2.9,qc-pos-p2.9b` · logs `/root/pos-runs/presubmit-shark-pos-b-20261021T151851Z`):
```
PRESUBMIT-TABLE head=6688d9d7 tree=/root/projects/shark-pos-b
suite                        exit pass/total     s  failed
qc-pos-p1.1                  0    180/180      311  
qc-pos-p1.3                  0    128/128      277  
qc-pos-p1.6                  0    48/48         82  
qc-pos-p1.18                 0    81/81         63  
qc-pos-p2.1                  1    54/55         88  P2.1-S8
qc-pos-p2.9                  1    61/62        115  P2.9-L1
qc-pos-p2.9b                 1    52/53        156  P2.9b-L1
qc-pos-p2.12                 1    32/33        110  P2.12-ST1  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-pos-p2.14                 0    60/60        115  
qc-pos-p3.5                  1    54/55        158  P3.5-ST2  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-hf-fu                     1    28/29        137  HF-FU-ST1  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-hf-tx                     0    22/22         48  
qc-hf-fu2                    1    30/31         39  HF-FU2-ST1  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
fitness-noenv                0    53/53         13  
fitness-qc4                  0    53/53         13  
fitness-pos                  0    8/8            8  
gen-check                    0    -              1  
PRESUBMIT head=6688d9d7 green=10 red=7 expected-lane-pin=4 unexpected-red=qc-pos-p2.1,qc-pos-p2.9,qc-pos-p2.9b · VERDICT red (7: qc-pos-p2.1 qc-pos-p2.9 qc-pos-p2.9b qc-pos-p2.12 qc-pos-p3.5 qc-hf-fu qc-hf-fu2)
```
- Remaining reds: contract re-pins `qc-pos-p2.1.mts:556` S8 (accepted-sha list) · `qc-pos-p2.9.mts:377` L1 (allowed CreateSaleInput keys) · `qc-pos-p2.9b.mts:47` L1 CONTRACT_SHA → new sha `762e073cd5f80eeeb915835ae6b85e5793956facdfe233f90d65484db04dac55`; lane pins `qc-pos-p2.12.mts:425` ST1 (prisma p36 migrations) · `qc-pos-p3.5.mts:443` ST2 (refund-shared.ts/refund.ts hunks) · `qc-hf-fu.mts:591` ST1 (prisma + pos/service.ts vs c3c52ef1) · `qc-hf-fu2.mts:472` ST1 (prisma · outbox-consumers.ts hunk · contract). Plus the earlier full-set lane pins (p2.7/p2.8/p2.10/p2.11/p2.13 ST5/p3.4/p3.9) not re-run this round.
- Typecheck: once at the final head (this notes commit) — result in the report.

### OP — §"แจ้งเจ้าของโมดูล ACCOUNT" (CD-P36-B4 · B5)
- P3.6 เขียนโค้ดเลนบัญชีเป็นบล็อกเพิ่มล้วน: `src/lib/modules/account/service.ts:5165–5167` (findExternalSaleDoc: ใบแจ้งหนี้ของบิลวางบิลมาก่อน) + `:7286–7476` (บล็อก `POS P3.6 ▸ … ◂`: upsertPosCreditInvoiceDocument (advisory xact lock ต่อ สมุด·บิล) · findPosCreditInvoice · posCreditTermsOfParty · posCreditOpenDocs · posCreditInvoicePaidInTx · posCreditAgingByParty) · `account/index.ts` บล็อก P3.6 (onAccount + ช่อง ON_ACCOUNT ขาย/คืน · facade posCredit*) — facade index.ts แตะ prisma ไม่ได้ (F5) จึงอยู่ service.ts.
- Follow-up (B5): `pos.sale.paid` สองคิวพร้อมกัน (drain หลัง commit ของผลิตภัณฑ์ ซ้อนกับตัวระบาย) ชน unique ของ JV (P2002) เป็นครั้งคราวในบิลทั่วไป — คิวลองใหม่เอง ไม่มีด่านแดง · P3.6 ลองซ้ำ 1 ครั้งเฉพาะบิลวางบิล (`pos/account-bridge.ts` p36RetryOnceOnUnique) · ทางเลือกของเจ้าของโมดูล: ให้ postExternalSale ถือว่า P2002 ของ idempotencyKey = "ลงแล้ว".

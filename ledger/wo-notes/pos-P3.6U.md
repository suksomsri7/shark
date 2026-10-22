# P3.6U builder notes — ลูกค้าองค์กร/วางบิล UI · tree `/root/projects/shark-pos-p11` · branch `wip/pos-p3.6u` · base `origin/session/pos` bfe2c26d

Builder: account B (Opus 5.5) · started 22 Oct 00:18Z (`date -u`) · prompt `ledger/pos-briefs/pos-prompt-accountB-P3.6U-BUILD.md` (CD-P36U-1…12 confirmed + controller additions 00:1xZ / 00:4xZ) · spec `ledger/pos-briefs/pos-spec-P3.6-credit-ui.md`.

## Status / resume
- **DONE (builder) 22 Oct 03:17Z** — steps 1–10 complete · merged `origin/session/pos` (P3.8U 5eabd360 · CD-SKEL-O3) at 39809056 · code head **63747fad** (gates) · notes commit follows · pushed `wip/pos-p3.6u` · **not merged**.
- Next: controller R1 review (focus: writer OWNER-only + jsonb key isolation · no client-side limit math · no client approver filtering · privacy) → QC5 round (`--state` list below).

## Commits (per step)
- `58349485` feat(pos): P3.6U step 1 — messages th/en (credit UI · bills W23 · report denied · settings credit/orders)
- `2d1b0659` test(pos): ORACLE-EDIT qc-pos-p3.6 CS1–CS4 — credit/memberOnBill settings writer (CD-P36U-2) · names table row
- `3add977d` feat(pos): P3.6U step 2 — credit/memberOnBill settings writer pair (CD-P36U-2 · OWNER only · jsonb key isolation)
- `ba64ec0a` feat(pos): P3.6U step 3 — settings cards (credit customers · member on order bills) + page reads · crm-link companyOptionsByPartyIds · inventory rows
- `920fcc6a` feat(pos): P3.6U step 4 — company chip + picker sheet + deal select · register page credit props · inventory rows
- `3391bc3c` feat(pos): P3.6U step 5 — on-account tile + credit status + buyer prefill + over-limit PIN sheet (resubmit same key with creditOverride)
- `ce8ad83e` feat(pos): P3.6U step 6 — PayDone due chip + ON_ACCOUNT label
- `49ec927a` feat(pos): P3.6U step 7 — bills drawer W23 credit invoice label + no separate tax-invoice rows · one-row ON_ACCOUNT refund · void CREDIT_INVOICE_PAID
- `8c5078c2` feat(pos): P3.6U step 8 — report tab corporate receivables (credit) + denied card
- `d8a3b7c1` feat(pos): P3.6U — on-account status data attributes (state/sufficient/remaining) for the visual harness
- `d9ba58a3` test(pos): P3.6U step 9 — visual-pos p3.6u states (20 · owner 15 + cashier 6) · CRM find-or-create (CD-P36U-12 controller 00:4xZ) · credit settings jsonb guard + restore
- `dd02e653` test(pos): P3.6U — pos-visual-sweep.json placeholder rows p3.6u / p3.6u-en (qc-pos-p2.14 V2)
- `ac1fef03` fix(pos): P3.6U — credit switch patch literal keys · cash tile not pressed in on-account mode
- `39809056` merge origin/session/pos (P3.8U 5eabd360 · CD-SKEL-O3) into wip/pos-p3.6u — keep-both: ReportsClient/reports page (creditOn + boardOn) · settings page (credit card + board tab) · visual-pos (P36U + P38U) · inventory/sweep rows re-added
- `63747fad` ledger(pos): P3.6U UI spec (pos-spec-P3.6-credit-ui.md)
- (this notes commit follows)

## Components
- New: `src/components/pos/register/CompanyChip.tsx` (chip + `companySubText`) · `CompanyPickerSheet.tsx` · `DealSelect.tsx` · `CreditOverSheet.tsx` · `src/app/app/sys/[id]/pos/settings/CreditSettingsCard.tsx` · `OrderMemberCard.tsx`.
- Server (CD-P36U-2 · the only new server code): `src/lib/modules/pos/credit-settings.ts` (`updatePosCreditSettings`) · `credit-settings-actions.ts` (`updatePosCreditSettingsAction`) · `crm-link.ts` one marked additive export `companyOptionsByPartyIds` (controller addition).
- Hunks (marked `POS P3.6U ▸ … ◂`): `RegisterScreen.tsx` (imports · `credit` prop · 2 layers · state block · resetBill/lock clearing · savePending/pending strip `creditOverride` · send: lastSendCode + ON_ACCOUNT done chip + CUSTOMER_INVALID/DEAL_INVALID/CREDIT_LIMIT_EXCEEDED · confirmPay company/deal · openers + `creditOverPin` · memberSlot · 2 layer cases · PayDialog `onAccount` · 15A `prefill` · PayDone `creditDue`) · `InterimPayDialog.tsx` (prop `onAccount` · `AnyPayType`/`onAccountRow` · status loader · tile · status column · canConfirm/canSplit/tipAllowed/cash-tile widening) · `PayDone.tsx` · `register/page.tsx` · `BillsClient.tsx` · `bills-ui.tsx` · `ReportsClient.tsx` · `reports/page.tsx` · `settings/page.tsx` · `PaymentSettings.tsx` (slot `creditCard`).
- No edit of `register-shared.ts`/`register*.ts`/`refund*.ts`/`held-cart.ts`/`settings-shared.ts`/`settings-general.ts`/CRM/ACCOUNT modules (`crm-link.ts` = the single allowed hunk).

## Message keys added (th + en · pure additions at the start of each object)
`pos.register.credit.{buyerRequired, buyerMismatch, overLimitSelf, overLimitFigures, clear, recent, searchMin, taxId, headOffice, branchNo, loading, statusLoading, fullDue, pickFirst}` · `pos.bills.drawer.creditInvoice` · `pos.bills.refund.m.{onAccount, onAccountSub}` · `pos.report.credit.denied` · `pos.settings.credit.{ownerOnly, allOff, unknownCompany, searchDenied, termZeroHint, noCrm, accounts, edit, cancel, search, limitUnit, limitRange, termValue, termRange, inactive, noteRange, saved, loading, errors.{PERMISSION_DENIED, VALIDATION, NOT_FOUND, CUSTOMER_INVALID, INTERNAL, UNKNOWN}}` · `pos.settings.orders.{title, memberOnBill, memberOnBillHelp, ownerOnly, failed}`.

## Testids
Register: `pos-reg-company-{pick,open,clear,chip,name,sheet,search,member,row-<n>,empty,close,error}` · `pos-reg-deal-select` · `pos-reg-deal-error` · `pos-reg-paydlg-method-onaccount` · `pos-reg-paydlg-onaccount-{status,reason,buyer-mismatch}` · `pos-reg-credit-over{,-figures,-error,-cancel}` · `pos-reg-done-due`.
Bills: `pos-bills-credit-invoice` · `pos-bills-refund-m-onaccount`. Reports: `pos-reports-tab-credit` (pattern row) · `pos-reports-credit` · `pos-reports-credit-denied`.
Settings: `pos-settings-credit-{card,enabled,require-buyer,owner-only,all-off,switch-error,no-permission,no-crm,row-<partyId>,edit-<partyId>,saved,add,search,search-error,found-<n>,form,limit,term,active,note,save,cancel,error}` · `pos-settings-order-member{,-switch,-help,-owner-only,-error}`.
Inventory (`scripts/pos-ui-inventory.json`): **+23 rows** (13 settings · 9 register · 1 bills; interactive testids only) · visual states **+20** (`--list` 290).

## Deviations per CD
- **CD-P36U-2** — `companyOptionsByPartyIds({tenantId, systemId, partyIds})` takes `tenantId` too (the controller text said `{systemId, partyIds}`; `companiesForPos` needs the tenant and the POS system is checked against it). Writer: patch without `credit` and without `memberOnBill` (or `{}`) ⇒ `VALIDATION` without field (board-settings precedent); `credit: {}` = valid no-op. Audit `before`/`after` = `{section, credit:{enabled, requireBuyer}, memberOnBill}`.
- **CD-P36U-3** — chip/deal render only under the tile's condition `creditUi && online && !offMode` (fix1 F2 · controller ruling); hidden in table mode. Picker rows numbered member rows first, then search/recent rows.
- **CD-P36U-5** — no-company tile is `aria-disabled` (not `disabled`) so the tap opens the picker. The status is read as soon as the dialog has a company (not only after selecting) so `enabled:false` hides / `allowed:false` disables the tile before a tap. Status div carries `data-state` / `data-sufficient` / `data-remaining` (harness). Confirm label unchanged ("ยืนยันรับเงิน ฿X"). Insufficient ⇒ confirm still enabled (server decides → CD-P36U-6).
- **CD-P36U-6** — resubmit through the same `send()` (same key + bytes + `creditOverride`); `creditOverride` is stripped from sessionStorage **and** from the in-memory retry copy (retry after unsure ⇒ `CREDIT_LIMIT_EXCEEDED` ⇒ sheet again). PIN/PERMISSION refusals of the override resubmit stay in the pad (no pay-dialog card). `CREDIT_LIMIT_EXCEEDED` itself opens the sheet without a pay-dialog card.
- **CD-P36U-8** — refund chip is a single fixed choice (`aria-pressed`, no handler); rows built directly; `uncovered`/card-to-cash checks and the reference input are skipped for credit bills. Void `CREDIT_INVOICE_PAID` mapped explicitly to `register.errors.creditInvoicePaid`.
- **CD-P36U-9** — no `pos.report.view` at any unit + `?kind=credit` ⇒ the page renders `pos-reports-credit-denied` instead of `pos-report-refusal`; PERMISSION_DENIED from the server ⇒ the same card in the client.
- **CD-P36U-10** — extra testids listed above (edit/cancel/found/saved/form/search-error/no-permission/no-crm/help/owner-only/error).
- **F15.3** — component tags ending in `Sheet`/`Select` and `onChange` attributes count as interactive without a testid ⇒ RegisterScreen imports `CompanyPickerSheet as CompanyPickerBox`, `DealSelect as DealBox`, `CreditOverSheet as CreditOverBox` and DealSelect's prop is `onDeal` (precedent `DiscountOverSheet as DiscountOverBox`).
- **CD-P36U-12 (controller 22 Oct 00:4xZ)** — QC5 coffee has no CRM system ⇒ the harness find-or-creates one (`system/service.createSystem(T.tenantId, "CRM", "ลูกค้าองค์กร (ภาพ QC P3.6U)")`, prefer an existing active CRM system, kept, never deleted, guard = QC tenant) instead of SKIP; SKIP only on a genuine refusal (printed reason).
- Register page: one extra `prisma.appSystem.count({type:"CRM"})` per load (`hasCrm`).

## Fixtures + guard (visual harness · `scripts/visual-pos.mts` P36U block)
- **Guard** `p36uGuard()` before every settings write: `tenantKey === "coffee"` ∧ `T.slug` starts with `posqc` ∧ `AppSystem(id SYS, tenantId T, type POS)` exists — else `StepError` and the card's states stop. `p36uSetKey` touches only `{pos,credit}` · `{pos,orders,memberOnBill}` (creates `{pos,orders}` only for that key) · `{pos,_qcP36uBefore}`.
- **Settings**: original `credit` / `orders.memberOnBill` remembered once in `settings.pos._qcP36uBefore {credit:{had,v}, memberOnBill:{had,v}}` (a killed run's leftovers are restored from that key) · per state `credit = {enabled: !(hidden|card-off), requireBuyer: buyer-state ∨ settings-*}` · `memberOnBill = true` before the channels state · restored after the last P3.6U job, in `finally` and on SIGINT/SIGTERM/SIGHUP.
- **CRM** (controller 00:4xZ): first **active** CRM system of the QC tenant, else `system/service.createSystem(T.tenantId, "CRM", "ลูกค้าองค์กร (ภาพ QC P3.6U)")` — kept, reused, never deleted. Companies through `crm.companies.createCompany` (find by `note` = `posqc-vis-p36u-co` / `-co2` · names "บริษัท ภาพคิวซี เทรดดิ้ง จำกัด" 0105559360014 / "บริษัท ภาพคิวซี วงเงินน้อย จำกัด" 0105559360022 · branch 00000 · duplicate ⇒ reuse) · QC member contact via `crm.contacts.createContact` with the member's phone (⇒ the member's Party) + `crm.companies.addContact` to `-co` · OPEN deal "สั่งกาแฟประจำเดือน (posqc-vis-p36u-deal)" via `crm.deals.createDeal` on the default pipeline (`createPipeline` only when the system has none). All kept.
- **Credit accounts** via `saveCreditAccount` (single writer): `-co` ฿500,000 · `-co2` ฿1 · termDays 30 · active — skipped when already equal. Kept.
- **Manager** `posqc-coffee-user-p36u-mgr` (User upsert + Membership MANAGER `[unit]` + random 6-digit PIN via `setStaffPin`) only when a credit-over state is planned · before each credit-over state and in cleanup `unlockStaffPin` (failed count) · cleanup deletes the PIN row + Membership.
- **Bill**: `paydone-onaccount-due` presses the real confirm once ⇒ one PAID ON_ACCOUNT bill on `-co` (id recorded) → bills states use `?bill=<id>` (fallback = latest PAID ON_ACCOUNT bill of `-co` within 20 h) · `drainAll()` before bills/reports states (credit INVOICE for W23 + receivables) · cleanup `voidSale(…, reason "ลูกค้าองค์กรยกเลิก (ภาพ QC P3.6U)")` (P2.12U precedent).
- Also `prepTaxInvoiceBook()` (buyer/paydone/bills/reports) and `prepMemberFixture()` (member section) — existing helpers. Fresh browser context per state. No reseed · no snapshot requests · coffee only.
- SKIP-with-reason (`StepError "SKIP — …"`): no company row · member contact not on the member's Party · no deal · tile disabled (book not linked / no term) · no ON_ACCOUNT bill yet · no INVOICE row in the drawer · tax book error.

## `--state` list for the controller's QC5 round (one pass at a time: owner th → cashier th → owner en → cashier en)
Command (controller): `bash scripts/iso.sh bash scripts/qc5.sh … pnpm exec tsx scripts/visual-pos.mts p3.6u --user <u> --states --base <qc5>` (+ `LOCALE=en`). Plan order puts `register` first (paydone feeds the bills states).
- **owner th** (15 states · 43 shots): register-company-chip · register-company-picker-search · register-company-picker-member · register-deal-select · paydlg-onaccount-owner · paydlg-onaccount-buyer · paydlg-onaccount-hidden · paydone-onaccount-due (1440) · bills-drawer-onaccount · bills-refund-onaccount · reports-credit-owner · settings-credit-card-off · settings-credit-card-on · settings-credit-account-invalid · settings-orders-member-on-bill
- **cashier th** (6 · 18 shots): register-company-chip · paydlg-onaccount-cashier · paydlg-credit-over-sheet · paydlg-credit-over-wrong-pin · reports-credit-denied · settings-credit-readonly
- **owner en** (same 15 · 24 shots: 1440 all + 390 register/sales) · **cashier en** (same 6 · 10 shots)
- Money screens 01/02/12 = controller full view at merge (LANE-RULES "เพิ่ม 2").

## Oracle (ORACLE-EDIT CS1–CS4 · `qc-pos-p3.6.mts`)
- `CS1–CS4` appended (own `test(pos)` commit 2d1b0659 · names-table row in `pos-P3.6-oracle.md`).
- **Red-before** (writer absent · tree = 2d1b0659 content · forced · QC4): **48/52** — failed CS1 CS2 CS3 CS4 ("pos/credit-settings.ts ยังไม่มี · MISSING:updatePosCreditSettings") · residue 0.
- **After** (writer 3add977d · forced · QC4): **52/52** · residue 0 · guardHits 0 · pumpErrors 0.
- `pos-oracle-check.sh … qc-pos-p3.6 --base bfe2c26d` → **VERDICT warn** (O3 only: default `PIN` 54913c60 ≠ base — by design, the U card sets `P36_LANE_PIN` only and never `P36_PIN`).

## Gates
- **typecheck** (≤ 2): #1 at ac1fef03 01:01:40–01:05:05Z **EXIT 0** · #2 (final) at **63747fad** 01:49:45–01:51:04Z **EXIT 0** — `env NODE_OPTIONS=--max-old-space-size=8192 ISO_MEM=10500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck`.
- **`visual-pos.mts p3.6u --states --dry`** (CI=1 via iso.sh · after merge): owner th rc 0 (43 shots) · cashier th rc 0 (18) · owner en rc 0 (24) · cashier en rc 0 (10) · `p3.8u --dry` owner rc 0 (32, unchanged) · `--list` rc 0 (302 states).
- **pre-submit** run 1 at ac1fef03 (pre-merge · logs `/root/pos-runs/presubmit-shark-pos-p11-20261022T010522Z` · table regenerated from the logs — the session pipe was cut at 30 min, the unit finished): same as run 2 except `qc-pos-p3-skel` ST3 red (pre-existing `device-id`/`receipt-render` imports of touched client files) → fixed upstream by CD-SKEL-O3 5a07aa73, green after the merge.
- **pre-submit run 2 (final)** — `bash scripts/iso.sh bash scripts/pos-pre-submit.sh /root/projects/shark-pos-p11 --wo qc-pos-p3.6 --env P36_LANE_PIN=bfe2c26d --set core,money --also qc-pos-p1.8,qc-pos-p1.12,qc-pos-p1.13,qc-pos-p1.15,qc-pos-p2.8,qc-pos-p2.9,qc-pos-p2.9b,qc-pos-p2.10,qc-pos-p2.12,qc-pos-p2.14,qc-pos-p3.4,qc-pos-p3.5,qc-pos-p3-skel,qc-hf-reports-authz,qc-hf-pos-page-authz` · logs `/root/pos-runs/presubmit-shark-pos-p11-20261022T015111Z`:
```
PRESUBMIT-TABLE head=63747fad tree=/root/projects/shark-pos-p11
suite                        exit pass/total     s  failed
wo-qc-pos-p3.6-run1          0    52/52        236  
wo-qc-pos-p3.6-run2          0    52/52        182  
wo-qc-pos-p3.6-nodb          0    4/4          162  
qc-pos-p1.1                  0    180/180      196  
qc-pos-p1.3                  0    128/128      160  
qc-pos-p1.6                  0    48/48         88  
qc-pos-p1.8                  0    49/49        100  
qc-pos-p1.12                 0    72/72        162  
qc-pos-p1.13                 0    33/33         55  
qc-pos-p1.15                 0    40/40         48  
qc-pos-p1.18                 0    81/81         61  
qc-pos-p2.8                  0    61/61        103  
qc-pos-p2.9                  0    62/62        229  
qc-pos-p2.9b                 0    53/53        294  
qc-pos-p2.10                 1    12/13        135  P2.10-ST2  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-pos-p2.12                 1    32/33         85  P2.12-ST1  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-pos-p2.14                 0    60/60        293  
qc-pos-p3.5                  0    55/55        230  
qc-pos-p3.4                  1    50/51        148  P3.4-ST2  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-pos-p3-skel               0    41/41        113  
qc-hf-fu                     1    28/29        210  HF-FU-ST1  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-hf-pos-page-authz         0    87/87        110  
qc-hf-reports-authz          0    79/79        174  
qc-hf-tx                     0    22/22        185  
qc-hf-fu2                    1    30/31        283  HF-FU2-ST1  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-restaurant-money          0    6/6          173  
qc-shop-refund               0    12/12        203  
qc-hotel-money               0    5/5          115  
qc-ticket-money              0    6/6          148  
qc-subscription-money        0    14/14        157  
qc-account-cpa               0    107/107       68  
qc-acc-v2-pos-lines          1    65/79         83  PL1.1,PL1.2,PL1.3,PL1.4,PL1.6,PL1.7 … [accepted]
                                  ↳ ❌ PL1.1 เอกสารบิลขายหน้าร้าน 2 ใบ — ได้ 0 · ควรได้ 2
                                  ↳ ❌ PL1.2 บรรทัดรวม 3 บรรทัด — ได้ 0 · ควรได้ 3
                                  ↳ ❌ PL1.3 ทุกบรรทัดผูกทะเบียนสินค้า (productId) — ได้ 0 · ควรได้ 3
fitness-noenv                0    53/53         17  
fitness-qc4                  0    53/53         81  
fitness-pos                  0    8/8           11  
gen-check                    0    -              2  
PRESUBMIT head=63747fad green=30 red=6 expected-lane-pin=5 unexpected-red=qc-acc-v2-pos-lines · wo: qc-pos-p3.6-run1=52/52 · qc-pos-p3.6-run2=52/52 · qc-pos-p3.6-nodb=4/4 · VERDICT red (5: qc-pos-p2.10 qc-pos-p2.12 qc-pos-p3.4 qc-hf-fu qc-hf-fu2)
```
- Reds: expected lane pins (files this card edits) `qc-pos-p2.10.mts:58` ST2 (RegisterScreen/InterimPayDialog hunks outside P2.10 blocks) · `qc-pos-p2.12.mts:40` ST1 (lane-A files RegisterScreen/InterimPayDialog touched) · `qc-hf-fu.mts:41` ST1 (visual-pos · InterimPayDialog · PayDone · BillsClient) · `qc-hf-fu2.mts:40` ST1 (RegisterScreen + hunks without HF-FU2 marker) · `qc-pos-p3.4.mts` ST2 = base red (register.ts/service.ts P3.5/P3.6 S hunks vs 72669941 — identical at 384483ee gates121) · `qc-acc-v2-pos-lines` PL1/PL10 = accepted seeded-data set (as in P3.6 S). `qc-pos-p3.6` ST4 green · `qc-pos-p3-skel` 41/41 · `qc-pos-p1.6` 48/48 (R2 covers `credit-settings-actions.ts`) · p1.18 81 (ST7 0) · p1.3 128 · hf-reports-authz 79 / hf-pos-page-authz 87 = base.

## CONTROLLER-DECISION
- **O3 warn** of `pos-oracle-check.sh` (default `P36_PIN` 54913c60 ≠ base) is by design (U card sets `P36_LANE_PIN` only) — accept.
- **QC5 CRM system** — the harness creates "ลูกค้าองค์กร (ภาพ QC P3.6U)" in coffee when no active CRM system exists and keeps it (+ companies/deal/contact/credit accounts). Confirm keeping these persistent fixtures (they also make the coffee settings payments card show accounts in later rounds).
- **`paydone-onaccount-due` ordering** — the bills states need a PAID ON_ACCOUNT bill: run owner passes with the register page included (plan order register → sales); `--state bills-*` alone falls back to the latest PAID ON_ACCOUNT bill of `-co` within 20 h or SKIPs.
- **INVOICE link in the drawer** depends on the QC account book being linked + drained (`drainAll` before bills/reports states) — SKIP with reason otherwise.
- **Chip/deal offline** — rendered (no-op) while offline; hide them offline? (default: keep).
- **Lane pins** (expected · re-pin at merge): `qc-pos-p2.10` ST2 · `qc-pos-p2.12` ST1 · `qc-hf-fu` ST1 · `qc-hf-fu2` ST1 (+ `qc-pos-p3.4` ST2 = base red, same at 384483ee gates121).

## OP lines (controller pastes into POS-OWNER-PENDING.md)
- §"แจ้งเจ้าของโมดูล CRM": หน้าตั้งค่า POS (แท็บวิธีรับเงิน · ผู้ถือ pos.credit.manage) อ่านชื่อบริษัทของบัญชีเครดิตผ่าน `crm-link.companyOptionsByPartyIds` → `crm.posSeam.companiesForPos({tenantId, partyIds})` ทีละ ≤ 20 (ชื่อ/เลขภาษี/สาขาเท่านั้น) · ตัวเลือกดีลบนหน้าขายใหม่ไม่แสดง/ไม่เก็บมูลค่าดีล (ตัด `valueSatang` ทิ้งที่จอ) · harness ภาพสร้างระบบ CRM "ลูกค้าองค์กร (ภาพ QC P3.6U)" + บริษัท/ดีล/ผู้ติดต่อของภาพในร้าน QC coffee (ผ่านตัวเขียนของ CRM · เก็บไว้ใช้ซ้ำ).
- §"แจ้งเจ้าของโมดูล ACCOUNT": ลิ้นชักบิลของบิลวางบิลติดป้ายเอกสารบัญชีว่า "ใบแจ้งหนี้/ใบกำกับภาษี" (W23 · เอกสาร INVOICE ใบเดียว · ลิงก์ `/account/print/<docId>` เดิม) — หัวเอกสาร/รูปแบบพิมพ์ของใบนั้นเป็นของ ACCOUNT.
- Follow-up S (CD-P36U-7): expose `creditTerms.dueDate` on the submit result, bill detail and receipt payload (PayDone uses the last status read today · receipt/`/d` have no due line).

## Owner-ack (CD-P36U-12 derived frames) + W17
- company chip / picker / deal select · tile + status line + over-limit sheet · PayDone due chip (date from the status read) · bills W23 label and hidden tax-invoice request · report tab "ลูกหนี้ลูกค้าองค์กร" · settings "ลูกค้าเครดิต (วางบิล)" card + "บิลออเดอร์" member-on-bill card · held carts drop company/deal.
- W17 help line (`pos.settings.orders.memberOnBillHelp`): th "ออเดอร์ที่มีสมาชิกได้แต้มทุกช่องทาง รวมบิลราคาแพลตฟอร์ม — แนบอย่างเดียว ไม่ลดราคาระดับสมาชิก" · en "Orders with a member earn points on every channel, including platform-priced bills — attach only, no member tier discount".

## Fix round 1 (controller B R1 = MERGEABLE-AFTER-FIXES · builder 22 Oct 03:45Z `date -u`)
- **F1 (Medium)** `src/components/pos/register/DealSelect.tsx:17-45` — list state keyed by `memberId|customerPartyId`; the chosen deal is reset only when the list for the **current** key loaded OK and lacks it (no reset on mount / before the first reply / on load failure) · 0ca97bac.
- **F2 (Low)** `RegisterScreen.tsx:2754-2769` — company chip + deal select only when `creditUi && online && !offMode` (= the tile, :3038) · 45b0e493.
- **F3 (Low)** `src/lib/modules/pos/credit-settings.ts:40-52` `writeCredit` merges `{enabled, requireBuyer}` into the existing `pos.credit` object (non-object ⇒ `{}`) · e3e3ca13. ORACLE-EDIT a796aca4: CS setup `pos.credit.qcKeep` sentinel + `othersOf` keeps non-writer keys under `pos.credit` + explicit "pos.credit.qcKeep หาย" check. **Red-before** at a796aca4 (old writer · forced · QC4): **51/52** (CS1 "คีย์อื่นเปลี่ยน … pos.credit {}"); after **52/52** (residue 0).
- **F4 (Low)** `scripts/visual-pos.mts` P36U `p36uRemember`/`p36uRestore` — `_qcP36uBefore.ordersHad`; restore removes `{pos,orders}` when it was absent before the run and is now `{}` · d2069f57.
- **Nit** `register/page.tsx:95` · `settings/page.tsx` `hasCrm` counts `active: true` CRM systems · 37e514c3.
- Gates at 37e514c3 (iso.sh · QC4 + POS lock): `qc-pos-p3.6` forced **52/52** (residue 0) · `--no-db` **4/4** · `qc-pos-p1.6` **48/48** · `qc-pos-p1.3` **128/128** · `qc-pos-p1.18` **81/81** · `qc-hf-fu2 --no-db` **22/23** (ST1 = expected lane pin, unchanged) · `pos-oracle-check … --base bfe2c26d` **VERDICT warn** (O3 only, as before) · `visual-pos p3.6u --states --dry` owner th 43 · cashier th 18 · owner en 24 · cashier en 10 (all rc 0) · **typecheck #3** at 37e514c3 03:40:44–03:41:42Z **EXIT 0**.

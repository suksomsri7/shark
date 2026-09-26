# C3.3 — Commissions → payroll
Read `crm-brief-COMMON.md` first. Contract: CRM-RUN §2 "C3.3". Spec: blueprint §5.9 commissions, §11.6, mockup 10 (right), decision C3.

## Facts
HR facade (C0.3): `requestAdjustment(ctx:{tenantId, systemId}, {employeeId, periodKey, kind:"COMMISSION", amountSatang, note, requestedById})` → PENDING `HrPayAdjustment`, decided by HR's own 4-eyes `decideAdjustment` (NOT the central approval engine). `markPaid(ctx, runId)` (`src/lib/modules/hr/payroll.ts:436`) emits NO event today. `employeeOfUser`. Central approval: `submitForApproval(ctx, {entityType, entityId, systemId, amountSatang, requestedById})` → `{autoApproved:true} | {requestId}`; effects in `src/lib/approval-effects.ts` (pattern: dynamic import + `…Approved()` with status-guarded `updateMany`).

## Deliverables
- Rules CRUD (basis PAID default | WON; PCT / FIXED / TIERED; scope pipeline/team/products; `minDealSatang`; `splitCollaboratorsBp`; `payoutDelayDays`).
- `onPaid` (hooked where C2.7 marks a `CrmDealPayment` COUNTED) / `onWon`: matching rules → amounts (partial payment = proportional) → `CrmCommission` PENDING rows protected by the unique key → approval `crm.commission` when `approvalRequired` (or manual approve ≤ `crm._maxCommissionApproveSatang`) → APPROVED → `hr.requestAdjustment` (negative adjustments for reversals) with `crmCommissionId`; user without a linked employee → stays APPROVED "รอผูกพนักงาน".
- NEW HR event `hr.payroll.paid {runId, periodKey}` emitted INSIDE `markPaid` (wrap the guarded update + emit in a transaction; 3 registries) → consumer sets commissions of adjustments in that run to PAID.
- Reversal on payment/document/sale void: PENDING → REJECTED/removed; APPROVED/PAID → REVERSED row (negative) + negative adjustment next period; never edits a closed payroll run.
- Report + UI (rules, pending approvals, "my commissions").

## Acceptance (oracle `qc-crm-c3.3`)
CRM-RUN S1–S8 (30).
X3/X4 (critical): the same payment event ×2 and ×2 in parallel → one commission set; two partial payments in parallel → two proportional rows, exact sum; reverse ×2 → one reversal; approval-approved event replay → one HR adjustment · X2/X1 a STAFF sees only own commissions; MANAGER approves ≤ cap, above → APPROVAL_REQUIRED · X9 approve/reject/rule change audited with reason.
Regressions: `qc-payroll`, `qc-payroll-reverse`, `qc-hr-payadjust`, `qc-hr`, `qc-approval*`, C2.7.

## Addendum (oracle author) — 26 ก.ย. 2569 · `scripts/qc-crm-c3.3.mts` (61 ข้อ = the 30 of CRM-RUN + S0 4 · M 5 · X 21 · CLEAN)

The brief named the features. To judge them against an independent integer answer key, the oracle also had to fix **names, money
formulas, periods, statuses and wiring**. Everything below is **oracle-proposed — controller to confirm**. If the controller rules
differently, ORACLE-EDIT the named check before the builder starts. The oracle lives entirely in throwaway tenants `qc-c33-<rand>-*`
(A = functional · B = foreign · X = races) and reads no seeded row, so a reseed can run beside it. Every expected amount is computed in the
oracle with BigInt from the fixture and printed as an `[arith]` line (never via the service).

1. **Files and names** (S0.1–S0.2). `src/lib/modules/crm/commissions.ts` exports `listRules` · `createRule` · `updateRule` · `onPaid` ·
   `onWon` · `reverse` · `approve` · `reject` · `syncPayroll` · `mine` · `list` · `pending` · `report` (+ optional `approveMany` for "อนุมัติที่เลือก").
   `commissions-shared.ts` is pure and exports `commissionOf(kind, config, totalSatang: bigint): bigint` and
   `COMMISSION_WAITING_LABEL = "รอผูกพนักงาน"`. The facade block is `// CRM C3.3 ▸ export * as commissions from "./commissions" ◂`. The bridge is
   `src/lib/platform/crm-bridges/commissions.ts` (R-D). There is **no migration**: `crm_v2_c` already has everything, and S0.4 fails on any new
   crm/HrPayAdjustment migration.
2. **Signatures**. `ctx = { tenantId, systemId, actorUserId }`. Bridge entries take no actor: `onPaid(ctx, { dealId, refType: "DEAL_PAYMENT", refId })`
   where refId = `CrmDealPayment.id`; the row is **re-read** (same tenant + system + deal, status COUNTED) and its `satang` is the only amount
   trusted, so any amount in the input is ignored (M5). Also `onWon(ctx, { dealId })` · `reverse(ctx, { refId, reason? })` (every commission of that
   payment row) · `syncPayroll(ctx, { userId? }) → { requested }`. Human entries: `approve(ctx, actor, { id, reason? })` · `reject(ctx, actor,
   { id, reason })` (reason ≥ 5 chars, else VALIDATION) · `mine(ctx, actor, f?)` · `list(ctx, actor, f?)` · `pending(ctx, actor)` ·
   `report(ctx, actor, { periodKey })`. Errors carry `.code` ∈ VALIDATION | NOT_FOUND | FORBIDDEN | APPROVAL_REQUIRED | CONFLICT with Thai text.
3. **Rule config JSON** (X9.1): PCT `{ pctBp }` (0–10000) · FIXED `{ fixedSatang ≥ 0, pctBp? }` (mockup 10 "คงที่ ฿150 ต่อดีล + 3%" =
   `{fixedSatang:15000, pctBp:300}`) · TIERED `{ tiers: [{ uptoSatang: number|null, pctBp }] }`, strictly ascending with the last
   `uptoSatang: null`. Also `splitCollaboratorsBp` 0–10000 · `payoutDelayDays` ≥ 0 · `minDealSatang` ≥ 0 | null · kind ∈ PCT/FIXED/TIERED. A bad
   value gets VALIDATION with nothing written. Rule CRUD needs key **`crm.settings.manage`** (owner-only by default · MANAGER and STAFF ⇒
   FORBIDDEN). Audit `crm.commission.rule.create|update` with before/after. A pipelineId of another system ⇒ VALIDATION/NOT_FOUND (X1.3).
4. **Money** (all BigInt satang; S1–S3, M1–M4):
   - basis total **T** = `CrmDeal.wonValueSatang` if > 0, else `valueSatang`. With fake invoices the anchor is 0, so the fixture uses valueSatang.
     *Open: whether T should exclude VAT when real invoices anchor it.*
   - full commission: PCT ⌊T·bp/10⁴⌋ · FIXED fixed + ⌊T·pctBp/10⁴⌋ · **TIERED = MARGINAL** slices (mockup "5% แรก ฿0–500,000 · 8% ส่วนเกิน")
     with **one floor** over Σ slice·bp. Example: T 10,000,100 on [3 % ≤ 1e7, 5 % ≤ 3e7, 7 %] ⇒ 300,005, where a flat reading would give 500,005.
   - **Rounding rule for partial payments = running total**: share = F(before + p) − F(before) with F(x) = ⌊full·min(x,T)/T⌋. The builder takes
     `before` under a per-deal lock from the rows already written for (deal, rule). So Σ shares = full exactly for any order, and each share lies
     in [⌊full·p/T⌋, +1]. Example: T 3,333,333 at 5 % paid 1,111,111 + 2,222,222 ⇒ 55,555 + 111,111 = 166,666, where per-payment floors would
     pay 166,665. Applying the tier rate to each payment separately is wrong (S3.2).
   - **split**: pool = ⌊A·splitBp/10⁴⌋ · each collaborator ⌊pool/N⌋ · owner = A − N·each (the remainder goes to the owner) · the owner listed as a
     collaborator is ignored · applied **per payment share A** · one row per (deal, rule, user, refId).
   - the credited owner is the owner **at payment time** (blueprint §11.6; "at win" could become an optional `settings.crm.commission.creditAt`).
   - `minDealSatang` is inclusive: T < min ⇒ no row. Zero-amount rows are not written.
   - every rule whose scope matches applies (rules stack; `sortOrder` is display order). Scope is AND of `pipelineId` (= deal pipeline) ·
     `teamId` · `productIds`. Only pipeline scope is tested; *team = deal.teamId vs credited user's team, and product matching, are open.*
5. **refType / refId per basis** (R-C.4): PAID ⇒ `refType "DEAL_PAYMENT"`, `refId = CrmDealPayment.id` (any COUNTED refType: PAYMENT ·
   POS_SALE · DOC_SETTLE), `basisSatang` = that payment's satang. WON ⇒ `refType null|"DEAL_WON"`, `refId ''` (C3.0 addendum),
   `basisSatang = T`. **Reversal rows** ⇒ `refType "REVERSAL"`, `refId = original commission id`, `reversedOfId = original id`,
   amount = −original amount, basisSatang = −original basis. The unique (deal, rule, user, refId) therefore makes a second reversal impossible.
   *Open: with refId '' a deal won → reopened → won again cannot earn a new WON commission after the first was reversed. The alternative is
   refId = the WON stage-history row id; the fixture never re-wins.*
6. **periodKey** (Gregorian, C3.2): a commission gets the Thai month of (`countedAt` | WON `enteredAt` of the latest stage-history row into WON)
   + `payoutDelayDays` days. Examples: 25 Sep + 7 d ⇒ "2026-10"; 2026-09-30T17:30Z (1 Oct 00:30 Thai) ⇒ "2026-10" (M2).
   The **HR adjustment period** is the first month ≥ commission.periodKey with **no HrPayrollRun** in that HR system (any status, since
   `createPayrollRun` pulls a period only once).
   The **reversal period** is the first month > base with no run, where base = the original adjustment's period, else the original
   commission's. The reversal row's own `periodKey` is that month.
7. **Approval flow** (S4, S7 · entityType `crm.commission`, R-C.10):
   - creation with `settings.crm.commission.approvalRequired=false` ⇒ APPROVED at once (SYSTEM).
   - creation with `approvalRequired=true` (default) ⇒ `submitForApproval({ entityType:"crm.commission", entityId: commissionId, systemId,
     amountSatang, requestedById: credited user })`. `{requestId}` ⇒ PENDING + `approvalRequestId`. `{autoApproved}` (no chain) ⇒ APPROVED.
   - the chain's `approval.request.approved|rejected` goes to `applyCrmApprovalEffect` → a status-guarded PENDING→APPROVED|REJECTED, retryable
     first step.
   - manual `approve` needs `crm.commission.approve`. The cap is `crm._maxCommissionApproveSatang` from the actor's permissions: **absent =
     unlimited** (permissions.ts hint) · OWNER unlimited · **≤ cap inclusive** · above ⇒ `APPROVAL_REQUIRED` (Thai), with the row unchanged and
     still attached to its request.
   - a manual decision should `cancelRequest` the pending request. A late chain approval never creates a second adjustment (X4.4).
   - *Open: over the cap with NO chain — refuse with APPROVAL_REQUIRED (oracle's lean), or approve like crm.discount does. The fixture always
     has a chain.*
8. **HR hand-off** (S4, X4.5):
   - APPROVED ⇒ `employeeOfUser`. If there is an employee **and `active`** (MASTER-PLAN C0.3 note) ⇒ `hr.requestAdjustment(ctx{tenantId,
     systemId: employee's HR system}, { employeeId, periodKey (item 6), kind:"COMMISSION", amountSatang, note (no customer PII),
     requestedById: approver|null, crmCommissionId })`. It stays HR-PENDING (HR 4-eyes) and the two-way link commission.hrPayAdjustmentId ↔
     adjustment.crmCommissionId is set.
   - no or inactive employee ⇒ stays APPROVED with DTO `payroll: "WAITING_EMPLOYEE"` ("รอผูกพนักงาน").
   - `syncPayroll` picks these up once the link appears (the "ส่ง payroll" button + minute job **`crm.commissions.payroll`** in
     `platform/minute-jobs.ts`). It skips a waiting original that has already been reversed, and its reversal (S5.4).
   - the facade `requestAdjustment` gains `crmCommissionId?` and **refuses a second adjustment for the same commission** (ok:false or throw;
     the partial unique guarantees it).
   - reversals go to HR as kind **DEDUCTION with a positive amount**, because `requestAdjustment` refuses amounts ≤ 0 and the schema says
     "amountSatang บวกเสมอ". That is the brief's "negative adjustment".
9. **Reversal semantics** (S5, X3.3, X4.2). Hook: every COUNTED→REVERSED of a `CrmDealPayment` (reverseDocPayment · reversePosSale ·
   flagDocumentVoided) ⇒ `reverse({refId})`, in-tx or via an event — builder's choice. The oracle delivers all our events.
   - PENDING ⇒ REJECTED (or deleted), with no negative row and no adjustment.
   - APPROVED/PAID ⇒ one REVERSED row + one DEDUCTION in the reversal period (item 6). The original keeps its status.
   - an HrPayrollRun (+ items + its adjustments) is never touched.
   - a DEAL reopened from WON ⇒ the same rule for WON rows (not tested).
   - audit `crm.commission.reverse` with targetId = the original.
10. **`hr.payroll.paid`** (S6, X4.3). `markPaid` wraps the guarded APPROVED→PAID `updateMany` and `emitOutbox(tx, { type:"hr.payroll.paid",
    idempotencyKey:"hr.payroll.paid#<runId>", payload:{ runId, periodKey }, systemId: HR system })` in **one `$transaction`**, and emits only when
    the update claimed the row. The consumer sets APPROVED commissions whose adjustment is in that run to PAID (status-guarded). REVERSED rows are
    untouched and a replay is a no-op. It is read through an HR facade reader (e.g. `adjustmentsOfRun`), never HR tables from CRM.
11. **Events** (S0.3, X8.1): `hr.payroll.paid` + `crm.commission.created|approved|reversed` (blueprint §7.1), each declared **exactly once**
    across the two label files, with consumers in a `// CRM C3.3 ▸` block (notify `commission.status` · reports). Keys are
    `crm.commission.<verb>#<commissionId>`. Payload whitelist: `commissionId, dealId, ruleId, userId, amountSatang, periodKey, status,
    reversedOfId, systemId, hrPayAdjustmentId` — ids and amounts only, never a customer name/phone/e-mail (HR `note` and OpsEvent included).
12. **Reads and scope** (X1, S8):
    - `mine` = the actor's own rows of this system only, for any CRM v2 user (implicit read). `list` needs `crm.commission.view`. `pending` needs
      `crm.commission.approve`.
    - `report` needs `crm.report.view` or `crm.commission.view`. Without commission.view the result is the actor's own row only. Shape:
      `{ periodKey, rows: { userId, pendingSatang, approvedSatang, paidSatang, reversedSatang (negative), netSatang = approved + paid +
      reversed, count (REJECTED excluded) }[], totals }`, ordered net desc then userId, with sums in SQL as bigint (R-E.8; M4 proves 4·10⁹).
    - `CommissionDto.payroll` is one of `WAITING_EMPLOYEE | REQUESTED | PAID | null`, and amounts are numbers.
    - another tenant/system ⇒ NOT_FOUND. uiVersion 1 ⇒ human entries throw CrmV2DisabledError; onPaid/onWon are silent no-ops with nothing written.
13. **UI contract** (S8.2–S8.3, pixel parity stays gate D7):
    - `/crm/settings/commissions` (mockup 10 right: rules + "คอมมิชชันรออนุมัติ"). Guard: type CRM → requireCrmV2Page → crmCan(settings.manage |
      commission.approve) → notFound. testids `crm-commission-{rules,rule-add,rule-row-*,rule-name,rule-basis,rule-kind,rule-save,pending,
      pending-row-*,select-*,approve-selected,send-payroll}`. At least 8 inventory rows (page `/settings/commissions`).
    - `/crm/commissions` ("my commissions", loads through `mine`). testids `crm-commission-{mine,mine-row-*,period,waiting-badge}`. At least
      3 inventory rows (page `/commissions`).
    - nav entries `{ path, status "ready", wo "C3.3" }` for both pages.

### Not decided by the oracle (fixture avoids them — controller to rule if it matters)
- VAT in T (item 4) · `teamId` / `productIds` matching (item 4) · WON re-win refId (item 5) · over the cap without a chain (item 7) · credit
  "at win" option · deals with no owner · overpayment beyond T (capped by F; no row once the full commission is reached).

### Regressions the controller runs with this file
`qc-payroll` · `qc-payroll-reverse` · `qc-hr-payadjust` · `qc-hr` (markPaid now emits in a tx · requestAdjustment gains a param) · `qc-approval*`
(effect branch `crm.commission`) · `qc-crm-c2.7` (the money path now feeds commissions) · `qc-crm-c3.2` · `qc-crm-c1.8` · `qc-crm-c1.5` ·
`qc-crm-v1` · `pnpm fitness` both modes (new facade edge CRM→HR, HR event) · `qc-member-m1.9` (30/15/10/5).

## Controller ruling (26 ก.ย. 2569 · Fable 5.1 · binding — เคาะ addendum 1–13 + open items ก่อน spawn builder C3.3)
- **CONFIRMED ทั้ง 13 ข้อ**: ไฟล์/13 ฟังก์ชัน/`commissions-shared.ts`/สะพาน `crm-bridges/commissions.ts`/ไม่มี migration (1) · ลายเซ็น — `onPaid` อ่านแถวจ่ายซ้ำและเชื่อเฉพาะ satang ในฐาน (2) · config PCT `{pctBp}` · FIXED `{fixedSatang, pctBp?}` · TIERED `{tiers:[{uptoSatang|null, pctBp}]}` แบบขั้นบันได (marginal) · CRUD ต้อง `crm.settings.manage` + audit (3) · เงิน: T = wonValueSatang>0 ? wonValueSatang : valueSatang · TIERED marginal ปัดลงครั้งเดียว · จ่ายบางส่วนใช้ผลรวมสะสม F(x)=⌊full·min(x,T)/T⌋ ใต้ล็อกต่อดีล (ไม่มีสตางค์หาย) · split ปัดลงต่อผู้ร่วม เศษให้เจ้าของ · เครดิตให้เจ้าของ ณ เวลาจ่าย · minDealSatang รวมค่าเท่ากับ · กฎที่ตรงทุกกฎซ้อนกัน (4) · refType/refId: PAID = `DEAL_PAYMENT`/id แถวจ่าย · WON = `''` · reversal = `REVERSAL`/id ต้นทาง + reversedOfId + จำนวนติดลบ (5) · งวด: เดือนไทยของ countedAt/WON + payoutDelayDays · HR = เดือนแรก ≥ ที่ยังไม่มี run · reversal = เดือนแรก > งวดเดิมที่ยังไม่มี run (6) · approval entityType `crm.commission` · approvalRequired ค่าเริ่มต้น true · เพดานจากสิทธิ์ผู้กด (OWNER ไม่จำกัด · ≤ รวมเท่ากับ) · ตัดสินมือยกเลิกคำขอค้าง (7) · HR: จ่ายเฉพาะพนักงาน active ที่ผูกแล้ว · `requestAdjustment` รับ `crmCommissionId` + ปฏิเสธซ้ำ · reversal ส่ง HR เป็น DEDUCTION จำนวนบวก · `syncPayroll` + งานรายนาที `crm.commissions.payroll` (8) · reversal PENDING→REJECTED / APPROVED,PAID→แถว REVERSED + DEDUCTION · ไม่แตะ payroll run (9) · `hr.payroll.paid#<runId>` ใน tx เดียวกับ update ที่มี guard (10) · event 3+1 ประกาศครั้งเดียว (11) · scope อ่าน (12) · UI (13)
- **Open items**: (ก) **VAT ไม่อยู่ใน T** — T คือมูลค่าดีล (ก่อน VAT) · ยอดจ่ายที่รวม VAT ถูกตัดด้วย min(x,T) ⇒ คอมมิชชันไม่เกิน full เสมอ (ข) **scope ทีม/สินค้า**: team = `deal.teamId` ถ้ามี ไม่มีใช้ทีมของเจ้าของดีล ณ เวลาคิด · products = ถ้า CrmDeal มีรายการสินค้า (line items/productIds) ให้ตรงอย่างน้อย 1 รายการ · ถ้าโมเดลดีลไม่มีสินค้าเลย → กฎที่ระบุ productIds ถูกปฏิเสธตอนบันทึก (VALIDATION "ยังไม่รองรับกฎตามสินค้า") ห้ามเงียบ (ค) **WON แล้วเปิดใหม่แล้วชนะซ้ำ**: refId WON คง `''` (ตาม C3.0) ⇒ reopen = reverse คอมมิชชันฐาน WON · ชนะซ้ำ**ไม่**สร้างแถวใหม่อัตโนมัติ (unique กัน) — จดเป็น Q8 ถามเจ้าของ (`CRM-OWNER-QUESTIONS.md`) + แสดงป้าย "เคยจ่ายแล้ว" ในหน้า (ง) **เกินเพดาน + ไม่มีสายอนุมัติ**: คงเป็น PENDING · อนุมัติได้เฉพาะคนที่เพดานพอ (OWNER) · แจ้งเตือน OWNER ผ่าน notifyStaff เรื่อง `commission.pending` ครั้งเดียวต่อแถว (จ) **credit at win**: ไม่ทำ — เครดิตเจ้าของ ณ เวลาจ่าย (ฐาน PAID) / ณ เวลาชนะ (ฐาน WON)
- 🔴 ทำขนานกับ C3.1/C3.2: ไฟล์ร่วม (`index.ts` · `payments.ts` hook · consumers · labels · minute-jobs · nav · inventory · layout) แตะเป็นบล็อกเล็กที่มีป้าย `// CRM C3.3 ▸ … ◂` เท่านั้น · ห้ามแตะ `reports*.ts` `quotas*.ts` `home-data.ts` `views.ts`

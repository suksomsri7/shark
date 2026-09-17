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

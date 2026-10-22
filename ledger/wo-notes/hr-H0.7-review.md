# H0.7 review + security/privacy hunt (22 Oct 2026)
Reviewer/hunter: Opus (read-only on code). Tree `/root/projects/shark-hr-b` · `wip/pos-hr-h0.7` @67ccb076 · diff `564a5900..67ccb076` (oracle excluded) · probe `/tmp/hr-hunt-h07/probe1.mts` (log `probe1.log`) on QC4 via `iso.sh → qc4.sh → with-gate-lock.sh`, own tenant `qc-hunt-h07-<ts>`, swept.

## Verdict: **FIX FIRST**
One MAJOR finding blocks merge: a non-owner can make any employee's leave skip the approval chain. The fix is about 4 lines in `grantStaffAccess` and needs no oracle edit.

Everything else holds or is non-blocking debt:
- R1–R3 and R5–R10 hold.
- R4 holds for the owner's real row.
- The only exceptions are M2, m1 and m2 below.

---

## Findings

### M1 · MAJOR · BLOCKS · Owner-auto approval reachable by a non-owner through "link the owner's account to any employee"
- **Where:**
  - `src/lib/modules/hr/service.ts:516`: owner-auto fires when `isTenantOwner(tenantId, emp.linkedUserId)`.
  - `src/lib/staff/service.ts:340-450`: `grantStaffAccess` lets any `settings.staff.write` holder link an existing account, **including an OWNER's**, to any unlinked employee without a salary profile.
    - Guard (ก) only blocks linking the actor's own account.
    - The existing OWNER membership is reused as-is (`:407`).
- **Attack:**
  1. The owner has no employee row. This is the Q2 case and the normal state of most shops.
  2. A MANAGER, or a STAFF clerk with `settings.staff.write`, calls grant with `email = owner's e-mail` and `employeeId = X`, where X is a plain employee.
  3. The same person (or anyone allowed to file on behalf) files X's leave.
  4. The leave is created APPROVED with no ApprovalRequest, so the policy's approvers (here an OWNER step) never see it.
  5. `decideLeave` would have refused this person directly ("ใบลานี้อยู่ในสายอนุมัติ" / this leave is in the approval chain).
  6. The same link lets the owner-auto cancel path act on X's leaves, and routes the owner's CRM commissions to X (HF-HR-0 R5.6 note).
- **Evidence (probe1.log):**
  ```
  H1.grant(manager→owner account→X1): ok=true
  H1.owner membership after grant: role=OWNER accepted=true
  H1.leave(X1 filed by manager): status=APPROVED decidedById=null approvalRequests=0      (policy = 1 step OWNER)
  H1.audits: hr.employee.link(actor=manager) · hr.leave.owner_auto(actor=manager)
  H1.availability isOnLeave? true
  H2.grant(clerk→owner account→X2): ok=true            (STAFF: settings.staff.write + hr.employee.create, not MANAGER)
  H2.leave(X2 filed by clerk): status=APPROVED approvalRequests=0
  ```
  - Traceable: both audits name the actor.
  - Still a new bypass that H0.7 introduced. Before H0.7, this link existed but every leave went through the chain.
- **Smallest fix:** in `grantStaffAccess` (inside the tx, after `existing` is read, before the link):
  ```ts
  if (existing?.role === "OWNER" && user.id !== input.actorUserId && actor.membership.role !== "OWNER")
    throw new StaffRuleError("บัญชีนี้เป็นของเจ้าของกิจการ — ให้เจ้าของกิจการผูกบัญชีของตัวเอง");
  ```
  (Text: "this account belongs to the business owner — let the owner link their own account".) Optionally also refuse linking an OWNER account to any row when the actor is not that OWNER.
  - No oracle impact: S2 seeds the owner link by raw `hrEmployee.create`.
  - Add one oracle check later: manager→owner-account grant is refused.
  - Alternative: owner-auto only when `linkApprovedById` is that owner. That needs ORACLE-EDIT S2 because the seeded links have a null `linkApprovedById`, so it is not the smaller fix.

### M2 · MAJOR · non-blocking (outside R1–R10 as written) · R4.7 "link before salary" is still open; `linkApprovedById` is written but never read
- **Where:**
  - `linkApprovedById` is set at `staff/service.ts:444` and cleared at `:600`. Nothing in `src` reads it (grep).
  - `privacy.ts:106-117` `loadPayslipForViewer` still trusts `linkedUserId` alone.
  - `payroll.ts:72` `hrSalaryProfile.create` does not re-check an existing link.
- **Scenario:** the one HF-HR-0 R4.7 named.
  1. A MANAGER without `hr.payroll.read` links employee X (no salary yet) to account A. This passes.
  2. Later, a payroll viewer creates X's salary profile.
  3. A now opens X's APPROVED/PAID payslips, and no payroll viewer ever approved the link.
- **Brief §1 premise is inaccurate:** it says "an employee with a salary profile can be linked by anyone". HF-HR-0 round 3 already refused that, and H0.7 only changed the text. So R6 is satisfied literally, but the residual it was meant to close is not.
- **Smallest fix (controller ruling needed, next privacy/payroll WO):** in `loadPayslipForViewer`'s self branch, require `linkApprovedById` to be a current payroll viewer (or OWNER). Legacy null links would then need a one-time re-confirm, which is an owner decision. Alternatively, at salary-profile create on a linked employee whose `linkApprovedById` is not a payroll viewer, null the link approval and require a re-link.

### m1 · MINOR · non-blocking · `cancelLeave` writes in two statements with no tx/lock (COMMON §C.8)
- **Where:** `hr/service.ts:737` `approval.cancelRequest` (PENDING→CANCELLED), then `:748` a guarded leave update.
  - `decideLeave` deliberately allows direct decisions once the only chain is CANCELLED (HF-HR-0 5b exception).
- **Window:** a manager's direct decide between the two writes leaves the request CANCELLED and the leave APPROVED. The requester gets "สถานะใบลาเปลี่ยนไปแล้ว" (the leave's status has already changed).
- **Evidence (interleave reproduced step by step):**
  ```
  H3.interleave: cancelRequest=true · manager direct decide=ok · cancel step2 count=0 ⇒ leave=APPROVED (decidedBy manager=true) · request=CANCELLED
  H3.cancelLeave by requester afterwards: {"ok":false,"reason":"ใบลานี้ตัดสินแล้ว — ยกเลิกเองไม่ได้ …"}
  ```
- **Impact:** a legitimate actor, no privacy or money effect, and a narrow window. "My requests" shows CANCELLED while the leave is APPROVED.
- **Fix:** run both writes in one `tenantDb(ctx).$transaction` under `pg_advisory_xact_lock(hashtextextended('hr-leave:'||id,0))`, with every write on `tx` (cancelRequest has no tx param, so use a guarded `tx.approvalRequest.updateMany`). Take the same lock in `decideLeave`.
- The chain-decider race is safe: `approval.decide` claims with a guarded `updateMany` on PENDING, so cancel gets `CANCEL_DECIDED`.

### m2 · MINOR · non-blocking · F16.6 checks key presence, not value
- `scripts/fitness-hr.mts` `scanLeaveCallsWithoutActor`:
  - It accepts `actorUserId: undefined`, which silently takes the legacy path.
  - It is evaded by an aliased import (`import { requestLeave as rl }`).
  - It flags a spread (`{...input}`). That is a safe false positive.
- Fix: also fail when the initializer is the `undefined` identifier or a `void` expression, and resolve import aliases. Today the only `src` caller (`hr/actions.ts:300`) passes `auth.active.userId`, so the guard is green and correct.

### m3 · MINOR · non-blocking · Prisma drift hazard for the partial unique index
- `HrEmployee_tenantId_linkedUserId_key` exists only in raw SQL (house rule A.7). A future builder diffing with `--from-migrations`/`--from-url` against the schema will be offered `DROP INDEX …`.
- `hr.prisma:80-83` carries a comment. Suggest a fitness static: no later migration drops or alters that index name.

### INFO
- **I1 · R7 `runKind` userId.** Every plan kind now receives the confirmer (kanban/member/CRM get `userId` instead of null).
  - The id comes only from the server session: `ai/actions.ts:196` `auth.user.id` and `api/mobile/plans/confirm/route.ts:24` `g.user.id`. It is never from a body or payload.
  - It always equals the `m` passed, so there is no elevation. CRM `userActor` now has a real user, so its visibility is the confirmer's own.
  - `hr_decide_leave`/`approval_decide` stay blocked (`plans.ts:36-41`, pre-check before claim).
- **I2 · R10.** The HrHub pending **count** card (`hr/ui.tsx:528`), dashboard/analyst/proactive counts stay tenant-wide. They are counts only, no names. `BulkLeaveApprovals` still renders checkboxes for own-rows viewers; decide is refused server-side.
- **I3 · Revoke of the owner-auto leave.** A manager can revoke the owner's auto-approved leave through `decideLeave` APPROVED→REJECTED (no chain, `decidedById` null ≠ "approval-engine"). Product question, not a leak.
- **I4 · Inactive employees.** `employeeOfUser` returns inactive (resigned) rows, so a linked ex-employee with `hr.leave.request` can still file. Pre-existing; `requestLeave` does not check `active`.
- **I5 · Data fix attribution.** R8 maps a legacy request to the employee's **current** linked user, so a request from before a re-link is attributed to the new account. HQ29 found 0 linked employees in prod, so the impact is ~0.
- **I6 · No-op cancel of a leave request.** The generic `cancelMyRequestAction` can still be posted with an HrLeave request id. That cancels the request only and leaves the leave PENDING. It is recoverable because direct decide is allowed after CANCELLED. Pre-existing; the UI now routes leave rows to `cancelLeaveAction`.
- **I7 · Typecheck not run** (builder B5). COMMON §E needs it before merge (controller).
- **I8 · Migration.** Additive: 2 nullable columns plus a partial unique. It is reversible by `DROP INDEX` + 2× `DROP COLUMN`, and there is no down file (repo convention). The non-concurrent index build briefly blocks HrEmployee writes, which is fine for that table size.

## What held
- **R1 migration.** Exactly 3 statements, timestamp ≥ 20261201, pre-check SQL in the header, prod runbook B7. QC4 pre-check was 0 duplicates.
- **R2 requester.**
  - Requester = `linkedUserId ?? actor`.
  - An empty actor with an unlinked employee is refused with the fixed text. Probe H5: `refused: ใบลานี้ยังไม่มีบัญชีผู้ยื่น — ให้ผู้จัดการยื่นแทน` (this leave has no filing account — let a manager file it).
  - The legacy `undefined` path stays for old oracles only (D-1 + F16.6).
  - Employee lookup goes through `tenantDb(ctx)`, scoped to system and tenant, so another system or tenant gives the not-found text.
- **R3 self-binding.**
  - STAFF without `hr.employee.create`/`hr.leave.decide` never reads the posted `employeeId` (`actions.ts:288`). `systemId` is taken from the own row.
  - `employeeOfUser` is tenant-scoped, so a user linked only in another tenant is refused.
  - The actor always comes from the session.
  - No AI or mobile path reaches `requestLeave` (grep: the only `src` caller is `actions.ts:300`).
- **R4.**
  - `isTenantOwner` uses `ctx.tenantId`. An owner of tenant A linked in tenant B as STAFF gets the chain path.
  - No owner self-approval path was added. `decideLeave` R4.1a is unchanged.
  - The audit is ids plus the fixed note.
- **R5 cancel.**
  - Requester only: a manager who is not the requester is refused (H4).
  - A wrong or foreign system gives the not-found text (H4). An empty actor is refused (H4).
  - A decided chain is refused. An owner-auto leave past its start is refused (Bangkok `thaiDateKey`).
  - The approval core withdraws the request through guarded `cancelRequest`. Refusal texts are Thai, with no names and no internals.
- **R6.**
  - The DB partial unique index is the final judge. The P2002 retry plus the `otherLink` text works: H2 first attempt was refused with the 1↔1 text.
  - The salary-profile rule needs `canViewPayroll`.
  - Revoke clears both columns in one tx with the membership revoke. `restoreStaffAccess` does not re-link (intended).
  - `hr.employee.link` audits carry ids only (`{employeeId,userId,approvedById[,unlinked]}`).
- **R7.** Additive 6th positional parameter (existing K3.5 slot). `proposals.ts` is untouched.
- **R8 data fix.**
  - Dry-run is the default. `--apply` runs one tx per tenant with an advisory lock and a guarded `updateMany` (`requestedById = employeeId`), so it is idempotent and safe in parallel.
  - `--tenant` scoping works. Output is counts plus ids only.
  - Error output is code/name only, never `e.message` or the URL.
  - Guards: `HR_FIX_PROD=1` requires `HR_FIX_ENV_FILE` and refuses an inherited `DATABASE_URL`. A prod host without the flag exits 3. The non-prod path runs `loadQcEnv`'s own guard.
- **R9 DTO.** `filedBy` is shown only to `hr.leave.read` viewers and only on filed-on-behalf rows. Staff keys are unchanged. The filer name is read only for ids found in this system's leaves.
- **R10.**
  - Scope is applied in the Prisma `where`, so `take=100` cannot drop the viewer's own row.
  - OWNER/MANAGER/`hr.leave.read`/`hr.leave.decide`/`hr.*` see all rows. Everyone else sees own rows; an empty userId gives 0 rows without a query.
  - AI: an API key gets `[]` (fail-closed). The scheduled system actor (SHOP_AUDIENCE, no user) gets `[]`.
  - Membership is one per (user, tenant) and HR keys are tenant-wide, so a second membership cannot under-filter.
- **Frozen files.**
  - `payroll-rules.ts` sha256 = `75a66c0c…33bf7` (unchanged).
  - `payroll.ts`, the CRM block, `markPaid` and `approval/service.ts` are not in the diff.
  - Shared hot files (`ai/tools.ts`, `ai/plans.ts`) have one marked hunk each. All hunks carry `HR H0.7 … ▸ … ◂` markers.
- **Thai refusal texts.** Fixed, no `e.message`, no other person's name. The exception is the pre-existing grant texts that name the employee to the admin.

## Residue
`[residue] tenants=0 users=0 employees=0 memberships=0`. The sweep covered approval*, hrLeave, hrEmployee, outbox, notification, webhook, audit, membership, appSystem, tenant and users.

## Runtime
- My only DB run was `probe1.mts` in one iso unit, which has finished.
- I did not stop or touch the controller unit `hr-ctl-h07b`, any other unit, or `/tmp/shark-gate-pos.lock`.
- Nothing of mine is running.
- No product code, oracle or notes were edited. This file is the only file I wrote, and it is uncommitted.
- Scratch is in `/tmp/hr-hunt-h07/` (probe + log).

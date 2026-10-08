# T4.2 — AUTO level ("ทำเองได้") (Opus · server + app toggles) 🎯 hunter ×2 lenses (delegation · kinds)
Read `ai-brief-COMMON.md` + RESOLUTIONS R-A9, R-C7, R-E C10/C11/C22/C28/C31 first. Contract: AI-TEAM-RUN §2 T4.2. Design §4.2 (all five rules). Mockups B5/A6 (AUTO option), D6 (limits: ยอดไม่เกิน ฿20,000 · ส่วนลดไม่เกิน 10% · แจ้งฉันทุกครั้ง · ยกเลิกได้ภายใน 10 นาที).

## Verified facts (REVIEW §2.1)
- `executeProposal(m, ctx, id, { confirm2x?, userId? })` `proposals.ts:363`: visibility `:393`, `assertCan(m, KIND_ACCESS[kind])` `:417`, `risk DESTRUCTIVE && !confirm2x → needsSecondConfirm` `:430`, claim `:439`, dispatch `:447`. CRM-door kinds `:379–388` require a human `userId`; `PLAN_HUMAN_ONLY` `plans.ts:36`.
- `propose()` `tools.ts:463` creates the proposal and returns `waiting:"user_confirm"` to the model — the AUTO hook runs **after** `createProposal` returns (same request), and the tool result tells the model `executed:true` when AUTO succeeded so the reply says "ทำแล้ว" instead of "รอคุณอนุมัติ".
- Membership load: `prisma.membership.findFirst({ userId: grantorId, tenantId, acceptedAt: { not: null } })` → `MembershipCtx {role, unitAccess, permissions}` (`rbac.ts:15`).
- `canGrantPermission(actor, module, action)` `rbac.ts:112`; `AI_OWNER_ONLY_KEYS` (T1.2) holds `ai.access.grant`.
- T1.6 `access.ts#setAccess` refuses AUTO; `limits` zod exists; `kind-class.ts#classOfKind`, `amountOfKind` (T1.9).
- T1.1 `AiProposal.autoExecuted`, `AiActionLog`; audit writer; notifications (`notify.ts`).

## Deliverables
Server `src/lib/ai/team/auto.ts`:
- `grantAuto(ctx, aiEmployeeId, skillId, { limits: { maxSatang?, maxDiscountPct?, conditions? }, confirm: true, reason ≥ 5 })` — `assertCan(ai.access.grant)` (OWNER-only key) **and** `canGrantPermission` for every write action of the skill's tools (grantor must hold them) → `AiEmployeeAccess{ level AUTO, limitsJson, grantedById, grantedAt }` + audit `ai.access.grant_auto`; `kindsForSkill(skillId)` ∩ `classOfKind(kind).destructive === false`; if the skill contains only destructive/human-only kinds → refuse `auto_forbidden_kind`.
- `revokeAuto(ctx | system, aiEmployeeId, skillId, reason: "MANUAL"|"GRANTOR_LOST_RIGHTS"|"GRANTOR_LEFT"|"DEMOTED")` → level DRAFT + audit + notify.
- `tryAutoExecute(proposalId) → { executed: boolean, reason? }` — load proposal + task + employee access for `kindAccessOf(kind)`'s skill; require level AUTO, `!classOfKind.destructive`, kind ∉ PLAN_HUMAN_ONLY ∪ CRM-door, `amountOfKind ≤ maxSatang` (null amount ⇒ allowed only when `maxSatang` is null), discount rule when applicable; load grantor's **fresh** membership (none ⇒ revoke + DRAFT), `canSeeTask(grantor)`; `executeProposal(mGrantor, { tenantId }, id, { userId: grantorId })` — **never** `confirm2x`; on `ok` → `autoExecuted=true`, `decidedById=grantorId`, `AiActionLog{ mode AUTO, grantorUserId, undoUntil: now + undoWindowSec }`, audit `ai.auto.<kind>` (actorType USER actorId grantor, after `{ aiEmployeeId, proposalId, amountSatang }`), notify grantor + task starter (`team.auto.executed`, respects prefs); on `needsSecondConfirm` (should be impossible) → treat as not executed + audit `ai.auto.blocked`; on refusal → leave PENDING + notify `team.auto.downgraded` once.
- Hooks: `tools.ts#propose` (after create: `if (ctx.aiEmployeeId) await tryAutoExecute(id)` and adjust the tool result) · scheduled runner (T1.8) `outputMode AUTO` → same hook (the proposal created in the run) · membership change hooks: where staff access/role is updated (`updateStaffAccess` in core) and on membership removal → `revokeAutoByGrantor(userId, tenantId)` (small hunk; name the file).
- Lift the AUTO refusal in `setAccess`/schedule `outputMode` (route through `grantAuto` when level = AUTO).
App: enable the AUTO segment in B5/A6 when `me.viewerRole === OWNER` (and `canGrant` per group from `GET employees/[id]/access` → `canGrantAuto` flags added to the DTO), show the limits sheet (amount, discount %, notify switch, undo window read-only) before saving; D6 accept uses the same sheet (T4.4).

## Files you own
`src/lib/ai/team/auto.ts`, hunks: `src/lib/ai/tools.ts#propose`, `src/lib/ai/team/access.ts`, `schedule.ts`, the staff-access update function + membership removal path (name in notes), `index.ts`; app: `AccessLevelRow` AUTO state + `AutoLimitsSheet`; routes `PUT access` accepting AUTO.

## Acceptance (oracle `qc-ai-t4.2`)
S1 grant rules · S2 iterate `KIND_ACCESS`: no grant ⇒ PENDING; grant ⇒ EXECUTED/autoExecuted (mock dispatch; skip kinds whose dispatch needs real modules by stubbing `dispatch` through a test seam the controller approves) · S3 over limit ⇒ PENDING + notify · S4 grantor lost rights ⇒ PENDING + revoke; grantor left ⇒ all revoked · S5 grantor cannot see task ⇒ PENDING · S6 `confirm2x` never sent (spy) + DB-forced AUTO on destructive ⇒ not executed · S7 X3 10 parallel ⇒ 1 execute · S8 ActionLog/audit/notify · S9 scheduled AUTO · S10 amount from payload only (documented) · S11 no-AUTO tenants = baseline. Regressions: `qc-ai-proposals` `qc-ai-plan` `qc-approval*` `qc-crm-c1.10/c1.11` + account/kanban/member AI suites.

## Controller rulings
- Amount limits are checked against the proposal payload (what will be executed); a dispatch that computes a different final amount is a module bug surfaced by the hunter, not handled here.
- Two hunter lenses after acceptance: L1 delegation (grantor rights, revocation timing, rooms) and L2 kinds (classification gaps, derived kinds, plan steps).

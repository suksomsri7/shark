# 30 · AI TEAM — ทีมพนักงาน AI (SHARK HUB v2) · module contract

> Work order T0.2 · 8 Oct 2026 · **contract, not as-built**: nothing under «src/lib/ai/team/» exists yet. Each function below is built by the work order named next to it; when the code lands, that work order updates this file.
> Files that do not exist yet are written in «…» (repo convention of `ledger/AI-TEAM-RUN.md`); names in backticks are real code of today (checked against `ledger/REVIEW-AI-TEAM-DESIGN-2026-10-08.md` and the files themselves — the code wins over the design).
> Decisions: `ledger/ai-team-briefs/ai-brief-RESOLUTIONS.md` (R-A owner · R-B ownership · R-C contradictions · R-E code rulings C1–C35). Rules: `ledger/ai-team-briefs/ai-brief-COMMON.md` §C.
> Data: `prisma/drafts/ai_team.prisma` (draft, not migrated) · Mobile API: `docs/api/AI-TEAM-MOBILE-API.md` · QC seed: `scripts/seed-ai-team-qc.mts`.

## 1. What this layer is

SME owners hire **AI employees** that work inside the SHARK systems of the shop; people only **order, check and approve**. The knowledge (the working manual) stays with the shop.

«src/lib/ai/team/» is a **layer above the existing AI layer, not a second engine** (COMMON §C1). It reuses, unchanged in meaning:

| Need | Existing code that stays the single implementation |
|---|---|
| propose → a person confirms → execute | `src/lib/ai/proposals.ts` — `createProposal` · `executeProposal(m, ctx, id, opts)` · `rejectProposal` · `KIND_ACCESS` · `DESTRUCTIVE_KINDS` · `kindAccessOf` |
| multi-step plan | `src/lib/ai/plans.ts` — `createPlan` · `executePlan` · `PLAN_HUMAN_ONLY` |
| chat turn / agent loop | `src/lib/ai/service.ts` — `sendMessage(ctx, input, deps)` |
| tool registry, skills, filtering | `src/lib/ai/tools.ts` (`runTool`) · `src/lib/ai/skills.ts` (`SKILLS`, `skillsForTenant`) · `src/lib/ai/tool-access.ts` (`toolVerdict`, `toolsOfferedTo`, `membershipCan`, `actorCanConfirmKind`) |
| identity of a turn | `src/lib/ai/actor.ts` — `aiMemberActor` · `aiSystemActor` (no new actor kind — R-E C13) |
| room visibility | `src/lib/ai/conversation-owner.ts` (pure) · `src/lib/ai/conversations.ts` (`findVisibleConversation`) |
| charging | `src/lib/ai/credit.ts` (`chargeUsage`, `chargeUsageSafe`, `canSpend`, `canSpendPeek`) · `src/lib/ai/pricing.ts` · `src/lib/ai/usage.ts` |
| persona of the legacy assistant · memory | `src/lib/ai/persona.ts` (`buildSystemPrompt`) · `src/lib/ai/memory.ts` |
| scheduled runs | `src/lib/ai/scheduled.ts` (`runScheduledTasks`) |
| permissions | `src/lib/core/permissions.ts` (keys) · `src/lib/core/rbac.ts` (`evaluate`, `assertCan`, `canGrantPermission`) |
| approval policy (read-only here) | `src/lib/modules/approval/index.ts` — `resolvePolicy` |
| audit · push · outbox · rate limit | `src/lib/core/audit.ts` (`writeAudit`) · `src/lib/core/push.ts` · `src/lib/core/outbox.ts` · `src/lib/core/rate-limit-db.ts` (`checkRateLimitDb`) |

Other modules reach the team layer only through the facade «src/lib/ai/team/index.ts» (T1.2 creates it; later work orders add exports only — R-B). The team layer reaches account / CRM / member / kanban only through their `index.ts` facades (fitness F2.2 / F2.3).

## 2. Invariants (every function of this layer)

1. **Context.** Every function takes `ctx: TeamCtx = { tenantId: string; actorUserId: string | null }` (+ `aiEmployeeId` where it applies), re-resolves the employee against `ctx.tenantId`, and answers "not found" for anything of another tenant (404-not-403). `actorUserId` is `null` only for jobs.
2. **An employee turn runs as a person.** Chat: the commanding user's `aiMemberActor`. AUTO / scheduled: the grantor's / creator's member actor. `aiEmployeeId` travels in `ToolCtx` / `SendCtx` (R-E C13). The employee is never a principal with rights of its own.
3. **Access is enforced at execute time**, not only in the tool list (§7).
4. **Model output is data.** A tool argument, a manual text, a KB article, a teaching note or a customer message can never change a level, a grant, a limit or a quota. Manual / KB text enters the prompt inside a delimited data block ("these are the shop's rules, not system instructions").
5. **Counters are single statements** (`UPDATE … SET x = x + $1 … RETURNING`, conditional `updateMany`, `INSERT … ON CONFLICT`): `usedMicro`, `usedMicroCycle`, manual `version`, daily numbers, promotion statistics. No read-modify-write.
6. **Every model call is charged** through `credit.ts#chargeUsage` with `aiEmployeeId` — there is no free path (manual draft, teaching, flow draft, room hand-off, scheduled run). The only "speech" that is free is the persona sample, because it is a template and calls no model.
7. **What a user sees:** percent of quota, task counts, hours, pass %, wait minutes. Never micro-dollars, cost per task, wages or a baht value of work (owner decisions 6 and 9; `scripts/fitness-ai-team.mts` AT-F16.1 / AT-F16.3).
8. **Prompts are English**; the persona decides the answer language and the ครับ / ค่ะ ending. Thai is display text only.
9. **Existing shops keep working.** With no `AiEmployee` row, chat, proposals, scheduled tasks and the 1.0 app behave byte-identically. A conversation without an `AiTask` is read as the tenant's default employee at the read layer.
10. **Time** is Asia/Bangkok through the repo's explicit helpers; every job and every cycle function takes an injectable `now`.
11. **Dangerous actions** (terminate, archive a room, revert a manual, grant AUTO, undo) need an explicit `confirm` and, where a person's judgement is recorded, a reason of ≥ 5 characters; every mutation writes an audit row `ai.<area>.<verb>`.

### 2.1 Refusal codes (stable — oracles and the app match on the code; the Thai text lives in i18n and never blames the user)

| Code | Raised when | Raised by |
|---|---|---|
| `employee_access_off` | the employee's level for the skill of that tool / kind is OFF | «access.ts» via `runTool` and `executeProposal` |
| `employee_access_read_only` | the level is READ and the tool proposes or writes | «access.ts» via `runTool` and `executeProposal` |
| `employee_auto_not_granted` | AUTO was asked for without a valid grant (always before T4.2) | «access.ts» · «auto.ts» · «schedule.ts» |
| `employee_auto_over_limit` | the amount / discount of the proposal is above the grant's limits — the proposal stays PENDING | «auto.ts» |
| `employee_grantor_revoked` | the grantor lost the permission, left the shop or cannot see the room — AUTO falls back to DRAFT | «auto.ts» |
| `employee_paused` | the employee is PAUSED (manual) or TERMINATED | «employees.ts» · «tasks.ts» |
| `employee_quota_cap` | the employee reached `quotaCapPct` of the cycle allowance | «quota.ts» |
| `team_quota_exhausted` | the pack allowance of the cycle is used up (overflow PAUSE) | «quota.ts» |

The list of eight is closed (COMMON §C2). `employee_paused` is the single code for an employee that cannot act — PAUSED **and** TERMINATED alike (there is no separate terminated code). Other refusals named in the API contract (`not_commander`, `cannot_grant_beyond_self`, `auto_forbidden_kind`, `undo_expired`, `not_undoable`, `schedule_limit`, `default_employee_protected`, `already_decided`) are ordinary error codes of single functions.

## 3. Data decisions (the draft is `prisma/drafts/ai_team.prisma`)

- **`AiTask`, not columns (R-E C7).** `AiConversation` gets no column. A task is the side table `AiTask` — 1:1 by `conversationId @unique`, with `aiEmployeeId`, `roomId?`, `status`, `title`, `startedById`, `archivedAt?`. Why: the creator of a conversation is already encoded in its id (`u~<userId>~<hex>`, `conversation-owner.ts`) — a second source of truth would drift; "archived" is not the app's soft delete (`deletedAt`); and `ai.prisma` is a hot file for three lanes. A conversation without a task = the default employee (left join at the read layer, no backfill before T6.1).
- **Foreign keys are named `aiEmployeeId`.** `employeeId` already means an HR person in other tables.
- **`AiSubscription` is global axis, bound to the owner (R-E C2, owner decision 3ข).** Exactly one of `ownerUserId` / `tenantId` is set. FREE rows are keyed by `ownerUserId` — every shop of one owner draws from one allowance. `AiPackBinding` (tenant axis, `tenantId @unique`) is created lazily by `ensureBinding` with a fixed rule: the OWNER membership with the oldest `acceptedAt` (tie → oldest `createdAt`); a shop without an accepted OWNER binds to its own tenant-keyed FREE row. An owner transfer re-binds with an audit row (T3.6).
- **No new `AiCreditSource` value (R-E C35).** Attribution = `AiCreditTxn.aiEmployeeId` + `subscriptionId` (nullable columns of T1.1).
- **No new `ActorType` (R-E C22).** AUTO writes `writeAudit({ actorType: "USER", actorId: grantorId, action: "ai.auto.<kind>", targetType: "AiProposal", targetId, after: { aiEmployeeId, … } })`; `AiActionLog` is the source of the action screen and of undo.
- **`core.prisma` is frozen (R-E C1).** Packs live in `AiSubscription.pack` (`AiPack`); `Tenant.plan` and `planLimits()` are not touched.
- **Tenant-level team settings** are columns on the existing `AiSettings` (R-E C25): `defaultApproverUserId`, `undoWindowSec`, `teamPausedUntil`, and `uiVersion Int @default(1)` (controller ruling 8 Oct). `uiVersion` is **per tenant only**: `GET /api/mobile/me` exposes it per membership and the app mounts the v2 tree for the ACTIVE tenant's value — a tenant at 1 keeps the 1.0 screens even when the same user has another tenant at 2.
- **Never reuse `Team*`** (CRM sales teams of people): AI rooms are `AiRoom*` (R-E C29).

## 4. Files and owners

| File («src/lib/ai/team/…») | Module | Built by | Exports (short) |
|---|---|---|---|
| «index.ts» | facade | T1.2 | re-exports only |
| «employees.ts» | M1 | T1.2 | `createEmployee` `updateEmployee` `pauseEmployee` `resumeEmployee` `terminateEmployee` `getEmployee` `listEmployees` `ensureDefaultEmployee` `employeeOfConversation` |
| «templates.ts» | M1 | T1.3 (+ T4.5 minutes) | `POSITIONS` `positionByKey` `recommendPositions` |
| «persona-prompt.ts» | M1 | T1.4 | `buildEmployeePrompt` `sampleSpeech` |
| «manual.ts» | M5 | T1.5 (+ T4.7) | `MANUAL_SECTIONS` `createVersion` `currentManual` `listVersions` `revertTo` `diffVersions` `draftManualFromText` `attachDocument` `exportManualText` |
| «access.ts» | M4 | T1.6 | `setAccess` `accessMap` `effectiveTools` `accessGroupsForUi` `assertEmployeeMayRun` |
| «kind-class.ts» | M4 | T1.6 | `classOfKind` (pure) |
| «tasks.ts» | M2 | T1.7 | `startTask` `listTasks` `markDone` `archiveTask` `canSeeTask` `frequentTasks` |
| «schedule.ts» | M3 | T1.8 | `createSchedule` `updateSchedule` `setActive` `deleteSchedule` `estimateQuotaPct` |
| «inbox.ts» | M4 | T1.9 | `listPendingForUser` `decide` `countToday` `remindStaleApprovals` |
| «packs.ts» | M6 | T0.4 | `PACKS` `FREE_PACK` `AI_TEAM_SALES_ENABLED` `AI_WELCOME_GRANT` |
| «quota.ts» | M6 | T3.1–T3.3 | `ensureBinding` `ensureCycle` `chargeToPack` `quotaSnapshot` `canRunAi` `resetCycles` |
| «auto.ts» | M4 | T4.2 | `grantAuto` `revokeAuto` `tryAutoExecute` |
| «undo.ts» | M4 | T4.3 | `REVERSIBLE` `undoAction` `listActions` |
| «teach.ts» | M5 | T4.1 | `rejectWithTeaching` `proposeRule` `confirmTeaching` |
| «promotion.ts» | M4 | T4.4 | `statsOf` `evaluatePromotions` `acceptPromotion` `dismissPromotion` |
| «daily.ts» | M8 | T4.5 | `rollupDay` `teamReport` |
| «rooms.ts» | M9 | T5.1 | `createRoom` `updateRoom` `archiveRoom` `listRooms` `suggestHandoffs` |
| «handoff.ts» | M9 | T5.2–T5.3 | `handoffTo` `runFlow` `draftFlowFromHistory` + flow CRUD |

Around the layer: «src/lib/mobile/team-auth.ts» (`requireMobileUser` + `requireTeamMobile`, T1.10) · «src/app/api/mobile/team/» route tree (T1.10 and later) · «src/lib/actions/ai-team.ts» (web server actions, covered by fitness F6 — R-E C32) · «scripts/ai-team-cron.mts» jobs (T1.9 / T3.3 / T4.4 / T4.5).

Shared types used below:

```ts
type TeamCtx = { tenantId: string; actorUserId: string | null };
type AiAccessLevel = "OFF" | "READ" | "DRAFT" | "AUTO";
type Persona = { gender: "MALE" | "FEMALE" | "NONE"; tone: "POLITE" | "FRIENDLY" | "FORMAL"; humor: "NONE" | "LIGHT" | "PLAYFUL"; length: "SHORT" | "MEDIUM" | "DETAILED"; languages: string[] };
type ManualSectionKey = "duties" | "forbidden" | "askWhen" | "steps" | "goodExamples" | "metrics";
type ManualSections = Record<ManualSectionKey, string[]> & { forbiddenReply?: string; notifyOnForbidden?: boolean };
class TeamRefusal extends Error { code: string } // one of §2.1 or a function-level code; `message` is the Thai text
```

## 5. Modules

### M1 — พนักงาน AI (employee · position template · persona)

«employees.ts» (T1.2 · 🎯)

```ts
createEmployee(ctx, input: { name: string; positionKey: string; persona: Persona; quotaCapPct: number; workHours?: WorkHours; commanderUserIds?: string[]; access?: { skillId: string; level: "OFF" | "READ" | "DRAFT" }[]; manual?: { sections: ManualSections; note?: string }; idempotencyKey: string }): Promise<{ id: string; manualVersion: 1 }>
updateEmployee(ctx, id, patch: Partial<{ name; persona; quotaCapPct; workHours; commanderUserIds }>): Promise<void>
pauseEmployee(ctx, id, reason?: string): Promise<void>
resumeEmployee(ctx, id): Promise<void>
terminateEmployee(ctx, id, opts: { confirm: true; reason: string }): Promise<{ archivedTasks: number; stoppedSchedules: number }>
getEmployee(ctx, id): Promise<EmployeeView>
listEmployees(ctx): Promise<(EmployeeView & { liveStatus: "WORKING" | "WAITING_APPROVAL" | "IDLE" | "PAUSED"; openTasks: number; pendingProposals: number; lastActivityAt: Date | null })[]>
ensureDefaultEmployee(tenantId: string): Promise<{ id: string }>
employeeOfConversation(tenantId: string, conversationId: string): Promise<{ id: string; isDefault: boolean } | null>
```

- `name`: 1–60 characters, no HTML → `VALIDATION`. `idempotencyKey` unique per tenant: ten parallel calls create one row.
- **Hiring is one transaction** (controller ruling 8 Oct): the `AiEmployee` row, its `AiEmployeeAccess` rows (from `access`, else the template's default levels — each level passes the same `cannot_grant_beyond_self` / no-AUTO rules as `setAccess`) and manual version 1 (`manual`, else the template's; source HIRE) are written together or not at all. There is no half-hired employee and **no hard delete** of an employee anywhere in this layer.
- Needs `ai.employee.manage` (create / update / pause / terminate) or `ai.employee.read` (get / list; `ai.employee.use` implies read — §9).
- `terminateEmployee`: `confirm` + reason ≥ 5 characters; open `AiTask` → ARCHIVED, the employee's scheduled tasks → `active = false`, rooms stay readable. The default employee refuses (`default_employee_protected`) — it can only be paused.
- `ensureDefaultEmployee`: "ผู้ช่วยทั่วไป", `isDefault = true`, neutral persona, every skill at DRAFT (= today's behaviour). Two calls = one row (partial unique index). Created lazily **at the first read of a legacy conversation / the first legacy chat** of a shop (controller ruling 8 Oct, narrowing R-B "lazily at read time"); T6.1 backfills the rest. `listEmployees` and the list route never create it — otherwise the empty-team screen (A8) could never appear.
- `employeeOfConversation`: `AiTask` by `conversationId`, else the default employee, else `null` (a shop with no employee at all → the legacy path).
- `liveStatus`: PAUSED (status / pauseReason) › WAITING_APPROVAL (a PENDING proposal in one of its task rooms) › WORKING (an OPEN task updated recently) › IDLE.
- Audit: `ai.employee.create|update|pause|resume|terminate`.

«templates.ts» (T1.3)

```ts
type PositionTemplate = { key: "sales" | "chat" | "account" | "content" | "member" | "custom"; labelTh: string; labelEn: string; summaryTh: string; category: string;
  skills: { skillId: string; level: AiAccessLevel }[]; manualEn: ManualSections; manualTh: ManualSections;
  frequentTasks: { icon: string; titleTh: string; hintTh: string; prompt: string; estimatedMinutes: number }[]; sampleSpeechTh: string; defaultQuotaCapPct: number; orbColor: string };
POSITIONS: PositionTemplate[]
positionByKey(key: string): PositionTemplate | null
recommendPositions(tenantId: string): Promise<{ key: string; reasonTh: string; signal: string }[]>
```

- Only skills that surface through `skillsForTenant(AppSystem.type)`: sales · account · members · crm · tasks · chat · knowledge · memory · approvals · automation (R-E C30). AT-F16.2 checks every `skillId` against `src/lib/ai/skills.ts`.
- No default level AUTO. Money and customer-facing skills default to DRAFT; read-only ones to READ.
- `manualEn` is what the model reads (no Thai characters); `manualTh` is display only. `estimatedMinutes` are fixed constants per frequent task (hours saved are never derived from model timing — R-B).
- `recommendPositions` reads this tenant only, through the owning facades: customer chats waiting, open invoices, no post for 7 days.

«persona-prompt.ts» (T1.4)

```ts
buildEmployeePrompt(input: { tenantName: string; employee: { name: string; positionKey: string; persona: Persona }; manual: ManualSections; attachedText?: string; systems: string[]; memories?: string; dna?: string; promptTweaks?: string; language: string }): string
sampleSpeech(persona: Persona, positionKey: string, name: string): string
```

- English instructions; gender MALE ⇒ the ครับ rule, FEMALE ⇒ ค่ะ, NONE ⇒ neutral; "answer in <language>". The manual and the attached text sit in delimited data blocks (invariant 4).
- `service.ts` picks this builder only when the conversation has an `AiTask`; otherwise `buildSystemPrompt` of `persona.ts` — byte-identical for old rooms. The default employee moves to the new builder behind the flag `AI_TEAM_PROMPT_DEFAULT_EMPLOYEE` (off until T6.1).
- `sampleSpeech` is a template — it calls no model and is therefore the one thing in this layer that is not charged.
- The full prompt never appears in a DTO, an audit row (hash only: `ai.prompt.version`) or an outbox payload.

### M2 — งาน (task = one conversation bound to one employee)

«tasks.ts» (T1.7 · 🎯)

```ts
startTask(ctx, aiEmployeeId: string, input: { title?: string; firstMessage?: string; idempotencyKey: string }): Promise<{ taskId: string; conversationId: string }>
listTasks(ctx, aiEmployeeId: string, filter: "ALL" | "WAITING" | "WORKING" | "DONE" | "ARCHIVED"): Promise<TaskView[]>
markDone(ctx, taskId: string): Promise<void>
archiveTask(ctx, taskId: string): Promise<void>
canSeeTask(tenantId: string, userId: string, conversationId: string): Promise<boolean>
frequentTasks(ctx, aiEmployeeId: string): Promise<{ icon: string; title: string; hint: string; prompt: string }[]>
```

- Conversation id tag `e~<aiEmployeeId>~<hex>` — added to `conversation-owner.ts` as a pure tag (no DB there). The DB-backed visibility lives here: `canSeeTask` = the starter ∪ the employee's commanders ∪ users who may confirm a kind that is pending in the room (`membershipCan`) (R-E C8). `findVisibleConversation` and `executeProposal` call it for `e~` rooms; `u~` / `k~` / `s~` rooms keep today's rules (the C5.5-G2 closure stays closed).
- Commanders: `AiEmployee.commanderUserIds`; empty = everyone with `ai.employee.use`. Checked on `startTask` **and on every `sendMessage`** → `not_commander`.
- Stored status is OPEN / DONE / ARCHIVED. WAITING (a PENDING proposal exists) and WORKING are computed.
- `frequentTasks` = the template's list + the three most repeated recent titles.
- Refusals: `employee_paused` (paused or terminated), `employee_quota_cap`, `team_quota_exhausted`, `not_commander`.
- Customer chat text is never copied into a team table (X8).

### M3 — งานประจำ (recurring task)

«schedule.ts» + the extended `src/lib/ai/scheduled.ts` (T1.8 — R-E C12)

```ts
createSchedule(ctx, input: { aiEmployeeId: string; title: string; instruction: string; frequency: "DAILY" | "WEEKLY" | "MONTHLY"; days: number[]; minuteOfDay: number; channels: ("APP" | "LINE" | "EMAIL")[]; outputMode: "DRAFT" | "AUTO" }): Promise<{ id: string }>
updateSchedule(ctx, id, patch): Promise<void>
setActive(ctx, id, active: boolean): Promise<void>
deleteSchedule(ctx, id): Promise<void>
estimateQuotaPct(aiEmployeeId: string, frequency: "DAILY" | "WEEKLY" | "MONTHLY", runsPerMonth: number): Promise<number>
runScheduledTasks(now?: Date, deps?): Promise<number> // existing export of scheduled.ts, extended
```

- Needs `ai.schedule.manage` + commander of the employee. Limit per tenant = the pack's `maxScheduled` → `schedule_limit`.
- A run **claims first** (`updateMany` where `lastRunDay ≠ today` and `claimedAt` null or older than 15 minutes), writes `lastRunDay` after. Two overlapping crons = one run, one charge.
- An employee-bound run = `sendMessage` as `aiMemberActor(createdById)` ∩ the employee's access, in an `e~` task room. A run that needs to write produces a **proposal** (DRAFT) like a chat turn (R-C2); `outputMode: "AUTO"` is refused until T4.2 (`employee_auto_not_granted`) and then goes through the same delegation check.
- Legacy tasks (no employee) keep the system actor; the `writesNow` leak of that actor (`remember_fact`, `forget_fact`, `support_open_case`) is closed in the same work order.
- The creator lost the right or left the shop → the next run is skipped, the task is switched off and the owner is told.
- At quota exhaustion a due run is recorded as skipped and runs once after the reset (T3.3).

### M4 — สิทธิ์ · อนุมัติ · บันทึก (access · inbox · AUTO · undo · promotion)

«access.ts» + «kind-class.ts» (T1.6 · 🎯)

```ts
setAccess(ctx, aiEmployeeId: string, skillId: string, level: AiAccessLevel, limits?: AutoLimits): Promise<void>
accessMap(aiEmployeeId: string): Promise<Record<string, AiAccessLevel>>
effectiveTools(employee: { id: string }, actor: AiActor, toolNames: string[]): Promise<string[]>
accessGroupsForUi(ctx, aiEmployeeId: string): Promise<{ skillId: string; label: string; icon: string; level: AiAccessLevel }[]>
classOfKind(kind: string): { destructive: boolean; money: boolean; customerFacing: boolean; reversible: boolean } // pure
```

- One row per employee × skill (`AiEmployeeAccess`); core tools map to the virtual skill `core` (memory / knowledge writes follow that level).
- OFF = the skill is not offered and every dispatch / execute is refused. READ = tools marked `action`, `writesNow` or danger are cut. DRAFT = today's behaviour (a person confirms). AUTO → `employee_auto_not_granted` until T4.2.
- The setter needs `ai.employee.manage` and must himself hold the module permission of the skill (`canGrantPermission`) → `cannot_grant_beyond_self`.
- The effective tool list is always (employee level) ∩ (rights of the commanding user): an employee at DRAFT still offers nothing from a module the commander cannot use (X2).
- `classOfKind` (R-E C11): derived from `DESTRUCTIVE_KINDS` + the op's module (`account.*` = money; `crm.*` send / e-mail, `member.*` campaign / notify and chat send = customer-facing) + a hand table for the 36 static kinds. Unknown kind ⇒ money + customer-facing, never reversible (fail-closed). "Every kind" oracles iterate `KIND_ACCESS`, never a hand list (R-E C28).
- A shop with no employee has no third enforcement layer at all (byte-identical).

«inbox.ts» (T1.9)

```ts
listPendingForUser(userId: string, opts?: { tenantId?: string; filter?: "ALL" | "MONEY" | "CUSTOMER" | "POST" }): Promise<InboxItem[]>
decide(ctx, userId: string, proposalId: string, decision: "APPROVE" | "REJECT", opts?: { note?: string; edits?: object; confirm2x?: boolean }): Promise<{ ok: boolean; status: string; note: string; needsSecondConfirm?: boolean }>
countToday(userId: string, tenantId: string): Promise<{ approved: number; rejected: number }>
remindStaleApprovals(now: Date): Promise<number> // job, lease-claimed
```

- Cross-tenant: every tenant the user is an accepted member of. A row appears only if, **with that tenant's membership**, the user passes `membershipCan(kind)` and `canSeeTask`. The active tenant of the app plays no role.
- `decide` = the existing `executeProposal` / `rejectProposal` + `decidedById` / `decidedAt` + an `AiActionLog` row (mode DRAFT). No `ApprovalRequest` is created for AI work — the proposal path is the approval (R-E C9).
- `needsOwner` comes from `resolvePolicy(ctx, { entityType: "ai.<kind>", amountSatang })`, read-only; the 4-hour reminder and the escalation to the owner use the tenant's policy / `AiSettings`, not constants.
- Approvers may lack `ai.chat.send` (R-E C33). Summaries show a short customer name only — no phone, no e-mail (X8).

«auto.ts» (T4.2 · 🎯 — the most careful change of the run; R-E C10 / C11)

```ts
grantAuto(ctx, aiEmployeeId: string, target: { skillId: string } | { kind: string }, limits: AutoLimits, opts: { confirm: true; reason: string }): Promise<void>
revokeAuto(ctx, aiEmployeeId: string, target, reason: "MANUAL" | "DEMOTED" | "GRANTOR_REVOKED"): Promise<void>
tryAutoExecute(proposalId: string): Promise<{ executed: boolean; code?: string }>
type AutoLimits = { maxSatang?: number; maxDiscountPct?: number; conditions?: Record<string, unknown> };
```

AUTO executor rules:

1. AUTO is a **delegation by a person**: the row carries `grantedById` + limits. The grantor must be OWNER or hold `ai.access.grant`, and must hold the kind's own permission (`canGrantPermission`) — nobody delegates what he lacks.
2. Kinds that are DESTRUCTIVE (`classOfKind(kind).destructive`), `PLAN_HUMAN_ONLY` kinds and CRM-door kinds are **never AUTO** — refused at grant time (`auto_forbidden_kind`) and again at execute time.
3. `tryAutoExecute` runs after a proposal is created: level AUTO for the kind → limits against the payload amount (`employee_auto_over_limit`) → load the grantor's **fresh** `Membership` (`acceptedAt ≠ null`) → the grantor must see the room (`canSeeTask`) → `executeProposal(mGrantor, ctx, id, { userId: grantorId })`. **`confirm2x` is never passed** — a DESTRUCTIVE row that slipped through therefore stops at `needsSecondConfirm`.
4. Any failure (no grant, over the limit, grantor revoked / gone / blind to the room) leaves the proposal **PENDING** for a person and sends a notice. Nothing is skipped silently.
5. Success → `AiProposal.autoExecuted = true`, `AiActionLog` (mode AUTO, `undoUntil`), audit `ai.auto.<kind>` (actor = the grantor, R-E C22), notification to grantor and commanders.
6. A grantor leaving the shop revokes every AUTO he granted. Ten parallel `tryAutoExecute` of one proposal execute once (the claim inside `executeProposal`).

«undo.ts» (T4.3)

```ts
REVERSIBLE: Record<string, (ctx, log) => Promise<string>> // explicit inverse per kind, through the owning facade
undoAction(ctx, userId: string, actionLogId: string, opts: { reason: string }): Promise<{ undoneAt: Date; note: string }>
listActions(ctx, opts: { filter: "ALL" | "CUSTOMER" | "MONEY" | "EDIT"; days?: number; aiEmployeeId?: string }): Promise<ActionView[]>
```

- Only kinds with a registered inverse have an undo button (R-E C23). Inside `undoUntil` (window = `AiSettings.undoWindowSec`, default 600) → else `undo_expired`. Needs `ai.action.undo` (R-C10). Two parallel undos call the inverse once.

«promotion.ts» (T4.4)

```ts
statsOf(aiEmployeeId: string, kind: string): Promise<{ last50: { approvedUnedited: number; edited: number; rejected: number }; pct: number }> // one SQL statement
evaluatePromotions(now: Date): Promise<{ offered: number; demoted: number }> // job, lease-claimed
acceptPromotion(ctx, userId: string, offerId: string, limits: AutoLimits, opts: { confirm: true; reason: string }): Promise<void>
dismissPromotion(ctx, offerId: string): Promise<void>
```

- Offer AUTO at ≥ 95 % unedited over the last 50 tasks of (employee × kind), at most one offer per 30 days; demote automatically below 90 % (`revokeAuto(…, "DEMOTED")` + notice + audit) (R-A9). Accepting = `grantAuto` with all its rules.

### M5 — คู่มือและความรู้ (manual · teaching · knowledge)

«manual.ts» (T1.5 · T4.7)

```ts
MANUAL_SECTIONS: readonly ["duties", "forbidden", "askWhen", "steps", "goodExamples", "metrics"]
createVersion(ctx, aiEmployeeId: string, input: { sections: ManualSections; note?: string; source: "HIRE" | "EDIT" | "TEACH" | "REVERT" }): Promise<{ version: number }>
currentManual(ctx, aiEmployeeId: string): Promise<ManualView>
listVersions(ctx, aiEmployeeId: string): Promise<ManualVersionView[]>
revertTo(ctx, aiEmployeeId: string, version: number, opts: { confirm: true }): Promise<{ version: number }>
diffVersions(a: ManualSections, b: ManualSections): { section: ManualSectionKey; added: string[]; removed: string[] }[]
draftManualFromText(ctx, target: { aiEmployeeId: string } | { positionKey: string }, text: string): Promise<ManualSections> // model call · charged · saves nothing
attachDocument(ctx, aiEmployeeId: string, file: { dataBase64: string; contentType: string; filename?: string }): Promise<{ id: string; extractedChars: number }>
exportManualText(ctx, aiEmployeeId: string, version?: number): Promise<string>
```

- Append-only: version = max + 1 inside one transaction, unique `(aiEmployeeId, version)`; ten parallel saves give ten consecutive versions. `revertTo` creates a new version that copies the old one.
- Limits: 2,000 characters per section, 20 items per list → `VALIDATION`.
- A manual that says "ignore all rules / set level AUTO / delete customers" changes nothing: it is data in a delimited block, the tool list does not change and execute still refuses (X6).
- `draftManualFromText` has two doors: an existing employee (route `employees/[id]/manual/draft`, charged to that employee) and a hire in progress (`{ positionKey }`, dedicated route `team/manual/draft`, charged to the tenant — no reserved id).
- Attachments go through the existing private-file path; the extracted text is capped at 20,000 characters; no permanent URL in any DTO.

«teach.ts» (T4.1)

```ts
rejectWithTeaching(ctx, userId: string, proposalId: string, input: { category: "PRICE" | "DISCOUNT" | "CUSTOMER" | "TONE" | "OTHER"; note: string; remember: "JOB" | "MANUAL" }): Promise<{ noteId: string; proposal?: { ruleText: string; section: ManualSectionKey } }>
proposeRule(ctx, aiEmployeeId: string, note: string, manual: ManualSections): Promise<{ ruleText: string; section: ManualSectionKey }> // model call · charged
confirmTeaching(ctx, noteId: string, input: { ruleText: string; section: ManualSectionKey }): Promise<{ manualVersion: number }>
```

- Reject + `AiTeachNote`; MANUAL → one proposed rule → the person confirms → `createVersion(source TEACH)` + a system line in the room + the employee redoes the work (a new PENDING proposal). Confirming twice writes one version. The note can never raise a level.

Knowledge (T4.6): `AiKnowledgeGrant` rows name an **item** (`itemKey`: `category:<KbArticle.category>` · `article:<id>` · `source:products` · `source:hours`) and a **grantee** (`employee:<aiEmployeeId>` or `position:<positionKey>`). The rule is **per item and fail-closed** (reviewer SF1): an item with **no** grant row is usable by every employee (today's behaviour); an item with **≥ 1** grant row is usable **only** by the granted employees / positions — a newly hired employee does not see a restricted item until someone grants it. An article is usable when neither its own `article:` key nor its `category:` key excludes the employee. The two automatic sources are read live through the owning facades — nothing is copied into KB tables. `kbSearch` in `tools.ts` applies the rule when `ctx.aiEmployeeId` is set, **before** results reach the prompt; without an employee = today's behaviour (R-E C14).

### M6 — แพ็กและโควตา (pack · quota)

«packs.ts» (T0.4) — `PACKS` (FREE · STARTER 490 · PRO 1,490 · BUSINESS 3,990; only FREE `enabled`), `FREE_PACK` (`allowanceMicro`, `maxScheduled`, `maxApprovers`, `historyDays`, `approxTasks` = null until the T0.1 cost table), flags `AI_TEAM_SALES_ENABLED = false`, `AI_WELCOME_GRANT = false`. Nobody duplicates these constants.

«quota.ts» (T3.1 · 🎯 · T3.2 · T3.3 · 🎯)

```ts
ensureBinding(tenantId: string): Promise<{ subscriptionId: string; ownerUserId: string | null }>
ensureCycle(subscriptionId: string, now: Date): Promise<{ cycleKey: string; cycleStart: Date; cycleEnd: Date }>
chargeToPack(tx, input: { subscriptionId: string; aiEmployeeId?: string; micro: number }): Promise<{ packMicro: number; overflowMicro: number }> // ONE statement
quotaSnapshot(tenantId: string): Promise<{ pct: number; cycleEnd: Date; state: "OK" | "WARN80" | "WARN95" | "EXHAUSTED" | "PAUSED"; perEmployee: { id: string; pct: number }[] }>
canRunAi(tenantId: string, opts?: { aiEmployeeId?: string }): Promise<boolean>
resetCycles(now: Date): Promise<number> // job, lease-claimed, idempotent per cycle key
```

- The split happens in `credit.ts#chargeUsage` only (R-E C5): inside the transaction of the `AiCreditTxn` row, the pack counter first (`UPDATE "AiSubscription" SET "usedMicro" = LEAST(…) … RETURNING`), the wallet only for overflow WALLET (flag off in 2.0). The 17 callers of `chargeUsageSafe` do not change. `SUPPORT_DRAFT` stays platform-paid.
- `canSpend` / `canSpendPeek` keep their names and become wrappers of `canRunAi` (pack allowance left, or overflow WALLET and wallet > 0) — R-E C3. Degrade to the fast model is driven by pack % (≥ 95 %), not by the wallet balance.
- Per-employee cap: a conditional update before the model call; over the cap → `pauseReason = QUOTA_CAP` + `employee_quota_cap`; others keep working; one notice per cycle.
- Exhausted → every employee of the subscription pauses (`teamPausedUntil` on each bound shop), refused work is remembered (`AiTask.waitingQuotaAt`, skipped scheduled runs) and resumes after `resetCycles`; notices at 80 / 95 / 100 % once per cycle.
- `quotaSnapshot` and every DTO carry percentages only.
- The legacy 5-hour / weekly window (`AiUsageWindow`) is dead code today — left alone, not built on (R-E C4); the daily net `AiUsage` stays.

### M7 — โครงแอป (app shell · notifications · roles)

Server side: `memberships[].uiVersion` on `GET /api/mobile/me` (per tenant; the v2 tree mounts only while the active tenant is at 2), the team-route wrapper `requireTeamMobile` in «src/lib/mobile/team-auth.ts» (a tenant the caller is not a member of answers 404 on team routes; `requireMobile` itself is untouched), `GET …/team/search` (A1: employees + visible tasks + CRM customer names only for callers with CRM read), `GET …/team/summary` (`viewerRole` OWNER / APPROVER / MEMBER computed from real rights), `AiNotifyPref` (user × tenant: five events, three channels, quiet hours — R-E C24), `GET …/team/people`. Push uses the existing senders with deep links in `data.link`. App side (lane B): Airy theme tokens light / dark, header with the business switcher, no bottom tab bar, menu from the profile avatar, first-run screens, approver view. Details: `docs/api/AI-TEAM-MOBILE-API.md` §2–§3.

### M8 — ผลงาน (performance)

«daily.ts» (T4.5)

```ts
rollupDay(tenantId: string, day: string): Promise<number> // job · idempotent upsert of AiEmployeeDaily per employee × day
teamReport(ctx, month: string): Promise<{ hours: number; tasks: number; passPct: number | null; avgWaitMin: number | null; quotaPct: number; vsPrevPct: number | null; perEmployee: EmployeeReportRow[]; needsManual: { aiEmployeeId: string; rejectedPct: number }[] }>
```

- Hours = Σ `estimatedMinutes` of finished tasks (constants of «templates.ts»); unknown kinds count 0. **No wages, no baht value of work** anywhere (owner decision 9) — AT-F16.3 scans the report DTO for money keys. `needsManual` = rejected > 15 %.

### M9 — ห้องแผนก (rooms · hand-off · flows)

«rooms.ts» (T5.1) · «handoff.ts» (T5.2 · 🎯 · T5.3)

```ts
createRoom(ctx, input: { name: string; memberIds: string[]; leadId: string; commanderUserIds?: string[] }): Promise<{ id: string }>
updateRoom(ctx, id, patch): Promise<void>
archiveRoom(ctx, id, opts: { confirm: true }): Promise<void>
listRooms(ctx): Promise<RoomView[]>
suggestHandoffs(tenantId: string): Promise<{ fromId: string; toId: string; times: number }[]>
handoffTo(ctx, taskId: string, toAiEmployeeId: string, input: { brief: string; attachments?: string[] }): Promise<void>
runFlow(flowId: string, triggerPayload: { eventId?: string; note?: string }): Promise<{ taskId: string }>
draftFlowFromHistory(ctx, roomId: string): Promise<FlowDraft> // model call · charged
```

- **A room never widens anyone's rights (X2):** each turn runs with the persona, manual and access of the employee holding it (`AiTask.currentAiEmployeeId`) ∩ the commander's rights, and is charged to that employee. Empty room commander list = the users who may command every member.
- Hand-offs are task → task, asynchronous (R-E C27); `AiPlan` stays a single-room plan. A step that needs approval stops and waits; a failure stops and asks the commander — no step is skipped. At most 8 hand-offs / 20 turns per task.
- Flow steps with mode AUTO are lowered to DRAFT unless the employee holds a real AUTO grant for that kind.

## 6. Events

- **T1–T4 emit no outbox event.** (The AI layer emits none today either.)
- **T5.3 adds one: `ai.flow.triggered`** — emitted inside the transaction that accepts a trigger for a flow; payload = ids only (`flowId`, `roomId`, source event id — no prompt, no model text, no PII). The same work order adds the consumer in `src/lib/outbox-consumers.ts` (→ `runFlow`, idempotent per source event × flow), exactly one label (`src/lib/automation/labels.ts` or `src/lib/webhooks/labels.ts`), and a replay-twice + twice-in-parallel oracle. Triggers themselves are existing event types from an allow-list (for example `crm.deal.won`).

## 7. Where access is enforced (R-E C15)

| # | Point | What it does | Refusal |
|---|---|---|---|
| 1 | `service.ts` — where skills / tools are offered (today line 176, `toolsOfferedTo`) | `effectiveTools`: the model only sees (employee level) ∩ (commander's rights) | not offered |
| 2 | `tools.ts#runTool` — dispatch | re-checks the level for the tool's skill; a model that names a tool outside its level gets a refusal, never the tool | `employee_access_off` · `employee_access_read_only` |
| 3 | `proposals.ts#executeProposal` — confirm time | re-checks that the employee's access for the kind is not OFF / READ **now** (a proposal created before the level was lowered is refused), then the existing `assertCan` of the person who confirms | `employee_access_off` · `employee_access_read_only` |
| 4 | «auto.ts»`#tryAutoExecute` (T4.2) | grant + limits + grantor's fresh membership + grantor sees the room; never `confirm2x` | `employee_auto_not_granted` · `employee_auto_over_limit` · `employee_grantor_revoked` |
| 5 | «quota.ts» before every model call | pack allowance and the per-employee cap | `team_quota_exhausted` · `employee_quota_cap` |
| 6 | «tasks.ts» on start and on every send | status of the employee and the commander list | `employee_paused` · `not_commander` |

## 8. Paths that call a model (each one charges — X11)

| Path | Source on `AiCreditTxn` | Charged to |
|---|---|---|
| a turn in a task room (`sendMessage`) | `CHAT` | the task's employee (`currentAiEmployeeId` in a room) |
| a scheduled run | `SCHEDULED` | the schedule's employee |
| `draftManualFromText` | `CHAT` | the employee (hire draft: the tenant, no employee yet) |
| `proposeRule` (teaching) | `CHAT` | the employee being taught |
| `draftFlowFromHistory` | `CHAT` | the room's lead |
| a redo after teaching / a hand-off turn | `CHAT` | the employee holding the turn |

No new `AiCreditSource` value (R-E C35). `sampleSpeech`, `recommendPositions`, `suggestHandoffs`, `statsOf`, `rollupDay` call no model.

## 9. Permissions (module `ai` of `src/lib/core/permissions.ts` — T1.2 registers the new keys with Thai labels, R-E C31)

`ai.chat.send` and `ai.schedule.create` exist today. New: `ai.employee.read` · `ai.employee.manage` · `ai.employee.use` (**implies `ai.employee.read`** — whoever may order an employee may see the team; one rule in T1.2's permission check, not a second stored key) · `ai.access.grant` (OWNER-only, pattern `CRM_OWNER_ONLY_KEYS`) · `ai.schedule.manage` · `ai.action.undo` · `ai.room.manage`. Granting AUTO also passes `canGrantPermission`. Who may approve a proposal is decided by the kind's own module permission, never by an `ai.*` key.

## 10. Jobs («scripts/ai-team-cron.mts» + the existing hourly cron)

| Job | Built by | Claim | Idempotent per |
|---|---|---|---|
| `runScheduledTasks(now)` | T1.8 | `claimedAt` lease 15 min | task × Bangkok day |
| `remindStaleApprovals(now)` | T1.9 | lease | proposal × reminder stage (4 h → remind once → owner once) |
| `resetCycles(now)` | T3.3 | lease | subscription × cycle key |
| `evaluatePromotions(now)` | T4.4 | lease | employee × kind × 30 days |
| `rollupDay(tenantId, day)` | T4.5 | lease | employee × day (upsert) |

Every job is exercised by its oracle as two overlapping runs plus a simulated crash after the claim, with an injected `now` (`scripts/ai-team-qc-env.mts` — `withInjectedNow`).

## 11. QC data

`scripts/seed-ai-team-qc.mts` (find-or-create, QC4 only) leaves three shops: **AT-1** (owner, approver MANAGER, staff with `ai.employee.use`; ACCOUNT / CRM / CHAT / MEMBER / KANBAN; 24 CRM contacts, 6 deals, 3 open invoices, 3 customer chats waiting, 6 members, 5 KB articles, an approval policy at 20,000 baht), **AT-2** (same owner — shared FREE pack, cross-tenant inbox) and **AT-X** (another owner — isolation). Oracles resolve ids with `atIds()` of `scripts/ai-team-qc-env.mts` and declare the header marker `requires: ai-team-seed`. **Ages drift:** the seed stamps dates once, relative to its first run, and never re-stamps them — oracles never assert on `lastActivityAt`, `stageEnteredAt`, due dates or "quiet for N days" of seed rows; a check that needs a point in time creates its own rows or injects the clock with `withInjectedNow`.

## 12. Rulings of 8 Oct on the points this work order raised (source: last section of `ledger/ai-team-briefs/ai-brief-T0.2.md`)

1. `AiSettings.uiVersion Int @default(1)` joins the "T1.1 adds" list; exposed per membership only (§3).
2. Hiring is one transaction inside `createEmployee` / `POST …/team/employees`; there is no delete route (changes T2.9 S6 — the controller updates that brief).
3. `GET …/team/tasks/[id]` and `POST …/team/employees/[id]/manual/attach` are part of the route list.
4. A hire-time manual draft has its own route `POST …/team/manual/draft` (charged to the tenant).
5. The default employee is created at the first legacy-conversation read / first legacy chat, never by the list route (the controller writes the T1.2 addendum).
6. A non-member tenant on a team route answers 404 through `requireTeamMobile`.
7. Knowledge grants are per item and fail-closed; `ai.employee.use` implies read; `employee_paused` is the only "cannot act" code.

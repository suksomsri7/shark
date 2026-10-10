# T1.2 — AI employee CRUD + the default "ผู้ช่วยทั่วไป" (Opus · server lane) 🎯 hunter after acceptance
Read `ai-brief-COMMON.md` + RESOLUTIONS R-A6, R-B (default employee), R-E C7/C13/C31 first. Contract: AI-TEAM-RUN §2 T1.2. Design: DESIGN §3 M1, §4.1 last paragraph (existing shops keep working). Mockups A1 (status line per employee), B7 (pause/terminate).

## Verified facts
- Permissions: `src/lib/core/permissions.ts` `MODULE_DEFS` `:88`, module `ai` at `:659–667` has only `ai.chat.send`, `ai.schedule.create`. Check = `assertCan(m, {module, action})` `src/lib/core/rbac.ts:140` (OWNER passes all; STAFF needs `permissions[key] === true`). Owner-only key pattern `CRM_OWNER_ONLY_KEYS` `:741`.
- Audit writer `writeAudit({tenantId, actorId?, actorType?="USER", action, targetType?, targetId?, before?, after?})` `src/lib/core/audit.ts:15`.
- Conversation ownership is embedded in the id (`u~<userId>~`, `k~`, `s~`); `conversationCreatorOf(id)` `conversation-owner.ts:161`. Conversations without an `AiTask` row are **read as the default employee** (C7) — the join lives in your `employeeOfConversation`, nothing in conversation-owner.ts.
- Web server actions must live in `src/lib/actions/ai-team.ts` to be scanned by fitness F6 (C32); use `requireTenant()` `context.ts:41` + `assertCan`.
- Skills list `SKILLS` `src/lib/ai/skills.ts:51` (20 ids) — the default employee's access rows are created by **T1.6** (`accessMap` falls back to DRAFT for every skill when no row exists); in this WO store nothing about access.

## Deliverables (`src/lib/ai/team/employees.ts` + `index.ts`)
- `type TeamCtx = { tenantId: string; actorUserId: string }` (shared across the team layer; put in `src/lib/ai/team/ctx.ts`).
- `createEmployee(ctx, input: { name, positionKey, persona: Persona, quotaCapPct?, commanderUserIds?, workHours?, idempotencyKey? }) → { id }` — `assertCan(ai.employee.manage)`; name 1–60 chars, trimmed, no control chars/HTML; `positionKey` must exist in `templates.ts` (T1.3 — until merged, accept any non-empty key and note); idempotency via `@@unique([tenantId, idempotencyKey])` catch P2002 → return existing; `templateSnapshot` = the template at hire time (T1.3 fills it); audit `ai.employee.create`.
- `updateEmployee(ctx, id, patch)` (name/persona/quotaCapPct 5–100/commanderUserIds ⊆ tenant members with accepted membership/workHours) · `pauseEmployee(ctx, id, {reason})` (`status PAUSED`, `pauseReason MANUAL`) · `resumeEmployee` (clears MANUAL only; QUOTA_CAP/TEAM_QUOTA cleared by T3.x) · `terminateEmployee(ctx, id, {confirm: true, reason ≥ 5 chars})` → in one tx: status TERMINATED + terminatedAt, `AiTask` OPEN → ARCHIVED, `AiScheduledTask.active=false` where `aiEmployeeId`, audit; refuses for `isDefault`.
- `getEmployee(ctx, id)` (404-pattern: `findFirst({ id, tenantId })` → null) · `listEmployees(ctx) → EmployeeRow[]` with `liveStatus` computed in one query: `PAUSED` if status ≠ ACTIVE, else `WAITING_APPROVAL` if any `AiProposal PENDING` in its tasks, else `WORKING` if any `AiTask OPEN` updated in the last 30 min, else `IDLE`; plus `openTasks`, `pendingProposals`, `lastActivityAt`, `nextScheduledAt` (from `AiScheduledTask`).
- `ensureDefaultEmployee(tenantId) → AiEmployee` — find `isDefault` or create ("ผู้ช่วยทั่วไป", positionKey `general`, neutral persona, quotaCapPct 100, commanderUserIds []), idempotent under P2002 (add `@@unique([tenantId, isDefault])`? Prisma cannot do partial unique → use a raw partial unique index in **T1.1's migration** if not already there; otherwise serialise with `pg_advisory_xact_lock(hashtext('ai-default-'||tenantId))`).
- `employeeOfConversation(tenantId, conversationId) → { employee, task: AiTask | null }` (task row or default).
- Permissions: add to `MODULE_DEFS` module `ai`: `ai.employee.read` ("ดูพนักงาน AI"), `ai.employee.manage` ("จ้าง/แก้/พัก/เลิกจ้างพนักงาน AI"), `ai.employee.use` ("สั่งงานพนักงาน AI"), `ai.access.grant` ("มอบสิทธิ์ทำเองได้" — OWNER-only via the `CRM_OWNER_ONLY_KEYS` pattern, generalised to an `AI_OWNER_ONLY_KEYS` set), `ai.schedule.manage`, `ai.action.undo`, `ai.room.manage`. Thai labels. `updateStaffAccess` validation picks them up automatically (verify).
- `src/lib/actions/ai-team.ts`: server actions wrapping the above for the web (web UI itself is out of scope — the app is the UI; the web gets a minimal list page later in T6.3 notes).
- `src/lib/ai/team/index.ts` facade exporting only what other code needs.

## Files you own
`src/lib/ai/team/{ctx,employees,index}.ts`, `src/lib/actions/ai-team.ts`, hunk in `src/lib/core/permissions.ts` (module `ai` block only; POS edits the `pos` block — record overlap), optional raw index in T1.1's migration **only if T1.1 is not yet accepted** (otherwise serialise with the advisory lock).

## Acceptance (oracle `qc-ai-t1.2`)
S1 CRUD + validation · S2 idempotency race ×10 → 1 · S3 pause/resume/terminate rules · S4 default employee idempotent + conversation fallback + cannot terminate · S5 permissions (at-staff refused, at-nid allowed) · S6 X1 cross-tenant 404 · S7 audit rows · S8 no-employee tenants behave as baseline (`sendMessage` mock unchanged) · S9 liveStatus matrix (seed tasks/proposals) · S10 residue. Regressions: `qc-ai-tools` `qc-ai-proposals` `qc-mobile-chat`.

## Controller rulings
- `commanderUserIds = []` means "anyone in the tenant with `ai.employee.use`" (R-E C8 / T1.7).
- `quotaCapPct` default from the template (T1.3) else 25.
- Hunter lens after acceptance: tenant isolation + permission escalation through `updateEmployee.commanderUserIds` (can a STAFF add themselves?) — answer must be no unless they hold `ai.employee.manage`.

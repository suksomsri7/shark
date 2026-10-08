# T1.7 — Tasks = rooms bound to an employee + commanders + visibility (Opus · server lane) 🎯 hunter (visibility)
Read `ai-brief-COMMON.md` + RESOLUTIONS R-E C7/C8/C13 first. Contract: AI-TEAM-RUN §2 T1.7. This WO edits the file that closed leak C5.5-G2 — **every** regression in COMMON §E + REVIEW §10 runs. Mockups A3 (task groups), A4 (start), A5 (room header: avatar stack = AI + people who can command it).

## Verified facts (REVIEW §2.0 conversation-owner.ts, §2.1)
- `conversation-owner.ts` (173 lines, **no DB imports**): `ConvCtx {tenantId; actor}` `:35`, `sightOf(ctx)` `:49`, `sightOfConfirmer(m, userId)` `:58`, `newConversationId(ctx)` `:63` (`u~<userId>~<hex>` / `k~` / `s~`), `canSeeConversationId(s, id)` `:70`, `visibleConversationWhere(s)` `:81`, `conversationCreatorOf(id)` `:161`. Rule: creator only; OWNER sees non-member rooms (legacy cuid, `k~`, `s~`); other members' `u~` rooms are invisible even to OWNER (`:12–20`).
- `conversations.ts`: `findVisibleConversation(ctx, id)` `:9`, `latestVisibleConversation(ctx)` `:22` (DB).
- `executeProposal` visibility check `proposals.ts:393` via `sightOfConfirmer`; `rejectProposal` `:350` (ConvCtx).
- Mobile routes `conversations*`, `proposals*` use `mobileAiCtx(g)` (REVIEW §3).
- `service.ts:192–199` creates the room when `conversationId` absent.

## Deliverables
1. `conversation-owner.ts` (pure): new tag `e~<aiEmployeeId>~<hex>`; `newTaskConversationId(aiEmployeeId)`; `taskEmployeeOf(id) → aiEmployeeId | null`; `canSeeConversationId` returns `"ask-db"` (or a separate `needsDbCheck(id)` boolean) for `e~` ids so pure callers cannot accidentally allow; `visibleConversationWhere(s)` gains an optional `extraIds: string[]` the DB layer supplies (ids of `e~` rooms the viewer may see). **No other rule changes** — G2 stays closed.
2. `src/lib/ai/team/tasks.ts`:
   - `startTask(ctx, aiEmployeeId, { title?, firstMessage?, idempotencyKey? }) → { taskId, conversationId }` — employee ACTIVE (else `employee_paused`), caller ∈ commanders (`commanderUserIds` empty ⇒ `assertCan(ai.employee.use)`), create `AiConversation{ id: e~…, tenantId, title }` + `AiTask{ status OPEN, startedById }` in one tx; if `firstMessage`, call `sendMessage` after commit (outside tx) with `aiEmployeeId`.
   - `canSeeTask(tenantId, userId, conversationId) → boolean` = starter ∨ commander (or anyone with `ai.employee.use` when the list is empty) ∨ (viewer can confirm **a pending** proposal kind in this room: `membershipCan(viewerMembership, kindAccessOf(kind))` for any PENDING proposal) — DB-backed; cached per request.
   - `visibleTaskConversationIds(tenantId, userId) → string[]` (for list routes).
   - `listTasks(ctx, aiEmployeeId, filter)`, `markDone`, `archiveTask`, `taskStatusOf(conversationId)` (WAITING = pending proposal exists).
   - `frequentTasks(employee) → template.frequentTasks ∪ last 3 repeated titles`.
3. Wiring: `conversations.ts#findVisibleConversation` — for `e~` ids call `tasks.canSeeTask`; `latestVisibleConversation` unchanged (legacy). `executeProposal`/`rejectProposal`: for `e~` rooms replace the `sightOfConfirmer` check with `canSeeTask(userId)` (userId required; without it refuse). `service.ts#sendMessage`: for `e~` rooms require `canSeeTask` **and** commander membership for sending (approvers who only see may not send); set `ctx.aiEmployeeId` from the task; on proposal creation (`propose()` in tools.ts) set `AiProposal.aiEmployeeId` from `ctx.aiEmployeeId`. Mobile `GET conversations` for v2 lists both `u~` own rooms and `e~` rooms visible (T1.10 route — here the service function).
4. `AiTask.idempotencyKey` unique → P2002 returns the existing task.

## Files you own
`src/lib/ai/team/tasks.ts`, hunks: `src/lib/ai/conversation-owner.ts` (tag + db-check hook only), `src/lib/ai/conversations.ts`, `src/lib/ai/service.ts` (room/ctx), `src/lib/ai/tools.ts#propose` (aiEmployeeId write), `src/lib/ai/proposals.ts` (`executeProposal`/`rejectProposal` visibility branch for `e~`).

## Acceptance (oracle `qc-ai-t1.7`)
S1 start + message · S2 commanders · S3 visibility matrix (starter / commander / approver-with-pending / approver-without / AT-X) · S4 **G2 still closed** (owner cannot open staff `u~`; `s~` visible to owner; `k~` unchanged) · S5 execute in `e~` by approver ok, by AT-X not found · S6 status transitions · S7 X3 idempotent start · S8 frequentTasks · S9 X8 no customer message copies · S10 legacy rooms = baseline snapshot of `qc-ai-proposals`. Regressions: `qc-ai-proposals` `qc-ai-plan` `qc-ai-memory` `qc-mobile-chat` `qc-mobile-authz-hotfix` + CRM G1/G2/G3 (**all**).

## Controller rulings
- Seeing ≠ sending: approvers see a room only while a pending proposal they can confirm exists; after deciding, the room disappears from their list (no retained access).
- Memory ids in `e~` rooms: `rememberFact` writes with the **commander's** `u~` scope or shop `o~` per existing rules — no new memory scope in this WO.
- Hunter lens: enumerate every caller of `canSeeConversationId`/`visibleConversationWhere` and prove none treats `e~` as visible without the DB check.

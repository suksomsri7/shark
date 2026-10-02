# CRM C5.5-G2 — AI conversations belong to their creator (builder note)

Branch `wip/crm-cf14` from `be9c9658` (G1 + 2 review rounds). Code commit `8c4a8a0b`, this note in the next commit. Written
2026-10-02 03:07 UTC (`date -u`). Both commits use `--no-verify`: the repo's pre-commit hook runs `fitness.mts` straight from the
shell (outside `iso.sh`); fitness with and without env was run through `iso.sh` + gate lock on the identical tree (39/39 ×2). Finding: G1 review F1 (HIGH, both rounds) = G1 builder R1. Platform AI
conversations had no owner: the web sheet opened the shop's latest conversation (anyone's), mobile listed/read every conversation,
`sendMessage` continued any conversation id of the shop and fed its last 40 turns to the model, REST accepted any `conversationId`, and
pending proposals/plans were listed and confirmable shop-wide. After G1 a cashier with only `ai.chat.send` was refused the tools but
still read (and made the model quote) the OWNER's earlier answers.

## Storage decision — the creator is embedded in the conversation id (no migration)

Checked in the preferred order (`prisma/schema/ai.prisma`, `core.prisma`):

1. **An existing field that can carry the creator.** `AiConversation` has `id, tenantId, title, lastReadAt, deletedAt, createdAt,
   updatedAt`; `AiMessage` has no user/meta column; `AiProposal`/`AiPlan` have no creator/confirmer column (`payload` is server-side
   data of the action, `resultNote` is shown to users). `title` is user-editable and shown. The only field that is written once by
   the server, never changes, is never shown as text and is already carried by every proposal and plan is **`AiConversation.id`**
   (a `String @id @default(cuid())` — Prisma accepts an explicit value). Chosen:
   - `u~<userId>~<96 random bits hex>` (a member) · `k~<apiKeyId>~<random>` (an API key) · `s~<job>~<random>` (an internal job).
   - `~` is not in the cuid alphabet ⇒ an old id (plain cuid) = "creator unknown" (legacy). No door accepts a client-chosen id on
     create (checked: sendMessage, mobile POST conversations, mobile welcome, REST tools route — all ids are minted server-side by
     `newConversationId`), so the prefix cannot be forged; it cannot change (primary key); proposals/plans know their owner from
     `conversationId` without a join.
   - Meaning for other readers is unchanged: ids are opaque strings everywhere (grep: no format validation of AI conversation ids;
     `kanban-op-from-chat` `max(40)` is the customer-chat conversation, another table; AiFeedback/AiCreditTxn store the id as text).
   - Length 26–60 chars (text column).
2. Derive from the first USER message: impossible — messages carry no user id.
3. AuditLog `ai.conversation.created`: rejected — AuditLog has indexes only on `(tenantId, createdAt)` and `(action)`, none on
   `actorId`/`targetId`; every open/continue/list would need a lookup that walks either all the tenant's audit rows or every
   `ai.conversation.created` row of the whole platform, and it needs a second write in the creating transaction at 4 doors.

Query plans (QC3, `scripts/pending/cf14/plan-cf14.mts`, EXPLAIN ANALYZE + the same with `enable_seqscan=off` to show the index a
production-size table uses; QC3 has 20 conversations / 3,655 audit rows, so absolute times are not meaningful):

| query | plan (index view) | what it walks |
|---|---|---|
| A1 mobile list / web latest, member | `Index Scan Backward using AiConversation_tenantId_updatedAt_idx` · Index Cond tenantId · Filter `deletedAt IS NULL AND id LIKE 'u~<me>~%'` · LIMIT 100 | the same index and order as before the card; walks the shop's conversations newest-first until 100 own rows (worst case: all of the shop's conversations for a member with few rooms) |
| A2 same, OWNER | same index · Filter `id LIKE 'u~<me>~%' OR id NOT LIKE 'u~%'` | same |
| A3 open by id (every door) | `Index Scan using AiConversation_pkey` · Filter tenantId | one row (prefix checked in JS before the query) |
| B1 AuditLog alternative, list | `Index Scan using AuditLog_action_idx` · Filter tenantId, actorId | every `ai.conversation.created` row of **all tenants** |
| B2 AuditLog alternative, open/continue | `AuditLog_action_idx` · Filter targetId | same, per request |

Lists are one query (no N+1). Every row returned by a LIKE pre-filter is re-checked in JS (`canSeeConversationId`, exact prefix) so a
`_`/`%` in an id can never widen the match.

## The rule (`src/lib/ai/conversation-owner.ts`, db readers in `src/lib/ai/conversations.ts`)

- A conversation (its messages, tool results, proposals, plans and their results) is visible and continuable **only by its creator**:
  the same user (member), the same API key, the same internal job.
- **Exception — conversations not created by a member** (legacy, API-key, scheduled-task) are also visible to members whose role is
  **OWNER** of that tenant. Nobody else.
  - Legacy: no backfill — OWNER only, as the card asks.
  - API key: kept on purpose. The REST route's own header and `docs/AI_LAYER.md` (line 103) document the flow "write tools do not run;
    a proposal is created and **the owner confirms in the app/web** in that conversation" — without this exception no human could
    confirm a key's proposal.
  - Scheduled task: runs with the least-privileged rights (G1) and publishes to everyone already; the OWNER can look back at it.
- Another member's conversation is invisible to everybody, **including another OWNER** (probe W2.3/S1.3).
- Not visible = the same answer as "does not exist" at every door (empty list / empty messages / `false` / "ไม่พบข้อเสนอนี้" / new
  conversation / REST 404).

## Door × rule

| door | file | before | now |
|---|---|---|---|
| web: open the AI sheet | `ai/actions.ts` `loadAiChatAction` → `latestConversation` | shop's latest conversation (anyone's) + its proposals/plans | caller's latest visible conversation |
| web: send | `sendAiMessageAction` → `sendMessage` | continued any id of the shop | continues only a visible id; otherwise opens a new conversation **owned by the caller** |
| web: list proposals / plans of a conversation | `listPendingProposalsAction`, `loadPlansAction` | any id | visible conversation only (and it must exist) |
| web: confirm / reject proposal, confirm / reject plan | `confirmProposalAction`, `rejectProposalAction`, `confirmPlanAction`, `rejectPlanAction` | any proposal id (key check only) | only if its conversation is visible to the confirmer (`executeProposal`/`executePlan` get `userId` + role); CRM-door proposals keep their own C3.4 door first (unchanged) |
| model context | `service.ts` `sendMessage` | 40 turns of any conversation id | conversation looked up through `findVisibleConversation`; the history query itself carries the visibility filter (`conversation: visibleConversationWhere`) — defence in depth in the loader |
| tool executor | `tools.ts` `guarded` (every registry tool, also via `runTool`) | `ctx.conversationId` trusted | a conversation id the actor cannot see is dropped ⇒ no proposal / plan / support case is ever attached to someone else's room |
| mobile: list / create | `GET/POST /api/mobile/conversations` → `mobile/conversations.ts` | every room of the shop / plain id | visible rooms only / id with creator |
| mobile: rename / delete / mark read | `PATCH/DELETE /conversations/[id]`, `POST …/read` | any room | visible rooms only (`{ok:false}` otherwise, same as a missing id) |
| mobile: messages | `GET /conversations/[id]/messages` → `listMessages` | any room | visible rooms only (200 `{messages:[]}` otherwise — same as a missing id before the card) |
| mobile: chat/send | `POST /api/mobile/chat/send` → `sendMobileChat` → `sendMessage` | any room | as web send |
| mobile: welcome | `POST /api/mobile/chat/welcome` | "the shop has any room" ⇒ `existing:true` | "the caller has a visible room" ⇒ `existing:true`; otherwise the caller gets their own welcome room |
| mobile: proposals list / confirm / reject · plans confirm / reject | `/api/mobile/proposals*`, `/api/mobile/plans/*` | any | as web |
| member assistant page `?conversation=` and its actions | `member/assistant.ts` `assistantState(…, aiActor)`, `assistant-actions.ts`, `assistant-guard.ts` | any conversation id of the shop (incl. the OWNER's web chat) | visible only (empty state otherwise); cancel guard adds "(0) conversation is the caller's" |
| REST `POST /api/v1/ai/tools/[name]` | route | any `conversationId` of the shop accepted, even non-existent (cards dropped into an owner's chat — G1 R4) | `conversationId` must be a conversation **this key** created, else **404 `{error, code:"conversation_not_found"}`**; new rooms are `k~<keyId>~…` |
| scheduled tasks | `scheduled.ts` → `sendMessage(aiSystemActor)` | plain id | `s~scheduled-task~…` (OWNER-visible) |
| support case reply into the room | `platform/support.ts` `addPlatformMessage` | by id | unchanged (writes by id; the creator sees it) — see follow-up below |
| counts: onboarding "tried AI", AiUsage, AiCreditTxn, privacy erasure, ops | `onboarding-drip.ts`, `credit.ts`, `crm/privacy.ts` | counts | unchanged (no content) — probe O1.1 |
| export of AI conversations | — | no such door exists (grep) | — |

## Proposals / plans and the confirmation design

- Today's confirm check (`KIND_ACCESS` via `assertCan`, G1 made the propose-time gate equal to it) judges **the confirmer's key**;
  the old comment "ไม่ผ่าน = คง PENDING (คนมีสิทธิ์มากดทีหลังได้)" and the refusal text "ให้ผู้มีสิทธิ์เป็นผู้กดยืนยัน" describe a
  "someone else with the right confirms" flow. In the product that flow only existed through the shared conversation (F1), and
  `docs/AI_LAYER.md` §55-58 says the user confirms their own card. G1 already made it unreachable for members (a proposer must hold
  the confirm key). ⇒ **Restricted to the conversation's viewers** (creator; OWNER for non-member rooms). Owner question Q2 below.
- The one documented cross-actor flow — an API key proposes, the OWNER confirms in the app/web — is kept (rule exception above).
  A non-OWNER member can no longer confirm a key's proposal (before: anyone holding the confirm key). Owner question Q3.
- CRM-door proposals (`crm.assist.tasks`, `crm.activity.ai_fill`, card scan `crm_create_lead`, `crm.*` with `requestedByUserId`)
  live under pseudo conversation ids (`crm:card:…`, `<prefix>:<random>`), are confirmed/cancelled through `crm.aiBridges` with their
  own visibility rules — untouched (branch order kept; qc-crm-c3.4 53/53).

## AI memory (remember_fact / list_memories / forget_fact) — finding, not changed (D1)

- `AiMemory` is **per tenant** (no user column). `memoryBlock({tenantId})` is injected into the system prompt of **every**
  `sendMessage` of the shop — every member, the member assistant, API-key REST conversations do not use it (no `sendMessage`), the
  scheduled job does. `list_memories` is OPEN to every `ai.chat.send` holder; `remember_fact`/`forget_fact` are open to members too
  (refused to API keys by G1).
- 🔴 **Facts can contain tool-derived personal data.** `remember_fact`'s description tells the model to call it on its own and lists
  "names of regular customers" as an example. Probe F1.1 (evidence, not counted): the OWNER's turn runs `customer_search` (full phone)
  and the model stores "ลูกค้าประจำ คุณสอง โทร 0899000102" → that phone is in the **STAFF ai-only** member's system prompt (and
  `list_memories` prints it). After this card, AiMemory is the remaining cross-user channel for data a member's own rights do not
  allow. Owner decision D1 should be revisited with this in mind (e.g. per-user memories, or refuse/mask phone/e-mail/ID patterns in
  `remember_fact`, or `remember_fact` only for OWNER). Not redesigned here.

## Mobile app (read only — `apps/mobile`)

- Sessions list (`app/(app)/sessions.tsx`): a shorter list is fine; empty list renders the empty state (`items.length === 0`).
- Chat screen (`app/(app)/chat/[id].tsx`): messages of a room the user cannot see come back as `200 {messages:[]}` (the same answer a
  missing id always got — no 404 introduced, so no new error path); proposals → `[]`; confirm/reject errors are shown via
  `apiErrorText`/`note`. No crash path found.
- Behaviour note: the chat screen sends with the route's `conversationId` and ignores `result.conversationId`. A STAFF/MANAGER who
  had a legacy room open (or opens a stale deep link / support push) gets an empty screen, and every message sent from that screen
  opens a new own room (replies still show on screen; history is split). Going back to the list fixes it. App change optional.
- The orb (welcome) is hidden in the app for now (`ORB_HIDDEN_FOR_NOW`).

## RED → GREEN

Probe `scripts/pending/cf14/probe-cf14-g2.mts` (QC3 · own tenant swept · scripted model / built-in mock · fetch blocked · real
doors: web actions under a session cookie, mobile route handlers with Bearer, REST route with real keys, member-assistant actions,
`sendMessage`, `executeProposal`). Same file on both trees.

- **RED on be9c9658: 11/34** (`/tmp/cf14-logs/red1.log`). Red = W1.1 (=R1.1) W1.2 W1.3 W1.4 W2.2 · M1.1 (=R1.2) M1.2 M1.3 M3.1 M3.2 ·
  S1.1 (=R1.3) S1.2 S1.3 · K1.2 K1.3 K1.5 · A1.1 A1.2 · Y1.1, plus positives broken by the leaks on the base tree (W2.4 W2.5 M2.2 K1.1:
  the STAFF had already confirmed/deleted the OWNER's items).
- **GREEN: 34/34** (`/tmp/cf14-logs/green1.log`, again in the verification run `v1`). Positive controls: W2.1 S2.2 M2.1 A2.1 (each member's
  own flow), W2.4 W2.5 S2.1 M2.2 M2.3 (OWNER: own + legacy), K1.1 K1.4 K1.5 (key continues its own room; OWNER lists and confirms the
  key's card), Y1.1, O1.1, CLEAN (0 rows, 0 users).
- Reviewer probe `probe-cf9-g1-review`: **15/18 → 18/18** — R1.1, R1.2, R1.3 flipped green (not edited).

## Verification (QC3 · iso.sh + gate lock · one at a time · runner `scripts/pending/cf14/run-verify.sh`, summary `/tmp/cf14-logs/<label>.summary`)

Runs: `v1` = full run on the final src (tree be9c9658 + this card's diff) · `v2` = re-run after the last ORACLE-EDITs ·
`base` = the same suites on be9c9658 src (checked out temporarily over this worktree, then restored) for every suite still red.

| check | this card | be9c9658 |
|---|---|---|
| `pnpm typecheck` (5 GB heap) | exit 0 (v1, v2) | — |
| probe-cf14-g2 (own) | **34/34** | 11/34 |
| probe-cf9-g1 (builder G1, ORACLE-EDIT) | 47/47 (v2; v1 before the edit: 45/47, P9.1 G9.2 = proposals into the OWNER-only legacy room) | 47/47 (G1 v4) |
| probe-cf9-g1-r2 | 18/18 | 18/18 (G1 v4) |
| reviewer probe-cf9-g1-review (not edited) | **18/18 — R1.1 R1.2 R1.3 flipped** | 15/18 (R1.1–R1.3) |
| reviewer probe-cf9-g1-review-r2 | 14/14 | 14/14 (review r2) |
| probe-cf8-mobile (ORACLE-EDIT) | 8/8 (v2; v1 before the edit: 6/8, W1.2 W3.2 = shared-room assumptions) | 8/8 (G1) |
| probe-cf8-actions | 9/9 | 9/9 (G1) |
| probe-cf8-review | 18/19 — X1.3 | **18/19 — X1.3 (base run)** (G1 note: no longer reproduces since G1, by design) |
| qc-mobile-authz-hotfix (ORACLE-EDIT) | 12/12 | 12/12 (G1) |
| qc-ai-automation | 4/4 | 4/4 (G1) |
| qc-crm-c3.4 | 53/53 | 53/53 (G1) |
| qc-automation-authz-hotfix · qc-payment-authz-hotfix | 12/12 · 8/8 | same (G1) |
| qc-crm-c1.7 · qc-crm-c2.11 | 57/57 · 47/47 | same (G1) |
| qc-crm-c1.10 | 66/67 — H.1 (HTTP :3215) | **66/67 — H.1 (base run)** |
| qc-account-api-ai-skill (ORACLE-EDIT K3.4) | 23/33 (v2; v1 before the edit 22/33, + K3.4) — K2.1 K2.3 K2.5 K2.6 K2.8 K3.6 K3.7 K3.8 K3.10a K3.11 | **23/33, the same ten ids (base run)** (acc-v2 seed) |
| qc-member-m3.10 | 6/21 — 15 ids | **6/21, the same 15 ids (base run)** (env: HTTP :3215 / skill copies / screenshots) |
| qc-member-fix-s1 (static check of the member-assistant cancel guard) | 28/28 | — |
| gen-{crm,member,kanban,account}-api-docs --check | exit 0 ×4, no tracked change | — |
| fitness (QC3 env) · fitness (no env) | 39/39 · 39/39 | — |
| query plans `plan-cf14.mts` | see storage decision | — |

## ORACLE-EDIT (minimal; each marked `ORACLE-EDIT C5.5-G2`)

| script | why | edit |
|---|---|---|
| `scripts/qc-mobile-chat.mts` | the mobile conversation functions take the viewer | MC-1.x lib calls use the existing OWNER actor ctx (`chatCtx`, new `chatCtx2` for the other shop) — not run (loads `.env.local`) |
| `scripts/qc-ai.mts` | `latestConversation`/`listMessages` take the viewer | AI-5.1/5.2: "another shop" = that shop's OWNER actor — not run (`.env.local`); typecheck covers it |
| `scripts/qc-ai-proposals.mts` | `listPendingProposals`/`rejectProposal` take the viewer | PZ-1.2/1.3/4.1/4.2 pass the OWNER actor — not run (`.env.local`) |
| `scripts/qc-mobile-help.mts` | `listConversations` takes the viewer | HA-2.3 lists as the OWNER (the room is legacy) — not run (`.env.local`) |
| `scripts/qc-mobile-authz-hotfix.mts` | positive controls read/renamed a legacy room as STAFF+ai.chat.send | the fixture room is opened by that STAFF through the real route; the delete positive control is its creator instead of the OWNER |
| `scripts/qc-account-api-ai-skill.mts` | E1-K3.4: a STAFF confirming a proposal of someone else's room now gets "ไม่พบข้อเสนอนี้" before the key check | accept `สิทธิ์` or `ไม่พบข้อเสนอ`; still asserts refused + PENDING |
| `scripts/pending/cf9/probe-cf9-g1.mts` (builder G1 probe) | P9.1/G9.2 proposed as STAFF into the shared legacy room (OWNER only now ⇒ "must be in a conversation") | `rt` gives each valid actor its own room (falls back to the shared room for actors the owner module refuses / on the base tree) |
| `scripts/pending/cf8/probe-cf8-mobile.mts` | CF8-W1.2 / W3.2 positive controls assumed shared rooms | W1.2: MANAGER/STAFF+ai pass the gate (200) and see no legacy proposal, OWNER sees it · W3.2: OWNER/MANAGER first tap = own welcome room, second = existing |

Not edited: the reviewer's probes (`scripts/pending/cf9/review/*`).

## What a prod hotfix would need (prod main 929c39ce)

- Prod has none of G1 (`actor.ts`, `tool-access.ts` and the mandatory actor in `sendMessage`/`runTool` are not on prod — `git diff
  929c39ce be9c9658 --stat` over `src/lib/ai`). This card's code takes the viewer from G1's `AiActor`.
- Recommended: ship **G1 + G2 together** (G2 alone on prod still leaves G1's leak; G1 alone leaves this one — the review said not to
  announce G1 before F1 lands).
- A G2-only port is possible: copy `conversation-owner.ts` with a local viewer type `{userId, role} | {keyId}` instead of `AiActor`,
  `conversations.ts`, and the same door edits (24 src files in this card); `sendMessage` on prod has `ctx = {tenantId}` only, so its 4 callers must pass
  the viewer (web action, mobile send, member assistant, scheduled job).
- Data: every existing prod conversation becomes legacy ⇒ OWNER-only. **STAFF/MANAGER lose their own past AI history** (it was shared
  with the whole shop) — no backfill. Pending proposals/plans in legacy rooms become confirmable by OWNERs only.
- REST integrations that pass a `conversationId` from before the deploy get **404** (send without `conversationId` to open a new room).
- Merge with `hotfix/apiv1-scope` (`/root/projects/shark-hf`, read only): it edits the same REST route — imports block (adjacent to
  G1's two import lines + this card's two) and the `generalToolGate` line; this card only adds the conversation check/creation lines
  further down ⇒ textual conflict limited to the import block, no semantic conflict (the hotfix gates run before; 404 comes after).

## Owner questions

- **Q1 (memory, D1 revisited)** AI memory is per shop and injected into every member's prompt; the model may store tool-derived
  phones/names (probe F1.1). Per-user memories, PII filter, or OWNER-only `remember_fact`?
- **Q2** Confirmation is now limited to the conversation's viewers (the proposer; OWNER for key/legacy/scheduled rooms). If shops want
  "STAFF drafts, manager approves", route it through the approval module, not shared chat (same advice as the G1 review 4a).
- **Q3** A key's proposals: OWNER-only confirmation (as documented). Should MANAGERs (or the user who created the key, if recorded)
  also see/confirm them?
- **Q4** Legacy rooms (all prod rooms at deploy) are OWNER-only and STAFF lose their past history. Acceptable, or announce it?
- **Q5** Scheduled-task rooms are OWNER-visible (and can be the "latest" the OWNER's web sheet opens, as before). Keep?

## Follow-ups (not in this card)

- `platform/support.ts` pushes the team's reply (first 80 chars) to **every device of the shop** (`sendPushToTenant`) with the room id;
  with this card only the room's creator can open it. `sendPushToUser(<creator from the id>)` would match the new rule.
- `support_open_case` still records opener `"ai-assistant"` (G1 R8) — the creator is now known from the conversation id.
- `remember_fact` (Q1).

## Not verified

- Suites that load `.env.local` (qc-ai, qc-ai-proposals, qc-mobile-chat, qc-mobile-help, qc-ai-tools, qc-ai-plan, qc-ai-memory, …) —
  4 of them carry ORACLE-EDITs; only `qc-ai.mts` is statically typechecked.
- The mobile app on a device; HTTP against the QC server :3215; a live model; prod.
- A merged tree with `shark-hf`.
- Production-size query timings (QC3 is tiny; plans shown with seq scans disabled).

## Controller merge gate record (2026-10-02 06:14 UTC)

Patch `scripts/pending/c55merge/g2.patch` (cf2 `be9c9658..608204d3`) applied to the main tree with `patch -p1 --fuzz=3`; all 38 files verified identical to the tip commit. Gate `scripts/pending/run-main-g2.sh` (unit `crm-main-g2`, log `.qc-shots/crm/main-g2.log`): **22/23 steps exit 0**.

- Green: typecheck, docs ×4, fitness (no env + QC3), probe-cf14-g2, probe-cf9-g1 / g1-r2 / g1-review-r2, probe-cf8-mobile / actions, mobile-authz, automation-authz, payment-authz, ai-automation, c3.4, c1.7, c2.11, c0.2, probe-cf13-sweep.
- Red, expected: `probe-cf14-g2-review` exits 1 on **X7.1 only** (an OWNER's tool-derived phone stored by remember_fact reaches STAFF). This is the reviewer's reproduction of the finding that card G3 fixes; it goes green with G3 (verified 14/14 on the G3 tip `dece4b11`). G2 is merged with this finding open until G3 lands.

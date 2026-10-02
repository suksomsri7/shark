# CRM C5.5-G1 — independent review (AI tools run as the caller)

Branch `wip/crm-cf9` · tip `fdf3cd36` · base `5ebea63f` · reviewed 2026-10-01 23:02 UTC (`date -u`).
Read: builder note `ledger/wo-notes/crm-C5.5-G1.md`, the full `git diff 5ebea63f fdf3cd36`, sweep notes (G1, F1), AI_LAYER design,
hotfix `/root/projects/shark-hf` (`git log -3 -p`, read only). The builder's v2 runner log header says tree `80a880f4`; `git diff 80a880f4 fdf3cd36`
touches only the builder note, so the builder's results apply to the tip.

## What I ran (QC3 only · each heavy job through `iso.sh` + `with-gate-lock.sh`, one at a time)

| run | result |
|---|---|
| builder probe `scripts/pending/cf9/probe-cf9-g1.mts` (tip) | **47/47** (CLEAN tenant 0 rows, users 0) |
| own probe `scripts/pending/cf9/review/probe-cf9-g1-review.mts` (final run) | **13/18** — red = R1.1 R1.2 R1.3 (F1) · S1.3 (F2) · A1.4 (F4) · CLEAN 0 rows / 0 users |
| `pnpm typecheck` (5 GB heap) after the probe was written, and again after its last edit | exit 0, exit 0 |

Own probe = real `runTool`, real `sendMessage` with a scripted model (no network, `fetch` blocked), the web action under a session
cookie, the real mobile routes with a Bearer token, the real REST routes `POST /api/v1/ai/tools/[name]` and `GET /api/v1/ai/skills/[id]`
with real keys.

## Attack 1 — completeness

- **Executors.** `AiTool.execute` has exactly one product caller: `runTool` (`src/lib/ai/tools.ts:2497`). `runTool` has two callers:
  `sendMessage` (`service.ts:286`) and the REST route (`v1/ai/tools/[name]/route.ts:71`). `sendMessage` has four callers. All pass an actor
  built from the request's own identity: web action (`actions.ts:230`, session `auth.active`), mobile route (`mobile/chat/send/route.ts:28`,
  `requireMobile` membership of `X-Tenant-Id`), member assistant (`member/assistant-actions.ts:43`, session), and scheduled job
  (`scheduled.ts:95`, `aiSystemActor`). Other `toolRegistry()` users only read names or definitions: skills routes, `eval.ts`,
  `member/assistant.ts:70`, `skills.ts:383`. No other provider call passes `tools` (grep `toolCalls` / `tools: [` outside `service.ts`).
  Plan and proposal executors re-check the confirmer (`runKind` → `assertCan`, `proposals.ts:473`), as the builder says.
- **Default for unmapped names = DENY.** `toolVerdict` returns "unknown tool" when a name is not in the hand table, the action-kind table,
  `propose_plan` or a module registry (`tool-access.ts:200`). Own E1.5 is green. Builder G0.1 shows every one of the 204 registry tools is mapped.
- **"Required at the type level" is true.** `ToolCtx.actor: AiActor` (`tools.ts:50`) and `SendCtx = Ctx & { actor }` (`service.ts:27`) are
  both non-optional. `src` has no `as any`, no default parameter and no wrapper that builds an actor. Only the four builders in `actor.ts`
  make one, and grep finds exactly the five call sites above. No code builds an OWNER or system actor out of nothing.
- **What "tolerant" means.** `aiActorMembership`/`aiActorUserId` accept `null|undefined` (`actor.ts:94`). `unitScope(!actor)` returns `[]`.
  A missing actor can only reach the adapters through a direct `AiTool.execute`, which product code never calls. QC scripts still do:
  qc-crm-c1.10 S6.3/S10.2/X2.6, qc-kb-auto, qc-ai-automation. The fallback's direction is the risk; see F6.

## Findings

| # | sev | where | finding | repro |
|---|---|---|---|---|
| F1 | **HIGH** (existed before this card, on prod too; outside the diff, but it defeats G1 in practice) | `ai/actions.ts:106` `loadAiChatAction` → `service.ts:65` `latestConversation` (the shop's latest conversation, anyone's) · `mobile/conversations.ts:11` lists every conversation of the shop and `conversations/[id]/messages` reads any of them · `service.ts:180-205`: `sendMessage` accepts any `conversationId` of the shop and puts the last 40 turns into the prompt · same pattern in `member/assistant.ts` `assistantState(conversationId)` and `listPendingProposalsAction(conversationId)` | Tools now run as the caller, but an answer that was produced under the OWNER's rights is stored as plain assistant text in a conversation shared by the whole shop. A cashier holding only `ai.chat.send` (G1 correctly refuses them `customer_search`) opens the AI sheet. The web loads the **OWNER's** last conversation, with the members' full phone numbers in it. Mobile lists that conversation and returns its messages. Continuing it lets the model quote the OWNER's tool result back to the cashier. This is the builder's R1, rated concretely: **after G1 the cashier still gets the data simply by opening the AI sheet after the OWNER used it.** G1 as defined (tools with `{tenantId}` only) is fixed; the user-visible leak is not. | own R0.1 ✅ (direct tool call refused) vs **R1.1 ❌** (web `loadAiChatAction` as STAFF ai-only → conversation = the OWNER's, phone `0899000102` shown) · **R1.2 ❌** (mobile list contains the OWNER's conversation, messages 200 with the phone) · **R1.3 ❌** (STAFF `sendMessage` with the OWNER's `conversationId` + a model that summarises the history → reply contains the phone) |
| F2 | **MED** | `actor.ts:55` (`SHOP_AUDIENCE` = STAFF with `unitAccess: []`) + `tools.ts:89-99` `unitScope` → `unitId IN ()` · scheduled job | The scheduled job's tool set (22/204, own S1.0) still includes the branch tools `today_appointments`, `queue_waiting`, `shop_pending_orders`, `rental_active`, `restaurant_today`, `ticket_event_sales`, and also `approvals_pending`. With no branch they return **an empty list, not a refusal**. A task like "every morning, today's appointments" will now publish "no appointments today" to every member while appointments exist. That is wrong data, not a missing feature. Key-gated summaries (`financial_summary`, members, account, kanban, CRM v2) at least refuse visibly. | **S1.3 ❌**: one pending order in u1 · OWNER sees `SO-QR1` · scheduled actor gets `{"ออเดอร์รอชำระ":[]}` · S1.1 ✅ (financial/account/member/customer refused) |
| F3 | LOW | `tool-access.ts:70` `pending_leaves: OPEN` vs `:83` + `tools.ts:2070` (`upcoming_schedule` shows leaves only with `hr.leave.read`) | The card treats the same data two ways. Leave rows (employee name, type, dates, free-text reason; sick leave is health data) need `hr.leave.read` in `upcoming_schedule` and in the calendar (`calendar/service.ts:130`, PDPA comment), but `pending_leaves` is open to every `ai.chat.send` holder and to the scheduled job, whose output goes to every member. The web door `hr/leave/page.tsx` also has no key, so this is web parity, not a new exposure. Owner decision (builder R3): put `hr.leave.read` on both the HR leave page and `pending_leaves`. Related, R3 class: `recent_leads` form submissions (`tools.ts:1980`, `nameFromAnswers` falls back to the first string answer, which can be a phone or e-mail) are unmasked for everyone, as on the open forms page. | own S1.2 (scheduled `pending_leaves` ALLOWED) |
| F4 | LOW | `v1/ai/skills/[id]/route.ts:34` (+ `skills/route.ts`) still filter with `skillToolsForApiKey` only · `v1/ai/tools/[name]/route.ts` returns 200 when the executor refuses | The skill manifest now advertises tools that the executor refuses for the same key: a general key sees `record_expense`, `financial_summary`, `kb_auto_save` and `forget_fact` listed, and calling them gives **HTTP 200** with `{result:"{\"error\":…}"}`. The `skills.ts` contract ("the manifest must not advertise what is refused") is broken. No data leaks. Fix: filter both listings with `toolVerdict(aiApiKeyActor(auth), name).ok`. In the route, call `toolVerdict` before `runTool` and answer 403. The same gap survives the hotfix merge, because `generalToolGate` lets general keys through. | **A1.4 ❌** advertised-but-refused = `sales:record_expense, sales:financial_summary, knowledge:kb_auto_save, memory:forget_fact` · A1.5 refusal = 200 |
| F5 | LOW | `actor.ts:44-50` `AiSystemActor.membership` is a free field · `tools.ts:2489` only checks `kind`/`tenantId` | "Rights are fixed by the job name" is a convention, not something the code enforces. Any code that writes a `{kind:"system", job:"scheduled-task", membership:{role:"OWNER"}}` literal typechecks and passes `runTool`. No such call site exists today. Fix: drop `membership` from the type and resolve rights from `job` inside `toolVerdict`/`aiActorMembership`, or brand the type so only `aiSystemActor` can build it. Add a fitness grep: `kind: "system"` literal outside `actor.ts`. | D1.2: the forged literal is allowed `financial_summary` |
| F6 | LOW (defence in depth) | `account-ops.ts:56` / `kanban-ops.ts:54` (`viewer` absent ⇒ widest assistant set or shop-level D18 actor) · `tools-member.ts` → member `viewerOf` cookie fallback · `tools-crm.ts` → CRM `viewerOf` cookie fallback | "No viewer" means two things: "API key, already checked by scope" and "no actor at all". For account and kanban that resolves to the **widest** read set, so a future direct `execute` without an actor reads the whole shop (builder R7 calls this "the runner's old fail-closed path", which is true for CRM only). For an API-key actor, member and CRM runners still consult the request cookie. Fix: pass an explicit `{kind:"apiKey"}` viewer and refuse when the actor is missing. Add a fitness rule: `.execute(` only in `runTool`. | D1.1: `account_dashboard.execute({tenantId})` without an actor → dashboard data |
| F7 | LOW (existed before) | `tools.ts:253-267` `member_count` (builder R2) | It counts the whole member system for a branch-limited MANAGER. It is a single number with no rows, names or phones. Acceptable to defer. | U1.1: MANAGER u1 → 2 (1 + 1 across branches) |
| I1 | INFO | — | Correctness of the per-tool rules holds in everything I drove. Kanban PRIVATE boards (the builder had no fixture) are hidden from a non-member STAFF and from a MANAGER of another branch across list, search, overdue, my_tasks (with and without assignee), workload and `get_board` with a known private id. The OWNER sees them (K1.1–K1.4 ✅). Customers of another branch get an answer identical to "does not exist" (U1.2 ✅). The OWNER is refused no tool (E1.1 ✅). The proposal gate equals the confirm gate (`evaluate`) for every hand kind, for MANAGER(*) and for a STAFF holding exactly the confirm key (E1.4 ✅). A member-scoped bound key reads `member_list` and is refused `customer_search` (A1.2 ✅). | own probe |
| I2 | INFO | — | The 17 ORACLE-EDITs are legitimate. All 17 diffs only add `qcOwner(tid)` / `actor:` and widen one local type (`qc-kb.mts`). No expected value changed. I read all 17 diff hunks; at least 5 were checked line by line (qc-ai-tools2, qc-ai-wave5b, qc-chat-notify, qc-ai-phase-b2, qc-account-api-ai-skill). | `git diff 5ebea63f fdf3cd36 -- scripts/qc-*.mts` |

## Attack 2 — personas (summary)

- **OWNER:** everything as before (E1.1), except `recent_leads` phones are now masked (intended, see 4c).
- **MANAGER(*):** refused only `member_field_create` and `notification_test_send` (the member module's MANAGER exceptions; confirming them would also fail).
- **MANAGER(u1):** the branch tools are filtered. Kanban reports are now refused by the kanban module's own `canViewReports` (K1.5). That matches the web door; before the card the shop-level D18 assistant actor answered.
- **STAFF ai-only:** refused all key-gated tools; module reads refused; proposals only for kinds they can confirm.
- **API keys:** module tools are judged by scope. Hand-written CRM/member/account data tools and immediate writes are refused for every key. Other hand-written tools only for the general key. Matches the note.
- **Refusal texts** name the permission key, not the data. Tool descriptions are static: the only template, `legacyMyTasks`, takes a static op description.

## Attack 4 — behaviour changes

- (a) **Proposals now need the proposer's own confirm key.** This is consistent with the design (`docs/AI_LAYER.md` §55-58: "the user confirms their own card"). The old "STAFF drafts, OWNER confirms" flow worked only because conversations are shop-shared (F1), and the old confirm refusal said "let someone with the right confirm". Several summaries read module data (leave or employee names, SKU and stock). Keep it fail-closed. If owners want a "request approval" flow, route it through the approval module (requests addressed to an approver), not shared chat. Needs the owner only as a notification.
- (b) **Scheduled tasks** run as STAFF with no branch. They lose finance, members, account, kanban, CRM v2, chat and calendar (visible refusals) **and** silently get empty branch data (F2). No creator is stored on `AiScheduledTask` or `AiProposal`, but `dispatch("ai_schedule_task", …, m, userId)` knows the confirmer and `AuditLog` (actorId/targetType/targetId) exists. A creator can be recorded **without a schema change** (see Q1). Needs the owner.
- (c) **OWNER `recent_leads` phones masked.** Same rule as `crm_search` (C5.4-B). If G1 ships before C5.4-B, the two tools disagree (builder already flags this). INFO, no owner decision needed if shipped together.
- (d) **CRM registry tools now work on mobile and in the member assistant**, as the caller, with full CRM visibility (P8.2). This is a feature turning on and is correct. Tell the owner and the app team; the mobile UI was never tested with these answers.
- (e) Refused since yesterday: for OWNER, nothing. For MANAGER, the two member exceptions above and kanban reports for branch-limited managers (module rule). For staff, see the persona list. Also general-key REST integrations that used `financial_summary`, `recent_leads`, `customer_*`, `member_count`, memory, `kb_auto_save`, `support_open_case` or `record_expense`. Announce this to the owner, together with the hotfix's own customer-impact list.

## Attack 5 — vs `hotfix/apiv1-scope` (shark-hf `201d371a`, `3285b19f`, `c2287e53`)

- Both are AND gates (route gate, then executor gate), so no case lets this card allow what the hotfix refuses in a merged tree.
- Executor-only differences:
  - `isGeneralKeyActor` (`actor.ts:107`) treats a key with malformed `scopesJson` as general, which `isGeneralApiKey` refuses. After the merge the route refuses first. Still: add `scopesMalformed` to `AiApiKeyActor` and call `isGeneralApiKey`.
  - This card is stricter for general keys (the list in 4e) and for `kanban_card_from_chat`, which no key can now use.
- Textual conflict is only `v1/ai/tools/[name]/route.ts` imports plus one line each.
- After the merge, F4 must be fixed in both listings (`skills/route.ts`, `skills/[id]/route.ts`), which the hotfix also edits.

## Answers to the builder's questions

- **Q1 (D-G1-a, scheduled tasks).** Neither option alone.
  1. Fix F2 now: no branch means the branch tools refuse with a clear text instead of returning `[]`.
  2. Record the creator without a schema change: in `dispatch("ai_schedule_task")` write an `AuditLog` row `{actorType USER, actorId: userId, action "ai.schedule.create", targetType "AiScheduledTask", targetId}`. At run time, read that creator's **current** Membership (gone or not accepted ⇒ skip and deactivate), run as them, and send the notification with `recipientUserId = creator`.
  3. Legacy tasks with no audit row: run with OWNER rights and notify OWNER members only (one row each). The persona already promises "the owner reads the result".
  4. The owner must approve the change of recipients.
- **Q2 (proposing without the confirm key).** Keep the card's rule (see 4a). Change only the refusal text so it names who can do it.
- **Q3 (R1).** HIGH (F1). Own card, before any prod release that advertises G1 as fixed.
  - Minimum without a schema change: record the conversation creator as an `AuditLog` row when `sendMessage` or mobile `createConversation` creates the conversation (the actor is known there). Filter list, read, continue, proposals and plans of a conversation by that creator. Conversations with no creator row (legacy, scheduled, REST) are OWNER only.
  - `loadAiChatAction` must open the caller's own latest conversation, not the shop's.
  - REST `conversationId` only for conversations the same key created (R4).
  - If even that slips, a stop-gap: non-OWNER members always start a fresh conversation and get no list or read of existing ones (they lose history until the card lands).
  - A nullable `createdByUserId` column is cleaner, but needs the migrate-deploy precautions (adding a column once took prod chat down).
- **Q4 (R9, phones in legacy member tools).** Mask, for consistency with member lists, `crm_search` and `recent_leads`. Low priority; owner's call.

## Not verified

- RED on `5ebea63f`: I did not re-run it. I relied on the builder's base log `/tmp/cf9-logs/base-…probe-cf9-g1.log`, 17/47.
- Every suite that loads `.env.local`, including the 16 ORACLE-EDITed suites other than qc-account-api-ai-skill. I did not re-run the builder's full runner (only its probe and typecheck).
- Approval, appointment, queue, rental, restaurant and ticket branch filters with fixtures (only shop orders were driven).
- `kanban_card_from_chat` chat-unit filtering.
- Live model, the mobile app on a device, the HTTP server on :3215, prod.
- A merged tree with the hotfix: I reasoned from its diff and did not build it.

Verdict basis: the diff does what G1 asks. Every tool door passes a required actor, and unmapped tools are denied. The access table matches
the module judges in everything I drove. Nothing regresses for the OWNER. It is strictly safer than the base.

Conditions:
- F1 is outside the diff and existed before it. Open it as its own HIGH card. Do not report G1 to the owner as "the cashier can no longer
  see the leads" until F1 lands.
- F2 (scheduled job publishes empty branch data) should be fixed before or with the owner's D-G1-a decision.
- F3–F7 can follow.

VERDICT: MERGEABLE

---

# Round 2 — re-review of `01fc0705` (parent `a63eb040`)

Reviewed 2026-10-02 (`date -u` 01:01 UTC at the end of the probe runs). Read `git diff a63eb040 01fc0705` (16 files) and the builder's
"Round 2" section. All runs on QC3, through `iso.sh` + `with-gate-lock.sh`, one at a time.

| run | result |
|---|---|
| builder `probe-cf9-g1` | 47/47 |
| builder `probe-cf9-g1-r2` | 18/18 |
| my round-1 `probe-cf9-g1-review` | 15/18 — red = R1.1 R1.2 R1.3 only (= F1, separate card, by design). S1.3 and A1.4 now green; A1.5 = 403; D1.1 = refusal; D1.2 = refused |
| new `scripts/pending/cf9/review/probe-cf9-g1-review-r2.mts` | **14/14**, CLEAN (tenant 0 rows, users 0) |
| `pnpm typecheck` (5 GB heap, includes the new probe) | see last line of this section |

## Attacks

**(a) F6 — is anything outside the actor check?**
- `toolRegistry()` builds its list on every call, and the check wrapper is applied there. The four module factories run inside that same
  call, so no tool is registered later. Every tool, including module registries, goes through the wrapper.
- Tool objects are module-private. Only the four factories (`crmTools` / `memberTools` / `accountTools` / `kanbanTools`) are exported,
  `tools.ts` is their only importer, and each adapter checks the actor itself.
- No tool calls another tool's `execute`.
- Plan steps and proposal confirmation do not go through tools: they use `runKind` → `dispatch` with the confirmer's Membership. So the
  double check (wrapper + `runTool` + adapter) is the same pure check run 2–3 times; it cannot break a legitimate nested call.
- Exhaustive evidence:

  | check | what was called | result |
  |---|---|---|
  | W1.* | `execute()` on all 204 registry tools, × 5 bad actors: none · other shop · system literal carrying OWNER rights · spread copy of a genuine system actor · unknown kind | gate refusal every time |
  | W1.writes | the same 1,020 calls | 0 writes (KB, memory, proposals) |
  | W2.1 | the 145 adapter tools taken straight from the four factories, no actor | all refused |

- Residual (INFO): the actor check validates shape only loosely. A `member` actor needs `membership` truthy and `userId` a string. A
  hand-written member literal with OWNER rights is still accepted. That is by design: member actors come from the session, and QC scripts
  build exactly such literals.
  - A missing `unitAccess` array would throw inside `toolVerdict`. In `runTool` that is caught (generic error). In `sendMessage` the
    offer filter is outside any try. `aiMemberActor` normalises, so no product path builds such an object.
  - Optional hardening: a fitness grep for `kind: "member"` / `kind: "system"` object literals in `src` outside `actor.ts`.

**(b) F5 — can the "genuine system actor" check break in a production build?**
- The genuine-actor list is a `WeakSet` that lives in one module: `actor.ts`.
- The only creator is `scheduled.ts:95`, called from `api/cron/hourly/route.ts`, which imports it statically: one route handler, node runtime.
- The consumers sit in the same call chain of that same request: `sendMessage` → `runTool` → wrapper / `tool-access` / adapters. They are
  plain function calls, with no server-action or RSC boundary, no serialisation, no edge runtime and no worker in between.
- Within one server runtime the bundler (webpack or Turbopack) keeps one module instance per module id and layer. A route handler's own
  import graph sits in one layer. So the object created in `scheduled.ts` is checked against the same `WeakSet` instance. Duplicate module
  instances matter only across layers (RSC vs SSR vs action), and no path carries a system actor across one.
- Failure mode if that were ever wrong: fail-closed and visible. Every tool refuses with the "who is the user" text, and the notification
  says so; no data leaks.
- No build-level check needed. Two cheap guards:
  - `actorProblem` logs an ops warning when it refuses a `kind: "system"` object, so a broken bundle shows on the ops dashboard instead
    of as quietly useless summaries.
  - One smoke call of `/api/cron/hourly` on preview after deploy.
- Evidence:
  - S1.1: the genuine actor is frozen and mutation is ignored. `sales_summary` runs. The branch tool is refused with the new wording.
  - S1.2: the actor's keys are `kind`, `tenantId`, `job` — no rights field.
  - W1: a spread copy is refused.

**(c) F2 — how "no usable branch" is detected (`actorBranches`)**
- API key → `null` (shop-wide). Member OWNER or `*` → `null`. Otherwise the list, so `[]` → refused and not offered. Forged or missing
  rights → `[]`.
- The web door: `requireUnit` → `canAccessUnit` = OWNER, or `*`, or the unit id in the list. So `[]` opens no branch page.
- Parity was measured on the same session per persona (B1.1 green): STAFF `[]` gets no branch page on the web and 0/6 branch tools in the
  AI. STAFF `*` 2/2 and 6/6. MANAGER `[u1]` u1 only and 6/6, filtered to u1. OWNER all.
- `Membership.unitAccess` defaults to `[]` (`core.prisma:134`), so every STAFF invited without branches loses these six tools.
  - This matches the row-level web doors, so it is not a silent regression. The refusal is visible and says it is not "no data".
  - One difference to mention to the owner: the home dashboard (`app/app/page.tsx:55`) shows a shop-wide **count** of today's
    appointments to everyone. That is an existing web inconsistency, not this card's.
- INFO: the member module's `isUnitScoped` treats `[]` as shop-wide (B1.2: STAFF `[]` + `member.customer.read` → `member_count` 1). So
  "`[]`" means "no branch" for the branch tools and "whole shop" for members. The card follows each module's own judge, which is correct,
  but the two meanings are worth a line in the owner brief.

**(d) API-key viewer passed to the member and CRM runners**
- The viewer is `{ userId: null, role: STAFF, unitAccess: ["*"], permissions: exactly the key's scopes }`, with no wildcard expansion.
- The member REST key actor (`memberActorForKey`) is the same, except an ADMIN-scope key gets role MANAGER there. So the AI viewer is equal
  or narrower, never wider.
- Inside the runner, the scopes in effect = the assistant's read set ∩ the key's scopes. In round 1 an API key got the whole assistant
  read set inside any op its scope allowed, so round 2 narrows this.
- System binding is still forced by the route (`systemId = auth.systemId`).
- CRM: `userId: null` → the CRM runner refuses (no human). That was already true before this card; no key-filter scope is involved.
- Evidence:
  - K1.1: 140 pairs (member read tools × 4 narrow keys) — the AI never runs a tool where REST `memberScopesCan` refuses.
  - K1.2: a `[member.tier.read]` key inside a request carrying the OWNER's cookie → `member_list` returns `phoneMasked`, no phone. The
    cookie is ignored.

**(e) F4 — the 403 response vs existing integrations and the hotfix**
- The tools route now answers 403 `{error}` before parsing the body or opening a conversation.
- For an integration, the step that breaks it is G1 itself (data → refusal). The 200 → 403 status change is the honest form of that,
  and matches the route's other refusals.
- Body shape: the hotfix's 403 is `{error, error_en, code: "key_not_general"}`; this card's is `{error}` only (H1.1).
- Recommend (LOW): add `code` (e.g. `"tool_not_allowed"`) and `error_en`, so clients can branch on one field across both gates.
- Merge with `shark-hf`:
  - Textual conflicts on the same lines in all three route files (`skills/route.ts` core list + `allowedOf`, `skills/[id]` `allowed`,
    `tools/[name]` guard block).
  - Semantics compose: keep both filters. `toolVerdict` already implies "general key only" for hand-written tools, so `generalToolGate`
    becomes redundant there but stays harmless.
  - Ordering in the tools route after merge: scope gate 403 → `key_not_general` 403 → executor gate 403.
  - Still open from round 1 (INFO): `isGeneralKeyActor` should call `isGeneralApiKey` (malformed scopes) once both are in.

**(f) The three ORACLE-EDITs**
- `qc-ai-automation` (×2) and `qc-kb-auto` (×1): only `actor: qcOwner(t.id)` added.
- `qc-crm-c1.10` S6.3 / S10.2: an inline OWNER actor of the tenant under test; X2.6 deliberately keeps no actor and now asserts the
  fail-closed answer.
- No expected value changed. Minimal.

## Round-1 findings — status

| # | r1 sev | status after r2 | evidence |
|---|---|---|---|
| F1 | HIGH | **open, by design out of this card** (own card; my r1 answer to Q3 stands) | R1.1–R1.3 still red |
| F2 | MED | **fixed** — no-branch actors refused and not offered; `approvals_pending` refused to the job; wording says it is not "no data" | S1.3 green · builder R2.1–R2.5 · B1.1 parity |
| F3 | LOW | open (owner decision R3; not in this round) | — |
| F4 | LOW | **fixed** — manifest = executor; refused call = 403 (body-shape nit above) | A1.4 green · A1.5 403 · H1.1 |
| F5 | LOW | **fixed** — no rights on the object; only `aiSystemActor()` objects count; frozen | W1 system-literal/spread · S1.1 · S1.2 · D1.2 refused |
| F6 | LOW | **fixed** — one actor check in `runTool`, the wrapper and the 4 adapters; no widest-read-set or cookie fallback | W1.* (1,020 calls) · W2.1 (145) · D1.1 · K1.2 |
| F7 | LOW | **fixed** — branch-limited callers refused (the member module's own `isUnitScoped`) | builder R7.1 |

New in round 2: none above INFO. Notes: the 403 body shape (LOW, merge hygiene); the two meanings of `unitAccess: []`; the optional fitness
grep for hand-written actor literals.

## Not verified (round 2)
- A production `next build` and a cron call on a deployed build: (b) is reasoned from the import graph, not measured.
- `qc-kb-auto` (loads `.env.local`).
- The builder's full `run-verify.sh` (I ran only its probes).
- A merged tree with `shark-hf`.

Typecheck (round 2, tree `01fc0705` + new probe, 5 GB heap, iso + gate lock): exit 0 (finished 01:07 UTC).

Verdict basis (round 2): the five fixes hold under exhaustive and adversarial checks. The only red left is F1, which the controller has
already split into its own HIGH card. The remaining items are LOW or INFO. The conditions from round 1 still apply: do not present G1 to
the owner as closing the shared-conversation leak, and F3 still needs the owner's decision.

VERDICT: MERGEABLE

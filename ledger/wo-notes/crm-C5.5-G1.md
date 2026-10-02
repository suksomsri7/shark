# CRM C5.5-G1 — AI tools run as the caller (builder note)

Branch `wip/crm-cf9` from `5ebea63f` (tip of wip/crm-cf8 incl. its review). Finding: G1 (sweep note) = F1 (sweep review): the platform
assistant's tools ran with `{ tenantId }` only, so `ai.chat.send` (or any shop API key on `/api/v1/ai/tools`) reached every tool.

## Map 1 — entry points that can execute tools × how the actor is known

| entry point | file | door | identity there | key checked before | actor passed now |
|---|---|---|---|---|---|
| `sendAiMessageAction` | `src/lib/ai/actions.ts` | web server action | session (`requireTenant` → user + active Membership) | `ai.chat.send` | `aiMemberActor(tenant, auth.user.id, auth.active)` |
| `POST /api/mobile/chat/send` → `sendMobileChat` → `sendMessage` | `src/app/api/mobile/chat/send/route.ts`, `src/lib/mobile/chat.ts` | mobile | Bearer token + `X-Tenant-Id` → `g.user` + `g.membership` | `ai.chat.send` (1 Oct hotfix) | `aiMemberActor(g.ctx.tenantId, g.user.id, g.membership)` |
| `sendMemberAssistantAction` | `src/lib/modules/member/assistant-actions.ts` | member module assistant page | session | `canReadMember` (unchanged — not `ai.chat.send`, see open questions) | `aiMemberActor(...)` from the same session |
| `POST /api/v1/ai/tools/[name]` | `src/app/api/v1/ai/tools/[name]/route.ts` | REST, API key | key: tenant, keyId, scopes, systemId | `toolAllowedForApiKey` (module scopes only) | `aiApiKeyActor(auth)` |
| `GET /api/cron/hourly` → `runScheduledTasks` → `sendMessage` | `src/lib/ai/scheduled.ts` | cron (secret) | none: task row has no creator; result = AppNotification `recipientUserId null` (every member reads it) | none | **system actor** `aiSystemActor(tenant, "scheduled-task")` |
| `GET /api/v1/ai/skills`, `/skills/[id]` | `src/app/api/v1/ai/skills/**` | REST listing | key | scope filter | none needed — no execution (unchanged; hotfix/apiv1-scope filters the listing) |
| confirm: `confirmProposalAction` · `confirmPlanAction` · mobile `proposals/confirm` · `plans/confirm` · `confirmMemberProposalAction` · CRM `aiBridges.confirmProposal` | `src/lib/ai/actions.ts`, `src/app/api/mobile/**`, member/crm modules | execute proposals/plans | confirmer's Membership | per-kind `KIND_ACCESS` with **the confirmer's** Membership (`executeProposal` → `assertCan`; `executePlan` → `runKind` per step; module kinds → `userActor` of the confirmer) | unchanged — verified (G15) |
| reject paths (web + mobile) | same | | | none for non-CRM kinds (owner decision D2) | unchanged (D2) |
| not tool doors (call the model without tools): CRM `runAssist`/call summary/card scan, chat `ai-suggest`, `proactive`, `analyst`, `dna-review`, `interview`, kanban/account AI helpers, `eval` (registry names only), `dataset` (records samples) | | | | | untouched (RV-3 family) |

Mobile `getAuth()` is cookie-only: before this card the CRM registry tools answered NO_HUMAN on mobile/cron/REST, and the member registry
tools fell back to a shop-wide read set there (fail-open). Both now receive the actor explicitly.

System-actor call sites (`grep -rn "aiSystemActor(" src`): **one** — `src/lib/ai/scheduled.ts` (`"scheduled-task"`). Justification: no
human, the task row stores no creator (no schema change allowed), and the output is published to every member, so it runs with the
rights of the least-privileged reader (STAFF, no keys, no branch): it sees what every member already sees on the web (POS totals, stock,
leave list, KB, v1 CRM, …) and nothing that needs a key or a branch. Owner decision proposed below (D-G1-a).

## Design — actor mandatory at the type level

- `src/lib/ai/actor.ts`: `AiActor = member | apiKey | system` (+ builders, `AI_SYSTEM_JOBS` = the only allowed system jobs with their
  fixed rights). Light file (rbac type only) — the AI registry is loaded by fitness F10 without env.
- `ToolCtx.actor: AiActor` is **required**; `runTool(ctx, name, args)` refuses (no data, no throw) when the actor is missing, of another
  tenant, or not permitted. `sendMessage(ctx: SendCtx)` requires `{ tenantId, actor }`. Proof that a forgotten door is a compile error:
  the first typecheck after the change failed exactly on the QC scripts that call `sendMessage`/`runTool` without an actor (fixed by the
  ORACLE-EDIT below).
- `src/lib/ai/tool-access.ts`: one table, used twice — `sendMessage` offers only usable tools (core list, `load_skill` enum and the
  skill index drop skills with no usable tool) and `runTool` re-checks every call (defence in depth: REST, or a model calling an
  un-offered name). Each key is decided by the module's own judge: CRM `crmCan` · member `canReadMember`/`hasMemberPerm` · account
  `membershipCanAccount` · kanban `kanbanMembershipCan` · others `evaluate` (same as the 1 Oct hotfix). No new permission keys.
- Action (proposal) tools need the key of whoever confirms that kind (`kindAccessOf` = the `KIND_ACCESS` table of `executeProposal`);
  `propose_plan` is offered to all but refuses a plan with any step the caller could not confirm.
- Module registry tools: key = the op's `action` (read key for reads, confirm key for writes); the runners now get the caller:
  account read actor = assistant read set ∩ caller's account rights; kanban reads run as the caller (`user` actor ⇒ board roles,
  PRIVATE boards hidden like the web) and the hand-written `kanban_my_tasks` filters with `visibleBoardsWhere`; member/CRM runners get
  role/unitAccess/permissions/userId explicitly (no cookie guess).
- API keys (executor rule, second line behind the route): module registry tools = `toolAllowedForApiKey` (same function as the route);
  hand-written tools touching CRM/member/account data, and tools that write immediately (memory, KB, support case), = refused for every
  key (route header promise: external AIs never change data without a proposal); other hand-written tools = general key only
  (scope-less, unbound — `isGeneralKeyActor`, same meaning as hotfix `isGeneralApiKey` minus its malformed-scopes refinement).

## Map 2 — hand-written tools × data × web door × rule (registry tools: 145 = account 36 · kanban 23 · member 54 · CRM 32, rule above)

| tool | data | web/REST door (agent sweep, file refs in sweep) | before | now |
|---|---|---|---|---|
| list_systems · ask_clarify · growth_recommendations | systems, counts | nav / dashboard, any member | none | open |
| remember_fact · forget_fact · list_memories | AiMemory (per tenant) | D1 | none | open (D1) · per tenant as before · keys refused (writes) |
| support_open_case | support case | any member | none | open · keys refused |
| sales_summary · sales_by_day | POS PAID | `/app/sys/[id]` POS hub, no key | none | open |
| low_stock | inventory | inventory hub, no key | none | open |
| pending_leaves | HR leaves | `hr/leave` page, no key | none | open |
| kb_search | KB | `/app/kb`, no key | none | open |
| reward_list_redemptions | legacy REWARD system | `reward/history`, no key | none | open |
| today_appointments · queue_waiting · shop_pending_orders · rental_active · restaurant_today · ticket_event_sales | unit-axis rows | `/app/u/[slug]/…` `requireUnit` (canAccessUnit), no key | none | open + **branch filter** (`unitId ∈ unitAccess` unless OWNER/`*`) |
| approvals_pending | approval requests | `/app/approvals` `listPending(ctx, m)` | none | open + **only requests waiting on the caller** (approval service) |
| upcoming_schedule | appointments, stays, leaves | `/app/calendar` `calendar.event.read` + `filterAccessibleUnitIds`; leaves need `hr.leave.read` | none | `calendar.event.read` + branch filter + leaves only with `hr.leave.read` |
| chat_unread_conversations | chat threads + customer names | inbox `requireChatRead` + `unitAccessWhere` | none | `chat.conversation.read` + `unitAccessWhere` |
| member_count | count | v2 KPIs `canReadMember` | none | `member.customer.read` (canReadMember) · count not branch-scoped (remaining R2) |
| customer_search · customer_points | member name/phone/points | v2 list/360 `canReadMember` + branch (`briefFor`) | none | `member.customer.read` + `visibleCustomerIds` (member module; exported from member/service) · keys refused |
| financial_summary | POS + account expense docs | account reports `account.report.view` | none | `account.report.view` · keys refused |
| recent_leads | CRM contacts (all systems) + form submissions | CRM contacts page `contactWhere` (v2: `crm.contact.read` + OWN/TEAM/ALL + team branches; v1: none); forms page: none | none | per CRM system `contactWhere` + phones masked with CRM `maskPiiDeep` (assistant rule C5.4-B, as `crm_search`) · keys refused |
| kb_auto_save | writes KB | `app/kb/actions.ts` `kb.article.create` (and proposal twin) | none | `kb.article.create` · keys refused |
| 30 proposal tools (pos_create_sale, member_create, record_expense, …) | proposal (+ summary reads) | confirm = `KIND_ACCESS` | none at propose time | caller must hold the confirm key of the kind |
| propose_plan | plan | confirm per step | none | every step's kind confirmable by the caller |
| kanban_card_from_chat (registry) | reads a chat thread | `kanban.card.create` + chat read | op key only | + `chat.conversation.read` |

## RED → GREEN (QC3, `scripts/pending/cf9/probe-cf9-g1.mts`)

Probe = real executor (`runTool`), real `sendMessage` with a scripted model, `sendMobileChat`, `runScheduledTasks`, the real REST
route with real API keys, the web action / mobile route / member-assistant action (mock echo model), `executeProposal`/`executePlan`.
One throwaway tenant, swept to 0 rows (CLEAN checks). Personas: OWNER · MANAGER limited to branch u1 · STAFF ai-only · STAFF ai+crm read
(team A) · STAFF ai+member read · STAFF ai+kb create · STAFF ai+pos.sale.create · general key · account-only key.

- **RED on 5ebea63f src: 17/47** (log `/tmp/cf9-logs/base-pending_cf9_probe-cf9-g1.log`; first RED run with 46 checks: 16/46,
  `g1-red.log`). 30 red = 27 leak checks (G1.1–G1.3 leads with full phones across CRM systems · G2.x members/points/count without a key
  and across branches · G3.1 finance · G4.1 KB written · G6.x chat/calendar · G7.1 other branch orders · G8.x account/kanban/member
  registry tools with no key · G9.x proposals/plans the caller cannot confirm · G10.x no actor/foreign actor · G11–G12 API keys incl. the
  real route · G13.x model offered everything and executor ran un-offered tools · G14.x mobile lib + scheduled job leaks) + G0.1 (no
  access table) + 2 intended behaviour changes: P1.1 (OWNER's `recent_leads` phones now masked) and P8.2 (CRM tools now work off-cookie
  as the caller, e.g. mobile — before: NO_HUMAN).
- **GREEN: 47/47** (v1 and v2 runs, logs `v1-…probe-cf9-g1.log`, `v2-…`).
- OWNER byte-for-byte (26 read tools, normalised ids/dates): identical between the trees except `recent_leads` (phones masked — intended)
  and `list_memories` (fixture difference: on the RED tree the API key's `remember_fact` had succeeded — the G11 leak itself).
- Step 4 evidence: G15.1 an OWNER proposal confirmed by STAFF ai-only → refused, row stays PENDING; G15.2 an OWNER plan confirmed by
  STAFF ai-only → no step runs (green on both trees — confirm already re-checks the confirmer). I15.2: the plan row becomes FAILED.

## Verification

Runner `scripts/pending/cf9/run-verify.sh` (from a /tmp copy · QC3 · iso.sh + gate lock · one at a time · summary `/tmp/cf9-logs/v2.summary`).

| check | v2 (final tree) | 5ebea63f |
|---|---|---|
| `pnpm typecheck` (5 GB heap) | exit 0 | — |
| probe-cf9-g1 | 47/47 | 17/47 |
| probe-cf8-mobile · probe-cf8-actions | 8/8 · 9/9 | — |
| probe-cf8-review | 18/19 — X1.3 no longer reproduces (route `recent_leads` with an account-only key → 200 with a refusal, no phone). X1.4 still "reproduces" because it calls the route-level `toolAllowedForApiKey` only (unchanged); the executor now refuses all five tools (G11.1). X1.2 (`/api/v1/customers`) = hotfix/apiv1-scope's door, unchanged here | 19/19 |
| qc-mobile-authz-hotfix · qc-automation-authz-hotfix · qc-payment-authz-hotfix | 12/12 · 12/12 · 8/8 | — |
| qc-crm-c3.4 (AI bridges) · qc-crm-c1.7 · qc-crm-c2.11 | 53/53 · 57/57 · 47/47 | — |
| qc-crm-c1.10 | 66/67 (H.1 = HTTP on :3215) | 66/67 same |
| qc-ai-automation | 4/4 | — |
| qc-account-api-ai-skill | 23/33 (K2.x/K3.6–11 need the acc-v2 seed) | 23/33 same ids |
| qc-account-api-ai-external · qc-kanban-k1.15 · qc-member-m1.11 · qc-member-m3.10 | CRASH · 29/30 · 24/26 · 6/21 (HTTP :3215 401 / skill copies / screenshots) | identical |
| gen-{crm,member,kanban,account}-api-docs --check | exit 0 ×4, no tracked change | — |
| fitness (QC3 env) · fitness (no env) | 39/39 · 39/39 (F10 green) | — |

v1 run (before the last fix) had qc-crm-c1.10 63/67: S6.3 · S10.2 · X2.6 call `AiTool.execute` directly without an actor and the
module adapters crashed on it — fixed (`aiActorMembership/aiActorUserId` accept a missing actor ⇒ the runner's old fail-closed path);
v2 = baseline.

## ORACLE-EDIT (suites that call the executor directly)

`runTool`/`sendMessage` now need an actor, so 17 QC scripts got a one-line explicit OWNER actor (`qcOwner(tid)`, marked
`ORACLE-EDIT C5.5-G1`) — what they always assumed: qc-ai-actions · qc-ai-tools · qc-ai · qc-ai-credit · qc-ai-vision · qc-mobile-chat ·
qc-account-api-ai-skill · qc-chat-notify · qc-ai-growth · qc-ai-phase-b1 · qc-ai-phase-a · qc-ai-memory · qc-ai-proposals ·
qc-ai-phase-b2 · qc-ai-tools2 · qc-kb · qc-ai-wave5b. Only qc-account-api-ai-skill was runnable here (others load `.env.local`).

## Prod main 929c39ce + hotfix/apiv1-scope

- The AI files touched here are identical on prod (`git diff 929c39ce 5ebea63f` over src/lib/ai, the REST tools route, mobile chat,
  member assistant actions = only `proposals.ts` +5 and `dataset.ts`) ⇒ G1 is live on prod exactly as reproduced (RED run).
- Two dependencies are newer than prod: `visibleCustomerIds` (member/service, C5.4 H2) and the assistant PII masking of CRM `present()`
  (C5.4-B L5-m3). Shipping G1 to prod alone: port `visibleCustomerIds` with it (or filter with `briefFor`, which prod has) and decide
  whether `recent_leads` masks phones before `crm_search` does (recommend: ship together with C5.4-B).
- hotfix/apiv1-scope (route-level, 3 commits) is not ported. Overlap: both edit `src/app/api/v1/ai/tools/[name]/route.ts` (imports +
  one line each) — trivial textual conflict. Verdicts agree: the hotfix answers 403 `key_not_general` at the route for non-module tools
  with non-general keys; this card's executor refuses the same calls (and additionally refuses CRM/member/account data and immediate
  writes to general keys). After both land, `isGeneralKeyActor` should call the hotfix's `isGeneralApiKey` (malformed scopes).

## Remaining (not done in this card)

- **R1 shared AI conversations** (needs schema → own card / owner decision): `AiConversation` has no user, web opens the shop's latest
  conversation and mobile lists all; a member with `ai.chat.send` can read (and continue, with history in the prompt) answers produced
  with another member's rights. Running tools as the caller does not cover history.
- R2 `member_count` is gated by `member.customer.read` but counts the whole member system (not branch-scoped).
- R3 tools whose web door has no read key stay open by design (POS totals, stock, leave list, KB, legacy rewards, forms in
  `recent_leads`, v1 CRM): if owners want keys there, the web doors need them first.
- R4 REST route accepts any `body.conversationId` of the shop for write tools (a key can drop a proposal card into an owner's existing
  conversation). Route-level — pair with hotfix/apiv1-scope.
- R5 `executePlan` claims PENDING→RUNNING before the per-step check: a non-permitted confirmer cannot run anything but turns the plan
  FAILED (I15.2). Pre-existing.
- R6 confirm paths call `assertCan` without `unitId` (branch-limited MANAGER passes unit-scoped kinds shop-wide; static kinds pick the unit
  by name/first ACTIVE); `approval_decide` receives `m` without userId. Pre-existing.
- R7 direct `AiTool.execute` without an actor (only QC scripts do it; every door goes through `runTool`): module runners keep their old
  fallback (member: assistant read set; CRM: cookie viewer or refuse).
- R8 `support_open_case` still records opener `"ai-assistant"` (could now record the actor's user).
- R9 member legacy tools show the full phone to permitted viewers (OWNER output kept byte-identical) while member lists mask phones —
  owner decision whether to mask.

## Not verified

- Web action, mobile route and member-assistant action were driven only with the mock echo model (no tool calls) — positive controls
  that the doors still answer and build the actor; the tool path behind them was driven through `sendMessage` / `sendMobileChat` /
  `runScheduledTasks` with a scripted model. No live model calls.
- The 17 ORACLE-EDITed suites except qc-account-api-ai-skill, and every other suite that loads `.env.local` (qc-mobile-chat, qc-ai-*,
  qc-kb, qc-chat-notify, …), were not run.
- HTTP checks against the QC server :3215 (red on both trees), mobile app on a device, prod.
- Kanban PRIVATE-board filtering for AI reads (code path = `kanbanCtxOf` user branch / `visibleBoardsWhere`) — refusal and OWNER
  positive checked, no PRIVATE-board fixture.
- Approvals/unread chat/appointment/queue/rental/restaurant/ticket branch filters — only `shop_pending_orders` has a fixture (G7.1); the
  others use the same `unitWhere` helper.

## Open questions (owner / controller)
- **D-G1-a** scheduled tasks run as the least-privileged reader (they publish to every member). Alternative: run with OWNER rights and
  send the notification to OWNER users only (`recipientUserId`). Either is a behaviour change for shops that schedule key-gated summaries.
- Proposal tools now need the caller's own confirm key: a STAFF can no longer "propose for the owner to confirm" (the card summary
  read data of that module). Keep, or allow proposing with confirm left to others for kinds whose summary reads nothing?
- R1 (per-user AI conversations) and R9 (mask phones in legacy member tools).

## Round 2 (review `crm-C5.5-G1-review.md` · F2 F4 F5 F6 F7 · F1/F3 and the owner questions not in this round)

| finding | change |
|---|---|
| F2 MED | `tool-access.ts`: branch tools (`today_appointments` `queue_waiting` `shop_pending_orders` `rental_active` `restaurant_today` `ticket_event_sales`) are `branchScoped` — an actor with **no usable branch** (`actorBranches(actor)` = `[]`: the scheduled job, a member with `unitAccess []`, same rule as `canAccessUnit`) is **refused and not offered** (text says it is not "no data"). `approvals_pending` is `needsPerson` — refused/not offered to the system actor (no approver identity); humans keep it (their list is truthful). `tools.ts` `unitWhere` now reads the same `actorBranches`. Scheduled-task identity unchanged (least-privileged); no creator tracking. |
| F6 | `actorProblem(ctx)` (actor.ts) = the one first gate: missing / unknown kind / other tenant / non-genuine system actor ⇒ refusal. Used by `runTool`, by a wrapper on every registry entry (`toolRegistry()` = `registryTools().map(guarded)`), and inside the four module adapters (they can be called directly: `crmTools()` …) — no widest-read-set fallback anywhere. The tolerant `!actor` branches of round 1 were removed. API-key actors now pass an explicit key viewer to the member and CRM runners (`keyPermissions(scopes)`, no userId) so neither consults the request cookie (CRM refuses: no human). |
| F5 | `AiSystemActor` has no rights field any more; rights come from the job name, and only objects built by `aiSystemActor()` count (module-private `WeakSet`, object frozen). A literal `{ kind: "system", membership: OWNER }` ⇒ `actorProblem` refusal; `aiActorMembership` returns null for it. |
| F4 | `GET /api/v1/ai/skills` (core list + skills + toolCount) and `/skills/[id]` filter with `toolVerdict(aiApiKeyActor(auth), name)` after the existing `skillToolsForApiKey`. `POST /api/v1/ai/tools/[name]` runs `toolVerdict` before anything (before opening a conversation) and answers **403 `{ error }`** — the route's other refusals are 403. Hotfix/apiv1-scope: same three files, each change is one extra filter/guard next to the hotfix's `generalToolGate` lines → small textual conflict, no semantic conflict. |
| F7 | `member_count` is `memberWholeShop`: refused to callers the member module treats as branch-limited (`isUnitScoped`), unchanged for shop-wide readers. |

ORACLE-EDIT r2 (direct `AiTool.execute` without an actor now refuses): `qc-crm-c1.10` S6.3 (the OWNER of T proposes `crm_create_deal`) and
S10.2 (the OWNER of TB runs legacy `crm_create_lead`) pass an explicit OWNER actor; **X2.6 deliberately keeps no actor** — it asserts the
fail-closed answer and still passes. `qc-ai-automation` (2 calls) and `qc-kb-auto` (1 call) pass `qcOwner(t.id)` (qc-kb-auto loads
`.env.local` — not run).

Probe `scripts/pending/cf9/probe-cf9-g1-r2.mts`: **RED 7/18 on fdf3cd36 src** (R2.1–R2.5 · R6.1 · R6.2 · R5.1 · R4.1 · R4.2 · R7.1;
log `/tmp/cf9-logs/r2-red.log`) → **GREEN 18/18** (`r2-green1.log`). Positive controls P2.1 P4.1 P5.1 P6.1 P7.1 green on both trees.

Verification r2 (QC3 · iso.sh + gate lock · one at a time · `/tmp/cf9-logs/v3.summary` = full run on the r2 tree, then
`v4.summary` = the subset re-run after the refusal texts were reworded to name the missing right — "คุณไม่มีสิทธิ์…: … (ไม่ได้แปลว่าไม่มีข้อมูล)"):

| check | r2 |
|---|---|
| `pnpm typecheck` (5 GB heap) | exit 0 (v3, v4) |
| probe-cf9-g1 (round 1) · probe-cf9-g1-r2 | 47/47 · 18/18 (v3, v4) |
| reviewer probe-cf9-g1-review | **15/18** — S1.3 and A1.4 flipped green; red = R1.1 R1.2 R1.3 only = F1 (shared AI conversations), out of this round **by design** (own card). Its info lines now read: A1.5 refusal = HTTP 403 · D1.1 execute without actor → error · D1.2 forged system literal → refused |
| probe-cf8-mobile · probe-cf8-actions · probe-cf8-review | 8/8 · 9/9 · 18/19 (X1.3 no longer reproduces — as round 1) |
| qc-mobile-authz-hotfix · qc-automation-authz-hotfix · qc-payment-authz-hotfix | 12/12 · 12/12 · 8/8 |
| qc-crm-c3.4 · qc-crm-c1.7 · qc-crm-c2.11 | 53/53 · 57/57 · 47/47 |
| qc-crm-c1.10 (S6.3 · S10.2 ORACLE-EDIT, X2.6 no actor) | 66/67 — only H.1 (HTTP :3215), same as 5ebea63f |
| qc-ai-automation (ORACLE-EDIT) | 4/4 |
| qc-account-api-ai-skill | 23/33 — same ten ids as 5ebea63f (acc-v2 seed) |
| qc-account-api-ai-external · qc-kanban-k1.15 · qc-member-m1.11 · qc-member-m3.10 | CRASH · 29/30 · 24/26 · 6/21 — identical to 5ebea63f (env) |
| gen-{crm,member,kanban,account}-api-docs --check | exit 0 ×4 |
| fitness (QC3 env) · fitness (no env) | 39/39 · 39/39 (F10 green) |

Not verified r2: `qc-kb-auto` (ORACLE-EDIT, loads `.env.local`); a member with `unitAccess []` losing the branch tools is the web rule
(`requireUnit`) but may surprise shops whose STAFF rows store `[]` — count them on prod read-only before release if wanted.

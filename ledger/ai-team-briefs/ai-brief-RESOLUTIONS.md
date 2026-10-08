# AI TEAM — RESOLUTIONS (read right after COMMON; overrides any brief, AI-TEAM-RUN and the design where they differ)
Every item is a DECISION, not a suggestion. If real code makes one impossible, the controller records a new decision in the work order's "Controller addendum" — never silently. Owner decisions are quoted from `ledger/DESIGN-AI-TEAM.md` §1 (1 Oct 2026, two rounds); defaults for the three open items of §6 were set by Fable on 8 Oct and are reversible by one owner message.

## R-A. Owner decisions (binding) and defaults taken for DESIGN §6
| # | item | decision |
|---|---|---|
| R-A1 | Product | **SHARK HUB v2**, same bundle `th.in.shark.ai`, version 2.0.0, iOS + Android. No new app. 1.0 screens keep working for `uiVersion !== 2`. |
| R-A2 | Billing model | Monthly subscription per tenant ("like Claude"). Over the cap → the existing credit wallet is the top-up ("use beyond the pack"). **Version 2.0 is not sold**: every tenant is on the FREE pack; paid packs are shown disabled with "เร็ว ๆ นี้"; **no payment of any kind in the app, top-up button closed** (DESIGN §6.3 — default: closed; T3.5 deferred). |
| R-A3 | Free pack | Resets monthly; **bound to the owner user** — all tenants of one owner share one allowance. A tenant without a resolvable owner (REVIEW decides the rule) binds to the tenant. |
| R-A4 | Welcome credit | **No new $10 grant** (the lazy grant in `credit.ts` is switched off in T3.6). Balances already granted: **keep until used** (DESIGN §6.2 default). Wallet code stays; `overflowMode` in 2.0 = PAUSE only. |
| R-A5 | Free pack size during the unsold phase | DESIGN §6.1 default: **generous trial allowance**, concrete number fixed in T0.4 from the T0.1 cost table (not the "≈50 tasks" in the mockups); recurring tasks and approvers on FREE also fixed in T0.4. Until T0.1 is measured **no task count, no "≈ N งาน", is shown anywhere in the app or sent to the owner as a promise** (§7.1). Pack prices stay 490 / 1,490 / 3,990 (shown disabled). |
| R-A6 | Hiring | Unlimited AI employees, no per-head price; the team shares the pack; per-employee cap `quotaCapPct` (default from the position template, 25 % in the mockup). |
| R-A7 | Style | Liquid Glass · Airy; no bottom tab bar; menu from the profile avatar; dark mode (T5.4); tenant switcher as a bottom sheet; avatar stack (humans + AI) top-right. |
| R-A8 | Vocabulary | "งาน" (never "session"); "พนักงาน AI"; users never see "token"; quota as %, tasks, hours. |
| R-A9 | Promotion | AUTO offered at ≥ 95 % unedited of the last 50 tasks of that (employee × task kind); automatic demotion below 90 %. |
| R-A10 | Reports | **No wages, no baht value of work, anywhere** (team report, profile, store texts). Show hours saved (fixed minutes per task kind), tasks done, pass %, average approval wait, quota used. |
| R-A11 | Hiring flow | Position template → persona (gender ⇒ ครับ/ค่ะ, tone, humour, length, languages) → manual with 6 sections + version history → access 4 levels per system + quota cap. **No "trial run" button**; "ตัวอย่างการพูด" is a template rendered from the persona values (no model call). |
| R-A12 | Order | Code starts now (CRM is on main since 7 Oct); runs in parallel with POS/HR on the same QC4; lane cap = owner's order (default 1). |

## R-B. Ownership of design items that had no owner
| item | owner | decision |
|---|---|---|
| `src/lib/ai/team/index.ts` facade + `ALLOWED_EDGES` entries | **T1.2** creates; later WOs add exports only | other modules call the team layer only through it |
| `src/lib/ai/team/kind-class.ts` (proposal-kind → `MONEY/CUSTOMER_FACING/DESTRUCTIVE/INTERNAL`) | **T1.6** (needed for default levels and inbox filters) | T4.2 relies on it for "never AUTO" |
| `src/lib/ai/team/packs.ts` (`FREE_PACK`, pack table, flags `AI_TEAM_SALES_ENABLED=false`, `AI_WELCOME_GRANT=off`) | **T0.4** | T3.x read it; nobody duplicates constants |
| Fitness file «scripts/fitness-ai-team.mts» (F16.1 no "token"/"บาท" in team strings · F16.2 templates reference real skills · F16.3 no money in team report DTO · F16.4/F16.5 testID inventory · F16.6 every tool call path charges) | **T0.2** creates the file with F16.1–F16.3 as ratchets; T2.1 adds F16.4/F16.5; T3.1 adds F16.6 | registered in `scripts/qc-all.mts` by T0.2 |
| `scripts/seed-ai-team-qc.mts` + `scripts/ai-team-qc-env.mts` | **T0.2** | all AI-team oracles seed through it; it never touches POS/HR/CRM seed tenants |
| Mobile API doc generator / «docs/api/AI-TEAM-MOBILE-API.md» | **T0.2** writes the doc by hand from zod schemas; **T1.10** wires the generator if the repo has one for `/api/mobile` (REVIEW decides) | |
| "แจ้งฉันเมื่อเปิดขาย" list (`AiSaleNotify`) | **T3.6** | T3.4 only calls it |
| Approval wait reminder (4 h) + escalation to owner | **T1.9** (reads existing `ApprovalPolicy`; adds a lease-claimed reminder job) | the 4 h and the money threshold come from the tenant's policy, not constants in the app |
| Hours-saved constants per task kind | **T4.5** (`templates.ts` gets `estimatedMinutes` per frequent task; unknown kinds = 0) | never derived from model timing |
| Default employee for existing shops ("ผู้ช่วยทั่วไป") | **T1.2** creates lazily at read time; **T6.1** backfills rows | persona neutral, all skills at DRAFT (= today's behaviour), `isDefault = true`, cannot be terminated (only paused) |
| Tenant → owner mapping for the FREE pack | **T3.6**, rule from REVIEW (Membership role OWNER with the lowest createdAt, or `Tenant.ownerUserId` if it exists) | changing owner moves the subscription binding with an audit row |
| Undoable kinds registry + reverse adapters | **T4.3** | each reverse goes through the owning module's facade (account void, kanban move back, content unschedule, chat unsend if provider allows) |
| Knowledge sources "pulled from SHARK automatically" | **T4.6** adapters (inventory items + prices, opening hours/branches) through the owning facades | no copying of data into KB tables |
| Deep links `shark://team/...` + push payload routing | **T2.1** (routing) · **T2.11** (notification settings) | push senders stay the existing ones |
| Dark-mode contrast checker script | **T5.4** | runs on the final 36×2 set in T6.2 |

## R-C. Resolved contradictions (design ↔ code ↔ plan)
| # | conflict | ruling |
|---|---|---|
| R-C1 | DESIGN §4.1 lists `AiSubscription.tenantId`; R-A3 binds the FREE pack to the owner | `AiSubscription` has both `tenantId?` and `ownerUserId?` (exactly one set); FREE rows use `ownerUserId`; paid rows (future) use `tenantId`. Lookup order at charge time: tenant row → owner row. |
| R-C2 | DESIGN says scheduled tasks are "read/summarise only" today and the new design wants DRAFT/AUTO output | T1.8: a scheduled task that needs to write produces a **proposal** (DRAFT) exactly like a chat turn; AUTO only after T4.2 through the same delegation check. The old read-only guard stays for tasks without `employeeId` (byte-identical). |
| R-C3 | Mockup C2 shows task counts per pack | Counts are rendered only when `packs.ts` has `approxTasks` filled from T0.1; until then the card shows the allowance as "ใช้ได้ถึง X% ของโควตาฟรี" wording from T0.4 — never a placeholder number from the mockup. |
| R-C4 | Mockup A1 shows "6.5 ชม. เวลาที่ประหยัด" (hours) and B7 shows the same; older v1 mockups showed baht | Hours only (R-A10). The "hours" figure = Σ `estimatedMinutes` of completed tasks (T4.5). Before T4.5 the card shows tasks done and pending approvals only (placeholder noted in wo-notes). |
| R-C5 | DESIGN §4.3 proposes dropping `AiUsageWindow` (5 h/weekly window) | Keep the code; disable the window for tenants whose owner has a subscription row (T3.1 flag `windowDisabled`); oracle asserts the old window still applies when no subscription exists. |
| R-C6 | DESIGN T2 says "native screens"; today's home is a WebView dashboard | v2 (team) screens are native. The WebView dashboard stays reachable from the menu ("เปิดเว็บหลังร้าน") for things the app does not cover (connecting LINE/FB, inviting people, business settings). D2's "เชื่อม LINE/FB/สินค้า" opens those web pages in the existing webview with session exchange. |
| R-C7 | Mockup B5 shows AUTO ("ทำเองได้") as a selectable level at hire time | Until T4.2 the AUTO option is rendered **disabled** with a hint "เปิดได้หลังผ่าน 50 งาน" (i18n key exists from T2.9); the API refuses `level: AUTO` with `employee_auto_not_granted` until T4.2. |
| R-C8 | Mockup C3 (top-up) shows a card and PromptPay | Rendered as a disabled informational screen in 2.0: prices greyed, no payment sheet, no card entry, button disabled; T3.4 oracle asserts no network call to any payment endpoint. |
| R-C9 | DESIGN T1.1 says "push immediately" after the migration WO | push main needs the owner's "ทำ" (production deploy + prod migration). T1.1 is accepted into `session/ai-team` and the owner is asked at CP1; development continues on QC4 regardless. |
| R-C10 | Mockup A7 "ยกเลิกงานที่ AI ทำไปแล้ว เฉพาะเจ้าของ และคุณนิด" | Undo permission = `ai.action.undo` granted to OWNER by default and to named users via the tenant's approval policy UI (web). T4.3 reads it; no new role concept. |
| R-C11 | Several mockups show absolute times "9:41", "เมื่อวาน" | Relative/absolute time formatting = the app's existing helper (Bangkok); oracles never assert on rendered times. |
| R-C12 | Mockup C4 lists "ใบเสร็จ & ใบกำกับภาษี" | Rendered disabled "เร็ว ๆ นี้" (belongs to T3.5). |

## R-D. Lane/file ownership when more than one lane runs
- Lane A (server): `src/lib/ai/team/**`, `src/app/api/mobile/team/**`, `prisma/schema/ai_team.prisma`, `scripts/qc-ai-t1*.mts`, `scripts/seed-ai-team-qc.mts`, docs.
- Lane B (app): `apps/mobile/app/(app)/{team,tasks,inbox,hire,profile,settings,plan,rooms}/**`, `apps/mobile/src/components/team/**`, `apps/mobile/src/theme/{tokens,light,dark,index}.ts`, `apps/mobile/qc/shoot-ai-team.mjs`, `apps/mobile/qc/fixtures/ai-team/**`, `scripts/ai-team-ui-inventory.json`, `scripts/parity-ai-team.sh`.
- Shared hot files (COMMON §D) are edited by **one WO at a time**, named in its brief, smallest hunk, and the controller merges them first.
- Lane B works against mock fixtures until T1.10 is accepted; the brief of each T2 WO lists which fixture it uses and the T2 wrap-up (after T1.10) swaps mocks for the real API with a "live" screenshot set.

## R-E. Rulings on the code survey's conflicts (REVIEW-AI-TEAM-DESIGN-2026-10-08.md §8 C1–C35 · ruled by Fable 8 Oct · binding)
| # | ruling |
|---|---|
| C1 | Do not touch `Plan`/`core.prisma`. Packs live in `AiSubscription.pack` (new enum `AiPack FREE STARTER PRO BUSINESS` in `ai_team.prisma`). `planLimits()` stays dead. |
| C2 | `AiSubscription` is **global axis** (`g()` in `scope.ts`, like `PushDevice`), keyed by `ownerUserId` (unique where pack = FREE) or `tenantId` (paid, future). `AiPackBinding` (tenant axis, `tenantId @unique → subscriptionId`, `resolvedOwnerUserId`) is created lazily by `quota.ts#ensureBinding` with the fixed rule: OWNER membership with the oldest `acceptedAt` (tie → oldest `createdAt`); no OWNER → bind to the tenant itself (`tenantId` subscription, FREE). Owner transfer (`platform/account-deletion.ts:90` path) re-binds with an audit row (T3.6). |
| C3 | T3.6 lands **after** T3.1. T3.1 replaces `canSpend`'s meaning at the single choke point in `credit.ts`: `canRunAi(tenantId, opts?)` = pack allowance left OR (overflowMode = WALLET AND wallet > 0); `canSpend`/`canSpendPeek` keep their names and become wrappers so the 16 callers do not change. Degrade (`service.ts:146`) is driven by pack % (≥ 95 % used → FAST_MODEL), not wallet balance. The welcome grant is disabled in code (`AI_WELCOME_GRANT` flag in `packs.ts`, default off) — not only by env. |
| C4 | `AiUsageWindow`/`recordQuotaUsage`/`getQuotaStatus` are dead: leave them, do not build on them, do not delete in this run (T6.3 notes them as debt). `AiUsage` daily net stays and can still block even with pack left — contract T3.1 says so. |
| C5 | Charging is split in **`credit.ts#chargeUsage` only** (one tx: pack counter single-statement UPDATE … RETURNING, then wallet only for overflow WALLET). All 17 callers are unchanged. Every tenant-paid `AiCreditSource` counts against the pack; `SUPPORT_DRAFT` stays platform-paid. Owner question Q4 opened with this default. |
| C6 | Add `AiCreditTxn.aiEmployeeId String?` + `subscriptionId String?`; `ChargeInput` gains `aiEmployeeId?`; `service.ts:342` starts passing `userId` and `aiEmployeeId` (from the task of the conversation). |
| C7 | **No columns on `AiConversation`.** New `AiTask` (1:1, `conversationId @unique`, `aiEmployeeId`, `roomId?`, `status`, `title`, `startedById`, `archivedAt?`). Conversations without a task are read as the tenant's default employee (left join at the read layer). All FKs are `aiEmployeeId`. |
| C8 | Task rooms get a new id tag `e~<aiEmployeeId>~<hex>` in `conversation-owner.ts` (pure, no DB). Visibility rule for `e~` rooms = (task starter) ∪ (employee's commanders, from DB) ∪ (users who may confirm that kind: `membershipCan` on the proposal kind); the DB-backed part lives in `conversations.ts`/`tasks.ts`, never in the pure file. `sightOfConfirmer` keeps today's behaviour for `u~`/`k~`/`s~`; `e~` goes through `tasks.ts#canSeeTask(userId)`. Owner-only reading of other members' `u~` rooms stays closed (C5.5-G2 stays fixed). T1.7 🎯 hunter + regressions G1/G2/G3. |
| C9 | No `ApprovalRequest` for AI work. The proposal path is the approval. `resolvePolicy(ctx, {entityType: "ai.<kind>", amountSatang})` is used read-only (T1.9) to label "needs owner / over limit" and to drive the 4 h reminder; the money threshold comes from the policy, else from `AiSettings`. |
| C10 | `src/lib/ai/team/auto.ts` loads the grantor's **fresh** Membership (`acceptedAt ≠ null`) and calls `executeProposal(mGrantor, ctx, id, {userId: grantorId})` — **never** `confirm2x`. `PLAN_HUMAN_ONLY` kinds and CRM-door kinds are never AUTO. The grantor must be able to see the task room (C8) or the AUTO is downgraded to DRAFT with notification. |
| C11 | Pure file `src/lib/ai/team/kind-class.ts`: `classOfKind(kind) → {destructive, money, customerFacing, reversible}` derived from `DESTRUCTIVE_KINDS` + module of op (`account.*` money, `crm.*` send/e-mail + `member.*` campaign/notify + chat send = customerFacing) + hand-written table for the 36 static kinds; unknown kind ⇒ money + customerFacing (fail-closed), never reversible. No new column. |
| C12 | T1.8 adds nullable columns to `AiScheduledTask` (not hot): `aiEmployeeId createdById frequency daysJson minute channelsJson outputMode claimedAt`. Runs claim first (`updateMany where lastRunDay ≠ today AND (claimedAt null OR claimedAt < now − 15 min)` → set claimedAt) and write `lastRunDay` after. Employee-bound tasks run with `aiMemberActor(createdById)` ∩ the employee's access; legacy tasks (no employee) keep the system actor, and the `writesNow` leak for the system actor (`remember_fact` `forget_fact` `support_open_case`) is closed in the same WO. |
| C13 | No new `AiActor` kind. An employee turn runs as the **commanding user's** member actor (chat) or the **grantor's** member actor (AUTO/scheduled) with `aiEmployeeId` carried in `ToolCtx`/`SendCtx`. The prompt builder is a new file `src/lib/ai/team/persona-prompt.ts` (`buildEmployeePrompt`, English); `persona.ts` stays for the default employee until T1.4 migrates the default employee to the new builder behind a flag. |
| C14 | Knowledge grants at `KbArticle.category` level (+ the two automatic sources). `kbSearch` (tools.ts:395) filters when `ctx.aiEmployeeId` is set; no employee → today's behaviour. |
| C15 | Access enforced in two places: `service.ts:176` (offered skills/tools) and `tools.ts#runTool` (dispatch), plus `executeProposal` re-checks the employee's access is not OFF/READ for that kind at confirm time. Core tools map to a virtual skill id `core` for levels (`memory`/`knowledge` writes follow that level). |
| C16 | T2.1: `(app)/index.tsx` becomes the native team screen; the WebView moves to `(app)/web.tsx` (menu "เปิดเว็บหลังร้าน"). The tenant switcher becomes a bottom sheet. Drawer stays mounted (for 1.0 behaviour) but hidden in v2. Zones `crm/` and `member/` and `CrmTabBar` are untouched. |
| C17 | Glass = JS-only tokens (rgba + border + shadow) so the web-export parity matches; optional native blur behind a capability check, falling back to the same tokens. `userInterfaceStyle: "automatic"` is set in T5.4 (needs a build — recorded). |
| C18 | Language is a prompt parameter only; app UI stays Thai (en strings mirrored in i18n for future). |
| C19 | New `/api/mobile/team/quota` for v2. `/api/mobile/usage` keeps its exact shape; `pct` becomes pack %, `balanceMicro` keeps the wallet number, and the GET path stops writing (`canSpendPeek`-style read). |
| C20 | T2.6 adds `PlanCard` using the existing `plans/*` routes. |
| C21 | New helper `src/lib/mobile/team-auth.ts#requireMobileUser(req)` (Bearer + accepted memberships, no `X-Tenant-Id`). Inbox rows are evaluated with that row's tenant membership; decide calls still send `X-Tenant-Id` of the row. |
| C22 | No change to `ActorType`. Audit rows for AUTO: `writeAudit({actorType:"USER", actorId: grantorId, action:"ai.auto.<kind>", targetType:"AiProposal", targetId, after:{aiEmployeeId,…}})`. `AiActionLog` (new) is the source for screen C6 and undo. |
| C23 | `REVERSIBLE` whitelist with explicit inverse per kind (T4.3); kinds without a known inverse have no undo button. |
| C24 | `AiNotifyPref` (new, `userId+tenantId` unique) instead of columns on `AppNotification`; push `data.link` carries deep links. |
| C25 | Tenant-level team settings are nullable columns on `AiSettings` (`defaultApproverUserId`, `undoWindowSec`, `teamPausedUntil`); `getAiSettings` returns them. |
| C26 | Add `AiProposal.aiEmployeeId? decidedById? decidedAt? autoExecuted @default(false)` in T1.1; the migration is applied to QC4 before any code reads them; prod deploy order (T6.1) = migration first. |
| C27 | Rooms/hand-offs are task→task (async) via `AiHandoffFlow`; `AiPlan` stays a single-room plan. |
| C28 | "Every kind" oracles iterate `KIND_ACCESS` (real registry), never a hand list. |
| C29 | Never reuse `Team*` models; AI rooms are `AiRoom*`. |
| C30 | Position templates use only skills that surface through `skillsForTenant(AppSystem.type)`: sales · account · members · crm · tasks · chat · knowledge · memory · approvals · automation. The 7 unit-type skills are a recorded debt (not fixed in this run). |
| C31 | `permissions.ts` module `ai` gains `ai.employee.read` `ai.employee.manage` `ai.employee.use` `ai.access.grant` (OWNER-only, pattern `CRM_OWNER_ONLY_KEYS`) `ai.schedule.manage` `ai.action.undo` `ai.room.manage`; granting AUTO also passes `canGrantPermission` (cannot delegate what you lack). |
| C32 | Team server actions live in `src/lib/actions/ai-team.ts` (covered by fitness F6). |
| C33 | `/api/mobile/proposals/confirm` keeps not requiring `ai.chat.send` (approvers may lack it); written into T1.9/T1.10 contracts. |
| C34 | T0.1 measures through the real `sendMessage` (source CHAT) and reads cost from `AiCreditTxn` USAGE rows per measured conversation; haiku and sonnet paths both measured per `pickModel`. |
| C35 | No new `AiCreditSource` value in this run; employee attribution = `AiCreditTxn.aiEmployeeId`. |

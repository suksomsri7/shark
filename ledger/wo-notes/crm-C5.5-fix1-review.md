VERDICT: MERGEABLE AFTER RV-6 (approval reading — small, in this card) · RV-1..RV-4 are PRE-EXISTING holes (C5.4 / platform) that this card does not worsen → next fix card(s), RV-4 is prod-exposed and urgent · RV-5 needs the owner (gitignored skill docs)

# C5.5-fix1 — independent review (Opus 5.5 · 1 Oct 2026 · read-only on src/)
Tree `/root/projects/shark-crm-c54e` HEAD 24b86d18 · diff `git diff 775d393e 24b86d18 -- src docs` · QC3 only · my probe `scripts/pending/c55/review/probe-review.mts` · reruns `scripts/pending/c55/review/run-review.sh` · logs `/tmp/c55-logs/review/`.

## Checkpoint
- [x] read hunt-1 + fix1 notes + diff + builder probes (probe-idem/auto edits = import form only, no oracle change)
- [x] code-read: H55-1, H55-2 action table vs every manual door, webhook write paths, L55-3/4, D2 merge
- [x] review probe run 1 (`probe-review.log`) · run 2 (`probe-review-2.log`, longer lock for RV-I3) — see Rerun numbers
- [x] regression reruns → `/tmp/c55-logs/review/SUMMARY`
- [x] commit + push wip/crm-c55

## Findings
| id | sev | new? | file:line | finding | proof |
|---|---|---|---|---|---|
| RV-1 | SHOULD-FIX | pre-existing (C5.4 L3-m1), same class as H55-1 | `src/lib/api/idempotency.ts:242-244` (stale takeover) | A claim left NULL for > 6 min (lambda killed/timed out AFTER its write committed — the DB-pressure moment H55-1 is about; or the outcome `updateMany` at :301 itself fails transiently → outer catch 503, claim stays NULL) is taken over and the handler RUNS AGAIN ⇒ duplicate. Contradicts this card's own rule "unknown outcome ⇒ never re-run". Prod (before C5.4) kept the claim in_progress for 24 h (no duplicate) ⇒ C5.4 made it worse, fix1 did not touch it. Fix: takeover = CAS the stale row to status 409 + `idempotency_outcome_unknown` body and answer that (never run). | **RV-I1 ❌** claim NULL 7 min + 1 committed row → retry 200, handler runs=1, rows=2 |
| RV-2 | SHOULD-FIX | pre-existing (C5.4), kept by the fix1 ruling | `idempotency.ts:293` + `crm/deals.ts:1177-1184` | A handler-DECLARED 409/429/503 still releases the claim even when a write already committed. Real instance: REST `deals.reassign` over `crm._maxReassignPerDay` commits `submitForApproval` (entityId `${id}:${newSeq()}` — new each run) + audit, then throws APPROVAL_REQUIRED → 409 approval_required → claim deleted → same-key retry files a SECOND approval request. Also every Thai-message 409 mapped by `mapError` ("สถานะ/ซ้ำ/ล็อก"). Fix: release only codes that are provably pre-write (`idempotency_*`, `confirm_required`, `rate_limited`, `crm_v2_disabled`, `stage_requirements`), store the rest — or make `approval_required` stored (it carries the request id in `hint`). | **RV-I2 ❌** write then ApiError 409 approval_required → 409/409 not replayed, runs=2, rows=2 |
| RV-3 | NOTE | new | `src/lib/api/dispatch.ts:222-233` · `idempotency.ts:280-281` | `ctl.beforeHandler` is never called by any door (dispatch's `run` ignores ctl; `runOpAsActor` only does a sync `actorCan` before the handler) ⇒ the 503 "not started — retry with the same key" branch is dead code. Builder note "dispatch wraps the actorCan check in beforeHandler" (crm-C5.5-fix1.md:18) is false; probe-fix1 H1-B tests the helper, not a door. Harmless (safe direction) — fix the note or delete the branch. | **RV-I4 ❌** grep: 0 callers |
| RV-4 | SHOULD-FIX (urgent, prod-exposed) | pre-existing (platform WO-0026) — bypasses the H55-2 enable gate | `src/lib/automation/actions.ts:81-97` → `src/lib/automation/service.ts:41-52` | Platform `/app/settings/automation` `toggleRuleAction`/`deleteRuleAction` check only `requireTenant()` (no permission key) and `setRuleEnabled`/`deleteRule` act on ANY `AutomationRule` id of the tenant (no `scope` filter, although the page lists only KANBAN). Any accepted member — a STAFF with zero keys — can switch ON an owner's disabled CRM rule (H55-2 enable check bypassed), delete/disable CRM rules, and delete/disable MEMBER_JOURNEY / MEMBER_TIER rules (member module is LIVE). Fix: `where: { id, scope: "KANBAN" }` in both service functions (updateMany/deleteMany + count check) and an `assertCan` with the automation key in both actions. | **RV-A1 ❌** keyless STAFF: CRM door refused (FORBIDDEN) · platform toggle → enabled=true on the 100,000-point rule · CRM rule deleted · member journey deleted |
| RV-5 | SHOULD-FIX (docs, owner) | new behaviour, docs partial | `/root/.claude/skills/shark-{crm,member,kanban,account}-api/SKILL.md` (gitignored) | The 4 API guides + `docs/sds/07_API.md` + openapi describe `idempotency_outcome_unknown` (409, sticky 24 h, use a NEW key after checking). The installed skill docs do not, and CRM skill rule 2 says "Reuse the same key when you retry the same request" ⇒ an agent following the skill retries into the sticky 409 forever. Internal callers are NOT affected: `MPushBridge.tsx:51` uses a fresh key per call, mobile uses `/api/mobile/crm/*` (own keys, not withIdempotency), AI tools go through proposals. | code-read |
| RV-6 | SHOULD-FIX (in this card) | new | `src/lib/modules/point/adjust.ts:163-171` · `voucher/service.ts:325-344` · `crm/automation.ts:502-507` | Approval reading. Manual door: MANAGER over cap → `submitForApproval` → **no active policy ⇒ autoApproved ⇒ applied at once** (`adjust.ts:207-222`; voucher `service.ts:809-822` same). The card refuses that case for automation, i.e. stricter than by hand for every shop without an approval policy (most shops). Recommend (controller's lean): `APPROVAL` ⇒ DIRECT when no policy would match. Exact change: in `manualAdjustVerdict` after `adjustVerdictOf`: `if (v === "APPROVAL") { const sys = await prisma.appSystem.findMany({ where: { tenantId, type: "MEMBER" }, select: { id: true } }); const hit = await Promise.all(sys.map((s) => approval.resolvePolicy({ tenantId }, { entityType: "member.point.adjust", systemId: s.id, unitId: null, amountSatang: null }))); return hit.some(Boolean) || sys.length === 0 ? "APPROVAL" : "DIRECT"; }` and the same in `manualIssueVerdict` with `entityType: "member.voucher.issue"`, `amountSatang: perVoucher * count` (exactly the args the manual doors pass; any member system counts because the rule fires for whatever system the contact's member is in). `resolvePolicy` is read-only (`approval/service.ts:139`) — export it from the approval facade. Manual doors stay byte-identical (only the CRM-facing verdict changes). Residual (accept): a policy added later does not re-check saved rules, same as caps. | code-read + builder H2-ceiling-points (MANAGER 600 refused) |
| RV-7 | NOTE (usability, by ruling) | new | `crm/api/key-guard.ts:112-136` (`crmSeesAllOf`) | A MANAGER who is branch-limited (unitAccess [x]) or whose CRM visibility is TEAM can now automate only `SEND_PUSH` and `NOTIFY_STAFF` (and WAIT_THEN of those); whole-shop ALL managers keep 13/15 types (WEBHOOK needs owner-only `crm.api.manage`). Consistent with key-guard and with the ruling (a rule fires on every record of the system). The QC persona `manager` is MANAGER unitAccess [patong] (`scripts/member-qc-env.mts:13`) ⇒ inventory rows `/settings/automation crm-auto-save` and `crm-auto-rule-toggle` (roles owner+manager) now only succeed for `manager` with NOTIFY/PUSH-only rules — the inventory lane should either keep a NOTIFY-only rule in the manager journey or move `manager` to `hiddenFor`-like "refused" expectation. Future option: store the author and filter firings to the author's visible set (needs an author column = schema). | **RV-A2** branch-limited / TEAM: [SEND_PUSH,NOTIFY_STAFF] · ALL: 13 types |
| RV-8 | NOTE | new | `src/lib/webhooks/actions.ts:17-30` | Platform module dynamic-imports the CRM facade (`await import("@/lib/modules/crm")`) — layering inversion that the static fitness check does not see. Fine for now; the choke point below removes it. | code-read |
| RV-9 | NOTE | pre-existing | `crm/activities.ts:772-775` | Blueprint §5.5 row lists `updateActivity` with `crm.activity.complete/delete`; it stays on `crm.activity.create` in service, REST and UI (consistent across doors ⇒ not a hole). Only reschedule (complete) and delete (delete) were in L55-3's scope. | code-read |
| RV-10 | NOTE | pre-existing (builder residual) | `crm/automation.ts:1037-1049` | CREATE_ACTIVITY `assignTo` another user has no manual equivalent (`logActivity` owner = creator, `activities.ts:628`). Low impact. | code-read |

## H55-1 attack summary
- (a) Classification. Missed transient classes (raw `$queryRaw` errors via the pg adapter such as P2010 with 40001/40P01/57P01, fetch aborts, statement timeouts) fall to `mapError` → 422/500 and are STORED — wrong code, never a duplicate (safe). Over-catch: P2034/P2028 from a single rolled-back tx now poison the key for 24 h although nothing was saved (RV-I3 measures it end-to-end through the real route; trade-off accepted by the ruling). Validation/ApiError are excluded (`!(e instanceof ApiError)`, Zod not transient) ⇒ no validation error poisons a key.
- (b) `beforeHandler` zone: unused (RV-3), so no write can happen in it.
- (c) Declared 409 after commit: RV-2.
- (d) Concurrency: claim is one INSERT; the outcome row is written once with `status: null` CAS; replays of the stored 409 are consistent. Stale takeover: RV-1 (pre-existing, not worse than base 288cca97; worse than prod).
- (e) Behaviour change: documented in all four `docs/api/*-API.md`, `docs/sds/07_API.md`, `src/app/developers/{member,kanban,account}/page.tsx`, openapi 409 text. Skill docs: RV-5. No internal caller retries with the same key.
- (f) Shape: first answer = `failBody` without `Idempotent-Replayed`; replay = stored body + `Idempotent-Replayed: true` + original `X-Request-Id` (`storedRequestId`) — same as every other replay.

## H55-2 action table check (manual doors opened)
All 19 rows of the builder's table match the real manual door: moveDeal `deals.ts:839` · assignContact → mutate `contacts.ts:1152` (crm.contact.update) + reassignDeal · logActivity · createDeal `deals.ts:688` · openTaskCard `activities.ts:1187` + new `kanban/links.ts canOpenCardOnBoard` (visible + EDITOR — same as `createCardFromExternal`) · sendEmail · chat.message.send · setTags/updateContact (`contacts.ts:971`) · updateDeal `deals.ts:1226` · scoring.adjust `scoring.ts:771` · webhook endpoint rule · member.promo.issue / member.point.adjust (REST points.credit also goes through `adjustWithApproval`). SET_FIELD: the field engine has no sensitive-write gate (`member/fields.ts:1490`), so no extra key is missing. Weaker-than-hand residuals: RV-6 (stricter, not weaker), RV-10, ASSIGN daily cap (builder debt).
Doors that write a CRM rule: `createRule/updateRule/toggleRule` (checked), `applyStarterRules` (creates DISABLED only), REST/AI (list + dry-run only), **platform `/app/settings/automation` (RV-4 — not checked)**. No import/duplicate/restore path exists. WAIT_THEN recursion covered.
Member manual doors byte-identical: `adjustWithApproval` OWNER/≤cap/null-cap → apply · STAFF over → same throw text · else approval — identical branch for every role incl. the impossible CUSTOMER; `issue` STAFF refusal (same message, same cap constant) then non-OWNER total > ceiling → approval — identical order. Rerun m2.2/m2.5 below.

## Platform webhook rule (r1b) + recommended choke point
- Tenants without a CRM v2 system: `crmPlatformWebhookProblem` returns null after one `appSystem.findMany` (non-CRM lists never query) ⇒ same result; builder PW-control-no-v2 green.
- Remaining unguarded writers (verified): platform `toggleEndpointAction` (`webhooks/actions.ts:81-88`), account `connections-actions.ts:186` (create — events NOT filtered at all) and `:207` (toggle any endpoint id), account REST `api/ops/webhooks.ts:105,134,136` (any WEBHOOK_EVENTS incl. crm.* and `[]`, any endpoint id via `requireEndpoint`). Member doors are filtered to member endpoints/events.
- **ONE choke point:** the three writers in `src/lib/webhooks/service.ts` — `createEndpoint` (:365), `setEndpointActive` (:393, check only when `active === true`, using the row's stored events), `setEndpointEvents` (:405). Make an author argument MANDATORY: `by: { actor: MemberActor } | { apiKeyCreatorUserId: string }`, so `tsc` lists every door (16 call sites: crm settings 140/164 · platform 73/88/113 · member api-actions 166/190 · member REST 120/143/144 · account REST 105/134/136 · account connections 186/207). Inside, run registered event guards (`registerWebhookEventGuard(fn)` in `src/lib/webhooks`, CRM registers `crmPlatformWebhookProblem` from its facade at load) — removes the platform→CRM import (RV-8). API-key doors resolve the key creator's membership (same as C5.4-B key-guard `entitled`).

## L55-3 / L55-4
- Keys per blueprint `docs/modules/20-crm-v2.md:450` (complete/delete row) and §6.1 list (:502): reschedule = `crm.activity.complete` (service `activities.ts:756`, REST `ops/activities.ts:145`, UI action :97), delete = `crm.activity.delete` (UI action :131, service, REST) — one key per operation ✅.
- UI gates vs `scripts/crm-ui-inventory.json`: `activity-row-reschedule` (roles owner/manager/nok/thana, hiddenFor []) and `activity-row-delete` (hiddenFor nok/thana via `canEdit`) — STAFF_DEFAULT holds create+complete+delete (`crm/access.ts:24`) ⇒ **no row changes**. `/settings/api crm-api-hook-*` are owner-only (crm.api.manage owner-only) ⇒ no change. Rows affected by H55-2: see RV-7.

## S7.2 (C1.10) — is CRM webhook delivery on v2 broken?
**No. Delivery works; the check is stale since C5.4-D.** RV-W1 (own CRM v2 shop, endpoint {crm.deal.won, crm.contact.created}, createContact + moveDeal→WON, real outbox consumers on our own events): delivered `crm.contact.created,crm.deal.won`, both X-Shark-Signature and V2 valid, WebhookDelivery OK=2, the won payload carries the dealId, one contact.created per create.
Why S7.2 is red: `crm/api/dispatch.ts:63` wakes the outbox after every successful REST write; outside a request scope `after()` throws so `core/after-drain.ts:34-38` drains the WHOLE queue immediately. The POST /contacts in S7.2 therefore delivers crm.contact.created to the stubbed host BEFORE the oracle takes `before = HOOKS.length` (`qc-crm-c1.10.mts:1077`); the oracle's own consumer call is then skipped by the per-(event, endpoint) reservation (P2002). Its own log proves it: `hooks=crm.deal.won … ok=3` (3 OK delivery rows, only the late one inside the window) and "webhook fetch stubbed 4×". ORACLE-EDIT for C1.10-S7.2: take the HOOKS snapshot before the two REST calls (or assert on WebhookDelivery rows + all HOOKS for HOOK_HOST).
H.1 is environmental (another lane's :3215 server on QC1 — QC3 key 401s), as the builder says.

## Merge with D2 (`/root/projects/shark-crm-cd2` @ fb47efc1)
D2 hunks in `sequences.ts`: 86-93, 820+, 1149+, 1210-1271, 1342-1420, 1574-1690 (types, resume, sender, runner). This card: imports (~26-50), new helper (~441), `createSequence` (~474), `updateSequence` (~515). `index.ts`: D2 adds at :185, this card appends at the end. `git merge-tree --write-tree 24b86d18 fb47efc1` → clean (tree f751e8f8), no conflicts. No semantic overlap (create/update vs redelivery).

## v1 / schema / facade
- v1 shops: CRM automation/sequence/activities changes are v2-only (assertCrmV2 / REST crm_v2_disabled); platform webhook check returns null for v1-only tenants. Member/kanban/account REST (prod) change only on transient errors (documented).
- No schema/migration change (no `prisma/` in the diff).
- Facade blocks: `crm/index.ts` end-of-file `// CRM C5.5 ▸ … ◂` block ✅ · `member/index.ts` block next to MEMBER_LIMITS ✅ · point/voucher facades inline-marked ✅.

## Rerun numbers (mine · QC3 · `/tmp/c55-logs/review/`)
- probe-fix1 **61/61** · probe-auto **9/9** · probe-idem **3/3** (builder's numbers reproduced)
- qc-crm-c2.1 **84/84** · c2.9 **52/52** · c1.10 **65/67** (S7.2 = stale oracle, explained above; act identical to the builder's: `events=…created,…created,…won hooks=crm.deal.won sig=true ok=3` · H.1 = :3215 server of another lane, environmental)
- qc-member-m2.2 **14/15** (S5.1 act `///` = no screenshot artefacts; S2.1–S2.3 manual point-adjust approval green) · m2.5 **25/26** (S7.2 act `mobile=undefined … noperm=undefined` = no HTTP/screenshot artefacts; S2.4 STAFF voucher cap + S2.5 approval green) ⇒ both reds environmental, the member manual doors behave as before
- qc-webhook **15/15**
- typecheck (`ISO_MEM=6G … pnpm typecheck`): **exit 0**
- probe-review (run 2): RV-I1 ❌ · RV-I2 ❌ · RV-I3 ✅ (real route: lock held > 30 s tx timeout → tx rolled back after 35.7 s → first 409 `idempotency_outcome_unknown`, same-key retry 409 replayed, contact unchanged, claim 409 TTL 24 h) · RV-I4 ❌ · RV-A1 ❌ · RV-A2 info · RV-W1 ✅ · CLEAN ×3 ✅ (6/10; the 4 reds are the holes RV-1/2/3/4, asserting the safe behaviour)

---

# ROUND 2 REVIEW (independent · 1 Oct 2026 · read-only on src/)
**VERDICT: MERGEABLE.** No BLOCKER / HIGH / MED is open. Every round-2 claim checked from the code holds, and my probes reproduce the ones that can be measured. 4 LOW + 2 NOTE, all debt. The controller must still apply the C5.3-L3-m1 oracle edit (item 6b) before the C5.3 suite goes green.

Tree `/root/projects/shark-crm-c54e` @ d2b45318 · round-2 diff `git diff 2e8eafd4 d2b45318`, read against the whole card `git diff 288cca97 d2b45318 -- src` · QC3 only · probe `scripts/pending/c55/review-r2/probe-review-r2.mts` · reruns `scripts/pending/c55/review-r2/run-review-r2.sh` · leftover check `check-leftovers.mts` · logs `/tmp/c55-logs/review-r2/`.

## Round-1 findings: status
| id | status | evidence |
|---|---|---|
| RV-1 stale takeover re-runs | **CLOSED** | `idempotency.ts:214-233` CAS `updateMany where {id, status:null, createdAt}` ⇒ status 409 + outcome_unknown body, TTL now+24 h. A lost CAS re-reads and replays. The handler is never called. **R2-I1 ✅**: claim aged 10 min, 2 concurrent same-key retries ⇒ both 409 `idempotency_outcome_unknown`, exactly 1 CAS winner (the other is `Idempotent-Replayed`), runs=0. The owner's late result write with its own `ownWhere` predicate ⇒ count 0. Row 409 with TTL ≈24.0 h, the 3rd retry is replayed, rows=1. Control: a 5-min claim still answers `idempotency_in_progress` and its owner can still write (count 1). |
| RV-2 thrown 409 after write released | **CLOSED** (residual = debt, see item 3) | `idempotency.ts:293-313` releases only flagged or beforeHandler errors. I audited every flagged site below. Builder probe H1-flag-* + H1-reassign-replay. |
| RV-3 beforeHandler dead code | **CLOSED** | `run.ts` wraps `assertScope` in `args.beforeHandler`, and core `dispatch.ts` passes `ctl.beforeHandler`. Note: that zone holds only the synchronous `actorCan` (no DB), so in real traffic the "not started ⇒ 503 + release" branch cannot fire. It is safe and only reachable by injection (H1-B-dispatch). No path releases the claim after the handler starts: `notStarted` is true only for errors raised inside `ctl.beforeHandler`, `ctl` is never handed to op handlers, and `withIdempotency` has exactly one caller (`dispatch.ts:236`). |
| RV-4 platform automation toggle/delete | **OPEN, outside this card** (other agent) | builder rerun of probe-review: HOLE-RV-A1 still ❌. Prod-exposed. Still urgent. |
| RV-5 skill docs | **in-repo CLOSED · installed skills OPEN (controller)** | Account Conventions + CRM rule 7 updated. `/root/.claude/skills/*/SKILL.md` still say "reuse the same key". |
| RV-6 approval reading | **CLOSED** | Verified against the doors' own argument mapping: points = `member.point.adjust`, systemId = `resolvePointSystemIds(member)[0]` (the same value the UI door `points-actions.ts:54-58` and the runtime `journeys.ts:906` use), unit null, amount null. Vouchers = `member.voucher.issue`, systemId = template system (the door requires `tpl.systemId === ctx.systemId`, `service.ts:572`), amount = face × count, unit null. The role / cap / sign test is the shared `adjustVerdictOf` / `issueVerdictOf` (`Math.abs(delta)`). **R2-I2 ✅ differential, 14 policy shapes**: verdict vs the REAL manual door by the same MANAGER (adjustWithApproval / voucher issue). Shapes: none, global, system=POINT, system=MEMBER, unit, threshold, inactive, threshold=total±1. APPROVAL ⇔ door pending in every case, mismatches=0. Two edges are stricter than the door, never laxer: (a) shops with several member systems, where a policy on any of their point systems ⇒ APPROVAL; (b) the member REST door resolves the point system per unit hint, which can differ from `[0]` on multi-POINT shops (runtime uses `[0]`, so the verdict matches what the rule will actually do). |
| RV-7 inventory rows | handed to it4 lane (note in builder file) | n/a |
| RV-8 platform→CRM import | **CLOSED** | `webhooks/actions.ts` no longer imports CRM. Composition root `src/lib/webhook-guards.ts`. |

## Item-by-item
**1 (RV-6).** See table: identical mapping, amount sign `Math.abs`, units satang × count, role from the same actor object, system as described. Automation cannot get DIRECT where the door would go pending (R2-I2). The opposite case (blocked where a human is not) happens only in the two stricter edges above.

**2 (RV-1).**
- The CAS is a single `UPDATE … WHERE status IS NULL AND createdAt = $old`. Atomic, and R2-I1 shows one winner.
- Window: the only `maxDuration` in the repo is `api/cron/outbox` = 60 s. `vercel.json` sets none, so the platform default is 300 s, below 360 s. I could not check the Vercel dashboard project setting. If someone raises it above 6 min, RV-1 would convert a still-running claim. That outcome is still safe (409, never a re-run): the live owner's later write is a no-op, so the client of the live request gets its real answer while retries get outcome_unknown.
- What the client is told: "check whether the record exists; if not, send with a NEW key". **Residual, stated plainly:** server-side idempotency ends there. A new-key retry of a money op (payments, points credit, gift-card sell, account payment record, CRM payment) whose first attempt did commit is a duplicate charge or grant, unless that op has its own natural key. The client is responsible for the existence check. This is inherent to "unknown outcome" and identical to H55-1.
- The response for a failed outcome-write is a 503 "try again shortly" from `dispatch.ts` catch (`mapError` transient). A same-key retry then gets `in_progress` for up to 6 min and `outcome_unknown` after that. Safe, slightly misleading text. Pre-existing.

**3 (RV-2) flagged throwers: all provably pre-write.**
- `confirm_required`: 16 real throw sites (34 grep hits incl. types). All are `reasonOf` first statements, entry gates (`emails.ts:1589`, `:546`, `objects.ts:1172`, `pipelines.ts:299`, `tracking.ts:494`, `calls.ts:335`, `privacy.ts:266/1153`), or inside a tx that rolls back (`objects.ts:698/700`, `deals.ts:903` under `withDealLocks`).
- `stage_requirements`: one site, `deals.ts:912`, inside the move tx. The writes before it (`crmDeal.update`, `setFieldValues(…, tx)`) roll back. The only REST caller is `ops/deals.ts:219`. bulkMove catches it per deal.
- `crm_v2_disabled`: entry gates.
- Portal `rate_limited`: `portalWriteGate` comes before writes at all 7 sites. Only a rate counter is incremented, which is harmless.
- Member `as400` 429: only `CustomerRateLimitError` declares 429, and `hit()` / `hitOtpAskBuckets` run first in every OTP flow.
- `campaignPort()` 503: the first statement of all 9 campaign handlers.
- Flags go on fresh error objects created by the op-level mappers (`crm/api/op.ts:70`, `portal-lane.ts:121`), so no singleton gets flagged permanently.

**Unflagged residual: none must be flagged before merge.** Storing is the safe direction (never a duplicate), and it is **exactly prod behaviour today**: `origin/main:src/lib/api/idempotency.ts` stores every result (only C5.4, unmerged, released 409/429/503). Worst user-visible cases, all debt:
- (a) account `import.run` 429 (`import.ts:34-35`, 20 imports/h). A same-key retry after the hour replays 429 for 24 h, and `ACCOUNT-API.md:61` says "wait Retry-After and retry". This should be flagged next: `accountRateGuard` is the first statement, so it is provably pre-write. Account lane.
- (b) CRM 409s that say "รีเฟรชแล้วลองอีกครั้ง" (refresh and try again): `deals.ts:893`, `:1032`, `pipelines.ts:419`. A same-key retry replays. CRM rule 7 now says "send a new key", but the Thai text and the installed skill (RV-5) do not.
- (c) account `files-write.ts:252` 503 "AI not configured" is replayed after the owner configures it, while the ACCOUNT error table row (`:67`) says "Retry later".
- (d) kanban WIP 409: the fix needs `force:true`, which is a new body and therefore a new key anyway. No impact.
- (e) KANBAN-/MEMBER-API docs do not say error answers are stored (prod-identical behaviour). Docs debt.

**4 (RV-3).** See table. No path releases a claim after the handler started.

**5 Webhook choke point.**
- The service itself lazy-imports the composition root inside `runEventGuards` (`service.ts:407-417`) on every call that carries `by`. So every entry path gets the guard without needing a per-door import: route handlers, server actions, REST dispatch, AI-proposal execution through the same op handlers, and member/account pages.
- No mobile, cron, or edge path writes endpoints (the service uses prisma, so node only).
- Callers in `src/`: **15**, and all pass `by`. I grepped this myself, and builder WB-static agrees.
- The `@deprecated` author-less `createEndpoint` overload has **0 callers in src/**. It skips the guard. The callers are scripts only: `qc-acc-v2-permissions.mts:768` and `seed-acc-v2-qc.mts:2058` (typed), plus several any-typed oracles and probes, which also call `setEndpointActive/Events` without `by` at runtime.
- Fail-closed? If the import throws, it fails closed (the write is refused). If the registry is empty after the import, it fails **open** (R2-2, LOW, theoretical).
- Event-name bypass: none. `dispatchWebhooks` matches by exact `includes(evt.type)`, and only `[]` means all. So case or whitespace variants and `*` / `crm.*` deliver nothing, and `[]` is caught by the guard.
- Already-stored endpoints: R2-4.
- Account connections filtering: R2-1.
- `qc-account-api-webhooks` 22/22 and `qc-webhook-ui` 11/11 re-run green on QC3.

**6 Oracle edits.**
- (a) c1.10 S7.2: a single line, `before = HOOKS.length` moved above the two REST calls, with the ORACLE-EDIT marker. It is exactly what round 1 authorised and nothing more.
- (b) C5.3-L3-m1 (a): **yes, `409 idempotency_outcome_unknown, ran 0` is the correct consequence of RV-1.** The proposed assertion is necessary but not tight. Recommended for (a): `aged.count===1 && resA.status===409 && (await resA.json()).error.code==="idempotency_outcome_unknown" && ranA===0`, plus a **second same-key call ⇒ 409 + `Idempotent-Replayed: true` and ranA still 0** (sticky, not re-run on the 2nd try), plus the row's `status===409`. Keep (b) unchanged: a returned 503 is still released. Reword the title, which says "taken over (the retry runs)" and "older than ~2 min"; the threshold is 6 min. The builder's QC2 act `aged=1 · retryA=409 ran=0 · b1=503 b2=200 ranB=2` would satisfy it.

**7 Regression honesty.** I read each non-green log and every claim holds:
- m2.2 S5.1 act `///` and m2.5 S7.2 act `mobile=undefined…`: screenshot/HTTP artefacts, the same as round 1.
- account-api-docs F2.1–2.3, 2.5–2.7: no `.claude/skills` in the worktree (F2.1 act empty).
- acc-v2-security: the same 6 reds as `/tmp/c55-logs/base-acc-security.log` (lines 142-145 S5 Beam payment, 337-338 S17 hex debt), byte-identical texts.
- acc-v2-permissions: 23 reds, all R1–R4 seed comparisons. W1–W2 webhook checks are green.
- C5.3 18/19: L3-m1 by ruling.
- c1.10 H.1: :3215 environment.
- Note: the builder ran C5.3 on QC2.

**8 New-surface check.**
- Tenant isolation: OK. `markStaleUnknown` uses `tenantDb` plus row id. `membershipActor` and the API-key creator lookup are scoped by tenantId. `setEndpointActive` reads through `tenantDb`.
- Error text: guard messages are fixed Thai strings, and `WebhookGuardError` maps to 403 via declared status.
- Stored-409 growth: the conversion reuses the existing row. The table has **no sweeper at all** (expired rows are deleted only when the same key is reused). That is pre-existing (R2-5).
- Typing: `actor as MemberActor` in `crmPlatformWebhookProblem` (role is a string from Membership). Acceptable.

## New findings
| id | sev | file:line | finding | proof |
|---|---|---|---|---|
| R2-1 | LOW | `src/lib/modules/account/connections-actions.ts:187-191` | Filtering to `account.*` turns a request that names only non-account events into `[]`, which means **ALL events of the shop** (CRM, member, chat…). An OWNER asking for `["crm.deal.won"]` or `["member.created"]` gets an all-events endpoint. On a v1 shop any user with `webhook.endpoint.create` does too. On v2 the CRM guard still refuses non-whole-shop authors, so there is no CRM confidentiality loss, and the same user can create an all-events endpoint on `/app/settings/webhooks` anyway. The UI only offers account checkboxes, so this path needs a crafted form. Fix: if the form named ≥1 event and the filtered list is empty, refuse ("เลือกได้เฉพาะเหตุการณ์ของบัญชี"). Related pre-existing UX: the legend "ไม่เลือก = ทุกเหตุการณ์" means every event of the shop, not every account event. | **R2-I3 ❌ REPRODUCED** (both runs): v1/v2 `["crm.deal.won"]` and `["member.created"]` ⇒ stored `[]` (4/4) · control `["account.document.issued"]` stored as-is |
| R2-2 | LOW | `src/lib/webhooks/service.ts:410` | `if (EVENT_GUARDS.size === 0) return;` fails open. It is unreachable today because the root is imported by the service itself (same module instance). It would bite if the root stopped registering, for example after a refactor that moves the import. Suggest throwing (fail closed) when the root is loaded but registers nothing. | reasoned |
| R2-3 | LOW (UX, safe direction) | `src/lib/webhooks/actions.ts:80` · `src/lib/modules/account/connections-actions.ts:213` | A refused toggle-on throws `WebhookGuardError` out of a server action with no try/catch. The user gets the error boundary (prod redacts the message) instead of the Thai reason. Member/CRM toggles return `{ok:false, reason}`. Builder WB probe shows `platform toggle → threw`. | reasoned + builder log |
| R2-4 | LOW (residual, owner decision) | `webhooks/service.ts` (no author column) | Endpoints stored before this card, or by an author who later loses whole-shop rights, keep receiving CRM events, including `[]` all-events endpoints made on member/account/platform pages before CRM v2 was switched on. They cannot be re-checked: `WebhookEndpoint` has no creator. Payloads are id-only (R-C.8), so the exposure is event metadata. Option: when a shop switches CRM to v2, list or pause `[]` / `crm.*` endpoints for owner review. | reasoned |
| R2-5 | NOTE (pre-existing) | `src/lib/api/idempotency.ts` | No sweeper for `ApiIdempotency`: rows (success, error, and now outcome-unknown) live until the same key is reused. RV-1 adds no rows. | grep: only other mention is the tenant-scope model list in `core/scope.ts` |
| R2-6 | NOTE (docs debt) | `docs/api/ACCOUNT-API.md:61,67` · KANBAN/MEMBER generators | The error table's "wait and retry" / "retry later" advice contradicts "error answers are stored and replayed" for import 429 and files 503. KANBAN/MEMBER docs do not mention stored errors at all (prod-identical behaviour). | code-read |

## Must-fix before merge
None in `src/`. Controller actions: (1) apply the C5.3-L3-m1 ORACLE-EDIT as tightened in 6(b). (2) RV-4 remains urgent in its own card. (3) Skill docs (RV-5).
Debt list for later cards:
- R2-1 (3-line refuse in connections-actions)
- R2-3 (catch and return reason)
- R2-2
- item-3 (a): flag `import.run` 429, account lane
- R2-4, R2-6

## Rerun numbers (mine · QC3 · `/tmp/c55-logs/review-r2/`)
- `probe-review-r2` run 1 6/8: R2-I1 used a fixture artefact. I aged a live owner's claim by editing `createdAt`, which also changed the owner's CAS key, so the young-control's "owner stores 200" was unprovable. Rewritten for run 2.
- run 2 **7/8**: R2-I1 ✅ · R2-I1 control ✅ · R2-I2 ✅ · R2-I3 ❌ (= R2-1) · CLEAN ×4 ✅.
- `qc-webhook-ui` **11/11** · `qc-account-api-webhooks` **22/22**.
- Leftovers after both runs: tenants=0 · users=0 · sessions=0 (8 throwaway tenants / 10 users / 4 sessions created and deleted in total).

## Not checked
- The Vercel dashboard function-duration setting.
- `next build` and bundler module-instance identity for the lazy root, which I reasoned about but did not build.
- Full-suite reruns (forbidden).
- The kanban/member doc generators' text.
- The prod data question for R2-4: how many existing `[]` / `crm.*` endpoints exist. Needs read access to prod.
- RV-4 / RV-7 (other lanes).

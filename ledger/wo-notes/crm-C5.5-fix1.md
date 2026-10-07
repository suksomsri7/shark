# C5.5-fix1 — builder (Opus 5.5 · 1 Oct 2026)
Tree `/root/projects/shark-crm-c54e` (detached, base 775d393e). QC3 only. Logs `/tmp/c55-logs/`.
Findings: `ledger/wo-notes/crm-C5.5-hunt-1.md`. Probe of this card: `scripts/pending/c55/probe-fix1.mts`.

## Status (checkpoint — successor continues from here)
- [x] RED: hunter probes run untouched — probe-idem 2/3 (IDEM-A ❌ rows=2) · probe-auto 7/9 (AUTO-a2, AUTO-c2 ❌) · list-ops ok (logs /tmp/c55-logs/red-*.log)
- [x] probe-fix1 written; RED run 1 = 10/46 (/tmp/c55-logs/red-probe-fix1.log; L3/L4 blocks errored on a fixture email clash, fixed → their RED comes from the next run)
- [x] H55-1 idempotency outcome-unknown — probe-idem 3/3 · probe-fix1 H1-* green
- [x] H55-2 automation "cannot automate what you cannot do by hand" (+ sequences editor) — probe-auto 9/9 · probe-fix1 H2-*/H2S-* green
- [x] L55-3 activity reschedule/delete one key — probe-fix1 L3-* green (RED /tmp/c55-logs/red2-probe-fix1-L3L4.log)
- [x] L55-4 webhook endpoint creator-sees-all — probe-fix1 L4 green
- [x] L55-5 after-drain → DEBT (not touched)
- [x] regression r1 DONE (`scripts/pending/c55/run-fix1-r1.sh` → /tmp/c55-logs/r1/SUMMARY) — see below
- [ ] commit + push wip/crm-c55

## Design decisions (so far)
- NOTE: `pnpm docs --check` is pnpm's built-in `docs` command (prints the npm URL, exit 0) — it checks nothing. The real check is `pnpm exec tsx scripts/gen-{crm,member,kanban,account}-api-docs.mts --check` (+ fitness F13.11 for CRM). Run those.
- H55-1: `withIdempotency(run)` now passes `ctl.beforeHandler(fn)`; a transient infra error thrown inside it = provably before the handler ⇒ claim released + 503 upstream_unavailable ("not started, retry same key"). Any other THROWN transient error ⇒ claim kept, stored as 409 `idempotency_outcome_unknown` (normal 24 h TTL, status column = 409, responseJson = the error body) ⇒ same-key retries replay it (Idempotent-Replayed) and never re-run. Declared ApiError 409/429/503 and returned 503 keep the C5.4 release (L3-m1 unchanged). dispatch wraps the actorCan check in beforeHandler. mapError's transient message no longer says "nothing saved". New code in API_ERROR_CODES + the 4 doc generators.
- L55-3: blueprint §5.5 row "completeActivity · rescheduleActivity · deleteActivity · updateActivity | crm.activity.complete/delete" ⇒ reschedule = crm.activity.complete (service + REST; UI already), delete = crm.activity.delete (UI action; service/REST already).
- L55-5: DEBT (not touched) — see below.

## RED → GREEN (probe logs /tmp/c55-logs/)
- red-probe-idem.log 2/3 → g-probe-idem.log 3/3 · red-probe-auto.log 7/9 → g-probe-auto.log 9/9
- probe-fix1: red-probe-fix1.log 10/46 (H1 A/E/F, H2 all key cases red; L3/L4 errored) · red2-probe-fix1-L3L4.log (L3/L4 files at HEAD) 44/48 with L3×3 + L4 red · red3-probe-fix1-seq.log (sequences.ts at HEAD) 49/54 with H2S×5 red → g3-probe-fix1.log 54/54.

## H55-2 action table (save/update/enable check in `automation.ts` `handNeedOf` + `assertAuthorCanDoByHand`; OWNER skips; vis = author sees ALL of the entity shop-wide (role level + every DEAL pipeline policy + not branch-limited), same logic as key-guard)
| action | manual door (file:line @ this tree) | check at save |
|---|---|---|
| MOVE_STAGE | deals.moveDeal `deals.ts:839` need crm.deal.move + loadDeal visibility | crm.deal.move · DEAL ALL (pipeline of the target stage) |
| ASSIGN | contacts.assignContact `contacts.ts:1293` (mutate → crm.contact.update `:1152`) · deals.reassignDeal `deals.ts:1105` crm.deal.update + crm.deal.reassign when cross-team `:1135` | crm.contact.update + crm.deal.update + crm.deal.reassign · CONTACT+DEAL ALL |
| CREATE_ACTIVITY | activities.logActivity `activities.ts:623` crm.activity.create + target visible | crm.activity.create · CONTACT+DEAL ALL |
| CREATE_DEAL | deals.createDeal `deals.ts:685` crm.deal.create + contactWhere | crm.deal.create · CONTACT+DEAL ALL (pipeline param) |
| OPEN_KANBAN_CARD | activities.openTaskCard `activities.ts:1184` crm.activity.create + kanban `visibleBoardOptions` + createCardFromExternal `assertBoardRole EDITOR` (`kanban/links.ts:263`) | crm.activity.create · board via new `kanban/links.canOpenCardOnBoard` (visible + EDITOR) · CONTACT+DEAL ALL |
| SEND_EMAIL | emails.sendEmail (crm.email.send) | crm.email.send · CONTACT ALL |
| SEND_LINE | chat reply `chat/actions.ts:166` assertChatCan chat.message.send | rbac evaluate chat.message.send · CONTACT ALL |
| SEND_PUSH / NOTIFY_STAFF | none (internal notice; recipients filtered at run by C5.4-B `crmRecipientsWhoSee`) | nothing beyond crm.automation.manage |
| ENROLL_SEQUENCE / STOP_SEQUENCE | sequences.enroll/stop `sequences.ts` ENROLL_KEY | crm.sequence.enroll · CONTACT ALL (runtime still skips these steps) |
| SET_FIELD | contacts.updateContact `contacts.ts:956` crm.contact.update · deals.updateDeal `deals.ts:1223` crm.deal.update | contact: crm.contact.update + CONTACT ALL · deal: crm.deal.update + DEAL ALL |
| ADD_TAG / REMOVE_TAG | contacts.setTags `contacts.ts:1215` crm.contact.update | crm.contact.update · CONTACT ALL |
| ADJUST_SCORE | scoring.adjust `scoring.ts:771` crm.score.manage + contactWhere | crm.score.manage · CONTACT ALL |
| WEBHOOK | CRM webhook endpoint create (`settings/api/actions.ts`) crm.api.manage + webhook.endpoint.create + (L55-4) creator sees all | crm.api.manage + rbac webhook.endpoint.create + crmWebhookWiderThanCreator |
| ISSUE_VOUCHER | voucher/service.ts:328 hasMemberPerm member.promo.issue (REST vouchers.issue same key) | hasMemberPerm member.promo.issue · CONTACT ALL (⇒ not branch-limited) |
| GIVE_POINTS | member REST points.credit `member/api/ops/points.ts:177` member.point.adjust (UI point/adjust.ts: canReadMember + approval ceiling) | hasMemberPerm member.point.adjust · CONTACT ALL — stricter of the two member doors |
| WAIT_THEN | container | each inner action checked (label "รอ n วันแล้วทำต่อ › …") |
| (unknown type) | — | refused (fail-closed) |
Doors: UI `settings/automation/actions.ts` create/update/toggle → service (checked there). REST/AI: `crm/api/ops/automation.ts` has only list + dry-run (read) ⇒ no write door (probe H2-rest-tool: POST 405 · PATCH 404 · 0 write ops/tools). applyStarterRules creates DISABLED rules only (NOTIFY_STAFF/CREATE_ACTIVITY/ENROLL) ⇒ checked when enabled.
Sequences (ruling "check; report"): YES a step can do what the editor cannot — fixed for the EDITOR: create / step edit / re-open (`active:true`) need EMAIL→crm.email.send · LINE→chat.message.send · TASK→crm.activity.create (WAIT/SMS none) — `sequences.ts assertEditorCanSendByHand`. NOT fixed: the ENROLLER (crm.sequence.enroll + sees the contact) starts the sends without crm.email.send/chat key → question for controller.

## L55-5 DEBT (after-drain coalescing) — not touched
- Why not: the only local fixes (per-request flag needs a request id that Next does not expose; or one `after()` per call with run-time skip) change the drain-count contract that C5.4-D probes pin (probe-c54d-r2 S3 "exactly ONE after() per action", probe-c54d-r3 R2N6) and the module is prod-exposed for every module ⇒ outside "small, local, provably safe".
- Owner-facing consequence: rare (request A's function killed between response and its after-phase while the instance survives). Then events committed by other requests in that instance within the next ≤15 s (chat, POS, booking, forms, kanban, CRM) are not drained by their own request: they go out with the next drain in that instance after the 15 s stale window, else the VPS crm-cron minute drainer (≤ ~1 min, `scripts/crm-cron.mts` minute mode, if the VPS crontab runs at the deployed commit — C5.4-D N6), else Vercel `/api/cron/hourly` (≤ 1 h).
- C6.1 note: decide between (a) per-request coalescing via a request-scoped store when Next exposes one, (b) one `after()` per request with a monotonic "drain started after my commit" skip (≤ same drain count, fixes the loss; needs ORACLE-EDIT of probe-c54d S3/R2N6 semantics), (c) accept with the minute drainer as the SLO.

## Residuals / questions (draft)
- H55-1: a transient failure while STORING the outcome row leaves the claim NULL ⇒ 409 in_progress for 6 min, then the C5.4 stale takeover re-runs the handler (pre-existing; same as a lambda killed mid-handler). Key-less optional lane (public member signup) has no claim — unchanged. pending/hunt-54a/probe-54a H2 (P2034 ⇒ 503 then a re-run) is superseded by this ruling (now 409/409, one run). First answer is now 409 (not 503): connectors that blindly retry 5xx will stop and surface it — intended.
- H55-2: stored rules keep working until next edit/enable (ruling); no author column on AutomationRule ⇒ a demoted author's rule keeps firing. Approval ceilings are NOT mirrored: GIVE_POINTS ≤ 100,000/firing vs manual adjustApprovalOver (MANAGER → approval, STAFF → refused); ISSUE_VOUCHER batch ceiling; `crm._maxReassignPerDay` for ASSIGN. CREATE_ACTIVITY `assignTo` another user has no manual equivalent. Sequence ENROLLER is not checked for the step keys.
- L55-4: only the CRM settings page is guarded. The platform page `/app/settings/webhooks` (`src/lib/webhooks/actions.ts` create + updateEndpointEventsAction, key webhook.endpoint.*) can still subscribe an endpoint to crm.* events or to ALL events (empty list) with no CRM visibility rule — prod-exposed generic page, needs a controller decision. Events are not filtered to the endpoint's CRM system (hunter's 2nd suggestion, not in the ruling).
- sequences.ts edit is in create/update only (not the D2 redelivery state machine) — merge note for the D2 lane.

## Regression r1 (QC3 unless noted · measured by the builder · /tmp/c55-logs/r1/<name>.log)
probe-idem 3/3 · probe-auto 9/9 · probe-fix1 54/54 · c1.6 79/79 · c1.7 57/57 · **c1.10 65/67** (S7.2 + H.1 = known baseline reds, identical on untouched HEAD per crm-C5.4-E-review.md:183; H.1 probes another lane's :3215 server on QC1) · c2.1 84/84 · c2.2 73/73 · c2.9 52/52 · c2.10 41/41 · c3.9 49/49 · c0.2 27/27 · c0.5 50/50 · **QC2** c5.3 --only=L1,L3 19/19 · member m1.11 24/26 (S3.3 = gitignored `.claude/skills/shark-member-api/SKILL.md` absent in this worktree, present in the main checkout · S5.2 = screenshot parity, no shots here — environmental) · kanban k1.15 29/30 (S3.4 = same missing skill SKILL.md) · account-api-core 64/64 (ran on QC3, did not refuse) · gen-{crm,member,kanban,account}-api-docs --check exit 0 ×4 · typecheck exit 0 · fitness 33/33 with env and 33/33 without DATABASE_URL/DIRECT_URL.
Controller on QC1 (optional): the account write/key suites that use the acc-v2 seed (qc-account-api-keys, -write-*) were not run here.

## ROUND 1b (controller rulings 1–4 + c1.10 proof) — checkpoint
- Code done (local commit ed506e2d): platform webhooks rule · approval ceilings · probe-fix1 extended (PW-*, H2-ceiling-*). RED red4-probe-fix1-r1b.log 57/61 (4 new checks red, control green) → GREEN g4-probe-fix1.log 61/61.
- ⚠️ If the session dies during the c1.10 base run, `src/` may be at 288cca97: restore with `git checkout HEAD -- src` (HEAD = ed506e2d or later).

### r1b rulings implemented
1. Platform webhooks page (`src/lib/webhooks/actions.ts` createEndpointAction + updateEndpointEventsAction): a list that contains a CRM event (crm.* · custom.record.* · team.*) OR is empty (= all events) needs `crmWebhookWiderThanCreator` for EVERY CRM v2 system of the tenant (new `crm/api/key-guard.ts crmPlatformWebhookProblem`, exported through the CRM facade in a `// CRM C5.5 ▸ … ◂ CRM C5.5` block, dynamic import from the platform module). No CRM v2 system ⇒ returns null (probe PW-control-no-v2: CRM-less tenant and v1-only tenant unchanged). Non-CRM-only lists never touch the DB for this check.
   - Residual: stored endpoints are untouched (an existing all-events endpoint made by a limited user keeps receiving crm.*). Code paths that write endpoint events/active today = 9: CRM page create + toggle (guarded), platform create + updateEvents (guarded now), platform toggleEndpointAction (NOT guarded — re-activation of an all-events endpoint), member UI api-actions create/toggle + member REST webhooks.create/update (member events only — cannot carry crm.*), **account `connections-actions.createWebhookAction` + account REST `webhooks.create/update` accept ANY WEBHOOK_EVENTS incl. crm.* and the empty list ⇒ same hole, not changed (account/** belongs to the C5.4-N lane) — controller decision**. No migration.
   - Debt: delivery-side filtering of crm.* events by CRM system (not in this card).
2. Sequence enroller — RULING: enrolling stays on `crm.sequence.enroll`; the step content was authorised at authoring time (same delegation model as templates).
3. Approval ceilings at save/enable: GIVE_POINTS and ISSUE_VOUCHER must be grantable by the AUTHOR "directly" by hand. Single deciders, used by both the manual doors and CRM: `point/adjust.ts adjustVerdictOf` (adjustWithApproval now uses it; OWNER/cap null/≤cap = DIRECT · STAFF over = REFUSED · MANAGER over = APPROVAL) and `voucher/service.ts issueVerdictOf` (issue now uses it; STAFF per-voucher cap/uncapped % = REFUSED · non-OWNER total > MEMBER_LIMITS.voucherIssueApprovalOverSatang = APPROVAL). Exposed as point/voucher facade → member facade `manualGrantVerdict` (crm→member edge only). Anything but DIRECT ⇒ refused; unknown/inactive template for a non-OWNER ⇒ VALIDATION. Note: with no approval policy a MANAGER's over-cap manual adjust is auto-approved — the ruling's "needs approval above the threshold" is applied literally (refused).
   - Debt: `crm._maxReassignPerDay` for ASSIGN = runtime concern (runner is OWNER), not enforced.
4. Docs gate: my run scripts use the four `gen-*-api-docs.mts --check`.

### c1.10 S7.2 / H.1 proof
`git checkout 288cca97 -- src` (base), qc-crm-c1.10 → /tmp/c55-logs/base-c1.10.log: S7.2 ❌ (act `hooks=crm.deal.won` — identical to r1) and H.1 ❌ (act `oa=200 ops=123/123 ping=401 noKey=401` — identical; it hits another lane's :3215 server whose DB is QC1, so the QC3 key 401s). S8.1 was also red on base only because docs/ were NOT reverted (CRM-API.md carries the new reschedule key) — expected. Then `git checkout HEAD -- src` (0 diffs).

### r1b regression (`scripts/pending/c55/run-fix1-r1b.sh` → /tmp/c55-logs/r1b/)
probe-fix1 61/61 · probe-auto 9/9 · probe-idem 3/3 · c1.10 65/67 (S7.2 + H.1 only — proven baseline above) · c2.1 84/84 · c2.9 52/52 · c3.9 49/49 · c0.2 27/27 · member m2.2 14/15 (point-adjust approval S2.1–S2.3 green; S5.1 = screenshots, environmental) · member m2.5 25/26 (voucher STAFF cap S2.4 + approval S2.5 green; S7.2 = HTTP/screenshots, environmental) · qc-webhook 15/15 · qc-webhook-ui 11/11 · gen docs --check ×4 exit 0 · typecheck exit 0 · fitness 33/33 with and without env.

## ROUND 2 (rulings after review `crm-C5.5-fix1-review.md` @2e8eafd4) — checkpoint
Plan / status:
- [x] probe-fix1 extended first → RED /tmp/c55-logs/red5-probe-fix1-r2.log 62/70 (8 new checks red, controls green) → GREEN g5-probe-fix1.log 71/71 (+WB-static)
- [x] RV-6 approval verdict via approval facade `resolvePolicy` (no matching policy ⇒ DIRECT)
- [x] RV-1 stale takeover ⇒ store + answer 409 outcome_unknown (never run) · NOTE: oracle C5.3-L3-m1 (a) pins "takeover runs once" ⇒ will go red ⇒ ORACLE-EDIT request (not authorised)
- [x] RV-2 thrown 409/429/503 released only when the thrower flags `nothingWritten` (respond.ts) · returned RunResult statuses keep the C5.4 release (test-only path; c5.3 L3-m1 (b))
- [x] RV-3 beforeHandler wired in core dispatch (runOpAsActor scope check) + note sentence corrected
- [x] webhook choke point in `webhooks/service.ts` (author mandatory in types · registered guards · composition root) + 16 call sites incl. account connections/REST (authorised for this only)
- [x] ORACLE-EDIT c1.10 S7.2 (authorised) · RV-5 generator skill text · RV-7 inventory rows in note
- [x] regression r2 DONE (`scripts/pending/c55/run-fix1-r2.sh` → /tmp/c55-logs/r2/SUMMARY) — below
Correction (RV-3): the round-1 sentence "dispatch wraps the actorCan check in beforeHandler" was FALSE at 44e5c77c/24b86d18 — no door called ctl.beforeHandler; fixed in r2 (see below).

### r2 implementation (code)
- RV-6: `approval` facade exports read-only `resolvePolicy`. `point/adjust.ts manualAdjustVerdict` and `voucher/service.ts manualIssueVerdict` turn APPROVAL into DIRECT when no policy would match, asking with exactly the manual door's arguments: points = `member.point.adjust`, systemId = each member system's point system (`resolvePointSystemIds`, global-only when none), no unit/amount; vouchers = `member.voucher.issue`, systemId = template's member system, amount = face × count, no unit. The manual doors are byte-identical; only the verdict exported to CRM changed.
- RV-1: `withIdempotency` stale (>6 min NULL) claim ⇒ CAS to status 409 + `idempotency_outcome_unknown` body, TTL 24 h from now, answer it; the handler never runs; a lost CAS ⇒ re-read and replay/in_progress. Window: 6 min vs the longest known real handler (group payment ≤ ~40 s; Vercel default maxDuration 300 s) ⇒ a still-running request is not hit. ⚠️ ORACLE CONFLICT: `scripts/qc-crm-c5.3.mts` C5.3-L3-m1 (a) asserts "aged NULL claim ⇒ retry 200 and run() executed once" — now 409 outcome_unknown / ran 0 ⇒ that check turns RED (not authorised to edit) ⇒ ORACLE-EDIT request: expect `resA.status===409 && code idempotency_outcome_unknown && ranA===0`.
- RV-2: `respond.ts nothingWritten(e)` / `isNothingWritten(e)`. A THROWN 409/429/503 releases the claim only when flagged (or raised inside `ctl.beforeHandler`); unflagged ⇒ stored + replayed. A RETURNED RunResult with 409/429/503 keeps the C5.4 release (only test harnesses return non-200; dispatch returns 200) ⇒ C5.3-L3-m1 (b) unchanged.
- RV-3: `runOpAsActor` takes `beforeHandler`; core `dispatch.ts` passes `ctl.beforeHandler`, so the scope check inside the claim runs in that zone (all four modules use core dispatch). The DB steps before it (key lookup, system lookup, rate limit, altAuth / creator entitlement) run BEFORE the claim exists, so a transient there leaves nothing to release. Probes: H1-B-route (real CRM route, P1001 on the key lookup ⇒ 503, no claim, same-key retry 200, 1 contact) and H1-B-dispatch (real core dispatch, P1001 inside beforeHandler ⇒ 503, released, retry runs once).
- Webhook choke point: `webhooks/service.ts` `createEndpoint(ctx, {url, events, by})`, `setEndpointActive(ctx, id, active, by)` (checks stored events when turning ON) and `setEndpointEvents(ctx, id, events, by)`. `by` is mandatory in the types: `{actor} | {userId} | {apiKeyId}` (API key ⇒ the key creator's accepted membership). Registered event guards run there and throw `WebhookGuardError` (403, Thai). The composition root `src/lib/webhook-guards.ts` (lazy-loaded by the service) registers `crmPlatformWebhookProblem` from the CRM facade. Removed the platform→CRM dynamic import (RV-8). Untyped callers (scripts/oracles that call the service directly) send no `by` ⇒ no guard. Call sites updated (13 in src): CRM settings create/toggle · platform create/toggle/updateEvents · member UI create/toggle · member REST create/updateEvents/updateActive · account REST create/updateEvents/updateActive · account connections create (events now FILTERED to registered `account.*`) / toggle. A null author (keyless creator, ex-member) ⇒ refused only when the list touches CRM and the tenant has CRM v2. Tenants without CRM v2 ⇒ guard null ⇒ unchanged (probe WB-control-no-v2).
- ORACLE-EDIT (authorised) `scripts/qc-crm-c1.10.mts` S7.2: `before = HOOKS.length` moved above the REST calls, marked `// ORACLE-EDIT C5.5-fix1 (review · S7.2 stale since C5.4-D: REST write wakes the outbox immediately)`.
- RV-5: the in-repo generators own only the docs text (code table already had `idempotency_outcome_unknown`). Added a replay/new-key sentence to the account Conventions "Idempotency" bullet and to CRM OpenAPI rule 7. The installed `/root/.claude/skills/*/SKILL.md` ("Reuse the same key when you retry…") is the controller's — it should add: "409 idempotency_outcome_unknown ⇒ check whether the record exists, then retry with a NEW key; stored error answers replay for 24 h."

### RV-2 audit — every 409/429/503 raised INSIDE the claim (crm · member · kanban · account)
| module | site | code | before/after write | r2 |
|---|---|---|---|---|
| crm | http-errors CONFIRM_REQUIRED (28 service throw sites — confirmation gates) | 409 confirm_required | before | FLAGGED (released) |
| crm | http-errors CRM_V2_DISABLED (assertCrmV2 at service entry) | 409 crm_v2_disabled | before | FLAGGED |
| crm | http-errors STAGE_REQUIREMENTS (deals.ts moveCore :912 "ไม่เขียนอะไรเลย") | 409 stage_requirements | before | FLAGGED |
| crm | http-errors APPROVAL_REQUIRED (deals.ts reassign :1177-1184 · deal lines discount) | 409 approval_required | AFTER (submitForApproval + audit) | kept + replayed (H1-reassign-replay: 1 request) |
| crm | http-errors DUPLICATE · CONFLICT/PARTIAL · EMAIL_BLOCKED · NOT_CONFIGURED · LIMIT | 409 | mostly before, PARTIAL = after; not provable per site | kept + replayed |
| crm | portal-lane RATE_LIMITED | 429 | before (limiter) | FLAGGED |
| member | api/http-errors as400 status 429 (service limiters) | 429 | before | FLAGGED |
| member | api/campaign-port.ts campaignPort() port missing | 503 | before | FLAGGED |
| kanban | api/ops/cards.ts :214/:216 move (WIP limit / not movable), :337 no done column | 409 | before (validation) — unflagged by choice | kept + replayed |
| account | payments-write :66 · finance-write :82/:86 · settings-write :74 · contacts-write :160/:218 · files-write :41 · gl-write :104/:126/:563/:650 · reconcile-write :45 | 409 | mostly before; account/** belongs to another lane (not authorised) | kept + replayed |
| account | files-write :252 SKIPPED (AI not configured) | 503 | after the read job ran | kept + replayed |
| account | import.ts :35 | 429 | before — not authorised to flag | kept + replayed (residual: same-key retry after the window replays 429 → use a new key; documented) |
| core | mapError Thai-word 409s (ปิดงวด/ล็อก/สถานะ/ซ้ำ) | 409 | unknown | kept + replayed |
| core | per-key `rate_limited` (require.ts), `idempotency_*` | 429/409 | before the claim | never stored (unchanged) |

### RV-7 (for the it4 / inventory lane — do NOT edit here)
Rows `scripts/crm-ui-inventory.json`:
`{"page":"/settings/automation","testid":"crm-auto-save","kind":"button","roles":["owner","manager"],"hiddenFor":["nok","thana"],"expect":{"type":"mutation","target":"action:createCrmRuleAction",…,"anyOf":["action:updateCrmRuleAction"]},"wo":"C2.1"}` and
`{"page":"/settings/automation","testid":"crm-auto-rule-toggle","kind":"toggle","roles":["owner","manager"],"hiddenFor":["nok","thana"],"expect":{"type":"mutation","target":"action:toggleCrmRuleAction",…},"wo":"C2.1"}`.
New expectation: persona `manager` (MANAGER, unitAccess [patong] — branch-limited) passes only for rules whose actions are NOTIFY_STAFF / SEND_PUSH (or WAIT_THEN of those). Any record-touching action is refused with the Thai "มองเห็นเฉพาะบางส่วน (ตามทีมหรือสาขา)" message (no DB change). So either (a) the manager journey saves and toggles a NOTIFY_STAFF-only rule, or (b) add a refusal expectation for `manager` on record-action rules: `{"type":"refused","message":"กฎอัตโนมัติทำได้เฉพาะสิ่งที่ผู้ตั้งกฎทำเองด้วยมือได้"}`. `owner` is unchanged.

- Deviation (needs controller): `createEndpoint` keeps a `@deprecated` overload WITHOUT `by` because the oracle `scripts/qc-acc-v2-permissions.mts:768` (not editable) and `seed-acc-v2-qc.mts:2058` call it typed without an author; every src/ call passes `by` (probe WB-static: 15 call sites, 0 without author). After an ORACLE-EDIT adding `by: { userId: null }` (or an owner id) there, the overload can be removed. setEndpointActive / setEndpointEvents: `by` mandatory without escape.

### r2 regression (QC3 unless noted · /tmp/c55-logs/r2/)
probe-fix1 71/71 · probe-auto 9/9 · probe-idem 3/3 · review probe 9/10 (only HOLE-RV-A1 = RV-4, other agent) · c1.10 66/67 (H.1 environmental) · c1.6 79/79 · c1.7 57/57 · c2.1 84/84 · c2.2 73/73 · c2.9 52/52 · c2.10 41/41 · c3.9 49/49 · c0.2 27/27 · c0.5 50/50 · **QC2 c5.3 L1,L3 18/19 — C5.3-L3-m1 red by ruling RV-1** (act `aged=1 · retryA=409 ran=0 · b1=503 b2=200 ranB=2`; ORACLE-EDIT request above) · m2.2 14/15 (S5.1 screenshots) · m2.5 25/26 (S7.2 HTTP/screenshots) · qc-webhook 15/15 · qc-webhook-ui 11/11 · account-api-core 64/64 · account-api-webhooks 22/22 · account-deep 10/10 · acc-v2-permissions 137 ok / 23 red = all R-block seed comparisons (acc-v2 seed is QC1; W1–W2 webhook checks green) ⇒ controller on QC1 · account-api-docs 11/17 (F2.1-2.3,2.5-2.7 = gitignored .claude/skills absent in this worktree) · acc-v2-security: same 6 reds on base 288cca97 src (/tmp/c55-logs/base-acc-security.log — S5 Beam payment record + S17 hex debt) ⇒ pre-existing/QC3 · docs --check ×4 exit 0 · typecheck exit 0 · fitness 33/33 ×2.

## CONTROLLER MERGE GATE (main tree, 1 Oct)

Patch = c54e `288cca97..bc399d5d` (src · docs · gen-*-api-docs · c1.10 · probes · notes) applied with `patch --fuzz=3`, 0 rejects. All patched files byte-identical to c54e except `crm/index.ts` and `crm/sequences.ts`, whose difference is exactly the D2/N changes already on session/crm. ORACLE-EDIT C5.3-L3-m1 (RV-1 ruling, tightened per round-2 review 6b): stale claim ⇒ 409 `idempotency_outcome_unknown`, same-key retry replayed (header), stored row 409, handler runs 0×.

| step | where | result |
|---|---|---|
| typecheck · docs --check ×4 · fitness (no env + QC3) | main | exit 0 |
| probe-fix1 · probe-idem · probe-auto | QC3 | exit 0 |
| c0.2 · c2.9 52/52 · qc-webhook 15/15 · qc-webhook-ui 11/11 | QC3 | green |
| c1.10 | QC3 | 66/67 — only H.1 (HTTP against the running :3215 server, built from older src; recheck after the next rebuild) |
| c5.3 `--only=L1,L3` | QC2 (suite is QC2-pinned) | 19/19 with the edited L3-m1 |
| qc-account-api-webhooks | QC2 | 22/22 (on QC3 9/12 = QC3 lacks the N migration: `account_jno_ensure_system` missing — not this card) |

Logs: `.qc-shots/crm/main-fix1.log`, `main-fix1b.log`. Owed: `qc-acc-v2-permissions` on QC1 after button run3; c1.10 H.1 after :3215 rebuild; N migration on QC3.

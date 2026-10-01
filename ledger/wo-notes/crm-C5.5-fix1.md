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
- [ ] regression
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
| ASSIGN | contacts.assignContact `contacts.ts:1293` (mutate → crm.contact.update `:1152`) · deals.reassignDeal `deals.ts:1108` crm.deal.update + crm.deal.reassign when cross-team `:1135` | crm.contact.update + crm.deal.update + crm.deal.reassign · CONTACT+DEAL ALL |
| CREATE_ACTIVITY | activities.logActivity `activities.ts:642` crm.activity.create + target visible | crm.activity.create · CONTACT+DEAL ALL |
| CREATE_DEAL | deals.createDeal `deals.ts:688` crm.deal.create + contactWhere | crm.deal.create · CONTACT+DEAL ALL (pipeline param) |
| OPEN_KANBAN_CARD | activities.openTaskCard `activities.ts:1185` crm.activity.create + kanban `visibleBoardOptions` + createCardFromExternal `assertBoardRole EDITOR` (`kanban/links.ts:263`) | crm.activity.create · board via new `kanban/links.canOpenCardOnBoard` (visible + EDITOR) · CONTACT+DEAL ALL |
| SEND_EMAIL | emails.sendEmail (crm.email.send) | crm.email.send · CONTACT ALL |
| SEND_LINE | chat reply `chat/actions.ts:166` assertChatCan chat.message.send | rbac evaluate chat.message.send · CONTACT ALL |
| SEND_PUSH / NOTIFY_STAFF | none (internal notice; recipients filtered at run by C5.4-B `crmRecipientsWhoSee`) | nothing beyond crm.automation.manage |
| ENROLL_SEQUENCE / STOP_SEQUENCE | sequences.enroll/stop `sequences.ts` ENROLL_KEY | crm.sequence.enroll · CONTACT ALL (runtime still skips these steps) |
| SET_FIELD | contacts.updateContact `contacts.ts:971` crm.contact.update · deals.updateDeal `deals.ts:1226` crm.deal.update | contact: crm.contact.update + CONTACT ALL · deal: crm.deal.update + DEAL ALL |
| ADD_TAG / REMOVE_TAG | contacts.setTags `contacts.ts:1233` crm.contact.update | crm.contact.update · CONTACT ALL |
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

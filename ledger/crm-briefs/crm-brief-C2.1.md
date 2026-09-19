# C2.1 — Automation scope CRM + shared action runner (decision C18)
Read `crm-brief-COMMON.md` first. Contract: CRM-RUN §2 "C2.1". Spec: blueprint §7.3, mockup 07 (top).

## Facts
- Generic engine `src/lib/automation/engine.ts#runForEvent(evt, deps?)` filters `{event, enabled, boardId: null, scope: "KANBAN"}`; board engine `src/lib/modules/kanban/automation.ts` (`runAction` switch, `executeActions`, `dryRun`, WEBHOOK action already guarded by `webhookTargetProblem`, `postWebhook` 5 s timeout).
- Member journeys `src/lib/modules/member/journeys.ts`: `runForEvent` (:659), `enterJourney` (:746), `runAction` (:894, 12 kinds), `executeActions` (:1085), `runDueWaits` (:1124, lease on `scheduledAt`, `WAIT_LEASE_MS` 15 min), `finishWait` (:1155), `eventKeyOf` (:622), `resolveCustomerId` (:605). Generic: lease/claim, `eventKeyOf`, sequencing, deps injection (`JourneyDeps` in `journeys-shared.ts:470`; senders in `src/lib/member-journey-senders.ts`), `AutomationRun` bookkeeping, holdout/re-entry/loop guards. Member-bound: `ExecEnv.customer`, `consentOf`/`addressOf`, every action except OPEN_KANBAN_CARD/NOTIFY_STAFF, the `memberSystemId` check.

## Deliverables
1. NEW `src/lib/automation/action-runner.ts`: the generic parts MOVED out of journeys.ts behind a small `SubjectAdapter` interface `{ resolveSubject(evt), addressOf(subject, channel), consentOf(subject, channel) /* evaluated at SEND time */, runDomainAction(kind, params, env) }`. Member journeys become an adapter (`customer`), CRM adds an adapter (`contact`: address from `CrmContact.email/phone/lineUserId` or the linked member identity; consent via `consents.canContact`). NO second copy of the wait/lease or send code. `qc-member-m3.3` and `qc-member-fix-s3` must pass unchanged.
2. CRM rules: `AutomationRule scope=CRM` + `crmSystemId` (+ optional `pipelineId`); engine sees only rules of the event's CRM system; triggers = every `crm.*`/`custom.record.*` event + cron triggers `crm.deal.stale{days}`, `crm.activity.overdue`, `crm.score.threshold{band}`, `crm.deal.close_due{daysBefore}`, `custom.record.field_due{objectKey, fieldKey, daysBefore}`; conditions with prefixes `c.` `co.` `d.` `f.{key}` `o.{objectKey}.{fieldKey}` + exists/count, one level AND/OR; actions (14 + CREATE_DEAL): MOVE_STAGE, ASSIGN, CREATE_ACTIVITY, OPEN_KANBAN_CARD, SEND_EMAIL (plain send until C2.5 swaps the transport), SEND_LINE (via `chat.sendLineToParty`), SEND_PUSH, ENROLL_SEQUENCE/STOP_SEQUENCE (no-op stubs until C2.2), SET_FIELD, ADD_TAG/REMOVE_TAG, ADJUST_SCORE (stub until C2.8), NOTIFY_STAFF, WEBHOOK (through `webhookTargetProblem`), WAIT_THEN, CREATE_DEAL.
3. 6 starter rules (disabled by default), dry-run (writes nothing), monthly quota per scope (default 5,000), loop guard, run log; UI `/settings/automation` reusing the K2.9 sentence builder components.

## Files you own
`src/lib/automation/action-runner.ts` (new) · `src/lib/modules/member/journeys.ts` (move-only refactor) · `src/lib/modules/crm/automation.ts`, `automation-shared.ts` · engine hook in `src/lib/automation/engine.ts` (CRM branch like the kanban delegation) · `src/app/app/sys/[id]/crm/settings/automation/**` · `src/components/crm/automation/**`.

## Acceptance (oracle `qc-crm-c2.1`)
CRM-RUN S1–S7 (30).
X1 rule of CRM system A never fires for system B / other tenant; actions cannot target stages/users/boards outside the tenant/system · X4 same event twice/parallel → one run per rule (unique eventKey) · X5 WAIT_THEN: overlapping `runDueWaits` → resumed once; crash after claim → resumed after lease · X6 WEBHOOK to 127.0.0.1/169.254.169.254/localhost refused; template variables escaped · X8 consent evaluated at send time (withdraw during WAIT → SKIPPED with Thai reason) · X9 rule enable/disable/delete audited; quota enforced.
Regressions: `qc-member-m3.3`, `qc-member-fix-s3`, `qc-member-m3.6`, `qc-kanban-k2.9`, `qc-automation`, `qc-ai-automation`, C0.5 oracle.

## Controller addendum (19 Sep · oracle `qc-crm-c2.1` 84 checks)
CONTRACT BLOCK (sections A–F) in the oracle header is binding. Rulings:
1. S6 regression children may fail ONLY on screenshot checks that read `.qc-shots/` — accepted.
2. SEND_EMAIL before C2.5: no real transport in C2.1 — the default (no injected dep) records the run step SKIPPED with a Thai reason ("ส่งอีเมลจากกฎยังไม่เปิด — มาพร้อมระบบอีเมล") ; C2.5 wires the transport. `crm-outbound.ts` stays in-app only (C1.8 check).
3. `f.{key}` = contact custom field (`d.f.{key}` deal) — confirmed. 4. `crm.activity.overdue` = cron trigger until C2.10 — confirmed.
5. Quota per TENANT (`Tenant.limits.crm.automationRunsPerMonth`, default 5,000) counting runs of all its CRM systems; member runs not counted.
6. Contactless events (e.g. `crm.company.*`) MUST dedupe too: advisory lock on (ruleId, eventKey) + find-then-insert (the DB partial unique covers only contact runs). Add the case to the builder's probe.
7. Extracting a shared builder component into `src/components/automation/**` is allowed ONLY as a move-only refactor; `qc-kanban-k2.9` must stay green.
Permanent rule: uiVersion-1 (U.*). Builder starts after C2.0.

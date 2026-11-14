# H4.5 — LINE notifications for employees (link · notices · menu) + in-app fallback

> **DRAFT r0 — §9 defaults in force unless the controller rules.** Lane C · **privacy + identity + race ⇒ reviewer + hunter (privacy).** **Mig** `20270111000000_hr_line_link` (2 tables, additive). Base `session/hr` 1725eb106. Branch `wip/hr-h4.5`. Oracle `scripts/qc-hr-h4.5.mts` (+ `qc-hr-lib.mts`). Plan row H4.5 · DESIGN §8 (แชท/ประชุม) · DESIGN §9 #1 (**no LIFF**) · no mockup.

## 1. Facts (base 1725eb106)
F1 **LINE = chat + platform (SVC R0.7)**: OA = `ChatChannelConnection`; OA per branch = core setting `messaging.lineConnectionId`; `messaging.quietHours` 21:00–08:00.
F2 Facade `@/lib/modules/chat`: `issueLinkCode` / `consumeLinkCode` (HMAC-stored, single-use atomic, 10 guesses/15 min, OA-bound, uniform `null`) · `pushLineMessagesToContact(ctx,{chatContactId, connectionId, messages, retryKey})` (tenant+OA-bound, not blocked; 409 ⇒ ok, 429 ⇒ `QUOTA`; **no chat-room write**) · `replyLineMessages` (free).
F3 `platform/postback-routes.ts`: `POSTBACK_ROUTES`, `handleLinkCodeText` → `resolveParty` → `onLinked`, uniform `LINK_FAILED_TEXT`. Webhook route verifies signature (401), dedupes `webhookEventId`, masks code text, ctx from the connection row — **unchanged**.
F4 `platform/notify-customer.ts` = customer gate (booking|rooms, editable templates); exports `lineRetryKeyOf` (Q1).
F5 Fake seam: `chat/line.ts lineApiBase()` honours `LINE_API_BASE=http://127.0.0.1:<port>` outside prod (qc-svc-b.9).
F6 F2.1 forbids `hr→chat` ⇒ glue in `src/lib/platform/hr-line.ts` (precedent `dorm-line.ts`), chat + hr facades only.
F7 Events (ids only): `hr.roster.published` {publishId, employeeIds} · `hr.leave.decided` {leaveId, employeeId, status} · `hr.ot.decided` (ot.ts already notifies in-app) · `hr.shift.swap_requested|swap_approved` {swapId, employeeIds} · `hr.payroll.paid` {runId} · `hr.employee.offboarded`. Employee in-app **missing** for roster/leave/swap/payslip (H2.10 Q8, H2.11 D5). Anchors: `/app/me/hr/requests#req-{leave|ot|swap}-<id>`, `/app/me/hr/week`, `/app/me/hr/pay/<runId>`.
F8 No `unfollow` handling (blocked = `ChatContact.blockedAt`).

## 2. Scope
In: employee↔LINE link (self code; unlink self/admin/LINE; auto-end) · in-app + LINE notices (roster, leave/OT/swap results, swap ask, payslip ready) · quiet hours · digest · cap · menu postback (links incl. leave form) · settings · audit.
Out: AI leave intake (H4.5b) · approver LINE · rich menu · unfollow · cert/correction notices · e-mail/SMS.

## 3. Contract
R1 **Migration** (hunks `HR H4.5` in `hr.prisma`, `core/scope.ts` `sys()` ×2, `hr-qc-env.mts` + delete order):
`HrLineLink {id, tenantId, systemId, employeeId→HrEmployee RESTRICT, issuedForUserId, status CHECK (PENDING|ACTIVE|ENDED|CANCELLED), connectionId?, chatContactId?, expiresAt, linkedAt?, endedAt?, endReason CHECK (SELF|ADMIN|LINE|RELINK|OFFBOARD|ACCOUNT|BLOCKED|CONTACT_REUSED|REISSUED)?, createdAt}` · CHECK ACTIVE ⇒ connection/contact/linkedAt set · partial UNIQUE (systemId, employeeId) WHERE ACTIVE · same WHERE PENDING · (tenantId, chatContactId) WHERE ACTIVE.
`HrNotice {id, tenantId, systemId, employeeId, kind CHECK (ROSTER|LEAVE|OT|SWAP_ASK|SWAP|SLIP|DIGEST), refId, outcome?, dedupeKey, appNotified, line CHECK (NONE|PENDING|SENDING|HELD|SENT|FAILED|QUOTA|CAP|SKIPPED), lineAttempts 0, nextAttemptAt?, sentAt?, skipCode?, digestOf?, createdAt}` · UNIQUE (tenantId, dedupeKey) · index (line, nextAttemptAt). No names, LINE ids, texts, money. Re-take qc-hr-h0.1 S4.2.
R2 **Pure** `hr/line-rules.ts`: `HR_LINE_TEXT(_EN)` · `noticeMessage({kind, outcome, n?}, locale, href)` → `{altText, flex}` (one sentence + one `uri` button + fixed "login required" footer) · `hrefOf` (F7; DIGEST `/app/me/hr`) · `dedupeKeyOf` = `hr:<kind>:<refId>:<employeeId>[:<outcome>]` · `nextAttemptAt` (5 m/30 m/2 h/null) · `lineNotifyPolicyOf` · `monthKeyBkk`. Text = kind + outcome word only.
R3 **Link (HR, `hr/line-link.ts`, no chat import)**: `myLineStatus(actor)` → `{ok, state NONE|PENDING|ACTIVE|NOT_AVAILABLE, linkedAt, displayName (self only), shopEnabled}` · `beginLineLink(actor, opts)` (`resolveSelf` only) refusals `NO_EMPLOYEE|INACTIVE|DISABLED|NO_OA|RATE` (`checkRateLimitDb hr-line-issue:<t>:<e>` 5/h, count first); tx: lock `hrline:<sys>:<emp>` → old PENDING → CANCELLED(REISSUED) → new PENDING (issuedForUserId, +10 min) → `{ok, linkId, connectionId}` · `completeLineLink({tenantId, connectionId, chatContactId, linkId}, opts)` tx: same lock → PENDING ∧ unexpired ∧ tenant ∧ OA equal ∧ employee active ∧ `linkedUserId = issuedForUserId` ∧ accepted Membership (DB) else `{ok:false}`; old ACTIVE → ENDED(RELINK); contact ACTIVE for another employee → ENDED(CONTACT_REUSED); → ACTIVE; in-app note "LINE linked" · `unlinkMyLine(actor)` · `adminUnlinkLine(ctx, viewer, {employeeId})` (H1.1 manage key + scope) · `endLineLinks(filter, reason)`.
R4 **Platform `hr-line.ts`**: `issueHrLineCode(actor)` → `beginLineLink` → `issueLinkCode({purpose:"HR_EMPLOYEE", refId: linkId, ttlMin:10, connectionId})` (code returned once, never logged) · route `{prefix:"hr.", resolveParty: ()=>null, onLinked, onPostback}` · `onHrLinked` refusal ⇒ `{text: LINK_FAILED_TEXT}` · `hr.menu` ⇒ reply menu flex (week · requests/leave form · pay) if ACTIVE link for `(ctx.tenantId, ctx.connectionId, ctx.chatContactId)`, else one fixed `notLinked` · `hr.unlink` ends own link. Never reads ids from params.
R5 HR never writes `ChatContact.partyId/customerId`.
R6 **Notices (HR, `hr/line-notify.ts`)**: `planHrNotices(evt)` one tx; recipients: roster `employeeIds` · leave APPROVED/REJECTED (skip CANCELLED, skip decider = own user) · OT all outcomes, `appNotified=false` · swap_requested counterpart · swap_approved both · paid items with `slipState` ISSUED. `INSERT … ON CONFLICT DO NOTHING`; inserted ⇒ AppNotification (fixed text) + `line` PENDING (policy ∧ event on ∧ ACTIVE link) | HELD (DIGEST) | NONE. `claimLineNotices({ids?|due, now, limit})`: guarded `updateMany` → SENDING (stale SENDING > 2 min reclaimable), then per-row DB precheck (link ACTIVE, employee active, `linkedUserId = issuedForUserId`, Membership) — fail ⇒ link ENDED + notice SKIPPED · `finishLineNotice`.
R7 **Sender** `sendHrLineNotices({tenantId, ids?}, opts)` (platform, never throws): quiet hours of home unit ⇒ HELD to `nextQuietEnd` · month SENT ≥ cap ⇒ CAP + audit once/month · push with `retryKey = lineRetryKeyOf(tenantId, dedupeKey)`, absolute href (`APP_URL`→`NEXT_PUBLIC_APP_URL`, none ⇒ SKIPPED `NO_URL`) · ok ⇒ SENT · `QUOTA` ⇒ final + audit once/day · `NO_LINE_IDENTITY` ⇒ SKIPPED (+ link ENDED(BLOCKED) if blocked) · else FAILED + backoff, 3 tries. Digest at `digestAt`: one DIGEST notice per employee/day (`n`), members SENT with `digestOf`.
R8 **Consumers** (`outbox-consumers.ts`, one hunk): the 6 events of F7 keep their handler, wrapped `compose(current, onHrEventForLine)` (plan + send own ids); `hr.employee.offboarded` also ends links + SKIPs pending. **No new event types/labels.** Minute job `hr.line` (5 min) `runHrLineJobs(now, {budgetMs, signal})`: due HELD/FAILED/stale, digest, expired PENDING → CANCELLED.
R9 **Settings** `AppSystem.settings.lineNotify` via `lockHrSettings(tx, ctx, ["hr:linepolicy:<sys>"])` + `writeHrSettingsKeys`: `{enabled:false, events:{ROSTER,LEAVE,OT,SWAP,SLIP:true}, mode:IMMEDIATE|DIGEST, digestAt:"17:30", monthlyCap:200 (0–5000), unitId:null}`; gate `canManageHrSettings`; audit `hr.line.settings`. Off ⇒ queued → SKIPPED(OFF).
R10 **Actions**: `hr/line-actions.ts` (unlink self/admin, save policy) · `platform/hr-line-actions.ts` (`issueMyLineCodeAction`). Pages pass actions as props; hr never imports platform.
R11 **UI** `hr/line-ui.tsx` (tokens, th+en, ≥44 px): self card on `/app/me/hr/profile` (`hr-self-line-{card,link,code,deeplink,unlink,status}`, code once + expiry + PDPA sentence "notices and links only, no pay or personal data"); settings section `hr-line-settings-*` with "sent this month N / cap"; employee chip + admin unlink `hr-emp-line-{chip,unlink}` (status + linkedAt only). Inventory + visual-hr `"4.5"` (CONTROLLER-RUN).
R12 **Audit**: `hr.line.link {employeeId}` · `.unlink {employeeId, reason}` · `.settings` · `.cap_reached {monthKey}` · `.quota {connectionId}`. Never codes, LINE ids, contact ids, texts.

## 4. Privacy + security
P1 Bodies/altText from the fixed table; no names, dates, leave type, reason, period, amounts, branch. P2 Links carry **no token**; login + self gate decide; forwarding reveals only "an event of kind X". P3 Code single-use, 10 min, bound to tenant + OA + PENDING row + user; reissue voids older. P4 Shop A never resolves in B: all lookups by webhook-derived `(tenantId, connectionId, chatContactId)`. P5 Signature + replay dedupe unchanged. P6 Every send re-derives from DB, never payload. P7 Pushes not stored in chat rooms. P8 Admins never see LINE name/id.

## 5. Files
New: migration · `hr/line-rules.ts` · `hr/line-link.ts` · `hr/line-notify.ts` · `hr/line-actions.ts` · `hr/line-ui.tsx` · `platform/hr-line.ts` · `platform/hr-line-actions.ts`.
Hunks `HR H4.5 ▸ … ◂`: `hr/index.ts` · `hr.prisma` · `core/scope.ts` · `hr-qc-env.mts` · `chat/link-code.ts` (`LINK_PURPOSES` += `"HR_EMPLOYEE"` only) · `platform/postback-routes.ts` (domain/prefix `hr`, `DATA_RE`, `LINK_PURPOSE_PREFIX`, route) · `outbox-consumers.ts` · `platform/minute-jobs.ts` · profile page · HR settings page · employee profile page · messages th/en · `hr-ui-inventory.json` · `visual-hr.mts`.
**Frozen**: webhook route · rest of `chat/**` · `notify-customer.ts` · payroll*/payslip* · roster/leave/ot/swap/service/lifecycle · `approval/**` · `account/**` · `settings-lock.ts` · other oracles · `qc-hr-lib.mts` · `package.json`.

## 6. Acceptance (`qc-hr-h4.5.mts`; SKIP while `hr/line-rules.ts` absent)
**Fake** = oracle's local HTTP server, `LINE_API_BASE=http://127.0.0.1:<port>` (F5): records `to`, messages, `X-Line-Retry-Key`; scripted 200/409/429/500/hang. Webhook = route `POST` with body HMAC-signed by the fixture OA secret (qc-svc-r0.7 helper). Nothing else mocked.
1 Static: no chat/platform import under `hr/**`; facades only; frozen list identical; F2.1 green; no new outbox type.
2 Pure: th/en keys; P1 grep over kind×outcome×locale; dedupe/backoff vectors.
3 Link: begin → code → signed webhook ⇒ ACTIVE, exact reply, room shows `LINK_CODE_MASK`, audit, in-app note.
4 Refusals (`LINK_FAILED_TEXT`, no ACTIVE): expired · reused · wrong OA · other tenant's code · reissued · employee ENDED · `linkedUserId` changed · Membership gone · 11th guess.
5 Relink ⇒ RELINK; same contact to B ⇒ A CONTACT_REUSED.
6 Same body twice ⇒ 1 link/1 reply; bad signature ⇒ 401, no writes.
7 Each of 6 events ⇒ exact recipients, 1 notice + 1 in-app (OT none new), 1 push; policy off ⇒ 0 pushes, in-app present.
8 Replay-twice per consumer ⇒ no new rows/pushes.
9 500 ⇒ FAILED, job retry same key, 1 delivery; 429 ⇒ QUOTA + 1 audit; hang ⇒ FAILED; LINE down ⇒ in-app present; blocked ⇒ SKIPPED + ENDED(BLOCKED).
10 Crash after accepted push (stale SENDING) ⇒ resend same key, fake 409 ⇒ SENT, 1 delivery.
11 Fixed `now`: quiet ⇒ HELD then 1 send; digest 3 ⇒ 1 push "3"; cap 2 ⇒ 3rd CAP + 1 audit.
12 Offboard / account unlink / membership removed ⇒ ENDED, pending SKIPPED, 0 pushes after commit.
13 `hr.menu` linked ⇒ menu; unlinked/other tenant ⇒ identical `notLinked`; param ids ignored; `hr.unlink` own only.
14 Races (separate connections ×3): 10× plan ⇒ 1 row/1 push · 2 drains ⇒ 1 push · 2 contacts consume 2 codes of one employee ⇒ 1 ACTIVE · begin ∥ complete consistent · settings ∥ other HR writer ⇒ both keys kept.
15 Viewer matrix (C.2) on status/actions/chip; F.3 scope `[]` = all, explicit list refused without ids; identical Thai refusal bytes.
16 Tables/audits hold no PII; exact audit keys.
17 Residue 0; fitness + fitness-hr green.

## 7. Run list (builder)
Migration (QC4 `qc4.sh`) → `prisma generate` (own node_modules) → pure → link → notify → platform → consumers/job → UI → `qc-hr-h4.5` ×3 → `qc-hr-h1.1` · `qc-audit-trail` · `qc-hr-h2.11` · `qc-hr-set-1` (ORACLE-EDIT if its writer list pins files) · `qc-hf-hr-privacy` · chat/LINE owner suites `qc-svc-r0.7` `qc-svc-b.9` `qc-svc-d.9` `qc-chat-security` `qc-chat-security-scope` · `qc-hr-h0.1` (S4.2) · `qc-hr-h2.1` `h2.3` `h2.7` `h2.9` `h2.10` `h3.8` `h4.4` · `fitness` + `fitness-hr` (±env) · `qc-nav-functions` → typecheck once (gate lock, `iso.sh`). Paste picker line.

## 8. Cost note
LINE bills each **push** against the shop's OA plan (shared with booking/dorm/marketing); replies are free. Defaults: OFF per shop · roster 1 push/employee/publish · leave/OT final outcomes only · cap 200/month · DIGEST ≤ 1 push/employee/day.

## 9. QUESTIONS FOR THE CONTROLLER [default · reason]
Q1 Seam: HR queue + chat `pushLineMessagesToContact`, not `notifyCustomer` [that gate is Party/template-bound; HR needs fixed texts, digest, cap; retry/quota semantics reused].
Q2 Identity proof: self-issued code from logged-in "ของฉัน", typed in OA chat [no LIFF ruling; audited single-use code]. Manager-issued codes for kiosk-only staff: no.
Q3 TTL 10 min, issue 5/h [short exposure].
Q4 OA = home unit's `messaging.lineConnectionId`, fallback `lineNotify.unitId`, else NOT_AVAILABLE [existing per-branch rule].
Q5 Events per R6, payslip on `hr.payroll.paid` [plan list, no new events]; corrections/advances no.
Q6 Body = kind + outcome word [forward-safe]. Alt: generic "update".
Q7 OFF · IMMEDIATE · cap 200 · digest 17:30 [cost].
Q8 New in-app notices for all shops, LINE on or off [fallback; closes H2.10 Q8]; suites counting AppNotification may need ORACLE-EDITs.
Q9 Leave from LINE = menu link to H2.10 form; AI intake → H4.5b [identity, health data, shared inbox].
Q10 No approver pings/approve buttons [decisions behind login].
Q11 `hr.unlink` postback allowed [self-only].
Q12 Retry 3×; QUOTA final [notify-customer semantics].
Q13 Locale en if `ChatContact.lang` starts "en", else th [notifyCustomer rule].
Q14 Self sees own LINE name; admins status only [hijack check vs minimisation].
Q15 No tenant in links [no leak; switcher = debt].

## QUESTIONS ONLY THE OWNER CAN ANSWER
O1 Real pilot OA + webhook URL for UAT [safe: fake in oracle; feature OFF].
O2 May HR spend OA quota; cap value [safe: OFF per shop, cap 200].
O3 PDPA wording for employees [safe: R11 fixed sentence; lawyer later].

## 10. Debts
D1 H4.5b AI/KB leave intake · D2 approver LINE · D3 follow/unfollow → link state · D4 employee rich menu · D5 tenant switch in links · D6 cert/correction/advance notices · D7 e-mail.

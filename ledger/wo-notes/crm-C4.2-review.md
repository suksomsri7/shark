# C4.1 + C4.2 — independent review of the it4 phase-B acceptance claims (run3 + run4)

Reviewer: independent (did not build this). Written 2026-10-02 04:4x UTC. Worktree `shark-crm-c42b` @ `8fc52fb6`.
Read-only on registry/runner/product; nothing was run against :3215; no DB access; no `.env*` read.
Evidence: `/tmp/c42b-logs/run{3,4}-*-summary-*.json` + logs, `scripts/pending/c42b/*`, runner `scripts/qc-crm-buttons.mts`
(md5 a41b7fc8 = `next/`), registry `scripts/crm-ui-inventory.json` (working copy, md5 3f43b42f = `next/`), product source read
from `/root/projects/shark-crm` git objects at `1d23347e` (run4 build) and `HEAD` (bbe2072f).
Helper scripts I wrote (read-only analysis, not committed): `/tmp/rv-c42/*.py`, `/tmp/rv_*.py`.

> Note on the brief: the c42b worktree's `src/` is at **46f952cc** (`git log -1 -- src`), not 1d23347e. Every source citation
> below comes from `git show 1d23347e:<path>` or `HEAD:<path>` in `/root/projects/shark-crm`, not from this worktree's `src/`.

## Claim 1: run4 totals. CONFIRMED (arithmetic only)
I recomputed the totals from the 41 run4 summary files: owner 962/962, manager 957/960, nok 1052/1052, thana 1058/1058,
customer 25/25. restoreFailures = 0. Every file has `fatal: null`. There is no `-crash.json` and no `redo once`/`WAIT`/`GIVE UP` line
in the run4 logs. The md5 freeze is runner 12c2e79d and registry 503dd1cb (`run4.md5`). run3 also matches the note (owner 1771/1771 ·
manager 1798/1799 · nok 1905/1935 · thana 1925/1953 · customer FATAL).
The numbers are correct. What they mean is a separate question, covered in RV-2, RV-3 and RV-5.

## Findings

### RV-1: HIGH. The PDPA erase button was never pressed, which violates binding ruling §11(b)
- Ruling §11(b) (crm-C4.2.md:145) says "`contact-privacy-erase-submit` is NOT skipped. The runner creates its own throwaway contact … and
  erases THAT one."
- The throwaway machinery exists: `AUDIT_STATE_ROWS` (qc-crm-buttons.mts:537), `createThrowaways` (:539, :2125), per-item path swap
  (:811). But the row is still in `CROSS_MODULE_GUARD` (qc-crm-buttons.mts:225). `it.guard` is set from that map (:818) and wins at :1710.
- Result: `skippedSafety` for owner and manager on both devices in **run3 (summary-3) and run4 (summary-10)**. No pass ever pressed it.
- This matters more now. `privacy.ts` (+624), `portal.ts`, `kanban/links.ts`, `forms/service.ts` and `member/service.ts` all changed after
  run4 (fix9/fix11 erase paths). run5's "/settings fix9/fix11 PDPA export/erase" chunk cannot exercise erase either.
- Close: delete the guard entry, because the throwaway contact already makes the press safe. Then do a dbg run on
  owner/manager `/contacts/[contactId]` d+m that shows the throwaway (not a seed contact) erased, with its `crm.contact.erase`
  audit row. Then include the row in the final pass.

### RV-2: MED. About a quarter of all passes are "soft" inline-error passes, including 49 controls with a checkable target
- The registry has 1066 rows, and 419 of them (39 %) are `inline-error`. For these the runner does `ok = true` (qc-crm-buttons.mts:1962-1963).
  The only test is the dead detector, which passes on any DOM mutation, request or value change within 3 s.
- I rebuilt the composition of the passes from the summaries plus the registry. My reconstruction matches the claimed totals exactly
  (run3 7399, run4 4054).

  | run | absent (hiddenFor) | inline-error (soft) | navigate | mutation | ui | modal | download/toast |
  |---|---|---|---|---|---|---|---|
  | run3 | 46.2 % | 21.2 % | 11.6 % | 11.4 % | 5.3 % | 3.6 % | 0.7 % |
  | run4 | 40.1 % | 26.1 % | 13.0 % | 11.0 % | 5.2 % | 4.2 % | 0.4 % |

  Per role in run4: owner 45 % soft; nok/thana **75 % absence checks**, then 10 % soft, then 4 % mutation.
- 49 of the soft rows are buttons, tabs or forms whose `expect.target` is a concrete testid that could be checked as `ui`/appears.
  Examples:
  - the 7 AI buttons (`crm-ai-deal-summary/-risk/-draft-email`, `crm-ai-contact-why-hot/-closing`, `crm-ai-company-summary/-upsell` → `crm-ai-result`)
  - `crm-auto-dry-run` → `crm-auto-dry-result`
  - `crm-portal-revoke-*` → `crm-portal-revoke-confirm-*`
  - `company-contact-remove-btn` → `-confirm`
  - `teams-create-open` → `teams-create-form`
  - `crm-email-rotate-key` → `-reason`
  - `crm-email-template-new` → `-name`

  Today these pass if any spinner or attribute flips.
- No controller ruling accepting the soft pass exists. The addendum (crm-brief-C4.2.md §1) asked for one, and CRM-RUN.md:491 lists it
  as pending. C4.3 owns bad-input assertions, but it does not cover these buttons.
- Close: convert the 49 rows to `ui`/`modal` with their target, and re-run them. Get an explicit ruling for the remaining field rows (value-change only).

### RV-3: MED. Most mutation passes do not check the stated DB effect, and 10 rows count a refusal as a pass
- The brief requires "a server action … returned ok AND the stated DB effect is observable".
  - 177 of the 263 `mutation` rows have no parseable `Model ±1` / `Model.col=value` clause.
  - In run4 alone, `dbCheckUnparsed` lists 86 distinct page#testid.
  - For these rows, pass means only "a non-GET fired, no response ≥400, no new role=alert" (qc-crm-buttons.mts:1913-1961).
- The refusal exemption `/ปฏิเสธ|ข้อความไทย|inline/` on `expect.db` (:1934) turns off the new-alert check for **10 rows**:
  - `crm-seq-enroll-submit`, `crm-seq-bulk-submit`, `crm-seq-archive`, `crm-seq-new-submit`, `crm-seq-window-from/-to`, `crm-seq-holiday-add`
  - `crm-auto-delete-confirm`, `company-parent-submit`, `crm-settings-team-room-save`

  Their `db` text describes the refusal branch as well as the success branch. A server refusal that answers 200 with `{ok:false}`
  therefore passes. Example: `crm-seq-enroll-submit` passed for owner/manager in run4, and nothing shows that an enrolment row was written.
- Close: apply the exemption only when the row's expected outcome is the refusal itself. Add count or column clauses at least for the
  rows that create, assign or delete (enrol, bulk-assign, archive, owner change, invite).

### RV-4: HIGH. Money- and permission-sensitive controls were never pressed by any role
- Recomputed with my own coverage script (`/tmp/rv_cov.py`, from run3 ∪ run4 pageStatus + skips):
  - 1078 items after `only` expansion.
  - **156 items were never pressed by any role**: every opening for every visible role was skippedNeeds or skippedSafety.
  - 11 more were never planned.
  - That is 167 items, 15.5 %. **48 of them are mutations.**
- `coverage.py`'s "166 rows" is a different measure: rows with at least one role×device never pressed.
- Gaps I consider real holes (they can be covered with runner-owned fixtures inside the snapshot window, the same way the activity, portal and lines-deal fixtures were):
  1. `contact-privacy-erase-submit` (RV-1).
  2. `crm-commission-approve-selected` / `-reject-confirm` / `-select-*`: money. There is a per-manager approval cap (`crm._maxCommissionApproveSatang`). The seed has 0 PENDING commissions.
  3. `crm-portal-request-approve-*` / `-reject-*`: staff approve customer edits. The seed has 0 requests.
  4. `crm-home-unowned-submit` (+ owner/reason/confirm): ownership reassignment, with a daily cross-team cap.
  5. `/u/[token]` `crm-unsub-confirm` / `crm-unsub-notrack`: PDPA/anti-spam opt-out. Never planned because there is no token resolver. The token could come from a qc-btn tracked message.
  6. `/b/[slug]/invite/[token]` `portal-invite-accept`: never planned. The token is returned by `crm-portal-invite-submit`, which the runner already presses.
  7. `crm-seq-enr-pause/-resume/-stop-*`: enrolments, which mean outbound customer mail.
  8. `crm-call-recording-delete-go` and `crm-files-remove-confirm`: PDPA deletion.
- Acceptable as skipped, with the safety reason stated:
  - real e-mail/OTP/Resend sends (`crm-email-send`, `-test-send`, `portal-otp-request`, `crm-email-domain-add`)
  - storage uploads and real AI scan/transcribe
  - POS sale
  - running document numbers (`deal-quote-btn` / `deal-invoice-btn`). These belong to C4.4 US3 / the account suites, and that should be cited.
  - permanently disabled home AI buttons
  - paging over 50 rows
  - MEETING room
- Portal money (`portal-quote-accept/-reject/-confirm-submit`, `portal-pay-promptpay`, `portal-slip-upload`) is structurally unreachable:
  the guard covers it and the fixture is VIEW only. That is acceptable only if C4.4 US3 is cited as the place it is covered.
- Customer coverage: 25 of 63 planned presses, 40 %.
- Close: add fixtures for items 2–7, or get an explicit controller waiver per item naming the suite that covers it.

### RV-5: MED. Many hidden "passes" have no positive control
- The vacuity guard (qc-crm-buttons.mts:2012-2022) only fires when the page itself answers ≥400.
- A hidden check on a page that rendered 200 passes as soon as the control is absent, even if no visible role ever saw that control.
- run4:
  - 1624 absence passes.
  - **184 of them (45 rows)** had no visible role that found the same control on the same device in the same run (safety skips counted as positives).
  - **80 of those (19 rows)** are on pages that rendered **200** for the hidden persona, so the absence proves nothing:
    - `crm-home-unowned-*` ×6 (reassign, write)
    - `crm-ai-proposal-*`, `crm-panel-deal`, `crm-panel-retry`, `crm-hub-switch-link`, `crm-home-stale-banner`
    - `crm-merge-choice`, `crm-object-tab-obj-*`, `contact-convert-member-system`, `crm-seq-enroll-pick`, `crm-seq-bulk-pick`
    - `activity-row-company-link`, `deal-new-create-pipeline`, `contact-phone-tel`
- run3: 102 such checks (25 rows).
- Close: the runner should mark these as unpaired, either in a separate bucket or excluded from `passed`, or fixtures should make the control appear for one visible role.

### RV-6: MED. The customer role has no absence checks at all
- **0 of 1066 rows list `customer` in `hiddenFor`**. Customer appears only in `roles` of 36 portal rows.
- In run4 the customer opened only `/b/[slug]/*` pages (pageStatus of run4-customer-summary-1).
- The comment in run4.sh:33 says "portal pages + hidden checks on /app pages". That is not what happened.
- The brief requires, for customer(portal), that each row is "ABSENT when in hiddenFor". As it stands, nothing in C4.2 shows that a
  portal session cannot reach or see staff CRM controls.
- Close: add a page-level absence row per CRM page for `customer` (the expected result is 404 or redirect, which the lockedOut path already
  treats as a pass), or add `customer` to `hiddenFor` on staff rows. Then run it.

### RV-7: MED. B5 is a fair test fix, but it hides a real product UX gap and drops the only proof of the refusal
- The fix itself is legitimate. With action `NOTIFY_STAFF`, `crm-auto-save` performs a real `createCrmRuleAction` for owner and
  manager (dbg8: manager 94/94, owner 47/47). The save button does work.
- But run4 exposed a gap that manager users will hit in normal use:
  - The default MANAGER has `crm.automation.manage`, so `/settings/automation` is fully interactive for a unit-scoped manager.
  - `handNeedOf` (automation.ts@1d23347e ~l.424-470) needs whole-shop CONTACT/DEAL visibility for MOVE_STAGE, ASSIGN,
    CREATE_ACTIVITY (the builder default), CREATE_DEAL, SEND_EMAIL, SET_FIELD, ADD/REMOVE_TAG, ENROLL/STOP_SEQUENCE and ISSUE_VOUCHER/GIVE_POINTS.
  - `assertAuthorCanDoByHand` therefore refuses almost every action. Only NOTIFY_STAFF, SEND_PUSH and WAIT_THEN can be saved.
  - The builder still offers every action and defaults to one that is always refused.
  - This is the same class as F3 under §15(b): a control that is offered but always fails. It should be recorded as a **PRODUCT** finding
    (LOW–MED, UX: filter or disable unavailable actions, or default to an allowed one), not as "REGISTRY, by design".
- B5 also changed the owner's path (the owner no longer saves the default CREATE_ACTIVITY rule through this row).
- After B5, no row asserts the H55-2 refusal itself.
- Close: log the product finding for the owner. Add a manager row that expects the refusal message for a CREATE_ACTIVITY rule (`expect.db` = refusal).

### RV-8: LOW. The disabled-wait claim holds for `contact-optout-toggle` but not in general
- Verified: `fillEl` waits up to 5 s while the control is disabled, then presses anyway (qc-crm-buttons.mts:1340-1350).
- `contact-optout-toggle` has no `needs`, so a permanently disabled box would still be reported as dead or wrongExpect.
- dbg8 shows "⏳ … 252 ms" right after the previous consent row (dbg8.log:114). That is consistent with the `useTransition` pending state
  in ConsentBlock (`disabled={disabled || pending}`, Contact360Actions.tsx@1d23347e ~l.677/705). The RUNNER class is credible.
- The general statement "permanently disabled controls are still pressed and reported" is **false for the 258 rows with `needs`**.
  A present-but-disabled control on those rows becomes `skippedNeeds` (qc-crm-buttons.mts:1845-1850) and leaves the denominator silently.
  This was observed for `crm-assign-rule-move-up/down-*` and `object-edit-key` (disabled) in run3.
- Close: skip a disabled `needs` row only when the data precondition is checked and false. Otherwise report it.

### RV-9: MED. The restore proof only compares row counts, and the logs show leaks the notes do not mention
- `counts.mts` compares **row counts** of 59 tables plus 4 tag counts, live qc-btn sessions, the portal settings JSON and one taxId.
  It does not check field values. The runner's restore compares content (`stable()`, :1015) but never re-reads afterwards to verify.
  "0 diffs" therefore means equal counts, not an identical database.
- Unreported in crm-C4.2.md:
  - **(a) Chat fixtures were never cleaned up.** Every run fails to delete them because ChatReadState has a RESTRICT foreign key.
    - Logs: run4-owner.log:407-414 (`cmuq6cc7y…`/`cmuq6cc8j…`), run4-manager.log:400-407 (`cmuq9azjd…`/`cmuq9azjz…`); also run3 owner/manager, dbg2 and dbg3.
    - At least 6 ChatConversation + 6 ChatContact (+ ChatReadState) `qc-btn-chat-*` rows are left in QC1.
    - These tables are not in `counts.mts`, so the "0 diff" check cannot see them, and they are not counted in `restoreFailures`.
  - **(b) Outbox not settled.** "outbox still pending after 15 s before restore" appears 10 times in run4, including the final CLEAN of two
    roles. That is the S5 async-consumer hazard, and nothing checked for late side effects.
- The +1 Customer/Party/MemberConsent at 03:06:52 falls in **thana chunk 7** (`/contacts/new`, 03:06:41–03:09:11, run4-thana.log:279-316),
  not chunk 8 as written.
  - That means another writer touched QC1 while this lane held `/tmp/shark-gate.lock`.
  - Attributing it to a member-API suite is **plausible but not proven**:
    - In favour: the audit actor is `pub:…` and the action `member.api.join.complete`, and the runner has no REST or public-join path (its only `fetch` is the ping at :2155).
    - Against proof: the `facts11.mts` output was not saved, and no lane log has been matched to the write.
  - Survival is consistent with the chunk-7 snapshot being taken after 03:06:52; an earlier snapshot would have let the group restore delete those rows.
  - Two lessons: lanes are writing outside the lock, and the runner's restore can delete or revert other lanes' rows.
- Close:
  - Delete ChatReadState before the chat fixtures and clean up the leaked rows.
  - Add a verification read after restore, or content hashes in `counts.mts`.
  - Treat outbox-not-settled as a failure or re-check after a delay.
  - Identify the lane that wrote during the locked window.

### RV-10: HIGH (scope of the release gate). run5 as written is not enough; I recommend a full pass on the final build
- The acceptance numbers are stitched together from three runner/registry/build versions:

  | source | build | runner | registry | coverage |
  |---|---|---|---|---|
  | run3 | 09de6435 | 2f83a576 | b35c337c | 13 chunks |
  | run4 | ca78a54d | 12c2e79d | 503dd1cb | 10 chunks |
  | dbg8 | — | a41b7fc8 | 3f43b42f | 3 groups |

  The final runner and registry have never done a full pass. Ruling §9.3 says "one runner version per full pass", and `fillEl` changed globally.
- Pages last pressed on 09de6435:
  - calendar, commissions, pipelines, reports
  - every settings page except api/automation/email/sequences/portal
  - teams, party, member/members, pos/register
- Since 264c5440 (the run3 source), these changed for **every** CRM page: the new `crm/layout.tsx` (NavPermsProvider), `module-tabs.tsx`,
  `nav.ts` and `access.ts`.
- Merged since 1d23347e but missing from run5's list (`git diff --stat 1d23347e HEAD -- src`):
  - `/companies/[companyId]` (object-field DATETIME display via `components/crm/objects/types.ts`; portal admin panel and `portal.ts` +77)
  - `/settings/objects` (types.ts)
  - `/settings/portal` (portal.ts)
  - `/settings/forms` (`forms/service.ts` +82)
  - `/activities` (`kanban/links.ts` +225; the card rows are `needs`)
  - `/app/sys/[id]/member/members` (`member/service.ts`)
- Pending cards will add more surfaces:
  - fix8 → `/settings/email` and `/emails*`
  - fix12 → `/contacts/new`, `/companies/new`, `/contacts|companies/duplicates`
  - G2 → the chat CRM panel
  - fix10 → `/deals*` and the company 360 deals tab
  - G3 → home AI
- Recommendation: run all 13 chunks × 4 staff roles + customer, **once**, on the final tip, with the final runner and registry frozen
  (md5 checked before each role). This is about 6 h of the QC1 lock (run3 took 11:50–17:44). A partial re-derived run5 would leave 15+
  pages pressed only on a build three or more merges old, under an older runner and registry.

### RV-11: LOW. Registry inconsistencies found while sampling
I sampled 46 rows across 21 pages and traced the gate in source for about 30 of them. All testids exist (see RV-13), and visible/hidden
claims match the product gates, except for the following:
- **(a)** `deal-reopen-btn/-reason/-confirm/-cancel/-submit`: `nok` is unclaimed while `thana` is hidden. Reopen is shown only to OWNER/MANAGER
  (`canReopen={canManage}`, deals/[dealId]/page.tsx@1d23347e:86,235), so no hidden check exists for nok.
- **(b)** `contact-*-reason/-confirm` (archive dialog, opener `contact-menu-archive`): nok and thana are unclaimed. The product gate is
  `archive: crmCan(actor,"crm.contact.delete")` (contacts/[contactId]/page.tsx@1d23347e:173). If "archive" leaked to staff, nothing would catch it.
  Merge, by contrast, is covered through hidden rows with an opener chain.
- **(c)** `contact-menu-*` is one pattern row for six menu items with different key gates, so only the first visible item is pressed as "the" row.
- **(d)** `contact-phone-tel` has `roles: []`. It is not visible to any seeded persona, so it is unverifiable as it stands.
- **(e)** `crm-commission-rule-row-*`: manager is unclaimed.
- **(f)** `deals-forecast-group-*`, `calendar-scope-*` and `activities-scope-*` mark the active choice only with inline style (deals/page.tsx:406,
  calendar/page.tsx:97, activities/page.tsx:125). That is the same a11y class as F2 and ruling §11(c), and it is not flagged.
- Close: an extra sweep with these gates, plus an a11y note for C4.2-fix.

### RV-12: LOW. Stale `needs` texts, loose download check, inaccuracies in the notes
- `crm-seq-*` `needs` say "seed has 0 sequences (component not rendered)". In fact the component renders: `crm-seq-*-pick` is skipped as
  "no other option", and `crm-seq-enroll-submit` / `crm-seq-bulk-submit` were pressed and passed for owner/manager in run4. `sequenceOptions`
  lists only `active:true` sequences (sequences.ts@1d23347e:644-651).
- The download pass criterion accepts any JSON response or any new tab (qc-crm-buttons.mts:1904-1910). It does not prove "bytes + correct content-type".
- Inaccuracies in the notes:
  - the chunk number in RV-9
  - "hidden checks on /app pages" in RV-6
  - the brief's statement that worktree `src` is 1d23347e
- Close: correct the needs texts and the notes, and tighten the download check to `goodDl` or `attachment` plus a non-empty body.

### RV-13: LOW. The committed registry is not the one to merge, and the worktree has unrelated changes
- I reimplemented F14 (`/tmp/rv-c42/f14.py`, same regexes as `scripts/lib/crm-testid-scan.mts`):
  - `next/crm-ui-inventory.json` (3f43b42f) against session/crm `HEAD` and `1d23347e`: **1066 interactive / 0 unregistered / 0 ghosts**.
  - Positive control: the same script against this worktree's src (46f952cc) flags exactly the 3 E rows as ghosts.
  - The committed registry (`8fc52fb6:scripts/crm-ui-inventory.json`) against session/crm HEAD: **3 unregistered** (`company-lifecycle-correct*`).
  - The merge must therefore take `next/` (as the notes say), never the committed file.
- The worktree also has uncommitted modifications to `scripts/crm-ui-inventory.json` and 5 `*expected.json` files. They are not part of this review and I did not touch them.

## Claim 5: registry completeness in the reverse direction (controls without a testid or a row)
I scanned the JSX at session/crm HEAD. Scope: every file under a `crm` folder plus `src/app/{b,u,t}`, excluding v1 `crm/ui.tsx`.
I looked for `button|a|Link|input|select|textarea|form|summary`, for elements with `onClick`/role, and for capitalised interactive
components imported from outside CRM.
- Every such element carries a `data-testid` except these:
  - `ModuleTabs` (43 uses). Excluded by C4.1 ruling D3.
  - `/u/[token]/page.tsx:23,33`: two `<form>`s with no testid. Their submit buttons are registered.
  - `DealMoveDialogs.tsx:182/211/213`: the testid comes in through a spread object (l.177), which F14's `TESTID_RE` cannot read. It is
    still covered by the `deal-req-field-*` row through the l.203 occurrence.
- **No interactive CRM control without a registry row was found.**
- Known exclusions that stay outside the registry: v1 UI (ruling D4; production still runs v1), FieldDesigner/PageHeader (D3), and the public
  form embed `/f/[token]` (forms module; testids `form-public-*`, no CRM rows; the C4.1 brief lists "form embed" as in scope). That last
  one is a scope note, not a blocker.

## What I verified vs. what I only read
**Verified (computed or traced myself):**
- the run3/run4 totals and fatal/crash status
- the pass composition per role
- never-pressed items by any role (167/1078, 48 mutations)
- unpaired hidden checks (run4: 184; 80 on 200 pages)
- 0 customer `hiddenFor` rows
- F14 both directions at HEAD and 1d23347e, with a positive control
- the reverse untestid'd-control scan
- erase guarded in run3 and run4 against the ruling
- the refusal exemption (10 rows) and the inline-error count (419; 49 with checkable targets)
- the `needs`+disabled → skip path
- `fillEl` disabled-wait code
- the dbg8 ⏳ log line
- chat-fixture cleanup failures and outbox-not-settled warnings in the logs
- `counts.mts` measures counts only
- the timing of the 03:06:52 write (chunk 7, under the lock)
- the product gates for about 30 sampled rows (deal reopen, contact archive/merge, deal bulk tag, home filters, forecast, scopes,
  consent block, automation `handNeedOf`)
- the src diffs 264c5440/1d23347e → HEAD

**Only read (not independently verified):**
- the audit-trail attribution of the +1 member rows (facts11 output not saved; I did not query the DB)
- dbg4–dbg8 results beyond their summary lines
- that the 74/91 run2 and 59 run3 classifications are correct row by row
- typecheck/`--dry` exit codes (log files only; I ran nothing)
- the content of fail screenshots
- whether QC1 field values match the pre-run state (no DB access)

VERDICT: ACCEPT AFTER RUN5 (conditions: (1) RV-1 erase un-guarded per ruling §11(b) and pressed on the throwaway; (2) RV-4 fixtures — or a written controller waiver naming the covering suite — for commission approve/reject, portal-request approve/reject, unowned reassign, unsubscribe and invite-accept tokens, sequence-enrolment controls; (3) RV-6 customer absence checks added; (4) RV-9 chat-fixture leak fixed and QC1 orphans removed; (5) RV-2/RV-3: the 49 checkable inline-error rows converted to ui/modal and the refusal exemption narrowed, or an explicit controller ruling accepting both soft paths; (6) RV-7 recorded as a product finding; (7) run5 = ONE full pass (13 chunks × owner/manager/nok/thana + customer) on the final tip with the final frozen runner/registry, passed === total, 0 restore/cleanup failures, and outbox settled before every restore)

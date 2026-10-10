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

---

# Re-review after run5 (it6)

Reviewer: independent (did not build this; not the it4/it5/it6 lane). Written 2026-10-02 19:5x UTC. Worktree `shark-crm-c42b` @ `b5bd4f3b`.
Read-only on runner/registry/product: I did not run the button runner, did not touch :3215, did not write to QC1, did not edit
`scripts/`, `next/` or `next-it6/`, and read no `.env*` file. Product code was read from `/root/projects/shark-crm` (session/crm HEAD
`1aa0afc0`). Its `src` is byte-identical to `c1522f6e`, the run5 build source (`git diff c1522f6e session/crm -- src` is empty).
Evidence used:
- `/tmp/c42b-logs/run5*` (65 summaries, the verdict, counts, logs) and the run5 fail shots
- the :3215 server log (`/root/projects/shark-crm/.qc-shots/acc-v2/server.log`). It is still the stdout and stderr of the run5
  process: pid 3062765, started 13:56:59, and `/proc/3062765/fd/1` points at this file.
- read-only QC1 queries (`bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx …`, one at a time)

Helper scripts, all read-only, are in `scripts/pending/c42b/review/`:

| script | what it does |
|---|---|
| `safety-window.mts` | external side effects in the run5 window: webhooks, outbox, member notifications, push devices, mail providers |
| `email-sent-history.mts` | every `crm.email.sent` event, grouped by hour |
| `member-notif-orphans.mts` | prints `emailEnabled` and the orphan member notifications |
| `window-leftovers.mts` | every tenant model with rows created in the window that still exist |
| `leftover-detail.mts` | details of those leftover rows |
| `needs-probe.mts` | checks whether a few `needs` preconditions really hold |
| `run5-coverage.py` | which items were never pressed (output: `never-pressed-run5.csv`) |
| `dbcheck-strength.py` | how strong each DB-effect check is |
| `f14.py` | copy of the previous reviewer's F14 checker |

## R0. The run5 numbers. CONFIRMED
I recomputed everything from the 65 summaries:
- **wrongExpect: 24** = W1 4 + W2 8 + W3 8 + W4 2 + W5 2.
- **outboxUnsettled: 6 summary lines** (owner/manager `/emails/[threadKey]` d+m, 1 event each; nok `/contacts/new` d+m, 4 events each).
- **VACUOUS: 250 items in 55 rows.** The 53 predicted rows all occurred. The 2 new rows are `object-archive-confirm-key` and `object-archive-reason`.
- **dead 0 · hiddenLeak 0 · disabled 0 · fatal 0 · restore/cleanup/verify 0.**
- There is no presence record with `h && f`.
- Customer lock-out: 94 of 94 presses were refused (47 pages × 2 viewports, each redirected to `/login`, no registry testid visible).

The triage CSV classes add up (RUNNER 6+4, REGISTRY 8, FIXTURE 8, PRODUCT 2+2).

## R1. Safety: external side effects (question 2). Nothing reached a person or left the machine except DNS lookups
- **The 4 composer sends used the dev transport, and nothing else was possible.**
  - The server log has exactly 4 `[email:dev] rich · to 1 ผู้รับ · subject: qc-btn template วรรณา` lines. There are no others, and
    there are none after 16:18. The nok, thana and customer roles cannot send.
  - That log line is printed only in the branch `if (!deps?.fetch && !emailEnabled)` (`src/lib/core/email.ts:129`). `emailEnabled`
    is a module-load constant (`env.RESEND_API_KEY.length > 0`). So the run5 server had no Resend key.
  - A process that loads the QC env file the runner and oracles use also prints `emailEnabled=false` (`member-notif-orphans.mts`).
  - The tenant has 0 `CrmMailProvider` rows (no Gmail/Outlook sending) and 0 `EmailDomain` rows.
- **Was the guard supposed to prevent this?** Yes.
  - The runner contract says DIRECT_SEND_GUARD rows are "never pressed". But the guard works per testid. The `form` row
    `crm-email-composer` is `requestSubmit()`-ed with PREFILL (qc-crm-buttons.mts:2028, 2114-2116), and that is the same
    `sendCrmEmailAction` as the guarded button.
  - The previous review missed this. RV-4 accepted "real e-mail sends skipped" and never checked sibling form rows. it5 then kept
    the composer as a "still soft" row.
  - It also happened before. The append-only `crm.email.sent` history shows 5 events on 1 Oct 11–14 UTC, during run3 (11:42–17:44).
    run3 most likely submitted the composer too. run4 shows none.
- **Webhooks.**
  - The seed has no endpoint, and 0 `WebhookDelivery` rows exist for the tenant.
  - The runner's own endpoint is `https://qc-btn-<rand>.example.com` (`fillValueFor`, qc-crm-buttons.mts:1529). `getent hosts`
    says that name is NXDOMAIN, so any delivery attempt ends at DNS.
  - Deliveries to that endpoint would have been cascade-deleted by the restore, so this point rests on DNS, not on rows.
- **Push.** 0 `PushDevice` rows for the personas and 0 `MemberPushDevice` rows for the tenant.
- **LINE.** All 8 run5 member LINE notifications are `SKIPPED`. CRM staff notifications have only IN_APP/PUSH/EMAIL channels
  (`crm/notifications.ts:245`).
- **Member e-mail.** 8 `WELCOME` notifications are still `QUEUED`. Their customers were deleted by the restore and e-mail is disabled,
  so they cannot be delivered. They are leftovers (see RVR-2).
- **AI.** `ai=mock`, but the mock still writes 72 `AiCreditTxn` USAGE rows (−565,050 µ-credits from the QC tenant wallet; no money).
- **Storage.**
  - No upload was possible: file inputs other than the 4 CSV imports go to `skippedSafety` (qc-crm-buttons.mts:2129).
  - The pressed deletes (`crm-call-recording-delete-go`, `crm-files-remove-confirm`) point at FileAsset ids that do not exist, so
    `deleteFileAsset` returns before any storage call (storage/service.ts:490).
  - The only storage contact is a GET for the play fixture's fake asset (the 8 console 404s). This only applies if storage is configured.
- **Exports.** Report exports are stored in the DB (`reports.ts:1007`). The tenant export is queued for a cron that QC does not run,
  and the jobs were restored. DBD/Beam/Vercel cannot be reached from any CRM control.
- **Conclusion: no e-mail, push, LINE, webhook delivery, payment or storage write left the machine.** The only network traffic I can
  attribute is DNS lookups of `*.example.com` names and possibly a storage GET. The protection was the QC env, not the runner (RVR-1).

## R2. Was the triage honest? (question 1) Yes, with two class upgrades
- **W1 `crm-score-bands-save`: RUNNER, correct.**
  - The shot shows hot=warm=decay=5. The page shows a red line at the top: "คะแนน "ร้อน" ต้องมากกว่าคะแนน "อุ่น" — ปรับตัวเลขให้ไล่ระดับกัน".
  - This is a correct refusal, and the user is told. The only product issue is that the line is not `role=alert` (O-it6-b, a11y LOW).
- **W2 `deal-bulk-move`: REGISTRY for the test failure, and a real PRODUCT defect.**
  - Every shot shows "ย้ายขั้นสำเร็จ 1 ดีล" ("moved 1 deal successfully") while the ticked deal was already in "ผู้สนใจใหม่".
  - `bulkMove` (deals.ts:1640-1648) does `res.ok += 1` after `moveCore` whether or not it changed anything. It then audits `ok: 1`.
  - The UI therefore tells the user a move happened when none did. That is a truthfulness bug, so I upgrade O-it6-a to a product
    finding (RVR-5).
  - It also proves that an audit-only DB check cannot detect a no-op (RVR-4).
- **W3 object import: FIXTURE, correct.** The UI told the user exactly what happened, in the import panel: "นำเข้าสัญญาแล้ว 0 รายการ ·
  ข้าม 1 แถว · แถว 2: ไม่พบบริษัทที่เลือกในระบบ CRM นี้ — เลือกใหม่จากรายการ". The product is correct. The wording "เลือกใหม่จากรายการ"
  ("pick again from the list") is odd for a CSV import (cosmetic).
- **W4 attach-to-contact: PRODUCT P-it6-1, confirmed in code.**
  - The page offers the block when `canAttach: !contactId` (emails/[threadKey]/page.tsx:85).
  - `attachToContact` (emails.ts:3035) calls `assertUnmatchedGate` (:2826), which refuses a unit-scoped manager.
  - The manager reads the thread legitimately: `getThread` lets company-linked rows through by company visibility (:2975-2985). The
    defect is only the offer followed by a refusal.
  - No data leaks: the search lists only `contactWhere` contacts. Severity LOW–MED (UX, §15(b)).
- **W5 webhook delete: RUNNER, correct.**
  - The endpoint was deleted. The shot shows 1 endpoint left; the form and submit rows had created 2.
  - The UI feedback for the delete is the generic `"บันทึกแล้ว"` ("saved", `CrmApiSettings.tsx:162-167`). The delete button (:426)
    has no confirmation. This is a small product UX finding (RVR-6).
- **outbox: the split is right.**
  - The 4 composer events are a RUNNER defect (the composer should never have sent; RVR-1). Their 76–269 s wait is also further
    evidence for P-it6-2.
  - nok `/contacts/new` is P-it6-2: the coalescing flag in `core/after-drain.ts:20-37` is as the triage describes. MED, PROD-exposed.
- **No item classed REGISTRY, RUNNER or FIXTURE hides a permission or data defect.**
- **Inaccuracies in it6 §4/§5:**
  - "AuditLog checksum equal (restored)" is wrong. AuditLog is not in `counts.mts`, and 1,218 run5 audit rows remain (that part is by design).
  - "Only OutboxEvent differs" is true only for the 66 counted tables (RVR-2).
  - The run3 composer sends are not mentioned.

## R3. Are dead 0 and hiddenLeak 0 real? (question 3)
- **hiddenLeak 0 is real for what the runner can observe.**
  - 3,582 hidden-absent items in total. 3,332 are paired with a role that found the same control. 2,754 (77 %) are on pages that
    answered ≥ 400 for the hidden role (page-level key gate). Only 828 are control-level absences on a rendered page.
  - I sampled 17 permission-critical rows, for example:
    - the unmatched tab
    - deal reopen and delete
    - contact archive and erase
    - API hook new
    - commission approve, unowned reassign, portal invite and request approve
    - bulk reassign, merge submit, seq-enr stop, visibility, team archive
  - Every one is hidden-absent for the non-entitled roles and found by the entitled roles on the same page and viewport.
  - **Weakness (RVR-7):** hidden rows are looked for with shorter waits than visible rows. The opener wait is 1,500 ms and the final
    check is 800 ms (qc-crm-buttons.mts:1846, 1874); visible rows get 2,500–4,000 ms. So a control that renders late would be found
    by the owner (paired) and missed by nok, and its leak would score as a pass. I found no instance of this.
- **dead 0: no regression is masked as `needs`.**
  - run5 never pressed 118 items: 104 skipped as `needs`, 14 safety-guarded.
  - Compared with run3∧run4 (166 items), only 2 are new, and the it6 fixture note explains both. 50 items that were never pressed
    before are now pressed.
- **But `needs` is still self-declared (RV-8 asked for a checked precondition). I found false preconditions (RVR-3):**
  - `deals-next-page` / `deals-first-page`: "seed has 60, owner/manager reach it". The B2B pipeline does have 55 deals (`needs-probe.mts`).
    But the rows have no `query: view=table`, so they are searched for on the board view, where they never render (deals/page.tsx:387-392).
    They have never been pressed in any run.
  - `crm-import-to-duplicates`: its opener chain re-imports the same CSV, which creates a duplicate. The shot shows "ข้าม 1". Choosing
    the "candidate" duplicate mode in the chain would make the control appear.
- **Preconditions I confirmed are true:** 0 kanban boards (`activity-row-card*`), 0 required-field stages (`deal-req-*`), board column
  limit 60 > seed column sizes (`deal-column-more-*`), 0 score rules / logs (`contact-score-explain-btn`).
- **Sampled buckets (15 items):**
  - wrongExpect ×5: W1–W5, shots read.
  - needs ×6: `deals-next-page` (false, see above), `crm-import-to-duplicates` (fixable), `crm-home-stage-all` manager (true: the
    manager owns 0 deals, shot shows the home page), and `deal-column-more-*`, `activity-row-card`, `deal-req-field-*` (true, by DB probe).
  - safety ×2:
    - `crm-email-send` is legitimate.
    - `crm-home-ai-draft` / `-summary` are disabled by design. They should be asserted with `state: disabled`, not skipped.
  - postChecked ×2: `contact-privacy-erase-submit` (manager and owner, d+m) and `crm-home-unowned-submit`.
- **DB-effect strength (sample of 10 plus the full table in `dbcheck-strength.py`):**
  - There are 146 distinct dbVerified rows. Their strongest check:

    | check type | rows | fails on a no-op? |
    |---|---|---|
    | COUNT (±1 count before/after) | 8 | yes |
    | EQ (literal column on the detail entity) | 9 | yes |
    | DELETE (tenant count dropped) | 7 | yes |
    | AUDIT (an AuditLog action since the press) | 50 | only if the service audits real changes only. `crm.deal.bulk_move` does not (W2). |
    | ANYROW, AppSystem settings-JSON compare | 19 | yes |
    | ANYROW, "some row of the model in the tenant has updatedAt or createdAt ≥ press" | 53 | not reliably. A same-value Prisma update still bumps `updatedAt`, and a concurrent write to another row satisfies it. In this serialised run it caught W2 and W5, so it does fail on true no-ops when nothing else writes that model. |

  - Example: the `crm-import-submit` dbVerified press really wrote. The group's restore log shows "ลบแถวใหม่ 6" (6 new rows deleted).

## R4. VACUOUS: 55 rows (question 4)
- **Ruling 1: 41 rows are already demonstrated by the page refusal.** Recommend changing `verdict.py` to pair these.
  - Every hidden role got HTTP ≥ 400 on the page, and the runner's VACUITY GUARD counted 0. So every row of that group is hidden for
    that role, which is the key gate itself. This is the same rule as the runner's `lockedOut` and the customer lock-out pairing.
  - **WAIVE (hiding proven at page level).** The functional gap for the visible role is handled under R5.
  - The 41 rows, with the hidden roles that got ≥ 400:
    - `team-restore` (m, n, t)
    - companies: `-page-next/-prev`
    - company 360: `company-doc/-merged/-outstanding/-parent/-subsidiary-*`
    - companies/new: `company-new-field-*` ×4 and `company-new-restore-*` ×3
    - `crm-import-to-duplicates`
    - e-mail: `crm-email-attachment`, `crm-email-show-images`
    - objects: `object-page-next/-prev`, `object-record-*` ×5, `object-view-delete`
    - settings: `crm-export-download`, `crm-settings-team-room*` ×5 (m, n, t), `crm-assign-sim-field*` ×2, `crm-email-domain-refresh`
    - `/settings/objects` ×4 (m, n, t), `pl-restore-*` (m, n, t), `settings-stages-create-link` (m, n, t)
  - 5 of these also get an it6 fixture: `objects-archived-toggle`, `object-restore-btn`, `object-archive-confirm-key/-reason`, `pl-restore-*`.
- **Ruling 2: 14 rows are control-level absences on pages that rendered 200.**

  | row | hidden roles | ruling |
  |---|---|---|
  | `activity-row-company-link` | nok, thana | it6 fixture. Must pair in the re-run. |
  | `crm-ai-proposal-deal-*`, `crm-ai-proposal-next-step-input` | nok, thana | WAIVE. Shown transitively: their openers `crm-ai-home-at-risk` and `crm-ai-proposal-edit` are hidden-absent for nok/thana and paired (found by owner/manager). |
  | `crm-merge-choice` | nok, thana | WAIVE. Its opener `contact-menu-merge` is paired hidden. |
  | `pos-deal-select` | nok, thana | WAIVE. `qc-crm-c2.7.mts` S5.4/S9.8 assert that the deal list is empty for an actor without `crm.deal.update` / `crm.deal.read`, and the select renders only when the list is non-empty (register-ui.tsx:713). The guard reason "needs a real POS sale" is inaccurate: choosing a deal writes nothing until the sale is paid. Recommend un-guarding it later with opener `pos-member-select=<member with an open deal>`. |
  | `crm-panel-deal` | nok, thana | ACCEPTABLE GAP (LOW). The list comes from `briefFor`, which filters by `dealWhere` (brief.ts:56), the same visibility used everywhere. Cheap fixture: an open deal on the N9 chat contact. |
  | `crm-panel-retry` | nok, thana | ACCEPTABLE GAP. Error-state button, no data. |
  | `crm-object-tab-obj-*` | nok, thana | ACCEPTABLE GAP (LOW). `tabsFor` returns zero records without `crm.record.read`, so only the object label could show. |
  | `crm-home-stale-banner` | nok, thana | ACCEPTABLE GAP (LOW, count banner). Cheap fixture: a stale owner deal. |
  | `crm-hub-switch-link` | m, n, t | ACCEPTABLE GAP. v1 hub surface (ruling D4). |
  | `deals-empty-create-pipeline`, `deal-new-create-pipeline` | m, n, t | ACCEPTABLE GAP. Shown only to a shop with no pipeline. Their destination `/settings/pipelines` answers ≥ 400 for m, n, t (paired). |
  | `objects-index-settings-link` | manager | ACCEPTABLE GAP. Same reason: the destination is gated and paired. |
  | `member-view-team` | thana (nok got 404) | ACCEPTABLE GAP. Member module surface. |

- **None of the 49 non-fixture rows needs a fixture before acceptance.** The permission-relevant ones are shown at page level (36),
  shown transitively (3) or covered by a service oracle (1). The rest are links or banners whose destination or data is gated elsewhere.

## R5. Rulings on the earlier open lists (question 5)
- **it5 never-pressed waivers (13 groups): ACCEPT 11 as written.** The 4 groups the it5 notes said had no UI-level check:
  - **POS sale↔deal: ACCEPT.** The service plus the S5.4 render check cover it. See the guard note in R4.
  - **deal → quotation/invoice numbering: ACCEPT.** US3-1 and US7-2 press these buttons in the UI. Gapless numbering belongs to the
    account-module suites, not to C4.2.
  - **Paging past 50: SPLIT.**
    - `/deals`: REQUIRE. The precondition is true (55 deals). Add `query: "view=table"` to `deals-next-page` / `deals-first-page` and
      include them in the re-run.
    - `/companies` (20) and `/objects/[key]` (12): ACCEPT, with C1.10-X6.2. Residual risk: the UI cursor link is not pressed.
  - **MEETING team-room settings save: ACCEPTABLE GAP.** It is owner-only, and the page-level gate is demonstrated for m, n, t.
    No suite saves it successfully. Register it as C6 test debt (a seed with a MEETING system).
- **The 37 "no-error only" mutation rows:**
  - **ACCEPT 14:**
    - the 6 that are never pressed (moot)
    - the 7 call-form fields, which are deferred to `crm-call-save` (that row checks `AuditLog crm.activity.log`)
    - `crm-forms-refresh-*`, which writes nothing by design
  - **REQUIRE before acceptance (4 rows).** These grant or revoke access, so they must have a check that fails on a no-op:
    - `crm-api-key-form`: `ApiKey +1`
    - `crm-api-key-revoke-*`: a POST_CHECK that `revokedAt` is set on the pressed key
    - `team-member-add-form` / `-submit`: `TeamMember +1`

    `/settings/api` is already in the re-run; add `/app/settings/teams`.
  - **ACCEPT as C4.2-fix debt (19 rows):**
    - pipelines, stages and lost-reason renames, sort and archive (`pl-*`, `st-*`, `lr-*`)
    - activity-row pin, complete and reschedule
    - `team-member-accepting-leads`
    - `company-contact-role-select`
    - holidays and tracking (`crm-seq-holiday-import/-remove-*`, `crm-track-*`)

    For holidays and tracking, the cheap fix is to rewrite the db text as `AppSystem.settings.crm.…`, which turns on the existing
    settings-JSON comparison.
- **`contact-phone-tel`: ACCEPT** as untestable with the seeded personas. It is a plain `tel:` link with no write, shown only to a
  viewer without `crm.activity.create`, and the phone number is already visible to that viewer. C6 test debt: add a view-only staff persona.
- **New list: 104 `needs` items never pressed and not covered by any ruling** (`review/never-pressed-run5.csv`).
  - REQUIRE `deals-*-page` (above).
  - RECOMMEND cheap fixtures, but not blocking:
    - a required-field stage (`deal-req-*`, a core move dialog never pressed in any run)
    - CRM custom fields (`contact-new-f-*`, `company-new-field-*`, `deals-filter-f-*`, `crm-assign-sim-field*`)
    - `crm-import-to-duplicates` (opener value)
    - a kanban board (`activity-row-card*`)
  - ACCEPT the rest as seed or AI-data gaps, listed in C6.

## R6. The proposed corrections in `next-it6/` (question 6)
- **Nothing in them weakens a failing check into a soft one.**
  - `ลบแล้ว` in the delete regex: after the W5 edit, no registry row uses that text. It is inert.
  - `=#N`: only adds an opener form.
  - The W1 and W3 openers fix the input data, not the expectation.
  - W5 now uses DELETE plus AUDIT, which is stronger than before.
  - The `hiddenFor: manager` edit on `crm-email-attach-contact-q/-go/-pick` turns the refusal into an assertion that the block is
    hidden. It does not mask anything: run4 and run5 would report it as hiddenLeak.
- **Minor weakening or fragility (RVR-10):**
  - `object-edit-key` now only asserts `disabled` on the seed object. The enabled path (renaming the key of an empty object) is no
    longer pressed. Recommend a variant row on a last-listed empty-object fixture.
  - `deal-bulk-stage=#2` depends on the first ticked deal being in stage 1. A target ≠ the deal's current stage would be robust.
  - The new company-only overdue task (−45 d, owner=manager) exists for the whole pass whenever `/activities` is selected. It can
    change what CRM home, `/calendar` and company 360 show first. Those pages must be in the re-run.
  - The file fixture `qc-btn-object-import.csv` is still `title,parentId` without the required `เลขที่สัญญา`. The paste box was
    fixed; the file path would import 0.
- **The composer guard is right but not enough.** Required, as part of RVR-1:
  - a structural guard that refuses a press when the element's enclosing `<form>` contains a guarded control, or when the row's
    `expect.target` equals a guarded row's target
  - a pass-level tripwire that fails the pass if any `crm.email.sent` OutboxEvent or `[email:dev]` / `[email]` server-log line
    appears in the window
- **What the registry should assert after fix15.**
  - If fix15 **hides** the block from viewers who fail the unmatched gate, the it6 edit is right:
    - `-q/-go/-pick` hidden for manager, nok and thana
    - owner keeps the rows and is the positive pairing
    - the manager's other rows on `/emails/[threadKey]` (thread readable via company visibility) stay visible, which proves the page still renders
  - If fix15 instead shows the block **disabled, with the reason up front**, use different rows:
    - `crm-email-attach-contact-q`: a manager variant with `state: disabled`
    - a new manager row asserting the reason text appears
    - `-go/-pick`: hidden for manager
  - Either way, remove `needs` from `-pick` for the owner. Otherwise an owner-side regression would be skipped silently.

## R7. Is a targeted re-run acceptable? (question 7) Yes, with this scope
Preconditions:
- The fix15 merge tip is built on :3215 (`BUILD-STATE READY … ai=mock`).
- `next-it6` plus the required edits (R5, R6, RVR-1, RVR-3) is promoted to `scripts/` and `next/` and md5-frozen.
- `verdict.py` gets the page-level pairing rule (R4).
- The orphan cleanup in RVR-2 is done, or a ruling is written for it.

Run all four staff roles on both viewports for these pages:
- **A. run5 failures and fixtures:**
  - `/settings/scoring` · `/deals` · `/objects/[key]` · `/emails/[threadKey]`
  - `/settings/api` · `/contacts/new`
  - `/settings/objects` · `/settings/pipelines` · `/activities`
- **B. fix15 surfaces:**
  - every page that renders `CrmFilesBlock`: `/contacts/[contactId]` · `/companies/[companyId]` · `/deals/[dealId]` · `/objects/[key]/[recordId]`
  - `/emails` (the gate predicate shared with the unmatched tab)
- **C. shared `after-drain` (every module's wake path) and the it6 fixture interplay:**
  - CRM home `/app/sys/[id]`, including the chat CRM panel and POS rows hosted there
  - `/calendar`
  - `/app/settings/teams` (`team.updated` wake, plus the team-member rows)
- **D. customer:** lock-out of every staff page in A–C, the portal pages `/b/[slug]/*`, and `/u/[token]`.
- **E. regression sample:** 5 more page groups drawn at random from the remaining run5 pages, with the seed and the draw recorded
  before the run. Same 4 roles × 2 viewports.

That is about 22 of the 65 page groups. **If anything outside A–D fails in E, or if fix15's diff touches files beyond `core/after-drain.ts`,
`CrmFilesBlock` / `files.ts` and the e-mail thread page, require a second full pass instead.**

Evidence I need to move from "ACCEPT AFTER RUN5" to ACCEPT:
1. `verdict.py` over the re-run: passed == pressed, and 0 for dead, wrongExpect, hiddenLeak, disabled, outboxUnsettled, restore,
   cleanup, verify and fatal. VACUOUS may contain only the rows ruled in R4. The 5 fixture rows plus `activity-row-company-link` must pair.
2. The attach rows are absent for manager (hiddenLeak 0), and owner pairs them.
3. Composer, `crm-email-send` and the other DIRECT_SEND rows land in `skippedSafety`. In the run window: 0 `crm.email.sent` events,
   and 0 `[email` lines and 0 `⨯` lines in the :3215 server log. This also covers the error-boundary blind spot in RVR-8.
4. Restore proof: `counts.mts` content checksums are equal before and after, **and** `review/window-leftovers.mts` over the window
   shows only OutboxEvent, AuditLog, AiCreditTxn and AppNotification (or whatever the RVR-2 ruling allows).
5. fix15's own P-it6-2 oracle (create a contact, the events reach DONE within 5 s) is green, and `/contacts/new` settles for all 4 roles.
6. A combined verdict table: run5 items of the untouched pages plus the re-run items, with W2 `=#2` shown passing on all 4 roles and both viewports.

## R8. Registry completeness on the final tree (question 8). Complete
- My F14 checker, `f14.py` (a copy of the previous reviewer's, same regexes as `scripts/lib/crm-testid-scan.mts`):
  - against session/crm HEAD (`src` = `c1522f6e`, the run5 tree): **1066 interactive / 0 unregistered / 0 ghosts**, for both
    `next/` (bc9278bc) and `next-it6/` (3f2ba5b8)
  - positive control: the same check at `46f952cc` flags exactly the 3 `company-lifecycle-correct*` rows as ghosts
  - the committed `scripts/crm-ui-inventory.json` at HEAD shows 3 unregistered rows. The merge must take `next-it6`, as before.
- **No interactive element was added or removed by fix8 / fix10 / fix12 / fix13 / fix14 / G2 / G3.**
  - `git diff bbe2072f c1522f6e -- src` (89 files) has no added or removed line with `data-testid`, `<button`, `<a `, `<Link`,
    `<input`, `<select`, `<form`, `<textarea` or `onClick`.
  - Those cards changed text and conditions only: the card-scan error text, the member badge, consent-block gating, and the
    `/u` done page `<meta viewport>` (that last one closes P-it5-3).
  - run5 ran on that tree, and none of those rows went dead.

## Findings (RVR)
- **RVR-1 HIGH (safety / process): the send guard was bypassed by a sibling form row.**
  - The composer `form` row submitted `sendCrmEmailAction`: 4 times in run5, and about 5 times in run3 (`crm.email.sent` history, 1 Oct 11–14 UTC).
  - All went through the dev transport. `emailEnabled=false` in the server process and in the QC env, which I proved, so nothing was delivered.
  - The only protection was the env. Close with the it6 guard **plus** a structural form/target guard **plus** a pass tripwire (R6).
- **RVR-2 MED: the restore proof cannot see writes outside its 66 tables.**
  - run5 left:
    - 32 `AccountContact` rows: accounting customers with a dangling `partyId`; 82 `qc-btn` rows exist all-time
    - 24 `MemberNotification` rows: 8 `QUEUED` welcome e-mails to deleted customers
    - 16 `MemberAttribution` and 8 `MemberTierHistory` rows: their customers are gone
    - 72 `AiCreditTxn` rows (wallet debit under mock)
    - 11 `AppNotification` rows
    - 1,218 `AuditLog` rows (by design)
  - Close: list and delete the runner-caused orphans under the lock (or get a ruling). Add `window-leftovers.mts` to the re-run proof.
    Optionally, CLEAN deletes AccountContact rows by runner `partyId`.
- **RVR-3 MED: `needs` is still self-declared, and some preconditions are false.**
  - `deals-next-page` / `-first-page` are mis-specified (missing `view=table`; the precondition holds).
  - `crm-import-to-duplicates` can be reached with the existing fixture.
  - 104 never-pressed `needs` items have no ruling.
  - Close: R5 (deals paging REQUIRED, the rest ruled or recommended).
- **RVR-4 MED (method): 103 of 146 dbVerified rows rest on AUDIT or tenant-wide ANYROW checks.** W2 proves that an audit can be
  written on a no-op. Not blocking. C4.2-fix: entity-scoped column checks on detail pages, and an audit clause paired with a row clause.
- **RVR-5 LOW (product, for C6 as a new P-it6-3): deal bulk move reports and audits no-op moves as "moved"** (deals.ts:1641-1648, UI
  "ย้ายขั้นสำเร็จ 1 ดีล"). This was O-it6-a; it is a defect, not an observation.
- **RVR-6 LOW (product UX, for C6): deleting a CRM webhook endpoint is one click with no confirmation**, and the feedback says "บันทึกแล้ว"
  ("saved") (CrmApiSettings.tsx:162-167, 426).
- **RVR-7 LOW–MED (runner): hidden rows are checked with shorter waits than visible rows** (800 / 1,500 ms vs 2,500–4,000 ms). A
  late-rendering leak could pass while still being paired. Use the same wait. Not observed.
- **RVR-8 LOW (runner): the runner cannot see an error boundary on a 200 page.** A server-component error inside a 200 page
  (O-it6-d: 4× `ActivitiesError NOT_FOUND` in `CrmFilesBlock`) goes unnoticed. Add a per-row server-log `⨯` tripwire, or use the R7
  evidence item 3.
- **RVR-9 LOW: `verdict.py` over-counts VACUOUS.** It counts page-level key gates as unpaired (41 of 55 rows). Pair on page refusal (R4).
- **RVR-10 LOW: it6 copy details.** object-edit-key enabled path, the `=#2` fragility, the overdue-task fixture interplay, the object
  import file fixture, and `crm-home-ai-*` should be asserted `state: disabled` rather than safety-skipped (R6).
- **RVR-11 LOW: notes inaccuracies.** The AuditLog statement, the "only OutboxEvent" scope, and the run3 composer sends not mentioned (R2).
- **Confirmed as triaged:** P-it6-1 (LOW–MED), P-it6-2 (MED, PROD-exposed), O-it6-b (a11y LOW), O-it6-d (fix15).

## What I did not verify
- The P-it6-2 mechanism: it is read from code only, like the lane's.
- Whether the run3 `crm.email.sent` events all came from the runner. They are attributed by time window only, and Sep 30 events
  belong to other suites or run2.
- Storage configuration in the server env: no env read. That is why the storage GET is stated as conditional.
- Whether an oracle asserts `briefFor`'s deal filter for the chat panel: I checked the code only (brief.ts:56).
- `pos-deal-select` hiding is covered by C2.7 S5.4/S9.8 as described in that file's header; I did not run it.
- The DOM state behind hidden-pass rows: the runner keeps no DOM dumps for passes. Pairing and the product gates were checked instead.
- The fix15 diff: not merged yet, so I could not read it.
- dbg15–18 results beyond their summary JSONs and shots.
- Whether QC1 field values outside the 66 counted tables and the leftovers listed in RVR-2 match the pre-run state.

VERDICT: **ACCEPT AFTER TARGETED RE-RUN.**
- Re-run scope and evidence: R7.
- Required before the re-run: RVR-1 structural guard and tripwire; RVR-2 cleanup or ruling, plus the window-leftovers proof; RVR-3
  deals paging fix; R5 access-control DB clauses (`crm-api-key-form/-revoke-*`, `team-member-add-*`); RVR-9 `verdict.py` page-level pairing.
- Rulings: R4 (VACUOUS), R5 (waivers, no-error-only, `contact-phone-tel`, the needs list).
- A second full pass is required instead if anything outside A–D fails in the sample, or if fix15 touches more than the files listed in R7.

---

# it7 check (before promotion of next-it7 and run6)

Reviewer: same independent reviewer. Written 2026-10-02 20:5x UTC. c42b @ `6c344b86`.

I read all of these (md5 checked, matching the lane's list):

| file | md5 |
|---|---|
| `next-it7/qc-crm-buttons.mts` | 71120e8e |
| `next-it7/crm-ui-inventory.json` | f102f258 |
| `next-it7/verdict.py` | 845b230d |
| `next-it7/counts.mts` | 57f32c6d |
| `next-it7/tripwire.mts` | b2c63d0a |
| `next-it7/waivers-it7.json` | f09fbbeb |
| `run6.sh` | 255e1177 |
| `cleanup-it7-leftovers.mts` | 37320143 |

I also read:
- `runner-it7.diff`. It is byte-identical to `diff -u next-it6 next-it7`.
- the fix15 diff: c54d `56b0a278` vs `c1522f6e`, 10 src files.

Frozen state is untouched: `scripts/` and `next/` are still 7ecf3092 / bc9278bc. I wrote nothing to QC1 and ran no runner.

Three new read-only checks:
- `tripwire.mts` over the run5 window (positive control)
- `review/cleanup-b-provenance.mts`
- `review/structural-guard-reach.py` (static scan of the fix15 source)

## 1. The conditions, one by one
**RVR-1 (send guard): SATISFIED.**
- **Structural guard is real.**
  - `structuralGuard(el)` takes `closest("form")` of the element (or the element itself if it is a form) and refuses the press if
    the form holds any DIRECT_SEND or CROSS_MODULE testid.
  - It runs for every pressed row: after `reveal`, after the testid guard, and before PREFILL and any act. It also runs for every
    opener step that clicks (`plain`, `=click`, `=on`, `=off`), returning `SAFETY-OPENER` → skippedSafety.
  - It fails closed: if the DOM check throws, the press is refused.
  - **Static scan of the fix15 source: the only `<form>` that holds a guarded control is `EmailComposer.tsx:135`.** None of the other
    guarded inputs sits in a `<form>`: call-log modal, files panel, card scan, commission settings, Deal 360, e-mail settings, portal login, portal invoices.
  - Effect: the guard refuses exactly the composer and its 7 field rows (dbg20/21 🛡️ lines). It costs no other coverage.
- **Same-action guard.** `GUARDED_ACTION_TARGETS` holds the `action:` / `op:` / `/pay/` targets of the action-effect rows. `guardOf`
  is applied to rows and variants.
- **Other ways a guarded control could still be reached: none found.**
  - Keyboard Enter: `fillEl` never sends Enter. The only multi-line value, the CSV box, is set through the native setter.
  - Value openers (`=*` and literals) only type or select. They cannot submit, and in the composer the fields are refused anyway.
  - `needsHolds` only does `findVisible` plus a DB count. It never clicks.
  - Hidden rows are never pressed.
  - PREFILL only fills fields outside guarded forms, and never ticks `crm-portal-invite-email`.
  - `crm-portal-invite-submit` re-checks that the e-mail box is OFF before every press.
- **External rows.** `portal-line-login` and `crm-email-domain-refresh` are the only additional ones I can find among pressable rows.
  I checked every outbound `fetch` in `src/lib` against the registry: Resend, Expo push, LINE, Bunny, Vercel domains, Beam, DBD,
  OpenRouter, Turnstile, Ably. Everything else is safe only because of the environment, and the pre-flight or tripwire watches each:
  - AI rows: mock
  - commission approve: `payrollLink` checked in pre-flight
  - sequences and scheduled reports: QC runs no cron
  - staff and member notifications: no devices / SKIPPED
- **One latent row: `crm-email-show-images`.** It would make the browser fetch remote images from a mail. It is a needs row, never
  pressed. If a fixture with remote images is ever added, guard it.
- **Pre-flight is sensible.**
  - It refuses on: active webhooks, enabled rules with a LINE/push/SMS/webhook/e-mail action, EmailDomain, CrmMailProvider, persona
    or member push devices, `payrollLink`, or non-mock AI.
  - It runs after `createThrowaways`, which writes rows directly with no outbox. CLEAN removed them on the dbg19 refusal (log: "ลบ extra fixtures …", fixtures deleted).
- **Tripwire truly fails the pass.**
  - Per invocation, the `tripwire[]` and `pageErrors[]` lists are hard failures in the runner's exit summary and in `verdict.py`.
  - Pass level, `tripwire.mts`, exit 1. **I reproduced the positive control myself:** over the run5 window with log offset 0 it prints
    `TRIPWIRE FAIL — OutboxEvent crm.email.sent: 4 · server log lines: 8` (exit 1). dbg21's window is CLEAN.
- **Recommended, not blocking: assert `emailEnabled === false` in the pre-flight.**
  - Why: the tripwire's log part sees dev-transport sends only. With a real Resend key, a successful send logs nothing, and only
    `crm.email.sent`, SENT member notifications and e-mailed AppNotifications would show it.
  - How: import `@/lib/env` under the QC env and print a boolean only, as my `review/member-notif-orphans.mts` does.

**RVR-2 (restore blind spot): SATISFIED.**
- The 9 tables are in `SNAP_MODELS`, so they are restored and verified, and they are in `counts.mts` with checksums. AuditLog is counted only.
- `window-leftovers` runs inside `run6.sh`.
- Residual risk, same class as RV-9: restoring MemberNotification, AppNotification and the AI tables could delete another lane's
  rows written during a chunk. The QC1 lock mitigates this, and the tenant is shared with the member suites.

**RVR-3 (`needs`): SATISFIED for what was required.**
- Deals paging now has `view=table` plus a probe (owner only).
- `crm-import-to-duplicates` is now reachable.
- A probe that holds with the control missing now counts as dead, not skippedNeeds.
- The 104 rulings are carried into `skippedNeeds[].waiver`.

**R5 (access-control DB checks): SATISFIED.**
- `ApiKey +1` and `TeamMember +1` are parsed as count clauses. The revoke row has a POST_CHECK.
- The negative control is convincing: with `QC_BTN_FORCE_NOOP` all four rows fail (dbg20 `api-owner-noop` / `teams-owner-noop`).

**RVR-4 (weak DB-effect checks): not addressed, as agreed** (C4.2-fix debt).

**RVR-5 / RVR-6: fixed in product by fix15.**
- Bulk move counts `unchanged` separately, and on a pure no-op says "ไม่มีดีลที่ต้องย้าย" and writes no audit.
- The registry asserts `resultText "ย้ายขั้นสำเร็จ [1-9]"` plus a CrmDealStageHistory row since the press. A real move passes; a no-op
  fails on both builds.
- Webhook delete now says "ลบปลายทางแล้ว". It still has **no confirmation**, which stays a LOW product item for C6.

**RVR-7 (hidden-row waits): SATISFIED.** Hidden rows on rendered pages use the visible waits.

**RVR-8 (error boundary): SATISFIED.**
- Error-UI markers are checked on every load, plus a server-log `⨯` scan per page group.
- The marker check's positive control was a static page only. The real-data control is the log scan, which the run5 replay above proves.

**RVR-9 (`verdict.py` over-counting): SATISFIED.** See §2.

**RVR-10 (it6 copy details): SATISFIED.**
- `object-edit-key` has a variant on a last-listed empty object.
- `deal-bulk-stage=!ticked` picks a stage by name.
- The object-import file fixture now includes `contractNo`.
- `crm-home-ai-*` are asserted `state: disabled`.
- The overdue-task interplay is covered by run6 C.

**RVR-11 (notes): corrected in place** (crm-C4.2.md:682).

## 2. `verdict.py` and the waivers
- **`waivers-it7.json` is exactly my R4 ruling 2, and nothing else:** 4 WAIVE + 9 ACCEPTABLE GAP = 13 testids.
  `activity-row-company-link` is correctly absent.
- **I re-derived the run5 re-score with the it7 `verdict.py`, and it matches:**

  | measure | value |
  |---|---|
  | pressed | 7821 |
  | passed | 7793 (incl. 56 WAIVED) |
  | LOCKOUT-PAIRED | 190 items, 41 rows (exactly my R4 ruling 1 list) |
  | WAIVED | 56 items, 13 rows |
  | VACUOUS | 4 items: `activity-row-company-link`, nok/thana × d+m. The script prints "2 rows" because it counts per viewport. |
  | wrongExpect | 24 |
  | outboxUnsettled | 6 |

- **Can LOCKOUT-PAIRED, WAIVED or the new needs classes absorb a real failure? No.**
  - LOCKOUT-PAIRED and WAIVED only reclassify hidden-role **absences** (`h && !f`).
  - A hidden role that finds the control is still `hiddenLeak`.
  - A visible role that misses it is still dead, or skippedNeeds, which is outside `pressed`, as before.
  - `needsWaiver` only annotates. `needsProbe` can only turn a skip into dead.
- **Two LOW points:**
  - Waivers are keyed by bare testid, so they would apply on any page. Keying them `page#testid` would be tidier.
  - `--combine-base` re-counts only the base run's `pageErrors`. Its outbox, restore and tripwire lists for kept pages are dropped.
    That is harmless here, because run5's only such failures (outbox on `/emails/[threadKey]` and `/contacts/new`) are on run6 A
    pages, but it should be stated in the notes.

## 3. `needs-ruling-it7.csv` (104 items)
- **Every class is one I ruled.**
- **Cosmetic mislabels** (no change in outcome):
  - `crm-home-stale-row-*` / `-view-*` are visible-role seed gaps (R5-ACC), not R4-2G.
  - `settings-stages-create-link` belongs to the empty-shop links (an R4-1 page-level gate, plus the same functional gap as `deals-empty-create-pipeline`).
- **R5-RECOMMEND 14 (fixtures not built) is acceptable for ACCEPT**, as I ruled: not blocking.
  - Condition: they go into C6 as C4.2-fix test debt with an owner.
  - Priority order: `deal-req-*` (a core move dialog never pressed in any run), then CRM custom fields, then kanban.

## 4. `run6.sh` and the fix15 surface
**`run6.sh` implements R7.**
- It runs A/B/C plus 5 E pages, drawn with a seeded RNG. The draw is written to the status file before anything runs.
- It refuses:
  - builds 09de6435, ca78a54d and e1caec03
  - a non-mock build
  - `scripts/` that differ from the promoted directory, or a runner that is not it7
- md5 is frozen per role.
- It records counts (including the 9 tables) before and after, the server-log offset, the pass-level tripwire, window-leftovers, the
  run6 verdict with waivers, and the combined run5+run6 verdict.

**The fix15 surface is fully covered:**

| fix15 file | page that exercises it |
|---|---|
| DealTable, deals-actions, deals.ts | `/deals` (A) |
| CrmApiSettings | `/settings/api` (A) |
| CrmScoringManager | `/settings/scoring` (A) |
| EmailThread, `emails/[threadKey]/page.tsx`, emails.ts gate | `/emails/[threadKey]` (A) and `/emails` (B) |
| CrmFilesBlock | the 4 record pages (B) and `/activities` FilesPanel (A) |
| after-drain | every page group that writes. The runner fails any group whose outbox has not settled within 60 s before its restore, so A+B+C+E is a broad CRM sample. |

- The new `crm-files-unavailable` card is static, so no registry row is needed. The lane's F14 at `56b0a278` gives 0/0.

**Final page list:**
- **A:** `/settings/scoring` · `/deals` · `/objects/[key]` · `/emails/[threadKey]` · `/settings/api` · `/contacts/new` · `/settings/objects` · `/settings/pipelines` · `/activities`
- **B:** `/contacts/[contactId]` · `/companies/[companyId]` · `/deals/[dealId]` · `/objects/[key]/[recordId]` · `/emails`
- **C:** `/app/sys/[id]` · `/app/sys/[id]/pos/register` · `/calendar` · `/app/settings/teams`
- **E:** 5 pages by seed
- **D:** customer lock-out of all the above, plus `/b/*` and `/u/*`

`after-drain.ts` is shared by chat, POS, kanban, booking and member. Their wake paths are **not** C4.2's evidence. fix15's review must
show a cross-module outbox check.

**For ACCEPT, the run6 outputs must show:**
1. `run6-verdict` PASS:
   - passed == pressed
   - 0 for dead, wrongExpect, hiddenLeak and disabled (including the manager on the attach rows)
   - VACUOUS 0: `activity-row-company-link` paired
   - every hard list empty, including tripwire and pageErrors
2. `run6-tripwire.txt` CLEAN, rc 0.
3. "counts before=after: YES". If not, attribute every difference before blaming the runner, because other lanes write to this tenant.
4. `window-leftovers` lists only AuditLog and OutboxEvent.
5. `run6-combined-verdict` PASS.
6. `deal-bulk-move` postChecked on 4 roles × 2 viewports.
7. fix15 merged with its own P-it6-2 oracle green.

## 5. The leftover cleanup
- **[A] AccountContact (82 rows): APPLY AS IS.**
  - The `qc-btn-` tag is used only by the button runner (no other script or `src` file contains it).
  - "Party missing" proves the restore removed the source. The 8 rows "outside windows" (1 Oct 02:55–03:14) carry the same tag.
  - The 53 untagged "บริษัท คิวซี 01 จำกัด" rows with a missing party are probably the runner's too, but they are not provable.
    Leave them listed only, as the script does.
- **[B] member rows of gone customers (150 + 110 + 55): DO NOT APPLY AS IS.**
  - "Customer is gone" is not runner-only. This tenant is the member QC tenant: many `qc-member-*` suites create **and delete**
    Customers in it, and run4's notes show another lane's public-join writes under the lock.
  - The provenance check found 55 gone customers. For 48, the first audit row is `member.created` by the owner/manager persona; for 7
    it is `member.created` by a null actor, at the runner's import steps.
  - That is strongly suggestive but not proof, because member suites can also act as the owner.
  - The rows are orphans with no reader. `runDue` marks the QUEUED ones SKIPPED because their customer is missing, and QC has no cron
    and no mail key. So leaving them is harmless.
  - If the controller wants them gone, narrow the criterion: keep only customers whose `member.created` audit is within ±2 min of a
    persona's `crm.contact.convert` / `crm.contact.import` / `crm.contact.create` audit in the same window.
- **[C] AI credit transactions: do not apply** (wallet ledger; QC only; no money).
- **[D] AppNotifications: nothing provable.**
- **Timing: the cleanup is not needed before run6.**
  - run6's proof is window-scoped (counts at its own start and end, window-leftovers, tripwire) and does not depend on these rows.
  - Apply [A] under the lock either before or after run6, never during it.
- **Note:** 20 AppNotifications in earlier runner windows have `emailedAt` set (`shark.local` recipients, run2–dbg14). From now on
  the tripwire would fail a run on this.

## 6. Does anything in it7 weaken a check compared with the frozen run5 runner?
**No material weakening.**
- **One deliberate coverage reduction for safety:** the 7 composer field rows (`crm-email-to/-subject/-body/-template/-attach/-schedule`
  plus the form) are now skippedSafety. They were soft field rows; C2.5-S2.4/S9.6 cover the composer.
- **Everything else is equal or stronger:**
  - longer hidden waits
  - `needs` can become dead
  - the AI buttons are asserted disabled
  - `-pick` lost `needs`
  - the bulk move has a result text and a history check
  - the access rows have count checks
- **One LOW point:** if `crm-portal-invite-email` cannot be unticked, the invite submit is skipped for safety, not failed. And the
  checkbox row itself does not assert that the untick worked. A stuck-on checkbox would be a product defect reported only as a
  safety skip. Suggest: `wrongExpect` when the box stays on after the untick click.

**GO / NO-GO: GO.** Promote next-it7 and launch run6 after fix15 merges and :3215 is rebuilt.
- There is no must-change item.
- Recommended, all cheap and none blocking:
  1. Assert `emailEnabled === false` in the pre-flight.
  2. Key the waivers `page#testid`.
  3. Have `run6.sh` print one aggregate PASS/FAIL line over the verdict, tripwire, counts and leftovers.
  4. Fail when the invite e-mail box stays ticked.
- Cleanup: apply [A] only, outside run6. Do not apply [B] as is; use the narrowed criterion or leave it. Do not apply [C] or [D].
- Acceptance evidence: §4.

---

## Final check after run6 (fresh reviewer, 3 Oct 2026)

Reviewer: fresh and independent (not the builder, not the it4–it7 reviewer). Written 2026-10-03 07:21 UTC (`date -u`). c42b @ `27d914e1`.
Read and analysis only: I ran no runner, no pnpm/tsx script, touched no DB, server or network, and read no `.env*` file. Everything
below is recomputed from the raw files in `/tmp/c42b-logs` (66 run6 summaries, 65 run5 summaries, role logs, counts, tripwire,
leftovers), the registry, `next-it7/verdict.py`, and `git` objects of `/root/projects/shark-crm` (session/crm). I did not use the
`VERDICT PASS` lines as evidence.

**What ran.** `run6.sh` md5 255e1177 (= the reviewed copy). Build at start `READY 22:06 2f5e411b port=3215 ai=mock` (not e1caec03).
Runner 71120e8e and registry f102f258 in `run6.md5`; the files in `scripts/` and `next/` have the same md5 now. Seed 2026100322. I
re-drew E with the script's own code and got the recorded five pages (pool 31): `/app/sys/[id]/member/members` · `/app/party/[partyId]`
· `/settings/tracking` · `/settings/quotas` · `/settings/portal`. Window 22:06:53Z → 01:34:04Z; all five roles rc=0.

| item | result | evidence (re-derived) |
|---|---|---|
| a. run6 verdict | **PASS** | 66 summaries (13 chunks × 4 staff + 14 customer), no `-crash.json`, 66 `🟢` lines and 0 `🔴` in the role logs, `fatal: null` everywhere. Per role pressed = passed: owner 1042 · manager 1036 · nok 1110 · thana 1116 · customer 73 = **4377 / 4377**. In every file `total` = presence − skippedNeeds − skippedSafety (4845 − 400 − 68). dead 0 · wrongExpect 0 · hiddenLeak 0 · disabled 0 · vacuous(guard) 0 · overflow 0. No presence row with `h && f`. Every visible-but-absent row is in skippedNeeds. Hard lists all empty: restore failures 0 (342 restores) · cleanup 0 · outboxUnsettled 0 · verify 0 · tripwire 0 · pageErrors 0. Hidden absences 1844: paired 1686 · customer page lock-out 44 · LOCKOUT-PAIRED 70 · WAIVED 44 · **VACUOUS 0**. |
| a. manager attach rows | **PASS** | `/emails/[threadKey]` answered 200 for the manager on both viewports and 9 other rows were found there. `crm-email-attach-contact-q/-go/-pick` are hidden-absent for the manager (d+m) and found by the owner (d+m), so they are paired. Owner `-pick` is dbVerified (`CrmActivity`, `AuditLog crm.email.attach`). |
| a. `activity-row-company-link` | **PASS** | Found by owner and manager (d+m), hidden-absent for nok and thana on a 200 page: paired, not vacuous. The other 5 fixture rows (`objects-archived-toggle`, `object-restore-btn`, `object-archive-confirm-key/-reason`, `pl-restore-*`) are pressed by the owner and paired. |
| a. `verdict.py` | **PASS** | `next-it7/verdict.py` md5 845b230d (the reviewed one). `ok` requires passed == pressed, VACUOUS 0, 0 dead/wrongExpect/hiddenLeak/disabled and `not any(hard.values())`; entries are appended only when non-empty, so PASS with a non-empty hard list is impossible. Three things it cannot see, which I checked by hand: a missing or crashed chunk (none), the self-reported `total`/`passed` (they match the presence arithmetic), and in `--combine-base` the base run's hard lists other than pageErrors (item f). `next/` holds only the runner and registry; the older `scripts/pending/c42b/verdict.py` (42bd777b) was not used. |
| b. WAIVED and LOCKOUT-PAIRED | **PASS** | I checked all rows, not a sample. WAIVED: 11 rows / 44 items, every testid is in `waivers-it7.json` (f09fbbeb), and every one sits on a page that answered 200 for the hidden role, except `member-view-team` for nok (404). LOCKOUT-PAIRED: 17 rows / 70 items; for every row every hidden role got 404 on every load of that page and viewport (raw `pageStatus`). 16 of the 17 are on the R4 ruling 1 list. The 17th, `/emails crm-emails-thread-row`, is new: see F1. The transitive waivers hold in run6: `contact-menu-merge`, `crm-ai-home-at-risk` and `crm-ai-proposal-edit` are found by owner and manager and hidden-absent for nok and thana. |
| c. tripwire | **PASS** | `run6-tripwire.txt`: all 7 DB counters 0, 0 `[email` / `⨯` lines after byte 121 (log size 1500), `TRIPWIRE CLEAN`, rc=0 in `run6.status`. The window covers the run: the first runner start is 22:06:55 (the summary's `runStart` is start − 5 s by design) and the last summary was written 01:34:03. I read the server log myself: it holds the Next banner, one pg warning and 6 `[after-drain] fallback drain` lines, nothing else. It is still stdout of the running server (pids 3533344 / 3533359). |
| d. counts | **PASS** | 159 keys in both files. Exactly three differ: `AuditLog` 7655 → 8375 (+720), `OutboxEvent` 9262 → 10412 (+1150), and the `_at` timestamp. All 74 content checksums are equal, no `ERR` or `n/a` value, `qc-btn-` tags 0, live `qc-btn` sessions 0. The two deltas equal the window-leftovers numbers exactly, so nothing needs attributing to another lane. `counts-before-run6` also equals `counts-after-dbg21` apart from `_at`. |
| e. window leftovers | **PASS** | Only `AuditLog: 720` and `OutboxEvent: 1150` out of 264 tenant models. |
| f. combined verdict | **PASS, with F1–F3** | Recomputed base (run5, the 25 pages run6 did not touch): 3428 pressed (owner 811 · manager 835 · nok 863 · thana 869 · customer 50), 0 failures, LOCKOUT 94, WAIVED 12, VACUOUS 0. 3428 + 4377 = **7805 / 7805**, LOCKOUT-PAIRED 164, WAIVED 56. All 24 run5 wrongExpect rows and all 6 run5 outboxUnsettled lines are on pages run6 re-pressed; run5 has no restore, cleanup, verify, tripwire or fatal entry, so dropping the base hard lists hides nothing. 25 + 32 = 57 pages = every page run5 planned; no page is dropped from both. Item-level exceptions: F1, F2, F3. |
| g. `deal-bulk-move` | **PASS** | `postChecked` and `dbVerified` (`CrmDeal`, `AuditLog crm.deal.bulk_move`) for owner, manager, nok and thana on desktop and mobile: 8 of 8. |
| h. fix15 merged | **PASS** | session/crm: `07ce81c2` (fix15, 10 src files) then `2f5e411b` (gate record); `git diff 2f5e411b HEAD -- src` is empty, so the build is the merged tree. Gate log `.qc-shots/crm/main-fix15.log`: probe-cf20-drain exit 0, probe-cf20 exit 0 (Q1–Q3: a created contact's rows are DONE within 5 s, 271 ms and 3392 ms). probe-cf20-rv-drain exited 1 in the gate (K9); the record explains it and the committed log shows 27/27. Review verdict: MERGEABLE (round 2). In run6 `/contacts/new` was pressed 16/16 by all four staff roles on both viewports, each wrote rows (restore deleted 5–6) and none needed an outbox wait. Note: round 2 (4 src files) was merged after the it7 check read the fix15 diff; all four files are on run6 A pages. |
| i. new product defect | **NO** | 0 dead / wrongExpect / hiddenLeak / disabled, 0 page errors, 0 `⨯` lines. The 8 consoleErrors are the play fixture's `/api/files/…` 404 on `/contacts/[contactId]`, as in run5. See O1 for the one product observation. |

**Findings**

- **F1 LOW–MED (run6.sh chunking; coverage): `crm-emails-thread-row` was not pressed on the fix15 build.**
  - run5 pressed it for owner and manager (d+m, 4 items). In run6 it is in skippedNeeds ("ซีดมี 0", probe none, waiver none).
  - Cause: the runner creates the e-mail thread fixtures only when a `[threadKey]` page is selected (qc-crm-buttons.mts:2805). `run6.sh`
    puts `/emails` in a chunk without `/emails/[threadKey]`, so the inbox was empty. Not a product failure.
  - Effects: the combined verdict drops the run5 press because `/emails` is a run6 page; the row is on no ruled list; and the nok/thana
    absence is LOCKOUT-PAIRED (a real 404) where run5 had a true pairing.
  - Why it does not block: fix15 changes only the unmatched-gate helper in `emails.ts` and the `canAttach` flag of the thread page (I read
    the diff); the list query and the `/emails` page are not in the diff. The gate was exercised on `/emails` in run6
    (`crm-emails-tab-unmatched`: owner pressed, manager hidden and paired), and the link's destination rendered 200 for owner and manager.
  - Close (C4.2-fix): create the thread fixtures when `/emails` is selected, and give the row a `needsProbe`. A re-press of the one chunk
    `re:^/emails(/\[threadKey\])?$` for owner and manager would close it outright.
- **F2 LOW (verdict accounting): `--combine-base` replaces whole pages, not page × role.** run5 pressed `/u/[token]`
  (`crm-unsub-confirm`, `crm-unsub-notrack`) with the four staff roles (16 items). run6 ran `/u` for the customer only (4 items, passed,
  dbVerified), so the 16 leave the combined table. Same public page and controls; no evidence is lost that matters.
- **F3 LOW (pre-existing): the customer lock-out of `/emails/[threadKey]` is not tested** (0/0; the runner has no thread for the customer).
  run5 had the same gap. 44 of 44 other lock-outs (22 staff pages × 2) redirect to `/login`.
- **F4 LOW (pre-existing, for C6): 7 registry rows on 3 pages are never planned in any run**: `/p/[slug]` ×5, `/app/sys/[id]/account/docs/…`
  ×1, `/app/sys/[id]/meeting` ×1 (no fixture; builder note line 535). Also 6 select rows are found but have no option to choose and carry
  no `needsWaiver`: `contact-convert-member-system`, `crm-portal-settings-board`, `crm-auto-action-board`, `crm-auto-param-field`,
  `crm-forms-assign-*`, `crm-integrations-target-kanban`. I found no reviewer ruling that names these 13; they are unchanged since run5.
- **O1 (product observation for the C5.5 close, not new):** the server log has 6 `[after-drain] fallback drain: an after() task did not
  start within 3000 ms` lines in the run6 window. So the P-it6-2 symptom does occur on the real `next start` server and fix15's fallback
  caught it each time. The root cause is still unproven, as the fix15 review says. Longest outbox wait in run6: 14.4 s
  (`crm-score-recompute-apply`), against the runner's 60 s limit.

**Not verified**
- Anything that needs the DB or the server: I did not re-run counts, tripwire, window-leftovers or any probe; I read their outputs.
- That the tripwire and leftovers scripts query what their source says (source read only; md5 b2c63d0a for the tripwire).
- The fix15 probes: read from the committed logs and the gate log, not run. The hand re-run of probe-cf19 on QC2 (56/56) is in the
  gate record only.
- The DOM behind hidden-absent passes (the runner keeps no dumps), and the content of any screenshot.
- When the 6 fallback lines were written (the log has no timestamps; its mtime is 00:43 UTC).

**Ruling.** The seven acceptance items of the it7 check (§4) are all met from raw artefacts. F1–F4 are coverage and accounting debt
with no failing check behind them; register them with C4.2-fix / C6. For closing C5.5: run6 shows no new product defect.

FINAL VERDICT: ACCEPT

# C4.3 addendum — oracle-proposed contract for `scripts/qc-crm-forms.mts` (controller to confirm)

Written by the C4.3 oracle/runner writer, worktree `shark-crm-c43` at `18feaa84`, in-process proof on **QC3**
(`.env.qc3`, answer key `.qc-shots/c43/qc3-crm-expected.json` = copy of the QC3 key generated 26 Sep 05:41). The brief
(`crm-brief-C4.md` §C4.3, MASTER-PLAN §7 item 5) fixes the six categories and the gate; everything below marked
**DECISION** is a choice this runner makes that the brief leaves open. If the controller wants different behaviour the
change belongs in `scripts/qc-crm-forms.mts` (this file documents what the code does, not what it should do).

Files: `scripts/qc-crm-forms.mts` (runner) · `scripts/lib/qc-crm-restore.mts` (shared snapshot/restore, copied from
`qc-crm-buttons.mts` + 3 additions, §4) · output `.qc-shots/crm/forms/{summary,plan-dry,selftest-browser}.json`.

## 1. Category semantics (what "pass" means)

| cat | where | pass condition |
|---|---|---|
| a | browser | fill every spec field with the valid value (tag field = `qc-form-<run>-<n>`), click the submit testid → within 10 s the spec probe shows exactly the expected rows, no window dialog, no ≥500 response |
| b | browser | one check per **required case** (default: one per required field; compound rules listed per form) — leave it empty, fill the rest validly, click submit → a Thai text node that was NOT on the page before appears ≤ 72 px under the field (or in its `aria-describedby`/`aria-errormessage`), `document.activeElement` is that field, no dialog, no row |
| c | in-process + browser | 5 payloads (`overlong` = server max + 5, `emoji` incl. ZWJ family, `=cmd|' /C calc'!A0`, `<script>window.__qcXss=1</script>`, `"><img src=x onerror=…>`) — **in-process**: on the tag field all 5, on every other free-text field the 3 hostile ones; stored value must equal the input byte-for-byte OR be refused cleanly (Thai, `{ok:false}`); CSV export (where one exists) cells must never start with `= + - @`. **browser**: the 5 payloads typed into the tag field; stored = typed (truncated only by the field's own `maxLength`); every render location loaded fresh → `window.__qcXss` unset, no injected `img[src=x]`/`[onerror*=__qcXss]`/`<script>` element, payload visible as literal text (innerText + input values + option text) |
| d | browser (+ in-process) | **browser = the gate**: two real mouse clicks 80 ms apart on the submit → exactly the expected rows. In-process: two parallel action calls with one payload; REST: two parallel POSTs with ONE `Idempotency-Key` |
| e | browser | fill everything, then click the close/cancel testid (or navigate to the CRM home when the form has none) → 0 rows after 2 s |
| f | in-process | valid payload accepted by the action (and the REST op when one exists) with the expected rows · each required case refused by the action with `{ok:false}` + Thai text and by REST with 4xx + Thai `message_th`, 0 rows · every `serverBad` input (things the client refuses or cannot produce) refused the same way |

- **DECISION D-b1 (strict b):** an HTML `required` bubble (English, browser chrome, not in the DOM) = ❌ `native-bubble`;
  a submit button that is simply disabled with no text saying why = ❌ `silent-disable`; one form-level message box
  (e.g. `teams-msg`, `pl-msg`, `object-add-error`) = ❌ `not-under-field` (the detail says where the text went and how
  far from the field). Rationale: the brief says "inline Thai error **under that field** … focus moves to it".
  **Source reading predicts b ❌ for nearly every form in phase 2**: none of the 24 form components calls `.focus()`
  (grep of all 24 files + pickers) and 20 of 24 show errors in ONE form-level box. Only `contact-new-form` has per-field
  error testids (`contact-new-{k}-error`); `company-new-form`, `deal-new-form` and `activity-log-form` render a span
  without a testid under the field (they can pass "under" but will still fail "focus"); `object-add-form` has a
  per-field hint for the key only. The controller must decide whether b is (i) a product
  fix loop (per-field messages + focus for 24 forms — owners C1.3–C3.4) or (ii) relaxed (e.g. accept a form-level box
  within the form + focus on the first invalid field). The runner reports the `kind` per check so either choice is a
  filter on `summary.json`, not a rewrite.
- **DECISION D-c1:** emoji must be ACCEPTED (refusing it = ❌ `legit-text-refused`); `overlong`/`=cmd`/`<script>`/`<img>`
  may be accepted-and-inert OR cleanly refused. Stored ≠ input is ❌ with a kind: `html-escaped-at-write`,
  `silent-truncate`, `zwj-stripped`, `altered`.
- **DECISION D-c2:** a server that silently truncates a value the UI **cannot** produce (field `maxLength` ≤ the cut) is an
  advisory, not a failure (only `crm-seq-holiday-form` name, cut at 120 = its `maxLength`).
- **DECISION D-d1:** in-process double submit is GATED only where the product itself declares a natural key (unique index,
  upsert, advisory lock, idempotent write — the `naturalKey` column of §2); for the other 13 forms that ran the server has no
  dedupe by design (UI `busy`/`useTransition` guard only) → advisory. The browser double-click is the gate for all.
- **DECISION D-f1:** "same refusal" = both refuse. Message text differences are advisories (14 today, e.g. client
  "ใส่ชื่อ pipeline ก่อน" vs server "ใส่ชื่อ pipelineก่อน" — note the missing space, `pipelines.ts:78`).
- **DECISION D-f2:** a thrown error from a server action is NOT a clean refusal (production Next redacts thrown messages;
  the user sees a generic error) → ❌ `thrown`. None seen on the owner path; `createCrmApiKeyAction`/`createCrmWebhookAction`
  (`settings/api/actions.ts:53,101`) and the e-mail action wrapper (`emails/actions.ts:40`) call their gate OUTSIDE the
  try, so a user without the permission gets a throw — not exercised (owner only, D-r1).
- **DECISION D-f3 (client-only rules):** `visibility-override-form` refuses role-only on the client but the service accepts
  role-only by design (the per-role table uses the same `policies.set`, `visibility.ts:646`) → advisory `client-only`.
- **DECISION D-r1 (role):** every form runs as the seeded **owner** (role/visibility coverage is C4.2's). Desktop 1440×900
  only (390 px layout is C4.2's overflow check).
- **DECISION D-t1 (tags/probes):** tagged forms count rows whose text column contains the attempt's unique tag;
  natural-key forms (member add, visibility, holiday, enroll, bulk, team room, archive, object edit, stages) restore the
  snapshot after EVERY check (`restoreEach`) and count the natural key (member add and visibility count every row of
  the team/system, so a stray row written by a bad payload is visible).
- **Gate** = `passed === total` AND every positive control caught AND `restore.verify.identical === true`.

## 2. Per-form contract (source-verified; required = who refuses an empty value)

`both` = client + server · `server` = server only · `client` = client only · `/js-box` one form-level box ·
`/html` native `required` · `/disable` submit disabled. REST = equivalent op under `/api/v1/crm` (own zod schema, same
service). Renders = where the runner looks for the stored value (c-browser).

| form (page) | fields · required | action · REST · natural key | renders · CSV |
|---|---|---|---|
| company-new-form (`/companies/new`, page) | name* both/js (≤200) · industry ≤100 · note ≤4000 | `companies-actions.ts:71` · `companies.create` · none | list `?q=` · detail · CSV `exportCompaniesAction` |
| contact-new-form (`/contacts/new`, page) | firstName* both/js (≤200) · lastName · jobTitle | `contacts-actions.ts:70` · `contacts.create` · none (dedupe only on phone/email) | list · detail · CSV `exportContactsAction` |
| deal-new-form (`/deals/new`, page) | title* both/js (≤200, maxLength 220) · contact* both/js · nextStep ≤2000 | `deals-actions.ts:74` · `deals.create` · none | detail · table `?q=` · CSV `exportDealsAction` |
| pl-new-form (`/settings/pipelines`) | name* both/js (≤100) | `pipelines-actions.ts:55` · — · none | settings · `/pipelines` |
| st-new-form (`/settings/stages?pipeline=`) | name* both/js (≤60) · prob (0–100 int) | `pipelines-actions.ts:99` · — · none (restoreEach: 20-stage cap) | settings · board |
| lr-new-form (`/settings/lost-reasons`) | label* both/js (≤100) | `lost-reasons-actions.ts:38` · — · label check `lost-reasons.ts:74` | settings |
| activity-log-form (`/activities`, opener `activities-new`) | target* both/js · title* both/js (≤300) · body ≤8000 | `activities/_components/actions.ts:63` · `activities.log` · none | `/activities` · contact 360 |
| teams-create-form (`/app/settings/teams`, opener `teams-create-open`) | name* both/js (≤80, maxLength 80) | `settings/teams/actions.ts:49` · `teams.create` · `Team @@unique[tenantId,name]` | teams page · visibility options |
| team-member-add-form (same page, opener `team-card@<teamId>`) | user* both/disable | `settings/teams/actions.ts:69` · — (`teams.members.set` replaces the whole set — not equivalent) · upsert `@@unique[teamId,userId]` | teams page |
| visibility-override-form (`/settings/visibility`) | team OR pipeline* both/js (compound) · entity/level server (select, no empty option) | `settings/visibility/actions.ts:39` · — · advisory lock + NULL-safe upsert | visibility rows |
| object-edit-form (`/settings/objects?object=contract`, opener `object-edit-btn`) | label* server · labelPlural* server · titleFieldKey* server (≤120/120/40) | `objects-actions.ts:114` · — · update of one row | settings · `/objects` · `/objects/[key]` |
| object-archive-form (same, opener `object-archive-btn`) | confirmKey* both/disable · reason* both/disable (≥5) | `objects-actions.ts:144` · — · idempotent | settings |
| object-add-form (`/settings/objects`) | label* both/js · key* both/js (pattern) · titleFieldKey* server | `objects-actions.ts:85` · — · `CustomObject @@unique[systemId,key]` | settings · `/objects` |
| object-view-save-form (`/objects/contract?q=qc`, opener `object-view-save-btn`) | name* server (≤80) | `objects-actions.ts:370` · — · none | `/objects/[key]` chips |
| object-import-form (`/objects/contract`, opener `object-import-btn`) | csv* both/js | `objects-actions.ts:349` · — · none | `/objects/[key]?q=` · CSV `records.export` |
| object-record-form (**company 360 `?tab=obj-contract`**, opener `object-record-new-btn`) | contractNo* server | `objects-actions.ts:301` · `records.create` · none | `/objects/[key]?q=` · record detail · CSV `records.export` |
| crm-api-key-form (`/settings/api`, opener `crm-api-new`) | name* both/html (≤100, maxLength 100) | `settings/api/actions.ts:51` (FormData) · — · none | key table |
| crm-api-hook-form (same, opener `crm-api-hook-new`) | url* both/html · events* server (≥1) | `settings/api/actions.ts:100` (FormData) · — · none | webhook table |
| crm-seq-new-form (`/settings/sequences`, opener `crm-seq-new`) | name* both/js (≤120) · step subject* server · step body* server | `settings/sequences/actions.ts:56` · `sequences.create` · none | list · editor |
| crm-seq-holiday-form (`/settings/holidays`) | date* server · name (cut 120) | `settings/sequences/actions.ts:188` · — · `DISTINCT ON (date)` one statement | holiday rows |
| crm-seq-enroll-form (contact 360, opener `crm-seq-enroll`) | sequence* both/js (select, no empty option) | `settings/sequences/actions.ts:94` · `sequences.enroll` · partial unique ACTIVE | contact 360 |
| crm-seq-bulk-form (`/contacts`, opener `crm-seq-bulk`) | confirm* server · reason* server (≥5) | `settings/sequences/actions.ts:116` · `sequences.bulkEnroll` · partial unique ACTIVE | contact 360 |
| crm-email-composer (`/emails/[threadKey]`) | subject* both/js (≤300) · body* both/js | `emails/actions.ts:40` · (REST `emails.send` has no `to`/schedule — not used) · none | thread page |
| crm-settings-team-room (`/settings`) | team (select) · channel ("" = unbind) | `_actions/ai.ts:75` · — · keyed overwrite | same component |

- **DECISION D-reg1:** `object-record-form`'s registry row says `/objects/[key]`, but for an object whose parentType ≠
  NONE the list page renders `object-add-hint` instead of the form (`objects/[key]/page.tsx:256`); the seed's only object
  (`contract`) has parentType COMPANY, so the runner uses the real location (company 360 object tab). C4.1 may want an
  `alsoOn`/`query` on that row.
- **DECISION D-fx1 (fixtures, created after the snapshot, protected across mid-run restores, removed by the final
  restore):** a TASK-only sequence for enroll/bulk (the seed has no sequence; a TASK step so the QC server's sequence job
  can never send), one `CrmContactConsent{EMAIL, granted}` + one far-future scheduled message for the composer thread
  (the seed has no e-mail thread and no e-mail consent), one `crm.admin` API key for REST.
- **Seed gap:** `crm-settings-team-room` has no valid path on this seed (no MEETING system → the component renders a text
  instead of the form) → a/c/d/e SKIPPED; f still checks a foreign channel id is refused.

## 3. Safety

- In-process `globalThis.fetch` sandbox: any non-local host gets a synthetic 503 and is listed in `summary.blockedFetch`
  (0 in the QC3 runs). The composer's in-process sends ALWAYS use `scheduledAt = 2099-01-01` — an immediate send that
  dies mid-`deliver` is re-sent for real by the QC server's minute job (`emails.ts:1548-1554`); `sendCore` validates the
  same way before branching (`emails.ts:1165-1167`).
- Browser: `crm-email-composer` is `guard`ed — only b runs, with request interception aborting any `next-action` POST;
  a/c/d/e are `skippedSafety`.
- The runner refuses to touch a DB whose `AppSystem(id=systemId, tenantId, type CRM)` from the answer key does not exist
  (proved: `iso.sh` drops `CRM_EXPECTED_PATH` from the env → fatal, nothing written).

## 4. Shared restore module (`scripts/lib/qc-crm-restore.mts`)

Behaviour-identical copy of the C4.2 SNAPSHOT/RESTORE + tag sweep, plus:
1. **`MemberSection` added to `SNAP_MODELS`** (before `MemberField`) — the first company/contact/object create lazily
   provisions a "system" section; the C4.2 list restored the fields but left the sections (found by `verify()` in QC3 run
   #1; the 2 leftover sections + 1 OpsEvent were removed by id). **This changes C4.2 behaviour when it switches to the
   module (for the better).**
2. `purgeAppendOnlySince()` (opt-in) — deletes AuditLog/OutboxEvent/AppNotification (+ caller's `appendOnlyExtra`, the
   forms runner adds `ApiIdempotency`, `OpsEvent`, `WebhookDelivery` — in phase 2 the running QC server may drain the run's outbox events into deliveries) rows of the tenant created since the snapshot, so the run is
   byte-identical instead of "identical except history". Safe only under the QC gate lock.
3. `verify()` — re-reads every snapshot model and compares, plus counts rows created since the snapshot in EVERY other
   tenant-scoped model with `createdAt` (`leftoversSince`). `protect`/`unprotect`/`clearProtect` for fixtures.

## 5. Findings so far (in-process, QC3 — each reproduced by the runner, source line verified)

1. **team-member-add: empty user id writes a phantom member** — `addMemberAction(teamId, "")` returns `{ok:true}` and
   upserts `TeamMember{userId:""}`: `assertUsers` drops empty ids before the membership check (`src/lib/core/teams.ts:57-59`)
   and `TeamMember.userId` has no FK (`prisma/schema/team.prisma`). The UI only disables the button. Round-robin lead
   assignment reads team members. Repro: `--form team-member-add-form --inproc` → `f required:userId row-written`.
2. **lost-reason: parallel duplicate labels** — two concurrent `createLostReasonAction(sys, "X")` both succeed
   (check-then-insert, `lost-reasons.ts:74-79`; unique only on the random `key`, `crm.prisma` CrmLostReason
   `@@unique([systemId, key])`). Repro: `--form lr-new-form --cat d --inproc`.
3. **activity title strips U+200D** — `INVISIBLE_CHARS_RE` (`activities-shared.ts:63`, `​-‏`) removes the
   zero-width joiner, so "👨‍👩‍👧" is stored as three separate emoji. Low severity; controller may downgrade (D-c1).
4. (source, not yet exercised) `EmailComposer.tsx:116` shows "ส่งจดหมายแล้ว" for any status ≠ QUEUED, including FAILED.

## 6. How to run

```
# phase 1 (in-process, QC3)
bash scripts/iso.sh env CRM_EXPECTED_PATH=.qc-shots/c43/qc3-crm-expected.json bash scripts/qc3.sh \
  bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-forms.mts --inproc
# plan / browser self-test (no writes)
… qc-crm-forms.mts --dry            pnpm exec tsx scripts/qc-crm-forms.mts --selftest-browser
# phase 2 (full, QC1 + running prod QC server — controller starts the server)
env CRM_EXPECTED_PATH=<QC1 key> QC_BASE=http://127.0.0.1:3215 bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-forms.mts
```

## Controller ruling (Fable · 27 Sep ~14:45 UTC) — BINDING
- **D-b1: STRICT stays.** Brief + standing owner rule ("validation inline, never Alert") ⇒ native `required` bubble, silently disabled submit, or one form-level box = FAIL. Expected outcome: a product fix work order **C4.3-fix** (shared field-error + focus-first-invalid pattern applied to all failing forms) after the Phase-2 run confirms the list. Keep `kind` on every check so the fix list is a filter.
- **D-d1: accepted.** Browser double-click is the gate for every form; in-process double submit is a gate only where the product has a natural key, advisory elsewhere.
- **D-c1/D-c2, D-f1, D-f2, D-f3, D-reg1, D-fx1: accepted as written.** (D-reg1: the registry page for `object-record-form` is fixed by the C4.2 lane, not here.)
- **D-r1: widened.** owner × 1440 for everything; ALSO owner × 390 for categories a/b/e (inline errors and sheets on mobile), and one STAFF role (thana) for category f permission refusals — covers finding 4 (gates outside try ⇒ thrown error instead of a Thai refusal).
- Findings 1–3 (+4 once exercised) go to C4.3-fix together with D-b1. Finding 2 fix must not add a UNIQUE index that could fail on existing prod rows (rule: no migration that can fail on prod data) — use a transaction-scoped lock or a pre-checked partial approach; the builder proposes, the controller approves.

## 7. PHASE 2 RESULT (QC3 server :3216 · build ce728fd8 · 27 Sep) — `.qc-shots/crm/forms/summary.json`

**577/651** · positive controls **140/140** (in-process 8 + browser 11 per part × 13 parts) · every part restore
**identical=true** · 74 failures = 6 `fixedInMain:130ca0c1` (findings 1–4, not in the server build) + **68 strict-b**
(every b check failed: a 44/44 · c-browser 190/191 [= finding 3] · d-browser 22/22 · e 44/44 · f 120/123 · c-in 139/140 · d-in 18/19).
Not exercisable on this seed: `crm-settings-team-room` a–e (no MEETING rooms); `crm-email-composer` a/c/d/e (real
transport — guarded). Each b check runs at 1440 and at 390 (`@390`); both viewports fail identically everywhere.

### 8. Work-order list — C4.3-fix part 2 (strict-b · D-b1 ruling)

**Required behaviour, for every form below:** on a refused submit, (1) render the Thai message for EACH invalid field
directly under that field (≤72 px, same column; `aria-invalid="true"` + `aria-describedby` to the message is the easy way
to satisfy the oracle), (2) move focus to the FIRST invalid field (`.focus()`), (3) never use a native `required` bubble
or a silently disabled submit as the only signal, (4) a server refusal that names a field is mapped back onto that field
(a form-level box may remain for errors that belong to no field). A shared helper (field-error + focus-first-invalid)
applied to all forms is the controller's stated preference. Oracle: `--form <testid> --cat b` (both viewports).

| # | form · file (error box line) | failing fields | current | fix |
|---|---|---|---|---|
| 1 | company-new-form · `companies/_components/NewCompanyForm.tsx` (box :300) | name | per-field span under field ✅ · **no focus** | focus first invalid |
| 2 | contact-new-form · `contacts/_components/NewContactForm.tsx` (:202) | firstName | `contact-new-{k}-error` under field ✅ · **no focus** | focus first invalid |
| 3 | deal-new-form · `deals/_components/NewDealForm.tsx` (:229) | title, contact | span under field ✅ · **no focus** | focus first invalid |
| 4 | lr-new-form · `settings/lost-reasons/_components/LostReasonSettings.tsx` (`lr-msg` :65, outside form) | label | message lands under the single field ✅ · **no focus** | focus + per-field msg (lr-msg is shared with row actions) |
| 5 | activity-log-form · `activities/_components/LogActivityForm.tsx` (:385) | target, title | span under field ✅ · **no focus** | focus first invalid (target = `activity-log-target-q`) |
| 6 | object-view-save-form · `objects/_components/ListTools.tsx` (:149) | name | server msg under field ✅ · **no focus** | focus on refusal |
| 7 | object-import-form · `objects/_components/ListTools.tsx` (`object-import-result` :76) | csv textarea | msg under field ✅ · **no focus** | focus textarea |
| 8 | crm-seq-bulk-form · `components/crm/sequences/SequenceBulkEnroll.tsx` (:89) | reason (no focus) · confirm (**not under field**) | server-only checks | client check confirm+reason≥5, msg under each, focus |
| 9 | pl-new-form · `settings/pipelines/_components/PipelineSettings.tsx` (`pl-msg` :149, outside form, 82–152 px away) | name | one page-level box | per-field msg + focus |
| 10 | st-new-form · `settings/stages/_components/StageSettings.tsx` (`st-new-msg` :192) | name | form-level box below all fields | per-field msg + focus (prob too) |
| 11 | teams-create-form · `components/crm/settings/TeamsManager.tsx` (`teams-msg` :161, ~835–944 px away, page bottom) | name | page-level box | per-field msg + focus |
| 12 | visibility-override-form · `components/crm/settings/VisibilitySettings.tsx` (`visibility-msg` :241) | team OR pipeline (compound) | page-level box | msg under the team select (anchor) + focus it |
| 13 | object-edit-form · `settings/objects/_components/ObjectsAdmin.tsx` (`object-edit-error` :259) | label, labelPlural, titleFieldKey | server-only, one box | client checks (empty/≤120/≤40 + key regex) + per-field msg + focus |
| 14 | object-add-form · same file (`object-add-error` :418) | label, key, titleFieldKey | one box (key hint only when non-empty & invalid) | per-field msg incl. empty key + focus |
| 15 | object-record-form · `objects/_components/RecordForm.tsx` (`object-record-form-error` :164) | required custom fields (contractNo) | no client validation, one box | client required check per field + msg under `object-record-field-{key}` + focus |
| 16 | crm-seq-new-form · `components/crm/sequences/SequenceListView.tsx` (`crm-seq-msg` :76, OUTSIDE form) + `StepFields.tsx` | name, step subject, step body | name client-only; subject/body server-only ("ขั้นที่ 1: …") | client checks for step fields + msg under each + focus |
| 17 | crm-seq-holiday-form · `components/crm/sequences/SequenceCalendarSettings.tsx` (`crm-seq-calendar-msg` :135, page bottom, shared) | date | server-only | client date check + msg under date + focus |
| 18 | crm-email-composer · `components/crm/emails/EmailComposer.tsx` (`crm-email-composer-msg` :128, ABOVE the fields) | subject, body | one box at the top | msg under subject/body + focus |
| 19 | crm-api-hook-form · `settings/api/_components/CrmApiSettings.tsx` (`crm-api-hook-msg` :306) | url (**native bubble** :278), events (not under field) | HTML `required` + type=url; events server-only | `noValidate` + JS check (https) + msg under url/events + focus |
| 20 | crm-api-key-form · same file (`crm-api-key-msg` :174) | name (**native bubble** :137) | HTML `required` | `noValidate` + JS check + msg under name + focus |
| 21 | object-archive-form · `ObjectsAdmin.tsx` (submit :181 disabled until key+reason) | confirmKey, reason | **silent disable** (label hint only) | enable submit (or keep disabled but show the reason) + msg under the field + focus |
| 22 | team-member-add-form · `components/crm/settings/TeamsManager.tsx` (submit :332 `disabled={busy \|\| !addUserId}`) | user select | **silent disable** | msg "เลือกพนักงานก่อน" under the select + focus |

Rows 1–8 only miss focus (the message is already in place). Rows 9–22 also need per-field messages. Findings 1–4 are
already fixed on main (130ca0c1) and should turn green when the server is rebuilt from main. The runner does not need
changing for C4.3-fix.

## 9. Post-review hardening (B1 B2 S3–S8) — result
Final run (runner sha ce208879, QC3 :3216, build ce728fd8): **585/659**, positive controls **217/217**, restore identical in
all 11 parts, `missingPlanned` 0, `provenanceProblems` 0. Failure set identical to §7 (74 = 6 fixedInMain + 68 strict-b) —
the §8 work-order list stands unchanged. New controls: PH-restore-readfail-snapshot/-restore · PH-verify-leftover ·
PH-lock-guard · PC-state-untagged-row · PB-describedby-static/-hidden · PR-searchbox-echo · PR-goto-failed/-404 ·
PM-partial-rerun · PM-missing-planned · PM-provenance · PM-build-src. The runner refuses to start without its DB's gate lock
held by an ancestor `flock`, or against a non-local QC_BASE; the merge refuses mixed runner/src/build versions.
**For C4.3-fix (c432):** prove with `bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-forms.mts --browser-only --form <testid> --cat b --part <name>`
(both viewports) + `--merge`; a server rebuilt from the fix branch changes BUILD_ID ⇒ re-run ALL parts (the merge refuses mixed builds by design).

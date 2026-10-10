# C5.5-fix3b — small leftovers of the C5.5 hunt (H2b-4 · H2b-5 · R2b-3 · F5 · F4) · builder note

Branch `wip/crm-cf5` (from `7d5dc93f` = session/crm tip) · worktree `/root/projects/shark-crm-cd2` · **QC2** (QC3 only for the QC3-pinned
suites probe-cf2 / c3.5 / c3.8). No schema change, no migration.
Probe `scripts/pending/cf5/probe-cf5.mts` (+ `_fx.mts` = cf3 fixture with tag `qc-cf5-*`, + `guard-child.mts` for F4) · runner
`scripts/pending/cf5/run-cf5-regress.sh` · logs in repo: `probe-cf5.red.log`, `probe-cf5.green.log`, `regress.summary`; full logs `/tmp/cf5-logs/`.

**Probe: RED 11/22 on the untouched src (16:20 UTC) → GREEN 22/22 (16:23 UTC, and again 22/22 inside the regression run).**
Every finding has ≥ 1 check that was ❌ before the fix; controls and CLEAN were ✅ both times (5 throwaway tenants, 0 rows left each run).

## Per finding

### F5 · at-risk `PIPELINE_LATE_MONTH` flipped at 07:00 Thai. Fixed.
- **Where.** `src/lib/modules/crm/ai-bridges.ts:209,220`. Was `expectedCloseAt.getTime() <= now + 7 d` (instant). Now
  `dealDayKey(expectedCloseAt) <= thaiDayKey(now + 7 d)`: the Thai day of the close date is at most Thai today + 7. Same helpers as the
  fix3a CLOSE_OVERDUE rule (`dayKey` of deals-shared for the stored UTC-midnight-of-the-Thai-day, `thaiDayKey` for "now").
- **Semantics.** Day + 7 is now inside for the whole Thai day (before: only from 07:00). Past close dates stay inside (unchanged `≤`).
- **Probe.** `F5-fixed-clock` ❌→✅ (8 Oct deal at 00:30/06:59 Thai was "-", now LATE at all four times; 9 Oct never; COMMIT control never) ·
  `F5-next-day-00:30` ❌→✅ · `F5-no-instant-compare` ❌→✅.

### H2b-4 · `custom.record.field_due` on a DATETIME field fired one Thai day early. Fixed.
- **Where.** `src/lib/modules/crm/automation.ts:1712-1718` (window) and `:1735` (dedupe key).
- **Fix.** The window is built from Thai day starts (`thaiDayStart(thaiYmd(…))`, exactly as `crm.deal.close_due` does). This is correct for
  both field types, so no type lookup is needed: a DATE value is stored at 00:00 UTC = 07:00 Thai of its calendar day, which lies inside the
  same Thai day, so DATE results are unchanged. The dedupe key uses `thaiYmd(valueDate)`; for DATE values that is the same string as the
  old UTC slice, so existing DATE keys do not change.
- **Probe** (dry run and a real `runCronTriggers`, now = 10:00 Thai 1 Oct):
  - `H24-datetime-d7` ❌→✅: before, `dt9mid` (9 Oct 00:30 Thai, 8 Thai days away) matched; now it does not. `dt8mid`/`dt8eve` match both times.
  - `H24-datetime-d0` ❌→✅: before, "on the day" matched tomorrow 00:30 and missed today 03:00; now the reverse.
  - `H24-cron-keys` ❌→✅: before, `dt8mid` keyed `#2026-10-07` and `dt9mid` FIRED; now both DATETIME on `#2026-10-08`, `dt9mid` none, the DATE
    key keeps its exact old format `custom.record.field_due#contract.dueOn#7#<rec>#2026-10-08`.
  - `H24-date-unchanged` ✅→✅ (control).
- **Transition (CRM v2 only, hidden on prod).** A DATETIME value at 00:00–06:59 Thai that already fired early under the old UTC-date key can
  fire once more under the new Thai-day key if it is still inside the catch-up window when this ships. Not handled.

### H2b-5 · portal showed DATETIME custom values as a bare UTC date. Fixed.
- **Where.** `src/lib/modules/crm/portal.ts:814-824` (`valueText` takes the field type) and `:855` (`getRecord` passes `f.type`).
- **Fix.** DATETIME is formatted with `toLocaleString("th-TH", …, timeZone "Asia/Bangkok")` using the same options as the staff record page
  (`thaiDateTimeText` in `components/crm/objects/types.ts`), so the portal and staff show the same text, e.g. "9 ต.ค. 2569 00:30". The options
  are inlined instead of imported so that lib does not import from components. DATE is unchanged (UTC slice `YYYY-MM-DD`).
- **Probe.** `H25-datetime-thai` ❌→✅ (was "2026-10-08" for 9 Oct 00:30 Thai; now equal to the staff page text for both 00:30 and 09:30) ·
  `H25-date-unchanged` ✅→✅.

### R2b-3 · contact/company timeline showed forged inbound mail as a plain EMAIL activity. Fixed, no schema change.
- **Data.** Already stored: the system EMAIL activity has `source = EMAIL`, `direction = IN`, `sourceRef = CrmEmailMessage.id`, and fix2 keeps the
  flag on that message's `routing` (`unverifiedFrom` / `unverifiedShopFrom`). No migration needed.
- **Where.**
  - `src/lib/modules/crm/emails-shared.ts:504-511`: `emailRoutingUnverified(routing)` is the single reader. The thread DTO now uses it
    (`emails.ts:2868`, same truth table as before). The thread *list* SQL still reads the same two keys in SQL.
  - `src/lib/modules/crm/activities.ts:859-880` (`enrich`): one extra query over the page's inbound EMAIL rows (`tenantId`/`systemId` of the
    viewer's CRM system, `id in sourceRefs`). Flagged rows get `unverifiedFrom: true`. Only a boolean is returned, and only for rows the viewer
    already sees through `activityWhere`.
  - `src/lib/modules/crm/activities-shared.ts:227` `ActivityListItem.unverifiedFrom?: true` (optional; absent = nothing to warn about).
  - `src/app/app/sys/[id]/crm/activities/_components/ActivityItems.tsx:91-96`: the badge "ไม่ยืนยันผู้ส่ง" next to the title. Same span,
    classes and tooltip as `EmailThread.tsx` / `EmailInbox.tsx`. It is not interactive, so no button-registry row.
  - Covered surfaces: every `CrmActivityBlock` (contact, company, deal, record pages) and the activities page, because they all go through
    `listActivities` → `enrich`. The REST/AI activity list passes the field through.
- **Probe.**
  - `R23-premise` ✅ (positive control: the forged mail is stored flagged, the A-R-authenticated one is not).
  - `R23-dto` ❌→✅ (forged row `unverifiedFrom` undefined→true; the authenticated row stays undefined).
  - `R23-render` ❌→✅: the real `ActivityRow` is rendered with `react-dom/server` and a stub app router. The forged row has the badge; the
    authenticated row does not.

### F4 · webhook guard failed closed only when the registry was EMPTY. Fixed (per family), duplicate prefix list removed.
- **Single source.** `src/lib/webhooks/labels.ts:123-132` `WEBHOOK_GUARDED_FAMILIES = { crm: ["crm.", "custom.record.", "team."] }` (platform
  file, imports no module). CRM derives from it: `modules/crm/api/webhook-events.ts:12` `CRM_EVENT_PREFIXES = WEBHOOK_GUARDED_FAMILIES.crm`
  (same object, same tuple type). There is no cycle: CRM already imported `@/lib/webhooks/labels`, and the service imports only `./labels`.
- **Service** (`src/lib/webhooks/service.ts`):
  - `:379`: `registerWebhookEventGuard(family: WebhookGuardedFamily, …)`. The name is now the family it guards, and the type forces this.
  - `:422-425`: `webhookGuardedFamiliesOf(events)`: `[]` (all events) means every family; otherwise the families whose prefixes match.
  - `:434`: after loading the composition root, if any touched family has no guard registered **under its name** ⇒ `WebhookGuardError(WEBHOOK_GUARDS_MISSING)`
    before any guard runs.
  - `WEBHOOK_GUARDED_EVENT_PREFIXES` is kept as a derived value (`Object.values(…).flat()`), not a copy, for its existing reader (probe-cf3 R22).
  - `src/lib/webhook-guards.ts` header documents the rule; it still registers `"crm"`.
- **No fitness check added.** It is not needed because no duplicate list is left. `F4-one-prefix-list` asserts: 0 literal lists in service.ts,
  0 in the CRM file, 1 in labels.ts, and `CRM_EVENT_PREFIXES === WEBHOOK_GUARDED_FAMILIES.crm`.
- **Probe** (child process, composition root replaced by an empty module, then one guard registered by the child):
  - `F4-other-guard-only-fails-closed` ❌→✅: with only a "member" guard, toggle-on of an all-events endpoint, set `[]` / crm / custom.record /
    team / member+crm, and create `[]` were all accepted before; all are now refused with the Thai message, and no row is created.
  - `F4-other-guard-others-pass` ✅→✅: toggle-off, `member.created`, and the author-less call are allowed.
  - `F4-crm-guard-present-passes` ✅→✅ (positive control: with a guard under "crm", every CRM write passes; the guard ran 8×).
  - `F4-no-cycle` ✅.
  - probe-cf3 R22-* (empty registry, root loaded by the service, prefixes in sync, all 13+ doors pass `by`) stays green.

## Verification (`regress.summary`, 16:25–16:47 UTC, each job via `scripts/iso.sh` + gate lock, one at a time)
| job | result |
|---|---|
| probe-cf5 | 22/22 |
| probe-cf3 (fix3a) | 27/27 |
| qc-webhook | 15/15 |
| qc-account-api-webhooks | 22/22 |
| qc-crm-c1.10 (CRM webhooks/REST) | 66/66 |
| qc-crm-c2.1 (automation) | 83/84 — only ❌ C2.1-S6.2 = child `qc-member-m3.3` crashes `M3.3-ERR "Cannot read properties of null (reading 'role')"` (needs the member seed). **Identical at 7d5dc93f**: my 12 src files reset to 7d5dc93f, m3.3 run alone ⇒ same M3.3-ERR (`/tmp/cf5-logs/m3.3-base.log` vs `m3.3-fix.log`), files restored (sha256 12/12 OK) |
| qc-crm-c2.5 (email) | 105/105 |
| qc-crm-c1.6 (activities) | 79/79 |
| qc-crm-c3.4 (AI bridges) | 53/53 |
| probe-cf2 (QC3) | 36/36 |
| qc-crm-c3.5 portal (QC3) | 67/67 |
| qc-crm-c3.8 (QC3) | 30/31. The only ❌ is C3.8-S7.1, skill parity: `.claude/skills/shark-crm-api/SKILL.md=false`. The gitignored skill is absent from this worktree, so this is the environment, not src. |
| docs-crm | ✅ CRM-API.md matches the registry (123 op), not regenerated |
| docs-account | ✅ (199 op) |
| docs-member, docs-kanban | ❌ gitignored `.claude/skills/shark-{member,kanban}-api/references/endpoints.md` is missing (0 bytes on disk). Same result in the fix3a run (`/tmp/cf3-logs/regress/`). Nothing I touched feeds these docs, and I did not create the gitignored files. |
| `pnpm typecheck` | exit 0 |
| fitness (QC2 env / no env) | 36/36 · 36/36 |

## ORACLE-EDITs
None. No suite pins a hash of a file I changed. Every suite that reads these files was green or failed only for the environmental reasons above.

## Not verified
- No browser render of the timeline badge or of the portal record page. The row was rendered server-side only (`R23-render`).
- The portal "ขอแก้ข้อมูล" box seeds its input with the displayed value. For an editable DATETIME field, that seed is now "9 ต.ค. 2569 00:30",
  which the ISO validator rejects with its Thai example. Before, the seed was "2026-10-08", which the validator also rejected. I did not
  change the edit flow.
- The H2b-4 transition double-fire (above) is not tested.
- AI tool output was not checked separately; the activity items pass through unchanged.
- No QC1 runs, no `next build`.

## Out of scope (left as debt per the card)
Stale tab keys (R2b-5), flood cost (R2b-6), sub-domain mail (R2b-4), hashtext. These are not taken.

---

# Round 2 (review 5e90b492: RV-1 MED, RV-5 INFO) · builder · 2026-10-01 17:00–17:48 UTC

Probe `scripts/pending/cf5/probe-cf5-r2.mts` (QC2, own tenants `qc-cf5-q-*`, swept).
- RED at 17:23 UTC with the r2 src set aside (restored byte-for-byte, sha256 11/11): **4/13** (`probe-cf5-r2.red.log`).
- GREEN **14/14** in the regression run (`probe-cf5-r2.green.log`). One check was added after RED: `RV1-activity-block-note`, see below.
- Runner `scripts/pending/cf5/run-cf5-r2.sh` · summary `regress-r2.summary`.

Not taken, per the controller: RV-2 (no legacy-key bridge, registered as a pre-launch check) and RV-3 (contacts `displayOf` UTC text, registered as debt).

## RV-1 · the contact 360 "🕒 ไทม์ไลน์" and company 360 "ไทม์ไลน์รวม" cards now carry the flag. Fixed.
- **Shared helper.** New leaf `src/lib/modules/crm/email-flags.ts` (imports only `./db` + `./emails-shared`). Putting the helper in `activities.ts` was not
  possible: `activities` already imports `companies`, so `companies → activities` would create an import cycle.
  - `isInboundEmailActivity(row)`: `type EMAIL ∧ source EMAIL ∧ direction IN ∧ sourceRef`.
  - `unverifiedEmailRefs(ctx, rows)`: one `crmEmailMessage.findMany` scoped by `tenantId + systemId` over the page's inbound EMAIL rows, read
    through the single reader `emailRoutingUnverified`. It returns the **activity ids** to flag.
- **360 builders.** `contacts.ts:1466-1474` (`getContact360In`) and `companies.ts:1294-1304` (`getCompany360`) call the helper once each, with no N+1.
  The flagged items get `unverifiedFrom: true` (optional field). Types: `contacts-shared.ts` `Contact360TimelineItem`,
  `companies-shared.ts` `CompanyTimelineItem`.
- **Pages.** `contacts/[contactId]/page.tsx` and `companies/[companyId]/page.tsx` render the same amber "ไม่ยืนยันผู้ส่ง" span, with the same tooltip,
  under the title.
- **REST.** `contacts.get` (`GET /contacts/{id}`) and `companies.get` (`GET /companies/{id}`) return the 360 objects, so they carry the flag.
  - Their summaries, and the `activities.list` summary, now explain `unverifiedFrom`.
  - `docs/api/CRM-API.md` was regenerated (6 lines), and `--check` is green (123 op).
  - The generator also writes the gitignored `.claude/skills/shark-crm-api/references/endpoints.md`. That directory did not exist in this worktree, so I
    removed it again.
- **Round-1 hardening found by the new probe.**
  - `activities.enrich` flagged any row whose `sourceRef` equalled a flagged mail id. A NOTE logged with that sourceRef (e.g. via REST `sourceRef`) was
    flagged too.
  - Now only the inbound EMAIL row is flagged (`activities.ts:880` uses `isInboundEmailActivity`).
  - The query text in `activities.ts` is unchanged, so the reviewer's pinned `R23r-one-query` stays green.
- **Other timeline builders checked.**
  - Deal 360 (`deals.ts:2148`) lists `dealId` activities, and inbound mail activities are written with `dealId: null` (`emails.ts:2571`).
  - The custom-record timeline (`objects.timelineFor`) lists `customRecordId` rows, which inbound mail never has.
  - Mobile `todayTasks` lists the user's own tasks. `dealDetail` is deal-scoped.
  - So there is no other surface. Not a timeline, and not changed: the AI assist briefs (`ai-bridges.ts:324,352`) pass contact/company activity titles
    to the model without the flag.
- **Probe ids.**
  - Went red → green: `RV1-contact-360`, `RV1-company-360`, `RV1-rest`, `RV1-pages-render`, `RV1-one-reader`.
  - `RV1-premise` ✅→✅.
  - `RV1-activity-block-note` was added after the RED run; it was red on the first green attempt and is fixed by the hardening above.
  - The reviewer's `R23r-360-timeline` is green: rv-cf5 **32/32**.
- **Note for REST users.** An API key without `crm.activity.read` sees an empty 360 timeline. This is unchanged behaviour; the probe key needed that scope.

## RV-5 · authored webhook writes trim event names and refuse unknown ones. Done (fits cleanly).
- **Where.** `src/lib/webhooks/service.ts:431-452`, used by `createEndpoint` (`:494-496`) and `setEndpointEvents` (`:527-529`).
- **Behaviour when an author (`by`) is given**, which is every `src/` door:
  1. Names are trimmed and de-duplicated.
  2. The family guard then runs. Its message wins, so fail-closed behaviour and the guard's 403 are unchanged.
  3. Any name that is not exactly in `WEBHOOK_EVENTS` is then refused with `WebhookEventNameError` (status 422, Thai message). REST `mapError` honours the
     declared status.
- **Why after the guard.** probe-cf3 `R22-empty-registry-fails-closed` and the reviewer's `F4r-wrong-name-fails-closed` expect the
  "ยังไม่พร้อม" refusal for non-existent CRM names, e.g. `team.member.added` and `crm.nope.unknown`.
- **Author-less script calls are byte-for-byte unchanged.** `qc-member-fix-s4` stores a made-up probe event this way.
- **Doors already validate before the service** (account REST 422, member REST list, CRM settings check, platform filter), so no UI/REST behaviour changes.
- **Own probe change.** `guard-child.mts` used the non-existent `team.member.added` in the guard-present control. It now uses the real `team.updated`.
- **Probe.** `RV5-trimmed`, `RV5-unknown-refused`, `RV5-create`, `RV5-guard-first`: ❌→✅. `RV5-authorless-unchanged`: ✅→✅.

## Round 2 verification (`regress-r2.summary`, 17:26–17:48 UTC)
| job | result |
|---|---|
| probe-cf5 | 22/22 |
| probe-cf5-r2 | 14/14 |
| reviewer rv-cf5 | **32/32** |
| probe-cf3 | 27/27 |
| qc-webhook | 15/15 |
| qc-account-api-webhooks | 22/22 |
| qc-crm-c1.10 | 66/66 |
| qc-crm-c1.6 | 79/79 |
| qc-crm-c3.4 | 53/53 |
| qc-crm-c1.3 (company 360) | 89/89 |
| qc-crm-c1.4 (contact 360) | 110/110 |
| qc-crm-c2.1 | 83/84. The only ❌ is S6.2, the child `qc-member-m3.3` `M3.3-ERR` (no member seed on QC2). It is identical at 7d5dc93f (round 1 proof). |
| docs-crm | ✅ after the regeneration |
| docs-account | ✅ |
| docs-member, docs-kanban | ❌ Only because the gitignored skill `endpoints.md` is missing from this worktree, as in round 1. |
| typecheck | exit 0 |
| fitness (QC2 env / no env) | 36/36 · 36/36 |

ORACLE-EDITs: none. The reviewer's files were not edited.

**Not run.**
- `qc-crm-c51fix-equiv`: it needs an old/new two-tree compare run.
- `qc-crm-perf`: it is a perf budget suite.
- No browser render of the two 360 cards. The pages are covered by a source check (`RV1-pages-render`) plus the data checks.

## Controller merge gate record (main tree, 2026-10-01 18:38 UTC)

Patch `scripts/pending/c55merge/fix3b.patch` (= wip/crm-cf5 `7d5dc93f..87231b2f`) applied with `patch -p1 --fuzz=3` on session/crm after fix4. Only `src/lib/modules/crm/emails.ts` differs from the worktree (fix4's 1 MB cap); changed lines identical (md5 of +/- lines).
Independent review: 2 rounds, MERGEABLE (`crm-C5.5-fix3b-review.md`); R2-1/R2-2 LOW in the C6 register.
Gate unit `crm-main-fix3b` (`scripts/pending/run-main-fix3b.sh`, log `.qc-shots/crm/main-fix3b.log`): all 24 steps exit 0 — typecheck, gen-crm-docs, docs ×4, fitness ×2, QC2: probe-cf5, probe-cf5-r2, rv-cf5, rv-cf5-r2, probe-cf3, qc-webhook, account-api-webhooks, c1.10, c1.3, c1.4, c1.6, c3.4; QC3: probe-cf2, c3.5, c3.8, c2.5.
Not done: browser render of the badges / portal page; `next build`.

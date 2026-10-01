# C5.5-fix3b — independent review (F5 · H2b-4 · H2b-5 · R2b-3 · F4)

Branch `wip/crm-cf5` · tip `96383b12` on base `7d5dc93f` · worktree `/root/projects/shark-crm-cd2` · QC2 only (QC3 is another lane's; the
QC3-pinned suites probe-cf2 / c3.5 / c3.8 were NOT re-run). Review window 16:49–17:18 UTC (`date -u`).
Own probe `scripts/pending/cf5/review/rv-cf5.mts` (+ child `rv-guard-child.mts`, runner `run-rv.sh`), logs `/tmp/cf5-rv-logs/`.

## Summary
The five fixes do what the builder note says, and none of the edge cases I tried broke them. One claim is overstated: R2b-3 is
fixed on the activity block only. The contact page's "🕒 ไทม์ไลน์" card and the company page's "ไทม์ไลน์รวม" card list the same forged
mail with no badge. That is the surface the finding named. No BLOCKER and no HIGH.

## Findings

### RV-1 · MED · R2b-3 is fixed on the activity block only; the 360 "timeline" cards still show forged mail without a flag
- **Where.** `src/lib/modules/crm/contacts.ts:1426,1463` (`getContact360` → `timeline` = `{id, at, type, title, source, done}`). The page renders it
  as `data-testid="contact-360-timeline"` (`src/app/app/sys/[id]/crm/contacts/[contactId]/page.tsx:349`). Same for
  `src/lib/modules/crm/companies.ts:1292` (`getCompany360().timeline`) → `companies/[companyId]/page.tsx:232` "ไทม์ไลน์รวม". Both are also returned
  by REST `contacts.get360` / `companies.get360` (`api/ops/contacts.ts:121`, `api/ops/companies.ts:69`).
- **Repro.** `rv-cf5` **R23r-360-timeline** ❌: forged inbound mail → `getContact360().timeline` row
  `{"type":"EMAIL","title":"ปลอม …","source":"EMAIL","done":true}`, with no flag field. On the same page, the `CrmActivityBlock` row for the same mail
  has the badge (R23r-scope ✅). So the mail shows twice: once flagged and once plain.
- **Why MED and not lower.** The finding text was "the contact or company timeline shows forged mail as a plain EMAIL activity". The card
  titled "ไทม์ไลน์" is still that. The builder note claims "Covered surfaces: every CrmActivityBlock (contact, company, …)" and does not
  mention these two lists. It is not a regression, and the original finding was LOW.
- **Fix.** Put the same lookup in the two 360 builders, as a shared helper next to `enrich`:
  `unverifiedEmailRefs(ctx, rows) → Set<sourceRef>`. Add `unverifiedFrom?: true` to the timeline item types and render the same span in
  both cards. Alternatively, drop the two cards' EMAIL rows in favour of the activity block. That is a product decision.

### RV-2 · LOW · H2b-4 transition: a DATETIME value at 00:00–06:59 Thai that already fired under the old key fires once more
- **Repro.** `rv-cf5` **INFO-H24r-transition**. A run with the old-format key `…#2026-10-08` for a value at TH 9 Oct 00:30 makes the next cron
  day create a second main run `…#2026-10-09`. That is 2 runs in total, which confirms the builder's admitted limitation. A DATE value does
  not re-fire across 3 cron days: **H24r-date-no-refire** ✅ = 1 run.
- **Severity.** Hunt 2b states that the CRM v2 surfaces are hidden on prod, and `runCronTriggers` only walks `v2SystemIds`. If no prod system
  has `uiVersion 2`, there is no run to duplicate. I did not query prod.
- **Cheap bridge, if wanted.** This is about 10 lines. Only DATETIME values whose `toISOString().slice(0,10) !== thaiYmd(value)` qualify,
  i.e. 00:00–06:59 Thai. For those, give the candidate a `legacyKey`. The runner then skips it if an `AutomationRun` with
  `(ruleId, eventKey = legacyKey)` exists, using the index the dedupe already uses. Exposure ends about 8 days after deploy (the catch-up
  window plus one day), so the bridge can be removed then.
- **Alternative.** Before deploy, the controller runs one read-only check on prod:
  `count(*) of AutomationRun where eventKey like 'custom.record.field_due#%'`. If it is 0, accept without a bridge.

### RV-3 · LOW (pre-existing, same class as H2b-5, out of scope) · contact 360 custom-field DATETIME is shown in UTC
- `src/lib/modules/crm/contacts.ts:1385` `displayOf`: `value.slice(0, 16).replace("T", " ")` on the UTC ISO string. A value at TH 9 Oct 00:30
  shows as "2026-10-08 17:30" in the contact page's custom sections. The same function feeds the export (`:2514`).
- So "the portal now shows the same text as the staff page" is true for the custom-record page (`displayValue`), but not for this
  staff surface. Register it as debt.

### RV-4 · INFO · portal edit box for DATETIME: no regression (verified), still unusable without typing ISO
- **Repro.** `rv-cf5` **H25r-edit-flow** ✅ (ADMIN portal role, editable DATETIME):
  - the new seed "9 ต.ค. 2569 00:00" → refused (ISO message);
  - the old seed "2026-10-08" → **also refused** (`ISO_RE` needs a time part, `member/fields.ts:165`);
  - a typed ISO `2026-10-09T09:30:00+07:00` → request created;
  - the DATE seed "2026-10-09" → request created (unchanged).
- Nothing that worked before is broken. Seeding the box with an ISO `+07:00` string for DATETIME, or using a datetime-local input, would make it
  usable. That is UX debt.
- The portal REST lane `records.get` (`api/portal-lane.ts:149`) now returns Thai text for DATETIME `value`. That field was already display text
  (booleans as "ใช่/ไม่ใช่", options joined), so this is not a contract break.

### RV-5 · INFO · F4: event-name variants dodge the family check but can never receive anything
- With the real composition root, a v2 shop and no actor:
  - `[" crm.deal.won"]`, `["CRM.deal.won"]` and `["\tcrm.deal.won"]` are **stored**;
  - `["crm.deal.won "]` (trailing space) is refused, because it still has the prefix;
  - `[crm.deal.won]` and "events omitted" are refused (**F4r-real-root-refuses** ✅).
- `dispatchWebhooks("crm.deal.won")` delivered **0** to the stored variants (**F4r-variants-never-delivered** ✅), because dispatch matches with
  `ev.includes(type)` exactly. There is no leak, only dead rows.
- Optional hygiene: trim and validate events against `WEBHOOK_EVENTS` in `createEndpoint` / `setEndpointEvents`.

### RV-6 · INFO · the two non-green builder suites are environment
- **c2.1 S6.2.** The child `qc-member-m3.3` dies at `scripts/qc-member-m3.3.mts:66`, where `membership.findFirst(...)!` reads `.role` of null. The
  suite needs the member seed's users, and QC2 does not have them. The builder's base and fix logs are identical
  (`/tmp/cf5-logs/m3.3-base.log` / `m3.3-fix.log`), and m3.3 is member-journey code that no changed file touches. My own c2.1 run: see the table.
- **c3.8 S7.1.** It checks `.claude/skills/shark-crm-api/SKILL.md`. `.claude/` is gitignored (`.gitignore:43`), and this worktree has only
  `.claude/skills/shark-account-api`. `docs-crm` is green (123 op), so the registry the skill mirrors is unchanged. This is environment. Not re-run (QC3).

## Claims checked and holding
- **F5.**
  - `thaiDayKey(now+7d)` and `thaiToday(now)` agree with ICU `Asia/Bangkok` for 5000 random instants (2024–2030) and for every Thai
    midnight ±1 ms of 2027–2028, leap day included: 0 mismatches (**F5r-pure-oracle**).
  - DB checks: deals on 24 Dec / 31 Dec / 1 Jan / 2 Jan at TH 24 Dec 23:59:59.999, 25 Dec 00:00, 31 Dec 23:59:59.999 and 1 Jan 00:00
    (`month=2027-01`). Both `PIPELINE_LATE_MONTH` and `CLOSE_OVERDUE` match the ICU oracle and the DealBoard rule (`expectedCloseAt < thaiToday()`)
    in all 16 cells (**F5r-boundaries-rollover**). Stored shape is UTC midnight (**F5r-stored-shape**). A null close date is not listed
    (**F5r-null-close**).
- **H2b-4.**
  - DATE key byte-for-byte: the old (UTC slice) and new (`thaiYmd`) keys differ for **0** of the engine-stored days 1900–2100
    (**H24r-date-key-pure**).
  - A real cron key for a DATE value written through `member.fields.setFieldValues` equals the old formula byte-for-byte
    (**H24r-date-key-bytes**).
  - Engine storage shape is confirmed (DATE 00:00Z, DATETIME instant — **H24r-engine-shape**).
  - Field type cannot change once values exist (`member/fields.ts:1243,1246`), so a DATE field never holds non-midnight instants.
  - Window edges (d=7 at TH 1 Oct 10:00): TH 8 Oct 00:00:00.000 and 23:59:59.999 are in; TH 9 Oct 00:00:00.000 is out; the catch-up floor TH
    1 Oct 00:00 is in and TH 30 Sep 23:59:59.999 is out (**H24r-d7-edges**).
  - d=0 at the last ms of TH 1 Oct / first ms of TH 2 Oct (**H24r-d0-edges**); year rollover (**H24r-year-rollover**); DATETIME keys carry the
    Thai day (**H24r-datetime-keys**).
  - `daysBefore` is validated 0–365 (`automation.ts:244`), so negative windows cannot occur.
- **H2b-5.** Portal text equals the staff record page's `displayValue` at 00:00, 23:59:59.999, 12:00 (24 h, not "12:00 AM") and across the
  year (Buddhist 2569→2570, "ม.ค."/"ต.ค.") — **H25r-equal-staff**. The options are identical to `components/crm/objects/types.ts:41`, and the
  staff record page renders server-side with the same ICU.
- **R2b-3.**
  - The extra query is one batched `findMany` per page, scoped `tenantId + systemId` (**R23r-one-query**).
  - A row whose `sourceRef` points at a flagged mail of another CRM system in the same tenant, or of another tenant, gets no flag
    (**R23r-scope**).
  - Only rows already passing `activityWhere` are enriched, and the result is a boolean.
  - CRM email has no per-thread privacy beyond the CRM visibility the activity already passed, and the subject is already the row title. No
    leak.
  - `source = EMAIL` cannot be set through `logActivity` (MANUAL only), so the flag cannot be forged onto a manual row.
  - The REST `activities.list` passes items through. The field is optional, so no consumer crashes.
  - `emails-shared.ts` imports are unchanged (sanitize, inbound-address, activities-shared), so it stays client-safe (**R23r-client-safe**).
- **F4.**
  - A guard registered under the wrong name ("CRM", via plain JS) fails closed for `[]`, `crm.*`, unknown `crm.*`, toggle-on and
    `member + team`, with 0 guard runs (**F4r-wrong-name-fails-closed**). Guards under both "member" and "crm" all run and pass
    (**F4r-crm-plus-other**).
  - A non-array `eventsJson` reads as `[]`, so it is guarded, consistent with dispatch.
  - The only registration is `webhook-guards.ts:10` "crm" (**F4r-single-registrar**).
  - There are no `webhookEndpoint.create/update` writes outside `service.ts`. All 15 writer calls in src pass `by`: account / member UI+REST,
    platform page, CRM page.
  - `labels.ts` imports only `automation/labels`, which imports nothing, so it is client-safe and the platform imports no module
    (**F4r-labels-client-safe**).
  - The builder's child probe was re-run inside probe-cf5.

## What I ran (QC2, each job `scripts/iso.sh` + gate lock, one at a time — `scripts/pending/cf5/review/run-rv.sh`)
Window 17:00:38–17:17:11 UTC (`regress.summary` in the review dir; full logs `/tmp/cf5-rv-logs/regress/`). The development runs of
`rv-cf5` at 16:58 and 17:00 differ from the final run only by a probe bug in the DATE leg of H25r-edit-flow, which is fixed.

| job | result |
|---|---|
| rv-cf5 (this review) | 31/32. The only ❌ is R23r-360-timeline = RV-1. All 6 throwaway tenants were swept to 0 rows, and `ChatRateBucket` keys were deleted |
| probe-cf5 (builder, re-run) | 22/22 |
| probe-cf3 (fix3a) | 27/27 |
| qc-webhook | 15/15 |
| qc-crm-c1.10 | 66/66 |
| qc-crm-c1.6 | 79/79 |
| qc-crm-c2.1 | 83/84. The only ❌ is S6.2 = child m3.3 `M3.3-ERR` (seed-missing env, RV-6), identical to the builder's run |
| qc-crm-c3.4 | 53/53 |
| `pnpm typecheck` | exit 0 (347 s) |
| fitness (QC2 env / no env) | 36/36 · 36/36 |

## Not verified
- QC3-pinned suites (probe-cf2, qc-crm-c3.5, qc-crm-c3.8): not run, because QC3 belongs to another lane. I judged c3.8 S7.1 from the code and
  the builder log only.
- No browser render of the badge or the portal page. No `next build`. Prod was not queried (RV-2 pre-deploy count).
- A STAFF author with partial CRM visibility through the real guard: not re-probed. It is covered by qc-crm-c1.10 / probe-cf3 in my run.

RV-1 (MED) is an incomplete fix of a LOW should-fix, not a regression. Fix it on this branch or register it as a follow-up card with RV-2
(pre-deploy prod count or legacy-key bridge) and RV-3. Nothing else blocks.

VERDICT: MERGEABLE

---

# Round 2 — re-review of `ac1bd09d` (diff `5e90b492..ac1bd09d`)

Round-2 review ran 17:49–18:13 UTC (`date -u`). New probe `scripts/pending/cf5/review/rv-cf5-r2.mts` (round-1 files untouched), runner
`run-rv-r2.sh`, summary `regress-r2.summary`, full logs `/tmp/cf5-rv-logs/regress-r2/`.

## Summary
- RV-1 is closed. The contact 360 card, the company 360 card, REST `contacts.get` / `companies.get` and the activity block all carry
  `unverifiedFrom` on the forged inbound row only.
- The new "only the inbound EMAIL row" rule holds for every decoy and path I tried.
- RV-5 does not break any existing door; it is a backstop behind doors that already validate.
- Two LOWs remain, neither introduced by this card: the AI brief has no flag (R2-2) and a manually attached mail is unflagged (R2-1, fix2 rule).

## Findings (round 2)

### R2-1 · LOW (pre-existing fix2 rule, not introduced here) · forged mail from a not-yet-known address stays unflagged after "attach to contact"
- **Where.** `emails.ts:2502`: `unverifiedFrom = IN ∧ !fromProof ∧ (contact ∨ companyId)`. Mail that matches no contact or company is stored without the
  flag. `attachToContact` (`emails.ts:2892-2915`) later writes an EMAIL/IN activity for it but never sets the flag.
- **Effect.** No badge anywhere for that mail: thread, inbox, activity block or 360 cards.
- **Repro.** `INFO-R2-attach-path`: an unknown-sender mail is stored with `contactId=null`, flag `undefined` → attached → 360 flag `undefined`.
- **Fix (debt).** Record "From not proven" for every inbound mail at ingest, e.g. `routing.unverifiedFrom` whenever `IN ∧ !fromProof`. The outbox
  anonymity for unmatched mail already holds, so nothing else changes. Alternatively, keep the proof bit in `routing` so that `attachToContact`
  can raise the flag.

### R2-2 · LOW · AI assist briefs pass forged-mail subjects to the model without the flag
- **Where.** `ai-bridges.ts:324` (`contactFacts`) and `:352` (`companyFacts`). They select `type/title/startAt/dueAt[/doneAt]` and write
  `- EMAIL <day> <subject>` into the prompt. The same holds for the deal brief activity lines.
- **Severity: LOW.**
  - The output is a draft or summary for staff, not an action.
  - Every staff list that shows the row now shows the badge.
  - Subjects of any inbound mail were already attacker-controlled prompt text before this card, so that is not new.
  - The residual risk: a summary like "the customer asked to change the bank account" read without the badge.
- **Fix (cheap).** Add `source/direction/sourceRef/id` to the two selects. Call `unverifiedEmailRefs(scope, acts)` (one query) and append
  `(sender not verified)` to flagged lines. Register as debt, or take it with R2-1.

### R2-3 · INFO · RV-5 (422 for unknown event names) is a backstop; no door regresses
- **Doors already validate first.**
  - Platform create/edit filter the selection to `WEBHOOK_EVENTS` (`webhooks/actions.ts:68,118`).
  - Account UI filters to `account.*`; account REST returns its own 422 (`EVENT_VALUES`).
  - Member UI/REST use `memberWebhookEventsCheck`; CRM uses `crmWebhookEventsCheck`.
  - So from `src/` the service 422 is reachable only by a door that forgets to validate.
- **Existing rows that store a now-invalid name** (`RV5r-existing-invalid-row` ✅):
  - enable, disable and delete still work, because `setEndpointActive` does not check names;
  - re-saving the same stale list is refused with 422;
  - saving known names works.
  - The UI edit path drops unknown names silently (pre-existing filter), so a shop is never stuck.
- **Behaviour checks.**
  - Trimming and de-duplication work; `[]` means all events (`RV5r-trim-empty` ✅).
  - Unknown or wrong-case names give 422 and no row is written (`RV5r-unknown-422` ✅).
  - The guard runs first: an unknown CRM name from a refused author gets the guard's 403, not 422 (`RV5r-guard-first` ✅).
  - Author-less calls stay byte-for-byte unchanged, and 0 of the 15 `src/` call sites lack an author (`RV5r-authorless` ✅).
- **Note.** `["  ", ""]` from an authored caller becomes `[]` = all events. This is pre-existing; the guard runs on `[]`, so it is guarded.

### R2-4 · INFO · flag visibility, scoping and layering
- `email-flags.ts` is one batched `findMany` scoped by `tenantId + systemId`, and it imports only `./db` and `./emails-shared`. No `.tsx` imports it.
  The `*-shared.ts` type changes are type-only, so they stay client-safe (`R2-helper-shape`, `R2-not-in-client` ✅).
- The flag is returned only on rows that already passed `activityWhere`, and the subject is already the row title. A REST key without
  `crm.activity.read` gets an empty timeline (unchanged). So the flag adds one bit (sender not authenticated) to a row the viewer already sees.
  No cross-tenant or cross-system leak: the `cross` decoy pointing at another system's flagged mail is unflagged on all three surfaces.
- **The "only inbound EMAIL" rule cannot miss a legitimate row.** A flagged mail is always `direction IN`, because an unproven sender never
  becomes `OUT` (`emails.ts:2419-2421`).
  - Decoys sharing the flagged `sourceRef` are unflagged on contact 360, company 360 and the activity block: a NOTE (MANUAL) and an EMAIL/OUT row
    (`R2-contact-360`, `R2-company-360`, `R2-activity-block` ✅).
  - The company roll-up via `companyId` is flagged.
  - After a contact merge (5 activities moved), the forged row is still flagged on the winner's 360 (`R2-merge` ✅).
  - Re-ingest is impossible: `messageId` is unique.
- **Docs.** `docs/api/CRM-API.md` was regenerated and `--check` is green. The gitignored `.claude/skills/shark-crm-api/references/endpoints.md` in
  the main checkout must be regenerated after merge (3 summaries changed), or C3.8-S7.1 will report a mismatch there.

## What I ran (round 2, QC2, each job `iso.sh` + gate lock, one at a time)
Window 17:53:28–18:11:27 UTC. My development run of `rv-cf5-r2` at 17:51 was red 13/16; all three reds came from one fact, which is now
recorded as `INFO-R2-attach-path` (R2-1).

| job | result |
|---|---|
| rv-cf5-r2 (this round) | 16/16. 2 throwaway tenants were swept to 0 rows, and `ChatRateBucket` keys were deleted |
| rv-cf5 (round 1) | **32/32**. `R23r-360-timeline` is now green |
| probe-cf5 / probe-cf5-r2 (builder) | 22/22 · 14/14 |
| probe-cf3 | 27/27 |
| qc-webhook · qc-account-api-webhooks | 15/15 · 22/22 |
| qc-crm-c1.10 · c1.3 (company 360) · c1.4 (contact 360) · c1.6 | 66/66 · 89/89 · 110/110 · 79/79 |
| docs-crm `--check` | ✅ 123 op (no gitignored file written) |
| `pnpm typecheck` | exit 0 |
| fitness (QC2 env / no env) | 36/36 · 36/36 |

## Not verified (round 2)
- QC3 suites (probe-cf2, c3.5, c3.8). No browser render of the two 360 cards. REST `contacts.get` with a real API key was not re-run; it is
  covered by the builder's `RV1-rest` and by `qc-crm-c1.10` / `c1.4` in my run. qc-crm-c2.1 was not re-run in round 2, because no automation file
  changed.

Round 2 leaves no BLOCKER, HIGH or MED. RV-1 is closed and RV-5 is safe. The two remaining LOWs (R2-1 pre-existing, R2-2 AI brief) and round 1's
RV-2 and RV-3 go to the debt register.

VERDICT: MERGEABLE

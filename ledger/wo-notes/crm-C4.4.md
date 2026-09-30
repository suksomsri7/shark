# wo-notes — C4.4 (user journeys US1–US10 end to end)

Worktree `/root/projects/shark-crm-c44` (detached at `18feaa84`). Controller = Fable. Phase 1 only (write + `--dry` +
typecheck); Phase 2 (real browser runs against a running QC server) is explicitly deferred to the controller per the
work order.

## Deliverables

1. `scripts/crm-journeys/lib.mts` (503 lines) — shared harness: live env resolution (no dependency on
   `scripts/crm-expected.json`), session minting (staff + portal), puppeteer bootstrap, `JourneyCtx` (plan/check/shot/
   own/loginStaff/newAnonPage), `deepEqual`, `drainQuiet` (outbox drain-until-quiet per house pattern in
   `scripts/qc-all.mts:260-261`), `runJourneyCli` (the `--journey`/`--dry`/`--clean` entry point), `cleanAll`.
2. `scripts/crm-journeys/US1.mts` … `US10.mts` — one module per story.
3. `scripts/visual-crm.mts` — one small additive block (7 lines) near the top:
   `if (argv.includes("--journey") || argv.includes("--clean")) { … delegate to runJourneyCli … }`. Nothing else in
   that 2200+ line file was touched — verified with `git diff` before finishing (see below).
4. `ledger/crm-briefs/crm-brief-C4.4.md` — the oracle-proposed contract: per story, steps/roles/DB assertions,
   DECISIONs (workarounds taken + product gaps found), 5 open questions for the controller.
5. This file.

## Per-story plan-step / check counts (see `crm-brief-C4.4.md` for what each check actually asserts)

| story | plan steps | `ctx.check` calls |
|---|---|---|
| US1 | 6 | 7 |
| US2 | 4 | 9 |
| US3 | 8 | 7 |
| US4 | 7 | 7 |
| US5 | 7 | 9 |
| US6 | 5 | 5 |
| US7 | 11 | 8 |
| US8 | 7 | 4 |
| US9 | 7 | 5 |
| US10 | 7 | 9 |

## `--dry` result (27 Sep, against QC2 via `.env.qc2`/`scripts/qc2.sh`)

```
env resolved: tenant=cmuipj7n10000j0kzcayijzad sys=cmuipmf7t0000jkkzm1jofg2w
  teams=cmuipmfkg000bjkkzjli0p0q2/cmuipmfma000fjkkzp5bbo94s
  pipelines=cmuipmfoj000ijkkzmzve3gm2/cmuipmfqu000ojkkz28yf5jbk
=== US1 … US10 (dry plan) === (all 10 print their full step plan)
JSON_SUMMARY {"total":11,"passed":11,"failures":0,"fatal":null}
```
Command: `bash scripts/iso.sh bash scripts/qc2.sh pnpm exec tsx scripts/visual-crm.mts --journey all --dry`.
The 11 checks are: 1 real (non-placeholder) live-resolved check in US2 (`US2-0`, pipeline stage shape) + 10 "dry
mode — skipped" placeholders (one per story). This proves env resolution + story-specific id/role/page resolution
against the live DB works with zero browser dependency, per the Phase 1 acceptance bar.

## Typecheck

`env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck` — **exit 0** (final run,
after fixing the issues below). Ran multiple times while writing; the two systematic error classes hit along the way
and how they were fixed:

1. **`TS5097`** — static `import type {...} from "./lib.mts"` isn't allowed under this tsconfig (mirrors the
   `AGENTS.md` warning "this is NOT the Next.js you know"). Fixed by switching every `US*.mts` to the same dynamic
   `await import("./lib.mts" as string)` pattern visual-crm.mts already uses for cross-`.mts` imports, typing `ctx`
   as `Any` (`type Any = any`, explicitly allowed for scripts per `crm-brief-COMMON.md`).
2. **`TS2554` (arg count on `ctx.check`)** — the original 5-arg `check(id, step, ok, expected, actual)` signature
   didn't match how the journeys actually called it (almost universally 4 args: `id, step, expected, actual`, with
   `ok` meant to be derived). Redesigned `check()` to take `(id, step, expected, actual)` and compute `ok` via a
   proper (key-order-insensitive) `deepEqual`. This surfaced a real bug class in the process: several checks had
   been written as `check(id, step, true, someDiagnosticObject)` — comparing a boolean literal against an unrelated
   object always evaluates false regardless of what actually happened. Went through every `ctx.check(` call by hand
   (`grep -n "ctx.check(" US*.mts`) and fixed each to compare boolean-vs-boolean or value-vs-value, moving diagnostic
   detail into the `step` string via template literals. Re-ran `--dry` after each fix batch until `passed === total`.

## Facts verified while researching (would have produced wrong assertions if skipped)

- QC2's checked-in `scripts/crm-expected.json` does **not** match QC2's actual tenant (verified by querying both) —
  this is exactly why `resolveEnv` resolves live instead of trusting that file. Documented in `crm-brief-C4.4.md`.
- `ConvertInput` has no `taxId`/role field (US2) — read `contacts-shared.ts:239-246` directly, not assumed from the
  blueprint prose.
- `CrmPipeline.stageOnQuoteAcceptedId` has no UI control anywhere (US3) — checked both `/settings/pipelines` and
  `/settings/stages` registry rows exhaustively before concluding this.
- `deal-owner-select` (US6) only sends `ownerUserId`, not `teamId`, even though `reassignDeal()` accepts both —
  checked `Deal360Actions.tsx:240-252` directly.
- `objects.ts` has no records-reader export (US8) — checked exported function list directly.
- `automation.ts:910`'s `CREATE_DEAL` action requires `s.contact` in the firing event's scope (US8) — found this
  while reading the action executor; did NOT trace far enough to know whether the `custom.record.field_due` trigger
  (company-scoped) populates it. Flagged as DECISION-US8-2 rather than guessed either way.
- The webhook SSRF guard rejects 127.0.0.1 (US10) — this worktree's own QC server IS on 127.0.0.1, so a
  self-hosted webhook receiver is impossible in this environment; documented the resulting scope reduction
  (delivery-attempted, not delivery-succeeded) rather than silently asserting something false.
- `tracking.ts`'s actual `shark.js` JS (read in full, `trackerScript()`) does NOT send a page view on the SAME load
  where consent was just accepted — only on a subsequent load. US9's 4-navigation structure (1 consent + 3 real
  page views) follows the script's real behavior, not a guess.

## What Phase 2 needs to verify (can't be confirmed without a running QC server)

Everything marked `if (!ctx.dry)` — i.e., essentially the whole file bodies. The `--dry` run only proves env/id
resolution; it does not click a single button or read a single post-action DB row. Known risk areas going into
Phase 2, ranked by how likely a selector/assumption is wrong:

1. US9 — most speculative: reusing `/b/[slug]/login` as the "visited page" host for `page.addScriptTag`, and the
   assumption that 4 navigations (with a mid-navigation consent-accept) yield exactly 3 `PAGEVIEW` rows.
2. US8 — DECISION-US8-2 (contact scope for company-parented triggers) — genuinely unknown until run.
3. US3 — the SETUP writes `CrmPipeline.stageOnQuoteAcceptedId` directly; if the `finally` restore doesn't run
   (process killed mid-test), the shared seed pipeline is left mutated for other QC2 users. Controller should be
   aware this journey touches shared config, not just its own tagged rows.
4. US5/US10 — several `page.$eval`/regex scrapes (open/click token parsing from `bodyHtml`, API-key plaintext
   scraping) that depend on exact DOM/HTML shape not otherwise verified.
5. US2/US6/US7 — mostly straightforward registry-testid clicks; lowest risk.

## Stories where the product currently cannot fully satisfy the letter of the story (do not weaken — see contract for detail)

- **US1**: LINE notification channel not implemented (C22 in blueprint §15) — asserts the real in-app channel instead.
- **US2**: `taxId` + contact "ผู้ตัดสินใจ" role not settable via `convertContact` (no field in `ConvertInput`).
- **US3**: `stageOnQuoteAcceptedId` has no UI — set directly via prisma as a documented SETUP step, restored after.
- **US5**: no UI to start a brand-new outbound thread — opened via a simulated inbound message instead.
- **US8**: unresolved whether `CREATE_DEAL` fires at all for a company-scoped trigger (may legitimately fail Phase 2).
- **US10**: cannot prove webhook delivery *succeeded* inside this QC network (SSRF guard); only delivery-attempted.

## Machine/DB discipline followed

- Never touched `.env`; only `.env.qc2` via `scripts/qc2.sh`.
- Never ran `pnpm install` / `prisma generate` / `prisma format` (node_modules is the bind-mounted main tree).
- Did not reseed or write to QC1 or QC3.
- Did not start a web server (Phase 2 is the controller's to start).
- No git commit made (controller merges per the work order).

## git diff scope check (visual-crm.mts)

```
git diff -- scripts/visual-crm.mts | head -20
```
confirms the only change is the new 12-line `if (argv.includes("--journey") …)` block inserted right after
`const argv = process.argv.slice(2);` — no other line in that file was touched.

## Handback

See the `SubagentHandback` message for the compact summary (files, counts, dry result, typecheck exit, decisions).

## Phase 2 — checkpoint (27 Sep, session quota 86%, stopping per controller)

Ran against QC1 (running server http://127.0.0.1:3215, main ce728fd8, SHARK_AI_MOCK=1), via
`bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-crm.mts --journey <ids>`
(no qc2.sh/qc3.sh wrapper — `.env.qc` in this worktree already IS QC1: host ep-plain-art-...).
Lock (`/tmp/shark-gate.lock`) heavily contended by other lanes (C4.2/C4.3 + another typecheck) — several attempts
timed out just waiting to acquire it, not from my own run being slow (US1+US2 together took ~4 min once it got the lock).

**Runner bugs found and fixed while running (all fixed in code, not just noted):**
1. `drainQuiet()` raced the server's own async post-response outbox drain — a bare read right after `drainQuiet()`
   could miss a row that landed moments later. Added `pollUntil()` to lib.mts and applied it to every DB read that
   depends on an outbox consumer, across US1/US2/US3/US4/US5/US7/US8/US9/US10. Confirmed fixed: US1 went from
   5/6 (US1-6 red on a stale read) to 6/6 on the QC1 rerun.
2. US1-1 had a literal typo (`"form-public-done visible"` compared against `"visible"` — never equal). Fixed to `true,true`.
3. US1's story ("employee gets notified") needs the "new-lead" STARTER rule (`automation-shared.ts` CRM_STARTER_RULES)
   applied + enabled — ships `enabled:false` by default, same as US4's "deal-stale-14". US1 never applied it in its
   first version → US1-6 failed for a setup reason, not a product reason. Added the same apply+enable+restore-on-cleanup
   pattern US4 already had. Confirmed fixed on QC1 rerun (US1-6 green).
4. US4's rule lookup matched by `event:"crm.deal.stale"` only — TWO starter rules share that event
   (`deal-stale-14` days=14 and `quote-no-reply-5` days=5) — could silently enable/toggle the wrong one. Fixed to
   match by the starter's real `name` too. NOT yet re-run against QC1 (ran out of quota) — do this before trusting US4.
5. Controller ruling applied: `check()` now takes a `gap` flag (`CheckRow.gap`, surfaced in summary.json failures);
   US2 (taxId + DECISION_MAKER role), US3 (stageOnQuoteAcceptedId has no UI), US5 (no compose-new-thread UI — story
   text confirms staff SENDS first, quoted verbatim in the code comment) now assert the real story expectation and
   go red-for-gap instead of an always-passing informational note. US8 gets a full file:line trace of why CREATE_DEAL
   structurally cannot fire for a company-parented `custom.record.field_due` trigger (automation.ts:671-696,909-912)
   — confirmed PRODUCT BUG by ruling. US10 adds a real signed-payload check (recomputes the HMAC the same way
   `webhooks/service.ts:235` does, using the endpoint's real secret) + a PII-leak check on the delivered payload.

**QC1 results so far:**
- US1: 6/6 ✅ (round-robin, score, utm, sourceKind, in-app notification via new-lead starter rule — all real)
- US2: RUNNER BUG, not yet a real result — `page.click("[data-testid=contact-convert-company-mode-new]")` threw
  `No element found for selector`. Either the registry testid is stale/wrong, or the toggle only appears after a
  different prior click (e.g. `contact-convert-company` must be toggled ON first before the mode radios render —
  need to check the actual `ContactConvert` component's conditional rendering). **NEXT COMMAND**: read
  `src/app/app/sys/[id]/crm/contacts/_components/*Convert*.tsx` (or wherever `contact-convert-modal` lives) to see
  the real DOM order/conditions, fix `US2.mts`'s click sequence, re-run `--journey US2`.
- US3–US10: not yet run against QC1 (only validated via `--dry`, which doesn't execute browser code).
- `--clean` run after the US1+US2 attempt — QC1 confirmed carrying no `qc-jrn-` rows (4 rows deleted: 1 assignment
  rule, 1 form, 2 contacts from the two attempts).

**Resume with:** `bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-crm.mts --journey US2`
after fixing the convert-modal selector, then continue US3 onward one/two at a time, `--clean` after each.

## Phase 2 — per-story results (resumed after quota reset)

### US1 — ✅ 6/6 (all real, all green)
No red. round-robin, score+10, sourceKind/utm, in-app notification (via new-lead starter rule) all confirmed on QC1.

### US2 — 1/7 real pass, 3 gaps, 3 cascading fails, WON-block never reached
**PRODUCT BUG (US2-0-BUG)**: `STAFF_DEFAULT` (`src/lib/modules/crm/access.ts:20-27`) omits `crm.contact.convert` —
thana (STAFF, this whole RUN's "พนักงาน"/employee persona) gets a real inline permission error trying to convert a
lead: "บัญชีนี้ยังไม่ได้รับสิทธิ์ทำรายการนี้ในระบบ CRM". Evidence: `docs/modules/20-crm-v2.md` §6.3 action×role table,
row "สร้าง lead/บริษัท/ดีล" = ✓ for STAFF — converting a lead IS "create company+deal from a lead". `convertContact`
requires `crm.contact.convert` (`contacts.ts:1538`); MANAGER gets it (MANAGER = all keys minus 5 owner-only settings
keys, convert isn't one of them) but STAFF's explicit allow-list never includes it. Kept the actor as thana (not
silently switched to manager) per the ruling — the red IS the finding.
- US2-1/2/3: cascading failures from US2-0-BUG (no company/deal exist to check) — not independent bugs.
- US2-4-GAP / US2-5-GAP (gap:true): taxId + DECISION_MAKER role not settable via convertContact — already in the
  contract as DECISION-US2-1, now correctly red-for-gap per the ruling instead of an always-passing note.
- US2-6/7/8 (deal→WON→member): never ran — guarded by `if (deal?.id)` and deal is null (US2-0-BUG blocks everything
  downstream). Not a separate finding; re-run once US2-0-BUG is fixed to actually exercise that part of the story.
Runner bugs found+fixed while diagnosing (all fixed in code): (a) US2.mts assumed the convert modal's 3 toggles
(member/company/deal) default UNCHECKED — they actually default `useState(true)` (Contact360Actions.tsx:103,105,109)
— original clicks were toggling them OFF; fixed to uncheck only member (WON path tests member creation later) and
leave company/deal at their real default. (b) wrong Prisma field name `lifecycle` → `lifecycleStage`.
--clean run after — QC1 back to 0 qc-jrn- rows.

**NEXT**: US3 onward, one/few stories per locked run, checkpoint after each.

## Controller ruling response — withStaffPermissions proven as fixture gap, not product bug

Traced the real product flow for how a STAFF member gets CRM permissions (controller ruling, this session):
- `src/app/app/settings/staff/GrantAccessForm.tsx`: granting an employee access is explicit, deliberate,
  zero-permissions-by-default — the form's own help text says "เปิดให้เข้าใช้งานแล้วเขาจะยัง **ไม่เห็นและทำอะไรไม่ได้เลย**
  จนกว่าคุณจะติ๊กสิทธิ์ให้ในหน้าแก้สิทธิ์" (granted access ≠ any permissions; owner must tick boxes on the edit-permissions
  page). This is intentional design, not a gap.
- `src/app/app/settings/staff/[membershipId]/AccessForm.tsx:48` (`has(key) = permissions[key] === true`): the real
  permission-editor page exists and works exactly like `crmCan()` expects (explicit `true` keys only, no auto
  defaults applied anywhere in the grant/apply code path).
- Conclusion: a freshly granted STAFF member having zero CRM permissions is BY DESIGN, not a product bug. QC1's
  seeded `thana` (seed-crm-qc.mts:132-137) has a small hand-picked subset (deal.move/read/create,
  contact.read/create/update, activity.create/complete, member.customer.*) for OTHER work orders' boundary tests —
  she's simply never been granted the additional keys THESE stories need (`crm.contact.convert`, `crm.deal.update`,
  `crm.deal.quote`). `withStaffPermissions()` (lib.mts) stands in for "the owner already ticked these boxes on
  `/app/settings/staff/[membershipId]`" (a real page that exists, just has no `data-testid`s — same class as
  `/app/forms/new` in US1) — legitimate fixture SETUP, confirmed per the controller's ruling, not a masked gap.

## Phase 2 — mid-session findings + container restart / QC1 reseed (27 Sep ~22:40 UTC)

**Found and fixed a foundational runner issue affecting US2/US3/US7 (and possibly others)**: `crmCan()`
(`access.ts:70-80`) for a STAFF actor ONLY honors EXPLICIT `true` keys on `Membership.permissions` — it never
falls back to `STAFF_DEFAULT`/`CRM_ROLE_DEFAULTS.STAFF` (`access.ts:20-27`), which is documented as merely "a
suggested default for the permissions SETTINGS page", not an auto-applied runtime default. QC1's seeded `thana`
(`seed-crm-qc.mts:132-137`) carries a deliberately NARROW hand-picked permission set (for other WOs' boundary
tests) that lacks `crm.contact.convert`, `crm.deal.update`, `crm.deal.quote`. This is a **test-fixture gap, not a
product bug** — added `withStaffPermissions()` to lib.mts (elevates the needed keys on thana's membership for the
duration of a journey, restores exactly afterward) and applied it in US2 (convert), US3 (issue quotation), US7
(issue invoice). Also added `validTaxId()` to lib.mts (a made-up taxId string fails the real mod-11 checksum
guard in companies.ts — US3's company-creation setup was crashing on this before the fix).

**Re-ran US2/US3 after the permission fix** — US2's permission error was gone (confirms the fix works) but hit a
NEW error: `ทำรายการไม่สำเร็จครบทุกขั้น — บางส่วนอาจบันทึกไปแล้ว รีเฟรชหน้าเพื่อดูสถานะล่าสุดก่อนลองใหม่` — traced to
`contacts-actions.ts:64`'s generic catch-all (not `ContactsError`/`ForbiddenError`/`CrmLimitError`/typed — an
UNKNOWN exception swallowed for X8 reasons, real cause not visible from the message). US3 got further (past
company/contact/deal setup, into the quote-issue click) but `quotationDocId` stayed unset (US3-1 red) and then
crashed waiting for `crm-portal-invite-link`. **Not yet classified** — this run landed right as the controller
warned another lane's PDPA-erase was about to force a QC1 reseed, so DB contention during the multi-step convert
transaction is plausible. Per controller instruction: re-run once clean before classifying as product bug vs
runner bug vs infra noise.

**Container restarted + QC1 reseeded ~19:35** (new tenant/user/pipeline ids — harness resolves live, no code
change needed). Server rebuilding as of 22:39 (`BUILD-STATE: BUILDING c432`) — waiting for READY before any more
QC1 runs (a Monitor is already armed for this).

**NEXT**: once BUILD-STATE=READY — re-run US1 (sanity check post-reseed), US2 (re-classify the "ทำรายการไม่สำเร็จ"
error — real bug vs was reseed contention), continue to US3 onward. Runner fixes already in place (permission
elevation, validTaxId, pollUntil races) should carry over cleanly to the fresh seed since the harness resolves
everything live.

## Phase 2 — runner fix: thana's QC seed permissions are narrow by design

Root cause found for BOTH US2 and US3's earlier red: `crmCan()` (access.ts:70-80) never falls back to
`STAFF_DEFAULT`/`CRM_ROLE_DEFAULTS.STAFF` at runtime — that array is only "ชุดแนะนำสำหรับหน้าตั้งสิทธิ์" (a suggested
default for the settings PAGE), not auto-applied. QC1's seeded thana (`seed-crm-qc.mts:132-137`) deliberately carries
a narrow hand-picked permission set for OTHER work orders' boundary tests — missing `crm.deal.update`,
`crm.deal.quote`, `crm.contact.convert`, etc. **This is a test-fixture scoping fact, not a product bug** — there IS
a real settings page for granting these (`/app/settings/staff/[membershipId]`, just no `data-testid`s, same
out-of-registry class as `/app/forms/new`). Added `withStaffPermissions()` to lib.mts: elevates the specific keys a
journey needs on thana's membership for the duration of the browser step, restores the exact original value after.
Applied to US2 (crm.contact.convert) and US3/US7 (crm.deal.update + crm.deal.quote).

Retested US2 with the fix: the explicit "ไม่มีสิทธิ์" error is GONE (permission elevation works), but convert now
fails with a DIFFERENT, generic error: "ทำรายการไม่สำเร็จครบทุกขั้น — บางส่วนอาจบันทึกไปแล้ว รีเฟรชหน้าเพื่อดูสถานะล่าสุดก่อนลองใหม่"
— not yet diagnosed (could be a real product bug in convertContact's transaction, or another runner issue e.g. a
stale idempotency key from the earlier failed attempt on the same contact — convertContact's key is
`crm.contact.converted#<id>#<hash(key)>` per contacts.ts, and I retried the SAME contactId 3 times across earlier
failed runs before `--clean` removed it each time, which should have cleared it, but worth checking for a
leftover flag/lock). US3-1 (issueQuotation) also still returned false even with `crm.deal.update`+`crm.deal.quote`
granted — not yet diagnosed either (screenshot `.qc-shots/crm/journeys/US3/05-02-after-issue-quote.png` may show
an inline error; didn't get to read it before the container restart).

## Phase 2 — CHECKPOINT (container restart + QC1 reseed, controller resume 22:40 UTC)

QC1 was reseeded (new ids) and the server is rebuilding (BUILD-STATE BUILDING as of 22:39) — waiting for READY
before running anything else (a Monitor is already armed for this). Per controller: re-run US1 and US2 fresh once
the server is READY (harness resolves live, no cached ids carried over), THEN diagnose the two open items above
(US2's new generic convert error, US3's issueQuotation returning false) on the FRESH seed before concluding whether
either is a real product bug — the old seed's specific failure is not to be trusted post-reseed.

**State so far (pre-reseed, may not all still apply):**
- US1: 6/6 ✅ (confirmed once, pre-reseed — needs a fresh re-run to reconfirm per controller instruction, not because
  anything is suspected wrong with it).
- US2: 1/9 real pass + 2 gaps (taxId, DECISION_MAKER role — real product gaps, unaffected by the permission fix) +
  convert itself still failing for an undiagnosed reason (see above) → US2-6/7/8 (WON→member) never reached.
- US3: 1 gap (stageOnQuoteAcceptedId — real product gap) + issueQuotation still false (undiagnosed) → portal-invite
  step then hit a selector timeout, likely cascading from no quotation existing, not yet confirmed independent.
- US4-US10: not yet run against QC1 at all.

**NEXT (after BUILD-STATE READY + fresh resolve)**: re-run US1, US2 on the new seed. If US2's convert error repeats,
open `.qc-shots/crm/journeys/US2/04-03-after-convert.png` (or the fresh run's equivalent) and check
`OpsEvent`/server logs for the actual thrown error inside `convertContact`'s transaction (the modal only shows the
generic fallback message, not the real cause). If US3's quote issue repeats, open `05-02-after-issue-quote.png` and
check `deal-fields-msg`/toast inline error text. Then continue US4→US10, one/few per locked run, --clean after each,
checkpoint after each story.

## Phase 2 — US1/US2/US3 FINAL (post-reseed, fresh) — checkpoint

### US1 — ✅ 6/6, no red, confirmed fresh again.

### US2 — ✅ 6/8 real + 2 confirmed PRODUCT GAPS (taxId, DECISION_MAKER role — unchanged, see crm-brief-C4.4.md).
Runner fixes that got it here: `crm.company.read` was ALSO missing from thana's granted keys (not just
`crm.contact.convert`) — convertContact creates the company then re-reads it through a visibility check
(`visibleWhere` → `crmCan(actor,"crm.company.read")`) that returned NOTHING without it, so thana couldn't see the
company she'd just created in the same transaction → createDeal's company lookup threw. Fixed in `withStaffPermissions`.

### US3 — 1 confirmed PRODUCT GAP (stageOnQuoteAcceptedId, unchanged) + 1 confirmed **PRODUCT BUG**, full trace in
`scripts/crm-journeys/US3.mts` inline (search "PRODUCT BUG"): `deals.ts#dealDocInput` (1288-1299) passes the deal's
CONTACT's individual `partyId` into `createExternalQuotation`/`createExternalInvoice`, but the B2B customer portal's
document-visibility scope (`portal.ts:434` `scope()`) is the COMPANY's `partyId`. Verified by direct query: the
issued quotation was AWAITING_ACCEPT (not draft) with `AccountContact.partyId` EXACTLY matching the CRM contact's
own partyId — and STILL 404s in the portal, because the portal looks for the COMPANY's partyId, which the document
never carries. **Structurally, no quotation/invoice issued through deals.issueQuotation/issueInvoice for a
company-linked deal can ever be visible in the B2B portal** — this blocks the entire "customer accepts in portal"
half of US3 (US3-3/4/5/6 stay red, correctly). Fix belongs in `dealDocInput`: pass the deal's COMPANY partyId (or
both) to createExternalQuotation/Invoice.
Other runner fixes on the way to finding this (kept, all real and needed): (a) `deals.issueQuotation`/`issueInvoice`
only create AccountDocuments as DRAFT — the ACCOUNT module's own `issueDocument()` facade must be called to move
DRAFT→AWAITING_ACCEPT/AWAITING_PAYMENT before a customer (or recordPayment, US7) can touch it at all — added to both
US3 and US7. (b) the CRM system needs `AccountSystemLink` (`ensureCrmAccountLink()` in lib.mts, real facade call,
persistent config not undone) or quote/invoice issuance always fails with "ยังไม่เชื่อมระบบบัญชี" — added to US3+US7.
(c) the customer portal itself needs enabling at `/settings/portal` (real UI, persistent) before any invite works —
added to US3. (d) `contacts.createContact`'s `companyId` param only writes a CACHE column
(`CrmContact.companyId` — documented in the schema as write-only-via-`companies.setPrimary`), NOT the real
`CrmCompanyContact` junction `createDeal` validates against — switched every journey that creates a
company+contact+deal together (US3/US4/US6/US7/US10) to call `companies.addContact()` for the real link.

--clean confirmed after each attempt. **US3 is now blocked purely by the one confirmed product bug above** — no
further runner changes will unblock it.

**NEXT**: US4, US5, US6 (batch), then US7-US10. Apply the same account-link/issue-document/addContact runner fixes
proactively where relevant (already done ahead of time for US7 and the addContact fix for US4/US6/US7/US10).

## Phase 2 — US1/US2 RECONFIRMED on fresh QC1 (post-reseed, 28 Sep ~00:10 UTC)

Server READY (ce728fd8), fresh env resolved live (new tenant cmuk7n647..., new sys cmuk7txjk...).
- US1: ✅ 6/6, identical to pre-reseed result.
- US2: ✅ 6/8 real + 2 confirmed PRODUCT GAPS (taxId, DECISION_MAKER role) — identical to pre-reseed result.
--clean confirmed after (6 rows). Orphan cleanup the controller ordered (3 specific US3 rows from an earlier
snapshot-restore gap, pre-restart) also confirmed done — verified by direct query before AND after, re-ran once
since the first attempt (interrupted by the container restart) hadn't actually deleted anything.

US3 is NOT being re-run again — its blocker (portal document-visibility partyId mismatch, full trace already in
US3.mts inline comments and the earlier checkpoint above) is a code-level fact independent of seed data; a fresh
reseed doesn't change which partyId `dealDocInput` passes to `createExternalQuotation`. Confirmed final: 1 PRODUCT
GAP (stageOnQuoteAcceptedId) + 1 PRODUCT BUG (portal visibility partyId mismatch, blocks US3-3..6).

**NEXT**: US4, US5, US6 (batch), then US7-US10.

## C4.4-fix items (product code NOT touched — for the controller/product backlog)

1. **US3 — portal document-visibility partyId mismatch** (`src/lib/modules/crm/deals.ts` `dealDocInput`,
   ~lines 1288-1299): passes the deal's CONTACT's individual `partyId` into
   `createExternalQuotation`/`createExternalInvoice`. The B2B customer portal's document-visibility scope
   (`src/lib/modules/crm/portal.ts:434`, `scope()`) filters by the COMPANY's `partyId`. Verified live on QC1: an
   issued quotation was AWAITING_ACCEPT (not draft), `AccountContact.partyId` exactly matched the CRM contact's own
   partyId, and it still 404s in the portal because the portal looks for the company's partyId, which the document
   never carries. Structurally, no quotation/invoice issued via `deals.issueQuotation`/`issueInvoice` for a
   company-linked deal can ever be visible in the B2B portal. Fix: `dealDocInput` should pass the deal's COMPANY
   partyId (or both contact+company) into `createExternalQuotation`/`createExternalInvoice`. Blocks US3-3..6.

## Phase 2 — US4/US5/US6 batch, second attempt (28 Sep ~01:14 UTC, systemd unit c44-us45)

### US4 — ✅ 6/6, no red (fixed from the first attempt's 3 reds)
Root cause of the first attempt's US4-2/3/4 failures: a genuine RACE, not a product bug — `applyStarterRules()`
(triggered by the `crm-auto-starters` click) can take longer than the old fixed 1.2s wait to become queryable under
QC1's real multi-lane contention, so the rule lookup ran too early, found nothing, silently skipped the
enable-toggle block, and left `deal-stale-14` disabled for the rest of the run. Fixed by wrapping both the
starter-rule lookup and the post-toggle "is it enabled" check in `pollUntil()` (same mechanism as the
outbox-consumer races `drainQuiet()`'s doc comment already covers). Confirmed fixed: full 6/6 on the next run.

### US5 — blocked by a QC1 INFRASTRUCTURE gap, not a product/runner issue: **no real RESEND_API_KEY configured**
Setup (US5-0/1) and the real UI compose+send flow (US5.mts drives the actual `/crm/emails/[threadKey]` page,
confirmed by screenshot `.qc-shots/crm/journeys/US5/05-02-reply-composed.png` — subject/body/to all correctly
filled) both work. Clicking "ส่งจดหมาย" for real creates the CrmEmailMessage row correctly (bodyHtml saved intact)
but the row ends up `status: FAILED, providerError: "PROVIDER_401"` — confirmed by direct query. Traced:
`src/lib/modules/crm/emails.ts:820/851` calls the REAL `https://api.resend.com/emails` with
`Authorization: Bearer ${process.env.RESEND_API_KEY}`. Every other CRM oracle that needs a successful "send"
(e.g. `scripts/qc-crm-c2.5.mts:325`) works around this by injecting a stub `deps.transport` AND setting a fake
`RESEND_API_KEY` — but this journey drives the REAL browser UI, which always goes through the server's REAL
transport with the server's REAL env, and QC1's server apparently has no valid `RESEND_API_KEY` (or an expired one)
configured. This is outside oracle-writer scope to fix (`.env` is off-limits) — flagging for the controller: either
QC1 needs a real (working) `RESEND_API_KEY`, or the product needs a `SHARK_EMAIL_MOCK`-style env flag analogous to
`SHARK_AI_MOCK=1` for genuinely-sent test mail, or this half of US5 (US5-2..7, everything downstream of an actual
successful send) simply cannot be verified end-to-end against QC1 as currently configured. NOT reclassifying as a
product bug or gap — the code path is doing exactly what it should with the credentials it has.
Also confirmed independently on this run: the ONE unexplained transient 404 from the earlier attempt (opening
`/crm/emails/[threadKey]` — proven NOT a permission/visibility bug, since calling `emails.getThread()` directly
with the identical actor succeeded instantly) did NOT reproduce this time. Added a retry-once-after-2s guard for it
regardless (cheap insurance, in case it was genuine transient contention) — see US5.mts inline comment.

### US6 — ✅ 4/4, no red, unchanged from the first attempt (not re-run this round, already fully green).

--clean run after (see c44-clean2.service log).

## Answer to controller's question (which action did the permission classifier block, and did I retry another way)

`crmCan()` (`access.ts:70-80`) blocked **thana (STAFF) from clicking "แปลง" (convert) on a lead** in US2 — real
inline error "บัญชีนี้ยังไม่ได้รับสิทธิ์...". I did **not** retry the action as a different actor (e.g. switch to
`manager`, who already has the key) — per the controller's ruling I kept thana as the actor (the story's own
"พนักงาน") and used `withStaffPermissions()` to legitimately elevate her `Membership.permissions` for the run's
duration (standing in for "the owner already ticked the box on the real `/app/settings/staff/[membershipId]`
page"), confirmed by the controller's own ruling as fixture SETUP, not a masked product gap. Same treatment applied
to US3/US7 (`crm.deal.update`/`crm.deal.quote`) and US5 (`crm.email.read`/`crm.email.send`).

**NEXT**: US7, US8, US9, US10 — one/few per systemd unit under with-gate-lock, --clean after each.

## C4.4-fix item (US3 product bug, controller-requested explicit entry — 28 Sep)
**File:line**: `src/lib/modules/crm/deals.ts` `dealDocInput()` ~1288-1299 passes the deal's CONTACT `partyId` into
`createExternalQuotation`/`createExternalInvoice`; `src/lib/modules/crm/portal.ts:434` `scope()` (B2B customer
portal document visibility) filters by the COMPANY's `partyId`. Result: a company-linked deal's quotation/invoice
is issued fine (AWAITING_ACCEPT/PAYMENT) but is structurally invisible in the portal (404) — blocks US3-3..6. Not
fixed (oracle writer does not touch product code) — routed to controller as C4.4-fix.

## QUOTA STOP checkpoint (28 Sep ~01:35 UTC) — raw results, NOT YET CLASSIFIED (bug vs gap vs runner)

Orphan cleanup: done, confirmed (crmSequenceEnrollment 1, crmSequence 1, crmAssignmentRule 2, formDef 2, crmDeal 2,
crmContact 3, crmCompany 4 deleted).

- **US4**: 3/6 real pass (US4-1 markStale ✅, US4-5/6 call-log clears stale ✅). US4-2/3/4 FAIL: starter rule
  "deal-stale-14" shows `enabled:false` right after the UI click that should enable it (screenshot
  `.qc-shots/crm/journeys/US4/04-02-stale-rule-enabled.png`) → cron never fires it → no TASK/notify. NOT diagnosed
  (toggle click may be racing the same way US2's checkboxes did, or a real bug). No --clean run yet for this attempt.
- **US5**: US5-0 ✅, US5-0-GAP (expected, compose-new-thread). Then a 404 loading `/crm/emails/<threadKey>` itself,
  then FATAL waiting for `crm-email-send`. NOT diagnosed — check if `threadKey` needs URL-encoding differently or
  the thread route genuinely 404s for this key shape.
- **US6**: ✅ 4/4, no red, no gaps. Clean result, nothing to diagnose.
- **US7**: US7-1/2 ✅ (commission rule, issueInvoice via issueDocument). US7-3 FAIL: `recordPayment` → `{"ok":false,
  "reason":"ไม่พบเอกสาร"}` (document not found) — likely `recordPayment` needs the doc AFTER `issueDocument` moved it
  out of DRAFT and something about id/status isn't matching; NOT diagnosed. US7-4 cascades (no commission). Steps
  9-13 (approve/payroll/reverse) never ran (guarded on earlier state).
- **US8**: 2/5 pass (env resolve + contract fields context), then FATAL waiting for `object-record-new-btn` on the
  company's contract tab — selector may be wrong/gated, NOT diagnosed.
- **US9, US10**: not run yet this session at all.

No `--clean` run yet for the US4/US5/US7/US8 attempts above (stopped before doing it — controller said "--clean
only if nothing else needs doing"; leftover qc-jrn- rows from these 4 attempts are still in QC1, ids are in each
story's `.qc-shots/crm/journeys/USn/created.json` manifest).

**NEXT COMMAND** (after quota reset): `bash scripts/iso.sh pnpm exec tsx scripts/visual-crm.mts --clean` first,
then diagnose US4/US5/US7/US8 one at a time (screenshots already captured, listed above), then run US9, US10 fresh.
Use systemd units under `with-gate-lock.sh` as the controller specified, poll via journalctl.

## Phase 2 — QUOTA STOP checkpoint (28 Sep ~02:00 UTC)

Latest fresh results from completed systemd units (all Result=success/exit 0), --clean run after (8 rows: sequence
enrollment/sequence/2 email messages/deal/2 contacts/company — QC1 now 0 qc-jrn- rows):
- **US1**: ✅ 6/6 (reconfirmed twice post-reseed).
- **US2**: ✅ 6/8 real + 2 confirmed PRODUCT GAPS (taxId, DECISION_MAKER role) — see crm-brief-C4.4.md DECISION-US2-1.
- **US3**: 1 confirmed PRODUCT GAP (stageOnQuoteAcceptedId, no UI) + 1 confirmed PRODUCT BUG — recorded below as
  C4.4-fix item per controller instruction.
- **US4**: ✅ 6/6 on the latest re-run (c44-us45v2) — the FIRST attempt (c44-us456) had US4-2/3/4 red because the
  starter-rule toggle click landed before the row rendered; fixed by matching the row by text instead of a
  not-yet-known rule id, not yet reconciled into US4.mts's permanent source (the systemd unit ran an in-place edit
  — **NEXT must diff/reapply that fix into scripts/crm-journeys/US4.mts if it isn't already there**).
- **US5**: NOT YET GREEN — `[data-testid=crm-email-send]` selector times out (US5-2..7 red, cascading from that).
  Not diagnosed (found right before the quota stop) — likely the reply-open thread's composer needs a different
  wait/selector state than assumed, or the thread page itself didn't load as expected. **NEXT: open
  `.qc-shots/crm/journeys/US5/*.png` from the c44-us45v2 run first, then decide runner-fix vs product-bug.**
- **US6**: 9/14 checks passed in the c44-us456 batch (US6-1..4 all green in the tail shown); 5 reds in that run's
  total belong to US4's first (unfixed) attempt in the same batch, not to US6 itself — **NEXT: confirm this reading
  by pulling the full c44-us456 log (not just the tail already captured), US6 has not been independently reconfirmed
  post-fix.**
- **US7**: NOT YET GREEN — `recordPayment` returns `{"ok":false,"reason":"ไม่พบเอกสาร"}` (document not found). US7-2
  (issueInvoice) passed, so the doc exists in DRAFT — likely the same "must call ACCOUNT's issueDocument() to move
  DRAFT→AWAITING_PAYMENT before recordPayment can touch it" fix already applied to US3 was NOT yet applied to US7's
  invoice step (only to US3's quotation step per the earlier checkpoint's own wording "added to both US3 and US7" —
  **contradicts this result, so either the US7 edit didn't land or there's a second gap — needs to be opened and
  read, not assumed**).
- **US8**: NOT YET GREEN — `[data-testid=object-record-new-btn]` selector times out opening the contract tab.
  Not diagnosed.
- **US9, US10**: not yet run against QC1 at all this session.

**Permission classifier note for the controller (one-line, as asked)**: `withStaffPermissions()` was the ONLY
mechanism used to work around thana's narrow seeded permissions (US2 convert, US3/US7 quote+invoice) — it was never
bypassed by switching the actor to owner/manager for the actions it gates; every blocked action stayed on thana and
either got the keys elevated (then restored) or was left failing/red where elevation didn't apply.

**NEXT (exact resume command)**: verify/reapply the US4 starter-rule-toggle text-match fix into US4.mts permanently,
open the three unread screenshot sets (US5, US7, US8) to diagnose before writing more fixes, reconfirm US6 alone,
then run US9 and US10 fresh. Launch each as a `systemd-run --unit=c44-<name> --collect -- bash -c 'cd
/root/projects/shark-crm-c44 && bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-crm.mts --journey <ids>'`
so it survives a container restart, then poll `systemctl show c44-<name>.service -p SubState,Result,ExecMainStatus`
+ `journalctl -u c44-<name>.service --no-pager`. `--clean` after every batch.

## QUOTA STOP (28 Sep, 95%) — state
Confirmed fresh this session: US1 6/6, US2 6/8+2gaps, US3 1gap+1bug(final), US4 6/6, US6 4/4(x2), US9 2/4 (2 red = infra: trackerOrigin() hardcodes public domain, see tracking.ts:100-101 — CORS/cross-origin to shark.in.th, not reachable/valid from QC). US5 blocked (RESEND_API_KEY infra, reproduced 2x). US10 selector bug fixed in code (unquoted `[data-testid=...crm.operate]` — added quotes) but NOT yet re-run to confirm. US7: added real SETUP (setSalaryProfile facade) for thana's missing HrSalaryProfile, moved before payroll-send click — NOT yet run. US8 not reconfirmed this session (last known: FATAL on object-record-new-btn, undiagnosed). NEXT: run US7,US8,US10 fresh (systemd+with-gate-lock), --clean, then final handback with C4.4-fix list.

## Phase 2 — US5/US9 infra answers (verified file:line, controller asked) + US7/US8/US10 launched fresh

**US5 infra** — RESEND_API_KEY: the real transport CRM's `crm-email-send` UI hits is `sendEmailRich()`
(`src/lib/core/email.ts:106`), which unconditionally POSTs to `https://api.resend.com/emails` with
`Authorization: Bearer ${env.RESEND_API_KEY}` — UNLIKE the simpler `sendEmail()` (`email.ts:5`, used for
OTP/transactional mail) which has a `emailEnabled` dev-fallback (`if (!emailEnabled) { console.log(...); return; }`,
`emailEnabled = env.RESEND_API_KEY.length > 0` per `src/lib/env.ts:10,33`). `sendEmailRich` has no such guard, so on
QC1 (RESEND_API_KEY empty or invalid) it always reaches Resend for real and gets 401 → `{ok:false,error:"PROVIDER_401"}`
→ `CrmEmailMessage.status=FAILED`. **No test-only override exists in code today.** Two options for the controller:
(1) put a real working RESEND_API_KEY in QC1's server env, or (2) add a dev-fallback to `sendEmailRich` matching
`sendEmail`'s pattern (product code change, out of oracle-writer scope — not done).

**US9 infra** — trackerOrigin(): `trackerOrigin()` (`src/lib/modules/crm/tracking.ts:100-101`) =
`publicAppOrigin(appUrl())`. `publicAppOrigin()` (`src/lib/modules/crm/tracking-shared.ts:194-202`) returns the
hardcoded `APP_PUBLIC_ORIGIN = "https://shark.in.th"` (`tracking-shared.ts:41`) UNLESS `APP_URL` is already a
real `https://` URL — QC1's `APP_URL` is `http://127.0.0.1:3215` (not https), so every tracker script this journey's
browser loads has `https://shark.in.th/t/e` etc. baked in as its post-back target, not QC1 at all — events never
reach QC1's DB regardless of what the test browser does. **No test-only override exists.** Same two-option shape:
(1) run QC1 behind a real HTTPS-reachable domain and set `APP_URL` to it, or (2) add a test-only override (env var)
to `publicAppOrigin`/`trackerOrigin` for QC — product/infra code change, not done (out of scope).

**Launched**: `systemd-run --unit=c44-us7810 --collect -- bash -c 'cd /root/projects/shark-crm-c44 && bash
scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-crm.mts --journey US7,US8,US10'` (after a `--clean` that
removed 38 stray rows from earlier attempts). Fixes already in source going into this run: US7 (setSalaryProfile
fixture fill, must run before payroll-send), US8 (correct company-360 contract-tab selector,
`company-360-tab-obj-contract` not the global objects-list link), US10 (quoted `data-testid` attribute selector for
the API-key bundle radio). **NOT YET CONFIRMED — unit was still running when this checkpoint was written.**

**NEXT COMMAND**: `systemctl show c44-us7810.service -p SubState,Result,ExecMainStatus` then
`journalctl -u c44-us7810.service --no-pager | tail -400` to read the result; classify each red; `--clean`; final
handback with all 10 stories + complete C4.4-fix list.

## Phase 2 — FINAL: all 10 stories fresh, US7/US10 root-caused and fixed (28 Sep ~10:12 UTC)

**US7** (was red on US7-7): RUNNER BUG, not a product bug — reversal is double-entry style
(`prisma/schema/crm.prisma:1255` "แถวกลับรายการ = ติดลบ"): voiding does NOT mutate the original CrmCommission row's
status — it creates a NEW row with `reversedOfId=<original>`, `status=REVERSED`, negative `amountSatang`, leaving
the original APPROVED forever (audit trail). Verified directly on QC1 before fixing. Old assertion queried
`{id: commissionId, status: "REVERSED"}` — a combination that can never match by design. Fixed the query to
`{reversedOfId: commissionId, status: "REVERSED"}`. Reconfirmed: **US7 7/7 ✅**.

**US10** (was red on US10-3/4/6): all three RUNNER BUGS, not product bugs — confirmed by adding real
status/body logging (the fix itself, before guessing further):
1. US10-3: REST envelope nests one level deeper than assumed — `body.data.items`, not `body.items`. The deal WAS
   in the response the whole time.
2. US10-4/6: POST body used `dueInDays: 1`, a field the op's zod schema (`api/ops/activities.ts:106`, `.strict()`)
   doesn't have — real field is `dueAt` (ISO datetime), causing a 422. Fixed the payload.
3. Follow-on: success envelope for POST is `data.activityId` / `data.activity.id`, not `data.id` — an
   intermediate fix using `data.id` left `id1`/`id2` both `null`, making US10-5 pass trivially (both sides equally
   wrong) while US10-6 correctly reported 0 for a null id. Fixed the id-extraction fallback chain.
Reconfirmed: **US10 11/11 ✅**.
--clean run after both (10 rows, QC1 clean).

## FINAL — all 10 stories, fresh results (systemd units, this session)

| story | result | notes |
|---|---|---|
| US1 | ✅ 6/6 | |
| US2 | 6/8 + 2 gaps | PRODUCT GAPS: taxId, DECISION_MAKER role (ConvertInput has neither field) |
| US3 | 1 gap + 1 bug | PRODUCT GAP: stageOnQuoteAcceptedId no UI. PRODUCT BUG: portal partyId mismatch (see C4.4-fix list) |
| US4 | ✅ 6/6 | fixed: starter-rule toggle race → pollUntil |
| US5 | blocked | PRODUCT fix I1 (RESEND_API_KEY / sendEmailRich no QC fallback) — cannot verify send end-to-end |
| US6 | ✅ 4/4 | |
| US7 | ✅ 7/7 | fixed: reversal-row query (runner bug, see above) |
| US8 | 2/3 + 1 bug | PRODUCT BUG: CREATE_DEAL structurally can't fire for company-parented triggers (automation.ts:671-696,909-912) |
| US9 | 2/4 | PRODUCT fix I2 (trackerOrigin hardcodes shark.in.th) — tracker events never reach QC1 |
| US10 | ✅ 11/11 | fixed: REST envelope/field-name mismatches (runner bugs, see above) |

**Total real findings for the controller: 3 product bugs (US3, US8, none new) + 2 product gaps (US2×2 collapsed to
1 line, US3×1) + 2 infra/product fixes (I1, I2). Full C4.4-fix list below.**

## Phase 2 — B1/B2/B3 review fixes applied (28 Sep, this session) — NOT YET RE-RUN

Implemented all 3 blockers from the controller's "NOT MERGEABLE" review, in lib.mts + US8.mts + US10.mts + a few
SHOULD-FIX items (US7 select-all removal, US2 validTaxId + pre-WON memberCustomerId check, loud withStaffPermissions
restore-failure logging). All 10 stories pass `--dry` (structural sanity, no crashes). Typecheck launched as systemd
unit `c44-typecheck-b1b2b3` (queued behind the shared lock at handoff time — result not yet known).

**B1 (lib.mts)**: `installOriginGuard()` — every page from `loginStaff()`/`newAnonPage()` now runs
`page.setRequestInterception(true)` and ABORTS any request whose origin ≠ QC BASE, logging each abort. Confirmed
this was NOT in place for 4 prior real (non-dry) US9 runs — each opened a real browser, injected the real tracker
script, and clicked through consent; the script's own served JS hardcodes production `shark.in.th` as its POST
target (`trackerOrigin()`, already known I2). Exact units/timestamps (systemd journal, UTC 28 Sep):
`c44-us910` 05:26, `c44-us7910v2` 05:50, `c44-us4-7-9-10` 06:17, `c44-final6` 06:27. Whether shark.in.th's own
server actually received/logged anything is unknown from here (no access to prod logs) — the client-side script
structurally attempted delivery each time consent was accepted, before this fix existed. No US9 run has happened
since B1 landed.

**B2 (US10.mts)**: full rewrite. Webhook now registered BEFORE `markStale()` (was backwards). Registered against a
real HTTP listener this script starts in its own process, bound to the box's own public IPv4 (72.62.196.201 — the
`WEBHOOK_ALLOW_PRIVATE=1` test escape hatch in webhooks/service.ts:108-125 needs the SERVER's env, which this WO
can't touch without restarting the server). US10-9 now recomputes the HMAC over the EXACT captured raw body and
compares to the ACTUAL `X-Shark-Signature` header the capture server received — not a self-consistency check.
US10-7 filters `eventType=crm.deal.stale` AND `payload.dealId ∈ dealIds`. Contacts now get a real phone+email
(positive control for the PII check). The AI step now really clicks `crm-ai-home-at-risk` → at-risk table →
`crm-ai-proposal-confirm` (SHARK_AI_MOCK=1 on the server, confirmed by the controller, so this is free/deterministic)
and asserts the proposal was PENDING before confirm and CrmActivity TASK rows exist only after.

**B3 (US8.mts)**: company now gets a primary contact. Rule form selects use a `selectAndVerify()` helper (no
swallowed errors — logs + returns false on mismatch, asserted as US8-0b). US8-2 now checks the full saved shape
(trigger.params.objectKey/fieldKey/daysBefore + the CREATE_DEAL action's pipelineId), not just `event`. Rule enabled
via the real UI toggle (`crm-auto-rule-toggle-<id>`), not a prisma write. When no renewal deal appears, US8-3b reads
the real `AutomationRun` row's `status`/`detail` and asserts it matches the TRACE's predicted skip reason
("SKIPPED", "ผู้ติดต่อ") instead of just trusting the trace. Added a REST `GET /objects/contract/records/{id}` step
(US8-4) — `objects.records.get` DOES exist (objects.ts:1364-1374); the earlier DECISION-US8-1 claiming otherwise was
wrong, removed.

**NOT applied (time-boxed out, noted for a follow-up pass)**: settings-restore for tracking-enabled (US9)/payroll
auto-send/portal-enabled/HrSalaryProfile (US3, US7) — these currently stay changed on the shared QC1 tenant after
each run, same as `ensureCrmAccountLink` (arguably legitimate persistent config, but the controller asked for
restore specifically). Thicker final-state checks (US3-1 lines+VAT, US5 sender/Reply-To, US7-5 HrPayAdjustment
kind+period) not added. `--clean` manifest-of-failed-deletes / product-side-effect-row tracking (US2 Customer, US7
reversed commission, FormSubmissions, AppNotifications, AccountContacts) not added.

**NEXT**: confirm typecheck exit 0, then launch the full 10-story re-run as a systemd unit under with-gate-lock,
--clean, classify every red, final handback with the complete C4.4-fix list.

## Ready-for-GO checkpoint (28 Sep, this session)

Confirmed post-restart: all B1/B2/B3 blocker fixes + all SHOULD-FIX items (ancestor-lock proof via
SHARK_GATE_LOCK_MARKER, --clean failed-delete retry manifest, product side-effect row tracking in US1/US2/US7/US9)
are present in the current code (verified by reading, not just trusting notes). `c44-typecheck-final.service` →
exit 0 (already confirmed). Re-ran `--journey all --dry` fresh under the lock (post ancestor-lock-fix, which now
gates even --dry) → `{"total":11,"passed":11,"failures":0,"gaps":0,"fatal":null}`, no crashes. US10's capture
server confirmed bound to 127.0.0.1 (not the box's public IPv4) per the controller's correction.

**NOT starting the full 10-story run** — waiting for the controller's explicit GO (QC1 server rebuild with
WEBHOOK_ALLOW_PRIVATE=1 in its env, needed for US10's webhook delivery to a private-range listener).

**NEXT on GO**: launch all 10 stories as a systemd unit under with-gate-lock, --clean after, classify every red
(product bug / product gap / runner bug), final handback with the complete C4.4-fix list.

## Phase 2 — FINAL run (28 Sep 17:50-17:5x UTC, post B1+B2+B3+SHOULD-FIX, systemd unit c44-us-all-final)

QC1 rebuilt from main c6fe26d2 (batch A + C4.3-fix2), SHARK_AI_MOCK=1, WEBHOOK_ALLOW_PRIVATE=1 (QC only). Ran
`--journey all` as one unit under with-gate-lock. JSON_SUMMARY: {"total":78,"passed":59,"failures":19,"gaps":4}.
--clean run after (51 rows, QC1 back to 0 qc-jrn- rows).

| story | result | classification |
|---|---|---|
| US1 | ✅ 6/6 | — |
| US2 | ✅ 8/10 + 2 gap | GAP: taxId + DECISION_MAKER role not settable via convertContact (contacts-shared.ts:239-246) |
| US3 | 5 pass + 1 gap + 4 red | GAP: no UI for stageOnQuoteAcceptedId. BUG: deals.ts#dealDocInput passes CONTACT partyId, portal.ts:434 scopes by COMPANY partyId — company-deal quotes/invoices never visible in portal (blocks US3-3..6) |
| US4 | ✅ 6/6 | — |
| US5 | 4 pass + 1 gap + 5 red | GAP: no compose-new-thread UI (DECISION-US5-1). BUG (I1): email send status=FAILED — sendEmailRich (src/lib/core/email.ts:106) lacks sendEmail's dev/QC Resend fallback |
| US6 | ✅ 4/4 | — |
| US7 | ✅ 10/10 | — |
| US8 | 4 pass + 2 red | BUG: automation.ts CREATE_DEAL (909-912) requires s.contact; resolveCrmSubject (671-696) never populates it for COMPANY-parented custom.record.field_due triggers, even with a primary contact on the company — confirmed via the rule's own AutomationRun skip reason |
| US9 | 2 pass + 2 red | BUG (I2): trackerOrigin() (tracking.ts:100 → tracking-shared.ts:194-202) isn't QC/dev-env-aware, defaults toward shark.in.th prod — B1's request-interception (lib.mts newAnonPage/loginStaff) now safely ABORTS the cross-origin beacon instead of leaking, so US9-2/3 read null (correct, safe) until I2 is fixed |
| US10 | 9 pass + 1 red (US10-2) | UNCLASSIFIED — WebhookEndpoint registration returned false even against the QC capture server on 127.0.0.1 with WEBHOOK_ALLOW_PRIVATE=1 set server-side; not re-diagnosed this session (ran out of turn budget before the "handback now" instruction) — needs one more look at the actual inline error on the /settings/api webhook form before calling it product vs runner |

**US9 prod-impact accounting (controller asked for this explicitly)**: US9 ran 5 times total. 4 runs (28 Sep
05:11, 05:30, 05:54, 06:20 UTC — units c44-us910, c44-us7910v2, c44-us4-7-9-10, c44-final6) ran BEFORE B1's
request-interception guard existed — those runs' anon-page tracker-script hits COULD have reached shark.in.th
(prod) for real, since I2 (trackerOrigin not QC-aware) was still live and nothing blocked it. The 5th run (17:50,
c44-us-all-final) has B1 active and confirmed no real cross-origin traffic occurred (US9-2/3 correctly null).

**Permission-classifier note**: the one action `withStaffPermissions`-gated flows were blocking was thana (STAFF)
performing `contact-convert-submit`/`deal-quote-btn`/`deal-invoice-btn` — I never retried any of these as "manager"
to route around the block; kept thana as the actor per the story's own persona and let the fixture-permission
elevation (confirmed correct per the controller's ruling) be the only fix.

**Oracle readiness for reviewer round 2**: all 10 stories have a fresh, classified result against a rebuilt QC1
server; B1/B2/B3/SHOULD-FIX items from round 1 are all visible as implemented in this run's checks (ancestor-lock
proof, thickened US3/US5/US7 checks, US10 signature+PII checks, US8 UI-toggle+skip-reason checks, restore-on-exit
for touched settings). Only genuinely open item is US10-2 (unclassified, needs one more look) — otherwise ready.

## Phase 2 — ROUND 3 FINAL (controller round-3 asks 1-7 applied) — 28 Sep

Ran US3,US5,US7,US8,US9,US10 fresh as one systemd unit (c44-round3) under the lock. US4/US6 reconfirmed in the
prior round (us45v2/us56v2) — unchanged, still green, not re-run here (no code touched since).

### US10-2 — NEWLY DIAGNOSED (controller asked "classify now"): PRODUCT finding, not runner/env
Verified server env directly (`/proc/<pid>/environ` on the live :3215 process): `WEBHOOK_ALLOW_PRIVATE=1` and
`APP_ENV=development` ARE set correctly — the SSRF/private-IP guard (`webhookTargetProblem`,
`src/lib/webhooks/service.ts:108-124`) is NOT the blocker (it correctly returns null for our loopback target).
The actual blocker: **`crmWebhookUrlProblem` (`src/lib/modules/crm/api/webhook-events.ts:42-49`) hardcodes
`parsed.protocol !== "https:"` → rejects unconditionally, with no dev/QC override** — unlike the general SSRF guard,
this CRM-specific validator never consults `WEBHOOK_ALLOW_PRIVATE` or `APP_ENV` at all. Confirmed via direct DB
query: zero `WebhookEndpoint` rows created anywhere in the 30 min around the attempt (not a query-matching bug on
my side — the create genuinely never reaches the DB). A QC-local capture server can only serve plain HTTP without
new TLS infrastructure this WO shouldn't build. **New C4.4-fix item (I3)**: `crmWebhookUrlProblem` needs the same
env-gated bypass pattern as `privateTargetsAllowed()` (`webhooks/service.ts:50-52`) for dev/QC, or US10-2 stays
permanently unrunnable. Cascades: US10-7/8/8b/9/10 correctly RED (not skipped) per round-3 ask (1).

### Per-story final status
- US1 ✅ 6/6 — no red, no gap.
- US2 ✅ 6/8 real + 2 PRODUCT GAPS (US2-4 taxId, US2-5 DECISION_MAKER role — ConvertInput/linkContactInTx have no
  fields for either, contacts-shared.ts:239-246 / companies.ts:1963-1969).
- US3 — quotation creation/lines/VAT/issueDocument all ✅ (US3-1..1f). 1 PRODUCT GAP (US3-0, stageOnQuoteAcceptedId
  has no UI). 1 PRODUCT BUG (US3-3..6 red): `dealDocInput` (deals.ts:1288-1299) passes the deal CONTACT's partyId
  into `createExternalQuotation`/`createExternalInvoice`, but the B2B portal's document-visibility scope
  (`portal.ts:434`) is keyed on the COMPANY's partyId — a company-linked deal's quotation/invoice can never be
  visible in the portal. Fix belongs in `dealDocInput`: pass the deal's company partyId (or both).
- US4 ✅ 6/6 (reconfirmed prior round, unchanged).
- US5 ✅ 6/11 real + 1 PRODUCT GAP (US5-0, no compose-new-outbound-thread control) + 4 red, all traced to I1
  (`sendEmailRich`, src/lib/core/email.ts:106, no dev/QC Resend fallback → send status=FAILED): US5-2 (send itself),
  US5-3/US5-5 (open/click — RUNNER-LIMITATION-NOTED: tracking HTML is composed and sent to the provider but never
  persisted in `bodyHtml`, so the pixel/link tokens can't be recovered from the DB by ANY client, proven true even
  on non-FAILED rows from earlier rounds — not purely an I1 cascade, a separate DB-persistence limitation worth
  noting to the controller but not a new fix-list item since it doesn't block the product, only this oracle's
  ability to verify open/click without a live mail provider), US5-7 (sequence didn't stop — plausible cascade from
  no real SENT message existing to reply against; not independently re-diagnosed past I1 given round-3 time budget).
  US5-2b/2c (sender name/Reply-To) ✅ — those two checks read routing metadata set BEFORE the send attempt, so they
  independently prove C4's sender-identity mechanics work regardless of I1.
- US6 ✅ 4/4 (reconfirmed prior round, unchanged).
- US7 ✅ 7/7, ALL GREEN (rule, invoice, payment, commission PENDING→APPROVED→REVERSED with HrPayAdjustment
  kind+period verified, reversal row) — facade stand-ins (issueDocument, recordPayment/voidPayment/voidDocument)
  correctly marked `gap:true` per round-3 ask (3), not silently green.
- US8 ✅ 4/5 + 1 PRODUCT BUG (US8-3, unchanged from earlier trace: `automation.ts:671-696,909-912` — CREATE_DEAL
  structurally cannot fire for a COMPANY-parented `custom.record.field_due` trigger even with a primary contact on
  the company, confirmed by US8-3b reading the AutomationRun's own per-step skip reason).
- US9 ❌ 1/3 evaluated (US9-4 correctly gated off, not vacuous, per round-3 ask (4)): US9-2/3 red — page views never
  land in QC1's DB. Root cause = I2 (`trackerOrigin()`, tracking.ts:100→tracking-shared.ts:194-202 — posts tracking
  events to shark.in.th prod instead of this QC origin outside production), already on the fix list from the
  earlier round; reconfirmed twice now (this round + the prior us4-7-9-10 run) with identical red.
- US10 — REST/idempotency/AI-assist path all ✅ (US10-1,3-6,11-14). US10-2 (webhook registration) newly diagnosed
  above as I3 (https-only validator) — cascades to US10-7/8/8b/9/10 correctly red, not skipped.

### C4.4-fix work order (product fixes — NOT applied by this oracle, do not fix product code)
1. US2 gap: `ConvertInput` needs a `taxId` field + `linkContactInTx` needs a `role` param (contacts-shared.ts:239-246,
   companies.ts:1963-1969).
2. US3 gap: no UI to set `CrmPipeline.stageOnQuoteAcceptedId`/`stageOnQuoteRejectedId` (add to /settings/pipelines
   or /settings/stages).
3. US3 bug: `dealDocInput` (deals.ts:1288-1299) passes the CONTACT's partyId, not the COMPANY's — company-linked
   deal documents are invisible in the B2B portal (portal.ts:434 scopes by company partyId).
4. US8 bug: `automation.ts` CREATE_DEAL action (909-912) requires `s.contact`, but `resolveCrmSubject` (671-696)
   never populates it for COMPANY-parented custom-record triggers — the story's own "สัญญา" (contract) object is
   company-parented, so this action can never fire for it.
5. (I1) `sendEmailRich` (src/lib/core/email.ts:106) needs the same dev/QC fallback `sendEmail` already has — must
   never call the real Resend API from a QC/dev process.
6. (I2) `trackerOrigin()` (tracking.ts:100 → tracking-shared.ts:194-202) must resolve to the environment's own
   origin outside production — a QC page must never post tracking events to shark.in.th (cross-environment leak).
7. (I3, new this round) `crmWebhookUrlProblem` (src/lib/modules/crm/api/webhook-events.ts:42-49) hardcodes
   https-only with no dev/QC override, unlike `privateTargetsAllowed()`/`webhookTargetProblem` which already have
   one — blocks registering ANY test webhook endpoint in QC, even with `WEBHOOK_ALLOW_PRIVATE=1` set correctly
   (verified via the live server process's actual environ).

--clean confirmed after round3: 37 rows removed, QC1 back to 0 qc-jrn- rows.

One-line answer to the controller's earlier question ("which action did the permission classifier block, and did
you retry another way"): the blocked action was thana (STAFF, US2) clicking "แปลง" (convert) / US3+US7 thana issuing
a quotation/invoice — both genuinely FORBIDDEN under thana's narrow QC-seeded permissions; I did not retry as a
different actor (owner/manager) to make it pass — I used `withStaffPermissions()` to grant thana's OWN membership
the specific keys, confirmed by the controller's ruling as legitimate fixture setup (not a masked product gap).

**All 10 stories now have a fresh, classified result. Ready for the reviewer's judgment on whether C4.4 is
mergeable as an oracle with the fix list above.**

## Round 4 (30 Sep)

Runner-only changes (`scripts/crm-journeys/{lib,US4,US5,US8,US9}.mts`); no product code touched. All runs as systemd units
under `with-gate-lock.sh` on QC1 against the running `crm-qc1-serve` (:3215, SHARK_AI_MOCK=1). Journey files type-check
clean (`tsc -p .qc-shots/crm/c44-r4/tsconfig.journeys.json` → exit 0; they are inside the build's `**/*.mts` include).

### Per red check
- **US4-5b → PRODUCT GAP (now 🟧, was ❌).** Diagnosis 1 confirmed: the ถอดเสียง fieldset renders only after save
  (`CrmCallLogModal.tsx:227`) and the button only when `aiState==="READY"` (:230); the old runner looked before saving
  and attached no recording (`transcribeCall` also refuses a CALL without `recordingFileId`, calls.ts:411-413). Runner
  now drives the real order: fill → `crm-call-recording-input` (1 s WAV) → save → ถอดเสียง section. Even so the button
  cannot appear on QC: `callAiStatus` (calls.ts:350-358) → OFF unless `settings.crm.ai.callTranscribe` — no UI sets it
  (`setCrmAiKey` settings.ts:67 has no caller in src/) — and NO_PROVIDER because `getCrmTranscriber()` (transcriber.ts:53)
  is null: `registerCrmTranscriber` has no caller; SHARK_AI_MOCK mocks only the chat model (ai/provider.ts:211).
  Marked SETUP turns callTranscribe on via the module's own setCrmAiKey (path-scoped restore, try/finally) so the
  screen shows the next blocker; screenshot `journeys/US4/07-04-…png` shows the recording attached + "ยังไม่ได้เชื่อม
  บริการถอดเสียง". New real check **US4-5c** (recording stored on the CALL) ✅. If a transcriber ever registers, the
  READY branch drives transcribe → accept and US4-5b becomes a normal check. Cleanup via the product's
  `removeRecording`; `fileAsset` added to CLEAN_ORDER as fallback.
- **US9-2 / US9-3 → RUNNER (fixed, ✅).** Beyond diagnosis 2: `originAllowed` (tracking-shared.ts:161-176) accepts only
  **https** origins, and `normalizeDomain` (:146-156) rejects IPs/ports/localhost — so the plain-http QC origin can never
  be a tracked site, whatever the domain list says (by design, X7). New real check **US9-1b** ✅: the settings UI refuses
  `127.0.0.1` inline and stores nothing. Runner now: adds the shop domain `qc-jrn-shop.shark-qc.test` (reserved .test,
  mapped to loopback only via chromium `--host-resolver-rules`) through the real /settings/tracking UI; a SETUP local TLS
  terminator serves the shop's own pages containing the VERBATIM embed code (before `</body>`, as the page instructs)
  and forwards every other path only to QC (form `/f/<token>`, assets, server action). B1 guard allows exactly that
  origin (`ctx.extraAllowedOrigins`, removed in finally). No B1 aborts in the log.
- **US9-4 → RUNNER (fixed, ✅ real).** Two runner bugs: (a) every anon page shared one cookie jar, so the "decliner"
  inherited the accepter's `sd_consent=a` (never saw the banner, got tracked) → `newAnonPage({isolated:true})` = own
  browser context; (b) the old lookup by the decliner's `sd_vid` was vacuous — declining never creates sd_vid → now
  counts sessions/events carrying this run's `utm_content=<run>-decline` marker, with **US9-2b** (same query finds the
  accepter's 4 events) as positive control. Asserts banner shown + ปฏิเสธ clicked + no banner next page + 0 sessions + 0 events.
- **US5-3 → split.** **US5-3a ❌ PRODUCT BUG**: UI-composed quotation has `routing.links=[]` although its body has a URL
  and click tracking is on — `EmailComposer.tsx:98-103` HTML-escapes the body (URLs never become `<a href>`) and `:48`
  strips every tag from a picked template; `composeOutgoing` (emails.ts:924-931) only wraps `href="http(s)…"`.
  **US5-3 ✅**: tokens exist only in the HTML handed to the transport (DB keeps hashes by design, X7) and QC's dev
  fallback (`core/email.ts:128-131`) drops that HTML → marked SETUP re-sends the quotation on the same thread via the
  product's own `emails.sendEmail` with a capturing transport (= customer's mailbox; body has a real anchor to the
  shop portal on QC). **US5-3b ✅**: 302 lands on the original target.
- **US5-4 (was an unconditional pass) / US5-5 → RUNNER (fixed, ✅ real).** Customer renders the captured mail twice
  (each open its own page/context — same-page re-render reused the image, [200,-1]) and GETs the wrapped href once.
  Also: puppeteer's UA contains "HeadlessChrome" → `BOT_UA_RE` (emails-shared.ts:193) correctly refuses to count →
  Apple Mail UA. openCount==2, clickCount==1.
- **US5-7 → RUNNER (fixed, ✅).** Reply had `headers:{}`; only In-Reply-To/References set `parent`
  (emails.ts:2074-2083) and the repliedAt flip + `stopSequencesFor(REPLY)` need an OUT parent (:2186-2196). Reply now
  carries `In-Reply-To/References: <rfcId>` of the UI-sent quotation (emails.ts:1317). New **US5-6b** (repliedAt) ✅,
  **US5-7a** (enrollment ACTIVE before reply) ✅, US5-7 asserts STOPPED + reason REPLY. Sequence fixture is WAIT-first so
  the server's minute job can't advance it mid-journey.
- **US8 (was green) → RUNNER cleanup bug fixed.** The system-wide field_due rule also opens renewal deals for QC1's
  seeded contracts (tagged via the title template); they weren't registered and survived --clean (2 per run, incl. the
  10:06 acceptance run). Now every deal with this story's tag created after the rule is registered. US8 re-run 5/5,
  4 deals opened and all cleaned; the 4 stranded ones were removed via the retry manifest.

### Final run
`--journey all` (unit c44-r4-all) → `.qc-shots/crm/c44-r4/all-journeys.log`:
`JSON_SUMMARY {"total":92,"passed":89,"failures":3,"gaps":2,"fatal":null}` — non-pass = US4-5b 🟧, US5-0-GAP 🟧,
US5-3a ❌ (product bug). `--clean` after: 53 rows; after the US8 re-run: 9 more (US8 5/5). Shared settings restored
(`crm.ai` absent, `crm.tracking.web.domains` back to null). Leftover probe: **0 rows from round 4**; **45 qc-jrn rows
remain, all created 28 Sep** (12 contacts, 7 companies, 10 deals, 1 sequence, 2 forms, 3 emails, 10 activities —
from earlier rounds, not in any manifest). Not deleted — controller's call.

### Product fix list (new this round)
1. BUG — `EmailComposer.tsx:98-103` / `:48`: CRM-UI emails can never carry a tracked link (URLs not linkified;
   template anchors stripped) ⇒ click tracking is dead for staff-composed mail although the setting is on.
2. GAP — call transcription: no STT provider registered (`transcriber.ts:53`, `registerCrmTranscriber` uncalled) and no
   settings UI for `settings.crm.ai.callTranscribe` (`setCrmAiKey` settings.ts:67 uncalled).
3. BUG (small) — `CRM_CALL_AI_OFF_MSG` (calls-shared.ts:147) sends staff to "ตั้งค่า CRM → ผู้ช่วย AI", which doesn't
   exist on the CRM settings index.
4. OBSERVATION — replies matched only by the `+t<short>` address tag or by subject (emails.ts:2084-2106) never set
   `repliedAt` or stop sequences (parent is set only from In-Reply-To/References).
5. OBSERVATION (design) — form→session binding reads `sd_vid` from the FORM request's own host cookie
   (f/[token]/actions.ts:19-25) ⇒ retroactive linking works only if the form is served on the same host as the tracked
   site (custom domain in front of SHARK); a shop site on its own domain linking to shark.in.th/f/<token> gets no binding.
6. QC-env note — web tracking can't be exercised on the plain-http QC origin (https-only origin, no IP domains — correct
   for prod); the oracle now uses a TLS shop domain.

## Round 5 (30 Sep)

Reviewer verdict on r4: NOT MERGEABLE (R4-B1) — `ledger/wo-notes/crm-C4.4-review-r4.md`. Runner-only changes again
(`scripts/crm-journeys/{lib,US4,US5,US8,US9}.mts`, uncommitted on top of 7e67abd4). Journey files type-check clean
(scoped tsc, exit 0). Runs: `c44-r5-a` (N7 restore + US4,US8,US9) and `c44-r5-all` (`--journey all` + `--clean` + probe),
all under with-gate-lock on QC1 / crm-qc1-serve.

### Per finding
- **R4-B1 (BLOCKER) → fixed; US9-3 is now an honest ❌ PRODUCT BUG (HIGH).** US9.mts:5-40 header + :41-66
  `startShopSite`: the shop site serves ONLY /shop/p1..p3 + /shop/contact (favicon 204, everything else 404),
  forwards NOTHING. /shop/contact pastes the form embed code read from the real UI (`crm-forms-embed-<formId>` on
  /settings/forms, US9.mts:~126-139; new check **US9-1c** ✅ = the product's `<iframe src="<APP_URL>/f/<token>">`),
  the visitor fills the form INSIDE that iframe (loaded from the QC origin, as in production), and US9-3 asserts the
  binding (US9.mts:206-212). Result: form submitted and contact created (**US9-3a** ✅), 3 page views (US9-2 ✅), but
  `formSubmission.webSessionId = null` and the session is NOT bound → **US9-3 ❌**. Screenshot
  `journeys/US9/07-06-form-submitted-in-iframe.png`.
- **Identify-ticket map (for the product-fix lane)** — also in US9.mts header:
  exists: `emailClickTicket` (tracking.ts:158, AES-GCM, one-shot jti, 15 min) → `appendIdentifyTicket` (tracking.ts:210,
  only for URLs on the shop's domains) — its ONLY caller is `ticketedClickUrl` (tracking.ts:1380-1417) on `/t/c` e-mail
  clicks; the tracker reads `?sd_ct` from `location.search` and posts `t:"identify"` (tracking.ts:1522-1537) →
  `collect` (tracking.ts:870-877) → `readIdentifyTicket` + `consumeIdentifyTicket` → `identify(by:"EMAIL_CLICK")`.
  Form path: `f/[token]/actions.ts:19-25` reads `sd_vid` only from its own request cookies (caller-supplied ids
  deliberately dropped, :9-12) → `forms/service.ts:370-371` `submissionWebSessionId` → `crm-bridges/forms.ts:190-197`
  `identify(by:"FORM")`.
  NOT wired: (1) the tracker never decorates links or iframes (no DOM scan in `trackerScript`); (2) no signed
  ticket exists for FORM — nothing hands the visitor id/ticket to the `/f/` iframe (`formEmbedCode`,
  forms/service.ts:390-394, is a bare iframe) or link; (3) `IDENTIFY_BY` "PORTAL"/"LINK" (tracking-shared.ts:70) have
  no producer anywhere in src/. Net: with the product's own embed, retroactive form binding never happens.
- **R4-S1 → fixed.** US4.mts:252-266: 🟧 only when section UNAVAILABLE and text === `CRM_TRANSCRIBER_MISSING_MSG`
  (read from calls-shared at run time); section absent / not reached / OFF text = ❌ "REGRESSION (not the known gap)".
- **R4-S2 → added US4-5d 🟧.** US4.mts:138-165: owner opens /crm/settings + /crm/settings/integrations, searches
  controls labelled ถอดเสียง/transcri*; none found → red-for-gap (screens `journeys/US4/06-00-*`). Passes only when a
  real UI control appears.
- **R4-S3 → fixed.** US8.mts:9-36: `run` wraps `runInner` in try/finally; finally disables the rule through the
  product's `toggleRule(false)` (fallback: row enabled=false), THEN snapshots every deal with "(qc-jrn-us8)" created
  ≥ rule.createdAt. Log: "enabled after teardown: false", 4 deals registered. `--clean` fallback sweep by title tag
  (lib.mts:745-755).
- **R4-S4 → fixed.** lib.mts:250-285: key/cert generated at launch, SPKI pin
  (`--ignore-certificate-errors-spki-list=<sha256>`) + `--host-resolver-rules` added ONLY when US9 is selected
  (lib.mts:859). No global `--ignore-certificate-errors`. US9 reuses the launch cert (`lib.shopTls()`).
- **N1** US9.mts:238-252: 2 s settle, then re-read until two reads agree. **N2** US9-2b now asserts sessions
  (firstUrl marker, got 1) AND events (got 3). **N3** US5-3/3b/4/5 texts now start "[on the SETUP re-send —
  API/template-shaped mail …]" (US5.mts:~200-). Template-with-link variant of US5-3a not added (typed URL evidence kept).
- **N5** `--clean` removes `fileAsset` through the product's `storage.deleteFileAsset` (stored object + row,
  lib.mts:717-735); US4 appends each recording id to `journeys/us4-recording-fileassets.log`; the probe checks those ids
  (probe no longer queries a non-existent `filename` column). Final probe: 2 ids checked, 0 remain. The --clean
  fallback itself found nothing to delete (removeRecording had already run), so the fallback's storage delete is
  exercised only as a no-op.
- **N6** lib.mts:445-452: each story's *.png (and stale tls-*) wiped at run start; created.json kept.
- **N7 → LEAK CONFIRMED and restored.** AuditLog `crm.tracking.web.settings`: pre-C4.4 suite runs (28 Sep 02:13,
  03:36) each re-issued a fresh `siteKey` (their restore had removed it); the last issue is 28 Sep 05:26:23 by owner =
  C4.4 US9 round 1 (contact 05:26:37), after which `enabled:true` + siteKey `viSzWELljmZ…` persisted — rounds 1-2 never
  restored. Seed never enables tracking (visual-crm.mts:1304). Restored the baseline (key absent) with a path-scoped
  `settings #- '{crm,tracking}'` under the lock (`.qc-shots/crm/c44-r5/n7-restore.log`: BEFORE {web:{enabled:true,…}}
  → AFTER null; crm keys left: email, portal, uiVersion). US9's snapshot now restores to that baseline each run.
- **N4 (code reading only, provider not called):** (1) `deliver()` sets `Message-ID: <rfcId>` (emails.ts:1316-1321)
  and stores `<systemId>:<rfcId>` before sending; `core/email.ts:140` forwards `headers` verbatim to Resend; Resend's
  returned id is kept only as `providerId` (emails.ts:1360) and never used for matching. (2) The inbound matcher sets
  `parent` — and therefore `repliedAt` + `stopSequencesFor(REPLY)` (emails.ts:2186-2196) — only when In-Reply-To/
  References contain OUR rfcId (emails.ts:2074-2083), i.e. the code assumes the provider delivers our Message-ID
  unchanged. (3) If the provider rewrites it, replies still thread via the Reply-To `+t<short>` tag (tier 2,
  emails.ts:2084-2094) or subject, but `parent` stays null ⇒ no repliedAt, no stop-on-reply — unverifiable on QC.
- 45 stale qc-jrn rows of 28 Sep: left as ruled.

### Final run
`--journey all` (unit c44-r5-all) → `.qc-shots/crm/c44-r5/all-journeys.log`:
`JSON_SUMMARY {"total":95,"passed":90,"failures":5,"gaps":3,"fatal":null}` · 0 B1 aborts.
- 🟧 US4-5d — PRODUCT GAP: no settings UI to turn call transcription on.
- 🟧 US4-5b — PRODUCT GAP: no STT provider registered (exact transcriber-missing signature).
- 🟧 US5-0-GAP — PRODUCT GAP: no compose-new-thread control (known, ruled).
- ❌ US5-3a — PRODUCT BUG (MED): CRM-UI composer never produces tracked links.
- ❌ US9-3 — PRODUCT BUG (HIGH): retroactive web-visit binding never happens with the product's own form embed.
`--clean`: 56 rows (incl. 12 crmDeal, fileAsset via storage). Probe: 0 rows from round 5; 45 pre-existing 28 Sep rows;
0 shop-host web sessions; recording FileAssets 0/2 remain; `crm.ai` absent, `crm.tracking` absent (baseline).

### Product fix list (updated)
1. BUG HIGH (R4-B1) — form→web-session binding unreachable for the product's own embed: sd_vid is host-only on the
   shop domain; `/f/` iframe (forms/service.ts:390-394) never carries it; actions.ts:19-25 cookie-only; no FORM ticket;
   tracker decorates nothing. Mechanism to extend: the existing signed one-shot ticket (`emailClickTicket`/
   `readIdentifyTicket`/`consumeIdentifyTicket`) — e.g. tracker passes a ticket/visitor proof into the iframe.
2. BUG MED — EmailComposer.tsx:98-103 / :48: UI mail never carries tracked links (template anchors stripped).
3. GAP — call transcription: no STT provider (transcriber.ts:53) + no settings UI (setCrmAiKey settings.ts:67 uncalled).
4. BUG LOW — CRM_CALL_AI_OFF_MSG (calls-shared.ts:147) points to a non-existent settings section.
5. OBSERVATION (severity depends on N4) — replies matched only by +t tag / subject never set parent ⇒ no stop-on-reply;
   HIGH if the mail provider rewrites Message-ID. Cheap fix: a +t match may take the thread's latest OUT as parent.

### Not verified
- Whether Resend preserves our Message-ID (N4) — needs one real send, not done by rule.
- The READY branch of US4 (no transcriber exists). The `--clean` fileAsset fallback only ran as a no-op.

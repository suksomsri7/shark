# C4.2 addendum — oracle-proposed contract for `scripts/qc-crm-buttons.mts` (controller to confirm)

Written by the oracle/runner writer at commit `a06a796b` (worktree `shark-crm-c23`, QC3 branch). The brief
(`crm-brief-C4.md` §C4.2) and MASTER-PLAN §7 fix the shape of the output (`{total, passed, dead[], wrongExpect[],
hiddenLeak[], consoleErrors[], overflow[]}`, gate `passed === total`) but leave the exact semantics of "perform the
row's action" and "assert the row's expect" to the runner, because the registry (`scripts/crm-ui-inventory.json`,
1,144 rows) does not encode enough per-row detail to make every action/assertion unambiguous. Every decision below
is a DECISION THIS RUNNER MAKES, not a fact derived from the brief — if the controller wants different behaviour,
the fix belongs in `scripts/qc-crm-buttons.mts` (this file only documents what it currently does and why).

## 1. Assumptions about `expect` semantics (per `expect.type`)

| type | this runner's action |
|---|---|
| `modal` / `toast` | wait up to 5 s for `[data-testid="<target>"]` to appear; closes modals with `Escape` afterwards so the next row on the same page starts clean. **~16 rows** put Thai/English prose in `target` instead of a testid (e.g. `contacts-import-cancel` → `"contacts-import-modal (ปิด)"`, `deal-lost-cancel` → `"(ปิดหน้าต่าง · การ์ดกลับที่เดิม) · ใช้ร่วมบนหน้า /deals/[dealId] (stepper)"`) — a literal selector built from that string would never match, so this runner detects "not testid-shaped" (`/^[A-Za-z][A-Za-z0-9-]*\*?$/`) and falls back to the same soft pass as `inline-error` below, rather than reporting every "cancel"/"close" button as a false `wrongExpect`. |
| `navigate` | `page.url()`'s pathname must match the FIRST whitespace-delimited token of `target`, brackets/`<…>` treated as a wildcard path segment; a trailing `?…` is NOT compared. **4 rows** append commentary after the real path (`deal-req-open-link` → `"/deals/[dealId] · ใช้ร่วมบนหน้า /deals/[dealId] (stepper)"`) or have no real path at all (`deal-new-cancel` → `"(ย้อนกลับ)"`) — the first token is checked for "starts with `/`" before being treated as a path; if it doesn't, same soft-pass fallback. |
| `download` | a network response fired during the action whose content-type or URL suffix looks like a file (`csv`/`pdf`/`xlsx`/`octet-stream`/`spreadsheet`) — byte length is NOT checked (puppeteer-core does not expose response bodies for same-page downloads without extra CDP wiring, which this WO's budget did not extend to) |
| `mutation` | (a) at least one non-GET-ish network response fired during the action and none was ≥400 — this is the ONLY signal for rows whose `db` text can't be parsed; (b) when `db` DOES parse (see §2) that check must also hold |
| `inline-error` | **soft pass** — satisfied as soon as the row is not `dead`. This runner always types/selects a VALID value (see §3); it never submits deliberately-bad input, so it cannot tell "the field silently accepted a valid value" apart from "the field would have shown an error and didn't". Per `crm-brief-C4.md`, deliberately-bad input / exact inline-error-message assertions are **C4.3's job**, not C4.2's — this runner does not duplicate that work with a half-real heuristic. |

**Controller decision needed:** is the `inline-error` soft-pass acceptable for C4.2's gate, or should C4.2 also
assert something machine-checkable for these 508 rows (roughly 44% of the registry)? If the latter, the registry
needs a second field (e.g. `expect.validTarget`) naming what SHOULD change on a valid submission, because today
`target` for `inline-error` rows always names the *error* container, not a success signal.

## 2. DB-diff heuristic (best-effort, not a full oracle)

`expect.db` is free-text (mixed Thai/English), written per-row by ~20 different work orders over months — it was
never meant to be machine-parsed. This runner parses two shapes, split on `" · "`:
- `Model +1` / `Model -1` — row count of that Prisma model changed by exactly that delta. Scoped by `systemId` when
  the model has one (`CrmDeal`, `CrmContact`, `CrmCompany`, `CrmActivity`, `CrmSequence`, `CrmEmailMessage`,
  `CustomRecord`, `CrmPortalAccess`), else `tenantId` — **deliberately narrower than `tenantId` where possible**,
  because the QC database is shared by concurrent sessions/oracles (COMMON brief) and a `tenantId`-wide count taken
  a few hundred ms apart is not safe against noise from another suite running against the same seeded shop.
- `Model.column=value` — the row identified by the CURRENT page's primary entity id (deal/contact/company/custom
  record, picked by matching `page.includes("deals"|"contacts"|"companies")`) now has that column equal to `value`
  (best-effort string/boolean/null coercion).
- Everything else (nested JSON paths like `AppSystem.settings.crm.businessTemplate`, prose like "ยอดบิล", `+=`
  deltas, multi-row effects like "HrPayAdjustment(kind COMMISSION…) of rows already APPROVED") is **not** mechanically
  checked. These clauses are collected into `dbCheckUnparsed` in `.qc-shots/crm/buttons/summary.json`, keyed
  `<page>#<testid>`. The row still needs the network-ok signal above to count as `passed`.

Rows whose entire `db` text is one unparsed clause are, in effect, checked structurally only (network fired + no
≥400). The controller should treat `dbCheckUnparsed` as a to-do list, not a bug list — most of these need either a
richer per-row DSL in the registry, or a small set of per-row exceptions hand-written into the oracle (the way
`scripts/qc-crm-c1.1.mts`-style oracles hand-check each acceptance item), not a smarter generic parser.

## 3. Action-by-`kind` (what "perform the row's action" means)

- `button` / `link` / `menu` / `tab` / `toggle` → `page.click()`.
- `select` → pick the first `<option>` whose value differs from the one currently selected (falls back to the last
  option if every option is already selected, e.g. a single-option list).
- `input` / `textarea` → select-all + type a generic value shaped by the testid, then `Tab` to blur/commit:
  `…email` → `qc-btn-<rand>@example.com` · `…phone` → `08########` · `…qty`/`…quantity` → `"1"` ·
  `…price`/`…amount`/`…satang`/`…discount`/`…days` → `"100"` · `…from`/`…to`/`…hour` near `window`/`quiet`/`digest`
  → `"09:00"` · `…date` → today's ISO date · else → `qc-btn-<rand>`. **This is coarse on purpose** — C4.2 presses
  the control with *a* valid-looking value to prove the control works; it does not attempt per-field business-rule
  validity (e.g. it will happily type `"100"` into a discount-percent field capped at 30%, or `qc-btn-<rand>` into a
  URL field). Rows where this produces a wrong-looking `wrongExpect` (most likely: percentage/enum-constrained
  inputs, and the webhook URL field which will fail URL-format validation) are exactly the kind of finding this
  addendum exists to surface — check `wrongExpect[]` for `*-url`, `*-percent`, `*-rate` testids before treating them
  as real bugs.
- `form` → if the element resolves to an actual `<form>` tag, `requestSubmit()` (fallback: dispatch a `submit`
  event); otherwise `click()` it. **Ambiguity**: the registry's `kind: "form"` (159 rows) is used for two different
  things in practice — real `<form>` containers meant to be submitted whole, AND composite filter/inline widgets
  (e.g. `contacts-filter-form`, `pos-deal-hint`, `crm-notify-page`) that are not meant to be "submitted" at all.
  This runner's tag-sniff handles the first case correctly and degrades to a plain click for the second, which is
  usually harmless (many of those rows expect `navigate` via query-string changes anyway) but is not guaranteed
  correct for every row. **Recommend C4.1** split `kind: "form"` into `form` (real submit) and a more specific kind
  for the composite/filter widgets, so C4.2 (or its successor) can stop guessing from the DOM tag name.
- `drag` → SKIPPED, not counted in `total`/`passed`. The one `drag`-kind row in today's registry (`/deals`
  `deal-card-*`, the Kanban drag-to-move-stage gesture) has no drop-target column id in its row — `expect.target` is
  `"op:deals.moveDeal (...)"`, an op name, not a "drop onto this column" testid. **Recommend C4.1** add an
  `expect.dropTarget` (or similar) field naming the destination column's testid before this is worth automating —
  the same gesture IS already covered by `visual-crm.mts`'s scripted `drag`/`dragBy` steps for specific WOs, so this
  is a coverage gap for C4.2's generic sweep only, not an untested gesture overall.

## 4. Safety guard — rows that reach a real external send (never pressed for real)

Confirmed by reading the source (not guessed) that these reach a transport call on the ALREADY-RUNNING QC server
process, which this client-side (puppeteer) runner cannot sandbox — it is not our `fetch`/env to patch:

| testid | path | why it's guarded |
|---|---|---|
| `crm-email-send` | `src/lib/modules/crm/emails.ts` → `sendCrmEmailAction` | outbound CRM e-mail, real transport (C2.5) |
| `crm-email-test-send` | `/settings/email` | registry's own `db` text says it outright: "ส่งถึงอีเมลของคนที่กดเท่านั้น" |
| `portal-otp-request` | `src/lib/modules/crm/portal.ts:245 requestOtp()` → `src/lib/modules/member/customer-session.ts:746 requestPortalOtp()` → line ~758 `sendOtpMailOffPath()` → `sendEmail()`, called SYNCHRONOUSLY when the submitted target is a known portal contact's e-mail. The `QC_OTP_PREVIEW` dev switch (`customer-session.ts:62`) only adds `devOtp` to the JSON response — it does **not** skip the send call. |

These three are excluded from `total`/`passed` entirely (bucketed into `skippedSafety[]`); only their
visibility/`hiddenLeak` is still checked.

`crm-portal-invite-submit` (`src/lib/modules/crm/portal.ts:1062 invite()`, line ~1103: `if (to &&
methods.includes("EMAIL_OTP")) … sendEmail(...)`) is handled differently: this runner explicitly leaves the
`crm-portal-invite-email` toggle OFF before ever reaching submit (special-cased in the row loop), so `methods` sent
to `invite()` never contains `"EMAIL_OTP"` — the send branch is structurally unreachable regardless of which
contact/company the runner happens to be on. `crm-portal-invite-line` is NOT forced ON (see caveat below); if both
toggles end up off, `invite()` throws a validation error (`"เลือกวิธีเข้าสู่ระบบอย่างน้อย 1 วิธี"`) which is still a
200 response with `ok:false` from the runner's point of view (no ≥400), so this row may show as `passed` without
having created a `CrmPortalAccess` row. **The safety property — no real e-mail — holds either way**; only the
"did the invite functionally succeed" signal is soft. Recommend a dedicated pre-step ("ensure LINE toggle ON, e-mail
toggle OFF") if the controller wants this row's functional result to be trustworthy, not just safe.

**Controller/product recommendation**: the only durable fix for the first three rows is either (a) a
dependency-injection seam on the server side (the same pattern `scripts/qc-webhook.mts`/`scripts/qc-chat-*.mts` use
for in-process route calls — not available here because this runner drives an already-running server over HTTP,
not an imported route handler), or (b) starting the QC server for C4.2 runs with a neutralised `RESEND_API_KEY`
and `QC_OTP_PREVIEW=1` (the latter still doesn't stop the send, only adds a preview — (a) or a genuinely fake
transport is the real fix).

## 5. Portal/customer fixture (no seed fixture exists today)

`scripts/crm-qc-env.mts`/`scripts/seed-crm-qc.mts` seed no `CrmPortalAccess` row at all, and
`settings.crm.portal.enabled` is false by default. To exercise the `customer` role and the ~35 registry rows that
name it, this runner:
1. Reads `AppSystem.settings.crm.portal.enabled`; if false, flips it to `true` via a single `jsonb_set` statement
   (same pattern as `writeMemberSettingsKey`), remembering the previous value.
2. Reuses an existing `CrmPortalAccess` for `(companyId, contactId)` = the seed's first company/contact if one
   already exists, else creates one **directly via Prisma** (not through `invite()`, precisely to avoid the e-mail
   branch above) with `loginMethods: ["LINE"]` and `acceptedAt` already set, so `mintPortalSession()` alone is
   enough — matching `visual-crm.mts`'s own `--user customer:<code>` convention (`code` = `CrmPortalAccess.id`).
3. In CLEAN: deletes that access row (only if this run created it) and restores `portal.enabled` to whatever it
   was before (only if this run changed it).

**Controller decision needed**: is a QC-run-created portal fixture acceptable, or should a permanent one be added
to `seed-crm-qc.mts`/`crm-qc-env.mts`'s documented contract instead (so every WO's oracle can rely on it, not just
this one)? Given the shared-DB warning in COMMON brief, a permanent seeded fixture would be more robust against two
sessions racing to create/delete the same company+contact pair.

## 6. Registry rows this runner could not resolve a concrete page for

These are not registry bugs by themselves — they are **live-seed gaps**: the registry row is real and correct, but
today's QC seed has nothing to point the URL at. The runner marks them SKIPPED (not counted in `total`) and reports
the reason in `.qc-shots/crm/buttons/plan-dry.json`'s `skipped[]` (grouped by reason, with counts) every time it
runs `--dry`. As of this WO (no live DB access yet — see machine-rule note at the top of the task), the STATIC
placeholders that can never resolve without further work are:

| placeholder | pages affected (registry row counts) | why |
|---|---|---|
| `docType`/`docId` | `/app/sys/[id]/account/docs/[docType]/[docId]` (1 row) | resolver intentionally left unbuilt — the account-document model/relation name was not verified against `prisma/schema/account*.prisma` within this WO's budget; guessing wrong risked silently pointing at an unrelated tenant's document rather than just skipping |
| `token` | `/u/[token]` (1), `/b/[slug]/invite/[token]` (1) | no tracked-link / pending-invite token resolver built; a real invite token could be minted by actually running `crm-portal-invite-submit` first and capturing `inviteUrl`'s token segment, which this runner does not currently do (the invite is exercised for its OWN row, but the resulting token isn't fed back into the page-URL resolver for OTHER rows) |
| `threadKey` | `/emails/[threadKey]` (17 rows) | resolved from a LIVE query (`CrmEmailMessage` for this `systemId`) — will work if the seed happens to have one, SKIPPED if not; not created as a fixture (an authentic e-mail thread needs the real inbound/outbound pipeline, not a hand-inserted row) |
| `sequenceId` | `/settings/sequences/[sequenceId]` (43 rows) | same as above — live query only, no fixture creation |
| `recordId` (non-contract objects) | `/objects/[key]/[recordId]` (3 rows) | only the "contract" object (`crm-expected.json#contractObjectId`) is resolved; the other 7 object templates (รถ/ทรัพย์สิน/กรมธรรม์/อสังหาฯ/โครงการ/ผู้เรียน/สัตว์เลี้ยง) have no id in the answer key and are not queried for individually — `/objects/[key]` (32 rows, list pages, no `recordId` needed) is unaffected |
| `chatId`/`conversationId` | `/app/sys/[chatId]?c=[conversationId]` (9 rows) | live best-effort query (match a `ChatConversation`'s `ChatContact.phone` to the seed's representative contact, falling back to ANY conversation in the CHAT system) — SKIPPED if the CHAT system has zero conversations |

Everything else (deal/contact/company ids, party id via the representative contact, object key + record id for
"contract", the tenant's portal slug, and all system ids used as `/app/sys/[id]/...` for POS/MEMBER/HR) resolves
from `scripts/crm-expected.json` or a narrow live query and should work whenever the standard `crm-seed` has run.

## 7. Page-path inconsistencies in the registry (recommend C4.1 fix, not a C4.2 bug)

- `/companies/[id]` (11 rows, all C3.5 portal-invite rows) and `/contacts/[id]` (8 rows, all C1.6 file/activity rows)
  use a different bracket name than the real Next.js route folders (`src/app/app/sys/[id]/crm/companies/[companyId]`,
  `.../contacts/[contactId]`). This runner aliases them (`PAGE_ALIAS`) so both groups land on the one real page, but
  the registry itself should be normalised to `[companyId]`/`[contactId]` everywhere — two names for the same page
  is exactly the kind of drift F14.2 ("no ghost rows / no duplicate identity") is meant to prevent structurally,
  even though today's F14 testid-existence check doesn't look at `page` values at all.
- `/contacts · /companies · /deals` (8 rows, the `crm-view-*` saved-view menu component) names three pages in one
  string. This runner tests it once, on `/contacts`, since the component is shared verbatim across all three list
  pages (`src/components/member/MembersSavedViewsMenu.tsx`-style reuse per `crm-brief-C4.md`'s cross-check note) —
  recommend either three separate row-groups (one per page) or an explicit convention for "same component, multiple
  hosts" if this pattern recurs.
- `/app/sys/[id] (HR hub)` embeds a human-readable annotation inside the `page` field itself (not a real URL
  segment). This runner strips the trailing `(...)` before building a URL. Recommend moving such notes to a
  sibling field (there is room in the schema for one) rather than the `page` string.
- Same class of problem inside `expect.target` (not `page`): ~16 `modal`/`toast` rows and 4 `navigate` rows carry
  Thai/English commentary instead of (or appended after) a real testid/path — see §1's table for the exact rows and
  this runner's fallback. Recommend the same fix: a real testid/path in `target` always, commentary in a sibling
  field (or dropped — the `note`/mockup cross-reference already lives elsewhere).

## 8. `kind: "textarea"` is not in the documented vocabulary

`scripts/crm-ui-inventory.json`'s own `$fields.kind` doc string lists `button | link | menu | tab | toggle | drag |
form | input | select` — three rows in the current registry use `kind: "textarea"` (undocumented but handled
identically to `input` by this runner, and by `fitness.mts`'s testid scanner via `INTERACTIVE_TAGS`). Cosmetic only
— recommend adding it to the doc string.

## 9. How to read `.qc-shots/crm/buttons/summary.json` and `plan-dry.json`

- `summary.json` (real run): `{total, passed, dead[], wrongExpect[], hiddenLeak[], consoleErrors[], overflow[],
  skippedSafety[], dbCheckUnparsed{}, fatal}`. Gate is `passed === total` per the brief; `skippedSafety` and the
  registry-gap SKIPs from §6 are excluded from `total` by design (see §4/§6), not silently dropped — they are
  fully itemised so the controller can see exactly what was never attempted and why.
- `plan-dry.json` (`--dry`): `{total, byUser, skipped[]}` — run this FIRST after any registry/seed change to see
  the resolvable/unresolvable split before spending browser time.
- One JSON file per registry `page` value is also written (`.qc-shots/crm/buttons/<page-slug>.json`) with one entry
  per (user, viewport) load: `{user, device, status, results[], consoleErrors[], httpErrors[], overflow}`.

## 10. Known limitations not worth fixing in this pass (time/scope)

- The dead-control detector's "network" signal counts ANY request on the page during the 3 s window, including
  unrelated polling/heartbeats — this biases toward NOT flagging a dead control (a false "not dead"), never the
  reverse. Acceptable for a first pass; tightening it would mean filtering to same-origin non-GET requests only.
- `download` rows check content-type/URL shape only, not byte count (no CDP response-body wiring in this pass).
- Console-error and overflow capture are per PAGE LOAD (aggregated across all rows tested on that load), not
  per-row — a console error caused by row #3's action will be attributed to the whole page load, not to row #3
  specifically. Narrowing this to a per-action window is possible but wasn't worth the added per-row overhead
  given the run's total size (thousands of page-loads across 5 roles × 2 viewports already).

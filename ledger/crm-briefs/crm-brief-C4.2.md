# C4.2 addendum — oracle-proposed contract for `scripts/qc-crm-buttons.mts` (controller to confirm)

Written by the oracle/runner writer at commit `a06a796b` (worktree `shark-crm-c23`, QC3 branch). The brief
(`crm-brief-C4.md` §C4.2) and MASTER-PLAN §7 fix the shape of the output (`{total, passed, dead[], wrongExpect[],
hiddenLeak[], consoleErrors[], overflow[]}`, gate `passed === total`) but leave the exact semantics of "perform the
row's action" and "assert the row's expect" to the runner, because the registry (`scripts/crm-ui-inventory.json`,
1,144 rows) does not encode enough per-row detail to make every action/assertion unambiguous. Every decision below
is a DECISION THIS RUNNER MAKES, not a fact derived from the brief — if the controller wants different behaviour,
the fix belongs in `scripts/qc-crm-buttons.mts` (this file only documents what it currently does and why).

> **Update (27 Sep 2569, same day, after C4.1 rewrote the registry — ledger/wo-notes/crm-C4.1.md):** the registry
> went from 1,144 → 1,055 rows and gained a machine-readable vocabulary (`system` · `query` · `alsoOn` · `ui`
> expect-type with `state` · `anyOf` · `resultTarget` · `dropTarget` · `history:back` · `mailto:*`) specifically to
> close the gaps this addendum's §1/§3/§7 complained about. `scripts/qc-crm-buttons.mts` was updated to match
> (registry/product code untouched, per the controller's instruction). Sections below marked **[C4.1-RESOLVED]**
> describe the OLD behaviour for history; the current behaviour is in the code + the CONTRACT block at the top of
> the file. `--dry` on QC3 right after this update: 7,070 presses, 372 skips (vs the C4.1 builder's own `--dry` of
> ~7,142/~336 minutes earlier on the SAME QC3 branch — a real reseed between the two runs, not a regression: every
> extra skip had a matching structural counterpart, e.g. `sequenceId` unresolved for nok/thana dropped 38→27 each).
>
> **Update 2 (same day, round 2 — ledger/wo-notes/crm-C4.1.md §7/§8, registry 1,055 → 1,052 rows):** added `only`/
> `not` handling, bare-`*` support in `navMatches`, and corner-clicks for `*-backdrop` rows — see §11 below. `--dry`
> on QC3 after THIS update: **7,122 presses, 368 skips** (`pnpm typecheck` exit 0 both times — logs in this run's
> handback). The `only` expansion is why total went UP despite the registry shrinking (`company-new-*` alone: 1 row
> → 8 independent plan items × roles × viewports).

## 1. Assumptions about `expect` semantics (per `expect.type`)

**[C4.1-RESOLVED]** the previous revision of this section documented a prose-detection fallback for ~16 `modal`/
`toast` rows and 4 `navigate` rows whose `target` was Thai/English commentary instead of a real testid/path (e.g.
`"contacts-import-modal (ปิด)"`, `"(ย้อนกลับ)"`). C4.1's rewrite (ledger/wo-notes/crm-C4.1.md §3, validated with
`.qc-shots/c41/validate.py` → 0 remaining prose) replaced those with the `ui` type (+ `state`), `history:back`, and
`mailto:*`, all handled explicitly now — the "is this even a selector/path" defensive fallback is gone from the
navigate/modal code paths (no longer needed; `looksLikeTestid` still exists but now only gates the shape of a real
testid, including mid-name `*`).

| type | this runner's action |
|---|---|
| `modal` / `toast` | wait up to 5 s for `[data-testid="<target>"]` (or any of `anyOf`) to appear — **never auto-dismissed** (changed from the previous revision, which pressed `Escape` after every modal-type row). Registry row ORDER puts the opener before the modal's inner-field/cancel rows on the SAME page load; auto-closing here would make every one of those later rows falsely `dead`-missing. The eventual `ui`+`disappears` (cancel) row closes it for real. |
| `navigate` | `page.url()`'s pathname must match `target` (or any of `anyOf`) — brackets/`<…>` → wildcard path segment, trailing `?…` ignored — UNLESS `target`/`anyOf` is `"history:back"` or starts with `"mailto:"`, which cannot be asserted via `page.url()` (soft pass; the registry's own `note` on those rows says so explicitly, e.g. `deal-new-cancel`: "router.back() — เปิดตรงจากลิงก์ = ไม่มีหน้าให้กลับ"). |
| `ui` (new in C4.1) | `target` (a testid, possibly `*`-patterned) must, per `state`: **appears** (default) → become visible · **disappears** → become absent/invisible (polled up to 3 s) · **changes** → its `outerHTML` differ from a snapshot taken immediately BEFORE the action. The "changes" case also covers `target` being a DIFFERENT element than the one acted on (e.g. `company-pick-*-q` input → `company-pick-*-select` sibling changes after a debounced server search). |
| `download` | a network response fired during the action whose content-type or URL suffix looks like a file (`csv`/`pdf`/`xlsx`/`octet-stream`/`spreadsheet`) — byte length is NOT checked (puppeteer-core does not expose response bodies for same-page downloads without extra CDP wiring, which this WO's budget did not extend to) |
| `mutation` | (a) at least one non-GET-ish network response fired during the action and none was ≥400 — this is the ONLY signal for rows whose `db` text can't be parsed; (b) when `db` DOES parse (see §2) that check must also hold; (c) NEW — when `resultTarget` is set (8 rows), it must also appear within 5 s (a result/confirmation testid, sometimes inside a modal, e.g. `crm-report-schedule-save` → `resultTarget: "crm-report-schedule-modal"`). |
| `inline-error` | **soft pass, unchanged** — satisfied as soon as the row is not `dead`. C4.1 pointed every `target` at a REAL testid now (`deal-fields-msg`, `st-msg-*`, …, no more prose), but this runner still never submits deliberately-bad input, so it still cannot tell "silently accepted" apart from "validation broken". Per `crm-brief-C4.md`, deliberately-bad input / exact inline-error-message assertions are **C4.3's job**, not C4.2's. |

**Controller decision needed (unchanged):** is the `inline-error` soft-pass acceptable for C4.2's gate, or should
C4.2 also assert something machine-checkable for these 417 rows (~40% of the current 1,055-row registry)? The
`target` now being a real testid makes this MORE feasible than before (e.g. "assert the error container's
`textContent` is empty/hidden after a valid submit") but still needs a deliberately-bad-input pass to be meaningful,
which is explicitly out of scope for C4.2 per the brief.

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
- `form` / `filter` → if the element resolves to an actual `<form>` tag, `requestSubmit()` (fallback: dispatch a
  `submit` event); otherwise `click()` it. **[C4.1-RESOLVED]** the old `kind:"form"` ambiguity (real `<form>` vs.
  composite filter/inline widget, 159 rows) is gone: C4.1 removed the 94 non-control "form" rows that pointed at
  boxes/text/tables (they remain usable as `expect.target`s, per ledger/wo-notes/crm-C4.1.md §3), changed rows that
  were really a `<select>`/`<input>` to their real kind, and split the true GET-only filter forms into a NEW
  `kind:"filter"` (9 rows, e.g. `contacts-filter-form`, `deals-filter-form`) — confirmed by reading the registry:
  every remaining `filter`-kind row's testid ends in `-form` and is a real `<form method=get>`. This runner treats
  `form` and `filter` identically (same tag-sniff + `requestSubmit()`), which is now correct for both by construction.
- `drag` → now performs a real drag: mouse-down on the testid, move in 12 steps onto the LAST DOM element matching
  `expect.dropTarget` (a testid pattern, e.g. `deal-column-*`), mouse-up. **Remaining assumption**: "last match" is a
  best-effort heuristic to land on a column different from the card's own (the row doesn't say which card starts in
  which column) — only 1 `drag`-kind row exists today (`deal-card-*` on `/deals`), so this hasn't been cross-checked
  against a real browser run yet. If the card happens to already be in the last column, the drag is a no-op onto
  itself and this row would likely show up as `dead` (no mutation) — a real signal, not a false one, but worth the
  controller knowing before reading that particular result.

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

## 7. Page-path inconsistencies in the registry — **[C4.1-RESOLVED]**

Every issue this section used to list (`[id]` vs `[companyId]`/`[contactId]` aliasing, the combined
`/contacts · /companies · /deals` page string, the `(HR hub)` annotation baked into `page`, prose baked into
`expect.target`) was fixed at the source by C4.1's registry rewrite (ledger/wo-notes/crm-C4.1.md §3, validated
0 prose remaining). `PAGE_ALIAS`/`COMBINED_PAGE` were deleted from this runner — nothing to alias anymore; `page`
is always the real route param name, `system`+`query` replace the string-annotation hacks, and `target` is always
machine-readable. See §1 above for the new `ui`/`anyOf`/`resultTarget`/`history:back`/`mailto:*` vocabulary that
replaced the old fallbacks.

## 8. `kind: "textarea"` — **[C4.1-RESOLVED]**

C4.1's rewritten `$fields.kind` doc string now lists `textarea` and `filter` explicitly (`button | link | menu | tab
| toggle | drag | form | filter | input | textarea | select`) — no longer undocumented.

## 11. CRM C4.1 round 2 (registry rewrite again same day, 1,055 → 1,052 rows — ledger/wo-notes/crm-C4.1.md §7/§8)

A second pass added three more things this runner needed to change to keep pressing the RIGHT element, plus one
future field noted for awareness only:

1. **`only`/`not` on pattern rows.** A `*`-pattern testid can cover either (a) several genuinely DISTINCT exact
   controls sharing a prefix (`company-new-*` → 8 separate fields: name/taxId/branchCode/industry/website/
   emailDomain/phone/email) or (b) one real control plus decoy non-control elements sharing the prefix
   (`crm-integrations-node-*` matches a `<div>` for the CRM node itself, which isn't a link). `only` (when present)
   is the definitive exact-testid list — `buildPlan()` now EXPANDS the row into one independent plan item per exact
   name in `only` (each gets its own visibility/action/dead/expect check), and `not` is ignored in that case. When
   `only` is absent, `not` (if present) is carried per-item as `notList` and consulted at press-time by a NEW
   `resolveSel()` helper: it walks every DOM match of the pattern selector, skips any whose exact testid is in
   `notList`, and returns the FIRST one that is **actually clickable** — tag ∈ {button, input, select, textarea},
   or `<a href>`, or `role` ∈ {button, link, menuitem, tab, switch, checkbox, option} — never a bare `<div>`/`<li>`
   wrapper. This applies to EVERY `*`-pattern row now (generic fix), not just the 3 the review named.
2. **`navMatches` now treats a bare `*` as a wildcard too**, not only `[bracket]`/`<angle>` placeholders — needed for
   `portal-menu-*`/`portal-nav-*` (`target: "/b/[slug]/*"`) and `crm-book-via-booking`
   (`target: "/app/u/*/booking?partyId=*"`, the `?...` part already discarded by the existing query-stripping).
   Because the match is a PREFIX test (no trailing `$`), a trailing `*` correctly accepts a deeper remainder too
   (e.g. "/b/shop/documents/123" satisfies target "/b/[slug]/*") without needing a separate "match to end of string"
   code path — confirmed by reasoning through the regex, not yet exercised against a real browser.
3. **Backdrop rows (`*-backdrop`, 5 rows) now click a CORNER**, not the center. Their close handler checks
   `e.target === e.currentTarget`; `page.click(selector)`'s default center-of-bounding-box click lands on the
   dialog box sitting visually on top of the backdrop at that point, not the backdrop itself, so the row would
   incorrectly show as `dead`. This runner detects `testid.endsWith("-backdrop")` and clicks `(box.x+6, box.y+6)`
   via `page.mouse.click()` instead.
4. **`opener` (proposed, not yet in the registry — D1 of the C4.1 review):** a future field naming the testid that
   must be pressed FIRST to reveal a modal's inner controls. Not implemented today (no row has it yet) — this
   runner still relies on registry row ORDER (opener rows before their modal's inner-field/cancel rows on the same
   page) to keep a modal open across consecutive same-page rows, per §1's `modal`/`toast`/`ui` no-auto-dismiss note.
   If `opener` is added later, the right fix is: before pressing a row that has one, press `opener`'s testid first
   (if not already visible) — noted here for whoever picks this up, not implemented now (out of THIS round's ask).

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

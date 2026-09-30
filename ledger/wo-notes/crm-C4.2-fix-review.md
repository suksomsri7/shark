# Review — CRM C4.2-fix + C4.4-fix2 (b54eed11..91c230fa) · independent read-only reviewer · 30 Sep

## Verdict: NOT MERGEABLE (BL-1) — MERGEABLE AFTER BL-1 + SHOULD-FIX (SF-1, SF-2)

Markup safety of the new plain-text→HTML path is sound (verified). The blocker is a new open-redirect laundering path
(merge values are linkified), and there is a quadratic CPU path reachable with a 12 MB server-action body.

Method: diff read, pure J1 functions copied to /tmp/rv-c42 and run under tsx against adversarial inputs (no DB, no server),
logs in /tmp/cui-logs read, 9 screenshots opened.

---

## BLOCKER

### BL-1 (verified) Contact-controlled merge values become permanent tracked redirects through APP_URL (/t/c) — breaks the AUDIT-CLASS X7 invariant
- Automation SEND_EMAIL and sequence e-mail steps render `{ชื่อ}`/`{ดีล}` (automation.ts:1103-1104) and `{{contact.firstName|name|companyName}}` (sequences.ts:1219-1227) into the plain text **before** it reaches `bodyText` → `crmPlainTextToEmailHtml` (emails.ts:1146-1147). The linkifier cannot tell template text from substituted values.
- Scenario: a stranger submits a public form or LINE chat with first name `https://evil.example/login` and their own e-mail + consent. The shop's welcome rule/sequence "สวัสดี {ชื่อ}" now sends `<a href="https://evil.example/login">` → composeOutgoing (emails.ts:932) wraps it as `${APP_URL}/t/c/<token>`. `trackClick` (emails.ts:2617+) has no expiry, and the route redirects to the stored URL (src/app/t/c/[token]/route.ts:26-37). The attacker ends up holding a permanent `shark.in.th/t/c/…` link that 302s to their phishing page. Before this change the value was escaped text and never became an href.
- Change wanted: linkify only the rule/step's own text. Either (a) run `crmLinkifyText` on the template before substitution and substitute values escape-only (`escText`), or (b) have the runner hand `bodyText` + vars to sendCore, which substitutes with a sentinel-protected pass. Add a probe: contact name = URL → `links.length === 0` for rule and sequence sends.

## SHOULD-FIX

### SF-1 (verified, measured) Quadratic `trimUrlTail` + size check after conversion ⇒ event-loop DoS by any staff with crm.email.send
- emails-shared.ts `trimUrlTail` calls `countChar` twice per trimmed char (O(L²), L ≤ 2048). sendCore checks `CRM_EMAIL_BODY_MAX_BYTES` only after converting (emails.ts:1147-1148). The server-action body limit is 12 MB (next.config:14).
- Measured: 400 × (`https://a` + 2030 `)`) (816 KB) = **5.5 s** CPU. Scaled to 12 MB ≈ 80 s of blocked event loop per request.
- Fix: count parens once and decrement (linear), and reject `Buffer.byteLength(bodyText) > CRM_EMAIL_BODY_MAX_BYTES` before converting (also cap in `sendCrmEmailAction`).

### SF-2 (verified) Literal `href="http…"` left in a text node is rewritten by composeOutgoing
- `escText` escapes only `& < >`. When the linkifier skips a URL (host check fails, e.g. `https://.x`, or URL > 2048 chars), the text `href="https://…"` stays in a text node. The regex at emails.ts:932 then rewrites it into a tracked token and registers a link row for it.
- Probe: `xx href="https://.evil/path" yy` → links `["https://.evil/path"]`.
- Not markup injection; the visible text changes and a link row is tracked. This was already true of the old hand-escaping in automation.
- Fix: also escape `"` → `&quot;` in text. `htmlToText` decodes `&quot;` (sanitize.ts:139), so the plain-text part stays correct.

### SF-3 (verified) Keys checked by actions that are absent from the permission registry
`crm.contact.assign`, `crm.contact.archive`, `crm.deal.export`, `crm.company.archive`, `crm.company.import` and `crm.company.export` appear 0× in `src/lib/core/permissions.ts` and 0× in `crm/access.ts`. `crm.contact.import` and `crm.deal.reassign` are present.
- So STAFF can never be granted these from the permissions page, and the new UI gates hide those controls for every STAFF for good.
- Not caused by this diff. Before merge the owner needs to decide: register the keys, or change the actions to the registered keys (e.g. `crm.contact.update`/`delete`, `crm.contact.export`).
- The C1.7 intent doc was not located in this pass.

## NOTE

- **N-1 (verified): stale comment.** emails-shared.ts ~:313 says the output "passes sanitizeHtml unchanged". It does not: `&` in href gets double-escaped. The code rightly skips the sanitizer, but the comment should say so.
- **N-2 (verified): composer text loses information from templates.**
  - `crmEmailHtmlToComposerText` drops mailto:/tel: addresses (`mail us call`).
  - An href containing a space, `"`, `<` or an unbalanced trailing `)` comes back as a shorter link.
  - No host spoofing: label and URL are both shown (`https://good.com (https://evil.com/…)` → two links, each to its displayed host).
  - Lazy-regex cost on pathological template HTML: 480 KB of unclosed `<a href>` = 2.4 s. Stored templates are sanitizer output, so low risk.
- **N-3 (verified): visible change in automation/sequence HTML.**
  - Old: one `<p>` with `<br>` for every newline.
  - New: 2+ newlines start a new `<p>`, and each paragraph is trimmed (leading indentation lost).
  - Thai text is unchanged. c2.1/c2.2/c2.5 are green, so no oracle pinned the old bytes. C2.5-S9.10 covers core `sanitizeHtml` default options, which were not touched.
- **N-4 (verified): REST cannot reach `bodyText`.**
  - `emails.send`, `schedule` and `sendBulk` schemas are zod `.strict()` without `bodyText` (api/ops/emails.ts:114-126).
  - Precedence: `bodyHtml` or a template wins over `bodyText` and still goes through sanitize (emails.ts:1146, emails-actions.ts:87), so unsanitised HTML cannot be smuggled.
  - Stored bodies are shown to staff only through `renderInboundHtml` in `<iframe sandbox="">` (EmailThread.tsx:118-124). The portal renders no e-mail bodies.
  - The plain-text alternative is `htmlToText` (collapses whitespace; untracked raw URLs), same as before.
- **N-5 (verified): the `{{…}}` guard doesn't apply to the new path.** Staff composer/rule text is not scanned for `{{kb:}}`, and no placeholders are rendered on the bodyText path. No new risk.
- **N-6 (verified): `parentLinks` doesn't filter by systemId.** `visibleIdsAmong` (visibility.ts:592) checks visibility across all systems of the tenant. A parent in another CRM system of the same tenant would get a link under the current system → 404. Only matters if record parents can cross systems.
- **N-7 (verified) B4 is otherwise correct.**
  - `visibleWhere` applies the parent's read key (visibility.ts:407).
  - A hidden parent renders only the type label, with no name or id in the markup.
  - Query cost is at most one query per parent type plus one per system, not per row.
  - REST, search and metadata are untouched by the diff.
- **N-8 (verified) B3 ARIA is correct.**
  - tablist/tab/aria-selected, exactly one tab selected.
  - Both tabs `aria-controls` one panel, which is `aria-labelledby` the active tab id (`useId`, SSR-stable).
  - With a single tab ("mine") the tablist is still valid.
- **N-9 (verified): gating costs nothing extra.** `crmCan` is pure (access.ts:70), so there are no per-call DB round-trips, and client components receive only booleans.
- **N-10 (verified): B6 is consistent with the service.** `bulkReassign` → `reassignDeal`, which calls `need(a,"crm.deal.update")` (deals.ts:1027). Bulk reassign therefore really needs reassign (action) + update (service).
- **N-11 (verified): activity gates match the service.**
  - Delete: `need("crm.activity.delete")` + own-or-manager (activities.ts:825-826) = UI `canEdit && canLog && canDelete`.
  - Pin and reschedule: `need("crm.activity.create")` (activities.ts:754, 808).
  - Reschedule also requires `canComplete` in the UI, which the service does not check. That hides it from someone the service would allow. Minor: confirm the reason or drop it.
- **N-12 (partly verified): the rest of the per-control key mapping was not independently finished in this pass.**
  - The action keys listed in contacts/deals/companies-actions.ts match the booleans in the diff for import/export/new/convert/merge/assign/quote/lines/delete.
  - contact.assign / contact.archive use two keys (assign+update, archive+delete), matching contacts.ts:1148/1289.
- **N-13 (verified) v1 safety.**
  - Every changed page gates v1 first (`pickCrmPage` → V1 page, or `requireCrmV2Page` / the v2 gate) before any changed line.
  - The V1 components (ActivitiesV1Page, ContactsV1Page, DealsV1Page) import none of the changed components.
  - sendCore calls `assertCrmV2` (emails.ts:1111).
  - Result: no v1 byte change.
- **N-14 (verified) Layout.** Opened: cmp-contacts-thana-1440/390, cmp-deals-thana-1440, cmp-deal360-thana-390, cmp-contact360menu-thana-1440, cmp-notify-owner-1440, green/deals-table-nok-390, green/activities-thana-1440, green/contacts-nok-1440.
  - The checkbox column is fully removed: no empty th/td, and the card layout has no gap.
  - The contact menu shrinks to three items; the deals bulk bar keeps only "move" for thana.
  - Header actions shrink to "+ เพิ่มผู้ติดต่อ". No empty toolbar.
  - Unchanged, possibly also key-gated: "อ่านนามบัตรด้วย AI" is still shown to nok/thana. Not checked.
- **N-15 Registry (81 rows): not independently spot-checked in this pass.** My sub-check did not complete. The UI-gates GREEN 69/69 and the gates above are consistent with nok/thana lacking those keys. The builder's own point (4), that crm-seq-bulk*/crm-seq-enroll* rows list nok/thana in `roles`, is unverified.

## Point 9 — logs vs handback (verified)
- ui-gates: RED 38/31 → GREEN 69/69.
- b4: RED 4/2 → GREEN 6/0.
- J1: linkify RED 0/2 → GREEN 27/27; send RED2 4/4 → GREEN 8/8.
- J2: 2/4 → 4/4.
- Suites: c1.3 89 · c1.4 110 · c1.5 103 · c1.6 79 · c1.7 57 · c1.9 45 · c1.11 66/66 (with CRM_V2_SWITCH=all; 57/66 without = switch group) · c2.1 84 · c2.2 73 · c2.4 91 · c2.5 105 · c2.6 87 · c2.10 41 — all rc=0.
- typecheck rc=0 ×2 and fitness 33/33 ×2 (env and no-env).
- C3.7 23/30:
  - X1.2 (prompt=200 for the contact of the first Krabi deal, leak=false): the mobile call-log route and calls service are untouched by the diff ⇒ not from this change. It is a seed-data or oracle assumption; the builder's peek script targets it. Suspected: that contact is visible to thana through a non-Krabi owner or team.
  - S1.1, S1.2, S1.6, S2.2, S2.4, S2.6 are freshness/evidence gates. Summaries are ∅ and the fixture is not fresh, i.e. the 3.7 shoot and the mobile render were never run in this worktree. Not a product regression, but S1.6 stays red for any UI change until someone re-shoots.
  - Suites ran 13:03-13:29; the commit is 13:31, and the last UI change was at 12:38 per S1.6.

## Point 10 — builder's pre-existing findings
- **(a) Real, MEDIUM.** `sanitizeHtml` escapes the raw, undecoded href (sanitize.ts:39-40, 119-122). A well-formed `&amp;` becomes `&amp;amp;`, and composeOutgoing decodes once (emails.ts:918, 934). So tracked links with 2+ query params break on REST `bodyHtml` and on template sends: one extra layer per sanitize pass (save + send). Fix: decode the attribute before `escapeAttr`.
- **(b) Real, LOW-MEDIUM, pre-existing.** EmailComposer keeps `templateId` only for the picker (EmailComposer.tsx:33,159) and never sends it, so `{{contact.firstName}}` goes out literally.
- **(c) Real, MEDIUM (PDPA).**
  - Revoking consent nulls `consentVersion` on all of the visitor's sessions (tracking.ts:925). `identify()`'s `updateMany` has no consent filter (tracking.ts ~995-998), so after re-consent the pre-revocation sessions are bound to the contact.
  - `latestConsentedSessionId` accepts any non-null version (tracking.ts:730) rather than the current `site.consentVersion`.

---

## Round 2 — `git diff 91c230fa 0084a3a4` (re-review, read-only)

### Verdict: MERGEABLE AFTER SHOULD-FIX (R2-SF1) — then rebase onto session/crm 5fb440fd with the conflict notes below, and re-run c1.9

All round-1 findings (BL-1, SF-1, SF-2, SF-3 as re-ruled) and N-1, N-2, N-6 plus addendum 1 and 2a–e are closed.

Method:
- The new pure functions were copied to /tmp/rv-c42r2 and run under tsx: 12 hostile values × 13 brace/mustache templates, plus perf, SF-2 and composer cases. No DB.
- Diffs read, logs and mtimes compared, 6 round-2 screenshots opened.

### SHOULD-FIX

**R2-SF1 (verified) Personalised URLs are now sent as a truncated, working link to the wrong address**
- The URL regex's class excludes the slot markers U+E000/U+E001 (emails-shared.ts `CRM_TEXT_URL_RE`, hex-checked), so a URL stops at a placeholder. Test results:
  - `https://shop.com/?ref={ชื่อ}&x=1` → `<a href="https://shop.com/?ref=">…</a>abc&amp;x=1`
  - `https://shop.com/{{contact.firstName}}/x` → link `https://shop.com/`, then `abc/x` as text.
- Before C4.4 the whole thing was plain text, which mail clients autolink correctly. Now a real anchor points to the truncated URL, and the value/tail is unlinked text, so clicks land on the wrong page.
- This is safe (no value reaches an href), but it silently breaks referral/UTM-style links in rules and sequences.
- Wanted change, either:
  - (a) in `crmLinkifyText`, if the character right after the matched URL is `SLOT_OPEN` (or the URL contains a slot), don't linkify; leave it as escaped text like before C4.4; or
  - (b) linkify with the slot values percent-encoded, only when the slot sits after the first `/`, `?` or `#` following the author-typed host.
- Add a probe for both syntaxes. (a) is the minimal fix.

### NOTE — verified unless marked

**R2-N1 BL-1 is structurally closed on every path.**
- Mechanism: author text is stripped of U+E000/U+E001. Placeholders become `<n>` before linkify, and values (also stripped) are put back afterwards via `escText` (`& < > "`).
  - The URL regex cannot run through a slot, so no value can reach an href: `https://{ชื่อ}` → `https://` fails `hasHost` → text.
  - A value that contains marker characters is cleaned first; a value that contains `{ชื่อ}`/`{{…}}` is not rescanned.
- Unknown keys: brace keeps the placeholder, mustache renders `""`. This matches `renderTemplate` (action-runner.ts:176) and `renderVars` (sequences.ts:1127).
- Result: 0 bad outputs across 156 combos (no foreign tag, no attacker link, no leftover PUA). Values tried: URL, quote breakout, `<a>`, markers, braces, bidi, `javascript:`, `} https://… {`.
- Paths:
  - automation: automation.ts:1159-1170 → `bodyVars` brace
  - sequence: sequences.ts:1155-1158 → mustache
  - composer: no vars; placeholders stay literal (pre-existing (b))
  - template pick: composer text, re-linkified on send, author URLs only
- The injected `deps` senders still receive the rendered `body`; they are test-only.
- `sendCore` only uses `bodyVars` on the `bodyText` path (emails.ts:1150-1151).

**R2-N2 Small differences in how the brace emulation renders values — invisible in HTML.**
- The runner collapses `[ \t]{2,}` over the whole rendered string; the emulation collapses the template and each value separately. `สวัสดี␠␠{ชื่อ}` with value `␠␠สม␠␠ชาย␠` gives double spaces around the value.
- A value containing `\n` stays a raw newline (no `<br>`).
- Both are invisible in HTML, and `htmlToText` collapses `\s+`.
- Edge (suspected, not probed): if the template is only an empty-valued placeholder, the body ends up empty → VALIDATION → the rule says "จะลองอีกครั้ง". Unlikely: `contactName` always has a fallback.

**R2-N3 SF-1 is linear and capped before conversion on every surface.**
- `trimUrlTail` counts once and then decrements. Measured: 500 KB worst case = 37 ms (was 5.5 s for 816 KB); 500 KB nested braces = 6 ms; mustache flood = 2 ms.
- `crmEmailHtmlToComposerText` is now a single split on `/(<[^<>]*>)/`: 480 KB of unclosed `<a>` = 51 ms (was 2.4 s).
- `crmEmailBodyTooLong` runs before conversion in:
  - the composer (EmailComposer.tsx ~:65, via `data.bodyMaxBytes`)
  - the action (emails-actions.ts:76-79, before `session()`)
  - `sendCore` (emails.ts:1150), which covers rules and sequences
- All three use the single `CRM_EMAIL_BODY_TOO_LONG_MSG`. The post-conversion byte check stays as the second line of defence; with 150k slots, output grows 6×.

**R2-N4 SF-2: agreed.** `"` → `&quot;`, so `href="https://.x"` left in text is no longer wrapped (links `[]`), and `htmlToText` decodes `&quot;` (sanitize.ts:139). Leaving `'` unescaped is fine: `composeOutgoing` only matches `href="…"` (emails.ts:932), and `htmlToText` does not decode `&#39;`.

**R2-N5 SF-3 matches the re-ruling exactly.**
- Action key changes:
  - contact assign + bulk: `crm.contact.update` (contacts-actions.ts:165, 176)
  - contact archive/restore: `crm.contact.delete` (:187)
  - company archive/restore: `crm.company.delete` (companies-actions.ts:122, 227)
- The only remaining old-key strings are audit action names (contacts.ts:1148/1342, companies.ts:899).
- REST already agrees: `/contacts/{id}/archive` uses `crm.contact.delete` (api/ops/contacts.ts:~295) and assign uses `crm.contact.update`.
- Registered with calm Thai labels: `crm.company.import`, `crm.company.export`, `crm.deal.export` (permissions.ts:419-420, 430) and in `ALL_KEYS` (access.ts:34, 36).
- Defaults are unchanged:
  - Not in `STAFF_DEFAULT`, same as the contact.import/export siblings.
  - MANAGER gets them via `ALL_KEYS` and already got them implicitly (`crmCan` MANAGER = not excluded).
  - API keys: no REST op or AI tool checks any of the three (grep of api/ops: none), so the admin bundle count going 51→54 in docs/api/CRM-API.md is display-only, with no REST capability change.
- Behaviour change to announce: every default STAFF (`crm.contact.update` is in `STAFF_DEFAULT`) can now reassign contacts, including bulk. This is by the blueprint ruling; include it in the owner's release note.
- c1.7 57/57 without an oracle edit is plausible. S0.2 requires all §6.1 keys present with Thai labels and ≥40; S0.4 requires STAFF exact and MANAGER ⊇ §6.1 minus the excluded keys (qc-crm-c1.7.mts:333-354). Extra keys are allowed.
- Registry re-derivation (registry-c42fix-r2.mjs) puts nok/thana back in `roles` for the 11 contact-assign rows. They hold `crm.contact.update`. In r2-ui-gates the four staff assign checks now log "allowed · visible=1", which explains 69→65: the probe only asserts the owner positive control for allowed keys, so consider asserting staff visibility too.

**R2-N6 N-6 closed.** `visibleIdsAmong(…, { systemId })` filters the base rows (visibility.ts:592-605), and `parentLinks` passes it (objects/server.ts:79). The first placement (a direct CrmCompany read) turned c1.3-S0.3 red; it was moved at 16:54 and c1.3-b passed.

**R2-N7 Addendum 1 — read-only deal lines verified in the screenshots.**
- `!editable` rows render text only (Deal360Actions.tsx:400-425).
- Totals are always shown (footer outside the `editable` blocks, :470-479).
- Checked `cmp-r2-deal-lines-thana-390/1440`: qty 2 × ฿3,500 − 5% = ฿6,650 ✓, VAT label + note present, no inputs/add/save, readable at both widths. Owner 390 still gets the editor.

**R2-N8 Addendum 2.**
- (a) The pickers accept update | merge | create (companies) and update | convert | create (contacts). This is fine: results still come from `companyOptions` → `companyWhere` (keyGate needs `crm.company.read`; visibility.ts:407), so nothing is exposed beyond what the viewer can read.
- (b) Plain `tel:` is shown only without `crm.activity.create` (contacts/[contactId]/page.tsx:267-273). Suspected: if the phone were ever masked for a viewer, the stripped digits would form a wrong number. The same holds for CrmClickToCall, so it is pre-existing.
- (c) Member lock = `memberLinked && !hasMemberPerm("member.customer.update")`, the same key as member/privacy.ts:677. The copy is calm. In the screenshot the disabled grant/revoke buttons don't look visibly disabled (existing style); cosmetic.
- (d) `/contacts/new`, `/companies/new` and `/deals/new` call `notFound()` without the create key, placed after `requireCrmV2Page`.
- (e) Empty-state and menu texts no longer invite clicking absent buttons. The deal menu needs another pipeline to exist before offering "move pipeline".

**R2-N9 `RunnerSendCore` + `bodyTemplate`/`vars` — the member adapter is unaffected.** `MEMBER_ADAPTER.send` picks fields explicitly (member/journeys.ts:1032-1046). The CRM adapter spreads `core` into the senders; only the CRM e-mail default sender reads the new fields.

**R2-N10 v1 safety.** Every changed page gates v1 before any changed line (pickCrmPage / requireCrmV2Page / sendCore `assertCrmV2`), and no V1 component imports a changed file.

**R2-N11 Logs.**
- Handback numbers all match:

  | check | result |
  | --- | --- |
  | r2-ui-gates-GREEN | 65/0 (16:11, build #3 of 15:58) |
  | r2-ui-GREEN | 19/19 |
  | linkify | 35/35 (RED 29/6) |
  | BL-1 | 10/10 (RED 6/10) |
  | N-6 | 4/4 (RED 3/4) |
  | j1send | 8/8 |
  | j2 | 4/4 |
  | suites | c1.3 89 (-b) · c1.4 110 · c1.5 103 · c1.6 79 · c1.7 57 · c1.11 66 · c2.1 84 · c2.2 73 · c2.4 91 · c2.5 105 · c2.6 87 · c2.10 41 |
  | fitness | 33/33 ×2 (-2 runs at 18:10, after docs were regenerated at 17:57; the first runs had F13.11 stale docs) |
  | typecheck-2 | rc 0 (17:59) |

- Mtimes: every source file is ≤ 14:01 except objects/server.ts + visibility.ts (16:54) and docs (17:57).
  - UI probes ran on build #3 (15:58) with the earlier `parentLinks` placement, as the builder said.
  - The service probes B4/N-6 GREEN3 (18:02) and c1.3-b/c1.4-b/c1.7-b (18:05-18:10) cover the final code. The suites after 16:56 postdate it. c1.5 finished 16:56 and may have started just before 16:54, but the visibility change is additive and optional.
- **Gap:** c1.9 (custom objects, 45 checks) was not re-run in round 2, although objects/server.ts and visibility.ts changed. Re-run it before merge.

### Rebase onto session/crm 5fb440fd (batch D) — expected conflicts
1. **sequences.ts `defaultSender`.** D rewrote this same `sendAsSystem({…})` literal: it adds `idempotencyKey: seq:<enrollment>:v<version>:<step>`, adds `redeliverFailed: true`, and changes the return type to `SequenceSendVerdict`. Round 2 swaps `bodyText` for `bodyTemplate` + `bodyVars` in the same literal, so this will be a textual conflict. The resolution must keep all of D's fields and the round-2 body fields. Semantically compatible: D's redelivery re-sends `prior.bodyHtml` (built with the first attempt's vars), and conversion plus the size cap still run first (cheap).
2. **emails.ts `sendCore` / `SendInput` / `SendCore`.** D adds `redeliverFailed` to `SendCore`, a `Redelivery` path at the insert catch, and `inFlightUntil`/`unconfirmed` on `SendResult`. Round 2 adds `bodyVars` to `SendInput` and edits the lines for the pre-conversion cap, `rawBody` and `storedHtml`. These are nearby hunks with no semantic clash. Keep the round-2 cap *before* D's paths: D's early "prior QUEUED" return sits after conversion, which is fine.
3. **contacts-actions.ts / companies-actions.ts / emails-actions.ts.** D replaced `revalidatePath` with `revalidateAndWake` on the lines right after the round-2 `session(…)` key edits, and dropped the `revalidatePath` import in emails-actions. Expect adjacent-line conflicts. Keep the round-2 keys, the multi-key `session()` and D's `revalidateAndWake`. The r2 early return in `sendCrmEmailAction` has no revalidate.
4. action-runner.ts, automation.ts, emails-shared.ts, permissions.ts, access.ts and visibility.ts are not touched by D, so no conflict is expected. After rebasing, re-run BL-1 probe, j1send, c2.2 (sequences) and D's own oracle.

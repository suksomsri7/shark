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

# crm-C5.5-fix5 — quadratic regex / uncapped input (review C5.5-fix4 RV-1 · RV-2 · RV-4 · RV-9 + sweep)

Written 2026-10-01 18:48 UTC · worktree `/root/projects/shark-crm-cf2` · branch `wip/crm-cf6` from b8e8ad52 (tip of wip/crm-cf4 incl. its review) · code commit ef43dfc1 · DB QC3 only · not pushed.
RV-3 (CRM AI doors vs `ai.chat.send`) not taken: it waits on an owner decision.
Probes are in `scripts/pending/cf6/`:
- `probe-cf6-linear.mts`: pure; growth, byte-identity and static checks.
- `probe-cf6-db.mts`: QC3, own throwaway tenant/users/systems, cleaned up.
- `legacy-b8e8.ts`: the b8e8ad52 expressions copied verbatim. They are the oracle.
- `regex-sweep.mts`: runs every regex literal in src/ against pumped inputs.
- `run-verify.sh`, `run-round2.sh`.

Logs are in `/tmp/cf6-logs/`.

**How each check works**
- **Timing.** Every timing check measures time(4n) / time(n) on the pathological pump, taking the best of 2–3 runs. Linear growth is about ×4 and quadratic about ×16.
  - A check passes if the ratio is below 8 (pure) or below 6 (end to end; the DB round trips add a constant).
  - It also passes if the 4n run is under the noise floor.
  - A very large input is only tried after the growth check is green.
- **Byte-identity.** The rewritten code is compared with the b8e8ad52 expression on realistic, weird-but-valid and seeded-random corpora.
- **Snapshots.** Every exported site function's outputs were captured on the unfixed tree (`snap-base.json` / `dbsnap-base.json`) and compared after the fix (the SNAP checks).

## Findings fixed (per finding: what/where · RED on b8e8ad52 → GREEN on ef43dfc1)

### RV-1 HIGH (session/crm only): `sendCrmEmailAction` catch path
`src/lib/modules/crm/emails-actions.ts`
- **Size check up front.** `bodyHtml` is now checked against `crmEmailBodyTooLong` before the session is opened. It uses the same 500 KiB rule and the same message (`CRM_EMAIL_BODY_TOO_LONG_MSG`) as `bodyText`, shown under the body field. A body exactly at the limit still goes on to the session gate, as before.
- **Catch path.** The empty-body test uses core `htmlToText`, the linear default-deny engine, on the at-most-500 KiB body instead of `/<[^>]*>/g`.
- **Result.** No path through the action (success or failure) touches a body over the cap.
- **Semantics note.** A body made only of dropped content (script/style/comment) now counts as "empty" for the body-field flag. That matches what the service already decides. The flag only shows on VALIDATION errors.

Evidence:
- RED pure: `<`×8000 → ×4 took 34.5 → 631 ms (×18.3).
- RED through the real action (no request ⇒ session throws ⇒ catch path): 40 → 624 ms (×15.5). The 5 MB check was skipped because it would take hours.
- GREEN: 0.6 → 2.3 ms (×3.6). A 5 MB `<` body is refused in about 0 ms with code VALIDATION and `fieldErrors.body`. Normal-body failure shapes are identical to base (SNAP).

### RV-9 (prod too, kanban): `descriptionToText`
`src/lib/modules/kanban/cards.ts`
- Three steps were quadratic: `<li[^>]*>`, `<[^>]+>` and `[ \t]+\n`. They now use `replaceOpenTagCi`, `stripTags({nonEmpty})` and `trimBlanksBeforeNewlines` from the new pure `src/lib/core/linear-text.ts`. Each one equals its regex byte for byte on all inputs, not just normal ones.
- The fixed-shape steps (`<br\s*\/?>`, `</p|div|li|h1-6|tr>`, entities, `\n{3,}`) are unchanged, and so is the step order.

Evidence:
- RED: `<` ×19.6 (47 → 929 ms) · `<li` ×20.3 · spaces-then-x ×17.0 · `<a`+spaces ×17.4 · `<br`+spaces ×13.8.
- GREEN: all pumps ×2.0–4.0, at or below 0.55 ms for 32 000 chars.
- Byte-identical on 28 016 inputs (16 real card bodies, 20 000 random tag/entity/whitespace strings, 2 000 mixed, 6 000 img-ish). SNAP is identical.

### RV-2 MED (prod too): inbound header parsers and uncapped headers
**Linear parsers.** Pure, in `src/lib/core/inbound-address.ts`, each equal to the old regex on every input:
- `trailingAngleAddr` ≡ `/<([^>]*)>\s*$/`
- `firstAngleAddr` ≡ `/<([^>]+)>/`
- `angleIds` ≡ `matchAll(/<([^>]+)>/g)`

They are used by:
- `bareEmail` (core).
- `displayNameOf` (`crm/emails-shared.ts`): the name is the text before the `<` of the trailing angle pair, with whitespace before `<` trimmed, and no name if it contains a line terminator (same as `.` in the old regex).
- The private `bareEmail` of `platform/kanban-email-in.ts` (board mail-in From).
- `bareAddr` of `core/email.ts` (outbound from/to/reply-to check).
- `refIdsOf` (`crm/emails.ts`, In-Reply-To/References).

`authResultPass`'s key=value regex in `crm/emails.ts` (session/crm only) gets the lookbehind `(?<![a-z0-9._-])`. A match can only start at the start of a key run, and a mid-run start matches only if the run start does. The value always ends at a run boundary, so results are identical.

**Header caps.**
- Address entries (From, each To/Cc item) and Message-ID: at most 998 characters (RFC 5322 line limit).
- Every other header value, per name and after duplicate headers are joined: at most 16 KiB.
- Subject: truncated at 16 KiB. Consumers already cut it to 120/300 after trimming.
- An address, Message-ID or header that is too long is **dropped, not truncated**. A truncated address can become a different valid address (`crm+key@shark.in.th.x…` → `crm+key@shark.in.th`). Truncating Authentication-Results could cut off the MTA's real header and leave a forged one first.
- `capInboundEnvelope` applies the caps:
  - at the route `src/app/api/email/inbound/route.ts`, on the provider payload (both the board path and the CRM path) and on the CRM extras (Cc and headers);
  - again at the top of `emails.ingestInbound` and `kanban-email-in.ingestInboundEmail`, for other callers.
- Normal mail returns deep-equal.

Evidence, parsers (n = 8000 → 32 000):

| parser | RED | GREEN |
|---|---|---|
| bareEmail | ×18.0 (45 → 808 ms) | ≤ 0.04 ms |
| displayNameOf | ×17.8 / ×18.2 | ≤ 0.04 ms |
| kanban From | ×17.3 | ≤ 0.04 ms |
| core bareAddr | ×16.0 | ≤ 0.04 ms |
| refIdsOf | ×20.5 | ≤ 0.04 ms |
| auth pairs | ×18.9 | ×4.1 |

- Byte-identical on 9 744 addresses: Thai, quoted and comma names, comments, nested or unbalanced angles, CR/LF/NBSP/U+2028/BOM, plus 6 000 random. The auth pairs are identical on 12 006 clauses.

Evidence, end to end on QC3:

| path | RED | GREEN |
|---|---|---|
| `ingestInbound` with From = `<`×n | 472 → 5 206 ms (×11.0) | ×1.0 |
| References/In-Reply-To = `<`×n | 445 → 3 939 ms (×8.9) | ×1.0 |
| Board mail-in with From = `<`×n | 258 → 2 133 ms (×8.3) | ×1.1 |

- GREEN, 1 MB headers: From + To item + Cc item + References + Authentication-Results took 95 ms. The mail was still routed to the CRM inbox, because the long To item is ignored and the real one kept.
- GREEN, normal mail: a Thai quoted name, bare address, `<addr>`, comment form, `name<addr>` + Cc, a threaded mail, and a stranger with a display-name To. Stored From/To/Cc/name/threading fields and board cards are identical to base (SNAP).

### RV-4 LOW (prod too): signature cut inside a tag
`crm/emails.ts setUserSetting`:
- Input over `CRM_EMAIL_SIGNATURE_MAX = 4000` (new in emails-shared; same as the REST `optText(4000)`) is refused with VALIDATION "ลายเซ็นยาวเกิน 4,000 ตัวอักษร…".
- The sanitized output is stored whole; there is no `.slice` after sanitizing.

Evidence:
- RED: a 3 995-character signature was stored as 4 000 characters ending in `<a href="https://…&amp;and=more" rel="noopener" ` (tag cut). 4 001 characters were accepted.
- GREEN: 4 030 characters stored, ending `…target="_blank">ร้านของเรา</a>`. 4 001 characters are refused. A small signature is identical to base.

## Sweep (all of `src/`)
There were two passes.
- **Grep** for regex tag-strip and angle parsing.
- **Empirical sweep** (`regex-sweep.mts`). Every one of the roughly 1 040 regex literals and `new RegExp("…")` calls was run against about 40 single-char pumps, the regex's own literal words and 5 suffixes, at two sizes. b8e8ad52 flagged 60 literals and the tip flags 37.

Flags carried by Thai alternations in the offline `ai/eval.ts` flip between runs near the threshold. That harness is never reached by user input.

Every flag was then traced to its input to decide reachability.

### Fixed (CRM v2 code, or a trivially safe exact-equivalent swap)

| site | shape | who controls the input / reachability | fix | prod |
|---|---|---|---|---|
| crm/emails-actions.ts:106 | `<[^>]*>` | RV-1 above | cap + htmlToText | no |
| kanban/cards.ts:329/331/338 | `<li[^>]*>` · `<[^>]+>` · `[ \t]+\n` | RV-9 · REST `cards.detail` / AI on stored raw descriptions | linear-text | yes |
| core/inbound-address.ts:41 | `<([^>]*)>\s*$` | RV-2 · inbound From before the sender bucket · CRM `to` list (cleanAddrList) | trailingAngleAddr | yes |
| crm/emails-shared.ts:148 displayNameOf | `^\s*(.*?)\s*<[^>]*>\s*$` | RV-2 · ×3 per inbound mail | linear | yes |
| platform/kanban-email-in.ts:83 | `<([^>]+)>` | RV-2 · board mail-in From | firstAngleAddr | yes |
| core/email.ts:90 bareAddr | `<([^>]*)>\s*$` | every outbound send (from/to/reply-to check) | trailingAngleAddr | yes |
| crm/emails.ts refIdsOf | `<([^>]+)>` g | inbound In-Reply-To/References | angleIds | yes |
| crm/emails.ts authResultPass pairs | `([a-z0-9._-]+)\s*=…` g | Authentication-Results clauses (ours only) | lookbehind | no (prod uses a different parser) |
| crm/emails.ts setUserSetting | slice after sanitize | RV-4 | cap input | yes |
| inbound route + ingestInbound + ingestInboundEmail | uncapped headers | RV-2 · provider payload | capInboundEnvelope | yes |
| crm/emails-shared.ts emailSnippet | `<[^>]*>` g on sanitizeHtml output | was already bounded (engine output) | stripTags (identical) | yes |
| crm/emails/[threadKey]/page.tsx REMOTE_IMG_RE | `<img[^>]+src="https?:` i | stored bodyHtml on every thread view · `<img`×n ⇒ ×16.6 | `hasRemoteImages` (emails-shared, identical) | yes |
| crm/emails-shared.ts crmEmailHtmlToComposerText | `[ \t]+$` g per line | template HTML ≤ 500 KiB → composer | trimEndBlanks | no |
| **crm/api/serialize.ts maskPiiPatterns** | e-mail-in-text `[A-Za-z0-9._%+-]+@…` g | **NEW, MED/HIGH:** see note below | `replaceEmailsInText` (identical) | yes |
| crm/calls-shared.ts redactContactInfo | e-mail-in-text (with `'`) | call transcript ≤ 100 000 before AI · ai-bridges `safe()` runs it **before** `.slice(0,200)` · chat-bridge message bodies | replaceEmailsInText | yes |
| crm/contacts-shared.ts maskPii | `[^\s@"'<>]+@…` g | contact error messages / export `q` in audit | lookbehind (identical: domain always ends at a run boundary) | yes |
| outbox-consumers.ts redactPii | e-mail-in-text | ops log message/detail | replaceEmailsInText | yes |
| ai/dataset.ts anonymize | e-mail-in-text | chat user/reply text (SHARK_AI_COLLECT=1) | replaceEmailsInText | yes |
| **branding/logo.ts** SVG_UNSAFE_PATTERNS | `on[a-z]+\s*=` i | **2 MB SVG** logo upload by a shop owner/admin; `onon…` ⇒ ×17.2 ⇒ 2 MB ≈ hours | run-start lookbehind + lookahead (same accept/reject) | yes |
| chat/service.ts normalizeOrigin | `\/+$` | **public widget `Origin` header** (≤ 16 KiB Node header cap ⇒ ~0.3 s per request) | trimEndRun | yes |
| domain/service.ts normalizeHost | `\.+$` | request `Host` → resolveTenantByHost | trimEndRun | yes |

**Note on serialize.ts maskPiiPatterns (new finding, MED/HIGH).** It runs on every string of the REST response for READONLY keys and the AI assistant, including the inbound mail `bodyText`. That field is stored **uncapped** (route body ≤ 10 MB). An outsider can mail a 1 MB letter run with no `@`, and any assistant or readonly read of that thread then pins the instance: before the fix, `a`×32 000 took 1.3 s (×17).

Proofs for the e-mail-in-text helper `replaceRunAnchored` / `replaceEmailsInText`:
- Identical to `s.replace(<regex g>, fn)`, including adjacent and overlapping shapes such as `a@b.cd9x@e.fg` and `a@b.cd_x@e.fg`. A plain lookbehind would have dropped the second address in those cases, which is why a candidate-position emulation is used instead.
- Checked on 23 017 strings for both local-part classes, and on each of the four sites against its b8e8ad52 copy.

### Bounded, client-side or not user-controlled (listed, not fixed)
| site | shape | input / bound |
|---|---|---|
| core/sanitize.ts:132 htmlToText | `<[^>]*>` g | engine output only (every `<` is a rebuilt, closed tag) ⇒ linear: `<`×80 000 = 5.9 ms ×3.9 · **the one F16 allow-list entry** |
| crm/emails.ts:362 · crm/tracking.ts:98 · crm/portal.ts:1089 · marketing/campaigns.ts:146 · account/payment-request.ts:106 · storage/actions.ts:40 · storage/service.ts:185 · settings/portal/page.tsx:31 · t/c/[token]/route.ts:17 · crm/tracking-shared.ts:217 | `\/+$` | `process.env.APP_URL` / CDN env: operator-controlled |
| forms/service.ts:402/455 · member/reviews.ts:319 | `\/+$` | origin from `publicOrigin()` (`x-forwarded-host`/`host`, ≤ 16 KiB header cap, set by the platform proxy): LOW |
| crm/api/openapi.ts:64 · member/api/openapi.ts:84 | `\/+$` | server-supplied baseUrl |
| chat/page-label.ts:123 | `\/+$` | runs in the **staff browser** (context-panel / inbox-client) on the widget-reported pageUrl: client-side only; pageUrl cap not verified |
| crm/ai-bridges.ts:372 · crm/calls.ts:375 · platform/crm-bridges/chat.ts:158 · member/reviews.ts:1019 | `\{[\s\S]*\}` | LLM replies (max tokens ≤ ~700–2 000) |
| crm/sequences.ts:1849 | `\S+@\S+` g | `errText()` ≤ 200 chars |
| member/reviews.ts:100 scrubDigits | e-mail-in-text | review body ≤ `REVIEW_BODY_MAX` 2 000 / excerpt 240 |
| chat/quick-reply.ts:94/96 | `[ \t]+…` | quick-reply body ≤ `QR_BODY_MAX` 2 000 |
| account/doc-numbering.ts:216/475 · doc-settings.ts:110 | `(\d+)\s*$` | doc numbers / numbering example (short, generated or settings) |
| account/quick-create-parse.ts:50 | `([0-9][0-9,]*…)\s*…$` | quick-create box in the user's own browser (client) |
| kanban/fields.ts:103/104 · CrmAutomationBuilder.tsx:42 · kanban/AutomationBuilder.tsx:142 | `0+$` · `\B(?=(\d{3})+(?!\d))` | `toFixed` / JS number strings (≤ ~330 chars) |
| member/assistant-shared.ts:58 | table-divider regex | AI answer lines, client |
| crm/portal/PortalLoginForm.tsx:41 | `^\S+@\S+\.\S+$` | client-side check of the visitor's own input |
| ai/eval.ts (several) | `.*` alternations | offline eval harness |

### F16: new fitness rule
`scripts/fitness.mts` F16 with scanner `scripts/lib/tag-strip-scan.mjs`. The scanner uses the TypeScript AST, so comments and strings don't count.
- **What it forbids.** Any regex literal or `new RegExp("…")` of the form `<` [tag name | `(`] [`\s`?] then `[^>]` / `.` / `[\s\S]`… with `*` or `+`.
- **Allow-list.** One entry: `core/sanitize.ts` `/<[^>]*>/g`, pinned as file + literal + count, with a ratchet (F16.2).
- **F16.0 self-test.** 11 must-hit and 8 must-not-hit cases.
- **It bites.** A throwaway `s.replace(/<[^>]*>/g, "")` appended to emails-shared.ts turned fitness red at 38/39, with F16.1 naming `emails-shared.ts:539`. After restoring, the sha is identical and `git diff -- src` is empty. The b8e8ad52 tree has 10 non-allowed hits.

## ORACLE-EDITs
- `scripts/qc-crm-c2.5.mts` `SHA_BOARD_IN` (check C2.5-U.5) is re-pinned to `65cdbcd5…`, marked `// ORACLE-EDIT C5.5-fix5`.
  - The only changes to `src/lib/platform/kanban-email-in.ts` are `payload = capInboundEnvelope(payload)` at the top of `ingestInboundEmail` and `bareEmail` delegating to `firstAngleAddr` (+8/−3).
  - qc-crm-c2.5 passes 105/105 with the new pin.
- No other oracle was edited.
- `rv-cf4-sanitize` RV-2.demo is now ❌ by design. It is a "FINDING DEMO" that asserts bareEmail/displayNameOf **are** quadratic, and they no longer are (0 ms at 10k/20k/40k). It was left as is.

## Tests (tip ef43dfc1 = code; logs /tmp/cf6-logs/v1-* (tree = ef43dfc1 minus the chat/domain one-liners) and r2-* (ef43dfc1))
**Typecheck**
- `pnpm typecheck`: exit 0. It needs the 5 GB heap the other lanes use; the 3.5 GB default hit OOM, exit 134.

**Probes**

| probe | RED (b8e8ad52) | GREEN |
|---|---|---|
| probe-cf6-linear | 2/26 (r2-base: every finding check red, SW.trailing included) | **28/28** (r2) |
| probe-cf6-db | 2/10 (only RV2.normal and CLEAN) | **12/12** (v1, r2) |

- The review probes: rv-cf4-sanitize 9/10 (only RV-2.demo, see above) · rv-cf4-db 10/10.

**Suites**
- qc-sanitize-hotfix 29/29.
- CRM: qc-crm-c2.5 105/105 · c3.5 67/67 · c1.7 57/57 · c2.0 73/73 · c2.11 (email REST) 47/47 · c2.4 (calls/redaction) 91/91 · c2.6 87/87.
- probe-cf2 36/36 · probe-c54e 20/20 · probe-c54e-r2 23/23.
- Kanban: qc-kanban-k1.6 20/20.
- qc-host-routing 5/5.

**Red suites, all identical at b8e8ad52** (re-run with the tree detached at base, same DB):
- qc-crm-c1.10 66/67, C1.10-H.1: HTTP ping with the readonly key → 401.
- qc-kanban-k3.5 20/21, K3.5-S6.4: screenshot count.
- qc-kanban-k3.9 12/13, K3.9-S4.2: screenshot count.
- qc-branding-b2 15/16, B2-S3.2: screenshot count.
- qc-domain 9/10, DM-4.2: env.

**Not run**
- qc-crm-c5.3: it refuses anything but QC2 (C5.3-ENV).

**Docs and fitness**
- Docs gates `gen-{crm,member,kanban,account}-api-docs --check`: all exit 0, and no tracked docs changed.
- Fitness: 39/39 with env and 39/39 without env (F16.0–2 added).
- The pre-commit fitness hook passed.

## Also on prod main (929c39ce): hotfix follow-up list
All of these are byte-for-byte the same expression on 929c39ce, and their fixes are self-contained:
- core/inbound-address bareEmail.
- emails-shared displayNameOf and emailSnippet.
- kanban-email-in From.
- core/email bareAddr.
- emails.ts refIdsOf and the signature `.slice(0,4000)`.
- Thread page REMOTE_IMG_RE.
- The uncapped header strings in the inbound route (the CRM split exists on prod).
- kanban descriptionToText.
- contacts-shared maskPii.
- crm/api/serialize EMAIL_IN_TEXT: the outsider-plantable one; highest priority after RV-1.
- calls-shared redactContactInfo.
- outbox-consumers redactPii.
- ai/dataset anonymize.
- branding/logo SVG `on*=`.
- chat normalizeOrigin and domain normalizeHost.

They need `core/linear-text.ts` plus the new exports in `core/inbound-address.ts`.

Not on prod: RV-1 (emails-actions catch), the composer trailing trim, and the Authentication-Results pair regex. Prod's `authResultPass` is a different, linear parser.

## Not verified
- RV-1 end to end through a running Next server. The action was called directly outside a request, so `session()` throws and the catch path runs. That is the reviewed path, but the success path with a real session was not exercised beyond the service suites.
- The real header lengths the inbound provider forwards, and whether the provider already caps them.
- The page-label pageUrl cap: client-side, listed only.
- Render-level and screenshot checks: the screenshot-count reds are environmental and identical at base.
- hsan attack/fuzz/pgtest harnesses: not re-run, because `core/sanitize.ts` is untouched (git diff b8e8ad52..ef43dfc1 -- src/lib/core/sanitize.ts is empty).
- Member/account/chat suites. No member or account module file changed. Chat changed only by the `normalizeOrigin` one-liner, proven identical on a corpus (SW.trailing), but `qc-chat-security` was not run because it loads `.env.local`.

## Round 2 — review C5.5-fix5 (7b434091: NOT MERGEABLE on RV5-1)
Written 2026-10-01 19:33 UTC · fix commit b3ea41da · probe `scripts/pending/cf6/probe-cf6-r2.mts` (QC3, own tenant, cleaned) · runner `run-round3.sh` · logs `/tmp/cf6-logs/r3-*`.
The RED run uses the tree detached at 335597dc (the round-1 tip); its result is 5/11.

### RV5-1 MED: the signature cap blocked re-saving the settings card (regression from round 1)
**Rule now** (`crm/emails.ts setUserSetting`, constants in `emails-shared.ts`):
1. Raw input must be at most `CRM_EMAIL_SIGNATURE_INPUT_MAX` (16 000), checked before sanitising.
2. Then `sanitizeHtml`.
3. The **sanitized** result must be at most `CRM_EMAIL_SIGNATURE_MAX` (8 000). Over it, the save is refused and nothing is cut.

Both refusals use one message, `CRM_EMAIL_SIGNATURE_TOO_LONG_MSG`, "…นับรวมรูปแบบ/ลิงก์ที่ระบบจัดให้".

**Why a stored value always re-saves:**
- `sanitizeHtml` is idempotent, so a stored value sanitizes to itself.
- It is at most 8 000 characters, so it is under the 16 000 input bound.
- Neither limit can refuse it.

**Alignment with REST and the UI:**
- REST `emails.userSettings.set` uses `optText(CRM_EMAIL_SIGNATURE_INPUT_MAX)` for `signature` and `signatureHtml`. `docs/api/CRM-API.md` was regenerated; the change is `max 4000` → `max 16000`, 2 lines.
- The card (`MySendingCard.tsx`) gets `maxLength={data.signatureInputMax}`. The page passes the constant through props, because the card may not import the CRM module (F2.3).

**Legacy rows** (≤ 4 000 characters, possibly cut mid-tag) are under both limits. They load as stored, and on save the engine repairs the cut tag.

| check | RED @335597dc | GREEN @b3ea41da |
|---|---|---|
| SIG.resave: the reviewer's exact round trip (input 3 980 chars → stored 5 975; re-save with a new sender name) | refused "ลายเซ็นยาวเกิน 4,000…", name lost | accepted, name kept, signature unchanged |
| SIG.rest: `userSettings.set` schema accepts the stored value (`signatureHtml` and `signature`) | too_big ≤ 4000 | ok |
| SIG.roundtrip: 40 random signatures of 0–9 000 chars (links, entities, tags, script, img, mailto); every stored one is well-formed (no tag cut), ≤ 8 000, and re-saves to itself | 20 stored / ok (inputs over 4 000 were refused) | 40 stored, all ok |
| SIG.cap: sanitized form over 8 000 (raw 15 826 → 24 541) refused; raw over 16 000 refused before sanitising; row unchanged | ok (old message) | ok |
| SIG.legacy: a 4 000-char row cut mid-tag loads, re-saves with another field change (stored well-formed, 4 003 chars), and can be edited down to 300 | ok | ok |
| SIG.align: card maxLength, page prop, REST bound | ✗ | ✓ |

**The reviewer's `rv-cf6-db` "FINDING" checks flipped as intended.**
- SIG.resave now reports "accepted".
- SIG.lost now shows `fromName` = "ชื่อใหม่".
- That makes the run 9/11, with the two red checks being the FINDING assertions. The reviewer's file was not edited.

### RV5-2 LOW: F16 widened
`scripts/lib/tag-strip-scan.mjs`. After `<`, the scanner now also accepts:
- an optional `/`, `\/?` or `!`;
- then a tag name, a `(…)`/`(?:…)` group, a lone `(`, a character class with an optional quantifier, or `\w` with an optional quantifier;
- then an optional `\s` quantifier;
- then `[^>]` / `.` / `[\s\S]`-like / `\S` with `*` or `+`.

`RegExp(…)` without `new` is now scanned too.

**Self-test:**
- New must-hit cases (9): `<\/?[a-z][^>]*>`, `<\/?\w+[^>]*>`, `<[a-z]+[^>]*>`, `<(?:p|div)[^>]*>`, `<[a-z][\s\S]*?>`, `<\/[^>]*>`, `<![^>]*>`, `RegExp("<[^>]+>")`, `<\S+>`.
- New must-not-hit cases (4): the three lookbehinds used in src (phone, maskPii, logo) and `<\/(p|div|li|h[1-6]|tr)>`.

**On the tree:** only the allow-listed `core/sanitize.ts` is hit, and fitness is 39/39 both with and without env.

**Bite.** Two reviewer shapes were appended: `/<\/?[a-z][^>]*>/gi` to `kanban/cards.ts`, and `RegExp("<![^>]*>", "g")` to the .tsx `MySendingCard.tsx`.
- Fitness went red at 38/39, and F16.1 named `MySendingCard.tsx:106` and `cards.ts:847`.
- Both files were restored with sha identical, and `src` is clean.

### RV5-3 LOW: inbound bodyText capped
- `crm/emails.ts ingestInbound`: `str(payload?.text).slice(0, 1_000_000)`, the same position and semantics as the HTML (cut after trim).
- TEXT.cap: a 1.1 MB text keeps the head, not the tail, and stores ≤ 1 000 000 characters. A 0.9 MB control keeps the tail.
- RED: stored 1 100 018 chars with the tail.
- The board mail-in text path was already `trim().slice(0, BODY_MAX = 20 000)`, so it is unchanged. `kanban-email-in.ts` was not touched, so no SHA re-pin was needed.

### RV5-4 nuance (INFO) closed
`ingestInbound` now runs `capInboundEnvelope({ ...payload, headers: lowerHeaders(payload.headers) })`, which joins duplicate headers case-insensitively **before** capping, the same order as the route.

HDR.join: a direct call with a short `References` and a 17 KiB `references`:
- RED: the short half was kept (`["short-…"]`).
- GREEN: the joined header is dropped (`[]`).

### Round 2 tests (tip b3ea41da, `/tmp/cf6-logs/r3.summary`)
**Typecheck and probes**
- typecheck (5 GB heap): exit 0.
- probe-cf6-r2: 11/11 (RED 5/11).
- rv-cf6-db: 9/11, where the 2 reds are the flipped FINDING checks.
- rv-cf6-fuzz (60 000): 153/153.
- probe-cf6-linear: 28/28, SNAP identical.
- probe-cf6-db: 12/12, SNAP identical. RV4.cap now follows the input bound; this probe is mine.

**Suites**
- qc-crm-c2.5: 105/105 (the signature/settings service).
- qc-crm-c2.11: 47/47 (REST, including `userSettings`).
- qc-crm-c2.4: 91/91.
- qc-crm-c2.0: 73/73.
- qc-kanban-k1.6: 20/20.

**Docs and fitness**
- Docs `--check` ×4: all exit 0, with no tracked diff after the CRM regeneration.
- Fitness: 39/39 with env and 39/39 without env.

### Not verified (round 2)
- The card in a browser: the maxLength attribute and the error rendering were checked statically only.
- Production rows: no prod data was read. "Legacy ≤ 4 000" follows from the old `.slice(0, 4000)` and was simulated on QC3.

## Controller merge gate record (main tree, 2026-10-01 20:07 UTC)

Patch `scripts/pending/c55merge/fix5.patch` (= wip/crm-cf6 `b8e8ad52..4f6cbb9d`) applied with `patch -p1 --fuzz=3` on session/crm after fix3b. 4 files differ from the worktree because of fix3b (docs/api/CRM-API.md, crm/contacts-shared.ts, crm/emails-shared.ts, crm/emails.ts); changed lines identical (md5 of +/- lines).
Independent review: 2 rounds, MERGEABLE (`crm-C5.5-fix5-review.md`).
Gate unit `crm-main-fix5` (`scripts/pending/run-main-fix5.sh`, log `.qc-shots/crm/main-fix5.log`): 30 steps, 29 exit 0 — typecheck, gen-crm-docs, docs ×4, fitness ×2, pure: probe-cf6-linear, rv-cf6-fuzz, rv-cf6-r2-fuzz, qc-sanitize-hotfix; QC3: probe-cf6-db, probe-cf6-r2, rv-cf6-r2-db, rv-cf4-db, probe-cf2, c2.5, c2.11, c2.4, c2.6, c3.5, c1.7, k1.6, host-routing; QC2: probe-cf5, rv-cf5-r2, c5.3 L1/L3.
The one red: `qc-crm-c2.0` 72/73 = S6.1 child `qc-member-m1.2` 6/7 ("member not found"). Cause = environment: the main checkout's uncommitted `scripts/member-expected.json` (30 Sep, other DB's seed) does not match QC3. Proof: m1.2 on QC3 is 27/27 in cf2 (fix5 without fix3b) and in cd2 (fix3b without fix5), deterministic 6/7 in main, and 27/27 in main when run with the cf2 answer key (main's key restored afterwards, md5 258f6def).

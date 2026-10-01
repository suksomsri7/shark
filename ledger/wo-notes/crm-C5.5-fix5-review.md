# crm-C5.5-fix5 — independent review

Written 2026-10-01 19:14 UTC · worktree `/root/projects/shark-crm-cf2` · branch `wip/crm-cf6` · reviewed tip 335597dc (code ef43dfc1) against base b8e8ad52 · DB QC3 only · not pushed.
Review probes are in `scripts/pending/cf6/review/`:
- `rv-cf6-fuzz.mts` (pure). Old implementations are **not hand-copied**. Each one is cut out of `git show b8e8ad52:<file>` with the TypeScript AST, transpiled and run. Private new functions are cut from the tip the same way; exported ones are imported.
- `rv-cf6-db.mts` (QC3). It uses its own throwaway tenant, user and system, and cleans up after itself.
- `run-review.sh` runs the heavy jobs one at a time, each through `iso.sh` + the gate lock.

Logs are in `/tmp/rv-cf6-logs/`.

## Verdict in one paragraph
- **All 25 rewritten expressions are behaviour-identical to b8e8ad52.** That includes every security-relevant decision: sender identity, the Authentication-Results proof, the SVG refuse/accept verdict, the widget Origin allow-list, Host normalisation and all five PII maskers. Each is now linear.
- **The header caps fail safe.**
- **One regression, introduced by the RV-4 fix, must be fixed before merge.** The new signature cap checks the *input*, but the stored value is the *sanitized* HTML, which can be up to ~50 % longer. A signature that has been accepted once can then no longer be re-saved by the screen that edits it. That screen always sends the stored signature back, so the user also cannot save their sender name or reply-to.

## Findings

### RV5-1 MED: signature cap blocks re-saving the settings card (regression from this card)
**Where:**
- `src/lib/modules/crm/emails.ts:646`: the cap is applied to the input length.
- `src/components/crm/emails/MySendingCard.tsx:25,39`: the card is loaded with the stored `signatureHtml` and sends it back on every save.
- `src/lib/modules/crm/api/ops/emails.ts:300-301`: REST `optText(4000)`.

**Repro** (`rv-cf6-db` SIG.*):
1. A signature of 3 980 characters is accepted. It holds lines with one `<a href="https://shop.example.com/p?a=1&b=2">` each.
2. It is stored sanitized at **5 975** characters, because `&amp;`, `rel` and `target` are added.
3. `setUserSetting({ fromName: "ชื่อใหม่", signatureHtml: <stored> })` is refused: "VALIDATION ลายเซ็นยาวเกิน 4,000 ตัวอักษร". The card makes exactly this call.
4. The sender-name change is lost (`fromName` stays null).
5. A REST GET → PUT round trip of the same row fails `optText(4000)` in the same way.

On b8e8ad52 the stored value was at most 4 000 characters (cut with `.slice`), so re-saving always passed. Even a signature saved before this card can grow past 4 000 characters on its next save and then lock the card.

**Fix (pick one).** `sanitizeHtml` is idempotent on the stored value: SIG.idem 5975 → 5975.
- (a) Cap the **sanitized** result instead of the input: refuse if `sanitizeHtml(input).length > N`. Raise the input cap and REST `optText` to the same N (or about 2N), so the stored → re-sent value always passes.
- (b) Skip the cap when the trimmed input equals the currently stored `signatureHtml`.

Option (a) keeps one rule for the UI and REST.

### RV5-2 LOW: F16 misses common tag-strip shapes (regression guard, not a current hole)
**Where:** `scripts/lib/tag-strip-scan.mjs:11`. The pattern only allows a *literal* tag name or `(` after `<`.

**What it misses.** All of the following are quadratic in V8 (×14–×20 for 4× input, 20 000 × `<a`/`<p`/`</`/`<!` ≈ 0.7–0.9 s):
- `/<\/?[a-z][^>]*>/gi`
- `/<\/?\w+[^>]*>/g`
- `/<[a-z]+[^>]*>/gi`
- `/<(?:p|div)[^>]*>/gi`
- `/<[a-z][\s\S]*?>/gi`
- `/<\/[^>]*>/g`
- `/<![^>]*>/g`
- `RegExp("<[^>]+>")` called without `new`

**Current tree.** A broader AST scan of `src/` (any regex with `<` followed by a quantified `[^>]`, `.`, `[\s\S]`, `\w` or `\S`) finds only:
- the allow-listed `core/sanitize.ts:132`;
- `emails-shared.ts:452 /(<[^<>]*>)/`, which is linear;
- an unrelated phone regex.

So nothing slips through today.

**Fix.** After `<`, also accept `\/?`, a character class or `\w` with a quantifier, `!`, and a non-capturing alternation group. Also treat `RegExp(` like `new RegExp(`. Add these shapes to `F16_SELF_TEST.mustHit`.

**Bite.** The guard does bite on the shapes it targets (see Tests).

### RV5-3 LOW (pre-existing, prod too): inbound `bodyText` stored uncapped
**Where:** `src/lib/modules/crm/emails.ts:2458`, `str(payload?.text) || …`. The HTML is cut at 1 000 000 characters, but the text part is not; the route accepts up to 10 MB.
- After this card every masker on that field is linear. So this is now a storage and row-size issue, not CPU.
- **Recommended:** `.slice(0, 1_000_000)` like the HTML, as defence in depth for any future regex on `bodyText`.

### RV5-4 INFO: what "drop over-long header" does downstream (verified on QC3, `rv-cf6-db` CAP.*)
| case | result | assessment |
|---|---|---|
| From > 998 characters (`"<1000×ส>" <cust@…>`) | stored IN with `fromAddr ""`, no contact, `handled: true`. Base would have attributed it to the contact (old `bareEmail` extracts the trailing `<addr>`) | Fail-safe: no identity, no lead, no proof. The sender bucket key becomes `from:` (shared by all such mails) and the per-system bucket still applies |
| CRM inbox To item > 998 (very long display name) | `invalid`; the route answers 200 and the mail is gone | Not realistic for one address |
| To/Cc lists | String lists are split on `,` before the cap, and array items are per address, so a long legitimate To/Cc list is **not** dropped. Only a single item > 998 is dropped. An array item that holds a whole comma-joined header was already unparseable on base | OK |
| Message-ID > 998 | `invalid`; nothing stored, so no dedupe collision is possible | Fine |
| Authentication-Results joined > 16 KiB | Positive control: a staff BCC copy with our A-R gives OUT. Padding the joined header past 16 KiB gives IN. Forged duplicates of our A-R padded past 16 KiB also give IN | Fail-closed only. The route caps **after** the case-insensitive join (`crmExtras`), so a sender cannot drop the MTA's header and keep a forged one |
| References > 16 KiB | dropped; In-Reply-To still threads the reply into the parent's thread | OK |

**Nuance (INFO):** `capInboundEnvelope` inside `ingestInbound` caps per *raw* key, before `lowerHeaders` joins duplicates.
- A non-route caller passing `{ "Authentication-Results": a, "authentication-results": <17 KiB> }` would have the long one dropped and the short one kept.
- The route is the only caller (`grep ingestInbound(`), and it hands over keys that are already joined and lower-cased, so this is unreachable today.
- Capping after `lowerHeaders` would close it for good.

### RV5-5 INFO: catch-path "empty body" flag semantics (`emails-actions.ts:110`)
`htmlToText` now decides emptiness, so `&nbsp;`-only and script/style-only bodies are flagged "empty". Base saw `&nbsp;` as text. This is only the field flag on a VALIDATION failure, and it matches the service.

The new up-front check (`crmEmailBodyTooLong` on `bodyHtml`) uses the same byte rule as the service (`emails.ts:1331`, `Buffer.byteLength`, 500 KiB). REST sends go straight to the service, which already enforced this.

### RV5-6 INFO (pre-existing, not this card): board mail-in uses the FIRST angle pair, CRM the LAST
`kanban-email-in` `bareEmail` ≡ `/<([^>]+)>/`, while core `bareEmail` ≡ `/<([^>]*)>\s*$/`. So From `<staff@shop.co> x@evil.co` assigns the card to staff. Board mail-in has no sender proof at all, so this adds nothing. It is kept identical on purpose (ORACLE-EDIT scope).

## Equivalence, old (from git) vs new: `rv-cf6-fuzz` 153/153
**Method**
- 60 000 seeded-random adversarial inputs per site plus fixed edge cases.
- Alphabet: `< > <> >< " ' \ ( ) , ; @ . =`, `\0`, VT, FF, NBSP, BOM, U+3000, U+2028/2029, U+0085, U+180E, U+200B, Kelvin K, long s, dotted/dotless I, Thai, fullwidth `＜＞`, `‹›`, plus site-specific tokens.
- Every check also requires more than one distinct old output, so no check passes on a corpus that never exercises the function.

**Sites, all identical**
- Core `bareEmail` (60 024 inputs, plus 15 000 long ones).
- `displayNameOf`.
- Kanban `bareEmail`.
- Core/email `bareAddr`.
- `refIdsOf`.
- **The whole `authResultPass`** (instances parser + pairs), compared old vs new:
  - 60 014 random inputs;
  - **60 000 structured A-R documents**: our/foreign authserv-ids, folding, comments, quotes, escaped quotes, `xdmarc=`, `foo.dmarc=`, `xheader.from=`, `reason="…header.from=…"`, `a"b"header.from=`, duplicates joined by `\n` or `,`, plus noise insertions. **6 038 of them authenticate, identically on old and new.**
  - The pair regex alone: identical match lists (index, key, value) on 60 000 inputs. The literals were checked against both files.
- The kanban `descriptionToText` whole function.
- `stripTags` (both forms), `replaceOpenTagCi`, `trimEndBlanks` (including strings with embedded `\n`), `trimBlanksBeforeNewlines`.
- `hasRemoteImages`, and the whole `emailSnippet`.
- **The SVG verdict.** Full `.some()` and the `on*=` pattern alone; 60 000 short and 15 000 long documents; 30 159 / 955 / 13 074 refusals respectively.
- **`normalizeOrigin`** (whole function, including `new URL`).
- **`normalizeHost`**.
- `replaceEmailsInText`, both local-part classes, including the overlap cases `a@b.cd9x@e.fg` and `a@b.cd_x@e.fg`.
- **`maskPiiPatterns`**, `redactContactInfo`, `anonymize`, `redactPii` (each whole function, old vs new) and contacts `maskPii`.

**Positive control.** 9 of the 14 fixed A-R values authenticate on both old and new.

**Answer to the security questions.** Every refuse/allow/mask decision is unchanged on adversarial input:
- no forged A-R is read as authenticated, and no real one is skipped;
- no SVG that was refused before now passes;
- no new Origin is accepted;
- no host maps differently;
- nothing that was masked before is left unmasked.

## Complexity
- **Growth, new code.** Time(4n)/time(n) was measured with n = 50 000 → 200 000. Pumps were aimed at the new code as well as the old: `<`, `<>`, `<<>`, `< `, trailing and leading whitespace, `<…>`, `a <`, `\n<…>`, `<li`, `<img`, `<img src="http`, `<i`, `</`, `&`, `a@`, `a@b.`, `x@a.a.…`, `a@b.c9`, `'`, `-@`, `a@-…`, `a@a.a@`, `1 `, `0`, `1(`, `onon`, `on `, `aon=`, `on`+x…, `onx`+spaces, `////…x`, `....x`.
  - Every one is linear. The largest time at 200 000 characters is 7.5 ms (descriptionToText on ` \t\n`).
  - The few ratios above ×8 are sub-millisecond noise (0.13–0.93 ms at 200k).
- **core `htmlToText`** (the RV-1 catch path and inbound `bodyText`): 12 pumps at n = 20 000 → 80 000 are linear (≤ 7.5 ms). This confirms the single F16 allow-list entry.
- **`authResultPass` at the 16 KiB cap:** ≤ 1.5 ms on three pumps (a long key run; `k="\"` unclosed quotes, which the instances parser rejects first; `a="x`).
- **End to end (QC3, builder probe re-run):** RV1 / RV2 / RV2K growth is green. 1 MB From + To + Cc + References + A-R is answered in under 3 s (probe-cf6-db 12/12, SNAP identical to base).

**"Bounded" sweep entries, verified for the most exposed ones**

| site | bound |
|---|---|
| `chat/page-label.ts:123` `\/+$` | `pageUrl` reaches `meta` only through `safeContext`, which caps it at `CONTEXT_VALUE_MAX = 512` (`chat/service.ts:1047,1063`). No other writer |
| `member/reviews.ts:100` scrubDigits | the review body is written only by the public submit path. zod `max(REVIEW_BODY_MAX = 2000)` at `reviews.ts:445`, and the update at :482. The other writers set null or do not touch the body |
| `crm/sequences.ts:1849` `\S+@\S+` ("HANG" in the sweep) | input is `errText()`, which is `.slice(0, 200)` (`sequences.ts:115`) |
| `\{[\s\S]*\}` (ai-bridges, calls, crm-bridges/chat, reviews) | LLM replies with `maxTokens` 250–900 |
| `forms/service.ts:402` `\/+$` | `formEmbedCode` on `publicOrigin()` (Host / x-forwarded-host). Staff page only, header-size bound ≈ 0.2 s. LOW, as the builder says |

## F16 and ORACLE-EDIT
**F16 bite (own shapes, different from the builder's):**
- `new RegExp("<li[^>]*>", "gi")` appended to `src/lib/modules/kanban/cards.ts`;
- `/<([^>]*)>\s*$/` appended to the thread `page.tsx` (.tsx).

Fitness without env went red at 38/39, and F16.1 named both `cards.ts:847` and `page.tsx:117`. Both files were restored from byte copies with sha256 identical, and `git status -- src` was empty afterwards.

**Allow-list.** One entry (`core/sanitize.ts` `/<[^>]*>/g` ×1), which is minimal and justified.

**Gaps:** see RV5-2.

**ORACLE-EDIT (`qc-crm-c2.5.mts` `SHA_BOARD_IN`): legitimate.**
- `sha256(kanban-email-in.ts)` at the tip = `65cdbcd5…0504` (the new pin). At base it was `14058708…f496` (the old pin).
- The diff is exactly +8/−3: the import, the doc comment plus the `firstAngleAddr` delegation (proven identical), and `capInboundEnvelope` at the top.
- qc-crm-c2.5 passes 105/105. No other oracle and no `*-expected.json` changed in the reviewed commits.

## Tests run (tree 335597dc, `/tmp/rv-cf6-logs/rv.summary`)
**Typecheck and probes**
- typecheck (5 GB heap): exit 0.
- rv-cf6-fuzz: 153/153.
- rv-cf6-db: 11/11. Its "FINDING" checks *confirm* RV5-1; CLEAN ok.
- probe-cf6-linear: 28/28 (SNAP identical).
- probe-cf6-db: 12/12 (SNAP identical).
- rv-cf4-sanitize: 9/10. The red is only RV-2.demo, by design: it asserts the old quadratic behaviour.
- rv-cf4-db: 10/10.
- qc-sanitize-hotfix: 29/29.

**Suites**
- qc-crm-c2.5: 105/105.
- qc-crm-c2.11: 47/47.
- qc-crm-c2.4: 91/91.
- qc-crm-c1.10: 66/67 (C1.10-H.1, identical in the builder's base run `/tmp/cf6-logs/r2-base-qc-crm-c1.10.log`).
- qc-kanban-k3.9: 12/13 (K3.9-S4.2 screenshot count, identical at base).
- qc-kanban-k1.6: 20/20.
- qc-host-routing: 5/5.

**Fitness**
- With env: 39/39.
- Without env: 39/39.
- Bite: 38/39 as intended.

## Prod (main 929c39ce, read in `/root/projects/shark-crm-hsan`): which fixes are needed and how exposed they are
Every item below is the same expression on prod. Old-regex timings were measured on this machine.

| # | site on prod | who can trigger it | cost |
|---|---|---|---|
| 1 | `crm/api/serialize.ts:63` `maskPiiPatterns`, run on every string of READONLY-key and AI-assistant responses, including inbound `bodyText` (uncapped, `emails.ts:1829`) | an outsider plants the text by mailing `crm+<key>@` (that address is in the Reply-To of every CRM mail); a staff member's AI read or a readonly key triggers it | `a`×64k = 6.1 s; 1 MB ≈ 25 min per string. **Highest impact.** Needs CRM v2 inbound enabled on prod |
| 2 | `chat/service.ts` `normalizeOrigin`, via `public-auth.ts:146` `chatPreflight` (OPTIONS on `/api/v1/chat/*`) | **unauthenticated, any client, no prerequisites** | Origin `https://a.co` + `/`×16k + `x` ≈ 0.22 s CPU per request (8k: 74 ms). A request-amplification DoS. **Easiest to reach** |
| 3 | inbound From / References parsers: core `bareEmail`, `displayNameOf` (`emails.ts:1820/1889/1958`), `refIdsOf` (:1776) and the kanban `bareEmail` | anyone who can send mail to a CRM or board address. The route itself needs `X-Inbound-Secret`, so it is reachable only through the mail provider, and the header size the provider/MTA lets through is unknown | `<`×40k ≈ 2.8 s per mail; 100 KB (a common MTA header limit) ≈ tens of seconds |
| 4 | `domain/service.ts` `normalizeHost` | Host header; only if the edge routes an odd Host to the app | 16k = 0.2 s |
| 5 | `branding/logo.ts:43` SVG `on*=` | shop owner/admin logo upload (2 MB) | `onon`×80k = 2.7 s; 2 MB ≈ hours. Insider |
| 6 | kanban `descriptionToText` | whoever writes a raw `<…` description over REST (an API-key holder). Email-in escapes or sanitizes | insider |
| 7 | `calls-shared` `redactContactInfo` (≤ 100k transcript), `contacts-shared` `maskPii`, `outbox-consumers` `redactPii`, `ai/dataset` `anonymize` (`SHARK_AI_COLLECT=1` only), core/email `bareAddr` | internal or bounded inputs | low |
| 8 | thread page `REMOTE_IMG_RE` | runs on *stored sanitized* HTML, where every `<img` is a closed tag | not exploitable in practice |
| 9 | signature `.slice(0,4000)` | cosmetic tag cut | if ported, port it with the RV5-1 fix |

Not on prod: RV-1 (the emails-actions catch path), the composer trailing trim, and the A-R pair regex. Prod's `authResultPass` is different.

The prod hotfix must carry `core/linear-text.ts` and the new `inbound-address.ts` exports, and should add the RV5-3 `bodyText` cap.

## Not verified
- What the real inbound provider forwards: header lengths, whether To/Cc arrive as arrays, and decoded vs encoded-word display names. If From is passed raw with encoded words, a very long Thai display name (≈ 250+ characters) would push From over 998 and lose attribution (RV5-4).
- Whether CRM v2 inbound, the AI assistant and READONLY keys are actually enabled on prod. This drives prod rank #1.
- The real header-size limit at the Vercel edge, which affects ranks #2 and #4.
- A UI render of the MySendingCard error. The refusal was shown at service level with the exact call the card makes.
- qc-crm-c5.3 (refuses anything but QC2) and qc-chat-security (loads `.env.local`): not run.
- The base re-run of the red suites was not repeated by me; I compared against the builder's base logs.

VERDICT: NOT MERGEABLE (RV5-1: the signature cap is on the input, not on the stored sanitized value, so the settings card cannot be re-saved; fix as in RV5-1, then mergeable. RV5-2 and RV5-3 can follow later.)

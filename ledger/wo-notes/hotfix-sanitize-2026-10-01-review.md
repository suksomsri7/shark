# REVIEW — hotfix sanitize 2026-10-01 (independent security review of 6513a9f7)

VERDICT: **SHIP** — no BLOCKER. Use the reviewer's `finder.sql` instead of the note's query (S1). S2 and S3 are fast follow-ups, not gates.

Scope: `git diff 04d2ade9 6513a9f7 -- src` (engine `core/html-allowlist.ts`, `core/sanitize.ts`, `kanban/sanitize.ts`, render hunks `member/join.ts joinForm`, `kanban/cards.ts getCardDetail`).
Not reviewed: the "Item 2 — automation page authz" work that another session is doing, uncommitted, in this same worktree.
Reviewer: read-only on `src/`, no DB, no env, no builds, no prod.
Harness: `scripts/pending/hsan-review/` (every file `@ts-nocheck`; tsc on these 11 files = 0 errors).

## Judge (independent of the builder's oracle)
- No HTML parser in `node_modules` (parse5, htmlparser2, jsdom, linkedom, cheerio and happy-dom are all absent). Installing one was not allowed.
- So the judge is my own WHATWG tokenizer, `judge.mts`. It covers every state reachable from data:
  - tag open, end tag open, tag name
  - before / after attribute name, attribute name
  - before attribute value, double-quoted / single-quoted / unquoted value, after attribute value (quoted), self-closing
  - bogus comment, markup declaration, the comment states, DOCTYPE, CDATA outside foreign content
  - character references with the FULL entity table: 2 125 names plus the 106 legacy names without semicolon, taken at runtime from the `entities` tables bundled in `next/dist/compiled/node-html-parser`. Includes the historical attribute rule and the windows-1252 numeric remap.
  - URL scheme parsing as in WHATWG URL: trim C0 and space, strip TAB/LF/CR.
- RCDATA, RAWTEXT, script, PLAINTEXT and foreign content are not modelled. Every tag that enters them is itself a violation, and none was ever emitted.
- Self-test (`judge-selftest.mts`) is GREEN:
  - 33 inputs that must be flagged, e.g. `&#106avascript:`, `java&Tab;script:`, `&NewLine;javascript:`, leading C0, `<p\fonclick>`, `<a href=" &#1;javascript:">`.
  - 9 inputs that must pass.
- Positive control: the same judge on the PRE-hotfix sanitizers finds 63 672 XSS-class violations in 20 000 fuzz inputs.

## Results
| # | test | result |
|---|---|---|
| 1 | Handcrafted parser-differential set (`corpus.mts vectors()`), 3 027 inputs × 6 modes, judged on f(x) and f(f(x)) plus idempotence. Covers 50 scheme variants × 6 quote styles × 4 separators, 13 separators (NUL, VT, NBSP, U+2028, U+3000…) × 17 tags, `>` / backtick / unbalanced quotes in values, comment, CDATA, PI and bogus forms, nested-opener tricks, svg/math/template/noscript/textarea/xmp/plaintext namespace confusion, NUL/BOM/ZW/RTL/Kelvin in tag names, duplicate and `data-href` attributes, markdown-lite inputs. Modes: kanban `sanitizeDescription`, kanban `renderDescription`, core default (policy), core links (composer), core inbound (img+links), core render (showImages). | **0 violations** |
| 2 | Grammar plus byte-mutation fuzz: **300 000 inputs, seed `0x5a11c0de`** (`FUZZ_SEED`/`FUZZ_N` env), × 6 modes = 1.8 M judged outputs, plus 2nd pass and idempotence; 50 s. | **0 XSS-class** · 8 POLICY = one input × 4 core modes × 2 passes, explained in N1 |
| 3 | Render-side re-sanitise of rows that the legacy sanitizer already stored, on benign corpora. | Only the declared benign differences (#1 `<`→`&lt;`, #3 `<o:p>` dropped). Visually identical. No corruption. |

### mXSS / double-decode reasoning (confirmed by the runs)
- The output is rebuilt from tokens. Every `<` is either a canonical tag that the policy wrote, or `&lt;`.
- Attribute values are decoded once (5 named entities plus numeric references) and then re-escaped. Every other entity becomes `&amp;…`, so the browser sees exactly the string the scheme check saw.
  - Example: `&#106avascript:` without a semicolon is browser-decodable, but here it stays literal `&amp;#106avascript:`, which is a relative URL.
- Text is never decoded, so `&lt;svg&gt;` stays text on every pass. f∘f = f held on all 1.8 M fuzz outputs.
- No state-switching or foreign tag can be emitted, so `<pre>`/`<code>` content is ordinary data and svg/math can never re-open.

### Allowed-tag abuse (all NOTE, pre-existing)
- **N2 phishing.** `<a href=https://evil>https://shark.in.th/…</a>` survives in both sanitizers.
  - On the public join page the shop owner controls it. On cards it can come from outsiders (mail-to-board, portal).
  - Only `rel="noopener"` is set. Add `noreferrer nofollow ugc`.
  - Kanban links have no `target`, so they navigate away from the app.
- **N3 beacons.** `<img>` is only possible in CRM inbound mail: a `sandbox=""` srcDoc that staff open with "show images". Policy and kanban drop `<img>`.
- **N4 expansion and nesting.** Worst output/input ratio:
  - core: 5.3× (`"` in an unquoted href → `&quot;`)
  - kanban: 5.1×
  - `renderDescription`: 6.0×
  - the `<` → `&lt;` case: 4×
  - Nesting depth is unbounded: 50 000 `<blockquote>` pass. Both are owner-scoped or capped (kanban 20 000 chars, policy API 200 000).

## Performance (best of 3, box load ≈4 on 4 CPUs)
| function | worst at 1 MB | at 8 MB |
|---|---|---|
| `sanitizeDescription` | 47 ms (`<p><b>`×n) | — |
| `sanitizeHtml` | 61 ms (`<a href>`×n) | — |
| `sanitizeHtml` inbound | 60 ms | 516 ms (linear) |
| `htmlToText` | 164 ms | **2 352 ms** (`<a `×n with no `>`, ×4.1 per doubling above 2 MB) |
| `renderDescription` | 463 ms (`- a\n`×n); legacy 726 ms | — |

- The ReDoS shape `<a`+spaces now takes 1 ms. The builder's claim "≤156 ms @1 MB" holds (61 ms measured).
- Also measured: attribute soup, `<script>` with no closer, `<script></scrip`, `<!--`, `<!-- --`, `</`, `<a/`, `&`/`"`/`<` ×n. All are linear: each scan jumps the cursor past the region it searched, and the closer/comment searches are cached.
- `joinForm` re-sanitises on every public page view. The worst stored policy (from a 200 000-char API body) costs ≤ 10.6 ms.
- **S2 (SHOULD-FIX, follow-up).** `crm/emails.ts:1825-1826 ingestInbound` runs `sanitizeHtml` + `htmlToText` on UNCAPPED `payload.html`.
  - Who can reach it: anyone who mails `crm+<key>@` on a CRM v2 shop with inbound enabled. The route needs the relay's `X-Inbound-Secret`; the relay forwards any sender's mail.
  - Bound: the route rejects bodies over 10 MB, so the worst case is ≈ 0.5 s + 2.4 s ≈ **3 s CPU per mail**. Before the hotfix it was cubic, i.e. unbounded.
  - Fix: `str(payload?.html).slice(0, 1_000_000)` (or 512 KB) before both calls. That is 2 lines and can ride this hotfix if wanted.
  - `renderDescription` does not need a fix. Its callers are kanban mail-in (text ≤ 20 000 chars ⇒ < 10 ms) and CardBack in the user's own browser.
  - `descriptionToText` now only sees sanitised input (≤ 20 000 chars).

## Sink coverage (independent sweep of src/ and apps/mobile, then spot-checked)
- Only two `dangerouslySetInnerHTML` render DB text: `CardBack.tsx:1032` and `JoinFlow.tsx:549`.
  - CardBack gets its value from `getCardDetail` (sanitised), from client `renderDescription` (sanitised), or from the `updateCardFieldsAction` reply (sanitised at cards.ts:442).
  - JoinFlow is fed only by `joinForm` (sanitised). This covers the page `/m/[slug]/join` and REST `GET /join/{slug}/form`.
- The others (Kanban/Member/AccountIcon, ThemeRoot, the QR svg, the EmailThread srcDoc sandbox) are constants or not fed by these fields.
- Mobile has one WebView. It loads the web app by `uri` and never takes `html:`.
- No other paths output these fields as HTML: no print/HTML export, no public board or card page, no notification e-mail, and the CSV export has no description column.
- **S3 (SHOULD-FIX, follow-up) — RAW JSON reads.** First-party code is safe; a third-party API consumer that renders these values gets XSS.
  - `kanban/api/serialize.ts:86 cardRow` → `GET /boards/{id}`, `GET /boards/{id}/cards`, card create/patch/delete/restore/duplicate/due, and the AI tools.
  - `GET /boards/{id}/card-templates`, `POST /cards/{id}/card-templates`, `GET /templates` (`structure.cards[].description`).
  - Member `GET /privacy/policies`, `POST …/publish`.
  - `descriptionToText` (cards.ts:325) DECODES `&lt;` → `<` after stripping tags. The "plain text" field of `GET /cards/{id}/detail` can therefore carry `<img src=x onerror=…>` text. It also feeds the kanban AI prompt (prompt-injection, not XSS).
- Fix: sanitise in `cardRow`, the template DTOs and `listPolicyVersions`/`publishPolicyVersion`, and stop the entity decode in `descriptionToText` (or re-escape its output).

## Behaviour compatibility (`attack.mts compat`; legacy = verbatim copies of 04d2ade9 in `legacy/`)
- Word paste: `<o:p>` dropped, invisible.
- Gmail and Outlook threads: structure kept as before (blockquote, br, mailto in links mode). `<style>`/`<table>`/`cid:` img are dropped exactly as before.
- Links with `&`: legacy produced `&amp;amp;` (a broken link); new produces correct `&amp;`. Rows already stored broken stay as stored.
- PDPA policy (h2/h3/ul/blockquote/mailto): byte-identical.
- CardBack markdown-lite round trip: identical except the `&` fix.
- Thai text with comparisons:
  - `x <5` and `1<2` become `&lt;`, which renders the same.
  - `a<c</p>` was kept verbatim by legacy and is now dropped. A browser parses it as an element named `c<` either way, so the visible result is identical.
- **N6.** Cards created RAW via REST, AI or templates with `<img>`/`<table>`/`<h3>` lose that markup at render now. This is intended.
- **N7 (pre-existing, not from this hotfix).** `CardBack.tsx:342 startEditDesc` loads the stored HTML into the textarea, and saving re-escapes it. Editing an HTML description therefore shows the tags as literal text.
- **N5 (pre-existing, same as legacy).** The tag ends at the first `>`, so `<a href="https://x/?q=a>b">` loses the link and shows `b">`. This is safe.
- **N1 (pre-existing `linkSchemeOk`).** It strips every C0 character and space, so `href="ht tp://x"` is accepted. The browser treats that as a relative URL: harmless, never script.

## Stored-data SQL (item 7)
- **S1 (SHOULD-FIX before running it).** The note's query is truly read-only. `BEGIN READ ONLY` was verified in PGlite to reject UPDATE, and it takes AccessShare locks only. But:
  - (a) It has no `statement_timeout` and no per-table LIMIT. The CrmEmailMessage part regex-scans every stored body (MBs each, detoasted) with no time window. That is heavy at business hours.
  - (b) Its pattern misses obfuscated shapes. Measured on exploitable-under-innerHTML rows (`exploitable.mts`):

| population | rows | note's pattern misses | reviewer pattern misses |
|---|---|---|---|
| legacy-kanban output | 8 774 | 37 | 0 |
| legacy-core output | 7 293 | 27 | 0 |
| RAW rows (REST/AI/template writes, rendered verbatim on prod until now) | 39 612 | 447 | 0 |
| real Postgres 17 (PGlite) on 7 347 rows | 1 042 exploitable | 115 | 0 |

  - Missed shapes include `java\tscript:`, `&#106;avascript:`, `"onmouseover=` after a quote, `/onclick=`, and handlers on tag names containing NUL.
- PG and JS regex semantics differ only on non-ASCII whitespace. PG's `\s` is ASCII-only, which is closer to the browser.
- **Use `scripts/pending/hsan-review/finder.sql`.** It is generated by `mkfinder.mts` and ran verbatim in PGlite. It has:
  - `statement_timeout`
  - LIMIT 500/2000/500
  - a `hit` column holding the matched fragment
  - the CrmEmailMessage part separated out, run off-peak with a 90-day window
- Expect noise: `<br/>`, `<o:p>`, "data:" in prose.

## Rollout checklist
- Before deploy, on the QC DB: run the QC list in the note, plus `pnpm exec tsx scripts/qc-sanitize-hotfix.mts`, plus `pnpm exec tsx scripts/pending/hsan-review/attack.mts`.
  - Expect 0 violations, and `judge-selftest` OK.
- Right after deploy:
  - Open 2–3 real public `/m/<slug>/join` pages that have a policy. Headings, lists and links should render with no console errors.
  - Open kanban cards that have bold/list/link descriptions, including a link with `&`.
  - Send a mail-to-board test on a QC board with `<svg/onload=alert(1)>` and `<details/open/ontoggle=alert(1)>x`. Expect plain text and no alert.
  - Open a CRM inbound thread and toggle "show images".
  - Watch Vercel errors/duration for `/api/email/inbound`, `/m/*/join` and the kanban card server actions for 30 minutes.
- Stored data: run `finder.sql` read-only. Triage the hits by tenant and author.
  - These rows are now neutralised at render, but REST consumers still receive them raw (S3).
  - Cleaning them is a separate write that needs owner approval.
- Rollback: redeploy the previous production deployment (04d2ade9) with Vercel instant rollback. There is no migration and no data change, so it is safe and instant.
  - But a rollback re-arms every stored payload, because the render-side sanitise goes away. Prefer fix-forward.

## Checkpoints
- R0 read note + diff + engine; no parser in node_modules ⇒ own judge.
- R1 judge self-test GREEN; vectors 3 027×6 → 0; compat shows only the declared benign diffs.
- R2 fuzz 300 000×6 (seed 0x5a11c0de) → 0 XSS; positive control 63 672.
- R3 SQL recall measured (JS and real PG); finder.sql written.
- R4 sinks swept; S3 listed.
- R5 perf done; S2 quantified.
- R6 verdict SHIP.

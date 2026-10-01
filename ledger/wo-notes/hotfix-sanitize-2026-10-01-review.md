# REVIEW — hotfix sanitize 2026-10-01 (independent security review of 6513a9f7)

VERDICT (branch `hotfix/sanitize-2026-10-01` at 7089364c + review commits): **SHIP items 1–4** (see "Release verdict" at the end).
- Item 1, sanitizer: SHIP. Use the reviewer's `finder.sql` instead of the note's query.
- Item 2, automation authz: SHIP.
- Item 3: SHIP.
  - 3a: payment profile restricted to OWNER/MANAGER, with audit.
  - 3b: sweep of shop actions guarded only by "logged in to the shop".
  - 3c: CRM inbound HTML capped at 1 MB.
- No blocker. Not caused by this branch, but the next hotfix candidate: **M1 (HIGH)**, the mobile AI routes have no `ai.*` permission check. Any staff member's mobile token can use the shop AI to read customer phone numbers, CRM leads and finances, read and delete the shop's AI chat history, and plant facts in AI memory. Details are in Item 3.

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

## Item 2 — automation page authz (4d64b0dc)

VERDICT: **SHIP**.
- This was read-only review plus a narrow `tsc` over `src/lib/automation/*.ts` and the sanitizer files: 0 errors.
- The DB suite was not run (no DB).

**Fix correctness**
- **Tenant isolation holds.** `tenantDb` puts `updateMany`/`deleteMany` in `WHERE_OPS`, so it ANDs `{tenantId}` into the where clause (`core/db.ts:36-42, 99-101`).
  - `AutomationRule` is registered `tenant` in `core/scope.ts:166`.
  - So `{ id, scope: "KANBAN" }` cannot write cross-tenant.
  - Before the fix, `update`/`delete` by bare id were already converted to tenant-guarded writes. The hole was cross-SCOPE inside one tenant, plus the missing permission check.
- **The gate is correct.** `canManageShopAutomation` → `rbac.evaluate`:
  - OWNER: always.
  - MANAGER: `canAccessUnit` with no unitId is true, so always.
  - STAFF: only with `automation.rule.create` or `automation.*`.
  - The built context has the same shape as `chat/guard.ts membershipOf`. It is the same key the AI proposal `automation_create_rule` (`proposals.ts:179`) already enforces for the same `createRule`.
- **The return-type change breaks nothing.**
  - The only callers of `setRuleEnabled`/`deleteRule` are `automation/actions.ts:97,106`, and they ignore the return value.
  - The CRM `deleteRule` imports at `app/app/sys/[id]/crm/settings/{scoring,assignment,automation}/actions.ts` are different functions from CRM modules.
  - `proposals.ts:1354` uses only `createRule`.
- Other writers in the service:
  - `createRule` creates scope KANBAN with `boardId` null (default). It is now gated by the page action, and the AI path was already gated.
  - `markNotificationRead` already uses `updateMany` + `visibleTo(userId)`. OK.

**Who loses access on production**
- Un-keyed STAFF lose access. Before the fix, every STAFF member could create, toggle and delete shop rules. Now they need `automation.rule.create` or `automation.*`.
- No role preset or seed grants it: the only registry entry is `core/permissions.ts:666`.
- The page and the nav link (`NavDrawer.tsx:362`) are still shown to everyone.
  - create → Thai error message.
  - toggle/delete → silent no-op. That is a UX NOTE: hide the buttons when `!mayManage`.
- This is intended and matches the house key. No OWNER or MANAGER loses anything.
- Impact query (read-only):
```sql
BEGIN READ ONLY; SET LOCAL statement_timeout='30s';
SELECT count(*) AS staff_without_key, count(DISTINCT m."tenantId") AS tenants
  FROM "Membership" m
 WHERE m.role = 'STAFF'
   AND coalesce(m.permissions->>'automation.rule.create','') <> 'true' AND coalesce(m.permissions->>'automation.*','') <> 'true'
   AND m."tenantId" IN (SELECT "tenantId" FROM "AutomationRule" WHERE scope = 'KANBAN' AND "boardId" IS NULL);
ROLLBACK;
```

**Ruling check (board-level KANBAN rules stay toggle/deletable here without board ADMIN): acceptable for the hotfix.**
- Who can do it: only OWNER, MANAGER, or a STAFF member the owner explicitly granted `automation.rule.create`. Before the fix, any STAFF member could.
- Worst case: a shop-level automation manager disables or deletes a board's rule. That is integrity/availability inside one shop. The rule is not modified, its actions are not changed, and no data is exposed.
- No escalation path or cross-board data read. Follow-up: filter on `boardId: null` in `listRules` and both writers.

**QC suite `scripts/qc-automation-authz-hotfix.mts` (read, not run): non-vacuous.**
- It has positive controls: S1.4 toggles off→on, S2.3 deletes own rule.
- It covers cross-scope (journey/tier/CRM), cross-tenant, unknown id with no throw, `listRules` unchanged, the gate truth table (7 cases incl. `automation.*` and `kanban.automation.manage` ✗), and static wiring order.
- Safety:
  - It uses `loadQcEnv` (which has a prod-host guard) BEFORE the dynamic `import("@/lib/core/db")`.
  - It creates its own tenants and cleans up to 0.
- Limits: the server actions are only checked statically (S5 regex/indexOf). No session-level test.

**Same pattern elsewhere (listed, NOT fixed)**
- **A1 (HIGH, separate hotfix): `src/lib/payment/actions.ts:17-31 savePaymentProfileAction`.**
  - It only calls `requireTenant()`; there is no role or permission check. `/app/settings/payment/page.tsx` is not gated either.
  - Any STAFF member of the shop, even one with zero permissions (e.g. a cashier), can therefore replace the shop's PromptPay ID.
  - That ID is read by:
    - the POS register QR (`app/app/sys/[id]/pos/register/page.tsx:53`, `lib/actions/pos.ts:320`)
    - the online shop (`modules/shop/service.ts:195`)
    - tickets (`modules/ticket/service.ts:612`)
    - school fees (`modules/school/service.ts:425`)
  - Impact: customer payments are redirected to the attacker's account.
- NOTE `src/lib/storage/actions.ts:8 uploadLogoAction`: any STAFF member can upload files of kind LOGO (storage abuse; it does not set the logo).
- NOTE `src/lib/ai/credit-actions.ts:44 loadMoreTxnsAction`: any STAFF member can read the AI credit ledger.
- NOTE automation WEBHOOK rules POST to any `http(s)://` URL with no private-address guard (`automation/engine.ts:33`). This is now behind the key.
- NOTE `listRules` shows webhook URLs (which may contain tokens) to every member who opens the page.
- Checked and OK:
  - domain actions: `assertOwner`
  - webhooks: `assertWebhookCan`
  - marketplace: `assertMarketplaceCan`
  - systems, approval, staff and branding actions: gated
  - `cancelMyRequestAction`: requester check
  - `fetchImageForEditingAction`: CDN host allowlist

**Forensics for Item 2.** The old hole wrote no audit log. Read-only hints:
- Non-KANBAN rules that are disabled:
```sql
SELECT id, "tenantId", scope, name, "updatedAt" FROM "AutomationRule" WHERE scope <> 'KANBAN' AND enabled = false ORDER BY "updatedAt" DESC LIMIT 200;
```
- Run history that points at deleted rules:
```sql
SELECT r."tenantId", r."ruleId", max(r."createdAt") FROM "AutomationRun" r LEFT JOIN "AutomationRule" a ON a.id = r."ruleId" WHERE a.id IS NULL GROUP BY 1, 2 LIMIT 200;
```
  - Cross-check these against the member and CRM modules' own audit logs.

**Rollout additions**
- After deploy, as OWNER: create, toggle and delete a shop rule on `/app/settings/automation`.
- As a STAFF member without the key (QC tenant):
  - create shows the Thai error
  - toggle/delete change nothing
  - member journeys and tier rules are untouched
- Rollback: same as Item 1. There is no migration.

- R7 Item 2 reviewed: SHIP; A1 payment-profile hole reported.

## Item 3 — payment profile gate + sweep + inbound cap (0013b8ae, ca5a28be)

VERDICT: **SHIP**.
- 3a: QC3 suite `qc-payment-authz-hotfix.mts` **8/8 GREEN**, run with the allowed `qc3.sh`/gate-lock command, cleaned up to 0 rows.
- 3c:
  - `qc-sanitize-hotfix.mts` on the new tip: **29/29 GREEN**. HS-G.1 at the cap = 170 ms.
  - `attack.mts` (3 027 vectors + 20 000 fuzz × 6 modes): 0 violations, positive control 63 672.
  - Judge self-test OK.

**3a payment profile**
- **The role is read on the server.** `canManagePaymentProfile(auth.active)` uses the role from `requireTenant()`; no client field is used. The audit actor is `auth.user.id`.
- **There is only one writer.** I searched `src/` for the model and the save function:
  - `PaymentProfile` is written only by `payment/service.ts savePaymentProfile`, called only from `savePaymentProfileAction`, used only by `components/payment-profile-form.tsx`, which appears only on `/app/settings/payment`.
  - No REST op, no `/api/mobile` route, no AI tool, no seed, no onboarding/DNA step writes it.
  - The DNA `ACCOUNT_SETTINGS` step writes the account system's settings, not PaymentProfile.
- **Other money destinations are already guarded.** Account-module payment channels (`FinanceAccount.promptpayId`) are written by `account/finance/actions.ts`, which requires `account.finance.manage`, and by REST `finance-write.ts`, which requires an API-key scope.
- **Nothing legitimate breaks.** No cashier, onboarding or POS-setup flow saves the profile. Only STAFF lose the ability to save it, which is the intended fix.
- **The full PromptPay ID does not leak.**
  - The audit row stores only the last 4 digits.
  - The validation error does not repeat the number.
  - `writeAudit` swallows its own errors, so a failed audit write cannot fail the save. The service does no logging.
  - The settings page still shows the current full ID to every member. It is printed on POS QR codes anyway — NOTE.
- **NOTE: branch managers.** MANAGER passes even when its `unitAccess` covers a single branch. A branch manager can therefore redirect payments for the whole shop.
  - Precedent: domain actions are OWNER-only.
  - Suggest an owner ruling: OWNER-only, or MANAGER only with `unitAccess` `["*"]`. This is a follow-up, not a gate for the hotfix.
- **Agree with leaving `uploadLogoAction` and `loadMoreTxnsAction` ungated.**
  - `uploadLogoAction` only uploads a file and sets nothing.
  - The page already shows the first rows of the credit ledger to every member.

**3b sweep**
- I spot-checked 8 rows by reading the service code:
  - `confirmProposal` → `executeProposal` calls `assertCan(m, access)` (proposals.ts:406): OK.
  - `saveBoardAsTemplate` → `assertBoardRole(ADMIN)`: OK.
  - `saveCrmEmailUserSetting` → `crm.email.send` for your own row, `crm.email.settings` for other people's: OK.
  - `cancelMyRequest` → requester check: OK.
  - `dna applyStepAction`/`applyAction` → `applyBlueprint(tenantId, id)` with no check: MED confirmed. It creates systems and units, and its ACCOUNT_SETTINGS step only writes the new system. Not HIGH.
  - `rejectPlanAction`: LOW.
  - `dismissAnnouncement`: LOW.
  - support actions: LOW (any member reads the shop's support cases).
- None of the MED/LOW rows should be HIGH.
- **The sweep missed `src/app/api/**` route handlers.** I swept all 100 of them separately; they are guarded only by `requireMobile` (bearer token + accepted membership):
  - **M1 HIGH — `api/mobile/chat/send/route.ts:6`.**
    - Path: `sendMobileChat` → `ai/service.sendMessage({tenantId})`.
    - It has no `ai.chat.send` check. The web version has it (`ai/actions.ts:225 assertAiCan`).
    - The AI's read tools run with no module or visibility check:
      - `customer_search` (tools.ts:192): name + phone
      - `recent_leads` (tools.ts:1860): CRM phones, without the `contactWhere` visibility filter
      - `financial_summary` (tools.ts:1808)
      - points, sales, leave and chat tools
    - Result: any STAFF member can pull customer PII and the shop's finances, and spends the shop's AI credit doing it. Writes still go through proposals, which check `assertCan` on confirm.
  - **M2 HIGH/MED — AI conversations.** `api/mobile/conversations/route.ts:5`, `[id]/messages/route.ts:5`, and `[id]/route.ts:6` (PATCH) / `:22` (DELETE) let any member read, rename or delete the shop's AI conversations (shared across the shop). The web version requires `ai.chat.send`.
  - **M3 MED.** The `remember_fact` tool (tools.ts:2130), reached through M1, writes to the shop's AI memory immediately, without a proposal step.
  - **M4 LOW.**
    - `mobile/proposals/reject` and `mobile/plans/reject`: any member can reject any pending AI proposal or plan.
    - `mobile/chat/welcome`: reveals the onboarding checklist and DNA summary.
    - `mobile/usage`: reveals the AI wallet balance to any member.
    - `mobile/push/register:6`: upserts on the Expo token alone, so a token can be re-bound to another user.
    - `mobile/dna/answers:7` + `mobile/dna/apply:5`: the known MED.
  - Fix: one `assertCan({module:"ai", action:"ai.chat.send"})` on the mobile AI routes, using `g.membership`, matching web. Later, pass the caller's membership into `runTool`.
  - Checked and gated:
    - mobile CRM: all `mobile/crm/*` routes
    - mobile member: scan, search, summary, stamp
    - AI confirms: `proposals/confirm`, `plans/confirm`
    - `account-files`, `files`, `realtime/*`, `calendar/month`
    - excluded: v1 API-key routes, and cron/webhook routes that check a secret or signature

**3c inbound cap**
- **Truncation is safe.** I judged all **585 201 prefixes** of the vector corpus + 3 000 fuzz inputs through the inbound mode with the cap applied (`truncation.mts`): **0 XSS**.
  - A cut inside a tag leaves a `<` with no `>` after it, so the rest becomes escaped text.
  - A cut inside an entity leaves literal text.
  - A cut after an unclosed `<style>`/`<script>` drops everything to the end, which is the existing rule.
- Worst case at the cap: `sanitizeHtml` + `htmlToText` take ≤ 197 ms, down from ≈ 3 s at 8 MB.
- Side effects:
  - A cut through an emoji leaves half a character (lone high surrogate) at the end. UTF-8 encoders write U+FFFD; nothing throws.
  - `bodyText` comes from the uncapped `payload.text` when present, so text and HTML can differ in length. That only affects display, and `payload.text` was never capped.
- **HS-G.1 is meaningful but slightly vacuous.** It checks statically that both calls use the capped variable and that no raw call is left, and it times the cap.
  - But `src === ""` (file missing) passes. On a branch where the file moved, the check would pass silently. NOTE for the CRM forward-port: make a missing file fail.

**Rollout delta**
- Right after deploy:
  - As OWNER, save the PromptPay ID on `/app/settings/payment`. Check the QR on the POS register, and that the AuditLog `payment.profile.update` row shows `******1234`.
  - As a STAFF member (QC tenant), saving must show the Thai error.
  - Send a CRM inbound test mail, normal size: it is stored and rendered as before.
- Next hotfix: M1/M2 (mobile AI `ai.chat.send` gate), the DNA apply MED, the payment MANAGER-scope ruling.
- Rollback: unchanged. There is no migration, and the new audit rows are harmless.

- R8 Item 3 reviewed: SHIP; M1/M2 mobile AI found (HIGH, separate).

## Item 4 — mobile AI routes + DNA apply (7089364c)

VERDICT: **SHIP**.
- Suites on 7089364c:
  - sanitize oracle 29/29
  - automation 12/12 (QC3)
  - payment 8/8 (QC3)
  - mobile 12/12 (QC3; real route handlers, positive controls, cleanup to 0)
- No typecheck run (not requested).

**(1) Same decision as web — no drift**
- `mobileDenied` calls `rbac.evaluate`, the same function the web's `assertCan` uses. It builds the membership context the same way as `assertAiCan` and `chat/guard membershipOf`.
- The permission names match:
  - `{ai, ai.chat.send}` = `ai/actions.ts assertAiCan(auth, "ai.chat.send")`
  - `{systems, systems.system.create}` = `actions/systems.ts:49`
- Branch scope: no unitId is passed, so OWNER and MANAGER pass and STAFF need the key or `<module>.*`. Same as web.
- **Mobile routes with the guard (8 handlers):** chat/send, conversations GET/POST, `[id]` PATCH/DELETE, `[id]/messages`, `[id]/read`, dna/apply.
- **Mobile routes without the guard, and why that is right:**
  - Logged-out by design: auth/* (otp, verify, google, apple, exchange, logout), webview-exchange.
  - Caller's own data: webview-session, me, tenants GET.
  - tenants POST: self-signup creates the caller's own new shop.
  - dna/questions: static list.
  - proposals/confirm, plans/confirm: per-kind `assertCan` with the confirming member (verified in Item 3).
  - member/*: `assertCan` / `canReadMember` in the route.
  - crm/*: I opened 5 routes:
    - `call-log` → `calls.logCall`, which runs the module's `enter(ctx, actor)` access check.
    - `deals` → `myDeals`: only the caller's own deals, inside `dealWhere` (= `visibleWhere`, STAFF default own).
    - `deals/[id]` → `dealDetail`: inside `dealWhere`.
    - `scan-card` → `scanBusinessCard` requires `crm.contact.create`.
    - `tasks/[id]/complete` → `activities.completeActivity`, which runs `enter(ctx, actor)` (activities.ts:198).
    - Shared wrapper: `runMobileCrm` builds the actor from the member and applies rate limits. All OK.
  - **Remaining LOW follow-ups** (still only "member of the shop"):
    - dna/answers
    - chat/welcome
    - proposals GET (lists a room's pending proposals; web needs `ai.chat.send`)
    - proposals/reject, plans/reject
    - usage
    - push/register (the Expo token can be re-bound to another user)

**(2) Does the released mobile app break? No.**
- It shows an error message; it does not crash or go blank.
  - All calls go through `apps/mobile/src/api/client.ts`. On any non-2xx it throws `ApiError(status, body.error)`.
  - **Sessions list** (`app/(app)/sessions.tsx:52-137`): list, create, rename and delete each catch the error and `setError(apiErrorText(e))`, which shows "ไม่มีสิทธิ์เข้าถึงกิจการนี้" ("no access to this business"). The wording is misleading (it suggests losing the whole shop), but the screen keeps working. `[id]/read` failures are ignored with `.catch(() => {})`.
  - **Chat screen** (`chat/[id].tsx`): message loading shows the same error. `sendChat` turns any non-ok response into `ApiError(…, "chat_failed")`, shown as a red bubble with a retry button (lines 139-160). Loading proposals fails silently.
- 403 never triggers sign-out; the app signs out only on the web-session-ended message (`index.tsx:124`).
- The app's home screen is the web app in a WebView, so everything else keeps working.
- ⇒ **Safe to ship the server fix before an app update.** Follow-up: in the app, map 403 on AI screens to "ask the owner for the AI-assistant permission".

**(3) DNA apply**
- OWNER passes `evaluate` immediately, and MANAGER passes too (no unitId). The brand-new-shop web flow (`/app/dna/blueprint` → `DnaApplyButton` → `applyStepAction`) runs as the shop's creator, who is OWNER.
- Only an un-keyed STAFF member is denied. On web the thrown ForbiddenError lands in the button's generic catch and shows the misleading "connection dropped, press continue". Mobile `dna.tsx` shows `apiErrorText`. NOTE: UX for STAFF only.
- **No automated or seed caller** of the actions or the route.
- **NOTE `marketplace/service.ts:156`.** Template install calls `applyBlueprint` directly. It is gated by `marketplace.template.install` (`assertMarketplaceCan`), not `systems.system.create`. A STAFF member with only the marketplace key can still create systems through a template. Follow-up: align the two.

**(4) "The web has no door to list/rename/delete AI conversations" — verified.**
- Outside `api/mobile` and `lib/mobile/conversations.ts`, the only writes to `aiConversation` are internal:
  - `ai/service.ts:303` bumps `updatedAt` while sending.
  - `platform/support.ts:98` is a support hand-off.
- `listConversations` in `modules/chat` is the customer chat inbox, a different model. So `ai.chat.send` as the minimum check is the right choice.

## Release verdict (items 1–4)

**SHIP `hotfix/sanitize-2026-10-01` at 7089364c (+ review commits).**
- No blocker. Every item was fuzzed or tested.
- All four hotfix suites are green on the final tip: sanitize 29/29, automation 12/12, payment 8/8, mobile 12/12 (QC3; real route handlers, positive controls, cleanup to 0).
- No migration, no data rewrite.

### Pre-deploy
1. On the QC DB, run the suites already re-run above, plus the QC list in the hotfix note (kanban k1.6/k3.x, member m1.7/m3.10/m3.11/public, crm c2.5, visual-kanban).
2. Run the pure checks: `pnpm exec tsx scripts/pending/hsan-review/judge-selftest.mts` (OK) and `attack.mts vectors fuzz` (0 violations).
3. Run `pnpm typecheck` (builder) and fitness (pre-commit).
4. Deploy from this branch only, never from a dirty main folder (lesson from siamdive2). Use the Vercel deploy path the owner approves.

### Post-deploy smoke (in the first 30 minutes)
- **Item 1:**
  - Open 2–3 real public `/m/<slug>/join` pages that have a policy; check it renders.
  - Open kanban cards with bold/list/link descriptions (including `?a=1&b=2`).
  - Send a QC mail-to-board containing `<svg/onload=alert(1)>` and `<details/open/ontoggle=alert(1)>x`: expect plain text and no alert.
  - Open a CRM inbound thread and toggle "show images". Send a normal inbound mail and check it is stored and rendered.
- **Item 2:**
  - OWNER: create, toggle and delete a shop rule on `/app/settings/automation`.
  - Un-keyed STAFF (QC tenant): create shows the Thai error; toggle and delete do nothing; member journeys and tiers are untouched.
- **Item 3:**
  - OWNER: save the PromptPay ID, check the POS register QR, and check the AuditLog `payment.profile.update` row shows `******1234`.
  - STAFF: saving shows the Thai error.
- **Item 4:**
  - Mobile app as OWNER: AI chat send, the sessions list, rename, delete.
  - As STAFF without `ai.chat.send`: an error message, no crash.
  - Web `/app/dna/blueprint` "apply" as OWNER.
- Watch Vercel errors and durations for `/api/email/inbound`, `/m/*/join`, `/api/mobile/chat/send`, `/api/mobile/conversations*`, and the kanban card server actions.

### Stored-data / forensic queries (read-only, run at business hours with the built-in timeouts)
- **Item 1:** `scripts/pending/hsan-review/finder.sql`.
  - Triage the `hit` column by tenant and author.
  - These rows are now neutralised at render, but REST still returns them raw.
  - Any cleanup is a separate write that needs owner approval.
- **Item 2:** two queries in the Item 2 section:
  - non-KANBAN rules with `enabled = false`, newest first
  - run history (`AutomationRun`) pointing at rules that no longer exist
- **Item 3:** recently changed payment profiles (no history existed before the fix). Ask each shop owner to confirm their current ID:
```sql
BEGIN READ ONLY; SET LOCAL statement_timeout='30s';
SELECT "tenantId", "updatedAt", right("promptpayId", 4) AS last4 FROM "PaymentProfile" WHERE "updatedAt" > "createdAt" ORDER BY "updatedAt" DESC LIMIT 200;
ROLLBACK;
```
- **Item 4:** no historical trace of mobile AI use by STAFF beyond `AiMessage` rows. Those have no per-user author.

### Who loses access (count queries)
- **Item 1:** nobody. Cards created through REST/AI with `<img>`/`<table>`/`<h3>` lose that markup at render.
- **Item 2:** STAFF without `automation.rule.create` / `automation.*` lose create/toggle/delete on `/app/settings/automation`. Query in the Item 2 section.
- **Item 3:** every STAFF member loses saving the payment profile; no permission key exists to delegate it.
```sql
SELECT count(*), count(DISTINCT "tenantId") FROM "Membership" WHERE role = 'STAFF' AND "acceptedAt" IS NOT NULL;
```
- **Item 4:**
  - STAFF without `ai.chat.send` / `ai.*` lose mobile AI chat and conversations (they never had them on web).
  - STAFF without `systems.system.create` / `systems.*` lose DNA apply on web and app.
  - Count query: the builder's, in the hotfix note under Item 4. It is read-only with a timeout; I reviewed it and it is correct.
- OWNER and MANAGER lose nothing in any item.

### Rollback
- Vercel instant rollback to the previous production deployment (04d2ade9). No migration; the new AuditLog rows are harmless.
- Rolling back re-opens the following, so prefer fixing forward:
  - stored XSS payloads become live again
  - the cubic ReDoS returns
  - all three authz holes reopen

### Follow-ups for the next card
1. **S3:** sanitise the JSON reads:
   - kanban `cardRow` (serialize.ts:86)
   - card/board template DTOs
   - member `listPolicyVersions` / `publishPolicyVersion`
   - stop the entity decode in `descriptionToText`
2. Sanitise kanban descriptions when they are written (`service.createCard`/`updateCard`/`updateCardTemplate`/AI proposals/inbox note/chat-to-card). Portal requests should go through `renderDescription`.
3. **M3:** the AI `remember_fact` tool writes shop AI memory without confirmation. Pass the caller's membership into `runTool` so the AI's read tools apply per-permission and visibility checks (`customer_search`, `recent_leads`, `financial_summary`).
4. Remaining LOW mobile routes: dna/answers, chat/welcome, proposals GET, proposals/plans reject, usage, push/register re-bind.
5. Remaining LOW web actions from Item 3b (support cases, AI plan reject, announcements, DNA answers/propose, `listMyInvoices`).
6. Payment profile:
   - owner ruling on branch-scoped MANAGER (OWNER-only like domain, or MANAGER with `unitAccess` `["*"]`)
   - a delegable registry permission (`payment.profile.update`)
   - hide the form for users who cannot save
7. Automation:
   - `boardId: null` filter so board rules need board ADMIN
   - hide the buttons when the user lacks `mayManage`
   - private-address (SSRF) guard on WEBHOOK URLs
   - don't show webhook URLs to every member
8. Marketplace template install should also require `systems.system.create`.
9. Mobile app: show "ask the owner for permission" on 403 from AI and DNA screens (it currently says "no access to this business"). Web `DnaApplyButton` should show Forbidden instead of "connection dropped".
10. Links: `rel="noopener noreferrer nofollow ugc"`; consider `target` for kanban links. `linkSchemeOk` should not strip inner spaces (N1).
11. CSP (nonce-based) as defence in depth. Needs its own audit.
12. Forward-port to `session/crm`: sanitize files wholesale, plus the two render hunks, the 1 MB cap (make HS-G.1 fail when the file is missing), and Items 2–4 by cherry-pick. Run all four suites there.

- R9 Item 4 reviewed: SHIP; release verdict written.

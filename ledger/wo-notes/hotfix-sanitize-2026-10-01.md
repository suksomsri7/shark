# HOTFIX sanitize 2026-10-01 — default-deny HTML sanitizers (attribute-separator XSS bypass + ReDoS)

Base: origin/main 04d2ade9 (= prod). Worktree /root/projects/shark-crm-hsan. Pushed to `hotfix/sanitize-2026-10-01` (never main).
Source items: `/root/projects/shark-crm/ledger/wo-notes/crm-C5.5-hunt-2a.md` H55-2a-3, 2a-4, 2a-9.

## Checkpoints
- 1 facts re-verified on base (below).
- 2 oracle `scripts/qc-sanitize-hotfix.mts` written; RED on untouched tree.
- 3 engine + both sanitizers rewritten; render-side re-sanitise (join.ts, cards.ts); oracle GREEN 28/28 ×3 runs (box load 4–6).
- 4 typecheck 0 errors · fitness 33/33 · committed + pushed (see git log of the branch).

## Facts re-verified on this base (tsx, in-process)
- core `sanitizeHtml` + kanban `sanitizeDescription`: `<svg/onload=alert(1)>` → unchanged · `<details/open/ontoggle=alert(1)>x</details>` → `<details/open/ontoggle=alert(1)>x` · `<a/href="javascript:alert(1)">x</a>` → unchanged · `<img/src=x/onerror=…>` → "" (VOID list `\b`).
- ReDoS `"<a"+" ".repeat(n)+"x"` core/kanban ms: 200 → 2.6/3.2 · 400 → 20.7/21.3 · 800 → 160/184 · 1600 → 1498/1417 (≈ n³). Kanban mail-to-board caps HTML at 20 000 chars ⇒ ≈ 45 min CPU per mail; CRM inbound has no cap (10 MB route limit).
- Extra bypass: tag names with `-`/`:` (`<x-y onclick=…>`, custom elements) fail TAG_RE ⇒ passed verbatim. Comments/doctype passed verbatim.
- Extra finding: kanban card description is written RAW (no sanitizer at all, old or new) by REST `POST /kanban/boards/:id/cards` (`api/ops/cards.ts` → `service.createCard`; op doc claims "HTML is sanitised"), `service.updateCard`, AI proposals (`lib/ai/proposals.ts` → `kanbanSvc.createCard`, `p.detail`), card templates (`card-templates.ts updateCardTemplate` → `createCardFromTemplate`). ⇒ write-side sanitising cannot protect CardBack; fixed at render (below).

## Callers of the sanitizers (all of src/)
| caller | function | input | stored? | rendered where |
|---|---|---|---|---|
| member/privacy.ts:522 createPolicyVersion | core sanitizeHtml | staff/API (privacy perm) | MemberPrivacyPolicy.bodyHtml | JoinFlow innerHTML (public `/m/<slug>/join`) |
| kanban/cards.ts:440 updateCardFields | sanitizeDescription | staff (CardBack sends renderDescription HTML), REST PATCH | KanbanCard.description | CardBack innerHTML |
| kanban/links.ts:289 createCardFromExternal | sanitizeDescription | portal requests (crm/portal.ts:916 — customer contacts), mail-to-board, form/member bridges | KanbanCard.description | CardBack innerHTML |
| platform/kanban-email-in.ts:170 | sanitizeDescription(html) / renderDescription(text) | unauthenticated mail to `งาน+<key>@` | via links.ts | CardBack innerHTML |
| components/kanban/CardBack.tsx:350 | renderDescription | staff textarea (escape-first) | via updateCardFields | CardBack |
| crm/emails.ts:1825 ingestInbound | core sanitizeHtml(allowImages) + htmlToText | unauthenticated mail to `crm+<key>@` | CrmEmailMessage.bodyHtml/bodyText | EmailThread `<iframe sandbox="" srcDoc>` |
| crm/emails.ts:700, 1127 composer/send | core sanitizeHtml(mailto/tel) | staff | CrmEmailMessage.bodyHtml, outgoing mail | sandboxed iframe; recipients' mail clients |
| crm/emails.ts:579 signature · 926/1216 htmlToText | core | staff | CrmEmailUserSetting.signatureHtml | text/srcDoc only |
| crm/emails-shared.ts:213 renderInboundHtml · :218 emailSnippet | core | stored mail | — | srcDoc sandbox · React text |

## Every `dangerouslySetInnerHTML` in src/
| sink | fed by | verdict |
|---|---|---|
| components/member/JoinFlow.tsx:549 | `joinForm().policyHtml` ← MemberPrivacyPolicy.bodyHtml | **EXPLOITABLE on prod**: any shop owner/staff with privacy permission (self-signup) or member API key stores `<details/open/ontoggle=…>`; runs on the platform origin for every visitor (other tenants' staff, platform admins). Fixed: new sanitizer + re-sanitise at render (join.ts). |
| components/kanban/CardBack.tsx:1032 | `getCardDetail().description` ← KanbanCard.description | **EXPLOITABLE on prod**: unauthenticated via mail-to-board (board with cardFromEmail on), external customers via CRM portal requests (shops with portal + issue board), any kanban API key/AI tool via raw REST create (even `<img onerror>`), board ADMIN via card templates, same-shop staff via updateCardFields. Fixed: new sanitizer + re-sanitise at read (cards.ts getCardDetail). |
| components/crm/tracking/TrackingSettingsForm.tsx:374 | `linkQrSvg` (QR lib output of `${appUrl}/l/<code>`, `isBareSvg` gate) | not sanitizer-fed; no user text. |
| components/kanban/KanbanIcon.tsx:90 · member/MemberIcon.tsx:102 · account-v2/AccountIcon.tsx:101 | static `ICONS` map | constant. |
| components/app-shell/ThemeRoot.tsx:96 | `cssBlock(tokens)` via `safeCss()` | not sanitizer-fed (CSS values; out of scope). |
| CRM mail view (srcDoc, not innerHTML) | renderInboundHtml (re-sanitises at render) | sandbox="" ⇒ not XSS; was ReDoS (unauthenticated CPU DoS). |

## Design
- New `src/lib/core/html-allowlist.ts` (pure): one left-to-right scan that BUILDS the output from tokens. Every `<` in the output is a canonical tag written by the policy callback (`<p>`, `</p>`, `<a href="…" rel=…>`, `<img src=… …>`); text between tags has every `<` → `&lt;`; comments / `<!…>` / `<?…>` / `</ x>` dropped (to EOF if unterminated — browser hides them too). Tag boundary = first `>` (same as legacy ⇒ byte-identical output for normal HTML); tag name = up to whitespace or `/`; attributes parsed with `/` and whitespace as separators (browser rule), first duplicate wins, values decoded once (`decodeAttr`) and re-escaped (`escapeAttr` & " < > ').
- Linear: no regex with quantifiers over the input; strip-with-content closer search cached per tag; `-->`/`--!>` search cached; `<` without any later `>` ⇒ rest is text; `<` escape via split/join; decode/escape single-pass loops (the V8 global `replace` showed a ~10× memory-tier step at 0.5–1 MB).
- `core/sanitize.ts` and `kanban/sanitize.ts` keep exported names, signatures, options, allowlists, link rules (core `linkSchemeOk` unchanged; kanban `^https?://`), strip-with-content set, unclosed rule (core: drop to EOF; kanban: drop opener only), `<br>`/`<hr>`, `rel`/`target`, `allowImages` img attrs (width/height quoted = all digits, unquoted = leading digits — legacy rule), `.trim()`.
- Shared engine is allowed by F2 (modules → core). Kanban now imports `@/lib/core/html-allowlist` (pure — also fine for the client bundle via CardBack).
- Render-side: `member/join.ts joinForm` returns `sanitizeHtml(bodyHtml) || null`; `kanban/cards.ts getCardDetail` returns `sanitizeDescription(description)`. Both idempotent ⇒ rows already clean render byte-identical.
- No CSP added (see follow-ups).

## RED → GREEN (oracle `pnpm exec tsx scripts/qc-sanitize-hotfix.mts`, 401 vectors × 4 modes)
- RED on base (final oracle, pristine worktree of 04d2ade9): 6/28 — A 125/125/125/132 violations per mode · B idempotence 4/4/4/6 · C 42 · E 9 · F missing · D: sanitizeDescription 9, sanitizeHtml 8, allowImages 7, htmlToText 12 violations (`<a`+1 024 spaces = 367–544 ms; htmlToText worst 3.9 s).
- GREEN after: 28/28 on three consecutive runs; worst per call at ≤ 1 MB: sanitizeDescription 65–131 ms, sanitizeHtml 62–156 ms, allowImages 66–98 ms (box load 4–8 on 4 CPUs); htmlToText ≤ 292 ms, renderDescription ≤ 378 ms (these two keep their own chained `replace` post-processing; checked with a ReDoS-only bound < 1 000 ms).

## Benign differences (all pinned in oracle section C; every other benign sample = legacy byte-for-byte, incl. the qc-crm-c2.5 S9.10 baseline fixtures and the K1.6 fixture)
1. Raw `<` in text that is not a tag → `&lt;` (`x<5` → `x&lt;5`; renders the same).
2. Comments, `<!DOCTYPE>`, `<![CDATA[`, `<?…?>` dropped (were kept verbatim; invisible either way). Inbound mails lose the doctype in the sandboxed viewer (quirks mode in that iframe — cosmetic).
3. Tags whose name has `-`/`:` (`<o:p>`, `<x-foo>`) dropped like other unknown tags (were kept verbatim).
4. Unterminated tag at the end (`… <b`) → escaped text.
5. `</` + non-letter (`a </ b`) → dropped to the next `>` / EOF (browser hides it too).
6. Entities in href/src/alt decoded once: `href="…?a=1&amp;b=2"` stays `&amp;` (legacy produced `&amp;amp;` = broken link and non-idempotent). Also fixes links written by CardBack's markdown-lite (`https://x?a=1&b=2`). Already-stored `&amp;amp;` rows stay as stored (decode once + escape once).
7. `'` `<` `>` inside attribute values escaped (`&#39;` …).
8. `href`/`src` taken from the real attribute, not the first `href=` substring (`data-href=` no longer counts).

## Stored data
- MemberPrivacyPolicy.bodyHtml: sanitised at WRITE only (privacy.ts:522) ⇒ old-sanitiser rows may hold live payloads ⇒ now re-sanitised at RENDER (join.ts). PrivacySettings shows it in a textarea (text).
- KanbanCard.description: sanitised at write on some paths, RAW on others (REST create, AI, templates) ⇒ now re-sanitised at READ in getCardDetail (only innerHTML sink). REST `GET` card / `descriptionToText` consumers still get the stored value (API consumers render at their own risk — follow-up).
- KanbanCardTemplate.description: raw at write; only reaches HTML through cards created from it ⇒ covered by getCardDetail.
- CrmEmailMessage/CrmEmailTemplate/CrmEmailUserSetting HTML: rendered only via renderInboundHtml (re-sanitises at render) into sandbox="" iframe ⇒ not XSS; REST thread read returns stored bodyHtml raw (follow-up).
- Read-only finder for the owner: **use `scripts/pending/hsan-review/finder.sql`** (reviewer version, review S1 — replaces the query that was here: `BEGIN READ ONLY` + `statement_timeout`, LIMIT 500/2000/500, a `hit` column with the matched fragment, obfuscated `javascript:` shapes covered — 0 misses vs 37/27/447 for the old pattern; the CrmEmailMessage part is separate, off-peak, 90-day window). Matches are suspicious, not proof (`<br/>`, `<o:p>`, "data:" in prose).

## What the controller must run on a QC DB (not run here — need DB)
qc-kanban-k1.6 (S1 sanitize fixture — byte-identical in oracle C) · qc-kanban-k3.1 · qc-kanban-k3.3 · qc-kanban-k3.7 (getCardDetail) · qc-kanban-k3.9 (mail-to-board) · qc-kanban-k2.6 · qc-kanban-k2.7 · qc-kanban-k1.12 · qc-kanban-k3.5 · qc-member-m1.7 (policy) · qc-member-m3.11 (joinForm) · qc-member-m3.10 · qc-member-public · qc-crm-c2.5 (S9.10 baseline — the 3 fixtures are byte-identical in oracle C; X6.3/X6.4/S9.3) · visual-kanban.mts (card back render). Pure, run here: qc-sanitize-hotfix (GREEN), typecheck (0), fitness 33/33.

## Forward-port to the CRM branch (session/crm, sanitize differs by C5.4-E)
- CRM's `core/sanitize.ts` = this base + `decodeAttr` + 5-char `escapeAttr` + href via `attrValue` (decode-once). The engine's `decodeAttr`/`escapeAttr` are behaviour-identical (oracle F: 20 000-string differential fuzz vs the C5.4-E regex versions) ⇒ take this hotfix's `core/sanitize.ts` wholesale (drop CRM's local decodeAttr/escapeAttr/attrValue; `allowImages`/`allowLinkSchemes` already here). `kanban/sanitize.ts` is identical on both branches ⇒ take the hotfix version. Add `core/html-allowlist.ts`. Re-apply the two render hunks (join.ts joinForm, cards.ts getCardDetail) by hand if context moved.
- Run on the CRM branch: this oracle + qc-crm-c5.4 (decode-once / idempotence checks) + the list above. CRM-only new callers of sanitizeHtml inherit the fix.

## Follow-ups (not in this hotfix)
- CSP (`script-src 'self'` + nonce, no inline handlers): would break Next inline bootstrap scripts unless nonce-wired in middleware, ThemeRoot inline `<style>` (needs `style-src 'unsafe-inline'` or nonce), any inline `on*` / `javascript:` usage, third-party widgets (LINE LIFF SDK, Resend/Bunny assets, analytics). Needs its own audit.
- Inbound size caps before sanitising (CRM inbound 10 MB → e.g. 256 KB HTML; kanban already 20 000).
- Sanitize at write in `service.createCard`/`updateCard`/`updateCardTemplate`/AI proposals (REST op docs claim it); REST card/thread reads return stored HTML raw.
- Portal requests → use `renderDescription` (text) instead of `sanitizeDescription` (2a-9).
- `htmlToText`/`renderDescription`/`descriptionToText` use chained global regex replaces (linear, but V8 memory-tier step); fine at current caps.

## Item 2 — automation page authz (separate commit on top of the sanitizer commit)
Hole (verified on 04d2ade9): `/app/settings/automation` actions `toggleRuleAction`/`deleteRuleAction` (`src/lib/automation/actions.ts`) only `requireTenant()` → `service.setRuleEnabled`/`deleteRule` did `automationRule.update/delete({ where: { id } })` (tenant-injected, no scope) ⇒ any staff member of a shop (no permission keys) could switch off/on or delete ANY rule of the tenant by posting an id: member journeys (MEMBER_JOURNEY), tier rules (MEMBER_TIER), CRM rules, board rules. `createRuleAction` also had no permission check.

Fix:
- service: `setRuleEnabled`/`deleteRule` → `updateMany`/`deleteMany` with `where: { id, scope: "KANBAN" }` (same set `listRules` shows); other-scope / other-tenant / unknown id = 0 rows, no throw (no existence oracle). Return type now `Promise<number>` (only caller = the actions, which ignore it).
- gate: new pure `canManageShopAutomation(m)` = `evaluate(m, { module: "automation", action: "automation.rule.create" })`. All three page actions check it before writing (create → Thai error state; toggle/delete → silent no-op).
- Gate chosen: the page itself has NO gate (only `requireTenant`; nav link shown to everyone). The house key for this exact service is `automation.rule.create` (registry `core/permissions.ts` module "automation"; already enforced by the AI proposal `automation_create_rule` → `proposals.ts:179`, which calls the same `createRule`). OWNER/MANAGER pass as before (rbac `evaluate`); STAFF need the key or `automation.*` ⇒ owners/managers and keyed staff keep everything they could do; un-keyed staff lose write access (the hole). Page view/list unchanged.

Callers of the service writers:
| caller | function | before | after |
|---|---|---|---|
| actions.ts createRuleAction | createRule | requireTenant only | + automation.rule.create (creates scope KANBAN, boardId null by default — no scope hole) |
| actions.ts toggleRuleAction | setRuleEnabled | any id of the tenant | + gate · scope KANBAN only |
| actions.ts deleteRuleAction | deleteRule | any id of the tenant | + gate · scope KANBAN only |
| lib/ai/proposals.ts:1354 (automation_create_rule) | createRule | gated by proposal permission map (automation.rule.create) | unchanged |
| app/app/settings/automation/page.tsx | listRules | scope KANBAN | unchanged |
Module doors (not this service, unchanged): kanban `modules/kanban/automation.ts` (requireRule needs boardId ≠ null + assertRuleAdmin; no scope filter — journey/tier/CRM rows have boardId null ⇒ NotFound), member `journeys.ts` loadRule (scope + memberSystemId), `tiers.ts` (scope MEMBER_TIER), crm `modules/crm/automation.ts` (scope CRM + crmSystemId).

Test: `scripts/qc-automation-authz-hotfix.mts` (QC DB, own tenants `qc-hsan-authz-*`, cleans to 0) — NOT run here (no DB). Typecheck + fitness run.

Ruling needed: scope KANBAN still includes BOARD rules (boardId ≠ null), which `listRules` shows on this page ⇒ a holder of `automation.rule.create` (or any MANAGER) can toggle/delete a board's rules here without being board ADMIN (`kanban.automation.manage`). Kept as-is ("don't change what legitimate users can do"); stricter option = also require `boardId: null` in list + writers.

Forward-port (CRM branch): `src/lib/automation/service.ts` and `actions.ts` are identical on session/crm ⇒ the commit applies cleanly. CRM's own doors (`modules/crm/automation.ts` toggleRule/deleteRule/updateRule via findFirst `scope: "CRM", crmSystemId` + crm.automation.manage) are already scoped — nothing to port there; run this suite + qc-crm automation suites on the CRM branch after the merge.

## Item 3 — payment profile authz + sweep + inbound cap + finder (review A1, S1, S2)

### 3a payment profile (commit "fix(security): shop payment profile — permission check + audit")
- Hole (review A1, verified): `src/lib/payment/actions.ts savePaymentProfileAction` only `requireTenant()`; `/app/settings/payment` page ungated ⇒ any STAFF (zero keys) could replace the shop's PromptPay ID ⇒ customer QR payments redirected.
- Gate chosen: **OWNER + MANAGER** (`payment/service.ts canManagePaymentProfile`). The permission registry has no key for the shop-level payment profile (`account.finance.manage` etc. are per-account-system keys of the account module, not this tenant table). Registry header: "MANAGER → passes everything" for tenant-level checks (webhook/API key/branding admin keys all let MANAGER through) ⇒ MANAGER kept; STAFF can never change it (no key to delegate — add `payment.profile.update` to the registry later if owners ask). Denied → Thai error state on the form.
- Audit: `writeAudit` (core/audit.ts) `payment.profile.update`, targetType PaymentProfile, before/after `{ promptpayId: "******5678", displayName }` (last 4 digits only), actorId = user; written on create and on any change, not on an identical re-save.
- Writers of PaymentProfile in src/ and apps/: only `service.savePaymentProfile` ← only `savePaymentProfileAction` (no REST op, no `/api/mobile` route, no AI tool). Readers: settings/payment page, POS register page (`sys/[id]/pos/register/page.tsx:53`), `lib/actions/pos.ts:320`, restaurant storefront (`modules/restaurant/storefront.ts:158`), shop/ticket/school services via their own reads, account payment-request fallback.
- Other exported action in the file: `listMyInvoicesAction` (reader — the shop's platform bills to any member; LOW, listed in 3b).
- Decided NOT to gate: `storage/actions.ts uploadLogoAction` (upload-only, sets nothing; used by `image-asset-field` in account settings — gating would break keyed staff there; size/type-limited by `uploadFile`; LOW) and `ai/credit-actions.ts loadMoreTxnsAction` (the ungated `/app/settings/credit` page already shows the first 20 ledger rows to every member — gating "more" alone changes nothing; AI-credit ledger, not shop money; LOW).
- Test: `scripts/qc-payment-authz-hotfix.mts` — run on QC3 by the builder (allowed command): **8/8 GREEN**, cleans to 0 (own tenant `qc-hsan-pay-*`). RED on base by construction (gate/mask functions absent, no audit row).

### 3b sweep — `"use server"` actions under `src/lib/**/actions.ts`, `src/lib/**/*-actions.ts`, `src/lib/actions/*.ts`, `src/app/app/settings/**` whose only check is `requireTenant()`
Method: script over every exported action; an action counts as gated if its body (or a local helper it calls) has `assert*(`/`require<X≠Tenant>(`/`evaluate(`/`can*(`/role/permissions; actions that hand an actor to a module service were assumed checked inside (spot-checked: kanban templates, crm email user setting, approval cancel, AI confirm). 29 rows left; triaged by reading the service.
| file:line | action | writes / reveals | risk |
|---|---|---|---|
| (fixed) payment/actions.ts:17 | savePaymentProfileAction | shop PromptPay ID | HIGH → fixed 3a |
| (fixed) automation/actions.ts | create/toggle/deleteRule | rules of all scopes | HIGH → fixed item 2 |
| dna/actions.ts:85 | applyStepAction | creates systems/units from a blueprint (no `systems.system.create`) | MED |
| dna/actions.ts:91 | applyAction (also `/api/mobile/dna/apply`) | same, all steps | MED |
| dna/actions.ts:24 | answerQuestion | overwrites shop DNA facts (AI context) | LOW |
| dna/actions.ts:78 | proposeAction | creates a blueprint row | LOW |
| ai/actions.ts:207 | rejectPlanAction | cancels any pending AI plan of the shop | LOW |
| ai/credit-actions.ts:44 | loadMoreTxnsAction | AI credit ledger (page shows it anyway) | LOW |
| announce/actions.ts:11 | dismissAnnouncementAction | dismisses a platform announcement for the whole shop | LOW |
| coupon/actions.ts:98 | testValidateAction | read: coupon validity/discount | LOW |
| payment/actions.ts:52 | listMyInvoicesAction | read: shop's platform invoices | LOW |
| storage/actions.ts:8 | uploadLogoAction | uploads LOGO-kind files (storage) | LOW |
| storage/actions.ts:36 | fetchImageForEditingAction | fetch from own CDN host only (SSRF-guarded) | LOW |
| support/actions.ts:55,69,75,88,95,112,142 | loadMyCases · unreadCaseTotal · loadCaseThread · markCaseRead · openCase · addMessage · loadNavBadges | shop↔platform support cases: any member reads/writes all of the shop's cases | LOW (7) |
| ai/actions.ts:143,178 · automation/actions.ts:111 · approval/actions.ts:196 · crm/emails-actions.ts:155 · kanban/actions.ts:1223,1246,1560,1617 · dna/actions.ts:46 · storage/actions.ts:67 | confirmProposal/confirmPlan (per-kind check inside) · markRead (per-user) · cancelMyRequest (own) · saveCrmEmailUserSetting (own unless manager, inside) · save/deleteBoardTemplate (ADMIN/canManageTemplates inside) · prefs (per-user) · interviewEnabled/storageEnabled (flags) | OK by design (11) |
Counts: HIGH 0 open (2 fixed) · MED 2 · LOW 16 · OK 11. All listed modules are on prod (core platform; DNA wizard = onboarding; support = shop help). Limit: actions passing an actor were not deep-verified beyond the spot checks.

### 3c CRM inbound cap (review S2) — exists on this base
`crm/emails.ts ingestInbound`: `const inboundHtml = str(payload?.html).slice(0, 1_000_000)` fed to both `sanitizeHtml` and `htmlToText`. Oracle case HS-G.1 (static + worst shape at the cap 297 ms). Forward-port: same 3 lines on the CRM branch (line numbers moved: reviewer cited the CRM-branch position).

### 3d finder
The SQL in "Stored data" now points to `scripts/pending/hsan-review/finder.sql` (not duplicated).

### Forward-port (CRM branch)
`payment/actions.ts` + `payment/service.ts` are untouched on session/crm (check with `git diff origin/main session/crm -- src/lib/payment`) ⇒ cherry-pick. Run `qc-payment-authz-hotfix.mts` there too.

## Item 4 — mobile AI routes + DNA apply (review Item 3: M1, M2, DNA MED)
Fix = the same permission key as the web door, decided by the same `evaluate()` (OWNER/MANAGER pass · STAFF needs the key or `<module>.*`):
- New `src/lib/mobile/guard.ts`: `mobileDenied(g, query)` → `null` or 403 `{ error: "forbidden" }` (same shape as `mobileError` from `requireMobile`); constants `AI_CHAT` = `ai.chat.send` (web `lib/ai/actions.ts assertAiCan`, every AI door) and `SYSTEM_CREATE` = `systems.system.create` (web `lib/actions/systems.ts addSystemAction`).
- 4a `api/mobile/chat/send` POST → `ai.chat.send` (web `sendAiMessageAction`).
- 4b `api/mobile/conversations` GET/POST, `[id]` PATCH/DELETE, `[id]/messages` GET, `[id]/read` POST → `ai.chat.send`. Web model: conversations are shop-shared (`latestConversation(tenant)`), every web AI read (loadAiChat, loadPlans, listPendingProposals) needs `ai.chat.send`; web has NO list/rename/delete/markRead door ⇒ `ai.chat.send` applied as the floor there (no per-user ownership invented). `[id]/read` added although not in the review list (same family, writes lastReadAt).
- 4c `api/mobile/dna/apply` POST and web `dna/actions.ts applyStepAction` / `applyAction` → `systems.system.create` (web throws ForbiddenError like addSystemAction; mobile 403).
- Test `scripts/qc-mobile-authz-hotfix.mts` through the REAL route handlers (Bearer token from `issueMobileToken`, X-Tenant-Id), matrix OWNER/MANAGER/STAFF no key/STAFF+ai.chat.send/STAFF+systems.system.create, denied = 403 + no side effect, positive controls, own tenant, cleans to 0: **RED 3/12 before the fix → GREEN 12/12** (QC3). Re-runs after the fix: payment 8/8, automation 12/12 (QC3), sanitize oracle 29/29 · typecheck 0 · fitness 33/33.

Who loses access: STAFF members WITHOUT `ai.chat.send` (or `ai.*`) lose the AI chat + AI conversation screens in the mobile app (they never had them on the web); STAFF without `systems.system.create` lose DNA "apply blueprint" on web and app. OWNER/MANAGER unaffected. No role default grants either key: STAFF permissions are `{}` unless the owner ticks them in /app/settings/staff (no presets in `core/permissions.ts`). Count for the owner (read-only; do NOT run on prod without the owner's go):
```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout = '30s';
SELECT 'ai.chat.send' AS key, count(*) AS staff_without_key, count(DISTINCT m."tenantId") AS shops,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Session" s WHERE s."userId" = m."userId" AND s."revokedAt" IS NULL
                                       AND s."expiresAt" > now() AND s."idleExpiresAt" > now())) AS with_live_session
  FROM "Membership" m
 WHERE m.role = 'STAFF' AND m."acceptedAt" IS NOT NULL
   AND NOT (coalesce(m.permissions -> 'ai.chat.send', 'false'::jsonb) = 'true'::jsonb OR coalesce(m.permissions -> 'ai.*', 'false'::jsonb) = 'true'::jsonb)
UNION ALL
SELECT 'systems.system.create', count(*), count(DISTINCT m."tenantId"), NULL
  FROM "Membership" m
 WHERE m.role = 'STAFF' AND m."acceptedAt" IS NOT NULL
   AND NOT (coalesce(m.permissions -> 'systems.system.create', 'false'::jsonb) = 'true'::jsonb OR coalesce(m.permissions -> 'systems.*', 'false'::jsonb) = 'true'::jsonb);
ROLLBACK;
```
(`with_live_session` counts web+app sessions together — Session has no reliable app marker.)

### Sweep — every route under `src/app/api/mobile/**` (list only)
| route | does | check | risk |
|---|---|---|---|
| auth/otp · verify · google · apple · exchange · logout | login / token issue / revoke | pre-auth by design (OTP, id_token, one-time code) | — |
| webview-exchange | one-time code → web session | code (60 s, single use) | — |
| webview-session · me · tenants GET | issue webview code / own profile / own shops | token (own data) | — |
| tenants POST | create a new shop for the caller | token (by design: self-signup) | — |
| chat/send · conversations/** | AI chat + shared AI history | **ai.chat.send (this item)** | fixed |
| dna/apply | build systems from blueprint | **systems.system.create (this item)** | fixed |
| dna/answers | save DNA facts + propose blueprint | token only | LOW (follow-up) |
| dna/questions | static question list | token | — |
| chat/welcome | creates the welcome AI room/message; shows onboarding checklist + DNA summary | token only | LOW (follow-up) |
| proposals GET | pending AI proposals of a room | token only (web needs ai.chat.send) | LOW (follow-up) |
| proposals/confirm · plans/confirm | execute AI proposal/plan | inside service (per-kind check with caller membership) | OK |
| proposals/reject · plans/reject | reject any pending proposal/plan of the shop | token only | LOW (follow-up) |
| usage | AI wallet balance | token only | LOW (follow-up) |
| push/register | upsert Expo push token for the caller | token only; token can be re-bound (review) | LOW (follow-up) |
| crm/* (call-log, deals, deals/[id], scan-card + accept/reject, tasks, tasks/[id]/complete) | CRM mobile | actor → CRM service checks (`crm.*` keys; scan-card `canBusinessCard`) — not deep-verified | inside service |
| member/scan · search · stamp · summary | loyalty at the counter | `assertCan` + `canReadMember` in route | OK |

### Follow-ups (NOT in this hotfix)
- M3: `remember_fact` AI tool writes shop AI memory without a proposal/confirmation step (review M3).
- The LOW mobile routes above (dna/answers, chat/welcome, proposals GET, proposals/plans reject, usage, push/register re-bind) and the LOW web actions of Item 3b.
- Payment profile: MANAGER-scope ruling (MANAGER currently allowed) and a registry key (e.g. `payment.profile.update`) if owners want to delegate to STAFF.
- Pass the caller's membership into `runTool` so AI read tools apply per-key checks (review M1 note).

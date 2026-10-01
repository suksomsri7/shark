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
- Read-only finder for the owner (Postgres; run in a read-only transaction; matches are "suspicious", expect some `<br/` / `<o:p>` noise):
```sql
BEGIN READ ONLY;
WITH p AS (SELECT '<[a-z][^\s>/]*/|<[a-z][a-z0-9]*[-:]|<(svg|math|details|video|audio|body|iframe|object|embed|form|input|select|textarea|marquee|meta|base|link|style|script|img)[\s/>]|\son[a-z]+\s*=|javascript:|vbscript:|data:text' AS re)
SELECT 'MemberPrivacyPolicy' AS tbl, t.id, t."tenantId", t."createdAt", left(t."bodyHtml", 300) AS sample FROM "MemberPrivacyPolicy" t, p WHERE t."bodyHtml" ~* p.re
UNION ALL SELECT 'KanbanCard', t.id, t."tenantId", t."createdAt", left(t.description, 300) FROM "KanbanCard" t, p WHERE t.description ~* p.re
UNION ALL SELECT 'KanbanCardTemplate', t.id, t."tenantId", t."createdAt", left(t.description, 300) FROM "KanbanCardTemplate" t, p WHERE t.description ~* p.re
ORDER BY 1, 4 DESC;
-- informational (sandboxed viewer, but REST returns it raw):
SELECT 'CrmEmailMessage' AS tbl, id, "tenantId", "createdAt", left("bodyHtml", 300) FROM "CrmEmailMessage" WHERE "bodyHtml" ~* '<[a-z][^\s>/]*/[a-z]|\son[a-z]+\s*=|javascript:' ORDER BY "createdAt" DESC LIMIT 200;
ROLLBACK;
```
(If a column name differs on prod — e.g. no `createdAt` on a table — drop that column from the select.)

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

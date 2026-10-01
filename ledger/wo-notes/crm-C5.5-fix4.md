# crm-C5.5-fix4 — forward-port of the 2026-10-01 production security hotfix + account ciEquals ×4

Worktree `/root/projects/shark-crm-cf2` · branch `wip/crm-cf4` from 5c87acc3 (session/crm) · DB QC3 only · not pushed.
Logs `/tmp/cf4-logs/` (reg1 = full regression on the tip · r2 = R2-6 re-run + baseline at 5c87acc3 + hotfix-worktree comparison · r3 = docs + m3.11 baseline). Runners: `scripts/pending/cf4/run-regress.sh` · `run-round2.sh` · `run-round3.sh` (round 2/3 executed from a /tmp copy because they switch the tree).

## State
- [x] PART A: 10 cherry-picks (`-x`, main's order) — tip ab24ce0f
- [x] PART B: 4 account sites → ciEquals · F15 OWED emptied · probe RED 2/12 → GREEN 12/12 — commit bd9b6463
- [x] regression (QC3) + baselines at 5c87acc3 for every red suite
- [x] this note

## PART A — cherry-picks (each `git cherry-pick -x`, order = main 929c39ce)
| new | from | subject | result |
|---|---|---|---|
| 1093763c | 6513a9f7 | default-deny HTML sanitizers (core + kanban) | **conflict** `src/lib/core/sanitize.ts` |
| c43a1f9b | 4d64b0dc | platform automation page: KANBAN scope + permission | clean |
| cc3c8a8c | 25625b0d | review: sanitizer hotfix (+ `scripts/pending/hsan-review/*`) | **conflict** `ledger/wo-notes/hotfix-sanitize-2026-10-01-review.md` (add/add) |
| fbeb887f | 7e496bad | review: Item 2 | clean |
| 94f3e29a | 0013b8ae | shop payment profile: permission + audit | clean |
| 366ec3a3 | ca5a28be | cap CRM inbound HTML at 1 MB | **conflict** `src/lib/modules/crm/emails.ts` |
| 2c7460b9 | 22521104 | review: Item 3 (+ truncation.mts) | clean |
| 00a884ef | 7089364c | mobile AI routes + DNA apply permission | clean |
| a268a378 | 0b7e7285 | review: Item 4 + verdict | clean |
| ab24ce0f | 7939080f | review: controller pre-deploy record (+ run scripts) | clean |

The picked commits keep their **original commit messages and trailers** (incl. the original Co-Authored-By line) plus the `(cherry picked from commit …)` line; only this card's own commits use the card trailer.
Not picked (not security): 66b07c63 / 3677d983 (Vercel build), the design/handover commits, the merge 929c39ce.
After the picks, of the 40 files the picks touch, 38 are byte-identical to 929c39ce (`git diff 929c39ce ab24ce0f` per file); the two that differ are `core/sanitize.ts` (one added comment) and `crm/emails.ts` (session/crm's CRM v2 file with the cap re-applied — conflict 3).

### Conflicts
1. `src/lib/core/sanitize.ts` — session/crm differed from the merge base only by C5.4-E (`decodeAttr`, 5-char `escapeAttr`, href via `attrValue` = decode once). Took the hotfix file wholesale (as the hotfix note prescribes for this port): the engine `core/html-allowlist.ts` carries the same behaviour (`parseAttrs` → `decodeAttr` once, `escapeAttr` & " < > '); oracle F of `qc-sanitize-hotfix` fuzzes the engine decoder against the C5.4-E regex decoder. Added a comment at `attrValue` recording where C5.4-E E1/SF-4 now live. Proven: probe-c54e 20/20 · probe-c54e-r2 23/23 (decode-once / idempotence checks of C5.4-E) on the tip.
2. `ledger/wo-notes/hotfix-sanitize-2026-10-01-review.md` — session/crm had a 1-line file (an interim fuzz-progress line of the reviewer that leaked in with 8cf86985). The final review supersedes it (the same statement is at its L137/L144) ⇒ took theirs.
3. `src/lib/modules/crm/emails.ts` `ingestInbound` — on session/crm (C5.5-fix2) sanitising moved **after** the sender/system rate buckets and the threading lookup. Dropped the hotfix hunk at the old place and applied the cap at the new place: `const inboundHtml = str(payload?.html).slice(0, 1_000_000)` fed to both `sanitizeHtml(…, { allowImages: true, … })` and `htmlToText(inboundHtml)` (HS-G.1 regex shape kept ⇒ oracle G green). No other reader of `payload.html` exists.
- `kanban-email-in.ts` untouched ⇒ no ORACLE-EDIT of `SHA_BOARD_IN` (c2.5 105/105 incl. U.5).

### Security doors checked on session/crm-only code (by reading the code; QC coverage in brackets)
| door | finding |
|---|---|
| CRM automation rules (`crm/automation.ts` create/update/toggle/delete/list/dryRun/builder) | `enter()` = system NOT_FOUND → uiVersion 2 → `crm.automation.manage` · `loadRule` scoped `{ tenantId, scope: CRM, crmSystemId }` · enabling also `assertAuthorCanDoByHand`. The hotfix's platform toggle/delete now `updateMany/deleteMany { id, scope: KANBAN }` ⇒ cannot reach CRM rules [qc-automation-authz-hotfix 12/12] |
| other `automationRule` writers | member tiers/journeys, kanban module, CRM — all gated in their modules (unchanged by this card) |
| CRM inbound HTML entry points | only `/api/email/inbound` → `emails.ingestInbound` (board mail → kanban-email-in, already capped 20 000) — cap applied [c2.5 105/105 · HS-G.1 · truncation 585 201 prefixes → 0 XSS] |
| every `sanitizeHtml` / `sanitizeDescription` call in `src/` | all on the new default-deny engine: CRM signature (emails.ts setUserSetting · then `.slice(0, 4000)`; shown only in a textarea, never sent as HTML), template save, send (`sendCore`; the plain-text path builds escaped HTML by design and is not re-sanitised), inbound, `emails-shared` `renderInboundHtml` (sandboxed `srcDoc`) / `emailSnippet` (text); member privacy policy + join render; kanban card write/read/links/mail-to-board |
| every `dangerouslySetInnerHTML` | same list as the hotfix note — nothing new on session/crm (`EmailThread` uses sandboxed `srcDoc`, CRM tracking QR SVG is library output) |
| payment profile | `savePaymentProfile` has the one gated action caller only [qc-payment-authz-hotfix 8/8] |
| mobile routes | AI/DNA doors from the hotfix [qc-mobile-authz-hotfix 12/12]; CRM mobile routes (`api/mobile/crm/*`, main has them too) pass the actor into CRM services: reads via `visibleWhere` (key-gated `READ_KEY[entity]`), widgets `enter(…, key)`, completeTask → `completeActivity` (`crm.activity.complete`), scan-card `canBusinessCard` |

## PART B — account ciEquals (commit bd9b6463)
All four are **equality** lookups (no semantic change): `account/product.ts` `checkProductDuplicates` name + sku legs, `account/service.ts` `checkContactDuplicates` name leg and `findContactForImport` name → `ciEquals(x)` (as fix2). `scripts/fitness.mts` F15 `OWED` = `[]` ⇒ F15.1 enforces them.
Real effects before the fix (probe RED on the pre-fix files, `scripts/pending/cf4/probe-cf4-ci.red.log`, 2/12): import row named `%` was filed on an arbitrary contact (`filler 23 …`), `บริษัท_ก …` on `บริษัท.ก …`; `checkContactDuplicates({ name: "%", phone })` returned 20 wildcard rows from `take: 20` and **lost the real phone match**; a stored literal name `50%_off\x` never matched itself (backslash = LIKE escape) in import/dupe checks; product dupes returned wildcard rows (hidden by the JS post-filter).
Probe `scripts/pending/cf4/probe-cf4-ci.mts` (own tenant + raw ACCOUNT system, DB-row spy on `findMany`, CLEAN 0): **GREEN 12/12**.

### ORACLE-EDIT C5.5-fix4
- `scripts/pending/cf2/probe-cf2.mts` R2-6: expected raw sites in `account/service.ts` + one injected `3` → `1` (the two debt sites are fixed; the injected one must still be flagged as outside the debt). Line marked `// ORACLE-EDIT C5.5-fix4`. probe-cf2 35/36 (R2-6 only) → 36/36.

### Still wildcards (NOT changed — they are "contains" searches; for a later card)
Proven on QC3 (`probe-cf4-contains.mts`): `contains: "%"` matched 3/3 rows, `contains: "gamma_x"` matched stored `gamma.x` ⇒ Prisma does not escape `%`/`_` in `contains`. Sites (all `mode: "insensitive"` unless noted, input = user search term, tenant/system-scoped ⇒ search widening only):
- `account/expense.ts:370-371` docNo, contact.name
- `account/contacts-list.ts:345-349` name, taxId*, phoneNorm*, phone*, email (* = case-sensitive `contains`)
- `account/attachment.ts:117` fileName · `:380-381` user.name, user.email · `:428` fileName · `:536-537` docNo, contact.name
- `account/service.ts:1467-1468`, `:1552-1553`, `:1613-1614` docNo, contact.name · `:5131-5134` name, taxId*, phone*, email
- `account/product.ts:1371-1373` docNo, note, contact.name · `:1467-1468` name, sku · `:1783-1787` name, nameEn, code, sku, barcode
- `account/journal-v2.ts:229-230` docNo, memo
- (server-built, not user input: `period-sweep.ts:95`, `service.ts:6863` body contains a fixed key)

## Verification (exact)
Tip = bd9b6463 (code) — all heavy jobs `bash scripts/iso.sh …` under the gate lock, one at a time, CRM_V2_SWITCH=all, QC3.
| check | tip | baseline 5c87acc3 (same DB) | verdict |
|---|---|---|---|
| typecheck | exit 0 (first run on the tree incl. Part B edits; final run on bd9b6463 + all new scripts, own unit via iso.sh: exit 0) | — | |
| fitness (QC3 env) · fitness (no env) | 36/36 · 36/36 (F15.0–F15.2 green, OWED empty) | — | |
| gen-crm-api-docs --check | exit 0 | — | |
| gen-member/kanban/account --check | reg1: exit 1 = `.claude/skills/shark-*-api/references/endpoints.md` 0 bytes (gitignored, absent in this worktree; same at 5c87acc3). r3: ran the 3 generators ⇒ **no tracked file changed** (`docs/api/*.md` already current) ⇒ --check crm/member/kanban/account all exit 0 (123/212/88/199 op) | same ENV red at base | green |
| qc-sanitize-hotfix (pure) | 29/29 | — | |
| hsan judge-selftest | OK (33 must-flag · 9 must-pass) | — | |
| hsan attack vectors+fuzz | vectors 3 027×6 → 0 · fuzz 300 000×6 → 8 POLICY (0 XSS): one input × 4 core modes × 2 passes, `href="ht tp://x…"` accepted by the pre-existing `linkSchemeOk` (review N1: relative URL, never script) | hotfix worktree 929c39ce: identical findings | pre-existing on prod |
| hsan truncation | 585 201 prefixes → XSS 0 · worst at cap 246 ms | — | |
| hsan sqlcheck | reviewer SQL misses 0 | — | |
| hsan pgtest | error `relation "Membership" does not exist` | 929c39ce: identical | stale harness (reads the FIRST ```sql of the hotfix note; since 7089364c that block is the Item-4 Membership count, not the finder) |
| probe-cf4-ci | 12/12 (RED 2/12 on pre-fix files) | — | |
| qc-automation-authz-hotfix · payment · mobile | 12/12 · 8/8 · 12/12 | — | |
| qc-crm-c2.5 · c3.5 · c1.7 | 105/105 · 67/67 · 57/57 | — | |
| probe-c54e · probe-c54e-r2 | 20/20 · 23/23 | — | |
| probe-cf2 | 36/36 after ORACLE-EDIT (35/36 before: R2-6) | — | |
| qc-acc-v2-contact-modal · import | 96/96 · 114/114 | — | |
| qc-acc-v2-policy | 32 ✅ · 3 ❌ (P15.1/.2/.4) then crash `policyDayKey` null (P7 dupe checks never reached) | identical check list + same crash | pre-existing (QC3 lacks account seed/"N" migration) |
| qc-kanban-k1.6 · k3.7 · k3.9 | 20/20 · 13/14 (S5.3) · 12/13 (S4.2) | k3.7 13/14 S5.3 · k3.9 12/13 S4.2 | pre-existing: "≥N screenshots in .qc-shots/kanban/…" (ENV) |
| qc-member-m1.7 | 25/26 (S7.2) | 25/26 (S7.2) | pre-existing: screenshot/parity record (ENV) |
| qc-member-m3.11 | 12/15 (S3.2 screenshot · S5.1 push-device REST needs a running app server → crash in the detail string · ERR) — reg1 and again in r3 after an 11-min OTP cooldown | 12/15, identical check list and findings (r3, after cooldown; the r2 base run hit the OTP limiter left by the tip run → 3/4, discarded) | pre-existing (ENV: no app server / screenshots) |

## Could NOT verify
- `checkProductDuplicates` through its owning suite: qc-acc-v2-policy crashes on QC3 before P7 (both trees) — covered only by probe-cf4-ci B3.
- Render-level checks that need a running app server / screenshots (k3.7 S5.3, k3.9 S4.2, m1.7 S7.2, m3.11 S3.2/S5.1, visual-kanban card back).
- Member/kanban suites that need the member/kanban seed on QC2 (in use by the other lane).
- hsan `pgtest` (stale harness, see table) · `exploitable`/`mkfinder`/`pgprobe` are helpers, not checks.

## Follow-ups
- Account `contains` searches (list above): escape `%`/`_`/`\` (e.g. a `likeContains()` beside `ciEquals`) — search widening only.
- Review N1 `linkSchemeOk` accepts `ht tp:` (relative URL) — harmless, pre-existing on prod.
- hsan `pgtest.mts` should read `finder.sql` only (the note's first ```sql block changed).
- Hotfix follow-ups carried over unchanged (CSP, sanitize at write for REST/AI/template card writes, raw HTML in REST reads).

## Controller merge gate record (main tree, 2026-10-01 17:57 UTC)

Patch `scripts/pending/c55merge/fix4.patch` (= wip/crm-cf4 `5c87acc3..b8e8ad52`) applied with `patch -p1 --fuzz=3` on session/crm after fix3a. Only `src/lib/modules/account/service.ts` differs from the worktree (fix3a's lock-order comment); the changed lines are identical (md5 of the +/- lines).
Independent review: MERGEABLE (`crm-C5.5-fix4-review.md`); pre-existing RV-1 HIGH / RV-2 / RV-4 / RV-9 go to card C5.5-fix5; RV-3 = owner policy decision.
Gate unit `crm-main-fix4` (`scripts/pending/run-main-fix4.sh`, log `.qc-shots/crm/main-fix4.log`, QC3): all 22 steps exit 0 — typecheck, docs ×4, fitness ×2, qc-sanitize-hotfix, rv-cf4-sanitize, rv-cf4-db, probe-cf4-ci, automation/payment/mobile authz hotfix suites, probe-cf2, probe-fix1, probe-c54e, c2.5, c3.5, c1.7, acc contact-modal, acc import.

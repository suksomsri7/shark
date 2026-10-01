# crm-C5.5-fix8 — LOW findings of the authz-sweep review (F2–F6) + account `contains` wildcards + R2-1 unverified-sender flag + closing-hunt H3-1

Worktree `/root/projects/shark-crm-c54e` · branch `wip/crm-cf11` from 53d88b71 (session/crm) · prod reference 929c39ce (read only) · DB QC3 (own probes, CRM suites) and QC2 (QC2-pinned cf5 probes, account REST suites) · not pushed.
Probes `scripts/pending/cf11/` (`_ctx.mts` = probe-cf8-actions technique: real server actions under a forged Next request scope with a real session cookie, network blocked, throwaway tenants swept to 0) · runners `run-probes.sh` / `run-verify.sh` (run from a /tmp copy) · logs `/tmp/cf11-logs/`.
RED logs committed next to the probes (`*.red.log`, raw keys redacted).

## Items
### 1 · F2 — account page minted a scope-less key from a crafted form · FIXED
- `account/connections-actions.ts createApiKeyAction`: after the scope/bundle expansion and the S1 allow-list loop, `scopes.length === 0` ⇒ refused ("เลือกสิทธิ์ของคีย์อย่างน้อย 1 รายการ …"). The UI always sends a bundle, so no UI flow changes (K1.2: every account bundle, ticked scopes, the full `ACCOUNT_SCOPE_KEYS` list by OWNER still mint).
- **Platform page `/app/settings/api` (`createKeyAction`) not changed.** Design intent found: `ledger/ACCOUNT-API-RUN.md:72` "สร้างคีย์ที่นี่ = scopes [] (พฤติกรรมเดิม)", `api-keys/service.ts` "`[]` = คีย์อ่านรุ่นเดิมของ /api/v1/*", label "อ่าน API กลาง (คีย์รุ่นเดิม)"; hotfix/apiv1-scope names it the shop's "general key" (scopes [] + unbound) and makes the legacy routes accept ONLY that shape. So the platform page minting `[]` is by design.
- **OWNER QUESTION Q1:** the general key reads every legacy `/api/v1/*` route (member names/phones via `/customers`, POS, stock …) and the non-module AI tools, yet it is minted with `api.key.create` alone (a branch-limited MANAGER holds it by default). Recommendation: keep the general key, but make minting it OWNER-only (or a separate permission), ship hotfix/apiv1-scope so module keys stop reaching those routes, and list existing general keys for the owner to review.

### 2 · F3 — rotation copied any scopes · FIXED
- New `account/connections.ts accountKeyRotationProblem(tenantId, keyId)` (called by `rotateApiKeyAction` after `accountManagedKey`, before `rotateApiKey`): refuses rotation, old key untouched, Thai reason telling the user to revoke and create a new key — no silent dropping:
  - scopesJson not an array of strings ⇒ the exact sentence of hotfix/apiv1-scope's `rotateApiKey` (`ข้อมูลสิทธิ์ของคีย์นี้ในระบบไม่สมบูรณ์ จึงหมุนคีย์ให้ไม่ได้ — เพิกถอนคีย์นี้แล้วสร้างคีย์ใหม่แทน`, same condition), returned in the action's usual `{ ok:false, reason }` shape — after that branch merges, its in-tx check becomes a second line with the same text;
  - any scope outside `ACCOUNT_SCOPE_KEYS` (crm.*, member.*, crm filter pseudo-scope, pos.* on an unbound key) ⇒ refused naming the scope;
  - account-bound key with `[]` ⇒ refused (F2 rule).
- Unchanged: an **unbound** `[]` key (the shop's general key, which `accountManagedKey` lets this page manage since C5.4-B) still rotates — OWNER QUESTION Q2: should the account page manage the general key at all? Recommendation: no (manage it only on `/app/settings/api`, which today has no rotate — add one there).
- I did not touch `api-keys/service.ts` (hotfix/apiv1-scope edits the same `rotateApiKey` lines) ⇒ no merge conflict there.

### 3 · F4 — kanban key page accepted any bundle · FIXED (+ mirror check)
- `kanban/settings-actions.ts createKanbanApiKeyAction`: `KANBAN_BUNDLE_IDS` (`kanban-read/edit/admin`, same shape as `MEMBER_BUNDLE_IDS` / CRM `BUNDLES`) + every expanded scope ∈ existing `KANBAN_SCOPE_KEYS` (scopes.ts) — no new permission keys.
- Mirror: CRM page (`BUNDLES` + `crmKeyWiderThanCreator`), member page (`MEMBER_BUNDLE_IDS`), member REST `apikeys.create` (`z.enum(MEMBER_BUNDLES)`) already refuse foreign bundles (K4.1 green at base and after). CRM REST and account REST have no key-minting op (account: deliberate, `settings-write.ts:647`).
- Rotate/edit doors: only the account page rotates (item 2). Revoke doors: member and CRM pages check `systemId`; account page `accountManagedKey`; **kanban `revokeKanbanApiKeyAction` still revokes any key id of the shop** — fixed identically by hotfix/apiv1-scope round 3 (not ported here, per the card); platform page revokes any key of the shop (platform-level, by design).

### 4 · F5 / F6 — account REST `webhooks.test` · FIXED / F6 left
- `account/api/ops/webhooks.ts webhooks.test`: unknown event ⇒ 422 as before; known but not `account.*` ⇒ 422 `validation` "ยิงทดสอบได้เฉพาะเหตุการณ์ของระบบบัญชี" (same Thai text as the page, details path `event`). Summary/field doc updated; `docs/api/ACCOUNT-API.md` regenerated (2 lines).
- F6 not changed: `testWebhookAction` receives only `systemId` + `type` (`ConnectionsPanel.tsx:689-691` never sends the row id), so the action cannot target the clicked endpoint without a client change. Every account event's button still dispatches (W2.2).

### 5 · account `contains` wildcards · FIXED (+ fitness F15.3–F15.5)
- Verified on QC3: Prisma 7 sends `contains` as `LIKE/ILIKE $1` with `%q%` unescaped (C0.1: `%` → every row, `gamma_x` → `gamma.x`, backslash eats the next char — `cotton\` found nothing).
- `core/ci-equals.ts`: `ciContains(q)` = `{ contains: likeEscape(q), mode: "insensitive" }`, `likeContains(q)` (case-sensitive), `likeStartsWith(q)` — the same `likeEscape` as `ciEquals` (Postgres default escape `\`). C0.2 proves literal `%` `_` `\`, case-insensitivity kept where it was, case-sensitivity kept where it was, Thai.
- Sites converted (all from the fix4 list): `expense.ts:370-371` · `contacts-list.ts:345-349` (taxId/phoneNorm/phone stay case-sensitive via `likeContains`) · `attachment.ts:117, 380-381, 428, 536-537` · `service.ts:1472-1473, 1557-1558, 1618-1619, 5136-5139` · `product.ts:1371-1373, 1467-1468, 1783-1787` · `journal-v2.ts:229-230`.
- Same class found by the new scanner and also converted (user-reachable `startsWith`): `access.ts:248` audit-log `action` filter (URL + REST `settings-read`), `service.ts:5674 findGroupChildPayments` and `group-batch.ts:52 groupBatchPayments` — the batch key reaches them from the REST path / form of `voidGroupPayment` (`GRP#<group>#%` used to match every batch of the group).
- Fitness: `scripts/lib/ci-equals-scan.mjs findRawSearch` (+ self-test 9 must-hit / 8 must-not-hit) · F15.3 self-test · F15.4 = no raw `contains`/`startsWith`/`endsWith` key in `src/lib/modules/account/**` or `src/app/**/account/**` outside an ALLOW list of 7 server-built/constant sites (`doc-settings.ts` "DOC:", `expense.ts` "16", `finance.ts` ×3 constant code prefixes, `period-sweep.ts` and `service.ts` report markers) · F15.5 ratchet. Scope limited to account because the rest of `src/` has 100+ raw sites (list below) — widening = one module at a time.

### 6 · R2-1 — unmatched forged mail unflagged · FIXED
- `crm/emails.ts ingestInbound`: `routing.unverifiedFrom = true` for EVERY inbound mail without From proof (`senderNotProven = IN ∧ !fromProof`; "proven" = our MTA's Authentication-Results `dmarc=pass header.from=<From domain>` — `authResultPass`, unchanged; thread proof never cleared the flag and still does not). Matched mail is byte-identical (M3.1/M3.2 routing JSON, M3.3 event payloads); the `crm.email.received` payload still uses the matched-only `unverifiedFrom` (M3.4: unmatched payload unchanged).
- Readers unchanged (`emailRoutingUnverified`, thread-list SQL): thread view, unmatched inbox, contact inbox, activity block, contact/company 360 now show the badge after "attach to contact" (M1.1–M1.3). AI briefs: the R2-2 flag lives on `wip/crm-cf7` (fix6, not merged into 53d88b71); it reads the same `routing` via `unverifiedEmailRefs`, so attached mail will be flagged there too once fix6 merges — not verified here.
- Rows stored before this fix stay unflagged (no backfill). Unmatched staff-claim mail now carries both `unverifiedShopFrom` and `unverifiedFrom` (reader ORs them — same badge).

### 7 · H3-1 (closing hunt, added by the controller) — per-sender bucket dropped proven mail · FIXED
- Both rate buckets now run only for mail with NEITHER proof, after the cheap proofs. Owner is notified on the first trip of the per-sender bucket too (same AppNotification path/title as the system bucket via new `notifyOwnersInboundCap`, no address in the text — RV2-3 rule; system-bucket text byte-identical).
- Thread proof INFO: fixed for the bucket exemption only — the reference lookup now reads up to 50 referenced rows (`findMany`, newest first; `parent` = first row = old `findFirst`), and `anyThreadProof` = any referenced OUT mail addressed to this From. Reply effects (`repliedAt`, sequence stop) still use `parent` + `threadProof` exactly as before (H.3: OUT `repliedAt` untouched).
- Final step order of `ingestInbound`: (1) cap envelope (fix5) → recipient key → loop header → system/settings/v1/disabled → duplicate Message-ID; (2) `fromAddr` → `fromProof` (pure parse of capped A-R) → refs (capped) → 1 indexed query for referenced rows (only if refs) → `threadProof` / `anyThreadProof`; (3) if `!fromProof && !anyThreadProof`: per-sender bucket → system bucket (each: audit + owner notice once per window) → drop; (4) Reply-To, auto, subject → staff / override / verified-domain lookups → `unverifiedShopFrom` → direction → `bcc_capture_off`; (5) HTML/text caps + sanitise; (6) attribution (contact/company/stranger lead) → flags; (7) tx row + activity + event → attachments → reply effects → replied notice → copy-in. Floods now pay at most one reference query before the drop (before: staff/override/domain/parent lookups for the system bucket).
- Behaviour change to note: proven mail no longer counts against or is dropped by the per-sender bucket — `scripts/pending/cf2/review/probe-cf2-review-r2.mts` Q3 asserts the old "exempt path still dies at the per-sender cap" (see verification).

## RED → GREEN (QC3)
| probe | RED (53d88b71) | GREEN (tip) |
|---|---|---|
| `probe-cf11-keys` (F2 F3 F4 F5 + mirror + every account event) | 9/14 — K1.1 K2.1 K2.2 K3.1 W1.1 | 14/14 |
| `probe-cf11-contains` (helper on DB, 7 real list/picker functions, static) | 3/12 — C0.2 C1×7 C2.1 | 12/12 |
| `probe-cf11-mail` (R2-1 + H3-1 incl. hunt S1.2/S1.3/S1.6) | 14/24 on base `emails.ts` — M1.1–M1.3, S1.2, S1.3, S1.6, H.2–H.5 (H.2/H.4/H.5 are mixed controls that are red at base because the old bucket also counted the proven replies) | 24/24 |
Positive controls inside: K1.2 (OWNER/MANAGER legit minting, 5 account bundles, full scope list), K2.3 (account key, unbound general key and unbound account key still rotate; CRM-bound key still "not here"), K3.2 (3 kanban bundles + default), K4.1, W1.2 (unknown event unchanged), W2.1/W2.2 (all 21 account events via REST, and via the page by Thai label and by value), C0.2/C1 (normal terms return the same rows, Thai, case rules), M2.x (proven mail unflagged), M3.x (matched mail byte-identical), H.0/H.1, H.2 (unproven flood still limited at 100, one audit, one notice), H.4 (system bucket unchanged), H.5 (flags during the flood).

## Verification (`run-verify.sh` label v1, iso.sh + gate lock, one at a time; finished 2026-10-01 23:28 UTC)
| check | result |
|---|---|
| `pnpm typecheck` (5 GB heap) | exit 0 |
| probe-cf11-keys · contains · mail | 14/14 · 12/12 · 24/24 |
| probe-cf8-mobile · probe-cf8-actions | 8/8 · 9/9 |
| probe-cf8-review | 17/19 — **X1.1 and X2 no longer reproduce** (both REPRO checks now red by design: scope-less mint refused; REST test of `crm.deal.won` → 422). X1.2/X1.3/X1.4 (F1, legacy routes) still reproduce — out of scope (hotfix/apiv1-scope) |
| probe-cf4-ci · probe-cf4-contains | 12/12 · evidence script (raw Prisma `contains` still a pattern — the premise; exit 0) |
| QC2: probe-cf5 · probe-cf5-r2 · rv-cf5 · rv-cf5-r2 | 22/22 · 14/14 · 32/32 · 16/16 (rv-cf5-r2 INFO-R2-attach-path now records flag=true → 360 flag true) |
| qc-crm-c2.5 (kanban-email-in.ts unchanged ⇒ no re-pin) · c2.6 · c1.6 | 105/105 · 87/87 · 79/79 |
| qc-webhook (no `.env.local` exists in this worktree) | 15/15 |
| qc-acc-v2-contact-modal · qc-acc-v2-import (QC3) | 96/96 · 114/114 |
| QC2: qc-account-api-webhooks · qc-account-api-write-settings (D4-S6.6 `webhooks.test`) | 22/22 · 39/39 |
| gen-{crm,member,kanban,account}-api-docs --check | exit 0 ×4 (123/212/88/199 op) |
| fitness (QC3 env) · fitness (no env) | 42/42 · 42/42 (F15.3–F15.5 new) |
| probe-cf2 (fix2 gate probe, incl. D1 bucket checks for unproven mail) | 36/36 |
| probe-cf2-review-r2 (reviewer probe, not a gate) | 8/10 — **Q3** red only on `genuineOverSender: "stored"` (it asserts the old "exempt path still dies at the per-sender cap", which H3-1 reverses on the controller's instruction; every other Q3 clause green, notice has no address) · **Q6.2** red because it expects the 4 F15 OWED entries that fix4 removed (OWED is `[]` at 53d88b71 too ⇒ red at base by construction; not re-run at base). Probe left unedited |

## Also on prod main 929c39ce (read with `git show`)
- F2: yes (same mint path; S1 is not on prod either, so any `isApiScope` scope is accepted there too).
- F3: worse on prod — `rotateApiKeyAction` has no `accountManagedKey` check at all (C5.4-B not on prod): any key of the shop rotates with copied scopes.
- F4: yes (`expandBundles([bundle])` without a family check).
- F5: yes (`EVENT_VALUES.has` only). F6: same.
- contains/startsWith wildcards: yes, every listed account site (incl. audit `action` filter and `findGroupChildPayments`; `group-batch.ts` does not exist on prod).
- R2-1 / H3-1: no (fix2 inbound proof/buckets are session/crm only; CRM v2 inbound is hidden on prod).

## Non-account search sites still treating `%` `_` `\` as wildcards (not changed — list for later cards)
CRM (user input, unescaped): `deals.ts:1777` title · `objects.ts:1026` record title (raw twin `:1063` is escaped) · `contacts.ts:1546-1550, 1556` name/first/last/email/raw-q phone · `companies.ts:610` (dup probe on create), `:1373-1374` name/legalName/emailDomain, `:2032`, `:2071` pickers · `activities.ts:1297-1298` target search · raw SQL `list-sql.ts:83 containsSql` (field-filter path for deals/contacts/companies) · `emails.ts` thread-list subject `ILIKE ('%'||q||'%')`. Digit-only values (phone digits, taxId `^\d{3,13}$`, portal phone) cannot carry wildcards. Server-built: commissions refId/source, ai-bridges, limits, notifications, notify-senders, reports, privacy.
Member: `segments.ts:425, 527` · `import.ts:229` · `fields.ts:1763, 1819, 1868` + raw `:2512` (also used by CRM field filters) · `list.ts:173-180` (members list/search incl. AI `member_search`) · `service.ts:369-371` (no caller passes a search today) · `chat-bridge.ts:212-214` (LINE display name) · `profile.ts:1438-1440` (linkIdentity display name).
Kanban: `search.ts:102, 126-128` already escaped (local `likeSafe`) · unescaped: `ai/tools-kanban.ts:103-104` and `ai/kanban-ops.ts:206-207` (AI `assignee` param) · `kanban/archive.ts:29` (archive search, UI + REST) · `cards.ts:721` (no caller). Server-built: automation, links, digest.
None is the identical one-line change inside account/** ⇒ none changed here.

## Owner questions
- Q1 (item 1): general-key minting needs only `api.key.create`; make it OWNER-only? (recommendation above).
- Q2 (item 2): should the account page keep managing (rotate/revoke) the shop's unbound general key?
- Carried: prod key inventory question from the authz-sweep review (account-bound keys with non-account scopes) — item 2 now blocks renewing them, but existing ones keep working until they expire or are revoked.

## Not verified
- AI briefs badge (needs fix6 / wip/crm-cf7 merged). Browser render of the badge and of the new Thai messages (server actions driven under a forged Next request scope only).
- `listContactsPage` driven with a hand-built sidebar; journal, goods-issue, attachment-search, audit-log and group-batch sites are covered by the static check + the helper's DB semantics, not end to end (journal/group suites need the acc-v2 seed / N migration missing on QC3).
- hunt worktree probe `probe-hunt3.mts` itself not run (its S1 checks copied into probe-cf11-mail).
- Member/kanban suites needing their seeds; `qc-kanban-k1.15` (kanban seed) not run — it mints keys through the service, not the page action.

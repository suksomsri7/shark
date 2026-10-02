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


## Round 2 (review `crm-C5.5-fix8-review.md` NOT MERGEABLE — RV-1 · RV-2 · RV-3 · RV-5 · P14 note)

### RV-1 HIGH — body-sized load before the buckets · FIXED
- The round-1 `findMany(take 50)` without `select` is gone. Before the buckets there is now ONE narrow proof query:
  `crmEmailMessage.findMany({ where: { tenantId, systemId, direction: "OUT", messageId: { in: candidates(proofRefs) } }, select: { toAddrs, ccAddrs }, take: 50 })`
  — only our own OUT mails of this tenant + system, only the two address arrays; `proofRefs` = In-Reply-To + the newest 99 References (≤ 100 ids ⇒ ≤ 200 bind params).
- The full `parent` row is read with the base `findFirst` (newest referenced row, all candidates) **after** both buckets, exactly as before this card — used for threading and reply effects only.
- R1.1: a dropped mail citing 50 stored mails of 400 k chars each loaded 20.05 M chars at 3ffb9026 → ≈ 2 chars (only the empty OUT-address result; reviewer RB.1: 0.0 M chars, 96 ms) now. R1.2 control: an accepted mail still loads its one parent row after the buckets.

### RV-2 HIGH — proven mail unbounded · FIXED (numbers + reasoning)
Buckets (`CRM_INBOUND_RATE_LIMITS`, per hour, `checkRateLimitDb`, fail-open on DB error as before):
| class | per sender (hash of From) | whole system | key |
|---|---|---|---|
| unproven (no A-R pass, no thread proof) | 100 | 1,000 | `crm.email.in.from.<sys>.<h>` · `crm.email.in.sys.<sys>` (unchanged keys, limits, texts) |
| proven (A-R pass of our MTA, or thread proof) | 100 | 2,000 | `crm.email.in.from.proven.<sys>.<h>` · `crm.email.in.sys.proven.<sys>` (new) |
Every mail is counted in exactly one class (sender bucket first, then system bucket — the old order) and is dropped only by its own class.
1. **Forged unproven mail can never fill a bucket that drops proven mail** — proven mail never reads an unproven key (R2.1: unproven sender + system buckets full ⇒ the customer's thread-proven replies still get in; hunt S1.2/S1.3/S1.6 green).
2. **No sender class is unlimited**: unproven 100/1,000, proven 100/2,000 (R2.1–R2.3, R2.5). Before this card proven mail had no system-wide bound at all (RV2-3 exempted it); round 1 also removed the per-address bound.
3. **An attacker-owned DMARC-passing address is limited at least as tightly as before this card**: before, its mail was bounded per address by the all-mail sender bucket (100/h) and not at all system-wide; now its proven mail is bounded 100/h per address (R2.3: 100/120) and 2,000/h across all its addresses. What it can additionally send *without* proof is exactly what any forger can send under any address (unproven buckets) — sending unproven gains it nothing over a forger.
- Why 2,000 system-wide for proven mail: twice the unproven cap, far above an SME shop's genuine authenticated inbound per hour, low enough that a rotating-local-part DMARC flood (or a CC/forward chain holding our Message-ID) costs at most 2,000 rows/activities/events/copy-in sends per hour; the owner is told once per window when it trips (text says it should not normally happen).
- Thread proof (bucket class only) = some referenced Message-ID is an OUT mail **of this tenant + system** whose to/cc contains this exact From (`bareEmail` equality, the fix2 rule). R2.4: a non-recipient citing our valid id, and a recipient of an OUT mail of ANOTHER CRM system of the same shop citing it, are unproven. Reply effects (`repliedAt`, sequence stop) still use only the newest referenced row (`parent` + fix2 `threadProof`), unchanged.
- Cost before a drop now: 1 dup-check (id only) + at most 1 narrow OUT-address query + 2 bucket upserts; nothing else.

### RV-3 MED — owner-notice spam · FIXED
- Per-sender trips notify at most once per system per hour per class (`ownerNoticeDue`: bucket `crm.email.in.notice.<sender|sender-proven>.<sys>`, limit 1/h). Audit lines are still written for every tripping sender. The unproven SYSTEM notice is unchanged (title, text, once per window); the new proven-system notice has its own text.
- R3.1: 12 tripping senders → 1 notice, 12 audit lines (3ffb9026: 12 notices). R3.3: next window notifies again.

### RV-5 LOW + Q2 ruling — account page key doors · FIXED
- `accountManagedKey` = bound to an ACCOUNT system of the shop **and** every scope ∈ `ACCOUNT_SCOPE_KEYS` (one rule for rotate and revoke). Unbound keys (the shop's general `[]` key, pre-A2 unbound account keys) and keys holding any foreign scope (crm.*, pos.* …) answer "ไม่พบคีย์นี้ในหน้าการเชื่อมต่อของบัญชี — คีย์กลางของร้านจัดการได้ที่ ตั้งค่า › API สำหรับนักพัฒนา …" and stay untouched (R4.1). The connections page lists only those keys (same rule).
- Kept: an account-bound key with malformed `scopesJson` is still "of this page" so it can be revoked here; its rotation is refused with the hotfix/apiv1-scope sentence (K2.2). An account-bound legacy `[]` key can be revoked here (R4.2) but not rotated (F2 rule).
- Platform page and who may mint the general key: unchanged (owner decision pending, Q1).
- `probe-cf11-keys` K2.3 updated for the ruling (unbound general / unbound account keys now "not here" for rotate and revoke).

### P14 — what the deployment must guarantee (`CRM_INBOUND_AUTHSERV_ID`)
- Code fails closed: `authResultPass` returns false when `CRM_INBOUND_AUTHSERV_ID` is unset or empty (`emails.ts` `if (!trusted) return false`) ⇒ every inbound mail is unproven: flagged, counted in the unproven buckets only (R5.1, reviewer RD.1).
- When it is set, the deployment MUST guarantee: (1) the inbound MTA/provider that feeds `/api/email/inbound` adds its **own** `Authentication-Results` header with exactly that authserv-id to **every** message, after its own SPF/DKIM/DMARC check; (2) it removes (or renames) any incoming `Authentication-Results` header that already carries that authserv-id (RFC 8601 §5); (3) the route only accepts requests from that provider (the inbound secret). With (1) alone an attacker-supplied header with our id becomes a second instance ⇒ no proof (fail-safe); without (1) a single attacker-supplied header would be trusted — and since this card it would also move the mail into the proven buckets (bounded 100/2,000 per hour, not unbounded). Do not set the variable until (1)+(2) are confirmed for the provider in use.

### RV-4 (restated) — kanban key page revokes any key of the shop
- Unchanged here; fixed by hotfix/apiv1-scope round 3 (`/root/projects/shark-hf` 201d371a). It must ship with or before this branch's key work. Reviewer RK.6 stays red until then.

### Final `ingestInbound` step order (round 2)
1. Cap envelope (fix5) → CRM recipient key → loop header → system/settings → v1 / disabled → duplicate Message-ID (id only).
2. `fromAddr` → `fromProof` (pure parse of the capped A-R header; false if the env is unset) → refs (capped) → narrow OUT-address query (≤ 100 ids, ≤ 50 rows, `toAddrs/ccAddrs` only) → `threadProofAny` → `proven`.
3. Per-sender bucket of the class → system bucket of the class (each trip: audit once per window + deduped owner notice) → drop `rate_limited`.
4. Full `parent` row (`findFirst`, newest referenced) → fix2 `threadProof` (reply effects).
5. Reply-To, auto, subject → staff / override / verified-domain lookups → `unverifiedShopFrom` → direction → `bcc_capture_off`.
6. HTML/text caps + sanitise.
7. Attribution (contact / company / stranger lead) → `routing` flags (`unverifiedFrom` for every IN mail without `fromProof`).
8. Tx: row + activity + `crm.email.received` → attachments → reply effects (`parent` OUT + (`fromProof` ∨ `threadProof`)) → replied notice → copy-in.

### Round 2 RED → GREEN
| probe | 3ffb9026 (round 1) | round 2 |
|---|---|---|
| `probe-cf11-r2` (new) | 7/16 — R1.1 R2.1 R2.2 R2.3 R2.5 R3.1 R3.2 R3.3 R4.1 | 16/16 |
| reviewer `probe-cf11-review-mail` | 7/12 (reviewer run) | 11/12 — RA.1 ✅ (100/150 stored), RA.3 ✅ (100/120), RB.1 ✅ (0.0 M chars before the drop), RC.1 ✅ (+1 notice for 12 senders); **RA.2 stays ❌ by design**: it sends 30 mails from one CC participant and wants fewer than 30 stored, but the proven per-address bound is 100/h (my R2.2: 100/105 stored) |
| reviewer `probe-cf11-review-keys` | 8/9 | 8/9 — RK.6 (kanban revoke = RV-4, other team's hotfix) unchanged; INFO-RK.4 now "not here" for revoke of the unbound pos key, INFO-RK.5 now "not here" for rotating the general key |
| hunt `probe-hunt3` (copied read-only from c54d into this tree, not committed) | S1.2/S1.3/S1.6 reproduced at 53d88b71 | S1.2 · S1.3 · S1.6 not reproduced (green); controls S1.0/S1.1/S1.4 green; **S1.5 ❌ by design**: it expects exactly one unproven sender-bucket audit, but the victim's proven replies no longer count in that bucket, so it never trips (`audits=[]`, 0 notices); X1.1 = H3-2 (PDPA export truncation, other card) |

### Round 2 verification (`run-verify.sh` label v3, iso.sh + gate lock, one at a time; finished 2026-10-02 01:07 UTC)
| check | result |
|---|---|
| `pnpm typecheck` (5 GB heap) | exit 0 |
| probe-cf11-keys · contains · mail · r2 | 14/14 · 12/12 · 24/24 · 16/16 |
| probe-cf11-review-mail · review-keys | 11/12 (RA.2 by design) · 8/9 (RK.6 = RV-4) |
| probe-hunt3 | S1.2/S1.3/S1.6 green · S1.5 by design · X1.1 other card |
| probe-cf2 · probe-cf2-review-r2 | 36/36 · 8/10 (Q3 only `genuineOverSender: stored` — same as round 1, by design; Q6.2 stale OWED expectation, red at base) |
| probe-cf8-mobile · actions · review | 8/8 · 9/9 · 17/19 (X1.1, X2 no longer reproduce — by design) |
| probe-cf4-ci · probe-cf4-contains | 12/12 · evidence (exit 0) |
| QC2: probe-cf5 · probe-cf5-r2 · rv-cf5 · rv-cf5-r2 | 22/22 · 14/14 · 32/32 · 16/16 |
| qc-crm-c2.5 · c2.6 · c1.6 · qc-webhook | 105/105 · 87/87 · 79/79 · 15/15 |
| qc-acc-v2-contact-modal · import (QC3) | 96/96 · 114/114 |
| QC2: qc-account-api-webhooks · write-settings | 22/22 · 39/39 |
| docs --check ×4 | exit 0 (no doc change in round 2) |
| fitness (QC3 env) · (no env) | 42/42 · 42/42 |

### Round 2 not verified
- Attachment storage / link-fetch cost under a proven flood (bounded now by the proven buckets; path not exercised).
- Real serverless memory; browser render of the account connections page with the narrowed key list (no account UI suite run in a browser).
- The hunt probe was run from a copy in this tree (the hunt worktree was not touched); RED for my r2 probe was run with the five round-2 src files swapped back to 3ffb9026.


## Round 3 (review round 2 `crm-C5.5-fix8-review.md` "Round 2" — NOT MERGEABLE on RV-6; RV-1/RV-3/RV-5 closed)

### RV-6 HIGH — shared proven system bucket · FIXED (controller ruling, implemented exactly)
Every inbound mail belongs to exactly one class, chosen from the evidence before any bucket, and is counted in and can be dropped only by its own class's buckets (order inside a class: sender → domain/message → system). So floods in D, T or U can never drop V.

| class | evidence | per sender (key = lower-cased mailbox, `+tag` stripped) | extra bucket | per system | keys (`<h>` = sha256 prefix) |
|---|---|---|---|---|---|
| V verified reply | DMARC proof AND thread proof | 100/h | — | 2,000/h | `crm.email.in.from.v.<sys>.<h>` · `crm.email.in.sys.v.<sys>` |
| D DMARC only | DMARC proof, no thread proof | 100/h | 300/h per From domain, except `CRM_INBOUND_FREE_MAIL_DOMAINS` (gmail.com, googlemail.com, outlook.com, hotmail.com, live.com, yahoo.com, yahoo.co.th, icloud.com, me.com, proton.me, protonmail.com) | 1,000/h | `from.d.` · `dom.d.<sys>.<h(domain)>` · `sys.d.` |
| T thread only (forgeable) | thread proof, no DMARC proof | 100/h | 100/h per referenced OUT Message-ID (shared by every From citing it; the lowest proving stored Message-ID) | 1,000/h | `from.t.` · `msg.t.<sys>.<h(messageId)>` · `sys.t.` |
| U unproven | neither | 100/h (unchanged key `crm.email.in.from.<sys>.<h>`) | — | 1,000/h (unchanged key `crm.email.in.sys.<sys>`) | fix2 keys, audits and texts |

- DMARC proof = `authResultPass` (our MTA's single A-R instance, `dmarc=pass header.from=<From domain>`). Thread proof = some referenced Message-ID (In-Reply-To + newest 99 References) is an OUT mail of this tenant + system whose to/cc contains this exact From (`bareEmail` equality).
- Sender key normalisation applies to EVERY class (U too): `inboundSenderBucketAddr` = lower-case, local part cut at the first `+`. It is used only for the bucket hash; attribution, matching and stored addresses are unchanged. For an address without `+tag` the U hash is identical to before (`sha256("from:" + address)`).
- Pre-bucket cost unchanged: one narrow query (`messageId, toAddrs, ccAddrs` of ≤ 50 OUT rows) + 2–3 bucket upserts; nothing body-sized.
- Owner notice: at most one per hour per system per class when any bucket of V/D/T trips (sender, domain, message or system level; notice bucket `crm.email.in.notice.class-<v|d|t>.<sys>`). V's text says genuine replies are being dropped. U keeps the round-2 behaviour (sender notice deduped per hour; system notice once per window, text unchanged since fix2). An audit line is written for each bucket's first trip of the window (`sender-v`, `system-v`, `sender-d`, `domain-d`, `system-d`, `sender-t`, `message-t`, `system-t`, `sender`, `system`). No address appears in keys, audits or notices.
- Why these hold (ruling's constraints):
  - Filling V needs ≥ 20 real DMARC-passing mailboxes that were visible recipients of our mails (100/h each, after normalisation); a D/T/U flood cannot touch it (F.2).
  - One attacker DMARC domain: 100/h per mailbox, 300/h per domain, 1,000/h for all of D; its plus-variants share one sender bucket (A.1: 100 of 2,000 stored; B.1).
  - Thread-only (forgeable by anyone who saw the recipients): 100/h per sender, 100/h per OUT mail across all senders, 1,000/h total (E.1: 30 recipients × 4 → 100 stored).
  - Before this card: proven mail had no system bucket and the per-address sender bucket counted all mail. Now no class is unlimited, and every class is at least as tight per address (100/h).

### P14 (updated)
- `CRM_INBOUND_AUTHSERV_ID` unset ⇒ `authResultPass` is always false ⇒ no DMARC proof ⇒ only classes T and U exist (I.1: a perfect-looking A-R header + our Message-ID counts as T; without the reference, U). V and D buckets are never touched. The flag `unverifiedFrom` is set on every inbound mail (no mail is "proven").
- Before setting the variable, the deployment must guarantee (reviewer's line): the inbound MTA/provider adds its OWN `Authentication-Results` header with exactly that authserv-id to every message after its own SPF/DKIM/DMARC check, AND strips or renames any incoming header that already carries that id (RFC 8601 §5), AND `/api/email/inbound` accepts only that provider (inbound secret). Otherwise a single attacker-supplied header with our id would be trusted: such mail becomes class D, or class V if it also cites one of our mails to that address. Those classes are bounded per mailbox, domain and system, but class V could then be filled by forgery. Do not set the variable until all three are confirmed for the provider in use.

### RV-7 LOW — recorded as C6 debt (no code)
Per system per hour at the caps: V 2,000 + D 1,000 + T 1,000 + U 1,000 = **5,000 accepted mails/h**. Each stores up to 1,000,000 chars of HTML + 1,000,000 chars of text: ≈ 2 MB ASCII, up to ≈ 6 MB for Thai (3 bytes/char). Worst case ≈ **10 GB/h** (ASCII) to **30 GB/h** (Thai) of stored bodies, plus attachments. Also up to 5,000 `crm.email.received` events, 5,000 EMAIL activities (matched mail) and 5,000 copy-in sends per hour (copyMode IN/BOTH). C6 debt: a per-system daily byte budget for inbound bodies and attachments, and counting copy-in sends against the shop's outbound quota.

### Final `ingestInbound` step order (round 3)
1. Cap envelope (fix5) → CRM recipient key → loop header → system/settings → v1 / disabled → duplicate Message-ID (id only).
2. `fromAddr` → `fromProof` (pure parse of the capped A-R; false when the env is unset) → refs (capped) → one narrow query (OUT, this tenant + system, ≤ 100 ids, ≤ 50 rows, `messageId/toAddrs/ccAddrs`) → `threadProofAny` + `proofMessageId` → class V/D/T/U.
3. Buckets of that class only: sender (normalised) → domain (D, non-free) / message (T) → system; first trip: audit + deduped owner notice → drop `rate_limited` (200, no row).
4. Full `parent` row (`findFirst`, newest referenced) → fix2 `threadProof` (reply effects only).
5. Reply-To, auto, subject → staff / override / verified-domain lookups → `unverifiedShopFrom` → direction → `bcc_capture_off`.
6. HTML/text caps + sanitise.
7. Attribution (contact / company / stranger lead) → `routing` flags (`unverifiedFrom` for every IN mail without `fromProof`).
8. Tx: row + activity + `crm.email.received` → attachments → reply effects (`parent` OUT + (`fromProof` ∨ `threadProof`)) → replied notice → copy-in.

### Round 3 RED → GREEN
| probe | 1d118384 (round 2) | round 3 |
|---|---|---|
| `probe-cf11-r3` (new: A reviewer R2A.1 · B R2B.1 · C domain + free-mail · E per-Message-ID · F class exclusivity · G H3-1 + unproven flood · H notices · I P14 unset) | 5/14 — A.1 B.1 C.1 E.1 F.1 F.2 G.2 H.1 I.1 | 14/14 |
| `probe-cf11-r2` | — | run with `--skip=R2` (its R2 block asserted the round-2 `.proven.` keys, superseded by r3); R1/R3/R4/R5 green (11/11) |
| reviewer `probe-cf11-review-r2` | 6/8 (reviewer, at 1d118384) | 7/8 — **R2A.1 ✅** (100/2,000 attacker mails stored; the customer's DMARC+thread reply and a thread-only reply stored). **R2B.1 ✅ but vacuous**: it presets the retired `.proven.` key, so both plus-variants land in a fresh class-D bucket; the real check is my B.1. **R2C.1 ❌ instrumentation only**: it classifies a mail by whether `crm.email.in.sys.proven.<sys>` or the U system key moved; the `.proven.` key no longer exists, so proven mail shows as "none". The narrow query and its `bareEmail` comparison are unchanged since round 2, where R2C.1 was green (the query only adds `messageId` to the select). |
| reviewer `probe-cf11-review-mail` | 11/12 | 12/12 — RA.2 now ✅ (0/30 stored): RA.1 already sent 150 thread-only replies citing the same OUT mail, so that mail's T message bucket (100/h) is full and the CC participant's replies citing it are dropped by design |
| reviewer `probe-cf11-review-keys` | 8/9 | 8/9 — RK.6 = RV-4 (unchanged) |
| hunt `probe-hunt3` (uncommitted copy) | — | S1.2/S1.3/S1.6 green · S1.5 by design (as round 2) · X1.1 = H3-2 |

### Round 3 verification (`run-verify.sh` label v4; finished 2026-10-02 03:06 UTC)
| check | result |
|---|---|
| `pnpm typecheck` (5 GB heap) | exit 0 |
| probe-cf11 keys · contains · mail · r2 (`--skip=R2`) · r3 | 14/14 · 12/12 · 24/24 · 11/11 · 14/14 |
| reviewer probes review-r2 · review-mail · review-keys | 7/8 (R2C.1 instrumentation) · 12/12 · 8/9 (RK.6 = RV-4) |
| probe-hunt3 | S1.2/S1.3/S1.6 green · S1.5 by design |
| probe-cf2 · probe-cf2-review-r2 | 36/36 · 8/10 (Q3 `genuineOverSender: stored` by design · Q6.2 stale, red at base) |
| probe-cf8-mobile · actions · review | 8/8 · 9/9 · 17/19 (X1.1, X2 no longer reproduce, by design) |
| probe-cf4-ci · probe-cf4-contains | 12/12 · evidence (exit 0) |
| QC2: probe-cf5 · probe-cf5-r2 · rv-cf5 · rv-cf5-r2 | 22/22 · 14/14 · 32/32 · 16/16 |
| qc-crm-c2.5 · c2.6 · c1.6 · qc-webhook | 105/105 · 87/87 · 79/79 · 15/15 |
| qc-acc-v2-contact-modal · import | 96/96 · 114/114 |
| QC2: qc-account-api-webhooks · write-settings | 22/22 · 39/39 |
| docs --check ×4 | exit 0 |
| fitness (QC3 env) · (no env) | 42/42 · 42/42 |

### Round 3 not verified
- Attachment and link-fetch cost under a flood at the new caps (bounded by count only — RV-7).
- The display-name / upper-case recipient form proving thread proof was not re-run with new instrumentation (R2C.1 cannot see the new keys). The comparison code is unchanged from round 2, where it passed.
- Real serverless memory; browser render.


## Round 4 (review round 3 `crm-C5.5-fix8-review.md` "Round 3" — NOT MERGEABLE on RV-8; RV-6 closed)

### RV-8 HIGH — V/T system buckets fillable by an attacker's own provable mailboxes · FIXED (light-sender lane, as ruled)
- **Light-sender lane (V and T only).** A sender's first `CRM_INBOUND_LIGHT_SENDER_PER_HOUR` = 10 mails in the hour are counted in the class system bucket but can never be dropped by it.
  - "The sender's count" is the count returned by that class's sender bucket, which is always the first step. The key is the normalised sender, so no extra query is needed.
  - Only senders already above 10/h in that hour can be dropped by the class system bucket.
  - The sender (100/h), V/D domain (300/h) and T per-Message-ID (100/h) buckets still apply to everyone.
  - If the counter fails (`count` undefined), the mail is let through, the same fail-open as the limiter itself.
- **New V per-domain bucket:** 300/h per From domain, except the free-mail list. Key `crm.email.in.dom.v.<sys>.<h>`, same mechanism as D.
- **System-bucket audit for V/T:** the first drop of the window is audited once, via a dedupe bucket `crm.email.in.notice.audit-system-<v|t>.<sys>`. Count = limit + 1 can be reached by a light sender whose mail is not dropped, so it cannot mark the first drop. The owner notice stays ≤ 1/h per system per class.
- **Bound.**
  - An attacker holding k (mailbox, our-mail) pairs gets at most **system cap + 10·k** mails/h in that class: the system bucket admits at most its cap, plus each of its k senders' first 10.
  - Also: ≤ 100/h per sender, ≤ 100/h per our OUT mail (T), and ≤ 300/h per non-free domain (V).
  - No genuine customer who sends ≤ 10 replies/hour can be starved by the class system bucket. She can still be limited by her own sender bucket (100/h) or by the per-Message-ID / domain bucket of the mail she replies to (residuals below).
  - Concretely, with P14 unset (today): 10 attacker pairs × 100 = 1,000 stored. The customer's 1st…10th replies are stored and her 11th is dropped, because the T system bucket is full (probe B.1).
  - With P14 set: 20 attacker mailboxes on one DMARC domain × 100 → 300 stored (V domain bucket). The customer's V reply is stored (A.1).
- **Sender-key variants cannot multiply the lane:** `+tag`, case and (r4) Gmail dots are folded into one key, so one mailbox gets one allowance (L.2).

### RV-9 LOW — one free-mail list · FIXED
`CRM_INBOUND_FREE_MAIL_DOMAINS` is now the module's `FREE_MAIL_DOMAINS` from `companies-shared.ts` (the same object). It adds hotmail.co.th, msn.com, mac.com, aol.com and gmx.com (F.1/F.2). The reviewer suggested further domains (outlook.co.th, live.co.th, yahoo.co.uk, qq.com, 163.com, naver.com, yandex.com, mail.ru). They were not added: that list also decides company-domain matching and the staff-domain rule (C5.4-E), so extending it is an owner/product call. Listed as a follow-up.

### Normalisation (bucket key only)
`inboundSenderBucketAddr` = lower-case → cut the local part at the first `+` → for gmail.com / googlemail.com also remove dots from the local part. Attribution, contact matching, thread proof (exact `bareEmail` equality) and stored addresses are unchanged. Dots stay significant on every other domain (L.3).

### Residuals (accepted, stated)
- **(e) Count-then-drop.** Sender, domain and message buckets are incremented before a later step drops the mail. A pair-holder of a customer's thread (the customer, CC co-recipients, anyone the mail was forwarded to) can push that customer's **T** sender bucket to 100 for the hour by sending forged thread-only mail in her name. This is narrower than base, where anyone could do it through the all-mail sender bucket. With P14 set, her own replies are class V (separate buckets) and unaffected. Same for the T per-Message-ID bucket: holders of one of our mails can exhaust that mail's 100/h.
- **Light lane above the cap:** each provable sender adds up to 10 mails/h beyond the class cap (the `+10·k` term). k grows only by one shop-sent mail per mailbox.
- **D has no light lane** (ruling: V and T only). A D flood can drop new authenticated non-reply mail for the hour; it cannot touch V, T or U.
- **RV-4** (kanban page revokes any key of the shop) still ships with hotfix/apiv1-scope 201d371a.

### Final bucket table (round 4)
| class | evidence | per sender (key = lower-case mailbox, `+tag` cut, Gmail dots removed) | extra bucket | per system | light lane |
|---|---|---|---|---|---|
| V verified reply | DMARC proof AND thread proof | 100/h | 300/h per From domain (non-free-mail) | 2,000/h | first 10/h per sender never dropped by the system bucket |
| D DMARC only | DMARC proof, no thread proof | 100/h | 300/h per From domain (non-free-mail) | 1,000/h | — |
| T thread only | thread proof, no DMARC proof | 100/h | 100/h per referenced OUT Message-ID (shared) | 1,000/h | first 10/h per sender never dropped by the system bucket |
| U unproven | neither | 100/h (fix2 key) | — | 1,000/h (fix2 key) | — |
Free-mail list = `FREE_MAIL_DOMAINS` (companies-shared). P14 unset ⇒ only T and U exist. Per-system worst case (RV-7, C6 debt): 5,000 mails/h at the system caps, plus the light-lane term 10·(number of distinct provable V/T senders).

### Final `ingestInbound` step order (round 4)
1. Cap envelope (fix5) → CRM recipient key → loop header → system/settings → v1 / disabled → duplicate Message-ID (`select id`).
2. `fromAddr` → `fromProof` (pure parse of the capped A-R; false when the env is unset) → refs (capped) → one narrow query (OUT, this tenant + system, ≤ 100 ids, ≤ 50 rows, `messageId/toAddrs/ccAddrs`) → `threadProofAny` + `proofMessageId` → class V/D/T/U.
3. Buckets of that class only, in order: sender (normalised; its count feeds the light lane) → domain (V/D, non-free) or message (T) → system (V/T: light senders counted but not dropped). First trip/drop: audit + deduped owner notice → drop `rate_limited` (200, no row).
4. Full `parent` row (`findFirst`, newest referenced) → fix2 `threadProof` (reply effects only).
5. Reply-To, auto, subject → staff / override / verified-domain lookups → `unverifiedShopFrom` → direction → `bcc_capture_off`.
6. HTML/text caps + sanitise.
7. Attribution (contact / company / stranger lead) → `routing` flags (`unverifiedFrom` for every IN mail without `fromProof`).
8. Tx: row + activity + `crm.email.received` → attachments → reply effects (`parent` OUT + (`fromProof` ∨ `threadProof`)) → replied notice → copy-in.

### Round 4 RED → GREEN
| probe | 3123f37e (round 3) | round 4 |
|---|---|---|
| `probe-cf11-r4` (new: B = reviewer R3B.1 · A = R3A.1 · L light-lane boundary + Gmail/`+tag`/case variants + dots only for Gmail · F free-mail parity, hotmail.co.th, D/U without lane, notices, pre-bucket reads) | 7/14 — B.1 A.1 L.1 L.2 L.3 F.1 F.2 | 14/14 |
| `probe-cf11-r3` | 14/14 | 14/14 (F.1 expects the new `dom.v` key; F.2/H.1 preset the customer's V sender bucket to 10 so the V-system-full check exercises a heavy sender) |
| reviewer `probe-cf11-review-r3` | 8/10 (reviewer, at 3123f37e) | **10/10**. R3B.1 ✅: after 1,000/1,000 attacker mail, the customer's reply to our quote is stored. R3A.1 ✅: 300/2,000 stored, V system bucket 300, the customer's V reply stored. R3C.1 ✅. INFO-R3F: the lists now differ in neither direction. INFO-R3D/R3D.2: the Gmail dot variants now hit ONE D sender bucket (count 0 vs 2, both stored); the probe's label text still says "separate" |
| reviewer `probe-cf11-review-r2` · `-mail` · `-keys` | 7/8 · 12/12 · 8/9 | unchanged: 7/8 (R2C.1 instrumentation, as in round 3) · 12/12 · 8/9 (RK.6 = RV-4) |
| hunt `probe-hunt3` (uncommitted copy) | — | S1.2/S1.3/S1.6 green · S1.5 by design · X1.1 = H3-2 |

### Round 4 verification (`run-verify.sh` label v5; finished 2026-10-02 06:02 UTC — label v5 stopped after qc-crm-c2.6 by a quota pause; the remaining steps were run as label v6 on the same unchanged tree)
| check | result |
|---|---|
| `pnpm typecheck` (5 GB heap, v5) | exit 0 |
| probe-cf11 keys · contains · mail · r2 (`--skip=R2`) · r3 · r4 | 14/14 · 12/12 · 24/24 · 11/11 · 14/14 · 14/14 |
| reviewer review-r3 · review-r2 · review-mail · review-keys | 10/10 · 7/8 (R2C.1 instrumentation) · 12/12 · 8/9 (RK.6 = RV-4) |
| probe-hunt3 | S1.2/S1.3/S1.6 green · S1.5 by design |
| probe-cf2 · probe-cf2-review-r2 | 36/36 · 8/10 (Q3 by design · Q6.2 stale, red at base) |
| probe-cf8-mobile · actions · review | 8/8 · 9/9 · 17/19 (X1.1, X2 no longer reproduce, by design) |
| probe-cf4-ci · probe-cf4-contains | 12/12 · evidence (exit 0) |
| QC2: probe-cf5 · probe-cf5-r2 · rv-cf5 · rv-cf5-r2 | 22/22 · 14/14 · 32/32 · 16/16 |
| qc-crm-c2.5 · c2.6 (v5) · c1.6 (v6) · qc-webhook (v6) | 105/105 · 87/87 · 79/79 · 15/15 |
| qc-acc-v2-contact-modal · import (v6) | 96/96 · 114/114 |
| QC2: qc-account-api-webhooks · write-settings (v6) | 22/22 · 39/39 |
| docs --check ×4 (v6) | exit 0 |
| fitness (QC3 env) · (no env) (v6) | 42/42 · 42/42 |

### Round 4 not verified
- The automation path that creates pairs end to end (public form → rule → OUT row); the probes insert OUT rows directly, as the reviewer did.
- Attachment and link-fetch cost at the caps (RV-7, C6 debt). Real serverless memory. Browser render.

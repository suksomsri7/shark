# crm-C5.5-fix2 — hunter 2a (portal + inbound mail) minus sanitizer

Worktree `/root/projects/shark-crm-cf2` · base 8cf86985 (session/crm) · DB QC3 only · probe `scripts/pending/cf2/probe-cf2.mts` (28 checks, own throwaway tenant, CLEAN 0).

## State
- [x] probe RED on untouched tree: 3/28 (only A0.1 premise, D1.3 control, CLEAN pass) — `scripts/pending/cf2/probe-cf2.red.log`
- [x] A · B · C · D · E implemented → probe GREEN 28/28 (`/tmp/cf2-logs/probe-g2.log`)
- [x] typecheck exit 0 (`/tmp/cf2-logs/typecheck-2.log`)
- [x] regression reg1 done (summary `scripts/pending/cf2/reg1.summary`, logs `/tmp/cf2-logs/reg1-*.log`) · final commit + push wip/crm-cf2

## A — wildcard-safe case-insensitive equality (2a-5 · 2a-6)
Helper `src/lib/core/ci-equals.ts`: `likeEscape()` (`\` `%` `_` → `\`-escaped; Postgres default LIKE escape is `\`, value is a bound parameter) + `ciEquals(v)` = `{ equals: likeEscape(v), mode: "insensitive" }`. Proven on QC3 (probe A0): raw form matches `vic_tim-` → `vic.tim-` and `%@qc.invalid` → ≥3 rows (premise); `ciEquals` gives 0 for `_`/`%`/`\`-variant, the exact address in other case → the row, a stored literal `50%_off\x-…` in other case → itself, Thai local part → itself, Thai `_` look-alike → 0.
Portal additionally re-checks `normEmail(row.email) === target` after the query (independent of Prisma's SQL).
Fitness **F15** (pattern of F12): F15.1 no raw `{ equals: …, mode: "insensitive" }` in `src/` outside core/ci-equals.ts except the named OWED list (account lane) · F15.2 ratchet: an OWED entry that is fixed must be removed.

| site | before (what an attacker could do) | probe |
|---|---|---|
| crm/portal.ts `contactsByTarget` (OTP isKnown + resolveAccess) | **account takeover (v2)**: register real mailbox `vic_tim@hotmail.com`, request OTP at `/b/<slug>/login` → code mailed to the attacker → session of contact `vic.tim@`'s portal access (quotes accept/reject, invoices, pay links, files, contacts). `%` too. RED: both got the victim's session | A1 |
| crm/portal.ts `loginWithLine` (no invite, ×2 lines: type + OR) | same takeover via a LINE account whose verified e-mail is the look-alike | A2 |
| crm/emails.ts staff by From (`membership.user.email`) | after P14: attacker's genuine DMARC-passing `sta_ff@` mailbox stored as OUT "sent by staff `sta.ff@`" on a customer timeline; before P14: look-alike treated as staff claim (unverifiedShopFrom + stranger-lead suppression). RED: OUT sentById=staff | A3 |
| crm/emails.ts staff by `CrmEmailUserSetting.fromAddr` | same as above for per-user From overrides (same code path, covered by A3 code, not separately probed) | (A3) |
| crm/emails.ts setUserSetting "address is a contact" | harmless false refusal (`sa_les@` refused because contact `sa.les@` exists) | A4 |
| crm/companies.ts `companyByEmailDomain` | forged From `x@dom_corp.co.th` / `x@%` filed a stranger's mail (and its activity) on another company (customer From is unauthenticated) | A5.1 |
| crm/companies.ts industry filter (Prisma path **and** SQL path `list-sql`, companies.ts `ILIKE ${industry}`) | harmless filter widening | A5.2 |
| crm/companies.ts `matchByExactName` (call-card company match) | name `%` matched the oldest company ⇒ call card linked to an arbitrary company; names containing `\` never matched themselves (bug) | A5.3 |
| crm/contacts.ts `duplicateHits` (create/update dedupe · bridge lead FORM/EMAIL) | a public form/e-mail lead `vic_tim@` silently merged into contact `vic.tim@` (activity + submission on the wrong person) | A6 |
| crm/service.ts `findContactsForLink` | account "same person?" block suggested the wrong CRM contact (dedupe hint) | A7 |
| **member/service.ts `findCustomersForLink` — PROD-LIVE** | same wrong-person hint for members (`%@domain` matched) — staff-facing suggestion, no auto-merge | A8 |
| **platform/kanban-email-in.ts `senderMemberId` — PROD-LIVE** | mail to a board from look-alike `sta_ff@` was assigned to staff `sta.ff@` and lost the "จาก: <sender>" line ⇒ outsider mail disguised as internal | A9 |

OWED by the account lane (not touched — `account/**` belongs to another lane), exact replacement `import { ciEquals } from "@/lib/core/ci-equals"`:
- `account/product.ts:479` `{ name: { equals: name, mode: "insensitive" } }` → `{ name: ciEquals(name) }`
- `account/product.ts:480` `{ sku: { equals: sku, mode: "insensitive" } }` → `{ sku: ciEquals(sku) }`
- `account/service.ts:886` `{ name: { equals: name, mode: "insensitive" } }` → `{ name: ciEquals(name) }`
- `account/service.ts:1139` `name: { equals: name, mode: "insensitive" }` → `name: ciEquals(name)`
(then delete their keys from `OWED` in fitness F15.)

**ORACLE-EDIT needed**: `platform/kanban-email-in.ts` is sha-pinned by `qc-crm-c2.5.mts` C2.5-U.5 (`SHA_BOARD_IN` = e0402e8f…) — the prod-live fix changes the file ⇒ C2.5-U.5 RED by design. Request: update `SHA_BOARD_IN` to the new sha (value in the regression section). The pin's intent ("C2.5 must not change the v1 board path") is unaffected by a later security card.

## B — copy loop (2a-1)
- `cleanAddrPatch(…, { outsideShark: true })` for shop + per-user `copyToAddr` and `replyToAddr`: any `@shark.in.th` address (`isSystemMailAddress` — covers `crm+…` own/other shop, board `งาน+`/`tasks+`, `<slug>@`) ⇒ VALIDATION. (Reply-To included: a CUSTOM Reply-To into another shop's `crm+` would file this shop's customer replies in another tenant.)
- runtime guards for rows saved before the check: `routingFor` skips SHARK copy targets (OUT BCC copies); inbound copyIn skips SHARK targets and subjects already carrying the copy prefix.
- copy mail carries `Auto-Submitted: auto-forwarded` + `X-SHARK-Loop: crm-copy`; `ingestInbound` drops any mail with `X-SHARK-Loop` before touching the DB (`reason: "loop"`, still 200).
- probe B1 (6 SHARK forms refused for shop + user, outside accepted) · B2 (headers) · B3 (loop marker dropped, no row, no re-copy; ordinary mail stored+copied) · B4 (legacy `crm+` copy target ⇒ stored, no copy).

## C — forged customer From (2a-2)
- `fromProof = authResultPass(headers, domainOf(From))` now computed for every From (same parser as the staff path, C5.4-F; needs `CRM_INBOUND_AUTHSERV_ID` = P14).
- IN + contact + no proof ⇒ `routing.unverifiedFrom = true` (existing JSON column, no schema change; kept when the attachment step rewrites `routing`) · `crm.email.received` payload = `{ emailId, threadKey, unverifiedFrom: true }` (no contactId/companyId/dealId ⇒ scoring finds no contact, webhooks/automation get no customer attribution).
- Reply effects (repliedAt · `crm.email.replied` · stop sequences) need `fromProof` OR **thread proof** = cites a Message-ID of our OUT mail (already required) AND From ∈ that mail's To/Cc.
- Thread DTO `unverifiedFrom` (also true for the older `unverifiedShopFrom`) → badge "ไม่ยืนยันผู้ส่ง" in `EmailThread.tsx` (span, not interactive ⇒ no registry row).
- Unchanged on purpose: the mail is still stored on the contact's timeline; "customer replied" staff notification still sent (C5.3-L6-M4 expects it for a header-less mail).
- **DECISION for the controller**: the brief says an unproven From must never stop sequences. Taken literally that REDs C2.5-S4.1 / S10.10 (customer reply without A-R must stop the sequence) and, until P14, no genuine reply would ever stop a sequence (shop keeps auto-mailing customers who answered). Builder kept reply effects for thread-proven mail (holder of our Message-ID who IS the recipient). Residual: the recipient's own mailbox provider / a CC'd party forging the recipient's address can still mark "replied". Tighten = ORACLE-EDIT on C2.5-S4.1/S10.10 (add A-R) + flip one line.
- probe C1 (flag, DTO, anonymous event, score 0) · C2 (K2 forging with K1's Message-ID ⇒ no replied, K2 sequence ACTIVE) · C3 (A-R pass ⇒ no flag, contactId on event, +10, repliedAt, one replied event, sequence STOPPED).

## D — rate cap (2a-7) · re-invite (2a-8)
- `CRM_INBOUND_RATE_LIMITS` (emails-shared): per sender 100/h per system · per system 1000/h. `checkRateLimitDbMany([sender, system], { chain: true })` after the duplicate check, before sanitizing/contact work. Over ⇒ `{ ok: true, handled: false, reason: "rate_limited" }` (route 200, no bounce) + ONE `crm.email.inbound.rate_limited` audit per bucket window (count = limit+1; sender bucket logs a 12-hex sender hash, never the address). Fail-open like every other bucket.
- re-invite: `invite()` revokes the access's live `PortalSession`s in the same tx; audit `crm.portal.invite.after.sessionsRevoked`.
- probe D1.1/D1.2/D1.3 · D2.

## E — companies gate (it4 F1) · aria-current (F2)
- `/companies` page: `if (!crmCan(actor, "crm.company.read")) notFound()` right after the actor (before listCompanies) and its tabs get `(k) => crmCan(actor, k)` · `/companies/[companyId]`: same guard before getCompany360 · `nav.ts` companies entry `perm: "crm.company.read"` · drawer (`app/layout.tsx`): บริษัท behind crm.company.read, เพิ่มบริษัท behind crm.company.create (the /new page already 404s without it ⇒ was a dead link).
- `DealBoard.tsx` stage tabs: `aria-current="true"` on the active tab.
- Button-registry consequences for the it4 lane (no edit of `scripts/crm-ui-inventory.json` here):
  1. `/companies` for nok/thana (no crm.company.read) is now **404** — the run2 rows already moved to `hiddenFor nok/thana` by the it4 sweep become genuine hidden passes (no more hiddenLeak). Vacuity guard: groups that expect visible rows for nok/thana on `/companies` would read as `vacuous` — there should be none after the sweep; check PAGE_STATUS = 404 for nok/thana chunk 1.
  2. `/companies/[companyId]` for nok/thana: already 404 (companyWhere) — unchanged.
  3. Module tab "บริษัท" (no testid, ModuleTabs) is now shown only on `/companies` itself (the only page passing `can`), like อีเมล/รายงาน; hidden on every other CRM page for every role. No registry rows exist for ModuleTabs links.
  4. Drawer: นก/ธนา lose บริษัท (and เพิ่มบริษัท where no crm.company.create; manager/owner keep both).
  5. `deal-stage-tab-*` rows can now assert the selected state via `aria-current="true"` (S9's "first tab = active" workaround can read the attribute).

## Regression reg1 (QC3 · CRM_V2_SWITCH=all · `scripts/pending/cf2/run-regress.sh`)
- probe-cf2 28/28 · probe-cd2 28/28 · probe-cd2-review 8/8 · probe-c54e 20/20 · probe-c54e-r2 23/23
- qc-crm c1.3 89/89 · c1.4 110/110 · c1.5 103/103 · c1.7 57/57 · c1.11 66/66 · c2.2 73/73 · c2.6 87/87 · c3.5 (portal) 67/67 · c3.9 49/49 · c0.2 27/27
- **c2.5 104/105** — only C2.5-U.5 (sha pin of kanban-email-in.ts, `boardSha=14058708…`; pixel route, board answer shape, no CrmEmailMessage all still pass) ⇒ ORACLE-EDIT: `SHA_BOARD_IN = "1405870825b2e9f1ab0d35321650861584fc384ca91ab96b6fdf21aa3d1bf496"`. S4.1 / S10.10 (reply effects) GREEN under the thread-proof ruling.
- kanban k3.3 14/15 · k3.9 12/13 — the reds are K3.3-S9.2 / K3.9-S4.2 "≥N screenshots in .qc-shots/kanban/…" (fresh worktree has no .qc-shots; ENV, not code). k3.9 mail-to-board behaviour checks all green.
- qc-acc-v2-contact-modal 96/96 (suggestLinks → member/crm findXForLink) · qc-forms-notify 9/9
- docs: gen-crm --check exit 0 · gen-member/kanban/account --check exit 1 = "`.claude/skills/shark-*-api/references/endpoints.md` 0 bytes on disk" — `.claude/skills/` does not exist in this worktree (not tracked); no registry touched by this card ⇒ ENV.
- typecheck exit 0 · fitness 35/35 (with env) · fitness 35/35 (`env -u DATABASE_URL -u DIRECT_URL`) incl. new F15.1/F15.2. F15 regex positive control: matches `email: { equals: keys.email.trim(), mode: "insensitive" }`, ignores the type `{ equals: string; mode: "insensitive" }`, `ciEquals(x)` and `contains`.

## Follow-ups
- account lane: 4 sites (above) + drop OWED in F15.
- ORACLE-EDIT C2.5-U.5 sha.
- Controller decision on C reply-effects (thread proof vs literal A-R only) — and whether "customer replied" notification should also be suppressed for unverified From (C5.3-L6-M4 currently requires it for a header-less mail).
- P14 (`CRM_INBOUND_AUTHSERV_ID`) — until set, every customer mail is `unverifiedFrom` ⇒ no inbound-mail scoring and anonymous `crm.email.received` for all customers.
- Contacts/companies list `contains` search still passes `%`/`_` as wildcards (search widening, tenant-scoped, out of scope).

## ROUND 2 (review `crm-C5.5-fix2-review.md` · MERGEABLE AFTER RV2-1..5) — not pushed (owner decision pending)
Every finding re-checked against the code first: all 7 confirmed as described (no disagreement). Probe extended with R2-1..R2-7: RED on the round-1 code **28/35** (`scripts/pending/cf2/probe-cf2.r2-red.log`, R2-1..R2-7 all red, round-1 checks green) → GREEN **35/35** (`/tmp/cf2-logs/probe-r2-g1.log`).
- **RV2-1** copy guard (`ingestInbound`): no copy when From = the copy mailbox, when the subject contains the copy prefix anywhere, or when `auto` (Auto-Submitted ≠ no / bulk / auto local parts). R2-1: 4-hop "FW:" forwarder chain ⇒ exactly 1 copy; auto + mid-subject prefix ⇒ none.
- **RV2-2** `unverifiedFrom = IN && !fromProof && (contact || companyId)` ⇒ domain-matched forged mail flagged + badge; received event drops companyId. R2-2 (+ positive: A-R pass on the same domain keeps companyId, no flag).
- **RV2-3** ruling implemented: sender bucket stays first (all mail); the parent (layer-1 threading) lookup moved up so `threadProof` is known early; the **system** bucket is checked/counted only for mail with neither A-R proof nor thread proof, and BEFORE sanitizing/contact work. First trip per window ⇒ one audit line + one `AppNotification` per OWNER (existing per-recipient path, same as deal quote notices; no new channel). Accept-and-drop (200) unchanged. R2-3: bucket at 1000 ⇒ random senders dropped, A-R contact mail and thread reply stored, bucket count unchanged by them, 1 owner notification, 1 audit.
- **RV2-4** `ThreadListItem.unverifiedFrom` (any message of the thread flagged; SQL reads `routing` jsonb) ⇒ inbox rows render the same badge; `GET /emails/threads` + AI tool `crm_email_thread` pass it through (summary + tool hint explain it; thread op summary too) · docs regenerated (`docs/api/CRM-API.md`, `--check` exit 0). There is no separate contact/company e-mail list in the UI (contact/company lists = `listThreads` with contactId/companyId over REST, covered). R2-4.
- **RV2-5** `invite()` on a **re-invite** (the (company, contact) access already exists — read in the same tx) revokes every live `PortalSession` of the contact in the tenant (`crmContactId`), same tx. Deviation from the literal ruling: a FIRST invite into a new company does not sign the contact out elsewhere — the literal form turned C3.5 red 34/67 (S1.5 switcher + S2–S4 hold an A session while B is invited; reg2 log `/tmp/cf2-logs/reg2-qc-crm-c3.5.log`) and a first invite is not the "lost phone" flow. After the refinement c3.5 67/67. R2-5: B session + the A session obtained by B→A switch are dead after re-inviting A; switch afterwards refused (positive: switch worked before).
- **F15 hardening (RV2-6)**: scanner `scripts/lib/ci-equals-scan.mjs` (comment stripper that respects strings/templates + brace-matched enclosing object): flags any object whose `mode` is insensitive (`"…"`/`'…'`/`QueryMode.insensitive`/a file-visible identifier) and has no search key (contains/startsWith/endsWith/search) — catches all 9 reviewer spellings + multi-line + mode variable; skips type literals, comments, strings. F15.0 self-test (12 must-hit, 8 must-not-hit) · F15.1 OWED keyed by file + exact line text + count (a new `name:` site in account/service.ts fails) · F15.2 ratchet. `portal.ts` type annotation now `ReturnType<typeof ciEquals>`. R2-6. The reviewer's R9 now errors "RAW_RE not found" (the regex it extracts no longer exists) — superseded by F15.0/R2-6.
- **Nav (RV2-7)** fixed once at module level: new `src/app/app/sys/[id]/crm/layout.tsx` computes the actor's nav keys (`CRM_NAV_PERMS` = keys referenced by CRM tabs only) and provides them via `src/components/nav-perms.tsx`; `crmNavItems(id)` without `can` now returns perm-gated tabs tagged with `perm`, and the shared `ModuleTabs` filters with `visibleTabs(items, perms)` (no provider = hidden, fail closed; other modules unaffected — their items carry no perm). No page edited. Effect: บริษัท / อีเมล / รายงาน tabs now show on all ~38 CRM pages for anyone holding the key (OWNER/MANAGER by rule; STAFF by key) and stay hidden without it. R2-7 checks 7 pages × OWNER / MANAGER / STAFF±key / no provider.
- it4 registry consequence (update to point 3 above): ModuleTabs links have no testid ⇒ no rows; อีเมล/รายงาน tabs reappear on every CRM page for roles with the keys (they were hidden everywhere except 2 pages before this card too).
- Kept per reviewer + controller: thread-proof reply effects (RV2-8 residual) and the "customer replied" notification.
- Not done (reported): `kanban/archive.ts:8` wrong comment ("Prisma contains escapes % / _") — kanban lane; RV2-10 unsalted sender hash (LOW); RV2-11 P14 launch prerequisite; `.claude/skills/shark-crm-api/references/endpoints.md` in the main checkout must be regenerated after merge (gitignored, generator writes it).
- kanban-email-in.ts NOT changed this round (sha still 14058708…).

### ROUND 2 verification
| run | result | log |
|---|---|---|
| probe-cf2 (RED on round-1 code) | 28/35 (R2-1..R2-7 red) | `scripts/pending/cf2/probe-cf2.r2-red.log` |
| probe-cf2 (final) | 35/35 · CLEAN 0 | `/tmp/cf2-logs/reg3-probe.log` |
| reviewer probe-cf2-review | 7/12: R3 R4 R7 R8 now NOT reproduced (fixed) · R5 R6 still reproduced (accepted residuals) · R9 errors "RAW_RE not found" (superseded by F15.0/R2-6) | `/tmp/cf2-logs/review-probe-r2.log` |
| typecheck | exit 0 | `/tmp/cf2-logs/typecheck-r2b.log` |
| fitness env / no env | 36/36 · 36/36 (F15.0-15.2) | `/tmp/cf2-logs/fitness-r2.log` · `fitness-noenv-r2.log` |
| gen-crm-api-docs --check | exit 0 (docs regenerated: 4 lines) | — |
| c2.5 | 104/105 — only C2.5-U.5 sha pin (unchanged ORACLE-EDIT, file not touched this round) | `/tmp/cf2-logs/reg2-qc-crm-c2.5.log` |
| c3.5 portal | 67/67 (after the re-invite refinement; 34/67 with the literal contact-wide revoke) | `/tmp/cf2-logs/reg3-c3.5.log` |
| c1.7 · c1.11 · c2.6 · c3.9 · c0.2 · forms-notify | 57/57 · 66/66 · 87/87 · 49/49 · 27/27 · 9/9 | `/tmp/cf2-logs/reg2-*.log` |

## ROUND 3 (re-review R2b-1 · tip 519ec451)
- **R2b-1 verified, then fixed**: `switchCompany` checked the source session (`session(token)`) before `mintPortalSession` inserted the new one; the re-invite's contact-wide `updateMany` (READ COMMITTED) could miss a session inserted after its snapshot. Reproduced here: probe R3-1 RED on 519ec451 code **1/24 survivors** (the 0 ms trial · `scripts/pending/cf2/probe-cf2.r3-red.log`).
- Fix: `lockPortalContactInTx(tx, tenantId, contactId)` = `pg_advisory_xact_lock(hashtext('crm.portal.contact:<tenant>:<contact>'))` (portal.ts), taken FIRST in both transactions:
  - `invite()`: lock → read "re-invite?" → upsert access → contact-wide revoke (re-invite only) → audit.
  - `switchCompany()`: new optional `mintPortalSession(id, meta, { inTx })` hook (member/customer-session.ts; omitted = byte-identical behaviour) runs inside the mint transaction: lock → re-read the source session live (tokenHash, not revoked, not expired) else NOT_FOUND → insert session → update access.lastLoginAt.
  - Lock order (comment in code): contact advisory lock → row locks, identical in both. The only other portal advisory lock (`onPortalEvent`, key `<tenant>:<sourceRef>`) is never held together with this one; `revoke()` / portal-identity revocations take no advisory lock and wait on no lock held by these transactions ⇒ no cycle.
  - Outcome: either the switch commits first and its new session is killed by the re-invite, or the re-invite commits first and the switch sees its source revoked and is refused.
- Probe R3-1 (24 trials, plain concurrency, 0–12 ms staggers both orders): GREEN **0 survivors**, 22/24 switches minted (2 correctly refused), every re-invite ok. probe-cf2 **36/36**.
- **R2b-3 (timeline badge) — skipped**: the EMAIL activity is written by `activities.recordSystemActivityInTx` and rendered by the contact/company 360 timeline components — files outside this card (not touched in rounds 1–3). Carrying the flag needs activities.ts + timeline UI ⇒ follow-up.
- Not chased (controller registers as debt): 6 extra F15 spellings, sub-domain attribution, stale tab keys, flood cost.
- Checks (`/tmp/cf2-logs/reg4-*.log`, summary `scripts/pending/cf2/reg4.summary`): probe-cf2 36/36 · reviewer probe-cf2-review-r2 10/10 · c3.5 67/67 · c2.5 104/105 (C2.5-U.5 sha pin only; kanban-email-in.ts untouched) · typecheck exit 0 · fitness 36/36 env + 36/36 no-env · gen-crm-api-docs --check exit 0.

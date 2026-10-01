# crm-C5.5-fix2 — hunter 2a (portal + inbound mail) minus sanitizer

Worktree `/root/projects/shark-crm-cf2` · base 8cf86985 (session/crm) · DB QC3 only · probe `scripts/pending/cf2/probe-cf2.mts` (28 checks, own throwaway tenant, CLEAN 0).

## State
- [x] probe RED on untouched tree: 3/28 (only A0.1 premise, D1.3 control, CLEAN pass) — `scripts/pending/cf2/probe-cf2.red.log`
- [x] A · B · C · D · E implemented → probe GREEN 28/28 (`/tmp/cf2-logs/probe-g2.log`)
- [x] typecheck exit 0 (`/tmp/cf2-logs/typecheck-2.log`)
- [ ] fitness · regression · final commit + push wip/crm-cf2

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

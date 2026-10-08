# crm-C5.5-fix2: independent security review

Reviewed `git diff 8cf86985 ef0491fa` on `wip/crm-cf2` (worktree `/root/projects/shark-crm-cf2`). I did not build this card.
Probe: `scripts/pending/cf2/review/probe-cf2-review.mts`, run on QC3 under the gate lock. Log: `scripts/pending/cf2/review/probe-cf2-review.r1.log`, 13/13. A ✅ on R3/R4/R5/R7/R8/R9 means the finding was reproduced. The probe used a throwaway tenant and CLEAN reported 0 rows and 0 buckets left.

## Verdict: MERGEABLE AFTER RV2-1 · RV2-2 · RV2-3 · RV2-4 · RV2-5

- No BLOCKER and no HIGH.
- The main fix is correct and complete for `src/` outside `account/**`: wildcard-safe lookups, plus the portal account-takeover fix (A).
- E is correct. Re-invite revocation is atomic.
- Five MED gaps remain where the card's own claims (B, C, D) do not hold end to end. Each fix is a few lines.

| sev | count |
|---|---|
| BLOCKER | 0 |
| HIGH | 0 |
| MED | 5 |
| LOW | 7 |

## Findings

| id | sev | where | finding | reproduced |
|---|---|---|---|---|
| RV2-1 | MED | `crm/emails.ts:2607` (copyIn guard) | **The copy loop survives a header-stripping forwarder.** Take a copy target outside SHARK, such as `sales@shop.com` with an Exchange or Outlook "forward" rule to `crm+key@`. Each forward is a new message: subject `FW: [สำเนาจดหมายเข้า] …`, From = the copy mailbox, and our X- headers are not carried. The guard is `subject.startsWith(prefix)`, so every hop is stored and copied again. The subject grows `[สำเนา…] FW: [สำเนา…] FW: …` until truncated. The only bound is the 100/h per-sender cap, so up to about 100 rows and 100 provider sends per hour per chain. | YES, R3: 4 hops gave 5 copies and 5 rows. Positive control: a redirect that keeps `X-SHARK-Loop` is dropped. |
| RV2-2 | MED | `crm/emails.ts:2464` (`unverifiedFrom = direction==="IN" && !!contact && !fromProof`) | **Forged From on a company e-mail domain is not flagged.** The case is `ceo@<customer's emailDomain>` with no matching contact and no A-R. The mail is filed on the company via `companyByEmailDomain` with `matchedBy` DOMAIN. It gets no `routing.unverifiedFrom`, no badge, and `crm.email.received` carries `companyId` (sent to webhooks). This is the business-e-mail-compromise case the badge exists for ("แจ้งเปลี่ยนบัญชีรับเงิน" from the customer's domain). Claim C ("unproven mail flagged, event carries no contact/company/deal") fails for this branch. | YES, R4: `routing=null badge=false evt={companyId}`. Positive control: a forged existing-contact From is flagged. |
| RV2-3 | MED | `crm/emails.ts:2289-2311` (`inboundRateLimited`) | **The per-system cap lets an attacker take down all inbound mail.** The sender key is a hash of the unauthenticated From, so rotating it costs nothing and the per-sender cap only stops accidental loops. 1001 mails/h with random Froms fill the system bucket. Every later mail is then accepted and dropped for the rest of the fixed window: genuine customers, DMARC-pass mail and thread replies alike. There is no row, no bounce and no retry, and the only trace is one audit line nobody is told about. Repeating hourly keeps the shop's CRM inbox down indefinitely for the cost of about 1000 mails/h. The `crm+key@` address is in the Reply-To of every CRM mail, so any recipient knows it. Counter atomicity is fine: one `INSERT … ON CONFLICT` CTE statement, and exactly one request sees `limit+1`, which gives exactly one audit line. | YES, R7: with the system bucket at 1000, an A-R-verified mail from a known contact returned `rate_limited`. |
| RV2-4 | MED | `crm/emails.ts:2680-2750` (`listThreads` / `ThreadListItem`) · `api/ops/emails.ts:74` (AI tool `crm_email_thread`) · `notify-senders.ts:96` | **The unverified badge only appears on the thread page.** The inbox list, contact and company e-mail lists, REST `GET /emails/threads` and the assistant tool `crm_email_thread` (subject plus snippet) show forged mail with no flag. The "ลูกค้าตอบกลับแล้ว" notification is generic text that links to the contact (`refType CrmContact`), not to the thread. Ruling (b) was conditional on the badge being visible where staff read the mail; today it is only met once they open the thread. | Code read. Positive: thread DTO and badge confirmed (builder C1, my R5 row flag). |
| RV2-5 | MED | `crm/portal.ts:1116` (`invite`) | **Re-invite does not sign out the old device for a multi-company contact.** It revokes sessions of that one access only (`portalAccessId: row.id`). A contact with accesses at companies A and B goes through a "lost phone, re-send invite of A" flow. The thief's session on B stays live, and `switchCompany(B→A)` mints a fresh session on A, which is APPROVE in the probe (quotes, invoices, pay links). The claim's wording holds, but its intent ("old device signed out") does not. | YES, R8: A killed (positive control), B alive, switch back to A gives a live session. |
| RV2-6 | LOW | `scripts/fitness.mts:833-848` (F15) | **F15 is easy to bypass and its allowlist is keyed too loosely.** The regex misses 9 realistic spellings: shorthand `{ equals, mode: "insensitive" }`, swapped order, single quotes, a comma inside the value (`v.slice(0, 40)`), a quoted key, `Prisma.QueryMode.insensitive`, a variable object, a spread, and a `//` inside a string on the same line. OWED is keyed `file:field`, so both `account/service.ts` sites share one key and a NEW `name: {equals, mode}` added to that file passes silently. | YES, R9.1 and R9.2 (offline; regex taken from fitness.mts at runtime). |
| RV2-7 | LOW | `crm/nav.ts:30` + 28 pages calling `crmNavItems(id)` without `can` | **Navigation regression for every role.** The "บริษัท" module tab now shows only on `/companies` itself and disappears from every other CRM page, for OWNER too. This includes `/companies/new` and `/companies/duplicates`. It is the same existing pattern as อีเมล/รายงาน, but it is a visible regression for a primary module. The builder noted it. | Code read. |
| RV2-8 | LOW (accepted) | `crm/emails.ts:2584-2596` | **Residual of ruling (a).** A holder of our Message-ID (a CC'd party, or anyone the recipient forwarded to) can forge From = the To recipient without A-R. The effects: the OUT row gets repliedAt, `crm.email.replied` carries `contactId`, all of that contact's stop-on-reply sequences stop, and staff get a notification. The stored mail itself is badged. | YES, R5. |
| RV2-9 | LOW (pre-existing) | `ci-equals.ts` / `portal.ts:240` | **Unicode case folding.** QC3 runs collation `C.UTF-8`, where ILIKE folds `U+212A` (Kelvin sign) to `k`. JS `toLowerCase` agrees, so the portal re-check also accepts `Kate@x.th` for `kate@x.th`. For `İ` the DB matches but JS does not, so the re-check correctly narrows. Exploiting this needs a deliverable EAI mailbox on the victim's own domain, so it is not practical. The behaviour is identical to before. | Measured, R2.2. |
| RV2-10 | LOW | `emails.ts:2290,2309` | The sender hash is an **unsalted** sha256 of `from:<addr>`: 32 hex in the global `ChatRateBucket` key and 12 hex in the tenant audit. It can be reversed with a dictionary of known addresses. Low impact. | Code read. |
| RV2-11 | LOW (ops) | `emails.ts:2160-2161` | **With `CRM_INBOUND_AUTHSERV_ID` unset (P14 not done), every contact-matched customer mail is affected:** it is `unverifiedFrom` (badge on all mail, which invites badge fatigue), and `crm.email.received` is anonymous. The default score rule "ตอบอีเมลกลับ +10" (`templates/business/central.ts:22`) therefore never fires for any shop. Sequences still stop through thread proof. P14 must be a launch prerequisite of CRM v2 e-mail. | Code read; builder C1 runs with the env unset. |
| RV2-12 | LOW (pre-existing, out of scope) | `list-sql.ts:83`, `emails.ts:2705`, Prisma `contains` | Prisma 7 `contains` with mode insensitive is `ILIKE ('%' \|\| $n \|\| '%')` with the raw param (`q_l` is not escaped), proven by R1.2. Tenant-scoped search widening only. The comment in `kanban/archive.ts:8` ("Prisma contains escapes % / _") is **wrong**; `kanban/search.ts:19` is right. | YES, R1.2. |

## Answers

### 1. Completeness of A

**Remaining sites.** After the card, a grep of `src/` finds `mode: "insensitive"` without `contains` only at the 4 `account/**` OWED sites:
- `product.ts:479-480`: product duplicate hint.
- `service.ts:886`: accounting-contact duplicate check.
- `service.ts:1139`: `findContactForImport`, used by CSV import (`import-core.ts:137/324/339`). A `%` or `_` contact name in a staff CSV links the document to the wrong accounting contact. This is staff-authored data, so the debt is correctly scoped as LOW.

**Raw SQL.** Every `lower(…)` comparison is `=` or `= ANY` (`privacy.ts`, `emails.ts:2028` contactByAddress, `:3288`). No `QueryMode`, `startsWith`/`endsWith` insensitive, or raw `ILIKE` equality remains. The only remaining `ILIKE` uses are `contains` searches (RV2-12) and `objects.ts:1063`, which escapes properly with `ESCAPE '\\'`. Nothing was missed and nothing was wrongly allowlisted.

**Escape correctness, proven on QC3 (R1).** Prisma 7.8 (pg adapter) emits `"email" ILIKE $2` with **no ESCAPE clause** for `equals + insensitive`, so Postgres' default escape `\` applies. `standard_conforming_strings=on`, and the value is a bound param, so there is no second unescape. `ciEquals` sends `sq\_l-…` (R1.1). Postgres semantics (R2.1), all as expected:
- `a\b`, a trailing `\`, `\\` and `%` match themselves literally under `likeEscape`.
- `50Xoff` does not match `50%off`.
- Thai case-folded domains match.
- The **old** raw form errored (`22025 LIKE pattern must not end with escape character`) on a trailing `\`, which was a 500 path. `a\b` never matched itself.

**Semantics.** `ciEquals` only removes wildcard matches; same-case and other-case equality is unchanged (still ILIKE). Dedupe (`contacts.duplicateHits`, `findContactsForLink`, `findCustomersForLink`) no longer merges `a_b@` into `a.b@`. Nothing relied on wildcard behaviour; the regressions are green. Unicode folding is unchanged from before (RV2-9).

**Index use.** Before and after are the same: ILIKE on a param, so a btree index cannot be used and the filter runs within the `systemId` scan. That meets the "same as before" bar.

**Portal re-check is correct.** `normEmail = trim + toLowerCase` is applied to both the row and the target, after the query, in `contactsByTarget` (OTP request and verify) and in `loginWithLine` (`email` is already `normEmail`'d). It is an AND, so it can only narrow.

### 2. F15

It can be bypassed trivially (RV2-6). It works as a backstop against the exact historical spelling only.

**Fix:**
- Flag any object literal that contains `mode` set to `"insensitive"`, `'insensitive'` or `QueryMode.insensitive` together with `equals` within the same braces, in any order and including shorthand.
- Flag `insensitive` appearing near `equals` in `as const` objects.
- Key OWED by exact expected count per `file:field` (`{ "account/service.ts:name": 2 }`), so that a new site makes the count exceed the debt and fail.

### 3. B (copy loop)

**Shark-domain variants are blocked.** Subdomains (`x@mail.shark.in.th`) never reach CRM: `parseCrmRecipient` requires exactly `@shark.in.th`. Case is handled because `bareEmail` lowercases. A trailing dot is rejected by `CRM_EMAIL_ADDR_RE` (TLD must end in letters). Plus-addressing (`crm+…`, `งาน+`, `<slug>@`) is all refused by `isSystemMailAddress` (`endsWith("@shark.in.th")`) for both shop settings and per-user settings, for copy and Reply-To. Legacy rows are guarded at runtime.

**A non-shark forwarder is still a loop.** One that rewrites the message (FW:, new Message-ID, X- headers dropped) loops (RV2-1). Gmail-style redirect keeps headers and is dropped. The same applies to OUT BCC copies (`routingFor` copyTo, which carries no loop header) when copyMode is BOTH.

**What an outsider loses by adding `X-SHARK-Loop`.** Only their own mail (R6). A sender cannot add headers to someone else's message, and nothing else in SHARK emits that header.

**Unverified dependency.** Both `X-SHARK-Loop` detection and A-R depend on the inbound forwarder posting all headers in `data.headers` (`api/email/inbound/route.ts:99-110`). I did not check the forwarder's configuration.

### 4. C (forged customer From)

**A-R parsing and env handling.** Only an instance whose authserv-id equals `CRM_INBOUND_AUTHSERV_ID` counts, and exactly one such instance must exist (`ours.length !== 1` gives false). A sender-injected A-R claiming our id therefore makes 2 and is rejected, provided our MTA always adds its own and duplicates are not collapsed last-wins by the forwarder. That trust model comes from C5.4-F and was not re-verified here.

When the env is **unset**, `authResultPass` returns false at line 2161, so every contact-matched customer mail is `unverifiedFrom` (RV2-11).

**(a) KEEP.** The ruling is acceptable. Message-IDs are not guessable:
- Ordinary IDs are `randomBytes(12)`, 96 bits (`emails.ts:1015`).
- Keyed IDs are `sha256(systemId:idempotencyKey)`, where sequence keys contain enrollment ids that outsiders never see.

Only the recipient, CC'd parties, people the recipient forwarded to, and their mail providers hold an ID. What such a holder gains (R5, RV2-8): mark the OUT row replied, emit `crm.email.replied` with contactId (webhooks only; `crm.email.*` events are not automation triggers per `src/lib/automation/labels.ts`, and `replied` is not a score-bridge event), stop **all** stop-on-reply sequences of that recipient, and trigger one staff notification. The forged mail itself is badged. That is about what the recipient could do by replying. Nothing reaches data, money or sessions.

**(b) KEEP, conditionally.** The thread page shows the badge (`EmailThread.tsx:94`, DTO in `getThread`). The notification carries no content to badge; it is the generic `customer.replied` text with a link to the contact. Unverified content cannot trigger automations: email events are not in `AUTOMATION_EVENTS`; the received event is anonymous, so there is no score; there are no CRM auto-replies; and `crm_draft_email` does not read inbound bodies.

However, the badge is missing from the inbox, contact and company lists, the REST list, and the AI tool `crm_email_thread`, which hands forged snippets to the assistant unflagged (RV2-4). The domain-matched branch is never flagged at all (RV2-2). KEEP holds only once RV2-2 and RV2-4 are fixed.

**(c) VERIFIED.**
- `sha256(git show ef0491fa:src/lib/platform/kanban-email-in.ts)` = `1405870825b2e9f1ab0d35321650861584fc384ca91ab96b6fdf21aa3d1bf496`, matching the proposed `SHA_BOARD_IN`.
- The base sha is `e0402e8f…`, the currently pinned value.
- The diff vs base is +4/−1: the `ciEquals` import, 2 comment lines, and `where: { email: ciEquals(fromEmail) }`. That is only the A9 fix.
- ORACLE-EDIT C2.5-U.5 is approved from my side.

### 5. D (rate cap and re-invite)

**Cap key.** `crm.email.in.from.<systemId>.<sha256("from:"+From)[0:32]>`. From is attacker-chosen, so it can be rotated for free.

**DoS trade-off, stated.** Yes, an attacker can deny a shop all CRM inbound mail for the rest of the hour, repeatedly (RV2-3). Before this card a flood cost rows and stranger-leads but lost nothing. Now the shop silently loses genuine mail.

**Atomicity.** Fine: a single-statement upsert CTE, chained, fail-open.

**Re-invite.** Sessions are revoked inside the same `$transaction` as the hash rotation, and the audit records `sessionsRevoked`. The scope is too narrow (RV2-5).

### 6. E (companies gate)

All company data paths go through `visibleWhere`, which key-gates on `READ_KEY[entity]` (`visibility.ts:407`). The only `keyGate: false` is an ACTIVITY report (`reports.ts:180`). This covers list and record (now also page-gated), REST ops, `visibleIdsAmong`, objects, and kanban link chips (`crmHidden` derived from `visibleIdsAmong`). The page gates come before `listCompanies` and `getCompany360`. The drawer links are gated. I found no route returning company rows without `crm.company.read`. Company names embedded in contact or deal DTOs are by design and were not re-audited.

### 7. Regressions (from `/tmp/cf2-logs/reg1-*.log`)

- **c2.5:** the only ❌ is C2.5-U.5. Its ACTUAL shows `pixelSha` OK, `pixel=200`, `board=200 {"ok":false,"created":false}` (the oracle checks only status 200 and that `created` is present), `rows=0`, `v1Hits=-`. The failing term is `boardSha=1405870825b2`.
- **k3.3 / k3.9:** the only ❌ are K3.3-S9.2 and K3.9-S4.2, "ภาพจริง ≥N ใบใน .qc-shots/…", with `act 0`. `.qc-shots/` does not exist in this worktree.
- **docs:** member, kanban and account fail on `.claude/skills/*/references/endpoints.md` at 0 bytes. `.claude/` is gitignored (`.gitignore:43`) and exists only in the main checkout. docs-crm passes.
- **Blank summary lines:** `qc-acc-v2-contact-modal` (96 pass, 0 fail) and `qc-forms-notify` (9/9) are green; their summary lines are blank only because the grep pattern did not match.
- **Verdict:** these are not masking real failures.
- **Coverage gap:** the it4 button-registry sweep and `crm-ui-inventory` were not re-run after the nav and drawer change (RV2-7).

### 8. Other checks

- **Tenant isolation:** OK. Buckets are keyed by systemId, the revoke runs after the tenant check, and the loop drop happens before any DB access.
- **Error paths:** OK. Rate-limit and audit failures are caught and fail open, and `ingestInbound` still never throws.
- **PII:** RV2-10.
- **Performance:** one extra CTE statement per inbound mail; `ciEquals` costs the same as before.
- **Hygiene:** `scripts/crm-expected.json` and `scripts/member-expected.json` are modified but uncommitted in the worktree (QC3 seed outputs). Do not commit them.

## Must-fix for the builder

1. **RV2-1.** In `ingestInbound`'s copyIn guard:
   - Also skip when `fromAddr === copyIn` (mail from the copy mailbox itself).
   - Skip when `subject.includes(CRM_COPY_IN_SUBJECT_PREFIX)` (not only `startsWith`).
   - Skip when `auto`.
   - Add a probe: FW-prefixed, header-less mail from the copy mailbox gives no copy; an ordinary customer mail still gives one copy.
2. **RV2-2.**
   - Change line 2464 to `const unverifiedFrom = direction === "IN" && !fromProof && (!!contact || !!companyId);`. That flags domain-matched mail, gives it the badge, and makes `emitEmailEvent` drop `companyId`.
   - Add a probe in the shape of R4.
3. **RV2-3.**
   - Mail that is proven must not be counted against or dropped by the **system** bucket. Proven means `fromProof`, or a thread proof (`parent` OUT plus From ∈ its To/Cc). To get there, move the system-bucket check after the parent lookup, or skip it for proven mail.
   - On the first trip of the system bucket per window, notify the owner (one `notifyStaff`), not just write an audit line.
   - Add a probe in the shape of R7, with a thread-proven reply stored while the system bucket is full.
   - (If the controller instead accepts the DoS as-is, record that decision explicitly in the wo-note.)
4. **RV2-4.**
   - Add `unverifiedFrom` to `ThreadListItem`: true if any IN message of the thread has the flag, or at least the latest one. That covers the inbox and contact/company lists, `GET /emails/threads`, and the AI tool.
   - Render the same badge in the list rows.
5. **RV2-5.**
   - In `invite()`, revoke all live sessions of the contact in this system, mirroring `portal-identity.ts:14`: `tx.portalSession.updateMany({ where: { tenantId, crmContactId: contactId, revokedAt: null }, … })`. Alternatively revoke sessions of every access of that contact.
   - Add a probe in the shape of R8.

Should-fix (LOW, can be a follow-up card): RV2-6 (F15 regex and OWED counts), RV2-7 (pass `can` to `crmNavItems` on every CRM page, or move ModuleTabs into a CRM layout), and the comment in `kanban/archive.ts:8`.

## Not checked

- The inbound forwarder's real header serialization: whether all headers are passed and how duplicate `Authentication-Results` headers are joined. This decides whether X-SHARK-Loop and A-R work in production.
- P14 MTA behaviour (stripping sender-supplied A-R claiming our authserv-id).
- Member journeys keyed on `crm.email.*`.
- Every company-name embedding in contact and deal DTOs.
- The it4 UI inventory.
- The 4 OWED `account/**` sites beyond reading them.
- Prisma behaviour on databases other than QC3. QC3 is `C.UTF-8`; prod collation was not checked, and Unicode folding (RV2-9) depends on it.

---

# ROUND 2 REVIEW (d326e6fe on be3a6495)

Probe: `scripts/pending/cf2/review/probe-cf2-review-r2.mts`, run on QC3 under the gate lock.
- Final log: `probe-cf2-review-r2.r2.log`, 10/10, CLEAN 0.
- First log: `.r1.log`, 9/10. The only red was my own Q3 assertion: it counted the "customer replied" notification as a cap notice. I fixed the count by title and re-ran.

I did not repair the round-1 probe; its R9 is superseded by Q6.

## Verdict: MERGEABLE AFTER R2b-1

- RV2-1 to RV2-5 are closed and I could not re-break them.
- RV2-6 and RV2-7 are closed; the remaining F15 misses are LOW.
- One new MED: a race that still lets the lost device keep a portal session (R2b-1, reproduced).
- If the controller accepts R2b-1 as a tracked follow-up instead, the card is MERGEABLE.

## RV2 status

| id | status | evidence |
|---|---|---|
| RV2-1 copy loop | **CLOSED** | `emails.ts` copy guard. Probe Q1: copy target `Sales+CRM@Shop-….Test` (mixed case, plus-address). Every forward-back variant was stored with **0** further copies: `Fwd:` from the box in upper case, `ส่งต่อ:` from a second-hop mailbox, `RE: FW: Fwd:` stacking, `[EXTERNAL] FW:` from a relay, and a display-name From. Positive control: an ordinary customer mail gives 1 copy. `bareEmail` lowercases both sides; the guard's `includes` survives any added prefix, and the prefix sits at the start of the copy subject so 300-char truncation cannot remove it. |
| RV2-2 domain forged From | **CLOSED** | `emails.ts:2501`. Q2: a mixed-case `CEO@Corp-….TEST` is filed on the company with `unverifiedFrom` set, and the event has no companyId. Positive control: A-R pass keeps companyId and sets no flag. A sub-domain (`ceo@mail.<domain>`) matches no company and no contact. It is stored unattributed, so there is nothing to badge (see R2b-4). |
| RV2-3 system-cap DoS | **CLOSED** | Q3, with the system bucket at 1000: random From, a guessed Message-ID (same format as `newRfcId`), a valid Message-ID from a non-recipient, the attacker's **own** inbound Message-ID (parent is IN, so no proof), and From = our inbox are all dropped. The genuine recipient's reply is stored and leaves the bucket unchanged (1006→1006). The exempt path is still killed at the per-sender cap (100/h). There is exactly **one** owner notice (title/body contain no address, only the `/app/sys/<id>/crm/emails` path) and one audit line, because `count === limit+1` is atomic. The exemption uses the **same** `threadProof` variable as the reply effects (`emails.ts:2436`: parent is OUT and From ∈ its To/Cc). Message-IDs stay unguessable (96-bit random). Thread proof cannot be bought cheaply: a real recipient can bypass the system bucket, but only from its own address, which the per-sender cap still bounds. |
| RV2-4 badge in lists/AI | **CLOSED** | Q4: the `listThreads` item has `unverifiedFrom: true`. The REST list and the AI tool `crm_email_thread` return those items as-is (assistant masking copies `{...it}` and only masks subject/snippet). The inbox renders the badge. Residual LOW, R2b-3: the contact timeline activity row shows the subject only. |
| RV2-5 re-invite scope | **CLOSED for every deterministic ordering**, race open (R2b-1) | Q5 (a): device on B, re-invite A kills B and the B→A switch is refused. (b): re-invite B kills A. (c): device switched B→A first, then re-invite B kills both, so there are 0 live sessions. (f): staff *revoke* of A leaves B alive but the switch into A is refused. |
| RV2-6 F15 | **CLOSED** (residual LOW, R2b-2) | Q6.2: no false positive on the current tree (0 bad, all 4 OWED present). A NEW `name:` site in `account/service.ts` fails. A duplicated copy of an OWED line fails as over-count. Fitness is 36/36 with and without env (`/tmp/cf2-logs/fitness*-r2.log`). |
| RV2-7 nav | **CLOSED** | See point 4 below. |

## Answers to the round-2 questions

1. **Re-break attempts.** See the table. None of RV2-1 to RV2-4 broke. The owner notice is not a spam vector: it fires once per system per hour window, and only OWNERs receive it (≤20).

2. **The RV2-5 deviation (first invite does not sign out).** I **ACCEPT** it. A first invite is not a lost-device signal. Q5 (e) confirms the consequence: a device holding A can `switchCompany` into a newly invited company C. That follows from the multi-company model and is not a regression, because before this card nothing was revoked at all. The correct staff response to a lost device is a re-invite, which now kills every session of that contact.

   **The race ordering is NOT closed (R2b-1).** I ran `switchCompany(B→A, revokeCurrent)` concurrently with `invite(A)` (re-invite): **1 of 6** trials left a live session, the 0 ms start in both runs. The cause is a time-of-check/time-of-use gap. `switchCompany` checks the source session (`session(token)`), and `mintPortalSession` inserts the new session afterwards. The re-invite's `updateMany` runs at READ COMMITTED and does not see a session inserted after its snapshot. A thief looping switches at the 30/min limit would be inside that window a noticeable fraction of the time.

3. **F15.**
   - My 8 extra spellings: `satisfies` casts and helper-return objects are caught.
   - Still missed: `["mode"]:` computed key, ternary `cond ? "default" : "insensitive"`, parenthesised `("insensitive")`, an enum alias (`const QM = Prisma.QueryMode; QM.insensitive`), an imported constant, and `equals` combined with `contains: ""` in the same object (R2b-2, LOW; all are rare or contrived).
   - A new `account/service.ts` site fails, and the tree has no false positives.

4. **Nav.**
   - **Other modules are unchanged.** Q7.1: tab builders for member, inventory, hr, pos, point, reward, coupon, chat, marketing and meeting carry no `perm`, and `visibleTabs(items, [])` returns every tab. The unit pages under `u/[unitSlug]` pass literal items without `perm`. `crmNavItems` is used only under `/crm`.
   - **No query storm.** The layout uses `requireTenant` → `getAuth`, which is wrapped in React `cache()`, so it adds no DB query per request beyond what the page already does. `crmCan` is a pure in-memory check.
   - **Next.js rules.** I checked this version's `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/layout.md`. An async server layout with a `params` Promise is allowed. Passing data down through a client context provider is the documented way around "layouts cannot pass data to children". Its caveat applies: layouts do not re-render on navigation, so the tab keys are as stale as the last full load (R2b-5, LOW). Page gates still decide access.
   - **อีเมล/รายงาน.** These are not newly hidden. Before, they were hidden on every page that did not pass `can` (most pages) and shown by key on the 2 pages that did. Now they are shown by key everywhere. The tab perms equal the pages' own `notFound()` gates: `/emails` uses `crm.email.read` (`emails/page.tsx:42`) and `/reports` uses `crm.report.view` (`reports/page.tsx:20`). Q7.2: with no keys or no provider those tabs are hidden (fail closed); with the key they are shown.

5. **Regressions** (`/tmp/cf2-logs/`).
   - `reg2-qc-crm-c2.5.log`: 104/105. The only ❌ is C2.5-U.5, the `boardSha=14…` pin, as before.
   - `reg3-c3.5.log`: 67/67.
   - `reg2-qc-crm-c3.5.log` (34/67) is the documented run with the literal contact-wide revoke and is superseded.
   - File times: `emails.ts` 12:43 < c2.5 run 12:46; `portal.ts` 12:59 < reg3 c3.5 13:05. So the green runs are on the final code. Typecheck r2b passes (exit 0).
   - Not re-run this round: c1.3, c1.4, c1.5, c2.2, the cd2/c54e probes, k3.9, contact-modal. Their code paths are untouched except the inbound reordering, which c2.5 covers. The it4 UI inventory was not re-run after the nav change.

6. **Other changes in the round-2 diff.**
   - **Tenant isolation:** OK. Owners are selected by `tenantId` and buckets are keyed by systemId.
   - **PII:** none in the owner notice; the audit line is unchanged (RV2-10 still open, LOW).
   - **Performance:** the earlier parent lookup is one query on unique `messageId` (`in` 2×refs), scoped by systemId. The system bucket now comes after the staff, override and verified-domain lookups and the parent lookup, so flood mail over the cap costs about 5 indexed queries each instead of 1 (R2b-6, LOW). Sanitising now runs after the cap, which is good.

## New findings

| id | sev | where | finding | reproduced |
|---|---|---|---|---|
| R2b-1 | MED | `portal.ts` `switchCompany` (session check, then `mintPortalSession`) vs `invite()` re-invite revoke | **A race lets the lost device keep a session.** If a switch is in flight when staff re-invite, the session minted on the target access survives the contact-wide revoke (TOCTOU, explained under answer 2). | YES, Q5(d): 1 of 6 trials, 0 ms, in both runs |
| R2b-2 | LOW | `scripts/lib/ci-equals-scan.mjs` | **F15 still misses 6 spellings:** computed `["mode"]`, ternary, parenthesised value, enum alias, imported constant, and `equals` together with `contains: ""`. | YES, Q6.1 |
| R2b-3 | LOW | `activities.recordSystemActivityInTx` (EMAIL activity, title = subject) | The contact or company timeline shows forged mail as a plain EMAIL activity with no flag. Opening the thread shows the badge. | YES, Q4 |
| R2b-4 | LOW (info) | `companyByEmailDomain` exact domain | Mail from a sub-domain or look-alike domain is stored unattributed (no contact, no company), so it gets no badge. Staff see "ยังไม่รู้ว่าเป็นของใคร". Not a regression. | YES, Q2 |
| R2b-5 | LOW (info) | `crm/layout.tsx` | Layouts do not re-render on client navigation, so a permission change shows in the tabs only after a full reload. Page gates are unaffected. | doc + code read |
| R2b-6 | LOW | `emails.ts` `ingestInbound` | Over-cap flood mail now pays about 5 indexed lookups before being dropped (staff, override, verified domains ×2, parent). This is bounded by the per-sender bucket per From, but From rotates freely. | code read |

## Must-fix

1. **R2b-1.** Serialise switch and re-invite per contact.
   - Inside `switchCompany`, take `pg_advisory_xact_lock(<hash of tenantId:contactId>)` in one transaction that re-reads the source session as live and inserts the new session.
   - Take the same lock in `invite()` before the contact-wide `updateMany`.
   - The two then serialise: either the new session exists before the revoke and is killed by it, or the source is already revoked and the switch is refused.
   - A cheaper alternative: after minting, re-check the source with `getPortalSession(token)` and revoke the new session if the source is dead. That narrows the window but does not close it.
   - Add a probe in the shape of Q5(d) with ≥10 trials and 0 survivors.
   - Alternatively, the controller records an explicit acceptance as a tracked LOW follow-up.

Should-fix (follow-up): R2b-2 (extend the scanner or accept as documented), R2b-3 (flag EMAIL activities from unverified mail), R2b-6 (optional). Carried over: RV2-10, RV2-11 (P14 launch prerequisite), and the wrong comment at `kanban/archive.ts:8`.

---

# ROUND 3 CHECK (3bd78c23 on 519ec451): only R2b-1 changed

Probe: `scripts/pending/cf2/review/probe-cf2-review-r3.mts`, run on QC3 under the gate lock. Final log: `probe-cf2-review-r3.r3.log`, 3/3, CLEAN 0.

The earlier `.r1` and `.r2` runs reported reds that were my own bugs:
- `.r1`: the switch and invite results were swapped in the invite-first order.
- `.r2`: the errors it printed under "invite" were therefore the expected switch refusals.
- In both runs: 0 survivors and no real invite error.

## (1) The race is closed in both orders

44 trials ran: 22 with the switch started first and the re-invite delayed 0 to 60 ms, and 22 with the re-invite started first and the switch delayed. **0 live sessions** of the contact remained after every trial. Every re-invite succeeded, with no deadlock or timeout. Both serialisation outcomes occurred:
- `sw0`: the switch committed first, and its new session was then killed by the re-invite.
- `x0`: the re-invite committed first, and the switch was refused with the generic not-found.

Positive control: an uncontended B→A switch still gives exactly 1 live session, on A. The builder's own run is 0 of 24 (`/tmp/cf2-logs/probe-r3-g1.log`, 36/36). My r2 probe also shows `survived=0` in `reg4`.

## (2) The `inTx` hook in `mintPortalSession`

**Default path.** The only change is an optional third parameter and `if (opts.inTx) await opts.inTx(tx);` as the first statement of the existing `$transaction`. Without it, the function runs the same statements in the same order. Callers:
- `portal.ts:201`: invite accept (link).
- `portal.ts:336`: LINE with invite.
- `portal.ts:354`: LINE without invite.
- `customer-session.ts:795`: OTP verify, through `verifyPortalOtp`.
- `portal.ts:382`: `switchCompany`, the only caller that passes `inTx`.

All of the first four use the default path.

**Visibility before commit.** The session row is inserted inside the interactive transaction and is invisible to other connections until commit. The token string is generated before the transaction but is only *returned* after `$transaction` resolves.

**Rollback.** A rolled-back transaction (lock, then the re-check throws `nf()`) leaves no session row. `switchCompany` catches the error and throws not-found, so no token or cookie reaches the client. The cookie is set by the route only from a returned token.

## (3) Lock order and collisions

**Lock order.** Both transactions take `pg_advisory_xact_lock` as their **first** statement:
- `invite`: then the access upsert, the session `updateMany` and the audit insert.
- switch: then the session re-check, the session insert and the `crmPortalAccess.lastLoginAt` update.

Every taker acquires the advisory key before any row lock, and nothing that holds a row lock waits on this key. So no cycle with other row locks is possible.

**Collisions.** `hashtext` is 32-bit; the rest of the codebase uses `hashtextextended(…, 0)`, which is 64-bit (R3c-1, LOW style). A collision with another tenant's key, or with another advisory user's key, only adds waiting. Every holder of a colliding key either takes it first in its own transaction or holds no lock this path needs, so correctness and deadlock-freedom are unaffected.

## (4) Pooler safety

It is the transaction-scoped `pg_advisory_xact_lock`, issued through `tx.$executeRaw` inside interactive Prisma transactions (pg adapter, one connection for the whole callback). It is released at commit or rollback and cannot leak across pooled connections. No session-level `pg_advisory_lock` is used.

## (5) Regressions (`/tmp/cf2-logs/reg4.summary` and logs)

- c3.5: 67/67.
- c2.5: 104/105; the only ❌ is the U.5 sha pin (ORACLE-EDIT already approved).
- Fitness 36/36 with and without env; typecheck exit 0; docs-crm OK.
- Reviewer r2 probe: 10/10, race `survived=0`.
- probe-cf2: 36/36 (`probe-r3-g1.log`, 13:30).
- Timing: `portal.ts` and `customer-session.ts` mtime 13:29 precedes every reg4 run.

## New finding

| id | sev | finding |
|---|---|---|
| R3c-1 | LOW (style) | `lockPortalContactInTx` uses `hashtext` (int4) where the codebase convention is `hashtextextended(…, 0)` (int8). This only means more collisions, which cost extra waiting; there is no correctness impact. Optional alignment. |

## FINAL VERDICT for the whole card: **MERGEABLE**

- **No must-fix remaining.** All BLOCKER, HIGH and MED findings from rounds 1 to 3 (RV2-1 to RV2-5, R2b-1) are closed and were re-tested.
- **ORACLE-EDIT C2.5-U.5:** `SHA_BOARD_IN = 1405870825b2e9f1ab0d35321650861584fc384ca91ab96b6fdf21aa3d1bf496`. `kanban-email-in.ts` is unchanged since round 1.
- **Tracked LOW and ops follow-ups:**
  - RV2-10: unsalted sender hash.
  - RV2-11: P14 / `CRM_INBOUND_AUTHSERV_ID` is a launch prerequisite.
  - RV2-12: the wrong `kanban/archive.ts:8` comment.
  - R2b-2: the remaining F15 spellings.
  - R2b-3: no flag on timeline EMAIL activities.
  - R2b-4 and R2b-5: info only.
  - R2b-6: flood cost.
  - R3c-1: `hashtext` style.
  - The 4 OWED `account/**` sites belong to the account lane.
  - The inbound forwarder's header serialisation is unverified; it decides whether X-SHARK-Loop and A-R work in production.

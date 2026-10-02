# crm-C5.5-fix14 — authz-sweep S4: member card in the account contact profile without a member viewer (MED, on prod)

Worktree `/root/projects/shark-crm-cd2` · branch `wip/crm-cf19` from f5e6485b (session/crm) · not pushed.
Source: `crm-C5.5-authz-sweep.md` row S4 + its review (`crm-C5.5-authz-sweep-review.md` "S4 — judgement").

## The gap
`contact-profile.ts loadConnections` → `member/service.ts findCustomerByPartyId(tenantId, memberSystemId, partyId)` had no viewer. The "links" tab of the
account contact profile showed the **member card** (`#<memberCode> · ระดับ <tier>`, linked flag, "แยก" action) and the **POS card** (visit count, total
in-store spend — read from the same Customer row) to anyone who could open the profile:
- web: the 360 page (`account/contacts/[contactId]/page.tsx`) and `loadContactProfileAction` (`account/actions.ts`) — key `account.contact.manage`;
- account REST `GET /contacts/{id}` (op `contacts.get`, key `account.doc.view`; the card collapses to `links.member: true|false` there — an existence signal).
The sibling `findCustomersForLink` and the CRM card on the same tab already fail closed (C5.4 H2 / L1-M3).

## Rule chosen
Same rule and same viewer as the sibling `findCustomersForLink` (the `MemberLinkViewer` contract of C5.4 H2), no new mechanism:
- `findCustomerByPartyId(..., viewer?: MemberLinkViewer)`: `undefined`/`null` ⇒ `null` · actor without `canReadMember` ⇒ `null` (no query) ·
  actor ⇒ only rows the actor can see (`visibleCustomerIds` = `canReadMember` + `briefFor` branch visibility) and the oldest visible one is returned ·
  `"system"` ⇒ unchanged behaviour (declared system work).
  Fast path: an actor that is not branch-scoped (`!isUnitScoped`, not CUSTOMER) returns the first row without calling `briefFor` — this is exactly the
  first line of `assertVisible` (the gate inside `briefFor`) and keeps the OWNER/all-branch links tab at its old SQL count (see "Query budget").
- `loadConnections` passes the viewer it already receives (`ContactProfileInput.crmViewer`, the field name kept — `contact-links.ts` already documents
  that it is the viewer for both CRM and member). Every user-reachable caller already passes it: page.tsx (`crmViewerOfSession`), `loadContactProfileAction`
  (`crmViewerOfSession`), REST `contacts.get` (`crmViewerOfApi`). No caller change was needed.
- Denied ⇒ the member card and the POS card are byte-identical to "no member linked" (`linked:false`, `detail:null`, `actionLabel/actionHref:null`;
  REST `links.member:false`). `available` (= the shop has a member system) is unchanged — it says nothing about this contact.
- API keys: the account API's existing scope model (`crmViewerOfApi`): a key is a STAFF viewer holding exactly its scopes; `canReadMember` for a key needs
  some `member.*` scope (audit H1). Since S1 the account page refuses to mint account keys with `member.*` scopes, so **no key minted through the UI sees
  the member card over account REST any more**. A key holding `member.customer.read` (only mintable through the service / pre-S1 crafted form) does (CF19-E4).
  → owner question Q1.
- Doc comment of `ContactProfileInput.crmViewer` corrected: "not passed = system" was wrong already for the CRM card (`contactScope(undefined)` = closed).

## Callers swept (findCustomerByPartyId and similar by-party / by-contact member lookups without a viewer)
| # | lookup · caller | exposure | disposition |
|---|---|---|---|
| 1 | `findCustomerByPartyId` ← `contact-profile.ts loadConnections` (page, `loadContactProfileAction`, REST `contacts.get`) — its only caller (`grep` src + scripts) | member code/tier + POS visits/spend | **FIXED** (this card) |
| 2 | `listPartyIdsWithCustomer` ← `contacts-list.ts loadContactsSidebar` (account contacts page "สมาชิก" filter/count + per-row member badge; REST `contacts.list` `badges.member`, the filter `group=source:member`) | existence: which account contacts are members, and how many | **FIXED in round 2** (was: NOT FIXED — listed). The viewer is already at hand (`loadContactsSidebar(ctx, meter, crmViewer)` passes it to the CRM twin `listPartyIdsWithContact`), so the fix is one argument + the same guard; but `qc-acc-v2-contacts` P3.1 (`loadContactsSidebar(ctx)` with no viewer, asserts the member count = expected) would turn red and I have no ORACLE-EDIT authorisation for it. Probe INFO line shows it live: the account-only key still gets `badges.member=true`. → controller question C1 |
| 3 | `findMemberCodesByPartyIds` ← `contact-merge.ts enrichContacts` ← `listMergeCandidates` (web merge page `memberLinkLabel` "#M-00087"; REST `contacts.merge-candidates` does NOT serialise it) | member code of merge candidates | **FIXED in round 2** (was: NOT FIXED — listed). Oracle-safe (no merge check reads the label) but the plumbing changes `listMergeCandidates`/`getMergePair` and the only regression suite (`qc-acc-v2-contact-merge`) merges seed rows and **re-seeds at the end** — forbidden on QC1. → C1 |
| 4 | `chat/service.ts getLinkedMember` (by `ChatContact.customerId`) ← `chat/inbox-actions.ts` thread view (`memberName`) and context panel; `chat/ai-suggest.ts` (member name + **phone** put into the AI prompt) | member name (and phone to the model) to chat staff without a member-read check | **NOT FIXED — listed** (chat module; the link itself is gated by `chat.customer.link`, display is not). Owner question Q2 |
| 5 | `crm/objects.ts` parent type CUSTOMER (`resolveParent…` `:339`, `resolveParentForRead` `:370`, `memberOfParent` `:1477`) — by customer **id**, no member visibility (the CONTACT/COMPANY/DEAL branches use `contactWhere`/`companyWhere`/`dealWhere`) | custom records under any member id of the shop; error text tells MERGED/CLOSED apart (existence/status oracle for a known cuid) | **NOT FIXED — listed (INFO, by id not by party).** → Q3 |
| 6 | `member-bridges.ts onCrmDealWon` (`:658` by partyId), `platform/crm-bridges/core.ts`, `crm/contacts.ts isSolePartyHolder` `:696` / merge guard `:2256`, `party/index.ts :278`, `pos/register.ts :339` | system work / integrity counts inside transactions, nothing displayed | not a gap (system callers) |
| 7 | `ai/tools.ts` member tools (`customer_search`, `customer_points`) | — | already filtered by `visibleCustomerIds` (C5.5-G1) |
| 8 | `findCustomersForLink` / `setCustomerPartyId` (account link modal, REST link-suggestions/link) | — | already viewer-gated (C5.4 H2) — re-run green (contact-modal, probe-cf2) |
No kanban code reads member rows.

## RED → GREEN (probe `scripts/pending/cf19/probe-cf19.mts`, QC2, own tenant `qc-cf19-*`, swept to 0)
World: one shop, branches A (member's home) and B, ACCOUNT + MEMBER systems, one Party linking an account contact and a member
(`M-CF19X`, GOLD, 3 visits, ฿1,234.50). Doors: the real server action `loadContactProfileAction` under a forged Next request scope with a real session
cookie (technique of probe-cf8), the 360 page's loader call (`contactProfile` + `crmViewerOfSession`, as page.tsx), and the real account REST route with
Bearer keys. Every denied DTO is compared byte-for-byte with the DTO of the same contact when **no member is linked** (customer.partyId cleared, then restored).
- RED on the base tree (src files from f5e6485b, `--write-base`): **8/15** — D1–D7 red: STAFF without a member key, STAFF limited to branch B, no viewer,
  viewer null, and the account-only key all got `#M-CF19X · ระดับ GOLD` + `ซื้อหน้าร้าน 3 ครั้ง · ฿1,234.50` (REST `links.member=true`).
  Log `scripts/pending/cf19/red-probe-cf19-r1.log` (the first RED run had a probe bug — REST envelope `requestId` compared — fixed, RED re-run; both RED runs 7 red D-checks).
- GREEN on the fix: **15/15** — D1–D7: DTO == no-member DTO, no code/tier/visits/spend/customer id/flag; E1–E3: OWNER, entitled STAFF (all branches) and
  entitled STAFF of the home branch still see the card on both web doors; E4 key with `member.customer.read` → `links.member=true`; E5 the entitled DTOs
  (`page:owner`, `page:staffEntitled`, `page:staffHomeBranch`, `rest:accmem`) are **byte-identical to the base tree** (`base-dto-r1.json`, ids normalised);
  E6 OWNER == entitled STAFF; CLEAN tenant 0 rows, users 0. Log `scripts/pending/cf19/g-probe-cf19-r1.log`. (Round 2 renamed the round-1 files with `-r1`.)

## Query budget (links tab, real SQL statements, probe INFO) — round 1; superseded by Round 2 (branch-limited STAFF now 12)
| viewer | base | fix |
|---|---|---|
| none / STAFF without member read | 12 | 11 (member query skipped) |
| OWNER / all-branch entitled | 12 | 12 |
| branch-limited entitled STAFF | 12 | **14** (`visibleCustomerIds` → `briefFor`: customers + points) |
The WO 3.4 ceiling is 12; only branch-limited entitled STAFF exceed it (+2). Not optimised: the card asked to reuse the shared helper; a lighter
visibility check (`loadVisibleMember`-style, ≤1 extra query) would be a second path. Note for the controller.

## Regression
| check | DB | result |
|---|---|---|
| `pnpm typecheck` (5 GB heap, iso + gate lock) | — | exit 0 |
| fitness no env · fitness QC2 env | — / QC2 | 42/42 · 42/42 |
| gen-{crm,account}-api-docs `--check` | — | exit 0 (123 / 199 op) |
| gen-{member,kanban}-api-docs `--check` | — | exit 1 **environmental**: `docs/api/MEMBER-API.md` / `KANBAN-API.md` match (the script reports them separately and did not); only `.claude/skills/shark-{member,kanban}-api/references/endpoints.md` are absent from this worktree (`.claude/skills/` here holds only shark-account-api; not tracked). No REST op/serializer changed ⇒ no regeneration needed |
| probe-cf19 RED (base src) → GREEN | QC2 | 8/15 → 15/15 |
| qc-acc-v2-contact-profile (edited oracle, fixed tree) | QC1 | 57/59 — reds Q8.docs 14, Q8.files 13 = pre-existing |
| qc-acc-v2-contact-profile (HEAD oracle, base tree) | QC1 | 56/59 — Q8.docs 14, Q8.files 13, Q8.links 13 (same two + links) |
| qc-acc-v2-contact-profile (HEAD oracle, fixed tree) | QC1 | 56/59 — Q7.5 red (proves the edit is needed) + the two Q8 |
| qc-account-api-read-master (REST `contacts.get` / list / link-suggestions) | QC1 | 38/38 |
| qc-acc-v2-contact-modal (findCustomersForLink / setCustomerPartyId, P5) | QC3 | 96/0 |
| probe-cf2 (A8 findCustomersForLink) | QC3 | 36/36 |
| qc-crm-c5.3 `--only=L1,L3` (C5.4 L1-M3 account↔CRM/member link probes) | QC2 | 19/19 |
| qc-account-api-write-master (own tenant; contacts write/merge-candidates) | QC2 | 44/44 |

QC1 data note: the worktree's committed `scripts/acc-v2-expected.json` belongs to a seed that no longer exists on QC1 (read-only lookup
`scripts/pending/cf19/which-seed.mts`: QC1 holds tenant `cmuk7wtu…` = the main tree's expected file; QC3 holds c19's `cmu7q814…`). For the QC1 runs the main
tree's file was copied in and completed with the two **read-only** expected generators (`acc-v2-expected-contact-profile.mts`, `acc-v2-expected-contacts.mts`
— SQL reads, write the local JSON only); no seed script ran, nothing on QC1 was rewritten. The worktree file was restored to HEAD afterwards (not committed).

## Oracle edits (ORACLE-EDIT C5.5-fix14, authorised by the controller for Q7.5 only)
`scripts/qc-acc-v2-contact-profile.mts` — 3 lines, all in Q7, each marked `// ORACLE-EDIT C5.5-fix14: …`:
1. read the seed shop's OWNER membership (`prisma.membership.findFirst({ tenantId, role: "OWNER" })`) — read only;
2. build the viewer from it (same shape as `crmViewerOfSession`);
3. the Q7 links load passes `{ crmViewer: ownerViewer }` (was: no viewer).
No assertion changed; Q8 (query budget) still loads without a viewer exactly as before. Evidence the edit is needed: the unedited oracle on the fixed tree
→ Q7.5 red (`linked:false, detail:null`) (`/tmp/cf19-logs/qc1-contact-profile-OLDORACLE.log`).

## Owner / controller questions
- **Q1 (owner)** Account REST has no scope that shows the member card any more (account keys cannot hold `member.*` since S1). Keep it closed (recommended —
  the member system has its own API and key door), or add an account-side scope (e.g. `account.contact.member-link.read`) that the member key door signs off?
- **Q2 (owner)** Chat: should the linked-member name in the inbox/context panel and the member **phone** in the AI suggestion prompt require member read
  (`canReadMember` + branch)? Recommended: name stays (chat staff need to greet the customer), phone/other fields gated.
- **Q3 (owner)** CRM custom records with a CUSTOMER parent: require member read + visibility of that member (like the CONTACT/DEAL parents)?
- **C1 (controller)** Fixing rows 2 and 3 in a follow-up needs ORACLE-EDIT authorisation for `qc-acc-v2-contacts` P3.1 (+ P11 budget if it moves) to pass
  an OWNER viewer to `loadContactsSidebar`, and a database where `qc-acc-v2-contact-merge` may re-seed (QC3 has the acc-v2 seed of c19).

## Also on prod (main 929c39ce) — NOT VERIFIED on prod, code read only
- `findCustomerByPartyId` is identical on prod (no viewer) and on prod **nothing passes a viewer at all**: prod `contact-profile.ts:596`, REST
  `contacts-read.ts:104` (`contactProfile(ctx, id, { tab: "links", base: "" })`), page.tsx:12 (`{ base }`). The viewer plumbing (`crmViewerOfSession` /
  `crmViewerOfApi`, `ContactProfileInput.crmViewer`) arrived with C5.4-A (not on prod). This fix therefore needs C5.4-A on prod (ship together, like S1);
  on prod the CRM card on the same tab is likewise ungated (L1-M3).

## Not verified
- Not run in a built app / browser; server action and route handler exercised directly (probe technique).
- `qc-acc-v2-contacts`, `qc-acc-v2-contact-merge`, `qc-acc-v2-perf` not run (unchanged code paths: sidebar/merge untouched; merge re-seeds).
- The two Q8 budget reds on QC1 (docs 14, files 13) are pre-existing (base run identical) and not investigated.
- Member suites with `.env.local` loaders not run.

## Round 2 (controller rulings on C1 and the query budget) — tip before: 4aa42ad2

### What changed
- **One gate for every by-party member read from another module** — `member/service.ts memberLinkScope(viewer)` (private, next to
  `MemberLinkViewer`/`visibleCustomerIds`): `undefined`/`null`/no `canReadMember` ⇒ `null` (no rows, no query) · `"system"` / not branch-scoped ⇒ `{}` ·
  CUSTOMER ⇒ own row only · branch-scoped ⇒ `actorScopeWhere(actor)` of `member/list.ts` — the member list page's existing predicate
  (`homeUnitId ∈ unitAccess` OR a `VISIT_SCOPE_MODULES` activity in those units = `profile.assertVisible`'s rule as a `where`). It is **not** a
  re-implementation: `list.ts` only gained `export` on that function (behaviour of the member list unchanged).
  - `findCustomerByPartyId` now = one `findFirst` with `AND [{partyId}, scope]` (round 1's `findMany` + `visibleCustomerIds`/fast path removed) ⇒
    branch-limited STAFF links tab **14 → 12** SQL statements; OWNER 12 (= base), no member read 11.
  - `listPartyIdsWithCustomer(…, viewer?)` and `findMemberCodesByPartyIds(…, viewer?)` use the same scope; fail closed.
- **Contacts list** (`contacts-list.ts loadContactsSidebar`): passes its `crmViewer` to `listPartyIdsWithCustomer`. Every membership signal derives from that
  one set (`sourceSets.member`): sidebar count `counts.source.member`, the filter `source:member` (web + REST `group=source:member`), the per-row badge
  (web + REST `badges.member`). No sort or other total uses membership (checked `listContactsPage`, `contacts-overview.ts`). Callers: contacts page
  (`crmViewerOfSession`) and REST `contacts.list` (`crmViewerOfApi`) already pass a viewer; `getContactDetail` (badges hard-coded false) and REST
  `contact-groups` (custom-group counts only) pass none ⇒ the member query is simply skipped.
- **Merge page**: `listMergeCandidates(ctx, viewer?)` → `enrichContacts(ctx, ids, viewer)` → `findMemberCodesByPartyIds(…, viewer)`; `getMergePair` takes the same
  optional viewer (no src caller today). `merge/page.tsx` passes `crmViewerOfSession(userId, auth.active)`. REST `contacts.merge-candidates` passes none
  (its view serialises only id/name/code — no member label — so nothing to gate; the query is skipped).
- Denied viewer ⇒ identical to "not a member": count 0, `source:member` empty, badge false, no `#code` label.

### RED (4aa42ad2) → GREEN — probe-cf19 extended (QC2, own tenant, swept to 0)
New fixture: a second account contact with the same phone (merge pair, reason PHONE), not linked to a member.
| id | case | 4aa42ad2 | fix |
|---|---|---|---|
| L1–L3 | contacts list (sidebar count · `source:member` page · badge) for STAFF without member key / STAFF of branch B / no viewer == "no member linked" | ❌ count 1, filter 1, badge true | ✅ |
| L4 | REST `GET /contacts` (`group=all` + `group=source:member`), account-only key | ❌ badge true, filter total 1 | ✅ |
| M1–M3 | merge candidates (`memberLinkLabel`) for STAFF without member key / branch B / no viewer == "no member linked" | ❌ `#M-CF19X` | ✅ |
| L5–L7 | OWNER / entitled STAFF / home-branch STAFF: count 1, filter = the contact, badge true, merge label `#M-CF19X` | ✅ | ✅ |
| L8 | REST list with a `member.customer.read` key: filter 1, badge true | ✅ | ✅ |
| E5 | entitled DTOs byte-identical to 4aa42ad2 (`base-dto-r2.json`): profile ×3, REST profile, list ×3, REST list, merge projection ×3 | ✅ (written) | ✅ |
| Q1 / Q2 / Q3 | links tab SQL statements ≤ 12: OWNER / no member read / branch-limited entitled STAFF | 12 / 11 / **14 ❌** | 12 / 11 / **12** ✅ |
| V1 | branch-B STAFF: no activity / a `crm` activity in B / a `pos` visit in B — the three by-party lookups agree with `visibleCustomerIds` (briefFor/assertVisible) | ❌ set/codes 1 while brief 0 | ✅ 0/0/1 for all |
| D1–D7, E1–E4, E6 | round-1 checks | ✅ | ✅ |
Totals: RED **21/30** (9 red: L1–L4, M1–M3, Q3, V1) → GREEN **30/30**. Logs `scripts/pending/cf19/red-probe-cf19-r2.log`, `g-probe-cf19-r2.log`.

### Oracle edits (round 2) — `scripts/qc-acc-v2-contacts.mts`, authorised for P3.1
3 lines just before P1, each marked `// ORACLE-EDIT C5.5-fix14:`: read the seed OWNER's membership (read only) · build the viewer · the shared
`sidebar` that P1–P3 read is loaded with `loadContactsSidebar(ctx, undefined, ownerViewer)` (was: no viewer). No assertion changed; P8/P11 loads untouched.
- The unedited oracle on the fixed tree: **P3.1 red** (0 vs 1) **and P3.2 red** (CRM 0 vs 1). P3.2 is red for the same reason and was already red before
  this card: the CRM count has been viewer-gated since C5.4 L1-M3 and the oracle never passed a viewer (my change does not touch the CRM side). The same
  viewer-plumbing edit turns both green — listed here under the controller's "same reason" clause.

### Re-runs (round 2 code)
| check | DB | result |
|---|---|---|
| typecheck | — | exit 0 |
| fitness no env · QC2 env | — / QC2 | 42/42 · 42/42 |
| docs `--check` crm · account | — | exit 0 (123 · 199 op) |
| probe-cf19 | QC2 | 21/30 → **30/30** |
| qc-acc-v2-contact-profile (round-1 edited oracle) | QC1 | 57/59 — Q8.docs 14 · Q8.files 13 (pre-existing, same as base) |
| qc-acc-v2-contacts (edited oracle) | QC1 | **49/0** (P11 meter 12 · SQL 10) |
| qc-acc-v2-contacts (HEAD oracle, fixed tree — evidence) | QC1 | 47/2 — P3.1, P3.2 |
| qc-account-api-read-master | QC1 | 38/38 |
| qc-acc-v2-contact-modal | QC3 | 96/0 |
qc-acc-v2-contacts header checked before running: it does not seed; it writes only throwaway rows it deletes itself (P6 temp group, P7 one "popular
vendor" row deleted by tax id, P8 temp contact, P9 temp tenant). P7 deletes every row of that tax id in the seed book, so I first checked read-only
(`scripts/pending/cf19/check-p7.mts`) that QC1's seed holds none (0) — after the run: 63 contacts, 0 `QC-TMP-*` leftovers. Expected-file handling as round 1
(main tree's QC1 file copied in, the two read-only generators run, file restored to HEAD afterwards). `qc-acc-v2-contact-merge` NOT run (re-seeds QC1) —
the merge label is covered by M1–M3, L5–L7, E5.

### Owner questions kept (not fixed, per ruling)
- **Q2 chat linked member** — `src/lib/modules/chat/service.ts:2332 getLinkedMember(tenantId, customerId)` (`member.getProfile` `:2334`, no viewer):
  - inbox thread `chat/inbox-actions.ts:421` (`loadThreadAction`) → `memberName` `:432` — the member's **name** (or member code) to every chat staff who can open the thread;
  - context panel `chat/inbox-actions.ts:874` (`getConversationContextAction`) → `memberName` `:905` — same;
  - AI reply suggestion `chat/ai-suggest.ts:198` (`buildContext`) → prompt line `:201` "ลูกค้าคนนี้เป็นสมาชิกของร้าน · ชื่อ · **เบอร์**" — member **name + phone** sent into the model prompt.
  None checks `canReadMember` or branch visibility.
- **Q3 CRM custom records with a CUSTOMER parent** — `src/lib/modules/crm/objects.ts:339` (`resolveParent`, write path: any customer id of the shop
  accepted; the Thai errors tell "merged" / "closed" apart = status oracle for a known id), `:370` (`resolveParentForRead`: `customer.count` by id, no member
  visibility, while the CONTACT/COMPANY/DEAL branches use `contactWhere`/`companyWhere`/`dealWhere`), `:1477` (`memberOfParent`, system/outbox use).
  Leak: a CRM user without member read can list/create custom records (car, pet, contract…) under any member of any branch by customer id.
- Q1 (account REST member scope) and the round-1 prod note unchanged.

### Not verified (round 2)
- Web contacts page and merge page exercised through the same calls the pages make (`loadContactsSidebar`/`listContactsPage` with `crmViewerOfSession`;
  `listMergeCandidates` with `crmViewerOfSession`), not rendered (RSC) in a built app.
- `qc-acc-v2-contact-merge`, `qc-acc-v2-perf`, member-module suites for `list.ts` (only an `export` keyword added there) not run.
- Prod: rows 2/3 are identical on 929c39ce (no viewer anywhere) — same "ship with C5.4-A" note as S4.

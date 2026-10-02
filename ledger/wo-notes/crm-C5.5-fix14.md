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

## Round 3 (controller rulings on the review `crm-C5.5-fix14-review.md`) — base 80f776a9 (src = f268fe2b)

### 1 · RV14-1 (MED) CRM contact 360 member block — FIXED
- `crm/contacts.ts getContact360`: the "สมาชิก" block is now decided by the member module's own gate. `briefFor` (`canReadMember` + branch
  visibility, see below) answers for the viewer; no brief ⇒ `member: null` **and** `contact.memberCustomerId: null` in the 360 DTO, the same as
  "not linked". Entitled viewers get the same block as before (same keys/order; probe E5 byte-compare). Kept for entitled viewers only: a linked id
  whose member row is gone still shows the old "ผูกแล้ว (ไม่พบ…)" block when the viewer can read members. A thrown `briefFor` now hides the block
  (before: block without tier/phone).
- **`briefFor` refuses without `canReadMember` (defence in depth) — DONE** (`member/profile.ts`). Callers checked:
  member-module entry points (`activity`, `identities`, `tier-history`, `insights`, `staff-app`, `members-actions`, `segments`, `import`,
  member REST `members` ops, member `assistant.namesFor`) all reach it through member keys (`hasMemberPerm`/`assertCan` on `member.*` ⇒
  `canReadMember` true, keys need a `member.*` scope = same rule); `chat-bridge.chatPanelFor` throws on `!canReadMember` first; `me.ts`
  (CUSTOMER actor with customerId ⇒ true); `voucher.issue` (`member.promo.issue` ⇒ true); `service.visibleCustomerIds` (checked already).
  Only behaviour change: callers that passed an actor **without** member read and still got briefs — i.e. the leak itself (CRM 360; the member
  assistant's code→name rendering for a member-blind asker now keeps the code). Regression: member fix-s1 28/28, cf9/cf14/cf17 AI probes green.
- Traced through the other doors:
  | door | same call? | result |
  |---|---|---|
  | CRM REST `GET /contacts/{id}` (op `contacts.get`) | yes — returns `getContact360` | fixed (probe C5/C6) |
  | CRM AI tool `crm_contact_360` | yes — REST op through the asker's membership (`crmActorOf`, kind assistant = asker) | fixed |
  | mobile CRM routes (`api/mobile/crm/*`: deals, tasks, call-log, scan-card) | no contact route, no member data | n/a |
  | chat CRM panel (`chat/crm-panel-actions.ts`) | uses CRM `briefFor` (CRM contact brief, no member fields) | n/a |
  | kanban link resolver | kanban reads no CRM-member data (its "members" are board members) | n/a |
  | CRM PDPA person export (`privacy.ts exportContact`) | the `contact` block has no `memberCustomerId`/member fields; fix9 ruled "requester visibility not widened" (withheld tables reported) | no change (report only) |
  | **CRM 360 consent block** (`consents.current` → `channelsOf`) | different call | **NOT FIXED — owner question Q4**: for a linked contact it returns `memberLinked: true` and the member's consent states (granted/source/at from `MemberConsent`) to any CRM viewer. Making it "identical to not linked" would show the CRM-row consents while sends are decided by the member's — a consent-correctness question, not a one-liner. |
  | **CRM contact list/get DTO** (`toDto`/`viewerDto` `memberCustomerId`, web list + REST `contacts.list`) | different call | **NOT FIXED — listed (Q5)**: raw member id (no code/name/phone) = existence signal; batch gate would need a per-page visibility query |
  | **CRM CSV export** (`contacts.ts exportContacts` column "ผูกแล้ว") | different call | **NOT FIXED — report only** (export semantics not changed per ruling) |

### 2 · RV14-2 (LOW) account AI assistant — FIXED
- `ApiActor.asker` (new optional field, kind `assistant` only): the real asker in the eyes of other modules. `tools-account.ts askerOf(ctx.actor)`
  derives it like the web/REST doors: member/system actor = `toMemberActor(userId, membership)` (= `crmViewerOfSession`), API-key actor = a STAFF
  viewer holding the key's scopes (= `crmViewerOfApi` for keys); passed through `runAccountTool(opts.asker)` → `assistantActor` →
  `crmViewerOfApi` returns `actor.asker` for kind `assistant` (absent = null = fail closed, as before). The account op's own permission check is
  unchanged (still the filtered assistant scopes).
- Effect: OWNER / entitled STAFF asking the assistant now get the truth (`links.member`, `badges.member`, `source:member`); member-blind STAFF,
  branch-B STAFF and account-only keys still get "not linked". The same `asker` also feeds the CRM card of the account tools (one viewer for both,
  as on the web) — the "CRM AI side" the reviewer mentioned is this same plumbing. The CRM module's own AI tools already run as the asker
  (`tools-crm.ts` passes the asker's membership) — no change there.
- Note: the reviewer's probe calls `runAccountTool` directly without `asker` (its INFO "OWNER through AI = false" stays false by construction);
  the only production caller is `tools-account.ts`, which passes it.

### 3 · RV14-3 (LOW) merge loses the member link — FIXED (service level, viewer-independent)
- New `member/service.ts followPartyMerge(tx, tenantId, fromPartyId, toPartyId)` (member module writes its own rows — the `party.mergeParties`
  contract "callers move their module's data in the same transaction"): one atomic `UPDATE "Customer"` re-pointing the dropped Party's members to
  the surviving Party, **per member system only where the surviving Party has no member yet**. Raw SQL on purpose: the account transaction is a
  `tenantDb` client bound to the account system (its Customer filter would be `memberSystemId = <account system>`).
- `account/contact-merge.ts mergeContacts`, step 7b (same transaction, after `mergeParties`): keep = the Party the surviving contact holds after the
  merge (primary's, or the secondary's when the user picked it), drop = the other side's **original** Party.
- Both sides hold a member ⇒ nothing moves, no member merge: the secondary's member stays on its own (now merged-away) Party, reachable from the
  member module and the archived secondary contact; the survivor's card shows its own member (probe G3, same on base).
- Nothing new is returned or audited (MergeResult keys unchanged — probe G2) ⇒ no membership hint to a blind merger.
- No un-merge/restore path exists for account contacts (nothing to keep consistent).
- Found, NOT changed (pre-existing, report): when the user keeps the **secondary's** Party, `mergeContacts` passes the already-patched party as
  "primary" to `mergeParties` ⇒ no Party-level merge (primary's original Party gets no `mergedIntoId`) and a self-pair `PartyMergeCandidate(x,x)`
  row is written. CRM contacts on the dropped Party are not re-pointed either (CRM card of the survivor; same pattern — listed). A survivor
  **without** any Party merging a secondary that has one: no Party merge happens at all (pre-existing; member stays with the archived secondary).

### 4 · RV14-5 QC1 hygiene — DONE
`scripts/pending/cf19/qc1-party-leftover.mts` (read-only by default; `--delete` deletes exactly one row in a transaction, only if: tenant = seed
`cmuk7wtu…`, taxId `0091000000001`, createdAt prefix matches, and **0 references** across every `%party%id` column of every table + `Party.mergedIntoId`):
- `cmuqunmlh0002rpkzymtt7vfz` (created 2026-10-02T10:58:11.621Z): 0 refs → deleted; seed-tenant Party count 64 → 63.
- My round-3 re-run of qc-acc-v2-contacts created the same leftover again (`cmuqwx1pu0002arkzk6t1l31x`, 12:01:30Z): 0 refs → deleted; 64 → 63.
  After: 63 contacts, 0 `QC-TMP-*`, no Party with that tax id in the seed tenant. (Long term P7 should delete its Party — oracle change, not done.)

### 5 · RV14-4 known debt (not fixed)
OWNER's real links tab: QC1 seed **15** SQL statements (reviewer `review/qc1-links-budget.mts`); my own tenant with a CRM system **14**
(probe INFO). `qc-acc-v2-contact-profile` Q8.links passes only because it loads without a viewer; `qc-acc-v2-perf` likewise measures less work
than any entitled user causes. The extra statements are the CRM contact + deal lookups (pre-existing for entitled viewers). Needs an oracle edit
(OWNER viewer) + an optimisation card.

### RED (80f776a9) → GREEN — probe-cf19 extended
| id | case | 80f776a9 | fix |
|---|---|---|---|
| C1 / C2 | CRM 360 `{member, contact}` for STAFF crm-read without member key / STAFF of branch B == not linked | ❌ code, name, masked phone, id | ✅ |
| C5 | CRM REST `GET /contacts/{id}`, key `[crm.contact.read]` | ❌ | ✅ |
| C3 / C4 / C6 | OWNER · home-branch STAFF (crm + member read) · key with `member.customer.read` see the block | ✅ | ✅ |
| A1 / A2 | account AI (`account_get_contact`, `account_search_contacts source:member`): OWNER · STAFF with account read + member read see the truth | ❌ linked == unlinked | ✅ |
| A3 / A4 / A5 | AI: STAFF account read w/o member key · branch B · account-only API key == not linked | ✅ | ✅ |
| G1 | blind STAFF merges [no member] ← [member] with default choices (real `mergeContactsAction`, session cookie) → OWNER sees the card on the survivor | ❌ linked false | ✅ |
| G2 | merge result carries no member hint | ✅ | ✅ |
| G3 | both sides members → nothing moves | ✅ | ✅ |
| G4 | keep the secondary's Party → primary's member follows | ❌ | ✅ |
| E5 | entitled DTOs byte-identical to 80f776a9 (round-2 keys + `crm360:owner`, `crm360:crmHomeBranch`, `crm360:rest:crmmem`) | ✅ (written) | ✅ |
| Q1–Q3 · V1 · D/L/M/E | earlier rounds | ✅ | ✅ |
Totals: RED **38/45** (7 red: C1 C2 C5 A1 A2 G1 G4) → GREEN **45/45**. Logs `red-probe-cf19-r3.log`, `g-probe-cf19-r3.log`; base `base-dto-r3.json`.
(Probe debugging before the counted RED run: the links-tab budget section moved before the CRM system is created; CRM DTO timestamps and user ids
normalised; AI section viewers given `account.doc.view`.)

### Runs (round 3 code)
| check | DB | result |
|---|---|---|
| typecheck · fitness no env · fitness QC2 | — / QC2 | exit 0 · 42/42 · 42/42 |
| docs `--check` crm · account | — | exit 0 (123 · 199 op) |
| probe-cf19 | QC2 | 38/45 → **45/45** |
| review/probe-cf19-review (unedited) | QC2 | **41/41** (F-STAFF ×2 now green) |
| qc-crm-c5.3 `--only=L1,L3` | QC2 | 19/19 |
| probe-cf17-g3 · probe-cf14-g2 · probe-cf9-g1 · probe-cf9-g1-r2 | QC3 | 28/28 · 34/34 · 47/47 · 18/18 |
| qc-crm-c1.3 · qc-crm-c1.4 (contact 360) | QC3 | 89/89 · 110/110 |
| qc-member-fix-s1 | QC3 | 28/28 |
| qc-member-m3.10 | QC3 | 5/21 — **identical ids on 80f776a9** (S2.1–S2.3, S3.1–S3.12, S4.3): needs a live server (`QC_BASE` dead port in the gate form) and the `.claude` skill copy this worktree lacks |
| qc-account-api-ai-skill | QC3 | 23/33 — **identical failing ids before/after** (E1-K2.1, K2.3, K2.5, K2.6, K2.8, K3.6, K3.7, K3.8, K3.10a, K3.11; QC3 has no acc-v2 seed for its read part) |
| qc-acc-v2-contact-modal | QC3 | 96/0 |
| qc-acc-v2-contact-profile · qc-acc-v2-contacts | QC1 | 57/2 (Q8.docs/files, pre-existing) · 49/0 — expected-file handling as before (restored to HEAD); P7 leftover deleted (§4) |

### Owner questions (round 3)
- **Q4** CRM 360 consent block for a member-blind viewer (`memberLinked:true` + member consent values) — hide behind a neutral state, or accept?
- **Q5** CRM contact list/get DTO `memberCustomerId` and the CSV export column "ผูกแล้ว" — gate per viewer (batch visibility query per page) or accept the bare existence signal?
- Q1–Q3 unchanged (Q2 chat `getLinkedMember` · Q3 CRM custom records with a CUSTOMER parent).

### Not verified (round 3)
- Built app / browser not run; the CRM 360 page, merge page and AI tools exercised through their real service/action/tool entry points.
- `qc-acc-v2-contact-merge` (re-seeds QC1) not run — the merge change is covered by G1–G4; `qc-acc-v2-perf` not run.
- Prod: `getContact360` member block identical on 929c39ce (`:1282/:1326` per review, CRM v2 page behind uiVersion=2); the account AI and merge
  paths likewise — code read only, not verified on prod.

## Round 4 (controller rulings on the round-3 re-check) — base 5fb1cf8a (src = 7c151cc8)

### 1 · RV14-12 (= Q5, MED) CRM `memberCustomerId` on list / brief / CSV — FIXED
- One helper, member side: `member/service.ts memberIdsVisibleTo(tenantId, viewer, ids)` (re-exported from the member facade). Same rule as
  `memberLinkScope`: no member read ⇒ ∅ **with no query** · whole-shop viewer / `"system"` ⇒ all ids **with no query** (entitled DTOs unchanged) ·
  branch-limited viewer or CUSTOMER ⇒ **one** query (`Customer.id IN page ids` AND the member list's branch scope `actorScopeWhere`).
- CRM side (`crm/contacts.ts`): `memberSeen(ctx, viewer, ids)` + `maskMemberLink(row, seen)` — a member the viewer cannot see ⇒ `memberCustomerId: null`,
  exactly like "not linked". Applied at every read that hands the value to a user:
  | door | where | queries added (branch-limited only) |
  |---|---|---|
  | list + search (web list "สมาชิก" badge `crm/contacts/page.tsx:150` · REST `contacts.list` / `contacts.search` · AI `crm_search`/list tools) | `listContacts` | 1 per page (parallel with company/owner lookups) |
  | write results (create · update · tags · lead status · owner · …) — REST / AI / server actions | `viewerDtoOf` | 1 |
  | brief (REST `contacts.brief` / `by-party` · chat CRM panel `crm-panel-actions.ts`) | `briefFor` | 1 |
  | CSV export column "รหัสสมาชิกที่ผูก" ("ผูกแล้ว" → blank) | `exportContacts` | 1 per 1,000 linked ids |
  | 360 (round 3) | `getContact360` via member `briefFor` | unchanged |
- No list filter / sort / count on "is member" exists in the CRM contact list (checked `listWhereFrom`/`effectiveListInput`/`SORTS`/CSV) — nothing else to align.
- Writes and internal decisions keep the raw row (convert, CRM merge `DIFF_MEMBER` guard, consent routing, erase, bridges).
- Statements per list page (probe INFO, real SQL): OWNER 3 → **3** · member-blind STAFF 3 → **3** · branch-limited STAFF 3 → **4**.
- Remaining CRM carriers of `memberCustomerId` / a member flag — **listed, not changed**:
  - `convertContact` result: when the contact is already linked it returns the existing `customerId` (write path, needs `crm.contact.convert` + a member target).
  - CRM merge guard `DIFF_MEMBER` error text ("สองคนนี้เป็นสมาชิกคนละคน…") tells a blind merger both are linked to different members (write guard).
  - Webhook/outbox payloads: `crm.contact.updated` `changedKeys: ["memberCustomerId"]` (member.created/merged bridges) and `crm.contact.erased` `customerId` (privacy.ts) — integration endpoints configured by owners (CRM family guard).
  - Automation condition field `memberCustomerId` "เป็นสมาชิก" (`automation-shared.ts:140`) — rules run as system; a rule author can branch on membership.
  - Bridge ingest results (`upsert…FromBridge` `memberCustomerId`), `objects.memberOfParent`, `crm-bridges/*`, audit rows — system paths, not shown to viewers.
  - AI `recent_leads` selects no member field; CRM AI tools reuse the REST ops above (covered).

### 2 · RV14-13 (= Q4, LOW) consent provenance — FIXED as ruled
`consents.current` (360 consent block, the only viewer read): for a linked contact whose member the viewer cannot see (`memberIdsVisibleTo`),
`granted` and `memberLinked` stay, `source` and `at` are `null`. OWNER / the system actor (emails.ts complaint flow reads `at` with an OWNER system
actor) are unchanged. **Owner question Q4 (residual):** the `memberLinked:true` boolean still tells a member-blind CRM viewer that the contact is a
member (it drives the edit lock) — accept, or make the lock viewer-neutral?
- Reviewer's `Q4-consent` check stays **red** by design: it asserts the whole consent block linked == unlinked; after the ruling the block still
  differs in `memberLinked` (true vs false) and in `granted` (member's value vs the CRM row's). Not edited.

### 3 · RV14-14 (LOW) `followPartyMerge` status — FIXED
The move and the "survivor already has a member" test both ignore `MERGED`/`CLOSED` rows (`status NOT IN ('MERGED','CLOSED')`, the real
`MemberStatus` enum; `SUSPENDED` counts as a live member). Decision for the dropped side: MERGED/CLOSED rows **do not move** — a MERGED row
points to the member it was merged into (`mergedIntoId`), a CLOSED row is closed/erased; moving them would only put a dead row on the survivor's
card (`findCustomerByPartyId` does not filter status — RV14-6) and could block a later live link. Probe G5.

### 4 · RV14-15 (INFO) — documented, no change
- The move writes no audit row and no outbox event (same as `setCustomerPartyId`); CRM/chat bridges keyed on `member.*` events do not react
  (CRM contacts link by `memberCustomerId`, which does not change).
- `ChatContact.partyId` stays on the dropped Party. Not re-pointed: the account merge re-points **no** other module's party-linked rows (only
  `Party.mergedIntoId` + the merge candidate), so chat re-pointing would be new behaviour for the chat module, not the consistent thing; the chat
  link that matters (`ChatContact.customerId`) is unaffected.
- No unique constraint on `Customer.partyId`: under READ COMMITTED a concurrent link onto the survivor can leave two live members per system on
  it (no failure; the card shows the oldest visible).

### RED (5fb1cf8a) → GREEN — probe-cf19 extended
| id | case | 5fb1cf8a | fix |
|---|---|---|---|
| K1 / K2 | CRM list · search · brief · write DTO (setTags) · CSV for STAFF crm-read w/o member key / STAFF of branch B == not linked | ❌ raw id + "ผูกแล้ว" on all 5 | ✅ |
| K3 / K4 | OWNER · home-branch STAFF still see the link on all 5 doors | ✅ | ✅ |
| K5 | CRM REST `GET /contacts` + `/contacts/brief`, key `[crm.contact.read]` | ❌ | ✅ |
| K6 | same, key + `member.customer.read` | ✅ | ✅ |
| N1 / N2 | consent for refused viewers: `memberLinked` + `granted` kept, `source`/`at` null | ❌ SIGNUP_FORM + at | ✅ |
| N3 / N4 | OWNER · entitled STAFF consent unchanged | ✅ | ✅ |
| G5 | survivor holds only a CLOSED member → dropped ACTIVE member moves; dropped MERGED row stays | ❌ | ✅ |
| E5 | entitled DTOs byte-identical to 5fb1cf8a (adds r4 list/brief/write/csv/consent/REST keys) | ✅ (written) | ✅ |
| all earlier | rounds 1–3 | ✅ | ✅ |
Totals: RED **50/56** (6 red: K1 K2 K5 N1 N2 G5) → GREEN **56/56**. Logs `red-probe-cf19-r4.log` / `g-probe-cf19-r4.log`; base `base-dto-r4.json`.
(Probe bug fixed before the counted RED run: REST list paging is `take`, not `pageSize` — the first RED run had K6 red with a 422.)

### Runs (round 4 code; iso + gate lock, one at a time)
| check | DB | result |
|---|---|---|
| typecheck · fitness no env · fitness QC2 | — / QC2 | exit 0 · 42/42 · 42/42 |
| docs `--check` crm · account | — | exit 0 (123 · 199 op) |
| probe-cf19 | QC2 | 50/56 → **56/56** |
| review/probe-cf19-review (unedited) | QC2 | **41/41** |
| review/probe-cf19-review-r3 (unedited) | QC2 | **32/35** — `Q5-list-dto` ✅ and `Q5-csv` ✅ (were the intentional reds). Reds: `Q4-consent` (stays red by the ruling: linked `{memberLinked:true, granted:true, source:null, at:null}` vs unlinked `{false, granted:null}` — the kept boolean + `granted` differ; provenance is now null) · `F-moves` and `F-per-system` — **new reds caused by the RV14-14 ruling**: they assert the round-3 behaviour (a MERGED row on the dropped side moves; a CLOSED survivor member blocks the move). Both now behave as ruled (probe G5). Not edited. |
| qc-crm-c5.3 `--only=L1,L3` | QC2 | 19/19 |
| probe-cf13 · cf13 review (fix10 list masking) | QC2 | 24/24 · 8/8 |
| probe-cf16-r3 | QC2 | 8/8 |
| qc-crm-c1.10 (export) | QC2 | 66/66 |
| qc-crm-c1.3 · c1.4 · c1.11 (import/merge) | QC3 | 89/89 · 110/110 · 66/66 |
| qc-member-m1.4 (briefFor contract) | QC3 | 37/37 |
No account code touched this round ⇒ no QC1 run, no leftover cleanup needed.

### Owner questions after round 4
- **Q4 (residual)** `memberLinked:true` in the CRM 360 consent block for member-blind viewers (edit lock) — accept or make the lock viewer-neutral.
- Q1–Q3 unchanged; the CRM carriers listed under §1 (convert result, merge guard text, webhook payloads, automation condition) are owner calls.

### Not verified (round 4)
- No built app / browser: the CRM list page badge is derived from `listContacts` items (`page.tsx:150`), exercised through the service; REST through the real route handler.
- Concurrency of `followPartyMerge` reasoned only. Prod not checked (the same CRM list/brief/CSV code is on main 929c39ce per the review's reading; not verified).

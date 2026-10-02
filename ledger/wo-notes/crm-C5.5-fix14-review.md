# crm-C5.5-fix14 — INDEPENDENT REVIEW (authz-sweep S4: member data on account contact screens without a member viewer)

Worktree `/root/projects/shark-crm-cd2` · branch `wip/crm-cf19` · reviewed builder tip **f268fe2b** (2 commits on f5e6485b; `session/crm` has moved
only by ledger commits since, so nothing in the reviewed files overlaps). Reviewer did not build the card. No src or builder files edited.

## VERDICT: **MERGEABLE**

All builder claims I could test hold. The new gate matches the member module's own visibility rule for every persona I tried (22 personas ×
11 member fixtures + undefined/null/"system"). Denied viewers get the same DTO as "no member linked" on every account door I could reach, including
5 doors the builder did not test. Entitled DTOs are byte-identical to the base tree (builder E5, re-run green). The links-tab SQL counts are 12 / 11 / 12.
The oracle edits only pass the viewer through, and the unedited oracles go red on exactly the claimed checks.
None of the findings below sits in this card's diff at BLOCKER/HIGH level. RV14-1 (MED) is the same kind of gap in the **CRM** module, missed by the
sweep. It needs its own card but does not block this one.

## Findings

| id | sev | where | finding | suggested fix |
|---|---|---|---|---|
| RV14-1 | **MED** (sibling gap, not in this diff · new card) | `crm/contacts.ts:1595-1603` `getContact360` → `consents.memberSystemOf` → `member.memberRefs` (no viewer) + `member.briefFor` (no `canReadMember`) · shown on the CRM contact page (`crm/contacts/[contactId]/page.tsx:240-414`: "เป็นสมาชิก", "ผูกแล้ว · M-xxxx", link to the member profile) | The CRM contact 360 shows the linked member's **customerId, member code, full name** to every CRM viewer of that contact. A STAFF user with **no member key at all** also gets the **masked phone**, because member `briefFor` checks branch scope but not `canReadMember`. The member module would show this member to neither viewer. This is the CRM mirror of S4 (by `CrmContact.memberCustomerId`, not by party), and it is missing from the builder's sweep table (rows 1-8). Probe F: OWNER sees it (correct). `STAFF * crm read, no member key` gets `{memberCode:"M-R001", name, phoneMasked:"089-xxx-0001"}`. `STAFF [UB] crm+member read` (member's home is A, no visit in B) gets code + name. The code is present on prod main 929c39ce (`getContact360` :1282/:1326, CRM v2 page behind uiVersion=2). Not verified on prod. | Gate the block with `visibleCustomerIds(tenantId, sys.systemId, a, [memberCustomerId])` (same rule as this card). Not visible ⇒ `member = null`, the same as "not linked". Also consider adding `canReadMember` inside member `briefFor` itself (any caller passing a no-member-key actor gets the masked phone today). |
| RV14-2 | LOW (OWNER false negative · owner/controller call) | `ai/account-ops.ts` `assistantActor` (kind `assistant`, no userId) → `crmViewerOfApi` ⇒ `null` | The account AI tools (`account_get_contact`, `account_search_contacts`) now never see membership, **even for the OWNER**. They return `links.member:false`, `badges.member:false` and an empty `group=source:member` list, the same as a contact with no member. On the base tree everyone saw `true` (the lookups had no viewer). So "is this customer a member?" through the assistant is now a confident **wrong "no"**, not a refusal. This is consistent with the CRM side (C5.4 made it `null` for the assistant too). Probe B: OWNER linked == unlinked through AI. | Either derive the viewer for `kind:"assistant"` from the asker's membership (`runAccountTool` already receives `opts.viewer`, but `assistantActor` drops the identity), or record this as intended. |
| RV14-3 | LOW (pre-existing semantics, worse UX now) | `account/contact-merge.ts mergeContacts` / `mergeParties` (no viewer) + `ContactMergePanel` partyId row | A member-blind merger now sees "— ยังไม่เชื่อม" on **both** sides of the "เชื่อมกับสมาชิก" row (OWNER sees `#M-R001` on one side). If the blind merger keeps the unlinked contact as primary (default field choices), the member link is lost: `Customer.partyId` stays on the merged-away Party, and the by-party lookups match exactly (they do not follow `Party.mergedIntoId`). After the merge, the OWNER's card on the surviving contact reads `linked:false`. Probe D shows this. The data path is the same as before the fix (an OWNER with default choices gets the same result). The change is that the blind user's only warning is now (correctly) hidden. | Server-side: when the dropped Party has member/CRM holders, keep that Party or repoint the holders through the facades (`"system"`). Or make the by-party lookups resolve the canonical Party. A separate card. |
| RV14-4 | LOW (oracle meaning; pre-existing budget breach) | `qc-acc-v2-contact-profile` Q8.links (loads **without** a viewer) | Q8.links was 13 (red) on base and is now 12 (green). It is green only because, without a viewer, the member query (and the CRM queries) are skipped. On the QC1 seed the OWNER's real links tab is **15 statements** (no viewer: 12), above the WO 3.4 ceiling of 12 (`qc1-links-budget.mts`). The fix adds no query for OWNER (`memberLinkScope` is query-free for unscoped viewers). The 15 comes from the CRM/member lookups that already ran for entitled viewers, so this is not a regression. But Q8.links green does not mean "budget met", and `qc-acc-v2-perf` (also viewer-less: `loadContactsSidebar(ctx)`, `contactProfile(...)` without `crmViewer`) now measures less work than any entitled user causes. The builder's "OWNER 12" is from its own tenant, which has no CRM system. | Controller: ORACLE-EDIT Q8.links (and the perf rows) to load with the OWNER viewer, so the real path is measured (it will go red at 15). Optimise separately. |
| RV14-5 | LOW (process · QC1 hygiene) | QC1 seed `cmuk7wtu…` · `Party cmuqunmlh0002rpkzymtt7vfz` (taxId 0091000000001, createdAt = updatedAt = 2026-10-02T10:58:11.621Z) | `qc-acc-v2-contacts` P7 calls `insertPopularVendors` → `party.safeFindOrCreate`, and the oracle deletes the contact but **not the Party**. The Party was created at 10:58:11 today, the same minute the worktree's expected file was restored after the builder's round-2 QC1 run, so it is most likely a leftover of that run (not proven: another lane could have run P7). The builder's note says "0 QC-TMP leftovers / nothing rewritten" and did not check Party. My runs **reused** it: QC1 fingerprint before vs after my runs is identical (58 tables, every per-table count, global Tenant/User/Session/Membership/ApiKey, max(updatedAt)). I did **not** delete it. | Controller: decide whether to delete that one Party row (it is outside the seed checksum, if the checksum covers Party). Long term, P7 should clean up the Party it creates. |
| RV14-6 | INFO | by-party lookups | MERGED/CLOSED members are not excluded. The member **list** page hides MERGED by default, while `assertVisible`/`briefFor` (the rule this card mirrors) ignore status. So the card can show a merged-away member's code. This was already true on base and is the same for entitled viewers. Equivalence with `visibleCustomerIds` holds (probe A). | Separate decision. If wanted: `status: { not: "MERGED" }` in the scope, plus a canonical-member pick. |
| RV14-7 | INFO | `list.ts actorScopeWhere` vs `profile.ts assertVisible` | The activity branch of `actorScopeWhere` has no `tenantId` filter, unlike `assertVisible`'s count. It is equivalent in practice, because the activity is reached through the Customer relation of a tenant-scoped row. It would only differ if a `MemberActivity` row carried another tenant's id. | none needed |
| RV14-8 | INFO | `crmViewerOfApi` + `canReadMember` (H1) | **Any** `member.*` scope makes an account-REST key a full member viewer (probe E: key `account.* + member.review.read` → `links.member:true`). This is the member module's implicit-read rule. The account page cannot mint such keys (S1); tenant-wide keys from Settings › API can. Owner question Q1 stands. | — |
| RV14-9 | INFO | `member/list.ts listMembers` | With a `CUSTOMER` actor, `actorScopeWhere` returns `null`, so the list is not limited to the customer's own row (probe A side column: through `listMembers` the CUSTOMER persona sees every non-MERGED member, not only its own row). This is member-module internal, and no staff list path takes a CUSTOMER actor. The new gate handles CUSTOMER correctly with its own branch. | Member card, if the list is ever exposed to `/m/*`. |

### Owner questions the builder left (attack 3)
- **Q2 chat `getLinkedMember`** (`chat/service.ts:2332`): **MED**. The member's name/code goes to every chat staff member who can open the thread, and the **name + phone** go into the AI-suggestion prompt (`chat/ai-suggest.ts:198-201`), all without `canReadMember` or a branch check. The link itself is staff-made (`chat.customer.link`), and chat staff are already talking to the person, so this is a product call more than a leak. Leaving it out of this card is **acceptable** (different module, not an account screen). It should get its own card; gating the phone in the AI prompt is the cheap first step.
- **Q3 CRM custom records with a CUSTOMER parent** (`crm/objects.ts:339/370/1477`): **LOW**. It needs a known customer cuid (not guessable). It reveals the MERGED/CLOSED status through the error text and allows records under a member the user cannot see. Leaving it is **acceptable** for this card.
- Add **RV14-1** to the same follow-up list. Of the three it exposes the most (code + name + masked phone, rendered on a page).

### Attack results in short
1. **Rule equivalence:** for all 22 personas, the gate equals `visibleCustomerIds` (the member module's `canReadMember` + `briefFor`/`assertVisible`) on 11 fixtures. That includes the oldest *visible* row on a Party holding 2 members, and the member code chosen. The personas: OWNER `*`/`[UB]`, MANAGER `*`/`[UB]` with no member keys/`[]`, STAFF `[]`, `[UA,UB]`, stamp-only (implicit read), `member.*`, `read=false`, `read="true"` (string), `["*",UB]`, a foreign unit, `[UB]`, `[UC]`, no member key, keys with `member.customer.read` / `member.review.read` / account-only, CUSTOMER self / no id, the assistant actor. The fixtures: home A; no home + pos in B; no home + crm (non-visit) in B; home A + booking in B; home C + restaurant in B; MERGED home B; CLOSED home B; no home and no activity; home B; shared Party old A / new B. No persona sees **more** than through the member module. Against the member **list** page, the only differences are MERGED rows (RV14-6) and the CUSTOMER persona (RV14-9). Undefined/null ⇒ 0 rows, and **no query** for the account doors. `"system"` ⇒ everything (unchanged).
2. **Side channels:** REST `contacts.merge-candidates`, `/contact-groups`, `/contacts/{id}/link-suggestions`, list search by **member code** and by phone, AI `account_get_contact` / `account_search_contacts` for a member-blind STAFF: all identical, linked vs unlinked (probe B). Sorting is `createdAt desc` only, with no membership term, and REST `contacts.list` `summary` carries no member count. The only membership-dependent total is `group=source:member` (covered by builder L4). No CSV export of account contacts exists, and account webhooks/outbox carry no member data. Timing: a member-blind viewer runs the same 11 statements, linked or unlinked, and none touches `"Customer"`. The statement order varies because of `Promise.all`; the set is identical (probe C). Merge: see RV14-3.
3. **Sweep:** see RV14-1 (missed) and Q2/Q3 above. Kanban reads no member rows; `crm/brief.ts` / chat CRM panel use CRM `briefFor` with an actor; `member-bridges`, `crm-bridges/core`, `party.countPartyHolders`, `pos/register` are system paths.
4. **"system":** unreachable from user paths. `contactProfile` / `loadContactsSidebar` / `listMergeCandidates` / `getMergePair` are typed `MemberActor | null`, and no caller passes `"system"`. Viewer-less callers after the fix:
   - REST `contacts.merge-candidates`: its view never serialised the label, so no change.
   - REST `/contact-groups`: custom counts only.
   - `getContactDetail`: badges hard-coded to false.
   - `qc-acc-v2-perf`: measures less work (RV14-4).
   - The AI assistant: the only real OWNER false negative (RV14-2).
5. **Oracle edits:** the diff is exactly 3 lines per oracle, each marked `// ORACLE-EDIT C5.5-fix14:`. They read the seed OWNER's membership (read-only), build the viewer, and pass it. No assertion changed. Unedited oracles from f5e6485b, run as temporary copies against the fixed tree on QC1 (copies deleted afterwards):
   - contact-profile **56/3**: Q7.5 (the claimed one), plus Q8.docs 14 and Q8.files 13. The two Q8 reds are pre-existing and red identically with the edited oracle.
   - contacts **47/2**: P3.1 (claimed) and P3.2. P3.2 is the CRM count, viewer-gated since C5.4, so it was already red on base. The edit turns it green for the same reason as P3.1.
   - Edited oracles: contact-profile **57/2** (the same two Q8), contacts **49/0**.
6. **API keys:** a key is a member viewer iff it holds **any** `member.*` scope (H1 rule; RV14-8). An account-only key cannot infer membership through any account door I tried (B), nor through the builder's L4/D7.

## What I ran (all through `iso.sh` + `with-gate-lock.sh`, one at a time)
| run | DB | result |
|---|---|---|
| my probe `scripts/pending/cf19/review/probe-cf19-review.mts` (own tenant `qc-cf19r-*`) | QC2 | **39/41**. The 2 reds are `F-STAFF…` = **RV14-1** (sibling CRM gap, intentional red). A 25/25 · B 7/7 (+2 INFO) · C 2/2 · D INFO · CLEAN tenant 0 / users 0. Log `review/probe-cf19-review.log` |
| builder probe `scripts/pending/cf19/probe-cf19.mts` (unchanged) | QC2 | **30/30**. Links-tab SQL: OWNER 12 · no member read 11 · branch-limited 12. Log `review/rerun-builder-probe-cf19.log` |
| `pnpm typecheck` (5 GB heap) | — | exit 0 |
| fitness (no env · QC2 env) | — / QC2 | 42/42 · 42/42 |
| read-only expected generators `acc-v2-expected-contact-profile` + `-contacts` (main CRM tree's QC1 file `shark-crm/scripts/acc-v2-expected.json` copied in; QC1 holds seed `cmuk7wtu…`, checked read-only with `which-seed.mts`) | QC1 | exit 0 · 0 · the file was restored to HEAD afterwards (`git status` clean except the two pre-existing expected files) |
| qc-acc-v2-contact-profile, edited / unedited (f5e6485b copy) | QC1 | 57/2 / 56/3 (see 5) |
| qc-acc-v2-contacts, edited / unedited (f5e6485b copy) | QC1 | 49/0 / 47/2 (see 5) · P7 pre-check (builder's read-only `check-p7.mts`): popular0 0, 63 contacts, 0 QC-TMP |
| `review/qc1-links-budget.mts` (read-only) | QC1 | links tab: no viewer 12 · seed OWNER **15** (RV14-4) |
| `review/qc1-snapshot.mts` before/after all my QC1 runs (read-only) | QC1 | **identical** (58 tables, every per-table count, global counts, max(updatedAt)) · the Party leftover predates my runs (RV14-5) |

## Not verified
- Not run in a built app or browser. Pages were exercised through the same service calls they make (my probe), and REST through the real route handler.
- `qc-acc-v2-contact-merge`, `qc-acc-v2-perf`, member-module suites: not run (merge re-seeds QC1, which is forbidden; perf is reasoned in RV14-4).
- Base-tree behaviour of the AI assistant (RV14-2) comes from reading the code (on base, the lookups had no viewer parameter, so the assistant saw membership). It was not executed on a base tree.
- RV14-1 checked through `getContact360` only; the CRM REST views and the chat CRM panel were not traced for the member block. Not verified on prod.
- RV14-5: who created the Party row is inferred from the timestamp only.
- `docs --check` generators were not re-run (no REST op or serializer changed in the diff).

---

## Round 3 re-check (builder tip 7c151cc8 · diff `80f776a9..7c151cc8 -- src scripts`; stray ledger commit 0f6047ec ignored)

### VERDICT (round 3): **NOT MERGEABLE as is.** One fix is still required: **RV14-12 = Q5**. It becomes MERGEABLE once Q5 is gated, or once the owner explicitly accepts Q5.

Everything the builder claims for RV14-1/2/3/5 holds (see below). Q5 is the bare existence signal plus the raw member id on the CRM contact list,
brief and CSV. It is exactly the class this card closed on the account side (round 2: `badges.member`, `source:member`, count). After round 3
it also contradicts the CRM 360: the page now says "not linked", while the list one click earlier still shows the "สมาชิก" badge, and REST
`contacts.list` returns the member id.

### Findings (round 3)
| id | sev | finding | evidence | suggested fix |
|---|---|---|---|---|
| RV14-12 (= Q5) | **MED · fix in this card** | A member-blind CRM viewer still gets `memberCustomerId` (the raw member id) from: `listContacts`, which feeds the web list's "สมาชิก" badge (`crm/contacts/page.tsx:150` → `ContactListTools.tsx:128`) and REST `contacts.list`/`contacts.search` (`items: r.items`, unfiltered); the CRM `briefFor` `ContactBrief.memberCustomerId` (`contacts.ts:2777`, REST `contacts.brief`/`byParty`, chat CRM panel); and the CSV column "รหัสสมาชิกที่ผูก" ("ผูกแล้ว"). The member module refuses this viewer (`visibleCustomerIds` = 0). | probe r3 `Q5-list-dto` ❌ (linked: the id; unlinked: null) · `Q5-csv` ❌ ("ผูกแล้ว" vs "") · `Q-360-fixed` ✅ (so the two disagree) | Minimal rule, identical to the account side: one helper, `memberIdsVisibleTo(ctx, actor, ids)`. It runs **no query** when `!canReadMember(actor)` (⇒ ∅). Otherwise it runs one query per page through the member facade (`memberLinkScope`-style `where` on the customer ids, or `visibleCustomerIds`). Ids not in the set ⇒ `memberCustomerId: null` in `toDto`/list items/`ContactBrief`/CSV blank. Unchanged for entitled viewers. Writes (`convertContact`, merge guards, consent routing) keep reading the raw row and are untouched. |
| RV14-13 (= Q4) | LOW · owner trade-off, does not block | `getContact360().consent` / `consents.current` give a member-blind viewer `memberLinked:true` **and the member's consent provenance** (`source:"SIGNUP_FORM"`, `at`), next to the member's effective `granted` values. So the 360 DTO is not fully "same as not linked" (builder note §1 says so). | probe r3 `Q4-consent` ❌ (linked `{memberLinked:true, granted:true, source:"SIGNUP_FORM", at:…}` vs unlinked `{false, null…}`) | It is a genuine trade-off. The `granted` values decide sends, and `memberLinked` drives the edit lock (`memberConsentLocked`). Hiding the flag would unlock an edit that then fails or writes to the wrong side. Minimal safe rule: for viewers the member module refuses, keep the effective `granted` but null **`source`/`at`** (member provenance, not needed for outreach). Then leave the residual boolean to the owner (or make the lock viewer-neutral). |
| RV14-14 | LOW | `followPartyMerge`'s `NOT EXISTS` counts survivor members of **any status**. If the survivor's only member in a system is CLOSED or MERGED, the dropped side's ACTIVE member is not moved, and the RV14-3 loss remains in that case. | probe r3 `F-per-system` (survivor holds only a CLOSED member in M2 ⇒ the drop member stays) | `AND k."status" NOT IN ('MERGED','CLOSED')` in the `NOT EXISTS`. |
| RV14-15 | INFO | `followPartyMerge` also moves MERGED/CLOSED (erased) rows. `findCustomerByPartyId` does not filter status, so the survivor's card can show an older merged/erased row (RV14-6). The move writes no audit or outbox event (same as `setCustomerPartyId`), so CRM/chat bridges keyed on `member.*` events do not react. `ChatContact.partyId` keeps the dropped Party, while `ChatContact.customerId` and `CrmContact.memberCustomerId` still point to the right member (probe `F-crm-ref` ✅). Under READ COMMITTED, a concurrent link onto the survivor can leave 2 members per system on it; there is no unique constraint on `Customer.partyId`, so it does not fail. | probe r3 F-* | Optional: filter status in the move; leave the rest. |

### Builder claims, verified
1. **RV14-1:** the 360 member block and `contact.memberCustomerId` are null for a member-blind viewer (probe `Q-360-fixed` ✅; builder C1/C2/C5 ✅). **`briefFor` refusal:** 13 actor shapes agree with `visibleCustomerIds` (probe R-B). Legitimate callers I traced do not regress:
   - `me.ts`: CUSTOMER with `customerId` ⇒ `canReadMember`.
   - voucher `issue`: its gate `hasMemberPerm(member.promo.issue)` implies `canReadMember` for every actor shape (probe `B-voucher-gate-implies-read`). Stamp, journeys, referrals, campaigns and approval go through that gate; `issueApprovedBatch` uses `memberRefs`.
   - `chat-bridge`: checks `canReadMember` first.
   - Mobile staff routes: check `canReadMember`.
   - Member REST and member AI tools: member scopes ⇒ implicit read.
   - `members-actions.gate` / `segments` / `import` / `insights` / `tier-history` / `identities` / `activity`: behind member keys, and core `evaluate` passes STAFF only with `member.customer.read`/`member.*`.
   - POS and kanban do not call it.
   - Background "system" jobs pass OWNER-like or member-keyed actors.
   - The member assistant `namesFor` for a blind asker keeps the codes (intended).

   `qc-member-m1.4` (briefFor contract) **37/37**.
2. **RV14-2 `asker`:** it is set only inside `assistantActor` from `runAccountTool(opts.asker)`; the only production caller is `tools-account.ts`, which derives it from the server-side AI actor. It cannot be smuggled through tool args (`Unrecognized key: "asker"`, probe `A-args-smuggle` / `A-runAccountTool-args`). A hand-written system actor is refused. A genuine `scheduled-task` actor gets no data. `crmViewerOfApi` is the only reader (account ops only). Kanban, member and CRM assistants never set it, so their behaviour is unchanged. Per AI actor kind (probe R-A): OWNER true · STAFF acc+member read true · STAFF acc-only false · key acc-only false · key acc+`member.customer.read` true. A key-driven assistant gets exactly what the same key gets over REST (STAFF `["*"]` + key scopes), not more.
3. **RV14-3 `followPartyMerge`:** tagged-template `$executeRaw`, so it is parameterised (an injection-shaped id moves 0 rows). It is tenant-scoped on both sides (another tenant's row with the same `partyId` is untouched; called with the wrong tenant, it moves only that tenant's own row). It works per member system. The both-sides case leaves both (builder G3). It is inside `mergeContacts`' transaction. It never crosses tenants or systems. Edge cases: RV14-14 and RV14-15.
4. **QC1 deletions** (read-only `review/qc1-r3-check.mts`): both leftover Party ids are gone. There are 0 references in every `*party*id` column, `Party.mergedIntoId`, KanbanCardLink PARTY, AuditLog and OutboxEvent. The seed has 0 Party rows with the P7 tax id, 63 Parties, 63 account contacts and 0 QC-TMP rows.
5. **Oracle integrity:** `80f776a9..7c151cc8` touches no `scripts/qc-*.mts` oracle and none of my review files.

### Runs (round 3; each through `iso.sh` + `with-gate-lock.sh`, one at a time)
| run | DB | result |
|---|---|---|
| my round-1 probe `review/probe-cf19-review.mts` (unedited) | QC2 | **41/41** |
| new `review/probe-cf19-review-r3.mts` (own tenants `qc-cf19r3-*`, swept to 0) | QC2 | **32/35**. Reds = `Q4-consent`, `Q5-list-dto`, `Q5-csv` (RV14-13 / RV14-12, intentional). R-B 14/14 · R-A 9/9 · R-F 6/6 · clean ✅ |
| builder `probe-cf19.mts` | QC2 | **45/45** (links tab: OWNER 12 · no member read 11 · branch-limited 12) |
| `qc-crm-c5.3 --only=L1,L3` | QC2 | 19/19 |
| `qc-crm-c1.3` · `qc-crm-c1.4` | QC3 | 89/89 · 110/110 |
| `qc-member-m1.4` (profile/briefFor contract; no live server needed) | QC3 | **37/37** |
| `qc-member-m3.7` (history) | QC3 | 19/23. Reds S2.1 (account-document read-through empty on QC3), S3.1 (kinds document/tier missing in the data), S5.2 (4 outbox rows stuck on the shared QC3 queue), S6.2 (needs a live server for screenshots). The suite's checks do not call `briefFor`, and the visibility check S4.1 is green. **Not compared with a base run** (no clean base worktree available) |
| typecheck (5 GB) · fitness no env · fitness QC2 | — / QC2 | exit 0 · 42/42 · 42/42 |
| `review/qc1-r3-check.mts` (read-only) | QC1 | see point 4. No QC1 suite re-run in round 3 |

### Not verified (round 3)
- No built app or browser. CRM REST `contacts.list`/`brief` exposure of `memberCustomerId` comes from reading the code (`items: r.items`, `ContactBrief`); the service result was measured.
- `qc-member-m3.7` reds not compared against a base tree.
- Concurrency of `followPartyMerge` is reasoned, not raced.
- Prod not checked.

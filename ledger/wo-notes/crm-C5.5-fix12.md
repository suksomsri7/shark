# C5.5-fix12: duplicate checks no longer hand out records the caller cannot see (RV10-1 + sweep) · masked writer echoes (RV10-2) · kanban contact subtitle (RV10-3) · exportDeals snapshot once (RV10-4). Builder note

- Branch `wip/crm-cf16` from `6cbb8f3c` (fix10 + its review), worktree `/root/projects/shark-crm-cd2`, database QC2.
- Window: 2026-10-02 03:14 → 05:54 (quota pause 04:5x–05:52, not for cause) UTC (`date -u`).
- Probe: `scripts/pending/cf16/probe-cf16.mts` + `probe-cf16-sweep.mts` (fixture `_fx.mts`, runner `run-probe.sh`, regression runner `run-cf16.sh`). RED/GREEN logs next to them.

## RV10-1 (MED): create with the phone / e-mail of an invisible contact

**The design rule kept.** Blueprint C1.4 (`ledger/crm-briefs/crm-brief-C1.4.md` §contacts.ts): "createContact (duplicate detection by phone/e-mail via Party + same-system CrmContact → returns `duplicate` candidates unless `force`)"; DESIGN-CRM §"ตัวซ้ำ": duplicates are merged through the merge page. Detection stays in identity scope (shop + system, under the identity advisory lock) — a duplicate is still a duplicate even if you cannot see it. What changed is **what goes back** and whether `force` may override it:

| The match is … | Before | Now |
|---|---|---|
| visible to the caller | `created:false` + that contact + `duplicates[]` (force creates) | **unchanged** (probe `DU-visible-unchanged`, byte-compared with the RED run: `DU-control-vs-red`) |
| invisible to the caller | `created:false` + **the invisible contact's full DTO** (name, phone, e-mail, `companyText` = hidden company's name …) + `duplicates[{contactId, name}]`; with `force` a duplicate was created and the invisible names still came back | `ContactsError("DUPLICATE", CONTACT_DUPLICATE_HIDDEN_MSG)`: "มีผู้ติดต่อที่ใช้เบอร์โทรหรืออีเมลนี้อยู่แล้ว แต่อยู่นอกขอบเขตที่บัญชีนี้มองเห็น … ขอให้หัวหน้าทีมหรือเจ้าของร้านตรวจ/มอบผู้ติดต่อนั้นให้" — no name, id, phone, e-mail, company; **`force` does not override** (the caller cannot check whether it is the same person); nothing written |
| visible + invisible (same phone) | both names in `duplicates[]` | no force: the visible one only, as before; force: the neutral refusal (would duplicate the invisible one) |

- Mechanism: `splitHitsForViewer` (`contacts.ts`) — one `contactWhere(viewer, { db: tx })` read inside the same transaction / lock as the duplicate read. `createCore` takes `viewerGate` (people and API keys: `createContact`, and `importContacts`); system paths (forms, chat, e-mail, bridges) have no viewer and are unchanged.
- `updateContact` (change phone / e-mail onto someone else's): invisible match ⇒ the same neutral DUPLICATE; visible match ⇒ the old text and `duplicates[]` (visible only).
- REST `contacts.create` (and AI `crm_create_lead`, which is that op): 409 `duplicate` with the neutral Thai text (`message_th`), no detail (`DU-rest-create`). Op summary + `docs/api/CRM-API.md` regenerated (additive sentence).
- **Residual oracle (unavoidable if duplicates are refused):** "this phone / e-mail exists somewhere in the shop" can still be learnt by trying to create. No identity, owner or company is returned. To slow it down: people (UI, assistant) are rate-limited on phone/e-mail entry (create + phone/e-mail change): `CONTACT_IDENT_RATE` 120 per 10 min per person per shop (`checkRateLimitDb`, fail-open), message `CONTACT_IDENT_RATE_MSG` (probe `RT-person-limited`). API keys already have the REST write bucket (300/min) and are not counted twice. The server actions had no limit before; mobile routes already have 120/min.
- Owner-visible trace: none added (the refusal writes nothing). See "owner questions".

## Sweep: the same class (lookup by phone / e-mail / tax id across visibility)

| # | Door | Who | What a caller who cannot see the match got at `6cbb8f3c` | Disposition |
|---|---|---|---|---|
| 1 | `contacts.createContact` (UI action, REST `contacts.create`, AI `crm_create_lead`, mobile scan accept) | `crm.contact.create` | full DTO + names of the hidden contact | **Fixed** (above) |
| 2 | `contacts.updateContact` phone/e-mail change (UI action forwarded `duplicates[].name`) | `crm.contact.update` | DUPLICATE + names of hidden contacts | **Fixed** — neutral for hidden-only, visible names only otherwise |
| 3 | `importContacts` onDuplicate=update | `crm.contact.import` (MANAGER default) | row error "ไม่พบผู้ติดต่อนี้…" (false; existence signal) | **Fixed** — neutral row error; only contacts the importer sees are updated |
| 4 | `importContacts` skip / candidate | same | skip: counted as skipped; candidate: **created a duplicate of the invisible contact** | **Fixed** — neutral row error for invisible matches, nothing created; visible matches as before (`SW-import-modes`) |
| 5 | `companies.createCompany` tax id / same Party (UI action, REST `companies.create`, AI `crm_create_company`) | `crm.company.create` | the hidden company's full DTO + `duplicateOf` + `duplicateArchived` | **Fixed** — `COMPANY_DUPLICATE_HIDDEN_MSG`, no `duplicateOf` (`DU-company-tax`) |
| 6 | `companies.updateCompany` tax id / Party repoint | `crm.company.update` | DUPLICATE + `duplicateOf` = hidden company id (UI action forwards it) | **Fixed** — `duplicateFail()` (visible ⇒ old text + `duplicateOf`; hidden ⇒ neutral, no id) (`SW-company-update-tax`) |
| 7 | `companies.restoreCompany` tax id | `crm.company.delete` | `duplicateOf` = hidden live company id | **Fixed** (same helper) (`SW-company-restore`) |
| 8 | `companies.mergeCompanies` third-company tax id | `crm.company.merge` | `duplicateOf` = hidden third company id | **Fixed** (same helper) (`SW-company-merge`) |
| 9 | Card scan accept (`calls.acceptLeadProposal`, mobile `scan-card/[id]/accept`, `force:true`) | `crm.contact.create` | nothing returned, but a **duplicate of the invisible contact was created** | **Changed by #1**: neutral refusal, proposal returns to PENDING with the neutral note (`SW-card-scan`). The proposal can still be discarded. Owner question 2 |
| 10 | AI proposal confirmation message (`api/tools.ts:471`, "…เรียบร้อยแล้ว — "<contact name>"") | confirming human | the hidden contact's name when `created:false` | **Fixed by #1** (only visible contacts come back) |
| 11 | `importCompanies` (tax id dedupe in `createCore`) | `crm.company.import` (MANAGER default) | skipped vs created counts only (no per-row detail) | **Reported** — existence-only, batched (≤ 5,000 rows per call) |
| 12 | Contact import skip/candidate counts (after #4) and every refusal above | — | existence of a phone / e-mail / tax id | **Residual by design** (refusing duplicates ⇒ existence is learnable); people rate-limited (#1), keys on the REST bucket; import is a MANAGER-default key |
| 13 | `brief.ts briefFor → contactExists` (chat CRM panel) | `chat.conversation.read` | `contactState: "hidden"` vs `"none"` | **Reported** — existence-only, intentional (N-4) |
| 14 | Chat panel "create lead" (`leadFromBridge` CHAT) | `crm.contact.create` | "ลูกค้ารายนี้มีผู้ดูแลในระบบ CRM อยู่แล้ว" (NOT_VISIBLE) | already safe (existence-only, no id/name) |
| 15 | `emails.setUserSetting` from-address check | e-mail settings | "this address is a CRM contact's e-mail" (verified domain only) | **Reported** — existence-only, low |
| 16 | `companies.importFromAccount` | no caller | — | unreachable today |
| 17 | `convertContact` new company + tax id (`TAX_COMPANY_HIDDEN_MSG`) | `crm.contact.convert` | neutral text | already safe (the model for #5–#8) |
| 18 | `findDuplicates` / `mergeContacts` / `mergeCompanies` loads, `contacts.search`, `crm_search`, `contacts.byParty`/`brief`, `findCandidates`, scan-card company match, `logCall`, mobile `callPrompt`, AI facts, `emails.sendCore`, account bridges (`service.ts`), portal invite | — | viewer-scoped | already safe |
| 19 | Event bridges (forms, chat, inbound e-mail, member, tracking identify) | public / system | nothing returned to the caller | already safe (they may write onto a hidden contact; no response) |
| 20 | `src/lib/ai/tools.ts recent_leads` (whole-shop names + phones, no visibility) | any in-app AI user / AI key | full visibility bypass (not a lookup) | **Reported** — fixed upstream by card G1 (`05dc5f74`, `visibleCrmLeads`); arrives with the merge of that branch |
| 21 | member module `createMember` (non-tx path returns `duplicate: briefOf(existing)`) | member module | outside CRM | **Reported** (member lane) |
| 22 | `getImportJob` by job UUID | any CRM user holding the UUID | another user's import row errors | **Reported** (minor; row errors no longer carry names) |

## RV10-2 (LOW): writer echoes

Every contact write now returns `viewerDtoOf(ctx, viewer, row)` — the same `viewerDto` rule as list / 360 (one `visibleCompanyStates` read per write): `createContact` (both branches), `updateContactCore` (update + import fill-blanks), and `mutate` (setTags · setLeadStatus · setLifecycle · setOptOut · assign · archive · restore …). There is no other `toDto(row)` return left in `contacts.ts`. Deal writers return `DealDto` (ids only, no names); company writers return the company the writer can see. REST / AI wrappers pass these DTOs through, so they are covered. Probe `WE-masked` (owner / manager / own-records staff / TEAM staff × update · tags · lead status · lifecycle): `companyText` = what contact 360 shows.

## RV10-3 (LOW): kanban CRM_CONTACT subtitle

`hideInvisibleCrm` (kanban `link-resolvers.ts`, the viewer pass that already hides invisible CRM links) now also sets the CRM_CONTACT subtitle through the crm facade `crm.contacts.companyTextsForCrossViewer(tenantId, viewer, ids)` — the same rule (`companyTextIf`) with company visibility from `visibility.visibleIdsForViewer` (the function the pass already uses; contacts may sit in any CRM system of the shop). 2 queries per page with contact links. Kanban reaches CRM only through `@/lib/modules/crm` (F2 ✅). Probe `KB-subtitle`: teamer (sees the contact, not its company) gets `null`, owner gets the text, a contact with free text and no company link keeps it.

## RV10-4 (INFO)

- `exportDeals` now runs inside `crmScope` (memo per call): the viewer's access snapshot (`visibility.ts` raw query over TeamMember / Team / CrmVisibilityPolicy) is read **once** per export instead of 3 times (probe `EX-visibility-once`: RED 3 → GREEN 1).
- fix10 note corrected: the 26/26 GREEN used `/tmp/cf13-logs/red3.dump.json` (the only valid baseline); `red-baseline.dump.json` was a stale copy of `red2`.

## Probe RED → GREEN

`scripts/pending/cf16/probe-cf16.mts` — personas: owner · MANAGER limited to unit `u-a` · own-records STAFF · TEAM-level STAFF (TeamMember of TA) · API key with contact read/create/update, `crm.filter.owner:<staff>` and no company read.

- RED on the `6cbb8f3c` source (my `src` diff removed, probe unchanged): **4/21** — green on RED (controls): `P-premise`, `DU-visible-unchanged`, `DU-owner-sees`, CLEAN.
- GREEN: **22/22** (+ `DU-control-vs-red`: the visible-duplicate responses of every persona are byte-identical to the RED run's dump `/tmp/cf16-logs/red3.dump.json`).
- The reviewer's `LK-create-duplicate-masked` (`scripts/pending/cf13/review/probe-cf13-review.mts`, not edited): see the regression table.

## Regression

QC2, each job in its own `iso.sh` unit under the gate lock, one at a time. Chain 1 `run-cf16.sh` (03:34 → interrupted by the quota pause after c2.11), chain 2 `run-cf16-rest.sh` (05:52 → 05:53). Summary: `scripts/pending/cf16/regress.summary`; logs `/tmp/cf16-logs/regress{,2}/`. The `src` diff was byte-identical across both chains (md5 of `git diff -- src` checked before and after the pause).

| Job | Result |
|---|---|
| typecheck (5 GB heap) | exit 0 |
| `probe-cf16` (in-chain, no baseline) | **21/21** |
| `probe-cf13` | **24/24** |
| `probe-cf13-review` (reviewer's, not edited) | **8/8** — `LK-create-duplicate-masked` flipped red → green |
| `probe-cf10` · `probe-cf10-review` | **34/34 · 18/18** |
| `probe-cf7` · `-r2` · `-review` · `-review-r2` | **30/30 · 14/14 · 27/27 · 21/21** |
| `qc-crm-c1.5` (deals) | **103/103** |
| `qc-crm-c1.4` (contacts, duplicates, writers) | **110/110** |
| `qc-crm-c1.3` (companies, tax-id duplicates) | **89/89** |
| `qc-crm-c1.7` (visibility, kanban link hiding) | **57/57** |
| `qc-crm-c1.10` (REST) | **66/66** |
| `qc-crm-c1.11` (import / merge) | **66/66** |
| `qc-crm-c2.4` (card scan) | **91/91** |
| `qc-crm-c2.11` (REST set 2) | **47/47** (finished before the pause; its SUMMARY line was not written, result read from its log) |
| `qc-crm-c3.4` (AI) | **53/53** |
| `qc-kanban-k3.1` (kanban link suite) | **19/20** — the one red is `K3.1-S6.3` "≥ 3 real screenshots in `.qc-shots/kanban/3.1`" (file count; this worktree has no shots). **Red at base too**: the same run on the `6cbb8f3c` source gives 19/20 with the same `K3.1-S6.3` (`/tmp/cf16-logs/k3.1-base.log`) |
| docs gates | crm ✅ (123 op, regenerated with the two summary sentences) · account ✅ · member ❌ / kanban ❌ only for the missing gitignored `.claude/skills/shark-{member,kanban}-api/references/endpoints.md` in this worktree (not created) |
| fitness (QC2 env) / without env | **36/36 / 36/36** |

## ORACLE-EDITs

None. No suite pinned the leaky behaviour: every suite above is green (k3.1 red only on the screenshot-count check, red at base) without any oracle edit.

## Registry rows (`scripts/crm-ui-inventory.json`)

None: no control appears or disappears for any persona; only response texts / DTO fields change.

## Process note

Running `gen-crm-api-docs.mts` in write mode also created the gitignored `.claude/skills/shark-crm-api/references/endpoints.md` (the directory did not exist in this worktree). I removed exactly what that run created (directory timestamps 03:33, the same run) so the worktree's gitignored skill folders are as before; `docs/api/CRM-API.md` is the committed output.

## Owner questions

1. Refusing a duplicate the creator cannot see (even with force) keeps the CRM free of invisible duplicates, at the price that the creator must ask a manager. OK, or should force create the duplicate and flag it for the merge page instead?
2. Card scan used to always create a lead (`force:true`, merge later). A card whose phone/e-mail belongs to a contact the scanner cannot see is now refused with the neutral text (the proposal stays open and can be discarded). OK?
3. The people rate limit on phone/e-mail entry (120 per 10 min) — OK as a number?

## Not verified

- No live :3215 build: the contact / company forms, the import panel, the card-scan sheet and the kanban card were not rendered; the services and the kanban resolver they call are covered by the probe.
- No button runner / `qc-crm-forms` (QC3 + browser); `qc-crm-c3.7` (mobile, QC3-only) not run — the mobile scan-card accept goes through `acceptLeadProposal`, exercised by `SW-card-scan`.
- REST `companies.update` / restore / merge were exercised as services, not through the REST dispatcher (the dispatcher drops `duplicateOf` anyway: `http-errors.ts`).
- The rate limit was exercised by pre-filling the bucket, not by 120 real requests; concurrency of `checkRateLimitDb` is that function's own tested property.
- `recent_leads` (sweep #20) is fixed on another branch, not here.

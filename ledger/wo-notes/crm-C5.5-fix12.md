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

## Round 2 (after the independent review): RV12-1 · sweep row #22

- Same branch / worktree / QC2. Base `16b4b006` (review commit). Window 2026-10-02 07:10 → 07:55 UTC (`date -u`).
- Probe: `scripts/pending/cf16/probe-cf16-r2.mts` (fixture `_fx.mts`, label `r2`), runner `run-r2.sh`, chains `run-r2-regress.sh` + `run-r2-tail.sh`. Logs `probe-cf16-r2.{red,green}.log` next to them, chain logs `/tmp/cf16-r2-logs/regress{,2}/`.

### RV12-1 (LOW): the phone/e-mail rate-limit refusal is a rate limit, not a plan cap

The codebase convention for a limiter refusal is the one in `crm/api/portal-lane.ts` (`RATE_LIMITED` → `nothingWritten(crmApiError(429, "rate_limited", …))`) and `member/api/http-errors.ts` (`as400`: status 429 → `nothingWritten(ApiError(429, "rate_limited", …))`). `withIdempotency` already releases the reservation for a transient status (409/429/503) when the error carries `nothingWritten`, and the CRM OpenAPI intro already lists `rate_limited` among the codes that are not stored. Reused as is, no new mechanism:

| Layer | Before (`16b4b006`) | Now |
|---|---|---|
| service (`contacts.ts assertIdentRate`) | `ContactsError("LIMIT", …)` (the plan-cap code) | `ContactsError("RATE_LIMITED", CONTACT_IDENT_RATE_MSG(sec), { retryAfterSec })` — new code in `ContactsErrorCode`, optional `retryAfterSec` on `ContactsError` |
| text (`contacts-shared.ts CONTACT_IDENT_RATE_MSG`) | "เพิ่มหรือแก้เบอร์โทร/อีเมลของผู้ติดต่อถี่เกินไป — รอ N นาทีแล้วลองใหม่ …" | "มีการเพิ่มหรือแก้เบอร์โทร/อีเมลของผู้ติดต่อหลายครั้งในเวลาสั้น ๆ ระบบจึงพักรายการนี้ไว้ก่อน (ยังไม่ได้บันทึก) — รออีกประมาณ N นาทีแล้วลองใหม่ได้เลย (ถ้าต้องเพิ่มทีละมาก ๆ ใช้ "นำเข้าไฟล์")". It says nothing was saved and how long to wait, does not blame the user, and does not share wording with the plan-cap text ("ถึงเพดาน…") |
| REST (`crm/api/http-errors.ts toCrmApiError`) | `LIMIT` → 409 `state_conflict` "This CRM system reached one of its limits…", stored and replayed | `RATE_LIMITED` → **429 `rate_limited`**, `nothingWritten`, `hint: retryAfterSec=<n>`, EN "Too many attempts in a short time, so nothing was saved. Wait a few minutes and try again." The plan-cap `LIMIT` is unchanged (409, stored) |
| AI confirmation (`api/tools.ts dispatchCrmKind` → `mapError().message_th`) | the old Thai text | the new Thai text (unchanged code path) |
| UI contact form actions (`contacts-actions.ts failOf`) | `{ error: <Thai text>, code: "LIMIT" }` | `{ error: <new Thai text>, code: "RATE_LIMITED" }` (unchanged code path: ContactsError message + code pass through) |
| web card-scan accept action (`calls-actions.ts failOf`) | any ContactsError → the generic "บันทึกไม่สำเร็จ … ลองใหม่อีกครั้ง" | `RATE_LIMITED` → the service text + code (narrow, one line) |
| mobile (`crm/mobile.ts mobileErrorOf`, scan-card accept) | any ContactsError → 500 "ระบบ CRM ขัดข้องชั่วคราว" | `RATE_LIMITED` → **429 `rate_limited`** + the service text |

- API keys are still not counted (their REST write bucket already returns 429). So `/api/v1/crm` key callers never see this refusal, and the CRM REST docs need no change (`gen-crm-api-docs --check` ✅). Its `rate_limited` row ("Too many calls for this key and class") stays accurate for keys.
- Bridges (forms · chat · inbound e-mail) still treat any `ContactsError` as permanent (WARN, done). They run without a person, so the limiter does not apply to them (unchanged).

### Sweep row #22 (LOW): `getImportJob` by job id

Rule: an import job is readable by **the person who ran it** (the audit row's `actorId` = the caller's person, `ctx.actorUserId`, which is the same value `importContacts` writes) and by **the shop OWNER**. The OWNER already sees every contact and the shop's whole audit trail, so this rule takes nothing away from them.
- Everybody else holding the id gets exactly the answer of an id that does not exist: STAFF, a MANAGER (who may be unit-limited and not see the touched contacts), and an API key whose creator did not run the job. That answer is `NOT_FOUND` "ไม่พบงานนำเข้านี้ในระบบ CRM นี้".
- This is the same "requester only" model as the other CRM job reads: `privacy.getExport` / `listMyExports` (`createdById = caller`) and `reports.getExport`. Those do not even except the OWNER. I kept the OWNER for imports because the reviewer's suggested rule says so and the OWNER can read the same row in the audit log anyway.
- There is no import-job list in the app, and no REST / AI op reads a job. Callers are the service itself and the QC suites; every suite reads its own job (`qc-crm-c1.4` S9.14, `probe-cf7-review-r2`, `probe-cf10(-review)`: the runner, or the OWNER for the legacy row). All are green.
- API key: `ctx.actorUserId` of a key is its creator, so a key sees the jobs its creator ran (by UI or by that key). Not reachable today (no op).

### Probe RED → GREEN (`probe-cf16-r2.mts`)

- RED, on the `16b4b006` source (my `src` diff removed, final probe, then the diff re-applied; md5 of `git diff -- src` identical before and after): **2/8**. The green rows are the plan-cap control and CLEAN.
- GREEN: **8/8**.

| Check | RED | GREEN |
|---|---|---|
| `R2-RL-service`: code, text (no "เพดาน"), `retryAfterSec`, 0 rows | `LIMIT`, old text, no retryAfterSec | `RATE_LIMITED`, new text, 600 s, 0 rows |
| `R2-RL-rest-shape`: `toCrmApiError` | 409 `state_conflict`, stored, plan-cap EN | 429 `rate_limited`, nothingWritten, hint `retryAfterSec=600` |
| `R2-RL-mobile`: `mobileErrorOf` | 500 "ระบบ CRM ขัดข้องชั่วคราว" | 429 `rate_limited` + the text |
| `R2-RL-idem-retry`: `withIdempotency` with a person actor; bucket full → retry with the same Idempotency-Key after the bucket is cleared | 409, stored for replay = 1, retry → **replayed 409**, 0 rows | 429, stored = 0, retry → **201 created**, not replayed, 1 row |
| `R2-RL-ai-message`: `dispatchCrmKind` (AI proposal confirmation) | old text | new text, 0 rows |
| `R2-RL-plan-cap-control`: plan-cap `LIMIT` | 409 `state_conflict`, stored | same |
| `R2-JB-scope`: owner→own · s1→own · owner→s1's read; s2→owner's · s2→s1's · s1→owner's · manager→s1's · key(of s2)→s1's = the not-found answer of a non-existent id | every one of the five reads the job | as wanted |

The web card-scan accept action change (`calls-actions.ts`) came after the RED run. It cannot be driven from a probe (the server action needs a request session), so it was read, not executed.

### Regression (QC2, one job at a time, each in its own `iso.sh` unit under the gate lock)

Summary: `scripts/pending/cf16/regress-r2.summary`. Chain 1 `run-r2-regress.sh` 07:16:40 → 07:39:38 (src md5 `d8e8b8dd…` at start and end). Chain 2 `run-r2-tail.sh` 07:40:06 → 07:52:41 (src md5 `2871ac57…` at start and end = the committed src), after the `calls-actions.ts` line: the jobs that the change touches (+ docs-crm --check ✅).

| Job | Result |
|---|---|
| typecheck (5 GB heap) | exit 0 (chain 1) · exit 0 (chain 2) |
| `probe-cf16-r2` | **8/8** (chain 1) · **8/8** (chain 2) |
| `probe-cf16` vs the round-1 RED dump (`/tmp/cf16-logs/red3.dump.json`) | **22/22** (`RT-person-limited` now expects `RATE_LIMITED`; `DU-control-vs-red` differing: []) |
| `probe-cf16-review` (reviewer's, **not edited**) | **8/10**. Red: `RL-limit` and `RL-assistant-counted`. Both assert `codeOf(…) === "LIMIT"`, the very code RV12-1 replaces. Everything else in those two checks holds: at the limit → `RATE_LIMITED` with **0 writes** across the tenant; without a phone OK; other user OK; same user in another shop OK; the AI assistant actor is still counted and refused. Its info row `RL-rest-shape` now reads 429 `rate_limited`; `JB-other-user` now reads NOT_FOUND. **ORACLE question for the controller/reviewer**: these two checks pinned the old code |
| `probe-cf13` · `probe-cf13-review` | **24/24 · 8/8** |
| `probe-cf10-review` (getImportJob: cap, legacy row as OWNER) | **18/18** |
| `probe-cf7-review-r2` (getImportJob parity) | **21/21** |
| `qc-crm-c1.4` (contacts; S9.14 import job read) | **110/110** |
| `qc-crm-c1.11` (import / merge) | **66/66** |
| `qc-crm-c1.10` (REST) | **66/66** |
| `qc-crm-c2.4` (card scan) | **91/91** (chain 1) · **91/91** (chain 2) |
| docs `--check` | crm ✅ (123 op, no change needed) · account ✅ · member ❌ / kanban ❌ only because the gitignored `.claude/skills/shark-{member,kanban}-api/references/endpoints.md` do not exist in this worktree (as in round 1; not created) |
| fitness (QC2 env) / without env | **36/36 / 36/36** (chain 1 and chain 2) |

### ORACLE-EDITs

- Mine: `probe-cf16.mts RT-person-limited` `"LIMIT"` → `"RATE_LIMITED"` (builder probe; the change is the finding).
- Reviewer files: none edited. `probe-cf16-review` RL-limit / RL-assistant-counted pin the old code (above).

### Not verified (round 2)

- No live :3215 build: the contact form, the card-scan sheet (web and mobile) and the AI proposal card were not rendered with the new text.
- The web card-scan accept action and the contact form actions were read, not executed (they need a request session). Their pass-through of `ContactsError` message + code is a one-line read.
- Through the HTTP dispatcher only via `withIdempotency` + the op handler (the shape `dispatch.ts` uses), not a real HTTP request. No real `/api/v1/crm` caller can hit this limit anyway (keys are exempt).
- Round-1 items stand (no real 120-request burst; the bucket is pre-filled).
- **Seen, not fixed (outside the two findings)**: `calls-actions.ts failOf` (web card-scan accept) still turns a hidden-duplicate `DUPLICATE` (`CONTACT_DUPLICATE_HIDDEN_MSG`) into the generic "บันทึกไม่สำเร็จ … ลองใหม่อีกครั้ง". `mobileErrorOf` still turns `ContactsError` `DUPLICATE` / `LIMIT` into 500 "ระบบ CRM ขัดข้องชั่วคราว". The round-1 neutral DUPLICATE text therefore reaches the service and the REST/AI paths but not those two screens. Retrying does not help there, and the user is not told why.

### QC2 clean (round 2)

- `review/leftover-check.mts` (unedited): `qc-cf16/13/10/7-*` tenants = 0, users = 0.
- 7 orphan `crm:contact:ident:<dead tenant>:<user>` buckets were left by the suites of the two chains (the review had left 0). I deleted them with that script's `--clean`; re-check: 0.
- `probe-cf16-r2` deletes its own buckets (tenant prefix) and its `ApiIdempotency` rows (`keyId` prefix = its tag) in `done()`.

## Round 3 (after the review's round-2 re-check): RV12r-1 · RV12r-2

- Base `5067e1f6` (reviewer's re-check commit). Window 2026-10-02 08:05 → 08:21 UTC (`date -u`).
- Probe: `scripts/pending/cf16/probe-cf16-r3.mts` (runner `run-r2.sh`), chain `run-r3-regress.sh`. Summary `regress-r3.summary`, logs `probe-cf16-r3.{red,green}.log`.

### Change

One pure helper `contactRefusalOf(e)` in `contacts-shared.ts` covers the contact-service refusals that must reach the person as the service's own Thai text: they are not system faults, and retrying does not help. It returns code + status + message only; `duplicates[]` is **never** forwarded. Any other `ContactsError` code → `null`, and callers keep their old path.

| Code | What it is | status |
|---|---|---|
| `DUPLICATE` | the round-1 neutral text for a hidden match (`CONTACT_DUPLICATE_HIDDEN_MSG`: no name, id, phone, e-mail or company) | 409 |
| `LIMIT` | plan cap, the `crmLimitMessage` text | 409 |
| `RATE_LIMITED` | round 2 | 429 |

- **RV12r-1 (web card-scan accept)**: `calls-actions.ts failOf` calls the helper before the generic "บันทึกไม่สำเร็จ … ลองใหม่อีกครั้ง". This replaces the round-2 RATE_LIMITED-only line. The UI (`src/components/crm/call/CrmCardScanButton.tsx accept()`) shows `r.error` under the scanner and **keeps the draft**, so "ทิ้งร่าง" is still there.
- **RV12r-2 (mobile)**: `mobileErrorOf` maps the helper result to 409 `duplicate`, 409 `limit` or 429 `rate_limited` with the service text (previously DUPLICATE / LIMIT gave 500 "ระบบ CRM ขัดข้องชั่วคราว … ลองใหม่").
  - **What the app does with it** (read): `apps/mobile/src/api/client.ts api()` turns any non-2xx into `ApiError(status, body.error, body.message)`, and `apiErrorText()` returns `body.message` verbatim whenever it contains Thai, **regardless of status**.
  - `apps/mobile/app/(app)/crm/scan-card.tsx accept()` puts that in the on-screen `CrmNotice` (no Alert), keeps the draft, and leaves "ทิ้งร่าง" enabled.
  - So the person now reads the neutral text ("…ขอให้หัวหน้าทีมหรือเจ้าของร้านตรวจ/มอบผู้ติดต่อนั้นให้") or the plan-cap text ("ถึงเพดานผู้ติดต่อ … ติดต่อทีม SHARK"), and is no longer told to retry.
  - The app does not branch on 409 or on the `error` code; nothing else in the app reads this endpoint's errors. The mobile code needed no change.
- Visible duplicates on these two paths: unchanged. `acceptLeadProposal` uses `force:true`, so a card whose match the scanner can see is still accepted (a duplicate is created, as before) and never reaches the helper. The owner still accepts a card matching a contact others cannot see.

### Probe RED → GREEN (`probe-cf16-r3.mts`)

- RED, on the `5067e1f6` source (src diff removed, then re-applied; md5 `2c439274…` before and after): **2/8**. The green rows are `R3-visible-control` and CLEAN.
- GREEN: **8/8**.

| Check | RED | GREEN |
|---|---|---|
| `R3-WEB-wired`: failOf calls the helper before the generic text (static; the action needs a request session) | ❌ | ✅ |
| `R3-WEB-dup-hidden`: STAFF accepts a card whose phone is a hidden contact's → what the web action passes on; no hidden id/name/phone/e-mail/company | no helper (action = generic text) | DUPLICATE 409 + neutral text, no `duplicates`, leaks [] |
| `R3-MOB-dup-hidden`: `mobileErrorOf` on the same real error; proposal stays PENDING; rows with that phone = 1 | 500 "ระบบ CRM ขัดข้องชั่วคราว" | 409 `duplicate` + neutral text |
| `R3-visible-control`: visible match (STAFF) → accepted, duplicate created; owner on the hidden one → accepted | ✅ | ✅ (unchanged) |
| `R3-cap`: `Tenant.limits.crm.contacts = 1` (restored after) → service LIMIT → web / mobile; nothing created | web generic, mobile 500 | web LIMIT 409, mobile 409 `limit`, Thai cap text, 0 rows |
| `R3-rate-limited`: bucket full → 429 on both | web no helper (mobile already 429) | 429 on both |
| `R3-scope`: other codes (VALIDATION) → helper `null`; mobile keeps its old answer | no helper | ✅ |

### Regression (QC2, one job at a time, each in its own `iso.sh` unit under the gate lock)

`run-r3-regress.sh` 08:11:20 → 08:20:19, src md5 `2c439274…` at start and end.

| Job | Result |
|---|---|
| typecheck (5 GB heap) | exit 0 |
| `probe-cf16-r3` · `probe-cf16-r2` | **8/8 · 8/8** |
| `probe-cf16` vs `/tmp/cf16-logs/red3.dump.json` | **22/22** |
| `review/probe-cf16-review` · `review/probe-cf16-review-r2` (not edited) | **10/10 · 6/6** |
| `qc-crm-c2.4` (card scan) | **91/91** |
| docs `--check` crm · account | ✅ (123 op) · ✅ (199 op). No REST change |
| fitness (QC2 env) / without env | **36/36 / 36/36** |

QC2 clean: `qc-cf16/13/10/7-*` tenants = 0, users = 0. One orphan `crm:contact:ident:*` bucket from the chain's suites was deleted with `review/leftover-check.mts --clean` (unedited); re-check: 0.

### Not verified (round 3)

- The web action and the mobile route were not executed end to end: the action needs a request session, the route needs a mobile Bearer token. What they return is the helper / `mobileErrorOf` result on the real errors `acceptLeadProposal` throws, plus a static check that `failOf` calls the helper. The UI handling (web `CrmCardScanButton`, app `scan-card.tsx` + `apiErrorText`) was read, not rendered.
- `mobileErrorOf` still returns 500 for other `ContactsError` codes (e.g. VALIDATION, NOT_FOUND from contact paths): pre-existing and outside RV12r-2 (`R3-scope` pins that it is unchanged).

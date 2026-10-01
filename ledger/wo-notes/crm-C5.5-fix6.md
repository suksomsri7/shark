# C5.5-fix6: company picker hidden for users who cannot link a company (F3) and unverified-sender flag in AI briefs (R2-2). Builder note

Branch `wip/crm-cf7`, from `4b5ca1cb` (session/crm code tip). Worktree `/root/projects/shark-crm-cd2`. Database **QC2**. No schema change, no migration.
- Probe: `scripts/pending/cf7/probe-cf7.mts` (fixture `_fx.mts` is the cf5 fixture with tag `qc-cf7-*`).
- Runner: `scripts/pending/cf7/run-cf7.sh`.
- Logs in the repo: `probe-cf7.red.log`, `probe-cf7.green.log`, `regress.summary`. Full logs are in `/tmp/cf7-logs/`.

**Probe: RED 12/30 on the untouched src (19:3x UTC, re-run with the final probe against `git checkout HEAD -- <src files>`) → GREEN 30/30 (inside the regression run, 19:40 UTC).**
- All 18 findings were ❌ before the fix and ✅ after.
- The positive controls, the premises and CLEAN (2 throwaway tenants, 0 rows left) were ✅ in both runs.
- One probe bug was fixed between the first RED run and the final one: the `/deals/new` render was called with the actor instead of the persona. The final RED run is the one in the repo log.

## The rule (§15(b))
From `ledger/wo-notes/crm-C4.2.md` ("§15 Controller rulings on it3 (28 Sep ~10:30 UTC) — BINDING"), on branch `wip/crm-c42b`:
> nok/thana permissions: **(b)** — the registry follows the REAL permission model: for each row, `hiddenFor` includes a STAFF role whenever
> that role lacks the crm key that gates the control (derive from the seed memberships, not by hand). The product must HIDE such controls
> (B1/B2/B5/B6 are product bugs → work order **C4.2-fix**); until fixed they stay red as hiddenLeak/wrongExpect — never mark them passed.

## F3: company picker shown to users without `crm.company.read`. Fixed.

### Gate
New function `crmCanLinkCompany(actor)` in `src/lib/modules/crm/access.ts:90-96`. It returns `crm.company.read && crm.company.update`.
- **Read** is needed because the picker searches through `companyWhere`. Without read, every search is empty.
- **Update** is needed because linking, moving and clearing the primary company all go through `companies.addContact/removeContact`, and both check `crm.company.update`.

The convert modal and `/deals/new` only need `crm.company.read`:
- convert links through `linkContactInTx`, which is covered by `crm.contact.convert`;
- deal create only checks that the company is visible.

### Sweep of the picker and its look-alikes
`ContactPicker` (`contact-pick-<kind>-q/-select`) is used only in the contacts folder. The sweep also covered other company choosers on contact, deal and activity forms.

| Where | Control | Decision |
|---|---|---|
| `/contacts/new` (`NewContactForm.tsx`, page `contacts/new/page.tsx`) | `ContactPicker kind="company"` | **Hidden** unless `crmCanLinkCompany`. With no picker, `companyId` is sent as `null`. |
| Contact 360 "แก้ไข" sheet (`Contact360Actions.tsx` `ContactMenu`) | `ContactPicker kind="edit-company"` + `contact-edit-move-deals` | **Hidden** unless `can.company = crmCanLinkCompany`. Instead it shows a read-only line `contact-edit-company-readonly` "บริษัทหลัก: <name>" **only** when `contact.companyName` is set. The page fills it from `getContact360().company?.name`, which is filtered by `companyWhere`, so the line never names a company the viewer cannot see (no-read user: null, nothing shown). Save never sends `companyId` when the picker is hidden. The page also passes `companyId` (raw id) only to users who can link; it is used only for the move-deals toggle. |
| Contact 360 convert modal (`ConvertButton`) | radio `contact-convert-company-mode-pick` + `ContactPicker kind="convert-company"` | **Hidden** without `crm.company.read`. "สร้างบริษัทใหม่" stays. |
| Contact 360 merge sheet | `ContactPicker kind="merge"` (searches contacts) | Unchanged: not a company picker. |
| `/deals/new` (`NewDealForm.tsx`) | select `deal-new-company`. Options come from `contactCompanyOptions`, filtered by `companyRefsInTx(actor)`. | **Hidden** without `crm.company.read`. Without read the list always held only "ไม่ผูกบริษัท", a dead control. The `contactCompaniesAction` call is also skipped. The server still defaults the deal's company from the contact cache (`deals.ts:720`), exactly as before, because the old select sent `null` too. |
| Deal 360 | no company edit control (`deal-company-link` is a link, not changed here) | Nothing to do. |
| Activity log (`LogActivityForm`) | mixed contact/deal/company target search | Unchanged. It also searches contacts and deals, so it is never "always empty", and company hits are already visibility-filtered. |
| Contact import mapping (`ContactListTools`/`ContactImportPanel`, target `company`) | column → field mapping (free-text company name), not a picker | Unchanged. It needs `crm.contact.import` (not in STAFF defaults), and failures are reported per row. **Noted, not changed:** when the company step of a row fails (e.g. no `crm.company.create`), `importContacts` has already counted the row as `created` and then also counts it as `failed`. |
| v1 `ui.tsx` contact form · mobile API routes | no company picker | Nothing to do. |

### Server side: before and after
All checks run **before any write**. `need()` → `FORBIDDEN` with `crmForbiddenMessage(key)`.

| Call (user lacking the key) | Before (4b5ca1cb) | After |
|---|---|---|
| `createContact({companyId})`, no `company.read` | `VALIDATION` "ไม่พบบริษัทที่เลือก…", nothing created (misleading "choose again") | `FORBIDDEN` "…สิทธิ์ "ดูบริษัท"…", nothing created (`contacts.ts:826-831`) |
| `createContact` without `companyId`, same user | OK | OK (unchanged) |
| `updateContact({firstName, companyId:null})`, no read, contact has a company | **half-written**: `firstName` committed, plus an audit row and an event that say `companyId` changed, then `removeContact` `NOT_FOUND` → error; company kept | `FORBIDDEN`, nothing written (0 audits) (`contacts.ts:990-999`) |
| `updateContact({companyId: other})`, no read | `VALIDATION` "ไม่พบบริษัท…" | `FORBIDDEN`, unchanged |
| `updateContact({jobTitle, companyId: <current>})`, no read (an API client sending back the DTO it read; the DTO carries `companyId`) | `VALIDATION` refused the whole patch | **accepted**: the echo is not a change, `jobTitle` saved, company kept |
| `updateContact` without `companyId` (the edit sheet's own call), no read | OK, company kept | OK, company kept (unchanged) |
| `updateContact({firstName, companyId: other})`, read but no `company.update` | **half-written**: `firstName` committed + audit, then `addContact` `FORBIDDEN` | `FORBIDDEN`, nothing written |
| `updateContact({companyId: B})`, read + update | OK, moved | OK, moved (control) |
| `convertContact({company:{id}})`, no read | `NOT_FOUND` "ไม่พบบริษัท…" | `FORBIDDEN` (`contacts.ts:1829`). Convert with a NEW company is unchanged. |
| `createContact({companyId})`, read but no `company.update` | contact created + warning (link failed) | unchanged (the picker is now hidden for this user) |

The REST ops `contacts.create/update` and the card scan (`calls.ts:699`) use the same service, so they get the same behaviour.

### Probe checks (`probe-cf7.mts`)
**UI checks.** These render the real client components with `react-dom/server`, a stub app router and the props the pages compute. Sheets are opened by forcing the parent's n-th `useState`; the modal testid present is the positive control.

| Check | RED → GREEN |
|---|---|
| `UI-new-hidden` | ❌ → ✅ |
| `UI-edit-hidden-noread` (no picker, no company name) | ❌ → ✅ |
| `UI-edit-hidden-readonly` (read-only line with the visible name) | ❌ → ✅ |
| `UI-convert-hidden` | ❌ → ✅ |
| `UI-deal-hidden` | ❌ → ✅ |
| Owner controls `UI-new-control`, `UI-edit-control`, `UI-convert-control`, `UI-deal-control` | ✅ → ✅ |
| `UI-360-visibility` (`getContact360().company` is null for a no-read user) | ✅ → ✅ |

**Server checks.**

| Check | RED → GREEN |
|---|---|
| `SRV-create-refused` | ❌ → ✅ |
| `SRV-clear-refused` | ❌ → ✅ (RED showed the half-write) |
| `SRV-change-refused` | ❌ → ✅ |
| `SRV-echo-kept` | ❌ → ✅ |
| `SRV-noupdate-atomic` | ❌ → ✅ |
| `SRV-convert-pick-refused` | ❌ → ✅ |
| `SRV-create-plain`, `SRV-edit-keeps`, `SRV-control-move` | ✅ → ✅ |

**Wiring checks.** These are source checks that the pages pass the gate: `W-new`, `W-360-menu`, `W-360-convert`, `W-deal-new`, all ❌ → ✅. The pages themselves are server components behind `requireTenant` and were not rendered.

### Registry rows changed (`scripts/crm-ui-inventory.json`, this branch)
| testid (page) | before | after |
|---|---|---|
| `contact-pick-*-q` (`/contacts/new`) | roles owner,manager,nok,thana · hiddenFor [] | roles owner,manager · hiddenFor nok,thana · + `alsoOn ["/contacts/[contactId]"]` |
| `contact-pick-*-select` (`/contacts/new`) | same as above | same as above |
| `contact-edit-move-deals` (`/contacts/[contactId]`) | roles owner,manager,nok,thana · hiddenFor [] | roles owner,manager · hiddenFor nok,thana |
| `deal-new-company` (`/deals/new`) | roles owner,manager,nok,thana · hiddenFor [] | roles owner,manager · hiddenFor nok,thana |

**Mirroring into the c42b `next/` copy.** I compared field by field with `wip/crm-c42b:scripts/pending/c42b/next/crm-ui-inventory.json`:
- The two `contact-pick-*` rows are already **identical**.
- `contact-edit-move-deals` already has hiddenFor nok,thana there. It differs only in runner fields `opener`/`needs`, which exist only on c42b.
- **Only `deal-new-company` needs mirroring there:** `roles ["owner","manager"]`, `hiddenFor ["nok","thana"]`. Keep its c42b `opener`/`needs`.

Fitness F14.1/F14.2 is green: 1066 testids, 1066 rows. `contact-edit-company-readonly` is a `<p>` (not interactive), so it needs no row.

## R2-2: AI assist briefs passed forged-mail subjects without the flag. Fixed.
**Where:** `src/lib/modules/crm/ai-bridges.ts`. The fix covers `dealFacts` (the review said the deal brief has the same gap), `contactFacts` and `companyFacts`.

**Change:**
- The activity selects now also read `id/type/source/direction/sourceRef` (`FLAG_SELECT`).
- `unverifiedEmailRefs(scope, acts)` is called **once per brief**. That is one `crmEmailMessage` query, scoped to tenant + CRM system. No N+1.
- Flagged lines get ` (sender not verified)` right after the title.
- Inbound EMAIL rows from an authenticated sender, and a NOTE that shares the forged `sourceRef`, are not flagged (single reader, `isInboundEmailActivity`).

**Probe:**
- `AI-contact.whyHot`, `AI-company.summary` and `AI-deal.summary`: ❌ → ✅. Each captures the real prompt through the `deps.ai` stub. Example forged line: "- EMAIL 2 ต.ค. 2569 ปลอม … (sender not verified)".
- `AI-premise` (forged flag true, authenticated undefined): ✅ → ✅.

## Verification
`regress.summary`, all on QC2 under the gate lock, each job in its own `iso.sh` unit, 19:40–20:04 UTC.

**Probes:**

| Job | Result |
|---|---|
| probe-cf7 | **30/30** |
| probe-cf5 | 22/22 |
| probe-cf5-r2 | 14/14 |

**Suites:**

| Suite | What it covers | Result |
|---|---|---|
| qc-crm-c1.4 | contacts: create/edit/360/convert | 110/110 |
| qc-crm-c1.3 | company 360 | 89/89 |
| qc-crm-c1.5 | deals incl. createDeal | 103/103 |
| qc-crm-c1.6 | | 79/79 |
| qc-crm-c1.7 | keys and visibility | 57/57 |
| qc-crm-c1.11 | merge/import | 66/66 |
| qc-crm-c3.4 | AI bridges | 53/53 |

**Gates:**

| Gate | Result |
|---|---|
| `pnpm typecheck` | exit 0 |
| fitness with env | 36/36 |
| fitness without env | 36/36 |
| docs crm | ✅ 123 op |
| docs account | ✅ 199 op |
| docs member, docs kanban | ❌ only because the gitignored `.claude/skills/shark-{member,kanban}-api/references/endpoints.md` is missing in this worktree (0 bytes vs expected), same as the fix3b runs. The generators wrote nothing; `.claude/skills` still holds only `shark-account-api`. |

## Not verified
- The pages themselves were not rendered as server components. The probe renders the client components with the page's gate values and checks the page source passes those values. There was no live :3215 build and no button-runner run, so run4 chunk 7 `/contacts/new` and `/deals/new` are still to be run by the controller after a rebuild.
- `qc-crm-forms` (C4.3 form runner) was not run. It needs a QC3 answer key (`.qc-shots/c43/qc3-crm-expected.json`), which is absent in this worktree, plus a browser.
- Clearing the primary company by a user who has read + update but cannot see the contact's current company (other team) still fails only after the contact row is committed, at `removeContact` `NOT_FOUND`. This is the visibility case, pre-existing and not changed.
- The import-row double count noted in the sweep table.
- That the c42b `next/` registry copy mirrors `deal-new-company`: that is for the controller to do.

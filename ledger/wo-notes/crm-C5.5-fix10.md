# C5.5-fix10: names on deal surfaces follow the viewer's visibility (FX7-1 + sweep) · DATETIME export ms (FX7-3) · DATE on contact 360 (owner question 5). Builder note

- Branch `wip/crm-cf13` from `ee40bfba` (fix7 + its review), worktree `/root/projects/shark-crm-cd2`, database QC2.
- Window: 2026-10-02 00:43 → 02:34 UTC (`date -u`).
- Probe: `scripts/pending/cf13/probe-cf13.mts` (+ `probe-cf13-sweep.mts`, fixture `_fx.mts`, runner `run-probe.sh`). RED/GREEN logs next to it.

## The one rule

A deal / contact / activity surface shows a company or contact **name** to a viewer only if that viewer can see that company / contact:
- company: `companies.companyRefsInTx(prisma, ctx, viewer, ids)` = `companyWhere(viewer)` — the helper deal 360 already used;
- contact: `contactWhere(viewer)` — the rule deal 360 already used;
- hidden company ⇒ `companyName: null` (CSV cell `""`) — the UI then shows what it shows for "no company" (deal 360 prints "ไม่ผูกบริษัท"; cards fall back to the contact name);
- hidden contact ⇒ `"ผู้ติดต่อที่มองไม่เห็น"` (now one constant, `HIDDEN_CONTACT_NAME` in `deals-shared.ts`, also used by deal 360) and `score: 0` on cards.
- No text derived from the id is ever produced. `companyId` / `contactId` stay in the DTOs exactly as before: deal 360 (`deal.companyId`), `contacts.get` and the REST deal ops already returned these raw ids (pre-existing, noted in the fix7 review as "existence already distinguishable"); removing them would change the REST contract and is not a name leak.
- Roll-ups are untouched: nothing is written, `deal.companyId` is kept, board column counts/sums and the company caches are identical (probe `NM-rollups`, board totals in every `NM-*`).
- Batched: one company visibility read and one contact visibility read per page (probe `NM-batched`: 10 deals / 9 companies → 1 company read and 1 contact read for list, board and CSV each).

## Sweep table

Line numbers at `ee40bfba`. "Fixed" = same pattern (a name looked up without the viewer's visibility, on a row the viewer can see), fixed in this card. Classes: A company name on a deal row · B contact name on a deal row · C company name / legacy company text on a contact row · D contact name on an activity row.

| # | Site | Class | Behaviour at `ee40bfba` | Disposition |
|---|---|---|---|---|
| 1 | `deals.ts:1867 companyNames` → `toCards` (list `listDeals`, board `getBoard`) | A | system scope (actor `null`) | **Fixed** — viewer passed (`companyRefsInTx(…, viewer, …)`) |
| 2 | `deals.ts:1881/1890 toCards` contactName + score; board SQL `LEFT JOIN "CrmContact"` (`:1987`) | B | Prisma include / SQL join, no `contactWhere` | **Fixed** — `visibleContactIds` (one query); hidden ⇒ placeholder, score 0 (board SQL now also selects `contactId`) |
| 3 | `deals.ts:2187 exportDeals` company + contact cells | A+B | system scope | **Fixed** — same helpers; hidden company `""`, hidden contact placeholder |
| 4 | Consumers of 1–3: deals page table/board, REST `deals.list` / `deals.board` / `deals.stale.list`, AI `crm_pipeline_summary` / `crm_stale_deals`, REST `search` + AI `crm_search` (deal half: `contactName`), deal CSV action | A+B | via 1–3 | **Fixed** through 1–3 (same service functions) |
| 5 | `contacts.ts:1767 listContacts` `companyName` = live visible name `?? r.company` (legacy text) and `companyText` in the DTO | C | the viewer-scoped lookup existed, but the fallback printed the legacy text `CrmContact.company` — which import/backfill set to the linked company's name — exactly when the company was hidden | **Fixed** — text shown only if no company link or the linked company is visible (`companies.visibleCompanyStates`, one query); visible archived company keeps the old fallback |
| 6 | `contacts.ts:2598 exportContacts` company cell | C | same fallback | **Fixed** (same rule) |
| 7 | `contacts.ts:1533 getContact360` `contact.companyText` (page shows "<text> (ยังไม่ผูกเป็นบริษัท)" and pre-fills the convert form) | C | raw text | **Fixed** (same rule; the 360's company reads now come from one `visibleCompanyStates` call that also yields the old live-name map) |
| 8 | `contacts.ts:2657 briefFor` `companyName: row.company` (REST `contacts.briefs` / `contacts.byParty`, chat panel brief) | C | raw text | **Fixed** (same rule) |
| 9 | `sequences.ts:1040 listEnrollments` `companyName` | C | fallback to `contact.company` (its own comment said hidden = no name) | **Fixed** (same rule) |
| 10 | `app/…/crm/emails/page.tsx:67` inbox and `emails/[threadKey]/page.tsx:81` thread `companyName` | C | raw `contact.company` | **Fixed** — new `contacts.companyTextsForViewer` (same rule, one query) |
| 11 | `companies.ts:1251/1302 getCompany360` timeline `contactName` (company 360 page, REST `companies.get`, AI `crm_company_360`) | D | include `contact.name`, no `contactWhere` (activities are visible by their own owner) | **Fixed** — `contactWhere` set (one query); hidden ⇒ `null` like `activities.enrich` |
| 12 | `deals.ts getDeal360` | A+B | viewer-scoped | already correct (reference rule); placeholder now the shared constant |
| 13 | `mobile.ts:91–117 toDealDtos` (`api/mobile/crm/deals`, `deals/[id]`), `todayTasks`, `callPrompt` | A+B / D | viewer-scoped | already correct |
| 14 | `activities.ts:856 enrich` (activity list, calendar, notes; REST `activities.*`), `mergedAppointments`, `searchTargets` | C+D | viewer-scoped | already correct |
| 15 | `brief.ts briefFor` (company) / `homeFor` (my deals + stale) | A/C | `visibleCompaniesByIds` | already correct (the contact-text field it reads is now masked via #8) |
| 16 | `ai-bridges.ts atRiskDeals` (REST/AI `crm_deals_at_risk`, home at-risk widget), `dealFacts`, `contactFacts`, `unfurlDealLink` | A+B | `namesByIds` / `briefForAssist` (companyWhere / contactWhere) | already correct |
| 17 | `ai-bridges.ts` team-room won post / stale digest | B | names stripped from output (system-sent) | already correct |
| 18 | kanban `link-resolvers.ts` CRM_CONTACT / COMPANY / DEAL titles | self names | `hideInvisibleCrm` hides invisible targets | already correct for the title |
| 19 | kanban `link-resolvers.ts:192–203` CRM_CONTACT **subtitle** = `contact.company` legacy text | C | raw text for a visible contact even when its company is hidden | **Reported, not fixed** — the resolver has no viewer (`resolve(ctx, ids)`); masking needs the viewer pass `hideInvisibleCrm` to also clear the subtitle. Kanban module, separate card |
| 20 | `portal.ts:1212/1248 listAccess` / `listCompanyRequests` (CrmPortalBlock on company 360, REST `portal.access.list`) | contact name on a company-scoped row | company checked, contact via include | **Reported** — needs `crm.portal.manage` (an admin key); hiding the contact name would make "revoke access" ambiguous. Product decision |
| 21 | `privacy.ts:1059 exportContact` (PDPA bundle) companies | C | system scope | **Reported** — a data-subject export of the contact's own links; arguably intended to be complete. Product decision |
| 22 | Writer echoes: `createContact` / `updateContact` / `mutate` return `toDto(row)` with raw `companyText` | C | raw text to the writer | **Reported** — the writer just submitted the row; masking needs a visibility read on every write path |
| 23 | `deals.ts:1393 dealDocInput` (quotation / invoice party name) | A/B | system scope | **Not a viewer surface** — writes the accounting document (system path, by design) |
| 24 | `service.ts:143–211` v1 `getBoard` / `listDeals` / activities | A+B | `include contact` | **Out of scope** — CRM v1 UI only (uiVersion 1 has no visibility rules, R-E.14) |
| 25 | Company-grouped reports / roll-ups | — | none exist: reports and forecast group by month / owner / team | n/a |
| 26 | `CrmCompany.openDealCount` / `wonValueSatang` caches shown on the company list and `crm_search` | counts | count every deal of the system, incl. deals the viewer cannot see | **Reported** (not a name; caches are system-wide by design; company 360 KPIs use `dealWhere`) |
| 27 | `src/lib/ai/tools.ts:1860–1890 recent_leads` AI tool | contact names **and phones** | `prisma.crmContact.findMany({ tenantId })` — no `contactWhere`, no key gate | **Reported — outside this class but more serious than FX7-1**: whole-shop contact names + phones to any AI-tool user. Recommend routing it through `contacts.listContacts(…, actor)` in its own card |

## FX7-3: DATETIME export milliseconds

- How the engine stores DATETIME (`member/fields.ts:649`): `ISO_RE` accepts `.sss` (up to 6 digits), and the value is stored as `new Date(text).toISOString()` → millisecond precision.
- The UI never sends ms: `thaiInputToIso` (datetime-local) produces `…:00+07:00`, stored `…:00.000Z` (probe `DT-ui-whole-seconds`). The REST API and the importer do carry ms (`…45.678Z` stored as is — `DT-stored`).
- Decision: **include ms only when the stored value has them** (`thaiIsoDateTime`: `…T00:30:45.678+07:00`; whole-second values keep the fix7 form byte for byte). So human data is unchanged and export → import is exact for every stored value.
- Probe: `DT-export-exact` (5 values incl. `.001` and a pre-1970 `.250`) and `DT-roundtrip` (export cell → `importContacts` → stored instant identical, server TZ UTC and Asia/Bangkok): RED ❌ (ms dropped) → GREEN ✅. Whole-second cells byte-identical to the fix7 form ✅ on both.

## Owner question 5: DATE on contact 360

- New `formatThaiDateFull(ymd)` in `src/lib/ui/date.ts` (the old record-page inline code, moved): `"2026-10-09"` → `"9 ต.ค. 2569"`.
- The record page (`components/crm/objects/types.ts displayValue`) and contact 360 (`contacts.ts displayOf`, page mode) both call it. Export mode and `value` are unchanged (`"2026-10-09"`).
- Byte identity: probe `DA-byte-identical` compares the new helper and `displayValue` with the old record-page code for every day 1960–2040 (29,586 days) + 2 odd inputs: 0 mismatches. A non-date string is returned as is (the old code would have printed "Invalid Date"; the engine never stores one).
- REST note: `contacts.get` returns the 360 including `fields.sections[].fields[].display`, so API readers see the Thai text in `display` for DATE (as fix7 did for DATETIME); `value` is unchanged.

## Probe RED → GREEN

`scripts/pending/cf13/probe-cf13.mts` (personas: owner · MANAGER limited to unit `u-a` · own-records STAFF with company read · read-only-company STAFF · STAFF without company read; every persona sees every deal):

- RED on `ee40bfba` source (my `src` diff removed, probe unchanged): **11/24** — red: `NM-mgr`, `NM-staff`, `NM-ro`, `NM-noco`, `SW-contacts-mgr`, `SW-contacts-staff`, `SW-email-text` (helper missing), `SW-sequences`, `SW-company360-timeline`, `DT-export-exact`, `DT-roundtrip`, `DA-360-display`, `DA-byte-identical` (helper missing). Green on RED (controls): `NM-owner`, `NM-shapes`, `NM-rollups`, `NM-batched`, `SW-contacts-owner/ro/noco`, `DT-ui-whole-seconds`, `DA-export-unchanged`, `DA-empty`, CLEAN.
- GREEN: **26/26** (the two extra rows are the positive controls that need the RED run's dump):
  - `NM-control-owner-identical`: owner list / board / CSV (ids and timestamps normalised) byte-identical to the RED run;
  - `NM-control-visible-cards-identical`: every card whose company and contact the viewer can see is byte-identical to the RED run (0 differences across 5 personas).
- Logs: `scripts/pending/cf13/probe-cf13.red.log`, `probe-cf13.green.log`.

## Regression (QC2, each job in its own `iso.sh` unit under the gate lock, one at a time)

Runner `scripts/pending/cf13/run-cf13.sh` (run from a copy in `/tmp/cf13-logs/`), logs `/tmp/cf13-logs/regress/`.

Chain 01:13:11 → 02:29:10 UTC (`scripts/pending/cf13/regress.summary`).

| Job | Result |
|---|---|
| `probe-cf13` (this card; in-chain run without the RED baseline) | **24/24** |
| `probe-cf10` | **34/34** |
| `probe-cf10-review` | **18/18** (its `F6-names` row is an INFO line; it now reports no hidden name on the card / board / CSV) |
| `probe-cf7` · `-r2` · `review` · `review-r2` | **30/30 · 14/14 · 27/27 · 21/21** |
| `probe-cf5` · `-r2` | **22/22 · 14/14** |
| `qc-crm-c1.5` (deals: list / board / CSV / 360) | **103/103** |
| `qc-crm-c1.4` (contacts) | **110/110** |
| `qc-crm-c1.3` (companies, 360) | **89/89** |
| `qc-crm-c1.6` (activities, calendar) | **79/79** |
| `qc-crm-c1.7` (visibility) | **57/57** |
| `qc-crm-c1.9` (record pages, `displayValue`) | **45/45** |
| `qc-crm-c1.10` (REST + AI, set 1) | **66/66** |
| `qc-crm-c1.11` (import / merge) | **66/66** |
| `qc-crm-c2.2` (sequences) | **73/73** |
| `qc-crm-c2.4` (activity capture) | **91/91** |
| `qc-crm-c2.10` (stale deals / digests) | **41/41** |
| `qc-crm-c2.11` (REST + AI, set 2) | **47/47** |
| `qc-crm-c3.1` (reports) | **56/56** |
| `qc-crm-c3.2` (quotas / home) | **47/47** |
| `qc-crm-c3.4` (AI tools, at-risk, briefs) | **53/53** |
| `qc-crm-c5.3` | **56/56** |
| docs gates | crm ✅ (123 op) · account ✅ (199 op) · member ❌ / kanban ❌ **only** because the gitignored `.claude/skills/shark-{member,kanban}-api/references/endpoints.md` do not exist in this worktree ("0 bytes on disk"); not created |
| fitness (QC2 env) / fitness without env | **36/36 / 36/36** (F2.3 ✅ · F5.1 ✅ · F14.1/F14.2 1066/1066) |
| typecheck (5 GB heap) | in-chain run **exit 2**: `sequences.ts(1020)` — `SequencesCtx` (optional `actorUserId`) not assignable to the new helper's `CompaniesCtx`. Fixed by typing `visibleCompanyStates(ctx: CrmScopeCtx, …)` (annotation only, no runtime change); re-run **exit 0** (`/tmp/cf13-logs/typecheck-2.log`). Every suite above ran on the identical runtime code |

No suite was red, so no ee40bfba comparison was needed.

## ORACLE-EDITs

None. Every suite in the table is green on the changed code without any oracle edit, so none pins the old (leaky) behaviour.

## Registry rows (`scripts/crm-ui-inventory.json`)

None. No control changes visibility for any persona: only text changes (card / table company and contact text, CSV cells, contact 360 "บริษัท" row text and convert-form prefill, company 360 timeline contact text, inbox / thread company text, contact 360 DATE text).

## Owner questions

1. Legacy company text (`CrmContact.company`) is now hidden from viewers who cannot see the contact's linked company (sweep #5–#10). The text is the contact's own field, but import and the backfill set it to the linked company's name, so showing it defeated FX7-1. A STAFF who typed that text on their own contact and whose contact was later linked to a company they cannot see no longer sees their text. OK?
2. Sweep #27 (`recent_leads` AI tool, whole-shop names + phones) — recommend its own card.
3. Sweep #19–#22 — kanban subtitle, portal access lists, PDPA bundle, writer echoes: keep or align?

## Not verified

- No live :3215 build: the deal table / board, contact 360, company 360 and the e-mail inbox / thread pages were not rendered; the services they call are covered by the probe (the two e-mail pages through `contacts.companyTextsForViewer`, not the page code itself).
- No button runner / `qc-crm-forms` (QC3 + browser); `qc-crm-c3.7` (mobile, QC3-only) and `qc-crm-c3.5` (portal, QC3) not run — the mobile deal routes were already viewer-scoped (sweep #13) and are untouched.
- `qc-crm-c51fix-equiv` (before/after equivalence tool that needs `--tenant` and output files) not run; the probe's RED-vs-GREEN DTO comparison stands in for the board / list / CSV of owner and of viewers with visibility.
- The REST ops (`deals.list` / `deals.board` / `contacts.briefs` / `companies.get` …) were exercised by c1.10 / c2.11 with their own fixtures, not with this card's hidden-company personas; they call the same service functions the probe drives.
- A TEAM-level visibility policy persona and an API-key actor without `crm.company.read` were not exercised (same `companyWhere` / `contactWhere` path).
- Excel / Google Sheets with the `.sss` DATETIME cell not tried.
- Sweep #19–#22, #26, #27 are reported, not fixed.

## Controller merge gate record (2026-10-02 05:51 UTC)
- Patch `scripts/pending/c55merge/fix10.patch` = cd2 `ee40bfba..6cbb8f3c` applied to the main tree with `patch -p1 --fuzz=3`; 21 files byte-identical to 6cbb8f3c, 2 diverged files (`crm/emails/page.tsx`, `crm/emails/[threadKey]/page.tsx`) carry md5-identical +/- lines.
- Gate unit `crm-main-fix10` (`scripts/pending/run-main-fix10.sh`, log `.qc-shots/crm/main-fix10.log`): 25/25 steps exit 0, ALLDONE.

# C5.5-fix10: independent review (FX7-1 names follow the viewer's visibility · FX7-3 `.sss` · DATE display)

- Reviewed `wip/crm-cf13` `018b68bb` against base `ee40bfba`, worktree `/root/projects/shark-crm-cd2`, database QC2.
- Window: 2026-10-02 02:35 → 03:13 UTC (`date -u`).
- I did not edit any product source.

## What I ran (QC2, each job in its own `iso.sh` unit under the gate lock, one at a time)

Runner: `scripts/pending/cf13/review/run-review.sh`. Logs are in `/tmp/cf13-review-logs/`. Chain ran 02:43:04–03:09:31 UTC.

| Job | Result |
|---|---|
| `probe-cf13-review` (new, this review) | **7/8**. The one red is `LK-create-duplicate-masked`: a pre-existing leak outside this card (RV10-1). Kept red on purpose as a finding. |
| `probe-cf13` (builder), re-run against the builder's RED dump | **26/26**, including `NM-control-owner-identical` and `NM-control-visible-cards-identical` (0 differences). See the note below the table. |
| `probe-cf10` | **34/34** |
| `probe-cf10-review` | **18/18** |
| `probe-cf7` | **30/30** |
| `probe-cf7-review` | **27/27** |
| `probe-cf7-review-r2` | **21/21** |
| `qc-crm-c1.5` (deals) | **103/103** |
| `qc-crm-c1.4` (contacts) | **110/110** |
| `qc-crm-c1.3` (companies) | **89/89** |
| `qc-crm-c1.10` (REST + AI) | **66/66** |
| `qc-crm-c2.2` (sequences) | **73/73** |
| `qc-crm-c2.11` (REST + AI 2) | **47/47** |
| `qc-crm-c3.4` (AI) | **53/53** |
| typecheck (5 GB heap) | exit 0 |
| fitness | **36/36**: F2.3 ✅ · F14.1/F14.2 1066 / 1066 |

**Note on the baseline.** In the chain I first pointed `probe-cf13` at `/tmp/cf13-logs/red-baseline.dump.json`, and it gave 24/26. That dump comes from an **earlier version of the probe**: its deal titles are "ดีลบริษัทลับ …", while the final probe uses "ดีลหนึ่ง …". So it cannot match. The builder's `red3.dump.json` (01:11 UTC) is the RED dump of the final probe: its titles match and its manager board still prints the unmasked "ทีมบีถือ". Against `red3`: 26/26. `run-review.sh` now points at `red3`.

QC2 leftover check (`scripts/pending/cf13/review/leftover-check.mts`): `qc-cf13-*`, `qc-cf10-*` and `qc-cf7-*` tenants = 0, users = 0.

## Attack results

### (a) Leaks that remain for a viewer who cannot see the company or contact

| Attack | Result |
|---|---|
| Sort | `DEAL_SORTS` and `CONTACT_SORTS` have no company or contact name key. The deal board orders by `stageEnteredAt`; there is no score sort on deals. |
| `q` search | Deal `q` searches **titles only** (`deals.ts:1782`); contact `q` searches name, email and phone, never `company`. `LK-filters`: `q="<hidden company name>"` does not hit the deal. |
| Company filter | It is id-based. A hidden `companyId` returns the deal with `companyName: null` (`LK-filters`). The id was already exposed (fix7 review). |
| Group-by, totals | The board groups by stage only. Column counts and sums are unchanged (builder `NM-rollups`). No report groups by company (sweep #25). |
| Hidden contact on a visible deal | The card shows `HIDDEN_CONTACT_NAME` with score 0, and neither the list nor the board contains the hidden name anywhere (`LK-hidden-contact`). A 0 next to a placeholder name reveals nothing more than the placeholder itself, and no ordering or at-risk logic reads the card's score. |
| `crm_search`, AI tools, REST deal ops | All go through `listContacts`/`listDeals`, so they are covered (code read, `api/ops/core.ts:51-61`). |
| Deal titles and activity titles that embed names | These are user or product data, not lookups. The builder's own probe renamed its titles for this reason. Not fixable by a visibility rule; INFO. |
| **Writer echoes (sweep #22, measured)** | `LK-writer-echo-*`. A TEAM-level staff member, or a staff member without company read, edits a contact they can see whose linked company is hidden. Contact 360 shows `companyText: null`, but the response of **`updateContact` and of `setTags`** returns `companyText = "<hidden company name>"`. Rated in RV10-2. |
| **Create with a duplicate phone (new, pre-existing)** | `LK-create-duplicate`. A staff member who **cannot see** the owner's contact calls `createContact` with that contact's phone. The service returns `{created: false, contact: toDto(<the existing contact>)}`: name, phone, `companyText` (the hidden company's name) and the rest. REST `contacts.create` passes `contact` through as-is (`api/ops/contacts.ts:163`), and the UI action returns `duplicates[].name` (`contacts-actions.ts:84`). Rated in RV10-1. |

### (b) Regression for legitimate viewers
**Free text** (`RG-legacy-text`), checked for owner, unit-scoped manager, a TEAM-level staff member (TeamMember of TA; STAFF default is TEAM) and their teammate:
- **free text with no company link** stays visible on every contact surface: list `companyName`/`companyText`, Contact 360 `companyText`, `briefFor`, `companyTextsForViewer`, and the export where the persona holds the export key;
- free text that **differs** from the linked visible company keeps the list name equal to the company's name and `companyText` equal to the free text, as before;
- a contact linked to a **visible archived** company still falls back to its free text.

**Deal cards for viewers with visibility** (`RG-cards-visible`). For owner, manager, the TEAM-level staff member and the teammate, cards on the list and the board, and the CSV, carry exactly the company name, contact name and score that the old system-scope lookup produced. The builder's byte comparison against the RED run (`red3`) shows 0 differences for every visible card, and the owner's list, board and CSV are byte-identical.

**Performance:**
- `toCards` makes 3 parallel reads per page: owners, `companyRefsInTx(viewer)` and one `contactWhere` read (builder `NM-batched`).
- The board SQL only gains `d."contactId"` in the select list; WHERE and ORDER BY are unchanged, so index use is unchanged.
- `exportDeals` runs outside `crmScope`, so its two `…Where` calls may each compute the visibility snapshot. That is a couple of small queries per export: INFO.

### (c) Export `.sss` and the REST DATE `display`
**`.sss` round-trip** (`DT-sss-edges`): every value comes back through `importContacts` as the same instant.

| Stored value | Export cell |
|---|---|
| `1969-12-31T23:59:59.999Z` (negative epoch) | `1970-01-01T06:59:59.999+07:00` |
| `1960-01-01T00:00:00.000Z` | `…T07:00:00+07:00` (no `.sss`) |
| a whole-second value | `…T00:30:00+07:00` (no `.sss`) |
| `.010Z` | `….010+07:00` |

`t % 1000` on a negative epoch is `-0` for whole seconds, so it compares correctly.

- **Importer:** `ISO_RE` accepts `.sss` (`member/fields.ts:165`).
- **Pins:** no suite or doc pins the export or `display` text. c1.4, c1.9, c1.10 and c1.11 are green.
- The only reader of `display` is the Contact 360 page (`page.tsx:353`). Mobile has no `display` reader, and `value` is unchanged.

### (d) `CrmScopeCtx`
`visibleCompanyStates(ctx: CrmScopeCtx, …)` changes only the parameter annotation; the body is unchanged. typecheck exit 0.

### (e) The builder's "reported, not fixed" list
| # | Item | My rating | Fix before release? |
|---|---|---|---|
| 19 | Kanban `CRM_CONTACT` link subtitle = raw `contact.company` (`kanban/link-resolvers.ts:205`) | LOW. Same class as FX7-1: a board member who can see the contact sees the hidden company's text. | **Yes, cheap.** Have `hideInvisibleCrm` also clear the subtitle when the linked company is hidden, using the same `visibleCompanyStates`. A separate kanban card is fine. |
| 20 | Portal access lists name contacts on company-scoped rows | INFO. Needs `crm.portal.manage` (admin); revoke needs the name. | No. Keep. |
| 21 | PDPA bundle lists all of the contact's companies | INFO. A data-subject export must be complete. | No. Keep. |
| 22 | Writer echoes return the raw `companyText` (measured, `LK-writer-echo-*`) | LOW. This is the cheapest way round the new mask: any contact editor (UI action, REST, AI update tool) gets the hidden name back from `updateContact`, `setTags`, etc. (`contacts.ts:1176,1246`). | **Yes.** Return `viewerDto(row, states)` from those paths: one `visibleCompanyStates` read per write. Without it, FX7-1 is only cosmetic for the legacy text. |
| 26 | `openDealCount`/`wonValueSatang` caches count every deal | INFO. Counts, not names; system-wide by design. | No. |
| 27 | `recent_leads` AI tool: whole-shop names and phones | Confirmed the **same issue** that `session/crm` card G1 fixed (`05dc5f74`: `visibleCrmLeads` → `contactWhere` per CRM system + `maskPiiDeep`, replacing the tenant-wide `crmContact.findMany`, which is still present at `src/lib/ai/tools.ts:1875` on this branch). | Already fixed upstream; it arrives with the rebase or merge. |

## Findings

### RV10-1 · MED (pre-existing since C1.4, outside this card's sweep) · create-with-duplicate returns an invisible contact's details
- **Where:**
  - `contacts.ts:868`: `if (!res.created) return { contact: toDto(res.row) … }`, where `duplicateHits` (`:674`) reads in **identity scope**, not `contactWhere`;
  - REST `contacts.create` returns `contact` (`api/ops/contacts.ts:163`);
  - the UI action returns `duplicates[].name` (`contacts-actions.ts:84`).
- **Repro:** `LK-create-duplicate`. A STAFF member who cannot see the owner's TB contact creates a contact with its phone and receives that contact's name, phone and `companyText` (= the hidden company's name).
- **Effect:** anyone with `crm.contact.create` can look up any contact in the system by phone or e-mail and get its personal data back. This is a broader leak than FX7-1 (personal data, not just a company name).
- **Not introduced by this card**, so it does not block it.
- **Recommendation:** its own card before release. For hits the caller cannot see, return no contact data at all: only `{created: false, reason}`, or a neutral "a contact with this phone already exists (not in your view)". Keep the full DTO for visible hits.

### RV10-2 · LOW · writer echoes leak the masked legacy text (sweep #22, measured)
- See table row 22. It undercuts the fix in this card for the class C text.
- Recommended in this card or the very next. The fix is cheap and the probe repro is ready.
- Not a blocker by itself: the same viewer could already read the raw `companyId`, and the text only appears for contacts the writer can edit.

### RV10-3 · LOW · kanban `CRM_CONTACT` subtitle (sweep #19)
Same class C text through a viewer pass that does not cover the subtitle. Fix in a kanban card.

### RV10-4 · INFO
- `exportDeals` visibility snapshot is computed twice outside `crmScope` (minor).
- Names embedded in titles are not maskable.
- The builder's `red-baseline.dump.json` is stale (from an earlier probe version). Only `red3.dump.json` is valid; worth stating in the builder note, which does not say which dump the 26/26 GREEN used.

## Not verified
- No live :3215 build: deal table and board, contact 360, company 360 and e-mail pages were not rendered. The services they call were exercised.
- The kanban subtitle (#19) was not exercised: rated from code (`link-resolvers.ts:205`).
- No query-count instrumentation of my own; I relied on the builder's `NM-batched` and code reading.
- `qc-crm-c3.5`/`c3.7` (QC3), the button runner and `qc-crm-forms` were not run.
- An API-key actor without `crm.company.read` was not exercised; it goes through the same `companyWhere`.
- Excel and Sheets with `.sss` cells were not tried.

## Verdict
- No BLOCKER or HIGH introduced by this card.
- The one rule holds for every persona and surface I attacked:
  - hidden names and text are gone from cards, board, CSV and contact surfaces;
  - viewers with visibility, including manager unit scope and TEAM-level staff, see byte-identical output;
  - legitimate free text survives;
  - `.sss` round-trips, including negative epochs.
- RV10-1 (MED, pre-existing contact lookup via duplicate create) should get its own card before release.
- RV10-2 and RV10-3 (LOW) are cheap follow-ups that complete FX7-1's class C. RV10-2 is the one to do first.

VERDICT: MERGEABLE

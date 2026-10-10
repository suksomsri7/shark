# C5.5-fix7: independent review (R2F-1 · R2F-2 · F6-5 · F6-6 · RV-3 · R2F-3)

- Reviewed `wip/crm-cf10` `8ac89741` against base `fbd7ca2c`, worktree `/root/projects/shark-crm-cd2`, database QC2.
- Window: 2026-10-01 23:5x → 2026-10-02 00:42 UTC (`date -u`).
- I did not edit any product source.

## What I ran (QC2, each job in its own `iso.sh` unit under the gate lock, one at a time)

Runner: `scripts/pending/cf10/review/run-review.sh`. Logs are in `/tmp/cf10-review-logs/`. Chain ran 00:12:56–00:41:25 UTC.

| Job | Result |
|---|---|
| `probe-cf10-review` (new, this review) | **18/18** (also an earlier standalone run: 18/18) |
| `probe-cf10` (builder) | **34/34** |
| `probe-cf7` | **30/30** |
| `probe-cf7-r2` | **14/14** |
| `probe-cf7-review` | **27/27** |
| `probe-cf7-review-r2` | **21/21** |
| `probe-cf5` (portal DATETIME) | **22/22** |
| `qc-crm-c1.4` | **110/110** |
| `qc-crm-c1.11` (import/merge) | **66/66** |
| `qc-crm-c1.10` (REST) | **66/66** |
| `qc-crm-c1.9` (record pages, `displayValue`) | **45/45** |
| `qc-crm-c3.5` (portal) | **67/67** |
| typecheck (5 GB heap) | exit 0 |
| fitness | **36/36**: F2.3 ✅ · F14.1/F14.2 1066 / 1066 |

- Not run: `qc-crm-c3.9`, which is QC3-only (`qc3.sh`) and outside this brief's QC2 rule.
- QC2 leftover check (`scripts/pending/cf10/review/leftover-check.mts`): `qc-cf10-*` and `qc-cf7-*` tenants = 0, users = 0.

## Attack results

### (a) RV-3: DATETIME display and export (the riskiest change)

**Consumers of the contact export.** There are only two: the UI action (`contacts-actions.ts:261`) and the REST op `contacts.export` (`api/ops/contacts.ts:432`). Both return the CSV text, so both get the new cell.
- There is no scheduled contact export and no XLSX path.
- The PDPA per-contact export does not use `displayOf`.
- The record-page export (`OBJ.records.export`) goes through `thaiDateTimeText`, which is byte-identical (see below).
- No suite or doc pins the old cell. I searched every `qc-crm-*`; the only DATETIME mentions are in c1.2a/c1.2b/c3.8/c51fix-equiv, and none checks the export text.

**Edge instants** (`DT-export-edges`). Every cell has the exact form `YYYY-MM-DDTHH:mm:ss+07:00`.

| Case | Cell | Round-trip |
|---|---|---|
| Thai midnight | `2026-10-09T00:00:00+07:00` | exact |
| Year rollover | `2027-01-01T00:59:00+07:00` | exact |
| 1965 | `1965-03-01T10:00:00+07:00` | exact |
| Stored value with milliseconds | `…T00:30:45+07:00` | same second, **ms dropped** (FX7-3) |
| Empty value | `""` | — |

Thailand has no DST since 1920, so a fixed +07:00 is correct for every value the product can hold.

**DATE is untouched** (`DT-export-date`): `2026-10-09`, empty stays empty.

**Shared formatter is byte-identical** (`DT-byte-identical`). On strings (valid, `+07:00`, leap day, invalid, empty, date-only) and on Dates, `formatThaiDateTimeFull` gives exactly the old record-page `thaiDateTimeText` and the old portal `PORTAL_DATETIME_FMT` output, with 0 mismatches. So the record page and the portal are unchanged byte for byte. c1.9 (45/45) and c3.5 (67/67) agree.

**Files exported before the change still import** (`DT-old-cell-import`). The importer is unchanged (`member/fields.ts:165` `ISO_RE` accepts the space form):

| Server TZ | `"2026-10-08 17:30"` (meant 17:30Z) is stored as |
|---|---|
| UTC | 17:30Z, **correct** |
| Asia/Bangkok | 10:30Z, 7 h off |

So the builder's "the old value did not round-trip" is true only on a Thai-time server. On a UTC host it round-tripped. See FX7-2.

**Acceptable without the owner?** Yes, in my judgement, with a heads-up. The change fixes a real error that people could see:
- the old CSV showed **UTC wall-clock** time to Thai users (an 00:30 appointment printed as "2026-10-08 17:30");
- the new cell is Thai wall time, carries its own offset, and survives Excel as text;
- old files keep importing.

The cost is that spreadsheets which parsed the old cell as a date now see text. That is a heads-up for owner question 3, not a reason to block.

### (b) R2F-1: `isCurrentCompanyHidden` vs the server refusal

**Predicate parity** (`R1-parity-*`). For each persona, the six contact shapes give UI predicate ⇔ server outcome 6/6. The shapes:
1. primary visible;
2. primary hidden;
3. hidden + archived;
4. hidden + merged;
5. visible + archived;
6. no primary but a hidden secondary.

| Persona | Result |
|---|---|
| owner | Never hidden; every move OK. |
| MANAGER with `unitAccess ["u-a"]` | The other unit's team is hidden. hidden ⇒ `NOT_FOUND` with `CONTACT_PRIMARY_COMPANY_HIDDEN_MSG` and **zero writes**; visible ⇒ move OK. |
| OWN-scoped STAFF linker | Same as the manager. |

For both the manager and the linker, "no primary + hidden secondary" is not hidden and the move is OK, as the brief expects.

**One text for every hidden case** (`R1-clear-same-text`). Clearing a hidden live, archived or merged company gives the same text with zero writes, and so does moving. There is no liveness oracle.

**Existence oracle** (`R1-oracle-preexisting`). `contacts.get` / `getContact360().contact.companyId` already hands the raw hidden id to the linker and to a read-only role, versus `null` for a contact without a company. "This contact has a company I cannot see" was therefore already distinguishable. The locked line and the new text add no id and no name, and the hidden name appears nowhere in the 360 payload.

**Wiring:**
- `page.tsx:88` computes the predicate only for linkers on a live contact.
- `can.company` (`:179`) and the raw `companyId` (`:194`) are both gated by it.
- `companyLocked` (`:199`) drives the `<p data-testid="contact-edit-company-locked">` (`Contact360Actions.tsx:526`), which is not interactive, so it needs no registry row.
- Read-only and no-read personas keep their fix6 branches, because the locked branch only renders when `can.company` is false and `companyLocked` is true.

### (c) R2F-2: clearing an archived or merged visible company
- **Refusals** (`R2-archived-merged`):
  - clearing an archived visible company is `VALIDATION` "เก็บถาวรแล้ว…กู้คืน", writes: none;
  - clearing a merged visible company is `VALIDATION` "ถูกรวม…", writes: none;
  - moving off either is OK.
- **Restore then clear:** builder `F2-control-restore-then-clear` ✅.
- **Real flows** (`R2-real-flows`) never go through this path:
  - `archiveCompany` on a company with a linked contact is OK, and the contact's cache becomes `null`;
  - `mergeCompanies` is OK, and the cache points at the kept company.
- **Import** never clears a company: it only links through `addContact`. Contact merge moves links through `transferContactLinksInTx`. Neither touches the new check.
- The residual race (an archive landing between the pre-check and `removeContact`) is documented by the builder and was not exercised (FX7-4).

### (d) F6-5: echo semantics
**Echoes** (`F5-echo-all-personas`). Echoes are accepted for every persona: owner, unit-scoped manager, linker, read-only and no-read. The variants:
- exact and padded (`" <id>\t"`) on a **hidden** current company, plus `jobTitle` and `moveOpenDeals:true`: OK, the company and the owner's open deal are kept, and there is no `companyId` audit key;
- `null`, `""` or the key omitted on a contact without a company: OK.

**Real changes are never taken for echoes** (`F5-real-change`):
- a linker's padded move V→T is applied;
- a linker's `""` on a visible company clears it;
- a read-only real change is still `FORBIDDEN` with zero writes;
- the builder's `UPPER(id)` control also holds.

### (e) F6-6 and owner question 1
`F6-names`. A STAFF without company read creates a deal on its own contact whose company is hidden. The server default sets `deal.companyId` = the hidden company (unchanged). Where the creator then sees its name:

| View | Hidden company name shown? |
|---|---|
| `listDeals` card | **yes** |
| board | **yes** |
| deal CSV | **yes** |
| deal 360 | no |

The cause is `companyNames` (`deals.ts:1867`), which reads names in system scope. This is pre-existing since C1.5 and deal-wide. It is rated in FX7-1.

### (f) R2F-3: import entry kinds
- **Caps** (`IM-cap-failures-first`). A 513-row file: 510 rows each need a new company the linker cannot create, so 510 notes; 3 empty rows at the **end** are real failures.
  - Result: `created=510 failed=3`, 500 entries; entries 1–3 are `kind:"error"` (rows 511–513), and the rest are notes.
  - `getImportJob` keeps 50 entries, the first 3 of them errors.
  - The import took 85 s (QC2 over the network).
- A legacy audit row without `kind` reads as `"error"` (`IM-legacy`).
- Both import screens label notes "(หมายเหตุ)" (`IM-ui-both-screens`).
- The API change is additive (`row`/`message` unchanged), and c1.10/c1.11 are green.

### (g) Fitness F2.3: the formatter in `src/lib/ui/date.ts`
- The file has **no imports at all**: pure `Intl` and `Date`. It is already used in 77 places, client components included.
- Putting the helper there keeps `components/crm/**` off deep `crm/*` imports.
- F2.3 is ✅ in my fitness run.

## Findings

### FX7-1 · LOW (pre-existing since C1.5, owner question 1) · deal list, board and CSV name a company the viewer cannot see
- **Where:** `deals.ts:1867` `companyNames` reads in system scope for `listDeals`, `getBoard` and `exportDeals`. Deal 360 already hides the name.
- **Repro:** `F6-names`.
- **Assessment:**
  - Not introduced or widened by this card: the F6-6 default is unchanged.
  - It is an inconsistency in the visibility model, and the probe confirms it is the one channel through which such a creator learns the hidden company's name.
- **Fix (debt, owner's call):** resolve names through `companyWhere(viewer)` and show "—" otherwise, the same as deal 360.

### FX7-2 · INFO · builder note wording: "the old export did not round-trip" holds only on a Thai-time server
- **Measured:** an old cell imported on a UTC host stores the right instant (`DT-old-cell-import`).
- **Real user-facing gain:** the cell now shows Thai wall time instead of UTC wall time.
- The decision stands; only the stated reason needs correcting when owner question 3 is put to the owner.

### FX7-3 · INFO · the export drops milliseconds
- Values written with milliseconds (API or engine) come back from export + import at the same second.
- This does not matter for human data, which is entered to the minute.

### FX7-4 · INFO · residual race (R2F-2, documented)
An archive landing between the pre-transaction check and `removeContact` can still half-write. Closing it needs the contact write and the link write in one transaction.

### FX7-5 · INFO · minor
- Contact 360 now runs one extra `loadCompany` per view, for linkers only. Negligible.
- `getImportJob` still keeps only 50 entries (pre-existing audit design). Failures now come first, so nothing important is lost.
- Not covered by my probe: a STAFF whose visibility level is TEAM through a visibility policy. The predicate and the server call are the same function (`assertCompanyVisible` → `companyWhere`), so parity holds by construction. I only exercised OWN- and unit-scoped actors.

## The builder's 5 owner questions: my view
1. **Deal cards, board and CSV name hidden companies.** Recommend scoping names to the viewer's company visibility, as deal 360 does (FX7-1). It is a small, consistent fix with no roll-up impact. Not urgent: pre-existing, and only names leak.
2. **The `/deals/new` default.** Keep the contact's primary company. Stripping it would silently break company roll-ups for almost every STAFF deal, and the only leak path is FX7-1's names, which should be fixed there.
3. **Export DATETIME format.** Accept. It fixes a 7-hour error a human reading the CSV would see; the cells are machine-safe and survive Excel; files exported earlier still import. Tell the owner as a heads-up, with FX7-2's corrected reasoning.
4. **R2F-4: duplicate company from an import naming a company the importer cannot see.** Keep it and rely on company merge. Deduplicating across visibility would turn import into an existence oracle for hidden companies.
5. **DATE display on the contact page.** Align it to "9 ต.ค. 2569" in a later UI pass, for consistency with the record page. Cosmetic.

## Not verified
- No live :3215 build. The 360 page and the import panels were checked through the builder's component render, my source checks and the service calls, not as rendered pages.
- No button runner and no `qc-crm-forms` (QC3 + browser).
- `qc-crm-c3.9` was not run (QC3-only).
- Excel and Google Sheets were not tried with the new cell.
- The R2F-2 residual race and the builder's `F5-race-no-false-audit` interleaving were not driven with two real concurrent requests.
- No TEAM-level visibility policy persona (FX7-5).

## Verdict
- No BLOCKER, HIGH or MED.
- Every claim held under attack:
  - the UI predicate equals the server rule for every persona and shape tested;
  - refusals write nothing;
  - the echo rule never swallows a real change;
  - RV-3 is byte-identical for the record page and the portal, and old files still import;
  - import failures are never crowded out.
- FX7-1 (LOW, pre-existing) and the INFO items go to the debt and owner lists.

VERDICT: MERGEABLE

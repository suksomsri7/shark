# C5.5-fix7: small LOW findings left by the fix6 / fix3b reviews (contacts · companies · deals). Builder note

Branch `wip/crm-cf10`, from `fbd7ca2c` (fix6 + its two review rounds). Worktree `/root/projects/shark-crm-cd2`. Database **QC2**.
No schema change, no migration.
- Probe: `scripts/pending/cf10/probe-cf10.mts`. Its fixture `_fx.mts` is the cf7 fixture with the tag `qc-cf10-*`.
- Runners:
  - `run-probe.sh` runs the probe alone.
  - `run-cf10.sh` is round 1 of the verification chain.
  - `run-cf10-r2.sh` is round 2, after the helper move described under item 5.
- Logs in the repo: `probe-cf10.red.log`, `probe-cf10.green.log`, `regress.summary`. Full logs are in `/tmp/cf10-logs/`.

**probe-cf10: RED 18/34 on the untouched src → GREEN 34/34.**
- **RED:**
  - The final probe ran against the `fbd7ca2c` versions of all 12 changed src files (2026-10-01 23:59:55 to 2026-10-02 00:01:14 UTC).
  - The swap: the files were backed up to `/tmp/cf10-logs/bak`, the base versions were written with `git show fbd7ca2c:<f>`, the probe ran, and the backups were copied back. `cmp` then showed every restored file identical to the backup.
  - An earlier RED run, made before any source edit, gave the same 18/34 with the same 16 findings.
- **GREEN:** 34/34, at the start of round 2 (23:36 UTC).
- **Checks that flipped:** 16 went ❌ → ✅, and each item has at least one.
- **Unchanged:** the premise, the positive controls and CLEAN (throwaway tenants left with 0 rows) were ✅ in both runs.

## Item 1 · R2F-1: a linker whose contact's PRIMARY company is outside their visibility saw a picker that always refused

**Decision.**
- Hide the picker and show one explanatory line instead.
- Give the server refusal its own text, and use the same text for that line.
- The server check is unchanged in strength.

**Why.** Every pick was refused, including promoting the user's own visible secondary company, so the control was dead. The old "refresh the page" text could never help.

**Where.**
- `contacts.isCurrentCompanyHidden(ctx, actor, companyId)` (`contacts.ts:1446`) is the same gate the server uses (`companies.assertCompanyVisible`, non-live). If the read fails, it returns "hidden", so the picker is hidden and the server still decides.
- The page (`contacts/[contactId]/page.tsx:86,178,198`) computes `primaryCompanyHidden` for users who can link.
  - It passes `can.company = crmCanLinkCompany && !primaryCompanyHidden` and `companyLocked`.
  - It sends the raw `companyId` only when the picker is shown.
- `Contact360Actions.tsx` `ContactMenu` renders `<p data-testid="contact-edit-company-locked">` with `CONTACT_PRIMARY_COMPANY_HIDDEN_MSG`.
- `updateContactCore` (`contacts.ts:1009-1020`) maps the companies service's `NOT_FOUND` for the current company to that text. The code stays `NOT_FOUND`, so the REST status is unchanged.

**The text** ("the current primary company of this contact is outside what this account can see, so this account cannot move or remove it; ask the team lead or shop owner"):
> บริษัทหลักปัจจุบันของผู้ติดต่อนี้อยู่นอกขอบเขตที่บัญชีนี้มองเห็น จึงย้ายหรือถอดบริษัทหลักจากบัญชีนี้ไม่ได้ — ให้หัวหน้าทีมหรือเจ้าของร้านย้ายให้

**What this reveals.**
- No company name or id.
- It does confirm that there is a primary company the user cannot see. The user can already deduce that today: the contact DTO carries `companyId`, and it is not in the user's visible company list (REST `contacts.get`).
- Visibility is still judged before liveness, so a hidden live company and a hidden archived company give the same text for both move and clear (`F1-oracle-same-text`).
- Read-only and no-read personas are unchanged: they keep the fix6 read-only line, or no line (`F1-control-readonly-line`, `F1-control-noread`).

**Probe:**

| Check | RED → GREEN |
|---|---|
| `F1-ui-no-dead-picker` | ❌ → ✅ |
| `F1-srv-own-text` (writes: none) | ❌ → ✅ |
| `F1-wiring` | ❌ → ✅ |
| `F1-oracle-same-text` | ✅ → ✅ |
| controls: linker with a visible primary keeps the picker · owner promotes the secondary · read-only line · no-read | ✅ → ✅ |

## Item 2 · R2F-2: clearing an ARCHIVED but visible current company half-wrote

**Decision.** Refuse the clear before any write.

**Why (the companies service's own rules).**
- The links of an archived or merged company cannot be edited: `linkMutation`/`removeContact` load the company `live` and say "restore first".
- The real `archiveCompany` recomputes every linked contact's `companyId` cache off the archived company (`companies.ts:910-930`). So a contact pointing at an archived company is a stale cache: a race or old data. The review repro wrote `archivedAt` directly.
- Allowing the clear would leave an active link on the archived company, and a restore would bring the contact back. That is not a detach.

**A legitimate user can still detach:**
- move the contact to another company: ✅, unchanged;
- or restore → clear (`F2-control-restore-then-clear` ✅);
- after a real archive, the cache is already off the company, and a clear is a no-op OK (`F2-control-real-archive` ✅).

**Where.**
- `updateContactCore` calls `companies.assertCompanyVisible(…, { live: wantCompany === null })` before the transaction (`contacts.ts:1014`).
- `assertCompanyVisible` gained `opts.live` (`companies.ts:2352`).
- A clear of an archived company now gets the companies service's own `VALIDATION` text ("บริษัทนี้ถูกเก็บถาวรแล้ว … กู้คืนก่อน…") **before** any write.

**Probe:**

| Check | RED → GREEN |
|---|---|
| `F2-archived-clear-atomic` | ❌ → ✅. RED: `AuditLog 2→3 · OutboxEvent 2→3 · contact row changed`. GREEN: `writes: none`, comparing every tenant-scoped table, the contact row and its links. |
| `F2-control-move-off`, `F2-control-live-clear` | ✅ → ✅ |

**Residual (pre-existing, documented).** The company step still runs in its own transaction after ours commits. If someone archives the company between our pre-check and `removeContact`, the old half-write can still happen. The window is narrow; closing it needs the contact write and the link write in one transaction (a restructure, not cheap).

## Item 3 · F6-6: the `/deals/new` default company ignored the creator's company visibility

**Decision: keep the server default** (`deals.ts:722`, comment only).

**Why.**
- The design docs are silent on visibility here. Blueprint `docs/modules/20-crm-v2.md` §4.4 says only "the company the primary contact belongs to, or null". `ledger/DESIGN-CRM.md`, `CRM-OWNER-QUESTIONS.md` and `CRM-OWNER-PENDING.md` have nothing on it.
- STAFF hold **no company keys by default**. Defaulting to "only what the creator can see" would leave almost every staff deal without a company. The company's roll-ups (`openDealCount` / `wonValueSatang`, company 360 deals) would silently lose them.

**Nothing new goes back to the creator.**
- The UI action returns only the deal id.
- The REST DTO carries `companyId` and no name. That id equals the `companyId` the creator already reads on the contact DTO.
- Deal 360 shows no company for an invisible one (`F6-no-name-back` ✅).

**UX debt fixed.** The empty option of the deal form said "ไม่ผูกบริษัท" ("no company"), but empty has always meant "use the contact's primary company". It now reads "ตามบริษัทหลักของผู้ติดต่อ (ถ้ามี)" ("as the contact's primary company, if any") (`NewDealForm.tsx`). `F6-label` ❌ → ✅.

**Trade-off and owner question (below).** `listDeals` cards, the board and the deal CSV name the deal's company through system scope, not the viewer's company visibility. That is pre-existing since C1.5 and deal-wide. So the creator does see the hidden company's **name** on the deal card (`F6-board-card` INFO). I did not change it, because it is a product rule for every deal card, not for this default.

**Probe:** `F6-default-kept` ✅ → ✅ (deal company = the contact's company; company `openDealCount` 0→1).

## Item 4 · F6-5: echo of the current companyId

**Decision.** An unchanged `companyId` is never a change, for any user.
- `contacts.ts:1003` sets `wantCompany = undefined` whenever it equals `current.companyId`. Before, this applied only to users without company read.
- So a user with company read who sends back a DTO whose company they cannot see now gets OK. Before, the whole patch was refused with VALIDATION.

**The race is fixed as well, cheaply.**
- An echo is now "not sent" before the transaction.
- So a concurrent company move between our pre-read and our transaction can no longer make the in-transaction comparison (`pre.companyId`) record `companyId` in the audit and event while no link is touched.

**Probe:**

| Check | RED → GREEN |
|---|---|
| `F5-echo-invisible-ro` | ❌ → ✅ |
| `F5-echo-invisible-linker` | ❌ → ✅ |
| `F5-race-no-false-audit` | ❌ → ✅ |
| `F5-control-real-change-refused`, `F5-control-upper-not-echo` | ✅ → ✅ |

`F5-race-no-false-audit` simulates the race by wrapping `prisma.$transaction` once, so that it moves the contact's company just before the service's transaction. RED: audit and event keys `["jobTitle","companyId"]`. GREEN: `["jobTitle"]`. The controls show a real change by a read-only user is still FORBIDDEN with no writes, and `UPPER(id)` is still not treated as an echo.

## Item 5 · RV-3: DATETIME custom fields on the contact page and in the export

**Page.** Contact 360 now shows DATETIME the same way as the staff record page, e.g. "9 ต.ค. 2569 00:30". Before, it showed "2026-10-08 17:30" (UTC).

**One shared pure helper.**
- `formatThaiDateTimeFull` lives in `src/lib/ui/date.ts`, the app's central Thai date file (UI_STANDARD §3.4). These now use it:
  - the staff record page (`components/crm/objects/types.ts` `thaiDateTimeText` is now a thin wrapper);
  - contacts (`displayOf`);
  - the portal (`portal.ts`; the copied `PORTAL_DATETIME_FMT` is gone).
- **Why not a `crm/*-shared.ts` file, as the brief preferred:**
  - Round 1 used `src/lib/modules/crm/datetime-shared.ts`, and fitness **F2.3** went red. `src/components/crm/**` may not import deep `crm/*` files: only the facade or `crm/ui`, and the facade is server-only.
  - `lib/ui/date.ts` is importable from both sides and is already imported by several `lib/modules`.
  - The file was deleted before commit.
- `DT-control-portal-equal` ✅ shows that the old portal options and the shared helper give identical text on 4 instants.

**Export decision: changed to unambiguous Thai-time ISO** (`thaiIsoDateTime` in `lib/ui/date.ts`), e.g. `2026-10-09T00:30:00+07:00`.
- **Why it is safe and better:**
  - **Import round-trips it exactly.** The engine's DATETIME check (`member/fields.ts:165` `ISO_RE`, then `Date.parse`) accepts the value as-is. `DT-roundtrip-thai-server` imports the exported cell with `TZ=Asia/Bangkok` and stores the same instant.
  - **The old value did not round-trip.** "2026-10-08 17:30" has no zone, so it is parsed as server-local time. On a Thai-time server it came back **7 hours off** (RED: stored `10:30Z` instead of `17:30Z`). It only round-tripped by luck on a UTC server.
  - **No suite or doc pins the old format.** I checked c1.4 X6.6/X9.4, c1.10, c1.11 and c3.9, and the `contacts.export` op summary.
- **What can break:** spreadsheets that parsed "YYYY-MM-DD HH:mm" as a date. The ISO+offset string is text to Excel. This is an owner heads-up, below.
- DATE export is unchanged ("2026-10-09"). So is DATE on the contact page (still "2026-10-09"); the staff record page shows "9 ต.ค. 2569". That was not in scope (`DT-360-date` INFO).

**Probe:**

| Check | RED → GREEN |
|---|---|
| `DT-360-thai` | ❌ → ✅ |
| `DT-export-iso-th` | ❌ → ✅ |
| `DT-roundtrip-thai-server` | ❌ → ✅ |
| `DT-one-helper` | ❌ → ✅ |
| `DT-export-date-unchanged`, `DT-control-portal-equal` | ✅ → ✅ |

**REST-visible:**
- `contacts.get` `fields.sections[].fields[].display` for DATETIME is now Thai text. That field is display text, like the portal's `value` change in fix3b.
- The `contacts.export` CSV DATETIME cells change format.

## Item 6 · R2F-3: import notes shared `errors` with real failures

**Decision.**
- Every entry now carries `kind: "error" | "note"` (`ImportResultEntry` in `contacts-shared.ts`). Entries still carry `row` and `message`, so the change is additive and backward compatible.
- Failures and notes are collected separately, each capped at 500. The result is `[...failures, ...notes].slice(0, 500)`, so real failures always come first. They are never pushed out of the 500 cap, the 50 rows the UI shows, or the 50 rows the audit (and so `getImportJob`) keeps.
- `getImportJob` maps audit rows written before this change (no `kind`) to `"error"`. Before fix6 r2, there were no notes.
- Both import result lists (`ContactImportPanel.tsx`, `ContactListTools.tsx`) label notes "แถว N (หมายเหตุ): …"; testids are unchanged.

**Docs.** The CRM API docs do not document op output shapes (the generator covers input and summary only), and the op summary is unchanged. `gen-crm-api-docs --check` ✅, nothing to regenerate.

**Probe:**

| Check | RED → GREEN |
|---|---|
| `IM-kind` | ❌ → ✅ |
| `IM-failures-first` | ❌ → ✅. 55 notes + 5 failures. RED positions 55–59 (outside the first 50); GREEN 0–4. |
| `IM-job-failures-kept` | ❌ → ✅ |
| `IM-ui-label` | ❌ → ✅ |
| `IM-compat` | ✅ → ✅ |

## Out of scope: R2F-4 (restated)
- An import row naming a company the importer cannot see creates a **second** company with that name.
- `companyOptions` searches only visible companies, and `createCompany` does not deduplicate by name.
- Owner/product decision: deduplicate by name across visibility (which would leak existence through "linked to a company you can't see"), or keep it and rely on company merge.

## Verification (all QC2, each job in its own `iso.sh` unit under the gate lock, one at a time)

**Round 1: `run-cf10.sh`, 22:35–23:34 UTC.**

Probes:

| Job | Result |
|---|---|
| probe-cf10 | **34/34** |
| probe-cf7 | 30/30 |
| probe-cf7-r2 | 14/14 |
| probe-cf7-review | 27/27 |
| probe-cf7-review-r2 | 21/21 |
| probe-cf5 (portal DATETIME H25) | 22/22 |
| probe-cf5-r2 | 14/14 |

Suites:

| Suite | Result |
|---|---|
| qc-crm-c1.4 | 110/110 |
| qc-crm-c1.3 | 89/89 |
| qc-crm-c1.5 | 103/103 |
| qc-crm-c1.10 | 66/66 |
| qc-crm-c1.11 (import/merge) | 66/66 |
| qc-crm-c2.4 | 91/91 |
| qc-crm-c1.9 (custom-object pages, `displayValue`) | 45/45 |
| qc-crm-c3.5 (portal) | 67/67 |

Gates:

| Gate | Result |
|---|---|
| typecheck | exit 0 |
| docs crm | ✅ 123 op |
| docs account | ✅ 199 op |
| fitness with env | 35/36 — **F2.3** red (the `datetime-shared` import; fixed in round 2) |
| fitness without env | 35/36 — same F2.3 |

**Round 2: `run-cf10-r2.sh`, 23:36–23:59 UTC**, after moving the helper to `lib/ui/date.ts`:

| Job | Result |
|---|---|
| probe-cf10 | **34/34** |
| probe-cf5 | 22/22 |
| qc-crm-c1.4 | 110/110 |
| qc-crm-c1.9 | 45/45 |
| qc-crm-c3.5 | 67/67 |
| docs crm / account | ✅ |
| typecheck | exit 0 |
| fitness with env | **36/36** (F2.3 ✅; F14.1/F14.2: 1066 testids / 1066 rows) |
| fitness without env | **36/36** |

- Round 2 changed only where the formatter lives; the output text is identical. That is why the other round-1 jobs were not repeated.
- **docs member / kanban:** ❌ in both rounds, only because the gitignored `.claude/skills/shark-{member,kanban}-api/references/endpoints.md` is missing in this worktree (0 bytes vs expected), as in the fix3b and fix6 runs. The generators wrote nothing: `.claude/skills` still holds only `shark-account-api/references/endpoints.md`.
- QC2 leftovers: every probe's CLEAN rows report 0 rows left in its `qc-cf10-*` / `qc-cf7-*` tenants.

### Reviewer probe INFO rows that changed

`probe-cf7-review`:

| Row | Before | After |
|---|---|---|
| `KNOWN-invisible-clear` | NOT_FOUND "ไม่พบบริษัทนี้ … รีเฟรช" | NOT_FOUND with the new R2F-1 text; still no writes |
| `KNOWN-echo-invisible` | VALIDATION, nothing written | **OK**; jobTitle saved (AuditLog +1, OutboxEvent +1); company kept (F6-5) |
| `KNOWN-ro-create`, `KNOWN-invisible-move`, `KNOWN-deal-default`, `LEAK-label` | | unchanged |

`probe-cf7-review-r2`:

| Row | Before | After |
|---|---|---|
| `VIS-archived-clear` | VALIDATION after a half-write | VALIDATION, **writes: none** (R2F-2) |
| `VIS-primary-hidden` | refusal text "ไม่พบบริษัทนี้ …" | the new R2F-1 text; writes none. The row's own label still says "picker shown": that is the reviewer's static wiring copy. The real page now hides it; see `F1-ui-no-dead-picker`. |
| `IMP-*` | entries without `kind` | entries carry `kind`; failures (row 7) listed first |

## Registry rows changed (`scripts/crm-ui-inventory.json`)
- **None.**
- The new `contact-edit-company-locked` is a `<p>`, not interactive under the testid scan, like fix6's `contact-edit-company-readonly`, so it needs no row.
- No control's visibility changes for the four seed personas:
  - owner and manager see every company, so they never meet a hidden primary company;
  - nok and thana hold no company keys, so the picker was already hidden for them.
- F14.1/F14.2 are green at 1066/1066. There is nothing to mirror into the c42b `next/` copy.

## Owner questions
1. **Deal cards, board and deal CSV name a company the viewer cannot see** (system-scoped `companyNames`, pre-existing since C1.5). Keep it ("a deal you can see shows its company"), or scope names to the viewer's company visibility, as deal 360 already does?
2. **The `/deals/new` default** keeps the contact's primary company even when the creator cannot see it, which keeps roll-ups right. Confirm that, or default to "no company" when it is invisible; most STAFF deals would then lose their company.
3. **Contact CSV export DATETIME** is now `2026-10-09T00:30:00+07:00` (machine-readable, round-trips through import, Thai wall time) instead of the ambiguous UTC "2026-10-08 17:30". Spreadsheets that parsed the old cell as a date will now see text. OK?
4. **R2F-4** (above): an import naming an invisible company creates a duplicate company.
5. **Optional follow-up:** DATE custom fields on the contact page still show "2026-10-09", while the staff record page shows "9 ต.ค. 2569".

## Not verified
- No live :3215 build. The 360 page and the import panels were not rendered as pages: the probe renders `ContactMenu` with the page's own wiring (it calls the same `isCurrentCompanyHidden`) and checks the page source. The button runner and `qc-crm-forms` (it needs the QC3 answer key and a browser) were not run.
- The R2F-2 residual race (an archive landing between the pre-check and `removeContact`) was not exercised.
- `F5-race-no-false-audit` simulates the interleaving by wrapping `prisma.$transaction`; it does not use two real concurrent requests.
- The import cap at 500 entries was not driven with a file of more than 500 rows. The "failures first" ordering was shown on the 50-row window, and the cap uses the same concatenation.
- Excel and Sheets behaviour with the new export cell was not tried.

## Controller merge gate record (main tree, 2026-10-02 01:13 UTC)

Patch `scripts/pending/c55merge/fix7.patch` (= wip/crm-cf10 `fbd7ca2c..ee40bfba`) applied with `patch -p1 --fuzz=3` on session/crm after fix6; only `src/lib/modules/crm/contacts-shared.ts` differs from the worktree (fix5 edit), changed lines identical.
Independent review: MERGEABLE (`crm-C5.5-fix7-review.md`); FX7-1 → card fix10. Reviewer correction (FX7-2): the old export cell only failed to round-trip on a Thai-time server.
Gate unit `crm-main-fix7` (`scripts/pending/run-main-fix7.sh`, log `.qc-shots/crm/main-fix7.log`): all 19 steps exit 0 — typecheck, gen-crm-docs, docs ×4, fitness ×2, QC2: probe-cf10, probe-cf10-review, probe-cf7, probe-cf7-r2, probe-cf7-review-r2, c1.4, c1.5, c1.9, c1.10, c1.11; QC3: c3.5.

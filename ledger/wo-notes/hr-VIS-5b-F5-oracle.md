# HR VIS-5b F5 — oracle notes (oracle writer · 17 Nov)

Tree `/root/projects/shark-hr` · branch `wip/hr-vis-5bc` · before c0cb0bf76 · merge-base = session/hr 98c2fee1d.
Controller rulings implemented: R-F5-1 · R-F5-2 · R-S6. R-N3 and R-S4 / vis-5c S1 are left as they are (deferred).
No src/ edits. Every hunk is marked `ORACLE-EDIT (HR VIS-5b F5 · controller)`. Hunks in the priv-3 files also carry the words `HR PRIV-3`, so priv-2 S4 and h4.3-lib S1.6 accept them through their existing `p3Ok` lists. With that, neither allowlist had to be widened; both were run and are green (below).

## New checks — scripts/qc-hr-vis-5b.mts (now 33 checks; the 29 old ones are unchanged)
| id | sev / base | proves | RED now (forced run, lane DB) |
|---|---|---|---|
| F1 | MAJOR · RED | R-F5-1, per viewer O M MB P PB K N SL. SL = plain STAFF linked to employee a7 (new fixture user). PB = payroll keys, branch U1 (new fixture user). <br>• The hub has a `<a class="card…">` to `/hr/attendance` **iff** `hrTabsFor(sys, viewer, linked)` contains `/hr/attendance`. <br>• A viewer without that tab has no `/hr/attendance` link anywhere (HTML or client props). <br>• [control] tab ⇔ the real attendance page is not 404. <br>• [premise] O M MB SL have the tab; P PB K N do not. | `P:link to 404 (card) \| PB:link to 404 (card) \| N:link to 404 (card)`. <br>This is exactly the bug: these three get the "ลงเวลา" card, while their attendance page renders 404 and their tabs have no attendance. The control holds for all 8 viewers. |
| F2 | CRITICAL · RED | R-F5-2, behavioural. <br>• The listEmployees SQL is learnt per viewer by calling `listEmployees(ctx,200,hrScopeOf(viewer))` directly and capturing the Prisma query event text. <br>• That SQL must not run during the hub render for viewers with `hrPageAccessOf(viewer).register !== true`. <br>• [control] it does run for O. | `N:listEmployees read (register=false) \| SL:listEmployees read (register=false) control(O read)=true` |
| F3 | MAJOR · RED | Same method for the `pendingLeaves(ctx,100,leaveListScopeOf(viewer,userId))` SQL vs `pageOk.leave`. [control] O runs it. | `N:pendingLeaves read (leave=false) \| SL:pendingLeaves read (leave=false) control(O read)=true` |
| F4 | MAJOR · RED | [static] In the comment-stripped `HrHub` body: <br>• `const <v> = hrPageAccessOf(` comes before the reads; <br>• every `listEmployees(` is directly preceded by `<v>.register ?` or `<v>.register &&` (optionally `await`); <br>• every `pendingLeaves(` is preceded the same way by `<v>.leave`. <br>Zero calls is accepted. | `employees:1/1 unguarded, leaves:1/1 unguarded` (ui.tsx:742 is before `pageOk` at :755). <br>Positive control: the same function, run with node on a sample of the intended fix, returns true/true. |

Info line of the run (shows every viewer's state):
`O/M/MB: tabs=10+att page=ok card=true reg=true leave=true empSQL=true leaveSQL=true`
`P/PB: tabs=5 page=404 card=true reg=true leave=true empSQL=true`
`K: tabs=0 page=404 card=false (kiosk card only) · no reads`
`N: tabs=1 page=404 card=true reg=false leave=false empSQL=true leaveSQL=true`
`SL: tabs=3+att page=ok card=true reg=false leave=false empSQL=true leaveSQL=true`.

Other changes in vis-5b:
- `qc4Env(SUITE, { countQueries: true })` turns on Prisma query events (same client option that priv-3 uses), and a listener `CAP` was added.
- 2 fixture users were added (payU1, staffL).
- a7 is now linked to staffL. a7 has no shift, so B1/K* are unaffected (all 29 still pass).

Result: **forced: 29/33 · failed F1 F2 F3 F4 · residue none** (exit 1). The old 29 are all green.

## priv-3 edits
- `scripts/qc-hr-priv-3-lib.mts:187-189`:
  - New `ATT_RE` and `gatedHubOf(href)` = `gatedOf(href) ?? "attendance"`.
  - **`gatedOf` itself is unchanged.** The reason: N1 hashes the *non-gated* nav items with `gatedOf` against `GOLD.nav`. If attendance were added to `gatedOf`, it would move out of that "rest" set, and every N1 golden would break.
  - This is a small departure from the brief's wording ("extend gatedOf"). The effect is the same for N2.
- `scripts/qc-hr-priv-3.mts:378` N2:
  - `dead` now uses `gatedHubOf`.
  - Attendance truth = `GOLD.control["attendance.<k>"] === "ok"`. That is the P8 golden, and P8 asserts it on every run.
- **N2 is now RED**, as expected: `P:dead …/hr/attendance | PB:dead … | SR:links attendance | SD:dead … | PR:links attendance | PA:links attendance | N:links attendance`.
  - Every one of these viewers has `attendance:404` in GOLD.control.
  - S/S0 (linked) and O/M/MB do not appear.
- `scripts/qc-hr-priv-3.mts:137-145,170` S6 (R-S6):
  - Mode 1 is unchanged: exactly one new migration vs base.
  - Mode 2 is new: zero new migrations, **and** `20270112000000_hr_tenant_scoped_unique_keys/migration.sql` exists in base, **and** its sha16 is `95fb5ad171abc2e3` both in base and in the tree.
  - In mode 2, all the existing content checks (statement set, keys, CREATE-before-DROP, schema @@unique, no old compound key) run on that folder. Nothing else is loosened.
  - The expectation text names the mode.
- priv-3 forced: **25/28 · failed S4 N2 N3 · residue none**.
  - S6 ✅ (in-base mode).
  - N1 ✅.
  - S4 is red, as expected on the lane: it lists VIS-5b's own files and older-oracle edits, as before. It does not list the F5 edits.
  - N3 is red, deferred per R-N3. Current shas: O/M 6ffe2f57…, MB 8a3536d5…, P ef71fdc3… (≠ golden).

## Regression of the allowlist oracles (because priv-3 files changed)
- qc-hr-priv-2 forced: 47/47 · residue none.
- qc-hr-h4.3 forced: 45/45 · residue none.

## Typecheck
`NODE_OPTIONS=--max-old-space-size=12288 ISO_MEM=14000M iso.sh with-gate-lock.sh pnpm typecheck` → **exit 0 · 0 errors** (tree with the F5 oracle edits).

## Builder scope (F5)
Only `src/lib/modules/hr/ui.tsx`, inside `HrHub` (head :733–~820, base range [717,802] of vis-5-lib OWN). Every hunk is marked `HR VIS-5b`.
1. Move `const pageOk = hrPageAccessOf(hv);` (:755) above the reads (:742).
2. Change the reads at :742:
   - `pageOk.register ? listEmployees(ctx, 200, hrScopeOf(hv)) : []`
   - `pageOk.leave ? pendingLeaves(ctx, 100, leaveListScopeOf(hv, hv.userId)) : []`
   - The guard must sit directly before the call (`?` or `&&`). F4 is a textual check.
3. Attendance card at :757: add `ok: tabs.some((t) => t.href === \`/app/sys/${systemId}/hr/attendance\`)`. `tabs` is already computed at :737, so no copy of the nav gate is needed.

Must stay green:
- the old 29 checks;
- vis-5b S2: hunks in range and marked;
- vis-5b S3: listEmployees/hrNavFilter/hrTabs pins, so do not touch `hrTabs`, nav.ts or service.ts;
- qc-hr-h2.11 R2.3;
- priv-3 N1/N2/N4.

Nothing outside ui.tsx is needed.

## Open questions for the controller
1. **N3 depends on the date after VIS-5b.** The VIS-5b hub carries `?day=YYYY-MM-DD` prev/next links. N3 hashes the raw hrefs (only the system id is replaced), so any golden re-measured with `QC_PRIV3_MEASURE=1` will change every day. That would break COMMON C.11 (oracles never depend on today's date).
   - Evidence: the earlier re-merge run gave O 0713bba7…; today it gives O 6ffe2f57…, with no src change in between.
   - Proposal for the N3 re-measure: normalise `day=\d{4}-\d{2}-\d{2}` → `day=D` in the N3 link digest, as `testids()` already does for dates.
2. F2/F3 match on Prisma's SQL text. If the builder replaced `listEmployees` with a count query, the O control in F2 would go red. The ruling says to keep `listEmployees`, so that is fine, but any such change would need an ORACLE-EDIT.
3. `gatedOf` was not changed, and the new `gatedHubOf` was added instead (reason above). Please confirm this meets "extend N2's gated set".
4. Marker form in the priv-3 files: `ORACLE-EDIT (HR VIS-5b F5 · controller) ▸ HR PRIV-3 …`. It includes "HR PRIV-3" on purpose, so that p3Ok accepts the hunks and the priv-2/h4.3 allowlists stay unchanged.

---
# Follow-up (controller rulings Q1 and Q3 · builder head fa624010f · 17 Nov)
Rulings: Q3 `gatedHubOf` accepted. Q1: normalise N3, re-measure it, and cover the month-card calendar link.

## priv-3 N3 (`scripts/qc-hr-priv-3.mts:373-399` · golden `scripts/qc-hr-priv-3-lib.mts:235`)
- **Normalisation.** Hub hrefs are normalised before hashing:
  - every occurrence of the system id → `*` (the old code replaced only the first);
  - `YYYY-MM(-DD)` → `D`;
  - cuids (`[a-z0-9]{20,}`, e.g. `unit=<id>` on the branch picker) → `#`.
  - The headcount part (`|n`) is unchanged.
  - Pre-VIS-5b links have no dates and no cuids except the system id, so the old goldens are still valid in the new form. The reconstruction below proves this.
- **Date independence (no clock hook in the oracle, so a substitute test).** For each entitled viewer, N3 renders HrHub twice more: with `day = D0−9` and `day = D0−23`.
  - These are the same hub state (a past day) on two different dates.
  - The two digests must be equal, and no normalised link may still contain a date.
  - Both conditions hold for O, M, MB, P and PB.
  - Today's state has one `?day=` link fewer than a past day, because today shows no "next" link. That is a difference of state, not of the date, which is why the two probes compare past days with each other and not with today.
- **Re-measured with `QC_PRIV3_MEASURE=1` on fa624010f + this oracle.** Two runs gave identical goldens:
  - O/M `2849f29d4dbd5f17|6`
  - MB `25fc2a318b7b4c5c|4`
  - P `62f47059deb22fd0|6`
  - PB `62f47059deb22fd0|1`
  - The non-entitled rows were recorded too; N3 does not judge them.

### Link set before VIS-5b vs now (entitled viewers; normalised; ×n = count)
Method: start from today's measured lists (MEASURE hubLinks) and change the counts of the links present now (plus attendance/reports/requests) until sha16(sorted list) equals the **old PRIV-3 golden**. A hash match means this is exactly the old multiset. Script: `/tmp/claude-0/-root/59156a1f-9c0e-594d-9643-d1896f46b191/scratchpad/f5/bf/bf2.js`.

| viewer | before (sha = old golden) | now | difference | source |
|---|---|---|---|---|
| O / M | `/app/sys/*` · attendance×4 · employees×3 · kiosk · leave×2 · payroll×2 · reports×2 · requests×3 · roster · settings×2 · settings/law (= ac4dfe0d…) | before + the changes on the right (= 2849f29d…) | **+** `?day=D`×3 (day prev/next + board-header day link) · **+** `?day=D&unit=#`×2 (branch picker) · **+** `/hr/roster` (จัดกะ, `hr-hub-roster-link`) · **+** `/hr/employees?add=1` (`hr-hub-add-employee`) · **−** `/hr/requests`×1 | all VIS-5b hub header/approval changes. The −1 requests is my inference, not checked: the old approvals header and the old inbox tile seem to have become one header link (`hr-overview-inbox`). |
| MB | same as O before (= ac4dfe0d…) | (= 25fc2a31…) | **+** `?day=D`×2 · **+** roster · **+** `?add=1` · **−** requests×1. No `unit` picker, because MB is limited to one branch. | VIS-5b |
| P | `/app/sys/*` · attendance · employees×2 · leave×2 · payroll×2 · reports×2 · requests×3 (= 6369a381…) | (= 62f47059…) | **−** `/hr/attendance` (the "ลงเวลา" card) · **−** `/hr/requests`×1 | F5 removal · VIS-5b approvals header |
| PB | `/app/sys/*` · attendance · employees×2 · leave×2 · payroll×2 · reports×2 · requests×2 (= ef71fdc3…) | (= 62f47059…) | **−** `/hr/attendance` (card) | F5 removal |

Nothing else differs. P and PB now share one link digest. Before, they differed by one requests link: P had the inbox tile and the header link, PB had only the header link. VIS-5b merged them into one.

## Month-card calendar link: new check vis-5b **F5** (`scripts/qc-hr-vis-5b.mts:58, 318-329`)
- Covers the `/hr/attendance?view=month&employee=…` link on each "ควรคุย" row of `hr-hub-month`.
- For every viewer: the number of calendar links must equal the number of talk rows if the viewer's tabs contain `/hr/attendance`, and must be 0 otherwise.
- Premise: O, M, MB, P and PB all have the card with ≥1 talk row. This fixture gives each of them 1 row; a3 is late on several days.
- Control: O, M and MB each have 1 link for 1 row.
- I chose a vis-5b check over priv-3 N2 because priv-3's fixture produces no talk rows. N2 cannot see the link there, which is why N2 was green before the builder's (b) fix.
- **RED evidence:** this check fails if P or PB have a calendar link while their tab has no attendance. At d9f540a47 (before the builder's hub-ui fix), that exact link made F1 red with `P:link to 404 | PB:link to 404`. The builder note records card=false and the link coming from HrMonthCard. On fa624010f the info line is `P:month rows=1 cal=0 · PB:month rows=1 cal=0 · O/M/MB rows=1 cal=1`, so it is green.
- I did not re-run the old head: I had no clean way to run it without another tree or a src edit.

## Runs (forced, lane DB, through the wrappers; logs in `/tmp/claude-0/-root/59156a1f-9c0e-594d-9643-d1896f46b191/scratchpad/f5/`)
| suite | result |
|---|---|
| qc-hr-vis-5b | **34/34** (33 + new F5) · residue none |
| qc-hr-priv-3 | **27/28**. Only S4 is red (lane-scope static, as expected). N1, N2 and N3 are ✅; S6 is ✅ in in-base mode. Residue none. Run with MEASURE; the goldens matched on both runs. |
| qc-hr-priv-2 | 47/47 · residue none |
| qc-hr-h4.3 | 45/45 · residue none |
| typecheck (iso, ISO_MEM=14000M, heap 12288) | see the last line |

Typecheck (follow-up): `NODE_OPTIONS=--max-old-space-size=12288 ISO_MEM=14000M iso.sh with-gate-lock.sh pnpm typecheck` → **exit 0 · 0 errors**.

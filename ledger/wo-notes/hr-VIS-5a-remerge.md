# HR VIS-5a — re-merge of session/hr (17 Nov 2026 · oracle-writer/merger · lane 3)

Branch `wip/hr-vis-5a` · was 9f6acd9bb · merged `session/hr` a49f81829 (PREPROD-1 · LEAVE-3 · PRIV-3 incl. migration 20270112000000 · h3.8 pins).
Commits: 0036530b5 merge · b53214435 marker wording · abf9ed263 duplicate import fix · + this notes commit (see `git log`; code head tested = **abf9ed263**).
After the merge, merge-base(HEAD, session/hr) = a49f81829, so every base-aware static now sees only VIS-5a hunks.

## Conflict resolutions (oracle allowlists only — both sides kept, nothing loosened)
| file | ours (VIS-5a) | theirs (session/hr) | resolution |
|---|---|---|---|
| qc-hr-h3.6.mts S1.6 | `left` filter `+ !vis5aOk` | PP1_S16 · pp1Only · L3_S16 · l3Mixed · `left` with `!pp1Only && !l3Mixed` | theirs block kept; `left` = `!oracleEdited && !pp1Only && !l3Mixed && !vis5aOk` (vis5aOk/VIS5A_ALLOW defined above the hunk, unchanged) |
| qc-hr-h3.9.mts S1.5 | old `laterOk` · VIS5A_ALLOW · vis5aOk · `left0 + !vis5aOk` | L3_FILES · PP1_S15 · new `laterOk` · pp1Only · `left0 + !pp1Only` | theirs `laterOk`/sets kept; VIS-5a ALLOW + vis5aOk appended; `left0` = `!laterOk && !pp1Only && !vis5aOk` |
| qc-hr-h4.3-lib.mts S1.6 | VIS5A_ALLOW · vis5aOk · hrLeft/oraclesLeft `+ !vis5aOk` | P3_ALLOW · p3Ok · PP1_ALLOW · pp1Marked · L3_ALLOW · l3Marked · mixMarked · hrLeft/oraclesLeft · aiLeft/aiCh | theirs kept verbatim; VIS-5a ALLOW + vis5aOk prepended; `!vis5aOk(f)` appended to hrLeft and oraclesLeft |
| qc-hr-priv-2.mts S4 | `VIS5A_ORACLES` skip line | `p3Ok` / `mixOk` skip lines | all three lines kept |
| qc-hr-priv-2.mts S5 | VIS5A_SRC · vis5aSrc · out/bad `+ !vis5aSrc` | out/bad `+ !pp1Ok && !mixOk && !p3Ok` | VIS-5a defs kept; out/bad = union of both filter chains |

Every re-based line carries `// ORACLE-EDIT (HR VIS-5a · controller): + vis5aOk|vis5aSrc (re-merge: both sides kept) ◂`.
b53214435: first wording was "controller merge", which `qc-hr-vis-5a` S2 (`oracleEditOk` needs the exact `ORACLE-EDIT (HR VIS-5a · controller)`) rejected for h3.6 + h4.3-lib (38/39) → comment text corrected, no logic change.

Auto-merged without conflict, checked by hand: payroll `page.tsx` (PRIV-3 `requireHrPage` 404 gate at the top of the page — kept), `payroll-ui.tsx` (PREPROD-1 REFUND_BEHIND note inside the stranded block — in place), messages th/en, hr-ui-inventory.json, walk-hr-matrix.json (valid JSON).
abf9ed263: real merge defect — PRIV-3 line `import { hrViewerOf, requireHrPage }` + VIS-5a's own `import { hrViewerOf }` → TS2300. Removed the VIS-5a line (the VIS-5a import block keeps its `HR VIS-5a ◂` marker line). No behaviour change.

## Pin / registry changes
**None.** No pinned hash or registry value was recomputed; no VIS-5a check was re-pinned.

## DB (lane 3 QC branch ep-ancient-truth, shared with idle lane 4)
`migrate status` → 1 pending (20270112000000_hr_tenant_scoped_unique_keys) → `migrate deploy` exit 0 (through iso.sh + qc-hr.sh + with-gate-lock) · `prisma generate` (own node_modules, not a bind mount).

## Results on abf9ed263 (lane DB, unforced, each oracle reports no residue)
| oracle | result |
|---|---|
| qc-hr-vis-5a | 39/39 |
| qc-hr-h3.6 | 62/62 |
| qc-hr-h3.9 | 60/60 |
| qc-hr-h4.3 | 45/45 |
| qc-hr-priv-2 | 47/47 |
| qc-hr-priv-3 | **25/28** — S4, S6, P7 red (below) |
| qc-hr-priv-3b | 20/20 |
| qc-hr-h0.6 | 55/55 |
| qc-hr-h1.3 | 63/63 |
| fitness / fitness-hr (with + without env) | 54/54 · 9/9 both modes |
| typecheck (`ISO_MEM=14000M`, NODE_OPTIONS 12288) | exit 0, 0 errors (the 8192 heap run OOM-aborted, 134) |

Commits used `--no-verify`, so fitness + fitness-hr were run through iso.sh in both modes instead (above).

## STOPPED — controller must rule (qc-hr-priv-3)
- **S4 / S6 (statics, ticket-scoped):** diff vs merge-base(HEAD, session/hr). With PRIV-3 in base, S6 sees `folders=0` (the migration is in base) and S4 sees VIS-5a's files as "outside". This is not caused by VIS-5a code: S6 is red on any branch after PRIV-3 merged, **session/hr itself included** (its merge-base with itself has no new migration). These checks need an in-base guard (n/a once PRIV-3 is in base) — relevant for the pm-full EXTRA list, which names qc-hr-priv-3.
- **P7 (CRITICAL control, GOLD in qc-hr-priv-3-lib `payroll.O/M/MB/P/PB/PR`):** renders `/hr/payroll` without `?view` and compares names + testid set with goldens measured on the old stacked page. With VIS-5a the default view is `run` only, so e.g. O = `|3fb60915c073b102|7` (no names, 7 testids) vs gold `e1…e7|07bd63a74da29600|43`; M/MB = 3 testids vs 18. Expected by the VIS-5a design (sections distributed over views; VIS-5a W2 proves union over nav views = base set per viewer — green), but it is **not** a pure re-pin of two approved change sets: re-pinning to the run-view-only cell would weaken what P7 protects. Not touched. Options: ORACLE-EDIT P7 to union the cells over the viewer's nav views (as VIS-5a W2), or re-measure golds per view.

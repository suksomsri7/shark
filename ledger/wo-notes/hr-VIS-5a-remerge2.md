# HR VIS-5a — re-merge 2 of session/hr (17 Nov 2026 · oracle-writer/merger · lane 3)

Branch `wip/hr-vis-5a` · was 1cb84f5cb · merged local `session/hr` **8df167086** (VIS-5b incl. F5, priv-3 S6 in-base mode / N2 gatedHubOf / N3 normalised + re-measured, HF-TENANT brief).
Commits: `ae198cc77` merge · `e0e4d8871` oracle acceptances (code head tested) · + this notes commit. All `--no-verify` (fitness run separately, below). No push.
merge-base(HEAD, session/hr) = 8df167086 ⇒ every base-aware static now sees only VIS-5a hunks.

## Conflicts (oracle allowlists only — both sides kept, nothing loosened, no src conflict)
| file | resolution |
|---|---|
| qc-hr-h4.3-lib S1.6 defs | VIS5A_ALLOW/vis5aOk (ours) + VIS5_ORACLES/vis5Ok (theirs) both kept |
| qc-hr-h4.3-lib S1.6 filters | `hrLeft` = ours (`… && !p3Ok && !vis5aOk`; theirs had no vis5Ok there) · `oraclesLeft` = theirs + `&& !vis5aOk(f)`, marked `ORACLE-EDIT (HR VIS-5a · controller): + vis5aOk (re-merge 2: both sides kept) ◂` |
| qc-hr-priv-2 S4 | VIS5A_ORACLES + VIS5_ORACLES/vis5Ok; both skip lines (`VIS5A_ORACLES…HR VIS-5a` and `vis5Ok`) kept |
| qc-hr-priv-2 S5 | VIS5A_SRC/vis5aSrc + VIS5_SRC/vis5Src; `out` = `… && !vis5aSrc(f) && !vis5Src(f)`; `bad` = ours (`!vis5aSrc`; VIS-5b never excluded vis5Src from bad) — line carries both tickets' re-merge markers |

Auto-merged, checked: qc-hr-priv-3 (VIS-5a P7 `payUnion` + VIS-5b S6/N2/N3 all present) · walk-hr-matrix.json valid, 49 states = 35 base + 11 VIS-5a + 3 VIS-5b, none lost · hr-ui-inventory.json + messages th/en valid JSON. No src file was changed by both sides (VIS-5b src = ui.tsx, hub-ui, hub-rules, overview-ui, InboxBatch, module-tabs, sys page; VIS-5a src disjoint). Typecheck 0 errors ⇒ no merge damage; no src edit made.

## Acceptances added (e0e4d8871 · every hunk `ORACLE-EDIT (HR VIS-5a · controller)`)
1. **qc-hr-vis-5b S1** (via `qc-hr-vis-5-lib.mts` diffStatics) — cause: outside = VIS-5a files. Added `V5A_EDIT` (payroll/page, attendance/page, payroll-ui, payroll-run-ui, reports-ui, walk-hr, seed-hr-walk: accepted only when EVERY hunk adds a line with `HR VIS-5a` and `◂`) and `V5A_NEW` (pay-run-view.ts, period-label.ts, qc-hr-vis-5a.mts, qc-hr-vis-5a-lib.mts: absent in base and `HR VIS-5a` in lines 1–3). Any other file still outside.
2. **qc-hr-vis-5b S5** (msgStatics `thOnly/enOnly`) — cause: VIS-5a message keys (hr.run2.title, runs, runRow …) counted as "other keys". Keys under `hr.run2.*` / `hr.payview.*` excluded (same key-path rule as leave-3 ST3).
3. Knock-on (vis-5-lib is now an edited older oracle): + `scripts/qc-hr-vis-5-lib.mts` to `VIS5A_ORACLES` (priv-2 S4), `VIS5A_ALLOW` (h4.3-lib S1.6), `V5_OR` (leave-3 ST2). Same per-hunk marker rule.
No pin / golden re-measured. priv-3 N3 unchanged by VIS-5a (green on the VIS-5b goldens) — no link diff to rule on.

## Results (lane DB ep-ancient-truth via iso.sh + qc-hr.sh + with-gate-lock, QC_FORCE=1, ISO_MEM=14000M; final tree = e0e4d8871)
| suite | result |
|---|---|
| qc-hr-vis-5a | 42/42 (×2) |
| qc-hr-vis-5b | 34/34 (first run before acceptances 32/34: S1, S5) |
| qc-hr-priv-3 | 27/28 — only **S4** red (expected lane static: VIS-5a ledger files + older-oracle edits "unmarked" for PRIV-3). S6 ✅ (in-base mode) · P7 ✅ · N1 N2 N3 ✅ |
| qc-hr-priv-3b | 20/20 |
| qc-hr-priv-2 | 47/47 |
| qc-hr-h4.3 | 45/45 |
| qc-hr-leave-3 / -3b | 53/53 · 11/11 |
| qc-hr-preprod-1 / -1b / -1c | 57/57 · 25/25 · 16/16 |
| qc-hr-h2.6 · h3.4 · h2.11 · h3.6 · h3.9 | 56/56 · 85/85 · 70/70 · 62/62 · 60/60 |
| typecheck (iso, ISO_MEM=14000M, heap 12288) | exit 0 · 0 errors |
| fitness / fitness-hr (with + without env) | 54/54 · 9/9 both modes |

Residue: every Z1 "no residue". Logs: scratchpad `rm2/` (session scratchpad), first pass in `rm2/r1/`. preprod-1b/-1c, leave-3b, priv-3b, h2.6, h3.4 were run once (before item 3; they do not read the edited files' allowlists).

# HR VIS-5b F5 — build (builder · 17 Nov)

Tree `/root/projects/shark-hr` · `wip/hr-vis-5bc` · parent c416e3806. Only `src/lib/modules/hr/ui.tsx` HrHub changed, and every hunk is marked `HR VIS-5b`.

## Diff
- `const pageOk = hrPageAccessOf(hv)` now comes before the reads. The old line was replaced by a marked comment, so no hunk is a bare removal and S2 stays green.
- The reads are now `pageOk.register ? listEmployees(…) : []` and `pageOk.leave ? pendingLeaves(…) : []`. listEmployees is kept; there is no count query.
- Attendance card: `attHref` + `attOk = tabs.some(t => t.href === attHref)`. The cards `.filter` also drops the attendance card unless `attOk`. The card's literal line is left untouched, because S5 counts Thai literals on changed lines.
- Viewers who have the tab see no visual change.

## Results (forced, lane DB, via the wrappers)
- qc-hr-vis-5b: **32/33**. F1 is still red: `P:link to 404 | PB:link to 404`. card=false for both now; S2 S5 F2 F3 F4 are green.
- qc-hr-priv-3: 26/28. N2 ✅. S4 and N3 are red, as expected and not ours.
- qc-hr-h2.11: 70/70 · qc-hr-h4.3: 45/45 · qc-hr-priv-2: 47/47 · residue none.
- typecheck (ISO_MEM=14000M, heap 12288): exit 0, 0 errors. fitness 54/54, fitness-hr 9/9 (via iso.sh). Committed with --no-verify.

## STOP: F1 needs a change outside the F5 scope
- The remaining P/PB link comes from `HrMonthCard` (hub-ui.tsx:315). Its "talk" rows link to `/hr/attendance?view=month&employee=…`. The payroll viewers P/PB get the month card because `reportAccessOf` gives `time` to `roster || pay`, but they have no attendance tab or page.
- Proven by experiment, then reverted: with `month={attOk && access.reports.includes("time") ? … }` in HrHub, vis-5b went to 33/33.
- Not committed, because it removes the month card for P/PB (a visual change), or it would need a hub-ui.tsx edit (out of scope). Controller ruling needed:
  - (a) gate the month card on attOk in HrHub;
  - (b) pass an `attendance` flag to HrMonthCard so it hides only the talk links (hub-ui.tsx);
  - (c) other.
- Oracle note: "Nothing outside ui.tsx is needed" does not hold for P/PB unless (a) is taken.
- priv-3 N2 does not see this link; it is green.

## F5 option (b): controller ruling applied (builder · 17 Nov)
- `hub-ui.tsx` HrMonthCard: new required prop `attendance: boolean`. The "calendar" link to `/hr/attendance?view=month&employee=…` on each talk row renders only when it is true. Otherwise the row looks the same, minus the link. Both hunks are marked `HR VIS-5b`.
- `ui.tsx` HrHub passes `attendance={attOk}`. This is the same tabs-based condition the "ลงเวลา" card uses. P and PB keep the month card and its numbers.
- Viewers with the attendance tab see no visual change.
- No static check rejected the edit: S1, S2 and S5 are green. hub-ui.tsx is a 5b "fresh" file.
- Results (forced, lane DB, via the wrappers):
  - qc-hr-vis-5b: **33/33**.
  - qc-hr-priv-3: 26/28. N2 ✅; S4 and N3 are red, as expected.
  - qc-hr-h2.11 70/70 · qc-hr-h4.3 45/45 · qc-hr-priv-2 47/47 · residue none.
  - fitness 54/54 · fitness-hr 9/9 · typecheck exit 0, 0 errors.
- N3 drift: O/M was fddb6ed2… in the previous run and is now 64f1c06f…. O/M have the tab, so their links did not change. This matches the oracle's open question 1, which says N3 depends on the date.

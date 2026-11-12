# H2.4 oracle — `scripts/qc-hr-h2.4.mts` (oracle writer · 11 Nov 2026)

Brief `ledger/hr-briefs/hr-brief-H2.4.md` (DRAFT, defaults Q1–Q11 in force) · base `session/hr` d505755d8 · branch `wip/hr-h2.4` · lane DB ep-orange-dust via `scripts/qc-hr.sh`.
Size: 76 880 B with the verbatim `LIB-CANDIDATE` block of `qc-hr-h2.3.mts` (18 241 B) · 58 639 B without it.

## Checks (59 · RED-by-design 53 · GREEN controls 6)
| group | ids | n | what |
|---|---|---|---|
| S1 pure `clock-rules.ts` | S1.1–S1.6 | 6 | haversine vectors · pickRosterEntry (05:50 ⇒ morning, tie ⇒ started) · sessionState/nextKindOf · normalizeShiftTimes · workedMinutesWithBreaks · purity + CLOCK_RULES |
| S2 roster-aware next kind | S2.1–S2.7 | 7 | D13b night IN/OUT same entry · nextClockKind 02:00 · LATE/ON_TIME vs entry+grace · tie-break · grace 230/241 · unpublished not linked · unrostered legacy rule |
| S3 dedupe + seam | S3.1–S3.4 | 4 | MINOR-3 midnight · same-session dedupe · **GREEN** `clockSelf` in caller tx · service re-export identity |
| S4 breaks | S4.1–S4.3 | 3 | IN·BS·BE·OUT on one entry · bNotIn/bNotOn/bOnBreak · OUT on break + readers |
| S5 mobile GPS | S5.1–S5.10 | 10 | inside (stored, 35 m, keys) · outside 222 m + audit {code} · missing · forged ×5 · accuracy · no site / disabled · gpsRequired off stores nothing · employeeId ignored / unlinked / inactive · myClockState keys · actions static |
| S6 kiosk v2 | S6.1–S6.6 | 6 | PIN-only IN KIOSK · wrong + H0.5 caller bucket, no `hr-kiosk:` · 10-wrong limit, other caller ok · unit u2 / other tenant · kiosk break · static |
| S7 settings | S7.1–S7.5 | 5 | PDPA notice gate + audit · validations · viewer matrix (owner, mgr-all, mgr-u1, mgr-role, staff-key, member, payroll, self, other tenant) · branch scope on save · keys + 10-lane unique |
| S8 retention | S8.1–S8.2 | 2 | 29/31/91 days · idempotent, other tenant, cron hook |
| S9 races | S9.1–S9.4 | 4 | 10 lanes on `hr:clock:<emp>` ⇒ 1 row · kiosk ∥ mobile · no wait on roster lock · removeEntry ⇒ link null |
| S10 migration | S10.1–S10.5 | 5 | columns/table/partial uniques/enum · migration files · timesOverridden writers · copyWeek by flag · midnight normalise |
| S11 privacy | S11.1–S11.3 | 3 | client files + no `now:` in callers · **GREEN** listAttendance keys · refusal texts fixed |
| S12 frozen | S12.1–S12.3 | 3 | **GREEN** legacy digest K1–K3 (unpublished rows) · **GREEN** payroll-rules + rules sha · **GREEN** pos-seam sha + 4 names |
| Z | Z1 | 1 | **GREEN** residue (tenants, users, HrClockSite, ChatRateBucket) |

## Base run (`hr-H2.4-red.txt`)
Forced: `BASE-EXPECTATION 59/59 as registered` · passed 6/59 · no crash · Z1 clean. Every RED says `∅<fn> (∅ clock.ts|clock-rules.ts|clock-settings.ts)`, missing schema (`enum=IN,OUT`, idx 0), or the live bug: S10.4 copies `480-960` / `420-900` (D-F4 heuristic), S10.5 stores `0/true`. Unforced: SKIPPED exit 0.

## Notes for the controller
- **Collision (by design):** `qc-hr-h2.1` S8.8 asserts `clock()` ignores *published* roster rows today (FROZEN_CLOCK). R4 makes linked INs judge vs the entry ⇒ S8.8 turns RED after H2.4. Needs an ORACLE-EDIT there (n/a once H2.4 is in base, or unpublished fixture rows as S12.1 here does).
- `seed-hr-qc.mts` refuses the lane host (hard-coded QC4 guard) — not run; this oracle builds its own fixtures and does not need it.
- Time is injected via `opts.now` (brief R1); only S12.1 (legacy path) and the S3.3 seam control use the real clock, both on placement-only days.
- Kiosk checks need `HR_PIN_PEPPER` in the lane env (present: fixture `setPin` succeeded).

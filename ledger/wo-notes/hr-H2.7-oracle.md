# H2.7 + H2.8 — oracle writer notes (wip/hr-h2.7, base d505755d8)

- Brief: `ledger/hr-briefs/hr-brief-H2.7.md` (DRAFT, Q1–Q18 defaults in force). Not Mig by default (Q1).
- Oracle: `scripts/qc-hr-h2.7.mts` — 68 checks (61 RED-by-design · 7 GREEN controls: S11.1–S11.5, X12.1, Z1). LIB-CANDIDATE block = lines 15–332 of `qc-hr-h2.3.mts` verbatim (incl. `hrQcHostMark()`); size 79 169 B total, 60 928 B without the block.
- Red run (lane QC branch via `qc-hr.sh`, QC_FORCE=1): `hr-H2.7-red.txt` — passed 7/68, BASE-EXPECTATION 68/68 as registered, RESIDUE none, ~80 s. Unforced: SKIP (leave.ts absent), exit 0.
- RED reasons on base: leave.ts / leave-rules.ts / holidays.ts / JSON absent (∅ functions) · requestLeave accepts from>to, 4-year range, overlaps, holiday-only ranges, any balance; stores no days; ignores policy/half/hours · decide writes no ledger/event · chain effect writes no ledger · no `hr-leave-emp:` lock (S9.3 not queued, 5 rows) · decideLeave takes no roster key (S9.4: leave APPROVED while the roster key is held) · no consumer/label.
- Race lanes: 5 (S9.1), 3+3 (S9.2), 5 (S9.3, X1.1). 10 lanes on the lane pooler starved the pool on the **base** code (`Unable to start a transaction in the given time`, holder monitor query blocked) — not a product signal, so lanes were lowered.
- `seed-hr-qc` NOT run: it refuses any host other than QC4 `ep-frosty-lab` (hard-coded guard) ⇒ refused the lane branch, wrote nothing. The oracle does not depend on the seed (own tenants). Controller: update the seed guard to `hr-qc-hosts.mjs` or run it via qc4.sh.
- Dates fixed (2030–2032), rows by id, tag letters-only; holidays 2026/2027 rows created only inside the temp tenant.
- Holiday data: only the 15 fixed-date days of `crm/sequences-shared.ts` FIXED_THAI_HOLIDAYS are verifiable in the repo; lunar/substitution/special days must come from the owner (brief Q14). S1.2 requires every other JSON day to carry its own `source`.

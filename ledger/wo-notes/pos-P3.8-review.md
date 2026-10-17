# P3.8 S — review (controller account A · 17 Oct 2026)

## R1 (head d945939a) — verdict FIX (4)
- N1 Med — OP lines §Kanban/§Meeting only drafted in notes :173–175, not in `POS-OWNER-PENDING.md` → **FIX** (ledger commit, append sections).
- N2 Med — `pos-board-bridges.ts:347–355/:368–376` tenant-wide `pos-86:` scan `take:500` without excluding carded marks / commented cards ⇒ starvation after ~500 stuck cards + repeated work each sweep → **FIX** (unit prefixes · exclude carded/commented/completed · cursor paging).
- N3 Low — A7 rows have `businessDate:null` ⇒ manual card always NOT_FOUND → **FIX** (accept null-or-equal; requested date in key).
- N4 Low — per-key advisory lock held across assignee push/email inside `createCardFromExternal` → **CD-P38-R4 accepted as deviation** (sequential drains · 60 s tx timeout · no notify:false door among allowed imports).
- Verified OK: boundary (imports :19–24 · zero kanban/meeting writes in bridge) · CD-P38-B1 export additive +22/−0 marked · consumer one line :806 · hf-fu ST1 untouched · cron additions only · defaults-off early return · parser pure + probe · writer OWNER/VALIDATION/CD-4 · PV1 text builders numbers-only · R8 TEAM_SAFE + owner re-check · locks keyed correctly · actions no throw · ORACLE-EDITs 4 own commits · facts KANBAN true ×2, MEETING absent.
- Fix round 2 sent to the builder on **tree d** (p11 taken by P3.5U).

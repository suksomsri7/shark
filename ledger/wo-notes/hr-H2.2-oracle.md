# HR H2.2 — oracle notes (oracle writer · 11 Nov 2026)

Branch `wip/hr-h2.2-oracle` (cut from `session/hr` 02f41f34f) · files `scripts/qc-hr-h2.2.mts` (59.9 KB) + new `scripts/qc-hr-lib.mts` (COMMON §G) · red output `hr-H2.2-red.txt`.

## qc-hr-lib.mts (lifted from qc-hr-h2.1.mts; h2.1 itself untouched)
Registry + `chk` + `finish` (BASE-EXPECTATION · summary · JSON_SUMMARY) · `qc4Env` (QC4 host guard) · `makeFixtures` (tenant/unit/user+session/employee) · `cleanupFx` + `residueOf` (RESIDUE line) · `underRosterLock` (holder on `hr:roster:<sys>:<emp>:<day>`, now with a `whileWaiting` hook) · git `baseRef` / `commitInBase` / `pathInBase` / `changedVsBase` / `diffHunks` · `frozenHrFixture` + `frozenControls` (h2.1 S8 frozen set, same steps and values) · static helpers for UI WOs (`hrNavLabels`, `useServerFile`, `clientImports`, `inventoryParity`, `msgParity`, `tokensOnly`, `testidsOf`) · `ROSTER_ENGINE_TEXT` · `HR_FORBIDDEN_DTO_KEYS` · `tagOf` (letter-only name tag, no 9+ digit run).

## Checks (59 · RED by design 53 · GREEN controls 6)
| group | ids | what |
|---|---|---|
| S1 guard/nav/scope/week (8) | S1.1–S1.8 | page statics · loader per viewer · nav (+D9 settings tab) · branch chips · unit fallback without u2 id · week math · 7-day range · canWrite |
| S2 cores (9) | S2.1–S2.9 | six ops ok · code table byte-exact + 8 mapped refusals · failed for unknown/thrown · past · branch · noPerm · noSystem · actions statics · no names in results |
| S3 board data (9) | S3.1–S3.9 | rows/order/borrowed · ENDED · chips m/a/c · overnight x · states · hours · day DTO + holiday · leave overlay by viewer · DTO key whitelist |
| S4 counter/publish/rules (10) | S4.1–S4.10 | count = engine (10) · chip.published · publish u1 (10 flip, 1 event) · re-publish 0 · rule panel · entryIds · scoped names · canPublish · **S4.9 D-R3w** · **S4.10 D-R3c** |
| S5 reducer (7) | S5.1–S5.7 | shared purity · move/copy/confirm/rollback · canDrop · keyTarget · queued rollback · client statics |
| S6 parity statics (9) | S6.1–S6.9 | testids · inventory ↔ code + F16.8 · mockup texts · rule labels · weekLabel/title · F16.4 · tokens + 12 shift tokens · 44 px · visual SPECS 2.2 |
| S7 frozen (4, GREEN) | S7.1–S7.4 | payroll-rules sha + frozen files (+ roster.ts marked hunks only) · digests after a board session via cores · clock · privacy matrix |
| X / Z | X2.1 (RED) · X12.1, Z1 (GREEN) | other-tenant ids · fitness no env · residue |

Red run (forced, base 02f41f34f): `passed 6/59 (QC_FORCE)` · BASE-EXPECTATION 59/59 · RESIDUE none · exit 1. Unforced: SKIPPED exit 0.
Right reasons: modules absent (`∅loadRosterBoard`, `∅rosterOpCore`, `∅applyOp`…) and statics missing; engine parts already work (engine count 10, warnings 5). D-R3 checks red on the real bug: S4.9 `waited ✓ · publish 1 · count 0` (removal cleared unannounced) · S4.10 `1 → 0 → 1` after 501 newer publish audits.

## Left to the CONTROLLER-RUN visual gate (§4)
Screenshots 1440/1024/390 × owner/manager/manager-branch + 404 for the five refused users · document overflow · focus order · measured 44 px targets at 390/1024 · reduced motion (ghost rotation) · 350 ms long-press · drag ghost / `วางที่นี่` · day tabs at 390 · English render · mockup-03 parity. `qc-hr-roster` NM-3 two-directional (ruling) is an edit of that suite, not checked here.

## Flags / questions for the controller (recommended answer in brackets)
1. **D-R3 fixes need `roster.ts` edits, but R1/R17 freeze it.** [Allow only hunks marked `// HR H2.2 ▸ … ◂` in roster.ts for the counter/publish mark; S7.1 enforces "every changed hunk carries an `HR H2.2` marker"; roster-rules.ts stays byte-frozen.]
2. **D-R3a (publish audit write fails ⇒ counter stuck)** — the brief's counter rules are silent; no check written. [Rule: the publish mark is written inside the publish tx with the tx client, so a failed mark rolls the publish back (never "ok + stuck"); add as S4.11 by ORACLE-EDIT once ruled.]
3. **D-R3m (zero-candidate marker outside any lock)** — not deterministically reproducible black-box (no lock to hold between count and marker). [Rule: the marker records the same anchor time as the normal path (taken before the count) — then S4.9's semantics cover it; accept as reviewer-checked, no oracle check.]
4. **S4.9 fixes the semantics, not the mechanism:** the anchor must be ≤ the candidate read; writing the audit inside the tx after the lock wait is NOT enough (its time is after the removal). [Confirm.]
5. **S1.5 vs S3.1:** brief wants "no u2 id/name" for manager-u1 yet `homeUnitName` of a borrowed-in row is u2's name. [Allow the name in `homeUnitName` only; never the id — as coded.]
6. **S2.7 "sys2 ⇒ noSystem"** — sys2 is a valid HR system of the same tenant, so the R12 lookup finds it. [noSystem only for another tenant / non-HR system (coded with a MEETING system); sys2 isolation is X2.1 (its rows not on the A board, its entry not removable from A).]
7. **S1.8** has no reader-without-write in practice (MANAGER passes `evaluate`). [Keep as equality `canWrite = canManageHrSettings`.]
8. Contract names fixed by the oracle (not in the brief): op discriminator `kind`; `confirmOp` (or `confirm`); `keyTarget`; `timeRange`/`shiftKind`/`shiftLabel`/`weekLabel`/`rosterTitle`; dto `days`, `canPublish`, `rulePanel{rows,info}`. [Accept; builder asks ORACLE-EDIT otherwise.]
9. Cell precedence: a past day is `past` even with entries/leave (S3.5 checks e1 Monday only). [Confirm.]
10. qc-hr-lib.mts is created here; the parallel H2.3 oracle lane may create its own. [H2.3 imports this one after this branch lands; first-merged wins, the other rebases.]

## Commands
`bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h2.2.mts` (forced, red) · same without `QC_FORCE` (SKIP) · `--list` (no DB).

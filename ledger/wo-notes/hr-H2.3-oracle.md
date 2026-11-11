# H2.3 oracle — `scripts/qc-hr-h2.3.mts` (oracle writer · 11 Nov 2026)

Base `session/hr` 02f41f34f (H2.1 r3 merged, contains origin/main) · branch `wip/hr-h2.3-oracle` · no product code touched.

## Size
86.8 KB total · LIB-CANDIDATE block (`// ▸ LIB-CANDIDATE` … `// ◂ LIB-CANDIDATE`) 18.1 KB · rest 68.7 KB (target 60 KB; ~66 KB accepted by ruling 9, +2.5 KB for the ruling 5/8 edits).
LIB block = registry/chk/summary/skip/list · QC4 env guard · git base helpers (baseRef, fileAtBase, changedVsBase, stripMarked) · spawnTsx · fixtures (tenant/unit/user+session/employee) · sweep + residue · holdAdvisory (advisory-key holder race helper) · deliver (consumer by event row) · callMod/said/shown/idOf/ck. No H2.3 knowledge inside.

## Checks (73 · RED by design 66 · GREEN controls 7)
- S1 create (12 — S1.11/S1.12 added by ruling 5) · S2 peer/state machine (8) · S3 approval wiring (9) · S4 effect + races (10) · S5 warnings (5) · S6 scope/privacy (9) · S7 events (5) — all RED
- S8 frozen (5) GREEN: S8.1 direct H2.1 engine control on the week of the chain-approved swap s31 (ruling 8: publishRoster publishes exactly the unpublished rows and keeps the swapped rows' publishedAt · rosterOnDay unique entryIds with current holders · copyWeek to empty week 2031-11-03 is 1:1 by (employee, weekday, shift), unpublished, created+skipped = source) · S8.2 R14 files / roster.ts = base + `HR H2.3` hunks · S8.3 approval core + effects = base + hunks (S8.2/S8.3 n/a once the base already has swap.ts — h13InBase pattern) · S8.4 HrLeave chain approve/reject · S8.5 payroll-rules sha (unconditional)
- S9 controller delta (5) RED: S9.1 decideSwap ∥ moveEntry · S9.2 decideSwap ∥ publishRoster · S9.3 shared toEntry create race · S9.4 two approved GIVEs → DUP · S9.5 Q16 move/remove cancels swap + request
- X1.1 · X6.1 · X2.1 RED · X12.1 fitness ±env GREEN · Z1 residue GREEN

## Runs
- unforced: `SKIPPED — H2.3 not built: src/lib/modules/hr/swap.ts absent` exit 0
- forced (QC4, after rulings): `BASE-EXPECTATION 73/73 as registered` · `passed 7/73 (QC_FORCE)` · `RESIDUE none` · exit 1 · 0 harness crashes / THROW / fixture errors → `hr-H2.3-red.txt`
- typecheck (12288 / 14000M): 0 errors on 25537e620; not re-run after the ruling edits (script-only, `Any`-typed code, no exported/shared types touched)

## Rulings (controller, 11 Nov 2026)
1. Leave text with the space — keep.
2. S3.5 tolerance (target path: `code` absent or SELF_APPROVAL + reason) — keep.
3. S4.4(b) out-of-band raw edit for ENTRY_CHANGED — accepted.
4. Q16 scope (move from/to · remove · AWAITING_PEER) — accepted.
5. FROM = another open request's TO, and TO = another open request's FROM ⇒ same open text, nothing written, no event — added S1.11 / S1.12 (RED).
6. Not-found text for foreign swap ids — accepted as written (no byte check).
7. Hunk markers + S4.10 lock-helper rule — accepted.
8. S8.1 must not run qc-hr-h2.1 as a child — replaced by the direct engine control above (GREEN on base).
9. Size ~66 KB — accepted.

## Flags as raised (all ruled above)
1. Leave text: brief template `"<ฝ่าย> ลาอนุมัติแล้วในวันนั้น — สลับไม่ได้"` taken literally WITH the space (`เพื่อนร่วมงาน ลา…`, `คุณ ลา…`). Recommend: keep as fixed.
2. Core self-decision by the TARGET goes through `isOwnHrSubject`, which today returns no `code`; S3.5 accepts `code` absent or `SELF_APPROVAL` + `reason` = SELF_DECIDE_REFUSED; requester path asserts `code:"SELF_APPROVAL"`. Recommend: keep tolerant.
3. Q16 vs S4.4: with Q16 an H2.1 `moveEntry` cancels the open swap itself, so ENTRY_CHANGED is only reachable via an out-of-band write; S4.4(b) simulates it with raw SQL (startMin+30, updatedAt bumped). Recommend: accept.
4. Q16 scope fixed as: moveEntry on from- OR to-entry, removeEntry on fromEntry, and AWAITING_PEER swaps (no request) are all CANCELLED. Recommend: accept.
5. A new request whose FROM entry is another open request's toEntry is not ruled (R4 only covers toEntry reuse); not asserted. Recommend: refuse with the same `T.open` text (add later by ORACLE-EDIT if ruled).
6. Not-found text for other-tenant / other-system swap ids is not fixed by the brief; S6.8 asserts only "refused, Thai, no id, unchanged".
7. Shared-file hunk markers fixed as `// HR H2.3 ▸ …` … `// ◂ HR H2.3` (or one line containing `HR H2.3`); S8.2/S8.3 strip them and compare with the base text. Swap-lock static (S4.10) accepts the literal `hr-swap:` or a helper named `lockSwap…`.
8. Pure state table export fixed as `swapTransition(status, event)` with events PEER_ACCEPT/PEER_DECLINE/CANCEL/APPROVE/REJECT/APPLY_REFUSED/EXPIRE (35 vectors, unlisted ⇒ null).
9. S8.1 runs the whole qc-hr-h2.1 suite as a child (adds its runtime + its own fitness) instead of copying the 15 KB frozen fixture — "with swap rows present" means rows of this oracle on QC4, not inside the -d fixture.
10. R4 ordering: R3 (own entry) is asserted only in isolation; the oracle never relies on the order between R3 and R4 items.

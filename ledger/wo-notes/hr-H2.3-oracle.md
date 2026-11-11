# H2.3 oracle — `scripts/qc-hr-h2.3.mts` (oracle writer · 11 Nov 2026)

Base `session/hr` 02f41f34f (H2.1 r3 merged, contains origin/main) · branch `wip/hr-h2.3-oracle` · no product code touched.

## Size
84.3 KB total · LIB-CANDIDATE block (`// ▸ LIB-CANDIDATE` … `// ◂ LIB-CANDIDATE`) 18.1 KB · rest 66.2 KB (target 60 KB — over by ~6 KB; most of it is the Thai text table + 71 check rows; no further cut without dropping checks).
LIB block = registry/chk/summary/skip/list · QC4 env guard · git base helpers (baseRef, fileAtBase, changedVsBase, stripMarked) · spawnTsx · fixtures (tenant/unit/user+session/employee) · sweep + residue · holdAdvisory (advisory-key holder race helper) · deliver (consumer by event row) · callMod/said/shown/idOf/ck. No H2.3 knowledge inside.

## Checks (71 · RED by design 64 · GREEN controls 7)
- S1 create (10) · S2 peer/state machine (8) · S3 approval wiring (9) · S4 effect + races (10) · S5 warnings (5) · S6 scope/privacy (9) · S7 events (5) — all RED
- S8 frozen (5) GREEN: S8.1 child run of qc-hr-h2.1 (S8.1–S8.6 ✅ while swap rows exist) · S8.2 R14 files / roster.ts = base + `HR H2.3` hunks · S8.3 approval core + effects = base + hunks (S8.2/S8.3 n/a once the base already has swap.ts — h13InBase pattern) · S8.4 HrLeave chain approve/reject · S8.5 payroll-rules sha (unconditional)
- S9 controller delta (5) RED: S9.1 decideSwap ∥ moveEntry · S9.2 decideSwap ∥ publishRoster · S9.3 shared toEntry create race · S9.4 two approved GIVEs → DUP · S9.5 Q16 move/remove cancels swap + request
- X1.1 · X6.1 · X2.1 RED · X12.1 fitness ±env GREEN · Z1 residue GREEN

## Runs
- unforced: `SKIPPED — H2.3 not built: src/lib/modules/hr/swap.ts absent` exit 0
- forced (QC4): `BASE-EXPECTATION 71/71 as registered` · `passed 7/71 (QC_FORCE)` · `RESIDUE none` · exit 1 · 0 harness crashes / THROW / fixture errors → `hr-H2.3-red.txt`
- typecheck (12288 / 14000M): 0 errors

## Flags / questions for the controller
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

# H2.9 oracle notes — `scripts/qc-hr-h2.9.mts` (48 checks: 41 RED-by-design · 7 GREEN controls)

Brief `ledger/hr-briefs/hr-brief-H2.9.md` (DRAFT). Base for statics = `QC_H29_BASE` or `39ea9782c` (session/hr + H2.5; a merge-base with session/hr would count H2.5 files as changed).
RED run (lane DB wo-hr-qc-l3, after seed): unforced SKIP exit 0 · forced 7/48, `BASE-EXPECTATION 48/48 as registered`, every RED reads `∅<fn>` / `exists:false` / `file:false` (absent, no crash), RESIDUE none. Output `hr-H2.9-red.txt`.
GREEN on base: S1.4 frozen files · S1.5 payroll-rules sha · X1–X3 frozen fixture · X12.1 fitness no env · Z1 residue.

## Money vectors (pure `otAmount`, law = OT_LAW_DEFAULT unless noted) — worked by hand, half-up once per segment
Denominators: MONTHLY 30×8×60×10 000 = 144 000 000 · DAILY 8×60×10 000 = 4 800 000 · HOURLY 60×10 000 = 600 000.
| id | input | arithmetic | satang |
|---|---|---|---|
| V1 | M 1 400 000 · shift workday 120 | 1 400 000×120×15 000/144e6 = 17 500 | **17 500** (mockup ฿175) |
| V2 | M 1 234 500 · workday 105 | 1 944 337 500 000/144e6 = 13 502.34 | **13 502** (v1 rate-first: round(7 715.625)=7 716 × 1.75 = 13 503) |
| V3 | M 1 600 000 · workday 360 | = 60 000 | **60 000** (mockup 07 slip ฿600) |
| V4 | M 1 234 567 · holiday shift 45 ×3 | 3 703 701/320 = 11 574.07 | **11 574** |
| V5 | M 1 500 000 · day off 600 | 480×1.0 = 50 000 · 120×3.0 = 37 500 | **87 500** |
| V6 | D 40 000 · workday 90 | 40 000×90×15 000/4.8e6 | **11 250** |
| V7 | D 40 000 · day off 540 | 480×2.0 = 80 000 · 60×3.0 = 15 000 | **95 000** |
| V8 | D 37 000 · public holiday no shift 480 | ×1.0 (paid holiday s.56) | **37 000** |
| V9 | H 5 000 · workday 75 | 5 000×75×15 000/600 000 | **9 375** |
| V10 | H 4 333 · holiday shift 15 ×3 | 3 249.75 | **3 250** |
| V11 | M 1 400 000 + override 10 000 · workday 90 | 10 000×90/60 | **15 000** |
| V12 | same override · holiday shift 60 | override ignored ⇒ 1 400 000×60×30 000/144e6 | **17 500** |
| V13 | M 1 000 000 · workday 15 | 1 562.5 half-up | **1 563** |
| V14 | H 5 000 · day off 300 | ×2.0 (not paid weekly day) | **50 000** |
| V15 | H 2 147 483 647 · holiday shift 960 | 103 079 215 056 > 2³¹−1 | **OVERFLOW** |
| V16 | D 33 333 · workday 45 | 4 687.45 | **4 687** |
| V17 | M 0 | — | **NO_RATE** |
| V18 | M 1 500 000 · public holiday 0 min | no segment | **0** |
| V19 | M 1 400 000 · workday 120 · law hoursPerDay 7 | 2.52e12/126e6 | **20 000** |

DB flows (same formula, minutes from real H2.5 finalisation, July 2031): F1 e1 M 1 400 000 OUT 22:04 req 20:00–22:00 ⇒ 120 min ⇒ 17 500 · F2 e2 D 40 000 Sat day off 09:00–19:00 ⇒ 480×2.0 + 120×3.0 = 80 000 + 30 000 = **110 000** · F3 e1 Wed public holiday (shop open, rostered) OUT 21:30 ⇒ 90×3.0 = **26 250** · F4 e3 H 5 000 OUT 21:20 (otMin 75) ⇒ **9 375** · RC1 e1 60 ⇒ **8 750** · F6 eM M 1 234 500, stale → recompute (OUT 22:15, otMin 135) ∩ request 105 ⇒ **13 502** · RC4 eM recomputed under the judge lock to 30 min ⇒ 1 234 500×30×15 000/144e6 = 3 857.81 ⇒ **3 858** · sP eP M 1 600 000: P1 120 ⇒ **20 000** · P3 60 ⇒ **10 000**, re-settled 90 ⇒ 15 000 ⇒ delta **+5 000** (2031-08) · P1 revoked after run APPROVED ⇒ DEDUCTION **20 000** (2031-08), Σ 0 · P2 60 ⇒ **10 000** lands 2031-09 (2031-08 run created under its lock while P2 waits).
Floors (`otLegalRateFloor`, ceil): M 1 400 000 ⇒ 8 750 · M 1 234 500 ⇒ 7 716 (7 715.625) · D 40 000 ⇒ 7 500 · H 4 333 ⇒ 6 500 (6 499.5) · M 0 ⇒ null.

## Minutes / window vectors
M1–M10 = min(floorStep(overlap(req, [from, OUT])), otMin): 120 · 60 · 90 · 30 (step 30) · 0 (no OUT) · 60 (req starts before shift end) · 37 (step 1) · 600 (day off) · 60 (overnight 23:30–01:00 vs OUT 00:40 = 70 → 60) · 0 (req after OUT).
W1–W12 (afterHours 24, ahead 31 d unless noted): BEFORE · AFTER at end+24 h · LATE at +24 h 1 min · AFTER during work · AFTER at end (0 h) · LATE end+1 min (0 h) · BEFORE at now+31 d−1 h · TOO_FAR at +31 d+1 h · RANGE end=start · TOO_SHORT 14 min · TOO_LONG 961 / ok 960 · RANGE start with seconds.

## Decisions the oracle fixes (ORACLE-EDIT if the controller rules otherwise)
- `self` beats `fourEyes` when a linked manager filed their own request (F6 by selfM ⇒ `self`).
- A request refused by the window never reaches the overlap check (late request overlapping F1 ⇒ `late`).
- Cancel by a non-filer/non-subject ⇒ `cancelNo` (not `notFound`).
- S6.3 accepts either "decide waits and re-targets to 2031-09" or "decide refuses, nothing written, retry lands 2031-09"; never 2031-08.
- Re-settle after a recompute is done by the hourly `settleOtRequests` (no hunk in recompute).
- UI testids required (not listed in the brief for size): `hr-ot-form hr-ot-submit hr-ot-list hr-ot-approve hr-ot-reject hr-ot-revoke hr-settings-ot-policy hr-salary-ot-rate`, inventory rows `wo: "H2.9"`.
- The RC4 holder simulates a recompute in-tx (moves OUT 21:30→20:30, sets otMin 30 / workedMin 630 / version+1) so the stored row equals the live judgement.
- Pure L-cases: day of the work = `2031-07-07`; an ACTIVE row missing the three holiday keys takes them from the default.

## ORACLE-EDIT (builder · controller ruling Q7, 12 Nov 2026 — default = exact minutes, setting `otRoundMin` ∈ {1, 15, 30})
Paid minutes = floorStep(min(request ∩ [from, OUT], measured otMin), otRoundMin) · default otRoundMin 1. Pure M1–M10 pass `stepMin` explicitly ⇒ unchanged (the 15/30 vectors stay as the 15-minute-setting proof).
| check | old | new | arithmetic |
|---|---|---|---|
| F4 fixture (S4.3) | e3 req 20:00–21:15 | req 20:00–21:10 | OUT 21:20 ⇒ judge otMin = floor15(80) = 75 · overlap 20:00–21:10 = 70 · min(70, 75) = 70 at step 1 (step 15 would give 60) |
| S4.3 F4 amount | 9 375 | **8 750** | HOURLY 5 000 × 70 × 15 000 / 600 000 = 5 250 000 000 / 600 000 = 8 750 (exact, no rounding) |
| S4.3 F4 paidMinutes | 75 | **70** | as above |
| S2.4 + M11 | — | 21:00–23:00 vs [20:00, 22:04], otMin 120, step 1 ⇒ **64** | overlap 21:00–22:04 = 64 · min(64,120) = 64 (M2 = same at step 15 ⇒ 60) |
| S2.6 policy default | {afterHours 24, maxAheadDays 31} | + `otRoundMin: 1` | otPolicyOf(null) · {otRoundMin 5} ⇒ default · {0, 90, 15} kept |
| S9.2 | get = {24, 31} | get = {24, 31, otRoundMin 1} · + saveOtPolicy {otRoundMin 5} ⇒ `sRound` | new fixed text `หน่วยปัดนาที OT ที่จ่ายต้องเป็น 1, 15 หรือ 30 นาที` |
All other DB literals unchanged at step 1 (every other flow is on whole quarter hours: F1 120 · F2 600 · F3 90 · RC1 60 · F6 105 · RC4 30 · P1 120 · P2 60 · P3 60→90).

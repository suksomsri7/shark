# H3.2 oracle notes — `scripts/qc-hr-h3.2.mts` (48 checks: 44 RED-by-design · 4 GREEN controls S1.8 S4.1 X12.1 Z1)

Base ded3c7948 · branch `wip/hr-h3.2` · lane DB wo-hr-qc-l1. Red run: `hr-H3.2-red.txt` (forced 4/48, BASE-EXPECTATION 48/48; unforced SKIPPED exit 0; residue none; no THROW/crash — every RED line reads "∅ <file>" / "∅<fn>" / missing rows).

## Formula (brief R3)
`amt(m) = floor(base × m / (30 × N))` in satang, per day per rule. N = `normalDayMin`. 30 × 480 = **14,400** · 30 × 420 = **12,600**.
Per WORKDAY day: `a = min(absentMin, N)` · `l = floorStep(max(0, late − free), step)` · `e = floorStep(max(0, early − free), step)` · `le = min(l + e, N − a)`.

## S2 pure vectors (hand arithmetic)
| id | input | minutes | arithmetic | satang |
|---|---|---|---|---|
| late1 | ฿15,000 · N480 · late 1 | 1 | 1,500,000 × 1 / 14,400 = 104.17 | 104 |
| late4 | late 4 | 4 | 6,000,000 / 14,400 = 416.67 | 416 |
| late5 | late 5 | 5 | 7,500,000 / 14,400 = 520.83 | 520 |
| late29 | late 29 | 29 | 43,500,000 / 14,400 = 3,020.83 | 3,020 |
| late30 | late 30 | 30 | 45,000,000 / 14,400 = 3,125 | 3,125 |
| late31 | late 31 | 31 | 46,500,000 / 14,400 = 3,229.17 | 3,229 |
| late180 | late 180 | 180 | 270,000,000 / 14,400 = 18,750 | 18,750 |
| early45 | early 45 | 45 | 67,500,000 / 14,400 = 4,687.5 | 4,687 |
| late30+early45 | one LATE_RULE line | 75 | 112,500,000 / 14,400 = 7,812.5 | 7,812 |
| absent480 | absent 480 | 480 | 720,000,000 / 14,400 = 50,000 (= 15,000/30) | 50,000 |
| absent240 | half day | 240 | 360,000,000 / 14,400 = 25,000 | 25,000 |
| 14k late30 | ฿14,000 | 30 | 42,000,000 / 14,400 = 2,916.67 | 2,916 |
| 14k absent480 | | 480 | 672,000,000 / 14,400 = 46,666.67 | 46,666 |
| 12345 late30 | ฿12,345 | 30 | 37,035,000 / 14,400 = 2,571.875 | 2,571 |
| 12345 absent480 | | 480 | 592,560,000 / 14,400 = 41,150 | 41,150 |
| N420 late30 | N 420 | 30 | 45,000,000 / 12,600 = 3,571.43 | 3,571 |
| N420 absent480 | a = min(480, 420) | 420 | 630,000,000 / 12,600 = 50,000 | 50,000 |
| absent300+late200 | a 300 · le = min(200, 480−300) | 300 + 180 | 450,000,000/14,400 = 31,250 · 270,000,000/14,400 = 18,750 · Σ 50,000 = one day | 31,250 + 18,750 |
| absent480+late30 | le = min(30, 0) = 0 ⇒ no LATE line | 480 | as absent480 | 50,000 |
| free5 (4 days) | late 4→0 · 5→0 · 29→24 · 31→26 | 24 · 26 | 36,000,000/14,400 = 2,500 · 39,000,000/14,400 = 2,708.33 | 2,500 + 2,708 = 5,208 (50 min, 2 days) |
| step15 (3 days) | 14→0 · 29→15 · 31→30 | 15 · 30 | 22,500,000/14,400 = 1,562.5 · 3,125 | 1,562 + 3,125 = 4,687 (45 min) |
| free5+step15 | late 31→26→15 · early 20→15→15 | 30 | 45,000,000/14,400 | 3,125 |
| per-day floor | late 1, 4, 5 on 3 days | 10 | 104 + 416 + 520 (aggregated would be 15,000,000/14,400 = 1,041.67 → 1,041) | **1,040** |
| base 14,400 late1 | | 1 | 14,400/14,400 = 1 | 1 |
| base 14,399 late1 | line kept, amount 0 | 1 | 0.99993 | 0 |
| max-int absent480 | base 2,147,483,647 | 480 | = base/30 = 71,582,788.23 (30 × 71,582,788 = 2,147,483,640) | 71,582,788 |
| max-int late1 | | 1 | 2,147,483,647/14,400 = 149,130.81 | 149,130 |
| classes | HOLIDAY late 60 · DAY_OFF late 30 · UNSCHEDULED absent 480 | 0 | WORKDAY only | no lines |
| info flags | late 30 + HOURLY_LEAVE_UNUSED/OT_VIA_ADJUSTMENT/WORKED_ON_LEAVE (not blocking) | 30 | | 3,125 |
| late off | late 30 early 45 | 45 | early only | 4,687 |
| early off | late 30 early 45 | 30 | late only | 3,125 |
| absent off | absent 480 | 0 | | no lines |
Codes (order OFF → PAY_TYPE → NO_BASE → BAD_INPUT → BLOCKED): enabled false ⇒ OFF (also with DAILY) · DAILY/HOURLY ⇒ PAY_TYPE · base 0 ⇒ NO_BASE · N 59 / 721, late −1 / 1.5 ⇒ BAD_INPUT · a day with `STALE` ⇒ BLOCKED.
Policy (lenient reader): undefined ⇒ default · `{enabled:true}` · `{enabled:"yes"}` ⇒ false · `{freeMin:61, stepMin:7}` ⇒ 0 / 1 · `{freeMin:15, stepMin:5, late:false}` kept · `{freeMin:2.5}` ⇒ 0.

## S2.11 plan (signed: DEDUCTION +, ALLOWANCE −; B bound APPROVED · A unbound APPROVED)
P1 E 9,895, none ⇒ DED 9,895 PENDING · P2 same pend + digest ⇒ keep · P3 digest differs ⇒ reject p1 + new · P4 E 7,812 < A 9,895 ⇒ reject a1 + DED 7,812 PENDING · P5 E 12,000 > A ⇒ top-up 12,000 − 9,895 = 2,105 · P6 E 0, B 3,013 ⇒ ALLOWANCE 3,013 APPROVED · P7 E 1,000 ⇒ 1,000 − 3,013 = −2,013 ⇒ ALLOWANCE 2,013 · P8 E 5,000 ⇒ 5,000 − 3,013 = 1,987 DED PENDING · P9 E 0, pend ⇒ reject · P10 E = B ⇒ reject pend · P11 B = 3,013 − 3,013 = 0 = E ⇒ none · P12 E 8,332 < A ⇒ reject a1 + p1, d = 8,332 · P13 E = A ⇒ none · P14 REJECTED rows ignored · P15 two pends ⇒ reject both + new · P16 B 3,013 + A (−2,513) = 500 = E ⇒ none.

## DB fixture (tenant `qc-hr-h32-*`, Aug 2031, shift 09:00–17:00 = 480 min, grace 5, N 480)
H3.1 minutes (S4.1, confirmed GREEN on base): eL04 late 30 · eL05 early 45 · eL06 absent 480 · eL07 late 20 + OT 120 (H2.9 request 17:00–19:00) · eL08 09:03 ≤ grace ⇒ 0 · eM04 late 31 · eS05 late 30 · eH08 holiday (late 0) · eW04 late 90 − 1 h leave (L = min(60, 480 − 390) = 60) ⇒ 30. eF04 IN only ⇒ MISSING_OUT ⇒ REVIEW.
H2.9 OT for eL07: 1,500,000 × 120 × 15,000 / (30 × 8 × 60 × 10,000 = 144,000,000) = **18,750** (untouched by H3.2 — S4.6).
First sync (S4.3/S4.4):
- eL LATE: 04 30 → 3,125 · 05 45 → 4,687 · 07 20 → 1,500,000 × 20 / 14,400 = 2,083.33 → 2,083 · Σ **9,895** (95 min). eL ABSENT 06 480 → **50,000**.
- eM LATE 31 → 1,400,000 × 31 / 14,400 = 43,400,000 / 14,400 = 3,013.89 → **3,013**.
- eS LATE 30 → **2,571** · eW LATE 30 → **3,125** · eF none (REVIEW) · eH none (holiday).
- System B: eD DAILY ⇒ PAY_TYPE · eN no profile ⇒ NO_PROFILE.
Preview eL (S9.2): lateMin 95 · absentMin 480 · days 4 · 2 ids · late 9,895 · absent 50,000 · pending 59,895 · approved 0.
S7.3 policy freeMin 5: eL 04 25 → 37,500,000/14,400 = 2,604.17 → 2,604 · 05 40 → 60,000,000/14,400 = 4,166.67 → 4,166 · 07 15 → 1,562.5 → 1,562 · Σ **8,332** (80 min) < approved 9,895 ⇒ superseded + PENDING 8,332. eS 25 → 30,862,500/14,400 = 2,143.23 → **2,143**. eW 25 → **2,604**. eL ABSENT 0 (leave approved later, S6.2/S7.1). eM 0 (H2.6 correction IN → 09:00, S7.2).
S7.4: eW 2,604 approved ⇒ kept on OFF; eL/eS PENDING ⇒ POLICY_OFF. S7.5 ON: eL gen 3 8,332 · eS gen 3 2,143 · eW E = A ⇒ none.
S8 (system C, eR ฿14,000 late 31 = 3,013): Aug DRAFT run ⇒ target 2031-09 · approved · bound to the APPROVED Sept run · Aug draft deleted · correction ⇒ E 0 · B 3,013 ⇒ ALLOWANCE 3,013 APPROVED in **2031-10** (month after latest live run) · Σ signed 3,013 − 3,013 = 0 · second sync none.

## Statics
S1.4/S1.5 use `baseRef("QC_H32_BASE")` (merge-base HEAD origin/session/hr) and become n/a for the diff part once `attendance-pay.ts` is in the base (`pathInBase`); hunks carrying another WO's `HR Hx.y` marker are tolerated; no "newest migration" assertion. S1.8 frozen list tolerates other WOs' marked hunks, fails on an `HR H3.2` hunk or an unmarked hunk.

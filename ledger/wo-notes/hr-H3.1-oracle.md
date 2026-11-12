# H3.1 oracle notes — `scripts/qc-hr-h3.1.mts` (52 checks: 47 RED-by-design · 5 GREEN controls)

Brief `ledger/hr-briefs/hr-brief-H3.1.md` (DRAFT). Vectors `scripts/fixtures/hr-h3.1-vectors.json` (53 day vectors + 3 window vectors; inputs fully expanded, expected header strings literal). Base for statics = `QC_H31_BASE` or `87d976773` (session/hr head this WO was cut from; a merge-base with `origin/session/hr` would count H2.7/H3.3/H4.x files as changed). Static base-diff parts become n/a once `hr/work-entries.ts` is in the base (`pathInBase`, as qc-hr-h4.4). **If H2.9 merges into the base first, bump `QC_H31_BASE`** — S1.6 requires every judge.ts hunk vs base to be an `HR H3.1` pure addition.

RED run (lane DB wo-hr-qc-l1, after seed 33/33): unforced SKIP exit 0 · forced 5/52, `BASE-EXPECTATION 52/52 as registered`; every RED reads `∅<fn> (∅ file)` / `0 cols` / `rows=0` (absent, no crash); RESIDUE none. GREEN on base: S11.1 frozen files + payroll-rules sha · S11.2 fixture sanity (the H2.5 rows the literals assume — proved on the real judge) · S11.3 v1 run approve · X12.1 · Z1. Output `hr-H3.1-red.txt`.

## Header string
`class|status|p w ow hw oh hp pl ul ab la eo un bd|ld|r` = plannedMin workMin otWorkdayMin holidayWorkMin otHolidayMin holidayPaidMin paidLeaveMin unpaidLeaveMin absentMin lateMin earlyOutMin unplannedMin breakDeductMin · leaveDays · review. Defaults: normalDayMin N = 480, break after 300. Default slot = shift 07:00–15:00 (420–900, window 480), worked 480, no break. d = break deduction, net = worked − d, pool = Σ max(0, net − ot) over non-LEAVE shift slots, reg = min(pool, planned − leaveMin).

## Pure vectors (hand arithmetic)
| id | input | arithmetic | result |
|---|---|---|---|
| B1 | 08–17 (540) plan break 60 · worked 540 · clocked 0 | planned 540−60 = 480 · d = min(60, 540−300) = 60 · net 480 · reg min(480,480) | p480 w480 bd60 |
| B2 | same, clocked break 60, worked 480 | d = min(max(0,60−60), 180) = 0 | p480 w480 |
| B3 | clocked 30, worked 510 | d = min(30, 210) = 30 · net 480 | p480 w480 bd30 |
| B4 | EARLY_OUT worked 320, early 220 | d = min(60, 20) = 20 · net 300 · reg 300 | p480 w300 eo220 bd20 |
| B5 | B1 with CLOCKED_ONLY | d 0 · pool 540 · reg 480 · un 60 | p480 w480 un60 |
| B6 | split 07–12 (300, plan 30) worked 300 + 13–18 (300) worked 300 | 300 is not > 300 ⇒ d 0 · planned 270+300 = 570 · pool 600 | p570 w570 un30 |
| B7 | 07–13 (360, plan 60) worked 301 | d = min(60, 1) = 1 · net 300 · planned 300 | p300 w300 bd1 |
| C1 | default | — | p480 w480 |
| C2 | LATE 20, worked 460 | — | p480 w460 la20 |
| C3 | worked 600, ot 120 | reg min(480, 480) | p480 w480 ow120 |
| C4 | worked 510 (early arrival) | reg 480 · un 30 | p480 w480 un30 |
| C5 | ABSENT | absent min(480, 480−0−0) | ABSENT p480 ab480 |
| L1/L2 | LEAVE full, fraction 1.0, paid / unpaid | floor(1.0×480) | LEAVE pl480 / ul480 · ld 1.0 |
| L3 | half AM, came PM, worked 240, fraction 0.5 | leave 240 · reg min(240, 480−240) | p480 w240 pl240 · ld 0.5 |
| L4 | half PM, ABSENT, 0.5 | leave 240 · absent min(480, 480−240−0) = 240 | ABSENT p480 pl240 ab240 |
| L5 | split 07–11 + 13–17, 240 each | — | p480 w480 |
| L6 | split, B ABSENT | absent min(240, 480−0−240) | p480 w240 ab240 |
| L7 | split, A LEAVE 0.5 (AM), B 240 | leave floor(0.5×480) = 240 · reg min(240, 240) | p480 w240 pl240 |
| L8 | A 07–11 LEAVE 0.5, B 17–22 (300) ABSENT | planned 540 · leave 270 · absent min(300, 540−270−0) = 270 | ABSENT p540 pl270 ab270 |
| P1 | 22:00–06:00 on 2031-07-31 | window 360+1440−1320 = 480 · period of start day | p480 w480 @2031-07 |
| P2 | P1 + 2031-08-01 (no data) | — | 08-01 UNSCHEDULED @2031-08 |
| D1 | DAY slot DAY_OFF | — | DAY_OFF/DAY_OFF |
| D2 | day off worked 600, ot 600 | hw min(600, 480) · oh max(0, min(600,600) − 480) | hw480 oh120 |
| D3 | worked 607, ot 600 (step) | hw 480 · oh 600−480 | hw480 oh120 |
| D4/D5 | holiday, no slot / DAY_OFF slot | hp = N | HOLIDAY hp480 |
| D6 | holiday, rostered, worked 540 ot 60 | reg min(480, 480) → hw · ot → oh · hp N | WORKED p480 hw480 oh60 hp480 |
| D7 | holiday, rostered, ABSENT | absent/late/early not emitted on HOLIDAY (Q12) | HOLIDAY p480 hp480 |
| D8 | no slot | — | UNSCHEDULED |
| D9 | no slot + approved full leave | basis N · floor(1.0×480) | UNSCHEDULED/LEAVE pl480 |
| D10 | NO_SCHEDULE worked 300 | no plan · WORK = net | WORKDAY w300 |
| D11 | DAY_OFF slot + approved leave | no leave on a day off (H2.7 R4) | DAY_OFF, ld 0.0 |
| D12 | holiday, rules N = 420 | hp = 420 | hp420 |
| D13 | holiday, no shift, worked 600 ot 600 | hw 480 · oh 120 · hp 480 | WORKED |
| H1 | LATE 120, worked 360, hourly 2 h paid | reg 360 · L = min(120, 480−0−360) = 120 · late 120−120 = 0 · ld floor(2/8,0.1) = 0.2 | w360 pl120 la0 |
| H2 | ABSENT, hourly 3 h | reg 0 · L = min(180, 480) · absent 480−180 = 300 · ld 0.3 | pl180 ab300 |
| H3 | on time 480, hourly 2 h | L = min(120, 0) = 0 ⇒ HOURLY_LEAVE_UNUSED | w480 pl0 |
| H4 | late 30 + early 60, worked 390, 2 h | L = min(120, 90) = 90 · late 30→0 (rest 60) · early 60→0 | w390 pl90 + UNUSED |
| H5 | H1 unpaid | — | w360 ul120 |
| R1/R2 | stale / orphan | values from the stored row | + STALE / ORPHAN |
| R3/R4 | live not final / final not stored | unstored slots count no minutes | PENDING + NOT_FINAL / NOT_STORED |
| R5 | missing out, worked 0 | attended, no absent | WORKED p480 + MISSING_OUT |
| R6 | shift 480 + DAY NO_SCHEDULE 60 | DAY slot excluded | w480 + STRAY_IN |
| R7 | pending leave on the day | — | + PENDING_LEAVE |
| R8 | ABSENT 0.5 (AM leave on row) + approved PM leave not on row | expected f 1.0 ≠ stored 0.5 | pl240 ab240 + LEAVE_MISMATCH |
| R9 | LEAVE 1.0, worked 300 | LEAVE slot not in pool | LEAVE pl480 + WORKED_ON_LEAVE |
| R10 | legacy leave (no policy) | paid | pl480 + LEGACY_LEAVE |
| R11 | two stale slots | review unique | STALE once |
| R12 | not final + pending leave | sorted | NOT_FINAL+PENDING_LEAVE |
| R13 | stored LEAVE 1.0, leave not approved anymore | f 0 · nothing paid · status falls to WORKED | p480 + LEAVE_MISMATCH |
| E1–E3 | window 07-15…07-20 · endDate before period · day outside range | — | 6 days · 0 · 31 |

## DB fixture (system A, July 2031; week Mon 21 – Sun 27; holiday Fri 25 for unit u2 only)
Real H2.5 rows (S11.2, GREEN on base): eA21 ON_TIME w480 · eA22 LATE l20 w460 · eA23 o120 w600 · eA24 ABSENT · eA25 LEAVE 1.0 · eA26 DAY_OFF w600 o600 · eB21 ON_TIME w240 f0.5 · eB23 ON_TIME 240 + ABSENT · eB24/31 overnight w480 · eB25 DAY_OFF (holiday) · eC21 LATE l120 w360 f0.2 · eH25 ON_TIME w540 o60 · eU23 NO_SCHEDULE w300.
Work days: eA21 entry break 60 ⇒ planned 420, d = min(60, 180) = 60, w420 bd60 · eA22 w460 la20 · eA23 w480 ow120 · eA24 ab480 · eA25 pl480 (SICK paid) · eA26 hw480 oh120 · eB21 w240 ul240 (PERSONAL unpaid, AM) · eB22 split 240+300 = 540 · eB23 w240 ab min(300, 540−0−240) = 300 · eB24/31 w480 · eB25 hp480 · eC21 w360 pl120 (VACATION hourly 2 h) · eH25 HOLIDAY rostered: hw480 oh60 hp480 · eD16 UNSCHEDULED leave pl480 · eU23 w300.
Counts: days 31 × (eA eB eC eH eU) + 10 (eD 15–24) = **165**. Kind rows: eA 9 · eB 8 · eC 5 · eH 3 · eD 1 · eU 1 = **27**; Σ WORK 11 rows / 1360+1980+840+300 = 4480 · OT_WORKDAY 1/120 · HOLIDAY_WORK 2/960 · OT_HOLIDAY 2/180 · HOLIDAY_PAID 3/1440 (eB eC eH) · LEAVE_PAID 4/1560 (480+120+480+480) · LEAVE_UNPAID 1/240 · ABSENT 2/780 · LATE 1/20.
Summaries: eA worked 4 (21 22 23 26) · leave 1 · absent 1 · dayOff 1 · unscheduled 24 · planned 420+480×4 = 2340 · work 1360 · eB worked 5 · dayOff 5 (26–30) · holiday 1 · unscheduled 20 · planned 480+540+540+480+480 = 2520 · work 1980 · absent 300 · unpaid 240 · hp 480 · ld 0.5.
Changes: eC22 OUT 15:00→16:00 + recompute ⇒ v2, ot 60 ⇒ w480 ow60, written 1 · eC23 leave revoked ⇒ OUTDATED → STALE → recompute ⇒ ABSENT 480 · S9.4 OUT back to 15:00, recompute ∥ build ⇒ version 3.
System B (Sept, 30 days × 2 = 60 rows): eP day 10 NOT_FINAL at 10 Sep 12:00, NOT_STORED at 11 Sep before the finaliser, then p480 w480; eQ day 2 ORPHAN after unpublish. v1 approve ∥ build ⇒ 60/60 bound.
System C (Oct, v2 forced by fixture): no snapshot ⇒ refused · MISSING_OUT ⇒ refused · OUT 15:00 + recompute (v2) ⇒ OUTDATED ⇒ refused · build under held period lock waits, writes 1 · approve ok, 31 rows bound, day 6 p480 w480.

## Decisions the oracle fixes (ORACLE-EDIT if the controller rules otherwise)
- Refusals are `{ok:false, reason}` with the exact `WE_TEXT`; approve refusal = `{ok:false, code:"WORK_ENTRIES", note: approveBlocked}`.
- Preview/day DTO key sets are exact (S10.4); `leaveLabel` null on days without leave; `next: null` when the last page is done.
- `MISSING_OUT` and `PENDING_LEAVE` block (Q13); v1 approve is never refused and binds every row of the period (S8.1, S9.3).
- `hr-qc-env.mts` gets an `hrWorkDay` row (S1.3); seed script unchanged (ML1 "นาทีทำงาน 0" stays true).
- Regression note for the controller: `qc-hr-h1.3` S6.1 counts `HrWorkEntry`/`hrWorkEntry` tokens in `hr/**` — needs the ORACLE-EDIT named in brief §5 (exempt `work-entries.ts`).

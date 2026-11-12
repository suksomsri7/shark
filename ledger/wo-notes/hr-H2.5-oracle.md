# H2.5 oracle — `scripts/qc-hr-h2.5.mts` (check list · counts · literal vectors)

Brief `ledger/hr-briefs/hr-brief-H2.5.md` (DRAFT, defaults in force) · base `session/hr` 2e23c8164 · branch `wip/hr-h2.5` · lane DB l1 via `scripts/qc-hr.sh`.
Run: `bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h2.5.mts` (`--list` prints ids).
RED proof: `ledger/wo-notes/hr-H2.5-red.txt` — forced `passed 2/55` (exit 1) · BASE-EXPECTATION 55/55 as registered · RESIDUE none · unforced SKIP exit 0.

## Counts
55 checks = 53 RED-by-design + 2 GREEN controls (S9.5 frozen files/shas/nav · Z1 residue). CRITICAL 36 · MAJOR 19.

| group | ids | what |
|---|---|---|
| S1 pure | S1.1–S1.12 (12) | 40 `judgeEntry` vectors in 9 groups · output keys + alertAt/absentAt literals + determinism · `attendancePolicyOf` literals · 9 `attributeSessions` vectors |
| S2 slots | S2.1–S2.7 (7) | 17 literal slot strings via `loadAttendanceMonth` (owner): linked · adopted (D-H24-adopt) · stale/other-employee link (r2d) · split · overnight · unrostered/legacy · roster-in-use/leave/pending/ended |
| S3 snapshot | S3.1–S3.4 (4) | finaliser = live for all 25 final slots · idempotent + quiet · not final / outside D−7 / holidayId / tenant isolation · edits after ⇒ no rewrite, `stored+stale` |
| S4 recompute | S4.1–S4.4 (4) | refusal matrix (9 calls) · one row only, v2 · identical ⇒ changed false + 1 audit · APPROVED/PAID ⇒ rPaid, REVERSED ok |
| S5 alerts | S5.1–S5.6 (6) | quiet before alertAt · fires once · payload/key · consumer ×2 recipients · texts · system-B settings · absent alert · labels |
| S6 views | S6.1–S6.6 (6) | 13-viewer board matrix · branch scope/clamp · DTO keys + no sensitive keys/values + leave type · board literals · calendar summaries · self |
| S7 settings | S7.1–S7.2 (2) | defaults · hrClock ↔ hrAttendance both survive · range texts · gate |
| S8 races | S8.1–S8.4 (4) | holder on `hr:clock:<emp>` · holder on `hr:roster:<sys>:<emp>:<day>` · 5 parallel runs (alerts then finalisers) · 3 parallel recomputes |
| S9 statics | S9.1–S9.8 (8) | purity · cron hunk + minute job · actions/page · single writer · frozen (n/a once judge.ts in base) · messages · UI ids/inventory/tokens/visual · seed |
| S10 | S10.1 (1) | migrations 000000/000001 · schema · `core/scope.ts` |
| Z1 | Z1 | residue incl. both new tables |

## Fixture (own tenants, March 2031, written raw; `now` injected)
Week Mon 03-03 … Sun 03-09; N1 = Mon 03-10 12:00 (+07). Units u1/u2; HR systems A (main), B (`hrAttendance {notInAlertMin 30, alertEmployee true}`), C (`alertsOn false`), other tenant O. Shift กะเช้า 07:00–15:00 grace 15 (+ ดึก 22–06, แยก 07–11 / 13–17).
Viewers: owner · mgrAll `*` · mgrU1 `[u1]` · mgrEmpty `[]` · writer STAFF `*`+`hr.employee.create` · writerU2 `[u2]` · payroll (`hr.payroll.read`) · leaveReader (`hr.leave.read`) · member · self (↔ e1) · mgrSelf MANAGER `[u1]` (↔ eM) · selfB (↔ eB) · other-tenant owner.
Alert day Wed 03-12: e1 (no IN until 07:40), e3 (u2, never), e2 (IN 06:58), eM (approved leave), eB (system B), eC (system C). Expected late recipients: owner/mgrAll/mgrEmpty/writer 3 · mgrU1/mgrSelf 2 · writerU2 1; selfB gets the self text; absent at 15:00 = e3 + eB.

## `judgeEntry` vectors (DAY 2031-03-05 · shift M = 07:00–15:00 grace 15 · closeGrace 240 · now = 03-07 12:00 unless stated · policy = defaults + overrides)
want = status phase [F final] [L late] [E early] [W worked] [B break] [O ot] [MO] — zero fields omitted.
| id | shift | events | extras | want |
|---|---|---|---|---|
| V01 | M | IN 06:54, OUT 15:01 | | ON_TIME FINAL F W487 |
| V02 | M | IN 07:12, OUT 15:04 | | ON_TIME FINAL F W472 |
| V03 | M | IN 07:16, OUT 15:00 | | LATE FINAL F L16 W464 |
| V04 | M | IN 07:15:59, OUT 15:00 | | ON_TIME FINAL F W464 |
| V05 | grace 0 | IN 07:01, OUT 15:00 | | LATE FINAL F L1 W479 |
| V06 | M | IN 06:58, OUT 14:00 | | EARLY_OUT FINAL F E60 W422 |
| V07 | M | IN 07:00, OUT 14:56 | earlyOutGrace 5 | ON_TIME FINAL F W476 |
| V08 | M | IN 07:00, OUT 14:00 | flagEarlyOut false | ON_TIME FINAL F W420 |
| V09 | M | IN 07:20, OUT 14:30 | | LATE FINAL F L20 E30 W430 |
| V10 | M | IN 06:55, OUT 17:04 | | ON_TIME FINAL F W609 O120 |
| V11 | M | IN 07:00, OUT 16:29 | otStep 30 | ON_TIME FINAL F W569 O60 |
| V12 | M | IN 07:00, OUT 15:14 | | ON_TIME FINAL F W494 |
| V13 | M | IN 07:00, BS 11:00, BE 11:30, OUT 15:00 | | ON_TIME FINAL F W450 B30 |
| V14 | M | IN 07:00, BS 14:30, OUT 15:00 | | ON_TIME FINAL F W450 B30 |
| V15 | M | IN 07:00 | | ON_TIME FINAL F MO |
| V16 | M | — | | ABSENT FINAL F |
| V17 | M | — | leave full | LEAVE FINAL F |
| V18 | M | IN 07:00, OUT 15:00 | leave full | LEAVE FINAL F W480 |
| V19 | M | IN 11:10, OUT 15:00 | leave AM (due 11:00) | ON_TIME FINAL F W230 |
| V20 | M | IN 07:00, OUT 11:00 | leave PM (due end 11:00) | ON_TIME FINAL F W240 |
| V21 | M | — | leave AM | ABSENT FINAL F |
| V22 | 22–06 | IN 21:50, OUT +1 06:10 | | ON_TIME FINAL F W500 |
| V23 | 22–06 | IN 22:20, BS 23:50, BE +1 00:20, OUT +1 06:00 | | LATE FINAL F L20 W430 B30 |
| V24 | 16–24 | IN 16:00, OUT +1 00:31 | | ON_TIME FINAL F W511 O30 |
| V25 | M | — | now 06:30 | PENDING UPCOMING |
| V26 | M | — | now 07:09 | PENDING NOT_IN |
| V27 | M | IN 07:16 | now 10:00 | LATE OPEN L16 W164 |
| V28 | M | IN 07:00, BS 09:50 | now 10:00 | ON_TIME ON_BREAK W170 B10 |
| V29 | M | — | now 15:30 | ABSENT NOT_IN |
| V30 | M | — | absentAfter 120, now 09:00 | ABSENT NOT_IN |
| V31 | M | — | absentAfter 120, now 08:59 | PENDING NOT_IN |
| V32 | M | IN 07:00, OUT 15:00 | now 16:00 | ON_TIME CLOSED W480 |
| V33 | M | IN 07:00, OUT 15:00 | now 18:59 | ON_TIME CLOSED W480 |
| V34 | M | IN 07:00, OUT 15:00 | now 19:00 | ON_TIME FINAL F W480 |
| V35 | day off | — | | DAY_OFF FINAL F |
| V36 | day off | IN 10:00, OUT 14:07 | | DAY_OFF FINAL F W247 O240 |
| V37 | none | IN 09:00, OUT 17:00 | | NO_SCHEDULE FINAL F W480 |
| V38 | none | IN 09:00, OUT 17:00 | now 23:00 | NO_SCHEDULE CLOSED W480 |
| V39 | M | IN 07:05, OUT 11:00, IN 12:00, OUT 15:20 | | ON_TIME FINAL F W435 O15 |
| V40 | M | IN 07:40, OUT 10:00, IN 10:30, OUT 14:00 | | LATE FINAL F L40 E60 W350 |
Extra literals (S1.10): V16 alertAt 07:10 · absentAt 15:00 · V22 alertAt 22:10 · absentAt +1 06:00 · V30 absentAt 09:00 · V35 both null.

## `attributeSessions` vectors (employee "me", earlyIn 120, closeGrace 240)
| id | entries | events | want |
|---|---|---|---|
| A1 | E1 07–15 | IN 07:20 (E1), OUT 15:30 (E1) | E1: i,o |
| A2 | E1 07–15 | IN next day 07:00 (E1) | rest: i |
| A3 | E1 07–15 · E9 (other employee) | IN 07:00 (E9) | E1: i (adopted, raw id ignored) |
| A4 | E1 07–15 | IN 04:30, OUT 15:00 (unlinked) | E1: i,o |
| A5 | E2 next day 01:00–09:00 | IN 20:00 (unlinked) | rest: i (adopt only same-day start) |
| A6 | E1 07–11 · E2 13–17 | linked pairs | E1: i1,o1 · E2: i2,o2 |
| A7 | E1 07–11 | IN 07:00 (E1), OUT 19:30 | E1: i · rest: o (after end + grace) |
| A8 | N 22–06 | IN, BS, BE, OUT (N) | N: i,b,e,o |
| A9 | E1 07–15 · E3 08–16 | IN 07:40 (unlinked) | E3: i (nearest start) |

## Policy parser literals (S1.11)
default `{notInAlertMin 10, absentAfterMin null, earlyOutGraceMin 0, flagEarlyOut true, otStepMin 15, alertsOn true, alertEmployee false}` · null / "x" / [] ⇒ default · all valid values kept · 241 / 29 / 61 / 7 / "yes" / 1 / "no" ⇒ default per key · 0 / 30 / 1 kept · 10.5 / 721 ⇒ default · earlyOutGrace 60 kept.

## Not covered here (controller)
Screenshots (brief §7) · `qc-nav-functions` · fitness ± env · regression suites. Lane pool: holder + 1 lane (S8.1/S8.2), 5 lanes (S8.3), 3 lanes (S8.4).

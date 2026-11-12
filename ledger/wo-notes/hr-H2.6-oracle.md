# H2.6 oracle notes — `scripts/qc-hr-h2.6.mts`

Brief `ledger/hr-briefs/hr-brief-H2.6.md` (DRAFT, Q1–Q18 defaults). 49 checks: **45 RED by design · 4 GREEN controls** (S1.7 frozen + shas · S1.8 every hot-file hunk marked `HR H2.6` · X12.1 fitness ± env · Z1 residue). Base for controls: env `QC_H26_BASE`, default e209390e7.
RED proof `hr-H2.6-red.txt`: seed 32/32 · unforced = SKIPPED (correction.ts absent) exit 0 · forced = 4/49, BASE-EXPECTATION 49/49, no crash, every DB failure reads `absent <fn>`, RESIDUE none.

## Groups
| group | checks | what |
|---|---|---|
| S1 static | 8 | files + pure rules · migration/schema + live columns/indexes on the lane DB · reader filters (`voidedAt: null` counts per file) + `src/**` scan for other `hrAttendance.find*/count` readers + sole writer · approval wiring · consumer + one label · actions/testids/inventory/messages · 2 controls |
| S2 pure | 4 | literals · reason cleaner (8) · `checkCorrection` V1–V16 · `sessionDayOf` W1–W6 |
| S3 request | 6 | refusals (each text, nothing written, 35-day boundary 02-14 ok / 02-13 refused) · self cases · on-behalf matrix · PENDING row literal + evidence snapshot · limits · sequence refusals |
| S4 apply | 10 | ADD OUT (stored W490 v2) · CHANGE IN (original voided intact, replacement ON_TIME/0, W482) · VOID dup (W482) · 6 readers exclude voided (910 → 964) · overnight · kiosk + timesOverridden (W365) · orphan · reject · cancel · decider gates |
| S5/S6 chain | 6 | ApprovalRequest in tx · inChain · core self refusals · effect ×2 once · TARGET after owner-auto · cancel chain · owner-auto with a policy |
| S7/S8 privacy/events | 6 | detail keys + viewer matrix · reason never in audit/outbox/notifications · evidence literal (closed + forced shifts, member/other-day/other-tenant excluded, no cash) · periodCount/repeat · one event per apply · notification recipients |
| S9 races | 5 | payroll lock (run APPROVED by the holder) · two deciders · hr:clock holder inserts kiosk OUT same minute · 5 parallel requests · effect ×3 |
| S10 · X2 | 2 | ENDED (≤ endDate applied, after refused, ended-while-pending CANCELLED) · other tenant/system raw ids |

## Literal values (measured on base fixtures, RED run)
Before correction the forced run shows the base numbers the GREEN values replace: e1 stored ON_TIME W0 v1 (missingOut) → W490 v2 · e2 03-03 LATE W460 → ON_TIME W482 · e2 03-04 W450 → W482 · monthlyMinutes 910 → 964 · board 910 → 964 · nextClockKind e7 IN → OUT · attendanceBetween IN,IN,OUT → IN,OUT. judge-rules outputs for W490/W482/W365 were checked with `judgeEntry` on base before writing.

## Notes for the controller
- `qc-hr-lib.mts`: additive exports `fileAt`, `srcFiles`, `holdAdvisory` (no existing oracle changes behaviour).
- Size 68 KB (> COMMON §G 60 KB; Thai literals + 49 checks). Can split S9 into the lib if the controller wants it smaller.
- S1.8 accepts modified lines when the hunk's added lines carry `HR H2.6` (reader filters change existing `where` lines).
- S8.2 counts on fixed fixture order (writer: 1 rejected, 3 apply-cancelled); S7.4 periodCount on e2 = CHANGE + VOID + pending BREAK.
- S4.7 (orphan) asserts count/W490/v2 only — status of the moved slot is the H2.5 rule's, not fixed here.

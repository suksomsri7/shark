# H4.1 oracle notes — `scripts/qc-hr-h4.1.mts` (43,936 B · 42 checks · 32 RED by design · 10 GREEN controls)

Base `session/hr` 6c614c04c · brief `ledger/hr-briefs/hr-brief-H4.1.md` (DRAFT, Q1–Q14 defaults) · base ref env `QC_H41_BASE` (default merge-base with origin/session/hr).
Run: `bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h4.1.mts` (seed `seed-hr-qc` first).

## Results on base (ledger/wo-notes/hr-H4.1-red.txt)
- seed-hr-qc 30/30 · unforced = SKIPPED exit 0 (`hr/availability.ts` absent) · forced = 10/42 passed, exit 1, `BASE-EXPECTATION 42/42 as registered`, no crash, `RESIDUE none`, Z1 every-tenantId-table sweep = none.
- Every RED reads "absent": statics `failed: file/fn/reexport/noBody/handler/marked/ids…` · pure `∅ dayWindows` · DB `got []` from the SVC stub (`staffWindows` returns `[]`) · booking profile `source UNIT_HOURS` (HR_SHIFT never yields a row) · hints/notify `∅ leaveDutyHints/leaveDutyNotify (availability.ts)` · notifications 0 / audits 0.
- Harness facts proven on base: H2.7 approval waits on the roster key (`waited=true`), booking made meanwhile commits, appointment stays CONFIRMED and is flagged; give-away swap PENDING → APPROVED via `decideSwap`; revoke `decideLeave(…, "REJECTED", owner, {from:"APPROVED"})` returns without throwing; `setSettings` hoursSource per STAFF accepted.

## Check list by group
| Group | Checks | Base |
|---|---|---|
| S1 statics | S1.1 index re-export · S1.2 rules pure · S1.3 availability boundary/writes/lock · S1.6 consumer hunk · S1.7 UI/inventory/messages | RED |
| | S1.4 frozen files unchanged (incl. booking/**, prisma/**, seed, regression oracles) · S1.5 payroll-rules sha | GREEN control |
| S2 pure `dayWindows` | S2.1 basics/status (8 vectors) · S2.2 half-day (6) · S2.3 overnight (9) · S2.4 unit/merge/hours/span (6) | RED |
| S3 `staffWindows` (via `@/lib/modules/hr` facade) | S3.1 shift=window + holiday · S3.2 rostered day off ⇒ [] · S3.4 unpublished · S3.5 pending · S3.6 AM/PM · S3.7 overnight · S3.8 split · S3.9 ENDED/inactive · S3.10 branch/null unit · S3.12 order/dedupe/keys · S3.13 swap | RED |
| | S3.3 no roster ⇒ no row · S3.11 other tenant / inactive system / bad date / empty | GREEN control (the stub also returns []) |
| S4 leave lifecycle | S4.1 approved ⇒ [] · S4.2 revoke restores | RED |
| | S4.3 booking still closes the day on approval (C-2) | GREEN control |
| S5 booking `staffDayProfiles` | S5.1 HR_SHIFT windows · S5.3 after revoke | RED |
| | S5.2 unrostered staff = UNIT_HOURS fallback | GREEN control |
| S6 hint | S6.1 literal items (pending) · S6.2 approved same / revoked [] · S6.3 viewer matrix (4 ok, 7 identical hintNo) · S6.4 exact keys, no reason/type/policy | RED |
| S7 notify (real consumer from `outbox-consumers.consumers`) | S7.1 recipients/title/body/audit · S7.2 replay + REJECTED ⇒ no more | RED |
| | S7.3 no appointment ever cancelled | GREEN control |
| X1 races | X1.2 window [] after race · X1.3 2 consumers ∥ direct notify ⇒ 4 + 1 audit | RED |
| | X1.1 approve ∥ booking both commit, flagged, CONFIRMED | GREEN control |
| X12.1 fitness without env · Z1 residue | | GREEN control |

## Fixture (literal expectations)
Tenant A: units u1 (BOOKING, hint scenario), u2, u3 (window shapes); HR system sA; tenant B (other tenant), tenant C (inactive HR system). Week Mon 2031-03-10 … Sun 16; D = Wed 12th.
Shifts: เช้า 540–1080 br 60 (paid 480) · ดึก 1320→360 · แยก 540–720 / 1020–1260 · บ่าย 780–1260.
E1 เอ (u1, linked `self`): เช้า 11th + 12th; leave L1 11th–12th (PENDING → approved in the race → revoked). E2 บี: เช้า 10th + 11th (960). E3 ซี: เช้า 11th, บ่าย 12th (busy). E4 ดี: เช้า 12th + approved full leave 12th. E5 ENDED. E6 u2. E7 จี home u2 borrowed to u1 1st–31st, เช้า 10th (480). E8 เอช: no roster.
Hint items for L1: 11th (others 2 = E2, E3; candidates ดี 0→480, เอช 0→480, จี 480→960) · 12th (others 0 — E4 on leave; candidates เอช 0→480, จี 480→960, บี 960→1440) ⇒ notification n = 1 to owner, mgrAll, mgrU1, dec1.
u3: E9 night · E10 split · E11 AM ⇒ 810–1080 · E12 PM ⇒ 540–810 · E13→E14 give-away swap · E15 shop holiday · E16 unpublished 12th · E17 ENDED · E18 inactive · E20 entry in u2 · E21 unit-null entry.
Booking u1: hours 480–1320 every day · staff A→E1, B→E8, C→E2 · hoursSource [HR_SHIFT, UNIT_HOURS] per staff · one appointment A 12th 11:00 made during the race.

## Notes for the controller
- S6.2 is written twice (approved part, then combined with revoked) — the second result is final.
- S3.3 / S3.11 pass on the stub by construction; they guard against a real implementation over-returning.
- No dependency on session/svc: only `booking/service` exports already on this base (`staffDayProfiles`, `createAppointment`, `appointmentsHitByLeave`, `getAvailableSlots`).
- `qc-svc-b.1` H-1 stays satisfiable (tenant "t" ⇒ []); run it on an SVC DB before release (guards refuse QC4).
- Typecheck with the oracle in the tree: 0 errors (heap 12288, `.next/types` removed first).

# WO H2.1 — Shift catalogue consumer + daily roster engine (`hr/roster.ts` · `hr/roster-rules.ts` · `hr.roster.published` · readers `rosterOnDay`/`rosterAt`)

> RUN "HR V2" · worktree `/root/projects/shark-hr-b` · branch `wip/pos-hr-h2.1` cut from `session/hr` fb245484 (H1 complete) + oracle fab86b7c · 22 Oct 2026 · controller: Fable · builder: Opus (lane B)
> Contract: brief `ledger/hr-briefs/hr-brief-H2.1.md` R1–R13 · §9 rulings Q1–Q15 · §10 oracle-flag rulings 1–9 · `hr-brief-COMMON.md`
> Oracle: `scripts/qc-hr-h2.1.mts` (84 checks · commit fab86b7c · **edited after commit: no**) · green run `ledger/wo-notes/hr-H2.1-green.txt`
> DB: **QC4 only** — every DB command: `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/<file>.mts`
> Base check: `git merge-base --is-ancestor afcb9bc3 HEAD` → ok (session/hr contains the hotfix)

## 0. Checkpoint
- done: STEP 0 base run `BASE-EXPECTATION 84/84 as registered` (72 RED / 12 GREEN, residue none) · R9 808978e1 · R12 573e377e · R1–R8/R10/R11 f30f318a · oracle 84/84 ×3 · regressions §5 · fitness ×2 modes · typecheck §5
- next: controller re-run → reviewer (race + scope) → merge
- last command: see §5

## 1. Files touched
| file | new/edited | what | hot file? |
|---|---|---|---|
| `src/lib/modules/hr/roster-rules.ts` | new | pure rule checks `rosterWarnings` · `ROSTER_RULE_DEFAULTS` · `ROSTER_RULE_TEXT` · `weekStartOf`/`weekdayOfDay`/`daysBetween` | no |
| `src/lib/modules/hr/roster.ts` | new | services + readers (API below) | no |
| `src/lib/modules/hr/index.ts` | edited | block `// HR H2.1 ▸ … ◂ HR H2.1` — re-export `rosterOnDay`, `rosterAt`, types `RosterDayEntry`, `RosterDayResult` (no logic, no `onShiftToday`) | facade |
| `src/lib/outbox-consumers.ts` | edited | `"hr.roster.published": withAutomation(async () => {})` (marked hunk) | yes §D |
| `src/lib/automation/labels.ts` | edited | `{ value: "hr.roster.published", label: "เมื่อเผยแพร่ตารางกะ (HR)" }` next to `hr.leave.submitted` | yes |
Not touched (R13 / S8.7): `service.ts` · `settings.ts` · `time-rules.ts` · `payroll*.ts` · `privacy-shared.ts` · `prisma/**` · `webhooks/labels.ts`.

## 2. Migration / seed / backfill
- none (no `prisma/` edit — H1.2 schema) · no roster seed (Q14) · runbook: **event registry only** — deploy ships consumer + label in the same build as the emitter. Rollback past H2.1: mark PENDING `hr.roster.published` rows DONE first or keep the consumer line (H5.3 input). `HrRosterEntry` stays empty in prod until a shop uses H2.2.

## API (signatures = oracle header · result `{ ok: true, … } | { ok: false, reason }`)
| function | input | ok result | notes |
|---|---|---|---|
| `generateFromTemplate(ctx, viewer, {from,to,unitId?})` | days ≤31 | `{created, skipped:[{reason,employeeId,date}]}` | reasons EXISTS · NO_SHIFT · HOLIDAY · PAST · one tx per employee · whole range in the past ⇒ refused (flag 2) |
| `addEntry(ctx, viewer, {employeeId,date,shiftId,note?,startMin?,endMin?})` | | `{id}` | MANUAL · snapshot · override (Q7, crossesMidnight derived, break from shift) |
| `moveEntry(ctx, viewer, entryId, {date?,shiftId?,employeeId?})` | | `{id}` same id | re-check as add · re-snapshot only when the shift changes · unitId recomputed · source MANUAL · published=false (publishedAt kept) |
| `removeEntry(ctx, viewer, entryId)` | | `{}` | hard delete · audit `wasPublished = publishedAt ≠ null` |
| `copyWeek(ctx, viewer, {fromWeek,toWeek,unitId?})` | weeks normalised to Monday | `{created, skipped, warnings}` | EXISTS (target day had rows before this copy) · HOLIDAY · SHIFT_ARCHIVED · ENDED · OUT_OF_EMPLOYMENT · PAST · current shift times (Q6) · INFO HOLIDAY_WORK / ON_LEAVE |
| `checkRules(ctx, viewer, {from,to,unitId?})` | | `{warnings}` | all-unit rows of in-scope employees + enclosing weeks ±1 day · entryIds cut to in-scope rows |
| `listRoster(ctx, viewer, {from,to,unitId?})` | | `{entries (R7 keys), unpublishedCount, warnings}` | unpublishedCount = rows `published=false` + `hr.roster.entry.remove` audits with `wasPublished:true` in range since the last `hr.roster.publish` audit of the system |
| `publishRoster(ctx, viewer, {from,to,unitId?})` | ≤2000 rows | `{published, eventId}` | one tx · sorted locks · re-count under lock + guarded `updateMany` count check ⇒ any mismatch = rollback + fixed text (flag 4) · zero ⇒ `{0, null}` no event no audit |
| `rosterOnDay({tenantId,date,unitId?,systemId?})` | no viewer | `{hrLinked, entries (R8 keys)}` | published(At) rows · active ∧ ≠ENDED · minus APPROVED leave · unit = entry.unitId or null (Q12) |
| `rosterAt({tenantId,at,unitId?,systemId?,toleranceMin?})` | | same | windows of D−1, D (+D+1 with tolerance) containing `at` (half-open, ±tol ≤ 720) |
Who: write = OWNER or `hr.employee.create` (MANAGER passes `evaluate`) · read (list/check) = writers + MANAGER role. Branch: scope axis = `entry.unitId` (flag 5); writes check the unit of the day (`HR_OTHER_BRANCH_TEXT` / `HR_UNASSIGNED_TEXT`) and call `evaluate(…, unitId)` only for explicit-list scopes (H1.1 R12); all-branch viewers pass without a unit.

## Rule-check vectors (pure · S4)
| vector | result |
|---|---|
| 07:00–17:00 (600) / 07:00–17:15 (615) | none / MAX_DAY 615/600 |
| 07–12 + 13–19 same day | MAX_DAY 660 (both ids) |
| 15–23 then 07–15 next day (gap 480) | REST |
| 22–06 then 15:00 (540) / 17:00 (660) | REST / none |
| 07–15 + 12–20 | OVERLAP only |
| 7 / 6 working days Mon–Sun | DAY_OFF weekStart Mon / none |
| Sun 22–06 + Mon 07:00 | REST across weeks · DAY_OFF per Bangkok Mon week |
| 7×8 h / 6×8 h | MAX_WEEK 3360 / none |
| 13–21 + 22–06 on D | MAX_DAY D 960 · none on D+1 |

## Event / consumer / label
`hr.roster.published` · key `hr.roster.published#<publishId>` (publishId = `randomUUID()` per call) · payload `{publishId, systemId, unitId|null, from, to, entryIds, employeeIds}` · consumer `withAutomation(async () => {})` · label `เมื่อเผยแพร่ตารางกะ (HR)` (automation, spread to webhooks) · replay ×2 seq + ×2 parallel = S5.7.

## Refusal texts (`ROSTER_TEXT`, plus H1.1/H1.2 texts reused)
| case | text |
|---|---|
| no permission | คุณไม่มีสิทธิ์จัดตารางกะ |
| ENDED / inactive | พนักงานคนนี้พ้นสภาพแล้ว — จัดกะไม่ได้ |
| outside employment | วันนี้อยู่นอกช่วงการจ้างของพนักงานคนนี้ |
| archived shift | กะนี้ปิดใช้แล้ว — เลือกกะอื่น |
| shift not in this system | ไม่พบกะนี้ — กรุณารีเฟรช |
| shift of another unit | กะนี้เป็นของสาขาอื่น — เลือกกะของสาขานี้หรือกะที่ใช้ทั้งร้าน |
| duplicate | พนักงานคนนี้มีกะนี้ในวันนั้นแล้ว |
| past day / past range | จัดกะย้อนหลังไม่ได้ — ใช้คำขอแก้เวลาแทน |
| same week | สัปดาห์ต้นทางกับปลายทางต้องไม่ใช่สัปดาห์เดียวกัน |
| publish race | ตารางกะมีการแก้ไขระหว่างเผยแพร่ — กรุณากดเผยแพร่อีกครั้ง |
| employee not found (other tenant/system) | ไม่พบพนักงานคนนี้ — กรุณารีเฟรช |
| entry not found | ไม่พบกะนี้ในตาราง — กรุณารีเฟรช |
| entry changed under lock | กะนี้เพิ่งถูกแก้ไข — กรุณารีเฟรชแล้วลองใหม่ |
| range > 31 days / from > to / bad date | เลือกช่วงวันได้ไม่เกิน 31 วัน · วันเริ่มต้องไม่หลังวันสิ้นสุด · วันที่ไม่ถูกต้อง |
| > 2000 rows in one publish | รายการมากเกินไปสำหรับการเผยแพร่ครั้งเดียว — กรุณาเลือกช่วงวันให้สั้นลง |
| other branch / unassigned / unitId arg outside scope | H1.1 `HR_OTHER_BRANCH_TEXT` · `HR_UNASSIGNED_TEXT` · H1.2 `SETTINGS_TEXT.otherUnit` |
| bad time override | H1.2 `TIME_RULE_TEXT.*` (e.g. เวลาเริ่มกับเวลาเลิกกะต้องไม่เท่ากัน) |
| anything else | บันทึกตารางกะไม่สำเร็จ — กรุณาลองใหม่ (never `e.message`) |

## 3. Gates (builder-side)
D1 oracle fab86b7c, base run `BASE-EXPECTATION 84/84 as registered (RED-by-design 72 · GREEN controls 12)` · D2 controller re-run pending · D5 typecheck exit 0 (1 run, tsbuildinfo 22:05:21 → 22:52:36) · fitness 42/42 + fitness-hr 8/8 with env (qc4.sh) and with `env -u DATABASE_URL -u DIRECT_URL` · D6/D7/D8/D15 N-A (no UI, no build) · D13 roster surfaces = ids/times only (S6.9, S7.3, S5.2) · D16 consumer + 1 label + replay ×2 (S5.6–S5.8).

## 4. X-group
X1 S1.6/S3.6/S5.8 · X2 X2.1/X2.2/S7.x · X3 S7.4 · X4 N-A (no money) · X5 N-A · X6 X6.1–X6.3 + S5.5 · X7 S4.x (Bangkok week, overnight, 2030 dates) · X8 N-A · X9 S5.7 · X10 N-A · X11 payload/result key checks S5.2/S6.9 · X12 X12.1.

## 5. Regression (after = head f30f318a · exit · summary)
| suite | after |
|---|---|
| qc-hr-h2.1 forced ×2 + unforced ×1 | 0 · 84/84 ×3 · RESIDUE none |
| qc-hr-h1.3 | 1 · 60/63 — S5.7/S6.5/S6.6 are H1.3's own "diff vs base ⊆ H1.3 files / consumer keys = base" statics; base = merge-base fb245484 now that H1.3 is merged, so they flag H2.1's legitimate outbox-consumers.ts / labels / hr files (expected, not a behaviour regression — controller may record as known) |
| qc-hr-h1.2 · h1.1 · h0.7 · h0.1 · h0.3 · h0.5 · h0.6 (QC_H06_BASE=d350c26c) | 0 · 73/73 · 81/81 · 74/74 · 67/67 · 37/37 · 71/71 · 55/55 |
| qc-hf-hr-privacy | 0 · 194/194 |
| qc-hr-attendance · qc-hr-roster · qc-hr · qc-hr-leave-booking · qc-hr-payadjust | 0 · 31/31 · 24/24 · 9/9 · 14/14 · 27/27 |
| qc-payroll · qc-payroll-reverse · qc-crm-c3.3 | 0 · 19/19 · 14/14 · 90/90 |
| qc-calendar · qc-ai-tools · qc-approval-wiring · qc-nav-functions | 0 · 9/9 · 18/18 · 7/7 · 11/11 |
| qc-kanban-k3.3 · qc-crm-c0.3 (automation/webhook label suites) | 0 · 14/15 (K3.3-S9.2 = screenshots in `.qc-shots/kanban/3.3`, absent in this worktree — environmental) · 88/88 |
| seed-hr-qc ×2 | 0 · 28/28 ×2 · counts identical |
| fitness / fitness-hr (env · no env) | 42/42 · 8/8 both modes |
| typecheck | exit 0 (1 run) |

## 9. Disputes / decisions
- ORACLE-EDIT: none.
- decisions: (a) generate skips individual past days as `PAST` and refuses only when the whole range is past (flag 2 wording); copy likewise (whole target week past ⇒ refused). (b) copyWeek always re-takes the current shift times — a source time override (Q7) is not carried (Q6 "times re-taken from the current shift"). (c) checkRules emits HOLIDAY_WORK for any holiday row that applies to the entry's unit (open or closed); copyWeek only for shop-open days (closed days are skipped). (d) REST/OVERLAP warnings carry `day` = the later entry's day. (e) publish refuses (no partial publish) if > 2000 rows in the range. (f) audit `after` adds `systemId` (used by `unpublishedCount`); move audit adds `fromEmployeeId/fromDate/fromShiftId`.

## 10. Debt / not done
| item | reason | closes in |
|---|---|---|
| D1 clock()/judgement still on `HrWorkSchedule` | brief §7 | H2.4/H2.5 |
| D2 C-8 v2 `onShiftToday` still answers from the template (pos-seam hunk) | Q1 | after session/pos ∩ session/hr (rc) |
| D3 rule limits are constants | no HrLawTable roster kind | settings/HrLawTable later |
| D4 no draft layer (edits after publish visible) | Q4 | H2.2 Mig if owner wants |
| D5 half-day leave hides the whole entry | | H2.7 |
| D6 holiday precedence minimal | | H2.8 |
| D8 no employee notification on publish | consumer no-op | H2.10 |
| D9 no roster permission key | Q5 | — |
| copy does not carry time overrides | decision (b) | H2.2 if the board needs it |

## 11. QC4 / temp data left
- oracle `finally` sweeps its tenants · `RESIDUE none` on every run · temp data left: none.

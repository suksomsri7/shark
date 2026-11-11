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

## r2 (6 Nov) — ⏸ PAUSED BY OWNER (stop order mid-round · all coded · suites green · typecheck NOT run)
Branch `wip/pos-hr-h2.1-fix` cut from 7dd696697 (head of `wip/pos-hr-h2.1`) · worktree `/root/projects/shark-hr` · scope = review R-1/R-2/R-3 (`hr-H2.1-review.md`) + hunter F4 (controller ruling) · hunter F1 = R-1, F2 = R-2, F3 = R-3 (`hr-H2.1-hunt.md`).

### Coded (`src/lib/modules/hr/roster.ts`, markers `// HR H2.1 r2 ▸ … ◂`)
- **R-1 / hunt F1 (:868-872)** publishRoster under-lock re-check `recheck = { id in ids, published:false, date in [from,to], ...entryScopeWhere(scope, unitId) }` used by both `count` and the guarded `updateMany` ⇒ a candidate moved out of range/unit before the lock ⇒ `publishRace`, tx rolls back, not in any payload. Hunt F1 interleaving (side tx holds (emp,D) · manager publish blocks in lockKeys · owner moves B to another branch employee / to D+25) ⇒ **fixed, re-check id H2.1-S9.1**.
- **R-2 / hunt F2 (:517-532)** moveEntry re-reads `ENTRY_SELECT` under the lock and refuses `ROSTER_TEXT.entryChanged` if employeeId/date/shiftId/startMin/endMin/breakMin/crossesMidnight/unitId differ from the pre-lock read. **Deviation from the controller list: `published` is NOT compared** — comparing it made `H2.1-X6.2` (CRITICAL, publish ∥ moveEntry must both succeed) RED 3/3 in the first green run (`move=✗`); a publish that commits first touches none of the fields the move writes and the move sets `published=false` anyway (R7). Hunt F2 interleaving (M1 shift-only move and M2 date move both blocked on (emp,D+5), M1 commits first) ⇒ M2 refused ⇒ **fixed, re-check id H2.1-S9.2**. Residual: the move audit's `wasPublished` still comes from the pre-lock read (audit only).
- **R-3 / hunt F3 (:768-808 + :849-857 + :884)** `removedSinceLastPublish` now clears a removal only when a later `hr.roster.publish` audit covers its day (from ≤ d ≤ to) and its unit (publish unit set = `unitId` arg, else the publisher's scope; `*` = all incl. unassigned); floor = latest publish covering the whole view. Publish audit gains `scopeUnits` (null = all branches; pre-r2 audits read as all). **Zero-candidate publish: chosen = minimal marker** — writes the `hr.roster.publish` audit `{count:0,…}` only when the view has pending published removals (no event; nothing written otherwise, so S5.3 "no audit" stays true). Not fixed: hunt F3 side-gap (removal landing between publish commit and its audit write) — would need app-clock vs DB-clock comparison.
- **hunt F4 (:581-593, copyWeek :606/:617/:628/:657/:681)** controller ruled "copy override verbatim", but verbatim makes existing **H2.1-S3.1 (CRITICAL) RED** (it requires e3's stale snapshot 18:00 → current shift 19:00). Implemented `copyTimesOf`: source times ≠ shift AND shift not edited since the row was written (`row.updatedAt ≥ shift.updatedAt`) ⇒ copy the source times verbatim (override, Q7); shift edited after the row ⇒ current shift times (Q6). No schema column marks an override, so an override whose shift was edited later falls back to shift times. **Controller decision needed** (accept heuristic · or ORACLE-EDIT S3.1 · or override column in H2.2 Mig).

### Oracle (`scripts/qc-hr-h2.1.mts`, pre-approved ORACLE-EDIT, S9.x added only · 84 → 88 checks)
- S9.1 (R-1 race, advisory-key holder moves row to u2) · S9.2 (R-2 race, holder changes shift+times) · S9.3 (R-3 per unit/range + lone removal cleared by an empty publish) · S9.4 (F4 override 14:00–20:00 on 07:00–15:00 copied as such). Block runs after S7.6/S7.7 on purpose (S9.3's marker audit). Weeks 2030-08-05…09-08 (unused elsewhere).
- RED on 7dd696697 (old roster.ts): `passed 84/88 · failed S9.1 S9.2 S9.3 S9.4 · exit=1` — S9.1 `ACCEPTED published=2 b.unit=u2 b.published=true events +1` · S9.2 `ACCEPTED shift=m (reverted) 420-900 day=2030-08-14` · S9.3 `u2=0→0 u1=1→1` · S9.4 `target=420-900` · Z1 residue ✅.

### Suites (final code; `iso.sh → qc4.sh → with-gate-lock.sh`, QC_H06_BASE=d350c26c…)
| suite | forced #1 | forced #2 | unforced |
|---|---|---|---|
| qc-hr-h2.1 | 88/88 (exit not captured — orphaned wrapper, see note) | 88/88 exit 0 | 88/88 exit 0 |
| qc-hr-roster | 24/24 exit 0 | 24/24 exit 0 | 24/24 exit 0 |
| qc-hr-attendance | 31/31 exit 0 | 31/31 exit 0 | 31/31 exit 0 |
| qc-hr-leave-booking | 14/14 exit 0 | 14/14 exit 0 | 14/14 exit 0 |
| qc-booking-hours-hr | 13/13 exit 0 | 13/13 exit 0 | 13/13 exit 0 |
| qc-hf-hr-privacy | 194/194 exit 0 | 194/194 exit 0 | 194/194 exit 0 |
| fitness-hr no env / via qc4.sh | 8/8 exit 0 | 8/8 exit 0 | |
- Note: the first green run on the pre-X6.2-fix code was `87/88 failed X6.2 exit=1` (the `published` comparison above, removed). Z1 residue green on every qc-hr-h2.1 run.
- **Unverified: `pnpm typecheck` NOT run (owner stop order).** Edited files pass an esbuild syntax transform only. `pnpm fitness` not run. Not re-run by controller/reviewer.

### COMMON §F (session/hr copy)
1 N/A (no page) · 2 ✓ (only `tx` inside tx bodies; new reads `removedSinceLastPublish` outside the publish tx) · 3 ✓ (scope via `entryScopeWhere`/`entryInScope`; `[]` = all) · 4 ✓ (only existing fixed refusals: publishRace / entryChanged) · 5 unchanged (R-5/R-6 not in scope) · 6 N/A · 7 ✓ · 8 N/A · 9 ✓ (no new event; zero-row publish emits none) · 10 ✓ (roster.ts + oracle + notes only).

### Next on resume
1. Controller rules on the two deviations (R-2 without `published` · F4 heuristic vs S3.1). 2. Typecheck once (`env NODE_OPTIONS=--max-old-space-size=8192 ISO_MEM=9800M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck`, when no other build/typecheck iso unit and MemAvailable ≥ 10 000 MB). 3. Controller re-run + reviewer of r2 diff. QC4 temp data left: none.

## r3 (11 Nov) — fix round on review r2 (`hr-H2.1-review-r2.md`) · branch `wip/pos-hr-h2.1-fix` · worktree `/root/projects/shark-hr`
Controller rulings r3: MAJOR-1 → createdAt heuristic + S9.5 · MEDIUM-1 → key re-check under lock + S9.6 · MINOR-1..3 → debts (owner H2.2).

### Coded (`src/lib/modules/hr/roster.ts`, markers `// HR H2.1 r3 ▸ … ◂`)
- **MAJOR-1 / F4 (:583-594, select :612)** `copyTimesOf` now compares `row.createdAt >= shift.updatedAt` (was `updatedAt`); copyWeek selects `createdAt` instead of `updatedAt`. Publish (`updateMany published:true`) and same-shift moves bump `updatedAt` but not the times, so they no longer turn a stale snapshot into an "override". Times are written only at create (add/copy, maybe override) or by a shift-changing move (copies the then-current shift ⇒ not `differs` until the next shift edit ⇒ then createdAt < edit ⇒ shift times — correct).
- **MEDIUM-1 / R-1 leftover (:873-877)** under the lock publish re-reads `{id, employeeId, date}` with `tx` (`findMany` on the same `recheck` filter) and throws the existing `ROSTER_TEXT.publishRace` unless the count matches and every row's `employeeId|dayOf(date)` equals its pre-lock candidate key ⇒ whole tx rolls back, no outbox event, no audit. Guarded `updateMany` + count check kept.

### Oracle (`scripts/qc-hr-h2.1.mts`, pre-approved ORACLE-EDIT · S9.5 + S9.6 only · 88 → 90 checks)
- **S9.5** (registry :236 · body after S9.4): own shift `กะทดสอบ r3` 07:00–15:00 · rows e1 2030-09-10 and 2030-09-24 written · +1.1 s · shift edited to 07:00–16:00 · +1.1 s · case 1 publish week 09-09 · case 2 `moveEntry` 09-24 → 09-25 on the same shift · copyWeek 09-09→09-16 and 09-23→09-30 ⇒ 09-17 and 10-02 must carry 420–960.
- **S9.6** (registry :237): built like S9.1 — holder lane holds (e6, 2030-10-09) and moves row b to (e1, 2030-10-11) (same unit u1, same week) while a manager-u1 publish of 10-07…10-13 waits ⇒ `publishRace`, a and b unpublished, 0 events.
- **RED on fe1053198** (oracle edited, roster.ts unfixed, forced): `passed 88/90 · failed H2.1-S9.5 H2.1-S9.6 · exit=1` — S9.5 `actual published,moved … published→420-900 moved→420-900` (stale snapshot copied, the reviewed bug) · S9.6 `actual refused,moved,other,noEvent ACCEPTED published=2 b=e1/2030-10-11/pub=true a.pub=true events +1` · Z1 residue ✅. S3.1/S9.4/X6.2 green in that run.

### Suites (final code · `iso.sh → qc4.sh → with-gate-lock.sh env QC_H06_BASE=d350c26c… [QC_FORCE=1]`)
| suite | result | exit |
|---|---|---|
| qc-hr-h2.1 unforced | 90/90 · RESIDUE none | 0 |
| qc-hr-h2.1 forced #1 | 90/90 · RESIDUE none | 0 |
| qc-hr-h2.1 forced #2 | 90/90 · RESIDUE none | 0 |
| qc-hr-roster forced | 24/24 | 0 |
| qc-hr-attendance forced | 31/31 | 0 |
| qc-hr-leave-booking forced | 14/14 | 0 |
| fitness-hr via qc4.sh / `env -u DATABASE_URL -u DIRECT_URL` | 8/8 · 8/8 | 0 · 0 |
| typecheck (once, `NODE_OPTIONS=8192 ISO_MEM=9800M`) | 0 errors | 0 |
Not run (controller's): full regression, `pnpm fitness`.

### Debts added in r3
| id | item | owner |
|---|---|---|
| D-F4 | createdAt heuristic: a manual time override applied to an *older* row after a shift edit is not carried by copyWeek (falls back to current shift times); an override whose shift is edited later also falls back. Real fix = column `HrRosterEntry.timesOverridden` | H2.4 migration |
| D-R3w | review r2 MINOR-1: R-3 clearing window = candidate read → publish audit write (audit written after commit via `writeAudit`, own connection) — removals of published rows in that window are cleared unannounced; fix = compare against `at` stored in the audit `after`, or write the audit inside the tx | H2.2 (board counter) |
| D-R3a | review r2 MINOR-1: `writeAudit` swallows errors ⇒ a failed publish audit never clears the counter (stuck high) | H2.2 (board counter) |
| D-R3c | review r2 MINOR-2: `take: 500` publish audits ⇒ no whole-view floor past 500 publishes ⇒ old removals may count forever | H2.2 (board counter) |
| D-R3m | review r2 MINOR-3: zero-candidate marker decided outside any lock ⇒ a removal landing between count and marker is cleared silently | H2.2 (board counter) |

### COMMON §F (session/hr copy, same numbering as r2)
1 N/A · 2 ✓ (new under-lock read uses `tx`) · 3 ✓ (same `entryScopeWhere` recheck) · 4 ✓ (existing `publishRace` only) · 5 unchanged · 6 N/A · 7 ✓ · 8 N/A · 9 ✓ (no new event; refusal emits none) · 10 ✓ (roster.ts + oracle + notes only).
QC4 temp data left: none.

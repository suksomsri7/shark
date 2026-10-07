# HR H0.3 — clock-in and kiosk integrity (D7a · D7b · D8 interim · D13a · D14 · X2)

Brief: `ledger/hr-briefs/hr-brief-H0.3.md`. Branches (controller override of COMMON §A.1): oracle `wip/pos-hr-h0.3-oracle` → builder `wip/pos-hr-h0.3`.
Base: `0438cd09` = origin/main `f85f5455` + briefs (contains afcb9bc3 `hotfix/hr-privacy`; checked with `git merge-base --is-ancestor`).

## Status / checkpoint
- DONE (oracle writer, lane A): `scripts/qc-hr-h0.3.mts` (36 checks), red output `ledger/wo-notes/hr-H0.3-red.txt`. No product code touched.
- NEXT: builder on `wip/pos-hr-h0.3` (cut from the oracle head). Rulings R1–R7 of the brief + the OQ defaults below.

## Oracle: facts verified (§1) on this base
| Fact | Verified at | Result |
|---|---|---|
| D7a `clockAction` = `requireTenant` → `assertHrCan("hr.attendance.clock")` → `clock()` for any form `employeeId`, no PIN | `hr/actions.ts:62-72` | true. The forms are at `hr/ui.tsx:133,139`, no gate (rendered for every viewer of the page). The key label "ลงเวลาเข้า-ออกแทนพนักงาน" is at `core/permissions.ts:495` on this base (brief said :497 on HEAD). The oracle proves it: S1.4, a kiosk-only STAFF account, writes a row. |
| `kioskClockAction` uses the same key | `hr/actions.ts:195-197` | true |
| D7b in-memory limiter `checkRateLimit('hr-kiosk:<employeeId>', 5/60 s)`, per employee only | `hr/actions.ts:202`, `core/rate-limit.ts:23` | true. It blocks inside one process (S2.1 is green on base). It does not hold across processes (S2.4: 6 tries pass) and there is no system bucket (S2.5: the 61st employee gets clocked in). |
| `checkRateLimitDb(key, {limit, windowMs}, now = Date.now())`: one-statement upsert on `ChatRateBucket` | `core/rate-limit-db.ts:37-84` | true. **Fail mode = fail-OPEN.** Any DB error goes to `catch`, which writes `logOps("WARN","rate-limit-db",…)` and returns `{ ok: true }` (:77-83). If the limiter DB call fails, the kiosk keeps working without a limit. `now` can be injected, but the actions cannot pass it, so the oracle backdates `windowStart` on our own bucket rows instead. |
| D8 `setPinAction` → `setPin`: generic duplicate text, no rate limit | `actions.ts:175-183`, `service.ts:324-340` | true (S3.1: 11 of 11 pass) |
| D13a `clock` inserts with no lock or unique; `clockWithPin` = `nextClockKind` (last event since Bangkok 00:00) then insert | `service.ts:292-315`, `:343-352`, `:362-370`; `hr.prisma:140-155` (only `@@index([systemId, employeeId, at])`) | true. 10 parallel taps give 10 IN rows (S4.2, S4.3). A double tap on the kiosk records IN then OUT (S4.4). |
| X2 `clock` does not check that the employee belongs to `ctx.systemId` | `service.ts:292-315` | true. X2.1/X2.2 write a row in system A for an employee of system B. `clockWithPin` already refuses (`findFirst` through `tenantDb` is scoped to the system), so X2.3 is green on base. |
| `clockAction` does not check `active` | `actions.ts:62-72` | true (S1.7 writes a row for an inactive employee) |
| D14 `pending_leaves` has no leave id; `hr_decide_leave` says to take `leaveId` from it | `ai/tools.ts:151-171` (map :162-170, hotfix comment :168), `:447-474` (text :452) | true (S5.1/S5.2). Note: the word "รหัสใบลา" already occurs in `tools.ts` on base, as the `leaveId` parameter description of `hr_decide_leave`. The oracle's SKIP detector therefore looks for `รหัสใบลา: l.id`. |
| OWNER/MANAGER pass `evaluate` by role | `core/rbac.ts:34-36` | true |
| `HrAttendance.note String?` exists | `hr.prisma:148` | true |

## Check list — expected result on base (forced) and the reason
Run on base (forced): **14/36 pass, 22 red, 0 crashed**, the same in both forced runs. Each red is for the reason shown.

| id | base | red reason on base / why it cannot fail on base |
|---|---|---|
| S1.1 OWNER on-behalf ok | GREEN | allowed today (and after) |
| S1.2 MANAGER ok | GREEN | allowed today |
| S1.3 STAFF with `hr.attendance.clock` + `hr.employee.create` ok | GREEN | allowed today |
| **S1.4** kiosk account (only `hr.attendance.clock`) → no row | RED | `1 แถว · returned`: the action has no employee-admin check |
| S1.5 plain member → no row | GREEN | `assertCan` already throws |
| **S1.6** note "ลงเวลาแทนโดย <name>" | RED | notes `[null,null,null]` |
| **S1.7** inactive employee refused | RED | `1 แถว` |
| **S1.8** [static] UI gates the on-behalf forms | RED | no right referenced before `action={clockAction}` |
| **X2.1** clockAction with another system's employee | RED | `1 แถว` |
| **X2.2** `clock(ctxA, empOfB)` refused | RED | `+1 แถว · คืน id …` |
| X2.3 kiosk with another system's employee | GREEN | `clockWithPin` is already system-scoped |
| S2.1 5 wrong, then the 6th (correct) refused before the compare | GREEN | the in-memory limiter blocks inside one process |
| **S2.2** buckets in `ChatRateBucket` (`hr-kiosk:emp:<t>:<e>`, `hr-kiosk:sys:<t>:<s>`) | RED | `emp=ไม่มี sys=ไม่มี` |
| **S2.3** after the window (bucket rows backdated 61 s) the correct PIN passes | RED | `ย้อน 0 ถัง · ลองใหม่ในอีก 60 วินาที`: the in-memory window cannot be reset from the DB |
| **S2.4** cross-process: parent 3 + child `tsx` process 3 → at most 5 pass | RED | `allowed=6` and the child's correct PIN clocks in |
| **S2.5** system bucket: 60 tries over 60 employees, then the 61st refused | RED | the 61st gets `status ok · เข้างาน` (run took 0.5 s) |
| **S3.1** the 11th `setPinAction` by one actor refused | RED | `ok ×11 · pin=80011` |
| S3.2 another actor not affected | GREEN | no limiter today |
| **S3.3** bucket `hr-setpin:<t>:<actor>` in the DB | RED | no row |
| S4.1 10 parallel `clockWithPin` ×3 → all ok, none OUT | GREEN* | *the base race happens to return IN for all 10 (no row is read yet); could flip on a slow DB |
| **S4.2** exactly 1 IN per round | RED | `IN×10` per round |
| **S4.3** 2 processes × 5 at a set time → 1 row | RED | `10 แถว` (both workers on time) |
| **S4.4** kiosk double tap → 2nd ok "เพิ่งลงเวลาเข้า…", 1 row | RED | `2=… ออกงาน · IN+OUT` |
| S4.5 after the dedupe window (rows backdated 61 s) → OUT | GREEN | base records OUT too |
| **S4.6** explicit `clockAction` IN ×10 parallel → 1 row | RED | `10 แถว` |
| S4.7 explicit IN then OUT within 60 s → both | GREEN | base records both |
| S4.8 child process, 9 of 10 pool connections held → `clockWithPin` ok < 3 s and committed | GREEN | base uses no tx. Guards the builder's tx (C.8, round-5d lesson) |
| **S4.9** [static] `clock` = `$transaction` + `pg_advisory_xact_lock(hashtextextended('hr:clock:…'))` + `CLOCK_DEDUPE_SEC = 60` | RED | all three missing |
| **S5.1** `pending_leaves` rows carry `รหัสใบลา` = the leave ids, no reason | RED | `ids=0/2` (no reason leak on base) |
| **S5.2** that id into `hr_decide_leave` → `AiProposal` for that leave | RED | `fed=undefined → ต้องระบุรหัสใบลา` |
| S6.1 [static] `clockInDetail` + `judgeClockIn` sha256 unchanged | GREEN | regression guard (`2f6f57a8…`, 669 chars) |
| S6.2 [static] HF-HR-0 comment kept, no `l.reason` | GREEN | regression guard |
| **S6.3** [static] map keys exactly พนักงาน/ประเภท/ตั้งแต่/ถึง/รหัสใบลา, `รหัสใบลา: l.id` with `HR H0.3 ▸` | RED | key missing |
| **S6.4** [static] no in-memory `checkRateLimit` in `hr/actions.ts`; DB keys before `clockWithPin(` / `await setPin(` | RED | `inMem:true db:false` |
| **S6.5** [static] `clockAction` checks `"hr.employee.create"` before `await clock(` | RED | not present |
| Z1 residue | GREEN | `RESIDUE none` |

Green on base by design (they guard behaviour that must not break): S1.1 S1.2 S1.3 S1.5 X2.3 S2.1 S3.2 S4.1 S4.5 S4.7 S4.8 S6.1 S6.2 Z1.

## OQ list (no controller answer yet; the brief's recommended default is applied, and the checks follow it)
- **OQ-1 (= brief Q1):** a refused on-behalf attempt may show a message or return silently. The checks only require "no row written" (S1.4, S1.5, S1.7, X2.1). A `ForbiddenError` throw, a silent return and a state message all pass.
- **OQ-2 (= brief Q2):** dedupe window = 60 s (default). S4.5 backdates 61 s and S4.7 relies on "opposite kind within 60 s is allowed". If the controller picks 120 s, S4.5 needs `121_000` (ORACLE-EDIT).
- **OQ-3:** R1 says clockAction "additionally" requires `hr.employee.create`. S1.3 therefore gives the STAFF admin both keys. A STAFF with only `hr.employee.create` is not tested, so either reading passes.
- **OQ-4:** "actor display name" = `User.name` of the session user. S1.6 requires the note to start with "ลงเวลาแทนโดย" and contain `User.name`, so the exact spacing and format are free.
- **OQ-5:** S1.8 (UI gating) is a static heuristic. Inside `HrAttendanceSection`, a reference to `"hr.employee.create"` or a variable named like `canClockFor…/clockFor…/canOnBehalf…/onBehalf…/canManageEmployees…/canAdminEmployees…` must come before the first `action={clockAction}`, with a `&&`/`?` between them. Other naming = ORACLE-EDIT request. The behavioural guard is S1.4.
- **OQ-6:** the "เพิ่งลงเวลาเข้า…" text may be in `message` or `detail` of the kiosk state (S4.4 searches both). R4 says the result is success (`status: "ok"`).
- **OQ-7:** pool size. `db.ts` gives `PrismaPg` only a connection string, so the pool is the `pg.Pool` default of 10 (measured N=10 on QC4). S4.8 holds exactly 9 in a child process. If the pool size ever changes, update `POOL_MAX`.

## Finding for the controller (pre-existing, not in this WO's scope)
- **The pool probe of `qc-hf-hr-privacy` F2-3 can silently lose later writes in that process.** It opens transactions until one times out (`maxWait 1.5 s`). The timed-out request stays queued in `pg.Pool`. It later takes a released connection and leaves it "idle in transaction" in the pool. Measured on QC4 (7 Oct, throw-away script, now deleted): after the probe, a write was visible in the same process (`seenInside=1`) and never committed (`seenA=0`, `pg_stat_activity` idle-in-tx = 1). The same happened again 2 s later (`seenB=0`). My first draft of S4.8 hit it: `clockWithPin` returned ok and 0 rows were committed. In F2-3 everything after the probe (later checks, cleanup, the residue count) may be affected. This oracle therefore holds exactly POOL_MAX−1 connections, with no failing probe, in a child process.

## How to run (VPS only; QC4 through the wrappers; QC_FORCE inside them)
```
bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h0.3.mts   # forced
bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-hr-h0.3.mts                  # unforced: SKIP exit 0 while no H0.3 code exists
pnpm exec tsx scripts/qc-hr-h0.3.mts --list                                                                                  # registry, no DB
```
- SKIP rule: it skips only when none of `checkRateLimitDb` (hr/actions.ts), `hr:clock:` (service.ts) or `รหัสใบลา: l.id` (tools.ts) exists. Once the builder adds any of them, an unforced run runs every check.
- Temp data: tenant `qc-hr-h0.3-<stamp>` with 3 HR systems (A main, B for X2, C with 61 employees for the system bucket), 5 users each with membership and session. Everything is deleted in `finally`, including `ChatRateBucket` rows whose key contains the tenant, system, employee or user ids. A `RESIDUE …` line is printed and Z1 checks it.
- Children: `--tap-worker` (S4.3, 2 processes, set time +40 s), `--kiosk-worker` (S2.4, the session cookie goes in through env `QC_H03_COOKIE`, never on argv), `--pool-worker` (S4.8). Runtime is about 60–70 s; most of it is the S4.3 wait, which overlaps the other sections.
- If run within 4 min of Bangkok midnight, it waits (`nextClockKind` cuts the day at 00:00 Bangkok time). The oracle does not depend on today's date otherwise; the leave dates are fixed in 2027.

## Runs on base (0438cd09, QC4 `ep-frosty-lab`, gate lock)
| run | result | exit | residue |
|---|---|---|---|
| forced #1 | 14/36, 22 red, crashed false | 1 | none |
| forced #2 | 14/36, 22 red (same ids), crashed false | 1 | none |
| unforced | `SKIPPED`, `JSON_SUMMARY … "skipped":true` | 0 | n/a (no rows written) |

An independent check afterwards found 0 tenants `qc-hr-h0.3-*` and 0 users `qc-hr-h0.3-*`. Earlier drafts were run while I fixed two oracle bugs: the SKIP detector fired on the `hr_decide_leave` parameter text, and the pool-probe issue above. After them a separate count also showed 0 tenants, 0 users and 0 debug buckets.

Final summary line, forced #2:
`JSON_SUMMARY {"suite":"qc-hr-h0.3","total":36,"passed":14,"failed":["H0.3-S1.8","H0.3-S4.9","H0.3-S6.3","H0.3-S6.4","H0.3-S6.5","H0.3-S1.4","H0.3-S1.6","H0.3-S1.7","H0.3-X2.1","H0.3-X2.2","H0.3-S2.2","H0.3-S2.3","H0.3-S2.4","H0.3-S2.5","H0.3-S3.1","H0.3-S3.3","H0.3-S4.2","H0.3-S4.4","H0.3-S4.6","H0.3-S4.3","H0.3-S5.1","H0.3-S5.2"],…,"skipped":false,"forced":true,"crashed":false}`

## Notes for the builder
- **Who loses on-behalf clocking (R1):** STAFF accounts with `hr.attendance.clock` but no `hr.employee.create`. These are typically the shop-tablet or kiosk accounts and staff who were only given "ลงเวลาเข้า-ออกแทนพนักงาน". They keep `kioskClockAction` (PIN).
- Limiter numbers: kiosk 5 per 60 s per employee and 60 per 60 s per system. Set-PIN: 10 per 10 min per actor. All keys are tenant-prefixed exactly as R2/R3; S2.2/S3.3 read those exact keys. Dedupe = 60 s.
- Regression note: `qc-hr-attendance` AT-1..3 call `clock` IN → OUT → IN within seconds. That is the opposite kind each time, so R4 allows it. `qc-hr` :25-26 is IN → OUT. `qc-hr-roster` :112 is a single IN.

---

## Builder (lane A · branch `wip/pos-hr-h0.3` cut from oracle head `5725cde0`)

### Status / checkpoint
- DONE: R1–R6 + controller rulings §8 (OQ-1..7). No schema change. Oracle not edited. `KioskClock.tsx` unchanged (dedupe reuses `status: "ok"` + `detail`).
- BLOCKED on the controller: 3 ORACLE-EDIT requests below (2 in the regression `qc-hr-attendance`, 1 typecheck error inside `qc-hr-h0.3.mts`).

### What changed (file:line on the builder head)
| Rule | Where | How |
|---|---|---|
| R1 D7a on-behalf | `hr/actions.ts:69-95` `clockAction` | still `assertHrCan("hr.attendance.clock")` (plain member = `ForbiddenError` as before), then `evaluate(…,"hr.employee.create")` (:77) — no right ⇒ returns `{ ok:false, reason:"ไม่มีสิทธิ์ลงเวลาแทนผู้อื่น ให้พนักงานลงเวลาด้วย PIN ของตนเอง" }`, nothing written (OQ-1). Note = form `note` or `"ลงเวลาแทนโดย " + User.name` (fallback e-mail) (:85, OQ-4). Returns `ClockActionResult` (`{ok:true,deduped}` / `{ok:false,reason}`), fixed Thai texts only, never `e.message`. |
| R1 UI | `hr/ui.tsx:107-115, 146-163` | `canClockForOthers = evaluate(…, "hr.employee.create")` (OQ-5 naming); the two on-behalf forms render only when true, otherwise a muted line "ลงเวลาด้วย PIN ที่จอ kiosk". `ui.tsx:23,40`: `clockAction` is imported as `clockActionWithResult` and narrowed to `(fd) => Promise<void>` because React's `<form action>` type rejects a function that returns an object (checked with tsc); same server-action function at runtime. |
| R2 D7b kiosk | `hr/actions.ts:228-234` | in-memory `checkRateLimit` import removed; `checkRateLimitDb` on `hr-kiosk:emp:<tenantId>:<employeeId>` 5/60 s, then `hr-kiosk:sys:<tenantId>:<systemId>` 60/60 s, both before `clockWithPin` (= before the PIN compare). Refusal text unchanged: "ลองใหม่ในอีก N วินาที". |
| R3 D8 interim | `hr/actions.ts:202-204` | `checkRateLimitDb('hr-setpin:<tenantId>:<actorUserId>', 10 / 10 min)` before `setPin`; refusal "ตั้ง PIN บ่อยเกินไป ลองใหม่ในอีก N วินาที". |
| R4 D13a | `hr/service.ts:288` `CLOCK_DEDUPE_SEC = 60`; `:323-374` `clock` | one `tenantDb(ctx).$transaction` (maxWait 5 s, timeout 10 s) → `pg_advisory_xact_lock(hashtextextended('hr:clock:<employeeId>',0))` (:331) → employee read (scoped) → last event read → dedupe → schedule read → insert. Every statement uses `tx` (the schedule is read through `tx.hrWorkSchedule`, not `getSchedule`, so no second connection while holding the lock — S4.8 green). `kind: "NEXT"` (kiosk) dedupes any kind < 60 s and otherwise decides IN/OUT with `kindAfter` (:377) under the same lock; explicit IN/OUT dedupes the same kind only. A dedupe returns the existing row with `deduped: true`. |
| R4 kiosk | `hr/service.ts:436-450` `clockWithPin`; `hr/actions.ts:241-247` | `clockWithPin` → `clock(kind:"NEXT", requireActive)`; `KioskClockResult.ok` carries `deduped`. The action answers `status:"ok"`, message "<ชื่อ> · เพิ่งลงเวลาเข้า/ออกไปเมื่อ hh:mm", detail "บันทึกไว้แล้ว ไม่ต้องกดซ้ำ". `nextClockKind` (:409) kept for display, same rule via `kindAfter` (latest row; IN since Bangkok 00:00 ⇒ OUT). |
| R5 X2 | `hr/service.ts:332-336`, `:291` | the employee is loaded inside the tx with `tenantId + systemId` (+ `active` when `requireActive`); otherwise `throw new ClockRefusedError("ไม่พบพนักงาน")`, no row. `clockAction` passes `requireActive: true` and maps the error to `{ok:false, reason:"ไม่พบพนักงาน"}`. Service callers without `requireActive` (qc-hr, qc-hr-attendance, qc-hr-roster) behave as before. |
| R6 D14 | `ai/tools.ts:168` | one marked line `รหัสใบลา: l.id, // HR H0.3 ▸ … ◂` in the existing map; HF-HR-0 comment kept, no reason. |

### Acceptance §5 facts
- **Who loses on-behalf clocking:** STAFF accounts that hold `hr.attendance.clock` but not `hr.employee.create` — typically the shop tablet / kiosk login and staff who were only given "ลงเวลาเข้า-ออกแทนพนักงาน". They no longer see the เข้างาน/ออกงาน buttons on the attendance page, and a direct call gets the fixed refusal. They keep the kiosk (`kioskClockAction`, each employee's own PIN). OWNER, MANAGER (by role) and STAFF with both keys keep it. Nobody gains access.
- **Limiter numbers:** kiosk 5 tries / 60 s per employee + 60 tries / 60 s per HR system (both checked before the PIN compare, both counted on every try); set-PIN 10 / 10 min per acting user. All DB-backed in `ChatRateBucket` (fixed window, one-statement upsert), so they hold across server instances (S2.4 proves it with a child process). Rows are swept by the existing daily cron (`sweepRateBuckets`).
- **Dedupe window:** `CLOCK_DEDUPE_SEC = 60` per employee, enforced in the DB transaction under the advisory lock. Kiosk: any kind within 60 s ⇒ no new row. Explicit: same kind within 60 s ⇒ no new row; opposite kind allowed.
- **Fail mode of `checkRateLimitDb`** (`core/rate-limit-db.ts:77-83`): **fail-OPEN.** A DB error is caught, logged with `logOps("WARN","rate-limit-db",…)` and the call returns `{ ok: true }`. If the limiter's DB call fails, the kiosk and set-PIN keep working without a limit (accepted by the controller for kiosk availability). If the DB is really down, `clockWithPin` fails anyway.

### Decisions (for the controller)
1. Refusal for "no employee-admin right" is a returned message, not a throw (OQ-1). A plain member without `hr.attendance.clock` still gets `ForbiddenError` from `assertHrCan`, like every other HR action.
2. `clock()` refuses by throwing `ClockRefusedError` (fixed text) so its success type stays `{ id, judgement, lateMin, … }` for existing callers; actions map it to a fixed message.
3. Tx options `maxWait 5 s / timeout 10 s` (default 2 s / 5 s) so 10 simultaneous taps queue on the lock instead of failing; the pool size is unchanged (OQ-7).
4. The UI cast in `ui.tsx:40` (type only) — alternative would be a client state form; not needed because the button is hidden from people who would be refused.

### ORACLE-EDIT requests (controller)
- **OE-1 `qc-hr-attendance` KI-7** (`scripts/qc-hr-attendance.mts:175`): taps IN then immediately again and expects OUT. Under R4 (kiosk: any kind < 60 s ⇒ no new row) that second tap is a dedupe and correctly returns IN. Proposed hunk: before `const kOut = …` add `await prisma.hrAttendance.updateMany({ where: { employeeId: kio.id }, data: { at: new Date(Date.now() - 180_000) } }); // fixture: พ้นหน้าต่างกันแตะซ้ำ (H0.3 R4)` and before `const kOut2 = …` add `await prisma.hrAttendance.updateMany({ where: { employeeId: kio.id, kind: "OUT" }, data: { at: new Date(Date.now() - 90_000) } });`. KI-8 is green today only because the dedupe also returns IN; with the hunk it tests a real third tap again. (Backdating 3 min can cross Bangkok midnight if the suite runs at 00:00–00:03.)
- **OE-2 `qc-hr-attendance` KI-10** (`scripts/qc-hr-attendance.mts:185-186`): regex `/checkRateLimit\(\s*\`hr-kiosk:/` requires the in-memory limiter, which R2 + `qc-hr-h0.3` S6.4 forbid (mutually exclusive). Proposed: `/checkRateLimitDb\(\s*\`hr-kiosk:emp:/`.
- **OE-3 `qc-hr-h0.3.mts:536`** typecheck error `TS7006: Parameter 'id' implicitly has an 'any' type` (`cEmps` is `any` because `P` is `any`). `pnpm typecheck` covers `scripts/*.mts` (and `next build` type-checks them), so this blocks typecheck = 0 and would break a production build after merge. Proposed: `.map((id: string) => kioskCall(…))` (or `const cEmps: string[] = …` at :532).

### Runs (QC4 `ep-frosty-lab`, through iso.sh + qc4.sh + with-gate-lock.sh)
| run | result | residue |
|---|---|---|
| `qc-hr-h0.3` forced #1 | 36/36 · failed [] · exit 0 | none |
| `qc-hr-h0.3` forced #2 | 36/36 · failed [] · exit 0 (`hr-H0.3-green.txt`) | none |
| `qc-hr-h0.3` unforced | 36/36 · `skipped:false` · exit 0 | none |

| regression | expected | got |
|---|---|---|
| qc-hr | 9/9 | 9/9 |
| qc-hr-attendance | 31/31 | **29/31** — KI-7, KI-10 (OE-1, OE-2); all AT-* judgement checks green |
| qc-ai-tools | 18/18 | 18/18 |
| qc-ai-proposals | 16/16 | 16/16 |
| qc-hr-roster | 24/24 | 24/24 |
| qc-hr-leave-booking | 14/14 | 14/14 |
| qc-booking-hours-hr | 13/13 | 13/13 |
| qc-hf-hr-privacy (last, alone) | 194/194 | 194/194 |

- Fitness: `scripts/fitness.mts` 33/33 with env (qc4.sh) and with `env -u DATABASE_URL`.
- Typecheck (1 attempt, machine lock): exit 2, single error = OE-3 in the oracle file; no error in product code.

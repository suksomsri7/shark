# H2.4 review — Clock v2 (independent, read-only)

> Reviewer: Claude (Opus) · 11 Nov 2026 · worktree `/root/projects/shark-hr-b` · branch `wip/hr-h2.4` @ 8dc452a13 · scope `git diff 1d17382f8..8dc452a13 -- src prisma` (20 files)
> Not run: DB, typecheck, oracles (static reading only). Builder's green/red numbers taken from notes §5, not re-verified.

## Verdict: **FIX FIRST**
The clock core (session/roster link/dedupe/breaks/locks/D-F4/migration) is sound. What blocks the merge is the kiosk: the new PIN-guessing budget and the lockout behaviour (MAJOR-1) are weaker in two ways than the D7b limiter they replace, and multi-branch kiosk accounts lost their branch check (MEDIUM-2). Both need a controller ruling or a small fix. MEDIUM-3 (purge scans the table every hour) is a cheap index fix.

## Findings

**MAJOR-1 · kiosk PIN guessing + shared-device lockout are weaker than the old D7b limiter** · `actions.ts:335-337`, `clock.ts:266-268`, `pin.ts:41-44`
- Old protection: name-pick, then `hr-kiosk:emp:<t>:<emp>` 5/60 s plus `hr-kiosk:sys:<t>:<sys>` 60/60 s, counted on every attempt. Each guess was tested against one chosen employee.
- New protection: PIN only. Each guess is tested against all N active PIN holders of the system. Budget per kiosk account `hr-verifypin:<t>:kiosk:<uid>` = 10 wrong / 10 min; tenant budget = 120 wrong / 60 s.
- (a) Different key and larger aggregate budget. The tenant cap goes from 60/min to 120/min. Any member holding `hr.attendance.clock` gets their own 10/10 min bucket. With a single account, success per minute is about N·10⁻⁴ (old: 60·10⁻⁴). So for any shop with more than about 60 PIN holders, one kiosk account guesses better than before, and 4-digit PINs are still allowed (`PIN_RE` 4–6).
- (b) New availability failure. The bucket is keyed to the shared tablet's account, so 10 wrong PINs in 10 minutes from anyone (typos at a shift change, or one prankster) lock the kiosk for every employee for up to 10 minutes. Those people get no IN row, or a LATE judgement. Before, a lockout hit one employee (5/min) or needed 60/min shop-wide.
- What did not get weaker: per-account throughput, the `hr.pin.locked` audit (new, and good), refund on success, and count-first.
- Smallest fix (controller ruling): require 6-digit PINs for the PIN-only kiosk (cuts the hit rate 100×, so the larger tenant cap no longer matters). For (b), either accept it as a recorded debt with owner notification on `hr.pin.locked` from a kiosk callerKey, or lift the kiosk caller budget (for example 30/10 min, which needs H0.5 approval). Do not add a second limiter.

**MEDIUM-2 · multi-branch kiosk accounts lost the branch check** · `actions.ts:335-336`
- `unitId` is only sent when `unitAccess` has exactly one entry. An account limited to [u1, u2] now sends null, and verifyPin accepts any employee of the system. A u3 employee can clock at that kiosk.
- The removed `hrTarget` + `assertHrCan(…, t.unitId)` refused that case (H1.1 R5).
- Notes §4 lists this as a loss, but the brief R9 text ("else null") never weighed it against H1.1, and there is no ruling.
- Answers to the reviewer questions: a single-branch u1 kiosk refuses a u2 employee with `PIN_TEXT.wrong`, counted, with the same bytes (correct). Employees borrowed into u1 today, and employees with no unit, pass (H1.1 decision 6). Accounts with all branches (`[]`/`*`) send null by design.
- Smallest fix: give verifyPin a `unitIds?: string[]` (any-of in `inUnit`, pin.ts, one hunk) and pass the account's list. Alternatively, refuse kiosk use for multi-branch-limited accounts.

**MEDIUM-3 · hourly purge does a sequential scan of HrAttendance per HR tenant** · `clock.ts:408-424`, `cron/hourly/route.ts:178-186`
- HrAttendance has no index on `tenantId` (only `[systemId, employeeId, at]` and `[rosterEntryId]`). Each run does two `WHERE "tenantId"=… AND "at"<cut AND (lat…|photoKey) IS NOT NULL` scans per tenant, every hour. That cost grows with tenants × rows.
- The purge is awaited before the outbox drain in the same 300 s route.
- Smallest fix: in migration 000000, add partial indexes `("tenantId","at") WHERE "lat" IS NOT NULL OR "lng" IS NOT NULL OR "accuracyM" IS NOT NULL` and `("tenantId","at") WHERE "photoKey" IS NOT NULL`. They hold about 0 rows today, so creation is instant.

**MINOR**
- m1 `clock.ts:162/166`: split shifts with a forgotten OUT. When the next shift's start is less than closeGrace after the old shift's end, the arrival NEXT stores OUT for the old shift, with inflated worked minutes. A second tap within 60 s is deduped to that OUT, so the IN is easy to miss. Same as the old calendar rule (not a regression). For H2.5: when OPEN, now ≥ window.end, and a fresh candidate is inside the early window, make NEXT give IN.
- m2 `pos-seam.ts:70` (frozen): `onShiftToday` maps lastKind BREAK_START/BREAK_END to null. As a result, POS `NO_CLOCK_OUT` (`pos/hr-link.ts:217`) does not fire for anyone whose last row is a break, and POS treats an employee back from break as unclocked. Add this to debts next to D7 (POS lane).
- m3 `clock-settings.ts:53-58`: `canManageClockSettings` hand-rolls `permissions["hr.employee.create"|"hr.*"]` instead of `evaluate()`, and departs from brief R10 (`canManageHrSettings`). The site rows hold no personal data; R12 governs distanceM, not sites. A MANAGER who can edit shifts cannot edit the clock policy. Ruling needed. If kept, use `evaluate` with an explicit-key check so wildcard and deny semantics match rbac.
- m4 `clock.ts:212/352`: `deviceId` (sensitive per R12) is stored for every mobile clock, including sites with `gpsRequired=false`, and the purge never clears it. Either purge it with lat/lng, or record that it is kept.
- m5 `clock.ts:322-331`: every mobile refusal writes an AuditLog row and there is no throttle. A linked employee can flood the audit log. Low risk while the card is unmounted (Q5).
- m6 `clock-settings.ts:230-240`: the read-modify-write of `AppSystem.settings` is serialised only against itself. Any other writer of the HR system's settings JSON could drop `hrClock`. None found in hr/** today.
- m7 notes §9 h0.3 S4.4 cites "bucket spent by S2.x" as the reason, but the deduped text also changed: `actions.ts:344` gives "เพิ่งเข้างานไปเมื่อ", while S4.4 expects `/เพิ่งลงเวลาเข้า/`. See the table.

## ORACLE-EDIT rulings (notes §9)
| request | ruling | reason / covering check |
|---|---|---|
| h2.4 S1.6 drop `imps` from the spread | APPROVE | Oracle bug: `imps` is `""` when clean, so it is falsy and can never pass. `imports: !imps.length` already asserts the intent, and `exists/clock/rules` stay. |
| h2.4 S9.1 10 lanes → 8 | APPROVE | Verified: `P` = the app `prisma` (qc-hr-h2.4.mts:512), same pool as the clock txs. Holder + 10 lanes + poller = 12 > pool 10, so it deadlocks. With 8 lanes, ≥7 still queue on `hr:clock:<emp>` and the 1-row assertion keeps its full force. S9.2 covers cross-path. |
| h2.1 S8.1/S8.4 fixture `published:false` | APPROVE | R4 now links published entries by design, so "published rows don't change judgement" is obsolete. Unpublished rows still freeze the legacy digest. The published path is covered by h2.4 S2.1/S2.3/S2.4/S2.6 + S12.1 (FROZEN_CLOCK). |
| qc-hr-lib fixtures (h2.2 S7.2/S7.3) | APPROVE | Same fixture as the row above, same coverage. |
| h0.3 S4.9 read clock.ts | APPROVE | Intent unchanged. clock.ts:151/222/25 keeps the lock, the tenantDb tx and DEDUPE 60. |
| h0.3 S2.1 n/a | APPROVE | h2.4 S6.3: 10 wrong, then the right PIN is refused with the limited text before compare (stricter per caller than 5/60 s). |
| h0.3 S2.2 n/a | APPROVE | h2.4 S6.2: DB bucket `hr-verifypin:<t>:kiosk:<uid>` counts, and no `hr-kiosk:*` exists. |
| h0.3 S2.4 n/a (cross-process) | APPROVE | `checkRateLimitDb` is DB-backed, and S6.2 reads the row. h0.5 S9.x/S4.7 cover verifyPin. |
| h0.3 S2.5 n/a (system bucket) | **REJECT** | No h2.4 check bounds aggregate kiosk guessing. The replacement (tenant 120/60 s, wrong-only, with each guess covering N employees) is weaker, so this is MAJOR-1(a). Mark n/a only after the controller rules on MAJOR-1, citing h0.5 S4.7/S9.3. |
| h0.3 S4.4 n/a | **MODIFY** | The intent (a double tap at the kiosk action gives 1 IN plus the "already" message) still matters, and no h2.4 check exercises `kioskClockAction`. Keep the check: use a fresh kiosk user (or run it before S2.x) and relax the regex to `/เพิ่ง(ลงเวลา)?เข้า/`. |
| h0.3 S6.4 n/a | **MODIFY** | S6.4 also asserts no in-memory `checkRateLimit` in actions.ts and the `hr-setpin:` limiter, neither related to the kiosk. Drop only `kioskOrder` and the kiosk half of `db`, and add `/kioskClock\(/.test(kiosk)`. Covered by h2.4 S6.6. |
| attendance KI-10 | **MODIFY** | `kioskClock(` alone does not prove a limiter. Also require `/verifyPin\(/` inside `kioskClock` in clock.ts. Covered by h2.4 S6.2/S6.3/S6.6. |
| h1.2 S6.4 exclude clock.ts / clock-rules.ts / clock-actions.ts | APPROVE | These are the first legitimate writers and purgers of the R7 fields. All three really hit (checked). Privacy is asserted by h2.4 S5.1 (exact result keys), S5.7, S5.9, S5.10, S8.1/8.2, S11.1–S11.3. Keep the exact-path regex. Do not widen it to `clock*`. |
| (not mine) h0.5 S6.2/4/5/7 | n/a here | Lane-wrapper issue (child process hard-wired to qc4.sh). pin.ts is untouched. |

## Verified to hold
- **One tap = one row.** `clock()` takes the `hr:clock:<emp>` advisory lock first and then reads the last row and policy through the tx only (clock.ts:151-216). NEXT dedupe returns any row of any kind under 60 s old. Same-kind dedupe for IN applies only within one session, so MINOR-3 is closed (clock.ts:180-185).
- **Roster link.** Candidates are published entries of days D−1..D+1 with `start−earlyIn ≤ now < end`. The nearest start wins; ties go to the started entry, then the smaller id (clock-rules.ts:57-74). OUT and BREAK_* rows inherit the entry and never re-pick. An overnight 22–06 shift gives OUT at 06:05 on D+1 (window + closeGrace). No entry means the legacy weekday judgement and the calendar-day rule, unchanged (Q3). Judgement snapshot fields are unchanged (`judgement/dueMin/lateMin`, `clockInDetail` semantics).
- **Break state machine.** BREAK_START needs OPEN (otherwise bNotIn; while ON_BREAK, bOnBreak). BREAK_END needs ON_BREAK (bNotOn). A double BREAK_START within 60 s dedupes. NEXT never starts a break. Explicit OUT while ON_BREAK is allowed. `rules.workedMinutes` is untouched (FREEZE).
- **Settings.** `earlyInMin`/`closeGraceMin` are 0–240 / 30–720. Bad values in storage fall back to 120/240, so clock never throws on bad settings. The policy is read inside the clock tx. th/en keys were added.
- **POS seam.** `pos-seam.ts` is not in the diff. `clockSelf` still runs `nextClockKind` + `clock` inside the caller tx (`opts.tx` path, clock.ts:219). service.ts re-exports the same function objects. tx 15 s / 20 s is below every caller's maxDuration: no HR page or route sets one, so the platform default applies, and the cron route is 300 s.
- **Kiosk.** callerKey `kiosk:<session user id>` is derived on the server and not read from the form. No `hr-kiosk:*` buckets and no second limiter. Wrong PIN, unknown PIN and other-branch PIN all return `PIN_TEXT.wrong`, identical bytes and counted.
- **Mobile.** No employeeId accepted (`employeeOfUser`). ENDED or inactive gives mInactive. GPS input must be finite numbers, |lat| ≤ 90, |lng| ≤ 180, accuracy ≥ 0 and ≤ minAccuracyM; missing accuracy gives mWeak. The radius comes from the site row: own branch row, else the shop-wide row; disabled, or no centre with GPS required, gives mOff. Coordinates are stored at 6 dp only on GPS sites. Results and refusals carry `distanceM` only. Audit payload is `{code, ids}` with no coordinates. No outbox event.
- **D-F4.** addEntry sets the flag when times differ from the shift (after normalisation). moveEntry clears it on a shift change and otherwise keeps it. Template create defaults to false. Swap/reassign do not touch the times. copyWeek uses the flag only (the createdAt/updatedAt heuristic is gone). Backfill = the old heuristic's outcome, run before normalisation. Migration is additive; enum values are in a separate file. HrAttendance only gains 2 nullable columns (metadata-only on PG ≥ 11). Runbook says migrate first.
- **Shared files.** `scope.ts` adds one marked line (`HrClockSite: sys()`), needed for tenantDb. The cron hunk is one marked, try/caught block. Purge runs in batches of 1 000 and a second run updates 0 rows (idempotent). Nothing else outside the brief list.

## r2 re-check (head 916130358 · `git diff 8dc452a13..916130358 -- src prisma` · read-only, no DB/oracle runs)
**Verdict: FIX FIRST (one line, MEDIUM-r2-1), otherwise MERGE.** R1, R2, R3, R5 and R6 are correct and complete. R4 can attach a session to a shift on another day.

**MEDIUM-r2-1 · R4 adoption reaches a shift on the next day and turns a stray IN into a paid stint** · `clock.ts:105,143-147` (`ADOPT_BEFORE_MIN = 360`, `rosterPick(…, inAt, 360)` over D−1..D+1)
- Scenario: there is a stray or forgotten unlinked IN at 20:00 on day D. The employee's published entry is D+1 01:00–09:00.
- 20:00 ≥ 01:00 − 6 h, so the entry is adopted. At 00:55 on D+1, the employee's arrival NEXT gives OUT, linked to the D+1 entry.
- Result: a 4 h 55 m IN→OUT pair that `rules.workedMinutes` (FREEZE) pays. The real IN for the shift needs a second tap, and a second tap within 60 s is deduped.
- Under the calendar rule (and in r1) the 20:00 IN stayed unpaired, which counts 0 minutes, and the 00:55 tap was an IN.
- Adoption only changes the result when the calendar rule says CLOSED, which means after midnight. So the cases the notes list are not affected by a fix: S13.3, 6c, 6e and the overnight 22–06 shift all have the entry start on the same Bangkok day as the IN.
- Smallest fix: adopt only when `bkkDayKey(window.start) === bkkDayKey(inAt)`, as an extra filter on the adopt candidates. Add a vector to S13.3: IN 20:00 D plus a D+1 01:00 entry ⇒ NEXT 00:55 = IN.
- Another person's shift is impossible: `rosterPick` filters on `employeeId` and `publishedAt`, and step 2 re-checks `e.employeeId === employeeId` plus the IN-inside-window condition.

**Kiosk limiter accounting (R1/R2) — holds**
- `pinGate` counts in a fixed order, each bucket checked before any lookup: caller `hr-verifypin:<t>:kiosk:<uid>:<emp>` 10/10 min, then the tenant bucket 120/60 s, then the shop bucket `hr-kiosk-shop:<t>:<sys>` 60/60 s.
- On refusal, every bucket counted so far is refunded. Right PIN and no-pepper release all three. A throw releases all three.
- Wrong PIN, unknown name, inactive or other-system employee, and out-of-scope name are all counted, with identical "PIN ไม่ถูกต้อง" text. The out-of-scope case also runs a dummy hash compare.
- The callerKey is built on the server from the session user plus the chosen name. Neither the shop key nor the scope comes from the form; scope is `hrScopeOf(memberOf(auth))`, the same set as the name list.
- Bypass: rotating names gives fresh per-name buckets, but the shop bucket caps the aggregate at 60/60 s, which is the D7b budget. Per name, 10/10 min is stricter than the old 5/60 s.
- Cheap lockout: locking colleague X takes 10 wrong PINs on X at that kiosk and lasts up to 10 min (old: 5 wrong, 60 s). X can still clock at another kiosk or on mobile. The whole-kiosk lockout needs 60 wrong in 60 s, the same as before. This is accepted by R1's per-name rule. Not a finding.
- S2.5 was left unedited and the shop bucket answers it. S2.1/S2.2/S2.4 n/a, S4.9, S6.4 and KI-10 were edited as ruled.
- MINOR r2-a: kiosk wrong PINs also consume `hr-verifypin:<t>`, the POS C-8 tenant budget (by design per S6.8). The comment at `pin.ts:419` says the opposite. One HR system can use at most 60 of the 120; a tenant with 2 or more HR systems can exhaust POS PIN checks for 60 s. Fix the comment, and record a debt if multi-system tenants matter.
- MINOR r2-b: the `hr.pin.locked` audit payload now carries the employee id inside `callerKey`. The H0.5 comment says the payload has no employee id. Acceptable in the audit log, but update the comment or the contract.
- MINOR r2-c: a forged `employeeId` with characters outside `CALLER_KEY_RE`, or a key longer than 128 characters, gets "wrong" without being counted. Not exploitable: no PIN is ever compared. It only differs from R2's "counted" wording.

**R3 unlink — holds**
- `moveEntry` (to another day: all rows; to another person: other people's rows) and `reassignEntriesInTx` (other people's rows) run inside the move's own tx and under the roster lock.
- Rows are kept; only `rosterEntryId` is set to null. The judgement snapshot (`judgement/dueMin/lateMin`) stays on the row, so H2.5 keeps the IN-time facts.
- A still-valid session is not orphaned. A same-day open session that loses its link falls back to adoption, else the calendar rule, and stays OPEN on the same day. Past entries cannot be moved (`roster.ts:494`).
- MINOR r2-d: `clock()` does not take the roster lock (S9.3). An IN that picks the entry concurrently with a move can still commit a stale link. `sessionOf` step 2 guards against it, but H2.5 must apply the same check (same employee, IN inside the window) rather than trust `rosterEntryId`. Add this to D-H24-adopt.

**R5 / R6 — hold**
- `deviceId` is stored only for GPS sites (`clock.ts:394`) and is nulled together with lat/lng.
- In `000002`, both partial-index predicates are implied by the purge WHERE clauses (deviceId is included in the geo one). `IF NOT EXISTS` plus the CONCURRENTLY runbook note is correct for a large table.

**Unchanged / no regression seen**
- `pos-seam.ts`, `clock-rules.ts`, the migrations `000000`/`000001`, the settings files and the cron hunk are untouched since r1.
- The dedupe message is back to "เพิ่งลงเวลาเข้า/ออก".
- Name list = `kioskRoster(hrScopeOf)`, the same scope as the action.
- Not verified: oracle and DB results (S6.x, S13.x green counts), typecheck, and the KioskClock.tsx UI and the th/en messages beyond the keys.

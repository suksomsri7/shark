# H2.4 — Clock v2: roster-aware next kind (D13b) · mobile self clock + GPS radius per branch (HQ27) · kiosk v2 on `verifyPin` · break in/out · brief for oracle writer → builder

> Status: **DRAFT — defaults (§8) in force unless the controller overrules.** Lane A · **Mig** (`20261228000000_hr_clock_v2` + `20261228000001_hr_clock_break_kinds`) · hunter required (PIN · GPS · race · PDPA). Deps H0.5 (verifyPin) · H2.1 (roster) — both in `session/hr` d505755d8 (H2.3 merged too). Branch `wip/hr-h2.4` (lane DB via `scripts/qc-hr.sh`, not qc4.sh). Oracle `scripts/qc-hr-h2.4.mts` · notes `ledger/wo-notes/hr-H2.4.md` (TEMPLATE-hr).
> Read: COMMON §A/§C/§F/§G · DESIGN §E3 + §9 #2 · REVIEW #12, #16, D13 · HQ27, HQ28 · mockups 04A (method/break columns, "GPS รัศมี 150 ม.", kiosk "PIN 4 หลัก"), 07(ก) ("GPS ✓ ในรัศมีร้าน (ห่าง 35 ม. · รัศมี 100 ม.)") · debts: `hr-H1.2.md` §10 F5, `hr-H2.1.md` D1/D-F4, `hr-SYNC-review.md` MINOR-3.

## 1. Facts as built (d505755d8)
F1 `service.ts:431` `clock(ctx, {employeeId, kind, note, requireActive}, {tx?})` — lock `hr:clock:<emp>`, dedupe 60 s, judges IN vs `HrWorkSchedule`, `new Date()` inside, writes no `source/rosterEntryId/geo`. `kindAfter` :486 = "IN since Bangkok 00:00 ⇒ OUT" ⇒ **D13b**: OUT at 02:00 after a 22–06 shift is stored as IN of the next day. `nextClockKind` :501 same rule.
F2 `pos-seam.ts` `clockSelf` (frozen) = `nextClockKind` then `clock` in POS's tx (`opts.tx` only).
F3 MINOR-3: IN 23:59:40 + POS IN 00:00:10 ⇒ deduped onto yesterday's IN, no row.
F4 `kioskClockAction` (`actions.ts:328`) = name-pick + own buckets `hr-kiosk:emp|sys:*` + `verifyPinForEmployee`. `verifyPin` (`pin.ts:188`) = H0.5 buckets `hr-verifypin:<t>:<callerKey>` 10/10 min + `hr-verifypin:<t>` 120/60 s (wrong only), `unitId`/`systemId` filters.
F5 `HrAttendanceKind {IN, OUT}`; `HrAttendance` has H1.2 `rosterEntryId (SetNull) source lat lng accuracyM photoKey deviceId` (all null); no geofence storage; `copyTimesOf` (`roster.ts:601`) = createdAt heuristic (D-F4).
F6 `time-rules.ts`: `rosterDayOf` tie-break = closest start (05:50 OUT after 22–06 ⇒ 06:00 entry) · 16:00–24:00 has two encodings (`1440/false` ≡ `0/true`).
F7 `rules.ts` `workedMinutes` FREEZE (IN/OUT only). fitness-hr F16.1 flags `lat`/`lng`/`photoKey` in hr client files.

## 2. Contract (proposed)
R1 **`hr/clock.ts` (new)** owns `clock`, `nextClockKind`, `clockWithPin`, `ClockOutcome`, `ClockRefusedError`, `CLOCK_DEDUPE_SEC`; `service.ts` re-exports the same names (identity: `service.clock === clock.clock`) so `pos-seam.ts`, `actions.ts`, oracles keep importing from `./service`. **`pos-seam.ts` unchanged** (Q2). Every function gains `opts.now?: Date` (server/oracle only — no action/page/seam passes it; static check). Caller tx or `tenantDb(ctx).$transaction` only; markers `// HR H2.4 ▸ … ◂`.
R2 **`hr/clock-rules.ts` (new, pure, no DB, no argument-less `new Date()`):** `CLOCK_RULES {EARLY_IN_MIN:120, CLOSE_GRACE_MIN:240, GEO_KEEP_DAYS:30, PHOTO_KEEP_DAYS:90}` · `distanceM(a,b)` haversine (R 6 371 008.8 m, integer, round half up) · `pickRosterEntry(kind, at, cands, {earlyMin})` · `sessionState(last, lastWindow, now)` → `CLOSED|OPEN|ON_BREAK` · `nextKindOf(state)` · `normalizeShiftTimes(t)` (canonical midnight = `endMin 1440, crossesMidnight false`) · `workedMinutesWithBreaks(events)` (new; `rules.workedMinutes` untouched).
R3 **Session + next kind (D13b).** State from the employee's last row (any kind): last ∈ {IN, BREAK_END} ⇒ OPEN; BREAK_START ⇒ ON_BREAK; OUT/none ⇒ CLOSED. An OPEN/ON_BREAK session expires (⇒ CLOSED): (a) last row linked to a roster entry ⇒ when `now ≥ window.end + CLOSE_GRACE_MIN`; (b) not linked ⇒ legacy rule, open only while last.at ≥ Bangkok 00:00 of `now` (keeps `qc-hr-attendance` + FROZEN_CLOCK K1–K3). `NEXT`: CLOSED→IN · OPEN→OUT · ON_BREAK→BREAK_END (NEXT never starts a break). OUT, BREAK_START, BREAK_END rows copy `rosterEntryId` of the session's IN.
R4 **Roster link on IN.** Candidates = this employee's published entries (`publishedAt` not null) of days D−1, D, D+1 (Bangkok day of `now`) with `start − EARLY_IN_MIN ≤ now < end`. Pick min |now − start|; tie ⇒ the one with now ≥ start; then smaller id (closes the H1.2 tie-break debt: OUT never re-picks, it inherits). Linked IN ⇒ `rosterEntryId`, `dueMin = entry.startMin`, judgement vs `HrShift.graceMin` with `clockInDetail` semantics (LATE iff minutes after start > grace; `lateMin` = minutes after start, 0 when on time). No candidate ⇒ legacy `HrWorkSchedule` judgement unchanged (H2.5 owns "roster day off/absent").
R5 **Dedupe (MINOR-3).** A same-kind row < 60 s old dedupes only inside the same session (same `rosterEntryId`, or both unlinked and same Bangkok day). NEXT keeps "any kind < 60 s ⇒ return it".
R6 **Breaks.** Enum `HrAttendanceKind` += `BREAK_START`, `BREAK_END` (own migration file). Explicit BREAK_START needs OPEN; BREAK_END needs ON_BREAK; OUT while ON_BREAK allowed (break ends at OUT). Manager on-behalf `clockAction` stays IN/OUT only. Kind readers (`attendanceMarks`, `monthlyAttendance`, list) must not throw on break rows.
R7 **Sources.** clock input gains `source?: HrClockSource`, `deviceId?`; kiosk ⇒ KIOSK, mobile ⇒ MOBILE, `clockAction` ⇒ MANAGER, seam (no source) ⇒ null (Q2).
R8 **Mobile self clock** `mobileClock(actor {tenantId,userId}, input {kind: "NEXT"|"BREAK_START"|"BREAK_END", latitude?, longitude?, accuracyM?, deviceId?}, opts) (not `lat/lng`: F16.1)` — never accepts an employee id (COMMON §C.7; posted `employeeId` ignored). Employee = `employeeOfUser`; unit of the day = H1.1 `unitTargetOf`. Site = `HrClockSite` of that unit, else the shop-wide site (unitId null). Order: employee → site enabled → GPS parse → accuracy → radius → `clock(...)`. Success stores `lat/lng` (6 dp), `accuracyM`, `distanceM`, `inRadius=true`, `source MOBILE`; returns `{ok, kind, at, judgement, lateMin, deduped, distanceM}`. Site with `gpsRequired=false` ⇒ coordinates ignored and **not stored**. Refusal ⇒ no row; audit `hr.clock.mobile_refused` `{code}` only. `myClockState(actor, opts)` → `{ok, state, next, canBreak, entry {date,startMin,endMin,crossesMidnight,shiftName}|null, site {gpsRequired,radiusM}|null}` (exact keys).
R9 **Kiosk v2** `kioskClock(ctx, {pin, callerKey, unitId?, kind?: "NEXT"|"BREAK_START"}, opts)` = `verifyPin({tenantId, pin, callerKey, unitId, systemId: ctx.systemId})` → `clock(... source KIOSK, requireActive)`. **No second limiter:** `kioskClockAction` drops `hr-kiosk:*` buckets for this path; callerKey = `kiosk:<userId>` (account of the kiosk session); unitId = the kiosk account's only unit when `unitAccess` has exactly one, else null. `KioskClock.tsx`: PIN pad only, "ลงเวลา" + "เริ่มพัก", testids `hr-kiosk-pin|submit|break`. `clockWithPin` stays (legacy oracles).
R10 **Geofence settings** `hr/clock-settings.ts` (new): `HrClockSite {id, tenantId, systemId, unitId?, mobileEnabled false, gpsRequired true, centerLat/centerLng Decimal(9,6)?, radiusM 150, minAccuracyM 100, photoRequired false, noticeAcceptedAt?, noticeAcceptedById?, createdAt, updatedAt}`; partial uniques `(systemId, unitId) WHERE unitId IS NOT NULL` + `(systemId) WHERE unitId IS NULL` (raw SQL). Column names `centerLat/centerLng` (shop location, not personal — closes the F16.1 generic-name debt without baselining). `listClockSites(ctx, viewer)` / `saveClockSite(ctx, viewer, input)` — `canManageHrSettings` + H1.2 `scopeRefusal`. First `mobileEnabled=true` on a site with `noticeAcceptedAt` null needs `acceptPdpaNotice: true` (sets `noticeAcceptedAt/ById`, audit `hr.clock.notice_accepted`). UI: settings page section, testids `hr-clock-site-<unitId|all>`.
R11 **Retention (HQ27)** `purgeClockPrivacy({now, tenantId?})`: rows with `at < now − 30 d` ⇒ `lat/lng/accuracyM = null` (keeps `distanceM`, `inRadius`); `at < now − 90 d` ⇒ `photoKey = null`; batches ≤ 1 000, idempotent, returns counts. Hook = one marked hunk in `src/app/api/cron/hourly/route.ts` (Q6).
R12 **Privacy.** `lat/lng/accuracyM/photoKey/deviceId` never leave the server (DTO, RSC, action return, event, AI). `distanceM/inRadius/source` visible to: owner · roster managers in scope (`hr.employee.create`) · the employee themself (`myClockState`/result). Not to: payroll-only viewer, mgr-role-only, plain member, colleagues, other tenant. `listAttendance` keys unchanged ⊇ no sensitive key. No new outbox event (Q9).
R13 **D-F4.** `HrRosterEntry.timesOverridden Boolean @default(false)`. `addEntry` explicit times ≠ shift ⇒ true; `moveEntry` shift change ⇒ false else kept; template ⇒ false; swap ⇒ kept. `copyWeek`: source `timesOverridden` ⇒ copy its times + flag, else current shift times (createdAt heuristic removed). Backfill (in the migration): `true` where row times ≠ shift's current times **and** `row.createdAt ≥ shift.updatedAt`, else false (= today's outcome; `qc-hr-h2.1` S3.1/S9.4/S9.5 stay green).
R14 **Midnight encoding.** Writers (`settings.createShift/updateShift`, `addEntry` override) store the canonical form via `normalizeShiftTimes`; the migration rewrites `endMin 0 ∧ crossesMidnight` rows of `HrShift`/`HrRosterEntry` to `1440/false` (pre-check SQL in notes).

### Fixed texts (byte-exact · who sees each)
| key | text | seen by |
|---|---|---|
| mNoEmp | บัญชีของคุณยังไม่ได้ผูกกับรายชื่อพนักงาน — ลงเวลาที่เครื่องหน้าร้าน หรือขอให้ผู้ดูแลผูกบัญชี | the employee (mobile) |
| mInactive | สถานะพนักงานของคุณปิดอยู่ — ติดต่อผู้จัดการ | the employee (mobile) |
| mOff | สาขานี้ยังไม่เปิดให้ลงเวลาด้วยมือถือ — ลงเวลาที่เครื่องหน้าร้าน | the employee (no site / disabled / no centre) |
| mNoGps | เปิดตำแหน่ง (GPS) ของมือถือก่อน แล้วลองใหม่ | the employee |
| mBadGps | อ่านตำแหน่งไม่ได้ — ลองใหม่อีกครั้ง | the employee (malformed / out of range / NaN) |
| mWeak | สัญญาณ GPS ยังไม่แม่นพอ — ออกไปที่โล่งแล้วลองใหม่ | the employee |
| mOutside | คุณอยู่นอกรัศมีของร้าน — เข้าใกล้ร้านแล้วลองใหม่ | the employee (+ `distanceM` field) |
| bNotIn | ยังไม่ได้ลงเวลาเข้างาน — เริ่มพักไม่ได้ | person clocking (mobile / kiosk) |
| bOnBreak | กำลังพักอยู่ — กด "กลับจากพัก" เมื่อพร้อม | person clocking |
| bNotOn | ยังไม่ได้เริ่มพัก | person clocking |
| sNotice | เปิดลงเวลาด้วยมือถือครั้งแรก ต้องยืนยันว่าได้แจ้งพนักงานเรื่องการเก็บตำแหน่งแล้ว (PDPA) | settings editor |
| sCenter | ตั้งตำแหน่งร้าน (ละติจูด/ลองจิจูด) ก่อนเปิดลงเวลาด้วยมือถือ | settings editor |
| sRadius | รัศมีต้องอยู่ระหว่าง 30 ถึง 2,000 เมตร | settings editor |
| sAcc | ความแม่นยำขั้นต่ำต้องอยู่ระหว่าง 10 ถึง 500 เมตร | settings editor |
| sPhoto | การถ่ายรูปตอนลงเวลายังไม่เปิดให้ใช้ | settings editor (Q4) |
Reused: `PIN_TEXT.wrong/notConfigured` + limiter text (kiosk person) · `SETTINGS_TEXT.noPermission/otherUnit/shopWide` (editor) · "ไม่พบพนักงาน" (manager). No text names another person or carries an id/coordinate.

## 3. Files (≤ list + oracle/notes/ledger)
New: `hr/clock.ts` · `clock-rules.ts` · `clock-settings.ts` · `clock-actions.ts` (`mobileClockAction`, `myClockStateAction`; "use server", no DB) · `MobileClock.tsx` (not mounted, Q5) · 2 migrations. Edited: `hr.prisma` · `service.ts` (move + re-export) · `actions.ts` · `KioskClock.tsx` · `ui.tsx` · `roster.ts` · `settings.ts` · `settings-actions.ts` + settings page · `cron/hourly/route.ts` · `messages/{th,en}.json` · `hr-ui-inventory.json`.

## 4. Oracle `scripts/qc-hr-h2.4.mts` — groups (ids `H2.4-<g>.<n>`)
S1 pure vectors · S2 roster NEXT/D13b/judgement/tie-break · S3 dedupe MINOR-3 + seam · S4 breaks · S5 mobile GPS · S6 kiosk v2 · S7 settings/notice/viewer matrix · S8 retention · S9 races (holder on `hr:clock:<emp>`) · S10 migration · S11 privacy · S12 frozen · Z1 residue. Check list + counts: `ledger/wo-notes/hr-H2.4-oracle.md`. Time injected via `opts.now`; roster fixtures in 2031 written raw.

## 5. Builder order
migration (diff → read → lane DB via `qc-hr.sh`) → clock-rules → clock (move + R3–R9) → re-export → roster/settings hunks → clock-settings → actions/UI → cron → oracle ×3 → picker suites (incl. `qc-hr-attendance`, `qc-hr-h0.3/h0.5/h1.2/h2.1/h2.3`) → fitness ± env → typecheck once.

## 6. Acceptance
Oracle green ×3 · picker suites green · `qc-hr-h2.1` green · fitness ± env · typecheck 0 · reviewer + hunter.

## 7. Runbook
**Migrate first, then deploy.** Pre-check counts in notes (midnight-encoded rows, override candidates). 000000 = columns, `HrClockSite`, partial uniques, backfill, normalise · 000001 = enum values. Mobile clock starts **off** (no site rows); owner enables per branch (notice). Kiosk = PIN only — tell shops. Rollback: old code ignores new columns/enum values.

## 8. Open questions (default in brackets — in force)
Q1 Session close grace / early-IN window [240 / 120 min, constants in `clock-rules.ts`, not settings].
Q2 `pos-seam.ts` untouched, POS rows `source` null [yes; a one-line `source: "POS"` later via the POS lane].
Q3 Unrostered employees keep the calendar-day rule (D13b stays for them) [yes — roster is the fix; H2.5 may tighten].
Q4 Photo capture [deferred: `photoRequired` can only be false (sPhoto); retention for photoKey ships anyway].
Q5 Where staff see the mobile button before H2.10 [component + actions ship, not mounted; H2.10 mounts in "ของฉัน"; visual 390 in H2.10].
Q6 Retention hook in the hourly cron [yes, one marked hunk].
Q7 Plausible forged coordinates are undetectable [accepted; accuracy + radius only].
Q8 Kiosk drops name-pick [yes; PIN unique per tenant (H0.5) identifies the person].
Q9 Events [none in H2.4; H2.5 adds late/absent].
Q10 POS `workedMinutesBetween` subtracts breaks [no — `rules.ts` FREEZE; H2.5 uses `workedMinutesWithBreaks`].
Q11 Employee PDPA notice [a UI line on the mobile card; no per-employee acceptance column].

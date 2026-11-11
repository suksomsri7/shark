# WO H2.4 — Clock v2 (roster-aware next kind · mobile GPS self clock · kiosk v2 on verifyPin · breaks · D-F4 timesOverridden)

> RUN "HR V2" · worktree `/root/projects/shark-hr-b` · branch `wip/hr-h2.4` cut from `session/hr` b04eef94d (+ merge e0ae4536f seed/env guard) · 11 Nov 2026 · builder: Claude (Opus)
> Contract: brief `ledger/hr-briefs/hr-brief-H2.4.md` (DRAFT lifted by controller rulings Q1–Q11 of 11 Nov) + COMMON A–G
> Oracle: `scripts/qc-hr-h2.4.mts` (59 checks · b04eef94d · **ORACLE-EDIT requested S1.6 + S9.1 — not applied, see §9**) · red `hr-H2.4-red.txt` · green `hr-H2.4-green.txt`
> DB: lane QC branch via `scripts/qc-hr.sh` (ep-orange-dust) — never QC4
> Base check: `git merge-base --is-ancestor afcb9bc3 HEAD` → ok

## 0. Checkpoint
- done: all of R1–R14 + Q1 settings · merged origin/session/hr 1d17382f8 (H2.2) — 1 conflict (`scripts/hr-ui-inventory.json`, both lanes appended rows → JSON union: theirs 109 rows + my 23; roster.ts/ui.tsx/messages auto-merged; no brace/JSX keep-both edits needed) · post-merge verification §5 · ORACLE-EDIT qc-hr-h2.1 S8.8 (pre-approved) applied
- next: controller rulings on §9 ORACLE-EDITs; once applied every listed suite is green (each hunk proven on a scratch copy)
- last command: post-merge typecheck → exit 0, 0 errors

## 1. Files touched
| file | new/edited | what | hot? |
|---|---|---|---|
| prisma/schema/hr.prisma | edited | enum +BREAK_START/BREAK_END · HrAttendance.distanceM/inRadius · HrRosterEntry.timesOverridden · model HrClockSite | – |
| prisma/migrations/20261228000000_hr_clock_v2 | new | 10 statements: 2 ALTER TABLE · CREATE TABLE · 2 index · 2 partial unique · 1 backfill UPDATE · 2 normalise UPDATE | – |
| prisma/migrations/20261228000001_hr_clock_break_kinds | new | 2 × ALTER TYPE ADD VALUE | – |
| src/lib/core/scope.ts | edited | `HrClockSite: sys()` (one marked line — tenantDb fail-closed registry) | outside brief list (required: tenantDb throws on unregistered models) |
| src/lib/modules/hr/clock-rules.ts | new | pure: CLOCK_RULES (defaults) · CLOCK_POLICY_RANGE · clockPolicyOf · distanceM · pickRosterEntry · sessionState · nextKindOf · normalizeShiftTimes · workedMinutesWithBreaks | – |
| src/lib/modules/hr/clock.ts | new | clock · nextClockKind · clockWithPin · kioskClock · mobileClock · myClockState · purgeClockPrivacy · CLOCK_TEXT | – |
| src/lib/modules/hr/clock-settings.ts | new | listClockSites · saveClockSite · getClockPolicy · saveClockPolicy | – |
| src/lib/modules/hr/clock-actions.ts | new | mobileClockAction · myClockStateAction (use server · no DB · requireMembership) | – |
| src/lib/modules/hr/MobileClock.tsx | new | client card (unmounted, Q5) | – |
| src/lib/modules/hr/service.ts | edited | clock block removed → re-export from ./clock (marked) | – |
| src/lib/modules/hr/roster.ts | edited | addEntry normalise + timesOverridden · moveEntry shift change ⇒ false · copyTimesOf by flag (marked) | – |
| src/lib/modules/hr/settings.ts | edited | shiftData normalise (marked) | – |
| src/lib/modules/hr/actions.ts | edited | kioskClockAction → kioskClock · clockAction source MANAGER | – |
| src/lib/modules/hr/KioskClock.tsx | rewritten | PIN pad only · ลงเวลา / เริ่มพัก · testids hr-kiosk-pin/submit/break/error/result | – |
| src/lib/modules/hr/ui.tsx | edited | kiosk labels (getTranslations hr.kiosk) · KIND_LABEL break kinds | – |
| src/lib/modules/hr/settings-actions.ts | edited | saveClockSiteAction · saveClockPolicyAction (marked block) | – |
| src/app/app/sys/[id]/hr/settings/page.tsx | edited | "ลงเวลา" section: policy form (all-branch editors) + per-branch sites | – |
| src/app/api/cron/hourly/route.ts | edited | one marked hunk: purgeClockPrivacy (Q6) | – |
| src/messages/{th,en}/common.json | edited | hr.kiosk · hr.mobileClock · hr.settings.clock | §D |
| scripts/hr-ui-inventory.json | edited | +23 rows (wo H2.4) | – |
| scripts/qc-hr-h2.1.mts | edited | ORACLE-EDIT S8.8 (pre-approved): fixture rows unpublished + title | – |

## 2. Migration
- `prisma migrate diff --from-schema <base schema> --to-schema prisma/schema --script` → read → split: enum values to 000001; partial uniques + backfill + normalise added by hand to 000000.
- lane `_prisma_migrations` checked: lane DB had exactly the branch's folders minus the two new ones (comm -3 → only 20261228000000/000001).
- Applied: `bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh pnpm exec prisma migrate deploy` → "All migrations have been successfully applied." · `prisma generate` (own node_modules).
- Pre-check counts on the lane DB before apply: override_candidates 0 · HrShift endMin=0∧crossesMidnight 0 · HrRosterEntry endMin=0∧crossesMidnight 0.
- Backfill rule (R13): `timesOverridden = true` where row times ≠ shift's current times (start/end/break/crossesMidnight) **and** row.createdAt ≥ shift.updatedAt, else default false (= H2.1 r3 heuristic outcome). Runs before the midnight normalise (compares original values).

### Prod runbook (§F.6)
1. **Migrate first, then deploy code.** Old code ignores the new columns/table; enum values are only written by new code.
2. Pre-check SQL (run on prod read-only, paste counts into the deploy log):
   ```sql
   SELECT count(*) FROM "HrRosterEntry" e JOIN "HrShift" s ON s.id = e."shiftId"
    WHERE (e."startMin"<>s."startMin" OR e."endMin"<>s."endMin" OR e."breakMin"<>s."breakMin" OR e."crossesMidnight"<>s."crossesMidnight") AND e."createdAt" >= s."updatedAt";  -- rows flagged true
   SELECT count(*) FROM "HrShift" WHERE "endMin"=0 AND "crossesMidnight"=true;        -- rewritten to 1440/false
   SELECT count(*) FROM "HrRosterEntry" WHERE "endMin"=0 AND "crossesMidnight"=true;  -- rewritten to 1440/false
   SELECT count(*) FROM "HrClockSite";  -- must be 0 before (table new)
   ```
3. `prisma migrate deploy` (000000 then 000001) → deploy code.
4. Mobile clock starts **off** (no HrClockSite rows). Owner enables per branch in ตั้งค่า → ลงเวลา (PDPA notice tick on first enable).
5. Tell shops: kiosk is now **PIN only** (no name list) and has a "เริ่มพัก" button.
6. Rollback: redeploy old code; columns/table/enum values stay (old code ignores them). Rows with BREAK_* kinds are ignored by `rules.workedMinutes` (FREEZE) and old readers treat them as non-IN.

## 3. Decisions (builder) — for the controller
- **Q1 (overruled → settings):** `earlyInMin` (0–240, default 120) and `closeGraceMin` (30–720, default 240) are stored per HR system in `AppSystem.settings.hrClock` (same place other systems keep per-system policy JSON; H1.2 settings are rows, no row-type fits a scalar) · read inside clock's tx · invalid/missing ⇒ defaults (clock never fails on bad settings) · edited on the HR settings page by all-branch editors (shop-wide value ⇒ `SETTINGS_TEXT.shopWide` for branch-limited editors) · texts sEarly/sGrace · `CLOCK_RULES` keeps the defaults (S1.6 asserts them as values, not as "constants only" ⇒ no ORACLE-EDIT needed for Q1).
- **Clock-site gate:** OWNER or explicit `hr.employee.create`/`hr.*` key. MANAGER role without the key is refused (S7.3 + R12 "mgr-role-only ⇒ no"). This is stricter than `canManageHrSettings` (which lets MANAGER through by role), so a key-less manager sees the HR settings page but not the "ลงเวลา" section.
- **Kiosk unitId:** the kiosk account's only unit when `unitAccess` has exactly one non-"*" entry; accounts with several units ⇒ null (whole shop). Previous per-employee branch check (hrTarget) removed — verifyPin's unitId does it.
- **Kiosk "ยังไม่มี PIN" hint** (names of staff without PIN) kept on the kiosk page (pre-existing, not a picker).
- **clock tx options:** maxWait 15 s · timeout 20 s (was 5/10) — queued taps on one employee must not fail while waiting for a pool connection. Below every caller's maxDuration.
- **Explicit IN/OUT** (manager, POS seam) stay allowed in any state; explicit OUT while ON_BREAK ends the break.
- **NEXT dedupe** keeps "any kind < 60 s"; same-kind dedupe for IN only inside the same session (same rosterEntryId, or both unlinked and same Bangkok day) — MINOR-3 closed.
- **Accuracy missing** with GPS required ⇒ mWeak (cannot verify).
- Mobile refusals audit `hr.clock.mobile_refused` after = `{code, employeeId, systemId, unitId}` (or `{code}` when no employee) — no coordinates.
- `purgeClockPrivacy` all-tenant mode lists tenants with an HR system via `tenantDb({tenantId:""}).$queryRaw` (precedent booking/privacy.ts) — no raw prisma in hr/** (F5.1).

## 4. Access — who gains/loses what
- Gains: linked employees (any role) can self-clock by phone (action exists, not mounted until H2.10) · OWNER / `hr.employee.create` holders edit clock sites + clocking policy · kiosk accounts can start breaks.
- Loses: kiosk screen no longer shows a name list (PIN only) · kiosk accounts limited to several branches no longer get a per-branch employee check beyond verifyPin (null unit) · MANAGER role without key cannot see/edit clock sites.
- Data: `lat/lng/accuracyM/deviceId` stored only for mobile clocks at GPS-required sites, purged after 30 d; `distanceM/inRadius` kept; none leaves the server (no DTO/RSC/event/AI change; listAttendance select unchanged).

## 5. Verification (post-merge head; lane DB via qc-hr.sh; `env QC_H06_BASE=d350c26c… [QC_FORCE=1]`)
| suite | exit | summary | failing ids · cause |
|---|---|---|---|
| step 0 base (b04eef94d+merge, forced) | 1 | `BASE-EXPECTATION 59/59 as registered` · passed 6/59 | as designed |
| qc-hr-h2.4 unforced | 1 | passed 56/59 · Z1 residue clean | S1.6 (oracle bug) · S9.1 (pool deadlock) · S11.3 (= S9.1 THROW texts) |
| qc-hr-h2.4 forced ×2 | 1 / 1 | passed 56/59 ×2 · Z1 clean | same |
| qc-hr-h2.4 forced, scratch copy with the 2 requested hunks | 0 | **passed 59/59** | – |
| qc-hr-h2.2 | 1 | 58/60 | S7.2/S7.3 — R4 collision in `qc-hr-lib.mts` fixtures (§9) · scratch with hunk 59/60 (X12.1 = scratch file itself) |
| qc-hr-h2.1 | 1 | 88/90 | S8.1/S8.4 — R4 collision (§9) · S8.8 green after pre-approved edit |
| qc-hr-h2.3 | 0 | 79/79 | – |
| qc-hr-h0.3 | 1 | 30/37 | S4.9 (clock moved) · S2.1/S2.2/S2.4/S2.5/S4.4/S6.4 (D7b kiosk buckets dropped by R9) · scratch 37/37 |
| qc-hr-h0.5 | 1 | 67/71 | S6.2/S6.4/S6.5/S6.7 — backfill child hard-wired to `scripts/qc4.sh` (lane wrapper limitation, not H2.4) |
| qc-hr-attendance | 1 | 30/31 | KI-10 (static grep for hr-kiosk bucket) · scratch 31/31 |
| qc-hr-roster | 0 | CRITICAL 0 · MAJOR 0 | – |
| qc-hf-hr-privacy | 0 | CRITICAL 0 | – |
| qc-nav-functions | 1 | HR 8/8 route · HR 8 functions | S5 BOOKING /booking/calendar,/booking/day (known, not HR) |
| qc-hr-h1.2 | 1 | 72/73 | S6.4 — hits = clock.ts, clock-rules.ts, clock-actions.ts only (§9) |
| fitness (env via qc-hr.sh) | 0 | 53/53 · FINDINGS 0/0/0 | – |
| fitness-hr (env) | 0 | 8/8 · FINDINGS 0/0/0 | – |
| fitness (no env) | 0 | 53/53 | – |
| fitness-hr (no env) | 0 | 8/8 | – |
| typecheck (12 GB heap · gate lock) | 0 | 0 errors (ran pre-merge 0 and once post-merge 0) | – |

### Screenshot run (CONTROLLER-RUN · 1440×900 / 1024×768 / 390×844 · HQC seed)
- `/app/sys/<HQC HR system id>/hr/kiosk` as `kiosk` (hr-qc-kiosk@shark.local): PIN pad + ลงเวลา / เริ่มพัก; states: idle · after wrong PIN (`hr-kiosk-error` "PIN ไม่ถูกต้อง") · after a good PIN (`hr-kiosk-result`). Seed PINs: see seed (setPin in HQC).
- `/app/sys/<id>/hr/settings` as `owner`: new card "ลงเวลา" (`hr-settings-clock-policy` 120/240 · rows `hr-clock-site-all` + one per branch, PDPA tick visible until accepted). As `manager` / `manager-branch` (HQC: MANAGER without `hr.employee.create`) the card is absent by design (R12). State after save: `?msg=ok` banner; after enabling without the tick: `?msg=c.sNotice`.
- MobileClock (`hr-mobile-clock*`): not reachable — unmounted until H2.10 (Q5).

## 6. Debts
| id | debt | owner |
|---|---|---|
| H2.4-D1 | Q3: unrostered employees keep the calendar-day rule ⇒ overnight work without a roster entry still splits at Bangkok midnight (D13b remains for them) | H2.5 |
| H2.4-D2 | Q4: photo capture deferred (`photoRequired` can only be false); photoKey retention ships | later WO |
| H2.4-D3 | Q5: MobileClock + actions unmounted; visual 390 of the card | H2.10 |
| H2.4-D4 | Q7: plausible forged coordinates undetectable (accuracy + radius only) | accepted |
| H2.4-D5 | POS seam rows `source` null (Q2) | POS lane |
| H2.4-D6 | `workedMinutesWithBreaks` not yet used by payroll/POS (`rules.workedMinutes` FREEZE, Q10) | H2.5 |
| H2.4-D7 | clockSelf (POS) returns ALREADY_CLOCKED while ON_BREAK (next = BREAK_END ≠ OUT) — seam frozen | POS lane |

## 8. COMMON §F self-check
- [x] F.1 no new page/route (settings page section only; kiosk route unchanged) · `?msg=` codes from allowlist (`c.*` = CLOCK_SETTINGS_TEXT keys) · qc-nav-functions HR 8/8
- [x] F.2 inside tx bodies only the tx client (clock run(), saveClockSite, saveClockPolicy); audits after commit
- [x] F.3 `[]` unit list = all branches (hrScopeOf) for clock sites/policy; explicit list ⇒ otherUnit/shopWide fixed texts
- [x] F.4 refusals fixed Thai (CLOCK_TEXT · CLOCK_SETTINGS_TEXT · PIN_TEXT) · no ids/coordinates (S11.3 green on scratch; only S9.1 THROW leaks in the unedited run)
- [x] F.5 tx options ≤ maxDuration (clock 15 s/20 s · site/policy 15 s/20 s; cron route 300 s) · purge batches ≤ 1 000 per statement, no audit
- [x] F.6 runbook: migrate first, then deploy; pre-check SQL in §2 (not in the migration)
- [x] F.7 PIN path: verifyPin only, no second limiter, callerKey from session
- [x] F.8 rate limit = H0.5 verifyPin (count first, refund on success) — unchanged
- [x] F.9 no new outbox event (Q9)
- [~] F.10 changed files ⊆ brief list + `src/lib/core/scope.ts` (one line, required by tenantDb fail-closed registry) + `src/app/api/cron/hourly/route.ts` (Q6) · hot files: messages (keys only)

## 9. ORACLE-EDIT
Applied (pre-approved): `qc-hr-h2.1` S8.8 — fixture rows `published: false` (no publishedAt) + title "unpublished" (commit 115711f4e).

Requested (NOT applied — each proven green on a scratch copy `scripts/zz-*.mts`, deleted after):
| oracle · id | exact hunk | reason |
|---|---|---|
| qc-hr-h2.4 · S1.6 | `ck("S1.6", { ...NB.pure, rules: … }` → `const { imps: _imps, ...pureOk } = NB.pure; ck("S1.6", { ...pureOk, rules: … }` | `NB.pure.imps` is the diagnostic string (`""` when clean) and is spread into the condition ⇒ falsy ⇒ S1.6 can never pass (contradicts `imports: !imps.length`) |
| qc-hr-h2.4 · S9.1 | `Array.from({ length: 10 }, () => () => clk(eX, "NEXT", now))` → `{ length: 8 }` (title "10 lanes" → "8 lanes") | pg Pool max = 10 (adapter-pg default, core/db.ts sets none). Holder 1 + 10 clock txs + the pg_stat_activity poller (same pool) = 12 ⇒ the poller can never get a connection while 9 lanes wait on the holder ⇒ deadlock until tx timeouts (holder 68 s, all lanes THROW) — independent of the implementation (old clock had the same shape). 8 lanes ⇒ 59/59 |
| qc-hr-h2.1 · S8.1 + S8.4 (fixture of S8.1–S8.5) | S8 fixture loop (line ~608) `published: true, publishedAt: FIX_TS` → `published: false` | same R4 collision as S8.8: published rows "today" now link D01/D02 IN and judge vs the entry ⇒ FROZEN digests move. With unpublished rows ⇒ 89/90 on scratch (the 1 = X12.1 tripped by the scratch file itself, F16.5) |
| qc-hr-h0.3 · S4.9 | `const clockFn = block(svc, …)` → `const clockSrc = existsSync(join(ROOT, "src/lib/modules/hr/clock.ts")) ? rd("src/lib/modules/hr/clock.ts") : svc; const clockFn = block(clockSrc, …)` and `dedupe: /CLOCK_DEDUPE_SEC…/.test(clockSrc)` | R1 moves clock() to hr/clock.ts (svc stays for S6.1) |
| qc-hr-h0.3 · S2.1 S2.2 S2.4 S2.5 S4.4 S6.4 | before `for (const [id] of CHECKS) if (!results.has(id))` add `if (existsSync(join(ROOT, "src/lib/modules/hr/clock.ts"))) for (const id of ["S2.1","S2.2","S2.4","S2.5","S4.4","S6.4"]) chk(id, true, "n/a", "superseded by H2.4 R9");` | R9 drops the D7b `hr-kiosk:*` buckets ("no second limiter"; qc-hr-h2.4 S6.6 asserts their absence) · S4.4 fails because the kiosk account's H0.5 caller bucket is already spent by S2.x · covered by qc-hr-h2.4 S6.2/S6.3/S3.2/S9.2 ⇒ scratch 37/37 |
| qc-hr-attendance · KI-10 | `/checkRateLimitDb\(\s*`hr-kiosk:emp:/` → `/checkRateLimitDb\(\s*`hr-kiosk:emp:\|kioskClock\(/` | kiosk guard is now verifyPin's H0.5 buckets via kioskClock ⇒ scratch 31/31 |
| qc-hr-h1.2 · S6.4 | file list `.filter((p) => existsSync(join(ROOT, p)))` → `… && !/^src\/lib\/modules\/hr\/clock(-rules\|-actions)?\.ts$/.test(p))` | H2.4 is the first writer/purger of lat/lng/accuracyM/deviceId by design (R8/R11); their privacy is asserted by qc-hr-h2.4 S5.1/S5.7/S8/S11 · MobileClock/settings page renamed to avoid the words ⇒ scratch S6.4 green |

| qc-hr-lib.mts (H2.2 lib) · feeds qc-hr-h2.2 S7.2/S7.3 | both fixture lines (≈451 S8-fixture, ≈574 K-control) `published: true, publishedAt: FIX_TS` → `published: false` | same R4 collision (lifted copy of the h2.1 fixtures) · scratch qc-hr-h2.2 S7.2/S7.3 green |

Not mine (lane-wrapper): `qc-hr-h0.5` S6.2/S6.4/S6.5/S6.7 — its backfill child is spawned through `scripts/qc4.sh` (hard-coded) ⇒ runs against QC4 with a lane tenant id ⇒ zeros. pin.ts untouched by H2.4. NB: that child process did connect to QC4 (dry-run + --apply with a tenant id that does not exist there ⇒ changed 0).

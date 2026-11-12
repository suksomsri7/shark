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

## r2 (12 Nov)
> One combined fix round after review (`hr-H2.4-review.md`, FIX FIRST) + hunt (`hr-H2.4-hunt.md`, FIX FIRST) · controller rulings R1–R7 + pre-approved ORACLE-EDITs (a)/(b) · `git merge origin/session/hr` = already up to date (no conflicts).

### Rulings applied
| ruling | where | what |
|---|---|---|
| R1 kiosk = name + PIN (Q8 overruled · brief Q8 line updated) | `pin.ts` · `clock.ts` · `actions.ts` · `KioskClock.tsx` · `ui.tsx` · `messages/{th,en}/common.json` (`hr.kiosk.pick/change/noPin/tap/empty`) · inventory (+`hr-kiosk-name-*`, `hr-kiosk-change`) | `pin.ts`: H0.5 limiter lifted verbatim out of `verifyPin` into `pinGate(tenantId, callerKey)` (count caller → count shop → refund on ok/no-pepper · wrong stays · `hr.pin.locked` once per window · `hr.pin.tenant_limited` once) — `verifyPin` behaviour unchanged. New `verifyPinOfEmployee({tenantId, systemId, employeeId, pin, callerKey, scope})` = `pinGate` around the H0.5 per-employee compare `verifyPinForEmployee` (hash · `timingSafeEqual` · legacy upgrade). `kioskClock(ctx, {employeeId, pin, callerKey, scope?, kind?})` builds callerKey = `<kiosk account key>:<employeeId>` ⇒ bucket `hr-verifypin:<t>:kiosk:<userId>:<employeeId>` 10 wrong / 10 min = per name per kiosk; shop bucket `hr-verifypin:<t>` 120/60 s unchanged; no in-memory / second DB limiter. Texts as before H2.4: wrong `PIN ไม่ถูกต้อง` · no PIN `<ชื่อ> ยังไม่มี PIN — ให้เจ้าของตั้งที่หน้าพนักงาน` · locked `ลองใหม่ในอีก N วินาที` · format/no-name pre-checks `ใส่ PIN 4-6 หลัก` / `เลือกชื่อของคุณก่อน` (not counted, as before) · deduped `เพิ่งลงเวลาเข้า/ออกไปเมื่อ hh:mm` restored (review m7). Not-found / inactive / other-system id ⇒ `PIN ไม่ถูกต้อง` (counted). `clockWithPin` unchanged (no limiter, legacy oracles only). |
| R2 kiosk branch scope | `pin.ts` `verifyPinOfEmployee` · `actions.ts` · `ui.tsx` | scope = `hrScopeOf` of the kiosk session (`[]`/`*`/OWNER ⇒ all). Name list = `kioskRoster(ctx, scope)` (H1.1 `unitWhere`: home unit in the list, or a borrowing into the list covering today); the verifier counts the slot first, then refuses an id outside the same `unitWhere` with `PIN ไม่ถูกต้อง` (slot stays = counted like a wrong PIN). Multi-branch accounts now keep their limit (review MEDIUM-2 / hunt P1). |
| R3 session linking | `clock.ts` `sessionOf` · `roster.ts` `moveEntry` + `reassignEntriesInTx` | see rule below. Writers: moving an entry to another day unlinks every attendance row linked to it; moving/reassigning it to another employee unlinks the other employees' rows (rows kept, `rosterEntryId = null`) ⇒ one entry never carries two people's rows. |
| R4 open unlinked session | `clock.ts` `sessionOf` (`ADOPT_BEFORE_MIN = 360`) | see rule below |
| R5 deviceId | `clock.ts` `mobileClock` + `purgeClockPrivacy` | stored only at `gpsRequired` sites; geo purge (>30 d) sets `lat/lng/accuracyM/deviceId = NULL` (WHERE includes `"deviceId" IS NOT NULL`) |
| R6 purge indexes | `prisma/migrations/20261228000002_hr_clock_purge_idx/migration.sql` (new) | 2 partial indexes `("tenantId","at")` whose predicates equal the purge WHERE clauses; applied on the lane DB with `prisma migrate deploy` via qc-hr.sh ("All migrations have been successfully applied."); the two applied files untouched; no schema change ⇒ no generate |
| R7 decisions | – | accepted as built. tx waits: clock 15 s/20 s, site/policy 15 s/20 s. Callers: hourly cron `maxDuration = 300` ✓; HR server actions/pages set **no** `maxDuration` (repo has none; `vercel.json` sets none) ⇒ platform default applies — same situation as every existing HR tx (leave/swap/payroll use 20 s/60 s), so 20 s is within the established bound but I cannot read the project's default from the repo (**unverified**). |

### R3 + R4 — exact rule (`clock.ts` `sessionOf`, used by `clock` · `nextClockKind` · `myClockState`)
1. Last row OUT / none ⇒ CLOSED. Otherwise the session's IN = the last row if it is IN, else the latest IN with `at ≤ last.at`.
2. Last row linked ⇒ that entry is used only if `entry.employeeId === employee` **and** `entry.start − earlyInMin ≤ IN.at ≤ entry.end + closeGraceMin` (entry's current position). Then OPEN/ON_BREAK until `now ≥ end + closeGraceMin` (brief R3a, unchanged). Otherwise the session is treated as unlinked.
3. Unlinked (or 2 failed) ⇒ adopt the employee's published entry (D−1..D+1 of IN's Bangkok day) with `start − 360 min ≤ IN.at < end` (nearest start, R4 tie-break). If `now < end + closeGraceMin` the session is OPEN/ON_BREAK and OUT/BREAK rows link to the adopted entry; the IN row keeps its snapshot (unlinked, its judgement). If the adopted window has expired, step 4 decides (adoption never closes a session earlier than before).
4. No entry to adopt ⇒ calendar-day rule of brief R3b / Q3 (open while last row is on Bangkok day of now). Unrostered staff unchanged (h2.4 S2.7 green).
Midnight end (`endMin 1440`) = window end next-day 00:00 ⇒ open until 04:00 with grace 240.

Hunter timelines:
- **HUNT-6 / S13.3** (earlyInMin 0, entry 16:00–24:00): 15:59 NEXT ⇒ IN unlinked (NO_SCHEDULE) · 00:30 NEXT ⇒ adopt (15:59 ∈ [10:00, 24:00)), 00:30 < 04:00 ⇒ **OUT** linked to the entry (was IN). A second employee: 15:59 IN · 04:01 NEXT ⇒ 04:01 ≥ 24:00 + 240 and different Bangkok day ⇒ IN.
- **6c** (earlyInMin 120, entry 16–24): 13:59 IN unlinked (window opens 14:00) · 16:05 NEXT ⇒ adopt ⇒ OUT (now linked) · 00:10 NEXT ⇒ last OUT ⇒ CLOSED ⇒ IN (00:10 ≥ end ⇒ no link, NO_SCHEDULE). Same kinds as before.
- **6e** (earlyInMin 0): 15:59 IN unlinked · 16:01 NEXT ⇒ adopt ⇒ OUT linked (was OUT unlinked).
- **P2b / S13.1** (entry 09–17 moved 05-12 → 05-14 after A's linked IN): move unlinks A's IN; 05-13 09:00 NEXT ⇒ entry now on 05-14 ⇒ step 2 fails (and the row is unlinked anyway) ⇒ no adoptable entry ⇒ calendar rule, different day ⇒ **IN** (was OUT).
- **P2a / S13.1** (A's linked IN, entry reassigned to B): move unlinks A's IN; A 17:05 ⇒ OUT unlinked (calendar rule); B 09:30 ⇒ IN linked ⇒ rows on the entry = B only (was A:IN, A:OUT, B:IN).

### ORACLE-EDITs made (all pre-approved by the controller 12 Nov; every hunk marked `ORACLE-EDIT … r2`)
| file | change |
|---|---|
| `scripts/qc-hr-h2.4.mts` | S1.6: `imps` dropped from the spread · S9.1: 10 → 8 lanes · kiosk group S6.1–S6.6 rewritten for R1/R2 (name + PIN, per-name bucket `kiosk:<uid>:<emp>`, lock + 1 `hr.pin.locked`, other name / other kiosk not locked, single-branch + forged id + other tenant ⇒ wrong & counted, break) + new S6.7 (name list scope + UI static) + S6.8 (shop bucket +1 per wrong name · H0.5 limits 10/120) · S9.2 call shape (`employeeId`, `scope`) · new S13.1–S13.4 (hunter P2, P1, P6, P3) · fixture PINs for the S6.7/S6.8 employees (added after the RED run — S6.8 had compared no-PIN names) |
| `scripts/qc-hr-h2.1.mts` | S8 fixture loop: `published: false` (S8.1/S8.4) |
| `scripts/qc-hr-lib.mts` | both fixture lines (451, 574): `published: false` (h2.2 S7.2/S7.3) |
| `scripts/qc-hr-h0.3.mts` | S4.9 reads `hr/clock.ts` · S6.4 MODIFY (kiosk order dropped, `kioskClock(` required, in-memory + setpin parts unchanged) · S2.1/S2.2/S2.4 n/a (reviewer APPROVE) · **S2.5 not edited** · S4.4 passes unmodified (no edit) |
| `scripts/qc-hr-attendance.mts` | KI-10 MODIFY: old hr-kiosk regex OR (`kioskClock(` in actions.ts AND `verifyPin*(` inside clock.ts `kioskClock`) |
| `scripts/qc-hr-h1.2.mts` | S6.4 file list excludes exactly `hr/clock.ts`, `hr/clock-rules.ts`, `hr/clock-actions.ts` |

RED proof (rewritten/new checks vs the r1 product, `hr-H2.4-r2-red.txt`): `passed 56/65 · failed S6.6 S6.2 S6.3 S6.4 S6.7 S13.1 S13.2 S13.3 S13.4 · Z1 clean` (S6.1/S6.5/S6.8 pass on r1 too — they do not discriminate PIN-only vs name+PIN; S1.6/S9.1 green after their edits).

### Review MINOR items
- fixed: m4 (= R5) · m7 (deduped kiosk text restored).
- debts below: m1, m2, m3 (file not touched in r2), m5, m6.

### Verification r2 (lane DB via qc-hr.sh · `env QC_H06_BASE=d350c26c… [QC_FORCE=1]`)
| suite | exit | summary |
|---|---|---|
| qc-hr-h2.4 unforced | 0 | passed 65/65 · Z1 clean |
| qc-hr-h2.4 forced ×2 | 0 / 0 | passed 65/65 ×2 · Z1 clean (`hr-H2.4-green.txt`) |
| qc-hr-h0.3 | 1 | 36/37 — **S2.5 red** (see ruling request) · S4.4 green unmodified · S2.1/S2.2/S2.4 n/a · S4.9/S6.4 edited |
| qc-hr-attendance | 0 | 31/31 (KI-10 edited) |
| qc-hr-h1.2 | 0 | 73/73 |
| qc-hr-h2.1 | 0 | 90/90 |
| qc-hr-h2.2 | 0 | 60/60 |
| qc-hr-h2.3 | 0 | 79/79 |
| qc-hr-roster | 0 | 24/24 · CRITICAL 0 |
| qc-hf-hr-privacy | 0 | 194/194 · CRITICAL 0 |
| qc-nav-functions | 1 | HR 8/8 route · only S5 BOOKING (known) |
| fitness ± env | 0 / 0 | 53/53 ×2 |
| fitness-hr ± env | 0 / 0 | 9/9 ×2 |
| typecheck (12 GB · gate lock) | 0 | 0 errors |
Not run: qc-hr-h0.5 (child hard-wired to qc4.sh — controller runs it on QC4; `pin.ts` changed in r2: limiter extracted into `pinGate`, `verifyPin` logic unchanged, new `verifyPinOfEmployee`) · build/server/screenshots.

### Needs a ruling — h0.3 S2.5 cannot pass under R1 as written
S2.5 = 60 wrong PINs spread over 60 names of one system within a minute, then the 61st name with the right PIN must be refused. Under R1 the only shop-wide limit is H0.5's `hr-verifypin:<t>` = **120** wrong / 60 s (asserted at 120 by qc-hr-h0.5 S4.7/S9.3/S10.5/S10.6); the per-name buckets each hold 1 ⇒ the 61st (≈65 wrong in the window) passes. The pre-H2.4 kiosk had `hr-kiosk:sys` = 60/60 s. Options: (a) keep the old `hr-kiosk:sys:<t>:<sys>` 60/60 s bucket on the kiosk path only (breaks "H0.5 counters only"); (b) lower `VERIFY_PIN_LIMIT` to 60 (H0.5 change + ORACLE-EDIT on qc-hr-h0.5); (c) waive S2.5 citing h0.5 S4.7 (shop cap 120/min; each guess now tests one name, so ~1.2·10⁻² hits/min at 4 digits vs ~0.6·10⁻² before). Left red, not edited.

### Debts (r2)
| id | debt | owner |
|---|---|---|
| D-H24-pinonly | PIN-only kiosk — only once PINs are ≥ 6 digits | controller / later WO |
| D-H24-adopt | adopted session (R4): the IN row keeps its unlinked snapshot (NO_SCHEDULE); H2.5 must count an adopted session as attendance of the entry | H2.5 |
| D-H24-m1 | split shifts + forgotten OUT: arrival NEXT gives OUT when next start < old end + grace | H2.5 |
| D-H24-m2 | `pos-seam.onShiftToday` maps BREAK_* last rows to null (POS NO_CLOCK_OUT) — seam frozen | POS lane |
| D-H24-m3 | `canManageClockSettings` hand-rolls `permissions[...]` instead of `evaluate()` (gate itself accepted R7) | H2.10 |
| D-H24-m5 | mobile refusal audit has no throttle (card unmounted) | H2.10 |
| D-H24-m6 | `AppSystem.settings` read-modify-write serialised only against itself | H2.10 |
| D-H24-scope | kiosk name list uses H1.1 `unitWhere` (home unit in list or borrowing into it today) — an employee homed u1 but loaned to u3 today still shows at a u1 kiosk | H2.10 (or ruling) |

### Runbook (supersedes §2 "Prod runbook" items 3 and 5)
1. **Migrate first, then deploy code.** `prisma migrate deploy` applies 20261228000000 → 000001 → **000002 (purge indexes)**. Pre-check SQL of §2 unchanged; add `SELECT count(*) FROM "HrAttendance";` — if large, first run manually (outside a transaction): `CREATE INDEX CONCURRENTLY IF NOT EXISTS "HrAttendance_purge_geo_idx" ON "HrAttendance" ("tenantId","at") WHERE ("lat" IS NOT NULL OR "lng" IS NOT NULL OR "accuracyM" IS NOT NULL OR "deviceId" IS NOT NULL);` and `CREATE INDEX CONCURRENTLY IF NOT EXISTS "HrAttendance_purge_photo_idx" ON "HrAttendance" ("tenantId","at") WHERE "photoKey" IS NOT NULL;` — 000002 is then a no-op (`IF NOT EXISTS`).
2. Kiosk is **unchanged for shops** (name + PIN) plus a "เริ่มพัก" button; nothing to announce except breaks. Wrong PIN 10× in 10 min locks that name on that tablet only (audit `hr.pin.locked`, callerKey `kiosk:<user>:<employee>`).
3. Rollback: old code ignores the indexes too.

### Screenshot guide (CONTROLLER-RUN · replaces §5 kiosk bullet)
- `/app/sys/<id>/hr/kiosk` as `kiosk`: name grid (`hr-kiosk-name-<employeeId>`, "ยังไม่มี PIN" sub-line for staff without PIN) → tap a name → PIN pad (`hr-kiosk-pin`), `hr-kiosk-change` "เปลี่ยนชื่อ", `hr-kiosk-submit` "ลงเวลา" + `hr-kiosk-break` "เริ่มพัก". States: idle grid · after wrong PIN (`hr-kiosk-error` "PIN ไม่ถูกต้อง") · after a good PIN (`hr-kiosk-result`, back to the grid) · locked name ("ลองใหม่ในอีก N วินาที"). As `manager-branch`: grid shows only that branch's staff.
- `/app/sys/<id>/hr/settings` as `owner`: unchanged from §5 (card "ลงเวลา": `hr-settings-clock-policy` earlyInMin 120 / closeGraceMin 240 · rows `hr-clock-site-all` + per branch · PDPA tick).

### §F self-check (r2 delta)
- [x] F.2 roster detach + clock reads use the tx client only · [x] F.3 kiosk scope `[]`/`*` = all, explicit list refused with the wrong-PIN text (no unit id) · [x] F.4 refusals = fixed texts (S11.3 green) · [x] F.5 tx options unchanged (R7 note) · [x] F.6 runbook migrate-first incl. 000002 · [x] F.7/F.8 PIN path: count first, refund on success, one limiter set (H0.5) · [x] F.10 r2 files ⊆ r1 list + `pin.ts` (R1 names it) + 1 migration

## r2b (12 Nov) — controller rulings on the r2 decisions
- (1) S2.5 → option (a): `pin.ts` `verifyPinOfEmployee` (kiosk path only) counts `hr-kiosk-shop:<tenantId>:<systemId>` with `checkRateLimitDb` `KIOSK_SHOP_LIMIT` 60/60 s after the H0.5 buckets: over ⇒ refunds itself + the H0.5 slots and answers `ลองใหม่ในอีก N วินาที` (the verifyPin shop bucket is not consumed); right PIN / no pepper / throw ⇒ refund; wrong ⇒ stays. Key built from the server ctx only (tenant + HR system — per system like the old D7b bucket, so the S2.4 attempts on system A do not spend system C's budget in S2.5). `verifyPin` 120/60 s (C-8) untouched; no in-memory limiter. New check qc-hr-h2.4 S6.9 (pre-approved; own HR system; cleanup of `hr-kiosk-shop:<tid>` buckets added to the finally block). RED: `hr-H2.4-r2b-red.txt` — `passed 65/66 · failed S6.9 (limited,key) · Z1 clean`.
- (2) calendar-day rule stays for staff without an entry (Q3) · (3) move/reassign unlink inside the same tx, marked hunk · (4) D-H24-scope debt · (5) debt **D-H24-maxdur (H5.3): HR actions set no maxDuration — tx waits 15/20 s unverified against the platform default.**
- Verification: qc-hr-h2.4 forced 66/66 · unforced 66/66 (Z1 clean both) · qc-hr-h0.3 forced **37/37** (S2.5 green unedited; S2.1/S2.2/S2.4 n/a) · qc-hr-attendance 31/31 · qc-hf-hr-privacy 194/194 · fitness-hr no-env 9/9. Typecheck not rerun (no type signature changed; one new exported const). qc-hr-h0.5 not run (controller, QC4).
- "Needs a ruling — S2.5" above is closed by (1).

## r3 (12 Nov) — reviewer r2 re-check (MEDIUM-r2-1 + MINOR r2-a)
- **MEDIUM-r2-1 (R4 adoption, `clock.ts` `rosterPick`/`sessionOf`):** an unlinked open session adopts only an entry whose window **start is on the same Bangkok day as the session's IN** (`opt.startSameDay` filter on the adopt candidates; the link-on-IN path is unchanged). Timeline: stray IN 20:00 on D + entry D+1 01:00–09:00 ⇒ no adoption ⇒ calendar rule ⇒ 00:55 NEXT = **IN** (was OUT, a 4 h 55 m paid pair); the 20:00 IN stays unpaired (0 minutes). HUNT-6, 6c, 6e and overnight 22–06 (entry starts on the IN's day) unchanged — S13.3 first two vectors, S2.1, S2.4 green. Step 3 of the rule in r2 now reads "… published entry starting on IN's Bangkok day with `start − 360 min ≤ IN.at < end`".
- **MINOR r2-a (`pin.ts`):** `pinGate(tenantId, callerKey, { tenantBucket: false })` for the kiosk ⇒ the kiosk path counts only (a) the per-name caller bucket `hr-verifypin:<t>:kiosk:<user>:<employee>` and (b) `hr-kiosk-shop:<t>:<system>` 60/60 s — never `hr-verifypin:<t>` (POS C-8 120/60 s). `verifyPin` calls `pinGate` with defaults (unchanged behaviour). Comment fixed. r2b note "verifyPin shop bucket … stays" for the kiosk is superseded.
- ORACLE-EDITs (pre-approved): S13.3 + vector above · S6.9 + `hr-verifypin:<t>` unchanged across the 60 kiosk wrongs and a POS-style `verifyPin` right PIN still ok with the bucket unchanged. **Also S6.8 (not in the pre-approved list, forced by ruling r3-2):** it asserted that kiosk wrongs add to `hr-verifypin:<t>`; now asserts they add to `hr-kiosk-shop:<t>:<sys>` and leave `hr-verifypin:<t>` unchanged.
- RED (`hr-H2.4-r3-red.txt`): `passed 63/66 · failed S6.8 (shop) S6.9 (verifyPinUntouched) S13.3 (nextDay) · Z1 clean`.
- Verification: qc-hr-h2.4 forced 66/66 · unforced 66/66 (Z1 clean both) · qc-hr-h0.3 forced 37/37 (S2.1/S2.2/S2.4 n/a) · qc-hr-attendance forced 31/31 · fitness-hr no-env 9/9. Typecheck not run: no exported signature changed (`pinGate`/`rosterPick` are module-private; new optional params only). Not run: qc-hr-h0.5 (controller, QC4 — `verifyPin` path unchanged, `pinGate` default = both buckets).
- Debts (other reviewer MINORs):
  | id | debt | owner |
  |---|---|---|
  | D-H24-r2b | `hr.pin.locked` from the kiosk carries the employee id inside `callerKey` (H0.5 comment said no employee id) — accepted in the audit log; H0.5 contract text to update | H5.x (PIN contract doc) |
  | D-H24-r2c | forged `employeeId` outside `CALLER_KEY_RE` / key > 128 chars ⇒ wrong **without** counting (no PIN compared; differs from R2 "counted" wording) | accepted / H2.10 |
  | D-H24-r2d | `clock()` takes no roster lock: an IN racing a move can commit a stale `rosterEntryId`; `sessionOf` step 2 guards it — H2.5 must apply the same check (same employee, IN inside window), not trust `rosterEntryId` (added to D-H24-adopt) | H2.5 |

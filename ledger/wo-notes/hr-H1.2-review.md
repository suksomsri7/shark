# H1.2 review: reviewer + privacy/money/schema hunter

> Tree reviewed: `/root/projects/shark-hr-b`, branch `wip/pos-hr-h1.2`. Read at 4bca1281; HEAD is now 17867bd2 (the oracle ORACLE-EDIT, types only, which closes D-1). Base for the diff: 13a0601b.
> Mode: read-only. Nothing was edited, committed or pushed in shark-hr-b. No DB suite was run and no QC4 probe was needed (residue 0).
> Run by me, none of them touching the DB:
> - pure vector script `/tmp/hr-hunt-h12/vec.mts` against `time-rules.ts`
> - `prisma migrate diff --from-schema <13a0601b schema> --to-schema <HEAD schema>`, run in `/tmp/hr-hunt-h12` with a stub config and no `.env`
> - `scripts/qc-nav-functions.mts`, which is static

## Verdict: **FIX FIRST** (two small items, F1 and F2)

The schema, migrations, privacy, payroll freeze and unit scope are all sound. One suite required by §E is red and was never run (F1). One §C.8 tx rule is broken (F2). Neither needs a design change.

## Findings

### F1 MAJOR, blocks merge: yes. `qc-nav-functions` S5 (CRITICAL inside that suite) is red: "HR: ขาด /hr/settings"
- **Evidence:** `pnpm exec tsx scripts/qc-nav-functions.mts` prints `❌ [S5] … HR: ขาด /hr/settings` and `ตก 1 (CRITICAL 1) — 11 เช็ก`. S5 requires every non-param `page.tsx` under `sys/[id]` to be listed in the sidebar accordion (`src/app/app/layout.tsx:128-136`, `childrenFor` case "HR"). The new page `src/app/app/sys/[id]/hr/settings/page.tsx` is not listed there.
- **Not run:** COMMON §E lists `qc-nav-functions` for new pages. Builder notes §5 list it under "not run". The same applies to `qc-hr-roster`, `qc-hr-leave-booking`, `qc-hr-payadjust`, `qc-payroll-reverse`, `qc-booking-hours-hr` and `qc-ai-proposals`, which are also §E-mandatory.
- **Smallest fix (controller rules which one):**
  - (a) Add one marked line to `layout.tsx` HR children: `{ href: \`${s}/hr/settings\`, label: "ตั้งค่า" }`. There is precedent: `/hr/payroll` is also a guarded page that is listed for everyone. `qc-hr-roster` NM-3 only checks hrTabs ⊆ layout, so adding to layout is safe.
  - (b) An ORACLE-EDIT exemption in `qc-nav-functions` with a written reason. The file forbids exemptions that exist only to make the test green, so (a) is preferred.
- **Then:** run the six other §E suites listed above before merge.

### F2 MAJOR, blocks merge: no, but fixing now is recommended (3 lines). §C.8: a second connection is opened inside an interactive tx
- **Where:** `src/lib/modules/hr/settings.ts:99-104`. `targetUnitRefusal` queries `tenantDb({ tenantId }).businessUnit.findFirst`, which is not the tx client. It is called *inside* `$transaction` at `:303` (updateShift), `:497` (updateLeavePolicy) and `:625` (upsertHoliday update), on the path where the row moves to another unit.
- **Risk:** COMMON §C.8 says "Every statement inside a tx uses that tx client" (HF-HR-0 5d). With a pool of 1 (serverless or pgbouncer settings), this query waits on the connection the tx is holding until the 30 s tx timeout, then the user gets "บันทึกไม่สำเร็จ". QC4's pool hides this, which is why the oracle is green.
- **Reachability:** no stub-page form reaches it today (there is no edit form); only the actions do.
- **Fix:** pass `tx` into `targetUnitRefusal` and use `tx.businessUnit.findFirst` (BusinessUnit is `tenant`-axis, so the scoped tx client resolves it). Alternatively, run the unit check before opening the tx.

### F3 MINOR, no: the `?msg=` banner reflects any text from the URL
- **Where:** `page.tsx:33,55,102-105`. Whatever `?msg=` holds is shown (up to 120 chars) in a `role="alert"` card on a trusted SHARK page. React escapes it, so there is no XSS. But a crafted link can show arbitrary Thai text such as "call 08x…" to an owner or HR admin.
- **Fix:** redirect with a short code (`ok`, or a key of `SETTINGS_TEXT` / `TIME_RULE_TEXT`) and render only from that allowlist.
- **Also:** on the en locale this banner shows the Thai fixed texts. That is acceptable for a stub.

### F4 MINOR, no: the runbook covers the index on a large `HrAttendance` but not the FK validation scan
- **Where:** migration A header and notes §6. If `HrAttendance` is over 200k rows, they move only `HrAttendance_rosterEntryId_idx` to a CONCURRENTLY migration.
- **Gap:** `ALTER TABLE "HrAttendance" ADD CONSTRAINT … FOREIGN KEY` also scans the whole table inside A, under SHARE ROW EXCLUSIVE, which blocks clock writes.
- **Fix (runbook text only):** in the >200k branch, also ship the FK as `NOT VALID`, then `VALIDATE CONSTRAINT` in the third migration. Prod today has 1 demo tenant, so this is not urgent.

### F5 INFO: notes for H2.x, nothing to do in H1.2
- **`rosterDayOf`** (`time-rules.ts:114-127`) breaks ties by "window that starts closest to `at`". My vector: with tolerance 15, a 05:50 OUT punch after a 22:00–06:00 night shift resolves to the 06:00 morning entry, not the night entry. H2.4 must pass the punch kind or prefer the window that `at` is strictly inside.
- **`leaveDaysBetween`** has no upper bound. `2026-01-01..2029-12-31` returns `"1461.0"`, which does not fit `Decimal(4,1)` (max 999.9). H2.7 must cap it.
- **Two encodings of one shift.** A 16:00–24:00 shift can be stored as `endMin 1440, crossesMidnight=false` or as `endMin 0, crossesMidnight=true`. Both give an identical window. Anything in H2.x that compares shifts by minutes should normalise first.
- **Roster unique `(employeeId, date, shiftId)`** allows two *different* shifts for one employee on one day (split shifts are intended), including overlapping ones. Nothing in H1.2 reads roster rows. H2.1 must add an overlap or ≥1-day-off validation.
- **Columns with no FK, as R1 specifies:** `HrShiftSwapRequest.requesterEmployeeId/targetEmployeeId/toEntryId`, `HrTimeCorrection.rosterEntryId/resultAttendanceId` and `HrOtRequest.rosterEntryId` can dangle after deletes. H2.x writers must check them in-system (the review §2.1 lesson, same as X2.2).
- **Raw uniques use `lower(name)` with no Unicode normalisation or whitespace collapse.** Thai names that differ only in sara-am composition (U+0E33 vs U+0E4D+U+0E32) or in inner double spaces count as different names. Null vs `''` cannot collide, because `cleanUnit` maps `''` to null before any write.
- **F16.1 now includes the generic names `lat`/`lng`.** Any future HR client file that touches BusinessUnit `lat`/`lng` (the unit-location form) will trip it. `deviceId`/`accuracyM` are not in the list, as Q5 specifies.
- **PDPA `exportTenantData`** (`platform/pdpa.ts:35`) dumps every `sys()` table, so it now includes the 8 new tables and, from H2.4, GPS and photo keys. This export already contains `HrEmployee.pinHash/nationalId`, so this predates H1.2 and is outside it. I am recording it for the HQ27 / H2.4 privacy decision.
- **Seed holiday dates follow the current Bangkok year** (`D.today`). `hr-expected.json` changes at new year, which is acceptable because the seed is not an oracle. The seed adds 10 `AuditLog` rows; no frozen expectation counts the `qc-hr-v2` AuditLog total (h0.5 and h0.6 count deltas on their own tenants).
- **Audit is written after commit** and `writeAudit` swallows its own errors. This is house style (owner_auto does the same), not a defect.

## What held
- **Migration A, 57 statements:**
  - 8 CREATE TYPE, 2 ALTER ADD COLUMN (all nullable, no DEFAULT), 8 CREATE TABLE, 21 CREATE INDEX (19 plain + 2 Prisma unique), 11 FK and 7 raw uniques. Additive only: no DROP, RENAME, ALTER COLUMN or ALTER TYPE.
  - Drift check: `prisma migrate diff` from the base schema to the HEAD schema gives exactly A minus the 7 raw uniques, plus the 2 `ALTER TYPE … ADD VALUE` lines, which were moved to B. That is a normalised `comm` of both files with zero other differences.
- **11 FKs match R1:**
  - Cascade: roster→employee, swap→fromEntry, correction/OT/txn→employee.
  - Restrict: roster→shift, txn→policy.
  - SetNull: attendance→roster, correction→attendance, txn→leave, leave→policy.
  - There is no FK to BusinessUnit, and FK ON UPDATE CASCADE is Prisma's default.
  - Tenant purge (`pdpa.ts:75` multi-round children-first) tolerates the Restrict FKs.
- **Migration B** is its own folder, sorts after A, and holds exactly two `ADD VALUE IF NOT EXISTS`. The schema enum order is ON_TIME, LATE, DAY_OFF, NO_SCHEDULE, ABSENT, EARLY_OUT.
- **The 7 raw uniques** match R1 text exactly. They are COALESCE on `unitId`, with no NULLS NOT DISTINCT.
- **`time-rules.ts` is pure:** no imports, no `Date.now()`, no `new Date()` without an argument, fixed +07:00.
- **My time-rules vectors all held:**
  - leap: `2028-02-28T17:00Z` → `02-29`; `addDays(2028-03-01,-1)` = `02-29`; `2027-02-29` is refused
  - year end: night shift on `12-31` ends `23:00Z` on BKK 01-01
  - `paidMinutes` overnight 480−60 = 420
  - D13b: 02:00 BKK on 11-01 → `10-31`
  - an overnight window and the next morning's window touching → overlap 0
  - half-day → `"0.5"`, an excluded leap day → `"3.0"`, from > to is refused
- **R6:** `LEAVE_BASE_SELECT` / `ATTENDANCE_BASE_SELECT` (`service.ts:965-993`) list exactly the 12 / 10 base scalars in schema order plus `employee: true`. HrEmployee gained only relations, no scalars. No key was dropped or added for downstream consumers (privacy DTO, ui.tsx, digests S5 frozen).
- **Other HrLeave/HrAttendance readers** all use `select`, or map named fields only: `ai/tools.ts:2103,2412`, `calendar/service.ts:146`, `approval/service.ts:248`, `kanban-bridges.ts:404`, `link-resolvers.ts:309`, `scope.ts:178`. Owner-auto `create` (`service.ts:607`) returns `l.id` only.
- **Sensitive columns:** no Decimal or sensitive column crosses to a client component, outbox payload or AI output. A grep of src finds no reader of `lat/lng/photoKey/attachmentKey/deviceId/accuracyM` outside schema, migration and seed.
- **HrLeave writers** (requestLeave, owner_auto, decideLeave, cancelLeave, approval effect) never write or read `policyId/days/halfDay/hours/attachmentKey`, so new rows get null. `clock()` does not write `source` (Q7).
- **AttendanceJudgement widening:**
  - labels: `JUDGEMENT_LABEL` is `Record<string,string>`, +2 Thai labels
  - logic: `actions.ts:362-372` is an if-chain ending in `undefined`; `monthlyAttendance` counts by equality
  - no `Record<AttendanceJudgement,…>` or exhaustive switch anywhere (calendar and AI never touch judgement)
- **Settings scope:**
  - reads: shop-wide plus in-scope units (`unitListWhere`, fail closed to shop-wide only)
  - unit-row writes need the unit in `hrScopeOf` and a BusinessUnit of the tenant
  - shop-wide writes need an all-branch viewer
  - a unit move is checked at both ends, and actions take `unitId` from the DB row
  - `ctxOf` requires an HR system of the caller's tenant
- **Settings validation:**
  - shifts go through `shiftWindow`; `crossesMidnight` is derived when omitted and validated when given
  - quota is 0..365 in 0.5 steps; carryMax ≤ quota is also re-checked on update against the stored row
  - MM-DD is checked against a leap year
- **Races and outcomes:**
  - P2002/23505 (including driver-adapter `cause.originalCode`) maps to fixed Thai text; any other error becomes "บันทึกไม่สำเร็จ", and no `e.message` reaches the user
  - shifts and policies are archived, holidays hard-deleted
  - audit carries `{id, systemId, unitId}` only, and no events are emitted (Q10)
- **Stub page:** it is guarded (HR system of the tenant, then `canManageHrSettings`, else 404) and shows no employee data. The hub card is shown only to settings viewers. Messages are complete in both locales (44 = 44 keys, one `hr` key per file), and the page uses tokens only.
- **Registry and wipe order:** `core/scope.ts` has 8 `sys()` entries. In `hr-qc-env` the wipe order is children first: swap/correction/OT/txn → roster → attendance/leave → shift/policy/holiday.
- **Seed:** 4 shifts (1 overnight), 4 HQ12 policies marked "รอเจ้าของยืนยัน", 2 holidays, and no roster, txn or request rows. It is idempotent because the tenant is wiped before rows are re-created through the service.
- **Frozen files:** `payroll-rules.ts` sha256 starts `75a66c0c1354e932`. `payroll.ts`, qc-hr-h0.6/h0.7/h1.1, privacy, privacy-shared, scope, pin, ai, calendar, outbox-consumers, approval-effects and permissions show zero diff against 13a0601b. H0.7 R10/R11 and H1.1 R12 are untouched. Hunks are marked `HR H1.2 ▸ … ◂`.
- **D-1 (oracle typecheck)** is fixed in the tree by 17867bd2. I did not re-run typecheck, which is heavy; the controller should run it once on 17867bd2 before merge, since `next build` also type-checks `scripts/*.mts`.

## Residue / running
- QC4: no probe was run, so no rows were created.
- Temp files exist only under `/tmp/hr-hunt-h12/` (vec.mts, base/ and head/ schema copies, a stub prisma.config.ts, a node_modules symlink, diff output). They hold no secrets and nothing reads `.env`.
- Nothing of mine is running.

## Round 2 (R13): bb85108b

> I re-read `git diff 17867bd2..bb85108b`: 8a1be849 holds the fixes and bb85108b the notes. Read-only.
> Run by me, none of them touching the DB:
> - `scripts/qc-nav-functions.mts`
> - pure vectors `/tmp/hr-hunt-h12/vec2.mts`
>
> No DB suite was run, no unit was touched, and no QC4 probe was needed.

### Verdict: **MERGE**

| item | result |
|---|---|
| F1 (sidebar) | Fixed. `layout.tsx` has +1 line and no other change: `{ href: \`${s}/hr/settings\`, label: "ตั้งค่า" }`, marked `HR H1.2 R13 ▸ … ◂`. `qc-nav-functions` gives `✅ ผ่านทั้งหมด — 11 เช็ก`. |
| F2 (tx client) | Fixed. `targetUnitRefusal(ctx, scope, unitId, tx?)` (`settings.ts:101-109`) uses `tx.businessUnit.findFirst` with `tenantId` explicit in the where. All 3 in-tx callers pass `tx` (`:308`, `:502`, `:630`). The bodies of the 9 `$transaction`s contain no other `tenantDb(` call. The two remaining uses (`:107` non-tx branch, `:671` `settingsRowUnit`) are outside any tx. |
| F3 (`?msg=`) | Fixed. `back()` redirects with a code only (`ok`, `s.*`, `t.*`, `u.notFound`; any unmapped reason becomes `s.failed`). The page renders only `t("saved")` or `MSG_TEXTS[code]` via an own-property check, and an unknown code renders nothing. No text from the URL reaches the DOM. |
| R13.4 (cap) | Fixed. The `addDays(from,365) < to` check refuses with `"ใบลาหนึ่งใบยาวได้ไม่เกิน 366 วัน"`. 2026-01-01..2029-12-31 is now refused (was "1461.0"). 2028-01-01..12-31 (leap) = "366.0". 2026-01-01..2027-01-01 = "366.0". 367-day ranges are refused, leap or not. S2.10 vectors are unchanged: 3 days "3.0", AM "0.5", one excluded day "2.0", from > to refused. |
| F4 / F5 (notes) | Present. Runbook §6 carries the `NOT VALID` FK + `VALIDATE CONSTRAINT` step in the >200k branch. §10 carries the F5 debts: rosterDayOf tie-break, two shift encodings, overlapping roster entries, no name normalisation, generic F16.1 `lat`/`lng`, PDPA export, no-FK id columns. |
| Other behaviour | None changed. The diff touches only layout (1 line), the settings page message path, settings.ts (unit check) and time-rules.ts (1 text + 1 guard). Schema, migrations, service.ts, actions and fitness-hr are unchanged. |

**INFO** (does not block merge): `settings-actions` `NO_SYSTEM_TEXT` ("ไม่พบระบบพนักงานนี้") is not in the allowlist, so the page now shows it as "บันทึกไม่สำเร็จ — กรุณาลองใหม่". This text is reachable only with a forged `systemId` and is acceptable for a stub. If the exact wording should show, add a `"a.noSystem"` entry.

**Residue:** none on QC4. My temp files exist only under `/tmp/hr-hunt-h12/`. Nothing of mine is running.

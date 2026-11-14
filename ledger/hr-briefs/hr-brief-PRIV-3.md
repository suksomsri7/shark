# PRIV-3 — HR pages gate by role, not only by "system exists" (fix after H5.1 walk)

> Base `session/hr` df2073462 · branch `wip/hr-priv-3` · no migration · oracle `scripts/qc-hr-priv-3.mts` (+ `-lib`) · notes `ledger/wo-notes/hr-PRIV-3-oracle.md`. Marker on every hunk: `// HR PRIV-3 ▸ … ◂`.

## Goal
Non-entitled viewers get the standard 404 (bytes = unknown system id) on `/hr/employees`, `/hr/leave`, `/hr/payroll`. Pickers list others only to viewers who may act for them. Tabs, sidebar and hub cards never link to a 404. Entitled viewers see what they see today.

## Findings (walk `/root/qc/hr-h5.1`, final run; viewers per `walk-hr-matrix.json`, keys `hr-qc-env.mts:280-289`)
Root cause: the pages check only `appSystem {id, tenant, HR}` (`employees/page.tsx:13-15`, `leave/page.tsx:13-15`, `payroll/page.tsx:37-39`). Loaders use `hrScopeOf`, a branch filter that never grants or denies (`scope.ts:8`). D-1 (`scope.ts:43-45`, H1.1 brief :72) makes `[]` = all branches ⇒ K/N/S get everything. fitness-hr carried these pages as unguarded debt since H0.4 (`PAGE_GUARD_BASELINE` `fitness-hr.mts:330-336`, "closes in H2.7 / H1.1/H4.4 / H2.4 / H3.4"). None closed.
- F1 **K, N** `/hr/employees` 200: 14 names, branch chips, ประจำ/ทดลองงาน chips, add form, deleted list (`refusals/r-employees-member.png`, `r-employees-kiosk.png`; BLOCKER REFUSAL-LEAK + 6 INV-LEAK each). Loader `ui.tsx:441-451` (`listEmployees` + `listRemovedEmployees`, scope "*").
- F2 **K, N** `/hr/leave` 200: "พนักงาน" picker with 13 names plus the filing form (`r-leave-kiosk.png`, `r-leave-member.png`). Picker `ui.tsx:222` (listEmployees for every viewer), `:288-302`.
- F3 **S** (staff น้ำฝน, `hr.leave.request` only) `/hr/employees` 200: full register + branch chips + restore (`02-employees` S cells: 4 INV-LEAK). On `/hr/leave`, S also gets all names in the picker. The action ignores the picker for S (`actions.ts:420-422`), so it is dead UI that leaks names.
- F4 **K, N** (and S) `/hr/payroll` 200 with the "restricted" note (`payroll-ui.tsx:80-88`), no data. H5.1 brief :53 expects 404. 6 HTTP + 6 REFUSAL-BYTES findings on F1/F2/F4.
- F5 Hub `/app/sys/[id]` (`ui.tsx:718,730-735`): K/N/S get "พนักงาน 14 คน" and cards linking to F1/F2/F4. Headcount only, no names. Tabs/sidebar: `nav.ts:17-26` has no gate for employees/leave/payroll (default `true` :50-51).
- Writes already closed (GREEN, pin): register actions `assertHrCan(hr.employee.create)` `actions.ts:100,167,186,214,247,292,311,331,564`; `requestLeaveAction` :414 (on-behalf only :420-421); decide/bulk :498,530; cancelLeave = filer; OT `ot.ts:120-127`; clock :129-136.

## Intended access (documents)
- Rights: MASTER `:24` and COMMON `:26`: viewer matrix incl. **plain member** and kiosk. `18-hr.md:66`: refusals are byte-identical for every non-entitled viewer. `privacy.ts:7`: no access ⇒ `notFound()` (404, not 403).
- Register: inventory `hr-ui-inventory.json:770,881,908,992` roles owner/manager/payroll/payrollSelf(/manager-branch); hiddenFor kiosk+member on all rows, staff on chips/unit/restore. Profile gate `hrAccessOf.openProfile` (`privacy.ts:34-43`: employee.create ∨ leave.read ∨ payroll.read) = that reader set.
- Leave: inventory `:3585…` roles owner/manager/MB/staff, `hr-ot-list` :5457 + payroll; hiddenFor kiosk+member on all rows.
- Payroll: roles owner/payroll/PS/manager/MB (H4.6 stock, H3.1 WE, H3.4 run2); hiddenFor kiosk+member+staff on all rows.
- Staff colleague needs: H2.10 `myToday.colleagues` (same unit/day; name, position, shift — :19), `mySwapTargets` (:24), own leave `selfRequestLeave` keyless (:28). Nothing grants staff the register.
- Disagreements: (a) H1.1 R8 (`hr-brief-H1.1.md:28`) and `visual-hr.mts:60` photograph **staff** on the register. The inventory hides chips/restore for staff, and the walk matrix keeps S on `02-employees`/`11a`. (b) Inventory `:5481,5505,5529` hides `hr-ot-approve/reject/revoke` from payroll. H2.9 Q4 (`hr-brief-H2.9.md:45`) rules "`hr.payadjust.approve` in branch" approves, and the code matches (`ot.ts:124-127`). (c) VIS-5c brief §5 says "employees page stays guard-free" (wip/hr-vis-5bc). That reads the ratchet backwards.

## Access table (page/action × viewer: intended / actual → verdict)
O owner · M manager `*` · MB manager huahin · P payroll `*` · PB payroll huahin · S linked staff · K kiosk · N member · API key
| surface | O | M | MB | P | PB | S | K | N | API |
|---|---|---|---|---|---|---|---|---|---|
| `/hr/employees` | ✓/✓ OK | ✓/✓ OK | branch/branch OK | ✓/✓ OK | branch/branch OK | ✗(Q1)/all **LEAK** | ✗/all **LEAK** | ✗/all **LEAK** | n/a (session pages) |
| register actions | key/key OK | OK | OK (hrTarget) | refused OK | OK | refused OK | refused OK | refused OK | ops `hr.employee.read` OK |
| `/hr/employees/[id]` | OK | OK | OK | OK | OK | own→redirect OK | 404 OK | 404 OK | ops OK |
| `/hr/leave` page | ✓ OK | ✓ OK | ✓ OK | ✓ (OT list) OK | ✓ OK | ✓/✓ OK | ✗/200 **LEAK** | ✗/200 **LEAK** | n/a |
| leave picker (names) | ✓ OK | ✓ OK | branch OK | ✗/all TOO LOOSE (register-entitled, dead form) | same | ✗/all **LEAK** | ✗/all **LEAK** | ✗/all **LEAK** | – |
| leave/OT actions | OK | OK | OK | OT decide ✓ (H2.9 Q4) OK | OK | own only OK | refused OK | refused OK | – |
| `/hr/payroll` | OK | OK | OK | OK | OK | ✗(Q3)/200 note TOO LOOSE | ✗/200 note TOO LOOSE | ✗/200 note TOO LOOSE | – |
| hub cards + count | OK | OK | OK | OK | OK | count+dead links MINOR | MINOR | MINOR | – |
| tabs/sidebar (nav.ts) | OK | OK | OK | OK | OK | links to 404 after fix | same | same | – |
| roster·attendance·kiosk·requests·reports·settings·law·slip-admin·`/app/me/hr/**`·route handlers·`/api/v1/hr` | OK (walker refusal cells 404/clean; routes service-gated; me = `self.ts`) |
Counts: LEAK 7 · TOO LOOSE 5 (no data) · MINOR 3 · TOO STRICT 0 · rest OK.

## Scope (R1…R7)
R1 **One shared gate** in `privacy.ts` (fitness F16.3 counts `require*` from hr/privacy, `fitness-hr.mts:308`): `export function hrPageAccessOf(v: HrViewer): { register: boolean; leave: boolean; payroll: boolean; leaveOnBehalf: boolean }` plus `export function requireHrPage(v: HrViewer, page: "register"|"leave"|"payroll"): boolean`. Pure, fail-closed on a bad viewer. It **calls** the existing predicates and restates none of them:
- register = `hrAccessOf(v).openProfile`
- leaveOnBehalf = the two `evaluate` calls now at `actions.ts:420-421` (moved here; `requestLeaveAction` calls the helper, same semantics)
- leave = OWNER ∨ MANAGER ∨ evaluate of any of `hr.leave.request|hr.leave.read|hr.leave.decide|hr.employee.create|hr.payadjust.request|hr.payadjust.approve|hr.payroll.read`. These are the keys the page's sections already use: form `actions.ts:414`, lists `leaveListScopeOf`, OT `ot.ts:120-131`.
- payroll = `canViewPayroll` ∨ `canReadWorkEntries` ∨ `canRequestStockCharge` ∨ `canSeeStockCharges` (`work-entries.ts:84-86`, `stock-charge.ts:125-131`). This is the union of the page's sections.
The builder proves there is no import cycle. No second copy anywhere.
R2 **Pages:** `employees/page.tsx` after :15, `leave/page.tsx` after :15, `payroll/page.tsx` after :39: `if (!requireHrPage(hrViewerOf(auth), "<page>")) notFound();`. Required: K/N (and S if Q1/Q3 hold) get the exact bytes of `/app/sys/<unknown>/hr/<page>` (status + body after the walker's normalisation). Current: 200 + data.
R3 **Leave picker** (`ui.tsx:221-224`, `:288-302`): the employees list for the picker = `listEmployees(…)` only when `leaveOnBehalf`. Otherwise the form renders without the "พนักงาน" select (`requestLeaveAction` already files for the linked employee). An unlinked viewer without on-behalf gets no form. The OT picker `ui.tsx:809` is unchanged (already `canOnBehalf`).
R4 **Nav** (`nav.ts:17-26,38-53`): `gateOf` adds `employees|leave|payroll` → `requireHrPage`. Sidebar `layout.tsx:153-165` and `hrTabsFor` follow automatically (`hrTabs` byte-identical).
R5 **Hub cards** (`ui.tsx:730-735`): drop the employees/leave/payroll cards (and the employee count) for viewers whose gate is false. One marked hunk. Nothing else in HrHub.
R6 **Kiosk page** (Q4): `kiosk/page.tsx:18` keeps `canRunKiosk`. Its baseline row stays unless Q4 = yes.
R7 **Inventory/ratchet:** remove employees/leave/payroll from `PAGE_GUARD_BASELINE` (ORACLE-EDIT `fitness-hr.mts:332-335`). Inventory `:5481,5505,5529`: payroll moves from hiddenFor to roles (H2.9 Q4; `wo` note `PRIV-3`). Rows of `/hr/employees` gain `staff` in hiddenFor where it is missing (`:881,908`) if Q1 holds.

## Allowed files
`hr/privacy.ts` · `hr/nav.ts` · `hr/ui.tsx` (HrLeaveSection picker + HrHub cards hunks only) · `hr/actions.ts` (:420-421 only) · the 3 page files (+kiosk if Q4) · `scripts/qc-hr-priv-3*.mts` · `scripts/hr-ui-inventory.json` (rows above) · `ledger/wo-notes/hr-PRIV-3*.md`. A new hr file must say `HR PRIV-3` in its first 3 lines. ORACLE-EDIT requests (controller applies): `fitness-hr.mts` baseline, `qc-hr-h2.10.mts:741-766` S7.1 (hard-codes leave/employees/payroll = `true`), `walk-hr-matrix.json`.

## Hard rules
One helper (R1); no new predicate copies, no inline `evaluate(… "hr.…")` in pages/ui for these gates. No business-logic, action-semantics, scope (`hrScopeOf` D-1 unchanged) or DTO change. `payroll-rules.ts` frozen (sha); frozen per PRIV-2 list + `scope.ts` · `rbac.ts` · `prisma/**` · `ot.ts` · `service.ts` · every older oracle. No migration. Acceptances in older oracles go through an explicit allowlist (`PRIV3_ALLOW`), and every hunk carries `HR PRIV-3`.

## Oracle plan (`qc-hr-priv-3`, temp tenants `qc-hr-priv3-*`, 9 viewers + other tenant)
- G1 pure `hrPageAccessOf`: 9 viewers × 4 keys; malformed viewer ⇒ all false (RED: absent).
- G2 render 3 pages × {O M MB P PB S K N}: not-entitled ⇒ Next not-found, output = unknown-system render (RED for K/N/S). Entitled ⇒ name + testid sets = base (GREEN control; PB/MB branch rows unchanged).
- G3 leave picker: S, P, PB ⇒ 0 employee `<option>`s. O, M, MB, `hr.leave.decide` staff ⇒ option set = base.
- G4 actions (GREEN pin): K/N/S × create/update/remove/restore/setPin/setWorkSchedule/saveProfile/requestLeave(on behalf)/decide/bulk/OT decide ⇒ refused, 0 rows, same bytes real vs unknown id.
- G5 nav: `hrNavFilter` = page gates (viewers × linked); hub cards absent for K/N/S.
- G6 statics: one helper; 3 pages import `requireHrPage`; actions use `leaveOnBehalf`; markers; baseline −3; payroll-rules sha.
- G7 walker (controller): `r-employees` K N (+S), `r-leave` K N, `r-payroll` K N (+S) ⇒ 404, no HR text, bytes clean; 02/09/11a entitled cells unchanged; 02 S INV-LEAK gone.

## Lane run list (one at a time, lane wrapper)
`qc-hr-`priv-3 · h2.10 · h0.3 · h0.7 · h1.1 · h2.7 · h2.9 · h3.4 · h4.1 · h4.4 · h4.6 · h4.8 · h4.3 · priv-2 · `qc-hf-hr-privacy` · `qc-nav-functions` · `fitness-hr` (both modes) · tsc (`scripts/iso.sh`, ISO_MEM=14000M). Then the controller re-walks the refusal sweep + 02/09/11a.

## Parallel tickets — collisions and merge order
- VIS-5c (`wip/hr-vis-5bc`): `qc-hr-vis-5c.mts:31,84-86` S8 = employees page gains no hr/privacy import and `pageGuard.guarded === false`; brief §5 :60 same; §9 walks S on 02. R2 flips all three.
- VIS-5b: `qc-hr-vis-5b.mts:20,28` pins `hrNavFilter` sha (R4 changes it). Brief :44 adds a 6-term kiosk-only predicate in `hrTabsFor` (a gate copy) and edits HrHub `ui.tsx:710-793` (R5 touches :730-735).
- VIS-5a (`wip/hr-vis-5a`): `payroll/page.tsx` hunks @@-20 (imports)/-48/-121 vs PRIV-3's 1 import + 1 line after :39 — trivial.
- **Order: PRIV-3 → VIS-5a → VIS-5b → VIS-5c** (small, live leak). Each VIS rebases (BASE = new merge-base) with ORACLE-EDITs: 5c S8 ⇒ "guard import = base, page guarded"; 5c §5 line struck; 5b S3 golden re-taken; 5b kiosk-only rule built from `requireHrPage` + existing gates; walk 02/11a without S if Q1/Q3.

## QUESTIONS FOR THE CONTROLLER
Q1 Staff (no register key) on `/hr/employees`? **Default 404.** No document grants it. Colleague needs are covered by H2.10 `myToday`/`mySwapTargets`. H1.1 R8's staff shot predates D-1 widening `[]`.
Q2 Payroll viewer sees OT approve/reject/revoke? **Default yes (code stays; fix the inventory).** H2.9 Q4 names `hr.payadjust.approve`.
Q3 Staff on `/hr/payroll` (note only)? **Default 404.** Every inventory row hides it from staff; this is consistent with roster/requests.
Q4 Close the kiosk page baseline row too (`requireHrPage(v,"kiosk")` delegating to `canRunKiosk`)? **Default no.** It is already gated, and closing it adds churn.
Q5 Hub cards in PRIV-3 (R5) rather than VIS-5b? **Default yes.** Otherwise PRIV-3 ships cards that 404.
Q6 Linked staff **without** `hr.leave.request` gets 404 on `/hr/leave`? **Default yes.** Their path is "ของฉัน" (H2.10 R5); the page form refuses them today anyway.
Unverified: transitive import-cycle freedom of R1 (builder proves it); whether `qc-hr-h0.7.mts:273` block statics read `requestLeaveAction` text (builder checks).

## CONTROLLER RULINGS (15 Nov) — drafter defaults ACCEPTED for Q1–Q6
- Q1 STAFF on `/hr/employees` → standard not-found (no document grants it; H2.10 serves colleagues/swap targets) · Q2 payroll viewer keeps OT approve/reject/revoke (H2.9 Q4; fix the inventory, not the code) · Q3 STAFF on `/hr/payroll` → not-found · Q4 kiosk page baseline untouched · Q5 hub cards fixed here (no links to pages the viewer cannot open) · Q6 linked staff without the leave key → not-found on `/hr/leave` (their path is "ของฉัน").
- One shared helper (`hrPageAccessOf` / `requireHrPage`) built only from existing checks; a not-entitled role gets the app's standard not-found response, byte-identical to an unknown system/page, on the page; every server action on these pages keeps refusing (pinned by GREEN controls).
- Merge order: PRIV-3 → VIS-5a → VIS-5b → VIS-5c. The VIS tickets re-merge session/hr after PRIV-3 lands; their oracle authors update the checks that pin today's unguarded state (vis-5c S8, vis-5b `hrNavFilter` pin).
- Controller ORACLE-EDITs authorised for the builder, marked `ORACLE-EDIT (HR PRIV-3 · controller)`: `fitness-hr` `PAGE_GUARD_BASELINE` minus the three pages; `qc-hr-h2.10` S7.1 (tabs shown per the helper, not always); inventory `roles`/`hiddenFor` rows; walk matrix. Anything else: explicit allowlist style, listed in notes.

## CONTROLLER RULINGS r2 (review = MERGE WITH NOTES · privacy hunt `/tmp/hr-ctl/priv3-hunt/` A pages/routes · B actions · C other-tenant owner) — added to this ticket
- **R6 (MAJOR):** `setSalaryProfileAction` (`payroll-actions.ts` ~70–93) never checks that `systemId` is an HR system of the caller's tenant. `payTarget` (~59–61) returns `{}` for an unknown employee, which skips the branch check, and `payroll.ts:94` then creates the row.
  - A foreign OWNER (or any holder of `hr.payroll.create`) sends our system id with an unknown employee id. The result is an `HrSalaryProfile` row in their own tenant, pointing at our system.
  - With a real employee id of ours, the unique key `(systemId, employeeId)` throws. This is an existence oracle across tenants. If that employee has no profile yet, the foreign row squats the key and blocks our shop from creating one.
  - `markPaidAction`, `reverseRunAction` and `reverseRunV2Action` write audit rows in the caller's tenant for a foreign run id.
  - **Required:** every server action in the payroll action files first resolves the HR system row (`id`, the caller's tenant, type HR). Where an employee, run or adjustment id is given, it then resolves that row inside that system, through `tenantDb(ctx)`.
  - A missing or foreign row gets ONE fixed refusal, identical for unknown and foreign ids, and nothing is written in ANY tenant (row counts incl. audit, both tenants).
  - Same-tenant behaviour is unchanged. Our owner can still create the profile after a foreign attempt.
  - *Oracle (qc-hr-priv-3b X3):* `createPayrollRunAction` also writes for a foreign or unknown system id. A foreign OWNER gets `{ok:true}` and an `HrPayrollRun` plus `HrPayrollItem` rows in their own tenant pointing at our (or a non-existent) system. It is in scope of R6.
- **R7 (MINOR):** cancel/respond actions answer differently for "exists but not yours" and "unknown id": leave (`service.ts:449/450`), OT (`ot.ts:302`), swap (`swap.ts:393/451`).
  - **Required:** one fixed text for both cases, for any caller who is not a party or not entitled. Checks for K, N and an unrelated staff member.
  - *Oracle:* the form paths `cancelLeaveAction`, `cancelOtAction`, `respondSwapAction` and `cancelSwapAction` differ. The self paths (`self*Action`) already answer the same.
- **R8 (MINOR):** `kioskClockAction` with an arbitrary employee id and a wrong PIN returns the employee's name and "no PIN set" (`pin.ts:36,380`).
  - **Required:** the same "PIN ไม่ถูกต้อง" for an unknown id, a no-PIN employee and a wrong PIN, with no name in the reply. The exception is employees on the kiosk's own selectable list, whose names the kiosk page already shows.
  - *Oracle finding:* `kioskRoster` (the kiosk page) lists every active employee in the kiosk's scope, including no-PIN ones (the "ยังไม่มี PIN" section). The name reply happens only for those listed employees.
  - Off-list ids already answer exactly "PIN ไม่ถูกต้อง": unknown, inactive, another HR system, another tenant, and another branch for a branch kiosk. So does a wrong PIN.
  - Under this ruling R8 needs no code change; it is pinned GREEN (3b K1/K2).
- **R9:** oracle gaps from the review.
  - Add viewers holding exactly one key to the page matrix: `hr.payadjust.request` only (leave ✓ · payroll ✓ via stock charge · register ✗) and `hr.payadjust.approve` only (leave ✓ · payroll ✗ · register ✗).
  - G1 pins the truth table that `qc-hr-h2.10` S7.1 now follows.
  - A staff member of ANOTHER HR system in the same shop opening this system's `/hr/leave` gets a render with no data today. This is debt, not fixed here; the current outcome is pinned as a GREEN control.
- **r2 allowed files** (added to the list above; `payroll-rules.ts` stays byte-identical, and there is no migration):
  - R6:
    - `src/lib/modules/hr/payroll-actions.ts`
    - `src/lib/modules/hr/payroll-opening-actions.ts`
    - `src/lib/modules/hr/work-entries-actions.ts`
    - `src/lib/modules/hr/stock-charge-actions.ts`
    - `src/lib/modules/hr/attendance-pay-actions.ts`
    - `src/lib/modules/hr/payslip-actions.ts`
    - `src/lib/modules/hr/bank-files/actions.ts`
    - `src/lib/modules/hr/filings/actions.ts`
    - `src/lib/modules/hr/payroll.ts` (only for the ownership guard inside the functions those actions call)
  - R7:
    - `src/lib/modules/hr/service.ts`
    - `src/lib/modules/hr/ot.ts`
    - `src/lib/modules/hr/swap.ts`
    - `src/lib/modules/hr/ot-actions.ts`
    - `src/lib/modules/hr/swap-actions.ts`
    - `src/lib/modules/hr/self-actions.ts`
    - `src/lib/modules/hr/actions.ts` (`cancelLeaveAction`)
  - Every hunk is marked `HR PRIV-3`.
- **R6 rule for the builder:**
  - ONE shared resolver: first the HR system of the caller's tenant, then the employee/run/adjustment inside that system, via `tenantDb(ctx)`.
  - It is called first in every payroll action.
  - Missing or foreign ⇒ the same fixed refusal the action gives for an unknown system. Nothing is written in any tenant.
  - `createPayrollRunAction` must no longer answer `{ok:true}` for an unknown system; that becomes the same refusal (asserted in 3b X3).
- **R6 squat leftovers (3b X6, RED):**
  - The rightful shop must be able to create a profile or run even when a foreign-tenant row already holds the same `(systemId, employeeId)` / `(systemId, periodKey)`.
  - Both unique indexes are cross-tenant today:
    - `HrSalaryProfile @@unique([systemId, employeeId])`
    - `HrPayrollRun_systemId_periodKey_live_key ("systemId","periodKey") WHERE status <> 'REVERSED'`
  - So X6 cannot turn green without a migration or a data-cleanup decision from the controller. The builder must not design one.

## R10 (controller ruling on X6): tenant-scoped unique keys, no data deleted
- **ONE migration:** a new folder, with a timestamp after the latest HR migration `20270111000000_hr_line_link`. Nothing else goes in it.
  - (a) `HrSalaryProfile`: `@@unique([systemId, employeeId])` becomes `@@unique([tenantId, systemId, employeeId])`, in the schema (`prisma/schema/payroll.prisma`) and in the migration (DROP INDEX `"HrSalaryProfile_systemId_employeeId_key"` + CREATE UNIQUE INDEX on (tenantId, systemId, employeeId)).
  - (b) `HrPayrollRun`: DROP INDEX `"HrPayrollRun_systemId_periodKey_live_key"`, then CREATE the same partial unique index on (`"tenantId"`, `"systemId"`, `"periodKey"`) `WHERE "status" <> 'REVERSED'`. This is raw SQL in the migration, like 20261202000000. The schema keeps its plain `@@index([systemId, periodKey])`.
  - The migration holds only index statements: no column change, no data change. It must be safe in the usual Prisma sense. `pnpm drift` must show no diff for these tables afterwards; the builder runs it.
  - Rows already squatting in another tenant stay untouched. They are in nobody's view and no longer block.
- **Compound-unique call sites:** none.
  - Grep of `src/` and `scripts/` for `systemId_employeeId`, `upsert`/`createMany` on these models, `ON CONFLICT` on these tables, and raw `INSERT INTO "HrSalaryProfile"/"HrPayrollRun"` found nothing.
  - `setSalaryProfile` uses `findFirst` + `update`/`create`. Duplicate runs are detected by a `tenantDb` pre-query (`payroll.ts:765`, `dupRunText`).
  - The `systemId_periodKey` hits in `account/gl.ts` on other branches are `AccountPeriod`, not HR.
  - So no call site needs changing. If the builder finds one, it uses the new key with the tenant from the caller's ctx.
- **Allowed files (R10):**
  - `prisma/schema/payroll.prisma`: the `@@unique` line(s) plus `HR PRIV-3` comments only.
  - `prisma/migrations/<new>/migration.sql`.
  - The earlier "no migration" static is replaced by "exactly this one migration" (qc-hr-priv-3 S6).
- **Lane DB:** the lane-5 QC branch is shared with lane 2. The builder runs `prisma migrate deploy` on it through the lane wrapper.
  - Old code on other branches keeps working against the new DB.
    - The Prisma client never enforces DB indexes.
    - No code uses the compound key in `where`, `upsert`, `connect`, `createMany skipDuplicates`, or `ON CONFLICT` on these tables.
    - Duplicate-run and existing-profile checks are tenant-scoped pre-queries.
  - The lane-2 agent must still be warned before the builder migrates:
    - `qc-hr-h0.6` S2.4 (expects `HrPayrollRun_systemId_periodKey_live_key` on (systemId, periodKey)) will fail on that DB.
    - `qc-hr-h1.3` S1.10 (byte-equal `pg_indexes.indexdef` of that index) will fail on that DB.
    - `pnpm drift` on a branch whose schema still has `@@unique([systemId, employeeId])` will show a diff.
  - These are DB-state oracles, not code breakage.
- **Oracle:**
  - 3b X6 stays as written; it should turn green with R10.
  - X7 (GREEN control): own-tenant uniqueness is kept.
  - X8 (GREEN control): foreign squat rows are unchanged.
  - qc-hr-priv-3 S6 (RED until built): exactly one index-only migration plus the schema swap.

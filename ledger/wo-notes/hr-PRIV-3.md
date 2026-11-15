# HR PRIV-3 — builder notes

Brief `ledger/hr-briefs/hr-brief-PRIV-3.md` (+ CONTROLLER RULINGS) · oracle `scripts/qc-hr-priv-3.mts` (+ `-lib`) · branch `wip/hr-priv-3` (lane 5) · base `ea2b41ea1` (oracle commit `21cabe3be`). No migration. `payroll-rules.ts` byte-identical.

## The helper (one place) — `src/lib/modules/hr/privacy.ts:53` `hrPageAccessOf` · `:67` `requireHrPage`
Pure, no DB. A malformed viewer gets all four values false: not an object, `role` not a string, or `permissions` missing or not an object. `requireHrPage(v, page)` = `hrPageAccessOf(v)[page]`. Any page other than register/leave/payroll ⇒ false.
It is built only from existing checks:
- register = `hrAccessOf(v).openProfile`
- leave = `evaluate` of any of `hr.leave.request|read|decide`, `hr.employee.create`, `hr.payadjust.request|approve`, `hr.payroll.read`. `evaluate` already returns true for OWNER and MANAGER (tenant level), so there is no extra role test.
- payroll = `canViewPayroll` ∨ `canReadWorkEntries` ∨ `canRequestStockCharge` ∨ `canSeeStockCharges`
- leaveOnBehalf = `evaluate(hr.employee.create)` ∨ `evaluate(hr.leave.decide)`. These two calls moved here from `actions.ts` `requestLeaveAction`, which now calls the helper (`actions.ts:415`). The semantics are the same. The only difference: `permissions: null` used to throw for STAFF, and now it is simply false.

### Truth table (oracle G1 · 11 viewers + API key)
| viewer | register | leave | payroll | onBehalf |
|---|---|---|---|---|
| O owner | ✓ | ✓ | ✓ | ✓ |
| M manager `*` | ✓ | ✓ | ✓ | ✓ |
| MB manager branch | ✓ | ✓ | ✓ | ✓ |
| P payroll `*` | ✓ | ✓ | ✓ | ✗ |
| PB payroll branch | ✓ | ✓ | ✓ | ✗ |
| S staff + `hr.leave.request` (linked) | ✗ | ✓ | ✗ | ✗ |
| S0 linked, no keys | ✗ | ✗ | ✗ | ✗ |
| SR unlinked + `hr.leave.request` | ✗ | ✓ | ✗ | ✗ |
| SD staff `hr.leave.read/decide/request` | ✓ (leave.read ⇒ openProfile) | ✓ | ✗ | ✓ |
| K kiosk (`hr.attendance.clock`) | ✗ | ✗ | ✗ | ✗ |
| N member (no keys) | ✗ | ✗ | ✗ | ✗ |
| API key (`hr.employee.read`) | ✓ | ✗ | ✗ | ✗ |

## Page guards (each right after `if (!sys) notFound()`, before any other await, `hrTabsFor` or render)
- `src/app/app/sys/[id]/hr/employees/page.tsx:17` — `requireHrPage(hrViewerOf(auth), "register")`
- `src/app/app/sys/[id]/hr/leave/page.tsx:17` — `"leave"`
- `src/app/app/sys/[id]/hr/payroll/page.tsx:41` — `"payroll"` (comes before `getTranslations`, the period parsing and the server-action closures)

A refused viewer gets the same thrown not-found as an unknown system id, after the same number of SQL queries (only the `appSystem` lookup). Nothing is rendered. Oracle P1–P3 compare digest, SQL count, html and client props.

## Leave picker (R3) — `ui.tsx` HrLeaveSection
- The list of other employees (`listEmployees`) is read only when `leaveOnBehalf`. Otherwise it is `[]`, with no query.
- The form shows when:
  - `leaveOnBehalf` and there is at least 1 employee in scope (as today, including the "พนักงาน" select), or
  - not on-behalf but the account is linked to an employee of **this** system. That is the same test as `hrTabsFor`: `employeeOfUser(...).systemId === systemId`. In this case the select is not rendered, and `requestLeaveAction` already files for the linked row.
- An unlinked viewer without on-behalf gets no form.
- The attachment note `hr-leave-attach` follows the form.
- OT picker / `HrOtSection` unchanged (body sha = base, S3).

## Nav / hub
- `nav.ts`: `gateOf` returns `register|leave|payroll` for `/hr/employees|leave|payroll`; `hrNavFilter` cases call `requireHrPage`. Sidebar (`layout.tsx`) and `hrTabsFor` follow; `hrTabs` byte-identical.
- `ui.tsx` HrHub: the cards for leave, employees (with the "n คน" count) and payroll are filtered through `hrPageAccessOf(hv)` in one hunk. Nothing else in HrHub changed.

## Ruling (1) — base check (scratch render, oracle shim, base `21cabe3be`, script `/tmp/hr-ctl/priv3-build/sd-payroll.mts`, residue none)
SD (STAFF `*`, `hr.leave.request/read/decide`, no pay key) on `/hr/payroll` today renders:
- the header and tabs
- the PayrollSection note "ข้อมูลเงินเดือนจำกัดเฉพาะเจ้าของกิจการหรือผู้ได้รับสิทธิ์ …"
- **0 testids**, and no client component except `module-tabs`

It has no work-entries panel, no stock section, no run/bank/filing/cert/YTD section. The render is byte-for-byte the same text as K/N/S. So no real section is lost, and SD gets not-found (oracle P3).

## Import cycle (ruling 3) — RULED: keep the direct import, recorded as a debt
R1/S1 require `privacy.ts` to import `./work-entries` and `./stock-charge`. work-entries was already in privacy's import cycle on base. stock-charge was not, and it now joins it through `stock-charge → payroll → work-entries → judge → roster-board → privacy`.

The true strongly-connected set was judge, payroll, roster-board, work-entries. It is now those four + stock-charge (checked with a full reachability script, `/tmp/hr-ctl/priv3-build/scc.mjs`).

Oracle S5 is green only because its DFS marks `payroll` as seen before it reaches stock-charge, so it does not see the new member. The two rules cannot both hold: building the payroll gate from `canRequestStockCharge`/`canSeeStockCharges` (R1/S1) is what puts stock-charge in the cycle that ruling (3) forbids.

Runtime risk is low: privacy only calls stock-charge functions at call time, and there is no module-level use. The alternative would be to restate `canViewPayroll ∨ evaluate(hr.payadjust.request)` in privacy, which is a rule copy and fails S1. The controller should decide.

`nav.ts → privacy` adds no cycle: nav already reached privacy through roster-board, and privacy does not reach nav.

## ORACLE-EDITs (each hunk marked `ORACLE-EDIT (HR PRIV-3 · controller)`)
- `scripts/fitness-hr.mts` `PAGE_GUARD_BASELINE`: leave, employees and payroll rows removed; kiosk kept (Q4). Nothing else in the file.
- `scripts/qc-hr-h2.10.mts` S7.1: the expected tabs for `/hr/employees|leave|payroll` = `privacy.requireHrPage` (was always shown).
- `scripts/walk-hr-matrix.json`: S removed from `02-employees` and `11a-payroll-open`. S added to refusals `r-employees` and `r-payroll`. Each changed entry has a `$priv3Note`.
- `scripts/hr-ui-inventory.json`:
  - `hr-register-status-*` and `hr-register-create-unit` gain `staff` in hiddenFor (Q1).
  - `hr-ot-approve/reject/revoke`: payroll moves from hiddenFor to roles (Q2 / H2.9 Q4).
  - `hr-leave-policy/halfday/hours/attach` gain `payroll` in hiddenFor (an unlinked payroll viewer gets no form). The conditional text of policy/halfday is updated.
- `scripts/visual-hr.mts:60` (tracked spec, H1.1 R8 `register-branches`): `expect: { staff: 404 }` added. The owner shot is unchanged.

## Older-oracle acceptances (explicit allowlists, every hunk marked `ORACLE-EDIT (HR PRIV-3 · controller)`)
Each acceptance lists exact files, and a file is accepted only if every diff hunk adds a line containing `HR PRIV-3`.
- `scripts/qc-hr-priv-2.mts` S4/S5 — `P3_FILES` + `p3Ok`:
  - S4 (oracles): the priv-3 oracle and its lib, h2.10, h3.9, h4.3-lib.
  - S5 (product files): privacy, nav, ui, actions and the 3 pages. privacy and actions are also dropped from the PRIV-2 unmarked-hunk scan.
- `scripts/qc-hr-h4.3-lib.mts` S1.6 — `P3_ALLOW` + `p3Ok`: hr `privacy.ts`, plus the oracles priv-3, priv-3-lib, h2.10, h3.9 and priv-2.
- `scripts/qc-hr-h3.9.mts`:
  - S1.8 (nav.ts unchanged): `PRIV3_ALLOW`, nav.ts accepted with marker `HR PRIV-3`. There is still no "รายงาน" tab.
  - S1.10 (shared files marked): visual-hr.mts accepted with marker `ORACLE-EDIT (HR PRIV-3`.
- `scripts/qc-hr-h3.8.mts` S1.13 (privacy.ts sha pin): **not re-taken**. Per the controller ruling (head `de35dec45` follow-up), re-taking this pin waits on the owner. The pinned value is restored exactly as on base, and h3.8 is expected to stay at **77/78 with only S1.13 red** (privacy.ts sha = `a5a3cabc…` against pin `ea0017fa…`). `qc-hr-h3.8.mts` was removed from the PRIV-3 allowlists in priv-2 and h4.3-lib. No code was moved out of privacy.ts to dodge the pin.

Statics the brief expected to trip but that stayed green, with no edit:
- frozen-file lists in h2.11, h2.5, h3.1, h4.6 S14.1
- h0.7 around :273

They were not touched.

## Debts / observations
- **privacy.ts ↔ stock-charge joins the existing cycle; S5 passes only by search order.** Controller ruling: keep the direct `./stock-charge` import (no copy of the rule). Functions are called only at call time, and privacy.ts is already in this cycle on base.
- reports/export answers 400 for an invalid period on a real system but 404 on an unknown one (oracle doubt 5). Out of scope (ruling 4).
- The hub "ลงเวลา" card is still shown to everyone (attendance has its own gate; P/PB/SR/SD/K/N get 404 there). Out of scope (brief: nothing else in HrHub).
- The hub still runs `listEmployees` for every viewer (only the count is hidden). Removing the read would be a second hunk in the VIS-5b area.
- A linked viewer with leave-page access but no `hr.leave.request` (e.g. linked payroll) still sees the self form, and the action refuses it. This is the same as base, where they saw the form with the picker.
- The leave form for a viewer linked in a different HR system of the same shop is hidden on this page. `requestLeaveAction` would file into their own system.

## Runs (lane 5, wrapper `iso.sh qc-hr.sh with-gate-lock.sh`, logs `/tmp/hr-ctl/priv3-build/logs/`)
- `seed-hr-qc` 34/34.
- `qc-hr-priv-3`: forced ×4, 26/26 each, `RESIDUE none`. Unforced ×1: 26/26, residue none.
- First pass (before the acceptances):
  - green: `qc-hf-hr-privacy` 194/194 · money-2 57/57 · hf-sso 41/41 · h0.2 58 · h0.6 55 · h0.7 74 · h1.1 81 · h1.2 73 · h1.3 63 · h2.4 68 · h2.5 79 · h2.6 56 · h2.7 94 · h2.9 58 · h2.10 57 · h2.11 70 · h3.1 58 · h3.4 85 · h4.1 47 · h4.4 86 · h4.5 90 · h4.6 69 · h4.8 48 · set-1 25 · qc-hr 9 · qc-hr-attendance 31 · qc-hr-roster · qc-hr-leave-booking 14 · qc-payroll 19 · qc-pages 31 · fitness-hr 9/9 · fitness 54/54
  - red (fixed by the acceptances above): priv-2 S4/S5 · h3.8 S1.13 · h3.9 S1.8/S1.10 · h4.3 S1.6
- After the acceptances, all green: priv-2 47/47 · h3.8 78/78 · h3.9 60/60 · h4.3 45/45 · h2.10 57 · h2.11 70 · h4.8 48 · h1.1 81 · h2.5 79 · h4.5 90 · fitness-hr 9/9 · fitness 54/54.
- Without DB env (`env -u DATABASE_URL -u DIRECT_URL`): fitness-hr 9/9 · fitness 54/54.
- `qc-nav-functions`: S5 red on HOTEL (3/17) and BOOKING (5/10) routes. The same red reproduces on the committed HEAD snapshot (`git archive HEAD`), so it is not caused by PRIV-3. HR lines are fine (HR 10/11 routes, nothing missing). This is a non-HR oracle and was not edited.
- Clean typecheck (`rm -rf .next/types tsconfig.tsbuildinfo`, ISO_MEM=14000M, MemAvailable 20 GB): exit 0.
- `qc-hr-h0.4` has no suite file (its checks live in fitness-hr).

## Rulings follow-up (after de35dec45)
- h3.8 S1.13 edit reverted. `scripts/qc-hr-h3.8.mts` is identical to base, and it was removed from the PRIV-3 allowlists in priv-2 and h4.3-lib.
- A stray `sed` hit while removing that entry also touched h4.3-lib `P2_ALLOW`. That line was restored byte-for-byte from base.
- Reruns:
  - h3.8 **77/78**, only S1.13 red (left red on purpose: waiting on the owner)
  - qc-hr-priv-3 26/26, residue none
  - priv-2 47/47
  - h4.3 45/45
  - h3.9 60/60
  - fitness-hr 9/9
- The two earlier lines in "Runs" ("h3.8 78/78" and "h3.8 S1.13 fixed by acceptances") describe the old head. They are superseded by this section.

## r2 fix round (CONTROLLER RULINGS r2 · R6/R7/R10)
### R6 — one resolver `src/lib/modules/hr/hr-target.ts` `hrTargetOwned(ctx, { employeeId?, runId?, adjustmentId? })`
The module is new, with the header `HR PRIV-3`. It imports only `tenantDb`, so it joins no import cycle.
- Step 1: the HR system must exist in the caller's own tenant (`ctx.tenantId` always comes from the session): `tenantDb(ctx).appSystem` with `{ id, type: "HR" }`.
- Step 2: each id that is passed must be found inside that system, through `tenantDb(ctx)` (the system-scope filter of core): `hrEmployee`, `hrPayrollRun`, `hrPayAdjustment`.
- No permission rule lives in this module.

It is called right after the existing key and branch gates, which are pure (no data read), and before any read or write. A refused call returns the action's own unknown-system / empty-input answer:

| action | resolver | refusal |
|---|---|---|
| `setSalaryProfileAction` | system + employee | `return` (void, like empty input) |
| `createPayrollRunAction` | system | `{ ok:false, reason: "คำสั่งไม่ถูกต้อง" }` (same as a missing systemId) |
| `markPaidAction` | system (controller correction: an unknown run in our OWN system keeps its existing audit row) | `return` (no audit) |
| `reverseRunAction` | system (same correction: the `…refused` NOT_FOUND audit row in our own system is kept) | `return` (no audit) |
| `reverseRunV2Action` | system | `{ ok:false, reason: "คำสั่งไม่ถูกต้อง" }` |

The other 48 actions in the 8 payroll action files are unchanged. Oracle 3b X3 pins that they already give the same outcome for our ids as for an unknown system, with nothing written.

Controller correction: in the caller's own system, an unknown run on reverse/markPaid keeps its existing refused-audit row. Only a foreign or non-existent SYSTEM writes nothing. No oracle check needed the silent no-op.

### R7 — form paths give one fixed text
The services gained an opt-in option, `hideForeign`, and only the form actions pass it, so the service defaults are unchanged. h2.3 S2.3, h2.9 S3.3 and h2.6 pin the old texts through direct service calls, and those still pass.

| service | with `hideForeign` |
|---|---|
| `cancelLeave` | a non-party (not linked, not a chain requester, not the filer) gets `CANCEL_NOT_FOUND` instead of `CANCEL_NOT_MINE`. Parties keep their texts. |
| `cancelOtRequest` | not the requester and not the employee ⇒ `T.notFound` |
| `respondSwap` | `T.notYours` ⇒ `T.stale` (the unknown-id text) |
| `cancelSwap` | `T.notOwn` ⇒ `T.stale` |

The form actions that pass `hideForeign`: `cancelLeaveAction`, `cancelOtAction`, `respondSwapAction`, `cancelSwapAction`.

### R10 — schema + migration (written, `prisma generate` run; NOT applied to the lane DB, per the controller)
- `prisma/schema/payroll.prisma`: `HrSalaryProfile @@unique([tenantId, systemId, employeeId])`.
- `prisma/migrations/20270112000000_hr_tenant_scoped_unique_keys/migration.sql` contains 2× DROP INDEX and 2× CREATE UNIQUE INDEX:
  - `HrSalaryProfile_tenantId_systemId_employeeId_key`
  - partial `HrPayrollRun_tenantId_systemId_periodKey_live_key` `WHERE "status" <> 'REVERSED'`
- Grep for compound-unique call sites: `systemId_employeeId` / `systemId_periodKey_live` in src (excluding account) gives only a comment in `payroll.ts:51`. There are no upsert / ON CONFLICT uses. Nothing to change.

### r2 allowlist acceptances (every hunk marked `HR PRIV-3`)
- `qc-hr-priv-2` `P3_FILES`, in addition to the earlier entries:
  - payroll-actions, hr-target, service, ot, swap, ot-actions, swap-actions
  - `qc-hr-priv-3b.mts`
  - the R10 schema and migration
- The priv-2 S4 FROZEN check now also skips `p3Ok` files.
- `qc-hr-h4.3-lib` `P3_ALLOW` gains `qc-hr-priv-3b.mts`, `payroll-actions.ts`, and the R10 schema + migration. The `ai` part (frozen `prisma` dir) is now accepted file by file through `p3Ok`.

### r2 runs (lane 5 wrapper, head after `2fea7f599`; logs `/tmp/hr-ctl/priv3-build/logs/{c1,d,e}-*`)
- qc-hr-priv-3: forced ×3 and unforced ×1, **28/28** each, residue none. S6 is a static check and does not need the applied DB.
- qc-hr-priv-3b: forced ×3 and unforced ×1, **12/13** each. Only **X6** is red: a Prisma unique error from the cross-tenant indexes, which waits for the migration. Residue none in both tenants. X1–X4 and Y1 are green.
- Green:
  - qc-payroll 19/19 · qc-payroll-reverse 14/14 · qc-hr-payadjust 27/27 · qc-audit-trail 21/21 · qc-hf-hr-privacy 194/194
  - priv-2 47/47 · money-2 57/57 · hf-sso 41/41
  - h0.6 55/55 · h0.7 74/74 · h1.3 63/63 · h2.3 79/79 · h2.4 68/68 · h2.6 56/56 · h2.9 58/58
  - h3.3 51/51 · h3.4 85/85 · h3.5 53/53 · h3.6 62/62 · h3.7 68/68
  - h4.3 45/45 · h4.8 48/48 · qc-hr 9/9 · leave-booking 14/14
  - fitness-hr 9/9 and fitness 54/54 (with env and with `env -u DATABASE_URL -u DIRECT_URL`)
- h3.8: 77/78, only S1.13 red (left as is; owner decision pending).
- Clean typecheck: exit 0. The first attempt timed out waiting for a heavy slot; the retry passed.
- The preprod suites are not on this branch and were skipped.

### Waits for the migration (controller go-ahead after lane 2 finishes)
1. `bash scripts/iso.sh bash scripts/qc-hr.sh pnpm exec prisma migrate deploy` (lane 5 wrapper).
2. Authorised ORACLE-EDITs `qc-hr-h0.6` S2.4 and `qc-hr-h1.3` S1.10: expect the new index name and definition.
3. `pnpm drift` clean for HrSalaryProfile/HrPayrollRun.
4. Rerun priv-3b; X6 is expected to turn green, with X7/X8 still green.

### Migration applied (controller go-ahead after lane 2 finished)
- `prisma migrate deploy` (lane 5 wrapper) applied `20270112000000_hr_tenant_scoped_unique_keys`. pg_indexes now shows:
  - `HrSalaryProfile_tenantId_systemId_employeeId_key`
  - `HrPayrollRun_tenantId_systemId_periodKey_live_key` (partial)
- `pnpm drift` (exit 2). The full diff list is a single entry: **`DormUtilityRate`** — "Removed unique index on columns (unitId, buildingId, kind, periodKey)". That is a non-HR raw index on the shared DB, not from PRIV-3. HrSalaryProfile and HrPayrollRun show no diff.
- ORACLE-EDITs `(HR PRIV-3 · controller)`:
  - `qc-hr-h0.6` S2.4: the live index is the new name on (tenantId, systemId, periodKey).
  - `qc-hr-h1.3` S1.10: `FROZEN_IDX_LIVE` is the new byte-equal indexdef, and the lookup uses the new name.
  - Both files are added to the priv-2 `P3_FILES` and h4.3-lib `P3_ALLOW` allowlists.
- Runs after migrate:
  - priv-3 28/28 ×4 (forced ×3 + unforced)
  - priv-3b **13/13 ×4** (X6 green · X7/X8 green)
  - h0.6 55/55 · h1.3 63/63 · h3.3 51/51 · h3.4 85/85 · h3.7 68/68
  - qc-payroll 19/19 · payroll-reverse 14/14 · priv-2 47/47 · h4.3 45/45
  - fitness-hr 9/9 · fitness 54/54 (both modes)

## Merge of local `session/hr` (HR-PREPROD-1 + HR-LEAVE-3) — merge commit `9fef78ee2`
- Conflicts (3 files):
  - `payroll-actions.ts` imports: both kept (`hrTargetOwned` + `inPayScope, PAY_SCOPE_NO_ACCESS_TEXT`).
  - `qc-hr-priv-2.mts` S4/S5: all lists kept (P3_FILES/p3Ok + PP1_*/pp1Ok + LEAVE-3 mixRes/mixOk). `mixRes` also accepts "HR PRIV-3" for P3_FILES.
  - `qc-hr-h4.3-lib.mts` S1.6: all lists kept (P3_ALLOW/p3Ok + PP1/pp1Marked + L3/l3Marked + mixMarked). `mixMarked` also accepts P3_ALLOW with "HR PRIV-3".
- Auto-merged with no conflict: privacy.ts (`hrPageAccessOf`/`requireHrPage` and PREPROD-1 `adjustmentReplyOutOfPayScope` both present), actions.ts, service.ts (R7 `hideForeign` next to LEAVE-3), ot.ts, ui.tsx, qc-hr-h3.9.mts. The inventory and walk matrix merged cleanly (JSON valid).
- `scripts/qc-hr-h3.8.mts` was not touched. After the merge it is 77/78 on S1.13 (privacy.ts sha `06e0ac17…`); the controller re-takes that pin.
- Post-merge explicit acceptances, each hunk marked `ORACLE-EDIT (HR PRIV-3 · controller merge)`:
  - `qc-hr-leave-3` ST2/ST3: P3_FILES (exact list) + P3_DATA (inventory and walk-matrix JSON, by name); frozen list filtered by `p3Ok`.
  - `qc-hr-preprod-1` ST2: the same `p3Ok` on the frozen list (prisma, ot.ts, ot-actions.ts).
  - `qc-hr-h3.9` S1.2: the HrSalaryProfile block may differ by the R10 `@@unique` swap hunk marked "HR PRIV-3".
  - priv-2 `P3_FILES` and h4.3-lib `P3_ALLOW` now also list qc-hr-leave-3 and qc-hr-preprod-1.
- Merged-tree runs:
  - priv-3 28/28 ×4 (forced ×3 + unforced); priv-3b 13/13 ×4; residue none
  - preprod-1 57/57 · preprod-1b 25/25 · preprod-1c 16/16 · leave-3 53/53 · leave-3b 11/11
  - money-2 57/57 · priv-2 47/47 · hf-sso 41/41 · hf-hr-privacy 194/194
  - h0.6 55/55 · h1.3 63/63 · h2.4 68/68 · h2.10 57/57 · h3.9 60/60 · h4.3 45/45
  - **h3.8 77/78 (S1.13 only)**
  - qc-approval 16/16 · qc-payroll 19/19 · payroll-reverse 14/14 · payadjust 27/27
  - fitness-hr 9/9 · fitness 54/54 (both modes)
  - clean typecheck exit 0 (tsconfig does not include `.mts`, so the later oracle edits do not affect it)

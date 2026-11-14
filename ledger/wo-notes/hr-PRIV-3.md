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

## Import cycle (ruling 3) — OPEN
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
  - S4 (oracles): the priv-3 oracle and its lib, h2.10, h3.8, h3.9, h4.3-lib.
  - S5 (product files): privacy, nav, ui, actions and the 3 pages. privacy and actions are also dropped from the PRIV-2 unmarked-hunk scan.
- `scripts/qc-hr-h4.3-lib.mts` S1.6 — `P3_ALLOW` + `p3Ok`: hr `privacy.ts`, plus the oracles priv-3, priv-3-lib, h2.10, h3.8, h3.9 and priv-2.
- `scripts/qc-hr-h3.9.mts`:
  - S1.8 (nav.ts unchanged): `PRIV3_ALLOW`, nav.ts accepted with marker `HR PRIV-3`. There is still no "รายงาน" tab.
  - S1.10 (shared files marked): visual-hr.mts accepted with marker `ORACLE-EDIT (HR PRIV-3`.
- `scripts/qc-hr-h3.8.mts` S1.13 — privacy.ts sha pin re-taken: `ea0017fa…` → `a5a3cabc…`. This is a conscious re-take, the same convention the H4.8 and PRIV-2 re-takes used. self.ts pin unchanged.

Statics the brief expected to trip but that stayed green, with no edit:
- frozen-file lists in h2.11, h2.5, h3.1, h4.6 S14.1
- h0.7 around :273

They were not touched.

## Debts / observations
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

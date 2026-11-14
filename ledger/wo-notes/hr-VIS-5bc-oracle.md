# HR VIS-5b / VIS-5c — oracle notes (tests first)

Head: `wip/hr-vis-5bc` (lane 1) · base = merge-base(HEAD, local `session/hr`) = 09713f430 (override `QC_VIS5_BASE`) · briefs `ledger/hr-briefs/hr-brief-VIS-5b.md`, `-5c.md` (+ CONTROLLER RULINGS 15 Nov) · review `hr-H5.1-visual-review-r1.md`.

## Files
- `scripts/qc-hr-vis-5-lib.mts` (19 KB): shared statics (diff vs base with base line numbers, per-ticket file/hunk/range rules, messages, inventory, pinned bodies) + in-process renderer.
- `scripts/qc-hr-vis-5b.mts` (32 KB, + lib = 51 KB) · `scripts/qc-hr-vis-5c.mts` (30 KB, + lib = 49 KB). Both suites are independent (5b can merge without 5c and back).
- Run (lane 1 DB only): `bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/qc-hr-vis-5b.mts` (same for `-5c`). `--list` prints the registry. Without QC_FORCE a suite skips until its ticket marker exists (5b: `HR VIS-5b` in hub-rules.ts/ui.tsx · 5c: `HR VIS-5c` in people-rules.ts/people-ui.tsx).

## Method (no browser, no server)
Earlier HR UI oracles render with `react-dom/server` inside a Next request scope (priv-2 C1, h1.1 S10). New here, because the hub and the profile use `next-intl/server` and client components with hooks:
- `next-intl/server` is resolved (CJS `Module._resolveFilename`) to an in-memory shim with the same messages as `src/i18n/request.ts` (common.json + pos.json); missing keys render `‹MISSING:ns.key›` and are recorded.
- A resolver awaits every server component and keeps every `"use client"` component (exports of all `"use client"` files under `src/lib/modules/hr` + `src/components`, plus anything that throws on a hook call) as an element, recording its props. `clientText` = serialised props of all client components = what reaches the browser/RSC. HTML = `renderToStaticMarkup` inside `NextIntlClientProvider` + `AppRouterContext` (stub router).
- Whole pages are rendered (`sys/[id]/page.tsx`, `hr/employees/page.tsx`, `[employeeId]/page.tsx`) with params/searchParams as the viewer's session cookie — so the wiring page → section is tested, not a component in isolation.
- Own tenants only (`qc-hr-vis5b-*`, `qc-hr-vis5c-*`), generic tenant sweep + `cleanupFx`; residue none on every run.

## Registries — forced on base (09713f430), lane-1 DB, 15 Nov
| suite | checks | RED-by-design | GREEN controls | base passes | BASE-EXPECTATION | residue |
|---|---|---|---|---|---|---|
| qc-hr-vis-5b | 29 | 17 | 12 | 12/29 | 29/29 | none |
| qc-hr-vis-5c | 29 | 17 | 12 | 12/29 | 29/29 | none |

5b RED: S5 (hr.hub) · S6 (inventory) · S8 (hub-rules/facade) · S9 (kpisOf) · S12 (ModuleTabs [] + opt-in) · S13 (kiosk tabs; base gives the kiosk account 5 tabs) · K1 K2 K3 (tiles; base: today tile = rows.length 3≠… and 4 tiles missing) · B1 B2 · A1 (base hub uses `compact` ⇒ no checkboxes) · M1 · D1 · L1 · G1 · I1.
5b GREEN: S1 S2 S3 S4 S7 S10 S11 · K4 (no other-branch data for a branch manager) · P1 (manager: no ฿/salary · payroll viewer: no board/KPIs) · P2 (labour card owner+payroll, not manager) · G2 · Z1.
5c RED: S5 S6 S9 S10 · R1–R6 · R9 · V1 (base: owner/payroll viewers get the full ID/SSO/bank/house in the client props of EmployeeProfileForm — 4 hits each; this is also the positive control of the leak detector) · V3 V5 V6 V8 V9.
5c GREEN: S1 S2 S3 S4 S7 S8 · R7 R8 · V2 (not entitled: nothing, default and `?edit=1`) · V4 (`?edit=1` entitled: full value in the form, as today) · V7 (bow: banner + checklist 5/7) · Z1.

Positive controls of the statics (not in the registry): with `QC_VIS5_BASE=HEAD~60` the same functions report 239 files outside the 5b list, unmarked hunks in InboxBatch/overview-ui/[employeeId]/page.tsx, and message keys changed outside `hr.hub`/`hr.people`.

## Contracts the builders must meet (interpretations where the brief is silent — flag if wrong)
Common
- Diff: own files only (5b: sys/[id]/page.tsx · module-tabs.tsx · overview-ui.tsx · InboxBatch.tsx · new hub-ui.tsx/hub-rules.ts · 5c: employees/page.tsx · [employeeId]/page.tsx · EmployeeProfileForm.tsx · new people-ui.tsx/people-rules.ts); shared: ui.tsx by range (5b 88-117 + 710-793, 5c 432-709; import block for both; the other ticket's hunks are tolerated only in its own range with its own marker), messages (only `hr.hub` / `hr.people` keys may change), inventory, `walk-hr-matrix.json`, the three VIS-5 oracle files, `ledger/**`; any older `scripts/qc-*.mts` only when every hunk adds `ORACLE-EDIT (HR VIS-5`. Other ticket's own files ⇒ S1 RED.
- Every hunk of an own file adds the ticket marker; new files carry it in the first 3 lines.
- No Thai character outside comments in added lines of own .ts/.tsx (Thai text goes to `hr.hub` / `hr.people`).
- Pinned bodies (sha16 of comment-stripped body at base): decideInboxAction · decideInbox · teamOverviewWithPreview · loadAttendanceBoard · lifecycleDue · loadReport · reportAccessOf · meetsPattern · hrNavFilter · hrTabs · HrLaborCard · canRunKiosk (5b); loadEmployeeProfileForViewer · employeeProfileInputFromForm · hrAccessOf · save/create/update/remove/setWorkSchedule actions · leaveBalances · cardSubjectOf · employeeLineStatus · loadLifecycleForViewer · employeesOnLeave · listEmployees · listRemovedEmployees (5c).
5b
- `hub-rules.ts` exports `kpisOf(board)` (also accepted: `kpisOf(board.rows)`) returning `{ onShift, arrived, late, notIn, leave }` as PERSON counts: onShift = rows with a slot that has a shift and status ∉ {LEAVE, DAY_OFF, NO_SCHEDULE}; arrived = rows with a slot with inAt; late = rows with a LATE slot; notIn = rows with a slot `!final && (phase NOT_IN || (ABSENT && !inAt))`; leave = rows with a LEAVE slot.
- Tile numbers are rendered as their own text node (`<span>8</span>`) inside `hr-overview-today` (อยู่กะ) and `hr-hub-kpi-arrived|late|notin|leave`.
- `hr-hub-board-row-<employeeId>` for exactly the board rows having a shift slot (not DAY_OFF/NO_SCHEDULE); the row contains the name. Month card talk rows `hr-hub-month-talk-<employeeId>`; card numbers late/absent/leave = `loadReport(time, YYYY-MM).totals` (as number or the exact string). Due strip shows the 3 earliest `lifecycleDue` items by date (names), `+N` for the rest, and a link to /hr/employees. Day pickers `hr-hub-day-prev|next` are links whose `?day=` = board.prevDay / nextDay; `hr-hub-unit` lists the board's units; `hr-hub-add-employee` → `/hr/employees?add=1`.
- HR strip: the element that directly wraps the tab links carries `data-scroll="x"` and `md:flex-wrap`; ModuleTabs([]) renders nothing; without the new prop the markup of a non-HR strip is byte-identical (golden sha16 `dd39eef383f01a0c`, items with/without `data-testid`).
- Kiosk-only viewer: `hrTabsFor` = [], no tab links, one card `hr-hub-kiosk-link` → /hr/kiosk, no "N คน".
- `?day=` and `?unit=` reach HrHub from sys/[id]/page.tsx (K2 renders the whole page with `?day=yesterday`).
5c
- Mask helpers in `people-rules.ts` are found by behaviour (any export): `f("1100000000021")` and `f("1-1000-00000-02-1")` → `x-xxxx-xxxxx-02-1`; SSO `f("1234567821")` → `xxx-xxx-xx21`; bank `f("KBank","1234564321")` or `f({bankName, bankAccountNo})` → `KBank xxx-x-x4321`; junk (`"12"`, `"abc"`, `""`, null, undefined, `"12-3"`) → `—` (bank: result contains `—` and not the digits).
- Register rows `hr-people-row-<employeeId>` (code also accepted); status tabs are links whose label contains ทั้งหมด / ประจำ / พาร์ทไทม์ / ทดลองงาน / สิ้นสุด and whose count is its own text node; data classes: ประจำ = FULL_TIME (status ACTIVE) · พาร์ทไทม์ = PART_TIME + DAILY · ทดลองงาน = PROBATION · สิ้นสุด = removed only; search = a GET input (its `name` is read from the markup); pages via `hr-people-page-*` links (20 per page); `?add=1` ⇒ the `<details>` that holds `hr-people-add-name` is `open`.
- Profile read view: `hr-profile-mask-*` (≥ 2) show the masked strings; eye `hr-profile-reveal-*` is an `<a>` with `edit=1` in its href; `hr-profile-edit` link with `edit=1`; `hr-profile-tab-*` ≥ 4 links with a `tab` param, exactly one `aria-current`; `hr-profile-connections`; EmployeeProfileForm is not rendered at all without `?edit=1`; edit view has `hr-profile-footer` + `hr-profile-unit`. Dates: th `formatThaiDateFull` (birth 1998-11-14 → 14 พ.ย. 2541, start), en `formatShortDate(d,"en")`, no ISO/`mm/dd/yyyy`/`type="date"` in the default view.
- `?emp=<id>` on the register: `hr-people-panel` with that person's name and masked numbers only.

## Only pictures can prove (controller walk)
Hour axis + now-line + bar geometry of the timeline · 390 stacked board / sticky batch bar / sticky profile footer · fold contents per size · strip wrapping at ≥ 768 and the 390 scroller, "nothing clipped" · the two-column split actually at 1440 (S/L1 only see class markers) · 7-col folding at 1024 and cards at 390 · add-panel name width ≥ 16rem · token colours/now-line colour · TAP-44 sizes · EN-THAI coming from other namespaces.

## Older statics that need explicit ORACLE-EDITs (not edited here)
- This oracle commit itself already trips, on this branch: `qc-hr-priv-2` S4 (changed `scripts/qc-*.mts` without a PRIV-2 marker: qc-hr-vis-5b/-5c/-5-lib) and `qc-hr-h4.3-lib` S1.6 `oracles` — both need `VIS5_ORACLES` (= qc-hr-vis-5b · qc-hr-vis-5c · qc-hr-vis-5-lib · qc-hr-priv-2 · qc-hr-h4.3-lib). Note the brief's list omits the lib file.
- VIS-5b builder: `qc-hr-priv-2` S5 for sys/[id]/page.tsx · components/module-tabs.tsx · hr/ui.tsx · overview-ui.tsx · InboxBatch.tsx · hub-ui.tsx · hub-rules.ts (`VIS5_SRC`) + S4/`h4.3-lib` S1.6 as above.
- VIS-5c builder: `qc-hr-priv-2` S5 for hr/employees/page.tsx · [employeeId]/page.tsx · EmployeeProfileForm.tsx · people-ui.tsx · people-rules.ts (+ hr/ui.tsx if it lands first).
- Not frozen-list trips but statics that must stay green (no edit expected): h2.11 S1.6 (overview-ui imports — keep slots), h2.10 S10.7 (`=== systemId` in hrTabsFor), h3.9 S1.8 (hrTabs/nav.ts), qc-hf-hr-privacy S-2/S-3/S-5, fitness-hr F16.1/F16.3 (employees page stays in PAGE_GUARD_BASELINE). h0.x–h4.x frozen lists are "n/a once in base" and do not name these files except the above.

## Doubts about the briefs
1. "notIn" person vs slot (attendance-ui:143 is slot-level) and onShift for split shifts — I count persons; say if slots are meant.
2. Month card: OT figure not tested (minutes vs count unspecified); leave = time-report `leaveDays` (it read 0.0 for an approved LEAVE day in the fixture — the report and the board disagree; not this ticket's to fix, but the card will show 0 next to a LEAVE tile of 1).
3. M1 premise needs 3 late days in the current month: running on the 1st–3rd of a month gives a false RED on M1 (talk list empty).
4. Brief 5b §7 asks VIS-5b's oracle writer to make the allowlist commit; this run was told not to edit older oracles — controller decides who adds `VIS5_SRC`/`VIS5_ORACLES`.
5. Tab "ประจำ" vs CONTRACT type: not seeded; where CONTRACT lands is unspecified (counts sum would break if it lands nowhere).
6. 5c "SHARK account linked yes/no" and "PIN status" columns are not asserted (no stable text in the brief) — walk only.

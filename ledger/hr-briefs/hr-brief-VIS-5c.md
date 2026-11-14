# HR VIS-5c — employee register + employee profile (mockup 02) · number masking

Base `session/hr` 09713f430 · every hunk marked `HR VIS-5c` · no business-logic, action or privacy-rule change.
Inputs: review r1 · `/root/qc/hr-h5.1/{02-employees,03-employee-namfon,cov-0[23]-*}` · `ledger/design-hr/02-employees.png` (left register, right profile panel).

## 1. Today (verified)
- `src/app/app/sys/[id]/hr/employees/page.tsx:19` `max-w-2xl` → `HrEmployeesSection` (`hr/ui.tsx:441-678`): `:447` scoped reads · `:464` `LifecycleDuePanel` · `:465-479` branch chips `hr-register-branch-filter|chip-*` · `:505-607` one `<details>` per person: name, unit, status chip; inside basic edit (`updateEmployeeAction`), schedule (`setWorkScheduleAction`), `PinField`, delete `ConfirmDialog` · `:614-644` removed list (`hr-register-restore-status-*`) · `:646-675` add form at the bottom; `:662-664` name input `flex-1 min-w-0` squeezed to ~56 px.
- `.../employees/[employeeId]/page.tsx`: `:53` `loadEmployeeProfileForViewer` (privacy.ts:46; sensitive keys only when `canViewPayroll` ∧ `inPayScope`, PRIV-2) · `:78` `max-w-2xl` · `:88` LifecycleBanner · `:100` `hr-profile-unit` select (`form=`) · `:111` EmployeeProfileForm (client) = page is one edit form; `EmployeeProfileForm.tsx:161-190` sensitive numbers in plain inputs; native dates `:61,102,105,117,120` · `:115` LINE chip · `:132` PIN text · `:136` LifecycleProfile (checklist + notes + offboard) · `:138` HrRegisterCard · `:147/200` docs (sensitive only).
- Staff → redirect `/app/me/hr/profile` (keep). Non-payroll viewers get no sensitive keys, payType or docs.

## 2. Mockup elements
| # | Element | Class | Source |
|---|---|---|---|
| 1 | Title + counts per branch | DATA EXISTS | rows + units |
| 2 | นำเข้า CSV | NEW FEATURE | no importer |
| 3 | + พนักงาน (top right, panel, `?add=1`) | EXISTS | createEmployeeAction |
| 4 | Status tabs ทั้งหมด/ประจำ/พาร์ทไทม์-รายวัน/ทดลองงาน/สิ้นสุด + counts | DATA EXISTS | employmentStatus/Type, removed list |
| 5 | Search name/code/phone | DATA EXISTS | in-memory `?q=` |
| 6 | Branch filter | EXISTS | chips |
| 7 | Department filter | DATA EXISTS | `?dept=` |
| 8 | แสดงที่สิ้นสุด toggle | DATA EXISTS | listRemovedEmployees |
| 9 | Cols name+code · position/dept · branch · type · start · status · PIN · SHARK account | DATA EXISTS | row fields, `hasPin`, `linkedUserId` as yes/no |
| 10 | Status badge ลาป่วยวันนี้ | NEEDS NEW DATA | `employeesOnLeave` (service.ts:880) |
| 11 | Pay-rate subline (฿400/วัน) | NEEDS NEW DATA | `listSalaryProfiles` — default OUT (Q2) |
| 12 | ⋯ row menu | EXISTS | today's editors |
| 13 | Pagination + "แสดง N คน" | DATA EXISTS | in-memory `?page=` (20) |
| 14 | ต้องจัดการ panel (bottom) | EXISTS | LifecycleDuePanel |
| 15 | Side profile panel on the list | EXISTS | reuse the read view (`?emp=`) |
| 16 | Profile header avatar · name · code · position · unit · dept | DATA EXISTS | DTO |
| 17 | Tabs ทั่วไป/เอกสาร/ตารางงาน/ลา/เงินเดือน/ประวัติ | EXISTS | general read view · docs section · schedule editor · pay link (payroll viewers) · HrRegisterCard |
| 18 | Tab ลา: balances | NEEDS NEW DATA | `leaveBalances(ctx, viewer, {employeeId})` (leave.ts:877, own gate) |
| 19 | Probation banner + ประเมิน | EXISTS | LifecycleBanner (data-dependent) |
| 20 | Personal data read view + แก้ไข | DATA EXISTS | DTO |
| 21 | ID / SSO masked + eye; bank masked | DATA EXISTS | masking §3 |
| 22 | Birth date Thai + age, address | DATA EXISTS | DTO |
| 23 | Onboarding checklist 5/7 | EXISTS | LifecycleProfile |
| 24 | Connections: SHARK account | NEEDS NEW DATA | `cardSubjectOf` (lifecycle.ts:751) → boolean |
| 25 | Connections: PIN POS + LINE | EXISTS | hasPin, `employeeLineStatus` |
| 26 | Connections: ระบบจอง "ตั้งเป็นช่าง", CRM ค่าคอมฯ | NEW FEATURE | no HR-side reader |
| 27 | Sticky footer บันทึก · ยกเลิก · สิ้นสุดการจ้าง | EXISTS | form submit, LifecycleProfile offboard |

Counts: EXISTS 10 · DATA EXISTS 11 · NEEDS NEW DATA 4 · NEW FEATURE 2.

## 3. Masking (decision)
- Non-entitled viewers: unchanged — the keys never reach the page (privacy.ts). Row shows "ซ่อน — เฉพาะผู้ดูเงินเดือน", no eye.
- Entitled viewers, default view: masked strings are computed in a SERVER component (new `hr/people-ui.tsx`, no "use client") from `view.profile`; only the masked strings go into HTML/RSC; `EmployeeProfileForm` is NOT rendered. Formats (pure helpers in new `hr/people-rules.ts`): national ID `x-xxxx-xxxxx-02-1` (last 3 digits), SSO `xxx-xxx-xx21`, bank `<bankName> xxx-x-x4321`; < 4 digits ⇒ "—". houseRegAddress is not shown in the read view.
- Eye = link to `?edit=1#hr-profile-sensitive` (edit form opened explicitly; full values only there, as today). No audit action for viewing exists; reveal action + audit = new backend ⇒ owner list.
- Saving unchanged: `employeeProfileInputFromForm` leaves absent fields untouched.

## 4. Target layout
- Register 1440 (`max-w-7xl`): header (title, counts, + พนักงาน; no CSV button) → status tabs → filters (search, branch, dept, ended) → 9-col table + pager → ต้องจัดการ. `?emp=` at ≥ 1280: read view on the right (`xl:grid-cols-[minmax(0,1fr)_420px]`).
- 1024: 7 cols (type and account folded into name/PIN cells), no panel. 390: cards (name, code, position, branch, status, ⋯), filters stacked, tabs scroll `data-scroll="x"`. No page h-scroll.
- Add panel: `<details>` opened by "+ พนักงาน" or `?add=1`; `grid sm:grid-cols-2`, name ≥ 16rem (fixes the 56 px input).
- Profile 1440 (`max-w-6xl`): back, header card, LifecycleBanner, `?tab=` links (`aria-current`); general = `xl:grid-cols-[minmax(0,1fr)_380px]` read view + connections ∣ LifecycleProfile. 1024/390 one column. `?edit=1`: unit select + form, `sticky bottom-0` footer บันทึก · ยกเลิก (drop `edit`) · สิ้นสุดการจ้าง (`#hr-life`).

## 5. Rules
- Dates in read view: `formatThaiDateFull(ymd)` for @db.Date fields in th (`12 มี.ค. 2546`), `formatShortDate(d, locale)` in en (`src/lib/ui/date.ts`). Edit-form date inputs stay native (Q3).
- Strings: new `hr.people` block in `src/messages/{th,en}/common.json` inserted right after `hr.life`; Thai literals you move go there. No money anywhere in this ticket.
- Profile page must keep qc-hf-hr-privacy S-2: data only via `loadEmployeeProfileForViewer`; `view.*` refs exactly `canSeeSensitive`, `docs`, `profile`; exactly one `<EmployeeProfileForm systemId={id} emp={view.profile} canSeeSensitive={sensitive} />` (render it conditionally); no `getEmployee|tenantDb|hrEmployee|hr/service` text in the page (schedule/leave/connections live in ui.tsx/people-ui.tsx). S-3: form keeps `./privacy-shared` import. F16.1: no new "use client" file touches sensitive names.
- `hr/employees/page.tsx` stays guard-free (fitness-hr `PAGE_GUARD_BASELINE` ratchet) — the side-panel read lives in ui.tsx.
- ui.tsx: keep the marker `// ───────────── พนักงาน (employees)` at :432 (qc-hf-hr-privacy S-5 slices on it). Extract the per-person schedule form into exported `HrScheduleEditor` (same action, fields) used by the ⋯ menu and the ตารางงาน tab.
- Keep all existing testids (`hr-register-*`, `hr-life-*`, `hr-emp-line-*`); `hr-profile-unit` + `hr-profile-employment-status` move to edit mode — update those two inventory rows' `conditional`. New (rows `wo: "VIS-5c"`): `hr-people-add`, `hr-people-add-name`, `hr-people-tab-*`, `hr-people-search`, `hr-people-dept`, `hr-people-ended`, `hr-people-table`, `hr-people-row-*`, `hr-people-more-*`, `hr-people-page-*`, `hr-people-panel`, `hr-profile-tab-*`, `hr-profile-edit`, `hr-profile-mask-*`, `hr-profile-reveal-*`, `hr-profile-connections`, `hr-profile-footer`.

## 6. Build steps
1. Register — `ui.tsx` 432-678 (table/cards, tabs, search, dept, ended toggle, pager, add panel, ⋯ editors, `HrScheduleEditor`, leave-today badge), `people-rules.ts` (tab class, filter, page), `employees/page.tsx` width + searchParams, messages, inventory.
2. Profile read view + masking — `people-ui.tsx` (`EmployeeReadView`, `ProfileTabs`), `[employeeId]/page.tsx` (tabs, `edit` flag, layout), `EmployeeProfileForm.tsx` (fieldset id `hr-profile-sensitive`, sticky footer), mask helpers, inventory.
3. Tabs data + side panel — ลา (`leaveBalances`), ตารางงาน (`HrScheduleEditor`), connections (`cardSubjectOf`, LINE, PIN), list side panel (`?emp=`, reads via `loadEmployeeProfileForViewer` inside ui.tsx, same read view), `scripts/qc-hr-vis-5c.mts`.

## 7. Shared files
VIS-5c: `ui.tsx` 432-678 (+ new exports after it), employee pages, `EmployeeProfileForm.tsx`, `people-*`, `hr.people`, inventory rows of both employee pages. VIS-5b: `ui.tsx` 88-117 + 710-793, `module-tabs.tsx`, `sys/[id]/page.tsx`, hub files, `hr.hub`, the oracle-acceptance commit (lists this ticket's files; cherry-pick if you land first). Controller: walk matrix.

## 8. Frozen oracles
- Trip: `qc-hr-priv-2` S4/S5 and `qc-hr-h4.3-lib` S1.6 — accepted by VIS-5b's `VIS5_SRC`/`VIS5_ORACLES` allowlist when every hunk carries `HR VIS-5c` (new files: header).
- Do not touch: privacy.ts, privacy-shared.ts, lifecycle*.ts/tsx, leave*, reports*, service.ts, nav.ts, fitness-hr.mts. Other trips: stop, report.

## 9. Acceptance (controller builds and walks)
- Walk `02-employees`, `03-employee-namfon` (O P PB M MB S × 3 sizes × th/en), `cov-02-*`, `cov-03-*` (PS); new extras: `03-employee-namfon-edit` (`…?edit=1`, O M P), `03-employee-bow` (`{emp.bow}` — probation 14 days, onboarding 5/7; O M MB), `02-employees-panel` (`?emp={emp.bow}`, O 1440).
- Fold: 02 1440 header, tabs, filters, ≥ 8 full rows; 1024 ≥ 6 rows, nothing clipped; 390 header, tabs, 3 cards. 03 1440 header, tabs, personal data masked (O/P/PB) or "ซ่อน" (M/MB); bow: banner + checklist.
- Walker: no full ID/SSO/bank value in HTML or RSC on default 03 for any viewer (PII WARN only on `-edit`; the address hit is Q4). HSCROLL-PAGE 0 · HSCROLL-EL FAIL 0 · INV-LEAK 0 (staff 02 leak rows today) · I18N 0 · RAW-ERROR 0 · no new TAP-44 / testid gaps · no EN-THAI from `hr.people` · no mm/dd/yyyy in default 03.
- Green: qc-hf-hr-privacy (S-2/S-3/S-5) · fitness-hr (F16.1/.3/.4/.8) · qc-hr-h1.1 · h2.10 · h3.9 (register card) · h4.4 · h4.5 (LINE chip) · h4.3 · priv-2 · qc-nav-functions · typecheck (`scripts/iso.sh`, ISO_MEM=14000M) · lint.
- `qc-hr-vis-5c.mts`: mask fixtures (`1100000000021` → `x-xxxx-xxxxx-02-1`, junk → "—", SSO, bank); people-rules fixtures (removed ⇒ สิ้นสุด only, counts sum); people-ui not "use client"; EmployeeProfileForm only under `edit`; testids ↔ inventory; `hr.people` parity.

## QUESTIONS FOR THE CONTROLLER
1. Eye opens the edit form (no reveal action, no audit). Default yes — no new backend; full values only where they are today.
2. Pay-rate subline in the register (฿/day, ฿/h). Default out — needs per-row PRIV-2 pay-scope gating.
3. Thai date picker for the edit form (and leave/OT forms). Default VIS-5e — one cross-page input.
4. Walker counts the current address (`addressLine`, allowed by the DTO) as PII ⇒ M/MB 03 BLOCKER today. Default: no privacy change here; controller rules (walker list or a PRIV ticket).
5. SHARK account column shows linked yes/no only, not the role. Default yes — the role needs a membership read.

## NOT IN THIS TICKET (owner list)
- CSV import of employees (นำเข้า CSV).
- Booking "ตั้งเป็นช่าง" and CRM commission rows in Connections — no reader/action.
- "ยืมตัว → หัวหิน" tag in the register — needs a list reader of borrowings.
- Audited "reveal number" action (`hr.employee.sensitive_view`).

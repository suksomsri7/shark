# POS P3.5U — builder notes (13B schedule chips + manager override · 13A HR staff list · 17C staff tab: schedule gate + staff commission · 07 clock-in/out + shift hours · 08 tab "ค่าคอมฯ พนักงาน")

Builder U · account A · 17 Oct 2026 · tree `/root/projects/shark-pos-p11` · branch `wip/pos-p3.5u` from `origin/session/pos` **42b823e9** (P3.5/P3.4/P3.9 S merged) · merged `origin/session/pos` d94ae91c (ledger only) in b6122ce7.
Contract: `pos-briefs/pos-prompt-accountA-P3.5U-BUILD.md` rulings 1–10 + CD-P35U-1…5 · S contract `wo-notes/pos-P3.5.md` · spec `pos-briefs/pos-spec-P3.5-hr-ui.md` (937dee3c).
**No server behaviour change.** No edit to any forbidden file (`staff-pin.ts` `staff-commission*.ts` `hr-link.ts` `hr/**` `settings-general.ts` `settings-shared.ts` `settings-overview.ts` `register.ts` `service.ts` `shift.ts` `reports.ts` `report-print-shared.ts` `offline-*.ts` `ai-*.ts` `outbox-consumers.ts` `prisma/` `qc-*.mts`). Step 8 (final gates + these notes) was finished by a second builder after the VPS rebooted mid-run; steps 1–7 commits survived unchanged.

## Commits (one per step)
| step | commit | files |
|---|---|---|
| 1 wrappers + messages | f80eda45 | `pos/settings-actions.ts` · `messages/{th,en}/pos.json` |
| 2 13B lock screen | 3cefdc22 | `register/LockScreen.tsx` · `register/ManagerPinPad.tsx` (additive `messageKeyOf`) · messages · inventory |
| 3 13A open-shift list | 5ec87d6d | `shifts/ShiftsClient.tsx` · `shifts/page.tsx` (`meUserId`) |
| 4 17C staff tab | 2b4054f4 | NEW `settings/StaffHrCards.tsx` · `settings/StaffSettings.tsx` · `settings/page.tsx` · inventory |
| 5 07 clock sheet + hours | 57af3180 | `shifts/{page,ShiftsClient}.tsx` · inventory |
| 6 08 commission tab | d310e511 | `reports/{page,ReportsClient}.tsx` · inventory |
| 7 visual states | f26d5bb5 | `scripts/visual-pos.mts` (P35U_WO + P35U_PLAN · fixture/cleanup) · `ShiftsClient.tsx` (`data-warnings`) |
| merge origin/session/pos d94ae91c (ledger only) | b6122ce7 | ledger |
| 7 spec | 937dee3c | `pos-briefs/pos-spec-P3.5-hr-ui.md` |
| 8 notes | (this commit) | `wo-notes/pos-P3.5U.md` |

## Components / files
- `src/lib/modules/pos/settings-actions.ts`: `updatePosStaffSettingsAction` (gate `pos.settings.manage`; writer `updatePosStaffSettings` is OWNER-only) · `updatePosStaffCommissionAction` (writer decides OWNER or `canViewPayroll`) — async-only, no `throw`, refusal `{ok:false, code, field?}` like `updatePosGeneralSettingsAction`.
- `src/components/pos/register/LockScreen.tsx`: chips from `StaffListItem.hr` · OFF_SCHEDULE copy + window · override sheet (reuses `ManagerPinPad`) · staff PIN in a `ref` (CD-P35U-1). `ManagerPinPad.tsx`: optional `messageKeyOf` prop only.
- `shifts/page.tsx`: `meUserId`, `hrLinked` (HR AppSystem count) + `posClockOnShift` ⇒ `clockAsk`, `canViewPayroll` ⇒ `shiftHoursForOwner` (50 latest shifts, page level only). `shifts/ShiftsClient.tsx`: 13A list from `listStaffForDeviceAction`, clock sheet → `posClockAction`, hours line (local type, never imports `hr-link`).
- `settings/page.tsx`: `staffHr` = `{hrLinked, scheduleGate: posScheduleGate, clockOnShift: posClockOnShift}` (staff tab + `canManageStaff`) · `staffCommission = posStaffCommission(...)` only when `canViewPayroll`. `settings/StaffSettings.tsx`: live HR switch. NEW `settings/StaffHrCards.tsx`: `ScheduleGateCard` + `StaffCommissionCard`.
- `reports/page.tsx`: `canPayroll={canViewPayroll(m)}` · page refusal text `commission.denied` when `kind=commission`. `reports/ReportsClient.tsx`: tab `commission` + table + total row + denied card.

## Message keys (th Thai · en ASCII · only the missing ones were added)
`pos.register.lock.schedule.{overrideButton, overrideFor, overrideHint, overrideDisabled, close}` · `pos.shift.openDlg.staffNoteHr` · `pos.settings.staff.scheduleGate.{noHr, minutesInvalid, overrideOffHint}` · `pos.settings.staff.commission.{bpInvalid, fixedInvalid, monthHint, noCategories, searchProduct, noMatch, add, remove, unknownProduct, productCount, catalogUnavailable, syncDone, syncing}`. Existing S keys used as-is: `lock.schedule.*` (chips, reasons), `settings.staff.{scheduleGate,commission}.*`, `shift.hours.*`, `report.commission.*`. `lock.schedule.overrideBody {minutes}` unused (client never knows `overrideTtlMin`, CD-P35U-2).

## testids
- 13B: `pos-lock-schedule-chip-<userId>` (`data-chip` today|leave|off|none) · `pos-lock-override-open` · `pos-lock-override-sheet` · `pos-lock-override-close` · (reused) `pos-mgr-pin-*`, `pos-lock-message`.
- 13A: `pos-shift-open-staff-<userId>` · `pos-shift-open-chip-<userId>`.
- 07: `pos-shift-clock-sheet` · `pos-shift-clock-confirm` · `pos-shift-clock-skip` · `pos-shift-clock-message` · `pos-shift-hours-<id>` (`data-warnings`).
- 17C: `pos-settings-staff-hr-switch` · `pos-settings-staff-hr-error` · `pos-settings-staff-gate{,-early,-late,-ttl,-clock-ASK,-clock-OFF,-save,-error}` · `pos-settings-staff-commission{,-switch,-default,-role-<ROLE>,-cat-bp-<id>,-cat-fixed-<id>,-prod-bp-<id>,-prod-fixed-<id>,-prod-remove-<id>,-prod-search,-prod-add-<id>,-product-count,-save,-sync,-sync-result}`.
- 08: `pos-reports-tab-commission` · `pos-reports-commission` · `pos-reports-commission-denied`.
- `scripts/pos-ui-inventory.json` (F15.3): rows **1026 → 1047 (n = 21)** — 13B +2 · 17C +17 (1 existing staff-switch row note replaced) · 07 +2 · 08 note of `pos-reports-tab-*` updated. 22 rows carry `wo: "P3.5U"`.

## Decisions / deviations (per ruling)
- R1: chips only when `hr` is present; leave = boolean (`chipLeave`), never type/reason; `inSchedule === false` cards stay selectable; no `hr` key ⇒ render unchanged (p1.15U states keep pixels).
- R2: OFF_SCHEDULE → `lock.schedule.<outsideHours|dayOff|leave|inactive>` (+ window HH:MM by integer arithmetic) + "ให้ผู้จัดการอนุญาต". Anonymous `PIN_INVALID` generic (this screen always sends `userId`).
- R3 / **CD-P35U-1**: same `verifyStaffPinAction` with `userId+pin+managerUserId+managerPin`; staff PIN kept in a component `ref` from the OFF_SCHEDULE answer until the sheet closes/succeeds, another card is chosen or a new digit is typed — never persisted, never logged, no re-ask; lock-screen keyboard ignored while the sheet is open.
- **CD-P35U-2**: button always shown on OFF_SCHEDULE; `overrideTtlMin = 0` ⇒ server answers OFF_SCHEDULE inside the sheet ⇒ `overrideDisabled` copy via `ManagerPinPad.messageKeyOf` (no S edit).
- R5: 13A uses the same `listStaffForDeviceAction` data; opener = this device's token user (else session user, `meUserId`), framed + check; other cards display-only.
- R6 / **CD-P35U-3**: `byProduct` names from the existing client-safe reader **`registerCatalogAction`** (`register-actions.ts`, limit 500; beyond that `q` search through the same reader). Reader refused (no selling right at the unit) ⇒ read-only count `-product-count` + `catalogUnavailable`, and byCategory/byProduct are not sent (stored rows kept). No new server reader.
- **CD-P35U-4**: no 17C per-person "จาก HR" tag — deviation from mockup 17-settings-3; `settings-overview.ts` untouched.
- R7 / **CD-P35U-5**: mockup 07 has no hours ⇒ the hours line ("ระยะเวลากะ H:MM · เวลาทำงานตาม HR H:MM|—" + NO_CLOCK_IN/NO_CLOCK_OUT/NO_EMPLOYEE pills) is a **derived layout (P2.8 precedent) — owner acknowledgement pending**; repeat this line in the parity report.
- R7 (sheet): offered only when `clockOnShift=ASK` + HR linked + a staff token on this device; skip label = existing S key `pos.shift.hours.skip` "ไม่ใช่ตอนนี้" (prompt wrote "ข้าม"; S copy kept, no new key).
- R8: commission figures only in the 08 tab for payroll viewers; non-viewer with `?kind=commission` ⇒ denied card (no server call, CSV/PDF disabled). Nothing on staff card/CSV, lock screen, drawer, display.
- R9: two PIN stores stay (W10) · W9 = helper text `commission.monthHint` only.

## Visual fixtures (`ensureP35uFixture` / `prepP35u` / `cleanupP35u` in `scripts/visual-pos.mts`)
Temporary HR AppSystem "ทีมงาน (ภาพ QC P3.5U <pid>)" via `system/service.createSystem` + 2 employees linked to the QC owner/cashier (`hr.createEmployee` + `linkedUserId`) · today's schedule around real Bangkok now per state (in / out ≥ 1 h / approved leave via `setSchedule` / `requestLeave` / `decideLeave`) · gate on 30/30/240 + `clockOnShift=ASK` + commission 2% via the S writers (`updatePosStaffSettings` / `updatePosStaffCommission`, previous keys restored verbatim) · 2 back-dated owner shifts on device `posqc-vis-p35uh-<pid>` + HR clock rows (07 hours) · 1 cashier bill → `staffCommissionOnSalePaid` (08). Cleanup after the last job / `finally` / signal: close shifts · restore settings · delete commission rows of the fixture bill · drop the run's HR system. Never `seed-hr-qc`, never reseed QC4. Wrong-PIN state clears the owner's failed counter after the shot.

## `--state` list for the controller (wo `p3.5u`, `--states`, no `--page` = register + shifts + settings + reports · coffee tenant)
| state | page | users | th devices | en (`LOCALE=en`) |
|---|---|---|---|---|
| `13b-schedule-chip-today` | register | owner, cashier | 1440/1024/390 | 1440 + 390 |
| `13b-schedule-chip-leave` | register | owner, cashier | 1440/1024/390 | 1440 + 390 |
| `13b-offschedule-refusal` | register | owner, cashier | 1440/1024/390 | 1440 + 390 |
| `13b-override-sheet` | register | owner, cashier | 1440/1024/390 | 1440 + 390 |
| `13b-override-wrong-pin` | register | cashier | 1440/1024/390 | 1440 + 390 |
| `13a-shift-list-hr` | shifts | owner | 1440/1024/390 | 1440 |
| `07-shift-clock-ask-in` | shifts | owner | 1440/1024/390 | 1440 |
| `07-shift-clock-ask-out` | shifts | owner | 1440/1024/390 | 1440 |
| `07-shift-hours-owner` | shifts | owner | 1440/1024/390 | 1440 |
| `07-shift-hours-warnings` | shifts | owner | 1440/1024/390 | 1440 |
| `17c-staff-hr-switch-owner` | settings | owner | 1440/1024/390 | 1440 |
| `17c-staff-schedule-gate-card` | settings | owner | 1440/1024/390 | 1440 |
| `17c-staff-commission-card` | settings | owner | 1440/1024/390 | 1440 |
| `08-report-commission-owner` | reports | owner | 1440/1024/390 | 1440 |
| `08-report-commission-denied` | reports | cashier | 1440/1024/390 | 1440 |
Plan (`--dry`): th owner **39** shots · th cashier **18** · en owner **17** · en cashier **11** (= 85; en 390 only for register per `EN_MOBILE_PAGES`). Commands: `bash scripts/iso.sh bash scripts/qc4.sh pnpm exec tsx scripts/visual-pos.mts p3.5u --states --user <owner|cashier> --base http://127.0.0.1:<port>` (+ `env LOCALE=en`). Old plans untouched (settings/shifts state flags gated off for wo p3.5u only).

## Follow-ups
1. CD-P35U-5: owner ack of the derived 07 hours layout.
2. CD-P35U-4: 17C "จาก HR" per-person tag needs an S edit of `settings-overview.ts` (later card).
3. CD-P35U-3: a dedicated client-safe catalogue reader for settings (without the selling-right dependency) would let payroll viewers without sell rights edit byCategory/byProduct; today they see the read-only count.
4. `lock.schedule.overrideBody {minutes}` unused until S exposes `overrideTtlMin` to the client.
5. P3.4U touches `LockScreen`/`RegisterScreen` too — merge P3.5U first (prompt order).

## Gates
Final head **937dee3c** (code; this notes commit adds ledger only) · dirty 0 at start and end · QC4 · driver `/tmp/claude-0/-root/c597e450-d0cf-5838-9f6d-470b7bf7192c/scratchpad/p35u/gates.sh` (systemd unit `pos-p35u-gates-1792235106`, 11:05Z → 11:32Z, queued behind gates116b on `/tmp/shark-gate-pos.lock`) · logs `/tmp/claude-0/-root/c597e450-d0cf-5838-9f6d-470b7bf7192c/scratchpad/p35u/gates/<name>.log` · summary `/tmp/claude-0/-root/c597e450-d0cf-5838-9f6d-470b7bf7192c/scratchpad/p35u/gates/SUMMARY.txt`.
| gate | result | prompt | log |
|---|---|---|---|
| typecheck (heap 8192 · ISO_MEM 10500M · `/tmp/pos-gate.lock`, also held the POS suite lock) | **exit 0** (11:05Z → 11:08:40Z) at 937dee3c | 0 | `gates/typecheck.log` |
| `qc-pos-p3.5` unforced | **55/55** | 55/55 | `gates/qc-pos-p3.5-unforced.log` |
| `qc-pos-p3.5` forced | **55/55** (guardHits 0 · tempLeft 0) | = unforced | `gates/qc-pos-p3.5-forced.log` |
| `qc-pos-p1.17` forced | **40/40** | 40 | `gates/qc-pos-p1.17-forced.log` |
| `qc-pos-p1.18` forced | **81/81** (ST7 ✅ = 0 Thai literals outside `t()`) · `--no-db` 16/16 | 81 | `gates/qc-pos-p1.18-forced.log` · `p118-nodb.log` |
| `qc-pos-p1.16` forced | **28/28** | 28 | `gates/qc-pos-p1.16-forced.log` |
| `qc-pos-p1.3` forced | **128/128** (S5.17 ✅) | 128 | `gates/qc-pos-p1.3-forced.log` |
| `qc-pos-p1.6` forced | **48/48** (R2 ✅ — no `throw` in `*actions*.ts`) | 48 | `gates/qc-pos-p1.6-forced.log` |
| `qc-pos-p2.1` forced | **55/55** | 55 | `gates/qc-pos-p2.1-forced.log` |
| `qc-pos-p1.12` forced | **72/72** | 72 | `gates/qc-pos-p1.12-forced.log` |
| `qc-pos-p1.15` forced | **40/40** | 40 | `gates/qc-pos-p1.15-forced.log` |
| `qc-hf-hr-privacy` forced | **194/194** | 194 | `gates/qc-hf-hr-privacy-forced.log` |
| fitness no env | **53/53** | green | `gates/fitness-noenv.log` |
| fitness QC4 env | **53/53** | green | `gates/fitness-qc4.log` |
| fitness-pos | **8/8** (F15.3a testid 1045 clickable · F15.3b 1047 rows) | green | `gates/fitness-pos.log` |
| `visual-pos.mts p3.5u --states --dry` (`CI=1`) | rc 0 ×4: th owner 39 · th cashier 18 · en owner 17 · en cashier 11 shots | rc 0 th + en | `visual-dry-{th,en}-{owner,cashier}.log` |
Every count equals the prompt's number. No new page ⇒ `qc-hf-pos-page-authz` not affected (not re-run). No red ⇒ no fix commits in step 8.


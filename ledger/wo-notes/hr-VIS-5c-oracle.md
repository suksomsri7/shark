# HR VIS-5c — oracle "ready for a builder" (oracle writer · 17 Nov)

Tree `/root/projects/shark-hr` · branch `wip/hr-vis-5bc` (now the VIS-5c lane). `git merge session/hr` fast-forwarded to **8df167086**, so merge-base = HEAD = 8df167086 is the BASE of every merge-base oracle. No src/ edits. Every oracle hunk carries `HR VIS-5c`, so priv-2 S4 / h4.3-lib S1.6 accept them through `vis5Ok`.

## 1. Post-merge confirmation (lane-1 DB · iso.sh → qc-hr.sh → with-gate-lock.sh · QC_FORCE=1 · on 8df167086 before any edit of mine)
| suite | result |
|---|---|
| qc-hr-priv-3 | **27/28**. Only S4 is red, and not because of VIS-5b: `outside=` lists only untracked files that are not mine and not tracked by git — `ledger/wo-notes/hr-H3.6-control1.txt` and `scratchpad/h38*/…` (another agent's leftovers in this tree) · `bad=ok`. S4 counts untracked files, so it stays red in this tree until they are moved out. Not edited. N1/N2/N3/S6 green. |
| qc-hr-vis-5b | **34/34** |
| qc-hr-h2.11 | **70/70** |

## 2. What changed vs the draft, and why
### Re-based on 8df167086 (stale only because VIS-5b / PRIV-3 landed)
- S1/S2 base: the lib's BASE is already `merge-base(HEAD, session/hr)`, so after the merge VIS-5b's files are no longer in the diff. **S1 is green.** This settles open question 8 of `hr-VIS-5b.md` without loosening S1.
- `qc-hr-vis-5-lib.mts` OWN ranges are base line numbers. Re-mapped with `git diff -U0 98c2fee1d 8df167086 -- ui.tsx`:
  - 5c `[[439,716]]` → **`[[453,730]]`**: the employees marker is now at :453 and the kiosk section ends at :730.
  - 5b `[[89,118],[717,802]]` → **`[[96,132],[731,845]]`**: the same spans, in new-base numbers.
  - S2 text updated to match.
- S3 pins: all still match (the PRIV-3 re-pins from `hr-VIS-5b-remerge.md` hold, and VIS-5b changed none of the pinned bodies) · S8 (`pageGuard.guarded === true`, guard import = base) unchanged and green.

### Coverage added (the brief / task asked for it; not in the draft)
- **Lib** `renderTree` now also returns `actions`: the names of the server-action functions bound in the output (host `action`/`formAction`, and client props whose function name ends in `Action`). Additive only; vis-5b was re-run with it: 34/34.
- **Fixture**: viewers S (STAFF `hr.leave.request`, linked to namfon), K (`hr.attendance.clock`), N (no keys), LR (STAFF `hr.leave.read`: register yes, sensitive no). Plus a leave policy `zPOL<tag>` (VACATION 6 d) and an APPROVED SICK leave for p1 on Bangkok today.
- V2 + LR · V3 + managers' edit link (M and M-U1 get the form today, so they must still reach it).
- New checks G1 G2 A1 A2 R10 V10 V11 (table below).

## 3. Check list — forced run (after the 17 Nov rulings): **17/37 = BASE-EXPECTATION 37/37 (20 RED by design · 17 GREEN controls)** · residue none
| id | sev/base | what | now |
|---|---|---|---|
| S1 | MG | diff vs base: only VIS-5c files + shared lists + marked oracle edits | ✅ |
| S2 | MG | VIS-5c hunks marked · ui.tsx hunks inside base 453-730 / import block · new files: marker in first 3 lines | ✅ |
| S3 | CG | payroll-rules sha · pinned bodies (loader, form parser, 5 employee actions, leave/lifecycle/line readers, listEmployees/Removed, employeesOnLeave) | ✅ |
| S4 | CG | F16.1 clean | ✅ |
| S5 | MR | `hr.people` after `hr.life`, th=en keys, en no Thai, no other key changed, no Thai literal | ❌ no block |
| S6 | MR | inventory rows (wo VIS-5c) for every new id · unit/employment-status `conditional` updated · every new id in code has a row | ❌ no rows/ids |
| S7 | MG | every base inventory id of both pages still in source | ✅ |
| S8 | CG | form tag + privacy-shared import · page guarded, guard import = base · profile S-2 shape · ui marker | ✅ |
| S9 | MR | people-ui / people-rules exist, not client, rules pure, no money · `HrScheduleEditor` exported | ❌ files absent |
| S10 | CR | mask helpers (found by behaviour): NID `x-xxxx-xxxxx-02-1`, SSO `xxx-xxx-xx21`, bank `KBank xxx-x-x4321`, junk → `—` | ❌ exports=0 |
| R1 | MR | `hr-people-table`, row with name/code/position/start date | ❌ |
| R2 | MR | status tabs = data, counts shown, ended = removed only | ❌ no tabs |
| R3 | MR | search: code / phone / part of name | ❌ no input |
| R4 | MR | 20 per page, disjoint, union = all | ❌ |
| R5 | MR | `hr-people-add`, `?add=1` opens `<details open>` with `hr-people-add-name` | ❌ |
| R6 | MR | branch manager rows ⊂ own scope (+ borrowed in) | ❌ rows=0 |
| R7 | CG | branch manager: no U2 person in HTML/props | ✅ |
| R8 | CG | no pay in register | ✅ |
| R9 | MR | `?emp=` panel = masked read view | ❌ |
| V1 | CR | entitled default view: masked only, no full ID/SSO/bank/house in HTML or props | ❌ full×4 (form) |
| V2 | CG | not entitled (M, M-U1, LR, payroll-U1 on borrowed): no full value (default and `?edit=1`), no mask, no eye | ✅ |
| V3 | MR | (ruling 1) eye = `<a>` to `?edit=1` for owner (numbers + key) · `hr-profile-edit` for O, M, M-U1 | ❌ |
| V4 | MG | `?edit=1` entitled: full value in the form | ✅ |
| V5 | MR | form only with `?edit=1` · edit view has footer + unit | ❌ form in read view |
| V6 | MR | `hr-profile-tab-*` links (`?tab=`, one aria-current) · connections | ❌ |
| V7 | MG | bow: banner + checklist 5/7 | ✅ |
| V8 | MR | th `formatThaiDateFull` / en `formatShortDate`, no ISO / date input in read view | ❌ |
| V9 | MR | en: `hr.people` used, no missing key, no Thai | ❌ no block |
| **G1** | CG | page matrix (default, `?emp=`, `?add=1`, `?edit=1`): O, payroll-all, payroll-U1, M, M-U1, LR render both pages · S/K/N → 404 on the register · S own profile → redirect `/app/me/hr/profile` · S other / K / N → 404 | ✅ |
| **G2** | CG | register states (default, `?emp=namfon`, `?add=1`, payroll-U1 `?emp=brw`, owner `?emp=brw`) for all 6 register viewers: no full ID/SSO/bank/house of **any** employee in HTML **or client props** · a viewer not entitled for that person: no mask string, no eye | ✅ |
| **A1** | CG | actions bound ⊆ today: register = create/update/schedule/remove/restore · profile = today's measured set ∪ the same components' other data states ∪ `setWorkScheduleAction` (schedule tab). No reveal / audit / import action. Owner register keeps create/update/schedule/remove + PinField. | ✅ |
| **A2** | CG | owner list absent: no CSV import (th/en, text or `*import*` testid) · no ยืมตัว tag · no document expiry text (ruling 4) · no ตั้งเป็นช่าง / ค่าคอม / commission on any profile tab (th/en) · no `sensitive_view` in src/ | ✅ |
| **R10** | MR | leave-today badge: p1 (approved leave today) row has `ลา…วันนี้` and not `ลาป่วย` (th, ruling 5) — was `วันนี้` (th) / `leave` (en); f01 row has neither · premise `employeesOnLeave(ctx,[p1,f01], dbDate(bangkokToday))` = {p1} | ❌ (rows absent) |
| **V10** | MR | `?tab=leave` (owner) shows the policy name + balance of `leaveBalances(owner,{employeeId, at: today})` · payroll-U1 (refused by leaveBalances: premise) shows none · `?tab=schedule` binds `setWorkScheduleAction` with `start-<wd>` inputs | ❌ |
| **A3** | MR | ruling (1)(2): editor controls only for `hr.employee.create` holders. P, PU1 and LR get none of the actions / PinField / form / `hr-people-add*`, `-more-*`, `hr-profile-edit`, `-reveal-*` on the register (default, `?add=1`, `?emp=`) or the profile (default, tabs, `?tab=schedule`, `?edit=1`). Their `?edit=1` has the same test ids as their default view. Control: O, M and M-U1 keep the editors. Per key, not per branch: a key holder editing a borrowed-in person from another home branch is not pinned. | ❌ dead editors today |
| **V11** | CG | no salary of the person on the profile, default and every `hr-profile-tab-*` state, all 6 viewers | ✅ |
| Z1 | CG | residue · outbound | ✅ |

Positive controls for the new negative checks:
- G2's PII search is the same one that finds the full value in V1 (today: full×4) and V4.
- A1's name capture finds the owner's 4 register actions (its own control part).
- V10/R10 premises call the real readers.

Measure mode: `QC_VIS5C_MEASURE=1` prints the per-viewer action sets.

## 4. Other oracle edits
- `scripts/qc-hr-priv-2.mts` S5 (brief §8 and ruling "add this ticket's files to VIS5_SRC"):
  - adds `VIS5C_SRC` = both employee pages, `EmployeeProfileForm.tsx`, `people-ui.tsx`, `people-rules.ts`, `ui.tsx`;
  - the new `vis5cSrc` accepts these files only when every hunk (a new file counts as one hunk) adds `HR VIS-5c`.
  - VIS-5b's `vis5Src` is unchanged. Marker `ORACLE-EDIT (HR VIS-5c · oracle)`.
  - Not yet exercised on a real VIS-5c hunk; the first builder run of priv-2 is the test.
- `scripts/walk-hr-matrix.json`: 4 extra states after `03-employee-namfon`, all 3 sizes × th/en. `todoInventoryPrefix` keeps them skipped until the VIS-5c inventory rows exist.
  - `03-employee-namfon-edit` (`?edit=1`, O M P)
  - `03-employee-bow` (O M MB)
  - `02-employees-panel` (`?emp={emp.bow}`, O)
  - `02-employees-add` (`?add=1`, O — the 56 px name-input defect)

Regression after these edits: see §7.

## 5. Builder scope
- **Allowed files:**
  - `src/lib/modules/hr/ui.tsx`: only base lines 453-730 (the employees section; new exports go right after it, before the HrHub comment) plus the import block.
  - `src/app/app/sys/[id]/hr/employees/page.tsx`
  - `src/app/app/sys/[id]/hr/employees/[employeeId]/page.tsx`
  - `src/lib/modules/hr/EmployeeProfileForm.tsx`
  - new `src/lib/modules/hr/people-ui.tsx` and `people-rules.ts` (no "use client"; `HR VIS-5c` in the first 3 lines)
  - `src/messages/{th,en}/common.json` (only the `hr.people` block, right after `hr.life`)
  - `scripts/hr-ui-inventory.json` (rows `wo: "VIS-5c"` + the two `conditional` updates)
- **Not allowed:**
  - oracle files, `walk-hr-matrix.json`
  - privacy*.ts, lifecycle*, leave*, reports*, service.ts, nav.ts, actions files, fitness-hr
- **Marker:** every hunk adds `HR VIS-5c` (`// HR VIS-5c ▸ … ◂` or `{/* HR VIS-5c ▸ … ◂ */}`).
- **Bind the existing actions directly** (`action={updateEmployeeAction}` etc.). A wrapper function shows up as a new action name and turns A1 red.
- **Leave-today badge:** call `employeesOnLeave(ctx, ids, dbDate(<Bangkok today>))`. Do not pass `new Date()`: `rules.isAvailable` compares UTC dates, so `new Date()` gives the wrong day between 00:00 and 07:00 Bangkok. R10 catches that only when it runs in that window.
- **Leave tab:** `leaveBalances(ctx, viewer, { employeeId, at: <today> })`, the current leave year.
- **Editors per viewer (ruling 1/2):**
  - Render add, ⋯ (update / schedule / PIN / delete / restore), the doc forms, `hr-profile-edit` and the eye only when the viewer holds `hr.employee.create`. The eye additionally needs `canSeeSensitive`.
  - Decide it with the existing `evaluate`/`hrAccessOf`-style check on the same key the actions assert. No new rule.
  - `?edit=1` for a viewer without the key renders the normal read view: same test ids as without the flag, no 404.
- **Badge text:** generic `ลาวันนี้` / `on leave today`. Never "ลาป่วย".
- **Expected oracle trips on the lane** (same pattern as VIS-5b; they clear at merge):
  - qc-hr-priv-3 S4: lists the VIS-5c files and these oracle edits.
  - qc-hr-leave-3 / qc-hr-preprod-1 lane statics, if they diff the walk matrix (not run here).

## 6. Controller rulings 17 Nov (answers to the 8 questions) — pinned
1. **Controls whose action would refuse are not shown.**
   - Every register/profile editor action asserts `hr.employee.create`: create, update, schedule, PIN, remove, restore, profile save, add/remove doc.
   - Payroll-all, payroll-U1 and leave-read staff see none of them.
   - New check **A3** (MR), for those three viewers. It covers the register (default, `?add=1`, `?emp=`) and the profile (default, every tab, `?tab=schedule`, `?edit=1`). They must have none of the following:
     - those actions;
     - PinField or EmployeeProfileForm;
     - `hr-people-add(-name)`, `hr-people-more-*`, `hr-profile-edit` or `hr-profile-reveal-*`.
   - Control: O, M and M-U1 keep the register editors.
   - **RED today, as expected:** payroll-all and payroll-U1 get all 4 register actions plus EmployeeProfileForm and the doc form; LR gets the register actions plus the form.
   - **V3 narrowed:**
     - eye = viewers who see numbers **and** hold the key (owner);
     - `hr-profile-edit` = every key holder (O, M, M-U1).
2. **Leave-read staff: no edit link, and `?edit=1` gives the page's own behaviour for a viewer without the right.**
   - What the page does today: an entitled viewer is never 404'd for a sub-feature. A section the viewer has no right to is simply not rendered (docs → hint text, LifecycleProfile / HrRegisterCard hide themselves). 404 is used only for "may not open this profile at all".
   - So A3 pins: `?edit=1` for P, PU1 and LR returns **200 with exactly the same set of test ids as their default view**. The flag is ignored and there is no form, footer or unit select. G1 also keeps "renders".
   - If the controller meant 404, this is a one-line change in A3.
   - **Consequence to note:** payroll viewers (P, PU1) now see only masked numbers. There is no eye, so they have no way to the full value; today they see it in the form.
3. **Phone stays clear text**, as in the brief. No mask check; R3 searches by phone.
4. **Document expiry dates are ABSENT** (no backend). A2 pins it: no หมดอายุ / expiry / valid-until text on any profile state, th or en. Added to the owner list.
5. **Badge wording "ลาวันนี้"** (generic).
   - R10 th now needs `ลา…วันนี้` and must not contain `ลาป่วย`, because `employeesOnLeave` carries no leave type.
   - The mockup's "ลาป่วยวันนี้" needs a leave-type read; added to the owner list.
6. **Leave tab = current leave year as of today**: accepted. V10 uses `at = today`.
7. **02-employees-panel at all sizes**: accepted.
8. **Stray files moved out by the controller.**
   - The `scratchpad/h38*` files and `hr-H3.6-control1.txt` are gone; S4 no longer names them.
   - priv-3 is still **27/28**. S4 now names, exactly:
     - (a) new untracked files from another agent that appeared since: `scratchpad/h45-hunt/hunt.mts`, `scratchpad/h45/{forced1-4,gen.log,parts,tsc,unforced}.txt`, `scratchpad/h45b/drift0.txt`;
     - (b) this lane's own commits beyond base: `ledger/wo-notes/hr-VIS-5c-oracle.md` in `outside=`, plus `scripts/qc-hr-vis-5-lib.mts` and `scripts/qc-hr-vis-5c.mts` as "oracle-edit unmarked" (their marker is VIS-5c, not PRIV-3).
   - (b) is the known lane-scope pattern (VIS-5b had the same) and clears when the lane merges.
   - 28/28 needs (a) removed **and** a tree with no lane commits, i.e. `session/hr` itself.

## 6b. Owner list (NOT built in VIS-5c)
- CSV import of employees (นำเข้า CSV)
- Booking "ตั้งเป็นช่าง" and CRM commission rows in Connections
- "ยืมตัว → หัวหิน" tag in the register (needs a borrowings list reader)
- Audited "reveal number" action (`hr.employee.sensitive_view`); this would also restore payroll viewers' access to full numbers (ruling 1 → 2 consequence)
- Pay-rate subline in the register (5c-2)
- **Document expiry dates** (ruling 4: no backend)
- **"ลาป่วยวันนี้" badge with the leave type** (ruling 5: needs a leave-type read; VIS-5c shows the generic "ลาวันนี้")
- Thai date picker for the edit form → VIS-5e (5c-3)

## 7. Runs
Logs: `/tmp/claude-0/-root/59156a1f-9c0e-594d-9643-d1896f46b191/scratchpad/v5c/`. Results are filled in below.
| suite (forced, lane-1 DB, wrappers) | result |
|---|---|
| qc-hr-vis-5c | first commit: 17/36 · **after the rulings: 17/37 = BASE-EXPECTATION 37/37** (20 RED · 17 GREEN) · residue none · R10/V10 premises hold · new red A3 = dead editors (payroll-all/U1: 4 register actions + form + doc form; LR: register actions + form) |
| qc-hr-priv-3 (after the stray-file move) | 27/28 — S4 only; see §6 item 8 for exactly what it names |
| qc-hr-vis-5b (after the lib change) | 34/34 |
| qc-hr-priv-2 | 47/47. A first run gave 46/47: S4 flagged the vis-5c.mts hunk at :46, which had no marker. That hunk is now marked. |
| qc-hr-h4.3 | 45/45. A first run gave 44/45: S1.6, same unmarked hunk, now fixed. |
| typecheck (iso, ISO_MEM=14000M, heap 12288) | first commit: exit 0 · 0 errors · after the rulings: exit 0 · 0 errors |

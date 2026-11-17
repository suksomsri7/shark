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

---
# Round 3 — controller rulings R1–R5 on the VIS-5c build (oracle writer · 18 Nov)
Lane head before this round: builder 50521f66d. No src/ edits. Every oracle hunk carries `ORACLE-EDIT (HR VIS-5c · controller)`; edits in priv-3 files additionally carry `HR PRIV-3`.

## R1 — V9 no longer bends the UI · W1 pins the mockup wording
**Lib:** `renderPage` now sets the locale/messages **before** the page function runs. This is the builder's §5 finding: page-level `getTranslations` used the previous render's locale. New export `overrideMessages(lc, f)`.

**V9 rewritten.** It now judges only text that comes from the `hr.people` block:
- The th bundle's `hr.people` leaves are replaced by sentinels `‹TH:hr.people.<key>›`.
- The en pages are rendered again: register, `?emp=`, `?add=1`, profile, `?edit=1`, and the docs / schedule / leave / pay / history tabs.
- Any sentinel in the HTML or client props means a th `hr.people` string reached the en page.
- Thai data on the en page (unit names, departments, module tabs, PinField) no longer counts.
- Positive control: the th register rendered under the sentinel bundle shows the sentinels.
- The old rule was "the first 12 chars of every th value must not appear in the en text".

**New check W1 (MR):** the th `hr.people` values must equal the mockup wording, and the owner th register must render «2 สาขา · <unit> N คน».

### Builder to-do (R1 · strings to restore, `src/messages/th/common.json`)
| key | now | restore to (mockup 02-employees.png) |
|---|---|---|
| `hr.people.title` | ทะเบียนพนักงาน | **พนักงาน** |
| `hr.people.branches` | มี {n} สาขา | **{n} สาขา** |
| `hr.people.unitPeople` | {name} ({n} คน) | **{name} {n} คน** |
| `hr.people.col.unit` | สาขาประจำ | **สาขา** |
| `hr.people.branch` | เลือกสาขา | **สาขา** (the mockup shows «สาขา:» before the value) |

Rules for these keys:
- Keep `col.pin` «รหัส PIN» and `prof.conn.line` «บัญชี LINE» as they are (fitness F16.4).
- Do not touch the en values.
- The count line must render as «2 สาขา · <unit> 9 คน · <unit> 5 คน».

## R2 — qc-hr-h1.1 X9.1 (ORACLE-EDIT) · builder to-do
- **New logic.** The prompt «ยังไม่ระบุสาขาประจำ» is accepted in either of two places:
  - in ui.tsx code with comments stripped;
  - in an `hr.*` leaf of `src/messages/th/common.json` whose key is used in the code of ui.tsx or people-ui.tsx (found today: `hr.people.noUnit`; `unitPrompt` also holds the text).
- **It fails** when the text appears in ui.tsx only inside a comment.
- **Now red, as intended:** `commentOnly: true`.
- **Builder to-do:** remove the comment added in be28dd67a, in `src/lib/modules/hr/ui.tsx`: `{/* HR VIS-5c ▸ บรรทัดเตือน "ยังไม่ระบุสาขาประจำ N คน" (H1.1 R8) = hr.people.unitPrompt (สองภาษา) ◂ */}`.
  - Removing it, or rewording it so it no longer contains the Thai phrase, makes X9.1 green.

## R3 — qc-hr-priv-3 P5 (union over offered views, like P7)
**Method.** The register cell is now the union over:
- the default view;
- every `hr-people-tab-*` link;
- the `hr-people-ended` link.

`QC_PRIV3_P5_IDS=1` prints the names and ids per viewer.

**Proof on a clean base.** I ran it in a temporary detached worktree at 8df167086 (node_modules symlinked, a dummy SESSION_SECRET in the environment, no env file copied; the worktree has since been removed). It reproduces all 6 old goldens exactly, and priv-3 scores 28/28 there.

**Names (union) = golden for all 6 viewers:** O/M/P/SD `e1e2e3e4e5e6e7`, MB/PB `e1e2e4e5e7`. e5, a removed person, is now on the สิ้นสุด tab / `?ended=1` view.

**Test ids per viewer (union on the lane vs base):**
| viewer | removed | added |
|---|---|---|
| O, M | ∅ | 56: `hr-people-*` (add, add-name/phone/position/submit, branch, edit-name/phone/position/save-*, ended, menu-open-*, more-*, name-*, remove-*-trigger, restore-*, row-*, search, search-go, tab-all/ended/full/part/prob, table) · `hr-sched-*` (on/start/end/off 0–6, grace, save — HrScheduleEditor) · `hr-register-status-*` |
| MB | ∅ | 55: the same, without `hr-people-branch` (MB has no branch filter) |
| P, SD | `hr-register-create-unit` | 14: `hr-people-branch, -ended, -name-*, -open-*, -row-*, -search, -search-go, -tab-{all,ended,full,part,prob}, -table` · `hr-register-status-*` |
| PB | `hr-register-create-unit` | 13: the P list without `hr-people-branch` |

How each change is explained:
- **Added `hr-people-*` and `hr-sched-*`:** every one is a VIS-5c element with an inventory row `wo: "VIS-5c"`.
- **Added `hr-register-status-*`:** this is the existing H1.1 id. The base rendered it only when `employmentStatus` was set, and the priv-3 fixture sets none. VIS-5c's status column (mockup item 9) always shows a chip.
- **Removed `hr-register-create-unit`:** the add form is hidden from viewers without `hr.employee.create` (ruling 17 Nov (1)). SD is a STAFF viewer holding only the leave keys.

**Re-measured goldens (names unchanged, ORACLE-EDIT in `qc-hr-priv-3-lib.mts`):**
| viewer | new golden | old golden |
|---|---|---|
| O, M | `…\|2f2e32cf8371f0af\|64` | b81b2621…\|8 |
| MB | `…\|5fc829f9882bffca\|57` | 4daaf3bf…\|2 |
| P, SD | `…\|64d8b00155aa0ea5\|20` | d427af2f…\|7 |
| PB | `…\|bf4b9e62656eaeb9\|13` | 1abb6194…\|1 |

## R4 — narrow acceptances (never a whole file)
- **qc-hr-vis-5-lib `diffStatics`.** The other VIS-5 ticket's file is accepted only when:
  - every hunk adds that ticket's marker; or
  - for a new file, it is absent in base and the marker is in lines 1–3.

  This fixes vis-5b S1. vis-5c S1 behaves the same way the other direction.
- **qc-hr-leave-3 ST2/ST3.** New `v5cOk`:
  - VIS-5c product files: both employee pages, `EmployeeProfileForm.tsx`, `ui.tsx` — every hunk adds `HR VIS-5c`;
  - new `people-ui.tsx` / `people-rules.ts`: absent in base, marker in lines 1–3;
  - the oracles edited for VIS-5c: vis-5b, vis-5c, vis-5-lib, priv-2, priv-3, priv-3-lib, h4.3-lib, h1.1 — every hunk `HR VIS-5c`;
  - messages: only when every changed key is under `hr.people.*`.
- **qc-hr-priv-2 S4 and qc-hr-h4.3-lib S1.6:** `VIS5_ORACLES` gains priv-3, priv-3-lib, h1.1 and leave-3 (every hunk `HR VIS-5[bc]`). priv-2 S5 already has `VIS5C_SRC` from round 1.
- **qc-hr-preprod-1:** its ST2 frozen set holds no VIS-5c file. 57/57, no change needed.
- **qc-hr-priv-3 S4:** excluded by the controller. It still names VIS-5c's files and the oracle edits on the lane.
- **Merge note:** VIS-5a (`wip/hr-vis-5a`, not yet in session/hr) edits the same lines in leave-3 ST2/ST3, priv-2 S4/S5, h4.3-lib S1.6, preprod-1 ST2 and priv-3 P7. Whichever ticket merges second gets text conflicts there. Resolve them as unions, the way the VIS-5b re-merge did.

## R5 — qc-nav-functions S5 (not edited)
- **What S5 reads:** `childrenFor` in `src/app/app/layout.tsx` and the route folders under `src/app/app/u/[unitSlug]/<system>/`. It requires every real sub-route to appear in the accordion.
- **What is missing:** HOTEL lacks 14 routes (calendar, channels, folio/unmatched, guests, housekeeping, rates, reports, reservations/new, settings, tm30, …) and BOOKING lacks /booking/calendar and /booking/day.
- **VIS-5c changes none of these inputs:** `git diff 8df167086 HEAD` touches only HR files.
- **Red on base 8df167086: verified by a run.** The same failure, 10/11, in the temporary clean worktree.
- **Red on origin/main: from the files, not run.** origin/main has 22 hotel pages and the booking calendar/day pages, while its `layout.tsx` accordion lists only `hotel/reservations` and `hotel/setup`. Its qc-nav-functions has the same HOTEL entry.
- **Cause:** the SVC hotel/booking work (e.g. f68ac154f, 96e846560) added routes without accordion entries. It is independent of VIS-5c.

## Runs (lane DB · wrappers · QC_FORCE=1 · this commit's tree)
| suite | result |
|---|---|
| qc-hr-vis-5c | **37/38**. Only W1 is red (wording to restore, expected). V9 is green, with its positive control. Residue none. |
| qc-hr-vis-5b | 34/34 |
| qc-hr-priv-3 | 27/28. P5 ✅ (union, re-measured). S4 is red: lane scope, excluded by the controller. |
| qc-hr-priv-2 | 47/47 |
| qc-hr-h4.3 | 45/45 |
| qc-hr-leave-3 | 53/53 |
| qc-hr-h1.1 | 80/81. X9.1 is red, `commentOnly: true` (expected until the comment goes). |
| qc-hr-preprod-1 | 57/57 |
| typecheck (iso, ISO_MEM=14000M, heap 12288) | exit 0 · 0 errors |

After the builder restores the 5 strings and removes the comment, the expected result is vis-5c 38/38 and h1.1 81/81.

---
# Round 2 — VIS-5c fix round (oracle writer · 17 Nov · after visual review r1 "FIX REQUIRED")
Spec of this round: `/root/projects/shark-hr-merge/ledger/wo-notes/hr-VIS-5c-visual-r1.md` (A1, A2, B1–B11) + controller rulings G, A1–B11, P14. No src/ edits.

## Step 0 — base update
- `git merge session/hr` (7d532038e, VIS-5a merged as 08f495db0) → merge commit **fb68f9c43**. New BASE of every merge-base oracle = 7d532038e.
- Text conflicts (3, all oracle allowlists), resolved as unions — no check dropped or loosened:
  - `qc-hr-leave-3` ST2 `bad`/`fz` and ST3 loop: `… || v5Ok(f) || v5cOk(f)` (both tickets' narrow acceptances).
  - `qc-hr-priv-2` S5: `out` = `!vis5aSrc && !vis5Src && !vis5cSrc`; `bad` keeps VIS-5a's `!vis5aSrc`; VIS-5c's `VIS5C_SRC`/`vis5cSrc` lines kept.
  - `qc-hr-priv-3` P5/P7: both helpers kept (`regUnion` for the register, `payUnion` for payroll); the cell is `ru ? ru.c : pu ? pu.c : cell(…)`; failure text carries both.
- Auto-merged (checked by reading the result): `qc-hr-h4.3-lib` (VIS5A_ALLOW + VIS5_ORACLES both present), `qc-hr-vis-5-lib` (VIS-5a's `vis5aOk` + `hr.(run2|payview)` key rule and VIS-5c's R4 acceptance / `overrideMessages` / `actions` all present; ui.tsx untouched by VIS-5a ⇒ OWN ranges unchanged), `walk-hr-matrix.json`, `walk-hr.mts`, `seed-hr-walk.mts`, inventory, messages (JSON valid).
- **No src/ conflict, no merge damage in src/.**

## New oracle checks (qc-hr-vis-5c · all `ORACLE-EDIT (HR VIS-5c · controller r2)`)
Fixture changes: bow starts D0−76 (90-day probation ending D0+14) · f02 gets `contractEndAt` D0+20.
| id | ruling | what is pinned |
|---|---|---|
| W1 (extended) | B4 | besides R1's 5 strings: `hr.people.prof.conn.pin` = «PIN POS» · `prof.conn.pinChange` = «เปลี่ยน PIN» · `form.save` = «บันทึก» · the department filter control's text starts with «แผนก» · ต้องจัดการ (`hr-life-due`) shows «Onboarding ค้าง» and «Offboarding», not รับพนักงานใหม่ค้าง/ออกจากงานค้าง · bow's general tab shows «ประเมิน» and nowhere «ผ่านทดลองงาน» · `hr-life-checklist` heading «Onboarding checklist». Exception (a): `col.pin` stays «รหัส PIN» (F16.4 forbids a th value matching `^[A-Z_]+$`, i.e. «PIN»). |
| D1 | A1 | `?emp=bow` (owner th) panel: `hr-profile-edit` inside the h2–h4 heading whose text has «ข้อมูลส่วนตัว», and not before the first `hr-profile-tab-*` (= not in the panel header) · text «ครบ <d> <mon> … (อีก 14 วัน)» · new test id **`hr-people-prob-stats`** = «เริ่ม <formatThaiDateFull(start)> … 90 วัน … สาย L … ขาด A … OT H ชม.» with L/A/H = `loadAttendanceMonth(ctx, owner, {employeeId, month})` summed over every month from the start month to this month (premise: reader non-null) · [exception control] `hr-people-panel-open` links to the profile. |
| D2 | B6 B7 | profile general tab (bow, owner th): `hr-life-banner` and `hr-people-prob-stats` after the first `hr-profile-tab-*` (below the tabs) · same stats regex · `hr-profile-edit` on the «ข้อมูลส่วนตัว» heading and not in the header card, for O (namfon) and M (namfon) · for payroll-all / payroll-U1, **if** `loadAttendanceMonth` refuses them, their bow profile shows no «สาย n / ขาด n / OT n ชม.». |
| D3 | B5 | owner th row f02: «สัญญาถึง <d> <mon>» (D0+20) · en row «Contract until» · f01 (no contract date) has neither. |
| D4 | B11 | header tail «ทะเบียนลูกจ้างตามกฎหมายแรงงานออกจากหน้านี้» in the owner th register · DOM order `hr-people-search` < `hr-people-branch` < `hr-people-dept` < `hr-people-ended` (mockup: search · branch · department · switch) · `hr-people-search-go` absent or `sr-only` (Enter still submits the GET form) · owner row namfon (MONTHLY) shows «รายเดือน» (type cell line 2) · [privacy control] M, MU1 and LR register HTML + props never contain «รายเดือน» · new test id **`hr-people-summary`**: «<U1> 24» and «<U2> 3» (active per home branch) · with `?ended=1` also «สิ้นสุด 2». |
| D5 | B3 | `EmployeeProfileForm` rendered **alone** (renderTree) with the owner's `?edit=1` props: en text has no Thai token except data values found in the props (labels, legends, options, help text must be translated) · control: the th render has Thai labels. |
Pinned by DOM order / presence / text only: placement (heading, below tabs, filter order), wording, counts. Left to the walker + visual review: drawer shape, row density, wrapping, menu fit, colours/icons.

## New walker assertions (`walk-hr.mts` · `state.r2` per size id, "*" = all · ORACLE-EDIT (HR VIS-5c · controller r2))
| finding kind | ruling | rule |
|---|---|---|
| FOLD | B1 | `[data-testid^="hr-people-row-"]` fully inside the first viewport: ≥ 8 at 1440×900, ≥ 6 at 1024×768, ≥ 3 at 390×844 (`02-employees`, all viewers) |
| ONE-LINE | A1 B8 | status chips `hr-register-status-*` on one line (all register states); + branch names `hr-register-unit-*` at 1024/1440 and with the panel |
| MID-WORD | A1 B7 B8 | text may break only at whitespace or after - – / : table cells at 1024/1440 and beside the panel (1280/1366/1440/1536), panel h2/h3, profile h1/h2 at every size (Thai runs without a space count as one word — the mockup keeps them unbroken) |
| LABELS-TOUCH | B2 | at 390: each `hr-profile-tab-*` label inside its own box and ≥ 8 px from the next on the same line (all profile states) |
| MENU-FIT | B9 | `02-employees-menu`: after clicking ⋯ of น้ำฝน, the floating box (nearest absolute/fixed ancestor of the delete trigger) fits the viewport and `hr-people-remove-<id>-trigger` is hit-testable |
| DRAWER | A1 | `02-employees-panel` 1440 + `02-employees-panel-widths` 1280/1366/1536: panel bottom ≥ min(viewport bottom, table bottom) at scroll 0 |
| FIT-CLIP (existing) | A1 | panel states: every table cell inside `hr-people-table` |
| TAB-ACTIVE | P14 | profile states: a visible `<a href="/app/sys/{hr}/hr/employees">` with `aria-current="page"` or `border-b-2` |
| SEED-DIRTY | B10 | every `hr-people-row-<id>` is a seed-hr-qc / seed-hr-walk employee id (press-test leftovers fail the cell) |
| EN-THAI-FORM | B3 | `03-employee-namfon-edit-en` (O, M · 1440 en): every Thai token inside `form:has([data-testid="hr-profile-footer"])`, not capped at 8; seed data removed |
| EXPECT-TEXT | A2 B5 A1 | `02-employees`: ton's chip «ลาวันนี้»/«On leave today» (seeded leave) · jay's chip «สัญญาถึง»/«Contract until» · panel text «ครบ … (อีก N วัน)» |
Also: `state.click` now fills `{placeholders}`; r2 is skipped on redirect cells (S → /app/me); `--dry` validates every r2 selector with `querySelectorAll` in Chromium.

## Walk matrix / seed (A2)
- New viewer **LR** = `leave-read` (STAFF, only `hr.leave.read`, all branches) — `seed-hr-walk` step `user.leave-read`; `--down` deletes it (`extraEmails` in the manifest; residue check covers it).
- Seed step `leave.today.ton`: `hr.requestLeave` + `decideLeave` (owner) SICK today → «ลาวันนี้» on ton's row. Removed by `--down` (tenant rows not in the baseline).
- States added: `02-employees-panel-widths` (O · 1280/1366/1536 · th/en) · `02-employees-ended` (`?tab=ended` · O P M MB) · `02-employees-ended-switch` (`?ended=1` · O) · `02-employees-menu` (⋯ open · O M MB) · `03-employee-namfon-{docs,schedule,leave,history}` (O M P) · `03-employee-namfon-pay` (O P) · `03-employee-namfon-edit-en` (O M · 1440 en). All new states 3 sizes × th/en unless stated.
- Changed: `02-employees` + LR + r2 · `02-employees-panel` viewers O P MB + fit + r2 · `03-employee-namfon` + LR · `03-employee-namfon-edit` + MB PB LR (their `?edit=1` = normal read view) · `03-employee-bow` r2.
- Dry run: see Runs.

## Narrow acceptances added for this round (never a whole file)
- `qc-hr-vis-5-lib` diffStatics: `walk-hr.mts` / `seed-hr-walk.mts` only when every hunk carries a VIS-5 marker · `module-tabs.tsx` (a VIS-5b file) takes hunks marked «HR VIS-5c» (P14) — in the 5c run and in vis-5b's own-file check · msgStatics: `LIFE_MOCKUP` = exactly `hr.life.banner.pass`=«ประเมิน», `due.onboarding`=«Onboarding ค้าง», `due.offboarding`=«Offboarding», `checklist.onboarding`=«Onboarding checklist» (th only, exact value; en untouched).
- `qc-hr-leave-3` v5cOk: + module-tabs.tsx · + vis-5a.mts, walk-hr.mts, seed-hr-walk.mts (every hunk «HR VIS-5c») · messages: the same 4 hr.life keys (th, exact value).
- `qc-hr-priv-2` S5 `VIS5C_SRC` + module-tabs.tsx · S4 `VIS5_ORACLES` + vis-5a.mts. `qc-hr-h4.3-lib` S1.6 `VIS5_ORACLES` + vis-5a.mts.
- `qc-hr-vis-5a` S2 (was 41/42 on the lane after the merge: VIS-5c's files outside VIS-5a's list): explicit `V5C_FILES` (VIS-5c product files, module-tabs, the oracles/tools edited for VIS-5c) accepted only when every hunk has «HR VIS-5c»; new files (people-ui/-rules, qc-hr-vis-5c) only absent in base + marker in lines 1–3.

## Builder to-do (round 2) — item → file/area → covered by
General rule G: match mockup 02 in layout, placement and wording except (a) fitness-forbidden values, (b) ruled absences, (c) the declared exceptions below.
| # | item | file / area | check / assertion |
|---|---|---|---|
| 1 | R1 leftovers: `hr.people.title` «พนักงาน», `branches` «{n} สาขา», `unitPeople` «{name} {n} คน», `col.unit` «สาขา», `branch` «สาขา» | `src/messages/th/common.json` | W1 |
| 2 | R2 leftover: remove the «ยังไม่ระบุสาขาประจำ» comment in ui.tsx | `ui.tsx` | qc-hr-h1.1 X9.1 |
| 3 | B4: `prof.conn.pin` «PIN POS» · `prof.conn.pinChange` «เปลี่ยน PIN» · `form.save` «บันทึก» · dept filter default/label «แผนก» | th messages · ui.tsx filter | W1 |
| 4 | B4: ต้องจัดการ tiles «Onboarding ค้าง» / «Offboarding» | `hr.life.due.onboarding/offboarding` (th; LifecycleDuePanel itself is frozen) | W1 · S5 accepts exactly these values |
| 5 | B4/B6: banner action «ประเมิน» on the general tab; no «ผ่านทดลองงาน» there — **see Q2 before choosing the route** (rename `hr.life.banner.pass`, or own «ประเมิน ›» link to the history tab where the confirm stays) | th messages or page/people-ui | W1 |
| 6 | B4: checklist heading «Onboarding checklist» | `hr.life.checklist.onboarding` (th) or a `hr.people` key used by ProfileChecklist | W1 |
| 7 | A1/B7: «แก้ไข» = link on the «ข้อมูลส่วนตัว» heading (EmployeeReadView), removed from ProfileHeader (panel and profile) | `people-ui.tsx` | D1 · D2 · V3 (href ?edit=1) · A3 |
| 8 | A1: panel = full-height drawer flush right (border-left + shadow, no short rounded card) | `ui.tsx` panel `<aside>` | walker DRAWER (`02-employees-panel`, `-widths`) · visual |
| 9 | A1: probation strip «ทดลองงาน · ครบ <d mon> (อีก N วัน)» (same wording as LifecycleBanner `banner.probation`) | `ui.tsx` panel | D1 · walker EXPECT-TEXT |
| 10 | A1/B6: stats line, test id `hr-people-prob-stats` (+ inventory rows on both pages): «เริ่ม <formatThaiDateFull(start)> · <probationEnd−start> วัน · สาย L · ขาด A · OT H ชม.»; L/A/OT = `loadAttendanceMonth(ctx, viewer, {employeeId, month})` (judge.ts, existing gate) summed over start-month…this month; counts omitted when it returns null | `people-ui.tsx` (+ panel in ui.tsx) | D1 · D2 |
| 11 | B6: probation banner (and stats) below the tabs, first item of the general tab | profile page / people-ui | D2 |
| 12 | A1/B8: beside the panel and at 1024 — chips one line, branch names one line, no mid-word break in any cell or title; cells inside the frame at 1280–1536 | `ui.tsx` table classes | walker ONE-LINE · MID-WORD · FIT-CLIP |
| 13 | B1: fold — ≥ 8 full rows at 1440×900, ≥ 6 at 1024×768, ≥ 3 cards at 390×844 (header/tabs/filters height, row height, card height) | `ui.tsx` + employees page | walker FOLD |
| 14 | B2: profile tab labels must not touch/overflow at 390 (en and th) | `ProfileTabs` (people-ui) | walker LABELS-TOUCH |
| 15 | B3: EmployeeProfileForm fully translated: legends, labels, select options, help text, placeholders (hard-coded Thai literals → `hr.people.form.*`) | `EmployeeProfileForm.tsx` + messages | D5 · walker EN-THAI-FORM · S5 noThaiLiteral |
| 16 | B5: contract-end chip «สัญญาถึง <d mon>» / «Contract until <date>» when `contractEndAt` is set | `ui.tsx` status cell | D3 · walker EXPECT-TEXT (jay) |
| 17 | B9: ⋯ menu fits the viewport, delete reachable (e.g. compact schedule rows, max-height + internal scroll that stays inside the viewport, open upward near the bottom) | `ui.tsx` ⋯ menu | walker MENU-FIT · visual |
| 18 | B11: header tail sentence «— ทะเบียนลูกจ้างตามกฎหมายแรงงานออกจากหน้านี้» (new `hr.people` key, en too) | `ui.tsx` header | D4 |
| 19 | B11: filter order search · branch · แผนก · แสดงที่สิ้นสุด; no visible «ค้นหา» button (a `sr-only` submit is allowed; Enter submits the GET form) | `ui.tsx` filters | D4 · visual (control look) |
| 20 | B11: type column second line = pay type (รายเดือน …) — only for viewers entitled to pay data; **Q1** | `ui.tsx` type cell | D4 (owner yes · M/MU1/LR never) |
| 21 | B11: footer `hr-people-summary` «แสดง … · <branch> n · <branch> n (· สิ้นสุด n with the switch)» (+ inventory row) | `ui.tsx` footer | D4 |
| 22 | P14: «พนักงาน» module tab highlighted on profile pages (e.g. optional prefix/active prop on ModuleTabs used only by HR — module-tabs.tsx hunks marked «HR VIS-5c»; qc-hr-vis-5b must stay green; other modules byte-identical behaviour) | `module-tabs.tsx` + profile page | walker TAB-ACTIVE |
| 23 | B10: pictures on a clean seed (press-test rows removed: `seed-hr-walk --down` then up) | controller procedure | walker SEED-DIRTY |
| 24 | A2: nothing to build — states exist; the badge/ended/menu/tab/LR pictures come from the walk | — | walker states |

## Declared exceptions (owner list)
- (c) Panel footer = link to the full profile («เปิดโปรไฟล์เต็ม →»), not บันทึก · ยกเลิก · สิ้นสุดการจ้าง (no second editor).
- (c) Table beside the open panel may show fewer than 9 columns (app shell wider than the mockup's rail) — nothing may wrap mid-word or clip.
- (a) `col.pin` stays «รหัส PIN» (mockup «PIN» = `^[A-Z_]+$`, F16.4).
- (b) footer «+ ยืมตัวมา N» part (needs the borrowings list reader — same as the ยืมตัว tag already on the owner list).

## Owner-list additions
- In-panel save / cancel / end-employment (panel footer exception).
- «ยืมตัวมา N» in the register footer (borrowings reader).
- If Q1 is ruled out: pay-type sub-line in the type column.

## Deferred to VIS-5e (review C-items, not pinned)
R6/P8 checklist footnote + tickable squares · P5 SSO hospital (no field) · R13 account role / «ใช้ kiosk» · P6 multi-line address (unverified data) · R15 title shown 3× · Thai dates in en from base components (banner, LINE chip, ต้องจัดการ tiles) · LINE pill wrap · 12-hour native time inputs · back link 20 px · edit-form 41 px inputs · add card overlaying filters · empty lifecycle card for the manager in edit mode · legend divider · unlabelled gap before บันทึกเพิ่มเติม · faint «→» for payroll rows · R14 ต้องจัดการ sub-title/icon · C4 nickname vs legal name in the list · C5 ก้อง chip without day count · cov-02/cov-03 pictures (C3). P14 is NOT deferred (pinned above).

## Questions for the controller
1. **Q1 type line 2 (pay type).** The mockup's second line is the pay basis (รายเดือน / ฿400/วัน); brief §1 says non-payroll viewers get no payType. Pinned: owner sees «รายเดือน», M / MU1 / LR never. It needs a per-row read of the salary profile's payType with the PRIV-2 pay scope — the same kind of read 5c-2 left out for the pay rate. Allowed in VIS-5c, or owner list (then D4.typeLine is removed)?
2. **Q2 «ประเมิน».** LifecycleBanner's button passes probation in one click (`confirmProbationAction`). Re-labelling it «ประเมิน» (evaluate) would mislabel an irreversible step. W1 accepts either: rename `hr.life.banner.pass`, or a «ประเมิน ›» link to the history tab (notes/review + the confirm button, labelled as today). Recommend the link.
3. **Q3 MID-WORD definition.** Lines may break only at whitespace or after - – /. Thai runs without a space therefore must not wrap in table cells and titles (mockup: `white-space: nowrap`); a 390 profile title may wrap only at « · ». Confirm.
4. **Q4 seed side effect.** ton's approved sick leave today also shows on today's hub/attendance/leave pictures (VIS-5b/attendance states). Accept, or move the leave to a non-rostered employee?
5. **Q5 oracle size.** qc-hr-vis-5c.mts is ~62 KB (> 60 KB guideline; helpers already moved to qc-hr-vis-5-lib). Accept, or split the D-checks into a lib function?

## Runs (lane DB · iso.sh → qc-hr.sh → with-gate-lock.sh · QC_FORCE=1)
Logs: `/tmp/claude-0/-root/59156a1f-9c0e-594d-9643-d1896f46b191/scratchpad/r2/`.
| suite | right after the merge (fb68f9c43, no edit of mine) | after round 2 (this commit) |
|---|---|---|
| qc-hr-vis-5a | 41/42 — S2: VIS-5c's lane files outside VIS-5a's list | **42/42** (narrow S2 acceptance) |
| qc-hr-vis-5b | 34/34 | **34/34** |
| qc-hr-vis-5c | 37/38 — W1 only (R1 wording, builder) | **37/43** — red by design: W1 · D1 · D2 · D3 · D4 · D5 (reasons below) · structural/controls green · residue none |
| qc-hr-priv-3 | 27/28 — S4 only (lane scope, excluded) | 27/28 — S4 only |
| qc-hr-priv-2 | 47/47 | 47/47 |
| qc-hr-h4.3 | 45/45 | 45/45 |
| qc-hr-leave-3 | 53/53 | 53/53 |
| qc-hr-preprod-1 | 57/57 | 57/57 |
| qc-hr-h1.1 | — | 80/81 — X9.1 `commentOnly` (builder to-do 2, unchanged) |
| typecheck (iso, ISO_MEM=14000M, heap 12288) | — | exit 0 · 0 errors |
| walk-hr `--dry` | — | exit 0 · 63 states · 963 shots · every r2 selector parsed by Chromium · no matrix error |
Why each new check is red now (right reason): W1 — the 5 R1 strings + «PIN ลงเวลา», «ตั้ง/เปลี่ยน PIN», «บันทึกข้อมูล», «ทุกแผนก», tiles, «ผ่านทดลองงาน», «รายการรับพนักงานใหม่» · D1 — แก้ไข in the panel header, strip «ทดลองงาน · N วัน» without «ครบ … (อีก N วัน)», no `hr-people-prob-stats` (premise loadAttendanceMonth(owner) holds; footer link control green) · D2 — banner before the tabs, no stats, แก้ไข in the header card (O, M) · D3 — f02 row has no contract chip · D4 — no tail sentence, dept before branch, visible ค้นหา, no pay-type line, no `hr-people-summary` (privacy control «no รายเดือน for M/MU1/LR» green) · D5 — 57 Thai tokens in the en form (control green).
Not executed: every walker r2 assertion and every new walk state (needs a build + server + `seed-hr-walk` up — CONTROLLER-RUN); the seed steps `user.leave-read` / `leave.today.ton` and their `--down` removal are written but not run. Two accidental bare `tsx scripts/seed-hr-walk.mts` invocations (no wrapper, no args) stopped at the "no seed-hr-qc expected file" check (exit 3) before any write — no manifest was created.

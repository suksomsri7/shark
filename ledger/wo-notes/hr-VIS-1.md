# VIS-1 — fixes from visual review batch 1 (H2.5 · H4.4 · H2.4 · H2.7/H2.8 · H4.1 · H3.3)

Branch `wip/hr-vis1` from 36d8989d7. Lane DB wo-hr-qc-l1 (qc-hr.sh). Defect list: `hr-VISUAL-batch1.md`.

## Done
- **A1** day table: 9 columns fixed widths (`COLS`, min-w 940 px) inside its own `md:overflow-x-auto` frame, employee column sticky, hint line `hr-att-scroll-hint` (md–xl); side cards move under the table below 2xl. Badge no longer clipped.
- **A2** mobile cards: every value carries its column label (`Cell`), shift name + times stacked, clock-out in its own labelled cell, empty = labelled "—". Method line only when present.
- **A3** month calendar: recompute button only inside cells at xl+; below xl a day list under the grid (`hr-att-daylist`, rows `hr-att-dayrow-<day>` = details: shift/in/out/hours/OT + recompute). Status text wraps (no truncate); times wrap as "06:56 –/15:00". Today highlighted (`aria-current=date`, page passes `thaiDateKey()`). Side card says "สรุป <วัน>" when not today.
- **A4** seed: `HQC.attendanceRoster.today` (9 published rows for today, no clock rows — H1.2 S7.3 keeps 120) + second judge run at fixed 07:30 ⇒ 2 NOT_IN alerts (keng, namfon) ⇒ banner. New self-check AJ2. hr-expected.json counts: HrRosterEntry 120 (+9), HrAttendanceAlert 2, OutboxEvent +2 — no oracle needed an edit.
- **B1** `canSeeLifecycleOps = canSeeLifecycle || canOffboard` for lifecycleDue · loadLifecycleForViewer · listChecklist · setTaskDone (branch scope from the row as before). Notes, settings, startChecklist, confirmProbation stay `canSeeLifecycle`. Ops-only viewers get no offboard reason/note. UI: checklist shown to ops viewers, start/pass buttons only with the key.
- **B2** `LifecycleBanner` mounted at the top of the profile (above the edit form); ended banner neutral tone; contract banner shows "อีก n วัน"; empty onboarding heading hidden.
- **B3** `life-staff-self` removed from visual spec "4.4".
- **C** `canRunKiosk` (clock-settings.ts) = `evaluate(hr.attendance.clock)` ⇒ OWNER · MANAGER · STAFF with `hr.attendance.clock`/`hr.*`. Page `/hr/kiosk` 404 otherwise; `kioskClockAction` returns `KIOSK_REFUSED_TEXT` before reading the form (assertCan kept). Read-only HR keys (leave.read, payroll.read) do NOT open the kiosk — the kiosk action never accepted them. Brief H2.4 names no wider audience.
- **D1** pending card meta wraps. **D2** holidays + preset button + section title in BE (`formatThaiDate`, year+543). **D3** one type select: policies exist ⇒ `policyId` (required) only, `requestLeaveAction` derives `type` from the policy category when no `type` is posted; no policies ⇒ legacy type select.
- **E** impact line = "กระทบ: <ชื่อกะ> 08:00–16:00 · 19 พ.ย. 69 — …" (shift name read by entry id in ui.tsx, only for entries the hint already returned); pending leaves show the impact on their own card (`extra` slot of BulkLeaveApprovals); approved upcoming leaves keep the "ผลกระทบต่อกะ" section (their history row is a shared DataList row that truncates). testids unchanged.
- **F** law page "ข้อมูล ณ" + effective/approved dates in BE.
- **G** lifecycle + law + settings holidays now use `formatThaiDate` (BE short).

## ORACLE-EDITs
- qc-hr-h4.4: new S17.1–S17.3 (ruling B1); S4.2 / S5.10 / S8.3(list) drop `mgrRole` from the deny lists (ruling — checked positively in S17.1). Red on base: 84/86 (`hr-VIS-1-h44-red.txt`).
- qc-hr-h2.4: new S14.1 (canRunKiosk matrix) / S14.2 (page + action gate, static). Red on base: 66/68 (`hr-VIS-1-h24-red.txt`).

## Debts
- **D-VIS1-selfprofile** (→ H2.10): staff opening their own profile = 404 (pre-existing); visual r2-2 check waits for self-service.
- **D-VIS1-tabs** (→ H5.1): tab strip overflows at 1440 ("ตารางกฎหมาย" top-level); tabs that lead to 404 for staff/kiosk/member still render — hiding them changes `hrTabs`, which qc-hr-h4.4 S13.5 pins to base (+ h2.2 S1.3 sidebar mirror) ⇒ not a small change here.
- **D-VIS1-approved-impact**: impact of APPROVED upcoming leaves stays in its own section (history uses shared DataList).
- Not done (MINOR in review, out of rulings): method column empty (seed has no method), 16 px checkboxes, kiosk duplicate ปุ้ย, settings template raw text, mm/dd/yyyy native date inputs, holiday year input still ค.ศ.

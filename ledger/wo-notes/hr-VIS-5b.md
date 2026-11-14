# HR VIS-5b — team overview hub (mockup 01) — builder notes

Tree lane 1 `/root/projects/shark-hr` · branch `wip/hr-vis-5bc` · base (merge-base with `session/hr`) 09713f430 · oracle commit fd1531736.
Commits: `6d0c4f46c` build (all three brief steps in one commit — see "Deviations") · `13505e111` ORACLE-EDITs · `9b9cfea95` fix (requests bar literal kept · tsc) · `d41f704c5` ORACLE-EDIT h4.2-lib · this notes commit.

## Files (VIS5_SRC — every hunk carries `HR VIS-5b`)
| file | what |
|---|---|
| `src/app/app/sys/[id]/page.tsx` | HR wrapper `max-w-7xl` (CRM-v2 branch reused) · `searchParams` + `day`/`unit` · `<HrHub day unit>` |
| `src/components/module-tabs.tsx` | opt-in `wrap` prop (`md:flex-wrap md:overflow-visible` + `data-scroll="x"`); without it the markup is byte-identical (S11 golden `dd39eef383f01a0c`) · `items=[]` → `null` |
| `src/lib/modules/hr/ui.tsx` | imports (import block) · `hrKioskOnly` + `hrTabsFor` returns `[]` for it (88-117) · `HrHub` (710-793): `day/unit` → `teamOverviewWithPreview`, kiosk-only → one card, `HrLaborCard` awaited (null = no empty left column), slots, `<ModuleTabs wrap>`, link cards `xl:grid-cols-4` |
| `src/lib/modules/hr/overview-ui.tsx` | two-column shell; still facade-only (value-import specs unchanged, `import type` hub-rules) · 5 tiles · board/approvals/month/due frames with the kept ids |
| `src/lib/modules/hr/InboxBatch.tsx` | `selectable` = compact summary cards + checkboxes + a second batch-bar element after the list (`sticky bottom-2`); bar body shared (`barBody`); requests page (no prop) keeps the original sticky-top bar element; imports unchanged |
| `src/lib/modules/hr/hub-rules.ts` (new) | pure: `kpisOf` · `boardRowsOf` · `axisOf/pctOf/barOf` · `boardFactsOf` · `dueStripOf` · `daysBetween` |
| `src/lib/modules/hr/hub-ui.tsx` (new, server) | `HrHubHeader` · `HrTodayBoard` · `HrMonthCard` (`loadReport` time + ot, `meetsPattern`) · `HrDueStrip` (`lifecycleDue`) · `HrKioskCard` |
Shared: `src/messages/{th,en}/common.json` `hr.hub` (right after `hr.inbox`) · `scripts/hr-ui-inventory.json`.
Not touched: nav.ts · inbox*.ts · judge* · lifecycle* · labor* · privacy* · reports* · payroll-rules.ts (S3 pins green) · no migration · VIS-5c files.

## Test ids
New (inventory page `/app/sys/[id]`, wo `VIS-5b`, oracle `qc-hr-vis-5b`): `hr-hub-unit` (only with > 1 branch) · `hr-hub-day-prev|next` · `hr-hub-roster-link` · `hr-hub-add-employee` · `hr-hub-kpi-arrived|late|notin|leave` · `hr-hub-board` · `hr-hub-board-row-*` · `hr-hub-month` · `hr-hub-month-talk-*` · `hr-hub-due` · `hr-hub-due-*` (`<employeeId>-<kind>`) · `hr-hub-kiosk-link` + hub rows `hr-inbox-check-*` · `hr-inbox-batch` · `hr-inbox-batch-approve|reject`.
Kept (rows updated, wo unchanged): `hr-overview` · `-today` (tile อยู่กะ, link) · `-inbox` (approvals header "ดูทั้งหมด") · `-recompute` (red chip on the board header, **only when > 0**) · `-due` (due header link + count) · `-reports-link` (month-card header; now present only with the time report).
Strings: KPI labels reuse `hr.inbox.overview.onShift` and `hr.attendance.count.*` (สาย · ยังไม่มา · ลา · หยุด); clock-in word reuses `hr.correction.kindShort.IN`; units are rich messages `<b>{n}</b> วัน` (number = own node, word order per language).

## ORACLE-EDIT list (`ORACLE-EDIT (HR VIS-5b · controller)`)
- `qc-hr-priv-2.mts` S4: `VIS5_ORACLES` = qc-hr-vis-5b · qc-hr-vis-5c · qc-hr-vis-5-lib · qc-hr-priv-2 · qc-hr-h4.3-lib · qc-hr-h2.11 — accepted when every hunk adds `HR VIS-5[bc]`.
- `qc-hr-priv-2.mts` S5: `VIS5_SRC` = the 7 files above — every hunk adds `HR VIS-5b` (VIS-5c appends its own).
- `qc-hr-h4.3-lib.mts` S1.6: same `VIS5_ORACLES` set (`vis5Ok`).
- `qc-hr-h4.2-lib.mts` S1.7 (base mode): `VIS5_H42 = [overview-ui]` — a hunk carrying `HR VIS-5b` is accepted (the old mark regex knows only `HR Hx.y|HR-SET|POS P`). Listed in both VIS5_ORACLES lists.
- `qc-hr-h2.11.mts` VIS2.3 `compact`: also accepts `InboxBatch … selectable` (the hub card is the selectable compact card; A1 of vis-5b requires `compact !== true`, so the two oracles could not both hold otherwise). Listed in both VIS5_ORACLES lists.
- No non-HR oracle edited. No non-HR suite renders `module-tabs` markup (grep: qc-pos-buttons is a browser walk, svc-h.* / pos-p6.2 are source statics on other pages).

## Re-shoot list (01-hub · cov-01-hub · 08-kiosk · 01-hub-yesterday) — what should be above the fold
Common: page header + "จัดการการเชื่อมระบบ →" (sys page, unchanged) above the strip.
- **O 1440**: strip one row (wrap on, nothing clipped) · title row "ทีมวันนี้ · ทุกสาขา" + branch dropdown ▾ + ‹ day › + จัดตารางกะ + "+ พนักงาน" (right) · 5 tiles in one row (อยู่กะ = people; red numbers for สาย/ยังไม่มา > 0) · left: "กะวันนี้" card with hour axis, accent now-line + time, first ~4 rows (bars at shift times, status column right) · right 400 px: "คำขอรออนุมัติ" + total badge + ดูทั้งหมด, first card(s) with checkbox. Below fold: legend + footer facts, labour card (left) / month card (right), due strip full width (3 dated cards + "+N รายการ"), link cards 4 across.
- **O 1024**: one column · strip wraps to 2 lines (no "ตาร" clip) · title row (may wrap) · 5 tiles across (subs clamp to 2 lines) · board header + axis. Then approvals, labour, month, due (3 across), link cards 2 across.
- **O 390**: strip = one scrolling row (`data-scroll="x"`, declared) · title row wraps (title / dropdown / day picker / buttons) · tiles 2 columns (ลา spans 2). Board below = stacked rows (initial · name · shift text · status), no axis, no h-scroll; approvals compact with checkboxes and the batch bar sticking to the bottom while the card is on screen.
- **M** (manager, no payroll): as O but no labour card and no ฿ anywhere; "+ พนักงาน" only if the account has `hr.employee.create`; month card right.
- **MB** (branch manager): no dropdown (one branch), title "· <its branch>", board/tiles = its branch only; due strip present.
- **P / PS** (payroll): no title row, no tiles, no board. 1440: labour card left, approvals right (total badge + "ตัดสินได้ n" when fewer), month card under approvals. 390: approvals → labour → month.
- **PB**: as P with the labour card's limited note (LIMITED-NOTE).
- **S / N**: unchanged (no overview; filtered strip + link cards).
- **K** (kiosk account): no tab strip at all; one card "เปิดจอลงเวลา" + one line; no counts. `08-kiosk` K: no strip above the PIN pad; O/MB on /hr/kiosk: strip as before (sub-pages do not opt in to wrap).
- **01-hub-yesterday** (O M MB, `?day=<yesterday>`): title "ทีมวันที่ <date>", extra "วันนี้" button, board without now-line, footer "ทำแล้ว" (not "ทำแล้วถึง hh:mm").
- en: hr.hub strings in English; strip, page header, link cards and request-card dates stay Thai (pre-existing: `hrTabs` is pinned, link-card labels would collide with I1; see open questions).

## Leave-report investigation (oracle doubt 2) — result: FIXTURE-ONLY, plus a timing difference (no disagreement of rules)
Probe `/tmp/hr-ctl/vis5b-build/leave-probe.mts` (scratch, lane-1 DB, residue none): two employees rostered yesterday; A has an approved full-day leave and is stored by the real path `finalizeStoredGaps`; B gets a hand-written `HrAttendanceDay{status: LEAVE}` exactly like `qc-hr-vis-5b`'s `stored()` helper.
- stored rows: A `LEAVE leaveFraction=1` (judge.ts:315 sets "1.0", storedRow → createMany judge.ts:566) · B `LEAVE leaveFraction=null`.
- time report after storing: A `leaveDays=1.0`, B `0.0`, total `1.0`; board shows LEAVE for both. ⇒ the 0.0 the oracle author saw is the fixture writing the day without `leaveFraction`.
- timing: before any day is stored the report has 0 rows (`leaveDays 0.0`) while the board already shows LEAVE live — the time report counts stored (finalized) days only (`timeAggOf` reads `HrAttendanceDay`), so today/unfinalized days appear on the board/tiles but not in the month card. The month card says so ("นับจากผลลงเวลาที่ระบบบันทึกแล้ว").

## Runs (lane 1, `/tmp/hr-ctl/vis5b-build/runs{,2}/`)
| suite | result |
|---|---|
| seed-hr-qc | 34/34 |
| qc-hr-vis-5b forced ×5 (2 before + 2 after the last fix … ) · unforced ×2 | 29/29 every run · residue none |
| qc-hr-vis-5c forced ×2 | 11/29 = BASE-EXPECTATION 28/29 · off: **S1 GREEN→fail** (refuses VIS-5b's files on the shared branch, by the oracle's design "other ticket's files ⇒ S1") — needs a ruling before VIS-5c builds here |
| h0.6 55 · h1.1 81 · h1.3 63 · h2.1 90 · h2.4 68 · h2.10 57 · h2.11 70 · h3.9 60 · h4.2 57 · h4.3 45 · h4.4 86 · h4.5 90 · h4.6 69 · set-1 25 · money-2 57 · priv-2 47 · hf-sso 41 | all green (h2.11 VIS2.1 and h4.2 S1.7 were red on the first pass → fixed: bar element kept / ORACLE-EDIT) |
| qc-hf-hr-privacy 194 · qc-hr 9 · qc-hr-attendance 31 · qc-hr-roster 24 · qc-pages 31 | green |
| qc-nav-functions | HR lines green (HR 10 children · hrTabs = layout); suite red on S5 for HOTEL (3/17) and BOOKING (5/10) accordion completeness — files this ticket does not touch |
| fitness 54/54 · fitness-hr 9/9 | green with env and with `env -u DATABASE_URL -u DIRECT_URL` |
| clean typecheck (iso, 14000M) | exit 2 — the only errors are 4 in untracked `scratchpad/h53l/*.mts` (another agent's files, left alone); 0 errors in tracked code (an earlier run caught 2 in overview-ui, fixed in `9b9cfea95`) |
| lint | not run — `eslint` is not installed in this tree (`pnpm exec eslint` → command not found) |
Render dumps used for self-check (shim HTML): `/tmp/hr-ctl/vis5b-build/html-*.html`.

## Deviations / open questions
1. TAP-44 on "จัดการการเชื่อมระบบ →" (brief step 1 "link min-h-11") **not done**: qc-hr-vis-5b S10 rejects any changed sys-page line (removed lines included) outside HR width/props. Needs a ruling (allow the HR-only className line, or move it to VIS-5e).
2. Shift colours (mock: เช้า outline · บ่าย grey · ปิดร้าน black) are not in the board DTO (`loadAttendanceBoard` pinned) ⇒ bars use status tones: ink outline (in/done), grey fill (upcoming), red outline (not in/absent/late text), dashed (leave).
3. Roster button reads "จัดตารางกะ" (not "จัดกะสัปดาห์หน้า"): it opens `/hr/roster` (current week); test requires that href.
4. Only the hub strip wraps; HR sub-pages call `ModuleTabs` from frozen page files (not opted in) — their 1024 clipping remains.
5. "ช่วงคนน้อยสุด" and "ชั่วโมงตามกะ" use shift start–end incl. breaks (DTO has no break length) — labelled "รวมเวลาพัก".
6. `ModuleTabs([])` returns null for every module (brief); non-empty markup unchanged.
7. Steps 1–3 landed as one build commit (written together), not three.
8. qc-hr-vis-5c S1 (GREEN control) goes red once VIS-5b's files exist on `wip/hr-vis-5bc` — not editable by me (vis-5 oracles frozen); ruling needed (accept the other ticket's marked files in S1, as ui.tsx already does by range).
9. `hr.inbox.overview.title/today/noBoard/inbox/inboxTotal` are no longer rendered by the hub (kept in messages; S5 forbids touching other keys).

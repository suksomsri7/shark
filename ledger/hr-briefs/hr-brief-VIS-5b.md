# HR VIS-5b — team overview hub (mockup 01)

Base `session/hr` 09713f430 · every hunk marked `HR VIS-5b` · no business-logic, action or privacy change.
Inputs: `ledger/wo-notes/hr-H5.1-visual-review-r1.md` §01-hub · `/root/qc/hr-h5.1/{01-hub,cov-01-hub,08-kiosk}` · `ledger/design-hr/01-team-overview.png`.

## 1. Today (verified)
- `src/app/app/sys/[id]/page.tsx:84` wrapper `max-w-2xl` for all types except CHAT/CRM-v2 (the ~450 px gap) · `:86` PageHeader · `:93-100` connections link (TAP-44) · `:131` `<HrHub systemId={id} />` (no searchParams).
- `src/lib/modules/hr/ui.tsx:712-793` HrHub: `:739` `teamOverviewWithPreview(ctx, hv)` (inbox.ts:464 → `loadAttendanceBoard` judge.ts:446, `attendanceNeedsRecompute`, `lifecycleDue` count only, `listInbox` take 5) · `:747` ModuleTabs(hrTabsFor) · `:748` overview + `HrLaborCard` slot · `:749-790` link cards (`hr-link-settings|reports|sales-teams`).
- `overview-ui.tsx:37-87`: `:49` tiles `hr-overview-today|inbox|recompute|due|reports-link`. Tile 1 value = `board.rows.length` (counts DAY_OFF/NO_SCHEDULE rows) but its sub falls back to `noBoard` when no ON_TIME/LATE/PENDING/ABSENT/LEAVE ⇒ "9 · ไม่มีตารางกะ". `:81` `<InboxBatch compact />` hides checkboxes and the batch bar (InboxBatch.tsx:285, 325).
- Strip: `ui.tsx:90-104` hrTabs (10) → `:108-117` hrTabsFor → `hrNavFilter` (nav.ts). `src/components/module-tabs.tsx` = one `overflow-x-auto` row (757 px in 680 ⇒ "ตาร"). Kiosk account (STAFF + `hr.attendance.clock`, hr-qc-env.mts:285) passes `canRunKiosk` and gets 5 tabs and the hub cards ("พนักงาน 14 คน").
- Viewers (inventory, page `/app/sys/[id]`): board/KPIs/recompute O M MB · inbox O M MB P PS · labor O P PS (+PB with `hr-labor-note`) · due O MB · S K N no overview. Money only inside HrLaborCard (untouched).

## 2. Mockup elements
| # | Element | Class | Source |
|---|---|---|---|
| 1 | Tab strip, nothing clipped | EXISTS | module-tabs |
| 2 | "ทีมวันนี้ · <branch>" + branch + day pickers | DATA EXISTS | board.units/unitSel/day/prevDay/nextDay |
| 3 | จัดกะสัปดาห์หน้า → `/hr/roster` | EXISTS | link (canReadRoster) |
| 4 | + พนักงาน → `/hr/employees?add=1` | EXISTS | VIS-5c opens add panel on `add=1` |
| 5-9 | KPIs อยู่กะ · มาแล้ว · สาย · ยังไม่มา (+แจ้งแล้ว) · ลา | DATA EXISTS | board slots, alerts |
| 10 | Timeline people × hours, now-line, status col | DATA EXISTS | slot.shift, inAt, status, leave |
| 11 | Legend + หยุดวันนี้ | DATA EXISTS | DAY_OFF slots |
| 12 | Footer: planned h · worked · thinnest window · mobile/kiosk split | DATA EXISTS | shifts, totals.workedMin, slot.method |
| 13 | ดูตารางลงเวลา | EXISTS | link |
| 14 | Approvals with checkboxes | EXISTS | InboxBatch select mode |
| 15 | อนุมัติทั้งหมดที่เลือก (n) | EXISTS | InboxBatch bar → `decideInboxAction` |
| 16 | Labor card, chart, per-shift tiles | EXISTS | HrLaborCard (data-dependent) |
| 17 | AI strip "AI เสนอ … ดูข้อเสนอ" | NEW FEATURE | — |
| 18 | Month card สาย/ขาด/OT/ลา | NEEDS NEW DATA | `loadReport` time + ot (reports.ts:688), period `YYYY-MM` |
| 19 | ควรคุยรายคน + ดูปฏิทิน | NEEDS NEW DATA | time rows + `meetsPattern` (ai-rules.ts:176) |
| 20 | Month ฿ cost / labor % | EXISTS | stays in `hr-labor-month` |
| 21 | Due strip, dated cards | NEEDS NEW DATA | `lifecycleDue` items (lifecycle.ts:370) |
| 22 | Due card ส่งเงินสมทบ ปสส. / เตรียมไฟล์ | NEW FEATURE | no deadline reader |
| 23 | ต่อสัญญา action | NEW FEATURE | no renewal flow |
| 24 | Two columns board ∣ approvals | EXISTS | layout |

Counts: EXISTS 9 · DATA EXISTS 8 · NEEDS NEW DATA 3 · NEW FEATURE 3.
Batch approval = existing `decideInboxAction` through InboxBatch, never approval `bulkDecide` (HR-LEAVE-3 changes that). ADJUSTMENT stays non-batchable (`batchable` in DTO; decideInbox refuses >1); CHAIN items stay links.

## 3. Target layout
- 1440 (HR wrapper `max-w-7xl`): title row (title, branch, day ‹ › · right: จัดกะ, + พนักงาน) → 5 KPI tiles in one row → `xl:grid-cols-[minmax(0,1fr)_400px]`: left board, labor card; right approvals, month card → due strip full width → link cards compact (`sm:2 / xl:4` cols). Fold: title, KPIs, board header + rows, approvals header + first card.
- 1024 (≈690 px): one column; KPIs `md:grid-cols-5`; board timeline; approvals; labor; month; due 3 across. Fold: title, KPIs, board header.
- 390: pickers wrap; KPIs `grid-cols-2` (5th spans 2); board = stacked rows (initial, name, shift text, status chip; no hour axis, no h-scroll); approvals compact + checkboxes + sticky batch bar; labor; month; due 1 col. Fold: title, KPIs.
- Strip: ModuleTabs returns `null` for `[]`; `md:flex-wrap`; < 768 one scrolling row with `data-scroll="x"`. Kiosk-only viewer (`canRunKiosk` ∧ ¬canReadRoster ∧ ¬linked ∧ ¬canOpenInbox ∧ ¬canViewPayroll ∧ ¬hrAccessOf.openProfile) ⇒ hrTabsFor `[]` (also hides it on /hr/kiosk) and HrHub shows only "เปิดจอลงเวลา". Keep `=== systemId` in the first 1200 chars of hrTabsFor (qc-hr-h2.10 S10.7); hrTabs and nav.ts unchanged (qc-hr-h3.9 S1.8).
- Colours via tokens only (qc-hr-h2.11 S12.3: no hex/rgba/`bg-blue-`/emoji); now-line `var(--color-accent)`.

## 4. Rules
- Dates `formatThaiDate` / `formatShortDate(d, locale)` / `formatThaiTime` (`src/lib/ui/date.ts`). New strings in `hr.hub` (`src/messages/{th,en}/common.json`, inserted right after `hr.inbox`). No ฿/satang/money math in new files.
- overview-ui stays facade-only (h2.11 S1.6 set; `import type` ok) ⇒ new sections live in NEW `hr/hub-ui.tsx` (server) as ReactNode slots from HrHub; KPI maths in NEW pure `hr/hub-rules.ts` (type imports only, no `new Date()`), called in HrHub. Rules = judge statuses: onShift = person with a shift slot whose status ∉ {LEAVE, DAY_OFF, NO_SCHEDULE}; arrived = inAt; late = LATE; notIn = same predicate as attendance-ui.tsx:143; leave = LEAVE. No shifts ⇒ 0 + "ไม่มีตารางกะของวันนี้".
- Keep testids: `hr-overview` · `-today` (tile อยู่กะ) · `-inbox` (approvals header link + count) · `-recompute` (board-header chip) · `-due` (due header link) · `-reports-link` (month-card header, stays in overview-ui) · `hr-link-*` · `hr-inbox-*` · `hr-labor-*`. New: `hr-hub-unit`, `hr-hub-day-prev|next`, `hr-hub-roster-link`, `hr-hub-add-employee`, `hr-hub-kpi-arrived|late|notin|leave`, `hr-hub-board`, `hr-hub-board-row-*`, `hr-hub-month`, `hr-hub-month-talk-*`, `hr-hub-due`, `hr-hub-due-*`, `hr-hub-kiosk-link`. Inventory rows (`wo: "VIS-5b"`) for each + hub rows for `hr-inbox-check-*`, `hr-inbox-batch`, `-batch-approve|reject` (F16.8).

## 5. Build steps
1. Frame, strip, kiosk — `sys/[id]/page.tsx` (HR `max-w-7xl`; pass `unit`, `day`; link `min-h-11`), `module-tabs.tsx`, `ui.tsx` (hrTabsFor; HrHub header, cards to bottom, kiosk card), `overview-ui.tsx` two-column shell with slots, `hub-ui.tsx` header, messages, inventory.
2. KPIs + board — `hub-rules.ts`, 5 tiles in overview-ui, `HrTodayBoard` in hub-ui (timeline ≥ md, list < md); HrHub passes `{ unit, day }` to `teamOverviewWithPreview`.
3. Approvals, month, due — `InboxBatch.tsx` new `selectable` prop (compact cards + checkboxes + bar; requests page unchanged); `HrMonthCard` (gate `reportAccessOf(hv).reports.includes("time")`), `HrDueStrip` (`lifecycleDue`, by date, 3 + "+N" → `/hr/employees`); inventory; `scripts/qc-hr-vis-5b.mts`.

## 6. Shared files (parallel with VIS-5c)
- VIS-5b: `sys/[id]/page.tsx`, `module-tabs.tsx`, `ui.tsx` 88-117 + 710-793, `overview-ui.tsx`, `InboxBatch.tsx`, `hub-*`, `hr.hub` block, inventory rows of `/app/sys/[id]`, and the oracle acceptance below for BOTH tickets.
- VIS-5c: `ui.tsx` 432-678, employee pages, `EmployeeProfileForm.tsx`, `people-*`, `hr.people`, inventory rows of its pages. Controller: `scripts/walk-hr-matrix.json`.

## 7. Frozen-file oracles
- Will trip: `qc-hr-priv-2` S5 (any src file outside MARKED) and S4 (any changed `scripts/qc-*.mts`); `qc-hr-h4.3-lib` S1.6 `oracles`. Add one explicit allowlist each, as `H49_ALLOW`/`P2_ALLOW`: `VIS5_SRC` = sys/[id]/page.tsx · components/module-tabs.tsx · hr/ui.tsx · overview-ui.tsx · InboxBatch.tsx · hub-ui.tsx · hub-rules.ts · hr/employees/page.tsx · hr/employees/[employeeId]/page.tsx · EmployeeProfileForm.tsx · people-ui.tsx · people-rules.ts; `VIS5_ORACLES` = qc-hr-vis-5b · qc-hr-vis-5c · qc-hr-priv-2 · qc-hr-h4.3-lib. A file passes only when every hunk adds `HR VIS-5b|HR VIS-5c` (new file: in its first 3 lines); oracle hunks add `ORACLE-EDIT (HR VIS-5 · controller)`. One commit by VIS-5b's oracle writer; VIS-5c cherry-picks it if first.
- Do not touch: nav.ts, inbox*.ts, judge*, lifecycle*, labor*, privacy*, reports*. Any other trip = stop and report.

## 8. Acceptance (controller builds and walks)
- Walk `01-hub` all cells (O P PB M MB S × 3 sizes × th/en), `cov-01-hub` (K N PS), `08-kiosk` (K O MB), new extra `01-hub-yesterday` = `/app/sys/{hr}?day={yesterday}` for O M MB (board has data at any walk hour).
- Fold: 1440 O/M title + pickers, 5 KPIs, board rows, approvals with checkboxes; P/PB approvals + labor card, no KPIs; 1024 title + KPIs + board header; 390 title + KPI grid; K no strip, one card, no counts.
- Walker: HSCROLL-PAGE 0 · HSCROLL-EL FAIL 0 (declared strip at 390 only) · no clipped tab · I18N-MISSING/KEY 0 · RAW-ERROR 0 · PRIVACY-* BLOCKER 0 · INV-LEAK 0 · LIMITED-NOTE on PB · no new TAP-44 or testid gaps · no EN-THAI from `hr.hub`.
- Green: fitness-hr (F16.1/.3/.4/.8) · qc-hr-h2.11 · h2.10 · h3.9 · h4.2 · h4.3 · priv-2 · qc-hf-hr-privacy · qc-nav-functions · typecheck via `scripts/iso.sh` (ISO_MEM=14000M) · lint.
- `qc-hr-vis-5b.mts` (static + pure): kpisOf fixtures (LEAVE/DAY_OFF excluded, no-shift text, late/notIn = attendance-ui); hub-rules has no IO; no `฿|Satang|formatBaht` in hub-*; overview-ui import set unchanged; InboxBatch imports unchanged, no approval module; sys page diff limited to the HR width branch + HrHub props; hrTabsFor `[]` for K, full for O; ModuleTabs `null` on `[]` + `data-scroll="x"`; testids ↔ inventory; `hr.hub` th/en parity.

## QUESTIONS FOR THE CONTROLLER
1. ModuleTabs wraps at ≥ 768 for every module. Default yes — wrapping beats hidden tabs; no other module overflows today.
2. Strip + kiosk strip are also listed under VIS-5e (HR-RESUME). Default VIS-5b does them, VIS-5e drops them — one owner.
3. Month card reads the time + OT reports on each hub load. Default yes, current month only; fall back to a link if the walk shows it slow.
4. Month ฿ cost stays in the labor card. Default stay — no money enters non-money code.
5. Multi-branch owner without `?unit`: board shows all branches (today). Default keep; picker narrows.

## NOT IN THIS TICKET (owner list)
- AI suggestion strip under the labor card — needs a suggestion engine.
- Filing deadlines in the due strip (สปส.1-10 / ภงด.1, "เตรียมไฟล์") — no deadline reader.
- Contract renewal ("ต่อสัญญา") — no flow; the card links to the profile.
- Document-expiry items — `HrEmployeeDoc` has no expiry field.
- Month leave breakdown by type — no per-month per-type reader.

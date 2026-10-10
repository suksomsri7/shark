# T2.2 — Team screen A1 + empty state A8 (Opus · app lane)
Read `ai-brief-COMMON.md` + RESOLUTIONS R-C4 first. Contract: AI-TEAM-RUN §2 T2.2. Mockups: `airy-a.jpg` pages 1 (A1) and 8 (A8), dark `airy-dark-a.jpg` same pages. Element inventory (from the HTML `ai-team-airy-a.html` pages 1/8):
- A1: header (name "The Bean Café", subtitle "คน 3 · พนักงาน AI 5 · แพ็กฟรี", avatar stack +4) · search field "ค้นหาพนักงาน งาน หรือลูกค้า" · summary card: 42 งานเสร็จวันนี้ · 6.5 ชม. เวลาที่ประหยัด · 3 › รออนุมัติ (tappable) · quota bar "โควตาเดือนนี้ 62% · รอบใหม่ 1 ต.ค." · pill tabs ทั้งหมด / รออนุมัติ 3 / กำลังทำงาน / เสร็จ · employee cards (orb · name · position · live status line · time · badge count).
- A8: header "Sweet Studio · ยังไม่มีทีม AI · แพ็กฟรี" · hero text · "แนะนำสำหรับร้านคุณ" 3 cards with signals (แชทรอตอบ 12 ห้อง…) · "ดูตำแหน่งทั้งหมด" link.

## Data (spec T0.2 / T1.10)
`GET summary` → `{ people, aiCount, packKey, quotaPct, cycleEnd, tasksToday, pendingApprovals, hoursSaved: number|null, viewerRole }` · `GET employees` → `EmployeeRow[]` (liveStatus, pendingProposals, lastActivityAt, nextScheduledAt) · `GET positions?recommend=1` → recommendations. Fixtures: `t2.2-five.json` (5 employees, mixed statuses), `t2.2-empty.json` (0 employees + 3 recommendations).

## Deliverables
- `app/(app)/team/index.tsx` (used by `(app)/index.tsx` TeamHome): `TeamHeader` · `SearchField` (client-side filter on name/position/last task title; "ลูกค้า" search = T6.2 debt note) · `SummaryCard` (3 stats; the third is a button → `/inbox`; `hoursSaved null` → "—") · `QuotaBar` (percent + "รอบใหม่ <date BKK>") · `PillTabs` with live counts · list of `EmployeeCard` (GlassCard, gap 12, inner padding) → `/team/[id]` · pull-to-refresh · skeleton/error states · empty → `EmptyTeam` (A8 copy from i18n; recommendation cards → `/hire?position=<key>&quick=1`; "ดูตำแหน่งทั้งหมด" → `/hire`).
- Status line wording map (i18n): WORKING "n งานกำลังทำ · m รออนุมัติ", chat position shows "ตอบลูกค้า n ห้อง · LINE, FB" only when the API provides `channels` (else generic), IDLE "ว่าง · งานประจำถัดไป <time>".
- testIDs: `team-search`, `team-stat-done`, `team-stat-hours`, `team-stat-pending`, `team-quota`, `team-tab-<key>`, `team-card-<id>`, `team-empty-reco-<key>`, `team-empty-all`.
- Inventory rows + fixtures + i18n keys.

## Files you own
`app/(app)/team/index.tsx`, `src/components/team/{SummaryCard,QuotaBar,EmployeeCard,EmptyTeam}.tsx`, fixtures `t2.2-*.json`, inventory rows, i18n.

## Acceptance (oracle `qc-ai-t2.2`)
S1 pair A1 light (controller eye + difference table) · S2 pair A8 · S3 tab filtering by DOM · S4 search · S5 navigation targets (router mock log in the QC copy) · S6 testIDs · S7 no hard-coded Thai in owned files · S8 dark pair contrast · S9 typecheck · S10 numbers equal fixture.
Regression: T2.1 shots.

## Controller rulings
- Cards show at most 5 employees per viewport height (mockup "ทีมเหลือ 5 คนต่อจอ") — natural with 12 px gaps; no artificial limit.
- Hours stat hidden value "—" until T4.5 (placeholder noted in wo-notes).

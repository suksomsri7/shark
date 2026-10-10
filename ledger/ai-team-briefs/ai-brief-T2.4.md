# T2.4 — Employee tasks screen A3 (Opus · app lane)
Read `ai-brief-COMMON.md` first. Contract: AI-TEAM-RUN §2 T2.4. Mockup `airy-a.jpg` page 3 (+ dark). HTML: header (back · "คุณเอก" · "เซลส์ดูแลลูกค้า · The Bean Café" · avatar stack AI + commanders · "+" icon top-right) · memory strip "จำได้ทุกงาน — คู่มือเซลส์ v3 · นโยบายส่วนลด · ลูกค้า 214 ราย" · pill tabs งาน 8 / งานประจำ 2 / เก็บแล้ว · groups รออนุมัติ / กำลังทำ / งานประจำ / เสร็จแล้ว with rows (title · subtitle · time · status dot).

## Data
`GET employees/[id]` (`manualVersion`, `knowledgeCount`, `customerCount` (crm facade count, null if no CRM), commanders) · `GET employees/[id]/tasks?filter=` · `GET schedules?employee=`. Fixture `t2.4.json`.

## Deliverables
`app/(app)/team/[id]/index.tsx` (+ `_layout` if needed) · `src/components/team/{TaskRow,MemoryStrip}.tsx` · "+" → `/tasks/new?employee=<id>` · tab งานประจำ → schedule rows (next run) → `/schedules/[id]` · เก็บแล้ว → archived rows · row tap → `/tasks/[id]` · pull-to-refresh · empty state "ยังไม่มีงาน · เริ่มงานแรก" · testIDs `emp-new-task`, `emp-tab-<key>`, `emp-task-<id>`, `emp-schedule-<id>`, `emp-memory-strip` · inventory · i18n.

## Files you own
`app/(app)/team/[id]/**`, the two components, fixtures, inventory, i18n.

## Acceptance (oracle `qc-ai-t2.4`)
S1 pairs light/dark · S2 grouping by fixture statuses · S3 tabs · S4 "+" navigation · S5 testIDs/i18n · S6 empty state · S7 refresh refetch · typecheck · residue.

# T2.10 — Employee profile B7 + manual history B8 (Opus · app lane)
Read `ai-brief-COMMON.md` + RESOLUTIONS R-A10, R-C4 first. Contract: AI-TEAM-RUN §2 T2.10. Mockups `airy-b.jpg` pages 7–8 (+ dark). HTML: B7 big orb · "คุณเอก" · "เซลส์ดูแลลูกค้า · จ้างเมื่อ 1 ส.ค. 69" · status "● ทำงานอยู่ · 2 งาน" · 4 stats (318 งานเดือนนี้ · 94% ผ่านโดยไม่ต้องแก้ · 52 ชม. เวลาที่ประหยัด · 21% โควตาที่ใช้ · เพดาน 25%) · rows ตัวตน / คู่มือการทำงาน v3 · 20 ก.ย. / สิทธิ์ CRM · บัญชี · +2 / ความรู้ 4 รายการ · buttons พักงาน / เลิกจ้าง. B8 "ประวัติคู่มือ · คุณเอก · 3 เวอร์ชัน · ย้อนกลับได้ทุกเวอร์ชัน" · version cards (v3 ใช้อยู่ · date · แก้โดย · note · diff line · 📈 หลังแก้ 88% → 94%; v2/v1 with "ย้อนกลับไปใช้").

## Data
`GET employees/[id]` (stats: `tasksThisMonth`, `passPct`, `hoursSaved|null`, `quotaPct`, `quotaCapPct`, `hiredAt`, `liveStatus`, `openTasks`, `manualVersion`, `manualUpdatedAt`, `accessSummary`, `knowledgeCount`) · `GET employees/[id]/manual/versions` (`changedSections`, `effect: {before, after} | null` — null until T4.7) · `POST manual/revert { version, confirm }` · `POST pause|resume|terminate`.

## Deliverables
`app/(app)/team/[id]/profile.tsx` + `manual-history.tsx` · `ProfileHeader`, `StatGrid`, `ConfirmSheet` (reason input ≥ 5 chars for terminate; pause reason optional) · rows navigate to the hire sub-screens in edit mode (`/hire/persona?employee=`, `/hire/manual?employee=`, `/hire/access?employee=` — those screens accept `?employee=` and PATCH instead of create: **add that mode to T2.9's screens in this WO**) · "ความรู้" → placeholder until T4.6 · default employee: no "เลิกจ้าง" button · B8: version list, diff summary from `changedSections`, 📈 hidden when `effect` null, "ย้อนกลับไปใช้" → confirm → revert → invalidate.
testIDs `prof-pause`, `prof-terminate`, `prof-row-<k>`, `prof-stat-<k>`, `hist-version-<n>`, `hist-revert-<n>`, `confirm-reason`, `confirm-ok`.

## Acceptance (oracle `qc-ai-t2.10`)
S1 pairs B7/B8 light/dark · S2 stats + "—" for hours · S3 row navigation (edit mode) · S4 terminate confirm/reason validation → API · S5 revert confirm → API · S6 default employee hides terminate · S7 testIDs/i18n · typecheck · residue.

# T2.7 — Recurring task form A6 (Sonnet allowed · app lane)
Read `ai-brief-COMMON.md` + RESOLUTIONS R-C2/R-C7 first. Contract: AI-TEAM-RUN §2 T2.7. Mockup `airy-a.jpg` page 6 (+ dark). HTML: header "งานประจำ" + save button "บันทึก" top-right · hint "ทำซ้ำอัตโนมัติตามเวลาที่ตั้ง" · ผู้ทำ row (orb · name · position · "เปลี่ยน") · ชื่องาน input · สั่งว่า textarea · ความถี่ segmented ทุกวัน/ทุกสัปดาห์/ทุกเดือน + time "08:00" · day pills จ อ พ พฤ ศ ส อา · ส่งผลทาง pills ในแอป / LINE / อีเมล · "ถ้าต้องส่งอะไรถึงลูกค้า" segmented ร่าง+รออนุมัติ / ทำเองได้ · footer "ใช้โควตาประมาณ 1% ต่อเดือน".

## Data
`POST schedules` / `PATCH schedules/[id]` body `{ aiEmployeeId, title, instruction, frequency, days[], minuteOfDay, channels[], outputMode }` · `GET schedules/[id]` · estimate from `GET schedules/estimate?employee&frequency&days` (add to T1.10 addendum if missing; fixture otherwise).

## Deliverables
`app/(app)/schedules/new.tsx` + `[id].tsx` (same form component `ScheduleForm`): employee picker sheet ("เปลี่ยน" → list of ACTIVE employees) · time picker = native `DateTimePicker` (web export cannot render it — the QC copy patches to a text input; note) · WEEKLY shows day pills (1–7), MONTHLY shows day-of-month pills 1–28, DAILY hides · channels multi-select (LINE/EMAIL disabled with hint when `summary.channels` lacks them) · outputMode AUTO disabled + hint until T4.2 (`team.auto.locked`) · live estimate line · inline validation (title required, ≥ 1 day for WEEKLY/MONTHLY) · save → POST/PATCH → back to A3 with invalidate · cap refusal → inline Thai from `error.code` map · delete (edit mode, confirm).
testIDs `sched-employee`, `sched-title`, `sched-instruction`, `sched-freq-<k>`, `sched-time`, `sched-day-<n>`, `sched-channel-<k>`, `sched-output-<k>`, `sched-estimate`, `sched-save`, `sched-delete`.

## Acceptance (oracle `qc-ai-t2.7`)
S1 pairs · S2 defaults + inline validation · S3 AUTO disabled · S4 POST body equals spec schema (zod check in oracle) · S5 cap error inline · S6 PATCH on edit · S7 testIDs/i18n · typecheck · residue.

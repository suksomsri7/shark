# T4.5 — Daily rollup + team report D7 (Opus · server + app)
Read `ai-brief-COMMON.md` + RESOLUTIONS R-A10, R-C4 first. Contract: AI-TEAM-RUN §2 T4.5. Mockup `airy-d.jpg` page 7 (+ dark). HTML: "ผลงานทีม · The Bean Café · ก.ย. 69 ⌄" · big "214 ชม. · เวลาที่ทีม AI ทำงานแทนในเดือนนี้ · ↑ มากกว่าเดือนก่อน 18%" · 4 stats (1,284 งานเสร็จ · 93% ผ่านโดยไม่ต้องแก้ · 11 นาที รออนุมัติเฉลี่ย · 62% โควตาที่ใช้) · "รายคน" rows (น้องมะลิ · แอดมินแชท · 612 งาน · ผ่าน 97% · 88 ชม.) · warning row "ไอดิน · คอนเทนต์ · ถูกตีกลับ 18% · ควรปรับคู่มือ · ดู ›".

## Verified facts
- `AiEmployeeDaily(aiEmployeeId, day, tasksDone, approved, edited, rejected, usageMicro, minutesSaved, approvalWaitSecSum, approvalCount)` unique `(aiEmployeeId, day)` (T1.1). Sources: `AiTask` DONE/ARCHIVED by day (BKK `dayKeyBangkok`), `AiActionLog` decisions (`createdAt − proposal.createdAt` = wait), `AiCreditTxn.aiEmployeeId` sums, `templates.ts` `estimatedMinutes` per frequent task matched by `AiTask.title`/kind (fallback `DEFAULT_MINUTES_BY_CLASS` in templates.ts: money 20, customerFacing 10, internal 5).
- Jobs: `scripts/ai-team-cron.mts --job=daily` + `/api/cron/hourly` hook running the previous day once (idempotent `upsert` on `(aiEmployeeId, day)` with full recompute — safe to re-run); also archives task rooms older than `historyDays` and cleans abandoned teach notes (T4.1 ruling).
- Fitness F16.3 (no money keys in the report DTO).

## Deliverables
Server `src/lib/ai/team/daily.ts`: `rollupDay(tenantId, day, { now })` · `rollupAll(now)` (yesterday for every tenant with employees; lease) · `teamReport(ctx, monthKey) → { hours, hoursVsPrevPct, tasks, passPct, avgWaitMin, quotaPct, perEmployee: [{ id, name, positionLabelTh, tasks, passPct, hours, rejectedPct, needsManual }], needsManual: [...] }` (needsManual when rejectedPct > 15 and tasks ≥ 20) · employee stats for B7/A1 (`tasksThisMonth`, `passPct`, `hoursSaved`) now read from the rollup (T1.10 DTO fields filled; A1/B7 stop showing "—") · route `GET /api/mobile/team/report?month=YYYY-MM`.
App `app/(app)/team/report.tsx`: month picker (last 12) · hero hours + vs-prev · 4 stats · per-employee rows → profile · warning rows "ดู ›" → profile manual.
testIDs `rep-month`, `rep-hours`, `rep-stat-<k>`, `rep-emp-<id>`, `rep-warn-<id>`.

## Acceptance (oracle `qc-ai-t4.5`)
S1 rollup idempotent + overlap (X4/X5) · S2 numbers from seeded outcomes · S3 minutes not model-derived (static) + no money keys (DTO + F16.3) · S4 vsPrev · S5 needsManual rule · S6 X1 · S7 pairs D7 + A1/B7 with real hours · S8 injected month/now. Regressions T2.2 T2.10 T4.4.

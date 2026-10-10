# T3.2 — Per-employee quota cap (Opus · server lane)
Read `ai-brief-COMMON.md` + RESOLUTIONS R-A6 first. Contract: AI-TEAM-RUN §2 T3.2. Mockups B5 (slider 25 %), C1 (per-employee bars), B7 ("21% โควตาที่ใช้ · เพดาน 25%").

## Verified facts
- T3.1: `AiEmployee.usedMicroCycle`, `quotaCapPct`, `canRunAi(tenantId, { aiEmployeeId })`; `chargeToPack` increments the employee counter after the call (cost is known only after the model answers).
- Pre-check must therefore use an **estimate** (`packs.ts#AVG_TASK_MICRO` from AI-TEAM-COST) and a conditional update that reserves headroom: `UPDATE "AiEmployee" SET "reservedMicro" = …`? **No new column** → use the conditional check `usedMicroCycle + AVG_TASK_MICRO ≤ cap × allowance` in `canRunAi` (read) and accept a small overshoot at the boundary (documented); the race S2 asserts the cap is never exceeded by more than one average task.
- Pause/resume helpers from T1.2 (`pauseReason` MANUAL | QUOTA_CAP | TEAM_QUOTA).
- Notifications via `notify.ts#shouldNotify` (T2.11) → `AppNotification` + push to commanders/owner.

## Deliverables (`quota.ts` additions + `employees.ts` hunk)
- `checkEmployeeCap(employee, subscription) → ok | "employee_quota_cap"` used by `canRunAi`; when exceeded and `pauseReason` null → set `pauseReason = QUOTA_CAP` (status stays ACTIVE; `liveStatus` = PAUSED with reason) + notify once per cycle (marker in `AiEmployee.cycleKey`-scoped notification log: use `AiActionLog`? no — `AiNotifyPref`? no → a tiny table is not allowed; use `AppNotification` dedupe by `title+recipient+day` query before insert, documented) + audit `ai.employee.quota_cap`.
- `updateEmployee` raising `quotaCapPct` or `ensureCycle` reset clears `QUOTA_CAP` (single `updateMany where pauseReason = 'QUOTA_CAP'`).
- `service.ts` refusal path returns `{ ok:false, error:"over_budget", scope:"credit" }` + Thai `team.refusal.employee_quota_cap`.
- Scheduled runs skip paused employees (T1.8 already checks ACTIVE; add `pauseReason` check).

## Acceptance (oracle `qc-ai-t3.2`)
S1 cap 10 % → paused after N charges; other employee continues · S2 X3 boundary race overshoot ≤ 1 avg task · S3 raise cap / cycle reset resumes · S4 one notification per cycle (X4) · S5 audit · S6 DTO liveStatus/pauseReason. Regressions T3.1, `qc-ai-t1.2`.

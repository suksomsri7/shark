# C0.5 — Minute-job dispatcher (decision C16)
Read `crm-brief-COMMON.md` first.

## Facts
`vercel.json` has exactly two crons (`/api/cron/tick` daily 03:00 BKK, `/api/cron/hourly`) and the code says not to add entries. `/api/cron/outbox` exists and is triggered externally; FIRST find out how often and by what (grep the repo + `docs/` + `ledger/RESUME.md` for the scheduler; if the cadence is not ≤ 1 minute, report it to the controller — the owner must fix the external scheduler, do not invent a new one). Auth: `isCronAuthorized(req)` in `src/lib/core/cron-auth.ts` (Bearer `SHARK_CRON_SECRET` or `X-Cron-Secret`). Daily sweeps live in `src/lib/platform/cron.ts` (`runDailyCron`), hourly in the hourly route — each sweep is best-effort and must not redden the run.

## Deliverables
- NEW `src/lib/platform/minute-jobs.ts`: registry `registerMinuteJob({ name, everyMinutes, run(now, budgetMs) })`, `runMinuteJobs(now)`: for each due job take a DB lease (reuse the `ChatRateBucket`-style atomic upsert or an advisory lock — no new table unless unavoidable; if unavoidable report for C1.1), run with a time budget (total ≤ 20 s), catch per job, record last run/ok/error in `AppSystem`-independent storage readable by a later integrations page (an `OpsEvent` INFO row per failure is enough + an in-DB "last run" map in a small JSON row you justify).
- Call `runMinuteJobs` from `/api/cron/outbox` AFTER `drainUntilQuiet`, inside try/catch so a job failure never changes the outbox route's result.
- No real jobs yet; register one no-op job `crm.heartbeat` (every 5 min) so the oracle has something to drive.

## Files you own
`src/lib/platform/minute-jobs.ts` (new) · the call site in `src/app/api/cron/outbox/route.ts` · nothing else.

## Acceptance (oracle `qc-crm-c0.5`)
S1 a due job runs, a not-due job does not · S2 job that throws → other jobs still run, route result unchanged, failure recorded · S3 budget respected (slow fake job is cut off / skipped next) · X5: two overlapping `runMinuteJobs` calls run each due job exactly once; simulated crash after lease → job runs again after the lease expires.
⚠️ See RESOLUTIONS R-C.6: the outbox route's trigger cadence is unknown and it is not in the VPS crontab — ALSO deliver `scripts/crm-cron.mts minute|hourly|daily` (pattern: `scripts/acc-v2-cron-recurring.mts`); production crontab installation is a C6.1 step with the owner's OK.
Regressions: `qc-cron`, `qc-webhook`, `qc-automation`, `qc-member-m3.3`, `qc-member-fix-s3`.

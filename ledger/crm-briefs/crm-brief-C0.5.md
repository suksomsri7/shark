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

## Controller addendum 2026-09-18 — ผลสืบว่า `/api/cron/outbox` ถูกยิงด้วยอะไร (ใบสั่งสั่งให้สืบก่อน)
สืบครบทุกทางแล้ว ผลชัดเจนและ **ยืนยันมติ R-C.6 พร้อมทำให้แม่นขึ้น**:

| ที่ตรวจ | ผล |
|---|---|
| `vercel.json` | มี cron 2 ตัวเท่านั้น: `/api/cron/tick` (`0 20 * * *` = 03:00 น. เวลาไทย **วันละครั้ง**) และ `/api/cron/hourly` (`0 * * * *`) |
| crontab ของ VPS (`crontab -l`) | **ไม่มีบรรทัดไหนยิง `/api/cron/outbox` เลย** · ที่มีคือ `voice-transcode-worker.mts` ทุกนาที (จาก worktree `shark-in-th`) และงานบัญชีรายวัน 4 ตัว |
| systemd timers | ไม่มีตัวที่เกี่ยวข้อง |
| `/api/cron/hourly` | **ไม่ได้ drain outbox** (รัน `runScheduledTasks` + กวาดของบอร์ดงาน/แคมเปญ/แจ้งเตือน) |
| `runDailyCron` (`src/lib/platform/cron.ts:336`) | เป็นที่**เดียว**ในฝั่ง cron ที่เรียก `drainAll()` — และถูกเรียกจาก `/api/cron/tick` คือ **วันละครั้ง** |
| ทำไม prod ถึง `outboxPending: 0` | เพราะเส้นทางปกติ **drain ในคำขอเดียวกับที่สร้าง event** (`scheduleDrain` ที่โมดูลต่าง ๆ เรียกหลัง mutation → `drainOutbox` ใน `src/lib/core/outbox.ts:135`) ไม่ใช่เพราะมี cron รายนาที |

**สรุปข้อเท็จจริงที่ใบนี้ต้องยึด**
1. `/api/cron/outbox` เป็น POST ที่ **ไม่มีตัวตั้งเวลาใดชี้มาเลย** — มติ C16 ฉบับแรก ("ขี่ outbox ที่ถูกยิงทุกนาที") ตั้งอยู่บนข้อสมมติที่**ไม่จริง** · R-C.6 แก้ไว้ถูกแล้ว
2. คิว outbox ถูกระบายทันทีแบบ inline หลังการกระทำ ⇒ งานที่ "มีคนกดแล้วต้องทำต่อ" ไม่มีปัญหา
3. 🔴 **แต่ไม่มีอะไรในระบบเดินทุกนาทีเพื่องานที่ต้องเกิด "ตามเวลา" โดยไม่มีใครกดอะไรเลย** (ส่งขั้น sequence อีก 2 วัน · อีเมลตั้งเวลา · เตือนนัด · ดีลนิ่ง) — ตาข่ายที่ใกล้ที่สุดคือ `drainAll()` วันละครั้ง ⇒ งานตามเวลาอาจช้าได้ถึง 24 ชม.
⇒ ดังนั้น **`scripts/crm-cron.mts` ไม่ใช่ของแถม แต่เป็นทางเดินจริงเพียงทางเดียว** ของงานรายนาทีทั้งเฟส C2 · hook ใน route outbox คงไว้เป็นของแถมที่ไม่เสียหาย ตามที่ใบสั่งเขียน
⇒ แบบของ crontab ที่จะติดตั้งจริงในใบ C6.1 ให้ลอกบรรทัด `voice-transcode-worker` ที่ทำงานอยู่จริงทุกนาที (มี `flock -n` กันรันซ้อน · `cd` เข้า worktree · เขียน log แยก) — ห้ามคิดรูปแบบใหม่

**สิ่งที่ต้องบอกเจ้าของ (ผู้คุมงานจะสรุปให้ตอนปิดใบ)**: ก่อนติดตั้ง crontab ของ CRM (ใบ C6.1) งานตามเวลาของ CRM จะไม่เดินบน production เลย — นี่ไม่ใช่ข้อบกพร่องของใบนี้ แต่เป็นลำดับที่แผนวางไว้

### Controller decisions on the oracle's questions (2026-09-18) — these bind the builder
1. **State storage = `OpsAlertState` rows**, one row per concern, keyed `minute-job:lease:<name>`, `minute-job:run:<name>`,
   `minute-job:ok:<name>`; failure text goes to `OpsEvent` (`source "minute-job"`). No new table (C0.5 is before the
   only migration work order), no shared JSON map (lost-update risk), not `ChatRateBucket` (chat module's table).
   The claim is ONE statement: `INSERT … ON CONFLICT (source) DO UPDATE … WHERE "lastAlertAt" <= $now RETURNING`, then
   re-check the job is still due. Keep every key prefixed `minute-job:` so it can never collide with `logOps`'s own
   alert-throttling rows in the same table.
   - ⚠️ Why not an advisory lock here, when C0.3 used one: C0.3 uses `pg_advisory_xact_lock` — **transaction-scoped**,
     which is safe through the transaction-mode pooler because it lives and dies inside one transaction on one
     connection. A minute job must hold its claim ACROSS a long-running job, i.e. across transactions, which a
     transaction-scoped lock cannot do and a session-scoped one cannot do reliably through the pooler. So: row lease
     here, xact lock there. Nobody should "unify" them.
2. **Contracts K1–K4 accepted:**
   - K1 — the `now` argument is the ONLY clock, for both due-ness and lease expiry. Using the database `NOW()` for the
     lease is wrong here (it makes crash recovery untestable and couples the dispatcher to server time).
   - K2 — reader `getMinuteJobStatus(names?)` returning `{ name, everyMinutes, lastRunAt, lastOkAt, lastError }` per job;
     `lastRunAt` = last FINISHED attempt. The integrations page (C3.6) reads this.
   - K3 — the `/api/cron/outbox` response body carries NO minute-job summary; its result must be byte-identical to today.
   - K4 — lease ≤ 15 minutes (MASTER-PLAN §4 X5).
3. The real drain call in the route is `drainAll()` (`drainUntilQuiet` is private to `src/lib/core/outbox.ts`).
   Call `runMinuteJobs` after `drainAll()`, in its OWN try/catch that does not also wrap `drainAll`.
4. **`crm-cron.mts hourly|daily` run CRM-registered jobs of that cadence only — never `runDailyCron`**, which
   `/api/cron/tick` already runs daily; calling it again would double-run every platform sweep. Today no hourly/daily
   CRM job exists, so both modes must succeed as clean no-ops (exit 0). C2.10 registers the purge jobs later.
5. **Job failures log at WARN**, not ERROR. ERROR e-mails `OPS_ALERT_EMAIL` and a flapping job would spam the owner;
   the integrations page (C3.6) is where job health is surfaced. A job that wants to page someone does it itself.

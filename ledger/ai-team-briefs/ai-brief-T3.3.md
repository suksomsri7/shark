# T3.3 — Quota exhausted: team pause · pending work · monthly reset job (Opus · server lane) 🎯 hunter (cron/replay)
Read `ai-brief-COMMON.md` + RESOLUTIONS R-A2 (PAUSE only), R-E C12 first. Contract: AI-TEAM-RUN §2 T3.3. Mockups D4 (quota exhausted), C1 ("ถ้าโควตาหมดก่อนรอบใหม่: พักทีมจนรอบใหม่"), C7 (quota warnings 80/95).

## Verified facts
- T3.1 `ensureCycle`, `quotaSnapshot.state`, `canRunAi` reasons; T1.8 `runScheduledTasks` claim/lease + `skippedForQuotaAt`; T1.1 `AiSettings.teamPausedUntil`; `AiTask.status` has no WAITING_QUOTA value → represent "waiting for quota" as `AiTask` OPEN + a system message in the room + `AiEmployee.pauseReason = TEAM_QUOTA` on every employee of the bound tenants (single `updateMany`).
- Cron entry points: `src/app/api/cron/hourly/route.ts` (`isCronAuthorized`), `src/lib/platform/cron.ts` sweeps (`:349/:397/:403`). The VPS runs `scripts/*-cron.mts` style runners for CRM (RESOLUTIONS of CRM R-C.6) — `scripts/ai-team-cron.mts` (T1.9) gains `--job=reset` and `--job=quota-warn`; installing the crontab is T6.1 (owner approval). Also hook `resetCycles` into `/api/cron/hourly` (cheap, idempotent) so Vercel cron covers it if the VPS runner is absent.
- Lease: `pg_try_advisory_lock(hashtext('ai-team-reset'))` within the job; per-subscription idempotency = `lastResetKey`.

## Deliverables (`quota.ts` + `scripts/ai-team-cron.mts` + `scheduled.ts` hunk)
- `onExhausted(subscriptionId)` (called from `chargeToPack` when `usedMicro` reaches `allowanceMicro`, inside the tx): `AiSettings.teamPausedUntil = cycleEnd` for every bound tenant; `AiEmployee.pauseReason = TEAM_QUOTA` where ACTIVE & pauseReason null; notification `team.quota.exhausted` to owners + commanders (once per cycle; dedupe by `AiSubscription.lastResetKey`-scoped marker: store `warnedPcts Json` on `AiSubscription`? **not in T1.1** → add column in `_ai_team_b` (this WO owns the migration if needed: `AiSubscription.warnedJson Json?`) — reviewer confirms additive).
- `resetCycles(now)` (job): for every subscription with `cycleEnd ≤ now` → `ensureCycle` → clear `teamPausedUntil`, `pauseReason IN (TEAM_QUOTA, QUOTA_CAP)` → for tasks with a pending system marker "รอโควตา" post "ทำต่อได้แล้ว" + notify the starter (no auto-send); scheduled rows with `skippedForQuotaAt` in the previous cycle run once at the next due slot (the runner treats `skippedForQuotaAt != null` as due now, then clears it).
- `warnQuota(now)` (job + inline check after each charge): at pct ≥ 80 and ≥ 95 send `team.quota.warn80/95` once per cycle (X4; `warnedJson`).
- `runScheduledTasks`: if `canRunAi` false → set `skippedForQuotaAt`, release claim, no charge.
- Chat path: `service.ts` refusal when exhausted returns the Thai text with the reset date (`cycleEnd` BKK).
- WALLET/ASK overflow stays behind `AI_TEAM_SALES_ENABLED`; oracle proves the flag is off and the wallet is never decremented.

## Files you own
`src/lib/ai/team/quota.ts`, `scripts/ai-team-cron.mts`, hunks: `src/lib/ai/scheduled.ts`, `src/app/api/cron/hourly/route.ts`, `prisma/schema/ai_team.prisma` + migration `_ai_team_b` (only `AiSubscription.warnedJson`, if approved by the controller in the addendum), `notify.ts` usage.

## Acceptance (oracle `qc-ai-t3.3`)
S1 exhaustion pauses AT-1 and AT-2, not AT-X · S2 scheduled skip without charge · S3 X5 reset job overlap/idempotent/lease-crash · S4 post-reset state + skipped schedule runs once + room notice · S5 warnings once per cycle incl. overlapping jobs · S6 wallet untouched with flag off · S7 i18n static · S8 X8 notifications without micro/baht. Regressions T3.1 T3.2 `qc-ai-schedule` `qc-push`.

## Controller rulings
- "Pending work continues automatically" means: scheduled tasks yes (once), chat rooms no (the human re-sends; we only notify) — avoids spending the new allowance without a human.
- Hunter lens: double reset across hourly cron + VPS runner; replay of exhaustion notifications; pause flags left behind on tenants that change owner.

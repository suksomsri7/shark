# C2.10 — Stale deals, staff notifications, the CRM job set
Read `crm-brief-COMMON.md` first. Contract: CRM-RUN §2 "C2.10". Spec: blueprint §7.4, §7.5, mockup 01 ("deals to watch"), decisions C16, C22.

## Facts
Staff notification pattern to copy: `src/lib/modules/kanban/notify.ts` (`AppNotification` with `recipientUserId`, e-mail fan-out, hourly digest `sweepKanbanEmailHourly`); staff push `src/lib/core/push.ts` (`sendPushToUser(s)`). There is NO LINE-to-staff channel and NO staff quiet hours today (member-side quiet-hours logic lives in `src/lib/modules/member/notifications.ts` — lift the pure functions into a shared helper, do not copy). Crons: daily `runDailyCron` (`src/lib/platform/cron.ts`), hourly route, minute jobs (C0.5). No new `vercel.json` entries.

## Deliverables
- `deals.markStale` (daily 06:00 BKK via tick; per-stage `staleDays` or default; emits `crm.deal.stale` once until activity clears it) + daily digest (one message per recipient, not per deal).
- `crm-outbound.ts`: 10 notification templates × channels **in-app, push, e-mail** (LINE-to-staff is OUT of this run — owner decision Q3); shop-level settings page `/settings/notifications` + **per-user preferences** (`CrmUserPref`: per event × channel on/off, own quiet hours) ; quiet hours defer (not drop); never notify a user about a record they cannot see.
- Register every CRM job: minute (sequences, scheduled e-mail, reminders), hourly (overdue), daily (stale, score decay, close-due, record-field-due, company cache, web/e-mail purge, scheduled reports hook) — each claimed by lease, each best-effort.
Events `crm.deal.stale`, `crm.activity.overdue`.

## Acceptance (oracle `qc-crm-c2.10`)
CRM-RUN S1–S5 (18).
X5 every job: overlapping runs → once; crash after claim → retried after lease · X4 notification dedupe per (user, event, ref) under redelivery · X1 recipient filtering by visibility · X8 notification bodies carry no phone/e-mail; push payload minimal.
Regressions: `qc-kanban-notify`, `qc-push`, `qc-cron`, `qc-member-m3.6`, `qc-member-fix-s3`, C0.5.

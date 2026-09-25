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

## Addendum (oracle author) — 24 ก.ย. 2569 · `scripts/qc-crm-c2.10.mts` (40 ข้อ)

Every item is a **naming/shape decision the oracle had to invent**; each is in the CONTRACT block at the head of
`scripts/qc-crm-c2.10.mts` and is what the checks assert. **oracle-proposed — controller to confirm** (a different ruling ⇒
ORACLE-EDIT the named checks before the builder starts).

1. **No migration, no new column, no new permission key** (R-C.1): `CrmUserPref` (C2.0) is the only new storage, shop settings live in
   `settings.crm.notifications` through the C1.5 writer, and the gate for shop-level settings is the existing **`crm.settings.manage`**
   (a user's own prefs need no key). *oracle-proposed.*
2. 🔴 **There is no `staleAt` column — the outbox key IS the flag.** `markStale` emits `crm.deal.stale` with the key
   `crm.deal.stale#<days>#<dealId>#<(lastActivityAt ?? stageEnteredAt).toISOString()>`, which is **exactly** the key C2.1's daily
   catch-up poller builds (`automation.ts:1463`). Three things fall out of that one decision: (a) "emit once per quiet spell" is free
   (`emitOutbox` dedupes on (tenantId, idempotencyKey)), (b) an activity that moves `lastActivityAt` starts a NEW spell that may be
   announced again, (c) **C2.1 and C2.10 can never make the same rule run twice** (`insertMainRun` dedupes on (ruleId, eventKey)) —
   `C2.10-S1.2` and `C2.10-S1.4` assert exactly this. *oracle-proposed — controller to confirm.*
3. **Staleness rule**: kind OPEN · archivedAt null · `(lastActivityAt ?? stageEnteredAt) ≤ now − staleDays`, where `staleDays` =
   `CrmStage.staleDays` else `settings.crm.staleDaysDefault` (**default 14**). WON/LOST/archived deals are never stale (S1.1/S1.3).
   *oracle-proposed (the 14 is invented — the blueprint gives per-stage numbers only).*
4. **`crm.deals.markStale(opts?: { now?, tenantIds?, systemIds?, deps?, deadline?, signal? })` → `{ marked, digests, cutOff }`**, in
   `crm/deals.ts` inside a `// CRM C2.10 ▸` block, uiVersion-2 systems only (filtered in SQL), `tenantIds`/`systemIds` honoured (X1.2
   has a control deal in another system — a sweep that ignores the filter would eat other suites' rows on the shared QC DB).
   *oracle-proposed.*
5. **The digest is one message per recipient per Thai day**, template `deal.stale.digest`, vars `{ count, systemId }`, recipients =
   each stale deal's owner + the LEAD of its team, filtered by what that user may see (S1.5 · S2.1 · S2.2). *oracle-proposed.*
6. **The notifier lives in `src/lib/modules/crm/notifications.ts`** (+ pure `notifications-shared.ts`), NOT in `crm-outbound.ts`
   (C1.8's file keeps its one in-app helper and may delegate). Entries: `notifyStaff` · `runFanout` · `getNotificationSettings` ·
   `setTemplate` · `setNotificationSettings` · `getMyPrefs` · `setMyPrefs`, all reachable as `crm.notifications.*`. *oracle-proposed.*
7. **The 10 template keys** (blueprint §7.4 → keys): `lead.assigned` · `customer.replied` · `deal.stale.digest` · `tasks.today` ·
   `activity.reminder` · `lead.hot` · `deal.closed` · `commission.status` · `quota.progress` · `invoice.paid`; each with a Thai
   label/title/body ({{vars}}) and per-channel defaults. **Channels are exactly IN_APP · PUSH · EMAIL** — LINE-to-staff is out (brief
   + owner Q3), and R-E.12 is applied when translating the blueprint defaults: every "LINE ทันที" becomes PUSH, every "LINE รายวัน
   (สรุป)" becomes the e-mail digest + in-app (S0.2 · S3.1). *oracle-proposed — controller to confirm the key spelling.*
8. **Effective channel = shop default ∧ user override, and the USER wins when he has one** — including switching a channel back ON
   that the shop switched off (S3.3). *oracle-proposed (the alternative "shop wins" would make per-user prefs half-useless).*
9. 🔴 **Quiet hours DEFER through the `emailedAt` stamp** (no new table): the in-app row is written immediately (a passive inbox is
   never quiet-hour-blocked), push/e-mail are skipped while the recipient is inside the window, and the hourly `runFanout` sweeps rows
   with `emailedAt = null` + the CRM deep-link marker after the window and stamps them — the `sweepKanbanEmailHourly` pattern, so
   overlapping sweeps send exactly once (S3.4 · X5.2). **The deep link `/app/sys/<systemId>/crm/…` in the body is therefore load-bearing:
   it is both the user's link and the sweep's selector.** *oracle-proposed — controller to confirm.*
10. **A user's own quiet window beats the shop's** (S3.5) and the window is evaluated in Thai time only, through the shared helper.
    *oracle-proposed.*
11. 🔴 **`src/lib/core/quiet-hours.ts` is NEW and the member module is EDITED**: `inQuietWindow` / `nextQuietEnd` / `parseHM` are
    **lifted** out of `member/notifications.ts` (its private copies deleted, importing the shared file inside a `// CRM C2.10 ▸` block)
    — the brief's "lift, do not copy" + the COMMON "no second engine" rule. `C2.10-S0.3` fails if a private copy survives, so
    `qc-member-m3.6` / `qc-member-fix-s3` are mandatory regressions. *oracle-proposed — controller to confirm the file path and that
    C2.10 may touch a member file.*
12. **`CrmNotifyDeps = { push?, email? }`** injected per call (the C2.2 `SequenceDeps` pattern); tests never reach a real transport and
    `C2.10-X8.2` fails if `notifications.ts` imports one itself. Requests carry ids only, and an oversized push payload (> 600 bytes)
    fails the same check. *oracle-proposed.*
13. **Dedupe of a notification = (recipientUserId, key, refType, refId, Thai day)** (X4.2) — `AppNotification` has no key column, so the
    check is a `findFirst` under an advisory lock before the insert (the `approvalNotify`/`crm-outbound` pattern). *oracle-proposed.*
14. **Recipients are filtered, never trusted** (S3.6 · X1.1): a user who cannot see the record under `visibleWhere`, who holds no CRM
    read key, or whose membership is gone is silently dropped from the list. *oracle-proposed.*
15. **The 8 jobs C2.10 registers** in `platform/minute-jobs.ts` (block `// CRM C2.10 ▸`): `crm.deals.stale` (daily) ·
    `crm.notify.fanout` (hourly) · `crm.activities.overdue` (hourly, emits `crm.activity.overdue` once per overdue task) ·
    `crm.activities.reminders` (every 5 min) · `crm.companies.cache` (daily) · `crm.purge.web` (daily) · `crm.purge.email` (daily) ·
    `crm.reports.scheduled` (daily). **close-due and record-field-due get NO job of their own** — C2.1's `crm.automation.cron` already
    covers both cron triggers (blueprint §7.5 lists them separately; duplicating them would double-fire the rules). The jobs of C2.1 /
    C2.2 / C2.5 / C2.8 must still be registered (S4.1 lists any that are missing). *oracle-proposed — controller to confirm.*
16. **The blueprint's clock times (06:00 / 03:00 / 04:00 / 02:00 / 07:00 BKK) are NOT expressible** by the C0.5 dispatcher (aligned
    windows from Thai midnight, no hour-of-day). Same knowing deviation as C2.8's `crm.scoring.decay`: cadence "daily", the hour is a
    C6.1 crontab matter. Recorded, not implemented. *oracle-proposed — controller to confirm.*
17. **R-C.6 is re-asserted after adding 8 jobs** (S4.3, already green in the live run): no `/api/cron/crm/*` route, no new `vercel.json`
    entry, and the CRM jobs are not bolted into `/api/cron/tick` or `/api/cron/hourly`.
18. **The cron endpoints are never called authorised** by this oracle (that would run the whole platform's daily sweep on the shared QC
    database). X7.1 proves the three unauthorised shapes (no header · wrong `X-Cron-Secret` · wrong `Bearer`) give **byte-identical**
    401s that never echo the secret and that nothing ran; X7.2 is the positive control on `isCronAuthorized` with an in-process
    `CRON_SECRET` that is restored afterwards. **There is no rate limit on the cron routes today and C2.10 does not add one** (the
    secret is the gate; `checkRateLimitDb` belongs to the public lanes of C2.5/C2.6/C3.5) — recorded as a deliberate scope call.
    *oracle-proposed — controller to confirm (the kickoff note asked for a rate-limit check).*
19. **Validation** (X9.2): unknown template key · a channel outside the three · a quiet-hour value that is not `HH:MM` · a digest hour
    outside 0–23 ⇒ Thai VALIDATION, nothing written. **Audit**: `crm.notify.template` / `crm.notify.settings` / `crm.notify.prefs`
    (≥ 3 rows, no customer data) — X9.1. *oracle-proposed.*
20. **UI**: `/crm/settings/notifications` (shop tab + per-user tab) with nav key `settings-notifications`, testids
    `crm-notify-template-row-*` · `crm-notify-channel-*` · `crm-notify-quiet-from` · `crm-notify-quiet-to` · `crm-notify-save`
    (≥ 8 inventory rows, wo "C2.10") · mockup 01: the C1.11 home page grows the "ดีลที่ต้องดู" block with
    `crm-home-stale-list` / `crm-home-stale-row-*`. Pixel parity stays gate D7 (the controller opens the shots). *oracle-proposed.*
21. **Oracle-side conventions**: the synthetic clock is 2026-09-10 11:00 Thai (`NOW`), 22:00 Thai (`NIGHT`) and 08:30 Thai next day
    (`MORNING`) — so `now` must be THE clock for staleness, quiet hours and the digest day · the shared dispatcher state rows
    (`OpsAlertState minute-job:*` of the 8 jobs) are snapshotted and restored, and CLEAN verifies the count · the daily job is exercised
    by invoking the REGISTERED closure directly (not by ticking the whole daily cadence, which would run C2.1's cron triggers over the
    shared DB).

### Regressions the controller runs with this file
`qc-kanban-notify` · `qc-push` · `qc-cron` · **`qc-member-m3.6`** and **`qc-member-fix-s3`** (the quiet-hour helpers move out of
`member/notifications.ts` — decision 11) · `qc-crm-c0.5` (dispatcher + outbox route + the "no /api/cron/crm" rule) ·
**`qc-crm-c2.1`** (the `crm.deal.stale{days}` / `crm.activity.overdue` cron triggers + S9.1 catalogue: the two labels must not duplicate
the cron entries) · `qc-crm-c2.2` · `qc-crm-c2.8` (their jobs stay registered) · `qc-crm-c1.5` (deals) · `qc-crm-c1.6` (activities) ·
`qc-crm-c1.7` (visibility) · `qc-crm-c1.11` (home page + uiVersion) · `qc-crm-v1` · `qc-nav-functions` (the new page) ·
`pnpm fitness` both modes (F13.x registries · F14.1/F14.2 testids) · `qc-member-m1.9` (30/15/10/5 — untouched).

## Controller ruling (24 ก.ย. 2569 · Fable 5.1 · binding — เคาะ addendum 1–21 ก่อน spawn builder)
- **CONFIRMED ทั้ง 21 ข้อ**: ไม่มี `staleAt` — คีย์ outbox `crm.deal.stale#<days>#<dealId>#<spellStart>` คือธง (= คีย์ poller ของ C2.1 ⇒ ไม่ยิงซ้ำกัน · `S1.4`) · **C2.10 แตะ `member/notifications.ts` ได้** เฉพาะการย้าย `inQuietWindow`/`nextQuietEnd` ไป `src/lib/core/quiet-hours.ts` (lift ไม่ copy · `qc-member-m3.6`/`fix-s3` บังคับ) · เลื่อนตาม quiet hours ผ่านตรา `emailedAt` + sweep รายชั่วโมง `crm.notify.fanout` (deep link ในเนื้อหาเป็นตัวเลือกของ sweep — ห้ามใครลบ) · เทมเพลต 10 คีย์ · ช่องทาง IN_APP/PUSH/EMAIL (ไม่มี LINE ถึงพนักงาน R-E.12) · override ของผู้ใช้ชนะร้าน · งาน 8 ตัว (close-due/record-field-due ใช้ `crm.automation.cron` ของ C2.1 ไม่ซ้ำ) · เวลา 03:00 ไทยเบี่ยงเป็น everyMinutes 1440 (C0.5) · **ไม่ใส่ rate limit บน cron routes** (secret คือประตู) · `settings.crm.staleDaysDefault 14` · คีย์ `crm.settings.manage` · dedupe ต่อ (user, template, refType, refId, วันไทย) · `CrmNotifyDeps` · nav `settings-notifications` · testid หน้าแรก `crm-home-stale-list`/`crm-home-stale-row-*`
- ถอยหลังบังคับ: `qc-member-m3.6` · `qc-member-fix-s3` · `qc-crm-c2.1` · `qc-crm-c0.5` · `qc-crm-c1.5` (ดีล) · `qc-crm-c1.6` · `qc-crm-c2.4` (reminders) · **`qc-crm-c1.11`**

## มติผู้คุมงานรอบแก้ (Fable · 25 ก.ย. 09:20 · หลัง reviewer อิสระ)
1. **A1 ยิงซ้ำ live ↔ cron เมื่อ `days` ของกฎ ≠ `staleDays` ของ stage** — เพิ่ม `"days"` เข้า `TRIGGER_MATCH_KEYS` ของ C2.1 (`automation.ts`): event สด `days:7` ตรงเฉพาะกฎ `days:7` · กฎ `days:14` รอ cron วันที่ 14 (คีย์ `#14#…`) · กฎ `days:7` เจอทั้งสองทางด้วยคีย์เดียวกัน ⇒ dedupe ด้วย AutomationRun เดิม · ห้ามตัด cron branch (สัญญา C2.1 `crm.deal.stale{days}` คงอยู่) · probe ต้องพิสูจน์: stage 7 + กฎ 14 → วันที่ 7 ไม่ยิง · วันที่ 14 ยิง 1 · วันที่ 15 ไม่ยิงซ้ำ · กฎ 7 → ยิง 1 ครั้งรวมสองทาง
2. **A2** งบเนื้อหา = `BODY_MAX - link.length - 3` (ลิงก์ `?n=&nd=` ห้ามถูกตัดทุกกรณี) + probe body ยาว 400
3. **B1** แถว IN_APP ปิด+quiet (readAt=now) ยังโผล่ในรายการ (`listNotifications` ไม่กรอง readAt) — **รับเป็นข้อจำกัด** จดใน wo-notes + candidate C3.0: คอลัมน์ `dedupeKey`/`deferredUntil`/`channels` บน AppNotification (additive)
4. **B2** ทางส่งทันที: ห้ามประทับ `emailedAt` ก่อนส่ง — ประทับ**หลัง**ส่งสำเร็จ (หรือล้มถาวร) เพื่อให้ sweep รายชั่วโมงเก็บของที่ส่งไม่สำเร็จชั่วคราว (ภายใน lookback 36 ชม.)
5. **B3** ลิงก์กันซ้ำต้องมี refId ทุก refType — เติม `&r=<refId>` ในลิงก์เสมอ (parse/ค้นหาใช้ทั้ง 5 ส่วน)
6. **B4** `purgeWeb`/`purgeBodies` กรอง `uiVersion = 2` ใน SQL (แบบ sweep ใหม่ทั้งสาม) + เคารพ `ctrl.deadline/signal`
7. **B5** `recomputeCachesSweep` — เรียงเก่าก่อน (`cacheUpdatedAt asc nulls first`) ให้ cap 2000 หมุนครบทุกร้าน (ไม่ต้อง cursor ถาวร)
8. MINOR แก้: (1) ข้อความ markdown `**…**` ใน CrmNotificationsManager · (2) `digests` นับผู้รับที่ได้ช่องทางใดก็ได้ · (4) `markStale` ใส่ `pg_advisory_xact_lock` แบบ `overdueSweep` · รับ: (3) cap 1000 ในสรุป (บอก "1000+") · (5) lookback 36 ชม. (จด) · (6) เทมเพลตที่ยังไม่มีตัวยิง = ใบหลัง (จด) · (7)(8)(9)
9. **PARITY mockup 01 "ดีลที่ต้องดู"** (`ledger/design-crm/01-crm-home.body.html` บรรทัด 77–85): ปุ่ม "ดู" ท้ายแถว · ป้าย 3 สถานะ (แดง = นิ่ง ≥ 2×staleDays · เหลือง = เกินเกณฑ์แต่ < 2× · เทา) · บรรทัดรอง = บริษัท · ฿มูลค่า (ตัดชื่อ stage) · ไอคอน ⚠ ที่หัว · แสดง 4 แถว + "ดูทั้งหมด" (`HOME_STALE_MAX = 4`) · KPI tile "ดีลนิ่ง" = C1.11 ไม่ใช่ใบนี้


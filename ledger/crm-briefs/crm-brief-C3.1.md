# C3.1 — Reports (8 tabs) + export + schedule
Read `crm-brief-COMMON.md` first. Contract: CRM-RUN §2 "C3.1". Spec: blueprint §5.9 reports, mockup 09.

Deliverables: `reports.ts` overview · forecast (month × category, per owner/team, vs quota placeholder) · funnel from `CrmDealStageHistory` · reps · activities · lost reasons · sources/ROI (`sourceDetail.campaignId`, link/form ids; campaign cost if available) · scores — every number aggregated IN THE DATABASE (`groupBy`/`count`/`aggregate`/raw SQL); no `findMany` without `take` (member audit M13); every tab filtered by `visibleWhere` + `crm.report.view|team|all`; CSV export through `csvRow` (BOM from the response layer) as an async job for large sets; schedule (daily/weekly/monthly e-mail to staff addresses) run by the daily/hourly cron with LEASE; UI 8 tabs + filters.
Acceptance (oracle `qc-crm-c3.1`): CRM-RUN (26) — each tab equals an independent SQL computed in the oracle on the seed.
X1 thana's numbers = only his visibility; team lead = team; OWNER = all; a STAFF without `crm.report.view` gets 404 · X6 CSV neutralised (seed a deal titled `=HYPERLINK(...)`) · X5 scheduled report: overlapping cron → one e-mail · X8 exports exclude sensitive member fields; recipients restricted to staff of the tenant · query-count guard: overview ≤ 12 queries on the seed (spy on prisma).
Regressions: `qc-member-m3.8`, `qc-member-fix-s4`.

## Addendum (oracle author) — 26 ก.ย. 2569 · `scripts/qc-crm-c3.1.mts` (56 ข้อ)

The brief, CRM-RUN §2 and blueprint §5.9 name the eight tabs, "export" and "schedule" but not their exact keys, shapes, periods or
claim rules. The oracle had to encode them. Everything below is **oracle-proposed — controller to confirm**; a different ruling ⇒
ORACLE-EDIT the named check before the builder starts. Names follow the existing services (`deals.forecast`, `FORECAST_NONE_KEY`,
`CrmV2DisabledError`, `setCrmSettingsKey`, `CrmImportJob`, the C0.5 registry) — nothing in REVIEW-CRM-DESIGN §3 renames a report API.

1. **Files & surface.** `src/lib/modules/crm/reports.ts` + pure `reports-shared.ts`; facade `export * as reports from "./reports"` in a
   `// CRM C3.1 ▸ … ◂` block (S0.1). Functions: `overview · forecast · funnel · reps · activities · lostReasons · sources · scores`
   (blueprint names; `export` is a reserved word ⇒ **`startExport · runExportJobs · getExport`**; blueprint `schedule(...)` ⇒
   **`listSchedules · saveSchedule · deleteSchedule · runScheduled`**) + **`getReport(ctx, actor, tab, filters)`** = the one dispatcher
   C3.4's `crm_reports` tool and the export reuse (S6.5). Signature `(ctx {tenantId, systemId, actorUserId}, actor, filters)`.
2. **Tab keys** (`REPORT_TABS`, mockup order = blueprint §2.2 URLs): `overview · forecast · funnel · reps · activities · lost · sources ·
   scores` + Thai `REPORT_TAB_LABEL` · `REPORT_SCHEDULE_FREQUENCIES = DAILY · WEEKLY · MONTHLY` (S0.2). The lost tab key is `lost`, its
   function `lostReasons` (the facade namespace `crm.lostReasons` stays the settings service — different namespace, no clash).
3. **Filters** `ReportFilters = { from?, to? ("YYYY-MM-DD", Thai days, inclusive: [from 00:00 +07, to+1 00:00 +07)); teamId?;
   pipelineId?; ownerUserId? }`. Ids must belong to the tenant + CRM system (else VALIDATION/NOT_FOUND — a pipeline of another CRM
   system of the same shop is refused, X6.2); impossible date / non-date / from > to ⇒ VALIDATION. **A filter never widens the
   actor's scope** (thana + team กระบี่ = 0, S2.4). Team filter: deals/contacts by `teamId`, activities by the team's members. The
   **pipeline filter binds only deal-derived numbers** (deals, payments, stage history, commissions); leads/activities/scores ignore it.
   UI query params: `?from=&to=&team=&pipeline=` on `/crm/reports/[tab]`.
4. **Report scope (X1)** = `widest(visibility.resolve(actor, "REPORT"), crm.report.team ⇒ TEAM, crm.report.all ⇒ ALL)`, gate
   `crm.report.view` (FORBIDDEN in the service, 404 on the page). OWNER ALL · MANAGER ALL (branch-limited like `visibleWhere` ALL) ·
   team LEAD ≥ TEAM · STAFF default **OWN** (§6.2 "ของตัวเอง", X1.5) — **but the QC seed carries the backfilled policy STAFF → TEAM
   for REPORT**, so on the seed thana = ทีมภูเก็ต (incl. the lead manager's leads/tasks) and kata = ทีมกระบี่ (X1.1/X1.3 read the level
   from the live policies, not from a constant). The level is applied per entity with visibility.ts's meaning (deals OWN = owner or
   collaborator · TEAM = OWN | teamId ∈ my teams | owner ∈ teammates · contacts the same without collaborators · activities by owner).
   **An activity without an owner counts only at ALL** (report attribution is by owner). Archived deals and archived/merged contacts
   never count. The export's deal section additionally stays inside `visibleWhere(DEAL)` (a STAFF with `report.all` gets totals of other
   teams, not their deal titles) — not exercised on the seed.
5. **Numbers & periods** (all SQL, bigint → number, R-E.8): *open* metrics are a snapshot (no period); *won/lost* by `closedAt`;
   *won value* = `COALESCE(wonValueSatang, valueSatang)` (R-E.7); *weighted* = Σ `round(value × COALESCE(probabilityOverride,
   stage.probability) / 100)` over OPEN non-OMITTED (same formula as `deals.forecast`); *paid* = Σ `CrmDealPayment.satang` COUNTED by
   `countedAt`; *activities done* by `doneAt`; *new leads* by contact `createdAt`. winRatePct = won/(won+lost), 1 dp; avgWonSatang rounded.
6. **DTO shapes** (every row has `key` + Thai `label`; `"none"` = null key like `FORECAST_NONE_KEY`):
   `overview` → { openDeals, openValueSatang, weightedSatang, wonDeals, wonValueSatang, lostDeals, winRatePct, avgWonSatang, paidSatang,
   activitiesDone, newLeads } · `forecast(f & {groupBy: month|owner|team})` → { groupBy, rows[{ key, label, deals, pipelineSatang,
   bestCaseSatang, commitSatang, weightedSatang, closedSatang, quotaSatang }] } with month = **Thai** month of `expectedCloseAt` (open)
   / `closedAt` (closed), pipeline = all three categories, bestCase = BEST_CASE + COMMIT, commit = COMMIT (mockup's cumulative columns),
   quota = placeholder (`null` while no `CrmQuota` row — C3.2 fills it; `CrmQuota`/`CrmCommission` may not exist yet: C3.0 is not on this
   worktree, the oracle checks `information_schema`) · `funnel` → { pipelineId, stages[{ stageId, name, kind, entered, left, ratePct,
   avgDays }] }: pipeline = filter else default (`isDefault desc, sortOrder, createdAt`), stages **OPEN + WON** by sortOrder (LOST lives
   in the lost tab), from `CrmDealStageHistory` (entered = distinct deals INTO the stage with enteredAt in period · left = those rows with
   leftAt · ratePct = entered ÷ entered(previous row) × 100, first row 100 — mockup 09 · avgDays = avg(durationSec ?? leftAt − enteredAt)
   of left rows, 1 dp) · `reps` → rows[{ key=ownerUserId, label, wonDeals, wonValueSatang, openDeals, openValueSatang, lostDeals,
   paidSatang, activitiesDone, commissionSatang (Σ CrmCommission not REVERSED/REJECTED), quotaSatang, attainmentPct }] · `activities` →
   rows[{ key=ownerUserId, label, done, open (snapshot), calls, callSeconds, byType{TYPE: n} }] · `lostReasons` → { total, valueSatang,
   rows[{ key=lostReasonId|"none", label, deals, valueSatang, pct }] } · `sources` → { bySource, byCampaign, byLink } rows[{ key, label,
   leads, deals, wonDeals, wonValueSatang, costSatang, roi }] — **cohort = contacts created in the period, attributed by the CONTACT's
   `sourceKind`** (the lead's origin; deals inherit it), campaign key = `sourceDetail.campaignId ?? sourceDetail.utm.campaign` (the seed
   only has `utm.campaign = b2b_q4`), link = `sourceDetail.linkId`, cost = Σ `CampaignVariantStat.costSatang` when the key is an
   `MktCampaign` of the tenant, roi = wonValue ÷ cost (2 dp) else null · `scores` → { bands[{ key HOT|WARM|COLD|none, label, contacts,
   avgScore, withOpenDeal, withWonDeal }], topRules[{ key=ruleId, label, logs, points }] (CrmScoreLog in period, top 10) }.
7. **Export = always an async job** (the seed is small, so "async only for large sets" would never be exercised): `startExport(ctx,
   actor, { tab, filters })` → `{ jobId, status }` writes a **`CrmImportJob` row `kind "REPORT_EXPORT"`** (the existing job table — no
   migration) QUEUED + audit `crm.report.export`; `runExportJobs({ now?, tenantIds?, systemIds?, deadline?, signal? })` → `{ done,
   failed }` claims with a **lease** (`leaseUntil`, cleared when DONE) and is registered as minute job **`crm.reports.exports`**;
   `getExport(ctx, actor, jobId)` → `{ jobId, tab, status, rowCount, filename, csv }` — **only the requester** reads it (others
   NOT_FOUND), no URL field; if the CSV is stored as a file it is a PRIVATE FileAsset (C0.4, X10.1). The service CSV has **no BOM**; the
   download layer adds U+FEFF + `text/csv` (same as `DealTable.tsx`). Every line through `csvRow`.
8. **CSV column order** (Thai headers): reps = `ผู้ดูแล · ชนะ (ดีล) · มูลค่าที่ชนะ (บาท) · ดีลเปิด · มูลค่าดีลเปิด (บาท) · แพ้ (ดีล) ·
   รับชำระแล้ว (บาท) · กิจกรรมที่ทำ · คอมมิชชัน (บาท) · โควตา (บาท) · % ของโควตา` (11 — S3.1 reads columns 1–3); money in baht as numbers
   (satang ÷ 100); other tabs = their DTO row fields in the order of item 6; **forecast additionally appends a deal section** (`ชื่อดีล ·
   ผู้ดูแล · ขั้น · หมวดพยากรณ์ · มูลค่า (บาท) · วันที่คาดว่าจะปิด`) — that is where the brief's `=HYPERLINK(...)` deal title shows up (X6.1);
   the sources export carries the campaign key, which is attacker-controlled through a public form's UTM (X6.1 seeds `@SUM(1+1)*cmd|…`).
   **No contact name/phone/e-mail and nothing of a linked member** in any tab DTO or export (X8.1).
9. **Schedules** (R-E.6): `settings.crm.reportSchedules[]` entries `{ id, tab, filters, frequency DAILY|WEEKLY|MONTHLY, weekday 1..7
   (Mon = 1, WEEKLY, default 1), dayOfMonth 1..28 (MONTHLY, default 1), recipientUserIds (1..20), active, createdById, createdAt }` +
   whatever claim state the builder needs; written with ONE `jsonb_set` (siblings survive — S4.1/X9.1); **no ReportDef row, no table**.
   Gate for save/delete/list: **`crm.report.all`** (OWNER/MANAGER by default; a STAFF with `report.view` only ⇒ FORBIDDEN, X9.2).
   Validation (Thai VALIDATION, nothing stored): tab/frequency outside the lists, weekday ∉ 1..7, dayOfMonth ∉ 1..28, 0 or > 20
   recipients, impossible filter date. Audits `crm.report.schedule.save` / `crm.report.schedule.delete`.
10. **Recipients (X8.2)**: user ids only — each must hold an accepted Membership of THIS tenant; a raw e-mail string, a user of another
    tenant or an unknown id ⇒ VALIDATION. At send time the recipient is re-resolved (membership gone / no `crm.report.view` ⇒ skipped)
    and **each recipient gets the report computed with his own actor** (owner's CSV lists every rep, s1's only himself — S4.2). `to` =
    `User.email`.
11. **Sender** `runScheduled({ now?, tenantIds?, systemIds?, deps?: { email? }, deadline?, signal? })` → `{ sent, skipped, failed }`, body
    of the existing daily job `crm.reports.scheduled` (C2.10 stub — same name/cadence, only the body changes). `now` is THE clock (tests
    pass synthetic clocks in Oct/Nov 2026, i.e. after the schedule was created; only the dispatcher refuses future clocks). **Slots are
    fixed clock windows from Thai midnight (C0.5), never "24 h since the last send"**: DAILY = Thai day · WEEKLY = ISO week (Mon start),
    first run on/after `weekday` · MONTHLY = Thai month, first run on/after `dayOfMonth` · a missed day **catches up once** in the same
    slot (X5.3 table). Claim = **lease 15 min per (schedule, slot)**, never a terminal "sent" (X5.2: a run that dies inside the transport
    blocks for 15 min, then exactly one retry; the dead run waking up with a failure must not un-mark the slot). Overlapping runs ⇒ one
    e-mail per recipient per slot (X5.1). uiVersion-1 systems are skipped and resume at 2 with the row kept (U.2). Report period of a
    mail: previous Thai day / previous ISO week / previous month (not asserted).
12. **E-mail request** passed to `deps.email` (the default = the platform sender): `{ to, userId, scheduleId, slot, subject, html,
    attachments: [{ filename: "*.csv", content: CSV, contentType }] }` — subject `รายงาน CRM · <tab label> · <period label>` (Thai, no
    CR/LF, no customer data); no PII in subject/body/CSV (X8.3); any `crm.report.*` outbox event (none required) ids-only.
13. **Query-count guard** (brief): one `overview` on the seed ≤ 12 round trips incl. scope resolution (S6.4). The oracle proves its spy
    first (T0.1): it installs its own PrismaClient as `globalThis.prisma` before `@/lib/core/db` loads (db.ts reuses that singleton) and
    counts both Prisma `query` events and pg client statements; 3 raw SELECTs + 1 count must move one of them by exactly 4.
14. **UI**: `src/app/app/sys/[id]/crm/reports/page.tsx` (overview) + `reports/[tab]/page.tsx`, components under
    `src/components/crm/reports/**`, optional `crm/reports-actions.ts` ("use server": async only + assertCrmV2). Guard `type: "CRM"` →
    `requireCrmV2Page` → `crmCan(actor, "crm.report.view")` → `notFound()`. CRM_NAV entry `{ key "reports", label "รายงาน", path
    "/crm/reports", status "ready", wo "C3.1" }` (the `[tab]` pages are params ⇒ not in the menu). testids `crm-report-tab-<key>` ×8 ·
    `crm-report-filter-period|team|pipeline` · `crm-report-export` · `crm-report-schedule` · ≥ 13 inventory rows of wo C3.1.
15. **What the oracle leaves on the seed**: nothing. It reads the seed shop (S1–S3, X1.1–X1.4, S6.4) and deletes, in `finally`, the
    `REPORT_EXPORT` jobs and `crm.report.*` audit rows its own requests created there; CLEAN compares a signature of the seed (deals +
    updatedAt hash, contacts, activities, history, payments, jobs, report audits, policies, settings md5, memberships) before/after.

### Not tested here (and why)
- MANAGER branch-limited ALL (the seed manager has `unitAccess [patong]`): the rule is visibleWhere's; C3.9's hunters own it.
- Real SMTP/transport and the platform sender default — always the injected `deps.email` (a real send from QC is forbidden).
- The download route/Blob adding the BOM is checked statically (S5.2); pixel parity with mockup 09 is gate D7 (controller).
- Quota and commission columns are placeholders until C3.0 (tables) and C3.2/C3.3 (logic) — the oracle compares them when the tables
  exist, otherwise expects null/0.

## Controller ruling (26 ก.ย. 2569 · Fable 5.1 · binding — เคาะ addendum 1–15 ก่อน spawn builder C3.1)
- **CONFIRMED ทั้ง 15 ข้อ** ตามที่ผู้เขียนข้อสอบเสนอ: ชื่อฟังก์ชัน/แท็บ/ตัวกรอง (1–3) · scope รายงาน = widest(REPORT policy, report.team, report.all) + กิจกรรมไร้เจ้าของนับเฉพาะ ALL (4) · นิยามตัวเลข/ช่วงเวลาไทย (5) · DTO (6) · export เป็นงาน async เสมอผ่าน `CrmImportJob kind "REPORT_EXPORT"` + lease + งานรายนาที `crm.reports.exports` + อ่านได้เฉพาะผู้ขอ + ไฟล์ (ถ้ามี) PRIVATE (7) · ลำดับคอลัมน์ CSV + ไม่มี PII (8) · ตารางเวลาใน `settings.crm.reportSchedules[]` เขียนด้วย jsonb_set เดียว + ประตู `crm.report.all` (9) · ผู้รับ = user id ที่เป็นพนักงานร้าน re-resolve ตอนส่ง + คำนวณด้วย scope ของผู้รับเอง (10) · ช่องเวลาตรึงนาฬิกาไทย + lease 15 นาทีต่อ (schedule, slot) + ตามรอบที่พลาดครั้งเดียว (11) · รูปคำขออีเมล (12) · overview ≤ 12 round trips (13) · UI/nav/testid (14) · ไม่ทิ้งอะไรบน seed (15)
- หมายเหตุผู้คุมงาน: (ก) `REPORT_EXPORT` บน `CrmImportJob` = ทางเลือกที่ไม่ต้อง migration — จด candidate C6.1: ย้ายเป็นตาราง/enum ของตัวเองถ้าตารางงานนำเข้าโตจนกวน (ข) การ์ด "ดีลที่ต้องดู" ของ C2.10 และ `crm.reports.scheduled` stub ของ C2.10 ต้องคงชื่อ/รอบเดิม เปลี่ยนแค่ตัวงาน (ค) หน้า v1 (uiVersion 1) ต้องเหมือนเดิมทุกไบต์ — ด่าน D7 ของใบนี้ต้องมีกรณีระบบ uiVersion 1 (U.1/U.2 ในข้อสอบ)
- 🔴 ข้อสอบ 56 ข้อ · จะรันโดยผู้คุมงานบน QC1 หลัง builder ส่งงาน · builder รันเองบน QC3 (c23) เท่านั้น

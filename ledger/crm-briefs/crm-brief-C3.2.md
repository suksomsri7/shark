# C3.2 — Quotas, home KPIs, leaderboard, saved views
Read `crm-brief-COMMON.md` first. Contract: CRM-RUN §2 "C3.2". Spec: blueprint §3.1 (mockup 01), §5.9 quotas, mockup 10 (quota).

Deliverables: `quotas.ts` set/list/progress (from the ledgers: stage history WON, `CrmDealPayment` COUNTED, activities) / `checkReached` (event `crm.quota.reached` ONCE per owner+period+threshold 80/100 — conditional insert, not check-then-emit) · home page: 6 KPIs, today's tasks, deals to watch, team leaderboard, lead sources, 3 AI buttons (wired in C3.4), filters + saved views for `objectKey` contact/company/deal (`MemberSavedView.objectKey/teamId`; TEAM scope now means the real Team).
Acceptance (oracle `qc-crm-c3.2`): CRM-RUN (20). X3 two payments crossing 100 % in parallel → one `crm.quota.reached` · X1 KPIs/leaderboard respect visibility; saved TEAM view visible only to that team · parity mockup 01 owner/thana × 2 sizes.
Regressions: `qc-member-m1.5` (saved views of members unchanged), C3.1.

## Addendum (oracle author) — 26 ก.ย. 2569 · `scripts/qc-crm-c3.2.mts` (46 ข้อ = the 20 of CRM-RUN + S0 4 · S6 5 · K 1 · X 15 · CLEAN)

The brief named the features; the oracle had to pin **names, windows, formulas and scopes** so that an independent SQL answer key can
judge them. Everything below is **oracle-proposed — controller to confirm**; a different ruling ⇒ ORACLE-EDIT the named check before the
builder starts. The oracle lives entirely in throwaway tenants `qc-c32-<rand>-*` (it reads no seeded row), so a reseed can run beside it.

1. **Files and names** (S0.1–S0.3). `src/lib/modules/crm/quotas.ts` (`setQuota` · `listQuotas` · `progress` · `checkReached`) ·
   `quotas-shared.ts` (pure: `QUOTA_THRESHOLDS = [80, 100]` · `periodKeyOf(date, "MONTH"|"QUARTER"|"YEAR")` · `periodRange(key)` ·
   `isPeriodKey(key)`) · 🔴 **`home-data.ts`, not `home.ts`**: `home.tsx` already exists and `ui.tsx` does `export { CrmHomeV2 } from "./home"` —
   a `home.ts` beside it would win module resolution and break that import (S0.2 fails if `crm/home.ts` exists) · `home-data.ts` exports
   `kpis` · `leaderboard` · `leadSources` · `unowned` · `homeData` · `views.ts` exports `listViews` · `createView` · `updateView` ·
   `deleteView`. Facade block `// CRM C3.2 ▸ … ◂`: `export * as quotas from "./quotas"` · `export * as home from "./home-data"` ·
   `export * as views from "./views"`. No migration (CrmQuota came with `crm_v2_c`; S0.4 fails on any new `*crm*` migration).
2. **periodKey is GREGORIAN** (S6.1 · S6.2): `"2026-09"` · `"2026-Q3"` · `"2026"` — the schema comment says `"2569-10"`, but HR payroll
   (`^\d{4}-\d{2}$`), the account periods and the commission `periodKey` that C3.3 hands to HR are all Gregorian; one format across the three
   modules beats a converter. The UI shows the Buddhist year as a label only. `isPeriodKey` accepts years 2000–2199 ⇒ a B.E. key such as
   `"2569-10"` is refused with a Thai hint (VALIDATION).
3. **Every window is half-open on Thai midnights**: month = [1st 00:00 +07:00, next 1st 00:00 +07:00) — e.g. `periodRange("2026-09")` =
   [2026-08-31T17:00Z, 2026-09-30T17:00Z); quarter/year the same way. The fixture sits on every edge (31 Aug 23:30 Thai out · 1 Sep 00:30
   Thai in · 30 Sep 23:59 Thai in · 1 Oct 00:01 Thai out). All read functions accept `now?: Date` (tests use 2026-09-15 12:00 Thai).
4. **`progress(ctx, actor, { ownerType, ownerId, periodKey })` → `{ quotaId|null, won, deals, paid, activities, targetSatang|null,
   targetDeals|null, targetActivities|null, basis, pct|null }`** (S1.1–S1.5), from the ledgers only:
   - **won / deals** = Σ `CrmDeal.valueSatang` / count of deals with `kind = WON`, `archivedAt IS NULL`, owner ∈ owners, whose **LATEST**
     `CrmDealStageHistory` row into a WON stage has `enteredAt` in the window (`closedAt` is NOT the ledger — a won→reopened→won deal
     counts at its last win; a won-then-reopened deal that is OPEN now does not count). Owner = the deal's **current** `ownerUserId`.
   - **paid** = Σ `CrmDealPayment.satang` with `status = 'COUNTED'` and `countedAt` in the window, on non-archived deals of the owners
     (any deal kind — a deposit on an OPEN deal counts; REVERSED/LINKED never).
   - **activities** = `CrmActivity` with `doneAt` in the window, owner ∈ owners, `type ∉ {NOTE, WEB, PORTAL}` (not staff work).
   - owners = `[userId]` for USER · the team's **current** `TeamMember` rows (LEAD included) for TEAM. TEAM target = its own CrmQuota row,
     else Σ of the members' USER targets for the period (blueprint §11.6 "ทีม = Σ ของสมาชิก หรือกำหนดเอง").
   - **pct = floor(achieved × 100 / target)**, `achieved = paid` when `settings.crm.commission.basis` is `"PAID"` (default, §4.5) else `won`;
     no quota / target 0 ⇒ `null`. `basis` is echoed.
   - visibility: self · a team the actor is in · actor with REPORT level ALL or `crm.quota.manage` — anything else **NOT_FOUND** (X1.4).
   - all sums in SQL as bigint (R-E.8), returned as JS numbers.
5. **`checkReached(ctx, target: { quotaId } | { userId, at?: Date }) → { emitted: { quotaId, threshold }[] }`** (S2 · X3 · X4 · X8):
   - thresholds `[80, 100]`; every threshold with pct ≥ it is emitted in the same call (0 → 200 % emits both).
   - **once per owner + period + threshold, forever**: key `crm.quota.reached#<systemId>:<ownerType>:<ownerId>:<periodKey>#<threshold>`
     (R-C.8 shape; systemId inside because one user can hold quotas in two CRM systems of a tenant; not the quota id, so deleting and
     re-creating a quota cannot fire again) — dipping below after a reversal and recovering never re-fires; raising the target never re-fires.
   - **conditional insert** (`INSERT … ON CONFLICT DO NOTHING` / `createMany({ skipDuplicates })`), never `emitOutbox`'s check-then-create:
     under 12 parallel callers a unique violation would abort the caller's transaction.
   - payload **ids only** `{ quotaId, ownerType, ownerId, periodKey, threshold, pct }`; `OutboxEvent.systemId` = the CRM system (X8.1).
   - `{ userId, at }` evaluates that user's USER quota **and** the TEAM quotas of his teams for the period containing `at` (default now).
   - 🔴 **wiring**: every COUNTED payment (`payments.ts` — `afterCounted` or a consumer of the `crm.deal.updated` it already emits) and every
     move to WON must reach `checkReached` **after its own transaction committed**. Inside the payment tx two parallel payments each see only
     their own row and NEITHER crosses 100 % (the X3.2 race: 60 % + 25 % ∥ 25 %) — the after-commit call is what makes "exactly one" true.
   - uiVersion ≠ 2 ⇒ returns without writing (X1.5); a quota of another system via this ctx ⇒ nothing written (X1.4).
6. **`setQuota(ctx, actor, { ownerType, ownerId, periodKey, targetSatang, targetDeals?, targetActivities?, note? })`** (S6.2 · X9):
   upsert on `@@unique(systemId, ownerType, ownerId, periodKey)` · key `crm.quota.manage` · **a period that has ENDED (window end ≤ now)
   needs MANAGER/OWNER** — a STAFF holding the key is FORBIDDEN there (§11.6) · `targetSatang` a non-negative safe integer · USER must be a
   member (Membership) of the tenant, TEAM a Team of the tenant, else VALIDATION/NOT_FOUND with nothing written · audit `crm.quota.set`
   with before/after on every call. `listQuotas(ctx, actor, { periodKey?, ownerType? })` → `QuotaDto[]` (targetSatang as a number).
7. **Home filters** `{ pipelineId?, ownerUserId?, periodKey?, now? }`; periodKey defaults to the Thai month of `now`. Key **`crm.report.view`**
   (the home page is a report view): a STAFF without it gets FORBIDDEN/NOT_FOUND from `kpis`/`leaderboard`/`leadSources`/`homeData` (X1.3).
   **Scope = the actor's REPORT level** (`visibility.resolve(ctx, actor, "REPORT")`: STAFF default OWN · team lead ≥ TEAM · MANAGER/OWNER
   ALL) intersected with `visibleWhere` of the entity — so thana sees his own numbers only, nok (lead of K) sees team K (owner ∈ K members
   **or** `teamId` = K), the owner sees everything (X1.1 · X1.2). The owner filter narrows further; a filtered owner outside the scope ⇒ zeros.
8. **The 6 KPIs** (`kpis` → `{ periodKey, openPipeline, weighted, won, winRate, stale, hotLeads }` · S3.1–S3.6):
   1. **pipeline เปิด** `{count, valueSatang}` = visible `kind OPEN`, `archivedAt IS NULL` deals (pipeline + owner filters apply).
   2. **ถ่วงน้ำหนัก** `{valueSatang}` = round(Σ valueSatang × COALESCE(probabilityOverride, stage.probability) / 100) over the same deals.
   3. **ชนะเดือนนี้ vs โควตา** `{count, valueSatang, targetSatang|null, pct|null}` = deals WON in the window (same ledger rule as §4) ·
      target = Σ **USER** quotas of the period for the users in scope (OWN = me · TEAM = members of my teams · ALL = every USER quota;
      TEAM custom rows are NOT added — no double counting) · pct = floor(won × 100 / target). *Open: should a TEAM viewer use the team's
      custom row instead? — controller to confirm.*
   4. **อัตราชนะ** `{pct, prevPct, deltaPts, won, lost}` = **round-half-up**(won × 100 / (won + lost)) over deals whose latest history row
      into their current WON/LOST stage is in the window; prevPct = the previous Thai month; deltaPts = pct − prevPct; no closed deal ⇒ null.
      (Fixture hits 62.5 ⇒ 63.)
   5. **ดีลนิ่ง** `{count, valueSatang}` = visible OPEN non-archived deals with `stalledAt` set — the same set as C2.10's "ดีลที่ต้องดู", uncapped.
   6. **lead ร้อน** `{count, threshold}` = visible contacts, not archived, not merged, **score ≥ `settings.crm.scoring.hot`** (default 50) —
      the score decides, never a possibly stale `scoreBand`; any lifecycle.
9. **Leaderboard** (`leaderboard` → `{ periodKey, rows: { userId, name, wonSatang, wonCount, targetSatang|null, pct|null, openDeals }[] }` ·
   S6.4): rows = OWN ⇒ me · TEAM ⇒ the members of my teams · ALL ⇒ every **tenant member** who owns a visible non-archived deal or holds a
   USER quota for the period (a non-member owner and "no owner" deals are not rows). Numbers over visible deals only. pct =
   floor(won × 100 / USER target) — won-based, whatever the commission basis. **Order: wonSatang desc, pct desc (null last), userId asc.**
10. **Lead sources** (`leadSources` → `{ periodKey, items: { sourceKind, count }[] }` · S6.5): visible contacts **created** in the window,
    not archived, not merged, grouped by `sourceKind` with **null → "OTHER"**, ordered count desc then key asc.
11. **"No owner" list** (R-A · S6.3): `unowned(ctx, actor)` → `{ deals: {id,title,valueSatang}[], contacts: {id,name}[] }` = OPEN
    non-archived deals and live contacts whose owner is null **or no longer has a Membership in the tenant**; key `crm.deal.reassign`
    (MANAGER/OWNER by default; a STAFF ⇒ FORBIDDEN/NOT_FOUND); bulk transfer = the existing `deals.bulkReassign` (no second path).
    `homeData` → `{ kpis, leaderboard, leadSources, unowned | null }` (null for actors without the key).
12. **Saved views** (S4.1–S4.3 · X1.6): `createView(ctx, actor, { objectKey: "contact"|"company"|"deal", name, scope: "PRIVATE"|"TEAM",
    teamId?, filters })` — needs the read key of the object; TEAM needs a `teamId` of a team the actor is in (or MANAGER/OWNER); `"customer"`
    or any other objectKey ⇒ VALIDATION; a non-CRM system id ⇒ NOT_FOUND. **Filters are whitelisted per objectKey** (unknown keys dropped):
    contact = `ContactListInput` minus paging/sort (q · stage · leadStatus · owner · team · scoreBand · source · companyId · f) · company =
    q · owner · team · industry · size · hasOpenDeals · f · deal = pipelineId · owner · team · stage · closeFrom · closeTo · stale · tag · q ·
    companyId · contactId · kind · f. **Visibility**: the view's owner + the **current members of `teamId`** — nobody else (a MANAGER who is
    not in that team included); legacy rows `scope TEAM, teamId NULL` keep meaning "whole shop"; update/delete = the view owner (or the
    OWNER role); invisible ⇒ NOT_FOUND. `listContacts`/`listCompanies` (new: `savedViewId`)/`listDeals({ savedViewId })` apply exactly this
    rule and give the same rows as the explicit filters. Member saved views (`member/views.ts`, objectKey `customer`) are untouched.
13. **Event registration**: `crm.quota.reached` once in `automation/labels.ts` (block `// CRM C3.2 ▸`), not in `webhooks/labels.ts`; the
    consumer (block `// CRM C3.2 ▸`) calls `notifications.notifyStaff` with template **`quota.progress`** (already in C2.10's registry), vars
    `{ count: threshold }`, refType `"CrmQuota"`, refId = quotaId, recipients = the quota owner (USER) or the team lead + members (TEAM) —
    the notifier's per-day dedupe makes redelivery harmless (X4.2).
14. **uiVersion 1** (R-E.14): kpis · progress · setQuota · listViews ⇒ `CrmV2DisabledError`, nothing written; checkReached silent.
15. **UI contract** (S5.1–S5.2, pixel parity stays gate D7): home testids `crm-home-kpi-{open,weighted,won,winrate,stale,hot}` ·
    `crm-home-leaderboard` / `-row-*` · `crm-home-sources` / `crm-home-source-row-*` · `crm-home-filter-{pipeline,owner,range}` ·
    `crm-home-saved-view` · `crm-home-ai-{risk,draft,summary}` (buttons only — wired in C3.4) · `crm-home-unowned` · keep
    `crm-home-stale-list` · ≥ 12 inventory rows (page `/`, wo C3.2) · `/crm/settings/quotas` page (guard type CRM → requireCrmV2Page →
    crmCan `crm.quota.manage` → notFound) + nav `{ path "/crm/settings/quotas", status "ready", wo "C3.2" }` + testids
    `crm-quota-{table,period,save}` · `crm-quota-row-*` · `crm-quota-target-*` + ≥ 5 inventory rows. `home.tsx` loads through `homeData`.

### Not decided by the oracle (fixture avoids them — controller to rule if it matters)
- Collaborator deals in the aggregates of an OWN viewer (visibleWhere OWN includes `collaboratorUserIds`; the fixture has none).
- Whether a TEAM viewer's KPI 3 target should be the team's custom row (item 8.3 uses Σ USER quotas).
- Owner "at the time of the win" vs current owner for quota credit (item 4 uses the current owner; C3.3 commissions has its own rule).

### Regressions the controller runs with this file
`qc-member-m1.5` (member saved views) · `qc-crm-c1.3` / `c1.4` / `c1.5` (list*({savedViewId}) now honours teamId) · `qc-crm-c1.7` ·
`qc-crm-c1.11` + `qc-crm-c2.10` (home page) · `qc-crm-c2.7` (the reached hook rides the money path) · `qc-crm-c1.8` (registries) ·
`qc-crm-c3.1` (same ledgers / REPORT level) · `qc-crm-v1` · `pnpm fitness` both modes · `qc-member-m1.9` (30/15/10/5).

## Controller ruling (26 ก.ย. 2569 · Fable 5.1 · binding — เคาะ addendum 1–15 ก่อน spawn builder C3.2)
- **CONFIRMED ทั้ง 15 ข้อ**: ไฟล์ `quotas.ts` `quotas-shared.ts` `views.ts` **`home-data.ts`** (ไม่ใช่ `home.ts` — ชน `./home` ที่ ui.tsx ใช้) · **periodKey แบบคริสต์ศักราช** `2026-09` / `2026-Q3` / `2026` (ตรง HR/บัญชี/C3.3) · ช่วงเวลาครึ่งเปิดเที่ยงคืนไทย + `now` ทุกฟังก์ชันอ่าน · progress จากแถวประวัติขั้น WON ล่าสุด + จ่าย COUNTED ตาม countedAt + กิจกรรมยกเว้น NOTE/WEB/PORTAL + ทีม = สมาชิกปัจจุบัน (เป้าทีมไม่มี → รวมเป้าสมาชิก) + pct = floor ตามฐานคอมมิชชัน · **`crm.quota.reached` เกณฑ์ [80,100] คีย์ `…#<threshold>` payload ids-only เขียนแบบ insert-or-skip และยิงหลัง tx ของการจ่าย/ชนะ commit แล้ว** (ไม่งั้นสองการจ่ายขนานพลาดจุดข้าม 100 ได้) · setQuota ต้อง `crm.quota.manage` + งวดที่ปิดแล้วต้อง MANAGER+ + audit before/after · หน้าแรกใช้ `crm.report.view` + scope = ระดับ REPORT ∩ visibility ปกติ · KPI 6 ตามนิยาม SQL ของข้อสอบ (win rate ปัดครึ่งขึ้น · hot ตามคะแนน · เป้า KPI-3 = รวมโควตา USER) · leaderboard เรียง wonSatang desc → pct desc (null ท้าย) → userId · ที่มา lead ตามวันสร้างผู้ติดต่อ (null = OTHER) · รายการ "ไม่มีเจ้าของ" ต้อง `crm.deal.reassign` + โอนผ่าน `deals.bulkReassign` เดิม · saved views: filter whitelist ต่อ objectKey · TEAM = เจ้าของ+สมาชิกทีมปัจจุบัน · แถว TEAM เก่าที่ไม่มี teamId = ทั้งร้านต่อไป · `listCompanies` รับ `savedViewId` · `customer` ถูกปฏิเสธ · views ของสมาชิกไม่แตะ · handler ใช้ `notifyStaff` เทมเพลต `quota.progress` refId = quotaId (ถ้าเทมเพลตนี้ไม่มีใน C2.10 ให้ builder เพิ่มในทะเบียนเทมเพลตของ C2.10 พร้อมข้อความไทย — แจ้งผู้คุมงาน) · uiVersion 1 = `CrmV2DisabledError` / `checkReached` เงียบ · UI/nav/inventory ตามข้อ 15
- 🔴 ทำขนานกับ C3.1 (ไฟล์ร่วม: `index.ts` บล็อกแยกต่อใบ · `nav.ts` รายการแยก · `crm-ui-inventory.json` แถว wo แยก) — builder C3.2 ห้ามแตะ `reports*.ts` · ผู้คุมงานรวมด้วย patch --fuzz แล้วรันข้อสอบทั้งสองใบซ้ำ
- ข้อสอบ 46 ข้อ · builder รันเองบน QC2 (c110) · ผู้คุมงานรันซ้ำบน QC1

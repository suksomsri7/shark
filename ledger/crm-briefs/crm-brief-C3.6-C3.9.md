# C3.6 — Integrations page, PAGES widgets, Team in member views
Contract: CRM-RUN §2 "C3.6"; mockup 17. `/settings/integrations`: 24 systems (keys from `src/lib/systems.ts`), per system: enabled?, last CRM-relevant event time (from outbox), job health from the minute-job registry (C0.5), and the `settings.crm.targets` pickers (member/account/kanban/chat/inventory system when a tenant has several) — bridges MUST read targets through one resolver. PAGES widgets: "my deals", "today's tasks" (staff, behind staff session) and "portal" entry (customer). `MemberSavedView.teamId` honoured in member lists (TEAM scope = real team when `teamId` set; legacy rows keep tenant-wide meaning).
X1: widgets respect visibility; targets cannot point to another tenant's system. Regressions: `qc-pages`, `qc-member-m1.5`, `qc-systems*`.

## Addendum (oracle author) — 26 ก.ย. 2569 · `scripts/qc-crm-c3.6.mts` (29 ข้อ: S0 2 · S1 4 · S2 4 · S3 3 · S4 2 · S5 3 · K 2 · X1 4 · X3 1 · X8 1 · X9 1 · U 1 · CLEAN)
Everything below is **oracle-proposed — controller to confirm** (a different ruling ⇒ ORACLE-EDIT the named check before the builder starts).
1. **Files / facade** (S0.1–S0.2): `src/lib/modules/crm/integrations-shared.ts` (pure) · `integrations.ts` · `widgets.ts` · facade block
   `// CRM C3.6 ▸ export * as integrations from "./integrations"; export * as widgets from "./widgets" ◂`. **No migration** (`MemberSavedView.teamId`
   came with `crm_v2_a`; S0.2 fails on any `*crm*` migration newer than `crm_v2_c`).
2. **Shared constants** (S0.1): `CRM_TARGET_KINDS = ["member","account","kanban","chat","inventory"]` · `TARGET_TYPE` (→ MEMBER/ACCOUNT/KANBAN/CHAT/INVENTORY) ·
   `INTEGRATION_EVENTS: Record<code, string[]>` keyed by **all 24 `SYSTEM_DEFS` codes**; every listed type must be a key of the outbox consumer map
   and each list ⊇ the oracle's §9 minimum (`REQUIRED_EVENTS`: HOTEL hotel.checked_out · SHOP shop.order.paid · BOOKING booking.completed/no_show ·
   QUEUE queue.served · TICKET ticket.order.paid · MEMBER member.created/updated/merged/tier.changed · REWARD reward.redeemed · COUPON voucher.used ·
   POINT point.earned · CHAT chat.message.received/conversation.status · ACCOUNT account.invoice.paid/payment.recorded/quotation.responded/
   document.issued/document.voided · KANBAN kanban.card.completed · POS pos.sale.paid/voided · HR hr.leave.submitted · MARKETING campaign.sent ·
   RENTAL rental.returned · SCHOOL school.enrolled · CLINIC clinic.visit.done · PAGES forms.submission.received; RESTAURANT/MEETING/CRM/KB/INVENTORY free).
3. **Settings key** `settings.crm.targets = { memberSystemId, accountSystemId, kanbanSystemId, chatSystemId, inventorySystemId }` (blueprint §4.5 shape,
   `null` = not chosen). Written ONLY by `setTargets` with **one `jsonb_set` statement that merges the patched keys into the existing `targets` object**
   (X3.1 races 5 target writes + `setCrmSettingsKey` + `setCrmAiKey` + `setCrmRecordingDays` 10-wide × 2 rounds; nothing may be lost).
4. **Resolver** `resolveCrmTargets(tenantId: string, crmSystemId: string): Promise<{ member; account; kanban; chat; inventory }>` (each `string | null`,
   no actor, no uiVersion gate — the legacy `onCrmDealWon` path uses it). Precedence per kind (S2.1): **(1)** stored target if it is an ACTIVE system
   of that type in the same tenant (stale / foreign / wrong-type ids are ignored, never returned — X1.1) → **(2)** link: MEMBER/KANBAN/CHAT/INVENTORY =
   active system of that type sharing a BusinessUnit (`AppSystemUnit`) with the CRM system, oldest first; ACCOUNT = the `AccountSystemLink` book of
   `accountSystemForCrm` → **(3)** the tenant's only active system of that type → **(4)** `null` = callers keep today's legacy behaviour (read paths may scan
   every system of the kind; write paths do nothing). Companion `listTargetCandidates(tenantId, kind) → { id, name, active }[]` (active, createdAt asc) is
   the ONLY raw lookup of target systems (pickers + "which member system holds this customer").
5. **ONE-resolver rule** (S2.4 static, K.2 positive control on git `3accbb35`): no `appSystem.find*/count` with `type: "MEMBER"|"ACCOUNT"|"KANBAN"|"CHAT"|
   "INVENTORY"` (or `type: { in: [...] }` containing one) left in `src/lib/modules/crm/**` (except `integrations*.ts`), `src/lib/platform/crm-bridges/**`,
   `crm-outbound.ts`, `member-bridges.ts#onCrmDealWon` (+ its `memberSystemForCrm` helper). Must reference `resolveCrmTargets`/`listTargetCandidates`:
   `member-bridges.ts` · `crm/contacts.ts` (convertOptions + default) · `crm/consents.ts` (memberSystemOf) · `crm/deals.ts` (inventoryItems: target ⇒ only
   that system — S2.3 proves a product of the other inventory system is refused) · `crm/activities.ts` (dealKanbanCards) · `crm/companies.ts` (account
   book — builder may add `opts.bookId` to the account facade's `accountSystemForCrm`, + ALLOWED_EDGES unchanged) · `crm/automation.ts` (SEND_LINE passes
   the chat target to the chat facade). S2.2 proves the member bridge: 2 member systems, no link ⇒ nobody (legacy) · target = 2nd ⇒ member created there.
6. **`integrationStatus(ctx, actor, { now? })`** key `crm.settings.manage` (STAFF ⇒ FORBIDDEN/NOT_FOUND) · uiVersion 1 ⇒ `CrmV2DisabledError` →
   `{ systems: Row[24] (SYSTEM_DEFS order), jobs }`. `Row = { code, no, label, kind, enabled, systemIds, lastEventAt (ISO|null), lastEventType, events7d }`.
   enabled: FIXED_PAGE (KB · PAGES) = true · business = a BusinessUnit of the type with status ≠ ARCHIVED · feature = an AppSystem with `active = true`;
   `systemIds` = those ids. lastEventAt / events7d = max(createdAt) / count(createdAt ≥ now − 7 d) over the tenant's OutboxEvent (any status) with type ∈
   `INTEGRATION_EVENTS[code]`. `jobs` = `getMinuteJobStatus()` of the C0.5 registry for **every registered job** (`name · everyMinutes · lastRunAt ·
   lastOkAt · lastError`) — `integrations.ts` may `await import("@/lib/platform/minute-jobs")` (the oracle registers 2 synthetic jobs in its own process).
   The DTO never carries event payloads (X8.1).
7. **`getTargets(ctx, actor)` / `setTargets(ctx, actor, patch)`** key `crm.settings.manage`; every non-null id must be an ACTIVE system of the kind's type in
   the SAME tenant else `VALIDATION` (Thai, nothing stored, no audit) · another tenant's ctx ⇒ `NOT_FOUND` · one **AuditLog** row per effective change:
   `action "crm.integrations.targets"`, `targetType "AppSystem"`, `targetId` = CRM system, `before/after` = the 5 ids (X9.1).
8. **PAGES widgets** (S3.x): registry entries in `src/lib/pages/registry.ts` with a new optional field `data`: `S:CRM:my-deals` (`data "crm.myDeals"`,
   suffix `/crm/deals`) · `S:CRM:today-tasks` (`"crm.todayTasks"`, `/crm/activities`) · `S:CRM:portal` (`"crm.portalEntry"`) — qc-pages RG-1/RG-2 stay
   green (extra keys, no duplicates). `pageForRender` omits the three when the page unit's CRM system (unitSystemMap) is not uiVersion 2.
   `widgets.myDeals(ctx, actor, { limit? ≤ 20, default 5 }) → { items: { id, title, valueSatang, stageName, stalled, href }[], total }` = OPEN, not
   archived, **owner = actor**, inside dealWhere, this system (key `crm.deal.read`) · `widgets.todayTasks(ctx, actor, { now?, limit? }) → { items: { id,
   title, type, dueAt, done, href }[], counts: { today, overdue, done } }` (owner = actor, activityWhere, Thai day of `now`: today = open & due in the day ·
   overdue = open & due before · done = doneAt in the day; items = union) · `widgets.portalEntry(ctx, { contactId? | partyId? }) → { href } | null` —
   href starts `/b/` (C3.5's base-path constant), no PII/ids; null without a live `CrmPortalAccess` (revokedAt null) in THIS system or when
   `settings.crm.portal.enabled !== true`. `/p/[slug]` (after `accessFor`) calls myDeals/todayTasks with the SESSION actor; testids
   `page-widget-crm-my-deals` · `page-widget-crm-today-tasks` · `page-widget-crm-portal` · rows `page-widget-crm-deal-<id>` · `page-widget-crm-task-<id>`.
9. **Member views** (S4.x · X1.4): `createSavedView` input `teamId?` (TEAM only · MANAGER+ as in M1.5 · a team of the tenant else `MemberInputError`) ·
   `listSavedViews` = own PRIVATE + own TEAM + TEAM with `teamId null` (legacy = whole shop) + TEAM with `teamId ∈ my teams` (TeamMember or
   `Team.leadUserId`, not archived) · `listMembers({ viewId })` of a view the actor may not list (other team, someone else's PRIVATE, other system) ⇒
   `MemberNotFoundError`. 🔴 **`SavedViewDto` keys stay `columns,filters,id,name,ownerUserId,scope,sort`** — `qc-crm-c3.2` X1.6 pins them; if the UI needs
   `teamId` in the DTO the controller ORACLE-EDITs C3.2-X1.6 **and** C3.6-S4.2 together. UI: team picker testid `member-view-team` in
   `MembersSavedViewsMenu.tsx`, `members-list-actions.ts` forwards `teamId`.
10. **HR link (R-A)**: HR hub (`src/lib/modules/hr/ui.tsx` or HR pages/components) links "ทีมขาย" → `/app/settings/teams`, testid `hr-link-sales-teams` (S5.3).
11. **Page** (S5.1): `src/app/app/sys/[id]/crm/settings/integrations/page.tsx` + `src/components/crm/integrations/**`; guard type CRM → requireCrmV2Page →
    `crmCan(actor, "crm.settings.manage")` → notFound(); loads through `integrationStatus`; nav entry in `CRM_DEEP_NAV` `{ key: "settings-integrations",
    label: "เชื่อมต่อทุกระบบ", path: "/crm/settings/integrations", status: "ready", wo: "C3.6", perm: "crm.settings.manage" }`; testids
    `crm-integrations-{page,map,node-<CODE>,count-enabled,count-disabled,target-member|account|kanban|chat|inventory,targets-save,status-table,
    status-row-<CODE>,jobs,job-row-<name>}`; ≥ 8 inventory rows (page `/settings/integrations`, wo C3.6); 390: no unprefixed width > 390, tables →
    cards or scroller (R-D: C3.7 excludes this page). Pixel parity with mockup 17 = gate D7 (controller).
12. Oracle mechanics: throwaway tenants `qc-c36-<rand>-{a,b,m,i,v}`; fixture outbox rows are written `status DONE` (no foreign drainer runs them); 2 synthetic
    minute jobs `qc-c36-<rand>-{ok,bad}` + their `OpsAlertState`/`OpsEvent` rows (swept); NO drainOutbox; today (`--force-run`, builder absent) 3/29
    green = K.1 · K.2 · CLEAN.

# C3.7 — Mobile: responsive pass for C2–C3 pages + staff app
Contract: CRM-RUN §2 "C3.7"; mockup 13. Web pages of C2–C3 at 390 px. Staff app (`apps/mobile`): new section `app/(app)/crm/` (`_layout.tsx` Stack + `index.tsx` my deals, `tasks.tsx`, `call-log.tsx`, `scan-card.tsx`) + one `Pressable testID="drawer-crm"` in `app/(app)/_layout.tsx`; server routes `src/app/api/mobile/crm/*` guarded by `requireMobile` (`src/lib/mobile/auth.ts:74`) + CRM visibility; push via existing registration. QC with the web-export harness: copy `apps/mobile/qc/shoot-member.mjs` → `shoot-crm.mjs` (mocks + `SCREENS`). NO EAS build, no `@react-navigation/*` imports (expo-router only; read the Expo SDK docs named in `apps/mobile/AGENTS.md`).
X1: mobile routes 404 for invisible deals; X7: mobile routes rate-limited per user. Regressions: `qc-member-m3.9`, `qc-mobile-*`.

## Addendum (oracle author) — 26 ก.ย. 2569 · `scripts/qc-crm-c3.7.mts` (30 ข้อ: S0 2 · S1 6 · S2 6 · S3 2 · S4 2 · S5 2 · K 1 · X1 4 · X3 1 · X7 1 · X8 1 · X10 1 · CLEAN)
Everything below is **oracle-proposed — controller to confirm** (a different ruling ⇒ ORACLE-EDIT the named check before the builder starts).
1. **Server routes** `src/app/api/mobile/crm/**` (7 files, S0.1): `deals/route.ts` GET · `deals/[id]/route.ts` GET · `tasks/route.ts` GET ·
   `tasks/[id]/complete/route.ts` POST · `call-log/route.ts` GET (prompt) + POST · `scan-card/route.ts` POST · `scan-card/[proposalId]/accept/route.ts` POST.
   Every handler: `requireMobile(req)` (401 no/bad Bearer · 403 foreign `X-Tenant-Id`) → CRM system = `?systemId=` (a CRM system of that tenant else 404;
   uiVersion 1 ⇒ **409 `{ error: "CRM_V2_DISABLED" }`**) or, absent, the tenant's **first uiVersion-2 CRM** (crmGates order; none ⇒ 404) → actor from the
   membership → limiter → the SAME CRM services through the facade (no prisma import in route files). Errors `{ error, message (Thai) }`; anything
   invisible = **404** (never 403 on data).
2. **Shared route lib** `src/lib/mobile/crm-routes.ts`: `MOBILE_CRM_RATE_LIMIT = { limit: 120, windowMs: 60_000 }` (oracle accepts 10–300),
   `checkRateLimitDb("mobile-crm:" + userId, …)` ⇒ 429 `{ error: "rate_limited", message }` — per user, not per IP (X7.1) + scope/error helpers.
3. **DTOs**: deals `{ items: { id, title, valueSatang, stageId, stageName, stalledDays|null, company|null, contact: { id, name, phone|null }|null }[],
   stages: { id, name, count }[] }` = actor-owned OPEN, not archived, inside dealWhere (= C3.6 `widgets.myDeals` rule, **no limit** on the seed) · tasks
   `{ items: { id, title, type, dueAt, done, contactId, dealId }[], counts: { today, overdue, done } }` (= `widgets.todayTasks` rule, cap 200) · call-log
   GET `{ contact: { id, name }, deal: { id, title }|null, outcomes: string[] (CALL registry), directions: ["OUT","IN"] }` · **no customer e-mail in any
   DTO; phone only on the deal card** (X8.1).
4. **call-log POST** body `{ contactId, dealId?, direction, outcome, durationSec, body?, nextTask?, idempotencyKey (1–100) }` → `calls.logCall` →
   `{ activityId }`; the same key twice / 10× in parallel ⇒ ONE CALL row and the same id (X3.1 — e.g. `sourceRef "mobile-call:<key>"` + advisory lock).
5. **scan-card POST** JSON `{ contentType, dataBase64, filename? }` → `calls.scanBusinessCard` (its size/type/credit refusals ⇒ 400 with the service's
   Thai message, before any AI call) → `{ proposalId, draft }` · accept → `calls.acceptLeadProposal` → `{ contactId }`, taken ⇒ 409, other system ⇒ 404.
   No second vision prompt / `aiProposal.create` / credit charge in routes or app (S5.1).
6. **App** (S0.2 · S2.x): `apps/mobile/app/(app)/crm/_layout.tsx` (`Stack` from expo-router) · `index.tsx` · `tasks.tsx` · `call-log.tsx` · `scan-card.tsx` +
   ONE `Pressable testID="drawer-crm"` → `navigation.navigate("crm")` in `app/(app)/_layout.tsx`; **no `@react-navigation/*` import**; every call through
   `src/api/client` (no raw `fetch`, no token in URLs — X10.1). testIDs: `crm-deals` · `crm-deal-filter-<stageId|all>` · `crm-deal-card-<id>` ·
   `crm-deal-call-<id>` · `crm-deal-stale-<id>` | `crm-tasks` · `crm-tasks-count-{today,overdue,done}` · `crm-task-<id>` · `crm-task-check-<id>` ·
   `crm-scan-card-open` | `crm-call-log` · `crm-call-outcome-<i>` · `crm-call-direction-{OUT,IN}` · `crm-call-duration` · `crm-call-note` ·
   `crm-call-next-task` · `crm-call-save` · `crm-call-saved` (inline, no `Alert.alert`) | `crm-scan-card` · `crm-scan-pick` · `crm-scan-draft` ·
   `crm-scan-accept` · `crm-scan-done`. Optional shared UI in `apps/mobile/src/components/crm/**`.
7. **tel: → prompt** (S3.1): `Linking.openURL("tel:<phone>")` + pending-call marker (`apps/mobile/src/lib/call-prompt.ts`: contact · deal · startedAt) →
   AppState "active" ⇒ `router.push("/crm/call-log?contactId=…&dealId=…&durationSec=…")`.
8. **Push** (S4.x): existing `registerPush` / `/api/mobile/push/register` only (no new route/table, crm screens never call it). Pure mapper
   `apps/mobile/src/lib/crm-link.ts` — **no imports** — `crmRouteFromLink(link: string): string | null`: relative `/app/sys/<id>/crm/deals/<dealId>?…` ⇒ a
   `/crm…` route carrying the deal id (e.g. `/crm?dealId=<id>`) · `/crm/activities` ⇒ `/crm/tasks…` · chat links / absolute URLs ⇒ null; wired in the
   (app)/_layout `addNotificationResponseReceivedListener` next to the chat handler.
9. **QC render harness** (S2.2/2.4/2.6): `apps/mobile/qc/shoot-crm.mjs` = copy of shoot-member.mjs; mocks `/api/mobile/crm/{deals,tasks,call-log}` from
   `QC_CRM_FIXTURE` (default `<repo>/.qc-shots/crm/3.7/fixture-thana.json` — **written by the oracle** from the SEED as thana through the real routes);
   SCREENS `crm-deals` · `crm-tasks` · `crm-call-log` (fills and saves ⇒ `crm-call-saved`) · `crm-scan-card` · `crm-drawer` at 390×844; writes
   `apps/mobile/qc/shots-crm/summary.json = { generatedAt, fixture: { path, sha256 }, screens: [{ name, ok, errors, missing, overflow, expect, texts
   (document.body.innerText ≤ 6000) }] }`. Commands: `QC_PREPARE=1 node apps/mobile/qc/shoot-crm.mjs` (or `QC_BASE=… node …` on a served dist).
   🔴 `/root/qc-shark-mobile/node_modules` (the symlink target of the QC copies) is **gone on the VPS today** ⇒ redo README step 3 in the base copy
   (`npm install --no-save react-native-web@~0.21.0`) before the first run. NO EAS build.
10. **390 pass** (S1.x): `scripts/visual-crm.mts` gets a `3.7` block (builder adds it; controller runs it): every C2–C3 page at 390 (`onlyDevice: "mobile"`)
    named `c37-390-<key>-<user>`; keys = nav keys of `CRM_NAV ∪ CRM_DEEP_NAV` with `wo` C2.x/C3.x (minus `settings-integrations`, R-D) · `home` ·
    `report-<tab>` × 8 · `email-thread` · `sequence-editor` (the spec's `before` creates a tagged thread/sequence when the seed has none; `restoreSeed()`
    removes it). Run as owner and thana → `.qc-shots/crm/3.7/summary-{owner,thana}.json` must be newer than the newest C2–C3 UI file (S1.6); S1.5 fails on
    any C2–C3 `page.tsx` (incl. new `[param]` pages, e.g. C3.3/C3.5 ones) that maps to no shot. Portal customer pages `/b/*` are C3.5's D7, not here.
11. **Order for the controller**: oracle (writes fixture) → shoot-crm.mjs → acc-v2-serve + visual-crm 3.7 owner/thana → oracle again (the render checks need
    `summary.fixture.sha256` = the current fixture; the tasks fixture changes with the Thai day, so shoot and re-run the same day).
12. Oracle mechanics: seed read-only (answer keys = raw SQL; one mobile Session of thana tagged `qc-c37-<rand>` via `issueMobileToken(userId, { userAgent })`,
    deleted in finally); every write in throwaway tenants `qc-c37-<rand>-{t,v,n}`; ChatRateBucket rows / PushDevice rows of this run swept. Today
    (`--force-run`, builder absent) 5/30 green = K.1 · S1.3 · S1.4 · S1.5 (static 390 proxies / coverage of the existing C2–C3 pages — regression guards) · CLEAN.

# C3.8 — REST + AI, third set (~16 ops) + complete manifest + generated docs
Contract: CRM-RUN §2 "C3.8". Ops: reports, quotas, commissions, portal (customer lane: `Authorization: Bearer cs_…`, only `/portal/*` paths), dynamic records for every object, integrations. `docs/api/CRM-API.md` now 100 % generated; skill manifest 32 tools; F13.10–12 strict.
X2 FULL MATRIX generated from the registry: for every op and tool × {no-scope key, other-module key, readonly, operate, admin, team-filtered key, customer token, assistant-as-thana} → expected allow/deny asserted (no hand-written exceptions) · smoke every op once.

## Addendum (oracle author) — 26 ก.ย. 2569 · `scripts/qc-crm-c3.8.mts` (31 ข้อ: K 1 · S1 1 · S2 4 · S3 3 · S4 2 · S5 1 · S6 2 · S7 1 · S8 6 · X1 1 · X2 2 · X3 1 · X6 1 · X8 2 · X9 1 · U 1 · CLEAN)
Everything below is **oracle-proposed — controller to confirm** (a different ruling ⇒ ORACLE-EDIT the named check before the builder starts).
1. **16 new ops** (S1.1 — each `test: "C3.8-…"`, strict input, Thai label, ASCII summary; registry total ≥ **117**, C3.4's `deals.atRisk.list` ·
   `activities.taskCard.open` count too when present):
   | id | METHOD path | key | kind | service |
   |---|---|---|---|---|
   | reports.get | GET /reports/{tab} | crm.report.view | read (rate report · tool crm_reports) | reports.getReport · query `from? to? teamId? pipelineId? ownerUserId?` |
   | reports.export.start | POST /reports/{tab}/export | crm.report.view | danger (crm.admin key) | reports.startExport → `{ jobId, status }` |
   | reports.export.get | GET /reports/exports/{jobId} | crm.report.view | read | reports.getExport (requester only · signed /api/files url) |
   | quotas.list | GET /quotas | crm.report.view | read | quotas.listQuotas `{ periodKey?, ownerType? }` |
   | quotas.set | PUT /quotas | crm.quota.manage | write | quotas.setQuota `{ ownerType, ownerId, periodKey (B.E. "2569-09"), targetSatang, … }` |
   | quotas.progress | GET /quotas/progress | crm.report.view | read (tool crm_quota_progress) | quotas.progress `{ ownerType, ownerId, periodKey }` |
   | commissions.mine | GET /commissions/mine | crm.commission.view | read (tool crm_commissions_mine) | commissions.mine |
   | commissions.list | GET /commissions | crm.commission.view | read | commissions.list |
   | commissions.approve | POST /commissions/{id}/approve | crm.commission.approve | write | commissions.approve `{ reason? }` |
   | commissions.reject | POST /commissions/{id}/reject | crm.commission.approve | danger | commissions.reject (reason = the danger reason) |
   | portal.access.list | GET /companies/{id}/portal-access | crm.portal.manage | read | portal.listAccess |
   | portal.invite | POST /companies/{id}/portal-invites | crm.portal.manage | write | portal.invite `{ contactId, role?, loginMethods? }` |
   | portal.revoke | POST /portal-access/{id}/revoke | crm.portal.manage | danger | portal.revoke |
   | objects.schema.get | GET /objects/{key}/schema | crm.record.read | read | records-dynamic.objectValueSchema |
   | integrations.status | GET /integrations | crm.settings.manage | read | integrations.integrationStatus |
   | integrations.targets.set | PUT /integrations/targets | crm.settings.manage | write | integrations.setTargets |
   Recommended (not asserted): integrations.targets.get · quotas.board · commissions.report · commissions.pending. 🔴 staff-side portal paths must
   NOT start with `/portal` (dispatch sends `path[0] === "portal"` to the customer lane). The C3.4 tools crm_reports / crm_quota_progress /
   crm_commissions_mine attach to the ops above — whichever of C3.4/C3.8 lands first creates the op with THIS id (the other only adds `tool`).
2. **Records dynamic** (SKIP guard): `src/lib/modules/crm/api/ops/records-dynamic.ts` exports `RECORDS_DYNAMIC_OPS` · `objectValueSchema(ctx, actor,
   objectKey)` (JSON schema of the live fields; sensitive fields only for actors allowed to see them) · `crmObjectsOpenApi({ tenantId, systemId })` →
   `{ paths: { "/objects/<key>/records", "/objects/<key>/records/{id}" }, objects: [{ key, fields[] }] }`. `GET /api/v1/crm/openapi.json` WITHOUT a key
   = today's static doc (no tenant data); WITH a CRM key = + the concrete per-object paths. A new object works at once (no restart); a wrong value type ⇒ 422 Thai.
3. **Manifest** (SKIP guard): `src/lib/modules/crm/api/manifest.ts` → `crmManifest(): { version, ops[{id,method,path,kind,action,tool?}], portalOps[…],
   tools[{name,opId,write,danger}], webhookEvents[], internalEvents[] }` (pure, from the registries) + route `src/app/api/v1/crm/manifest.json/route.ts`
   (no key, like openapi.json) · `buildOpenApi()` gains `x-shark-webhooks` = crmWebhookEvents() · webhook-events.ts exports **`CRM_INTERNAL_EVENTS`**
   (consumer-only flag events deliberately NOT offered to webhooks; every other CRM-prefixed consumer must be offered — S6.1).
4. **Tools = 32** exactly (S4.2) — 23 today + the 9 of C3.4; manifest lists the same 32.
5. **Docs / skill**: renderDocs() gains a portal-lane section (every PORTAL_OPS path) — docs stay byte-equal to the generator and `--check` exits 0 ·
   `renderEndpointsReference()` lists CRM_OPS **and** PORTAL_OPS · `.claude/skills/shark-crm-api/SKILL.md` (frontmatter `name: shark-crm-api`, names all
   32 tools) — `.claude/` is gitignored, so fitness cannot see it; S7.1 (= "skill F13.9" of CRM-RUN) checks it in the worktree.
6. **Smoke every op** (S8.x) runs over the LIVE registry: requests are built from each op's path + JSON schema (+ a small table of business inputs); reads
   must be 200 · writes 2xx or a Thai 400/404/409/422 · no key/unknown key 401 · no-scope/other-module key 403 · cross-tenant ids 404 · readonly 403 on writes
   (reads per bundle, phone/e-mail masked) · 429 + Retry-After + Thai for every op once the DB bucket `crm:api:<kind>:<keyId>` is at its limit (portal:
   `crm:portal:api:<tenant>:<kind>:<accessId>`). X2.1 = full matrix op × {no-scope, other-module, readonly, operate, admin, team-filtered, customer token}
   with the expectation derived from the bundles (scope ∧ readonly-writes ∧ danger-export-needs-admin); X2.2 = assistant-as-thana over every tool.
7. Oracle mechanics: throwaway tenants `qc-c38-<rand>-{a,b}` (CRM systems v2 · v2 · v1 + tenant B), 8 API keys, portal accesses + minted cp_ sessions;
   the seed is only READ (K.1 · S3.1); docs + skill reference snapshotted/restored; buckets of our keys swept. Today (`--force-run`, builder absent)
   **17/31** green = the registry-wide regression probes (S8.2–S8.6 · S2.1–S2.4 · S6.2 · X1.1 · X2.1 · X2.2 · X8.1 · U.1) + K.1 + CLEAN; S8.1 is red only
   on the ≥ 117 count.

# C3.9 — PDPA, retention, limits, penetration checks
Contract: CRM-RUN §2 "C3.9"; blueprint §11.7, §11.9; decisions C20, C21.
- NEW event `member.erased {customerId, partyId}` emitted by `eraseMember` alongside today's `member.updated`/`changedKeys:["erased"]` (3 registries) → CRM eraser. NEW CRM-side erase for contacts that are not members (request → approval → erase) keyed by Party.
- Erase scope = EVERY table added in this run holding personal data (contact/company contact rows, consents, activities body/transcript/recording files, e-mails body+attachments, web sessions/events, tracked clicks, portal access/requests, custom record values flagged personal, notifications, AI proposals/prompts, `AutomationRun.payload`): anonymise identity, delete bodies/files, keep money/stage numbers. Export bundle covers the same list.
- Lead retention (C21) job with 30-day warning; purge jobs for e-mail/web/recordings; limits from blueprint §11.9 enforced with "approaching limit" notices at 80 %.
- Penetration oracle: thana across teams; portal across companies; tracking without consent; readonly key never gets e-mail bodies; SSRF on every server-side fetch; open redirects; CSV injection on every export; file links across viewers; rate limits on every public route; `"use server"` export scan; payload/log PII scan over a full scripted day of activity.
Regressions: `qc-member-m1.7`, `qc-member-fix-s4`, `qc-pdpa`, everything CRM. Then the controller closes phase C3: full `qc:all`, journeys US7 + US10.

## Addendum (oracle author) — 26 ก.ย. 2569 · `scripts/qc-crm-c3.9.mts` (36 ข้อ: K 1 · S1 6 · S2 2 · S3 2 · S4 2 · S5 3 · S6 5 · S7 4 · X1 2 · X3 1 · X4 1 · X6 2 · X8 2 · X9 1 · X10 1 · CLEAN)
Everything below is **oracle-proposed — controller to confirm** (a different ruling ⇒ ORACLE-EDIT the named check before the builder starts).
1. **`src/lib/modules/crm/privacy.ts`** (SKIP guard) · facade block `// CRM C3.9 ▸ export * as privacy from "./privacy" ◂`:
   - `eraseContact(ctx, actor|null, { contactId, confirm: true, reason ≥ 5, source?: "REQUEST"|"MEMBER"|"RETENTION" }, deps?: { del?(path) })` →
     `{ contactId, partyId|null, erased: boolean, counts }` · key `crm.contact.delete` (actor null = system callers only) · danger (no confirm / short
     reason ⇒ VALIDATION, nothing touched) · identity anonymised: `name = CRM_ERASED_NAME` ("ลบตามคำขอ PDPA"), phone/email/lineUserId/note/jobTitle/
     firstName/lastName/company null, previousEmails/tags [] · Party anonymised when no other holder, else unlinked · deleted/cleared: e-mail
     body/snippet/subject/from-to of the person + attachment files · call body/transcript/aiSummary/aiNextStep/recordingFileId + FileAsset (storage via
     `deps.del`) · CrmWebSession/Event · CrmTrackedClick · portal access/session/request (reuse `portal.eraseContact`) · AiProposal rows naming the
     contact (card scans) · CrmContactConsent notes · CustomRecordValue of records whose parent is the contact + sensitive values referencing its Party
     (R-E.10) · record titles · AppNotification bodies naming it · CRM rows of MemberAccessLog · `AutomationRun.payload` · CrmCompanyContact note/jobTitle.
     **Kept**: deals (title/value/stage/paid/owner), stage history, CrmDealPayment, CrmCommission, activity rows (emptied). AuditLog
     `crm.contact.erase` (+ reason) · outbox **`crm.contact.erased`** `{ contactId, systemId, partyId? }` key `crm.contact.erased#<contactId>` (consumer +
     one label). Idempotent (second call `erased:false`, no new audit/event; 10 parallel ⇒ one) · other tenant / other CRM system ⇒ NOT_FOUND.
     The oracle scans EVERY tenant-scoped table (AuditLog aside) for the person's name/phone/e-mail/LINE id/note — 0 hits required.
   - member-linked contact ⇒ ONE `eraseMember` through the member facade; `eraseMember` emits the NEW **`member.erased {customerId, partyId}`**
     (3 registries, alongside today's `member.updated`) whose CRM consumer erases every linked contact once (flag-first; twice + parallel = no-op).
   - `exportContact(ctx, actor, contactId) → { contact, tables: Record<model, rows[]> }` (same table list as erase) · `exportTenant(ctx, actor,
     { format: "CSV"|"JSON" }, deps?: { put? })` → `{ jobId }` = `CrmImportJob kind "CRM_EXPORT"` on the C3.1 lane · `runExportJobs({ now, tenantIds,
     deps })` (or `reports.runExportJobs` picking the kind) · `getExport(ctx, actor, jobId) → { status, url }` (requester only; url = signed
     `/api/files/<id>?exp&sig`; file path `t/<tid>/private/…`, cdnUrl `private://…`) · key `crm.contact.export` · MANAGER exports omit sensitive values ·
     e-mail bodies never exported · every CSV cell through `csvRow`.
   - `purge(now, { tenantIds?, systemIds?, deadline?, signal?, deps? })` → `{ emails, recordings, webSessions, exports, leadsErased, leadsWarned }` —
     honours the filters; conditional updates/deletes so overlapping runs purge each row once.
2. **Retention settings** (single-statement jsonb_set): existing `settings.crm.email.retentionDays` (≥ 30) · `settings.crm.retention.recordingDays` ·
   `settings.crm.tracking.web.retentionDays` (30–730) + NEW `settings.crm.retention.exportDays` (default 7) · `settings.crm.retention.leadMonths` (C21,
   default 24, 0 = off): unconverted leads idle longer are erased (`source "RETENTION"`), those within 30 days of it get ONE in-app warning first.
3. **Jobs** (daily, `everyMinutes: 1440`): existing `crm.purge.email` · `crm.purge.web` + NEW `crm.purge.exports` · `crm.retention.leads` (S3.2).
4. **`src/lib/modules/crm/limits.ts`**: `CRM_LIMITS` = blueprint §11.9 — contacts 200000 · companies 50000 · openDeals 20000 · pipelines 10 ·
   stagesPerPipeline 12 · linesPerDeal 100 · emailsPerDay 2000 · sequences 50 · stepsPerSequence 20 · activeEnrollments 5000 · assignmentRules 30 ·
   scoreRules 50 · emailTemplates 100 · objectsWarn 30 · fieldsPerObject 60 · trackedLinks 1000 · webEventsPerMonth 5000000 · webhookEndpoints 20 ·
   automationRunsPerMonth 5000 · `CRM_LIMIT_WARN_RATIO = 0.8` · `crmLimits(tenantId)` (overrides `Tenant.limits.crm.<key>`) · `crmUsage(ctx, key)` ·
   `assertCrmLimit(ctx, key, adding = 1)` (error `.code "LIMIT"`, Thai; the check and the insert atomic — X3.1 10 parallel with one slot ⇒ 1) ·
   crossing 80 % ⇒ exactly ONE AppNotification to each OWNER + ONE OpsEvent WARN `source "crm.limits"` (ids only) per (system, key, Thai month) ·
   `limitStatus(ctx, actor) → { rows: { key, limit, used, ratio, warn }[] }` · `CRM_PARAM_CAPS` = every `crm._max*` permission param
   (`_maxDealDiscountBp`, `_maxCommissionApproveSatang`, `_maxReassignPerDay` today) → its enforcer. Real create paths gated: pipelines · contacts ·
   companies · sequences · trackedLinks · scoreRules · assignmentRules (S6.3). Hard caps kept: bulk e-mail 500 · saved views 50 · reassign/discount
   params route to approval when an ApprovalPolicy exists (the oracle creates `crm.reassign` / `crm.discount` policies).
5. **Public limits** (S5): every route/action file under `/l /t /u /b /f /api/v1/crm/public /api/email/inbound` must reach `checkRateLimitDb`
   (static reachability) · human-facing entries (portal OTP, invite accept, LINE login, `/api/v1/crm/public/*`) refuse in Thai / 429 after the limit ·
   collectors & redirects keep ONE answer shape (X7) while the `crm:*` buckets count with hashed keys.
6. **Penetration** (S7): surfaces enumerated at run time — every read/list function of every CRM facade namespace (name-pattern; write verbs
   excluded), reports × 8 tabs, REST through a thana-scoped key (`crm.filter.owner`), every AI tool, every `src/app/api/mobile/crm/**` route, portal
   staff functions, exports; owner = positive control · portal service across companies + file links bound to one portal session · tracking without
   consent (none / declined ⇒ 0 rows, accepted ⇒ rows) · readonly key over every GET op ⇒ no e-mail body.
7. Oracle mechanics: throwaway tenants `qc-c39-<rand>-{a,b}` (CRM ×2 + MEMBER + tenant B · owner/manager/thana/nok · phuket/krabi teams · raw
   rows fixed by construction); `Tenant.limits` and approval policies live in the throwaway tenant only; storage calls go to fake `deps.del/put`;
   the seed is only READ (K.1 · X1.2). Today (`--force-run`, builder absent) **14/36** green: K.1 · S4.1–S4.2 · S5.1–S5.3 · S7.1–S7.4 · X1.2 · X6.2 ·
   X8.1 · CLEAN. 🔴 X8.2 is red on current code outside the privacy service: `src/app/(store)/f/[token]/actions.ts` (a `"use server"` file) exports
   `type PublicFormActionResult` — the C3.9 builder moves it to a shared file (house rule; a 500 at runtime although build passes).

## Controller ruling C3.6 + C3.7 (26 ก.ย. 2569 · Fable 5.1 · binding)
- **CONFIRMED addendum ทั้งหมดของ C3.6 และ C3.7**: resolver `resolveCrmTargets(tenantId, crmSystemId)` ลำดับ stored > unit link > ระบบเดียว > null (null = พฤติกรรมเดิม) · `listTargetCandidates` เป็น raw lookup เดียวที่อนุญาต · 7 จุดต้องผ่าน resolver (member-bridges · contacts · consents · deals · activities · companies · automation SEND_LINE — เพิ่ม `opts.bookId` ใน `accountSystemForCrm` และฟังก์ชัน chat facade สำหรับ target ได้ในบล็อกติดป้าย C3.6) · `settings.crm.targets` jsonb_set เดียว + audit `crm.integrations.targets` + `crm.settings.manage` · widgets `S:CRM:my-deals`/`today-tasks`/`portal` · **`SavedViewDto` ของสมาชิกห้ามเปลี่ยน** (UI picker อ่าน teamId จาก lookup แยก) · หน้า `/crm/settings/integrations` + nav perm · mobile routes error `{error,message}` · 409 `CRM_V2_DISABLED` · limiter 120/นาที · idempotencyKey · scan-card JSON · app screens/testIDs/`drawer-crm`/`crm-link.ts`/`call-prompt.ts` · harness `shoot-crm.mjs` summary
- 🔴 C3.7: `/root/qc-shark-mobile/node_modules` หายจาก VPS — builder C3.7 ต้องทำ README ขั้น 3 (ติดตั้งใหม่ผ่าน iso · ห้ามพร้อมกับ typecheck) ก่อนถ่ายจอแอป · ภาพ 390 ของหน้าเว็บ + จอแอป 3 จอ ผู้คุมงานถ่ายในยูนิต (build) ตามลำดับที่ผู้เขียนข้อสอบระบุ

## Controller ruling C3.8 + C3.9 (26 ก.ย. 2569 · Fable 5.1 · binding)
- **CONFIRMED addendum ทั้งหมด**: (1) op ใหม่ 16 ตัว — op ที่ใช้ร่วมกับ C3.4 (`reports.get` · `quotas.progress` · `commissions.mine` ใต้ `crm.commission.view`) **C3.4 เป็นผู้สร้าง** (C3.8 ใช้ต่อ · S1.1 นับรวม ≥117) · op ฝั่งพนักงานห้ามขึ้นต้น `/portal` (2) ไฟล์ `manifest.ts` · `records-dynamic.ts` · `CRM_INTERNAL_EVENTS` · `x-shark-webhooks` · `privacy.ts` (`eraseContact/exportContact/exportTenant/runExportJobs/getExport/purge`) · skill ตรวจใน worktree (3) event `crm.contact.erased` + `member.erased` · retention `settings.crm.retention.exportDays` 7 · `leadMonths` 24 เตือนล่วงหน้า 30 วัน · job รายวัน `crm.purge.exports` + `crm.retention.leads` (4) `limits.ts` 19 คีย์ §11.9 · เตือน 0.8 (OWNER + OpsEvent `crm.limits` ต่อระบบ/คีย์/เดือนไทย) · error `LIMIT` · `CRM_PARAM_CAPS` (5) collectors/redirects ตอบเงียบแบบเดิม
- 🔴 **บั๊กเดิมที่ข้อสอบ X8.2 จับ**: `src/app/(store)/f/[token]/actions.ts` export type ใน "use server" (บทเรียน reference_next_use_server_no_type_export = หน้า 500 ทั้งที่ build ผ่าน) → builder C3.9 ย้าย type ไป `*-shared.ts` (บล็อกติดป้าย C3.9) + รัน `qc-form`/`qc-crm-c2.6`
- finding เลนสมาชิก: bucket OTP/invite เก็บ IP ดิบในคีย์ (`customer-otp:ip:<ip>` · `portal-invite:<tenant>:<ip>`) → C3.9 แฮชคีย์ IP ของ portal-invite (ของ CRM) · ของสมาชิกจดให้เลนสมาชิก
- ลำดับ: **builder C3.9 เริ่มได้เลย** (c23/QC3 · ไม่แตะ commissions/payments/api ops ใหม่) · **builder C3.8 หลัง C3.4 รวม** (ต้องมี op ร่วม 3 ตัว + tools 32)

# C1.1 — Schema `crm_v2_a` + core Teams + partyId everywhere + backfills + seed
Read `crm-brief-COMMON.md` first. Contract: CRM-RUN §2 "C1.1". Spec: blueprint §4.1–§4.6 (+ §15). This is the ONLY work order of phase C1 allowed to touch `prisma/schema/*`.

## Verified facts
- `prisma/schema/crm.prisma` today: `CrmContact` (has `partyId` already), `CrmPipeline`, `CrmStage`, `CrmDeal` (`valueSatang Int`), `CrmActivity`; enums `CrmLifecycleStage` (LEAD PROSPECT CUSTOMER LOST), `CrmStageKind`, `CrmActivityType` (CALL MEETING EMAIL LINE TASK NOTE).
- `MemberSection`/`MemberField` unique today = `[systemId, key]`; NO code uses the compound selector `systemId_key` for them (grep) → the unique can be swapped in ONE migration: `ADD COLUMN "objectKey" TEXT NOT NULL DEFAULT 'customer'` → `CREATE UNIQUE INDEX` on `(systemId, objectKey, key)` → `DROP INDEX` of the old unique. Old code keeps working during the deploy window because it never relies on the index.
- `AutomationScope` = KANBAN · MEMBER_TIER · MEMBER_JOURNEY. `KanbanLinkType` already has `PARTY` and `CRM_CONTACT`.
- partyId: need the column on `Appointment`, `ShopOrder`, `RentalBooking`, `QueueTicket`, `ClinicVisit`; column exists but is never written on `TicketOrder`, `SchoolEnrollment`, `HotelReservation`, `PatientRecord`. `PosSale` gets NO partyId.
- Party facade `src/lib/modules/party/index.ts`: `findOrCreate`, `safeFindOrCreate`, `mergeParties`, `resolveCanonical`, `listBriefsByIds`, `getProfile`, … (no `updateContactInfo` yet — C0.3 adds it).

## In `crm_v2_a` (everything phase C1 needs — later C1 work orders may NOT migrate)
1. Enums (blueprint §4.2): CrmLeadStatus · CrmLifecycleStage +CHURNED · CrmScoreBand · CrmContactRole · CrmForecastCategory · CrmDirection · CrmActivityType +CHAT SMS WHATSAPP VISIT WEB PORTAL · CrmActivitySource · CrmPriority · CrmCompanySize · CrmPipelineKind · CrmVisibility · CustomParent · CustomRecordType · MemberAddressOwner · TeamRole · AutomationScope +CRM · MemberLookupTarget +CONTACT COMPANY DEAL CUSTOM · KanbanLinkType +DEAL COMPANY CUSTOM_RECORD. ⚠️ Postgres: a value added with `ALTER TYPE … ADD VALUE` cannot be USED in the same transaction — do not set defaults to a newly added value in the same migration file.
2. Columns of §4.1 for CrmContact, CrmDeal, CrmActivity, CrmStage, CrmPipeline, MemberSection/Field (`objectKey`, `portalVisible`, `portalEditable`), MemberSavedView (`objectKey`, `teamId`), MemberAddress (`ownerType`, `ownerId`), MemberActivity (`crmContactId`, `crmCompanyId`, `dealId`), AutomationRule (`crmSystemId`, `pipelineId`). All nullable or defaulted.
   - 💰 Decision C28: NEW money columns are `BigInt` (`CrmDeal.paidSatang`, `CrmDeal.wonValueSatang`). `CrmDeal.valueSatang` stays `Int` (changing the type breaks the old client during the deploy window) → services must reject values > 2_000_000_000 satang with a Thai message; record as debt.
   - RESOLUTIONS R-A columns: `CrmContact.previousEmails String[] @default([])`; `CrmPipeline.stageOnQuoteAcceptedId String?`, `stageOnQuoteRejectedId String?`, `autoWonOnPaid Boolean @default(false)`; `CrmDeal.pendingLines Json?`, `pendingApprovalRequestId String?`; composite indexes `CrmDeal(systemId, ownerUserId, kind, expectedCloseAt)` and `CustomRecordValue(fieldId, valueDate)`.
   - add `CrmActivity.pinned Boolean @default(false)` and `mentions String[] @default([])` (decision C19).
3. New tables (§4.3 groups "core", "ตัวตน", "วัตถุกำหนดเอง") + **`CrmVisibilityPolicy`** (moved here — C1.7 needs it) + **`CrmFileLink`** `{id tenantId systemId entityType("CONTACT"|"COMPANY"|"DEAL"|"ACTIVITY"|"RECORD") entityId fileId name size mime uploadedById createdAt; @@index([systemId, entityType, entityId])}` + **`CrmContactConsent`** `{id tenantId systemId contactId channel granted source policyVersion? note? createdAt createdById?; @@index([contactId, channel, createdAt])}` (append-only log; current state = latest row per channel) + `TeamMember.acceptingLeads Boolean @default(true)`.
4. partyId columns (5) + indexes.
5. Register every new model in `src/lib/core/scope.ts` (F1) — Team/TeamMember tenant scope; CRM tables sys scope; child tables via parent.
NOT in `a`: Score*/Assignment/Sequence*/Email*/Tracked*/Web*/`PosSale.dealId`/`FormDef.*` (→ `crm_v2_b`, C2.0) · Quota/Commission*/Portal* (→ `crm_v2_c`, C3.0).

## Code in this work order
- `src/lib/core/teams.ts` (new): create/update/archive, addMember/removeMember/setLead/setAcceptingLeads, `teamsOf(userId)`, `membersOf(teamId)`, `unitIdsOf(teamId)`, list; event `team.updated` (3 registries; consumer = no-op for now). Thai errors; unique name per tenant.
- partyId writers: at the 9 creation sites call the party facade `safeFindOrCreate` with the phone/e-mail the row already has (never throw into the business transaction: wrap, log WARN, leave null). Only ADD the write — do not change any other behaviour of those modules. Add `ALLOWED_EDGES` `<module>→party` where missing.
- `settings.crm` defaults reader with `uiVersion: 1`, `bridgesEnabled: true` (decision C23).
- Backfills `scripts/crm-backfill-*.mts` (idempotent, per tenant, `--dry-run`, refuse prod unless `ALLOW_PROD_BACKFILL=1`): companies-from-text · stage-history-seed · party-links (9 tables) · contact-name-split · lost-reasons-seed · visibility-default.
- Seed: `scripts/seed-crm-qc.mts` fills the new tables per `scripts/crm-qc-env.mts`.

## Files you own
`prisma/schema/*.prisma` + the new migration folder · `src/lib/core/teams.ts` · `src/lib/core/scope.ts` · the 9 partyId write sites (single hunk each) · `scripts/crm-backfill-*.mts` · `scripts/seed-crm-qc.mts` · registries for `team.updated` · `scripts/fitness.mts` ALLOWED_EDGES lines.

## Acceptance
Oracle `scripts/qc-crm-c1.1.mts` (26 functional + additions from C0.1) fully green. Controller reads the migration SQL line by line: only `CREATE TYPE/TABLE/INDEX`, `ALTER TYPE … ADD VALUE`, `ALTER TABLE … ADD COLUMN` (nullable/default), and the ONE `DROP INDEX` of the old MemberSection/MemberField unique, placed AFTER the new unique is created.
X-groups: X1 teams are tenant-scoped (other tenant → not found) · X3 backfills run twice = same result; two backfills in parallel = no duplicates (companies-from-text uses a lock or unique) · X8 partyId writers never log phone/e-mail · others N/A.
Regressions: `qc-member-m1.2` `m1.3` `m1.4` `m1.5` `m1.9` `m3.9`, `qc-member-fix-s1`, `qc-crm`, `qc-crm-activity`, the suites of the 9 touched modules (`qc-booking-*`, `qc-shop`, `qc-rental*`, `qc-queue-public`, `qc-clinic*`, `qc-ticket-*`, `qc-school*`, `qc-hotel-*`), `qc-migrate-status` is prod-facing — do NOT run it.

## Controller addendum 2026-09-18 (verified against `session/crm` @ `ee3beca`, after phase C0 closed)

### 🔴🔴 READ FIRST — how to touch Prisma in this work order (anything else can hit PRODUCTION)
- **Every Prisma CLI command goes through `bash scripts/iso.sh bash scripts/qc-prisma.sh <args>`.** Without it,
  `prisma.config.ts` loads `.env` (= production) because `iso.sh` passes no DB variables into its unit, and
  `prisma migrate …` would run against production. The wrapper sets `DIRECT_URL`/`DATABASE_URL` from `.env.qc`, and
  exits 4 if the host is production or not the QC branch. (Details + proof: `ledger/CRM-RUN.md` §4, 18 ก.ย.)
- **`migrate dev`, `migrate reset`, `db push`, `db execute`, `migrate resolve` are refused by the wrapper.** `migrate dev`
  once tried to RESET the shared QC schema (`ledger/wo-notes/kanban-K3.5.md` §3.5). The procedure is:
  1. edit `prisma/schema/*.prisma`;
  2. `bash scripts/iso.sh bash scripts/qc-prisma.sh migrate diff --from-config-datasource --to-schema prisma/schema --script > /tmp/…`
     (or write to a scratch path under the worktree), review it, then save it as
     `prisma/migrations/<timestamp>_crm_v2_a/migration.sql` (the oracle's guard looks for a folder ending `_crm_v2_a`);
  3. STOP and report the SQL to the controller — **the controller reads every line before it is applied anywhere**;
  4. only after the controller's go: `bash scripts/iso.sh bash scripts/qc-prisma.sh migrate deploy` (QC only);
  5. `pnpm prisma generate` (does not touch a database; may run directly).
- 🔴 **Pushing this work order to main applies the migration to PRODUCTION** (`scripts/vercel-build.sh` runs
  `prisma migrate deploy` in the Vercel build). Old code keeps serving on the migrated DB during the build. Hence:
  strictly additive; every new column nullable or defaulted; the ONE `DROP INDEX` of the old
  `MemberSection`/`MemberField` unique placed AFTER the new unique is created.

### Facts re-verified today
1. **The unique swap is safe.** The only `systemId_key` compound selector in the whole codebase is on
   `prisma.accountMapping` (`src/lib/modules/account/coa.ts:359`) — an unrelated model. Nothing uses it for
   `MemberSection`/`MemberField`, both of which are `@@unique([systemId, key])` today (`member.prisma`). Because every
   existing row gets `objectKey = 'customer'`, the new `(systemId, objectKey, key)` unique cannot fail on data that
   already satisfies the old one.
2. **The nine partyId write sites — exactly one `create` each** (use these, single hunk per site):
   `booking/service.ts:624` Appointment · `shop/service.ts:150` ShopOrder · `rental/service.ts:155` RentalBooking ·
   `queue/service.ts:143` QueueTicket · `clinic/service.ts:135` ClinicVisit · `clinic/service.ts:51` PatientRecord ·
   `ticket/service.ts:259` TicketOrder · `school/service.ts:178` SchoolEnrollment · `hotel/service.ts:293` HotelReservation
   (line numbers as of `ee3beca`). **None** of these eight modules has an `ALLOWED_EDGES` entry `<module>→party` yet —
   add all eight, each with a one-line reason.
3. **All 23 regression suites of those modules load the guarded QC env** (`loadQcEnv`/`loadLegacyQcEnv`, which kill the
   script on a production host) — safe to run. `qc-migrate-status` reads PRODUCTION — do NOT run it.

### Decisions carried in from phase C0 (they bind this work order)
- **`src/lib/modules/crm/settings.ts` + `getCrmSettings({ tenantId, systemId })` are created HERE**, not in C1.5
  (controller decision recorded in `ledger/CRM-RUN.md` §4; C1.5 extends it). Defaults: `uiVersion: 1`,
  `bridgesEnabled: true`. The oracle's S8.1/S8.2 read the value through this getter for a system with empty settings.
  Reads only in this work order; writes use the single-statement `jsonb_set` pattern when C1.5 adds them.
- **The QC seed must create the business rows the oracle's S5.6/S5.7 demand** — contract `CQC.businessRows` in
  `scripts/crm-qc-env.mts`: 2 rows per table in all 9 tables, each tagged `rowTagOf(table, j)` as a
  whitespace-delimited token in the table's `tagColumn`, carrying the phone of QC contact `contactIndexOf(table, j)`
  (ClinicVisit through its PatientRecord). This needs the QC tenant to have SHOP/RENTAL/QUEUE/CLINIC/TICKET/SCHOOL/HOTEL
  systems → extend `CQC.extraSystems`. **You therefore also own `scripts/crm-qc-env.mts`** for this change only.
  Keep the seed's self-check (members = 60, `source: "CRM"` = 0, `crm.deal.won` = 0) intact, and remember the
  lesson from C0.1: a seed builds STATE, it must not fire business events that other modules react to.
- **Do NOT add a unique index on `AccountContact(systemId, partyId)`** even though C0.3's builder suggested it:
  production may already contain duplicates (the very race C0.3 closed), and a unique index that fails in
  `migrate deploy` turns the Vercel build red and blocks the deploy. Recorded as debt: it needs a read-only duplicate
  count on production first (C6.1).
- **Add `EMAIL` to `PartyMergeReason`** (C0.3 found e-mail collisions are recorded as `NAME_SIMILAR` for lack of it).
  `ALTER TYPE … ADD VALUE` is additive; do not use the new value as a default in the same migration.
- `CrmDeal.valueSatang` stays `Int` (decision C28) — record the ฿20 M/deal cap as debt; the rejecting guard belongs
  to C1.5's deal service.
- Q5 (rehearse on a Neon copy of production) is **unanswered** → default applies: additive-only + controller reads the
  SQL line by line. If the owner answers "yes" before this work order is pushed, the controller rehearses first.

### Files you own (final list)
`prisma/schema/*.prisma` + the new `prisma/migrations/*_crm_v2_a/` · `src/lib/core/teams.ts` (new) ·
`src/lib/core/scope.ts` · `src/lib/modules/crm/settings.ts` (new) · the 9 write sites above (single hunk each) ·
`scripts/crm-backfill-*.mts` (6 new) · `scripts/seed-crm-qc.mts` · `scripts/crm-qc-env.mts` (extraSystems + business
rows only) · the `team.updated` lines in the 3 registries (`// CRM C1.1 ▸ … ◂` blocks) · the `ALLOWED_EDGES` lines.

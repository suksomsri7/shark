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

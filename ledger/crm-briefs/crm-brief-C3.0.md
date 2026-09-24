# C3.0 — Migration `crm_v2_c` (all tables of phase C3)
Read `crm-brief-COMMON.md` first. Spec: blueprint §4.3 groups "ทีมขาย", "portal" + §15 (C15).

Tables: `CrmQuota`, `CrmCommissionRule`, `CrmCommission` (amounts `BigInt`; unique `[dealId, ruleId, userId, refId]`), `CrmPortalAccess` (+ `inviteTokenHash`, `inviteExpiresAt`), `CrmPortalRequest`. Columns: `HrPayAdjustment.crmCommissionId String?`; **customer session for the portal (C15)**: `CustomerSession` += `subjectType String @default("MEMBER")` (`"MEMBER" | "CRM_CONTACT"`), `crmContactId String?`, `crmSystemId String?` — VERIFIED: `CustomerSession.customerId` is NOT NULL, so do NOT alter that table: add the sibling table `PortalSession` (same columns, `portalAccessId`, `crmContactId`, `crmSystemId`) per RESOLUTIONS R-C.5. `CustomerOtp` reused as is (target = e-mail/phone). Report schedules need NO table (RESOLUTIONS R-E.6: `settings.crm.reportSchedules[]`).
Acceptance (oracle `qc-crm-c3.0`): applies on QC; scope registry; additive SQL only; `qc-member-m2.9`, `qc-member-m3.11`, `qc-member-fix-s1`, `qc-payroll`, `qc-hr-payadjust` green.

## Addendum (oracle author) — 24 ก.ย. 2569 · `scripts/qc-crm-c3.0.mts` (33 ข้อ)

The brief named the tables; the oracle had to encode their **exact columns, types, defaults, uniques and indexes** (it reads the live QC
database, not the SQL text, so a hand-written migration and a `prisma migrate diff` one are judged the same way). Everything below is
**oracle-proposed — controller to confirm**; a different ruling ⇒ ORACLE-EDIT the named check before the builder starts.

1. **Six new enums** (blueprint §4.2, all brand new ⇒ **no `ALTER TYPE … ADD VALUE` anywhere in `crm_v2_c`**): `CrmQuotaOwner{USER,TEAM}` ·
   `CrmCommissionBasis{PAID,WON}` · `CrmCommissionKind{PCT,FIXED,TIERED}` · `CrmCommissionStatus{PENDING,APPROVED,PAID,REVERSED,REJECTED}` ·
   `CrmPortalRole{VIEW,APPROVE,PAY,ADMIN}` · `CrmPortalRequestKind{ISSUE,CONTACT_CHANGE,PROFILE_CHANGE,DOCUMENT_REQUEST}` (S2.1).
   `CrmVisibility` and `CrmVisibilityPolicy` already exist from `crm_v2_a` — phase C3 adds nothing there.
2. **Six new tables** (S3.1–S3.6, full column specs in `NEW_TABLES` of the oracle): `CrmQuota` · `CrmCommissionRule` · `CrmCommission` ·
   `CrmPortalAccess` · `CrmPortalRequest` · `PortalSession`. Model name = table name, no `@@map` (S4.1).
3. 🔴 **`CrmCommission.refId` is `text NOT NULL DEFAULT ''`, not nullable.** The brief's unique `[dealId, ruleId, userId, refId]` does
   NOT dedupe anything while `refId` is NULL (Postgres treats NULLs as distinct), so a replayed `invoice.paid` or two parallel consumers
   would insert two commission rows and **pay the rep twice** — exactly what C3.3's X3/X4 acceptance forbids. `''` means "no ref" (the
   WON-basis rows). `C3.0-X4.1` fails if it is nullable. *Alternative if the controller prefers the blueprint's `refId?`: keep it nullable
   and add a SECOND partial unique `(dealId, ruleId, userId) WHERE refId IS NULL` — then ORACLE-EDIT X4.1.*
4. **Money is BigInt (`int8`) everywhere**: `CrmCommission.amountSatang` / `.basisSatang`, `CrmQuota.targetSatang`,
   `CrmCommissionRule.minDealSatang` (X3.1). Counters/flags carry constant defaults: `splitCollaboratorsBp` 0 · `payoutDelayDays` 0 ·
   `sortOrder` 0 · `active` true · `CrmCommission.status` PENDING · `CrmCommissionRule.basis` PAID.
5. **`PortalSession` shape** (R-C.5 · C15 revised): `tenantId · portalAccessId · crmContactId · crmSystemId · tokenHash (UNIQUE) ·
   userAgent? · ipHash? · expiresAt · revokedAt? · createdAt`, indexes `(portalAccessId)` and `(tenantId, expiresAt)`.
   🔴 **It keeps `ipHash`, not the `ip` column its model `CustomerSession` has** — the X8 rule for new tables (the `CrmWebSession.ipHash`
   precedent of C2.0) beats symmetry with an older table. `crmContactId` and `crmSystemId` are **NOT NULL** (X1.1).
6. **`CrmPortalAccess` invite**: `inviteTokenHash text?` **UNIQUE** + `inviteExpiresAt DateTime?` (single-use, hashed, 7-day window of
   C3.5) · `loginMethods text[] NOT NULL DEFAULT '{}'` · unique `(companyId, contactId)` · index `(contactId)` · `revokedAt?` is what
   "revoke kills the sessions" reads. No plaintext `*Token` column anywhere in the six tables (X7.1).
7. **The ONE column on an existing table**: `HrPayAdjustment.crmCommissionId text NULL` (no default) **+ a PARTIAL UNIQUE
   `("crmCommissionId") WHERE "crmCommissionId" IS NOT NULL`** so one commission can never be paid through two payroll adjustments. It is
   safe on prod precisely because the column is added in the same migration without a default (every existing row is NULL ⇒ the index is
   empty). **No foreign key**: HR must not depend on the CRM module, and a soft link survives a deleted/reversed commission row (S3.7).
8. **No FK from `CrmCommission.dealId` to `CrmDeal`** either — `deals.deleteDeal` is a real danger op, and a cascade would delete paid
   commission history. FKs are used only inside the portal chain where a cascade is what PDPA erase wants. *oracle-proposed.*
9. **The NOT-ADDED list, asserted against the live DB** (S3.8 · S1.8): `CustomerSession` untouched (no `subjectType`/`crmContactId`/
   `crmSystemId` — R-C.5) · `ReportDef` gets no schedule/recipient column (R-E.6: `settings.crm.reportSchedules[]`) · `MemberSavedView`
   untouched (`objectKey`/`teamId` came with `crm_v2_a`) · no `PosSale.dealId` (C29) · no full unique `AccountContact(systemId, partyId)` ·
   no unique involving `CrmCompanyContact.isPrimary`.
10. **`crm_v2_c` may touch exactly ONE existing table: `HrPayAdjustment`.** Anything else that shows up in an `ALTER TABLE` fails S1.8.
11. **Statement whitelist** (S1.3): CREATE TYPE · CREATE TABLE · CREATE [UNIQUE] INDEX · ALTER TABLE ADD COLUMN · ALTER TABLE ADD
    CONSTRAINT FOREIGN KEY **on a new table only**. No DROP/RENAME/ALTER COLUMN/CHECK/data statement/trigger/function/view. The three
    `T0.x` self-tests prove the parser on synthetic SQL (a GOOD sample with 0 violations and 11 BAD statements each caught by its own
    rule) — they are green even with the migration absent, so a red S1.x can never be a parser bug.
12. **Schema ↔ DB in sync** (S1.9): the oracle runs
    `bash scripts/qc-prisma.sh migrate diff --from-config-datasource --to-schema prisma/schema --script` and requires an EMPTY migration —
    nothing drifted and nothing was applied by hand. (`migrate dev`/`reset`/`db push` are refused by that wrapper, as CRM-RUN §4 demands.)
13. **Scope registry** (S4.2): all six models in `src/lib/core/scope.ts` — `sys()` for the five with `systemId`, plain `tenant` for
    **`PortalSession`** (its CRM system lives in `crmSystemId`, which is not the scope column). F1 + F8 are spawned in S4.3.
14. **v1 safety** (S5.1/S5.2): `CustomerSession.customerId` must still be NOT NULL (the fact that created `PortalSession` in the first
    place) and `HrPayAdjustment.amountSatang`/`.kind` keep type+nullability; a payroll-shaped INSERT naming only pre-C3.0 columns still
    succeeds — probed inside a transaction that is rolled back, so the oracle writes nothing (CLEAN).

### Things that would need **C6.1**, not C3.0 (record them, do not sneak them in)
- Any UNIQUE / NOT NULL / CHECK / FK that must hold over **existing prod rows**: the unique `AccountContact(systemId, partyId)` · the
  "one current primary contact per company" unique on `CrmCompanyContact` (ruling R1 of C2.0) · making any older nullable column NOT NULL.
- A FK from `HrPayAdjustment.crmCommissionId` to `CrmCommission` (if the controller ever wants one) — validation reads the whole table.
- Backfills: `crm-backfill-*` scripts and the prod duplicate counts that must precede any of the constraints above
  (`ALLOW_PROD_BACKFILL=1 … --dry-run` first, C6.2).
- The production crontab line for `scripts/crm-cron.mts` (C6.1, needs the owner's OK) — unrelated to the schema but the same gate.

### Regressions the controller runs with this file
`qc-member-m2.9` · `qc-member-m3.11` · `qc-member-fix-s1` (customer sessions / OTP — the portal must not have disturbed them) ·
`qc-payroll` · `qc-payroll-reverse` · `qc-hr-payadjust` · `qc-hr` (the one column on `HrPayAdjustment`) · `qc-crm-c2.0` (the previous
migration oracle still green) · every `qc-crm-c1.*` / `qc-crm-c2.*` · `qc-pages` (`/p/[slug]` untouched) · `pnpm fitness` in both modes
(F1 scope registry · F8 every model in a migration) · `qc-member-m1.9` (30/15/10/5) · and, after the controller's reseed,
`seed-member-qc` → `seed-crm-qc` must still run clean.

## Controller ruling (24 ก.ย. 2569 · Fable 5.1 · binding — เคาะ addendum 1–14 ก่อน spawn builder C3.0)
- **CONFIRMED ทั้ง 14 ข้อ**: `CrmCommission.refId text NOT NULL DEFAULT ''` (unique `[dealId, ruleId, userId, refId]` ต้อง dedupe ได้จริง — NULL ทำให้จ่ายซ้ำ) · `HrPayAdjustment.crmCommissionId` nullable + partial unique `WHERE NOT NULL` + **ไม่มี FK** (HR ไม่พึ่ง CRM · ปลอดภัยกับแถว prod เดิมเพราะเป็น NULL ทั้งหมด) · `PortalSession.ipHash` (ไม่เก็บ ip ดิบ) · `crmContactId/crmSystemId NOT NULL` · scope แบบ tenant · ไม่มี FK `CrmCommission.dealId → CrmDeal` (ลบดีลห้ามล้างประวัติค่าคอม) · เงิน int8 satang · `inviteTokenHash` unique + `inviteExpiresAt` 7 วัน · enum ใหม่ 6 ตัว (ไม่มี ADD VALUE) · ตารางใหม่ 6 · แตะตารางเดิมได้ตัวเดียว (`HrPayAdjustment`)
- ของที่เป็นของ C6.1 ตามรายการท้าย addendum (UNIQUE/NOT NULL/FK บนแถว prod เดิม · backfill · crontab) — ห้ามหลุดเข้า C3.0
- 🔴 ผู้คุมงานอ่าน SQL ทุกบรรทัดก่อน `migrate deploy` (QC1/QC2/QC3 โดยผู้คุมงาน · prod โดย vercel-build) · builder C3.0 ห้าม deploy เอง

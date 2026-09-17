# C2.0 — Migration `crm_v2_b` (all tables of phase C2) — the only C2 work order that may touch `prisma/schema/*`
Read `crm-brief-COMMON.md` first. Spec: blueprint §4.3 groups "คะแนน · มอบหมาย · อัตโนมัติ", "อีเมล", "ติดตาม" + §15.

## Contents
- Tables: `CrmScoreRule`, `CrmScoreLog`, `CrmAssignmentRule`, `CrmSequence`, `CrmSequenceStep`, `CrmSequenceEnrollment` (+ `version Int @default(1)` on Sequence and `sequenceVersion` on Enrollment for "edit = new version"; + `leaseUntil DateTime?` for X5), `CrmEmailMessage` (+ `leaseUntil`), `CrmEmailEvent`, `CrmEmailTemplate`, `CrmEmailUserSetting`, `CrmMailProvider` (skeleton), **`EmailDomain`** `{id tenantId domain status("PENDING"|"VERIFIED"|"FAILED") providerId? records Json? verifiedAt? createdAt; @@unique([tenantId, domain])}`, `CrmTrackedLink`, `CrmTrackedClick`, `CrmWebSession`, `CrmWebEvent`, **`CrmDealPayment`** `{id tenantId systemId dealId refType("INVOICE"|"POS_SALE"|"PAYMENT") refId satang BigInt status("LINKED"|"COUNTED"|"REVERSED") countedAt? reversedAt? createdAt; @@unique([dealId, refType, refId])}` — this row is BOTH the POS↔deal link and the idempotency flag of `recordPayment` (decision C29: **no `PosSale.dealId` column** — `PosSale` is a hot table and already has `sourceModule/sourceId`), **`CrmUserPref`** `{id tenantId systemId userId notifications Json quietHours Json? ; @@unique([systemId, userId])}` (decision C22).
- Columns: `FormDef` (tenant-scoped model) += `crmSystemId String?`, `assignRuleId String?`, `utmCapture Boolean @default(true)`, `scoreOnSubmit Int?`, `createCompanyFromField String?`, `spamGuard Json?`; `FormSubmission` += `utm Json?`, `pageUrl String?`, `referrer String?`, `webSessionId String?`. `CrmContact.trackingOptOut Boolean @default(false)`.
- Dropped from the old plan: `MktRecipient.emailMessageId` (member campaigns keep their own pixel at `/api/m/track/o/*`; ROI uses `sourceDetail.campaignId`).
- Scope registry (F1) for every model. No enum value is both added and used as a default in this migration.

## Acceptance (oracle `qc-crm-c2.0`)
migration applies on QC; every model in scope registry; SQL reviewed by the controller: CREATE/ADD only; existing suites unaffected.
Regressions: `qc-form`, `qc-forms-notify`, `qc-marketing`, all C1 oracles, `qc-member-m1.2`.

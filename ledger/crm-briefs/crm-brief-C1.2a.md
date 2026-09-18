# C1.2a — Custom-fields engine learns `objectKey`
Read `crm-brief-COMMON.md` first. Contract: CRM-RUN §2 "C1.2" (engine half). Spec: blueprint §5.1, §5.8, §11.2.

## Verified facts — `src/lib/modules/member/fields.ts` (hard-bound to Customer today)
Exports: `normalizeFieldOptions`, `checkFieldValue(field, raw)`, `createSection/updateSection/reorderSections/deleteSection`, `createField/updateField/archiveField/restoreField/reorderFields`, `listLayout(ctx, opts, tx?)`, `getFieldValues(ctx, customerIds[], tx?)`, `setFieldValues(ctx, customerId, values, opts, tx?)`, `fieldFilterWhere(ctx, filters, tx?) → Prisma.CustomerWhereInput`, `applyTemplate(ctx, templateKey, opts, tx?)`. `ctx = { tenantId, systemId, actorUserId }`. `MemberFieldValue.customerId` is a real FK; `MemberField.systemKey` maps to Customer columns. There are NO functions named validate/layout/filterWhere — use the real names.

## Deliverables
- Every function above accepts `objectKey` (in `opts` or `ctx` — pick one style and use it everywhere; default `"customer"`). With the default, behaviour and results are byte-identical to today (this is the main risk of the work order).
- For `objectKey !== "customer"`: layout rows are filtered by `objectKey`; values read/write `CustomRecordValue` (`recordType` CONTACT | COMPANY | DEAL | CUSTOM, `recordId`) with history in `CustomRecordValueHistory` when the field has `trackHistory`; `fieldFilterWhere` returns a where-fragment for the right table (CrmContact / CrmCompany / CrmDeal / CustomRecord) implemented as `id IN (subquery on CustomRecordValue)` per filter — all types (TEXT, NUMBER, DATE, SELECT, MULTI, BOOL, LOOKUP).
- System fields per object (`isSystem` + `systemKey` → column of CrmContact/CrmCompany/CrmDeal): contact 14, company 12, deal 12 (list in blueprint §11.2) — seeded by `applyTemplate(objectKey, "system")`.
- Limits: 60 fields/object, ≤20 filterable/object; LOOKUP to another custom object via `options.objectKey`, no self-cycle.
- `sensitive` fields keep policy D8: any reader of values for a non-customer object passes the actor and the engine drops/blank sensitive values unless `evaluateSensitiveAccess` allows (same rule the S1 fix applied to list/export).
- Facade: expose through `src/lib/modules/member/index.ts` a `fields` namespace other modules may call; add `ALLOWED_EDGES` `crm→member` (reason: shared field engine, decision C13).

## Files you own
`src/lib/modules/member/fields.ts` · `fields-shared.ts` (if present) · `src/lib/modules/member/index.ts` (exports only) · `scripts/fitness.mts` edge line.

## Acceptance (oracle `qc-crm-c1.2a`)
Functional S1 (layout per object), S3 (filterWhere all types on contact + custom record), S4 (history), plus: G1 default-objectKey golden test — run the member oracles below unchanged. 
X1 a field/section of another CRM system or tenant is invisible · X3 two parallel `setFieldValues` on the same record+field leave exactly one value row and ordered history · X6 value length caps, SELECT option must exist, URL fields http/https only · X8 sensitive values dropped for an actor without access and an access-log row written when shown.
Regressions (must be identical counts): `qc-member-m1.2` `m1.3` `m1.5` `m1.6` `m1.7` `m3.9`, `qc-member-fix-s1`.

## Controller addendum 2026-09-18 (verified @ `80385c9`, after `crm_v2_a` is live)
- Real names confirmed in `src/lib/modules/member/fields.ts`: `normalizeFieldOptions` :176 · `checkFieldValue` :421 · section CRUD :664–742 · field CRUD :772–947 · `listLayout` :975 · `getFieldValues` :1003 · `setFieldValues` :1101 · `fieldFilterWhere` :1438 · `applyTemplate` :1498. `FieldCtx = { tenantId, systemId, actorUserId }` (:31). There is no `fields-shared.ts`; shared types live in `src/lib/modules/member/field-types.ts` (C1.1 added lookup labels there).
- **Style (RESOLUTIONS R-E1, binding): `FieldCtx.objectKey?: string`, default `"customer"`.** One style everywhere — not an `opts` field.
- **Which system owns a non-customer field: the CRM system.** Fields/sections with `objectKey !== "customer"` are rows of `MemberSection`/`MemberField` whose `systemId` is the **CRM** system's id (the C1.1 oracle S2.2 already asserts the MEMBER system holds only `objectKey = "customer"` rows). So `ctx.systemId` is the member system for `"customer"` and the CRM system for every other objectKey; the engine must re-resolve the system by tenant + type (MEMBER for customer, CRM otherwise) and never trust a mismatched pair — that is X1 ("field of another CRM system is invisible").
- `ALLOWED_EDGES` `crm→member` already exists (`scripts/fitness.mts:403`, added in C0.3) — do not add it again.
- `evaluateSensitiveAccess` is at `src/lib/modules/member/privacy.ts:86` — reuse it for the D8 rule on non-customer objects; no second policy engine.
- `crm_v2_a` is applied (QC + production): `MemberSection.objectKey` · `MemberField.objectKey/portalVisible/portalEditable` · `CustomRecordValue` · `CustomRecordValueHistory` · unique `(systemId, objectKey, key)` all exist.
- **Files you own (final):** `src/lib/modules/member/fields.ts` · `src/lib/modules/member/field-types.ts` · `src/lib/modules/member/index.ts` (exports only).

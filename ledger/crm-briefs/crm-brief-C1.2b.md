# C1.2b — Custom objects service
Read `crm-brief-COMMON.md` first. Contract: CRM-RUN §2 "C1.2" (objects half). Spec: blueprint §5.8, §11.2, decision C8.

## Deliverables — `src/lib/modules/crm/objects.ts` (+ `objects-shared.ts`)
`create/update/archive/restore/reorder/list` objects · `records.create/update/archive/get/list/move/bulk/import/export` · `tabsFor(parentType, parentId)` · `timelineFor(recordId)` · 8 object templates (data only, blueprint §10: สัตว์เลี้ยง · รถ · ทรัพย์สิน/เครื่องจักร · สัญญา · กรมธรรม์ · อสังหาฯ · โครงการ · ผู้เรียน; each carries one disabled "date field due" starter-rule spec that C2.1 materialises). Uses the engine from C1.2a for fields/values; `title` from `titleFieldKey`; `partyId` inherited from the parent; `recordCount` cache; key immutable once records exist; parentType immutable once records exist; archive with records requires typing the key; no hard cap on number of objects — warn (OpsEvent WARN + settings banner flag) at > 30 objects or > 200,000 records/object.
Events `custom.record.created/updated/archived` (3 registries; consumer writes the parent's `MemberActivity` row; ids only in payload).

## Files you own
`src/lib/modules/crm/objects.ts`, `objects-shared.ts`, `src/lib/modules/crm/templates/objects/*` (new), crm `index.ts` exports, the three registries for the 3 events.

## Acceptance (oracle `qc-crm-c1.2b`)
CRM-RUN S1, S2, S5, S6, S8 (+S3 on records).
X1 object/record of another tenant, of ANOTHER CRM SYSTEM of the same tenant → not found; parent of the wrong type/system → validation · X3 `recordCount` exact after 10 parallel creates + 5 parallel archives · X4 the record-created consumer run twice (and twice in parallel) writes one timeline row · X6 import caps (rows/size), CSV export through `csvRow` · X9 archive-with-records and bulk ops need confirm + reason at the action/op layer (expose the flag now; REST wiring is C1.10).
Regressions: C1.2a oracle, `qc-member-m1.2`.

## Controller addendum 2026-09-18
- Depends on C1.2a's contract: `FieldCtx.objectKey` (default `"customer"`), non-customer fields owned by the CRM system (see the C1.2a addendum). The objects service calls the engine only through the member facade (`src/lib/modules/member/index.ts` `fields` namespace).
- Tables exist (`crm_v2_a`): `CustomObject` (`recordCount Int @default(0)`, `titleFieldKey`, `showAsTab`, `templateKey`, `unitScoped`, unique `(systemId, key)`), `CustomRecord` (`parentType/parentId/partyId/status`), `CustomRecordValue`, `CustomRecordValueHistory`.
- `recordCount` must be maintained with single-statement increments/decrements (X3 — "read → compute in app → write" is forbidden).
- Events `custom.record.created/updated/archived`: idempotency keys `custom.record.<type>#<recordId>#<seq>` (R-C.8), payload ids only, emitted INSIDE the write transaction; consumer writes the parent's `MemberActivity` row idempotently (X4); CRM consumers follow the `compose` "extra" contract.
- Scope rule carried from C1.1's review: a `CustomRecord`'s parent (CONTACT/COMPANY/DEAL) MUST belong to the same CRM `systemId` — assert it, the DB does not.

### Controller rulings on the oracle's questions (2026-09-18)
1. **Parent without a linked member → the created-consumer writes NO timeline row and does not throw** (`MemberActivity.customerId` is NOT NULL). CRM-only timelines are `CrmActivity`'s job (C1.6/C1.8), not `MemberActivity`'s. Oracle X4.3 stands.
2. **The ">30 objects" warning is counted per CRM system**, not tenant-wide (S8.2).
3. **confirm + reason (≥5 chars) are required for: archiving an object that has records, and `records.bulk`.** Not for single-record archive; `import` is governed by its caps (X6) instead.
4. The oracle's stricter-than-brief checks are ACCEPTED as the contract: key rename before records carries its fields (S9.1) · reserved keys `customer|contact|company|deal` refused (S9.5) · unknown filter key = VALIDATION, never "return everything" (S3.7) · title recomputed on update (S2.3) · every update gets a distinct idempotency `<seq>` (S12.3).
5. The oracle's rollback checks (S12.5–S12.7) install a temporary trigger on the shared `OutboxEvent` table, scoped to its own throwaway tenant id and dropped in `finally` (stale ones dropped at start). Accepted: even if a run is killed, the trigger can only fire for a tenant that no longer exists.
6. API contract for the builder = the shapes listed in the oracle writer's report, reproduced in the header of `scripts/qc-crm-c1.2b.mts` — the builder implements those names and signatures.

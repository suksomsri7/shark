# C1.3 — Companies (service + list + 360)
Read `crm-brief-COMMON.md` first. Contract: CRM-RUN §2 "C1.3". Spec: blueprint §5.3, §3.4 (mockup `ledger/design-crm/04-company-360.png`), §11.1.

## Facts
Party kinds are PERSON | COMPANY; `findOrCreate` matches tax id → name+domain. Account facade after C0.3 offers `ensureAccountContact(partyId)`, `outstandingByContacts`, `listDocsByParty`, `mergeContacts`. `visibleWhere` does not exist until C1.7 — build every read through ONE local helper `companyWhere(ctx, actor)` that C1.7 will replace (no scattered where-clauses).

## Deliverables
`src/lib/modules/crm/companies.ts` (§5.3 complete: create/update/archive/setOwner/setParent · getCompany360 · listCompanies with all filters + `f.{key}` via the field engine · addContact/removeContact/setPrimary/setRole (exactly one primary; `CrmContact.companyId` cache written only here) · findDuplicates/mergeCompanies · importCompanies/importFromAccount · recomputeCaches) · actions file · pages `/companies`, `/companies/[companyId]`, `/companies/new` · events `crm.company.created/updated/merged` (3 registries) with consumer → `ensureAccountContact` + timeline row.

## Files you own
`src/lib/modules/crm/companies*.ts` · `src/app/app/sys/[id]/crm/companies/**` · `src/components/crm/company/**` · registries for the 3 events · crm `index.ts` exports · inventory rows.

## Acceptance (oracle `qc-crm-c1.3`)
CRM-RUN S1–S7 (26).
X1 other tenant / other CRM system company → 404 on get, update, addContact, merge (both ids must be in scope) · X3 `openDealCount`/`wonValueSatang` caches exact after parallel deal events (increment/decrement or recompute under lock — no read-modify-write); two parallel `setPrimary` leave exactly one primary · X4 `crm.company.created` consumer twice/parallel → one AccountContact · X6 website/URL http(s) only, tax id normalised, import caps, CSV via `csvRow` · X8 no e-mail/phone in event payloads or logs · X9 merge + archive = danger semantics (confirm + reason), audit rows.
Parity: owner + thana at 1440 and 390.
Regressions: `qc-acc-v2-party`, `qc-acc-v2-contacts`, `qc-acc-v2-contact-merge`, C1.1–C1.2b oracles.

## Controller addendum (18 Sep · oracle `caa27f0`, 89 checks)
The oracle writer's contract block (in `scripts/qc-crm-c1.3.mts` header / CRM-RUN §4) is the API. Rulings on its questions — binding:
1. **isPrimary** = "the company's one primary contact" (blueprint + mockup). `CrmContact.companyId` cache = the company of the contact's current *primary* link, else its most recent current link, else null; never a merged/archived company. Recompute it (only in companies*.ts) whenever a link of that contact changes.
2. **Account system** = the CRM system's enabled, non-archived `AccountSystemLink{linkedKind:"CRM"}`. If the account facade lacks a helper, add ONE read-only function to the account facade (`accountSystemForCrm`) — report the ALLOWED_EDGES line, I apply it.
3. **AccountContact on rename**: Party is the source of truth; ALSO update the live AccountContact name/taxId through an account facade function if one exists, else record as debt for C1.4 (issued documents keep their frozen snapshots either way). Not asserted by the oracle.
4. **Party.taxId**: add a party facade function (`updateCompanyIdentity(partyId, {name, taxId})`) inside the same tx; report the edge.
5. `objects.ts` direct CrmCompany reads → debt for C1.7 (fold into `companyWhere`).
6. Created-consumer timeline row = **CrmActivity** (companyId, source ≠ MANUAL) — MemberActivity needs a customer.
7. Merge semantics as the oracle picked (row kept with `mergedIntoId`+`archivedAt`, reasons in audit).
8. Tax id: 13 digits + mod-11 check digit.
9. `--force-run` stays (controller tool).
From the C1.2a review: governed company columns (`name`, `taxId`, `branchCode`, `ownerUserId`, `parentCompanyId`, caches) are refused by the field engine (`GOVERNED_CRM_SYSTEM_KEYS`) — the service writes them itself, then calls the engine for plain keys only. If the service row-locks/updates the company in the same tx as an engine write, call `lockRecordForFieldWrite(tx, id)` FIRST. Seed the company system fields (`applySystemTemplate`) when the CRM system is created if not already present. `CrmFileLink`/child rows: assert both parents share the same `systemId`.

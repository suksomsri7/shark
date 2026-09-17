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

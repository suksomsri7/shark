# C1.9 — Custom objects UI
Read `crm-brief-COMMON.md` first. Contract: CRM-RUN §2 "C1.9". Spec: blueprint §3.6 (mockup 06), §11.2.

## Facts
The member field designer is `src/components/member/FieldDesigner.tsx` (dnd-kit) with its page under the member settings; it must gain an "object:" switcher without changing the member experience when the object is `customer`.

## Deliverables
`/settings/objects` (list: bound to · count · fields; add-object modal: singular/plural label, parent type (5), title field, show-as-tab, portalVisible, template picker 8) · field designer with object switcher (contact / company / deal / each custom object) · `/objects/[key]` (table, FilterBar incl. `f.{key}`, saved views `objectKey=<key>`, import) · `/objects/[key]/[recordId]` (layout, timeline, files block from C1.6, notes) · tab in contact/company/deal 360 AND in member 360 for objects bound to CUSTOMER · archive/restore flows with key confirmation.

## Files you own
`src/app/app/sys/[id]/crm/settings/objects/**`, `objects/**` · `src/components/crm/objects/**` · the object-switcher prop in `FieldDesigner.tsx` and its member page (smallest edit) · tab slots in the four 360 pages.

## Acceptance (oracle `qc-crm-c1.9` + visual spec)
CRM-RUN S1–S5 (18).
X1 tabs/records obey visibility of the PARENT (thana does not see records of krabi companies) · X6 key format `^[a-z][a-z0-9_]{1,30}$`, reserved keys rejected (customer, contact, company, deal) · X9 archive with records = typed confirmation.
Parity: mockup 06 owner × 2 sizes + member 360 shows the custom tab.
Regressions: `qc-member-m1.3` (designer), `qc-member-m1.5`, C1.2a/b oracles.

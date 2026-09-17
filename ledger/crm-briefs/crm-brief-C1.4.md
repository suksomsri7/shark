# C1.4 — Contacts v2 (service + list + 360 + convert + consent)
Read `crm-brief-COMMON.md` first. Contract: CRM-RUN §2 "C1.4". Spec: blueprint §5.2, §3.5 (mockup 05), §3.17, §11.1, decisions C1, C20.

## Facts
v1 `createContact` in `service.ts` is used by forms and the AI tool through the facade — keep its signature working (wrap it around the new `contacts.createContact`). Member facade: `createMember(ctx, actor, input)`, `linkIdentity(ctx, input)`, `briefFor(ctx, actor, …)`. `canAdvanceLifecycle` lives in `crm/rules.ts` (extend with CHURNED). Assignment engine arrives in C2.3 — use a stub `assignment.pick` that returns the creator/fixed owner.

## Deliverables
`contacts.ts`: createContact (duplicate detection by phone/e-mail via Party + same-system CrmContact → returns `duplicate` candidates unless `force`) · updateContact (+ Party sync via `party.updateContactInfo`) · getContact360 · listContacts (all filters, `f.{key}`, saved views `objectKey="contact"`, cursor) · **convertContact in ONE transaction** (member via `member.createMember` source CRM · company · deal) with an `idempotencyKey` so a double click creates one set · assign/bulkAssign · setLeadStatus/setLifecycle/setTags/setOptOut/archive · findDuplicates/mergeContacts · importContacts (async job, ≤ 50,000 rows / 10 MB, onDuplicate update|skip|candidate) · exportContacts · `briefFor`.
**Consent (C20)**: `consents.set(contactId, channel, granted, source)` append-only into `CrmContactConsent`; `consents.current(contactId)`; if the contact is a member (`memberCustomerId`) read `MemberConsent` through the member facade instead — never two sources of truth. Export a single `canContact(contact, channel, {transactional?})` used by every later sender.
Pages `/contacts`, `/contacts/[contactId]`, `/contacts/new`, convert modal (3 ticks), consent/opt-out block. Events `crm.contact.created/updated/assigned/converted/merged`.

## Files you own
`src/lib/modules/crm/contacts*.ts`, `consents.ts` · `src/app/app/sys/[id]/crm/contacts/**` · `src/components/crm/contact/**` · registries for the 5 events · thin compatibility wrapper in `service.ts#createContact`.

## Acceptance (oracle `qc-crm-c1.4`)
CRM-RUN S1–S7 (30) + consent: S8 set/current/history; member-linked contact reads member consent.
X1 (incl. convert into a member system / company / pipeline of another tenant or CRM system → rejected) · X3 convert with the same idempotencyKey twice in parallel → one member/company/deal; two different users converting the same contact in parallel → second gets a calm CONFLICT · X4 consumers of the 5 events idempotent · X6 import: formula cells stored as text, caps enforced, bad rows reported not thrown; export via `csvRow`; tags/lengths capped · X8 export never includes sensitive member fields beyond policy D8 and writes access-log rows when it does; `crm.contact.created` payload masked/ids only; consent respected by `canContact` · X9 merge/archive/bulkAssign/export = confirm + reason + audit; bulk ≤ 500.
Parity: owner, thana, nok × 2 sizes.
Regressions: `qc-member-m1.4` `m1.6` `m1.7`, `qc-form`, `qc-ai-tools`, `qc-crm`.

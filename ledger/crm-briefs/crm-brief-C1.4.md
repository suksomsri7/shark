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

## Controller addendum (18 Sep · oracle `qc-crm-c1.4` 110 checks)
The CONTRACT BLOCK in the oracle header is the API. Rulings on the oracle writer's questions — binding:
1. **One-tx convert**: add an optional `tx?: Prisma.TransactionClient` to `member/profile.ts#createMember` and its facade export (additive; when absent, behaviour is byte-identical — `qc-member-m1.4/m1.5/m1.6` must stay green). Added to owned files.
2. Owned files also: `member/privacy.ts` (ONLY the `listAccessLog` filter excluding `page LIKE 'crm.%'` — C1.2a review debt) · `crm/assignment.ts` (stub `pick` → creator/fixed owner until C2.3) · `crm/where.ts` (`contactWhere` already created by C1.3 — extend, don't fork).
3. Consent copied on convert: source **STAFF** (the converting user); no enum change.
4. Import: **inline synchronous result** now (oracle accepts), processed in batches of 200 with try/finally audit (`created/updated/skipped/failed/aborted`), caps checked before any write. A real job table → **C2.0** migration (`CrmImportJob`) + async driver in C2.x (debt logged).
5. Deal part of convert writes the `CrmDeal` row directly, emits no `crm.deal.*` (no consumer yet). **C1.5 must** refactor convert to call `deals.createDeal(…, tx)` and emit `crm.deal.created` in the same tx.
6. Same-key replay returns the same ids (never CONFLICT); a different key after conversion → CONFLICT.
7. `canContact` rules as the oracle states (no consent row ⇒ no marketing; transactional ignores opt-out but not e-mail bounce) — confirmed.
From C1.2a/C1.3: governed contact columns are refused by the engine — the service writes them. Lock order: engine → tax/party advisory → CrmCompany rows (sorted) → CrmContact rows (sorted). Uniqueness/dup checks use unscoped tenant+system where (not `contactWhere`). Never bind a contact to a COMPANY Party (mirror of the C1.3 B1 blocker). Actors built only via `toMemberActor`/`memberActorForKey`. No page GET writes.

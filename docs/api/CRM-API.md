# SHARK CRM API

<!-- Generated from the operation registry (src/lib/modules/crm/api/registry.ts) by `pnpm exec tsx scripts/gen-crm-api-docs.mts`. Do not edit by hand: fitness F13.11 fails when this file and the generator disagree. -->

Base URL: `https://shark.in.th/api/v1/crm` · OpenAPI 3.1: `https://shark.in.th/api/v1/crm/openapi.json` (no key needed) · 101 operations (45 read, 43 write, 13 danger) · 23 AI tools.

## Conventions

REST API for the SHARK CRM module (contacts, companies, deals and pipelines, activities, custom object records, sales teams). One API key works inside one CRM system (AppSystem of type CRM) and sees what its bundle and filters allow.

Conventions that apply to every operation:
1. Authentication is `Authorization: Bearer <api key>`. An operation answers 403 `scope_missing` when the key lacks the scope listed as `x-shark-scope`. A key with no `crm.*` scope at all (a key of another module, or an empty legacy key) is refused on every CRM operation.
2. A key belongs to one of three bundles: `crm.readonly` reads only, `crm.operate` adds the work of a sales rep (contacts, companies, deals, lines, quotations, activities, records), `crm.admin` adds settings, teams, merging, archiving, deleting deals, export and cross-team reassignment. There is no implicit read: a key that only holds `crm.contact.create` cannot read contacts.
3. Optional key filters narrow what a key sees: `crm.filter.team:<teamId>` (only that team's rows) and `crm.filter.owner:<userId>` (only that user's rows). Anything outside the filter answers 404, exactly like a record of another shop.
4. **Read-only keys see phone numbers and e-mail addresses masked**, and read-only and operate keys never see values of fields the shop marked as sensitive.
5. A record the key cannot see - another shop, another CRM system, another team - answers 404 `not_found`, never 403.
6. **CRM v2 must be switched on.** While the shop still runs the previous CRM screens (`uiVersion` 1) every operation except `GET /ping` answers 409 `crm_v2_disabled` before anything is read or written.
7. Every write (POST, PATCH, PUT, DELETE) requires an `Idempotency-Key` header. The same key with the same body replays the stored answer with `Idempotent-Replayed: true`; the same key with a different body fails with 409 `idempotency_conflict`; a parallel duplicate gets 409 `idempotency_in_progress`.
8. Operations marked `x-shark-kind: danger` (archive, merge, delete, export) also require `confirm: true` (a real boolean) and a `reason` of at least 5 characters; the reason is stored in the audit log.
9. Moving a deal into a stage whose requirements are missing answers 409 `stage_requirements` with the missing items in `hint` (for example `missing: LINES`). Deal lines above the shop's discount cap answer 409 `approval_required` with `approvalRequestId=<id>` in `hint`; nothing is applied until the request is approved.
10. Lists answer `{ items, nextCursor }`; send `take` (at most 100) and pass `nextCursor` back as `cursor` for the next page. Money is in satang (`*Satang`, 100 satang = 1 baht), discounts in basis points (`*Bp`), timestamps are ISO-8601.
11. Rate limits are per key: 600 reads, 300 writes and 60 reports (forecast) per minute. A 429 carries `Retry-After`; successful answers carry `X-RateLimit-Limit` and `X-RateLimit-Remaining`.
12. Success is `{ data, requestId }` with HTTP 200 (also for creations). Failure is `{ error: { code, message_th, message_en, hint?, details? }, requestId }`.
13. Outgoing webhooks: a shop endpoint can subscribe to `crm.deal.won`, `team.updated`, `custom.record.created`, `custom.record.updated`, `custom.record.archived`, `crm.company.created`, `crm.company.updated`, `crm.company.merged`, `crm.contact.created`, `crm.contact.updated`, `crm.contact.assigned`, `crm.contact.converted`, `crm.contact.merged`, `crm.deal.created`, `crm.deal.stage.changed`, `crm.deal.lost`, `crm.deal.reopened`, `crm.deal.reassigned`, `crm.deal.updated`, `crm.activity.logged`, `crm.activity.completed`, `crm.score.changed`, `crm.score.threshold`, `crm.deal.quotation.issued`, `crm.deal.stale`, `crm.activity.overdue`, `crm.sequence.enrolled`, `crm.sequence.finished`, `crm.activity.reminder`, `crm.email.sent`, `crm.email.received`, `crm.email.opened`, `crm.email.clicked`, `crm.email.replied`, `crm.email.bounced`, `crm.web.identified`. Payloads carry ids only (no phone, e-mail, name or deal title); every delivery is signed with `X-Shark-Signature` (HMAC-SHA256 of the body) and `X-Shark-Signature-V2` (HMAC-SHA256 of `<X-Shark-Timestamp>.<body>`).
14. Sales teams are tenant-wide: one team list per shop, shared by every CRM system of that shop (not per system). They are also served at `/api/v1/teams` with the same operations and key. A key that is not bound to a system may omit `X-Shark-System` only when the shop has a single CRM system.
15. Request bodies are capped at 1 MB (10 MB for `POST /contacts/import`); larger bodies answer 413 `payload_too_large`. Exports (`POST /contacts/export`, `POST /objects/{key}/records/export`) need a `crm.admin` key.
16. A key with an owner or team filter can only create or reassign records inside that filter; anything that would land outside answers 422 `validation`.

Every write needs `Idempotency-Key`; every danger operation needs `confirm: true` and a `reason` of at least 5 characters.

## Keys, bundles and filters

Create keys in CRM > Settings > API. A key is bound to one CRM system and holds one bundle:

| Bundle | Label | What it may do | Scopes |
| --- | --- | --- | --- |
| `crm.readonly` | CRM — อ่านอย่างเดียว | Read the CRM system: contacts, companies, deals, pipelines, activities, custom object records and the key holder's own reports. Phone numbers and e-mail addresses come back masked, sensitive custom fields are never shown, and nothing can be written. | 6 |
| `crm.operate` | CRM — งานของพนักงานขาย | Everything in crm.readonly plus the sales-rep work: create and edit contacts, companies and deals, move deals between stages, set deal lines, issue quotations, log and complete activities and write custom object records. No settings, no merging, no deleting deals, no export and no cross-team reassignment. | 23 |
| `crm.admin` | CRM — ผู้ดูแล | Every CRM permission: settings, sales teams, visibility, merging and archiving contacts and companies, deleting deals, exporting, reassigning deals across teams and managing the CRM API keys. Designing custom objects is still only possible from the settings screen. | 51 |

Optional filters are stored with the key as extra scopes: `crm.filter.team:<teamId>` and `crm.filter.owner:<userId>`. They narrow every read and write of the key to that team's or that user's contacts, companies, deals and activities; anything else answers 404.

Rate limits per key and minute: 600 reads, 300 writes, 60 reports.

## Errors

Failure body: `{ "error": { "code", "message_th", "message_en", "hint"?, "details"? }, "requestId" }`.

| Code | HTTP | Meaning |
| --- | --- | --- |
| `unauthorized` | 401 | No `Authorization: Bearer` header, or the key is unknown or revoked. |
| `key_expired` | 401 | The key is past its expiry date. Rotate it in CRM > Settings > API. |
| `system_required` | 400 | The key is not bound to a CRM system and no `X-Shark-System` header was sent (not needed for `/teams`). |
| `system_mismatch` | 403 | `X-Shark-System` points at another system than the key is bound to, or at a system that is not a CRM of this shop. |
| `scope_missing` | 403 | The key does not hold the scope in `x-shark-scope` (`hint` names it). Keys of other modules get this on every CRM operation. |
| `forbidden` | 403 | The key sees the record but may not do this to it (for example a read-only key trying to write, or a reassignment across teams without `crm.deal.reassign`). |
| `crm_v2_disabled` | 409 | The shop still runs the previous CRM screens (`uiVersion` 1). Every operation except `GET /ping` answers this; nothing is read or written. |
| `invalid_json` | 400 | The body is not parseable JSON. |
| `validation` | 422 | The payload does not match the schema (`details[]` names the fields) or a value is not acceptable (Thai reason in `message_th`). |
| `idempotency_required` | 400 | A write was sent without the `Idempotency-Key` header. |
| `idempotency_conflict` | 409 | The same `Idempotency-Key` was reused with a different body. |
| `idempotency_in_progress` | 409 | A request with this key is still running; retry with the same key. |
| `confirm_required` | 409 | A danger operation was called without `confirm: true` (a real boolean). |
| `not_found` | 404 | No such operation, or the record does not exist inside what this key can see (other shop, other CRM system, other team, outside the key filter). |
| `method_not_allowed` | 405 | The path exists but not with this method (`Allow` header lists the methods). |
| `rate_limited` | 429 | Too many calls for this key and class; wait `Retry-After` seconds. |
| `duplicate` | 409 | A conflicting record exists (for example another company already has this tax id). The message never names the other record. |
| `state_conflict` | 409 | The record is not in a state that allows this (for example a closed deal, or a merge that stopped part-way). |
| `stage_requirements` | 409 | The target stage needs things the deal does not have yet; `hint` lists them (`missing: LINES, expectedCloseAt`). |
| `approval_required` | 409 | The change waits for the shop's approval chain (discount above the cap); `hint` carries `approvalRequestId=<id>`. Nothing was applied. |
| `unprocessable` | 422 | A generic refusal with a Thai reason in `message_th`. |
| `payload_too_large` | 413 | The request body is larger than 1 MB (10 MB for `POST /contacts/import`). Split it into several calls. |

## Operations

### Health check and search

| Operation | Method and path | Kind | Scope | Summary |
| --- | --- | --- | --- | --- |
| `ping` | `GET /ping` | read | `crm.contact.read` | Check that the API key works, and see which CRM system and permission bundle it is bound to. |
| `search` | `GET /search` | read | `crm.contact.read` | Search contacts, companies and deals by text in one call (up to 10 of each). |

#### `GET /ping` — ping

Check that the API key works, and see which CRM system and permission bundle it is bound to. (ทดสอบการเชื่อมต่อ)

#### `GET /search` — search

Search contacts, companies and deals by text in one call (up to 10 of each). (ค้นหาใน CRM) AI tool: `crm_search`.

Query:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `q` | string | yes | max 100 chars, min 1 |
| `take` | integer |  | <= 100 |

### Contacts

| Operation | Method and path | Kind | Scope | Summary |
| --- | --- | --- | --- | --- |
| `contacts.list` | `GET /contacts` | read | `crm.contact.read` | List the contacts this key can see, newest first, with filters and cursor paging. |
| `contacts.search` | `GET /contacts/search` | read | `crm.contact.read` | Find contacts by name, phone or e-mail (up to 20 matches). |
| `contacts.brief` | `GET /contacts/brief` | read | `crm.contact.read` | Short cards (no phone or e-mail) for up to 50 contact ids, comma separated. |
| `contacts.duplicates.list` | `GET /contacts/duplicates` | read | `crm.contact.merge` | Pairs of contacts that look like the same person (same phone, e-mail or name). |
| `contacts.import.start` | `POST /contacts/import` | write | `crm.contact.import` | Import up to 5,000 contact rows: rows are objects of column -> text, mapping says which column feeds which field. |
| `contacts.export` | `POST /contacts/export` | **danger** | `crm.contact.export` | Export the contacts this key can see as CSV text (formula cells neutralised). Needs confirm: true and a reason. |
| `contacts.byParty` | `GET /contacts/by-party/{partyId}` | read | `crm.contact.read` | The contact card linked to a shared customer identity (Party id), or null when this key cannot see one. |
| `contacts.get` | `GET /contacts/{id}` | read | `crm.contact.read` | One contact in full: details, owner, company, deals, custom fields, recent timeline and consent. |
| `contacts.create` | `POST /contacts` | write | `crm.contact.create` | Create a contact (lead). A matching phone or e-mail returns the existing contact with created: false unless force is true. |
| `contacts.update` | `PATCH /contacts/{id}` | write | `crm.contact.update` | Change a contact's details or custom fields. moveOpenDeals also moves the open deals when the main company changes. |
| `contacts.setLeadStatus` | `PUT /contacts/{id}/lead-status` | write | `crm.contact.update` | Set the lead status (NEW, CONTACTED, QUALIFIED, UNQUALIFIED, NURTURE). |
| `contacts.assign` | `PUT /contacts/{id}/owner` | write | `crm.contact.update` | Give the contact to another owner (a user of this shop), or null for no owner. |
| `contacts.setTags` | `PUT /contacts/{id}/tags` | write | `crm.contact.update` | Add and remove tags on a contact in one call. |
| `contacts.setOptOut` | `PUT /contacts/{id}/opt-out` | write | `crm.contact.update` | Record that the contact does (true) or no longer does (false) refuse marketing messages. |
| `contacts.archive` | `POST /contacts/{id}/archive` | **danger** | `crm.contact.delete` | Archive a contact (hidden from lists; history is kept). Needs confirm: true and a reason. |
| `contacts.convert` | `POST /contacts/{id}/convert` | write | `crm.contact.convert` | Convert a lead: optionally make them a member, link or create a company and open a deal. The Idempotency-Key makes a retry return the same result. |
| `contacts.merge` | `POST /contacts/{id}/merge` | **danger** | `crm.contact.merge` | Merge another contact (mergeId) into this one; deals, activities, companies and records move over. Needs confirm: true and a reason. |
| `scoring.explain` | `GET /contacts/{id}/score` | read | `crm.contact.read` | Why this contact has the score it has: the current score, the band (HOT, WARM, COLD) and the latest points that still count, each with its Thai reason, the rule behind it and when it expires. A contact this key cannot see answers 404. |

#### `GET /contacts` — contacts.list

List the contacts this key can see, newest first, with filters and cursor paging. (รายชื่อผู้ติดต่อ)

Query:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `take` | integer |  | <= 100 |
| `cursor` | string |  | max 200 chars, min 1 |
| `q` | string |  | max 100 chars |
| `stage` | `LEAD` \| `PROSPECT` \| `CUSTOMER` \| `LOST` \| `CHURNED` |  |  |
| `leadStatus` | `NEW` \| `CONTACTED` \| `QUALIFIED` \| `UNQUALIFIED` \| `NURTURE` |  |  |
| `owner` | string |  | max 64 chars |
| `team` | string |  | max 64 chars |
| `scoreBand` | `HOT` \| `WARM` \| `COLD` |  |  |
| `source` | `WALK_IN` \| `POS` \| `BOOKING` \| `LINE_OA` \| `LIFF` \| `WEB_FORM` \| `CHAT` \| `REFERRAL` \| `IMPORT` \| `CRM` \| `CAMPAIGN` \| `API` \| `MARKETPLACE` \| `APP` \| `OTHER` |  |  |
| `companyId` | string |  | max 64 chars, min 1 |
| `includeArchived` | `0` \| `1` \| `true` \| `false` |  |  |
| `sort` | `-createdAt` \| `createdAt` \| `name` \| `-lastActivityAt` \| `-score` |  |  |

#### `GET /contacts/search` — contacts.search

Find contacts by name, phone or e-mail (up to 20 matches). (ค้นหาผู้ติดต่อ)

Query:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `q` | string | yes | max 100 chars, min 1 |
| `take` | integer |  | <= 100 |

#### `GET /contacts/brief` — contacts.brief

Short cards (no phone or e-mail) for up to 50 contact ids, comma separated. (การ์ดย่อผู้ติดต่อ)

Query:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `ids` | string | yes | max 3300 chars, min 1 |

#### `GET /contacts/duplicates` — contacts.duplicates.list

Pairs of contacts that look like the same person (same phone, e-mail or name). (ผู้ติดต่อที่อาจซ้ำ)

Query:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `limit` | integer |  | <= 500 |

#### `POST /contacts/import` — contacts.import.start

Import up to 5,000 contact rows: rows are objects of column -> text, mapping says which column feeds which field. (นำเข้าผู้ติดต่อ)

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `rows` | object[] | yes | max 5000 items |
| `mapping` | object | yes |  |
| `options` | object \| null |  |  |

#### `POST /contacts/export` — contacts.export

Export the contacts this key can see as CSV text (formula cells neutralised). Needs confirm: true and a reason. (ส่งออกผู้ติดต่อ)

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `reason` | string | yes | max 500 chars, min 5 |
| `q` | string |  | max 100 chars |
| `stage` | `LEAD` \| `PROSPECT` \| `CUSTOMER` \| `LOST` \| `CHURNED` |  |  |
| `leadStatus` | `NEW` \| `CONTACTED` \| `QUALIFIED` \| `UNQUALIFIED` \| `NURTURE` |  |  |
| `owner` | string |  | max 64 chars |
| `companyId` | string |  | max 64 chars, min 1 |
| `confirm` | boolean `true` | yes | checked before the schema |

#### `GET /contacts/by-party/{partyId}` — contacts.byParty

The contact card linked to a shared customer identity (Party id), or null when this key cannot see one. (ผู้ติดต่อจากตัวตนลูกค้า)

#### `GET /contacts/{id}` — contacts.get

One contact in full: details, owner, company, deals, custom fields, recent timeline and consent. (ผู้ติดต่อ 360) AI tool: `crm_contact_360`.

#### `POST /contacts` — contacts.create

Create a contact (lead). A matching phone or e-mail returns the existing contact with created: false unless force is true. (เพิ่มผู้ติดต่อ (lead)) AI tool: `crm_create_lead`.

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `firstName` | string | yes | max 200 chars, min 1 |
| `lastName` | string \| null |  | max 200 chars |
| `titleTh` | string \| null |  | max 40 chars |
| `phone` | string \| null |  | max 40 chars |
| `email` | string \| null |  | max 200 chars |
| `companyId` | string \| null |  | max 64 chars, min 1 |
| `jobTitle` | string \| null |  | max 200 chars |
| `department` | string \| null |  | max 200 chars |
| `sourceKind` | `WALK_IN` \| `POS` \| `BOOKING` \| `LINE_OA` \| `LIFF` \| `WEB_FORM` \| `CHAT` \| `REFERRAL` \| `IMPORT` \| `CRM` \| `CAMPAIGN` \| `API` \| `MARKETPLACE` \| `APP` \| `OTHER` \| null |  |  |
| `sourceChannel` | string \| null |  | max 60 chars |
| `sourceDetail` | object \| null |  |  |
| `fields` | object \| null |  |  |
| `tags` | string[] \| null |  | max 50 items |
| `ownerUserId` | string \| null |  | max 64 chars, min 1 |
| `lineUserId` | string \| null |  | max 100 chars |
| `force` | boolean |  |  |

#### `PATCH /contacts/{id}` — contacts.update

Change a contact's details or custom fields. moveOpenDeals also moves the open deals when the main company changes. (แก้ไขผู้ติดต่อ)

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `firstName` | string \| null |  | max 200 chars |
| `lastName` | string \| null |  | max 200 chars |
| `titleTh` | string \| null |  | max 40 chars |
| `phone` | string \| null |  | max 40 chars |
| `email` | string \| null |  | max 200 chars |
| `jobTitle` | string \| null |  | max 200 chars |
| `department` | string \| null |  | max 200 chars |
| `lineUserId` | string \| null |  | max 100 chars |
| `companyId` | string \| null |  | max 64 chars, min 1 |
| `moveOpenDeals` | boolean \| null |  |  |
| `fields` | object \| null |  |  |

#### `PUT /contacts/{id}/lead-status` — contacts.setLeadStatus

Set the lead status (NEW, CONTACTED, QUALIFIED, UNQUALIFIED, NURTURE). (ตั้งสถานะ lead)

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `leadStatus` | `NEW` \| `CONTACTED` \| `QUALIFIED` \| `UNQUALIFIED` \| `NURTURE` | yes |  |

#### `PUT /contacts/{id}/owner` — contacts.assign

Give the contact to another owner (a user of this shop), or null for no owner. (มอบผู้ติดต่อให้ผู้ดูแล) AI tool: `crm_assign`.

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `userId` | string \| null | yes | max 64 chars, min 1 |

#### `PUT /contacts/{id}/tags` — contacts.setTags

Add and remove tags on a contact in one call. (ตั้งแท็กผู้ติดต่อ)

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `add` | string[] |  | max 50 items |
| `remove` | string[] |  | max 50 items |

#### `PUT /contacts/{id}/opt-out` — contacts.setOptOut

Record that the contact does (true) or no longer does (false) refuse marketing messages. (ตั้งไม่รับข่าวสาร)

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `optOut` | boolean | yes |  |
| `source` | `STAFF` \| `IMPORT` \| `API` \| `SIGNUP_FORM` \| `LIFF` \| `CUSTOMER_SELF` \| `WEB_FORM` \| `CHAT` \| `PORTAL` \| `UNSUBSCRIBE` |  |  |

#### `POST /contacts/{id}/archive` — contacts.archive

Archive a contact (hidden from lists; history is kept). Needs confirm: true and a reason. (เก็บถาวรผู้ติดต่อ)

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `reason` | string | yes | max 500 chars, min 5 |
| `confirm` | boolean `true` | yes | checked before the schema |

#### `POST /contacts/{id}/convert` — contacts.convert

Convert a lead: optionally make them a member, link or create a company and open a deal. The Idempotency-Key makes a retry return the same result. (แปลง lead) AI tool: `crm_convert`.

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `member` | object \| null |  |  |
| `company` | object \| null |  |  |
| `deal` | object \| null |  |  |

#### `POST /contacts/{id}/merge` — contacts.merge

Merge another contact (mergeId) into this one; deals, activities, companies and records move over. Needs confirm: true and a reason. (รวมผู้ติดต่อ)

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `mergeId` | string | yes | max 64 chars, min 1 |
| `fieldChoices` | object \| null |  |  |
| `reason` | string | yes | max 500 chars, min 5 |
| `confirm` | boolean `true` | yes | checked before the schema |

#### `GET /contacts/{id}/score` — scoring.explain

Why this contact has the score it has: the current score, the band (HOT, WARM, COLD) and the latest points that still count, each with its Thai reason, the rule behind it and when it expires. A contact this key cannot see answers 404. (เหตุผลของคะแนนผู้ติดต่อ) AI tool: `crm_score_explain`.

Query:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `limit` | integer |  | <= 50 |

### Companies

| Operation | Method and path | Kind | Scope | Summary |
| --- | --- | --- | --- | --- |
| `companies.list` | `GET /companies` | read | `crm.company.read` | List the companies this key can see, with filters and cursor paging. |
| `companies.duplicates.list` | `GET /companies/duplicates` | read | `crm.company.merge` | Pairs of companies that look like the same business (tax id, e-mail domain or name). |
| `companies.get` | `GET /companies/{id}` | read | `crm.company.read` | One company in full: details, contacts and their roles, deals, documents, custom fields and timeline. |
| `companies.create` | `POST /companies` | write | `crm.company.create` | Create a company. A company with the same tax id, e-mail domain or a very similar name comes back as created: false with candidates. |
| `companies.update` | `PATCH /companies/{id}` | write | `crm.company.update` | Change a company's details or custom fields. A tax id that belongs to another company fails with 409. |
| `companies.setOwner` | `PUT /companies/{id}/owner` | write | `crm.company.update` | Give the company to another owner (a user of this shop), or null for no owner. |
| `companies.contacts.add` | `POST /companies/{id}/contacts` | write | `crm.company.update` | Link a contact to the company with a role; isPrimary makes it the contact's main company. |
| `companies.contacts.remove` | `DELETE /companies/{id}/contacts/{contactId}` | write | `crm.company.update` | Unlink a contact from the company (the contact itself is kept). |
| `companies.archive` | `POST /companies/{id}/archive` | **danger** | `crm.company.delete` | Archive a company (hidden from lists; contacts, deals and history are kept). Needs confirm: true and a reason. |
| `companies.merge` | `POST /companies/{id}/merge` | **danger** | `crm.company.merge` | Merge another company (mergeId) into this one; contacts, deals and records move over. Needs confirm: true and a reason. |

#### `GET /companies` — companies.list

List the companies this key can see, with filters and cursor paging. (รายชื่อบริษัท)

Query:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `take` | integer |  | <= 100 |
| `cursor` | string |  | max 200 chars, min 1 |
| `q` | string |  | max 100 chars |
| `owner` | string |  | max 64 chars |
| `team` | string |  | max 64 chars |
| `industry` | string |  | max 100 chars |
| `size` | `MICRO` \| `SMALL` \| `MEDIUM` \| `LARGE` \| `ENTERPRISE` |  |  |
| `hasOpenDeals` | `0` \| `1` \| `true` \| `false` |  |  |
| `includeArchived` | `0` \| `1` \| `true` \| `false` |  |  |
| `sort` | `name` \| `-name` \| `createdAt` \| `-createdAt` \| `lastActivityAt` \| `-lastActivityAt` \| `openDealCount` \| `-openDealCount` \| `wonValueSatang` \| `-wonValueSatang` |  |  |

#### `GET /companies/duplicates` — companies.duplicates.list

Pairs of companies that look like the same business (tax id, e-mail domain or name). (บริษัทที่อาจซ้ำ)

Query:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `limit` | integer |  | <= 500 |

#### `GET /companies/{id}` — companies.get

One company in full: details, contacts and their roles, deals, documents, custom fields and timeline. (บริษัท 360) AI tool: `crm_company_360`.

#### `POST /companies` — companies.create

Create a company. A company with the same tax id, e-mail domain or a very similar name comes back as created: false with candidates. (เพิ่มบริษัท) AI tool: `crm_create_company`.

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `name` | string | yes | max 200 chars, min 1 |
| `legalName` | string \| null |  | max 200 chars |
| `taxId` | string \| null |  | max 20 chars |
| `branchCode` | string \| null |  | max 10 chars |
| `emailDomain` | string \| null |  | max 200 chars |
| `industry` | string \| null |  | max 200 chars |
| `size` | `MICRO` \| `SMALL` \| `MEDIUM` \| `LARGE` \| `ENTERPRISE` \| null |  |  |
| `website` | string \| null |  | max 500 chars, http(s) URL |
| `phone` | string \| null |  | max 40 chars |
| `email` | string \| null |  | max 200 chars |
| `note` | string \| null |  | max 4000 chars |
| `fields` | object \| null |  |  |
| `ownerUserId` | string \| null |  | max 64 chars, min 1 |
| `teamId` | string \| null |  | max 64 chars, min 1 |
| `parentCompanyId` | string \| null |  | max 64 chars, min 1 |

#### `PATCH /companies/{id}` — companies.update

Change a company's details or custom fields. A tax id that belongs to another company fails with 409. (แก้ไขบริษัท)

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `name` | string \| null |  | max 200 chars |
| `legalName` | string \| null |  | max 200 chars |
| `taxId` | string \| null |  | max 20 chars |
| `branchCode` | string \| null |  | max 10 chars |
| `emailDomain` | string \| null |  | max 200 chars |
| `industry` | string \| null |  | max 200 chars |
| `size` | `MICRO` \| `SMALL` \| `MEDIUM` \| `LARGE` \| `ENTERPRISE` \| null |  |  |
| `website` | string \| null |  | max 500 chars, http(s) URL |
| `phone` | string \| null |  | max 40 chars |
| `email` | string \| null |  | max 200 chars |
| `note` | string \| null |  | max 4000 chars |
| `fields` | object \| null |  |  |

#### `PUT /companies/{id}/owner` — companies.setOwner

Give the company to another owner (a user of this shop), or null for no owner. (ตั้งผู้ดูแลบริษัท)

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `userId` | string \| null | yes | max 64 chars, min 1 |

#### `POST /companies/{id}/contacts` — companies.contacts.add

Link a contact to the company with a role; isPrimary makes it the contact's main company. (เพิ่มผู้ติดต่อเข้าบริษัท)

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `contactId` | string | yes | max 64 chars, min 1 |
| `role` | `DECISION_MAKER` \| `INFLUENCER` \| `COORDINATOR` \| `BILLING` \| `TECHNICAL` \| `END_USER` \| `OTHER` \| null |  |  |
| `jobTitle` | string \| null |  | max 200 chars |
| `isPrimary` | boolean \| null |  |  |

#### `DELETE /companies/{id}/contacts/{contactId}` — companies.contacts.remove

Unlink a contact from the company (the contact itself is kept). (นำผู้ติดต่อออกจากบริษัท)

#### `POST /companies/{id}/archive` — companies.archive

Archive a company (hidden from lists; contacts, deals and history are kept). Needs confirm: true and a reason. (เก็บถาวรบริษัท)

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `reason` | string | yes | max 500 chars, min 5 |
| `confirm` | boolean `true` | yes | checked before the schema |

#### `POST /companies/{id}/merge` — companies.merge

Merge another company (mergeId) into this one; contacts, deals and records move over. Needs confirm: true and a reason. (รวมบริษัท)

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `mergeId` | string | yes | max 64 chars, min 1 |
| `fieldChoices` | object \| null |  |  |
| `reason` | string | yes | max 500 chars, min 5 |
| `confirm` | boolean `true` | yes | checked before the schema |

### Deals and pipelines

| Operation | Method and path | Kind | Scope | Summary |
| --- | --- | --- | --- | --- |
| `deals.list` | `GET /deals` | read | `crm.deal.read` | List the deals this key can see (all pipelines unless pipelineId is given), with filters and cursor paging. |
| `deals.board` | `GET /deals/board` | read | `crm.deal.read` | The pipeline board: one column per stage with count, total and weighted value, and the deal cards in it. |
| `deals.forecast` | `GET /deals/forecast` | read | `crm.report.view` | Forecast of open deals grouped by expected close month, owner or team, with weighted value. |
| `pipelines.list` | `GET /pipelines` | read | `crm.deal.read` | The pipelines of this CRM system with their stages (id, name, kind, probability, requirements) and open deal counts. |
| `deals.get` | `GET /deals/{id}` | read | `crm.deal.read` | One deal in full: stage and history, lines, documents, contacts, custom fields, timeline and linked task cards. |
| `deals.create` | `POST /deals` | write | `crm.deal.create` | Open a deal for a contact in a pipeline (first stage unless stageId is given). Value above 20,000,000 baht is refused. |
| `deals.update` | `PATCH /deals/{id}` | write | `crm.deal.update` | Change a deal's title, value, expected close date, probability, tags, next step, forecast category or custom fields. |
| `deals.move` | `PUT /deals/{id}/stage` | write | `crm.deal.move` | Move a deal to another stage of its pipeline. Missing stage requirements fail with 409 stage_requirements; a lost stage takes lostReasonId. |
| `deals.reassign` | `PUT /deals/{id}/owner` | write | `crm.deal.reassign` | Give the deal to another owner, optionally in another team. |
| `deals.lines.set` | `PUT /deals/{id}/lines` | write | `crm.deal.lines` | Replace the product lines of a deal; the deal value is recalculated. A discount above the shop's cap waits for approval (409 approval_required). |
| `deals.quote` | `POST /deals/{id}/quotation` | write | `crm.deal.quote` | Issue a quotation in the accounting book from the deal's lines (a repeat call returns the same document). |
| `deals.delete` | `DELETE /deals/{id}` | **danger** | `crm.deal.delete` | Delete a deal for good. Needs confirm: true and a reason. |
| `deals.stale.list` | `GET /deals/stale` | read | `crm.deal.read` | Open deals that have gone quiet: no activity (or no stage change) for longer than the shop's stale threshold, newest activity last. Same list and same visibility as GET /deals?stale=true - this door only fixes the filter so one call answers 'what needs a nudge'. |
| `deals.nextStep.set` | `PUT /deals/{id}/next-step` | write | `crm.deal.update` | Write the next step of one deal (a short note of what happens next, up to 300 characters). An empty value clears it. |

#### `GET /deals` — deals.list

List the deals this key can see (all pipelines unless pipelineId is given), with filters and cursor paging. (รายการดีล)

Query:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `take` | integer |  | <= 100 |
| `cursor` | string |  | max 200 chars, min 1 |
| `pipelineId` | string |  | max 64 chars, min 1 |
| `owner` | string |  | max 64 chars |
| `team` | string |  | max 64 chars |
| `stage` | string |  | max 64 chars, min 1 |
| `closeFrom` | string |  | max 40 chars |
| `closeTo` | string |  | max 40 chars |
| `stale` | `0` \| `1` \| `true` \| `false` |  |  |
| `tag` | string |  | max 64 chars |
| `q` | string |  | max 100 chars |
| `companyId` | string |  | max 64 chars, min 1 |
| `contactId` | string |  | max 64 chars, min 1 |
| `kind` | `OPEN` \| `WON` \| `LOST` |  |  |
| `sort` | `-createdAt` \| `createdAt` \| `-valueSatang` \| `expectedCloseAt` \| `-stageEnteredAt` \| `title` |  |  |

#### `GET /deals/board` — deals.board

The pipeline board: one column per stage with count, total and weighted value, and the deal cards in it. (กระดานดีล) AI tool: `crm_pipeline_summary`.

Query:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `pipelineId` | string |  | max 64 chars, min 1 |
| `owner` | string |  | max 64 chars |
| `team` | string |  | max 64 chars |
| `q` | string |  | max 100 chars |

#### `GET /deals/forecast` — deals.forecast

Forecast of open deals grouped by expected close month, owner or team, with weighted value. (พยากรณ์ยอดขาย) Uses the report rate bucket. AI tool: `crm_forecast`.

Query:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `pipelineId` | string |  | max 64 chars, min 1 |
| `groupBy` | `month` \| `owner` \| `team` |  |  |
| `category` | `PIPELINE` \| `BEST_CASE` \| `COMMIT` \| `OMITTED` |  |  |
| `from` | string |  | max 40 chars |
| `to` | string |  | max 40 chars |

#### `GET /pipelines` — pipelines.list

The pipelines of this CRM system with their stages (id, name, kind, probability, requirements) and open deal counts. (pipeline และขั้น)

Query:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `includeArchived` | `0` \| `1` \| `true` \| `false` |  |  |

#### `GET /deals/{id}` — deals.get

One deal in full: stage and history, lines, documents, contacts, custom fields, timeline and linked task cards. (ดีล 360) AI tool: `crm_deal_360`.

#### `POST /deals` — deals.create

Open a deal for a contact in a pipeline (first stage unless stageId is given). Value above 20,000,000 baht is refused. (เปิดดีล) AI tool: `crm_create_deal`.

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `pipelineId` | string | yes | max 64 chars, min 1 |
| `stageId` | string \| null |  | max 64 chars, min 1 |
| `title` | string | yes | max 200 chars, min 1 |
| `contactId` | string | yes | max 64 chars, min 1 |
| `companyId` | string \| null |  | max 64 chars, min 1 |
| `valueSatang` | integer \| null |  |  |
| `lines` | object[] \| null |  | max 200 items |
| `discountBp` | integer \| null |  | <= 10000 |
| `expectedCloseAt` | string \| null |  | max 40 chars |
| `ownerUserId` | string \| null |  | max 64 chars, min 1 |
| `collaboratorUserIds` | string[] \| null |  | max 20 items |
| `forecastCategory` | `PIPELINE` \| `BEST_CASE` \| `COMMIT` \| `OMITTED` \| null |  |  |
| `probabilityOverride` | integer \| null |  | <= 100 |
| `nextStep` | string \| null |  | max 500 chars |
| `fields` | object \| null |  |  |
| `tags` | string[] \| null |  | max 50 items |

#### `PATCH /deals/{id}` — deals.update

Change a deal's title, value, expected close date, probability, tags, next step, forecast category or custom fields. (แก้ไขดีล) AI tool: `crm_update_deal`.

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `title` | string \| null |  | max 200 chars |
| `expectedCloseAt` | string \| null |  | max 40 chars |
| `valueSatang` | integer \| null |  |  |
| `probabilityOverride` | integer \| null |  | <= 100 |
| `tags` | string[] \| null |  | max 50 items |
| `fields` | object \| null |  |  |
| `nextStep` | string \| null |  | max 500 chars |
| `forecastCategory` | `PIPELINE` \| `BEST_CASE` \| `COMMIT` \| `OMITTED` |  |  |

#### `PUT /deals/{id}/stage` — deals.move

Move a deal to another stage of its pipeline. Missing stage requirements fail with 409 stage_requirements; a lost stage takes lostReasonId. (ย้ายขั้นดีล) AI tool: `crm_move_deal`.

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `stageId` | string | yes | max 64 chars, min 1 |
| `note` | string \| null |  | max 2000 chars |
| `lostReasonId` | string \| null |  | max 64 chars, min 1 |
| `lostNote` | string \| null |  | max 2000 chars |
| `requireFieldsValues` | object \| null |  |  |

#### `PUT /deals/{id}/owner` — deals.reassign

Give the deal to another owner, optionally in another team. (โอนดีล)

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `ownerUserId` | string \| null | yes | max 64 chars, min 1 |
| `teamId` | string \| null |  | max 64 chars, min 1 |

#### `PUT /deals/{id}/lines` — deals.lines.set

Replace the product lines of a deal; the deal value is recalculated. A discount above the shop's cap waits for approval (409 approval_required). (ตั้งรายการสินค้าในดีล)

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `lines` | object[] | yes | max 200 items |
| `discountBp` | integer \| null |  | <= 10000 |

#### `POST /deals/{id}/quotation` — deals.quote

Issue a quotation in the accounting book from the deal's lines (a repeat call returns the same document). (ออกใบเสนอราคาจากดีล)

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `validDays` | integer \| null |  | <= 365 |
| `note` | string \| null |  | max 2000 chars |

#### `DELETE /deals/{id}` — deals.delete

Delete a deal for good. Needs confirm: true and a reason. (ลบดีล)

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `reason` | string | yes | max 500 chars, min 5 |
| `confirm` | boolean `true` | yes | checked before the schema |

#### `GET /deals/stale` — deals.stale.list

Open deals that have gone quiet: no activity (or no stage change) for longer than the shop's stale threshold, newest activity last. Same list and same visibility as GET /deals?stale=true - this door only fixes the filter so one call answers 'what needs a nudge'. (ดีลที่นิ่ง) Uses the report rate bucket. AI tool: `crm_stale_deals`.

Query:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `take` | integer |  | <= 100 |
| `cursor` | string |  | max 200 chars, min 1 |
| `pipelineId` | string |  | max 64 chars, min 1 |
| `owner` | string |  | max 64 chars |
| `team` | string |  | max 64 chars |

#### `PUT /deals/{id}/next-step` — deals.nextStep.set

Write the next step of one deal (a short note of what happens next, up to 300 characters). An empty value clears it. (ตั้งขั้นถัดไปของดีล) AI tool: `crm_set_next_step`.

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `nextStep` | string \| null |  | max 300 chars |

### Activities and calendar

| Operation | Method and path | Kind | Scope | Summary |
| --- | --- | --- | --- | --- |
| `activities.list` | `GET /activities` | read | `crm.activity.read` | List activities (calls, meetings, tasks, notes, ...) this key can see, filtered by status, type, record or date range. |
| `calendar.list` | `GET /calendar` | read | `crm.activity.read` | Activities whose start (or due) time falls in [from, to), for a calendar view. mine=true limits to the key holder's own. The answer also carries `appointments` (read-only bookings, clinic visits and school classes of the same Party) and `appointmentsTruncated`; for API keys `appointments` is always empty - those rows belong to the booking, clinic and school modules, so ask those modules with their own key. |
| `activities.get` | `GET /activities/{id}` | read | `crm.activity.read` | One activity. |
| `activities.log` | `POST /activities` | write | `crm.activity.create` | Log an activity on a contact, company, deal or custom record (call, meeting, task, note, ...), optionally with a follow-up task. |
| `activities.complete` | `POST /activities/{id}/complete` | write | `crm.activity.complete` | Mark an activity or task done, optionally with its outcome. |
| `activities.reschedule` | `PUT /activities/{id}/schedule` | write | `crm.activity.create` | Move an activity to another start/end or due time. |
| `activities.delete` | `DELETE /activities/{id}` | **danger** | `crm.activity.delete` | Delete an activity. Needs confirm: true and a reason. |
| `activities.due.list` | `GET /activities/due` | read | `crm.activity.read` | Tasks and appointments that are waiting: status pending (default), today, week or overdue. Same list and same visibility as GET /activities?status=... - this door only fixes the filter so one call answers 'what is due'. |

#### `GET /activities` — activities.list

List activities (calls, meetings, tasks, notes, ...) this key can see, filtered by status, type, record or date range. (รายการกิจกรรม)

Query:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `take` | integer |  | <= 100 |
| `cursor` | string |  | max 200 chars, min 1 |
| `scope` | `mine` \| `team` |  |  |
| `status` | `pending` \| `today` \| `week` \| `overdue` \| `done` |  |  |
| `type` | `CALL` \| `MEETING` \| `EMAIL` \| `LINE` \| `TASK` \| `NOTE` \| `CHAT` \| `SMS` \| `WHATSAPP` \| `VISIT` \| `WEB` \| `PORTAL` |  |  |
| `contactId` | string |  | max 64 chars, min 1 |
| `companyId` | string |  | max 64 chars, min 1 |
| `dealId` | string |  | max 64 chars, min 1 |
| `customRecordId` | string |  | max 64 chars, min 1 |
| `from` | string |  | max 40 chars |
| `to` | string |  | max 40 chars |

#### `GET /calendar` — calendar.list

Activities whose start (or due) time falls in [from, to), for a calendar view. mine=true limits to the key holder's own. The answer also carries `appointments` (read-only bookings, clinic visits and school classes of the same Party) and `appointmentsTruncated`; for API keys `appointments` is always empty - those rows belong to the booking, clinic and school modules, so ask those modules with their own key. (ปฏิทินกิจกรรม)

Query:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `from` | string | yes | max 40 chars |
| `to` | string | yes | max 40 chars |
| `mine` | `0` \| `1` \| `true` \| `false` |  |  |

#### `GET /activities/{id}` — activities.get

One activity. (กิจกรรม)

#### `POST /activities` — activities.log

Log an activity on a contact, company, deal or custom record (call, meeting, task, note, ...), optionally with a follow-up task. (บันทึกกิจกรรม) AI tool: `crm_log_activity`.

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `type` | `CALL` \| `MEETING` \| `EMAIL` \| `LINE` \| `TASK` \| `NOTE` \| `CHAT` \| `SMS` \| `WHATSAPP` \| `VISIT` \| `WEB` \| `PORTAL` | yes |  |
| `title` | string | yes | max 300 chars, min 1 |
| `body` | string \| null |  | max 8000 chars |
| `direction` | `IN` \| `OUT` \| null |  |  |
| `channel` | string \| null |  | max 40 chars |
| `contactId` | string \| null |  | max 64 chars, min 1 |
| `companyId` | string \| null |  | max 64 chars, min 1 |
| `dealId` | string \| null |  | max 64 chars, min 1 |
| `customRecordId` | string \| null |  | max 64 chars, min 1 |
| `startAt` | string \| integer \| null |  | max 40 chars |
| `endAt` | string \| integer \| null |  | max 40 chars |
| `durationSec` | integer \| null |  | <= 86400 |
| `outcome` | string \| null |  | max 60 chars |
| `attendees` | object \| null |  |  |
| `location` | string \| null |  | max 300 chars |
| `dueAt` | string \| integer \| null |  | max 40 chars |
| `remindAt` | string \| integer \| null |  | max 40 chars |
| `done` | boolean \| null |  |  |
| `priority` | `LOW` \| `NORMAL` \| `HIGH` \| null |  |  |
| `pinned` | boolean \| null |  |  |
| `mentions` | string[] \| null |  | max 20 items |
| `nextTask` | object \| null |  |  |

#### `POST /activities/{id}/complete` — activities.complete

Mark an activity or task done, optionally with its outcome. (ปิดกิจกรรม)

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `outcome` | string \| null |  | max 60 chars |

#### `PUT /activities/{id}/schedule` — activities.reschedule

Move an activity to another start/end or due time. (เลื่อนนัด/กำหนดส่ง)

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `dueAt` | string \| integer \| null |  | max 40 chars |
| `startAt` | string \| integer \| null |  | max 40 chars |
| `endAt` | string \| integer \| null |  | max 40 chars |

#### `DELETE /activities/{id}` — activities.delete

Delete an activity. Needs confirm: true and a reason. (ลบกิจกรรม)

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `reason` | string | yes | max 500 chars, min 5 |
| `confirm` | boolean `true` | yes | checked before the schema |

#### `GET /activities/due` — activities.due.list

Tasks and appointments that are waiting: status pending (default), today, week or overdue. Same list and same visibility as GET /activities?status=... - this door only fixes the filter so one call answers 'what is due'. (งานที่ถึงกำหนด) AI tool: `crm_activities_due`.

Query:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `take` | integer |  | <= 100 |
| `cursor` | string |  | max 200 chars, min 1 |
| `status` | `pending` \| `today` \| `week` \| `overdue` \| `done` |  |  |
| `type` | `CALL` \| `MEETING` \| `EMAIL` \| `LINE` \| `TASK` \| `NOTE` \| `CHAT` \| `SMS` \| `WHATSAPP` \| `VISIT` \| `WEB` \| `PORTAL` |  |  |
| `scope` | `mine` \| `team` |  |  |
| `contactId` | string |  | max 64 chars, min 1 |
| `dealId` | string |  | max 64 chars, min 1 |

### Custom objects and records

| Operation | Method and path | Kind | Scope | Summary |
| --- | --- | --- | --- | --- |
| `objects.list` | `GET /objects` | read | `crm.record.read` | The custom objects of this CRM system (key, labels, parent type, title field, record count). |
| `records.list` | `GET /objects/{key}/records` | read | `crm.record.read` | Records of one custom object this key can see (follows the parent's visibility), with search and cursor paging. |
| `records.export` | `POST /objects/{key}/records/export` | **danger** | `crm.record.read` | Export the records of one object as CSV text (formula cells neutralised). Needs confirm: true and a reason. |
| `records.get` | `GET /objects/{key}/records/{id}` | read | `crm.record.read` | One record with its field values (sensitive values follow the shop's policy). |
| `records.create` | `POST /objects/{key}/records` | write | `crm.record.create` | Create a record under its parent (contact, company, deal or member, per the object); the title comes from the object's title field. |
| `records.update` | `PATCH /objects/{key}/records/{id}` | write | `crm.record.update` | Change a record's field values (only the keys sent are touched). |
| `records.archive` | `POST /objects/{key}/records/{id}/archive` | write | `crm.record.delete` | Archive one record (kept for history, hidden from lists). |

#### `GET /objects` — objects.list

The custom objects of this CRM system (key, labels, parent type, title field, record count). (วัตถุกำหนดเอง)

#### `GET /objects/{key}/records` — records.list

Records of one custom object this key can see (follows the parent's visibility), with search and cursor paging. (รายการของวัตถุ) AI tool: `crm_records_query`.

Query:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `take` | integer |  | <= 100 |
| `cursor` | string |  | max 200 chars, min 1 |
| `parentId` | string |  | max 64 chars, min 1 |
| `q` | string |  | max 100 chars |
| `sort` | `title` \| `-title` \| `createdAt` \| `-createdAt` \| `updatedAt` \| `-updatedAt` |  |  |
| `includeArchived` | `0` \| `1` \| `true` \| `false` |  |  |

#### `POST /objects/{key}/records/export` — records.export

Export the records of one object as CSV text (formula cells neutralised). Needs confirm: true and a reason. (ส่งออกรายการ)

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `reason` | string | yes | max 500 chars, min 5 |
| `parentId` | string |  | max 64 chars, min 1 |
| `q` | string |  | max 100 chars |
| `confirm` | boolean `true` | yes | checked before the schema |

#### `GET /objects/{key}/records/{id}` — records.get

One record with its field values (sensitive values follow the shop's policy). (รายการ 1 รายการ)

#### `POST /objects/{key}/records` — records.create

Create a record under its parent (contact, company, deal or member, per the object); the title comes from the object's title field. (เพิ่มรายการ)

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `parentId` | string \| null |  | max 64 chars, min 1 |
| `title` | string \| null |  | max 200 chars |
| `values` | object |  |  |
| `unitId` | string \| null |  | max 64 chars, min 1 |
| `ownerUserId` | string \| null |  | max 64 chars, min 1 |

#### `PATCH /objects/{key}/records/{id}` — records.update

Change a record's field values (only the keys sent are touched). (แก้ไขรายการ)

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `title` | string \| null |  | max 200 chars |
| `values` | object |  |  |

#### `POST /objects/{key}/records/{id}/archive` — records.archive

Archive one record (kept for history, hidden from lists). (เก็บถาวรรายการ)

### Sales teams (also at /api/v1/teams)

| Operation | Method and path | Kind | Scope | Summary |
| --- | --- | --- | --- | --- |
| `teams.list` | `GET /teams` | read | `crm.contact.read` | The sales teams of the shop (name, lead, branches). |
| `teams.create` | `POST /teams` | write | `crm.team.manage` | Create a sales team (name unique in the shop), optionally with a lead and branches. |
| `teams.get` | `GET /teams/{id}` | read | `crm.contact.read` | One sales team with its members (user id, role, accepting leads). |
| `teams.update` | `PATCH /teams/{id}` | write | `crm.team.manage` | Rename a team or change its branches, colour or description. |
| `teams.members.set` | `PUT /teams/{id}/members` | write | `crm.team.manage` | Set the team's members in one call: listed users are added or updated (role, accepting leads), everyone else is removed. |
| `teams.archive` | `POST /teams/{id}/archive` | write | `crm.team.manage` | Archive a team (members and history are kept; it no longer appears in lists). |

#### `GET /teams` — teams.list

The sales teams of the shop (name, lead, branches). (ทีมขาย)

Query:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `includeArchived` | `0` \| `1` \| `true` \| `false` |  |  |

#### `POST /teams` — teams.create

Create a sales team (name unique in the shop), optionally with a lead and branches. (สร้างทีมขาย)

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `name` | string | yes | max 80 chars, min 1 |
| `leadUserId` | string \| null |  | max 64 chars, min 1 |
| `unitIds` | string[] |  | max 50 items |
| `color` | string \| null |  | max 20 chars |
| `description` | string \| null |  | max 500 chars |

#### `GET /teams/{id}` — teams.get

One sales team with its members (user id, role, accepting leads). (ทีมขาย 1 ทีม)

#### `PATCH /teams/{id}` — teams.update

Rename a team or change its branches, colour or description. (แก้ไขทีมขาย)

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `name` | string |  | max 80 chars, min 1 |
| `unitIds` | string[] |  | max 50 items |
| `color` | string \| null |  | max 20 chars |
| `description` | string \| null |  | max 500 chars |

#### `PUT /teams/{id}/members` — teams.members.set

Set the team's members in one call: listed users are added or updated (role, accepting leads), everyone else is removed. (ตั้งสมาชิกทีม)

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `members` | object[] | yes | max 200 items |

#### `POST /teams/{id}/archive` — teams.archive

Archive a team (members and history are kept; it no longer appears in lists). (เก็บถาวรทีมขาย)

### E-mail

| Operation | Method and path | Kind | Scope | Summary |
| --- | --- | --- | --- | --- |
| `emails.threads.list` | `GET /emails/threads` | read | `crm.email.read` | List e-mail threads this key can see (newest first): subject, snippet, direction, message count and the linked contact, company and deal. Headers and snippet only - the message bodies are in GET /emails/threads/{threadKey}. |
| `emails.thread.get` | `GET /emails/threads/{threadKey}` | read | `crm.email.read` | One e-mail thread: every message of it this key may see, oldest first. A thread nobody of this key's scope may see answers 404. |
| `emails.send` | `POST /emails/send` | write | `crm.email.send` | Send one e-mail to ONE contact (the address on the contact record - the API never takes a free-text recipient). Give subject and body, or a templateId with vars. The customer's marketing consent is checked first; a contact who opted out answers 409. To write to many contacts at once use POST /emails/send-bulk, which needs confirm and a reason. |
| `emails.sendBulk` | `POST /emails/send-bulk` | **danger** | `crm.email.send` | Send the same e-mail to up to 500 contacts (one message per contact, each checked against that customer's consent). Needs confirm: true and a reason of at least 5 characters; the reason goes into the audit log. The answer reports how many were sent, queued or failed and names the contacts that were skipped with the Thai reason. |
| `emails.schedule` | `POST /emails/schedule` | write | `crm.email.send` | Queue one e-mail to one contact for a time in the future (scheduledAt, ISO-8601). The minute job sends it; a time in the past is sent at once. |
| `emails.draft` | `POST /emails/draft` | read | `crm.email.read` | Build a draft e-mail for one contact WITHOUT sending anything: the suggested subject, an empty body with the sender's signature, and the shop's templates to choose from. Nothing is written and no message is created - feed the result to POST /emails/send when the person agrees. |
| `emails.userSettings.get` | `GET /emails/user-settings` | read | `crm.email.settings` | The sender settings of the person this key acts for (from name, from address, reply-to mode, copy-to and the HTML signature). null = never set. |
| `emails.userSettings.set` | `PUT /emails/user-settings` | write | `crm.email.settings` | Change the sender settings of the person this key acts for: from name, from address, reply-to mode (SHARK, STAFF, SELF, CUSTOM) and address, copy mode (NONE, IN, OUT, BOTH) and address, and the signature (field `signature`, HTML, sanitised before it is stored). |
| `emails.routing.get` | `GET /emails/routing` | read | `crm.email.settings` | How this shop's CRM sends and receives e-mail: mode (SHARED = the shared SHARK address, DOMAIN = the shop's verified domain), from name and address, reply-to and copy rules, whether the inbox is on and the address customers reply to. The raw inbox key is never returned. |
| `emails.routing.set` | `PUT /emails/routing` | write | `crm.email.settings` | Change how the shop sends e-mail: mode (SHARED or DOMAIN - DOMAIN needs a verified domain), from name and address, reply-to mode and address, copy mode and address, whether the CRM inbox is on, open and click tracking, and how many days message bodies are kept. |
| `emails.inbound.rotate` | `POST /emails/inbound/rotate-key` | **danger** | `crm.email.settings` | Give the CRM inbox a new address. The old address stops accepting mail at once, so anything a customer replies to it is lost - needs confirm: true and a reason. The answer carries the new address; put it in the shop's forwarding rule right away. |
| `emails.templates.list` | `GET /emails/templates` | read | `crm.email.read` | The shop's e-mail templates (name, subject, body with {{contact.firstName}}-style variables, category and whether they are active). |
| `emails.templates.upsert` | `PUT /emails/templates` | write | `crm.email.settings` | Create an e-mail template, or change one by sending its id. The body is sanitised before it is stored; two templates cannot share a name. |
| `emails.templates.delete` | `DELETE /emails/templates/{id}` | **danger** | `crm.email.settings` | Delete an e-mail template. A sequence step or an e-mail that is queued for later and points at it stops working, so this needs confirm: true and a reason. The answer reports what still used it as inUse: { sequences, scheduled } - the same counts land in the audit log. |

#### `GET /emails/threads` — emails.threads.list

List e-mail threads this key can see (newest first): subject, snippet, direction, message count and the linked contact, company and deal. Headers and snippet only - the message bodies are in GET /emails/threads/{threadKey}. (รายการเธรดอีเมล) AI tool: `crm_email_thread`.

Query:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `take` | integer |  | <= 100 |
| `cursor` | string |  | max 200 chars, min 1 |
| `contactId` | string |  | max 64 chars, min 1 |
| `companyId` | string |  | max 64 chars, min 1 |
| `dealId` | string |  | max 64 chars, min 1 |
| `unmatched` | `0` \| `1` \| `true` \| `false` |  |  |
| `q` | string |  | max 120 chars |

#### `GET /emails/threads/{threadKey}` — emails.thread.get

One e-mail thread: every message of it this key may see, oldest first. A thread nobody of this key's scope may see answers 404. (เธรดอีเมล)

#### `POST /emails/send` — emails.send

Send one e-mail to ONE contact (the address on the contact record - the API never takes a free-text recipient). Give subject and body, or a templateId with vars. The customer's marketing consent is checked first; a contact who opted out answers 409. To write to many contacts at once use POST /emails/send-bulk, which needs confirm and a reason. (ส่งอีเมล) AI tool: `crm_send_email`.

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `contactId` | string | yes | max 64 chars, min 1 |
| `subject` | string |  | max 300 chars, min 1 |
| `body` | string |  | max 512000 chars |
| `bodyHtml` | string |  | max 512000 chars |
| `templateId` | string \| null |  | max 64 chars, min 1 |
| `vars` | object |  |  |
| `dealId` | string \| null |  | max 64 chars, min 1 |
| `companyId` | string \| null |  | max 64 chars, min 1 |
| `replyToEmailId` | string \| null |  | max 64 chars, min 1 |

#### `POST /emails/send-bulk` — emails.sendBulk

Send the same e-mail to up to 500 contacts (one message per contact, each checked against that customer's consent). Needs confirm: true and a reason of at least 5 characters; the reason goes into the audit log. The answer reports how many were sent, queued or failed and names the contacts that were skipped with the Thai reason. (ส่งอีเมลเป็นกลุ่ม)

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `contactIds` | string[] | yes | max 500 items |
| `subject` | string |  | max 300 chars, min 1 |
| `body` | string |  | max 512000 chars |
| `bodyHtml` | string |  | max 512000 chars |
| `templateId` | string \| null |  | max 64 chars, min 1 |
| `vars` | object |  |  |
| `scheduledAt` | string |  | max 40 chars |
| `reason` | string | yes | max 500 chars, min 5 |
| `confirm` | boolean `true` | yes | checked before the schema |

#### `POST /emails/schedule` — emails.schedule

Queue one e-mail to one contact for a time in the future (scheduledAt, ISO-8601). The minute job sends it; a time in the past is sent at once. (ตั้งเวลาส่งอีเมล)

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `contactId` | string | yes | max 64 chars, min 1 |
| `subject` | string |  | max 300 chars, min 1 |
| `body` | string |  | max 512000 chars |
| `bodyHtml` | string |  | max 512000 chars |
| `templateId` | string \| null |  | max 64 chars, min 1 |
| `vars` | object |  |  |
| `dealId` | string \| null |  | max 64 chars, min 1 |
| `companyId` | string \| null |  | max 64 chars, min 1 |
| `replyToEmailId` | string \| null |  | max 64 chars, min 1 |
| `scheduledAt` | string | yes | max 40 chars |

#### `POST /emails/draft` — emails.draft

Build a draft e-mail for one contact WITHOUT sending anything: the suggested subject, an empty body with the sender's signature, and the shop's templates to choose from. Nothing is written and no message is created - feed the result to POST /emails/send when the person agrees. (ร่างอีเมล) AI tool: `crm_draft_email`.

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `contactId` | string | yes | max 64 chars, min 1 |
| `goal` | string |  | max 300 chars |
| `templateId` | string \| null |  | max 64 chars, min 1 |

#### `GET /emails/user-settings` — emails.userSettings.get

The sender settings of the person this key acts for (from name, from address, reply-to mode, copy-to and the HTML signature). null = never set. (ตั้งค่าผู้ส่งรายคน)

Query:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `userId` | string |  | max 64 chars, min 1 |

#### `PUT /emails/user-settings` — emails.userSettings.set

Change the sender settings of the person this key acts for: from name, from address, reply-to mode (SHARK, STAFF, SELF, CUSTOM) and address, copy mode (NONE, IN, OUT, BOTH) and address, and the signature (field `signature`, HTML, sanitised before it is stored). (แก้ตั้งค่าผู้ส่งรายคน)

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `userId` | string |  | max 64 chars, min 1 |
| `fromName` | string \| null |  | max 120 chars |
| `fromAddr` | string \| null |  | max 200 chars |
| `replyToMode` | `SHARK` \| `STAFF` \| `SELF` \| `CUSTOM` |  |  |
| `replyToAddr` | string \| null |  | max 200 chars |
| `copyMode` | `NONE` \| `IN` \| `OUT` \| `BOTH` |  |  |
| `copyToAddr` | string \| null |  | max 200 chars |
| `signature` | string \| null |  | max 4000 chars |
| `signatureHtml` | string \| null |  | max 4000 chars |

#### `GET /emails/routing` — emails.routing.get

How this shop's CRM sends and receives e-mail: mode (SHARED = the shared SHARK address, DOMAIN = the shop's verified domain), from name and address, reply-to and copy rules, whether the inbox is on and the address customers reply to. The raw inbox key is never returned. (ที่อยู่ส่ง/รับอีเมลของร้าน)

#### `PUT /emails/routing` — emails.routing.set

Change how the shop sends e-mail: mode (SHARED or DOMAIN - DOMAIN needs a verified domain), from name and address, reply-to mode and address, copy mode and address, whether the CRM inbox is on, open and click tracking, and how many days message bodies are kept. (แก้ที่อยู่ส่ง/รับอีเมลของร้าน)

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `mode` | `SHARED` \| `SHARK` \| `DOMAIN` |  |  |
| `fromName` | string \| null |  | max 120 chars |
| `fromAddr` | string \| null |  | max 200 chars |
| `replyToMode` | `SHARK` \| `STAFF` \| `SELF` \| `CUSTOM` |  |  |
| `replyToAddr` | string \| null |  | max 200 chars |
| `copyMode` | `NONE` \| `IN` \| `OUT` \| `BOTH` |  |  |
| `copyToAddr` | string \| null |  | max 200 chars |
| `inboundEnabled` | boolean |  |  |
| `trackOpens` | boolean |  |  |
| `trackClicks` | boolean |  |  |
| `allowUserOverride` | boolean |  |  |
| `strangerToLead` | boolean |  |  |
| `retentionDays` | integer |  | <= 3650 |

#### `POST /emails/inbound/rotate-key` — emails.inbound.rotate

Give the CRM inbox a new address. The old address stops accepting mail at once, so anything a customer replies to it is lost - needs confirm: true and a reason. The answer carries the new address; put it in the shop's forwarding rule right away. (หมุนกุญแจกล่องอีเมล)

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `reason` | string | yes | max 500 chars, min 5 |
| `confirm` | boolean `true` | yes | checked before the schema |

#### `GET /emails/templates` — emails.templates.list

The shop's e-mail templates (name, subject, body with {{contact.firstName}}-style variables, category and whether they are active). (รายการแม่แบบอีเมล)

Query:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `take` | integer |  | <= 100 |
| `cursor` | string |  | max 200 chars, min 1 |

#### `PUT /emails/templates` — emails.templates.upsert

Create an e-mail template, or change one by sending its id. The body is sanitised before it is stored; two templates cannot share a name. (บันทึกแม่แบบอีเมล)

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `id` | string \| null |  | max 64 chars, min 1 |
| `name` | string | yes | max 120 chars, min 1 |
| `subject` | string | yes | max 300 chars, min 1 |
| `body` | string |  | max 512000 chars |
| `bodyHtml` | string |  | max 512000 chars |
| `category` | string \| null |  | max 60 chars |
| `active` | boolean |  |  |

#### `DELETE /emails/templates/{id}` — emails.templates.delete

Delete an e-mail template. A sequence step or an e-mail that is queued for later and points at it stops working, so this needs confirm: true and a reason. The answer reports what still used it as inUse: { sequences, scheduled } - the same counts land in the audit log. (ลบแม่แบบอีเมล)

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `reason` | string | yes | max 500 chars, min 5 |
| `confirm` | boolean `true` | yes | checked before the schema |

### Follow-up sequences

| Operation | Method and path | Kind | Scope | Summary |
| --- | --- | --- | --- | --- |
| `sequences.list` | `GET /sequences` | read | `crm.sequence.manage` | List the shop's follow-up sequences: name, live version, whether they accept new people, how many steps and how many contacts are in each state. |
| `sequences.get` | `GET /sequences/{id}` | read | `crm.sequence.manage` | One sequence with its steps in order (e-mail, LINE, SMS, task and wait steps) and its sending rules. |
| `sequences.create` | `POST /sequences` | write | `crm.sequence.manage` | Create a follow-up sequence (version 1) with its steps: EMAIL, LINE, SMS, TASK and WAIT. Sending rules: business days only, a send window in Thai time, a cap on how many contacts may walk it at once, and which outcomes stop it. |
| `sequences.enroll` | `POST /sequences/{id}/enroll` | write | `crm.sequence.enroll` | Put one contact into this sequence, optionally tied to a deal. A contact who asked for no marketing is skipped (the answer says so). A contact who already walks this sequence answers 409 unless replace is true, which stops the old run first. |
| `sequences.bulkEnroll` | `POST /sequences/{id}/bulk-enroll` | **danger** | `crm.sequence.enroll` | Put up to 500 contacts into this sequence in one call. Needs confirm: true and a reason - the messages that go out cannot be recalled. Contacts who opted out or are already in the sequence are reported back, not silently dropped. |
| `sequences.stop` | `POST /sequences/enrollments/{id}/stop` | write | `crm.sequence.enroll` | Stop one enrollment (the id of the enrollment, not of the sequence). The remaining steps are cancelled; the history of what was sent is kept. |
| `sequences.stats` | `GET /sequences/{id}/stats` | read | `crm.sequence.manage` | Per-step counters of one sequence version: sent, skipped, failed and how many contacts sit on each step, plus totals per state. |

#### `GET /sequences` — sequences.list

List the shop's follow-up sequences: name, live version, whether they accept new people, how many steps and how many contacts are in each state. (รายการลำดับการติดตาม)

Query:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `take` | integer |  | <= 100 |
| `cursor` | string |  | max 200 chars, min 1 |

#### `GET /sequences/{id}` — sequences.get

One sequence with its steps in order (e-mail, LINE, SMS, task and wait steps) and its sending rules. (ลำดับการติดตาม)

#### `POST /sequences` — sequences.create

Create a follow-up sequence (version 1) with its steps: EMAIL, LINE, SMS, TASK and WAIT. Sending rules: business days only, a send window in Thai time, a cap on how many contacts may walk it at once, and which outcomes stop it. (สร้างลำดับการติดตาม)

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `name` | string | yes | max 120 chars, min 1 |
| `description` | string \| null |  | max 500 chars |
| `stopOnReply` | boolean |  |  |
| `stopOnWon` | boolean |  |  |
| `stopOnLost` | boolean |  |  |
| `businessDaysOnly` | boolean |  |  |
| `sendWindow` | object \| null |  |  |
| `maxActive` | integer \| null |  | <= 100000 |
| `active` | boolean |  |  |
| `steps` | object[] | yes | max 50 items |

#### `POST /sequences/{id}/enroll` — sequences.enroll

Put one contact into this sequence, optionally tied to a deal. A contact who asked for no marketing is skipped (the answer says so). A contact who already walks this sequence answers 409 unless replace is true, which stops the old run first. (ใส่ผู้ติดต่อเข้าลำดับ) AI tool: `crm_enroll_sequence`.

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `contactId` | string | yes | max 64 chars, min 1 |
| `dealId` | string \| null |  | max 64 chars, min 1 |
| `replace` | boolean |  |  |

#### `POST /sequences/{id}/bulk-enroll` — sequences.bulkEnroll

Put up to 500 contacts into this sequence in one call. Needs confirm: true and a reason - the messages that go out cannot be recalled. Contacts who opted out or are already in the sequence are reported back, not silently dropped. (ใส่ผู้ติดต่อเข้าลำดับเป็นกลุ่ม)

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `contactIds` | string[] | yes | max 500 items |
| `replace` | boolean |  |  |
| `reason` | string | yes | max 500 chars, min 5 |
| `confirm` | boolean `true` | yes | checked before the schema |

#### `POST /sequences/enrollments/{id}/stop` — sequences.stop

Stop one enrollment (the id of the enrollment, not of the sequence). The remaining steps are cancelled; the history of what was sent is kept. (หยุดลำดับของผู้ติดต่อ)

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `reason` | string \| null |  | max 500 chars |

#### `GET /sequences/{id}/stats` — sequences.stats

Per-step counters of one sequence version: sent, skipped, failed and how many contacts sit on each step, plus totals per state. (สถิติลำดับการติดตาม) Uses the report rate bucket.

Query:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `version` | integer |  | <= 1000 |

### Lead assignment

| Operation | Method and path | Kind | Scope | Summary |
| --- | --- | --- | --- | --- |
| `assignment.rules.list` | `GET /assignment/rules` | read | `crm.assignment.manage` | The shop's lead assignment rules in the order they are tried: mode, the people or team they hand to, their conditions and the open-work cap. |
| `assignment.rules.create` | `POST /assignment/rules` | write | `crm.assignment.manage` | Add a lead assignment rule at the end of the order. mode FIXED (always these people), ROUND_ROBIN (take turns), TEAM_LEAD (the team's lead) or LEAST_OPEN (whoever has the fewest open deals). Conditions decide which leads the rule catches. |
| `assignment.simulate` | `POST /assignment/simulate` | read | `crm.assignment.manage` | Dry run: for each draft lead in rows[], answer who would get it, through which rule and why. Writes nothing at all - no contact, no move of the round-robin cursor - so it is safe to call before importing a list. At most 200 rows per call. |

#### `GET /assignment/rules` — assignment.rules.list

The shop's lead assignment rules in the order they are tried: mode, the people or team they hand to, their conditions and the open-work cap. (รายการกฎแจกลีด)

Query:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `take` | integer |  | <= 100 |
| `cursor` | string |  | max 200 chars, min 1 |

#### `POST /assignment/rules` — assignment.rules.create

Add a lead assignment rule at the end of the order. mode FIXED (always these people), ROUND_ROBIN (take turns), TEAM_LEAD (the team's lead) or LEAST_OPEN (whoever has the fewest open deals). Conditions decide which leads the rule catches. (เพิ่มกฎแจกลีด)

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `name` | string | yes | max 120 chars, min 1 |
| `mode` | `FIXED` \| `ROUND_ROBIN` \| `TEAM_LEAD` \| `LEAST_OPEN` | yes |  |
| `userIds` | string[] |  | max 100 items |
| `teamId` | string \| null |  | max 64 chars, min 1 |
| `maxOpenPerUser` | integer \| null |  | <= 10000 |
| `conditions` | object \| null |  |  |
| `active` | boolean |  |  |

#### `POST /assignment/simulate` — assignment.simulate

Dry run: for each draft lead in rows[], answer who would get it, through which rule and why. Writes nothing at all - no contact, no move of the round-robin cursor - so it is safe to call before importing a list. At most 200 rows per call. (ทดลองแจกลีด) Uses the report rate bucket.

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `rows` | object[] | yes | max 200 items |

### Scoring

| Operation | Method and path | Kind | Scope | Summary |
| --- | --- | --- | --- | --- |
| `scoring.rules.list` | `GET /scoring/rules` | read | `crm.score.manage` | The shop's scoring rules in order: which event gives how many points, for how long they count, the per-day cap and whether the rule is on. |
| `scoring.rules.create` | `POST /scoring/rules` | write | `crm.score.manage` | Add a scoring rule: the event that earns the points (only events that really reach the scorer can be chosen), the points (-1000..1000), how many days a point stays alive, a cap per contact per day and optional conditions. |
| `scoring.recompute` | `POST /scoring/recompute` | **danger** | `crm.score.manage` | Add the points up again from the log: for one contact (contactId) or for the whole shop (all: true). Needs confirm: true and a reason of at least 5 characters. Send dryRun: true (together with confirm) to see what would change without writing. |

#### `GET /scoring/rules` — scoring.rules.list

The shop's scoring rules in order: which event gives how many points, for how long they count, the per-day cap and whether the rule is on. (รายการกฎคะแนน)

Query:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `take` | integer |  | <= 100 |
| `cursor` | string |  | max 200 chars, min 1 |

#### `POST /scoring/rules` — scoring.rules.create

Add a scoring rule: the event that earns the points (only events that really reach the scorer can be chosen), the points (-1000..1000), how many days a point stays alive, a cap per contact per day and optional conditions. (เพิ่มกฎคะแนน)

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `name` | string | yes | max 120 chars, min 1 |
| `event` | `forms.submission.received` \| `chat.message.received` \| `crm.activity.completed` \| `crm.email.opened` \| `crm.email.clicked` \| `crm.email.received` \| `crm.web.identified` \| `crm.deal.quotation.issued` \| `crm.contact.inactive` | yes |  |
| `points` | integer | yes | <= 1000 |
| `conditions` | object \| null |  |  |
| `expiresDays` | integer \| null |  | <= 3650 |
| `maxPerDay` | integer \| null |  | <= 1000 |
| `active` | boolean |  |  |

#### `POST /scoring/recompute` — scoring.recompute

Add the points up again from the log: for one contact (contactId) or for the whole shop (all: true). Needs confirm: true and a reason of at least 5 characters. Send dryRun: true (together with confirm) to see what would change without writing. (คิดคะแนนใหม่) Uses the report rate bucket.

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `contactId` | string |  | max 64 chars, min 1 |
| `all` | boolean |  |  |
| `dryRun` | boolean |  |  |
| `reason` | string | yes | max 500 chars, min 5 |
| `confirm` | boolean `true` | yes | checked before the schema |

### Tracked links

| Operation | Method and path | Kind | Scope | Summary |
| --- | --- | --- | --- | --- |
| `tracking.links.list` | `GET /tracking/links` | read | `crm.tracking.manage` | The shop's tracked short links (newest first): code, destination, name, channel, whether it is on, total clicks and unique clicks. |
| `tracking.links.create` | `POST /tracking/links` | write | `crm.tracking.manage` | Make a tracked short link to an http or https address. A code of 6-32 letters, digits, - and _ can be asked for; otherwise one is generated. Clicks are counted per link and, when the visitor is known, land on the contact's timeline. |
| `tracking.links.stats` | `GET /tracking/links/{id}/stats` | read | `crm.tracking.manage` | Clicks of one tracked link: the totals and the clicks per day (Thai calendar day) over the last `days` days (1-365, 30 by default). |

#### `GET /tracking/links` — tracking.links.list

The shop's tracked short links (newest first): code, destination, name, channel, whether it is on, total clicks and unique clicks. (รายการลิงก์ติดตาม)

Query:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `take` | integer |  | <= 100 |
| `cursor` | string |  | max 200 chars, min 1 |

#### `POST /tracking/links` — tracking.links.create

Make a tracked short link to an http or https address. A code of 6-32 letters, digits, - and _ can be asked for; otherwise one is generated. Clicks are counted per link and, when the visitor is known, land on the contact's timeline. (สร้างลิงก์ติดตาม)

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `url` | string | yes | max 500 chars, http(s) URL |
| `name` | string \| null |  | max 120 chars |
| `label` | string \| null |  | max 120 chars |
| `channel` | string \| null |  | max 40 chars |
| `code` | string \| null |  | max 32 chars |

#### `GET /tracking/links/{id}/stats` — tracking.links.stats

Clicks of one tracked link: the totals and the clicks per day (Thai calendar day) over the last `days` days (1-365, 30 by default). (สถิติลิงก์ติดตาม) Uses the report rate bucket.

Query:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `days` | integer |  | <= 365 |

### Automation rules

| Operation | Method and path | Kind | Scope | Summary |
| --- | --- | --- | --- | --- |
| `automation.rules.list` | `GET /automation/rules` | read | `crm.automation.manage` | The CRM automation rules of this system: name, whether they are on, their trigger and conditions, the steps they run, how many times they ran in total and this month, and when they last ran. |
| `automation.dryRun` | `POST /automation/dry-run` | read | `crm.automation.manage` | Try a draft rule against real data of the last `days` days (1-90, 30 by default) and answer which records it would have caught. Writes nothing: no run row, no event, no message - so it is safe to call before switching a rule on. |

#### `GET /automation/rules` — automation.rules.list

The CRM automation rules of this system: name, whether they are on, their trigger and conditions, the steps they run, how many times they ran in total and this month, and when they last ran. (รายการกฎอัตโนมัติ)

Query:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `take` | integer |  | <= 100 |
| `cursor` | string |  | max 200 chars, min 1 |

#### `POST /automation/dry-run` — automation.dryRun

Try a draft rule against real data of the last `days` days (1-90, 30 by default) and answer which records it would have caught. Writes nothing: no run row, no event, no message - so it is safe to call before switching a rule on. (ทดลองกฎอัตโนมัติ) Uses the report rate bucket.

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `name` | string | yes | max 120 chars, min 1 |
| `trigger` | object | yes |  |
| `conditions` | object \| null |  |  |
| `actions` | object[] | yes | max 20 items |
| `pipelineId` | string \| null |  | max 64 chars, min 1 |
| `days` | integer |  | <= 90 |

### Notification preferences

| Operation | Method and path | Kind | Scope | Summary |
| --- | --- | --- | --- | --- |
| `notifications.prefs.get` | `GET /notifications/prefs` | read | `crm.contact.read` | The CRM notification settings of the person this key acts for: which of the 10 CRM subjects reach them on which channel (in-app, push, e-mail), their own quiet hours (null = the shop's), and the shop defaults they override. A key only ever sees its own owner's settings. |
| `notifications.prefs.set` | `PUT /notifications/prefs` | write | `crm.contact.read` | Change the CRM notification settings of the person this key acts for: switch a subject on or off per channel (IN_APP, PUSH, EMAIL) and set or clear their own quiet hours (quietHours: null = follow the shop). Only the key owner's own settings can be changed - there is no userId field, so one key can never mute a colleague. |

#### `GET /notifications/prefs` — notifications.prefs.get

The CRM notification settings of the person this key acts for: which of the 10 CRM subjects reach them on which channel (in-app, push, e-mail), their own quiet hours (null = the shop's), and the shop defaults they override. A key only ever sees its own owner's settings. (การแจ้งเตือนของฉัน)

#### `PUT /notifications/prefs` — notifications.prefs.set

Change the CRM notification settings of the person this key acts for: switch a subject on or off per channel (IN_APP, PUSH, EMAIL) and set or clear their own quiet hours (quietHours: null = follow the shop). Only the key owner's own settings can be changed - there is no userId field, so one key can never mute a colleague. (แก้การแจ้งเตือนของฉัน)

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `notifications` | object |  |  |
| `quietHours` | object \| null |  |  |

### Settings

| Operation | Method and path | Kind | Scope | Summary |
| --- | --- | --- | --- | --- |
| `settings.get` | `GET /settings` | read | `crm.settings.manage` | The CRM system settings: uiVersion (2 = CRM v2 on), bridgesEnabled, chatToLead. |
| `settings.set` | `PUT /settings` | write | `crm.settings.manage` | Change CRM settings: chatToLead (a chat from an unknown customer opens a lead) and bridgesEnabled (links to other modules). |

#### `GET /settings` — settings.get

The CRM system settings: uiVersion (2 = CRM v2 on), bridgesEnabled, chatToLead. (ตั้งค่า CRM)

#### `PUT /settings` — settings.set

Change CRM settings: chatToLead (a chat from an unknown customer opens a lead) and bridgesEnabled (links to other modules). (แก้ตั้งค่า CRM)

Body:

| Field | Type | Required | Limits |
| --- | --- | --- | --- |
| `chatToLead` | boolean |  |  |
| `bridgesEnabled` | boolean |  |  |

## AI tools (skill `crm`)

The in-app assistant and outside agents (`POST https://shark.in.th/api/v1/ai/tools/<name>`, manifest `GET https://shark.in.th/api/v1/ai/skills/crm`) reach the CRM through these tools. Read tools run at once with the rights of the person asking (never more; without a known person they refuse). Write tools only create a proposal that a person confirms in the app. A key without any `crm.*` scope cannot use any of them, `crm_create_lead` included.

| Tool | Kind | Operation | Scope |
| --- | --- | --- | --- |
| `crm_search` | read (runs at once) | `search` | `crm.contact.read` |
| `crm_contact_360` | read (runs at once) | `contacts.get` | `crm.contact.read` |
| `crm_create_lead` | write (proposal) | `contacts.create` | `crm.contact.create` |
| `crm_assign` | write (proposal) | `contacts.assign` | `crm.contact.update` |
| `crm_convert` | write (proposal) | `contacts.convert` | `crm.contact.convert` |
| `crm_company_360` | read (runs at once) | `companies.get` | `crm.company.read` |
| `crm_create_company` | write (proposal) | `companies.create` | `crm.company.create` |
| `crm_pipeline_summary` | read (runs at once) | `deals.board` | `crm.deal.read` |
| `crm_forecast` | read (runs at once) | `deals.forecast` | `crm.report.view` |
| `crm_deal_360` | read (runs at once) | `deals.get` | `crm.deal.read` |
| `crm_create_deal` | write (proposal) | `deals.create` | `crm.deal.create` |
| `crm_update_deal` | write (proposal) | `deals.update` | `crm.deal.update` |
| `crm_move_deal` | write (proposal) | `deals.move` | `crm.deal.move` |
| `crm_log_activity` | write (proposal) | `activities.log` | `crm.activity.create` |
| `crm_records_query` | read (runs at once) | `records.list` | `crm.record.read` |
| `crm_email_thread` | read (runs at once) | `emails.threads.list` | `crm.email.read` |
| `crm_send_email` | write (proposal) | `emails.send` | `crm.email.send` |
| `crm_draft_email` | read (runs at once) | `emails.draft` | `crm.email.read` |
| `crm_enroll_sequence` | write (proposal) | `sequences.enroll` | `crm.sequence.enroll` |
| `crm_score_explain` | read (runs at once) | `scoring.explain` | `crm.contact.read` |
| `crm_stale_deals` | read (runs at once) | `deals.stale.list` | `crm.deal.read` |
| `crm_activities_due` | read (runs at once) | `activities.due.list` | `crm.activity.read` |
| `crm_set_next_step` | write (proposal) | `deals.nextStep.set` | `crm.deal.update` |

`crm_create_lead` keeps its old name. On a shop that still runs the previous CRM screens it proposes the old `crm_create_lead` action (name, phone, e-mail) exactly as before.

## Webhooks

Subscribe an endpoint (https only) in CRM > Settings > API or in Settings > Apps. Deliveries are `POST` with a body `{ type, payload, sentAt }`, header `X-Shark-Event`, `X-Shark-Timestamp`, `X-Shark-Signature` (HMAC-SHA256 of the raw body with the endpoint secret, hex) and `X-Shark-Signature-V2` (HMAC-SHA256 of `<timestamp>.<body>`). Delivery is at least once; handlers must be idempotent. Payloads carry ids only - read the record through this API.

| Event | Payload (ids only) |
| --- | --- |
| `crm.deal.won` | `dealId`, related ids |
| `team.updated` | `teamId`, `change` |
| `custom.record.created` | `recordId`, `objectKey`, parent ids |
| `custom.record.updated` | `recordId`, `objectKey`, parent ids |
| `custom.record.archived` | `recordId`, `objectKey`, parent ids |
| `crm.company.created` | `companyId`, related ids |
| `crm.company.updated` | `companyId`, related ids |
| `crm.company.merged` | `companyId`, related ids |
| `crm.contact.created` | `contactId`, related ids |
| `crm.contact.updated` | `contactId`, related ids |
| `crm.contact.assigned` | `contactId`, related ids |
| `crm.contact.converted` | `contactId`, related ids |
| `crm.contact.merged` | `contactId`, related ids |
| `crm.deal.created` | `dealId`, related ids |
| `crm.deal.stage.changed` | `dealId`, related ids |
| `crm.deal.lost` | `dealId`, related ids |
| `crm.deal.reopened` | `dealId`, related ids |
| `crm.deal.reassigned` | `dealId`, related ids |
| `crm.deal.updated` | `dealId`, related ids |
| `crm.activity.logged` | `activityId`, related ids |
| `crm.activity.completed` | `activityId`, related ids |
| `crm.score.changed` | `contactId`, `band` (+ `from`, `to`, `ruleId` on `crm.score.changed`) — numbers and ids only |
| `crm.score.threshold` | `contactId`, `band` (+ `from`, `to`, `ruleId` on `crm.score.changed`) — numbers and ids only |
| `crm.deal.quotation.issued` | `dealId`, related ids |
| `crm.deal.stale` | `dealId`, `days` - ids and numbers only |
| `crm.activity.overdue` | `activityId`, related ids |
| `crm.sequence.enrolled` | `enrollmentId`, `sequenceId`, `contactId`, related ids |
| `crm.sequence.finished` | `enrollmentId`, `sequenceId`, `contactId`, related ids |
| `crm.activity.reminder` | `activityId`, related ids |
| `crm.email.sent` | `emailId`, `threadKey`, `contactId`, related ids (never an address, subject, body or clicked URL) |
| `crm.email.received` | `emailId`, `threadKey`, `contactId`, related ids (never an address, subject, body or clicked URL) |
| `crm.email.opened` | `emailId`, `threadKey`, `contactId`, related ids (never an address, subject, body or clicked URL) |
| `crm.email.clicked` | `emailId`, `threadKey`, `contactId`, related ids (never an address, subject, body or clicked URL) |
| `crm.email.replied` | `emailId`, `threadKey`, `contactId`, related ids (never an address, subject, body or clicked URL) |
| `crm.email.bounced` | `emailId`, `threadKey`, `contactId`, related ids (never an address, subject, body or clicked URL) |
| `crm.web.identified` | `contactId`, `systemId`, `visitorId`, `sessionCount`, `pageViews`, `by` (never a name, address or raw IP) |

## Example

```bash
# a new lead from a web form (every write needs an Idempotency-Key)
curl -sS -X POST "https://shark.in.th/api/v1/crm/contacts" \
  -H "Authorization: Bearer $SHARK_API_KEY" -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Somchai","phone":"0812345678","sourceKind":"WEB_FORM"}'

# move a deal to the next stage
curl -sS -X PUT "https://shark.in.th/api/v1/crm/deals/<dealId>/stage" \
  -H "Authorization: Bearer $SHARK_API_KEY" -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" -d '{"stageId":"<stageId>"}'
```

## Planned (not available yet)

These operations are designed but not registered yet; calling them answers 404. They move into the tables above when their work order lands.

| Work order | Area | Planned operations |
| --- | --- | --- |
| C1.11 / C2.11 | Contacts | `contacts.setLifecycle`, `contacts.timeline`, `contacts.duplicates.dismiss`, `contacts.import.status` |
| C2.11 | Companies | `companies.setParent`, `companies.contacts.setPrimary`, `companies.contacts.setRole`, `companies.import.start`, `companies.importFromAccount`, `companies.outstanding` |
| C2.11 | Deals | `deals.reopen`, `deals.setCollaborators`, `deals.invoice`, `deals.history`, `pipelines.create`, `pipelines.update`, `stages.upsert`, `lostReasons.list` |
| C2.11 | Activities | `activities.update`, `activities.outcomes`, `activities.transcribe` |
| C2.11 | E-mail | `emails.attach`, `emails.sendTest`, `emails.domain.status` |
| C2.11 | Sequences and assignment | `sequences.update`, `sequences.archive`, `sequences.enrollments.list`, `assignment.rules.update`, `assignment.rules.delete`, `assignment.rules.reorder` |
| C2.11 | Scoring | `scoring.rules.update`, `scoring.rules.delete`, `scoring.rules.reorder`, `scoring.seed`, `scoring.settings.get`, `scoring.settings.set` |
| C2.11 | Tracking | `tracking.links.update`, `tracking.links.delete`, `tracking.web.get`, `tracking.web.set`, `tracking.stats`, `tracking.sessions` |
| C2.10 + C2.11 | Notification preferences | `notifications.templates.get`, `notifications.templates.set` |
| C2.11 | Automation | `automation.rules.get`, `automation.rules.create`, `automation.rules.update`, `automation.rules.toggle`, `automation.rules.delete`, `automation.runs.list` |
| C3.8 | Custom objects | `objects.get`, `records.move`, `records.timeline`, `records.import`, `records.byParent` |
| C3.8 | Visibility, quotas and commissions | `visibility.policies.list`, `visibility.policies.set`, `quotas.*`, `quotas.progress`, `commissions.rules.*`, `commissions.list`, `commissions.approve`, `commissions.reject`, `commissions.report` |
| C3.5 / C3.8 | Portal (customer session) | `portal.invite`, `portal.access.list`, `portal.access.revoke`, `p.me`, `p.quotations.*`, `p.invoices.*`, `p.receipts.list`, `p.documents.list`, `p.requests.*`, `p.contacts.*` |
| C3.8 | Reports and settings | `reports.*`, `reports.export`, `reports.schedule`, `settings.targets.set`, `settings.integrations.status`, `templates.list`, `templates.apply` |
| C3.4 | AI tools (8 more) | `8 tools of C3.4: crm_issue_quotation, crm_reports, crm_quota_progress, crm_commissions_mine, crm_stop_sequence, crm_create_record, crm_update_record, crm_create_task_card` |

## Glossary (Thai <-> English)

| ไทย | English | In the API |
| --- | --- | --- |
| ผู้ติดต่อ | contact | `/contacts` |
| บริษัท | company | `/companies` |
| ดีล | deal | `/deals` |
| ขั้น (ของดีล) | stage | `stageId` |
| pipeline | pipeline | `pipelineId` |
| lead (ผู้สนใจ) | lead | `leadStatus`, `lifecycleStage: LEAD` |
| กิจกรรม / งานติดตาม | activity / task | `/activities` |
| ผู้ดูแล | owner | `ownerUserId` |
| ทีมขาย | sales team | `/teams`, `teamId` |
| วัตถุกำหนดเอง | custom object | `/objects/{key}` |
| รายการ (ของวัตถุ) | record | `/objects/{key}/records` |
| ไม่รับข่าวสาร | marketing opt-out | `marketingOptOut` |
| เธรดอีเมล | e-mail thread | `/emails/threads`, `threadKey` |
| แม่แบบจดหมาย | e-mail template | `/emails/templates`, `templateId` |
| ลำดับการติดตาม | follow-up sequence | `/sequences` |
| การลงทะเบียน (ในลำดับ) | enrollment | `/sequences/enrollments/{id}/stop`, `enrollmentId` |
| กฎแจกลีด | lead assignment rule | `/assignment/rules` |
| คะแนนผู้ติดต่อ | contact score | `/contacts/{id}/score`, `score`, `band` |
| ลิงก์ติดตาม | tracked link | `/tracking/links` |
| กฎอัตโนมัติ | automation rule | `/automation/rules` |

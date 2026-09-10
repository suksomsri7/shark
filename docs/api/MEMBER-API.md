# SHARK Member API

Machine readable contract: `/api/v1/member/openapi.json` (OpenAPI 3.1.0, no API key needed).
Base URL: `https://shark.in.th/api/v1/member` - contract version 1.0.0 - 68 operations.
Generated from the operation registry by `scripts/gen-member-api-docs.mts`. Do not edit by hand: run the script.

## Who this is for

- **AI agents** working with a shop's members on behalf of its owner. Read the Conventions and the Error codes table first: every failure has a stable `code` to branch on, and `message_th` is already worded for a Thai shop owner, so it can be shown as is.
- **Developers** wiring another system into the membership (a website signup form, a POS of your own, a marketplace connector, a loyalty screen, a nightly report). Everything in this document is generated from the same registry the live API dispatches from, so nothing here can drift from the running code.

**Before anything else: this API carries personal data.** Names, phone numbers, birthdays, and whatever the shop decided to keep about its customers. Keys are per shop and per system, every read of a sensitive field is logged, and the shop can be asked by its customers to prove who saw what. Take only the fields you need, keep them no longer than you must, and never move them to a third party the shop did not name.

## Authentication and scopes

Send `Authorization: Bearer <api key>`. Keys are created by the shop owner in the member settings (Members > Settings > API); the raw key is shown once.

A key carries a list of scopes. Scopes are the same permission keys the human roles use, so a key can never do more than a person could. Bundles are ready made sets; the owner can still tick single scopes on top.

| Bundle | What it can do | Scopes |
| --- | --- | --- |
| `member-read` | Read the member system: members and their custom fields, tiers, points, loyalty cards, promotions, reviews and the acquisition report. Never sees sensitive member data, and writes nothing. | `member.customer.read` `member.tier.read` `member.point.read` `member.loyalty.read` `member.promo.read` `member.review.read` `member.report.view` |
| `member-operate` | Everything in member-read plus the counter work: register and edit members, import them, stamp loyalty cards, hand out rewards, issue promotions, adjust points and reply to reviews. Still never sees sensitive member data. | `member.customer.read` `member.tier.read` `member.point.read` `member.loyalty.read` `member.promo.read` `member.review.read` `member.report.view` `member.customer.create` `member.customer.update` `member.customer.import` `member.loyalty.stamp` `member.loyalty.fulfil` `member.promo.issue` `member.point.adjust` `member.review.reply` |
| `member-admin` | Every member permission: settings and custom fields, privacy and PDPA, tiers and their rules, gift cards, erasing a member, and managing the member API keys. This is the only bundle that can see sensitive member data, and only as far as the shop's own policy allows. | `member.customer.read` `member.tier.read` `member.point.read` `member.loyalty.read` `member.promo.read` `member.review.read` `member.report.view` `member.customer.create` `member.customer.update` `member.customer.import` `member.loyalty.stamp` `member.loyalty.fulfil` `member.promo.issue` `member.point.adjust` `member.review.reply` `member.customer.merge` `member.customer.export` `member.customer.delete` `member.sensitive.read` `member.tier.manage` `member.tier.setManual` `member.point.transfer` `member.loyalty.manage` `member.promo.manage` `member.giftcard.sell` `member.giftcard.manage` `member.referral.manage` `member.settings.manage` `member.privacy.manage` `member.api.manage` `member.tier.update` `member.plan.create` `member.plan.update` `member.subscription.create` `member.subscription.cancel` |

### Sensitive data and the bundle

A shop can mark any section or field of the member profile as **sensitive**: health notes, an emergency contact, anything it decides. Who may open those is a policy the shop owns (by role, by HR position, by department, optionally only inside the viewer's own branch), and every view is written to an access log.

| Bundle | Sensitive fields |
| --- | --- |
| `member-read` | Never. The section comes back as `visible: false` with no values at all. |
| `member-operate` | Never, same as above. |
| `member-admin` | Only when the shop's own policy allows it. |

This is not a scope you can add: it is decided by the bundle, on purpose. An integration that needs a health note has to be run by a person the shop trusted with it, not by a key left in a config file.

A key also **sees every member of the system it is bound to**, across branches: the shop owner issued the key and chose its scopes. A member of another shop, or of another member system, answers 404 - never 403.

A key is normally bound to one member system. If it is not, every call must carry `X-Shark-System: <AppSystem id>`. Calls that need a scope the key lacks fail with 403 `scope_missing` and the missing scope in `hint`.

## Conventions

These are the rules of the module, copied verbatim from the contract description in `/api/v1/member/openapi.json`:

REST API for the SHARK membership module. One API key works inside one member system (AppSystem of type MEMBER) and sees every member of that system.

Conventions that apply to every operation:
1. Authentication is `Authorization: Bearer <api key>`. The key carries its own scopes; an operation returns 403 `scope_missing` when the key lacks the scope listed as `x-shark-scope`.
2. A key belongs to one of three bundles. `member-read` may only read. `member-operate` may also register and edit members, stamp loyalty cards, issue promotions and adjust points. `member-admin` may do everything, including settings, privacy and tiers.
3. **Read and operate keys never see sensitive member data.** Sections and fields the shop marked as sensitive (health notes, emergency contacts, anything under a sensitive section) come back as `visible: false` with no values at all - not even for a shop owner's own key, unless that key holds the admin bundle. An admin key is then still filtered by the shop's own sensitive-access policy.
4. `X-Shark-System` selects the member system and is only needed when the key is not bound to one; if the key is bound and the header disagrees, the call fails with 403 `system_mismatch`.
5. Timestamps are ISO-8601 strings in UTC (`createdAt`, `lastActivityAt`, `linkedAt`). Money is in satang (`*Satang`, 100 satang = 1 baht) and points are whole numbers.
6. Phone numbers come back masked (`081-xxx-1234`) on list rows and on every card-sized shape, and identifiers of outside channels (`externalId` of a LINE or WhatsApp identity) are always masked. Send the full value when you write; you get the masked one back when you read.
7. Custom fields travel as `fields: { "<field key>": value }` in both directions. Field keys, types and choices come from `GET /fields/layout`; a value that does not fit its field fails with 422 `validation` and the field key in `details[]`.
8. Channels are a registry, not a fixed enum: read `GET /channels` for the keys accepted by consents, identities and attribution. A channel with `connected: false` still accepts an identity and a consent, but the shop cannot send messages through it yet.
9. Every write (POST, PATCH, PUT, DELETE) requires an `Idempotency-Key` header. Retrying with the same key and the same body replays the stored response with header `Idempotent-Replayed: true`; the same key with a different body fails with 409 `idempotency_conflict`.
10. Operations marked `x-shark-kind: danger` are hard to undo (merging two members, erasing a member under PDPA, forcing a tier by hand). They additionally require `confirm: true` (a real boolean) and a `reason` of at least 5 characters in the body; the reason is stored in the audit log. Some of them answer `{ applied: false, pending: true, approvalRequestId }` instead of doing the work, when the shop routes that action through its approval chain.
11. Success is `{ data, page?, requestId }`. Failure is `{ error: { code, message_th, message_en, hint?, details? }, requestId }` - see the `Error` schema for every code. `requestId` is also returned in the `X-Request-Id` header; quote it when reporting a problem.
12. A member the key cannot see answers 404 `not_found`, never 403 - the API never confirms that somebody is a member of another shop or of a branch this key does not cover.
13. Rate limits are per key and per class: 600 reads and 600 writes per minute, 60 reports per minute. A 429 response carries `Retry-After`; successful responses carry `X-RateLimit-Limit` and `X-RateLimit-Remaining`.
14. Operations under `/me` belong to the customer themself (the LIFF and in-app self-service lane) and need a customer session. A shop API key calling them gets 401 `customer_session_required`; no scope opens that lane.
15. Some list operations can also render CSV: send `Accept: text/csv` and, when the operation lists `text/csv` under its 200 response, you get `text/csv; charset=utf-8` with a UTF-8 BOM and `Content-Disposition: attachment` instead of the JSON envelope. Every cell is safe against spreadsheet formula injection.
16. Outgoing webhooks. The shop can subscribe an endpoint to any of these events: `member.created`, `member.updated`, `member.merged`, `member.identity.linked`, `member.tier.changed`, `member.tier.at_risk`, `member.consent.changed`, `member.sensitive.viewed`. Each delivery is `POST` with `X-Shark-Event`, a body of `{ type, payload, sentAt }` and header `X-Shark-Signature` = HMAC-SHA256 of the raw body with the endpoint secret, lowercase hex. Delivery is at least once (5 retries), so handlers must be idempotent. Full list with one example body per event: docs/api/MEMBER-API.md, section Webhooks.

### Shapes of a reply

- **`GET /members` pages.** `data` is `{ items, total, page, take }`; ask for the next page with `page=2`. `take` is 1-100 (default 50). Other lists answer `{ items, total }` in `data` without paging.
- **Custom fields travel in `fields`.** Both directions, keyed by the field key from `GET /fields/layout`. A profile read groups them into `sections[]` instead, because a section can be hidden as a whole.
- **No `Date` objects and no shop ids leak out.** Timestamps are ISO-8601 UTC strings or `null`; `tenantId` and `systemId` are never echoed back - the key already knows where it is.
- **Personal identifiers come back reduced.** `phoneMasked` on every card sized shape, and the `externalId` of a linked channel account is masked. The full phone is on the profile itself, for the operations that legitimately need it.
- **CSV.** One operation renders CSV when asked with `Accept: text/csv`: `GET /members`. The file is UTF-8 with a BOM and comes back as an attachment instead of the JSON envelope. `POST /members/export` is the other way out: it returns the CSV inline in `csv` and is audited.
- **Some writes answer "waiting".** When the shop routes an action through its approval chain, the reply is `{ applied: false, pending: true, approvalRequestId }` with HTTP 200. The work has **not** happened; somebody in the shop has to approve it. Poll the member, or subscribe to the matching webhook, instead of assuming success.

## Error codes

Branch on `error.code`, never on the message text. The list is shared by every SHARK REST module, so a few codes below can only come from another module; they are marked as such.

| Code | HTTP | Meaning | What to do |
| --- | --- | --- | --- |
| `unauthorized` | 401 | No `Authorization: Bearer` header, or the key is unknown or revoked. | Check the header spelling and that the key was not revoked in the member settings. |
| `key_expired` | 401 | The key was valid but its expiry date has passed. | Rotate the key in the member settings; the old key stops working immediately. |
| `system_required` | 400 | The key is not bound to one member system and no `X-Shark-System` header was sent. | Send `X-Shark-System: <AppSystem id>`, or use a key that is bound to a single system. |
| `system_mismatch` | 403 | `X-Shark-System` points at a different system than the key is bound to, or at a system that is not a member system of this shop. | Drop the header, or send the id the key is bound to. |
| `scope_missing` | 403 | The key does not hold the scope this operation needs. | Read `hint` for the exact scope name, then add it to the key (or pick a wider bundle) and retry. |
| `invalid_json` | 400 | The request body is not parseable JSON. | Send valid JSON and `Content-Type: application/json`. |
| `validation` | 422 | The payload did not match the schema. `details[]` lists every offending field, custom fields included. | Fix the fields in `details[]`. Unknown fields are rejected on purpose, so check spelling against `GET /fields/layout` too. |
| `idempotency_required` | 400 | A write was sent without the `Idempotency-Key` header. | Generate one key per logical attempt (a UUID is fine) and send it. |
| `idempotency_conflict` | 409 | The same `Idempotency-Key` was reused with a different body. | Use a fresh key for a different request; reuse the old key only to retry the identical one. |
| `idempotency_in_progress` | 409 | A request with this key is still running. | Wait a moment and retry with the same key; you will get the original response. |
| `confirm_required` | 409 | A danger operation was called without `confirm: true`. | Ask a human first, then resend with `confirm: true` and a `reason`. |
| `customer_session_required` | 401 | An operation under `/me` was called with a shop API key. That lane belongs to the customer and needs a customer session (LIFF or the mobile app). | Use the shop-facing operation instead: `/members/{id}` reads the same person on behalf of the shop. |
| `not_found` | 404 | No such operation, or the member, field, tier, policy or link does not exist inside this member system. A member of another shop, or one outside the branches this key covers, answers this too, never 403. | Check the path against this document, and that the id belongs to the same system the key is bound to. |
| `method_not_allowed` | 405 | The path exists but not with this HTTP method. The `Allow` header lists what works. | Use one of the methods in `Allow`. |
| `rate_limited` | 429 | Too many calls for this key: 600 reads or 600 writes per minute, 60 reports per minute. | Wait `Retry-After` seconds and retry; watch `X-RateLimit-Remaining` against `X-RateLimit-Limit` to slow down before you hit it. |
| `period_locked` | 409 | Accounting specific (a closed accounting period). The member module never returns this code. | Nothing to do here; it cannot happen on a member endpoint. |
| `state_conflict` | 409 | The record is not in a state that allows this: the member was already merged into somebody else, the tier is archived, or an erase request for that member is already waiting. | Read the current state first (`GET /members/{id}`). A member with `mergedIntoId` set has moved; work with the surviving record. |
| `duplicate` | 409 | A conflicting record already exists: the channel account you are linking belongs to another member, or a field marked unique already holds that value. | Read the conflict out of `message_th`, then either work with the existing member or merge the two. |
| `forbidden` | 403 | The operation is refused by a business rule, not by the scope check: merging and unlinking need a key of the admin bundle, and exporting needs `member.customer.export`. | Read `message_en`. A wider bundle (`member-admin`) usually fixes it. |
| `unprocessable` | 422 | The request was understood but cannot be completed as asked, for example importing more rows than the limit, or moving a member to a tier they already hold. | Read `message_en` and `message_th`; the Thai message is safe to show to the shop owner. |
| `upstream_unavailable` | 503 | An external service an operation depends on is not configured or not reachable right now. | Retry later; this is not caused by the request itself. |

## Operations

### Read operations

Safe to call at any time. No `Idempotency-Key`, nothing is written, nothing is audited. 27 of the 68 operations.

#### `channels.list`

**GET /channels** - The shop's channel registry: every channel that can carry an identity, a consent or an attribution, with whether the shop has actually connected it. · scope: `member.customer.read` · read · AI tool: `member_channels`

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/member/channels" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `fields.layout`

**GET /fields/layout** - Every section and field of the member profile, in display order: the exact shape to build a signup or edit form from, including types, choices, validation flags and which fields are sensitive. · scope: `member.customer.read` · read · AI tool: `member_field_layout`

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `audience` | enum("staff", "customer") | no | `customer` returns only what the shop lets customers see and edit. Default `staff`. |
| `includeArchived` | boolean | no | Include fields that were archived (their stored values still exist). |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/member/fields/layout" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `me.card`

**GET /me/card** - The signed-in customer's membership card: member code, tier and a short lived QR token staff can scan at the counter. Needs a customer session; a shop API key gets 401 customer_session_required. · scope: `member.customer.read` · read

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/member/me/card" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `me.get`

**GET /me** - The signed-in customer's own profile and the fields the shop lets them see. Needs a customer session (LIFF or the mobile app); a shop API key gets 401 customer_session_required. · scope: `member.customer.read` · read

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/member/me" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `members.activity`

**GET /members/{id}/activity** - Timeline of one member, newest first: purchases, appointments, tier changes, imports and anything else a module recorded. · scope: `member.customer.read` · read · AI tool: `member_activity`

Path parameters: `id` (required).

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `module` | string | no | Only events from one module, for example `pos` or `booking`. · max length 40 |
| `type` | string | no | Only one event type, for example `VISIT`. · max length 40 |
| `unit` | string | no | Only events recorded at one business unit. · max length 40 |
| `from` | string | no | ISO-8601 instant; events at or after it. · max length 40 |
| `to` | string | no | ISO-8601 instant; events at or before it. · max length 40 |
| `take` | integer | no | Rows per page, 1-100. Default 20. · min 1 · max 100 |
| `cursor` | string | no | Value of `nextCursor` from the previous page. · max length 40 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/member/members/123/activity" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `consents.get`

**GET /members/{id}/consents** - Marketing consent of one member, one row per channel the shop can ask consent for, with when it was given or withdrawn. · scope: `member.customer.read` · read

Path parameters: `id` (required).

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/member/members/123/consents" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `members.identities.list`

**GET /members/{id}/identities** - Outside channels linked to this member (LINE, WhatsApp, a marketplace account). Identifiers come back masked. · scope: `member.customer.read` · read

Path parameters: `id` (required).

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/member/members/123/identities" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `tiers.history`

**GET /members/{id}/tier/history** - Every tier change of one member, newest first, with why it happened and the numbers behind it. Rows marked `pending` are manual changes still waiting for approval and have no effect yet. · scope: `member.tier.read` · read · AI tool: `member_tier_history`

Path parameters: `id` (required).

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `take` | integer | no | Rows to return, 1-100. Default 20. · min 1 · max 100 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/member/members/123/tier/history" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `tiers.evaluate`

**GET /members/{id}/tier** - Where one member stands: current tier, the next one up, the numbers the rules judge on (12 month spend, visits, tier points) and how far they still are from moving up. · scope: `member.tier.read` · read · AI tool: `member_tier_status`

Path parameters: `id` (required).

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/member/members/123/tier" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `members.get`

**GET /members/{id}** - The full member profile: system fields, every custom field section, 12 month stats, tier with progress to the next one, linked channels, consents and attribution. Sensitive sections come back as `visible: false` with no values unless the key holds the admin bundle and the shop's policy allows it. · scope: `member.customer.read` · read · AI tool: `member_get`

Path parameters: `id` (required).

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/member/members/123" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `members.brief`

**GET /members/brief** - Name, tier, points and masked phone for up to 100 members at once. Use it to label ids you already hold. · scope: `member.customer.read` · read

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `ids` | string | yes | Member ids separated by commas, at most 100. · min length 1 · max length 4000 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/member/members/brief?ids=cus_123%2Ccus_456" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `members.duplicates.compare`

**GET /members/duplicates/{pairId}** - One duplicate pair side by side, so a human (or an agent asking one) can decide which value to keep before merging. · scope: `member.customer.merge` · read

Path parameters: `pairId` (required).

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/member/members/duplicates/123" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `members.duplicates.list`

**GET /members/duplicates** - Pairs of members the system believes are the same person, newest first, with the reason and a confidence score. · scope: `member.customer.merge` · read · AI tool: `member_duplicates`

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `status` | enum("OPEN", "MERGED", "DISMISSED") | no | Default OPEN (still waiting for a decision). |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/member/members/duplicates" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `members.import.status`

**GET /members/import/{jobId}** - Status of an import. Imports through this API finish inside the POST that started them, so this always answers DONE and the real counters are the ones POST /members/import already returned. · scope: `member.customer.import` · read

Path parameters: `jobId` (required).

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/member/members/import/123" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `members.search`

**GET /members/search** - Quick lookup by name, member code, phone or email. Use it to turn something a person typed into a member id. · scope: `member.customer.read` · read · AI tool: `member_search`

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `q` | string | yes | At least 2 characters: part of a name, a member code, a phone number or an email. · min length 2 · max length 120 |
| `take` | integer | no | How many matches to return, 1-20. Default 10. · min 1 · max 20 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/member/members/search?q=somchai" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `members.list`

**GET /members** - Members of this system with the columns the shop chose for its list view: member code, display name, masked phone, tier, points, 12 month spend, visits, tags and the custom fields flagged 'show in list'. · scope: `member.customer.read` · read · AI tool: `member_list` · `Accept: text/csv` supported

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `q` | string | no | Free text over name, member code, phone and email. · max length 120 |
| `tier` | string | no | Tier key (for example `gold`) or tier id. · max length 40 |
| `unit` | string | no | Business unit id of the member's home branch. · max length 40 |
| `tag` | string | no | One tag the member must carry. · max length 40 |
| `source` | enum("WALK_IN", "POS", "BOOKING", "LINE_OA", "LIFF", "WEB_FORM", "CHAT", "REFERRAL", "IMPORT", "CRM", "CAMPAIGN", "API", "MARKETPLACE", "APP", "OTHER") | no | How the member first reached the shop. |
| `status` | enum("ACTIVE", "SUSPENDED", "CLOSED", "MERGED") | no | Default: everybody except merged records. |
| `viewId` | string | no | Apply a saved view's filters and sort; anything you send here wins over the view. · max length 40 |
| `sort` | enum("-lastActivityAt", "name", "-spent12m", "-points", "memberCode", "-createdAt") | no | Default `-lastActivityAt` (most recently active first). |
| `page` | integer | no | 1 based page number. Default 1. · min 1 |
| `take` | integer | no | Rows per page, 1-100. Default 50. · min 1 · max 100 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/member/members" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `ping`

**GET /ping** - Check that the API key works, and see which member system and permission bundle it is bound to. · scope: `member.customer.read` · read

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/member/ping" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `privacy.accessLog`

**GET /privacy/access-log** - Who opened sensitive member data, when, and in which position they held at that moment. · scope: `member.privacy.manage` · read

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `customerId` | string | no | max length 40 |
| `userId` | string | no | max length 40 |
| `from` | string | no | Only views at or after this instant as an ISO-8601 instant. · max length 40 |
| `to` | string | no | Only views at or before this instant as an ISO-8601 instant. · max length 40 |
| `take` | integer | no | Rows to return, 1-200. Default 20. · min 1 · max 200 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/member/privacy/access-log" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `privacy.hrPositions`

**GET /privacy/hr-positions** - The positions and departments that exist in the shop's HR records, plus the staff who have no user account yet - a policy by position cannot reach those people. · scope: `member.privacy.manage` · read

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/member/privacy/hr-positions" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `privacy.policies.list`

**GET /privacy/policies** - Every version of the shop's privacy policy, newest first, with which one is in force today. · scope: `member.privacy.manage` · read

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/member/privacy/policies" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `privacy.requests.list`

**GET /privacy/requests** - PDPA requests of this member system: copies of data that were taken out, and deletions waiting for approval or already done. · scope: `member.privacy.manage` · read

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `take` | integer | no | Rows to return, 1-200. Default 20. · min 1 · max 200 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/member/privacy/requests" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `privacy.sensitive.list`

**GET /privacy/sensitive** - Who may open each sensitive section or field: by shop role, by HR position, by HR department, optionally only inside their own branch, and whether every view is logged. · scope: `member.privacy.manage` · read

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/member/privacy/sensitive" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `sources.links.list`

**GET /sources/links** - The shop's acquisition links and QR codes, newest first, with how many times each was opened and how many members it brought in. · scope: `member.settings.manage` · read

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/member/sources/links" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `sources.report`

**GET /sources/report** - Where members come from: signups, first and last touch, how many of them bought, how many bought again, average spend and cost per signup - per channel and per link. · scope: `member.report.view` · read · AI tool: `member_source_report`

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `from` | string | no | Start of the window, ISO-8601. Default 90 days ago. · max length 40 |
| `to` | string | no | End of the window, ISO-8601. Default now. · max length 40 |
| `unit` | string | no | Only members whose first touch happened at this business unit. · max length 40 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/member/sources/report" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `tiers.rules.get`

**GET /tiers/{id}/rules** - The upgrade rule and the keep rule of one tier, plus when the review runs, the grace period and the warning lead time. · scope: `member.tier.manage` · read

Path parameters: `id` (required).

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/member/tiers/123/rules" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `tiers.rules.dryRun`

**POST /tiers/rules/dry-run** - Answer 'what would happen if we ran the tier review right now': who would move up, who would fall, who is at risk. Writes nothing. · scope: `member.tier.manage` · read · AI tool: `member_tier_simulate`

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `customerIds` | array of string | no | Limit the simulation to these members. Omit for the whole shop. · max 500 items |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/member/tiers/rules/dry-run" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `tiers.list`

**GET /tiers** - The shop's membership tiers in ladder order, with how many members sit in each and the benefits attached to them. · scope: `member.tier.read` · read · AI tool: `member_tier_list`

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `includeArchived` | boolean | no | Include retired tiers. Default false. |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/member/tiers" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

### Write operations

Change data. `Idempotency-Key` is required and every success is written to the audit log with the key name. 38 of the 68 operations.

#### `fields.archive`

**POST /fields/{id}/archive** - Hide a field from every form and list. Values already stored are kept, so archiving can be undone without losing data. · scope: `member.settings.manage` · write

Path parameters: `id` (required).

No body fields.

```bash
curl -sS -X POST "https://shark.in.th/api/v1/member/fields/123/archive" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)"
```

#### `fields.choices.replace`

**POST /fields/{id}/choices/replace** - Move every member sitting on one choice of a select field to another choice. Run it after you removed or renamed a choice, so no member is left pointing at a value that no longer exists. · scope: `member.settings.manage` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `from` | string | yes | The choice value being retired. · min length 1 · max length 120 |
| `to` | string | yes | The choice value to move those members to. Must already exist on the field. · min length 1 · max length 120 |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/member/fields/123/choices/replace" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"from":"OPEN_WATER","to":"OWD"}'
```

#### `fields.update`

**PATCH /fields/{id}** - Change a field. A system field (the ones backed by a real column such as phone or first name) only accepts label, description, order and the display or privacy switches. · scope: `member.settings.manage` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `sectionId` | string | no | min length 1 · max length 40 |
| `key` | string | no | min length 1 · max length 40 |
| `label` | string | no | min length 1 · max length 60 |
| `type` | enum("TEXT", "LONG_TEXT", "NUMBER", "MONEY", "DATE", "DATETIME", "SELECT", "MULTI_SELECT", "BOOLEAN", "FILE", "LOOKUP") | no | - |
| `sortOrder` | integer | no | min 0 · max 9999 |
| `description` | string or null | no | max length 300 |
| `options` | object | no | Type specific settings: { choices: [{ value, label, color? }] } for SELECT, { min, max, unit } for NUMBER, { target } for LOOKUP. |
| `required` | boolean | no | - |
| `defaultValue` | one of several shapes | no | - |
| `unique` | boolean | no | No two members may hold the same value. |
| `filterable` | boolean | no | Can be used as a filter in GET /members (`f.<key>=`). |
| `showInList` | boolean | no | Appears as a column on the member list. |
| `showOnCard` | boolean | no | Appears on the small member card used by other modules. |
| `customerEditable` | boolean | no | The customer may edit it themself in the self service pages. |
| `sensitive` | boolean | no | Sensitive: hidden from read and operate keys, and from staff outside the shop's policy. |
| `trackHistory` | boolean | no | Keep a history of every change of this field. |

```bash
curl -sS -X PATCH "https://shark.in.th/api/v1/member/fields/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `fields.reorder`

**PUT /fields/order** - Set the display order of the fields inside one section. · scope: `member.settings.manage` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `sectionId` | string | yes | min length 1 · max length 40 |
| `ids` | array of string | yes | max 100 items |

```bash
curl -sS -X PUT "https://shark.in.th/api/v1/member/fields/order" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"sectionId":"sec_123","ids":"cus_123,cus_456"}'
```

#### `fields.sections.delete`

**DELETE /fields/sections/{id}** - Delete an empty section. A section that still holds fields cannot be deleted: archive or move the fields first. · scope: `member.settings.manage` · write

Path parameters: `id` (required).

No body fields.

```bash
curl -sS -X DELETE "https://shark.in.th/api/v1/member/fields/sections/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)"
```

#### `fields.sections.update`

**PATCH /fields/sections/{id}** - Rename a section, change its layout, or turn its sensitivity on or off. · scope: `member.settings.manage` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `label` | string | no | min length 1 · max length 60 |
| `description` | string or null | no | max length 300 |
| `columns` | integer | no | min 1 · max 4 |
| `sensitive` | boolean | no | - |
| `collapsed` | boolean | no | - |

```bash
curl -sS -X PATCH "https://shark.in.th/api/v1/member/fields/sections/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `fields.sections.reorder`

**PUT /fields/sections/order** - Set the display order of the sections. Send every section id, in the order you want. · scope: `member.settings.manage` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `ids` | array of string | yes | max 50 items |

```bash
curl -sS -X PUT "https://shark.in.th/api/v1/member/fields/sections/order" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"ids":"cus_123,cus_456"}'
```

#### `fields.sections.create`

**POST /fields/sections** - Add a section to the member profile. A sensitive section hides every field inside it from read and operate keys. · scope: `member.settings.manage` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `key` | string | yes | Stable reference, lowercase letters, digits and underscore. · min length 1 · max length 40 |
| `label` | string | yes | What staff see on screen. · min length 1 · max length 60 |
| `description` | string or null | no | max length 300 |
| `columns` | integer | no | How many columns the section is laid out in. Default 2. · min 1 · max 4 |
| `sensitive` | boolean | no | - |
| `collapsed` | boolean | no | Start folded on the profile page. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/member/fields/sections" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"key":"health","label":"ข้อมูลสุขภาพ"}'
```

#### `fields.templates.apply`

**POST /fields/templates/{key}/apply** - Apply an industry template to the member profile: it adds the sections and fields that are missing and never overwrites what the shop already changed, so running it twice does nothing the second time. · scope: `member.settings.manage` · write

Path parameters: `key` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `onlyFieldKeys` | array of string | no | Add only these field keys from the template. · max 100 items |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/member/fields/templates/123/apply" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `fields.create`

**POST /fields** - Add a custom field to a section. The type decides which `options` apply and what a value may look like. · scope: `member.settings.manage` · write · AI tool: `member_field_create`

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `sectionId` | string | yes | min length 1 · max length 40 |
| `key` | string | yes | Stable reference used in `fields: { ... }` everywhere else. · min length 1 · max length 40 |
| `label` | string | yes | min length 1 · max length 60 |
| `type` | enum("TEXT", "LONG_TEXT", "NUMBER", "MONEY", "DATE", "DATETIME", "SELECT", "MULTI_SELECT", "BOOLEAN", "FILE", "LOOKUP") | yes | One of the member field types. |
| `description` | string or null | no | max length 300 |
| `options` | object | no | Type specific settings: { choices: [{ value, label, color? }] } for SELECT, { min, max, unit } for NUMBER, { target } for LOOKUP. |
| `required` | boolean | no | - |
| `defaultValue` | one of several shapes | no | - |
| `unique` | boolean | no | No two members may hold the same value. |
| `filterable` | boolean | no | Can be used as a filter in GET /members (`f.<key>=`). |
| `showInList` | boolean | no | Appears as a column on the member list. |
| `showOnCard` | boolean | no | Appears on the small member card used by other modules. |
| `customerEditable` | boolean | no | The customer may edit it themself in the self service pages. |
| `sensitive` | boolean | no | Sensitive: hidden from read and operate keys, and from staff outside the shop's policy. |
| `trackHistory` | boolean | no | Keep a history of every change of this field. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/member/fields" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"sectionId":"sec_123","key":"cert_level","label":"ระดับน้ำลึก","type":"TEXT"}'
```

#### `consents.set`

**PUT /members/{id}/consents** - Record that a member agreed to, or withdrew consent for, one channel. Always send where the answer came from; that is what makes the record defensible later. · scope: `member.customer.update` · write · AI tool: `member_consent_set`

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `channel` | string | yes | Channel key from GET /channels that can carry consent. · min length 1 · max length 30 |
| `granted` | boolean | yes | - |
| `source` | enum("SIGNUP_FORM", "LIFF", "STAFF", "IMPORT", "API", "CUSTOMER_SELF") | yes | Where this answer came from. An outside integration should send API. |
| `policyVersion` | integer or null | no | Privacy policy version the customer agreed to, when there is one. · min 1 |

```bash
curl -sS -X PUT "https://shark.in.th/api/v1/member/members/123/consents" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"channel":"LINE","granted":true,"source":"SIGNUP_FORM"}'
```

#### `members.identities.unlink`

**DELETE /members/{id}/identities/{identityId}** - Detach a channel account from a member. Needs a key of the admin bundle: unlinking the wrong one hands a customer's chat history to somebody else. · scope: `member.customer.update` · write

Path parameters: `id`, `identityId` (required).

No body fields.

```bash
curl -sS -X DELETE "https://shark.in.th/api/v1/member/members/123/identities/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)"
```

#### `members.identities.link`

**POST /members/{id}/identities** - Attach an outside channel account (a LINE user id, a WhatsApp number, a marketplace buyer id) to this member. If that identifier already belongs to somebody else, the call fails with 409 instead of guessing. · scope: `member.customer.update` · write · AI tool: `member_link_identity`

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `channel` | string | yes | Channel key from GET /channels. · min length 1 · max length 30 |
| `externalId` | string | yes | The id that channel knows this person by. · min length 1 · max length 200 |
| `displayName` | string or null | no | max length 120 |
| `verified` | boolean | no | True when the shop confirmed the person really owns this account. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/member/members/123/identities" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"channel":"LINE","externalId":"Uxxxxxxxxxxxxxxxx"}'
```

#### `members.setOwner`

**PUT /members/{id}/owner** - Set or clear the staff member who looks after this customer. Send `ownerUserId: null` to clear it. · scope: `member.customer.update` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `ownerUserId` | string or null | yes | max length 40 |

```bash
curl -sS -X PUT "https://shark.in.th/api/v1/member/members/123/owner" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"ownerUserId":"example ownerUserId"}'
```

#### `privacy.export`

**POST /members/{id}/privacy/export** - Everything the shop holds about one member, as one bundle, and a PDPA request row recording that it was taken out. Hand the bundle to the customer, not to a third party. · scope: `member.privacy.manage` · write

Path parameters: `id` (required).

No body fields.

```bash
curl -sS -X POST "https://shark.in.th/api/v1/member/members/123/privacy/export" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)"
```

#### `members.setStatus`

**PUT /members/{id}/status** - Suspend, close or reopen a membership. The reason is written to the member's timeline. · scope: `member.customer.update` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `status` | enum("ACTIVE", "SUSPENDED", "CLOSED") | yes | - |
| `reason` | string | no | Shown on the member's timeline next to the change. · max length 200 |

```bash
curl -sS -X PUT "https://shark.in.th/api/v1/member/members/123/status" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"status":"ACTIVE"}'
```

#### `members.setTags`

**PUT /members/{id}/tags** - Add and remove tags on one member in a single call. Existing tags keep their order. · scope: `member.customer.update` · write · AI tool: `member_set_tags`

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `add` | array of string | no | max 30 items |
| `remove` | array of string | no | max 30 items |

```bash
curl -sS -X PUT "https://shark.in.th/api/v1/member/members/123/tags" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `sources.touch`

**POST /members/{id}/touch** - Record that the shop reached this member through a channel again (a campaign click, a QR scan). The very first touch of a member is written once and never overwritten; the last touch is replaced every time. · scope: `member.customer.update` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `source` | enum("WALK_IN", "POS", "BOOKING", "LINE_OA", "LIFF", "WEB_FORM", "CHAT", "REFERRAL", "IMPORT", "CRM", "CAMPAIGN", "API", "MARKETPLACE", "APP", "OTHER") | yes | - |
| `sourceChannel` | string or null | no | Channel key from GET /channels, when the source is a channel. · max length 30 |
| `linkId` | string or null | no | max length 40 |
| `campaignId` | string or null | no | max length 40 |
| `staffUserId` | string or null | no | max length 40 |
| `referrerCustomerId` | string or null | no | Member who introduced this person, for a referral. · max length 40 |
| `unitId` | string or null | no | max length 40 |
| `occurredAt` | string or null | no | When it happened, ISO-8601. Default now. · max length 40 |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/member/members/123/touch" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"source":"WALK_IN"}'
```

#### `members.update`

**PATCH /members/{id}** - Change a member: system fields and custom fields in `fields`, plus tags, owner and home branch. Only what you send is touched. · scope: `member.customer.update` · write · AI tool: `member_update`

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `fields` | object | no | System fields (firstName, phone, ...) and custom fields, all keyed by field key. |
| `tags` | array of string | no | Replaces the whole tag list. Use PUT /tags to add or remove single tags. · max 30 items |
| `status` | enum("ACTIVE", "SUSPENDED", "CLOSED", "MERGED") | no | - |
| `ownerUserId` | string or null | no | max length 40 |
| `homeUnitId` | string or null | no | max length 40 |

```bash
curl -sS -X PATCH "https://shark.in.th/api/v1/member/members/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `members.duplicates.dismiss`

**POST /members/duplicates/{pairId}/dismiss** - Mark a duplicate pair as two different people, so it stops coming back in the duplicates list. · scope: `member.customer.merge` · write

Path parameters: `pairId` (required).

No body fields.

```bash
curl -sS -X POST "https://shark.in.th/api/v1/member/members/duplicates/123/dismiss" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)"
```

#### `members.export`

**POST /members/export** - Export the members matching a filter as CSV. The file comes back inline in `csv` (UTF-8, no BOM) together with the row count; exporting is audited because it takes personal data out of the shop. · scope: `member.customer.export` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `filters` | object | no | - |
| `columns` | array of string | yes | Column keys, for example memberCode, name, phone, tier, points or any custom field key. · max 60 items |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/member/members/export" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"columns":["memberCode","name"]}'
```

#### `members.import.start`

**POST /members/import** - Import members from rows you already parsed. `dryRun: true` only checks the rows and reports what would happen; without it the rows are imported and the counters come back in the same reply. · scope: `member.customer.import` · write · AI tool: `member_import_preview`

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `rows` | array of object | yes | Rows of the file, each a flat object of column name to cell text. · max 5000 items |
| `mapping` | object | yes | Column name to field key, as listed by GET /fields/layout. Unknown field keys are rejected. |
| `dryRun` | boolean | no | Check only, write nothing. Default false. |
| `options` | object | no | - |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/member/members/import" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"rows":[{"เบอร์โทร":"0812345678","ชื่อ":"สมชาย"}],"mapping":{"เบอร์โทร":"phone","ชื่อ":"firstName"}}'
```

#### `members.resolve`

**POST /members/resolve** - Answer 'who is this person' for an outside system: give a channel account plus whatever contact details you have, get back the member it belongs to (and link the account to them). No match returns `customerId: null` with candidates by name, and never creates anybody. · scope: `member.customer.update` · write · AI tool: `member_resolve`

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `channel` | string | yes | Channel key from GET /channels. · min length 1 · max length 30 |
| `externalId` | string | yes | The id that channel knows this person by. · min length 1 · max length 200 |
| `phone` | string or null | no | Matched first, before email and before the channel id. · max length 30 |
| `email` | string or null | no | max length 160 |
| `displayName` | string or null | no | Used to suggest candidates when nothing matched. · max length 120 |
| `contactId` | string or null | no | Chat contact id, when the caller is a chat integration. · max length 40 |
| `verified` | boolean | no | - |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/member/members/resolve" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"channel":"LINE","externalId":"Uxxxxxxxxxxxxxxxx"}'
```

#### `members.create`

**POST /members** - Register a member. A phone or email that already belongs to somebody in this system returns that person instead of creating a second record (`created: false` plus their card). · scope: `member.customer.create` · write · AI tool: `member_register`

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `phone` | string or null | no | Thai mobile number. At least one of phone, email or an identity is needed. · max length 30 |
| `email` | string or null | no | max length 160 |
| `firstName` | string or null | no | max length 80 |
| `lastName` | string or null | no | max length 80 |
| `name` | string or null | no | Full display name, when first and last are not known separately. · max length 160 |
| `nickname` | string or null | no | max length 80 |
| `birthDate` | string or null | no | Date of birth as YYYY-MM-DD. · max length 30 |
| `gender` | string or null | no | max length 20 |
| `fields` | object | no | Custom field values keyed by field key, as listed by GET /fields/layout. |
| `consents` | array of object | no | Marketing consent per channel, using the keys from GET /channels. · max 20 items |
| `source` | enum("WALK_IN", "POS", "BOOKING", "LINE_OA", "LIFF", "WEB_FORM", "CHAT", "REFERRAL", "IMPORT", "CRM", "CAMPAIGN", "API", "MARKETPLACE", "APP", "OTHER") | yes | How this person reached the shop. An API key that does not know should send API. |
| `sourceDetail` | object | no | Free form detail of the source, for example { linkCode: 'fb-sep' }. |
| `sourceChannel` | string or null | no | Channel key from GET /channels, when the source is a channel. · max length 30 |
| `referralCode` | string or null | no | Referral code of the member who introduced this person. · max length 40 |
| `homeUnitId` | string or null | no | Business unit id of the branch this member belongs to. · max length 40 |
| `tags` | array of string | no | max 30 items |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/member/members" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"source":"WALK_IN"}'
```

#### `me.update`

**PATCH /me** - The signed-in customer edits their own details. Only fields the shop marked as customer editable may be sent. Needs a customer session; a shop API key gets 401 customer_session_required. · scope: `member.customer.update` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `fields` | object | no | Only field keys whose `customerEditable` is true in GET /fields/layout?audience=customer. |

```bash
curl -sS -X PATCH "https://shark.in.th/api/v1/member/me" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `privacy.policies.publish`

**POST /privacy/policies/{version}/publish** - Put one version of the policy into force. From then on new consents are recorded against that version number. · scope: `member.privacy.manage` · write

Path parameters: `version` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `effectiveAt` | string | no | When it starts to apply as an ISO-8601 instant. · max length 40 |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/member/privacy/policies/123/publish" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `privacy.policies.create`

**POST /privacy/policies** - Write a new version of the privacy policy. It stays a draft until it is published, so customers keep agreeing to the old one meanwhile. · scope: `member.privacy.manage` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `bodyHtml` | string | yes | The policy text as HTML. Scripts and event handlers are stripped. · min length 1 · max length 200000 |
| `effectiveAt` | string | no | When it starts to apply as an ISO-8601 instant. · max length 40 |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/member/privacy/policies" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"bodyHtml":"<p>นโยบายความเป็นส่วนตัวของร้าน</p>"}'
```

#### `privacy.sensitive.set`

**PUT /privacy/sensitive** - Set who may open one sensitive section or field. Read and operate API keys are never allowed in, whatever this policy says; it only widens or narrows what people (and admin keys) can see. · scope: `member.privacy.manage` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `targetType` | enum("SECTION", "FIELD") | yes | - |
| `targetId` | string | yes | Id of the section or the field. · min length 1 · max length 40 |
| `roles` | array of enum("OWNER", "MANAGER", "STAFF") | yes | Shop roles allowed in. An empty list means role alone never opens it. · max 3 items |
| `hrPositions` | array of string | no | HR positions allowed in, for example 'พยาบาล'. · max 50 items |
| `hrDepartments` | array of string | no | HR department ids allowed in. · max 50 items |
| `sameUnitOnly` | boolean | no | Only for members whose home branch the viewer covers. |
| `logAccess` | boolean | no | Record every view in the access log. Default true. |

```bash
curl -sS -X PUT "https://shark.in.th/api/v1/member/privacy/sensitive" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"targetType":"SECTION","targetId":"sec_123","roles":["OWNER","MANAGER"]}'
```

#### `sources.links.toggle`

**PUT /sources/links/{id}/active** - Turn a link on or off. A link that is off stops accepting signups but keeps its history in the report. · scope: `member.settings.manage` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `active` | boolean | yes | - |

```bash
curl -sS -X PUT "https://shark.in.th/api/v1/member/sources/links/123/active" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"active":true}'
```

#### `sources.links.update`

**PATCH /sources/links/{id}** - Change a link's name, channel, target, campaign or cost. The code in the URL never changes, so printed QR codes keep working. · scope: `member.settings.manage` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `name` | string or null | no | min length 1 · max length 120 |
| `source` | enum("WALK_IN", "POS", "BOOKING", "LINE_OA", "LIFF", "WEB_FORM", "CHAT", "REFERRAL", "IMPORT", "CRM", "CAMPAIGN", "API", "MARKETPLACE", "APP", "OTHER") or null | no | - |
| `target` | enum("LIFF_JOIN", "WEB_FORM", "CHAT") or null | no | - |
| `campaignId` | string or null | no | max length 40 |
| `unitId` | string or null | no | max length 40 |
| `utm` | object or null | no | - |
| `costSatang` | integer or null | no | min 0 |

```bash
curl -sS -X PATCH "https://shark.in.th/api/v1/member/sources/links/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `sources.links.create`

**POST /sources/links** - Create a trackable link with its QR code: a poster at the shop, a Facebook ad, a partner page. Everybody who signs up through it is attributed to it, so the report can tell you what each channel really costs per member. · scope: `member.settings.manage` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `name` | string | yes | What this link is, as it will read in the report. · min length 1 · max length 120 |
| `source` | enum("WALK_IN", "POS", "BOOKING", "LINE_OA", "LIFF", "WEB_FORM", "CHAT", "REFERRAL", "IMPORT", "CRM", "CAMPAIGN", "API", "MARKETPLACE", "APP", "OTHER") | yes | Which channel family it belongs to. |
| `target` | enum("LIFF_JOIN", "WEB_FORM", "CHAT") | yes | Where a person who opens it lands. |
| `code` | string or null | no | Short code in the URL. Omitted means the system picks one. · max length 32 |
| `campaignId` | string or null | no | max length 40 |
| `unitId` | string or null | no | Business unit this link belongs to. · max length 40 |
| `utm` | object or null | no | UTM parameters to carry through, for example { utm_source: 'facebook' }. |
| `costSatang` | integer or null | no | What this channel costs, in satang, so the report can show cost per signup. · min 0 |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/member/sources/links" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"name":"QR หน้าร้านป่าตอง","source":"WALK_IN","target":"LIFF_JOIN"}'
```

#### `tiers.archive`

**POST /tiers/{id}/archive** - Retire a tier. Members sitting in it have to go somewhere, so name the tier they move to. · scope: `member.tier.manage` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `moveToTierId` | string or null | no | Tier the current members are moved to. Required when the tier is not empty. · max length 40 |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/member/tiers/123/archive" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `tiers.benefits.set`

**PUT /tiers/{id}/benefits** - Replace the whole benefit list of a tier. Whatever you send is what the tier grants from then on, so read the tier first if you only mean to add one. · scope: `member.tier.manage` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `benefits` | array of object | yes | max 20 items |

```bash
curl -sS -X PUT "https://shark.in.th/api/v1/member/tiers/123/benefits" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"benefits":[{"type":"DISCOUNT_PCT","config":{"pct":10}}]}'
```

#### `tiers.rules.set`

**PUT /tiers/{id}/rules** - Set how members reach this tier and how they keep it. Send `null` for a rule to remove it. Nothing moves until the next review, so run the dry run first. · scope: `member.tier.manage` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `upgrade` | object or null | no | What a member must reach to move up into this tier. |
| `keep` | object or null | no | What a member must keep doing to stay in it. |
| `reviewCron` | string or null | no | max length 60 |
| `graceDays` | integer | no | min 0 · max 365 |
| `notifyBeforeDays` | integer | no | min 0 · max 365 |

```bash
curl -sS -X PUT "https://shark.in.th/api/v1/member/tiers/123/rules" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `tiers.update`

**PATCH /tiers/{id}** - Rename a tier, change its colour or icon, or move the default to it. · scope: `member.tier.manage` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `name` | string | no | min length 1 · max length 60 |
| `color` | enum("SLATE", "BLUE", "GREEN", "AMBER", "RED", "PURPLE") | no | - |
| `icon` | string or null | no | max length 40 |
| `description` | string or null | no | max length 300 |
| `isDefault` | boolean | no | - |
| `paidPlanId` | string or null | no | max length 40 |
| `reviewCron` | string or null | no | When the periodic tier review runs for this tier. · max length 60 |
| `graceDays` | integer | no | Days a member keeps the tier after falling below the keep rule. · min 0 · max 365 |
| `notifyBeforeDays` | integer | no | Warn the member this many days before they lose the tier. · min 0 · max 365 |

```bash
curl -sS -X PATCH "https://shark.in.th/api/v1/member/tiers/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `tiers.reorder`

**PUT /tiers/order** - Set the ladder order, lowest tier first. Send every tier id. · scope: `member.tier.manage` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `ids` | array of string | yes | max 30 items |

```bash
curl -sS -X PUT "https://shark.in.th/api/v1/member/tiers/order" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"ids":"cus_123,cus_456"}'
```

#### `tiers.reviewNow`

**POST /tiers/review** - Run the tier review for the whole shop right now instead of waiting for the schedule. Members move up, fall or get their warning, exactly as the nightly job would do it. · scope: `member.tier.manage` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `customerIds` | array of string | no | Review only these members. Omit for the whole shop. · max 500 items |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/member/tiers/review" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `tiers.create`

**POST /tiers** - Add a tier to the ladder. It starts with no rules, so nobody moves into it until you set them. · scope: `member.tier.manage` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `key` | string | yes | Stable reference, lowercase letters, digits and underscore, for example `gold`. · min length 1 · max length 40 |
| `name` | string | yes | What members and staff see. · min length 1 · max length 60 |
| `color` | enum("SLATE", "BLUE", "GREEN", "AMBER", "RED", "PURPLE") | yes | - |
| `icon` | string or null | no | max length 40 |
| `description` | string or null | no | max length 300 |
| `isDefault` | boolean | no | Where new members start. Only one tier may be the default. |
| `paidPlanId` | string or null | no | Subscription plan that grants this tier, for a paid membership. · max length 40 |
| `legacyTier` | enum("MEMBER", "SILVER", "GOLD", "PLATINUM") or null | no | Old fixed tier this one replaces, so existing integrations keep working. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/member/tiers" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"key":"gold","name":"ทอง","color":"SLATE"}'
```

### Danger operations

Hard or impossible to undo. On top of the write rules they need `confirm: true` and a `reason` of at least 5 characters. An AI agent must ask a human before calling these. 3 of the 68 operations.

#### `members.merge`

**POST /members/{id}/merge** - Merge a duplicate into this member: points, history, identities and consents move over and the other record becomes MERGED. Cannot be undone. The shop's approval chain can hold it, in which case the reply is `{ pending: true, approvalRequestId }`. · scope: `member.customer.merge` · danger · AI tool: `member_merge`

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `mergeId` | string | yes | Id of the member that gets absorbed and closed. · min length 1 · max length 40 |
| `fieldChoices` | object | no | Which record wins per field: A is the one in the path, B is mergeId. Default A. |
| `reason` | string | yes | Why these are the same person. Stored in the audit log. · min length 5 · max length 200 |
| `confirm` | enum(true) | yes | Must be exactly true. Proves the caller meant to run an operation that is hard to undo. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/member/members/123/merge" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"mergeId":"cus_456","reason":"reason for the audit log","confirm":true}'
```

#### `privacy.erase`

**POST /members/{id}/privacy/erase** - Ask for a member's personal data to be erased. It goes through the shop's approval chain first; once approved the record is anonymised, keeping the accounting trail but removing everything that names the person. This cannot be undone. · scope: `member.customer.delete` · danger

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `reason` | string | yes | Why the data is being erased. Stored in the audit log. · min length 5 · max length 200 |
| `confirm` | enum(true) | yes | Must be exactly true. Proves the caller meant to run an operation that is hard to undo. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/member/members/123/privacy/erase" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"reason":"reason for the audit log","confirm":true}'
```

#### `tiers.setManual`

**POST /members/{id}/tier** - Put a member into a tier by hand, overriding the rules. Use `until` for a temporary courtesy upgrade; without it the member stays there until somebody changes it again. May come back as pending when the shop routes this through its approval chain. · scope: `member.tier.setManual` · danger · AI tool: `member_tier_set_manual`

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `tierDefId` | string | yes | Id of the tier to put them in (from GET /tiers). · min length 1 · max length 40 |
| `reason` | string | yes | Why. Stored in the member's tier history and in the audit log. · min length 5 · max length 200 |
| `until` | string or null | no | ISO-8601 instant the manual tier expires at. Omit to make it permanent. · max length 40 |
| `confirm` | enum(true) | yes | Must be exactly true. Proves the caller meant to run an operation that is hard to undo. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/member/members/123/tier" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"tierDefId":"tier_123","reason":"reason for the audit log","confirm":true}'
```

## AI tools

22 of these operations are also exposed to the SHARK assistant as tools of the `members` skill.
Read tools run straight away. Write and danger tools never run by themselves: they create a proposal that the shop owner confirms in the app, and only then the very same operation below is executed, with the confirming person's permissions and their name in the audit log. Danger tools need a second confirmation.

The assistant reads member data as a plain staff member with no HR position, so it **never sees sensitive fields**, whatever the key that started the conversation holds.

Tools carrying the destructive flag: `member_merge`, `member_tier_set_manual`.

| Tool | Operation | Class | Scope |
| --- | --- | --- | --- |
| `member_activity` | `members.activity` | read | `member.customer.read` |
| `member_channels` | `channels.list` | read | `member.customer.read` |
| `member_consent_set` | `consents.set` | write | `member.customer.update` |
| `member_duplicates` | `members.duplicates.list` | read | `member.customer.merge` |
| `member_field_create` | `fields.create` | write | `member.settings.manage` |
| `member_field_layout` | `fields.layout` | read | `member.customer.read` |
| `member_get` | `members.get` | read | `member.customer.read` |
| `member_import_preview` | `members.import.start` | write | `member.customer.import` |
| `member_link_identity` | `members.identities.link` | write | `member.customer.update` |
| `member_list` | `members.list` | read | `member.customer.read` |
| `member_merge` | `members.merge` | danger | `member.customer.merge` |
| `member_register` | `members.create` | write | `member.customer.create` |
| `member_resolve` | `members.resolve` | write | `member.customer.update` |
| `member_search` | `members.search` | read | `member.customer.read` |
| `member_set_tags` | `members.setTags` | write | `member.customer.update` |
| `member_source_report` | `sources.report` | read | `member.report.view` |
| `member_tier_history` | `tiers.history` | read | `member.tier.read` |
| `member_tier_list` | `tiers.list` | read | `member.tier.read` |
| `member_tier_set_manual` | `tiers.setManual` | danger | `member.tier.setManual` |
| `member_tier_simulate` | `tiers.rules.dryRun` | read | `member.tier.manage` |
| `member_tier_status` | `tiers.evaluate` | read | `member.tier.read` |
| `member_update` | `members.update` | write | `member.customer.update` |

## AI agents

Bring your own model. The same tools the SHARK assistant uses are published as a skill manifest, so an outside agent (Claude, GPT, Gemini, an open model, an n8n flow) can work with the shop's members using the shop owner's API key. Nothing here is a second API: every tool call lands on the operation of the same name listed above.

### Manifest

```bash
curl -sS "https://shark.in.th/api/v1/ai/skills" -H "Authorization: Bearer $SHARK_API_KEY"
curl -sS "https://shark.in.th/api/v1/ai/skills/members" -H "Authorization: Bearer $SHARK_API_KEY"
```

`GET https://shark.in.th/api/v1/ai/skills` lists the skills this shop can use. The member skill is listed only when the shop has an active member system and the key is allowed to call at least one of its tools. A shop without a member system, or a key whose scopes reach none of the tools, gets 404 from `https://shark.in.th/api/v1/ai/skills/members` - the same answer as a skill that does not exist, so nothing leaks about what is behind the wall.

`GET https://shark.in.th/api/v1/ai/skills/members` returns the tools in OpenAI function-calling shape, so they can be handed to the model without conversion. 22 of them come from the operations in this document (12 read, 10 write or danger); the skill also carries a few older loyalty tools that predate this API.

```text
{ "id": "members", "label": "สมาชิก แต้ม และรางวัล", "summary": "...", "tools": [
  { "type": "function",
    "function": { "name": "member_search", "description": "...", "parameters": { ...JSON Schema... } },
    "write": false },
  ...
] }
```

`parameters` is the JSON Schema of that operation's input - the very schema the REST endpoint validates against - plus any path id (`customerId`, `tierId`, ...) as a required property and an optional `systemName` string for shops that run more than one member system. Anthropic's shape is one field rename (`function.name` -> `name`, `function.parameters` -> `input_schema`). `write: true` marks a tool that changes data.

### Calling a tool

`POST https://shark.in.th/api/v1/ai/tools/<tool name>` with `{ "args": { ... } }`. Authentication is the same Bearer key as the REST API. Send `X-Shark-System: <system id>` when the key is not bound to one member system. A key may only call the tools its scopes allow; anything else answers 403 with the missing scope in `hint`. An unknown tool name answers 404. Bad arguments never crash the call: the answer is still 200 and `result` carries a Thai `error` string the agent can read back to the user.

Rate limit on this lane: 60 calls per minute per key (429 with `retry-after`), independent of the REST limits above.

### Read tools run straight away

```bash
curl -sS -X POST "https://shark.in.th/api/v1/ai/tools/member_search" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"args":{"q":"สมชาย"}}'
```

```json
{
  "tool": "member_search",
  "skill": "members",
  "write": false,
  "result": "{\"items\":[{\"memberCode\":\"NUTD5E\",\"name\":\"สมชาย ใจดี\",\"phoneMasked\":\"081-xxx-0001\",\"tier\":{\"key\":\"gold\"}}],\"total\":1}"
}
```

`result` is a JSON string the model reads back to the user. Note the masked phone: the assistant lane never returns a full phone number or a sensitive field.

### Write tools return a proposal, not a change

An outside agent can never change a member on its own, even with a valid key. A write or danger tool creates a **proposal** (`summary` is Thai, written for the owner) that the shop owner confirms in the SHARK app or website. Only then does the operation run, with the confirming person's permissions and their name in the audit log; danger tools ask a second time.

```bash
curl -sS -X POST "https://shark.in.th/api/v1/ai/tools/member_set_tags" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"args":{"customerId":"cus_123","add":["vip"]}}'
```

```json
{
  "tool": "member_set_tags",
  "skill": "members",
  "write": true,
  "pendingConfirmation": true,
  "conversationId": "cnv_8f2a",
  "result": "{\"proposalId\":\"prp_41c9\",\"summary\":\"ตั้งแท็กสมาชิก · สมาชิก \\\"สมชาย ใจดี\\\" · เพิ่มแท็ก vip\",\"waiting\":\"user_confirm\"}"
}
```

Nothing changed yet. The owner opens the conversation, reads the Thai summary and taps confirm; only then is the tag written. Tell the user the request is waiting for their confirmation - never report the change as done until a later read tool shows it.

If a member must be changed without a human in the loop, use the REST operations above instead: they execute immediately, and the key's scopes are the only gate.

## Webhooks

Everything above is you calling SHARK. Webhooks are SHARK calling you: the shop owner adds an endpoint URL in the shop settings (Connections > External apps / API), ticks the events it wants, and gets a signing secret shown once.

Delivery is at least once and ordered by the moment the change was committed. Events are written inside the same database transaction as the change itself, so an event exists only if the change really happened, and a change never happens without its event. A delivery that does not answer 2xx within 5 seconds is retried up to 5 times with a growing delay, so **make your handler idempotent**: key on the ids in the payload.

Every event below fires wherever the change came from - a person at the counter, this REST API, an import, or an automation rule. There is no separate "API only" event.

### Request format

`POST <your url>` with `Content-Type: application/json` and these headers:

| Header | Value |
| --- | --- |
| `X-Shark-Event` | The event type, for example `member.tier.changed`. |
| `X-Shark-Signature` | `HMAC-SHA256(secret, raw request body)` as lowercase hex. |

The body is always the same three fields:

```json
{
  "type": "member.tier.changed",
  "payload": {
    "customerId": "cmf1cus0001",
    "from": "silver",
    "to": "gold",
    "reason": "RULE_UPGRADE"
  },
  "sentAt": "2026-09-10T09:15:00.000Z"
}
```

`payload` never contains your shop id or member system id: the endpoint already belongs to one shop. **It also never carries personal data** - no names, no phone numbers, no field values, no health notes; only ids plus the short labels needed to route the event. Read the rest with the REST operations above, which apply the shop's own privacy rules. Instants are ISO-8601 UTC strings ending in `At`, the same convention as the REST API.

### Verifying `X-Shark-Signature`

1. Read the **raw** request body as bytes, before any JSON parsing or pretty printing.
2. Compute `HMAC-SHA256` over those bytes with the endpoint secret; render it as lowercase hex.
3. Compare with the `X-Shark-Signature` header using a constant time comparison. Reject with 401 when it differs.
4. Only then parse the JSON, answer 2xx immediately and process asynchronously.

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

// Express style handler. Read the RAW body: any reformatting breaks the signature.
export function handleSharkWebhook(rawBody: Buffer, headers: Record<string, string>) {
  const expected = createHmac("sha256", process.env.SHARK_WEBHOOK_SECRET!).update(rawBody).digest("hex");
  const got = headers["x-shark-signature"] ?? "";
  if (got.length !== expected.length || !timingSafeEqual(Buffer.from(got), Buffer.from(expected))) {
    return { status: 401 };
  }
  const event = JSON.parse(rawBody.toString("utf8")) as { type: string; payload: unknown; sentAt: string };
  // Answer 2xx fast, then do the work. Anything else is retried up to 5 times.
  void enqueue(event);
  return { status: 200 };
}
```

### Events

| Event | Fires when |
| --- | --- |
| `member.created` | A member was registered, whichever way it happened (a form at the counter, this REST API, an import, a signup link, the chat). |
| `member.updated` | A member's details changed. `changedKeys` names the fields that moved, so a handler can ignore changes it does not care about. Erasing a member under PDPA also fires this, with `changedKeys: ["erased"]`. |
| `member.merged` | Two records turned out to be the same person and were merged. Everything now hangs off `keepId`; `mergedId` still exists but is closed and points at the survivor. |
| `member.identity.linked` | An outside channel account (a LINE user, a WhatsApp number, a marketplace buyer) was attached to a member. `method` says what matched: PHONE, EMAIL or CHANNEL_ID. |
| `member.tier.changed` | A member moved to another tier: the review promoted or demoted them, somebody set it by hand, or a merge carried a tier over. `reason` says which. |
| `member.tier.at_risk` | A member has not met the keep rule of their tier and will lose it at the next review unless they buy again. Fires once per review cycle, not every night. |
| `member.consent.changed` | A member agreed to, or withdrew consent for, being contacted through one channel. Stop sending on a `granted: false` for that channel. |
| `member.sensitive.viewed` | Somebody opened sensitive member data (a health note, an emergency contact). The position they held at that moment is recorded, not the one they hold today. |

#### `member.created`

A member was registered, whichever way it happened (a form at the counter, this REST API, an import, a signup link, the chat).

```json
{
  "type": "member.created",
  "payload": {
    "customerId": "cmf1cus0001",
    "partyId": "cmf1pty0001",
    "source": "API",
    "referrerId": null
  },
  "sentAt": "2026-09-10T09:15:00.000Z"
}
```

#### `member.updated`

A member's details changed. `changedKeys` names the fields that moved, so a handler can ignore changes it does not care about. Erasing a member under PDPA also fires this, with `changedKeys: ["erased"]`.

```json
{
  "type": "member.updated",
  "payload": {
    "customerId": "cmf1cus0001",
    "changedKeys": [
      "phone",
      "nickname"
    ]
  },
  "sentAt": "2026-09-10T09:15:00.000Z"
}
```

#### `member.merged`

Two records turned out to be the same person and were merged. Everything now hangs off `keepId`; `mergedId` still exists but is closed and points at the survivor.

```json
{
  "type": "member.merged",
  "payload": {
    "keepId": "cmf1cus0001",
    "mergedId": "cmf1cus0002"
  },
  "sentAt": "2026-09-10T09:15:00.000Z"
}
```

#### `member.identity.linked`

An outside channel account (a LINE user, a WhatsApp number, a marketplace buyer) was attached to a member. `method` says what matched: PHONE, EMAIL or CHANNEL_ID.

```json
{
  "type": "member.identity.linked",
  "payload": {
    "customerId": "cmf1cus0001",
    "channel": "LINE",
    "externalId": "Uxxxxxxxx",
    "method": "PHONE",
    "identityId": "cmf1idn0001"
  },
  "sentAt": "2026-09-10T09:15:00.000Z"
}
```

#### `member.tier.changed`

A member moved to another tier: the review promoted or demoted them, somebody set it by hand, or a merge carried a tier over. `reason` says which.

```json
{
  "type": "member.tier.changed",
  "payload": {
    "customerId": "cmf1cus0001",
    "from": "silver",
    "to": "gold",
    "reason": "RULE_UPGRADE"
  },
  "sentAt": "2026-09-10T09:15:00.000Z"
}
```

#### `member.tier.at_risk`

A member has not met the keep rule of their tier and will lose it at the next review unless they buy again. Fires once per review cycle, not every night.

```json
{
  "type": "member.tier.at_risk",
  "payload": {
    "customerId": "cmf1cus0001",
    "tier": "gold",
    "shortfall": 250000,
    "reviewAt": "2026-10-01T00:00:00.000Z"
  },
  "sentAt": "2026-09-10T09:15:00.000Z"
}
```

#### `member.consent.changed`

A member agreed to, or withdrew consent for, being contacted through one channel. Stop sending on a `granted: false` for that channel.

```json
{
  "type": "member.consent.changed",
  "payload": {
    "customerId": "cmf1cus0001",
    "channel": "LINE",
    "granted": true,
    "source": "LIFF",
    "policyVersion": 3
  },
  "sentAt": "2026-09-10T09:15:00.000Z"
}
```

#### `member.sensitive.viewed`

Somebody opened sensitive member data (a health note, an emergency contact). The position they held at that moment is recorded, not the one they hold today.

```json
{
  "type": "member.sensitive.viewed",
  "payload": {
    "customerId": "cmf1cus0001",
    "userId": "cmf1usr0001",
    "targetType": "SECTION",
    "targetId": "cmf1sec0001",
    "hrPosition": "พยาบาล"
  },
  "sentAt": "2026-09-10T09:15:00.000Z"
}
```

## Glossary (Thai <-> English membership terms)

Field names and codes in this API are English. This table maps them to the Thai words a shop owner or a staff member uses.

| ไทย | English | In the API |
| --- | --- | --- |
| ระบบสมาชิก | member system (AppSystem of type MEMBER) | `X-Shark-System` |
| สมาชิก / ลูกค้า | member | `/members` |
| รหัสสมาชิก | member code shown on the card | `memberCode` |
| เบอร์แบบปิดบัง | masked phone number | `phoneMasked` |
| ฟิลด์กำหนดเอง | custom field | `fields: { "<key>": value }` |
| ส่วนของฟิลด์ | section of the profile form | `/fields/sections` |
| ข้อมูลอ่อนไหว | sensitive data | `sensitive` · `visible: false` |
| ความยินยอม | marketing consent per channel | `/members/{id}/consents` |
| ช่องทาง | channel registry | `GET /channels` |
| ช่องทางที่ผูก | linked outside identity | `/members/{id}/identities` |
| ที่มา | acquisition source | `source` · `/sources/report` |
| ลิงก์/QR ที่มา | trackable acquisition link | `/sources/links` |
| ระดับสมาชิก | membership tier | `/tiers` |
| สิทธิประโยชน์ | tier benefit | `/tiers/{id}/benefits` |
| กฎเลื่อนระดับ / กฎคงระดับ | upgrade rule / keep rule | `/tiers/{id}/rules` |
| ทดลองรัน | dry run of the tier review | `POST /tiers/rules/dry-run` |
| คนซ้ำ / รวมคน | duplicate pair / merge | `/members/duplicates` · `POST /members/{id}/merge` |
| ขอสำเนาข้อมูล | PDPA data export | `POST /members/{id}/privacy/export` |
| ขอลบข้อมูล | PDPA erasure | `POST /members/{id}/privacy/erase` |
| รออนุมัติ | waiting for the shop's approval chain | `{ pending: true, approvalRequestId }` |
| สาขา | business unit (branch) | `homeUnitId` · `unitId` |
| สตางค์ | satang (1/100 baht) | `*Satang` |

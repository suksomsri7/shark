# SHARK Accounting API

Machine readable contract: `/api/v1/account/openapi.json` (OpenAPI 3.1.0, no API key needed).
Base URL: `https://shark.in.th/api/v1/account` - contract version 1.0.0 - 199 operations.
Generated from the operation registry by `scripts/gen-account-api-docs.mts`. Do not edit by hand: run the script.

## Who this is for

- **AI agents** driving the accounting book on behalf of a shop owner. Read the Conventions and the Error codes table first: every failure has a stable `code` to branch on, and `message_th` is already worded for a Thai shop owner, so it can be shown as is.
- **Developers** integrating another system (webshop, POS, spreadsheet job). Everything in this document is generated from the same registry the live API dispatches from, so nothing here can drift from the running code.

## Authentication and scopes

Send `Authorization: Bearer <api key>`. Keys are created by the shop owner in the accounting book settings (Connections > External apps / API); the raw key is shown once.

A key carries a list of scopes. Scopes are the same permission keys the human roles use, so a key can never do more than a person could. Bundles are ready made sets; the owner can still tick single scopes on top. Default for a key created from the accounting page: **issue-and-collect**, valid for 365 days.

| Bundle | What it can do | Scopes |
| --- | --- | --- |
| `read-only` | Read documents, journals, tax and financial reports. No writes at all. | `account.doc.view` `account.report.view` `account.journal.view` `account.tax.view` |
| `issue-and-collect` | Everything in read-only plus creating/issuing documents, recording payments, managing contacts and products. | `account.doc.view` `account.report.view` `account.journal.view` `account.tax.view` `account.doc.create` `account.doc.issue` `account.doc.public_link` `account.payment.record` `account.contact.manage` `account.product.manage` `account.document.manage` |
| `accountant` | Everything in issue-and-collect plus journal adjustments, period close, chart of accounts, assets, cheques, bank accounts and reconciliation. | `account.doc.view` `account.report.view` `account.journal.view` `account.tax.view` `account.doc.create` `account.doc.issue` `account.doc.public_link` `account.payment.record` `account.contact.manage` `account.product.manage` `account.document.manage` `account.journal.adjust` `account.period.close` `account.chart.manage` `account.mapping.manage` `account.wht.manage` `account.asset.manage` `account.asset.register` `account.asset.dispose` `account.cheque.manage` `account.cheque.deposit` `account.cheque.clear` `account.cheque.bounce` `account.finance.manage` `account.reconcile` |
| `danger` | Irreversible operations: voiding documents and payments, reopening periods, un-marking WHT, merging contacts, writing assets off, approving documents. | `account.doc.void` `account.doc.approve` `account.payment.void` `account.period.reopen` `account.wht.unmark` `account.contact.merge` `account.cheque.void` `account.asset.writeoff` |
| `settings` | Change accounting settings, approval ceilings and import data into the books. | `account.settings.manage` `account.import` |

A key is normally bound to one accounting book. If it is not, every call must carry `X-Shark-System: <book id>`. Calls that need a scope the key lacks fail with 403 `scope_missing` and the missing scope in `hint`.

## Conventions

- **Money is satang.** Every amount is an integer number of satang (1 baht = 100 satang) and the field name ends with `Satang`. 1,250.50 baht is `125050`. Decimals are rejected, never rounded.
- **Dates are `YYYY-MM-DD`.** A date field means a Thai calendar day (UTC+7), not an instant. Fields that really are instants are ISO-8601 UTC strings and are named `*At`.
- **Idempotency.** Every write (POST, PATCH, PUT, DELETE) requires an `Idempotency-Key` header, unique per logical attempt. Retrying with the same key and the same body replays the stored response and adds `Idempotent-Replayed: true`; the same key with a different body fails with 409 `idempotency_conflict`. Records are kept 24 hours.
- **`X-Shark-System`.** Selects the accounting book when the key is not bound to one. When the key is bound, the header may be sent only if it matches.
- **Danger operations.** `confirm: true` plus a `reason` of at least 5 characters. The reason is stored in the audit log next to the key name.
- **Envelope.** Success is `{ data, page?, requestId }`. Failure is `{ error: { code, message_th, message_en, hint?, details? }, requestId }`. `requestId` is also the `X-Request-Id` header; quote it in support tickets.
- **Pagination.** Lists take `page` (1 based, default 1) and `pageSize` (default 20, maximum 100; a larger value is clamped to 100, not rejected) as query parameters, and answer with `page: { page, pageSize, pageCount, total, hasMore }` next to `data`. Keep asking for `page + 1` while `hasMore` is true. Some list operations add one more top level field with counters for the filter, for example `tabCounts`.
- **Rate limits.** Per key, per class, per minute: 300 reads, 60 writes, 30 reports. 429 carries `Retry-After`; successful calls carry `X-RateLimit-Remaining`.
- **Unknown fields are rejected.** Bodies are closed schemas (`additionalProperties: false`), so a typo fails loudly with 422 `validation` instead of being ignored.

## Error codes

Branch on `error.code`, never on the message text.

| Code | HTTP | Meaning | What to do |
| --- | --- | --- | --- |
| `unauthorized` | 401 | No `Authorization: Bearer` header, or the key is unknown or revoked. | Check the header spelling and that the key was not revoked in the accounting settings. |
| `key_expired` | 401 | The key was valid but its expiry date has passed. | Rotate the key in the accounting settings; the old key stops working immediately. |
| `system_required` | 400 | The key is not bound to one accounting book and no `X-Shark-System` header was sent. | Send `X-Shark-System: <book id>`, or use a key that is bound to a single book. |
| `system_mismatch` | 403 | `X-Shark-System` points at a different book than the key is bound to, or at a system that is not an accounting book of this shop. | Drop the header, or send the id the key is bound to. |
| `scope_missing` | 403 | The key does not hold the scope this operation needs. | Read `hint` for the exact scope name, then add it to the key (or pick a wider bundle) and retry. |
| `invalid_json` | 400 | The request body is not parseable JSON. | Send valid JSON and `Content-Type: application/json`. |
| `validation` | 422 | The payload did not match the schema. `details[]` lists every offending field. | Fix the fields in `details[]`. Unknown fields are rejected on purpose, so check spelling too. |
| `idempotency_required` | 400 | A write was sent without the `Idempotency-Key` header. | Generate one key per logical attempt (a UUID is fine) and send it. |
| `idempotency_conflict` | 409 | The same `Idempotency-Key` was reused with a different body. | Use a fresh key for a different request; reuse the old key only to retry the identical one. |
| `idempotency_in_progress` | 409 | A request with this key is still running. | Wait a moment and retry with the same key; you will get the original response. |
| `confirm_required` | 409 | A danger operation was called without `confirm: true`. | Ask a human first, then resend with `confirm: true` and a `reason`. |
| `not_found` | 404 | No such operation, or the record does not exist inside this accounting book. | Check the path against this document and that the id belongs to the same book. |
| `method_not_allowed` | 405 | The path exists but not with this HTTP method. The `Allow` header lists what works. | Use one of the methods in `Allow`. |
| `rate_limited` | 429 | Too many calls for this key: 300 reads, 60 writes or 30 reports per minute. | Wait `Retry-After` seconds and retry; watch `X-RateLimit-Remaining` to slow down before you hit it. |
| `period_locked` | 409 | The accounting period of that date is closed or locked. | Post to an open period, or ask the accountant to reopen the period. |
| `state_conflict` | 409 | The record is not in a state that allows this (for example issuing a document that is already issued). | Read the current state first, then choose the operation that fits it. |
| `duplicate` | 409 | A conflicting record already exists (duplicate number, code or link). | Reuse the existing record, or send a different unique value. |
| `forbidden` | 403 | The operation is refused by a business rule, not by the scope check. | Read `message_en`; this usually needs a settings change by the shop owner. |
| `unprocessable` | 422 | The request was understood but cannot be completed as asked. | Read `message_en` and `message_th`; the Thai message is safe to show to the shop owner. |
| `upstream_unavailable` | 503 | An external service this operation depends on (for example the DBD company registry lookup) is not configured or not reachable right now. | Retry later, or ask the shop owner to finish configuring the integration; this is not caused by the request itself. |

## Operations

### Read operations

Safe to call at any time. No `Idempotency-Key`, nothing is written, nothing is audited.

#### `api-keys.list`

**GET /api-keys** - API keys of this shop (scopes, which book they are bound to, expiry). Never includes the key value or its hash. · scope: `account.settings.manage` · read

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/api-keys" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `assets.get`

**GET /assets/{id}** - One fixed asset with every depreciation period already posted and the accounts it posts to. · scope: `account.asset.manage` · read

Path parameters: `id` (required).

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/assets/123" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `assets.depreciation-preview`

**GET /assets/depreciation/preview** - What running depreciation for a period would post, without writing anything. · scope: `account.asset.manage` · read

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `period` | string | no | period (accounting period, `YYYY-MM`). |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/assets/depreciation/preview" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `assets.list`

**GET /assets** - Fixed asset register with cost, monthly depreciation, accumulated depreciation and net book value. · scope: `account.asset.manage` · read · AI tool: `account_assets`

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `status` | enum("ACTIVE", "FULLY_DEPRECIATED", "DISPOSED", "WRITTEN_OFF") | no | Filter by asset status. Default: every asset. |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/assets" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `audit.list`

**GET /audit** - Audit trail of this shop, newest first, with the before/after values that were recorded. · scope: `account.settings.manage` · read

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `targetId` | string | no | Only entries about this record id. · min length 1 |
| `action` | string | no | Action prefix, e.g. `account.doc` matches `account.doc.issue`. · max length 120 |
| `from` | string | no | from (Thai calendar day, YYYY-MM-DD). |
| `to` | string | no | to (Thai calendar day, YYYY-MM-DD). |
| `take` | integer | no | 1-200. Default 50. · min 1 |
| `cursor` | string | no | `nextCursor` from the previous response. · min length 1 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/audit" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `categories.list`

**GET /categories** - Product/document categories of this accounting book. · scope: `account.doc.view` · read

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `includeArchived` | enum("true", "false") | no | "true" or "false". Default false. |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/categories" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `chart.get`

**GET /chart/{id}** - One account with its balance, this month's movement, the latest journal lines and what uses it. · scope: `account.journal.view` · read

Path parameters: `id` (required).

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `asOf` | string | no | asOf (Thai calendar day, YYYY-MM-DD). |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/chart/123" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `chart.list`

**GET /chart** - The whole chart of accounts: a flat list, the 3-level tree and balances per account type. · scope: `account.journal.view` · read · AI tool: `account_chart_of_accounts`

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `asOf` | string | no | asOf (Thai calendar day, YYYY-MM-DD). |
| `q` | string | no | Free text: account code, Thai name or English name. · max length 200 |
| `includeArchived` | enum("true", "false") | no | "true" = also return deactivated accounts. Default false. |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/chart" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `cheques.get`

**GET /cheques/{id}** - One cheque in the same shape as the list row. · scope: `account.cheque.manage` · read

Path parameters: `id` (required).

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/cheques/123" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `cheques.list`

**GET /cheques** - Cheques received or issued, with paging, plus a pending-amount summary and status counters. · scope: `account.cheque.manage` · read

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `direction` | enum("IN", "OUT") | yes | - |
| `status` | enum("ON_HAND", "DEPOSITED", "CLEARED", "BOUNCED", "ISSUED", "VOIDED") | no | - |
| `q` | string | no | max length 200 |
| `from` | string | no | from (Thai calendar day, YYYY-MM-DD). |
| `to` | string | no | to (Thai calendar day, YYYY-MM-DD). |
| `page` | integer | no | min 1 |
| `pageSize` | integer | no | - |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/cheques?direction=IN" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `contact-groups.list`

**GET /contact-groups** - Custom contact groups of this accounting book, with member counts. · scope: `account.doc.view` · read

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/contact-groups" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `contacts.documents`

**GET /contacts/{id}/documents** - Documents of one contact, any type, newest first. · scope: `account.doc.view` · read

Path parameters: `id` (required).

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `type` | enum("QUOTATION", "INVOICE", "RECEIPT", "TAX_INVOICE", "TAX_INVOICE_ABB", "DEPOSIT_RECEIPT", "CREDIT_NOTE", "DEBIT_NOTE", "BILLING_NOTE", "PURCHASE", "EXPENSE", "PURCHASE_ORDER", "ASSET_PURCHASE_ORDER", "ASSET_PURCHASE", "PURCHASE_TAX_INVOICE", "DEPOSIT_PAYMENT", "CREDIT_NOTE_RECEIVED", "DEBIT_NOTE_RECEIVED", "COMBINED_PAYMENT", "GOODS_ISSUE", "GOODS_ISSUE_RETURN", "COST_ADJUSTMENT", "WHT_CERT") | no | - |
| `page` | integer | no | min 1 |
| `pageSize` | integer | no | - |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/contacts/123/documents" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `contacts.link-suggestions`

**GET /contacts/{id}/link-suggestions** - Member and CRM records that might be the same person as this contact, guessed from phone/email/tax id. · scope: `account.contact.manage` · read

Path parameters: `id` (required).

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/contacts/123/link-suggestions" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `contacts.get`

**GET /contacts/{id}** - One contact profile: header, info, KPI, latest documents, custom groups and links to member/CRM/chat. · scope: `account.doc.view` · read · AI tool: `account_get_contact`

Path parameters: `id` (required).

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/contacts/123" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `contacts.lookup-tax-id`

**GET /contacts/lookup-tax-id/{taxId}** - Look up a Thai juristic person by 13 digit tax id at the Department of Business Development (DBD). · scope: `account.contact.manage` · read

Path parameters: `taxId` (required).

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/contacts/lookup-tax-id/123" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `contacts.merge-candidates`

**GET /contacts/merge-candidates** - Pairs of contacts that look like duplicates (same tax id, same phone, or a very similar name). · scope: `account.contact.merge` · read

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/contacts/merge-candidates" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `contacts.list`

**GET /contacts** - List contacts (customers and vendors) with the sidebar filters, search and paging. · scope: `account.doc.view` · read · AI tool: `account_search_contacts`

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `q` | string | no | Free text: name, tax id, phone or email. · max length 200 |
| `group` | string | no | Sidebar group filter. Default: contacts that are not archived (equivalent to "all" minus "archived"). · max length 80 |
| `legalType` | enum("COMPANY", "PERSON") | no | - |
| `page` | integer | no | min 1 |
| `pageSize` | integer | no | - |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/contacts" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `dashboard.series`

**GET /dashboard/series** - Income, expense and profit for the 12 months of one year, plus the previous year and the year on year change. · scope: `account.doc.view` · read

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `year` | integer | no | Calendar year between 2000 and 2100. Default: the current year in Thailand. · min 2000 · max 2100 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/dashboard/series" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `dashboard.get`

**GET /dashboard** - Everything the accounting home screen shows in one call: KPI, receivable and payable, cash, categories, pending work and recent documents. · scope: `account.doc.view` · read · AI tool: `account_dashboard`

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `asOf` | string | no | Read the numbers as of this Thai calendar day (`YYYY-MM-DD`). Default: today in Thailand. Balances, receivable, payable and overdue are all computed at this date. |
| `period` | string | no | Month `YYYY-MM` for the monthly blocks. Ignored when `asOf` is sent. Default: the month of `asOf`. |
| `year` | integer | no | Calendar year between 2000 and 2100. Default: the current year in Thailand. · min 2000 · max 2100 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/dashboard" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `doc-type-accounts.list`

**GET /doc-type-accounts** - The income/expense account used per document type when a document is posted. · scope: `account.mapping.manage` · read

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/doc-type-accounts" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `documents.attachments`

**GET /documents/{id}/attachments** - Files attached to one document. · scope: `account.doc.view` · read

Path parameters: `id` (required).

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/documents/123/attachments" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `documents.deposits`

**GET /documents/{id}/deposits** - Deposits of this contact that can still be deducted from this document, with the amount already applied here. · scope: `account.doc.view` · read

Path parameters: `id` (required).

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/documents/123/deposits" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `payments.list`

**GET /documents/{id}/payments** - Every payment recorded against this document, including the voided ones, with the totals of the document. · scope: `account.doc.view` · read

Path parameters: `id` (required).

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/documents/123/payments" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `documents.get`

**GET /documents/{id}** - One document in full: lines, payments, related documents, timeline, journal entries and attachments. · scope: `account.doc.view` · read · AI tool: `account_get_document`

Path parameters: `id` (required).

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/documents/123" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `documents.group-candidates`

**GET /documents/group-candidates** - Documents of this contact that can go into a billing note or combined payment. Documents that are already in another open group are returned too, with eligible false and the reason. · scope: `account.doc.view` · read

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `type` | enum("BILLING_NOTE", "COMBINED_PAYMENT") | yes | BILLING_NOTE groups what customers owe you; COMBINED_PAYMENT groups what you owe vendors. |
| `contactId` | string | yes | Id of the customer or vendor. Only documents of one contact can be grouped. · min length 1 · max length 40 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/documents/group-candidates?type=BILLING_NOTE&contactId=example%20contactId" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `documents.parse`

**POST /documents/parse** - Turn one line of free text into a document draft intent: type, contact candidates and amount. Reads only. · scope: `account.doc.view` · read · AI tool: `account_parse_quick_create`

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `text` | string | yes | Free text in Thai or English, for example `invoice john 24900` or `ใบแจ้งหนี้ ณัฐพล 24900`. · min length 1 · max length 200 |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/documents/parse" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text":"example text"}'
```

#### `documents.list`

**GET /documents** - List documents of any type (sales and purchase side) with filters, paging and tab counters. · scope: `account.doc.view` · read · AI tool: `account_list_documents`

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `type` | string | no | Document type, or several separated by commas, for example `INVOICE,RECEIPT`. Omit for every type. · max length 400 |
| `tab` | string | no | Status tab of that document type, for example `paid` or `overdue`. Only valid together with exactly one `type`. · max length 40 |
| `status` | string | no | Filter by status instead of a tab: one status, several separated by commas, or `OVERDUE` / `ALL`. · max length 200 |
| `q` | string | no | Free text: document number or contact name. · max length 200 |
| `contactId` | string | no | Only documents of this contact. · max length 40 |
| `refType` | string | no | Source model name of documents that flowed in from another system, for example `PosSale`. · max length 60 |
| `refId` | string | no | Id of the source record inside that system. Use together with `refType`. · max length 60 |
| `from` | string | no | from (Thai calendar day, YYYY-MM-DD). |
| `to` | string | no | to (Thai calendar day, YYYY-MM-DD). |
| `page` | integer | no | Page number, 1 based. Default 1. · min 1 |
| `pageSize` | integer | no | Rows per page. Default 20, maximum 100; a larger value is clamped, not rejected. |
| `sort` | enum("recent", "issueDate", "docNo", "amount") | no | Sort order. Default `recent` (last updated first). |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/documents" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `echo-by-id`

**GET /echo/{id}** - Echo back the id captured from the path (used to verify path parameters). · scope: `account.doc.view` · read

Path parameters: `id` (required).

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/echo/123" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `favorites.list`

**GET /favorites** - Saved document templates (favourites) of this accounting book. · scope: `account.doc.view` · read

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/favorites" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `files.list`

**GET /files** - Document vault files with paging, plus the folder list and per-tab counters. · scope: `account.document.manage` · read

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `tab` | enum("all", "unlinked", "linked", "archived") | no | "all" (default), "unlinked", "linked" or "archived" (soft-deleted files). |
| `folder` | string | no | max length 120 |
| `q` | string | no | Free text: file name or uploader name. · max length 200 |
| `type` | string | no | Document type hint stored on the file. · max length 60 |
| `page` | integer | no | min 1 |
| `pageSize` | integer | no | 1-100. Default 20. |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/files" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `finance-accounts.statement`

**GET /finance-accounts/{id}/statement** - Ledger movements of one finance channel between two dates, with a running balance. Supports CSV. · scope: `account.finance.manage` · read

Path parameters: `id` (required).

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `from` | string | no | from (Thai calendar day, YYYY-MM-DD). |
| `to` | string | no | to (Thai calendar day, YYYY-MM-DD). |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/finance-accounts/123/statement" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `finance-accounts.get`

**GET /finance-accounts/{id}** - One finance channel with its opening balance entries. · scope: `account.finance.manage` · read

Path parameters: `id` (required).

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/finance-accounts/123" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `finance-accounts.list`

**GET /finance-accounts** - Every cash/bank/e-wallet/petty-cash channel with its balance, grouped by kind. · scope: `account.finance.manage` · read · AI tool: `account_finance_balances`

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `asOf` | string | no | asOf (Thai calendar day, YYYY-MM-DD). |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/finance-accounts" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `finance.calendar`

**GET /finance/calendar** - Cash in/out per day of one month, with the documents behind each amount. · scope: `account.finance.manage` · read

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `month` | string | no | Month `YYYY-MM`. Default: the current month in Thailand. |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/finance/calendar" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `finance.overview`

**GET /finance/overview** - The finance overview screen in one call: tracked accounts, cash calendar, cash position, reconcile block and cheque badges. · scope: `account.finance.manage` · read

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `month` | string | no | Month `YYYY-MM`. Default: the current month in Thailand. |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/finance/overview" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `help.glossary`

**GET /help/glossary** - Plain-Thai explanations of the accounting terms used across this API (same text the UI shows in its tooltips). · scope: `account.doc.view` · read

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/help/glossary" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `import.template`

**GET /import/template** - Download an empty CSV template with example rows for one import kind. Supports CSV. · scope: `account.import` · read

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `kind` | enum("documents_revenue", "documents_expense", "contacts", "products", "chart_of_accounts") | yes | - |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/import/template?kind=documents_revenue" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `inbox.get`

**GET /inbox** - Inbox in one call: counters, the files still waiting to become documents (with AI-extracted fields) and the shop inbox email address. · scope: `account.document.manage` · read

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/inbox" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `journal.get`

**GET /journal/{id}** - One journal entry with every line, the account behind each line and its reversal links. · scope: `account.journal.view` · read

Path parameters: `id` (required).

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/journal/123" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `journal.list`

**GET /journal** - Journal entries with paging, plus entry counts per book and debit/credit totals for the filtered range. · scope: `account.journal.view` · read · AI tool: `account_list_journal`

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `range` | enum("all", "this_month", "last_month", "this_quarter", "this_year") | no | Preset date range. Default "all" (every entry ever posted). Ignored when from/to are given. |
| `from` | string | no | from (Thai calendar day, YYYY-MM-DD). |
| `to` | string | no | to (Thai calendar day, YYYY-MM-DD). |
| `book` | enum("SALES", "PURCHASES", "RECEIPTS", "PAYMENTS", "GENERAL") | no | Journal book filter. |
| `needsReview` | enum("true", "false") | no | "true" = only entries flagged for review. |
| `q` | string | no | Free text: journal number or memo. · max length 200 |
| `page` | integer | no | min 1 |
| `pageSize` | integer | no | 1-200. Default 20. |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/journal" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `links.list`

**GET /links** - Systems that post into accounting (POS, chat, bookings, ...): link status, options and this month's volume. · scope: `account.settings.manage` · read

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/links" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `mappings.list`

**GET /mappings** - Posting rules: which ledger account each system key (AR, AP, VAT_OUTPUT, ...) posts to. · scope: `account.mapping.manage` · read

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/mappings" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `overview.get`

**GET /overview** - Revenue or expense overview: 12 month bars split by payment status, documents issued, top contacts, top products and top categories. · scope: `account.doc.view` · read

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `side` | enum("revenue", "expense") | yes | Which side to look at: `revenue` (money in) or `expense` (money out). |
| `year` | integer | no | Calendar year between 2000 and 2100. Default: the current year in Thailand. · min 2000 · max 2100 |
| `issuedRange` | enum("this-month", "last-month", "this-year") | no | Period of the `issued` card. Default `this-month`. |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/overview?side=revenue" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `payment-requests.list`

**GET /payment-requests** - Payment (PromptPay) links created for one document, newest first. The capability token is never returned. · scope: `account.doc.view` · read

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `documentId` | string | yes | min length 1 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/payment-requests?documentId=example%20documentId" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `periods.checklist`

**GET /periods/{key}/checklist** - The pre-close checklist of one period: suspense account, flagged entries, reconciliation and VAT. · scope: `account.period.close` · read

Path parameters: `key` (required).

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/periods/123/checklist" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `periods.list`

**GET /periods** - Accounting periods with their status, entry count, who closed them and whether VAT was filed. · scope: `account.report.view` · read

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/periods" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `petty-cash.list`

**GET /petty-cash** - Petty cash boxes with their balance and the amount currently awaiting reimbursement. · scope: `account.finance.manage` · read

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `asOf` | string | no | asOf (Thai calendar day, YYYY-MM-DD). |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/petty-cash" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `ping`

**GET /ping** - Check that the API key works and see which accounting book it is bound to. · scope: `account.doc.view` · read

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/ping" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `products.bundle`

**GET /products/{id}/bundle** - Recipe of one bundle product: its components and quantities. · scope: `account.doc.view` · read

Path parameters: `id` (required).

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/products/123/bundle" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `products.movements`

**GET /products/{id}/movements** - Stock movements (issue/return) of one product, newest first. · scope: `account.doc.view` · read

Path parameters: `id` (required).

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `take` | integer | no | min 1 · max 500 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/products/123/movements" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `products.opening-lots`

**GET /products/{id}/opening-lots** - Opening balance lots of one product (quantity and unit cost per lot). · scope: `account.doc.view` · read

Path parameters: `id` (required).

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/products/123/opening-lots" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `products.get`

**GET /products/{id}** - One product/service/bundle in full: accounts, bundle recipe, opening lots and inventory link. · scope: `account.doc.view` · read

Path parameters: `id` (required).

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/products/123" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `products.list`

**GET /products** - List goods, services and bundles with type/sub-tab filters, search, category and paging. · scope: `account.doc.view` · read · AI tool: `account_search_products`

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `type` | enum("GOODS", "SERVICE", "BUNDLE") | no | Omit to get every type. |
| `sub` | enum("active", "archived") | no | Default "active". |
| `q` | string | no | max length 200 |
| `category` | string | no | max length 120 |
| `page` | integer | no | min 1 |
| `pageSize` | integer | no | - |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/products" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `reconcile.channels`

**GET /reconcile/channels** - Bank/e-wallet channels that can be reconciled (linked to the chart of accounts). · scope: `account.reconcile` · read

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/reconcile/channels" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `reconcile.get`

**GET /reconcile** - Bank reconciliation of one channel and month: summary, bank statement lines and system entries. · scope: `account.reconcile` · read

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `financeAccountId` | string | yes | min length 1 |
| `period` | string | yes | - |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/reconcile?financeAccountId=example%20financeAccountId&period=example%20period" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `recurring.runs`

**GET /recurring/{id}/runs** - Documents that one recurring rule has already produced, newest first. · scope: `account.doc.view` · read

Path parameters: `id` (required).

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/recurring/123/runs" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `recurring.list`

**GET /recurring** - Recurring document rules: schedule, next run and template summary. · scope: `account.doc.view` · read

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/recurring" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `reports.aging`

**GET /reports/aging** - Receivable (AR) or payable (AP) aging per contact, bucketed by days overdue. Supports CSV. · scope: `account.report.view` · read

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `direction` | enum("AR", "AP") | yes | - |
| `asOf` | string | no | asOf (Thai calendar day, YYYY-MM-DD). |
| `contactId` | string | no | min length 1 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/reports/aging?direction=AR" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `reports.balance-sheet`

**GET /reports/balance-sheet** - Balance sheet at the end of one period: assets, liabilities and equity (incl. retained earnings). Supports CSV. · scope: `account.report.view` · read

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `asOf` | string | yes | asOf. Accepts `YYYY-MM` (whole month) or `YYYY-MM-DD` (the month that day falls in). |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/reports/balance-sheet?asOf=example%20asOf" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `reports.cash-flow`

**GET /reports/cash-flow** - Cash flow (direct method) split into operating, investing and financing, reconciled to the cash accounts. Supports CSV. · scope: `account.report.view` · read

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `from` | string | yes | from. Accepts `YYYY-MM` (whole month) or `YYYY-MM-DD` (the month that day falls in). |
| `to` | string | yes | to. Accepts `YYYY-MM` (whole month) or `YYYY-MM-DD` (the month that day falls in). |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/reports/cash-flow?from=example%20from&to=example%20to" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `reports.general-ledger`

**GET /reports/general-ledger** - General ledger of one account between two dates: opening balance, every line and a running balance. Supports CSV. · scope: `account.journal.view` · read

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `accountId` | string | yes | min length 1 |
| `from` | string | yes | from (Thai calendar day, YYYY-MM-DD). |
| `to` | string | yes | to (Thai calendar day, YYYY-MM-DD). |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/reports/general-ledger?accountId=example%20accountId&from=example%20from&to=example%20to" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `reports.profit-loss`

**GET /reports/profit-loss** - Profit and loss: revenue, cost of goods sold and expenses, with gross and net profit. Supports CSV. · scope: `account.report.view` · read · AI tool: `account_report`

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `from` | string | yes | from. Accepts `YYYY-MM` (whole month) or `YYYY-MM-DD` (the month that day falls in). |
| `to` | string | yes | to. Accepts `YYYY-MM` (whole month) or `YYYY-MM-DD` (the month that day falls in). |
| `compare` | enum("true", "false") | no | "true" = also return the previous period of the same length. |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/reports/profit-loss?from=example%20from&to=example%20to" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `reports.trial-balance`

**GET /reports/trial-balance** - Trial balance: opening, movement and closing debit/credit per account, with a balanced flag. Supports CSV. · scope: `account.report.view` · read

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `from` | string | yes | from. Accepts `YYYY-MM` (whole month) or `YYYY-MM-DD` (the month that day falls in). |
| `to` | string | yes | to. Accepts `YYYY-MM` (whole month) or `YYYY-MM-DD` (the month that day falls in). |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/reports/trial-balance?from=example%20from&to=example%20to" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `reports.vat-pp30`

**GET /reports/vat-pp30** - Monthly VAT return (PP30): output VAT, input VAT and the net amount payable. Supports CSV (filing layout). · scope: `account.tax.view` · read

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `period` | string | yes | period (accounting period, `YYYY-MM`). |
| `carryForwardSatang` | integer | no | VAT credit carried forward from the previous month, in satang. Default 0. · min 0 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/reports/vat-pp30?period=example%20period" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `settings.documents`

**GET /settings/documents** - Per document type: number pattern and next number (with a live example), due days, notes, public link and print template. · scope: `account.settings.manage` · read

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/settings/documents" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `settings.permissions.get`

**GET /settings/permissions** - Roles and the people who have accounting access, with the permission matrix and approval caps. · scope: `account.settings.manage` · read

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/settings/permissions" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `settings.policy`

**GET /settings/policy** - Accounting policy: fiscal year, VAT timing, withholding tax defaults, date lock, duplicate rules and report emails. · scope: `account.settings.manage` · read

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/settings/policy" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `settings.get`

**GET /settings** - Company details printed on documents: legal name, tax id, branch, address, VAT registration and fiscal year. · scope: `account.doc.view` · read · AI tool: `account_settings`

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/settings" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `tags.list`

**GET /tags** - Tags already used on documents, sorted, for building a picker. · scope: `account.doc.view` · read

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/tags" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `units.list`

**GET /units** - Units of measure for products and services. · scope: `account.doc.view` · read

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `includeArchived` | enum("true", "false") | no | "true" or "false". Default false. |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/units" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `warehouses.list`

**GET /warehouses** - Warehouses (stock locations) of this shop, when the inventory module is enabled. · scope: `account.doc.view` · read

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/warehouses" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `webhooks.deliveries`

**GET /webhooks/{id}/deliveries** - Recent delivery attempts to one endpoint, newest first. · scope: `account.settings.manage` · read

Path parameters: `id` (required).

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `take` | integer | no | 1-100. Default 20. · min 1 · max 100 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/webhooks/123/deliveries" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `webhooks.list`

**GET /webhooks** - Webhook endpoints of this shop. Never includes the signing secret. · scope: `account.settings.manage` · read

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/webhooks" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `wht.cert`

**GET /wht/certs/{id}** - One withholding tax certificate in full (payer, payee, amounts) - ready to print. · scope: `account.tax.view` · read

Path parameters: `id` (required).

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/wht/certs/123" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `wht.credits`

**GET /wht/credits** - Withholding tax credits (tax our customers withheld from us), accumulated by year or month. Supports CSV. · scope: `account.tax.view` · read

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `year` | string | no | - |
| `period` | string | no | - |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/wht/credits" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `wht.filings`

**GET /wht/filings** - Periods already marked as filed with the Revenue Department (PND 3/53). · scope: `account.tax.view` · read

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/wht/filings" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `wht.pnd`

**GET /wht/pnd** - Monthly withholding tax filing summary (PND 3 for individuals, PND 53 for companies). Supports CSV. · scope: `account.tax.view` · read

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `type` | integer | yes | - |
| `period` | string | yes | - |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/wht/pnd?type=-9007199254740991&period=example%20period" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `wht.list`

**GET /wht** - Withholding tax certificates (50 Tawi / WTI), either direction, with paging and totals. · scope: `account.tax.view` · read · AI tool: `account_wht_summary`

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `direction` | enum("IN", "OUT") | yes | - |
| `from` | string | no | from (Thai calendar day, YYYY-MM-DD). |
| `to` | string | no | to (Thai calendar day, YYYY-MM-DD). |
| `status` | enum("ALL", "NORMAL", "CANCELLED") | no | - |
| `q` | string | no | max length 200 |
| `page` | integer | no | min 1 |
| `pageSize` | integer | no | - |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/wht?direction=IN" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

### Write operations

Change data. `Idempotency-Key` is required and every success is written to the audit log with the key name.

#### `assets.depreciation-run`

**POST /assets/depreciation/run** - Run monthly depreciation for a period and post the journal entry for it. Safe to call again: an asset that already has the period posted comes back under skipped, so nothing is booked twice. Preview the same period first to see what it will do. · scope: `account.asset.manage` · write · AI tool: `account_run_depreciation`

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `period` | string | no | Period to run, `YYYY-MM`. Default is the current Thai month. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/assets/depreciation/run" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `assets.register`

**POST /assets** - Put a fixed asset on the register so monthly depreciation can be run on it. Depreciation is straight line: the cost minus the residual value spread over the useful life, with the last month taking the rounding. · scope: `account.asset.register` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `name` | string | yes | What the asset is, such as a pickup truck or an air conditioner. · min length 1 · max length 120 |
| `category` | one of several shapes | no | Free text group used to sort the register, such as vehicles. |
| `acquiredDate` | string | yes | Day the asset was bought (Thai calendar day, YYYY-MM-DD). |
| `startDepDate` | string | yes | Day depreciation starts (Thai calendar day, YYYY-MM-DD). |
| `costSatang` | integer | yes | Cost of the asset in satang. · min 1 |
| `salvageValueSatang` | integer | yes | Residual value in satang. Thai practice keeps at least 1 baht, so the minimum is 100. · min 100 |
| `usefulLifeMonths` | integer | yes | Useful life in months. 5 years is 60. · min 1 · max 1200 |
| `assetAccountId` | string | yes | Ledger account holding the cost of the asset, usually a 16xx account. · min length 1 · max length 40 |
| `accumAccountId` | string | yes | Ledger account of accumulated depreciation, usually the 16x9 account. · min length 1 · max length 40 |
| `expenseAccountId` | string | yes | Ledger account of the depreciation expense, usually 6800. · min length 1 · max length 40 |
| `sourceDocumentId` | one of several shapes | no | - |
| `note` | one of several shapes | no | Free note kept with the asset. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/assets" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"name":"example name","acquiredDate":"example acquiredDate","startDepDate":"example startDepDate","costSatang":10000,"salvageValueSatang":10000,"usefulLifeMonths":1,"assetAccountId":"example assetAccountId","accumAccountId":"example accumAccountId","expenseAccountId":"example expenseAccountId"}'
```

#### `categories.archive`

**DELETE /categories/{id}** - Deactivate a category. · scope: `account.product.manage` · write

Path parameters: `id` (required).

No body fields.

```bash
curl -sS -X DELETE "https://shark.in.th/api/v1/account/categories/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)"
```

#### `categories.update`

**PATCH /categories/{id}** - Rename a category or change which document types it applies to. · scope: `account.product.manage` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `name` | string | no | min length 1 · max length 60 |
| `appliesTo` | array of enum("QUOTATION", "INVOICE", "RECEIPT", "TAX_INVOICE", "TAX_INVOICE_ABB", "DEPOSIT_RECEIPT", "CREDIT_NOTE", "DEBIT_NOTE", "BILLING_NOTE", "PURCHASE", "EXPENSE", "PURCHASE_ORDER", "ASSET_PURCHASE_ORDER", "ASSET_PURCHASE", "PURCHASE_TAX_INVOICE", "DEPOSIT_PAYMENT", "CREDIT_NOTE_RECEIVED", "DEBIT_NOTE_RECEIVED", "COMBINED_PAYMENT", "GOODS_ISSUE", "GOODS_ISSUE_RETURN", "COST_ADJUSTMENT", "WHT_CERT") | no | - |

```bash
curl -sS -X PATCH "https://shark.in.th/api/v1/account/categories/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `categories.create`

**POST /categories** - Create a product/document category. · scope: `account.product.manage` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `name` | string | yes | min length 1 · max length 60 |
| `appliesTo` | array of enum("QUOTATION", "INVOICE", "RECEIPT", "TAX_INVOICE", "TAX_INVOICE_ABB", "DEPOSIT_RECEIPT", "CREDIT_NOTE", "DEBIT_NOTE", "BILLING_NOTE", "PURCHASE", "EXPENSE", "PURCHASE_ORDER", "ASSET_PURCHASE_ORDER", "ASSET_PURCHASE", "PURCHASE_TAX_INVOICE", "DEPOSIT_PAYMENT", "CREDIT_NOTE_RECEIVED", "DEBIT_NOTE_RECEIVED", "COMBINED_PAYMENT", "GOODS_ISSUE", "GOODS_ISSUE_RETURN", "COST_ADJUSTMENT", "WHT_CERT") | no | - |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/categories" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"name":"example name"}'
```

#### `chart.set-active`

**POST /chart/{id}/active** - Turn an account on or off. Turning it off hides it from every picker but keeps the history. An account that already has movement, a posting rule or a money channel behind it cannot be turned off. Turning one back on always works. · scope: `account.chart.manage` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `active` | boolean | yes | true turns the account back on, false hides it from pickers. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/chart/123/active" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"active":true}'
```

#### `chart.update`

**PATCH /chart/{id}** - Change one account. Only the fields sent are touched, the rest keep their current value. Accounts the system created can be renamed but cannot change code or type, because reports and posting rules point at the old code. · scope: `account.chart.manage` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `code` | string | no | Account code, 3 to 6 digits. The first digit is the account type: 1 asset, 2 liability, 3 equity, 4 income, 5 cost of sales, 6 expense. |
| `name` | string | no | Thai account name. · min length 1 · max length 80 |
| `nameEn` | one of several shapes | no | - |
| `groupPrefix` | string | no | Three digit prefix of the sub group the account belongs to, such as 610. The code must start with it. |
| `description` | one of several shapes | no | - |
| `defaultWhtRateBp` | one of several shapes | no | - |
| `defaultWhtType` | one of several shapes | no | - |
| `vatTreatment` | one of several shapes | no | - |

```bash
curl -sS -X PATCH "https://shark.in.th/api/v1/account/chart/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `chart.create`

**POST /chart** - Add an account to the chart of accounts. The account type is taken from the sub group prefix, so 610 makes an expense account. Codes are unique per book. · scope: `account.chart.manage` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `code` | string | yes | Account code, 3 to 6 digits. The first digit is the account type: 1 asset, 2 liability, 3 equity, 4 income, 5 cost of sales, 6 expense. |
| `name` | string | yes | Thai account name shown in the chart of accounts. · min length 1 · max length 80 |
| `nameEn` | one of several shapes | no | English account name, optional. |
| `groupPrefix` | string | yes | Three digit prefix of the sub group the account belongs to, such as 610. The code must start with it. |
| `description` | one of several shapes | no | What the account is for, shown in the account panel. |
| `defaultWhtRateBp` | one of several shapes | no | Default withholding rate in basis points: 300 = 3%. |
| `defaultWhtType` | one of several shapes | no | - |
| `vatTreatment` | one of several shapes | no | - |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/chart" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"code":"example code","name":"example name","groupPrefix":"example groupPrefix"}'
```

#### `cheques.bounce`

**POST /cheques/{id}/bounce** - Record that a received cheque was returned unpaid. The ledger effect is reversed and the customer owes the money again. · scope: `account.cheque.bounce` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `reason` | one of several shapes | no | What the bank gave as the reason, kept on the cheque. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/cheques/123/bounce" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `cheques.clear`

**POST /cheques/{id}/clear** - Mark a cheque as cleared. This is the moment the money really moves: a received cheque credits the bank account, an issued cheque debits it. · scope: `account.cheque.clear` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `clearedDate` | string | no | Day the bank cleared it. Default today. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/cheques/123/clear" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `cheques.deposit`

**POST /cheques/{id}/deposit** - Bank a received cheque. Nothing is posted to the ledger yet because the money has not arrived; only the cheque status moves. · scope: `account.cheque.deposit` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `depositedAt` | string | no | Day the cheque was handed to the bank. Default today. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/cheques/123/deposit" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `cheques.create`

**POST /cheques** - Register a cheque in the cheque book. A received cheque starts on hand, an issued cheque starts as issued, and the money only reaches the bank account when the cheque clears. · scope: `account.cheque.manage` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `direction` | enum("IN", "OUT") | yes | IN is a cheque you received from a customer, OUT is a cheque you wrote to a vendor. |
| `chequeNo` | string | yes | Cheque number as printed on the cheque. · min length 1 · max length 40 |
| `bankName` | string | yes | Bank that the cheque is drawn on. · min length 1 · max length 80 |
| `bankBranch` | one of several shapes | no | Branch printed on the cheque. |
| `chequeDate` | string | yes | Date written on the cheque, which is when it can be banked. |
| `amountSatang` | integer | yes | Face value of the cheque in satang. |
| `financeAccountId` | one of several shapes | no | - |
| `documentId` | one of several shapes | no | - |
| `note` | one of several shapes | no | Note kept with the cheque. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/cheques" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"direction":"IN","chequeNo":"example chequeNo","bankName":"example bankName","chequeDate":"example chequeDate","amountSatang":10000}'
```

#### `contact-groups.remove-member`

**DELETE /contact-groups/{id}/members/{contactId}** - Remove one contact from a group. · scope: `account.contact.manage` · write

Path parameters: `id`, `contactId` (required).

No body fields.

```bash
curl -sS -X DELETE "https://shark.in.th/api/v1/account/contact-groups/123/members/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)"
```

#### `contact-groups.add-members`

**POST /contact-groups/{id}/members** - Add contacts to a group. Contacts already in the group are skipped; adding the same set twice adds 0. · scope: `account.contact.manage` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `contactIds` | array of string | yes | - |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/contact-groups/123/members" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"contactIds":[]}'
```

#### `contact-groups.create`

**POST /contact-groups** - Create a custom contact group. · scope: `account.contact.manage` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `name` | string | yes | min length 1 · max length 80 |
| `color` | one of several shapes | no | - |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/contact-groups" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"name":"example name"}'
```

#### `contacts.link`

**POST /contacts/{id}/links** - Link this contact to a member or CRM record: both start pointing at the same underlying identity. · scope: `account.contact.manage` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `target` | enum("member", "crm") | yes | Which system to link to. |
| `targetId` | string | yes | Id of the member or CRM contact record in that system. · min length 1 · max length 60 |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/contacts/123/links" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"target":"member","targetId":"example targetId"}'
```

#### `contacts.restore`

**POST /contacts/{id}/restore** - Reactivate a contact that was deactivated. · scope: `account.contact.manage` · write

Path parameters: `id` (required).

No body fields.

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/contacts/123/restore" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)"
```

#### `contacts.archive`

**DELETE /contacts/{id}** - Deactivate a contact (soft delete). Its documents and history are kept untouched. · scope: `account.contact.manage` · write

Path parameters: `id` (required).

No body fields.

```bash
curl -sS -X DELETE "https://shark.in.th/api/v1/account/contacts/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)"
```

#### `contacts.update`

**PATCH /contacts/{id}** - Change a contact. Only the fields that are sent are changed. · scope: `account.contact.manage` · write · AI tool: `account_update_contact`

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `kind` | enum("CUSTOMER", "VENDOR", "BOTH") | no | CUSTOMER, VENDOR or BOTH. |
| `legalType` | enum("PERSON", "COMPANY") | no | COMPANY or PERSON. Default COMPANY. |
| `name` | string | no | min length 1 · max length 200 |
| `taxId` | one of several shapes | no | Thai juristic/person tax id, 13 digits. Any other length or shape returns 422. |
| `taxIdCountry` | one of several shapes | no | ISO country code of the tax id. "TH" (default) requires 13 digits; anything else skips that check. |
| `branchCode` | one of several shapes | no | Branch code, e.g. "00000" for head office. Default "00000". |
| `branchName` | one of several shapes | no | - |
| `address` | one of several shapes | no | Either a single printable address string, or a breakdown object (addressLine/subdistrict/district/province/postcode/country). The breakdown is joined into a single printable address automatically. |
| `phone` | one of several shapes | no | Any Thai phone format; it is normalized for duplicate matching, e.g. `08-1234-5678` becomes `0812345678`. |
| `email` | one of several shapes | no | - |
| `website` | one of several shapes | no | - |
| `lineId` | one of several shapes | no | - |
| `contactPerson` | one of several shapes | no | - |
| `creditTermDays` | integer | no | min 0 · max 365 |
| `note` | one of several shapes | no | - |
| `code` | one of several shapes | no | Contact number, e.g. "C00019". Omit to let the book assign the next one. |
| `groupIds` | array of string | no | Custom contact groups this contact belongs to. Replaces the whole set. |

```bash
curl -sS -X PATCH "https://shark.in.th/api/v1/account/contacts/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `contacts.dismiss-merge`

**POST /contacts/merge-candidates/dismiss** - Mark a suggested pair as not the same contact, so it stops showing up as a merge candidate. · scope: `account.contact.merge` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `aId` | string | yes | min length 1 · max length 40 |
| `bId` | string | yes | min length 1 · max length 40 |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/contacts/merge-candidates/dismiss" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"aId":"example aId","bId":"example bId"}'
```

#### `contacts.create`

**POST /contacts** - Create a customer or vendor. A matching tax id + branch code returns 409; a matching phone or name still creates the contact but returns warnings. · scope: `account.contact.manage` · write · AI tool: `account_create_contact`

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `kind` | enum("CUSTOMER", "VENDOR", "BOTH") | yes | CUSTOMER, VENDOR or BOTH. |
| `legalType` | enum("PERSON", "COMPANY") | no | COMPANY or PERSON. Default COMPANY. |
| `name` | string | yes | min length 1 · max length 200 |
| `taxId` | one of several shapes | no | Thai juristic/person tax id, 13 digits. Any other length or shape returns 422. |
| `taxIdCountry` | one of several shapes | no | ISO country code of the tax id. "TH" (default) requires 13 digits; anything else skips that check. |
| `branchCode` | one of several shapes | no | Branch code, e.g. "00000" for head office. Default "00000". |
| `branchName` | one of several shapes | no | - |
| `address` | one of several shapes | no | Either a single printable address string, or a breakdown object (addressLine/subdistrict/district/province/postcode/country). The breakdown is joined into a single printable address automatically. |
| `phone` | one of several shapes | no | Any Thai phone format; it is normalized for duplicate matching, e.g. `08-1234-5678` becomes `0812345678`. |
| `email` | one of several shapes | no | - |
| `website` | one of several shapes | no | - |
| `lineId` | one of several shapes | no | - |
| `contactPerson` | one of several shapes | no | - |
| `creditTermDays` | integer | no | min 0 · max 365 |
| `note` | one of several shapes | no | - |
| `code` | one of several shapes | no | Contact number, e.g. "C00019". Omit to let the book assign the next one. |
| `groupIds` | array of string | no | Custom contact groups this contact belongs to. Replaces the whole set. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/contacts" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"kind":"CUSTOMER","name":"example name"}'
```

#### `doc-type-accounts.set`

**PUT /doc-type-accounts/{docType}** - Set the income or expense account used when documents of one type are posted, overriding the general rule. Send accountId null to drop the override and fall back to the default account again. · scope: `account.mapping.manage` · write

Path parameters: `docType` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `accountId` | one of several shapes | yes | Ledger account for this document type, or null to remove the override. |

```bash
curl -sS -X PUT "https://shark.in.th/api/v1/account/doc-type-accounts/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"accountId":"example accountId"}'
```

#### `documents.approve`

**POST /documents/{id}/approve** - Approve a purchase order that is waiting for approval. · scope: `account.doc.approve` · write · AI tool: `account_approve_document`

Path parameters: `id` (required).

No body fields.

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/documents/123/approve" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)"
```

#### `documents.delete-attachment`

**DELETE /documents/{id}/attachments/{attId}** - Remove a file from a document. The file is unlinked and archived, never destroyed. · scope: `account.doc.create` · write

Path parameters: `id`, `attId` (required).

No body fields.

```bash
curl -sS -X DELETE "https://shark.in.th/api/v1/account/documents/123/attachments/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)"
```

#### `documents.add-attachment`

**POST /documents/{id}/attachments** - Attach a file that is already hosted somewhere to a document, by URL. · scope: `account.doc.create` · write · AI tool: `account_upload_file`

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `fileUrl` | string | yes | Public URL of the file. Must start with http:// or https://. · max length 2000 |
| `fileName` | string | yes | File name to show, for example `slip-001.jpg`. · min length 1 · max length 200 |
| `mime` | one of several shapes | no | Content type. Guessed from the file name when omitted. |
| `sizeBytes` | one of several shapes | no | File size in bytes, when known. |
| `sha256` | one of several shapes | no | Hex sha256 of the file. When it matches a file already in this book, that file is reused and `duplicate` is true. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/documents/123/attachments" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"fileUrl":"example fileUrl","fileName":"example fileName"}'
```

#### `documents.convert`

**POST /documents/{id}/convert** - Create the follow up document of an issued one, for example quotation to invoice or invoice to receipt. The new document starts as a draft. · scope: `account.doc.create` · write · AI tool: `account_convert_document`

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `toType` | one of several shapes | no | Target document type. Not needed for a purchase order, which always converts to its own follow up document. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/documents/123/convert" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `documents.set-deposits`

**PUT /documents/{id}/deposits** - Replace the deposits deducted from this draft with the given set and return the new grand total. · scope: `account.doc.create` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `picks` | array of object | yes | The complete set of deductions for this document. Sending an empty array clears them all. |

```bash
curl -sS -X PUT "https://shark.in.th/api/v1/account/documents/123/deposits" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"picks":[]}'
```

#### `documents.issue`

**POST /documents/{id}/issue** - Issue a draft: it takes the next document number and posts to the ledger. A purchase order is sent for approval instead. · scope: `account.doc.issue` · write · AI tool: `account_issue_document`

Path parameters: `id` (required).

No body fields.

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/documents/123/issue" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)"
```

#### `documents.public-link`

**POST /documents/{id}/public-link** - Create (or reuse) the public link where the customer can see the document and ask for a tax invoice. · scope: `account.doc.public_link` · write · AI tool: `account_create_payment_link`

Path parameters: `id` (required).

No body fields.

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/documents/123/public-link" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)"
```

#### `documents.receive`

**POST /documents/{id}/receive** - Mark the paper as received: a purchase tax invoice becomes RECEIVED and posts input VAT, an asset purchase becomes RECEIVED. · scope: `account.payment.record` · write

Path parameters: `id` (required).

No body fields.

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/documents/123/receive" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)"
```

#### `documents.reject`

**POST /documents/{id}/reject** - Turn down a purchase order that is waiting for approval, with a reason. · scope: `account.doc.approve` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `reason` | string | yes | Why the purchase order is turned down. Stored on the document and in the audit log. · min length 1 · max length 500 |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/documents/123/reject" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"reason":"reason for the audit log"}'
```

#### `documents.remind`

**POST /documents/{id}/remind** - Email the contact a payment reminder for this document, with a link to it. · scope: `account.doc.view` · write · AI tool: `account_email_document`

Path parameters: `id` (required).

No body fields.

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/documents/123/remind" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)"
```

#### `documents.respond`

**POST /documents/{id}/respond** - Record the customer answer to a quotation: accepted or rejected. · scope: `account.doc.create` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `accepted` | boolean | yes | True when the customer accepted the quotation, false when they turned it down. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/documents/123/respond" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"accepted":true}'
```

#### `documents.set-tags`

**PUT /documents/{id}/tags** - Replace every tag of one document with the given list. Works on any document that is not cancelled or voided. · scope: `account.doc.create` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `tags` | array of string | yes | Labels for grouping documents. At most 10 tags, each at most 30 characters. |

```bash
curl -sS -X PUT "https://shark.in.th/api/v1/account/documents/123/tags" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"tags":[]}'
```

#### `documents.delete`

**DELETE /documents/{id}** - Cancel a draft document. The row is kept with status CANCELLED; issued documents must be voided instead. · scope: `account.doc.create` · write

Path parameters: `id` (required).

No body fields.

```bash
curl -sS -X DELETE "https://shark.in.th/api/v1/account/documents/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)"
```

#### `documents.update`

**PATCH /documents/{id}** - Change a draft document. Only fields that are sent are changed; sending `lines` replaces every line. Issued documents cannot be edited. · scope: `account.doc.create` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `contactId` | one of several shapes | no | Id of the customer or vendor in this book. |
| `issueDate` | string | no | issueDate (Thai calendar day, YYYY-MM-DD). |
| `dueDate` | one of several shapes | no | - |
| `validUntil` | one of several shapes | no | - |
| `vatMode` | enum("EXCLUDE", "INCLUDE", "NONE") | no | How the unit prices relate to VAT: `EXCLUDE` (price before VAT), `INCLUDE` (price already contains VAT) or `NONE`. |
| `vatTiming` | enum("ON_ISSUE", "ON_PAYMENT") | no | Tax point: `ON_ISSUE` for goods, `ON_PAYMENT` for services. Default: the setting of the book. |
| `vatPurchaseMode` | enum("CLAIM", "AWAITING", "NO_CLAIM") | no | Purchase VAT handling: `CLAIM` (claimable now), `AWAITING` (waiting for the tax invoice) or `NO_CLAIM`. |
| `discountSatang` | integer | no | Discount on the whole document in satang (integer). · min 0 |
| `note` | one of several shapes | no | Note printed on the document. |
| `adjustReason` | one of several shapes | no | Reason required by the Revenue Department on credit and debit notes. |
| `sourceDocId` | one of several shapes | no | Id of the document this one refers to (credit and debit notes). |
| `tags` | array of string | no | Labels for grouping documents. At most 10 tags, each at most 30 characters. |
| `lines` | array of object | no | Replaces every line of the draft when sent. Omit to keep the current lines. |

```bash
curl -sS -X PATCH "https://shark.in.th/api/v1/account/documents/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `documents.create`

**POST /documents** - Create a document as a draft: quotation, invoice, deposit, credit or debit note, expense, purchase, purchase order, or a grouped billing note. · scope: `account.doc.create` · write · AI tool: `account_create_document`

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `type` | enum("QUOTATION", "INVOICE", "DEPOSIT_RECEIPT", "CREDIT_NOTE", "DEBIT_NOTE", "BILLING_NOTE", "EXPENSE", "PURCHASE", "PURCHASE_ORDER", "ASSET_PURCHASE_ORDER", "ASSET_PURCHASE", "PURCHASE_TAX_INVOICE", "DEPOSIT_PAYMENT", "CREDIT_NOTE_RECEIVED", "DEBIT_NOTE_RECEIVED", "COMBINED_PAYMENT") | yes | Document type to create. Types that only come from a conversion (RECEIPT, TAX_INVOICE) are rejected with 422. |
| `contactId` | one of several shapes | no | Id of the customer or vendor in this book. |
| `issueDate` | string | no | issueDate (Thai calendar day, YYYY-MM-DD). |
| `dueDate` | one of several shapes | no | - |
| `validUntil` | one of several shapes | no | - |
| `vatMode` | enum("EXCLUDE", "INCLUDE", "NONE") | no | How the unit prices relate to VAT: `EXCLUDE` (price before VAT), `INCLUDE` (price already contains VAT) or `NONE`. |
| `vatTiming` | enum("ON_ISSUE", "ON_PAYMENT") | no | Tax point: `ON_ISSUE` for goods, `ON_PAYMENT` for services. Default: the setting of the book. |
| `vatPurchaseMode` | enum("CLAIM", "AWAITING", "NO_CLAIM") | no | Purchase VAT handling: `CLAIM` (claimable now), `AWAITING` (waiting for the tax invoice) or `NO_CLAIM`. |
| `discountSatang` | integer | no | Discount on the whole document in satang (integer). · min 0 |
| `note` | one of several shapes | no | Note printed on the document. |
| `adjustReason` | one of several shapes | no | Reason required by the Revenue Department on credit and debit notes. |
| `sourceDocId` | one of several shapes | no | Id of the document this one refers to (credit and debit notes). |
| `tags` | array of string | no | Labels for grouping documents. At most 10 tags, each at most 30 characters. |
| `refType` | string | no | Name of the record in your own system this document belongs to, for example `Booking`. · min length 1 · max length 60 |
| `refId` | string | no | Id of that record. Sending the same pair twice returns 409 `duplicate` with the existing id in `hint`. · min length 1 · max length 60 |
| `childIds` | array of string | no | Documents to group, for BILLING_NOTE and COMBINED_PAYMENT only. At least 2 ids. |
| `lines` | array of object | no | Lines of the document. At least one, except for BILLING_NOTE and COMBINED_PAYMENT which take `childIds` instead. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/documents" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"type":"QUOTATION"}'
```

#### `echo`

**POST /echo** - Echo back the request body plus a random nonce (used to verify idempotency). · scope: `account.doc.create` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `text` | string | yes | min length 1 · max length 100 |
| `amountSatang` | integer | no | min 0 |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/echo" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"text":"example text"}'
```

#### `favorites.save`

**POST /favorites** - Save a set of document lines under a name so it can be reused later. At most 20 sets are kept. · scope: `account.doc.create` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `name` | string | yes | Name of the saved set of lines. Saving with an existing name replaces it. · min length 1 · max length 80 |
| `lines` | array of object | yes | Lines of the template. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/favorites" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"name":"example name","lines":[]}'
```

#### `files.update`

**PATCH /files/{id}** - Change one document-vault file: link/unlink it to a document, move it to a folder, archive/restore it, flag it as not accounting, or set its document-type hint. At least one field is required. · scope: `account.document.manage` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `documentId` | one of several shapes | no | Link the file to this document. Send null to unlink it. |
| `folder` | one of several shapes | no | Move the file into this folder. Send null to clear the folder. |
| `archived` | boolean | no | true archives (soft-deletes) the file, false restores it. |
| `notAccounting` | boolean | no | true flags the file as not an accounting document. |
| `docTypeHint` | one of several shapes | no | Document-type hint, only when the file is not linked to a document yet. |

```bash
curl -sS -X PATCH "https://shark.in.th/api/v1/account/files/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `files.bulk`

**POST /files/bulk** - Move or archive several document-vault files in one call. · scope: `account.document.manage` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `ids` | array of string | yes | - |
| `folder` | one of several shapes | no | Move every file to this folder. |
| `archived` | boolean | no | true archives every file in the list. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/files/bulk" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"ids":[]}'
```

#### `finance-accounts.add-opening`

**POST /finance-accounts/{id}/opening** - Add one opening balance line to a money channel. Each line becomes its own journal entry, so a channel taken over from several old books keeps them apart. · scope: `account.finance.manage` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `date` | string | yes | date (Thai calendar day, YYYY-MM-DD). |
| `amountSatang` | integer | yes | Opening amount in satang. Negative means the channel was overdrawn when the books were taken over. |
| `note` | one of several shapes | no | What this opening line is, such as which old book it came from. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/finance-accounts/123/opening" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"date":"example date","amountSatang":10000}'
```

#### `finance-accounts.archive`

**DELETE /finance-accounts/{id}** - Retire a money channel. Nothing is deleted: past entries stay in the books. A channel with a balance left, or one used for a payment this month, is refused. · scope: `account.finance.manage` · write

Path parameters: `id` (required).

No body fields.

```bash
curl -sS -X DELETE "https://shark.in.th/api/v1/account/finance-accounts/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)"
```

#### `finance-accounts.update`

**PATCH /finance-accounts/{id}** - Change the details of one money channel. Fields that are not sent keep their current value. Opening balances are not touched here. · scope: `account.finance.manage` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `name` | string | no | min length 1 · max length 120 |
| `code` | one of several shapes | no | Channel code. Leave it out and the system issues the next free one, such as BSV001. |
| `bankSubtype` | one of several shapes | no | - |
| `bankName` | one of several shapes | no | Bank name as printed on documents, such as KBANK. |
| `bankBranch` | one of several shapes | no | Branch of the account. |
| `accountNo` | one of several shapes | no | Bank account number. |
| `accountName` | one of several shapes | no | Account holder name as registered with the bank. |
| `promptpayId` | one of several shapes | no | PromptPay id used to build payment QR codes for this channel. |
| `note` | one of several shapes | no | Free note kept with the channel. |
| `useForReceive` | boolean | no | Offer this channel when money comes in. Default true. |
| `useForPay` | boolean | no | Offer this channel when money goes out. Default true. |
| `showOnDocuments` | boolean | no | Print the account details on invoices so the customer can transfer. Default false. |
| `limitSatang` | one of several shapes | no | Ceiling of the float or the card limit in satang. Informational. |
| `holderUserId` | one of several shapes | no | - |

```bash
curl -sS -X PATCH "https://shark.in.th/api/v1/account/finance-accounts/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `finance-accounts.create`

**POST /finance-accounts** - Add a cash box, bank account, wallet or petty cash float. A child ledger account is created with it, and the opening balance is posted as a journal entry. · scope: `account.finance.manage` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `type` | enum("CASH", "BANK", "E_WALLET", "PETTY_CASH") | yes | Kind of money channel. CASH is a cash box, BANK is a bank account, E_WALLET is a wallet such as TrueMoney, PETTY_CASH is a small float handed to staff. The channel code and the matching ledger account are created from this. |
| `name` | string | yes | Name shown everywhere, such as Kasikorn savings. · min length 1 · max length 120 |
| `code` | one of several shapes | no | Channel code. Leave it out and the system issues the next free one, such as BSV001. |
| `bankSubtype` | one of several shapes | no | - |
| `bankName` | one of several shapes | no | Bank name as printed on documents, such as KBANK. |
| `bankBranch` | one of several shapes | no | Branch of the account. |
| `accountNo` | one of several shapes | no | Bank account number. |
| `accountName` | one of several shapes | no | Account holder name as registered with the bank. |
| `promptpayId` | one of several shapes | no | PromptPay id used to build payment QR codes for this channel. |
| `note` | one of several shapes | no | Free note kept with the channel. |
| `useForReceive` | boolean | no | Offer this channel when money comes in. Default true. |
| `useForPay` | boolean | no | Offer this channel when money goes out. Default true. |
| `showOnDocuments` | boolean | no | Print the account details on invoices so the customer can transfer. Default false. |
| `limitSatang` | one of several shapes | no | Ceiling of the float or the card limit in satang. Informational. |
| `holderUserId` | one of several shapes | no | - |
| `openingSatang` | integer | no | Opening balance in satang carried over from the old books. A journal entry is posted for it. |
| `openingDate` | string | no | Date of the opening balance. Default today. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/finance-accounts" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"type":"CASH","name":"example name"}'
```

#### `finance.transfer`

**POST /finance-transfers** - Move money between two of your own channels, such as a cash deposit into the bank. One journal entry is posted. Sending the same Idempotency-Key again returns the first transfer instead of moving the money twice. · scope: `account.finance.manage` · write · AI tool: `account_transfer_funds`

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `fromId` | string | yes | Id of the channel the money leaves. · min length 1 · max length 40 |
| `toId` | string | yes | Id of the channel the money lands in. · min length 1 · max length 40 |
| `amountSatang` | integer | yes | Amount moved in satang. 5,000.00 baht is 500000. |
| `date` | string | no | Date of the transfer. Default today. |
| `note` | one of several shapes | no | Why the money was moved. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/finance-transfers" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"fromId":"example fromId","toId":"example toId","amountSatang":10000}'
```

#### `import.preview`

**POST /import/preview** - Check a CSV file before importing it: column mapping, per-row validation and a count of rows that would be created. · scope: `account.import` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `kind` | enum("documents_revenue", "documents_expense", "contacts", "products", "chart_of_accounts") | yes | - |
| `text` | string | yes | Raw CSV content, UTF-8 (a leading BOM is fine). · min length 1 · max length 6000000 |
| `mapping` | object | no | Column index per field key. Omit to auto-match from the header row. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/import/preview" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"kind":"documents_revenue","text":"example text"}'
```

#### `import.run`

**POST /import/run** - Import a CSV file for real, using a mapping already checked with import.preview. Rate-limited to 20 imports per hour per accounting book. · scope: `account.import` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `kind` | enum("documents_revenue", "documents_expense", "contacts", "products", "chart_of_accounts") | yes | - |
| `text` | string | yes | min length 1 · max length 6000000 |
| `mapping` | object | yes | - |
| `skipErrorRows` | boolean | no | true creates the valid rows of a file that also has bad rows, instead of refusing the whole file. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/import/run" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"kind":"documents_revenue","text":"example text","mapping":{}}'
```

#### `inbox.create-expense`

**POST /inbox/{fileId}/create-expense** - Confirm the AI proposal (or your own numbers) and issue a draft expense document from one inbox file. The file is linked to the document it creates and cannot be used to create a second one. · scope: `account.doc.create` · write

Path parameters: `fileId` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `vendorName` | string | no | max length 200 |
| `vendorTaxId` | one of several shapes | no | - |
| `vendorPhone` | one of several shapes | no | - |
| `invoiceNo` | one of several shapes | no | - |
| `issueDate` | one of several shapes | no | - |
| `totalSatang` | integer | no | min 0 |
| `vatSatang` | integer | no | min 0 |
| `vatRateBp` | integer | no | min 0 · max 10000 |
| `docKind` | enum("RECEIPT", "TAX_INVOICE", "INVOICE", "SLIP", "OTHER") | no | - |
| `note` | one of several shapes | no | - |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/inbox/123/create-expense" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `inbox.read`

**POST /inbox/{fileId}/read** - Have the AI assistant read one inbox photo and extract vendor, dates and amounts. Cached after the first successful read unless force is sent. · scope: `account.document.manage` · write · AI tool: `account_read_bill_image`

Path parameters: `fileId` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `force` | boolean | no | Read again even if this file was already read successfully. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/inbox/123/read" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `inbox.ingest`

**POST /inbox/files** - Bring files from an external channel into the inbox. Safe to retry: a file whose sourceRef was already ingested is counted as duplicated instead of created again. · scope: `account.document.manage` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `source` | enum("UPLOAD", "EMAIL", "CHAT", "APP", "API") | yes | - |
| `senderLabel` | one of several shapes | no | Who/what sent this, shown on the inbox card. |
| `files` | array of object | yes | - |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/inbox/files" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"source":"UPLOAD","files":[]}'
```

#### `journal.flag`

**POST /journal/{id}/flag** - Toggle the review flag of one journal entry. Flagged entries block closing the period they sit in, so this is how an app parks something for the accountant to look at. Calling it again clears the flag. · scope: `account.journal.adjust` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `note` | one of several shapes | no | What has to be checked. Cleared when the flag is removed. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/journal/123/flag" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `journal.create`

**POST /journal** - Post a manual journal entry. Total debit must equal total credit and the entry must fall in a period that is still open. The entry is posted straight away, it is not a draft. · scope: `account.journal.adjust` · write · AI tool: `account_post_journal`

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `date` | string | yes | date (Thai calendar day, YYYY-MM-DD). |
| `book` | enum("SALES", "PURCHASES", "RECEIPTS", "PAYMENTS", "GENERAL") | no | Journal book the entry belongs to. Default GENERAL. |
| `memo` | one of several shapes | no | What the entry is for. Shown in the journal list. |
| `lines` | array of object | yes | At least two lines. Total debit must equal total credit. |
| `attachmentIds` | array of string | no | Files to attach to the entry as evidence. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/journal" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"date":"example date","lines":[]}'
```

#### `links.update`

**PATCH /links/{kind}** - Change the automation options of a linked system (auto-create contact, sync prices, auto-post, inbox from chat). · scope: `account.settings.manage` · write

Path parameters: `kind` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `options` | object | yes | - |

```bash
curl -sS -X PATCH "https://shark.in.th/api/v1/account/links/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"options":{}}'
```

#### `links.connect`

**POST /links** - Link another system in this shop (POS, member system, inventory, ...) to this accounting book. · scope: `account.settings.manage` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `kind` | enum("POS", "BUSINESS", "CRM", "MEMBER", "INVENTORY", "CHAT", "HR") | yes | - |
| `linkedId` | string | yes | min length 1 · max length 60 |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/links" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"kind":"POS","linkedId":"example linkedId"}'
```

#### `mappings.set`

**PUT /mappings/{key}** - Point one posting rule at a different ledger account. The keys are the ones returned by the mappings list, such as AR, VAT_OUTPUT or DEPRECIATION_EXPENSE. Every document posted from now on uses the new account. · scope: `account.mapping.manage` · write

Path parameters: `key` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `accountId` | string | yes | Ledger account this rule should post to. · min length 1 · max length 40 |

```bash
curl -sS -X PUT "https://shark.in.th/api/v1/account/mappings/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"accountId":"example accountId"}'
```

#### `payment-requests.cancel`

**POST /payment-requests/{id}/cancel** - Cancel a pending payment request. The link stops working immediately. A request that was already paid cannot be cancelled. · scope: `account.payment.record` · write

Path parameters: `id` (required).

No body fields.

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/payment-requests/123/cancel" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)"
```

#### `payment-requests.confirm`

**POST /payment-requests/{id}/confirm** - Confirm by hand that the money for a static PromptPay request has arrived. The payment is recorded once; confirming again returns the same payment with duplicated true. · scope: `account.payment.record` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `paidAt` | string | no | paidAt (Thai calendar day, YYYY-MM-DD). |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/payment-requests/123/confirm" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `payment-requests.create`

**POST /payment-requests** - Create the link and PromptPay QR the customer pays with. Asking again while an identical request is still pending returns the same one instead of a second link. · scope: `account.payment.record` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `documentId` | string | yes | Id of the invoice, deposit receipt or debit note to collect. The amount is always the outstanding balance at this moment; it is never taken from the request. · min length 1 · max length 40 |
| `financeAccountId` | string | yes | Id of the bank account or wallet the money should land in. It must have a PromptPay id set. · min length 1 · max length 40 |
| `expiresInDays` | integer | no | How long the link stays usable. Default 7 days. · min 1 · max 90 |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/payment-requests" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"documentId":"example documentId","financeAccountId":"example financeAccountId"}'
```

#### `payments.record-group`

**POST /payments/group** - Record one transfer against a billing note or combined payment. The amount is spread over the child documents oldest due date first, and each child gets its own payment and ledger entry. · scope: `account.payment.record` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `groupId` | string | yes | Id of the billing note or combined payment. · min length 1 · max length 40 |
| `paidAt` | string | yes | paidAt (Thai calendar day, YYYY-MM-DD). |
| `financeAccountId` | one of several shapes | no | - |
| `tieOffSatang` | integer | yes | Total debt settled by this transfer in satang, cash plus withholding tax. It is spread over the child documents oldest due date first. |
| `feeSatang` | integer | no | Bank fee of this transfer in satang, booked once on the first child document. Default 0. · min 0 |
| `note` | one of several shapes | no | Short note kept on each payment row, at most 20 characters. |
| `wht` | array of object | no | Withholding tax per child document, when the payer deducted it. |
| `cheque` | one of several shapes | no | - |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/payments/group" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"groupId":"example groupId","paidAt":"example paidAt","tieOffSatang":10000}'
```

#### `payments.record`

**POST /payments** - Record money received or paid against a document, with optional withholding tax, bank fee and cheque. The ledger, the document status and the finance account balance all move together. · scope: `account.payment.record` · write · AI tool: `account_record_payment`

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `documentId` | string | yes | Id of the invoice, deposit, purchase or expense being settled. A receipt issued from an invoice settles the invoice. · min length 1 · max length 40 |
| `rows` | array of object | yes | One entry per time money moved. Several entries are recorded as one batch, in order. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/payments" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"documentId":"example documentId","rows":[]}'
```

#### `periods.close`

**POST /periods/{key}/close** - Close one accounting period. The pre-close checklist runs first: the suspense account must be clear and no entry in the period may still be flagged for review. Once closed nothing can be posted into it any more. · scope: `account.period.close` · write · AI tool: `account_close_period`

Path parameters: `key` (required).

No body fields.

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/periods/123/close" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)"
```

#### `periods.vat-filed`

**POST /periods/{key}/vat-filed** - Record that the VAT return (form PP.30) of one month has been filed, together with the output and input VAT that were on it. This is checklist item four when the period is closed. · scope: `account.period.close` · write

Path parameters: `key` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `salesVatSatang` | integer | yes | Output VAT on the return, in satang. · min 0 |
| `inputVatSatang` | integer | yes | Input VAT on the return, in satang. · min 0 |
| `note` | one of several shapes | no | How it was filed, for example through the e-filing site. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/periods/123/vat-filed" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"salesVatSatang":10000,"inputVatSatang":10000}'
```

#### `petty-cash.reimburse`

**POST /petty-cash/reimburse** - Refill a petty cash box by exactly one expense that was paid out of it, so the float returns to its ceiling. The same expense cannot be claimed twice. · scope: `account.finance.manage` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `paymentId` | string | yes | Id of the expense payment that was paid out of the petty cash box. Take it from the payments of the expense document. · min length 1 · max length 40 |
| `sourceFinanceAccountId` | string | yes | Id of the bank account or cash box that refills the box. · min length 1 · max length 40 |
| `date` | string | no | Date of the refill. Default today. |
| `note` | one of several shapes | no | Note kept on the transfer. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/petty-cash/reimburse" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"paymentId":"example paymentId","sourceFinanceAccountId":"example sourceFinanceAccountId"}'
```

#### `petty-cash.top-up`

**POST /petty-cash/top-up** - Put money into a petty cash box from a bank account or cash box. Booked as a transfer between the two channels. · scope: `account.finance.manage` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `pettyId` | string | yes | Id of the petty cash box being filled. It must be a PETTY_CASH channel. · min length 1 · max length 40 |
| `sourceFinanceAccountId` | string | yes | Id of the bank account or cash box the money comes from. · min length 1 · max length 40 |
| `amountSatang` | integer | yes | Amount put into the box, in satang. |
| `date` | string | no | Date of the top up. Default today. |
| `note` | one of several shapes | no | Note kept on the transfer. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/petty-cash/top-up" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"pettyId":"example pettyId","sourceFinanceAccountId":"example sourceFinanceAccountId","amountSatang":10000}'
```

#### `products.set-bundle`

**PUT /products/{id}/bundle** - Replace the recipe of a bundle product with the given components and quantities. · scope: `account.product.manage` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `items` | array of object | yes | - |

```bash
curl -sS -X PUT "https://shark.in.th/api/v1/account/products/123/bundle" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"items":[]}'
```

#### `products.unlink-inventory`

**DELETE /products/{id}/link-inventory** - Unlink this product from its warehouse item. The last known quantity is frozen onto the product itself. · scope: `account.product.manage` · write

Path parameters: `id` (required).

No body fields.

```bash
curl -sS -X DELETE "https://shark.in.th/api/v1/account/products/123/link-inventory" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)"
```

#### `products.link-inventory`

**POST /products/{id}/link-inventory** - Link this product to a warehouse item (existing or newly created) so its stock is tracked there. · scope: `account.product.manage` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `itemId` | string | no | Id of an existing item in the warehouse module to link to. · max length 40 |
| `createItem` | object | no | Create a new warehouse item from this product's data instead of linking an existing one. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/products/123/link-inventory" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `products.add-opening-lot`

**POST /products/{id}/opening-lots** - Add an opening balance lot: receives the quantity into stock at the given unit cost and posts the opening journal entry. · scope: `account.product.manage` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `date` | string | yes | date (Thai calendar day, YYYY-MM-DD). |
| `qty` | number | yes | max 1000000000 |
| `unitCostSatang` | integer | yes | min 0 |
| `warehouseId` | one of several shapes | no | - |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/products/123/opening-lots" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"date":"example date","qty":0,"unitCostSatang":10000}'
```

#### `products.archive`

**DELETE /products/{id}** - Deactivate a product/service/bundle (soft delete). Past documents keep referencing it. · scope: `account.product.manage` · write

Path parameters: `id` (required).

No body fields.

```bash
curl -sS -X DELETE "https://shark.in.th/api/v1/account/products/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)"
```

#### `products.update`

**PATCH /products/{id}** - Change a product. Only the fields that are sent are changed; the rest keep their current value. · scope: `account.product.manage` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `type` | enum("GOODS", "SERVICE", "BUNDLE") | no | - |
| `name` | string | no | min length 1 · max length 100 |
| `nameEn` | one of several shapes | no | - |
| `sku` | one of several shapes | no | - |
| `code` | one of several shapes | no | - |
| `barcode` | one of several shapes | no | - |
| `unitId` | one of several shapes | no | - |
| `category` | one of several shapes | no | - |
| `description` | one of several shapes | no | - |
| `salePriceSatang` | one of several shapes | no | Sale price in satang (integer). 1,500.00 baht is 150000. |
| `buyPriceSatang` | one of several shapes | no | Cost/buy price in satang (integer). |
| `vatRateBp` | integer | no | VAT rate in basis points: 700 = 7%, 0 = zero rated, -1 = exempt. Default 700. · min -1 · max 10000 |
| `purchaseVatRateBp` | one of several shapes | no | Purchase VAT rate. Null uses vatRateBp. |
| `incomeAccountId` | one of several shapes | no | - |
| `expenseAccountId` | one of several shapes | no | - |
| `cogsAccountCode` | one of several shapes | no | - |
| `inventoryAccountCode` | one of several shapes | no | - |
| `trackStock` | boolean | no | Accepted for forward compatibility; use POST /products/{id}/link-inventory to actually track stock in a warehouse. |
| `imageUrl` | one of several shapes | no | - |
| `defaultWhtType` | one of several shapes | no | - |
| `defaultWhtRateBp` | one of several shapes | no | - |

```bash
curl -sS -X PATCH "https://shark.in.th/api/v1/account/products/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `products.create`

**POST /products** - Create a good, service or bundle. A matching SKU returns 409. · scope: `account.product.manage` · write · AI tool: `account_create_product`

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `type` | enum("GOODS", "SERVICE", "BUNDLE") | yes | - |
| `name` | string | yes | min length 1 · max length 100 |
| `nameEn` | one of several shapes | no | - |
| `sku` | one of several shapes | no | - |
| `code` | one of several shapes | no | - |
| `barcode` | one of several shapes | no | - |
| `unitId` | one of several shapes | no | - |
| `category` | one of several shapes | no | - |
| `description` | one of several shapes | no | - |
| `salePriceSatang` | one of several shapes | no | Sale price in satang (integer). 1,500.00 baht is 150000. |
| `buyPriceSatang` | one of several shapes | no | Cost/buy price in satang (integer). |
| `vatRateBp` | integer | no | VAT rate in basis points: 700 = 7%, 0 = zero rated, -1 = exempt. Default 700. · min -1 · max 10000 |
| `purchaseVatRateBp` | one of several shapes | no | Purchase VAT rate. Null uses vatRateBp. |
| `incomeAccountId` | one of several shapes | no | - |
| `expenseAccountId` | one of several shapes | no | - |
| `cogsAccountCode` | one of several shapes | no | - |
| `inventoryAccountCode` | one of several shapes | no | - |
| `trackStock` | boolean | no | Accepted for forward compatibility; use POST /products/{id}/link-inventory to actually track stock in a warehouse. |
| `imageUrl` | one of several shapes | no | - |
| `defaultWhtType` | one of several shapes | no | - |
| `defaultWhtRateBp` | one of several shapes | no | - |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/products" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"type":"GOODS","name":"example name"}'
```

#### `reconcile.confirm`

**POST /reconcile/{period}/confirm** - Confirm bank reconciliation for one channel and month. Only possible when the difference is zero and nothing is left pending. · scope: `account.reconcile` · write

Path parameters: `period` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `financeAccountId` | string | yes | min length 1 |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/reconcile/123/confirm" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"financeAccountId":"example financeAccountId"}'
```

#### `reconcile.reopen`

**POST /reconcile/{period}/reopen** - Reopen a month that was already confirmed, so its lines can be matched or fixed again. · scope: `account.reconcile` · write

Path parameters: `period` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `financeAccountId` | string | yes | min length 1 |
| `reason` | string | yes | Why this confirmed month is being reopened. Kept in the audit log. · min length 1 · max length 300 |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/reconcile/123/reopen" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"financeAccountId":"example financeAccountId","reason":"reason for the audit log"}'
```

#### `reconcile.create-entry`

**POST /reconcile/lines/{id}/create-entry** - Post a journal entry straight from a bank statement line that has no matching document in the books, such as a bank fee or interest income. · scope: `account.reconcile` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `kind` | enum("FEE", "INTEREST", "OTHER") | yes | FEE posts to the bank fee account, INTEREST to interest income, OTHER lets you pick the ledger account. |
| `accountCode` | one of several shapes | no | Ledger account code. Required when kind is OTHER. |
| `note` | one of several shapes | no | - |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/reconcile/lines/123/create-entry" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"kind":"FEE"}'
```

#### `reconcile.match`

**POST /reconcile/lines/{id}/match** - Manually match one bank statement line to a system journal line. The amounts must be exactly equal. · scope: `account.reconcile` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `journalLineId` | string | yes | Id of the system journal line, taken from `systemEntries` of `reconcile.get`. · min length 1 |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/reconcile/lines/123/match" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"journalLineId":"example journalLineId"}'
```

#### `reconcile.skip`

**POST /reconcile/lines/{id}/skip** - Skip one bank statement line, for example a duplicate the bank recorded that has nothing to do with the business. · scope: `account.reconcile` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `reason` | one of several shapes | no | - |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/reconcile/lines/123/skip" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `reconcile.unmatch`

**POST /reconcile/lines/{id}/unmatch** - Undo a match on one bank statement line. Both sides go back to unmatched. · scope: `account.reconcile` · write

Path parameters: `id` (required).

No body fields.

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/reconcile/lines/123/unmatch" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)"
```

#### `reconcile.auto-match`

**POST /reconcile/statements/{id}/auto-match** - Re-run automatic matching on one imported statement. Lines already matched, created or skipped by a person are left untouched. · scope: `account.reconcile` · write

Path parameters: `id` (required).

No body fields.

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/reconcile/statements/123/auto-match" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)"
```

#### `reconcile.preview-statement`

**POST /reconcile/statements/preview** - Parse a bank statement CSV without saving anything, so the caller can show what would be imported. · scope: `account.reconcile` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `financeAccountId` | string | yes | Id of the bank/e-wallet channel this statement belongs to. · min length 1 |
| `period` | string | yes | Month the statement covers, `YYYY-MM`. |
| `source` | enum("KBANK", "SCB", "KTB", "BBL", "GENERIC") | yes | Bank statement column layout to parse the file with. |
| `text` | string | yes | Raw CSV content of the statement file, UTF-8 (a leading BOM is fine). · min length 1 · max length 6000000 |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/reconcile/statements/preview" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"financeAccountId":"example financeAccountId","period":"example period","source":"KBANK","text":"example text"}'
```

#### `reconcile.import-statement`

**POST /reconcile/statements** - Import a bank statement CSV for one channel and month. Safe to send the same file again: rows already imported are counted as duplicated instead of imported a second time. · scope: `account.reconcile` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `financeAccountId` | string | yes | min length 1 |
| `period` | string | yes | - |
| `source` | enum("KBANK", "SCB", "KTB", "BBL", "GENERIC") | yes | Bank statement column layout to parse the file with. |
| `fileName` | string | yes | min length 1 · max length 200 |
| `text` | string | yes | min length 1 · max length 6000000 |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/reconcile/statements" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"financeAccountId":"example financeAccountId","period":"example period","source":"KBANK","fileName":"example fileName","text":"example text"}'
```

#### `recurring.set-active`

**POST /recurring/{id}/active** - Pause or resume a recurring rule without touching its history. · scope: `account.doc.create` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `active` | boolean | yes | True resumes the rule, false pauses it. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/recurring/123/active" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"active":true}'
```

#### `recurring.run`

**POST /recurring/{id}/run** - Run one recurring rule now. Producing a period twice is impossible, so calling this repeatedly is safe. · scope: `account.doc.create` · write

Path parameters: `id` (required).

No body fields.

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/recurring/123/run" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)"
```

#### `recurring.delete`

**DELETE /recurring/{id}** - Delete a recurring rule. Documents it already produced are kept; only the schedule stops. · scope: `account.doc.create` · write

Path parameters: `id` (required).

No body fields.

```bash
curl -sS -X DELETE "https://shark.in.th/api/v1/account/recurring/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)"
```

#### `recurring.update`

**PATCH /recurring/{id}** - Change a recurring rule. Only the fields that are sent change; sending `template` replaces the whole template. · scope: `account.doc.create` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `name` | string | no | Name of the rule, shown in the recurring documents list. · min length 1 · max length 120 |
| `docType` | enum("INVOICE", "QUOTATION", "EXPENSE", "PURCHASE") | no | Type of document this rule produces. |
| `contactId` | one of several shapes | no | Contact of every document produced. Required when `autoApprove` is true. |
| `frequency` | enum("WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY") | no | How often a document is produced. |
| `dayOfMonth` | one of several shapes | no | Day of the month for MONTHLY, QUARTERLY and YEARLY. 31 is clamped to the last day of short months. |
| `weekday` | one of several shapes | no | Day of the week for WEEKLY: 0 is Sunday. |
| `startDate` | string | no | startDate (Thai calendar day, YYYY-MM-DD). |
| `endDate` | one of several shapes | no | - |
| `leadDays` | integer | no | Produce the document this many days before its date. · min 0 · max 60 |
| `autoApprove` | boolean | no | True issues each document automatically; false leaves it as a draft to check. |
| `active` | boolean | no | False pauses the rule without deleting its history. |
| `template` | object | no | - |

```bash
curl -sS -X PATCH "https://shark.in.th/api/v1/account/recurring/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `recurring.create`

**POST /recurring** - Create a rule that produces the same document every week, month, quarter or year. · scope: `account.doc.create` · write · AI tool: `account_create_recurring`

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `name` | string | yes | Name of the rule, shown in the recurring documents list. · min length 1 · max length 120 |
| `docType` | enum("INVOICE", "QUOTATION", "EXPENSE", "PURCHASE") | yes | Type of document this rule produces. |
| `contactId` | one of several shapes | no | Contact of every document produced. Required when `autoApprove` is true. |
| `frequency` | enum("WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY") | yes | How often a document is produced. |
| `dayOfMonth` | one of several shapes | no | Day of the month for MONTHLY, QUARTERLY and YEARLY. 31 is clamped to the last day of short months. |
| `weekday` | one of several shapes | no | Day of the week for WEEKLY: 0 is Sunday. |
| `startDate` | string | yes | startDate (Thai calendar day, YYYY-MM-DD). |
| `endDate` | one of several shapes | no | - |
| `leadDays` | integer | yes | Produce the document this many days before its date. · min 0 · max 60 |
| `autoApprove` | boolean | yes | True issues each document automatically; false leaves it as a draft to check. |
| `active` | boolean | yes | False pauses the rule without deleting its history. |
| `template` | object | yes | - |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/recurring" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"name":"example name","docType":"INVOICE","frequency":"WEEKLY","startDate":"example startDate","leadDays":0,"autoApprove":true,"active":true,"template":{}}'
```

#### `reports.email`

**POST /reports/email** - Send the daily or weekly summary report by email right now, to the recipients configured in accounting policy. Skipped (not an error) when no recipients are configured yet or outbound email is not set up on this server. · scope: `account.report.view` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `kind` | enum("daily", "weekly") | yes | - |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/reports/email" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"kind":"daily"}'
```

#### `settings.documents.next-no`

**POST /settings/documents/{docType}/next-no** - Set the next running number of one document type. Cannot go lower than a number already used this period. · scope: `account.settings.manage` · write

Path parameters: `docType` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `nextNo` | integer | yes | min 1 · max 999999 |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/settings/documents/123/next-no" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"nextNo":1}'
```

#### `settings.documents.update`

**PATCH /settings/documents/{docType}** - Change the numbering pattern, due days, footer note, terms or print settings of one document type. · scope: `account.settings.manage` · write

Path parameters: `docType` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `prefix` | string | no | Code shown before the running number, such as "INV". · max length 12 |
| `pattern` | string | no | Number pattern. Tokens: {prefix} {yyyy} {yy} {mm} {dd} {br} and a sequence token such as {seq4} (4-digit running number) or {seq}. · max length 60 |
| `reset` | enum("NONE", "YEARLY", "MONTHLY") | no | When the running number resets to 1. |
| `dueDays` | integer | no | Payment due days (purchase orders: lead time to receive goods). · min 0 · max 3650 |
| `validDays` | integer | no | Quotation validity in days. · min 0 · max 3650 |
| `notes` | string | no | Footer note printed at the bottom of this document type. · max length 1000 |
| `terms` | string | no | Payment terms line printed on this document type. · max length 500 |
| `publicLink` | object | no | - |
| `autoTaxInvoice` | enum("MANUAL", "ON_PAYMENT", "ON_INVOICE") | no | - |
| `printTemplate` | enum("STANDARD", "COMPACT", "WITH_IMAGES") | no | - |
| `channels` | array of string | no | Money channel ids, in the order printed on documents. |

```bash
curl -sS -X PATCH "https://shark.in.th/api/v1/account/settings/documents/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `settings.permissions.assign`

**POST /settings/permissions/assign** - Assign an accounting role to one staff member. Writes the permissions immediately. · scope: `account.settings.manage` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `membershipId` | string | yes | min length 1 |
| `roleKey` | string | yes | min length 1 |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/settings/permissions/assign" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"membershipId":"example membershipId","roleKey":"example roleKey"}'
```

#### `settings.permissions.set-cap`

**PUT /settings/permissions/caps/{membershipId}** - Set the approval ceiling of one staff member in satang. null removes the ceiling. · scope: `account.settings.manage` · write

Path parameters: `membershipId` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `capSatang` | one of several shapes | yes | - |

```bash
curl -sS -X PUT "https://shark.in.th/api/v1/account/settings/permissions/caps/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"capSatang":"example capSatang"}'
```

#### `settings.permissions.save-role`

**PUT /settings/permissions/roles/{key}** - Update a custom role's permissions and cap. Everyone currently in the role is re-written immediately. System roles (owner/manager) cannot be changed. · scope: `account.settings.manage` · write

Path parameters: `key` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `name` | string | yes | min length 1 · max length 60 |
| `cells` | object | yes | - |
| `capSatang` | one of several shapes | no | - |

```bash
curl -sS -X PUT "https://shark.in.th/api/v1/account/settings/permissions/roles/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"name":"example name","cells":{}}'
```

#### `settings.permissions.add-role`

**POST /settings/permissions/roles** - Create a custom accounting role with a permission matrix and an optional approval cap. · scope: `account.settings.manage` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `name` | string | yes | min length 1 · max length 60 |
| `cells` | object | yes | - |
| `capSatang` | one of several shapes | no | - |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/settings/permissions/roles" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"name":"example name","cells":{}}'
```

#### `settings.policy.update`

**PATCH /settings/policy** - Change accounting policy: fiscal year, VAT timing, date lock, duplicate rules, conversion defaults and report emails. · scope: `account.settings.manage` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `fiscalYearStartMonth` | integer | no | min 1 · max 12 |
| `periodCloseDay` | one of several shapes | no | - |
| `vatRegistered` | boolean | no | - |
| `vatRateBp` | integer | no | min 0 · max 10000 |
| `vatTiming` | enum("ON_ISSUE", "ON_PAYMENT") | no | - |
| `defaultPriceMode` | one of several shapes | no | - |
| `lockBeforeDate` | one of several shapes | no | - |
| `dupContactPolicy` | enum("WARN", "BLOCK") | no | - |
| `dupProductPolicy` | enum("WARN", "BLOCK") | no | - |
| `defaultSalesAccountCode` | one of several shapes | no | - |
| `defaultPurchaseAccountCode` | one of several shapes | no | - |
| `defaultExpenseAccountCode` | one of several shapes | no | - |
| `convertQtTo` | enum("INVOICE", "DEPOSIT_RECEIPT") | no | - |
| `convertPoTo` | enum("PURCHASE", "EXPENSE") | no | - |
| `copyNotesOnConvert` | boolean | no | - |
| `copyTagsOnConvert` | boolean | no | - |
| `autoClosePeriods` | boolean | no | - |
| `autoCloseNotify` | boolean | no | - |
| `emailReportDaily` | boolean | no | - |
| `emailReportWeekly` | boolean | no | - |
| `emailReportRecipients` | array of string | no | - |
| `whtDefaults` | array of object | no | - |
| `regularCustomer` | object | no | - |

```bash
curl -sS -X PATCH "https://shark.in.th/api/v1/account/settings/policy" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `settings.tags.create`

**POST /settings/tags** - Add a document tag (color label used to filter and mark documents). · scope: `account.settings.manage` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `name` | string | yes | min length 1 · max length 40 |
| `color` | enum("slate", "blue", "green", "amber", "red", "purple") | yes | Tag swatch. One of slate, blue, green, amber, red, purple (the 6 design tokens the app renders; hex colors are not accepted). |
| `docTypes` | array of string | yes | Document types this tag applies to. Empty means every type. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/settings/tags" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"name":"example name","color":"slate","docTypes":[]}'
```

#### `settings.update`

**PATCH /settings** - Update the company details printed on documents. Only sent fields change. The company stamp, signature and logo images are managed from the app only, never through this API. · scope: `account.settings.manage` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `orgName` | string | no | Legal/trade name printed on documents. · min length 1 · max length 200 |
| `taxId` | one of several shapes | no | 13-digit Thai tax id, digits only. |
| `branchCode` | string | no | 5-digit branch code, "00000" for head office. · max length 10 |
| `branchName` | one of several shapes | no | - |
| `address` | one of several shapes | no | - |
| `phone` | one of several shapes | no | - |
| `email` | one of several shapes | no | - |
| `website` | one of several shapes | no | - |
| `vatRegistered` | boolean | no | - |
| `vatRateBp` | integer | no | Basis points: 700 = 7%. · min 0 · max 10000 |
| `taxPointBasis` | enum("ON_ISSUE", "ON_PAYMENT") | no | - |

```bash
curl -sS -X PATCH "https://shark.in.th/api/v1/account/settings" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `stock-documents.approve`

**POST /stock-documents/{id}/approve** - Approve a draft goods issue/return: it takes the next document number, moves the stock and posts to the ledger. · scope: `account.product.manage` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `allowNegative` | boolean | no | - |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/stock-documents/123/approve" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `stock-documents.create`

**POST /stock-documents** - Create a goods issue, goods issue return, or cost adjustment document. Goods issue/return post immediately unless asDraft is true. · scope: `account.product.manage` · write · AI tool: `account_issue_goods`

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `type` | enum("GOODS_ISSUE", "GOODS_ISSUE_RETURN", "COST_ADJUSTMENT") | yes | - |
| `issueDate` | string | no | issueDate (Thai calendar day, YYYY-MM-DD). |
| `reason` | one of several shapes | no | - |
| `note` | one of several shapes | no | - |
| `reference` | one of several shapes | no | - |
| `contactId` | one of several shapes | no | - |
| `sourceDocId` | one of several shapes | no | - |
| `allowNegative` | boolean | no | - |
| `asDraft` | boolean | no | - |
| `adjustAccountCode` | one of several shapes | no | - |
| `tags` | array of string | no | - |
| `lines` | array of object | no | Required for GOODS_ISSUE / GOODS_ISSUE_RETURN. |
| `productId` | string | no | Required for COST_ADJUSTMENT. · max length 40 |
| `newCostSatang` | integer | no | Required for COST_ADJUSTMENT. · min 0 |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/stock-documents" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"type":"GOODS_ISSUE"}'
```

#### `units.archive`

**DELETE /units/{id}** - Deactivate a unit of measure. Units still used by an active product cannot be deactivated. · scope: `account.product.manage` · write

Path parameters: `id` (required).

No body fields.

```bash
curl -sS -X DELETE "https://shark.in.th/api/v1/account/units/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)"
```

#### `units.update`

**PATCH /units/{id}** - Rename a unit of measure or change its code/kind. · scope: `account.product.manage` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `name` | string | yes | min length 1 · max length 20 |
| `nameEn` | one of several shapes | no | - |
| `kind` | enum("PRODUCT", "SERVICE") | no | - |
| `code` | one of several shapes | no | - |

```bash
curl -sS -X PATCH "https://shark.in.th/api/v1/account/units/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"name":"example name"}'
```

#### `units.create`

**POST /units** - Create a unit of measure. A matching name or code returns 409/422. · scope: `account.product.manage` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `name` | string | yes | min length 1 · max length 20 |
| `nameEn` | one of several shapes | no | - |
| `kind` | enum("PRODUCT", "SERVICE") | no | - |
| `code` | one of several shapes | no | - |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/units" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"name":"example name"}'
```

#### `webhooks.test`

**POST /webhooks/{id}/test** - Send one test delivery to this endpoint with a fake payload of the given event type, regardless of its subscription list. · scope: `account.settings.manage` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `event` | string | yes | Event type to simulate. Must be a known event type. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/webhooks/123/test" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"event":"example event"}'
```

#### `webhooks.update`

**PATCH /webhooks/{id}** - Change which events an endpoint receives, or pause/resume it. The signing secret never changes here. · scope: `account.settings.manage` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `events` | array of string | no | Replace the subscribed events. Empty array means every event. |
| `active` | boolean | no | - |

```bash
curl -sS -X PATCH "https://shark.in.th/api/v1/account/webhooks/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `webhooks.create`

**POST /webhooks** - Register a new webhook endpoint and get its signing secret. The secret is only ever shown here - store it now. · scope: `account.settings.manage` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `url` | string | yes | Destination URL. Must start with http:// or https://. · max length 500 |
| `events` | array of string | no | Event types to receive. Must each be one of the values in GET /help/glossary's webhook list. Empty means every event. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/webhooks" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"url":"example url"}'
```

#### `wht.issue-cert`

**POST /wht/certs** - Issue the withholding tax certificate (form 50 tawi) for one payment that had tax deducted. The tax was already booked when the payment was recorded, so this only produces the certificate. One payment can only have one. · scope: `account.wht.manage` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `paymentId` | string | yes | Id of the payment to a vendor that had withholding tax deducted. Take it from the payments of the expense document. · min length 1 · max length 40 |
| `whtIncomeType` | enum("SALARY", "COMMISSION", "ROYALTY", "INTEREST", "DIVIDEND", "RENT", "PROFESSIONAL", "CONTRACTOR", "SERVICE", "M40_1", "M40_2", "M40_3", "M40_4", "M40_5", "M40_6", "M40_7", "M40_8") | yes | Type of income under section 40 of the Thai Revenue Code, used on the withholding tax certificate. Readable names: SALARY 40(1), COMMISSION 40(2), ROYALTY 40(3), INTEREST or DIVIDEND 40(4), RENT 40(5), PROFESSIONAL 40(6), CONTRACTOR 40(7), SERVICE 40(8). The raw codes M40_1 to M40_8 are accepted too. |
| `whtRateBp` | one of several shapes | no | Rate in basis points: 300 = 3%. Only needed when the payment itself did not record a rate. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/wht/certs" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"paymentId":"example paymentId","whtIncomeType":"SALARY"}'
```

#### `wht.mark-filed`

**POST /wht/filings** - Mark one month of withholding tax certificates as filed with the Revenue Department, and stamp every certificate in it. The totals are recomputed from the certificates each time, so sending it twice is safe. · scope: `account.wht.manage` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `form` | one of several shapes | yes | Which return the certificates go on: 3 for payments to individuals, 53 for payments to companies. |
| `period` | string | yes | Month being filed, `YYYY-MM`. Certificates are grouped by the day the money was paid. |
| `note` | one of several shapes | no | How it was filed, for example through the e-filing site. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/wht/filings" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"form":"example form","period":"example period"}'
```

### Danger operations

Hard to undo. On top of the write rules they need `confirm: true` and a `reason` of at least 5 characters. An AI agent must ask a human before calling these.

#### `assets.dispose`

**POST /assets/{id}/dispose** - Sell or write off a fixed asset. The journal entry clears the cost and the accumulated depreciation, books the money received and posts the gain or loss against the net book value. An asset can only leave the register once. · scope: `account.asset.dispose` · danger

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `reason` | string | yes | Why the asset is leaving the register. At least 5 characters. Kept in the audit log. · min length 5 · max length 500 |
| `mode` | enum("SELL", "WRITE_OFF") | yes | SELL when the asset was sold and money came in, WRITE_OFF when it is simply taken off the books. WRITE_OFF needs the account.asset.writeoff scope on top of account.asset.dispose. |
| `date` | string | yes | Day of the disposal (Thai calendar day, YYYY-MM-DD). |
| `proceedsSatang` | one of several shapes | no | Money received in satang. SELL only. |
| `financeAccountId` | one of several shapes | no | - |
| `note` | one of several shapes | no | Free note kept with the asset. |
| `confirm` | enum(true) | yes | Must be exactly true. Proves the caller meant to run an operation that is hard to undo. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/assets/123/dispose" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"reason":"reason for the audit log","mode":"SELL","date":"example date","confirm":true}'
```

#### `cheques.void`

**POST /cheques/{id}/void** - Cancel an issued cheque that has not been presented, for example one written with the wrong amount. The ledger effect is reversed and the vendor is owed again. · scope: `account.cheque.void` · danger

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `reason` | string | yes | Why the cheque is being cancelled, at least 5 characters. Kept on the cheque and in the audit log. · min length 5 · max length 500 |
| `confirm` | enum(true) | yes | Must be exactly true. Proves the caller meant to run an operation that is hard to undo. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/cheques/123/void" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"reason":"reason for the audit log","confirm":true}'
```

#### `contacts.merge`

**POST /contacts/merge** - Merge two contacts into one. Every document, ledger line, group and recurring rule of the second contact moves to the first; the second is archived and points to the first. · scope: `account.contact.merge` · danger · AI tool: `account_merge_contacts`

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `keepId` | string | yes | Id of the contact to keep. · min length 1 · max length 40 |
| `mergeId` | string | yes | Id of the contact to merge into the one to keep. It is archived and its documents move over. · min length 1 · max length 40 |
| `reason` | string | yes | Why these two are the same contact, at least 5 characters. · min length 5 · max length 500 |
| `fieldChoices` | object | no | Per field, pick whose value wins: "primary" (default, the one to keep) or "secondary". |
| `confirm` | enum(true) | yes | Must be exactly true. Proves the caller meant to run an operation that is hard to undo. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/contacts/merge" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"keepId":"example keepId","mergeId":"example mergeId","reason":"reason for the audit log","confirm":true}'
```

#### `danger-echo`

**POST /danger-echo** - Danger-class smoke test: requires confirm=true and a reason of at least 5 characters. · scope: `account.doc.void` · danger

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `reason` | string | yes | Why this is being done, at least 5 characters. Stored in the audit log. · min length 5 |
| `confirm` | enum(true) | yes | Must be exactly true. Proves the caller meant to run an operation that is hard to undo. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/danger-echo" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"reason":"reason for the audit log","confirm":true}'
```

#### `documents.refund-deposit`

**POST /documents/{id}/refund-deposit** - Give a paid deposit back to the customer or get it back from the vendor. The deposit document is voided and its ledger entry reversed. · scope: `account.doc.void` · danger

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `reason` | string | yes | Why the deposit is being returned, at least 5 characters. Stored on the document and in the audit log. · min length 5 · max length 500 |
| `confirm` | enum(true) | yes | Must be exactly true. Proves the caller meant to run an operation that is hard to undo. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/documents/123/refund-deposit" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"reason":"reason for the audit log","confirm":true}'
```

#### `documents.void`

**POST /documents/{id}/void** - Void an issued document. The ledger entry is reversed with a new journal entry; nothing is deleted. · scope: `account.doc.void` · danger · AI tool: `account_void_document`

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `reason` | string | yes | Why this document is being voided, at least 5 characters. Stored on the document and in the audit log. · min length 5 · max length 500 |
| `confirm` | enum(true) | yes | Must be exactly true. Proves the caller meant to run an operation that is hard to undo. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/documents/123/void" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"reason":"reason for the audit log","confirm":true}'
```

#### `journal.reverse`

**POST /journal/{id}/reverse** - Reverse a posted journal entry by writing a mirror entry with the sides swapped. The original entry stays in the books and is marked REVERSED. If its own period is already closed the reversal is dated in the next open period. · scope: `account.journal.adjust` · danger

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `reason` | string | yes | Why the entry is being reversed. At least 5 characters. Kept in the audit log. · min length 5 · max length 500 |
| `confirm` | enum(true) | yes | Must be exactly true. Proves the caller meant to run an operation that is hard to undo. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/journal/123/reverse" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"reason":"reason for the audit log","confirm":true}'
```

#### `links.disconnect`

**DELETE /links/{kind}** - Unlink a system. Nothing already posted is undone, but new activity from it stops posting to this book. · scope: `account.settings.manage` · danger

Path parameters: `kind` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `reason` | string | yes | Why this system is being unlinked. At least 5 characters. Kept in the audit log. · min length 5 · max length 500 |
| `confirm` | enum(true) | yes | Must be exactly true. Proves the caller meant to run an operation that is hard to undo. |

```bash
curl -sS -X DELETE "https://shark.in.th/api/v1/account/links/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"reason":"reason for the audit log","confirm":true}'
```

#### `payments.void`

**POST /payments/{paymentId}/void** - Reverse one recorded payment. A reversing journal entry is written; nothing is deleted and the document goes back to awaiting payment. · scope: `account.payment.void` · danger · AI tool: `account_void_payment`

Path parameters: `paymentId` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `documentId` | string | yes | Id of the document this payment belongs to. · min length 1 · max length 40 |
| `reason` | string | yes | Why the payment is being reversed, at least 5 characters. Stored on the reversing journal entry and in the audit log. · min length 5 · max length 500 |
| `confirm` | enum(true) | yes | Must be exactly true. Proves the caller meant to run an operation that is hard to undo. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/payments/123/void" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"documentId":"example documentId","reason":"reason for the audit log","confirm":true}'
```

#### `payments.void-group`

**POST /payments/group/{batchKey}/void** - Reverse every payment created by one group transfer. Each child document gets a reversing journal entry and goes back to awaiting payment. · scope: `account.payment.void` · danger

Path parameters: `batchKey` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `groupId` | string | yes | Id of the billing note or combined payment the batch belongs to. · min length 1 · max length 40 |
| `reason` | string | yes | Why the whole transfer is being reversed, at least 5 characters. Stored on every reversing journal entry. · min length 5 · max length 500 |
| `confirm` | enum(true) | yes | Must be exactly true. Proves the caller meant to run an operation that is hard to undo. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/payments/group/123/void" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"groupId":"example groupId","reason":"reason for the audit log","confirm":true}'
```

#### `periods.reopen`

**POST /periods/{key}/reopen** - Reopen a closed period so entries can be posted into it again. Every reopen is stamped in the period log with the reason, because auditors ask about periods that were opened after they were closed. · scope: `account.period.reopen` · danger · AI tool: `account_reopen_period`

Path parameters: `key` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `reason` | string | yes | Why the period has to be reopened. At least 5 characters. Kept in the audit log. · min length 5 · max length 500 |
| `confirm` | enum(true) | yes | Must be exactly true. Proves the caller meant to run an operation that is hard to undo. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/periods/123/reopen" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"reason":"reason for the audit log","confirm":true}'
```

#### `periods.vat-unfiled`

**DELETE /periods/{key}/vat-filed** - Undo the filed mark of one month, for example when the wrong month was filed. The period goes back to not filed and the close checklist fails on it again. · scope: `account.period.reopen` · danger

Path parameters: `key` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `reason` | string | yes | Why the filed mark is being removed. At least 5 characters. Kept in the audit log. · min length 5 · max length 500 |
| `confirm` | enum(true) | yes | Must be exactly true. Proves the caller meant to run an operation that is hard to undo. |

```bash
curl -sS -X DELETE "https://shark.in.th/api/v1/account/periods/123/vat-filed" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"reason":"reason for the audit log","confirm":true}'
```

#### `settings.permissions.revoke`

**DELETE /settings/permissions/members/{membershipId}** - Remove all accounting permissions from one staff member. The person stays in the shop and keeps access to other systems. · scope: `account.settings.manage` · danger

Path parameters: `membershipId` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `reason` | string | yes | Why access is being revoked. At least 5 characters. Kept in the audit log. · min length 5 · max length 500 |
| `confirm` | enum(true) | yes | Must be exactly true. Proves the caller meant to run an operation that is hard to undo. |

```bash
curl -sS -X DELETE "https://shark.in.th/api/v1/account/settings/permissions/members/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"reason":"reason for the audit log","confirm":true}'
```

#### `webhooks.delete`

**DELETE /webhooks/{id}** - Remove a webhook endpoint. Its delivery history is removed with it. · scope: `account.settings.manage` · danger

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `reason` | string | yes | Why this endpoint is being removed. At least 5 characters. · min length 5 · max length 500 |
| `confirm` | enum(true) | yes | Must be exactly true. Proves the caller meant to run an operation that is hard to undo. |

```bash
curl -sS -X DELETE "https://shark.in.th/api/v1/account/webhooks/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"reason":"reason for the audit log","confirm":true}'
```

#### `wht.unmark-filed`

**DELETE /wht/filings/{form}/{period}** - Undo the filed mark of one month, for example when the wrong month was filed. The certificates in it go back to unfiled. · scope: `account.wht.unmark` · danger

Path parameters: `form`, `period` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `reason` | string | yes | Why the filed mark is being removed, at least 5 characters. Kept in the audit log. · min length 5 · max length 500 |
| `confirm` | enum(true) | yes | Must be exactly true. Proves the caller meant to run an operation that is hard to undo. |

```bash
curl -sS -X DELETE "https://shark.in.th/api/v1/account/wht/filings/123/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"reason":"reason for the audit log","confirm":true}'
```

## AI tools

36 of these operations are also exposed to the SHARK assistant as tools of the `account` skill.
Read tools run straight away. Write and danger tools never run by themselves: they create a proposal that the shop owner confirms in the app, and only then the very same operation below is executed, with the confirming person's permissions and their name in the audit log. Danger tools need a second confirmation.

`account_report` covers all seven reporting operations through its `kind` argument (`trial-balance`, `profit-loss`, `balance-sheet`, `cash-flow`, `vat-pp30`, `aging`, `general-ledger`).

| Tool | Operation | Class | Scope |
| --- | --- | --- | --- |
| `account_approve_document` | `documents.approve` | write | `account.doc.approve` |
| `account_assets` | `assets.list` | read | `account.asset.manage` |
| `account_chart_of_accounts` | `chart.list` | read | `account.journal.view` |
| `account_close_period` | `periods.close` | write | `account.period.close` |
| `account_convert_document` | `documents.convert` | write | `account.doc.create` |
| `account_create_contact` | `contacts.create` | write | `account.contact.manage` |
| `account_create_document` | `documents.create` | write | `account.doc.create` |
| `account_create_payment_link` | `documents.public-link` | write | `account.doc.public_link` |
| `account_create_product` | `products.create` | write | `account.product.manage` |
| `account_create_recurring` | `recurring.create` | write | `account.doc.create` |
| `account_dashboard` | `dashboard.get` | read | `account.doc.view` |
| `account_email_document` | `documents.remind` | write | `account.doc.view` |
| `account_finance_balances` | `finance-accounts.list` | read | `account.finance.manage` |
| `account_get_contact` | `contacts.get` | read | `account.doc.view` |
| `account_get_document` | `documents.get` | read | `account.doc.view` |
| `account_issue_document` | `documents.issue` | write | `account.doc.issue` |
| `account_issue_goods` | `stock-documents.create` | write | `account.product.manage` |
| `account_list_documents` | `documents.list` | read | `account.doc.view` |
| `account_list_journal` | `journal.list` | read | `account.journal.view` |
| `account_merge_contacts` | `contacts.merge` | danger | `account.contact.merge` |
| `account_parse_quick_create` | `documents.parse` | read | `account.doc.view` |
| `account_post_journal` | `journal.create` | write | `account.journal.adjust` |
| `account_read_bill_image` | `inbox.read` | write | `account.document.manage` |
| `account_record_payment` | `payments.record` | write | `account.payment.record` |
| `account_reopen_period` | `periods.reopen` | danger | `account.period.reopen` |
| `account_report` | `reports.profit-loss` | read | `account.report.view` |
| `account_run_depreciation` | `assets.depreciation-run` | write | `account.asset.manage` |
| `account_search_contacts` | `contacts.list` | read | `account.doc.view` |
| `account_search_products` | `products.list` | read | `account.doc.view` |
| `account_settings` | `settings.get` | read | `account.doc.view` |
| `account_transfer_funds` | `finance.transfer` | write | `account.finance.manage` |
| `account_update_contact` | `contacts.update` | write | `account.contact.manage` |
| `account_upload_file` | `documents.add-attachment` | write | `account.doc.create` |
| `account_void_document` | `documents.void` | danger | `account.doc.void` |
| `account_void_payment` | `payments.void` | danger | `account.payment.void` |
| `account_wht_summary` | `wht.list` | read | `account.tax.view` |

## Webhooks

Everything above is you calling SHARK. Webhooks are SHARK calling you: the shop owner adds an endpoint URL in the accounting book settings (Connections > External apps / API), ticks the events it wants, and gets a signing secret shown once.

Delivery is at least once and ordered by the moment the change was committed. Events are written inside the same database transaction as the change itself, so an event exists only if the change really happened, and a change never happens without its event. A delivery that does not answer 2xx within 5 seconds is retried up to 5 times with a growing delay, so **make your handler idempotent**: key on the ids in the payload.

### Request format

`POST <your url>` with `Content-Type: application/json` and these headers:

| Header | Value |
| --- | --- |
| `X-Shark-Event` | The event type, for example `account.document.issued`. |
| `X-Shark-Signature` | `HMAC-SHA256(secret, raw request body)` as lowercase hex. |

The body is always the same three fields:

```json
{
  "type": "account.document.issued",
  "payload": {
    "documentId": "cmf1doc0001"
  },
  "sentAt": "2026-09-05T09:15:00.000Z"
}
```

`payload` never contains your shop id or accounting book id: the endpoint already belongs to one shop. Money fields are integers of satang and end in `Satang`, calendar dates are `YYYY-MM-DD` (UTC+7) and instants are ISO-8601 UTC ending in `At` - the same conventions as the REST API.

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
| `account.document.approved` | A purchase order was approved. |
| `account.payment.recorded` | A receipt or a vendor payment was recorded against a document. |
| `account.invoice.paid` | An invoice reached fully paid. |
| `account.period.closed` | An accounting period was closed. |
| `account.document.issued` | A document left draft and got its real document number (sales, purchase, purchase order sent for approval, approved stock issue). |
| `account.document.voided` | A document was cancelled (draft) or voided (already posted, journal reversed). |
| `account.quotation.responded` | A quotation was accepted or rejected. The idempotency key carries the answer, so a later change of mind is delivered too. |
| `account.payment.voided` | A recorded payment was voided (journal reversed, document goes back to unpaid or partial). |
| `account.payment_request.paid` | A PromptPay payment link was paid - either confirmed by the provider webhook or by a staff member for a static QR. |
| `account.payment_request.expired` | A payment link passed its expiry date and was closed by the hourly job. |
| `account.contact.created` | A contact (customer or supplier) was created. |
| `account.contact.updated` | A contact was edited. The idempotency key includes the row `updatedAt` in milliseconds, so every edit is its own delivery. |
| `account.contact.merged` | Two duplicate contacts were merged. Stop using `mergedId`: every document now points at `keepId`. |
| `account.product.created` | A product or service was created. |
| `account.product.updated` | A product or service was edited. Same `updatedAt` rule as `account.contact.updated`. |
| `account.cheque.changed` | A cheque's status changed: deposited, cleared, bounced or voided. Fires once per transition (the idempotency key ends in the status), so the same cheque can appear several times as it moves through its life. |
| `account.reconcile.confirmed` | A month of bank reconciliation for one channel was confirmed. |
| `account.period.reopened` | A closed accounting period was reopened. |
| `account.asset.depreciated` | Monthly depreciation was posted for one fixed asset. |
| `account.asset.disposed` | A fixed asset was sold or written off. |
| `account.recurring.ran` | A recurring document rule produced its document for the period (draft or auto-issued - check the document itself, or `account.document.issued`, for the outcome). |

#### `account.document.approved`

A purchase order was approved.

```json
{
  "type": "account.document.approved",
  "payload": {
    "documentId": "cmf1doc0002",
    "docType": "PURCHASE_ORDER",
    "approvedById": "cmf1usr0001"
  },
  "sentAt": "2026-09-05T09:15:00.000Z"
}
```

#### `account.payment.recorded`

A receipt or a vendor payment was recorded against a document.

```json
{
  "type": "account.payment.recorded",
  "payload": {
    "documentId": "cmf1doc0001",
    "paymentId": "cmf1pay0001",
    "amountSatang": 107000,
    "docType": "INVOICE"
  },
  "sentAt": "2026-09-05T09:15:00.000Z"
}
```

#### `account.invoice.paid`

An invoice reached fully paid.

```json
{
  "type": "account.invoice.paid",
  "payload": {
    "documentId": "cmf1doc0001",
    "docNo": "IV-202609-0007",
    "grandTotalSatang": 107000
  },
  "sentAt": "2026-09-05T09:15:00.000Z"
}
```

#### `account.period.closed`

An accounting period was closed.

```json
{
  "type": "account.period.closed",
  "payload": {
    "periodKey": "2026-08",
    "closedById": "cmf1usr0001"
  },
  "sentAt": "2026-09-05T09:15:00.000Z"
}
```

#### `account.document.issued`

A document left draft and got its real document number (sales, purchase, purchase order sent for approval, approved stock issue).

```json
{
  "type": "account.document.issued",
  "payload": {
    "documentId": "cmf1doc0001",
    "type": "INVOICE",
    "docNo": "IV-202609-0007",
    "status": "AWAITING_PAYMENT",
    "contactId": "cmf1con0001",
    "grandTotalSatang": 107000,
    "issueDate": "2026-09-05",
    "source": "API"
  },
  "sentAt": "2026-09-05T09:15:00.000Z"
}
```

#### `account.document.voided`

A document was cancelled (draft) or voided (already posted, journal reversed).

```json
{
  "type": "account.document.voided",
  "payload": {
    "documentId": "cmf1doc0001",
    "type": "INVOICE",
    "docNo": "IV-202609-0007",
    "reason": "customer cancelled the order"
  },
  "sentAt": "2026-09-05T09:15:00.000Z"
}
```

#### `account.quotation.responded`

A quotation was accepted or rejected. The idempotency key carries the answer, so a later change of mind is delivered too.

```json
{
  "type": "account.quotation.responded",
  "payload": {
    "documentId": "cmf1doc0003",
    "docNo": "QT-202609-0004",
    "accepted": true
  },
  "sentAt": "2026-09-05T09:15:00.000Z"
}
```

#### `account.payment.voided`

A recorded payment was voided (journal reversed, document goes back to unpaid or partial).

```json
{
  "type": "account.payment.voided",
  "payload": {
    "paymentId": "cmf1pay0001",
    "documentId": "cmf1doc0001",
    "docNo": "IV-202609-0007",
    "amountSatang": 107000,
    "reason": "wrong bank account"
  },
  "sentAt": "2026-09-05T09:15:00.000Z"
}
```

#### `account.payment_request.paid`

A PromptPay payment link was paid - either confirmed by the provider webhook or by a staff member for a static QR.

```json
{
  "type": "account.payment_request.paid",
  "payload": {
    "requestId": "cmf1req0001",
    "documentId": "cmf1doc0001",
    "docNo": "IV-202609-0007",
    "amountSatang": 53500,
    "provider": "PROMPTPAY_STATIC",
    "paymentId": "cmf1pay0002"
  },
  "sentAt": "2026-09-05T09:15:00.000Z"
}
```

#### `account.payment_request.expired`

A payment link passed its expiry date and was closed by the hourly job.

```json
{
  "type": "account.payment_request.expired",
  "payload": {
    "requestId": "cmf1req0002",
    "documentId": "cmf1doc0004",
    "docNo": "IV-202609-0008",
    "amountSatang": 53500
  },
  "sentAt": "2026-09-05T09:15:00.000Z"
}
```

#### `account.contact.created`

A contact (customer or supplier) was created.

```json
{
  "type": "account.contact.created",
  "payload": {
    "contactId": "cmf1con0001",
    "code": "C00007",
    "name": "Siam Dive Center Co., Ltd.",
    "kind": "CUSTOMER",
    "taxId": "0105561000007",
    "phone": "0811111111",
    "email": "billing@example.com"
  },
  "sentAt": "2026-09-05T09:15:00.000Z"
}
```

#### `account.contact.updated`

A contact was edited. The idempotency key includes the row `updatedAt` in milliseconds, so every edit is its own delivery.

```json
{
  "type": "account.contact.updated",
  "payload": {
    "contactId": "cmf1con0001",
    "code": "C00007",
    "name": "Siam Dive Center Co., Ltd.",
    "kind": "CUSTOMER",
    "taxId": "0105561000007",
    "phone": "0811111111",
    "email": "accounts@example.com"
  },
  "sentAt": "2026-09-05T09:15:00.000Z"
}
```

#### `account.contact.merged`

Two duplicate contacts were merged. Stop using `mergedId`: every document now points at `keepId`.

```json
{
  "type": "account.contact.merged",
  "payload": {
    "keepId": "cmf1con0001",
    "mergedId": "cmf1con0002",
    "moved": {
      "documents": 3,
      "journalLines": 6,
      "groups": 1,
      "recurringRules": 0
    }
  },
  "sentAt": "2026-09-05T09:15:00.000Z"
}
```

#### `account.product.created`

A product or service was created.

```json
{
  "type": "account.product.created",
  "payload": {
    "productId": "cmf1prd0001",
    "code": "P00024",
    "sku": "DIVE-FIN-L",
    "name": "Fins (L)",
    "type": "GOODS",
    "salePriceSatang": 250000
  },
  "sentAt": "2026-09-05T09:15:00.000Z"
}
```

#### `account.product.updated`

A product or service was edited. Same `updatedAt` rule as `account.contact.updated`.

```json
{
  "type": "account.product.updated",
  "payload": {
    "productId": "cmf1prd0001",
    "code": "P00024",
    "sku": "DIVE-FIN-L",
    "name": "Fins (L)",
    "type": "GOODS",
    "salePriceSatang": 270000
  },
  "sentAt": "2026-09-05T09:15:00.000Z"
}
```

#### `account.cheque.changed`

A cheque's status changed: deposited, cleared, bounced or voided. Fires once per transition (the idempotency key ends in the status), so the same cheque can appear several times as it moves through its life.

```json
{
  "type": "account.cheque.changed",
  "payload": {
    "chequeId": "cmf1chq0001",
    "direction": "IN",
    "chequeNo": "1234567",
    "status": "CLEARED",
    "amountSatang": 500000
  },
  "sentAt": "2026-09-05T09:15:00.000Z"
}
```

#### `account.reconcile.confirmed`

A month of bank reconciliation for one channel was confirmed.

```json
{
  "type": "account.reconcile.confirmed",
  "payload": {
    "financeId": "cmf1fin0001",
    "periodKey": "2026-08",
    "matched": 42,
    "statementBalanceSatang": 1250000
  },
  "sentAt": "2026-09-05T09:15:00.000Z"
}
```

#### `account.period.reopened`

A closed accounting period was reopened.

```json
{
  "type": "account.period.reopened",
  "payload": {
    "periodKey": "2026-08",
    "reason": "correcting a posting error found by the auditor",
    "reopenedById": "cmf1usr0001"
  },
  "sentAt": "2026-09-05T09:15:00.000Z"
}
```

#### `account.asset.depreciated`

Monthly depreciation was posted for one fixed asset.

```json
{
  "type": "account.asset.depreciated",
  "payload": {
    "assetId": "cmf1ast0001",
    "code": "FA-0007",
    "periodKey": "2026-08",
    "amountSatang": 41700
  },
  "sentAt": "2026-09-05T09:15:00.000Z"
}
```

#### `account.asset.disposed`

A fixed asset was sold or written off.

```json
{
  "type": "account.asset.disposed",
  "payload": {
    "assetId": "cmf1ast0001",
    "code": "FA-0007",
    "mode": "SELL",
    "proceedsSatang": 300000,
    "gainLossSatang": -50000,
    "disposedAt": "2026-09-05"
  },
  "sentAt": "2026-09-05T09:15:00.000Z"
}
```

#### `account.recurring.ran`

A recurring document rule produced its document for the period (draft or auto-issued - check the document itself, or `account.document.issued`, for the outcome).

```json
{
  "type": "account.recurring.ran",
  "payload": {
    "ruleId": "cmf1rec0001",
    "documentId": "cmf1doc0005",
    "docType": "INVOICE",
    "runDate": "2026-09-01",
    "issued": true
  },
  "sentAt": "2026-09-05T09:15:00.000Z"
}
```

## Glossary (Thai <-> English accounting terms)

Field names and codes in this API are English. This table maps them to the Thai words a shop owner or accountant uses.

| ไทย | English | In the API |
| --- | --- | --- |
| สมุดบัญชี | accounting book (AppSystem of type ACCOUNT) | `X-Shark-System` / `systemId` |
| ใบเสนอราคา | quotation | `QUOTATION` |
| ใบแจ้งหนี้ | invoice | `INVOICE` |
| ใบเสร็จรับเงิน | receipt | `RECEIPT` |
| ใบกำกับภาษี | tax invoice | `TAX_INVOICE` |
| ใบลดหนี้ / ใบเพิ่มหนี้ | credit note / debit note | `CREDIT_NOTE` / `DEBIT_NOTE` |
| ใบสั่งซื้อ | purchase order | `PURCHASE_ORDER` |
| มัดจำ | deposit | `depositSatang` |
| ยกเลิกเอกสาร | void a document | danger operation |
| ผู้ติดต่อ (ลูกค้า/ผู้ขาย) | contact (customer / supplier) | `contactId` |
| ผังบัญชี | chart of accounts | `chart` |
| สมุดรายวัน | journal | `journal` |
| บัญชีแยกประเภท | general ledger | `general-ledger` |
| งวดบัญชี / ปิดงวด | accounting period / period close | `period_locked` |
| ภาษีมูลค่าเพิ่ม | VAT | `vatSatang` |
| ภาษีหัก ณ ที่จ่าย | withholding tax (WHT) | `whtSatang` |
| กระทบยอด | reconciliation | `reconcile` |
| เช็ค | cheque | `cheque` |
| สินทรัพย์ถาวร / ค่าเสื่อม | fixed asset / depreciation | `asset` |
| สตางค์ | satang (1/100 of a baht) | every `*Satang` field |

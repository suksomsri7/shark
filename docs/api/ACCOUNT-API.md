# SHARK Accounting API

Machine readable contract: `/api/v1/account/openapi.json` (OpenAPI 3.1.0, no API key needed).
Base URL: `https://shark.in.th/api/v1/account` - contract version 1.0.0 - 95 operations.
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

**GET /assets** - Fixed asset register with cost, monthly depreciation, accumulated depreciation and net book value. · scope: `account.asset.manage` · read

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

**GET /chart** - The whole chart of accounts: a flat list, the 3-level tree and balances per account type. · scope: `account.journal.view` · read

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

**GET /contacts/{id}** - One contact profile: header, info, KPI, latest documents, custom groups and links to member/CRM/chat. · scope: `account.doc.view` · read

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

**GET /contacts** - List contacts (customers and vendors) with the sidebar filters, search and paging. · scope: `account.doc.view` · read

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

**GET /dashboard** - Everything the accounting home screen shows in one call: KPI, receivable and payable, cash, categories, pending work and recent documents. · scope: `account.doc.view` · read

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

#### `documents.get`

**GET /documents/{id}** - One document in full: lines, payments, related documents, timeline, journal entries and attachments. · scope: `account.doc.view` · read

Path parameters: `id` (required).

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/documents/123" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `documents.parse`

**POST /documents/parse** - Turn one line of free text into a document draft intent: type, contact candidates and amount. Reads only. · scope: `account.doc.view` · read

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

**GET /documents** - List documents of any type (sales and purchase side) with filters, paging and tab counters. · scope: `account.doc.view` · read

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

**GET /finance-accounts** - Every cash/bank/e-wallet/petty-cash channel with its balance, grouped by kind. · scope: `account.finance.manage` · read

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

**GET /journal** - Journal entries with paging, plus entry counts per book and debit/credit totals for the filtered range. · scope: `account.journal.view` · read

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

**GET /products** - List goods, services and bundles with type/sub-tab filters, search, category and paging. · scope: `account.doc.view` · read

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

**GET /reports/profit-loss** - Profit and loss: revenue, cost of goods sold and expenses, with gross and net profit. Supports CSV. · scope: `account.report.view` · read

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

#### `settings.policy`

**GET /settings/policy** - Accounting policy: fiscal year, VAT timing, withholding tax defaults, date lock, duplicate rules and report emails. · scope: `account.settings.manage` · read

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/settings/policy" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `settings.get`

**GET /settings** - Company details printed on documents: legal name, tax id, branch, address, VAT registration and fiscal year. · scope: `account.doc.view` · read

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

**GET /wht** - Withholding tax certificates (50 Tawi / WTI), either direction, with paging and totals. · scope: `account.tax.view` · read

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

#### `documents.approve`

**POST /documents/{id}/approve** - Approve a purchase order that is waiting for approval. · scope: `account.doc.approve` · write

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

**POST /documents/{id}/attachments** - Attach a file that is already hosted somewhere to a document, by URL. · scope: `account.doc.create` · write

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

**POST /documents/{id}/convert** - Create the follow up document of an issued one, for example quotation to invoice or invoice to receipt. The new document starts as a draft. · scope: `account.doc.create` · write

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

**POST /documents/{id}/issue** - Issue a draft: it takes the next document number and posts to the ledger. A purchase order is sent for approval instead. · scope: `account.doc.issue` · write

Path parameters: `id` (required).

No body fields.

```bash
curl -sS -X POST "https://shark.in.th/api/v1/account/documents/123/issue" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)"
```

#### `documents.public-link`

**POST /documents/{id}/public-link** - Create (or reuse) the public link where the customer can see the document and ask for a tax invoice. · scope: `account.doc.public_link` · write

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

**POST /documents/{id}/remind** - Email the contact a payment reminder for this document, with a link to it. · scope: `account.doc.view` · write

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

**POST /documents** - Create a document as a draft: quotation, invoice, deposit, credit or debit note, expense, purchase, purchase order, or a grouped billing note. · scope: `account.doc.create` · write

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

**POST /recurring** - Create a rule that produces the same document every week, month, quarter or year. · scope: `account.doc.create` · write

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

### Danger operations

Hard to undo. On top of the write rules they need `confirm: true` and a `reason` of at least 5 characters. An AI agent must ask a human before calling these.

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

#### `documents.void`

**POST /documents/{id}/void** - Void an issued document. The ledger entry is reversed with a new journal entry; nothing is deleted. · scope: `account.doc.void` · danger

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

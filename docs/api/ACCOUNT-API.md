# SHARK Accounting API

Machine readable contract: `/api/v1/account/openapi.json` (OpenAPI 3.1.0, no API key needed).
Base URL: `https://shark.in.th/api/v1/account` - contract version 1.0.0 - 4 operations.
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
- **Pagination.** Lists return `page.nextCursor`. Pass it back as `cursor` for the next page; an empty or absent `nextCursor` means the end. Do not build page numbers.
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

## Operations

### Read operations

Safe to call at any time. No `Idempotency-Key`, nothing is written, nothing is audited.

#### `echo-by-id`

**GET /echo/{id}** - Echo back the id captured from the path (used to verify path parameters). · scope: `account.doc.view` · read

Path parameters: `id` (required).

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/echo/123" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `ping`

**GET /ping** - Check that the API key works and see which accounting book it is bound to. · scope: `account.doc.view` · read

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/account/ping" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

### Write operations

Change data. `Idempotency-Key` is required and every success is written to the audit log with the key name.

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

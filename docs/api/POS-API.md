# SHARK POS API

Machine readable contract: `/api/v1/pos/openapi.json` (OpenAPI 3.1.0, no API key needed).
Base URL: `https://shark.in.th/api/v1/pos` - contract version 1.0.0 - 49 operations.
Generated from the operation registry by `scripts/gen-pos-api-docs.mts`. Do not edit by hand: run the script.

## Who this is for

- **AI agents** running a shop's point of sale on behalf of its owner: selling, finding bills, refunding, taking platform orders, marking items sold out, pulling reports. Read the Conventions and Error codes first: every failure has a stable `code` to branch on, and `message_th` is already worded for a Thai shop owner.
- **Developers** wiring another system into the POS (a self-order kiosk, a delivery tablet bridge, a booking app, a nightly report job). Everything here is generated from the same registry the live API dispatches from.

## Authentication and scopes

Send `Authorization: Bearer <api key>`. Keys are created by the shop owner in POS > Settings > SHARK connections > API keys; the raw key is shown once. A key is bound to one POS system.

Scopes are the same permission keys the staff roles use, so a key can never do more than a person could. The key acts as a staff member of its own (seller id = key id, role STAFF): bills it sells are attributed to the key, not to the person who created it.

| Bundle | What it can do | Scopes |
| --- | --- | --- |
| `pos-read` | Read the POS system: bills and receipts, products, sales channels, online orders and every sales report. Writes nothing. | `pos.sale.read` `pos.report.view` |
| `pos-operate` | Everything in pos-read plus the counter work: sell at catalog prices, accept and progress online orders, mark items sold out, and read shifts (X/Z) and registered devices. No voids, refunds, custom prices or catalog changes. Reading shifts is not a manager approval: when the shop wants a manager to confirm PromptPay and card payments, API keys take CASH, TRANSFER and PLATFORM only. | `pos.sale.read` `pos.report.view` `pos.sale.create` `pos.order.accept` `pos.shift.manage` `pos.device.manage` |
| `pos-admin` | Everything in pos-operate plus voiding and refunding bills, custom and open prices, rejecting and cancelling orders, managing products, prices and sales channels, issuing full tax invoices and the anomaly report. Settings, staff PINs and shifts still need the app. | `pos.sale.read` `pos.report.view` `pos.sale.create` `pos.order.accept` `pos.shift.manage` `pos.device.manage` `pos.sale.void` `pos.sale.refund` `pos.sale.priceOverride` `pos.order.reject` `pos.product.manage` `pos.product.setPrice` `pos.channel.manage` `pos.taxinvoice.issue` `pos.report.anomaly` `pos.offline.sync` |

A key may be limited to some branches with the pseudo-scope `pos.filter.unit:<unitId>` (one per branch). Branches outside the list answer 404 `not_found`, and reports without `unitId` only cover the allowed branches.

Not available through the API on purpose: staff PINs, manager PINs and deciding approval requests (a void or refund over the shop's approval rule waits for a manager in the app), opening and closing shifts, held bills, table service, deposits, gift cards and store credit as tenders, member point burning and coupons, the customer display, and device registration.

## Conventions

These are the rules of the module, copied verbatim from the contract description in `/api/v1/pos/openapi.json`:

REST API for the SHARK point of sale (POS). One API key works inside one POS system (AppSystem of type POS) and its branches (business units). It sells, refunds and voids bills exactly like the register screen does, takes and progresses online orders, manages the catalog and reads every sales report.

Conventions that apply to every operation:
1. Authentication is `Authorization: Bearer <api key>`. The key carries its own scopes (the POS permission keys, e.g. `pos.sale.create`); an operation returns 403 `scope_missing` when the key lacks the scope listed as `x-shark-scope` (the missing scope is in `hint`). Bundles: `pos-read`, `pos-operate`, `pos-admin`.
2. `X-Shark-System` selects the POS system and is only needed when the key is not bound to one; if the key is bound and the header disagrees, the call fails with 403 `system_mismatch`.
3. Branches: every list and create operation takes `unitId` (query string on GET, body otherwise). List them with `GET /units`. On operations with an `{id}` in the path `unitId` is optional - the record's own branch is used, and a different branch answers 404. A branch of another POS system or another shop answers 404 `not_found`, never 403. A key may be limited to some branches by the pseudo-scope `pos.filter.unit:<unitId>`.
4. Money is an integer number of satang (1 baht = 100 satang) in every field ending in `Satang`. Prices include VAT the way the shop is set up; VAT is computed per bill (rounded half up), never per line.
5. Selling: price the cart with `POST /sales/quote`, show `grandTotalSatang` to the customer, then `POST /sales` with the same lines, the payments and `expectedGrandTotalSatang`. Payments must add up to the bill total exactly (422 `validation` otherwise). If prices changed in between the sale is refused with 409 `state_conflict` and nothing is written; quote again. Payment methods: CASH, TRANSFER, PROMPTPAY, CARD and PLATFORM (platform channels only). Gift cards, store credit, deposits, member points and coupons are not available through the API. When the shop requires a manager to confirm PROMPTPAY and CARD payments (setting manualConfirmRequiresManager), the API takes only CASH, TRANSFER and PLATFORM: PROMPTPAY and CARD answer 403 `forbidden` with nothing written, until payment intents come to the API. A cart of custom lines only (`name` + `unitPriceSatang`, no `productId`) is checked as is: payments must equal the sum of qty x unitPriceSatang, so in a shop that adds a service charge it is refused with 422 `validation`; add a catalog line (`productId`) and quote the cart instead.
6. Every write (POST, PATCH, PUT, DELETE) requires an `Idempotency-Key` header, except `POST /sales/quote` which writes nothing. Retrying with the same key and the same body replays the stored response with header `Idempotent-Replayed: true`; the same key with a different body fails with 409 `idempotency_conflict`. The POS also remembers the key per API key after the 24 hour replay window, so a late retry of a sale still returns the same bill instead of selling twice.
7. Operations marked `x-shark-kind: danger` are hard to undo (void a bill, refund, archive a product, cancel an order). They additionally require `confirm: true` (a real boolean) and a `reason` of at least 5 characters in the body; the reason is stored in the audit log. An agent must ask a human before calling them. A void or refund that falls under the shop's approval rule is not done: it answers 409 `state_conflict` with the approval request id in `hint`, and the request waits for a manager in the app. Retrying with the same key replays that answer; do not retry with a new key.
8. Success is `{ data, page?, requestId }`. For reads, `data` is the POS reader's answer itself (for example `GET /sales/{id}` answers the bill). Failure is `{ error: { code, message_th, message_en, hint?, details? }, requestId }` - branch on `error.code`; `message_th` is already worded for a Thai shop owner. `requestId` is also returned in the `X-Request-Id` header; quote it when reporting a problem.
9. Dates: report ranges are Thai business dates `YYYY-MM-DD` (`from`, `to`, inclusive, at most 92 days; the shop's day cut-off applies). Timestamps are ISO-8601 strings in UTC.
10. Paging: `GET /sales` pages with `page` and `pageSize` (10, 20 or 50) and answers `page` next to `data`; `GET /products` pages with `pageSize` and `cursor` (send `nextCursor` back). `GET /shifts` is not paged: it answers the newest 50 shifts of the branch (`limit` up to 200) and has no status filter - keep the rows with `status: OPEN` to find the open shift, or ask `GET /shifts/current` with the register's `deviceId`. `GET /orders` answers the orders since the start of the Thai business day (`since` reaches back at most 7 days). Other lists return the whole set.
11. Rate limits are per key and per class: 300 reads, 60 writes and 30 reports per minute (namespace pos, separate from other SHARK modules). A 429 response carries `Retry-After`; successful responses carry `X-RateLimit-Limit` and `X-RateLimit-Remaining`.
12. Reports render CSV with `Accept: text/csv`: `text/csv; charset=utf-8` with a UTF-8 BOM and `Content-Disposition: attachment`, the same file as the export button of the reports screen.
13. Outgoing webhooks. The shop can subscribe an endpoint to these POS events: `pos.sale.paid`, `pos.sale.voided`, `pos.shift.opened`, `pos.shift.closed`, `pos.stockCount.confirmed`, `pos.sale.refunded`, `pos.payment.intent_paid`, `pos.sale.taxInvoiceIssued`, `pos.order.received`, `pos.order.accepted`, `pos.order.rejected`, `pos.order.ready`, `pos.order.completed`, `pos.order.cancelled`, `pos.product.availability`. Each delivery is `POST` with `X-Shark-Event`, a body of `{ id, type, payload, sentAt }` and header `X-Shark-Signature` = HMAC-SHA256 of the raw body with the endpoint secret, lowercase hex. Delivery is at least once, so handlers must be idempotent (`id` stays the same on every retry).
14. Bills sold through the API are bills of the POS: they carry `sourceModule: "API"` and the key id as seller, follow the shop's shift rule for sales from other sources (or the OPEN shift given as `shiftId`), and appear in every report. Cash taken for an order (`POST /orders/{id}/pay`) always lands in a shift: the branch must have exactly one open shift, otherwise 409 `state_conflict` and nothing is written.

### Selling, step by step

1. `GET /units` - pick the branch (`unitId`).
2. `GET /products?unitId=...` or `GET /products/lookup?unitId=...&barcode=...` - find the products (`productId`, `priceSatang`); `GET /products/{id}/options` for options.
3. `POST /sales/quote` with `{ unitId, lines }` - the exact total (`grandTotalSatang`), VAT and lines the register would charge. Nothing is written.
4. `POST /sales` with `{ unitId, lines, payMethods, expectedGrandTotalSatang }` and a fresh `Idempotency-Key` - the bill (`saleId`, `receiptNo`, `changeSatang`). Retry with the same key on a network error.
5. `GET /sales/{id}/receipt` - the receipt to print or send.

### Shapes of a reply

- **Reads return the POS reader's answer in `data`.** When that answer has a single field, `data` is that field itself (for example `GET /sales/{id}` answers the bill, `GET /channels` the list of channels).
- **`GET /sales`** answers the bills of the day in `data` and `page` next to it, plus `date`, `counts` and `summary` at the top level.
- **`GET /products`** answers the products in `data`, `page` and `nextCursor` at the top level.
- **CSV.** 11 report operations render CSV when asked with `Accept: text/csv`.
- **Writes** answer the record they made or changed: `POST /sales` -> `{ saleId, receiptNo, grandTotalSatang, changeSatang, duplicated }`, `POST /sales/{id}/refund` -> `{ refund, sale }`, `POST /orders` -> `{ orderId, duplicated, saleId }`, `POST /orders/{id}/pay` -> `{ saleId, duplicated }`.
- **`duplicated` is not the replay flag.** A retry with the same `Idempotency-Key` inside the 24 hour window replays the stored first answer (so `duplicated` stays `false`) with the header `Idempotent-Replayed: true`. `duplicated: true` means the POS already held the record and returned it: the same `externalRef` on the same channel for `POST /orders`, or the same key after the replay window for `POST /sales` and `POST /orders/{id}/pay`.
- **Money in reports and bills.** `GET /sales/{id}` answers its money under `totals` with the `Satang` suffix like every other field (`subtotalSatang`, `grandTotalSatang`, `refundedSatang`, ...). CSV reports show money in baht with two decimals, like the export button; the daily CSV carries refund count and refund total as its last two columns (after the average bill, so the older columns keep their places); the JSON report carries every `*Satang` field. Bill lines carry `costSatang` and `marginSatang` only when the key also holds `pos.report.view` and the line is stock-tracked and its stock was consumed (other keys, and lines without consumed stock, get no such field).

## Error codes

Branch on `error.code`, never on the message text. The list is shared by every SHARK REST module, so a few codes below can only come from another module; they are marked as such.

| Code | HTTP | Meaning | What to do |
| --- | --- | --- | --- |
| `unauthorized` | 401 | No `Authorization: Bearer` header, or the key is unknown or revoked. | Check the header and that the key was not revoked in the POS settings. |
| `key_expired` | 401 | The key was valid but its expiry date has passed. | Create a new key in the POS settings; give the old one up. |
| `system_required` | 400 | The key is not bound to one POS system and no `X-Shark-System` header was sent. | Send `X-Shark-System: <AppSystem id>`, or use a key bound to one POS system. |
| `system_mismatch` | 403 | `X-Shark-System` points at another system than the key is bound to, or at a system that is not a POS of this shop. | Drop the header, or send the id the key is bound to. |
| `scope_missing` | 403 | The key does not hold the scope this operation needs. | Read `hint` for the scope, then issue a key with a wider bundle (`pos-operate`, `pos-admin`). |
| `invalid_json` | 400 | The request body is not parseable JSON. | Send valid JSON and `Content-Type: application/json`. |
| `validation` | 422 | The payload did not match the schema, or the POS refused a value (payments not adding up, unknown option, bad tax id, range over 92 days). `details[]` lists the fields when known. | Fix the fields in `details[]`. Unknown fields are rejected on purpose, so check spelling too. |
| `idempotency_required` | 400 | A write was sent without the `Idempotency-Key` header. | Generate one key per logical attempt (a UUID is fine) and send it. |
| `idempotency_conflict` | 409 | The same `Idempotency-Key` was reused with a different body (or, for a sale, the POS already holds a different bill under this key). | Use a fresh key for a different request; reuse the old key only to retry the identical one. |
| `idempotency_in_progress` | 409 | A request with this key is still running. | Wait a moment and retry with the same key; you will get the original response. |
| `confirm_required` | 409 | A danger operation was called without `confirm: true`. | Ask a human first, then resend with `confirm: true` and a `reason`. |
| `customer_session_required` | 401 | Member module only (customer self-service lane). The POS never returns this code. | Nothing to do here. |
| `customer_scope` | 403 | Member module only. The POS never returns this code. | Nothing to do here. |
| `not_found` | 404 | No such operation, or the branch, bill, product, channel, order or shift does not exist in this POS system. A branch or record of another POS system or shop answers this too, never 403. | Check the path and the ids (`GET /units` lists the branches of the key). |
| `method_not_allowed` | 405 | The path exists but not with this HTTP method. The `Allow` header lists what works. | Use one of the methods in `Allow`. |
| `rate_limited` | 429 | Too many calls for this key: 300 reads, 60 writes or 30 reports per minute. | Wait `Retry-After` seconds and retry; watch `X-RateLimit-Remaining`. |
| `period_locked` | 409 | Accounting specific (a closed accounting period). The POS never returns this code. | Nothing to do here. |
| `state_conflict` | 409 | The record is not in a state that allows this: the price changed since the quote (`PRICE_CHANGED`), the order moved on, the channel is paused, a shift is required or closed, the bill was voided or already refunded, a bill of another system. | Read the current state first. For `PRICE_CHANGED` quote again and resend with the new `expectedGrandTotalSatang`. |
| `duplicate` | 409 | A conflicting record already exists (for example a channel code). | Reuse the existing record, or send a different unique value. |
| `forbidden` | 403 | The POS refused by a business rule, not by the scope check: custom prices without `pos.sale.priceOverride`, cancelling an order that has a bill without `pos.sale.void`, a discount over the key's ceiling. | Read `message_en`. A key from the `pos-admin` bundle usually fixes it. |
| `unprocessable` | 422 | The request was understood but cannot be completed as asked. | Read `message_en` and `message_th`; the Thai message is safe to show to the shop owner. |
| `upstream_unavailable` | 503 | The POS is busy saving another change for the shop, or an external service is not reachable. Nothing was written. | Retry with the same `Idempotency-Key` shortly. |
| `idempotency_outcome_unknown` | 409 | A temporary database or network failure hit the request after it had started, so it is unknown whether it took effect. | Read the record (for a sale: `GET /sales?unitId=...&date=...`). If it does not exist, send the request again with a NEW `Idempotency-Key`. |
| `internal` | 500 | The POS had an unexpected problem (POS only). | Retry; if it keeps failing, report the `requestId`. |

### POS refusal reasons

Under the code above, the POS tells why in `message_th` / `message_en`. This is the full table of the POS reasons and the code each one is answered with:

| Reason | HTTP | `error.code` | `message_en` |
| --- | --- | --- | --- |
| `ACCOUNT_PENDING` | 409 (state or duplicate conflict) | `state_conflict` | The accounting link of this shop is not ready yet, so this cannot be done now. |
| `ALREADY_CLOCKED` | 409 (state or duplicate conflict) | `state_conflict` | This clock in/out was already recorded today. |
| `ALREADY_ISSUED` | 409 (state or duplicate conflict) | `state_conflict` | A full tax invoice was already issued for this bill. |
| `ALREADY_RECALLED` | 409 (state or duplicate conflict) | `state_conflict` | This held bill was already recalled by another device. |
| `ALREADY_RECOUNTED` | 409 (state or duplicate conflict) | `state_conflict` | This shift was already recounted. |
| `ALREADY_SET` | 409 (state or duplicate conflict) | `state_conflict` | This value is already set. |
| `AMOUNT_MISMATCH` | 422 (a value cannot be accepted) | `validation` | The amount does not match the amount expected. |
| `APPROVAL_MISMATCH` | 409 (state or duplicate conflict) | `state_conflict` | The approval does not match this request. |
| `APPROVAL_REQUIRED` | 409 (state or duplicate conflict) | `state_conflict` | This change needs a manager approval in the app. |
| `BENEFITS_EXCEED_TOTAL` | 422 (a value cannot be accepted) | `validation` | The member benefits are larger than the bill total. |
| `BILL_DISCOUNT_EXCEEDS_TOTAL` | 422 (a value cannot be accepted) | `validation` | The bill discount is larger than the bill total. |
| `BUSY` | 503 (busy, nothing written) | `upstream_unavailable` | The POS is busy saving another change for this shop. Nothing was saved; retry shortly. |
| `CHANNEL_BUILTIN_LOCKED` | 409 (state or duplicate conflict) | `state_conflict` | Built-in sales channels cannot be changed this way. |
| `CHANNEL_CODE_TAKEN` | 409 (state or duplicate conflict) | `duplicate` | Another sales channel of this branch already uses this code. |
| `CHANNEL_INVALID` | 422 (a value cannot be accepted) | `validation` | The sales channel is unknown, archived, closed or belongs to another branch. |
| `CHANNEL_LIMIT` | 409 (state or duplicate conflict) | `state_conflict` | This branch reached the maximum number of sales channels. |
| `CHANNEL_NOT_FOUND` | 404 (not found / not in this POS system) | `not_found` | The sales channel was not found in this POS system. |
| `CHANNEL_NOT_SOLD` | 422 (a value cannot be accepted) | `validation` | This product is not sold on that sales channel. |
| `CHANNEL_PAUSED` | 409 (state or duplicate conflict) | `state_conflict` | The sales channel is paused and does not take orders right now. |
| `CHANNEL_PAY_MISMATCH` | 422 (a value cannot be accepted) | `validation` | The payment method does not fit the sales channel (platform channels take one PLATFORM payment only). |
| `CONFLICT` | 409 (state or duplicate conflict) | `state_conflict` | The record changed or conflicts with another record. Read it again and retry. |
| `COUPON_INVALID` | 422 (a value cannot be accepted) | `validation` | The coupon code cannot be used for this bill. |
| `CREDIT_DISABLED` | 409 (state or duplicate conflict) | `state_conflict` | On-account (credit term) sales are turned off for this POS. |
| `CREDIT_INVOICE_PAID` | 409 (state or duplicate conflict) | `state_conflict` | The invoice of this on-account bill already has a payment. Refund the bill instead of voiding it. |
| `CREDIT_LIMIT_EXCEEDED` | 403 (refused by a business rule) | `forbidden` | This bill is over the credit limit of the company. A manager must allow it. |
| `CREDIT_NOT_ALLOWED` | 403 (refused by a business rule) | `forbidden` | This company has no active on-account credit. |
| `CREDIT_TERM_ZERO` | 409 (state or duplicate conflict) | `state_conflict` | The credit term of this company is 0 days, so it must pay now. |
| `CUSTOMER_INVALID` | 422 (a value cannot be accepted) | `validation` | The company of this bill is not valid for this shop. |
| `DBD_NOT_CONFIGURED` | 503 (busy, nothing written) | `upstream_unavailable` | The company registry lookup is not configured. |
| `DBD_UNAVAILABLE` | 503 (busy, nothing written) | `upstream_unavailable` | The company registry lookup is not reachable right now. |
| `DEAL_INVALID` | 422 (a value cannot be accepted) | `validation` | This deal cannot be linked to this bill. |
| `DEPOSIT_CLOSED` | 409 (state or duplicate conflict) | `state_conflict` | The deposit was already used up or refunded. |
| `DEPOSIT_EXCEEDS` | 409 (state or duplicate conflict) | `state_conflict` | The deposit amount is larger than what is left on it. |
| `DEPOSIT_LOCKED` | 409 (state or duplicate conflict) | `state_conflict` | The deposit is locked after too many wrong attempts. |
| `DEPOSIT_NOT_FOUND` | 404 (not found / not in this POS system) | `not_found` | The deposit was not found in this branch. |
| `DEPOSIT_NOT_OWNER` | 409 (state or duplicate conflict) | `state_conflict` | The deposit does not belong to the customer of this bill. |
| `DEVICE_LIMIT` | 409 (state or duplicate conflict) | `state_conflict` | This branch reached the maximum number of registered devices. |
| `DEVICE_NOT_FOUND` | 404 (not found / not in this POS system) | `not_found` | The device was not found in this branch. |
| `DEVICE_REVOKED` | 409 (state or duplicate conflict) | `state_conflict` | The device was revoked and cannot be used. |
| `DISCOUNT_EXCEEDS_LIMIT` | 403 (refused by a business rule) | `forbidden` | The discount is larger than this seller is allowed to give. |
| `DRAWER_INSUFFICIENT` | 409 (state or duplicate conflict) | `state_conflict` | There is not enough cash in the drawer. |
| `GIFT_CARD_CHANGED` | 409 (state or duplicate conflict) | `state_conflict` | The gift card balance or status changed. Read it again and retry. |
| `GIFT_CARD_LOCKED` | 409 (state or duplicate conflict) | `state_conflict` | The gift card is locked after too many wrong PIN attempts. |
| `GIFT_CARD_NOT_FOUND` | 404 (not found / not in this POS system) | `not_found` | The gift card was not found. |
| `GIFT_CARD_PIN` | 422 (a value cannot be accepted) | `validation` | The gift card PIN is wrong. |
| `HAS_REFUNDS` | 409 (state or duplicate conflict) | `state_conflict` | The bill already has refunds. Refund the rest instead of voiding it. |
| `IDEMPOTENCY_CONFLICT` | 409 (state or duplicate conflict) | `idempotency_conflict` | This key was already used for a different request. |
| `INTENT_CONSUMED` | 409 (state or duplicate conflict) | `state_conflict` | The payment request was already used for another bill. |
| `INTENT_EXPIRED` | 409 (state or duplicate conflict) | `state_conflict` | The payment request expired. |
| `INTENT_NOT_FOUND` | 404 (not found / not in this POS system) | `not_found` | The payment request was not found. |
| `INTENT_NOT_PAID` | 409 (state or duplicate conflict) | `state_conflict` | The payment request is not paid yet. |
| `INTERNAL` | 500 (unexpected error) | `internal` | The POS had an unexpected problem. Retry; if it keeps failing, contact support with the requestId. |
| `INVALID_LINE` | 422 (a value cannot be accepted) | `validation` | One of the lines is not valid. See details for the line. |
| `LINE_DISCOUNT_EXCEEDS_LINE` | 422 (a value cannot be accepted) | `validation` | A line discount is larger than the line total. |
| `MEMBER_NOT_FOUND` | 404 (not found / not in this POS system) | `not_found` | The member was not found in the member system of this branch. |
| `MEMBER_RIGHTS_CHANGED` | 409 (state or duplicate conflict) | `state_conflict` | The member benefits changed while the bill was saved. Quote again. |
| `MEMBER_RIGHTS_UNSUPPORTED` | 422 (a value cannot be accepted) | `validation` | This member benefit cannot be used here. |
| `MEMBER_SUSPENDED` | 409 (state or duplicate conflict) | `state_conflict` | The member is suspended. |
| `MEMBER_SYSTEM_MISSING` | 409 (state or duplicate conflict) | `state_conflict` | This branch has no member system linked. |
| `NOT_ELIGIBLE` | 409 (state or duplicate conflict) | `state_conflict` | The bill is not eligible for this operation. |
| `NOT_FOUND` | 404 (not found / not in this POS system) | `not_found` | The record was not found in this POS system. |
| `NO_EMPLOYEE` | 409 (state or duplicate conflict) | `state_conflict` | This user is not linked to an employee in HR. |
| `NO_PERMISSION` | 403 (refused by a business rule) | `forbidden` | This API key is not allowed to do that at this branch. |
| `OFF_SCHEDULE` | 403 (refused by a business rule) | `forbidden` | Outside the scheduled working hours. A manager must allow it. |
| `OPTIONS_INVALID` | 422 (a value cannot be accepted) | `validation` | The chosen options are not valid for this product. |
| `OPTIONS_REQUIRED` | 422 (a value cannot be accepted) | `validation` | This product needs its options to be chosen. |
| `OPTION_UNAVAILABLE` | 409 (state or duplicate conflict) | `state_conflict` | One of the chosen options is sold out. |
| `ORDER_NOT_FOUND` | 404 (not found / not in this POS system) | `not_found` | The order was not found in this branch. |
| `ORDER_STATE_CHANGED` | 409 (state or duplicate conflict) | `state_conflict` | The order changed state in the meantime. Read it again. |
| `ORDER_STATE_INVALID` | 409 (state or duplicate conflict) | `state_conflict` | The order is not in a state that allows this step. |
| `ORDER_UNPAID` | 409 (state or duplicate conflict) | `state_conflict` | The order is not paid yet. |
| `PAYMENT_MISMATCH` | 422 (a value cannot be accepted) | `validation` | The payments do not add up to the bill total (or the cash received is less than the cash part). |
| `PENDING_APPROVAL` | 409 (state or duplicate conflict) | `state_conflict` | A request for this is already waiting for approval. |
| `PERMISSION_DENIED` | 403 (refused by a business rule) | `forbidden` | This API key is not allowed to do that at this branch. |
| `PHONE_INVALID` | 422 (a value cannot be accepted) | `validation` | The phone number is not valid. |
| `PIN_INVALID` | 422 (a value cannot be accepted) | `validation` | The PIN is not valid. |
| `PIN_LOCKED` | 409 (state or duplicate conflict) | `state_conflict` | The PIN is locked after too many wrong attempts. |
| `PIN_TAKEN` | 409 (state or duplicate conflict) | `duplicate` | Another staff member of this branch already uses this PIN. |
| `PIN_THROTTLED` | 429 (too many attempts) | `rate_limited` | Too many PIN attempts. Wait and retry. |
| `POINTS_BELOW_MIN` | 422 (a value cannot be accepted) | `validation` | The points are below the minimum that can be used. |
| `POINTS_CAPPED` | 409 (state or duplicate conflict) | `state_conflict` | Fewer points can be used on this bill than requested. |
| `POINTS_DISABLED` | 422 (a value cannot be accepted) | `validation` | Points cannot be used at this branch. |
| `POINTS_INSUFFICIENT` | 422 (a value cannot be accepted) | `validation` | The member does not have enough points. |
| `PRICE_CHANGED` | 409 (state or duplicate conflict) | `state_conflict` | The bill total is not the expected total any more. Quote again and resend with the new expectedGrandTotalSatang. |
| `PRICE_NOT_SET` | 422 (a value cannot be accepted) | `validation` | One of the products has no price yet. |
| `PRICE_RULE_LIMIT` | 409 (state or duplicate conflict) | `state_conflict` | The shop reached the maximum number of price rules. |
| `PRICE_RULE_NOT_FOUND` | 404 (not found / not in this POS system) | `not_found` | The price rule was not found. |
| `PRODUCT_NOT_FOUND` | 404 (not found / not in this POS system) | `not_found` | The product was not found or is not sold at this branch. |
| `PRODUCT_UNAVAILABLE` | 409 (state or duplicate conflict) | `state_conflict` | The product is sold out (86) at this branch. |
| `RATE_LIMITED` | 429 (too many attempts) | `rate_limited` | Too many attempts in a short time. Wait and retry. |
| `REASON_REQUIRED` | 422 (a value cannot be accepted) | `validation` | A reason is required. |
| `REFUND_EMPTY` | 422 (a value cannot be accepted) | `validation` | Nothing to refund: choose at least one line and quantity. |
| `REFUND_EXCEEDS` | 422 (a value cannot be accepted) | `validation` | The refund is larger than what is left to refund on that line. |
| `REFUND_METHOD_INVALID` | 422 (a value cannot be accepted) | `validation` | This refund method cannot be used for this bill. |
| `SALE_NOT_FOUND` | 404 (not found / not in this POS system) | `not_found` | The bill was not found in this branch. |
| `SALE_NOT_REFUNDABLE` | 409 (state or duplicate conflict) | `state_conflict` | The bill cannot be refunded (voided, fully refunded, a refund document, a gift card sale or a bill of another system). |
| `SALE_NOT_VOIDABLE` | 409 (state or duplicate conflict) | `state_conflict` | The bill cannot be voided. |
| `SALE_VOIDED` | 409 (state or duplicate conflict) | `state_conflict` | The bill was voided. |
| `SHIFT_ALREADY_OPEN` | 409 (state or duplicate conflict) | `state_conflict` | A shift is already open on this device. |
| `SHIFT_CLOSED` | 409 (state or duplicate conflict) | `state_conflict` | The shift is closed. |
| `SHIFT_NOT_FORCED` | 409 (state or duplicate conflict) | `state_conflict` | The shift was not force closed. |
| `SHIFT_REQUIRED` | 409 (state or duplicate conflict) | `state_conflict` | This branch requires an open shift for this. Open a shift in the app first. |
| `SPLIT_INVALID` | 422 (a value cannot be accepted) | `validation` | The split of payments or the bill split is not valid. |
| `STAFF_TOKEN_INVALID` | 403 (refused by a business rule) | `forbidden` | The staff session on this device is not valid. |
| `STOCK_INSUFFICIENT` | 409 (state or duplicate conflict) | `state_conflict` | There is not enough stock and the branch does not allow negative stock. |
| `STORE_CREDIT_NOT_OWNER` | 409 (state or duplicate conflict) | `state_conflict` | The store credit does not belong to the customer of this bill. |
| `TABLE_BUSY` | 409 (state or duplicate conflict) | `state_conflict` | The table is busy. |
| `TABLE_EMPTY` | 409 (state or duplicate conflict) | `state_conflict` | The table has nothing to bill. |
| `TABLE_HAS_DRAFT` | 409 (state or duplicate conflict) | `state_conflict` | The table has items that were not sent yet. |
| `TABLE_HAS_UNPAID` | 409 (state or duplicate conflict) | `state_conflict` | The table still has unpaid items. |
| `TABLE_INACTIVE` | 409 (state or duplicate conflict) | `state_conflict` | The table is not active. |
| `TABLE_ITEMS_CHANGED` | 409 (state or duplicate conflict) | `state_conflict` | The items of the table changed. Quote again. |
| `TABLE_NOT_FOUND` | 404 (not found / not in this POS system) | `not_found` | The table was not found. |
| `TABLE_SESSION_CLOSED` | 409 (state or duplicate conflict) | `state_conflict` | The table session is closed. |
| `TABLE_SPLIT_EXISTS` | 409 (state or duplicate conflict) | `state_conflict` | The table already has a bill split. |
| `TABLE_SPLIT_LOCKED` | 409 (state or duplicate conflict) | `state_conflict` | The bill split is locked. |
| `TABLE_SPLIT_NOT_FOUND` | 404 (not found / not in this POS system) | `not_found` | The bill split was not found. |
| `TABLE_SPLIT_OPEN` | 409 (state or duplicate conflict) | `state_conflict` | The table has an open bill split. |
| `TABLE_SPLIT_PART_PAID` | 409 (state or duplicate conflict) | `state_conflict` | Part of the bill split was already paid. |
| `TAX_ID_INVALID` | 422 (a value cannot be accepted) | `validation` | The tax id is not valid (13 digits with a correct check digit). |
| `TIP_ACCOUNT_REQUIRED` | 409 (state or duplicate conflict) | `state_conflict` | Tips need a tip account to be set up first. |
| `TOO_LATE` | 409 (state or duplicate conflict) | `state_conflict` | It is too late for this operation. |
| `TOO_MANY_LINES` | 422 (a value cannot be accepted) | `validation` | The bill has too many lines. |
| `UNIT_SYSTEM_MISMATCH` | 404 (not found / not in this POS system) | `not_found` | The branch does not belong to this POS system. |
| `UNKNOWN` | 500 (unexpected error) | `internal` | The POS could not complete the request. Retry; if it keeps failing, contact support with the requestId. |
| `VALIDATION` | 422 (a value cannot be accepted) | `validation` | The request was understood but a value cannot be accepted. |
| `VARIANT_REQUIRED` | 422 (a value cannot be accepted) | `validation` | Choose a variant of this product. |
| `VERSION_CHANGED` | 409 (state or duplicate conflict) | `state_conflict` | The record changed in the meantime. Read it again. |
| `VOUCHER_COUPON_CONFLICT` | 422 (a value cannot be accepted) | `validation` | A voucher and a coupon cannot be used together on this bill. |
| `VOUCHER_INVALID` | 422 (a value cannot be accepted) | `validation` | The voucher cannot be used for this bill. |
| `WEAK_PIN` | 422 (a value cannot be accepted) | `validation` | The PIN is too easy to guess. |
| `WEIGHT_REQUIRED` | 422 (a value cannot be accepted) | `validation` | This product is sold by weight: send a weighed barcode. |

## Operations

### Read operations

Safe to call at any time. No `Idempotency-Key`, nothing is written, nothing is audited (`POST /sales/quote` is a read too). 29 of the 49 operations.

#### `units.list`

**GET /units** - Branches (points of sale) linked to the POS system of this key, oldest first. Every other operation takes one of these ids as unitId. · scope: `pos.sale.read` · read

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/pos/units" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `sales.receipt`

**GET /sales/{id}/receipt** - The original receipt payload of a bill (shop header, lines, VAT, payments, footer). Reading it is not a reprint and is not counted as one. · scope: `pos.sale.read` · read

Path parameters: `id` (required).

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `unitId` | string | no | Branch of the record. Optional: the record's own branch is used; a different branch answers 404. · min length 1 · max length 64 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/pos/sales/123/receipt" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `sales.refundable`

**GET /sales/{id}/refundable** - What is still refundable on a bill: every line with its net amount, quantity already refunded and quantity left. · scope: `pos.sale.refund` · read

Path parameters: `id` (required).

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `unitId` | string | no | Branch of the record. Optional: the record's own branch is used; a different branch answers 404. · min length 1 · max length 64 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/pos/sales/123/refundable" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `sales.get`

**GET /sales/{id}** - One bill with its lines, options, payments, refunds and channel. · scope: `pos.sale.read` · read

Path parameters: `id` (required).

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `unitId` | string | no | Branch of the record. Optional: the record's own branch is used; a different branch answers 404. · min length 1 · max length 64 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/pos/sales/123" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `sales.quote`

**POST /sales/quote** - Price a cart exactly like the register does (catalog price, options, channel price, VAT, rounding) without writing anything. Send its grandTotalSatang as expectedGrandTotalSatang when you sell. · scope: `pos.sale.create` · read

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `unitId` | string | yes | Branch (BusinessUnit id) of this POS system. List them with GET /units. · min length 1 · max length 64 |
| `lines` | array of one of several shapes | yes | Bill lines: catalog lines {productId, qty, options?, weighedBarcode?} or custom lines {name, qty, unitPriceSatang} (custom lines need pos.sale.priceOverride). · max 200 items |
| `channelId` | string | no | Sales channel id. Absent = walk-in (STORE). · min length 1 · max length 64 |
| `billDiscount` | object | no | Bill level discount. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/pos/sales/quote" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"unitId":"unt_123","lines":[{"productId":"prd_123","qty":2}]}'
```

#### `sales.list`

**GET /sales** - List the bills of one Thai business day for a branch (or every readable branch with unitId=*), newest first, with day counts and totals. · scope: `pos.sale.read` · read · paged

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `unitId` | string | yes | Branch id, or "*" for every branch the key may read. · min length 1 · max length 64 |
| `date` | string | no | Thai business date YYYY-MM-DD. Default today. |
| `status` | enum("ALL", "PAID", "VOIDED", "REFUNDED", "OFF_SHIFT_CASH") | no | Filter by bill status. Default ALL. |
| `q` | string | no | Search receipt number or member. · max length 100 |
| `page` | integer | no | Page number, from 1. · min 1 · max 100000 |
| `pageSize` | integer | no | Bills per page: 10, 20, 50. Default 10. |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/pos/sales?unitId=unt_123" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `shifts.xReport`

**GET /shifts/{id}/x-report** - X report of a shift (running totals so far: sales by payment method, cash in and out, expected cash in the drawer). · scope: `pos.shift.manage` · read

Path parameters: `id` (required).

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `unitId` | string | no | Branch of the shift. Optional: the shift's own branch is used; a different branch answers 404. · min length 1 · max length 64 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/pos/shifts/123/x-report" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `shifts.zReport`

**GET /shifts/{id}/z-report** - Z report of a closed shift (frozen at close: totals, counted cash, over/short). An open shift answers 422 validation. · scope: `pos.shift.manage` · read

Path parameters: `id` (required).

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `unitId` | string | no | Branch of the shift. Optional: the shift's own branch is used; a different branch answers 404. · min length 1 · max length 64 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/pos/shifts/123/z-report" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `shifts.current`

**GET /shifts/current** - The open shift of one register device of a branch (null when none). A shift left open past the shop limit is force closed first, exactly as at the register. · scope: `pos.shift.manage` · read

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `unitId` | string | yes | Branch (BusinessUnit id) of this POS system. · min length 1 · max length 64 |
| `deviceId` | string | yes | Device code of the register (GET /devices). · min length 8 · max length 64 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/pos/shifts/current?unitId=unt_123&deviceId=dev_counter_01" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `shifts.list`

**GET /shifts** - Recent shifts of a branch, newest first: device, opener, opened/closed time, status and the frozen Z totals of closed shifts. · scope: `pos.shift.manage` · read

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `unitId` | string | yes | Branch (BusinessUnit id) of this POS system. · min length 1 · max length 64 |
| `limit` | integer | no | How many shifts (default as the app). · min 1 · max 200 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/pos/shifts?unitId=unt_123" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `devices.list`

**GET /devices** - Registered register devices of a branch: name, device code, status, receipt printer settings, and the device limit of the branch. · scope: `pos.device.manage` · read

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `unitId` | string | yes | Branch (BusinessUnit id) of this POS system. · min length 1 · max length 64 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/pos/devices?unitId=unt_123" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `products.options`

**GET /products/{id}/options** - Option groups and choices (with price deltas) and variants of a product at a branch. Sold out choices are flagged. · scope: `pos.sale.create` · read

Path parameters: `id` (required).

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `unitId` | string | no | Branch to act in. Optional for a product of one branch (its own branch is used; a different branch answers 404); required for a product sold at every branch when the operation is per branch. · min length 1 · max length 64 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/pos/products/123/options" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `products.lookup`

**GET /products/lookup** - Find the product of a barcode exactly like the register scanner: product barcode, stock item barcode, or a scale label (grams and price of the label). match is one, choose (pick a variant) or none. · scope: `pos.sale.create` · read

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `unitId` | string | yes | Branch (BusinessUnit id) of this POS system. · min length 1 · max length 64 |
| `barcode` | string | yes | Scanned code (EAN/UPC/internal, or a weighed EAN-13 label). · min length 1 · max length 64 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/pos/products/lookup?unitId=unt_123&barcode=8850999320011" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `products.list`

**GET /products** - Products sellable at a branch (the register catalog): price in satang, VAT, kind, stock link, availability (86) per branch. Cursor paging: send nextCursor back as cursor. · scope: `pos.sale.read` · read · paged

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `unitId` | string | yes | Branch (BusinessUnit id) of this POS system. · min length 1 · max length 64 |
| `q` | string | no | Search name, English name, barcode or SKU. · max length 100 |
| `pageSize` | integer | no | Products per page (default 100, max 500). · min 1 · max 500 |
| `cursor` | string | no | nextCursor of the previous page. · min length 1 · max length 400 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/pos/products?unitId=unt_123" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `channels.list`

**GET /channels** - Sales channels of a branch (walk-in STORE, web shop, delivery platforms, custom channels): code, payout (DIRECT or PLATFORM), commission, adapter and pause state. · scope: `pos.sale.read` · read

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `unitId` | string | yes | Branch (BusinessUnit id) of this POS system. · min length 1 · max length 64 |
| `includeArchived` | enum("true", "false") | no | true = also list archived channels. |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/pos/channels?unitId=unt_123" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `orders.get`

**GET /orders/{id}** - One order with lines, customer, fulfilment, timeline, payment state and its bill. · scope: `pos.sale.read` · read

Path parameters: `id` (required).

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `unitId` | string | no | Branch of the order. Optional: the order's own branch is used; a different branch answers 404. · min length 1 · max length 64 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/pos/orders/123" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `orders.list`

**GET /orders** - Orders of a branch since the start of the Thai business day (or since, at most 7 days back), with counts per status and the day summary. · scope: `pos.sale.read` · read

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `unitId` | string | yes | Branch (BusinessUnit id) of this POS system. · min length 1 · max length 64 |
| `status` | enum("NEW", "ACCEPTED", "PREPARING", "READY", "HANDED", "REJECTED", "CANCELLED") | no | Only orders in this status. |
| `channelId` | string | no | Only orders of this sales channel. · min length 1 · max length 64 |
| `since` | string | no | ISO-8601 start (cut at 7 days back). |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/pos/orders?unitId=unt_123" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `reports.anomalies`

**GET /reports/anomalies** - Anomaly report over a range: hits of the anomaly rules against the shop thresholds, per branch, day and staff member. Needs pos.report.anomaly and pos.report.view. CSV with Accept: text/csv. · scope: `pos.report.anomaly` · read · `Accept: text/csv` supported · report rate (30/min)

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `from` | string | no | First Thai business date YYYY-MM-DD (default: 6 days before to). |
| `to` | string | no | Last Thai business date YYYY-MM-DD, inclusive (default: today). At most 92 days per call (31 for hourly). |
| `unitId` | string | no | One branch. Absent = every branch the key may read. · min length 1 · max length 64 |
| `limit` | integer | no | Row limit of ranked reports (default 200). · min 1 · max 1000 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/pos/reports/anomalies" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Accept: text/csv"
```

#### `reports.branches`

**GET /reports/branches** - Sales per branch over a range with a total row (same numbers as the per branch reports). CSV with Accept: text/csv. · scope: `pos.report.view` · read · `Accept: text/csv` supported · report rate (30/min)

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `from` | string | no | First Thai business date YYYY-MM-DD (default: 6 days before to). |
| `to` | string | no | Last Thai business date YYYY-MM-DD, inclusive (default: today). At most 92 days per call (31 for hourly). |
| `unitId` | string | no | One branch. Absent = every branch the key may read. · min length 1 · max length 64 |
| `limit` | integer | no | Row limit of ranked reports (default 200). · min 1 · max 1000 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/pos/reports/branches" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Accept: text/csv"
```

#### `reports.channels`

**GET /reports/channels** - Sales per sales channel over a range: bills, gross, refunds, platform commission and net. CSV with Accept: text/csv. · scope: `pos.report.view` · read · `Accept: text/csv` supported · report rate (30/min)

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `from` | string | no | First Thai business date YYYY-MM-DD (default: 6 days before to). |
| `to` | string | no | Last Thai business date YYYY-MM-DD, inclusive (default: today). At most 92 days per call (31 for hourly). |
| `unitId` | string | no | One branch. Absent = every branch the key may read. · min length 1 · max length 64 |
| `limit` | integer | no | Row limit of ranked reports (default 200). · min 1 · max 1000 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/pos/reports/channels" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Accept: text/csv"
```

#### `sales.byDay`

**GET /reports/daily** - Sales per Thai business day over a range: bills, gross, discounts, net sales, VAT, tips, voids, refunds and average bill (satang), with totals. CSV with Accept: text/csv. · scope: `pos.report.view` · read · `Accept: text/csv` supported · report rate (30/min)

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `from` | string | no | First Thai business date YYYY-MM-DD (default: 6 days before to). |
| `to` | string | no | Last Thai business date YYYY-MM-DD, inclusive (default: today). At most 92 days per call (31 for hourly). |
| `unitId` | string | no | One branch. Absent = every branch the key may read. · min length 1 · max length 64 |
| `limit` | integer | no | Row limit of ranked reports (default 200). · min 1 · max 1000 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/pos/reports/daily" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Accept: text/csv"
```

#### `reports.hourly`

**GET /reports/hourly** - Sales per hour of the business day over a range (at most 31 days), with a same weekday forecast. CSV with Accept: text/csv. · scope: `pos.report.view` · read · `Accept: text/csv` supported · report rate (30/min)

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `from` | string | no | First Thai business date YYYY-MM-DD (default: 6 days before to). |
| `to` | string | no | Last Thai business date YYYY-MM-DD, inclusive (default: today). At most 92 days per call (31 for hourly). |
| `unitId` | string | no | One branch. Absent = every branch the key may read. · min length 1 · max length 64 |
| `limit` | integer | no | Row limit of ranked reports (default 200). · min 1 · max 1000 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/pos/reports/hourly" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Accept: text/csv"
```

#### `reports.margin`

**GET /reports/margin** - Gross margin per product over a range: revenue, cost (stock cost at sale time, estimated where missing) and margin in satang and basis points. CSV with Accept: text/csv. · scope: `pos.report.view` · read · `Accept: text/csv` supported · report rate (30/min)

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `from` | string | no | First Thai business date YYYY-MM-DD (default: 6 days before to). |
| `to` | string | no | Last Thai business date YYYY-MM-DD, inclusive (default: today). At most 92 days per call (31 for hourly). |
| `unitId` | string | no | One branch. Absent = every branch the key may read. · min length 1 · max length 64 |
| `limit` | integer | no | Row limit of ranked reports (default 200). · min 1 · max 1000 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/pos/reports/margin" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Accept: text/csv"
```

#### `reports.payments`

**GET /reports/payments** - Money received per payment method over a range, net of refunds, with cash tendered and change. CSV with Accept: text/csv. · scope: `pos.report.view` · read · `Accept: text/csv` supported · report rate (30/min)

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `from` | string | no | First Thai business date YYYY-MM-DD (default: 6 days before to). |
| `to` | string | no | Last Thai business date YYYY-MM-DD, inclusive (default: today). At most 92 days per call (31 for hourly). |
| `unitId` | string | no | One branch. Absent = every branch the key may read. · min length 1 · max length 64 |
| `limit` | integer | no | Row limit of ranked reports (default 200). · min 1 · max 1000 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/pos/reports/payments" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Accept: text/csv"
```

#### `reports.products`

**GET /reports/products** - Best sellers over a range: quantity, weight, bills and sales per product, ranked. CSV with Accept: text/csv. · scope: `pos.report.view` · read · `Accept: text/csv` supported · report rate (30/min)

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `from` | string | no | First Thai business date YYYY-MM-DD (default: 6 days before to). |
| `to` | string | no | Last Thai business date YYYY-MM-DD, inclusive (default: today). At most 92 days per call (31 for hourly). |
| `unitId` | string | no | One branch. Absent = every branch the key may read. · min length 1 · max length 64 |
| `limit` | integer | no | Row limit of ranked reports (default 200). · min 1 · max 1000 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/pos/reports/products" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Accept: text/csv"
```

#### `reports.shifts`

**GET /reports/shifts** - Shifts of a range with their Z totals, counted cash and over/short. CSV with Accept: text/csv. · scope: `pos.report.view` · read · `Accept: text/csv` supported · report rate (30/min)

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `from` | string | no | First Thai business date YYYY-MM-DD (default: 6 days before to). |
| `to` | string | no | Last Thai business date YYYY-MM-DD, inclusive (default: today). At most 92 days per call (31 for hourly). |
| `unitId` | string | no | One branch. Absent = every branch the key may read. · min length 1 · max length 64 |
| `limit` | integer | no | Row limit of ranked reports (default 200). · min 1 · max 1000 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/pos/reports/shifts" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Accept: text/csv"
```

#### `reports.staff`

**GET /reports/staff** - Sales per seller over a range: bills, net sales after refunds, discounts, tips, voids. Bills sold through the API are listed under the API key id, named 'API: <key name>'. CSV with Accept: text/csv. · scope: `pos.report.view` · read · `Accept: text/csv` supported · report rate (30/min)

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `from` | string | no | First Thai business date YYYY-MM-DD (default: 6 days before to). |
| `to` | string | no | Last Thai business date YYYY-MM-DD, inclusive (default: today). At most 92 days per call (31 for hourly). |
| `unitId` | string | no | One branch. Absent = every branch the key may read. · min length 1 · max length 64 |
| `limit` | integer | no | Row limit of ranked reports (default 200). · min 1 · max 1000 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/pos/reports/staff" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Accept: text/csv"
```

#### `sales.summary`

**GET /reports/summary** - Totals of paid sales over a range of Thai business days (default the last 7 including today): bills, gross, discounts, net sales after refunds and voids, VAT, tips, voids and refunds in satang. · scope: `pos.report.view` · read · report rate (30/min)

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `from` | string | no | First Thai business date YYYY-MM-DD (default: 6 days before to). |
| `to` | string | no | Last Thai business date YYYY-MM-DD, inclusive (default: today). At most 92 days per call (31 for hourly). |
| `unitId` | string | no | One branch. Absent = every branch the key may read. · min length 1 · max length 64 |
| `limit` | integer | no | Row limit of ranked reports (default 200). · min 1 · max 1000 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/pos/reports/summary" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `reports.tax`

**GET /reports/tax** - Output VAT over a range per Thai business day and branch: first and last receipt number, bills, gross, VAT base and VAT, net of refunds. CSV with Accept: text/csv. · scope: `pos.report.view` · read · `Accept: text/csv` supported · report rate (30/min)

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `from` | string | no | First Thai business date YYYY-MM-DD (default: 6 days before to). |
| `to` | string | no | Last Thai business date YYYY-MM-DD, inclusive (default: today). At most 92 days per call (31 for hourly). |
| `unitId` | string | no | One branch. Absent = every branch the key may read. · min length 1 · max length 64 |
| `limit` | integer | no | Row limit of ranked reports (default 200). · min 1 · max 1000 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/pos/reports/tax" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Accept: text/csv"
```

### Write operations

Change data. `Idempotency-Key` is required and every success is written to the audit log with the key name. 16 of the 49 operations.

#### `sync.sales`

**POST /sync/sales** - Sync bills a register sold while offline (max 50 per call, processed in sold time order). Each bill is re-priced at its sold time or at the device's price snapshot; every bill gets its own result: OK (new bill), DUPLICATE (already synced) or REJECTED with a reason for the manager queue. · scope: `pos.offline.sync` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `unitId` | string | yes | Branch (BusinessUnit id) of this POS system. · min length 1 · max length 64 |
| `deviceId` | string | yes | Device code of the register that sold the bills (registered at this branch). · min length 8 · max length 64 |
| `items` | array of object | yes | Bills to sync (max 50). · max 50 items |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/pos/sync/sales" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"unitId":"unt_123","deviceId":"dev_counter_01","items":[]}'
```

#### `sales.taxInvoice`

**POST /sales/{id}/tax-invoice** - Issue a full tax invoice for a paid bill (the shop must be VAT registered with the accounting module linked). One invoice per bill: a repeat call (any Idempotency-Key) answers the bill's existing invoice; the request key is kept on the audit row only. · scope: `pos.taxinvoice.issue` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `buyer` | object | yes | Buyer of the full tax invoice. |
| `unitId` | string | no | Branch of the record. Optional: the record's own branch is used; a different branch answers 404. · min length 1 · max length 64 |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/pos/sales/123/tax-invoice" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"buyer":{"kind":"JURISTIC","name":"Example Co., Ltd.","taxId":"0105561177639","branchCode":"00000","address":"1 Example Road, Bangkok 10110"}}'
```

#### `sales.create`

**POST /sales** - Sell: price the cart like the register, cut stock, post accounting and number the receipt in one step. Payments must add up to the bill total exactly (all amounts in satang). · scope: `pos.sale.create` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `unitId` | string | yes | Branch (BusinessUnit id) of this POS system. List them with GET /units. · min length 1 · max length 64 |
| `lines` | array of one of several shapes | yes | Bill lines: catalog lines {productId, qty, options?, weighedBarcode?} or custom lines {name, qty, unitPriceSatang} (custom lines need pos.sale.priceOverride). · max 200 items |
| `payMethods` | array of object | yes | Payments. The sum must equal the bill total exactly. · max 10 items |
| `expectedGrandTotalSatang` | integer | no | The total you showed the customer (from POST /sales/quote). Recommended: when it differs from the live total the sale is refused with 409 state_conflict and nothing is written. Absent = no total check. · min 0 · max 2147483647 |
| `cashReceivedSatang` | integer | no | Cash handed over by the customer (>= the CASH part). Absent = exactly the CASH part (no change). · min 0 · max 2147483647 |
| `channelId` | string | no | Sales channel id (GET /channels). Absent = the branch's walk-in channel (STORE). · min length 1 · max length 64 |
| `channelRef` | string | no | Order number on the platform (platform channels). · min length 1 · max length 40 |
| `billDiscount` | object | no | Bill level discount. Limited by the discount ceiling of the key (STAFF). |
| `note` | string | no | Bill note. · max length 200 |
| `shiftId` | string | no | Bind the bill to this OPEN shift of the same branch. Absent: when the shop requires a shift for sales from other sources, the single open shift of the branch is used (no open shift, or several open shifts with a CASH payment = 409 state_conflict SHIFT_REQUIRED); otherwise the bill is out of any shift and the answer has outOfShift: true. · min length 1 · max length 64 |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/pos/sales" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"unitId":"unt_123","lines":[{"productId":"prd_123","qty":2}],"payMethods":[{"type":"CASH","amountSatang":13000}]}'
```

#### `products.availability`

**POST /products/{id}/availability** - Mark a product sold out (86) or back on sale at a branch. The register, kitchen screens and channels see it at once; emits pos.product.availability when it flips. · scope: `pos.sale.create` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `unitId` | string | no | Branch to act in. Optional for a product of one branch (its own branch is used; a different branch answers 404); required for a product sold at every branch when the operation is per branch. · min length 1 · max length 64 |
| `available` | boolean | yes | false = sold out (86) · true = back on sale. |
| `note` | string | no | Note for the staff. · max length 200 |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/pos/products/123/availability" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"available":false}'
```

#### `products.setPrice`

**PUT /products/{id}/price** - Set the base price of a product (satang). Linked menu, web shop and accounting prices follow from the same write. · scope: `pos.product.setPrice` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `unitId` | string | no | Branch to act in. Optional for a product of one branch (its own branch is used; a different branch answers 404); required for a product sold at every branch when the operation is per branch. · min length 1 · max length 64 |
| `priceSatang` | integer | yes | New base price in satang. · min 0 · max 2147483647 |

```bash
curl -sS -X PUT "https://shark.in.th/api/v1/pos/products/123/price" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"priceSatang":6500}'
```

#### `products.update`

**PATCH /products/{id}** - Change the name, English name, category, stock cutting or weighing of a product. Prices go through PUT /products/{id}/price. · scope: `pos.product.manage` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `unitId` | string | no | Branch to act in. Optional for a product of one branch (its own branch is used; a different branch answers 404); required for a product sold at every branch when the operation is per branch. · min length 1 · max length 64 |
| `name` | string | no | Product name (Thai). · min length 1 · max length 200 |
| `nameEn` | string or null | no | English name (null = clear). · max length 200 |
| `categoryId` | string or null | no | Category id (null = none). · min length 1 · max length 64 |
| `trackStock` | boolean or null | no | true = always cut stock · false = never · null = automatic. |
| `soldByWeight` | boolean | no | Sold by weight. |
| `scalePlu` | string or null | no | 5 digit scale PLU (null = clear). |

```bash
curl -sS -X PATCH "https://shark.in.th/api/v1/pos/products/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `products.create`

**POST /products** - Add a product to the catalog of a branch (or of every branch with allBranches: true). Stock items come from the inventory module; this creates catalog only products. · scope: `pos.product.manage` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `unitId` | string | yes | Branch (BusinessUnit id) of this POS system. · min length 1 · max length 64 |
| `allBranches` | boolean | no | true = sold at every branch of this POS system (needs the scope at every branch). |
| `name` | string | yes | Product name (Thai). · min length 1 · max length 200 |
| `nameEn` | string | no | English name. · max length 200 |
| `kind` | enum("PRODUCT", "SERVICE", "MENU", "BUNDLE") | no | PRODUCT (default), SERVICE, MENU or BUNDLE. |
| `categoryId` | string | no | Catalog category id. · min length 1 · max length 64 |
| `basePriceSatang` | integer | no | Price in satang, VAT included as the shop sets. Per kilogram for sold-by-weight products. · min 0 · max 2147483647 |
| `vatRateBp` | integer | no | VAT rate in basis points (700 = 7%). Absent = the shop default. · min 0 · max 10000 |
| `barcode` | string | no | Barcode. · min length 1 · max length 64 |
| `trackStock` | boolean | no | Cut stock on sale (needs a stock item). |
| `soldByWeight` | boolean | no | Sold by weight (PRODUCT only); basePriceSatang = price per kg. |
| `scalePlu` | string | no | 5 digit scale PLU of a sold-by-weight product. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/pos/products" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"unitId":"unt_123","name":"Iced latte"}'
```

#### `channels.pause`

**POST /channels/{id}/pause** - Stop taking orders on a channel until a time (at most 24 hours ahead). Orders sent to a paused API, web or chat channel are refused with 409 state_conflict. · scope: `pos.order.accept` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `unitId` | string | no | Branch of the channel. Optional: the channel's own branch is used; a different branch answers 404. · min length 1 · max length 64 |
| `until` | string | yes | ISO-8601 time when the channel opens again (max 24 h from now). |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/pos/channels/123/pause" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"until":"2026-10-15T18:00:00+07:00"}'
```

#### `channels.resume`

**POST /channels/{id}/resume** - Take orders on a paused channel again now. · scope: `pos.order.accept` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `unitId` | string | no | Branch of the channel. Optional: the channel's own branch is used; a different branch answers 404. · min length 1 · max length 64 |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/pos/channels/123/resume" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `orders.accept`

**POST /orders/{id}/accept** - Accept a NEW order. On a platform channel this opens the bill (platform payment, commission in the journal). · scope: `pos.order.accept` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `unitId` | string | no | Branch of the order. Optional: the order's own branch is used; a different branch answers 404. · min length 1 · max length 64 |
| `prepMinutes` | integer | no | Preparation time in minutes (default = the channel's). · min 1 · max 180 |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/pos/orders/123/accept" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `orders.complete`

**POST /orders/{id}/complete** - Hand over a READY order (HANDED). · scope: `pos.order.accept` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `unitId` | string | no | Branch of the order. Optional: the order's own branch is used; a different branch answers 404. · min length 1 · max length 64 |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/pos/orders/123/complete" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `orders.pay`

**POST /orders/{id}/pay** - Take payment for an order of a DIRECT channel: opens the bill (stock, journal, receipt) and marks the order PAID. Payments must add up to the order total. Cash needs exactly one open shift at the branch (409 state_conflict otherwise). · scope: `pos.sale.create` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `unitId` | string | no | Branch of the order. Optional: the order's own branch is used; a different branch answers 404. · min length 1 · max length 64 |
| `payMethods` | array of object | yes | Payments. · max 10 items |
| `cashReceivedSatang` | integer | no | Cash handed over (>= the CASH part). · min 0 · max 2147483647 |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/pos/orders/123/pay" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"payMethods":[{"type":"CASH","amountSatang":6500}]}'
```

#### `orders.preparing`

**POST /orders/{id}/preparing** - Move an ACCEPTED order to PREPARING. · scope: `pos.order.accept` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `unitId` | string | no | Branch of the order. Optional: the order's own branch is used; a different branch answers 404. · min length 1 · max length 64 |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/pos/orders/123/preparing" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `orders.ready`

**POST /orders/{id}/ready** - Move a PREPARING order to READY. · scope: `pos.order.accept` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `unitId` | string | no | Branch of the order. Optional: the order's own branch is used; a different branch answers 404. · min length 1 · max length 64 |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/pos/orders/123/ready" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `orders.reject`

**POST /orders/{id}/reject** - Reject a NEW order with a reason code (OUT_OF_STOCK, CLOSING, TOO_BUSY, OTHER). · scope: `pos.order.reject` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `unitId` | string | no | Branch of the order. Optional: the order's own branch is used; a different branch answers 404. · min length 1 · max length 64 |
| `reasonCode` | string | yes | One of OUT_OF_STOCK, CLOSING, TOO_BUSY, OTHER. · min length 1 · max length 40 |
| `note` | string | no | Free text note (OTHER). · max length 200 |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/pos/orders/123/reject" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"reasonCode":"TOO_BUSY"}'
```

#### `orders.create`

**POST /orders** - Put an order into a sales channel of a branch (custom app, delivery platform tablet, phone order). The same externalRef on the same channel returns the first order with duplicated: true. · scope: `pos.sale.create` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `unitId` | string | yes | Branch (BusinessUnit id) of this POS system. · min length 1 · max length 64 |
| `channelId` | string | no | Sales channel id (GET /channels). Send channelId or channelCode. · min length 1 · max length 64 |
| `channelCode` | string | no | Sales channel code of the branch, e.g. LINEMAN. · min length 1 · max length 40 |
| `externalRef` | string | no | Order number on the platform / your system. · min length 1 · max length 40 |
| `fulfilment` | enum("PICKUP", "DELIVERY", "DINE_IN") | yes | PICKUP, DELIVERY or DINE_IN. |
| `lines` | array of object | yes | Order lines. · max 100 items |
| `customer` | object | no | Customer of the order. |
| `address` | string | no | Delivery address. · max length 300 |
| `note` | string | no | Order note. · max length 300 |
| `startStatus` | enum("NEW", "ACCEPTED") | no | NEW (staff must accept) or ACCEPTED. Default: ACCEPTED on MANUAL channels, NEW elsewhere. |
| `paymentState` | enum("UNPAID", "PAY_ON_PICKUP") | no | UNPAID or PAY_ON_PICKUP (DIRECT channels). |
| `prepMinutes` | integer | no | Preparation time in minutes. · min 1 · max 180 |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/pos/orders" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"unitId":"unt_123","fulfilment":"PICKUP","lines":[{"productId":"prd_123","qty":1}]}'
```

### Danger operations

Hard to undo. On top of the write rules they need `confirm: true` and a `reason` of at least 5 characters. An AI agent must ask a human before calling these. 4 of the 49 operations.

#### `sales.refund`

**POST /sales/{id}/refund** - Refund part or all of a paid bill: issues a REFUND document (credit note), restocks, reverses accounting and member points, and emits pos.sale.refunded. · scope: `pos.sale.refund` · danger

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `reason` | string | yes | Why the money goes back. Stored on the refund document and in the audit log. · min length 5 · max length 200 |
| `reasonCode` | enum("DAMAGED", "WRONG_ITEM", "CHANGED_MIND", "OTHER") | no | DAMAGED, WRONG_ITEM, CHANGED_MIND or OTHER (default). |
| `lines` | array of object | yes | Lines and quantities to refund. · max 200 items |
| `payMethods` | array of object | yes | Refund payments. The sum must equal the refund total (see GET /sales/{id}/refundable). · max 5 items |
| `unitId` | string | no | Branch of the record. Optional: the record's own branch is used; a different branch answers 404. · min length 1 · max length 64 |
| `confirm` | enum(true) | yes | Must be exactly true. Proves the caller meant to run an operation that is hard to undo. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/pos/sales/123/refund" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"reason":"customer changed their mind","lines":[{"lineId":"lin_123","qty":1}],"payMethods":[{"type":"CASH","amountSatang":6500}],"confirm":true}'
```

#### `sales.void`

**POST /sales/{id}/void** - Void a paid POS bill (register or API). Reverses accounting, coupons, member rights and stock. Cannot be undone; a bill with refunds must be refunded instead, and a bill of a closed shift cannot be voided. When the shop's approval rule for voids applies, nothing is voided: 409 state_conflict with the approval request id in hint, and the request waits for a manager in the app. · scope: `pos.sale.void` · danger

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `reason` | string | yes | Why the bill is voided. Stored in the audit log. · min length 5 · max length 500 |
| `unitId` | string | no | Branch of the record. Optional: the record's own branch is used; a different branch answers 404. · min length 1 · max length 64 |
| `confirm` | enum(true) | yes | Must be exactly true. Proves the caller meant to run an operation that is hard to undo. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/pos/sales/123/void" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"reason":"customer changed their mind","confirm":true}'
```

#### `products.archive`

**POST /products/{id}/archive** - Stop selling a product (archive). Old bills keep their lines; the product can be restored from the app. · scope: `pos.product.manage` · danger

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `reason` | string | yes | Why it is archived. Stored in the audit log. · min length 5 · max length 500 |
| `unitId` | string | no | Branch to act in. Optional for a product of one branch (its own branch is used; a different branch answers 404); required for a product sold at every branch when the operation is per branch. · min length 1 · max length 64 |
| `confirm` | enum(true) | yes | Must be exactly true. Proves the caller meant to run an operation that is hard to undo. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/pos/products/123/archive" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"reason":"customer changed their mind","confirm":true}'
```

#### `orders.cancel`

**POST /orders/{id}/cancel** - Cancel an accepted order. If the order already has a bill, the bill is voided too, which needs pos.sale.void as well. · scope: `pos.order.reject` · danger

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `reason` | string | yes | Why the order is cancelled. Stored with the order and in the audit log. · min length 5 · max length 200 |
| `unitId` | string | no | Branch of the order. Optional: the order's own branch is used; a different branch answers 404. · min length 1 · max length 64 |
| `confirm` | enum(true) | yes | Must be exactly true. Proves the caller meant to run an operation that is hard to undo. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/pos/orders/123/cancel" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"reason":"customer changed their mind","confirm":true}'
```

## Webhooks

Everything above is you calling SHARK. Webhooks are SHARK calling you: the shop owner adds an endpoint URL in the shop settings (Connections > External apps / API), ticks the events and gets a signing secret shown once. Events fire wherever the change came from: the register screen, this API, an order adapter or another SHARK module.

Each delivery is `POST <your url>` with `Content-Type: application/json`, header `X-Shark-Event: <type>`, `X-Shark-Event-Id` (same on every retry - drop duplicates) and `X-Shark-Signature` = HMAC-SHA256 of the raw body with the endpoint secret, lowercase hex. Delivery is at least once with retries, so handlers must be idempotent. The body is always `{ id, type, payload, sentAt }`; `payload` carries ids only, for example:

```json
{
  "id": "cmf1evt0001",
  "type": "pos.sale.paid",
  "payload": {
    "saleId": "cmf1sal0001"
  },
  "sentAt": "2026-10-15T09:15:00.000Z"
}
```

Read the details with `GET /sales/{id}` (or the order, shift or product operation).

| Event | Fires when |
| --- | --- |
| `pos.sale.paid` | A bill was paid (register, API, order payment or another SHARK module selling through the POS). |
| `pos.sale.voided` | A bill was voided. |
| `pos.shift.opened` | A shift was opened on a register device. |
| `pos.shift.closed` | A shift was closed (Z report frozen). |
| `pos.stockCount.confirmed` | A stock count started from the register was confirmed. |
| `pos.sale.refunded` | A refund document (credit note) was issued for a bill. |
| `pos.payment.intent_paid` | Money arrived for a PromptPay or card payment request. |
| `pos.sale.taxInvoiceIssued` | A full tax invoice was issued for a bill. |
| `pos.order.received` | An online or platform order came in. |
| `pos.order.accepted` | An order was accepted. |
| `pos.order.rejected` | An order was rejected. |
| `pos.order.ready` | An order is ready. |
| `pos.order.completed` | An order was handed over. |
| `pos.order.cancelled` | An order was cancelled. |
| `pos.product.availability` | A product was marked sold out (86) or back on sale at a branch. |

## Glossary (Thai <-> English POS terms)

Field names and codes in this API are English. This table maps them to the Thai words a shop owner or cashier uses.

| ไทย | English | In the API |
| --- | --- | --- |
| ระบบขายหน้าร้าน | POS system (AppSystem of type POS) | `X-Shark-System` |
| สาขา / จุดขาย | branch (business unit) | `unitId` · `GET /units` |
| บิล / ใบเสร็จ | bill / receipt | `/sales` · `receiptNo` |
| ใบคืนเงิน / ใบลดหนี้ | refund document (credit note) | `POST /sales/{id}/refund` · `docType: REFUND` |
| ยกเลิกบิล | void a bill | `POST /sales/{id}/void` |
| ใบกำกับภาษีเต็มรูป | full tax invoice | `POST /sales/{id}/tax-invoice` |
| สตางค์ | satang (1/100 baht) | `*Satang` fields |
| ยอดสุทธิ | grand total | `grandTotalSatang` |
| เงินทอน | change | `changeSatang` |
| กะ / ลิ้นชัก | shift / cash drawer | `/shifts` |
| รายงาน X / Z | X report (running) / Z report (closed shift) | `/shifts/{id}/x-report` · `/z-report` |
| เครื่องขาย | register device | `GET /devices` |
| ช่องทางขาย | sales channel (walk-in, web, delivery platform) | `/channels` · `channelId` |
| ออเดอร์ | order (online / platform / phone) | `/orders` |
| แพลตฟอร์มเดลิเวอรี | delivery platform (payout PLATFORM) | `payout: PLATFORM` · tender `PLATFORM` |
| ของหมด (86) | sold out | `POST /products/{id}/availability` |
| ตัวเลือกสินค้า | product options / choices | `GET /products/{id}/options` · `choiceId` |
| สินค้าชั่ง / ป้ายชั่ง | sold by weight / scale label | `weighedBarcode` · `GET /products/lookup` |
| ราคาตั้งเอง | custom / open price | custom line `{name, qty, unitPriceSatang}` · `pos.sale.priceOverride` |
| วันธุรกิจ | Thai business date (shop cut-off) | `from` · `to` · `date` |

---
name: shark-pos-api
description: Run a SHARK shop's point of sale (POS) through the REST API at https://shark.in.th/api/v1/pos - sell at register prices, find bills and receipts, refund or void a bill, take and progress online or delivery platform orders, look up products by barcode, mark items sold out (86), change products and prices, read shifts and every sales report (CSV export). Use when the user asks to ring up a sale, check today's bills, refund part of a bill, accept or reject an order, pause a sales channel, mark a product sold out, pull a daily or product report, or wire an external app, kiosk or agent into SHARK POS.
---

# SHARK POS API

## When to use

Use this skill whenever a task needs to read or change data in a SHARK point of
sale (POS) system: branches, bills, receipts, refunds, voids, full tax
invoices, online and platform orders, sales channels, catalog products and
prices, sold out (86) flags, shifts, register devices and sales reports.

Do not use this skill for the shop's accounting books, members and loyalty,
CRM or task boards - those are separate APIs with their own skills
(`shark-account-api`, `shark-member-api`, `shark-crm-api`,
`shark-kanban-api`). A sale made here does post to the accounting books by
itself; never post it again there.

## Setup

- Base URL: `https://shark.in.th/api/v1/pos`
- Every request needs `Authorization: Bearer <api key>`. The key is created by
  the shop owner in POS > Settings > SHARK connections > API keys and shown
  once. Bundles: `pos-read` (read only), `pos-operate` (sell, orders, 86,
  shifts), `pos-admin` (adds voids, refunds, custom prices, catalog changes,
  tax invoices).
- A key is bound to one POS system (an `AppSystem` of type `POS`). If it is
  not, send `X-Shark-System: <AppSystem id>` on every call; a header that
  disagrees with the bound system fails with 403 `system_mismatch`.
- Machine readable contract (no key needed): `GET
  https://shark.in.th/api/v1/pos/openapi.json`. Human readable contract with
  field tables and a curl example per operation: `GET
  https://shark.in.th/developers/pos.md`.
- Before calling anything, open `references/endpoints.md` to find the exact
  `METHOD path` and scope, then `references/recipes.md` for worked examples
  of the common jobs.
- Start with `GET /units`: it lists the branches the key works in. Every list
  or create call needs one of those ids as `unitId`.

## Conventions

- Money is always an integer number of satang (1 baht = 100 satang) in every
  field ending in `Satang`. Never send baht or decimals: 65 baht is `6500`.
- Branch: send `unitId` in the query string on GET and in the JSON body on
  every other method. On calls with an id in the path (`/sales/{id}`,
  `/orders/{id}`, ...) `unitId` is optional. A branch, bill or order of another
  POS system or shop answers 404 `not_found`.
- Every write (POST, PATCH, PUT) needs an `Idempotency-Key` header: one new
  value (a UUID) per logical attempt. On a timeout or 5xx, retry with the SAME
  key - you get the original answer and no second bill. A different body with a
  used key fails with 409 `idempotency_conflict`. `POST /sales/quote` writes
  nothing and needs no key.
- How to tell a retry from a first answer: a replay of the same key (within
  24 hours) returns the stored first answer byte for byte with the response
  header `Idempotent-Replayed: true` - so its body still says
  `"duplicated": false`. The `duplicated` field is something else: the POS's
  own dedupe. It is `true` when the POS already held that record and gave it
  back instead of making a new one - for `POST /orders` the same `externalRef`
  on the same channel (whatever the `Idempotency-Key`) or the same key after
  the 24 hour replay window, for `POST /sales` and
  `POST /orders/{id}/pay` the same key arriving after the 24 hour replay
  window. Read the header to detect a replay; read `duplicated` to detect an
  order or bill that already existed.
- Branch on `error.code`, never on message text. `error.message_th` is already
  worded for a Thai shop owner and can be shown as is; `error.hint` names a
  missing scope or the current total.
- Lists: `GET /sales` pages with `page` and `pageSize` (10, 20 or 50) and
  returns `page` next to `data`; `GET /products` pages with `pageSize` and
  `cursor` (send `nextCursor` back). `GET /shifts` is not paged: it returns
  the newest 50 shifts of the branch (send `limit`, at most 200, for more) and
  has no status filter. `GET /orders` returns the orders since the start of
  the Thai business day (`since` reaches back at most 7 days). Other lists
  (`/units`, `/channels`, `/devices`) return everything.
- Reports live under `/reports` (`GET /reports/daily`, `/reports/summary`,
  `/reports/products`, `/reports/payments`, `/reports/channels`, ... - the
  full list with scopes is in `references/endpoints.md`). They take Thai
  business dates `from` and `to` (`YYYY-MM-DD`, inclusive, at most 92 days;
  default the last 7 days). Send `Accept: text/csv` to get the same CSV file as
  the export button.
- Reports and `unitId`: with `unitId` the report covers that one branch. Without
  it the report covers every branch the key may read (all branches of the POS
  system, or only the ones a branch-limited key allows) and the JSON answers
  `"unitId": null` - null means "all permitted branches", not "no branch".
  Send `unitId` when the user asks about one branch.
- The bill detail `GET /sales/{id}` has its money under `data.totals` with
  the `Satang` suffix like every other field (`subtotalSatang`,
  `grandTotalSatang`, `refundedSatang`, ...). CSV reports show money in baht
  with two decimals (`55492.50`), as in the export button file; the daily CSV
  has refund columns (count and amount) as its last two columns. Use the JSON report
  (`*Satang` fields) when you need exact satang.
- Payment methods through the API: `CASH`, `TRANSFER`, `PROMPTPAY`, `CARD`,
  and `PLATFORM` on delivery platform channels only. Gift cards, store credit,
  deposits, member points and coupons are not available here.
- When the shop requires a manager to confirm manual payments (setting
  "manual confirmation needs a manager"), the API takes only `CASH`,
  `TRANSFER` and `PLATFORM` until payment intents come to the API (P3):
  `PROMPTPAY` and `CARD` answer 403 `forbidden` and nothing is sold, with any
  key. Ask the customer for another method or ring it up on the register.
- POST /sales without `shiftId`: when the shop requires a shift for sales
  from other sources, the bill goes into the single open shift of the branch;
  no open shift, or more than one open shift with a CASH payment, answers 409
  `state_conflict` (SHIFT_REQUIRED) and nothing is sold - send the `shiftId`
  of the drawer that takes the cash. When the shop does not require it, the
  bill is recorded outside any shift and the answer says `"outOfShift": true`;
  send the `shiftId` of the open shift to put the cash in that drawer.
- Cash for an order (`POST /orders/{id}/pay`) must land in a shift: the
  branch needs exactly one open shift, otherwise 409 `state_conflict`. Opening
  shifts is done on the register, not here.
- Rate limits per key per minute: 300 reads, 60 writes, 30 reports. On 429
  wait `Retry-After` seconds.

## Selling the right way

1. Find the products (`GET /products?unitId=...`, or
   `GET /products/lookup?unitId=...&barcode=...` for a scanned code).
2. Always quote before you sell: `POST /sales/quote` with the same lines gives
   the exact `grandTotalSatang` the register would charge. Tell the user the
   total.
3. `POST /sales` with the lines, `payMethods` that add up to that total
   exactly, and `expectedGrandTotalSatang` = the quoted total. If prices
   changed in between you get 409 `state_conflict` and nothing is sold: quote
   again and confirm the new total with the user.
4. Read the receipt with `GET /sales/{id}/receipt` when the user wants it.
   The link the customer can open (e-receipt) is `data.footer.qrEReceiptUrl`;
   it is `null` when the shop turned the e-receipt QR off in its receipt
   settings.

## Shifts

- To put cash into the right drawer you need the id of the OPEN shift. Two
  ways, both need `pos.shift.manage` (bundles `pos-operate`, `pos-admin`):
  - `GET /shifts/current?unitId=...&deviceId=...` answers the open shift of
    one register device. `deviceId` is required (the device code from
    `GET /devices`); without it you get 422 `validation`.
  - Without a device: `GET /shifts?unitId=...` and keep the rows with
    `"status": "OPEN"`. There is no `status=OPEN` query filter (an unknown
    query field answers 422 `validation`).
- Opening and closing shifts is done on the register, not through the API.

## Orders

- Put an order in with `POST /orders`: `unitId`, `channelCode` (or
  `channelId`) from `GET /channels`, `fulfilment` (`PICKUP`, `DELIVERY`,
  `DINE_IN`), `lines` (`productId` + `qty`; prices come from the catalog and
  the channel), optional `externalRef` (your or the platform's order number),
  `customer`, `address`, `note`, `prepMinutes`, `paymentState` (`UNPAID` or
  `PAY_ON_PICKUP`, not on platform channels) and `startStatus`.
- Which channels: your own CUSTOM channels (kind `CUSTOM`, adapter `NONE`,
  e.g. a phone line), the delivery platforms (kind `EXTERNAL`, adapter
  `MANUAL`) and `CHAT`. The other built-in channels (`STORE`, `QR_TABLE`,
  `WEB`) refuse orders through the API.
- Start status: without `startStatus`, MANUAL-adapter channels (the platform
  presets LINEMAN, GRAB, FOODPANDA, ...) start `ACCEPTED`, because the order
  was already accepted on the platform tablet; every other channel, CUSTOM
  included, starts `NEW`. Send `"startStatus": "NEW"` to have staff accept it
  on the order screen, or accept it yourself with `POST /orders/{id}/accept`
  when the user says so. Exception: on a non-MANUAL channel the shop set to
  "auto accept", a `NEW` order is accepted at once (unless the kitchen is
  paused or backed up) - read `GET /orders/{id}` to see the real status.
- A `NEW` order carries `acceptBy` = received time + 2 minutes and
  `acceptRemainingSec` (counts down to 0). It is the accept target shown on
  the order screen; nothing is rejected automatically when it passes.
- Then `POST /orders/{id}/preparing`, `/ready`, `/complete`; DIRECT-payout
  channels take the money with `POST /orders/{id}/pay`. Reject a `NEW` order
  with `POST /orders/{id}/reject` and `reasonCode` one of `OUT_OF_STOCK`,
  `CLOSING`, `TOO_BUSY`, `OTHER`.

## Offline sync (apps and kiosks)

- `POST /sync/sales` is only for an external app or kiosk that sold bills
  while it had no internet and now sends them up (at most 50 bills per call,
  processed in sold time order). The shop's own register syncs by itself; do
  not use this to ring up a normal sale - use `POST /sales`.
- It needs `pos.offline.sync` (bundle `pos-admin`) and a shop that turned
  offline selling on; otherwise 409 `state_conflict` and nothing is written.
- Send `unitId`, the register `deviceId` (device code from `GET /devices`) and
  `items`: per bill the temporary number the device printed (`offlineRef`),
  the bill key it made when it sold (`idempotencyKey`), `soldAt`, the price
  snapshot hash and the bill body as for `POST /sales`. Each bill answers `OK`
  (new bill), `DUPLICATE` (already synced) or `REJECTED` with a reason; a
  rejected bill waits for a manager on the Shifts screen. Never re-send a
  rejected bill under a new key.

## Safety

- Never void, refund or cancel anything unless the user says so explicitly
  for that bill or order. Read it first (`GET /sales/{id}` or
  `GET /orders/{id}`), say what will happen and the amount, and wait for a yes.
- Danger operations (`POST /sales/{id}/void`, `POST /sales/{id}/refund`,
  `POST /products/{id}/archive`, `POST /orders/{id}/cancel`) need
  `"confirm": true` and a `reason` of at least 5 characters in the body. Put
  the user's own words in `reason`; it is kept in the audit log.
- A bill that already has refunds cannot be voided: refund the rest instead.
- Refund lines are chosen by line id, and line ids come only from
  `GET /sales/{id}/refundable` (it also shows what is left per line). That read
  needs `pos.sale.refund`, the same scope as the refund itself (bundle
  `pos-admin`); `GET /sales/{id}` does not show line ids.
- `reasonCode` of a refund is one of `DAMAGED`, `WRONG_ITEM`, `CHANGED_MIND`,
  `OTHER` (default `OTHER`); the free text goes in `reason`.
- Never ask for PINs, passwords or card numbers. Staff and manager PINs do
  not exist in this API on purpose; if a task needs them, tell the user to do
  it on the register.
- A void or refund over the shop rule waits for approval in the app: you get
  409 `state_conflict` and the approval request id in `error.hint`, and
  nothing is voided or refunded yet. Tell the user it waits for a manager; do
  not retry with a new key (the same key replays the same answer).
- Do not retry a 4xx with a new `Idempotency-Key` hoping for a different
  result; read `error.code` and fix the request. Only 409
  `idempotency_outcome_unknown` asks for a new key, after you checked that the
  record does not exist yet.
- Custom prices (lines with `name` and `unitPriceSatang` instead of
  `productId`) need `pos.sale.priceOverride`; do not invent prices - use the
  catalog unless the user gives the price.
- A cart of custom lines only is refused (422 `validation`) in a shop that
  adds a service charge, because the payments must equal the lines exactly;
  add a catalog line (`productId`) and quote the cart instead.

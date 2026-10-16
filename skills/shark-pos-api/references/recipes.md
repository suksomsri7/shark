# SHARK POS API - recipes

Worked examples of the common jobs. Every block is one `curl` call that runs
as is in bash after you `export` the variables it uses:

- `SHARK_API_KEY` - the API key (bundle `pos-admin` for every recipe below;
  `pos-operate` is enough for all but the two refund recipes).
- `UNIT_ID` - a branch from `GET /units`.
- `PRODUCT_ID`, `SALE_ID`, `LINE_ID`, `ORDER_ID` - ids you read from earlier
  answers (`LINE_ID` comes from the refundable lines of a bill).
- `CHANNEL_CODE` - the `code` of a sales channel from `GET /channels`.
- `FROM` / `TO` - Thai business dates `YYYY-MM-DD`.

For example:

```bash
export SHARK_API_KEY="shark_..." UNIT_ID="..." PRODUCT_ID="..."
```

JSON bodies are written in double quotes with `\"` around every JSON string,
so the shell fills in `$UNIT_ID` and the other variables. Keep it that way:
inside single quotes (`-d '{"unitId":"$UNIT_ID"}'`) the shell sends the text
`$UNIT_ID` itself and the call fails. `$(uuidgen)` makes a fresh
`Idempotency-Key`; on a retry of the same call send the value you used before.

The numbers below assume a product priced 45 baht (`4500` satang, VAT
included). Each recipe ends with the error you get when one thing is wrong, so
you know which `error.code` to branch on.

## List the branches of the key

```bash
curl -sS "https://shark.in.th/api/v1/pos/units" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

`data` is an array of `{ id, name, type }`. Use `id` as `unitId` everywhere.

Error branch: `401 unauthorized` (no or wrong `Authorization` header).

## Quote a cart (no bill is made)

```bash
curl -sS -X POST "https://shark.in.th/api/v1/pos/sales/quote" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"unitId\":\"$UNIT_ID\",\"lines\":[{\"productId\":\"$PRODUCT_ID\",\"qty\":2}]}"
```

`data.grandTotalSatang` is what the register would charge (here `9000`).
Show it to the user before selling.

Error branch: `422 validation` (an unknown field or a malformed line; see `error.details`).

## Find the open shift of a branch

```bash
curl -sS "https://shark.in.th/api/v1/pos/shifts?unitId=$UNIT_ID" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

`data` lists the newest 50 shifts of the branch (add `&limit=200` for more),
newest first. Keep the rows with `"status": "OPEN"`; there is no status filter
in the query. Its `id` is the `shiftId` to send with a cash sale. With a
register device code from `GET /devices` you can ask for that device's open
shift directly: `GET /shifts/current?unitId=...&deviceId=...` (`deviceId` is
required there). No open shift = shifts are opened on the register, not here.

Error branch: `404 not_found` (the branch is not one of the key's branches).

## Sell (cash, exact amount)

```bash
curl -sS -X POST "https://shark.in.th/api/v1/pos/sales" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d "{\"unitId\":\"$UNIT_ID\",\"lines\":[{\"productId\":\"$PRODUCT_ID\",\"qty\":1}],\"payMethods\":[{\"type\":\"CASH\",\"amountSatang\":4500}],\"cashReceivedSatang\":4500,\"expectedGrandTotalSatang\":4500}"
```

`data` is `{ saleId, receiptNo, grandTotalSatang, changeSatang, duplicated }`.
Add `\"shiftId\":\"...\"` (the open shift above) to put the cash in that
drawer; without it the shop's rule for sales from other sources decides. On a
timeout, send the very same request with the same `Idempotency-Key`: you get
the same bill back with the header `Idempotent-Replayed: true` (the body is
the first answer, so it still says `"duplicated": false`), never a second
bill.

Error branch: `400 idempotency_required` (the `Idempotency-Key` header is missing).

## Find today's bills of a branch

```bash
curl -sS "https://shark.in.th/api/v1/pos/sales?unitId=$UNIT_ID&pageSize=20" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

`data` lists the bills of today (add `date=YYYY-MM-DD` for another day),
newest first; `page` tells you whether there are more; `summary` holds the day
totals. `GET /sales/$SALE_ID` reads one bill; its money is under
`data.totals` (`subtotalSatang`, `grandTotalSatang`, `refundedSatang`, ...),
integer satang.

Error branch: `404 not_found` (the branch is not one of the key's branches).

## Get the receipt of a bill

```bash
curl -sS "https://shark.in.th/api/v1/pos/sales/$SALE_ID/receipt?unitId=$UNIT_ID" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

`data` is the original receipt (shop header, lines, VAT, payments, footer).
The link to send the customer is `data.footer.qrEReceiptUrl` (`null` when the
shop switched the e-receipt QR off).

Error branch: `404 not_found` (no such bill in this POS system).

## See what is left to refund on a bill

```bash
curl -sS "https://shark.in.th/api/v1/pos/sales/$SALE_ID/refundable?unitId=$UNIT_ID" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

`data.lines` lists every line of the bill with its `lineId`, net amount,
quantity already refunded and quantity left; `data.sale.refundable` says
whether the bill can be refunded at all. This is the only place that shows
line ids, and it needs `pos.sale.refund` (bundle `pos-admin`).

Error branch: `403 scope_missing` (the key has no `pos.sale.refund`; `error.hint` names it).

## Refund part of a bill

```bash
curl -sS -X POST "https://shark.in.th/api/v1/pos/sales/$SALE_ID/refund" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d "{\"confirm\":true,\"reason\":\"customer returned one item\",\"reasonCode\":\"CHANGED_MIND\",\"lines\":[{\"lineId\":\"$LINE_ID\",\"qty\":1}],\"payMethods\":[{\"type\":\"CASH\",\"amountSatang\":4500}]}"
```

Only after the user's explicit yes for this bill and amount. `LINE_ID` is a
`lineId` from the refundable lines above. `reasonCode` is one of `DAMAGED`,
`WRONG_ITEM`, `CHANGED_MIND`, `OTHER` (default `OTHER`). `data.refund` is the
refund document (credit note); `data.sale` shows the bill's new refunded
total. The refund payments must add up to the refund amount exactly.

Error branch: `409 confirm_required` (`"confirm": true` is missing - ask the user first).

## Put an order into your own channel (phone, custom app)

```bash
curl -sS -X POST "https://shark.in.th/api/v1/pos/orders" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d "{\"unitId\":\"$UNIT_ID\",\"channelCode\":\"$CHANNEL_CODE\",\"externalRef\":\"PHONE-1001\",\"fulfilment\":\"PICKUP\",\"startStatus\":\"NEW\",\"paymentState\":\"PAY_ON_PICKUP\",\"lines\":[{\"productId\":\"$PRODUCT_ID\",\"qty\":1}],\"customer\":{\"name\":\"Khun Somchai\"},\"note\":\"pick up at 12:30\"}"
```

`CHANNEL_CODE` is a CUSTOM channel of the branch (kind `CUSTOM` in
`GET /channels`). `data` is `{ orderId, duplicated, saleId }`; the order is
`NEW` and waits to be accepted (`acceptBy` = received + 2 minutes, a target
shown on the order screen, not an automatic reject). Without `startStatus` a
CUSTOM channel starts `NEW` too, while MANUAL-adapter platform channels
(LINEMAN, GRAB, ...) start `ACCEPTED`. `fulfilment` is `PICKUP`, `DELIVERY` or
`DINE_IN`; `paymentState` is `UNPAID` or `PAY_ON_PICKUP` (leave it out on
platform channels). Sending the same `externalRef` on the same channel again
returns the first order with `"duplicated": true` instead of a second order.

Error branch: `422 validation` (an unknown field, a bad `fulfilment` or an empty `lines`).

## Accept an online or platform order

```bash
curl -sS -X POST "https://shark.in.th/api/v1/pos/orders/$ORDER_ID/accept" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d "{}"
```

`data.order` is the order card (`status` now `ACCEPTED`, `prepDueAt` set). On
a delivery platform channel the bill is opened now (`data.saleId`). Then move
it on with `/preparing`, `/ready` and `/complete`; on a DIRECT channel take
the money with `/pay`.

Error branch: `404 not_found` (no such order in this POS system).

## Mark a product sold out (86)

```bash
curl -sS -X POST "https://shark.in.th/api/v1/pos/products/$PRODUCT_ID/availability" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d "{\"unitId\":\"$UNIT_ID\",\"available\":false}"
```

The register, kitchen screens and channels stop selling it at that branch.
Send `"available": true` to put it back on sale.

Error branch: `403 system_mismatch` (`X-Shark-System` names another POS system than the key's).

## Daily sales report as CSV

```bash
curl -sS "https://shark.in.th/api/v1/pos/reports/daily?unitId=$UNIT_ID&from=$FROM&to=$TO" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Accept: text/csv"
```

The answer is `text/csv` with a UTF-8 BOM (opens in Excel with Thai text
intact): one row per Thai business day plus a total row, money in baht with
two decimals. Leave out `unitId` for every branch the key may read (the JSON
then says `"unitId": null`). Drop the `Accept` header to get the same report
as JSON (`data.rows`, `data.totals`, money as `*Satang` integers).

Error branch: `403 scope_missing` (the key has no `pos.report.view`; `error.hint` names it).

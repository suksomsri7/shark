# P2.13 — CONTROLLER-RUN agent skill test (15 Oct 2026 · QC5 build85 @f95348ac · key pos-admin filtered to silom, revoked after) — transcript verbatim

# P2.13 agent transcript (skill shark-pos-api, server http://127.0.0.1:3228)
### R1 — List units
```
curl -X GET 'http://127.0.0.1:3228/api/v1/pos/units' -H 'Authorization: Bearer $KEY'  
→ HTTP/1.1 200 OK
content-type: application/json; charset=utf-8
x-request-id: req_63aebc5556fa090a
{
    "data": [
        {
            "id": "posqc-coffee-unit-silom",
            "name": "สาขาสีลม",
            "type": "SHOP"
        }
    ],
    "requestId": "req_63aebc5556fa090a"
}
```

### R2 — Task1: list products
```
curl -X GET 'http://127.0.0.1:3228/api/v1/pos/products?unitId=posqc-coffee-unit-silom&pageSize=20' -H 'Authorization: Bearer $KEY'  
→ HTTP/1.1 200 OK
content-type: application/json; charset=utf-8
x-request-id: req_7de9a3cb231a279a
{
    "data": [
        {
            "id": "cc97e348-8804-47a0-9732-552552ac6698",
            "invItemId": "cmup770ju002o7pkzuycm2dr3",
            "unitId": null,
            "name": "ครัวซองต์เนยสด",
            "nameEn": null,
            "kind": "PRODUCT",
            "categoryId": null,
            "basePriceSatang": 5500,
            "vatRateBp": 700,
            "barcode": null,
            "sku": "PQC-CF-CROIS",
            "trackStock": true,
            "trackStockMode": "auto",
            "images": [],
            "optionGroups": [],
            "variants": [],
            "parentId": null,
```

### R3 — Task1: quote latte+americano
```
curl -X POST 'http://127.0.0.1:3228/api/v1/pos/sales/quote' -H 'Authorization: Bearer $KEY' -H 'Content-Type: application/json' -d '{"unitId":"posqc-coffee-unit-silom","lines":[{"productId":"3cc4e996-bccf-4a9c-af84-21a4eb2e8a44","qty":1},{"productId":"c5ab7c70-19ee-4318-ade0-1f73992d07f1","qty":1}]}' 
→ HTTP/1.1 200 OK
content-type: application/json; charset=utf-8
x-request-id: req_e3754fb5b2fdee34
{
    "data": {
        "subtotalSatang": 12500,
        "lineDiscountSatang": 0,
        "billDiscountSatang": 0,
        "couponDiscountSatang": 0,
        "netSatang": 12500,
        "serviceChargeSatang": 0,
        "vatSatang": 818,
        "grandTotalSatang": 12500,
        "lines": [
            {
                "productId": "3cc4e996-bccf-4a9c-af84-21a4eb2e8a44",
                "unitPriceSatang": 6000,
                "grossSatang": 6000,
                "discountSatang": 0,
                "lineTotalSatang": 6000,
                "optionsSatang": 0,
                "options": [],
                "weightGrams": null,
```

### R4 — Task1: current shift (to decide shiftId)
```
curl -X GET 'http://127.0.0.1:3228/api/v1/pos/shifts/current?unitId=posqc-coffee-unit-silom' -H 'Authorization: Bearer $KEY'  
→ HTTP/1.1 422 Unprocessable Entity
content-type: application/json; charset=utf-8
x-request-id: req_18db272a5359f1fa
{
    "error": {
        "code": "validation",
        "message_th": "ข้อมูลที่ส่งมาไม่ถูกต้องตามรูปแบบที่กำหนด",
        "message_en": "Request payload failed validation.",
        "details": [
            {
                "path": "deviceId",
                "message": "Invalid input: expected string, received undefined"
            }
        ]
    },
    "requestId": "req_18db272a5359f1fa"
}
```

### R5 — Task1: list shifts (fallback, current needs deviceId)
```
curl -X GET 'http://127.0.0.1:3228/api/v1/pos/shifts?unitId=posqc-coffee-unit-silom' -H 'Authorization: Bearer $KEY'  
→ HTTP/1.1 200 OK
content-type: application/json; charset=utf-8
x-request-id: req_be64ae622140f7c1
{
    "data": [
        {
            "id": "cmv9rd85p000aknkzn910q5hk",
            "shiftNo": 181,
            "status": "CLOSED",
            "unitId": "posqc-coffee-unit-silom",
            "deviceId": "posqc-vis-p210-471191",
            "deviceLabel": "เคาน์เตอร์ 1",
            "openedByUserId": "posqc-coffee-user-owner",
            "openedAt": "2026-10-15T16:33:44.845Z",
            "floatSatang": 0,
            "closedByUserId": "posqc-coffee-user-owner",
            "closedAt": "2026-10-15T16:34:14.239Z",
            "zNumber": 179,
            "expectedCashSatang": 62500,
            "countedCashSatang": 62500,
            "overShortSatang": 0,
            "recount": null
        },
```

### R6 — Task1: sell (CASH) Idempotency-Key=75637a4e-9f5e-427b-b087-253053290bb4
```
curl -X POST 'http://127.0.0.1:3228/api/v1/pos/sales' -H 'Authorization: Bearer $KEY' -H 'Content-Type: application/json' -d '{"unitId":"posqc-coffee-unit-silom","lines":[{"productId":"3cc4e996-bccf-4a9c-af84-21a4eb2e8a44","qty":1},{"productId":"c5ab7c70-19ee-4318-ade0-1f73992d07f1","qty":1}],"payMethods":[{"type":"CASH","amountSatang":12500}],"cashReceivedSatang":12500,"expectedGrandTotalSatang":12500}' -H Idempotency-Key: 75637a4e-9f5e-427b-b087-253053290bb4
→ HTTP/1.1 200 OK
content-type: application/json; charset=utf-8
x-request-id: req_6adbf3c657095a7e
{
    "data": {
        "saleId": "cmva6funz000298kz7l9bx58s",
        "receiptNo": "202610-0552",
        "grandTotalSatang": 12500,
        "changeSatang": 0,
        "duplicated": false
    },
    "requestId": "req_6adbf3c657095a7e"
}
```

### R7 — Task1: replay same request, same key 75637a4e-9f5e-427b-b087-253053290bb4
```
curl -X POST 'http://127.0.0.1:3228/api/v1/pos/sales' -H 'Authorization: Bearer $KEY' -H 'Content-Type: application/json' -d '{"unitId":"posqc-coffee-unit-silom","lines":[{"productId":"3cc4e996-bccf-4a9c-af84-21a4eb2e8a44","qty":1},{"productId":"c5ab7c70-19ee-4318-ade0-1f73992d07f1","qty":1}],"payMethods":[{"type":"CASH","amountSatang":12500}],"cashReceivedSatang":12500,"expectedGrandTotalSatang":12500}' -H Idempotency-Key: 75637a4e-9f5e-427b-b087-253053290bb4
→ HTTP/1.1 200 OK
content-type: application/json; charset=utf-8
idempotent-replayed: true
x-request-id: req_6adbf3c657095a7e
{
    "data": {
        "saleId": "cmva6funz000298kz7l9bx58s",
        "receiptNo": "202610-0552",
        "duplicated": false,
        "changeSatang": 0,
        "grandTotalSatang": 12500
    },
    "requestId": "req_6adbf3c657095a7e"
}
```

### R8 — Task2: today's bills
```
curl -X GET 'http://127.0.0.1:3228/api/v1/pos/sales?unitId=posqc-coffee-unit-silom&pageSize=20' -H 'Authorization: Bearer $KEY'  
→ HTTP/1.1 200 OK
content-type: application/json; charset=utf-8
x-request-id: req_7dab195edf65f995
{
    "data": [
        {
            "id": "cmva6funz000298kz7l9bx58s",
            "receiptNo": "202610-0552",
            "time": "2026-10-15T23:35:41.565Z",
            "sourceModule": "API",
            "customer": null,
            "payMethods": "CASH",
            "staffName": "-",
            "grandTotalSatang": 12500,
            "refundedSatang": 0,
            "status": "PAID",
            "offShiftCash": true,
            "refunds": [],
            "salesChannel": {
                "code": "STORE",
                "name": "หน้าร้าน"
            },
            "channelRef": null
```

### R9 — Task2: bill detail
```
curl -X GET 'http://127.0.0.1:3228/api/v1/pos/sales/cmva6funz000298kz7l9bx58s?unitId=posqc-coffee-unit-silom' -H 'Authorization: Bearer $KEY'  
→ HTTP/1.1 200 OK
content-type: application/json; charset=utf-8
x-request-id: req_3ae5c29ab47e7317
{
    "data": {
        "id": "cmva6funz000298kz7l9bx58s",
        "receiptNo": "202610-0552",
        "status": "PAID",
        "docType": "SALE",
        "time": "2026-10-15T23:35:41.565Z",
        "staffName": "-",
        "deviceName": null,
        "shiftNo": null,
        "sourceModule": "API",
        "lines": [
            {
                "name": "ลาเต้ร้อน",
                "qty": 1,
                "unitPriceSatang": 6000,
                "discountSatang": 0,
                "lineTotalSatang": 6000,
                "options": [],
                "priceSource": "BASE",
```

### R10 — Task2: receipt
```
curl -X GET 'http://127.0.0.1:3228/api/v1/pos/sales/cmva6funz000298kz7l9bx58s/receipt?unitId=posqc-coffee-unit-silom' -H 'Authorization: Bearer $KEY'  
→ HTTP/1.1 200 OK
content-type: application/json; charset=utf-8
x-request-id: req_186ee8514996d301
{
    "data": {
        "docType": "SALE",
        "kind": "TAX_INVOICE_ABB",
        "status": "PAID",
        "copy": false,
        "paper": null,
        "shop": {
            "name": "ร้านกาแฟคิวซี (POS QC)",
            "branchName": "สาขาสีลม",
            "address": "",
            "phone": "",
            "taxId": "0105561234567",
            "branchNo": "00000"
        },
        "device": {},
        "doc": {
            "receiptNo": "202610-0552",
            "issuedAt": "2026-10-15T23:35:41.565Z"
        },
```

### R11 — Task3: refundable
```
curl -X GET 'http://127.0.0.1:3228/api/v1/pos/sales/cmva6funz000298kz7l9bx58s/refundable?unitId=posqc-coffee-unit-silom' -H 'Authorization: Bearer $KEY'  
→ HTTP/1.1 200 OK
content-type: application/json; charset=utf-8
x-request-id: req_d99738f34a9d839d
{
    "data": {
        "sale": {
            "id": "cmva6funz000298kz7l9bx58s",
            "receiptNo": "202610-0552",
            "status": "PAID",
            "sourceModule": "API",
            "createdAt": "2026-10-15T23:35:41.567Z",
            "grandTotalSatang": 12500,
            "refundedSatang": 0,
            "serviceChargeSatang": 0,
            "serviceChargeRefundedSatang": 0,
            "tipSatang": 0,
            "vatSatang": 818,
            "netTotalSatang": 12500,
            "shiftId": null,
            "refundable": true,
            "notRefundableCode": null
        },
        "lines": [
```

### R12 — Task3: partial refund latte line, CASH 6000, key 48fdaf9b-43c3-44b0-a67d-af0ec4011598
```
curl -X POST 'http://127.0.0.1:3228/api/v1/pos/sales/cmva6funz000298kz7l9bx58s/refund' -H 'Authorization: Bearer $KEY' -H 'Content-Type: application/json' -d '{"confirm":true,"reason":"P2.13 test: customer returned the hot latte","reasonCode":"CHANGED_MIND","lines":[{"lineId":"cmva6fuof000398kzn01qq5uj","qty":1}],"payMethods":[{"type":"CASH","amountSatang":6000}]}' -H Idempotency-Key: 48fdaf9b-43c3-44b0-a67d-af0ec4011598
→ HTTP/1.1 200 OK
content-type: application/json; charset=utf-8
x-request-id: req_ce71242c7c1d1201
{
    "data": {
        "refund": {
            "id": "cmva6gh4g000n98kz47qua4m6",
            "receiptNo": "CN202610-0070",
            "saleId": "cmva6funz000298kz7l9bx58s",
            "status": "PAID",
            "subtotalSatang": 6000,
            "serviceChargeSatang": 0,
            "vatSatang": 393,
            "grandTotalSatang": 6000,
            "reasonCode": "CHANGED_MIND",
            "reason": "P2.13 test: customer returned the hot latte",
            "shiftId": null,
            "soldByUserId": "cmva6dusy0000eukz1nrzun7n",
            "createdAt": "2026-10-15T23:36:10.672Z",
            "lines": [
                {
                    "id": "cmva6gh4r000o98kzzn265i1t",
                    "refLineId": "cmva6fuof000398kzn01qq5uj",
```

### R13 — Task4: list channels
```
curl -X GET 'http://127.0.0.1:3228/api/v1/pos/channels?unitId=posqc-coffee-unit-silom' -H 'Authorization: Bearer $KEY'  
→ HTTP/1.1 200 OK
content-type: application/json; charset=utf-8
x-request-id: req_2d39f7b470b65abd
{
    "data": [
        {
            "id": "cmv125pm906h0r6kzvigrmz9i",
            "code": "STORE",
            "kind": "BUILTIN",
            "name": "หน้าร้าน",
            "adapter": "NONE",
            "active": true,
            "payout": "DIRECT",
            "commissionBp": 0,
            "commissionFixedSatang": 0,
            "commissionVatBp": 0,
            "sortOrder": 0,
            "archived": false
        },
        {
            "id": "cmv125pm906h1r6kzd9icfmu3",
            "code": "QR_TABLE",
            "kind": "BUILTIN",
```

### R14 — Task4: openapi.json (find POST /orders body)
```
curl -X GET 'http://127.0.0.1:3228/api/v1/pos/openapi.json' -H 'Authorization: Bearer $KEY'  
→ HTTP/1.1 200 OK
content-type: application/json; charset=utf-8
{
    "openapi": "3.1.0",
    "info": {
        "title": "SHARK POS API",
        "version": "1.0.0",
        "description": "REST API for the SHARK point of sale (POS). One API key works inside one POS system (AppSystem of type POS) and its branches (business units). It sells, refunds and voids bills exactly like the register screen does, takes and progresses online orders, manages the catalog and reads every sales report.\n\nConventions that apply to every operation:\n1. Authentication is `Authorization: Bearer <api key>`. The key carries its own scopes (the POS permission keys, e.g. `pos.sale.create`); an operation returns 403 `scope_missing` when the key lacks the scope listed as `x-shark-scope` (the missing scope is in `hint`). Bundles: `pos-read`, `pos-operate`, `pos-admin`.\n2. `X-Shark-System` selects the POS system and is only needed when the key is not bound to one; if the key is bound and the header disagrees, the call fails with 403 `system_mismatch`.\n3. Branches: every list and create operation takes `unitId` (query string on GET, body otherwise). List them with `GET /units`. On operations with an `{id}` in the path `unitId` is optional - the record's own branch is used, and a different branch answers 404. A branch of another POS system or another shop answers 404 `not_found`, never 403. A key may be limited to some branches by the pseudo-scope `pos.filter.unit:<unitId>`.\n4. Money is an integer number of satang (1 baht = 100 satang) in every field ending in `Satang`. Prices include VAT the way the shop is set up; VAT is computed per bill (rounded half up), never per line.\n5. Selling: price the cart with `POST /sales/quote`, show `grandTotalSatang` to the customer, then `POST /sales` with the same lines, the payments and `expectedGrandTotalSatang`. Payments must add up to the bill total exactly (422 `validation` otherwise). If prices changed in between the sale is refused with 409 `state_conflict` and nothing is written; quote again. Payment methods: CASH, TRANSFER, PROMPTPAY, CARD and PLATFORM (platform channels only). Gift cards, store credit, deposits, member points and coupons are not available through the API. When the shop requires a manager to confirm PROMPTPAY and CARD payments (setting manualConfirmRequiresManager), the API takes only CASH, TRANSFER and PLATFORM: PROMPTPAY and CARD answer 403 `forbidden` with nothing written, until payment intents come to the API. A cart of custom lines only (`name` + `unitPriceSatang`, no `productId`) is checked as is: payments must equal the sum of qty x unitPriceSatang, so in a shop that adds a service charge it is refused with 422 `validation`; add a catalog line (`productId`) and quote the cart instead.\n6. Every write (POST, PATCH, PUT, DELETE) requires an `Idempotency-Key` header, except `POST /sales/quote` which writes nothing. Retrying with the same key and the same body replays the stored response with header `Idempotent-Replayed: true`; the same key with a different body fails with 409 `idempotency_conflict`. The POS also remembers the key per API key after the 24 hour replay window, so a late retry of a sale still returns the same bill instead of selling twice.\n7. Operations marked `x-shark-kind: danger` are hard to undo (void a bill, refund, archive a product, cancel an order). They additionally require `confirm: true` (a real boolean) and a `reason` of at least 5 characters in the body; the reason is stored in the audit log. An agent must ask a human before calling them. A void or refund that falls under the shop's approval rule is not done: it answers 409 `state_conflict` with the approval request id in `hint`, and the request waits for a manager in the app. Retrying with the same key replays that answer; do not retry with a new key.\n8. Success is `{ data, page?, requestId }`. For reads, `data` is the POS reader's answer itself (for example `GET /sales/{id}` answers the bill). Failure is `{ error: { code, message_th, message_en, hint?, details? }, requestId }` - branch on `error.code`; `message_th` is already worded for a Thai shop owner. `requestId` is also returned in the `X-Request-Id` header; quote it when reporting a problem.\n9. Dates: report ranges are Thai business dates `YYYY-MM-DD` (`from`, `to`, inclusive, at most 92 days; the shop's day cut-off applies). Timestamps are ISO-8601 strings in UTC.\n10. Paging: `GET /sales` pages with `page` and `pageSize` (10, 20 or 50) and answers `page` next to `data`; `GET /products` pages with `pageSize` and `cursor` (send `nextCursor` back). Other lists return the whole set.\n11. Rate limits are per key and per class: 300 reads, 60 writes and 30 reports per minute (namespace pos, separate from other SHARK modules). A 429 response carries `Retry-After`; successful responses carry `X-RateLimit-Limit` and `X-RateLimit-Remaining`.\n12. Reports render CSV with `Accept: text/csv`: `text/csv; charset=utf-8` with a UTF-8 BOM and `Content-Disposition: attachment`, the same file as the export button of the reports screen.\n13. Outgoing webhooks. The shop can subscribe an endpoint to these POS events: `pos.sale.paid`, `pos.sale.voided`, `pos.shift.opened`, `pos.shift.closed`, `pos.stockCount.confirmed`, `pos.sale.refunded`, `pos.payment.intent_paid`, `pos.sale.taxInvoiceIssued`, `pos.order.received`, `pos.order.accepted`, `pos.order.rejected`, `pos.order.ready`, `pos.order.completed`, `pos.order.cancelled`, `pos.product.availability`. Each delivery is `POST` with `X-Shark-Event`, a body of `{ id, type, payload, sentAt }` and header `X-Shark-Signature` = HMAC-SHA256 of the raw body with the endpoint secret, lowercase hex. Delivery is at least once, so handlers must be idempotent (`id` stays the same on every retry).\n14. Bills sold through the API are bills of the POS: they carry `sourceModule: \"API\"` and the key id as seller, follow the shop's shift rule for sales from other sources (or the OPEN shift given as `shiftId`), and appear in every report. Cash taken for an order (`POST /orders/{id}/pay`) always lands in a shift: the branch must have exactly one open shift, otherwise 409 `state_conflict` and nothing is written."
    },
    "servers": [
        {
            "url": "https://shark.in.th/api/v1/pos",
            "description": "Production"
        }
    ],
    "security": [
        {
            "bearer": []
        }
    ],
    "components": {
        "securitySchemes": {
```

### R15 — Task4: create order on custom channel QCPHONE, key c3645591-43a9-465a-938e-7b96fafb07cd
```
curl -X POST 'http://127.0.0.1:3228/api/v1/pos/orders' -H 'Authorization: Bearer $KEY' -H 'Content-Type: application/json' -d '{"unitId":"posqc-coffee-unit-silom","channelCode":"QCPHONE","externalRef":"P213-PHONE-001","fulfilment":"PICKUP","startStatus":"NEW","paymentState":"PAY_ON_PICKUP","lines":[{"productId":"c5ab7c70-19ee-4318-ade0-1f73992d07f1","qty":2}],"customer":{"name":"P2.13 test caller"},"note":"phone order test"}' -H Idempotency-Key: c3645591-43a9-465a-938e-7b96fafb07cd
→ HTTP/1.1 200 OK
content-type: application/json; charset=utf-8
x-request-id: req_aa721495e890781e
{
    "data": {
        "orderId": "cmva6gy7s001098kzmw2j1rrl",
        "duplicated": false,
        "saleId": null
    },
    "requestId": "req_aa721495e890781e"
}
```

### R16 — Task4: read order before accept
```
curl -X GET 'http://127.0.0.1:3228/api/v1/pos/orders/cmva6gy7s001098kzmw2j1rrl' -H 'Authorization: Bearer $KEY'  
→ HTTP/1.1 200 OK
content-type: application/json; charset=utf-8
x-request-id: req_c9e9cb0190a5a250
{
    "data": {
        "id": "cmva6gy7s001098kzmw2j1rrl",
        "channel": {
            "id": "cmv2dyu4g00012dkzm6yy0y0g",
            "code": "QCPHONE",
            "name": "โทรสั่ง (ภาพ QC)",
            "payout": "DIRECT",
            "adapter": "NONE"
        },
        "ref": "P213-PHONE-001",
        "code": "OD-0001",
        "externalRef": "P213-PHONE-001",
        "status": "NEW",
        "paymentState": "PAY_ON_PICKUP",
        "itemCount": 1,
        "qtyCount": 2,
        "totalSatang": 13000,
        "customerName": "P2.13 test caller",
        "phoneMasked": null,
```

### R17 — Task4: accept order, key 0a494a79-62a6-4596-8e8f-bbbf5614f9d2
```
curl -X POST 'http://127.0.0.1:3228/api/v1/pos/orders/cmva6gy7s001098kzmw2j1rrl/accept' -H 'Authorization: Bearer $KEY' -H 'Content-Type: application/json' -d '{}' -H Idempotency-Key: 0a494a79-62a6-4596-8e8f-bbbf5614f9d2
→ HTTP/1.1 200 OK
content-type: application/json; charset=utf-8
x-request-id: req_b5eb092540f7860e
{
    "data": {
        "order": {
            "id": "cmva6gy7s001098kzmw2j1rrl",
            "channel": {
                "id": "cmv2dyu4g00012dkzm6yy0y0g",
                "code": "QCPHONE",
                "name": "โทรสั่ง (ภาพ QC)",
                "payout": "DIRECT",
                "adapter": "NONE"
            },
            "ref": "P213-PHONE-001",
            "code": "OD-0001",
            "externalRef": "P213-PHONE-001",
            "status": "ACCEPTED",
            "paymentState": "PAY_ON_PICKUP",
            "itemCount": 1,
            "qtyCount": 2,
            "totalSatang": 13000,
            "customerName": "P2.13 test caller",
```

### R18 — Task5: daily CSV 7 days (recipe as written, no unitId)
```
curl -X GET 'http://127.0.0.1:3228/api/v1/pos/reports/daily?from=2026-10-10&to=2026-10-16' -H 'Authorization: Bearer $KEY'  -H Accept: text/csv
→ HTTP/1.1 200 OK
content-type: text/csv; charset=utf-8
x-request-id: req_216d6570c6569bf9
﻿วันที่,จำนวนบิล,ยอดก่อนส่วนลด,ส่วนลด,ค่าบริการ,ยอดขายสุทธิ,VAT,ยอดก่อน VAT,ทิป,บิลยกเลิก,ยอดบิลยกเลิก,เฉลี่ยต่อบิล
2026-10-10,266,55492.50,20.00,0.00,55472.50,3628.94,51843.56,0.00,16,1895.00,208.54
2026-10-11,0,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0,0.00,0.00
2026-10-12,0,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0,0.00,0.00
2026-10-13,0,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0,0.00,0.00
2026-10-14,3,375.00,0.00,0.00,375.00,24.54,350.46,0.00,13,715.00,125.00
2026-10-15,46,17874.00,350.00,186.00,17710.00,512.34,17197.66,0.00,0,0.00,385.00
2026-10-16,4,595.00,80.00,0.00,515.00,33.68,481.32,0.00,2,120.00,128.75
รวม,319,74336.50,450.00,186.00,74072.50,4199.50,69873.00,0.00,31,2730.00,232.20```

### R19 — Task5 check: same report as JSON (is it branch-scoped?)
```
curl -X GET 'http://127.0.0.1:3228/api/v1/pos/reports/daily?from=2026-10-10&to=2026-10-16' -H 'Authorization: Bearer $KEY'  
→ HTTP/1.1 200 OK
content-type: application/json; charset=utf-8
x-request-id: req_1776b085c57cf7b1
{
    "data": {
        "kind": "daily",
        "from": "2026-10-10",
        "to": "2026-10-16",
        "unitId": null,
        "generatedAt": "2026-10-15T23:36:54.796Z",
        "rows": [
            {
                "businessDate": "2026-10-10",
                "billCount": 266,
                "grossSatang": 5549250,
                "discountSatang": 2000,
                "serviceChargeSatang": 0,
                "netSalesSatang": 5547250,
                "vatSatang": 362894,
                "netExVatSatang": 5184356,
                "tipSatang": 0,
                "voidCount": 16,
                "voidTotalSatang": 189500,
```

### R20 — Task5 check: same JSON report with unitId
```
curl -X GET 'http://127.0.0.1:3228/api/v1/pos/reports/daily?from=2026-10-10&to=2026-10-16&unitId=posqc-coffee-unit-silom' -H 'Authorization: Bearer $KEY'  
→ HTTP/1.1 200 OK
content-type: application/json; charset=utf-8
x-request-id: req_4b5aaa09adccb4d1
{
    "data": {
        "kind": "daily",
        "from": "2026-10-10",
        "to": "2026-10-16",
        "unitId": "posqc-coffee-unit-silom",
        "generatedAt": "2026-10-15T23:37:02.542Z",
        "rows": [
            {
                "businessDate": "2026-10-10",
                "billCount": 266,
                "grossSatang": 5549250,
                "discountSatang": 2000,
                "serviceChargeSatang": 0,
                "netSalesSatang": 5547250,
                "vatSatang": 362894,
                "netExVatSatang": 5184356,
                "tipSatang": 0,
                "voidCount": 16,
                "voidTotalSatang": 189500,
```

---
## Task map
- Setup: R1 (GET /units)
- Task 1 sell + replay: R2 products, R3 quote (12500), R4 shifts/current -> 422 (needs deviceId, undocumented), R5 shifts list (no OPEN shift), R6 sale 200 (saleId cmva6funz000298kz7l9bx58s, 202610-0552), R7 replay 200 `idempotent-replayed: true`, same saleId
- Task 2: R8 list (Thai date 2026-10-16, 6 bills), R9 detail, R10 receipt (footer.qrEReceiptUrl = http://127.0.0.1:3228/r/7PKCXPQRF68Z)
- Task 3: R11 refundable (lineIds), R12 refund latte line 6000 CASH -> CN202610-0070, sale.refundedSatang 6000
- Task 4: R13 channels, R14 openapi.json (POST /orders body - no recipe in skill), R15 create on CUSTOM channel QCPHONE startStatus NEW -> OD-0001, R16 read, R17 accept -> ACCEPTED, prepDueAt +15 min
- Task 5: R18 CSV (BOM, 7 day rows + total row); R19/R20 JSON check (unitId null vs set -> identical totals)

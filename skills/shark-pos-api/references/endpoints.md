# SHARK POS API — endpoint reference

Generated from the operation registry by `scripts/gen-pos-api-docs.mts` (`--check` covers this file too). Do not edit by hand.

Base URL: `https://shark.in.th/api/v1/pos`. 49 operations. Full prose, field tables and curl examples: `docs/api/POS-API.md` (also served at `https://shark.in.th/developers/pos.md`). Machine readable contract: `/api/v1/pos/openapi.json`.

## Read operations

Safe to call at any time. No `Idempotency-Key`, nothing is written, nothing is audited (`POST /sales/quote` is a read too).

| Operation id | Method + path | Scope | Notes |
| --- | --- | --- | --- |
| `units.list` | `GET /units` | `pos.sale.read` | - |
| `sales.receipt` | `GET /sales/{id}/receipt` | `pos.sale.read` | - |
| `sales.refundable` | `GET /sales/{id}/refundable` | `pos.sale.refund` | - |
| `sales.get` | `GET /sales/{id}` | `pos.sale.read` | - |
| `sales.quote` | `POST /sales/quote` | `pos.sale.create` | - |
| `sales.list` | `GET /sales` | `pos.sale.read` | paged |
| `shifts.xReport` | `GET /shifts/{id}/x-report` | `pos.shift.manage` | - |
| `shifts.zReport` | `GET /shifts/{id}/z-report` | `pos.shift.manage` | - |
| `shifts.current` | `GET /shifts/current` | `pos.shift.manage` | - |
| `shifts.list` | `GET /shifts` | `pos.shift.manage` | - |
| `devices.list` | `GET /devices` | `pos.device.manage` | - |
| `products.options` | `GET /products/{id}/options` | `pos.sale.create` | - |
| `products.lookup` | `GET /products/lookup` | `pos.sale.create` | - |
| `products.list` | `GET /products` | `pos.sale.read` | paged |
| `channels.list` | `GET /channels` | `pos.sale.read` | - |
| `orders.get` | `GET /orders/{id}` | `pos.sale.read` | - |
| `orders.list` | `GET /orders` | `pos.sale.read` | - |
| `reports.anomalies` | `GET /reports/anomalies` | `pos.report.anomaly` | CSV · report rate |
| `reports.branches` | `GET /reports/branches` | `pos.report.view` | CSV · report rate |
| `reports.channels` | `GET /reports/channels` | `pos.report.view` | CSV · report rate |
| `sales.byDay` | `GET /reports/daily` | `pos.report.view` | CSV · report rate |
| `reports.hourly` | `GET /reports/hourly` | `pos.report.view` | CSV · report rate |
| `reports.margin` | `GET /reports/margin` | `pos.report.view` | CSV · report rate |
| `reports.payments` | `GET /reports/payments` | `pos.report.view` | CSV · report rate |
| `reports.products` | `GET /reports/products` | `pos.report.view` | CSV · report rate |
| `reports.shifts` | `GET /reports/shifts` | `pos.report.view` | CSV · report rate |
| `reports.staff` | `GET /reports/staff` | `pos.report.view` | CSV · report rate |
| `sales.summary` | `GET /reports/summary` | `pos.report.view` | report rate |
| `reports.tax` | `GET /reports/tax` | `pos.report.view` | CSV · report rate |

## Write operations

Change data. `Idempotency-Key` is required and every success is written to the audit log with the key name.

| Operation id | Method + path | Scope | Notes |
| --- | --- | --- | --- |
| `sync.sales` | `POST /sync/sales` | `pos.offline.sync` | - |
| `sales.taxInvoice` | `POST /sales/{id}/tax-invoice` | `pos.taxinvoice.issue` | - |
| `sales.create` | `POST /sales` | `pos.sale.create` | - |
| `products.availability` | `POST /products/{id}/availability` | `pos.sale.create` | - |
| `products.setPrice` | `PUT /products/{id}/price` | `pos.product.setPrice` | - |
| `products.update` | `PATCH /products/{id}` | `pos.product.manage` | - |
| `products.create` | `POST /products` | `pos.product.manage` | - |
| `channels.pause` | `POST /channels/{id}/pause` | `pos.order.accept` | - |
| `channels.resume` | `POST /channels/{id}/resume` | `pos.order.accept` | - |
| `orders.accept` | `POST /orders/{id}/accept` | `pos.order.accept` | - |
| `orders.complete` | `POST /orders/{id}/complete` | `pos.order.accept` | - |
| `orders.pay` | `POST /orders/{id}/pay` | `pos.sale.create` | - |
| `orders.preparing` | `POST /orders/{id}/preparing` | `pos.order.accept` | - |
| `orders.ready` | `POST /orders/{id}/ready` | `pos.order.accept` | - |
| `orders.reject` | `POST /orders/{id}/reject` | `pos.order.reject` | - |
| `orders.create` | `POST /orders` | `pos.sale.create` | - |

## Danger operations

Hard to undo. On top of the write rules they need `confirm: true` and a `reason` of at least 5 characters. An AI agent must ask a human before calling these.

| Operation id | Method + path | Scope | Notes |
| --- | --- | --- | --- |
| `sales.refund` | `POST /sales/{id}/refund` | `pos.sale.refund` | - |
| `sales.void` | `POST /sales/{id}/void` | `pos.sale.void` | - |
| `products.archive` | `POST /products/{id}/archive` | `pos.product.manage` | - |
| `orders.cancel` | `POST /orders/{id}/cancel` | `pos.order.reject` | - |

# SHARK HR API

Machine readable contract: `/api/v1/hr/openapi.json` (OpenAPI 3.1.0, no API key needed).
Base URL: `https://shark.in.th/api/v1/hr` - contract version 1.0.0 - 14 operations.
Generated from the operation registry by `scripts/gen-hr-api-docs.mts`. Do not edit by hand: run the script.

## Who this is for

- **AI agents** answering a shop owner's questions about staff, rosters, attendance and leave, or filing a leave request for an employee. Read Privacy first.
- **Developers** wiring a roster screen, a time-and-attendance dashboard or an accounting tool (with a pay key) into SHARK HR.

## Authentication and scopes

Send `Authorization: Bearer <api key>`. Only the shop owner issues HR keys, in HR > Settings > API keys; the raw key is shown once. Every key is bound to one HR system, and the HR API accepts no other key. If the person who issued a key stops being the shop owner, the key stops working (403 `forbidden`).

| Bundle | What it can do | Scopes |
| --- | --- | --- |
| `hr-read` | Read the HR system without pay data: the staff list (no national id, bank, address, phone or PIN), shifts, the published roster, attendance and leave (no leave reasons). Writes nothing. | `hr.employee.read` `hr.roster.read` `hr.leave.read` |
| `hr-leave` | Everything in hr-read plus filing a leave request for an employee. A filed leave always waits for the shop's normal approval; nothing can be approved through the API. | `hr.employee.read` `hr.roster.read` `hr.leave.read` `hr.leave.request` `hr.leave.decide` |
| `hr-payroll-read` | Everything in hr-read plus payslips, the yearly payslip history and the pay reports. Only the shop owner can issue it, after confirming that pay data will leave SHARK. Every pay read is audited. | `hr.employee.read` `hr.roster.read` `hr.leave.read` `hr.payroll.read` |

`hr.leave.decide` in `hr-leave` only mirrors the app's rule for filing leave on someone's behalf; no operation approves or rejects anything. Keys with `hr.payroll.read` always expire (30, 90 or 365 days) and need the owner's explicit consent.

## Conventions

These are the rules of the module, copied verbatim from the contract description in `/api/v1/hr/openapi.json`:

REST API for the SHARK HR system (staff list, shifts, published roster, attendance, leave, and - with a pay key - payslips and pay reports). One API key works inside one HR system (AppSystem of type HR). This first version is read-mostly: the only write is filing a leave request, which always waits for the shop's normal approval.

Conventions that apply to every operation:
1. Authentication is `Authorization: Bearer <api key>`. Only the shop owner can issue HR keys, from HR > Settings > API keys, and every key is bound to that one HR system. A key not bound to this HR system (a shop-wide key, or a key of another system) is refused on every operation with 403 `scope_missing`, even if it carries hr.* scopes. If the person who issued the key is no longer the shop owner, every operation answers 403 `forbidden`; ask the owner for a new key.
2. Bundles: `hr-read` (default: staff list, shifts, roster, attendance, leave - no pay data), `hr-leave` (adds filing a leave request), `hr-payroll-read` (adds payslips and pay reports; the owner must confirm that pay data will leave SHARK). An operation returns 403 `scope_missing` when the key lacks the scope listed as `x-shark-scope` (the missing scope is in `hint`). Reports and filing a leave re-check a second scope inside the operation and answer the same way.
3. Privacy. The API never returns national id or social security numbers, addresses, bank details, phone numbers or e-mail, PINs, photos, GPS positions, devices, notes, leave reasons or who filed a leave. Report columns with statutory ids are always left out; money columns appear only for keys with `hr.payroll.read`. Every payslip, payslip history and pay report read is written to the shop's audit log. Never put names or other personal data in a URL: paths and query strings carry ids, dates and filters only.
4. Not found and not allowed look the same: an id of another HR system or shop, an id the key may not see and an unknown id all answer 404 `not_found` with identical bodies. Do not guess ids; read them from the list operations.
5. Dates are `YYYY-MM-DD` and months `YYYY-MM` in the Asia/Bangkok calendar. Clock in/out times are ISO-8601 strings in UTC. Times of day in shifts and roster entries are minutes after midnight (`startMin`, `endMin`). Leave days and balances are decimal strings (`"1.0"`, `"0.5"`).
6. Money is an integer number of satang (1 baht = 100 satang) in every field ending in `Satang`. Report cells are display strings, the same as the report screen.
7. Paging: `GET /employees` pages with `page` and `pageSize` (10, 20 or 50; default 20) ordered by name then id, and answers `page` next to `data`. Lists that reach the limit of the screen they come from answer `truncated: true` at the top level (`GET /leaves` 100 requests, `GET /employees` 500 working employees); other lists return the whole set.
8. Filing a leave (`POST /leaves`) requires an `Idempotency-Key` header. Retrying with the same key and body replays the stored answer with header `Idempotent-Replayed: true`; the same key with another body fails with 409 `idempotency_conflict`. The body is strict: unknown fields (including `reason`) fail with 422 `validation`. Overlapping leave answers 409 `duplicate`; other refusals of the HR rules answer 422 `unprocessable` with the app's Thai message in `message_th`. Leave of the shop owner cannot be filed through the API (403 `forbidden`).
9. Success is `{ data, page?, truncated?, requestId }`. Failure is `{ error: { code, message_th, message_en, hint?, details? }, requestId }` - branch on `error.code`; `message_th` is already worded for a Thai shop owner.
10. Rate limits are per key: 300 reads, 60 writes and 30 report-class reads (reports, payslips, payslip history) per minute (namespace hr, separate from other SHARK modules). A 429 response carries `Retry-After`.
11. Not available through the API on purpose: approving or rejecting anything, clocking in or out, editing employees, PINs and documents, payroll runs, bank transfer files, tax and social security filings, salary certificates, PDFs and CSV/XLSX exports, and the statutory employee register. Those stay in the HR app.

## Error codes

Branch on `error.code`, never on the message text. The list is shared by every SHARK REST module; codes the HR API never returns are marked.

| Code | HTTP | Meaning | What to do |
| --- | --- | --- | --- |
| `unauthorized` | 401 | No `Authorization: Bearer` header, or the key is unknown or revoked. | Check the header; ask the shop owner whether the key was revoked. |
| `key_expired` | 401 | The key was valid but its expiry date has passed. | Ask the shop owner for a new key. |
| `system_required` | 400 | The key is not bound to any system and no `X-Shark-System` header was sent. | Use a key issued from the HR settings page; those are always bound. |
| `system_mismatch` | 403 | `X-Shark-System` points at another system than the key is bound to, or at a system that is not an HR system of this shop. | Drop the header. |
| `scope_missing` | 403 | The key does not hold the scope this operation (or this report, or filing a leave) needs - or the key is not bound to this HR system at all. | Read `hint` for the scope, then ask the owner for a key with the right bundle (`hr-leave`, `hr-payroll-read`). |
| `invalid_json` | 400 | The request body is not parseable JSON. | Send valid JSON and `Content-Type: application/json`. |
| `validation` | 422 | The query or body did not match the schema (unknown fields such as `reason` are rejected on purpose, `pageSize` other than 10/20/50, bad dates). `details[]` lists the fields. | Fix the fields in `details[]`. |
| `idempotency_required` | 400 | `POST /leaves` was sent without the `Idempotency-Key` header. | Generate one key per logical attempt (a UUID) and send it. |
| `idempotency_conflict` | 409 | The same `Idempotency-Key` was reused with a different body. | Use a fresh key for a different request; reuse a key only to retry the identical one. |
| `idempotency_in_progress` | 409 | A request with this key is still running. | Wait a moment and retry with the same key; you will get the original answer. |
| `confirm_required` | 409 | Another SHARK module only. The HR API never returns this code. | Nothing to do here. |
| `customer_session_required` | 401 | Another SHARK module only. The HR API never returns this code. | Nothing to do here. |
| `customer_scope` | 403 | Another SHARK module only. The HR API never returns this code. | Nothing to do here. |
| `not_found` | 404 | No such operation, or the record does not exist in this HR system or is not available to this key. An id of another HR system or shop answers exactly the same. | Read ids from the list operations; never guess ids. |
| `method_not_allowed` | 405 | The path exists but not with this HTTP method. The `Allow` header lists what works. | Use one of the methods in `Allow`. |
| `rate_limited` | 429 | Too many calls for this key: 300 reads, 60 writes or 30 report-class reads per minute. | Wait `Retry-After` seconds and retry. |
| `period_locked` | 409 | Another SHARK module only. The HR API never returns this code. | Nothing to do here. |
| `state_conflict` | 409 | The payslip's pay run is a draft, not finished or reversed, so there is no issued payslip to read. | Read it after the shop issues the pay run. |
| `duplicate` | 409 | A pending or approved leave already covers some of these days. | Do not file again; read `GET /leaves` to find the existing one. |
| `forbidden` | 403 | An HR rule refused it: the key's issuer is no longer the shop owner, or the leave is for the shop owner or the key's issuer. | Stop and tell the user; do not retry. A new key from the owner fixes the first case. |
| `unprocessable` | 422 | The HR rules refused the request (leave type closed, half day or hours not allowed, outside employment, balance too low, range too long, report too big). | Show `message_th` to the shop owner as is; it is the app's own wording. |
| `upstream_unavailable` | 503 | Temporarily unavailable. | Retry shortly (with the same `Idempotency-Key` for a write). |
| `idempotency_outcome_unknown` | 409 | A temporary failure hit the request after it had started, so it is unknown whether the leave was filed. | Read `GET /leaves?status=PENDING`. If the leave is not there, send again with a NEW key. |

## Operations

### Read operations

Safe to call at any time. No `Idempotency-Key`, nothing is written. Payslip and pay report reads are audited. 13 of the 14 operations.

#### `units.list`

**GET /units** - Branches (business units) of the shop, oldest first. Use an id as unitId in the other operations. · scope: `hr.employee.read` · read

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/hr/units" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `employees.list`

**GET /employees** - Employees still working (no ended staff), ordered by name then id, paged with page and pageSize. Sensitive fields (national id, bank, address, phone, e-mail, PIN, photos) are never returned. truncated: true means the shop has more than 500 working employees and only the first 500 (by registration) were ordered. · scope: `hr.employee.read` · read · paged

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `unitId` | string | no | Only employees whose home branch is this unit. |
| `status` | enum("PROBATION", "ACTIVE") | no | Only employees in this employment status. |
| `page` | integer | no | Page number, from 1. Default 1. · min 1 · max 100000 |
| `pageSize` | integer | no | Employees per page: 10, 20, 50. Default 20. |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/hr/employees" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `employees.get`

**GET /employees/{employeeId}** - One employee (same fields as the list). An employee of another HR system or shop, and an unknown id, answer the same 404 not_found. · scope: `hr.employee.read` · read

Path parameters: `employeeId` (required).

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/hr/employees/employee_123" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `shifts.list`

**GET /shifts** - Active shifts of the HR system. With unitId: the shifts of that branch plus the shop-wide ones. Times are minutes after midnight. · scope: `hr.roster.read` · read

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `unitId` | string | no | Branch id: its shifts plus the shop-wide ones. |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/hr/shifts" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `roster.list`

**GET /roster** - Published roster entries between from and to (Thai dates, inclusive, at most 31 days), ordered by date and employee. Draft (unpublished) entries are never returned. · scope: `hr.roster.read` · read

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `from` | string | yes | First day, YYYY-MM-DD (Asia/Bangkok). · pattern `^\d{4}-\d{2}-\d{2}$` |
| `to` | string | yes | Last day, YYYY-MM-DD, at most 31 days after from. · pattern `^\d{4}-\d{2}-\d{2}$` |
| `unitId` | string | no | Only entries of this branch. |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/hr/roster?from=2026-12-01&to=2026-12-07" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `attendance.day`

**GET /attendance/day** - Attendance board of one day: per employee the shift slots with clock in/out times (ISO UTC), status and minutes, plus totals. No GPS, photos, devices or notes. · scope: `hr.roster.read` · read

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `day` | string | no | YYYY-MM-DD (Asia/Bangkok). Default today. · pattern `^\d{4}-\d{2}-\d{2}$` |
| `unitId` | string | no | Only this branch. |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/hr/attendance/day" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `attendance.month`

**GET /attendance/month** - Attendance calendar of one employee for one month (YYYY-MM) with the monthly summary. An employee of another HR system or shop answers 404 not_found like an unknown id. · scope: `hr.roster.read` · read

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `employeeId` | string | yes | Employee id (from GET /employees). |
| `month` | string | yes | YYYY-MM (Asia/Bangkok). · pattern `^\d{4}-(0[1-9]/1[0-2])$` |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/hr/attendance/month?employeeId=emp_123&month=2026-12" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `leavePolicies.list`

**GET /leave-policies** - Active leave types of the HR system (category, quota, half-day and hour rules). Use id as policyId when filing a leave. · scope: `hr.leave.read` · read

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/hr/leave-policies" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `leaves.list`

**GET /leaves** - Leave requests. status=PENDING (default): the requests waiting for a decision. status=HISTORY: the 100 most recently filed requests of any status. Ordered by fromDate (newest first) then id. Reasons, who filed and attachments are never returned. truncated: true when the list hit its limit of 100. · scope: `hr.leave.read` · read

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `status` | enum("PENDING", "HISTORY") | no | PENDING (default) or HISTORY. |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/hr/leaves" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `leaveBalances.list`

**GET /leave-balances** - Leave balances of every working employee for one leave year, per leave type: granted, carried, used, adjusted, expired, balance, pending and available days (decimal strings). · scope: `hr.leave.read` · read

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `year` | integer | no | Leave year, e.g. 2026. Default this year. · min 2000 · max 2600 |
| `unitId` | string | no | Only employees whose home branch is this unit. |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/hr/leave-balances" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `reports.get`

**GET /reports/{report}** - One HR report as JSON: time, ot, leave, payroll-month, payroll-year, wages, tax-month or tax-year. period is YYYY-MM for monthly reports and YYYY for yearly ones (leave, payroll-year, tax-year). time and ot also need hr.roster.read, leave needs hr.leave.read, the pay reports need hr.payroll.read. Money columns appear only for keys with hr.payroll.read; statutory id columns never. Pay reports are audited. · scope: `hr.employee.read` · read · report rate (30/min)

Path parameters: `report` (required).

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `period` | string | yes | YYYY-MM (monthly reports) or YYYY (leave, payroll-year, tax-year). |
| `unitId` | string | no | Only this branch. |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/hr/reports/time?period=2026-11" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `payslips.history`

**GET /employees/{employeeId}/payslips** - Issued payslips of one employee in one tax year with the yearly totals (satang). Audited. No bank details and no links. · scope: `hr.payroll.read` · read · report rate (30/min)

Path parameters: `employeeId` (required).

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `taxYear` | integer | yes | Tax year (Gregorian), e.g. 2026. · min 2000 · max 2400 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/hr/employees/employee_123/payslips?taxYear=2026" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `payslips.get`

**GET /payslips/{runId}/{employeeId}** - One issued payslip (earnings, deductions, net, SSO, satang). A run that is still a draft, not finished or reversed answers 409 state_conflict. Audited. No bank details. · scope: `hr.payroll.read` · read · report rate (30/min)

Path parameters: `runId`, `employeeId` (required).

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/hr/payslips/run_123/employee_123" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

### Write operations

`Idempotency-Key` is required and every success is written to the audit log with the key name. 1 of the 14 operations.

#### `leaves.create`

**POST /leaves** - File a leave request for an employee. It is always created PENDING and goes through the shop's normal approval; nothing is approved here. Needs hr.leave.request and hr.leave.decide (the app's rule for filing on someone's behalf). No reason field: medical details stay out of the API. Requires Idempotency-Key. · scope: `hr.leave.request` · write

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `employeeId` | string | yes | Employee id (from GET /employees). |
| `policyId` | string | no | Leave type id (from GET /leave-policies). Send policyId or type. |
| `type` | enum("SICK", "PERSONAL", "VACATION", "OTHER") | no | Leave category when no policyId is sent: SICK, PERSONAL, VACATION or OTHER. |
| `fromDate` | string | yes | First day of leave, YYYY-MM-DD (Asia/Bangkok). · pattern `^\d{4}-\d{2}-\d{2}$` |
| `toDate` | string | yes | Last day of leave, YYYY-MM-DD. · pattern `^\d{4}-\d{2}-\d{2}$` |
| `halfDay` | enum("AM", "PM") | no | Half day (one day only, when the leave type allows it). |
| `hours` | integer | no | Hours (1 to 7, one day only, when the leave type allows it). · min 1 · max 7 |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/hr/leaves" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"employeeId":"emp_123","policyId":"pol_123","fromDate":"2026-12-01","toDate":"2026-12-01"}'
```

## Glossary (Thai <-> English HR terms)

| ไทย | English | In the API |
| --- | --- | --- |
| ระบบงานบุคคล | HR system (AppSystem of type HR) | `X-Shark-System` |
| สาขา | branch (business unit) | `unitId` · `GET /units` |
| พนักงาน | employee | `employeeId` · `GET /employees` |
| ทดลองงาน / ทำงานอยู่ | on probation / active | `employmentStatus` PROBATION / ACTIVE |
| กะ | shift | `GET /shifts` · `startMin` / `endMin` |
| ตารางกะ (ประกาศแล้ว) | published roster | `GET /roster` |
| ลงเวลาเข้า-ออก | clock in / out | `inAt` · `outAt` |
| สาย / ออกก่อน | late / early out | `lateMin` · `earlyOutMin` |
| ประเภทการลา | leave type (policy) | `policyId` · `GET /leave-policies` |
| ใบลา | leave request | `GET /leaves` · `POST /leaves` |
| รออนุมัติ | pending | `status: PENDING` |
| ลาครึ่งวัน (เช้า/บ่าย) | half day (morning / afternoon) | `halfDay` AM / PM |
| วันลาคงเหลือ | leave balance | `GET /leave-balances` |
| สลิปเงินเดือน | payslip | `GET /payslips/{runId}/{employeeId}` |
| รอบจ่ายเงินเดือน | pay run | `runId` |
| สตางค์ | satang (1/100 baht) | `*Satang` fields |
| ประกันสังคม | social security (SSO) | `ssoBaseSatang` · `employerSsoSatang` |
| ภาษีหัก ณ ที่จ่าย | withholding tax | `taxSatang` (payslip history) |

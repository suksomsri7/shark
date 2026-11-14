---
name: shark-hr-api
description: Read a SHARK shop's HR system through the REST API at https://shark.in.th/api/v1/hr - staff list, branches, shifts, the published roster, daily and monthly attendance, leave types, leave requests and leave balances - file a leave request for an employee, and, with a pay key, read payslips, the yearly payslip history and pay reports. Use when the user asks who works at a branch, who is on shift this week, who was late or absent, who is on leave, how many leave days someone has left, to file a leave for an employee, or to pull a payslip or a time, overtime, leave or payroll report, or wire an external system or agent into SHARK HR.
---

# SHARK HR API

## When to use

Use this skill whenever a task needs data from a SHARK HR system (งานบุคคล):
branches, the staff list (no sensitive fields), shifts, the published roster,
attendance per day or per employee and month, leave types, leave requests,
leave balances, and - only with a pay key - payslips, the yearly payslip
history and pay reports. The one write is filing a leave request on behalf of
an employee; it always waits for the shop's normal approval.

Do not use this skill for the shop's accounting books, point of sale, CRM,
members or task boards - those are separate APIs with their own skills
(`shark-account-api`, `shark-pos-api`, `shark-crm-api`, `shark-member-api`,
`shark-kanban-api`). Approvals, payroll runs, bank transfer files, tax and
social security filings, salary certificates, PDFs and exports are not in the
API at all: tell the user to do them in the SHARK HR app.

## Setup

- Base URL: `https://shark.in.th/api/v1/hr`
- Every request needs `Authorization: Bearer <api key>`. Only the shop owner
  can issue an HR key, in HR > Settings > API keys; it is shown once. Bundles:
  `hr-read` (default - staff, roster, attendance, leave, no pay data),
  `hr-leave` (adds filing leave), `hr-payroll-read` (adds payslips and pay
  reports; the owner must confirm that pay data will leave SHARK).
- Every HR key is bound to one HR system, so you never need `X-Shark-System`.
  The HR API accepts no other key, whatever scopes it carries: a shop-wide key
  gets 400 `system_required` without `X-Shark-System` and 403 `scope_missing`
  with it; a key of another system gets 403 `system_mismatch`.
- Machine readable contract (no key needed):
  `GET https://shark.in.th/api/v1/hr/openapi.json`. Human readable contract with
  field tables and a curl example per operation:
  `GET https://shark.in.th/developers/hr.md`.
- Open `references/endpoints.md` for the exact `METHOD path` and scope of the
  14 operations, then `references/recipes.md` for worked examples.
- Start with `GET /units` (branches), then `GET /employees` (ids). Every other
  call takes ids from those answers.

## Conventions

- Dates are `YYYY-MM-DD` and months `YYYY-MM` in the Asia/Bangkok calendar.
  Clock in/out times are ISO-8601 in UTC. Shift and roster times are minutes
  after midnight (`startMin` 480 = 08:00).
- Money is an integer number of satang (1 baht = 100 satang) in every field
  ending in `Satang`. Report cells are display strings, like the report screen.
- Leave days and balances are decimal strings (`"1.0"`, `"0.5"`).
- Paging: `GET /employees` takes `page` and `pageSize` (10, 20 or 50, default
  20), ordered by name then id, and answers `page` next to `data`. A list that
  hit its limit answers `truncated: true`; say that the list is not complete.
- Success is `{ data, page?, truncated?, requestId }`. Failure is
  `{ error: { code, message_th, message_en, hint?, details? }, requestId }`.
  Branch on `error.code`; `message_th` is already worded for a Thai owner.
- `POST /leaves` needs `Content-Type: application/json` (415 otherwise) and an
  `Idempotency-Key` header (one UUID per attempt). On a
  timeout retry with the SAME key: you get the first answer back with the
  header `Idempotent-Replayed: true` and no second leave. A different body with
  a used key fails with 409 `idempotency_conflict`.
- Rate limits per key and minute: 300 reads, 60 writes, 30 report-class reads
  (reports, payslips, payslip history). On 429 wait `Retry-After` seconds.

## Privacy and safety

- The API has no national id or social security number, no address, no bank
  account, no phone or e-mail, no PIN, no photo, no GPS position, no device,
  no notes and no leave reason. Never ask the user to type these into a chat
  or a request, and never try to find them another way.
- Never put a name or any personal data in a URL. Paths and query strings
  carry ids, dates and filters only; look ids up with the list operations.
- Pay data (payslips, payslip history, pay reports) needs a key with
  `hr.payroll.read`, and every such read is written to the shop's audit log.
  Read only what the user asked for, and do not copy pay data into other
  systems, files or messages unless the user explicitly asks.
- A filed leave is a request, never an approval. After `POST /leaves` say that
  the leave is waiting for approval (`status: PENDING`, the stored status);
  never say it was approved. Approving or rejecting leave, overtime, corrections or pay, payroll
  runs, bank files, tax and social security filings and salary certificates
  are done in the SHARK HR app only.
- Ended (former) employees are not in the staff list; their profile,
  attendance month and payslips answer 404 and no new leave can be filed for
  them. They still appear in past roster rows and in report rows (history).
- 404 `not_found` means "not found or not allowed" - the answer is identical
  for an id of another shop and for an unknown id. Never guess or enumerate ids.
- Stop and tell the user on 403 `forbidden`: the key's issuer is no longer the
  shop owner, or the leave belongs to the shop owner. Do not retry. On 403
  `scope_missing` tell the user which scope (`hint`) the key lacks; only the
  shop owner can issue a wider key.

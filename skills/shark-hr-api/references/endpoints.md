# SHARK HR API - endpoint reference

Generated from the operation registry by `scripts/gen-hr-api-docs.mts` (`--check` covers this file too). Do not edit by hand.

Base URL: `https://shark.in.th/api/v1/hr`. 14 operations. Full prose, field tables and curl examples: `docs/api/HR-API.md` (also served at `https://shark.in.th/developers/hr.md`). Machine readable contract: `/api/v1/hr/openapi.json`.

## Read operations

Safe to call at any time. No `Idempotency-Key`, nothing is written. Payslip and pay report reads are audited.

| Operation id | Method + path | Scope | Notes |
| --- | --- | --- | --- |
| `units.list` | `GET /units` | `hr.employee.read` | - |
| `employees.list` | `GET /employees` | `hr.employee.read` | paged |
| `employees.get` | `GET /employees/{employeeId}` | `hr.employee.read` | - |
| `shifts.list` | `GET /shifts` | `hr.roster.read` | - |
| `roster.list` | `GET /roster` | `hr.roster.read` | - |
| `attendance.day` | `GET /attendance/day` | `hr.roster.read` | - |
| `attendance.month` | `GET /attendance/month` | `hr.roster.read` | - |
| `leavePolicies.list` | `GET /leave-policies` | `hr.leave.read` | - |
| `leaves.list` | `GET /leaves` | `hr.leave.read` | - |
| `leaveBalances.list` | `GET /leave-balances` | `hr.leave.read` | - |
| `reports.get` | `GET /reports/{report}` | `hr.employee.read` | report rate, audited when it carries pay data · second scope per report |
| `payslips.history` | `GET /employees/{employeeId}/payslips` | `hr.payroll.read` | report rate, audited when it carries pay data |
| `payslips.get` | `GET /payslips/{runId}/{employeeId}` | `hr.payroll.read` | report rate, audited when it carries pay data |

## Write operations

`Idempotency-Key` is required and every success is written to the audit log with the key name.

| Operation id | Method + path | Scope | Notes |
| --- | --- | --- | --- |
| `leaves.create` | `POST /leaves` | `hr.leave.request` | also needs hr.leave.decide |

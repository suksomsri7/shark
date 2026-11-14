# SHARK HR API - recipes

Worked examples of the common jobs. Every block is one `curl` call that runs
as is in bash after you `export` the variables it uses:

- `SHARK_API_KEY` - the HR API key (bundle `hr-leave` for filing leave,
  `hr-payroll-read` for the payslip recipes, `hr-read` for the rest).
- `SHARK_SYSTEM_ID` - the HR system id the key is bound to (optional header).
- `UNIT_ID` - a branch from `GET /units`.
- `EMPLOYEE_ID` - an employee from `GET /employees`.
- `RUN_ID` - a pay run id from the payslip history.
- `FROM` / `TO` - dates `YYYY-MM-DD` (Asia/Bangkok).

For example:

```
export SHARK_API_KEY="shark_..." UNIT_ID="..." EMPLOYEE_ID="..."
```

JSON bodies are written in double quotes with `\"` around every JSON string,
so the shell fills in the variables. `$(uuidgen)` makes a fresh
`Idempotency-Key`; on a retry of the same call send the value you used before.
Each recipe ends with the error you get when one thing is wrong.

## List the branches

```bash
curl -sS "https://shark.in.th/api/v1/hr/units" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

`data` is an array of `{ id, name }`. Use `id` as `unitId`.

Error branch: `401 unauthorized` (no or wrong `Authorization` header).

## List the employees of a branch

```bash
curl -sS "https://shark.in.th/api/v1/hr/employees?unitId=$UNIT_ID&pageSize=50" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

`data` is a page of employees (id, code, name, nickname, position, branch,
employment status and dates); `page.hasMore` says whether to ask `page=2`.

Error branch: `422 validation` (`pageSize` other than 10, 20 or 50).

## Read one employee

```bash
curl -sS "https://shark.in.th/api/v1/hr/employees/$EMPLOYEE_ID" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "X-Shark-System: $SHARK_SYSTEM_ID"
```

Error branch: `404 not_found` (unknown id, or an employee of another shop).

## Who works when (published roster of a week)

```bash
curl -sS "https://shark.in.th/api/v1/hr/roster?from=$FROM&to=$TO" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

Each entry has `employeeId`, `date`, `shiftId` and the minutes of the shift.
Draft (unpublished) entries are never returned.

Error branch: `422 unprocessable` (more than 31 days between `from` and `to`).

## Attendance of one employee for a month

```bash
curl -sS "https://shark.in.th/api/v1/hr/attendance/month?employeeId=$EMPLOYEE_ID&month=2026-06" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

`data.summary` has the late count, absent days, leave days and worked minutes.

Error branch: `403 scope_missing` (the key has no `hr.roster.read`).

## Leave requests waiting for a decision

```bash
curl -sS "https://shark.in.th/api/v1/hr/leaves?status=PENDING" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

No reasons are returned. Approving is done in the HR app, not here.

Error branch: `403 scope_missing` (the key has no `hr.leave.read`).

## File a leave request for an employee

```bash
curl -sS -X POST "https://shark.in.th/api/v1/hr/leaves" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d "{\"employeeId\":\"$EMPLOYEE_ID\",\"type\":\"PERSONAL\",\"fromDate\":\"$FROM\",\"toDate\":\"$TO\"}"
```

`data` is `{ id, status: "PENDING" }`: the request waits for the shop's normal
approval. Tell the user it was filed, not approved. Do not send a reason.

Error branch: `409 duplicate` (a pending or approved leave already covers these days).

## Leave balances of the year

```bash
curl -sS "https://shark.in.th/api/v1/hr/leave-balances?year=2026&unitId=$UNIT_ID" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

Error branch: `403 scope_missing` (the key has no `hr.leave.read`).

## Payslip history of an employee (pay key)

```bash
curl -sS "https://shark.in.th/api/v1/hr/employees/$EMPLOYEE_ID/payslips?taxYear=2026" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

`data.year.slips[]` lists the issued payslips (`runId`, `periodKey`,
`payDate`, `netSatang`); the read is audited.

Error branch: `403 scope_missing` (the key has no `hr.payroll.read`).

## Read one payslip (pay key)

```bash
curl -sS "https://shark.in.th/api/v1/hr/payslips/$RUN_ID/$EMPLOYEE_ID" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

Earnings, deductions, net and social security in satang. No bank details.

Error branch: `409 state_conflict` (the pay run is still a draft or was reversed).

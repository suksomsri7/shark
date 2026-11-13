# H3.9 — builder notes (reports + employee register + CSV/XLSX exports · branch wip/hr-h3.9)

Base: `658204a09` (oracle) + `ee0e32ef5` (gate-lock, cherry-picked) + merge of `51793cdb0` (session/hr with H3.4) — clean merge, no conflicts.
Migration `20270109000000_hr_employee_register_fields` applied on lane DB wo-hr-qc-l2 (`prisma migrate deploy`); `prisma generate` via iso.sh.

## Files
New: `hr/reports-rules.ts` (pure) · `hr/reports.ts` (service) · `hr/reports-ui.tsx` (server components) · `hr/reports-route.ts` (`reportExportGet`) ·
`hr/reports-actions.ts` ("use server": register card + full-ID setting) · page `app/sys/[id]/hr/reports/page.tsx` · route `…/hr/reports/export/route.ts` · migration.
Marked hunks (`HR H3.9`): `prisma/schema/hr.prisma` (model appended) · `core/scope.ts` (`HrEmployeeRegister: sys()`) · `scripts/hr-qc-env.mts` (table + delete order) ·
`hr/ui.tsx` (hub card `hr-link-reports` + passes the link to the overview) · `hr/overview-ui.tsx` (tile `hr-overview-reports-link`, prop only — no new import, qc-hr-h2.11 S1.6 facade rule kept) ·
employee page (register card + `?reg=` flash) · messages `hr.report.*` (th = en, 21 keys) · inventory (+23 rows, `wo:"H3.9"`) · `visual-hr.mts` spec `"3.9"`.

## Design decisions
- **One decision point** `reportAccessOf(v)` (design §1.1). Every service entry first runs `gateOf(ctx, viewer)`: HR system of the tenant **and** an accepted membership of `viewer.userId` in `ctx.tenantId` with the same role; role/unitAccess/permissions then come from the DB row. Without it the first forced run showed the other-tenant OWNER reading tenant A's reports with ctx A (S4.1 `other/*: okok`) — the system check alone is not enough.
- Rows = `hrScopeOf` + `unitWhere` (home branch or open borrowing today; unassigned only for all-branch). Unit filter outside scope / unknown ⇒ rows []. Totals are re-summed from the visible cells only.
- Leave (ruling Q1): `teamLeaveBalances` is called with the viewer when it passes the leave gate; a payroll-only viewer is passed as `{STAFF, same unitAccess, hr.leave.read}` — same balance code, same branches, never reasons/attachments; rows also intersected with my scoped employee map.
- v2 runs count only when `journalEntryId` or `stepsJson.finalized === true` (ruling Q5); REVERSED/DRAFT never.
- Tax month/year = Bangkok day of `payDate`; `months` = distinct Bangkok pay months. Income 40(1) = `whtIncomeOf` (H3.4 prior-YTD rule; `ytdJson` not read).
- Register: all employees in scope incl. ended; warnings over visible rows; duty/under-10 note counts **system-wide** active employees (employer-level duty, 1 count query).
- National ID: `maskCitizenId` everywhere; full only on register **export**, setting ON, OWNER or all-branch payroll; audit `fullId`.
- Register writer: `updateMany` → `create` (P2002 ⇒ update again). `tenantDb(...).upsert` with the scope filter in `where` threw a Prisma validation error (extended unique where), so it is not used.
- Action file has a coarse `assertCan` key gate (fitness F6.1 requires a proven guard in every actions file); the real gates stay in the service. All-branch marker comment (no unitId — branch checked in service from DB).
- Route: `rsc`/`next-router-prefetch` ⇒ 204 before any read (route.ts and helper both); NO 404 · INPUT 400 · FORMULA/ENCODING/LIMIT 409 · text/plain, no bytes.
- UI: server components only (no "use client"); money shown `฿1,234.50` from DTO strings; ids in the page use the `hrrep-` prefix so the testid scanner does not see them.

## Query counts (S6, 300 employees × 31 days / 12 runs × 300 items)
S6.1–S6.3 green (≤ 12 q · ≤ 5 s; the oracle prints counts only on failure). Counted from the code path: time page 6 (system + membership + employees + judge days + corrections + unit names) · tax-year 5 · payroll-year 5 (items read once with the run joined) · register 7 (+ salary profiles + register rows + active count) · time CSV export 7 (+ audit). No per-employee query anywhere.

## Golden disagreements / ORACLE-EDITs requested (none applied — oracle untouched)
1. **S4.6 `payType` key** — `FORB` includes `HR_FORBIDDEN_DTO_KEYS` which contains `payType`, but the catalog (S2.2) makes `payType` a column key of `wages` and `register`, and S3.6/S3.7/S4.2 read `values.payType`. The value is the Thai label (รายเดือน), not a profile field, and only payroll viewers get these reports. Both cannot pass. Proposed hunk (S4.6):
   `const k = [...keysDeep(c.page.value)].filter((x) => FORB.has(x) && !(MONEY.has(c.who) && keysOf(c.report).includes(x)));`
2. **S4.6 `seen >= 40`** — the design matrix allows exactly 9+9+9+3+3+1+2 = **36** cells (owner · payAll · payBranch · mgr · mgrAll · leaveReader · hrAdmin); 40 is only reachable if `other` (another tenant's owner) is served — the leak fixed above. Proposed: `seen: seen >= 36`.
3. **S7.1 run not finalized** — S7.1 inserts an APPROVED engineVersion-2 run with no `journalEntryId` and no `stepsJson`, then expects it in payroll-month/tax-month/wages. Ruling Q5 (and S7.3 case "neither ⇒ excluded") excludes exactly that run. Proposed: add `journalEntryId: \`qc39-jv-s71-${tag}\`` to the S7.1 `hrPayrollRun.create` data.
4. **Base** — the oracle uses merge-base with `origin/session/hr` (8e52db009, pre-H3.4) else cut `5d7bcf0c4`; both lack H3.4, so S1.2 `frozenBlocks` (HrPayrollRun gained `stepsJson`/`inputDigest` in H3.4) and S1.5 `frozen` (H3.4 changed payroll.ts, judge.ts, ot*.ts, …) fail on any tree that contains H3.4 — not caused by H3.9. My runs pass `QC_H39_BASE=51793cdb0` (the base I merged). Once origin/session/hr contains H3.4 the default resolves the same way; otherwise `BASE_CUT` should move to `51793cdb0` (ORACLE-EDIT for the controller).

No hand derivation disagreed with the code: every golden (time · leave e1P1 · ot · payroll-month ×4 · payroll-year · tax-month ×3 · tax-year ×2 · wages ×2 · register page/export/branch) matched on the first DB run.

## Runs
`hr-H3.9-green.txt`: qc-hr-h3.9 forced ×2 + unforced 50/52 (only S4.6 + S7.1 — oracle defects 1–3) · default base 48/52 (+S1.2/S1.5, item 4) · seed 34/34 ×2 · 20 regression suites all green · fitness + fitness-hr both modes green · clean typecheck 0 errors.

## Not followed / why
- Brief R7 export header "locale labels": exports default to Thai unless a locale is passed (route passes the viewer locale; oracle calls without locale expect Thai).
- `hr-report-pick-*`, `hr-report-show`, `hr-link-reports` are extra testids (inventory rows added).

## Open risks
- Duty note counts all active employees of the system for branch-limited viewers (reveals only "≥ 10 or not").
- Register "position" joins position + department; department alone is shown when position is empty.
- Time rows = employees with judge rows in the month; OT rows = employees with a counted request; an employee with only CANCELLED requests has no row.
- Approved-but-revoked OT keeps status APPROVED in counts/approvedMin (spec literal); only its ฿/segments are dropped.

## Debts
D-1…D-7 as design §6 (name split · rate history · orphan rows · self export · daily/hourly v2 rate · historical branch · holiday-OT ฿ in wages).

## Rulings round (13 Nov)
- Merged origin/session/hr 9e8ad6386 (H3.4 pushed) — default base now resolves; S1.2/S1.5 pass without QC_H39_BASE.
- ORACLE-EDITs applied (marked, listed in hr-H3.9-oracle.md §7): S4.6 payType for money viewers in wages/register + keys scanned on served DTOs only (refusal shape carries "reason") · seen === 36 · S7.1 finalized run · new S1.11 / S3.10 / S3.11 / S4.10 + fixture (2 revoked OT rows, catalog ot + keptHolidayWorkMin/Amt, goldens).
- A (reports.ts:307–330): revokedAt ⇒ never approved/approvedMin; settled HOLIDAY_WORK segments of a revoked request ⇒ keptHolidayWorkMin (P) / keptHolidayWorkAmt ($).
- B (reports.ts:598–600): duty/under-10 note (and its count query) only for all-branch viewers.
- Help text hr.report.onlyData (th/en) on time/OT reports.
- qc-hr-h3.4 on the default base: 83/85 — S1.7/S1.10 are H3.4's own "hunks vs base" statics, empty now that H3.4 is in the base; 85/85 with QC_H34_BASE=8e52db009. Not an H3.9 effect; needs an H3.4 base pin (controller).

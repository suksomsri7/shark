# H4.8 delta review r2 — head c074671ff (fix fa8698650 · oracle e680111ae/f4381c937 · merge 05fc90504)

Read by object only; nothing run; working tree untouched. Fix hunks read in `git diff 128043298 fa8698650`. Merge checked with `git diff 292bc5b7e c074671ff`: only H4.8 files differ (40 files, all H4.8).

**Verdict: MERGE WITH NOTES.** All seven rulings are implemented. One MINOR remains: ruling 5 still has gaps, and the docs now overstate it.

## Rulings
1. **Pay-read audit by money returned.** OK.
   - `ops/reports.ts:46-50` + `serialize.ts reportCarriesMoney`: audit when `pay && the report has a $ column`. That is ot + all pay reports. time and leave have no $ column, so no money and no audit. Correct.
   - Payslips get and history audit before answering.
   - No other op returns money: employees, attendance, roster, leaves and balances serializers have no money keys.
   - The merged H3.4-YTD adds opening figures only inside tax-year rows and history totals. Both are already audited paths with the same allow-list.
2. **API-key-only keys.** OK.
   - `permissions.ts:955-967`: `API_KEY_ONLY_PERMISSIONS` is filtered out of `PERMISSION_MODULES`, so the editor never shows them.
   - `staff/service.ts:188` refuses them in `validatePermissionInput`. That function is the gate for `staff/service.ts:594` (member save) and `staff/invite.ts:153` (invite).
   - No other `membership.update/create` writes `permissions`: tenants/account-deletion/lifecycle don't, and role templates/AI/other REST have no permission writer.
   - More importantly, all three reader OR-terms now also require `String(v.userId).startsWith("apikey:")`: `privacy.ts:41`, `roster.ts:124`, `roster-board.ts:60`.
     - Only `hrKeyViewer` (`actor.ts:61`) builds such a userId. Human viewers carry `auth.user.id` (cuid).
     - `reportAccessOf` passes no userId, so it is false.
     - So even a legacy or hand-edited human row with these keys gains nothing (F2 golden `000000`).
   - privacy.ts diff vs session/hr 292bc5b7e = that one line only. Pin `bbf7604b…` = `sha256(git show c074671ff:src/lib/modules/hr/privacy.ts)`. **OK.**
3. **Real-calendar dates.** OK.
   - `op.ts:232-250`: `HR_DAY`/`HR_MONTH`/`HR_PERIOD` (2000–2600, round-trip through Date.UTC).
   - Used for roster from/to, attendance day/month, POST from/to and report period.
   - `year`/`taxYear` are bounded ints.
   - No raw date regex is left in `ops/*`.
4. **Key name.** OK. `keys.ts:28-31,60` refuses C0/C1 incl. NUL, bidi and U+2028/9; the listing strips them from old names.
   - NOTE: zero-width chars (U+200B–U+200D, U+FEFF) still pass. They are harmless in display.
5. **Ended employees.** PARTIAL.
   - 404 same bytes: profile `isEndedEmployee`, attendance month, payslip history/get, POST /leaves.
   - Dropped from: GET /leaves, attendance day (totals recomputed), employees list (reader is active-only), leave balances (`leave.ts` `active:true`).
   - **R2-M1 (MINOR):** two places still return ended employees.
     - `GET /roster` (`ops/roster.ts:55`): `listRoster` has no active filter (`roster.ts:833`), so past published entries carry an ended employee's `employeeId`.
     - `GET /reports/time|ot|leave` (and pay reports): `reports.ts:172` loads employees without `active`, so rows carry an ended employee's id + name + metrics.
     - The OpenAPI point 4 (`openapi.ts`) now says ended employees "are not in any list". Either filter roster entries and non-pay report rows with `endedEmployeeIds`, or soften the doc. Pay/tax reports probably *should* keep leavers (statutory), so a doc wording fix may be the right call.
6. **JSON-only writes.** OK.
   - `dispatch.ts writeGuard`: valid key + non-read op ⇒ 415 `invalid_json` unless `application/json`; own-property `__proto__`/`constructor`/`prototype` (depth ≤ 20) ⇒ 422 `validation`.
   - Response status is read back via `leaveDetailsMany` (`ops/leave.ts:158-160`).
   - NOTE: the guard runs before the core system/scope/rate checks. A valid key of another system gets 415/422 instead of 403, and the body is parsed before the rate limit. No data exposure; acceptable.
7. **Docs/skill.** OK. SKILL.md, openapi intro and HR-API.md now give `system_required` / `scope_missing` / `system_mismatch` correctly, plus 415 and the stored status.

## Oracle
- S6 checks the new "คีย์ API:" labels.
- A14 uses the `apikey:qc-newkey` viewer.
- F1 money audit: pay ot ⇒ 1 row, read key ⇒ 0.
- F2: editor hides, save refuses, human matrix `000000`.
- F3 dates, F4 names (nothing written), F5 ended ≡ unknown, F6 415/proto/ctor/stored status.
- The qc-hr-h3.8 S1.13 re-take matches the file (see 2).
- F5 does not cover roster/report rows (hence R2-M1 got through).

## For the controller
Merge is fine. Decide R2-M1: filter roster and non-pay reports, or reword the OpenAPI "not in any list" line. Notes: zero-width chars in key names; write-guard ordering.

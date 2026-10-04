# POS P1.17 S — oracle notes (`scripts/qc-pos-p1.17.mts`)

Oracle writer · cloud run · 4 Oct 2026 · branch `wip/pos-p1.17-oracle`, base `842cd4f7` (session/pos with P1.2 S, P1.3–P1.6 S, P1.9).
No DB here, so nothing was run against QC4. VPS command:
`bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p1.17.mts` (then again with `QC_FORCE=1`).
Contract: `ledger/pos-briefs/pos-brief-P1.17.md` (R1–R16, owner questions Q17.1–Q17.4).

## How the oracle works
- The fixture **writes rows directly** (PosSale/PosSaleLine/PosPayment/PosShift with frozen zReport/InvItem/InvMovement) into 3 sandbox units + 2 sandbox POS systems + 1 sandbox inventory system in the QC coffee tenant. Reports are read-only, so this does not depend on `createSale` (tip cannot be enabled through `createSale` until P1.6b). Only SB1 calls `createSale` (on the second POS, a date outside the tested range).
- Every expected number comes from the oracle's own computation over its bill spec (`expDaily/expProducts/expStaff/expPayments/expMargin/expShifts/expTax/expCard`). F1 asserts that computation equals the literal numbers in the brief, so a wrong oracle cannot pass silently.
- Days: D1 = 2026-09-14, D2 = 2026-09-15 BKK. Boundary bills at 23:59:30 BKK (D1), 00:00:30 BKK (D2) and 06:30 BKK (D2, but D1 in UTC), plus 09-13 23:59:59 and 09-16 00:00:00 outside the range.
- Bills: cash with tendered/change · card + cash split with 10% service charge and a ฿10 tip · PromptPay non-VAT bill (vat 0) · a VOIDED bill with a stock movement · cash + PromptPay split · transfer · a bill on the second POS. Two staff (coffee owner = A, coffee cashier = B), one bill with no seller and no shift, one with no seller but bound to B's shift. Shifts: B's CLOSED (Z#1, −฿4.50), A's OPEN on u2, one outside the range.
- Margin: latte has stored movement costs 1,200/1,300 while its current average is 1,500 (proves "stored first"); cake has no movements (estimate 2,500 each); a service line and a custom line are uncosted. The custom line name contains `,` and `"` (CSV escaping).
- SH2 tampers B7 to VOIDED after all other number checks, so it must stay near the end.

## Check list (35 · X: X2=3 X3=3 X4=17 · functional 12)
| id | X | what |
|---|---|---|
| ST1 | - | `reports.ts` exports the 9 functions |
| ST2 | - | `report-actions.ts`: use server, 3 async actions, call service, catch, no throw |
| ST3 | X3 | `pos.report.view` in the pos module |
| ST4 | - | `PosSale.soldByUserId String?`, additive migration, `CreateSaleInput.soldByUserId?`, createSale writes it, register passes `actor.userId` |
| ST5 | - | every PosSale query in `reports.ts` filters `unitId` + `createdAt` |
| ST6 | X4 | `reports.ts` read-only, no VAT recompute, no force-close |
| F1 | X4 | fixture written; Σpay = grand + tip; oracle numbers = brief literals |
| D1 | X4 | daily D1/D2 rows + totals, identities |
| D2 | X4 | BKK day cut, zero-day rows, range edges |
| D3 | - | equals legacy `closeDaySummary` per day |
| D4 | X2 | `unitId` filter |
| PR1 | X4 | products rows (keys, qty, gross, line discount, sales, billCount, order) |
| PR2 | X4 | Σ products = Σ subtotal = daily gross |
| SF1 | X4 | staff rows + names |
| SF2 | - | seller = soldBy ?? shift opener ?? null; voids to the seller |
| PM1 | X4 | payment rows in PAY_TYPE_ORDER, CASH tendered/change |
| PM2 | X4 | Σ paid = sales + tip |
| MG1 | X4 | margin rows: stored vs estimated vs uncosted, marginBp |
| MG2 | X4 | margin totals incl. net ex-VAT margin; voided movement excluded |
| SH1 | X4 | shifts: closed from Z + columns, open live, out-of-range excluded, totals |
| SH2 | X4 | Z stays frozen after a DB tamper; daily changes |
| TX1 | X4 | tax rows per (day, unit), receipt range, void numbers |
| TX2 | X4 | VAT from stored column; non-VAT bill stays 0 |
| CSV1 | X4 | daily CSV: BOM, header, cells, total line, filename, contentType |
| CSV2 | - | all 7 CSV kinds: BOM, header, line count, escaping |
| CD1 | X4 | dashboard card numbers (now injected) |
| V1 | - | range validation for 7 reports + CSV; 92 days ok; unknown kind |
| A1 | X3 | sell-only staff denied 7 + CSV; card allowed; no-POS staff denied card |
| A2 | X3 | branch-limited staff: own unit only, other unit NOT_FOUND, card scoped |
| I1 | X2 | cross-system isolation; inventory/unknown system and foreign unit NOT_FOUND |
| I2 | X2 | cross-tenant NOT_FOUND ×4 |
| SB1 | - | `createSale({soldByUserId})` stores it; omitted = null |
| R1 | - | ≥12 refusals, all data, none thrown |
| Z1 | - | row counts before = after (incl. InvItem/InvMovement/PosShift) + receipt seq sum |
| Z2 | - | fingerprint of existing QC rows unchanged |

## Expected results on the current base (842cd4f7)
- `--list`: exit 0, 35 ids. **Verified here.**
- `--no-db`: 0/6, exit 1. **Verified here.** All six are red for the right reason (no `reports.ts`, no actions file, no permission key, no `soldByUserId` anywhere).
- Unforced on the VPS: **SKIPPED, exit 0**. Reasons: the 9 missing exports and the missing `PosSale.soldByUserId`.
- Forced (`QC_FORCE=1`), expected **3 green / 32 red, exit 1**: F1 · Z1 · Z2 green. Every report check is red with `MISSING:<fn>`; SF1/SF2/SB1 also name the missing `soldByUserId`; D3 is red because the report row is missing (`closeDaySummary` itself works); R1 is red (0 refusals collected). No crash expected: every call goes through `call()`, the fixture is in one try, and cleanup is in `finally`.
- If F1 is red on the VPS the fixture failed (message names the step) — fix the oracle, not the builder.

## Names I had to invent (controller ratifies)
| name | where |
|---|---|
| `src/lib/modules/pos/reports.ts` · `reportDailySales` `reportProducts` `reportStaff` `reportPayments` `reportMargin` `reportShifts` `reportTax` `reportCsv` `posDashboardCard` | R1 |
| `ReportCtx = {tenantId, systemId, unitId?}` · result envelope `{ok, report:{kind, from, to, unitId, generatedAt, rows, totals}}` · `{ok, card}` · `{ok, filename, contentType, body}` | R1 |
| `src/lib/modules/pos/report-actions.ts` · `posReportAction` `posReportCsvAction` `posDashboardCardAction` | R14 |
| permission `pos.report.view` | R12 |
| column `PosSale.soldByUserId` · input `CreateSaleInput.soldByUserId` | R6 |
| row/total field names of the 7 reports and the card (brief R5–R10, R16) · product keys `p:`/`i:`/`s:`/`n:` | R5–R16 |
| CSV kinds `daily|products|staff|payments|margin|shifts|tax`, filename `pos-<kind>-<from>_<to>.csv`, the 7 Thai header rows, total line `รวม` | R11 |
| range cap 92 days | R2 |

## Drift found (for the controller)
- Plan text disagrees on the count: the WO row says 7 reports (`POS-MASTER-PLAN.md:70`), the design phase summary says "รายงานพื้นฐาน 6 ชุด" (`DESIGN-POS.md:371`). Brief follows the row (7).
- `DESIGN-POS.md:248` says the tax report is "ดึงจากบัญชี" (from the ledger). Brief reads the stored `PosSale.vatSatang`, which P1.6 R1 made identical to the ledger figure, and works for POS systems with no linked book. Ledger reconciliation stays with `qc-pos-account`.
- No seller is stored on `PosSale` and the register does not pass the actor into `createSale` (`register.ts:1616`) → staff report needs the new column (Q17.1). The spec's "ยอด/บิล/ส่วนลด/void ต่อคน" (`DESIGN-POS.md:243`) also wants "who voided"; not stored anywhere (`voidSale` has no actor), so voids are counted against the seller. A voidedBy column would be a P1.15/P1.16 item.
- `InvMovement` has no `refId` index (`inventory.prisma:181`); COGS must use the exact consumption keys via the unique `(tenantId, idempotencyKey)` index.
- `closeDaySummary` filters by `systemId` without `unitId` for unrestricted users, so it does not use the `(tenantId, unitId, createdAt)` index (same issue P1.9 R2 F1 fixed for shifts). Not changed here (S16 of P1.9 freezes it); the new reports filter `unitId IN`.
- `api/ops/reports.ts` loops `closeDaySummary` per day (3 queries/day, 31-day cap). P2.13 can switch those ops to `reportDailySales` (constant queries, 92 days).
- Tenant dashboard widgets (`lib/dashboard/service.ts:28`) use the first POS system of the tenant; the card API here is per POS system. Builder U decides the wiring.
- P1.9 out-of-scope listed "shift reports and monthly over/short (P1.17)": covered by `reportShifts` totals over any range ≤ 92 days.
- `computeReport` (`shift.ts:267`) is private; R9 needs it exported (or a read-only twin) for OPEN shifts.
- Possible flake: SH2's fixture shift is OPEN with `openedAt` 2026-09-15; if a `forceCloseStaleShifts` sweep ran on QC4 during the run it would close it (SH1/CD1 red). No cron is known to run against QC4.

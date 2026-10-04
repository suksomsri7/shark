# POS P1.17 S — basic reports, server side (builder notes)

Builder S · cloud run · 4 Oct 2026 · base `p117-local` 117dae49 (= `wip/pos-p1.17-oracle`) + merge of `origin/wip/pos-p1.9b` (ea2e6a29, stacked because node_modules is shared) · pushed to `wip/pos-p1.17`.
Brief `ledger/pos-briefs/pos-brief-P1.17.md` (R1–R16, owner questions Q17.1–Q17.4 built with the **recommended defaults**) · oracle `scripts/qc-pos-p1.17.mts` (not edited).
No DB here: no DB mode was run. The controller applies the migration to QC4 and runs the DB oracle.

## Migration
`prisma/migrations/20261126000000_pos_p117_reports/migration.sql` (sorts after `20261125000000_pos_p19b_shift_recount`).
- Body = `prisma migrate diff --from-schema <prisma/schema before the edit, copied to scratch> --to-schema prisma/schema --script`, verbatim:
  `ALTER TABLE "PosSale" ADD COLUMN "soldByUserId" TEXT;`. A header comment plus `SET lock_timeout = '3s';` sit on top (same style as P1.9/P1.9b).
- Nullable, no default ⇒ catalog-only change, no table rewrite. No FK (loose `User.id`, like `shiftId`), **no index** (R6; reports reach bills through `(tenantId, unitId, createdAt)` first). No DROP/RENAME/SET NOT NULL.
- Schema ↔ SQL: the diff from the pre-edit copy printed exactly that one statement. `prisma generate` was run (shared node_modules; superset of P1.9b's client).

## What was built
| step | commit | files |
|---|---|---|
| 1 column + writer | f167d685 | `prisma/schema/pos.prisma` (`PosSale.soldByUserId String?`) · migration · `service.ts` (`CreateSaleInput.soldByUserId?: string`, written as `input.soldByUserId ?? null`; `lineConsumption`, `PAY_TYPE_ORDER`, `PAY_TYPE_LABEL_TH` now exported) · `register.ts` (`soldByUserId: actor.userId`) · `actions/pos.ts` legacy POS action (`soldByUserId: auth.user.id`) |
| 2 reports | 80da68a2 | `pos/reports.ts` (new) · `pos/report-actions.ts` (new) · `core/permissions.ts` (+1 marked line `pos.report.view`) · `shift.ts` (`computeReport` exported, 1 marked line) · `src/messages/{th,en}/pos.json` (new top-level `report` block, appended) |

- `soldByUserId` is **not** part of `samePayload` (idempotency), so a replay with a different actor still returns the same bill; payload-hash semantics unchanged. All other `createSale` callers (hotel, restaurant, booking, shop, ticket, rental, school, clinic, giftcard, subscription, REST ops, AI proposals) pass nothing ⇒ null.
- `reports.ts` (read-only, no `"use server"`): `reportDailySales · reportProducts · reportStaff · reportPayments · reportMargin · reportShifts · reportTax · reportCsv · posDashboardCard`, signature `(ctx, actor, input, client?)`, refusals returned. Also exports types, `REPORT_KINDS`, `isReportKind`, `CSV_HEADERS`, `bkkBusinessDate`, `REPORT_PERMISSION`, `CARD_PERMISSION`, `REPORT_MAX_DAYS`.
  - Queries per report are constant: one `posSale.findMany` (`tenantId, systemId, unitId IN, createdAt [start,end), status IN (PAID,VOIDED)`, selected columns only) + lines/payments by `saleId IN` chunks of 1000 + movements by `(tenantId, idempotencyKey) IN` + items/users/shifts by id. No per-day loop. The single `posSale.findMany` lives in `loadSales`.
  - Shifts: `posShift.findMany` by `tenantId, systemId, unitId IN, openedAt range`; closed rows read `billCount/salesTotalSatang/tipSatang` from the frozen `zReport` and the cash figures from the row columns; OPEN rows use the exported `computeReport` (read-only).
- `report-actions.ts` (`"use server"`, only async functions, no throw): `posReportAction`, `posReportCsvAction`, `posDashboardCardAction`. Session → ctx/actor like `shift-actions.ts`; a coarse tenant-level `assertCan` (report actions: `pos.report.view`, card: `pos.sale.create`) is needed for fitness F6.1 (an action file without `assertCan` is CRITICAL); the per-unit decision stays in `reports.ts`. Unexpected errors → `{ok:false, code:"INTERNAL"}` with `unstable_rethrow`. No revalidate.
- CSV = server action returning `{filename, contentType, body}` (R14); no route handler was added (the brief asks for none; builder U turns the body into a download).

## Where each owner default lives (easy to change)
| question | default built | code |
|---|---|---|
| Q17.1 seller | `soldByUserId ?? shift opener ?? null ("ไม่ระบุ")` · new bills from the register **and the legacy POS action** store the session user | `reports.ts` `sellerOf()` · `register.ts` / `actions/pos.ts` one line each |
| Q17.2 day cut | midnight Bangkok | `reports.ts` `DAY_CUTOFF_MINUTES = 0` (feeds `bkkBusinessDate` / `dayStart`) |
| Q17.3 margin basis | line totals incl. VAT, before bill discount; cost = stored movement cost, else current average cost ("estimated"); shop-level `netExVatSatang` / `netMarginSatang` in totals | `reports.ts` `lineCost()` + `reportMargin` |
| Q17.4 who sees | reports + CSV = `pos.report.view`; card = `pos.sale.create` | `reports.ts` `REPORT_PERMISSION` / `CARD_PERMISSION` · `permissions.ts` key |

## Rules I invented (controller to ratify)
1. **Order of refusals**: ctx shape / system / unit (NOT_FOUND) → permission (PERMISSION_DENIED) → range (VALIDATION). An invalid actor object = PERMISSION_DENIED.
2. **ctx.unitId the user can access but without `pos.report.view` = PERMISSION_DENIED** (the brief says NOT_FOUND for "cannot access with the report permission"). A unit the user cannot access at all, or one from another tenant, is NOT_FOUND. The oracle does not test the split (A2 uses an inaccessible unit). One-line change in `scopeOf` if the controller wants NOT_FOUND.
3. The POS system may be inactive (`AppSystem.active` not checked) so history stays readable; units include archived ones (R13).
4. **Stored cost needs all of a line's consumption keys** (bundle parts too). If any key is missing: lines with `itemId` fall back to the estimate (current `InvItem.costSatang × (weightGrams ?? qty)`); bundles without `itemId` are uncosted. Movement cost = `|qtyDelta| × costSatang`.
5. `limit` (products/margin rows) must be an integer 1–1000 if sent, else VALIDATION. CSV always uses 1000 (so CSV shows up to 1000 rows; totals always cover all).
6. Products: row ids/name come from the **newest** line of that key (by bill time, then line id). Totals add `rowCount`, `weightGrams`, `billCount` (distinct bills).
7. Margin totals add `grossMarginBp` (used for the CSV total line's %); rows add `costedRevenueSatang`.
8. Payments: unknown pay types (none today) would follow `PAY_TYPE_ORDER`, sorted by code. Non-CASH rows carry no tendered/change fields.
9. Shifts: a closed shift with an empty `zReport` (cannot happen through `finalizeClose`) falls back to the live computation rather than zeros; `forced = status === "FORCE_CLOSED"`. `expectedCashSatang` of a closed row = column, else the Z value. Rows add `unitName`; totals add `tipSatang`.
10. Tax: `voidReceiptNos` skips null receipt numbers; first/last receipt may be null if bills have none.
11. CSV cells: staff null seller → user id empty, name `ไม่ระบุ`; shifts status in Thai (`เปิดอยู่` / `ปิดแล้ว` / `ระบบปิดให้`), device = label ?? id, opener = name ?? id; total lines put sums under the money/count columns and leave the rest empty; payments total = Σ count, bill count, Σ paid; margin total % = `grossMarginBp`. Money formatted from integers (identical to `(s/100).toFixed(2)`).
12. Card: `now` must be a valid `Date` if sent (else VALIDATION); `openShiftCount` counts OPEN shifts of this POS system in the scope units.
13. Messages: new `report` block (title, range labels, 7 kind names, card labels) in `src/messages/{th,en}/pos.json` for builder U; server refusal messages are Thai strings in `reports.ts` (same as `shift.ts`).

## Checks (this tree, no DB)
| command | result |
|---|---|
| `NODE_OPTIONS=--max-old-space-size=5632 pnpm typecheck` | exit 0 (after step 1 and step 2) |
| `env -u DATABASE_URL -u DIRECT_URL pnpm fitness` | step 1: 41/41 · step 2 first try 40/41 (F6.1: action file without `assertCan`) → coarse `assertCan` added → **41/41, exit 0** |
| `pnpm exec tsx scripts/fitness-pos.mts` | 8/8, exit 0 |
| `qc-pos-p1.17 --no-db` | step 1: 1/6 (ST4) · final **6/6, exit 0** |
| `qc-pos-p1.17 --list` | 35 ids, exit 0 |
| `qc-pos-p1.9b --no-db` · `p1.9` · `p1.4` · `p1.5` | 8/8 · 13/13 · 13/13 · 5/5, exit 0 |

No fitness baseline was raised. Not run here: any DB mode, build, `fitness` with `.env`, money set (COMMON §7), `qc-pos-account`.

Offline trace: the oracle's fixture (10 bills, 3 shifts, movements, item costs) was replayed through `reports.ts` with an in-memory fake Prisma client (scratch only, not committed). Every brief literal came out: D1 4 bills / 55,450 / VAT 3,431 / ex-VAT 52,019 / avg 13,862 / void 1·18,000; D2 9,000 / 2; products Σ 63,000 (latte 22,500 · 5 · 4 bills; service 20,000; cake 17,500 gross 18,000 disc 500; custom 3,000); staff B 3/43,450/tip 1,000/void 1·18,000, A 2/16,500/disc 1,000, null 1/4,500; payments CASH 4/35,950 (42,500/6,550), PROMPTPAY 2/5,000, TRANSFER 1/4,500, CARD 1/20,000, Σ 65,450 = 64,450 + 1,000; margin latte cost 6,100 margin 16,400 7,288 bp, cake est 7,500, totals 63,000/40,000/13,600/26,400/23,000·2/60,431/46,831; shifts SH Z 3/43,450/tip 1,000, 72,450/72,000/−450 Z#1, SH2 live 0/100,000, SH0 excluded, totals −450 short 1 open 1; tax 4 rows (D1/u1 52,450 VAT 3,431 base 49,019 first 0001 last 0004 void [0003]; D1/u2 3,000 non-VAT; D2 4,500/294 ×2), Σ VAT 4,019; card D2 9,000/2/4,500, yesterday 55,450, −8,377 bp, 1 open shift, latte 2/9,000; u1-only 52,450/3 · 4,500/1, u2 → NOT_FOUND, card u1 4,500/1/0 open; sell-only → PERMISSION_DENIED; all 6 bad ranges VALIDATION for reports and CSV; 92 days → 92 rows; bogus kind VALIDATION; inventory system / other tenant NOT_FOUND; CSV bodies BOM + exact headers + "รวม" + escaping `"พิมพ์เอง, ""พิเศษ"""`.

## Expected DB result (VPS, after `prisma migrate deploy` of 20261126000000 on QC4)
Unforced = forced: **35/35, exit 0**. Per check:
| id | expected | why |
|---|---|---|
| ST1–ST6 | green | verified here (`--no-db` 6/6) |
| F1 | green | fixture writes `soldByUserId` once the column exists (HAS_SOLDBY) |
| D1 · D2 · D3 · D4 | green | traced above; D3 = `closeDaySummary` over the same system (all units for the owner) |
| PR1 · PR2 | green | keys `p:`/`s:`/`n:`, sort by sales then key; Σ 63,000 = daily gross |
| SF1 · SF2 | green | `sellerOf`; B7 → B through shift SH; B6 → null; void B4 → B; names `name || email` |
| PM1 · PM2 | green | traced above |
| MG1 · MG2 | green | movements looked up by the fixture's `pos-consume-<sale>-<line>` keys; B4 (VOIDED) lines never loaded |
| SH1 · SH2 | green | Z values for SH; the tamper of B7 changes only the daily D2 row (1/4,500, void 1); SH row identical |
| TX1 · TX2 | green | traced above; VAT summed from the column |
| CSV1 · CSV2 | green | traced above |
| CD1 | green | traced above |
| V1 · A1 · A2 · I1 · I2 | green | traced above (I2: coffee system with the resto tenant → system lookup fails → NOT_FOUND ×4) |
| SB1 | green | `createSale` stores `soldByUserId` / null |
| R1 | green | ≥ 48 refusals from V1 alone, all returned |
| Z1 · Z2 | green | reports write nothing; SB1's sales are cleaned by the oracle |

Risk to watch: any older oracle that fingerprints a register-made `PosSale` row column-by-column would now see `soldByUserId` set (new column, additive). None found by name in the static checks run here; `qc-pos-p1.3`/`p1.6`/`qc-pos-account` should be run on the VPS as the brief's acceptance asks.

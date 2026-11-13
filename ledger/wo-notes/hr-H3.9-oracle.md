# H3.9 — oracle notes (`scripts/qc-hr-h3.9.mts`)

52 checks · **47 RED-by-design · 5 GREEN controls** (S1.5 frozen/tabs · S2.0 fixture · S3.0 DB fixture · X12.1 fitness no env · Z1 residue). `--list` prints the registry. Unforced run while `hr/reports-rules.ts` is absent = `SKIPPED` exit 0. Statics use `baseRef("QC_H39_BASE")` (merge-base with origin/session/hr; fallback 5d7bcf0c4). v2 checks S7.1/S7.2/S7.3 are presence-guarded on `hr/payroll-run-rules.ts` (H3.4): absent ⇒ "n/a — H3.4 absent" ⇒ fail, no crash.

Run (lane DB wo-hr-qc-l2):
`bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h3.9.mts`

## 1. Groups
S1 static (files · migration/table · pure imports · one writer · frozen · banned tokens/read ownership/no recompute · route/page · nav · UI · marked hunks) · S2 pure vectors + goldens through `reportTable`/`reportBytes` · S3 DB goldens per report + register writer + export bytes · S4 privacy matrix (10 viewers × 9 reports × page/CSV = 180 cells) + full-ID setting S4.8/S4.9 · S5 audit/route/input/guard · S6 performance (300 employees) · S7 v2 seam + finalized rule (needs H3.4).

## 2. Independence
- The CSV text an export must equal is built by the oracle's own `csvTextOf` (BOM + `,` + CRLF + quote on `, " CR LF` or edge space) from golden tables; XLSX is read back with `dorm/import-parse#parseImportFile`.
- Totals in the fixture are re-summed by S2.0 with the oracle's own baht/tenths parser (control).
- S7.1 expected values are the stored item fields and Σ of `lines` by code — aggregation spec, not the engine.
- Gates in S4.1 are the design matrix typed into the oracle (`ALLOW`, `MONEY`, `FULLID`), not read from the code.

## 3. Hand derivations (fixture `scripts/fixtures/hr-h3.9-vectors.json`)
Employees (system A): e1 A01 u1 (linked to `self`) · e2 A02 u1 · e5 A03 u1 ended 2031-09-30 (inactive) · e3 B01 u2 · e4 no code, no branch. Sort = code (none last) → A01, A02, A03, B01, e4.

**time 2031-10** (judge rows; 09-30 and 11-01 rows are out of period):
- e1: rows 10-01 ON_TIME 450 · 10-02 LATE 12/438 · 10-03 EARLY_OUT 30/420 · 10-04 ABSENT span 480 leave 0.5 · 10-05 DAY_OFF · 10-06 LEAVE 1.0 · 10-07 s1 LATE 5/500 ot 25 missingOut · 10-07 s2 ON_TIME 240. slots = 7 (all but DAY_OFF) · workedDays = {01,02,03,07} = 4 · late 2 / 17 · early 1 / 30 · absent 1 day, ⌊480 × 0.5⌋ = 240 · leave 0.5 + 1.0 = 1.5 · worked 450+438+420+500+240 = 2048 · OT 25 · missingOut 1 · corrections: APPROVED 10-07 = 1 (PENDING 10-08 and APPROVED 09-30 excluded).
- e2: ABSENT 22:00–06:00 overnight span 360 − 1320 + 1440 = 480 · ON_TIME 480 · NO_SCHEDULE ⇒ slots 2, worked days 1, absent 1/480, worked 480.
- e3: ON_TIME 300, ot 10 ⇒ 1/1/…/300/10. e4: LATE 60, worked 420.
- Totals 11 · 7 · 3 · 77 · 1 · 30 · 2 · 720 · 1.5 · 3248 · 35 · 1 · 1. Branch u1 (e1+e2): 9 · 5 · 2 · 17 · 1 · 30 · 2 · 720 · 1.5 · 2528 · 25 · 1 · 1.

**ot 2031-10** e1: PENDING 1 (10-10), APPROVED 3 (10-02 120 settled · 10-06 240 settled · 10-13 90 unsettled), REJECTED 1 (10-11), CANCELLED 10-12 ignored (even with segments), 11-02 out of period. approvedMin 120+240+90 = 450 · segments: OT_WORKDAY 120 / ฿187.50 · HOLIDAY_WORK 180 / ฿250.00 · OT_HOLIDAY 60 / ฿250.00 · amount 187.50 + 500.00 = 687.50. e3: 1 approved 60 settled OT_WORKDAY ฿93.75. Totals 1 · 4 · 1 · 510 · 180 · 180 · 60 · 281.25 · 250.00 · 250.00 · 781.25. Manager u1: e1 row without the 4 ฿ columns.

**payroll** (item identity gross − ssoE − wht = net holds for every item):
- R9 2031-09 APPROVED v1: e1 gross 15,187.50 add 187.50 sso 750 wht 100 net 14,337.50 · e5 gross 11,500 deduct 500 sso 600 net 10,900.
- R10 2031-10 PAID v2, payDate 2031-10-31T20:00Z = **2031-11-01 Bangkok**: e1 lines BASE 15,000 · UNPAID_LEAVE −312.50 · HOLIDAY_WORK 312.50 · OT 687.50 · LATE_RULE −20 ⇒ E0 15,000, add 687.50, deduct 20, gross 15,667.50, sso 749 (5 % of 14,980), wht 123.45, net 14,795.05, whtIncome 15,667.50 · e3 gross 10,000 sso 500 net 9,500 · e4 HOURLY HOUR_WAGE 8,400 sso 420 net 7,980.
- R8 2031-08 REVERSED and R11 2031-11 DRAFT ⇒ never in any report (their amounts 99,999 / 88,888 would show).
- R12 2030-12 APPROVED v1 e1 gross 14,000 sso 700 wht 90.
- payroll-month 2031-10 totals 34,067.50 · 687.50 · 20.00 · 1,669 · 1,669 · 123.45 · 32,275.05; branch u1 = e1 only (net 14,795.05 ≠ run 32,275.05).
- payroll-year 2031: e1 runs 2, gross 15,187.50 + 15,667.50 = 30,855 · add 875 · deduct 20 · sso 1,499 · wht 223.45 · net 29,132.55; e5/e3/e4 one run each; totals 5 · 60,755 · 875 · 520 · 3,019 · 3,019 · 223.45 · 57,512.55.

**tax** (Bangkok pay month; income v1 = base + add, v2 = whtIncomeSatang):
- tax-month 2031-09: e1 15,000 + 187.50 = 15,187.50 · e5 12,000 + 0 = 12,000 (deduction not subtracted — H3.4 prior rule) · ssoBase 15,000 / 12,000.
- tax-month 2031-10: empty (R10 pays on 11-01 BKK). tax-month 2031-11: e1 15,667.50 / wht 123.45 / base 14,980 · e3 10,000 · e4 8,400.
- tax-year 2031: e1 months 2, income 30,855 · e5 12,000 · e3 10,000 · e4 8,400 ⇒ 61,255; wht 223.45; sso 3,019. Branch u1: e1+e5 ⇒ 3 · 42,855 · 223.45 · 2,099. tax-year 2030: e1 14,000 / 90 / 700.
- IDs masked: e1 1101700203451 ⇒ •••3451 · e2 3-1006-01234-56-7 ⇒ digits …4567 · e4 5000011111223 ⇒ •••1223 · e3/e5 none ⇒ "".

**wages 2031-10**: e1 rate = BASE 15,000 · wage = 15,000 − 312.50 − 20 = 14,667.50 · ot 687.50 · holiday work 312.50 · worked 4 days / 2048 min (time rules) ⇒ wage + holiday work + ot = 15,667.50 = gross. e3 rate 10,000. e4 HOURLY: no BASE line ⇒ rate "", wage 8,400. Totals days 6, min 2768, wage 33,067.50. **wages 2031-09** (v1): e1 rate = wage = 15,000, ot 187.50 (adjustment kind OT), 1 day / 480 (09-30 row) · e5 12,000, deduct 500.

**register 2031-10-31**: ages e1 1990-02-28 ⇒ 41 · e2 2000-10-31 ⇒ 31 (birthday on the day) · e5 1995-05-05 ⇒ 36 · e4 1985-12-01 ⇒ 45 (not reached). Address e1 = 5 parts joined by one space; e2 province only. Position e1 "แคชเชียร์ / หน้าร้าน". Rates from salary profiles: e1 MONTHLY 15,000 · e2 DAILY 500 · e5 MONTHLY 12,000 · e4 HOURLY 60 · e3 none. Register rows (table, raw insert): e1 ไทย + "ค่าอาหาร 50 บาท/วัน" · e5 เมียนมา · e4 ไทย. Warnings: gender 1 (e3) · nationality 2 (e2, e3) · birthDate 1 · address 3 (e5, e3, e4) · position 1 · rate 1; startDate 0 omitted. Active employees 4 < 10 ⇒ note `registerUnder10`.

**pure**: `bahtText(-5)` = "-0.05"; `absentMinOf` 3-minute span × 0.5 = ⌊1.5⌋ = 1; `whtIncomeOf` v2 string "999" ⇒ 0 (not a safe integer); `ageOn("2000-02-29","2031-02-28")` = 30, `…"2031-03-01"` = 31.

## 4. Sentinels (S4.6)
Every employee carries phone, e-mail, bank name/account, account name, house-registration address, SSO number and note sentinels; leave/OT/correction rows carry a reason sentinel; e5 an offboard note. None may appear in any DTO, export, audit row or captured console line.

## 5. Controller rulings 13 Nov (oracle edits by the oracle writer, before any build)
- **Q1** payroll viewers see the leave report: `ALLOW.payAll/payBranch` include `leave`; S3.2 adds payAll = owner rows and payBranch = owner rows of u1 employees.
- **Q2** no full ID by default: S3.7/S3.9 expect the masked register export (golden `pageIds`); S4.4 = no full ID in any page/export of any viewer; new S4.8 (setting writer: owner only · acknowledge to turn ON · default OFF · other settings keys kept · audit) and S4.9 (ON: owner/payAll register export full, branch payroll masked, pages and tax exports masked, export audit `fullId` true/false, OFF again masked); S5.1 audit keys + `fullId`. Texts `fullIdWarning · ackFullId · settingOwner · fullIdLabel`.
- **Q5** v2 runs count only when finalized (`journalEntryId` ∨ `stepsJson.finalized`): fixture R10 now carries a journal id; new S7.3 behind the H3.4 presence guard (stepsJson column).
- Fixes from the first forced run: base = merge-base with origin/session/hr unless that is older than the cut point 5d7bcf0c4 (origin/session/hr lags the local merges; S1.5 saw H3.5 files as "changed"); S4.6 requires ≥ 40 served cells (passed vacuously without the module).

## 6. Runs
Seed 34/34 · unforced SKIPPED exit 0 · forced ×2 identical, BASE-EXPECTATION 52/52 as registered (`hr-H3.9-red.txt`).
Clean typecheck (rm -rf .next/types tsconfig.tsbuildinfo · iso.sh · gate lock): tsc --noEmit exit 0, 0 errors

## 7. ORACLE-EDITs (builder H3.9 · controller rulings 13 Nov — every hunk marked `ORACLE-EDIT` in the oracle)
1. **S4.6 payType** — `payType` is a catalog column of `wages`/`register`; allowed as a DTO key only for money viewers in those two reports (still forbidden everywhere else). Keys are scanned on served DTOs only: a refusal `{ok:false, code, reason}` (brief contract, S4.7) carries the fixed text under `reason` — that tripped the old scan on every refused cell (hidden by `slice(0, 6)`); secrets still scan every cell.
2. **S4.6 seen** — `seen === 36` (9+9+9+3+3+1+2 allowed cells; 40 needed serving another tenant's owner).
3. **S7.1** — the stored v2 run carries `journalEntryId` (finalized) so ruling Q5 counts it; S7.3 "neither ⇒ excluded" unchanged.
4. **Ruling A (revoked OT)** — fixture +2 OT rows on e1: 10-14 CANCELLED + revokedAt, settled, HOLIDAY_WORK 120 min / ฿150.00 (kept by H3.4) · 10-15 APPROVED + revokedAt, OT_WORKDAY 30 / ฿46.88 (counts nowhere). Catalog `ot` + `keptHolidayWorkMin` (P, sum) after `otHolidayMin` and `keptHolidayWorkAmt` ($, sum) before `amount`; goldens: e1 kept 120 / 150.00, e3 0 / 0.00, totals 120 / 150.00; approved/approvedMin/amount unchanged (3 · 450 · 687.50). `columnsFor` pin `ot:noMoney` + `keptHolidayWorkMin`. S3.0 OT count 10. S4.5 money list + 150.00, 46.88. New **S3.10**.
5. **Ruling B** — new **S3.11**: duty/under-10 note only for all-branch viewers (owner, payAll); payBranch gets neither (retention note kept).
6. **Membership gate** — new **S1.11** (static: every exported async fn of reports.ts calls `gateOf(`; page/route/actions reach data only through reports.ts) and **S4.10** (db: other-tenant owner and a member claiming OWNER ⇒ NO from loadReport · exportReport · get/setReportSettings · load/saveRegisterFields, route 404, nothing written).
Base: origin/session/hr now contains H3.4 (9e8ad6386) ⇒ default base resolves to it; BASE_CUT logic left as is (it only applies when the merge-base predates the cut).

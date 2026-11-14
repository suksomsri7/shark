# H4.2 oracle — STOP before writing (Q4 ruling vs brief numbers), 13 Nov

Head before this note: dd95e0f6c (`wip/hr-h4.2`). No oracle written, no DB command run.

## Engine day-rate rule for MONTHLY (Q4 ruling: "same rule as the payroll engine")
- `src/lib/modules/hr/payroll-run-rules.ts:9`: "÷30 สำหรับเข้า/ออกกลางเดือนและลาไม่รับค่าจ้าง [U]"; ม.68 hourly = base ÷ (30 × N)
- `:325` + `:333`: proration `earned = min(base, halfUp(base × d / 30))`; a full calendar month = base (no PRORATION line)
- `:369`: holiday work MONTHLY den = 30 × min(480,N) × 10,000
- `:376`: unpaid leave = floor(base × min / (30 × N))
- `:197 daysInMonth` is only used for period validation, never as a divisor.
⇒ the engine divides by **30**, not by calendar days D. The brief body (D4, S2, S3) divides by D.

## Worked example S3 (Sat 2027-01-16, D=31, SSO 500 bp, maxBase 1,750,000, N=480)
| | brief (÷D) | engine rule (÷30, halfUp; marginal reading earned(16)−earned(15) gives the same) |
|---|---|---|
| A MONTHLY 1,550,000 wage | 50,000 | 51,667 |
| A SSO (D5 with D=31) | 2,500 | 2,583 (also 2,583 if D5 uses 30) |
| B DAILY / C HOURLY | 40,000+2,000 / 48,000+2,400 | unchanged |
| D MONTHLY 3,100,000 off | 100,000 + 2,823 | 103,333 + 2,823 (D5 ÷31) or + 2,917 (D5 ÷30) |
| wage / SSO / day cost | 238,000 / 9,723 / **247,723** | 243,000 / 9,806 / **252,806** (or 9,900 / 252,900) |
| pct tenths (sales 1,000,000) | **248** | **253** (both SSO readings) |
| hour 12 (A+B) | 11,229 | 6,781+4,667 = **11,448** |
| hour 15 (B+C) | 10,967 | 10,967 |
| A hours | 07–10 6,563 · 11–14 6,562 | 07–08 6,782 · 09–14 6,781 (54,250/8, LR earliest) |
| Σ hours / unallocated | 144,900 / 102,823 | 146,650 / 106,156 (or 106,250) |

Brief numbers are internally consistent under ÷D (re-derived; all match).
Other brief items affected: S2 "monthly Σ = base for D 28/29/30/31 (1,000,000/31 ⇒ 32,259/32,258)" is false under ÷30
(33,333/day, 31 days = 1,033,323); S4 "no run ⇒ ESTIMATE = Σ days" ≠ base for 28/29/31-day months; D5 "wage×D".
Unaffected: MONTHLY 3,000,000 PUBLIC m=480 ⇒ +100,000 (already engine den ÷30 at :369), DAILY/HOURLY vectors, demand/forecast.

## Questions for the controller
1. MONTHLY per-day = halfUp(base/30) every calendar day (31-day month sums to 31/30·base, Feb to 28/30·base)? Or marginal
   min(base, halfUp(base·k/30)) − previous (day 31 = 0, Feb short)? Or keep ÷D (sums to base) as the "no such rule" fallback?
2. D5 SSO pro-rata: keep D (calendar days) or 30?
3. Re-issue S2/S3/S4 numbers accordingly (the oracle would assert the table column you pick).

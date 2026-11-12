# H3.4 oracle — hand arithmetic of every literal (independent of the code under test)

**r3 (13 Nov 2026): SSO wage = the components listed in the dated SSO law row (`wageComponents`, default BASE · ALLOWANCE · LATE_REFUND · COMMISSION [U]; OT, holiday-work premium and BONUS out — T-HR-09); one-off payments (BONUS, `oneOff` rows) taxed by Por.96/2543 ข้อ 1(5) = annual tax with − without, withheld in the month paid (`whtOneOffSatang`). Tags `[r3-value]` / `[r3-new]` / `[r3-schema]` supersede r2 tags (r3-schema = only the new key `whtOneOffSatang`).**

**r2 (13 Nov 2026, controller rulings L1–L9 + `shark-thai-law` domain-labour-payroll):** every vector is re-derived. Tags: `[r2-value]` = expected numbers changed · `[r2-schema]` = numbers unchanged, output keys changed (`catCapSatang`/`totalCapSatang`/`receivable`, flags `SSO_MIN_BASE`) · `[r2-new]` = added. All r2 literals are hand/reference arithmetic only — **re-verify on a lane DB** (RED run to be redone by the controller).
Law rows: SSO 5 %, wage base 165,000–1,750,000 satang (2569–2571 row, max 875 ฿, min 83 ฿ — กฎกระทรวง 2568 [V]); a second dated SSO row with max 2,000,000 (the 2572 step) for V58 and the Oct DB run · tax bands 0/5/10/15/20/25/30/35 % at 150k/300k/500k/750k/1M/2M/5M ฿ (first 150,000 at 0 % = พ.ร.ฎ. 470 via the law row) · expense 50 % cap 100,000 ฿ · personal 60,000 ฿ · spouse 60,000 ฿ · child 30,000 ฿ · SSO allowance cap 9,000 ฿.
Cross-check anchors: V02 WHT 17,083 = H3.3 ITM-01 WHT (SSO there was 750 ฿; the 875 ฿ row leaves WHT unchanged because the 9,000 ฿ SSO allowance cap binds) · OTN-01 = H2.9 worked example (17,500) · V59/V60 = T-HR-08 (500.50 → 501 ฿, 500.45 → 500 ฿) · `halfUp(a/b)` = ⌊a/b⌋ + (2·rem ≥ b) · `floor` = ⌊a/b⌋.
Defaults of a vector (fixture `_meta.defaults`): N 480 · category cap 1000 bp · total cap 2000 bp · month 1 · SSO eligible · prior 0 · no deductions.

## A. Pure vectors (S2)
### V01 — monthly 15,000 · full month · nothing else `[r3-schema]`
- BASE 1500000
- E0 (pay lines) = 1500000
- whtIncome = E 1500000 + taxable adds 0 = 1500000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 1500000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 1500000
- SSO: wage 1500000 → base clamp(1,650–17,500 ฿) = 1500000 · ×5% = 75000.00 → baht half-up 750 ⇒ 75000
- WHT (YTD, month 1, k=11): projected income = 0 + 1500000 + 1500000×11 = 18000000 · projected SSO = 0 + 75000 + 75000×11 = 900000 · expense min(50%, 100,000 ฿) = 9000000 · net = 18000000 − 9000000 − 6,000,000 − min(900000, 900,000) = 2100000 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 1500000 + 0 + 0 − 75000 − 0 = 1425000
- net = 1425000
- gross = E0 1500000 + add 0 − deduct 0 = 1500000 (= net + SSO + WHT)
- ⇒ gross 1500000 · SSO 75000 · WHT 0 · net 1425000 · carry — · flags —

### V02 — monthly 30,000 · SSO ceiling 750 ฿ · = H3.3 ITM-01 parity `[r3-schema]`
- BASE 3000000
- E0 (pay lines) = 3000000
- whtIncome = E 3000000 + taxable adds 0 = 3000000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 3000000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 3000000
- SSO: wage 3000000 → base clamp(1,650–17,500 ฿) = 1750000 · ×5% = 87500.00 → baht half-up 875 ⇒ 87500
- WHT (YTD, month 1, k=11): projected income = 0 + 3000000 + 3000000×11 = 36000000 · projected SSO = 0 + 87500 + 87500×11 = 1050000 · expense min(50%, 100,000 ฿) = 10000000 · net = 36000000 − 10000000 − 6,000,000 − min(1050000, 900,000) = 19100000 · annual tax 205000 · due 205000 − 0 = 205000 ⇒ ÷12 half-up = 17083
- available = 3000000 + 0 + 0 − 87500 − 17083 = 2895417
- net = 2895417
- gross = E0 3000000 + add 0 − deduct 0 = 3000000 (= net + SSO + WHT)
- ⇒ gross 3000000 · SSO 87500 · WHT 17083 · net 2895417 · carry — · flags —

### V03 — monthly 1,000 · SSO floor 83 ฿ `[r3-schema]`
- BASE 100000
- E0 (pay lines) = 100000
- whtIncome = E 100000 + taxable adds 0 = 100000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 100000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 100000
- SSO: wage 100000 → base clamp(1,650–17,500 ฿) = 165000 · ×5% = 8250.00 → baht half-up 83 ⇒ 8300
- WHT (YTD, month 1, k=11): projected income = 0 + 100000 + 100000×11 = 1200000 · projected SSO = 0 + 8300 + 8300×11 = 99600 · expense min(50%, 100,000 ฿) = 600000 · net = 1200000 − 600000 − 6,000,000 − min(99600, 900,000) = 0 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 100000 + 0 + 0 − 8300 − 0 = 91700
- net = 91700
- gross = E0 100000 + add 0 − deduct 0 = 100000 (= net + SSO + WHT)
- ⇒ gross 100000 · SSO 8300 · WHT 0 · net 91700 · carry — · flags ['SSO_MIN_BASE']

### V04 — monthly 50,000 · 5% band `[r3-schema]`
- BASE 5000000
- E0 (pay lines) = 5000000
- whtIncome = E 5000000 + taxable adds 0 = 5000000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 5000000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 5000000
- SSO: wage 5000000 → base clamp(1,650–17,500 ฿) = 1750000 · ×5% = 87500.00 → baht half-up 875 ⇒ 87500
- WHT (YTD, month 1, k=11): projected income = 0 + 5000000 + 5000000×11 = 60000000 · projected SSO = 0 + 87500 + 87500×11 = 1050000 · expense min(50%, 100,000 ฿) = 10000000 · net = 60000000 − 10000000 − 6,000,000 − min(1050000, 900,000) = 43100000 · annual tax 2060000 · due 2060000 − 0 = 2060000 ⇒ ÷12 half-up = 171667
- available = 5000000 + 0 + 0 − 87500 − 171667 = 4740833
- net = 4740833
- gross = E0 5000000 + add 0 − deduct 0 = 5000000 (= net + SSO + WHT)
- ⇒ gross 5000000 · SSO 87500 · WHT 171667 · net 4740833 · carry — · flags —

### V05 — monthly 120,000 · spouse + 2 children · several bands `[r3-schema]`
- BASE 12000000
- E0 (pay lines) = 12000000
- whtIncome = E 12000000 + taxable adds 0 = 12000000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 12000000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 12000000
- SSO: wage 12000000 → base clamp(1,650–17,500 ฿) = 1750000 · ×5% = 87500.00 → baht half-up 875 ⇒ 87500
- WHT (YTD, month 1, k=11): projected income = 0 + 12000000 + 12000000×11 = 144000000 · projected SSO = 0 + 87500 + 87500×11 = 1050000 · expense min(50%, 100,000 ฿) = 10000000 · net = 144000000 − 10000000 − 6,000,000 − 6,000,000 spouse − 2×3,000,000 − min(1050000, 900,000) = 115100000 · annual tax 15275000 · due 15275000 − 0 = 15275000 ⇒ ÷12 half-up = 1272917
- available = 12000000 + 0 + 0 − 87500 − 1272917 = 10639583
- net = 10639583
- gross = E0 12000000 + add 0 − deduct 0 = 12000000 (= net + SSO + WHT)
- ⇒ gross 12000000 · SSO 87500 · WHT 1272917 · net 10639583 · carry — · flags —

### V06 — monthly 30,000 · not in SSO `[r3-schema]`
- BASE 3000000
- E0 (pay lines) = 3000000
- whtIncome = E 3000000 + taxable adds 0 = 3000000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 3000000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 3000000
- SSO: not eligible ⇒ 0
- WHT (YTD, month 1, k=11): projected income = 0 + 3000000 + 3000000×11 = 36000000 · projected SSO = 0 + 0 + 0×11 = 0 · expense min(50%, 100,000 ฿) = 10000000 · net = 36000000 − 10000000 − 6,000,000 − min(0, 900,000) = 20000000 · annual tax 250000 · due 250000 − 0 = 250000 ⇒ ÷12 half-up = 20833
- available = 3000000 + 0 + 0 − 0 − 20833 = 2979167
- net = 2979167
- gross = E0 3000000 + add 0 − deduct 0 = 3000000 (= net + SSO + WHT)
- ⇒ gross 3000000 · SSO 0 · WHT 20833 · net 2979167 · carry — · flags —

### V07 — monthly 30,000 · December true-up with prior YTD `[r3-schema]`
- BASE 3000000
- E0 (pay lines) = 3000000
- whtIncome = E 3000000 + taxable adds 0 = 3000000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 3000000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 3000000
- SSO: wage 3000000 → base clamp(1,650–17,500 ฿) = 1750000 · ×5% = 87500.00 → baht half-up 875 ⇒ 87500
- WHT (YTD, month 12, k=0): projected income = 33000000 + 3000000 + 3000000×0 = 36000000 · projected SSO = 825000 + 87500 + 87500×0 = 912500 · expense min(50%, 100,000 ฿) = 10000000 · net = 36000000 − 10000000 − 6,000,000 − min(912500, 900,000) = 19100000 · annual tax 205000 · due 205000 − 150000 = 55000 ⇒ ÷1 half-up = 55000
- available = 3000000 + 0 + 0 − 87500 − 55000 = 2857500
- net = 2857500
- gross = E0 3000000 + add 0 − deduct 0 = 3000000 (= net + SSO + WHT)
- ⇒ gross 3000000 · SSO 87500 · WHT 55000 · net 2857500 · carry — · flags —

### V08 — proration HQ6: start 16 Sep · 15/30 `[r3-schema]`
- BASE 1500000
- PRORATION (÷30, L2): 15 calendar days employed · min(base, halfUp(1500000×15/30)) = min(1500000, 750000) → 750000 ⇒ line -750000
- E0 (pay lines) = 750000
- whtIncome = E 750000 + taxable adds 0 = 750000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 750000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 750000
- SSO: wage 750000 → base clamp(1,650–17,500 ฿) = 750000 · ×5% = 37500.00 → baht half-up 375 ⇒ 37500
- WHT (YTD, month 1, k=11): projected income = 0 + 750000 + 1500000×11 = 17250000 · projected SSO = 0 + 37500 + 75000×11 = 862500 · expense min(50%, 100,000 ฿) = 8625000 · net = 17250000 − 8625000 − 6,000,000 − min(862500, 900,000) = 1762500 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 750000 + 0 + 0 − 37500 − 0 = 712500
- net = 712500
- gross = E0 750000 + add 0 − deduct 0 = 750000 (= net + SSO + WHT)
- ⇒ gross 750000 · SSO 37500 · WHT 0 · net 712500 · carry — · flags ['PARTIAL_MONTH']

### V09 — proration: leaver 10 Jul · 10/31 half-up `[r3-schema]`
- BASE 3000000
- PRORATION (÷30, L2): 10 calendar days employed · min(base, halfUp(3000000×10/30)) = min(3000000, 1000000) → 1000000 ⇒ line -2000000
- E0 (pay lines) = 1000000
- whtIncome = E 1000000 + taxable adds 0 = 1000000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 1000000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 1000000
- SSO: wage 1000000 → base clamp(1,650–17,500 ฿) = 1000000 · ×5% = 50000.00 → baht half-up 500 ⇒ 50000
- WHT (YTD, month 7, k=5): projected income = 0 + 1000000 + 3000000×5 = 16000000 · projected SSO = 0 + 50000 + 87500×5 = 487500 · expense min(50%, 100,000 ฿) = 8000000 · net = 16000000 − 8000000 − 6,000,000 − min(487500, 900,000) = 1512500 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷6 half-up = 0
- available = 1000000 + 0 + 0 − 50000 − 0 = 950000
- net = 950000
- gross = E0 1000000 + add 0 − deduct 0 = 1000000 (= net + SSO + WHT)
- ⇒ gross 1000000 · SSO 50000 · WHT 0 · net 950000 · carry — · flags ['PARTIAL_MONTH']

### V10 — proration: start 15 Feb 2031 (28 days) · 14/28 `[r3-schema]`
- BASE 2500000
- PRORATION (÷30, L2): 14 calendar days employed · min(base, halfUp(2500000×14/30)) = min(2500000, 3500000/3) → 1166667 ⇒ line -1333333
- E0 (pay lines) = 1166667
- whtIncome = E 1166667 + taxable adds 0 = 1166667 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 1166667 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 1166667
- SSO: wage 1166667 → base clamp(1,650–17,500 ฿) = 1166667 · ×5% = 58333.35 → baht half-up 583 ⇒ 58300
- WHT (YTD, month 2, k=10): projected income = 0 + 1166667 + 2500000×10 = 26166667 · projected SSO = 0 + 58300 + 87500×10 = 933300 · expense min(50%, 100,000 ฿) = 10000000 · net = 26166667 − 10000000 − 6,000,000 − min(933300, 900,000) = 9266667 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷11 half-up = 0
- available = 1166667 + 0 + 0 − 58300 − 0 = 1108367
- net = 1108367
- gross = E0 1166667 + add 0 − deduct 0 = 1166667 (= net + SSO + WHT)
- ⇒ gross 1166667 · SSO 58300 · WHT 0 · net 1108367 · carry — · flags ['PARTIAL_MONTH']

### V11 — proration: start 10 + end 20 Sep · 11/30 `[r3-schema]`
- BASE 1500000
- PRORATION (÷30, L2): 11 calendar days employed · min(base, halfUp(1500000×11/30)) = min(1500000, 550000) → 550000 ⇒ line -950000
- E0 (pay lines) = 550000
- whtIncome = E 550000 + taxable adds 0 = 550000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 550000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 550000
- SSO: wage 550000 → base clamp(1,650–17,500 ฿) = 550000 · ×5% = 27500.00 → baht half-up 275 ⇒ 27500
- WHT (YTD, month 1, k=11): projected income = 0 + 550000 + 1500000×11 = 17050000 · projected SSO = 0 + 27500 + 75000×11 = 852500 · expense min(50%, 100,000 ฿) = 8525000 · net = 17050000 − 8525000 − 6,000,000 − min(852500, 900,000) = 1672500 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 550000 + 0 + 0 − 27500 − 0 = 522500
- net = 522500
- gross = E0 550000 + add 0 − deduct 0 = 550000 (= net + SSO + WHT)
- ⇒ gross 550000 · SSO 27500 · WHT 0 · net 522500 · carry — · flags ['PARTIAL_MONTH']

### V12 — unpaid leave 1 day (480) · ÷30÷480 floor `[r3-schema]`
- BASE 1500000
- UNPAID_LEAVE 2031-09-04: floor(1500000×480/(30×480)) = floor(50000) = 50000 ⇒ −50000
- E0 (pay lines) = 1450000
- whtIncome = E 1450000 + taxable adds 0 = 1450000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 1450000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 1450000
- SSO: wage 1450000 → base clamp(1,650–17,500 ฿) = 1450000 · ×5% = 72500.00 → baht half-up 725 ⇒ 72500
- WHT (YTD, month 1, k=11): projected income = 0 + 1450000 + 1500000×11 = 17950000 · projected SSO = 0 + 72500 + 75000×11 = 897500 · expense min(50%, 100,000 ฿) = 8975000 · net = 17950000 − 8975000 − 6,000,000 − min(897500, 900,000) = 2077500 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 1450000 + 0 + 0 − 72500 − 0 = 1377500
- net = 1377500
- gross = E0 1450000 + add 0 − deduct 0 = 1450000 (= net + SSO + WHT)
- ⇒ gross 1450000 · SSO 72500 · WHT 0 · net 1377500 · carry — · flags —

### V13 — unpaid half day 225 · normal day 450 · floor `[r3-schema]`
- BASE 2000000
- UNPAID_LEAVE 2031-09-04: floor(2000000×225/(30×450)) = floor(100000/3) = 33333 ⇒ −33333
- E0 (pay lines) = 1966667
- whtIncome = E 1966667 + taxable adds 0 = 1966667 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 1966667 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 1966667
- SSO: wage 1966667 → base clamp(1,650–17,500 ฿) = 1750000 · ×5% = 87500.00 → baht half-up 875 ⇒ 87500
- WHT (YTD, month 1, k=11): projected income = 0 + 1966667 + 2000000×11 = 23966667 · projected SSO = 0 + 87500 + 87500×11 = 1050000 · expense min(50%, 100,000 ฿) = 10000000 · net = 23966667 − 10000000 − 6,000,000 − min(1050000, 900,000) = 7066667 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 1966667 + 0 + 0 − 87500 − 0 = 1879167
- net = 1879167
- gross = E0 1966667 + add 0 − deduct 0 = 1966667 (= net + SSO + WHT)
- ⇒ gross 1966667 · SSO 87500 · WHT 0 · net 1879167 · carry — · flags —

### V14 — unpaid leave every day of a 31-day month > base ⇒ UNPAID_CAP · E0 0 · SSO floor ⇒ NET_NEGATIVE `[r3-schema]`
- BASE 1000000
- UNPAID_LEAVE 2031-08-01: floor(1000000×480/(30×480)) = floor(100000/3) = 33333 ⇒ −33333
- UNPAID_LEAVE 2031-08-02: floor(1000000×480/(30×480)) = floor(100000/3) = 33333 ⇒ −33333
- UNPAID_LEAVE 2031-08-03: floor(1000000×480/(30×480)) = floor(100000/3) = 33333 ⇒ −33333
- UNPAID_LEAVE 2031-08-04: floor(1000000×480/(30×480)) = floor(100000/3) = 33333 ⇒ −33333
- UNPAID_LEAVE 2031-08-05: floor(1000000×480/(30×480)) = floor(100000/3) = 33333 ⇒ −33333
- UNPAID_LEAVE 2031-08-06: floor(1000000×480/(30×480)) = floor(100000/3) = 33333 ⇒ −33333
- UNPAID_LEAVE 2031-08-07: floor(1000000×480/(30×480)) = floor(100000/3) = 33333 ⇒ −33333
- UNPAID_LEAVE 2031-08-08: floor(1000000×480/(30×480)) = floor(100000/3) = 33333 ⇒ −33333
- UNPAID_LEAVE 2031-08-09: floor(1000000×480/(30×480)) = floor(100000/3) = 33333 ⇒ −33333
- UNPAID_LEAVE 2031-08-10: floor(1000000×480/(30×480)) = floor(100000/3) = 33333 ⇒ −33333
- UNPAID_LEAVE 2031-08-11: floor(1000000×480/(30×480)) = floor(100000/3) = 33333 ⇒ −33333
- UNPAID_LEAVE 2031-08-12: floor(1000000×480/(30×480)) = floor(100000/3) = 33333 ⇒ −33333
- UNPAID_LEAVE 2031-08-13: floor(1000000×480/(30×480)) = floor(100000/3) = 33333 ⇒ −33333
- UNPAID_LEAVE 2031-08-14: floor(1000000×480/(30×480)) = floor(100000/3) = 33333 ⇒ −33333
- UNPAID_LEAVE 2031-08-15: floor(1000000×480/(30×480)) = floor(100000/3) = 33333 ⇒ −33333
- UNPAID_LEAVE 2031-08-16: floor(1000000×480/(30×480)) = floor(100000/3) = 33333 ⇒ −33333
- UNPAID_LEAVE 2031-08-17: floor(1000000×480/(30×480)) = floor(100000/3) = 33333 ⇒ −33333
- UNPAID_LEAVE 2031-08-18: floor(1000000×480/(30×480)) = floor(100000/3) = 33333 ⇒ −33333
- UNPAID_LEAVE 2031-08-19: floor(1000000×480/(30×480)) = floor(100000/3) = 33333 ⇒ −33333
- UNPAID_LEAVE 2031-08-20: floor(1000000×480/(30×480)) = floor(100000/3) = 33333 ⇒ −33333
- UNPAID_LEAVE 2031-08-21: floor(1000000×480/(30×480)) = floor(100000/3) = 33333 ⇒ −33333
- UNPAID_LEAVE 2031-08-22: floor(1000000×480/(30×480)) = floor(100000/3) = 33333 ⇒ −33333
- UNPAID_LEAVE 2031-08-23: floor(1000000×480/(30×480)) = floor(100000/3) = 33333 ⇒ −33333
- UNPAID_LEAVE 2031-08-24: floor(1000000×480/(30×480)) = floor(100000/3) = 33333 ⇒ −33333
- UNPAID_LEAVE 2031-08-25: floor(1000000×480/(30×480)) = floor(100000/3) = 33333 ⇒ −33333
- UNPAID_LEAVE 2031-08-26: floor(1000000×480/(30×480)) = floor(100000/3) = 33333 ⇒ −33333
- UNPAID_LEAVE 2031-08-27: floor(1000000×480/(30×480)) = floor(100000/3) = 33333 ⇒ −33333
- UNPAID_LEAVE 2031-08-28: floor(1000000×480/(30×480)) = floor(100000/3) = 33333 ⇒ −33333
- UNPAID_LEAVE 2031-08-29: floor(1000000×480/(30×480)) = floor(100000/3) = 33333 ⇒ −33333
- UNPAID_LEAVE 2031-08-30: floor(1000000×480/(30×480)) = floor(100000/3) = 33333 ⇒ −33333
- UNPAID_LEAVE 2031-08-31: floor(1000000×480/(30×480)) = floor(100000/3) = 33333 ⇒ −33333
- UNPAID_CAP: pay lines sum -33323 < 0 ⇒ +33323
- E0 (pay lines) = 0
- whtIncome = E 0 + taxable adds 0 = 0 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 0 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 0
- SSO: wage 0 → base clamp(1,650–17,500 ฿) = 165000 · ×5% = 8250.00 → baht half-up 83 ⇒ 8300
- WHT (YTD, month 8, k=4): projected income = 0 + 0 + 1000000×4 = 4000000 · projected SSO = 0 + 8300 + 50000×4 = 208300 · expense min(50%, 100,000 ฿) = 2000000 · net = 4000000 − 2000000 − 6,000,000 − min(208300, 900,000) = 0 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷5 half-up = 0
- available = 0 + 0 + 0 − 8300 − 0 = -8300
- available < 0 ⇒ blocked NET_NEGATIVE · nothing applied · net -8300
- gross = E0 0 + add 0 − deduct 0 = 0 (= net + SSO + WHT)
- ⇒ gross 0 · SSO 8300 · WHT 0 · net -8300 · carry — · flags ['NEGATIVE_NET', 'SSO_MIN_BASE', 'UNPAID_CAPPED']

### V15 — daily 400 ฿ · 3 full days `[r3-schema]`
- DAY_WAGE 2031-09-01: min(480, 480+0) = 480 · 40000×480/480 = 40000 → 40000
- DAY_WAGE 2031-09-02: min(480, 480+0) = 480 · 40000×480/480 = 40000 → 40000
- DAY_WAGE 2031-09-03: min(480, 480+0) = 480 · 40000×480/480 = 40000 → 40000
- E0 (pay lines) = 120000
- whtIncome = E 120000 + taxable adds 0 = 120000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 120000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 120000
- SSO: wage 120000 → base clamp(1,650–17,500 ฿) = 165000 · ×5% = 8250.00 → baht half-up 83 ⇒ 8300
- WHT (YTD, month 1, k=11): projected income = 0 + 120000 + 120000×11 = 1440000 · projected SSO = 0 + 8300 + 8300×11 = 99600 · expense min(50%, 100,000 ฿) = 720000 · net = 1440000 − 720000 − 6,000,000 − min(99600, 900,000) = 0 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 120000 + 0 + 0 − 8300 − 0 = 111700
- net = 111700
- gross = E0 120000 + add 0 − deduct 0 = 120000 (= net + SSO + WHT)
- ⇒ gross 120000 · SSO 8300 · WHT 0 · net 111700 · carry — · flags ['SSO_MIN_BASE']

### V16 — daily · part day 300 min `[r3-schema]`
- DAY_WAGE 2031-09-01: min(480, 300+0) = 300 · 40000×300/480 = 25000 → 25000
- E0 (pay lines) = 25000
- whtIncome = E 25000 + taxable adds 0 = 25000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 25000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 25000
- SSO: wage 25000 → base clamp(1,650–17,500 ฿) = 165000 · ×5% = 8250.00 → baht half-up 83 ⇒ 8300
- WHT (YTD, month 1, k=11): projected income = 0 + 25000 + 25000×11 = 300000 · projected SSO = 0 + 8300 + 8300×11 = 99600 · expense min(50%, 100,000 ฿) = 150000 · net = 300000 − 150000 − 6,000,000 − min(99600, 900,000) = 0 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 25000 + 0 + 0 − 8300 − 0 = 16700
- net = 16700
- gross = E0 25000 + add 0 − deduct 0 = 25000 (= net + SSO + WHT)
- ⇒ gross 25000 · SSO 8300 · WHT 0 · net 16700 · carry — · flags ['SSO_MIN_BASE']

### V17 — daily · paid leave day pays · unpaid leave day pays nothing `[r3-schema]`
- DAY_WAGE 2031-09-01: min(480, 0+480) = 480 · 40000×480/480 = 40000 → 40000
- E0 (pay lines) = 40000
- whtIncome = E 40000 + taxable adds 0 = 40000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 40000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 40000
- SSO: wage 40000 → base clamp(1,650–17,500 ฿) = 165000 · ×5% = 8250.00 → baht half-up 83 ⇒ 8300
- WHT (YTD, month 1, k=11): projected income = 0 + 40000 + 40000×11 = 480000 · projected SSO = 0 + 8300 + 8300×11 = 99600 · expense min(50%, 100,000 ฿) = 240000 · net = 480000 − 240000 − 6,000,000 − min(99600, 900,000) = 0 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 40000 + 0 + 0 − 8300 − 0 = 31700
- net = 31700
- gross = E0 40000 + add 0 − deduct 0 = 40000 (= net + SSO + WHT)
- ⇒ gross 40000 · SSO 8300 · WHT 0 · net 31700 · carry — · flags ['SSO_MIN_BASE']

### V18 — daily · traditional (PUBLIC) holiday s.56(2) = one day's wage · leave on the holiday not paid twice `[r3-schema]`
- HOLIDAY_PAY 2031-09-17 (s.56): 40000×480/480 → 40000
- E0 (pay lines) = 40000
- whtIncome = E 40000 + taxable adds 0 = 40000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 40000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 40000
- SSO: wage 40000 → base clamp(1,650–17,500 ฿) = 165000 · ×5% = 8250.00 → baht half-up 83 ⇒ 8300
- WHT (YTD, month 1, k=11): projected income = 0 + 40000 + 40000×11 = 480000 · projected SSO = 0 + 8300 + 8300×11 = 99600 · expense min(50%, 100,000 ฿) = 240000 · net = 480000 − 240000 − 6,000,000 − min(99600, 900,000) = 0 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 40000 + 0 + 0 − 8300 − 0 = 31700
- net = 31700
- gross = E0 40000 + add 0 − deduct 0 = 40000 (= net + SSO + WHT)
- ⇒ gross 40000 · SSO 8300 · WHT 0 · net 31700 · carry — · flags ['HOLIDAY_LEAVE', 'SSO_MIN_BASE']

### V19 — daily · works the public holiday · holiday pay + 1× (s.62(1)) `[r3-value]`
- HOLIDAY_PAY 2031-09-17 (s.56): 40000×480/480 → 40000
- HOLIDAY_WORK 2031-09-17 (HOLIDAY, DAILY, ×1.0): minutes 480 − 0 paid by OT request = 480 · 192000000000/4800000 = 40000 → 40000
- E0 (pay lines) = 80000
- whtIncome = E 80000 + taxable adds 0 = 80000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 40000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 40000
- SSO: wage 40000 → base clamp(1,650–17,500 ฿) = 165000 · ×5% = 8250.00 → baht half-up 83 ⇒ 8300
- WHT (YTD, month 1, k=11): projected income = 0 + 80000 + 80000×11 = 960000 · projected SSO = 0 + 8300 + 8300×11 = 99600 · expense min(50%, 100,000 ฿) = 480000 · net = 960000 − 480000 − 6,000,000 − min(99600, 900,000) = 0 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 80000 + 0 + 0 − 8300 − 0 = 71700
- net = 71700
- gross = E0 80000 + add 0 − deduct 0 = 80000 (= net + SSO + WHT)
- ⇒ gross 80000 · SSO 8300 · WHT 0 · net 71700 · carry — · flags ['SSO_MIN_BASE']

### V20 — daily · works the weekly day off without OT request · 2× (s.62(2)) `[r3-value]`
- HOLIDAY_WORK 2031-09-06 (DAY_OFF, DAILY, ×2.0): minutes 480 − 0 paid by OT request = 480 · 384000000000/4800000 = 80000 → 80000
- E0 (pay lines) = 80000
- whtIncome = E 80000 + taxable adds 0 = 80000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 0 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 0
- SSO: wage 0 → base clamp(1,650–17,500 ฿) = 165000 · ×5% = 8250.00 → baht half-up 83 ⇒ 8300
- WHT (YTD, month 1, k=11): projected income = 0 + 80000 + 80000×11 = 960000 · projected SSO = 0 + 8300 + 8300×11 = 99600 · expense min(50%, 100,000 ฿) = 480000 · net = 960000 − 480000 − 6,000,000 − min(99600, 900,000) = 0 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 80000 + 0 + 0 − 8300 − 0 = 71700
- net = 71700
- gross = E0 80000 + add 0 − deduct 0 = 80000 (= net + SSO + WHT)
- ⇒ gross 80000 · SSO 8300 · WHT 0 · net 71700 · carry — · flags ['SSO_MIN_BASE']

### V21 — daily · day-off work fully paid by H2.9 HOLIDAY_WORK segment ⇒ no line `[r3-schema]`
- E0 (pay lines) = 0
- whtIncome = E 0 + taxable adds 0 = 0 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 0 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 0
- SSO: wage 0 → base clamp(1,650–17,500 ฿) = 165000 · ×5% = 8250.00 → baht half-up 83 ⇒ 8300
- WHT (YTD, month 1, k=11): projected income = 0 + 0 + 0×11 = 0 · projected SSO = 0 + 8300 + 8300×11 = 99600 · expense min(50%, 100,000 ฿) = 0 · net = 0 − 0 − 6,000,000 − min(99600, 900,000) = 0 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 0 + 0 + 0 − 8300 − 0 = -8300
- available < 0 ⇒ blocked NET_NEGATIVE · nothing applied · net -8300
- gross = E0 0 + add 0 − deduct 0 = 0 (= net + SSO + WHT)
- ⇒ gross 0 · SSO 8300 · WHT 0 · net -8300 · carry — · flags ['NEGATIVE_NET', 'SSO_MIN_BASE']

### V22 — daily · day-off work 480, request paid 300 ⇒ 180 × 2 `[r3-value]`
- HOLIDAY_WORK 2031-09-06 (DAY_OFF, DAILY, ×2.0): minutes 480 − 300 paid by OT request = 180 · 144000000000/4800000 = 30000 → 30000
- E0 (pay lines) = 30000
- whtIncome = E 30000 + taxable adds 0 = 30000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 0 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 0
- SSO: wage 0 → base clamp(1,650–17,500 ฿) = 165000 · ×5% = 8250.00 → baht half-up 83 ⇒ 8300
- WHT (YTD, month 1, k=11): projected income = 0 + 30000 + 30000×11 = 360000 · projected SSO = 0 + 8300 + 8300×11 = 99600 · expense min(50%, 100,000 ฿) = 180000 · net = 360000 − 180000 − 6,000,000 − min(99600, 900,000) = 0 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 30000 + 0 + 0 − 8300 − 0 = 21700
- net = 21700
- gross = E0 30000 + add 0 − deduct 0 = 30000 (= net + SSO + WHT)
- ⇒ gross 30000 · SSO 8300 · WHT 0 · net 21700 · carry — · flags ['SSO_MIN_BASE']

### V23 — daily · normal day 420 · full day + day-off work 420 (divisor min(480, N)) `[r3-value]`
- DAY_WAGE 2031-09-05: min(420, 420+0) = 420 · 40000×420/420 = 40000 → 40000
- HOLIDAY_WORK 2031-09-06 (DAY_OFF, DAILY, ×2.0): minutes 420 − 0 paid by OT request = 420 · 336000000000/4200000 = 80000 → 80000
- E0 (pay lines) = 120000
- whtIncome = E 120000 + taxable adds 0 = 120000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 40000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 40000
- SSO: wage 40000 → base clamp(1,650–17,500 ฿) = 165000 · ×5% = 8250.00 → baht half-up 83 ⇒ 8300
- WHT (YTD, month 1, k=11): projected income = 0 + 120000 + 120000×11 = 1440000 · projected SSO = 0 + 8300 + 8300×11 = 99600 · expense min(50%, 100,000 ฿) = 720000 · net = 1440000 − 720000 − 6,000,000 − min(99600, 900,000) = 0 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 120000 + 0 + 0 − 8300 − 0 = 111700
- net = 111700
- gross = E0 120000 + add 0 − deduct 0 = 120000 (= net + SSO + WHT)
- ⇒ gross 120000 · SSO 8300 · WHT 0 · net 111700 · carry — · flags ['SSO_MIN_BASE']

### V24 — daily 333.33 ฿ · 7 minutes · half-up edge `[r3-schema]`
- DAY_WAGE 2031-09-01: min(480, 7+0) = 7 · 33333×7/480 = 77777/160 → 486
- E0 (pay lines) = 486
- whtIncome = E 486 + taxable adds 0 = 486 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 486 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 486
- SSO: wage 486 → base clamp(1,650–17,500 ฿) = 165000 · ×5% = 8250.00 → baht half-up 83 ⇒ 8300
- WHT (YTD, month 1, k=11): projected income = 0 + 486 + 486×11 = 5832 · projected SSO = 0 + 8300 + 8300×11 = 99600 · expense min(50%, 100,000 ฿) = 2916 · net = 5832 − 2916 − 6,000,000 − min(99600, 900,000) = 0 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 486 + 0 + 0 − 8300 − 0 = -7814
- available < 0 ⇒ blocked NET_NEGATIVE · nothing applied · net -7814
- gross = E0 486 + add 0 − deduct 0 = 486 (= net + SSO + WHT)
- ⇒ gross 486 · SSO 8300 · WHT 0 · net -7814 · carry — · flags ['NEGATIVE_NET', 'SSO_MIN_BASE']

### V25 — hourly 65 ฿ · two 8 h days `[r3-schema]`
- HOUR_WAGE 2031-09-01: 6500×480/60 = 52000 → 52000
- HOUR_WAGE 2031-09-02: 6500×480/60 = 52000 → 52000
- E0 (pay lines) = 104000
- whtIncome = E 104000 + taxable adds 0 = 104000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 104000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 104000
- SSO: wage 104000 → base clamp(1,650–17,500 ฿) = 165000 · ×5% = 8250.00 → baht half-up 83 ⇒ 8300
- WHT (YTD, month 1, k=11): projected income = 0 + 104000 + 104000×11 = 1248000 · projected SSO = 0 + 8300 + 8300×11 = 99600 · expense min(50%, 100,000 ฿) = 624000 · net = 1248000 − 624000 − 6,000,000 − min(99600, 900,000) = 0 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 104000 + 0 + 0 − 8300 − 0 = 95700
- net = 95700
- gross = E0 104000 + add 0 − deduct 0 = 104000 (= net + SSO + WHT)
- ⇒ gross 104000 · SSO 8300 · WHT 0 · net 95700 · carry — · flags ['SSO_MIN_BASE']

### V26 — hourly 65 ฿ · 50 minutes · half-up `[r3-schema]`
- HOUR_WAGE 2031-09-01: 6500×50/60 = 16250/3 → 5417
- E0 (pay lines) = 5417
- whtIncome = E 5417 + taxable adds 0 = 5417 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 5417 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 5417
- SSO: wage 5417 → base clamp(1,650–17,500 ฿) = 165000 · ×5% = 8250.00 → baht half-up 83 ⇒ 8300
- WHT (YTD, month 1, k=11): projected income = 0 + 5417 + 5417×11 = 65004 · projected SSO = 0 + 8300 + 8300×11 = 99600 · expense min(50%, 100,000 ฿) = 32502 · net = 65004 − 32502 − 6,000,000 − min(99600, 900,000) = 0 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 5417 + 0 + 0 − 8300 − 0 = -2883
- available < 0 ⇒ blocked NET_NEGATIVE · nothing applied · net -2883
- gross = E0 5417 + add 0 − deduct 0 = 5417 (= net + SSO + WHT)
- ⇒ gross 5417 · SSO 8300 · WHT 0 · net -2883 · carry — · flags ['NEGATIVE_NET', 'SSO_MIN_BASE']

### V27 — hourly · holiday pay 480 + day-off work 240 × 2 `[r3-value]`
- HOLIDAY_WORK 2031-09-06 (DAY_OFF, HOURLY, ×2.0): minutes 240 − 0 paid by OT request = 240 · 31200000000/600000 = 52000 → 52000
- HOLIDAY_PAY 2031-09-17 (s.56): 6500×480/60 → 52000
- E0 (pay lines) = 104000
- whtIncome = E 104000 + taxable adds 0 = 104000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 52000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 52000
- SSO: wage 52000 → base clamp(1,650–17,500 ฿) = 165000 · ×5% = 8250.00 → baht half-up 83 ⇒ 8300
- WHT (YTD, month 1, k=11): projected income = 0 + 104000 + 104000×11 = 1248000 · projected SSO = 0 + 8300 + 8300×11 = 99600 · expense min(50%, 100,000 ฿) = 624000 · net = 1248000 − 624000 − 6,000,000 − min(99600, 900,000) = 0 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 104000 + 0 + 0 − 8300 − 0 = 95700
- net = 95700
- gross = E0 104000 + add 0 − deduct 0 = 104000 (= net + SSO + WHT)
- ⇒ gross 104000 · SSO 8300 · WHT 0 · net 95700 · carry — · flags ['SSO_MIN_BASE']

### V28 — hourly · works the public holiday · holiday pay + 1× `[r3-value]`
- HOLIDAY_PAY 2031-09-17 (s.56): 6500×480/60 → 52000
- HOLIDAY_WORK 2031-09-17 (HOLIDAY, HOURLY, ×1.0): minutes 480 − 0 paid by OT request = 480 · 31200000000/600000 = 52000 → 52000
- E0 (pay lines) = 104000
- whtIncome = E 104000 + taxable adds 0 = 104000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 52000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 52000
- SSO: wage 52000 → base clamp(1,650–17,500 ฿) = 165000 · ×5% = 8250.00 → baht half-up 83 ⇒ 8300
- WHT (YTD, month 1, k=11): projected income = 0 + 104000 + 104000×11 = 1248000 · projected SSO = 0 + 8300 + 8300×11 = 99600 · expense min(50%, 100,000 ฿) = 624000 · net = 1248000 − 624000 − 6,000,000 − min(99600, 900,000) = 0 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 104000 + 0 + 0 − 8300 − 0 = 95700
- net = 95700
- gross = E0 104000 + add 0 − deduct 0 = 104000 (= net + SSO + WHT)
- ⇒ gross 104000 · SSO 8300 · WHT 0 · net 95700 · carry — · flags ['SSO_MIN_BASE']

### V29 — monthly 30,000 · rostered public-holiday work 480 · 1× extra (s.62(1)) `[r3-value]`
- BASE 3000000
- HOLIDAY_WORK 2031-09-17 (HOLIDAY, MONTHLY, ×1.0): minutes 480 − 0 paid by OT request = 480 · 14400000000000/144000000 = 100000 → 100000
- E0 (pay lines) = 3100000
- whtIncome = E 3100000 + taxable adds 0 = 3100000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 3000000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 3000000
- SSO: wage 3000000 → base clamp(1,650–17,500 ฿) = 1750000 · ×5% = 87500.00 → baht half-up 875 ⇒ 87500
- WHT (YTD, month 1, k=11): projected income = 0 + 3100000 + 3000000×11 = 36100000 · projected SSO = 0 + 87500 + 87500×11 = 1050000 · expense min(50%, 100,000 ฿) = 10000000 · net = 36100000 − 10000000 − 6,000,000 − min(1050000, 900,000) = 19200000 · annual tax 210000 · due 210000 − 0 = 210000 ⇒ ÷12 half-up = 17500
- available = 3100000 + 0 + 0 − 87500 − 17500 = 2995000
- net = 2995000
- gross = E0 3100000 + add 0 − deduct 0 = 3100000 (= net + SSO + WHT)
- ⇒ gross 3100000 · SSO 87500 · WHT 17500 · net 2995000 · carry — · flags —

### V30 — monthly · day-off work fully paid by OT request · unplanned 60 flagged, unpaid `[r3-schema]`
- BASE 3000000
- E0 (pay lines) = 3000000
- whtIncome = E 3000000 + taxable adds 0 = 3000000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 3000000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 3000000
- SSO: wage 3000000 → base clamp(1,650–17,500 ฿) = 1750000 · ×5% = 87500.00 → baht half-up 875 ⇒ 87500
- WHT (YTD, month 1, k=11): projected income = 0 + 3000000 + 3000000×11 = 36000000 · projected SSO = 0 + 87500 + 87500×11 = 1050000 · expense min(50%, 100,000 ฿) = 10000000 · net = 36000000 − 10000000 − 6,000,000 − min(1050000, 900,000) = 19100000 · annual tax 205000 · due 205000 − 0 = 205000 ⇒ ÷12 half-up = 17083
- available = 3000000 + 0 + 0 − 87500 − 17083 = 2895417
- net = 2895417
- gross = E0 3000000 + add 0 − deduct 0 = 3000000 (= net + SSO + WHT)
- ⇒ gross 3000000 · SSO 87500 · WHT 17083 · net 2895417 · carry — · flags ['UNPLANNED']

### V31 — monthly · normal day 540 · holiday work 540 · divisor capped 480 `[r3-value]`
- BASE 3000000
- HOLIDAY_WORK 2031-09-17 (HOLIDAY, MONTHLY, ×1.0): minutes 540 − 0 paid by OT request = 540 · 16200000000000/144000000 = 112500 → 112500
- E0 (pay lines) = 3112500
- whtIncome = E 3112500 + taxable adds 0 = 3112500 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 3000000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 3000000
- SSO: wage 3000000 → base clamp(1,650–17,500 ฿) = 1750000 · ×5% = 87500.00 → baht half-up 875 ⇒ 87500
- WHT (YTD, month 1, k=11): projected income = 0 + 3112500 + 3000000×11 = 36112500 · projected SSO = 0 + 87500 + 87500×11 = 1050000 · expense min(50%, 100,000 ฿) = 10000000 · net = 36112500 − 10000000 − 6,000,000 − min(1050000, 900,000) = 19212500 · annual tax 210625 · due 210625 − 0 = 210625 ⇒ ÷12 half-up = 17552
- available = 3112500 + 0 + 0 − 87500 − 17552 = 3007448
- net = 3007448
- gross = E0 3112500 + add 0 − deduct 0 = 3112500 (= net + SSO + WHT)
- ⇒ gross 3112500 · SSO 87500 · WHT 17552 · net 3007448 · carry — · flags —

### V32 — monthly 14,000 · holiday work 105 min · half-up `[r3-value]`
- BASE 1400000
- HOLIDAY_WORK 2031-09-17 (HOLIDAY, MONTHLY, ×1.0): minutes 105 − 0 paid by OT request = 105 · 1470000000000/144000000 = 30625/3 → 10208
- E0 (pay lines) = 1410208
- whtIncome = E 1410208 + taxable adds 0 = 1410208 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 1400000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 1400000
- SSO: wage 1400000 → base clamp(1,650–17,500 ฿) = 1400000 · ×5% = 70000.00 → baht half-up 700 ⇒ 70000
- WHT (YTD, month 1, k=11): projected income = 0 + 1410208 + 1400000×11 = 16810208 · projected SSO = 0 + 70000 + 70000×11 = 840000 · expense min(50%, 100,000 ฿) = 8405104 · net = 16810208 − 8405104 − 6,000,000 − min(840000, 900,000) = 1565104 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 1410208 + 0 + 0 − 70000 − 0 = 1340208
- net = 1340208
- gross = E0 1410208 + add 0 − deduct 0 = 1410208 (= net + SSO + WHT)
- ⇒ gross 1410208 · SSO 70000 · WHT 0 · net 1340208 · carry — · flags —

### V33 — monthly 20,000 + OT + COMMISSION + BONUS + ALLOWANCE · bonus taxable, not SSO `[r3-value]`
- BASE 2000000
- E0 (pay lines) = 2000000
- whtIncome = E 2000000 + taxable adds 380000 = 2380000 (one-off 200000) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 2000000 + ALLOWANCE 30000 + LATE_REFUND 0 + COMMISSION 100000 = 2130000
- SSO: wage 2130000 → base clamp(1,650–17,500 ฿) = 1750000 · ×5% = 87500.00 → baht half-up 875 ⇒ 87500
- WHT (YTD, month 1, k=11): projected income = 0 + 2180000 + 2000000×11 = 24180000 · projected SSO = 0 + 87500 + 87500×11 = 1050000 · expense min(50%, 100,000 ฿) = 10000000 · net = 24180000 − 10000000 − 6,000,000 − min(1050000, 900,000) = 7280000 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- one-off (Por.96/2543 ข้อ 1(5)): annual tax with the one-off 0 − without 0 = 0, withheld this month in full
- available = 2000000 + 380000 + 0 − 87500 − 0 = 2292500
- net = 2292500
- gross = E0 2000000 + add 380000 − deduct 0 = 2380000 (= net + SSO + WHT)
- ⇒ gross 2380000 · SSO 87500 · WHT 0 · net 2292500 · carry — · flags ['SSO_COMMISSION_U']

### V34 — REFUND (new kind) · not taxable, not SSO wage `[r3-schema]`
- BASE 1500000
- E0 (pay lines) = 1500000
- whtIncome = E 1500000 + taxable adds 0 = 1500000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 1500000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 1500000 · REFUND 50000 outside both
- SSO: wage 1500000 → base clamp(1,650–17,500 ฿) = 1500000 · ×5% = 75000.00 → baht half-up 750 ⇒ 75000
- WHT (YTD, month 1, k=11): projected income = 0 + 1500000 + 1500000×11 = 18000000 · projected SSO = 0 + 75000 + 75000×11 = 900000 · expense min(50%, 100,000 ฿) = 9000000 · net = 18000000 − 9000000 − 6,000,000 − min(900000, 900,000) = 2100000 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 1500000 + 0 + 50000 − 75000 − 0 = 1475000
- net = 1475000
- gross = E0 1500000 + add 50000 − deduct 0 = 1550000 (= net + SSO + WHT)
- ⇒ gross 1550000 · SSO 75000 · WHT 0 · net 1475000 · carry — · flags —

### V35 — H3.2 LATE_RULE + ABSENT_RULE rows reduce taxable wage (no-work-no-pay) `[r3-schema]`
- BASE 1500000
- E0 (pay lines) = 1500000
- UNWORKED (LATE/ABSENT rows) 53125 capped at E0 ⇒ applied 53125 · E = 1446875
- whtIncome = E 1446875 + taxable adds 0 = 1446875 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 1446875 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 1446875
- SSO: wage 1446875 → base clamp(1,650–17,500 ฿) = 1446875 · ×5% = 72343.75 → baht half-up 723 ⇒ 72300
- WHT (YTD, month 1, k=11): projected income = 0 + 1446875 + 1500000×11 = 17946875 · projected SSO = 0 + 72300 + 75000×11 = 897300 · expense min(50%, 100,000 ฿) = 8973438 · net = 17946875 − 8973438 − 6,000,000 − min(897300, 900,000) = 2076137 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 1446875 + 0 + 0 − 72300 − 0 = 1374575
- net = 1374575
- gross = E0 1500000 + add 0 − deduct 53125 = 1446875 (= net + SSO + WHT)
- ⇒ gross 1446875 · SSO 72300 · WHT 0 · net 1374575 · carry — · flags —

### V36 — unworked rows larger than wage ⇒ capped, excess dropped (never carried) `[r3-schema]`
- BASE 100000
- E0 (pay lines) = 100000
- UNWORKED (LATE/ABSENT rows) 150000 capped at E0 ⇒ applied 100000 · E = 0
- whtIncome = E 0 + taxable adds 0 = 0 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 0 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 0
- SSO: wage 0 → base clamp(1,650–17,500 ฿) = 165000 · ×5% = 8250.00 → baht half-up 83 ⇒ 8300
- WHT (YTD, month 1, k=11): projected income = 0 + 0 + 100000×11 = 1100000 · projected SSO = 0 + 8300 + 8300×11 = 99600 · expense min(50%, 100,000 ฿) = 550000 · net = 1100000 − 550000 − 6,000,000 − min(99600, 900,000) = 0 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 0 + 0 + 0 − 8300 − 0 = -8300
- available < 0 ⇒ blocked NET_NEGATIVE · nothing applied · net -8300
- gross = E0 100000 + add 0 − deduct 100000 = 0 (= net + SSO + WHT)
- ⇒ gross 0 · SSO 8300 · WHT 0 · net -8300 · carry — · flags ['NEGATIVE_NET', 'SSO_MIN_BASE', 'UNWORKED_CAPPED']

### V37 — advance 5,000 within pay `[r3-schema]`
- BASE 1500000
- E0 (pay lines) = 1500000
- whtIncome = E 1500000 + taxable adds 0 = 1500000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 1500000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 1500000
- SSO: wage 1500000 → base clamp(1,650–17,500 ฿) = 1500000 · ×5% = 75000.00 → baht half-up 750 ⇒ 75000
- WHT (YTD, month 1, k=11): projected income = 0 + 1500000 + 1500000×11 = 18000000 · projected SSO = 0 + 75000 + 75000×11 = 900000 · expense min(50%, 100,000 ฿) = 9000000 · net = 18000000 − 9000000 − 6,000,000 − min(900000, 900,000) = 2100000 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 1500000 + 0 + 0 − 75000 − 0 = 1425000
- advances 500000 applied 500000 (limited by available 1425000 only) · claims applied 0 · carry [] · net = 925000
- gross = E0 1500000 + add 0 − deduct 500000 = 1000000 (= net + SSO + WHT)
- ⇒ gross 1000000 · SSO 75000 · WHT 0 · net 925000 · carry — · flags —

### V38 — advance 20,000 > available ⇒ carry ADVANCE (HQ7) · net 0 `[r3-schema]`
- BASE 1500000
- E0 (pay lines) = 1500000
- whtIncome = E 1500000 + taxable adds 0 = 1500000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 1500000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 1500000
- SSO: wage 1500000 → base clamp(1,650–17,500 ฿) = 1500000 · ×5% = 75000.00 → baht half-up 750 ⇒ 75000
- WHT (YTD, month 1, k=11): projected income = 0 + 1500000 + 1500000×11 = 18000000 · projected SSO = 0 + 75000 + 75000×11 = 900000 · expense min(50%, 100,000 ฿) = 9000000 · net = 18000000 − 9000000 − 6,000,000 − min(900000, 900,000) = 2100000 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 1500000 + 0 + 0 − 75000 − 0 = 1425000
- advances 2000000 applied 1425000 (limited by available 1425000 only) · claims applied 0 · carry [('ADVANCE', 575000)] · net = 0
- gross = E0 1500000 + add 0 − deduct 1425000 = 75000 (= net + SSO + WHT)
- ⇒ gross 75000 · SSO 75000 · WHT 0 · net 0 · carry ['ADVANCE:575000'] · flags ['CARRY_FORWARD']

### V39 — manual deduction 4,000 · s.76 cap 20% = 3,000 ⇒ carry 1,000 `[r3-schema]`
- BASE 1500000
- E0 (pay lines) = 1500000
- whtIncome = E 1500000 + taxable adds 0 = 1500000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 1500000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 1500000
- SSO: wage 1500000 → base clamp(1,650–17,500 ฿) = 1500000 · ×5% = 75000.00 → baht half-up 750 ⇒ 75000
- WHT (YTD, month 1, k=11): projected income = 0 + 1500000 + 1500000×11 = 18000000 · projected SSO = 0 + 75000 + 75000×11 = 900000 · expense min(50%, 100,000 ฿) = 9000000 · net = 18000000 − 9000000 − 6,000,000 − min(900000, 900,000) = 2100000 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 1500000 + 0 + 0 − 75000 − 0 = 1425000
- claim a1 (DAMAGES) 400000: category cap floor(1500000×1000/10000) = 150000 − used 0 · total cap floor(1500000×2000/10000) = 300000 − used 0 · available left 1425000 ⇒ applied 150000
- advances 0 applied 0 (limited by available 1425000 only) · claims applied 150000 · carry [('DAMAGES', 250000)] · net = 1275000
- gross = E0 1500000 + add 0 − deduct 150000 = 1350000 (= net + SSO + WHT)
- ⇒ gross 1350000 · SSO 75000 · WHT 0 · net 1275000 · carry ['DAMAGES:250000'] · flags ['CARRY_FORWARD', 'CLAIM_CAPPED']

### V40 — stock charge 1,000 + manual 2,500 · same category DAMAGES · cap 1,500 · order by id `[r3-schema]`
- BASE 1500000
- E0 (pay lines) = 1500000
- whtIncome = E 1500000 + taxable adds 0 = 1500000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 1500000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 1500000
- SSO: wage 1500000 → base clamp(1,650–17,500 ฿) = 1500000 · ×5% = 75000.00 → baht half-up 750 ⇒ 75000
- WHT (YTD, month 1, k=11): projected income = 0 + 1500000 + 1500000×11 = 18000000 · projected SSO = 0 + 75000 + 75000×11 = 900000 · expense min(50%, 100,000 ฿) = 9000000 · net = 18000000 − 9000000 − 6,000,000 − min(900000, 900,000) = 2100000 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 1500000 + 0 + 0 − 75000 − 0 = 1425000
- claim a1 (DAMAGES) 100000: category cap floor(1500000×1000/10000) = 150000 − used 0 · total cap floor(1500000×2000/10000) = 300000 − used 0 · available left 1425000 ⇒ applied 100000
- claim a2 (DAMAGES) 250000: category cap floor(1500000×1000/10000) = 150000 − used 100000 · total cap floor(1500000×2000/10000) = 300000 − used 100000 · available left 1325000 ⇒ applied 50000
- advances 0 applied 0 (limited by available 1425000 only) · claims applied 150000 · carry [('DAMAGES', 200000)] · net = 1275000
- gross = E0 1500000 + add 0 − deduct 150000 = 1350000 (= net + SSO + WHT)
- ⇒ gross 1350000 · SSO 75000 · WHT 0 · net 1275000 · carry ['DAMAGES:200000'] · flags ['CARRY_FORWARD', 'CLAIM_CAPPED']

### V41 — shop caps 100 %/100 % + written consent (s.77) ⇒ claim limited by available only `[r3-schema]`
- BASE 1500000
- E0 (pay lines) = 1500000
- whtIncome = E 1500000 + taxable adds 0 = 1500000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 1500000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 1500000
- SSO: wage 1500000 → base clamp(1,650–17,500 ฿) = 1500000 · ×5% = 75000.00 → baht half-up 750 ⇒ 75000
- WHT (YTD, month 1, k=11): projected income = 0 + 1500000 + 1500000×11 = 18000000 · projected SSO = 0 + 75000 + 75000×11 = 900000 · expense min(50%, 100,000 ฿) = 9000000 · net = 18000000 − 9000000 − 6,000,000 − min(900000, 900,000) = 2100000 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 1500000 + 0 + 0 − 75000 − 0 = 1425000
- claim a1 (DAMAGES, consent) 2000000: category cap floor(1500000×10000/10000) = 1500000 − used 0 · total cap floor(1500000×10000/10000) = 1500000 − used 0 · available left 1425000 ⇒ applied 1425000
- advances 0 applied 0 (limited by available 1425000 only) · claims applied 1425000 · carry [('DAMAGES', 575000)] · net = 0
- gross = E0 1500000 + add 0 − deduct 1425000 = 75000 (= net + SSO + WHT)
- ⇒ gross 75000 · SSO 75000 · WHT 0 · net 0 · carry ['DAMAGES:575000'] · flags ['CARRY_FORWARD']

### V42 — carry-in advance applied before a new advance `[r3-schema]`
- BASE 1000000
- E0 (pay lines) = 1000000
- whtIncome = E 1000000 + taxable adds 0 = 1000000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 1000000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 1000000
- SSO: wage 1000000 → base clamp(1,650–17,500 ฿) = 1000000 · ×5% = 50000.00 → baht half-up 500 ⇒ 50000
- WHT (YTD, month 1, k=11): projected income = 0 + 1000000 + 1000000×11 = 12000000 · projected SSO = 0 + 50000 + 50000×11 = 600000 · expense min(50%, 100,000 ฿) = 6000000 · net = 12000000 − 6000000 − 6,000,000 − min(600000, 900,000) = 0 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 1000000 + 0 + 0 − 50000 − 0 = 950000
- advances 1050000 applied 950000 (limited by available 950000 only) · claims applied 0 · carry [('ADVANCE', 100000)] · net = 0
- gross = E0 1000000 + add 0 − deduct 950000 = 50000 (= net + SSO + WHT)
- ⇒ gross 50000 · SSO 50000 · WHT 0 · net 0 · carry ['ADVANCE:100000'] · flags ['CARRY_FORWARD']

### V43 — shop category cap 0 ⇒ every claim carried `[r3-schema]`
- BASE 1500000
- E0 (pay lines) = 1500000
- whtIncome = E 1500000 + taxable adds 0 = 1500000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 1500000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 1500000
- SSO: wage 1500000 → base clamp(1,650–17,500 ฿) = 1500000 · ×5% = 75000.00 → baht half-up 750 ⇒ 75000
- WHT (YTD, month 1, k=11): projected income = 0 + 1500000 + 1500000×11 = 18000000 · projected SSO = 0 + 75000 + 75000×11 = 900000 · expense min(50%, 100,000 ฿) = 9000000 · net = 18000000 − 9000000 − 6,000,000 − min(900000, 900,000) = 2100000 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 1500000 + 0 + 0 − 75000 − 0 = 1425000
- claim a1 (DAMAGES) 10000: category cap floor(1500000×0/10000) = 0 − used 0 · total cap floor(1500000×2000/10000) = 300000 − used 0 · available left 1425000 ⇒ applied 0
- advances 0 applied 0 (limited by available 1425000 only) · claims applied 0 · carry [('DAMAGES', 10000)] · net = 1425000
- gross = E0 1500000 + add 0 − deduct 0 = 1500000 (= net + SSO + WHT)
- ⇒ gross 1500000 · SSO 75000 · WHT 0 · net 1425000 · carry ['DAMAGES:10000'] · flags ['CARRY_FORWARD', 'CLAIM_CAPPED']

### V44 — advance eats the available pay ⇒ claim applied 0 though cap > 0 `[r3-schema]`
- BASE 1500000
- E0 (pay lines) = 1500000
- whtIncome = E 1500000 + taxable adds 0 = 1500000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 1500000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 1500000
- SSO: wage 1500000 → base clamp(1,650–17,500 ฿) = 1500000 · ×5% = 75000.00 → baht half-up 750 ⇒ 75000
- WHT (YTD, month 1, k=11): projected income = 0 + 1500000 + 1500000×11 = 18000000 · projected SSO = 0 + 75000 + 75000×11 = 900000 · expense min(50%, 100,000 ฿) = 9000000 · net = 18000000 − 9000000 − 6,000,000 − min(900000, 900,000) = 2100000 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 1500000 + 0 + 0 − 75000 − 0 = 1425000
- claim a2 (DAMAGES) 10000: category cap floor(1500000×1000/10000) = 150000 − used 0 · total cap floor(1500000×2000/10000) = 300000 − used 0 · available left 0 ⇒ applied 0
- advances 1500000 applied 1425000 (limited by available 1425000 only) · claims applied 0 · carry [('ADVANCE', 75000), ('DAMAGES', 10000)] · net = 0
- gross = E0 1500000 + add 0 − deduct 1425000 = 75000 (= net + SSO + WHT)
- ⇒ gross 75000 · SSO 75000 · WHT 0 · net 0 · carry ['ADVANCE:75000', 'DAMAGES:10000'] · flags ['CARRY_FORWARD']

### V45 — refused: DAILY without daily rate
- ⇒ refused `NO_RATE`

### V46 — refused: normal day 59
- ⇒ refused `BAD_INPUT`

### V47 — refused: law set without SSO row
- ⇒ refused `LAW_MISSING`

### V48 — refused: unknown kind TIP
- ⇒ refused `BAD_KIND`

### V49 — refused: month 13
- ⇒ refused `BAD_MONTH`

### V50 — daily + commission · regular month = earned (NA-11 placeholder) · month 6 `[r3-value]`
- DAY_WAGE 2031-09-01: min(480, 480+0) = 480 · 50000×480/480 = 50000 → 50000
- DAY_WAGE 2031-09-02: min(480, 480+0) = 480 · 50000×480/480 = 50000 → 50000
- E0 (pay lines) = 100000
- whtIncome = E 100000 + taxable adds 4000000 = 4100000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 100000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 4000000 = 4100000
- SSO: wage 4100000 → base clamp(1,650–17,500 ฿) = 1750000 · ×5% = 87500.00 → baht half-up 875 ⇒ 87500
- WHT (YTD, month 6, k=6): projected income = 0 + 4100000 + 100000×6 = 4700000 · projected SSO = 0 + 87500 + 8300×6 = 137300 · expense min(50%, 100,000 ฿) = 2350000 · net = 4700000 − 2350000 − 6,000,000 − min(137300, 900,000) = 0 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷7 half-up = 0
- available = 100000 + 4000000 + 0 − 87500 − 0 = 4012500
- net = 4012500
- gross = E0 100000 + add 4000000 − deduct 0 = 4100000 (= net + SSO + WHT)
- ⇒ gross 4100000 · SSO 87500 · WHT 0 · net 4012500 · carry — · flags ['SSO_COMMISSION_U']

### V51 — monthly 30,000 · OT 1,750 + claim · cap base counts OT [U] `[r3-value]`
- BASE 3000000
- E0 (pay lines) = 3000000
- whtIncome = E 3000000 + taxable adds 175000 = 3175000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 3000000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 3000000
- SSO: wage 3000000 → base clamp(1,650–17,500 ฿) = 1750000 · ×5% = 87500.00 → baht half-up 875 ⇒ 87500
- WHT (YTD, month 1, k=11): projected income = 0 + 3175000 + 3000000×11 = 36175000 · projected SSO = 0 + 87500 + 87500×11 = 1050000 · expense min(50%, 100,000 ฿) = 10000000 · net = 36175000 − 10000000 − 6,000,000 − min(1050000, 900,000) = 19275000 · annual tax 213750 · due 213750 − 0 = 213750 ⇒ ÷12 half-up = 17813
- available = 3000000 + 175000 + 0 − 87500 − 17813 = 3069687
- claim a2 (DAMAGES) 700000: category cap floor(3175000×1000/10000) = 317500 − used 0 · total cap floor(3175000×2000/10000) = 635000 − used 0 · available left 3069687 ⇒ applied 317500
- advances 0 applied 0 (limited by available 3069687 only) · claims applied 317500 · carry [('DAMAGES', 382500)] · net = 2752187
- gross = E0 3000000 + add 175000 − deduct 317500 = 2857500 (= net + SSO + WHT)
- ⇒ gross 2857500 · SSO 87500 · WHT 17813 · net 2752187 · carry ['DAMAGES:382500'] · flags ['CARRY_FORWARD', 'CLAIM_CAPPED']

### V52 — L2 February full month (28 days) ⇒ base, no proration line `[r3-schema]`
- BASE 2500000
- E0 (pay lines) = 2500000
- whtIncome = E 2500000 + taxable adds 0 = 2500000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 2500000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 2500000
- SSO: wage 2500000 → base clamp(1,650–17,500 ฿) = 1750000 · ×5% = 87500.00 → baht half-up 875 ⇒ 87500
- WHT (YTD, month 2, k=10): projected income = 0 + 2500000 + 2500000×10 = 27500000 · projected SSO = 0 + 87500 + 87500×10 = 962500 · expense min(50%, 100,000 ฿) = 10000000 · net = 27500000 − 10000000 − 6,000,000 − min(962500, 900,000) = 10600000 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷11 half-up = 0
- available = 2500000 + 0 + 0 − 87500 − 0 = 2412500
- net = 2412500
- gross = E0 2500000 + add 0 − deduct 0 = 2500000 (= net + SSO + WHT)
- ⇒ gross 2500000 · SSO 87500 · WHT 0 · net 2412500 · carry — · flags —

### V53 — L2 31-day month, start on the 2nd ⇒ 30 days ⇒ capped at base (line 0) `[r3-schema]`
- BASE 3000000
- PRORATION (÷30, L2): 30 calendar days employed · min(base, halfUp(3000000×30/30)) = min(3000000, 3000000) → 3000000 ⇒ line 0
- E0 (pay lines) = 3000000
- whtIncome = E 3000000 + taxable adds 0 = 3000000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 3000000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 3000000
- SSO: wage 3000000 → base clamp(1,650–17,500 ฿) = 1750000 · ×5% = 87500.00 → baht half-up 875 ⇒ 87500
- WHT (YTD, month 7, k=5): projected income = 0 + 3000000 + 3000000×5 = 18000000 · projected SSO = 0 + 87500 + 87500×5 = 525000 · expense min(50%, 100,000 ฿) = 9000000 · net = 18000000 − 9000000 − 6,000,000 − min(525000, 900,000) = 2475000 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷6 half-up = 0
- available = 3000000 + 0 + 0 − 87500 − 0 = 2912500
- net = 2912500
- gross = E0 3000000 + add 0 − deduct 0 = 3000000 (= net + SSO + WHT)
- ⇒ gross 3000000 · SSO 87500 · WHT 0 · net 2912500 · carry — · flags ['PARTIAL_MONTH']

### V54 — L2 31-day month, start 17 Jul ⇒ 15/30 `[r3-schema]`
- BASE 3000000
- PRORATION (÷30, L2): 15 calendar days employed · min(base, halfUp(3000000×15/30)) = min(3000000, 1500000) → 1500000 ⇒ line -1500000
- E0 (pay lines) = 1500000
- whtIncome = E 1500000 + taxable adds 0 = 1500000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 1500000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 1500000
- SSO: wage 1500000 → base clamp(1,650–17,500 ฿) = 1500000 · ×5% = 75000.00 → baht half-up 750 ⇒ 75000
- WHT (YTD, month 7, k=5): projected income = 0 + 1500000 + 3000000×5 = 16500000 · projected SSO = 0 + 75000 + 87500×5 = 512500 · expense min(50%, 100,000 ฿) = 8250000 · net = 16500000 − 8250000 − 6,000,000 − min(512500, 900,000) = 1737500 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷6 half-up = 0
- available = 1500000 + 0 + 0 − 75000 − 0 = 1425000
- net = 1425000
- gross = E0 1500000 + add 0 − deduct 0 = 1500000 (= net + SSO + WHT)
- ⇒ gross 1500000 · SSO 75000 · WHT 0 · net 1425000 · carry — · flags ['PARTIAL_MONTH']

### V55 — L4 daily · SHOP closure day not worked ⇒ no pay (not a s.56 holiday) `[r3-schema]`
- SHOP closure day 2031-09-17 not worked: no pay for daily/hourly (L4 [U])
- E0 (pay lines) = 0
- whtIncome = E 0 + taxable adds 0 = 0 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 0 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 0
- SSO: wage 0 → base clamp(1,650–17,500 ฿) = 165000 · ×5% = 8250.00 → baht half-up 83 ⇒ 8300
- WHT (YTD, month 1, k=11): projected income = 0 + 0 + 0×11 = 0 · projected SSO = 0 + 8300 + 8300×11 = 99600 · expense min(50%, 100,000 ฿) = 0 · net = 0 − 0 − 6,000,000 − min(99600, 900,000) = 0 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 0 + 0 + 0 − 8300 − 0 = -8300
- available < 0 ⇒ blocked NET_NEGATIVE · nothing applied · net -8300
- gross = E0 0 + add 0 − deduct 0 = 0 (= net + SSO + WHT)
- ⇒ gross 0 · SSO 8300 · WHT 0 · net -8300 · carry — · flags ['NEGATIVE_NET', 'SHOP_HOLIDAY', 'SSO_MIN_BASE']

### V56 — L4 daily · works a SHOP closure day ⇒ ordinary day wage 1× `[r3-schema]`
- SHOP closure day worked (not a s.56 holiday, L4 [U]): DAY_WAGE 40000×480/480 → 40000
- E0 (pay lines) = 40000
- whtIncome = E 40000 + taxable adds 0 = 40000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 40000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 40000
- SSO: wage 40000 → base clamp(1,650–17,500 ฿) = 165000 · ×5% = 8250.00 → baht half-up 83 ⇒ 8300
- WHT (YTD, month 1, k=11): projected income = 0 + 40000 + 40000×11 = 480000 · projected SSO = 0 + 8300 + 8300×11 = 99600 · expense min(50%, 100,000 ฿) = 240000 · net = 480000 − 240000 − 6,000,000 − min(99600, 900,000) = 0 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 40000 + 0 + 0 − 8300 − 0 = 31700
- net = 31700
- gross = E0 40000 + add 0 − deduct 0 = 40000 (= net + SSO + WHT)
- ⇒ gross 40000 · SSO 8300 · WHT 0 · net 31700 · carry — · flags ['SHOP_HOLIDAY', 'SSO_MIN_BASE']

### V57 — L4 daily · weekly day off not worked ⇒ nothing · annual leave day paid (s.56(3)) `[r3-schema]`
- DAY_WAGE 2031-09-08: min(480, 0+480) = 480 · 40000×480/480 = 40000 → 40000
- E0 (pay lines) = 40000
- whtIncome = E 40000 + taxable adds 0 = 40000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 40000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 40000
- SSO: wage 40000 → base clamp(1,650–17,500 ฿) = 165000 · ×5% = 8250.00 → baht half-up 83 ⇒ 8300
- WHT (YTD, month 1, k=11): projected income = 0 + 40000 + 40000×11 = 480000 · projected SSO = 0 + 8300 + 8300×11 = 99600 · expense min(50%, 100,000 ฿) = 240000 · net = 480000 − 240000 − 6,000,000 − min(99600, 900,000) = 0 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 40000 + 0 + 0 − 8300 − 0 = 31700
- net = 31700
- gross = E0 40000 + add 0 − deduct 0 = 40000 (= net + SSO + WHT)
- ⇒ gross 40000 · SSO 8300 · WHT 0 · net 31700 · carry — · flags ['SSO_MIN_BASE']

### V58 — L5 SSO row from 2572 (max base 20,000) · wage 30,000 ⇒ 1,000 ฿ without code change `[r3-schema]`
- BASE 3000000
- E0 (pay lines) = 3000000
- whtIncome = E 3000000 + taxable adds 0 = 3000000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 3000000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 3000000
- SSO: wage 3000000 → base clamp(1,650–20,000 ฿) = 2000000 · ×5% = 100000.00 → baht half-up 1000 ⇒ 100000
- WHT (YTD, month 1, k=11): projected income = 0 + 3000000 + 3000000×11 = 36000000 · projected SSO = 0 + 100000 + 100000×11 = 1200000 · expense min(50%, 100,000 ฿) = 10000000 · net = 36000000 − 10000000 − 6,000,000 − min(1200000, 900,000) = 19100000 · annual tax 205000 · due 205000 − 0 = 205000 ⇒ ÷12 half-up = 17083
- available = 3000000 + 0 + 0 − 100000 − 17083 = 2882917
- net = 2882917
- gross = E0 3000000 + add 0 − deduct 0 = 3000000 (= net + SSO + WHT)
- ⇒ gross 3000000 · SSO 100000 · WHT 17083 · net 2882917 · carry — · flags —

### V59 — L5 SSO 10,010 ฿ ⇒ 500.50 ⇒ 501 ฿ (half-up, s.46) `[r3-schema]`
- BASE 1001000
- E0 (pay lines) = 1001000
- whtIncome = E 1001000 + taxable adds 0 = 1001000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 1001000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 1001000
- SSO: wage 1001000 → base clamp(1,650–17,500 ฿) = 1001000 · ×5% = 50050.00 → baht half-up 501 ⇒ 50100
- WHT (YTD, month 1, k=11): projected income = 0 + 1001000 + 1001000×11 = 12012000 · projected SSO = 0 + 50100 + 50100×11 = 601200 · expense min(50%, 100,000 ฿) = 6006000 · net = 12012000 − 6006000 − 6,000,000 − min(601200, 900,000) = 0 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 1001000 + 0 + 0 − 50100 − 0 = 950900
- net = 950900
- gross = E0 1001000 + add 0 − deduct 0 = 1001000 (= net + SSO + WHT)
- ⇒ gross 1001000 · SSO 50100 · WHT 0 · net 950900 · carry — · flags —

### V60 — L5 SSO 10,009 ฿ ⇒ 500.45 ⇒ 500 ฿ `[r3-schema]`
- BASE 1000900
- E0 (pay lines) = 1000900
- whtIncome = E 1000900 + taxable adds 0 = 1000900 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 1000900 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 1000900
- SSO: wage 1000900 → base clamp(1,650–17,500 ฿) = 1000900 · ×5% = 50045.00 → baht half-up 500 ⇒ 50000
- WHT (YTD, month 1, k=11): projected income = 0 + 1000900 + 1000900×11 = 12010800 · projected SSO = 0 + 50000 + 50000×11 = 600000 · expense min(50%, 100,000 ฿) = 6005400 · net = 12010800 − 6005400 − 6,000,000 − min(600000, 900,000) = 0 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 1000900 + 0 + 0 − 50000 − 0 = 950900
- net = 950900
- gross = E0 1000900 + add 0 − deduct 0 = 1000900 (= net + SSO + WHT)
- ⇒ gross 1000900 · SSO 50000 · WHT 0 · net 950900 · carry — · flags —

### V61 — L1 two categories: damages 2,000 + OT overpayment 2,000 · 10 % each, 20 % total `[r3-schema]`
- BASE 1500000
- E0 (pay lines) = 1500000
- whtIncome = E 1500000 + taxable adds 0 = 1500000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 1500000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 1500000
- SSO: wage 1500000 → base clamp(1,650–17,500 ฿) = 1500000 · ×5% = 75000.00 → baht half-up 750 ⇒ 75000
- WHT (YTD, month 1, k=11): projected income = 0 + 1500000 + 1500000×11 = 18000000 · projected SSO = 0 + 75000 + 75000×11 = 900000 · expense min(50%, 100,000 ฿) = 9000000 · net = 18000000 − 9000000 − 6,000,000 − min(900000, 900,000) = 2100000 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 1500000 + 0 + 0 − 75000 − 0 = 1425000
- claim a1 (DAMAGES) 200000: category cap floor(1500000×1000/10000) = 150000 − used 0 · total cap floor(1500000×2000/10000) = 300000 − used 0 · available left 1425000 ⇒ applied 150000
- claim a2 (OVERPAY) 200000: category cap floor(1500000×1000/10000) = 150000 − used 0 · total cap floor(1500000×2000/10000) = 300000 − used 150000 · available left 1275000 ⇒ applied 150000
- advances 0 applied 0 (limited by available 1425000 only) · claims applied 300000 · carry [('DAMAGES', 50000), ('OVERPAY', 50000)] · net = 1125000
- gross = E0 1500000 + add 0 − deduct 300000 = 1200000 (= net + SSO + WHT)
- ⇒ gross 1200000 · SSO 75000 · WHT 0 · net 1125000 · carry ['DAMAGES:50000', 'OVERPAY:50000'] · flags ['CARRY_FORWARD', 'CLAIM_CAPPED']

### V62 — L1 shop caps 30 %/40 % + consent ⇒ 4,000 applied in full `[r3-schema]`
- BASE 1500000
- E0 (pay lines) = 1500000
- whtIncome = E 1500000 + taxable adds 0 = 1500000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 1500000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 1500000
- SSO: wage 1500000 → base clamp(1,650–17,500 ฿) = 1500000 · ×5% = 75000.00 → baht half-up 750 ⇒ 75000
- WHT (YTD, month 1, k=11): projected income = 0 + 1500000 + 1500000×11 = 18000000 · projected SSO = 0 + 75000 + 75000×11 = 900000 · expense min(50%, 100,000 ฿) = 9000000 · net = 18000000 − 9000000 − 6,000,000 − min(900000, 900,000) = 2100000 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 1500000 + 0 + 0 − 75000 − 0 = 1425000
- claim a1 (DAMAGES, consent) 400000: category cap floor(1500000×3000/10000) = 450000 − used 0 · total cap floor(1500000×4000/10000) = 600000 − used 0 · available left 1425000 ⇒ applied 400000
- advances 0 applied 0 (limited by available 1425000 only) · claims applied 400000 · carry [] · net = 1025000
- gross = E0 1500000 + add 0 − deduct 400000 = 1100000 (= net + SSO + WHT)
- ⇒ gross 1100000 · SSO 75000 · WHT 0 · net 1025000 · carry — · flags —

### V63 — L1 shop caps 30 %/40 % without consent ⇒ legal 10 % applied · warning CAP_NEEDS_CONSENT `[r3-schema]`
- BASE 1500000
- E0 (pay lines) = 1500000
- whtIncome = E 1500000 + taxable adds 0 = 1500000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 1500000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 1500000
- SSO: wage 1500000 → base clamp(1,650–17,500 ฿) = 1500000 · ×5% = 75000.00 → baht half-up 750 ⇒ 75000
- WHT (YTD, month 1, k=11): projected income = 0 + 1500000 + 1500000×11 = 18000000 · projected SSO = 0 + 75000 + 75000×11 = 900000 · expense min(50%, 100,000 ฿) = 9000000 · net = 18000000 − 9000000 − 6,000,000 − min(900000, 900,000) = 2100000 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 1500000 + 0 + 0 − 75000 − 0 = 1425000
- claim a1 (DAMAGES) 400000: category cap floor(1500000×1000/10000) = 150000 − used 0 · total cap floor(1500000×2000/10000) = 300000 − used 0 · available left 1425000 ⇒ applied 150000
- advances 0 applied 0 (limited by available 1425000 only) · claims applied 150000 · carry [('DAMAGES', 250000)] · net = 1275000
- gross = E0 1500000 + add 0 − deduct 150000 = 1350000 (= net + SSO + WHT)
- ⇒ gross 1350000 · SSO 75000 · WHT 0 · net 1275000 · carry ['DAMAGES:250000'] · flags ['CAP_NEEDS_CONSENT', 'CARRY_FORWARD', 'CLAIM_CAPPED']

### V64 — L6 refund of over-deducted lateness (ALLOWANCE, LATE_RULE) ⇒ taxable and SSO wage `[r3-schema]`
- BASE 1500000
- E0 (pay lines) = 1500000
- whtIncome = E 1500000 + taxable adds 3125 = 1503125 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 1500000 + ALLOWANCE 0 + LATE_REFUND 3125 + COMMISSION 0 = 1503125
- SSO: wage 1503125 → base clamp(1,650–17,500 ฿) = 1503125 · ×5% = 75156.25 → baht half-up 752 ⇒ 75200
- WHT (YTD, month 1, k=11): projected income = 0 + 1503125 + 1500000×11 = 18003125 · projected SSO = 0 + 75200 + 75000×11 = 900200 · expense min(50%, 100,000 ฿) = 9001563 · net = 18003125 − 9001563 − 6,000,000 − min(900200, 900,000) = 2101562 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 1500000 + 3125 + 0 − 75200 − 0 = 1427925
- net = 1427925
- gross = E0 1500000 + add 3125 − deduct 0 = 1503125 (= net + SSO + WHT)
- ⇒ gross 1503125 · SSO 75200 · WHT 0 · net 1427925 · carry — · flags —

### V65 — L8 leaver's final period: uncollected claim ⇒ receivable, not carried `[r3-schema]`
- BASE 1500000
- PRORATION (÷30, L2): 20 calendar days employed · min(base, halfUp(1500000×20/30)) = min(1500000, 1000000) → 1000000 ⇒ line -500000
- E0 (pay lines) = 1000000
- whtIncome = E 1000000 + taxable adds 0 = 1000000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 1000000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 1000000
- SSO: wage 1000000 → base clamp(1,650–17,500 ฿) = 1000000 · ×5% = 50000.00 → baht half-up 500 ⇒ 50000
- WHT (YTD, month 1, k=11): projected income = 0 + 1000000 + 1500000×11 = 17500000 · projected SSO = 0 + 50000 + 75000×11 = 875000 · expense min(50%, 100,000 ฿) = 8750000 · net = 17500000 − 8750000 − 6,000,000 − min(875000, 900,000) = 1875000 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 1000000 + 0 + 0 − 50000 − 0 = 950000
- claim a1 (DAMAGES) 400000: category cap floor(1000000×1000/10000) = 100000 − used 0 · total cap floor(1000000×2000/10000) = 200000 − used 0 · available left 950000 ⇒ applied 100000
- final period of a leaver (L8): uncollected [('DAMAGES', 300000)] ⇒ employee receivable, not carried
- advances 0 applied 0 (limited by available 950000 only) · claims applied 100000 · receivable [('DAMAGES', 300000)] · net = 850000
- gross = E0 1000000 + add 0 − deduct 100000 = 900000 (= net + SSO + WHT)
- ⇒ gross 900000 · SSO 50000 · WHT 0 · net 850000 · carry — · flags ['CLAIM_CAPPED', 'PARTIAL_MONTH', 'RECEIVABLE']

### V66 — L8 leaver's final period: advance larger than pay ⇒ receivable ADVANCE `[r3-schema]`
- BASE 1500000
- PRORATION (÷30, L2): 10 calendar days employed · min(base, halfUp(1500000×10/30)) = min(1500000, 500000) → 500000 ⇒ line -1000000
- E0 (pay lines) = 500000
- whtIncome = E 500000 + taxable adds 0 = 500000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 500000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 500000
- SSO: wage 500000 → base clamp(1,650–17,500 ฿) = 500000 · ×5% = 25000.00 → baht half-up 250 ⇒ 25000
- WHT (YTD, month 1, k=11): projected income = 0 + 500000 + 1500000×11 = 17000000 · projected SSO = 0 + 25000 + 75000×11 = 850000 · expense min(50%, 100,000 ฿) = 8500000 · net = 17000000 − 8500000 − 6,000,000 − min(850000, 900,000) = 1650000 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 500000 + 0 + 0 − 25000 − 0 = 475000
- final period of a leaver (L8): uncollected [('ADVANCE', 425000)] ⇒ employee receivable, not carried
- advances 900000 applied 475000 (limited by available 475000 only) · claims applied 0 · receivable [('ADVANCE', 425000)] · net = 0
- gross = E0 500000 + add 0 − deduct 475000 = 25000 (= net + SSO + WHT)
- ⇒ gross 25000 · SSO 25000 · WHT 0 · net 0 · carry — · flags ['PARTIAL_MONTH', 'RECEIVABLE']

### V67 — L1 carry-in DAMAGES row keeps its category cap with a new damage row `[r3-schema]`
- BASE 2000000
- E0 (pay lines) = 2000000
- whtIncome = E 2000000 + taxable adds 0 = 2000000 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 2000000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 2000000
- SSO: wage 2000000 → base clamp(1,650–17,500 ฿) = 1750000 · ×5% = 87500.00 → baht half-up 875 ⇒ 87500
- WHT (YTD, month 1, k=11): projected income = 0 + 2000000 + 2000000×11 = 24000000 · projected SSO = 0 + 87500 + 87500×11 = 1050000 · expense min(50%, 100,000 ฿) = 10000000 · net = 24000000 − 10000000 − 6,000,000 − min(1050000, 900,000) = 7100000 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 2000000 + 0 + 0 − 87500 − 0 = 1912500
- claim a1 (DAMAGES) 100000: category cap floor(2000000×1000/10000) = 200000 − used 0 · total cap floor(2000000×2000/10000) = 400000 − used 0 · available left 1912500 ⇒ applied 100000
- claim a5 (DAMAGES) 150000: category cap floor(2000000×1000/10000) = 200000 − used 100000 · total cap floor(2000000×2000/10000) = 400000 − used 100000 · available left 1812500 ⇒ applied 100000
- advances 0 applied 0 (limited by available 1912500 only) · claims applied 200000 · carry [('DAMAGES', 50000)] · net = 1712500
- gross = E0 2000000 + add 0 − deduct 200000 = 1800000 (= net + SSO + WHT)
- ⇒ gross 1800000 · SSO 87500 · WHT 0 · net 1712500 · carry ['DAMAGES:50000'] · flags ['CARRY_FORWARD', 'CLAIM_CAPPED']

### V68 — r3 Por.96 ข้อ 1(5): bonus 100,000 in month 6 of a 50,000 salary · prior 5 months · bonus tax withheld in full this month `[r3-new]`
- BASE 5000000
- E0 (pay lines) = 5000000
- whtIncome = E 5000000 + taxable adds 10000000 = 15000000 (one-off 10000000) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 5000000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 5000000
- SSO: wage 5000000 → base clamp(1,650–17,500 ฿) = 1750000 · ×5% = 87500.00 → baht half-up 875 ⇒ 87500
- WHT (YTD, month 6, k=6): projected income = 25000000 + 5000000 + 5000000×6 = 60000000 · projected SSO = 437500 + 87500 + 87500×6 = 1050000 · expense min(50%, 100,000 ฿) = 10000000 · net = 60000000 − 10000000 − 6,000,000 − min(1050000, 900,000) = 43100000 · annual tax 2060000 · due 2060000 − 858335 = 1201665 ⇒ ÷7 half-up = 171666
- one-off (Por.96/2543 ข้อ 1(5)): annual tax with the one-off 3215000 − without 2060000 = 1155000, withheld this month in full
- available = 5000000 + 10000000 + 0 − 87500 − 1326666 = 13585834
- net = 13585834
- gross = E0 5000000 + add 10000000 − deduct 0 = 15000000 (= net + SSO + WHT)
- ⇒ gross 15000000 · SSO 87500 · WHT 1326666 · net 13585834 · carry — · flags —

### V69 — r3 December bonus 30,000 on a 30,000 salary · prior 11 months `[r3-new]`
- BASE 3000000
- E0 (pay lines) = 3000000
- whtIncome = E 3000000 + taxable adds 3000000 = 6000000 (one-off 3000000) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 3000000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 = 3000000
- SSO: wage 3000000 → base clamp(1,650–17,500 ฿) = 1750000 · ×5% = 87500.00 → baht half-up 875 ⇒ 87500
- WHT (YTD, month 12, k=0): projected income = 33000000 + 3000000 + 3000000×0 = 36000000 · projected SSO = 962500 + 87500 + 87500×0 = 1050000 · expense min(50%, 100,000 ฿) = 10000000 · net = 36000000 − 10000000 − 6,000,000 − min(1050000, 900,000) = 19100000 · annual tax 205000 · due 205000 − 187917 = 17083 ⇒ ÷1 half-up = 17083
- one-off (Por.96/2543 ข้อ 1(5)): annual tax with the one-off 355000 − without 205000 = 150000, withheld this month in full
- available = 3000000 + 3000000 + 0 − 87500 − 167083 = 5745417
- net = 5745417
- gross = E0 3000000 + add 3000000 − deduct 0 = 6000000 (= net + SSO + WHT)
- ⇒ gross 6000000 · SSO 87500 · WHT 167083 · net 5745417 · carry — · flags —

### V70 — r3 ALLOWANCE flagged one-off 10,000 on a 50,000 salary · month 1 `[r3-new]`
- BASE 5000000
- E0 (pay lines) = 5000000
- whtIncome = E 5000000 + taxable adds 1000000 = 6000000 (one-off 1000000) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 5000000 + ALLOWANCE 1000000 + LATE_REFUND 0 + COMMISSION 0 = 6000000
- SSO: wage 6000000 → base clamp(1,650–17,500 ฿) = 1750000 · ×5% = 87500.00 → baht half-up 875 ⇒ 87500
- WHT (YTD, month 1, k=11): projected income = 0 + 5000000 + 5000000×11 = 60000000 · projected SSO = 0 + 87500 + 87500×11 = 1050000 · expense min(50%, 100,000 ฿) = 10000000 · net = 60000000 − 10000000 − 6,000,000 − min(1050000, 900,000) = 43100000 · annual tax 2060000 · due 2060000 − 0 = 2060000 ⇒ ÷12 half-up = 171667
- one-off (Por.96/2543 ข้อ 1(5)): annual tax with the one-off 2160000 − without 2060000 = 100000, withheld this month in full
- available = 5000000 + 1000000 + 0 − 87500 − 271667 = 5640833
- net = 5640833
- gross = E0 5000000 + add 1000000 − deduct 0 = 6000000 (= net + SSO + WHT)
- ⇒ gross 6000000 · SSO 87500 · WHT 271667 · net 5640833 · carry — · flags —

### V71 — r3 SSO wage is data: a row listing OT + HOLIDAY_WORK counts them (wage 8,000 + OT 3,000 + holiday work) `[r3-new]`
- BASE 800000
- HOLIDAY_WORK 2031-09-17 (HOLIDAY, MONTHLY, ×1.0): minutes 480 − 0 paid by OT request = 480 · 3840000000000/144000000 = 80000/3 → 26667
- E0 (pay lines) = 826667
- whtIncome = E 826667 + taxable adds 300000 = 1126667 (one-off 0) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION', 'OT', 'HOLIDAY_WORK']) = BASE 800000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 0 + OT 300000 + HOLIDAY_WORK 26667 = 1126667
- SSO: wage 1126667 → base clamp(1,650–17,500 ฿) = 1126667 · ×5% = 56333.35 → baht half-up 563 ⇒ 56300
- WHT (YTD, month 1, k=11): projected income = 0 + 1126667 + 800000×11 = 9926667 · projected SSO = 0 + 56300 + 40000×11 = 496300 · expense min(50%, 100,000 ฿) = 4963334 · net = 9926667 − 4963334 − 6,000,000 − min(496300, 900,000) = 0 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- available = 826667 + 300000 + 0 − 56300 − 0 = 1070367
- net = 1070367
- gross = E0 826667 + add 300000 − deduct 0 = 1126667 (= net + SSO + WHT)
- ⇒ gross 1126667 · SSO 56300 · WHT 0 · net 1070367 · carry — · flags —

### V72 — r3 default row: OT, holiday-work premium, bonus OUT of SSO wage; commission IN [U] (wage 8,000) `[r3-new]`
- BASE 800000
- HOLIDAY_WORK 2031-09-17 (HOLIDAY, MONTHLY, ×1.0): minutes 480 − 0 paid by OT request = 480 · 3840000000000/144000000 = 80000/3 → 26667
- E0 (pay lines) = 826667
- whtIncome = E 826667 + taxable adds 450000 = 1276667 (one-off 100000) · ssoWage (row components ['BASE', 'ALLOWANCE', 'LATE_REFUND', 'COMMISSION']) = BASE 800000 + ALLOWANCE 0 + LATE_REFUND 0 + COMMISSION 50000 = 850000
- SSO: wage 850000 → base clamp(1,650–17,500 ฿) = 850000 · ×5% = 42500.00 → baht half-up 425 ⇒ 42500
- WHT (YTD, month 1, k=11): projected income = 0 + 1176667 + 800000×11 = 9976667 · projected SSO = 0 + 42500 + 40000×11 = 482500 · expense min(50%, 100,000 ฿) = 4988334 · net = 9976667 − 4988334 − 6,000,000 − min(482500, 900,000) = 0 · annual tax 0 · due 0 − 0 = 0 ⇒ ÷12 half-up = 0
- one-off (Por.96/2543 ข้อ 1(5)): annual tax with the one-off 0 − without 0 = 0, withheld this month in full
- available = 826667 + 450000 + 0 − 42500 − 0 = 1234167
- net = 1234167
- gross = E0 826667 + add 450000 − deduct 0 = 1276667 (= net + SSO + WHT)
- ⇒ gross 1276667 · SSO 42500 · WHT 0 · net 1234167 · carry — · flags ['SSO_COMMISSION_U']

### OTN-01 — MONTHLY 14,000 · workday OT 120 · N 480 (= H2.9 worked example)
- segments ['OT_WORKDAY:120:15000:17500'] (amount = rate × minutes × bp / (divisor), divisor monthly 30×min(480,N)×10000 · daily min(480,N)×10000 · hourly 60×10000, half-up once per segment) · total 17500

### OTN-02 — same · N 450 ⇒ divisor 30×450
- segments ['OT_WORKDAY:120:15000:18667'] (amount = rate × minutes × bp / (divisor), divisor monthly 30×min(480,N)×10000 · daily min(480,N)×10000 · hourly 60×10000, half-up once per segment) · total 18667

### OTN-03 — same · N 540 ⇒ divisor capped at 480
- segments ['OT_WORKDAY:120:15000:17500'] (amount = rate × minutes × bp / (divisor), divisor monthly 30×min(480,N)×10000 · daily min(480,N)×10000 · hourly 60×10000, half-up once per segment) · total 17500

### OTN-04 — DAILY 400 · day off no shift 600 min · N 420 ⇒ 420 holiday work ×2 + 180 ×3
- segments ['HOLIDAY_WORK:420:20000:80000', 'OT_HOLIDAY:180:30000:51429'] (amount = rate × minutes × bp / (divisor), divisor monthly 30×min(480,N)×10000 · daily min(480,N)×10000 · hourly 60×10000, half-up once per segment) · total 131429

### OTN-05 — HOURLY 65 · holiday shift OT 90 · N 450 (hourly ignores N)
- segments ['OT_HOLIDAY:90:30000:29250'] (amount = rate × minutes × bp / (divisor), divisor monthly 30×min(480,N)×10000 · daily min(480,N)×10000 · hourly 60×10000, half-up once per segment) · total 29250


## B. DB literals `[r2-value]` `[r3-value: mB WHT, Oct mB, totals]` (S4 · system A · Sept/Oct 2031 · pay dates 2031-09-30 / 2031-10-31 ⇒ month 9 / 10)
Fixture: shop holiday Wed 17 Sep (PUBLIC, shop-wide). Shift 07:00–15:00 (420–900, no break). Law rows: SSO max 1,750,000 from 2031-01-01; SSO max 2,000,000 from 2031-10-01 (QC dates).
- **mA** monthly 3,000,000 · roster Mon 1–Fri 5 + Wed 17, on time · Sat 6 worked 09:00–19:00 with OT request 09:00–19:00 (owner, BEFORE) approved 8 Sep ⇒ H2.9 segments HOLIDAY_WORK 480 × 1.0 = 3,000,000×480×10000/144,000,000 = **100,000** + OT_HOLIDAY 120 × 3.0 = **75,000** ⇒ OT_REQUEST row **175,000** (verified on the lane DB in r1) · manual DEDUCTION **700,000** (category DAMAGES, no consent).
  Lines: BASE 3,000,000 · Sat 6: 480 − 480 (request) = 0 ⇒ no line · Wed 17 HOLIDAY_WORK 3,000,000×480×10000/(30×480×10000) = **100,000** · OT 175,000 · DEDUCTION.
  E 3,100,000 · whtIncome = ssoWage = 3,275,000 ⇒ SSO base 1,750,000 ⇒ **87,500** · WHT k=3: 3,275,000 + 3,000,000×3 = 12,275,000; SSO 87,500×4 = 350,000; net 12,275,000 − 6,137,500 − 6,000,000 − 350,000 < 0 ⇒ **0** · available 3,187,500 · DAMAGES cap ⌊3,275,000 × 10 %⌋ = 327,500 (total cap 655,000) ⇒ applied **327,500**, carry DAMAGES **372,500** · net **2,860,000** · gross 3,100,000 + 175,000 − 327,500 = **2,947,500**.
- **mB** monthly 8,000,000 · roster Mon 1, Tue 2 · Sat 6 worked 09:00–19:00, **no request** ⇒ DAY_OFF hw 480 · BONUS 1,000,000 · REFUND 50,000.
  HOLIDAY_WORK 8,000,000×480×10000/144,000,000 = 266,666.67 ⇒ **266,667** · E 8,266,667 · whtIncome 9,266,667 (one-off BONUS 1,000,000) · SSO wage (r3 default components) = BASE 8,266,667 − holiday-work premium 266,667 = 8,000,000 ⇒ SSO **87,500** · WHT regular (r3): 8,266,667 + 8,000,000×3 = 32,266,667; net 32,266,667 − 10,000,000 − 6,000,000 − 350,000 = 15,916,667; tax 916,667 × 5 % = 45,833.35 ⇒ 45,833; ÷4 = 11,458.25 ⇒ 11,458 · one-off (Por.96 ข้อ 1(5)): with the bonus net 16,916,667 ⇒ tax 95,833; 95,833 − 45,833 = **50,000** withheld now ⇒ WHT **61,458** · available 9,266,667 + 50,000 − 87,500 − 61,458 = **9,167,709** = net · gross **9,316,667**.
- **eC** monthly 1,500,000 · starts 16 Sep ⇒ 15 days ⇒ ÷30 (L2): 1,500,000×15/30 = 750,000 ⇒ −750,000 · UNPAID_LEAVE ⌊1,500,000×480/14,400⌋ = −50,000 · E 700,000 · SSO 700,000 × 5 % = **35,000** · WHT 0 · available 665,000 · ADVANCE 900,000 applied **665,000**, carry ADVANCE **235,000** · net **0** · gross **35,000** (unchanged from r1).
- Sept totals: gross 12,299,167 · SSO ee 210,000 · SSO er 210,000 · WHT 61,458 · net 12,027,709 · add 1,225,000 · deduct 992,500. JV: Dr 6000 = 12,299,167 + 210,000 = **12,509,167** · Cr 1010 12,027,709 + 2100 420,000 + 2130 61,458 = 12,509,167. (mA: SSO wage = 3,100,000 − 100,000 holiday-work premium = 3,000,000 ⇒ still 87,500; OT 175,000 out of SSO wage.)
- Carry rows at Sept approve (2031-10, APPROVED, CARRY_FORWARD): eC ADVANCE 235,000 (`cf:<run>:<emp>:ADVANCE`) · mA DEDUCTION 372,500 (`cf:<run>:<emp>:DAMAGES`).
- Late request (after Sept approve): mB Sat 6 request 09:00–19:00 filed 6 Sep 20:00, approved 1 Oct ⇒ H2.9 subtracts the 480 run-priced minutes ⇒ OT_HOLIDAY 120 × 3.0 = 8,000,000×120×30000/144,000,000 = **200,000** (r1 base without the hunk paid 466,667 @2031-09 — observed) ⇒ row OT 200,000 in 2031-10.
- Oct (month 10, k = 2, SSO row max 2,000,000 ⇒ 1,000 ฿):
  mA BASE 3,000,000 · SSO **100,000** · carry-in DAMAGES 372,500 vs cap ⌊3,000,000 × 10 %⌋ = 300,000 ⇒ applied **300,000**, new carry DAMAGES 72,500 · WHT 0 (projection 12,275,000 below allowances) · net **2,600,000** · gross **2,700,000**.
  mB BASE 8,000,000 + OT 200,000 (regular, [U]) · SSO wage 8,000,000 (OT out) ⇒ **100,000** · prior 9,266,667 / 61,458 / 87,500 ⇒ projected 9,266,667 + 8,200,000 + 16,000,000 = 33,466,667; SSO 387,500; net 17,079,167; tax 2,079,167 × 5 % = 103,958.35 ⇒ 103,958; due 103,958 − 61,458 = 42,500 ÷ 3 = 14,166.67 ⇒ **14,167** · net 8,200,000 − 100,000 − 14,167 = **8,085,833**.
  eC BASE 1,500,000 · SSO 75,000 · carry-in ADVANCE 235,000 ⇒ net **1,190,000**, gross 1,265,000.
  Oct totals: gross 12,165,000 · SSO 275,000 / 275,000 · WHT 14,167 · net 11,875,833.
- Two periods: eC advance 665,000 + 235,000 = 900,000 · mA claim 327,500 + 300,000 = 627,500 applied + 72,500 carried to Nov = 700,000.
- System B (stale): eS monthly 2,000,000 (IN 07:20 ⇒ late 20) · MISSING_OUT ⇒ WORK_ENTRIES; OUT 15:00 + recompute ⇒ create ok: gross 2,000,000 · SSO 87,500 · WHT 0 · net **1,912,500**; OUT moved to 16:00 + recompute ⇒ approve WORK_ENTRIES.
- S7.1 (H3.2 present): LATE_RULE ⌊2,000,000×20/14,400⌋ = 2,777 ⇒ E 1,997,223 = whtIncome = ssoWage ⇒ SSO 87,500 · WHT 0 · net **1,909,723**.

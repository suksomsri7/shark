# H4.2 review — labour cost % vs sales (reviewer, read-only, commit 96c5d4a33 vs ae33a9fc3)

Scope read: brief + both rulings, oracle note, builder notes, `git diff ae33a9fc3 96c5d4a33 -- src scripts`. The working tree was not used. The follow-up that switches to a static `tenantDb` import was ignored as instructed.
Line numbers are at 96c5d4a33. L = `src/lib/modules/hr/labor.ts`, R = `hr/labor-rules.ts`.

## Verdict: FIX FIRST (1 BLOCKER: a privacy leak by subtraction that uses the oracle's own fixture)

## 1. Privacy

**Where permission comes from.** Every export (`laborDay` `laborWeek` `laborMonth` `getLaborSettings` `setLaborSettings`) goes through `gateOf` (L:104-119).
- The gate reads the Membership row by userId plus an accepted invite, and the DB role must equal the claimed role.
- Permissions and unitAccess are taken from the DB. A spoofed `permissions` value from the caller is ignored.
- The POS facade receives an actor built from the DB row (L:157), not the caller's viewer. OK.
- Pages and the action pass `hrViewerOf(auth)` (the session).

**What each viewer gets:**
- OWNER and all-branch payroll viewers (unitAccess `["*"]` or `[]`): all money, nothing suppressed.
- Branch-limited payroll viewer: units in scope only. P2 hider (L:409-419): a cell is hidden when it has 1–2 contributors and one of them has a home unit outside scope (or no home unit).
- Manager without the payroll key: `money:null`; week footer is `{paidMinutes}` only; month = NO.
- Plain employee, other tenant, spoofed role: the same NO bytes.

**Client exposure:**
- The 01 card is a server component (labor-ui.tsx), so no props are serialized.
- The roster page sends the client `RosterBoard` the week DTO plus the day DTO with `money:null` (roster/page.tsx hunk). For money viewers the week footer's cost reaches the client by design.
- Hidden cells reach the client as `null`. The chart scale skips them (labor-ui:40) and the shift % is null when the shift cost is null.

### BLOCKER B1 — complementary-suppression leak: an aggregate minus its visible parts gives the hidden cell (L:580-592, L:649-652, L:462-513)
P2 is applied to each cell on its own (`union(...).who` for week and month, `show()` for each day, hour and shift cell). No aggregate is hidden when one of its parts is hidden. Worked example with the oracle fixture, viewer = payroll MANAGER `[U2]`:
- `laborDay U2 2027-01-12`: J (home U1) is alone, so the cost is null. Correct.
- `laborDay U2 2027-01-13`: J+K+L, 3 contributors, so 110,250 is shown (the oracle requires this).
- Other days of week 2027-01-11 at U2 are 0 and shown.
- `laborWeek U2 2027-01-11`: who = {J,K,L}, size 3, so the footer `costSatang` = 147,000 is shown (sent to the client on /hr/roster).
- 147,000 − 110,250 − 0 = **36,750 = J's hidden day**. The oracle note §2 says this exact number "must not appear for the [U2] viewer".

The same pattern works at other levels:
- **Day total vs hours.** J 10–18 at U2, K and L 10–14 only. Hours 14–17 have who={J} and are hidden, but the day total (3 contributors) is shown. Day − Σ shown hours − unallocated = J's 4 hours = 18,375, which gives J's rate.
- **Day total vs shifts.** J alone on a shift: day − Σ shown shifts − unallocated = J's shift cost.
- **Month ESTIMATE (no run) vs days.** Month − Σ shown days = the hidden days.

Fix (small): complementary suppression.
- Hide the week or month aggregate when any day in it would be hidden for this viewer.
- Hide the day total, wage, SSO and pct when any hour or shift cell is hidden.

The oracle does not assert the [U2] week footer value, so the fix should stay green. Please add an oracle check: `[U2]` week 2027-01-11 footer `costSatang === null`.

### MAJOR M1 (design, for the controller) — the "≥ 3 contributors" rule still leaks by differencing even with B1 fixed
The 3-person threshold counts all contributors. It does not count unknown-pay contributors. A [U2] payroll viewer already knows the pay of U2 home staff. So when a cell contains one borrowed person plus home staff, cell − known home pay = the borrowed person's share:
- 01-13: 110,250 − K 36,750 − L 36,750 = J 36,750.
- Hour differencing: hour 9 {K,L,M} vs hour 10 {J,K,L,M} are both shown, and the difference is J's hourly cost ±1–3 satang.
- Month ACTUAL: U2 = E + 2 home staff is shown, and minus their payslips gives E's U2 share.

The oracle locks "3 contributors shown 110,250" (S5.2), so this is a brief and oracle rule, not a builder fault.

Robust options:
- (a) For branch-limited viewers, leave borrowed-in staff out of all money cells, with a note "ไม่รวมพนักงานยืมตัว".
- (b) Hide every cell that contains any out-of-scope contributor.

Needs a ruling plus an oracle edit.

### NOTE
- Hidden hour keys still appear (with `costSatang:null`), so the hour list shows when a borrowed person worked. That is timing, not money; roster readers see the roster anyway.
- `suppressed` counts are harmless.
- `setLaborSettings` refuses roster or payroll readers with `code:"BAD"` + settingsNo (L:684), but strangers get `NO`. The two are distinguishable, though no data leaks.

## 2. Money / arithmetic

Checks that passed:
- Integer satang; `halfUp` and `largestRemainder` use BigInt (R:41, R:148).
- Q4/Q4b `monthlyShare` (R:76-96) matches ruling 2. A start on the 1st or an end on the last day is treated as a full month; partial months use E = min(base, halfUp(base·d/30)) spread over d days, so Σ = E.
- SSO pro rata uses `wage×D` capped (R:137).
- The D7 2-branch split splits wage and SSO with the same weights, so Σ = cost (L:354-366).
- Bangkok overnight slots and cutoff hour keys match `reportHourly` (R:173-190 vs reports.ts:1279-1281).
- `pctTenths`: sales ≤ 0 gives null, shown as "—" (R:215). Negative refund-only days also give null.
- Values stay far below 2^53.

I checked the S4.12 golden: N in Jan = ⌊1,000,000/31⌋ = 32,258; SSO halfUp(999,998·500/310,000) = 1,613; 247,723 + 33,871 = 281,594. ✔

**MAJOR M2 — the current-month % on the 01 card mixes bases** (L:606 vs L:639-645). In ESTIMATE the month cost is the whole calendar month (every day, future days included), but `salesSatang` is actual POS sales to date only.
- Example on 14 Nov: one monthly employee at 30,000฿ (cost ≈ 30,750 with SSO) and 10,000฿/day of sales. The card shows 30,750/140,000 = **22.0%**; the real month is about 10.3%.
- The card is overstated every day until month end (always red vs the 28% target early in the month).
- Fix: in an open month, either use cost to date (days ≤ today) or sales actual plus forecast for the remaining days (as the week footer already does via `daySalesOf`).
- S4.11 asserts only past months (Jan actual, Feb estimate with no sales). Check that it stays green.

**MINOR m1 — silent truncation, no flag** (L:246-252, L:614, L:618). `take` caps of 5,000 employees and profiles, 20,000 roster entries (a month ESTIMATE for a 700+-shift shop), 10,000 items and 50,000 workdays. Past a cap the cost is understated with no flag. Add a `flags.truncated` or a guard.

**NOTE**
- `forecastHour` always divides by 4, by design and as POS does.
- `hourSlots` loops per minute, which is fine at this size.
- Time uses hand-written +7 h offsets (R:61, labor-ui:18) rather than the C.11 helpers. They are correct because there is no DST.

## 3. POS seam (`pos/reports.ts` +48, additions only; `pos/index.ts` +5)

OK:
- Same `canAccessUnit` → NOT_FOUND, then `evaluate(pos, REPORT_PERMISSION, unitId)` → PERMISSION_DENIED, the same as `scopeOf` used by `reportHourly`.
- The refusal comes before the `connected:false` probe, so whether a POS exists does not leak.
- Net rule identical to reportHourly: `notDeposit`, VOIDED skipped, REFUND negative, bills counted on SALE only. Scope is the single unit.
- ≤ 45 days. No existing report code was changed.
- F2.1h asserts hr→pos is lazy, from labor.ts only, index only.

NOTE:
- POS = an *active* AppSystem (posOfUnit rule, as the brief says). A deactivated POS turns past days into NO_POS, whereas POS reports still show that history.
- `today` uses `new Date()`, but HR recomputes it from `now`, so this is fine.

**MINOR m2 — cost.**
- Each facade call makes about 6–7 queries (unit, link, system, then `prepare` repeats system + unit, then `loadSales` row scan).
- The hub card calls `laborDay` + `laborMonth` (current + previous). That is about 3 facade calls per unit plus 3 full `loadRange` passes (all employees and profiles each time). It runs in parallel with no bound: up to 20 units ≈ 60 facade calls, about 400 queries per hub render.
- There is no N+1 per hour or day. Chunks are ≤ 45 days, with a new chunk on a gap > 8 days.
- Suggest a concurrency limit, or sharing one `loadRange` between day and month, before H4.3/H4.8 reuse this.

## 4. Settings
- `hrLabor` is written only via `lockHrSettings(tx)` → `writeHrSettingsKeys(tx,{hrLabor})` inside a `tenantDb` tx, with only the tx client (L:688-694).
- Audit `hr.labor.settings {keys}` happens after commit.
- Gate: canManageHrSettings plus all-branch, from the DB.
- Validation: integer in range for all 3 keys, and splh must be present (null allowed) (R:249-256).
- The action rejects NaN, negatives (the regex has no sign), exponent notation, fractional baht and >1 decimal of %.
- OK.

## 5. UI
- Only allowed DTOs reach the client (see §1). th+en `hr.labor` has 35 keys with parity.
- The label "ยอดขายสุทธิตามรายงาน POS (รวม VAT · …)" is present (`salesBasis`). The th key list is visible in the diff.
- Testids `hr-labor-*`, `hr-roster-demand-<day>`, `-labor-foot`, `-demand-panel`, `hr-labor-settings/-save` exist, with 14 inventory rows. `?msg=` uses the `lab.*` allowlist.
- NOTE: `hr/ui.tsx` is outside the brief file list (D-1, the slot pattern so that h2.11 S1.6 holds). The reason is sound; the controller needs to acknowledge it.

## 6. Oracle edits in 96c5d4a33
- **S3.1:** a real oracle bug (string length compared as if it were an array length). The edit makes the check *stronger*. Legit.
- **S4.12:** the golden 281,594 is correct by D2/§4.5 (leaver N counted). Legit.
- **S1.8 and qc-hr-h2.2 S6.2:** meta is now judged on the ticket's own rows; codeNoRow is unchanged. Legit, with H4.1/H2.5 as precedent.
- **S1.6 allowance:** requires the marker on *every* hunk of qc-hr-h2.2. Tight. OK.
- **S1.5:** the intent (no raw prisma) is kept, and the edit forbids the dynamic import. HEAD 96c5d4a33 itself still fails it (L:100), so it depends on the pending follow-up.
  - NOTE: the `{ tenantDb }` regex is file-wide, so a second `import { prisma as p } from core/db` would pass the import test. `prisma.` usage is still caught unless aliased. A minor weakness that could be tightened.
- None of these edits weakens privacy checks.

## 7. COMMON §F vs diff
- F2/F3/F4/F5/F6/F9 match the diff.
- F10 is marked [~] honestly (ui.tsx).
- `scripts/fitness.mts` is a §D hot file with **2** marked hunks (edge + F2.1h), while §D says "one marked hunk". NOTE; both are required by brief R2.
- §C.11 helpers: see the NOTE in §2.
- Builder §7 incident: QC4 was touched by 4 POS suites on base code. The controller should record it.

## Required before merge
1. B1 complementary suppression (week, month estimate, day vs hours/shifts) plus one oracle check.
2. M2 current-month basis (or an explicit controller ruling accepting it, with a UI note).
3. M1 needs a controller ruling (it may become a follow-up ticket, but it is a salary-inference path).

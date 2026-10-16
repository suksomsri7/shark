# P3.5 S — review notes (controller A · 17 Oct)

## Hunter (money · head d3c274ef) — N1 High · N2–N3 Medium · N4–N7 Low
# P3.5 S HUNTER (money) — d3c274ef — verdict: FINDINGS N1..N7 (1 High · 2 Medium · 4 Low)
**N1 High: an approved POS adjustment can be stuck forever.** `staff-commission.ts:243-251` × `hr/payroll.ts:191` (move-on-approve only when `row.crmCommissionId` is set) × `:349-352` (a run pulls APPROVED only).
- Scenario: 1 Oct the push writes PENDING COMMISSION 2026-09. HR creates the Sep run 1 Oct. Owner approves 2 Oct. The row stays APPROVED · 2026-09 · runId null for good; ledger rows are SENT, so no re-push. Employee never paid (or DEDUCTION never applied); report shows hrStatus APPROVED, never IN_RUN.
- This is the normal workflow, not a race: the push targets the month that just ended, which is the month HR runs next. CRM fixed this as C3.3-fix H5; POS rows have crmCommissionId null, so they take the old path.
- Fix (HR-owned, needs a ruling): widen the HR move-on-approve and stranded sweep to POS rows (H1.3 `sourceType`, or for now `requestedById null` + note prefix "ค่าคอมฯ ขายหน้าร้าน (POS)"). Log in OP §รอคำตอบ + HR owner line.
**N2 Medium: the hourly push can starve tenants.** `staff-commission.ts:184-201`: `distinct(tenantId,userId)` sorted, `take 500`, no cursor.
- Pairs with no payroll employee (commission on but no HR, unlinked sellers, staff who left) stay OPEN forever and are picked first every hour.
- Once there are ≥500 of them, or the deadline hits first, later tenants are never pushed hourly (owner button only).
- Fix: before `take`, keep only tenants with HR and users in `activeLinkedUserIds`, or add a rotating/keyset cursor.
**N3 Medium: target period can be older than HR's history.** `staff-commission.ts:224-232` `freeFrom` returns the row's own month when it has no run, even if later months have runs.
- Scenario: rows Jan–May OPEN (noEmployee, or HR adopted later), HR runs Jun–Sep. Linking the employee in Oct gives 5 PENDING adjustments in 2026-01..05, periods that will never be run — stuck like N1.
- Fix: start from `max(rowMonth, nextPeriodKey(max(runs)))`. Gap in R9's period rule; needs a ruling.
**N4 Low: fixed-per-unit commission on a line with net ≤ 0 is not reversed on partial refunds.** `staff-commission-shared.ts:320-323` (`halfUpDiv(b≤0)=0`).
- Probe: free item, fixed 500×4 = 2000; refunds 1+1+2 reverse 0, 0, 2000. If never fully refunded, the seller keeps the fixed amount for refunded units.
- Fix: when lineNet ≤ 0, split by quantity (`halfUp(acc×q/Q)`).
**N5 Low: anonymous gate leaks valid PINs.** `staff-pin.ts` `scheduleGate`, anonymous branch: off-schedule returns PIN_INVALID but writes no `pin_failed` row (no throttle slot used), and the HR reads + audit add latency.
- So a valid off-schedule PIN can be told apart from a wrong one. Impact limited: brute-force rate is unchanged, and the named path already says OFF_SCHEDULE.
- Fix: write a pin_failed-equivalent row on anonymous deny, or accept and note.
**N6 Low: unlocks just after midnight are refused.** `hr-link.ts:55-71` checks only today's row against minute-of-day.
- Shift 16:00–23:45 + late 30: 00:05 is checked against the next weekday's row ⇒ OUTSIDE_HOURS/DAY_OFF. Same for start−early < 0. Fails closed (override still works); token cap across midnight is correct (60 s–12 h).
- Fix: also test yesterday's row with minute+1440 (and tomorrow's with minute−1440).
**N7 Low: one throw aborts the whole push run.** `staff-commission.ts:197` `hrPayrollEmployeeOf` is outside the try. Fix: move it into the try.
**Verified OK**
1. Void before paid ⇒ no ACCRUE (`:62`). No VOID rows without an accrual (`:69`). Paid retried after void reverses from the snapshot ⇒ net 0.
2. Refund shares add up exactly (probes: 111+111+111=333 · 385+577=962 · 400M-satang line exact). Rate 0 ⇒ no row, no NaN.
3. Push: lock per (tenant,user) + `FOR UPDATE` + status guard + count check ⇒ no double count. SENT with null id only when a group nets to 0. Concurrent void rows go next run. PERIOD_CLOSED is a returned value, so the tx stays usable.
4–6. Current month is picked only after the row's month has a run (correct next payroll); current-month rows never pushed · later-month void ⇒ DEDUCTION |net| in the void event's month · reversals copy the accrual's rate snapshot.
7. Replay after disable stays idempotent. `bothMain` runs both sides, retries on either failure, and the commission side is idempotent. `compose(stampFromSale)` stays WARN-only; stamp/member/CRM now also re-run on a commission failure (already retry-safe).
8. `now` is not reachable from a client. Override needs a fresh manager PIN; role is checked before the PIN; a wrong PIN counts on the manager row; TTL ≤ 720 min.
9. Sync result is counts only, behind `canViewPayroll`; report gated; no REST commission op; logs hold codes only; HR card exposes a timestamp only. Note: an HR REJECT/delete leaves POS rows SENT with no re-push (by design?).


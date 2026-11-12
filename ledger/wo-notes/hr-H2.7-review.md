# Review H2.7 + H2.8: leave policies, quota ledger, holidays (independent, read-only)

> Reviewer, 12 Nov 2026 · tree `/root/projects/shark-hr-l3` · head `7fdecbba7` · scope `git diff 1d17382f8..7fdecbba7 -- src` (17 files, +1632/−9)
> Read: brief H2.7, COMMON §C/§F, notes `hr-H2.7.md`, the oracle by check id only. I ran no DB, typecheck or build. The hunter's DB probes are not included here.

## Verdict: **FIX FIRST**
Locks, transactions, events, privacy gates and the holiday preset are sound. The ledger arithmetic itself is correct: Σ rows, append-only, tenths as integers, no drift. Three ledger rules can still produce a wrong balance with ordinary use (M1–M3). Each fix is small and stays inside `leave.ts` and `settings.ts`.

## Findings

### MAJOR
**M1: carried days count as available for leave dated after they expire, so the balance goes negative.** `leave.ts:288-294` (request) and `:330-335` (decide) check Σledger for the whole leave year. That sum includes CARRY rows that will EXPIRE before the leave starts.
Scenario (seed VACATION policy: quota 6, carry 6, expiry 03-31). Year 2031 has GRANT +6 and CARRY +6, so Σ = 12. In February the employee files 1–12 Dec 2031, which is 10 working days. Request and approve both pass because 12 ≥ 10. USE −10 is written with effective date 12-01. On 1 Apr the job counts used-to-expiry = 0 (`:456-462` only counts USE effective ≤ 03-31) and writes EXPIRE −6. The balance is now **−4.0**. The employee is 4 paid days over their entitlement.
Fix: when `fromDate > carryExpiryOf(year)`, available = Σ − projectedExpire. projectedExpire = max(0, CARRY − used≤exp − pending≤exp), which is the same formula the job uses. Apply it in `reserveLeaveInTx` and in `leaveBalanceCoversInTx`.

**M2: "first write wins" CARRY/EXPIRE drift when a decision lands after the job has run.** `leave.ts:446-464`. The builder logged only the carry half of this, as D-H27-carry-late.
(a) Carry 5, expiry 03-31. A leave on 25–27 Mar (3 days) is still PENDING on 1 Apr. The job writes EXPIRE −5. The leave is approved on 2 Apr and USE −3 is written. Balance = grant 6 + 5 − 5 − 3 = **3.0**. The correct figure is 6 + 5 − 2 − 3 = **6.0**, so 3 days are lost.
(b) The leave was approved before 1 Apr, so EXPIRE was −2. It is revoked on 5 Apr and `use-revert` adds +3. Balance = 6 + 5 − 2 − 3 + 3 = **9.0**. The correct figure is 6 (all 5 carried days expire), so 3 days are gained.
(c) CARRY into Y is computed while a Y−1 leave is pending. Example: Y−1 balance 6, carry cap 5. A 3-day leave on 28–30 Dec is approved on 2 Jan. CARRY = 5, but it should be 3, so the employee gains 2 days.
Smallest fix:
- The job skips EXPIRE(Y) while PENDING leaves of that policy with `fromDate ≤ exp` exist, and skips CARRY(Y) while Y−1 PENDING leaves exist. It retries the next hour; both are bounded by the decision.
- `leaveLedgerInTx` writes a compensating row in two cases: `expire-adj:<leaveId>` when a USE or revert lands with `effectiveDate ≤ exp` after `expire:` exists, and `carry-adj:<leaveId>` when the leave year is Y−1 and `carry:` for Y exists. Both are ADJUST rows, recomputed from the formula and keyed per leave, so replay is idempotent.

**M3: changing `yearStartMonth` makes a revoke credit a different leave year than the one charged.** `leave.ts:339-347` recomputes `year` from the policy's *current* `yearStartMonth`. `updateLeavePolicy` (`settings.ts:505`) accepts a new `yearStartMonth` at any time.
Scenario: ysm 1. A leave on 10–12 Mar 2031 is approved, writing USE −3 to leaveYear 2031. The owner changes ysm to 4, then the leave is revoked. The revert writes +3 to leaveYear **2030**. Year 2031 stays at −3, so 3 days are lost permanently. A later decide check also looks at year 2030 and writes a second GRANT under a key whose year now means something different.
Fix: (1) the revert reads `leaveYear` from the `use:` row (`select {days, leaveYear}`) and writes into that year. (2) `updateLeavePolicy` refuses a `yearStartMonth` change when HrLeaveBalanceTxn rows exist for the policy. Use a fixed Thai SETTINGS_TEXT message.

### MEDIUM
**D1: days are fixed at request time and never recounted, even though decide already holds the roster keys.** `service.ts:812-856`, `leave.ts:286`.
- Holiday case: a VACATION leave filed for Mon 7 – Fri 11 Dec 2026 (2569) is counted as 4 days, because only 12-10 is in the preset. 12-05-2026 falls on a Saturday, so 12-07 is the substitution holiday. The preset correctly does not invent it (Q14). If the owner adds 12-07 after the request, the leave is still charged 4.0 days instead of 3.0.
- Roster case: the leave is filed Mon–Fri under the weekly template (5.0 days). The manager then publishes a week in which Wednesday is a day off. The leave is still charged 5.0 instead of 4.0.
Fix: at APPROVED, recount with `leaveDaysInTx` under the roster keys already taken. Then update `days`, write USE with the recounted value, and re-check the balance. Recount a PENDING leave on read, or leave it as is.

**D2: the job never goes quiet, so the 20 s cron budget starves later HR systems.**
- `leave.ts:455`: `if (carried <= 0) continue;` writes no EXPIRE row. Notes §3.6 claims "EXPIRE rows also when 0.0", but no row is written.
- `keysOf` (`:420-428`) always expects `grant:` keys, including for employees who are not eligible (VACATION `minServiceDays` 365, or NO_START).
- Result: after 03-31, every employee with zero carry, and every first-year employee, gets one locked transaction every hour, all year.
- With about 1k employees across systems, the 20 s budget (`cron/hourly/route.ts`) runs out before later systems are reached (in id order). Those systems' EXPIRE rows are never written, so their carried days never expire. That is a wrong balance.
- Fix: write the 0.0 EXPIRE row. Leave a `grant:` key out of `keysOf` when `grantDays` is not eligible or not yet effective as of `asOf`.

**D3: attaching a file lets an employee read any private file of the tenant.** `fileUsableInTx` (`leave.ts:260-267`) checks tenant, `private/` prefix, ATTACHMENT, image/pdf and "not on another leave". FileAsset has no uploader field.
- Scenario: a linked employee who learns a file id posts it to `attachLeaveFileAction`, then calls `leaveAttachmentLinkAction`. They get a working link to that file, bypassing the access check of the module that owns it. Examples of such files: a payment slip (`slip-verify.ts:563`), a CRM contract (`crm/files.ts:140`) or a chat attachment.
- There is no upload UI (Q10), so nothing legitimate depends on this path today.
- Fix: until D-H27-attach, accept only a file id issued by an HR upload as an HMAC token bound to `uploaderUserId` and `leaveId`. As a stop-gap, make `attachLeaveFile` return `fileBad` unless `actor.role === OWNER`. The oracle's S1.6 needs only the action to exist.

**D4: oracle `qc-hr-h1.2` S7.4 will stay red for an H2.7 reason as well, and the builder did not request this edit.**
- The S7.4 zero list includes `HrLeaveBalanceTxn`. Once the seed runs to the end, it writes GRANT and USE rows:
  - lvA prae VACATION approved: GRANT + USE.
  - lvP mint PERSONAL: lazy GRANT at request.
  - RS2: GRANT already present.
- The red is currently masked because the seed stops at RS2.
- A third ORACLE-EDIT is needed: drop `HrLeaveBalanceTxn` from the zero list. Drop `HrRosterEntry` too, because of H2.2. Regenerate `hr-expected.json`.

**D5: Q5 "holidays always out, even when the shop is open" blocks a legitimate sick leave.** `leave.ts:197,209` and `:287`.
- Scenario: the shop is open on 13 Apr. The employee is rostered and published on 13 Apr, falls sick, and files SICK for 13 Apr. The count is 0.0, so the request is refused with `zeroDays`.
- The absence then cannot be recorded as leave. H2.9/payroll will see an unexplained absence.
- The same happens for an ad-hoc call-in on a template day off when no roster is published (MINOR, because that call-in is not recorded anywhere).
- Fix, pending the HQ23 ruling: a published roster entry on a `shopOpen` holiday counts as a day.

### MINOR
- m1: owner-auto APPROVED (`service.ts:628-650`) does not take the roster keys, unlike decide. A concurrent `addEntry` on the owner's own day can race (C-2). Add `lockRosterKeysInTx` after the employee lock.
- m2: the `outbox-consumers.ts` hunk sits inside the H2.3 marker pair. It is still one hunk, but the nesting makes later strip-marked tooling ambiguous.
- m3: `ui.tsx` pending meta makes 2–3 queries per pending item (N+1). Acceptable at 200 rows; batch it in H2.10.
- m4: the policy `<select>` lists unit-scoped policies of other branches. Choosing one returns `policyNf`. Filter by the viewer's scope.
- m5: the "file unused" check is per HR system (tenantDb scope). The same file can go onto leaves in two HR systems of one tenant.
- m6: the settings page has six marked hunks and a second import line from `settings-actions`. The file is outside the brief's list, but it is needed for the preset button; accept as F10 [~].
- m7: seed fragility caused by H2.7. On 6 Jan, lvA (today −6..−5 = 31 Dec–1 Jan) is refused with `crossYear`. Seed item 9 then fails one day a year.

## Dead code (item 8)
Nothing is reachable.
- The old `requestLeave` bodies are inside `/* … */` (`service.ts:686-765`).
- The `approval-effects.ts` HrLeave branch (`:211-216`) comes after a block that `return`s on every HrLeave path.
- The only other `hrLeave` writers in `src` are the `create` calls inside that comment.
- No oracle static depends on the commented text. h0.7 S7.6 only counts raw `e.message` in the `requestLeave` block. hf-privacy S-8/S-9/S-14 read decide, the actions and call sites.

Smallest edit: **none needed**. S11.3 returns `n/a` once `hr/leave.ts` is on the base (`h27InBase`, qc-hr-h2.7:451/533). A follow-up cleanup on `session/hr` after the merge can delete both blocks without an ORACLE-EDIT.
If you want the cleanup inside this WO instead, give S11.3 `same()` a two-region exemption: base minus the old `requestLeave` tail from `if (await isTenantOwner(ctx.tenantId, emp.linkedUserId)) {` to the function end, and base minus the second `if (entityType === "HrLeave") {…}` block. Both comparisons stay otherwise byte-exact.

## ORACLE-EDIT / seed rulings
| request | verdict | one line |
|---|---|---|
| qc-hr-h1.2 S5.7 (drop `days` from the null count) | **APPROVE (narrow)** | Exclude only `HrLeave.days`. Keep asserting the other new HrLeave columns (policyId, halfDay, hours, attachmentKey) and all HrAttendance columns are null in the policy-less fixture. Reject the "n/a when leave.ts exists" option. |
| qc-hr-h1.2 S6.4 (allow leave.ts to read attachmentKey) | **APPROVE (MODIFY)** | Allow exactly `src/lib/modules/hr/leave.ts` for `attachmentKey` only (the other R7 fields still banned there). Conditional on D3, because this file is where the IDOR lives. |
| (missing) qc-hr-h1.2 S7.4 zero list | **ADD** | Remove `HrLeaveBalanceTxn` (H2.7) and `HrRosterEntry` (H2.2) from `zero`, then regenerate `hr-expected.json` (D4). |
| seed R-2: move prae's pending leave onto a rostered day | **APPROVE (MODIFY)** | prae's week is `mm-mm--`. Use **`fromDow 4, toDow 4`** (Friday, rostered `m`) = 1.0 day. VACATION balance 6 − 2 (lvA) = 4 ≥ 1. A one-day leave cannot cross the leave year, but 4–6 would be refused whenever 1 Jan is the Saturday or Sunday of `rosterWeek`. Nothing else in the seed depends on Sat–Sun: RS2 checks only `PENDING` and a total of 3 leaves, and `expected.roster.pendingLeave` is written from the computed dates. One caveat: the mockup-03 chip moves onto a shift cell. The visual run must accept a pending chip over a shift (CONTROLLER-RUN, not verified). Also fix m7 by clamping lvA to the same leave year. |
| HQ23 | consultant | See D5. The roster-on-a-shopOpen-holiday case is the concrete one. |

## Verified to hold
- **Ledger:**
  - No counter: balance = `aggregate _sum` of rows only.
  - No update or delete of txn rows anywhere in `src` (oracle S1.5 static, plus my grep).
  - Every key is unique per `(systemId, sourceKey)` and written with `createMany skipDuplicates`, so replay and double clicks add nothing.
  - USE happens only on `→APPROVED` from non-APPROVED. The revert happens once and only if a USE exists. Reject of a pending leave and cancel of a pending leave write nothing. BALANCE-CANCELLED writes nothing.
  - Owner-auto writes USE in the creating transaction. Chain approve writes USE in `applyLeaveDecision`'s transaction. Every row is written in the same transaction as the status `updateMany`.
- **Arithmetic:** integer tenths. Maximum leave is 366.0, which fits DECIMAL(4,1). Prorata uses floor to 0.5 on integers; hourly uses floor(h·10/8). Leave across a leave year is refused when a policy exists (`leave.ts:166-169`).
- **Locks:**
  - decide and apply: `hr-leave` → `hr-leave-emp` → roster keys.
  - cancel: leave → emp. request and job: emp only. attach: leave only. swap: `hr-swap` → roster.
  - No path takes emp or roster before a leave key, so there is no cycle.
  - Only the tx client is used under a lock. Transaction options are 20 s / 60 s.
- **COMMON §C.6:**
  - Transitions are unchanged.
  - Self-decision is still refused in decide. The AI path passes the user. Chain self-check sits in the frozen core.
  - Revoke requires `from` and is refused for engine- or chain-approved leave.
  - Leave and approval request are created in one transaction (`submitForApproval {tx}`).
- **Privacy:**
  - Reason and attachment link only for OWNER, MANAGER in branch, `hr.leave.read` in branch, the linked user and the filer.
  - The decide key gets the row without the reason. The payroll key alone gets `detailNo`/`balNo`.
  - Out of branch gets the H1.1 text, as the brief says.
  - `myLeaveBalances` resolves the employee through `employeeOfUser`.
  - No `attachmentKey` or path appears in any DTO.
  - Refusal texts are fixed Thai with identical bytes.
- **Event:**
  - Emitted inside the state-changing transaction on approve, reject, revoke, cancel of an approved leave, and owner-auto (with `previousStatus null`). Not emitted on cancel of a pending leave or on BALANCE-cancel.
  - Key `hr.leave.decided#id#status`. Payload is exactly the 8 keys.
  - One `withAutomation` no-op consumer and exactly one automation label, with no entry in the webhook labels file.
- **Holidays:**
  - Both JSON files hold exactly the 15 `FIXED_THAI_HOLIDAYS` with identical names. Lunar and substitution days appear only in `pending`. Nothing is computed.
  - The preset uses `createMany skipDuplicates`, which is ON CONFLICT DO NOTHING on the expression unique. It never overwrites a shop row.
  - Only all-branch settings users can apply it.
  - The settings page note states that movable holidays must be added by the shop.
- **Settings form:** `allowHours` is not read from the form, and the hourly field never appears in the UI.

## Not verified
- DB behaviour: races, live S9 checks, live digests.
- Typecheck.
- Visual parity of the moved seed chip.
- Whether `unitTargetOf` without a date (in `leaveBalances`) matches H1.1 borrowing semantics at the edge of a borrowing window.

## r2 re-check (12 Nov · head cb1ff1f10 · scope `7fdecbba7..cb1ff1f10 -- src scripts/seed-hr-qc.mts`)
### Verdict: **FIX FIRST** (one MAJOR, one MEDIUM, both small; everything else re-walked below holds)

### Re-walk of earlier MAJORs (by reading the code; numbers match the builder's S12 tables)
- **M1** (C: GRANT 10 + CARRY_IN 5, expiry 03-31): request 1–15 Oct (15 days) is refused (`late 15 > nonCarry 10`, `leave.ts:336`). 1–10 Oct is approved (USE −10), 2–6 Mar is approved (USE −5, note `carry:5.0`), EXPIRE is 0.0, Σ2031 = 0.0. The balance can no longer go negative.
- **M2a**: a 25–27 Mar leave still PENDING on 1 Apr makes the job wait (`:568`, `:620`). It is approved with USE −3 (`carry:3.0`), then EXPIRE −2, Σ = 10.0. **M2b**: revoke after EXPIRE 0.0 writes `use-revert` +5 and `expire-late` −5 in the same tx, once (`:437-441`, `n !== 1` guard), Σ = 10.0. **M2c**: a Y−1 PENDING leave makes the carry wait. It is approved with USE −3, then CARRY_OUT −3 / CARRY_IN +3, Σ2031 = 13.0.
- **M3**: the revert reads `leaveYear`/`policyId` from the USE row (`:434-437`). A ysm change is refused when rows exist or leaves are open (`settings.ts:509-512`). After a ysm flip, revoking a 2-day leave adds +2 to 2031, not 2030.
- **Hunter P1** (carry spent twice): CARRY_OUT −c lands in Y−1 in the same tx as CARRY_IN (`:615-616`). A back-dated Y−1 request sees Σ(Y−1) = 0 and is refused. **Hunter P2** (negative after expiry) is covered by M1 and M2b above.

### New findings
**R2-M1 MAJOR: USE rows written before CARRY_IN never consume carry, so the full carry still expires.**
- Cause: `leaveLedgerInTx` (`:418-419`) takes `fromCarry = min(days, st.carryLeft)`. Before the `carry:` row exists, `carryLeft` = 0 and `expiry` = null, so the USE gets no `carry:` note. EXPIRE (`:624`) later removes the whole carry.
- This is common. Leaves dated early January are approved in December, before the 1 Jan job runs. The L2 wait can also hold CARRY_IN for weeks, and the maxTx/rotation delay adds more.
- Example: Y = 2031, quota 10, cap 5, expiry 03-31.
  - On 20 Dec 2030, a 5–9 Jan 2031 leave (5 days) is approved: USE −5, no note.
  - 1 Jan job: CARRY_IN +5. Then 6–10 Oct (5 days) is approved: needs ≤ nonCarry 10−5 = 5, passes.
  - 1 Apr: EXPIRE −5, so **Σ2031 = 0.0**.
  - Correct: 10 + 5 − 5 (January paid from carry) − 5 (October) − 0 expired = **5.0**. The employee loses 5 days.
- The S12 tables miss this because every S12 scenario writes CARRY_IN first. The S12.6 property check only asserts Σ ≥ 0, never "Σ = expected".
- Smallest fix: derive consumption from facts instead of storing it in notes.
  - In `leaveYearStateInTx`, set `usedCarry = min(carryIn, Σ |USE| of non-reverted USE rows whose leave ends ≤ expiry)`, joining USE.leaveId to HrLeave.toDate.
  - `expire-late` becomes the recomputed delta. The `carry:` note on USE rows is then unnecessary.
  - This also removes every possible note drift (revert, recount, re-run).
  - Add an S12 vector: USE first, then the job.

**R2-M2 MEDIUM: a revert in Y−1 after CARRY_OUT leaves those days stuck in Y−1.**
- Cause: L2 waits only for PENDING Y−1 leaves. A revoke of an APPROVED Y−1 leave is still possible after the carry has run.
- Example: 2030 GRANT 6, cap 6. 22–26 Dec 2030 (5 days) is approved.
  - 1 Jan job: Σ2030 = 1, so CARRY_OUT −1 / CARRY_IN +1.
  - 10 Jan revoke: `use-revert` +5 into 2030, so Σ2030 = 5.0 and Σ2031 = 6 + 1 = 7.0.
  - Correct: carry 6, so Σ2031 = 12.0. The 5 days can only be spent on back-dated 2030 leave.
- Fix: in `leaveLedgerInTx`, when a revert lands in Y−1 and `carry:<emp>:<pol>:<Y>` exists, write a late transfer in the same tx. That is `carry-out-late:<leaveId>` −k (Y−1) and `carry-late:<leaveId>` +k (Y), with k = min(cap − carryIn(Y), revert days).
- Expiry for those days follows R2-M1's derived rule.

### Probes that held
- **Carry keys:** `carry-out:`/`carry:` are written once per (emp, policy, Y) under `hr-leave-emp`, re-checked inside the tx (`cur.carried`). `createMany skipDuplicates` on (systemId, sourceKey) means a retry or a parallel run adds nothing.
- **Expiry note:** strict regex `^expires:YYYY-MM-DD$`. It is compared as a string with the Bangkok `dayKey` (no `Date` parsing, so no timezone drift). A malformed or missing note means never expires; only code writes the note.
- **Note drift:** a revert removes the leave's carry part from `usedCarry` and adds the same part to `expired` after expiry, so `carryLeft` stays consistent. The D1 recount happens before the USE is written. A policy change cannot move a USE (year and policy are taken from the row). The only drift left is R2-M1.
- **L3 straddle:** a leave on 30 Mar–2 Apr is not carry-eligible and must fit `nonCarry`. This is conservative and matches the ruling ("ENDING on or before").
- **Recount at approval vs. reservation:** approval re-checks against Σ ledger, not the reservation. An upward recount (holiday deleted) can make a later sibling PENDING leave fail at its own approval: `balanceDecide` on the direct path, CANCELLED BALANCE on the chain path. No year can go negative.
- **Cron:** rotation by hour-of-epoch plus `maxTx 50`; employees in id order. A done, waiting or ineligible employee opens no tx (`grantKey` null), so the queue drains about 50 employees per hour per system and nobody starves permanently. MINOR: one employee whose tx keeps throwing aborts that system's whole run every hour (no per-employee catch), so everyone after them waits.
- **Policy switched mid-year** (branch move): the old unit policy leaves `forEmp`, so its carry/expire stop being processed. Those days are stuck, not spendable (`planLeaveRequest` requires the unit of the day). MINOR.
- **§C.6:** self-decision and chain guards come before the new approval check. The zero-day cancel only happens after them, writes no event (same as cancel of PENDING), and is audited after commit. Revoke stays APPROVED→REJECTED only, with `from`. Leave and approval request are still created in one tx.
- **Lock order:**
  - decide and apply: `hr-leave` → `hr-leave-emp` → roster (`service.ts:815-816`, `leave.ts:470-476`).
  - owner-auto: emp → roster (new, `service.ts:629-630`). cancel: leave → emp. job: emp only.
  - No cycle, and only the tx client is used.
- **D3:**
  - `attachLeaveFile` and `leaveAttachmentLink` return fixed texts without touching the DB.
  - `planLeaveRequest` refuses any `attachmentFileId` (`leave.ts:155`).
  - `leave.ts` has no `fileAsset`/`privateFileUrl`. `attachmentKey` is never written (removed from `fields`) and `hasAttachment` is constant false.
  - No reachable path to a file remains.
- **D5:** a published roster entry deletes the holiday for that day (`leave.ts:205`).
- **Seed:** the m7 shift keeps lvA within one calendar year; with ysm 1 that is the leave year.

### Not verified
DB runs (S12 green claimed by the builder; not re-run); the two commits after cb1ff1f10; hourly-leave interaction (still unreachable).

# H2.10 hunt — security / IDOR / money (wip/hr-h2.10 @ 5d6144eea + oracle commit)

Lane DB wo-hr-qc-l3 via `scripts/qc-hr.sh`. I ran two probes (`zz-hunt-h210-main`, `zz-hunt-h210-race`), and each one built its own tenants `qc-hr-zzh210-*`. The fixtures were: 2 branches, a second HR system, another tenant, and 15 employees (A, B, C on u2, D ENDED, M in system B, a null-unit entry, an inactive employee, L and H on approved full-day and half-day leave, Pd on pending leave, Up unpublished, W owner-linked, K holding the approver key, R, X in the other tenant). There were also payroll runs in PAID, APPROVED, REVERSED and DRAFT, and foreign objects belonging to B, C, X and D.

## Result: **0 cross-employee read or write** · **1 FAIL, MAJOR (money race)**

### PASS
- **P1 writer injection.** I called leave, OT and correction as A with the ids of B, C and X in 13 field names (`employeeId employee_id userId forEmployeeId targetId systemId tenantId linkedUserId requesterEmployeeId onBehalfOf employeeIds[] input.employeeId employee.id`), and added junk keys to the actor. All 9 rows were A's and in system A. I also tried clock with B's id, advance from R with B's ids, and swap with requesterEmployeeId=C. All of them wrote only the actor's own row. A digest of every row belonging to B, C, X, D, M and Pd was byte-identical before and after.
- **P2 foreign object ids.** I tried cancel leave, OT, correction, swap and advance, respond to a swap, and acknowledge a note, using the objects of B (same branch), C (other branch), X (other tenant) and D (ENDED). I also tried array and object ids, a SQL-like string, A's hidden note, a B→C swap (A is not a party) and the advance the owner filed for A. Every call returned the `notFound` bytes and nothing changed.
  - **Swaps.** I tried starting from B's or X's entry, from A's own unpublished entry and from A's own past entry. I tried swapping to C, M, X, D or A itself, and to B's entry from another day. All were notFound with no row.
  - **Corrections.** I tried CHANGE and VOID on the punches of B, X and D. All were refused with the service text and wrote 0 rows.
  - **Control.** A can still reject the B→A swap.
- **P3 readers.** I called all 11 readers as A with B / system-B / tenant-2 ids injected, and all returned ok. Scanning the output found no foreign employee ids, user ids, punch ids, phone, email, bank details, other people's pay, leave reasons (others' or A's own) or the hidden note. There were no forbidden keys outside swap targets.
  - **Colleagues** = B, Pd and W. W is the owner-employee on the same published shift, so this is correct. C, M, the null-unit entry, the inactive employee, D, L, H and Up were all absent.
  - **Payslips** = only A's APPROVED and PAID slips. A's REVERSED and DRAFT slips, B's slips and X's slips were absent.
  - **Other readers.** `myCorrectablePunches` ignored `employeeIds:[B]`, and so did owner W. `myWeek` clamps to +8 weeks. Passing another tenant's policyId to the preview returns `availableAfter: null`.
- **P4 rules go through the services.** Each case was refused with the same text the service returns directly: leave beyond balance, overlapping leave, another tenant's policy, OT ≥31 days ahead, OT >24 h late, OT on an approved leave day, a 6th pending correction, a correction >35 days old, a future correction, staff cancelling an approved leave, clock without GPS, and clock out of radius (no coordinates echoed back). A second clock in the same minute matches the service.
- **P5 advance.** 50,000 baht was accepted as 5,000,000 satang, PENDING, with requestedById = self. These amounts were all refused with `advAmount` and no row: 0, -1, 1.5, 50,001, `'500'`, NaN, Infinity, null, 1e9, an object, 2^53, and an `amountSatang` key. A second request gets `advOpen`.
  - **No self-approval:** non-owner self-approval and approval by a key holder of their own advance are both refused by `decideAdjustment`.
  - **Cancelling:** cancel after approval returns notFound and the row stays APPROVED. Cancelling someone else's advance, or one the owner filed, returns notFound.
  - **ENDED** employees get `inactive`.
  - **Plain race:** 10 parallel requests left exactly 1 row with 9 `advOpen`.
- **P6 actors.**
  - **D (ENDED):** all 13 writers return `inactive`, the readers return D's own history, and the colleague list is empty.
  - **Every export returned `noEmployee`** with no throw and no write, for these actors: unlinked U (even with junk `employeeId=A`), X with A's tenantId, A in tenant 2, a null actor, and an empty tenantId.
  - **W (owner-employee):** sees no punches or requests of others and cannot cancel B's leave or VOID B's punch.
  - **X with A's object ids:** notFound.
- **Static checks.**
  - The only `'use client'` file is `self-ui.tsx`. It imports react, next, next-intl, `@/lib/ui/*` and self-actions, plus **type-only** imports from `./self` and `./leave`, so no prisma code reaches the client.
  - The pages under `src/app/app/me/hr` import only `hr/self` and `hr/self-ui`, and there is no DB import.
  - `self-actions.ts` builds the actor from `requireMembership` and the session, and picks form fields one by one.

### FAIL R3 — MAJOR (money: one-open-advance guard has a window; self-only, not cross-employee)
- **Wanted (brief R6):** one transaction that takes the lock `hr:advance:<emp>`, then checks for an open advance, then creates the row.
- **Got:** `selfRequestAdvance` creates the row first through `payroll.requestAdjustment` (outside the lock), and only then locks and deletes it if another one is open. Concurrent PENDING duplicates are therefore committed and visible.
  - In the plain race, up to **7** PENDING rows of the same employee existed at the same moment.
  - An approver who approves what is on the list during that window makes the duplicates permanent.
- **Repro:** staff Pd fires `selfRequestAdvance(actorPd, {amountBaht: 300+i})` 10 times at once (`Promise.all`). At the same time an owner loops `decideAdjustment(ctx, id, "APPROVED", {isOwner: true})` over Pd's PENDING rows. Over 6 rounds I saw:
  - **r0:** 2 APPROVED, with both requests reported ok.
  - **r1:** 2 APPROVED, 1 of them a "ghost": its request returned `advOpen` to the employee, but the row was approved.
  - **r5:** **3 APPROVED**, 2 of them ghosts.
- **Effect:** several advances of up to ฿50,000 each get approved for one person, against the one-open rule. The employee was told some of them were refused. A non-owner approver hits the same window because the no-self rule does not apply to them.
- **Fix direction:** do the check and the create inside the same transaction while holding `hr:advance:<emp>`. Alternatively, have `decideAdjustment` take the same lock for ADVANCE rows and re-check that no other PENDING advance exists. The first is what R6 specifies.

### Notes (not FAIL)
- Swap targets list active same-branch peers who are unlinked (Up) or on approved leave that day (L, H). This is allowed by R4 and is UX only.
- An owner-employee can approve their own advance on the payroll page (`isOwner` exemption, pre-existing and unchanged by the brief).

### Not tested
- The `"use server"` actions end to end: `requireTenant` and `requireMembership` need request cookies. I covered them statically instead: the actor comes from the session, fields are picked one by one, and there is no id field.
- Page rendering, `revalidatePath` and the nav filter UI (no server per instructions).
- Clock rate limiting after wrong attempts (no such path in `mobileClock`), and the photo policy.

### Hygiene
Residue was none after both probes (tenants and users swept, `RESIDUE none`). Both `scripts/zz-hunt-h210-*.mts` files are deleted. The seeded tenant was not touched, so no reseed was needed. No product code, oracle or seed files were edited.

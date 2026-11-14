# HR PRIV-3 — oracle notes (tests first)

Brief `ledger/hr-briefs/hr-brief-PRIV-3.md` (+ CONTROLLER RULINGS Q1–Q6). Branch `wip/hr-priv-3`, base `ea2b41ea1` (= merge-base with local `session/hr`). Lane 5 tree, QC DB shared with lane 2 (own tenants `qc-hr-priv3-*`, residue none).

Files: `scripts/qc-hr-priv-3.mts` (registry · fixture · checks) + `scripts/qc-hr-priv-3-lib.mts` (render without a server · diff statics · goldens). 54.6 KB together. `--list` prints the registry.

Run (lane 5 only):
`bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/qc-hr-priv-3.mts`
About 40 s. `QC_PRIV3_MEASURE=1` prints the measured goldens.

## Result on base (forced)
`BASE-EXPECTATION 26/26 as registered (RED-by-design 10 · GREEN controls 16)` · passed 16/26 · `RESIDUE none`. Repeated 4 times. The goldens matched across 2 measuring runs.
Targeted tsc on the two files: exit 0, 0 errors.

## Fixture
- Tenant T has branches U1 and U2 and one HR system. Tenant T2 is another tenant with one employee (that name must never appear).
- Employees:
  - e1 U1, linked to S
  - e2 U1, with a doc, a pending leave and an approved OT
  - e3 U2, with a pending OT
  - e4 U2, borrowed into U1 since D−3
  - e5 U1, removed
  - e6 no branch
  - e7 U1, linked to S0
- Viewers (shapes of seed-hr-qc / seed-hr-walk):
  - O: OWNER
  - M: MANAGER `*`
  - MB: MANAGER [U1]
  - P: STAFF `*` PAYROLL_KEYS
  - PB: STAFF [U1] PAYROLL_KEYS
  - S: STAFF `*` `hr.leave.request`, linked
  - K: STAFF `*` `hr.attendance.clock`
  - N: STAFF `[]` (no keys)
- Extra viewers for the rulings:
  - S0: linked, no keys (Q6)
  - SR: unlinked, `hr.leave.request` (R3 "no form")
  - SD: staff with `hr.leave.read/decide/request` (G3)
  - an API-key viewer, for G1 only

## How the checks work
- Pages are rendered as the viewer, without a server. `next-intl/server` is swapped for an in-memory translator over the real message files. The real page modules run under a Next request scope, using the viewer's session cookie (approach copied from `wip/hr-vis-5a`/`-5bc`). Client components are kept as elements, so their props are inspected.
- **Refusal identity (P1–P3):** the real-system render must throw the same digest as the unknown-system render, with the same error. The number of SQL queries must also be equal, which proves no loader ran before the refusal. The test does a warm-up render first, so session touches do not skew the count. The refused render must also produce no HTML and no client props.
- **Entitled controls (P5–P7, L2, N3, P8, N1 rest):** goldens measured on base and stored in `GOLD` in the lib.
  - Page cells are `<fixture keys seen in html+props>|sha16(canonical testids)|n`.
  - Leave cells exclude the filing form, because R3 changes it on purpose.
  - Hub cells are the hrefs plus the first "n คน".
  - The nav golden is the sha of the non-gated items.
  - The import-cycle members of privacy.ts on base are also stored (judge, payroll, roster-board, work-entries).
- **Actions (A1/A2):** K, N and S call each action twice inside a request scope: once with real ids and once with unknown ids. The test compares a row snapshot (employees, leaves, OT, schedules, docs, audit, outbox) before and after, and requires the same outcome both times.
  - For S, filing leave or OT "for e2" files for S itself (actions.ts:420-422). It is judged only on e2's rows.
  - A3: the owner's create action writes, which proves the harness reaches the action.

## Base matrix measured (who sees what today)
| page | renders with data | notes |
|---|---|---|
| `/hr/employees` | all 11 viewers | S/S0/SR/K/N see the whole register (7 names incl. removed). MB/PB see U1 + borrowed. |
| `/hr/leave` | all 11 | K/N/S0 see 6 names. The picker lists 6 for O/M/P/S/SR/SD and 4 for MB/PB. |
| `/hr/payroll` | all 11 | S/S0/SR/SD/K/N get the note page with 0 names. |
| hub HrHub | all 11 | K/N/S/S0/SR get "พนักงาน 6 คน" and links to all 3 pages. SD gets a payroll link. |
| nav | – | S/S0/SR/N get employees/leave/payroll; K gets the same plus kiosk. |
| profile `/employees/[id]` | entitled only | K/N get a 404 equal to an unknown employee. S own redirects to `/app/me/hr/profile`. S other gets a 404. |
| other HR pages | as in `GOLD.control` | unchanged gates (roster/kiosk/settings/law/requests/reports/attendance) |
| actions | **all refuse** | K/N/S: register actions throw `ForbiddenError: ไม่มีสิทธิ์: hr.employee.create`, leave filing as K/N throws `…hr.leave.request`, decide/bulk/OT refuse. Nothing is written, and the outcome is the same for real and unknown ids. **No action is RED on base.** |
| routes | refuse | reports/export, bank-file, filing, salary-cert and tax-cert: K/N/S get the same bytes as for an unknown system. The owner's export returns 200. |

## Older statics expected to trip (builder applies controller-authorised edits / PRIV3 allowlist)
- `fitness-hr` F16.3 `PAGE_GUARD_BASELINE`: the 3 rows must go (authorised).
- `qc-hr-h2.10` S7.1: leave/employees/payroll tabs are hard-coded `true` (authorised).
- `walk-hr-matrix.json`: S on 02/11a, and K/N/S refusal cells (authorised).
- `qc-hr-priv-2`:
  - S4: the OLD-oracle list is built from `readdir`, so once committed the new `qc-hr-priv-3*.mts` show as changed with no `ORACLE-EDIT … PRIV-2` marker. This already trips with this oracle commit alone.
  - S5: privacy.ts and actions.ts are in MARKED, so PRIV-3 hunks without "HR PRIV-2" count as unmarked.
- Frozen lists that include privacy.ts / actions.ts / nav.ts (their bases are `baseRef` = merge-base with origin/session/hr; whether they trip depends on that base):
  - `qc-hr-h2.11` FROZEN (actions.ts, privacy.ts)
  - `qc-hr-h2.5` FROZEN (privacy.ts)
  - `qc-hr-h3.1` FROZEN (privacy.ts)
  - `qc-hr-h4.6` S14.1 (privacy.ts unchanged)
  - `qc-hr-h3.9` S1.8 (nav.ts unchanged)
- `qc-hr-h0.7` around :273: statics over `requestLeaveAction` text (brief "unverified").
- `visual-hr.mts:60`: staff shot on the register (H1.1 R8).
- In other branches: VIS-5c S8 and VIS-5b `hrNavFilter` sha (re-taken after PRIV-3, per the merge order).

## Doubts
1. SD (staff with `hr.leave.decide`, no pay key): R1's payroll formula makes `/hr/payroll` a 404 and drops SD's hub payroll link. The access table has no such viewer. The oracle asserts 404 (P3) and no link (N2).
2. R3 "unlinked without on-behalf gets no form": P/PB lose the leave filing form entirely, including the `hr-leave-policy` select. Inventory rows for that testid may need payroll in hiddenFor.
3. Import cycles: privacy.ts is already in a cycle on base (judge/payroll/roster-board/work-entries). R1 adds imports of work-entries/stock-charge(/settings). S5 fails only if a new module joins the cycle (e.g. stock-charge). "The builder proves no cycle" cannot hold literally on base.
4. "Every HR page calls the helper": the brief's R2 limits the call to the 3 pages, and the kiosk page stays on `canRunKiosk` (Q4). S2 checks the 3 pages; P8 pins the outcomes of the other pages.
5. Side observation, out of scope: for an invalid `period`, reports/export answers 400 on a real system but 404 on an unknown one, even for K/N. This is an existence signal about a system id within one's own tenant. Minor.
6. Actions refuse with a 403-style message that names the key, not not-found bytes. This matches today's behaviour (GREEN), and the outcome is the same for real and unknown ids.

---
## r2 extension (CONTROLLER RULINGS r2 · registry re-based to 44a75f37a)
Files:
- `scripts/qc-hr-priv-3.mts` + `-lib.mts`: 56.6 KB, page matrix + R9.
- **new `scripts/qc-hr-priv-3b.mts`**: 21.5 KB, R6/R7/R8; the separate file keeps the main pair under 64 KB.

The 3b suite uses its own tenants `qc-hr-priv3b-*`: our shop plus a foreign shop with an OWNER and a STAFF holding the payroll keys. Kiosk rate buckets (`ChatRateBucket` keys containing either tenant id) are removed. Targeted tsc on all 3 files: 0 errors.

### qc-hr-priv-3 at 44a75f37a
- `27/27 as registered`, all GREEN; passed 27/27; residue none.
- The former RED rows (S1–S3, G1, P1–P3, L1, N1, N2) pass on the PRIV-3 build and are re-registered GREEN.
- R9 viewers added:
  - PR (only `hr.payadjust.request`): register ✗ (P1), leave ✓, payroll ✓ (P7 golden).
  - PA (only `hr.payadjust.approve`): register ✗ and payroll ✗ (P1/P3), leave ✓ and sees the OT list e2/e3.
  - Both have no leave form (L1) and no hub headcount (N2 now = "no register ⇒ no count").
  - G1 now holds 13 viewers + API key and pins the table that `qc-hr-h2.10` S7.1 follows.
- New P10 (GREEN control, debt): XS = linked staff of another HR system of the same shop, on this system's `/hr/leave`. Today it renders (`ok`) with no employee of this system and no filing form.
- The goldens for the new cells were measured on 44a75f37a; 2 runs were identical.

### qc-hr-priv-3b at 44a75f37a
- `10/10 as registered` (RED 5 · GREEN 5); passed 5/10; residue none in both tenants.
- **RED:**
  - **X1:** `setSalaryProfileAction` as XO and XP writes `T2:HrSalaryProfile`. It throws a Prisma unique error for our employee who has a profile, which is the existence oracle.
  - **X2:** `markPaidAction`, `reverseRunAction` and `reverseRunV2Action` write `T2:AuditLog`.
  - **X3:** **`createPayrollRunAction` (new, not in the hunt) writes `T2:HrPayrollRun` + `T2:HrPayrollItem` for our system id, and for an unknown system id answers `{ok:true}`.** The other 48 actions of the 8 payroll action files give the same outcome as an unknown system and write nothing.
  - **X4:** squat proven. After the foreign attempts our owner cannot create eA's profile (unique error), and 2 rows sit on our system outside our tenant.
  - **Y1:** the form paths (`cancelLeaveAction` "ยกเลิกได้เฉพาะใบลาที่คุณยื่นเอง" vs "ไม่พบใบลา…", `cancelOtAction`, `respondSwapAction`, `cancelSwapAction`) differ between real and unknown ids for K, N and unrelated staff U. The self paths already match.
- **GREEN:**
  - X5: the same-tenant owner and payroll set a profile, the owner marks paid, and reverse reaches our run with code ≠ NOT_FOUND.
  - Y2: the filer cancels own leave.
  - K1: kiosk off-list ids and a wrong PIN give exactly "PIN ไม่ถูกต้อง".
  - K2: an on-list no-PIN employee is named in the reply, and the kiosk page lists that name.
  - Z1: residue.
- Cases per payroll action:
  - our system × {unknown employee, eA without profile, eB with profile, our APPROVED run + our adjustment, our PAID run};
  - compared with an unknown system id;
  - a full tenant-table md5 digest of both tenants before and after.
- The hunt also saw `mobileClockAction` (XO, unlinked) write `T2:AuditLog`. That is the caller's own refusal audit, not tied to a foreign id, so it is not in R6 and is reported only.

### Older statics this round may trip
- `qc-hr-priv-2` S4: the new committed `qc-hr-priv-3b.mts` behaves like the other new oracle files, and needs the same allowlist line the builder added.
- The R6 fix touches `payroll-actions.ts` and maybe `payroll.ts`, so the PRIV-3 allowed-files list in `qc-hr-priv-3` S4 (`SRC_OK`) needs those files via an ORACLE-EDIT once the controller rules on the R6 file list. Today S4 would flag them as outside.
- Frozen lists that include payroll files:
  - `qc-hr-priv-2` FROZEN regex (payroll-*-rules only; `payroll-actions.ts` is in its MARKED list, and hunks without `HR PRIV-2` count as unmarked ⇒ trips);
  - `qc-hr-h3.4`, `qc-hr-h3.7`/`h3.5` statics over `payroll-actions.ts` bodies;
  - `qc-hr-h0.6` (reverse audit path, `QC_H06_BASE`).
- For R7: `qc-hr-h0.7`, `qc-hr-h2.9`, `qc-hr-h2.3`/swap oracles that pin the exact refusal texts.

### r2b (controller follow-up)
- **S4 (qc-hr-priv-3):** the allowed files now include the R6 and R7 files listed in the brief.
  - R6: the 8 payroll action files plus `payroll.ts`.
  - R7: `service.ts`, `ot.ts`, `swap.ts`, `ot-actions.ts`, `swap-actions.ts`, `self-actions.ts`, and the `cancelLeaveAction` range of `actions.ts`.
  - Hunks must still be marked `HR PRIV-3`. The `payroll-rules.ts` sha stays pinned.
  - Result: 27/27 as registered.
- **X3** also asserts that `createPayrollRunAction` refuses an unknown system and writes nothing.
  - On a fresh unknown system it refuses today with "ยังไม่มีโปรไฟล์เงินเดือน…".
  - The `{ok:true}` happens only once a foreign salary-profile row exists on that system id (the R6 setSalary hole). The X3 loop shows exactly that: unkSystem gives `{ok:true}` and writes `HrPayrollRun`/`HrPayrollItem` in the foreign tenant.
- **X6 (new, RED):** a foreign-tenant row seeded on (our system, our employee) and on (our system, a period) blocks our owner. `setSalaryProfileAction` throws a Prisma unique error, and so does `createPayrollRunAction` (`tx.hrPayrollRun.create`).
  - The unique indexes are cross-tenant: `HrSalaryProfile @@unique([systemId, employeeId])` (prisma/schema/payroll.prisma:93) and `CREATE UNIQUE INDEX "HrPayrollRun_systemId_periodKey_live_key" ON "HrPayrollRun"("systemId", "periodKey") WHERE "status" <> 'REVERSED'` (migration 20261202000000_hr_payroll_run_live_unique; schema keeps only `@@index([systemId, periodKey])`).
  - X6 needs a migration or data-cleanup decision from the controller.
- 3b at 44a75f37a: 11/11 as registered (RED 6: X1 X2 X3 X4 X6 Y1 · GREEN 5), passed 5/11, residue none in both tenants. tsc 0 errors.

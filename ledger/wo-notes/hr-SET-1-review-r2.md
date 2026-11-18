# HR-SET-1 — delta review r2 (fix + merge round, read-only)

Tree /root/projects/shark-hr-b · wip/hr-set-1 @ 52108330f · prev reviewed 7c4cbd63d · merge 67c8aac12 (session/hr aa380f6b0) · reviewer 13 Nov.
Read: hr-SET-1-review.md, hr-SET-1.md "Fix + merge round", `git diff 67c8aac12 52108330f`, `git show 67c8aac12` (cc hunks), settings-lock.ts, payroll.ts h37 block, hr-SET-1-green.txt. Nothing was run.

## Verdict: MERGE WITH NOTES
F1, m2, m3, m4 and F2 are closed. N4 was my false positive. The merge drops nothing. The findings below are notes only (no defect).

## 1. F1 — h37WritePaySetting (payroll.ts:3512-3520): closed
- It now calls `lockHrSettings(tx, ctx)` and then `writeHrSettingsKeys(tx, ctx, { hrPayroll: {...sys.settings.hrPayroll, payFinanceAccountId} })`. Lock order is the same as every other writer: hr:clockpolicy → row FOR UPDATE → re-read.
- The patch base comes from the read under the lock. The writer re-reads under the row lock again, so only `hrPayroll` is replaced. Other hrPayroll sub-keys come from the locked read: the row lock is held from lockHrSettings until commit, so they cannot go stale.
- Transaction context: it is its own top-level `tenantDb().$transaction`, and the helper is its first statement. Callers are setPayrollBook:3531 and setPayrollPayAccount:3545. Both are plain async server functions, called only from payroll-actions.ts:593/:604, and neither runs inside another tx. No nested tx.
- No ordering inversion. Grepped whole src after the merge:
  - No H3.7 flow takes hr:clockpolicy or the HR AppSystem row. Only settings-lock.ts does (the other hits are comments).
  - The period lock (P), the per-claim `hr:giveback:` lock and the HrPayrollRun / claim FOR UPDATE locks never sit in the same tx as a settings lock.
  - `HrPayrollRun.accountSystemId` (migration 20261206…) has no FK, so there is no KEY SHARE on the AppSystem row either. No cycle is possible.
- Pre-existing H3.7 behaviour, not SET-1 scope: setPayrollBook clears the pay account in a second tx after `linkPayrollBook` commits, so the two are not atomic. NOTE only.

## 2. m2 — runtime guard in writeHrSettingsKeys (settings-lock.ts:25-33): correct
- Key mapping:
  - `pg_advisory_xact_lock(bigint)` shows in pg_locks as locktype 'advisory', classid = high 32 bits, objid = low 32 bits, objsubid = 1 (the two-int4 form is objsubid = 2), mode ExclusiveLock.
  - `(k >> 32) & 4294967295` sign-extends and then masks; `oid::text::bigint` is the unsigned value. Negative hashes therefore map correctly.
  - The key string is identical to the one lockHrSettings uses.
- Scope:
  - `pid = pg_backend_pid() AND granted`: only this backend's granted lock counts. Another backend holding the lock cannot satisfy it, so there is no false negative from other sessions.
  - The xact lock is gone at commit/rollback, so a leftover from an earlier tx on a pooled connection cannot pass. Nobody takes this key at session level.
- Pooling: Prisma interactive tx with PgBouncer/Neon in transaction mode pins one server backend for the whole tx, so pg_backend_pid() is the backend that holds the lock. No false positive. (Statement-mode pooling cannot run interactive tx at all.)
- Savepoints: Prisma's tx client has no nested $transaction. A lock taken in a subxact that was rolled back really is released, so throwing there is correct.
- Cost:
  - One pg_locks read per settings save. It is not in a per-employee loop: judge saveCursor runs once per job run (judge.ts:679/:681); the rest are owner/admin saves.
  - pg_lock_status briefly takes all lock-partition LWLocks, which is fine at this frequency.
- NOTE n1: the guard proves hr:clockpolicy is held, not that it was taken *before* the row lock or that the caller's own key (otpolicy/lifepolicy/attpay) is held. Those parts stay covered statically (S1.3 own-key, S1.4 "no AppSystem FOR UPDATE outside helper"). Necessary but not sufficient; acceptable.

## 3. N4 — confirmed false positive
work-entries.ts:73 `const lock` is used at :353 (`lock(tx, periodLockKey(...))`), and was already used there at 7c4cbd63d. Withdrawn.

## 4. Oracle
- S1.3: FNS + `[payroll, h37WritePaySetting]`, count now `${FNS.length}` (10). Legit.
- S1.5 payroll removed-line allowlist: the two additions are the exact literal stale h37 lines (`const base = h37Obj(sys.settings);` and the `base[PAYROLL_SETTINGS_KEY] = {…[H37_PAY_KEY]: value}` line).
  They are anchored and specific, and any other removed payroll line still fails. Legit.
- S2.10:
  - Reuses the deterministic lostUpdate A/B harness with planted `hrPayroll {engineVersion 1, catCapBp 700+k, payFinanceAccountId}`.
  - The key check requires the cleared id plus both sibling sub-keys plus the marker.
  - RED logged on the old pattern: B `marker=false`. A passes on old code because it already took clockpolicy, which is expected; B carries the RED.
  - Exercises the real entry point (setPayrollPayAccount null, owner). Legit.
- S4.4:
  - Misuse case: writeHrSettingsKeys without lockHrSettings must throw a /lockHrSettings/ error, and settings must be unchanged.
  - Positive control: lock then write in the same tx gives count 1, with `hrQcSet1 = 2` and `keep = 4` preserved.
  - RED logged (`misuse=no throw`). Has both a negative and a positive control. Legit.
- h3.6 S1.6 (cc hunk): the union regex `ORACLE-EDIT…H\d+.\d+ | HR H\d+.\d+ | HR-SET-\d+`. It is `laterMarked`, so it is IN_BASE only and checks `h.added` only. Unmarked hunks still fail. Never n/a.
  - NOTE n2: it does not exclude its own ticket ("HR H3.6" would pass after base). That comes from the controller/H3.7 rule, which this round kept, not from SET-1.
- h3.9 S1.5:
  - `laterMark` accepts HR-SET-<n>, or an `HR H<x>` / `ORACLE-EDIT…H<x>` mark with x ≠ 3.9, so own-ticket marks are excluded (m3 closed).
  - "ORACLE-EDIT (H3.7 builder, merge of H3.9)" still counts via H3.7, as intended.
  - IN_BASE only and added lines only. Non-ts frozen files (json) cannot carry a mark, so they still fail if changed. Never n/a.
- h3.9 S1.10:
  - The builder's stricter version is kept (F2). The b357957e7 "IN_BASE ⇒ n/a" edit is gone.
  - `anyMarked` uses `h.added` only (m4 closed). Before base, the original markedOk rule is unchanged.
  - NOTE n3: in base, `anyMarked` does not exclude the own ticket ("HR H3.9"), and it checks only `files`, not hub/empPage. Both are cosmetic; json is exempt because it cannot carry marks.
- No check became permanently n/a. Green: SET-1 full, h3.1–h3.9 (incl. h3.7 68/68) logged as passing in hr-SET-1-green.txt (not re-run by me).

## 5. Merge 67c8aac12: nothing dropped
- Per-file patch-id comparison over src/, prisma/, messages/, scripts/, ledger/, docs/ against merge-base 13c9eae57:
  - `diff(MB, 7c4cbd63d)` == `diff(aa380f6b0, 67c8aac12)` for every file (all SET-1 changes are present).
  - `diff(MB, aa380f6b0)` == `diff(7c4cbd63d, 67c8aac12)` for every file (all H3.7 + H3.9 changes are present).
  - The only exceptions are scripts/qc-hr-h3.6.mts and scripts/qc-hr-h3.9.mts, and `git show --cc` shows their only combined hunks are the three conflict resolutions reviewed above.
- src/ and prisma/ are byte-for-byte the union of both sides. JSON was taken from theirs with no conflict.

## Findings
- n1 NOTE settings-lock.ts:25: the runtime guard checks only that clockpolicy is held, not lock order or the own key. Static S1.3/S1.4 still carry those.
- n2 NOTE qc-hr-h3.6.mts:240: the later-ticket regex accepts the own ticket "HR H3.6" (inherited controller rule).
- n3 NOTE qc-hr-h3.9.mts S1.10 `anyMarked`: no own-ticket exclusion, and hub/empPage are not mark-checked in base.
- n4 NOTE payroll.ts:3531 (H3.7, pre-existing): the book link and the pay-account clear run in two transactions. A crash between them leaves a stale pay-account id as the default (not verified whether mark-paid re-validates it against the new book). Outside SET-1 scope.
- Carry-overs N1–N3 from r1 are unchanged (debts).

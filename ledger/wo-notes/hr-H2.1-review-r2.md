# HR H2.1 r2 — independent review (read-only)

Scope: `git diff 7dd696697..fe1053198 -- src` (only `src/lib/modules/hr/roster.ts`). Reviewer did not run DB, suites, typecheck or build.
Context read: `hr-H2.1.md` §r2, round-1 R-1..R-3 / hunt F1..F4 as summarised in §r2, oracle grep S3.1/S9.1–S9.4.

## Verdict: FIX FIRST

One MAJOR (F4 heuristic misfires in the normal flow: published source weeks) and one MEDIUM (R-1 recheck still lets a
row moved *inside* the view be published under a stale lock/payload). Both have one-to-few-line fixes. R-2 and R-3 hold.

## Findings

### MAJOR-1 — copyTimesOf treats stale snapshots as overrides once the source row is published or moved (F4)
- `roster.ts:587-590` (+ select at `:609`). Rule: `differs && row.updatedAt >= shift.updatedAt` ⇒ copy source times verbatim.
- `HrRosterEntry.updatedAt` is `@updatedAt` (prisma/schema/hr.prisma). It is bumped by **publishRoster's**
  `updateMany({ published:true })` (`:872`) and by **moveEntry** with an unchanged shift (`:535`, keeps row times) —
  neither changes the row's times. (Prisma sets `@updatedAt` on `updateMany`; not verified at runtime.)
- Scenario (the normal weekly flow): week W rows created with shift Sr 18:00; owner edits Sr → 19:00 (shift.updatedAt=T2);
  owner publishes week W at T3 > T2 (all W rows' updatedAt=T3); copyWeek W → W+1 ⇒ `differs` and `T3 ≥ T2` ⇒ 18:00 copied
  verbatim. That is exactly the case S3.1/Q6 forbids; S3.1 is green only because its e3 row is not published/moved after
  the shift edit. Source weeks are almost always published, so the heuristic is wrong in the common path, not an edge.
  The §r2 note only discloses the false negative (override + later shift edit ⇒ shift times), not this false positive.
- Smallest fix: compare `row.createdAt` instead of `updatedAt` (select `createdAt: true` at `:609`, rename param).
  A row's times are set only at create (add / copy, possibly override) or by a shift-changing move (which copies the
  then-current shift times, so `differs` is false until the shift is edited again, and then createdAt < edit ⇒ shift
  times — correct). Publish and same-shift moves no longer flip the outcome. S9.4 (override added after shift exists)
  still passes. Add an oracle sub-case: S3.1 variant with the source row published after the shift edit. D-F4 stands.

### MEDIUM-1 — publish recheck does not pin (employeeId, date); a row moved within range+scope is published under the wrong lock and payload (R-1 residual)
- `roster.ts:866-882`. Locks are taken on the pre-lock keys `cand (employeeId,date)`; `recheck` (`:869`) filters id +
  unpublished + range + scope but not the row's key.
- Scenario: publish reads cand B=(E1, Mon, u1). Before publish's lock, moveEntry moves B to (E2, Wed, u1) (same view) and
  commits (published=false). Publish locks (E1,Mon) — not (E2,Wed) — recheck passes, B is published, and the
  `hr.roster.published` payload `employeeIds` (`:860`, from pre-lock cand) lists E1 and omits E2 (unless E2 had other
  candidates). Any automation keyed on `employeeIds` (consumer = `withAutomation`, `src/lib/outbox-consumers.ts:1211`)
  notifies the wrong employee; the lock invariant "write only rows whose (emp,day) you hold" is broken. Concurrent
  writers are still serialised by row locks + READ COMMITTED re-evaluation, so no corrupt write — only stale payload/
  lock contract.
- Smallest fix: under the lock, `findMany({ where: recheck, select:{id,employeeId,date} })` instead of `count`, and throw
  `ROSTER_TEXT.publishRace` unless every row's `employeeId`/`dayOf(date)` equals its cand entry (and length matches).
  Keep the guarded `updateMany`. Optional oracle: S9.1 variant moving B to another employee in u1.

### MINOR-1 — R-3 side gap is wider than disclosed (`:886`, `:854`, `:789-801`)
- Clearing compares removal-audit `createdAt` with publish-audit `createdAt`, and the publish audit is written after the
  tx commits (`writeAudit`, own `prisma` connection, errors swallowed — `src/lib/core/audit.ts:26`). Any removal of an
  already-published row in the window **cand read → audit write** (not only "commit → audit") is cleared though the
  event never announced it. If `writeAudit` fails, the publish never clears anything (counter stuck high). Fix later:
  record `at` (already computed) in the publish audit `after` and compare removals against it; or write the publish
  audit inside the tx. Accept as residual for H2.1 if the controller agrees.

### MINOR-2 — `take: 500` on publish audits (`:789`)
- If no publish among the newest 500 covers the whole view, `floor` is undefined ⇒ all removals since the beginning are
  scanned, and those whose covering publish is older than the 500 window count forever. Unlikely per system; note only.

### MINOR-3 — zero-candidate marker decided outside any lock (`:852-855`)
- A removal landing between the count and the marker write is silently cleared (same family as MINOR-1). Acceptable.

## Verified (held)
- R-2: `cur` re-read via `tx` under `lockKeys` (sorted, one statement) compares employeeId/day/shiftId/start/end/break/
  crossesMidnight/unitId — every field the move writes except `published`/`source`; refusal = existing
  `ROSTER_TEXT.entryChanged`. Not comparing `published` causes no wrong row state (move sets published=false; R7). Only
  residual: audit `wasPublished` from pre-lock read (audit-only, disclosed). Accepted per ruling.
- R-1 (out of range / out of branch): recheck uses the same `date` range and `entryScopeWhere(scope, unitId)` as cand,
  for both `count` and guarded `updateMany`; mismatch ⇒ `publishRace`, tx rolls back, outbox emitted only after both
  checks inside the same tx ⇒ moved-out row is neither published nor in the payload.
- All statements in the publish and move tx bodies use `tx`; no second connection under the advisory lock (the
  `removedSinceLastPublish` read and audits run outside the tx).
- Scope: `hrScopeOf` maps `unitAccess []`/`*`/OWNER to all branches; `scopeUnitsOf` stores null for all, list otherwise;
  `unitArg` refuses an out-of-scope unit with fixed `SETTINGS_TEXT.otherUnit` (no unit id in text). Unit ids in audit
  `after` are ids only (house rule id/count only).
- R-3 logic: per-row clearing needs a later publish covering its day AND unit (`"*"` only clears unassigned rows);
  floor only from a publish covering the whole view; pre-r2 audits read as all-branches (safe direction). Zero-candidate
  path writes nothing when nothing is pending; no event emitted on the marker path (§F.9 holds).
- No new outbox event type; `hr.roster.published` already has a consumer. Refusal texts are existing constants only.
- copyWeek: `times` computed outside tx from the pre-read rows, as before; insert still inside per-employee tx.

## Not verified
- Typecheck (not run by implementer either), suites, Prisma `@updatedAt` behaviour on `updateMany` at runtime, the
  round-1 review/hunt files themselves beyond the §r2 summary.

## r3 re-check (6780578f8 · `git diff fe1053198..6780578f8 -- src` + grep S9.5/S9.6) — verdict: MERGE

**MAJOR-1 (F4) — fixed.** `copyTimesOf` now takes `createdAt` (`roster.ts:590/593`), source select adds `createdAt`
(`:612`; not in ENTRY_SELECT, so no clash; `EntryRow` typing unaffected because `cands.row` only needs ENTRY_SELECT
fields + the structural `createdAt` param). Publish (`updateMany` published) and same-shift moves no longer change
the outcome. Override rows created after the shift exists still copy as-is (S9.4 path unchanged). Disclosed limitation
(override applied to an older row after a shift edit is not carried) = D-F4, as ruled.

**MEDIUM-1 (R-1 leftover) — fixed.** Under the advisory lock, `tx.hrRosterEntry.findMany({ where: recheck,
select:{id,employeeId,date} })` replaces `count`. It refuses with existing `ROSTER_TEXT.publishRace` when the length differs or any row's
`employeeId|day` ≠ its pre-lock cand key (`keyOf` built in memory from `cand`). All statements inside the tx still use `tx`
(lockKeys → findMany → updateMany → emitOutbox → outboxEvent.findFirst); no second connection under the lock. Between
the findMany and the guarded `updateMany`, any app writer that could move the row must take the row's old (emp,day) lock,
which publish now holds, so the keys checked are the keys locked. Payload `employeeIds` therefore matches the published rows.

**Oracle (grep only, not run):**
- S9.5 (`qc-hr-h2.1.mts:1773-1799`) uses its own shift (420–900) and two rows created via Prisma before the shift edit
  (endMin → 960, 1.1 s sleeps either side; createdAt/updatedAt all Prisma app-clock, consistent). Case 1 publishes the
  week after the edit; case 2 makes a date-only `moveEntry` on the same shift after the edit (prep asserts times stay 900 and
  shift unchanged). Both copyWeek targets must get the current 420–960. On r2 code, both rows have updatedAt > shift.updatedAt
  and differ ⇒ verbatim 900 ⇒ RED. Matches MAJOR-1 exactly.
- S9.6 (`:1801-1813`) has 2 u1 candidates. A holder tx holding lock (e6,10-09) moves b to (e1,10-11) via raw UPDATE (same week,
  same unit u1) while a manager-u1 publish waits. It asserts waited, the publishRace text, b moved and not published, a not
  published, 0 events. On r2 code the range+scope recheck passes ⇒ publishes ⇒ RED. Matches MEDIUM-1. The move is raw SQL rather than
  `moveEntry`; that is equivalent for this check (the outcome publish sees under the lock is the same).

**Regression scan of the 16 changed lines:** none found. The `still.length !== ids.length` check keeps the old count
semantics. The guarded `updateMany` + `upd.count` check is unchanged. No new text, event, audit or scope logic.

**Not verified:** typecheck, suite runs (S9.5/S9.6 RED-on-r2 / GREEN-on-r3 is inferred from reading, not run),
the ledger/notes part of the r3 diff (not read).

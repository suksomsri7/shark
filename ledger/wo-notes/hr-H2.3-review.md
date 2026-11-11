# H2.3 independent review — wip/hr-h2.3 @ 9dd5120d9 (diff 02f41f34f..9dd5120d9 -- src, 12 files)

Reviewer: read-only (git read + grep only; no DB, no typecheck, no oracle run). Date 11 Nov 2026.

## Verdict: MERGE
No CRITICAL / MAJOR. One MEDIUM (M1) with a one-line fix that needs a controller ruling because it tightens R4's
literal `publishedAt IS NULL` test; it can be folded in before merge or carried to H2.10 (the create form) as a debt.
Everything else is MINOR.

## Findings

### M1 MEDIUM — publishing the week cancels a valid swap on a "moved, not yet re-published" row
- Where: `src/lib/modules/hr/swap.ts:195` and `:205` (create/accept gate tests only `publishedAt === null`),
  `src/lib/modules/hr/roster.ts` H2.3 block `reassignEntriesInTx` (expect check `updatedAt > updatedAtMax`, ~line 1059 of the file),
  together with H2.1 `moveEntry` (sets `published=false`, keeps `publishedAt`) and `publishRoster` (`updateMany` on `published:false`
  rows ⇒ Prisma bumps `@updatedAt`).
- Scenario: manager moves entry X (13:00–21:00 instead of 09:00–17:00). Any open swap on X is cancelled (Q16), and X is now
  `published=false, publishedAt≠null`. Employee files a new swap on X (passes R4: publishedAt not null), peer accepts, chain or
  direct approval is pending. Manager publishes the week, which bumps X.updatedAt past swap.createdAt. On approval,
  `reassignEntriesInTx` returns `ENTRY_CHANGED`, so the swap goes to CANCELLED with "อนุมัติแล้ว แต่ตารางกะเปลี่ยนไป", although nothing in X
  changed after the request. Brief D10 assumes "publish of an untouched published row never bumps it". That holds for
  `published=true` rows only, not for this state. The same applies to `toEntry`.
- Smallest fix: in `checkInTx` refuse when the row is not currently published:
  `if (from.publishedAt === null || !from.published) → T.unpublished` and the same for `to` (`→ T.toBad`). Add `published` to
  `ENTRY_SELECT`. The Thai text stays the same. Optionally mirror it in `reassignEntriesInTx` (`NOT_PUBLISHED`). Needs a controller ruling
  (R4 wording). Oracle: add one case: move → request → publish → approve ⇒ expect APPLIED.

### m1 MINOR — removeEntry after the chain approved, before the effect runs: swap vanishes and the requester sees "อนุมัติแล้ว"
- Where: `roster.ts` removeEntry hunk + `cancelOpenSwapsInTx`; `swap.ts:520` (effect: missing row ⇒ silent noop).
- Scenario: the chain approves (request APPROVED, swap still PENDING). Before the outbox drains, the manager removes fromEntry.
  `cancelRequest` returns false (already APPROVED), the swap is set to CANCELLED and then FK-cascade deleted. The effect does nothing and
  writes no `apply_refused` audit. "คำขอของฉัน" shows the request as "อนุมัติแล้ว", with no Q10 outcome text because the swap row is gone.
  The window is short (until the drain). The roster is correct; only the user-facing label is wrong.
- Fix: the page could treat an `HrShiftSwapRequest` request that is APPROVED but has no swap row as `T.outcomeStale`. Alternatively,
  `cancel_by_roster` could record the APPROVED request id.

### m2 MINOR — DTO sides read the live entries, so closed swaps show rows that no longer belong to either party
- Where: `swap.ts:640-643` (`toItems.side`).
- Scenario: X is moved to employee C on another date (Q16 cancels the swap). The requester's and target's swap list still renders X with
  C's new date and time. No name leaks, but it is a third employee's row (and maybe an unpublished draft).
- Fix: return `null` for a side when `entry.employeeId ∉ {requesterEmployeeId, targetEmployeeId}`. This is a 1-line filter
  (`employeeId` must be added to the select).

### m3 MINOR — manager list: scope is checked on fromEntry only
- Where: `swap.ts:697-705`. A branch-A reader also gets the `to` side (date/time/shift name) and the target's name when that row is in
  branch B (SWAP with a borrowed requester). `reason` is shown to any decider who has fromEntry in scope (Q18 says "in-scope deciders").
  No surface uses `listSwapsForManager` yet (H2.11), so there is no exposure today. Fix: also require `unitVisible(toEntry.unitId)`
  for `reason`/`to`, or null the `to` side when it is out of scope.

### m4 MINOR — decideSwap reveals swap status before the branch check
- `swap.ts:454` (status check) runs before `:456-460` (unit scope). An out-of-branch decider gets "สถานะคำขอเปลี่ยนไปแล้ว" for closed swaps
  and "otherBranch" for PENDING ones, which tells them whether a swap is PENDING. Ids are cuids, so the risk is low. Fix: run the
  scope loop first (entries are readable before the status check).

### m5 MINOR — LEAVE code always mapped to the peer text
- `swap-rules.ts` `applyCodeText`: `LEAVE → leavePeer` even when the requester is the one on approved leave on toDay (SWAP).
  The direct decider then sees "เพื่อนร่วมงาน ลาอนุมัติแล้ว…" and blames the wrong party. Fix: split the code into `LEAVE_PEER`/`LEAVE_YOU` in
  `applyInTx:248`, or use a neutral text.

### m6 MINOR — marker hygiene in roster.ts
- The H2.3 block is placed before the closing `// ◂ HR H2.1`, so it sits inside the H2.1 region. Q16 is spread over 6 marked
  hunks/lines (import, 2 in moveEntry, 3 in removeEntry) rather than "one marked hunk". S8.2/S8.3 strip them correctly, so this
  is cosmetic. Moving the block after `// ◂ HR H2.1` would be enough.

## Verified (held)
- Atomicity: the approve path (direct, effect, owner-auto) is one `tenantDb(ctx).$transaction` and does lock `hr-swap:<id>` →
  roster keys (`lockKeys`, de-duplicated, sorted, one statement) → re-read swap under the roster lock → `applyInTx` → guarded
  `updateMany(status:PENDING)` with count check → `emitOutbox` in the same tx. `reassignEntriesInTx` pre-checks DUP and uses a SAVEPOINT,
  so it writes both rows or neither, and the CANCELLED write still lands in the same tx. Rows are updated in ascending id order, and a
  mid-swap unique collision is impossible because same (date, shiftId) is refused.
- Lock order: swap paths use hr-swap then roster keys. H2.1 move/remove/publish/copy/generate take roster keys only. Q16 writes
  approvalRequest then swap row, the same order as cancelSwap. No swap path writes a row before it takes its roster lock (only reads),
  so there is no advisory/row-lock cycle. Every statement inside the txs uses `tx`, including `cancelRequest`/`submitForApproval`
  `{tx}`, `approvalDecision` read, and `isTenantOwnerTx`.
- Stale state: entries moved/removed between pre-read and lock are caught because Q16 cancels the swap, so the `s2` re-read gives stale.
  Owner/updatedAt/past/branch/leave/ended are re-checked under the lock. Two swaps on one entry are blocked by the open-clash count
  under the shared (owner, day) key plus the partial unique. Peer double accept gets stale (lock + status guard). Effect replay or
  out-of-order is a noop (swap ≠ PENDING, or request status ≠ expected). A failed owner-auto apply rolls back to AWAITING_PEER.
- Authorisation: self-service never takes an employeeId for the actor (identity comes from `linkedUserId` under the lock). Direct decide
  = OWNER or explicit key (role-only MANAGER refused). Both entries' units are checked, `[]` = all, and an explicit list gets the H1.1
  texts without ids. Self-decision is refused directly (`:462`) and in the chain (`isOwnHrSubject` swap branch, read with tenantId).
  A live chain blocks direct decide. Cross-tenant/system ids give stale (tenantDb system scope + explicit tenantId/systemId).
- Approval core: registration in labels.ts/actions.ts is one marked line each. The effect block is a single marked hunk that reads
  systemId from the request. `submitForApproval` runs in the accept tx. Q16 cancels the PENDING request in the same tx, so no orphan
  inbox item. cancelSwap refuses a chain that has already been decided.
- Events: `hr.shift.swap_requested` / `swap_approved` each have one no-op `withAutomation` consumer and one label. Both are emitted
  inside the state-changing tx with key `<type>#<swapId>`, so replay adds no rows. Payloads contain ids and dates only.
- Warnings: `rosterWarnings` covers the requester and target only, filtered to warnings that touch the swap's entries, and is warn-only.
  It is simulated for open swaps and uses committed state after a direct apply. No third employee appears.
- DTO is a whitelist (no salary, phone, or leave reason). Refusals are fixed Thai from SWAP_TEXT. The action files `"use server"` take
  tenant/user from the session, and decideSwapAction calls assertCan and then runs the strict service check.
- Approvals page: testids are unique (ConfirmDialog suffixes `-trigger`/`-sheet`). Rows in the chain cancel via cancelSwapAction.

## Not verified
- No DB, oracle, typecheck or visual run (a controller run is in progress in this tree). Runtime behaviour of `SAVEPOINT` through the
  tenantDb extension tx and the builder's green claims are taken from notes, not reproduced. Other worktrees were not inspected.

## r2 re-check — head 525206e5e (diff 9dd5120d9..525206e5e -- src: swap.ts, swap-rules.ts)

### Verdict: FIX FIRST (one small, text-only fix — r2-M1). Fixes (1), (2), (3) and (5) are correct and complete.

### r2-M1 MEDIUM — ruling (4) is incomplete: the accept path names the wrong party (endedYou is new in r2)
- `checkInTx` (swap.ts ~216-219) is written from the requester's point of view. `respondSwap` re-runs it with the TARGET as the actor
  (swap.ts ~385), and the owner-auto branch passes `a.party` the same way (~393).
- Scenario: the requester left employment (or is on approved leave) on the to-day, and the peer presses "รับกะนี้". The peer reads
  "คุณ อยู่นอกช่วงการจ้างในวันนั้น" or "คุณ ลาอนุมัติแล้วในวันนั้น", which describes the peer. The reverse also happens: the peer on leave on the
  from-day reads "เพื่อนร่วมงาน ลาอนุมัติแล้ว". Before r2, the ended case returned neutral `toBad`, so the wrong-person ended text is new.
- Smallest fix: give `checkInTx` (and the owner-auto `applyCodeText` call) a viewpoint flag. With `viewpoint:"TARGET"` (respondSwap
  only), swap leaveYou↔leavePeer and endedYou↔targetNotFound. Add one oracle vector: requester on leave or ended, then peer accepts
  and must see "เพื่อนร่วมงาน…".
- Note (ruled by S10.4, not raised): on decideSwap, "คุณ …" is addressed to the manager, who is not the person on leave or ended.

### Verified
- (1) F1: `published` was added to ENTRY_SELECT. `from` gets `publishedAt===null || !published` ⇒ unpublished. `to` gets `!published` ⇒ unpublished
  (`publishedAt===null` ⇒ toBad, as before). The check runs at both create and accept (respondSwap re-runs checkInTx). The apply path still
  tests publishedAt only, but the only writer of `published=false` (moveEntry) cancels open swaps (Q16). M1 is closed.
  MINOR: the `to` side now has two texts (never published ⇒ toBad, moved draft ⇒ unpublished), which tells the requester that the
  colleague's row was moved. Cosmetic.
- (2) F2b: the in-query filter matches the old post-filter for every scope shape. OWNER, `[]`, malformed, or a list containing "*" ⇒
  `hrScopeOf` returns "*" ⇒ no unit clause (old: `unitVisible` true). An explicit list ⇒ `fromEntry.unitId IN list`, and SQL IN never
  matches NULL, same as old `!!unitId && includes`. A null-unit fromEntry is hidden from list viewers and shown to "*". The `unitId` input
  ⇒ an equality AND (old: `===`). The `unitId` refusal is unchanged. fromEntry is a required relation, so no row drops out. Open
  statuses come first, then closed, with total ≤ 500. A status filter goes to exactly one of the two queries. tenantDb adds
  tenant+system.
- (3) F2/m3: `showTo`/`showReason` both require from and to to exist and to be in scope (GIVE: to=null passes). There is no bypass:
  `swapPreview` and `decideSwap` refuse unless both entries are in scope, and return warnings only (no `to`, no `reason`). The approvals page
  uses `listMySwaps` (the two parties only, both allowed by Q18), plus core list rows that carry only the entity label. Nothing else
  imports `toItems` or the list functions (hr/index re-exports types + applySwapDecision only).
  MINOR: a SWAP whose `to` row was deleted (exists=false) hides `reason` even from an all-branch decider. It is over-restrictive,
  not a leak.
- (5) m4: `decideSwap` now checks scope before status; a missing row still gets stale. The order is otherwise unchanged (self, inChain,
  lock, re-read).
- No regressions: lock order, transaction-client use and guarded updates are untouched. Party plumbing (`Applied.party`, `refused.party`)
  reaches both decideSwap and owner-auto. S10.1–S10.5 exist in the oracle (lines 459-463, 1146-1193) and match these rulings.

### Not verified
No DB, oracle or typecheck run (a controller run is active). The S10 results are not reproduced.

# H2.3 builder notes — shift swap / give-away (`hr/swap.ts`)

Branch `wip/hr-h2.3` · base dde6f8c18 (session/hr 02f41f34f + oracle) · worktree `/root/projects/shark-hr-b` · QC4 only · **no migration** (H1.2 model).

## Checkpoint
- [x] Step 0 forced oracle on base: `BASE-EXPECTATION 73/73 as registered` · `passed 7/73 (QC_FORCE)` · `RESIDUE none` · exit 1
- [x] c1ae562bd swap-rules.ts (pure) · roster.ts R6 block (`lockRosterKeysInTx` · `reassignEntriesInTx` · `cancelOpenSwapsInTx`) + Q16 hunks in moveEntry/removeEntry
- [x] 1b02abd0e swap.ts · approval core hunks (service `isOwnHrSubject` · labels · actions) · effect block · hr/index block · consumers + automation labels
- [x] 1d931cd81 swap-actions.ts · /app/approvals hunk · hr-ui-inventory rows (8) · visual-hr SPECS["2.3"]
- [x] first forced oracle: 67/73 (S3.8 · S5.1–S5.4 = oracle defects below · X12 = fitness F6.1 → fixed by assertCan in decideSwapAction)
- [x] local verification copy (untracked, deleted) with the 2 ORACLE-EDITs applied: **73/73 · RESIDUE none · exit 0**
- [x] oracle ×3 · picked suites · fitness ×4 · typecheck — results in `hr-H2.3-green.txt` + "Final summary" below

## Commands
DB: `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 [QC_FORCE=1] pnpm exec tsx scripts/<suite>.mts`
Fitness bare: `bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL pnpm exec tsx scripts/<f>.mts`
Typecheck: `env NODE_OPTIONS=--max-old-space-size=12288 ISO_MEM=14000M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck`
Picker: `# LEAN · changed: (12 src files) · oracles picked: qc-hr-h0.1 h0.5 h0.6 h0.7 h1.1 h1.2 h1.3 h2.1 h2.3` — per controller: h0.x/h1.x skipped (controller runs them), h2.1 run.

## ORACLE-EDIT requests
1. **H2.3-S3.8 `kept`** — `baseVals` regex reads every `value:` in base `approval/labels.ts`, including `APPROVER_ROLES` (`MANAGER`, `OWNER`), which are never in `ENTITY_TYPES` ⇒ `kept` is false on any build. Hunk:
   `const baseVals = [...(fileAtBase("src/lib/modules/approval/labels.ts") ?? "").matchAll(` → `const baseVals = [...(fileAtBase("src/lib/modules/approval/labels.ts") ?? "").split("APPROVER_ROLES")[0]!.matchAll(`
2. **H2.3-S5.1–S5.4** — S5 calls `req`/`acc`/`dec` directly but the policy is left **active** by the last `pair({ chain: true })` (S4.8 `decideVsMove(true)`), so every accept goes into the chain and `decideSwap` correctly answers `inChain` (S3.4 asserts exactly that). S5.4 fails only as a consequence. Hunk: after `console.log("── S5 warnings ──");` add `await chain(false);`.
With both edits (local copy): 73/73, residue none (`scratchpad local1-keep.txt`).

## Decisions (builder) — for the controller
- D-B1 **Q9 decider = OWNER or explicit `hr.employee.create` / `hr.*` permission** (not H2.1 `canWrite`, where `evaluate` passes any MANAGER role). Needed for "MANAGER role alone may only read" (Q9) and oracle S6.3 (mgr-role-only sees the row without `reason`). Readers of `listSwapsForManager` = deciders + MANAGER role. Scope: both entries' `unitId` in scope (`hrScopeOf` + `evaluate(unitId)`; all-branch viewers pass).
- D-B2 Not-found swap id (other tenant / other system / deleted) = `"สถานะคำขอเปลี่ยนไปแล้ว กรุณาเปิดดูใหม่"` (fixed text; Q16 "missing swap row = CANCELLED"). Cancel by a non-requester = `"ขอสลับได้เฉพาะกะของคุณเอง"`. Non-reader list/decide = H2.1 `"คุณไม่มีสิทธิ์จัดตารางกะ"`.
- D-B3 Direct `decideSwap` APPROVED that cannot apply (R8 codes) = same as the effect: swap → CANCELLED + audit `hr.swap.apply_refused` (requestId null), returns a fixed text per code (DUP → H2.1 duplicate text · PAST → expired · LEAVE → leavePeer · ENDED → targetNotFound · BRANCH → branch · ENTRY_* / NOT_PUBLISHED → H2.1 entryChanged).
- D-B4 Owner-auto (Q8) that cannot apply at accept ⇒ refused + rolled back (stays AWAITING_PEER) — it was just re-validated under the same locks, so only an out-of-band write can trigger it.
- D-B5 `reassignEntriesInTx` checks DUP before writing and also wraps the writes in a SAVEPOINT: P2002 or a guarded `updateMany` count ≠ 1 ⇒ `ROLLBACK TO SAVEPOINT` and code `DUP`/`ENTRY_CHANGED` (never a half-written pair; caller can still write CANCELLED in the same tx).
- D-B6 "changed since request" = entry `updatedAt` > swap `createdAt`; `createdAt` is written explicitly with the app clock (same clock as Prisma `@updatedAt`) to avoid DB/app clock skew (D10).
- D-B7 Requester out of employment on the to-day (SWAP) = `"กะของเพื่อนร่วมงานไม่ถูกต้อง — กรุณารีเฟรช"`; target out of employment on the from-day = targetNotFound. Not oracle-tested.
- D-B8 Q16 also writes an audit `hr.swap.cancel_by_roster {entryId, swapIds, op}` after the move/remove commit (marked single lines in roster.ts).
- D-B9 Self-service actions (request/respond/cancel) have no permission-key gate — authority = identity (linked employee of the entry/request, checked under the lock), like own-leave. `decideSwapAction` has `assertCan(hr.employee.create)` (also satisfies fitness F6.1); the service re-checks the strict Q9 rule.
- D-B10 Approvals page strings are inline Thai (the page has no next-intl keys for its own text; not an HR page, F16.4 untouched).
- D-B11 Warnings (R10) = `rosterWarnings` over requester + target rows (± 1 day + enclosing weeks), filtered to warnings of those two that touch the swap's entries; preview simulates, `decideSwap` reads the committed state.

## Access — who gains / loses what
- Gains: an employee linked to a user can request a swap/give-away of their own published future shift, see their own swaps (both parties: names of the two people, the two shifts, reason), accept/decline requests sent to them, cancel their open requests. OWNER / explicit `hr.employee.create` holders decide swaps directly (no policy) within their branch scope and see `reason`; MANAGER role w/o the key lists swaps of its branches without `reason`. Shop can set an approval policy of type "คำขอสลับกะ".
- Loses: nobody. H2.1 `moveEntry`/`removeEntry` now also cancel open swaps on that row (Q16).

## Debts (brief §7 D1–D10 stand) + new
- D-N1 Core chain decisions are not branch-scoped (D2) — unchanged.
- D-N2 No i18n keys for the approvals-page swap section (inline Thai like the rest of that page).
- D-N3 `listSwapsForManager` reads ≤ 500 newest rows then filters by scope in memory (no pagination yet; H2.11 inbox).

## Runbook (prod)
No migration, no backfill, no cron, no seed. Deploy code only; the two event types ship with their consumers + labels in the same build. Optional shop step: approval policy of type "คำขอสลับกะ" in `/app/settings/approval`. Rollback: mark PENDING `hr.shift.swap_*` outbox rows DONE (or keep consumers); PENDING ApprovalRequests of type `HrShiftSwapRequest` become inert.

## §F self-check
- [x] 1 no new page/route (approvals page hunk only) — qc-nav-functions run (HR part)
- [x] 2 tx bodies use only the tx client (awk scan of swap.ts tx bodies: none; roster block uses `tx`; `cancelRequest`/`submitForApproval` get `{ tx }`)
- [x] 3 `[]` unitAccess = all branches (S6.5) · explicit list refused with H1.1 texts, no ids (S6.4)
- [x] 4 all refusals fixed Thai, no names/ids (S6.9)
- [x] 5 tx options maxWait 20 s / timeout 60 s (= leave lock tx) · audits after commit, one per op
- [x] 6 n/a (no migration)
- [x] 7 owner-auto + self checks inside the same tx under the swap lock; no second connection under a lock
- [x] 8 n/a (no rate limit)
- [x] 9 2 events: consumer + one automation label each + replay ×4 (S7.1–S7.4), emitted inside the state-changing tx
- [x] 10 files ⊆ brief list (+ notes); hot files as marked `HR H2.3` hunks (S8.2/S8.3 green)

## Final summary (code head 1d931cd81)
- oracle unforced `passed 68/73` exit 1 · forced #1 `68/73` exit 1 · forced #2 `68/73` exit 1 · `RESIDUE none` ×3 — the 5 reds are S3.8 + S5.1–S5.4 (ORACLE-EDIT 1+2); local copy with both edits 73/73 exit 0
- qc-hr-h2.1 90/90 · qc-hr-attendance 31/31 · qc-hr 9/9 · qc-bulk-ops 13/13 · qc-nav-functions exit 1 (known red S5 BOOKING /booking/calendar,/booking/day; HR complete) · qc-hf-hr-privacy 194/194 · qc-hr-leave-booking 14/14 · qc-payroll 19/19 · qc-hr-payadjust 27/27 · qc-payroll-reverse 14/14 · qc-hr-roster 24/24 · qc-booking-hours-hr 13/13 · qc-calendar 9/9 · qc-approval 16/16 · qc-approval-wiring 7/7 · qc-approval-edit 12/12 · qc-crm-c3.3 90/90 · qc-crm-c0.3 88/88 · qc-ai-proposals 16/16 · qc-ai-tools 18/18 · qc-chat-staff-perms 49/49 · qc-account-cpa 107/107 · seed-hr-qc 28/28 (all exit 0)
- fitness 53/53 bare + env · fitness-hr 8/8 bare + env (exit 0 ×4) · pre-commit fitness passed on all 3 commits (no --no-verify)
- typecheck (12288/14000M) exit 0 · 0 errors
- Not run (controller): qc-hr-h0.1/h0.5/h0.6/h0.7/h1.1/h1.2/h1.3 · visual-hr 2.3 (CONTROLLER-RUN) · qc-hr-h2.2 / qc-kanban-k3.3 / qc-crm-c1.6 (not printed by the picker)

## r2 (11 Nov)
Controller: ORACLE-EDITs 1+2 applied (9dd5120d9) · decisions D-B1/D-B3/D-B2/D-B9 accepted · fix round = review (`hr-H2.3-review.md`) + hunt (`hr-H2.3-hunt.md`).

Pre-approved ORACLE-EDIT 92297f084: S10.1–S10.5 (one per fix) + `T.endedYou`; F2b rows via one raw `INSERT … SELECT generate_series(1,510)`.
RED proof on 9dd5120d9 code: `passed 73/78 (QC_FORCE)` — failed exactly S10.1–S10.5 · `RESIDUE none` · exit 1.

Fixes (`swap.ts`, `swap-rules.ts`):
1. F1 (review M1): `checkInTx` refuses a from/to row with `published === false` (moved, not re-published) with `T.unpublished`; `published` added to ENTRY_SELECT. Nothing written, no event (S10.1).
2. F2b: `listSwapsForManager` filters branch scope in the query (`fromEntry.unitId IN scope`, + optional unit filter); open statuses first (≤ 500), then closed newest fill up to 500 total (S10.2).
3. F2 + m3: `reason` only when the viewer is a decider AND both entries' units are in scope (missing TO row ⇒ no reason); listing rule unchanged (FROM unit), TO side still returned (S10.3).
4. F3 + m5: `applyInTx` reports the party (`party: "YOU"` for requester ENDED/LEAVE on the to-day); `applyCodeText(code, t, party)` ⇒ `คุณ ลา…` / new `SWAP_TEXT.endedYou` "คุณ อยู่นอกช่วงการจ้างในวันนั้น — สลับไม่ได้"; `checkInTx` uses `endedYou` for the requester instead of `toBad`. Audit codes unchanged (ENDED / LEAVE) (S10.4).
5. m4: `decideSwap` checks branch scope before status (S10.5).

Deviation to rule on: ruling 3 says "reason and the TO side's details … only when BOTH … otherwise omit reason (and nothing else changes)". I applied the parenthetical: only `reason` is withheld; the TO side stays (hunter: R10 scopes by fromEntry). Withholding the TO side too = `to: null` for that viewer — one line, if wanted.

Debts (not fixed, per controller):
- review m1 (removeEntry after chain APPROVED before the effect: swap row gone, requester sees "อนุมัติแล้ว" without outcome) → H2.10/H2.11 UI
- review m2 (closed swaps render live entries that moved to another person) → H2.10/H2.11 UI
- review m6 (marker layout in roster.ts, block inside the H2.1 region) → cosmetic, left as is
- hunter "leave approval racing a swap apply" (leave effect takes no roster key) → H2.7

r2 verification: oracle unforced / forced / forced `passed 78/78` exit 0 ×3 · `RESIDUE none` ×3 · qc-hr-h2.1 90/90 · qc-hr-roster 24/24 · qc-hf-hr-privacy 194/194 · qc-approval 16/16 · qc-approval-wiring 7/7 (exit 0) · fitness-hr 8/8 bare + env · typecheck (12288/14000M) exit 0, 0 errors. Not re-run in r2: fitness.mts (pre-commit hook passed) and the rest of the r1 picker set.

r2b (controller ruling on fix 3): a viewer whose scope does not cover BOTH entries' units gets `to: null` and no `reason` (`shape` still SWAP) — `toItems` option `showTo` used by `listSwapsForManager`. S10.3 extended (pre-approved): mgr-u1 `to === null`, mgrAll gets reason + both sides. RED before the change: `passed 77/78 (QC_FORCE)` (S10.3 `toHidden`) · RESIDUE none. GREEN after: forced 78/78 exit 0 · unforced 78/78 exit 0 · RESIDUE none ×2 · qc-hf-hr-privacy 194/194 exit 0. DTO type `SwapItem` unchanged (`to: SwapSide | null` already) ⇒ typecheck not re-run (only the internal `toItems` options type gained `showTo?`).

## r3 (11 Nov)
Review r2-M1: refusals at peer accept were worded from the requester's side. Ruling: worded for the receiver. `checkInTx` takes `viewpoint`; `respondSwap` passes `"TARGET"` and the refusal text is mapped `leaveYou↔leavePeer`, `endedYou↔targetNotFound` (`forTarget`); the owner-auto apply refusal (actor = peer) goes through the same map. Direct decide keeps the S10.4 wording (manager).
Pre-approved ORACLE-EDIT: S10.6 (requester on leave ⇒ leavePeer · requester ended ⇒ targetNotFound · peer on leave ⇒ leaveYou; all stay AWAITING_PEER). **Consequential edit: S2.8 expected text changed `leavePeer` → `leaveYou`** (peer on leave accepting = the same case as S10.6 c under the ruling).
RED before the fix: `passed 77/79 (QC_FORCE)` (S2.8 · S10.6) · RESIDUE none. (A first S10.6 draft overlapped the next 4-day block and broke X1.1; fixed by giving the peer-leave case its own `nd()` block before the RED run.)
GREEN: forced 79/79 exit 0 · unforced 79/79 exit 0 · RESIDUE none ×2 · qc-hf-hr-privacy 194/194 exit 0 · fitness-hr (no env) 8/8 exit 0 · typecheck exit 0, 0 errors (run because an internal type changed: `checkInTx` param `viewpoint` + `Viewpoint` alias; no exported/DTO type changed).

# WO H4.3 — AI tools for HR (4 read · 2 proposals · Daily Brief line) + H4.2-FIX1

> RUN "HR V2" · worktree `/root/projects/shark-hr-b` · branch `wip/hr-h4.3` cut from `session/hr` 62a1f457b (H4.2 merged) · `session/hr` 0a0691c7d merged in before the final run (qc-hr-h2.4 S11.1 ORACLE-EDIT) · builder: Claude Opus 5.5
> Oracle: `scripts/qc-hr-h4.3.mts` + `-lib` (37 checks, commit 98d5e6e65) · FIX1 checks S7.1–S7.3 in `scripts/qc-hr-h4.2.mts` · green run `hr-H4.3-green.txt`
> DB: lane DB via `scripts/qc-hr.sh` only (iso.sh + with-gate-lock.sh). No migration.

## 0. Checkpoint
- done: service + adapter + shared hunks + FIX1 committed; all listed suites run (see green file).
- open (controller): 3 ORACLE-EDIT requests (§4) — without them qc-hr-h4.3 = 34/37 (M2 · C1 · V1) and qc-hr-h4.2 = 53/56 (S4.11 · S5.1 · S5.2). Both proposed edits were verified on /tmp copies of the oracles: h4.3 37/37 · h4.2 55/56 + S1.6 green ⇒ 56/56.

## 1. Files
| file | what |
|---|---|
| `src/lib/modules/hr/ai-rules.ts` (new) | pure: `HR_AI_TEXT` {th,en} (no·bad·person·dataNotOrders·stale·conversation·nothing·noPattern) · `fenceUntrusted` · `capHrToolResult` (8,000 B, drops tail rows) · `parseDraftArgs` · `rosterFingerprint` (cyrb53) · `patternFacts`/`factsFingerprint`/`patternNote` · `draftSummary` · `briefCounts`/`briefLine` |
| `src/lib/modules/hr/ai.ts` (new) | `hrAiViewer` (accepted Membership row, DB role = session role) · T1–T6 · `hrAiPreClaim` (ruling Q3) · `dispatchHrAiKind` · `hrTodayLine`. tenantDb only; own queries = Membership + AppSystem only |
| `src/lib/ai/tools-hr.ts` (new) | adapter: 6 AiTool defs, `actorProblem`, createProposal, HR service loaded lazily (fitness F10 no-env) |
| `src/lib/modules/hr/roster.ts` | `HR H4.3`: `addEntry` 4th param `{source:"AI", tx}` (reads/insert on caller tx, no own audit); `employeeDayCheck`/`shiftCheck` optional tx client; new `checkEntryDraft` (read-only, same gates as addEntry) and `rosterKeyStateInTx` (entries + approved leave for keys). Default path unchanged |
| `ai/tools.ts` · `tool-access.ts` · `kind-tables.ts` · `proposals.ts` · `plans.ts` · `skills.ts` · `secretary/digest.ts` | one marked `HR H4.3` hunk set each (import+spread · HAND_TOOL_ACCESS/ACTION_KIND/TOOL_MODULE · 2 kinds → {hr, hr.employee.create} · pre-claim hook + dispatch branch (dynamic import) · PLAN_HUMAN_ONLY · skill hr + "ข้อเสนอต้องมีคนยืนยัน" · `hrToday` on viewerDigest + digestBlock) |
| `hr/labor.ts` · `hr/labor-ui.tsx` | `HR H4.2-FIX1` (a) open month ⇒ MTD estimate even with a finalized run (runs read only for ended months) · (c) day 1 ⇒ costSatang null · nested units `take 201` ordered by fromDate ⇒ >200 sets truncated · (b) month/prev partial+excludedHeadcount notes per figure · `formatShortDate` for the MTD day |
| `scripts/qc-hr-h4.2-lib.mts` | pre-authorised frozen-static ORACLE-EDIT (S1.6): later-ticket-marked hunks in frozen hr files + later tickets' new oracle files pass |

## 2. How the brief was met
- R1/R2: every tool → `prepare`: actor.kind member else `person`; viewer from DB (`hrAiViewer`); HR system = arg `hrSystemId` (must be tenant HR) / ctx.systemId if HR / oldest. Keys/system actors also refused by `toolVerdict` (needsPerson + scopedData).
- R3: T1 `loadAttendanceBoard` (unitId must equal `unitSel`, else NO) · T2 `loadReport time` (unitId checked against `unitsForScope`) · T3 `laborDay`/`laborMonth` with only {unitId, day|periodKey} — no opts (L9) · T4 `teamLeaveBalances`, else `myBalances` (Q8) · T5 `listRoster` + `checkEntryDraft` + `rosterLeaveOverlay` + `checkRules` · T6 `loadAttendanceMonth` (+ `loadReport` time for teamAvgLate) · confirm `addEntry`/`addReviewNote`.
- R5: names/positions/shift/unit/leave labels fenced; outputs carry `untrusted` + `notice: dataNotOrders`; proposal payload = ids/dates/basis only; summaries server-built.
- R6: one `HR_AI_TEXT.no` for forbidden/unknown/out-of-scope/other tenant/other system/revoked/role mismatch; bad input = `bad` without echo.
- R7: propose writes only AiProposal. Pre-claim (`hrAiPreClaim`, before the claim in `executeProposal`): confirmer viewer + role gate (T5 `canManageHrSettings`, T6 `canSeeLifecycle`) + every entry through `checkEntryDraft` / `loadAttendanceMonth` scope + not own row ⇒ refusal `no`, PENDING kept, audit `hr.ai.proposal.refused {kind, code}`. Dispatch T5: one `tenantDb(ctx).$transaction` (tx client only) → `lockRosterKeysInTx` → fingerprint ≠ basis ⇒ `stale` (FAILED, 0 rows) → `addEntry(..., {source:"AI", tx})` → audit `hr.ai.proposal.confirm {kind, via:"AI", systemId, count, entryIds}` after commit. T6: facts recomputed with the confirmer; `factsFingerprint` ≠ basis ⇒ stale; else `addReviewNote` NOTE private from template + confirm audit.
- R9 caps 50/50/30/40 entries/7 days/8 KB. R10 `hrTodayLine` from the viewer's board (+ demand-peak shortfall when laborDay gives it). R11 via existing tool-access levels.

## 3. Decisions
- D-a Fingerprint uses `rosterKeyStateInTx` both at propose (short read tx) and confirm (under lock) so both sides read the same shape (all entries of the key, all branches + APPROVED leave).
- D-b (withdrawn in the fix round, ruling 3): AI rows now get a per-entry `hr.roster.entry.add` audit inside the tx.
- D-c T6 stale compares employee facts only (lateCount · lateMin · absentDays · topWeekday), not teamAvgLate (depends on confirmer scope).
- D-d Draft entries failing addEntry gates are `skipped` with one code `INVALID` (unknown ≡ out of scope); existing slot `EXISTS`; approved leave `LEAVE`; pending leave = warning.
- D-e T3 `prev` carries `partial`/`excludedHeadcount` too (privacy-neutral, helps the model say "partial").

## 4. ORACLE-EDIT requests (not applied — expectations)
1. qc-hr-h4.3 **M2 + C1(t2)**: the time report (H3.9, frozen) reads stored `HrAttendanceDay` rows only; the fixture never finalizes days ⇒ `loadReport` = 0 rows ⇒ `want.length > 0` / `rows(o2) ≥ 1` impossible. Fix: fixture calls `finalizeStoredGaps` (judge.ts) for T 2026-09-01..09-03 (not later — 09-04 must stay live for L8 stale) and for the cap tenant at D0, now 2026-09-08 10:00. Exact diff: `ledger/wo-notes/hr-H4.3-oracle-edit-request.diff.txt` (lines 226 and C1 block).
2. qc-hr-h4.3 **V1**: `confirmRead` reads `aiRows(A1, FD38)` after `x2` already executed ⇒ always 1 when confirmDraft passes (mutually exclusive). Fix: capture `nRead` before `deleteMany`/`x2` (same diff file).
3. qc-hr-h4.2 **S4.11 · S5.1 · S5.2**: helper `month()` uses NOW 2027-01-17 while expecting January = ACTUAL from the finalized Jan run — the exact opposite of FIX1-a/S7.1 (open month ⇒ MTD even with a finalized run). Proposed: line 314 `month()` uses `O(new Date("2027-04-20T03:00:00Z"))` (Jan/Feb/Mar all ended ⇒ Jan ACTUAL, Feb/Mar full ESTIMATE as asserted). Verified on a /tmp copy: all DB checks green.
- Applied (pre-authorised, HR frozen static): qc-hr-h4.2-lib S1.6 later-ticket rule (marker `ORACLE-EDIT (H4.2-FIX1 via H4.3 · builder)`).

## 5. §F self-check
1. no new page/route ☑ · 2. tx bodies use only the tx client (`confirmDraft`: lock/state/addEntry on `tx`; audits after commit) ☑ · 3. unit list [] = all branches via `hrScopeOf` in every wrapped reader ☑ · 4. refusals Thai fixed text, no ids/dev text ☑ · 5. TX_OPTS 15 s/30 s (server actions/chat, no route maxDuration below) ☑ · 6. no migration ☑ · 7. no privileged link paths ☑ · 8. no rate limit added ☑ · 9. no outbox events ☑ · 10. files ⊆ brief list + labor FIX1 + oracle lib (marked) ☑

## 6. Debts
- T1 row has no per-row `unit` (board DTO has none; only `borrowed`). · Brief §9 debts unchanged.

## 7. Owner item
- O1 (verbal warning suggestion) — default kept: private NOTE only.

## 8. Fix round (review FIX FIRST + hunt F1/F2 · controller rulings 1–9, 14 Nov)
| ruling | change | where | oracle |
|---|---|---|---|
| 1 MAJOR (review MAJOR-1 = hunt F1) | T5 propose: `checkEntryDraft` first (INVALID), then ONE `rosterKeyStateInTx` read (all branches) → `EXISTS` (any entry of the employee that day, any branch, + listRoster-visible) / `LEAVE` (approved) and `basis` from the same state; confirm re-reads under the roster lock ⇒ any shift/leave added in between ⇒ stale, nothing written | `hr/ai.ts` hrDraftRoster/keyStateOf | FX1 (owner unitId:A + hidden-B for branch-A payroll MANAGER ≡ visible-A bytes · later shift / approved leave ⇒ stale) |
| **skip-code decision** | one generic `{employeeId, date, code:"EXISTS"}` for a taken slot whether the blocking shift is in a visible or hidden branch — no unit, shift or entry id | | FX1 `hiddenB`/`sameBytes` |
| 2 (MINOR-3) | pre-claim refuses (PENDING, `hr.ai.proposal.refused`) only for `checkEntryDraft` refusals flagged `scope` (no permission · other branch · unassigned); left/past/shift closed/slot taken ⇒ claim → dispatch ⇒ `addEntry` refusal ⇒ stale FAILED (terminal, rollback) | `roster.ts` checkEntryDraft `scope` · `hr/ai.ts` confirmBlock/confirmDraft | FX2 |
| 3 (MINOR-4) | `addEntry` AI mode writes `hr.roster.entry.add` per row via `tx.auditLog.create` in the same tx (like `hr.roster.publish`), `after.via:"AI"` + `proposalId`; confirm audit keeps `entryIds`. D-b withdrawn | `roster.ts` addEntry write() | L2 `perEntry` |
| 4 (hunt F2) · **F2 decision** | refuse with fixed text `HR_AI_TEXT.alreadyNoted` (same bytes for every caller) when an AI pattern NOTE for (employee, month) exists (read via `listReviewNotes`, title from the template `… เดือน YYYY-MM (จากผู้ช่วย AI)`) or a PENDING unexpired `hr_flag_pattern` proposal for the same pair exists; confirm re-checks the note ⇒ FAILED with that text | `hr/ai.ts` patternNoted · `ai-rules.ts` | FX4 (2nd proposal by owner + lifeMgr same bytes · confirming a copied PENDING row ⇒ no 2nd note) |
| 5 (MINOR-1 + hunt I1) | `fenceUntrusted` also strips U+200B–U+200F, U+2060–U+2069, U+FEFF; `plainText` (summaries) replaces `< > [ ] { } \` * _ # \| ~ \\` with spaces, ≤ 60 chars | `ai-rules.ts` | FX5 |
| 6 (MINOR-2) | T1 `truncated` also when alerts > 20 | `hr/ai.ts` | FX6 |
- RED once with the fix reverted in the working copy (ai.ts · ai-rules.ts · roster.ts at 113fd7b4c, oracle at fix-round): `qc-hr-h4.3 passed 36/42` — failing L2 (perEntry) · FX1 · FX2 · FX4 · FX5 · FX6. Green with the fix: 42/42.
- Remaining race (accepted, documented): two `hr_flag_pattern` proposals created concurrently in the same instant can both exist; confirming both concurrently could still add two notes (no lock across `addReviewNote`, lifecycle.ts frozen). Sequential cases are covered.

## 9. Debts (ruling 7)
- D-ai-suspended-tenant: AI tools for a member of a suspended tenant rely on session-entry enforcement (`core/context.ts`) — pre-existing, all AI tools (hunt I2).
- D-H43-brief-cache: Daily Brief line recomputed uncached per secretary turn (board + laborDay).
- Borrowing cap in labor.ts keeps the OLDEST 200 rows (fromDate asc) and sets `truncated` (review NOTE-3).
- Brief line uses the oldest HR system (review NOTE-2).

## 10. Merge of session/hr 292bc5b7e (H3.4-YTD)
- Conflict only in `scripts/qc-hr-h4.2-lib.mts` S1.6 ⇒ session/hr's IN_BASE form kept; my earlier S1.6 hunk dropped (not needed).
- `scripts/hr-ui-inventory.json` rows: ours 530 (= base 530, unchanged) · theirs 540 · merged 540 — no row lost. Messages unchanged on this branch.
- `prisma generate` · lane `prisma migrate deploy` ⇒ applied `20270110000001_hr_opening_ytd` (ep-orange-dust lane).

## 11. Fix-round run (head after merge) — see hr-H4.3-green.txt
seed 34/34 · qc-hr-h4.3 42/42 forced ×3 + unforced ×1 (no residue) · qc-hr-h4.2 57/57 ×2 · h3.4-ytd 44/44 · h0.3 37/37 · ai-tools 18/18 · ai-proposals 16/16 · ai-plan 7/7 · roster 24/24 · h2.2 60 · h2.3 79 · h2.7 94 · h2.10 57 · h2.11 70 · h3.8 78 · h3.9 60 · h1.1 81 · h2.4 68 · set-1 25 · hf-hr-privacy 194 · audit-trail 21/21 · fitness 54/54 + fitness-hr 9/9 both modes · typecheck clean (426 s).

## 12. Follow-up (concurrent pattern note) + delta review r2 (MERGE WITH NOTES)
- **Lock form:** transaction-scoped advisory lock `pg_advisory_xact_lock(hashtextextended('hr:ai:pattern:<systemId>:<employeeId>:<month>',0))` taken in an OUTER `tenantDb(ctx).$transaction` in `confirmPattern`, held through the "note exists" re-check (`patternNoted`) and `addReviewNote`. `addReviewNote` (lifecycle.ts, frozen) cannot take a tx client, so it writes on its own connection under the lock and commits before the lock is released; the next waiter re-checks and gets `alreadyNoted`. A session-scoped lock was not used (pooled client cannot guarantee lock/unlock on the same connection). Waiting is bounded by TX_OPTS (15 s/30 s). Accepted cost: one extra pooled connection per concurrent confirm of the same (employee, month).
- FX7 (deterministic: `LOCK TABLE "HrReviewNote" IN SHARE ROW EXCLUSIVE MODE` held until 2 backends wait) ⇒ 1 NOTE + `alreadyNoted`. RED with the lock line removed: `❌ [H43-FX7] … waiting=2 notes=2` (42/43).
- r2 item 1: stale outcomes write one `hr.ai.proposal.stale {kind, code}` (human actor, proposal id; code `CHANGED` | `ENTRY`) besides the FAILED row — FX2 `staleOne`.
- r2 item 2: roster.ts comments at the AddEntryOpts block and the AI return line now describe the per-entry audit in the tx.
- r2 item 3: FX8 (two proposals, same slot, held roster key ⇒ 1 AI shift · other FAILED stale) · FX9 (no scope ⇒ refusal bytes identical with/without an AI note; duplicate text unreachable).
- Debts (r2 item 4):
  - A draft proposal whose employee moved outside the confirmer's scope stays PENDING until the 24 h expiry (review NOTE-c i).
  - D-H43-pending-flag-visibility: a pending `hr_flag_pattern` proposal blocks other managers for that employee+month until expiry; they cannot see or reject it (it lives in the proposer's conversation).
  - Bare URLs remain as plain text in proposal summaries (only `<>[]{}` etc. are stripped) — matters only if a card auto-links.

## 13. Merge of session/hr b6f1d0719 (H4.5 LINE notices)
- Clean merge; `scripts/hr-ui-inventory.json` rows ours 540 / theirs 557 / merged 557 (ours unchanged since the previous base); messages untouched on this branch (theirs taken). `payroll.ts` not touched by H4.3 (no PAY_MARKED tag needed).
- `prisma generate` · lane `migrate deploy` ⇒ `20270111000000_hr_line_link`.
- No H4.3 check counts AppNotification/HrNotice (no count re-derivation needed). Added L2 `noNotice` (ORACLE-EDIT, H4.5 merge): AI-drafted rows are unpublished ⇒ 0 `hr.roster.published` outbox events and 0 HrNotice for the drafted employees.
- Run: all green (see hr-H4.3-green.txt) · typecheck clean 414 s.

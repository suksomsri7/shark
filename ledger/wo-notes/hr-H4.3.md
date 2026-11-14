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
- D-b `addEntry` tx mode writes no `hr.roster.entry.add` audit (would need a second connection under the lock); the confirm audit lists `entryIds`.
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
- T1 row has no per-row `unit` (board DTO has none; only `borrowed`). · AI-drafted roster rows have no per-entry `hr.roster.entry.add` audit (D-b). · Brief §9 debts unchanged.

## 7. Owner item
- O1 (verbal warning suggestion) — default kept: private NOTE only.

# H4.3 review — AI tools for HR (+ H4.2-FIX1) · commit 113fd7b4c (diff vs 0a0691c7d)
Reviewer: independent, read-only (git show / grep only). Verdict at the end.

## 1. Actor + permission
- The acting human always comes from the DB, never from tool args. `prepare` (hr/ai.ts:115-124) refuses `kind !== "member"` with `person`. `hrAiViewer` (ai.ts:82-95) then reads the accepted `Membership` row for (tenantId, actor.userId), requires DB role = session role and `actor.tenantId === tenantId`, and builds role/unitAccess/permissions/userId from that row. No tool takes `userId` or `tenantId` as an argument.
- `hrSystemId` (ai.ts:99-110) must be an HR AppSystem of the same tenant, otherwise `no`. The tenant has no per-system ACL, so this widens nothing.
- `unitId` and `employeeId` only narrow:
  - T1: `board.unitSel !== unit` ⇒ `no` (:138).
  - T2: checked against `unitsForScope(hrScopeOf(v))` (:183-184).
  - T3: laborDay/laborMonth scope.
  - T4: filtered from the reader's rows; empty ⇒ `no` (:276-277). The self path compares with `resolveSelf` (:283-286).
  - T6: `loadAttendanceMonth` with the viewer, own row ⇒ `no` before any read (:373).
- API keys and system actors are refused twice: `prepare`, plus `toolVerdict` (needsPerson/scopedData, tool-access.ts hunk).
- Each tool calls exactly the UI reader with only `{day|period|periodKey, unitId}`. No `opts`, `__takeCap` or `now` is forwarded (T3 :216-241). So H4.2 R1, H3.8/H3.9 pay privacy, and the board's leave-label rule are inherited. T3 is refused before argument validation for non-payroll viewers (:210, ruling Q2).
- `confirmerOf` (:385-394) rebuilds the viewer from the confirmer's DB row and re-checks `payload.systemId`.
- No IDOR on confirm:
  - `executeProposal` loads the row with `tenantDb(ctx)` (tenant-scoped).
  - It requires `canConfirmerSeeConversation` (creator or OWNER).
  - `assertCan` + `accessLevelGate` run, then `hrAiPreClaim`, then the atomic claim (proposals.ts hunk). Another tenant's user with a guessed id gets "ไม่พบข้อเสนอนี้".

## 2. Output hygiene
- Checked every key returned by T1–T6: no national id, bank, address, phone, e-mail, leave reason, PIN material, rate or per-person ฿. T3 copies only the aggregate DTO fields; `prev` adds `partial`/`excludedHeadcount`, which is privacy-neutral (D-e).
- Names ARE treated as untrusted. They go through `fenceUntrusted` (control + bidi stripped, whitespace collapsed, ≤60 chars) together with positions, shift/unit/leave-type names and alert names. Outputs carry `untrusted:[…]` + `notice: dataNotOrders`.
- Proposal summaries are server-built: `draftSummary` (header + ≤10 fenced "name · date · shift" lines) and `patternSummary`. Payloads hold ids, dates and basis only.
- **MINOR-1** `fenceUntrusted` (ai-rules.ts:47-55) does not strip zero-width characters (U+200B–U+200D, U+2060, U+FEFF) or markdown/HTML (`[x](url)`, backticks, `<b>`). Names land in AiProposal.summary, which the approval card shows. Not exploitable as instructions (no newlines, no bidi), but the brief's "cleaned" should cover at least zero-width characters, and ideally neutralise `[`/`<`/backticks.
- **MINOR-2** T1 `alerts.slice(0, 20)` (ai.ts:164) drops alerts beyond 20 without setting `truncated` (R9: "truncated on any cap"). T2 relies on the H3.9 reader refusing on LIMIT, so it can never be truncated silently — fine.

## 3. Proposals
- **MAJOR-1 — T5 "only empty slots" (ruling Q6) is not guaranteed.**
  - Where: ai.ts:306-308 + roster.ts:834-845, entryScopeWhere at roster.ts:141-146.
  - Cause: `taken` comes from `listRoster(ctx, v, {from, to, unitId})`, which filters entries by entry `unitId` (the model's `unitId` argument and the viewer's unit scope). The fingerprint `basis`, however, is computed from `rosterKeyStateInTx`, which sees every entry of the key in every branch.
  - Scenario: the employee has a B-branch shift on D. The model calls `hr_draft_roster{unitId:A, entries:[{E, D, shiftA}]}`. The B row is not in `taken`, `checkEntryDraft` passes, and `basis` already contains the B row. At confirm the fingerprint is equal, and `addEntry` only rejects the same `shiftId` (roster.ts:464). Result: a second shift on a non-empty slot, and the summary does not show it to the confirmer.
  - The same gap applies when the slot is filled, or leave is approved, between `listRoster`/`rosterLeaveOverlay` and `keyBasis` (:330, :347): `basis` absorbs the change, so confirm cannot see it as stale.
  - Fix: read `rosterKeyStateInTx` once at propose. Mark `EXISTS`/`LEAVE` from that state (any entry / any approved leave on the key, all branches). Compute `basis` from the same state. Add an oracle case with a branch-B entry and `unitId:A`.
- Confirm (T5): one `tenantDb(ctx).$transaction`, tx client only. `lockRosterKeysInTx` covers all keys, then fingerprint ≠ basis ⇒ `stale` (FAILED, 0 rows), then each entry goes through `addEntry` with all gates on the tx client. Rows are created with `source AI` and default unpublished, `createdById` = confirmer. Any failure rolls back everything. Double confirm ⇒ one execution: atomic claim PENDING→EXECUTED, the loser gets "ถูกดำเนินการหรือปิดไปแล้ว".
- Ruling Q3 is met. `hrAiPreClaim` (ai.ts:403-438) runs before the claim; an unpermitted or narrowed confirmer gets the fixed `no`, the proposal stays PENDING, and `hr.ai.proposal.refused {kind, code}` is written.
- **MINOR-3 — pre-claim mixes "data changed" with "not permitted".**
  - Where: ai.ts:410, :417.
  - `checkEntryDraft` also fails when the employee has left, the date has passed (`past`) or the shift was deleted. Those cases are reported as `SCOPE`, so the proposal stays PENDING until expiry. Every click returns the misleading "not found / no permission" and writes another refused audit.
  - Brief R7 says data change ⇒ `stale` FAILED.
  - Fix: return `SCOPE` only for the scope or role refusal. Let the other reasons reach dispatch, which marks FAILED with `stale`.
- T6:
  - The note text comes from the fixed `patternNote` template; there is no model text.
  - It is a private `NOTE` (`visibleToEmployee:false`), written through `addReviewNote`, which applies its own self/scope rules.
  - Thresholds: late ≥3 or absent ≥2 (Q4).
  - Stale check: `factsFingerprint` excludes the scope-dependent team average (D-c).
  - Readers afterwards are the existing lifecycle note readers (canSeeLifecycle + scope). The flagged employee cannot read it.

## 4. Audit
- `hr.ai.proposal.confirm` is written after commit with actorType USER, the confirmer's id, `via:"AI"`, systemId, count, and `entryIds`/`noteId` (:476, :488). It contains no names, ฿ or text.
- **MINOR-4 — the D-b reason is not real.** The same file writes an audit inside a locked tx through the tx client (`tx.auditLog.create`, roster.ts:912, `hr.roster.publish`). The default `addEntry` path also writes its audit after commit. So per-entry `hr.roster.entry.add` rows were possible with no second connection under the lock.
  - Impact today is small. `grep` finds no reader of `hr.roster.entry.add`. The publish event (`hr.roster.published`, with entryIds/employeeIds) and its notifications/H4.5 LINE notices fire at publish, and publish picks up the AI rows (published=false). `removedSinceLastPublish` reads only remove/publish audits.
  - Accepted by the oracle author (L2 entryIds). Recommend recording the true reason ("chosen, not forced") in the notes.

## 5. Daily Brief
- `hrTodayLine` (ai.ts:497-522):
  - Viewer comes from the DB row; non-roster readers get null.
  - Counts come only from that viewer's board, plus the demand-peak shortfall from laborDay for the same viewer.
  - No names or leave types. No cron.
- It is called from `viewerDigest` (per viewer; `hr` level OFF ⇒ null).
- NOTE-1: `digestBlockFor` (service.ts:308) runs it uncached on every secretary-room turn: board + laborDay per message.
- NOTE-2: the brief always uses the oldest HR system (`hrSystemOf(…, undefined, undefined)`).

## 6. H4.2-FIX1
- (a) labor.ts:611-620: an open month never reads runs ⇒ month-to-date estimate through `computeDay(…, g.sees)`. R1 still holds for limited viewers (S7.4 covers the open month with a finalized run). Ended months keep the ACTUAL path with the `g.sees(home)` exclusion.
- (b) Per-figure partial/excluded notes in labor-ui.tsx:168-170.
- (c) Day 1 ⇒ `costSatang` null.
- Nested borrowings `take 201` ⇒ `truncated`.
- `formatShortDate` (Asia/Bangkok, th/en) is used for the month-to-date day.
- No privacy regression found.
- NOTE-3: the cap keeps the OLDEST 200 borrowings (`fromDate asc`), so the recent ones that matter for current days are the ones dropped. The truncated flag makes this visible, but `desc` would give better figures.

## 7. Oracle changes after the build
- qc-hr-h4.3:
  - The fixture `finalizeStoredGaps` (09-01..03, plus the cap tenant at D0) mirrors production, where the H3.9 report reads only stored days.
  - New assertions make it stronger, not weaker: F0 `stored` ≥10, report ≥4; C1 finalized=60 and reader=60.
  - V1: counting before x2 fixes a check that could never pass.
  - L2 `entryIds` = exactly the created rows is stronger.
- qc-hr-h4.2:
  - `month()` at 2027-04-20 keeps every golden. It is forced by FIX1-a, because Jan at 01-17 is now month-to-date by ruling.
  - S7.4 adds the open-month limited-viewer case and was RED on pre-FIX1 code.
  - All legitimate.
- NOTE-4: the builder's own edit to qc-hr-h4.2-lib S1.6:
  - It follows the HR-SET-1/h3.9 S1.5 precedent, but it is lenient. A hunk passes if ANY added line carries a later-ticket mark, so unmarked lines in the same hunk pass too. Any new `qc-hr-h*.mts` absent from the base is exempt.
  - Ruling 2 says the builder may not change oracle expectations. This changes a static frozen check, not a golden.
  - The controller should explicitly confirm it.

## 8. COMMON §F / boundaries
- Checked items:
  - F2: only the tx client inside `confirmDraft` (employeeDayCheck/shiftCheck/lockKeys/dup/create on `tx`; audits after commit).
  - F4: fixed Thai refusals. One caveat: addEntry's `r.reason` texts can surface on FAILED, but they are generic roster texts with no ids.
  - F9: no outbox events.
  - F10: the file set matches the brief, plus FIX1 and the oracle lib.
- The ai layer imports only `hr/ai` and `hr/ai-rules` (dynamic import, same pattern as tools-pos/pos api). The hr side does not import the ai layer. `tools-hr.ts` has no prisma or env.
- The edit route (`editProposal`) does not cover `hr_*` kinds, and PLAN_HUMAN_ONLY blocks plans. No path bypasses the pre-claim.

## Verdict: **FIX FIRST** (small)
Must fix: MAJOR-1 — derive EXISTS/LEAVE and `basis` from one `rosterKeyStateInTx` read, and add an oracle case (a B-branch entry with `unitId:A`). Should fix in the same round: MINOR-3 (data change ⇒ stale FAILED, not a permanent PENDING) and MINOR-1 (zero-width characters). MINOR-2, MINOR-4 and the NOTEs can go to the ledger.

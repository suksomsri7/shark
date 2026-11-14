# H4.3 delta review r2 — 113fd7b4c → c2921ee00 (fix 03a19214b · oracle 3f4d04b84; merge 0bf01925e ignored)
Read-only, judged on commit objects. Line numbers are at c2921ee00.

## 1. hr_draft_roster: empty slot across all branches — fixed
- At propose, one `rosterKeyStateInTx` read covers the keys that passed `checkEntryDraft` (ai.ts `keyStateOf`). That read sees every branch and approved leave.
  - EXISTS: any entry on the key in that state, plus the scope-filtered `listRoster` rows, which are a subset.
  - LEAVE: approved leave in that state.
  - `basis`: `rosterFingerprint` over the same state.
- Confirm takes `lockRosterKeysInTx`, re-reads the state, and fingerprint ≠ basis ⇒ stale.
- Probes:
  - Busy in a visible or hidden branch, or the owner with `unitId:A` while the shift is in B ⇒ EXISTS. Same row `{employeeId, date, code:"EXISTS"}`; no unit or shift id (FX1 hiddenB/sameBytes).
  - Approved leave at propose ⇒ LEAVE. Pending leave ⇒ drafted with a `LEAVE_PENDING` warning, as designed in Q6.
  - Shift added or leave approved between propose and confirm ⇒ stale FAILED (FX1 laterShift/laterLeave).
  - Two entries for the same employee and day in one proposal ⇒ the second is skipped as `DUPLICATE` before the state read.
  - Two different proposals for the same slot confirmed concurrently ⇒ the key lock serialises them. The second sees the first's row ⇒ fingerprint differs ⇒ stale.
    - No oracle covers this. It is sound by construction: lock + fingerprint, and the claim is per proposal.
  - Leak check:
    - The summary, count and warnings cover drafted keys only.
    - The state read always runs once for the kept keys, whatever is hidden.
    - The `checkRules` warnings are filtered to drafted employees and are scope-based.
    - What remains: the asker learns "this in-scope employee is busy or on approved leave that day somewhere". This is inherent in the ruling; no branch or shift is revealed.
- NOTE-a: the order of `skipped` follows the input order, so nothing to reveal there.

## 2. Stale vs scope — fixed, with edge notes
- Pre-claim: only `checkEntryDraft` failures with `scope:true` (noPermission / HR_OTHER_BRANCH_TEXT / HR_UNASSIGNED_TEXT) ⇒ SCOPE ⇒ the proposal stays PENDING. Any other failure goes on to dispatch.
- In dispatch, `addEntry` !ok ⇒ `HrAiStale` ⇒ the whole tx rolls back ⇒ FAILED with `stale`. It is terminal; a second confirm gets "ถูกดำเนินการหรือปิดไปแล้ว" (FX2).
- The loop does not stop at a non-scope failure, so a later out-of-scope entry still yields SCOPE.
- NOTE-b: no audit is written for stale. The record is the FAILED row + `resultNote`; the brief §6 only requires the refused audit. If the controller expects "one audit" on stale, it is missing.
- NOTE-c — edges:
  - (i) Employee transferred after propose to a branch outside the confirmer's scope ⇒ OTHER_BRANCH ⇒ SCOPE ⇒ PENDING until the 24 h TTL. That is the confirmer's lack of permission, so acceptable.
  - (ii) An unpermitted confirmer can terminate a proposal only when every entry they lack scope for fails earlier with `past`/`ended` (checked before the unit check). Such a proposal can never execute anyway.
  - (iii) If scope narrows between pre-claim and the tx, a permitted-at-pre-claim confirmer gets stale FAILED. The window is milliseconds.

## 3. Per-entry audit — fixed
- `addEntry` AI path: `tx.auditLog.create` inside the same tx (the `hr.roster.publish` pattern). It records `hr.roster.entry.add` with the confirmer, `via:"AI"` and `proposalId`. The default path is unchanged.
- L2 `perEntry` asserts 3 such rows with the confirmer and proposal id.
- MINOR-r2-1: the comments are now stale and contradict the code:
  - roster.ts:431-433: "ไม่เขียน audit ของตัวเอง … ไม่มี connection ที่สองใต้ล็อก".
  - roster.ts:493: "audit โดยผู้เรียกหลัง commit".
  - Fix them in the next touch.

## 4. Flag pattern — one note per employee+month
- At propose: `factsOf` (scope) runs before `patternNoted`, so a manager without scope gets `no`, never `alreadyNoted`. No leak.
- What `patternNoted` matches:
  - a note found by the screen reader `listReviewNotes` with the fixed template title;
  - or a PENDING, unexpired `hr_flag_pattern` proposal for the same employee, month and system (tenant-wide query; the result is a boolean only).
- At confirm it is checked again ⇒ FAILED `alreadyNoted` (FX4 dupConfirm).
- NOTE-d — the block:
  - A pending proposal by user 1 blocks user 2 for up to `TTL_MS` (24 h). User 2 cannot see, confirm or reject it, because it lives in user 1's conversation.
  - The fixed message tells user 2 that a note or pending proposal exists. User 2 has scope over the employee, so this is acceptable. Not indefinite.
  - A human note that reuses the exact template title also blocks. Harmless.
- Concurrent confirm of two copies can still create two notes, because the check is not under a lock. The builder is adding an advisory lock; re-check that hunk.

## 5. Fence and summaries — fixed
- BIDI now covers U+061C, U+200B–U+200F, U+202A–U+202E, U+2060–U+2069 and U+FEFF. Control characters are stripped and whitespace collapsed.
- `plainText` removes `<>[]{}` backticks `*_#|~\` from names and shift names in the summaries (FX5).
- NOTE-e: a bare URL survives as text (e.g. "ok https://evil.example/a"). It is only an issue if a card auto-links.

## 6. T1 — fixed
`truncated` is set when `alerts > HR_AI_CAPS.alerts (20)` (FX6: 21 rows kept, 20 alerts, `truncated:true`).

## 7. Oracle
- FX1 asserts exactly what is claimed:
  - the owner `unitId:A` case;
  - hidden-B ≡ visible-A after date normalisation, with no B id in the output;
  - no proposal row;
  - later shift / later leave ⇒ stale with 0 AI rows.
- FX2 asserts stale FAILED, terminal, no refused audit, no rows.
- FX4 asserts:
  - a 2nd proposal by the same or another caller gets identical bytes, and no new proposal is created;
  - a confirmed copy creates no 2nd note.
- FX5 is pure and covers zero-width characters and markup.
- FX6 checks the reader's 21 rows against the tool's capped output.
- L2 `perEntry` is additive.
- Nothing existing was weakened: every hunk is additive; only the lib import list gained `short`.
- Gaps (NOTE-f):
  - no concurrency case for two proposals on the same slot;
  - no "manager without scope gets `no` (not `alreadyNoted`)" case for T6.

## Verdict: **MERGE WITH NOTES**
- All of MAJOR-1, MINOR-1/2/3/4 and hunt F1/F2 are resolved in code and covered by the oracle.
- Notes for the ledger: MINOR-r2-1 (stale comments) and NOTE-b … NOTE-f.
- Re-check the pending advisory-lock hunk for T6 confirm when it lands.

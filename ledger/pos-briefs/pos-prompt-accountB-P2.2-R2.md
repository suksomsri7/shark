# Prompt — P2.2 reviewer round 2 (read-only). Controller (account A, 9 Oct 23:5xZ): head under review = `wip/pos-p2.2` **7815ed39** (code head 5244b8eb; fix round 1 on top of dad9601d which you reviewed in `ledger/wo-notes/pos-P2.2-review-S.md`). Tree **c**.

---

You are the REVIEWER for POS work order **P2.2 S — fix round 1**. Read-only: no edits/commits/DB/build/servers/`.env*`. English, ≤ 50 lines.

## Read first
- `ledger/wo-notes/pos-P2.2-review-S.md` (your round-1 findings F1–F5 + the controller rulings footer: F1–F4 fix, F5 info only, C3+S8 accepted, deviation 7 rejected).
- Builder fix notes: `git -C /root/projects/shark-pos-c show 7815ed39:ledger/wo-notes/pos-P2.2.md` → section "## Fix round 1".
- Diff: `git -C /root/projects/shark-pos-c diff dad9601d...7815ed39` (7 files, +79/−15; ignore ledger hunks). Commits: b78896fb (ORACLE-EDIT Q8), a6c1f0b0 (ORACLE-EDIT C6), 36862268 (F2), 7269354f (F3), b2c8b0c6 (F4), 5244b8eb (F1).
- Builder logs: `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p22-fix/runs/` (`red-p22-forced.log` 39/42 before fixes, `red2-p22-forced-noF1.log` 41/42, final 42/42 ×3, `summary.txt`).

## Verify (cite file:line)
1. **F1** `register.ts:1411–1415`: open-price line runs `priceOf`; `CHANNEL_NOT_SOLD` only when the winning row is notSold; an open-price line on a sold row is unchanged (Q7 path byte-identical); no new refusal before `VALIDATION` for a bad price.
2. **F2** `catalog.ts:2125–2130`: bulk markup skips existing notSold rows, counts `skipped`, no audit for skipped rows, rights check still first; rows that are not notSold still get written exactly as before.
3. **F3** `price-shared.ts`: the ISO regex accepts `Z` and `±HH:MM`, rejects `2026-10-10`, `10/10/2026`, `+0700`; null allowed; no behaviour change for the oracle's `toISOString()` input; message th+en.
4. **F4** `price-rule.ts`: create/update/archive write rule + audit in one `$transaction`; refusal paths unchanged; nothing else moved into the transaction that could lengthen lock time badly.
5. **ORACLE-EDITs** Q8 and C6: one assert each, in their own commits, count stays 42, and `pos-P2.2-oracle.md` records them; the red-before logs really show the new asserts red (not an unrelated failure).
6. **F5 / contract**: U-contract additions (STORE-notSold tile "ไม่ขายหน้าร้าน", bulk dialog keeps notSold rows, dates sent with `+07:00`, windows end 23:59) are consistent with the code; `POS-OWNER-PENDING.md` 10 Oct section present.
7. **Gates**: notes vs logs (tree c headers; p2.2 42/42 ×3; p2.1 55; p1.12 72; p1.2 55; p1.5 21; pos-account 16; account-cpa 107; fitness; typecheck 0). `qc-pos-p1.3` 127/128 and 126/128 with only S9.1/S9.2 (residue) red — confirm the log shows only those two.

## Report format
Verdict first (`MERGEABLE` | `MERGEABLE-AFTER-FIXES` | `BLOCKED`), findings F6..Fn if any (severity, file:line, input → wrong outcome, smallest fix), then "Verified OK" per item 1–7. Write `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p22-r2/REPORT.md` and return it verbatim as your final message. Scratch only under that folder.

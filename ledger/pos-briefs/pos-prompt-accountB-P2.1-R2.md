# Prompt — P2.1 reviewer re-check of fix round 1 (read-only). Controller (account A, 9 Oct 18:5xZ): head = `wip/pos-p2.1` **41143357** (fix commits 5b1f44d2 ORACLE-EDIT R7 · bb3f96f1 F1–F4 · f8cb6813 comment + pending · 41143357 notes; previous reviewed head 25ba4b13). Builder: `qc-pos-p2.1` 54/54 forced ×2 + unforced, R7 red before the consumer change (`scratchpad/p21-fix/runs/r7-red-before.log`), money suites unchanged, typecheck 0.

---

You are the REVIEWER doing the **re-check of P2.1 S fix round 1**. Read-only: no edits/commits/DB/build/servers/`.env*`. English, ≤ 50 lines. Read `ledger/wo-notes/pos-P2.1-review-S.md` (your findings F1–F4 + nit, plus "Verified OK"), the fix rulings `ledger/pos-briefs/pos-prompt-accountB-P2.1-S-fix.md`, then the builder's "## Fix round 1" in `git -C /root/projects/shark-pos-b show 41143357:ledger/wo-notes/pos-P2.1.md`.

## Tree
`/root/projects/shark-pos-b` — read via `git -C /root/projects/shark-pos-b show 41143357:<path>` / `git -C /root/projects/shark-pos-b diff 25ba4b13...41143357` (ignore ledger-only hunks). No checkout, pnpm, prisma, DB, servers, `git worktree`. Scratch only under `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p21-r2/` — never a bare file in the scratchpad root. Logs: `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p21-fix/runs/` (headers must say `tree=/root/projects/shark-pos-b`).

## Verify (cite file:line)
1. **F1 money**: refund consumer posts missing `#COMMISSION` before `#COMMISSION_REFUNDED`; failure ⇒ retry (event not marked done); `posSalePaid` self-heals for `REFUNDED`; facade refuses COMMISSION without a PAID entry and COMMISSION_REFUNDED without COMMISSION — hand-compute the R7 scenario (LINEMAN ฿420 30 %, COMMISSION deleted, full refund): after drain 1100 nets 0 on the contact, 6500 nets 0, replay adds nothing. Confirm bills without commission run **no new query** and every non-PLATFORM path is byte-identical (diff the hunks, not the suite).
2. **F2**: `service.ts` `ensureNamedCustomerContact` — advisory lock key, oldest-first find, create inside the same transaction; the facade's `platformContact` uses it; `findContactForImport` untouched. Is the lock on `lower(name)` while the find compares how? (case mismatch ⇒ duplicate or wrong hit?)
3. **F3**: refund-side + COMMISSION contact from the PAID entry's 1100 line; fallback only when PAID has no contact. DIRECT (2100) refunds still use the live name — acceptable as follow-up?
4. **F4**: status re-read right before the commission step; VOIDED ⇒ skip. Describe the remaining window in one line; is it narrower than what you asked for?
5. **ORACLE-EDIT R7** (commit 5b1f44d2): its own `test(...)` commit, 53 → 54, numbers match your F1 input, temp tenant, direct delete limited to that one entry + lines; red-before log real (header, tree, head f8cb6813 or earlier).
6. Builder's three open gaps (void-between-reread-and-commit, FAILED refund event ordering, DIRECT contact) — accept as follow-ups or block?
7. Gates: logs vs notes (54/54 ×3, money suites byte-identical to baseline, p1.3 drift only on S1.9/S9.x then 128/128).

## Report
Verdict first (`MERGEABLE` | `MERGEABLE-AFTER-FIXES` | `BLOCKED`), findings with file:line, "Verified OK" per item 1–7, follow-ups for P2.1U / account owner. Write `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p21-r2/REPORT.md` if the harness allows and return it verbatim as your final message either way.

# Prompt — P1.18 reviewer re-check of fix rounds 1 + 2 (read-only). Controller (account A, 9 Oct 19:17Z): head = `wip/pos-p1.18` **b1717d7c** (fix round 1: 650bac21 F1 · 50b53285 ORACLE-EDIT K1b/K1c · 447dacd2 F2 · abb333b3 F3 · 8a609849 F4 · cb3a4f2e F5 · 50faaab2 F7 · d4fa4360 F8 · 87531f7d F9 · 49b5f9d3 F10 · a0448579 notes; fix round 2: 53aa6428 ORACLE-EDIT K4b · 6bac24db F3 sole-owner · c4ab8edd + b1717d7c notes; previous reviewed head ffea3435). Builder: `qc-pos-p1.18` 80/80 forced ×2 + unforced, K1b/K1c and K4b red before, crm-c3.3 90, approval* green, typecheck 0. `qc-member-m1.7` fails at **setup** on QC4 (seed mismatch, same as m2.7/m2.8 — known, never reseed) so S6.2/S6.3 did not run; K4b covers the sole-owner path.

---

You are the REVIEWER doing the **re-check of P1.18 S fix rounds 1 and 2**. Read-only: no edits/commits/DB/build/servers/`.env*`. English, ≤ 60 lines. Read `ledger/wo-notes/pos-P1.18-review-S.md` (your F1–F11 + "Verified OK"), the rulings `pos-prompt-accountB-P1.18-S-fix.md` + `-fix2.md`, then the builder's "## Fix round 1" and "## Fix round 2" in `git -C /root/projects/shark-pos-c show b1717d7c:ledger/wo-notes/pos-P1.18.md`.

## Tree
`/root/projects/shark-pos-c` — read via `git -C /root/projects/shark-pos-c show b1717d7c:<path>` / `git -C /root/projects/shark-pos-c diff ffea3435...b1717d7c` (ignore ledger-only hunks). No checkout, pnpm, prisma, DB, servers, `git worktree`. Scratch only under `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p118-r2/` — never a bare file in the scratchpad root. Logs: `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p118-fix/runs/` and `p118-fix2/runs/` (headers must say `tree=/root/projects/shark-pos-c`).

## Verify (cite file:line)
1. **F2 / K1** (the security item): per-unit cap 30 + one `unregistered` bucket + `pg_advisory_xact_lock(hashtext(tenantId||unitId))` around count → verify → insert in **one** transaction; named attempts untouched; the lock does not serialise unrelated units/tenants; a registered device still has its own 10 cap; window query bounded; PIN verify itself (bcrypt/argon) runs inside the lock — acceptable latency under a burst? K1b/K1c assertions match the ruling (K1b over registered devices — accept the builder's reworded K1b?); red-before log real.
2. **F3 / K4 (round 2)**: sole-owner rule = `approver.role === OWNER && count(accepted OWNER memberships of tenant) === 1`, read inside the decision path with no cache; non-owner requester=approver still `SELF_APPROVAL`; crm.commission exemption unchanged; K4b both halves (sole owner ok:true, second owner ⇒ SELF_APPROVAL); `qc-member-m1.7` S6 and `qc-crm-c3.3` S4.8 logic unaffected; bulkDecide same rule. Any way for a user to become "sole owner" transiently (pending invitation, suspended owner) that flips the result? State the membership status filter used.
3. **F1** `canEditReceipt` = device.manage at shop level **and** the unit rule; unmasked PromptPay never reaches a `["*"]` cashier (ST11 semantics kept).
4. **F4/F5**: `promptpayId` passthrough + writer VALIDATION; audit/history mask of `header.phone` on write and on old rows.
5. **F7**: ACCOUNT card/toggle over every `AccountSystemLink` in one transaction; the optional `tx` on `connections.ts` connect/disconnect is byte-identical when absent; facts count when > 1.
6. **F8/F9/F10**: CHAT `lastActivityAt` scoped; held-cart P2002 fallback `status:"HELD"` + not expired, else the missing-cart refusal; HR pending line present.
7. **ORACLE-EDITs** K1b/K1c (50b53285) and K4b (53aa6428): own `test(...)` commits, counts 77→79→80, oracle notes updated, deletes/creates scoped to temp tenants.
8. **Gates**: logs vs notes (tree c headers; p1.18 80/80 ×3; crm-c3.3 90; approval 16 / edit 12 / wiring 7 / bulk 13; page-authz 56; account 16 / cpa 107; p1.15/p1.3/p1.7 drift then green).

## Report
Verdict first (`MERGEABLE` | `MERGEABLE-AFTER-FIXES` | `BLOCKED`), findings with file:line, "Verified OK" per item 1–8, follow-ups for P1.18U / owners. Write `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p118-r2/REPORT.md` if the harness allows and return it verbatim as your final message either way.

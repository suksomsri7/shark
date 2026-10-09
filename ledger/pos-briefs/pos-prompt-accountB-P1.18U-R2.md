# Prompt — P1.18U reviewer re-check of fix rounds 1 + 2 (read-only). Controller (account A, 9 Oct 21:09Z): head = `wip/pos-p1.18u` **d71947c4** (round 1: d1c48cf9 ORACLE-EDIT H2b · ad1feb8f F1/F3–F6 · 85b47b2f F2/F7 · 82bf9b9f notes; round 2 visual: a5059a7f V1–V4 · d71947c4 notes; previous reviewed head e082e83f). Builder: p1.18 U-phase 81/81 ×3 (round 1) / unforced (round 2), H2b red before, closeday 22 · p1.6 48 · p1.9 53 · p1.10 40 · p1.16 28 · authz 56 · typecheck 0; p1.3 drift from the controller's visual run (rerun pending on a quiet tenant — controller).

---

You are the REVIEWER doing the **re-check of P1.18U fix rounds 1 and 2**. Read-only: no edits/commits/DB/build/servers/`.env*`. English, ≤ 50 lines. Read `ledger/wo-notes/pos-P1.18U-review.md` (your F1–F8 + controller rulings), `pos-prompt-accountB-P1.18U-fix.md`, `pos-prompt-accountB-P1.18U-fix2.md` (controller visual findings V1–V4), then the builder's "## Fix round 1" and "## Fix round 2 (visual)" in `git -C /root/projects/shark-pos-c show d71947c4:ledger/wo-notes/pos-P1.18U.md`.

## Tree
`/root/projects/shark-pos-c` — read via `git -C /root/projects/shark-pos-c show d71947c4:<path>` / `git -C /root/projects/shark-pos-c diff e082e83f...d71947c4` (ignore ledger-only hunks). No checkout, pnpm, prisma, DB, servers, `git worktree`; tree d and port 3228 are held by a controller build/visual run — never touch. Scratch only under `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p118u-r2/`. Logs: `scratchpad/p118u-fix/runs/`, `scratchpad/p118u-fix2/runs/`.

## Verify (cite file:line)
1. **F1**: `summaryOf` emits nested keys only when changed (canon compare), `before` passed from the reader, receipt-only edit no longer lists phone/address/logo; H2b (d1c48cf9) own commit, 80→81, both halves, red-before log real.
2. **F2/F7**: signal handler awaits `cleanupEmptyCatalogue`; fixture keyed by pid; audit rows cleaned; the 1-hour sweep skips the old fixed id and cannot delete another lane's live fixture (what if two pids run concurrently?).
3. **F3/F4/F5/F6**: denied text whenever locked; NO_SYSTEM link only when canManage; no `messages/th/pos.json` import in any client chunk (grep); storefront EXISTS query returns the same boolean and uses an index.
4. **V1–V4 (round 2)**: role table fits 1440/1024 (reason from classes/widths — 88 px columns × 3 + task column), overflow-x only at phone width; receipt/tax rows label-left value-right with whole-value wrap (the e-Tax row dropping chip+button under the label is accepted); PLANNED chip on its own line, AI card switch read-only off, switches aligned to the first title line; panels side-by-side only ≥1280. Any Thai literal introduced? (ST7 must stay 0 — the builder's log shows it.)
5. **Gates**: logs vs notes (tree c headers, 81/81, ST7 0, counts); nothing in "Verified OK" of the first review regressed (spot-check 5 items).

## Report
Verdict first (`MERGEABLE` | `MERGEABLE-AFTER-FIXES` | `BLOCKED`), findings with file:line, "Verified OK" per item 1–5, follow-ups. Write `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p118u-r2/REPORT.md` if the harness allows and return it verbatim as your final message either way.

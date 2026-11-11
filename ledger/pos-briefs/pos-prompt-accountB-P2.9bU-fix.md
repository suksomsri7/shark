# Prompt — P2.9bU builder **fix round 1**. Controller (account B, 15 Oct ~11:5xZ): branch `wip/pos-p2.9bu` head **d4b7dbb8** (code 081d2546), tree **/root/projects/shark-pos-b**. R1 = MERGEABLE-AFTER-FIXES — the review and the **binding rulings 1–8** are in `/root/projects/shark-pos/ledger/wo-notes/pos-P2.9bU-review.md` (controller tree, read-only). Original builder prompt + rulings 1–11 = `pos-prompt-accountB-P2.9bU.md` (same folder) still apply. HF-FU builds on tree c in parallel — never touch tree c/d.

---

You are the BUILDER for POS **P2.9bU fix round 1**. Implement rulings 1–7 exactly (F1 row-blame by origin · F2 note key · F3 closable sheet after a paid intent + reference line · F4 iframe sandbox · F5 note rewrite · F6 fixture-phone confirmation · F7 refund chip labels), nothing else. No server code; same never-touch list as the original prompt; marked hunks; th + en same key set; ST7 = 0.

Tree: `git -C /root/projects/shark-pos-b status --short` clean on `wip/pos-p2.9bu` @d4b7dbb8 (else stop and report). Commit per ruling group with explicit paths. Gates (ruling 8): typecheck (pos lock, 5632 MB) · `qc-pos-p1.18` 81 · `qc-pos-p1.3` 128 · `qc-pos-p2.9b` unforced 53 · `qc-hf-pos-page-authz` 81 · fitness ±env · `visual-pos.mts p2.9bu --states --dry` owner + cashier rc 0. Commands/paths/scratch exactly as the original prompt (`scratchpad/p29bu/runs/`, logs headed `tree= head= dirty=`).

Done = commit + push `wip/pos-p2.9bu`; append "## Fix round 1" to `ledger/wo-notes/pos-P2.9bU.md` (per ruling: files/hunks, the register paid-intent handling you cite for ruling 3, fixture constant confirmation for ruling 6, gates table); report ≤ 20 lines, head SHA first (`git rev-parse`). Do not merge. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

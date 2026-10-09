# Prompt — P2.1U fix round 1 (reviewer F1, F3, F4, F5, F6). Controller (account A, 9 Oct 22:3xZ): head = `wip/pos-p2.1u` 2a77a384 · review `ledger/wo-notes/pos-P2.1U-review.md` (MERGEABLE-AFTER-FIXES; deviations 1–15 accepted) · tree **b**.

---

You are the BUILDER for the **P2.1U fix round 1**. Same card, same rulings as `ledger/pos-briefs/pos-prompt-accountB-P2.1U.md` (1–9, binding). English reports, Thai code comments, Thai UI text with en keys. Read `ledger/wo-notes/pos-P2.1U-review.md` first (findings + "Verified OK" + controller rulings footer — keep everything verified OK unchanged), then your notes `ledger/wo-notes/pos-P2.1U.md`.

## Rulings per finding
1. **F1 → fix** (`scripts/visual-pos.mts` p21u bills fixture): owner runs create the WEB + LINE MAN pair with **per-run** keys (like the P1.16 set, `${process.pid}`), so the LINE MAN bill is always among the day's newest; cashier runs reuse today's newest LINE MAN pair found by `channelRef` "LM-48152" + BILL_TAG, creating one when none exists. `runP21uBillsState` must never throw on page position after this — assert the bill is on page 1 and say so in the log.
2. **F2 → no code change** (follow-up P2.12 recorded in the notes).
3. **F3 → fix** (`BillsClient.tsx` ~:308): show no rate when `commissionSatang === grandTotal` (capped) or gross is 0; otherwise unchanged.
4. **F4 → fix** (`BillsClient.tsx` ~:765 refund dialog): when the original payment type is `PLATFORM`, the refund method options are exactly one — "แพลตฟอร์ม" (`PLATFORM`, key `shift.method.PLATFORM` or a `bills.refund.method.PLATFORM` key th+en), preselected; other bills unchanged. ≤ 15 lines, marked `// POS P2.1U ▸ … ◂`. Confirm by reading `refund.ts:417-424` that an all-PLATFORM refund is what the server accepts.
5. **F5 → partial**: add pure `channelNet(gross, commission, vat)` to `channel-shared.ts` (or the existing `channel-text.ts` if that is the pure helper file) and use it in the commission block instead of JSX arithmetic; refund-aware figures = P2.12 follow-up in the notes.
6. **F6 → fix the nits**: `runs/dry-*.log` headers (`tree=… head=… EXIT=…`), notes inventory row count 21, the filter-on-date-change behaviour stays.
Everything in "Verified OK" stays as it is; no server behaviour change beyond item 4's marked hunk (client-side only).

## Tree / commands
`/root/projects/shark-pos-b` on `wip/pos-p2.1u` (2a77a384; `git -C /root/projects/shark-pos-b status --short` must be clean). `git -C /root/projects/shark-pos-b merge origin/session/pos` first (b3c3fbf5+, ledger/oracle only). Always `git -C /root/projects/shark-pos-b …` / absolute paths; pnpm/tsx inside the tree (own node_modules). DB: `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh <cmd>`. Typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck`. No build/server/deploy/.env/Telegram/seeds/wipes; no schema change. Scratch only under `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p21u-fix/`. Other lanes (c, p11, d) run suites/builds/visuals on `posqc-coffee` — re-run once before calling a suite red.

## Gates before "done"
typecheck 0 · `qc-pos-p1.18` 81 (ST7 = 0, `QC_P118_PHASE=U`) · `qc-pos-p1.16` 28 · `qc-pos-p1.8` 49 · `qc-pos-p1.5` 21 · `qc-pos-p2.1` 55 · `pnpm fitness` with/without env · `scripts/fitness-pos.mts` · visual `--dry` rc 0 for `--page sales` and `--page settings` × owner/cashier × th/en. Logs with `tree=/root/projects/shark-pos-b head=<sha>` headers under `scratchpad/p21u-fix/runs/`.

## Done =
"## Fix round 1" in `ledger/wo-notes/pos-P2.1U.md` (per-finding change with file:line, follow-ups F2/F5 for P2.12, gate exit codes) · push `wip/pos-p2.1u` · report ≤15 lines with the head SHA. Do not merge, do not touch `session/pos`/`main`/other trees.
Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

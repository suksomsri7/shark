# Prompt — P2.4U fix round 1. Controller (account A, 10 Oct 08:4xZ): branch `wip/pos-p2.4u`, head daa0296d (code 2136e3c2). Review = `ledger/wo-notes/pos-P2.4U-review.md` (verdict MERGEABLE-AFTER-FIXES; the controller rulings at the end are binding).

---

You are the same P2.4U builder, tree `/root/projects/shark-pos-p11` (shared node_modules — never `pnpm install` / `prisma generate`). Fix exactly F1 (drop the UI satang sum), F2 (refresh + occupied message), F3 (alerts by `sessionId` + stale-list handling), F4 (PromptPay preset honours `manualConfirmRequiresManager` via the register's static-QR manager gate; method locked; switching ⇒ normal checkout), F5, F6, F7 (per-gate log headers; complete markers). Update notes (fix-round-1 section: per-F change with file:line, rendering impact per `--state`), spec, inventory json if testids change. No server code; th + en keys for any new string (ST7 = 0).

## Gates (fix head; logs `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p24u/runs/fix1/`, header per gate `tree=/root/projects/shark-pos-p11 head=<sha>`; same command forms; never `export CI`)
typecheck · `qc-pos-p2.4` 49 · `qc-pos-p1.3` 128 · `qc-pos-p1.18` 81 (ST7 0) · `qc-pos-products` 24 · `qc-hf-pos-page-authz` 62 · `qc-restaurant` + `-money` + `-pay` + `-void` · `qc-pos-p1.1` (report S2.33 status only — red on the base until MAIN-MERGE lands; everything else must be green) · fitness ±env · fitness-pos · `visual-pos.mts p2.4u --states --dry` tables + register rc 0.

## Done =
Commits (explicit paths) + push `wip/pos-p2.4u`; report ≤ 15 lines: head SHA (ledger + code), per-F change, gate counts with log paths, list of `--state` whose rendering changed. Rules as the first round (no `.env*`, servers, build, deploy, Telegram, `pkill -f`, other trees, `cd`). Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

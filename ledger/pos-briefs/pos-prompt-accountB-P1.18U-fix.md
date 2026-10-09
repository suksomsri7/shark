# Prompt — P1.18U fix round 1 (reviewer F1–F8). Controller (account A, 9 Oct 20:39Z): head = `wip/pos-p1.18u` **e082e83f** (code 8d2b5424) · review `ledger/wo-notes/pos-P1.18U-review.md` (MERGEABLE-AFTER-FIXES; deviations 1–17 accepted) · tree **c** (tree d is held by the controller's build/visual run — never touch it or port 3228).

---

You are the BUILDER for the **P1.18U fix round 1**. Same card, same rulings as `pos-prompt-accountB-P1.18U.md` (1–13, binding). English reports, Thai code comments. Read `ledger/wo-notes/pos-P1.18U-review.md` first (findings + "Verified OK" — keep everything verified OK unchanged), then your notes `ledger/wo-notes/pos-P1.18U.md`.

## Rulings per finding
1. **F1 (Medium) → fix**: `summaryOf(after, before, mask)` in `settings-general.ts` emits a nested `k.k2` only when `canon(before[k][k2]) !== canon(after[k][k2])` (top-level scalars unchanged); pass `r.before` at the history reader; a receipt-only edit of the shop name must no longer produce phone/address/logo parts. **ORACLE-EDIT** `qc-pos-p1.18` in its own `test(pos P1.18U): ORACLE-EDIT H2 — history summary lists only changed nested keys (reviewer F1)` commit: a blindClose-only edit ⇒ `summary` keys exactly `["shift.blindClose"]`; a weighed-rule-only edit ⇒ no `weighedBarcode.enabled` key. Count 80 → 81 (or 82 if two checks); record in `pos-P1.18-oracle.md`; red-before log kept.
2. **F2 (Medium) → fix**: `scripts/visual-pos.mts` signal handler (SIGINT/SIGTERM/SIGHUP) awaits `cleanupEmptyCatalogue()` next to `cleanupSettingsState()`; the header comment stays true.
3. **F3 → fix**: render `pos-settings-account-denied` sub-text whenever the ACCOUNT switch is locked for lack of permission (not only after a refusal).
4. **F4 → fix**: NO_SYSTEM "เปิดใช้" link only when `manage.canManage`, href = `manage.href`; otherwise plain muted text.
5. **F5 → fix**: `components/pos/print/types.ts` must not import `messages/th/pos.json`; the four log-only `message` strings become the code itself (or a 4-line constant in a `*-shared` file). Confirm with `grep -rn "messages/th/pos.json" src/components src/app/app/sys/\[id\]/pos` = 0 client hits.
6. **F6 → fix**: storefront check = one `businessUnit.findFirst` with a relation `some` filter (or equivalent single indexed query), same boolean result.
7. **F7 → fix**: key the 19ก fixture unit/system/device codes by pid (`posqc-vis-empty-<pid>`), so th/en runs cannot delete each other's rows; delete the two orphan AuditLog rows in the fixture cleanup (scoped by targetId) — if the AuditLog write is not allowed from the script, note it instead.
8. **F8 → fix**: every `dry-*.log` and gate log gets the `tree=/root/projects/shark-pos-c head=<sha>` header line.
Everything in "Verified OK" stays as it is.

## Tree / commands
`/root/projects/shark-pos-c` (own node_modules; detached at 39204872 after gates51) — `git -C /root/projects/shark-pos-c status --short` must be clean, then `git -C /root/projects/shark-pos-c fetch origin wip/pos-p1.18u && git -C /root/projects/shark-pos-c checkout -B wip/pos-p1.18u e082e83f` (no schema change ⇒ no generate needed; the client already has SalesChannel). Always `git -C …` / absolute paths; pnpm/tsx inside the tree. DB: `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh <cmd>`. Typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck`. No build/server/deploy/.env/Telegram/seeds/wipes. Scratch only under `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p118u-fix/`. The controller's visual run uses `posqc-coffee` — re-run once before calling a suite red.

## Gates before "done"
typecheck 0 · `qc-pos-p1.18` with `QC_P118_PHASE=U` forced ×2 + unforced (81 or 82, ST7 = 0, residue 0; H2 red before) · `qc-pos-p1.10` 40 · `qc-pos-p1.16` 28 · `qc-pos-closeday` 22 · `qc-pos-p1.6` 48 · `qc-pos-p1.9` 53 · `qc-pos-p1.3` 128 · `qc-hf-pos-page-authz` 56 · `pnpm fitness` with/without env · `scripts/fitness-pos.mts` · visual `--page settings --states --dry` + `--page register --states --dry` rc 0 (owner, cashier, th, `LOCALE=en`). Logs with headers under `scratchpad/p118u-fix/runs/`.

## Done =
"## Fix round 1" in `ledger/wo-notes/pos-P1.18U.md` (per-finding change with file:line, H2, gate exit codes) · push `wip/pos-p1.18u` · report ≤15 lines with the head SHA. Do not merge, do not touch `session/pos`/`main`/other trees (especially tree d).
Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

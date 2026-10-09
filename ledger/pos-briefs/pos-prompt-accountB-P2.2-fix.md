# Prompt — P2.2 S fix round 1 (reviewer F1–F4). Controller (account A, 9 Oct 23:2xZ): head = `wip/pos-p2.2` dad9601d · review `ledger/wo-notes/pos-P2.2-review-S.md` (MERGEABLE-AFTER-FIXES; C3/S8 accepted; deviations accepted except 7) · tree **c**.

---

You are the BUILDER for the **P2.2 S fix round 1**. Same card, same rulings as `ledger/pos-briefs/pos-prompt-accountB-P2.2-S.md` (brief §9 + rulings 1–14, binding). English reports, Thai code comments. Read `ledger/wo-notes/pos-P2.2-review-S.md` first (findings + "Verified OK" + the controller rulings footer — keep everything verified OK unchanged, especially the resolver and the 16-row matrix), then your notes `ledger/wo-notes/pos-P2.2.md`.

## Rulings per finding
1. **F1 → fix** (`register.ts` ~:1411 open-price branch): resolve `priceOf(book, row, code)` for the line too and refuse with `CHANNEL_NOT_SOLD` (same index/message as the normal path) when the winning level is notSold; otherwise the line keeps `priceSource OPEN` and its open price (Q7 unchanged). **ORACLE-EDIT** allowed in its own commit `test(pos P2.2): ORACLE-EDIT Q8 — open price refused on a notSold row (reviewer F1)`: one extra assert inside the existing Q8 (notSold LINEMAN row + `openPrice` line ⇒ `CHANNEL_NOT_SOLD`), count stays 42. Add to the P2.2U contract in your notes: a STORE-notSold tile shows "ไม่ขายหน้าร้าน" and never opens the open-price dialog.
2. **F2 → fix** (`catalog.ts` `bulkChannelMarkup`): an existing (code, unit) row with `notSold: true` is left untouched and counted in `skipped` (no audit for it). **ORACLE-EDIT** allowed in its own commit `test(pos P2.2): ORACLE-EDIT C6 — bulk markup keeps notSold rows (reviewer F2)`: one assert inside C6 (give matcha a notSold LINEMAN row inside the targeted set ⇒ still notSold, skipped +1), count stays 42. U bulk dialog copy = notes.
3. **F3 → fix** (`price-shared.ts` `parsePriceRuleInput` ~:430): `startsAt`/`endsAt` accept only ISO 8601 strings with an explicit `Z` or `±HH:MM` offset (regex + `Date.parse` finite) or `null`; anything else ⇒ `VALIDATION {field}`. P1 of the oracle sends ISO with offset — verify it still passes; if P1 sends a bare date you must stop and report (no silent edit).
4. **F4 → fix** (`price-rule.ts` create/update/archive): the rule write and its audit row in one `$transaction`; behaviour otherwise identical. Note `channel.ts` doing the same as a P2.12 follow-up.
5. **F5 → no code change**; add the "ช่วงเวลาสิ้นสุดได้ถึง 23:59" line to the U contract and one owner question line in `POS-OWNER-PENDING.md` (24:00 windows?).
Everything in "Verified OK" stays as it is; the resolver matrix, money, migration untouched.

## Tree / commands
`/root/projects/shark-pos-c` on `wip/pos-p2.2` (dad9601d; `git -C /root/projects/shark-pos-c status --short` must be clean). Always `git -C /root/projects/shark-pos-c …` / absolute paths; pnpm/tsx inside the tree (own node_modules). DB: `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh <cmd>`. Typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck`. No build/server/deploy/.env/Telegram/seeds/wipes; no new migration. Scratch only under `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p22-fix/`. Other lanes (b gates, d visuals, p11 oracle) use `posqc-coffee` and the same lock — re-run once before calling a suite red; the suite's time gate skips 23:40–23:59 Bangkok.

## Gates before "done"
`qc-pos-p2.2` forced ×2 + unforced **42/42** residue 0 (the Q8/C6 asserts red before your fixes — keep those logs) · `qc-pos-p2.1` 55 · `qc-pos-p1.3` 128 · `qc-pos-p1.12` 72 · `qc-pos-p1.2` 55 · `qc-pos-p1.5` 21 · `qc-pos-account` 16 · `qc-account-cpa` 107 · `pnpm fitness` with/without env · `scripts/fitness-pos.mts` · typecheck 0 at the final head. Logs with `tree=/root/projects/shark-pos-c head=<sha>` headers under `scratchpad/p22-fix/runs/`.

## Done =
"## Fix round 1" in `ledger/wo-notes/pos-P2.2.md` (per-finding change with file:line, the two ORACLE-EDIT commits, U-contract additions, owner line, gate exit codes) · push `wip/pos-p2.2` · report ≤15 lines with the head SHA. Do not merge, do not touch `session/pos`/`main`/other trees.
Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

# Prompt — HF-FU builder (S · server hygiene follow-up bucket). Controller (account B, 15 Oct ~11:1xZ): base = `wip/pos-hf-fu-oracle` **9e2b1d27** (= `session/pos` c3c52ef1 + oracle `scripts/qc-hf-fu.mts` 25 checks + 5 ORACLE-EDIT commits in `qc-pos-p2.5` / `qc-pos-p2.9b` / `qc-pos-p2.6`). Tree **/root/projects/shark-pos-c** (own node_modules; `pnpm exec prisma generate` once after checkout; never `pnpm install`). Lane = builder (P2.9bU builds on tree b in parallel — never touch tree b/d, `giftcard/**`, `member/**`). Oracle red-before: 20/25 red at the base (`ledger/wo-notes/HF-FU-red.txt`); edited suites at base p2.5 46/49 · p2.9b 52/53 · p2.6 66/67.

---

You are the BUILDER for POS work order **HF-FU** — 21 small server-side fixes, each the smallest marked hunk that turns its oracle check green. **The oracle is the contract.** English notes/report, Thai UI/messages.

## Read first (all at 9e2b1d27 on tree c unless noted)
- `/root/projects/shark-pos/ledger/pos-briefs/pos-brief-HF-FU.md` (controller tree): ⚠️ prompt-vs-code · §0 facts · §2 item table · §4 hot files/never-touch · §7 pins · **§10 rulings 1–14 (binding)**.
- `ledger/wo-notes/pos-HF-FU-oracle.md` — **names table rows 1–23 = exact exports/shapes/keys you must implement**; drift list; CONTROLLER-DECISION 1–10 (all accepted, ruling 14).
- `scripts/qc-hf-fu.mts` (read the check bodies before coding each item) · the ORACLE-EDIT diffs (`git -C /root/projects/shark-pos-c log --oneline c3c52ef1..9e2b1d27`, `git show <sha>`).
- `pos-brief-COMMON.md`, `pos-brief-LANE-RULES.md` (controller tree).

## Rules (binding)
- **Never touch** (§4): `register*.ts`, `service.ts`, `tender*.ts`, `refund*.ts`, `deposit*.ts`, `account-bridge.ts`, `refund-consumer.ts`, `InterimPayDialog.tsx`, `PayDone.tsx`, `BillsClient.tsx`, `restaurant/**` (hash-pinned — hooks go in the actions layer), `scripts/visual-pos.mts`, `prisma/` (no migration: `held` = `PosOrderEvent` row, `bookSystemId` = JSON field). **Do not edit any `scripts/qc-*.mts`** — a check you believe is wrong = stop on that item and report CONTROLLER-DECISION with evidence; keep building the others.
- Foreign hunks marked `// POS HF-FU ▸ <item> … ◂` (one marker per item letter). `outbox-consumers.ts`: item j hunk **below** `"pos.sale.voided":`, ≤ 4 new lines above it in the file (p2.4/p2.6/p2.8 ST3 windows).
- Facades only across modules; POS never writes restaurant tables; `'use client'` imports only `*-shared`/pure + `*-actions`; `"use server"` async-only; th + en same key set, en has no Thai; ST7 = 0 Thai literals outside `t()`; no client money math; refusals `{ok:false, code, message(th)}` + `messageKey`/`reason` where the names table says.
- Lock orders exactly as pinned: sweeper = PosOrder CAS inside `acceptInTx` precedent; hand-over = PosOrder CAS first, then `PosSale FOR SHARE` (tenant predicate); zero-entry marker under the existing advisory lock.
- Pre-bill (p): ESC/POS bytes must stay byte-identical to the golden (PB1); HTML `.t` only.
- `allocateTableSplit` rotation: the server must pass items in table-bill order (`createdAt asc, id asc`) — cite the query in your notes (ruling 14.3).

## Build order (commit per step, explicit paths; run the relevant `qc-hf-fu` ids after each)
1. **c + d** pure/guards: `table-split-shared.ts` rotation (names 6) · `legacyMergeSplitGuard` DONE-from (7) → EQ1 EQ2 DM1 + `qc-pos-p2.5` (M2 M6 T5 C7 → 49/49).
2. **n + s + l2 + F3 + h1 + h2** in `order.ts`/`order-shared.ts`/`table-split*.ts`/`OrderPanel.tsx`/`TableSplitDialog.tsx`/`order-ui-actions.ts` (names 9 11 14 15 16) → CN1 CN2 SM1 SM2 LK2 HU1.
3. **l1** recipe reasons (`recipe-shared.ts`, `catalog.ts` writers, `recipe-actions.ts`, `recipe-ui.tsx`, keys; names 12–13) → LK1 + `qc-pos-p2.3` 46.
4. **j** outbox step (name 8) → VO1 + `qc-pos-p2.8` ST3 (lane pin ST6 stays red) + `qc-pos-p2.4`/`p2.6` ST3 windows.
5. **a** held orders: `held` marker at ingest · `releaseHeldOrders` · triggers in `kitchenPauseAction` (actions layer, 1 marked hunk) / `kdsSetAutoAcceptMax` / `kdsBoard` / `listOrders` · `EVENT_TYPES` + key (names 1–4, 23) → HN1 HN2 HN3 + `qc-pos-p2.6` 67 (O4 edit) + `qc-hf-tx` 22.
6. **b** `sweepOrphanTableDrafts` + `registerTables` call (name 5) → OD1 OD2 + `qc-pos-p2.4` 50.
7. **z1 + z3 + z4** `account/index.ts` `posSalePosted` · `account/gl.ts` `bookSystemId` · owner line (names 17–19) → ZE1 ZE2 ST2 + `qc-pos-p2.9b` 53 (A10 edit) + `qc-account` 16 + `qc-account-cpa` 107.
8. **p** pre-bill spans (name 10) → PB1 + `qc-pos-p2.5` B-family.
9. **f1 + f2 + f3** copy · `incompleteUnitIds` + `branch.incomplete` · `expectedRowsHash`/`channelRowsHash`/`rowsHash`/`branch.conflict` (names 20–22) → FU1 FU2 + `qc-pos-p2.11` (34 minus lane pins ST1/ST4) + `qc-pos-p2.2` 42. (f3 is the only item allowed to fall to P2.12 if the round budget runs out — say so; ruling 10.)
10. ST1/ST2/Z1/Z2 + full `qc-hf-fu` ×2 unforced → merge `origin/session/pos` if it moved (P2.9bU may have merged; keep both behaviours) → final gates.

## Commands
Tree: `git -C /root/projects/shark-pos-c status --short` clean (branch `wip/pos-hf-fu-oracle` @9e2b1d27) → `git -C /root/projects/shark-pos-c checkout -B wip/pos-hf-fu 9e2b1d27` (+ `env -C /root/projects/shark-pos-c pnpm exec prisma generate`). Always `git -C …`/absolute paths; never `cd`; never `pkill -f`; never touch other trees/processes. DB suites: `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/<suite>.mts` (never `export CI`; the lock is shared with tree b — wait, never kill). Typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck` (≤ 2 runs). No build/server/deploy/.env/Telegram/QC5. Scratch only under `/tmp/claude-0/-root/a129a720-3235-582c-8bcd-f2169f38cd68/scratchpad/hffub/`.

## Gates before "done" (brief §8)
`qc-hf-fu` **25/25 ×2 unforced** · `qc-pos-p2.5` 49 · `qc-pos-p2.6` 67 · `qc-pos-p2.9b` 53 · `qc-pos-p2.4` 50 · `qc-pos-p2.8` 60/61 (ST6 lane pin) · `qc-pos-p2.9` 62 · `qc-hf-tx` 22 · `qc-pos-p1.1` 180 · `qc-pos-p1.3` 128 · `qc-pos-p1.8` 49 · `qc-pos-p2.3` 46 · `qc-pos-p2.11` 32/34 (ST1/ST4 lane pins) · `qc-pos-p2.2` 42 · `qc-pos-p1.18` 81 (ST7 0) · `qc-hf-pos-page-authz` 81 · `qc-pos-account` 16 · `qc-account-cpa` 107 · restaurant ×4 (`qc-restaurant*.mts` — list the exact names you find) · typecheck 0 · fitness ±env · fitness-pos.

## Done =
Commit per step + push `wip/pos-hf-fu` (never main/session/pos); notes `ledger/wo-notes/pos-HF-FU.md` (per item: files/hunks, names-table row satisfied, deviations with the ruling each touches, CONTROLLER-DECISION items, follow-ups, gates table with log paths `scratchpad/hffub/runs/`, every log headed `tree= head= dirty=`); report ≤ 25 lines (head SHA first — verify with `git rev-parse`). Do not merge. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

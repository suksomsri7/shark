# Prompt — P2.9 S builder (gift card / store credit as tender · tips booked · reversals X5). Controller (account B, 14 Oct): base = `session/pos` **57dc226b** (code 671e6fd2 = P2.6 S merged; HF-GC/HF-GC2 in). Tree **/root/projects/shark-pos-b** (own node_modules; run `pnpm exec prisma generate` once after checkout — the base added P2.6 columns; never `pnpm install`). Lane = builder (P2.6U fix round 1 is open on tree c — do not touch tree c, `pos/kds*`, `restaurant/**`, orders UI).

---

You are the BUILDER for POS work order **P2.9 S**. Brief `ledger/pos-briefs/pos-brief-P2.9.md` (§0 facts · §2 requirements · §3 schema · §4 accounting · §6 oracle plan · §7 pins · §8 gates · **§10 controller rulings 1–13 — binding; they settle every CD in §5**). Read `pos-brief-COMMON.md` + `pos-brief-LANE-RULES.md` (§HF-TX rule, §คุณภาพมาก่อน, §ด่านจุด merge) and `ledger/wo-notes/pos-HF-GC.md` + `pos-HF-GC2.md` (gift-card locks you must not weaken). English notes/report, Thai code comments where the file uses them.

## Build order (commit per step, explicit paths, prefix `pos P2.9 S:`)
1. **Oracle first**: `scripts/qc-pos-p2.9.mts` (house style: own temp tenant, `--list/--no-db/--dry`, D-row check table, PAR pins, QC_FORCE, residue 0; deterministic concurrency via a lock-holding third tx like HT2.8/2.9) + the approved ORACLE-EDITs (p1.6 K4/K5 TIP_BOOKED, p1.12 ST4; dated markers). Run on the unchanged base → red-before `ledger/wo-notes/P2.9-red.txt` (own commit). State which checks cannot be red on the base and why.
2. Schema/migration (additive, `IF NOT EXISTS`, lock_timeout 3s): payment method enum values GIFT_CARD / STORE_CREDIT, `GiftCard.kind` STORE_CREDIT (+ member ownership), txn types for tender/reversal, as §3 says. Deploy on QC4 (`migrate deploy`, output in the notes). QC5 = controller.
3. Server: gift-card/store-credit tender inside the sale tx (≤ 3 cards, PIN for GIFT, member match for STORE_CREDIT, idempotent `pos-gct-<saleId>-<cardId>`), accounting per ruling 1 (Dr 2110 tender row, VAT at redemption, `use({tender:true})` posts nothing), tips booked per ruling 7, reversals per ruling 10 (void full, refund pro-rata, walk-in safe, idempotent), room-charge/deposit tiles per rulings 6/8 (server contract only).
4. Owner lines (`POS-OWNER-PENDING.md`: O24 update per ruling 1 · CD1b · deposit Dr/Cr bug · CD9 2111 · CD11 cross-book · CD5 wording) + notes `ledger/wo-notes/pos-P2.9.md` (hunks file:line, deviations with ruling refs, red-before summary, P2.9U contract (types/actions/receipt lines), gate table with `tree= head= dirty=` per log, follow-ups).
5. Merge `origin/session/pos` → gates.

## Rules
COMMON + LANE-RULES · never main/prod/`.env*`/deploy/Telegram/QC5/other trees · `git -C`/`env -C`/absolute paths, never `cd` · scratch only under `/tmp/claude-0/-root/5169ed6b-3dd4-5e42-a1eb-90ec4124521e/scratchpad/p29/` · other lanes hold `/tmp/pos-gate.lock` (typecheck/build) and run DB suites on QC4 under `/tmp/shark-gate-pos.lock` — wait in the shell, never kill · `qc-member-m2.x` known setup failures: skip · `createSale` input + `scripts/pos-sale-contract.json` sha: if the tender needs a contract change, stop and write a CONTROLLER-DECISION in the notes with the exact diff before changing it (p1.6 registry) · frozen legacy files untouched.

## Tree / commands
`/root/projects/shark-pos-b` — `git -C … status --short` clean → `git -C … fetch origin session/pos && git -C … checkout -B wip/pos-p2.9 57dc226b` → `env -C … pnpm exec prisma generate`. DB: `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/<suite>.mts` (never `export CI`). Typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck`.

## Gates before "done"
typecheck 0 · fitness ±env · fitness-pos · `qc-pos-p2.9` forced ×2 + unforced (residue 0) · `qc-hf-tx` 22 · `qc-pos-p1.6` (after ORACLE-EDIT) · `qc-pos-p1.8` · `qc-pos-p1.12` (after ORACLE-EDIT) · `qc-pos-p1.3` 128 · `qc-pos-p1.1` 180 · `qc-pos-account` 16 · `qc-pos-p2.8` (ST6 wip-only if register.ts is touched) · `qc-hf-pos-page-authz` · `qc-pos-p1.7` 33.

## Done =
Commit per step + push `wip/pos-p2.9` regularly (the controller may pause the lane: stop at a clean point, commit, push, write "⏸ PAUSED" at the end of your notes); notes + red-before; report ≤ 20 lines (head SHA first, code head, hunks file:line, check count + red-before, gate table, deviations, P2.9U contract pointer). Do not merge. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

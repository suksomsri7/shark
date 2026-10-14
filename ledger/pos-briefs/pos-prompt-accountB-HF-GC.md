# Prompt — HF-GC builder (gift card: reload balanceAfter from the locked update · crash-safe liability post on sell). Controller (account B, 14 Oct): base = `session/pos` **3e39c68c** (code adbb1640). Tree **/root/projects/shark-pos-b** (own node_modules; `pnpm exec prisma generate` once if the client predates the base; never `pnpm install`). Lane = builder (small card; P2.6 S fix1 is open on tree c — do not touch tree c or `pos/kds*`).

---

You are the BUILDER for POS hotfix **HF-GC**. Brief `ledger/pos-briefs/pos-brief-HF-GC.md` (Facts · Scope 1–5 · OUT · Gates · **§9 rulings 1–3 — binding**). Read `pos-brief-COMMON.md` + `pos-brief-LANE-RULES.md` (§HF-TX rule, §ด่านจุด merge). English notes/report, Thai code comments where the file uses them.

## Build order (commit per step, explicit paths, prefix `pos HF-GC:`)
1. Oracle first: HT2.6 + HT2.7 in `scripts/qc-hf-tx.mts` (house style; own temp tenant; `--list`); run on the unchanged base → red-before `ledger/wo-notes/HF-GC-red.txt` (own commit). If HT2.7(a) cannot be made red on the base because `sellReplay` already posts, say so and keep the check (it must still prove count = 1).
2. H1 (reload + any other pre-tx `after`), marked.
3. H2 helper + normal path + replay path + consumer backstop step + payload flag, marked; cite `account/gl.ts` idempotency in the notes (CONTROLLER-DECISION if a reader by ref is missing).
4. Owner lines + notes `ledger/wo-notes/pos-HF-GC.md` (hunks file:line, red-before summary, idempotency proof, gate table with `tree= head=` per log, follow-ups).
5. Merge `origin/session/pos` → gates.

## Rules
COMMON + LANE-RULES · never main/prod/`.env*`/deploy/Telegram/QC5/other trees · `git -C`/`env -C`/absolute paths, never `cd` · scratch only under `/tmp/claude-0/-root/5169ed6b-3dd4-5e42-a1eb-90ec4124521e/scratchpad/hfgc/` · other lanes hold `/tmp/pos-gate.lock` (typecheck/build) and run DB suites on QC4 under `/tmp/shark-gate-pos.lock` — wait in the shell, never kill · `qc-member-m2.x` known setup failures: run once, paste the line, do not reseed.

## Tree / commands
`/root/projects/shark-pos-b` — `git -C … status --short` clean → `git -C … fetch origin session/pos && git -C … checkout -B wip/pos-hf-gc 3e39c68c`. DB: `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/<suite>.mts` (never `export CI`). Typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck`.

## Gates before "done"
typecheck 0 · fitness ±env · fitness-pos · `qc-hf-tx` 20/20 ×2 · `qc-pos-p1.6` 48 · `qc-pos-account` 16 · `qc-pos-p1.3` 128 · `qc-pos-p1.1` 180 · `qc-pos-p2.8` 60/61 (ST6 wip-only).

## Done =
Commit per step + push `wip/pos-hf-gc`; notes + red-before; report ≤ 20 lines (head SHA first, hunks file:line, HT2.6/2.7 results, idempotency citation, gate table). Do not merge. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

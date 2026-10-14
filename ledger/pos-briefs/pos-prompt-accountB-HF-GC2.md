# Prompt — HF-GC2 builder (gift card: `expireDue` leftover under lock · `reload` status guard). Controller (account B, 14 Oct): base = `session/pos` **0f978264** (code 071402d8 = HF-GC merged). Tree **/root/projects/shark-pos-b** (own node_modules; `pnpm exec prisma generate` once if the client predates the base — the base adds no schema; never `pnpm install`). Lane = builder (small card; P2.6 S fix2 is open on tree c — do not touch tree c, `pos/kds*`, `restaurant/**`).

---

You are the BUILDER for POS hotfix **HF-GC2**. Brief `ledger/pos-briefs/pos-brief-HF-GC2.md` (Facts · Scope 1–4 · OUT · Gates — binding; re-cite the live line numbers, they moved after HF-GC). Read `pos-brief-COMMON.md` + `pos-brief-LANE-RULES.md` (§HF-TX rule, §ด่านจุด merge). Context: `ledger/wo-notes/pos-HF-GC-review.md` (FU-1, F3 and ruling 2), `pos-HF-GC.md` (how HF-GC changed `use`/`reload`/`sellReplay`). English notes/report, Thai code comments where the file uses them.

## Build order (commit per step, explicit paths, prefix `pos HF-GC2:`)
1. Oracle first: HT2.8 + HT2.9 in `scripts/qc-hf-tx.mts` (house style; own temp tenant/cards; `--list`; deterministic via a lock-holding third transaction as the brief describes; clean up their rows, residue 0); run on the unchanged base → red-before `ledger/wo-notes/HF-GC2-red.txt` (own commit; both must be red — if one cannot be forced red, say exactly why and keep the check).
2. FU-1 `expireDue`: leftover + `accountingDocId` from the row read/updated under lock (one statement with `RETURNING` preferred), marked `// POS HF-GC2 ▸ … ◂`; return shape/idempotency unchanged.
3. F3 `reload`: `updateMany` with `status in (ACTIVE, DEPLETED)` + count check ⇒ `GiftCardStateError` inside the tx (sale rolls back with it); `balanceAfter` from the locked row as HF-GC H1 does.
4. Owner lines (`POS-OWNER-PENDING.md`: FU-1/F3 closed by HF-GC2; the per-card `catch {}` stays silent — owner decides) + notes `ledger/wo-notes/pos-HF-GC2.md` (hunks file:line, red-before summary, gate table with `tree= head= dirty=` per log, follow-ups).
5. Merge `origin/session/pos` → gates.

## Rules
COMMON + LANE-RULES · never main/prod/`.env*`/deploy/Telegram/QC5/other trees · `git -C`/`env -C`/absolute paths, never `cd` · scratch only under `/tmp/claude-0/-root/5169ed6b-3dd4-5e42-a1eb-90ec4124521e/scratchpad/hfgc2/` · other lanes hold `/tmp/pos-gate.lock` (typecheck/build) and run DB suites on QC4 under `/tmp/shark-gate-pos.lock` — wait in the shell, never kill · `qc-member-m2.x` known setup failures: skip.

## Tree / commands
`/root/projects/shark-pos-b` — `git -C … status --short` clean → `git -C … fetch origin session/pos && git -C … checkout -B wip/pos-hf-gc2 0f978264`. DB: `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/<suite>.mts` (never `export CI`). Typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck`.

## Gates before "done"
typecheck 0 · fitness ±env · fitness-pos · `qc-hf-tx` 22/22 ×2 (forced + unforced) · `qc-pos-p1.6` 48 · `qc-pos-account` 16 · `qc-pos-p1.3` 128 · `qc-pos-p1.1` 180 · `qc-pos-p2.8` (ST6 wip-only).

## Done =
Commit per step + push `wip/pos-hf-gc2`; notes + red-before; report ≤ 15 lines (head SHA first, hunks file:line, HT2.8/2.9 results, gate table). Do not merge. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

# Prompt — P2.1 oracle follow-up R8 (reviewer N1). Controller (account A, 9 Oct 19:3xZ): base = `session/pos` **39204872** (P2.1 S + fix round 1 merged). Tree **b**, branch `wip/pos-p2.1-r8`.

---

You are the ORACLE WRITER adding **one check** to `scripts/qc-pos-p2.1.mts`: **P2.1-R8 — `pos.sale.paid` self-heals a missing COMMISSION for a sale that is already REFUNDED** (reviewer re-check N1: the healing path at `src/lib/outbox-consumers.ts:142` is never exercised in its healing state; R7 only replays it after COMMISSION exists). English report, Thai comments in the script. No production code changes — if the check is red, **stop and report** (do not fix the consumer).

## Read first
`ledger/wo-notes/pos-P2.1-oracle.md` (names table, R7 record), `ledger/wo-notes/pos-P2.1.md` "Fix round 1" (F1 table, remaining windows), `ledger/wo-notes/pos-P2.1-review-R2.md` N1, the R7 block in `scripts/qc-pos-p2.1.mts` (reuse its temp tenant, LINEMAN ฿420 30 % sale, drain helpers, direct delete pattern), `src/lib/outbox-consumers.ts` `posSalePaid`, `src/lib/modules/pos/account-bridge.ts` `bridgePosSalePaid`/`bridgePosSaleCommission`, `src/lib/modules/pos/refund-consumer.ts`.

## R8 scenario (own temp tenant, same fixtures as R7)
1. LINEMAN ฿420 PLATFORM sale → drain ⇒ PAID + COMMISSION exist.
2. Full refund → drain ⇒ REFUNDED + COMMISSION_REFUNDED exist; sale status `REFUNDED`.
3. Delete the `PosSale#<saleId>#COMMISSION` entry + lines (direct prisma, scoped to tenant + that entryId — as R7 does) **and** delete `#COMMISSION_REFUNDED` the same way, so the book is back to "PAID + REFUNDED only" (1100 on the contact = 0, 6500 = 0).
4. Re-enqueue / re-drive the `pos.sale.paid` outbox event for that sale (reset the existing event row to PENDING the way the suite's replay helper does, or insert a fresh event with the same payload — use whatever R7's replay uses) → drain.
5. Assert: `#COMMISSION` exists again (Dr 6500 12 600 / Cr 1100 12 600 on the PAID contact), `#COMMISSION_REFUNDED` does **not** (the paid consumer heals COMMISSION only; the refund event is FAILED/DONE and is not re-driven here — this documents the builder's "FAILED refund event" window), entries balanced, replay of the paid event adds nothing. Then re-drive the refund event (same helper) → `#COMMISSION_REFUNDED` returns, 1100 and 6500 net 0 — this second half proves the ops "re-drive is safe and idempotent" claim.
Count 54 → 55; add the row to the names table in `pos-P2.1-oracle.md` with the R8 record (what it proves, which window it documents).

## Tree / commands
`/root/projects/shark-pos-b` (own node_modules; detached at 206a48df after gates50). `git -C /root/projects/shark-pos-b status --short` must be clean, then `git -C /root/projects/shark-pos-b fetch origin session/pos && git -C /root/projects/shark-pos-b checkout -B wip/pos-p2.1-r8 39204872 && pnpm -C /root/projects/shark-pos-b exec prisma generate`. Always `git -C …` / absolute paths; pnpm/tsx inside the tree. DB: `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p2.1.mts`. Typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck`. No build/server/deploy/.env/Telegram/seeds/wipes; no production code edits. Scratch only under `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p21-r8/`. A controller gate run (`gates51-c`) and lane d run suites on `posqc-coffee` — your temp tenant is unaffected; re-run once before calling anything red.

## Gates
`qc-pos-p2.1` forced ×2 + unforced **55/55** residue 0 · typecheck 0 · `scripts/fitness-pos.mts`. Logs with `tree=/root/projects/shark-pos-b head=<sha>` headers under `scratchpad/p21-r8/runs/`.

## Done =
One commit `test(pos P2.1): ORACLE-EDIT R8 — pos.sale.paid self-heals COMMISSION on a REFUNDED sale; refund re-drive restores COMMISSION_REFUNDED (reviewer N1)` (script + oracle notes) · push `wip/pos-p2.1-r8` · report ≤10 lines with the head SHA and whether R8 was green on the first real run. Do not merge, do not touch `session/pos`/`main`/other trees.
Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

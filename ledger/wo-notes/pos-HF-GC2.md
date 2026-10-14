# POS HF-GC2 — gift card: `expireDue` leftover read under lock (FU-1) + `reload` status guard (F3)

Brief `ledger/pos-briefs/pos-brief-HF-GC2.md` · builder account B · tree `/root/projects/shark-pos-b` · branch `wip/pos-hf-gc2` from `session/pos` 0f978264 (code 071402d8 = HF-GC merged).
Prisma client: base adds no schema (diff `prisma/` 31cb1bd8..0f978264 empty) ⇒ no `prisma generate`.

## Status
- [x] 1 oracle HT2.8 + HT2.9 (`scripts/qc-hf-tx.mts` 20 → 22) (5100d19f) · red-before `ledger/wo-notes/HF-GC2-red.txt` (5f5d95d2)
- [x] 2 FU-1 `expireDue` (308becac)
- [x] 3 F3 `reload` (9153edbf)
- [x] 4 owner lines + these notes
- [x] 5 merge `origin/session/pos` 1f2fa86e (ledger only) → 76188470 → gates (table below)

## Hunks (file:line at 9153edbf; all marked `// POS HF-GC2 ▸ … ◂`)
- `src/lib/modules/giftcard/service.ts:1052–1086` **FU-1 expireDue** — per-card tx now starts with `SELECT "balanceSatang","accountingDocId","status" FROM "GiftCard" WHERE id = $1 FOR UPDATE` (`$queryRaw`, :1057–1058); not ACTIVE ⇒ `null` (not counted, same as the old `count === 0`); the existing `updateMany({id, status ACTIVE} → EXPIRED, 0)` stays (:1061–1065); `leftover` = locked `balanceSatang` (:1066); the tx returns `{ txnId, leftover, accountingDocId }`; EXPIRE txn `satang` and `postGiftCardExpire({ satang })` use the locked `leftover` (:1084); the JV gate uses the locked `accountingDocId` (:1086). Key `giftcard-expire-<id>`, ACTIVE predicate, `{ expired }` return shape unchanged. The stale pre-read `card` is still used only for `tenantId`/`systemId`/`saleId` (immutable). Owner-decided `catch {}` untouched.
  - Why not one `UPDATE … RETURNING`: RETURNING yields the post-`SET` value (`balanceSatang` = 0); the old value needs `RETURNING OLD.*` (PostgreSQL 18). `SELECT … FOR UPDATE` is the brief's first option; under READ COMMITTED it waits for the concurrent `use` and returns the committed row.
- `src/lib/modules/giftcard/service.ts:784–800` **F3 reload** — `tx.giftCard.update` (no status predicate) → `updateMany({ where: { id, status: { in: ["ACTIVE","DEPLETED"] } }, data: { increment, status: "ACTIVE" } })` (:787–790); `count === 0` ⇒ re-read status on the same `tx` and throw `GiftCardStateError` with the pre-check's SUSPENDED or EXPIRED message (:791–798) inside the `$transaction` ⇒ the `createSale(…, callerTx(tx))` sale rolls back with it (the retry loop rethrows non-P2002 errors). `balanceAfter` = `findUniqueOrThrow` on the same `tx` after the update (:800) — HF-GC H1 kept (same pattern as `use`). No new `createSale` call site.
- `scripts/qc-hf-tx.mts` — header :30–37 · CHECKS :62–64 · block :612–707 (`holdLock` :622–642 · HT2.8 :644–673 · HT2.9 :675–702).

## Oracle (deterministic)
`holdLock`: a third transaction A takes `SELECT … FOR UPDATE` on the card, records `pg_backend_pid()`, starts the other side, then polls `pg_stat_activity WHERE pid-of-A = ANY(pg_blocking_pids(pid))` until a waiter is seen and ≥ min ms elapsed, then acts in A and commits. "A กั้น เห็น" is part of the pass condition (no vacuous pass via the pre-check).
- HT2.8: card sold with `accountingLink` on (balance 10000, `accountingDocId` set), `expiresAt` = 2001-01-01, `expireDue(2001-01-02)` so the global sweep can only touch this card (guard: any foreign ACTIVE card due ≤ cutoff ⇒ red, not run). A decrements 3000 + USE row. Pass = A blocked · `expired 1` · EXPIRED/0 · 1 EXPIRE `satang 7000` · 1 JV by `GiftCardTxn#<expire>` Dr = Cr = 7000 · USE + EXPIRE = 10000.
- HT2.9: card ACTIVE 10000; `reload(3000)` passes the pre-check and blocks (at the `PosSale.giftCardId` FK key-share / card write); A sets SUSPENDED, commits. Pass = A blocked · `GiftCardStateError` · SUSPENDED/10000 · RELOAD 0 · PosSale(key) 0 · then `unsuspend` + same-key reload ×2 ⇒ same txnId/saleId, RELOAD 1, PosSale 1, ACTIVE 13000.

## Red-before (base code 071402d8 + oracle · `HF-GC2-red.txt`)
20/22 · HT2.8 ❌ `EXPIRE 1 แถว 10000 (คาด 7000) · JV 1 Dr 10000 Cr 10000 · USE 3000 + EXPIRE 10000 = 13000` · HT2.9 ❌ `reload สำเร็จ balanceAfter 13000 · บัตร ACTIVE ยอด 13000 (คาด SUSPENDED 10000) · RELOAD 1 · บิล 1` · both with "A กั้น เห็น" · residue 0.
Post-fix (pre-merge, 9153edbf): 22/22 forced · HT2.8 `EXPIRE 7000 · JV Dr 7000 Cr 7000 · 10000` · HT2.9 `GiftCardStateError: บัตรใบนี้ถูกระงับอยู่ … · SUSPENDED 10000 · RELOAD 0 · บิล 0`.

## Gates
All logs headed `tree=/root/projects/shark-pos-b head=76188470 dirty=0` (scratch `hfgc2/gates/*.out`, 14 Oct 14:02–14:14Z); head 76188470 = code 9153edbf + upstream 1f2fa86e (ledger only; non-ledger diff 9153edbf..76188470 empty).
| gate | tree= head= | result |
|---|---|---|
| typecheck (pos-gate.lock · 5632/6500M) | shark-pos-b 76188470 | rc 0 |
| fitness no-env / env (qc4) | shark-pos-b 76188470 | 50/50 · 50/50 |
| fitness-pos | shark-pos-b 76188470 | 8/8 |
| qc-hf-tx forced / unforced | shark-pos-b 76188470 | 22/22 · 22/22 (residue 0) |
| qc-pos-p1.6 | shark-pos-b 76188470 | 48/48 |
| qc-pos-account | shark-pos-b 76188470 | 16/16 |
| qc-pos-p1.3 | shark-pos-b 76188470 | 128/128 |
| qc-pos-p1.1 | shark-pos-b 76188470 | 180/180 |
| qc-pos-p2.8 | shark-pos-b 76188470 | 61/61 · PAR 4/4 |
| qc-member-m2.6 / m2.7 / m2.8 | — | skipped (known QC4 setup failures, prompt rule) |

## Follow-ups (not in this card)
- `expireDue` per-card `catch {}` still silent: a failing `postGiftCardExpire` (e.g. period closed) leaves the card EXPIRED + EXPIRE txn with no JV and no retry (card is no longer ACTIVE) — owner line, owner decides.
- HF-GC F2 (late-link gap — now the `expireDue` gate reads the locked `accountingDocId`, which narrows but does not close it for `use`/`reload`/`refundUse`), FU-2 `unsuspend`, FU-4 consumer WARN-only — unchanged owner lines.

# POS P2.8 S — ออเดอร์ทุกช่องทาง (orders + adapters) · builder notes

Builder · account B · 10 Oct 2026 · tree `/root/projects/shark-pos-b` · branch `wip/pos-p2.8` from `session/pos` **160299e4** (gates63-b DONE at start — waited 0 min · tree clean, detached 09e2ca11).
Contract: `ledger/pos-briefs/pos-brief-P2.8.md` (§9 rulings 1–16) · `ledger/wo-notes/pos-P2.8-oracle.md` (names table · CD 1–24) · prompt rulings 24–27.

## Progress (checkpoint)
- [x] step 1 — migration + schema + order-shared + scope/env (in progress)
- [ ] step 2 — order.ts ingest + lifecycle + settings
- [ ] step 3 — sale creation / pay / void consumer
- [ ] step 4 — adapters + WEB mirror + storefront dual-read + backfill + dual-write
- [ ] step 5 — readers + permissions + order-actions
- [ ] step 6 — messages + facts + ORACLE-EDITs + gates

## Red-before (base 160299e4, forced, QC4)
`qc-pos-p2.8` forced → **6/54 · PAR 4/4** (ST6 L1 L2 L3 Z1 Z2 green; every other check red by reason "ยังไม่มี … facade orders / โมเดล PosOrder") · residue 0 · exit 1. Log: scratch `runs/p28-redbefore-forced.log`.

# Prompt — P2.4 S fix round 1 (oracle edits + L2 registry). Controller (account A, 10 Oct 04:3xZ): head 496f16a2 (code d55c9eba) on `wip/pos-p2.4`, tree c. Lane runs in parallel with P2.8 S fix (tree b) and an HF-TX investigator (read-only).

Rulings (binding):
1. **ORACLE-EDIT ST3 accepted** — `scripts/qc-pos-p2.4.mts` comment stripper: for the fitness F1.3 sub-check strip **line comments only** (a `"/*"` string literal must not open a block comment). Own commit, count unchanged (43).
2. **ORACLE-EDIT V3 accepted** — refund probe sends **1 satang** (0 is VALIDATION at `refund.ts:158` before the total check). Own commit.
3. **ORACLE-EDIT L2 accepted** — add `CALL_SITES_ALLOWED_LATER = { "src/lib/modules/pos/order.ts": 1 }` exactly as `qc-pos-p2.6.mts` does (P2.8 S adds that createSale call site; L2 must stay green when P2.8 merges). Own commit. `--no-db` must show L2 green (the P2.6-style allowance), nothing else changes.
4. Deviation 3 (hide `$transaction` from the tx handed to `createSale`) stays as built; an HF investigator is checking the P1.7/giftcard paths — do not touch `register.ts` P1.7 code. Mark your helper with `// POS P2.4 ▸ HF-TX: ผู้คุมจะรวมเป็น helper กลางหลัง HF ◂` so the HF can find it.
5. No other code changes. Re-run: `qc-pos-p2.4` forced ×2 + unforced (expect 43/43 · PAR 4/4 · residue 0), `qc-pos-p2.4 --no-db` (L1–L4 green), typecheck. Update notes (gates table + ORACLE-EDIT log with the three commits). Commit explicit paths, push `wip/pos-p2.4`, report ≤ 15 lines (head SHA first). Same hard rules as the S prompt.

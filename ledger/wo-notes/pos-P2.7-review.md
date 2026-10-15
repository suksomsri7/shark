# P2.7 — review file (controller · account B · 15 Oct 2026)

## Oracle delivered (tree d · 22:08Z) — `wip/pos-p2.7-oracle` **500b4041**
38 checks (ST1–4 · TK1–5 · PO1–6 · PY1–11 · TB1–7 · KD1–2 · OR1 · Z1–2) · forced 3/38 at 1ac523d3 (Z1 Z2 + OR1 SKIP; 35 red by reason; 0 crashed; residue 0) · `--no-db` 4 static red by missing names · base suites unforced on 62a319cc: p2.4 50/50 · restaurant-pay 19/19 · p2.8 61/61 · typecheck 0 only with heap 8192 (5632 ⇒ 134) · ORACLE-EDIT list: p2.1 `:59 :61 :277 :733` (+ O2/O3 `:1092 :1093 :1271 :339`), p2.8 `:498` (O4), p2.13 none.
CONTROLLER-DECISION CD-O1–O10 ruled in brief §10 ruling 17 (binding).
→ S builder (Opus tree d `wip/pos-p2.7` from f95348ac + oracle) prompt `pos-prompt-accountB-P2.7-S.md`.

## Builder delivery (tree d · 23:36Z) — `wip/pos-p2.7` **71f5cd10** (pushed)
37/38 forced ×2 + unforced + after merging origin 42cc377e (PY11 red) · red-before at f95348ac 2/38 · ORACLE-EDIT p2.1 :59 :61 :277 :1093 :1094 :1272 :339 (lines shifted +1 after :488; :734 unneeded) + p2.8 :499 `PAY_STATES_SCHEMA` · migration `20261216100000_pos_p27_qr_orders` (QC4 applied) · typecheck 0 (8192) · fitness ±env 53 · fitness-pos 8 · restaurant ×4, p2.4 50, p2.5 49, p2.1 55, p2.2 42, p1.18 81, hf-tx 22, p1.1 180, p1.3 128, p1.6 48, shop ×2, authz 82 green. Deviations: (1) per-IP limit via `checkRateLimitDb` directly (fitness F2.2 forbids the deep import of `accountRateGuard`) — **accepted**; (2) `restaurant/order.ts` `createOrderInTx` delegates to an internal writer shared with new `createGuestOrderInTx` (pinned bodies/signatures unchanged) — **R1 verifies**.
**CONTROLLER-DECISION CD-B1–B4 (23:36Z · binding · all = pre-approved ORACLE-EDITs, test-only, dated marker `// ORACLE-EDIT ผู้คุม 15 ต.ค. (P2.7 fix 1)`, one `test(<suite>)` commit each)**:
- **CD-B1 PY11**: the display never resolves the order's intent (`intentId null`) and falls back to the shop's static QR of the published amount, which is byte-identical to the order's static QR ⇒ the payload-inequality half can never pass. Edit PY11 to assert `intentId === null` (+ keep the X-report half). The design goal ("an order intent never shows on a device display") is proved by `intentId null`.
- **CD-B2 p2.6 A6**: add `"QR"` to the adapter spy list (`qc-pos-p2.6.mts:2183`).
- **CD-B3 p2.8 ST1 :523–524**: the "exactly one migration touches PosOrder*" filter must count only migrations that **create** the PosOrder tables (regex `CREATE TABLE IF NOT EXISTS "PosOrder(Line|Event)?"`), so additive ALTERs from later cards do not count.
- **CD-B4 p1.7 C9**: allow `SET lock_timeout` in migrations touching PosPaymentIntent (house style since P2.8; p2.8 ST1 itself requires it).
- **p2.13 ST4** red on tree d = gitignored skill dir missing → controller copied `.claude/skills/{shark-pos-api,shark-kanban-api,shark-account-api}` into tree d; builder re-runs p2.13 (expect 54/54).
- **Lane pins** (red vs origin merge-base only): p2.8 ST6 · p2.10 ST2 · hf-fu ST1 · p2.11 ST4 · p2.12 ST1 + **p2.11 ST1, p2.13 ST5** (schema change + consumer hunk) — provisionally lane pins; **must be green on the merge tip** or they become CONTROLLER-DECISION at merge gates.
→ fix round 1 = the four ORACLE-EDITs + p2.13 re-run (message sent to the builder) ‖ R1 (prompt `-P2.7-R.md`) + money hunter (`-P2.7-H.md`) on 71f5cd10 in parallel (read-only).

## Fix round 1 (test-only · 23:45Z) — `wip/pos-p2.7` **3c29ceac** (= 71f5cd10 + cde24d23 PY11 · 37e2b190 p2.6 A6 · 799587e5 p2.8 ST1 · 72cd28e0 p1.7 C9 + notes; no code change)
Unforced QC4 @72cd28e0: p2.7 **38/38** · p2.6 67/67 · p1.7 33/33 · p2.8 60/61 (ST6 lane pin) · p2.13 53/54 (ST4 green with the skill dirs; **ST5** red = prisma/ + `outbox-consumers.ts` vs merge-base — same class as ST6; **provisional lane pin, must be green on the merge tip**). Builder holds for the R1/hunter code-fix message.

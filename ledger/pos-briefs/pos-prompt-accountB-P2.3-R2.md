# Prompt — P2.3 reviewer R2 (read-only, fix rounds 1–2). Controller (account A, 10 Oct 02:4xZ): head = `wip/pos-p2.3` **06f2d825** (code 09e2ca11); diff under review = `14dec332...06f2d825` (round 1: 88604d75 ORACLE-ADD V6 · fdccdf4c F1 · 0f670613 F2 · c9a23a19 F3 · 15c10a0f F5 · ac68a221 F6 · e3cd9151 F8 · merge 0eec926f of session/pos 6f90a2c1 · notes 8cd0dc24 · round 2: 09e2ca11 per-item cut-failure log · notes 06f2d825). Builder reports: p2.3 46/46 forced ×2 + unforced (residue 0; V6 red-before 45/46 on 276a1934) · p1.8 49 · p1.2 55 · p1.3 128 · p1.16 28 · p1.12 72 · inventory 25 · shop-refund 12 · clinic-refund 13 · pos-account 16 · `qc-hf-inventory-atomic` 143/143 (round 2) · typecheck 0 · fitness ±env · fitness-pos.

---

You are the R2 REVIEWER for **P2.3 S fix rounds 1–2**. Read-only, English, ≤ 45 lines. Read `ledger/wo-notes/pos-P2.3-review.md` (R1 F1–F8 + controller rulings) and the fix-round sections of `git -C /root/projects/shark-pos-c show 06f2d825:ledger/wo-notes/pos-P2.3.md`.

Verify on the diff only (cite file:line):
1. **F1 (ruling alt B)**: after a successful retry cut, the sale is re-read and `restockRefundDoc` re-runs for each REFUND doc with the same idempotent keys; the refund-consumer path now calls the same `service.restockRefundDoc` (behaviour byte-identical for the normal path — walk one partial refund); ORACLE-ADD V6 asserts net stock = before − unrefunded part + restock at original OUT cost + no new rows on repeat; the check fails by reason on 276a1934 (red-before log).
2. **F2**: `posDayStart()` shared by counter and retry; omitted `since` = today; `since: null` = all-time only, not reachable from the action/U.
3. **F3**: `loadRowPortions` single function; untracked component ⇒ `null`; tracked negative ⇒ 0; MENU live recipes unchanged (A2 still green); `stockLeft` consumers unaffected.
4. **F5**: `lockItemsInTx` 4th arg lock wait, default 15 s unchanged for existing callers (grep every call site), `consumeBatch` passes 5 s.
5. **F6**: re-read after batch; VOIDED ⇒ `restoreVoidedInventory`; REFUNDED ⇒ refund-doc restock only (deviation recorded) — is a PAID-then-void-between-reads race fully closed, or is there still a window (cite)? Keys idempotent on replay.
6. **F8**: two บัญชี owner lines present and accurate (void COGS at original OUT cost; retried cut posts COGS on retry date).
7. **Round 2**: per-item failure log `{saleId, itemId, qty, code}` for failed and skipped parts (SERVICE / NOT_FOUND as code) + batch summary line; no behaviour change beyond logging; `qc-hf-inventory-atomic` 143/143 log present.
8. **Scope**: `git diff --stat 14dec332...06f2d825 -- . ':!ledger'` only touches expected files; no oracle check changed except the V6 addition (count 45 → 46); contract sha unchanged; merge 0eec926f brought no app code (ledger + qc-pos-p2.8/qc5.sh only); logs carry `head=0eec926f` / `head=09e2ca11` + rc.

Tree `/root/projects/shark-pos-c` via `git -C … show/diff` only; no checkout/pnpm/DB/servers. Scratch `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p23-r2/`. Report: verdict (`MERGEABLE` | `MERGEABLE-AFTER-FIXES` | `BLOCKED`), findings N1..Nn with file:line + smallest fix, "Verified OK" per item 1–8. Write REPORT.md in the scratch dir if allowed and return it verbatim.

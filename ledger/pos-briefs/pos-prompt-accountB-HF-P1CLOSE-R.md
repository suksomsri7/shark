# Prompt — HF-P1CLOSE reviewer (read-only). Controller (account A, 10 Oct 00:3xZ): head under review = `wip/pos-hf-p1close` **64872b67** (base 711b6d5e, one commit per item). Tree **b** — read via `git -C /root/projects/shark-pos-b show/diff` only.

---

You are the REVIEWER for hotfix card **HF-P1CLOSE** (P1 parity fix-now items O1 O2 O4 O5 O7 O13 + harness states O6 O8 O9 O11 + owner lines O3 O12). Read-only: no edits/commits/DB/build/servers/`.env*`. English, ≤ 60 lines.

## Read first
- `ledger/wo-notes/pos-P1.18-parity.md` ("OPEN items" + "Controller rulings" — binding), `ledger/pos-briefs/pos-prompt-accountB-HF-P1CLOSE.md`, builder notes `git -C /root/projects/shark-pos-b show 64872b67:ledger/wo-notes/pos-HF-P1CLOSE.md`, diff `git -C /root/projects/shark-pos-b diff 711b6d5e...64872b67` (ignore ledger hunks), logs under `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/hf-p1close/`.
- Rules: UI-only + harness (no server/service/schema change; the only server-adjacent change allowed is the cashier `products` refusal card returning before any data read); `'use client'` imports only `*-shared`/pure + actions; ST7 = 0 Thai literals outside `t()`; th+en keys; harness states register/revoke what they create and never need product hooks.

## Verify (cite file:line)
1. **O1** Reports tab href + no "soon"; 390 en unit chip fix does not change 1440 layout (shift chip shrink/truncate only).
2. **O2** coupon row live; no leftover `soonChip`/`aria-disabled`; coupon flow untouched.
3. **O4** header wrap under `xl` for owner/cashier/account-off; other settings tabs unchanged.
4. **O5** overlay layout change is safe at 1440/1024 (no regression in `lock-screen` states); the new `lock-screen-scroll` state really asserts the staff-switch button + held card are visible after scrolling.
5. **O7** 17A ACTIVE-only list; 17B fold "เพิกถอนแล้ว (n)" collapsed by default; no data deleted; revoke flow unchanged.
6. **O13** cashier `products` ⇒ refusal card (200) **before any product/catalog read** (grep the page for reads above the guard); users with no POS branch still 404; no data leaks in the card. **ORACLE-EDIT P-7 in `scripts/qc-hf-pos-page-authz.mts`**: confirm the new check is at least as strong as the old one (guard still required; refusal-before-read asserted), own commit, count 56 unchanged, and that the edit matches the controller's O13 ruling (accept/reject in one line).
7. **Harness**: states `held-drawer`, `paydlg-promptpay-timeout`, `paydone-print-failed`, `lock-screen-scroll`, `sale-done` 390, `receipt-public` all sizes th/en; `--list` added; fixtures idempotent and cleaned (`finally`), device 2 printer reset after the failed-print state even when the state throws; no raw writes except cleanup; `pos-qc-env.mts` unchanged; typecheck of the script (no `any` leaks).
8. **Ledger**: `POS-OWNER-PENDING.md` lines O3 (core owner) + O12 (approval owner); notes list every file:line, the O5 verdict, 19ค decision, state ids; gates (typecheck 0, fitness-pos 8/8, fitness no-env 41/41, authz 56/56; fitness with env not run — controller runs it).
9. **Builder's open points**: held bills unreachable on a phone with an empty cart (14B) — classify (later card vs fix-now); "expired card wording differs from 19ค" — note for the vis comparison.

## Report format
Verdict first (`MERGEABLE` | `MERGEABLE-AFTER-FIXES` | `BLOCKED`), findings F1..Fn (severity, file:line, input → wrong outcome, smallest fix), "Verified OK" per item 1–9. Write `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/hf-p1close-r/REPORT.md` and return it verbatim as your final message. Scratch only under that folder.

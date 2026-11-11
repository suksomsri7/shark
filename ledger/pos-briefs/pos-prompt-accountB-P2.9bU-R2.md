# Prompt — P2.9bU reviewer **R2** (read-only, fix-round verification). Controller (account B, 15 Oct ~12:0xZ): head = `wip/pos-p2.9bu` **36e0be7c** (fix round 1 on d4b7dbb8 / code 081d2546; base `session/pos` a1d8af43 = code c3c52ef1). R1 verbatim + controller rulings 1–10 (fix round 1) + the controller's image review = `/root/projects/shark-pos/ledger/wo-notes/pos-P2.9bU-review.md` (controller tree). Builder fix notes = `ledger/wo-notes/pos-P2.9bU.md` §"Fix round 1" at 36e0be7c (tree b). Original builder prompt + rulings 1–11 = `pos-prompt-accountB-P2.9bU.md`.

---

You are the REVIEWER (R2) for POS **P2.9bU** — verify that fix round 1 closes R1 F1–F7 + V1–V2 exactly per the rulings, and that nothing regressed. Read-only: no edits/commits/DB/build/servers/`.env*`/pnpm/prisma/`cd`/`git checkout`. Read via `git -C /root/projects/shark-pos-b diff d4b7dbb8..36e0be7c -- . ':!ledger'` and `git -C /root/projects/shark-pos-b show 36e0be7c:<path>`. English, ≤ 40 lines.

## Verify (cite file:line)
1. **Ruling 1 (F1)**: row origin tags (`memberLinked` / last-4-checked) set correctly at every row-adding path (member list, exact receipt lookup with balance, re-lookup with last-4, reload-rebuilt rows); NOT_OWNER order = (a) same row set refused twice ⇒ all deposit rows removed + `errors.depositNotOwnerAgain`; (b) stripped retry / re-entered digits ⇒ last-4 blame; (c) else member rows removed, last-4 rows blamed only when no member row. Walk the reviewer's A (walk-in, checked) + B (member) case and the single-row cases (A alone wrong digits ⇒ last-4 blame, not removal). Is "same row set" keyed on depositIds (not on object identity) so a re-render cannot defeat it? Any path where a NOT_OWNER removes a correctly-verified walk-in row?
2. **Ruling 2 (F2)**: note key text th+en; nothing else changed on the replay path.
3. **Ruling 3 (F3)**: closable after a PAID intent only on definite refusals (which codes? cite); reference line shows the `pi_` id (no secrets); the cited register precedent (`TERMINAL_SUBMIT` :245 / close :414 / `pay.intent.refundYourself`) is real and equivalent; intent not cancelled/refunded client-side.
4. **Ruling 4 (F4)**: `sandbox="allow-same-origin"` only (no `allow-scripts`).
5. **Rulings 5–6**: note text; fixture phone `0800000427` lives only in fixture code (grep the diff + notes for `0427`/`081999`); `.gitignore` covers `.qc-shots/`.
6. **Ruling 7**: new keys `pos.bills.deposit.refundM*` th+en, chips wired to the same method values as before (CASH/PROMPTPAY/TRANSFER), no `pi_`.
7. **Ruling 9**: lookup row uses `pay.gc.balance` — is that key's th/en text correct in this context ("คงเหลือ ฿x" / "Balance ฿x") and not gift-card-specific wording? Split row keeps "Balance after".
8. **Ruling 10**: confirm the 390 scroll container claim (`InterimPayDialog.tsx:1237` `overflow-y-auto` contains the panel + "ใช้มัดจำนี้" button; footer outside; numpad `hidden md:grid`).
9. **Regression sweep**: diff touches only client files + messages + visual harness + ledger (list them); no server file; marked hunks; th/en same key set; ST7 claim backed by `runs/fix1-final/qc-pos-p1.18.out` header `head=0aa39bef dirty=0` — note the gates ran at 0aa39bef while the head is 36e0be7c: confirm 36e0be7c differs only in `ledger/` (`git diff --stat 0aa39bef..36e0be7c`).

## Report format
Verdict first (`MERGEABLE` | `MERGEABLE-AFTER-FIXES` | `BLOCKED`), findings G1..Gn (severity, file:line, concrete input → wrong UI, smallest fix), "Verified OK" per ruling, follow-ups. Write `/tmp/claude-0/-root/a129a720-3235-582c-8bcd-f2169f38cd68/scratchpad/p29bu-r2/REPORT.md` and return it verbatim.

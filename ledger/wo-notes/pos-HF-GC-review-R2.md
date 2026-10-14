# HF-GC R2: fix round 1 · head 31cb1bd8 (code ceb281c1) · read-only · 14 Oct
**VERDICT: MERGEABLE.** The fix closes F1, and nothing new needs fixing. The fix touches 2 files (+22/−4) in `src` and `scripts` between 566349a7 and ceb281c1.

## Notes (none blocking)
- **G1 Info:** `soldWithAccountingLink` (service.ts:358–364) returns false when the outbox row has no flag. So a card sold before HF-GC with the switch ON, whose immediate post crashed, can no longer be recovered by a same-key replay. This is the intended trade-off from R1 F1, and the consumer already treats old rows this way. The FU-4 sweep line covers recovery, and the owner line already says so.
- **G2 Info:** The rule relies on outbox rows being kept. If the `giftcard.sold#<id>` row is pruned, nothing posts, which is the safe direction. `git grep outboxEvent.delete` finds no pruning in `src` at ceb281c1.
- **G3 Info:** I did not open the raw gate logs (`scratchpad/hfgc/gates-fix1/*.out`) because they are outside my read scope. Item 6 below is checked against the notes file only.

## Verified OK
1. **Flag source:**
   - service.ts:358–364 does a `findUnique` on `tenantId_idempotencyKey` = `giftcard.sold#<cardId>` (outbox.prisma:22 `@@unique([tenantId, idempotencyKey])`) and reads `payload.accountingLink === true`.
   - That payload is written once inside the sale transaction (:547, core/outbox.ts:52–57), and the consumer reads the same row's `evt.payload`.
   - If the row or flag is missing, the flag is false and `ensureGiftCardSalePosted` returns null on its first line, so nothing posts.
   - Walk: card sold with the switch OFF, so the payload says false. The switch is then turned ON and the sale replayed. `sellReplay` finds no doc and reads flag false, so the helper returns null, no journal entry is posted and `accountingDocId` stays null. Oracle (c2) confirms this at head: JV 0, doc null.
2. **Replay paths:** `replayed()` (:419–426) passes the payload flag on both the first-entry replay (:428) and the P2002 retry (:558). A normal first sale (:566) still posts using the sale-time `settings.accountingLink`, the same value written into the payload at :547. `outbox-consumers.ts` is unchanged, so the consumer still checks `payload.accountingLink === true`.
3. **Live switch:** No path decides from the live switch at replay time. The only `accountingLink:` call sites are :424 (payload) and :566 (settings read before the sale transaction, in the same request).
4. **Oracle:**
   - The diff is HT2.7 (c2) only (qc-hf-tx.mts:589–595, plus the header comment at :29), and the check count stays 20.
   - (c2) asserts the same card id, a null return, a null doc and JV 0.
   - red2 (`ledger/wo-notes/HF-GC-red2.txt`, run on 566349a7) shows 19/20 with only HT2.7 (c2) failing (it returned a doc, JV 1), residue 0.
5. **Owner lines in POS-OWNER-PENDING.md:**
   - The HF-GC line now says replay reads the payload flag, and the new fix-1 line is correct.
   - The open items are accurate: F2 (late-link), F3 (reload sets ACTIVE unguarded, next hotfix), FU-1 → HF-GC2 (real money), FU-2 (unsuspend) and FU-4 (WARN-only, no sweep).
   - The old "(3) needs a column" item was rightly removed, since F1 closed it.
6. **Gates ("Fix round 1" table, head=ceb281c1 dirty=0):** All match the requested values:
   - typecheck rc 0
   - fitness 50/50 without env and 50/50 with env
   - fitness-pos 8/8
   - hf-tx 20/20 forced and unforced (c2: JV 0, doc null, residue 0)
   - p1.6 48/48
   - account 16/16

   m2.x was skipped by controller ruling. The merge of 18669c3e is ledger-only: the `src`/`scripts` diff contains only the three fix commits.

Report saved at `/tmp/claude-0/-root/5169ed6b-3dd4-5e42-a1eb-90ec4124521e/scratchpad/hfgc-r/REPORT-R2.md`. The R1 report is in the same folder as `REPORT.md`.

# P2.1 S — reviewer report (read-only, Opus) · head `wip/pos-p2.1` 25ba4b13 (code 53a01f9b) · base e4672cfa · 9 Oct 2026 15:4xZ
(saved verbatim by the controller · prompt `pos-briefs/pos-prompt-accountB-P2.1-R.md`)

# P2.1 S review: `wip/pos-p2.1` 25ba4b13 (base e4672cfa), read-only
**Verdict: MERGEABLE-AFTER-FIXES.** One conditional money bug needs a fix of about 6 lines (F1). Everything else checks out to the satang. Oracle diff is empty (0 lines), so there is no ORACLE-EDIT. 53a01f9b..25ba4b13 changes only `ledger/wo-notes/pos-P2.1.md`.

## Findings
- **F1 (P2, money): a commission can be reversed when it was never posted.**
  - Cause: `posSalePaid` returns early when `status !== "PAID"` (`outbox-consumers.ts:140`). The commission JV is a separate step after PAID (`account-bridge.ts:171`).
  - Path: PAID posts, then the COMMISSION step throws (its own `ensureAccounting` tx, contact creation and post). The event backs off 2 minutes, or ends FAILED after 5 tries. Meanwhile the platform order is fully refunded, so the sale is `REFUNDED`.
  - The retry exits early and COMMISSION is never posted. The refund consumer re-posts only when the PAID JV is missing (`refund-consumer.ts:64`), but still posts `#COMMISSION_REFUNDED` with the full remainder (`:100–113`).
  - Result for the ฿420 LINEMAN bill: 1100 is left at +12 600 on "LINE MAN" (a phantom receivable) and 6500 at −12 600.
  - Fix: in step 1a, when `posted === true && sale.channelPayout && commission(+Vat) > 0`, call `applyExternalChannelCommission` for the sale before step 1c. It is idempotent on `PosSale#<saleId>#COMMISSION`. The alternative is to let `posSalePaid` run the commission step for `REFUNDED` sales once PAID exists.
- **F2 (P3): platform contact race.** `platformContact` (`account/index.ts:481`) finds then creates with no lock, so two concurrent first postings create two "LINE MAN" contacts and Parties (COMPANY), plus `account.contact.created` webhooks. `findContactForImport` (`service.ts:1124`) has no `orderBy`, so later postings can pick either duplicate. Totals stay correct; the subledger splits. Nothing in CRM consumes the event, so pollution is limited to one Party plus a customer contact (OK under CD6). Fix (account owner): advisory lock per (book, name) plus `orderBy createdAt asc`.
- **F3 (P3): the contact name is the channel's current name.** `saleChannelName` (`account-bridge.ts:138`, refund consumer) reads the live `SalesChannel.name`. Renaming a channel between sale and refund (or before a late drain) puts REFUNDED and COMMISSION_REFUNDED on a different contact, so the per-platform AR stops netting to 0 (the 1100 total is still right). Follow-up: snapshot the name on `PosSale`, or reuse the PAID 1100 line's contact.
- **F4 (P3, pre-existing race class): void between PAID and COMMISSION.** If the void consumer drains between the two `posSalePaid` steps, `reverseFor` reverses PAID only and the COMMISSION posted afterwards is orphaned (1100 −12 600 / 6500 +12 600). The same race exists for PAID alone; P2.1 makes the window wider. Follow-up: re-read the status before the commission step.
- **Nit:** the migration header calls it re-runnable, but the 3 `CREATE TYPE` statements have no guard. The brief allows plain CREATE TYPE.

## Verified OK
1. **Migration.** It contains exactly the names-table row 4 statements and nothing else:
   - `SET`/`RESET lock_timeout`, `ADD VALUE IF NOT EXISTS 'PLATFORM'` (unused in the file), 3 enums, `SalesChannel` with 21 columns (P2.8 defaults included)
   - unique `(unitId, code)`, index `(tenantId, systemId, unitId)`, and 6 `PosSale` columns: nullable, or `INT NOT NULL DEFAULT 0` (metadata-only)

   No drop, rename or update. Schema and SQL agree. `SalesChannel: sys()` is in `scope.ts`; it is in `POS_MODELS` and out of `POS_FUTURE_MODELS`.
2. **Pure math.**
   - `halfUpMulDiv` is floor((2ab+c)/2c) in BigInt, so it rounds half up.
   - GRAB: 7 750 + 200 = 7 950; VAT 556.5 rounds to 557. The commission is clamped to ≤ gross, and gross 0 gives 0/0.
   - 3 partials on ฿420 (12 345 / 14 321 / 15 334): 3 703.5 → 3 704, then 4 296.3 → 4 296, then the full refund takes 12 600 − 8 000 = 4 600, for Σ 12 600. A full refund after any partials takes `c − Σprior`, so drift is 0.
   - The parser uses exact keys and ranges, the regex, and never throws. `defaultChannelCode` maps ECOM to WEB and everything else to STORE.
3. **Channels.**
   - `createMany skipDuplicates` inserts the 4 builtins in a fixed order. A second tx blocks on the unique index and then does nothing (no P2002, no deadlock).
   - Presets get EXTERNAL / PLATFORM / MANUAL; others get CUSTOM / DIRECT / NONE; a builtin code gives CODE_TAKEN.
   - STORE is fully locked. Other builtins lock code and payout and cannot be archived (`:307`).
   - The limit of 30 counts archived rows, under an advisory lock per unit. Other-unit and other-tenant ids give CHANNEL_NOT_FOUND. Audits carry `actorId`.
4. **createSale.**
   - Additive input. `samePayload` compares the channel only when passed (legacy unchanged). Same key with another channel gives IDEMPOTENCY_CONFLICT.
   - Resolution (`service.ts:496`) runs before the counter, and a throw rolls back the builtin inserts. Snapshot at `:613`, re-based after member rights at `:705`.
   - R5 cases (`:420`) give `CHANNEL_PAY_MISMATCH`: PLATFORM on STORE/DIRECT, CASH, split, two PLATFORM rows, and an empty pay list.
   - Earlier refusals fire first in three cases: VALIDATION for a tip when tips are off, VALIDATION for cash tendered on a non-CASH row (both allowed by ruling 3), and PAYMENT_MISMATCH when the amount ≠ grand.
   - Deviation 4: the only MEMBER callers are gift-card sale, top-up and subscription (`giftcard/service.ts:409,679`, `subscription.ts:119`). None passes `channelId`, so the result equals CD2 and every MEMBER sale is correctly STORE.
   - Deviation 3: the default path only resolves BUILTIN rows, which cannot be archived. Only an inactive WEB is ignored, for ECOM. An archived channel cannot keep selling.
5. **Pay-type lists.** PLATFORM is in `PAY_TYPE_ORDER`/`LABEL_TH`, `POS_PAY_TYPE_LABEL` (CARD also added), `REFUND_`/`REGISTER_PAY_TYPES`, shift `METHOD_ORDER`, `ReceiptPayType` and the labels. REST is unchanged. `InterimPayDialog` has a hard-coded list, so there is no PLATFORM button.
6. **GL, hand-computed.**
   - Key resolution: the facade converts `PLATFORM_*` to AR, PAYMENT_FEE, AP and VAT_INPUT_UNDUE (`index.ts:473`), the only keys the resolver sees. All four are in `coa.ts` MAPPINGS (`:89–112`), and `ensureAccounting` (`:192`, `:517`) backfills mappings into pre-P2.1 books, so there is no 9999 line and no `needsReview`.
   - LINEMAN ฿420, VAT book: PAID Dr 1100 42 000 (contact) / Cr 4000 39 252 / Cr 2200 2 748; COMMISSION (GENERAL/ADJUST) Dr 6500 12 600 / Cr 1100 12 600 (contact); AR left 29 400.
   - GRAB ฿310: Dr 6500 7 950 + Dr 1155 557 / Cr 1100 8 507. Non-VAT book: Dr 6500 8 507 / Cr 1100 8 507 (PAID 1100 31 000 / 4000 31 000).
   - AGENT ฿420 CASH: PAID Dr 1000 42 000 / Cr 4000 39 252 / Cr 2200 2 748 (same as STORE); COMMISSION Dr 6500 4 200 / Cr 2100 4 200 (contact).
   - STORE: no COMMISSION. Unlinked: "unlinked", snapshot kept. Every entry balances (Σdr = Σcr = c+v).
   - Void: `reverseFor` reverses PAID and COMMISSION, so AR and 6500 net to 0; the REVERSAL key per entry makes replay safe.
   - Partial refund ⅓ (14 000): REFUNDED Dr 4000 13 084 / Dr 2200 916 / Cr 1100 14 000; COMMISSION_REFUNDED Dr 1100 4 200 / Cr 6500 4 200; AR left 19 600 (= 0.7 × 28 000).
   - AGENT refund: Dr 2100 / Cr 6500. `REFUND_METHOD_INVALID` works both ways (`refund.ts:418–420`).
   - Non-PLATFORM paths are byte-identical, checked line by line: no `channelName` key, `hasPlatform=false` skips seeding and contact lookup, `drLines`/`crLines` have the same keys, and `Book.dr(id, amt, undefined, undefined)` pushes the same line.
7. **Platform contact:** see F2. It sits on the PAID and COMMISSION 1100 lines and on the DIRECT 2100 line.
8. **Register.** `channelId` is in the quote, held-cart (canonical cart) and submit key sets, and `channelRef` is ≤ 40. The quote returns `channel {id, code, name, payout}`. CHANNEL_INVALID and the R5 pre-check work. Service charge applies only on STORE/QR_TABLE. `regDuplicate` treats a missing channel as STORE. STORE carts follow the P1.12/P1.15 paths unchanged.
9. **Readers.**
   - Bills: `salesChannel`/`salesChannelId`, with the old `channel` filter unchanged.
   - BillDetail: commission appears only through `evaluate(a, pos.report.view, unitId)` (`bills.ts:452`).
   - Receipt and public receipt carry `channel` (null for STORE). Grepping "commission" in the 4 receipt files returns 0.
   - Shift: PLATFORM is a non-cash row and expected cash is unchanged. The reports label comes from `PAY_TYPE_LABEL_TH`. Legacy bills use `defaultChannelCode`.
10. **Boundaries.**
    - POS reaches accounting only through `@/lib/modules/account` (grep returns 0).
    - `channel-shared.ts` has no imports.
    - `channel-actions.ts` exports 3 async functions and checks `pos.channel.manage` at the unit, re-checked in the service.
    - th and en have identical key sets, all required keys present.
    - The contract diff is exactly `channelId?` and `channelRef?`.
11. **Deviations 1–11: all accepted.** 1 protects WEB as the ECOM target; 3 and 4 see item 4; 5 is the literal reading of CD8; 6 puts the seam at the unit-price choice, which is fine; 2 and 7–11 need no comment.

**Gates:** every log header says `tree=/root/projects/shark-pos-b head=53a01f9b`.
- p2.1 53/53 ×3 (forced ×2, unforced). Money suites: qc-pos-account 16, account-cpa 107, restaurant 6, shop-refund 12, hotel 5, ticket 6, subscription 14. fitness 41/41 with and without env; fitness-pos 8/8.
- First-pass reds (p1.3 S1.9/S9.x, p1.5 Z, p1.7 Z2, p1.9 Z) were seed-tenant drift only: PosSale, payments, held carts, payment intents, the receipt counter, and a `PQC-VIS-*` product. No SalesChannel rows were involved. All four were green on re-run.

## Follow-ups
- **P2.1U:** `BillRow.salesChannel` is never null today. The commission block computes net = grand − c − v. There is no register picker.
- **Account owner:** F2 (lock + `orderBy`) and F3 (name snapshot). `ensureAccounting` now runs on every PLATFORM or commission posting (cost).
  - **O25:** option B would also need `postExternalRefund.crLines` widened beyond `"AR"`.
  - **O26:** if VAT registration changes between sale and refund, the `foldVat` mismatch would leave a 1155 residue.
- **P6.1:** the CONCURRENTLY index on `PosSale.channelId` and the backfill (CD9).

---
## Controller rulings (15:4xZ) → fix round 1 (`pos-prompt-accountB-P2.1-S-fix.md`)
F1 fix (post the missing COMMISSION in the refund consumer before reversing; ORACLE-EDIT R6) · F2 fix now inside the marked facade block (advisory lock per book+name, orderBy createdAt asc) + note to the account owner · F3 fix (refund-side contact = the PAID entry's 1100 contact when present) · F4 fix (re-read sale status before the commission step) · nit: migration header comment.

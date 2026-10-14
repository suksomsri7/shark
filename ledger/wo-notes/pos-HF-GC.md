# POS HF-GC — gift card: balanceAfter from the locked row (H1) + crash-safe 2110 liability post on sell (H2)

Brief `ledger/pos-briefs/pos-brief-HF-GC.md` · builder account B · tree `/root/projects/shark-pos-b` · branch `wip/pos-hf-gc` from `session/pos` 3e39c68c (code adbb1640).
Prisma client: generated 10 Oct 11:18, schema diff vs `prisma/schema/*.prisma` = comments only ⇒ **no `prisma generate`**.

## Status
- [x] 1 oracle HT2.6 + HT2.7 (`scripts/qc-hf-tx.mts` 18 → 20) · red-before `ledger/wo-notes/HF-GC-red.txt` (7d9fd132)
- [x] 2 H1 (cf5e8528)
- [x] 3 H2 helper + paths + consumer backstop + payload flag (a0658d6f)
- [x] 4 owner lines + these notes
- [x] 5 merge `origin/session/pos` 44ee7f4c (ledger-only) → 14742f2b → gates (table below)

## Hunks (file:line at a0658d6f)
H1 — `after`/`balanceAfter` from the row this transaction holds locked (never the pre-tx `loadByNumber` read):
- `src/lib/modules/giftcard/service.ts:771–778` reload — `update({ increment, select: { balanceSatang } })` → `after = upd.balanceSatang` (was `card.balanceSatang + satang` :725 on base).
- `service.ts:643–645` use — conditional `updateMany` (`gte` guard, takes the row lock) then `findUniqueOrThrow` in the same tx → `after` (was `card.balanceSatang - satang` :599). `use` already had the lock (`updateMany … balanceSatang: { gte }`); only the `after` was stale ⇒ fixed per brief Facts bullet 3. DEPLETED decision now uses the locked value.
- `service.ts:948–957` refundUse — increment with `select { balanceSatang, status }`; DEPLETED→ACTIVE decided on the locked row (was `card.status` pre-read + `after` pre-read :898).
- `service.ts:851 · 880 · 909` transfer / suspend / unsuspend — ADJUST/TRANSFER rows (satang 0) now record `balanceAfter` from the update result (was the pre-tx snapshot).
H2 — `ensureGiftCardSalePosted(tenantId, giftCardId, { accountingLink })`:
- `service.ts:307–355` helper (single writer of `accountingDocId` · §9 ruling 1). Early-out: switch off / card missing / `accountingDocId` set / no POS system or sale. Pay channels from the card's own `PosPayment` rows; `occurredAt = GiftCard.createdAt`; `satang = initialSatang`. `postGiftCardSale` → `unlinked` ⇒ null; `entryId` or (posted-before / P2002) ⇒ read the existing entry by ref; `updateMany where accountingDocId: null`.
- `service.ts:409–418` sell replay (entry) + `:547` P2002 retry replay → `replayed()` = `sellReplay` + helper with the switch **at replay time**.
- `service.ts:536` `giftcard.sold` payload `accountingLink: settings.accountingLink` (additive).
- `service.ts:554–555` normal path: inline post replaced by the helper (same response shape · still synchronous).
- `src/lib/outbox-consumers.ts:1030–1037` (8 lines) `giftcard.sold` = `withAutomation(compose(memberBridge("onLoyaltyEvent"), backstop))` — timeline stays the base step; backstop is the `compose` extra (failure = WARN, never re-throws ⇒ no automation re-fire on retry); acts only when `payload.accountingLink === true`.
- `src/lib/modules/giftcard/index.ts:34–35` facade export.
- `src/lib/modules/account/gl.ts:1947–1955` + `src/lib/modules/account/index.ts:84, 623–634` **read-only** reader `giftCardSaleEntryId` (see CONTROLLER-DECISION).

## Switch rule (Scope 3)
No column on `GiftCard` records the switch decision (`prisma/schema/giftcard.prisma:28–61`; `accountingDocId` null is ambiguous after a crash) and this card allows no schema change ⇒ the rule is: **consumer = `payload.accountingLink` (sale-time decision; rows emitted before HF-GC have no flag ⇒ never post)** · **replay path = `settings.accountingLink` at replay time** · normal path = settings at sale time. Residual: switch flipped off→on between a sale and a same-key replay would post that card (FU-3).

## Idempotency proof
- `src/lib/modules/account/gl.ts:1909–1945` `postGiftCardSale` → `alreadyPosted(ctx, "${refType}#${refId}#GIFTCARD_SOLD")` (`gl.ts:280–286`) returns `{ skipped: true }` (facade: `posted-before`, no `entryId`), and `commitEntry` writes `idempotencyKey` (`gl.ts:244, 261`) under `@@unique([tenantId, idempotencyKey])` (`prisma/schema/account_gl.prisma:493`) ⇒ two concurrent posts: the loser fails P2002 and rolls back.
- The facade had **no reader by ref** ⇒ added read-only `gl.giftCardSaleEntryId` + `account.giftCardSaleEntryId` (same key) so the helper can re-link after `posted-before` / P2002. No writer changed in `account/**`.
- Proven by the oracle (§9 ruling 2): HT2.7 JV count by `refType "GiftCard", refId` = 1 after sell, after replay, after consumer ×2 sequential + ×2 parallel; 0→1 for a card sold while unlinked; 0 for a switch-off card after switch-on + consumer ×2.
- **CONTROLLER-DECISION**: the read-only reader in `account/gl.ts` + `account/index.ts` (marked `POS HF-GC`) — brief allows a reader, forbids writers; precedent `posSaleEntryPosted` (P2.1 fix 1). If rejected, the helper cannot restore `accountingDocId` when the entry already exists (HT2.7 (a)/(b) would stay red).

## Red-before (base code adbb1640 + new oracle · `HF-GC-red.txt`)
18/20 · HT2.6 ❌ `balanceAfter 110000 ×5` (want 110000…150000; card balance 150000 correct) · HT2.7 ❌ (a) replay returns `accountingDocId` null (JV 1) · (b) consumer leaves null · (b2) unlinked-then-linked JV 0→0 · (c) green on base (guard). Residue 0.

## Gates
All logs headed `tree=/root/projects/shark-pos-b head=14742f2b dirty=0` (scratch `hfgc/gates/*.out`, 14 Oct 12:54–13:20Z); head 14742f2b = code a0658d6f + upstream 44ee7f4c (ledger only).
| gate | tree= head= | result |
|---|---|---|
| typecheck (pos-gate.lock · 5632/6500M) | shark-pos-b 14742f2b | rc 0 |
| fitness no-env / env (qc4) | shark-pos-b 14742f2b | 50/50 · 50/50 |
| fitness-pos | shark-pos-b 14742f2b | 8/8 |
| qc-hf-tx forced / unforced | shark-pos-b 14742f2b | 20/20 · 20/20 (residue 0) |
| qc-pos-p1.6 | shark-pos-b 14742f2b | 48/48 |
| qc-pos-account | shark-pos-b 14742f2b | 16/16 |
| qc-pos-p1.3 | shark-pos-b 14742f2b | 128/128 |
| qc-pos-p1.1 | shark-pos-b 14742f2b | 180/180 |
| qc-pos-p2.8 | shark-pos-b 14742f2b | 61/61 · PAR 4/4 |
| qc-member-m2.6 / m2.7 / m2.8 | shark-pos-b 14742f2b | known QC4 setup failure, run once, not reseeded: `💥 TypeError: Cannot read properties of null (reading 'role')` → `M2.x-ERR` (×3) |

## Follow-ups (not in this card)
- FU-1 `expireDue` (`service.ts:1030`) `leftover = card.balanceSatang` read before the tx ⇒ use ∥ expiry cron = EXPIRE txn + 4900 JV overstated (the `status: ACTIVE` guard prevents doubles, not staleness). Fix = read the balance under the lock (`SELECT … FOR UPDATE` or update-returning) — owner line added.
- FU-2 `unsuspend` (`service.ts:907`) decides ACTIVE/DEPLETED from the pre-tx balance.
- FU-3 durable switch decision per card needs a column (`GiftCard.accountingLinkAtSale`) — schema change ⇒ separate card.
- FU-4 the backstop step failing (e.g. period closed) is WARN-only by the `compose` contract ⇒ such a card waits for the next same-key replay; a sweep (cards with `saleId`, no `accountingDocId`, sold with the switch on) would need FU-3.

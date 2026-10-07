# POS RUN — common brief (read before every WO)

Design: `ledger/DESIGN-POS.md` · contracts: `ledger/POS-CONTRACTS.md` · API: `ledger/POS-API.md` · migration: `ledger/POS-MIGRATION-PLAN.md` · plan: `ledger/POS-MASTER-PLAN.md` · mockups: `ledger/design-pos/NN-*.png` (your screen numbers are listed in your WO row).
Shared rules = `ledger/crm-briefs/crm-brief-COMMON.md` (machine, iso.sh, gate lock, notes template, 12 gates) — apply verbatim with these POS additions:

1. Money is integer satang everywhere. `Σ payMethods == grandTotal` exactly. VAT rounds half-up at bill level, never per line.
2. `createSale` / `voidSale` / `refundSale` signatures consumed by hotel/restaurant/booking/ticket/shop/subscription must stay backward compatible. Add fields; never rename or change meaning.
3. Catalog writes go through `src/lib/modules/pos/catalog.ts` only (fitness F15.1). Never update `InvItem.onHand` directly — Inventory C-1.
4. Every new outbox event must have at least one consumer registered in `src/lib/outbox-consumers.ts` and an oracle that replays it twice without double effects.
5. Member v2 objects (Voucher, GiftCard, StampCard, MemberAttribution, MemberTierBenefit) are reused — do not create parallel tables. `PosSale` already has the link columns.
6. UI: tokens only (`docs/UI_STANDARD.md`), Thai strings via `src/messages/{th,en}.json` key `pos.*`, buttons ≥44px, pages must match the mockup; run `scripts/visual-pos.mts <wo> --user owner|cashier` at 1440×900, 1024×768, 390×844 and attach PNGs.
7. Before claiming done run: your WO oracle · `qc-pos-*` all · `qc-account-cpa.mts` · `qc-restaurant-money.mts` · `qc-shop-refund.mts` · `qc-hotel-money.mts` · `qc-ticket-money.mts` · `qc-subscription-money.mts` · `pnpm fitness` (with and without .env) · `pnpm typecheck` via gate lock. Paste exit codes.
8. Do not run `eas`, deploy, or touch `.env`. Use `.env.qc` DB only. Do not commit `.qc-shots`.
9. Reply to the owner in Thai; write code comments in Thai (repo convention).

# POS P2.7U — QR สั่ง / สั่งล่วงหน้าจ่ายก่อน (UI half) · builder notes

Builder U · VPS account B · 16 Oct 2026 · tree `/root/projects/shark-pos-b` · branch `wip/pos-p2.7u` from `session/pos` **92b7149d** (P2.7 S merged; origin/session/pos da27141d = 92b7149d + ledger only).
Contract = `wo-notes/pos-P2.7.md` "U-card contract" + brief `pos-brief-P2.7.md` §3 §5 §10 rulings 11 15 16. Spec = `ledger/pos-briefs/pos-spec-P2.7-qr-ui.md` (states × viewports §8).
Logs: `/tmp/claude-0/-root/a129a720-3235-582c-8bcd-f2169f38cd68/scratchpad/p27u/runs/` (line 1 = `tree= head= dirty=`).

## Status
Built on `wip/pos-p2.7u` (not merged). All gates green at 99f9f80c (step 5 head, dirty 0); step 6 (51ce736a) is a client-only phone pre-normaliser in `components/pos/qr` — re-checked with `qc-pos-p2.7 --no-db` 4/4 (ST1–ST4 incl. ST7) + pre-commit fitness + typecheck-2 at the final head. Images = CONTROLLER-RUN on QC5 (below).

## Commits (one per step)
| step | commit | what |
|---|---|---|
| 1 | a712bd85 | public pages `/q/t` `/q/<link>` `/q/o` restyled → server frame + client islands (`components/pos/qr/*`) · additive DTO fields · read-only `tableBillAction` · `pos.qr.*` th/en · inventory rows |
| 2 | 86875e98 | 09: QR table rounds (rail + cards) · "รอชำระ N" · PREPAID / claim chips · confirm payment · late-money + expired banners · panel · `qr-staff*` reader/actions · additive `OrderCard.prepay.latePaid` |
| 3 | 6d3d36da | 03: table QR dialog (image · link · copy · print · rotate + confirm) · "พิมพ์ QR ทุกโต๊ะ" A4 sheet |
| 4 | 7bc979e0 | settings › channels: QR_TABLE / QR_ORDER drawer block (active · auto-accept · prep · pause · pre-order link + QR + copy + create/rotate + confirm) |
| 5 | 99f9f80c | `visual-pos` wo `p2.7` (`POS_PAGES` `qr-public` + `P27_PLAN` + fixture/cleanup) · spec `pos-spec-P2.7-qr-ui.md` |
| 6 | 51ce736a | pre-order phone input: Thai digits / `0066` / `+66 (0)` → server `normalizeThaiPhone` (hunter note 3 line · client only) |

## Files
- New: `src/components/pos/qr/{qr-ui.ts, use-qr.ts, QrPublicFrame.tsx, QrCodeImage.tsx, QrMenu.tsx, QrCart.tsx, QrTableApp.tsx, QrPreorderApp.tsx, QrOrderStatusApp.tsx}` · `src/components/pos/orders/QrOrderBits.tsx` · `src/components/pos/tables/TableQr.tsx` · `src/app/app/sys/[id]/pos/settings/QrChannelBlock.tsx` · `src/lib/modules/pos/{qr-staff-shared.ts, qr-staff.ts, qr-staff-actions.ts}` · `ledger/pos-briefs/pos-spec-P2.7-qr-ui.md`.
- Rewritten (S minimal pages → U): `src/app/(store)/q/t/[qrToken]/page.tsx`, `q/[linkToken]/page.tsx`, `q/o/[orderToken]/page.tsx` (still force-dynamic · noindex · no session · token-shape notFound · read via `pos/qr-order` — ST4 green).
- Marked hunks (`POS P2.7U ▸ … ◂`): `pos/qr-order-shared.ts` (DTO `QrShopHeader`, `shop?` on table/link/status views, `orderAgainToken?`) · `pos/qr-order.ts` (`shopOf` via `receiptShopHeader`, read-only; `posOrderLink.findFirst` read for `orderAgainToken`; `systemId` in the status select) · `(store)/q/actions.ts` (+ `tableBillAction`, read-only wrapper of the S `tableBill`) · `pos/order-shared.ts` + `pos/order.ts` `cardsOf` (+ `prepay.latePaid` from one `posOrderEvent.findMany(type late_payment)` read) · `components/pos/orders/{OrdersScreen, OrdersRail, OrderCardView, OrderPanel, orders-ui}` · `components/pos/tables/{TablesScreen, TablePanel, TableFloor}` · settings `ChannelDrawer.tsx` + `ChannelsPanel.tsx` (QR_ORDER icon) · messages th/en (`pos.qr.*`, `pos.orders.{qr,awaiting,prepaid,late,expired,toast.paymentConfirmed,detail.onAcceptPrepaid}`, `pos.tables.qr.*`, `pos.channel.qr.*`) · `scripts/pos-ui-inventory.json` (+60 rows) · `scripts/pos-qc-env.mts` (`POS_PAGES` + `qr-public`) · `scripts/visual-pos.mts`.
- Untouched: `payment-intent.ts`, restaurant module, `register.ts`, `service.ts`, `tender.ts`, schema/migrations. No server money/state change: the only new server code is read-only (`qr-staff.ts` reads RestaurantOrder/Table like `qr-order.legacyTableQrRedirect`; actions are thin session wrappers over existing S doors `get/create/rotate/revokeOrderLink`, `registerRotateTableQr`).

## Additive DTO fields (listed per prompt)
`QrTableView.shop?` · `QrLinkView.shop?` · `QrOrderStatusView.shop?` · `QrOrderStatusView.orderAgainToken?` (qr-order-shared/qr-order) · `OrderCard.prepay.latePaid?` (order-shared/order.ts cardsOf · read-only · needed for the S5 late-money banner — the prompt allows "additive read-only DTO fields only, marked" in order.ts).

## States (spec §8 · `visual-pos p2.7 --states`)
- qr-public (390 + 1024 · th + en): table-menu · table-cart · table-sent · table-rounds · table-bill · table-notified · table-payhidden · table-closed · table-bad-token · pre-menu · pre-cart · pre-checkout · pre-pay · pre-claimed · pre-paid · pre-accepted · pre-ready · pre-expired · pre-rejected · pre-closed.
- orders (3 sizes th · 1440 en): orders-qr-rows · orders-awaiting · orders-prepaid · orders-claim · orders-late-banner. tables: tables-qr-dialog · tables-qr-print. settings: settings-channel-qr-table · settings-channel-qr-order.
- Dry: th 67 shots · en 49 shots.
- CONTROLLER-RUN (QC5 :3228): `visual-pos p2.7 --states --user owner --tenant coffee --base http://127.0.0.1:3228` th, then `LOCALE=en` (inside iso). Fixture writes (coffee only, `posqc-vis-p27-<pid>`): zone + 3 tables + guest rounds + split plan (deleted) · pre-order link (created only if none — deleted) · 9 pre-orders via `placePreorder` (rows without sale deleted with lines/events/intents/outbox/audit/ops of the run; the 2 accepted ones have a real PromptPay sale — handed over and kept, like P2.8U) · QR_TABLE/QR_ORDER active/pause/auto-accept restored · PromptPay ID via P1.7U helper (restored) · rate buckets `pos:qrSubmit:posqc-vis-p27-<pid>*` deleted. Public-page requests carry `x-forwarded-for: posqc-vis-p27-<pid>-ui`.

## Gates (logs `runs/`)
| gate | result | log |
|---|---|---|
| qc-pos-p2.7 unforced (unchanged suite) | 42/42 | g1-qc-pos-p2.7.log |
| qc-pos-p2.7 `--no-db` at final head 51ce736a | 4/4 (ST1–ST4) | (console) |
| qc-pos-p2.8 · p2.4 · p2.6 | 61/61 · 50/50 · 67/67 | g1-qc-pos-p2.8/p2.4/p2.6.log |
| qc-restaurant · -pay · -money · -void | pass · 19/19 · 6/6 · 11/11 | g1-qc-restaurant*.log |
| qc-hf-pos-page-authz | 82/82 | g1-qc-hf-pos-page-authz.log |
| qc-pos-p1.16 · p2.10 | 28/28 · 13/13 | g1-qc-pos-p1.16/p2.10.log |
| extra: qc-pos-p1.3 · p1.1 · p2.1 · p2.13 | 128/128 · 180/180 · 55/55 · 54/54 | g1-qc-pos-p1.3/p1.1/p2.1/p2.13.log |
| fitness no env / env (qc4) · fitness-pos | 53/53 · 53/53 · 8/8 | g1-fitness-noenv/env/pos.log |
| visual-pos p2.7 --states --dry th / en (iso, CI=1) | exit 0 (67 / 49) | g1-visual-dry-th/en.log |
| typecheck (heap 8192, 2 runs) | exit 0 @7bc979e0 · exit 0 @51ce736a (final code head, dirty 0) | typecheck-1/2.log |
Lane pins: none red — origin/session/pos (da27141d) contains the base, so p2.10 ST2 / p2.13 ST5 etc. compare correctly (p2.10 13/13, p2.13 54/54).

## Deviations
1. **Staff read-only door `qr-staff.ts`** (new): the S card had no staff read for QR table rounds / table QR tokens; reads RestaurantOrder (DINE_IN · `placedByUserId null` · today) and RestaurantTable directly (read-only, same as `qr-order.legacyTableQrRedirect`) behind `registerScopeFor(pos.sale.read|create)`. No restaurant module change. Done QR rounds list only today's rounds (all sessions).
2. **`tableBillAction`** added to `(store)/q/actions.ts` (read-only wrapper of the S `tableBill`) so the island refreshes the bill after a poll change; ST4 (async-only, qr-order) green.
3. **No-JS fallback**: the U pages are client islands; the S `…FormAction`s stay exported (unused) and `?e=` notices are still shown.
4. **Print/QR colours**: QR boxes and the A4 sheet use white/black (`bg-white`, neutral borders) for scannability/paper — precedent `DepositReceiveDialog`.
5. **Settings drawer onSaved**: the active switch inside the QR block updates the block only (the panel row refreshes on reopen) — avoids closing the drawer.
6. Rail total "ทุกช่องทาง N" = server order count + QR rounds; column pills = server count + QR round cards of that column (counting only — money still from the server).

## Follow-ups (owner lines)
- Static order QR without an EMV reference (tag-62) — unchanged from S.
- Done QR rounds are per round, not per table bill; a "paid table" row would need the sale link (P2.14).
- Phone: 9-digit landline numbers still accepted by the server rule (S contract); the client now maps Thai digits / 0066 / +66 (0).
- `pos.orders.expired.row` / `late.row` keys exist for a future done-row flag (CANCELLED orders are not on the board).

# POS P2.8U — UI ออเดอร์ทุกช่องทาง (09 rail + 4 columns + detail panel · manual order sheet · register tab badge) · builder notes

Builder U · account B · 10 Oct 2026 · tree `/root/projects/shark-pos-b` · branch `wip/pos-p2.8u` from `session/pos` **c81f5bbf** (tree was clean on `wip/pos-main-merge`; `prisma generate` run once in tree b — own node_modules; client already had `posOrder`/`restaurantReservation`).
Merged `origin/session/pos` **a693c9b3** (HF-TX 831ad163 + ledger) after step 7 and before all final gates → `02c1a6d7` — `merge-tree` clean, no conflicts, no schema change (HF-TX touches `order.ts`/`register.ts`/`service.ts`/giftcard; none of the P2.8U files).
Contract: prompt `ledger/pos-briefs/pos-prompt-accountB-P2.8U.filled.md` rulings 1–9 · `wo-notes/pos-P2.8.md` §"P2.8U contract" + both "P2.8U contract additions" · brief `pos-brief-P2.8.md` §6 + §9 · spec written: `ledger/pos-briefs/pos-spec-P2.8-orders-ui.md`.
No server behaviour change: no edit to `pos/order.ts`, `shop/**`, `register.ts`, `outbox-consumers.ts`, `pos-sale-contract.json`, `prisma/`.

## Steps (commit per step · explicit paths)
Built in one pass and committed grouped by step (intermediate commits are not independently buildable — the page imports the screen of steps 2–6; the pre-commit fitness hook was green on every commit because it reads the complete working tree).
| step | commit | content |
|---|---|---|
| 1 | 309986f9 | `/pos/orders` page (404 without an accessible linked unit · O13 refusal card `pos-orders-refusal` before any read) · `access.ts posOrdersView` · `RegisterModeTabs` live tab + badge (`useOrdersBadge`) · `RegisterScreen` passes `unitId` · `NavRail.isRailPath` + `/pos/orders` · `POS_PAGES` + orders · `qc-hf-pos-page-authz` OR-1…OR-9 · all `pos.orders.*` keys th/en |
| 2 | 7bb393d6 | `OrdersRail` (rail + `RailSettings` + `ChannelChooser`) · `order-ui-actions.ts ordersChannelsAction` |
| 3 | 0f2f0cb9 | `OrdersScreen` (frame · poll · sound · banners · columns) · `OrderCardView` (+ `DoneRow`, `ChannelChip`, `PlannedChip`) |
| 4 | 0bac6b51 | `OrderPanel` · `OrderPay` · bills page `?bill=` (sales `page.tsx` + `BillsClient.tsx` marked hunks) |
| 5 | 498cc626 | `OrderDialogs` (reject · cancel · pause · prep) |
| 6 | 1a9ef5f5 | `ManualOrderEntry` (manual sheet) |
| 7 | d1e6aa6b | `visual-pos.mts` wo `p2.8u` · `pos-ui-inventory.json` (+64 rows · `pos-reg-tab-*` note) · spec |
| 8 | 02c1a6d7 | merge `origin/session/pos` a693c9b3 |

## Components (new files under `src/components/pos/orders/`)
`OrdersScreen` (state owner) · `OrdersRail` · `OrderCardView` · `OrderPanel` · `OrderDialogs` · `OrderPay` · `ManualOrderEntry` · `orders-ui.ts` (pure: clock re-export from `tables/table-ui`, mm:ss, accept/prep timers from server timestamps, column sort, keys, sound pref + WebAudio beep, `OrdersChannel` type) · `use-orders-badge.ts`. Server: `src/app/app/sys/[id]/pos/orders/page.tsx` · `src/lib/modules/pos/order-ui-actions.ts` · `access.ts posOrdersView`.
Client imports: only `*-shared` / `*-actions` / `device-id` / `staff-session` + register/settings components. Money is never computed in the UI (cards/summary from `listOrdersAction`, panel total + commission/net from `OrderDetail`, manual sheet from `quoteRegisterCartAction({channelId})`, pay due = `OrderDetail.totalSatang`).

## Keys (`src/messages/{th,en}/pos.json` · same set th/en · F15.4 green)
Added 83: `register.tabs.ordersBadge` · `orders.page.*` 7 · `orders.perm.*` 3 · `orders.card.{kitchenMeter,rider}` · `orders.rail.{label,autoAcceptFor,autoNone,autoPauseKitchen,prepMixed,appliesTo,pauseHint}` · `orders.prep.*` 4 · `orders.detail.{close,customer,customerNoteLine,onAcceptSaleNow,onAcceptSaleLater,customerSection,historyLabel,isMember,timeline,webPaidNote}` · `orders.event.*` 12 (received accepted preparing ready completed rejected cancelled paid paid_reverted sale_bound prep_changed refunded) · `orders.actions.viewBillNo` · `orders.columns.{empty,label}` · `orders.toast.*` 15 · `orders.manual.*` 19. Changed values (keys kept): `orders.card.items` (amount in `<b>`), `orders.detail.onAcceptPlatform` ("แจ้ง {channel} ว่ารับออเดอร์แล้ว"), `orders.detail.onAcceptKitchen` (same text). ST7: 0 Thai literals outside `t()` in `src/components/pos/**` and `src/app/app/sys/[id]/pos/**` (comments only).

## testids
Orders page `pos-ord-*` (full list in the spec): root `pos-ord-root` · rail `pos-ord-rail`, `pos-ord-ch-all`, `pos-ord-ch-<code>`, `pos-ord-ch-select`, `pos-ord-auto-<code>`, `pos-ord-prep-default`, `pos-ord-pause`, `pos-ord-pause-<15|30|60|open>` · board `pos-ord-head`, `pos-ord-sound`, `pos-ord-updated`, `pos-ord-manual`, `pos-ord-paused-<code>`, `pos-ord-reopen-<code>`, `pos-ord-col-<column>`, `pos-ord-coltab-<column>`, `pos-ord-new-left`, `pos-ord-card-<ref>` (`data-status`, `data-late`), `pos-ord-card-{accept,reject,handover,timer}-<ref>`, `pos-ord-done-<ref>`, `pos-ord-summary`, `pos-ord-empty` · panel `pos-ord-panel` (`data-status`), `pos-ord-accept`, `pos-ord-reject`, `pos-ord-prep-edit`, `pos-ord-prep-change`, `pos-ord-start`, `pos-ord-ready`, `pos-ord-handover`, `pos-ord-pay`, `pos-ord-cancel`, `pos-ord-bill`, `pos-bill-commission*` · dialogs `pos-ord-{reject,cancel,pause,prep}-sheet` + controls · pay `pos-ord-pay-dialog` (wraps `pos-reg-paydlg`) · manual `pos-ord-manual-sheet`, `pos-ord-man-*`. Register: `pos-reg-tab-orders-badge` (display-only — covered by the `pos-reg-tab-*` row, note updated). Inventory +64 rows (F15.3a/b green).

## Deviations (ruling touched)
1. **r2 thin wrapper** `ordersChannelsAction` (`order-ui-actions.ts`, "use server", read-only, first-layer `assertCan` pos.sale.read|create + `listChannels` gate): the contract has no reader for `autoAccept`/`prepMinutes`/`pausedUntil` per channel (`ChannelItem` has 12 fixed keys; `setChannelOrderSettingsAction` returns the view only for a changed channel and needs `pos.order.accept`, but cashiers must see the paused banner).
2. **r5 pay dialog**: `PayDialog` with `intent = null` — `payOrder` does not consume P1.7 payment intents (they are keyed to register carts) ⇒ PromptPay = static QR + manual confirm (P1.6), card = EDC reference; no tip, no breakdown lines (due = `OrderDetail.totalSatang`). No `PayDone` (receipt print) — toast + reload.
3. **r5 "bills drawer by saleId"** = link `pos-ord-bill` → `/pos/sales?unit=&date=<Bangkok date of accept/receive>&bill=<saleId>` which opens the existing drawer (`BillsClient initialBillId`, marked hunks in sales `page.tsx` + `BillsClient.tsx`); the drawer is inline in the 2,093-line `BillsClient`, extracting it = large foreign refactor.
4. **r5 commission block**: same markup/testids/keys as P2.1U (`pos-bill-commission`, `pos.channel.commissionBlock.*`) rendered in `OrderPanel` from `OrderDetail.commission`; rate text = `channelRateText` of the channel's current rates (not extracted from `BillsClient` — no foreign refactor).
5. **r2 settings target**: prep default + pause are per-channel settings ⇒ applied to the rail's selected channel, or to every rail channel when "ทุกช่องทาง" is selected (line "ใช้กับ: …"); prep select shows "หลายค่า" when targets differ; "จนกว่าจะเปิดเอง" = now + 24 h − 1 min (server cap 24 h). Auto-accept switches always list every non-MANUAL rail channel.
6. **r1 badge poll** lives in `RegisterModeTabs` (`useOrdersBadge`) ⇒ register + tables pages poll while the tab bar is mounted (md+; mobile has no mode tab bar, like mockup 05 ⇒ no badge on mobile); the orders page passes its own count (no double poll).
7. **r3 "tab badge"** read as the browser-tab title prefix "(N) " while sound is on (the mode-tab badge is always shown).
8. **r6 manual sheet**: catalogue = compact search list (`registerCatalogAction`) + register `OptionsDialog` reused; `ProductGrid/ProductCard` not reused (coupled to register cart/stock UI); sold-by-weight products disabled (ingest has no weight); ref required only for kind CUSTOM (literal ruling); start state shown for MANUAL-adapter channels, payment state for DIRECT payout; conversation/party = free-text ids (no chat import/picker — hard rule); member = `registerMemberLookupAction`.
9. **r7 `orders-empty`** = owner only (unit อารีย์): the QC cashier has one unit (สีลม) where each fixture run keeps one HANDED LINE MAN order (its PLATFORM sale), so an empty day there is impossible.
10. **r7 timing states**: `orders-mixed` waits ≤ 90 s for the late card (prep 1 min, client clock from server timestamps) · `orders-new-late` waits ≤ 75 s per shot for countdown < 60 s (a Grab order created right before the first shot; recreated with a new key when < 8 s left) — no raw time edits.
11. **r5 cashier reject state**: `orders-reject-sheet` for the cashier = panel with disabled accept/reject (no `pos.order.accept/reject`), asserted by the harness.
12. **r4 card accept** uses the channel prep default (no prepMinutes); the panel accept sends the edited value ("แก้เวลา").
13. **Contract addition `listOrders.since`** not used: the board shows the server's default window (today + still-open earlier orders); no date picker in 09.

## Fixtures (visual `p2.8u` · coffee tenant · unit สีลม)
Module functions only (owner actor): channels LINEMAN/GRAB via `ensureChannelFixture` (P2.1U) + builtin CHAT + **QCPHONE "โทรสั่ง (ภาพ QC)"** (DIRECT, adapter MANUAL — find by code / create / fix · never deleted, P2.1U pattern) · orders via `ingestOrder` with per-run keys `posqc-vis-p28u-<pid>-<time36>-<n>` and per-run refs (`TEL-…`, `LM-…`, `GF-…`): PREPARING late (QCPHONE, prep 1) · PREPARING (QCPHONE, prep 30) · READY (QCPHONE DELIVERY, PAY_ON_PICKUP) · NEW LINE MAN / Grab / CHAT unpaid · Grab rejected · **one PLATFORM accept per run**: LINE MAN accepted → preparing → ready → handed (creates one PLATFORM sale; the order and the sale are **kept**, same as the P2.1U bills fixture) · `orders-new-late` Grab created before the first shot · `orders-paused-banner` pauses CHAT for 30 min via `setChannelOrderSettings` and restores the previous `pausedUntil` after the last job of that state / finally. **No fixture pays.** Every other order of the run (+ `PosOrderLine`/`PosOrderEvent`, `OutboxEvent pos.order.*#<id>`, `AuditLog` targetType PosOrder) is deleted by id after the last fixture job, in `finally` and on SIGINT/SIGTERM/SIGHUP (refuses to delete an order that has a sale). Channel-settings audit rows (pause/restore) stay.

## `--state` list for the controller (QC5 · new page ⇒ full set)
- `LOCALE=th|en visual-pos.mts p2.8u --states --page orders --user owner|cashier --base <QC5>`: `orders-empty` (owner only), `orders-mixed`, `orders-new-late`, `orders-detail-platform`, `orders-detail-direct-unpaid`, `orders-paused-banner`, `orders-reject-sheet`, `orders-manual-sheet`, `orders-pay-dialog` (1440/1024/390; en = 1440).
- `LOCALE=th|en visual-pos.mts p2.8u --states --page register --user owner|cashier --base <QC5>`: `register-tab-badge` (1440/1024).
- Touched existing screens (re-shoot, same keys as before): register `default` (online-orders tab = link + badge) · tables `tables-floor` (mode tab link) · sales `bills-drawer` (unchanged without `?bill=`).
- Cashier expectations: page 200 for all states; accept/reject/progress/settings buttons disabled or hidden (no `pos.order.accept/reject`), "+ คีย์ออเดอร์" and "รับเงิน" enabled (`pos.sale.create`).
- `orders-new-late` adds ~60 s per run; `orders-mixed` the first time ~60 s (late card).

## Owner lines (for `POS-OWNER-PENDING.md`, controller)
- 09 manual sheet is derived (ruling 8) — design call still pending; this build ships the builder proposal with the in-sheet note `orders.manual.derivedNote`.
- Shop admin screen message for `POS_ORDER_CLOSED` (fix round 3 addition) is a web-shop screen, not part of 09 — not done here.

## Follow-ups
- F-U1 Payment intents (P1.7 QR/Beam) for order payments need S support (`payOrder` consuming `pi_…`).
- F-U2 Kitchen meter / auto-pause (P2.6) · rider rows / shipping label (P3) · QR table rounds row (P2.7) — PLANNED chips in place.
- F-U3 Member name/tier on the panel needs the S DTO (`OrderDetail` has `memberId` only).
- F-U4 Badge on mobile (no mode tab bar < 768).
- F-U5 Manual sheet after the owner's design (grid with images, weighed items).

## Gates (code head `02c1a6d7` · logs `scratchpad/p28u/runs/gate-G-*.log`, header `tree= head= dirty= gate= start=` per log · summary `runs/gates-summary-G.txt` · QC4 `ep-frosty-lab`, lock `/tmp/shark-gate-pos.lock`, `CI` unset except visual dry · 11:46–12:08Z)
| gate | result | exit |
|---|---|---|
| qc-pos-p2.8 (forced) | 60/60 · PAR 4/4 · residue 0 | 0 |
| qc-pos-p2.4 (forced · count on the base) | 49/49 · PAR 4/4 | 0 |
| qc-pos-p2.3 · p2.2 · p2.1 | 46/46 (PAR 2/2) · 42/42 · 55/55 | 0 ×3 |
| qc-pos-p1.3 · p1.12 · p1.16 | 128/128 · 72/72 · 28/28 | 0 ×3 |
| qc-pos-p1.18 (`QC_P118_PHASE=U`: ST7 0 Thai literals · nav pins) | 81/81 | 0 |
| qc-pos-products | 24/24 | 0 |
| qc-hf-pos-page-authz (+ OR-1…OR-9 orders rows) | 71/71 | 0 |
| qc-shop | 15/15 | 0 |
| qc-pos-p1.1 (merge-gate rule, extra) | 180/180 | 0 |
| pnpm fitness no env · QC4 env · fitness-pos | 50/50 · 50/50 · 8/8 | 0 ×3 |
| visual `p2.8u --states --dry` orders/register × owner/cashier (`CI=1`) | 27 · 2 · 24 · 2 shots planned | 0 ×4 |
| pnpm typecheck (iso · flock /tmp/pos-gate.lock · `gate-G-typecheck.log`) | 0 errors | 0 |
Before the final batch: two scoped `tsc` runs over the new graph (`p28u/tsconfig.scoped.json`, 0 errors) and dev fitness-pos runs (F15.3a: renamed `*Sheet`/`*Select` components that the scanner treats as controls, literal rail testids; F6.1: first-layer `assertCan` in the wrapper). Pre-commit fitness green on every commit. No real screenshots (QC5 = controller).

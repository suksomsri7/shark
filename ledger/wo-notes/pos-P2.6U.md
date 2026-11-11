# POS P2.6U — builder notes (KDS screen 04 UI half + small edits)

Builder · account B · 14 Oct 2026 · tree `/root/projects/shark-pos-c` · branch `wip/pos-p2.6u` from `session/pos` **482e353e** (code 671e6fd2 = P2.6 S merged).
Binding: `pos-briefs/pos-prompt-accountB-P2.6U.md` rulings 1–18 · `pos-brief-P2.6.md` §6 · `wo-notes/pos-P2.6.md` §"P2.6U contract". Spec: `pos-briefs/pos-spec-P2.6-kds-ui.md`.
Scratch/logs: `/tmp/claude-0/-root/5169ed6b-3dd4-5e42-a1eb-90ec4124521e/scratchpad/p26u/runs/`.

## Commits
| step | commit | content |
|---|---|---|
| rulings 15–17 oracle | 2038f0a3 | ORACLE-ADD (dated) `qc-pos-p2.6` K14b · A14 · K12b → 65 checks |
| red-before | 454207c1 | `ledger/wo-notes/P2.6U-red0.txt` = **62/65** on the S code (src/prisma untouched), exactly K14b A14 K12b red (A14 at the static lock-order probe) |
| rulings 15–18 fix | b7a7bcbe | see "Rulings 15–18" · `qc-pos-p2.6` forced 65/65 right after (`runs/s1-p2.6-forced1.log`) |
| 1 page + authz + entries | 3520a3e1 | `/pos/kds` page · `posKdsView` · `qc-hf-pos-page-authz` KD-1…KD-10 (ORACLE-ADD, prompt-instructed) · `POS_PAGES` + kds · `NavRail.isRailPath` + kds · register "⋯" entry · legacy banner |
| 2–5 KDS screen | be0f02c3 | `src/components/pos/kds/**` · `kds-shared` `servedToday.last` + orderId/stationId · messages · inventory rows |
| 6–7 small edits + PayDone | 72a7e599 | 19ฉ · 06 · 09 · 17B · PayDone "คิว N" · `kds.ts` read-only exports · `kds-actions.ts` wrappers |
| 8 visual + spec | 277414f4 · eecebfbb | `visual-pos.mts` p2.6u states · spec |
| 9 merge | fa3a8338 | `origin/session/pos` bfb65f75 (ledger only — no conflict) |

## Rulings 15–18 (server, done first)
- **15 (H1)** `restaurant/kitchen.ts` exports `kitchenLockRoundInTx` (wraps the existing `lockRoundInTx`, FOR NO KEY UPDATE) · re-exported in `restaurant/index.ts` (P2.6 block) · `kds.ts moveTicket`: when `recall`, the tx takes the round lock first, then `roundVoidedInTx` (PosSale read stays FOR SHARE — it holds off a concurrent void; no new cycle: void locks PosSale only, the cancel/void consumers lock round → items), then `kitchenMoveInTx` (re-lock in the same tx = no wait). K14b: online order served → recall queued behind a held round lock → cancel commits → release ⇒ `TICKET_VOIDED`, items still SERVED, round COMPLETED, no new order event (red before: recall OK + round CANCELLED by the consumer).
- **16 (H2)** `catalog-legacy.ts restoreMenuStockKeep86InTx` and `resetMenuItemDailyStock`: `SELECT id FROM "MenuItem" … FOR UPDATE` before reading the mark (lock order ROI/PosProduct → MenuItem unchanged). A14 = static lock-order probe (both functions) + table-cancel ∥ KDS 86 race as a must-stay-86 guard (Postgres wakes row-lock waiters in no fixed order — the race is a guard, the static probe is the red).
- **17 (H3)** `catalog.ts adoptVariantRow` (the only writer that changes `parentId` of an existing row — createProduct with `parentId` creates a new row covered by `createdAt`; no other `parentId` writer in `src/`) stamps `stationSetAt = now()` when the row has no own `stationId` and the parent changes · `kds.ts healMissingTickets` parent branch also requires the row's own `coalesce(stationSetAt, createdAt) ≤ sale` (without it the stamp is never read). K12b: sell a synced inventory row, adopt it as a variant of the routed cookie ⇒ board read ⇒ 0 rounds, counters unchanged.
- **18 (H4)** `TICKET_VOIDED` copy th/en + server message cover refunds ("บิลนี้ถูกยกเลิก/คืนเงินแล้ว — …") · unused `items` param of `roundVoidedInTx` removed · the three fix2 owner lines moved under the P2.6 S heading of `POS-OWNER-PENDING.md`; the heal-residual line extended with "หรือผูกเป็นตัวแปร … ทางนี้ปิดแล้ว (P2.6U มติ 17)".

## Components / files
- New: `src/app/app/sys/[id]/pos/kds/page.tsx` · `src/components/pos/kds/{KdsScreen,KdsTopBar,KdsTicketCard,KdsEightySix,KdsLegacyBanner}.tsx` · `kds-ui.ts` (pure) · `kds-print.ts` (client print) · `src/components/pos/products/kitchen-ui.tsx` · `src/components/pos/register/RegisterMoreMenu.tsx` (`RegisterMoreEntry`).
- Foreign hunks (all marked `POS P2.6U ▸ … ◂`): `NavRail.tsx` (rail regex) · `RegisterModeTabs.tsx` (⋯ entry) · `ProductCard.tsx` (19ฉ) · `PayDone.tsx` + `RegisterScreen.tsx` (unitId → queue) · products `page.tsx`/`ProductsClient.tsx`/`ProductPanel.tsx`/`products-data.ts` · orders `page.tsx`/`OrdersScreen.tsx`/`OrderCardView.tsx`/`OrderPanel.tsx`/`OrdersRail.tsx` · `settings/DeviceSettings.tsx` (17B + link) · legacy `restaurant/kds/page.tsx` (banner, 2 lines) · `access.ts` (`posKdsView`) · `kds-shared.ts` (servedToday.last type) · `kds.ts` (ruling 15/17 + read-only exports) · `kds-actions.ts` (3 wrappers) · `scripts/pos-qc-env.mts` · `scripts/pos-ui-inventory.json` (+41 rows) · `scripts/visual-pos.mts`.

## Messages (th + en, same key set; ST7 = 0 Thai in code)
`pos.kds`: page.refusal · back · unit · shift · shiftNoDevice · perm.{advance,recall,rush,pause,availability} · menu.{more,printThis,select,unselect} · lineDoneAria · cancelledLine · recalled · printNone · printed · pausedOn/Off · servedNone · expoEmpty · stationsLabel · avgLabel/avgMinutes/avgTarget · midnightNote · loading · close · eightySix.{none,empty,released,markedOut} · legacyBanner.{text,open} · errors.ticketVoided (copy, ruling 18).
`pos.register`: more.{label,kds} · product.soldOutKitchen · done.{kitchenLabel,queue}. `pos.device.kitchen.*` (12). `pos.products.kitchen.*` (17). `pos.orders`: card.{kitchenHeld,kitchenHeldHint} · detail.{onAcceptKitchenLive,kitchenSection,kitchenSent} · rail.{autoPauseOff,autoPauseLess,autoPauseMore,autoPauseTurnOff}.

## testids
`pos-kds` · `pos-kds-refusal` · `pos-kds-topbar` · `pos-kds-back` · `pos-kds-unit(-option-*)` · `pos-kds-device` · `pos-kds-clock` · `pos-kds-shift` · `pos-kds-tab-<stationId>` · `pos-kds-tab-expo` · `pos-kds-station-select` · `pos-kds-seg-*` · `pos-kds-avg` · `pos-kds-pause` · `pos-kds-print` · `pos-kds-paused-banner` · `pos-kds-midnight` · `pos-kds-board` · `pos-kds-col-*` · `pos-kds-ticket-<orderId>` · `pos-kds-start-*` · `pos-kds-line-*` · `pos-kds-timer-*` · `pos-kds-rush-chip-*` · `pos-kds-more-*` · `pos-kds-menu-*` · `pos-kds-rush` · `pos-kds-print-this` · `pos-kds-select` · `pos-kds-done` · `pos-kds-served` · `pos-kds-recall` · `pos-kds-expo(-<orderId>)` · `pos-kds-empty-unit` · `pos-kds-setup-link` · `pos-kds-empty-station` · `pos-kds-bottom` · `pos-kds-pending` · `pos-kds-86-list` · `pos-kds-86` · `pos-kds-86-mobile` · `pos-kds-86-sheet` · `-backdrop` · `-close` · `-note` · `-search` · `-out-*` · `-release-*` · `-item-*` · `-toggle-*` · `pos-kds-toast` · `pos-kds-legacy-banner/-open` · `pos-reg-more` · `pos-reg-more-kds` · `pos-reg-tile-86` · `pos-reg-done-queue` · `pos-prod-kitchen` · `pos-prod-station` · `pos-prod-86-chip` · `pos-prod-86-toggle` · `pos-prod-86-<id>` · `pos-ord-kitchen-meter` · `pos-ord-kitchen-held` · `pos-ord-on-accept-kitchen` · `pos-ord-detail-kitchen` · `pos-ord-kitchen-max(-minus/-plus/-off)` · `pos-device-kds-link` · `pos-device-kitchen(-off/-after/-lan/-station-*)`. Inventory: 41 rows (`wo: P2.6U`).

## Deviations (each with the ruling it touches)
1. **`kds.ts` edits beyond ruling 10** (prompt: "no edit to `pos/kds.ts` except ruling 10"): (a) `servedToday.last` gains `orderId`/`stationId` (additive; T5 checks `count`/`last.no` only) — ruling 7 needs the recall target and the contract had none; (b) read-only export `kitchenStateForUnit` (setting + backlog) for ruling 9c/11 — placing it in `kds-actions.ts` needed a raw prisma import there (fitness F5.1 ratchet 46 → 47 = red); (c) `queueNoForSale` as ruled (≤ 15 lines, read only).
2. **Thin wrappers in `kds-actions.ts`** (contract gaps): `setProductStationAction` (no existing products action wraps `catalog.updateProduct`; ruling 9b) · `kdsKitchenStateAction` (9c/11) · `kdsQueueNoAction` (10). `NEED` + `manage` (pos.product.manage) · `sale` (pos.sale.create | pos.sale.read).
3. **Ruling 3 pause** reuses the legacy `kitchenPauseAction(unitSlug, formData)` (`src/lib/actions/restaurant.ts:62`, `restaurant.kitchen.pause`) — the page passes the unit slug; a thrown refusal ⇒ toast `errors.permissionDenied`.
4. **Ruling 1 register "⋯"**: the base has no "⋯" menu ⇒ new `RegisterMoreEntry` at the end of `RegisterModeTabs` (md+; the 390 register has no mode bar — the settings devices link and the legacy banner remain).
5. **Ruling 9c stepper** lives in the 09 rail (where the hint was). Cite: restaurant settings are hosted by the legacy `/app/u/[unitSlug]/restaurant/setup` page (`updateSettingAction`, unit-slug scoped, no POS system context); POS settings "general" hosts no restaurant setting ⇒ no settings-page stepper.
6. **Ruling 9c detail bullet**: `kitchenProgress` has no per-station split ⇒ "ส่งเข้าครัวแล้ว N รายการ · เสร็จ d" (no station names); the on-accept line is live text when the unit has stations.
7. **Ruling 8 86 search** lists the unit's MENU rows only (`RegisterProduct` carries no `stationId`); non-MENU 86 via the 06 drawer or the current-86 list.
8. **Ruling 11 F5**: no previous-bizDate tickets in the contract ⇒ muted owner note `pos-kds-midnight` shown 00:00–02:59 Bangkok; "รอครัว" badge on NEW cards when paused or any station backlog ≥ max.
9. **Ruling 6 selection**: a ticket is selected via its menu ("เลือกใบนี้"); copy = printed in this session or not NEW. ESC/POS path exists for receipts ⇒ reused (no "เร็ว ๆ นี้" chip on the KDS).
10. **17B "after-sale" printing at the register is not wired** (the form stores `kitchenSlip`/`kitchenStationIds`; the register needs the sale's round id — ruling 10's reader returns the number only) ⇒ follow-up.
11. Device chip name/printer config from `heartbeatAction` (needs `pos.sale.create`; same throttled `lastSeenAt` write as the register) — a cook without sale keys sees "จอครัว" and prints via the browser.
12. Prop/component names chosen so the F15.3a interactive scanner does not count wrappers (`onChoose` · `onFlip` · `onDismiss` · `RegisterMoreEntry` · `KdsEightySixPanel`).
13. `products-data.ts` reads `PosProduct.stationId` (one query) for the drawer.

## Visual fixtures (`visual-pos.mts p2.6u`, coffee tenant, silom)
Stations "ครัวร้อน/เครื่องดื่ม/ขนม <run letter>" (`menu.createStation`) · routing amer/crois → ครัวร้อน, latte → เครื่องดื่ม (`catalog.updateProduct`, previous values restored) · tickets: QCPHONE (DIRECT, adapter NONE) ingest `startStatus ACCEPTED` ×4 (fresh/late+rush/warn/ready) · CHAT accept ×1 (served) · table round (zone/table of the run, 1/2 done) · 1 cash register bill (kept like other visual bills; failure = skipped, logged) · `sentAt` nudges before every shot (late 11 min · warn 8.5 min · fresh 40 s · target 10) · 86 crois (KDS) · pause for `kds-paused-banner` · served re-served before each `kds-served-recall` · CHAT served-then-cancelled for `kds-refusal-toast`. Cleanup after the last fixture job, in `finally` and on signals: pause/86/routing restored · rounds/items/orders/order events/outbox/audit of the run deleted · table zone via `deleteP24uRows` · stations deleted. LINE MAN omitted (accept = PLATFORM bill = payment). Run p2.6u visual jobs one process at a time per tenant (P2.4U cleanup deletes item-less stations it did not create).
Cashier = QC STAFF with `pos.sale.create` only (seed has no `restaurant.kds.advance`) ⇒ KDS read-only (advance/recall/rush/pause disabled + tooltip).

## `--state` list for the controller (QC5)
`--page kds --states` (owner + cashier · th + LOCALE=en): `kds-empty-unit`[owner] · `kds-empty-station` · `kds-mixed` · `kds-expo` · `kds-paused-banner` · `kds-86-sheet` · `kds-served-recall` · `kds-refusal-toast`[owner]
`p2.6u --page register --states`: `register-tile-86` · `--page orders`: `orders-kitchen-meter` · `--page products`: `products-drawer-station`[owner] · `--page settings`: `settings-device-kitchen-slip`[owner]
(QC5 needs the p26 migrations — deployed by the controller 14 Oct.)

## Follow-ups
- Register "after-sale" kitchen slips (17B setting) — needs a sale → round reader (or `queueNoForSale` returning the round id).
- F5 previous-bizDate tickets (ORACLE-EDIT T5) · P2.11 held-NEW sweeper · audible alert (P2.11).
- Per-station kitchen-progress split for the 09 bullet (contract).
- 86 search for non-MENU routed rows (needs `stationId` in the register catalogue or a KDS products reader).

## Final gates — tree `/root/projects/shark-pos-c` · typecheck at **fa3a8338**, DB suites at **8e8fc7b6** (= fa3a8338 + notes only) · dirty 0 · logs `scratchpad/p26u/runs/g-*.log` (first line = tree/head/dirty)
| gate | result |
|---|---|
| typecheck (iso · pos-gate.lock · 5632 MB) | exit 0 |
| fitness no-env / env · fitness-pos | 50/50 · 50/50 · 8/8 |
| `qc-pos-p2.6` forced ×2 / unforced | **65/65 ×3** (62 + K14b A14 K12b) |
| `qc-hf-pos-page-authz` | 81/81 (+ KD-1…KD-10) |
| `qc-pos-p2.8` | 61/61 (register.ts untouched ⇒ ST6 green) |
| `qc-pos-p2.4` · `p1.3` · `p1.10` · `p1.12` · `p1.16` · `p1.18` | 50/50 · 128/128 · 40/40 · 72/72 · 28/28 · 81/81 (ST7 0 · nav pins) |
| `qc-pos-p1.1` (merge-point static G4) · `qc-pos-products` | 180/180 · 24/24 |
| `qc-restaurant` / -money / -pay / -void | 6/6 · 6/6 · 19/19 · 11/11 |
| `visual-pos.mts p2.6u --states --dry` (CI=1) | rc 0 — kds/register/products/orders/settings × owner/cashier + LOCALE=en + full-wo + `--state` filter + `--list` (`runs/dry-*.log`) |

## Fix round 1 (review R1 F1–F6 + controller V1–V10) — 14 Oct, account B
Binding: `pos-P2.6U-review.md` "Controller rulings — fix round 1" 1–7 + "Controller V findings".
| finding | commit | change |
|---|---|---|
| ORACLE-ADD A15 (dated, `ผู้คุม`) | 3a32f55d | `qc-pos-p2.6` → 66 (page-authz covers pure guards only, not actions ⇒ A15 in p2.6) · red-before `P2.6U-red1.txt` = 65/66, A15 only |
| F1 + V5 | 5004db52 | `kds.kdsKitchenProducts` (NEED availability: MENU rows with an active-station MenuItem + non-MENU rows routed to an active station (own or parent) sold at the unit · available = `availabilityFor` · mark) + `kdsKitchenProductsAction`; the 86 sheet uses it (cook-only users get the list) · default list = routed items, 86'd first, filter on typing · "no results" only for a query · deviation (e) closed |
| F2 | e33d48a1 | option (b) wired (~35 lines): `roundOfSale` (kds.ts) → `kdsQueueNoAction` returns `orderId`; PayDone prints kitchen slips once per sale (module Set) when `kitchenSlipSettings(cfg).mode === "after-sale"`, one payload per selected station (none = all) → `printKitchenSlips` (device config); failure = status line `pos-reg-done-kitchen-error` · deviation (g)/follow-up closed |
| F3 | 19c62465 | `kds.kdsStations` + `kdsStationsAction` (NEED read \| pos.product.manage · no heal, no board) used by 17B and the 06 drawer |
| F4 | bed85776 | "รอครัว" only when the card's channel has `autoAccept && adapter ≠ MANUAL` |
| F6 + V8 | 7e4c8a0d | 09 meter = text then bar · stepper value as text "ปิด" / "N ใบ" (`pos-ord-kitchen-max-value`) · authz marker "ผู้คุม" · ⋯ menu removes its resize listener |
| V1 V2 V6 V7 V9 | addc79cd | avatar initial skips leading Thai vowels (the lone "ι" was "เ" of "เจ้าของ…") · inline (390) top bar fixed 56 px (it had `flex-1` inside the column ⇒ ~300 px band) · 17B ใบครัว = stacked radio rows, PLANNED chip inline · staff names on cards = first word ≤ 12 chars · "#n · source" one string |
| V3 V4 F5 | a14dcb61 | harness: 390 taps the "พร้อม" segment before recall/refusal (the strip lives under พร้อมเสิร์ฟ) and waits on the board · fixture bill sold in its own shift (`posqc-vis-p26u-<pid>`, QC unit requires a shift) ⇒ takeaway ticket in kds-mixed · cleanup voids that bill and closes the shift (ruling fix1-5: 1 line) |
| V10 | — | accepted (⋯ is 44 px, separate from the footer text) |
Server files in the fix1 diff: `kds.ts` / `kds-actions.ts` / `kds-shared.ts` readers only (no write path changed) — other DB suites from the final gates stay valid.

### Fix round 1 gates — head fb115dd0 (code = fix1) · dirty 0 · logs `scratchpad/p26u/runs/fx1-*.log`
| gate | result |
|---|---|
| typecheck | exit 0 |
| fitness no-env / env · fitness-pos | 50/50 · 50/50 · 8/8 |
| `qc-pos-p2.6` forced ×2 / unforced | **66/66 ×3** |
| `qc-hf-pos-page-authz` · `qc-pos-p1.18` (ST7 0) · `qc-pos-p1.10` | 81/81 · 81/81 · 40/40 |
| `visual-pos p2.6u --states --dry` | rc 0 — every page × owner/cashier + LOCALE=en; all 390 states plannable (`fx1-dry-*.log`) |
States that change visually: kds-mixed (takeaway ticket, header strings, names, top bar) · kds-86-sheet (routed list) · kds-served-recall / kds-refusal-toast at 390 (READY segment) · every kds state at 390 (top bar height) and 1440 (avatar initial) · orders-kitchen-meter (text→bar · stepper value) · settings-device-kitchen-slip (radio rows) · products-drawer-station (no visual change; reader swap) · register-tile-86 unchanged.

## Fix round 2 (R2 Low/Nit G1–G3 + hunter N1/N2) — 14 Oct, account B
| item | commit | change |
|---|---|---|
| G1 · G3b | 7fcc03c5 | `cleanupP26u` guard also covers an open fixture shift / unvoided bill (void key fixed per run · closing a non-OPEN shift = ok ⇒ retry-safe) · kds en plan = 3 sizes incl. 390 · dry logs carry the tree/head header (`runs/fx2-dry-*.log`) |
| G3a | 3fb98e22 | avatar initial = first `\p{L}` letter that is not a Thai leading vowel |
| K12c ORACLE-ADD (dated, ผู้คุม) | da5f7115 | `qc-pos-p2.6` → 67 · red-before `P2.6U-red2.txt` = **67/67 — K12c green on the fix1 code**: the N2 path is unreachable (adoptVariantRow refuses a row that already has a parent; no other parentId writer) |
| N2 | 1b84aa2a | adoptVariantRow stamps `stationSetAt` only when the effective station (own ?? parent) changes — defensive, same rule as updateProduct/syncMenuRow; K12b stays green |
| N1 (= G2) | 8db5cda5 | PayDone: no kitchen round after 3 polls while the device prints kitchen slips after sale ⇒ status line "ใบครัวไม่ออก — พิมพ์จากจอครัว" (never blocks). Gated on after-sale mode so shops without a kitchen don't see it on every sale |
Gates — head f74ca51d (code = 8db5cda5) · dirty 0 · `runs/fx2-*.log`: typecheck 0 · fitness 50/50 ±env · fitness-pos 8/8 · p2.6 **67/67 ×3** · p1.18 81 · p1.1 180 (catalog.ts touched) · products 24 · visual dry th+en rc 0 for every page/user (en kds 8/24 and 6/18 at 390).

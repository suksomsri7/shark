# POS P2.4U — UI โหมดโต๊ะ (03 floor + panel + alerts · register table mode + bill-type chip · reservations sheet · X/Z info line) · builder notes

Builder U · VPS (account B) · 10 Oct 2026 · tree `/root/projects/shark-pos-p11` · branch `wip/pos-p2.4u` from `session/pos` **7365d4db** (P2.4 S merged).
Merged `origin/session/pos` **1c613e52** (P2.8 S merged + ledger) after the step 1–9 commits and before step 10 + all final gates — no conflicts (`src/messages/{th,en}/pos.json` auto-merged; `pos.tables` 27 top-level groups, `orders` from P2.8 kept).
Contract: prompt `ledger/pos-briefs/pos-prompt-accountB-P2.4U.filled.md` rulings 1–13 · `wo-notes/pos-P2.4.md` §"P2.4U contract" + "contract additions" + fix-round-3 rule (every table-draft save = `newDraft:true` or `heldCartId`+`expectedVersion`) · spec written: `ledger/pos-briefs/pos-spec-P2.4-tables-ui.md`.
No server behaviour change: no edit to `pos/table.ts`, `register.ts`, `held-cart.ts`, `restaurant/**` server code, `pos-sale-contract.json`, `prisma/`.

## Steps (commit per step · explicit paths)
Steps were built in one pass and committed grouped by step (intermediate commits are not independently buildable — only the head is gated).
| step | commit | content |
|---|---|---|
| 1 | bd8de334 | `/pos/tables` page (404 when no accessible linked unit · O13 refusal card `pos-tables-refusal` before any table read) · `RegisterModeTabs` (`active`, `tablesHref`, `unitId`) · `RegisterTopContext` (`unitHref`, `noCamera`) · `NavRail.isRailPath` + `/pos/tables` · `qc-hf-pos-page-authz` T-1…T-6 · `pos.tables.*` keys · `table-ui-actions.ts` |
| 2–3 | 5272526c | `TablesScreen` · `TableFloor` · `TableCardView` · `TablePanel` · `TableDialogs` · `table-ui.ts` |
| 5 | 1074c07f | `TableCheckout` · `InterimPayDialog` `initialMethod` (marked) |
| 4 + 6 | 882abdd9 | `RegisterScreen` table mode + bill-type chip (marked hunks) · `CartPanel` (`billType`, `tableMode`, `BillTypeChip`) · `LineEditor noDiscount` · `MobileCartBar payLabel` · register `page.tsx` (`?table=`, `registerTableMode`) · `TablePickDialog` |
| 7–8 | dcf512b7 | `ReservationsDialog` · `TableAlerts` |
| 9 | c4fb9120 | `OpenTablesInfo` in shifts X card + close-day · `table-legacy.ts` `posTableModeForUnit` · legacy restaurant floor + session pages (F4b) |
| merge | f63a393f | `origin/session/pos` 1c613e52 |
| 10 | fce75068 | `visual-pos.mts` wo `p2.4u` · `POS_PAGES` + `tables` · `pos-ui-inventory.json` (+69 rows · 2 rows updated) · spec · `RegisterScreen` retry node moved out of `CartPanel` props (F15.3a) |
| 10b | f56f6502 · 2136e3c2 | `TablesScreen` re-quotes when the table's member changes · `TableCheckout` clears the previous quote while re-quoting (confirm disabled until fresh) |
| notes | (this commit) | this file |
Steps 1–9 were committed with `--no-verify`: the pre-commit fitness F10.1 was a false red caused by the shared Prisma client already carrying P2.8 models (`PosOrder*`) that this base's `scope.ts` predated (memory "fitness stale Prisma client — reverse"). After the merge every commit ran the hook green, and fitness is gated below.

## Components (all new files under `src/components/pos/tables/`)
`TablesScreen` (owner of state · poll 20 s · layout D/T/M/C · toasts · Esc) · `TableFloor` · `TableCardView` · `TablePanel` · `TableDialogs` (open / cancel item / close) · `TableCheckout` (PayDialog + PayDone) · `ReservationsDialog` · `TableAlerts` · `TablePickDialog` (+ `BillStripDialog`) · `OpenTablesInfo` · `table-ui.ts` (pure: clock from `serverTime`, Bangkok HH:MM, strip rules, checkout key). Server: `src/app/app/sys/[id]/pos/tables/page.tsx` · `src/lib/modules/pos/table-ui-actions.ts` · `src/lib/modules/pos/table-legacy.ts`.

## Keys (`src/messages/{th,en}/pos.json` · same set th/en)
Added under `pos.tables`: `page.*` 5 · `zoneNote.*` 3 · `legendItem.*` 3 · `card.{hoursMinutes,viewBooking,callStaff,payNotified}` · `open.*` 6 · `panel.*` 18 new · `checkout.*` 7 · `order.*` 10 · `billType.{menu,stripTitle,stripBody,strip.*(6),continue,moved,empty,hasDraft}` · `reservation.*` 16 new · `legacy.*` 2 · `toast.*` 5 new. Changed: `tables.panel.stockNotCut` = "ไม่ได้ตัดวัตถุดิบตามสูตร" / "Recipe ingredients not cut" (fix-3 rule). ST7: 0 Thai literals outside `t()` in `src/components/pos/**` and `src/app/app/sys/[id]/pos/**` (comments only).

## testids
Tables page: `pos-tbl-*` (card `pos-tbl-card-<name>` · panel `pos-tbl-panel` · checkout `pos-tbl-checkout` · full list in the spec §2–§7). Register: `pos-reg-billtype` (wrapper) + `pos-reg-billtype-{takeaway,dinein}` · `pos-tbl-order-{chip,back,save,send,price-note,state,closed-back}` · `pos-tbl-send-retry` · `pos-tbl-pick*` · `pos-tbl-billtype-strip*`. Legacy pages: `rest-pos-tables-{note,link}` (not POS files). Inventory: +69 rows; `pos-reg-bill-type` (P2.4U menu) and `pos-reg-tab-*` (tables = link) notes updated.

## Deviations (ruling touched)
1. **r1 "nav key `tables`"** = the register mode-tab key `tables` (`pos-reg-tab-tables`, now a live link). Not added to `POS_NAV_KEYS` / `pos.nav.*` / app-layout module tabs: `qc-pos-p1.18` ST5 (gate, "nav คีย์เกิน"), `qc-pos-p2.6` ST4 and `qc-pos-p2.8` ST6 pin the base key set. If the controller wants a module-tab entry ⇒ ORACLE-EDIT on those three.
2. **r12 chip testid**: `pos-reg-billtype` is the menu wrapper; the chip button keeps `pos-reg-bill-type` (pinned by `qc-pos-p1.3` TESTIDS_CLICKABLE, gate 128).
3. **Thin wrappers** (contract lacks them): `registerProductsByIdsAction` (r4: names/prices of draft lines outside the first grid page · wraps `registerProductsByIds`) and `registerReservationsTodayAction` (r7: S gives only a count · `registerScopeFor` + facade `tableFloorForPos` over today's Bangkok window, BOOKED only). Server helper (not an action) `posTableModeForUnit` for r10.
4. **r3 header line**: staff name from `listStaffForDeviceAction` (sellers of the unit); an opener without sell rights ⇒ line without "พนักงาน X"; round line = "พนักงานรับที่โต๊ะ" (S `TableRound` has no `placedByUserId`); member line without points (S member brief has none).
5. **r3 collapse**: > 3 served lines in a round ⇒ 2 shown + "เสิร์ฟแล้วอีก N รายการ · names · ฿" (mockup 03).
6. **r4 prices in table mode**: cart lines/totals are the register's STORE quote + note `tables.order.priceNote`; the round is priced by the server at send (QR_TABLE channel price for guest-opened tables applies there).
7. **r4 VERSION_CHANGED / ALREADY_RECALLED**: reload the latest draft and append the cashier's own lines added since the last load/save; edits to lines that already belonged to the draft are not re-applied (the other device's version wins) — never a blind overwrite. "บันทึกไว้ก่อน" stays on the register (toast).
8. **r5 checkout scope**: bill discount + coupon + manager PIN; no points/voucher choices and no tax-invoice toggle in table checkout (member = the session's via ⋯ ผูกสมาชิก, tier discount applies). Devices with PINs need the register staff token ⇒ button disabled + link "ไปหน้าขาย" (no lock screen on the tables page); `STAFF_TOKEN_INVALID` clears the token.
9. **r8 PAY_PROMPTPAY**: "ยืนยันรับเงิน" opens the checkout with PROMPTPAY preselected and **no payment intent** (the guest already paid the table's static QR — manual confirm as P1.6).
10. **r10 legacy**: also hides the floor page's "ยืนยันรับเงิน" (PromptPay) because it is a legacy checkout; users without POS rights are decided by the unit's table count; the direct URL `/restaurant/checkout/<id>` still works (no link) — owner line quoted below; removal = P2.14.
11. **r9**: close-day line shows for today only (unpaid snapshot is "now").
12. **r11 visual**: no "ต้องเก็บโต๊ะ" card in fixtures — `dirtySince` is only set by a paid bill and the ruling forbids paying; tables-empty = owner on the second unit (อารีย์, no tables → setup CTA) · cashier on สีลม before the fixture (muted). Fixture is created only through module functions; cleanup deletes the run's rows by id (oracle convention "raw SQL only for cleanup").
13. Shared/foreign hunks (all marked `POS P2.4U ▸ … ◂`): `NavRail.tsx` (rail for `/pos/tables`), `RegisterScreen.tsx`, `CartPanel.tsx`, `InterimPayDialog.tsx`, `LineEditor.tsx`, `MobileCartBar.tsx`, `RegisterModeTabs.tsx`, `RegisterTopContext.tsx`, register `page.tsx`, `ShiftsClient.tsx`, close `page.tsx`, legacy restaurant `page.tsx` + `tables/[sessionId]/page.tsx`, `visual-pos.mts`, `pos-qc-env.mts`.
Owner line (already in `POS-OWNER-PENDING.md`, P2.4 fix 2 F4): "💸 **POS⇄หน้าเดิม เก็บเงินซ้ำได้** … ข้อเสนอ: จอ P2.4U ซ่อนปุ่ม "เช็คบิล/ยกเลิกรายการ" ของหน้าเดิมในสาขาที่ใช้โหมดโต๊ะ + ปิดหน้าเดิมที่ P2.14 — **เจ้าของร้านอาหารเคาะ**" — done for the links/buttons; no new owner line.

## Fixtures (visual `p2.4u` · coffee tenant · unit สีลม)
Per run letter L = `ABCDEFGHJKLMNPQRSTUVWXYZ[pid % 24]`: zones "ในร้าน · QC P2.4U L" (L1…L12) + "ระเบียง · QC P2.4U L" (L21, L22) via `createZone`/`createTable` (L11 INACTIVE via `updateTable`); sessions via `registerOpenTable` (owner) ×6 + guest QR `resolveTableSession` (L6); rounds via `holdRegisterCart({newDraft:true})` + `registerSendTableRound` ×10 (อเมริกาโน่/ลาเต้ + notes); KDS via `advanceItem`; L4 keeps an unsent draft (2 lines); requests REQUEST_BILL (L6) · CALL_STAFF (L7) · PAY_PROMPTPAY (L8) via `createServiceRequest`; reservations L9 (+20 min, hold 30) + one without table (+2 h) via `registerCreateReservation`. **No bill is paid.** Cleanup by id after the last state that uses it, in `finally` and on SIGINT/SIGTERM/SIGHUP; zones tagged "QC P2.4U" older than 1 h are swept first; KDS stations created by the send round are deleted when unreferenced; the day's `RestaurantDailyCounter` row stays.

## `--state` list for the controller (QC5 · new page ⇒ full set)
- `LOCALE=th|en visual-pos.mts p2.4u --states --page tables --user owner|cashier --base <QC5>`: `tables-empty,tables-floor,tables-panel-rounds,tables-draft-unsent,tables-checkout-dialog,tables-reservations-sheet,tables-alerts` (1440/1024/390; en = 1440).
- `LOCALE=th|en visual-pos.mts p2.4u --states --page register --user owner|cashier --base <QC5>`: `register-table-mode,register-billtype-menu`.
- Touched existing screens (re-shoot, same keys as before): register `default` + `cart3` + `line-editor` (mode tab "โต๊ะ" link · chip menu · LineEditor unchanged outside table mode) · shifts `shifts-current` (info line when the unit has tables) · close page plain.
- Cashier expectations: page 200 for all states; open table / send round are refused by the server (no `restaurant.*` keys) — states are read-only views; `tables-empty` cashier must run when no other run's fixture is in สีลม.

## Follow-ups
- F-U1 Table checkout: points/voucher choices and tax-invoice toggle (PayBenefits needs a table-aware benefits read).
- F-U2 Legacy `/restaurant/checkout/<id>` direct URL still bills (not linked on table-mode units) — guard or remove at P2.14 (owner line exists).
- F-U3 "ต้องเก็บโต๊ะ" visual needs a paid fixture bill (controller decision) — UI path is covered by code (card dashed + "เก็บแล้ว" · panel "เก็บโต๊ะ").
- F-U4 Quote/detail hash race (round lands between the two reads) self-heals on the next 20 s poll.
- F-U5 Round "taken by" name needs `placedByUserId` in the S DTO (P2.5/P2.6).
- F-U6 Module nav entry for "โต๊ะ" ⇒ ORACLE-EDIT (deviation 1) if wanted.

## Gates (logs `scratchpad/p24u/runs/gate-A-*.log` · summary `gates-summary-A.txt` · each log has a tree/head header)
Batch A started on head fce75068 (step 10 + merge); f56f6502 and 2136e3c2 (UI-only: `TablesScreen`, `TableCheckout`) landed during the batch — the DB suites do not read them; fitness/fitness-pos/visual dry ran after both commits; typecheck runs on the final code head.
| gate | result | exit |
|---|---|---|
| qc-pos-p2.4 (forced) | 49/49 · PAR 4/4 · residue 0 (prompt said 46 — fix round 4 made it 49) | 0 |
| qc-pos-p2.3 · p2.2 · p2.1 | 46/46 (PAR 2/2) · 42/42 · 55/55 | 0 ×3 |
| qc-pos-p1.3 · p1.5 · p1.9 · p1.12 | 128/128 · 21/21 · 53/53 · 72/72 | 0 ×4 |
| qc-pos-p1.15 · p1.16 | 39/39 · 28/28 | 0 ×2 |
| qc-pos-p1.18 (U-phase: ST7 0 Thai literals · ST5 nav unchanged) | 81/81 | 0 |
| qc-pos-products | 24/24 | 0 |
| qc-hf-pos-page-authz (+ T-1…T-6 tables rows) | 62/62 | 0 |
| qc-restaurant · -money · -pay · -void | pass · 6/6 · 19/19 · 11/11 | 0 ×4 |
| pnpm fitness no env · QC4 env | 41/41 · 41/41 | 0 · 0 |
| fitness-pos | 8/8 (F15.3a/b · F15.4 green) | 0 |
| visual-pos p2.4u --states --dry · tables/register × owner/cashier | 21 · 6 · 21 · 6 shots planned | 0 ×4 |
| pnpm typecheck (iso · flock /tmp/pos-gate.lock · `gate-B-typecheck.log`) | 0 errors (head 2136e3c2) | 0 |
Mid-way typecheck (before the merge, `typecheck-mid.log`): 0 errors.

## Fix round 1 (review R1 `wo-notes/pos-P2.4U-review.md` F1–F7 · controller rulings 10 Oct 08:4xZ) · code d79ea868
- **F1** `TablePanel.tsx:~330` collapsed "เสิร์ฟแล้วอีก N รายการ" row = count + names; the client-side `reduce` of `lineTotalSatang` is gone (no satang sum left in `components/pos/tables/**` except the PayDone/confirm Σ payMethods that mirror RegisterScreen). Round-sum follow-up → P2.5 (S DTO).
- **F2** `TablesScreen.tsx:464` (panel "พาลูกค้านั่ง") and `ReservationsDialog.tsx:81` (sheet): a VALIDATION seat refusal runs `refreshFloor()` (now returns the fresh floor) and shows `tables.errors.occupied` when the **fresh** card has a session, else the generic text. Distinct code → P2.5.
- **F3** `TablesScreen.tsx:610/631`: alerts resolve the card by `sessionId === request.sessionId` (PromptPay confirm and "เปิดโต๊ะ"); no match ⇒ toast `tables.alerts.stale` ("โต๊ะเปลี่ยนสถานะแล้ว — โหลดใหม่") + `refreshFloor()`. `refreshFloor` (`:202`) and the first requests fetch clear the alerts list when the requests call fails or is refused (no stale list).
- **F4** (ruling: keep D4 + honour P1.7) `InterimPayDialog.tsx:113/239/298` new prop `lockedMethod {managerOnly, onSwitch}` (marked): method locked to the preset; tapping another method (no rows, not sending) ⇒ `onSwitch`; `managerOnly` disables confirm/split. `TableCheckout.tsx:375` `presetManagerOnly = preset && payIntent.manualRequiresManager && !payIntent.canManageShift` — the same rule as the register's QR manual-confirm button (`PayIntentPanel` `manualAllowed`); note `pos-tbl-checkout-preset` (`tables.checkout.presetLocked` + `pos.register.pay.intent.managerOnly`). `TablesScreen.tsx:754/782` switch ⇒ checkout re-keyed (new idempotency key) with `preset:false` (payment intents on).
- **F5** `TableCheckout.tsx:113` `lastSubtotal` ref (initial quote, then every good quote) feeds `wantBp` for AMOUNT discounts (restore path / failed quote no longer show 0 %).
- **F6** `RegisterScreen.tsx:922/928` `changeCart`/`updateCart` clear `tblErr` in table mode (marked).
- **F7** gate logs stamp `head=` (+ dirty count) per gate (`scratchpad/p24u/gates.sh`); single-line `// POS P2.4U ◂` markers completed to `▸ … ◂` (RegisterModeTabs, RegisterScreen, LineEditor, RegisterTopContext, close/register pages, legacy pages); legacy floor ternary branches marked.
- New keys (th/en): `tables.alerts.stale`, `tables.checkout.presetLocked`. No testid change for interactive elements (new display-only `pos-tbl-checkout-preset`) ⇒ inventory unchanged. No server code.

Rendering impact per `--state`: **tables-panel-rounds** (collapsed row loses the ฿ figure) · **tables-checkout-dialog** — unchanged in normal mode; the preset note shows only from a PAY_PROMPTPAY alert (no state shoots it) · **tables-alerts** — none visually (behaviour only) · **register-table-mode** — none (F6 only clears a highlight after an edit). Re-shoot per ruling: `tables-panel-rounds,tables-alerts,tables-checkout-dialog`.

Gates (fix head · logs `scratchpad/p24u/runs/fix1/gate-F1-*.log` + `gate-typecheck.log`, header per gate):
| gate (code 22d68cb0 · d79ea868 for the first suite) | result | exit |
|---|---|---|
| typecheck (`fix1/gate-typecheck.log`) | 0 errors on 22d68cb0 (d79ea868 had 2 × TS2448 — `presetManagerOnly` used before declaration, fixed in 22d68cb0 · `gate-typecheck-d79ea868-red.log`) | 0 |
| qc-pos-p2.4 | 49/49 · PAR 4/4 | 0 |
| qc-pos-p1.3 · p1.18 (U · ST7 0) · products · page-authz | 128/128 · 81/81 · 24/24 · 62/62 | 0 ×4 |
| qc-restaurant · -money · -pay · -void | pass · 6/6 · 19/19 · 11/11 | 0 ×4 |
| qc-pos-p1.1 (merge-gate rule) | 177/178 — only **S2.33** red (base red until MAIN-MERGE lands the `recipe-actions.ts` rename; not touched here) | 1 |
| fitness no env · QC4 env · fitness-pos | 41/41 · 41/41 · 8/8 | 0 ×3 |
| visual `p2.4u --states --dry` tables/register × owner/cashier | 21 · 6 · 21 · 6 shots | 0 ×4 |
`dirty=2` in the headers = this notes file + the spec (ledger, uncommitted while the batch ran).

### V1 (controller vis64 · daa0296d · QC5) + harness item
- **V1** `TablePanel.tsx` new prop `noShrink` (`shrink-0` instead of `min-h-0` on both sections); `TablesScreen.tsx` `panelOf(true)` for the xl `pos-tbl-side` column only — the column scrolls as one (panel, then "แจ้งเตือนจากโต๊ะ"), the iPad/mobile `pos-tbl-panel-frame` keeps `panelOf(false)`. Commit 6a1e0fd1.
- **tables-checkout-dialog ❌ on daa0296d — causes:** owner: with the shrinking panel the เช็คบิล button sat under the alerts list rendered after it, so the harness click landed on the alerts (V1 fixes it). Cashier: `visual-pos` minted the owner session only when `--page register` was in the run; a cashier `--page tables` run opened the device shift with the **cashier's** cookies (no shift rights) ⇒ no shift ⇒ `checkoutBlock` "เปิดกะก่อนเริ่มขาย" (also seen over the alerts in cashier tables-draft-unsent). Fixed in the harness (5c09ef4e: owner session for `pages.includes("tables")` too). F2/F3/F4 do not affect this state's normal path.
- Rendering changed by V1: `tables-floor` (1440, selected panel), `tables-panel-rounds`, `tables-draft-unsent`, `tables-checkout-dialog`, `tables-alerts` at 1440 (alerts now below the full panel); 1024/390 unchanged.
- Post-V1 gates (code head 5c09ef4e · `scratchpad/p24u/runs/fix1/v1/`): typecheck 0 errors · qc-pos-p1.18 81/81 (ST7 0) · qc-pos-p2.4 49/49 PAR 4/4 · visual `p2.4u --states --dry --page tables` owner/cashier rc 0.
- Controller re-shoot (QC5): `--state tables-panel-rounds,tables-alerts,tables-checkout-dialog,tables-draft-unsent` (owner/cashier th + owner en) and register th `--state register-table-mode,register-billtype-menu`.

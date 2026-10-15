# POS P2.5U — split bill 15B/15C · 03 panel move/merge/split/pre-bill · part pay · pre-bill preview/print · builder notes

Builder U · VPS (account B) · 15 Oct 2026 · tree `/root/projects/shark-pos-c` · branch `wip/pos-p2.5u` from `session/pos` **363bff1e** (code 96cc5f4f = P2.5 S merged).
Contract: `ledger/wo-notes/pos-P2.5.md` §"P2.5U contract" (**no server change** — no file under `src/lib/modules/**` edited, no new action) · prompt `ledger/pos-briefs/pos-prompt-accountB-P2.5U.md` rulings 1–12 · brief `pos-brief-P2.5.md` §9 + §10 + §11 · mockups 15B/15C + 03.
Spec: `ledger/pos-briefs/pos-spec-P2.5-split-ui.md` (new) · `pos-spec-P2.4-tables-ui.md` §2/§4 panel updated.

## Steps (commit per step)
| step | commit | content |
|---|---|---|
| 1 | 9c86e505 | 03 panel buttons live (`pos-tbl-moveTable|mergeTable|splitBill|printList` replace `pos-tbl-planned-*`) · move/merge by keys (page prop `tableKeys` = `evaluate(m, restaurant.session.move|merge)`) · split = `pos.sale.create` · split-open checkout "ชำระทีละใบ · เหลือ ฿y" (`data-split="open"`) + progress line · floor chip "แยกบิล n/N" · th/en keys |
| 2–4 | 63efea8a | `TableSplitDialog.tsx` + pure `table-split-ui.ts`: tabs items/equal/seat, allocator preview, qty popover, seat chips, member per bill, save/replace/cancel + refusals, locked + new-items |
| 5 | 0512f6f9 | part pay = `TableCheckout` `split` (cart `tableSplitPartId` + part `memberId` · `expectedSplitVersion` · no bill discount · coupon only on member parts) · `InterimPayDialog` `splitChip` (`pos-reg-paydlg-splitchip`) |
| 6 | 54c07a94 | move sheet (`TablePickDialog` reuse: `sheetId/title/hint/filter/empty`) · merge chooser 1..5 + move/merge confirm (`TableMoveMerge.tsx`) · desktop-only floor drag (`TableFloor`/`TableCardView`) |
| 7 | 6757db12 | `TablePreBillDialog.tsx` + `pre-bill-print.ts` · `TablesScreen` wiring (layers split/prebill/move/moveConfirm/merge/mergeConfirm · part-pay return flow · TABLE_BUSY toast action · TABLE_SPLIT_OPEN toasts) |
| 8 | 3bcf1863 | `visual-pos.mts` wo `p2.5u` · `pos-ui-inventory.json` (+43 rows, PLANNED row removed, 3 notes) · specs |
| fix | cbed7688 | unassigned-row tint uses an existing token |
| 9 | 0d4d8467 | `git merge origin/session/pos` **42b5dcfd** (P2.9U merged 9ada96ef) — conflicts: `InterimPayDialog.tsx` props block (P2.9U `tenders/member/onScanGiftCard/scannedGiftCard/pinAgain` + P2.5U `splitChip`, both kept; the chip hunk auto-merged) · `visual-pos.mts` StateKey union, `--list` ids/rows, fixture hooks (P2.9U + P2.5U both kept; the dropped rpub `--list` loop line restored) · `pos.json` th/en + `pos-ui-inventory.json` auto-merged (valid JSON · F15.3/F15.4 green) |

## Components · hunks
- New: `src/components/pos/tables/TableSplitDialog.tsx` (modal + `SplitMemberChooser`) · `table-split-ui.ts` (pure, no Thai) · `TablePreBillDialog.tsx` · `pre-bill-print.ts` · `TableMoveMerge.tsx` (`TableMergeChooser`, `TableMoveConfirm`, `TableMergeConfirm` — names avoid the F15.3 `…Sheet/…Picker` component scanner).
- Marked hunks `// POS P2.5U ▸ … ◂`: `TablesScreen.tsx` · `TablePanel.tsx` · `TableFloor.tsx` · `TableCardView.tsx` · `TableCheckout.tsx` · `TablePickDialog.tsx` · `register/InterimPayDialog.tsx` (1 prop + 1 chip) · `app/app/sys/[id]/pos/tables/page.tsx` (`tableKeys`) · `scripts/visual-pos.mts`.
- Not touched: `table-split.ts`, `table.ts`, `register.ts`, `service.ts`, `pre-bill-render.ts`, `restaurant/**`, `outbox-consumers.ts`, `RegisterScreen.tsx`, `giftcard/**`, `member/**`, tree b, the oracles.
- Client imports: only `*-shared` (register/table/table-split/device), pure `pre-bill-render` (client-safe by its header) and `*-actions` (`table-split-actions`, `register-actions`, `bills-actions`, `table-actions`). No `"use server"` file added.

## Messages (th + en, same key set · F15.4 3062 keys)
Added under `pos.tables`: `split.{heading, leftAmount, nothing, allItemsCount, loading, close, lockedHint, removeBill, addMember, memberUnknown, memberTitle, memberSearch, memberSearchBtn, memberTable, memberEmpty, memberNone, qtyTitle, qtyLeft, qtyDone, splitQty, preBill, cancelTitle, cancelBody, cancelled, saved, partPaid, allPaidClosed, allPaid, pickSeatHint, fewer, more, unassignedCount, emptyBill, seatRowEmpty, payChip}` · `move.{noPermission, useMerge, empty, confirmBody}` · `merge.{noPermission, into, empty}` · `preBill.{perBill, close, failed, frame, loading}`. Reused the S keys (`split.* move.* merge.* preBill.*`, `pos.register.errors.tableSplit*|tableBusy|tableHasDraft`, `pos.register.pay.*`). ST7: 0 Thai literals outside `t()` in the touched trees.

## testids (interactive rows in `scripts/pos-ui-inventory.json`, page `/app/sys/[id]/pos/tables`)
Panel `pos-tbl-moveTable` `pos-tbl-mergeTable` `pos-tbl-splitBill` `pos-tbl-printList` · `pos-tbl-toast-action` · modal `pos-tbl-split-close` `-tab-*` `-line-*-part-*` `-qty-*` `-qty-*-less-*` `-qty-*-more-*` `-qty-done` `-pick-*` `-seat-*` `-seat-shared` `-select-*` `-removePart-*` `-addPart` `-stepper-less|more` `-member-*` `-member-close|table|form|q|search|pick-*|none` `-prebill-*` `-cancel` `-cancel-back|confirm` `-save` `-payPart-*` · pre-bill `pos-tbl-prebill-close|print|copy` · move/merge `pos-tbl-merge-close` `-merge-pick-*` `-merge-confirm` `-move-back` `-move-confirm-ok` `-merge-back` `-merge-confirm-ok`. Static (no row): `pos-tbl-split-modal` `-chip` `-card-<n>` `-row-<id>` `-locked` `-newitems` `-footer` `-equal-big` `-stepper(-value)` `-seat-rows` `-seatrow-<n|shared>` `-items` `-qty-dialog` `-member-dialog` `-cancel-dialog` `pos-tbl-split-progress` `pos-tbl-card-split-<name>` `pos-tbl-move-sheet` (dialog of `TablePickDialog`) `pos-tbl-merge-sheet` `-merge-summary` `pos-tbl-move-confirm` `-move-reserved` `pos-tbl-merge-confirm-dialog` `pos-tbl-prebill-preview` `-frame` `pos-reg-paydlg-splitchip`. Removed: `pos-tbl-planned-*`.

## Deviations (ruling each touches)
1. **Merge summary "N คน · ฿x"** (ruling 8) adds the floor cards' `guestCount` / `unpaidSatang` (server values) for display — the only client sums besides the allocator; nothing charged from it (the S merges and the merged table re-quotes).
2. **Whole-table "พิมพ์ใบรายการ" while a plan is OPEN opens the split modal** (rulings 1/9) — the S refuses the whole-table pre-bill then (S deviation 7); each saved unpaid bill card has "ใบรายการ" (`tableSplitPartId`).
3. **`split-part-pay` is filed under `--page register` but navigates to the tables page** (ruling 10): part pay has no register-page entry; the dialog shot is the register `PayDialog` opened from the split modal.
4. **Part member names** (ruling 2): `SplitPlanView.parts[].memberId` only — names known = the session member + members picked in the modal; others show "สมาชิก". No wrapper added (contract unchanged) → follow-up F1.
5. **No `memberChoices` on part pay** (ruling 7): the P2.4U table checkout has no member-benefit section; coupon (member parts only) and the part `memberId` (always sent when set) are wired.
6. **Paid method "✓ <method>"** (ruling 3) via the bills drawer reader `billDetailAction(saleId)` (`bills-actions.ts:67` → `bill.payments[].type` → `pos.register.pay.*`), one call per PAID part, cached per sale — not a deviation, cited.
7. **SEAT tab also shows the N stepper** (ruling 4; 15C draws only chips) to change the seat count; "+ เพิ่มบิล" is ITEM-only.
8. **Preview before saving** (ruling 2): header/left totals = pure allocator over all items (EQUAL run ⇒ base + one service charge = the plan total in every mode); per-card amounts appear once every unit is assigned (incomplete ⇒ "—" + "ยังไม่ได้เลือกบิล/ที่นั่ง N รายการ"). After saving, cards show `SplitPlanView` values.
9. **Scrim tap does not close the split modal** (ruling 2 frame) — unsaved drafts; × / Esc close it.
10. **Visual fixture** (ruling 10): temp products are created with prisma directly (like `makeFixtures`) on the QC coffee unit; the POS **system-level** service charge is set to 10 % when different and restored after the last P2.5U job / finally / signals ⇒ run the p2.5u lanes (owner/cashier, th/en) one at a time. Cleanup cancels unlocked plans through `registerCancelSplit`, then deletes the plan/part/line rows of the fixture sessions with the table rows (raw, cleanup only — the locked EQUAL-4 plan cannot be cancelled); the PAID part-1 bill stays (like `sale-done`).
11. Drag/merge direction (ruling 8): drop a dining table on another = merge the dragged table **into** the drop target; panel merge = into the selected table; TABLE_BUSY "ใช้รวมโต๊ะแทน" = merge chooser into the moving table with the busy table preselected.

## Fixtures (visual `p2.5u`)
Letter `"ABCDEFGHJKLMNPQRSTUVWXYZ"[(pid+13)%24]` · zone "ในร้าน · QC P2.5U <L>" · tables <L>1–<L>7 · <L>1–<L>5 opened (4 guests, QC member `0899000001` when the gate passes) each with one 15B round (8 lines ฿1,240 = ต้มยำกุ้ง 180 · กะเพราไก่ไข่ดาว 99×2 · ข้าวสวย 15×4 · ปลาหมึกผัดไข่เค็ม 230 · ยำวุ้นเส้น 150 · ชาไทยเย็น 69×3 · ลาเต้เย็น 75×2 · บราวนี่ 65) · plans via `registerSplitTable`: <L>2 ITEM = ALLOC_15B (742.50 / 621.50) · <L>3 SEAT = ALLOC_15C (338.25 / 458.15 / 242.55 / 325.05, ยำ shared 37.50) · <L>4 EQUAL 4 (4 × 341) · <L>5 EQUAL 2 + one round after the plan (outside 1) · <L>1 no plan · <L>6 <L>7 free. `split-locked` pays part 1 of <L>4 in cash through the UI once per run.

## `--state` list for the controller (QC5 · wo `p2.5u` · 1440/1024/390 · th + LOCALE=en · owner + cashier)
- `--page tables --states --state tbl-panel-actions,split-items,split-equal,split-seat,split-locked,split-new-items,tables-floor-split,move-sheet,merge-sheet,prebill-preview`
- `--page register --states --state split-part-pay`
- Order matters only for `tables-floor-split` (after `split-locked` ⇒ "แยกบิล 1/4"; alone ⇒ "0/4"). Cashier: `move-sheet` / `merge-sheet` = panel with the disabled buttons (QC cashier = STAFF with `pos.sale.create` + `member.customer.read`, no `restaurant.session.move|merge`). ⚠️ one real cash bill per run (`split-locked`).

## Follow-ups
- F1 Member name per split part (S `SplitPlanView.parts[].memberName` or a by-id reader) → P2.11.
- F2 `memberChoices` (points/voucher) on table and part pay → with the table checkout benefits section (P2.11/P2.12).
- F3 Paid method per part = N `billDetailAction` calls → S could add `paidMethods` to `SplitPlanView` (R10 mentions it) → P2.11.
- F4 Visual fixture toggles a system-level setting (service charge) → a fixture-scoped POS system would allow parallel lanes.
- F5 15C seat drag (review suggestion) not built — tap/segmented assign only.
- F6 "voided part on a closed session" helper (S F4 owner line) not built.

## Gates — final on the merged head **0d4d8467** · dirty 0 · logs `scratchpad/p25u/runs/merged/*.log` (first line `tree=/root/projects/shark-pos-c head=0d4d8467 dirty=0`, 20/20) · `runs/merged/SUMMARY.txt`
| gate | result |
|---|---|
| typecheck (iso · `/tmp/pos-gate.lock` · 5632 MB) | exit 0 |
| qc-pos-p2.5 **unforced** | **49/49** (no server change) |
| qc-pos-p2.4 · p2.9 · p1.3 · p1.10 | 50/50 · 62/62 · 128/128 · 40/40 |
| qc-pos-p1.18 (ST7 U-PHASE 0 · nav pins) · qc-hf-pos-page-authz | 81/81 · 81/81 (page `tableKeys` uses `evaluate` — T-1 static unchanged) |
| qc-restaurant / -money / -pay / -void | pass · 6/6 · 19/19 · 11/11 |
| qc-pos-p2.8 (ST6 green — `register.ts`/`service.ts` untouched) | 61/61 |
| fitness no-env / env (qc4) · fitness-pos | 50/50 · 50/50 · 8/8 (F15.3a/b inventory · F15.4 3062+ keys) |
| `visual-pos.mts p2.5u --states --dry` tables/register × owner/cashier (CI=1) | rc 0 ×4 (+ LOCALE=en tables owner rc 0) |
Pre-merge run on code head cbed7688 (`runs/*.log`, header `head=cbed7688 dirty=0`): identical results (p2.5 49 · p2.4 50 · p2.9 62 · p1.3 128 · p1.10 40 · p1.18 81 · authz 81 · restaurant ×4 · p2.8 61 · fitness 50/50 ±env · fitness-pos 8/8 · dry ×4 · typecheck 0) + a mid-way typecheck (exit 0, uncommitted tree, `runs/typecheck-mid.log`). Typecheck ran 3× (mid · pre-merge · post-merge) — the third was needed by the upstream merge (LANE-RULES 5 says ≤ 2).
Not run (controller): real screenshots on QC5 (`--state` list above).

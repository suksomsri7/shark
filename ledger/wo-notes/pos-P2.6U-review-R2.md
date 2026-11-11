# P2.6U review R2: fix round 1, `wip/pos-p2.6u` f67790a7 (code a14dcb61)
`1df0a6c2` does not resolve in tree c. The last code commit is **a14dcb61**; a14dcb61..f67790a7 adds ledger only (red1 + notes).
**Verdict: MERGEABLE.** F1–F6 and V1–V9 are fixed as ruled. The server diff is readers only, A15 is the only oracle add, and the gates match the logs. G1–G3 are Low/Nit and can ride with the controller's re-shoot or P2.11.

## Findings
- **G1 (Low) The fixture cleanup's early-return guard ignores the shift and the bill.** The guard is `cleanupP26u` `visual-pos.mts:4590` (`if (!stationsCreated.length && !orders.length && !zones.length && !marked.length && !pausedOn) return;`). The "ยกเลิกบิลหน้าขาย" and "ปิดกะ fixture" steps (`:4624-4640`) run before "ลบรอบ/ลบโต๊ะ/ลบสถานี", which empty those arrays (`:4657/:4664/:4671`). Input: on the first cleanup pass (after the last fixture state, `:5653`) the void or close throws, for example because of a transient DB error. The later steps still clear the arrays, so the `finally`/signal pass (`:1063`, `:5728`) returns early. The QC5 shift then stays OPEN and the cash bill stays PAID. `P26U.ok=false` is logged, so it is visible but not repaired. Smallest fix: add `&& !P26U.shiftId && !(P26U.sale && !P26U.saleVoided)` to the guard. The happy path is correct: void first, then close, the order S11 requires.
- **G2 (Low) After-sale printing can be silent.** In PayDone, `printKitchen` runs only when one of the 3 queue polls (~2 s) sees the round (`PayDone.tsx` poll + `printKitchen`). A slow `ticketForSale`, or a heal that comes later, means no slip and no status line. Separately, in browser mode the receipt auto-print and the kitchen slip each open a print dialog. That is acceptable. Optionally show "no kitchen ticket yet" on the 3rd miss; P2.11 can add a KDS-side "unprinted" marker.
- **G3 (Nit)**
  - V1 `userInitial` (`kds-ui.ts`) strips only U+0E40–U+0E44 (เ แ โ ใ ไ). Leading digits, punctuation and emoji are not skipped. That is fine for real names; adding `[^\p{L}]` would cover the rest.
  - The `fx1-dry-*.log` files have no `tree/head` header line (the rc is only in `fx1-gates-summary`). The en dry plan is 1440-only (8 shots), while the controller's re-shoot list says "owner en incl. 390".

## Verified OK
1. **F1/V5.** `kdsKitchenProducts` (`kds.ts`, P2.6U block) uses `kscope(... "availability")` (NEED = sale.create | kds.advance | product.manage).
   - It reads only: tenant + `systemId` filters; MENU rows only via this unit's MenuItem on an active station; non-MENU rows with `unitId ∈ {null, this}` and their own or parent station among this unit's active stations.
   - `available` = `availabilityFor`, marks are this unit's, ≤ 500 rows. Cross-tenant and cross-unit rows cannot appear.
   - The sheet uses `kdsKitchenProductsAction` and no longer calls `registerCatalogAction`. It lists 86'd items first and filters on typing; "no results" shows only for a query.
   - A15: a COOK-only actor gets kaprao/chayen/cookie and not water; the result equals `availabilityFor`; no money keys; NOPERM gets PERMISSION_DENIED. red1 = 65/66 with A15 only, at 3a32f55d with `src` from e7ed4eac.
2. **F2.**
   - `roundOfSale` is a read only. `kdsQueueNoAction` returns `{queueNo, orderId}` and is async-only under `"use server"`.
   - PayDone uses a module-level `kitchenPrinted` Set, marked before printing, so it prints once per sale across re-renders and polls.
   - It sends one payload per selected station; with none selected it sends `stationId` undefined, meaning all stations.
   - A failure gives only the `pos-reg-done-kitchen-error` status line and never blocks.
   - Slips carry no money (S payload).
3. **F3.** `kdsStations`/`kdsStationsAction` (NEED `stations` = read keys + product.manage) only reads `kitchenStationsForPos`, with no heal and no board compute. 17B (`DeviceSettings`) and the 06 drawer (`kitchen-ui.tsx`) use it.
4. **F4.** `held: kitchenHeld && chanById.get(c.channel.id)?.autoAccept && c.channel.adapter !== "MANUAL"` (`OrdersScreen.tsx`).
5. **F5/V4.**
   - The fixture opens its own shift (`posqc-vis-p26u-<pid>`, `:4521`), sells, voids through `voidSaleByActor` while the shift is still open, then runs `closeShiftAsOwner`.
   - Cleanup runs after the last fixture state, in `finally` and on SIGINT/SIGTERM/SIGHUP. Residue: see G1.
6. **V1.** Leading เ แ โ ใ ไ are skipped (the lone "ι" was "เ"). Non-letters: see G3.
7. **V2–V9.**
   - V2: the inline top bar is `h-14 shrink-0 grow-0` (56 px) with no `flex-1` in the column.
   - V3: on 390 the harness taps `pos-kds-seg-ready` before recall/refusal and waits on `pos-kds-board`.
   - V6: stacked radio rows with the PLANNED chip inline (`whitespace-nowrap`).
   - V7: `shortName` = first word before a space or "(", ≤ 12 chars + "…".
   - V8: value as text "ปิด" / "{n} ใบ" (`pos-ord-kitchen-max-value`).
   - V9: "#n · source" is one string.
   - F6: meter text then bar; authz marker "ผู้คุม"; resize listener removed.
8. **Server diff** = `kds.ts` (`roundOfSale`, `kdsKitchenProducts`, `kdsStations`, two NEED rows), `kds-actions.ts` (two read actions, plus `orderId` on `kdsQueueNoAction`) and `kds-shared.ts` (types). No write path changed, so the earlier DB suites stand; p2.6 was re-run unforced.
9. **Oracle** = `qc-pos-p2.6` A15 (dated `ORACLE-ADD ผู้คุม`) + the authz marker wording (3 comment lines). Nothing else.
10. **Gates** (headers `head=fb115dd0 dirty=0`; fb115dd0 = a14dcb61 + red1 only): typecheck rc 0 · fitness 50/50 ±env · fitness-pos 8 · p2.6 66/66 ×3 residue 0 · authz 81 · p1.18 81 (ST7 0) · p1.10 40 · visual `--dry` all pages owner/cashier (kds 390 planned: owner 9 / cashier 7 rows) + en. th/en keys: 2931 each, new keys present.

## Status
**R1:** F1 closed (A15) · F2 closed (option b, ~35 lines; G2 note) · F3 closed · F4 closed · F5 closed (void + close; G1 guard) · F6 closed.
**Controller V findings:** V1–V9 closed (V3 in the harness) · V10 accepted.
**Next:** the controller re-shoots the full `p2.6u` list on QC5 (incl. 390, and en at 390 if wanted); then the money/stock hunter on the U `kds.ts`/`kds-actions.ts` hunks before merge.

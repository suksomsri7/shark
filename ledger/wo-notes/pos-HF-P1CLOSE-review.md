# HF-P1CLOSE review: `wip/pos-hf-p1close` 64872b67 (base 711b6d5e), tree b, read-only
**Verdict: MERGEABLE-AFTER-FIXES.** The product UI is sound. Two harness points need fixing or a controller acceptance before vis58: F2 and F3. The rest is Low or Info.

## Findings
- **F1 Low (O13 scope creep).** `products/page.tsx:41`: the new "no accessible POS unit → notFound()" line runs before `canPrice`.
  - Input → outcome: an owner (allBranches) on a POS with **zero linked units**. Before this change `posCanSetTenantPrice` returned true and the page rendered with its "connect inventory" empty states (`servicesNoInventory`/`itemsConnect`). Now `posUnits` is `[]`, so the page is a 404. This is consistent with stock/reports/shifts (`units.length===0 → notFound`), but ruling O13 only asked for the cashier refusal card.
  - Fix: controller either accepts it as house grammar (record it in the notes), or makes the line `if (units.length > 0 && !units.some(...)) notFound()` and adjusts the P-7 string.
- **F2 Medium (harness rule).** `visual-pos.mts` `runPromptPayTimeout`: `prisma.posPaymentIntent.updateMany({… expiresAt: past})` is a **raw write that is not cleanup**. That breaks "no raw writes except cleanup" and the O11 wording ("via the existing QC hooks").
  - Mitigations are good: it touches only this run's newest PENDING row on DEVICE_ID since RUN_STARTED, scoped by tenantId, and `cleanupIntents` covers it via INTENT_STATES. The `lock-pin-locked` precedent exists. Fix, one of:
    - (a) Controller ACCEPT, recorded as a harness deviation with the precedent.
    - (b) No raw write: set `qrExpiryMinutes` to `POS_QR_EXPIRY_MIN` through the payment-settings service, wait for the real expiry (≈60 s per shot), and restore it in `finally`.
- **F3 Low (O5 proof is weaker than claimed).** `lock-screen-scroll`: `const held = P115.heldId ? await inView("pos-staff-held") : true`. Input → outcome: if `seedP115Once` did not create a held bill, the held-card assertion silently passes, and the O5 evidence then proves only the switch button.
  - Fix: `if (!P115.heldId) throw new StepError("no held bill for 13B scroll proof")`. Staff cards sit above the switch, so reaching the switch is enough for those.
- **F4 Low (O1, 390 row, unverified).** `RegisterTopContext.tsx:63`: on mobile the unit chip is `shrink-0 max-w-[50%]` (≤175 px).
  - Fixed items at 390 with lock and menu present: camera, lock and menu buttons 3×44 + 5 gaps×16 = 212 px, leaving 138 px for unit + shift.
  - Input → outcome: a unit name wider than ~114 px collapses the shift chip to its padding, and the row still overflows by up to ~61 px (menu button off-screen, horizontal scroll).
  - Fix: let the unit chip shrink with a floor, e.g. `min-w-[96px] max-w-[50%]` (no `shrink-0`). Or confirm in vis58 with a long unit name.
- **F5 Low (process).** The ORACLE-EDIT P-7 (`qc-hf-pos-page-authz.mts:73–85`) shares commit 057fb075 with the page change, not its own commit, so red-before cannot be shown from history (the builder claims a static mutation check). Fix: split it into its own `test(...)` ORACLE-EDIT commit, or controller accepts it as is.
- **F6 Info.** `pos-ui-inventory.json:239–252`: the `pos-reg-tab-*` note still says "รายงาน = เร็ว ๆ นี้".
  - `ReceiptSettings.tsx:394/398/407` keep dead `REVOKED` branches after the ACTIVE filter.
  - When a unit has only revoked devices, `DeviceSettings.tsx:108` falls back to `r.items[0]`, so the selected (revoked) card sits inside the collapsed fold.
  - `list.log` has no `tree= head=` header (the run time sits between 6647cbdf and 286a29ed).
  - `paydone-print-failed` restores `printerConfig: null` (defaults), not a snapshot. That is equivalent here because seed u2 sets only `posRegNo`.

## Verified OK
1. **O1.**
   - `RegisterModeTabs.tsx:27` sets `href ${base}/pos/reports`, and `:30` `soon` = tables/online-orders only, so reports renders as a `Link` like the live tabs.
   - 1440 is unchanged: the desktop `capW` is identical, and `shiftChip("hidden lg:inline-flex")` (`:192`) keeps `shrink-0`. The inner `truncate` span inside a shrink-0 parent never clips. The mobile-only change is at `:63/:126/:144`.
2. **O2.**
   - `BillDiscountDialog.tsx:103`: no `aria-disabled`, no `soonChip`, and `onClick={onCoupon}` is unchanged. A grep for either string in the file returns nothing.
   - The inventory row `pos-reg-coupon` already points at `pos-reg-coupon-dialog`.
3. **O4.**
   - `settings-ui.tsx:35–37`: `stackBelowXl` switches the row to `xl:flex-row`, and the default stays `md:flex-row`.
   - Only `SharkSettings.tsx:132` passes it. That single `head` is rendered by the load-error (`:155`) and main (`:319`) paths, covering owner, cashier and account-off.
4. **O5.**
   - `LockScreen.tsx:342` uses `md:min-h-0`. The md+ classes are unchanged, so 1440/1024 `lock-screen` states are unaffected. On phones the wrapper grows inside the `fixed inset-0 overflow-y-auto` overlay (`:306`).
   - The state scrolls `pos-lock-screen` to the bottom and asserts `sh>ch && top>0`, plus `pos-staff-switch` (and the held card, see F3) inside `innerHeight`; otherwise it raises a StepError. The shot is viewport-only.
5. **O7.**
   - 17A: `ReceiptSettings.tsx:102` uses `activeDevices` (`:390–393`).
   - 17B: `DeviceSettings.tsx:252–253` splits active/revoked, and the fold at `:365` has `aria-expanded` and defaults to `useState(false)` (`:84`).
   - Messages are in th and en (`:1242`). `deviceCard` is extracted verbatim, and the revoke/select handlers are unchanged. No DB sweep.
6. **O13.**
   - Reads before the refusal at `:56` are the appSystem row, `posUnits` and `posPriceUnitIds` only. `listPosProducts`/`posServices` come after it (`:73–75`).
   - The card shows only the sys name, tabs, `nav.products` and `permissionDenied` (th/en `:1166`). It returns HTTP 200, the same as `pos-stock-refusal`/`pos-report-refusal`.
   - A user with no accessible POS unit still gets a 404.
   - **ORACLE-EDIT P-7: ACCEPT.** It still requires the same `posCanSetTenantPrice(posPriceUnitIds)` guard and no `assertCan`. It adds three new constraints: gate < refuse < first product/service read, the refusal testid, and the unit 404. That makes it stronger than the old string check, and it matches ruling O13. Count 56/56 (`authz.log` at 6647cbdf; later commits touch no product code).
7. **Harness.**
   - New ids: `held-drawer` (3 sizes), `paydlg-promptpay-timeout` (3), `lock-screen-scroll` (390) and `paydone-print-failed` (desktop, after `paydone-print`). `sale-done` adds mobile; en runs are desktop-only via `viewports`.
   - `rpub-*` runs at 3 sizes in th and en; `issue-sent` stays at 390 because of the rate limit.
   - `--list` exits 0 with 78 ids.
   - `held-drawer` uses `openHeld → refreshHeld`, so the new bill is listed. Held bills are discarded in `finally` and in the signal handler (`cleanupHfP1`); a failure counts toward `failures`.
   - The print-failed state is deterministic: `usb.ts:88/93` uses `getDevices` (no chooser), so NO_DEVICE → `PrintStatus` fallback with retry and browser buttons. The `finally` restore runs even when the state throws.
   - `pos-qc-env.mts` is untouched (`receipt-public` was already in `POS_PAGES`). New code uses the existing `Any` alias only; typecheck 0 at 286a29ed.
8. **Ledger and gates.**
   - The `POS-OWNER-PENDING.md` O3 (core owner) and O12 (approval owner) lines are present.
   - The notes carry file:line per item, the O5 verdict, the 19ค decision and the state ids. Spot-checked lines match.
   - Logs: typecheck run 1 EXIT 2, fixed, run 2 EXIT 0. fitness-pos 8/8, fitness no-env 41/41, authz 56/56. Fitness with env is CONTROLLER-RUN; eslint is N/A on tree b. ST7: new Thai text in `.tsx` is in comments only, and no `'use client'` file gains an import.
9. **Builder's open points.**
   - 14B on a phone with an empty cart: confirmed. `pos-reg-held-bills` lives only in `CartPanel.tsx:125`, the mobile sheet needs a cart line, and the 13B held card is not a button. → **later-card** (P2 small UI card: a held-bills entry on the 390 cart bar/top row). It is not fix-now: the primary register (md+) reaches it, and the entry placement needs a mockup call.
   - Expired-card wording: the app shows "QR หมดอายุ + สร้างใหม่" (`pos-pay-intent-expired`), while the 19ค mockup has "PromptPay ยังไม่ได้รับเงิน · ลองใหม่ · เลือกวิธีอื่น · ยืนยันเอง". Record this as a vis58 comparison row (deviation or later copy card), not a harness failure.

## Controller rulings (account A, 10 Oct 00:4xZ)
- **F1 → accept as house grammar** (zero accessible POS units ⇒ 404, same as stock/reports/shifts); builder records it in the notes as deviation; P-7 string stays.
- **F2 → accept (a)**: the `expiresAt` write touches only this run's own PENDING intent on the QC device, is cleaned by `cleanupIntents`, and follows the `lock-pin-locked` precedent — recorded as a harness deviation in the notes; no product hook.
- **F3 → fix**: throw `StepError` when `P115.heldId` is missing so `lock-screen-scroll` always proves the held card.
- **F4 → fix**: unit chip on mobile shrinks with a floor (`min-w-[96px] max-w-[50%]`, no `shrink-0`), shift chip keeps truncating; vis59 confirms with the real unit name.
- **F5 → accept as is** (static mutation check in the log; count 56 unchanged); future ORACLE-EDITs keep their own commit.
- **F6 → fix the three code nits** (inventory note for `pos-reg-tab-*`; drop dead REVOKED branches in `ReceiptSettings.tsx`; `DeviceSettings.tsx` selects the first ACTIVE device, falling back to a revoked one only when none is active); log header + printerConfig restore = info only.
- **Open points**: 14B held-bills entry on the phone → later card (P2 small UI, controller adds the plan row); expired-card wording vs 19ค → vis59 comparison row.
- Merge after fix round 1 (controller diff read) → build59 @merge → vis59 on QC5 (P1 close set + new states).

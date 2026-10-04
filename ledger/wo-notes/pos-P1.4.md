# POS P1.4: barcode builder notes (cloud run, no DB, 4 Oct 2026)

Branch `wip/pos-p1.4` (local `p14-local`), base 79de029f. Oracle `scripts/qc-pos-p1.4.mts` is unchanged. Brief: `pos-brief-P1.4.md` (O22 = YES, controller rulings 1–4).

## What was built
- **`src/lib/modules/pos/scan-shared.ts`** (new, pure). It holds:
  - `classifyScanBurst(keys, ctx?)`. Decision order is ime → dialog → input → timing. Modifier keys are skipped. Any other multi-char key means `type`. A scan needs ≥4 chars, every gap ≤30 ms (including the gap to Enter/Tab), and Enter or Tab as the last key.
  - `scanOutcome(result, {canOverridePrice})`
  - `SCAN_MAX_GAP_MS`, `SCAN_MIN_LENGTH`, `SCAN_CAMERA_FORMATS`
  - `SCAN_CAMERA_FALLBACK_PKG = "@zxing/browser"`
- **`register-shared.ts`**: `cartAddProduct(cart, productId, newLineKey)` is the pure +1 reducer, extracted from the old `addProduct` updater. `addProduct` now uses it, so a card tap and a scan behave the same way.
- **`RegisterScreen.tsx`**: the scanner path.
  - **Window `keydown` listener in the capture phase.** It keeps a buffer of `{key, at: e.timeStamp, isComposing}` and resets the buffer when a gap is >30 ms. On Enter or Tab it calls `classifyScanBurst(keys, {dialogOpen: layers>0, target})`, where target is search, input or body.
  - **When the result is a scan:**
    - It calls `preventDefault` and `stopPropagation`. As a result, the search box's React `onKeyDown` never sees the Enter (one add per scan, ruling 3). A focused button is not clicked, Tab does not move focus, and Enter cannot confirm a dialog.
    - It records `lastScanAt`. `addFromSearchEnter` also returns early within 250 ms of a scan, as a second guard.
    - If the focus was in search, `clearSearchForScan()` runs (ruling 2). It does `catalogSeq++` to drop in-flight grid results and calls `setQ("")`. The q-effect cleanup cancels the pending 200 ms timer. The reload is skipped when the grid already shows the empty query.
    - Then `onScannedCode(code)` runs.
  - **When a dialog is open and the timing matches a scanner:** the terminator is swallowed and the toast `scan.ignoredWhileDialog` is shown (B2: pay dialog and any other layer).
  - **`onScannedCode`** is the single scan route for the wedge scanner and the camera.
    - It calls `registerScanAction` directly and has the `billGen` guard.
    - It drops the result if, while it waited, the bill became frozen or a pay/done layer opened (that case shows a toast).
    - It then calls `applyScan` → `scanOutcome`:
      - `add` → `pick()`, which uses `cartAddProduct`. A repeat scan is +1. The open-price and options rules are unchanged.
      - `choose` → the `ScanChooserDialog` layer. The grid is no longer hijacked; `setProducts(r.products)` is removed.
      - `none` → toast `scan.notFound`, plus a button `pos-reg-scan-add-custom` "add as custom item?". The button appears only when `offerCustom` (= `limits.canOverridePrice`).
      - `error` → `errorFor(code)`.
  - **`addFromSearchEnter`** (a person typing a term + Enter) reuses `applyScan`. A "none" here keeps the `search.noResult` toast, because P1.3 S5.20 n3 pins it. It also gets the custom offer.
  - **Thai keyboard layout:** `scanKeyOf(e)` maps non-ASCII keys back to digits and letters using `e.code`. A wedge scanner on a Thai layout would otherwise type `ๅ/-ภถ…`.
  - **Both camera buttons** (top context on mobile, SearchRow) now call `openCamera` instead of `soon`.
- **`ScanChooserDialog.tsx`** (new):
  - The dialog is `pos-reg-scan-chooser`. Rows are `pos-reg-scan-choice-<id>` with `min-h-14`, in server order.
  - Each row shows name, SKU/barcode and price. The first row is autofocused.
  - There is a cancel button.
- **`ScanCameraDialog.tsx`** (new; testid `pos-reg-scan-sheet`). The name avoids the `…Sheet` suffix, which fitness treats as interactive.
  - **Camera:** `getUserMedia` for the rear camera.
    - `NotAllowedError` or `SecurityError` shows `scan.cameraDenied`.
    - No camera, any other error, or no `mediaDevices` (an insecure context) shows `scan.cameraNone`.
  - **Native detection first:** it checks `"BarcodeDetector" in window`, then `getSupportedFormats()` filtered to the 5 B3 formats. A frame loop runs every ~120 ms.
  - **Fallback:** otherwise it runs `await import("@zxing/browser")`, but only after the camera opens. It uses `BrowserMultiFormatReader.decodeFromStream` and accepts only EAN-13, EAN-8, UPC-A, Code128 and QR.
  - **After one read:** it stops all tracks and calls `onCode`. The parent pops the sheet and calls `onScannedCode`. Continuous mode is not built; it is off by default.
  - **On unmount:** all tracks are always stopped. This is safe under StrictMode.
- **Messages** `pos.register.scan.{chooseTitle, notFound{code}, addAsCustom, ignoredWhileDialog, cameraTitle, cameraHint, cameraDenied, cameraNone}` in th and en. `search.chooseOne` is now unused but kept, because it is in P1.3's I18N list.
- **`scripts/pos-ui-inventory.json`**: 4 rows (`pos-reg-scan-choice-*`, `-chooser-cancel`, `-sheet-close`, `-add-custom` for owner only), needed for fitness F15.3a.
- **Dependency (O22):** `@zxing/browser@^0.2.1` in `package.json` and `pnpm-lock.yaml` (+4 packages, additive only). It was installed with `pnpm add @zxing/browser --config.virtual-store-dir=/home/user/shark/node_modules/.pnpm`, because node_modules is a symlink. I added a merge-checklist line to `pos-runbook-P6.1-DRAFT.md` §0.

## Files
`src/lib/modules/pos/scan-shared.ts` (new) · `src/lib/modules/pos/register-shared.ts` · `src/components/pos/register/RegisterScreen.tsx` · `src/components/pos/register/ScanChooserDialog.tsx` (new) · `src/components/pos/register/ScanCameraDialog.tsx` (new) · `src/messages/{th,en}/pos.json` · `scripts/pos-ui-inventory.json` · `package.json` · `pnpm-lock.yaml` · `ledger/pos-briefs/pos-runbook-P6.1-DRAFT.md` · this note.
Not touched: `src/lib/actions/pos.ts`, `register-ui.tsx`, `prisma/`, `.env*`, the oracle.

## No-DB results
- `pnpm exec tsx scripts/qc-pos-p1.4.mts --no-db` → **13/13, exit 0** (base was 0/13).
- `pnpm exec tsx scripts/qc-pos-p1.3.mts --list` → exit 0. P1.3 has no no-DB mode. Instead, I re-ran its static regexes from a scratch copy, and all are true: S5.20 s1Fn, s1Gen, n3, n4, r1, na, inert and pay; S5.21 single randomUUID and rotation only in `resetBill`; S5.3 no Thai outside comments; S5.17 G9 imports. The S5.9 camera tags are unchanged.
- `pnpm fitness` (DATABASE_URL unset) → **41/41, exit 0**.
- `pnpm typecheck` → exit 2 with **one error, in the oracle**: `scripts/qc-pos-p1.4.mts(177,16) TS7060` (`const clone = <T>(o: T)` in an `.mts` file needs `<T,>`). This is pre-existing on the base and needs an ORACLE-EDIT; the builder must not edit the oracle. `src/` has 0 errors.

## VPS DB run must confirm (CONTROLLER-RUN)
- `pnpm install` on the VPS first, so that node_modules has `@zxing/browser`. Otherwise typecheck and build fail on the dynamic import.
- `QC_FORCE=1 … qc-pos-p1.4.mts` should give 21/21. R3 needs the DB. K1–K5, Z1 and Z2 are regression guards that were green on base.
- The `qc-pos-p1.3` full run (S5.x statics plus DB groups) and `qc-pos-*` must stay green, along with fitness with and without .env, typecheck after the ORACLE-EDIT, and `next build`, which checks that the zxing chunk is split.
- `visual-pos.mts P1.4` for the chooser, the camera sheet and the toast with its custom button.

## Browser checks for the controller
1. Wedge scanner with focus (a) in search, (b) on the grid background or a focused product card, (c) on the cart:
   - One scan adds exactly one item.
   - A repeat scan makes qty +1 on the same line.
   - The search box is left empty, and no search results flash.
   - Tab as terminator does not move focus.
2. Scan while the pay dialog is open: nothing is added, the toast "ignoredWhileDialog" appears, and the Enter does not confirm payment. Do the same with the chooser, the camera sheet and the custom-item dialog open.
3. A duplicate barcode opens the chooser. Rows are ≥44px. Picking one adds it; cancel adds nothing.
4. Unknown barcode:
   - As owner: the toast plus the "add as custom item?" button opens the custom dialog.
   - As cashier: the toast has no button.
5. Thai IME and Thai-layout typing in search are never classified as a scan. A wedge scanner with the OS keyboard set to Thai still sends digits (the `e.code` mapping).
6. Camera on Chrome/Android (native): the permission prompt appears, one read adds the item and closes the sheet, and the camera light goes off.
7. Camera on iPhone Safari (fallback): the zxing chunk loads only when the sheet opens (Network tab). EAN-13, EAN-8, UPC-A, Code128 and QR all read.
8. Camera failures: denied shows `cameraDenied` in Thai. No camera, or plain http, shows `cameraNone`.

## Open questions
1. **Typecheck error in the oracle:** the TS7060 at `qc-pos-p1.4.mts:177` needs a one-character ORACLE-EDIT (`<T,>`).
2. **Continuous camera mode** (B3, "setting, off") is not built. Single read is hard-wired. Should it be a later WO?
3. **Custom item from "none":** the CustomItemDialog opens empty. It is not prefilled with the scanned code, because the dialog has no prop for that. Is prefilling wanted?
4. **"Ignored while dialog" scope:** it applies to every open layer (mobile cart sheet, chooser, camera, line editor …), not only pay. Is that OK?
5. **Scan with focus outside search while a search term is shown:** the term is kept and the scan only adds the item. The search box is cleared only when the burst was typed into it.
6. **Node engines:** `@zxing/library` declares `engines.node >= 24`. Check the VPS and build node version (pnpm only warns unless engine-strict is on).

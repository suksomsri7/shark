# P1.4 — barcode: scanner burst + camera (brief DRAFT · controller · cloud run · 3 Oct 2026)

> DRAFT without DB. Preconditions: P1.3 accepted + merged; re-verify file:line; owner answers O22. Mockup 01 (scan field + camera button).

## Facts (on `wip/pos-p1.3` 5f97add4)
- Server: `pos/register.ts:693` `registerScan(ctx, actor, {barcode}) → {ok, match:"one"|"choose"|"none", product?|products?}` (+ `registerScanAction`), built on `catalog.byBarcode → {items}` (P1.1a-R2 C5: all matches returned).
- UI: `RegisterScreen.tsx:467` `addFromSearchEnter()` = the single scanner entry (P1.3 Q24: autofocus + Enter adds single/exact match); B2.2 made it race-safe (functional cart, bill generation guard, `none`→toast, `choose`→candidates in grid + toast). Camera button `pos-reg-scan-camera` = "soon" toast.
- No barcode library in `package.json`.

## Rulings (proposed)
B1 **Burst detection**: keystrokes ≤ 30 ms apart ending in Enter/Tab with ≥ 4 chars = scanner; scanner input never triggers the 200 ms search debounce and is routed straight to `registerScan`; works even when focus is outside the search box (global listener, ignored inside inputs other than search, ignored while a dialog is open or IME composing).
B2 **Repeat scan = +1** on the existing line of the same product (same price/options), never a new line; scanned while a pay dialog is open = ignored with toast.
B3 **Camera**: native `BarcodeDetector` when present; otherwise lazy-loaded fallback library **only if O22 = yes** (else camera button stays hidden on unsupported browsers — not a "soon" toast). Formats EAN-13/EAN-8/UPC-A/Code128/QR. Permission denied / no camera ⇒ clear Thai message. Sheet closes after one successful read (continuous mode = setting, off).
B4 **Chooser** for `match:"choose"` = proper dialog (not grid hijack) with ≥44px rows; `none` ⇒ toast + "add as custom item?" only for roles allowed to open-price (existing permission).
B5 Oracle `qc-pos-p1.4.mts` (~15): burst classifier unit tests (timings table), +1 merge, chooser, cross-tenant/other-unit barcode = none, archived = none, statics (no debounce on scanner path, listener ignores IME/dialogs). Camera = controller browser check (cannot be automated headless).

## Owner question
- **O22**: add a barcode-decoding dependency (e.g. `@zxing/browser`, lazy-loaded, ~100 KB gz) so iPhone/Safari can scan with the camera? `package.json` is shared with the CRM branch (merge cost small). Recommendation: yes.

## Owner answer (4 Oct 2026)
- **O22 → YES.** Add a barcode-decoding dependency for the camera fallback (e.g. `@zxing/browser`), lazy-loaded only when the camera opens and BarcodeDetector is missing. The builder adds it via `pnpm add` in its own tree, commits `package.json` + `pnpm-lock.yaml` by explicit path, and lists it for the CRM/main merge checklist.

## Controller rulings on the oracle writer's questions (4 Oct · oracle `wip/pos-p1.45-oracle` 2b7b35ca, 21 checks)
1. **O22 vs LANE-RULES §3:** the owner explicitly approved this one dependency, so it is an exception to "no `pnpm add` while CRM is live". Add only the camera-fallback package. Commit `package.json` and `pnpm-lock.yaml` by explicit path, and put a line in the P6.1/merge checklist ("re-resolve lockfile at CRM merge").
2. **Search box focused:** when a burst is classified as a scan, cancel the pending 200 ms search, clear the search text, and route to `registerScan`. Never show search results for a scan.
3. **Single entry:** exactly one add per scan. The search Enter handler must defer to the burst listener when a burst is in progress. This is checked in the controller browser check (scan with focus in search and outside it).
4. **Names ratified** as listed in `ledger/wo-notes/pos-P1.4-oracle.md` (`scan-shared.ts` `classifyScanBurst`, `cartAddProduct`, `scanOutcome`, `SCAN_CAMERA_FALLBACK_PKG`). `registerScan` may keep its own query: it matches byBarcode semantics, as pinned by the server checks.

# POS P1.4 — oracle notes (`scripts/qc-pos-p1.4.mts`)

Oracle writer · cloud run · 4 Oct 2026 · base `wip/pos-p1.45-oracle` = `session/pos` cb1a2331 (P1.3 accepted and merged at 2385c2aa, P1.1b Part A accepted, P1.6 oracle merged).

This container has **no DB** (TCP 5432 is blocked), so the DB groups have never run against data. What I verified here:
- esbuild syntax: OK.
- `pnpm exec tsx scripts/qc-pos-p1.4.mts --list`: 21 ids, exit 0, no DB.
- `pnpm exec tsx scripts/qc-pos-p1.4.mts --no-db`: a new mode that runs only the 13 pure/static checks, without env or prisma. On base it gives **0/13, exit 1**, and every check is red for the expected reason (missing module, export or wiring).
- Satisfiability: I copied the tree to the scratchpad (not the repo) and added a ~40-line reference `scan-shared.ts`, a `cartAddProduct` and a fake UI wiring. The same `--no-db` run gave **13/13 green**, so the timing tables and the static regexes are internally consistent and a builder can meet them.

The first real run is CONTROLLER-RUN on the VPS:

```
bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p1.4.mts              # expect SKIPPED, exit 0
QC_FORCE=1 bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p1.4.mts    # expect 7 green / 14 red, exit 1
pnpm exec tsx scripts/qc-pos-p1.4.mts --no-db                                                                                # no DB needed: 0/13 on base
```

House style is copied from `qc-pos-p1.6.mts`: header contract, `CHECKS` registry and `--list`, the whole-suite SKIP gate with `QC_FORCE=1`, `call()`/`callSync()`, the `ep-frosty-lab` write gate (`assertQc4BeforeWrite`, no bypass), the `qc-p1.4-<rand>` tag, sandbox units and systems, cleanup in `finally`, A5/Z1 row counts plus the receipt-counter sum, the Z2 fingerprint, and `JSON_SUMMARY`. Schema detection is not needed: P1.4 adds no table or column.

**Added on top: `--no-db`.** It runs the B, R1, R2, C and S groups before the env loader, so they work in a container with no DB. It ignores the SKIP gate, exits 1 on any red, and its `JSON_SUMMARY` carries `mode:"no-db"`.

## Check list (21)

| id | X | what | needs |
|---|---|---|---|
| **B1** | – | `scan-shared.ts` exports `classifyScanBurst`, `SCAN_MAX_GAP_MS = 30` and `SCAN_MIN_LENGTH = 4`. The file is pure (no react, next, prisma, server-only, `@/lib/core`, or `"use client"`/`"use server"`). It is deterministic, and a deep-frozen input does not throw. | pure |
| **B2** | X11 | Inputs that must classify as `scan` with the exact code: EAN-13 at 8 ms + Enter; + Tab; exactly 30 ms; exactly 4 chars; 0 ms gaps (USB buffer); Code128 `PQC-CF-WATER`; uppercase with interleaved `Shift` keydowns (`ABC-1234`). | pure |
| **B3** | X11 | Inputs that must classify as `type`: human at 120 ms; slow scanner at 45 ms; 31 ms; a 3-char code; one 200 ms gap mid-code; Enter 150 ms after the last char; no terminator; `Backspace` mid-burst; empty array; lone Enter. | pure |
| **B4** | X11 | Context: `isComposing` on any key or `key:"Process"` gives `ignore/ime`. `dialogOpen` gives `ignore/dialog`. `target:"input"` gives `ignore/input`. `target` `"search"` and `"body"` with scanner timing give `scan`. | pure |
| **R1** | X4 | `cartAddProduct` (register-shared): a repeat scan is +1 on the existing line (same key, no new line). A discounted line, an open-price line, a different product or a custom line with the same name each get a new line with qty 1 and the new key. Qty caps at 9999. A full 200-line cart plus a new product is unchanged, while an existing product still gets +1. `billDiscount`/`memberId` are kept and the input is not mutated. | pure |
| **R2** | X3 | `scanOutcome`: `one` gives add; `choose` gives choose with all candidates in order; `none` gives `offerCustom` equal to `canOverridePrice`; a refusal gives error + code. | pure |
| **R3** | X4 | Server path of +1: `cartAddProduct` twice → `cartToQuoteInput` → `quoteRegisterCart` gives 1 line, gross 5,000, total 5,000. | DB |
| **C1** | – | `SCAN_CAMERA_FORMATS` contains `ean_13 ean_8 upc_a code_128 qr_code`. `SCAN_CAMERA_FALLBACK_PKG` follows O22: with yes it is a package name listed in `package.json` dependencies; with no it is `null`. | pure |
| **C2** | – | Static checks on the camera file under `src/components/pos/register`: BarcodeDetector feature detection, `getUserMedia`, `pos-reg-scan-sheet`, no `onCamera={soon}`. With O22 yes, the fallback is loaded only via `import("<pkg>")`, after the detection, with no static import anywhere in `src`. With O22 no, there is no decoder library at all. | static |
| **S1** | – | Static: RegisterScreen imports `classifyScanBurst`. `onScannedCode` calls `registerScanAction` directly, has the `billGen.current` guard, and does not call `setQ(`/`setTimeout(`/`loadCatalog(`. Something calls it. | static |
| **S2** | X11 | Static: the first `classifyScanBurst(…)` call passes `dialogOpen` and `target`. The key buffer stores `isComposing:`. The target type is checked (`tagName`/`isContentEditable`/`instanceof HTMLInputElement`). There is a window `keydown` listener. | static |
| **S3** | X3 | Static: `scanOutcome(…canOverridePrice…)` is called, `offerCustom` is used, and `"scan.addAsCustom"` is rendered. | static |
| **S4** | X11 | Static: `pos-reg-scan-chooser` exists, and the `pos-reg-scan-choice-` row tag has a ≥44px class. There is no `setProducts(r.products)` grid hijack. `"scan.ignoredWhileDialog"` is rendered. | static |
| **S5** | – | `pos.register.scan.{chooseTitle notFound addAsCustom ignoredWhileDialog cameraTitle cameraDenied cameraNone}` exist in th and en, non-empty, with no Thai in en, and each key is used in register UI code. | static |
| **K1** | – | A unique InvItem barcode gives `one` with that product, three times; a whitespace-padded code also matches. | DB |
| **K2** | X2 | One barcode on 4 products (A, B normal; C archived; D `unitId` = unit 2). Unit 1 gives `choose` = {A,B}, same order twice. Unit 2 gives `choose` = {A,B,D}. C never appears. | DB |
| **K3** | X2 | A barcode that exists only in the QC resto tenant (sandbox POS there) gives `none` in the coffee tenant. Positive control: the resto row exists. | DB |
| **K4** | X2 | A product pinned to unit 2 with a unique barcode gives `none` at unit 1 and `one` at unit 2. | DB |
| **K5** | – | Archived product: both the row's own barcode and the linked InvItem's barcode give `none`. | DB |
| **Z1** | – | Row counts for both QC POS tenants are equal before and after, and the receipt-counter sum is unchanged. | DB |
| **Z2** | – | The fingerprint of pre-existing QC rows (PosProduct, PosCategory, InvItem, AppSystem, AppSystemUnit, BusinessUnit, Membership, PosReceiptCounter) is equal before and after. | DB |

The burst classifier is the pure function **`classifyScanBurst(keys, ctx?)` in `src/lib/modules/pos/scan-shared.ts`**. The full rule text is in the oracle header.
- Decision order: ime → dialog → input → timing.
- Modifier keys (`Shift`/`Control`/`Alt`/`Meta`/`CapsLock`) are skipped for both length and gap.
- Any other multi-char key before the terminator means `type`.
- `scan` requires all of the following:
  - the last key is Enter or Tab;
  - there are at least 4 printable chars;
  - every char-to-char gap, and the last-char-to-terminator gap, is ≤ 30 ms (30 counts as scanner, 31 does not).

## Expected results on the current base (cb1a2331)

- **Unforced:** `SKIPPED`, exit 0. Four P1.4 reasons are listed: no `classifyScanBurst`, no `scanOutcome`, no `cartAddProduct`, and RegisterScreen not wired. The two seed lines appear only if the seed is missing.
- **`QC_FORCE=1`:** 7 green / 14 red, exit 1.
  - **Red (14):** B1–B4, R1, R2, C1, C2, S1–S5 all fail with `MISSING:…` or "not found in source". R3 fails with `MISSING:cartAddProduct`.
  - **Green (7):** K1–K5, Z1, Z2. K1–K5 are regression guards on behaviour P1.3 already ships (register.ts:705 filters tenant, unit, archive and inventory, and returns every match), so they are green on base by design and must stay green after P1.4.
- **`--no-db`:** 0/13, exit 1, as observed here.

## Drift found in the brief (brief cites `wip/pos-p1.3` 5f97add4; verified on cb1a2331, P1.3 final 2385c2aa)

1. `registerScan` is at **register.ts:705**, not :693. Its signature is `registerScan(ctx, actor, {barcode}, client?)`; the 4th parameter is an optional PrismaClient, which the K checks do not use.
2. The brief says `registerScan` is "built on `catalog.byBarcode → {items}`". **It is not.** It runs its own SQL (`regVisibleWhere` plus an InvItem barcode `EXISTS`, ordered by name and id, `LIMIT 500`). `catalog.byBarcode` (catalog.ts:1043) is a separate reader that the register does not call. This does not affect the oracle, which tests `registerScan`.
3. `addFromSearchEnter` is at **RegisterScreen.tsx:486** (brief: 467). `onHold = soon` is at :448 (brief: 429). The B2.2 guards described by the brief are present: functional cart updates, the `billGen` check, `none` → toast, and `choose` → candidates in the grid + toast (`setProducts(r.products)` at :514).
4. There are **two** camera buttons, and both are `onCamera={soon}`: the mobile one in RegisterTopContext (RS:916) and the one in SearchRow (RS:937). C2 requires that neither is `soon`.
5. There is no barcode library in `package.json` and no `BarcodeDetector` anywhere in `src`. This matches the brief.
6. **Interaction with P1.3's oracle.** `qc-pos-p1.3` S5.20 ("s1Gen") reads `fnBody(RS, "addFromSearchEnter")` plus 400 chars after the **first** `registerScanAction({` and requires `gen !== billGen.current` there. S5.9 requires the first `pos-reg-scan-camera` tag to carry a ≥44px class. S5.21 allows key rotation only inside `resetBill`. The P1.4 builder must keep all three true, for example by keeping the billGen guard at the first `registerScanAction({` call site.

## Names I had to invent (controller must ratify)

| name | where | note |
|---|---|---|
| `scan-shared.ts` | `src/lib/modules/pos/` | Pure, client-importable; sits next to `register-shared.ts` / `pricing-shared.ts`. |
| `classifyScanBurst(keys, ctx?)` | scan-shared | Plus the types `ScanKey {key, at, isComposing?}`, `ScanBurstContext {dialogOpen?, target?: "search"\|"body"\|"input"}` and `ScanBurstResult {kind:"scan",code}\|{kind:"type"}\|{kind:"ignore",reason:"ime"\|"dialog"\|"input"}`. |
| `SCAN_MAX_GAP_MS = 30`, `SCAN_MIN_LENGTH = 4` | scan-shared | Values from B1. |
| `scanOutcome(result, {canOverridePrice})` | scan-shared | Returns `{action:"add",product}\|{action:"choose",products}\|{action:"none",offerCustom}\|{action:"error",code}`. |
| `SCAN_CAMERA_FORMATS` | scan-shared | BarcodeDetector format strings. |
| `SCAN_CAMERA_FALLBACK_PKG: string \| null` | scan-shared | The builder sets it from O22; the oracle compares it to `O22_ANSWER`. |
| `cartAddProduct(cart, productId, newLineKey)` | register-shared | A pure extraction of today's `addProduct` updater (RS:462–469). It is the "pure cart reducer" for +1. |
| `onScannedCode(code)` | RegisterScreen | The single scanner route. |
| `pos-reg-scan-chooser`, `pos-reg-scan-choice-<productId>`, `pos-reg-scan-sheet` | UI testids | Chooser dialog, its rows (≥44px), and the camera sheet. They also need `scripts/pos-ui-inventory.json` rows (P1.3 S5.5 style) if the controller wants them inventoried. |
| `pos.register.scan.{chooseTitle, notFound, addAsCustom, ignoredWhileDialog, cameraTitle, cameraDenied, cameraNone}` | messages th+en | `search.chooseOne` and `search.noResult` already exist; the builder may delete them once they are unused. |
| `O22_ANSWER` | oracle constant | Default `"yes"`. If the owner answers no, change it with a one-line ORACLE-EDIT. |
| `--no-db` | oracle flag | Runs the 13 pure/static checks without env or prisma. |

## Controller browser checks (not automatable headless)

1. **Camera on Chrome/Android** (native BarcodeDetector): the permission prompt appears, a read adds the product, the sheet closes after one read, and continuous mode is off by default.
2. **Camera on iPhone Safari** (fallback, only if O22 = yes): the library chunk loads only when the sheet opens (Network tab), and an EAN-13, EAN-8, UPC-A, Code128 and QR all read.
3. **Camera failure cases:**
   - Permission denied shows `scan.cameraDenied` in Thai.
   - No camera shows `scan.cameraNone`.
   - If O22 = no, the button is hidden on a browser without BarcodeDetector.
4. **Real wedge scanner:**
   - With focus in search, on the grid background and on the cart: one scan adds once, never twice. Watch for both the input's Enter handler and the window listener firing.
   - A repeat scan increments qty.
   - Scanning while the pay dialog is open does nothing and shows the toast.
5. **Thai IME typing** in the search box is never classified as a scan.

## Questions for the controller / owner

1. **O22 vs. lane rules.** O22 = yes needs a new dependency, but `pos-brief-LANE-RULES` §3 forbids `pnpm install/add` because node_modules is shared with the CRM lanes, and §6 lists `package.json` as a hot file. C1 checks that `package.json` declares the package; it cannot check that node_modules has it. A dynamic `import("@zxing/browser")` of a package that is not installed breaks typecheck and build. Should the dependency wait for the CRM RUN to end (C1/C2 stay red until then), or should the controller install it?
2. **Debounce semantics (B1).** When the search box has focus, a wedge scanner's characters land in the input, so `onChange → setQ` fires the 200 ms catalog debounce mid-burst. The classifier only knows the input is a scan at the terminator. The oracle enforces only that the scan *route* bypasses `setQ`/debounce (S1). Should the builder also suppress or cancel the catalog load caused by a burst (for example by clearing `q` on scan)? I recommend "clear q and drop the in-flight result", checked in the controller's browser.
3. **Double handling.** `SearchRow` `onKeyDown Enter → addFromSearchEnter` and the new window listener can both see the same Enter. The oracle cannot detect a double add statically, so it is listed as a browser check. Is that acceptable, or do you want a ruling that `addFromSearchEnter` must consult `classifyScanBurst`?
4. **Tab as terminator.** Tab is accepted (B1). The listener must `preventDefault` on a scanner Tab so focus does not jump. Not tested statically.
5. **"Same options" in +1.** `RegisterCartLine` has no options field until P1.2, so R1 compares discount and open price only. P1.2 must extend `cartAddProduct` to compare options; that needs an oracle note in P1.2.
6. **K1–K5 are green on base** because P1.3 already ships this server behaviour. Are regression guards enough here, or do you want server work in P1.4 (for example a scan-specific `barcode` normalisation such as stripping a GS1 `]E0` prefix)?

## Commands run here

```
esbuild scripts/qc-pos-p1.4.mts --loader:.mts=ts --log-level=error            # OK
pnpm exec tsx scripts/qc-pos-p1.4.mts --list                                   # 21 ids, exit 0
pnpm exec tsx scripts/qc-pos-p1.4.mts --no-db                                  # 0/13, exit 1 (base)
(scratch copy + reference impl) pnpm exec tsx scripts/qc-pos-p1.4.mts --no-db  # 13/13, exit 0
```

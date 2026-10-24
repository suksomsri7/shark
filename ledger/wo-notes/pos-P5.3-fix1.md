# POS P5.3 fix1 — client barcode index on the register (CD-P53-O14 · W-next-6 "barcode < 100 ms on the register (client) path")

Builder S · 24 Oct 2026 11:18–11:55Z (`date -u`) · tree `/root/projects/shark-pos-b` · branch `wip/pos-p5.3-fix1` from a3959a4e.
Brief: `ledger/pos-briefs/pos-prompt-accountA-P5.3-FIX1-BARCODE-INDEX.md`. `f704c0b7` (named in §6/§7) is this WO's commit before the amend that added this notes file — `src/` blobs identical. No oracle file touched (`scripts/qc-pos-*.mts`, `pos-ui-inventory.json`, `pos-gates.json` unchanged). `ledger/POS-RESUME.md` not written. No build, no server, no QC5.

## 1. What changed (file:line at the commit)
- `src/lib/modules/pos/register-shared.ts:331–348` — block `POS P5.3 fix1 ▸ CD-P53-O14`: `REGISTER_BARCODE_INDEX_MAX = 20_000`, `REGISTER_BARCODE_INDEX_TTL_MS = 15 min`, `RegisterBarcodeIndexItem`, `RegisterBarcodeIndexResult` (`{ok, unchanged: true, version}` | `{ok, unchanged?: false, version, items, truncated, priceValidUntil}` | `RegisterRefusal`). Types/constants only (S5.14 import rule kept).
- `src/lib/modules/pos/register.ts:471–473` (imports) and `:1117–1208` — `registerBarcodeIndex(ctx, actor, { knownVersion? }, client?)`, right after `registerScan`. `regGuard` + `regScope` (same `REG_SELL_PERMS`) + `regVisibleWhere` + `regRowsInOrder` + `regPriceBook` + `regViews` — the private helpers `registerScan` uses, nothing new exported besides the function.
- `src/lib/modules/pos/register-actions.ts:20` (import), `:31` (type), `:199–211` — `registerBarcodeIndexAction(args: Target & { knownVersion? })`, same `session` / `sessionScope` / `unexpected` shape as `registerScanAction`.
- `src/components/pos/register/use-barcode-index.ts` (new, 159 lines) — `useBarcodeIndex({ systemId, unitId, online, load })` → `{ lookup, noteServerOne }`. No server import: the caller passes the fetcher.
- `src/components/pos/register/RegisterScreen.tsx:150–151` (imports), `:692–693` (hook, after the offline layer), `:1691–1697` (client hit in `onScannedCode`), `:1701` (`noteServerOne` after the server scan). The search-Enter path, camera path, `classifyScanBurst`, `SCAN_MAX_GAP_MS` and all `data-testid` are untouched. `onScannedCode` still contains `registerScanAction(` and `billGen.current`, and no `setQ(` / `setTimeout(` / `loadCatalog(` (P1.4-S1 green).

## 2. Index rules (server)
- Rows: products visible at the unit (`regVisibleWhere`) with a barcode on the row **or** on the linked `InvItem` (`LEFT JOIN "InvItem" b ON b.id = p."invItemId" AND b."tenantId" = $t` — the same two sources and the same tenant condition as `registerScan`'s SQL). Order `name, id`.
- Keys a product can be found by: `{p.barcode, b.barcode}`. A key is kept only if `registerScan` could ever match it: non-empty, ≤ 200 chars, equal to its own `trim()`, `regCleanText` (the scan trims the code and rejects the rest, so such stored values are unscannable today).
- A key that maps to **> 1** visible product is excluded (server answers `choose`, or `one` after dropping parents — see §6). A product with `variantCount > 0` (parent with sellable variants) is excluded. Variants with their own barcode are included (server returns the variant as `one`). Weighed-scale labels are not registered barcodes → not in the index by construction; a registered barcode always wins over the scale rule on the server too.
- Products not sellable as cached (sold out / not sold in store / no price) **are** in the index (they are what `registerScan` returns); the screen decides (§3).
- `product` = `regViews` output, batches of `REGISTER_PAGE_MAX` (500), each with its own `regPriceBook` (exactly what `registerScan` does per call). Batches run with at most 2 in flight (`REG_BARCODE_INDEX_PAR`, keeps the pg pool of 10 free for other requests), results assembled in the original order. `priceValidUntil` = earliest `priceBookValidUntil` across batches.
- Cap: more than `REGISTER_BARCODE_INDEX_MAX` single-owner keys, or more than 2 × cap barcoded rows (bounded read, `LIMIT 40001`) ⇒ `{ truncated: true, items: [] }` (the client does not use a truncated index, so no payload is sent).
- `version` = sha256 (base64url, 32 chars) of `["bi1", tenantId, systemId, unitId, unitInv, n, nb, max(PosProduct.updatedAt), max(InvItem.updatedAt), side]` from **one** SQL statement: `n` = visible products, `nb` = visible products with a barcode, the two maxima over the visible products + their InvItems, and `side` = count + latest edit of what `regViews` also reads: `PosProductChannelPrice` (system, unit or all-units), `PosPriceRule` (system, archived included), `PosAvailabilityMark` (unit), `MenuItem` linked to a product, `PosProductOptionGroup`, `MenuOptionGroup`, `RecipeLine` (tenant). Deviation from the brief's literal "count of indexed rows": the exact indexed count needs the exclusion pass, which is the expensive part; `n` + `nb` cover add/remove/archive and the maxima cover edits. Time-based price windows do not change `version`; they are handled by `priceValidUntil` (§3).
- Refusals: same as `registerScan` (`NOT_FOUND` / `PERMISSION_DENIED` from `regScope`); input not `{ knownVersion?: string ≤ 100 | null }` or extra keys = `VALIDATION`.

## 3. Client rules
- Hook keeps `Map<barcode, RegisterProduct>` in a ref per `systemId:unitId` (scope change = clear + refetch; an answer for an old scope is dropped). Memory only (no IndexedDB, no storage).
- Fetch: `setTimeout 0` after mount (after the first catalogue render and after the mount-time actions are already queued — never blocks TTI); every 15 min while online (`knownVersion` sent); `window focus` if older than 60 s; back online if older than 15 min; at `priceValidUntil` (clamped 15 s – 1 h) a full fetch without `knownVersion`; server scan answered `one` (not weighed) for a code the index lacks or whose cached product differs ⇒ one debounced (1.5 s) refetch, at most once per code per version (no loop for codes that are excluded on purpose).
- `lookup(code)` returns a product only when online, an index is loaded, not truncated, the price edge has not passed (else it triggers a full refetch and returns null) and the index is ≤ 30 min old (else refetch + null). Key = `code.trim()` (same as `registerScan`).
- `onScannedCode` order: member card → `frozenRef` → `lookup` → hit used only if `soldOutReason == null && !notSold && (priceSatang !== null || limits.canOverridePrice)` → pay/done-layer guard (same toast as today) → `applyScan({ ok: true, match: "one", product: hit }, code, "scan")` synchronously (no await before the line is pushed; `applyScan` → `pick` → options/weigh/open-price/`addProduct` exactly as for a server `one`). Anything else falls through to the unchanged server path.

## 4. Probe output (throwaway, outside the tree)
### 4a. QC4 `posqc-coffee-tenant` — read only (`/root/pos-runs/p53-fix1/probe.mts`, log `probe-2.log`)
```
probe 2026-10-24T11:41:22.724Z · tenant posqc-coffee-tenant · units posqc-coffee-unit-ari,posqc-coffee-unit-silom
products (non-archived) 7 · with own barcode 0
── unit posqc-coffee-unit-ari: items 1 · truncated false · version 4egN5gGqnmY5KVEw-bOQPlB1vZCiw9ON · priceValidUntil null · 416 ms · payload 680 B (680 B/item)
   compare index ⇄ registerScan: 1/1 deep-equal + byte-equal
   visible-or-not barcodes in DB 1 · not in index 0: {}
   knownVersion round-trip: ✅ {"ok":true,"unchanged":true,"version":"4egN5gGqnmY5KVEw-bOQPlB1vZCiw9ON"} (73 B · 20 ms) · stale knownVersion → full set again ✅
   refusals: knownVersion:5 → VALIDATION · extra key → VALIDATION · STAFF no perms → PERMISSION_DENIED (registerScan same actor → PERMISSION_DENIED) · other system → NOT_FOUND
── unit posqc-coffee-unit-silom: items 1 · truncated false · version 10shJJZ-miC9Lm-c8qQe_zkNjkM_UFt5 · priceValidUntil null · 74 ms · payload 680 B (680 B/item)
   compare index ⇄ registerScan: 1/1 deep-equal + byte-equal
   visible-or-not barcodes in DB 1 · not in index 0: {}
   knownVersion round-trip: ✅ {"ok":true,"unchanged":true,"version":"10shJJZ-miC9Lm-c8qQe_zkNjkM_UFt5"} (73 B · 20 ms) · stale knownVersion → full set again ✅
   refusals: knownVersion:5 → VALIDATION · extra key → VALIDATION · STAFF no perms → PERMISSION_DENIED (registerScan same actor → PERMISSION_DENIED) · other system → NOT_FOUND
QC4 posqc-* shared-barcode groups (sample): []
QC4 posqc-* parents-with-variants having a barcode (sample): []
PROBE ✅
```
The coffee tenant has **one** barcode (the water `InvItem`), and no posqc-* tenant on QC4 has a shared barcode or a parent-with-variants barcode (read-only scan `scan-qc4.mts`: barcoded products coffee 1 · resto 1, shared groups 0, barcoded parents 0). So the ≥ 20 / shared / parent items could not be shown on coffee data → 4b.

### 4b. QC4 temp tenant `posqc-p5x-bi<rand>` — created, checked and deleted in the same run (`probe-fixture.mts`, log `probe-fixture-2.log`)
Writes only inside the temp tenant (Tenant, 2 BusinessUnit, AppSystem POS, 2 AppSystemUnit, PosProduct); cleanup verified (rows left 0).
```
probe-fixture 2026-10-24T11:30:33.527Z · temp tenant posqc-p5x-biccaae396 (QC4)
── unit A: items 28 · truncated false · 177 ms · 14376 B
  ✅ index ⇄ registerScan product deep-equal + byte-equal (28/28, need ≥ 20)
  ✅ index set = 24 leaves + 2 variants + no-price + weighed — got 28
  ✅ barcode shared by two products excluded: "SHARED-1" not in index · registerScan → choose
  ✅ parent with variants excluded: "PARENT-1" not in index · registerScan → choose
  ✅ parent+leaf sharing a code excluded (server picks the leaf): "MIX-1" not in index · registerScan → one
  ✅ stored code with trailing space excluded: "WS-1 " not in index · registerScan → none
  ✅ archived product excluded: "ARCH-1" not in index · registerScan → none
  ✅ other unit's product excluded: "UNITB-1" not in index · registerScan → none
  ✅ unit B index includes UNITB-1 (unit-scoped)
  ✅ variant row carries parentId + variantCount 0
  ✅ knownVersion === version → { unchanged: true } (no items) — {"ok":true,"unchanged":true,"version":"ZjqaLh6dMACHmMziWd4sLqCHDWCbVD5K"}
  ✅ price edit → new version + full set with new price — version ZjqaLh6dMACHmMziWd4sLqCHDWCbVD5K → 2cqjNnYLS0X36RwmQDyqmX8SucSzXhX_
  ✅ barcode edit → new version, old code gone, new code present
  ✅ archive → new version, code gone
── 5,0xx products run 1: items 5027 · full 532 ms · payload 2587741 B (2.47 MiB · 515 B/item) · unchanged 34 ms (true)
── 5,0xx products run 2: items 5027 · full 427 ms · payload 2587741 B (2.47 MiB · 515 B/item) · unchanged 34 ms (true)
── 5,0xx products run 3: items 5027 · full 399 ms · payload 2587741 B (2.47 MiB · 515 B/item) · unchanged 36 ms (true)
  ✅ 5k tenant: sampled 20 barcodes deep-equal registerScan — 20/20
cleanup: temp tenant posqc-p5x-biccaae396 removed (rows left 0)
PROBE-FIXTURE ✅
```
(Before the 2-worker batching, the same 5k run took 639–709 ms — `probe-fixture-1.log`.)

## 5. Payload size
- QC4 coffee tenant: 1 item, **680 B** JSON per unit (full); unchanged answer **73 B**.
- 5,027-product temp tenant (own barcodes, no InvItem/stock/rules): **2,587,741 B ≈ 2.47 MiB** JSON (515 B/item), full fetch 0.40–0.53 s in process on QC4, unchanged 32–36 ms.
- Estimate for the P5.3 perf tenant (5,000 products with sku/stock/price rows): ≈ 550–700 B/item ⇒ **≈ 2.7–3.4 MiB** per full fetch (RSC flight adds a little), once at load and again only when `version` changes (any sale that moves stock changes `InvItem.updatedAt`, so a busy shop pays one full fetch per 15-min tick / focus after a sale; idle periods cost 73 B).

## 6. Test results (verbatim summary lines · logs in `/root/pos-runs/p53-fix1/`)
QC4 suites: `bash scripts/iso.sh bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/<suite>.mts`, ISO_MEM=3G.
| suite | result |
|---|---|
| qc-pos-p1.6 | `===== qc-pos-p1.6 ===== ผ่าน 48/48` |
| qc-pos-p1.4 | `===== qc-pos-p1.4 ===== ผ่าน 21/21` |
| qc-pos-p1.2 | `===== qc-pos-p1.2 ===== ผ่าน 55/55` |
| qc-pos-p3.4 | `===== qc-pos-p3.4 ===== ผ่าน 50/51` — `failed:["P3.4-ST2"]` (see §7) · with `P34_LANE=f704c0b7`: `ผ่าน 51/51` |
| qc-pos-p2.14 | `===== qc-pos-p2.14 ===== ผ่าน 60/60` |
| qc-pos-p5.3 (static gate, no `--base`) | `===== qc-pos-p5.3 ===== ผ่าน 9/9` |
| qc-pos-p4.1 --no-db | `JSON_SUMMARY {"suite":"qc-pos-p4.1","mode":"no-db","total":16,"passed":16,"failed":[]…}` |
| fitness.mts (no env) | `ผ่าน 53/53` · `FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0` (pre-commit fitness also ✅) |
| fitness-pos.mts | `JSON_SUMMARY {"suite":"fitness-pos","total":8,"passed":8,"findings":[]}` |
| typecheck (`env NODE_OPTIONS=--max-old-space-size=8192 ISO_MEM=10500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck`, free 11,190 MB at start) | exit 0 · `tsc --noEmit` no output (11:36:46 → 11:40:52Z) |

Extra (not in the brief's list — suites whose lane pin freezes files this WO must touch):
| suite | result | cause |
|---|---|---|
| qc-hf-fu | 28/29 · `HF-FU-ST1` | register-actions/register-shared/register.ts changed vs LANE_PIN 0bd8324e (§4 frozen) |
| qc-hf-fu2 | 30/31 · `HF-FU2-ST1` | RegisterScreen/register-actions/register-shared/register.ts hunks vs pin (§4) |
| qc-pos-p2.8 | 60/61 · `P2.8-ST6` | register.ts sha ≠ LANE_PIN 4016a352 |
| qc-pos-p2.12 | 32/33 · `P2.12-ST1` | lane-A files touched vs LANE_PIN 4016a352 |
| qc-pos-p3.5 | 54/55 · `P3.5-ST2` | register-actions hunk + register.ts hunk outside CD-B2 · with `P35_LANE_PIN=f704c0b7`: `ผ่าน 55/55` |
| qc-pos-p2.13 | 54/54 | — |
| qc-pos-p3.6 | 52/52 | — |

## 7. Oracle changes needed (controller's — not made here)
The brief requires edits in `register.ts` (owner of `registerScan`), `register-actions.ts`, `register-shared.ts` and `RegisterScreen.tsx`. These files are frozen at lane pins, so after the merge the usual re-pin (CD-RP pattern) is needed, to the merge commit:
- `qc-pos-p3.4` `LANE_REV` (env `P34_LANE`, now 4016a352) — ST2 "register.ts แก้นอกบล็อก". Proven: `P34_LANE=f704c0b7` → 51/51.
- `qc-pos-p3.5` `LANE_PIN` (env `P35_LANE_PIN`, now 4016a352) — ST2. Proven: `P35_LANE_PIN=f704c0b7` → 55/55.
- `qc-pos-p2.8` `LANE_PIN` (literal 4016a352) — ST6; `qc-pos-p2.12` `LANE_PIN` (literal 4016a352) — ST1; `qc-hf-fu` / `qc-hf-fu2` `LANE_PIN` (literal 0bd8324e) — ST1. No env override exists, so not proven here; the "actual" text names only the four files of this WO.
Other suites that pin 4016a352 (p2.11, p2.13, p3.6, p3.7, p3.9) do not read these files or passed (p2.13, p3.6 run above).

## 8. Things to know / not done
- **Next.js dispatches server actions one at a time per client** (`node_modules/next/dist/docs/01-app/02-guides/server-actions.md` "Sequential dispatch"). While the full index fetch is in flight (≈ 0.4–0.5 s server time + ≈ 2.5–3.4 MiB transfer/parse at 5k products), any scan that misses the index (and quote/status calls) waits behind it. The B3U harness scans 500 ms after the grid is interactive; the index request is queued after the register's mount-time actions, so the **first** perf scan may still land before the index arrives and take the server path behind it (p95 of 20 tolerates one slow sample, not two). If smoke shows that, two options for the controller (not implemented, both outside the ruled text): (a) in `onScannedCode`, when the index is still loading, await it before the server call (never slower than the queued action); (b) serve the index from a Route Handler (`GET`, parallel to actions) instead of a server action.
- Result type adds two fields beyond the brief's literal shape: `unchanged?: false` on the full answer (discriminant) and `priceValidUntil` (promo windows do not change `version`).
- Truncated answers carry `items: []` (the client must not use them anyway).
- A code shared by a parent and one leaf (server answers `one` = the leaf) is excluded — conservative, the server path handles it; the hook refetches once per version for it (cheap unchanged answer).
- No lint run: `eslint` is not installed in this tree (`ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "eslint" not found`).
- Truncation (> 20,000 barcodes) was not exercised with data (would need 20k rows); the path is two early returns.

## fix1b — scan waits for an in-flight index load (CD-P53-O14b · 24 Oct 11:55–12:00Z)
Ruling: implement §8 option (a). Background start unchanged (first fetch still `setTimeout 0` after mount, never blocks TTI).
- `src/components/pos/register/use-barcode-index.ts:25–27` — `BarcodeIndex.loading(): Promise<void> | null`; `:50` `inflightP` ref; `:64–65` each refresh creates a promise that `finally` resolves at `:91–92` (before a queued refresh starts; never rejects — `refresh` catches everything); `:166–171` `loading()` returns that promise only while online, same scope, and **no usable set yet** (`version` null). It returns null once a set exists (including truncated), when idle, offline, or after a failed load (in-flight cleared) ⇒ caller continues at once. No extra timer: the wait lasts exactly as long as the fetch.
- `src/components/pos/register/RegisterScreen.tsx:1693–1707` (`onScannedCode`) — order: member card → `frozenRef` → `gen = billGen.current` → `lookup` → if miss and `loading()` ≠ null: `await` it, then `gen !== billGen.current` ⇒ drop, `frozenRef.current` ⇒ `scan.ignoredWhileDialog` (same checks as the server path), `lookup` again → sellable-hit check → pay/done-layer guard → `applyScan(one)` synchronously; otherwise the unchanged server path (`:1708` `try { … registerScanAction(…) … }`). Body still contains `registerScanAction(` and `billGen.current`; no `setQ(` / `setTimeout(` / `loadCatalog(`.
- Why it is never slower: server actions are dispatched one at a time per client, so a server scan issued during the index load would start only after it anyway (§8).

Test results (logs `/root/pos-runs/p53-fix1/fix1b-*.log`):
| suite | result |
|---|---|
| qc-pos-p1.4 (QC4) | `===== qc-pos-p1.4 ===== ผ่าน 21/21` |
| qc-pos-p1.6 (QC4) | `===== qc-pos-p1.6 ===== ผ่าน 48/48` |
| qc-pos-p5.3 (static, no `--base`) | `===== qc-pos-p5.3 ===== ผ่าน 9/9` |
| qc-pos-p4.1 --no-db | `JSON_SUMMARY {"suite":"qc-pos-p4.1","mode":"no-db","total":16,"passed":16,"failed":[]…}` |
| fitness.mts (no env) | `ผ่าน 53/53` · `FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0` |
| typecheck (exact gates command · 11,109 MB available at start) | exit 0 · `tsc --noEmit` no output (11:58:33 → 11:59:19Z) |
§7 re-pin list unchanged in kind (fix1b touches only `RegisterScreen.tsx` + the new hook; `qc-hf-fu2` / `qc-pos-p2.12` already flag `RegisterScreen.tsx`).

## fix1c — index via GET route + ETag · excluded codes · server time · cache/throttle (CD-P53-O15 · review `pos-P5.3-fix1-review.md` · 24 Oct 12:10–12:30Z)
`eb100cf0` (named below) is this commit before the amend that added this section — `src/` blobs identical.

**Route path:** `GET /api/pos/register/barcode-index` (`src/app/api/pos/register/barcode-index/route.ts`, export `GET`; constant `REGISTER_BARCODE_INDEX_PATH` in `register-shared.ts:360`). **Hook:** `useBarcodeIndex({ systemId, unitId, online, paused })` → `{ lookup, noteServerOne, loading, invalidate }` (`src/components/pos/register/use-barcode-index.ts:57`).

| item | change (file:line) |
|---|---|
| F1 | New route `route.ts:1–69`: session `getAuth` (401 JSON) · suspended tenant 403 · `canAccessUnit` 404 · `evaluate(pos.sale.create)` 403 (same gates as `sessionScope`) → `registerBarcodeIndex`; query `systemId`, `unitId`, `knownVersion`, or `If-None-Match: "<version>"` (`:24–28`); unchanged → **304** + `ETag` (`:67`); full → 200 JSON + `ETag: "<version>"` (`:68`); every answer carries `x-pos-server-now`; `cache-control: private, no-store`. Hook loads with `fetch(PATH?systemId&unitId, { cache: "no-store", credentials: "same-origin", headers: { "if-none-match": "\"<v>\"" } })` (`use-barcode-index.ts:126–131`) — runs in parallel with quote/submit actions. `registerBarcodeIndexAction` removed: `register-actions.ts` is byte-identical to a3959a4e again; its import is removed from RegisterScreen. Pay/done layer: RegisterScreen passes `paused: () => layersRef.current.some(pay|done)` (`RegisterScreen.tsx:692–693`); the hook does not start a fetch while paused, re-checks every 2 s and runs the deferred fetch after the layer closes (`use-barcode-index.ts:95–113`). Version churn: `InvItem` now enters the version only as `md5(p.id:barcode:sku)` over the visible rows, and `MenuItem` only as count + md5 of the ids that are out of stock / closed (`register.ts:1193`, `:1199`), so stock cuts and menu stock counters no longer change `version` (probe: onHand edit → unchanged). The item shape is unchanged (parity with `registerScan`). `stockLeft` inside a set can therefore lag; the client never decides on it (F2). `scripts/pos-authz-matrix.json` regenerated with `pos-authz-matrix-gen.mts --write`: +1 row for the route (the action row was never in the table, so fix1 had left M5 red; now `--check` ✅). |
| F2 | Server returns `excluded: string[]` = codes with > 1 visible owner + codes of parents with variants (`register.ts:1253`, `:1275`; type `register-shared.ts:351–352`). Hook: per-scope `serverOnly` set (`use-barcode-index.ts:78`) = all `excluded` codes + codes whose refetch (or 304) still lacks them; it survives new sets and clears only on scope change. `noteServerOne` returns early for `serverOnly` codes and compares only decision fields via `sameDecision` (`:45–55`: id, soldOutReason, notSold, priceSatang, optionGroupCount, requiredOptionGroupCount, variantCount, kind, soldByWeight — not stockLeft/JSON). |
| F3 | `serverNow` on both result shapes (`register.ts:1211`; type `register-shared.ts:345`, `:355–356`) + header `x-pos-server-now` for 304. Hook keeps `offsetMs = serverNow − Date.now()` (`use-barcode-index.ts:76`, `:134–135`, `:158–159`); the edge check uses server time (`:243`); an edge that is already past by server time is ignored and the normal TTL applies (`:166–168`); edge timer waits `edge − serverNow` (clamped 15 s – 1 h). |
| H1 | `registerBarcodeIndex` computes `version` first, then: in-process cache keyed tenant/system/unit/version, TTL 120 s, max 64, LRU (move-to-end on hit, evict oldest), entry dropped once its `priceValidUntil` passes (`register.ts:1129–1153`); same-key callers share one build promise (`:1215–1226`); per-tenant cap of 2 concurrent builds with a FIFO wait (`regBiTenantSlot`, `:1154–1170`); `opts.allowBuild()` is consulted only when a build is really needed (cache miss and no shared build) → `false` = refusal `BUSY` (`:1218`). Route: `allowBuild` = 1 build per user per unit per 10 s (`route.ts:42–54`) → **429** + `Retry-After: 10` (`:64`). Interpretation: cache hits / 304 are never limited. A plain "one full set per 10 s" would 429 the P5.3 B3U page right after B2's ten reloads by the same user; a cache hit costs no rebuild. The hook retries after `Retry-After` (`use-barcode-index.ts:140–148`). Build body moved unchanged into `regBuildBarcodeIndex` (`register.ts:1231`). |
| F4 | Offline → online transition, or online with no set (first fetch failed), starts a fetch: transition effect (`use-barcode-index.ts:223–230`) and `lookup` with no version (`:236–240`, at most once per 10 s, not while a fetch or a 429 retry is pending). |
| F5 | `alive` ref (`:69`), set false in cleanup (`:210`); completions after cleanup skip state writes, timers and the queued run; all timers cleared in cleanup. |
| F6 | Past edge / older than max age: `refresh` is called only when no fetch is in flight (`:244`, `:248`); focus also skips while in flight. |
| F7 | Quote refusal with `lineIndex` on a product line → `barcodeIndex.invalidate()` (`RegisterScreen.tsx:1124`) → one debounced (1.5 s) version check (`use-barcode-index.ts:280–282`). |
| F8 | Accepted; comment in `onScannedCode` (`RegisterScreen.tsx:1694`): a miss (waiting for the server) followed by a hit can put the hit's line first. Totals/qty are unaffected. |

Probe (module function; the route was checked by typecheck only — invoking it needs a Next request context for `getAuth`/cookies, and no server was started):
- QC4 coffee (read only, `probe-fix1c.log`): both units 1/1 deep-equal + byte-equal · `excluded []` · `serverNow` present · `knownVersion` → `{ok,unchanged,version,serverNow}` 112 B · stale version → full set again · refusals unchanged (VALIDATION ×2, PERMISSION_DENIED, NOT_FOUND) · PROBE ✅.
- QC4 temp tenant `posqc-p5x-bi5dde8309` (created + deleted, rows left 0, `probe-fixture-fix1c.log`):
```
  ✅ index ⇄ registerScan product deep-equal + byte-equal (29/29, need ≥ 20)
  ✅ index set = 24 leaves + 2 variants + no-price + weighed + InvItem barcode — got 29
  ✅ excluded present = shared + parent-with-variants codes — ["MIX-1","SHARED-1","PARENT-1"]
  ✅ serverNow is ISO and close to now — 2026-10-24T12:20:24.429Z
  ✅ cache hit: same set, allowBuild not consulted, serverNow fresh — 21 ms
  ✅ cache miss + allowBuild=false ⇒ refusal BUSY (route maps to 429) — {"ok":false,"code":"BUSY","message":"ขอดัชนีบาร์โค้ดชุดใหม่ถี่เกินไป — ลองใหม่ใน 10 วินาที"}
  ✅ 5 concurrent callers ⇒ 1 build, same items — builds 1
  ✅ stock cut (InvItem.onHand) ⇒ unchanged
  ✅ InvItem barcode edit ⇒ new version, INVBC-2 indexed
  ✅ InvItem-barcode row deep-equal registerScan
  ✅ barcode shared by two products excluded: "SHARED-1" not in index · registerScan → choose
  ✅ parent with variants excluded: "PARENT-1" not in index · registerScan → choose
  ✅ parent+leaf sharing a code excluded (server picks the leaf): "MIX-1" not in index · registerScan → one
  ✅ stored code with trailing space excluded: "WS-1 " not in index · registerScan → none
  ✅ archived product excluded: "ARCH-1" not in index · registerScan → none
  ✅ other unit's product excluded: "UNITB-1" not in index · registerScan → none
  ✅ unit B index includes UNITB-1 (unit-scoped)
  ✅ variant row carries parentId + variantCount 0
  ✅ knownVersion === version → { unchanged: true } (no items)
  ✅ price edit → new version + full set with new price
  ✅ barcode edit → new version, old code gone, new code present
  ✅ archive → new version, code gone
── 5,0xx products run 1: items 5028 · excluded 3 · full 485 ms · payload 2588350 B (2.47 MiB · 515 B/item) · unchanged 32 ms (true)
── 5,0xx products run 2: items 5028 · excluded 3 · full 403 ms · payload 2588351 B (2.47 MiB · 515 B/item) · unchanged 31 ms (true)
── 5,0xx products run 3 (cache): items 5028 · excluded 3 · full 31 ms · payload 2588351 B (2.47 MiB · 515 B/item) · unchanged 32 ms (true)
  ✅ 5k tenant: sampled 20 barcodes deep-equal registerScan — 20/20
PROBE-FIXTURE ✅
```

Test results (logs `/root/pos-runs/p53-fix1/fix1c-*.log`):
| suite | result |
|---|---|
| qc-pos-p1.4 (QC4) | `===== qc-pos-p1.4 ===== ผ่าน 21/21` |
| qc-pos-p1.6 (QC4) | `===== qc-pos-p1.6 ===== ผ่าน 48/48` |
| qc-pos-p3.4 (QC4) `P34_LANE=f704c0b7` | `===== qc-pos-p3.4 ===== ผ่าน 50/51` — ST2: register.ts has fix1c lines outside the P3.4 block relative to f704c0b7 (expected; the pin predates fix1c) |
| qc-pos-p3.4 (QC4) `P34_LANE=eb100cf0` | `===== qc-pos-p3.4 ===== ผ่าน 51/51` |
| qc-pos-p2.14 (QC4) | `===== qc-pos-p2.14 ===== ผ่าน 60/60` |
| qc-pos-p5.3 (static, no `--base`) | `===== qc-pos-p5.3 ===== ผ่าน 9/9` |
| qc-pos-p4.1 --no-db | `JSON_SUMMARY {"suite":"qc-pos-p4.1","mode":"no-db","total":16,"passed":16,"failed":[]…}` |
| fitness.mts (no env) | `ผ่าน 53/53` · `FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0` |
| fitness-pos.mts | `JSON_SUMMARY {"suite":"fitness-pos","total":8,"passed":8,"findings":[]}` |
| pos-authz-matrix-gen --check | `✅ scripts/pos-authz-matrix.json ตรงกับตัวสร้าง` |
| typecheck (exact gates command · 11,027 MB available) | exit 0 · `tsc --noEmit` no output (12:16:12 → 12:19:24Z) |

Oracle notes for the controller (not changed here):
- Re-pins after merge, to the merge commit: `qc-pos-p3.4` `P34_LANE`, `qc-pos-p3.5` `P35_LANE_PIN`, `qc-pos-p2.8`, `qc-pos-p2.12`, `qc-hf-fu`, `qc-hf-fu2` (§7). `register-actions.ts` is back to base, so it no longer appears in their findings.
- New matrix row `src/app/api/pos/register/barcode-index/route.ts#GET` was inferred with `CASHIER/STAFF_NOPERM/OTHER_UNIT = "?"`, `perm []`, `tenantScope "?"` (api rows allow `?` under M4). An `OVERRIDES` entry in `scripts/pos-authz-matrix-gen.mts` like the `/api/pos/sync/snapshot` one (CASHIER allow · STAFF_NOPERM deny · OTHER_UNIT deny · OTHER_TENANT deny · ANON deny · perm `pos.sale.create` · unitScoped · tenantScope "session (getAuth)") would make it exact. That is generator/oracle text, so I left it for you.

## fix1d — hit keeps fresher stock · version menu term · cache memory budget · invalidate scope (CD-P53-O16 · delta review fix1c · 24 Oct 12:33–12:42Z)
| item | change (file:line) |
|---|---|
| D1 | `RegisterScreen.tsx:316–321` `mergeKnownStock(hit, prev)` and `:1722–1725` in `onScannedCode` (before the sellable check): when `known` already has the product (grid load or a server scan, read live), the hit takes `stockLeft`, `trackStock`, `trackStockMode` and the stock-derived sold-out state (`NO_STOCK` ↔ `null`, `soldOut` recomputed) from that entry. `UNAVAILABLE` (86/closed) stays the index's, because 86 marks, product edits and menu availability move `version`. With no entry, the cached fields are used as they are. The sellable check runs on the merged product, so `known` saying `NO_STOCK` sends that scan to the server path. `pick` then stores the merged product, so a hit never overwrites fresher stock in `known` (cart-line stock :1361–1362 and the over-stock warning :1390 read it). Confirmed: a product cached as sold-out/no-stock is in the map, so it never enters `serverOnly` (only `excluded` codes and codes absent after a refetch/304 do, `use-barcode-index.ts:78`, `:150`, `:171`). It just takes the server path on that scan. If the server then answers with different decision fields, one debounced version check runs per set (`staleTried`). |
| D2 | `register.ts:1216` — the MenuItem term hashes `mi.id:posProductId` of the out-of-stock/closed items (relinking a sold-out menu item to another product changes `version`). |
| D3 | `register.ts:1133–1143` + `:1159–1170` — entries carry `bytes` (UTF-8 JSON length). A set over 4 MiB is not cached (callers still share the build promise). Total budget is 64 MiB across entries (evict LRU until it fits, max 64 entries). Expired entries (TTL 120 s or price edge passed) are swept on every insert. `regBiCacheDrop` keeps the byte counter exact. |
| D5 | `RegisterScreen.tsx:314–315` `INDEX_STALE_CODES` = PRODUCT_NOT_FOUND · PRODUCT_UNAVAILABLE · VARIANT_REQUIRED · OPTIONS_REQUIRED · OPTIONS_INVALID · PRICE_NOT_SET · CHANNEL_NOT_SOLD · WEIGHT_REQUIRED (quote line errors, `register.ts` quote line loop: PRODUCT_NOT_FOUND/UNAVAILABLE/VARIANT_REQUIRED, `regResolveOptions` codes, WEIGHT_REQUIRED, PRICE_NOT_SET, CHANNEL_NOT_SOLD). `:703–704` `indexInvalidated` set + `:1135–1140`: `invalidate()` only for a product line refused with one of these codes, once per (line key, code). Residual (b) of the review accepted: a non-required option group linked after a load gives no quote refusal. It is picked up at the next version check (tick/focus/edit). |
| D4 | Controller's (matrix generator OVERRIDES) — not touched. |

Probes after fix1d: QC4 temp tenant `posqc-p5x-bic2adb53c` (`probe-fixture-fix1d.log`): 24/24 checks ✅ (29/29 parity, excluded, serverNow, cache hit 20 ms, BUSY, 1 shared build, stock cut unchanged, exclusions, version round-trips; 5,028 products build 449–562 ms · cache 35 ms · 2.47 MiB), cleanup rows left 0, `PROBE-FIXTURE ✅`. QC4 coffee read-only (`probe-fix1d.log`): both units 1/1 deep-equal + byte-equal, round-trip ✅, `PROBE ✅`. The client-side D1/D5 paths are React-only and were checked by typecheck (no browser run in this lane).

Test results (logs `/root/pos-runs/p53-fix1/fix1d-*.log`):
| suite | result |
|---|---|
| qc-pos-p1.4 (QC4) | `===== qc-pos-p1.4 ===== ผ่าน 21/21` |
| qc-pos-p1.6 (QC4) | `===== qc-pos-p1.6 ===== ผ่าน 48/48` |
| qc-pos-p2.14 (QC4) | `===== qc-pos-p2.14 ===== ผ่าน 60/60` |
| qc-pos-p5.3 (static, no `--base`) | `===== qc-pos-p5.3 ===== ผ่าน 9/9` |
| qc-pos-p4.1 --no-db | `JSON_SUMMARY {"suite":"qc-pos-p4.1","mode":"no-db","total":16,"passed":16,"failed":[]…}` |
| fitness.mts (no env) | `ผ่าน 53/53` · `FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0` |
| fitness-pos.mts | `JSON_SUMMARY {"suite":"fitness-pos","total":8,"passed":8,"findings":[]}` |
| pos-authz-matrix-gen --check | `✅ scripts/pos-authz-matrix.json ตรงกับตัวสร้าง` |
| typecheck (exact gates command · 10,766 MB available) | exit 0 · `tsc --noEmit` no output (12:39:06 → 12:39:50Z) |
Re-pin note unchanged: fix1d touches `register.ts` and `RegisterScreen.tsx` again, so `qc-pos-p3.4` `P34_LANE` (and the other lane pins in §7) must point at the merge commit.

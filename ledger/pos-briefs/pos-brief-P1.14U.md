# POS P1.14 U — stock count from the POS (mobile-first, mockup 05ค) + stock shortcuts page (mockup 16, P1.14 subset)

Controller brief · 7 Oct 2026 · single builder lane (owner order: 1 lane). Server side P1.14 S is accepted in `session/pos` (`src/lib/modules/pos/stock-count.ts`, `stock-count-shared.ts`, oracle `scripts/qc-pos-p1.14.mts` 30/30). This card is UI + thin server actions only. Report in English in `ledger/wo-notes/pos-P1.14U.md`.

## Read first
- `ledger/pos-briefs/pos-brief-COMMON.md`, `pos-brief-LANE-RULES.md`, `pos-spec-P1.3-register-ui.md` (UI conventions: refusals as data, Thai messages, ≥44 px touch targets, testids + `scripts/pos-ui-inventory.json`).
- `ledger/pos-briefs/pos-brief-P1.14.md` §2 R1–R16 + owner answers (Q1: **no PO receiving from the POS** · Q2: no GL posting of variance) and `ledger/wo-notes/pos-P1.14.md`.
- Mockups: `ledger/design-pos/05-mobile.png` panel **ค · ตรวจนับสต็อก** (390×844) and `ledger/design-pos/16-stock-ops.png` (1440). Open the PNGs. The UI must match them, except the parts ruled out below.
- Patterns to copy: `src/lib/modules/pos/shift-actions.ts` (thin "use server" shell: session → scopeOf → module fn → refusal as data, `INTERNAL` on throw) and the P1.9 UI under `src/app/app/sys/[id]/pos/shifts/`; the P1.17 U page for module tabs (`src/lib/modules/pos/tabs.ts` + `childrenFor("POS")` in `src/app/app/layout.tsx` — both lists must match).
- AGENTS.md: this Next.js (16.2) differs from training data — read `node_modules/next/dist/docs/` before touching Next code. Server Actions are serialized per client: never fan out N actions from the browser, one action per screen load.

## Tree
`/root/projects/shark-pos-b`. Must be clean. `git fetch origin session/pos && git checkout -b wip/pos-p1.14u origin/session/pos`. `node_modules` = read-only bind mount of p11 (re-mount if missing: `mount --bind -o ro /root/projects/shark-pos-p11/node_modules /root/projects/shark-pos-b/node_modules`). Never `pnpm install` / `prisma generate`. No schema change, no migration. QC4 only through the wrappers. Other sessions (HR, CRM) share the machine: `/tmp/shark-gate.lock` is held by a stuck CRM unit — check `fuser /tmp/shark-gate.lock`; while it is held, run typecheck as `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck`; DB suites: `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p1.14.mts` (the qc4 lock is separate). Never kill another session's process.

## 1. Server actions (new file `src/lib/modules/pos/stock-count-actions.ts`, "use server", async functions only)
One action per module function, same shape as `shift-actions.ts` (`Target = {systemId, unitId}`; session membership only; `scopeOf` → `NOT_FOUND` when the unit is not accessible; every refusal returned as `{ok:false, code, message}` with the Thai message from `STOCK_COUNT_MESSAGES`; unexpected → `INTERNAL`): `posStockCountOpenAction`, `posStockCountRecordAction`, `posStockCountGetAction`, `posStockCountListAction`, `posStockCountConfirmAction`, `posStockCountCancelAction`, `posStockReceiveAction`, `posStockTransferAction`, `posStockAdjustAction`.
Plus one read for the screens, `posStockMetaAction({systemId, unitId})` → `{ok, inventorySystemId, locations:[{id,name,isDefault}], categories:[{id,name}], can:{count, confirm, receive, transfer, adjust}, openCount: StockCountView|null}` — implement it as an additive read `stockCountMeta(ctx, actor)` in `stock-count.ts` (reads only: unit's inventory via the same `systemForUnit` path, live `InvLocation`s and `InvCategory`s of that inventory, `evaluate` for the five permissions, `listStockCounts({status:"OPEN", limit:1})`). No other change to `stock-count.ts`; nothing in `inventory/service.ts`, `prisma/`, `scripts/qc-*.mts` assertions.
Input validation lives in the module; the action passes through. Idempotency keys are generated client-side per entry/submit (`crypto.randomUUID().replace(/-/g,"")` fits `^[A-Za-z0-9_-]{8,64}$`) and kept in component state until the result arrives (retry re-sends the same key).

## 2. Route + navigation
- New page `src/app/app/sys/[id]/pos/stock/page.tsx` (+ client components in the same folder). `?tab=count|receive|transfer|adjust|history` selects the sub-tab (default `count` under `md`, `receive` at `md+` — mockup 16 opens on receive).
- Module tab **"สต็อก"** after "สินค้า/บริการ" in `posTabs` AND `childrenFor("POS")` (keep both lists identical). On the register top strip the existing "สินค้า" tab stays; add a small link button "สต็อก / ตรวจนับ" in the products page header (`/pos/products`) to `/pos/stock`.
- Page header like mockup 16: title "สต็อก", subtitle "คลังเดียวกับระบบคลังสินค้า — ทำที่นี่หรือที่ระบบคลังก็ได้ ตัวเลขตรงกันทันที", location select "คลัง: <name>" (default location preselected), button "เปิดในระบบคลังสินค้า" linking to the inventory system home (`/app/sys/<inventorySystemId>`). Sub-tab strip: ตรวจนับ · รับของเข้า · โอน · ปรับสต็อก · ประวัติ (badge on ตรวจนับ when an OPEN count exists).
- No `pos.stock.count` (and none of the movement permissions) → the page renders the refusal card (data, Thai message) with 200 status; never a thrown error.

## 3. ตรวจนับ (mockup 05ค — mobile-first, also usable at 1024/1440 as a centred `max-w-2xl` column)
**No OPEN count:** card "เริ่มตรวจนับ": scope radio ทั้งหมด / เลือกหมวด (multi-select of categories, 1–50), location select, toggle "นับแบบไม่เห็นยอดระบบ (blind)", note (≤200), button "เริ่มนับ" → `open`. `COUNT_ALREADY_OPEN` → load that count (use `countId` from the refusal).
**OPEN count** (05ค):
- Header row: back chevron (to `/pos/stock`), title "ตรวจนับ #<countNo>", pill "นับแล้ว <counted>/<total>". Sub-line "<scope: ทั้งหมด | ชื่อหมวด…> · <location name> · เริ่ม HH:MM โดย <opener name>" (opener name from the view's `openedByUserId` — resolve via the meta read or show the id's user name if the module exposes it; if not available show "เริ่ม HH:MM"). Progress bar = counted/total.
- Scan/search field "สแกนหรือค้นหา" with camera button (reuse the register's camera scanner component if one exists; otherwise the field accepts a scanner's keyboard input: Enter → `record` with `{code, mode:"ADD"}`; a scale label sends grams automatically per R5). Typed search filters the loaded lines by name/sku/barcode client-side.
- Filter chips: ทั้งหมด N · ยังไม่นับ N · มีผลต่าง N (the third chip and every "ระบบ N" / variance figure are hidden when the summary says `withVariance === null`, i.e. blind for this actor).
- Rows exactly like 05ค: name (bold), "sku · <unit label>" or "sku · ยังไม่นับ" in muted; right side "ระบบ <expected>" muted, the qty box (44 px, blue border when focused), then variance: "−1" red / "+2" ink / "✓" when 0 / nothing when uncounted. Uncounted rows show a "นับ" outline button in the box. Weighed items show grams ("1,250 g").
- Entering a quantity = `record` with `{itemId, qty, mode:"SET"}` on blur/Enter; a scan = `ADD`. Each record uses a fresh idempotency key; the returned line replaces the row; refusals appear under the row in red and the box keeps the typed value. `duplicated:true` is treated as success.
- Footer note "ยอดขายระหว่างนับจะถูกบวกกลับให้อัตโนมัติ". Sticky bottom bar: "พักไว้ก่อน" (just navigates back; the count stays OPEN) and "ยืนยันผลต่าง <withVariance> รายการ" (black). Confirm opens a dialog: summary (counted/total, with variance, net variance qty, value when `varianceValueSatang` comes back), radio for uncounted lines "ข้าม (คงยอดเดิม)" = SKIP (default) / "นับเป็น 0" = ZERO, button "ยืนยัน". Without `can.confirm` the bar shows "ส่งให้ผู้จัดการยืนยัน" disabled + message "ต้องมีสิทธิ์ปรับสต็อก (inventory.movement.adjust) จึงยืนยันได้". After confirm: result screen "ยืนยันแล้ว · ปรับ <adjustedLines> รายการ · มูลค่าผลต่าง ฿x" with "เริ่มนับใหม่" / "กลับ".
- Menu (⋯) → "ยกเลิกการนับ" with reason (1–200) → `cancel`. Shown for the opener or `can.confirm`.
- Live refresh: reload the count (one `get` action) after each record result and when the tab regains visibility. No polling loop.

## 4. Shortcuts (mockup 16 — P1.14 subset)
Layout at 1440 like mockup 16: main column + right column. Rulings that change the mockup:
- **รับของเข้า = free receive only** (owner Q1). No supplier select, no PO box, no "บันทึกเป็นบิลซื้อในระบบบัญชี", no invoice image, no "ใบสั่งซื้อที่รอรับ" list. Instead: scan/search item → row (name, qty box, cost/unit optional ฿, lot code optional, expiry optional, note) — several rows may be queued client-side, each submitted as its own `receive` on "รับเข้าคลัง" (sequential awaits, per-row result/refusal). Muted line under the card: "รับตามใบสั่งซื้อทำที่ระบบคลังสินค้า →" linking to the inventory system.
- **โอน** = single-step transfer between two locations of this unit's inventory (`posTransferStock`): from (default preselected) → to, item rows with qty, "โอน" button. Title "โอนระหว่างคลัง/ตำแหน่ง" (not "ระหว่างสาขา"); no "รอรับที่ปลายทาง" pill (two-phase transfer is P2.12). If the inventory has only one location, the card says so and is disabled.
- **ปรับสต็อก**: item, current qty (from the item lookup result if available — otherwise omit), delta input with +/− (≠0), reason select (ของเสีย/หมดอายุ · แตก/เสียหาย · นับผิด · ใช้ภายใน · อื่น ๆ) + free text (the stored `reason` = "<label> · <text>", ≤200), location select, "บันทึกการปรับ". No "ผลต่างลงบัญชี" line (owner Q2); show "ไม่ลงบัญชีอัตโนมัติ" muted instead.
- **ประวัติล่าสุด** (right column): the unit's counts from `list` (status, countNo, date, "ผลต่าง n รายการ" when CONFIRMED) + the movements made in this session (kept in component state with their movement ids). A server-wide movement history needs an inventory read that this card does not add — if `inventory/service.ts` already exports a scoped list-movements read usable with the POS membership, use it (read-only); otherwise show the two lists above and log the follow-up. "ดูทั้งหมด" links to the inventory system.
- Every item picker: scan field + search (reuse the register catalog search action if it fits; otherwise a small `posStockItemSearchAction` in the new actions file that reads live `InvItem`s of the unit's inventory by name/sku/barcode, limit 20, same permission gate as the page). `NOT_STOCKED` / `UNKNOWN_CODE` shown inline.

## 5. Keys, testids, visual
- All strings in `src/messages/{th,en}/pos.json` under `pos.stock.*` (en has no Thai). Refusal messages come from `STOCK_COUNT_MESSAGES[code][locale]`.
- Testids `pos-stock-*` for every control (tabs, scan field, chips, qty boxes `pos-stock-qty-<itemId>`, confirm, cancel, receive/transfer/adjust submit) + rows in `scripts/pos-ui-inventory.json` (fitness-pos F15.3a).
- `scripts/visual-pos.mts` / `scripts/pos-qc-env.mts`: add page `stock` (`PAGE_EXPECT.stock = {owner:200, cashier:200}` — the QC cashier has no `pos.stock.count`, so cashier shows the refusal card) and a `--states` set for the stock page: `stock-count-open` (open an ALL count on the default location, record 2 lines (one SET, one scan ADD), screenshot the 05ค screen at 390/1024/1440), `stock-count-confirm` (the confirm dialog), `stock-receive` (receive card with 2 queued rows), `stock-adjust`. Cleanup in `finally`: cancel the count (reason "visual-pos"), nothing else written (do not submit receive/adjust in the visual run). Dry-run (`--dry`) must list the plan; the controller runs the real shots.
- Thai dates/times use the existing POS helpers; money via `@/lib/ui/money`.

## 6. Gates (all on the final head)
- typecheck exit 0 (pos-gate lock as above) · `pnpm fitness` with and without DB env 41/41 · `scripts/fitness-pos.mts` 8/8.
- `qc-pos-p1.14` 30/30 forced ×2 + unforced, no residue (server unchanged except the additive read).
- `qc-pos-p1.3`, `qc-pos-p1.2`, `qc-pos-p1.6`, `qc-pos-p1.9`, `qc-pos-p1.17`, `qc-hf-pos-page-authz` forced once each (navigation/register must not regress; authz suite must cover the new route — add the route to its list if it enumerates pages).
- `qc-pos-inventory` + `qc-inventory` forced once (the shortcuts touch inventory through the accepted functions only).
- `visual-pos.mts --page stock --states --dry` owner + cashier rc 0.
Notes file: screens built, keys added, deviations from mockups 05ค/16 with the ruling that allows each, open questions. Push `wip/pos-p1.14u` only and stop. No deploy. The controller builds on p11, shoots 1440/1024/390 + EN, sends a reviewer.

## Hard rules
Explicit-path commits; never `git add -A`; never commit `scripts/*-expected.json`, `scripts/fixtures/**`, `.qc-shots`. Never main, prod, `.env*`. Do not edit `account/service.ts`, `ai/proposals.ts`, `inventory/service.ts`, `prisma/**`, oracle assertions. Refusals are data with Thai messages, never thrown to the user. If a ruling here contradicts the server as built, follow the server and write the conflict in the notes.

Commit trailer:
```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

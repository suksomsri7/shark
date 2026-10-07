# POS P1.2 U — builder U notes (options · variants · weighed · branch wip/pos-p1.2u · from wip/pos-p1.6u ef142ef8, then merged P1.6 U head 4aace797 (Q2 fix) · tree /root/projects/shark-pos-b)

Started 2026-10-07 ~11:40 UTC (account B). Server side of P1.2 is accepted; this WO is UI only (R16 · mockup 01 popover). Uses the builder-S helpers `cartAddProduct(…, choiceIds)`, `cartAddWeighed(…)`, scan result `weighed`, `registerProductOptionsAction`.

## Status
- [x] Options/variant picker · weighed-entry dialog · scale-label scan · cart line options/weight · grid card labels · th+en keys · inventory rows
- [x] `qc-pos-p1.2 --no-db` 12/12 (S1 S2 now green) · p1.4/p1.5/p1.9 `--no-db` unchanged · fitness-pos 8/8 · typecheck 0
- [x] DB suites after the controller fixed the QC4 env (role neondb_owner): all green — table below

## What was built
- `OptionsDialog.tsx` (mockup 01 popover, as a centred dialog / bottom sheet like the other register dialogs — same deviation as the line editor, B2 note): title · base price · ✕ → variant chips (`pos-reg-variant-<id>`, "เลือกแบบ · ต้องเลือก 1") → one block per option group ("ขนาด · ต้องเลือก 1 / ไม่บังคับ / เลือกได้ไม่เกิน N") with chips `pos-reg-option-<choiceId>` (+delta, 86'd = "หมด" and disabled) → line note → qty −/+ → "เพิ่มลงตะกร้า ฿X" (`pos-reg-options-confirm`). All chips/buttons h-11 (≥44 px; mockup 32 px).
  - Loads live data with `registerProductOptionsAction` (R7). `isDefault` choices pre-selected (UI only). maxSelect 1 = replace; maxSelect > 1 = toggle up to the cap (hint `options.pickUpTo`). Confirm refuses with an inline hint until every group has `minSelect` and a variant is chosen (`errors.optionsRequired` / `errors.variantRequired`).
  - Variant = child PosProduct (R6): the dialog returns a `RegisterProduct` built from the parent + the variant's id/name/price/barcode so the cart can show it; options of the parent apply (P6).
  - Price on the button is an estimate (base + Σ delta × qty); the quote is the truth.
- `WeighDialog.tsx`: price per kg · hint to scan the scale label · grams input (1–99,999, integer) with half-up estimate · only for `canOverridePrice` (P4) — others see `errors.needPriceOverride` and must scan.
- `RegisterScreen.tsx`:
  - `pick`: `optionGroupCount > 0 || variantCount > 0` ⇒ OptionsDialog (no more `errors.optionsRequired` toast); `soldByWeight` ⇒ WeighDialog.
  - `addPicked`: weighed product ⇒ WeighDialog with the chosen options; note ⇒ always a new line; else `cartAddProduct(next, id, key, choiceIds)` qty times (+1 merges only the same choice set — R13).
  - `addWeighed` ⇒ `cartAddWeighed` (label or grams), qty 1, never merged.
  - `applyScan`: `one` + `weighed` ⇒ weighed line with `weighedBarcode` (products with option groups open the picker first and keep the label).
  - Instant client total (`priceCart`) is skipped for carts with option/weighed lines (deltas and weight prices are server-only) — the screen shows the last quote until the fresh one arrives; `tryCart` defers to the quote for those carts.
  - Line editor: qty ≠ 1 on a weighed line ⇒ `weigh.qtyOne` message.
  - Cart line sub-line (`pos-reg-line-detail-<key>`): option names (screen locale from the picker, else quote names) + weight ("250 กรัม") or "ป้ายเครื่องชั่ง" until the quote gives grams.
- `ProductCard.tsx`: "N แบบ" label for parents with variants; weighed price shown as "฿X/กก.".

## Keys added (pos.register.*, th + en)
options.{title, required, optional, pickUpTo, confirm, unavailable} · variants.title · weigh.{title, perKg, scanHint, grams, estimate, invalid, add, next, qtyOne} · line.{grams, label} · product.{variants, byWeight}

## Inventory rows added
options-close · options-form · variant-* · option-* · options-note · options-qty-dec · options-qty-inc · options-confirm · weigh-close · weigh-form · weigh-grams · weigh-add

## Commands + exit codes
| command | result |
|---|---|
| `env -u DATABASE_URL -u DIRECT_URL pnpm exec tsx scripts/qc-pos-p1.2.mts --no-db` | 12/12, exit 0 |
| `qc-pos-p1.4 --no-db` · `p1.5 --no-db` · `p1.9 --no-db` | 13/13 · 5/5 · 13/13, exit 0 |
| `env -u DATABASE_URL -u DIRECT_URL pnpm exec tsx scripts/fitness-pos.mts` | 8/8, exit 0 |
| `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck` | exit 0 |

## Open questions
1. Picker is a centred dialog / bottom sheet, not a popover anchored to the card (mockup 01). Same choice as the line editor; switch if parity review insists.
2. `cartAddProduct` (builder S, oracle-tested) merges +1 into a line that has a note when the choice set matches; the picker therefore always makes a new line when the user types a note. A tap on a plain card can still +1 a noted line.
3. Weighed label scanned while the weigh dialog is open is ignored (scanner rule "dialog open ⇒ ignore"); the dialog text tells the cashier to close it and scan.
4. Variant `soldOut` only shows "หมด" on the chip; it stays selectable (NO_STOCK sells under ALLOW_NEGATIVE; BLOCK refuses at submit).

## Gate results — head fc8f2cfb (P1.2 U f969a760 + merge of P1.6 U 4aace797) · 13:15–13:21 UTC
| command | result |
|---|---|
| `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p1.2.mts` ×2 | rc 0 · **55/55** · rc 0 · **55/55** |
| `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p1.2.mts` (unforced) | rc 0 · **55/55** |
| forced `qc-pos-p1.3` · `p1.4` · `p1.5` · `p1.9` · `p1.6` | rc 0 · 128/128 · 21/21 · 21/21 · 53/53 · 48/48 |
| `env -u DATABASE_URL -u DIRECT_URL pnpm exec tsx scripts/fitness-pos.mts` | rc 0 · 8/8 |
| `env -u DATABASE_URL -u DIRECT_URL pnpm fitness` | rc 0 · 41/41 |
| `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm fitness` | rc 0 · 41/41 |
| typecheck on f969a760 (pre-merge) | exit 0 |
| typecheck on fc8f2cfb via `/tmp/shark-gate.lock` | 2 attempts timed out (flock -w 3600) — the CRM lane held the machine lock since ~12:38 UTC |
Residue: a5 drift none in every suite; Z1/Z2 green (p1.2 · p1.4 · p1.5 · p1.6 · p1.9).
Earlier run on f969a760 (11:46 UTC, already the fixed env): p1.2 forced 55/55 · p1.3 forced 128/128 · fitness no-env 41/41 · fitness QC4 41/41.

## Re-run after quota reset (head d6ed0600 = fc8f2cfb + notes · 15:32–15:41 UTC)
- Typecheck per controller order on the POS lock: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck` → **exit 0**. (My earlier waiter on /tmp/shark-gate.lock — my own `iso-1179662` unit in shark-pos-b — was stopped before this; nothing of other lanes touched.)
- forced `qc-pos-p1.2` ×2 → 55/55 · 55/55 · unforced → 55/55 (a5 drift none).
- forced `qc-pos-p1.3` 128/128 · `p1.4` 21/21 · `p1.5` 21/21 · `p1.9` 53/53 · `p1.6` 48/48 — all rc 0.
- `fitness-pos` 8/8 · `pnpm fitness` no env 41/41 · with QC4 env 41/41.

## R2 — controller rulings 1–7 (7 Oct, after c46c34a5)
1. **Popover per mockup 01** (`OptionsDialog.tsx`): md+ and opened from a card ⇒ popover anchored to the tapped card (`ProductCard` passes its rect as `PickAnchor`; `RegisterDialog` gained `bare` = transparent scrim, no centring, same focus trap / tap-outside close). Width 360, radius 18, padding 16, shadow 0 18 44 rgba(10,10,10,.18); placed right of the card (left = card.right − 2, top = card.top − 30), flips to the left when it would overflow, clamped to the viewport (16 px margin), max-height = viewport − 32 with inner scroll, re-placed on resize. Header "name ฿price ×" (16 bold / 13 muted). Group label 11.5 bold muted + "· เลือก 1 / เลือกได้หลายอย่าง / ไม่บังคับ". Chips 13 px, delta 11.5 ("M +10"), selected = ink border + inset + surface-2 + bold. Note field with pencil "หมายเหตุถึงบาร์". Bottom row: stepper − 2 + and black "เพิ่มลงตะกร้า ฿X" (price × qty). The tapped card gets the accent border (`ProductGrid selectedId` → `ProductCard selected`, md+ only). 390 px and scan-opened pickers = the old bottom sheet / centred dialog. Deviation kept: chips/stepper/button are 44 px high (mockup 32/40) — the ≥44 px rule and qc-pos-p1.2 S2 require it.
2. **Merge key = product (+variant) + options + note** — `cartAddProduct(cart, id, key, options?, note?)`: merges only into a line with the same choice set **and** the same note (blank ≡ none); a plain card tap/scan never +1s a line that has a note or options. New lines keep the note. p1.4 R1/R3 and p1.2 C1 (oracle-tested behaviour of this helper) stay green; no assertion touched.
3. Weighed label scanned while the weigh dialog is open — ignored with the existing "ปิดกล่องก่อน" toast (accepted).
4. **Sold-out variant chip**: disabled + greyed, unless the unit allows negative stock (`BusinessUnit.settings.pos.stock.oversellPolicy` ≠ BLOCK, read on the page with the existing `unitOversellPolicy` and passed as `oversellBlock`). The "หมด" tag shows either way. Note: `RegisterVariant` has only `soldOut` (no reason), so under ALLOW_NEGATIVE an UNAVAILABLE variant would be selectable and then refused by the quote (`errors.productUnavailable`) — a `soldOutReason` on the variant is a server follow-up.
5. **Follow-up (server, not this card):** held carts drop line notes (`registerCanonicalCart` does not keep `note`); recalling a held bill loses them.
6. **visual-pos.mts states** `options-popover` (desktop/ipad/mobile) and `weigh` (desktop/mobile): temporary fixtures `posqc-vis-<pid>-*` — parent "ลาเต้ตัวเลือก QC" ฿75 with 2 variants (ร้อน/เย็น, inherit price) + 4 option groups as mockup 01 (ขนาด S/M+10/L+20 · นม ปกติ/นมโอ๊ต+15/นมอัลมอนด์+15 · ความหวาน · ท็อปปิ้ง max 2) + weighed product ฿350/กก.; groups/choices/links deleted in finally/signal (and stale > 1 h swept). Steps: search → tap card → variant → M → นมโอ๊ต → qty + (=2) · weigh: search → tap → dialog (owner types 250 g). Only `--dry` run (46 shots planned, both users).
7. **Shift (P1.9) in visual-pos.mts**: before every state, if `pos-reg-shift-required` is still visible 5 s after load ⇒ open a shift through the real UI (`pos-reg-shift-open-link` → `/pos/shifts` → `pos-shift-open-float` 1000 → `pos-shift-open-submit` → `pos-shift-current` → back to the register; must show no banner). Once per run (same browser ⇒ same deviceId). `finally` closes it with the service `closeShift` as the QC owner, counted = `computeReport().expectedCashSatang` (over/short 0, no reason); the result is written to `summary-<user>.json` / JSON_SUMMARY as `shiftClose` and never throws. `required.register` is not touched. Existing shift-page testids were enough (no new rows). Only `--dry` + typecheck possible here.

### R2 gates
| command | result |
|---|---|
| forced `qc-pos-p1.2` ×2 · unforced | 55/55 · 55/55 · 55/55 (rc 0, drift none) |
| forced `qc-pos-p1.6` | 48/48 |
| forced `qc-pos-p1.3` | 1st run 125/128 — S1.9 / S9.1 / S9.2 red only because the controller's visual run fixtures `posqc-vis-1211405-*` were in QC4 during the run (search hit `PQC-VIS-…-OUT`, row counts 14→7 as they were cleaned mid-run). Re-run at 16:2x UTC: **128/128** |
| `qc-pos-p1.2/p1.4/p1.5 --no-db` | 12/12 · 13/13 · 5/5 |
| fitness-pos · `pnpm fitness` no env · QC4 env | 8/8 · 41/41 · 41/41 |
| `visual-pos.mts p1.2u --states --dry` (owner, cashier) | rc 0 · 46 shots each, new states listed |
| `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck` | exit 0 (ran 16:11–16:14 UTC, after the last code edit at 16:06) |

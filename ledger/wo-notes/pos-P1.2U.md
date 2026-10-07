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
Residue: a5 drift none in every suite; Z1/Z2 green (p1.2 · p1.4 · p1.5 · p1.6 · p1.9).
Earlier run on f969a760 (11:46 UTC, already the fixed env): p1.2 forced 55/55 · p1.3 forced 128/128 · fitness no-env 41/41 · fitness QC4 41/41.

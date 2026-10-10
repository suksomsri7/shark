# POS P2.2U — builder U notes (`wip/pos-p2.2u`)

Builder U · account B · 10 Oct 2026 · tree `/root/projects/shark-pos-p11` · branch `wip/pos-p2.2u` from `session/pos` 8226c0a9 (P2.2 S merged).
Contract: `ledger/pos-briefs/pos-prompt-accountB-P2.2U.md` (rulings 1–11) + `pos-brief-P2.2.md` §6/§9 + `ledger/wo-notes/pos-P2.2.md` "P2.2U contract".
Run logs (each with a `tree=… head=…` header): `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p22u/runs/` (`summary.txt`, `final-*.log`, `dry-*.log`, `tc-*.log`).

## Checkpoint (restart from here)
- DONE: steps 1–5 · gates (below) · NEXT: controller review / real screenshots on QC5 (CONTROLLER-RUN) · builder does not merge.
- Commands: typecheck `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck` ·
  suites `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/<suite>.mts` ·
  visual plan `[LOCALE=en] pnpm exec tsx scripts/visual-pos.mts p22u --page products|register|sales --states --user owner|cashier --dry`.

## Steps
| step | commit | what |
|---|---|---|
| 1–2 | 7509f4e2 | `catalog-price-actions.ts` + 06 table/stats/filters/branch picker + drawer (tabs, prices view/edit, rule callouts, footer) + bulk dialog — one commit (the table imports the drawer; typecheck 0 `runs/tc-step12.log`) · pushed |
| merge | ac169b04 | `git merge origin/session/pos` (f71990b6, ledger only) before step 3 |
| ORACLE-EDIT | 2b95374f | `test(pos P2.2U): ORACLE-EDIT P1.18 — happyHourPricing live (Q8)` — `scripts/qc-pos-p1.18.mts:319` + `src/lib/pos-integrations.ts:60` only (count unchanged) |
| 3 | df5edcbf | price-rules page + `PriceRulesClient` + SharkSettings marketing link |
| 4 | bea2617d | register tile chip/struck base · notSold tile · line badges · localQuote guard · priceValidUntil refetch · bills drawer note (typecheck 0 `runs/tc-step34.log`) · pushed |
| 5 | acc403e0 | `visual-pos.mts` p22u states + fixtures |
| notes | 1df8cb72 | this file + addendum in `pos-spec-P1.3-register-ui.md` + hook-deps fix in PriceRulesClient |
| merge | 2fc89cab | `git merge origin/session/pos` 5c7f73f9 (HF-P1CLOSE) before final gates — conflicts kept both: `products/page.tsx` (HF O13 cashier refusal card returns first + P2.2U 06 body; `head(stockLink)` wrapper in the 1600 container) · `visual-pos.mts` (HF StateKey/dry lines + P2.2U union/dry lines) |

## Components
- **Server (ruling 9, only new server file):** `src/lib/modules/pos/catalog-price-actions.ts` ("use server", async only): `setChannelPricesAction({systemId, productId, rows})` → `{ok, productId, rows, changed}` · `bulkChannelMarkupAction({systemId, channelCode, unitId|null, markupBp, roundTo, productIds|categoryId})` → `{ok, written, skipped, productIds}` · refusals `{ok:false, code (CatalogErrorCode|INTERNAL), message}`. Session actor (`actorUserId = auth.user.id`), first gate `assertCan pos.product.setPrice` (role level), row-scope rights stay in `catalog.ts`. No list action — the page reads server-side.
- **06 page** `src/app/app/sys/[id]/pos/products/`: `page.tsx` (P-7 gate line unchanged; old price list + services kept inside a collapsed `<details>` "ราคาขายปกติและบริการ (คลังสินค้า)", opens itself on `?err/?ok`) · `products-data.ts` (server loader: `catalog.listForUnit` per linked unit, paged ≤2000/unit, rows of every unit merged, active SalesChannels per code, categories, rules via `price-rule.listPriceRules`) · `products-scope.ts` (pure: winning row per scope, effective price, "differs", platform line, chips, draft ↔ full row set) · `ProductsClient.tsx` · `ProductPanel.tsx` · `BulkMarkupDialog.tsx`.
- **Rules page** `src/app/app/sys/[id]/pos/products/price-rules/{page.tsx, PriceRulesClient.tsx}`.
- **Shared UI** `src/components/pos/products/price-ui.tsx` (pure: money/% parsing, chip labels, rule window/adjust text, error-key mapping, icons).
- **Register** `ProductCard.tsx` · `CartLine.tsx` · `RegisterScreen.tsx` (pick guard, quote lineIndex, badges, `cartUsesPriceLayer` → localQuote null, `priceValidUntil` timer) · `register/page.tsx` passes `priceValidUntil`.
- **Bills** `BillsClient.tsx` `priceNote(line)`. **Settings 10** `SharkSettings.tsx` (live fact → link).

## Keys (th + en, appended; existing th values unchanged)
- New group `pos.products.*` (title, desc, legacyTitle, rulesLink, search, stat.*, col.*, status.*, chip.*, kind.*, drawer.* …).
- `pos.price.*` additions: `markupPctMinus`, `drawer.*`, `errors.*`, `bulk.{round, roundSatang, pctInvalid, scope*, branchScope, tooMany, needScope, notSoldKept, noChannels, skipRow, running}`, `rule.{open, desc, intro, refusal, readOnly, archivedReadOnly, loading, showArchived, hideArchived, archivedRef, archivedCategory, scopeCategory, productSearch, timeFrom, timeTo, timeHint, dateFrom, dateTo, dateHint, value, baht, priorityHint, exampleNone, errors.*}`.
- `pos.register.product.notSoldStore` · `pos.settings.cards.MARKETING.facts.happyHourPricingLive` (ruling 7 text; the old `happyHourPricing` value is kept for the planned state).
- Toast of the bulk run uses the existing `price.bulk.done` ("ตั้งราคาแล้ว {count} รายการ · ข้าม {skipped} รายการ").

## Testids
Listed in `ledger/pos-briefs/pos-spec-P1.3-register-ui.md` "Addendum P2.2U"; 61 interactive rows (wo `P2.2U`) in `scripts/pos-ui-inventory.json`.

## Deviations from the mockups (ruling per item)
1. 06 header buttons "นำเข้า CSV · หมวดและตัวเลือก · เพิ่มสินค้า", type tabs, status/channel filters, pagination → not built (ruling 1 / Q1 out of scope). Instead the toolbar carries "โปรราคา / Happy hour" and "+X% ทั้งช่องทาง" (rulings 3/4).
2. Stat cards "ใกล้หมด" and "ยังไม่ใส่ต้นทุน", columns ต้นทุน/กำไร → muted "—" with tooltip (P3 / P2.3) (ruling 1: no cost here; low-stock threshold has no owner yet). "หมด" is live (trackStock rows with stock ≤ 0 in the picked scope).
3. Stock columns = one column per branch in scope from `listForUnit().stock` ("ไม่นับสต็อก" when not tracked, "ไม่ขาย" when the product is not listed at that branch) — the 06 "ตามสูตร" cells need recipes (P2.3).
4. Chips: STORE "ร้าน", WEB "เว็บ", presets by initials (LM, Grab, Shopee, fp, LZ, TT), custom = first 6 chars; QR_TABLE and CHAT are not chipped (mockup shows 4 chips) — they appear in the drawer grid.
5. Variant rows are not listed (parent row only, "N แบบ" in the meta line); variants inherit the parent's channel rows (resolver), per-variant rows belong to the ตัวเลือก tab (P2.3).
6. Drawer default tab = ราคาตามช่องทาง (mockup shows ตัวเลือก selected, which is PLANNED here). Weighed products show a note instead of the grid (CD7). Branch-only products show a note when another branch is picked.
7. Callout text = "โปรราคา · <name> <window> <adjust> → ฿x" + state (CD1 label; no "จากระบบการตลาด · แคมเปญ" until P3).
8. Rule date range: the last day is inclusive on screen; sent as `endsAt = <next day>T00:00:00+07:00` (contract wants ISO with offset; the server window is `[startsAt, endsAt)`).
9. Bills note for RULE uses `price.source.RULE` ("โปรราคา") as `{kind}` — the bill detail carries `priceRuleName` but not the rule kind.
10. Register tile chip = rule name (ruling 5) rather than the word "Happy hour".

## Fixtures (visual, step 5)
`ensureP22uFixture` (lazy, before the first P2.2U job): `ensureChannelFixture` (P2.1U LINEMAN/GRAB) · `catalog.setChannelPrices` as owner — ลาเต้ (LINEMAN,*) = base +27% rounded to baht, (GRAB,*) notSold · อเมริกาโน่ (LINEMAN,*) = base +25% · ครัวซองต์ (STORE,*) notSold; before-rows saved and restored whole · `price-rule.savePriceRule` ×3 (ACTIVE PRICE ฿59 on ลาเต้ · UPCOMING −20% from tomorrow · ENDED −฿10 until today 00:00), name prefix `QC ภาพ P2.2U` (leftovers archived first) · bills: `createSale` LINE MAN with fixed key `posqc-vis-p22u-bill-<Bangkok date>` (RULE + CHANNEL lines; not deleted — a real sale of the day like the P2.1U pair) · register-line-badges: `holdRegisterCart` with `channelId` LINEMAN per shot. Cleanup (`cleanupP22u`): after the last P2.2U job, in `finally`, and in the signal handler.
`--dry` rc 0 for products/register/sales × owner/cashier × th/en (`runs/dry-*.log`); real screenshots = CONTROLLER-RUN on QC5.

## Follow-ups
- F1 (from S) held-cart notice for CHANNEL_NOT_SOLD still maps to PRODUCT_UNAVAILABLE (no new notice code — ruling 5).
- F2 the 06 shell (add product, CSV, archive/duplicate, type tabs, status/channel filters, pagination) — controller's owner-pending row.
- F3 per-variant channel prices UI (ตัวเลือก tab, P2.3).
- F4 branch price row (null, unit) is shown through the resolver but has no editor cell (P2.11 copy/compare).
- F5 `scanOutcome` sends a notSold product with null price through `pick` (guarded there); a dedicated scan refusal would need a register-shared change (S file) — not done.
- F6 a full-replace save from 06 drops rows of archived branches (server removes rows not sent) — edge case, P2.11.

## Gate exit codes
Final at code head **2fc89cab** (`runs/summary.txt` second block, logs `runs/final-*.log`); first block = same results at acc403e0 before the HF-P1CLOSE merge.
- typecheck **0** · `pnpm fitness` no env **0 · 41/41** · QC4 env **0 · 41/41** · `scripts/fitness-pos.mts` **0 · 8/8**.
- `qc-pos-p2.1` **0 · 55/55** · `qc-pos-p1.18` (`QC_P118_PHASE=U`) **0 · 81/81** (ST7 = 0, :319 edit in) · `qc-pos-p1.3` **0 · 128/128** · `qc-pos-p1.5` **0 · 21/21** · `qc-pos-p1.9` **0 · 53/53** · `qc-pos-p1.12` **0 · 72/72** · `qc-pos-p1.13` **0 · 33/33** · `qc-pos-p1.16` **0 · 28/28** · `qc-pos-p1.1` **0 · 178/178** · `qc-pos-products` **0 · 24/24** · `qc-hf-pos-page-authz` **0 · 56/56**.
- **Red by contract — ORACLE-EDIT needed (controller):** `qc-pos-p2.2` **1 · 41/42** (both runs) — only **P2.2-ST3**, whose static clause `scripts/qc-pos-p2.2.mts:475` still requires `["happyHourPricing", false, "P2.2"]` (S phase). Ruling 7 flips it to live and authorised the edit of `qc-pos-p1.18.mts:319` only. Proposed edit: `:475` accept `["happyHourPricing", true, null]` (P2.2U, Q8) — count unchanged. Every functional check (B/C/P/Q/S/H/R/Z) green.
- visual `--dry` rc **0** for products/register/sales × owner/cashier × th/LOCALE=en (`runs/dry-*.log`: products 24/8 owner, 3/1 cashier · register 105/37 · 102/36 · sales 30/10 ×2). Real screenshots = CONTROLLER-RUN (QC5).

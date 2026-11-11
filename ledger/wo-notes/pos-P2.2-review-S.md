# P2.2 S review — `wip/pos-p2.2` dad9601d (code head bafb94d7 + ORACLE-EDIT 4ea0ad23 + notes) · tree c read-only

**Verdict: MERGEABLE-AFTER-FIXES.** Two small server fixes (F1, F2); neither changes the oracle count and both keep the 42 green. Everything else is correct to the satang, and the logs back up the builder's gate claims.

## Findings
- **F1 (Medium) Open price gets around `notSold`.** `register.ts:1411–1413`: when `l.openPrice !== null` the resolver is skipped, so a notSold row never refuses the line. Example: matcha has (LINEMAN, all, notSold). A cashier with price override sends `{productId: matcha, openPrice:true, unitPriceSatang:1}` on a LINEMAN cart. The bill is written; it should get `CHANNEL_NOT_SOLD`. Deviation 6 makes this worse. A STORE-notSold tile now has `priceSatang:null` (`register.ts:759–773`), and `RegisterScreen.tsx:1279–1281` handles null as "price not set". Managers are sent to the open-price dialog, so the product sells on STORE anyway. Smallest fix: on the open-price branch, run `priceOf(book,row,code)` as well and refuse when the result is `CHANNEL_NOT_SOLD`. Source stays OPEN otherwise, and Q7 (latte) is unaffected. A clean alternative is a controller ruling that open price may sell notSold items, recorded as deliberate.
- **F2 (Medium) Bulk markup turns "not sold" back on.** `catalog.ts` bulkChannelMarkup (diff +269–283) re-prices an existing (code, unit) row with `notSold:true` and writes `notSold:false`. Example: matcha (LINEMAN, all) notSold, then `bulkChannelMarkup({channelCode:"LINEMAN", unitId:null, markupBp:2700, roundTo:100, productIds:[matcha]})` gives a row of 8 300 (6 500×1.27 = 8 255 → 8 300). Matcha is now sellable on LINE MAN without anyone choosing that. No test covers it (in C6 matcha is outside the category). Smallest fix: `if (prev?.notSold) { skipped++; continue; }`. Put the rule in the P2.2U bulk dialog copy too.
- F3 (Low) `parsePriceRuleInput` dates (`price-shared.ts:430–436`) accept anything `Date.parse` takes. A date-only `"2026-10-10"` becomes 07:00 Bangkok, and locale strings use the server's time zone. Fix: require ISO with `Z` or `±HH:MM`, or add to the P2.2U contract that dates are sent as `…T00:00:00+07:00`.
- F4 (Low) `price-rule.ts:166–167, 177, 196`: the audit is written after the rule commits, outside any transaction. If the audit write throws, the caller gets INTERNAL even though the save worked, and a retried create makes a duplicate rule. Fix: put the create/update and the audit in one `$transaction`, or record it as a follow-up if channel.ts does the same.
- F5 (Info) `timeTo` cannot be 24:00 (`HHMM_RE`). The last possible window ends 23:59, so a "until close at midnight" promo misses one minute. Make U copy say so, or allow `24:00`.

## ORACLE-EDIT
- **C3 18244782: accept.** The diff `b3c3fbf5...wip/pos-p2.2 -- scripts/qc-pos-p2.2.mts` touches C3 only: the title, two `codeIs(...,"NOT_FOUND")` asserts and the chk label. Count is still 42, which matches ruling 1.
- **S8 4ea0ad23 (`qc-pos-p2.1.mts:550`): accept.** It expects exactly `channelId, channelRef` plus the 3 `lines[]` fields, all three must be optional, the old checks are kept, and the count is still 55. `short()` allows 220 characters, so the strings it compares are not truncated. S8 does not check the three fields' types; p2.2 S3 already does. p2.1 = 55/55 at 4ea0ad23 (`runs/final-p21-r2.log`). There is no typecheck log at 4ea0ad23. The edit is trivial, but run typecheck once before merge because `.mts` files go through `next build`.

## Verified OK
1. **Migration** `20261204100000_pos_p22_prices/migration.sql` matches the names table exactly: lock_timeout set/reset, 3 enums, 2 tables (no FK), the CHECK with the 3 conditions word for word, the `NULLS NOT DISTINCT` unique, 2 indexes, and 3 nullable `ADD COLUMN`s. No DROP, UPDATE or backfill. Schema and SQL agree, including `///` "ห้ามลบ / do not remove". `scope.ts` adds two `sys()`. `pos-qc-env` moves the table out of FUTURE. `permissions.ts:149` label is correct.
2. **Resolver** (`price-shared.ts`, imports only pricing-shared and channel-shared; no `Date.now`, `at` is passed in).
   - 16-row matrix, by hand, on LINEMAN at A, base 7 500, rule −10 %, bits br/all/unit/rule:
     m0 = 7 500 BASE · m1 = 7 000 BRANCH · m2–m3 = 9 500 CHANNEL · m4–m7 = 9 000 CHANNEL · m8 = 6 750 · m9 = 6 300 · m10–m11 = 8 550 · m12–m15 = 8 100 (m8+ RULE) · list = 7 500 in every row.
   - Variant order own → parent within each level (`:239–251`), as ruling 3.
   - Math: 7 550×1 500 bp → discount 1 132.5 → 1 133 → 6 417 · 1×50 % → 0 · 3×50 % → 1 (`roundHalfUp` = floor((2n+d)/2d)) · AMOUNT clamped with `max(0,…)` · bulk 115×13 000/1 000 000 = 1.495 → 1 → 100, 7 500 → 9 500.
   - Bangkok window is `[from, to)` on time of day after +7, with weekday taken from the shifted date (17:00Z counts as the next day). Overnight is refused in parse (`:459`) and can never match in the resolver.
   - Tie-break: priority desc → lowest result → oldest `createdAt` → id asc (`:218–235`). This is what brief R4 says. The prompt's "narrower scope / newest" guess is not in the contract.
   - notSold is decided at the winning level and a rule never rescues it (`:275`).
3. **Catalog writers**
   - `setChannelPrices`: whole-set replace in one tx with the product row locked · duplicates, (null, null), bad keys/prices, unknown or archived code, weighed products and variants of weighed parents ⇒ VALIDATION · rights checked on rows added, changed **and removed** (ruling 6) · T2/unknown ⇒ NOT_FOUND · audit in the tx · AccountProduct never touched.
   - Bulk: exact keys, either ≤500 ids or one category, skips products without their own base, checks rights before skipping, upserts only the (code, unit) row, one audit per product, overflow guard.
   - `listForUnit.channelPrices`: only rows for null unit or this unit, 5 keys, channelId mapped.
4. **Price rules**
   - Exact input keys and 18-key DTO · `CHANNEL_CODE_RE` applied · limit counted under an advisory lock, including inactive rules.
   - `pos.price.rule` is required at every unit, or at every linked unit when `unitIds=[]`. For edits it is checked on both the old and the new scope. Archive is checked the same way.
   - T2 gives `PRICE_RULE_NOT_FOUND`. The loader filters on `archivedAt:null` and `active:true` (`price.ts:80–81`), and the resolver checks again with `liveRule`.
5. **Register**
   - One `at` and one price book per `regPrice` (`register.ts:1338`). Code is `channel?.code ?? "STORE"`. The seam comment is kept word for word at `:1408`.
   - Quote lines gain only the 3 additive keys. `REG_QUOTE_KEYS` is input-only and unchanged. Held carts fingerprint `heldUnitPrices` only.
   - Options are added after the rule price. OPEN, CUSTOM and WEIGHED have list = null. Tier, coupon and cap go through `priceCart` on the resolved price.
   - `priceValidUntil` = the next edge after `at` within 24 h. Tile `endsAt` = min(endsAt, today's `timeTo`, midnight).
   - Held-cart `:293` passes `cart.channelId`. H2 was red before the fix (`s2-forced1.log:55`: probe priced at STORE, held [7500,6000,4500]) and green after.
6. **createSale** (`service.ts:93–97, 214–217, 637–640`)
   - Validates the 3 fields only when sent and writes them via the `...l` spread at `:509` · not in `samePayload` · REFUND `lineRows` are listed field by field (`refund.ts:530–551`), so they stay null.
   - Contract diff is exactly the 3 optional fields. Outbox payload is `{saleId}` and unchanged. The API op's `.strict()` zod schema means legacy callers get nulls.
7. **Readers**: `billDetail` adds `priceSource`, `priceRuleName` (looked up by id within this tenant and system) and `listPriceSatang`, with no commission or rate. Receipts (`receipt.ts:314`, `public-receipt.ts:64`) map fields explicitly and are unchanged.
8. **Boundaries**
   - Actions file: async-only exports, `requireTenant`, try/catch + `unstable_rethrow` per action · th/en 0 missing keys (80 new) · "ช่วง Happy hour" acceptable.
   - `MARKETING.happyHourPricing` is still `false, "P2.2"` (`pos-integrations.ts:60`).
9. **Deviations**
   - 1, 3, 4, 5, 9, 10: accept · 2 (a no-op still needs price rights): accept, since nobody without rights gets "ok".
   - 6 (unsold tile has no price but has a list price): accept for S, but it combines with F1, and U has to stop routing it to open price.
   - 7 (open price ignores notSold): reject, see F1.
   - 8 (optional quote and tile type fields): accept. It is a soft hole only: the U builder could read `undefined` as BASE when building a quote locally. The server quote and submit re-price, so no money is wrong. Write into the U contract that `localQuote` returns null when the channel ≠ STORE or any line has a `priceRule`.
10. **Gates** (all log headers show `tree=/root/projects/shark-pos-c`; finals at 3347c88a)
    - p2.2 forced, forced and unforced: 42/42 each, residue 0. Typecheck 0. Fitness 41/41 with and without env. fitness-pos 8/8. Money suites, hf-authz, p1.5, p1.13, p1.15, p1.16, p1.17 and p1.18 at the listed counts.
    - p1.12 run 1: X6 (void racing the queue, points −100 / voucher USED) happened while posqc-coffee was moving +3 sales; run 2 was 72/72.
    - p1.8 run 1: C10 (refund replay doc 62→66) plus Z1/Z2 were count drift from the visual lane; run 2 was 49/49.
    - p1.3 r3 (4ea0ad23): only S9.1 is red (outbox/JE +1). p1.2 r3: only Z1 is red (auditLog +1). Both are residue only.
    - The controller should still re-run p1.12, p1.3 and p1.2 on a quiet QC4 before merging.

## Follow-ups
- **P2.2U**
  - STORE-notSold tile shows "ไม่ขายหน้าร้าน" and never opens the open-price dialog (F1) · dates sent with +07:00 (F3) · `localQuote` null for non-STORE carts or rule-priced lines.
  - Add the catalog actions (notes F2) · bulk dialog says notSold rows are kept · flip `happyHourPricing` with its own ORACLE-EDIT.
- **P2.4/P2.11**
  - Dedicated held-cart notice for `CHANNEL_NOT_SOLD` (today PRODUCT_UNAVAILABLE) · callers pass the 3 snapshot fields from `resolvePrices` · P2.11 branch rows already exist.
- **Owners**: decide whether open price may sell a notSold item (F1), and whether "until midnight" windows are needed (F5).

---
## Controller rulings (account A, 9 Oct 2026 23:2xZ)
F1 → fix (open price must not bypass notSold: `CHANNEL_NOT_SOLD` from `priceOf` on the open-price branch; ORACLE-EDIT allowed: one new assert inside existing Q8, count unchanged). F2 → fix (`bulkChannelMarkup` skips `notSold` rows, counted in `skipped`; ORACLE-EDIT allowed: one assert inside C6, count unchanged). F3 → fix now, smallest: `parsePriceRuleInput` requires ISO with `Z` or `±HH:MM` (VALIDATION otherwise); P2.2U sends `+07:00`. F4 → fix (rule create/update + audit in one `$transaction`); `channel.ts` doing the same = follow-up for P2.12. F5 → info only; U copy says 23:59; "24:00" = owner question in POS-OWNER-PENDING. ORACLE-EDITs C3 + S8 accepted. Deviations 1–6, 8–10 accepted; 7 rejected (F1). Typecheck at the final head required. p1.12/p1.3/p1.2 re-run on a quiet QC4 = controller merge-point gates.

# POS P1.5 — oracle notes (`scripts/qc-pos-p1.5.mts`)

Oracle writer · cloud run · 4 Oct 2026 · base `wip/pos-p1.45-oracle` (session/pos cb1a2331 + the P1.4 oracle commit).

This container has **no DB**. What I verified here:
- esbuild syntax: OK.
- `--list`: 21 ids, exit 0, no DB.
- `--no-db`: the 5 static checks give **0/5, exit 1** on base, each red for the expected reason.
- On a scratchpad copy of the tree with a fake wiring (onHold / onRecallHeld / drawer / 4 actions / keys / constant), the same `--no-db` run gave **5/5**. The regexes can be satisfied, and leftover "soon" UI is caught.
- The 16 DB checks (H1–H13, R1, Z1, Z2) have never run. The first real run is CONTROLLER-RUN on the VPS:

```
bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p1.5.mts              # expect SKIPPED, exit 0
QC_FORCE=1 bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p1.5.mts    # expect 2 green (Z1 Z2) / 19 red, exit 1
pnpm exec tsx scripts/qc-pos-p1.5.mts --no-db                                                                                # 0/5 on base
```

House style is the same as `qc-pos-p1.6` / `qc-pos-p1.4`:
- `CHECKS` registry and `--list`.
- SKIP gate with `QC_FORCE`.
- `ep-frosty-lab` write gate with no bypass.
- `qc-p1.5-<rand>` sandbox (2 units + 1 POS system in the QC coffee tenant; products through `catalog.ts`).
- Cleanup in `finally`.
- Z1 counts (including `posHeldCart`, `approvalRequest` and the receipt-counter sum) and the Z2 fingerprint (including `posHeldCart`).
- `JSON_SUMMARY` and `--no-db`.

**Schema detection.** `PosHeldCart` is detected from the Prisma DMMF and from `information_schema.columns`. Every one of the 14 H1 columns must be present in both, and the skip reason reports client ✓/✗ and DB ✓/✗ per column. Without a `posHeldCart` delegate, every DB helper returns null or NaN, so the checks go red; none crash. Cleanup falls back to raw SQL `DELETE … WHERE "unitId" = $1` when the table exists but the client is not generated.

## Check list (21)

| id | X | what | needs |
|---|---|---|---|
| **H1** | – | Owner holds `[A×2 (฿45) + custom "ค่าห่อของขวัญ" ฿5, bill discount ฿1]` with label `โต๊ะ 5 · พี่แว่น`. Expected row: HELD; tenant, unit and system correct; `heldByUserId` = owner; `lineCount` 2; `approxTotalSatang` 9400 (server quote); label verbatim; `recalledAt` null; `version` is a number. The returned summary matches. | DB |
| **H2** | – | `listHeldCarts` returns the cart with `id label lineCount approxTotalSatang heldByUserId createdAt`, newest first (the older row is back-dated 1 min to force the order), and `count === items.length`. A cashier with access to the unit sees the owner's cart. | DB |
| **H3** | X1 | Recall returns the same cart: lines, qty, custom name/price and bill discount. `quote` is ok with total 9400, `heldCartId` is correct and `notices` is `[]`. The row becomes RECALLED with `recalledAt` and `recalledByUserId`, and leaves the list. A 2nd recall gives `ALREADY_RECALLED`. Discard after recall is refused and the row stays RECALLED. No PosSale is created in the sandbox units and their receipt counters stay 0. | DB |
| **H4** | – | Discard: ok, row DISCARDED, gone from the list. Recall afterwards gives NOT_FOUND; a second discard gives NOT_FOUND. | DB |
| **H5** | X4 | Hold validation. Each of these is refused and no row is created: empty cart; label of 61 chars; numeric label; `couponCode`; unknown key `idempotencyKey`; qty 0; 201 lines; non-existent productId; a string instead of a cart object. A 60-char label is accepted. | DB |
| **H6** | X4 | Prices are not trusted. Holding a catalog line with `unitPriceSatang: 1` is either refused (`VALIDATION`/`PERMISSION_DENIED`) or held at 6000. Then the DB `cartJson` is tampered (every numeric field whose name contains price/satang/total/amount is set to 1, and `approxTotalSatang` to 1). Recall must still give a quote line of 6000 and a total of 6000, and the recalled line must not become `openPrice: true`. | DB |
| **H7** | X4 | Re-price: hold R at ฿50 + U at ฿30, then `setPrice(R, 6000)`, then recall. The quote must give 6000 / 3000, total 9000. `notices` must contain exactly one `PRICE_CHANGED`: `lineIndex 0`, `heldUnitPriceSatang 5000`, `unitPriceSatang 6000`. Line 1 has no notice. | DB |
| **H8** | X4 | Hold X, Y, Z; archive X; set Y unavailable at the unit; recall. Expected: ok, row RECALLED, the cart keeps 3 lines, the notices include `PRODUCT_NOT_FOUND@0` and `PRODUCT_UNAVAILABLE@1`, and the quote is **not** ok (no silent pricing at an old price). | DB |
| **H9** | X6 | 10 PrismaClients race `recallHeldCart` × 3 rounds. Each round must give exactly 1 ok, 9 `ALREADY_RECALLED`, no other code, and a row RECALLED by the owner. | DB |
| **H10** | X2 | Held at unit 1. At unit 2 (same POS), the list does not show it, and recall/discard by id give NOT_FOUND. The row stays HELD. | DB |
| **H11** | X2 | From the QC resto tenant (its real POS and unit, its owner): the list does not show the coffee cart, and recall/discard by the coffee id give NOT_FOUND. The row stays HELD. | DB |
| **H12** | X3 | STAFF without `pos.sale.create` gets PERMISSION_DENIED from all 4 functions, and no row is created or changed. The real cashier (unitAccess = silom only) gets NOT_FOUND at the sandbox unit. A cashier with access to the unit and `pos.sale.create` can **discard** and **recall** a cart the owner held. | DB |
| **H13** | – | Lazy expiry with the default of 2 days: a 1-day-old row is listed. A 3-day-old row is not listed and becomes DISCARDED. Recalling a 3-day-old row before any list gives NOT_FOUND. With `AppSystem(POS).settings.pos.heldCart.expireDays = 5`, a 3-day-old row is listed and stays HELD. | DB |
| **R1** | – | At least 8 sampled refusals (ALREADY_RECALLED, NOT_FOUND ×4, VALIDATION, PERMISSION_DENIED ×2) all have the shape `{ok:false, code, message}` and none were thrown. | DB |
| **S1** | X1 | Static, H5: `onHold` is no longer `soon`. It calls `holdRegisterCartAction` and then `resetBill()`, with reset after the action. It guards `frozen` and an empty cart (`lines.length`), and does not touch `idemKey`/`pendingSubmit`. | static |
| **S2** | X1 | Static, H5: `onRecallHeld` calls `recallHeldCartAction`, then `resetBill()`, then applies the cart (`changeCart`/`setCart`/`updateCart` after the reset). There is no `setIdemKey(` and no `idempotencyKey` reference. | static |
| **S3** | X11 | Static, H6: F8 calls `onHold`. `pos-reg-hold` and `pos-reg-held-bills` have no `onSoon`, no `t("soon")` and no `aria-disabled="true"`. `pos-reg-held-count` and `pos-reg-held-drawer` exist. The row tags `pos-reg-held-recall-`/`pos-reg-held-discard-` carry a ≥44px class. The UI calls `listHeldCartsAction`. | static |
| **S4** | – | The keys `pos.register.held.{title empty recall discard label holdDone noticePriceChanged noticeUnavailable}` and `errors.alreadyRecalled` exist in th and en, with no Thai in en; the `held.*` keys are used in the UI. `refusalMessageKey("ALREADY_RECALLED") === "errors.alreadyRecalled"`. | static |
| **S5** | – | Static: `register-actions.ts` starts with `"use server"`, exports async functions only, and has no `throw`. Each of the 4 actions exists, calls its service function and has a `catch`. `register-shared` exports `HELD_CART_EXPIRE_DAYS = 2`. | static |
| **Z1** | – | Row counts for both QC POS tenants (sale, payment, counter, outbox, audit, product, category, posHeldCart, approvalRequest …) and the receipt-counter sum are equal before and after. | DB |
| **Z2** | – | The fingerprint of pre-existing QC rows, including PosHeldCart, is equal before and after. | DB |

**H5 statics:**
- Hold rotates the bill key: S1 requires `resetBill()` after a successful hold.
- Recall creates a new key: S2 requires `resetBill()` before the recalled cart is applied, with no `setIdemKey` and no `idempotencyKey`.
- Both stay inside P1.3's rule S5.21, which allows key rotation only inside `resetBill`.
- On the server side, H5 rejects a cart carrying `idempotencyKey`, so a held cart can never carry a key that may have reached the server.

## Expected results on the current base

- **Unforced:** `SKIPPED`, exit 0. Reasons:
  - the 4 `held-cart.ts` exports are missing;
  - `onHold = soon`;
  - there is no `posHeldCart` delegate;
  - all 14 `PosHeldCart` columns are missing (client ✗, DB ✗).
- **`QC_FORCE=1`:** 2 green (Z1, Z2) / 19 red, exit 1.
  - H1–H13 and R1 are red with `MISSING:holdRegisterCart` and similar (no module), plus "no row".
  - S1–S5 are red as observed here.
  - The sandbox and products are still created and cleaned, so Z1 and Z2 must be green.
- **`--no-db`:** 0/5, exit 1 (observed).

## Drift found in the brief (brief cites 5f97add4; verified on cb1a2331)

1. `onHold = soon` is at **RegisterScreen.tsx:448** (brief: 429). The F8 handler at :731 already calls `h.onHold()`.
2. The hold and held-bills buttons live in **CartPanel.tsx:79–99**. Both are `onClick={p.onSoon}` with `aria-disabled="true"` and `title={t("soon")}`. The brief says "held-bills button = soon"; the hold button is also soon. There is no count pill yet (spec row 15: "pill HIDE").
3. **The cart shape is `RegisterCart`** (register-shared.ts:219), as the brief says. Its lines carry a client-only `key`, plus `couponCode`, which P1.3 never sends.
   - The oracle stores and returns the server shape, `RegisterQuoteInput` (what `cartToQuoteInput` produces). Recall returns `cart: RegisterQuoteInput`, and the client must rebuild a `RegisterCart` with fresh line keys.
   - No pure helper exists for that rebuild. The oracle does not name one; see question 5.
4. `PosHeldCart` does not exist in `prisma/schema/**`, and `pos-qc-env.mts` lists it in `POS_FUTURE_MODELS`. The builder should move it into `POS_MODELS`, per that file's own rule. No script consumes `POS_FUTURE_MODELS`, so nothing goes red either way.
5. **`docs/modules/14-pos.md` §4 differs from brief H1.** The doc model has `cart Json`, `heldBy`, `deviceId?` and `expiresAt` (midnight unit-tz, cron discard). H1 has `cartJson`, `heldByUserId`, `systemId`, `lineCount`, `approxTotalSatang`, `recalledAt/By`, `version`, and no `expiresAt` (lazy N days). **The oracle follows H1 exactly.**
6. **POS-CONTRACTS:66** says `approval.submitForApproval(… refType:'PosHeldCart' …)`, but `ApprovalRequest` (approval.prisma:51) has `entityType`/`entityId`, not `refType`. Cleanup uses `entityType`. P1.5 itself creates no approvals.
7. The brief says discard needs "the same permission as clearing a bill". In P1.3, clearing a bill (`ClearBillDialog`) has no permission beyond being able to sell (`pos.sale.create`, enforced by `regScope`). The oracle therefore uses `pos.sale.create` for discard (H12). docs §5.5 agrees: `DELETE /held-carts/:id` requires `pos.sale.create`.

## Names I had to invent (controller must ratify)

| name | note |
|---|---|
| `src/lib/modules/pos/held-cart.ts` | Server module, beside register.ts. Not a `"use server"` file. |
| `holdRegisterCart(ctx, actor, {cart, label?}, client?)` | Returns `{ok:true, heldCart: HeldCartSummary}`. |
| `listHeldCarts(ctx, actor, client?)` | Returns `{ok:true, items, count}`, newest first. Lazy expiry happens here. |
| `recallHeldCart(ctx, actor, {id}, client?)` | Returns `{ok:true, heldCartId, cart, quote, notices}`. |
| `discardHeldCart(ctx, actor, {id}, client?)` | Returns `{ok:true}`. |
| `HeldCartSummary` | `{id, label, lineCount, approxTotalSatang, heldByUserId, createdAt}` (Date or ISO string). |
| `HeldCartNotice` | `{lineIndex, code: PRICE_CHANGED\|PRODUCT_NOT_FOUND\|PRODUCT_UNAVAILABLE, heldUnitPriceSatang?, unitPriceSatang?}`. |
| Refusal code `ALREADY_RECALLED` | Added to `RegisterRefusalCode`; `refusalMessageKey` maps it to `errors.alreadyRecalled`. |
| Refusal rules | Recall of DISCARDED or expired = `NOT_FOUND`; recall of RECALLED = `ALREADY_RECALLED`; discard of a non-HELD row = `NOT_FOUND`. |
| `HELD_CART_EXPIRE_DAYS = 2` | Exported from register-shared. |
| `AppSystem(POS).settings.pos.heldCart.expireDays` | Where the expiry is configured; the same object as P1.6 payment settings and the P1.3 `registerV2` flag. |
| `holdRegisterCartAction`, `listHeldCartsAction`, `recallHeldCartAction`, `discardHeldCartAction` | In `register-actions.ts`. |
| `onRecallHeld` | Spec §1.3 already names `onHold`/`onOpenHeld`. |
| Testids `pos-reg-held-count`, `pos-reg-held-drawer`, `pos-reg-held-recall-<id>`, `pos-reg-held-discard-<id>` | Plus `scripts/pos-ui-inventory.json` rows if the controller wants them inventoried. |
| `pos.register.held.{title, empty, recall, discard, label, holdDone, noticePriceChanged, noticeUnavailable}` | Plus `errors.alreadyRecalled`. |
| Recall keeps every line | Bad lines are kept and carry a notice, so the quote is refused (H8). |

## Questions for the controller

1. **Expiry window.** H4 says "N days (default 2)", while docs §7.10 says "expires at midnight unit-tz". The oracle uses rolling N×24 h from `createdAt`. Do you want calendar days in Asia/Bangkok instead? That changes H13's fixture (back-dating by 1 day could cross midnight either way).
2. **Unavailable/archived lines on recall (H8).** The oracle requires the cart to keep all lines, with notices attached and the quote refused, so the cashier sees and removes them. Alternative: drop the bad lines and quote the rest, with notices carrying names. Which one?
3. **Discard permission.** `pos.sale.create` (the same as clearing a bill today) lets any cashier at the unit discard anyone's held cart (H12). Should discarding *another user's* cart need more, for example MANAGER or the P1.15 PIN/approval (C-9 `entityType:'PosHeldCart'`)?
4. **Recall onto a non-empty cart.** docs §7 screen 4 says to ask "hold the current one first or discard". The oracle does not test this; S2 only requires `resetBill()` before applying, which would silently drop the current cart. Do you want a ruling: recall disabled while the cart is non-empty, or a confirm dialog that is checked at visual?
5. **Rebuilding the cart.** Should there be a pure `quoteInputToCart(input, newKey)` in register-shared, testable like P1.4's `cartAddProduct`? I left it unnamed so as not to over-specify; S2 accepts any `changeCart`/`setCart`/`updateCart` after `resetBill`.
6. **Member and coupon on held carts.** P1.3 rejects a client `couponCode` (Q12) and `memberId` goes through `regScope`. The held cart stores whatever `quoteRegisterCart` accepts, so a `memberId` round-trips. The oracle does not test members in held carts. Should it (MEMBER_NOT_FOUND after the member is deleted)?
7. **H6 accepts two outcomes** for a client price on a catalog line at hold time: refuse, or ignore it and hold at the real price. This mirrors P1.3 S3.5. Do you want to pin one?

## Commands run here

```
esbuild scripts/qc-pos-p1.5.mts --loader:.mts=ts --log-level=error   # OK
pnpm exec tsx scripts/qc-pos-p1.5.mts --list                          # 21 ids, exit 0
pnpm exec tsx scripts/qc-pos-p1.5.mts --no-db                         # 0/5, exit 1 (base)
(scratch copy + fake wiring) … --no-db                                # 5/5, exit 0
```

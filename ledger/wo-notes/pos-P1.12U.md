# POS P1.12U — builder notes (01 member chip · 14A member panel · 02 benefit rows · disabled P2 tiles · 02b points cell · visual)

Builder U · VPS account B · 9 Oct 2026 · tree `/root/projects/shark-pos-d` (lane 4) · branch `wip/pos-p1.12u` from `tmp/p112-merge` a2d2848d
(= session/pos f1d8ee4c + P1.12 S 80d86f6b), merged `origin/session/pos` 1bfa0ff9 (P1.12 S fix round 1) at cb494e8b. Contract:
`ledger/pos-briefs/pos-prompt-accountB-P1.12U.md` rulings 1–11 · `ledger/wo-notes/pos-P1.12.md` "P1.12U contract" · controller update 9 Oct (merge 1bfa0ff9, count 67 → 68, F3).
Scratch/logs: `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p112u/` (gate logs in `g/`, each with a `tree=… head=…` header).

## Checkpoint
- Done: steps 1–4 (see commits) · merge 1bfa0ff9 + 6d3e952a · F3 handling · gates (below) all green.
- Next: controller — review + real visual shots (CONTROLLER-RUN, needs a server).
- Commands: typecheck `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck` ·
  suites `bash <scratch>/gates.sh name:force:suite …` · keys `python3 <scratch>/add_keys.py <tree>` · inventory `python3 <scratch>/inv.py <tree> [testid-to-remove…]`.

## Commits
| step | commit | what |
|---|---|---|
| 1 | `01ef0c77` | server hunk ruling 2 (`registerStatus.memberEnabled`) |
| 1 | `9a98d6d3` | **test** ORACLE-EDIT U1 (`qc-pos-p1.12` U1 · `pos-P1.12-oracle.md`) |
| 1 | `19da9e73` | cart `couponCode` + `memberChoices` · server-only totals with member/coupon · `MemberChip` · cart totals rows · keys · inventory |
| 2 | `2dfb7d25` | `MemberPanel` (14A) · `QuickRegisterForm` · SHARK-MC scan routing · icons `cal`/`coin` |
| 3 | `df039548` | `PayBenefits` · disabled P2 tiles · `CouponDialog` real entry · PayDone 02b cell · submit `POINTS_CAPPED`/`MEMBER_RIGHTS_CHANGED` · spec addendum |
| 4 | `dd19ef51` | visual states + point fixture (`scripts/visual-pos.mts`) |
| merge | `cb494e8b` | `origin/session/pos` 1bfa0ff9 — only conflict `pos-P1.12-oracle.md` (both kept: their M12/P9/W3 list + U1; count 68) |
| F3 | `2e50cd35` | points card: trimmed > 0 but < min ⇒ `POINTS_BELOW_MIN` → `errors.pointsBelowMinBill {min}` + choice cleared · trimmed to 0 ⇒ `POINTS_CAPPED {0}` → "ใช้ได้สูงสุด 0 แต้ม" + cleared |

## Server hunks (≤ 20 lines, ruling 2)
`register.ts registerStatus`: `memberEnabled = await systemForUnit(tenantId, unitId, "MEMBER").then(id ⇒ !!id, () ⇒ false)` (+3 incl. comment) ·
`register-shared.ts RegisterStatus.memberEnabled: boolean` (+2). ORACLE-EDIT U1 in its own `test(pos P1.12)` commit: unit A ⇒ true, unit B ⇒ false.
Count 64 → 65 on the pre-fix base; after merging the fix round (67) = **68**.

## Components built (all `"use client"`, import only `register-shared` / `register-member-shared` / `register-actions` / UI libs)
- `src/lib/modules/pos/register-member-shared.ts` (new, pure, no imports): `memberAgo` (relative purchase time → `pos.member.panel.ago.*` th+en, Bangkok days),
  `memberShortName` / `memberInitial` (drop "คุณ"), `digitsOnlyQuery`, `quickPhoneReady`, `maskBirthDateInput` / `parseBirthDateInput` (วว/ดด/ปปปป → YYYY-MM-DD,
  BE year ≥ 2400 −543, real date, ≤ today, ≥ 1900), `pointsRate` (ruling 6 "N แต้ม = ฿1" / "1 แต้ม = ฿x"), `normalizeCouponCode`, `parsePointsInput`, `isMemberCardCode`.
- `register-shared.ts`: `RegisterCart.memberChoices` · `cartToQuoteInput(cart, {choices})` sends `couponCode` always and `memberChoices` only with a member
  (choices exist only while the pay dialog is open — closing it clears them) · `choices:false` for hold / approval / cart comparison · `quoteInputToCart` keeps `couponCode` on recall.
- `RegisterScreen.tsx`: `memberEnabled` from status · `memberInfo` + `benefits` (registerMemberBenefitsAction on attach, on pay-dialog open and on cart change while it is
  open, after MEMBER_RIGHTS_CHANGED / fulfil) · attach / detach (detach clears member + choices, keeps coupon) · `local` and `localQuote` return null with member or coupon,
  `totalsPending` likewise (cart shows "—" until the server quote) · quote effect: POINTS_CAPPED ⇒ auto-correct once to `allowedPoints` (no loop: only when it differs) ·
  other POINTS_* ⇒ note + clear · VOUCHER_* / VOUCHER_COUPON_CONFLICT ⇒ note under the row + clear · coupon flow (wait for the quote of that cart version; no
  COUPON conflict ⇒ dialog closes; conflict ⇒ inline message, cart reverts to the previous code) · submit: `POINTS_CAPPED` ⇒ auto-correct + keep dialog (no error card),
  `MEMBER_RIGHTS_CHANGED` ⇒ banner + re-quote + benefits refresh · PRICE_CHANGED copies the member totals · layers `member`, `camera{forMember}`, `pay{focusPoints}` ·
  SHARK-MC routing: `onScannedCode` (wedge/camera outside the panel), camera from the panel (`forMember` = always member lookup), wedge with the panel on top
  (capture handler re-classifies as body scan and restores the field) · `memberFormKey` = `newKey()` per panel open / after success (S5.21: no randomUUID elsewhere).
- `MemberChip.tsx` (01): empty = `pos-reg-member-pick` "+ เพิ่มสมาชิก" (min-h-12) → 14A · attached = avatar initial · name bold · "Gold · 1,240 แต้ม · ซื้อครั้งที่ 18"
  (no tier ⇒ ทั่วไป · no POINT ⇒ no points part · 0 purchases ⇒ ยังไม่เคยซื้อ) · pill "ใช้แต้ม" (hidden when points null/0; opens pay with the points input focused) ·
  "ถอด" · name/avatar ⇒ 14A attached mode · name only while benefits load (recall ⇒ "…").
- `CartPanel.tsx`: `memberSlot` null ⇒ no member row (P1.3 fallback kept for `undefined`, keeps `pos-reg-member-remove` for S5.4) · rows "คูปอง {code} −฿x" red with ✕
  (invalid ⇒ red message) · "ส่วนลดระดับ {tier}" · voucher / points rows from `memberLines`.
- `MemberPanel.tsx` (14A): drawer shell of HeldBillsDrawer (500 px) · header icon + สมาชิก + ผูกกับบิลนี้ + ✕ · search autofocus, 250 ms debounce, "พบ N รายชื่อ" inside the
  input, "ไม่พบสมาชิก" only for searchable q (digits ≥ 3 / text ≥ 2), Enter attaches a single hit · "สแกน QR สมาชิก" · rows (masked phone · ซื้อล่าสุด … · tier badge
  coloured from `tier.color` via color-mix tint · points right) · suspended rows muted/disabled with "ถูกระงับ" · attached member row = blue left border + tint ·
  attached mode: member card + ถอด, "รางวัลรอรับ" with ส่งมอบ → ส่งมอบแล้ว (kept until close), empty ⇒ ไม่มีรางวัลรอรับ, then "เปลี่ยนสมาชิก" + search/register.
- `QuickRegisterForm.tsx`: phone (prefilled from digit-only search until edited) · name · birthday mask + calendar icon (invalid ⇒ "วันเกิดไม่ถูกต้อง", not sent) ·
  consent (off) · heard chips (WALK_IN default) · submit enabled at 9–10 digits + name · refusal inline via `refusalMessageKey` · placed through alias `QuickRegister` (F15.3 treats *Form as clickable).
- `PayBenefits.tsx` (02, between the breakdown/error cards and the split rows; rendered when `memberEnabled` or a coupon is set): rights-changed banner · points card
  (title, rate, "{ชื่อ} มี **N แต้ม** (= ฿x)", input + suffix, "› ลด ฿x", pill "ใช้ส่วนลด ฿x" / "✓ ใช้แล้ว" + ยกเลิก, Enter = apply without submitting the pay form,
  below-min card muted "ต้องมีอย่างน้อย N แต้ม", notes) · coupon row (−฿x ✓ใช้แล้ว ✕ / red + ลบคูปอง) or dashed "ใส่คูปอง" · vouchers (radio, applicable:false greyed with
  reason, error under row) · tier line · stamp hint "(stamps+count)/slots".
- `InterimPayDialog.tsx`: header chip `pos-member-pay-chip` "{name} · {tier}" · breakdown + coupon/tier/voucher/points (mockup order) · second tile row (4 disabled tiles,
  sub "เร็ว ๆ นี้" / "โรงแรม · เร็ว ๆ นี้" / "ลูกค้าประจำ · เร็ว ๆ นี้") · gift-card line under it · MEMBER_RIGHTS_UNSUPPORTED remove-member branch retired (key kept).
- `CouponDialog.tsx`: real entry (input uppercase/trim, ใช้คูปอง, ลบคูปอง, current code line, inline error, checking state) — from the bill-discount dialog row (P1.3 entry)
  and from the pay dialog "ใส่คูปอง"; walk-in coupons work (no member needed).
- `PayDone.tsx` (02b): cell after เงินทอน "แต้มที่ได้รับ · **{pointsExpected} แต้ม** (รวม {pointsBalanceAfterBurn + pointsExpected})" when `result.member` exists ·
  the number is the **expected** value (quote.pointsToEarn); real `pointEarned` is written after the outbox drains — no polling (title tooltip says so).

## Keys (th + en, `src/messages/{th,en}/pos.json`)
`pos.member.chip.{general,voucherLine,pointsLine,removeCoupon,open}` · `pos.member.panel.{noRewards,attachedToast,detached,searchLabel,searching,close,expires,noExpiry,
attachedTitle,switchTitle,fulfilling,ago.today|days|weeks|months|years}` · `pos.member.register.{registered,birthDatePlaceholder,birthDateInvalid,submitting,phonePlaceholder}` ·
`pos.member.pay.{balance (now with <b>),minPoints,enterCoupon,removeCoupon,couponLine,pointsApplied,cancelPoints,chip,voucherExpires,bdCoupon,bdTier,bdVoucher,bdPoints,
giftCardLine,pointsInput,tiles.*}` · `pos.member.done.{pointsLabel,pointsValue,expectedNote}` · `pos.register.coupon.{apply,remove,checking,hint,current}`. Reused S keys
(`member.chip/panel/register/pay/done.*`, `register.errors.*`, `errors.pointsBelowMinBill` from the fix round). F15.4 green (1,531+ keys both locales).

## Testids + inventory
Inventory rows (`scripts/pos-ui-inventory.json`, wo P1.12U, roles owner+cashier): pos-reg-member-pick (now modal → pos-member-panel), pos-member-chip-open/usepoints/detach,
pos-member-coupon-remove, pos-member-panel-close/detach, pos-member-fulfil-*, pos-member-search, pos-member-scan, pos-member-row-*, pos-member-register(-phone/-name/
-birthdate/-consent/-heard-*/-submit), pos-reg-coupon(-form/-input/-apply/-remove), pos-member-points-input/apply/cancel, pos-member-coupon-clear/enter,
pos-member-voucher-*, pos-reg-paydlg-method-giftcard/deposit/roomcharge/storecredit · removed `pos-reg-paydlg-remove-member` (code retired). 459 rows, F15.3a/b green.
Display ids listed in the spec addendum `ledger/pos-briefs/pos-spec-P1.3-register-ui.md` "Addendum P1.12U".

## Deviations from 01 / 02 / 14A (ruling for each)
1. Phones masked everywhere (14A rows show `089-xxx-5521`), full phone only in the register input — Q3/CD8 (ruling 4).
2. 01 coupon row / 02 coupon row: coffee QC tenant has **no COUPON system**, so no coupon appears in the visual states (ruling 11 "otherwise without and say so").
3. Pay benefit section also renders (coupon row only) when the unit has no MEMBER system but a coupon code is set — the coupon is not a member benefit and must stay removable
   at pay (ruling 8 walk-in coupons); with no coupon and no member system nothing renders (ruling 2).
4. Invalid coupon from the dialog: the cart reverts to the previous code (no invalid code lingers on the bill); the typed code stays editable in the dialog (ruling 8).
5. Stamp hint shows the count after this bill `(stamps+count)/slots` (brief "บิลนี้ได้ 1 ดวง (7/10)" is ambiguous).
6. Pay-dialog choices are cleared when the pay dialog closes (ruling 1 "pay-dialog only"); the cart shows voucher/points rows only while they exist.
7. Totals with a member/coupon show "—" until the server quote arrives (ruling 1 forbids local numbers); consequence: a manager-PIN override discount on a member/coupon
   cart cannot pay (P1.15U `localQuote` override returns null by ruling 1 and the server quote refuses DISCOUNT_EXCEEDS_LIMIT) — follow-up.
8. Disabled tiles carry sub-label "เร็ว ๆ นี้" on all four (room/store-credit "โรงแรม · เร็ว ๆ นี้" / "ลูกค้าประจำ · เร็ว ๆ นี้") — ruling 7.
9. Birthday accepts Buddhist-era years (ปปปป) and converts −543.
10. "ใช้แต้ม" pill opens the pay dialog with the points input focused only when pay is enabled (same guard as the pay button).

## Visual (ruling 11 · `scripts/visual-pos.mts`)
States added to `--page register --states`: member-panel · member-register · member-attached · paydlg-member-points (500 pts, ✓ ใช้แล้ว) · paydlg-member-capped
(1 Americano, 500 pts > 50 % ⇒ auto-corrected to allowedPoints + note; expects 0 < value < 500) · sale-done-member (1440, ⚠️ one real PAID cash sale with the QC member).
Fixture `prepMemberFixture()` in `visual-pos.mts` (before chromium, module functions only): point settings already burn 10 / min 100 / max 50 % on QC4 (set only when
different) · QC member `posqc-coffee` 0899000001 balance was **13** ⇒ `point.credit` to 1,240 with daily key `posqc-p112u-topup-<YYYYMMDD>` (lot created, burnable) ·
nothing deleted; summary `memberState`. Dry plans rc 0 for owner/cashier × th/LOCALE=en. Real shots = **CONTROLLER-RUN**:
`pnpm exec tsx scripts/visual-pos.mts p112u --page register --states --user owner|cashier --base …` (+ `LOCALE=en`).

## Follow-ups
- Manager-PIN override + member/coupon cart (deviation 7): the server quote should accept the armed PIN or the UI needs a server "override quote".
- Member owner (from S): phone index; createMember dup check for legacy dashed phones.
- Coffee QC seed has no COUPON system — add one (seed-pos-qc) if the controller wants coupon visuals.
- `pointsExpected` in 02b is the wallet preview; post-drain `pointEarned` may differ when a bill discount exists (S note).

## Gates (QC4 `ep-frosty-lab-aoylqlv8-pooler…` · POS gate lock · code head 2e50cd35 · logs `scratchpad/p112u/g/`)
- typecheck (iso + `/tmp/pos-gate.lock`, 5632 MB): TC_EXIT=0 at every step (tc-step1/2/3a/4a) and on the merged head + F3 (`g/tc.log`).
- `qc-pos-p1.12` forced #1 **0 · 68/68** · forced #2 **0 · 68/68** · unforced **0 · 68/68** (67 + U1 · residue 0 each, Tenant 0).
- `qc-pos-p1.3` 0 · 128/128 · `qc-pos-p1.5` 0 · 21/21 · `qc-pos-p1.13` 0 · 33/33 · `qc-pos-p1.15` 0 · 39/39 · `qc-pos-p1.16` 0 · 28/28 · `qc-pos-p1.11` 0 · 38/38 ·
  `qc-hf-pos-page-authz` 0 · 56/56.
- `pnpm fitness` without env 0 · 41/41 · with QC4 env 0 · 41/41 · `scripts/fitness-pos.mts` 0 · 8/8 (F15.3a/b · F15.4 green).
- visual `p112u --page register --states --dry` owner th 0 · owner LOCALE=en 0 · cashier th 0 · cashier LOCALE=en 0 (plans include the 6 new states).
- Final merge: `origin/session/pos` 6d3e952a (ledger-only since 1bfa0ff9) — code gates above hold for the merged head.

## Fix round 1 (reviewer F1–F10 + fixture · controller visual V1–V3 · tree p11 · 9 Oct)
Prompt `ledger/pos-briefs/pos-prompt-accountB-P1.12U-fix.md` · review `ledger/wo-notes/pos-P1.12U-review.md` · rulings 1–11 of the original prompt still binding ·
tree `/root/projects/shark-pos-p11` (no install/generate) · merged `origin/session/pos` eecbe591 (start) and 5664aa46 (before final gates, ledger only).
Logs: `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p112u-fix/runs/` (every log starts with `tree=… head=… dirty=…`).

### Commits
| step | commit | what |
|---|---|---|
| 1 | `51deecb7` | server seam: `regParseOverrideAuth` + `regResolveOverrideCap` (①/② out of `regDiscountOver`) + `quoteRegisterCartOverride` + action + type |
| 1 | `c9446939` | **test** ORACLE-EDIT U2 U3 U4 (`qc-pos-p1.12` · `pos-P1.12-oracle.md`) |
| 2 | `e766b764` | UI: F1/F9 wiring · F2 · F3 · F4 · F8 (`RegisterScreen.tsx`) |
| 3 | `0fd2db17` | F5 · F6 · F7 · fixture (top-up key, WELCOME50) · visual V1–V3 |

### The new seam (ruling 1 · F1)
- `register.ts:1473 quoteRegisterCartOverride(ctx, actor, input: RegisterQuoteOverrideInput, client?)` · `register-actions.ts:125 quoteRegisterCartOverrideAction(args: Target & RegisterQuoteOverrideInput)`
  (same `session` + `sessionScope` guards as `quoteRegisterCartAction`; forwards only cart/managerPin/managerUserId/heldCartId/idempotencyKey) ·
  `register-shared.ts:328 RegisterQuoteOverrideInput = { cart: RegisterQuoteInput; managerPin?; managerUserId?; heldCartId?; idempotencyKey? }`.
- Input checks: unknown key / non-record ⇒ VALIDATION · `regParseOverrideAuth` (`register.ts:1609`, moved out of `regParseSubmit`, same texts/order: PIN or manager wrong type ⇒
  VALIDATION, PIN without `managerUserId` ⇒ VALIDATION, `heldCartId` wrong type ⇒ VALIDATION) · `idempotencyKey` = submit key rules (`reg2:` prefix) · malformed device ⇒ VALIDATION.
- Result: the normal quote (`regPrice(db, s, cart)` = `quoteRegisterCart`) unless it is DISCOUNT_EXCEEDS_LIMIT ⇒ returned unchanged (PIN never verified for a cart within the cap).
  On DISCOUNT_EXCEEDS_LIMIT ⇒ `regResolveOverrideCap` (`register.ts:2160`): ① approved held cart of this unit (`approvedDiscountOf(…, key ?? "")`, holder or `pos.sale.manage`,
  cart hash else APPROVAL_MISMATCH, discount ≤ approved) · ② `verifyManagerPin` (same failure counter / lock-out as submit ⇒ PIN_INVALID / PIN_LOCKED / DEVICE_REVOKED; manager cap
  not covering ⇒ DISCOUNT_EXCEEDS_LIMIT) · nothing ⇒ DISCOUNT_EXCEEDS_LIMIT. Priced with that cap ⇒ member choices / coupon / tier applied like any quote.
- **No side effects** (only the PIN failure counter): no hold, no request, no `cancelOpenPosRequest`, no claim, no `pos.discount.override` / `pin_override` audit — those stay in
  `regDiscountOver` (`register.ts:2210`), which now calls the same helper (one truth; submit behaviour unchanged — p1.15 39/39, p1.3 128/128).

### Per finding
- **F1 / F9** (`RegisterScreen.tsx:861–918, 927, 1701`): `overrideAuthOf(cart, discAuth)` = PIN (+heldCartId from 21B) or approved heldCartId, only for carts with `memberId`
  or `couponCode`; the debounced quote effect calls `quoteRegisterCartOverrideAction` (+ device id, + `idemKey`) instead of the normal action and re-runs when that auth changes
  (`[cartVer, overrideKey]`). Refusals (`onOverrideRefused` :869): PIN_INVALID/PIN_LOCKED ⇒ disarm + `errorFor` toast · APPROVAL_MISMATCH ⇒ drop approval + toast ·
  DISCOUNT_EXCEEDS_LIMIT ⇒ drop approval (the normal quote then shows the discount-over card as before). `overrideQuote` never uses the recalled quote for member/coupon carts
  (F9: approved path shows the real quote with choices). `confirmPay` sends `heldCartId` for approved member/coupon carts (the override quote validated it).
  Carts without member/coupon: unchanged (key stays `null`, localQuote / recalled quote as in P1.15U).
- **F2** (`:496, 1731, 1175 area, 1561`): `parkedChoices` {heldCartId, choices} set at the approval handoff (before `resetBill`), kept only when the same bill comes back via
  approval (`onRecallHeld(…, viaApproval)`), restored once in `openPay`/`openPayPoints` when `discAuth.heldCartId` matches; dropped on recall of another bill / drawer recall /
  discard / reject-cancel (`approvalDone`) / staff switch. Re-quote validates (POINTS_CAPPED / below-min / voucher conflicts via the existing effects, PRICE_CHANGED guards). No new toast.
- **F3** (`:1175` + effect `:1017`): recall strips `memberId` when `registerStatus.memberEnabled === false` (status known) and toasts `errors.memberSystemMissing` (replaces "recalled");
  quote MEMBER_SYSTEM_MISSING with `cart.memberId` ⇒ `detachMember()` + same toast, once per cart version.
- **F4** (`:971`): the choices effect does not clear the voucher while `couponWait` is pending for that cart version; the coupon wait reverts the code, the next quote decides.
- **F5** (`QuickRegisterForm.tsx:30, 44`): `failedWith` {phone, name} recorded on refusal / network error; editing either afterwards calls `onRekey` (MemberPanel → RegisterScreen
  `setMemberFormKey(newKey())` — keys still minted only in RegisterScreen, S5.21); plain retry keeps the key.
- **F6**: `lib/ui/date.ts:24 formatShortDate(d, locale)` (th = `formatThaiDate`, en = en-GB "5 Feb 2026", Bangkok TZ) used at `PayBenefits.tsx:246`, `MemberPanel.tsx:241`.
- **F7**: `register-member-shared.ts:112 tierBadgeColor` (hex 3–8 only) · `MemberPanel.tsx:140` non-hex ⇒ grey badge with the tier name (QC tiers use names like AMBER ⇒ grey).
- **F8** (`:1608`): POINTS_CAPPED / MEMBER_RIGHTS_CHANGED auto-correct only when `cartRef.current.memberId === sale.memberId`; otherwise the normal `setPayError` path (restore ⇒ toast).
- **F10**: accepted as-is (follow-up below).
- **V1/V2 (controller visual, 390)** (`MemberPanel.tsx:200`): root cause reproduced in headless chromium (scratch `repro/repro.mjs`, positive control): the panel body was itself a
  flex column inside the 88dvh sheet, so when the content exceeded the sheet the `overflow-hidden` result list (min-height auto ⇒ 0) shrank to 2 px — the row existed (puppeteer
  "visible") but the tap hit the body. Fix: body = plain scroll container (`min-h-0 flex-1 overflow-y-auto overscroll-contain`, header fixed) with an inner column wrapper; repro
  after: list 66 px, tap hits the row, submit reachable by scrolling the panel (page scroll 0). Also the phone search field was flex-basis 0 in the column (23 px) ⇒ `shrink-0 sm:flex-1`.
- **V3**: member states (except capped / sale-done-member, unchanged) build Americano ×2 + Latte −฿10 (`addCart3(…, inStockOnly)` `visual-pos.mts:703`); member-register scrolls the
  submit button into the panel and fails if the panel cannot scroll.

### Fixture (ruling 10)
- Top-up key `posqc-p112u-topup-<YYYYMMDD>-<balanceBefore>` (`MEMBER_TOPUP_PREFIX` :1524).
- `prepQcCoupon()` (:1593, module functions only, no SQL, nothing deleted): COUPON system of the shot unit (`systemForUnit`) or a tenant system named "คูปอง · POS QC"
  (`listSystems` / `createSystem`) linked with `linkUnit` (only when the unit has none) · `WELCOME50` FIXED ฿50, endAt 2030-12-31, found by code (`listCoupons`) else `createCoupon`;
  inactive ⇒ `setCouponActive`; expired / not ฿50 ⇒ coupon states fail with the reason. `applyQcCoupon` (:1632): member-attached = cart → bill discount → coupon (01 row
  `pos-member-coupon-line`), paydlg-member-points = pay dialog "ใส่คูปอง" (02 row `pos-member-coupon`). No state saves a bill with the coupon (no CouponRedemption).
- Safety check: `qc-pos-p1.3` S3.29 expects WELCOME50 = COUPON_INVALID on the coffee tenant — it runs on its own sandbox unit (no COUPON link), so a silom-only link keeps it green.
- Real shots = CONTROLLER-RUN (rebuild on tree d, `visual-pos.mts p112u --page register --states --user owner|cashier` + `LOCALE=en`).

### Deviations (new)
1. F2 restore also applies to the 21B **PIN** path (`discAuth.kind === "pin"` carrying the same `heldCartId` after `approvalPin` → `onRecallHeld(…, viaApproval)`); the ruling names
   "approved" — same bug, same guard (heldCartId match), re-quote validates.
2. F3 recall strip uses `status?.memberEnabled === false` (status known); unknown status ⇒ the quote-error path detaches instead.
3. APPROVAL_MISMATCH from the override quote shows the `errorFor` toast (the cashier otherwise sees only the discount-over card).
4. No new th/en keys were needed (all messages reuse existing `register.errors.*` / `member.*` keys); no new testids.

### Follow-ups
- F10 (accepted): the coupon wait treats any whole-quote refusal (UNKNOWN, BENEFITS_EXCEED_TOTAL, a PIN cart's DISCOUNT_EXCEEDS_LIMIT) as a coupon failure and reverts the code — toast text can mislead.
- The override quote uses the session actor's cap and "holder" check (like `quoteRegisterCart`), submit uses the staff-token actor; same person in the normal flow.
- `HeldBillsDrawer` / `TaxInvoiceDialog` share the flex-column body pattern that broke 14A at 390 (short content today) — worth the same wrapper when touched (P1.5/P1.13 owners).

### Gates (QC4 `ep-frosty-lab-…` · POS gate lock · final code head 3ff5fe25 = 0fd2db17 + ledger merge · logs `runs/`)
- Fail-before: `qc-pos-p1.12` forced on pre-seam code **68/71** exit 1 (U2 U3 U4 `MISSING:quoteRegisterCartOverride`), residue 0 (`p112-failbefore.log`).
- typecheck (iso + `/tmp/pos-gate.lock`, 5632 MB): TC_EXIT=0 on the working tree with every change of this round (`tc-1.log` server+oracle+UI WIP, `tc-2.log` final code).
  Step-2 commit is the RegisterScreen subset of that tree (no onRekey prop) — self-consistent against step 1.
- `qc-pos-p1.12` forced #1 **0 · 71/71** · forced #2 **0 · 71/71** · unforced **0 · 71/71** (residue 0 each).
- `qc-pos-p1.15` 0 · 39/39 · `qc-pos-p1.13` 0 · 33/33 · `qc-pos-p1.3` 0 · 128/128 · `qc-pos-p1.5` 0 · 21/21 · `qc-pos-p1.16` 0 · 28/28 · `qc-pos-p1.11` 0 · 38/38 ·
  `qc-hf-pos-page-authz` 0 · 56/56. (Step-1 first runs of p1.15 Z2 / p1.3 S1.9 S9.1 S9.2 were red only from seed drift of the controller's vis47 run on `posqc-coffee`
  — `PQC-VIS-*` product, +2 sales; re-run once ⇒ 39/39 and 128/128.)
- `pnpm fitness` without env 0 · 41/41 · with QC4 env 0 · 41/41 · `scripts/fitness-pos.mts` 0 · 8/8.
- visual `p112u --page register --states --dry`: owner th 0 · owner LOCALE=en 0 · cashier th 0 · cashier LOCALE=en 0 — all 6 member states listed (th 16 jobs / en 6), notes
  show WELCOME50 on member-attached + paydlg-member-points and the fixture line (`dry-*.log`). Real shots + 390 re-run = CONTROLLER-RUN.

## Fix round 2 (reviewer re-check R2 F1–F3 · tree p11 · 9 Oct)
Prompt `ledger/pos-briefs/pos-prompt-accountB-P1.12U-fix2.md` · review `ledger/wo-notes/pos-P1.12U-review-R2.md` ("Verified OK" kept as is) · start ec9e91de ·
tree `/root/projects/shark-pos-p11` (no install/generate) · logs `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p112u-fix2/runs/` (headers `tree=… head=… dirty=…`).

### Commits
| commit | what |
|---|---|
| `3478f3e9` | **test** ORACLE-EDIT U5 — override quote honours staffToken (`qc-pos-p1.12` 71 → 72) |
| `f0acfa6c` | F1 server + UI · F2 · F3 (`register.ts` · `register-actions.ts` · `register-shared.ts` · `RegisterScreen.tsx`) |

### Per finding
- **F1 (Medium) — fixed.** `register-shared.ts:329` `RegisterQuoteOverrideInput += staffToken?: string` · `register-actions.ts:133` forwards it ·
  `register.ts:1464` `REG_OVERRIDE_KEYS += "staffToken"` · `:1484` same type check as `regParseSubmit` (wrong type ⇒ STAFF_TOKEN_INVALID) ·
  `:1496` before pricing, the token is resolved exactly as `submitRegisterSale` (:1905): `staffActorFromToken({tenantId, unitId, deviceId})` → `regScope(ctx, tokenActor)`;
  no device / bad / expired / other device / no longer allowed ⇒ STAFF_TOKEN_INVALID (no fallback to the session user); the token scope then drives the plain-quote cap,
  `regDiscountCaps` and `regResolveOverrideCap` (held-cart holder / `pos.sale.manage` check). No token = session user as before.
  UI `RegisterScreen.tsx:910` sends `...tokenArgs()` with every override quote (same helper as recall :1167) · `:880` STAFF_TOKEN_INVALID from the override quote ⇒ `staffTokenDead()` ·
  `:873–876` the last non-empty staff token is part of `overrideKey` (only when an override auth is active) so the quote re-runs after a re-unlock and never sits on
  STAFF_TOKEN_INVALID; a dead token / lock (staff = null) does not re-run it (no session-user quote that would drop the approval while the screen is locked).
- **F2 (Low) — fixed.** `RegisterScreen.tsx:902`: each run of the quote effect does `setQuote((q) => (q?.ver === ver ? null : q))` — a re-run for the same `cartVer` means the
  override auth changed (dropped / refused / armed), so the old manager-priced quote is gone at once: `quoteServer` null ⇒ pay disabled (`totalsPending` for member/coupon carts)
  until the new answer; the plain quote then shows the discount-over card (P1.15U behaviour). New cart versions: no-op (the stored quote is already another version).
- **F3 (Low) — fixed per the reviewer's option.** `RegisterScreen.tsx:863` `overrideAuthOf`: `kind:"approved"` returns `{heldCartId}` only while
  `auth.inputJson === JSON.stringify(cartToQuoteInput(cart, {choices:false}))`; an edited approved member/coupon cart ⇒ no override quote ⇒ plain quote ⇒
  DISCOUNT_EXCEEDS_LIMIT card (`overrideQuote` stays null — inputJson differs) · `discAuth`/`heldCartId` kept (no `onOverrideRefused`) · undoing the edit ⇒ key changes ⇒
  override quote with the approved cap again · the approval is dropped only when submit answers APPROVAL_MISMATCH (:1638, unchanged). Non-member carts unchanged.

### ORACLE-EDIT U5 (`3478f3e9` · own commit · recorded in `pos-P1.12-oracle.md`)
Session actor = STAFF device login (resto cashier user id, `pos.sale.create` + `priceOverride`, no `pos.sale.manage`) · cashier B = coffee cashier user with a STAFF membership in
the temp tenant + `setStaffPin` + `verifyStaffPin` token on DEV1 · B's token submits ฿300 −15 % ⇒ APPROVAL_REQUIRED, `heldByUserId` = B · OWNER approves · override quote
`{heldCartId, staffToken B}` ⇒ ok 4,500 / 25,500 · without token ⇒ APPROVAL_MISMATCH · tampered token ⇒ STAFF_TOKEN_INVALID · submit `{heldCartId, staffToken B}` at that
grand ⇒ ok, `soldByUserId` = B.
- Red before the server change: `runs/p112-failbefore.log` (head 3478f3e9, forced) **71/72**, EXIT 1 — only U5 (override with token ⇒ VALIDATION unknown key), residue 0.

### Follow-ups (no code now)
- `HeldBillsDrawer` / `TaxInvoiceDialog` flex-column bodies on phones (same wrapper as MemberPanel 14A).
- Overlapping wrong-PIN override quotes can count +2 on the manager's PIN row before the disarm lands.
- The plain quote (`quoteRegisterCartAction`) still prices member carts with the session actor's cap (no staffToken) — only the override quote and submit use the token actor.
- F10 (accepted, fix round 1).

### Gates (QC4 `ep-frosty-lab-…` · POS gate lock · code head f0acfa6c, dirty 0)
- `qc-pos-p1.12` fail-before (3478f3e9) 71/72 exit 1 · forced #1 **0 · 72/72** · forced #2 **0 · 72/72** · unforced **0 · 72/72** (residue 0 each).
- `qc-pos-p1.15` 0 · 39/39 · `qc-pos-p1.3` 0 · 128/128 · `qc-pos-p1.13` 0 · 33/33 · `qc-hf-pos-page-authz` 0 · 56/56.
- `pnpm fitness` without env 0 · 41/41 · with QC4 env 0 · 41/41 · `scripts/fitness-pos.mts` 0 · 8/8 · typecheck TC_EXIT=0 (`tc-1` dirty tree = f0acfa6c content, `tc-2` clean f0acfa6c).
- visual `p112u --page register --states --dry` owner/cashier × th/en: EXIT 0, plans identical to fix round 1 except the random device id; 6 member states listed
  (member-panel, member-register, member-attached, paydlg-member-points, paydlg-member-capped, sale-done-member).

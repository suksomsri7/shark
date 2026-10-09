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

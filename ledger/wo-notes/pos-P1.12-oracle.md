# POS P1.12 — oracle notes (`scripts/qc-pos-p1.12.mts`)

Oracle writer · VPS (account B) · 9 Oct 2026 · tree `/root/projects/shark-pos-b` · branch `wip/pos-p1.12-oracle` from `origin/session/pos` f9594902.
Contract: `ledger/pos-briefs/pos-brief-P1.12.md` §0, §2 R1–R17, §3, §4, §5 CD1–CD9, **§9 controller rulings (binding)**. The U half (01 chip, 14A panel, 02/02b rows) is not tested here.
Check families (prompt): ST · B · M · T · V · P · S · W · X · R · Z. The brief's G1–G3 (gift card, CD3) are folded in: masked read-only `giftCards[]` → M7, gift-card choice refused → B2, legacy gift path unchanged → Z2 (+ ST4 no GIFT_CARD tender).

## CONTROLLER-DECISION (rule before the builder starts — the oracle encodes the proposal shown)
1. **VOUCHER_LIMIT is unreachable with `memberChoices.voucherId: string`.** Proposal encoded in V3: `voucherId` given as an **array of ≥ 2 ids** ⇒ `VOUCHER_LIMIT` (quote may refuse or report it in `memberConflicts`; submit refuses), nothing written. An array of 1 or any other non-string = `VALIDATION` (B1 checks `voucherId: 5`). Alternative: drop `VOUCHER_LIMIT` from R16 ⇒ ORACLE-EDIT V3 + ST5 code list.
2. **`PosSale.memberBenefits` shape** = `{ lines: [{kind, ref, label, discountSatang, note?}], pointsBurned }` where `lines` = `applyOnSale().lines` **minus the COUPON line** (the coupon is POS's own, recorded in CouponRedemption; keeping it would double-count in R15's `bill = discount − coupon − Σ memberBenefits`). Σ lines = the member discount written to the sale. Written by `createSale` whenever `applied` is non-null (member in the unit's member system — even with `lines: []`); walk-in = `null` (Z2). `memberSnapshot` = `null` when the caller does not pass it (legacy callers, Z2).
3. **Quote conflict codes.** `memberConflicts[{kind, code, message}]`; quote stays `ok:true` for VOUCHER_INVALID / VOUCHER_COUPON_CONFLICT / COUPON_INVALID (member) / POINTS_* (V2 V4 V7 P3–P6). `POINTS_CAPPED`: the quote also carries the trimmed POINTS line (wallet behaviour — P5 expects 4,750) while submit with the untrimmed number refuses with `allowedPoints`. Walk-in invalid coupon: quote may be `ok` or `COUPON_INVALID`; submit must be `COUPON_INVALID` (V7).
4. **Race loser (V8)**: `MEMBER_RIGHTS_CHANGED` is the target; `VOUCHER_INVALID` is accepted when the loser's pre-quote already sees the winner's commit (cannot be forced from a script). Exactly one sale, `usedRef` = winner, no orphan point rows.
5. **Delegated actor** (CD2/Q2) has `unitAccess: []` (members shop-wide). ST2 asserts the literal permission keys in `register-member.ts` are exactly `member.customer.read`, `member.customer.create`, `member.loyalty.fulfil`, and that the file never calls member admin/write functions (deny-list in the oracle: `updateMember setStatus setOwner setTags mergeMembers* dismissDuplicate (un)linkIdentity eraseMemberById requestErase* applyEraseApproved setConsent export* setBenefits *TierDef applyManualTierApproved setManualTier applyTierChange getMember360 createRewardV2 updateRewardV2 toggleReward cancelV2 redeemV2 adjustPoints adjustWithApproval burnFifo earnWithLot`).
6. **Boundary allowlist**: `public-receipt.ts → @/lib/modules/point` exists today (P1.11 ruling 11) and is grandfathered in ST2. R15 "balance read live from the unit's POINT system" in `receipt.ts` must therefore come through the member facade (e.g. a new read-only member export) — a new `receipt.ts → point` edge fails ST2. If the controller prefers that edge, ORACLE-EDIT ST2's allowlist.
7. **`registerFulfilReward` → `reward.fulfilV2`** is a new `pos → reward` facade edge (not forbidden by ST2; register it as a fitness F2 chokepoint) — or pass it through the member facade. Oracle is agnostic.
8. **Public receipt member block vs P1.11 R2 (no PII)**: oracle requires `receipt.memberBenefits: [{kind, label, discountSatang}]` (same kinds/amounts as the bill) + `points {earned, balance (live, unit POINT system)}` and **no** member name / memberCode / masked phone in the public JSON (R3).
9. **Quick-register phone storage**: `Customer.phone` = digits only (`party.normalizePartyPhone`) — M9 asserts `0861234567` for typed `086-123-4567`. `createMember` alone stores as typed, so POS normalises before calling.
10. **Audit `pos.member.registered`**: exactly one row per created customer; a replay with the same idempotencyKey writes none (M10). Rows for `created:false` with a new key are not asserted either way.
11. **Benefits input**: `registerMemberBenefits(ctx, actor, { memberId, cart })` with `cart` = `RegisterQuoteInput` shape. Result keys exactly `ok member tier points vouchers stamps giftCards rewardsPending`; `giftCards[]` items exactly `{numberMasked, balanceSatang, expiresAt}`; vouchers carry `applicable`, `discountSatang`, `reason|null`, `valueLabel`.
12. **Held cart with choices** (B6): `holdRegisterCart` with `memberChoices` may refuse `VALIDATION` or strip it — both accepted; `memberId + couponCode` must round-trip.
13. **Fulfil for another member's redemption** (W2): `NOT_FOUND` or `MEMBER_NOT_FOUND` accepted.
14. **Lookup sort** `-lastActivityAt` (nulls last) is verified from the DB (the DTO has no `lastActivityAt`).

## Names table (exactly as the oracle calls them — builder must match)
| # | name | shape / where |
|---|---|---|
| 1 | `PosSale.memberSnapshot` | `Json?` · `{name, memberCode, phoneMasked, tierKey: string\|null, tierName: string\|null}` (exactly these keys · from `briefFor` at submit · PDPA ⇒ `name`/`phoneMasked` null) |
| 2 | `PosSale.memberBenefits` | `Json?` · `{lines: [{kind, ref, label, discountSatang, note?}] (no COUPON), pointsBurned}` (CD-2) |
| 3 | migration | only `ALTER TABLE "PosSale" ADD COLUMN "memberSnapshot" JSONB` + `"memberBenefits" JSONB` (one or two statements; nothing else in that file) |
| 4 | `src/lib/modules/pos/register-member.ts` | server · imports loyalty only via `@/lib/modules/member` (+ reward facade if used) · delegated actor only here |
| 5 | `registerMemberLookup(ctx, actor, {q})` | → `{ok:true, items: Item[] (≤ 8, -lastActivityAt)}` · `Item = {id, memberCode, name, phoneMasked, tier: {key,name,color}\|null, points, lastPurchaseAt: string\|null, purchaseCount, suspended}` · `SHARK-MC:` token / ≥ 3 digits (as typed **and** digit-normalised) / code `^M?\d+$`-style exact / name ≥ 2 · too short ⇒ `{ok:true, items:[]}` · other system/merged/unknown token ⇒ not listed |
| 6 | `registerQuickMember(ctx, actor, {phone, name, birthDate?, marketingConsent, heardFrom, idempotencyKey})` | exact keys · → `{ok:true, created: boolean, member: Item}` · `heardFrom ∈ WALK_IN\|LINE\|REFERRAL\|ADS` · Customer `source "POS"`, `homeUnitId` = unit, `sourceDetail {heardFrom, unitId}`, consents LINE/EMAIL/SMS `source "STAFF"`, attribution FIRST/LAST (staffUserId = real user, unitId) |
| 7 | `registerMemberBenefits(ctx, actor, {memberId, cart})` | → `{ok:true, member: Item, tier: {name, discountPct, discountFixedSatang, discountMaxSatang}\|null, points: {balance, burnRateSatang, burnMinPoints, burnMaxPct, balanceValueSatang, expiringSoon[]}\|null, vouchers: [{id, name, code, valueLabel, expiresAt, applicable, discountSatang, reason\|null}], stamps: [{cardId, name, stamps, slots}], giftCards: [{numberMasked, balanceSatang, expiresAt}], rewardsPending: [{redemptionId, rewardName, expiresAt}]}` · read-only |
| 8 | `registerFulfilReward(ctx, actor, {memberId, redemptionId})` | → `{ok:true}` · idempotent · audit `pos.member.reward_fulfilled` (targetId = redemptionId or redemptionId in `after`) actor = real user · `fulfilledById` = real user |
| 9 | actions (`register-actions.ts`, "use server", each calls its fn + catch) | `registerMemberLookupAction` `registerQuickMemberAction` `registerMemberBenefitsAction` `registerFulfilRewardAction` |
| 10 | `RegisterQuoteInput` | `+ couponCode?: string` `+ memberChoices?: {voucherId?: string; points?: int ≥ 0}` (exact keys · `giftCard`/`voucherIds`/other ⇒ VALIDATION) · `REG_QUOTE_KEYS` contains both · held carts keep `couponCode`, never `memberChoices` |
| 11 | quote result (`RegisterQuoteTotals`) | `+ tierDiscountSatang` `+ memberDiscountSatang` `+ memberLines[{kind, ref, label, discountSatang, note}]` `+ pointsToEarn` `+ stampsToAdd[{cardId, name, count}]` `+ memberConflicts[{kind, code, message}]` · `couponDiscountSatang` = POS coupon (validated on subtotal − bill) · `grand = subtotal − lineDiscount − bill − coupon + serviceCharge − memberDiscount` |
| 12 | submit | refuses `memberSnapshot`/`memberBenefits` keys (VALIDATION) · passes `memberSystemId` + `memberChoices {voucherIds, points}` + coupon + `memberSnapshot` to `createSale` · `POINTS_CAPPED` carries `allowedPoints` · result `+ member: {pointsBurned, pointsExpected, pointsBalanceAfterBurn}` |
| 13 | `saleWalletCart(lines, unitId, couponCode)` | exported pure helper under `src/lib/modules/pos/` · called in `createSaleOnce` **and** in the quote path (register.ts or register-member.ts) |
| 14 | `CreateSaleInput.memberSnapshot?` | additive; not in `samePayload` |
| 15 | readers | `receiptPayload().payload.member = {name (snapshot), memberCode, phoneMasked, tierName?, pointEarned, pointBalance? (live, unit POINT system)}` · `payload.totals.memberBenefits: [{kind, label, discountSatang}]` · `totals.billDiscountSatang = discount − coupon − Σ memberBenefits` · `billDetail().bill.member.benefits[]` (+ name from snapshot) · `publicReceipt().receipt.memberBenefits[]` (no PII) |
| 16 | `member.erased` | POS part composed **after** `crm.privacy.onMemberErased` in the same entry (ST5 looks for `modules/pos`, `pos…Erased` or `memberErased` after it) · blanks `memberSnapshot.name/phoneMasked` on that customer's sales · idempotent |
| 17 | refusal codes | `MEMBER_SYSTEM_MISSING MEMBER_SUSPENDED PHONE_INVALID VOUCHER_INVALID VOUCHER_LIMIT VOUCHER_COUPON_CONFLICT COUPON_INVALID POINTS_DISABLED POINTS_BELOW_MIN POINTS_INSUFFICIENT POINTS_CAPPED BENEFITS_EXCEED_TOTAL MEMBER_RIGHTS_CHANGED` (+ `MEMBER_NOT_FOUND`, `PERMISSION_DENIED`, `VALIDATION`) · `{ok:false, code, message(Thai)}`, never thrown |
| 18 | messages | `RegisterRefusalCode` union + `REFUSAL_KEY` `CODE: "errors.<camel>"` + `src/messages/{th,en}/pos.json` `register.errors.<camel>` (th Thai) · `MEMBER_RIGHTS_UNSUPPORTED` stays in union/keys/messages but `register.ts` never returns it |
| 19 | audits | `pos.member.registered` `{customerId, created, unitId}` (no full phone) · `pos.member.reward_fulfilled` |

## Drift (brief vs code at f9594902)
- `listMembers` is **not exported** by `member/index.ts` (only `getMemberKpis` from list.ts) — R2 needs a facade export (or another facade read).
- `createMember` stores the phone as typed (`normPhone` = trim) → POS must normalise digits before calling (CD-9); legacy dashed rows exist (fixture L).
- `receipt.ts:215–218` reads any `PointBalance` by `updatedAt` (bug confirmed: R2 earns 77 pts in a second POINT system after the unit's earn).
- **CD7 is already true today**: `refund.ts:534–542` releases coupons in the refund tx on a full refund — no `refund-consumer.ts` change is needed; X3 only needs the bill to exist.
- `public-receipt.ts` already imports `@/lib/modules/point` (CD-6 allowlist).
- `regParseCart` refuses `couponCode`/`couponDiscountSatang` with "หน้าขายนี้ยังไม่รับคูปอง"; `registerCanonicalCart` (held carts) uses the same parser → refuses today.
- Register quote checks member existence by tenant only (`register.ts:1207–1210`): a member of another member system (Z), a MERGED member and a SUSPENDED member all pass quote today (M4/M5 red on `OK`); a SUSPENDED member can even be sold to (M5 pre-build created a bill).
- `RegisterQuoteTotals.couponDiscountSatang` exists but is always 0 (priceCart).
- `BillDetail.member` exists (`{name, memberCode, tierName?, pointsEarned, customerId}`) — P1.12 adds `benefits[]` and takes `name` from the snapshot.
- `ReceiptPayload.member` lacks `memberCode`/`phoneMasked`; `totals` lacks `memberBenefits`; `billDiscountSatang` today = discount − coupon − tier (voucher/points lumped in).
- Wallet validates the coupon on the **remaining** amount (after tier/voucher) while `createSale` validates on `subtotal − bill`; `memberDiscount = applied.total − walletCouponLine`. The quote must reproduce both (T5 cart `bTB` = Gold + PCT10 + bill discount exposes any shortcut).
- `applyOnSale().lines` includes the COUPON kind (CD-2 excludes it from `memberBenefits`).
- Messages live in split files `src/messages/{th,en}/pos.json`; `register.errors.couponInvalid` already exists.
- Stamp module: a stamp in a **completed** cycle cannot be voided — fixture card uses `minSatang 60,000` so only 5 bills of X stamp (no completion in a run).

## Check list (71 since P1.12U fix round 1 ORACLE-EDIT U2–U4 · 68 since P1.12U ORACLE-EDIT U1 · S=5 −=26 X1=12 X2=3 X3=3 X4=7 X5=12) — fix round 1 (reviewer F1–F4 · F7) added M12 · P9 · W3 (64 → 67)
ST1 migration additive (2 nullable Json) · ST2 pos→loyalty only via member facade (public-receipt allowlist) + register-member.ts + delegated keys + no admin calls · ST3 "use server" + 4 actions · ST4 no GIFT_CARD tender · ST5 codes/keys/messages, MEMBER_RIGHTS_UNSUPPORTED retired, REG_QUOTE_KEYS, saleWalletCart in createSale + quote, CreateSaleInput.memberSnapshot, createSale writes memberBenefits, submit passes memberSystemId, member.erased POS after CRM ·
B1 new keys exact · B2 giftCard VALIDATION · B3 points type · B4 client snapshot VALIDATION · B5 quick-register parser · B6 held cart memberId+couponCode ·
M1 phone lookup (prefix/dashed/legacy) + DTO + masking + short q · M2 name/code/sort/merged/other-system · M3 SHARK-MC token · M4 404-not-403 same message · M5 SUSPENDED · M6 MEMBER_SYSTEM_MISSING ×5 · U1 registerStatus.memberEnabled A true / B false (P1.12U) · M7 STAFF w/o member.* + benefits DTO read-only · M8 no pos.sale.create ⇒ PERMISSION_DENIED ×5 · M9 quick register side effects + audit · M10 dup phone / replay key · M11 PHONE_INVALID + snapshot + `0066…` → `0…` (F2) · M12 legacy dashed L + same digits typed with spaces ⇒ created:false, same id, Customer count same, no audit (F1) ·
T1 Gold tier 2,500 · T2 no MEMBER_RIGHTS_UNSUPPORTED · T3 tier base before bill discount · T4 tier outside cashier cap (+ control) · T5 quote = bill for 6 mixed carts ·
V1 voucher USED · V2 VOUCHER_INVALID · V3 VOUCHER_LIMIT · V4 VOUCHER_COUPON_CONFLICT · V5 member coupon · V6 walk-in coupon · V7 COUPON_INVALID · V8 parallel race ·
P1 benefits points · P2 burn 500 · P3 below min · P4 insufficient · P5 capped (+ 475 control) · P6 disabled · P7 earn = pointsExpected · P8 GL points = bill discount · P9 cap below min ⇒ POINTS_BELOW_MIN quote+submit, nothing written (F3) ·
S1 stampsToAdd · S2 one ADD · S3 replay ×2 · S4 void ⇒ VOID ·
W1 fulfil + audit · W2 idempotent / other member · W3 fulfilled in back office first ⇒ POS ok, 0 audits (F4) ·
X1 void full chain · X2 replay voided ×2 · X3 full refund · X4 partial refund (F7: exactly one `pos-refund-<refundId>:` row, delta = −floor(pointEarned × refund grand / sale grand)) · X5 replay refunded ×2 · X6 void racing paid · X7 GL of void nets 0 ·
R1 receipt lines · R2 live balance + snapshot name · R3 public receipt · R4 BillDetail.member · R5 immutability · R6 PDPA erase ×2 ·
Z1 residue 0 + seed markers · Z2 legacy createSale (points + gift card) unchanged + memberBenefits for all callers.

## Fixture (temp tenant `posqc-p112-<rand>`, wiped in `finally`)
- Units A (POS-A + MEMBER + POINT + COUPON + REWARD), B (POS-A, no MEMBER; second POINT system), C (POS-A + MEMBER + COUPON, no POINT). POS-A linked to ACCOUNT (VAT 7 %). Device `qc112<rand>d1` + open shift on A.
- Tiers via `member/tiers` (Silver default, Gold 5 % cap ฿100). Point settings: earn ฿10/pt, burn 10 satang/pt, min 100, max 50 %, NET, exclude voucher/gift card.
- Members (createMember): X Gold `0892145521` (1,340 − 100 reward = 1,240 pts), Y Silver (600), S SUSPENDED (setStatus), M merged into X (mergeMembers), L legacy phone `089-555-NNNN`, E (PDPA), Z in a second member system. QR tokens via `meCard` (SESSION_SECRET set in-process only if absent).
- Vouchers (createTemplate + issue): ฿30 non-stackable ×5 to X (+1 expired by moving `expiresAt`), 1 to Y; ฿30 stackable ×5 to X. Coupons WELCOME50 (฿50) + PCT10 (10 %, cap ฿100). Stamp card PER_SALE_MIN ฿600, 10 slots, reward = stackable voucher. Reward (100 pts) redeemed by X → pending. Gift card ฿500 owned by X.
- Actors: OWNER; STAFF `pos.sale.create` only (units A/B/C); STAFF seller (+ priceOverride, cap 10 %); STAFF `pos.sale.read` + `member.*` (no create).
- Stimuli outside module functions: expired voucher (`expiresAt` moved), X renamed and restored (R2/R4 snapshot proof), raw SQL for the two new columns and the wipe.

## Runs (base f9594902 + this oracle) — 9 Oct UTC, QC4 `ep-frosty-lab-aoylqlv8-pooler…`
- `--list` (no DB): **64 ids**, exit 0 — `ST1 ST2 ST3 ST4 ST5 B1 B2 B3 B4 B5 B6 M1 M2 M3 M4 M5 M6 M7 M8 M9 M10 M11 T1 T2 T3 T4 T5 V1 V2 V3 V4 V5 V6 V7 V8 P1 P2 P3 P4 P5 P6 P7 P8 S1 S2 S3 S4 W1 W2 X1 X2 X3 X4 X5 X6 X7 R1 R2 R3 R4 R5 R6 Z1 Z2` · X-coverage `S=5 -=24 X2=3 X3=3 X5=12 X1=10 X4=7`.
- `--no-db` (no prisma load): **1/5**, exit 1 — ST1 no columns/migration · ST2 no register-member.ts (boundary part clean: only the grandfathered public-receipt→point edge) · ST3 4 actions missing (all existing "use server" pos files pass) · ST5 13 codes/keys/messages missing, `MEMBER_RIGHTS_UNSUPPORTED` still returned, REG_QUOTE_KEYS lacks couponCode/memberChoices, no saleWalletCart, no memberSnapshot/memberBenefits, submit lacks memberSystemId, no POS part in member.erased · ST4 green (no GIFT_CARD tender today — guard).
- Unforced (`QC_FORCE` unset) = `SKIPPED` exit 0 with the missing list (8 reasons incl. the two DB columns) — gate identical to P1.13 (not re-run separately).
- Forced run #1 (`iso.sh → QC_FORCE=1 qc4.sh → with-gate-lock /tmp/shark-gate-pos.lock`): **5/64**, exit 1, no crash, every fixture step succeeded, temp tenant wiped (320 tables, residue 0, Tenant 0). Green: ST4, B2, B3, B4 (today's parser already refuses those keys — guards), Z1. Red for the expected reasons: `MISSING:registerMemberLookup|registerQuickMember|registerMemberBenefits|registerFulfilReward` (B5 M1–M3 M6–M10 P1 W1 W2 + benefits parts of M4/M5/P6); Gold member quote → `MEMBER_RIGHTS_UNSUPPORTED` (T1–T4 M11 S1–S4 T5 + bills bT1 bT3 bS); `couponCode`/`memberChoices` → `VALIDATION` (B1 B6 V1–V8 P2–P8 X1–X7 R1–R4 + bills); Z/M/S/unit-B quotes return `OK` (M4 M5 M6 — R1 not enforced; S even gets a bill); DB lacks `memberSnapshot`/`memberBenefits` (R5 R6 Z2). Harness fixes after run #1: P3–P6/M8/M7 counts scoped to rows this card writes and taken after a drain (background `scheduleDrain` of earlier bills raced the tenant-wide counters); message cosmetics.
- Forced run #2 (after the harness fixes): **5/64**, exit 1, no crash, all fixtures ok, wiped (320 tables, residue 0, Tenant 0) — same green set (ST4 B2 B3 B4 Z1) and the same red reasons; P5 no longer shows the spurious "point row added". Seed-tenant counts moved by +1 sale/outbox/JV during the run (`posqc-coffee` — another lane; info only, Z1 judges by this run's markers and found none).
- Typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 1200 /tmp/pos-gate.lock pnpm typecheck` (wait capped at 20 min per the prompt's fallback rule; the lock was free) → **exit 0**, 0 errors (incremental, full project incl. `scripts/qc-pos-p1.12.mts`). Also a single-file `tsc -p <scratch tsconfig>` on the oracle → exit 0.
- Not run here (builder's job, COMMON §7): `qc-pos-*` all, `qc-account-cpa`, `qc-pos-account`, `qc-pos-coupon`, `qc-member-m2.7`, `qc-member-m2.8`, money suites; ORACLE-EDIT of `qc-pos-p1.3` S3.29/S3.42 (ruling Q7).

## Follow-ups
- Member owner: phone index / trigram for lookup (ruling Q4) — today `listMembers` uses `contains` and phones are stored as typed.
- Controller: POS-CONTRACTS C-10 names → wallet (ruling Q5); POS-OWNER-PENDING gift-card output VAT (ruling Q1).

## ORACLE-EDIT — fix round 1 (controller prompt `pos-prompt-accountB-P1.12-S-fix.md`, reviewer `pos-P1.12-review-S.md`)
One `test(pos P1.12)` commit by builder S, as ruled: **M12** new (F1) · **M11** + `0066` case (F2) · **P9** new (F3) · **W3** new (F4) ·
**X4** exact count + pro-rata amount (F7) · **M1** logs `M1 lookup ms=…` (F6, info only, no assertion). Count **64 → 67** (`--list`).

## ORACLE-EDIT U1 (P1.12U · controller ruling 2, 9 Oct)
- New check `P1.12-U1` ("-"): `registerStatus(ctxOf("A"), owner).memberEnabled === true` (unit A has a MEMBER system) and
  `registerStatus(ctxOf("B"), owner).memberEnabled === false` (unit B without MEMBER). Count **67 → 68** after the fix-round merge (was 64 → 65 on the pre-fix base).
  Server: `register.ts registerStatus` returns `memberEnabled = !!systemForUnit(unitId, "MEMBER")` (read error ⇒ false) +
  `RegisterStatus.memberEnabled: boolean`. Builder P1.12U, tree d, branch `wip/pos-p1.12u`.

## ORACLE-EDIT U2 U3 U4 (P1.12U fix round 1 · controller ruling 1 · reviewer F1/F9, 9 Oct)
Builder P1.12U, tree p11, branch `wip/pos-p1.12u`. Seam under test: `register.ts quoteRegisterCartOverride(ctx, actor, {cart, managerPin?, managerUserId?, heldCartId?, idempotencyKey?})`
(+ `quoteRegisterCartOverrideAction`), read-only. Block placed **last** in `runDb` (after T5) because it creates a POS_DISCOUNT_OVER policy and an OWNER
membership (coffee owner user) in the temp tenant — earlier checks (e.g. T4 control) must not see them; all rows are in the temp tenant (wiped in finally).
Fixture added (module functions): `Membership` OWNER for the owner user in the temp tenant · `setStaffPin` (random non-weak 6-digit PIN, never printed) at unit A ·
`approval.createPolicy` POS_DISCOUNT_OVER (step OWNER) · `point.earnWithLot` +1,000 to X (key `<TAG>-pu2`).
- **U3** (X5): cart ฿500 −20 % as STAFF seller (cap 10 %): normal quote DISCOUNT_EXCEEDS_LIMIT · override without auth DISCOUNT_EXCEEDS_LIMIT · PIN without
  `managerUserId` VALIDATION · well-formed wrong PIN PIN_INVALID and `PosStaffPin.failedCount` 1 (same counter as submit) · correct PIN ok (฿100 off, ฿400) and counter 0 ·
  no `pos.discount.override`/`pos.approval.pin_override` audit, no PosHeldCart, no ApprovalRequest added by any of these quotes.
- **U2** (X4): X + 500 points + −15 % + correct PIN: normal quote DISCOUNT_EXCEEDS_LIMIT · override ok, billDiscount 15,000, POINTS line 5,000, no conflicts, no audit ·
  submit with the same PIN/choices and expected+1 ⇒ PRICE_CHANGED whose totals (minus ok/code/message) are byte-equal (JSON) to the override quote · submit with the
  override grand ⇒ ok, `member.pointsBurned` 500.
- **U4** (X1): walk-in ฿400 −15 % + WELCOME50 submitted by the STAFF seller ⇒ APPROVAL_REQUIRED (held cart + request) · OWNER decides APPROVED · drain · normal quote
  DISCOUNT_EXCEEDS_LIMIT · override `{heldCartId}` ok 6,000 / coupon 5,000 / grand 29,000 · submit `{heldCartId}` with that grand ok · same override again ⇒ DISCOUNT_EXCEEDS_LIMIT.
- Count **68 → 71** (`--list`: X-coverage S=5 -=26 X2=3 X4=8 X5=13 X1=13 X3=3).
- Fail-before (pre-seam code d8456e05, forced, QC4): **68/71**, exit 1 — U2 U3 U4 red `MISSING:quoteRegisterCartOverride`, every fixture step ok, residue 0
  (`scratchpad/p112u-fix/runs/p112-failbefore.log`). After the seam: forced **71/71**, residue 0 (`runs/s1-p112-forced.log`).

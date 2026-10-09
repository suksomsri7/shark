# POS P1.12 — builder S notes (member at the cart · lookup / quick register · benefits at pay · snapshot · readers · PDPA)

Builder S · VPS account B · 9 Oct 2026 · tree `/root/projects/shark-pos-b` · branch `wip/pos-p1.12` from `origin/session/pos` 183b4e1b
(oracle `scripts/qc-pos-p1.12.mts` merged at 3a4cf496). Contract: `ledger/pos-briefs/pos-brief-P1.12.md` (§0 · §2 R1–R17 · §3 · §5 · §9 Q1–Q8),
prompt `ledger/pos-briefs/pos-prompt-accountB-P1.12-S.md` (controller rulings 1–14 + drift), names table in `ledger/wo-notes/pos-P1.12-oracle.md`.

## ⚠️ Open — needs the controller (not done by the builder: oracle edits outside the ruled ones are forbidden)
1. **`qc-pos-p1.12` X4 — oracle key format.** X4 looks for a point row with `idempotencyKey === "pos-refund-<refundId>"`. The existing
   partial-refund path (`member-bridges.onPosSaleRefunded` → `point.reversePartialEarn`, P1.8, untouched here) writes one REVERSE row
   **per EARN row** with key `pos-refund-<refundId>:<earnLedgerId>` (`point/lots.ts:481`). Everything else in X4 is green (voucher USED,
   BURN −100 kept, exactly one EARN, pro-rata REVERSE present and < EARN, stamps not voided). Proposed ORACLE-EDIT (prefix match):
   `scratchpad/p112/qc-pos-p1.12-X4.proposed.diff`. Alternative = change the point module key (outside this card).
2. **`qc-pos-p1.5` H5 — "คูปอง" case.** H5 expects `holdRegisterCart` with `couponCode` ⇒ VALIDATION (Q12 era). P1.12 R3/ruling 12 +
   oracle B6 require held carts to keep `couponCode` ⇒ direct conflict. Proposed ORACLE-EDIT (swap the case to `couponDiscountSatang`,
   still VALIDATION; count unchanged): `scratchpad/p112/qc-pos-p1.5-H5.proposed.diff`. Q7 only ruled p1.3, so not applied.

(Full scratch path: `/tmp/claude-0/-root/b9f62cc5-a8cd-5bde-9353-94efac8b93a6/scratchpad/p112/`.)

## Migration (QC4 only · additive · CD9)
`prisma/migrations/20261202100000_pos_p112_member_snapshot/migration.sql` — written by hand from
`prisma migrate diff --from-schema <copy of pre-change prisma/schema> --to-schema prisma/schema --script` (never from the DB):
```sql
ALTER TABLE "PosSale" ADD COLUMN "memberSnapshot" JSONB;
ALTER TABLE "PosSale" ADD COLUMN "memberBenefits" JSONB;
```
`migrate status` before: only this folder pending (QC4 also holds 6 other lanes' migrations — untouched) · `migrate deploy`
(iso → QC_FORCE qc4 → POS gate lock) **0** · `prisma generate` (own node_modules) **0**. Host `ep-frosty-lab-aoylqlv8…`.
`scripts/pos-qc-env.mts` lists models, not PosSale columns ⇒ nothing to add (no new table ⇒ no `core/scope.ts` entry).

## Steps (each typechecked 0, committed, pushed)
| step | commit | what |
|---|---|---|
| 1 | `1c48d450` | schema + migration + deploy + generate · `--no-db` ST1 green |
| 2 | `07bd03be` | `register-member.ts` (lookup · quick register · benefits · fulfil · delegated actor) · R1 gate in `regPrice` · 4 actions · 12 codes + keys + messages · `saleWalletCart` (createSale uses it, no behaviour change) · member facade exports · fitness `pos→reward` · forced 22/64 (all step-2 checks green) |
| 3 | `ddab71e5` | quote/submit with coupon + tier + voucher + points · createSale writes `memberBenefits` / `memberSnapshot` · forced 56/64 |
| 4 | `edb74774` | receipt / renderer / public receipt / billDetail readers · `member.erased` POS hunk · forced 61/64 |
| 5a | `b9804e00` | **test** ORACLE-EDIT V3 + ST5 (ruling 1 — VOUCHER_LIMIT dropped; count stays 64) |
| 5b | `a0c96d63` | fix: R1 tenant-existence check before the member-system check (keeps qc-pos-p1.3 S3.13) |
| 5c | `251a01ec` | **test** ORACLE-EDIT qc-pos-p1.3 S3.29 + S3.42 (Q7; count stays 128; 125 → 128) |

## Rules as implemented
- **R1 gate** (`registerMemberGate`, called from `regPrice` for every quote/submit with `memberId`, and by benefits/fulfil):
  customer not in this tenant / malformed id ⇒ `MEMBER_NOT_FOUND` (the one Customer existence query POS keeps) → unit without MEMBER system
  ⇒ `MEMBER_SYSTEM_MISSING` → `briefFor` in the unit's member system (delegated actor) not found / MERGED / CLOSED (erased) ⇒
  `MEMBER_NOT_FOUND` (same message everywhere) → SUSPENDED ⇒ `MEMBER_SUSPENDED`. Lookup / quick register check the member system only.
- **Delegated actor** (ruling 5): built only in `register-member.ts`, only after `evaluate(actor, pos.sale.create, unit)` (re-checked there),
  `{ userId: real, role: "STAFF", unitAccess: [], permissions: {member.customer.read, member.customer.create, member.loyalty.fulfil} }`.
  Role is STAFF on purpose: OWNER/MANAGER would pass every `member.*` key inside the member module. Audit / attribution /
  `fulfilledById` carry the real userId (MemberCtx.actorUserId = real user).
- **R2 lookup**: `SHARK-MC:` ⇒ `resolveCardToken` + R1 system filter · `^[A-Za-z0-9]{4,16}$` ⇒ exact memberCode (case-insensitive) if any ·
  digits/space/dash/+ only ⇒ phone (≥ 3 digits after normalising; listMembers on: as typed, digits, 3-3-4 dash, 2-3-4 dash, 3-3-4 space ⇒
  legacy dashed rows found — Q4) · else name ≥ 2 chars · shorter ⇒ `items: []`. Union sorted `-lastActivityAt` nulls last then id; ACTIVE +
  SUSPENDED only; ≤ 8. Item: brief (name · memberCode · phoneMasked · tier) + points of the unit's POINT system + `lastPurchaseAt` /
  `purchaseCount` from POS's own `PosSale` (docType SALE, PAID|REFUNDED).
- **R4 quick register**: exact keys; name 1–80; birthDate real YYYY-MM-DD ≤ today; heardFrom WALK_IN|LINE|REFERRAL|ADS; key `[A-Za-z0-9_-]{8,100}`;
  phone → digits (party rule, 0066/66 → 0), 9–10 digits starting 0 else `PHONE_INVALID`. `createMember` with `source POS`,
  `sourceDetail {heardFrom, unitId}`, `homeUnitId`, consents LINE/EMAIL/SMS `source STAFF`, `idempotencyKey "pos-qr:<key>"`.
  Audit `pos.member.registered {customerId, created:true, unitId, memberCode, phoneMasked, heardFrom}` only when created (ruling 10).
- **R5 benefits**: R1 gate · cart priced with the register's DB prices (no price-override / cap / member checks — display only, so a STAFF
  without priceOverride can still see benefits for custom lines) · `getWallet(cart)` + `pointBalanceForUnit` · read-only.
- **R6 quote**: after `priceCart`: POS coupon validated on `subtotal − line − bill` (unit COUPON system, same as createSale) and re-priced with
  `couponDiscountSatang`; then `member.quoteApply` with `saleWalletCart(lines, unitId, couponCode)` (same helper as createSale) and
  choices `{voucherIds:[voucherId], points}`. `memberDiscount = total − wallet COUPON line` (createSale formula) · VAT of the member-discounted
  grand = `splitIncludedVat` (createSale formula; identical to priceCart at 7 %) · `netSatang = net − memberDiscount` · grand < 0 ⇒
  `BENEFITS_EXCEED_TOTAL`. Conflicts (quote stays ok): coupon invalid / no coupon system ⇒ `COUPON_INVALID`; chosen voucher not applied ⇒
  `VOUCHER_INVALID` (wallet reason); wallet COUPON conflict while a voucher is applied ⇒ `VOUCHER_COUPON_CONFLICT` (exactly the rule that
  makes createSale throw); points checked in wallet order: no unit POINT ⇒ `POINTS_DISABLED`, < min ⇒ `POINTS_BELOW_MIN`, > balance ⇒
  `POINTS_INSUFFICIENT`, wallet trimmed ⇒ `POINTS_CAPPED` + `allowedPoints` (quote carries the trimmed POINTS line).
- **R7 submit**: re-prices (same `regPrice`), first conflict ⇒ its refusal (POINTS_CAPPED carries `allowedPoints`), nothing written; forwards
  `memberSystemId` (always, so `askedNothing` never applies) · `memberChoices {voucherIds, points}` · `couponSystemId + couponCode` ·
  `memberSnapshot`. Errors from the bill tx: name ∈ {MemberInputError, MemberNotFoundError, Voucher*Error, GiftCard*Error} or
  "แต้มคงเหลือไม่พอ" ⇒ `MEMBER_RIGHTS_CHANGED`; "คูปองใช้ไม่ได้…" ⇒ `COUPON_INVALID` (tx rolled back: no sale, no burn).
  Result `member {pointsBurned, pointsExpected = quote.pointsToEarn, pointsBalanceAfterBurn = balance before − burned}` (new bills only).
  Duplicate-key replay compares bill discount net of coupon (CouponRedemption) and Σ memberBenefits, plus coupon code, pointsBurned, voucher.
- **R9** `createSale`: `memberSnapshot` (caller input, additive, not in `samePayload`) written at insert; `memberBenefits =
  {lines: applied.lines without COUPON, pointsBurned}` whenever `applied` is non-null (ruling 2; also legacy register / other callers),
  walk-in ⇒ null. PDPA: `outbox-consumers.ts` `member.erased` entry runs CRM first, then `posMemberErased` (raw jsonb_set of name /
  phoneMasked to null for that customer's sales, idempotent, money/tier/benefits untouched).
- **R13 fulfil**: R1 gate · `reward.resolveRewardCtx` · redemption must be in `pendingForCustomer(member)` ⇒ `fulfilV2` (delegated actor,
  fulfilledById = real user) + audit `pos.member.reward_fulfilled` (targetType RewardRedemption, targetId redemptionId, after
  {redemptionId, customerId, unitId}) once; not pending but already audited for this member ⇒ ok (idempotent); otherwise ⇒
  `MEMBER_NOT_FOUND` (ruling 13). fulfilV2 errors (expired / unit-restricted) ⇒ VALIDATION with the reward module's Thai text.
- **R15 readers**: receipt member block from the snapshot (older bills: live Customer + masked phone), `totals.memberBenefits`,
  `billDiscountSatang = discount − coupon − Σ memberBenefits` (older bills: − tier as before), `pointBalance` live from the **unit's** POINT
  system via `member.pointBalanceForUnit` (fixes the "PointBalance updated last" bug). Renderer prints benefit lines (TIER keeps the old
  label; bills without memberBenefits render exactly as before). Public receipt: `memberBenefits[]` (no PII, ruling 8), `points.balance`
  from the unit's POINT system (falls back to P1.11's "first point system of the member system" when the unit has none).
  `BillDetail.member {name/memberCode/tierName from snapshot, benefits[], pointsEarned, customerId}`; `totals.billDiscount` net of benefits.

## Deviations (rule touched)
- R1 order: tenant-existence check before `MEMBER_SYSTEM_MISSING` (404-not-403: a foreign/unknown id learns nothing about the unit) — keeps
  qc-pos-p1.3 S3.13 unchanged; P1.12 M4/M6 unaffected.
- Delegated actor role fixed to STAFF (ruling 5 lists keys, not role).
- R5 benefits pricing skips the price-override/cap checks (display only) — oracle M7 (STAFF, custom lines) needs it.
- `pointBalanceForUnit` returns balance + burn settings (one export serves ruling 6 and R5's `getPointSettings` need; POS cannot import point).
- `MEMBER_RIGHTS_UNSUPPORTED` kept in union/keys/messages; `register.ts` never returns it; `regMemberAutoDiscount` removed
  (`member.automaticDiscountForSale` stays exported, now unused by POS).
- `RegisterQuoteTotals` new fields are **optional in the type** (the server always fills them) because `RegisterScreen.tsx` builds a local
  `RegisterQuote` and components are out of scope for S.
- Quick register cannot detect a legacy dashed duplicate (listMembers returns masked phones only; createMember matches the stored string) —
  follow-up for the member owner.

## Member-module edits (additive only — rulings 6 + drift)
`member/wallet.ts` + `member/index.ts`: `pointBalanceForUnit(ctx, {customerId, unitId}) → {pointSystemId, balance, burnRateSatang,
burnMinPoints, burnMaxPct} | null` (resolveSystems of the wallet ⇒ the POINT system applyOnSale burns) + type `UnitPointsDto`;
`listMembers` (+ types) exported from the index. Nothing else in the member module.
**Reward edge (ruling 7):** the member facade does not re-export `fulfilV2` ⇒ `register-member.ts` dynamic-imports `@/lib/modules/reward`
(`resolveRewardCtx`, `pendingForCustomer`, `fulfilV2`); `"pos→reward"` registered in `scripts/fitness.mts` F2 allowlist (one marked line).

## P1.12U contract (server side is final)
Actions (`src/lib/modules/pos/register-actions.ts`, `"use server"`, each needs `pos.sale.create` at the unit; refusals returned, never thrown):
- `registerMemberLookupAction({systemId, unitId, deviceId?, q})` → `{ok:true, items: RegisterMemberItem[]}`
- `registerQuickMemberAction({systemId, unitId, input: {phone, name, birthDate?, marketingConsent, heardFrom, idempotencyKey}})` →
  `{ok:true, created, member}` (created:false ⇒ toast "มีสมาชิกเบอร์นี้แล้ว — ผูกกับบิลให้แล้ว")
- `registerMemberBenefitsAction({systemId, unitId, memberId, cart})` → `RegisterMemberBenefits` (tier · points|null · vouchers ·
  stamps · giftCards (read-only) · rewardsPending)
- `registerFulfilRewardAction({systemId, unitId, memberId, redemptionId})` → `{ok:true}`
- existing `quoteRegisterCartAction` / `submitRegisterSaleAction` / `holdRegisterCartAction`: cart may now carry `couponCode` and
  `memberChoices {voucherId?, points?}` (pay screen only; held carts drop choices). Quote result adds `tierDiscountSatang ·
  memberDiscountSatang · memberLines[] · pointsToEarn · stampsToAdd[] · memberConflicts[{kind, code, message, allowedPoints?}]`.
  Submit: `POINTS_CAPPED` ⇒ `{allowedPoints}` (auto-correct) · `MEMBER_RIGHTS_CHANGED` ⇒ re-quote banner · ok ⇒ `member
  {pointsBurned, pointsExpected, pointsBalanceAfterBurn}` for 02b.
Types (client-safe, `register-shared.ts`): `RegisterMemberChoices · RegisterMemberLine · RegisterMemberConflict(Code) ·
RegisterMemberItem · RegisterMemberLookupResult · RegisterQuickMemberInput/Result · RegisterMemberBenefits(Result) ·
RegisterFulfilRewardResult · RegisterPointsCapped · REGISTER_HEARD_FROM`.
Refusal codes (12): `MEMBER_SYSTEM_MISSING MEMBER_SUSPENDED PHONE_INVALID VOUCHER_INVALID VOUCHER_COUPON_CONFLICT COUPON_INVALID
POINTS_DISABLED POINTS_BELOW_MIN POINTS_INSUFFICIENT POINTS_CAPPED BENEFITS_EXCEED_TOTAL MEMBER_RIGHTS_CHANGED` → `refusalMessageKey` →
`pos.register.errors.<camel>` (th + en). UI strings `pos.member.{chip,panel,register,pay,done}.*` (th + en) added for 01 / 14A / 02 / 02b.
UI must: send `couponCode` from the cart, `memberChoices` only from the pay dialog, re-quote on every choice, show masked phones only,
hide the member chip when lookup returns `MEMBER_SYSTEM_MISSING`, render gift-card / deposit / room-charge / store-credit tiles disabled.

## Follow-ups
- Member owner: phone index / normalised-phone column for lookup (Q4) — today `listMembers` uses `contains` on the stored string (we fan out
  over 5 phone forms); and createMember duplicate check should compare digit-normalised phones (legacy dashed rows).
- Receipt bug fixed: printed/online balance now = unit's POINT system (was "any PointBalance updated last").
- Controller: POS-CONTRACTS C-10 → wallet names (Q5); POS-OWNER-PENDING gift-card output VAT (Q1); X4 + p1.5 H5 ORACLE-EDIT rulings above.
- `pointsToEarn` is the wallet's preview (wallet net ignores the bill discount, CD6); with a bill discount the post-drain `pointEarned` may differ.

## Gates (logs: `scratchpad/p112/runs/*.log`, each with a `tree=/root/projects/shark-pos-b head=<sha>` header)
Code tip for all gates = `251a01ec` (+ `scripts/pos-sale-contract.json` recorded with `--update-pos-contract`, committed with these notes).
- typecheck (`iso.sh flock /tmp/pos-gate.lock pnpm typecheck`, 5632 MB heap): step1 **0** · step2 **0** · step3 **0** · step4 **0** · step5 (gate fix + p1.3 edit) **0**.
- `qc-pos-p1.12` (ruled ORACLE-EDITs applied): forced #1 **63/64** · forced #2 **63/64** · unforced **63/64** (not SKIPPED) — only **X4** red
  (oracle key format, open item 1); every run: temp tenant wiped, 320 tables, residue 0, Tenant 0, Z1 green (no seed leaks), drain-twice
  checks (S3 X2 X5 X6 R5 R6 W2 M10) green. With the proposed X4 prefix match applied locally (not committed, reverted): forced **64/64** exit 0.
  `--no-db` 5/5 · `--list` 64.
- progression (forced): step2 22/64 → step3 56/64 → step4 61/64 → after ruled edits 63/64.
- `qc-pos-p1.3` **128/128** (after ORACLE-EDIT S3.29/S3.42; before the edit 125/128 = S3.13 (fixed in code, a0c96d63) + S3.29 + S3.42).
- `qc-pos-p1.5` **20/21** exit 1 — H5 "คูปอง" case (open item 2); with the proposed H5 edit applied locally (reverted) **21/21** exit 0.
- `qc-pos-p1.8` 49/49 · `qc-pos-p1.11` 38/38 · `qc-pos-p1.13` 32/32 · `qc-pos-p1.15` 39/39 · `qc-pos-p1.16` 28/28 — all exit 0.
- `qc-member-m2.7` / `qc-member-m2.8`: **harness crash before any check in both base and branch** — identical before/after:
  `scripts/member-expected.json` (committed, CRM-era ids) has no matching owner Membership in QC4's member tenant
  (`actorOf` line 64 → `membership.findFirst` null). Base 183b4e1b: same crash (`before-qc-member-m2.7/8.log`). Needs a member re-seed or the
  current expected file — both outside this lane (no `seed-member-qc`). The legacy createSale gift-card + points path is covered by P1.12 Z2 (green).
- Money set (COMMON §7), identical to the recorded baseline (P1.8 §9 / P1.13): `qc-pos-account` 0 · 16/16 · `qc-account-cpa` 0 · 107/107 ·
  `qc-restaurant-money` 0 · 6/6 · `qc-shop-refund` 0 · 12/12 · `qc-hotel-money` 0 · 5/5 · `qc-ticket-money` 0 · 6/6 · `qc-subscription-money` 0 · 14/14.
- `qc-hf-pos-page-authz` 0 · 56/56.
- `pnpm fitness` without env 0 · 41/41 · with QC4 env 0 · 41/41 · `scripts/fitness-pos.mts` 0 · 8/8 (F15.2: + `CreateSaleInput.memberSnapshot?`
  recorded with `--update-pos-contract`).

## HANDOVER (9 Oct)
- Head before this section: `af6f05ec` (branch `wip/pos-p1.12`, pushed). Tree `/root/projects/shark-pos-b`, clean.
- Build order: steps 1–4 **done** · step 5 ruled ORACLE-EDITs **done** (V3+ST5 `b9804e00`, p1.3 S3.29+S3.42 `251a01ec`) · fix `a0c96d63` · notes + contract `af6f05ec`. Nothing partial, nothing not started.
- Migration: `20261202100000_pos_p112_member_snapshot` **deployed on QC4** (ep-frosty-lab) + `prisma generate` in tree b.
- Oracle: `qc-pos-p1.12` forced ×2 + unforced **63/64** (only X4), residue 0 — logs `scratchpad/p112/runs/final-forced1.log`, `final-forced2.log`, `final-unforced.log`;
  with proposed X4 edit locally **64/64** (`runs/x4-proposed-forced.log`). Typecheck 0 at code tip `251a01ec`. Other gates: see "Gates" above.
- Open (controller rulings needed, no oracle edit done by builder): (1) X4 key `pos-refund-<refundId>:<earnId>` — diff `scratchpad/p112/qc-pos-p1.12-X4.proposed.diff`;
  (2) qc-pos-p1.5 H5 couponCode vs ruling 12 — diff `scratchpad/p112/qc-pos-p1.5-H5.proposed.diff`; (3) qc-member-m2.7/m2.8 crash at fixture in base and branch alike (member-expected.json vs QC4 seed).
- Next action: controller rules on (1)+(2) → apply each as its own `test(...)` ORACLE-EDIT commit → re-run `qc-pos-p1.12` forced ×2 + unforced (expect 64/64) and `qc-pos-p1.5` (expect 21/21) → review + merge into `session/pos`.

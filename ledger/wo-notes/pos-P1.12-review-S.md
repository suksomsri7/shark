# P1.12 (S) review — reviewer Opus (account A) 9 Oct 2026 · head 80d86f6b (base 183b4e1b) · merge copy a2d2848d

**Verdict: MERGEABLE** — no money/VAT/idempotency/PII defect. F1 Medium must be fixed before P1.12U ships the 14A form; F2–F9 Low/Nit. Controller opened fix round `pos-prompt-accountB-P1.12-S-fix.md` (F1 F2 F3 F4 F6 F7 F8 F9) before the merge.

## Findings
- **F1 Medium** quick register duplicates legacy dashed phones: `register-member.ts:266-283` stores digits; `member/profile.ts:658-663` `findExisting` compares the exact stored string ⇒ existing `089-555-1234` + typed `089 555 1234` ⇒ second Customer. Fix in POS: pre-check `listMembers` over the full-length dashed/spaced forms ⇒ `created:false`.
- **F2 Low** `digitsPhone` `0066` branch (`register-member.ts:62-69`): `0066 81 234 5678` → `812345678` → `PHONE_INVALID`. Fix `d = "66" + d.slice(4)`.
- **F3 Low** `POINTS_CAPPED` can return `allowedPoints` < `burnMinPoints` (`register-member.ts:466-472`; wallet trim `wallet.ts:545-566`) ⇒ resubmit gives `POINTS_BELOW_MIN` (dead end).
- **F4 Low** fulfil (`register-member.ts:385-405`): FULFILLED in back office ⇒ `MEMBER_NOT_FOUND` (R13 says ok); double-tap ⇒ 2 audits or NOT_FOUND; `resolveRewardCtx` unordered `findFirst` across units (`reward/v2.ts:833-840`) vs benefits listing from the unit's REWARD link (`wallet.ts:253-262`).
- **F5 Low** race classification by Thai text (`register.ts:1978-1983`, `point/lots.ts:248/298` plain Error) — safe today (tx rolled back), member owner follow-up: typed error.
- **F6 Low** lookup cost ~40 queries per keystroke (≤ 6 `listMembers` + 8 × `pointBalanceForUnit` each resolving systems+settings); p95 ≤ 300 ms never measured.
- **F7 Low (oracle)** X4 after f7a63fd0 proves only "some REVERSE row < EARN", not exactly-one-per-EARN nor the pro-rata amount (`qc-pos-p1.12.mts:1572`).
- **F8 Nit** held carts refuse `memberChoices` (`register.ts:1091, 1479-1502`) instead of stripping (ruling 12).
- **F9 Nit** receipt selects full `phone` even with a snapshot (`receipt.ts:236`; used only masked at `:278`).

## ORACLE-EDIT judgement
b9804e00 = ruling 1 exactly · 251a01ec = Q7 (S3.29 still negative; S3.42 now positive tier parity) · f7a63fd0 legitimate but weak (F7) · f2d559ff still a real negative on quote/submit/held/benefits (`regParseCart` `register.ts:1058`).

## Verified OK (1–13)
Delegated actor (3 keys, STAFF, `unitAccess []` = shop-wide in `member/access.ts:62-83`, deny-list grep clean, real userId everywhere) · R1 gate order + called on every priced path (`register.ts:1256-1263`) · lookup routing/scoping/sort/≤8/masked · quick register keys/dates/args/audit/replay · quote: coupon base = createSale, single `saleWalletCart`, **VAT parity proven by hand** (7 %: `g·200 ≡ 107 mod 214` has no solution ⇒ no 1-satang drift), conflict mapping mirrors `service.ts:607-611` · submit: key checked before pricing, refusals before writes, tx mapping after rollback, replay with changed choices ⇒ `IDEMPOTENCY_CONFLICT` · createSale additive, extra UPDATE harmless · reversal chain untouched, erase SQL parametrised + scoped + idempotent, emitter payload matches (`privacy.ts:1396-1402`) · readers: snapshot first, no full phone, no double-count · merge with P1.13U disjoint, JSON keys unique th=en · boundaries dynamic facades, `pos→reward` F2 · messages 12 codes th+en · gates consistent; m2.7/m2.8 crash untouched by the diff.

## Follow-ups
- P1.12U: `PublicReceipt.discountSatang` already includes benefit lines (don't subtract twice) · handle `POINTS_BELOW_MIN` after cap (F3) · tier + big bill discount can give `BENEFITS_EXCEED_TOTAL` · recalled cart with `memberId` in a unit without MEMBER ⇒ `MEMBER_SYSTEM_MISSING` ⇒ detach on recall.
- Controller: re-run `qc-pos-p1.12` forced ×2 at the merge (at f2d559ff only 1 forced + 1 unforced at 64/64) · get `qc-member-m2.7/m2.8` running (re-seed by the member session) before main · old member receipts print balance 0 where no PointBalance row (accepted: 0 is true).
- Member owner: digit-normalised `findExisting` + phone index (F1/Q4) · typed point errors (F5) · wallet POINTS trim should respect `burnMinPoints` (F3).

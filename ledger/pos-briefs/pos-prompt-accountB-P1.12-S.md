# Prompt — P1.12 builder S (member at cart · lookup/quick register · benefits at pay · snapshot · readers · PDPA). Controller: oracle merged into session/pos at 3a4cf496. Lane 3, tree b.

---

You are the BUILDER S for POS work order **P1.12**. Server + actions + migration only — no pages/components (P1.12U). English reports, Thai code comments.

## Read first
- `ledger/pos-briefs/pos-brief-COMMON.md`, `pos-brief-LANE-RULES.md`.
- **`ledger/pos-briefs/pos-brief-P1.12.md`** — whole file; §0 facts, §2 R1–R17, §3 migration, §5 CD1–CD9, **§9 controller rulings Q1–Q8** are binding (gift-card tender is NOT in this card).
- **Oracle** `scripts/qc-pos-p1.12.mts` (64 checks) + `ledger/wo-notes/pos-P1.12-oracle.md` — the **Names table** is the contract (function/action names, input/result shapes, codes, audit types, keys): match it exactly. Do NOT edit the oracle except the ORACLE-EDITs ruled below (each in its own `test(...)` commit with the reason).
- `AGENTS.md` → Next docs before Next code. Memory rules: `"use server"` files export only async functions; `scripts/*.mts` typechecked by `next build`; POS reaches loyalty only via `@/lib/modules/member` (+ `coupon` as today) — never `voucher/point/stamp/giftcard` facades (ST2 enforces; `public-receipt.ts → point` is grandfathered).

## Controller rulings on the oracle's CONTROLLER-DECISION items
1. **Drop `VOUCHER_LIMIT`** (unreachable with `memberChoices.voucherId: string`). ORACLE-EDIT: V3 becomes "`voucherId` given as an array (any length) ⇒ `VALIDATION`, nothing written"; remove `VOUCHER_LIMIT` from the ST5 code list and from R16 keys. Count stays 64.
2. `PosSale.memberBenefits` = `{ lines (applyOnSale lines minus the COUPON line), pointsBurned }`, written by `createSale` whenever `applied` is non-null; walk-in ⇒ `null`. Accept as encoded.
3. Quote conflict reporting (`memberConflicts[]`, quote stays `ok:true`; `POINTS_CAPPED` only on submit with `allowedPoints`; walk-in invalid coupon ⇒ submit `COUPON_INVALID`). Accept as encoded.
4. Race loser (V8): `MEMBER_RIGHTS_CHANGED` target, `VOUCHER_INVALID` tolerated. Accept.
5. Delegated actor exactly the 3 keys, `unitAccess: []`, only inside `pos/register-member.ts`, never calling the deny-listed member admin functions. Accept.
6. **Live points balance in `receipt.ts` goes through the member facade**: add one small read-only export to the member module index (e.g. `pointBalanceForUnit(ctx, { customerId, unitId })` delegating to the point module) — the only member-module edit allowed in this card (additive; say so in the notes). No new `receipt.ts → point` edge.
7. Reward fulfilment: if the member facade already re-exports `fulfilV2` (or an equivalent), use it; otherwise call `@/lib/modules/reward` and register the new `pos → reward` edge where fitness/ST2 expect chokepoints. State which in the notes.
8. Public receipt member block = benefit lines + `points {earned, balance}` only, no name/code/phone. Accept.
9. Quick-register phone stored digits-only (normalise before `createMember`). Accept.
10. Audit `pos.member.registered` once per created customer; idempotent replay writes none. Accept.
11. `registerMemberBenefits` input/result keys exactly as the names table. Accept.
12. Held cart: **strip** `memberChoices` silently (do not refuse); `memberId + couponCode` round-trip.
13. W2 fulfil for another member's redemption ⇒ `MEMBER_NOT_FOUND` (404-not-403).
14. Lookup sort `-lastActivityAt` nulls last. Accept.
Drift: CD7 already holds (`refund.ts` releases the coupon on full refund) — verify with X-checks, add nothing. `listMembers` is not exported from the member index — add the export (additive, same rule as item 6). Q7: ORACLE-EDIT `qc-pos-p1.3` S3.29/S3.42 only if they actually break; separate `test(...)` commit; state the new count.

## Tree
- `/root/projects/shark-pos-b` — own rw node_modules; `.env.qc`/`.env.qc4` = QC4 (`ep-frosty-lab`, neondb_owner — print only the hostname). `git -C /root/projects/shark-pos-b status --short` must be clean (it is on `wip/pos-p1.12-oracle`), then `git -C /root/projects/shark-pos-b fetch origin session/pos && git -C /root/projects/shark-pos-b checkout -B wip/pos-p1.12 origin/session/pos && pnpm exec prisma generate` (run pnpm/prisma inside the tree). Always `git -C /root/projects/shark-pos-b …` / absolute paths.
- Other lanes run suites on the `posqc-coffee` tenant (lane 4 P1.13U is finishing; the controller runs batch gates in tree c). Your oracle uses its own temp tenant; `qc-pos-p1.3` and money suites may show restore/fingerprint drift from a parallel run — re-run once before calling it red.
- Never touch other worktrees or processes, never `pkill -f`. DB commands: `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh <cmd>`. Typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck`. No build/server/deploy/.env/Telegram. Scratch files only under `/tmp/claude-0/-root/b9f62cc5-a8cd-5bde-9353-94efac8b93a6/scratchpad/p112/` — never a bare file in the scratchpad root. Never run `seed-member-qc`, `migrate dev/reset`, `db push`, `migrate resolve`; never wipe QC4.

## Migration (QC4 only, additive)
`prisma/schema/pos.prisma`: `PosSale.memberSnapshot Json?`, `PosSale.memberBenefits Json?`. Migration folder `prisma/migrations/<timestamp>_pos_p112_member_snapshot/migration.sql` = exactly two `ALTER TABLE … ADD COLUMN … JSONB` lines, written by hand from a schema-to-schema `prisma migrate diff --script` (never from the DB). Read it, `prisma migrate deploy` on QC4 through the wrappers, `pnpm exec prisma generate`. Add the columns wherever `scripts/pos-qc-env.mts` lists PosSale columns.

## Build order (commit + push `wip/pos-p1.12` after each step; typecheck before each push)
1. Migration + generate (above). `qc-pos-p1.12 --no-db`: ST1 green.
2. `src/lib/modules/pos/register-member.ts` (new, server): delegated actor (ruling 5) · `registerMemberLookup` (R2 + Q4 digit normalisation, ≤ 8 items, sort ruling 14) · `registerQuickMember` (R4, ruling 9/10, existing phone ⇒ `created:false`) · `registerMemberBenefits` (R5 via `getWallet` + point settings, read-only) · `registerFulfilReward` (R13, ruling 7/13). R1 member-system check replacing the tenant-only check in `register.ts` (~1207): other tenant/system/MERGED/erased ⇒ `MEMBER_NOT_FOUND`, SUSPENDED ⇒ `MEMBER_SUSPENDED`, unit without member system ⇒ `MEMBER_SYSTEM_MISSING`. Actions in `register-actions.ts` (`"use server"`, async only) named per the names table; every action requires `pos.sale.create` at the unit (`PERMISSION_DENIED` otherwise). Audit types per the names table.
3. Quote + submit (R6–R8, R10–R11): `RegisterQuoteInput` gains `couponCode?` (lift Q12 in `register.ts` ~1020) and `memberChoices? { voucherId?: string; points?: int ≥ 0 }` (unknown keys ⇒ `VALIDATION`); extract the shared pure helper `saleWalletCart(lines, unitId, couponCode)` from `createSale` (`service.ts` ~556–570) and use it in both — **no behaviour change** (money suites + `qc-pos-p1.3` + `qc-member-m2.7/m2.8` unchanged); `regPrice` no longer refuses tiered members (`MEMBER_RIGHTS_UNSUPPORTED` ~1302–1306 goes away for the new register path); totals gain `tierDiscountSatang`, `memberDiscountSatang`, `memberConflicts[]`, `pointsToEarn`, `stampsToAdd` as the names table says; submit re-quotes, refuses requested-but-invalid benefits with the mapped codes, `POINTS_CAPPED {allowedPoints}`, `BENEFITS_EXCEED_TOTAL`, forwards `memberId/memberSystemId/memberChoices/couponSystemId+couponCode/memberSnapshot` into `createSale` (additive input only); `createSale` writes `memberBenefits` (ruling 2) and `memberSnapshot` (R9, caller-supplied) — never part of `samePayload`. Held carts: keep `couponCode` (add to `REG_QUOTE_KEYS` ~980 + parser), strip `memberChoices` (ruling 12). Refusal codes + `refusalMessageKey` + th/en keys (`pos.register.errors.*`, `pos.member.*`) per the names table (minus `VOUCHER_LIMIT`).
4. Readers (R15) + PDPA (R9): `receiptPayload` member block from `memberSnapshot` (fallback live Customer for older bills) + benefit lines from `memberBenefits` + live balance via the member export (ruling 6) — fixes the "last updated point system" bug; public receipt (ruling 8); `BillDetail.member {name, tierName, benefits[], pointsEarned} | null`; `member.erased` POS hunk in `outbox-consumers.ts` (~1256, smallest, after the CRM handler, idempotent).
5. ORACLE-EDITs ruled above (V3/ST5; p1.3 only if needed), each its own `test(...)` commit.

After each step: typecheck; `qc-pos-p1.12` forced; suites of what you touched. Before "done": `qc-pos-p1.12` forced ×2 + unforced **64/64**, residue 0, drain-twice checks green; `qc-pos-p1.3`, `qc-pos-p1.5`, `qc-pos-p1.8`, `qc-pos-p1.11`, `qc-pos-p1.13`, `qc-pos-p1.15`, `qc-pos-p1.16`, `qc-member-m2.7`, `qc-member-m2.8`; money suites COMMON §7 (`qc-pos-account`, `qc-account-cpa`, `qc-restaurant-money`, `qc-shop-refund`, `qc-hotel-money`, `qc-ticket-money`, `qc-subscription-money`) identical before/after; `qc-hf-pos-page-authz`; `pnpm fitness` with and without env; `scripts/fitness-pos.mts`; typecheck 0. Every log carries a `tree=/root/projects/shark-pos-b head=<sha>` header under `scratchpad/p112/runs/`.

## Done =
- `ledger/wo-notes/pos-P1.12.md`: migration SQL, per-step results, deviations from the brief with the rule they touch, contract summary for P1.12U (action names, input/result shapes, refusal codes, keys, what the UI must send), follow-ups (member-owner index request, receipt bug fixed, etc.), gate exit codes.
- Last push of `wip/pos-p1.12`; report ≤25 lines with the head SHA. Do not merge, do not touch `session/pos` or `main`.

# POS MAIN-MERGE — `origin/main` 71a1f363 → POS line (base `session/pos` d85ea5c3)

> builder (account B) · tree b `/root/projects/shark-pos-b` · branch `wip/pos-main-merge` · 10 Oct 2026
> merge commit **2c64d972** (parents d85ea5c3 + 71a1f363) · O24 ledger line c64b36d8 · gates ran on c64b36d8 (clean tree)
> `origin/session/pos` was 1c613e52 at fetch (= d85ea5c3 + one ledger-only commit) — merged on d85ea5c3 as the prompt says.

## Pre-checks
- merge-base 0237e3e5 (git reports multiple merge bases and picks that one) · `git diff 0237e3e5 origin/main -- package.json pnpm-lock.yaml` = **empty** ⇒ no `pnpm install`.
- Conflicts were exactly the 7 the controller listed. Ledger had no conflicts.

## Conflict resolutions (every POS hunk + every main hunk kept)
| file | resolution | markers kept |
|---|---|---|
| `scripts/qc4.sh` (add/add) | **Same blob on both sides** (56532177). Only the mode differed: POS 100644, main 100755 ⇒ main's 755 taken. The file is unchanged, so both call forms (`iso.sh [env QC_FORCE=1] bash scripts/qc4.sh env GATE_LOCK_FILE=… with-gate-lock.sh …` and the plain form) and the QC4 env guard (ep-frosty-lab only, prod/QC1 refused) work as before. No owner line needed. | — |
| `src/app/api/cron/hourly/route.ts` | union: imports `forceCloseStaleShifts` + `expirePaymentIntents` + `drainAll` · body POS P1.9 S12 + POS P1.7 R5, then main C5.4 drainAll · response `posShiftsForced, posIntentsExpired, outboxDrained` | `POS P1.9 ▸ S12` · `POS P1.7 ▸ R5` · `C5.4 (L3-M1)` |
| `src/app/app/approvals/BulkApprovals.tsx` | POS P1.15U split kept (POS card / plain row). Main HF-HR-0 round 5b `refusedOf()` per-row alert added to the plain row exactly as main has it, **and** to the POS card under the meta line (otherwise a refused POS request would show no per-row reason, so main's behaviour would be lost for POS rows) | `POS P1.15U ▸ ภาพ 21A` · `HF-HR-0 ▸ รอบ 5b` · `MAIN-MERGE ▸` |
| `src/components/module-tabs.tsx` | signature `{ items: {href,label,perm?}[]; "data-testid"?: string }` · `<div … data-testid={testId}>{visibleTabs(items, perms).map…` | `POS P1.17 U` · `CRM C5.5-fix2 ▸ RV2-7` |
| `src/lib/ai/tools.ts` | one `where`: POS `docType: "SALE"` + main `...unitWhere(ctx.actor)` | `MAIN-MERGE ▸` |
| `src/lib/modules/approval/index.ts` | both sides added the same `export { resolvePolicy } from "./service"` ⇒ **one** export with both comments (a duplicate export would not compile) · POS P1.18 `listPoliciesForEntities` kept | `POS P1.15` · `CRM C5.5 ▸ RV-6` · `POS P1.18 ▸ R10` · `MAIN-MERGE ▸` |
| `src/lib/modules/approval/service.ts` | `DecideResult` = POS `code?/message?` + main `reason?` · bulkDecide reason = `SELF_APPROVAL` message (POS P1.18 K4) → else `r.reason` (HF-HR-0 R5.1) → else `bulkFailReason(status)`. Both self-approval guards in `decide` (POS K4 and main `isOwnHrSubject`) were auto-merged and stay in place. | `POS P1.18 ▸ K4` · `HF-HR-0 ▸ R5.1` |

**Semantic merge fix (not a textual conflict; done because the pre-commit fitness blocked the merge):** main's fitness **F15.1** (CRM C5.5-fix4 ratchet, OWED list empty, "no additions allowed") rejects a raw `equals … mode: "insensitive"`. POS P2.1 S (bb3f96f1) added one in `account/service.ts ensureNamedCustomerContact`. It is now `name: ciEquals(name)` (`ciEquals` was already imported on main), which is the same conversion main made on its own account sites. Effect: `%`, `_` and `\` in a platform name match literally. The advisory-lock key `lower(name)` is unchanged. Marker `MAIN-MERGE ▸`. No other fitness finding.

## prisma
- `pnpm exec prisma generate` (tree b) ok.
- QC4 (`ep-frosty-lab`) `migrate status` → "172 migrations found · Database schema is up to date"; `migrate deploy` → **"No pending migrations to apply"**, exit 0. The 4 main migrations were **already on QC4** (`_prisma_migrations`: `20261103000000_crm_perf_indexes` 2026-09-27 23:50Z · `20261104000001/2/3_account_journal_no_*` 2026-10-08 05:00Z, applied_steps 1 each), so **0 were applied by this lane**. QC5 not touched.

## O24
**Yes, it is fixed on the accounting side.** On the merged tree `account/gl.ts` no longer has `nextJournalNo` (`count()+1`). All 3 journal writers (`gl.ts:243` commitEntry · `:1008` · `:1086` reversals) call `allocateJournalNo`, which runs `SELECT account_alloc_journal_no(systemId, book, prefix, width)`: a per-(system, book) sequence (C5.4-N) that skips numbers already taken, with the alloc lock from C5.5-fix3a (migrations …0002/…0003). A line was appended under the O24 lines in `POS-OWNER-PENDING.md` (old lines kept). `qc-pos-account` 16/16 and `qc-account-cpa` 107/107 are green on the merged tree. Note: the original O24 at line 63 (gift-card VAT → P2.9) is a different issue and is **not** affected.

## P1.3 S5.12 (trip-wire) — red, as designed
- `qc-pos-p1.3` **127/128**. The only red is `P1.3-S5.12`: "ไบต์ต่าง: src/lib/modules/pos/register-ui.tsx=d661c7edf2ab, src/lib/actions/pos.ts=e076ca3d8219 · แถวหาย: -". The 3 legacy registry rows are present.
- Cause = main's own edits (both files on the merged tree are byte-identical to `origin/main`): **3a93a773** "HF-O23: legacy POS register — prefix client idempotency key (pos1:)" (both files) + **70ab5b86** "HF-O23 R2: post-create ownership check in registerSaleAction" (`actions/pos.ts`). Main's other commits on these files (976c0625 / c7dd2fd4 / b5a50b98, HF-POS-PAGES) were already in the POS base.
- Oracle **not edited**. **Proposed ORACLE-EDIT** (`scripts/qc-pos-p1.3.mts` `LEGACY_SHA`, comment "base a670d313 + main HF-O23 3a93a773/70ab5b86 via MAIN-MERGE 2c64d972"):
  - `[LEGACY_UI]: "d661c7edf2abc93a35632e02b3dcc4fae9a6c1739739efa350ce451eafb66cfb"`
  - `[LEGACY_ACTIONS]: "e076ca3d82198583c0aedc0ccad8e57563d0b3606d44526c80fe9640aa563d14"`

## P1.1b part B
- What it asks (`pos-P1.1b.md` "Part B — exact hunks (after CRM lands)" · HANDOVER-2026-10-10-POS-P1 §2/§152 · RESUME 04:59Z): once CRM is on main and main is merged, do 2 sites in `account/service.ts`: `updateAccountProductSalePrice` → `legacy.writeAccountProductSalePrice` in a tx, and `createAccountProductWithSalePrice` → `legacy.createAccountProduct` in a tx. Then empty `CATALOG_WRITER_BASELINE` in `fitness-pos.mts`. The oracle's PART-B guard then opens S2.11b + S2.19.
- Verified on the merged tree: CRM is in (main 71a1f363) · both functions exist with the **same bodies the hunks expect** (`account/service.ts:613` `prisma.accountProduct.updateMany` · `:629` `prisma.accountProduct.create`; main's 6 commits to this file did not touch them) · `catalog-legacy.ts` exports `createAccountProduct(tx, data)` `:395` and `writeAccountProductSalePrice(tx, …)` `:417` · edge `account→pos` exists in `fitness.mts` ALLOWED_EDGES (`:469`) · baseline still `{"src/lib/modules/account/service.ts": {"AccountProduct.price": 2}}` · `qc-pos-p1.1` reports `partBStarted:false`, so S2.11b/S2.19 SKIP. ⇒ **Part B can now be applied as written**. Not done in this lane (it is a code WO, not merge resolution).
- `qc-pos-p1.1` **177/178**. The red is **P1.1-S2.33** (G4c static "no ping-pong": `pos/catalog*.ts` must not import legacy writer modules), actual `pos/catalog-recipe-actions.ts → @/lib/modules/inventory` (`searchItems`). **Not caused by main**: the file comes from POS P2.3U (07a0c091 / 0f7f06ae, merged a7561b5c) and is byte-identical on d85ea5c3. The check is static, so it is red on `session/pos` d85ea5c3 too. The last p1.1 green run (gates67 @b2c2aa84) was before P2.3U merged. Controller ruling needed: (a) ORACLE-EDIT S2.33 to exempt the read-only `inventory.searchItems` import in `catalog-recipe-actions.ts` (it is a search, not a writer), or (b) route the search through a non-`catalog*` file (P2.4U/P2.3U follow-up).

## Gates (head c64b36d8 · logs `scratchpad/mainmerge/runs/gates-c64b36d8/` · QC4 + `/tmp/shark-gate-pos.lock`)
| gate | result | expected |
|---|---|---|
| typecheck (iso, 5632 MB, flock /tmp/pos-gate.lock) | clean rc 0 | clean |
| fitness env / no-env | 50/50 · 50/50 | 41 before main (main adds 9 checks) |
| fitness-pos | 8/8 | 8 |
| qc-pos-p1.1 | **177/178** ❌ S2.33 (pre-existing P2.3U, see above) · S2.11b/S2.19 SKIP PART-B | 178 |
| qc-pos-p1.3 | **127/128** ❌ S5.12 (main HF-O23, ORACLE-EDIT proposed) | 128 |
| p1.2 55 · p1.5 21 · p1.6 48 · p1.7 32 · p1.8 49 · p1.9 53 · p1.10 40 · p1.12 72 · p1.13 33 · p1.14 30 · p1.15 39 · p1.16 28 · p1.17 40 · p1.18 81 | all green rc 0 | = |
| p2.1 55 · p2.2 42 · p2.3 46 · p2.4 49 · p2.8 60 | all green rc 0 | = |
| qc-pos-products 24 · qc-hf-pos-page-authz 56 · qc-pos-inventory 25 | green | = |
| money: account-cpa 107 · pos-account 16 · shop 15 · shop-refund 12 · clinic-refund 13 · restaurant (loop ผ่าน) · restaurant-money 6 · -pay 19 · -void 11 · hotel-money 5 · ticket-money 6 · subscription-money 14 | all green rc 0 | = |
| qc-member-m2.6 / m2.7 / m2.8 (**R14 exceptions**) | rc 1: setup crash `TypeError: Cannot read properties of null (reading 'role')` | same signature as p118-close-b 9 Oct (m2.7/m2.8): QC4 member seed, not this merge |
| visual-pos `all --states --dry` (CI=1 only here) products/register/sales/settings × owner/cashier | rc 0 ×8 · shots 42/3 · 107/101 · 30/30 · 47/47 | rc 0 |

Product code was not changed beyond the merge resolution and the F15.1 semantic fix above. No push to main, no deploy, no servers/build.

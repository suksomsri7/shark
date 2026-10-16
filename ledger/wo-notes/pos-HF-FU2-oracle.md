# POS HF-FU2 — oracle notes (`scripts/qc-hf-fu2.mts`)

Oracle writer · account A · 16 Oct 2026 · tree `/root/projects/shark-pos-d` · branch `wip/pos-hf-fu2-oracle` from `session/pos` **72669941** (product tree = c5fc223b + CD-FU2a `qc-pos-p2.10` ST2 `--diff-filter=M`).
Contract: `ledger/pos-briefs/pos-brief-HF-FU2.md` ⚠️1–4 · §1 · §2 · §3 · §4 · **§8 controller rulings 1–10 (binding)**. Lane pin of the suite = `72669941` (`qc-hf-fu2.mts:182`).

**24 checks** = ST1 ST2 · DP1 DP2 DP3 (A DEP-1 UI, pure) · PR1 PR2 PR3 (O PRC-1, DB) · DS1 (R, static) · DS2 (R D1b PAR, DB + static) · PB1 (W PRC-3 badge, static) · RG1–RG8 (U runner) · MF1 (V manifest) · AC1 AC2 (B ACC-1, DB) · Z1 Z2.
Modes: `--list` (no DB, no imports) · `--no-db` = ST1 ST2 DP1–3 DS1 PB1 RG1–8 MF1 (16, never loads prisma) · DB run SKIPs (exit 0 + reasons) until `depositBlame` (deposit-blame.ts), `commission_other_book` (refund-consumer.ts) and `other-book` (inside `applyExternalChannelCommission`) exist · `QC_FORCE=1` runs everything (manifest mode = forced).
Fixtures: temp tenant `posqc-hffu2-<rand>` · units A B (SHOP, POS) · LINEMAN (PLATFORM 30%) on A and B · book 1 (linked to the POS, VAT) + book 2 · products my mx mz(unit A) mw mv mu mt (catalog, base ฿100) · devices D1 (OPEN shift of the owner) and D2 (no shift). Module functions only; Prisma direct only for Tenant/BusinessUnit/User/Membership/AccountSystemLink (relink for AC1) and reads. RG = temp git roots + temp result dirs under `$TMPDIR/hffu2-rg-*` (removed in `finally`; Z1 checks it).

## Names table (exactly as the oracle calls them — builder must match)
| # | name | shape / where |
|---|---|---|
| 1 | `depositBlame` | **new pure** `src/components/pos/register/deposit-blame.ts` export `depositBlame(input: { code: string; depositId?: string \| null; rows: { id: number; depositId: string; receiptNo: string \| null; needsLast4: boolean; memberLinked: boolean; l4Checked: boolean }[]; sentStripped: boolean; notOwnerSet: string \| null }): { drop: number[]; reask: number[]; reaskNote: "wrong" \| "again" \| null; note: string \| null; notOwnerSet: string \| null; lookup: boolean }`. `id` = PayRow.id, `depositId` = PosDeposit.id. `drop` = rows to remove (any order) · `reask` = rows that must re-enter 4 digits, **in input order** (first = `reenterLast4` target) · `note` = depNote key or null · `notOwnerSet` = new value of the `notOwnerSet` ref, format = row ids ascending joined by `,` (today's `sig()`) · `lookup:true` = caller runs `depDropClosed` as today. Pure = value imports only `*-shared` modules (no prisma/db/core/next/react/actions/relative non-shared), no `Date.now`/`new Date()`/`Math.random` (loaded in `--no-db`). |
| 2 | with `depositId` (DP1 DP2) | NOT_FOUND ⇒ drop the named row(s), note `errors.depositNotFound` · LOCKED ⇒ drop the named row(s), note `errors.depositLocked` · NOT_OWNER on a `memberLinked` row ⇒ drop it, note `errors.depositNotOwner` · NOT_OWNER on a walk-in row ⇒ `reask:[row]`, `reaskNote` = `sentStripped ? "again" : "wrong"`, no drop · never touches another row (also when `notOwnerSet` = the current set) · `lookup:false`. `notOwnerSet` is not asserted on this path. CLOSED with depositId is not asserted. |
| 3 | without `depositId` (DP3 golden) | `undefined` / `null` / `""` ⇒ exactly the heuristic of `InterimPayDialog.tsx:759–805` at 72669941 (reproduced as `goldenBlame` in the suite): LOCKED ⇒ drop every `needsLast4` row, note `errors.depositLocked`, notOwnerSet unchanged · NOT_OWNER ⇒ branches (same set again + member rows ⇒ drop member rows, set = rest · same set again ⇒ drop all `errors.depositNotOwnerAgain` · suspects ⇒ reask (`again` if stripped) set = sig(all) · member rows ⇒ drop · l4 rows ⇒ reask wrong · else drop all `errors.depositNotOwner`). NOT_FOUND / CLOSED ⇒ `lookup:true`, drop [] reask []. 600 seeded cases, every field compared. |
| 4 | dialog statics (DP1) | `export type PayError = { …; depositId?: string }` · `payErrorPinMeta` body copies `depositId` (callers RegisterScreen:1859 · TableCheckout:268 · OrderPay:64 unchanged — ST1) · `InterimPayDialog.tsx` imports `./deposit-blame` (or the `@/components/pos/register/deposit-blame` alias) and calls `depositBlame(` · marker `POS HF-FU2 ▸ DEP-1` |
| 5 | `bulkChannelMarkup` PRC-1 | `catalog.ts:2549` · `unitId === null` and the product (not a variant parent path tested) has outranked `(null, X)` notSold rows: write `(code, null)` at the markup price **and** `(code, X, priceSatang:null, notSold:true)` for each such X without an existing `(code, X)` row, same tx · **one** audit `pos.product.channelPrice` per product, `after.via:"bulk"`, `after.rows` lists every written row (PR1: 2 rows · PR3 mu: 3 rows) · result `{written: products written, skipped, productIds}` · an existing priced `(code, X)` is never touched · skip stays for a `(code, null)` notSold prev and for unit-scoped products (`unitId` set). Markup used: +1000 bp roundTo 1 ⇒ 10000 → 11000. |
| 6 | matrix (PR) | `unitPriceMatrix(ctx, {productIds:[p], unitIds:[A,B], channelCodes:["LINEMAN"]})` cell: `refusal` or `unitPriceSatang` (A = CHANNEL_NOT_SOLD, B = 11000 in PR1) |
| 7 | D12b (DS1) | `use-display-publish.ts:147` the object passed to `publishDisplayStateAction(…)` has no `deviceId` key, still has `deviceCode` |
| 8 | D1b PAR (DS2) | `display-actions.ts` `publishDisplayStateAction` keeps `deviceId?: string` in its arg type, uses `displayPublisherDevice(`, refuses `DEVICE_NOT_REGISTERED`, never reads `args.deviceId` · `display.ts` `displayPublisherDevice({tenantId, unitId}, {userId}, code)` = null for a registered device without an OPEN shift of the user (and for the right device at another unit), = the code for the user's OPEN-shift device |
| 9 | PRC-3 badge (PB1) | `BranchCompare.tsx` `{/* POS HF-FU2 ▸ PRC-3 ◂ */}` · reads `c.origin` · distinguishes `"own"`/`"inherited"` (or uses keys `chipOwn`/`chipInherited`) · `data-testid` starting `pos-prod-compare-origin` |
| 10 | ACC-1 (AC1) | `applyExternalChannelCommission` (account/index.ts:729) reverse returns `{posted:false, reason:"other-book"}` when the sale's COMMISSION was posted in another book · `refund-consumer.ts` (call at :125) writes **one** `logOps("WARN", …)` per refund: `OpsEvent.level = WARN`, `tenantId` = shop, `source` or `message` contains `pos.account.commission_other_book`, `message`/`detail` contain the refundId **and** the saleId · replaying `consumers["pos.sale.refunded"]` ×2 (still linked to book 2) keeps 1 · no COMMISSION / COMMISSION_REFUNDED JV in book 2 and no COMMISSION_REFUNDED in book 1 · refund outbox event DONE |
| 11 | runner (RG) | `scripts/pos-gates-all.sh --verdict <dir>`: (a) `len(ids) < total − passed` ⇒ `RED <name> …` · (b) accepted with CRASH or `*-ERR` in `checks` needs `accepted.match` (string) present in `<name>.log`, else `RED <name> …` · (c) HEAD.txt token `only=<csv\|->` (whitespace token anywhere in HEAD.txt; absent ⇒ `-`); `SET partial` with `only=-` ⇒ RED; with `--only` the row count must equal the listed names · (d) every `<name>.log` line 1 = HEAD.txt line 1 else a RED line containing `log-head` · exit 0 iff `VERDICT green`. **The runner must stay self-contained for `--verdict`**: the oracle copies the tree's `pos-gates-all.sh` byte-for-byte into a temp git root next to a manifest it writes (RG3/RG4 need manifests the tree will never have) — only `$ROOT/scripts/pos-gates.json` and git of `$ROOT` may be read. |
| 12 | manifest (MF1) | `scripts/pos-gates.json`: `qc-pos-p2.14` has no `accepted` · every accepted entry whose `checks` has `CRASH` or `*-ERR` has `accepted.match` (non-empty, contained in `/root/pos-runs/gates111-c-20261016T175326Z/<name>.log` when that log exists) · `{ "suite": "qc-hf-fu2", "mode": "forced" }` listed |
| 13 | OP lines (ST2) | `POS-OWNER-PENDING.md` lines **new vs 72669941** containing `HF-FU2`: `QR-4`+`P3` · `RPT-6`+`P4` · (`UI-6`\|`overflow`)+`developers/kanban` · …+`developers/account` · …+`developers/member` · `D1c`+`P3` · `D11`+`P3`; table rows `\| W6 \|`…`CD-F7` · `\| W7 \|`…`one-OPEN-shift` · `\| W8 \|`…`commission_other_book` (already present) · new `pos.json` keys: th set = en set, th Thai, en no Thai |
| 14 | ST1 pins | vs 72669941: `prisma/` · `scripts/pos-sale-contract.json` · `pos/(register*.ts(x) \| service.ts \| tender*.ts \| payment-intent.ts \| held-cart.ts \| deposit.ts)` · `outbox-consumers.ts` · `core/outbox.ts` · `proxy.ts` · RegisterScreen/TableCheckout/OrderPay unchanged · createSale call counts unchanged in changed `src/` files · every hunk (`git diff -U0`) of a changed `src/**/*.ts(x)` and of `scripts/pos-gates-all.sh` has `HF-FU2` in its added lines or ±3 lines; a new `src/` file has it at least once (JSON / ledger / `scripts/qc-*.mts` exempt) |

## Expected red-before (forced run at 72669941 · `ledger/wo-notes/HF-FU2-red.txt`)
**15/24 red · 9 green = PAR ST1 · PR2 · DS2 · RG1 · RG7 · RG8 · AC2 · Z1 · Z2** (PAR 9/9). Residue 0 · leaks 0 · fingerprint unchanged · guard hits 0. `--no-db` 4/16 green (ST1 RG1 RG7 RG8).
- ST2: no new HF-FU2 OP lines (W6/W7/W8 rows already present). DP1–DP3: `deposit-blame.ts` missing (+ DP1 statics: no `PayError.depositId`, meta drops it, no call, no marker). DS1: `deviceId: cur.deviceCode` still sent. PB1: no marker / origin / testid.
- RG2: `qc-account-api-ai-skill` total 10 passed 7 failed [E1-K2.1] ⇒ green today · RG3: `qc-account-api-ai-external` CRASH without match ⇒ ACCEPTED · RG4: match absent from log ⇒ ACCEPTED · RG5: partial `only=-` / legacy / 1-of-2 ⇒ green · RG6: log-head mismatch ⇒ green. MF1: p2.14 accepted present · 10 CRASH/ERR entries without match · no `qc-hf-fu2` entry.
- PR1: written 0 skipped 1 (my skipped), B/LINEMAN 10000, no audit. PR3: written 1 skipped 3 (only mv). AC1: WARN 0 (silent `no-commission`); book 2 holds only `PosSale#<refund>#REFUNDED`; no cross-book commission JV (green parts).
- Positive control: with a transient reference `deposit-blame.ts` copied from scratch and removed right after (never committed; `git status` clean afterwards) DP2 and DP3 went green (600/600 golden) and DP1's pure part went green — the golden and the named-row rules are consistent. RG2–RG6 have no positive control (needs the builder's runner); RG1/RG7/RG8 green prove the temp-root plumbing (HEAD/dirty match, full set, JSON_SUMMARY parse).

## Drift vs brief at 72669941
1. **Count.** §4 lists 22 ids (ST1 ST2 · DP1–3 · PR1–3 · DS1 · RG1–8 · MF1 · AC1 AC2 · Z1 Z2) while §4/prompt say 24. Added **DS2** (DS1's "D1b refusal still holds (PAR)" needs DB; DS1 must run in `--no-db`) and **PB1** (§8.6 put the PRC-3 badge IN; §4 had no id). CONTROLLER-DECISION 1.
2. **Red count** 15/24, not ≈17: ST1 is PAR (no hunks at base ⇒ green), DS2 is PAR; DP3 cannot be green before the build (module missing) — it is golden-equal *after* the build, not PAR-before.
3. **CRASH/ERR entries = 10, not 9**: ai-external · read-docs · read-finance · read-gl · read-master · **settings** (its `checks` = S1.1–S1.8 + CRASH) · m2.6 · m2.7 · m2.8 · m1.7. MF1 requires `match` on all 10.
4. Line refs re-checked at 72669941 (same product tree as 3d2f6db8): InterimPayDialog `PayError :79` · `payErrorPinMeta :81` · NOT_FOUND/CLOSED `:756` · NOT_OWNER `:759–797` · LOCKED `:798–805` · rebuilt rows `:850`; `catalog.ts` bulk `:2549` (outranked `:2605–2620`, skip `:2637`), matrix origin `:2876`; `use-display-publish.ts:147` (OP :257 says :144); `refund-consumer.ts:122–137` (call `:125`); `account/index.ts:729`; gl `postExternalChannelCommission` other-book `:1937`.
5. Z2 "non-temp fingerprint identical" is printed as data, not judged (QC4 is shared with other POS lanes; same as qc-hf-fu) — Z2 judges leaks of this run outside the temp tenant.
6. "ops WARN" = `logOps("WARN", …)` ⇒ `OpsEvent` (core/ops.ts); OpsEvent has `tenantId`, so Z1's tenant sweep removes it.
7. The "hidden PL2.1" fixture (RG8) uses the first non-CRASH accepted suite other than `qc-pos-p2.14` (= `qc-account-api-ai-skill` at base) with a made-up id `QCX-HIDDEN-1`; RG2/RG7 use the same suite.

## ORACLE-EDIT list (file:line at 72669941)
- **Builder (own `test(pos)` commit, counts before/after — ruling 4):** `scripts/qc-pos-p2.14.mts:2248` (P2 block `:2238–2252`, check `P2.14-P2`): the Y assertion "no `(LINEMAN, null)` row for my" becomes "a `(LINEMAN, null)` row only together with a carried `(LINEMAN, A, notSold)`"; keep `:2249–2250` (A = CHANNEL_NOT_SOLD); add B = markup price (`matrixCell(PP.my!, "B", "LINEMAN")` → 11000). Count 60 unchanged.
- **Controller re-pin batch after the HF-FU2 merge** (one `test(pos)` commit, marker `// ORACLE-EDIT ผู้คุม <date> (HF-FU2 lane-pin)`, counts unchanged):
  - `scripts/qc-hf-fu.mts:233` `LANE_PIN = "c5fc223b"` (ST1 hit: `InterimPayDialog.tsx` NEVER_TOUCH `:289`; `refund-consumer.ts` via `NEVER_TOUCH_GLOB :296` refund*) — 29.
  - `scripts/qc-pos-p2.12.mts:270` `LANE_PIN = "c5fc223b"` (ST1 hit: InterimPayDialog `:361` · `components/pos/display/` `:367` (use-display-publish) · `pos/refund*` `:365` · `modules/account/**` `:366`) — 33.
  - `scripts/qc-pos-p2.11.mts:267` `LANE_PIN = "05975437"` (ST4 `:50` P2.11 marker rule on `refund*` + `modules/account/**` — ACC-1 hunks carry `HF-FU2` only) — 34.
  - `scripts/qc-pos-p2.10.mts:221` `LANE_PIN = "3d2f6db8"` (ST2: InterimPayDialog lines removed outside P2.10 blocks `:347–356` · `qc-pos-p2.14.mts` modified (M) by the builder's ORACLE-EDIT `:360`) — 13.
  - `scripts/qc-hf-fu2.mts:182` `LANE_PIN = "72669941"` (this suite — re-pin at the first later card that touches its pins).

## CONTROLLER-DECISION
1. 24 = §4's 22 + **DS2** + **PB1** (ids beyond §4). Accept, or drop to 22 and fold DS2 into DS1 (then `--no-db` cannot run DS1 alone).
2. MF1 requires `match` on **10** entries (settings included). Accept, or exempt `qc-account-api-settings` (mixed S1.x + CRASH).
3. RG uses temp git roots with a byte copy of the runner ⇒ the hardened runner must keep `--verdict` self-contained (names table 11). If the builder adds a manifest-path override instead, an ORACLE-EDIT can switch RG to it.
4. Transient positive control for DP (reference module in the tree for one `--no-db` run, removed, never committed). Disclosed here; no other file outside the suite/ledger was touched.
5. On this oracle branch `qc-pos-p2.14` G1 is red until the builder appends `qc-hf-fu2` to `pos-gates.json` (G1 requires every `qc-hf-*`); `qc-pos-p2.10` ST2 ignores the new file (`--diff-filter=M`).

## Match strings for the builder (from `/root/pos-runs/gates111-c-20261016T175326Z/<name>.log`)
| entry | `accepted.match` |
|---|---|
| qc-account-api-ai-external | `Cannot read properties of undefined (reading 'slice')` |
| qc-account-api-read-docs | `ไม่พบระบบที่จะผูกคีย์ในร้านนี้` |
| qc-account-api-read-finance | `ไม่พบระบบที่จะผูกคีย์ในร้านนี้` |
| qc-account-api-read-gl | `ไม่พบระบบที่จะผูกคีย์ในร้านนี้` |
| qc-account-api-read-master | `ไม่พบระบบที่จะผูกคีย์ในร้านนี้` |
| qc-account-api-settings | `No element found for selector: [data-testid="api-key-name"]` |
| qc-member-m2.6 | `Cannot read properties of null (reading 'role')` |
| qc-member-m2.7 | `Cannot read properties of null (reading 'role')` |
| qc-member-m2.8 | `Cannot read properties of null (reading 'role')` |
| qc-member-m1.7 | `Cannot read properties of null (reading 'role')` |

## `--list`
```
HF-FU2-ST1 PAR · HF-FU2-ST2 S · HF-FU2-DP1 P · HF-FU2-DP2 P · HF-FU2-DP3 P · HF-FU2-PR1 X4 · HF-FU2-PR2 PAR · HF-FU2-PR3 X4 ·
HF-FU2-DS1 S · HF-FU2-DS2 PAR · HF-FU2-PB1 S · HF-FU2-RG1 PAR · HF-FU2-RG2 G · HF-FU2-RG3 G · HF-FU2-RG4 G · HF-FU2-RG5 G ·
HF-FU2-RG6 G · HF-FU2-RG7 PAR · HF-FU2-RG8 PAR · HF-FU2-MF1 S · HF-FU2-AC1 X1 · HF-FU2-AC2 PAR · HF-FU2-Z1 PAR · HF-FU2-Z2 PAR
X-coverage: PAR=9 S=4 P=3 X4=2 G=5 X1=1   (24)
```

## Commands + results
- `env -C /root/projects/shark-pos-d pnpm exec tsx scripts/qc-hf-fu2.mts --list` → exit 0, 24 ids.
- `env -C … TMPDIR=<scratch> pnpm exec tsx scripts/qc-hf-fu2.mts --no-db` → exit 1, 4/16 (ST1 RG1 RG7 RG8 green).
- forced QC4 (command in HF-FU2-red.txt) → exit 1, 9/24, PAR 9/9, residue 0, leaks 0.
- typecheck: see the last section.

## Typecheck
`env NODE_OPTIONS=--max-old-space-size=8192 ISO_MEM=10500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck` (tree d, suite included) → **exit 0** (no lock wait; ~45 s).

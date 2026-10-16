# POS HF-FU2 — builder notes (account A · lane 2 · tree d · branch `wip/pos-hf-fu2`)

Base `session/pos` **72669941** + oracle merge `origin/wip/pos-hf-fu2-oracle` **cd49da8c** (merge ee381a60). Contract = names table 1–14 of `pos-HF-FU2-oracle.md` · brief §8 rulings 1–10 · CD-FU2b (1)–(5) in the builder prompt.

## Commits (one per step)
| step | commit | item |
|---|---|---|
| 1 | ee381a60 | merge oracle cd49da8c · `prisma generate` (tree d node_modules) · red-before re-run on base: forced 9/24 (= oracle's red-before, PAR 9/9) · `--no-db` 4/16 |
| 2 | 75910eca | U runner + V manifest |
| 3 | 47db146e | R D12b |
| 4 | b2b4d7a6 + 82b6493f | O PRC-1 + ORACLE-EDIT (own `test(pos)` commit) |
| 5 | bb0cead3 | A DEP-1 UI |
| 6 | 86a9ce5c | W PRC-3 badge |
| 7 | f7b2eedd + 76cf9e05 | B ACC-1 (+ replay refinement, see deviations) |
| 8 | 59e2be5a + this file | ledger OP lines + notes |

## Files / hunks per item (all hunks carry `POS HF-FU2 ▸ <id> ◂`)
- **U** `scripts/pos-gates-all.sh`: header comment (rules a–d) · verdict python: `partial` flag, HEAD.txt line 1 + `only=` token (absent ⇒ `-`), manifest name list · `ids_of` returns `(ids, total, passed)` · (c) `RED SET partial … only=-` / `RED SET only …` (row names must equal the `--only` set, count included) · (d) per row: name must be in the manifest, no duplicate rows, `<name>.log` line 1 must equal HEAD.txt line 1 (`RED <name> … log-head`) · (a) accepted rc 1: JSON_SUMMARY without total/passed = red, distinct ids < total−passed = red "รายการล้มสั้นกว่า total−passed" · (b) accepted.checks with CRASH/*-ERR ⇒ `accepted.match` string required and must occur in `<name>.log` · run mode HEADLINE gains ` only=<csv|->` (so HEAD.txt = every log line 1) · `--verdict` prints ACCEPTED lines too. Self-contained: reads only `$ROOT/scripts/pos-gates.json` + git of `$ROOT` (CD-FU2b 3). Old dirs (no `only=`) still judged (= `only=-`): verified on a copy of gates111 (rules applied, no crash).
- **V** `scripts/pos-gates.json`: `match` on all **10** CRASH/ERR entries (strings = oracle table, each verified present in `/root/pos-runs/gates111-c-20261016T175326Z/<name>.log`) · `qc-pos-p2.14.accepted` removed · `{ "suite": "qc-hf-fu2", "mode": "forced" }` inserted after `qc-hf-tx` (97 entries; p2.14 G1 green).
- **R** `src/components/pos/display/use-display-publish.ts:147` — `deviceId:` key dropped (deviceCode kept). `display-actions.ts` untouched (keeps `deviceId?`, never reads it — DS2 PAR).
- **O** `src/lib/modules/pos/catalog.ts` `bulkChannelMarkup`: outranked select adds `unitId` · `carryOf` (unitId = null only, product not unit-scoped): X = units of outranked `(null, X)` notSold rows of the product or its parent, live units only, minus X with an existing `(code, X)` row of the product or parent · skip kept for `unitId` set and for unit-scoped products · plan gets `carry` (empty when a `(code, null)` prev row exists) · carried rows created in the same tx (`priceSatang null, notSold true`) · one audit row, `after.rows` = `(code, null, price)` + every carried row.
- **ORACLE-EDIT** `scripts/qc-pos-p2.14.mts:2248` (P2 block, marker `// ORACLE-EDIT ผู้คุม 16 ต.ค. (HF-FU2 PRC-1)`): `(LINEMAN, null)` row allowed only with a carried `(LINEMAN, A, notSold)` · A stays CHANNEL_NOT_SOLD (`:2249–2250` kept) · added B = `matrixCell(PP.my, "B", "LINEMAN").unitPriceSatang === 11000`. **Count 60 → 60** (no new check id). p2.14 forced 60/60.
- **A** new pure `src/components/pos/register/deposit-blame.ts` (`depositBlame`, no imports) — with `depositId`: NOT_FOUND/LOCKED drop the named row(s) · NOT_OWNER member ⇒ drop + `errors.depositNotOwner` · walk-in ⇒ reask (`again` if sentStripped, else `wrong`) · CLOSED or no matching row ⇒ old heuristic. Without `depositId` = verbatim port of the old branches (DP3 golden 600/600). `InterimPayDialog.tsx`: `PayError.depositId?` (first field — the oracle regex reads up to the first `;`) · `payErrorPinMeta` copies `depositId` (callers RegisterScreen/TableCheckout/OrderPay unchanged) · import `./deposit-blame` · the NOT_FOUND/CLOSED + NOT_OWNER + LOCKED branches replaced by one HF-FU2 block that applies the result (drop ⇒ clear last4/panel/note as before · reask ⇒ row note + `l4Checked:false` + `needsLast4:true` + `reenterLast4(first)` · `notOwnerSet` ref = result). `needsLast4:true` is a no-op on the heuristic path (its reask rows already need 4 digits); on the depositId path it makes a plain (no-4-digit) row ask.
- **W** `src/app/app/sys/[id]/pos/products/BranchCompare.tsx` cell: chip before the price when `c.origin` is own/inherited, testid `pos-prod-compare-origin-<product>-<unit>-<code>`, `data-origin` · keys `pos.products.branch.compare.chipOwn` (ตั้งที่สาขานี้ / Set here) · `chipInherited` (จากทุกสาขา / All branches) — th = en.
- **B** `src/lib/modules/account/gl.ts` + `posSaleEntryInOtherBook(ctx, refId, event)` (wraps `postedInOtherBook`) · `account/index.ts` `applyExternalChannelCommission` reverse without COMMISSION in the linked book: refund's own COMMISSION_REFUNDED in another book ⇒ `already` · sale's COMMISSION in another book ⇒ `{posted:false, reason:"other-book"}` · else `no-commission` · `pos/refund-consumer.ts` keeps the result; `other-book` ⇒ if no WARN row yet (`OpsEvent` tenant + level WARN + source `pos.account.commission_other_book` + message contains refundId) `logOps("WARN", "pos.account.commission_other_book", "ใบคืน <refundId> ของบิล <saleId>: …", {tenantId, detail JSON {refundId, saleId, receiptNo, commission, vat, payout}})`. No cross-book JV. AC1 ×2 replay = 1 WARN; AC2 same-book PAR.
- **Ledger** `POS-OWNER-PENDING.md` new section "16 ต.ค. 2026 (บัญชี A) — HF-FU2": QR-4 → P3 · RPT-6 → P4 · UI-6 overflow `/developers/kanban` · `/developers/account` · `/developers/member` (owning lanes) · D1c → P3 · D11 → P3 · note that W6/W7/W8 already exist (not duplicated).

## Deviations
1. ACC-1 extra guard (76cf9e05): a refund whose COMMISSION_REFUNDED already sits in the old book (posted before the relink, event replayed after) returns `already`, not `other-book` ⇒ no "adjust manually" WARN for a reversal that was already posted. Not in the names table; AC1/AC2 unaffected.
2. PRC-1 carries only to live POS units (archived/unlinked X are not carried — the new `(code, null)` row cannot sell there anyway).
3. Runner (d) also reds unknown row names and duplicate rows (forged SUMMARY) — beyond rules a–d, harmless for real runs (RG1 green, real `--only` run green on structure).
4. WARN idempotency = find-then-write (no unique key on OpsEvent); two concurrent consumers of the same event could write 2 WARN rows (outbox claims events one at a time; WARN only, no money).

## Lane-pin reds for the controller (expected · re-pin at merge, counts unchanged)
- `scripts/qc-hf-fu.mts:233` `LANE_PIN = "c5fc223b"` → HF-FU-ST1 (InterimPayDialog · refund-consumer) — 28/29.
- `scripts/qc-pos-p2.12.mts:270` `LANE_PIN = "c5fc223b"` → P2.12-ST1 (InterimPayDialog · refund-consumer · account/gl.ts · account/index.ts · display/use-display-publish.ts) — 32/33.
- `scripts/qc-pos-p2.11.mts:267` `LANE_PIN = "05975437"` → P2.11-ST4 (refund-consumer · gl.ts · index.ts carry HF-FU2 markers, not P2.11) — 33/34.
- `scripts/qc-pos-p2.10.mts:221` `LANE_PIN = "3d2f6db8"` → P2.10-ST2 (InterimPayDialog lines changed outside P2.10 blocks · `qc-pos-p2.14.mts` modified by the ORACLE-EDIT) — 12/13.

## CONTROLLER-DECISION items
None new. (Oracle's CD 1–5 ruled in CD-FU2b; all applied.)

## Visual (`--dry` only · controller shoots) — `--state` list
- register (wo `p2.9bu --page register --states`): `paydlg-deposit-notowner,paydlg-deposit-locked,paydlg-deposit-pick` — th 9 shots · en 6.
- products (wo `all --page products --states`): `products-bulk,products-matrix` — th 6 · en 2.
- products (wo `p2.11u --page products --states`): `products-branch-compare` — th 3 · en 1.
All six states already existed in `visual-pos.mts` — no hunk there.

## Runner `--only` run
`bash scripts/pos-gates-all.sh --out /root/pos-runs/hffu2b-only-d-20261016T212613Z --only qc-hf-fu2,qc-pos-p2.14,qc-hf-fu` (chain1 run: `/root/pos-runs/hffu2b-only-d-20261016T210655Z`, same verdict).

## Results
All on tree d, QC4 (`ep-frosty-lab`), POS lock, CI never exported. Chain = `scratchpad/hffu2b/chain.sh` (systemd unit), chain2 at **76cf9e05** dirty 0 (HEAD-end 76cf9e05 dirty-end 0) — chain1 at 59e2be5a gave identical counts.
| gate | result |
|---|---|
| `qc-hf-fu2` forced #1 (chain2) | **24/24** exit 0 · PAR 9/9 · residue 0 · leaks 0 |
| `qc-hf-fu2` forced #2 (runner `--only`) | **24/24** exit 0 |
| `qc-hf-fu2 --no-db` | **16/16** exit 0 |
| `qc-pos-p2.14` forced | 60/60 |
| `qc-pos-p2.9b` | 53/53 |
| `qc-pos-p1.3` | 128/128 |
| `qc-pos-p2.2` | 42/42 |
| `qc-pos-p2.11` | 33/34 — P2.11-ST4 (lane pin, expected) |
| `qc-pos-p2.12` | 32/33 — P2.12-ST1 (lane pin, expected) |
| `qc-pos-p2.10` | 12/13 — P2.10-ST2 (lane pin, expected) |
| `qc-hf-fu` | 28/29 — HF-FU-ST1 (lane pin, expected) |
| `qc-pos-p1.8` | 49/49 |
| `qc-pos-p2.1` | 55/55 |
| `qc-pos-p1.18` | 81/81 |
| fitness no-env · fitness QC4 · fitness-pos · `gen-pos-api-docs --check` | 0 · 0 · 0 · 0 |
| runner `--only qc-hf-fu2,qc-pos-p2.14,qc-hf-fu` | `/root/pos-runs/hffu2b-only-d-20261016T212613Z` — HEAD.txt `… only=qc-hf-fu2,qc-pos-p2.14,qc-hf-fu` = every log line 1 · `SET partial 3/97` accepted (from `--only`, rows = names) · only RED = `qc-hf-fu` (not accepted = the HF-FU-ST1 lane pin) ⇒ VERDICT red (1) exit 1 — as expected until the controller re-pins |
| visual `--dry` | th 9 + 6 + 3 = 18 shots · en 6 + 2 + 1 = 9 shots · exit 0 |
| typecheck | see the last line |
Red-before on the base (step 1): forced 9/24 · `--no-db` 4/16 (same as `HF-FU2-red.txt`).

**Typecheck** `env NODE_OPTIONS=--max-old-space-size=8192 ISO_MEM=10500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck` at **c8f089d7** dirty 0 → **exit 0** (head/dirty unchanged after). The commit after it touches only this file.

## Fix round 1 delivered (controller ruling CD-FU2c · 17 Oct · tree p11 · branch `wip/pos-hf-fu2` from 1224fd12)
Source: `ledger/wo-notes/pos-HF-FU2-review.md` (R1 F1–F4 · hunter N1–N5). One commit per fix, marker `POS HF-FU2 ▸ fix1 <id> ◂`.
| id | commit | change |
|---|---|---|
| F1 | ab624a83 | `catalog.ts` bulk carry: `liveUnitsOfPos` call + `live.has(x) &&` dropped — every outranked `(null, X)` notSold row is carried (dead units included; ruling 4 as written) |
| N2 | 2c3739c4 | runner: head/dirty/only parsed from HEAD.txt line 1 only · HEAD.txt ≠ 1 line ⇒ `RED HEAD.txt …` · duplicate `head=`/`dirty=`/`only=` tokens ⇒ RED (covers R1-F4) |
| N3 | ab537e95 | runner: more than one `JSON_SUMMARY` line ⇒ RED · the single one must be the line right before the final `EXIT` |
| N1 | e07ccb7e | runner: SUMMARY rc must equal the log's final `EXIT n` line · rc 0 rows: JSON_SUMMARY unreadable, failed/findings non-empty, crashed, or passed ≠ total ⇒ RED (covers R1-F2) |
| N4 | a8b022ce | runner rule (a): counts `failed` only when the suite reports `failed` (findings never pad); findings-only suites (51 of the real gates111/p214-close suites) count `findings` · `0 ≤ passed ≤ total` else RED |
| N5 | a1b8a210 | `refund-consumer.ts`: ACC-1 WARN via `prisma.opsEvent.create` (level WARN · source · message · detail · tenantId — the logOps fields) inside the try ⇒ insert failure → errors.push → retry · find-then-write dedupe kept |
| ORACLE-ADD | b3e3848e | `qc-hf-fu2.mts` RG9 (rc ≠ EXIT · 0 vs EXIT 1 and accepted 1 vs EXIT 137 · control) · RG10 (rc 0 + failed / findings / crashed / passed<total) · RG11 (2-line HEAD.txt · two `only=`) · RG12 (forged second JSON_SUMMARY · summary not before EXIT) · RG13 (findings padding · passed>total · findings-only control green) · AC1 + injected `opsEvent.create` failure (findFirst ⇒ null, create rejects, source-scoped, restored in finally) ⇒ consumer must throw the injected message, create called once, no row added. **Count 24 → 29** (`--list` 29 · `--no-db` 16 → 21). Positive control: all five RG red against the 1224fd12 runner (transient swap of `pos-gates-all.sh`, restored byte-equal, never committed). |
- F3 (match anywhere in the log) accepted as written — no change.
- Real-dir check of the new rules: `--verdict` on copies of gates111-c, p214-close-…085341Z, hffu2b-only-d-…212613Z — no new RED line (only the old not-accepted rows + HEAD of the copy).
- Results at **b3e3848e** dirty 0 (HEAD-end b3e3848e dirty-end 0), QC4, POS lock: `qc-hf-fu2` forced **29/29 ×2** · `--no-db` **21/21** · `qc-pos-p2.14` 60/60 · `qc-pos-p2.2` 42/42 · `qc-pos-p2.1` 55/55 · `qc-pos-p1.8` 49/49 · `qc-pos-p2.9b` 53/53 · fitness no-env 0 · fitness QC4 0 · `gen-pos-api-docs --check` 0.
- Runner `--only qc-hf-fu2,qc-pos-p2.14,qc-hf-fu`: `/root/pos-runs/hffu2b-fix1-only-p11-20261016T220835Z` — HEAD.txt one line `… only=qc-hf-fu2,qc-pos-p2.14,qc-hf-fu` · SET partial 3/97 · qc-hf-fu2 29/29 (third forced run) · only RED = `qc-hf-fu` (HF-FU-ST1 lane pin) ⇒ VERDICT red (1), as expected.
- Lane pins unchanged from the list above (qc-hf-fu:233 · p2.12:270 · p2.11:267 · p2.10:221) — controller re-pin at merge.

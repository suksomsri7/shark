# Brief: HF-FU2 — P2 follow-up bucket (controller tooling + small product fixes) · DRAFT by brief drafter (account A) 16 Oct 2026. The controller rules in §8.

Read-only survey of `session/pos` product tip **3d2f6db8** (tree `/root/projects/shark-pos-b`, dirty 0; product tree = U3 merge `c5fc223b` — `git diff c5fc223b 3d2f6db8` touches only `ledger/` + `scripts/qc-hf-fu.mts` + `scripts/qc-pos-p2.12.mts`). Every `path:line` is at 3d2f6db8. Sources = `POS-OWNER-PENDING.md` :223 :225 :237 :238 :239 :246 :255 :257 :259 (16 Oct numbering) · `wo-notes/pos-P2.14-review.md` (:24 :59 :60 :69 :84) · `wo-notes/pos-P2.14.md` (:80 D2 · :83 D5 · :89 · :163 D11 · :176) · `HANDOVER-2026-10-16-POS-P2.md` §5 · controller housekeeping (prompt). Precedent shape = `pos-brief-HF-FU.md`.

⚠️ Prompt-vs-code (read first):
1. **Lane pins are not all at c5fc223b.** `qc-hf-fu.mts:233` and `qc-pos-p2.12.mts:270` = `c5fc223b`, but `qc-pos-p2.10.mts:221` = **`280b56f7`**, and `qc-pos-p2.7:361` · `p2.8:295` · `p2.11:267` · `p2.13:350` = `05975437`.
2. **`qc-pos-p2.10` ST2 is red at 3d2f6db8 (predicted from code, not run).** ST2 flags every `scripts/qc-(pos|hf)-*.mts` that differs from its pin, other than itself and p1.18 (`qc-pos-p2.10.mts:358–368`). `git diff --name-only 280b56f7 3d2f6db8 -- scripts` lists `qc-hf-fu.mts` and `qc-pos-p2.12.mts`. Those are the CD-B1c re-pin edits. gates111b ran only hf-fu / p2.12 / p2.14 (`/root/pos-runs/gates111b-c-20261016T184308Z/SUMMARY.txt`), so p2.10 was not re-run after them. This is the same circular case as CD-B1b. It also means **any new oracle file trips p2.10 ST2**: `git diff --name-only` lists added files. So `qc-hf-fu2.mts` and every P3 oracle will trip it (§8 Q3).
3. Many listed items were closed by P2.14 S (rows DEP-1, API-1…8, QR-1…3, LEG-1…4). Only the remainders below are open (§1).
4. `:223` "reader S ตาม depositId": the server half is done. The **pay-dialog reader still guesses** (`InterimPayDialog.tsx:759–797` never reads `e.depositId`; `PayError` `:79` has no field).

## 1. Item status at 3d2f6db8
| # | Source | Status (evidence) | Remainder · size · kind · money/sec |
|---|---|---|---|
| A | :223 DEP-1 | **server DONE** P2.14 `6dc205e8`: `register.ts:2528–2535` adds `depositId` on NOT_FOUND / LOCKED / NOT_OWNER; type at `register-shared.ts:246`. D2: the in-tx NOT_OWNER `service.ts:435` carries no row (race only, after the register pre-check) | **OPEN UI half**: `payErrorPinMeta` (`InterimPayDialog.tsx:81`) drops `depositId`; the NOT_OWNER/LOCKED branches (`:759–805`) blame by row origin; after a reload every row asks for 4 digits (`:849–850`) · S · product (pay dialog) · money-adjacent (wrong deposit row dropped, no wrong charge) |
| B | :225 ACC-1 | **OPEN**. Refund after a relink: `applyExternalChannelCommission` reverse ⇒ `no-commission` (`account/index.ts:729`) because COMMISSION lives in the old book. `refund-consumer.ts:122–137` ignores the result ⇒ **silent**, with no ops WARN | owner/account rule (cross-book posting). Smallest POS part = a WARN · S · money (commission expense overstated in the old book) |
| C | :237(1) API-3 | **DONE** `catalog.ts:517–522` actorType `API_KEY` | — |
| D | :237(2) API-5 | **DONE** `api/ops/sales.ts:605` serviceKey + `tax-invoice.ts:212` audit | — |
| E | :237(3) API-6 | **DONE** (green at base, verification A7 · `pos-P2.14-oracle.md:92`) | — |
| F | :237(4) API-2 | **DONE** `api-key-actions.ts:171` unit-cover check | — |
| G | :237(5) API-7 | **DONE** `api/ops/sales.ts:365–367` prior-sale lookup before shift/quote | — |
| H | :237(6) + :238 API-1 | **DONE by ruling** `shift.ts:1117–1138` + `sales.ts:368–378`: path (ข) (on + ≥ 2 shifts + CASH) ⇒ 409 SHIFT_REQUIRED · path (ก) (setting off) = out of shift **by design**, `outOfShift:true` (`sales.ts:408`) | **CD-F7** (:255(4)): `orders.pay` still `strictCash` (OR7) vs `/sales` off ⇒ out of shift — owner (W2 extension) · XS if unified · money (cash outside drawer count) |
| I | :237(7) API-8 | **DONE** `sales.ts:401` fixed shapes (+ channels/orders/products) | — |
| J | :239 API-4 | **DONE** `pos-approval.ts:311–321` "API: <name>" → `/app/approvals/page.tsx:38,59,65` | — |
| K | :246(1) QR-4 | **OPEN — OWNER/P3** (static PromptPay tag-62 needs bank-app tests; brief P2.14 row 21) | out of HF-FU2 |
| L | :246(2)(3)(4) QR-1/2/3 | **DONE** `order.ts:1014` 7-day lookback + `expireDuePaidPreorders` / refund_needed marker / `qr-order.ts:417–452` advisory lock (P2.14 `6d5d8269`) | — |
| M | :246(5) LEG-1–4 | **DONE** (8-commit LEG set, owner veto window W1). D11 setup writers stay open on linked units (`pos-P2.14.md:163`) | D11 → P3 (POS setup screens) |
| N | :246(6) QR-6 | **DONE client** `qr-ui.ts:107` `phoneForServer` (Thai digits / 0066 / +66 (0)). Server `qr-order-shared.ts:84` keeps 0 + 8–9 digits (a 9-digit Bangkok landline is valid) | no action (note only) |
| O | :255(1) PRC-1 | **OPEN** `catalog.ts:2605–2641`: with `unitId=null`, any `(null, X)` notSold row skips the whole product (`:2614`, `:2637`) although units ≠ X still sell | S · product price · Low-Med (markup silently not written) |
| P | :255(2) RPT-6 | **OPEN (deviation D5)**: `PrintFrame.tsx:88` intercept + print CSS; no `text/html` route variant | S–M · UX only |
| Q | :255(3) UI-6 rest | **OPEN, not POS**: `/developers/{kanban,account}` (+ `member`) tables have no `overflow-x-auto` (`kanban/page.tsx:311…`, `account/page.tsx:248…`, `member/page.tsx:333…`). The pages are read by other lanes' oracles (`qc-kanban-k1.15`, `qc-account-api-docs`, `qc-member-m1.11/m2.10/m3.10`) | XS each · other lanes |
| R | :257(1) D12b | **OPEN** `use-display-publish.ts:147` still sends `deviceId: cur.deviceCode`; the server ignores it (`display-actions.ts:114–117`, `display.ts:488–492`) | XS · client hygiene · security-tier note (no effect) |
| S | :257(2) D1c | **BLOCKED** — no server device identity (`PosDevice` has no session binding, `pos.prisma:517–535`). Shift-open claim bypass `shift-actions.ts:77–79,98` → P3 signed device cookie | P3 |
| T | :257(3) one-OPEN-shift | **OWNER** (no rule change) | W-row |
| U | :259 runner (a)–(d) | **OPEN all four** `pos-gates-all.sh:60–137`: (a) no `len(ids) ≥ total−passed` · (b) no `accepted.match` · (c) `SET partial` only printed (`:72`) · (d) log line 1 never compared with HEAD.txt (`:192`) | S · tooling · gate integrity |
| V | housekeeping | `pos-gates.json:179–190` qc-pos-p2.14 `accepted` (H1/H3) is stale (60/60) · `scripts/fixtures/acc-v2/*` rewrite = ACCOUNT lane (OP :262), POS restores with `git checkout` and takes no action | XS tooling |
| W | extra (`pos-P2.14.md:89`) | PRC-3 UI half **OPEN**: matrix DTO `origin` (`catalog.ts:2876`) is not read by `BranchCompare.tsx` | S · UI · optional (Q6) |

**Count (23 rows A–W):** DONE 11 (C D E F G I J L N · H by ruling · M core) + A server half · OPEN in scope 5 (A-UI · O · R · U · V) + B-WARN if Q1 · OUT/owner/P3/other lane: B-rule · CD-F7 · K · P · Q · S · T · D11 · W (optional). DOC-6 already fixed by HF-TX (`register.ts:2740–2745`).

## 2. Smallest fix per open item (marker `// POS HF-FU2 ▸ <id> ◂`, JSX `{/* … */}`)
- **A DEP-1 UI** (`InterimPayDialog.tsx` only):
  - `PayError.depositId?` and `payErrorPinMeta` copies `depositId`, so the three callers are unchanged: `RegisterScreen.tsx:1859`, `TableCheckout.tsx:268`, `OrderPay.tsx:64` (all three already spread the meta).
  - NOT_OWNER / LOCKED / NOT_FOUND with `depositId` act on **that row only**: NOT_FOUND drops it · LOCKED drops it · NOT_OWNER drops it for a member deposit, else re-asks its 4 digits. After a reload only the named row asks.
  - Without `depositId` (D2 in-tx race) the current heuristic runs (PAR).
  - Put the decision in a new pure `src/components/pos/register/deposit-blame.ts` (oracle-testable, outside every glob pin). No `service.ts` hunk (D2 accepted, Q5).
- **B ACC-1 (if Q1 = B)**: the account facade returns `reason:"other-book"` for the reverse case when `postedInOtherBook(PosSale#<sale>#COMMISSION)` (`gl.ts:1937` helper). `refund-consumer.ts` then writes one ops WARN `pos.account.commission_other_book` `{refundId, saleId}` (idempotent per refund). No cross-book JV.
- **O PRC-1** (`catalog.ts`): when `unitId === null` and the product's outranked notSold rows are only `(null, X)`, write `(code, null)` **and** carry `(code, X, notSold:true)` for each such X that has no `(code, X)` row (same tx, same audit row `via:"bulk"`, `rows` lists both). Skip stays for `(code, null)` notSold and for unit-scoped products.
- **R D12b(1)**: drop the `deviceId:` key at `use-display-publish.ts:147`. The action keeps `deviceId?` (stale tabs) and keeps ignoring it.
- **U runner** (`scripts/pos-gates-all.sh`, verdict block):
  - (a) `ids_of` also returns `total`, `passed`; `len(ids) < total − passed` ⇒ RED "รายการล้มสั้นกว่า total−passed".
  - (b) when `checks` holds `CRASH` or `*-ERR`, the entry needs `accepted.match` (string), and that string must occur in `<name>.log`, else RED.
  - (c) HEAD.txt records `only=<csv|->`; `SET partial` with `only=-` ⇒ RED; partial with `--only` must equal the matched count.
  - (d) every `<name>.log` line 1 must equal HEAD.txt line 1, else RED `log-head`.
  - Manifest: add `match` to the 9 CRASH/ERR entries (texts from the gates111 logs) · **remove the `qc-pos-p2.14` accepted** (V) · append `qc-hf-fu2` (p2.14 G1 requires every `qc-hf-*`).
- **Ledger lines** (no code): K QR-4 → P3 · P RPT-6 route → P4 (Q6) · Q developers overflow → kanban/account/member lanes (one OP line each; POS does not edit other modules' pages) · S D1c → P3 · T one-OPEN-shift → W7 · CD-F7 → W6 · D11 → P3 · V acc-v2 fixtures → ACCOUNT (exists :262, no new line).

## 3. Pins that bite (ORACLE-EDIT/re-pin list for the controller)
| Pin | Watches | Hit by | Action |
|---|---|---|---|
| `qc-pos-p2.10` ST2 @280b56f7 | zero hunk `register*.ts` `service.ts` `tender*` `payment-intent` `held-cart` `outbox-consumers` `proxy` contract · RegisterScreen/InterimPayDialog add-only inside P2.10 blocks · **no qc-(pos\|hf) file changed or added** | **already red** (⚠️2) · A (dialog lines removed) · new `qc-hf-fu2.mts` · O (p2.14 P2 edit) | Q3: ORACLE-EDIT "existing = present at the pin" (new files ignored) + re-pin → 3d2f6db8 **now**, then → HF-FU2 re-pin commit after merge (CD-B1b rule) |
| `qc-hf-fu` ST1 @c5fc223b | InterimPayDialog · PayDone · BillsClient · service · deposit · account-bridge · `register*/tender*/refund*` in `modules/pos` · restaurant/** · visual-pos.mts · prisma | A (InterimPayDialog) · B (refund-consumer) | re-pin → HF-FU2 merge |
| `qc-pos-p2.12` ST1 @c5fc223b | RegisterScreen · InterimPayDialog · DeviceSettings · `display*` (lib + components/app `display/`) · register/tender/refund/receipt · service · account-bridge · outbox · `modules/account\|giftcard\|member/**` | A · R (`components/pos/display/`) · B (refund-consumer + `modules/account`) | re-pin → HF-FU2 merge |
| `qc-pos-p2.11` ST4 @05975437 | hunks in service/register*/tender*/refund*/account-bridge/outbox/`modules/account/**` need a P2.11 marker | B only | re-pin only if Q1 = B |
| `p2.7` ST3 · `p2.8` ST6 · `p2.13` ST5 | register.ts / service.ts / channel.ts / contract / prisma / outbox | none (no register.ts / service.ts hunk) | none |
| `qc-pos-p2.14` P2 (`:2238–2252`) | Y case asserts **no** `(LINEMAN, null)` row | O | ORACLE-EDIT: allow it only with a carried `(LINEMAN, A, notSold)`; A stays CHANNEL_NOT_SOLD; B gets the markup price |
Re-pin batch = one `test(pos)` commit after the HF-FU2 merge, marker `// ORACLE-EDIT ผู้คุม <date> (HF-FU2 lane-pin)`, counts unchanged (hf-fu 29 · p2.12 33 · p2.10 13 · p2.11 34).

## 4. Oracle plan — `scripts/qc-hf-fu2.mts` (24 checks; red-before `ledger/wo-notes/HF-FU2-red.txt`)
**Fixtures:** temp tenant `posqc-hffu2-<rand>`; units A/B; LINEMAN (PLATFORM payout) + CHAT; products mx/my/mz (mz unit-scoped to A); two ACCOUNT books for B. Module functions only. Runner checks need no DB: temp result dirs under `/tmp/claude-0/…/hffu2-rg-<rand>/` + `bash scripts/pos-gates-all.sh --verdict <dir>`.
- **ST1** no migration · `prisma/` and the contract sha unchanged · no hunk in register*.ts / service.ts / tender* / payment-intent / held-cart / outbox / proxy / deposit.ts · createSale caller registry unchanged · every hunk carries `HF-FU2` (refund-consumer/account only if Q1 = B).
- **ST2** OP/W lines exist for K P Q S T D11 CD-F7 (grep) · new message keys th = en, no Thai in en.
- **DP1–DP3 (A, pure on `deposit-blame.ts` + static)**:
  - DP1: NOT_OWNER / LOCKED / NOT_FOUND with depositId ⇒ only the named row changes, in 3 fixtures (member · walk-in · mixed).
  - DP2: rows reloaded (receiptNo null) + depositId ⇒ only that row asks 4 digits.
  - DP3: no depositId ⇒ the result equals today's heuristic (golden from 3d2f6db8 logic, PAR). Static: `payErrorPinMeta` passes `depositId`.
- **PR1–PR3 (O, DB)**:
  - PR1: my has `(null, A)` notSold; bulk `(LINEMAN, all)` ⇒ `(LINEMAN, null)` row + `(LINEMAN, A, notSold)`. Matrix: A = CHANNEL_NOT_SOLD, B = markup price. One audit row.
  - PR2: mx `(LINEMAN, null)` notSold and unit-scoped mz ⇒ skipped (PAR). Replaying PR1 writes nothing.
  - PR3: an existing `(LINEMAN, A)` priced row is not overwritten with notSold. `written` / `skipped` counts are exact.
- **DS1 (R)**: static — the publish call has no `deviceId` key. D1b forged-device refusal still holds (`DEVICE_NOT_REGISTERED`, PAR).
- **RG1–RG8 (U, runner self-tests)**:
  - RG1: control (all rc 0, full set) ⇒ green rc 0.
  - RG2 (a): rc 1, `total 10 passed 7 failed [X]` with X accepted ⇒ RED.
  - RG3 (b): CRASH accepted without `match` ⇒ RED.
  - RG4 (b): `match` absent from the log ⇒ RED; present ⇒ ACCEPTED.
  - RG5 (c): partial, `only=-` ⇒ RED; partial + `only=a,b` with 2 rows ⇒ green.
  - RG6 (d): one log line 1 with another head ⇒ RED `log-head`.
  - RG7: rc 137 still RED (fix2 PAR).
  - RG8: hidden PL2.1 still RED (fix2 PAR).
- **MF1 (V)**: `qc-pos-p2.14` has no `accepted` · every CRASH/*-ERR accepted entry has `match` · `qc-hf-fu2` is listed in the manifest.
- **AC1–AC2 (B, only if Q1 = B; else SKIP-with-reason)**:
  - AC1: PLATFORM bill with COMMISSION in book 1, relink to book 2, partial refund, drain ⇒ one WARN `commission_other_book`, no JV in book 2; replay ×2 ⇒ still one.
  - AC2: same-book control ⇒ COMMISSION_REFUNDED posted (PAR).
- **Z1–Z2**: residue 0 (products/price rows/audits/refunds/ops, settings restored) + non-temp fingerprint identical.

**Expected red-before:** ≈ 17/24. Green by design (PAR): DP3, PR2, RG1, RG7, RG8, AC2, Z1, Z2.
**Regression (merge set):** typecheck 8192 · fitness ±env · fitness-pos · `qc-hf-fu2` ×2 · `qc-pos-p2.14` 60 (P2 edit) · `qc-pos-p2.9b` 53 + `qc-pos-p2.9bU`-family deposit checks (dialog) · `qc-pos-p1.3` · `qc-pos-p2.2` 42 + `qc-pos-p2.11` 34 + `qc-pos-p2.12` 33 (PRC-1) · `qc-pos-p2.10` 13 · `qc-hf-fu` 29 · `qc-pos-p1.8` + `qc-pos-p2.1` (refund commission, if B) · `qc-pos-p1.18` ST7 · then the full gate set via the hardened runner (its own first real run = proof).
**Visual (touched states only):** `paydlg-deposit-notowner,paydlg-deposit-locked,paydlg-deposit-pick` th 1440/390 + en 1440 · `products-bulk,products-matrix` th 1440. Not needed for R/U/V.

## 5. Sequencing / lanes
- Step 0 (controller, before branching): run `qc-pos-p2.10 --no-db` on 3d2f6db8 to confirm ⚠️2, then the Q3 ORACLE-EDIT + re-pin commit. Otherwise HF-FU2 starts from a red base.
- Oracle-first: `wip/pos-hf-fu2-oracle` (writer, tree d) → builder `wip/pos-hf-fu2` (merges the oracle branch first). One lane. It does not collide with P3.4/P3.5 drafting (read-only). Hot shared files: `pos-gates.json`, `messages/*` (append-only), `POS-OWNER-PENDING.md`.
- Builder order: U + V (tooling, self-tests green first, so the new runner judges the rest) → R → O → A → (B) → ledger lines. R1 reviewer; **hunter** only on B (money) and on the runner (gate integrity).

## 6. Pins / boundaries
No migration, enum, outbox event or contract regen. `createSale`/`refundSale` untouched. F15.1 price writes stay in `catalog.ts`. POS does not edit other modules' pages (Q). `'use client'` files do not import `pos/register|catalog|service|display`. Never `cd`; the runner never exports CI.

## 7. Open questions (recommendation first · owner standing order "run to 100%" ⇒ each has a default)
1. **ACC-1 cross-book commission reversal** — Rec **B**: POS WARN only (staff adjust in the old book; visible on ops). Cross-book posting (C) = ACCOUNT lane rule, W-row for the owner. Alt A: no code, OP line only (silent today). Default if unanswered: B.
2. **CD-F7 unification** — Rec keep both as ruled (orders.pay strict, `/sales` off ⇒ `outOfShift:true`) and add **W6** for the owner. Alt: `strictCash:true` on `/sales` CASH (1 line `sales.ts:373`, 409 when 0 shifts; skill regen; API not deployed). Default: keep.
3. **p2.10 ST2 vs new oracle files (⚠️2)** — Rec ORACLE-EDIT `qc-pos-p2.10.mts:359`: compare only files present at the pin (`git ls-tree MB`). A new file is not an edited old one, so the rule text stays unchanged. Then re-pin → 3d2f6db8 now. Alt: re-pin p2.10 after every card (circular, as CD-B1b/c).
4. **PRC-1 rule** — Rec "carry notSold down to the channel level per unit" (§2 O). Alt: keep the skip but return `skippedNotSold: productId[]` so the UI can say why (no rule change, no ORACLE-EDIT).
5. **DEP-1 D2** (in-tx NOT_OWNER without a row, `service.ts:435`) — Rec accept: a race only, and a hunk would bite the p2.7/p2.8/p2.10/p2.11/p2.12/hf-fu pins. Alt: `PosSaleError.depositId` like UI-9 `giftCardRow` + `regPinRow` mapping (6 re-pins).
6. **Scope edges** — Rec OUT: RPT-6 route variant → P4 (UX only; a new route handler would need its own authz check) · developers overflow → owning lanes · PRC-3 UI half → P3 price card (or IN as a 1-file `BranchCompare.tsx` badge if the controller wants it; visual `products-branch-compare`).

## 8. Controller rulings
Controller (account A) 16 Oct 2026 20:0xZ — binding; §8 wins over §1–§7. Owner questions → `POS-OWNER-PENDING.md` §"รอคำตอบเจ้าของ (รวม)" W6–W8 with defaults; nothing waits.

1. **Q1 ACC-1 = B (POS WARN only).** Account facade returns `reason:"other-book"` on the reverse when COMMISSION was posted in another book; `refund-consumer.ts` writes one idempotent ops WARN `pos.account.commission_other_book {refundId, saleId}`. No cross-book JV. Owner/ACCOUNT rule = **W8** (default = WARN, staff adjust in the old book). ⇒ AC1/AC2 real, `qc-pos-p2.11` ST4 re-pin at merge, hunk marked `// POS HF-FU2 ▸ ACC-1 ◂` (also satisfies P2.11 marker rule via the HF-FU2 marker — controller re-pins p2.11 → merge SHA).
2. **Q2 CD-F7 = keep as ruled** (`orders.pay` strictCash · `/sales` setting-off ⇒ `outOfShift:true`). Owner row **W6**. No code.
3. **Q3 p2.10 ST2 = done by the controller before this lane starts (CD-FU2a):** `qc-pos-p2.10.mts` compares only files present at the pin (`--diff-filter=M`) and `LANE_PIN = 3d2f6db8`; `--no-db` 2/2 green at the base. The HF-FU2 base = the controller commit carrying CD-FU2a (see the oracle prompt). After the HF-FU2 merge the controller re-pins p2.10/hf-fu/p2.12/p2.11 again (CD-B1b rule) because PRC-1 edits `qc-pos-p2.14` (an existing file).
4. **Q4 PRC-1 = carry notSold down** (§2 O): with `unitId=null`, write `(code, null)` + `(code, X, notSold:true)` for each outranked `(null, X)` notSold without an existing `(code, X)` row; same tx, one audit row `via:"bulk"`; never overwrite a priced `(code, X)`. ORACLE-EDIT `qc-pos-p2.14` P2 (`:2238–2252`) prepared by the builder as its own `test(pos)` commit (counts before/after); PR1–PR3 as §4.
5. **Q5 DEP-1 D2 = accept** (in-tx NOT_OWNER without a row is a race only). UI half as §2 A: decision in pure `src/components/pos/register/deposit-blame.ts`; `InterimPayDialog.tsx` edits inside `// POS HF-FU2 ▸ DEP-1 ◂` blocks; without `depositId` the result equals today's heuristic (DP3 golden).
6. **Q6 scope edges:** RPT-6 route variant → **P4** (OP line) · developers overflow (kanban/account/member) → owning lanes (one OP line each, POS edits nothing) · QR-4 → P3 · D1c → P3 (signed device cookie) · D11 → P3 · one-OPEN-shift → **W7** · **PRC-3 UI half = IN** as a 1-file `BranchCompare.tsx` origin badge (`{/* POS HF-FU2 ▸ PRC-3 ◂ */}`), visual state `products-branch-compare` th 1440 (+ en 1440) added to the visual list.
7. **Runner (U) + manifest (V) first**, self-tests RG1–RG8 green before the rest; the hardened runner's first real full set after merge = proof (gates112). Manifest: `match` on the 9 CRASH/ERR accepted entries (texts from `/root/pos-runs/gates111-c-*/<name>.log`), remove the stale `qc-pos-p2.14` accepted, append `qc-hf-fu2`. HEAD.txt gains `only=<csv|->` (runner writes it; chains of the controller keep working — `--verdict` must tolerate a HEAD.txt without `only=` as `only=-`).
8. **R D12b(1):** drop the `deviceId:` key at `use-display-publish.ts:147`; action keeps `deviceId?` optional and ignores it. Static DS1.
9. **Lane:** oracle writer on tree **d** (`wip/pos-hf-fu2-oracle`), then builder on tree d (`wip/pos-hf-fu2`, merges the oracle branch first). Single lane (lane 2); P3.5 S is lane 1. Hot shared files: `pos-gates.json`, `messages/*` (append-only), `POS-OWNER-PENDING.md`.
10. **Review:** R1 reviewer; hunter on ACC-1 (money) and on the runner (gate integrity: forged SUMMARY/HEAD, partial sets, accepted-without-match). Regression set as §4; visual as §4 + `products-branch-compare`.

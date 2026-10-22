# P4.1 oracle — `scripts/qc-pos-p4.1.mts` (oracle writer · account B · 22 Oct 2026 06:28–07:0xZ UTC)

Tree `/root/projects/shark-pos-b` · branch `wip/pos-p4.1-oracle` · base `6e32c1e2` (origin/session/pos; ≥ 4ac3b040).
Prompt `ledger/pos-briefs/pos-prompt-accountB-P4.1-ORACLE.md` · brief `pos-brief-P4.md` §2 §4 §8 §10 + addendum (rulings 1–9 · W29 · W30).
Scripts + ledger only. No `src/` edits, no DB, no build/server.

## Commits (in order)
| SHA | What |
|---|---|
| `82ff0a5d` | `scripts/qc-pos-p4.1.mts` (R1–R14 + Z1, static, every check has a negative probe) + `pos-gates.json` row `{suite: qc-pos-p4.1, mode: unforced}` (no SKIP gate, no `requires:` seed marker → G2 of p2.14 green) |
| `88d121d6` | **ORACLE-EDIT of `fitness-pos.mts` under P4 §10 ruling 2 (controller B):** `ROW_ROLES += public` + F15.3b validates `opener`/`needs` (string or string[]), `viewport` (desktop/tablet/mobile), `safety` (money/external/counter) when present |
| `af7278e9` | **Proposal CD-P41-O8/O9 (separate, can be dropped alone):** F15.3b ghost-row hole closed + `ROW_KINDS += notice` |
| `65003952` | Registry schema doc only: `$fields` opener · needs · viewport · safety (+ roles/hiddenFor/expect/oracle/kind text) · `$roles` lists public · new `$legacyOut` block (W29, 2 files). **No row was changed.** |
| `520581b3` | R11 tweak: money rows = `mutation`/`download` rows only; `PosOfflineSale` removed from the money tables (discarding an offline bill moves no money) |

## Check list ↔ brief
| id | brief | what the check does (static) | probe that must go red |
|---|---|---|---|
| R1 | §4 R1 · G1 | every row has a non-empty `expect.target`, or `expect.type` ui with `state` | delete one target |
| R2 | §4 R2 · G1 | every `mutation` row: `expect.db` = `<Model that exists in prisma/schema/*.prisma>` + something more (field/state), **or** `oracle` names a check id from a `qc-pos-*` `--list` (ids read from the files, never run; X-group S/P not counted as DB checks) | drop db + fake oracle id |
| R3 | §4 R3 · ruling 2 | `$fields` documents opener/needs/viewport/safety · `opener` = string or string[], each step `<testid>` or `<testid>=<value>` = a registry row on the same page (patterns allowed), not itself, no repeats, no cycles · `needs` = text ≥ 4 chars (or list) · `viewport` ⊂ desktop/tablet/mobile, unique, not all three | opener to a ghost + viewport "huge" |
| R4 | §4 R4 · ⚠️3 · ruling 2 | `$roles` mentions public · `ROW_ROLES` in `fitness-pos.mts` has "public" · every row on `/r/**` `/q/**` `/d` `/developers/**` has `roles: ["public"]` exactly · no staff-page row uses public | public row → owner; staff row + public |
| R5 | §4 R5 · ⚠️4 · ruling 3 · W29 | registry `baselineDebt` = 0 for every file outside `$legacyOut`, **and** a live scan (`untestidControls` of fitness-pos) finds 0 untestid controls there · `$legacyOut.items` = exactly `register-ui.tsx` + `register-legacy-page.tsx`, each `why` cites W29 · anti-gaming: for every debt file, interactive elements (testid'd + untestid) at HEAD ≥ at `PIN` (`git show`), unless `baselineDebt.items[].removed` gives a reason ≥ 12 chars | debt +1; synthetic `<button onClick>` must count 1 |
| R6 | §4 R6 · G6 | per `ledger/design-pos/NN.body.html`: count buttons/links/inputs, compare with registry rows of the mapped pages (bucket by kind); every positive difference needs a `$mockupGaps.items[]` `{mockup, bucket, gap (exact), reason ≥ 12}`; stale items are red; every mockup must be mapped; every mapped page must have rows | inflate mockup 01 buttons |
| R7 | §4 R7 | imports `runPosFitness` from `fitness-pos.mts` and requires F15.3a + F15.3b green | temp copy of the registry (os.tmpdir, `src` = symlink): one live row removed + a ghost row + a duplicate row → both F15.3a and F15.3b red; folder removed after |
| R8 | §4 R8 | every testid that `qc-pos-*.mts` / `visual-pos.mts` use (`tid("…")`, `` tid(`…`) ``, `[data-testid=…]` incl. `^=` `$=` `*=`, `getByTestId`) exists in the registry, or in `src` (data-testid, string literal passed as prop, composed `${testId}-total`, or matching pattern) or `$foreign` | inject a ghost id |
| R9 | §4 R9 | `hiddenFor` ⊆ {owner, manager, cashier, public} and never overlaps `roles` | hiddenFor = roles; hiddenFor ["nobody"] |
| R10 | §4 R10 · V4 | every refusal card — `refusals` values of `pos-visual-sweep.json` ∪ POS-code testids matching `^pos-…-refus(al|ed)$` (15 today) — has a registry row with `expect.type` ui and `state` "refused" (any valid kind; `notice` proposed) | add one refusal id |
| R11 | §4 R11 · ⚠️6 · ruling 5 | every `mutation`/`download` row that reaches a money writer (`MONEY_ACTIONS` named in target/db/note, or `expect.db` names `PosSale PosPayment PosPaymentIntent PosDeposit PosDepositTxn GiftCard GiftCardTxn PosCashMovement`) has `safety` ∈ money/external/counter · detector must find ≥ 1 row | delete safety on a money row |
| R12 | §4 R12 · ruling 5 | `safety` value valid · external rows (`sendReceiptAction reprintReceiptAction requestChatPaymentAction kitchenSlipPayloadAction`, or text Beam · e-Tax · webhook · LAN · print-agent · เครื่องพิมพ์ · พิมพ์ใบ/ซ้ำ/สำเนา/ครัว/บิล · print() · LINE (not LINE MAN); device/settings config rows excluded) = `external` · document-number rows (`issueFullTaxInvoiceAction issueFromTaxInvoiceRequestAction`; text ใบกำกับเต็มรูป · ใบลดหนี้ · (CN) · counter tables) = `counter`/`external` · no safety on navigate/modal rows | external row → money; navigate row → "bogus" |
| R13 | §4 R13 | every message key that `expect.note` **names** — `msg:pos.…`, `pos.….*` (subtree), or `pos.…` right after คีย์/ข้อความ/ข้อความตั้งต้น/key/message — exists in `src/messages/th` (leaf or subtree). Plain `pos.x.y` tokens are permission keys/audit actions, not message keys | add `msg:pos.p41.probe.missing` |
| R14 | §4 R14 | same set in `src/messages/en` | same |
| Z1 | prompt | no residue without DB: registry hash + `git status` (scripts ledger src prisma) equal before/after the run · R7 temp folder gone | fake changed state |

Flags: `--list` prints 15 ids (X-coverage S=14 -=1) · `--no-db` = same static run · `JSON_SUMMARY` has total/passed/failed/probes · exit 1 when red. Pin `const PIN = process.env.P41_PIN || "6e32c1e2"` is used by R5 only (git show, no diff ⇒ no LANE_PIN needed). Oracle lint: `bash scripts/pos-oracle-check.sh /root/projects/shark-pos-b qc-pos-p4.1 --base 6e32c1e2` → **VERDICT green (red 0 · warn 0)**. Single-file `tsc --strict` (es2017/bundler, project options) exit 0 (positive control: injected type error is reported).

## Red-before
Run on the base registry + base `fitness-pos.mts` (both restored from `6e32c1e2` for the run, then `git checkout HEAD --`), command `bash scripts/iso.sh pnpm exec tsx scripts/qc-pos-p4.1.mts` (≈ 25 s):

| id | base 6e32c1e2 | oracle head 520581b3 | why |
|---|---|---|---|
| R1 | 🔴 | 🔴 | 214 rows without target/state |
| R2 | 🔴 | 🔴 | 145/195 mutations without valid db / oracle id |
| R3 | 🔴 | 🟢 | base: `$fields` lacks the 4 keys · head: schema doc added, no row uses the keys yet (green by design, probe red ✅) |
| R4 | 🔴 | 🔴 | base: `$roles`+ROW_ROLES lack public; 60/60 public-page rows not `["public"]` · head: only the 60 rows |
| R5 | 🔴 | 🔴 | 19 in-scope debt (registry + live scan) · base also lacks `$legacyOut` |
| R6 | 🔴 | 🔴 | no `$mockupGaps` (1 positive difference: 08-reports inputs +1) |
| R7 | 🟢 | 🟢 | F15.3a/b green; probe red ✅ (F15.3b red through the duplicate row even before the O8 fix) |
| R8 | 🟢 | 🟢 | 638 test-used ids, 0 ghosts (314 not in registry = non-interactive, exist in code); probe red ✅ |
| R9 | 🟢 | 🟢 | 453 rows with hiddenFor, all valid; probe red ✅ |
| R10 | 🔴 | 🔴 | 15/15 refusal cards have no row |
| R11 | 🔴 | 🔴 | 22/22 money rows without safety |
| R12 | 🔴 | 🔴 | 9/9 external rows + 3/3 document-number rows without the right safety |
| R13 | 🟢 | 🟢 | 4 named keys exist in th; probe red ✅ |
| R14 | 🟢 | 🟢 | same in en; probe red ✅ |
| Z1 | 🟢 | 🟢 | probe red ✅ |

Base: **9/14 R-checks red** (R1 R2 R3 R4 R5 R6 R10 R11 R12) · green-by-design R7 R8 R9 R13 R14 (+Z1) each proven red-capable by its probe (`JSON_SUMMARY.probes` all true). Head: 8 red (R3 turns green after the schema doc).

fitness-pos (lane command `bash scripts/iso.sh pnpm exec tsx scripts/fitness-pos.mts`): before (6e32c1e2) 8/8 · after 88d121d6 8/8 · after af7278e9 8/8 · after 65003952 8/8 (`JSON_SUMMARY {"total":8,"passed":8}`). `qc-pos-p2.14 --no-db` after the gates row: 15/15 (G1/G2/G3 green).

## Registry statistics the builder must zero (head 520581b3 · 1,156 rows)
Counts are live — the builder starts after P3-SKEL U merges, so the numbers will move; the oracle recomputes them.

- **R1 — 214 rows without target**: sales 50 · register 35 · /r/[token] 24 · products 21 · /q/t/[qrToken] 21 · products/price-rules 15 · settings 15 · tables 10 · orders 8 · /q/[linkToken] 6 · stock 4 · /q/o/[orderToken] 3 · /d 2.
- **R2 — 145/195 mutations**: settings 37 · register 24 · orders 18 · tables 15 · kds 9 · stock 8 · sales 8 · products 8 · /r/[token] 6 · /q/t/[qrToken] 4 · products/price-rules 3 · /d 2 · shifts 1 · /q/o/[orderToken] 1 · reports 1. Malformed db (model only, no field/state): `pos-settings-staff-pin-next`="PosStaffPin" · `pos-settings-api-create-submit`="ApiKey" · `pos-reports-anomaly-card-*`="KanbanCard(sourceKey …)". The 44 rows whose `oracle` is a suite name only (`qc-pos-p2.6` …) do not count — name a check id (`P2.6-C3` or `qc-pos-p2.6#P2.6-C3`).
- **R4 — 60 rows → `roles: ["public"]`**: /r/[token] 24 · /q/t/[qrToken] 21 · /q/[linkToken] 6 · /d 4 · /q/o/[orderToken] 3 · /developers/pos 2.
- **R5 — debt (46 elements, live scan = registry)**
  - in scope (19, must reach 0 — add data-testid + registry rows + lower `baselineDebt`):
    - `src/app/app/sys/[id]/pos/products/page.tsx` 12: ModuleTabs@65 · EmptyState@124 @129 @154 @159 · Link@146 @168 · form@179 · input@184 @185 @195 · SubmitButton@206
    - `src/app/app/sys/[id]/pos/close/page.tsx` 3: ModuleTabs@65 · form@70 · button@75
    - `src/app/app/sys/[id]/pos/close/CloseDayTools.tsx` 2: input@57 · button@85
    - `src/app/app/sys/[id]/pos/sales/page.tsx` 1: ModuleTabs@58
    - `src/app/app/sys/[id]/pos/shifts/page.tsx` 1: ModuleTabs@84
  - legacy OUT (W29, stays documented debt, untouched):
    - `src/lib/modules/pos/register-ui.tsx` 22: button@81 @353 @364 @399 @406 @448 @531 @793 @814 @816 @817 · input@419 @588 @623 @624 @625 @737 @791 @792 @830 @835 · Toggle@568
    - `src/lib/modules/pos/register-legacy-page.tsx` 5: ModuleTabs@37 @72 · EmptyState@38 · Link@78 @94
  - ModuleTabs/EmptyState are shared components: the testid has to reach the DOM through a prop (the F15.3 AST counts the JSX tag at the call site — a `data-testid` attribute on the call site clears it).
- **R10 — 15 refusal rows to add** (`expect: {type: "ui", target: <same testid>, state: "refused"}`, roles = the roles that see the card, hiddenFor = the roles that do not): pos-kds-refusal · pos-orders-refusal · pos-price-rules-refusal · pos-products-refusal · pos-report-print-refusal · pos-report-refusal · pos-reports-ai-refused · pos-settings-api-refusal · pos-settings-refusal · pos-shift-refusal · pos-shift-x-refusal · pos-stock-*-refusal · pos-stock-count-refusal · pos-stock-refusal · pos-tables-refusal.
- **R11 — 22 money rows → safety**: register 12 (pos-reg-paydlg-form/-confirm/-retry · pos-pay-intent-manual/-regenerate/-retry · pos-discount-over-request · pos-mgr-pin-submit · pos-reg-deprcv-form/-retry/-submit · pos-reg-offline-bills-sync) · sales 5 (pos-bills-void-confirm · pos-bills-refund-retry/-confirm · pos-bills-refund-deposit-retry/-submit) · orders 3 (pos-ord-await-confirm-* · pos-ord-confirm-pay · pos-ord-chatpay-send) · shifts 2 (pos-shift-move-submit · pos-shift-offline-accept-*).
- **R12 — 9 external rows → `external`**: pos-bills-menu-reprint · pos-bills-reprint · pos-receipt-send-line · pos-receipt-send-email-form · pos-receipt-send-paydone-line · pos-receipt-send-paydone-email-form · pos-tbl-prebill-print · pos-tbl-prebill-copy · pos-ord-chatpay-send. **3 document-number rows → `counter`/`external`**: pos-taxinv-submit · pos-bills-refund-deposit-retry · pos-bills-refund-deposit-submit.

## `$mockupGaps` seed (R6)
Format: `"$mockupGaps": {"$doc": "…", "items": [{"mockup": "08-reports", "bucket": "inputs", "gap": 1, "reason": "…"}]}` (`gap` = exact difference · stale items are red).
Counts per mockup = mockup / registry rows of the mapped pages (b = buttons: classes btn tab sw cbx seg rad + `<button>` · l = links: lnk + `<a>` · i = inputs: inp sel + `<input|select|textarea>`; chip/pitem/opt/ri/kbd not counted):

| mockup | mapped pages | b | l | i | gap |
|---|---|---|---|---|---|
| 01-register | register | 8/233 | 1/12 | 3/42 | – |
| 02-payment | register | 11/233 | 1/12 | 0/42 | – |
| 03-tables | tables | 13/95 | 5/5 | 2/9 | – |
| 04-kds | kds | 15/22 | 0/3 | 0/3 | – |
| 05-mobile | register · stock | 4/265 | 2/15 | 2/68 | – |
| 06-products | products · products/price-rules | 17/80 | 3/4 | 5/20 | – |
| 07-shift | shifts · close | 10/33 | 1/1 | 1/13 | – |
| **08-reports** | reports · reports/print | 5/16 | 1/6 | **2/1** | **inputs +1** |
| 09-online-orders | orders | 15/58 | 0/3 | 2/16 | – |
| 10-settings-integrations | settings | 27/177 | 2/18 | 0/61 | – |
| 11-customer-display | /d · /r/[token] | 4/13 | 0/2 | 0/9 | – |
| 12-bills-refund | sales | 12/65 | 3/3 | 5/14 | – |
| 13-shift-open-lock | shifts · register | 4/266 | 1/13 | 0/54 | – |
| 14-member-hold | register | 12/233 | 0/12 | 4/42 | – |
| 15-taxinvoice-split | register · tables · /r/[token] | 25/339 | 5/19 | 6/59 | – |
| 16-stock-ops | stock | 13/32 | 1/3 | 4/26 | – |
| 17-settings-3 | settings | 23/177 | 1/18 | 7/61 | – |
| 18-onboarding | settings | 6/177 | 3/18 | 0/61 | – |
| 19-states | register · products · orders · settings | 12/529 | 2/36 | 1/131 | – |
| 20-en-ipad | register | 15/233 | 2/12 | 5/42 | – |
| 21-approval-plan | register | 21/233 | 0/12 | 4/42 | – |

Today one item is needed (08-reports · inputs · gap 1). The builder writes the reason (e.g. the mockup's second filter field that the real reports page does not have, or the input it is missing — check `08-reports.png`).

## Decisions for the controller (CD-P41-O*)
- **CD-P41-O1 (R2 rule)**: "DB check id" = any id listed by a `qc-pos-*` `--list` whose X-group is not S/P (1,897 ids from 43 suites). Static groups with other letters (p2.14 K/G/V/H) still count, which is lenient. `oracle` is split on space , # · | ; — `qc-pos-p2.6#P2.6-C3` and `P2.6-C3` both work. `db` must start with a real Prisma model (357 read from `prisma/schema/*.prisma`) and carry more than the model name.
- **CD-P41-O2 (R3 schema)**: opener/needs semantics copied from `crm-ui-inventory.json` `$fields` (so the P4.2 walker can port `qc-crm-buttons.mts`); `viewport` = desktop/tablet/mobile (string or list), where the CRM only had desktop/mobile. All three are written into `$fields` (65003952).
- **CD-P41-O3 (R4)**: public rows use exactly `["public"]` (hiddenFor free). The builder must re-run the suites that read public-page rows (p2.14 V3 only checks rows exist; p1.3 S5.5 reads register rows only — expected unaffected).
- **CD-P41-O4 (R6)**: the mockup→page map and the class buckets are oracle constants (`MOCKUP_PAGES`, `MOCKUP_BUCKET_*`). Comparing the aggregate per bucket is a floor, not a 1:1 match (CRM §7 does the same). 18-onboarding has no page of its own and is mapped to settings.
- **CD-P41-O5 (R5)**: `$legacyOut` was added by the oracle writer in the schema commit (doc block, W29), so the builder only has to close the 19 in-scope debts. The `removed` escape hatch exists for a debt file whose controls legitimately moved to a child component.
- **CD-P41-O6 (R11/R12 lists)**: `MONEY_ACTIONS` (17), `MONEY_MODELS` (8), `EXTERNAL_ACTIONS` (4) + text, and `COUNTER_ACTIONS` (2) + text are oracle-owned and can change only by ORACLE-EDIT. A sale or refund row may be `money` or `counter` (R11 accepts both — recommendation: `counter` for rows that consume receipt/CN numbers, so the walker presses them at most once per run). R12 does not require `oracle` on external rows: that is P4.2 W3.
- **CD-P41-O7 (R8)**: "exists" = in the registry, or anywhere in `src` (data-testid, string literal passed as a prop, composed `${testId}-x`, or narrow pattern ≥ 8 literal chars). Code patterns like `${a}-${b}` / `pos-${x}` are too broad to vouch. The 314 test-used ids not in the registry are non-interactive containers/messages (`pos-reg-root` …). This rule does not put them into the registry.
- **CD-P41-O8 (F15.3b hole, commit af7278e9 — please rule)**: `src/components/pos/register/OptionsDialog.tsx` has `` data-testid={`${CARD_TESTID_PREFIX}${product.id}`} `` → normalised `*` → F15.3b's `inCode()` accepted **every** registry row, so the ghost-row rule was switched off for the whole registry. The fix ignores code patterns with < MIN_PATTERN_CHARS literal characters. Today it adds 0 ghosts (fitness-pos 8/8), and a ghost row is now red. R7 does not depend on it: the R7 probe also uses a duplicate row.
- **CD-P41-O9 (kind notice, same commit)**: refusal cards are `role="alert"` divs, and no existing kind fits them. `notice` is proposed. R10 accepts any valid kind, so dropping af7278e9 only means the builder picks an existing kind. The `$fields.kind`/`$roles` text in 65003952 mentions notice and would then need a one-line doc edit.
- **CD-P41-O10 (R10 set)**: `pos-visual-sweep.json.refusals` is `{}` today, so the set comes from code: 15 ids, including `pos-reports-ai-refused` (AI panel refused state) and the pattern `pos-stock-*-refusal`.
- **CD-P41-O11 (R13/R14 convention)**: only named references count (`msg:` · `.*` · after คีย์/ข้อความ/key/message). 4 references today. The builder should write `msg:pos.…` when a note cites a message key.
- **CD-P41-O12 (pins)**: `P41_PIN` default `6e32c1e2` = the base. It is only used for R5's "controls did not shrink" comparison, so no re-pin is needed after merge (the comparison stays against the pre-P4.1 counts). There are no file-must-not-change checks, so there is no LANE_PIN.
- **Observation**: one registry row sits on `/app/u/[unitSlug]/restaurant/kds` (legacy restaurant KDS page). No P4.1 check rejects it. The P4.2 walker must know it is not a POS page.

## Commands used
`bash scripts/iso.sh pnpm exec tsx scripts/qc-pos-p4.1.mts` (`--list` · `--no-db`) · `bash scripts/iso.sh pnpm exec tsx scripts/fitness-pos.mts` · `bash scripts/iso.sh pnpm exec tsx scripts/qc-pos-p2.14.mts --no-db` · `bash scripts/pos-oracle-check.sh /root/projects/shark-pos-b qc-pos-p4.1 --base 6e32c1e2` · `bash scripts/iso.sh pnpm exec tsc --noEmit --strict … scripts/qc-pos-p4.1.mts`. Logs: `/tmp/claude-0/-root/9878a238-0754-5958-805a-a0391fccc617/scratchpad/p41/` (redbefore-base.log · run-head.log · fitness-pos-*.log · p214-nodb.log · debt.txt).

## Builder prompt hints
`P41_PIN=6e32c1e2` (default already) · touches `scripts/pos-ui-inventory.json` + data-testid in the 5 in-scope debt files (U-type edits) · regression: fitness-pos · fitness ±env · qc-pos-p1.3 · qc-pos-p3.4 (ST7) · qc-pos-p2.14 (V3/V4/G1/G2) · p1.1/p1.3 merge set · typecheck 8192. No `visual-pos.mts` edits.

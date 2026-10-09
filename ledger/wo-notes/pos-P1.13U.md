# POS P1.13U — builder notes (15A full-tax-invoice dialog · pay-footer toggle · bills drawer issue/approve/reject · PayDone cell · visual)

Builder U · VPS account B · 9 Oct 2026 · tree `/root/projects/shark-pos-d` · branch `wip/pos-p1.13u` from `origin/session/pos` f84d10f3 (P1.13 S accepted at d9fec398).
Contract: `ledger/pos-briefs/pos-prompt-accountB-P1.13U.md` rulings 1–9 + reviewer lows N1–N5 · `ledger/wo-notes/pos-P1.13.md` "P1.13U contract".

## Step 0 — reviewer lows (S review)
| item | commit | change |
|---|---|---|
| N1 | 32ea615f | `account/service.ts supersedeExternalSaleAbb`: `buyerMatches` compares kind (legalType PERSON/COMPANY), name, taxId, branchCode, address, email — same fields as `sameTaxInvoiceBuyer` (+11/−2) |
| N2 | 32ea615f | `tax-invoice.ts issueCore`: claim lost after `conv.created` ⇒ `logOps("WARN", "pos.taxInvoice", …saleId… docId…)` (no buyer data) (+4) |
| N3 | 12f4cba7 | ORACLE-EDIT (separate `test(...)` commit): S4 loses the vacuous "unlinked POS has no doc/event" lines (S5 owns it); count unchanged 32 |
| N4 | 32ea615f | P1.11 request email ≤120 (`receipt-tax-request.ts EMAIL_MAX`) + public form `maxLength={120}` (`PosReceiptActions.tsx`) |
| N5 | 32ea615f | `account-bridge.ts`: consumer WARN text branches on `res.reason` — lines rejected (reason ≠ unlinked, no doc) vs book ineligible (+9/−1) |

## Server hunks (P1.13U)
- Ruling 2 (`15676205`, 10 lines): `tax-invoice.ts taxInvoiceEligibleForSystem(tenantId, systemId)` = `abbEligible(…, 1)` (VAT book linked · vatRegistered · ABB on · book taxId; VAT > 0 is per bill so excluded) (+5) · `register.ts registerStatus` returns `taxInvoiceEligible` (`.catch(() => false)`) (+3/−1 incl. import) · `RegisterStatus.taxInvoiceEligible: boolean` (+2).
- Ruling 4 (same commit, needed for "15A prefilled from the request"): `BillDetail.taxInvoice` for REQUESTED gains `buyerName` + `request {name, taxId, branchCode, address, email}` (`bills.ts` +7/−1 · `bills-shared.ts` +8/−1). Additive; ISSUED/NONE unchanged.
- ORACLE-EDIT U1 (`dbcd251a`, ruling 8): `registerStatus(ctx, owner).taxInvoiceEligible` = true on POS-A (linked VAT book) / false on POS-N (unlinked). `pos-P1.13-oracle.md` count 32 → 33 (+ N3 note).

## Screens built
1. **15A `TaxInvoiceDialog`** (`src/components/pos/register/TaxInvoiceDialog.tsx`, shared by register + bills drawer; testids `pos-taxinv-*`): segmented บุคคลธรรมดา | นิติบุคคล (default from the 13th-digit-complete tax id: `0` ⇒ นิติบุคคล until the user picks) · tax id strips spaces/dashes as typed, ✓ on 13 digits + mod-11, red "เลขไม่ถูกต้อง" otherwise · "ค้นจากกรมพัฒน์ (DBD)" only for นิติบุคคล + valid checksum → `lookupBuyerByTaxIdAction`: found = result card + "ใช้ข้อมูลนี้" (name/address/00000, `source:"DBD"`) · `found:false` = "ไม่พบใน DBD · กรอกเอง" · `DBD_NOT_CONFIGURED` = button hidden for the session (parent flag) + "กรอกเอง" · other refusals inline via `taxInvoiceRefusalKey` · name ≤120 · address ≤300 · branch radio สำนักงานใหญ่ (00000) | สาขาที่ (5 digits) · email optional ≤120 · info line (ruling text) · member attached ⇒ "จำไว้กับสมาชิก …" checkbox + prefill from `buyerProfileForMemberAction` (`source:"PROFILE"`, chip "ใช้ข้อมูลที่จำไว้"); editing name/address/taxId resets source to MANUAL · client validation with `parseTaxInvoiceBuyer` before send · buttons ยกเลิก / บันทึกและกลับไปชำระ (sale) or ยกเลิก / ออกใบกำกับ (issue).
2. **Register** (`RegisterScreen`, `CartPanel`, `InterimPayDialog`): cart footer "ใบกำกับเต็มรูป" opens 15A (dot + bold when a buyer is set) · pay-dialog footer switch "ออกใบกำกับภาษีเต็มรูป" (`pos-taxinv-toggle`): off→on opens 15A, on→off clears the buyer; line "— <name> · <taxId> · สำนักงานใหญ่|สาขา <code> · แก้" (`pos-taxinv-footer-line`, `pos-taxinv-edit`) · state `taxInv {buyer, remember}` lives only in client cart state: `resetBill` (new bill · hold · recall · after sale) clears it — held carts never carry the buyer, the footer line simply disappears on recall (ruling 1) · submit: `sale.taxInvoice = buyer` + `rememberBuyer: true` only with a member · `registerStatus.taxInvoiceEligible === false` ⇒ cart button muted (aria-disabled + title) and tap = toast "ร้านนี้ยังออกใบกำกับภาษีไม่ได้ · ตรวจการเชื่อมบัญชี/เลขผู้เสียภาษี"; pay switch muted with the same reason next to it; 15A does not open · pay-time refusals NOT_ELIGIBLE / TAX_ID_INVALID / VALIDATION show in the pay-dialog error card via `refusalMessageKey`; TAX_ID_INVALID also reopens 15A with the inline error.
3. **PayDone** (02b): cell "ใบกำกับเต็มรูป · กำลังออกในบัญชี" (`pos-taxinv-done`) when the sale was submitted with a buyer (no polling). Nothing else changed.
4. **Bills drawer** (`BillsClient` + page): ISSUED ⇒ row "ใบกำกับเต็มรูป <docNo> · <buyer>" replaces the ABB row (accounting row/link unchanged — it already points at the TAX_INVOICE) · NONE + ABB ⇒ "ใบกำกับอย่างย่อ <receiptNo> · [ขอใบเต็มรูป]" → 15A later-issue → `issueFullTaxInvoiceAction({systemId, unitId, saleId, buyer, rememberBuyer?})` · REQUESTED ⇒ "ลูกค้าขอใบกำกับเต็มรูป · <buyer>" + [ปฏิเสธ] [ออกใบกำกับ]: issue opens 15A prefilled from the request (kind from the tax id, ruling 7) — unchanged data ⇒ `issueFromTaxInvoiceRequestAction`, edited ⇒ `issueFullTaxInvoiceAction` + `requestId`; reject = sheet (reason ≤200) → `rejectTaxInvoiceRequestAction` · buttons only when `canIssueTaxInvoice` (page: `evaluate(m, pos.taxinvoice.issue @ unit)`; OWNER/MANAGER implicit) · no PIN/token flow for issue · refusals inline in 15A via `taxInvoiceRefusalKey`; ALREADY_ISSUED also refreshes the drawer · success ⇒ toast "ออกใบกำกับเต็มรูป <docNo> แล้ว" + list/drawer refresh · drawer header chip unchanged · Esc closes the dialog/sheet first (drawer Esc handler paused while they are open).

## Keys · testids · inventory
- `pos.register.taxInvoice.*` (40 keys) and `pos.bills.taxInvoice.*` (14 keys) th+en; reuse `pos.register.errors.taxInvoiceNotEligible` / `taxIdInvalid` and `pos.taxInvoice.errors.*`.
- testids `pos-taxinv-*` (26 inventory rows: 18 on `/pos/register` — dialog rows note that the same dialog serves `/pos/sales` — and 8 on `/pos/sales` for the drawer/reject sheet; `pos-reg-tax-invoice` row updated: modal, WO P1.13U). F15.3a/b green.

## Deviations from 15A / 02 / 12 (each with its ruling)
1. 15A chip at pay time shows the bill total only (no receipt number exists before submit); the drawer chip is "<receiptNo> · ฿<total>" as in the mockup — ruling 1.
2. "จำไว้กับสมาชิก <name>": the register has no member name (P1.12 member card not built; memberId only arrives via recall) ⇒ "จำไว้กับสมาชิกของบิลนี้"; the drawer shows the real name — ruling 3.
3. Info line uses the ruled text without a document number (mockup "INV-2609-0042") — ruling 3.
4. Pay footer: the "ส่งใบเสร็จ พิมพ์/LINE/อีเมล" row of 02 is not part of P1.13U; the tax-invoice row sits above the existing tip row — ruling 1.
5. Not-eligible cart button stays tappable (aria-disabled + toast with the reason) instead of `disabled`, so touch users get the reason — ruling 2 ("render muted with … and 15A does not open").
6. "ขอใบเต็มรูป" hidden on VOIDED / refunded bills (server would answer SALE_VOIDED / HAS_REFUNDS); TOO_LATE / ACCOUNT_PENDING surface inline after the attempt — ruling 4.
7. Reject reason capped at 200 in the UI (server accepts 500) — ruling 4.

## Visual (ruling 9 · `scripts/visual-pos.mts`)
- register `--states`: `taxinvoice-dialog` (cart3 → cart footer → 15A นิติบุคคล + QC tax id 0105559012342 ✓ · DBD button or "กรอกเอง") · `taxinvoice-set` (cart3 → pay → switch → fill → save → footer line). Before chromium `prepTaxInvoiceBook()` = `ensureAbbBook()` (extracted from `seedRpubOnce`; restored in `cleanRpub`, now also when only these states ran).
- sales `--states`: `bill-taxinvoice-requested` (coffee ABB bill + `requestFullTaxInvoice` P1.11 module function; request + its outbox deleted in finally/signal) · `bill-taxinvoice-issued` (coffee ABB bill → `issueFullTaxInvoice`; the TX doc stays in QC4 accounting — docId/docNo in `summary-<user>.json taxInvoiceState`). Bills reused per Thai day by key `posqc-p113u-<date>-req|iss-` (no extra TX on reruns); own device/shift `posqc-vis-taxinv-<pid>` closed in finally. Cashier variant asserts no issue button.
- Real shots need a running server ⇒ CONTROLLER-RUN. Dry plans rc listed under Gates.

## Follow-ups
1. P1.12: pass the member name to 15A on the register ("จำไว้กับสมาชิก <name>").
2. P1.15U merge: any approval/held re-submit path must resend `taxInvoice` (follow-up (d) of P1.13 S) — checked at merge time (see Merge).
3. DBD result `status` is shown raw from the facade (Thai on prod per `account/dbd.ts`).

## Commits (each pushed after `pnpm typecheck` TC_EXIT=0 on a `git archive` copy of that commit · logs `scratchpad/p113u/tc-<sha>.log`)
32ea615f N1/N2/N4/N5 · 12f4cba7 ORACLE-EDIT N3 · 15676205 server hunks (ruling 2 + 4) · dbcd251a ORACLE-EDIT U1 · 6de37219 15A + cart/pay wiring + PayDone + keys · 1aa31548 bills drawer · 95f63f3c visual states · b503410b notes · 4d37b210 merge `origin/session/pos` 1e32b118.

## Merge
`origin/session/pos` at finish = 1e32b118 (ledger-only since f84d10f3) → merge 4d37b210, no conflicts; diff b503410b..4d37b210 = `ledger/POS-RESUME.md` only, so the code gates below (run on b503410b) hold for the merged head.
**P1.15U was not in `session/pos` when this WO finished** (polled until 09:38Z; `origin/wip/pos-p1.15u` still 9cb8ca49). A `git merge-tree` trial of HEAD × `origin/wip/pos-p1.15u` shows overlaps in RegisterScreen, BillsClient, register-shared/register.ts (refusal-code unions), messages th/en, pos-ui-inventory.json, visual-pos.mts and register/page.tsx — whichever merges second keeps both features (P1.13U: `taxInv` state + `TaxInvoiceDialog` layer + `taxInvoice` props; P1.15U: lock screen / token flow / approvals). When P1.15U's approval/held re-submit lands, it must spread `taxInvoice`/`rememberBuyer` like `confirmPay` does (follow-up (d) of P1.13 S).

## Gates (QC4 `ep-frosty-lab-aoylqlv8-pooler…` · POS gate lock · head b503410b ≡ merged 4d37b210 code · logs `scratchpad/p113u/g1/`)
- typecheck (iso + `/tmp/pos-gate.lock`, 5632 MB): TC_EXIT=0 for 12f4cba7, 6de37219, 1aa31548, b503410b.
- `qc-pos-p1.13` forced #1 **0 · 33/33** · forced #2 **0 · 33/33** · unforced **0 · 33/33** (32 + U1 · residue 0 each run).
- `qc-pos-p1.11` 0 · 38/38 · `qc-pos-p1.16` 0 · 28/28 · `qc-pos-p1.3` 0 · 128/128 · `qc-pos-p1.10` 0 · 40/40 · `qc-pos-p1.15` 0 · 36/36 (S suite on this base; P1.15U not merged yet) · `qc-pos-p1.7` 0 · 32/32 · `qc-hf-pos-page-authz` 0 · 56/56.
- `pnpm fitness` without env 0 · 41/41 · with QC4 env 0 · 41/41 · `scripts/fitness-pos.mts` 0 · 8/8.
- visual `--page register --states --dry` owner 0 · cashier 0 · `--page sales --states --dry` owner 0 · cashier 0 (plans include the 4 new states × 3 viewports).
- Real visual shots = CONTROLLER-RUN (needs a running server): `pnpm exec tsx scripts/visual-pos.mts p113u --page register --states --user owner|cashier` and `--page sales --states --user owner|cashier`; the sales owner run leaves one TX document in QC4 accounting (docId/docNo printed and in `summary-owner.json taxInvoiceState`).

## Fix round 1 (reviewer verdict on 5599d412 = MERGEABLE-AFTER-FIXES · prompt `pos-prompt-accountB-P1.13U-fix.md`)
Edits started only after `build42-d-*/SUMMARY.txt` DONE (09:51Z); F5 and DB suites only after `ctl/vis42-done` (10:07Z).
| item | commit | change |
|---|---|---|
| F1 | 0b5dcc7b | `TaxInvoiceDialog`: the DBD reply is bound to the tax id it was sent for (`lookupFor` + current-id ref); a reply for another id is dropped, the input stays editable during the lookup, "ใช้ข้อมูลนี้" re-checks the id; `DBD_NOT_CONFIGURED` still hides the button (shop-wide) |
| F2 | 1b4843c2 | `bills.ts`: `BillDetail.taxInvoice.request` only when `evaluate(a, pos.taxinvoice.issue @ unit)`; `buyerName` for every reader (type already optional) |
| F3 | c4175663 | `BillsClient`: `requestId` sent to `issueFullTaxInvoiceAction` only when the tax id equals the request's — a changed id lets the service reject the request (S fix F5 + audit) and the drawer refresh shows ISSUED without the request row · 15A shows `pos-taxinv-request-changed` ("เลขผู้เสียภาษีต่างจากที่ลูกค้าขอ — คำขอจะถูกปฏิเสธ และออกใบกำกับตามที่กรอก") before confirm · key `pos.bills.taxInvoice.requestTaxIdChanged` th+en · inventory row |
| F4 | 4c60b760 | `TaxInvoiceDialog`: `touched` ref (any input, kind pick, branch click) ⇒ the stored-profile reply no longer prefills |
| F5 | f8877009 | `visual-pos.mts seedTaxInvBillsOnce`: leftover REQUESTED requests (+ `pos.receipt.taxInvoiceRequested` outbox rows) on the reused bill are deleted before the new request (`taxInvoiceState.leftover`) |
| F6 | 76ca8f1b | drawer REQUESTED row: [ออกใบกำกับ] only on PAID bills without refunds; [ปฏิเสธ] stays |

Gates (QC4 `ep-frosty-lab-aoylqlv8-pooler…` · logs `scratchpad/p113u/f1/` with `tree=/root/projects/shark-pos-d head=f8877009` headers): typecheck TC_EXIT=0 (76ca8f1b, f8877009) · `qc-pos-p1.13` forced #1/#2 + unforced 0 · 33/33 each, residue 0 · `qc-pos-p1.11` 0 · 38/38 · `qc-hf-pos-page-authz` 0 · 56/56 · `pnpm fitness` no env 0 · 41/41 · QC4 env 0 · 41/41 · `fitness-pos` 0 · 8/8 · visual `--dry` register/sales × owner/cashier rc 0.

### Visual review items (vis42 on 5599d412)
- **V1** (a8ede518) `register-taxinvoice-set-owner-1440x900`: the set state rendered the full label bold + dot and truncated to "ใบกำกับเต็...". Now, once a buyer is set, the button shows the ✓ icon (instead of the doc icon) + the short label "ใบกำกับ" at every width (no dot), border/bold kept, testid unchanged, aria-label "ใบกำกับเต็มรูป · ตั้งผู้ซื้อแล้ว". Width budget: xl column ≈141 px − 28 padding − 12 icon − 6 gap ⇒ ≈95 px for "ใบกำกับ" (≈50 px bold 14); 1024 column ≈112 px − 12 − 12 − 5 ⇒ ≈83 px (≈46 px at 13). Dry plans rc 0.
- **V2** (pre-existing, not P1.13U — recorded as follow-up): `sales --user cashier --states` generic states fail "ไม่เห็นบิลเป้าหมายในหน้าแรกของรายการ". Cause: `existingBillsSet()` (cashier path of `seedBillsOnce`) loads today's BILL_TAG bills `orderBy createdAt asc` and returns `rows.find(PAID && refunded 0 && shiftId)` = the **oldest** qualifying bill of the day (the "mixed" bill of the day's first set), not the target of the newest set. vis42 log: owner seeded target `cmv0sqpef…`, cashier reused `cmv0isa3j…` (an earlier run's set) — with 64 bills that day it is not on page 1 (10/page, newest first). The function is byte-identical on `origin/session/pos` (md5 1682a665… on both); P1.13U's seeding (`seedTaxInvBillsOnce`, `ensureAbbBook`) runs before `seedBillsOnce` and sells only in the owner run, so it does not move the target. Suggested fix (P1.16 owner): pick the newest set's target (`orderBy desc` + the last-sold PAID line-set bill) or search by receipt number like `openBillBySearch`.

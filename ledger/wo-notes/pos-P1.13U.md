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

## Gates
(filled at the end)

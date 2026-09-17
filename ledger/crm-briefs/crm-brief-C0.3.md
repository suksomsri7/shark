# C0.3 — Facades CRM needs in other modules (additive only, zero behaviour change for existing callers)
Read `crm-brief-COMMON.md` first. One builder per sub-part is allowed (A–F own disjoint files); ONE oracle file `qc-crm-c0.3` with a section per sub-part.

## A. account (`src/lib/modules/account/index.ts` + the functions it re-exports)
Facts: `createExternalQuotation(input)` (index.ts:374) takes `title` + `valueSatang` and builds ONE line `{description: title, qty: 1, unitPrice: valueSatang}`; idempotent per `(systemId, QUOTATION, refType, refId)`; has no actor field; returns `{ok, docId, created} | {ok:false, reason}`; never throws when the CRM system is not linked to an account system (`findAccountLinkFor`). Lines model: `AccountDocumentLine {qty Decimal(12,4), unitPrice Int satang, discount Int satang, vatRateBp default 700 (0 = 0 %, −1 = exempt)}`; `LineInput = {description, qty, unitName?, unitPrice, discount?, vatRateBp?}` (`totals.ts:20`). Existing but NOT on the facade: `convertDocument(tenantId, systemId, id, toDocType, createdById?)` (service.ts:2290; source must not be DRAFT), `issueDocument` (:2124), `setQuotationResponse(tenantId, systemId, id, accepted)` (:2264; requires status `AWAITING_ACCEPT`), `createPaymentRequest(ctx, documentId, {financeId, expiresInDays?, userId?})` (payment-request.ts:191; public page `/pay/<token>`), `outstandingByContacts(tenantId, systemId, contactIds?) → Map` (:3923), `mergeContacts(ctx, input)` (contact-merge.ts:348), `findOrCreateCustomerContact(ctx, c)` (:3661; private). On the facade already: `listDocsByParty`, `writeAudit`, `getPublicPaymentPage`.
Deliver:
1. `createExternalQuotation` accepts optional `lines: LineInput[]`, `discountAmount?`, `validUntil?`, `note?`, `createdById?`. With no `lines` the result is byte-identical to today (golden test on the created document + lines).
2. Export (thin, tenant-checked wrappers): `convertQuotationToInvoice(ctx, quotationDocId, {createdById?})`, `respondQuotation(ctx, docId, accepted, {by: "STAFF"|"PORTAL", signer?: {name, ipHash, userAgent}})` (stores the signer evidence in the audit row; still requires `AWAITING_ACCEPT`), `createPaymentRequestForDoc(...)`, `outstandingByContacts`, `mergeContacts`, `ensureAccountContact(ctx:{tenantId, systemId}, {partyId, name, taxId?, branchCode?, phone?, email?, legalType})` (idempotent, race-safe), and NEW read `docLinkInfo(tenantId, docId) → {docId, systemId, docType, status, docNo, contactId, partyId, sourceDocId, refSystemId, refType, refId, grandTotal, paidTotal} | null` — CRM consumers need it because account events carry only `documentId`.
3. `approval/actions.ts:16` allowlist is missing `"AccountDocument"` although `approval-cap.ts` uses it — add it (existing bug) together with the four CRM types below.

## B. chat (`src/lib/modules/chat/index.ts`)
Facts: facade exports only `pushToContact({tenantId, channel, externalUserId, text, systemId?, customerId?})`. `ChatContact.partyId` exists but nothing writes it.
Deliver: `sendLineToParty(ctx, {partyId, text, systemId?}) → {ok, reason?}` (resolves the newest LINE `ChatContact` of that party in the tenant; never throws; NO consent logic here — callers decide) · `listConversationsByParty(ctx, partyId, {take≤50, unitAccess?}) → [{conversationId, systemId, channel, lastMessageAt, status, href}]` honouring the chat unit gate (`canAccessConvUnit`) · write `ChatContact.partyId` whenever a contact is linked to a member (`maybeAutoLinkMember`/`linkCustomer`) using the member's partyId.

## C. hr (NEW `src/lib/modules/hr/index.ts`)
Facts: `requestAdjustment(ctx:{tenantId, systemId}, {employeeId, periodKey "YYYY-MM", kind: …"COMMISSION", amountSatang?, note?, requestedById?})` (payroll.ts:107) creates a PENDING `HrPayAdjustment`; approval is HR's own 4-eyes `decideAdjustment`; `markPaid(ctx, runId)` (payroll.ts:436) emits nothing; `HrEmployee.linkedUserId` links a user.
Deliver: facade exporting `requestAdjustment`, `cancelAdjustment`, `employeeOfUser(tenantId, userId) → {employeeId, systemId, name} | null`, `isOnLeave(tenantId, userId, at) → boolean` (approved leave covering `at`). Move no code.

## D. inventory (NEW `src/lib/modules/inventory/index.ts`)
Export `listItems`, `listServices`, `getItem`, `searchItems(ctx, q, take≤50)` (new, name/sku/barcode, archived excluded). `InvItem` has NO VAT column — price = `priceSatang`; VAT comes from the account product/settings.

## E. party (`src/lib/modules/party/index.ts`)
Add `updateContactInfo(tenantId, partyId, {name?, phone?, email?}, tx?)` (normalises phone like `normalizePartyPhone`; records merge candidates instead of failing when the new phone/e-mail collides).

## F. approval registry
Entity types `crm.discount`, `crm.commission`, `crm.reassign`, `crm.portal_request` in `approval/labels.ts` + the allowlist in `approval/actions.ts:16` + NO-OP branches in `src/lib/approval-effects.ts` (each later owning work order fills its branch). 

## Files you own
A: account `index.ts`, the touched functions in `service.ts`/`payment-request.ts`/`contact-merge.ts` (wrappers only), `approval/actions.ts` line 16 · B: chat `index.ts`, `push.ts` or a new `party-bridge.ts`, the two link functions in `chat/service.ts` (one hunk each) · C: `hr/index.ts` · D: `inventory/index.ts` (+ `searchItems` in service) · E: party `index.ts`/`service.ts` · F: `approval/labels.ts`, `approval/actions.ts`, `src/lib/approval-effects.ts` · `scripts/fitness.mts` ALLOWED_EDGES lines for `crm→account|chat|hr|inventory|party|approval|member|kanban|storage|ai|forms`.

## Acceptance (oracle `qc-crm-c0.3`)
A: golden byte-equality of the legacy one-line quotation; 3-line quotation totals/VAT/discount exact; convert → invoice with `sourceDocId`; respond requires AWAITING_ACCEPT and records signer; `docLinkInfo` correct for quotation→invoice chain; `ensureAccountContact` ×10 in parallel → ONE contact (X3) · B: `sendLineToParty` with no LINE contact → `{ok:false}` no throw; conversations filtered by unit access (X1) · C/D/E: signatures + tenant isolation (X1) · F: a policy can be created for each new entity type.
X8: none of the new functions log phone/e-mail. 
Regressions (all must stay green): every `qc-acc-v2-*`, every `qc-account-api-*`, `qc-account-deep`, `qc-pos-account`, `qc-crm`, `qc-chat-core-v2`, `qc-chat-member-autolink`, `qc-chat-security-scope`, `qc-payroll`, `qc-hr-payadjust`, `qc-hr`, `qc-inventory*`, `qc-approval*`, `qc-member-fix-s2`.

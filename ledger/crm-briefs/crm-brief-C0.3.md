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

## Controller addendum 2026-09-17 (verified against `session/crm` @ C0.2)
Every fact in the brief above was re-checked against the code before work started. **All of them hold**, with the
name corrections and additions below. `ensureAccountContact`, `docLinkInfo`, `searchItems`, `sendLineToParty`,
`listConversationsByParty`, `employeeOfUser`, `isOnLeave`, `updateContactInfo` genuinely do not exist anywhere yet.

Verified line numbers (use these, not the ones in the prose, if they differ):
- `createExternalQuotation` — `src/lib/modules/account/index.ts:374`. Real signature: `{tenantId, sourceSystemId,
  sourceKind:"CRM", refType, refId, title, valueSatang, customer:{name,phone?,email?}, partyId?, sourceContactId?}`
  → `{ok:true,docId,created} | {ok:false,reason}`. It already resolves the contact by `partyId` first
  (`findOrCreateCustomerContact(ctx, {...customer, partyId})`) and is idempotent on `findDocByRef(systemId,"QUOTATION",refType,refId)`.
- `issueDocument` `service.ts:2124` · `convertDocument` `service.ts:2290` · `setQuotationResponse` `service.ts:2264` ·
  `outstandingByContacts` `service.ts:3923` · `findOrCreateCustomerContact` `service.ts:3661` ·
  `createPaymentRequest` `payment-request.ts:191` · `mergeContacts` `contact-merge.ts:348` · `LineInput` `totals.ts:20`.
  ⚠️ `actions.ts` also holds `convertDocumentAction` (:171), `issueDocumentAction` (:151), `mergeContactsAction` (:806) —
  those are server actions, NOT the functions to re-export. Do not confuse them.
- account facade today exports only `listDocsByParty` (:31), `getPublicPaymentPage` (:438), `writeAudit` (:476)
  plus `createExternalQuotation` — confirmed.
- chat facade today exports ONLY `pushToContact` + its two types (`chat/index.ts:10–14`) — confirmed.
  `ChatContact.partyId` exists (`prisma/schema/chat.prisma:135`) and the comment there already says it is meant to be
  set when `maybeAutoLinkMember` links a customer. Real functions: `maybeAutoLinkMember` `chat/service.ts:1319`
  (private, not exported), `linkCustomer` `chat/service.ts:2234`, `canAccessConvUnit` `chat/service.ts:1985`.
- hr: no `index.ts` — confirmed. `requestAdjustment` `payroll.ts:107` · `cancelAdjustment` `payroll.ts:168` ·
  `markPaid` `payroll.ts:436`. **There is no `isOnLeave` today**: leave lives in `hr/service.ts` (`requestLeave` :388,
  `decideLeave` :441) — you are writing `isOnLeave` from the approved-leave rows, read those functions first.
- inventory: no `index.ts` — confirmed. `listItems` `service.ts:793` · `listServices` :802 · `getItem` :811.
  `searchItems` does not exist and is yours to write.
- party facade exists and already exports `normalizePartyPhone`, `safeFindOrCreate`, `recordMergeCandidates`,
  `findDuplicateCandidates`, `listBriefsByIds` (`party/index.ts:24–88`) — `updateContactInfo` is the only addition.
- approval allowlist is `ENTITY_TYPES` in `src/lib/modules/approval/actions.ts:16` with exactly 7 values
  (`PurchaseOrder`, `HrLeave`, `member.merge`, `member.tier.manual`, `member.erase`, `member.point.adjust`,
  `member.voucher.issue`) — `AccountDocument` is indeed missing while `approval-cap.ts` uses it. Confirmed bug.
- `ALLOWED_EDGES` already contains `crm→account`, `crm→party`, `forms→crm`, `account→crm`
  (`scripts/fitness.mts:270,314,281,321`). Only the genuinely new edges get added, each with a reason.

### Split of the work (2 builders, disjoint files — MASTER-PLAN §5 allows 2)
- **Builder 1 = parts A + F** (they both touch `approval/actions.ts`): account facade + wrappers + `docLinkInfo` +
  `ensureAccountContact`, and the whole approval registry work incl. the missing `AccountDocument`.
  Builder 1 also owns the `ALLOWED_EDGES` block in `scripts/fitness.mts` for this work order.
- **Builder 2 = parts B + C + D + E**: chat, hr (new facade), inventory (new facade), party.
  If Builder 2 needs an `ALLOWED_EDGES` line it reports it and the CONTROLLER applies it (R-D rule for shared files).
Neither builder touches `prisma/schema`. One oracle file `scripts/qc-crm-c0.3.mts` with a section per sub-part.

### Standing decision for this work order
"Additive only, zero behaviour change for existing callers" is the acceptance bar, not an aspiration: the golden
byte-equality check on the legacy one-line quotation (A1) is the single most important check in the file. If any
existing caller's behaviour would change, stop and report instead of changing it.

### Controller decisions on the oracle's open questions (2026-09-17)
1. **`source` stays `MANUAL`** on CRM quotations. Changing it to `AccountDocSource.CRM` is a behaviour change and this
   work order is additive-only. The golden check pins `MANUAL`. Recorded as a hand-over note, not work.
2. **`lines[]` wins.** When `lines` is supplied, the document totals derive from the lines and `valueSatang` is IGNORED
   (callers may still pass it; it must not affect a single column). With no `lines`, today's one-line behaviour is
   byte-identical. Builders: do not "reconcile" the two — ignoring `valueSatang` is the specified behaviour.
3. **`sendLineToParty` keeps DISTINCT refusal reasons** ("no LINE identity for this party" vs "shop's LINE not
   connected"). One generic message would hide a misconfiguration from the caller and from us. Oracle SB.4 stays.
4. **`isOnLeave` is inclusive on Thai calendar days** — a one-day approved leave makes the person on leave at 12:00
   +07:00 that day. The `@db.Date` columns are midnight UTC, so compare through the repo's Thai-time helpers, never a
   raw `>=` against a JS Date (this is the documented Thai-date trap; getting it wrong silently assigns leads to
   people on leave). Oracle SC.7 stays.
5. **The thin-facade static checks (SC.8 / SD.7) stay MAJOR.** `hr/index.ts` and `inventory/index.ts` must be
   re-export facades that do not import `core/db`. The NEW functions (`employeeOfUser`, `isOnLeave`, `searchItems`)
   live in the module's own service/payroll files and are re-exported — which is what "Move no code" means.
6. **`listConversationsByParty` is SHOP-WIDE** within the tenant (all CHAT systems of that shop), honouring
   `unitAccess`, with `systemId` on every row. A CRM user asking "what conversations exist with this company" must not
   silently miss a second chat system. Oracle SB.6/X1.8 tightened accordingly.
7. **Keep `X3.3` (the cross-process race).** X3.1 alone would be passed by an in-process mutex, which is precisely the
   bug class that shipped in the member RUN (audit H5). The cost is acceptable inside the iso unit.
8. **X8 scope**: `account.contact.created/updated` already carry phone + e-mail (`account/events.ts:296`). Per
   RESOLUTIONS R-C 17 the scan covers only events this RUN adds or changes. Recorded as pre-existing debt for the
   hand-over; C0.3 does not fix it.

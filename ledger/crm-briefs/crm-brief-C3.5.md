# C3.5 — B2B customer portal (decisions C7, C15)
Read `crm-brief-COMMON.md` first. Contract: CRM-RUN §2 "C3.5". Spec: blueprint §3.13 (mockup 12), §5.9 portal, §11.8.

## Facts
- `/p/[slug]` is TAKEN by the PAGES module → the portal lives at **`/b/[slug]/*`** (owner may rename — keep the base path in ONE constant).
- Customer auth to reuse: `src/lib/modules/member/customer-session.ts` (`requestOtp`, `verifyOtp`, `loginWithLine`, `mintCustomerSession`, `getCustomerSession`, `revokeCustomerSession(s)`, `requireCustomer`, DB rate limits, `cs_` tokens, SUSPENDED rejected) + `customer-cookie.ts` + REST customer lane `src/lib/modules/member/api/customer-lane.ts`. Sessions are keyed to `Customer` — C3.0 added the portal subject (or `PortalSession`); extend the session module with a subject-aware path, do NOT fork the OTP/limiter logic.
- There is NO public quotation-accept route today. Accounting: `respondQuotation(ctx, docId, accepted, {by:"PORTAL", signer})` (C0.3; doc must be `AWAITING_ACCEPT`), `createPaymentRequestForDoc` → public pay page `/pay/<token>`, `listDocsByParty`, `outstandingByContacts`. Shell template: `src/app/m/[slug]/layout.tsx` (430 px frame, shop branding).

## Deliverables
invite (single-use token, hashed, 7-day expiry; e-mail/LINE) · login EMAIL_OTP / LINE (LINE identity must match the contact's e-mail/phone, else a staff-approved request) · company switcher (one contact ↔ many companies) · home (outstanding, quotes awaiting answer, recent activity) · quotations list/PDF/accept/reject+reason (signer name, time, ip-hash, UA stored with accounting) → stage moves through the existing consumer · invoices + pay link + slip upload (PRIVATE file; goes into accounting's existing slip flow) · receipts/tax invoices · documents (shared files + `portalVisible` custom records of OWN company, only `portalVisible` fields; edits of `portalEditable` fields become requests) · requests (issue → kanban card on `settings.portal.issueBoardId` or plain `CrmPortalRequest`; contact/profile change → approval `crm.portal_request`) with status mapping from card columns · contacts of the company · staff side: invite/revoke/see last login in company 360 · revoke ⇒ sessions dead immediately · events `crm.portal.viewed` (first view per day) / `.quote.responded` / `.request.created`.

## Acceptance (oracle `qc-crm-c3.5`, customer sessions minted in-process)
CRM-RUN S1–S7 (30).
X1 (critical): contact of company A requests quotation/invoice/document/record/request/file of company B by id → 404 everywhere (UI pages, REST customer lane, file route); internal deal data never in portal DTOs (`showDeals=false`) · X7 OTP request/verify + invite-accept limited by the DB limiter; unknown e-mail ⇒ same answer + same timing class as known; invite token single-use/expired ⇒ calm refusal; quote accept replay ⇒ idempotent; expired quotation cannot be answered · X10 slips/documents only via expiring links bound to the portal session · X8 portal pages never show other contacts' phone/e-mail beyond own company; cookie flags via `customerCookieOptions` · X9 staff invite/revoke audited.
Parity: mockup 12 with a customer session at 390 and 1440; shop branding applied.
Regressions: `qc-member-m2.9`, `qc-member-m3.11`, `qc-member-fix-s1`, `qc-pages` (`/p/[slug]` untouched), `qc-acc-v2-promptpay`, `qc-payment`, `qc-acc-v2-attachments`.

## Addendum (oracle author) — 26 ก.ย. 2569 · `scripts/qc-crm-c3.5.mts` (67 ข้อ = S0 4 · T0 2 · S1–S7 30 · X 30 · CLEAN)

The brief named the behaviour; the oracle had to pin **names, signatures, DTO keys, keys of buckets/events and the file layout**.
Everything below is **oracle-proposed — controller to confirm**; a different ruling ⇒ ORACLE-EDIT the named check before the builder
starts. The oracle resolves every function by name through `crm/portal.ts` first (also via `crm.portal.*`), then `customer-session.ts`
for the session helpers only — so "where a session helper lives" is the builder's choice, its **name** is not.

1. **Files** (S0.1–S0.2 · S7.x): `src/lib/modules/crm/portal.ts` (service, staff + customer sides) · `src/lib/modules/crm/portal-shared.ts`
   (pure: `PORTAL_BASE_PATH = "/b"` — the ONE constant; no other src file may hard-code `/b/${…}` — S7.1) · `src/lib/platform/crm-bridges/portal.ts`
   (R-D owner = C3.5) · facade block `// CRM C3.5 ▸ export * as portal from "./portal" ◂` in `crm/index.ts` · pages under `src/app/b/[slug]/`
   · staff components under `src/components/crm/portal/` (company 360 block) · consumers block `// CRM C3.5 ▸ … ◂` in `outbox-consumers.ts`.
2. **Routes under `/b/[slug]`** (S7.2 — every signed-in page calls `requirePortal(slug)`; every `[id]` page answers `notFound()`):
   `layout.tsx` (branding tokens · `portalShopBySlug` → `notFound()` · `export const viewport` · NO staff nav) · `page.tsx` (home) ·
   `login/page.tsx` · `invite/[token]/page.tsx` · `auth/line/route.ts` (verifies the LIFF id_token at api.line.me, then `loginWithLine`;
   cookie via `customerCookieOptions`) · `quotations/page.tsx` · `quotations/[id]/page.tsx` · `invoices/page.tsx` · `invoices/[id]/page.tsx`
   · `documents/page.tsx` · `documents/[id]/page.tsx` · `requests/page.tsx` · `contacts/page.tsx`. No `pay` route under `/b` (X10.3).
   REST customer lane: `/api/v1/crm/portal/*` in the existing CRM registry — at least `GET /portal/quotations`, `GET /portal/quotations/{id}`,
   `POST /portal/quotations/{id}/respond`, `GET /portal/invoices`, `GET /portal/invoices/{id}`, `POST /portal/invoices/{id}/pay-link`,
   `GET /portal/documents`, `GET /portal/records/{id}`, `GET|POST /portal/requests`, `GET /portal/requests/{id}`, `GET /portal/contacts`,
   `GET /portal/me`; `Authorization: Bearer <portal token>`; list data in `data.items`; no/unknown token ⇒ 401; a portal token on a staff op ⇒
   401/403; a member `cs_` token on the portal lane ⇒ 401/403 (X1.5).
3. **Session extension surface** (R-C.5 · subject = `CrmPortalAccess` · table `PortalSession`):
   `PORTAL_TOKEN_PREFIX = "cp_"` (≠ `cs_` — X10.2) · `isPortalToken(raw)` · `portalCookieName()` → `__Host-shark_portal` | `shark_portal`
   (same APP_ENV rule as `customerCookieName`) · `mintPortalSession(portalAccessId, {ip?, userAgent?})` → `PortalSessionToken {token,
   cookieName, sessionId, portalAccessId, companyId, crmContactId, crmSystemId, tenantId, expiresAt}` · `getPortalSession(token)` →
   `{sessionId, tenantId, crmSystemId, portalAccessId, companyId, crmContactId, role, expiresAt} | null` · `revokeAllPortalSessions(accessId)`
   · `requirePortal(slug)` (pages). Token = prefix + `randomToken(32)`, stored as `sha256(token)`; `ipHash` = salted hash (never raw, never an
   unsalted sha256 of the IP — X8.2). **Read-side rule** (S6.2 · X8.4): `getPortalSession` returns null when the session is revoked/expired,
   when the ACCESS has `revokedAt`, when the contact is archived/merged, when the contact's linked member `Customer` is not ACTIVE, or when
   the CRM system is not uiVersion 2 / `settings.crm.portal.enabled` is false. Mint refuses the same cases.
   Shared helpers extracted from `customer-session.ts` (names free, the oracle only proves behaviour): token mint/hash, OTP issue/verify on
   `CustomerOtp` (unchanged table, `customerId` null for portal rows), the DB limiter calls. The portal source never calls `otpCode()` or writes
   `CustomerOtp` itself (S0.4 static).
4. **Public entry points** (all in `crm/portal.ts`): `portalShopBySlug(slug)` → `{tenantId, systemId, name} | null` (first CRM system of the
   tenant with uiVersion 2 AND `portal.enabled`) · `acceptInvite(slug, {token}, meta)` → `PortalSessionToken` · `requestOtp(slug,
   {email?|phone?}, {ip?})` → same shape as the member `RequestOtpResult` (unknown e-mail ⇒ same keys, mail sent off the request path —
   X7.2) · `verifyOtp({otpId, code}, meta)` → `PortalSessionToken` (first OTP login of an invited access sets `acceptedAt`) ·
   `loginWithLine(slug, {lineUserId, email?, phone?, inviteToken?}, meta)` → `PortalSessionToken | {pendingApproval: true, requestId}` ·
   `switchCompany(token, companyId, meta)` → a NEW `PortalSessionToken` bound to the same contact's access of that company (no access ⇒
   NOT_FOUND) · `logout(token)`. Errors: `.code` ∈ NOT_FOUND | VALIDATION | FORBIDDEN | UNAUTHORIZED | RATE_LIMITED with Thai text; auth
   refusals reuse `CustomerAuthError` / `CustomerRateLimitError`; expired / used / unknown invite tokens get ONE identical message (X7.3).
5. **Limiter keys** (X7.1 · X7.4 — "no second limiter"): portal OTP request/verify use **exactly** the member buckets
   `customer-otp:target:<tenantId>:<EMAIL|PHONE>:<target>` · `customer-otp:ip:<ip>` · `customer-otp:verify:…` ⇒ member + portal requests
   for one e-mail share 3 / 10 min. Invite accept counts every attempt per IP through `checkRateLimitDb` (proposal: the verify-per-IP bucket,
   10 / 15 min); 11th attempt from that IP ⇒ RATE_LIMITED even with a valid token.
6. **Customer-side service** (first argument = the RAW token; every call re-resolves the session ⇒ revoke is immediate):
   `home(token)` → `{company:{id,name}, companies:[{id,name}], outstandingSatang, quotesAwaiting, openInvoices, recent:[…]}` (no deal data
   while `showDeals=false` — X1.4 scans every DTO for deal/pipeline ids, title, value and `deal*|pipeline*|stageId` keys) ·
   `listQuotations` / `getQuotation` → `{id, docNo, status, issueDate, validUntil, grandTotalSatang, canRespond}` (non-draft, own company;
   `canRespond=false` when `validUntil` passed) · `respondQuotation(token, docId, {accept, reason?, signerName}, {ip?, userAgent?})` →
   `account.respondQuotation(ctx, docId, accept, {by:"PORTAL", signer:{name, ipHash, userAgent}})`; reject needs a reason (VALIDATION);
   the reason is kept on the shop side (account audit `after.reason` or a PORTAL activity) and NEVER in an event payload; expired ⇒ calm
   refusal; replay idempotent; a later opposite answer cannot flip it · `listInvoices` / `getInvoice` → `{…, outstandingSatang}` (non-draft,
   own company) · `payLink(token, invoiceId)` → `{url, amountSatang, expiresAt}` via `createPaymentRequestForDoc` with the account's first
   receive-enabled finance channel (idempotent: same row, same `/pay/<token>`) · `uploadSlip(token, {invoiceId, filename, contentType, data},
   deps?)` → `{id, name, url}` (PRIVATE `uploadFile` + `AccountAttachment` on the invoice with a non-URL `fileUrl`) · `listReceipts`
   (RECEIPT + TAX_INVOICE of own company) · `listDocuments` · `getRecord(token, recordId)` → `{id, objectKey, title, fields:[{key, label,
   value, editable}], files:[{id, name, url}]}` · `requestRecordChange(token, recordId, {fieldKey, value})` → `{requestId}` · `listRequests`
   / `getRequest` → `{id, kind, title, status, progress, progressLabel, createdAt}` · `createRequest(token, {kind, title, body?, payload?})`
   → `{id}` · `listContacts` → colleagues of the CURRENT company only.
7. **Staff side**: `invite(ctx, actor, {companyId, contactId, role?, loginMethods?})` → `{accessId, inviteUrl, expiresAt}` (key
   `crm.portal.manage`; contact must be linked to the company; re-invite replaces the hash and resets the 7-day window) · `revoke(ctx, actor,
   {accessId, reason?})` → `{ok, sessionsRevoked}` · `listAccess(ctx, actor, {companyId})` → `{items:[{id, contactId, contactName, role,
   invitedAt, acceptedAt, lastLoginAt, revokedAt, status}]}` (no hash/token) · `decideRequest(ctx, actor, {requestId, approve, reason?})` ·
   audits `crm.portal.invite` / `crm.portal.revoke` / `crm.portal.request.decide` (targetId = access / request id — X9.1).
8. **Invite payload**: e-mail subject `เชิญเข้าพอร์ทัลลูกค้า <ชื่อร้าน>`, body = the link `${APP_URL}/b/<slug>/invite/<token>` + "ใช้ได้ 7 วัน ·
   ใช้ได้ครั้งเดียว" + shop name — no staff e-mail/phone, no deal data. LINE push (same link) only when the contact has `lineUserId` and the
   shop has a LINE channel (not exercised by the oracle). The plaintext token exists only in the returned `inviteUrl` and the message.
9. **LINE matching** (S1.4): the verified LINE e-mail (case-insensitive) or phone must equal the contact's (or `lineUserId` equals
   `CrmContact.lineUserId`), and the access must allow `LINE`. With an invite token and a mismatch ⇒ `CrmPortalRequest` kind
   `CONTACT_CHANGE`, payload `{reason:"LINE_IDENTITY", lineUserId}`, status PENDING, no session, invite not consumed.
10. **Request kinds → routing**: `ISSUE` (and `DOCUMENT_REQUEST`) ⇒ kanban card through `kanban/links.createCardFromExternal` on
    `settings.crm.portal.issueBoardId` (first column; sourceKey `crm:portal-request:<id>`), no board ⇒ plain request · `CONTACT_CHANGE` /
    `PROFILE_CHANGE` ⇒ `approval.submitForApproval({entityType:"crm.portal_request", entityId: request.id, systemId: crm})`, request keeps
    `approvalRequestId`; `approval.request.approved/rejected` consumer ⇒ APPROVED/REJECTED + `decidedAt`. A `portalEditable` field edit =
    `PROFILE_CHANGE` with payload `{recordId, fieldKey, value}` (value NOT applied until approved). Progress map (R-E.13): first column ⇒
    OPEN "เปิด" · `isDoneColumn` or last ⇒ DONE "เสร็จ" · other ⇒ IN_PROGRESS "กำลังทำ" (override `settings.crm.portal.statusMap`).
11. **`portalVisible` semantics**: a `CustomRecord` is visible iff its `CustomObject.portalVisible` and the record's parent is the CURRENT
    company (`parentType COMPANY`, `parentId = companyId`) — later: parent CONTACT = the signed-in contact; only fields with
    `MemberField.portalVisible` are returned; `portalEditable` ⇒ `editable:true` (edits become requests). "Shared files" = `CrmFileLink` on
    such records + the company's own portal uploads; COMPANY/CONTACT/DEAL-level staff files are NOT shown (S4.1).
12. **Private files** (X1.6 · X10.1): `PrivateFileViewer` grows `{kind:"PORTAL", id: PortalSession.id}` in `storage/private-links.ts`;
    `/api/files/[id]` resolves it from the portal cookie; links are minted per session (another session / a CUSTOMER viewer ⇒ 403).
13. **Events** (3 registries · ids only — X8.2 whitelist `companyId contactId accessId portalAccessId docId documentId action accepted
    requestId kind systemId day`): `crm.portal.viewed` key `crm.portal.viewed#<accessId>#<YYYY-MM-DD Thai>` {companyId, contactId, accessId}
    (first view per Thai day, X3.4) · `crm.portal.quote.responded` key `crm.portal.quote.responded#<docId>` {companyId, contactId, docId,
    action:"ACCEPT"|"REJECT"} · `crm.portal.request.created` key `crm.portal.request.created#<requestId>` {companyId, contactId, requestId,
    kind}. Stage moves stay with the EXISTING `account.quotation.responded` consumer (no second mover).
14. 🔴 **Race the builder must close** (X3.2): `account.setQuotationResponse` reads `status` then updates by id; the idempotency key of its
    event differs for accept/reject, so a parallel accept + reject can BOTH commit (ACCEPTED then REJECTED, two events). Either a guarded
    `updateMany … WHERE status='AWAITING_ACCEPT'` inside the account transaction (additive change in the account module, via its facade) or a
    row lock in the portal before calling it. Parallel identical accepts are already deduped by the event key (X3.1).
15. **PDPA hook**: `portal.eraseContact(ctx, contactId)` → `{accesses, sessions, requests}` deletes that contact's access rows (sessions
    cascade) and requests; C3.9's erase calls it. Deleting a contact row cascades the same (T0.2 · X8.3).
16. **UI testids** (S7.5, each with an inventory row, page `/b/[slug]/…`): `portal-login-email` · `portal-otp-request` · `portal-otp-code` ·
    `portal-otp-submit` · `portal-line-login` · `portal-company-switcher` · `portal-quote-accept` · `portal-quote-reject` ·
    `portal-reject-reason` · `portal-pay-promptpay` · `portal-slip-upload` · `portal-request-new` · `portal-request-submit` · staff
    `crm-portal-invite` · `crm-portal-revoke-*` (company 360 renders `src/components/crm/portal/*`).
17. **Mockup note**: mockup 12 (ข) shows "ดีลที่กำลังคุย 1" — that tile is rendered ONLY when `settings.crm.portal.showDeals = true`;
    with the default `false` no deal count/title/value reaches the DTO (X1.4).

### Not testable by this oracle (stated, not faked)
- Visual parity with mockup 12 at 390/1440 and shop branding colours (D7 — controller screenshots; the oracle checks the layout statically).
- The real LINE id_token verification (the route is checked statically; the service receives an already-verified identity).
- LINE push delivery of the invite; SMS OTP (no SMS gateway — phone OTP is issued but not delivered, as in the member lane).
- Page-level 404 rendering (checked statically: `requirePortal` + `notFound()`); the service/REST/file-route 404s are exercised for real.

### Regressions the controller runs with this file
`qc-member-m2.9` · `qc-member-m3.11` · `qc-member-fix-s1` (customer sessions / OTP / limiter — must stay green) · `qc-pages` (`/p/[slug]`) ·
`qc-acc-v2-promptpay` · `qc-payment` · `qc-acc-v2-attachments` · `qc-crm-c0.4` (private files — the new PORTAL viewer) · `qc-crm-c2.7`
(quotation → deal chain) · `qc-crm-c1.8` (3 registries) · `qc-crm-c3.0` · `pnpm fitness` both modes · `qc-member-m1.9` (30/15/10/5).

## Controller ruling (26 ก.ย. 2569 · Fable 5.1 · binding — เคาะ addendum 1–17 ก่อน spawn builder C3.5)
- **CONFIRMED ทั้ง 17 ข้อ**: ไฟล์/เส้นทาง `/b/[slug]` + REST lane `/api/v1/crm/portal/*` (1–2) · ผิว session `cp_`/`shark_portal`/`mintPortalSession`/`getPortalSession`/`revokeAllPortalSessions`/`requirePortal` **ต่อยอดใน `member/customer-session.ts` ไม่ fork OTP/limiter** (3–5) · ฟังก์ชันลูกค้ารับ token ดิบก่อนเพื่อให้ revoke มีผลทันที (6) · ฟังก์ชันพนักงาน + audit 3 ตัว (7) · อีเมลเชิญ 7 วันใช้ครั้งเดียว (8) · LINE ต้องตรงอีเมล/เบอร์ ไม่ตรง = คำขอ CONTACT_CHANGE reason LINE_IDENTITY (9) · ISSUE/DOCUMENT_REQUEST → การ์ดบอร์ด · CONTACT_CHANGE/PROFILE_CHANGE → approval `crm.portal_request` (10) · `portalVisible` เฉพาะวัตถุ/ฟิลด์ที่ติดธง + parent = บริษัทปัจจุบัน (11) · ตัวดูไฟล์เพิ่ม kind PORTAL ผูก PortalSession (12) · event 3 ตัว ids-only (13) · **🔴 ข้อ 14 บั๊กเดิมของบัญชี `account.setQuotationResponse` อ่านสถานะแล้ว update by id ⇒ accept∥reject ผ่านทั้งคู่** — builder C3.5 แก้ในโมดูลบัญชีด้วย `updateMany` แบบ guard สถานะ (บล็อกเล็กติดป้าย C3.5) + ข้อสอบ X3.2 ต้องเขียวจากการแก้นี้ ไม่ใช่จากล็อกฝั่ง portal อย่างเดียว (14) · PDPA `portal.eraseContact` ให้ C3.9 เรียก (15) · testid 15 (16) · tile ดีลเมื่อ `showDeals` (17)
- ลำดับ: builder C3.5 เริ่มเมื่อมีเลนว่าง (เพดาน 3 · โหมดคุณภาพ) บน c23/QC3 · หลังรับ → นักล่าความปลอดภัยทันที (portal เป็นทางเข้าสาธารณะ)

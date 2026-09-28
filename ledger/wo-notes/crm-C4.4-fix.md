# wo-notes — C4.4-fix (product gaps/bugs found by the C4.4 journeys)

Worktree `/root/projects/shark-crm-c44f` (detached, HEAD `b112b467` = main `986ec608` + TEMP C5.4-C). Builder only —
nothing committed/pushed. DB = QC3 only (`scripts/qc3.sh`). Journeys (`scripts/crm-journeys/*`) were NOT edited.

Process per item: probe written first under `scripts/pending/c44f/probe-*.mts` (throwaway tenant `qc-c44f-*`, swept,
CLEAN check) → run RED on the original code → fix → GREEN. For items 3 and 4 the RED run was taken by temporarily
putting `git show HEAD:<file>` back in place for the one file, running the probe, and restoring the fixed file.

## 1 · US2 — convert carries the new company's taxId + the contact's ROLE

- `contacts-shared.ts` `ConvertInput.company` = `({id} | {new:{name, taxId?}}) & {role?}`.
- `contacts.ts#convertContact`: role validated against `COMPANY_CONTACT_ROLES` (Thai VALIDATION, before the tx);
  taxId validated with the SAME `taxIdProblem`/`normalizeCompanyTaxId` as `companies.createCompany` (identical
  message — probe 1.2 compares the two strings).
- `companies.ts#createInTx(tx, ctx, {name, taxId?})`: createCore's rules reused — tax advisory lock → live company with
  the same taxId+branch = reuse it (no 2nd row), archived one = calm Thai "restore it or pick it" · Party COMPANY is
  created with the taxId. Lock order unchanged (tax → Party → rows, as createCore).
- `companies.ts#linkContactInTx(…, {role?})`: new link gets the role (default OTHER as before) · re-opened link gets
  it · a live link's role is updated only when a role is passed. No role = byte-identical behaviour (forms bridge).
- REST `contacts.convert` zod: `company.new.taxId` + `company.role` (enum) — strict still refuses unknown keys.
- UI `Contact360Actions.tsx` convert modal: `contact-convert-company-taxid` (new-company mode, client pre-check with
  the same `taxIdProblem`) and `contact-convert-company-role` (select of the 7 roles). DECISION: new company ⇒ default
  "ผู้ตัดสินใจ" (the story's own wording: the lead becomes the decision maker); pick existing ⇒ default
  "ไม่เปลี่ยน (คงบทบาทเดิม)" so a convert never silently overwrites an existing link's role. Server default when role is
  omitted stays OTHER (API behaviour unchanged).
- Inventory rows added (`wo: C4.4-fix`).
- probe-1: RED 3/9 → GREEN 9/9.

## 2 · US3 — /settings/pipelines control for stageOnQuoteAcceptedId / stageOnQuoteRejectedId

- `pipelines.ts#updatePipeline(…, PipelinePatch)`: new optional keys (undefined = untouched · null/"" = "ไม่ย้าย" ·
  id must be a stage of THIS pipeline in the same tenant+system — read inside the tx after `lockPipe`, the same row
  lock `deleteStage` holds while clearing the pointers ⇒ can't point at a just-deleted stage) · audit before/after.
  Permission unchanged: `enterManage` (`crm.settings.manage`) + the action's `assertCanCrm`.
- `PipelineDto` gains optional `stageOnQuoteAcceptedId/RejectedId` (only the settings service fills them; the board
  DTO in deals.ts is untouched). `updatePipelineAction` accepts the patch type.
- `PipelineSettings.tsx`: per non-archived pipeline row two selects (`pl-quote-accept-<id>` / `pl-quote-reject-<id>`,
  "ไม่ย้าย" + that pipeline's stages) + `pl-quote-save-<id>` (ghost button like the row's other buttons, disabled
  until changed, result in the existing `pl-msg`). Inventory rows added.
- probe-2: RED 5/11 → GREEN 11/11 (incl. other pipeline / other shop / unknown id refused, MANAGER FORBIDDEN, rename
  leaves pointers alone, deleteStage still clears).

## 3 · US3 — company-linked deal documents carry the COMPANY party

- `deals.ts#dealDocInput`: deal with `companyId` ⇒ customer = the company (name, taxId, branchCode, the COMPANY's
  phone/e-mail, `partyId = company.partyId`); deal without company ⇒ unchanged (contact). Company read through
  `companies.companyRowInScope` (C1.3-S0.3: no direct CrmCompany query outside companies.ts). The person's phone/e-mail
  are deliberately NOT sent with a company (account's find-or-create matches by phone/e-mail ⇒ it would glue the
  company's documents onto the person's AccountContact) — probe 3.7.
- `account/index.ts` `createExternalQuotation/Invoice` `customer` type gains optional `taxId/branchCode` (additive, the
  spread already reached `findOrCreateCustomerContact` which accepts them).
- After a NEW quotation/invoice of a company deal: `companies.adoptAccountContactFromDoc` links
  `CrmCompany.accountContactId` if still null (conditional write, same helper createCompany uses) so company-360
  "outstanding" works; failure = WARN only.
- Readers of the document party checked (whole path):
  - B2B portal `portal.ts scope()` → `account.listPortalDocs(company party)` — now finds them (probe 3.2 + 3.3 real
    customer session: invite → acceptInvite → listQuotations/getQuotation).
  - Company 360 `companies.getCompany360` → `listDocsByParty(company party)` — now lists them (3.4); before: never.
  - Company outstanding `liveOutstanding(accountContactId)` — now linked (3.4).
  - Invoice from an issued quotation (`convertQuotationToInvoice`) inherits the quotation's contact ⇒ company (3.5).
  - Money/commission bridges (`payments.ts dealIdForDoc`, `crm-bridges/money.ts`, `core.ts onQuotationResponded /
    onDocumentIssued`): by doc id / refType+refId / sourceDocId, never partyId ⇒ unaffected (3.8 + c2.7 79/79).
  - Deal 360 / timeline: by `quotationDocId`/`invoiceDocId` ⇒ unaffected.
  - Individual (no company) deals: unchanged (3.6).
  - BEHAVIOUR CHANGE to flag: `member/history.ts` read-through `listDocsByParty(member party)` and
    `member/privacy.ts:994` (PDPA export by party) no longer show NEW company-deal documents on the PERSON — they are
    the company's documents now (arguably correct: B2B docs aren't personal data). The account contacts page "CRM"
    badge (`crm/service.ts listPartyIdsWithContact`, keyed on CrmContact.partyId) won't badge the company
    AccountContact. Existing documents issued before this fix keep the person's party (no backfill done — controller
    decision if historical company-deal docs should be re-pointed).
- probe-3: RED 3/9 → GREEN 9/9.

## 4 · US8 — CREATE_DEAL for a COMPANY-parented custom.record.field_due trigger

- `automation.ts` CREATE_DEAL: subject has no contact, no deal, but a companyId ⇒ `primaryContactOfCompany()` —
  live primary link (isPrimary, not ended), contact of the same tenant+system, not archived/merged, not PDPA-erased,
  deterministic order (startedAt, id) — and the deal is created with `companyId` (US8-3 finds it by company). No
  primary contact ⇒ `skip` with "บริษัทนี้ยังไม่มีผู้ติดต่อหลัก — เปิดดีลให้ไม่ได้ (ตั้งผู้ติดต่อหลักในหน้าบริษัทก่อน)" in the
  run's detail (not a crash, not a silent OK). Deal owner = the primary contact's owner (as contact triggers do),
  else the old fallback. `resolveCrmSubject` is NOT changed (other actions keep their semantics for company subjects).
- Note: this also applies to other company-subject triggers (`crm.company.*`) where CREATE_DEAL previously always
  skipped — consistent, flagged here.
- probe-4: RED 2/6 → GREEN 6/6 (incl. cron re-run idempotent, contact-subject CREATE_DEAL unchanged).

## 5 · I3 — crmWebhookUrlProblem http for loopback when the SSRF switch is on

- New pure `src/lib/webhooks/private-targets.ts`: `privateTargetsAllowed()` (moved verbatim from
  `webhooks/service.ts`, which now imports it — one switch) + `isLoopbackHostname()` (exact `localhost`, 127/8,
  `[::1]`; `127.0.0.1.nip.io`/`localhost.evil.com` are NOT loopback).
- `crmWebhookUrlProblem(raw, allowLoopbackHttp = privateTargetsAllowed())`: http accepted only for an exact loopback
  host when the switch is on; everything else https-only as before; prod (`APP_ENV=production`) unchanged.
- Settings page passes `allowLoopbackHttp={privateTargetsAllowed()}` to `CrmApiSettings` whose client pre-check
  (`hookUrlProblem`) otherwise blocked the form before the server action.
- SSRF guard (`webhookTargetProblem`) behaviour unchanged (probe 5.6).
- probe-5 (pure, no DB): RED 5/6 → GREEN 6/6.

## Verification (all on QC3 · logs in `.qc-shots/crm/c44f/`)

- Probes GREEN: 1 9/9 · 2 11/11 · 3 9/9 · 4 6/6 · 5 6/6 · 5b (real loopback HTTP delivery + signature) 4/4.
- Real UI on a production build of this worktree (`scripts/pending/c44f/serve-qc3.sh`, :3218, QC3, stopped after):
  `ui-pipeline-quote.mts` (owner selects + saves → DB changes, restored; manager → 404, control absent) and
  `ui-convert-taxid.mts` (bad checksum → calm inline message, nothing written; valid taxId → company.taxId + role
  DECISION_MAKER) both GREEN.
- Screenshots: `settings-pipelines-1440.png`, `settings-pipelines-390.png`, `settings-pipelines-after-save-1440.png`,
  `contact-convert-modal-1440.png`, `contact-convert-bad-taxid-1440.png`.
- Journeys vs :3218 (not edited): US3 11/12 — US3-3..6 (portal accept) now green; only US3-0-GAP stays gap-red (
  it is hard-coded, see OQ3) · US8 5/5 (US8-3 green) · US2 9/10 (US2-5 green; US2-4 red — OQ1) · US10 10/14 — first run
  the journey process itself lacked WEBHOOK_ALLOW_PRIVATE so its own drain hit the SSRF guard (deliveries FAILED
  "ที่อยู่ภายใน"); second run with the switch in the runner env: all 3 deliveries OK/200 to the capture server, yet
  US10-8b/8/9/10 stay red because the matcher reads the wrong nesting (OQ4; probe 5b proves the delivery + signature).
  `--clean` removed 33 rows; no qc-jrn rules/records/companies/contacts left; pipelines' pointers back to null.
- Suites (QC3): c1.3 89/89 (first run 88/89 = my own direct CrmCompany read in deals.ts, C1.3-S0.3 — fixed by using
  `companies.companyRowInScope`, re-run green) · c1.4 110/110 · c1.5 103/103 · c1.8 81/81 · c1.10 66/66 (first run
  66/67: C1.10-H.1 probes the OTHER lane's :3215 server whose DB is QC1 ⇒ the QC3 key 401s; second run skipped H) ·
  c2.1 83/84 twice (C2.1-S6.2 = child `qc-member-m3.3` crashes: the committed `scripts/member-expected.json` belongs to
  another branch's seed, its owner has no membership on QC3 — reproduced standalone twice, environmental) · c2.7 79/79
  · c2.9 52/52 · c3.2 47/47 · c3.5 67/67 · c3.8 30/31 twice (C3.8-S7.1 = `.claude/skills/shark-crm-api` does not exist
  in this worktree — gitignored local skill; environmental).
- typecheck EXIT 0 · fitness 33/33 without DATABASE_URL and 33/33 on QC3 (F13.11 CRM-API.md in sync, F14 inventory ok).

## ORACLE-QUESTIONs

1. US2-4-GAP: the journey never types a taxId into the modal, and its expected value is computed AFTER the convert
   click from `Date.now()` (`validTaxId(\`0105${Date.now()}\`.slice(0, 12))`) — no product can ever match it. The
   journey needs to type a (pre-computed) taxId into `contact-convert-company-taxid` and assert that same value.
2. US2-5-GAP: green only because the modal now defaults the role to "ผู้ตัดสินใจ" for a new company (story wording).
   If the controller prefers no default, the journey must `select contact-convert-company-role = DECISION_MAKER`.
3. US3-0-GAP: still asserts the literal "no UI control exists" and sets the pointer via prisma; now it should drive
   `pl-quote-accept-<b2bPipelineId>` + `pl-quote-save-<id>` on /settings/pipelines (restore afterwards).
4. US10-8b: `capture.captured.find(c => JSON.parse(c.body)?.dealId === …)` — the delivered body is
   `{ id, type, payload: { dealId, … }, sentAt }` (webhooks/service.ts:507, documented in CRM-API.md), so the matcher
   must read `.payload.dealId`. Also the runner process needs `WEBHOOK_ALLOW_PRIVATE=1` (its own `drainQuiet` performs
   the delivery), not only the server. With both, 8/9/10 follow from 8b.
5. (minor) US10's webhook form keeps the page's default-picked events (crm.deal.won, crm.contact.created) besides
   crm.deal.stale — harmless, but the endpoint receives contact.created deliveries too.

---

# Round 2 (controller + independent reviewer: NOT MERGEABLE → fixed)

Reviewer oracle probes (not edited): `scripts/pending/c44f-review/probe-r1.mts` (R1 · R2a · R2b) and `probe-ssrf.mts`
(informational). Journeys US2/US3/US10 copied from main (controller ORACLE-EDITs), US8 unchanged. The same tests-first
rule applied: RED logs are `.qc-shots/crm/c44f/r2-probe-r1-RED.log` (1/4), `r2-probe-6-RED.log` (4/7) and
`r2-probe-7-RED.log` (1/5).

## M1 (item 3) — documents going to the account contact of another identity, fixed in both layers
- (a) CRM `deals.ts:1316`: for a company customer, only name, taxId, branchCode and partyId are sent (no phone/e-mail at
  all).
- (b) ACCOUNT `account/service.ts findOrCreateCustomerContact` (~3899–3942). When the caller passes a partyId:
  - Step 0 resolves the contact of that party. It also follows the canonical id of a merged party, and it is scoped to
    tenant + book.
  - The tax, phone and name+email matches are accepted only when the matched contact has no partyId, or has the
    caller's party / canonical party (`own()`). A match set to another party is skipped, and the code falls through to
    `ensureAccountContact(partyId)`.
  - Callers without a partyId behave exactly as before (probe 6.4).
  - Contacts with a null partyId still match and are backfilled as before. That keeps POS/legacy dedupe intact.
- New `probe-6-account-party-match` 4/7 → 7/7. Reviewer probe-r1 R2a/R2b RED → GREEN.
- Account suites on QC3:

  | Suite | Result |
  |---|---|
  | qc-account-deep | 10/10 |
  | qc-account-qc7 | 46/46 |
  | qc-account-cpa | 107/107 |
  | qc-acc-v2-payments | 162/162 |
  | qc-acc-v2-detail | 85/85 |
  | qc-acc-v2-groups | 174/174 |
  | qc-account-api-write-payments | 32/32 |

## M2 (item 1) — convert by taxId bypassed company visibility
- `contacts.ts` ~1806, ~1834–1851. The actor's company visibility (`companies.companyVisibility` = enter + companyWhere)
  is computed BEFORE the convert tx. Inside the tx, `companies.visibleCompanyInTx(tx, where, id)` reads one row.
  - createInTx returns an existing company that the actor can't see ⇒ the whole convert is refused (VALIDATION,
    field taxId). The message is the specified text and never contains the company's name or id.
  - A new company that the actor can't see (no company read) with a deal ticked ⇒ calm FORBIDDEN about permission. The
    old "ไม่พบบริษัทที่เลือก" message from the deal service is never shown.
- First attempt ran the visibility query INSIDE the tx. c1.4 X3.1/X3.3 (10 parallel converts) went red with P2028
  (pool starvation while holding the tx). Fixed by pre-computing, and c1.4 then ran 110/110 twice.
- `probe-7-convert-visibility` 1/5 → 5/5. Reviewer R1 RED → GREEN.

## S2 — reuse by taxId is never silent
- The service returns `reusedCompany {id,name}` (ConvertResult + convertContactAction).
- Choice: on success the modal stays open with `contact-convert-reused` ("แปลงแล้ว — ใช้บริษัทเดิม "<ชื่อ>" ที่มีเลขภาษีนี้อยู่แล้ว
  (ไม่ได้สร้างบริษัทใหม่)") and one `contact-convert-done` button (added to the inventory). This was the smaller clear
  option:
  - there is no second round trip or confirm state;
  - the convert stays one idempotent submit;
  - the user sees exactly which company was used before the modal closes.
- The name is shown only for a company the actor can see.

## S3 — the taxId error sits under the taxId field
- Uses `useFieldErrors(["taxId"])` + `FieldError` (`contact-convert-company-taxid-error`, aria-invalid on the input).
  It covers both the client check and the server's `fieldErrors.taxId`. Other errors stay in `contact-convert-error`.
- Re-shot: `contact-convert-bad-taxid-1440.png`, `contact-convert-bad-taxid-390.png`, plus `contact-convert-reused-1440.png`.

## probe-ssrf (reviewer)
Behaviour is unchanged from round 1.
- Switch on + dev: only hosts that WHATWG normalises to loopback pass (`127.1`, `0x7f.1`, `2130706433` →
  127.0.0.1 · `localhost.` · `[::1]` · userinfo `a@127.0.0.1`), plus https.
- `nip.io`, `localhost.evil.com`, `[::ffff:127.0.0.1]`, `0.0.0.0`, 10/8, 169.254 and `%2f@evil.com` are all blocked.
- Production, or switch off: https only.

## Round 2 verification (QC3 · `.qc-shots/crm/c44f/r2`, `r2b`)
- Probes: 1 9/9 · 2 11/11 · 3 9/9 · 4 6/6 · 5 6/6 · 5b 4/4 · 6 7/7 · 7 5/5 · reviewer probe-r1 4/4.
- UI on a production build of the final code (:3218): `ui-convert-taxid` 5/5 (under-field error at 1440 + 390,
  DECISION_MAKER default, reuse notice + close) · `ui-pipeline-quote` green.
- Journeys US2, US3, US8, US10 on the final build with runner WEBHOOK_ALLOW_PRIVATE=1: 42/42, 0 gaps. `--clean` done;
  server stopped.
- CRM suites:

  | Suite | Result | Note |
  |---|---|---|
  | c1.3 | 89/89 | |
  | c1.4 | 110/110 | twice, after the P2028 fix |
  | c1.5 | 103/103 | |
  | c1.8 | 81/81 | |
  | c1.10 | 67/67 | with QC_BASE=:3218 (my QC3 server); against :3215, H.1 fails for the known cross-DB reason |
  | c2.1 | 83/84 | S6.2 = child qc-member-m3.3 on a foreign member-expected.json, environmental as in round 1 |
  | c2.7 | 79/79 | |
  | c2.9 | 52/52 | |
  | c3.2 | 47/47 | |
  | c3.5 | 67/67 | |
  | c3.8 | 30/31 | S7.1 = local gitignored skill dir missing, environmental |

- typecheck EXIT 0 · fitness 33/33 ×2 (no DB / QC3).

---

# Round 3 (controller ruling: option (ii))

- **M3 → change (b) reverted.**
  - `src/lib/modules/account/service.ts` was restored with `git checkout HEAD --`, so `git diff HEAD -- src/lib/modules/account/service.ts` is empty.
  - Change (a) stays: a company customer sends only name, taxId, branchCode and partyId (`deals.ts` ~1316).
  - `probe-6-account-party-match` asserted (b), so it moved to `scripts/pending/c44f/superseded/` with a README line.
  - Round-2 note correction: the account-side "(b)" paragraph above no longer applies. The account module's contact matching is unchanged by this card.
- **Nit (archived dup leaked existence).**
  - `companies.createInTx` takes `visible` (the actor's companyWhere, computed before the tx). For an archived same-taxId company the actor can't see, it now returns the same hidden-company refusal instead of "…ถูกเก็บถาวรไว้ — กู้คืน…".
  - An archived company the actor CAN see keeps the restore message.
  - Both messages are constants in `companies-shared.ts` (`TAX_COMPANY_HIDDEN_MSG`, `TAX_COMPANY_ARCHIVED_MSG`) and are returned with `field: "taxId"`, so they show under the taxId field.
  - Tests-first: `probe-7` check 7.5 was RED (5/6, `.qc-shots/crm/c44f/r3-probe-7-RED.log`), then 6/6 after the fix.
- **Verification** (QC3 · `.qc-shots/crm/c44f/r3/`)

  | Check | Result |
  |---|---|
  | Reviewer probe-r1 (with (a) alone; R2a/R2b stayed green) | 4/4 |
  | Reviewer probe-r2 (A/B/D pass after the revert) | 5/5 |
  | Probes 1 · 2 · 3 · 4 · 5 · 5b · 7 | 9/9 · 11/11 · 9/9 · 6/6 · 6/6 · 4/4 · 6/6 |
  | Suites c1.3 · c1.4 · c2.7 · c3.5 | 89/89 · 110/110 · 79/79 · 67/67 |
  | qc-acc-v2-party | 36/36 |
  | qc-crm-c0.3 | 88/88 |
  | typecheck | EXIT 0 |
  | fitness (no DB / QC3) | 33/33 · 33/33 |
  | Journeys US2/US3/US8/US10 on a fresh :3218 build (runner WEBHOOK_ALLOW_PRIVATE=1) | 42/42, 0 gaps |

  `--clean` deleted 24 rows and the server is stopped.

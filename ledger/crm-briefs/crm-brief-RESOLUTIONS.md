# CRM v2 — RESOLUTIONS (read right after COMMON; overrides any brief, CRM-RUN and the blueprint where they differ)
Result of an independent traceability review of spec ↔ plan ↔ briefs (18 Sep). Every item is a DECISION, not a suggestion. If real code makes a decision impossible, the controller records a new decision in the work order's "Controller addendum" — never silently.

## R-A. Ownership of spec items that had no owner
| item | owner | decision |
|---|---|---|
| `src/lib/modules/crm/settings.ts` (typed get/set over `AppSystem.settings.crm`, single-statement `jsonb_set` writes, defaults from C1.1) + general settings page | **C1.5** | each later work order adds its own section through this service only |
| `src/lib/modules/crm/where.ts` — `companyWhere`, `contactWhere`, `dealWhere`, `activityWhere`, `recordWhere`, `fileWhere` | created by **C1.3**, extended by C1.4–C1.6/C1.2b | C1.7 replaces the INTERNALS of this one file with `visibleWhere`; no other scattered where-clauses allowed |
| `src/lib/modules/crm/nav.ts` + minimal v2 home (menu, my tasks, my deals) | **C1.3** creates nav, **C1.11** creates the minimal home, **C3.2** completes it (KPIs, leaderboard, "no owner" list + bulk transfer for MANAGER — §11.6) |
| `/settings/forms` (list of tenant forms with CRM target system, assign rule, score, spam guard, embed code) | **C2.6** | form builder itself stays in `/app/forms` |
| `/app/party/[partyId]` (exists) gets a CRM block (contact/company/open deals, visibility-aware) | **C1.11** |
| "price changed" badge on deal lines (no `inventory.item.updated` event) | **C1.5** | computed when the deal opens: snapshot price vs `inventory.getItem().priceSatang` |
| cross-pipeline move (MANAGER+, history row, first stage of target) · pipeline archive only with zero OPEN deals · "move open deals too?" when a contact changes company | **C1.5** / **C1.4** |
| `CrmContact.previousEmails String[]` (kept by `updateContact`, used by inbound matching) | column in **C1.1**, writer **C1.4**, reader **C2.5** |
| `CrmPipeline.stageOnQuoteAcceptedId`, `stageOnQuoteRejectedId`, `autoWonOnPaid Boolean @default(false)` · `CrmDeal.pendingLines Json?`, `pendingApprovalRequestId String?` (lines above the discount cap wait here until `crm.discount` is approved; rejected ⇒ cleared) | columns in **C1.1** |
| §12-only composite indexes `CrmDeal(systemId, ownerUserId, kind, expectedCloseAt)`, `CustomRecordValue(fieldId, valueDate)` | **C1.1** |
| `account.contact.merged` → re-point `CrmCompany.accountContactId`; `account.contact.created` → no-op consumer | **C1.8** |
| ISSUE_VOUCHER / GIVE_POINTS usable from CRM rules | **C2.1** | offered through the shared runner's member adapter ONLY when the contact is linked to a member; otherwise the step is SKIPPED with a Thai reason |
| per-object "date field due" starter rule (disabled) shipped with each object template | data in **C1.2b**, materialised by **C2.1** |
| "book via the booking system" button on deal/contact (prefilled link to the booking module when the tenant has one) | **C2.4** |
| "products in open deals" table | **C3.1** (inside the overview tab) |
| HR page link "ทีมขาย" → `/app/settings/teams` | **C3.6** |
| accessibility / wording (§12): every input has a label, every icon button an accessible name, focus order sane, Thai terms ผู้ติดต่อ · บริษัท · ดีล · ขั้น · pipeline · lead | gate D7 for every UI work order + checked mechanically in **C4.3** |
| sequence auto-stop | **C2.2** owns `sequences.stopFor(contactId, reason)` and its consumers; C2.4 (chat reply) and C2.5 (e-mail reply/bounce/unsubscribe) only CALL it |
| purge functions: implemented by the owning work order (C2.5 e-mail, C2.6 web, C2.4 recordings), all REGISTERED as daily jobs by **C2.10** |

## R-B. Items deliberately NOT built in this run (record as backlog in the hand-over)
`rental.overdue` (no overdue sweep exists) · `school.completed` (emit only `school.enrolled`, on PAID) · consumers for `hr.leave.*` (C2.3 polls `hr.isOnLeave`) · `kanban.inbox.requested` · CRM consumers for `reward.redeemed`, `voucher.used`, `point.*`, `campaign.sent` (the member timeline already records them by partyId; `campaign.sent` has no customer id) · customer "invoice due" reminders (accounting already sends them) · separate hotel/ticket lists in company 360 (the Party timeline fed by C2.9 covers them) · marketplace D19 (arrives as `shop.order.paid`) · web events "through outbox" (direct batched insert instead; the ≤ 50 ms budget is measured in C5.1) · LINE-to-staff · STT provider · `MktRecipient.emailMessageId`.

## R-C. Contradictions — the winning version
1. Migrations: exactly three — `crm_v2_a` (C1.1), `crm_v2_b` (C2.0), `crm_v2_c` (C3.0). Ignore letters in CRM-RUN §1/§2 and blueprint §4.6. No `PosSale.dealId`, no `crm_v2_d`.
2. Model names: `HotelReservation`, `PatientRecord`, `ClinicVisit` (never HotelBooking/ClinicPatient). partyId write sites = 9 tables.
3. API-key filters (decision **C30**): there is NO `ApiKey.bundle` column and none is added. Bundles are scope presets in `src/lib/api-keys/scopes.ts`; the optional key filters are pseudo-scopes stored in `scopesJson`: `crm.filter.owner:<userId>` and `crm.filter.team:<teamId>`, honoured inside `visibleWhere`.
4. `CrmDealPayment.refType` ∈ `"PAYMENT" | "POS_SALE"`. `CrmCommission.refType = "DEAL_PAYMENT"`, `refId = CrmDealPayment.id`.
5. Portal (decision C15 final): UI `/b/[slug]/*` · REST `/api/v1/crm/portal/*` on the customer lane · one constant holds the base path. Sessions: `CustomerSession.customerId` is NOT NULL today ⇒ C3.0 adds a sibling table **`PortalSession`** (same columns, subject = `CrmPortalAccess`); the LOGIC is shared, not forked: C3.5 first extracts token minting/hashing, cookie options, OTP request/verify and the DB limiter calls of `customer-session.ts` into reusable helpers, then implements both subjects on top. `CustomerOtp` is reused as is.
6. Cron (decision **C16 revised**): `/api/cron/outbox` is fired by an external trigger of unknown cadence and is NOT in the VPS crontab ⇒ it cannot drive minute jobs. C0.5 builds the registry + `runMinuteJobs(now)` + a runner script `scripts/crm-cron.mts minute|hourly|daily` following the existing VPS pattern of `scripts/acc-v2-cron-recurring.mts` (the VPS crontab already runs SHARK scripts every minute). The hook in the outbox route stays as a harmless extra. Installing the production crontab line is a **C6.1 step that needs the owner's OK**; in QC the oracles call `runMinuteJobs` directly. No `/api/cron/crm/*` routes, no `vercel.json` entries.
7. Paths: unsubscribe `/u/[token]` · tracking `/t/o/[token].gif`, `/t/c/[token]`, `/t/s/[systemKey].js`, `/t/e`, `/t/consent` · links `/l/[code]` · teams REST `/api/v1/teams/*` (owned by C1.10) · automation REST stays under `/api/v1/crm/automation/*` (no central move in this run).
8. Outbox idempotency keys use `#`: `crm.<type>#<id>#<seq>` (matches live code `crm.deal.won#<dealId>`). Payloads are ids only — `crm.deal.won` carries NO `lines[]`, NO name/phone/e-mail.
9. C1.8 acceptance S1 covers ONLY the events that exist at the end of phase C1 (contact.*, company.*, deal.* except stale, activity.logged/completed, custom.record.*, team.updated). Each later work order registers its own events in its own acceptance.
10. Approval entity types are lowercase dotted: `crm.discount`, `crm.commission`, `crm.reassign`, `crm.portal_request`.
11. Work-order numbering, counts ("26 events" = 26 groups / 41 names; 16 automation actions; 24 systems; 32 tools) and phase contents: MASTER-PLAN §6 wins over blueprint §13.
12. Object templates (8) = the blueprint §10 list: สัตว์เลี้ยง · รถ · ทรัพย์สิน/เครื่องจักร · สัญญา · กรมธรรม์ · อสังหาฯ · โครงการ · ผู้เรียน.
13. Regression names: use `qc-cron` + `qc-webhook` where a brief says "qc-outbox*"; `qc-kanban-notify` where it says "qc-kanban notify"; kanban attachment coverage = `qc-kanban-k1.9`, `qc-kanban-k1.15`, `qc-kanban-k3.7` (replace the guess in C0.4).

## R-D. File ownership when work orders run in parallel
- `src/lib/platform/crm-bridges/` is a FOLDER created by C1.8: `index.ts`, `core.ts` (C1.8), `forms.ts` (C1.8 → C2.6), `chat.ts` (C1.8 → C2.4), `money.ts` (C2.7), `business.ts` (C2.9), `scoring.ts` (C2.8), `sequences.ts` (C2.2), `portal.ts` (C3.5), `commissions.ts` (C3.3). One owner per file.
- `src/lib/outbox-consumers.ts` and the two label registries are shared: each work order adds its lines inside a comment-delimited block `// CRM <WO> ▸ … ◂`; when two parallel builders both need them, the CONTROLLER applies the second block.
- NOT parallel after all: C1.6 → C1.7 (C1.7 rewrites `where.ts` used by C1.6) · C2.5a → C2.5b (a = `emails.ts`, routes, inbound, tracking; b = pages/components, templates, settings UI; one oracle) · C3.2 → C3.4 on the home page. C3.7's responsive pass excludes `/settings/integrations` (C3.6 makes its own page responsive).
- Briefs without a "Files you own" section (C2.2, C2.3, C2.8, C2.11, C3.1, C3.2, C3.6–C3.9): default ownership = `src/lib/modules/crm/<topic>*.ts` + its pages under `src/app/app/sys/[id]/crm/…` + `src/components/crm/<topic>/**` + its block in the registries; the controller writes the final list in the brief's addendum BEFORE spawning the builder.

## R-E. Ambiguities — fixed answers
1. `objectKey` style (C1.2a): an optional field on the context — `FieldCtx.objectKey?: string` (default `"customer"`). One style everywhere.
2. Private files (C0.4): same Bunny storage zone, unguessable path, `FileAsset.kind` prefixed `private:`; the CDN URL is NEVER returned or stored in a DTO; bytes are streamed by the authorised route using the storage API key. No new column.
3. Forms before C2.6 (C1.8): keep today's resolution (first CRM system of the tenant) behind `resolveFormCrmSystem(form)`.
4. C1.10 tools (14): crm_search · crm_contact_360 · crm_company_360 · crm_deal_360 · crm_pipeline_summary · crm_forecast · crm_records_query · crm_create_lead · crm_create_company · crm_create_deal · crm_move_deal · crm_update_deal · crm_log_activity · crm_convert. C2.11 (10) as listed in its brief. C3.4 (8): crm_issue_quotation · crm_reports · crm_quota_progress · crm_commissions_mine · crm_stop_sequence · crm_create_record · crm_update_record · crm_create_task_card. (`crm_transcribe_call` exists only behind the transcriber adapter and is not counted.)
5. SEND_EMAIL before C2.5 (C2.1): goes through `crm/outbound.sendPlain(contact, …)` which already enforces `canContact` + opt-out; C2.5 swaps its transport. 
6. Report schedules (C3.1): stored in `settings.crm.reportSchedules[]` (`ReportDef` has no schedule/recipient fields). No table.
7. `wonValueSatang` = Σ grand totals of documents/sales linked to the deal at the moment their first payment is COUNTED (invoice `grandTotal` via `docLinkInfo`, POS sale grand total); `paidSatang` = Σ COUNTED `CrmDealPayment.satang`.
8. Sums across deals are computed in SQL as `bigint` and returned as JS numbers (safe < 9·10¹⁵); never sum Int satang in JavaScript over unbounded sets.
9. Thai public holidays (C2.2): ship a static list for B.E. 2569–2570 marked "แก้ไขได้" (the shop can edit); the builder compiles it from the official cabinet announcements it can find in the repo/docs or leaves the fixed-date holidays only and says so.
10. Erase scope for custom values (C3.9): ALL custom values of records whose parent is the erased contact + every value of fields flagged `sensitive` that reference that Party.
11. Consent when a contact becomes a member (C1.4): copy the latest `CrmContactConsent` state into `MemberConsent` once (source `CRM`) through the member facade; from then on the member record is the only source. "Transactional" = quotation/invoice/receipt e-mails, portal invites/OTP, and replies inside a thread the customer started.
12. Notification channel substitution (C2.10): every "LINE immediate" default of blueprint §7.4 → push; every "LINE digest" → e-mail digest + in-app.
13. Portal request status map (C3.5): default first column = เปิด, column flagged done/last = เสร็จ, others = กำลังทำ; optional override `settings.crm.portal.statusMap`.
14. `uiVersion` 1 (C1.11): every op of the CRM registry answers `409 CRM_V2_DISABLED`; CRM jobs, sequences, rules and bridges skip that system (rows are kept; they resume when it is 2 again). The legacy tool `crm_create_lead` and the v1 pages keep working.
15. `settings.crm.ai.callTranscribe` default = false (blueprint §4.5 said true).
16. Tracked links keep redirecting after 1 year (no expiry job in this run).
17. `shop.order.paid` keeps its PII payload for its existing consumers (debt of the shop module, listed in the hand-over); the X8 payload scan applies to events ADDED OR CHANGED by this run.

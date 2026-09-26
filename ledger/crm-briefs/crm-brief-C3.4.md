# C3.4 — MEETING/KB bridges + in-page AI + remaining tools
Read `crm-brief-COMMON.md` and `crm-brief-C1.10.md` first. Contract: CRM-RUN §2 "C3.4". Spec: blueprint §8, §9 rows MEETING/KB, mockups 14 (left), 13 (c).

Deliverables: team-room notifications (deal won / hot lead / stale digest) into the MEETING module channel mapped per Team (find the meeting facade first; if no safe "post message as system" function exists, add one to ITS facade) + deal-link unfurl · AI in pages: deal (summary, why at risk, next step, draft follow-up e-mail), contact (why hot, closing message), company (summary, upsell from purchase history), home ("which deals are at risk this month" → table + proposal to create tasks) · KB grounding for drafts (`{{kb:slug}}` in templates + retrieval in prompts) · remaining 8 tools → total 32.
Hard requirements (member audit H3): every AI read goes through the viewer-scoped actor (`visibleWhere` of the asking human; teams/units of that human); prompts contain no phone/e-mail/tax id (mask) and no sensitive member fields; every write is a proposal with 24 h expiry; proposals can be cancelled only by someone who could confirm them.
Acceptance (oracle `qc-crm-c3.4`, fake AI provider): CRM-RUN (22) + X2 assistant-as-thana cannot surface krabi deals through ANY tool (enumerate all 32) · X8 prompt capture contains no PII patterns · X9 proposal confirm/cancel permission matrix.
Regressions: `qc-ai-*` suites touching tools/proposals/skills, `qc-kb*`, `qc-meeting-invite`.

## Addendum (oracle author) — 26 ก.ย. 2569 · `scripts/qc-crm-c3.4.mts` (53 ข้อ)

CRM-RUN §2 C3.4 named the groups; the oracle had to invent the names, shapes and rules below to make them testable. Every item is
**oracle-proposed — controller to confirm** (a different ruling ⇒ ORACLE-EDIT the named checks before the builder starts). The CONTRACT
block at the head of the oracle is the builder's API.

1. 🔴 **Tool arithmetic — 9 new tools, not 8.** The registry holds **23** tools today, not 24: R-E.4 lists `crm_records_query` in both
   the C1.10 (14) and the C2.11 (10) sets, and it is one op (`skills.ts` already says so). 23 + R-E.4's eight C3.4 tools = 31. The
   contract also asks for an "at-risk deals tool" ⇒ the ninth is **`crm_deals_at_risk`** (read) and the total is **32** (`C3.4-S3.1`).
   *Alternative: keep 8 tools and rule the total 31 — then ORACLE-EDIT S3.1/U.2.*
   The 23 today: crm_search · crm_contact_360 · crm_company_360 · crm_deal_360 · crm_pipeline_summary · crm_forecast · crm_records_query ·
   crm_create_lead · crm_create_company · crm_create_deal · crm_move_deal · crm_update_deal · crm_log_activity · crm_convert ·
   crm_email_thread · crm_draft_email · crm_send_email · crm_enroll_sequence · crm_assign · crm_score_explain · crm_stale_deals ·
   crm_activities_due · crm_set_next_step.
   The 9 new (a tool = `tool:{name,hint}` on an op; argument names come from the op path/input as today):
   | tool | op (id · METHOD path · key · kind) | arguments |
   |---|---|---|
   | crm_deals_at_risk | `deals.atRisk.list` GET /deals/at-risk · crm.deal.read · read | `{ month?: "YYYY-MM", team?, owner? }` |
   | crm_issue_quotation | existing `deals.quote` POST /deals/{id}/quotation · crm.deal.quote · write | `{ dealId, … }` |
   | crm_reports | the C3.1 report read op · crm.report.view · read | `{ tab, from?, to?, teamId?, pipelineId? }` |
   | crm_quota_progress | the C3.2 progress op · read | `{ period?, userId?, teamId? }` |
   | crm_commissions_mine | the C3.3 "mine" op · crm.commission.view · read | `{ status?, from?, to? }` |
   | crm_stop_sequence | existing `sequences.stop` POST /sequences/enrollments/{id}/stop · write | `{ enrollmentId, reason }` |
   | crm_create_record | existing `records.create` POST /objects/{key}/records · write | `{ objectKey, parentId?, values }` |
   | crm_update_record | existing `records.update` PATCH /objects/{key}/records/{id} · write | `{ objectKey, recordId, values }` |
   | crm_create_task_card | NEW `activities.taskCard.open` POST /activities/{id}/task-card · crm.activity.create · write (→ `activities.openTaskCard`) | `{ activityId, boardId, columnId? }` |
   The three that sit on C3.1/C3.2/C3.3 ops are attached after those work orders merge (C3.4 runs after them).
2. **One module: `src/lib/modules/crm/ai-bridges.ts`** (re-exported as `aiBridges` from `crm/index.ts`; SKIP guard of the oracle).
   Exports: `runAssist` · `atRiskDeals` · `confirmProposal` · `cancelProposal` · `onDealWonTeamRoom` · `onHotLeadTeamRoom` ·
   `postStaleDigest` · `unfurlDealLink` · `renderKbTokens` · (optional) `setTeamRoom`. Signatures in the oracle CONTRACT §A.
   `runAssist(ctx, actor, { kind, id?, now? }, { ai? })` kinds: `deal.summary · deal.risk · deal.nextStep · deal.draftEmail ·
   contact.whyHot · contact.closingMessage · company.summary · company.upsell · home.atRisk`. Refusal order: v2 gate → visibility
   (NOT_FOUND, nothing called/charged) → provider (NOT_CONFIGURED) → canSpend (NO_CREDIT) → ONE provider call → CRM_ASSIST charged once
   (note = ids only) · provider failure = refused, no charge, no proposal left. The model is asked for JSON (`summary|text`, `nextStep`,
   `subject`+`body`); a plain-text reply is accepted as text. The provider comes from `deps.ai` when given (the oracle's fake).
3. **MEETING facade (new file `src/lib/modules/meeting/index.ts`)**: `postSystemMessage({ tenantId, systemId, channelId, body, author? }, tx?)
   → { ok: true; id } | { ok: false; reason }` — refuses a channel of another tenant/system or an archived one, never throws for those;
   author = constant `"system:crm"` (`MeetingMessage.authorUserId` is a plain string — the room UI renders it as "ระบบ CRM") ·
   ALLOWED_EDGES `crm → meeting`. No meeting schema change (C3.4 has no migration).
4. **Team → room mapping = `settings.crm.teamRooms = { [teamId]: { meetingSystemId, channelId } }`** of the CRM system (the `Team`
   model has no settings column and C3.4 may not migrate) · written with the single-statement `jsonb_set` pattern · picker on the CRM
   settings page (`crm-settings-team-room`, key `crm.settings.manage`). Team of an event = `CrmDeal.teamId` / `CrmContact.teamId`.
   No mapping / foreign / archived room ⇒ nothing posted, WARN OpsEvent (ids only), consumer returns normally.
5. **Team-room events**: deal won = the existing `crm.deal.won` (extra `onDealWonTeamRoom` under `compose`) · hot lead = the existing
   `crm.score.threshold` with `band: "HOT"` (extra `onHotLeadTeamRoom`; other bands post nothing) · no new business event. Dedupe =
   flag-first in the same transaction as the post: OutboxEvent key `crm.teamroom#won#<outboxEventId>` / `#hot#<outboxEventId>` /
   `#stale#<teamId>#<YYYY-MM-DD Thai>` (a flag event type needs its no-op consumer + one label, like C2.4's reminder flag). Body:
   deal/contact link `/crm/deals/<id>` · `/crm/contacts/<id>` + title, never phone/e-mail/tax id.
6. **Stale digest job `crm.teamroom.stale`** — `registerMinuteJob({ everyMinutes: 1440, cadence: "daily" })` in minute-jobs.ts; run
   = `postStaleDigest(now, { tenantIds?, systemIds? })` (MUST honour the filters — `C3.4-X1.4` watches the shared DB); one message per
   mapped team room per **Thai** date listing that team's OPEN, non-archived deals with `stalledAt` set (the C2.10 flag) + the count;
   a failed post writes no flag (a later run the same day posts once); uiVersion 1 systems skipped.
7. **At-risk definition** (tool, home table and proposal share `atRiskDeals`): OPEN · not archived · visible to the asker ·
   `expectedCloseAt` before the first instant of the NEXT Thai month (overdue included) · ≥ 1 reason ∈ `STALE` (stalledAt set) ·
   `CLOSE_OVERDUE` (expectedCloseAt < now) · `NO_NEXT_ACTIVITY` · `PIPELINE_LATE_MONTH` (forecast PIPELINE, close ≤ 7 days).
8. **Proposal kinds / payloads**: next step = existing `crm.deals.nextStep.set` in the `runCrmTool` payload shape + `requestedByUserId`
   (executed by `dispatchCrmKind`) · home = **`crm.assist.tasks`** `{ systemId, month, requestedByUserId, items: [{ dealId, ownerUserId,
   dueAt }] }` — ids only, one PENDING per (system · requester · Thai month), dueAt = next Thai day 09:00 +07:00, confirm ⇒ one TASK
   activity per item owned by the deal owner · card scan = existing `crm_create_lead` + **`companyId`** of the company whose name
   matches the card among companies the scanner can SEE (else absent); confirm links the new contact to it. TTL 24 h (unchanged).
9. **The proposal door**: `confirmProposal` / `cancelProposal` in ai-bridges for `crm.*` kinds and `crm_create_lead` with a systemId.
   "could confirm" = same tenant · payload.systemId = ctx system · the kind's key (`crmKindAccess` · `crm.activity.create` for
   crm.assist.tasks · `crm.contact.create` for leads) · every deal/contact/company id in the payload visible to the actor. Cancel only
   for someone who could confirm. 🔴 The generic `ai/proposals.rejectProposal(ctx, id)` (AI chat action + `/api/mobile/proposals/reject`)
   has no person today and closes anything by id ⇒ it must refuse CRM kinds (return false/throw) and those two callers route CRM kinds
   through `cancelProposal` with the session's membership (`C3.4-X9.2` calls the bare function). C3.4 therefore also touches
   `src/lib/ai/proposals.ts`, `src/lib/ai/actions.ts`, `src/app/api/mobile/proposals/reject/route.ts` (CRM branch only).
10. **KB grounding**: new facade `src/lib/modules/kb/index.ts` (re-export `searchKb`, `getArticle`) + edge `crm → kb`. Retrieval =
    `searchKb` on the deal's words (title + line names), ACTIVE articles of the same tenant, **≤ 3 articles** (each clipped, proposed
    1,200 chars) in draft-email and summary prompts. Template syntax: **`{{kb:<articleId>}}`** — `KbArticle` has no slug column (no
    migration in C3.4) so the "slug" is the article id; rendered by `renderKbTokens` inside the CRM e-mail template renderer and the
    `emails.draft` op: active article of this tenant, HTML-escaped; unknown/inactive/foreign ⇒ "".
11. **Unfurl**: `unfurlDealLink({ tenantId }, viewer, url)` parses `/app/sys/<systemId>/crm/deals/<dealId>` (absolute or relative) →
    `{ dealId, systemId, title, stageName, valueSatang, ownerName?, companyName?, href }` or `null` (other tenant · deal not in that
    system · invisible to the viewer · not a deal URL). Route: a server action in the meeting module (`unfurlDealLinkAction(url)`,
    session viewer) used by the room UI; card testid `crm-deal-unfurl-card`. No public HTTP route.
12. **UI testids** (inventory rows required): deal 360 `crm-ai-deal-summary` · `crm-ai-deal-risk` · `crm-ai-deal-next-step` ·
    `crm-ai-deal-draft-email` · contact 360 `crm-ai-contact-why-hot` · `crm-ai-contact-closing` · company 360 `crm-ai-company-summary` ·
    `crm-ai-company-upsell` · home `crm-ai-home-at-risk` · `crm-ai-at-risk-table` (headers ดีล · บริษัท · มูลค่า · เหตุผล, `overflow-x-auto`)
    · proposal card `crm-ai-proposal-confirm` / `-edit` / `-cancel` · settings `crm-settings-team-room` · meeting `crm-deal-unfurl-card`.
    Buttons call a `"use server"` file `src/app/app/sys/[id]/crm/_actions/ai.ts`; components live in `src/components/crm/ai/**`.
13. **Oracle conventions**: throwaway tenants `qc-c34-<rand>-a|b` (two CRM systems v2/v1, MEETING workspaces, four teams, 16 raw deals whose
    at-risk / stale sets are fixed by construction, KB articles, a funded wallet, a sensitive contact field) · outbox rows are born DONE and
    handed to the consumers (no drain) · no `runMinuteJobs` (global lease rows) · X2.2 reads the seeded shop resolved by `CQC` (slug + e-mails
    + team names — the ids in crm-expected.json belong to another QC database) and writes nothing there (tool calls only read or return a
    proposal outcome) · write-tool dispatch probes skip e-mail/sequence tools (no real send risk).

### Criteria not testable by this oracle
- Pixel parity with mockups 14 (left) / 13 (c) — S8 is static (testids, headers, wiring); the PARITY verdict stays gate D7.
- The mobile card-scan screen (C3.7).
- `crm_reports` / `crm_quota_progress` / `crm_commissions_mine` behaviour — only registration (S3.1) and scope (X2 enumeration);
  their data is the C3.1–C3.3 oracles' job.

### Regressions the controller runs with this file
`qc-ai-tools` · `qc-ai-proposals` · `qc-ai-skills` · `qc-ai-credit` · `qc-ai-vision` · `qc-kb` · `qc-kb-search` · `qc-kb-auto` ·
`qc-meeting-invite` · `qc-crm-c1.10` · `qc-crm-c2.11` · `qc-crm-c2.4` · `qc-crm-c2.10` · `qc-crm-c1.7` · `qc-crm-v1` · fitness both modes
(F13.10–12, ALLOWED_EDGES crm→meeting / crm→kb) · `qc-nav-functions` · `qc-member-m1.9`.

## Controller ruling (26 ก.ย. 2569 · Fable 5.1 · binding)
- **CONFIRMED addendum 1–13** และ 4 มติ: (1) ทะเบียนวันนี้ 23 tool (R-E.4 นับ `crm_records_query` ซ้ำ) + 9 ใหม่ = **32** (รับ `crm_deals_at_risk` เป็นตัวที่ 9 — สัญญาต้องการ tool ดีลเสี่ยงอยู่แล้ว) (2) **`ai/proposals.rejectProposal(ctx,id)` ไม่รู้ผู้กด = ช่องโหว่เดิมข้ามโมดูล** — builder C3.4 แก้เฉพาะสาขา CRM (ต้องผ่านประตู "คนที่ยืนยันได้จึงยกเลิกได้") ใน `ai/proposals.ts` · `ai/actions.ts` · `api/mobile/proposals/reject/route.ts` · ช่องโหว่ทั่วไปของ proposal โมดูลอื่นจดเป็น finding ให้เลน AI/สมาชิก (CRM-RUN §4) และให้นักล่า C5 ตรวจซ้ำ (3) `KbArticle` ไม่มี slug ⇒ `{{kb:<articleId>}}` (4) MEETING/KB ไม่มี `index.ts` ⇒ builder สร้าง facade ทั้งสอง (re-export + `postSystemMessage` ผู้เขียน `system:crm`) + edge crm→meeting · crm→kb ใน fitness พร้อมเหตุผล
- ลำดับ: **builder C3.4 เริ่มหลังรับ C3.1 + C3.2 + C3.3** (tool `crm_reports` / `crm_quota_progress` / `crm_commissions_mine` ต้องมี op จริง) · ข้อสอบ 53 ข้อ

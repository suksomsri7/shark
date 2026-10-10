# C5.2 HUNTER — lens L5: PDPA & data leakage (read-only hunt · 27 Sep 2026)

> Main tree `/root/projects/shark-crm` · HEAD at hunt time `1576edcb` (brief said `130ca0c1`; CRM code paths unchanged for this lens) · no source edits · no commits
> Probe: `scripts/pending/hunt-l5/probe-erase-residue.mts` (QC2 `ep-cool-shadow`, throwaway tenant `qc-hunt-l5-ccqeeqqq`, cleaned: tenantsLeft 0 / usersLeft 0) · evidence `scripts/pending/hunt-l5/probe-erase-residue.log`
> Out of scope (already closed): C3.9 H1–H12 + C3.9-fix rounds 2–4 · debts `CrmContact.previousNames`, retention >500 batches

**Counts: BLOCKER 0 · MAJOR 4 · MINOR 9** (3 MAJOR confirmed at runtime with a positive control, 1 MAJOR confirmed by exhaustive grep)

---

## MAJOR

### L5-M1 · An erased person's name survives in deal titles (the UI pre-fills it) — CONFIRMED (probe)
- **Where it comes from:** the convert sheet pre-fills the title as `ดีล ${contactName}` and ticks "open a deal" by default (`src/app/app/sys/[id]/crm/contacts/_components/Contact360Actions.tsx:109,113`). The automation `CREATE_DEAL` titleTpl can use `{ชื่อ}` (`automation.ts:916-919`, vars at `:1059-1060`).
- **Where erase stops:** `privacy.ts:619-690` masks activity titles, notifications, AI messages, kanban-linked cards and custom records. `CrmDeal.title`, `nextStep` and `lostReason` are never touched. `nextStep` can also be written by the AI (`ai-bridges.ts:529-537`).
- **Probe:** contact "สมหญิง… ทดสอบลบ…"; one deal from the convert default and one from a real rule run through `runForCrmEvent`; then `eraseContact`. Result: `after.dealTitlesWithName = 2`. The positive control (an activity titled with the name) was masked.
- **Blast radius:** the name keeps showing in the deal list and board, deal CSV export, report exports and scheduled report e-mails (`reports.ts`), the tenant export (`privacy.ts:1087-1089`), AI prompts (`ai-bridges.ts dealFacts/atRiskFacts`), the team-room stale digest and won-deal posts (see M3), and the portal/accounting contact profile (`account/contact-profile.ts:626`).
- **Why the oracle misses it:** `C3.9-S1.4` asserts that deal titles stay byte-identical. Its fixtures use `ดีลตัวเลข ${tag}` (`qc-crm-c3.9.mts:246`), which contains no name.
- **Minimal fix:** in the erase tx, run `UPDATE "CrmDeal" SET title = mask(title), "nextStep" = mask(…), "lostReason" = mask(…)` for deals with `contactId ∈ ids` (plus deals reached through `CrmDealContact`), using the same `tokens`. Numbers, stage, owner and row stay as they are. ORACLE-EDIT S1.4: "title identical unless it contains an identity token".

### L5-M2 · Automation-made kanban cards are not linked to the contact, so erase never finds them — CONFIRMED (probe)
- `OPEN_KANBAN_CARD` renders `title` with `{ชื่อ}` (`automation.ts:973-986`). `defaultKanban` (`automation.ts:1074-1085`) calls `createCardFromExternal` without `links` and drops `req.contactId`.
- Erase only reaches cards through `kanbanCardLink` of type `CRM_CONTACT` (`kanban/links.ts:456-466`).
- **Probe:** `cardsLinkedToContact = 0`. The card "โทรหา <full name>" survives erase.
- **Why the oracle misses it:** the H4 fixture creates the card and its `CRM_CONTACT` link by hand (`qc-crm-c3.9.mts:1037-1038`). The automation path is never exercised.
- **Fix:**
  - (a) `defaultKanban` should pass `links: [{linkType:"CRM_CONTACT", linkId: req.contactId, role:"RELATED"}]` (+ a DEAL link when there is one).
  - (b) For cards that already exist: in erase, `redactCardsInTx` with `sourceKeyPrefix` `crm-rule:<runId>:` for every `AutomationRun` whose `crmContactId ∈ ids`. This must be collected before `automationRun.payload` is nulled; the runId is in the sourceKey.

### L5-M3 · Team-room posts write the contact's full name into MEETING chat, and erase never touches `MeetingMessage` — CONFIRMED (probe)
- `onHotLeadTeamRoom` posts `🔥 lead ร้อน: ${c.name} · คะแนน …` (`ai-bridges.ts:954-968`). Won-deal posts and the stale digest post deal titles (`:939-948`, `postStaleDigest`), which carry the name per M1.
- `privacy.ts` has no meeting facade call. **Probe:** `after.meetingBodiesWithName = 1`.
- **Secondary problem:** these posts bypass CRM visibility. Channel membership is not the same as `visibleWhere`, so staff limited to "own contacts" still see names of every HOT lead in the team. `notifications.ts:15-16` forbids exactly this for in-app notifications (ids and links only).
- **Why oracles miss it:** C3.9 has no MEETING fixture. C3.4-S1.2 only checks that the body contains the link (`qc-crm-c3.4.mts:480-482`).
- **Fix (preferred):** body = link + score only (no name), same for won/stale (deal link, no title). Oracle-compatible.
- **Alternative:** a meeting facade `maskSystemMessagesInTx(tx, tenantId, CRM_TEAMROOM_AUTHOR, tokens)` called from erase.

### L5-M4 · "Don't track me" can't be recorded; e-mail tracking is on by default with no disclosure — CONFIRMED (static, exhaustive grep)
- **The flag has no setter:** `CrmContact.trackingOptOut` is read in 8 places (`emails.ts:1179-1180,1631-1632,2367,2411` · `tracking.ts:711,878,1246`). Across `src/`, its only writer is the erase anonymiser (`contacts.ts:2704`). No service, UI, REST op, portal or unsubscribe path sets it.
- **Tracking is on by default:** `trackOpens` / `trackClicks` default to `true` (`emails-shared.ts:77-78`). Every CRM e-mail, including 1:1 sales mail and transactional replies, gets an open pixel (`emails.ts:923`) and wrapped links. The footer only offers unsubscribe (`emails.ts:920`); there is no tracking disclosure.
- **Promised but missing:** the blueprint promises a per-contact tracking opt-out (`docs/modules/20-crm-v2.md:736`).
- **Effect:** a customer who objects to tracking can only be fully unsubscribed (`emailOptOut`) or erased.
- **Merge:** merge applies "strictest wins" to marketing/email opt-outs only (`contacts.ts:1882-1889`), so a future `trackingOptOut` would be dropped on merge.
- **Why oracles miss it:** C2.5/C2.6 set `trackingOptOut` directly with prisma.
- **Fix:**
  - an owner writer `contacts.setTrackingOptOut` (audit + `crm.contact.updated` event)
  - a toggle in the 360 consent panel, a REST op, and a portal/unsubscribe-page choice
  - merge strictest-wins for `trackingOptOut`
  - optionally, a one-line tracking notice in the footer

---

## MINOR

| # | Finding | Where | Status | Fix |
|---|---|---|---|---|
| m1 | Portal "documents" returns **every** `CrmFileLink` on a record whose object is `portalVisible`. There is no per-file or per-field gate, while fields are gated by `portalVisible && !sensitive`. The staff record page shows no "visible to customer" notice. Result: internal attachments (ID copies, credit notes) go to every portal user of that company, including VIEW role. | `portal.ts:759-795` · `objects/[key]/[recordId]/page.tsx:163` | PLAUSIBLE (C3.5 oracle treats record files as "shared") | Notice on the files block of portal-visible records, or a per-file `portalVisible` flag |
| m2 | Portal `listContacts` shows phone + e-mail of **all** co-contacts of the company to any portal user, regardless of their portal access or consent | `portal.ts:1004-1016` | PLAUSIBLE (design) | Name + job title only, or only contacts that have portal access |
| m3 | AI assistant `crm_contact_360` sends raw phone, e-mail, LINE id and previousEmails to the LLM. `present()` only strips sensitive custom fields for `assistant`. This is inconsistent with the e-mail ops (`maskFreeText` for assistant) and the ai-bridges rule "prompt has no phone/e-mail". | `api/ops/contacts.ts:109-121` · `api/serialize.ts:137-142` · `api/ops/emails.ts:87,105` | CONFIRMED (code) · design call | Apply `maskPiiDeep` when `actor.kind === "assistant"` (write proposals carry ids) |
| m4 | OpsEvent `detail` stores raw `e.message`. The team's own rule says Prisma messages echo input values and OpsEvent is readable across tenants. | `emails.ts:2047-2049` (rule) vs `automation.ts:140` (`errText` → `:1427,:1431,:1619`), `deals.ts:2136,2370`, `activities.ts:1630`, `companies.ts:2171`, `reminders.ts:168` | PLAUSIBLE (prod `PrismaClientValidationError` dumps args) | Log `e.name` / `code` only |
| m5 | No retention for `CrmEmailEvent` (opens/clicks: url, userAgent, time per contact's e-mail). `purgeBodies` keeps message rows, so events stay forever. `CrmTrackedClick` (UA) has no retention either. | `privacy.ts:1459-1476` · `emails.ts purgeBodies` | CONFIRMED (code) | Delete events older than `email.retentionDays` inside `purgeBodies`; clicks older than `webDays` |
| m6 | Web tracking keeps page `title` (≤300 chars) and the full URL **path**. `crm.web.identified` sends `firstUrl` to webhooks and automation, against the "ids only" rule; it stays in `WebhookDelivery.payloadJson` after erase. REST `sourceDetail.pageUrl`/`referrer` are stored raw (query kept). | `tracking.ts:771,942` · `contacts.ts:473-481` | CONFIRMED (code) | Drop `firstUrl` from the payload; run `cleanTrackedUrl` / `cleanReferrer` in `cleanSourceDetail` |
| m7 | Whole-system export (phone, e-mail and note of every visible contact, plus all tables) needs no confirm + reason, unlike the contacts CSV export (X9) | `privacy.ts:1025-1050` · `privacy-actions.ts:87` vs `contacts.ts` `exportContacts` `reasonOf` | CONFIRMED (code) | Same confirm + reason gate |
| m8 | Transactional-reply loophole: any reply in a thread that ever had an inbound message is transactional forever, so it bypasses `emailOptOut` / `marketingOptOut`. Staff can "reply" to a 2-year-old inbound mail to send a promo to someone who unsubscribed. | `emails.ts:1046-1062`, `:1159-1160`, `:1621-1623` | PLAUSIBLE (R-E.11 design) | Time window (e.g. last inbound ≤ 30 days) or require that the parent is the latest inbound |
| m9 | The access-request bundle (DSAR) filters deals and activities by the **requester's** visibility, so a team-scoped manager silently produces an incomplete bundle. E-mail bodies are never included. | `privacy.ts:935-960` | PLAUSIBLE | Require all-visibility, or mark the bundle `partial:true` |

---

## Checked and found sound
- **Consent at send time:**
  - `sendCore` re-checks via `canContact` (`emails.ts:1159-1160`); the scheduled path re-checks at claim (`:1617-1627`); bulk loops `sendCore` (`:1406`).
  - Automation `consentOf` does a fresh DB read (`automation.ts:1161-1168`); sequences check at step time (`sequences.ts:1195`, contact re-read `:1366`).
  - The LINE sender requires `GRANTED`. The "To" field is restricted to the contact's own addresses; copies to outside addresses need the settings key.
- **Webhooks and events:** the automation WEBHOOK body is ids only (`automation.ts:997-1007`). All CRM `emitOutbox` payloads were audited: ids and counters only, except `firstUrl` (m6).
- **Notifications and logs:**
  - Notifications (`notifications.ts`) are ids + links and filtered by visibility.
  - Action `console.error` calls log the error name only.
  - Email-path `logOps` calls log the name only.
  - The REST runner's audit carries no input (`api/run.ts:85-105`).
  - Import errors are passed through `maskPii`.
  - The contacts export audit masks `q`.
- **Web tracking:**
  - `ipHash` is an HMAC with a monthly salt.
  - URL query strings are stripped except `utm_*`; the referrer's query is stripped.
  - `collect` requires the current consent version and a consented session; decline/revoke = zero rows or cleared consent.
  - The identify ticket is AES-GCM, 15 minutes, single use, and only appended for the shop's own domains.
  - Revisiting consent, the `trackingOptOut` checks exist wherever tracking happens (but the flag has no setter — M4).
- **Unsubscribe:** the `/u/<token>` page is static, shows no PII and is POST-only. Referrer-Policy is `strict-origin-when-cross-origin` globally, and file routes send `no-referrer`.
- **Exports:**
  - CSV formula neutralising (`core/csv.ts:119-122`) is used by every CRM export.
  - The contacts export needs a key + reason and has an export cap.
  - Report export jobs are bound to the requester (USER or APIKEY) and re-resolved at run time.
  - Scheduled reports go only to current staff who hold the report key.
  - Export files are private with signed links ≤ 15 minutes.
- **REST API:** READONLY keys get `maskPiiDeep` (field names plus Thai phone and e-mail patterns); OPERATE and assistant have sensitive fields stripped.
- **Portal:** quotation, invoice and receipt DTOs are minimal; the home page shows counts only; record fields are filtered by `portalVisible` and not `sensitive`.
- **AI bridges:** prompts for runAssist and call summaries select explicit columns and run `redactContactInfo`; they read no custom fields; KB grounding is tenant-scoped; AI audit rows are ids only.
- **Merge:** marketing and email opt-outs, plus per-channel revocations, follow strictest-wins (member side included).
- **Retention:** `purgeWeb` deletes anonymous sessions and summarises identified ones (clears ipHash and UA); bodies, recordings, exports and leads are covered.

## Suggested oracle additions (for the controller)
- C3.9: add a deal pre-filled with `ดีล <full name>`, run an automation rule with `OPEN_KANBAN_CARD` / `CREATE_DEAL` using `{ชื่อ}`, fire a hot-lead team-room post, then erase and assert that no token remains in `CrmDeal.title`/`nextStep`, `KanbanCard.title` or `MeetingMessage.body` (the probe above is a ready template).
- C2.5/C2.6: set `trackingOptOut` through the new service writer, not prisma; merge case A(opt-out) + B → B opted out.

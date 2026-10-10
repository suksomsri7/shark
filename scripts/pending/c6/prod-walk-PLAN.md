# C6.3 — production walk-through of CRM v2 (pilot shop) · PLAN (phase 1 · nothing written to prod)

Written 8 Oct 2026 (UTC) by the C6.3 lane. Owner order of 8 Oct, option "ก": temporary `qc-prod-*` accounts + sessions for 5 roles,
simulated data/events allowed, everything removed and verified afterwards, nothing may reach a real customer.
**Phase 1 = this plan + scripts + read-only runs. Phase 2 (setup → walk → cleanup) starts only on the controller's word.**

Scope (hard-coded in `prod-walk-lib.cjs`): tenant `cmtazbpjh000004lcjikxju2i` (slug `siam-dive-center`) · CRM system `cmtdvoopr000004jpf1vaply9`
· base `https://shark.in.th` · DB host mark `ep-royal-night` · marker `qc-prod-` · e-mail domain `qc-prod.invalid` · session tag `qc-prod-walk`.

## 0. What production looks like right now (read-only probes, 8 Oct 01:07–01:14 UTC)

| Fact | Value | Why it matters |
|---|---|---|
| Tables with `tenantId` | 299 (all tenant data; 0 FK-only child tables) · 12 global tables | the snapshot covers every table |
| Rows of this tenant | 1 066 in 38 tables | small, a full before/after compare is cheap |
| CRM rows | CrmPipeline 2 · CrmStage 10 · CrmLostReason 5 (both CRM systems) — **0** contacts/companies/deals/activities, 0 `crm.*` outbox events ever | every CRM row that appears during the walk is ours |
| Pilot CRM settings | `{ crm: { uiVersion: 2 } }` only | all other keys at code defaults (`bridgesEnabled` = **true**) |
| Business units | **0** (no system is linked to a unit) | `unitAccess` = `[]` for everyone |
| Memberships | 1 (OWNER) · owner has 105 live sessions, **2 iOS push devices** | a notification addressed to the owner reaches a real phone |
| Other modules | Customer 0 · Party 0 · AccountDocument 0 · AccountContact 0 · AccountDocSequence 0 · AccountSystemLink 0 · KanbanBoard 0 · HrEmployee 0 · MemberField 26 / MemberSection 4 (all of the MEMBER system) | anything appearing there during the walk is a side effect of ours |
| Webhooks | 1 endpoint → `www.siamdive.com`, events `chat.message.sent`, `chat.conversation.read` only | `crm.*` events are **not** delivered outside |
| Automation rules | 3, all `scope = MEMBER_TIER`, `event = ''` | no rule fires on `crm.*` |
| Live traffic | chat: 12 `chat.message.received` in 7 days, last 7 Oct 10:54 UTC | non-CRM tables may drift for real reasons during the walk |
| DB guards | no trigger, no rule, no RLS on any table | AuditLog/Outbox rows are deletable |
| Unauthenticated | `/app/sys/<id>/crm/contacts` → 307 `/login` · `/b/siam-dive-center/login` → **404** (portal off) | enabling the portal makes that page public for the duration |

## a. Setup rows (`prod-walk-setup.cjs`, default dry-run; `--apply` to write)

Plain SQL on purpose — the app services would add `team.updated` outbox events + AuditLog rows (`src/lib/core/teams.ts:118-128,157`), and the staff
invite needs an `HrEmployee` row (`src/lib/staff/service.ts:357-366`). Shapes follow the app's own writes.

**Stage `staff` — 13 rows**

| Table | n | Row (shape source) | How cleanup finds it |
|---|---|---|---|
| `User` | 3 | `qc-prod-manager@…`, `qc-prod-lead@…`, `qc-prod-staff@qc-prod.invalid`, names `qc-prod-*` (`staff/service.ts:371-375`) | e-mail `LIKE 'qc-prod-%@qc-prod.invalid'` (+ id in manifest) |
| `Membership` | 3 | manager: `MANAGER`, permissions `{}` (`crm/access.ts:77`) · lead + staff: `STAFF` with the 8 keys of the QC roles nok/thana (`scripts/seed-crm-qc.mts:131-137`) · `unitAccess []` · `acceptedAt now` (`staff/service.ts:421-430`) | `tenantId` + `userId` ∈ temp users + role ≠ OWNER |
| `Team` | 1 | `qc-prod-team-a`, lead = lead user, `unitIds {}` (`core/teams.ts:139-149`) | tenant + name marker / id |
| `TeamMember` | 2 | lead `LEAD`, staff `MEMBER` (`core/teams.ts:151`, `:219-223`) | tenant + `teamId` / `userId` in the sets |
| `Session` | 4 | owner (the REAL owner's user), manager, lead, staff — `tokenHash = sha256(token)`, `userAgent = 'qc-prod-walk'`, `expiresAt = idleExpiresAt = now + 180 min` (`core/session.ts:18-29`; cookie `__Host-shark_session` + `shark_tenant`, `core/session.ts:9`, `core/context.ts:10`) | sessions of temp users · owner's: id in manifest AND tag AND `userId = owner` |

Ids are `qcprod…` (25 chars). Raw tokens exist only in `/tmp/c63-walk/manifest.json` (mode 0600), never printed. The owner's 105 real sessions are not touched.
`getSessionUser` slides `idleExpiresAt` on our own 4 rows on first use (`core/session.ts:53-58`); `expiresAt` still ends them after 180 min.

**Stage `portal` — 2 rows, after the walk created the company + contact through the UI** (`--stage portal --company <id> --contact <id>`)

| Table | n | Row | Found by |
|---|---|---|---|
| `CrmPortalAccess` | 1 | role `APPROVE`, `acceptedAt now`, `loginMethods {EMAIL_OTP}`, no invite token — `portal.invite()` is **not** called (it e-mails the contact, `crm/portal.ts:1107-1176`) | id in manifest · `companyId`/`contactId` in the temp sets |
| `PortalSession` | 1 | token `cp_…`, `tokenHash = sha256(token)`, tag, 180 min (`member/customer-session.ts:558,672-700`; cookie `__Host-shark_portal`) | `portalAccessId` in the set |

The stage refuses unless both rows are a linked `qc-prod-` pair of the pilot system listed in the manifest. The portal only works while
`settings.crm.portal.enabled = true` (`customer-session.ts:664`) — the owner step S14 switches it on through the UI; cleanup restores the `AppSystem` row.

## b. Side-effect analysis (code + prod state)

Mechanics that apply to every write: each service writes `AuditLog` and `OutboxEvent` rows in the same transaction; the outbox drains seconds later
(`crm/outbox-wake.ts:30-37`, `core/after-drain.ts`), wrapped by `withWebhooks` (`outbox-consumers.ts:382-399`) and `withAutomation` (`:188-225`) — both
inert here (no matching endpoint, no matching rule). The first contact/company write seeds `MemberSection`/`MemberField` rows under the CRM `systemId`
(`crm/contacts.ts:465-482`). Contact/company creation writes a shared `Party` row, matching an existing one by tax id → phone (≥ 8 digits) → name + e-mail
(`party/service.ts:95-150`); the tenant has 0 parties and the story uses no phone and no tax id, so every Party is new and ours.

| Action | Class | Derived rows / reason |
|---|---|---|
| Open any CRM page (GET) | SAFE | v2 pages do not write, except `/settings/email` (and the composer) mint `settings.crm.email.inboundKey` on first open (`crm/emails.ts:491-510`) → `AppSystem` row restored byte-for-byte |
| Create / edit contact (no phone; e-mail only `@qc-prod.invalid` or none) | SAFE-WITH-CLEANUP | `CrmContact`, `Party`, `MemberSection`/`MemberField` seed, `CustomRecordValue*`, `ChatRateBucket`, AuditLog, Outbox (`crm.contact.created/assigned`) · `lead.assigned` → `AppNotification` to the new owner (temp user; no device ⇒ no push) |
| Create company (no tax id) | SAFE-WITH-CLEANUP | `CrmCompany`, `Party(COMPANY)`, `CrmCompanyContact` · `onCompanyCreated` writes an `AccountContact` only through an `AccountSystemLink` — there is none |
| Create deal, edit, deal lines (no discount over the 10 % cap) | SAFE-WITH-CLEANUP | `CrmDeal`, `CrmDealStageHistory`, `CrmDealLine`, company caches · no staff notification on create |
| Move stage | SAFE-WITH-CLEANUP | history + `crm.deal.stage.changed` |
| **Mark WON** | SAFE-WITH-CLEANUP **only if the deal's contact has no phone and no e-mail** | `onCrmDealWon` is ungated and would create a real `Customer` in the shop's only MEMBER system + `member.created` (WELCOME to the customer) (`member-bridges.ts:616-690`) — the story's WON deal sits on such a contact (asserted before the move). Auto-invoice off (`CrmPipeline.autoInvoiceOnWon` default false). Commission/quota: no rules. `deal.closed` → in-app (+push) to deal owner, collaborators, team lead minus the mover — all temp users here |
| Mark LOST with reason | SAFE-WITH-CLEANUP | same notification rule |
| Log activity (note/call/meeting/task) without `remindAt`, without @mention | SAFE-WITH-CLEANUP | `CrmActivity`, `lastActivityAt`. A reminder pushes to the owner (`crm/reminders.ts:156-163`); an @mention notifies a real user; a task due today owned by a real user joins the hourly `tasks.today` digest (`notify-senders.ts:171-218`) ⇒ none of those in the story |
| Visibility checks, reports pages, calendar | SAFE | read-only |
| Portal settings on (owner) → restore | SAFE-WITH-CLEANUP, **externally visible for the duration** | `settings.crm.portal` + AuditLog. `/b/siam-dive-center/login` turns from 404 into a public login page until cleanup. No real contact has portal access, so nobody can log in. Justification: the customer role cannot be walked otherwise |
| Portal page views (customer) | SAFE-WITH-CLEANUP | `crm.portal.viewed` outbox (once per access per day) → `CrmActivity` |
| Custom object + record, sequence definition **without enrolment**, lost reason, quota row, assignment/scoring rule, saved view, my notification prefs | SAFE-WITH-CLEANUP (phase 2b, not in the core story) | own tables / `settings.crm.*` JSON; inert without events |
| **Send e-mail** (compose, bulk, test, scheduled) | SKIP | synchronous Resend call from `<slug>@shark.in.th`, no sandbox (`core/email.ts`, `crm/emails.ts:1665-1728`); `.invalid` still hits Resend (reject or bounce on the shop's sender reputation) |
| **Sequence enrolment** | SKIP | `nextAt = now`, the minute job sends step 0 within ~1 min (`crm/sequences.ts:668-742`) |
| **Portal invite / OTP request** | SKIP | e-mail to the contact (`crm/portal.ts:1107-1176`) — replaced by the SQL-inserted access |
| **Quotation / invoice from a deal** | SKIP (cannot work) | needs an `AccountSystemLink` to the shop's real book; without it the action answers "ยังไม่เชื่อมระบบบัญชี" and writes nothing. Creating the link = a tenant-wide accounting configuration change |
| Portal quote respond / pay link / slip upload / request with issue board | SKIP | issued legal documents, payment provider, Bunny upload, real Kanban card |
| **Convert contact to member**, merge, **PDPA erase**, PDPA export | SKIP | real `Customer`; un-mergeable re-pointing; erase is irreversible by design (the `crm.contact.erase` AuditLog row is the tombstone); export uploads to Bunny |
| **AI buttons** (deal/contact/company assist, home at-risk, card scan) | SKIP | OpenRouter call + `AiCreditTxn` debit on the shop's real wallet, no CRM gate (`crm/ai-bridges.ts:484-600`) |
| File / call-recording upload | SKIP | Bunny storage object |
| Open task card | SKIP | real `KanbanCard` (and the shop has no board) |
| API key / webhook endpoint create | SKIP | a new endpoint would receive `crm.*` events at an external URL |
| Automation rule **enabled** with SEND_LINE / WEBHOOK / GIVE_POINTS / ISSUE_VOUCHER | SKIP | reaches customers / external URLs / loyalty ledgers |
| Sending domain add | SKIP | registers a domain at Resend, not removable from here |
| Forms target save, tracking web switch, integrations targets | SKIP | edits a real Form / mints a public site key / tenant wiring |
| Commission approve | SKIP | `payrollLink` default true → HR adjustment for payroll employees |
| Contact import (CSV), report export, report schedule | SKIP in the core story | import notifies owners in bulk (in-app + push); schedule e-mails a CSV; export is harmless (`CrmImportJob`) but adds nothing |
| **Industry-template chooser on the home page** (apply / skip) | SKIP — owner's own decision | additive, no in-app undo (`crm/templates.ts:155-328`) |
| Discount over cap / cross-team reassign over daily cap | SKIP | `ApprovalRequest` flow |

Skipped actions are covered by the QC evidence of C3.10/C4 (buttons runner, journeys) — the walk only renders their pages and controls.

**Things that can still reach the real owner (and how the story avoids them)**
- Push/in-app to the owner happens only when the owner is assignee/deal owner/collaborator/team lead/mentioned and is not the actor
  (`crm/notifications.ts:233-262`). The story assigns nothing to the owner by another user; the owner's own records are created by the owner session.
- Shop quiet hours default 21:00–07:00 Thai: pushes created then are sent by the hourly fan-out. Not relevant if the rule above holds.
- The run script checks after every step that no `AppNotification` mentioning `qc-prod-` exists for the owner or shop-wide.

**A real exposure that the walk cannot avoid — needs a decision (§f-1)**: while the temp MANAGER membership exists, the chat module treats it as staff
with chat access (`chat/notify.ts:107-112`, `core/rbac.ts:32-36`): a real customer message arriving during the walk creates an `AppNotification`
**with the message preview** addressed to the temp manager (`chat/service.ts:632-660`), and the temp manager appears in staff pickers
(`chat/service.ts:50-64`). Nobody can read it (no login is possible for a `.invalid` address; our session opens CRM URLs only) and cleanup deletes
those rows, but it is customer text copied into rows of a throw-away account for up to ~2 h.

## c. Walk script (`prod-walk-run.mjs`, run through `bash scripts/iso.sh node …`)

Stages, each its own process and its own `result-<stage>.json` + `requests-<stage>.log` in `/tmp/c63-walk/`:

1. `--stage pages` — 47 static pages × 4 staff roles × 2 viewports (1440×900, 390×844) = 376 loads. **Every non-GET request is aborted in the
   browser**, every request to another origin is aborted, `/t/* /l/* /f/* /u/* /api/cron*` are never requested. Per page: HTTP status, final URL,
   registry controls present (from `scripts/crm-ui-inventory.json`, role map owner/manager/lead→nok/staff→thana), `hiddenFor` leaks,
   horizontal overflow, console/page errors, full-page screenshot `shots/<stage>-<role>-<vp>-<key>.png`.
   Expected up-front (`--plan` prints the full matrix): lead/staff **404 on `/companies*`** (by design, C5.5-fix2); pages where the registry gives a role no
   control are "gated" (status recorded and compared with QC evidence, not a failure); everything else 200.
2. `--stage scenario` — the B2B dive-trip story, UI only, selectors from the form sources (`NewCompanyForm`, `NewContactForm`, `NewDealForm`,
   `LogActivityForm`, `Deal360Actions`, `DealMoveDialogs`). After each step: created id checked (tenant + system + marker) and appended to the manifest,
   DB state asserted read-only, outbox drained, side-effect indicators compared.

   | Step | Role | Action | Assertion |
   |---|---|---|---|
   | S01 | owner | company `qc-prod-Andaman Corporate Travel` | own marked Party, no account contact |
   | S02 | owner | contact `qc-prod-Wanna Buyer` (e-mail `.invalid`, no phone) linked to the company | 1 live company link, no member link |
   | S03 | manager | lead `qc-prod-Somchai Lead` (no phone, no e-mail) assigned to staff | owner = staff |
   | S04 | staff | own lead 200 · owner's contact 404 | HTTP |
   | S05 | staff | deal `qc-prod-Corporate dive trip 20 pax` 180 000 ฿ | owner = staff, first OPEN stage |
   | S06 | staff | CALL activity on the deal | row exists, no reminder |
   | S07 | lead | opens the staff's deal (team), moves → ติดต่อแล้ว → เสนอราคา | stage, history |
   | S08 | manager | 2 deal lines | 2 lines, 0 approval requests |
   | S09 | manager | WON | kind WON, closedAt, Customer count unchanged |
   | S10 | lead → staff | deal `qc-prod-Liveaboard charter` 95 000 ฿ → LOST with reason | kind LOST, reason set |
   | S11 | owner | deal `qc-prod-Annual corporate contract` 400 000 ฿ on the company contact | company deal owned by owner |
   | S12 | all | visibility matrix on 3 deals / 2 contacts / company | owner+manager 200 · lead/staff: team deals 200, owner's deal/contact 404, company 404 |
   | S13 | manager | reports | DB: won 180 000 ฿ · lost 1 · open 1 (pages shot in stage 3) |
   | S14 | owner → customer | portal on (UI) → `setup --stage portal` → customer pages → customer on `/app/*` lands on `/login` | settings, session, HTTP |

3. `--stage pages-after` — stage 1 again with data, plus deal/contact/company 360 pages per role.
4. `--stage portal` — customer session: 6 portal pages × 2 viewports, then a staff URL (must land on `/login`).

Phase 2b (only after the core passes, each added as one more step with its testids from the registry): custom object + record, sequence definition
without enrolment, lost reason add, quota, assignment rule, saved view.

**Not verified in phase 1**: no selector of stage 2 has been exercised (no QC server use allowed in this task). A selector that does not match times
out → the step aborts before or after its single write; the manifest already holds what exists.

## d. Snapshot + cleanup

- `prod-walk-snapshot.cjs --out <file>` (read-only): for all 299 tenant tables count · max(createdAt) · max(updatedAt) · md5 of the id list; md5 of full
  row text for CRM/Team/Portal/AppSystem/Membership/Party/MemberField/ApiKey/Webhook/Notification/Approval tables; `Tenant` row hash; global: temp
  users, tagged sessions, owner session count, owner User/Membership hashes; setup facts. `--compare a b` lists every drifting table (exit 3).
  Done now: `/tmp/c63-walk/snapshot-before-phase1.json`. **Phase 2 takes a fresh `snapshot-before.json` immediately before `setup --apply`.**
- Manifest `/tmp/c63-walk/manifest.json`: setup ids written before the first INSERT; each scenario step records its intent before its first write and
  the id right after the UI returns it; holds the pre-walk `AppSystem` settings text + `updatedAt` + row hash.
- `prod-walk-cleanup.cjs` (dry-run default; `--apply --before <snapshot>`), **one transaction**:
  1. id sets: temp users by marker e-mail; CRM-owned tables (`Crm*`, `CustomObject`, `CustomRecord*`, `Team`, `TeamMember`, `PortalSession`) by marker
     column ∪ manifest ids, then a fix-point over link columns (`contactId`, `companyId`, `dealId`, `activityId`, `teamId`, `recordId`, … and any
     user column pointing at a temp user). Aborts if a selected row is older than the walk, belongs to another tenant, or is one of the shop's own
     pipelines/stages/lost reasons.
  2. deletes, children first (FK order from the catalogue), every statement `tenantId = pilot AND id = ANY(set)` with a cap and, for the core tables,
     an exact expected count: rate buckets and notifications of temp users → `AppNotification` mentioning `qc-prod-` → member-module rows written
     under the CRM systemId → OutboxEvent history (`crm.*|custom.*|team.*`, payload containing a temp id, not PENDING) → AuditLog (actor = temp user or
     target = temp row; owner-session rows on the pilot system with `crm.*` action except `crm.settings.uiVersion`) → CRM rows → `Party` (marker AND
     created during the walk AND held by nothing else) → `Session` → `Membership` → `User`.
  3. `AppSystem` (pilot CRM) restored to the saved settings + `updatedAt`; the row hash must equal the pre-walk hash.
  4. post-conditions inside the transaction against the BEFORE snapshot: every CRM-owned table, Membership, Party, AppSystem, MemberField,
     MemberSection, MemberSavedView back to the old count; 0 temp users; 0 tagged sessions; 1 membership. Any miss ⇒ ROLLBACK.
  5. refuses to apply while the tenant has PENDING outbox events, or when an unknown table references a temp user.
- After COMMIT: `snapshot --out snapshot-after.json` and `--compare`. Expected result: identical for every WATCH table. Explicit residuals and decisions:

  | Residual | Decision proposed |
  |---|---|
  | `AuditLog` rows of the walk | deleted by default (they point at rows that no longer exist; precedent `scripts/pending/portal-visual-prep.mts`); `--keep-audit` keeps them. SYSTEM-actor rows with no temp target would show up in the compare |
  | `OutboxEvent` history of the walk | deleted by default (`--keep-outbox` keeps) |
  | `OpsEvent` | never deleted by the script; listed, controller decides (expected: none) |
  | `ChatRateBucket` (global, no tenantId) | buckets keyed by a temp user id deleted; a bucket keyed by the owner's id (`crm:contact:ident:<tenant>:<owner>`) stays and self-expires in 24 h |
  | Postgres sequences | none consumed: ids are cuids; the only DB sequences are the accounting journal numbers, never touched |
  | Vercel/function logs, Bunny, Resend, Expo | nothing sent by design; request logs of our page loads remain |
  | Live shop activity (chat etc.) between the two snapshots | appears as drift on non-CRM tables; each line must be attributed (real chat vs. ours) before the walk is declared clean |
- Emergency: `prod-walk-cleanup.cjs --cleanup-only [--since <ISO>]` works without a manifest (marker e-mail, name markers, session tag); it cannot
  restore `AppSystem` byte-for-byte (prints that; the saved copy is also in the last BEFORE snapshot's hash for comparison).

## e. Abort rules (run script exits 4; then cleanup dry-run → apply → compare → report)

- any same-origin 5xx; a staff session bounced to `/login`;
- a non-GET request outside an armed scenario step (aborted in the browser and reported);
- a created row that is not under the pilot tenant + pilot system + marker;
- any side-effect indicator moving: CrmEmailMessage, Customer, AccountDocument, AccountContact, KanbanCard, `crm.*` WebhookDelivery, AutomationRun,
  AiCreditTxn, CrmSequenceEnrollment, an owner/shop-wide `AppNotification` mentioning `qc-prod-`;
- a failed DB assertion; outbox not drained after 60 s is a finding (cleanup then waits);
- snapshot drift after cleanup that cannot be attributed.

## f. Open questions for the controller / owner

1. **Temp MANAGER and live customer chats** (see §b): accept the 2-hour window in which a real chat message preview may be copied into a notification
   row of the temp manager (deleted at cleanup), or drop the MANAGER membership and walk the manager role as a STAFF with all non-owner CRM keys
   (`CRM_ROLE_DEFAULTS.MANAGER`) — no chat exposure, but it is then not literally role `MANAGER`.
2. **Portal switch**: enabling `settings.crm.portal` makes `/b/siam-dive-center/login` public (instead of 404) until cleanup. OK for ~30 min, or skip the
   customer role on prod and rely on QC evidence (C3.5 lock-out 94/94)?
3. **Audit trail**: delete the walk's `AuditLog` + `OutboxEvent` rows (snapshot identical) or keep them as a record (`--keep-audit`/`--keep-outbox`)?
4. **Owner session**: minting a session for the real owner's user is in the order; confirm the walk may also press the portal-settings save as the owner
   (one `crm.portal.settings` audit row under the owner's name, removed with the others).
5. **Timing**: run outside shop hours? The owner's phone gets nothing by design, but the temp team/users are visible in the owner's own staff/team
   screens while the walk runs, and `/settings/email` opened by the walk mints the CRM inbound key (reverted at cleanup — if the owner opens that page in
   the same window and copies the address, it would stop working).
6. **Home page**: the industry-template chooser is still showing for the owner. The walk leaves it untouched; KPI tiles behind it are therefore covered by
   QC evidence unless the owner picks a template first.
7. **Not determined from code**: whether prod has `RESEND_API_KEY` / `SHARK_AI_KEY` set (irrelevant if the SKIP list holds); whether the per-minute CRM
   cron is running on the VPS (affects only reminders/sequences, which the story does not create).

## Order of commands in phase 2 (for review — not run)

```
node scripts/pending/c6/prod-walk-snapshot.cjs --out /tmp/c63-walk/snapshot-before.json
node scripts/pending/c6/prod-walk-setup.cjs                    # dry-run, read it
node scripts/pending/c6/prod-walk-setup.cjs --apply
bash scripts/iso.sh node scripts/pending/c6/prod-walk-run.mjs --stage pages
bash scripts/iso.sh node scripts/pending/c6/prod-walk-run.mjs --stage scenario
node scripts/pending/c6/prod-walk-setup.cjs --stage portal --company <id> --contact <id> [--apply]
bash scripts/iso.sh node scripts/pending/c6/prod-walk-run.mjs --stage pages-after
bash scripts/iso.sh node scripts/pending/c6/prod-walk-run.mjs --stage portal
node scripts/pending/c6/prod-walk-cleanup.cjs                  # dry-run, read it
node scripts/pending/c6/prod-walk-cleanup.cjs --apply --before /tmp/c63-walk/snapshot-before.json
node scripts/pending/c6/prod-walk-snapshot.cjs --out /tmp/c63-walk/snapshot-after.json
node scripts/pending/c6/prod-walk-snapshot.cjs --compare /tmp/c63-walk/snapshot-before.json /tmp/c63-walk/snapshot-after.json
```

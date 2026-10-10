# C4.4 — user journeys US1–US10 end to end (oracle-proposed contract)

Read `crm-brief-COMMON.md` + `crm-brief-C4.md` §C4.4 first. This is the C4.4 oracle writer's proposed contract for
the ten user-journey oracles in `scripts/crm-journeys/US1.mts…US10.mts`, driven from
`scripts/visual-crm.mts --journey USn|all [--dry] [--clean]` via `scripts/crm-journeys/lib.mts` (owned entirely by
C4.4 — the crawler/inventory code in visual-crm.mts is untouched except for one small additive dispatch block).

Story text quoted below is copied verbatim from `docs/modules/20-crm-v2.md` §1.4 (§13 references the same set).
Every assertion below is what the journey module ACTUALLY checks against the live DB (via `ctx.check`), not a
paraphrase — read the `.mts` file itself for the exact prisma `where` clauses.

## Environment model (read this before touching the code)

`scripts/crm-journeys/lib.mts#resolveEnv(prisma)` resolves tenant/system/users/teams/pipelines/objects **live**
against whichever DB is active (QC2 today via `.env.qc2`/`scripts/qc2.sh`, QC1 later when the controller runs
Phase 2) instead of reading `scripts/crm-expected.json`. That file is per-QC-branch and gets overwritten by whoever
last ran `seed-crm-qc.mts` in a given worktree — it does NOT reliably describe QC2's actual row ids (verified 27 Sep:
this worktree's checked-in `crm-expected.json` has `tenantId cmuj0szjt…`, QC2's real tenant is `cmuipj7n1…` — a
different Neon branch). Resolving live sidesteps that entirely and matches the same fallback-by-email pattern
`mintSession()` in visual-crm.mts already uses for users.

`--dry` mode: `resolveEnv` always runs (proves the DB has what a journey needs — tenant, CRM system, 4 users, 2
teams, 2 pipelines with stages, the `contract` custom object). Each journey's `run(ctx)` always prints its full step
plan via `ctx.plan()` and always resolves any story-specific ids it can without a browser; it only skips
`ctx.loginStaff()`/`ctx.newAnonPage()`/screenshots/DB-write setup/assertions when `ctx.dry` is true.

`--clean`: every row a journey creates is recorded via `ctx.own(model, id)` into `.qc-shots/crm/journeys/USn/created.json`
after a real (non-dry) run; `--clean` reads every such manifest and deletes by id, in the dependency order in
`CLEAN_ORDER` (lib.mts). Rows also get a `qc-jrn-<story>` marker baked into whichever free-text field the model has
(company/contact/deal names, form/rule/sequence names) for visibility, but `--clean` does NOT rely on name-matching
— only on the id manifest — because several models here (Session, PortalSession, CrmWebSession) have no free-text
field to tag at all.

## Per-story contract

### US1 — web form lead → round-robin → notify → score
> ลูกค้ากรอกฟอร์มบนเว็บร้าน (มี utm) → lead ใหม่ใน CRM ระบบที่ฟอร์มตั้ง · มอบหมาย round-robin ให้ทีมภูเก็ต · พนักงานได้ LINE · คะแนน +10 · ที่มา first touch = WEB_FORM/utm ครบ

Roles: owner (setup), anon (the customer). Steps: create a round-robin assignment rule → phuket team (facade,
`assignment.createRule`) · create a public lead form via `forms.createForm` + `forms/service.ts#updateCrmFormTarget`
targeting this CRM system with `scoreOnSubmit=10` · **real UI**: open `/f/<token>?utm_source=facebook&utm_medium=cpc&utm_campaign=…`,
fill name+phone, wait out the 3s spam-guard minimum, submit, see `form-public-done`.
DB assertions: `CrmContact.sourceKind === "WEB_FORM"`; `sourceDetail` JSON contains the `utm_campaign` value;
`ownerUserId` belongs to a `TeamMember` row of the phuket team; `score === 10`; an `AppNotification` exists for the
assigned owner.

**DECISION-US1-2** (do not weaken): the story says "พนักงานได้ LINE" (gets a LINE message). `docs/modules/20-crm-v2.md`
§15 mति C22 explicitly defers the LINE channel ("LINE ถึงพนักงานรอเจ้าของตัดสิน") — it is not implemented. This oracle
asserts the real, implemented channel (in-app `AppNotification`) and does not claim LINE fired.

### US2 — convert lead → company+deal → WON → auto member
> พนักงานเปิด lead → กด "แปลง" ติ๊ก บริษัท+ดีล → บริษัท (Party COMPANY · เลขภาษี) ผู้ติดต่อเป็น "ผู้ตัดสินใจ" ดีลอยู่ขั้นแรก · ต่อมา ดีลชนะ → สมาชิกถูกสร้าง (source CRM) อัตโนมัติ

Roles: thana. **Real UI**: contact 360 → `contact-convert-btn` → tick company (new) + deal → submit; then
`deal-stage-step-<WON stage id>` to move the deal WON.
DB assertions: `contact.companyId` set, `contact.convertedAt` set, deal created at the pipeline's first OPEN stage
linked to the same contact+company; after WON, `contact.memberCustomerId` set and the linked `Customer.phone` matches.

**DECISION-US2-1 (finding, not weakened)**: `ConvertInput` (`src/lib/modules/crm/contacts-shared.ts:239-246`) is
```
company?: { id: string } | { new: { name: string } } | null;
deal?: { pipelineId: string; stageId?: string | null; title: string; valueSatang?: number | null } | null;
```
— **no `taxId` field, no contact-role field at all.** `companies.createCompany` DOES support `taxId`
(`companies.ts:127`), so the capability exists elsewhere but isn't wired into the convert flow. The story's
"เลขภาษี" and "ผู้ตัดสินใจ" role cannot be set through `convertContact` today. The oracle's check `US2-4-GAP` records
this as a real finding (company.taxId is null after convert, confirmed not a test bug) rather than inventing a
workaround that would hide the gap.

### US3 — quote 3 lines → issue → portal accept → auto stage move
> ดีลมีรายการสินค้า 3 บรรทัด → "ออกใบเสนอราคา" → เอกสารบัญชีจริง QT พร้อมบรรทัด/ภาษี · ลูกค้ากดตอบรับใน portal → ดีลเลื่อนขั้น "ตกลง" อัตโนมัติ + กิจกรรม + แจ้งผู้ดูแล

Roles: owner (setup+invite), thana (issue quote), anon→customer (portal). **Real UI**: `deal-quote-btn` → real UI
`crm-portal-invite` on the company page → real invite link → anon page `/b/[slug]/invite/[token]` →
`portal-invite-accept` → `/b/[slug]/quotations/[id]` → `portal-quote-accept` → `portal-signer-name` →
`portal-quote-confirm-submit`.
DB assertions: `deal.stageId` moved to the configured accept-stage; an activity logged on the deal near acceptance;
the deal owner notified.

**DECISION-US3-1 (finding + setup workaround, documented)**: `CrmPipeline.stageOnQuoteAcceptedId`/`stageOnQuoteRejectedId`
are real and wired (`deals.ts:2089-2095`, `respondQuotation` → `moveCore`) but **there is no UI control for them
anywhere** — not in `/settings/pipelines`, not in `/settings/stages` (both registries checked, neither has a
matching testid). A shop cannot configure this today. The journey sets the field directly via prisma as a SETUP step
(representing "the shop already configured this") and restores the original value in `finally`. The blueprint's
stage name "ตกลง" does not exist in the seeded B2B pipeline (stages: ผู้สนใจใหม่/ติดต่อแล้ว/เสนอราคา/ปิดการขายได้/ไม่สำเร็จ) — the
journey targets "ปิดการขายได้" (WON) as the closest real analogue and asserts against that stage id, not a literal
match on the name "ตกลง". **Controller decision needed**: should `/settings/pipelines` get a control for this field
before C6?

### US4 — 14-day stale → follow-up task + notify lead → call clears it
> ดีลไม่มีกิจกรรม 14 วัน → cron ติดป้ายนิ่ง · กฎสร้างงานติดตาม + แจ้งหัวหน้าทีม · พนักงานโทร (บันทึกสาย + ไฟล์เสียง → AI สรุป) → ป้ายนิ่งหาย

Roles: owner (setup+starter rules), thana (call log). Setup calls `deals.markStale()` and
`automation.runCronTriggers()` directly (cron entrypoints, no UI exists for "run cron now" — same convention
visual-crm.mts's own C2.10 screenshot setup already uses). **Real UI**: `/settings/automation` → `crm-auto-starters`
→ enable the "deal-stale-14" starter rule → `crm-call-log-open` on the deal → fill outcome/duration/note →
`crm-call-save`.
DB assertions: `stalledAt` set by markStale; the starter rule exists+enabled; a TASK activity created by the rule; the
phuket manager notified; a CALL activity recorded; `stalledAt` cleared afterward.

**DECISION-US4-1**: does not press `crm-call-ai-transcribe`/`-accept` (spends real AI credits — same convention as
`crm-brief-C4.md`'s "ไม่กดปุ่ม AI" note and visual-crm.mts C3.4). The call-log→stale-clears assertion doesn't need AI.

### US5 — send quote email → open×2/click×1 → reply → same thread → sequence stops
> ส่งอีเมลใบเสนอราคาจาก CRM (ชื่อผู้ส่ง = พนักงาน · Reply-To ตามตั้งค่า C4) · ลูกค้าเปิด 2 ครั้ง คลิก 1 · ตอบกลับ → เข้ากล่องอีเมลร้าน → thread เดียวกัน · sequence หยุดเอง

Roles: owner (setup), thana (send). **Real UI**: `/emails/[threadKey]` composer → `crm-email-send`. Real HTTP:
`/t/o/[token].gif` hit twice, `/t/c/[token]` hit once, tokens parsed out of the ACTUAL sent `bodyHtml` (not a
hand-rolled token via `emails.trackOpen`/`trackClick` called directly).
DB assertions: `openCount===2`, `clickCount>=1` on the sent message; the inbound reply lands on the same `threadKey`;
`SequenceEnrollment.status === "STOPPED"`.

**DECISION-US5-1 (finding, worked around for testability)**: there is **no UI entry point to start a brand-new
OUTBOUND thread** from a contact/deal page — the registry's only composer lives on `/emails/[threadKey]`, which
needs a thread to already exist. This oracle opens the thread with an inbound "customer asks a question" message via
`emails.ingestInbound` (the real provider-webhook code path — there is no UI for receiving mail either, so this
isn't a UI gap, it's the correct way to simulate an external event) and then drives the STORY's actual send action
(the quotation reply) through the real `crm-email-send` button. **Controller decision needed**: should there be a
"compose new" entry point on the contact/deal page? Flagged, not fabricated around.

### US6 — cross-team 404 → reassign → visible + event
> พนักงาน STAFF ทีมกระบี่ เปิด `/deals/{id}` ของทีมภูเก็ต → 404 · หัวหน้าทีมภูเก็ตโอนดีลให้ทีมกระบี่ (`crm.deal.reassign`) → เห็นได้ + event

Roles: manager (ภูเก็ต lead, owns the deal), nok (กระบี่ STAFF). **Real UI**: nok opens the deal (expect 404) →
manager reassigns via `deal-owner-select` (select → nok's userId) → nok re-opens (expect 200).
DB assertions: HTTP status 404 (not any 403/forbidden render) on the first hit; `ownerUserId` reassigned; an outbox
event (`crm.deal.reassigned` or `crm.deal.updated` carrying the new owner) fired; HTTP 200 + deal 360 renders on the
second hit.

**DECISION-US6-1**: `deal-owner-select` only has an "owner" (person) selector in the registry — no separate
team-transfer control. `deals.reassignDeal(ctx, actor, id, { ownerUserId, teamId? })` accepts an explicit `teamId`,
but the UI component (`Deal360Actions.tsx:240-252`) only ever calls `reassignDealAction(systemId, dealId, ownerId)`
— no `teamId` argument. The oracle assumes reassigning the OWNER to a กระบี่-team person is enough to cross visibility
(team is presumably derived from the new owner's `TeamMember` row) — if that assumption is wrong, `US6-4` will show
it red, which is the correct signal.

### US7 — invoice paid → commission → approve → payroll → void → reverse
> ใบแจ้งหนี้ของดีลถูกชำระ → คอมมิชชัน 5% เข้ารายการรออนุมัติ → อนุมัติ → `HrPayAdjustment` งวดเดือนนี้ · void ใบแจ้งหนี้ → REVERSED

Roles: owner (rule + payroll push), manager (approve), thana (issue invoice, commission recipient). **Real UI**:
`/settings/commissions` rule builder → `deal-invoice-btn` → `/settings/commissions` approve flow → `crm-commission-send-payroll`.
Setup/trigger (facade, ACCOUNT module — see DECISION below): `recordPayment`, `voidPayment`, `voidDocument`.
DB assertions: `CrmCommission` PENDING at 5% of deal value after payment; APPROVED + `hrPayAdjustmentId` set after
approve+payroll push; `REVERSED` after void.

**DECISION-US7-1**: "the invoice gets paid" / "gets voided" are ACCOUNT-module actions
(`src/lib/modules/account/service.ts#recordPayment/voidPayment/voidDocument`) — that module owns its own button
coverage under a different WO's C4.2, not this registry. This oracle calls those facade functions directly (the
same functions the account UI's own buttons call) rather than driving the account app's UI, and keeps everything
CRM-side on the real CRM UI.

### US8 — custom object "contract" → renewal rule
> เจ้าของสร้างวัตถุ "สัญญา" ผูกบริษัท 1–n · ฟิลด์ เลขที่/เริ่ม/สิ้นสุด/มูลค่า/ต่ออายุอัตโนมัติ · แท็บโผล่ในบริษัท 360 · กฎ "สัญญาหมดใน 30 วัน → สร้างดีลต่ออายุ" ทำงาน · REST `/objects/contract/records`

The "สัญญา" custom object is already seeded (C1.9) — this journey does NOT recreate the object definition, only
exercises it. **Real UI**: company 360 → contract tab → `object-record-new-btn` → fill `contractNo`/`startAt`/`endAt`/`valueSatang`/`autoRenew`
→ `object-record-save`; `/settings/automation` → `crm-auto-new` → trigger `custom.record.field_due(object=contract,
field=endAt, daysBefore=30)` → action `CREATE_DEAL`. Setup/trigger (facade, cron entrypoint, no UI):
`automation.runCronTriggers()`.
DB assertions: `CustomRecord` created under the company; the rule saved with `event="custom.record.field_due"`; a
renewal `CrmDeal` exists for the company after the cron trigger runs.

**DECISION-US8-1**: `src/lib/modules/crm/objects.ts` exports only the OBJECT-definition CRUD (create/update/archive/
list/get for the schema itself) — there is no `records.get`/`records.list` facade export to read a record's field
values back outside the REST/op layer. The oracle verifies the created record via raw `CustomRecord`/
`CustomRecordValue` instead.

**DECISION-US8-2 (unverified — flagged, not asserted around)**: `automation.ts:910` skips the `CREATE_DEAL` action
with "เหตุการณ์นี้ไม่มีผู้ติดต่อ — เปิดดีลให้ไม่ได้" when the firing event's scope has no `contact`. The
`custom.record.field_due` trigger fires on a COMPANY-parented contract record. Whether the cron-trigger scope
builder resolves the company's primary contact into `s.contact` for this event kind was **not traced to the bottom**
(would need reading the full `cronCandidatePages`/scope-builder path in `automation.ts`, ~1500 lines, not done under
this WO's time budget). If it doesn't resolve a contact, `US8-3` will legitimately go red on the first real run —
that is the intended signal for the controller to route to either an ORACLE-EDIT (if the story's company-level
trigger genuinely can't reach `CREATE_DEAL`) or a product fix (resolve the company's primary/first contact into
scope for company-scoped triggers).

### US9 — web tracking consent → 3 page views → retroactive bind → decline = nothing
> เปิด `tracking.web.enabled` → เว็บร้านโหลด `shark.js` → แถบ cookie consent · ผู้เยี่ยมชมกด "ยอมรับ" · เปิด 3 หน้า · กรอกฟอร์ม → 3 page view ผูกผู้ติดต่อย้อนหลัง · ไม่ยอมรับ → ไม่บันทึกอะไร

Roles: owner (enable), 2×anon (accept visitor, decline visitor). **Real UI + real script**: `/settings/tracking` →
`crm-track-web-enabled` → `crm-track-save` → parse the real `siteKey` out of `crm-track-embed-code`; anon browser
`page.addScriptTag({ url: BASE + "/t/s/" + siteKey })` against `/b/[slug]/login` (real consent banner, real
`[data-sd=accept]`/`[data-sd=decline]` buttons); same-origin `/f/[token]` public form fill+submit (real `sd_vid`
cookie carries over, exactly how `submitPublicFormGuarded` reads it — `actions.ts:20-25`).
DB assertions: accepting visitor's `CrmWebSession.pageViews === 3`; `CrmWebSession.contactId` bound to the contact
the form created; declining visitor has **zero** session/page-view rows.

**DECISION-US9-1**: this app has no public multi-page storefront of its own — a real shop embeds `shark.js` on ITS
OWN website, which doesn't exist in this test environment. The oracle reuses the one stable public page this app
does serve (`/b/[slug]/login`), navigated 4 times with distinct query strings. Visit 1 shows the consent banner and
clicks "ยอมรับ" (the script's own `start()` does NOT call `send("page")` on that same load — only on a SUBSEQUENT
load once the consent cookie already exists, per `tracking.ts:1271-1380`'s actual JS). Visits 2–4 each auto-fire a
real page view — 3 total, matching "เปิด 3 หน้า" via the script's real logic, not a fabricated count.

### US10 — external AI agent REST/webhook + in-app AI risk panel
> AI agent ภายนอก `GET /deals?stale=true` แล้ว `POST /activities` ด้วย Idempotency-Key · webhook `crm.deal.stale` ยิงถึงระบบร้าน · เจ้าของถาม AI ในแอป "ดีลไหนเสี่ยงเดือนนี้" ได้ 3 ดีล + ข้อเสนอสร้างงาน (อนุมัติก่อนทำ)

Roles: owner (API key + webhook setup, real UI on `/settings/api`), external-agent persona (real `fetch()` calls).
DB assertions: `ApiKey` created; `WebhookEndpoint` registered; `GET /deals?stale=true` (Bearer auth) returns ≥3 stale
deals including the 3 the setup created; `POST /activities` with an `Idempotency-Key` header creates exactly one
`CrmActivity` even when retried with the same key; a `WebhookDelivery` row exists for the endpoint.

**DECISION-US10-1**: the webhook SSRF guard (`webhookTargetProblem`, COMMON brief line 16) rejects
127.0.0.1/localhost/169.254.169.254 by design (X8) — this worktree's QC server runs on 127.0.0.1, so this oracle
cannot stand up its own receiver and prove an HTTP delivery actually LANDED. It registers a real, resolvable,
non-loopback URL (`https://example.com/hooks/crm-qc`) and asserts the webhook layer ATTEMPTED delivery (a
`WebhookDelivery` row exists) — "the webhook fires" — not that example.com understood the payload. **Controller
decision needed**: if a real delivery-succeeds assertion is wanted for Phase 2, the controller needs to either
allowlist a QC-only receiver in the SSRF guard or stand up an externally-reachable stub endpoint.

**DECISION-US10-2**: same AI-cost convention already established elsewhere in this RUN (crm-brief-C4.md: "ไม่กดปุ่ม AI
(เรียกโมเดล/หักเครดิต)"; visual-crm.mts C3.4) — the oracle does not press the real "ถาม AI" button (spends AI credits on
every QC run, non-deterministic output). It screenshots the panel's unclicked state and instead asserts, through the
real REST endpoint the AI panel is itself built on (`GET /deals?stale=true`), that the underlying "3 ดีลเสี่ยง" data
contract is correct — the part of the story that's actually testable deterministically without a live model call.

**DECISION-US10-3**: no dedicated testid exists in the registry for the plaintext API-key value shown once after
`crm-api-key-submit`. The oracle best-effort scrapes a ≥24-char url-safe token out of the page body right after
creation; if the UI ever changes how that's rendered, this specific step (not the DB assertion) may need an
ORACLE-EDIT.

## C4.4-fix items (confirmed product bugs — controller: do NOT fix from here, route to a builder WO)

- **C4.4-fix-1 (US3)**: `src/lib/modules/crm/deals.ts` function `dealDocInput` (~lines 1288-1299) passes the deal's
  CONTACT's individual `partyId` into `createExternalQuotation`/`createExternalInvoice`. The B2B customer portal's
  document-visibility scope, `src/lib/modules/crm/portal.ts:434` (`scope()`), filters by the COMPANY's `partyId`.
  Verified on QC1 by direct query: an issued quotation was `AWAITING_ACCEPT` (not draft — `issueDocument()` had
  already run) with `AccountContact.partyId` exactly matching the CRM contact's own `partyId`, and it still 404s in
  the portal because the portal only ever looks for the COMPANY's `partyId`, which the document never carries.
  **Structurally, no quotation or invoice issued through `deals.issueQuotation`/`issueInvoice` for a company-linked
  deal can ever be visible in the B2B portal.** This blocks the entire "customer accepts in the portal" half of US3
  (checks US3-3 through US3-6 stay red — correctly, this is the real product state, not a test artifact). Fix
  belongs in `dealDocInput`: pass the deal's COMPANY `partyId` (or both contact and company) into
  `createExternalQuotation`/`createExternalInvoice`.

## Summary of controller decisions needed (collected from above)

1. US3: should `/settings/pipelines` get a UI control for `stageOnQuoteAcceptedId`/`stageOnQuoteRejectedId` before C6?
2. US5: should there be a "compose new outbound thread" entry point on the contact/deal page?
3. US6: confirm reassigning only the deal owner (no explicit `teamId`) is sufficient for cross-team visibility —
   or the UI is missing a team-transfer control alongside the owner one.
4. US8: does the `custom.record.field_due` cron-trigger scope resolve a company's primary contact for `CREATE_DEAL`
   actions on company-parented custom objects? (traced far enough to flag, not far enough to answer — see
   `automation.ts:909-912` and the scope builder above it.)
5. US10: is "webhook delivery attempted" (not "delivery succeeded") an acceptable Phase-2 bar given the SSRF guard,
   or should the controller provision an externally-reachable QC receiver?

## Files

- `scripts/crm-journeys/lib.mts` — shared harness (env resolution, session minting, browser bootstrap, `JourneyCtx`,
  CLI entry `runJourneyCli`, `--clean`).
- `scripts/crm-journeys/US1.mts` … `US10.mts` — one module per story, `export async function run(ctx)`.
- `scripts/visual-crm.mts` — one small additive dispatch block near the top (`if (argv.includes("--journey") ||
  argv.includes("--clean"))`) that delegates to `runJourneyCli`; nothing else in that file was touched.
- Output: `.qc-shots/crm/journeys/USn/*.png`, `.qc-shots/crm/journeys/USn/created.json` (per-story id manifest),
  `.qc-shots/crm/journeys/summary.json` (`{total, passed, failures[{story, step, expected, actual}]}`).

## Controller ruling (Fable · 27 Sep ~14:50 UTC) — BINDING
- Rule: a story step the product cannot do = a PRODUCT GAP to fix (work order **C4.4-fix**), never a weakened assertion. Prisma SETUP is allowed only for data the seed lacks, never to stand in for a control the story asks the user to press.
- US1 LINE-to-employee: accepted as deferred by blueprint C22 → assert in-app AppNotification (as written).
- US2 taxId + contact role on convert: PRODUCT GAP → C4.4-fix (keep the assertion; it goes red until fixed).
- US3 `stageOnQuoteAcceptedId` has no UI: PRODUCT GAP → C4.4-fix adds the control in `/settings/pipelines`; until then keep the prisma setup but mark the step `gap:true` so the story reports red-for-gap, not green.
- US5 new outbound thread: quote the exact story text in Phase 2 — if the story has staff START an e-mail to a contact, it is a PRODUCT GAP (C4.4-fix: compose entry on contact/deal 360); if it starts from an inbound mail, the simulated inbound is correct.
- US6: the assertion decides — the other team's manager must see the deal after owner reassignment (real session). If red, it is a product question for the controller, not a test change.
- US8: trace `automation.ts` scope building for company-parented objects in Phase 2 before running; report the trace (file:line). Red = product bug.
- US10: "delivery attempted" accepted as the QC bar, PLUS assert the WebhookDelivery row carries the signed payload (signature header + body shape). No SSRF-guard change.

## Addendum (controller ruling, resumed session) — thana's QC1 permission set

US2/US3/US7 use `withStaffPermissions()` (lib.mts) to grant thana (STAFF) the specific `crm.*` keys her story
actions need (`crm.contact.convert` for US2; `crm.deal.update`+`crm.deal.quote` for US3/US7's quote/invoice
buttons), restoring her original `Membership.permissions` afterward. Proven NOT a product-gap workaround:
- `src/app/app/settings/staff/GrantAccessForm.tsx`: granting access is explicitly zero-permissions-by-default
  ("ไม่เห็นและทำอะไรไม่ได้เลย จนกว่าคุณจะติ๊กสิทธิ์ให้ในหน้าแก้สิทธิ์") — deliberate product design.
- `src/app/app/settings/staff/[membershipId]/AccessForm.tsx:48`: the real per-person permission editor exists and
  matches `crmCan()`'s explicit-keys-only model exactly.
- QC1's seeded thana (`seed-crm-qc.mts:132-137`) was deliberately given a narrow permission set for OTHER WOs'
  visibility/boundary tests; she was simply never granted the extra keys these stories' actions need.
`withStaffPermissions()` stands in for "the owner already ticked those boxes" — legitimate fixture SETUP.

## C4.4-fix item — US3 PRODUCT BUG: B2B portal never shows a company-linked deal's quotation/invoice (confirmed, real, not a gap)

Found running US3 against QC1 (28 Sep). Full trace, in file:line order:

1. `src/lib/modules/crm/deals.ts` `dealDocInput()` (~1288-1299) builds the customer payload for
   `createExternalQuotation`/`createExternalInvoice` from **the deal's CONTACT**: `partyId: contact.partyId` — the
   individual person's own Party, not the company's.
2. `src/lib/modules/crm/portal.ts` `scope()` (~434) — the function that decides which `AccountDocument`s a B2B
   portal session may see — filters by **the COMPANY's** `partyId` (the portal is a company-account concept: one
   login, all of that company's documents).
3. Consequence, verified by direct query against QC1 (not inferred): after `deals.issueQuotation` +
   `account.issueDocument()` (DRAFT→AWAITING_ACCEPT), the resulting `AccountDocument`'s linked `AccountContact.partyId`
   was EXACTLY the CRM contact's own `partyId` — and the portal still 404s it, because `portal.ts:434` never looks
   for that value; it only matches the company's `partyId`, which this document never carries.
4. **Structural, not data-dependent**: any quotation or invoice issued through `deals.issueQuotation`/`issueInvoice`
   for a deal that has a `companyId` can never be visible in the B2B customer portal, on any tenant, any seed. This
   blocks the entire "customer accepts in portal" half of US3 (US3-3 through US3-6 stay red — correct, not weakened).
5. **Suggested fix location (not applied — oracle writers don't touch product code)**: `dealDocInput()` should pass
   the deal's company `partyId` (via `deal.companyId` → `CrmCompany.partyId`) instead of, or in addition to, the
   contact's own `partyId`, so `portal.ts:434`'s company-scoped lookup can find it.

This is independent of seed data — reconfirmed unchanged after the 28 Sep QC1 reseed (new ids, same code path).

## One-line answer for the controller's "which action did the permission classifier block" question

`crmCan()` (`access.ts:70-80`) blocked thana (STAFF) from clicking `contact-convert-btn`'s submit in US2 (missing
`crm.contact.convert`) — this oracle did NOT retry that specific click as owner/manager to route around the block;
it used `withStaffPermissions()` to grant thana the missing key first (the ruling already confirmed this is
legitimate fixture SETUP, not a product-code workaround), then repeated the SAME click as the SAME actor (thana).

## C4.4-fix items I1/I2 — US5/US9 "QC infra gaps" reclassified as PRODUCT fixes by controller ruling (28 Sep)

Both traced to file:line on the running QC1 server; both have **no test-only override today** — controller ruled
these are product-code gaps (missing a dev/QC fallback that already exists elsewhere in the same codebase for an
analogous function), not infra to provision around, and not to be fixed by the oracle writer.

**I1 — `sendEmailRich` never falls back off Resend in dev/QC** (blocks US5-2..7):
`src/lib/core/email.ts:106` `sendEmailRich()` — the function `crm-email-send`'s real UI action calls — unconditionally
POSTs to `https://api.resend.com/emails` with `Authorization: Bearer ${env.RESEND_API_KEY}`. QC1 has no working
`RESEND_API_KEY`, so every real send gets HTTP 401 → `CrmEmailMessage.status=FAILED, providerError:"PROVIDER_401"`.
Contrast: the simpler `sendEmail()` (`email.ts:5`, used for OTP/transactional mail) already has exactly this
fallback — `if (!emailEnabled) { console.log(...); return; }` where `emailEnabled = env.RESEND_API_KEY.length > 0`
(`src/lib/env.ts:10,33`). Expected behaviour: `sendEmailRich` should have the same guard `sendEmail` has, so a QC/dev
process with no real Resend credentials logs-and-returns instead of hitting the real provider. Verified live on QC1
(direct query of the FAILED row), reproduced twice.

**I2 — `trackerOrigin()` hardcodes the production domain outside a real HTTPS deployment** (blocks US9-3/4, the two
page-view-count checks):
`src/lib/modules/crm/tracking.ts:100-101` `trackerOrigin()` → `publicAppOrigin(appUrl())` →
`src/lib/modules/crm/tracking-shared.ts:194-202` `publicAppOrigin()`, which returns the hardcoded
`APP_PUBLIC_ORIGIN = "https://shark.in.th"` (`tracking-shared.ts:41`) unless `APP_URL` is already a real `https://`
URL. QC1's `APP_URL` is `http://127.0.0.1:3215` (plain http, loopback) — so every `shark.js` tracker script this
journey's browser loads posts its page-view/consent events to `https://shark.in.th/t/e`, a different origin
entirely, never to QC1. Events never land in QC1's DB regardless of what the test browser does; this is a genuine
cross-environment data leak risk, not just a test blocker. Expected behaviour: outside a real production HTTPS
deployment, `trackerOrigin()`/`publicAppOrigin()` should resolve to the environment's own origin (or a configured
override), never silently default to the production public domain.

Neither fix applied — both routed to the controller/product backlog per the same "oracle writer does not touch
product code" rule as the US2/US3 items above.

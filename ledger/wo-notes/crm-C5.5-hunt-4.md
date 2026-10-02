# crm-C5.5 hunt 4 — closing hunt: interactions of fix6 · fix7 · G1 · fix9 · fix11 · fix10 · G2 · fix8 · G3 · fix12

Tree `/root/projects/shark-crm-c54d` branch `wip/crm-hunt4` @ 189d81f1 (= session/crm tip, every fix card merged; src/prisma untouched by
this hunt) · scope = `git diff 53d88b71 189d81f1 -- src prisma` (95 src files, **0 prisma files**) · QC3 only · probe
`scripts/pending/hunt4/probe-hunt4.mts` (own tenant `qc-h4-*`, CLEAN 0 rows, log `scripts/pending/hunt4/probe-hunt4.log`) · read-only on
product code · 2026-10-02, probe runs 09:19 / 09:21 UTC, typecheck 09:23 UTC (`date -u`).
Run: `bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/hunt4/probe-hunt4.mts`
(controls 11/11 green · finding checks 8/8 RED = reproduced; first run without P1.x gave 10/10 + 6/6, same E/C/K results).
`pnpm typecheck` (5 GB heap, iso.sh + gate lock) on the tree with the probe: exit 0.
Read first: hunt-1/-2a/-2b/-3, every fix*/G* note + review, `ledger/CRM-C6-REGISTER-DRAFT.md` (nothing below repeats a register item;
where a finding touches one, the difference is stated).

## Findings

### H4-1 · MED · fix9/fix11 PDPA erase × G3 per-writer memory (+ AI plans) · an erased person's phone and name survive in AiMemory and keep being fed to the model on every chat turn
- Where (189d81f1): `src/lib/modules/crm/privacy.ts:913-930` (the erase masks `AppNotification`, `AiMessage.content`,
  `AiConversation.title` with the identity tokens of the person — **no statement touches `AiMemory` or `AiPlan`**; `grep -rn
  'AiMemory\|aiMemory\.' src` outside `src/lib/ai/` = none) · `src/lib/ai/memory.ts:36-39` (contact-data guard only when the memory is
  **shared**; private notes may hold phones by design, G3 §1) · `src/lib/ai/memory.ts:91-95` + `src/lib/ai/service.ts:163` (every
  memory the viewer can see is injected into the system prompt of every `sendMessage`) · `src/lib/ai/conversation-owner.ts:129-137`
  (legacy shop facts without phone/e-mail/ID — e.g. a customer's full name — reach every member's prompt).
- Interaction: fix9/fix11 made the erase complete and loud for every table it knows; C3.9-fix H3 added AI conversations to it. G3 then
  turned `AiMemory` into the sanctioned per-person store for exactly the data the guard keeps out of shop facts ("private memories may
  contain contact data"), and the memory is not a passive log like `AiMessage` — it is re-sent to the model on every later turn. The
  erase was never extended to it. `AiPlan` (title / `stepsJson` summaries and payloads written by `propose_plan`) is the same erase site
  and was never covered either (pre-existing; included because the fix location is the same loop).
- Sequence (all real services): STAFF A asks the assistant to remember "ลูกค้า <ชื่อ นามสกุล> โทร 08…" → `remember_fact` stores a private
  `u~<A>~…` row (E0.1). A legacy shop memory names the same customer (E0.2: both in A's prompt). OWNER erases the contact
  (`privacy.eraseContact`, request erase) → contact anonymised (E1.0) and the AI conversation masked "[ข้อมูลถูกลบ]" (E1.1 — so the
  erase does reach AI rows) — **but E1.2: 1 memory row still holds the phone, 2 still hold the full name · E1.3: A's next turn still
  sends the phone to the model · E1.4: STAFF B's and the OWNER's prompts still carry the full name (legacy fact) · E1.5: the pending
  AiPlan still holds name + phone in `title` and `stepsJson`.**
- Impact: a PDPA erase reported as done (`erased:true`, audit row) leaves the person's phone/name in the shop's database and actively
  re-surfaces them: the assistant can quote the erased customer's phone to the member who noted it, and a legacy fact quotes the name to
  every member. Not visible in the erase counts, so the owner has no signal. Prod main: **no** (CRM v2 erase hidden on prod; G3 not on
  prod) — must be closed before G3 + CRM v2 ship together.
- Fix (small, same loop): in the `for (const tk of tokensT)` block add
  `UPDATE "AiMemory" SET "content" = replace("content", tk, mask), "updatedAt" = now() WHERE "tenantId" = t AND strpos("content", tk) > 0`
  and `UPDATE "AiPlan" SET "title" = replace(...), "stepsJson" = replace("stepsJson"::text, tk, mask)::jsonb WHERE … strpos(...)`
  (JSON-escape the token for the jsonb text, as the proposal-payload match already does with `payload::text`), count them in
  `counts.aiMessages` (or a new `aiMemories`). Optionally delete a memory whose content becomes only masks. The member module's own PDPA
  erase has no AI masking at all (see Not covered).
- Oracle step: block E of `probe-hunt4.mts` (expected GREEN after the fix: E1.2–E1.5; controls E0.x/E1.0/E1.1 unchanged).

### H4-2 · LOW · G2 room ownership × C3.4 CRM proposal door · a member's private chat-room `crm.*` proposal can be confirmed or cancelled by another member who has the proposal id
- Where: `src/lib/modules/crm/ai-bridges.ts:629-633` (`isCrmDoorKind` = **every** `crm.*` kind) · `:676-685` (`loadDoorRow`: key of the kind +
  visibility of ids in the payload; no conversation check) · `:745` `confirmProposal`, `:842` `cancelProposal`, `:858` `cancelProposalById` ·
  callers with a client-supplied id: `src/app/app/sys/[id]/crm/_actions/ai.ts:51-75` (`confirmAssistProposalAction`,
  `cancelAssistProposalAction`), `src/lib/ai/actions.ts:171-176` (web reject → door first for any `crm.*`),
  `src/app/api/mobile/proposals/reject/route.ts:20`. The generic doors were closed by G2: `src/lib/ai/proposals.ts:379-395`
  (`executeProposal` sends only `crm.*` **with** `requestedByUserId` to the door, `:383`; chat-created `crm.*` gets the room check,
  `:393`) and `rejectProposal` (`:350-354` — `crm.*` returns `false`, the web/mobile actions have already sent it to the door).
- Interaction: G2 made a proposal belong to its conversation ("only the room's viewers list, confirm or reject it"); chat-created CRM
  proposals (`crm.contacts.create`, `crm.deals.*` … from `runCrmTool` → `createProposal(conversationId = u~<A>~…)`) are still accepted
  by the C3.4 door, which predates room ownership and treats every `crm.*` row as a page-button proposal.
- Sequence (probe P): STAFF A's turn leaves `crm.contacts.create` PENDING in A's own room (P0.1). STAFF B (crm.contact.read/create):
  generic reject → `false`, generic confirm → "ไม่พบข้อเสนอนี้" (P0.2 control) — **but `cancelProposalById` → `{handled:true, ok:true}`,
  row REJECTED (P1.1) · `confirmProposal` (the CRM page action) → EXECUTED with B's rights, the answer quotes A's draft "…เรียบร้อยแล้ว —
  "<name>"" (P1.2).**
- Impact: needs the proposal id (a cuid shown only to A) — so no listing leak; the effect is interference (B cancels or executes A's
  draft) and the result note echoing A's draft. Before G2 every proposal was shop-wide, so this is the one door G2 did not align.
- Fix: in `loadDoorRow` (or in `confirmProposalById`/`cancelProposalById` and the two page actions) refuse with the door's NOT_FOUND
  text when `requestedByUserId` is absent and the row's `conversationId` is a `u~/k~/s~` room the caller cannot see
  (`canSeeConversationId(sightOfConfirmer(...))` — the same call `executeProposal` uses); keep pseudo-room ids (`crm:card:…`, `<prefix>:…`)
  on the current rule.
- Oracle step: P1.1 / P1.2 of `probe-hunt4.mts`.

### H4-3 · LOW · fix10 "hidden company ⇒ no name anywhere for that viewer" × e-mail merge field · `{{contact.companyName}}` renders the hidden company's name into the sender's own mail
- Where: `src/lib/modules/crm/emails.ts:1268-1275` (`contactMergeVars` → `"contact.companyName": contact.company` — the legacy text,
  unmasked) · used by `renderTemplate` (`:1287`) and the composer (`:1334`) · `src/lib/modules/crm/sequences.ts:1354` (same var for
  sequence mails and the `SEQ_TASK` title/body of a task created for the contact's owner) · the rule it bypasses: `contacts.ts:282-285`
  `companyTextIf` (fix10 sweep #5–#10, owner question 1 of fix10).
- Interaction: fix10 hid `CrmContact.company` from every viewer who cannot see the linked company (list, 360, export, briefs, inbox/thread
  header, sequences list; fix12 added kanban subtitle and writer echoes). The merge-variable path reads the same column for the sender
  and stores the rendered body in a row the sender reads back.
- Sequence (probe C): STAFF A without `crm.company.read` owns a contact linked to a hidden company; `companyTextsForViewer` gives A
  `null` (C0.1 control, OWNER gets the name). A answers the customer's mail (`sendEmail`, scheduled ⇒ no transport) with
  "…ฝ่ายจัดซื้อ {{contact.companyName}}" (C0.2 accepted) → **`getThread` as A shows `…ฝ่ายจัดซื้อ บริษัทลับ qc-h4-…` (C1.1).**
- Impact: one name per contact, to someone who already sees the contact and mails it; same "existence already distinguishable" class
  the fix10 note accepted for ids — but the text itself is exactly what fix10 set out to hide. Prod main: no (CRM v2 mail hidden).
- Fix: give `contactMergeVars` the sender's company visibility (`companyTextIf(contact, visible)` with one `visibleCompanyStates` read
  in `sendCore` when an actor is present; system sends — sequences — keep the raw text because the mail goes to the contact). Or decide
  explicitly that merge fields are exempt and say so in the fix10 rule.
- Oracle step: C1.1 of `probe-hunt4.mts`.

### H4-4 · LOW · G1 r2 F4 ("the manifest never advertises a tool the executor refuses") × C1.10 decision 8 (CRM reads need a human) · CRM-scoped API keys are offered CRM read tools that always answer 200 + "open the assistant from the app"
- Where: `src/app/api/v1/ai/skills/route.ts:32-45` and `skills/[id]/route.ts:38` filter with `toolVerdict` · `src/lib/ai/tool-access.ts:214-219`
  (API-key actor + module tool ⇒ `toolAllowedForApiKey` = scope check only) · `src/lib/ai/tools-crm.ts:43` (key ⇒ `userId: null`) ·
  `src/lib/modules/crm/api/tools.ts:56-59, 351-353` (`viewerOf` → null ⇒ `NO_HUMAN`, `:318` "…เปิดผู้ช่วยจากหน้าแอปแล้วถามอีกครั้ง") ·
  `src/app/api/v1/ai/tools/[name]/route.ts` returns the refusal inside a 200 body.
- Interaction: G1 r2 fixed F4 by making the manifest use the executor's gate (`toolVerdict`); the CRM runner has a second, later
  refusal for keys that `toolVerdict` does not know about. The G1 reviewer noted the refusal itself as "already true before"; what is
  new is the broken F4 contract and the advice text.
- Sequence (probe K): key with `["crm.contact.read"]` bound to the CRM system → `GET /api/v1/ai/skills` lists `crm` (toolCount 3) and
  `/skills/crm` lists `crm_search, crm_contact_360, crm_score_explain` (K0.1); the same tool works for an in-app OWNER (K0.2) —
  **`POST /api/v1/ai/tools/crm_search` → HTTP 200 `{"error":"ผู้ช่วยอ่านข้อมูล CRM ได้เฉพาะเมื่อรู้ว่าใครเป็นคนถาม — เปิดผู้ช่วยจากหน้าแอปแล้วถามอีกครั้ง"}` (K1.1).**
- Impact: no data exposure. External integrations are told the tool exists, get a success status, and an instruction (open the app,
  ask again) that an API client cannot follow and that retrying never fixes. The working path for keys is the CRM REST API.
- Fix: in `toolVerdict` refuse CRM **read** registry tools for `apiKey` actors (same reason text as the runner, phrased for an API
  client: "use /api/v1/crm"), so both manifests drop them and the route answers 403 like other refusals; CRM write tools (proposals)
  stay. Alternatively let the CRM runner read as the key (`assistantActor` from key scopes + key filters) — a design change, owner call.
- Oracle step: K1.1 of `probe-hunt4.mts`.

### INFO (not counted)
- **PDPA person export has no AI rows.** `exportContact` (`privacy.ts`, fix9) bundles every CRM table but nothing from `AiMessage` /
  `AiMemory` / `AiPlan` / `AiProposal`, while the erase masks `AiMessage` (and, after H4-1, memories/plans). Belongs to the open register
  question "PDPA export scope"; add "AI assistant data mentioning the person" to it.
- **Member-module PDPA erase does not mask AI rows at all** (only `crm/privacy.ts:925-928` touches `AiMessage`/`AiConversation`). Outside
  CRM; listed for the member lane.
- **Probe K1.2:** the other two advertised CRM tools, called with empty args, fail on input validation first (not the NO_HUMAN text);
  the manifest/executor mismatch is the same for them once valid args are given (same runner branch, code-read).

## Checked and found sound
- **Migrations / schema:** `git diff 53d88b71 189d81f1 --stat -- prisma` is empty — G2/G3 store the creator in the primary key, no
  migration, no backfill; legacy-row behaviour (OWNER-only rooms, shared legacy memories, legacy contact-data rows hidden) is the
  documented design in the register (G2 deploy effects, G3 Q1–Q6). No migration command run.
- **G1 actor × G2 rooms × G3 memory, fail-closed:** `actorProblem` (actor.ts:117-125) gates `sightOf` / `memorySightOf`; missing,
  foreign-tenant or forged system actors see nothing and cannot mint ids (`newConversationId`/`newMemoryId` throw). `canSeeMemory` /
  `canSeeConversationId` re-check every LIKE-prefiltered row; `likePrefix` escapes. Memory read window 400 ≥ the three capped sets
  (≤ 100 shop + 100 legacy-inclusive + 100 own / job). Scheduled job: least-privileged, sees shop facts + legacy-without-contact-data +
  its own `s~` rows, OWNER sees `s~` (G3 Q3).
- **Every generic proposal/plan door passes the confirmer's userId** (`executeProposal` ×3 callers, `executePlan` ×2:
  actions.ts:160/194, mobile confirm routes, member assistant-actions.ts:89) — the G2 check cannot silently degrade to "OWNER extras
  only".
- **CRM tool runner × G1 actor:** member actors pass role/unitAccess/permissions/userId explicitly; system actor has no CRM key; API keys
  get `userId:null` ⇒ refused (H4-4 is only about the manifest). `dispatchCrmKind` runs as the confirmer; fix12 `RATE_LIMITED` maps to
  the AI message (fix12 r2) and keys are exempt via `isApiActor`.
- **fix12 duplicate refusal × G1:** AI `crm_create_lead` (v2 ⇒ `contacts.create` proposal) → confirm → `createContact(viewerGate)`;
  hidden match ⇒ neutral `DUPLICATE` text through `mapError`; no hidden DTO in the confirmation note (fix12 sweep #10).
- **fix10 × AI surfaces:** `crm_search` / pipeline / stale tools go through the fixed service functions; `recent_leads` (G1
  `visibleCrmLeads`) selects name/source/phone/createdAt only (no company text) and masks phones.
- **fix9/fix11 erase × G2 rooms:** token masking is tenant-wide over `AiMessage`/`AiConversation.title` — covers `u~`, `k~`, `s~` and
  legacy rooms alike (E1.1); set-based writes (fix11) unchanged for these per-token statements.
- **fix8 inbound buckets × erase:** bucket keys hold `sha(From)` (no address), rows expire with the window; the owner notice text has
  no address (fix8 §7). Forged-mail `lastActivityAt` is a register item.
- **G3 support push × G2:** recipients derived from the room id, accepted memberships only; malformed ids fall back to OWNERs (G3 RV-5).
- **Lens 4 (OWNER happy path):** OWNER keeps every tool (`actorBranches` null, `memberActorOf` widens unitAccess to `*`, `isUnitScoped`
  false for OWNER even with `unitAccess []`); OWNER confirms own, legacy, key and scheduled proposals; the remaining OWNER-visible
  refusals (own shop phone as a shop fact, web without a room list, rate limit 120/10 min) are register items RV-11 / Q1 / fix12 Q3.
  Thai refusal texts introduced since hunt 3 name the missing right or the next step; the one "ask again" that cannot help is H4-4.
- **fix6/fix7 pickers × fix12 / fix10:** picker visibility, hidden-primary text and archived-clear refusals are byte-for-byte the
  reviewed rounds; their residuals (F6-6 deal default company, R2F-4 import duplicate company) are register items.

## Not covered
- Browser rendering of any changed screen (no :3215 — another lane owns it); the mobile app.
- Member-module PDPA erase and export (INFO above); account-side changes of fix8 beyond the key/webhook files.
- H4-1 for `AiProposal` rows of non-CRM kinds whose summary names the person (deliberately out of the erase since C3.9 S1) and for
  `SupportCase` subject/detail written by `support_open_case` (register RV-4 family) — code-read only.
- No `next build`; fitness/docs gates not run (no product change).

HUNT-4 RESULT: 0 BLOCKER / 0 HIGH / 1 MED / 3 LOW / 3 INFO

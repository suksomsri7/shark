# crm-C5.5-fix13 — closing-hunt findings H4-1 (MED) · H4-2 · H4-3 · H4-4 (LOW)

Tree `/root/projects/shark-crm-c54d` branch `wip/crm-cf18` from 839b348e (= session/crm 189d81f1 + hunt-4 note/probe) · QC3 (QC2 only for the
QC2-pinned fix10 probes and c5.3) · 2026-10-02 (`date -u`: RED run 09:36, GREEN run 09:45, regression unit started 09:46 UTC).
Probes `scripts/pending/cf18/probe-cf18.mts` (items 1–4) and `probe-cf18-outbox.mts` (items 5–6) (own tenants `qc-cf18-*`, CLEAN 0 rows) ·
logs `*.red.log` / `*.green.log` next to them · verify `run-verify.sh` / `run-verify2.sh` / `run-verify3.sh` (each run as a /tmp copy;
summaries `/tmp/cf18-logs/f13v{1,2,3}.summary`). RED runs: the src diff was saved, the touched src files checked out from 839b348e, the
probe run, the diff re-applied and verified by md5 of every file. No schema change, no migration, no docs regenerated.

## RED → GREEN (probe-cf18)
| run | controls | finding checks |
|---|---|---|
| on 839b348e source (`probe-cf18.red.log`) | 20/20 green | **17/17 RED** |
| on the fix (`probe-cf18.green.log`) | 20/20 green | **17/17 GREEN** |

RED detail (839b348e): E1.2 six memories still hold name/phone/e-mail · E1.3 nothing masked · E1.4 7 rows (no delete) · E1.6 A's prompt has
phone+name+e-mail, B and OWNER the name · E1.7 pending plan raw (title/summary/payload/array) and still PENDING · E1.8 DONE plan note/payload raw ·
E1.10 support case subject/body raw · P1.1 B cancels A's room proposal (`{handled:true, ok:true}`, REJECTED) · P1.2 B executes it · P1.3 OWNER
executes a proposal of A's `u~` room · P1.4 B cancels a key-room (`k~`) proposal · C1.1/C1.2 "บริษัทลับ …" in A's composer and template mails
(subject + body) · C1.3 in the thread A reads · K1.1 `skills` lists `crm:3`, `skills/crm` lists the 3 read tools · K1.2 HTTP 200 + "เปิดผู้ช่วย
จากหน้าแอปแล้วถามอีกครั้ง" · K1.3 read tools listed next to `crm_create_lead`.

## 1 · H4-1 MED — PDPA erase reaches AI memories, AI plans and support cases
`src/lib/modules/crm/privacy.ts` (same erase transaction, after the `AiMessage`/`AiConversation` statements; counts go into the existing
`counts.aiMessages` / `counts.notifications` — no new field, so the erase answer shape and the REST docs do not change):
- **AiMemory** — inside the existing `for (const tk of tokensT)` loop: `UPDATE "AiMemory" SET content = replace(content, tk, mask) WHERE tenantId
  AND strpos(content, tk) > 0` — one set-based statement per token (fix11 pattern), tenant-wide, so it reaches every owner kind: private `u~`
  of every member, shop facts `o~`, key/job rows `k~`/`s~`, legacy cuid rows. Same token set (`tokensT`) and mask as the AI messages.
  `updatedAt` is **not** bumped (the memory order is "last written/confirmed by its writer"; an erase is not a confirmation; bumping would push
  masked rows to the top of the 100-row prompt window).
- **Mask vs delete (decision):** per-token replace, like messages — "ลูกค้า [ข้อมูลถูกลบ] โทร [ข้อมูลถูกลบ] ชอบโปรวันศุกร์" stays. After the loop one
  statement deletes memories whose content, with the mask removed, has nothing left but whitespace/punctuation
  (`regexp_replace(replace(content, mask, ''), '[[:space:][:punct:]]', '', 'g') = ''`) — a row that was only the person carries no
  information and would be injected as "- [ข้อมูลถูกลบ] [ข้อมูลถูกลบ]". Re-erase deletes 0 rows (idempotent).
- **AiPlan** (title + `stepsJson`, every status, every room) — candidate rows read in pages (`pageSize(opts.batch, 1 000)`, keyset on id,
  `FOR UPDATE`) with one statement per page: `strpos(title, tk)` or `strpos(stepsJson::text, json-escaped tk)` over `unnest(tokens)`.
  Masking walks the JSON in JS (every string value, keys untouched) — never a text replace on jsonb, so the JSON can't break (a digit token
  inside a JSON number can't corrupt it). Written with `writeRows` (fix11). **PENDING plans that mention the person → `EXPIRED`** (their
  steps act on a person who no longer exists; same reason as QUEUED mails → FAILED and CRM proposals being deleted). Finished/failed/
  rejected/expired plans keep their status. JSON `null` steps (never written by `createPlan`) are written as `[]`.
- **Support cases** (`support_open_case` opens them from the chat — hunter's "Not covered"): new facade `src/lib/support/service.ts#
  maskSupportTextInTx(tx, tenantId, tokens, mask)` — `SupportCase.subject` + `SupportMessage.body`, one statement per token per table,
  every author side (shop, platform team, assistant), rows kept, `updatedAt` not bumped. Counted in `counts.notifications`.
- **AiProposal of CRM kinds**: already covered before this card — deleted when payload/summary holds a token or the payload holds the
  contact id (C3.9 S1). Non-CRM kinds that name the person are still deliberately out (C3.9 S1) — owner question 2.
- Prompt: after the erase no member's next system prompt carries the name/phone/e-mail (E1.6 for A, B, OWNER).

## 2 · H4-2 LOW — CRM proposal door respects G2 room ownership
`src/lib/modules/crm/ai-bridges.ts`: `hiddenChatProposal(row, actor)` — a door row **without** `requestedByUserId` whose `conversationId` is an
assistant chat-room id (`u~…`, `k~…`, `s~…` or a legacy cuid room — i.e. no ":") is refused unless
`canSeeConversationId(sightOfConfirmer({role}, userId), conversationId)` — the exact check `executeProposal` uses (portal CUSTOMER actors: always
hidden). Applied in `loadDoorRow` (⇒ `confirmProposal`, `cancelProposal`, page actions `confirmAssistProposalAction` /
`cancelAssistProposalAction`), and in `cancelProposalById` / `confirmProposalById` before they call the door.
- **Answer = non-existent id:** page door → `NOT_FOUND` with the door's "ไม่พบข้อเสนอนี้ในระบบ CRM ที่เปิดอยู่…" (identical object to a random id,
  P1.2/P1.3); web/mobile reject → `cancelProposalById` returns `{handled:false}` like an unknown id, so the caller falls through to the generic
  `rejectProposal` (→ false → same text as for any id it doesn't know) (P1.1/P1.4 compare the full object with a random id).
- **Rules kept (stated):** rows with `requestedByUserId` (page buttons: `crm.assist.tasks`, `crm.deals.nextStep.set`, …, room ids `<prefix>:<hex>`)
  and pseudo-room rows (`crm:card:<sys>` card scan, `crm:activity:<id>` call summary) keep the C3.4 door rule (key of the kind + visibility of
  every id in the payload) — P0.4. There is no automation origin for `AiProposal` rows (only chat tools, the key route, page buttons, card scan,
  call AI fill create them).
- **API-key origin (interpretation — please confirm):** a key's write tool leaves its `crm.*` proposal in a `k~` room. Before: `executeProposal`
  already limited such rows to the OWNER (G2), but the CRM door let any member with the CRM key cancel/confirm them. Now the door agrees with
  `executeProposal` and with the key route's contract ("the owner confirms in the app"): OWNER yes (P0.6), other staff "not found" (P1.4).
  If "API-key origins keep their current rules" in the brief meant the door's old rule, this is the one place it differs — owner question 3.
- Also by the same rule: the OWNER no longer confirms/cancels a proposal from **another member's** `u~` room through the CRM door (P1.3) — G2
  says nobody but the creator sees those rooms; before, the OWNER could execute it there but not through the generic door.

## 3 · H4-3 LOW — `{{contact.companyName}}` follows the sender's company visibility
`src/lib/modules/crm/emails.ts`: `contactMergeVars(contact, companyText?)` / `renderTemplate(…, companyText?)`. In `sendCore`, when a **person**
sends (actor present: `sendEmail`, `sendBulk`, REST, AI proposal confirmed by a person) and the contact is linked to a company and variables
will be rendered (template or composer text), the value is `contacts.companyTextsForViewer(ctx, actor, [contact])` — the fix10 rule
(`companyTextIf`: linked to a company the viewer can't see ⇒ `null`). **Hidden ⇒ empty string** — the value a contact without a company already
renders, i.e. exactly fix10's "the UI shows what it shows for no company" (not the mask placeholder: the mail goes to the customer, and a
placeholder in the customer's mail would tell more than nothing). Unlinked contacts keep their text (C0.4). OWNER/visible: byte-identical
(C0.2). **System sends keep the raw text**: `sendAsSystem` (sequence e-mail step and rule SEND_EMAIL; actor null) — C0.3 — and the sequence
engine's own `messageVars` (`sequences.ts:1354`, not touched).
- Other paths checked: there is no server-side preview/draft render of merge fields in CRM (only `sendCore`); the AI e-mail draft
  (`deal.draftEmail` → `dealFacts`/`contactFacts`) never reads `CrmContact.company` — company names come from `companies.briefForAssist`
  with the viewer (already visibility-aware); the contact DTO the composer UI shows carries the fix10-masked `companyText`.
- Left as is (owner question 4): the sequence `SEQ_TASK` step renders `{{contact.companyName}}` raw into the title/body of a task assigned to
  the contact's owner, who may not see the company (system path, the brief keeps sequences raw).

## 4 · H4-4 LOW — CRM read tools are not advertised to API keys
`src/lib/ai/tool-access.ts#toolVerdict`: for `apiKey` actors, a CRM registry tool that is a **read** tool (`crmApi.crmToolInfos()` `write:false`)
is refused with `DENY_KEY_CRM_READ`: "เครื่องมืออ่านข้อมูล CRM ของผู้ช่วยใช้ได้เฉพาะคนในร้านที่เปิดผู้ช่วยในแอป (ผู้ช่วยอ่านด้วยสิทธิ์ของคนที่ถาม) —
คีย์ API อ่านข้อมูล CRM ได้ทาง REST API ที่ /api/v1/crm ด้วยคีย์ใบเดียวกันนี้" (no blame, no "try again", names the path that works). Effects:
`GET /api/v1/ai/skills` drops the CRM skill for a read-only CRM key (`skills=[]`), `/skills/crm` → 404 for it and lists only write tools for a
key with write scopes (K0.1/K1.3), `POST /api/v1/ai/tools/crm_search` → **403** with that text (K1.2). CRM write tools for keys are unchanged
(proposal in a `k~` room, 200 `pendingConfirmation`, P0.5). People are unchanged (K0.2: staff B offered `crm_search`/`crm_contact_360`/
`crm_create_lead`; OWNER `crm_search` returns data). The runner still has its own `NO_HUMAN` refusal (second layer). Not done: letting the
runner read as the key — owner question 1.

## 5 · P-it5-2 MED (scope addition) — write paths that never woke the outbox drain
Mechanism reused, nothing new: `wakeOutbox()` from the CRM facade (`crm/outbox-wake.ts` → `core/after-drain.ts#scheduleCoalescedDrain`) —
called **after** the write returned (committed), runs the drain in `after()` once the response is sent (outside a request: immediately,
not awaited), coalesced per instance (one pending drain), and swallows every drain error — the user's request can't fail or slow down
because of it. Same rule the v2 server actions (`revalidateAndWake`), the portal actions (`/b/[slug]/actions.ts`) and REST
(`api/dispatch.ts`: non-GET and status < 400) already follow.
- **Named paths:** chat CRM panel `createLeadFromChatAction` / `logActivityFromChatAction` (`chat/crm-panel-actions.ts`, after the CRM write) ·
  `/u/[token]/one-click` and `/no-track` (inside the existing try, after `unsubscribe`/`stopTracking`; the page stays byte-identical for
  any token — X7 unchanged) · portal views: `crm/portal.ts#markViewed` wakes only when the `crm.portal.viewed` row was really added
  (first view per access per Thai day — `core/outbox.ts#emitOutboxMany` now returns the inserted count; every existing caller ignores it) ·
  `/app/settings/teams` actions (`run()` after `touch()`).
- **Sweep (grep of every route/server action that imports the CRM facade without a wake, then checked which ones really enqueue):**
  fixed with the same call — `lib/mobile/crm-routes.ts#runMobileCrm` (one choke point for `/api/mobile/crm/*`: non-GET that did not answer
  ≥ 400 ⇒ task complete, call log, card scan accept/reject) · `/t/o` open pixel and `/t/c` click (only when the hit was counted —
  `allowed`) · `crm/tracking.ts#collect` after `identify` (only the identify type, not every page hit) · Resend webhook (when
  `handled`) · AI confirm entry points `lib/ai/actions.ts#confirmProposalAction` / `confirmPlanAction` and `/api/mobile/proposals|plans/confirm`
  (a confirmed `crm.*` proposal from chat runs `dispatchCrmKind` without any wake) · inbound CRM mail `/api/email/inbound` (after `emails.ingestInbound` when `handled` — `crm.email.received`/`replied`; the kanban half of the route already used its own path)
  Checked, no wake needed: `/api/v1/crm/*` and `/api/v1/teams/*` (dispatch wakes) · `/t/consent`, `/t/v`, `/t/s`, `/l/[code]` (no outbox row) ·
  `/b/[slug]/auth/line` (audit only) · `crm/emails/actions.ts`, `crm/settings/tracking/actions.ts` (delegate to `*-actions.ts` impls that wake) ·
  reports export (no outbox row) · cron/consumer-driven emitters (sequences, reminders, scoring, payments, team-room posts — run inside a
  drain/cron). Not checked function-by-function: every export of the CRM `*-actions.ts` files (they all import `revalidateAndWake`; a
  write action there that forgot to call it would not show in this grep).
- Cost note: open/click pixels are the hottest public path; the wake is post-response and coalesced (≤ 1 pending drain per instance per
  15 s), and a drain over an empty queue is one indexed query.

## 6 · P-it5-3 LOW (scope addition) — `/u/[token]` done page viewport
The done pages are raw HTML strings in the route handlers (`one-click`, and the same page in `no-track`); the `/u/[token]` confirm page itself
is a Next page and already gets Next's default viewport. Added `<meta name="viewport" content="width=device-width, initial-scale=1">` to both
strings — the same width/initial-scale the app's standalone public layouts declare (`m/[slug]/layout.tsx`, `b/[slug]/layout.tsx`
`export const viewport`). Byte-identical for every token (X7).

## RED → GREEN (probe-cf18-outbox — items 5/6)
`scripts/pending/cf18/probe-cf18-outbox.mts` · own tenant, OUTBOX GUARD as in qc-crm-c5.3 (this process's drains see only the probe tenant) ·
server actions run in a request scope whose `after()` runs the task after the action returns · window 15 s (c5.3 L3-M1b) · control C0.1: a
row written without a wake stays PENDING for 6 s (no background drain).
| run | controls | findings |
|---|---|---|
| on 839b348e source (`probe-cf18-outbox.red.log`) | 3/3 | **7/7 RED** — every row stays PENDING: `team.updated` · `crm.contact.assigned`+`crm.contact.created` (chat lead) · `crm.activity.logged` (chat activity) · `crm.contact.updated` (no-track) · `crm.contact.updated` (one-click) · `crm.portal.viewed`; viewport absent on both pages |
| on the fix (`probe-cf18-outbox.green.log`) | 3/3 | **7/7 GREEN** — all of them DONE within the window; viewport present |

## Regression (QC3 unless marked · iso.sh + gate lock, one job at a time · `/tmp/cf18-logs/f13v1.summary`)
Round 1 — `/tmp/cf18-logs/f13v1.summary`, 09:46 → 10:24 UTC, tree = 839b348e + items 1–4:

| step | result |
|---|---|
| typecheck (5 GB heap) | exit 0 |
| docs-crm `--check` | exit 0 — `docs/api/CRM-API.md` matches (123 op) |
| docs-member / docs-kanban / docs-account `--check` | **exit 1 — environment, not code**: this worktree has no `.claude/` directory, so the generators read the skill file `.claude/skills/shark-*-api/references/endpoints.md` as 0 bytes. The `docs/api/*.md` half of each check matches (its ❌ line is not printed). I may not create anything under `.claude/`; re-run in the main tree. No registry/op file is touched by this card. |
| fitness without env / with QC3 env | 42/42 · 42/42 |
| probe-cf18 | controls 20/20 · findings 17/17 GREEN |
| probe-hunt4 (unedited) | controls **10/11** · finding checks RED **0/8** (all 8 "not reproduced") — exit 1 only because control **K0.1** ("the manifest lists the CRM skill and crm_search for this key") is now false *by design* (H4-4: `skills` no crm entry, `skills/crm` 404, tools `[]`). Reported, not edited. |
| probe-cf17-g3 · -review | 28/28 · 15/15 |
| probe-cf14-g2 · -review | 34/34 · 14/14 |
| probe-cf9-g1 · -g1-r2 · -review-r2 | 47/47 · 18/18 · 14/14 |
| probe-cf12 · -r2 · -review · -review-r2 (fix9) | 7/7+12/12 FIXED · 5/5+10/10 FIXED · 17/17 (T2/U1 NOT-REPRODUCED) · 10/10 |
| probe-cf15 (fix11) vs `eq-base` · -review | 7/7 incl. **Q1 end state byte-identical** + 5/5 FIXED · 5/5 |
| qc-crm-c3.9 (PDPA) · c3.5 (portal) · c3.4 (AI bridges) | 49/49 · 67/67 · 53/53 |
| qc-ai-automation | 4/4 |
| qc-crm-c2.5 · c2.6 (mail) | 105/105 · 87/87 |
| QC2 probe-cf13 (fix10 masking, loads the SW sweep) · -review | 24/24 · 8/8 |
| QC2 probe-cf13-sweep standalone | exit 0, no output — it is a module `probe-cf13` loads (same as the earlier gates) |
| QC2 qc-crm-c5.3 `--only=L1,L3` | 19/19 |

Round 2 — `/tmp/cf18-logs/f13v2.summary`, after items 5/6 (tree = round 1 + the wakes + viewport, before the inbound-mail wake):

| step | result |
|---|---|
| typecheck · docs-crm `--check` · fitness without env / QC3 | exit 0 · exit 0 · 42/42 · 42/42 |
| probe-cf18 · probe-cf18-outbox | 20/20 + 17/17 GREEN · 3/3 + 7/7 GREEN |
| probe-hunt4 (unedited) | same as round 1: controls 10/11 (K0.1 by design) · findings 0/8 reproduced |
| probe-cf9-g1 · probe-cf14-g2 · probe-cf15 (Q1 identical) | 47/47 · 34/34 · 7/7 + 5/5 FIXED |
| qc-crm-c3.9 · c3.5 · c3.4 · ai-automation | 49/49 · 67/67 · 53/53 · 4/4 |
| qc-crm-c3.7 (mobile CRM) | **23/30 — same 7 reds on 839b348e** (`/tmp/cf18-logs/base-c3.7.log`, identical): X1.3 seed count `got=33 want=40` (GET tasks vs raw SQL on the shared QC3 seed — GET path untouched by this card; same numbers on base) · S1.1/S1.2/S1.6/S2.2/S2.4/S2.6 screenshot/render freshness (`.qc-shots/crm/3.7/*` absent in this worktree, :3215 not used) |
| qc-crm-c2.5 · c2.6 | 105/105 · 87/87 |
| QC2 probe-c111-review (chat CRM panel) · QC3 qc-crm-c1.11 | 20/20 · 66/66 |
| QC2 qc-crm-c5.3 `--only=L1,L3` (incl. L3-M1b wake) | 19/19 |

Round 3 — `/tmp/cf18-logs/f13v3.summary` (final tree: round 2 + the inbound-mail wake), ended 11:04 UTC:

| step | result |
|---|---|
| typecheck · fitness without env / QC3 | exit 0 · 42/42 · 42/42 |
| qc-crm-c2.5 (incl. the inbound route) | 105/105 |
| probe-cf6-linear (inbound caps, route) | 27/27 |
| qc-kanban-k3.9 (inbound route, kanban half) | 12/13 — red K3.9-S4.2 = "≥ 1 screenshot in `.qc-shots/kanban/3.9`" (gitignored folder absent in this worktree; file count, independent of code) |
| probe-cf18-outbox | 3/3 + 7/7 GREEN |

## Owner questions
1. **H4-4:** should the CRM read tools run **as the API key** (assistant actor from the key's scopes + its owner/team filters, like the REST
   `/api/v1/crm` reads do) so external agents can use them through `/api/v1/ai/tools`? Today they are simply not offered to keys.
2. **H4-1 / C3.9 S1:** non-CRM `AiProposal` rows whose summary/payload name the person (e.g. a booking or member proposal drafted from chat) stay
   outside the CRM erase by the earlier decision. Mask `summary`/`resultNote`/payload strings of those too (same token loop), or keep?
3. **H4-2:** key-room (`k~`) `crm.*` proposals are now OWNER-only at the CRM door as well (aligned with `executeProposal` and the key route's
   "owner confirms" contract). Keep, or should staff with the CRM key still act on them at the CRM door?
4. **H4-3:** sequence `SEQ_TASK` title/body render `{{contact.companyName}}` raw for the contact's owner (who may not see the company). Mask by the
   task owner's visibility, or keep raw like the e-mail to the customer?
5. **Support cases:** the erase now masks the shop's support threads with the SHARK team (subject + every message, both sides). Confirm this is
   wanted for platform-side records (alternative: mask only cases the assistant opened, `conversationId` not null).
6. **Pending AI plans** naming the erased person become `EXPIRED` (cannot be confirmed). Confirm.
7. (carried from hunt-4 INFO) member-module PDPA erase masks no AI rows; PDPA person export has no AI rows — member lane / register.

## Prod notes
- No migration, no backfill, no schema change. Prod main: none of this is live (CRM v2 erase/mail and G2/G3 not on prod) — ship together with
  G3 + CRM v2.
- Erase cost added per erase: per identity token +3 set-based statements (`AiMemory`, `SupportCase`, `SupportMessage`) + 1 delete + 1 paged
  select per 1 000 matching plans + `writeRows` per page. `AiMemory`/`AiPlan`/`Support*` have no text index ⇒ each statement scans the tenant's
  rows of that table (AiMemory ≤ 100 shop + 100 per member + legacy; plans/cases grow with use) — same shape as the existing `AiMessage` scan.
- Existing data: rows written before this card are reached by a **re-erase** (the resweep path runs the same statements — but resweep tokens come
  only from the audit trail/forms of the already-anonymised contact, so persons erased before this card whose identity is no longer recoverable
  are not reachable by re-erase).
- Items 5/6: no data change; every new wake is post-response and coalesced (`core/after-drain.ts`, PROD-EXPOSED note there — watch function
  duration / DB connections after deploy, as for C5.4-D). `emitOutboxMany` now returns the inserted count (type `Promise<number>`; all
  other callers ignore it).
- REST/tool docs: generators `--check` green (see table) — no regeneration needed.

## Not verified (items 5/6 add)
- The wakes in a real deployment (`after()` + waitUntil on Vercel) — in-process only, through a request scope whose `after()` runs the task
  (same harness as qc-crm-c5.3 L3-M1b). The sweep wakes (mobile CRM, `/t/o`, `/t/c`, identify, Resend webhook, AI confirm, inbound mail)
  are typecheck + regression only — no RED→GREEN probe of their own (same one-line pattern as the probed paths).
- `/u` done page on a real phone (string checked only).

## Not verified
- UI (no screen changed; :3215 not used) and the mobile app.
- A plan that is `RUNNING` while the erase runs: the erase masks it, but `executePlan` writes its in-memory `stepsJson` back when it finishes
  (unconditional `update`) and can restore the pre-erase text (seconds-wide race; code-read only).
- Thai/Unicode punctuation in the "mask-only memory" delete uses Postgres `[[:punct:]]` (ASCII-class on this cluster's locale; a memory left as
  e.g. "[ข้อมูลถูกลบ] ๆ" is kept, not deleted) — code-read.
- Prod sizes/latency of the new statements; `AiTrainingSample`/`AiFeedback` (anonymised at write by design — not checked).

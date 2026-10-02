# crm-C5.5-fix13 — independent review (H4-1..H4-4 + P-it5-2 / P-it5-3)

Tree `/root/projects/shark-crm-c54d` branch `wip/crm-cf18` @ cd996b02 (builder commits 9cfc1f9b + cd996b02 on 839b348e) · reviewer did not
build it · QC3 (QC2 only for c5.3) · 2026-10-02 (`date -u`: review probe 11:15–11:17, regression unit 11:17–11:22 UTC).
Probe `scripts/pending/cf18/review/probe-cf18-review.mts` (own tenants `qc-cf18r-*` ×2, CLEAN 0 rows, log `scripts/pending/cf18/review/probe-cf18-review.log`) ·
runner `scripts/pending/cf18/review/run-review.sh` (run as a /tmp copy, summary `/tmp/cf18r-logs/r1.summary`). The probe never runs a drain
(after() tasks are counted, not executed) — no other tenant's outbox rows touched. No src / builder file edited.

## VERDICT: MERGEABLE (with RV13-1 as a follow-up that should land before G3 + CRM v2 ship; RV13-2/-3 controller decisions)

Every builder claim I could test holds: H4-1..H4-4 GREEN on the builder's probe and on mine, the hunt-4 probe is unedited and its only
red control (K0.1) is the designed consequence of H4-4, G2 consistency of the new door rule confirmed, tenant scoping of every new statement
confirmed against a second tenant holding the same tokens. Findings below are gaps next to the fix (one uncovered table of the same erase
loop, a pre-existing over-masking rule whose reach this card widens, and imprecise wake gating on public routes) — none makes the merged
tree worse than 839b348e.

## Findings

### RV13-1 · LOW · H4-1 scope — `AiScheduledTask.instruction` is not masked; the erased name/phone is re-fed to the model and re-written every day
- Evidence: R1.10 REPRODUCED — after the erase the task still reads `ทุกเช้าเตือนให้โทรหา <full name> ที่เบอร์ <phone>`.
- Why it matters (code-read, `src/lib/ai/scheduled.ts:92-112`): every day the runner calls `sendMessage(aiSystemActor, { text: task.instruction })`
  (new `AiMessage` rows in the `s~` room with the tokens — the table the erase just masked), writes `AppNotification.body = instruction + reply`
  (the other table the erase masks) and pushes `instruction.slice(0, 80)` to every device of the shop. Same class as H4-1 ("re-surfaces after an
  erase reported as done"), lower prevalence (≤ 10 tasks per shop, usually summaries; needs a task that names one customer — created only via the
  `ai_schedule_task` proposal the user confirms).
- Fix (same loop, one statement): `UPDATE "AiScheduledTask" SET "instruction" = replace("instruction", tk, mask) WHERE "tenantId" = t AND
  strpos("instruction", tk) > 0` in the `tokensT` loop (optionally `active = false` when the instruction becomes mask-only). Count in
  `counts.aiMessages`. Not a reason to hold this card; should be in before G3 + CRM v2 ship (same gate as H4-1).

### RV13-2 · LOW · pre-existing token rule, reach widened by this card — a generic e-mail local part masks ordinary words shop-wide, now also in the SHARK team's support replies, memories and plan strings
- Evidence: R1.9 REPRODUCED — contact e-mail `support@…` ⇒ token `support` (local part ≥ 6, `identityTokens` `privacy.ts:191-193`, C5.4-B H3(e)).
  After the erase: unrelated memory `ลูกค้าส่วนใหญ่ติดต่อทีม [ข้อมูลถูกลบ] ทางไลน์`, the SHARK platform reply `ทีม [ข้อมูลถูกลบ] ของ SHARK รับเรื่องแล้ว`,
  and (pre-existing path) an unrelated AI message `แจ้งทีม [ข้อมูลถูกลบ] ว่าระบบช้า`.
- Before this card the blast radius was AppNotification / AiMessage / AiConversation / team-room system posts; now it includes `AiMemory`
  (shop knowledge re-sent to the model — a shop fact can lose its meaning), `AiPlan` strings and **platform-authored** `SupportMessage` bodies.
  Role mailboxes (`contact@`, `support@`, `office@`, `booking@`, `service@`, `orders@`) are common for B2B contacts. Minimum token length is 4
  (full names need ≥ 2 words, local parts ≥ 6) — so "2-letter nickname" over-masking cannot happen; this role-word case can.
- Suggested fix (controller call; affects the pre-existing tables too): do not derive a bare local-part token from role/dictionary words (deny-list
  or "must contain a digit, dot, underscore or be ≥ 10 chars"), or use local-part tokens only for address-shaped matches. Not blocking.

### RV13-3 · LOW · P-it5-2 — public routes wake the drain for garbage tokens; the note's gating/bound claims are inaccurate
- Evidence: R5.1/R5.2/R5.3 REPRODUCED — one `after()` drain scheduled for a random token on `POST /u/<t>/no-track` (no rate limit by design),
  `POST /u/<t>/one-click` (wakes even when the rate gate said no: the wake is guarded by `clean`, not by a write) and `GET /t/o/<t>.gif`
  (`allowed` is the rate-gate verdict, not "the hit was counted" — `trackOpen` with an unknown token writes nothing). R5.4: `/t/c` garbage does not
  wake (url null ⇒ redirect first). R5.6: 10 unauthenticated garbage POSTs, each after the previous drain started → 10 drains scheduled.
- `core/after-drain.ts` coalesces only drains that are scheduled-but-not-started (the flag is cleared when the task starts); `PENDING_STALE_MS`
  (15 s) only expires a never-started flag. So the fix13 note's §5 "only when the hit was counted — `allowed`" (line 106) and "≤ 1 pending drain
  per instance per 15 s" (line 115) are not what the code does. Cost per extra drain over an empty queue is one indexed `findMany` (+ `waitUntil` time), so this is load/billing hygiene on the
  hottest public paths, not an outage risk.
- Fix: let `unsubscribe` / `stopTracking` return whether the flag flipped (they already know: `flipped`) and `trackOpen` return the counted row
  count (the CTE already selects `n`/`o`); wake only on a real write. Same for `/t/c` (`o` from the click CTE). Response bytes unchanged (X7).

### RV13-4 · INFO · residuals of H4-1 measured (not counted)
- R1.4: a token used as a JSON **key** in `stepsJson` survives (keys are not walked); the plan row is still selected. R1.5: a phone stored as a JSON
  **number** (`66…`) survives and the PENDING plan is still retired. Both need unusual payloads; mention in the erase rule.
- R1.7: `081-2345678` (3-7 split — a common Thai spelling) is not in `phoneVariants`; memory and AI message both keep it — consistent with the
  pre-existing masking, not introduced here. Candidate for the variant list.
- R1.13: `SupportMessage.attachmentsJson` names (`<full name>-บัตรประชาชน.jpg`) and the uploaded files are untouched. Owner question 5 should
  include attachments.
- RUNNING-plan race (builder's "Not verified"): confirmed by code-read — `executePlan` (`src/lib/ai/plans.ts` final `aiPlan.update`) writes its
  pre-erase in-memory `stepsJson` back unconditionally. Narrow (seconds), LOW if it ever matters; fix = re-apply masking or write only
  per-step status.

### RV13-5 · INFO · owner question 2 is an inconsistency, not only a scope question
- R1.11: a non-CRM PENDING proposal (`booking_create_appointment` naming the person + phone) stays PENDING and unmasked, while a plan whose step
  has the identical content is masked and EXPIRED by this card. Either rule both or exempt both; recommend the controller extend the plan rule
  (mask summary/payload strings, PENDING → EXPIRED) to non-CRM proposals that name the person — a confirmable card that recreates the erased
  person in another module is the stronger reason.

### RV13-6 · INFO · H4-3 residual — system sends render the hidden company into the thread the restricted member reads
- R3.2: `sendAsSystem` (sequence e-mail step / rule SEND_EMAIL — both reachable from the restricted member's own enrol or write) stores
  `ใบเสนอราคา บริษัทลับ …` and `getThread` as STAFF A returns it; A's own send renders empty (R3.1). This is the stated "system keeps raw" rule;
  add it to owner question 4 next to SEQ_TASK (alternative: render raw into the outgoing mail but mask the stored copy per viewer at read time).

### RV13-7 · INFO · door answer parity of `confirmProposalById`
- R2.3: for a hidden chat-room row it returns `{handled:true, ok:false, note:"ไม่พบข้อเสนอนี้ในระบบ CRM…"}`; for a ghost id `{handled:false}`
  (the caller then answers "ไม่พบข้อเสนอนี้ (อาจถูกลบไปแล้ว)"). Not reachable for chat rows: `executeProposal` only sends `requestedByUserId`
  rows and the three CRM-door kinds there, and those are exempt from the hidden check. Returning `{handled:false}` would make it exact parity.

## Builder claims — verification
1. **H4-1** — GREEN. Masking of `AiMemory` (all owner kinds), `AiPlan` (title + every string value, PENDING → EXPIRED, finished keep status),
   `SupportCase.subject` + `SupportMessage.body` in the same tx; `updatedAt` not bumped (R1.6); mask-only memory deleted (R1.8), a memory with
   other content kept; re-erase clean (builder E1.11). Attacks: JSON-escaped name with `"` in stepsJson found and masked (R1.3); paging with
   batch 2 over 8 matching plans reaches all (R1.2); **second tenant with the same tokens byte-identical** for every new table incl. the
   platform support tables (R1.1); phone variants identical to the existing message masking (`tokensT`, same min length 4, shared-phone filter);
   prompts of A/B/OWNER carry no token after the erase (builder E1.6, re-run green). Delete rule cannot remove a memory that keeps any non-punctuation
   character. Gaps: RV13-1, RV13-2, RV13-4. Statement count: +3 per token (`AiMemory`, `SupportCase`, `SupportMessage`) + 1 delete + 1 select and
   1 `writeRows` per 1 000 plans; same scan shape as the `AiMessage` statements; runs under the existing `TX_OPTS` 60 s and the TIMEOUT classifier
   (`privacy.ts:291-313`) — not measured at prod size.
   CRM-kind proposals deleted (pre-existing C3.9 S1) / non-CRM left: see RV13-5.
2. **H4-2** — GREEN. Every door with a client id: page actions (`loadDoorRow`), web + mobile reject (`cancelProposalById` → `{handled:false}` →
   generic `rejectProposal` → same answer as an unknown id), generic confirm (`executeProposal` G2 check), `confirmProposalById`; no REST op
   and no automation creates/acts on `AiProposal` (grep: creators are `ai/proposals.ts`, `crm/ai-bridges.ts` claim, `crm/calls.ts` ×2). Chat
   payloads cannot carry `requestedByUserId` (zod strip in `validateOpInput`; `systemId` overwritten last) so the exemption cannot be forged.
   **OWNER refused on another member's u~ proposal is G2's rule** ("invisible to everybody, including another OWNER", G2 note §rules; R2.1:
   the generic door gives the OWNER the same "not found") — not a regression. k~ OWNER-only = G2 Q3. Legacy cuid rooms OWNER-only (R2.2).
   Page-button and pseudo-room rows keep the old rule (builder P0.4). Parity nit RV13-7.
3. **H4-3** — GREEN for person sends (composer, template, bulk via `sendCore(actor)`, REST, AI-confirmed). AI draft does not read
   `CrmContact.company`; deal unfurl uses the viewer-aware brief. Residual RV13-6 + builder's SEQ_TASK question.
4. **H4-4** — GREEN. `crm_search` / `crm_contact_360` / `crm_score_explain` → 403, body `{error}` only (R4.1); a key without the CRM scope is
   stopped earlier by the route's scope check with the generic text (R4.2), so the CRM-REST hint is never shown to a key that could not use it.
   People unchanged (builder K0.2). Other skills: member tools run as the key (`assistantActor` from key scopes, `member/api/tools.ts:70`),
   kanban tools run with `viewer: null` (`tools-kanban.ts:43`) — no other always-refused-for-keys pattern found (code-read; grep for
   `NO_HUMAN`-style refusals finds only CRM; account tools not read function-by-function).
5. **P-it5-2** — wakes are all after the write returned, never inside a transaction (each call site read), `after()`-scheduled, errors
   swallowed (`outbox-wake.ts`). `emitOutboxMany` → `Promise<number>`: every other caller (`sequences`, `portal` tx, `member/journeys`,
   `account/{cheque,events,service}`, `voucher/service`) `await`s and ignores it; typecheck green. Portal view wakes only when `count > 0`
   (idempotencyKey per access per Thai day + `skipDuplicates`) — correct. Builder's own probe green (7/7). Gating precision: RV13-3.
6. **P-it5-3** — viewport meta present on both done pages (R5.5; builder V).
7. **Oracle integrity** — `git diff 839b348e cd996b02 -- scripts/pending/hunt4` empty; `git diff --stat 839b348e cd996b02 -- scripts
   ':!scripts/pending/cf18'` empty; no prisma/docs/.claude change. probe-hunt4 K0.1 ("manifest lists the CRM skill and crm_search for this key")
   is exactly what H4-4 removes — expected flip; all 8 finding checks not reproduced.

## Owner questions (builder's 1–7) — reviewer opinion
| # | question | who can rule |
|---|---|---|
| 1 | CRM read tools run as the API key | **owner** (product/design change; current "not offered" is the safe default) |
| 2 | non-CRM proposals naming the person | **controller** — make it consistent with the plan rule (RV13-5); C3.9 S1 was a controller ruling |
| 3 | k~ proposals OWNER-only at the CRM door | **controller** — consequence of G2 Q3 already put to the owner; ride on that answer |
| 4 | SEQ_TASK `{{contact.companyName}}` raw (+ RV13-6) | **controller** for SEQ_TASK (internal task ⇒ mask by assignee's visibility, fix10 rule); **owner** for the stored copy of system mails |
| 5 | erase masks the SHARK team's support threads (+ attachments, RV13-4) | **owner/legal** (platform-side records; processor vs controller role) |
| 6 | pending plans → EXPIRED | **controller** (same precedent as QUEUED mails → FAILED); agree |
| 7 | member-module erase / PDPA export without AI rows | **controller** routes to member lane + register "PDPA export scope" |

## What I ran (QC3 unless marked · iso.sh + gate lock, one at a time)
| step | result |
|---|---|
| probe-cf18-review (mine) | controls 16/16 green · findings reproduced 5/5 (R1.9, R1.10, R5.1, R5.2, R5.3) · CLEAN 0 rows |
| probe-cf18 (builder) | controls 20/20 · findings 17/17 GREEN · CLEAN |
| probe-cf18-outbox (builder) | controls 3/3 · findings 7/7 GREEN · CLEAN |
| probe-hunt4 (unedited) | controls 10/11 — only K0.1 false (designed effect of H4-4) · finding checks 0/8 reproduced · exit 1 for K0.1 only |
| qc-crm-c3.9 (PDPA) | 49/49 |
| QC2 qc-crm-c5.3 `--only=L1,L3` | 19/19 |
| typecheck (`tsc --noEmit`, 5 GB heap) | exit 0 |
| fitness without env / with QC3 env | 42/42 · 42/42 |
| tracked diff after the runs | only the pre-existing `scripts/crm-expected.json` / `scripts/member-expected.json` (not committed) |

## Not verified
- Prod-size latency of the new erase statements; the RUNNING-plan race end to end (code-read only); a real scheduled-task run after an erase
  (the runner selects tasks of every tenant on QC3 — not run; code-read of `scheduled.ts`).
- Wakes on Vercel (`after()` + waitUntil); load impact of RV13-3 (counted in-process only).
- UI, mobile app, :3215 (not used); docs generators (`--check` not re-run — no registry/op change in the diff).

## Round 2 re-check — builder tip ff65c37a (+ ledger-only 466db08c) · 2026-10-02 (`date -u`: r2 probe 12:02–12:03, regression 12:04–12:13 UTC)

`git diff 1377bb9a ff65c37a -- src` read in full (11 files). New probe `scripts/pending/cf18/review/probe-cf18-review-r2.mts` (own tenants
`qc-cf18r2-*` ×2, CLEAN 0 rows, log `probe-cf18-review-r2.log`; after() tasks counted, never run) · runner `run-review-r2.sh` (/tmp copy,
summary `/tmp/cf18r-logs/rr2.summary`). Round-1 probe `probe-cf18-review.mts` re-run **unedited**.

### VERDICT round 2: MERGEABLE — 0 BLOCKER / 0 HIGH / 0 MED / 0 LOW · 3 INFO (RV13-8..10)
RV13-1, -2, -3, -5, -7 closed; RV13-4 partly closed (3-7/2-7 phone spellings, JSON keys; JSON-number phones + support attachments remain,
listed by the builder as residual/owner Q5); RV13-6 left as owner question. Round-1 probe: **findings reproduced 0/5** (R1.9, R1.10, R5.1–R5.3
NOT-REPRODUCED), info lines now R1.4 key masked · R1.7 `081-2345678` masked · R1.11 non-CRM proposal EXPIRED + masked · R5.6 0 drains.

### Attack list — results
1. **`identityTokens` role rule (affects every masked table).** `isRoleMailboxLocal` lower-cases, removes **all** digits and `. _ + -`, then
   requires the **whole remainder** to equal a deny-list word — containment is not enough. Through real erases (A1/A2): `sales.somchai` →
   "salessomchai", `somchai.sales`, `hr-anan` → "hranan", `ann.hr` → "annhr" are still tokens and masked; `info2024` → "info", `Support_01` →
   "support" are no longer standalone tokens (full addresses always remain tokens). Under-masking only when a person's whole handle is a role
   word plus digits (e.g. `jobs1990`) — not personal data in practice. No finding. fix11 end state still byte-identical to `eq-base`
   (probe-cf15 Q1) and probe-cf12 all FIXED.
2. **Scheduled-task delete / proposal expiry scope (B1, C1).** Mask-only task deleted; a task with other text kept and masked; an unrelated task
   that already held a literal mask kept byte-identical; the second tenant's task and PENDING proposal with the same tokens untouched (status +
   text). Both new statements/pages are `tenantId`-scoped; proposals `kind NOT LIKE 'crm%'` (CRM kinds still deleted earlier).
3. **executePlan guard.** Normal path: note + status written (D1; key order irrelevant — Prisma Json `equals` is a jsonb comparison).
   Concurrent confirmers: unchanged atomic PENDING→RUNNING claim. **RV13-8 INFO:** a payload integer > 2^53 (JSON round trip changes it) makes
   the guard see "changed" with no erase ⇒ status-only write, the step's note is dropped (D2: `note=null`); the number itself was already
   rounded by every write-back before this card. Improbable payload; no action needed (or compare with `stepsJson::text` snapshot read raw).
4. **JSON-key ` #2` renaming.** C2: a finished (EXECUTED) proposal keeps status, every value survives the collision (`[mask]`, `[mask] #2`,
   `[mask] #3`). No code reads the payload of a non-PENDING proposal/plan again (grep `EXECUTED` readers: only the CRM door's own write);
   PENDING rows are EXPIRED before anyone could execute the renamed payload; a RUNNING plan uses its in-memory copy. **RV13-9 INFO:** the
   same race the builder lists for plans exists for single proposals — `executeProposal` claims PENDING→EXECUTED before running, so a claim that
   wins just before the erase runs with the pre-erase payload and may write a `resultNote` built from it afterwards (seconds-wide; same class).
5. **Routes (E0/E1).** Valid first request: one wake; garbage: none; repeat: none. Status, every header and the body are byte-identical for a
   valid flipping request and a garbage token on `/u/…/no-track` and `/u/…/one-click` — no new token oracle (timing difference of the flip path
   is pre-existing). `/t/o` / `/t/c` keep their constant responses; wake now on `events > 0` (builder S3.1–S3.3 green).
6. **SEQ_TASK chain (F1/F2 + builder S7).** Contact owner who left the shop (no membership) ⇒ title without company text; unassigned contact ⇒
   shop OWNER ⇒ name shown; assignee without company sight ⇒ "" (S7.1). **RV13-10 INFO:** the title is rendered once for the assignee at
   creation — a later reassignment to someone who cannot see the company keeps the text (same class as every stored render).
7. **Oracle integrity.** `git diff 1377bb9a ff65c37a -- scripts/pending/cf18/review scripts/pending/hunt4` empty; `git diff --stat 1377bb9a
   466db08c -- scripts ':!scripts/pending/cf18'` empty; no prisma / docs / .claude change.

### Round 2 runs (QC3 unless marked · iso.sh + gate lock, one at a time)
| step | result |
|---|---|
| probe-cf18-review-r2 (new) | controls 11/11 green (A1 A2 B1 C1 C2 D1 E0 E1 F1 F2 CLEAN) · info D2 |
| probe-cf18-review (round 1, unedited) | controls 16/16 · findings reproduced **0/5** |
| probe-cf18-r2 (builder) | controls 8/8 · findings 12/12 GREEN |
| probe-cf18 · probe-cf18-outbox (builder) | 20/20 + 17/17 GREEN · 3/3 + 7/7 GREEN |
| probe-cf15 vs `eq-base` (fix11) | controls 7/7 incl. **Q1 end state byte-identical** · 5/5 FIXED |
| probe-cf12 (fix9) | controls 7/7 · 12/12 FIXED |
| qc-crm-c3.9 | 49/49 |
| QC2 qc-crm-c5.3 `--only=L1,L3` | 19/19 |
| typecheck · fitness without env / QC3 | exit 0 · 42/42 · 42/42 |
| tracked diff after the runs | only the pre-existing `scripts/{crm,member}-expected.json` (not committed) |

### Not verified (round 2)
- RV13-9 race end to end (code-read); SEQ_TASK through the real cron (in-process `runDue` with `tenantIds`); prod-size cost of the non-CRM
  proposal scan (`payload::text` per row of the tenant, keyset pages of 1 000, inside the 60 s erase transaction); Thai-locale `[[:punct:]]`.
- probe-hunt4, c3.5, c2.5/2.6, ai-automation, QC2 c2.2 / probe-cf13 not re-run by me this round (builder's round-2 table reports them green).

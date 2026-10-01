# crm-C5.5 hunt 3 — closing hunt: fix-card interactions · migration set · lens "fixed `take` caps on privacy/security sets"

Tree `/root/projects/shark-crm-c54d` @ 53d88b71 (detached; fix6 = wip/crm-cf7 excluded) · prod main = 929c39ce (NOT an ancestor of
53d88b71 — the push needs a merge) · QC3 only · probe `scripts/pending/hunt3/probe-hunt3.mts` (own tenant `qc-h3-*`, CLEAN 0 rows,
log `scripts/pending/hunt3/probe-hunt3.log`) · read-only on product code · 2026-10-01 21:56–22:20 UTC.
Run: `bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/hunt3/probe-hunt3.mts`
(controls 6/6 green · finding checks 4/4 RED = reproduced).
Read first: hunt-1/-2a/-2b, every fix*/authz-sweep note + review, `/root/projects/shark-crm/ledger/CRM-C6-REGISTER-DRAFT.md` (nothing below
repeats a register item).

## Findings

### H3-1 · MED · fix2 × fix2-RV2-3 ruling (ordering) · forged mail in a customer's name silently drops that customer's genuine (thread-proven or DMARC-proven) mail for the rest of the hour
- Where (53d88b71): `src/lib/modules/crm/emails.ts:2408` (`inboundSenderLimited` called before any proof is known) · `:2315-2322`
  (bucket `crm.email.in.from.<system>.<sha(From)>`, 100/h, counts EVERY mail) · `:2441` / `:2462` (fromProof / threadProof computed only
  later) · `:2464` (only the SYSTEM bucket exempts proven mail) · `:2338-2339` (owner notice text promises "ลูกค้าที่ตอบเธรดเดิมหรือ
  ยืนยันผู้ส่งได้ยังเข้ามาตามปกติ") · `crm-C5.5-fix2.md:90` (RV2-3: "sender bucket stays first (all mail)").
- Interaction: RV2-3 moved the system bucket behind the proofs so a flood cannot lock genuine customers out, but left the per-sender
  bucket in front and keyed on the unauthenticated From. The From of a known customer is exactly what an attacker forges (2a-2), so the
  bucket becomes a per-customer kill switch. The same holds for a staff address (staff BCC copies, sentById needs proof that is never
  reached).
- Sequence: attacker knows `crm+<key>@shark.in.th` (it is the Reply-To of every CRM mail) and a customer address. 99 forged mails
  `From: buyer@bigclient` (e.g. one "please pay to the new account" + 98 fillers) are stored (flagged unverified, each fires a "customer
  replied" notice). The customer's real reply "do not pay, that was not us" — citing our Message-ID, or DMARC-passing once P14 is set —
  is answered 200 `{handled:false, reason:"rate_limited"}` and discarded: no row, no bounce (provider got 200), no owner notification
  (the sender bucket only writes one audit line). Repeatable every hour for 100 mails/h.
- Evidence (EXECUTED, `probe-hunt3` S1): S1.0 control reply stored · S1.1 99 forged stored · **S1.2 thread-proven reply → rate_limited** ·
  **S1.3 A-R-proven mail (P14 set in-process) → rate_limited** · S1.4 control: another customer's reply stored (system bucket not
  involved) · S1.5 one audit `{bucket:"sender"}`, 0 owner notices · **S1.6 genuine replies stored = 1 of 2**.
- Fix: count/check the sender bucket only for mail with neither `fromProof` nor `threadProof` (same condition as the system bucket, i.e.
  move line 2408 to after line 2462 and gate it like line 2464), or key it on (From, proven?) with a separate high cap for proven mail;
  notify the owner on the first sender-bucket trip too; correct the notice text. Cost: flood mail then pays the staff/override/
  verified-domain/parent lookups (≈5 indexed reads, fix2 R2b-6) before being dropped — acceptable, still before sanitising.
- Oracle step: the S1 block of `probe-hunt3.mts` (expected GREEN after the fix: S1.2/S1.3/S1.6 pass, S1.4/S1.5 controls unchanged
  except S1.5 if a notice is added).
- Prod main: **no** (fix2 is session/crm only; CRM v2 inbound is hidden on prod).

### H3-2 · LOW · lens · PDPA person export (data-subject access) silently truncates tables at fixed `take` with no ordering and no marker
- Where: `src/lib/modules/crm/privacy.ts:1057` (CrmWebSession 5 000) · `:1062` (CrmActivity 5 000) · `:1064` (CrmEmailMessage 5 000) ·
  `:1066` (CrmWebEvent 20 000) · `:1067` (CrmTrackedClick 5 000) · `:1070` (CrmScoreLog 5 000) · `:1083/1087` (file links); none has
  `orderBy`, so the subset is arbitrary; the audit line at `:1128` records the truncated counts as if complete.
- Plausible volumes: score-log rows are written per scoring event (chat message received, e-mail opened/clicked/received, web identified,
  form submission) — a long-standing LINE/e-mail customer passes 5 000; a tracked visitor passes 20 000 web events.
- Evidence (EXECUTED, `probe-hunt3` X1): contact with 5 100 CrmScoreLog rows ⇒ `exportContact` as OWNER returns **5 000**, no
  truncation marker (X1.0 control: 5 100 in DB).
- Fix: page through each table (cursor on id, as the erase path does for `automationRun` at `:798-808`) or, if a cap must stay, order
  newest-first and add `truncated: { table: n }` to the bundle and the audit.
- Prod main: same code (`take: 5_000` ×7 in main's privacy.ts) but CRM v2 only ⇒ not reachable today.

### H3-3 · INFO · lens · PDPA erase redaction stops at fixed caps without paging
- `src/lib/modules/kanban/links.ts:471/481/525` (`MASK_CARDS_MAX = 2_000` for cards linked to the erased contact) ·
  `src/lib/modules/crm/portal.ts:1452` (portal requests `take: 5_000` → cards beyond are not redacted, then the request rows are deleted so
  the link is lost) · `:1456` (accesses `take: 1_000`; sessions are also deleted by `crmContactId`, so harmless).
- Counts needed (> 2 000 linked cards / > 5 000 portal requests for one person) are unrealistic today; recorded so the C6 handover knows
  the erase is "complete up to N". Fix if wanted: loop until a page comes back short (the `ruleRuns` loop already does this). Code-read.
- Prod main: same kanban cap (v1-reachable only through CRM v2 erase ⇒ not today).

### INFO (not counted)
- **Forged mail keeps a contact "active".** `recordSystemActivityInTx` → `touchLastActivity` (`activities.ts:1375`, `:462-470`) moves
  `CrmContact/CrmCompany.lastActivityAt` for unverified inbound mail too (fix2 anonymised only the outbox event). Affects "last activity"
  sorting/staleness of contact/company, not deal STALE. Same family as register fix3b R2-1.
- **threadProof uses the newest referenced row** (`emails.ts:2456-2462`): a genuine customer reply that also references the customer's
  own earlier IN mail (newer than our OUT) gets no thread proof ⇒ counted by the system bucket and no reply effects. Reply-effect part is
  pre-fix2 behaviour; only the bucket exemption is new. Fix: `threadProof` = any candidate OUT row whose To/Cc holds From.
- Two different `bareEmail` semantics remain by design: CRM/core = LAST angle pair (`core/inbound-address.ts:83`), board mail = FIRST
  angle pair (`platform/kanban-email-in.ts:86-88`, fix5 kept the old regex semantics byte-for-byte). A display name `"<staff@shop>"
  <x@evil>` is read as staff by the board path (assignee + no "จาก:" line). Pre-existing on prod; board From is unauthenticated anyway.
- `renderInboundHtml` (`emails-shared.ts:252`) re-sanitises stored inbound HTML with default schemes ⇒ `mailto:`/`tel:` links stored by
  ingest are unwrapped at display time. Cosmetic, pre-existing.

## A — interactions between the fix cards (what was walked)

Files touched by ≥ 2 cards (per-card `git diff c^ c`): emails.ts (fix2·fix4·fix3b·fix5), webhooks/service.ts (fix1·fix3a·fix3b),
emails-shared.ts (fix2·fix3b·fix5), account/connections-actions.ts (fix1·fix3a·authz), fitness.mts (fix2·fix4·fix5), webhooks/actions.ts,
webhook-guards.ts, kanban-email-in.ts, kanban/cards.ts, crm service/portal/contacts/companies/automation/api ops emails+activities/
ai-bridges/activities, account/service.ts, 5 UI files.

`ingestInbound` final order (`emails.ts:2365-2686`), top to bottom:
1. `capInboundEnvelope({...payload, headers: lowerHeaders(headers)})` — headers merged case-insensitively THEN capped (>16 KiB dropped
   whole); From/Message-ID/To/Cc entries > 998 dropped; subject cut at 16 KiB. HTML/text not touched here.
2. rfcId + CRM recipient parse (linear `bareEmail`) → `X-SHARK-Loop` drop → system by key → uiVersion 2 / inboundEnabled → duplicate
   by scoped Message-ID (before any bucket: duplicates are not counted).
3. **Per-sender bucket** (all mail, unproven or not) ← H3-1.
4. staff lookup (`ciEquals`) → override (`ciEquals`, verified-domain gate) → `fromProof = authResultPass(capped A-R)` (every From) →
   `fromOnShopDomain` → `unverifiedShopFrom` → direction → `bcc_capture_off` return.
5. parent by refs (`angleIds`, system-scoped) → `threadProof` → **system bucket** only for `!fromProof && !threadProof`.
6. HTML `.slice(0, 1e6)` → `sanitizeHtml` (fix4 linear allowlist) · text `.slice(0, 1e6)` or `htmlToText(capped html)`.
7. attribution: OUT → contact by To · IN → From, Reply-To only for shop-domain non-staff From, domain → company, stranger lead (gated by
   `auto`, staffClaim, unverifiedShopFrom, `mimicsStaff`) → `unverifiedFrom = IN && !fromProof && (contact||companyId)`.
8. tx: row (+routing flags) · EMAIL activity · `crm.email.received` (anonymous when unverifiedFrom) → attachments (flags preserved when
   routing is rewritten) → reply effects (`fromProof || threadProof`) → "customer replied" notice (`!auto`, not gated by proof — fix2
   decision) → copy-in (SHARK targets, own copy mailbox, prefix anywhere, `auto` all refused; Auto-Submitted + loop header added).
So: every parser sees capped headers; sanitising sees capped HTML and runs only after both buckets; attribution never reads HTML. The
only ordering defect is step 3 (H3-1).

Checked and found sound (interactions):
- fix5 parser rewrites vs fix2/fix3b rules: `bareEmail`/`trailingAngleAddr`, `displayNameOf`, `angleIds`, `authResultPass` pair regex
  (lookbehind), `hasRemoteImages`, `stripTags`, `replaceEmailsInText` — read against the old regexes; equal results on the cases that
  feed `staffClaim`, `threadProof`, `unverifiedFrom`, `mimicsStaff`; From > 998 ⇒ empty From ⇒ no identity/no lead/no proof (fail-safe).
- fix4 sanitizer swap vs email rendering: stored inbound HTML re-sanitises idempotently; `<img src="…">` output keeps the double-quote
  form that fix5's `hasRemoteImages` looks for; `htmlToText`'s `/<[^>]*>/` runs only on sanitiser output (every `<` closed) ⇒ linear;
  copy-in mail carries `storedHtml` (sanitised). fix4's kanban read-time re-sanitise + fix5's linear `descriptionToText` compose.
- fix1 choke point × fix3a fail-closed × fix3b per-family guard + event names × authz S2: all 13 src writers of `WebhookEndpoint` go
  through `createEndpoint/setEndpointActive/setEndpointEvents` with an author (grep: no direct `webhookEndpoint.create/update` outside
  the service; only the deprecated author-less overload for old scripts); order trim → family-missing check → guards → known-name check;
  guard is null-author fail-closed for v2 tenants (`crm/api/key-guard.ts:148-164`); account page create/test limited to `account.*`.
  Remaining doors (REST account `webhooks.test`, delete/disable without guard, stored endpoints) are register F5/D11/New-5.
- ciEquals call sites (14 in src, fix2+fix4): all equality-on-value sites; no double escape; F15 OWED list empty and ratcheted.
- fix1 `nothingWritten`: the three CRM codes it flags (CONFIRM_REQUIRED, CRM_V2_DISABLED, STAGE_REQUIREMENTS) are thrown before writes at
  every site found (`grep`), the one catch that swallows STAGE_REQUIREMENTS after earlier writes (`deals.ts:2389`) is a bridge, not a
  REST handler; portal write/slip buckets run before writes (`portal.ts:656-738`); no later card changed a REST handler's write order
  (fix5 only widened a zod cap → 422 is deterministic and replays correctly).
- fix3a/fix3b Thai-day work in `ai-bridges.ts`: `dayKey(expectedCloseAt)` vs `thaiToday()`/`thaiDayKey()` produce the same
  `YYYY-MM-DD` form; field-due window uses Thai-day starts for both DATE and DATETIME.
- fix2 × fix5 `setUserSetting`: fix5's signature rewrite kept fix2's `outsideShark` checks for Reply-To/copy and the `ciEquals`
  contact check.
- authz-sweep v1 `activityTargetsInSystem`: `tenantDb` scopes CrmContact/CrmDeal by tenant AND system (`core/scope.ts:60`).
- fix4 mobile guard × authz sweep: every AI/DNA mobile route either calls `mobileDenied` or delegates per-kind checks
  (`proposals/confirm`, `plans/confirm` = same as web); rejects are register D2.
- Merge artefacts: no duplicated helper bodies, no dead imports in emails.ts (`checkRateLimitDbMany` still used at `:2980`), comments
  match the code except the owner-notice text (H3-1).

## B — migrations as a set (53d88b71 vs prod main 929c39ce)
Branch-only folders: `20261103000000_crm_perf_indexes`, `20261104000001_account_journal_no_sequence`, `…000002_…alloc_lock`,
`…000003_…alloc_lock_v2`; main has no folder the branch lacks. Other lanes: only `session/pos` adds `20261120000000/…01` (PosProduct
etc. — no shared table/function with ours; later-named than ours ⇒ the "earlier-named pending folder" case already in the register).
- perf_indexes: `CREATE INDEX IF NOT EXISTS` on tables/columns created by main's `crm_v2_a` (previousEmails, CustomRecord); names equal
  Prisma's default names for the 3 `@@index` lines added to `crm.prisma` ⇒ no drift; expression index invisible to Prisma (documented).
- 000002 then 000003: both `CREATE OR REPLACE` of the same signature with the same pinned `search_path`; forward-only (000002 stays
  applied), no table/row touched; 000003 locks before deciding, re-reads floor and `last_value/is_called` under the lock, moves the
  sequence forward only; advisory key `hashtextextended` (bigint) cannot meaningfully collide with the app's `hashtext` locks.
- **Executed (read-only, QC3 via `scripts/qc-prisma.sh`):** `migrate status` = 151 folders, pending = the three N folders (QC3 never got
  N) · `migrate diff --from-config-datasource --to-schema prisma/schema --script` = "empty migration" (schema ↔ applied DB in sync up to
  perf_indexes). The post-N state (sequences/functions vs `pnpm drift`) was not diffable here — register open question 3 stands.
No new migration finding.

## C — lens: fixed `take` caps on privacy- and security-relevant sets
Why: hunt 1 = authorization across surfaces, 2a = portal + inbound parser, 2b = Thai calendar; nobody swept "a list that silently stops
at N" where N decides who is protected/erased/exported. Swept: privacy.ts (export, erase), portal.ts (OTP target resolution, access
pick, erase), kanban mask helpers, visibility.ts deny lists, consents, sequences `stopFor`, notify recipients, inbound `mimicsStaff`.
- Findings: H3-2 (export, executed), H3-3 (erase caps, code-read).
- Sound: visibility's orphan-activity deny list fails CLOSED at its cap (`visibility.ts:338-360` ⇒ "ALL" hidden); erase pages
  `automationRun` fully (`privacy.ts:798-808`) and masks rule cards in 500-prefix batches; portal OTP/LINE candidate caps (20/50) only
  narrow a login (fail-closed, exact post-filter); `stopFor` 500 enrollments per contact > any real count (≤ 200 sequences);
  `latestCrmStates` 500-row window could only drop an old channel state (send path fails closed); `mimicsStaff` 2 000 members,
  owner notices 20/50 recipients — not security-relevant at real sizes.

## Not covered
- fix6 (wip/crm-cf7) by instruction; account/** beyond the files the fix cards touched; UI rendering of the new badges (no browser);
  the authz-sweep F1/G1/S4 prod items (owned by the hotfix lane); a run of `migrate deploy` order with POS folders (never on QC);
  post-N drift; H3-3 and the INFO items were not executed.

HUNT-3 RESULT: 0 BLOCKER / 0 HIGH / 1 MED / 1 LOW / 1 INFO

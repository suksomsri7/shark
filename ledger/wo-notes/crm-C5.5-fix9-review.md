# crm-C5.5-fix9 — independent review (hunt-3 H3-2 person export · H3-3 erase caps · fixed-`take` sweep)

Tree `/root/projects/shark-crm-c54d` branch `wip/crm-cf12` @ ab556e16 (base 8cc1778a) · QC3 only · 2026-10-01 23:30 – 2026-10-02 00:00 UTC.
Read: builder note `crm-C5.5-fix9.md`, `git diff 8cc1778a ab556e16` (11 files), hunt-3 note, outbox (`core/outbox.ts`,
`outbox-consumers.ts` member.erased / crm.contact.erased), approval `cancelRequest`, visibility (`where.ts`, `visibility.ts`
activityClause), merge (`contacts.ts#mergeContacts`), C3.9 brief. Product source not edited.

## What was run (all QC3 · iso.sh + gate lock · one at a time)
| run | result |
|---|---|
| builder probe `scripts/pending/cf12/probe-cf12.mts` | controls 7/7 · finding checks 12/12 GREEN · CLEAN · erase E took 171 357 ms |
| review probe `scripts/pending/cf12/review/probe-cf12-review.mts` | controls 17/17 GREEN · reviewer findings 2/2 REPRODUCED (T2, U1) · CLEAN |
| review probe `…/review/probe-cf12-review-chain.mts` | finding C1 REPRODUCED · CLEAN |
| review probe `…/review/probe-cf12-review-scale.mts 500` | 500 linked cards + 500 comments + 500 history rows, all carrying identity: erased in 15 859 ms = **10.6 ms per written row ⇒ ≈ 5 600 row writes per 60 s from this host** · CLEAN |
| `pnpm typecheck` (5120 MB) | exit 0, 0 errors (second run, after fixing a duplicate key in my own probe; the first run's only error was that probe line) |
| fitness (with env) | 39/39 (F2 module boundaries green) |
| qc-crm-c3.9 · qc-crm-c3.5 | 49/49 · 67/67 |
Runner: `scripts/pending/cf12/review/run-review.sh` (ran as a /tmp copy) · logs `/tmp/cf12-review-logs/`.

Review probe blocks (all against the fix): **R1/R2** erase with injected batch 1 and 2 over a merged chain (A merged into B) whose rows
were created interleaved with a live control Q (form answers, audit rows, portal requests with cards), a card linked to A and B, a
removed link, a card shared by B and Q, 5 cards on B's deal → 0 A/B identity on 16 cards + comments + history, 10/10 forms, 10/10
audit rows, 8/8 requests gone, 8 approval ids in follow-up; Q's rows byte-identical, shared card keeps Q's phone. **S** 250 live
contacts hold P's address e1, Q holds e2: the OLD `LIMIT 200` query replayed on the fixture returned 200 pairs **without e2** (the old
over-erasure was real); on the fix Q's mail keeps e2 and P's unshared e3 is stripped from an unlinked mail (positive control).
**T** a second transaction holds `FOR UPDATE` on one of the person's cards for 75 s: the erase throws `P2028` after 73.6 s, full
rollback (no erase audit, no outbox event, form answers and name intact), retry erases. **W** union file links and relation-read web
events cut at an injected ceiling 5 keep the newest 5 ids and report `{5,7}` / `{5,8}`; a small person's default export has the
same row SETS as the old queries for 6 paged tables.

## Claims check
1. Export pages every table, keyset id DESC, ceiling 50 000 + `complete/truncated`, audit records both, web events via session,
   file links of all visible activities, forms paging + count — **confirmed** (builder X1–X6, review W1/W2).
2. Erase stays one transaction; kanban/portal/forms/audit loops page to the end; `batch` injection; rollback on timeout — **confirmed**
   (R1/R2 at batch 1/2, T1). Every loop is keyset on the primary key `id`, which no loop mutates; predicates (`linkId`, `contactId`,
   `crmContactId`, `targetId`, `sourceKey` prefix) are not changed by the masking ⇒ no skipped page, no endless loop, no tie problem.
   Portal cards are redacted before the request rows are deleted (link not lost). "Fails loudly" is true for the clicker only (M2).
3. Sweep: audit scrub covers every row (builder E3, R*.2) · `notThePerson` set query without LIMIT (S1, plus the replayed old query
   proves the old defect) · `onMemberErased` throws when the 50th round was full (code-read; see I4).

## Findings

### M1 · MED · new `complete:true` is asserted for exports that are not complete (visibility · merged chain) — owner/legal question
- Where: `src/lib/modules/crm/privacy.ts:1239` (`complete = no table cut at the ceiling`) with `:1120` (`activityWhere(c, actor)`),
  `:1143` (`dealWhere`), file links of activities through the same `actWhere` (`fileLinksOf`), and the export reading only
  `contactId = id` while the erase covers the merged chain (`eraseInTx` → `mergedChain`, `:500`). Audit `crm.contact.export.person`
  stores the same `complete:true`; the 360 block shows the plain "ดาวน์โหลดแล้ว" text.
- Repro (EXECUTED): U1 — STAFF with `crm.contact.export` (default OWN activity visibility) exports a contact he owns: 2 of 5
  activities, `complete:true`, no `truncated`. C1 — A merged into B; `mergeContacts` re-points deals/activities/mails/web/clicks/portal
  requests but not form answers, score logs, consents, records: `exportContact(B)` → FormSubmission 2/4, CrmScoreLog 2/4, no mention of
  A, `complete:true` (the erase of B does cover A).
- Pre-existing scope (visibility since C3.9, chain never exported); new is the explicit completeness claim in the file and the audit.
  MANAGER omitting sensitive values is by design (C3.9 brief) and also yields `complete:true`.
- Fix (small, after the owner/legal answer): either (a) narrow the contract — rename/document as "no table cut at the size ceiling"
  and add `scope: { requesterVisibility: true, sensitiveOmitted: bool, mergedContactIds: [...] }`, `complete` false whenever the actor
  is not ALL-visibility or the chain is non-empty; or (b) make the data-subject export independent of the requester (OWNER / an
  explicit PDPA key with ALL scope) and read the merged chain (same `ids` as the erase).

### M2 · MED · an erase that does not fit the 60 s transaction is un-erasable through the UI and invisible to ops
- Where: `privacy.ts:99` (`TX_OPTS` 60 s), `:287` (one `$transaction`), `privacy-actions.ts:38-39` (`failOf`: unknown error ⇒
  `console.error(name)` + "ทำรายการไม่สำเร็จ ระบบยกเลิกรายการให้แล้ว — ลองใหม่อีกครั้ง"). No `logOps` on this path (retention's path does
  log a WARN: `privacy.ts` retentionLeads catch).
- Repro (EXECUTED): T1/T2 — erase forced past 60 s throws `PrismaClientKnownRequestError P2028`, rolls back whole (good), OpsEvent count
  for the tenant unchanged (1 → 1). Scale: 10.6 ms per written row from this host ⇒ ≈ 5 600 identity-bearing rows per erase; the
  builder's E block stayed under 60 s because its 2 000 filler cards, 5 000 audit fillers and 5 000 portal fillers carried no identity
  (no UPDATE) and the fillers had no cards.
- Effect: a size-caused timeout repeats on every retry ("ลองใหม่" is futile), the PDPA request is never fulfilled and nobody but the
  clicker knows. Regression window: a person whose work exceeded the old caps but whose CAPPED work fit in 60 s was previously erased
  (with residue + WARN); now nothing is erased. Prod latency per statement is lower than from this host (not measured) ⇒ the
  threshold is higher there, but unbounded by design.
- Fix: catch the timeout in `eraseContact` → `logOps("ERROR", "crm.privacy", …, {contactId})` + a dedicated Thai message ("ข้อมูลของ
  ผู้ติดต่อนี้มีมาก ลบในครั้งเดียวไม่ทัน — ทีมงานได้รับแจ้งแล้ว") instead of "ลองใหม่"; batch the per-row UPDATEs (one `UPDATE … FROM
  (VALUES …)` per page instead of one statement per card/comment/history/audit row); longer term a resumable multi-transaction erase
  (an "erasing" marker + idempotent steps) for persons above the budget. Owner question: is all-or-nothing the wanted contract?

### M3 · MED (pre-existing, now uncapped) · post-commit approval cancels are one round trip each, inline in the request
- Where: `portal.ts:1503` (`cancelErasedApprovals` → `approval/service.ts:392` one `updateMany` per id, same cost whether already
  closed or not) called by `completeErasure` inline from `eraseContact` (`privacy.ts:303`) and by the `crm.contact.erased` consumer.
- Evidence: builder E (5 000 approval ids) = 171 s for the whole call from this host, almost all post-commit. The CRM contact pages
  export no `maxDuration`; the outbox route has `maxDuration = 60` (`api/cron/outbox/route.ts:8`).
- Effect: the erase is committed (audit + event) before this runs, so data is safe and the consumer retries idempotently; but the
  server action can be killed after commit ⇒ the clicker sees a failure for a successful erase (a re-click gets the resweep message,
  acceptable). If per-id latency × N exceeds a delivery's lifetime, every re-delivery restarts at the first id at full cost and is
  killed again without `attempts++` ⇒ livelock (from this host ≈ 1 700 ids per 60 s; prod threshold not measured).
- Fix: an approval facade `cancelRequests(ctx, ids)` = `updateMany where id IN chunk(1 000) AND status = PENDING` (2–5 statements for
  5 000 ids); optionally skip the inline call when the follow-up is large and leave it to the consumer.

### L1 · LOW · export: row ceiling, not byte ceiling, in one pretty JSON string through a server action
- `privacy.ts:1080` 50 000 rows × 9 paged tables + unbounded small tables, `JSON.stringify(bundle, null, 2)` (`privacy-actions.ts`)
  returned through the RSC response. Estimate without activity bodies/answers: ≈ 2 KB per "row across tables" ⇒ ≈ 100 MB string at the
  ceiling, plus objects + RSC copy; V8's max string ≈ 512 MB. Old caps could already exceed a few MB. Not executed at scale.
- Owner question: deliver big person exports through the existing private-file export lane (`exportTenant`/`runExportJobs`) instead.

### L2 · LOW · `truncated.total` can under-report under concurrent deletes
- `privacy.ts:1101-1102`: rows read > ceiling ⇒ slice + `count()` later; a purge between them can make `total ≤ ceiling` ⇒ the table
  was cut but `all()` records no marker. Fix: `total = max(count, rowsRead)` and mark whenever a slice happened. Code-read.

### L3 · LOW (other lane, confirmed) · `shopMailAddressesInTx` `take: 50` systems / `take: 2 000` user settings, unordered
- `emails.ts:450`, `:456`. Only matters when an erased person's candidate addresses include a shop address and the tenant has > 50
  CRM systems or > 2 000 per-user mail settings ⇒ shop address masked in mails (over-erasure). Better fix: look up only the candidate
  addresses (`WHERE lower(addr) = ANY(em)`), no cap.

### L4 · LOW (other lane, confirmed) · forged inbound mail moves `lastActivityAt` ⇒ postpones lead retention
- `emails.ts:2592-2603` → `activities.ts:462-470` (`GREATEST`, no proof check) → retention anchor `privacy.ts:1686`. An outsider who
  knows the Reply-To address keeps a lead out of the retention erase/warning. Gate the touch on `!unverifiedFrom`.

### I1 · INFO · not byte-identical for small persons (expected, harmless)
- New top-level `complete:true`; every paged table now id DESC (was unordered), FormSubmission flipped from createdAt ASC to id DESC.
  Row SETS equal to the old queries (W2, 6 tables). "Newest" = cuid creation order on the writing server, not `createdAt`/`at`
  (backdated imports sort by insertion) — wording in the UI/doc says "แถวใหม่สุด".

### I2 · INFO · the UI warning promises "ติดต่อทีม SHARK เพื่อขอส่วนที่เหลือ"
- `ContactPrivacyBlock.tsx:56`. There is no tool for support to produce the rest (`tableMax` is test-only). Owner question.

### I3 · INFO · performance notes inside the transaction
- Audit pass 1 orders by `id` over `AuditLog` which has no `targetId` index (old: `createdAt`, matching `(tenantId, createdAt)`);
  plan not checkable on QC3 (3 637 rows) — check EXPLAIN on prod-size data. Redaction replaces old card texts per request page
  (≤ 10 000 strings × every child string, `links.ts:543/598`) — quadratic but bounded per page; cross-page quotes rely on the mask.
  `notThePerson` now scans the tenant's contacts twice (same order as before). Lock footprint: masked kanban rows stay locked until
  commit (≤ 60 s); conversely a staff transaction holding a card blocks the erase into a timeout (T: 73.6 s, then P2028).

### I4 · INFO · `onMemberErased` throw-on-more
- `privacy.ts:1044/1065`. Per-event (outbox is per row, `crmFirst` only holds this event's automation/webhooks); MAX_ATTEMPTS 5 ⇒
  FAILED only after 5 × 5 000 contacts — unreachable; in practice a delivery is killed long before 5 000 erases and re-delivered by
  lease expiry without `attempts++`, progress kept (erased ones skipped). Not executed.

## Owner / legal questions
1. PDPA access export: should it be limited by the requesting staff member's visibility and omit the merged chain (M1)? If yes, the
   file must say so; if no, export with full scope.
2. Erase contract: all-or-nothing in one 60 s transaction (M2) — acceptable, or a resumable multi-step erase for heavy persons?
3. Big person exports (L1, I2): file lane instead of an in-request JSON string; what does support do with "ขอส่วนที่เหลือ"?

## Not verified
- Prod per-statement latency (thresholds in M2/M3 are from this host); Vercel `maxDuration`/response-size behaviour for server
  actions (project setting not in the repo); prod `EXPLAIN` of the audit pass (I3); `onMemberErased` at > 5 000 linked contacts;
  an export at the real 50 000 ceiling (memory); UI warning rendering (no browser); exports by MANAGER under TEAM policy (U1 used
  STAFF/OWN); qc-kanban-k3.1 / qc-form / docs checks (builder ran them; not re-run).

VERDICT: MERGEABLE

---

# Round 2 — re-review of da6dbc6f (`git diff 268c7716 da6dbc6f`, builder note "Round 2")

2026-10-02 00:45 – 01:25 UTC · QC3 only · product source not edited.

## What was run (QC3 · iso.sh + gate lock · one at a time · logs `/tmp/cf12-review-logs/r3*`, `r4*`)
| run | result |
|---|---|
| builder `probe-cf12-r2.mts` | controls 5/5 · findings 10/10 GREEN · CLEAN |
| builder `probe-cf12.mts` (round 1) | controls 7/7 · findings 12/12 GREEN · CLEAN · E erase 49.8 s (was 171 s) |
| review `probe-cf12-review.mts` | controls 17/17 · **T2 and U1 now NOT-REPRODUCED** · T: real 60 s limit under a 75 s lock ⇒ `PrivacyError TOO_LARGE` after 73.6 s · W2 owner export keys unchanged (`exportedAt, complete, contact, tables`) |
| review `probe-cf12-review-chain.mts` | **C1 NOT-REPRODUCED** (forms 4/4 · scores 4/4 · A included) · CLEAN |
| review `probe-cf12-review-scale.mts 500` | 1,500 rows changed in 15.2 s = 10.2 ms/row ⇒ ≈ 5,900 rows / 60 s · CLEAN |
| **new** review `probe-cf12-review-r2.mts` | controls 10/10 (P0 H1 H2 L1 T1 T2 A1 A2 A3 CLEAN) |
| `pnpm typecheck` (5120 MB) | exit 0, 0 errors |
| fitness | 39/39 |

New probe blocks: **P** the round-1 E fixture erased through an instrumented Prisma client (query events) · **H** chain direction
D ← B ← A plus unrelated X → Y, and a STAFF requester owning the survivor but not the absorbed contact · **L** L2 at exactly the
ceiling and ceiling + 1 · **T** `txTimeoutMs: 1` on two contacts · **A** `cancelRequests` across tenants/statuses with 1,205 ids,
and erases with 101 vs 100 follow-up files.

## Claims check (round 2)
- **M1** fixed: export reads `[id, ...mergedChain]` (H1: export(B) = A+B, not D/X/Y; export(D) = A+B+D; `scope.mergedContactIds`
  right; the chain only follows `mergedIntoId` INTO the exported contact, tenant+system scoped). Requester visibility now gives
  `complete:false` + `scope.limitedByRequesterVisibility` + `withheldTables` (U1: staff 2/5, `complete:false`). Owner export without a
  chain is unchanged (W2).
- **M2** fixed: TOO_LARGE, full rollback, `crm.contact.erase.failed` audit written after the rollback with exactly
  `{systemId, source, failure, elapsedMs, timeoutMs}` and the clicker as actor, OpsEvent ERROR per failure (T1: 2 failures ⇒ 2 rows;
  `logOps` throttles only the e-mail), no name/phone/reason text in either, no erase flag (`erased.ts` and every flag query match the
  action exactly), a later erase succeeds (T2). **Can TOO_LARGE be reported for an erase that committed?** No: in Prisma 7's
  transaction manager (`@prisma/client/runtime/client.js`) the commit and the timeout handler run through the same per-transaction
  operation queue; if the commit goes first the status is `committed` and the timer is cleared; if the timeout goes first it rolls back
  and the commit throws "cannot be executed on an expired transaction" (P2028). A COMMIT that fails at the driver (connection lost) is a
  driver error, not P2028 ⇒ the generic message, and a re-click gets the resweep answer.
- **M3** fixed: `approval.cancelRequests` = `tenantDb(ctx)` (tenant-scoped) `updateMany where id IN chunk(1,000) AND status PENDING`,
  same semantics as `cancelRequest` (neither emits events/notifications — read). A1: 1,205 ids (1,200 unknown, a duplicate, one
  APPROVED, one PENDING of another tenant) ⇒ 2 cancelled, APPROVED and the other tenant's PENDING untouched, re-run 0. A concurrent
  approve vs cancel is decided row by row by the `status = PENDING` predicate, exactly as before. A2: 101 files ⇒ `erased:true,
  followUp:"PENDING"`, 0 storage calls, outbox event queued, the consumer step deletes all 101, a second run is a no-op (missing
  FileAsset row = success). A3: 100 files ⇒ inline, DONE, 100 calls.
- **L2** fixed: L1 — exactly 5 rows at ceiling 5 ⇒ not cut, `complete:true`; 6 ⇒ `{exported:5,total:6}`, `complete:false`.
- **I2** fixed: the support promise is gone.

## (e) What dominates the ~45 s of the E fixture — and the cheap fix
- Instrumented erase (P): wall 53.4 s, 5,168 statements, sum of statement time 49.4 s, of which **46.5 s = 5,005 single-row
  `UPDATE "AuditLog" … WHERE id = $3`** (≈ 9.3 ms each from this host). Everything else is < 0.2 s per statement family (per-token
  `replace()` updates on AppNotification/AiMessage/AiConversation/MeetingMessage/AiProposal ≈ 0.1 s each ×11; the bulk FormSubmission
  update 0.18 s; the bulk approval cancel 0.06 s). Not a missing index, not N+1 reads.
- The builder's "only ~25 rows changing" is not right: the fixture's audit fillers carry `note`, which is in `AUDIT_IDENTITY_KEYS`
  (`contacts.ts:3046`), so the scrub rewrites all 5,005 rows. Real rows written since C3.9-fix H8 hold `(เปลี่ยน)` and are not
  rewritten; legacy rows and other actions' `note`/identity keys are.
- So the erase budget is simply "≈ 9–10 ms × every row that changes" (scale probe agrees: 10.2 ms/row). **Cheap fix:** write each page
  with ONE set-based statement instead of one per row — `UPDATE "AuditLog" a SET "before" = v.b, "after" = v.a FROM unnest($ids::text[],
  $befores::jsonb[], $afters::jsonb[]) v(id, b, a) WHERE a."id" = v.id AND a."tenantId" = $t` (privacy.ts:925), and the same shape for
  the kanban card/comment/history writers (`links.ts:629/640/653`) and the per-row CrmActivity / CrmEmailMessage / CrmDeal / timeline
  updates in `eraseInTx`. At ≤ 1,000 rows per statement that turns 46.5 s into well under a second here and moves the TOO_LARGE limit
  from ≈ 6,000 changed rows to the read volume. Recommended as the next card (it decides the real-world erase size limit).

## Findings (round 2)

### R2-1 · MED (capacity, not a regression of this round) · erase cost is one round trip per changed row
- See (e). Until batched, a person with ≈ 6,000 rows that actually change (legacy audit rows, cards/comments/history that mention him,
  his activities/mails/deals) gets TOO_LARGE from this host; prod threshold not measured. Now loud (ERROR + failed audit + clear
  message), so not blocking.

### R2-2 · LOW · the chain export gives a requester rows of an absorbed contact he cannot open (owner question)
- `privacy.ts:1159` reads the chain with no visibility filter. H2: a STAFF who owns the survivor S1 but not the absorbed A1 cannot
  export A1 directly (NOT_FOUND) yet S1's export contains A1's form answers with `complete:true` and no withheld marker. Consistent with
  "merged = same person" (the erase treats it so, and merge already moved A1's activities/deals/mails to S1), but the non-moved tables
  (form answers, score logs, consents, records/values, portal access, enrollments) become readable. Either accept (document) or filter
  the chain by `contactWhere` and add `withheldTables`.

### R2-3 · LOW · `isTxTimeout` treats every P2028 as a timeout
- `privacy.ts:371-376`: P2028 is Prisma's umbrella "Transaction API error" — also "Transaction not found" (disconnect/old id) and
  "Internal Consistency Error". Those would be reported as TOO_LARGE + ERROR "too large" + "การกดลบซ้ำจะไม่ช่วย", which is wrong advice
  for a transient fault (the rollback / "nothing was erased" part stays true). Fix: classify only the expired case (message "expired
  transaction" or `meta.timeout` present); keep the pool-wait exclusion.

### R2-4 · LOW (pre-existing, relied on more now) · no staff-side retry for leftover storage files after the consumer dies
- Repeated consumer failure: backoff 2–32 min, 5 attempts ⇒ `FAILED`; surfaced by completeErasure's WARN per attempt and the daily
  `outbox-health` ERROR (count only). After that nothing retries; the resweep branch (`privacy.ts:314-316`) deletes only files still
  linked, not the audit `followUp.fileIds`, so storage objects of an "erased" person stay. Cheap fix: call `completeErasure` (idempotent)
  in the resweep branch too, so "กดลบซ้ำ" also finishes an unfinished follow-up. The event itself cannot be lost (same tx as the flag).

### R2-5 · INFO
- Withheld counts go to the audit row only; `/app/audit` is OWNER/MANAGER (`app/audit/page.tsx:21`) ⇒ a TEAM-scoped MANAGER can read how
  many activities/deals of a person sit outside his team (numbers only); the file tells a STAFF only which tables have hidden rows.
  Acceptable for honesty; note for the owner.
- Deferred follow-up (> 100 files): portal approvals of the erased person stay PENDING until the outbox drain (`revalidateAndWake`
  wakes it after the action) — seconds to minutes; the request rows are already gone.
- TOO_LARGE on the retention / member.erased paths repeats per run/retry (one ERROR + one failed-audit row each time) — noisy but correct.
- The inline path (≤ 100 files, bulk approvals) can still outlive a short function limit only through slow storage deletes; errors there
  already answer `erased:true, followUp:"PENDING"`.

## Owner / legal questions (round 2)
1. Visibility-limited PDPA export (now stated in the file) — or a full-scope export by the owner/explicit key? (open from round 1)
2. Absorbed contacts' rows in a requester's export (R2-2): accept as "same person" or filter by visibility?
3. Erase size: approve the batched-write card (R2-1) — the all-or-nothing transaction is then practical for far larger persons.

## Not verified (round 2)
- Prod latency (all ms figures are from this host to QC3); the outbox `FAILED` path end-to-end (code-read only); UI warning rendering;
  MANAGER/TEAM visibility; prod-size `EXPLAIN` for the audit pass (not dominant here); qc suites (builder ran c3.9/c3.5/form/approval
  this round — not re-run by me).

VERDICT: MERGEABLE

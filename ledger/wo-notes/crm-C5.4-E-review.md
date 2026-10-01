# C5.4-E (FB-UX) — independent review · Opus 5.5 · 1 Oct 2026

Change reviewed: `git diff 03848b5b 279519c4` (44 files).

Method:
- Read-only. Nothing was run against a DB, and no suite, typecheck, build or server was run.
- The only executions were pure-function proofs of `core/sanitize.ts`: `/tmp/c54e-review/e1.mts` + `e1b.mts`, with the outputs checked by `check.py` (Python `html.parser`).
- Reflog was read (read-only) to tie the tested trees to the commit.
- Every numbered point (1–13) is finished. Nothing is left open.

## VERDICT: MERGEABLE AFTER SHOULD-FIX (SF-1 · SF-2 · SF-3 · SF-4 · SF-5 · SF-6 · SF-7)

- No BLOCKER was found.
- SF-6 becomes a BLOCKER only if the read-only query returns 0 rows on the production branch. Even then, prod is all uiVersion 1, so the collated SQL is not reachable today. It would surface at the first v2 switch.
- The builder's ORACLE-EDIT for C1.6-S4.4 is the minimal honest one and I support it. S4.2 needs no change (details in #6).

---

## SHOULD-FIX

### SF-1 · M3 · contact merge — score added instead of reconciled (VERIFIED by code)
- **Where:** `scoring.ts` `transferScoreInTx` (~:877).
- **What it does:** sets KEEP.score to KEEP.score + DROP.score in one SQL statement.
- **Why it is wrong:** the file's own invariant is `score = GREATEST(0, Σ live logs)` (`reconcile` ~:850; decay comment ~:1067). Adding the two scores breaks it whenever either contact's live sum is negative.
- **Scenario:** DROP has logs +30 and −40, so its score is 0. KEEP has +50. After the merge KEEP shows 50, but its true sum is 40. It stays wrong until a decay or recompute touches KEEP.
- **Wanted:** after `crmScoreLog.updateMany`, call the existing `reconcile(tx, ctx, keepId, at, s)`. KEEP's row is already locked, so this costs one statement. Keep the `#merge-<drop>` event keys; they are idempotent, because a retried merge re-runs the whole transaction and DROP is `mergedIntoId` afterwards.

### SF-2 · M3 · company merge — live portal access revoked when KEEP's row is dead (VERIFIED by code)
- **Where:** `companies.ts` `mergeCompanies` portal block (~:1637–1647).
- **What it does:** `kAccess` is built from all of KEEP's `CrmPortalAccess` rows, including revoked and never-accepted ones.
- **Scenario:** KEEP has a revoked (or expired-invite) row for contact X, and DROP has an accepted, live row for X. DROP's row is revoked and its sessions are closed. X now has no working portal access at all.
- **Staff are told the opposite:** the warning says "สิทธิ์ของบริษัทที่เก็บไว้ยังอยู่" (KEEP's access is still there), and the code comment says the same. Both are false here.
- **Wanted:**
  - If KEEP's row for X is revoked or not accepted and DROP's is live: copy DROP's live state onto KEEP's row (role, acceptedAt, loginMethods, lastLoginAt, revokedAt=null) and re-point DROP's sessions, or delete KEEP's dead row and move DROP's row.
  - Revoke and warn only when both rows are live.
  - The warning text must say who lost access.

### SF-3 · M4 · `lead.assigned` fires on the importer's own import, and once per row (VERIFIED by code trace, not run)
- **How it happens:**
  - Import calls `createCore(…, { via: "IMPORT" })` (`contacts.ts` ~:2380).
  - `assignment.pick` with creator = importer and no fixed owner returns `{ ownerUserId: creator, assignedBy: "IMPORT" }` (`assignment.ts:497`).
  - Create emits `crm.contact.assigned` (`contacts.ts:774`).
  - The self-assign filter in `notify-senders.ts:48` only skips `assignedBy === "USER:<owner>"`.
- **Effect:** a STAFF importing 1,000 rows gets 1,000 in-app notices plus 1,000 pushes ("มี lead ใหม่เข้ามาที่คุณ") about their own import. The per-day dedupe in `notifyStaff` is keyed per record, so it does not collapse them.
- **Same volume problem:** bulk reassign (`contacts.ts` ~:1333) sends N notices, each with `count: 1`.
- **Wanted:**
  1. Skip when the owner is the person who ran the import. Either carry `actorUserId` in the `assigned` payload, or stamp `assignedBy: "IMPORT:<userId>"`, then compare.
  2. Collapse bulk and import assignments into one notice per owner per batch, with `count = n` (`refType` e.g. `CrmContactBatch`, `refId` = batch/job id). The template already renders `{{count}}`.
- Single assignments by rules or by another person stay one-per-lead.

### SF-4 · E1 · the sanitizer is not idempotent for `&lt;`/`&gt;` in attribute values (VERIFIED by running the pure function)
- **What happens:**
  - `decodeAttr` turns `&lt;`/`&gt;` into a raw `<`/`>`, and `escapeAttr` (`sanitize.ts:39`) re-escapes only `&` and `"`.
  - Pass 1 is safe for a browser, because the value is still a quoted attribute.
  - Pass 2 (template save → send; privacy policy re-save) re-tokenises the `<…>` inside the attribute and truncates or garbles the content.
  - Example: `<a href="https://a.com/&lt;a href=&quot;javascript:alert(1)&quot;&gt;">x</a>` → pass 1 `<a href="https://a.com/<a href=&quot;javascript:alert(1)&quot;>" …>x</a>` → pass 2 `" rel="noopener" target="_blank">x</a>` (stray visible text).
- **Not exploitable:** 12 crafted vectors × 3 passes, with and without `allowImages`, produced no `javascript:`/`data:`/`vbscript:` href or src, no `on*` handler and no script tag (`check.py`). Passes 2 and 3 are always equal.
- **Wanted:** `escapeAttr` also escapes `<` → `&lt;`, `>` → `&gt;` and `'` → `&#39;`. Pass 1 then equals pass 2. Add one idempotence assertion to the probe.
- **Correction to the builder note:** "idempotent" is false for these values today.

### SF-5 · m1 · one definition of "overdue" not yet on every surface (VERIFIED by code)
- **Where:** `activities/_components/ActivityItems.tsx:64` + `:91` still label a row "· เลยกำหนด" when `dueAt < Date.now()`.
- **Effect:** after ruling R1, a task due at 09:00 today sits in the "today" tab (correct), but its row says "เลยกำหนด" (overdue) from 09:01. That is the same contradiction m1 fixed for the tabs.
- **Wanted:** use `isActivityOverdue(Date.parse(item.dueAt ?? item.startAt), now)` from `activities-shared`, which is client-safe. Pass `now` from the server to avoid hydration drift.
- **Out of scope by design:** `overdueSweep` (`activities.ts` ~:1608) and the automation trigger `crm.activity.overdue` stay `dueAt < now`. They fire when the due moment passes, which is an event, not a tab. State that explicitly in the `activities-shared` doc comment.

### SF-6 · m3 · collation existence on the production branch is not proven (gate)
- **Evidence it exists:**
  - `THAI_COLLATION = "th-TH-x-icu"` (`thai-text.ts:8`) is spliced into `ORDER BY`/cursor with no fallback.
  - QC3 (`ep-weathered-river`, a Neon child branch) resolved it in run7: C5.3-L6-m3 requires `icu.length === 8` from `ORDER BY n COLLATE "th-TH-x-icu"`.
  - The hunter saw the same on QC2.
  - Neon branches in one project share the Postgres build, and ICU collations are created at initdb.
- **What is still unproven:** I cannot see from the repo that prod (`ep-royal-night`) is in the same project and on the same major version.
- **Controller, run this READ-ONLY query on prod (or on QC1 if prod is off-limits, plus `SHOW server_version` on both):**
  `SELECT collname, collprovider, collversion FROM pg_collation WHERE collname = 'th-TH-x-icu';`
  - Expected: 1 row, `collprovider = 'i'`.
  - **0 rows = BLOCKER.** Every name-sorted contact and company list would 500, and the company list sorts by name by default. The fix then is `th-x-icu`, or a fallback.

### SF-7 · m3 · list-path equivalence not re-proven
- **What changed:**
  - Contacts sorted by name, and every default company list, now go through the C5.1-fix SQL page path (`contacts.ts` ~:1668; `companies.ts` ~:1445).
  - Before this batch, that path only served lists with field filters. It is now the main list path for both.
- **What was not run:** `scripts/qc-crm-c51fix-equiv.mts` (Prisma path vs SQL path, same filters ⇒ same rows) is not in run8.
- **Wanted:** run it on QC3. Apply the ORACLE-EDIT the builder anticipated: sortName snapshots now use ICU order. Every non-order assertion must stay green.

---

## NOTE (no change required for merge)

### M3 — merges
- **N-1 (SUSPECTED, code trace) Lock-order inversion with score decay:**
  - Merge locks contacts, then updates DROP's `CrmScoreLog` rows.
  - `decay` (`scoring.ts` ~:1078) locks log rows (`FOR UPDATE OF l`), then the contact (`reconcile` `FOR UPDATE`).
  - The two can deadlock (40P01). Both transactions are atomic, so the cost is a failed merge (the user retries) or a failed decay batch (the next run retries). Rare.
- **N-2 Sequence enrolments:**
  - KEEP's live enrolment wins even if DROP's is further along, which can resend steps.
  - The stop code reuses `REPLACED`, labelled "ลงทะเบียนใหม่แทน" (re-enrolled instead).
  - If someone enrols KEEP during the merge, the ACTIVE-only partial unique index (`20261101000000_crm_v2_b/migration.sql:597`) rolls the whole merge back. Acceptable.
  - Verified: the move is inside the single merge transaction (`contacts.ts` ~:2121–2134). `stopOneTx` clears the lease, so the runner cannot advance a stopped row. `CONTACT_GONE` (`sequences.ts` ~:1450) no longer fires.
- **N-3 FK sweep is complete.**
  - Left on DROP by design or as history: `CrmContactConsent` (strictest-wins rows added to KEEP) · `CrmPortalAccess.contactId` (C3.5 ruling: sessions killed, re-invite) · `PortalSession` (killed) · `FormSubmission.crmContactId` / `MemberActivity` / `AutomationRun` (history and idempotency flags).
  - `ChatConversation` / `MemberChannelIdentity` point to chat contacts, not CRM.
  - Commissions, quotas, clicks and webhooks are keyed by deal or user, or are moved.
  - Portal sessions are per `portalAccessId`, so revoking DROP's row does not log out KEEP's session.
  - Audit `movedMore` is sufficient. The REST `moved` shape is unchanged.

### M4 — staff notifications
- **N-4 Gating, recipients and dedupe are sound.**
  - `notifyStaff` returns early for v1 (`notifications.ts` ~:303), so v1 shops get nothing new. Recipients are filtered by read key + record visibility.
  - Dedupe is under an advisory lock per (recipient, template, record, Thai day). Outbox retries are therefore idempotent within a Thai day.
  - A retry that crosses Thai midnight produces a second notice. Minor.
- **N-5 `customer.replied` from inbound mail:**
  - Sent only for IN, matched-contact, non-auto mail (`emails.ts` ~:2322).
  - Forged mail can produce at most one notice per contact per day, so there is no spam amplification.
- **N-6 `deal.closed` on a same-day WON→LOST** is suppressed by the per-day key, so staff see only "closed" once.
- **N-7 `invoice.paid` on `account.document.voided` is correct.** The template label and body explicitly cover "ชำระแล้ว หรือถูกยกเลิก". My earlier suspicion is refuted.
- **N-8 `tasks.today` timing:**
  - Sent once per person per Thai day (`refId` = systemId) at the first hourly run at or after `digestHour`.
  - A missed hour is caught by the next run. If no run happens after `digestHour` that day, no digest is sent. Acceptable.

### M1 / M2 / M5 / m1 — business logic
- **N-9 M1 coercion is a safety net only.**
  - The dialog (`DealMoveDialogs.tsx` ~:160–225) sends typed values: option VALUE, number, boolean, array, browser-local ISO. All `useDealMover` callers pass `fieldInputs`.
  - Server `pick()` matches value first, then label (case-insensitive). That is right for the value contract.
  - Duplicate labels resolve to the first match (the engine dedupes values only, `member/fields.ts:255`).
  - A multi-select string is split on ",".
  - A zoneless DATETIME string is parsed in the server TZ. This is engine behaviour that predates the batch.
  - A d/m/BBBB date is refused with the พ.ศ. hint (`member/fields.ts:181–199`), consistent with m2.
  - The 390 px shot (`green2/m1-dialog-390.png`) shows a number box and select lists, with no overflow.
- **N-10 M2 has no dangling keys:**
  - The member field engine has no hard delete, only `archiveField`/`restoreField`.
  - Archived and missing keys are skipped by `missingFor` and re-enforced on restore. The StageSettings note tells the owner.
- **N-11 M5 company lifecycle and score:**
  - The lifecycle CASE matches its sibling cache columns (deals are hard-deleted; `archivedAt` has no writer). It is forward-only, so there is no flip-flop.
  - A company never leaves CUSTOMER after its deals are lost. That is by ruling R3 (owner decision below).
  - Company `score` remains only as a DTO field (`companies.ts:343`, always 0). It is not a sort key, not on the list page, and not in REST ops text.
  - The 360 badge and the rule-builder picker are hidden. `co.score` rules still validate.
  - The seed change (ruling 8) was **never executed** in this batch: no reseed appears in the run scripts, and QC3's `crm-expected.json` predates the work. `crm-expected.json` pins no company lifecycle/score. Reseed QC and refresh the visual suites before relying on it.
- **N-12 m1 oracle edit:** C1.6-S4.2 expects only "today 00:01" in the today tab, which holds under both definitions. C1.6-S4.4 changes to "−2 days only". C3.6-S3.2 already pins the Thai-day boundary (green). The ORACLE-EDIT is minimal and honest.

### m3 / m5 / m6 / m8 / m11
- **N-13 m3 sara am normalisation:**
  - `normalizeThaiText` is correct for ำ and for both tone orders.
  - `thaiSearchVariants` adds only the tone-first decomposed spelling, so legacy rows stored as ํ+tone+า are still not found. There is no backfill.
  - Search terms are bound parameters and the collation is a constant, so there is no injection.
  - The unindexed collated sort is a full sort per page, plus OFFSET for companies. Fine for SME volumes; add an expression index if big shops appear.
  - Company pickers still sort by C collation, so order differs from the list.
- **N-14 m5:** the correction is audited with `after.correction=true`. It does not undo a member created through the WON bridge.
- **N-15 m6:** idempotent (lock + `onlyIfNone` + `skipDuplicates`). Every business template reuses the central keys, so no duplicate reasons appear when a template is applied after the v2 switch.
- **N-16 m8:**
  - Import refuses the whole company row when the domain is free-mail. Calmer: import the row without the domain and add a row warning.
  - Contact→company auto-filing through `companyByEmailDomain` now ignores free-mail, which is the intended effect.
- **N-17 m11:** a view with a dead filter silently returns more rows. The page note covers web; REST callers using a saved view get no hint.

### E2 / E3 / E4 / prod reach / housekeeping
- **N-18 E2:**
  - Placeholder values are substituted after linkify, escaped and never linkified (`emails-shared.ts` ~:341–370).
  - Unknown `{{x.y}}` becomes blank in body and subject, the same rule as sequences.
  - The subject still refuses line breaks after substitution.
  - The staff composer has no preview, so a template with `{{deal.*}}` goes out blank. A preview, or refusing unknown placeholders in the composer, would be kinder.
- **N-19 E3 is correct:**
  - Fires only on PROVIDER_401/403/429; 5xx does not notify.
  - Flag keyed per tenant per Thai day under an advisory lock, plus the OpsEvent flag. v1 is excluded.
  - Recipients are tenant OWNER/MANAGER, which may include managers without CRM rights.
  - The settings path is plain text in the body, not a link.
- **N-20 E4** is local styling only (no global CSS). The shot shows faded, locked buttons.
- **N-21 Prod reach:**
  - The handback lists sara am normalisation as the only v1-reachable change.
  - **E1 is also prod-reachable:** `core/sanitize.ts` is used by the live member privacy page (`member/privacy.ts:522`).
  - The change is an improvement: `&amp;` links no longer decay to `&amp;amp;` on every re-save. But SF-4 applies there too.
  - V1.1 rows are byte-identical between RED run6 and GREEN run7. The fixture uses precomposed "น้ำ", so it does not exercise the normalisation.
- **N-22 Housekeeping:** uncommitted QC3 seed outputs `scripts/crm-expected.json` / `scripts/member-expected.json` sit in the worktree. They are not part of 279519c4. Do not commit them.

---

## #13 — logs and method (VERIFIED)
- **Counts match the handback:**
  - run7: probe 20/20 · C5.3 L6 16/16 (temp copy differs only in the host guard, `run7/c53-copy.diff`) · UI 5/5.
  - run8: c1.4 110 · c1.3 89 · c1.5 103 · c1.9 45 · c2.5 105 · c2.6 87 · c2.10 41 · c3.6 29 · c2.1 84 · c2.2 73 · c2.7 79 · c2.8 54 · c0.5 50 · c3.5 67 · c1.11 66 · m1.2 27 · typecheck 0 · fitness 33/33 ×2.
- **Red classification is correct:**
  - C1.6-S4.4: the oracle question under R1.
  - C1.2b-S8.2: pre-existing limits warning at 29.
  - C1.10-S7.2 + H.1: identical on untouched HEAD in run10 (`srcDiffVs03848b5b=0`).
  - C3.7 S1.x/S2.x and M1.6 S3.x: missing visual-crm/shoot/member screenshot artefacts in this worktree. Environmental.
  - C2.5-S9.10 is green, so the default-option sanitize output is byte-identical on its fixtures.
- **Tested code = committed code:**
  - All 38 src files have mtime 00:22:42 (1 Oct), after run7/run8. That is run10's checkout/restore.
  - run8's `srcHash=da39a3ee5e6b` is the SHA-1 of an empty input (it hashed the unstaged diff while the work was staged), so it proves nothing.
  - **The reflog does prove it:** park commit 8e21618e (23:07, before RED run6), park commit 78901717 (00:20, after run8) and 279519c4 have **identical `src/` trees**. GREEN runs 7/8/9 were bracketed by them.
- **The RED method is sound:** park commit → base src checked out (verified `srcDiffVs03848b5b=0`) → run → `reset --soft`. It did not use the shared stash. Next time, hash `git diff 03848b5b -- src`, not the unstaged diff.

---

## Owner decisions
1. Company lifecycle is forward-only (R3), and there is no correction path for a company after a mistaken WON (contacts got the m5 correction). Add the same OWNER/MANAGER correction for companies?
2. Company score: hidden for now (R3). Define it (e.g. max of linked contacts' scores) or drop the column and the `co.score` condition later.
3. `lead.assigned` granularity: one per lead for single and rule assignments (current), and one summary per batch for import and bulk (proposed in SF-3)?
4. Free-mail company domain on import: refuse the row (current), or import without the domain plus a warning?
5. Merge stop code: keep reusing `REPLACED`, or add `MERGED` (enum + label)? And should the more advanced enrolment win instead of KEEP's?
6. E3 recipients: all tenant OWNER/MANAGER, or only those holding CRM e-mail settings rights?

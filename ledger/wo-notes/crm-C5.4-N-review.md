# C5.4-N — independent review + money hunt (reviewer · read-only on src/ and the migration)

VERDICT: **MERGEABLE AFTER M1, M2, M3** (M1 = small code fix in `gl.ts`/SQL allocate-until-free · M2 = written rollback procedure, no code ·
M3 = prod lock-capacity pre-check, or shrink the DO block) — plus CI `pnpm drift` green on the merge commit (n4). Correctness of the card's
own goal is PROVED: no duplicate journal number under the hunter mix, legal series gapless (incl. failure after the stamp), N-1 fixed without
moving existing shops backwards, no new deadlock.

Severity summary: BLOCKER 0 · MAJOR 3 (M1 new · M2 new/rollback · M3 new, BLOCKER-conditional on prod size) · MINOR 1 (m4 oracle N7) ·
NOTE n1–n8 (n2 pre-existing).

Tree: `/root/projects/shark-crm-c54c` HEAD 070b7825 (base of design/oracle 96a4c28f) · QC2 only · probes `scripts/pending/c54n/review/`
(`r1-db-facts.mts` read-only facts · `r2-money.mts` A–E money/migration probes) · logs `/tmp/c54n-review/` (copy `.qc-shots/c54n-review/`).

## Checkpoint log
- CP-R1 read note, diff, oracle, wrappers, all callers; static findings drafted.
- CP-R2 r1 facts on QC2 done; reruns (oracle → r11 Q3 → deadlock ×40 → 3 suites) in unit `c54n-review-*`; r2 run.
- CP-R3 all reruns done (ALLDONE 07:43); verdict written.

## QC2 facts (r1-db-facts.log)
- PG 18.6 · max_locks_per_transaction 64 · max_connections 901 · max_prepared_transactions 0 ⇒ shared lock table ≈ 57 664 slots.
- App role = migration role = `neondb_owner` (CREATE on public ✓, owns all 5 411 `acc_jno_*`). Functions: not SECURITY DEFINER, no `SET search_path`.
- 1 063 systems with a chart · 5 411 sequences · 554 journal rows · 0 docNo outside the display format · 0 cross-book prefixes · 0 ≥7-digit tails ·
  190 (system, book) with rows, 0 sequences behind the table max.

## Findings
Probe R2 (`r2-money.log`, 10/11 — the one ❌ is the probe's own judging error, see D below): A-warm ✅ · A-first-of-period ✅ · B1 ✅ · B2 ✅ ·
C1 ✅(hazard shown) · C2 ✅(hazard shown) · C3 ✅ · D-creator-commits ✅ · D-creator-rolls-back ❌→✅ re-judged · E (5.13 locks/system) · CLEAN 0/0/0.

### M1 MAJOR (new) — journal sequence never re-floors: rows written by OLD code after the sequence exists ⇒ user-visible failed payments
- `gl.ts:304-318` `allocateJournalNo` = bare `nextval`; `migration.sql` sets the floor ONCE (DO block, margin 100 only if the system posted in the last 24 h).
- `scripts/vercel-build.sh:20-24` runs `prisma migrate deploy` BEFORE `tsc` + `next build` (5–40 min on record, 28 Sep hung 40 min); a build that fails
  after migrate leaves the migration applied and OLD code (count+1) serving indefinitely.
- Every count+1 number old code writes above `floor+margin` in the current month is later handed out again by `nextval` ⇒ that new-code
  money transaction dies with P2002 → `บันทึกชำระไม่สำเร็จ`; a 40-child batch dies if ANY of its postings hits one. Failures per book =
  (old-code postings in the window) − margin. Margin-0 systems (quiet yesterday) fail on the FIRST posting after deploy whenever the current
  month holds their all-time max (true late in a month; early in a month the previous month's max usually protects them).
- **Proof R2-C1**: sequence at 2, old code writes `RV-2026-10-0003` → next payment `FAIL "บันทึกชำระไม่สำเร็จ"` (P2002), the one after ok (`…-0004`).
- Fix (small, merge condition): allocate-until-free — after `nextval`, check `(systemId, docNo)` on the unique index and take the next value while
  it exists (or do it inside `account_next_journal_no` with the formatted number). Cheap (index probe), closes this window and any future drift
  (restore, manual insert). Ops alternative only if the code fix is refused: run a re-floor SQL right after the new code is live (checklist §R).

### M2 MAJOR (new, rollback path) — Vercel "Instant Rollback" to pre-C5.4-N code freezes books for the rest of the month
- Old `nextJournalNo` = count+1 per (book, period). New numbers have gaps (rolled-back money transactions burn one each — allowed by P20) and do
  not reset monthly. When count+1 of the current month lands on an existing number, the insert fails, count does not grow, and EVERY later
  posting of that book fails the same way until the month changes. Shops created (or with a low floor) under the new code are hit first.
- **Proof R2-C2**: RV `0001..0004, 0006` (0005 burned by a failed transaction) → three old-code attempts all `RV-2026-10-0006` → P2002 ×3.
- The builder's note ("count+1 … can collide … P2002 → the old race, no data harm") understates it: it is a per-book outage, not a race.
- Fix (no code): the rollback procedure must never return `gl.ts` to count+1 — prepare the rollback as "previous release + C5.4-N gl.ts
  allocator" (cherry-pick), never Vercel Instant Rollback past this deploy. Write it into the deploy note.

### M3 MAJOR-conditional (new) — migration DO block: one transaction, ≈5 lock-table entries + 5 subtransactions per system
- Measured (R2-E): 100 systems → 513 locks (5.13/system) held to commit; each `account_jno_ensure` create path enters a plpgsql
  `BEGIN … EXCEPTION` block = one subtransaction with an XID (>64 ⇒ subxid overflow: every other session's snapshot checks go to pg_subtrans
  for the duration).
- Lock table = max_locks_per_transaction × (max_connections + max_prepared_transactions). QC2: 64 × 901 = 57 664 ⇒ breaks at ≈ 11 240 systems
  (other sessions' locks not counted). Neon sizes max_connections by compute: a 0.25 CU compute (≈112 conns) breaks at ≈ 1 400 systems.
- Failure mode: `out of shared memory` → `migrate deploy` fails inside `vercel-build.sh` → build red, `_prisma_migrations` row marked failed
  (next deploys blocked until `migrate resolve`), and while it runs other sessions can fail to take locks.
- BLOCKER if prod `systems × 5.13` > ~50 % of its lock table; otherwise NOTE. Gate = the pre-check in §R. Safer shape (recommended): pre-create
  only the margin-100 (recently active) systems and leave the rest to lazy `ensure` (it already computes the floor), or batch outside Prisma.

### m4 MINOR (new) — N7 no longer proves its sentence; R2-A does
- Oracle N7 (`qc-numbering.mts:261-262`) runs `recordPaymentInTx` in a bare `$transaction`; it now dies at the `deferDocNo` guard
  (`doc-numbering.ts:534`) before any counter is touched, so "consumes no legal number" is trivially true — it no longer exercises "failure
  after the numbered documents were written".
- **R2-A proves it literally**: `openDocNumbering` → `recordPaymentInTx` / `recordVendorPaymentInTx` → `finalizeDocNos` (numbers stamped) →
  throw ⇒ 0 payments/docs left and the next real payment receives exactly the numbers stamped in the failed one (TX/WTI/WHT …0002 warm;
  …0001 first-of-period, i.e. the counter-row INSERT is rolled back too).
- ORACLE-EDIT recommended (not applied): in N7 wrap both induced transactions as
  `dn.openDocNumbering(tx); await …InTx(…); await dn.finalizeDocNos(tx); throw new Error("QC-INDUCED …")` with
  `const dn = await import("@/lib/modules/account/doc-numbering")`, and add `stamped-in-failed === next real` to the verdict.

### Deviation verdicts
1. `account_jno_ensure` catch — OK. Only `unique_violation | duplicate_table` inside the create sub-block are caught; the floor/setval cannot
   raise them; a non-sequence relation with the same name is not caught (setval fails loudly). R2-D: 6 concurrent first allocations, creator
   commits → 1..6 distinct; creator rolls back → its CREATE + nextval roll back and the next creator re-creates from the floor (1..5 committed,
   distinct; my probe counted the rolled-back creator's value — judging error, re-judged ✅). NOTE n1: if `to_regclass` is still NULL after the
   catch (only with a concurrent `account_jno_drop`), `nextval(NULL)` → NULL and `gl.ts:317` formats `XX-yyyy-mm-null`, which inserts fine —
   add `if (rows[0]?.n == null) throw`.
2. 50 ทวิ register shares the configured WHT_CERT generator — OK. WHT_CERT is not user-configurable (`settings-schema.ts:14`), so the default
   `WHT-{ปี}-{เดือน}-{0000}` / MONTH = the old register format; same counter row `YYYY-MM`. R2-B1 existing shop continues 0006 / WTI 0004;
   R2-B2 00:30 ICT on 1 Oct → `WTI-202610-0001`, `WHT-2026-10-0001` (N-1 gone), register `WHT-2026-10-0002`, JV `RV/PY-2026-10-…`.
3. `recordPaymentInTx` → `whtCertDocId` — OK, no consumer shows an id/undefined. Every caller goes through a wrapper that maps id → number:
   `service.recordPayment:2776` · `cheque.recordPaymentWithChequeInOneTx:398-400` · `group.recordGroupPayment:655` (`res.docNos`) · `payment.ts:313`
   (`res.whtCertNo`) → `payment-actions.ts:139/143`, `PaymentPanel.tsx:97`, `GroupPaymentPanel.tsx:220`, REST `payments-write.ts:209/499`
   (`whtCertNos`) · `wht.issueWhtCreditCertStandalone` / `issueWhtCert` return the finalized number (`wht/actions.ts:59`, REST
   `finance-write.ts:643`) · seed `seed-acc-v2-qc.mts:1388` uses `recordPayment`. No webhook payload carried the cert/auto-TI number before or
   after (`account.payment.recorded` / `account.invoice.paid` unchanged). `docs/api/ACCOUNT-API.md` untouched.
4. N7 — see m4.

### Item-by-item verdicts (1 · 2 · 4 · 6)
**1 JV numbers — correct under concurrency; no duplicate is possible in the table.** Protection = `@@unique([systemId, docNo])`
(`account_gl.prisma:28`); `nextval` with CACHE 1 never hands the same value twice and never waits; rollbacks only burn values (N2: 2 skipped of 1141).
Prefixes are book-unique (`gl.ts:26-32`, enum has exactly 5 books) so per-(system, book) sequences cannot collide across books. Floor =
max trailing digits over all periods (`account_jno_floor`) — handles legacy, other months, `JV-QC-1` (→1), deleted/imported rows (N4b ✅).
No path writes `AccountJournalEntry.docNo` except gl.ts (`commitEntry:246`, `reverseFor:933`, `reverseEntry:1011`); nothing hard-deletes
entries; users cannot type a journal number. Month in the display = `bkkPeriod(date)` = periodKey (R2-B2 at 00:30 ICT ✅). Missing/dropped
sequence self-heals (R2-C3 ✅); sequence BEHIND the table does not (M1).
**2 Legal documents — gapless and ordered (proved).** N3-numbers 616 docs gapless; R2-A: a failure after the stamp burns nothing (incl. the
first-of-period INSERT). Counter + stamp + documents live in one transaction, so no path consumes a legal number and then commits without the
document. All callers of the deferred creators are wrapped (`grep`: `recordPaymentInTx` ← service:2773, cheque:379, group:613 (inside
`recordPaymentBatchInOneTx`); `recordVendorPaymentInTx` ← expense:1168, cheque:378, group:612; `issueWhtCreditCert` ← service:2890,
wht:211; `createPendingTaxInvoice` ← expense:1009; `issueWhtCert` register wht:338) — a forgotten wrapper throws (guard) instead of issuing an
unnumbered TI. Leftovers `nextJournalNo`/`nextWhtCertNo`/`nextWhtCreditNo`: none. Still taking a counter EARLY (phase 2, documented):
`issueDocument` service:2408 · `issueExpenseDoc` expense:986 (own number; its PTI is now at the tail — PURCHASE/EXPENSE < PTI in
`DOC_TYPE_LOCK_ORDER`, no reverse taker found) · `submitForApproval` expense:1484 · goods docs product.ts:674. Credit/debit notes, billing
notes, deposits, cheques, recurring, imports, REST ops and AI tools number through `issueDocument`/`issueDocNo` unchanged (not deferred, not
in a money wrapper) — pre-existing behaviour. N-1 fix (`seriesMatcher`, `doc-numbering.ts:230-281`): same pattern ⇒ same regex, so it can
never skip a number that could collide; formats differ ⇒ strings differ. R2-B1/B2 ✅.
NOTE n2 (pre-existing, Q3): first posting of a month inserts `AccountPeriod` inside the money tx; a phase-2 `issueDocument(TAX_INVOICE)`
holding the TI counter that then posts into the same new month waits on that row while the payment waits on the TI counter at its tail ⇒
40P01 once per month per system (same cycle existed with the mid-transaction counter; the tail placement only widens the window).
**4 Migration SQL (live prod).** Locks: AccessShare on `AccountLedger`/`AccountJournalEntry` (never blocks writers) + AccessExclusive on each NEW
sequence (invisible to others) — no table lock, no rewrite. Duration: QC2 1 061 systems "seconds" (builder); R2-E 100 systems / 500 sequences
743 ms ⇒ ≈7 ms/system + floor scans (`systemId`-prefixed index). Capacity: M3. Idempotent re-run: yes (OR REPLACE, ensure no-op; a re-run does
NOT re-apply margins — correct). Between migrate and deploy: M1. After rollback to old code: M2. SECURITY: identifiers only `[a-z0-9_]`
(md5 for anything else) and built with `%I`/`quote_ident`/regclass output — no injection via systemId or book; not SECURITY DEFINER (runs as
caller); NOTE n3: no `SET search_path` — sequences are created/resolved in the first schema of the caller's search_path (`"$user", public`);
schema-qualify `public.` in the function bodies so a future `neondb_owner` schema cannot split them. Privileges: app role needs CREATE on
`public` at run time (first posting of a new system does `CREATE SEQUENCE` inside the money tx: a few ms, one catalog insert, concurrent first
postings of that book wait for the creator's commit — R2-D) and USAGE/UPDATE on migration-created sequences; QC2 uses one role for both.
pgbouncer (transaction mode): nothing session-scoped is used; CACHE 1 keeps values increasing across pooled backends ✅. Tenant purge
`pdpa.ts:104-108` drops ACCOUNT systems' sequences before the purge, errors swallowed (orphans harmless). Prisma: F8 (static model check)
unaffected; NOTE n4: `pnpm drift` (= `migrate diff --from-config-datasource --to-schema`) is UNVERIFIED — this is the repo's first standalone
sequence/function and Prisma 7.8's schema engine does introspect `pg_sequences`; CI branches are created from the prod default branch
(`neon-branch.mts`), so CI `migrate deploy` creates prod-scale sequences right before `pnpm drift` — the CI run of this branch is the proof
(and a free prod-size rehearsal of the DO block). Catalogue at 10× (~10 k systems): 50 k `pg_class` rows, one 8 kB file each (~400 MB),
slower pg_dump/restore, per-backend relcache growth — acceptable, NOTE n5.
**6 Other money-auditor angles.** Period lock / closed period: `commitEntry` asserts period + `lockBeforeDate` BEFORE `allocateJournalNo`
(`gl.ts:239-243`) so a refused posting burns nothing; reversals into the next open period get that period's month. Journal search exact-first
(`journal-v2.ts:205-250`): exact match only when the full number exists, else the old `contains` — OK (case differs → contains). Sorts by
journal number as text: only `finance.ts:823` (fixed to createdAt,id); ledgers use date/createdAt/id (`coa.ts:460,751`), PP30 sorts by date
(`reports.ts:586`); CSV/REST/PDF treat the number as opaque text ✅. NOTE n6 (owner Q1 pending): numbers no longer restart monthly while the
display still carries `yyyy-mm` (`SV-2026-11-0153`); auditors will ask — decide before prod. NOTE n7: N6 service extra wait 964 ms on my rerun
(181 ms builder) — half the 2 s margin. NOTE n8: a docNo with a ≥ 20-digit tail overflows `::bigint` (migration aborts / book unusable) and a
≥ 7-digit tail makes the sequence jump — none on QC2 (r1), pre-check on prod.

## Reruns by the reviewer (own unit, QC2, src = 070b7825)
- oracle `qc-numbering.mts`: **12/12** rc 0 (07:23) — N1a 20/20·6/6·1/1 raw {} 16 s · N1b same 26 s · N3-ops 300/300 · N6 batch 24.3 s, extra wait goods 78 ms /
  service **964 ms** (builder 181 ms — still < 2 s, but half the margin: Neon noise) · FOR UPDATE on TI counter 48 ms · N2 1141 entries, 2 skipped ·
  N3-numbers 616 docs gapless (TX 1..216 · WTI 1..216 · WHT 1..62 · PTX 1..61 · RE 1..61) · N4b ok · N8 clean.
- hunter r11 race `probe-r11a ONLY=Q3`: baseline 5/5·2/2·1/1 · round 1 singles **20/20**, 5-child 6/6, 40-child **1/1**, raw {} · round 2 same · CLEAN 0 (07:34).
- deadlock `trace-r10-2-deadlock ROUNDS=40`: ok|ok **40/40** · raw {} · cycles 0 · CLEAN 0 (07:37).

## §R Production checklist for the owner (migration `20261104000000_account_journal_no_sequence`)
Pre-checks (read-only, on prod, before merging to main — the Vercel production build runs `migrate deploy` itself):
1. Lock capacity (M3): `SELECT count(DISTINCT "systemId") FROM "AccountLedger"` × 5.13 must be < 50 % of
   `max_locks_per_transaction × (max_connections + max_prepared_transactions)` (`SHOW …` each). If not: change the DO block to pre-create
   only systems with a journal entry in the last 1–2 days (the rest are created lazily) before merging.
2. Number shapes (n8): `SELECT count(*) FROM "AccountJournalEntry" WHERE "docNo" !~ '^(SV|PV|RV|PY|JV)-\d{4}-\d{2}-\d{4,}$'` and
   `… WHERE "docNo" ~ '\d{7,}$'` → both 0 (else inspect: ≥ 7 digits = visible jump, ≥ 20 = migration aborts).
3. Roles: the role of DATABASE_URL (app, pooled) and DIRECT_URL (migrate) are the same, or the app role gets CREATE on `public` +
   USAGE, UPDATE on the new sequences (`has_schema_privilege`, `has_sequence_privilege`). A mismatch = every posting fails = outage.
4. CI of the merge commit green, in particular `migrate deploy` (runs on a fresh branch of the prod default branch = prod-size rehearsal —
   note its duration) and `pnpm drift` (n4, unverified).
5. M1 code fix merged (allocate-until-free). Owner answers Q1 (no monthly reset) — the display carries yyyy-mm.
Timing: the first days of a month (the previous month's max protects margin-0 shops), a quiet hour, not during month-end close, no other
migration in the same deploy, someone watching the build (the window = migrate → tsc → next build, 5–40 min).
Order: (a) pre-checks 1–4 → (b) merge → Vercel production build (migrate deploy, then build) → (c) if the build fails AFTER migrate, fix and
redeploy at once (old code keeps writing count+1 while the window is open; without M1 run step (e)) → (d) smoke: one payment with WHT on a
service invoice (TI + WTI numbered), one vendor payment with WHT, journal page opens the JV modal → (e) only without the M1 fix: re-floor
`DO $$ DECLARE r record; v bigint; f bigint; q regclass; BEGIN FOR r IN SELECT DISTINCT "systemId" s, "book"::text b FROM "AccountJournalEntry"
LOOP q := account_jno_ensure(r.s, r.b); f := account_jno_floor(r.s, r.b); EXECUTE format('SELECT last_value FROM %s', q) INTO v;
IF v < f THEN PERFORM setval(q, f, true); END IF; END LOOP; END $$;` → (f) for 1 h watch P2002 on "AccountJournalEntry" (should be 0).
Rollback (M2): NEVER Vercel Instant Rollback past this deploy. Prepare the rollback build in advance = previous release + C5.4-N `gl.ts`
allocator + `journal/page.tsx` peek (the legal-tail part may be reverted safely: counters are authoritative and shared). The DB objects stay
(additive; old code ignores them). Down-migration not needed; never drop the sequences while new code runs (they self-heal, but the first
posting of each book then pays a CREATE).
- suites (mine vs controller base `main-c2.log`): qc-acc-v2-payments **162/162** (base 162) · qc-acc-v2-groups **174/174** (base 174) ·
  qc-account-api-write-payments **32/32** (base 32) — all rc 0, ❌ 0.
- probes: `r1-db-facts` (facts above) · `r2-money` 10/11 → 11/11 after re-judging D (probe error), CLEAN 0 rows / 0 tenants / 0 sequences.

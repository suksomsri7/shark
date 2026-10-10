# crm-C5.5 hunt 2b — diffs C5.4-N (264c5440) + C5.4-D2 (8cf86985) + lens "Thai calendar vs UTC" (code-read only)

Summary: MEDIUM 1 (H2b-1 runbook privilege pre-check lost the sequence-privilege half) · LOW 4 (H2b-2 check-then-setval race in the
self-healing allocator · H2b-3 at-risk "เลยวันคาดว่าจะปิด" from 07:00 on the due day · H2b-4 field_due fires a day early for DATETIME
fields · H2b-5 portal shows DATETIME custom values as the UTC date) · INFO 3. No BLOCKER/HIGH.

Tree /root/projects/shark-crm (session/crm @ 4ec134bd, contains 264c5440 + 8cf86985) · read-only · ~11:45–12:20 UTC.
Neither commit is on origin/main (`git merge-base --is-ancestor` both false) ⇒ H2b-1/H2b-2 are session/crm only. The lens findings
H2b-3..5 are in origin/main code too, but they sit on CRM v2 surfaces (uiVersion 2), which are hidden on prod ⇒ not reachable today.

Lens chosen: **time zones and date boundaries (Asia/Bangkok vs UTC, day/month edge, date-only vs instant)**. Why: hunt 1 used
"authorization consistency across surfaces", hunt 2a used "portal + inbound parser"; neither looked at dates, the repo has a known
history of this trap (memory "getDay() Thai date", C5.4-N's own UTC-month WTI bug), and CRM v2 stores two different kinds of "date"
(instant vs. UTC-midnight-of-the-Thai-day), so mixing them is the likely failure. Sampled: limits, quotas, commissions, reports(-shared),
sequences(-shared) send windows/holidays, automation cron triggers, ai-bridges at-risk, deals-shared, portal record values, privacy,
contacts export, tracking labels, DealBoard.

No DB was touched (no probe executed, nothing created on QC1/QC2/QC3; row counts unchanged by me). Every finding below is CONFIRMED by an
unambiguous code path unless marked PLAUSIBLE.

## Findings

### H2b-1 · MEDIUM (conditional on prod roles) · CONFIRMED (text) / PLAUSIBLE (impact) · runbook pre-check 3 no longer checks sequence privileges
- `ledger/wo-notes/crm-C5.4-N.md:446-449` (builder's final production runbook): "Same user, **or** the app user has CREATE" +
  `has_schema_privilege(current_user,'public','CREATE')`. Copied into `ledger/CRM-C6-REGISTER-DRAFT.md:23` (1.12) and New-2 (`:82`).
- The reviewer's §R checklist (`crm-C5.4-N-review.md:152-153`) said "same, or the app role gets CREATE on public **+ USAGE, UPDATE on the
  new sequences** (`has_sequence_privilege`). A mismatch = every posting fails = outage." The final runbook dropped the second half.
- Scenario: prod DATABASE_URL role ≠ DIRECT_URL role, app role has CREATE on `public` (pre-check passes). Migration
  `20261104000001_…` DO block (`migration.sql:142-158`) creates up to 2 500 `acc_jno_*` sequences **owned by the migrate role**. The app
  calls `account_alloc_journal_no` (not SECURITY DEFINER) → `nextval`/`setval` on a sequence it has no USAGE/UPDATE on → 42501 →
  `gl.ts allocateJournalNo` maps it to `JOURNAL_NO_NO_PRIVILEGE` "ฐานข้อมูลไม่อนุญาตให้**สร้าง**ตัวนับ…" (`gl.ts:314`, wrong cause) ⇒ every
  posting (payments, POS, payroll, inventory) of the ≤500 most active systems is refused from the first minute after deploy; the M1
  fallback cannot help (the sequence exists). `account_peek_journal_no` (journal page) also fails (needs SELECT).
  Systems created later by the app role are fine; the converse (sequences owned by the app role, re-floor/diagnostic SQL run as the
  migrate role) only affects the runbook's step (e).
- Exposure: session/crm only (N not on origin/main). Likely harmless on a default Neon project (one owner role for both URLs) — but the
  runbook is the only gate and it now accepts the failing configuration.
- Fix: restore the reviewer's wording in pre-check 3 and add an executable check, e.g. run over DATABASE_URL after a dry-run on a prod
  branch: `SELECT bool_and(has_sequence_privilege(c.oid,'USAGE,SELECT,UPDATE')) FROM pg_class c WHERE c.relkind='S' AND c.relname LIKE 'acc_jno_%'`;
  or `ALTER DEFAULT PRIVILEGES FOR ROLE <migrate> IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO <app>` in the runbook;
  optionally make the error text of 42501 neutral ("ไม่มีสิทธิ์ใช้ตัวนับ") instead of "สร้าง". Update register 1.12 / New-2.
- Oracle step: runbook smoke (d) already posts one payment — add "on a system that was in the migration's pre-created set" (the
  current smoke uses a brand-new system, which the app role creates itself and therefore can never show this).

### H2b-2 · LOW · PLAUSIBLE (race window µs; reviewer probe R3-H1 exercised the path 800× without hitting it) · allocator check-then-setval can move the sequence backwards
- `prisma/migrations/20261104000001_account_journal_no_sequence/migration.sql:107-110` (slow path, gap > 1000):
  `EXECUTE format('SELECT last_value FROM %s', r) INTO v; IF v < f THEN PERFORM setval(r, f, true); END IF;` — read and write are two
  statements with no lock; sequences are non-transactional.
- Interleaving (restore/import left a dense foreign block 2..5000 above a sequence at 1, two cashiers pay at once):
  T_a nextval=2 (taken) → floor f=5000 → reads `last_value`=3 · T_b (same path) setval(5000) → nextval → 5001 → not in the table (its own
  row is not committed) → returns 5001, inserts `RV-…-5001` (uncommitted) · T_a, still holding v=3 < f, setval(5000) → **sequence back
  to 5000** → nextval 5001 → EXISTS sees nothing committed → returns 5001 → its insert waits on T_b's unique-index entry, then 23505 (P2002)
  → T_a's money transaction fails "บันทึกชำระไม่สำเร็จ" — exactly the symptom M1 was built to remove. Any third allocator in the same
  window gets the same duplicate.
- Window: T_b must complete setval + one loop iteration (ensure, nextval, one index probe) between T_a's two adjacent plpgsql
  statements — needs T_a descheduled ~50–100 µs; rare on a quiet DB (R3-H1 16×50 green), more likely under the CPU pressure that comes with
  the "many cashiers after a restore/import" situation that triggers the slow path. Only reachable when a book has > 1000 foreign numbers
  above its sequence (restore, import, re-created sequence). Not on prod (session/crm only).
- Fix: serialise healers and re-read under the lock — in the slow path `PERFORM pg_advisory_xact_lock(hashtextextended(r::text, 0));`
  then re-`SELECT last_value` and `setval` only if still `< f`. (A healer that already set the sequence ≥ f is then seen; plain nextval
  callers never hand out a value > f before the first setval, so they cannot be overtaken.) New migration (CREATE OR REPLACE), additive.
- Oracle step: extend `scripts/pending/c54n/review/r3-m1-adversarial.mts` H1 to run each allocation inside an open transaction that
  inserts its row and sleeps 200 ms before commit, 32 concurrent × 100 rounds, under CPU load (e.g. a parallel `SELECT count(*) FROM
  generate_series(1,5e7)` per core) — assert 0 duplicate values per round and 0 P2002. Expected RED rarely; GREEN deterministically after
  the lock (then the race is structurally impossible, which is the real acceptance argument).

### H2b-3 · LOW · CONFIRMED · at-risk deals call a deal "past its expected close date" from 07:00 on the due day itself
- `src/lib/modules/crm/ai-bridges.ts:211` `if (d.expectedCloseAt.getTime() < now.getTime()) reasons.push("CLOSE_OVERDUE")`.
  `expectedCloseAt` is a **date** stored as 00:00 UTC of the Thai calendar day (`deals-shared.ts:313-329 thaiDayUtc`), i.e. 07:00 Thai.
- Scenario: deal with close date 2026-10-01 (stored 2026-10-01T00:00Z). At 2026-10-01 07:00–23:59 Thai the home "ดีลเสี่ยง" table
  (`home.tsx:340` → `CrmAiHomeAtRisk`), the AI tool `crm_deals_at_risk` and the "create task" proposals label it
  "เลยวันคาดว่าจะปิด" (`ai-bridges-shared.ts:37`), while the deal board says not overdue (`DealBoard.tsx:44` compares day keys,
  `expectedCloseAt < nowKey`). Between 00:00 and 06:59 Thai the same deal is not flagged — the label flips at an arbitrary hour.
  Also a deal whose only reason is this one enters the at-risk set (and the AI task proposals) a day early.
- Exposure: same code on origin/main (`ai-bridges.ts:190`), CRM v2 only ⇒ hidden on prod today.
- Fix: compare Thai day keys: `dayKey(d.expectedCloseAt) < thaiToday(now)` (helpers in `deals-shared.ts`), same rule as the board.
- Oracle step: `atRiskDeals({ now: 2026-10-01T03:00Z /*10:00 TH*/ })` with a deal closing 2026-10-01 and a fresh next activity ⇒ not in
  the result; closing 2026-09-30 ⇒ CLOSE_OVERDUE.

### H2b-4 · LOW · CONFIRMED · `custom.record.field_due` on a DATETIME field fires one Thai day early for values at 00:00–06:59 Thai
- `src/lib/modules/crm/automation.ts:1588-1593`: window `[thaiYmd(now+(d-7))T00:00Z, thaiYmd(now+d)T00:00Z + 1 day)`, written for DATE
  fields ("เก็บเป็นเที่ยงคืน UTC"). The trigger also accepts DATETIME fields (`:244`, picker list `:1785`), whose `valueDate` is the real
  instant (`member/fields.ts:649-655` stores `new Date(iso).toISOString()`).
- Scenario: object "สัญญา", DATETIME field `endsAt` = `2026-10-09T00:00:00+07:00` (midnight local — the natural value for an expiry; stored
  2026-10-08T17:00Z). Rule "7 วันก่อน". Daily run on 2026-10-01 (Thai): `to` = 2026-10-09T00:00Z ⇒ 17:00Z on the 8th is inside ⇒ the rule
  fires on 1 Oct, **8** Thai days before (payload `daysBefore: 7`, so any message built from it says 7). Values at 07:00–23:59 Thai fire on
  the right day, so the same rule is inconsistent across records. `d = 0` ("on the day") fires the evening before for midnight values.
- Exposure: origin/main has the same code (`automation.ts:241,1720`), v2 only ⇒ hidden on prod.
- Fix: for DATETIME fields build the window from Thai day starts (`thaiDayStart(ymd)`, as `crm.deal.close_due` does at `:1567-1568`) or
  normalise `valueDate` to its Thai day before comparing; make the dedupe key use `thaiYmd(valueDate)` instead of the UTC slice (`:1603`).
- Oracle step: DATETIME value `…T00:30+07:00` on day X, rule d=7 ⇒ candidate on day X-7 (Thai), none on X-8; DATE field unchanged.

### H2b-5 · LOW · CONFIRMED · portal shows DATETIME custom values as a bare UTC date (previous day for 00:00–06:59 Thai, time dropped)
- `src/lib/modules/crm/portal.ts:803` `if (v.valueDate) return v.valueDate.toISOString().slice(0, 10);` — used for every portal-visible
  record field (`getRecord` → `valueText`), DATE and DATETIME alike.
- Scenario: shared record field "นัดส่งมอบ" DATETIME `2026-10-09T00:00+07:00` (stored 2026-10-08T17:00Z) ⇒ the customer sees
  `2026-10-08`; `2026-10-09T09:30+07:00` shows `2026-10-09` without the time. DATE fields are correct (stored at UTC midnight).
- Exposure: origin/main `portal.ts:793`, portal is v2 ⇒ hidden on prod.
- Fix: pass the field type to `valueText` (already selected in `recordFields`) and format DATETIME in Asia/Bangkok
  (`Intl.DateTimeFormat("th-TH",{timeZone:"Asia/Bangkok",dateStyle:"medium",timeStyle:"short"})`); keep DATE as the UTC slice.
- Oracle step: portal record with a DATETIME field at `T00:30+07:00` renders the same Thai date as the staff record page.

### INFO
- **Cross-book first-posting wait (N fallback path).** In-transaction sequence creation holds a catalog unique-index entry until commit
  (R2-D). Two first postings of a system without sequences that need two books in opposite orders would deadlock (40P01, not caught by
  `account_jno_ensure`'s `unique_violation/duplicate_table` handler) and r2-n2 shows the message becomes "แจ้งผู้ดูแลระบบ". I found
  RECEIPTS→SALES (service payment + auto TI, `service.ts:2887` after the payment posting `gl.ts:873`) but no confirmed SALES→RECEIPTS
  path in one transaction, so not counted. Only systems outside the pre-created set that nobody opened in the UI/REST.
- **UTC date labels (cosmetic).** `crm/contacts.ts:2512` (CSV "created" column) and `crm/tracking-actions.ts:62` (`createdAtLabel`) print
  `toISOString().slice(0,10)` ⇒ items created 00:00–06:59 Thai show the previous date. Same class, display only.
- **D2 webhook fallback scan** is unindexed and cross-tenant by design — already registered (C6 register 1.4 / D2-N2), not re-reported.

## Looked at and found clean
C5.4-N:
- Identifiers: `account_jno_seq_name` → `[a-z0-9_]` or md5, ≤ 58 chars, built only via `%I`/`quote_ident`/`to_regclass('public.'||…)`;
  system ids carry no `_`, so `<id>_<book>` cannot collide across tenants; no user input reaches the dynamic SQL (`systemId` comes from
  the verified system). `search_path` pinned + `public.` everywhere; app calls resolve through the default search path to `public`.
- Allocation: nextval never rolls back (gaps only, P20) · EXISTS check keyed on `(systemId, docNo)` matches the real unique
  `@@unique([systemId, docNo])` · ≤1000 path uses only nextval (no backwards move) · NULL regclass re-ensured · error mapping (`gl.ts:338-377`).
  Book prefixes are distinct (`gl.ts:26-32`); the cross-book prefix case is the reviewer's H4 (registered).
- Floor regex `(^|\D)\d{1,18}$` + `substring … (\d{1,18})$`: 19+ digit tails ignored, 18-digit max < bigint max — no overflow/exhaustion;
  journal `docNo` is never user-supplied (`createManualEntry` has no docNo input; only `gl.ts` creates entries — grep).
- No caller of the old numbering left: `nextJournalNo` removed; only `commitEntry/reverseFor/reverseEntry` insert entries; manual-JV
  preview uses `peekJournalNo` (non-consuming, STABLE). Journal search exact-first is case-sensitive only on the exact branch (falls back
  to `contains … insensitive`). finance statement secondary sort = createdAt,id.
- Setup hooks: `loadAccountSystem` ensures after the tenant/type/permission checks; `requireAccountApi` only on `r.ok`; failures only log
  (fallback in-tx create). Purge drops sequences of every ACCOUNT system of the tenant (systems are only ever deactivated, never deleted —
  `actions/systems.ts:128`), before `purgeTenantRows`; re-run safe.
- Legal tail: every caller of `recordPaymentInTx` / `recordVendorPaymentInTx` / `issueWhtCreditCert` / `createPendingTaxInvoice` /
  expense `issueWhtCert` runs under `openDocNumbering` + `finalizeDocNos` (service.recordPayment, recordPaymentBatchInOneTx (group),
  cheque.recordPaymentWithChequeInOneTx, expense.recordVendorPayment/issueExpenseDoc, wht.issueWhtCreditCertStandalone/issueWhtCert);
  `payment.ts recordPayments/approveReceiptWithPayments` go through those wrappers. No event payload carries the deferred numbers before
  finalize (payment events carry ids; `account.invoice.paid` carries the invoice's own number). Group ordering (systemId, enum order,
  periodKey) is total; `WHT_CERT` "YYYY-MM" < "WTI:YYYY-MM" consistently. Reservation = `INSERT … ON CONFLICT DO UPDATE lastNo+k` (race
  on the first row of a period safe); stamp count checked.
- N-1 `seriesMatcher` mirrors `formatDocNo` token-for-token (unknown tokens literal both sides); WHT_CERT is not shop-configurable
  (`settings-schema.ts:14`) and defaults to MONTH ⇒ the 50 ทวิ register keeps `WHT-YYYY-MM-NNNN`; WTI/50 ทวิ UTC→Bangkok month switch
  cannot collide (an old UTC-month number always has its own counter row; different `ym` ⇒ different string).
C5.4-D2:
- Tokens: HMAC key = `crm-email-token:v1:`+SESSION_SECRET (domain-separated from private-file/member-card keys), message
  `<hex id>|<o|c|u>|<index>` unambiguous, 192-bit truncation; no fallback key; old random tokens still resolve by stored hash.
- Redelivery: prior found by system-scoped `messageId`; contact, direction, no attachments, body present; RECIPIENT_CHANGED compares bare
  addresses; claim CAS `status FAILED & providerId null`; hashes written only at SENT; `routing.amb` set on every non-definite failure
  and by the reaper; REDELIVERY_EXPIRED only for ambiguous rows; FROM_DOMAIN_UNVERIFIED tenant-scoped (`verifiedDomains(tenantId)`);
  fingerprint built by the same `outgoingRequest` used to send (bcc = stored `bccAddrs`, same header order). Refusals are sticky and end
  as SKIPPED steps (not counted), as designed.
- Webhook fallback: Svix-verified, only 4 event types, only `@shark.in.th` ids, OUT rows with `routing.fromAddr` (BCC-capture rows have
  routing NULL), exactly one hit, event `from` must equal the row's sender, providerId back-fill CAS on NULL; delivered-by-fallback only
  flips SENT. A late bounce on a row being redelivered sets BOUNCED unconditionally and the redelivery's QUEUED→SENT CAS then no-ops
  (pre-existing behaviour of `deliver`, contact still marked bounced — acceptable).
- Sequences F4: wait episode key (version, step, kind) with COALESCE start; cap ceiling 72 h → STOPPED FAILED + log + finished + audit in
  one tx; in-flight 24 h → normal failure path without clearing the episode; `clearWaits` on advance, failure and resume.
- Portal wakes: only after the write succeeded; `wakeOutbox` coalesced (`core/after-drain.ts`); unauthenticated-trigger cost = one
  coalesced drain (registered N5/L55-5 area).
- No money arithmetic in D2.
Lens (clean samples): `limits.ts` Thai day/month starts; `quotas-shared.ts` Thai months; `commissions-shared.ts` period keys;
`reports.ts:304-305,415` range on UTC-midnight dates and `+7 hours` month grouping; `reports-shared.ts reportSlotOf` (ISO weekday from
the day key); `sequences-shared.ts` send window/business days/holidays (validated from < to, 400-day guard); `crm.deal.close_due` window
(`automation.ts:1565-1575`) and DATE-type `field_due`; `privacy.ts monthsBefore` and the report-export expiry SQL; `brief.ts:125`;
`notify-senders.ts:243`; `scoring.ts:1092`; `deals-shared.ts` day keys.

## Could not check
- Nothing executed (QC3 lacks the N migration and the lens findings are deterministic): H2b-2 is derived from statement order, not
  reproduced; H2b-1 depends on prod role layout (unknown from here — `.env` not read by rule).
- Whether any single transaction posts SALES before RECEIPTS (needed to turn the INFO cross-book wait into a finding).
- Resend semantics assumed by D2 (same key + same body ⇒ original 200 + id; stored error replay) — owner P19/N6 item, not checkable offline.
- UI-side rendering of DATETIME values in staff CRM pages (assumed correct via the member fields engine `toISOString`) and the mobile app.
- Session stopped ~12:20 UTC.

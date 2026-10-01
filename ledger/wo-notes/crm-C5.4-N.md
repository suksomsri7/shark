# C5.4-N — journal-voucher numbering race (R9-7 / R10-9 / R11-2) — design + oracle (test author · no product code)

Tree: detached 63ea9f45 (full C5.4-C money batch) · QC2 only · owner decision **P20 (a)**: JV numbers may have gaps (database sequence);
legal documents (tax invoice, receipt, WHT certificate, purchase tax invoice) stay gapless.
Files: `scripts/pending/c54n/qc-numbering.mts` (oracle) · `scripts/pending/c54n/probe-legal-counters.mts` (probe) · logs `/tmp/c54n-logs/`.

## 0. Measured facts this design rests on

- **JV race (hunter Q3, re-measured by the probe):** `gl.ts:290-303` `nextJournalNo` = `count + 1`.
  - `recordPayment` with WHT failed 40/60 (P3), the auto-TI path 40/60 (P4) and the 50 ทวิ path 40/60 (P5) under 3 concurrent actors. Every raw error was `P2002` on `AccountJournalEntry(systemId, docNo)`, and the user saw `บันทึกชำระไม่สำเร็จ` / `บันทึกจ่ายไม่สำเร็จ`.
- **Legal counters (`AccountDocSequence`) never collide and never gap on rollback** (probe M1/M2/P1–P6):
  - 3 actors ×20 with a 25 % induced rollback: 45 committed → numbers 1..45, counter = 45. This holds for both the raw `INSERT … ON CONFLICT DO UPDATE` (`doc-numbering.ts:228 reserveSeq`) and the Prisma `upsert({increment})` shape (`wht.ts:216/314`, `product.ts:676`), including the race for the first row of the period.
  - WTI numbers stayed 1..20 gapless even though 40 of the 60 transactions rolled back after reserving.
- **But a legal counter is a row lock held until commit.** The counter is also taken late, after the first posting:
  - `service.ts:2951` (auto TI inside `recordPaymentInTx`)
  - `wht.ts:154` (WTI)
  - `expense.ts:1278` (50 ทวิ)
  - `expense.ts:1043` (purchase TI)
  - Probe M3: a holder kept open 3 s made the next issuer wait 2.76 s.
  - **Probe H:** a 40-child ON_PAYMENT cheque batch took 18.1 s. A bare `FOR UPDATE` on the TAX_INVOICE counter row, started at +2 s, waited **16.1 s**, i.e. until the batch committed. A concurrent single service payment also waited 16.1 s, then died with P2002 (journal number). The same payment alone takes 0.8 s.
  - ⇒ Fixing JV numbers alone leaves every tax-invoice issuer of the shop blocked for the whole length of a big service batch.
- **NEW pre-existing bug N-1 (probe P5):** the vendor 50 ทวิ series of a month started at **21**, not 1 (`WHT-2026-10-…` n=20 max=40, numbers 1–20 missing).
  - Cause: `issueDocNo` (`doc-numbering.ts:254`), when the period row does not exist yet, starts from `legacyMaxSeq` (`:187`). That scans every `WHT_CERT` document of the month and does not filter by series, so the customer-side WTI certificates (`WTI-202610-0001..0020`, same docType `WHT_CERT`) count.
  - Effect: a legal series has a gap whenever a WTI is issued before the month's first 50 ทวิ.
- **Read-only, not measured:**
  - `wht.ts:215/311` build the WTI/WHT period from `date.getFullYear()/getMonth()`, which is the server time zone (UTC). Between 00:00 and 06:59 ICT on the 1st, certificates are numbered in the previous month's series. This is the same trap `doc-numbering.ts` header fixed for the other documents.
  - Two different generators write the vendor `WHT_CERT` row for period "YYYY-MM": `expense.ts` via `issueDocNo` (Bangkok month) and `wht.ts nextWhtCertNo` (UTC month). They share one counter row, but on the first night of a month each uses a different row.
- **Hunter correction:** the default Prisma interactive transaction is 30 s timeout / 10 s maxWait (`src/lib/core/db.ts:29`), not 5 s / 2 s. Batches use 40 s / 20 s (`service.ts:3049`); `voidPaymentBatchInOneTx` uses 60 s.
  - So a cashier blocked behind a batch fails at 30 s, not 5 s. In probe H the cashier failed on the P2002 first.
- **Readers of the JV number** (read-only sweep of src/scripts/docs/skills): every entry is created by `gl.ts` `commitEntry:246` / `reverseFor:907` / `reverseEntry:985`, all through `nextJournalNo`. Nothing parses the number, gap-checks it, assumes its width or derives a period from it. The places that need care:
  - `src/app/app/sys/[id]/account/journal/page.tsx:80` calls `nextJournalNo(ctx,"GENERAL",now)` as the **manual-JV modal preview**. With a consuming allocator this would burn a number on every modal open, so it must become a non-consuming peek.
  - `finance.ts:823` `financeStatement` uses `orderBy … { entry: { docNo: "asc" } }` as the secondary sort within a day. It is a text sort, so `…-10000` sorts before `…-9999`. Change it to `createdAt, id`; the running balance does not depend on it.
  - `journal-v2.ts:223` searches with `docNo contains q`. A full number `SV-2026-10-1234` also matches `…-12345` once numbers pass 9999. Recommended: exact match first, then contains (QC `qc-acc-v2-journal.mts:114` T2.2 expects total = 1).
  - These are display-only, opaque string pass-through:
    - journal list / print / detail
    - ledger (`coa.ts:458,742`)
    - REST (`serialize-gl.ts:195,227,154,254,547`, `serialize-finance.ts:86,243`, `serialize.ts:202`)
    - CSV (`gl-read.ts:302`, `finance-read.ts:155`)
    - PP30 (`reports.ts:502-568`, where the JV number is the "document number" of untied VAT lines)
    - reconcile labels / audit (`reconcile.ts:424-471,671,714`)
    - journal actions audit (`journal/actions.ts:72-99`)
    - fixed assets (`asset-v2.ts:87-107`)
    - AI tools (`skills.ts:72,78`, through the REST serializers)
    - docs (`ACCOUNT-API.md:626`: "Free text: journal number or memo")
  - No OpenAPI/skill text documents a format.

## 1. Recommended design

### 1a. Journal-voucher numbers: one Postgres SEQUENCE per (system, book), with the display format unchanged

- **Allocation:** `n = nextval(acc_jno_<systemId>_<book>)`. It is non-transactional, never waits and never collides. Gaps after a rollback are allowed (P20).
  - Use `CACHE 1`, so numbers rise in allocation order across pooled connections. That is the N2 "monotonic per allocation" contract; CACHE > 1 would break it.
- **Display (unchanged shape):** `<SV|PV|RV|PY|JV>-<yyyy>-<mm>-<n padStart 4>`.
  - The prefix comes from `BOOK_PREFIX`. `yyyy-mm` is the entry's Bangkok period, as today: the same `bkkPeriod(date)` that sets `periodKey`.
  - `n` is per (system, book) and **does not reset monthly**. October's first SV can be `SV-2026-10-0153`. This is documented and accepted under P20. The width grows past 4 digits naturally.
  - Why not per period: a sequence per (system, book, month) means DDL every month inside money transactions.
  - Why not one global sequence: tenants would see numbers jump by other tenants' volume (a business-volume leak and confusing).
  - Why not one per system: every book would show gaps from the other books' postings.
- **Where it is created:**
  1. The migration pre-creates all 5 books for every system that has a chart of accounts (`AccountLedger`).
  2. A SQL function lazily ensures the sequence at first allocation for systems created later. It computes the floor at creation from existing rows, so a book whose rows predate its sequence continues above them; this is oracle N4b.
  - Do **not** pre-create at `createSystem`/seed time with a floor of 0; that path is not tested by N4b.
  - A brand-new system's first posting does DDL inside its transaction, once per system and book. Two concurrent first postings of a brand-new system can fail once with 23505; this is accepted and rare.
- **Code changes** (builder; `gl.ts` only, plus the page):
  - `nextJournalNo` → `SELECT account_next_journal_no($systemId, $book)`, then format. The `count + 1` query is deleted.
    - Keep the export name or rename it to `allocateJournalNo`. Every caller (`commitEntry`, `reverseFor`, `reverseEntry`) is in gl.ts.
  - New `peekJournalNo(ctx, book, date)` → `SELECT account_peek_journal_no(...)`, which reads the sequence and writes nothing. `journal/page.tsx:80` must call it.
    - Oracle N5-preview finds whatever function the page calls and checks that three calls do not move the next number.
  - `finance.ts:823`: change the secondary sort to `createdAt, id` (recommended).
  - `journal-v2.ts:223`: exact match first (recommended).
  - The lock-order comment in `service.ts:15-17` ("nextJournalNo inserts a unique journal number, so …") becomes false and must be rewritten (see §2).
  - System deletion should call `account_jno_drop(systemId)`. QC teardowns delete systems by raw SQL, so add an orphan-sequence sweeper (sequences whose system id no longer exists) to the QC cleanup tooling. The oracle drops its own.

### 1b. Legal documents: gapless counter rows kept, but reserved **at the tail** of the transaction

The task offered (A) "reserve before the first posting under a per-(system, docType) advisory xact lock" or (B) "assign the number in a separate step after commit". **I pick a third placement of (A): reserve in the same transaction, as its LAST lock.** Why:

- Gapless needs the reservation to live and die with the transaction, so the counter is held until commit whatever its position.
  - Taking it *before the first posting* holds it for the whole transaction. In probe H that is 16 s for a 40-child service batch, so every other tax-invoice issuer waits 16 s (N6 fails, < 2 s required).
  - With JV numbers on a sequence, a posting no longer takes any lock, so "before the first posting" no longer buys cycle-freedom.
- What matters is (1) the counters are the last locks taken, so no cycle is possible, and (2) they are held only for the tail.
  - At the tail the hold is about one statement plus the number-stamping UPDATE plus commit: well under 2 s.
- No advisory lock is needed: the `AccountDocSequence` row already is the per-(system, docType, period) lock.
- Not (B):
  - ISSUED tax invoices and certificates would exist without a number for a while.
  - `account.document.issued` webhooks, `whtCertNo` / `certNos` in the API results and prints would need a "pending number" state.
  - It needs a sweeper (outbox consumer) for a crash between commit and assignment.
  - That is more moving parts for the same gapless result.

**Mechanics:**
- `doc-numbering.ts`: new `deferDocNo(tx, { docId, docType, date, fallbackPrefix })` records a pending number on a per-transaction registry: a `WeakMap<TransactionClient, Pending[]>`, or an explicit `NumberingScope` object passed down.
- `finalizeDocNos(tx)`:
  - Groups the pending documents by (docType, periodKey).
  - Visits the groups in a **fixed order: docType enum order, then periodKey**.
  - For each group, reserves k numbers in ONE statement: `INSERT … ON CONFLICT DO UPDATE SET "lastNo" = "lastNo" + k RETURNING "lastNo"`, giving the range `[last-k+1, last]`. `startNo` comes from a **series-aware** `legacyMaxSeq` (fix N-1: count only docNos of the same series/prefix).
  - Stamps the numbers in creation order with one `UPDATE "AccountDocument" … FROM (VALUES …)`.
  - Returns `docId → docNo`.
- **Paths that create legal documents inside money transactions** create them with `docNo: null` and call `deferDocNo`:
  - `issueServiceTaxInvoice` (`service.ts:2951`)
  - `issueWhtCreditCert` (`wht.ts:154`, which then goes through `issueDocNo`/`deferDocNo` with the `WTI:` period key)
  - `expense.ts issueWhtCert` (`:1278`)
  - `createPendingTaxInvoice` (`expense.ts:1043`)
  - `wht.ts issueWhtCert`'s `nextWhtCertNo` (`:305`), which becomes the same helper with a Bangkok month
- **Every wrapper that opens such a transaction** calls `finalizeDocNos(tx)` as its last statement, then emits the events that carry numbers:
  - `recordPayment`
  - `recordPayments` / `approveReceiptWithPayments` (`payment.ts`)
  - `recordPaymentBatchInOneTx` (after `syncGroupHeadInTx`)
  - `recordVendorPayment`
  - `issueExpenseDoc`
  - `issueWhtCreditCertStandalone`
  - the `wht.ts` 50 ทวิ register issue
  - `issueDocument`, for its own number (phase 2, below)
  - `emitDocumentIssued` for these documents and `whtCertNo` / `certNos` in the results must read the finalized map.
  - Guard: `deferDocNo` on a transaction with no registry throws, so a forgotten wrapper fails loudly instead of leaving an unnumbered tax invoice. The oracle wraps `recordPaymentInTx` in a bare `$transaction` in N7 and only needs a rollback, so a throw there is fine.
- **Phase 2** (same card, can land second): the document's *own* number in `issueDocument` (`service.ts:2395`) and `issueExpenseDoc` (`expense.ts:985`) is taken today **before** `postDocument`, which may then lock inventory / deposit / credit-chain rows. Move it to the tail too, so that "the counter is the last lock" holds everywhere.
- **TZ fix** (same card, small): `wht.ts:215/311` use `bkkParts`. Vendor WHT has one generator (`issueDocNo`).

### 1c. What v1/legacy callers see

POS (`pos/account-bridge.ts` → `applyExternalSale`), inventory (`inventory/account-bridge.ts` → `postInventoryGl`), payroll (`hr/payroll.ts` → `postPayrollJV` / `reverseEntry`), gift cards, expense approvals (`expense.ts`), reconcile (`postBankReconcileEntry`), finance openings and transfers, and asset depreciation/dispose all post through `gl.ts`:
- They get sequence numbers automatically and need no call-site change.
- None of them reads the number back except through the readers listed in §0.
- None of them creates legal documents inside its transaction, except POS `TAX_INVOICE_ABB`. That number comes from POS, not `AccountDocSequence`; it is out of scope and listed as an open question.

## 2. Lock order after the change (replaces the `service.ts:5-18` header)

```
1. AccountCheque rows ↑id
2. auto tax invoices ↑id (existing, being un-paid)
3. documents ↑id
4. group heads ↑id
5. payment rows (CAS)
6. postings (gl commitEntry / reverseFor) + any pre-existing row a posting path touches (inventory, deposits, statement lines,
   finance/asset rows, coupons, the original entry in reverseFor) — journal numbers come from nextval: no lock, never waits
7. LEGAL COUNTERS — AccountDocSequence rows, ↑(docType enum order, periodKey), one UPSERT per group — the LAST lock of the
   transaction; after it the transaction only UPDATEs rows it created itself and INSERTs outbox rows, then commits
```

**Proof that step 7 adds no cycle:**
- Take a wait-for edge X → Y where X waits on a counter row c that Y holds.
- Y holds c, so Y is in step 7. From there Y can only wait on a counter c′ with c′ > c (fixed order).
- Y never waits on its own rows: they were created by Y, so they are uncommitted and invisible to others, and no other transaction can lock them.
- Y never waits on outbox inserts either. Their unique `idempotencyKey` can only conflict with the same logical event, and the doc locks of steps 3–5 already serialise that.
- So every path that leaves X through a counter runs along strictly increasing counters and ends at a transaction that waits on nothing. **No cycle passes through a counter.**
- Cycles made only of row locks in steps 1–6 are pre-existing (the hunter's violator list) and unchanged by this card.
- The R10-2 cycle came from step 6's unique journal number, which made others wait. It disappears because nextval never waits. Step 4 stays where it is; that is harmless.

**Remaining system-wide wait (not fixed here):**
- `ensureAccounting` (`gl.ts:309`) inserts the month's `AccountPeriod` row inside the money transaction. On the first posting of a month, a concurrent first posting waits for that transaction's commit on the unique key, up to a batch's length, once per month.
- Recommended: create the period row in its own autocommit statement before opening the money transaction. Open question Q3.

## 3. Migration (ADDITIVE · idempotent · no table rewrite · no renumbering · no Prisma schema change)

`prisma/migrations/2026110400000x_account_journal_no_sequence/migration.sql` (builder picks the timestamp after `20261103000000_crm_perf_indexes`):

```sql
-- C5.4-N — journal-voucher numbers from a sequence per (system, book). Existing rows are NOT renumbered.
CREATE OR REPLACE FUNCTION account_jno_seq_name(p_system text, p_book text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT 'acc_jno_' || CASE WHEN p_system ~ '^[a-z0-9]{1,40}$' THEN p_system ELSE md5(p_system) END || '_' || lower(p_book)
$$;

-- highest numeric suffix already used by this (system, book) in ANY period (sequence numbers do not reset monthly)
CREATE OR REPLACE FUNCTION account_jno_floor(p_system text, p_book text) RETURNS bigint
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(MAX((substring("docNo" FROM '(\d+)$'))::bigint), 0)
  FROM "AccountJournalEntry"
  WHERE "systemId" = p_system AND "book" = p_book::"AccountJournalBook" AND "docNo" ~ '\d+$'
$$;

CREATE OR REPLACE FUNCTION account_jno_ensure(p_system text, p_book text, p_margin bigint DEFAULT 0) RETURNS regclass
LANGUAGE plpgsql AS $$
DECLARE n text := account_jno_seq_name(p_system, p_book); r regclass; f bigint;
BEGIN
  r := to_regclass(quote_ident(n));
  IF r IS NOT NULL THEN RETURN r; END IF;
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I AS bigint MINVALUE 1 START WITH 1 CACHE 1 NO CYCLE', n);
  f := account_jno_floor(p_system, p_book) + GREATEST(p_margin, 0);
  IF f > 0 THEN PERFORM setval(quote_ident(n), f, true); END IF;   -- next nextval = f + 1
  RETURN to_regclass(quote_ident(n));
END $$;

CREATE OR REPLACE FUNCTION account_next_journal_no(p_system text, p_book text) RETURNS bigint
LANGUAGE sql AS $$ SELECT nextval(account_jno_ensure(p_system, p_book)) $$;

-- non-consuming preview for the manual-JV modal
CREATE OR REPLACE FUNCTION account_peek_journal_no(p_system text, p_book text) RETURNS bigint
LANGUAGE plpgsql STABLE AS $$
DECLARE r regclass := to_regclass(quote_ident(account_jno_seq_name(p_system, p_book))); v bigint; c boolean;
BEGIN
  IF r IS NULL THEN RETURN account_jno_floor(p_system, p_book) + 1; END IF;
  EXECUTE format('SELECT last_value, is_called FROM %s', r) INTO v, c;
  RETURN CASE WHEN c THEN v + 1 ELSE v END;
END $$;

CREATE OR REPLACE FUNCTION account_jno_drop(p_system text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE b text;
BEGIN
  FOREACH b IN ARRAY ARRAY['SALES','PURCHASES','RECEIPTS','PAYMENTS','GENERAL'] LOOP
    EXECUTE format('DROP SEQUENCE IF EXISTS %I', account_jno_seq_name(p_system, b));
  END LOOP;
END $$;

-- pre-create for every system that has a chart of accounts. Margin 100 for systems active in the last day absorbs count+1
-- numbers that old code may still hand out between this migration and the code deploy (one-time visible jump, documented).
DO $$
DECLARE s record; b text; m bigint;
BEGIN
  FOR s IN SELECT DISTINCT "systemId" AS id FROM "AccountLedger" LOOP
    m := CASE WHEN EXISTS (SELECT 1 FROM "AccountJournalEntry" e WHERE e."systemId" = s.id AND e."createdAt" > now() - interval '1 day') THEN 100 ELSE 0 END;
    FOREACH b IN ARRAY ARRAY['SALES','PURCHASES','RECEIPTS','PAYMENTS','GENERAL'] LOOP
      PERFORM account_jno_ensure(s.id, b, m);
    END LOOP;
  END LOOP;
END $$;
```

- The legal-document side needs **no migration**. `AccountDocument.docNo` is already nullable and `AccountDocSequence` is unchanged.
- **Rollout:**
  1. Apply the migration. Old code ignores it.
  2. Deploy the code.
  3. Nothing is backfilled or renumbered. Existing numbers and the per-period display of old rows stay as they are.
- **Rollback:** old code returns to `count + 1`. It cannot collide with new numbers until its count reaches the sequence values, which sit above the old max.
- **Prisma:** no `schema.prisma` change, so `prisma generate` is not needed. Never `migrate dev` on prod. The house rule "migration first, then code" still applies.

## 4. Acceptance oracle — `scripts/pending/c54n/qc-numbering.mts` (12 checks)

| id | contract (short) | today (expected) |
|---|---|---|
| N1a | goods shop, hunter Q3 mix (15+5 singles · six 5-child cheque batches · one 40-child), 27/27 ok, raw P2002/40P01/timeout = 0, +90 payments | RED (race) |
| N1b | same mix, ON_PAYMENT invoices + 3 % WHT (auto TI + WTI each), singles show their WTI number | RED (race) |
| N2 | JV unique per system · format `<SV\|PV\|RV\|PY\|JV>-yyyy-mm-n≥4` with prefix = book, yyyy-mm = period · monotonic per allocation · gaps reported (allowed) | likely GREEN (guard) |
| N3-ops | legal docs 3 actors ×20 per kind (TI · receipt · WTI · 50 ทวิ · purchase TI): 300/300 ok | RED (race on the WTI / 50 ทวิ paths) |
| N3-numbers | every issued legal doc of the run numbered, unique, gapless per series from 1, counter = max | RED: **N-1** (50 ทวิ series starts after the WTI max) — fix is in scope (series-aware `legacyMaxSeq`) |
| N4a | rows created before the concurrent phases keep their numbers | GREEN (guard) |
| N4b | book with legacy rows numbered above its row count (`RV-…-0002` with 1 row, etc.) → new postings succeed, no reuse | RED (count+1 collides) |
| N5 | readers show the stored number: search exactly 1 hit · REST journalRow/journalDetail(+reversal) · general ledger · finance statement · doc JV tab | GREEN (guard) |
| N5-preview | the function `journal/page.tsx` calls for the modal preview does not consume (3 previews → post = preview) | GREEN today; RED if the builder points the page at the allocator |
| N6 | during a 40-child service batch (40 TI + 40 WTI), a goods single and a service+WHT single each wait < 2 s more than alone; all ok | RED (race + TI counter held ~16 s) |
| N7 | a transaction failing after its payment + TI + WTI (and a vendor one after its 50 ทวิ) consumes no legal number (next = prev + 1); JV gap reported | GREEN (guard for the tail design) |
| N8 | CLEAN: tenants, rows and sequences named after this run's system ids (the oracle drops its own) | GREEN |

- N6 measures "wait" as latency minus the median of 3 sequential runs of the same payment. Neon latency noise could make it flaky; if it does, the controller may raise the margin through an ORACLE-EDIT. The bare `FOR UPDATE` on the TI counter row is printed as information only.

### Suites that pin journal numbers today — ORACLE-EDITs the builder will need (listed, not applied)

- **OE-1** `scripts/qc-acc-v2-journal.mts:114-115` (T2.2) `listJournalPaged({q: docNo}).total === 1`.
  - Holds while numbers are below 10000.
  - It only breaks if `contains` stays and numbers pass 9999. Keep it, and make the search exact-first (recommended code change). No edit is needed unless the builder keeps `contains`.
- **OE-2** `scripts/fixtures/acc-v2/kbank-2026-08.csv:2-7`, `kbank-2026-09.csv:2-10`, `kbank-preview-sample.csv:4`, `kbank-2026-09.expected.json:18` (and its copy in `scripts/acc-v2-expected.json:478`) hold literal `RV-2026-09-0004`-style numbers.
  - The matching ignores them, so nothing breaks; the text goes stale after a reseed.
  - The generator `acc-v2-fixture-bank-statement.mts:156` sorts by `date, docNo` text. Change it to `date, createdAt` when regenerating.
- **OE-3** `scripts/qc-account-deep.mts:76` writes `docNo "JV-QC-1"` directly into a previous period.
  - It is unaffected, because the floor regex `\d+$` reads it as 1 for GENERAL. Nothing needs to change.
- **OE-4** the type-only checks need no change: `qc-account-api-write-gl.mts:71,83,123,131`, `qc-account-api-read-gl.mts:79,90,149`, `qc-account-api-read-docs.mts:122`, `qc-account-api-read-finance.mts:70`, `qc-acc-v2-journal.mts:230`.
- **OE-5** QC suites that delete only some of a system's entries are listed in `ledger/AUDIT-2026-09-16-MEMBER.md:110`: `qc-account-cpa.mts:142,227`, `qc-acc-v2-mobile.mts:87,435`, `qc-member-m2.6.mts:370`, `qc-member-fix-s2.mts:621`, `qc-member-m3.3.mts:373`.
  - Under count+1 they could collide; under the sequence they cannot.
  - Their teardowns leave per-system sequences behind on QC DBs. Add an orphan sweeper (§1a), not a suite edit.
- The service.ts lock-order comment and `docs/sds/modules/account.md:23,74` must be rewritten. They are documentation, not oracles.

## 5. Open questions

- **Q1 (owner):** the JV counter no longer resets monthly (`SV-2026-11-0153` after `SV-2026-10-0152`). Is that OK? The alternative of one sequence per month costs DDL every month inside money transactions (not recommended).
- **Q2 (controller):** phase 2, moving `issueDocument` / `issueExpenseDoc` own numbers to the tail. Same card, or a follow-up? Phase 1 alone already makes N1/N3/N6 GREEN.
- **Q3:** the monthly `AccountPeriod` creation inside money transactions (§2). Fix here, or note only?
- **Q4:** POS `TAX_INVOICE_ABB` numbering was not reviewed.
- **Q5:** the margin of 100 for recently active systems in the migration. Is a one-time visible jump acceptable, or should the deploy run at a quiet time with margin 0?

---

## HANDOFF CHECKPOINT (1 Oct)

The session ended on the controller's order: the owner is moving machine/account. State at the stop:

- **Done:**
  - The design (§1–§3) and the migration SQL draft (§3). The SQL has not been executed anywhere.
  - The oracle `scripts/pending/c54n/qc-numbering.mts`: 12 checks, N1a–N8. Only the syntax has been checked (esbuild transform); it has **never been run**.
  - The probe `scripts/pending/c54n/probe-legal-counters.mts`: **ran to completion** on QC2 against 63ea9f45 (rc=0, `CLEAN left=0 tenant=0`). Log: `/tmp/c54n-logs/probe-legal-counters.log`. The systemd unit `c54n-probe-<epoch>` has finished. Results are in §0 (M1–M3, P1–P6, H).
  - `/tmp/c54n-logs/run1.sh` is ready (`bash -n` ok) and has **not been launched**. It writes `/tmp/c54n-logs/RED.log` and appends `EXIT rc=$rc`.
- **Not done:** the RED run of the oracle.
- **Next steps, in order:**
  1. Launch the RED run in its own unit (the oracle takes roughly 15–25 min):
     `systemd-run --quiet --unit=c54n-red-$(date +%s) --collect --working-directory=/root/projects/shark-crm-c54c --setenv=PATH="$PATH" --setenv=HOME=/root -p MemoryMax=4G bash /tmp/c54n-logs/run1.sh`
  2. Read `RED.log`. Expect RED on N1a, N1b, N3-ops, N4b and N6 for the race (raw `P2002 journal no.`), and on N3-numbers for N-1. Expect the guards GREEN: N2, N4a, N5, N5-preview, N7, N8.
  3. If a check is RED because of setup (a `check ran … threw`), fix the oracle and re-run. Known risk points:
     - `pay.recordPayments` result fields (`certNos`)
     - the `createManualEntry` line accounts (`CASH` mapping + bank ledger)
     - the `listJournalPaged({q})` default date range: if it applies a this-month default, the search still works, because entries are made today
     - `world("b")` creating legacy entries before `saveSettings`
  4. Update the §4 "today" column with the measured tallies. Add the RED tally to the handback.
- **Git:** one local commit of `scripts/pending/c54n/**` and this note, with no push. The modified `scripts/*-expected.json` (QC2 seed ids) are not committed.

---

## Builder (1 Oct 2026) — checkpoints

Tree: `/root/projects/shark-crm-c54c` detached on 96a4c28f · QC2 only · logs `/tmp/c54n-logs/` (copy kept in `.qc-shots/c54n-logs/`).
Controller rulings taken: P20 (a) · Q1 no monthly reset (**owner Q1 pending, default taken** — the decision lives in ONE function, `gl.ts journalNoDisplay`) ·
Q2 phase 1 + N-1 only (phase 2 = follow-up entry below) · Q3/Q4 note only · Q5 margin 100 accepted.

### CP-1 · RED on base (96a4c28f) — `RED.log` · 6/12 · no oracle setup fix needed (no "check ran … threw")
- ❌ N1a: single 11/20 · 5-child 1/6 · 40-child 0/1 · raw P2002 journal no. ×9 (+6 Thai-wrapped) · payments +16
- ❌ N1b: single 7/20 · 5-child 0/6 · 40-child 1/1 · raw P2002 journal no. ×13 · payments +47
- ❌ N3-ops: TI 60/60 · receipt 60/60 · WTI 20/60 · 50 ทวิ 20/60 · purchase TI 60/60 · raw P2002 journal no. ×80
- ✅ N7 · ✅ N5 · ✅ N5-preview · ✅ N2 (831 entries) · ✅ N4a · ✅ N8
- ❌ N6: batch ok 20.8 s · both singles 0/1 · extra wait goods 18.9 s / service 18.5 s · raw P2002 ×2 · bare FOR UPDATE on the TI counter waited 17.8 s
- ❌ N4b: results ok/FAIL, FAIL/FAIL ×3 · raw P2002 journal no. ×4
- ❌ N3-numbers: `WHT_CERT:WHT-2026-10- gaps [1]` (N-1)
- BEFORE measurements (base, separate snapshot worktree `/root/projects/shark-crm-c54n-base` so src edits cannot leak in): `before-q3.log` (probe-r11a ONLY=Q3) · `before-deadlock.log` (trace-r10-2 ROUNDS=40) — running.

### CP-2 · BEFORE numbers (base 96a4c28f, snapshot worktree) + migration on QC2 + code written
- BEFORE race (`before-q3.log`, probe-r11a ONLY=Q3): sequential 5/5 · 2/2 · 1/1 → round 1: singles **7/20**, 5-child 5/6, 40-child **0/1**, raw P2002 journal no. ×13 · round 2: singles **4/20**, 5-child 6/6, 40-child **0/1**, raw P2002 ×16.
- BEFORE deadlock (`before-deadlock.log`, trace-r10-2 ROUNDS=40): ok|ok 40/40 · raw {} · cycles 0.
- Migration `prisma/migrations/20261104000000_account_journal_no_sequence` applied to **QC2 only** (`iso.sh qc2.sh qc-prisma.sh migrate deploy`; qc-prisma.sh allows ep-cool-shadow, refuses ep-royal-night) → `migrate-deploy-qc2.log`.
  Sanity (`scripts/pending/c54n/check-jno-fns.mts`): 5310 `acc_jno_*` sequences for 1061 systems with a chart (+1 system that posted lazily meanwhile) · fake system: peek 1 → next 1, 2 → peek 3/3 · drop leaves 0 · 428 ms.
- Code (phase 1 + N-1): gl.ts `allocateJournalNo`/`peekJournalNo`/`journalNoDisplay` · journal/page.tsx → peek · finance.ts statement sort `date, createdAt, id` ·
  journal-v2.ts exact-first search for a full journal number · doc-numbering.ts `seriesMatcher` + series-aware `legacyMaxSeq` (N-1) + tail registry
  `openDocNumbering`/`deferDocNo`/`finalizeDocNos` · deferred: service auto TI, wht WTI (+Bangkok month), wht 50 ทวิ register (now the
  configured WHT_CERT series = same generator as expense.ts, Bangkok month), expense 50 ทวิ + pending purchase TI · wrappers finalize last:
  recordPayment, recordPaymentBatchInOneTx (+`docNos`), cheque.recordPaymentWithChequeInOneTx, expense.recordVendorPayment/issueExpenseDoc,
  wht.issueWhtCreditCertStandalone/issueWhtCert · `recordPaymentInTx` now returns `whtCertDocId` (no number inside the tx) · pdpa tenant purge
  drops the system's sequences · QC sweeper `scripts/sweep-jno-orphans-qc.mts` (dry run by default) · service.ts LOCK ORDER header = §2 · docs/sds/modules/account.md.
- Next: typecheck → GREEN oracle run.

### CP-3 · GREEN 12/12 (`GREEN1.log`) · fitness 33/33 ×2 · typecheck: src clean
- N1a 20/20 · 6/6 · 1/1 · raw {} · +90 (15 s) · N1b same (23 s) · N3-ops 300/300 raw {} · N6 batch 19.6 s, singles 21+21 ok, extra wait goods 13 ms / service 181 ms,
  bare FOR UPDATE on the TI counter 28 ms (was 17.8 s) · N4b 4×ok/ok + manual, SV continues at 0042 above legacy 0041 · N2 1141 entries, 2 skipped (allowed) ·
  N3-numbers 616 docs, every series 1..max gapless (WHT 1..62 — N-1 gone) · N5/N5-preview (page → `peekJournalNo`) · N7 · N4a · N8 (0 sequences left).
- N7 note: the oracle's bare `$transaction` around `recordPaymentInTx` now fails at the `deferDocNo` guard (no `openDocNumbering`) before its own
  QC-INDUCED throw — rolls back, consumes nothing (as the design anticipated). If the controller wants N7 to exercise "failure after the numbered
  documents were written" literally, an ORACLE-EDIT would call `openDocNumbering(tx)` first; not applied (test author's file).
- typecheck-1: only 2 errors, both in the test author's probe `scripts/pending/c54n/probe-legal-counters.mts` (implicit any, present on 96a4c28f) —
  fixed with `(n: string | null)` (probe, not the oracle).
- `pnpm docs --check`: package.json has no `docs` script — pnpm runs its built-in `docs` (prints the npm URL, rc 0). Nothing is checked by it.
- Next: regression list (`/tmp/c54n-logs/reg.sh` → `reg/SUMMARY.txt`), typecheck re-run, AFTER race + deadlock.

### Migration for production — what each statement does (`20261104000000_account_journal_no_sequence/migration.sql`)
1. `account_jno_seq_name(system, book)` — IMMUTABLE SQL: the identifier `acc_jno_<systemId>_<book>` (md5 of the id if it is not `[a-z0-9]{1,40}`). Catalog only.
2. `account_jno_floor(system, book)` — STABLE SQL: `MAX` of the trailing digits of `docNo` over that (system, book), all periods. Read-only (AccessShareLock).
3. `account_jno_ensure(system, book, margin)` — plpgsql: returns the sequence if it exists; otherwise `CREATE SEQUENCE IF NOT EXISTS … AS bigint
   MINVALUE 1 START 1 CACHE 1 NO CYCLE` and `setval(floor + margin)`. A concurrent creator's `unique_violation`/`duplicate_table` is caught in a
   sub-block and the now-visible sequence is returned (builder hardening over the §3 draft; the draft would have failed the 2nd first-posting once).
4. `account_next_journal_no(system, book)` — `nextval(ensure(...))`. Used by gl.ts `allocateJournalNo`.
5. `account_peek_journal_no(system, book)` — STABLE plpgsql: `last_value/is_called` of the sequence (or floor + 1 if none). Writes/creates nothing.
6. `account_jno_drop(system)` — drops the 5 sequences of a system (pdpa tenant purge · QC teardown).
7. `DO` block — for every `systemId` in "AccountLedger": `ensure` the 5 books with margin 100 if the system has a journal entry from the last
   24 h, else 0. Measured on QC2: 1061 systems → 5305 sequences, seconds.
- Risk: no ALTER/rewrite; only AccessShareLock reads + new objects. Old code (count+1) keeps working between migration and deploy; the margin 100
  keeps the sequence above whatever count+1 hands out meanwhile (unless a book posts > 100 entries in that window — deploy right after migrating).
  Rollback = old code: count+1 restarts at row count; it can collide with sequence-era numbers of the same month (P2002 → the old race, no data harm).
- Prisma: no schema change; standalone sequences/functions are outside Prisma's model (migrate diff ignores them — verify once on CI's diff gate).

### Follow-up card (phase 2 — NOT built, controller ruling Q2)
- **C5.4-N2 · own document numbers at the tail.** `service.ts issueDocument` (`docNo = await nextDocNo(...)` before `postDocument`) and
  `expense.ts issueExpenseDoc` (same, before `postDocument`), plus `product.ts` goods docs (PRR/RPR/CA `accountDocSequence.upsert`) and
  `expense.ts submitForApproval` still hold their AccountDocSequence row for the whole transaction, i.e. across `postDocument` (inventory,
  deposit, credit-chain row locks). Move each to `openDocNumbering` + `deferDocNo` + `finalizeDocNos` (docNo stays null until the tail; the
  `emitDocumentIssued` payload and the function's `docNo` result must read the finalize map — emit AFTER finalize or move the emit into the
  stamping step). Oracle to add: N6-style wait of a concurrent `issueDocument(TAX_INVOICE)` during a long goods invoice issue that consumes
  inventory, and a cycle probe issueDocument ∥ recordPayment on the same TI series. Not needed for C5.4-N's oracle (12/12 without it).
### Notes only (rulings Q3/Q4)
- Q3: `gl.ts ensureAccounting` still inserts the month's `AccountPeriod` inside money transactions (first posting of a month waits on a
  concurrent first posting's commit, once per month per system). Fix proposal stands (autocommit create before opening the transaction).
- Q4: POS `TAX_INVOICE_ABB` numbers come from POS, not AccountDocSequence — not reviewed here.

### Builder checkpoint (resumed ~06:50 UTC, after the container restart)
- On disk (uncommitted at the restart, src mtimes 04:59–05:05, untouched since): gl/doc-numbering/service/cheque/expense/finance/group/
  journal-v2/wht.ts · pdpa.ts · journal/page.tsx · docs/sds/modules/account.md · migration `20261104000000_account_journal_no_sequence` (on QC2) ·
  `scripts/sweep-jno-orphans-qc.mts` · `scripts/pending/c54n/check-jno-fns.mts` · probe type fix.
- Proven on the CURRENT src by logs (all runs started after the last src edit): oracle `GREEN1.log` 12/12 (05:25) · fitness env + no-env 33/33 ·
  `reg/SUMMARY.txt` — the full QC2 list of run-main-c2.sh (13 probes + c5.3 L2,X + 22 suites) all rc=0, ALLDONE 06:23 (finished on its own, no
  unit left running). Logs copied to `.qc-shots/c54n-logs/`.
- Remaining: (1) line-level compare of the suites without JSON_SUMMARY vs the controller's base log (`cmp.py`/`tdiff.py`) · (2) typecheck re-run
  (typecheck-1 predates the probe fix) · (3) AFTER race (probe-r11a ONLY=Q3) + deadlock (trace-r10-2 ROUNDS=40) · (4) migration timestamp check ·
  (5) final commit + push to wip/crm-c54c-r8.

### CP-4 (resumed) · regression on the current src = no change vs the controller's MAIN base log
- `reg/SUMMARY.txt` (05:26–06:23, after the last src edit 05:05): 36/36 rc=0. `cmp.py` vs `/root/projects/shark-crm/.qc-shots/crm/main-c2.log`:
  every suite ❌0 and the same ✅ count as base — c3.3 90 · c2.7 79 · c3.1 56 · c3.2 47 · c3.5 67 · qc7 46 · cpa 107 · adjust 96 · payments 162 ·
  api write-payments 32 · write-docs 52 · webhooks 22 · groups 174 · detail 85 · deep 10 · cheap-routes 96 · simplicity 112 · c1.4 110 · c2.11 47 ·
  hr-payadjust 27 · payroll 19 · payroll-reverse 15 · c5.3 (L2,X) 9 · probe-cn 49.
- `tdiff.py` (text diff of the probes, ids/times/JV numbers normalised): family/race/r9e/r10b/r10c/r11b/r11c/r12a/payroll-reverse 0 lines;
  hunt/probe-cn/r8/r9a/r9c differ only in race-winner order tallies (e.g. r8 `clear ∥ bounce` ok|ok 2/10 — bouncing a CLEARED cheque is allowed,
  the same tally appears in earlier base logs 1–8/10). No new failure.
- Migration timestamp `20261104000000`: KEPT. The repo's convention is +1 day after the last folder (…20261103000000_crm_perf_indexes); a "today"
  name (20261001…) would sort BEFORE 20261025…20261103 and break ordering. No other branch/worktree has a 20261104+ folder. Renaming would also
  leave QC2's `_prisma_migrations` row for the old name orphaned (migrate status warning; the SQL is idempotent so a re-apply would succeed).
- Running: unit c54n-after-* (`after.sh`: typecheck-2 → AFTER race probe-r11a ONLY=Q3 → AFTER deadlock ×40), then c54n-after2-* (`after2.sh`:
  qc-acc-v2-recurring + qc-account-api-docs, mine vs base snapshot worktree).

### CP-5 (resumed) · final measurements — all on the src of commit 6587df55 (unchanged since 05:05)
- typecheck-2 (`iso.sh` 6G, NODE_OPTIONS 5120): **rc 0** (`typecheck-2.log`) · oracle `GREEN1.log` 12/12 stands (same src) · fitness env/no-env 33/33.
- AFTER race (`after-q3.log`, probe-r11a ONLY=Q3 — 3 cashiers ×20 singles + six 5-child + one 40-child batch): round 1 singles **20/20**, 5-child 6/6,
  40-child **1/1**, raw {} · round 2 singles **20/20**, 6/6, **1/1**, raw {} (BEFORE on 96a4c28f: 7/20 · 5/6 · 0/1 raw P2002 ×13 · 4/20 · 6/6 · 0/1 raw ×16).
- AFTER deadlock (`after-deadlock.log`, trace-r10-2 ROUNDS=40): ok|ok 40/40 · raw {} · cycles 0 (BEFORE identical 40/40).
- Known not-mine reds, mine vs base snapshot worktree on QC2 (`kr-*.log`): qc-acc-v2-recurring 161/163 both (P4.13b/c PP30 reminder dedupe) ·
  qc-account-api-docs mine 11/17 · base worktree 10/17 (F2.4 = an ignored generated `.claude/skills/.../endpoints.md` that only this worktree has;
  F2.1–3,5–7 identical). ai-skill E1-K2.3 is a QC1 suite — not run (QC2-only lane).
- ORACLE-EDITs: none of OE-1..5 was needed (OE-1 kept: search is exact-first · OE-2/3/4 no change · OE-5 → sweeper script). One marked edit in the
  test author's probe `probe-legal-counters.mts` (2 lines, type annotation only, `// ORACLE-EDIT C5.4-N:`), required for `pnpm typecheck`.

---

## Builder ROUND 2 (controller rulings after review `crm-C5.4-N-review.md`, commit 342a16d3) — checkpoints
Scope: M1 self-healing allocator · setup-time sequence creation (autocommit, lazy in-tx only as fallback + clear Thai error) · M3 bounded
migration (90 days, hard cap, search_path pinned, floor tolerant of over-long tails) · m4 N7 ORACLE-EDIT · M2 runbook (note only) · n7 N6 ×5.

### R2-CP-1 · plan (tests first)
- QC2 migration record: `qc-prisma.sh` refuses `migrate resolve` and `db execute` (by design), so the "rewrite + repair the row" route is not
  available through it. Route taken: the rewritten SQL ships under a NEW folder name `20261104000001_account_journal_no_sequence` (old
  folder removed); on QC2 it is applied by the allowed `migrate deploy` (all objects are CREATE OR REPLACE / IF NOT EXISTS, so it upgrades the
  functions in place); QC2's `_prisma_migrations` keeps an orphan row for `20261104000000_…` (applied, not in the folder) — the same state any
  other branch on QC2 already sees for it. Production never ran either name, so prod applies only the new one. Proof: function bodies on
  QC2 compared against the new file after deploy.
- New probe `scripts/pending/c54n/probe-m1.mts` (M1 + setup + fallback + seams) · ORACLE-EDITs: r2-money R2-C1 contract flipped to the M1
  contract, R2-D re-judged as the reviewer stated · oracle N7 per review m4.

### R2-CP-2 · RED on the round-1 src (070b7825 + review 342a16d3; all three runs finished 07:52:52, before the first src edit 07:53:19)
- `r2/RED-probe-m1.log` **3/10**: ❌ M1a (old code count+1 rows 3..5 → next 3 payments FAIL "บันทึกชำระไม่สำเร็จ", raw P2002 ×3) · ❌ M1b (imported
  next/next+1/0900 → 2 FAIL, P2002 ×2) · ❌ M1d (18/24 ok, 6 FAIL) · ❌ S1 (after setup 0 sequences; created inside the first payment's tx) ·
  ❌ S3 (squatted name → generic "บันทึกชำระไม่สำเร็จ", raw P2010/42809) · ❌ SEAM-null · ❌ SEAM-42501 · ✅ M1c, S2 (guards: drop self-heals,
  lazy fallback) · CLEAN ✅.
- `r2/RED-r2-money-CD.log` 5/6: ❌ R2-C1 (new M1 contract — ORACLE-EDIT) · ✅ C2 (hazard of a rollback to old code: still true, runbook) · ✅ C3 ·
  ✅ D ×2 (D-creator-rolls-back re-judged per review — ORACLE-EDIT).
- `r2/RED-oracle-N7.log`: N7 ✅ with the m4 ORACLE-EDIT (literal: stamped in the failed tx === next real) — the tail design already held; the
  edit makes the check exercise it. Not a RED item.
- Code written (R2-CP-3 next): migration `20261104000001_…` (new SQL) · gl.ts `account_alloc_journal_no` caller + Thai errors + NULL guard +
  `ensureJournalSequences` · hooks: loadAccountSystem · requireAccountApi · saveSettings · ensureAccounting (no tx).

### Production runbook — migration `20261104000001_account_journal_no_sequence` + C5.4-N code (review M2 · owner's step)
The Vercel production build runs `prisma migrate deploy` itself (`scripts/vercel-build.sh`), BEFORE `tsc` + `next build`. So "merge to main" = "migrate prod".

**Pre-checks — read-only, on production, before merging** (copy-paste; each must hold):
```sql
-- 1 lock capacity (M3). Pre-create = min(candidates, 500) systems × ≈5.1 lock entries; must be < 50 % of lock_slots.
SELECT current_setting('max_locks_per_transaction')::int
       * (current_setting('max_connections')::int + current_setting('max_prepared_transactions')::int) AS lock_slots;
SELECT count(*) AS candidates FROM (SELECT "systemId" FROM "AccountJournalEntry"
       WHERE "createdAt" > now() - interval '90 days' GROUP BY 1) s;          -- capped at 500 by the migration
--   500 × 5.1 ≈ 2 550 ⇒ needs lock_slots ≥ 5 100: true on every Neon compute ≥ 0.25 CU (64 × 112 = 7 168). Measured on QC2:
--   500 systems → 2 506 locks, 0 subtransactions, 3.1 s (r2/check-jno-fns-r2.log).
-- 2 number shapes (n8) — both 0 expected; ≥ 7-digit tails only make that book's numbers jump (≥ 19 digits are now ignored, no abort)
SELECT count(*) FROM "AccountJournalEntry" WHERE "docNo" !~ '^(SV|PV|RV|PY|JV)-\d{4}-\d{2}-\d{4,}$';
SELECT count(*) FROM "AccountJournalEntry" WHERE "docNo" ~ '\d{7,}$';
-- 3 roles: run once over DATABASE_URL (app, pooled) and once over DIRECT_URL (migrate). Same user, or the app user has CREATE:
SELECT current_user, has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_in_public;
--   app user without CREATE on public ⇒ new systems cannot get their sequences (pages still work; their FIRST posting is refused with
--   "ออกเลขที่ใบสำคัญไม่ได้ — ฐานข้อมูลไม่อนุญาต…" and logged) — grant CREATE or run the migration role as the app role.
-- 4 nothing of ours exists yet (the migration has never run on prod)
SELECT count(*) FROM pg_class WHERE relname LIKE 'acc_jno_%';               -- 0
SELECT count(*) FROM "_prisma_migrations" WHERE migration_name LIKE '2026110400000%';   -- 0
```
5. CI of the merge commit green — in particular `migrate deploy` on the fresh branch of the prod default branch (= prod-size rehearsal of the
   DO block; note its duration) and `pnpm drift` (review n4: first standalone sequences/functions in the repo — unverified until CI runs).
6. Owner answers Q1 (journal numbers do not restart monthly while the display carries yyyy-mm).

**Timing:** a quiet hour, not during month-end close, no other migration in the same deploy, someone watching the build (migrate → tsc →
next build, 5–40 min on record).

**Order:**
- (a) pre-checks 1–6 → (b) merge → Vercel production build (migrate deploy, then build).
- (c) if the build fails AFTER migrate: old code keeps serving (count+1). With M1 merged this is no longer a numbering hazard — the new
  allocator skips every number old code wrote — so fix and redeploy normally (old code still has the original R11 race until then).
- (d) smoke, right after the new code is live:
  - one service invoice paid with 3 % WHT → TI and WTI numbered, the journal entry `RV-yyyy-mm-…`;
  - one vendor payment with 3 % WHT → 50 ทวิ numbered;
  - journal page → "สร้าง JV" modal shows a preview number; open it twice, the preview does not move;
  - set up a new ACCOUNT system (or open any account page of a system that had no sequences), then
    `SELECT count(*) FROM pg_class WHERE relname LIKE 'acc_jno_<systemId>_%'` → 5.
- (e) re-floor SQL — **NOT needed with M1** (kept only for a build without the M1 allocator). Diagnostic (read-only) first:
```sql
WITH s AS (SELECT sequencename, COALESCE(last_value, 0) AS lv FROM pg_sequences WHERE schemaname = 'public' AND sequencename LIKE 'acc_jno_%'),
     t AS (SELECT public.account_jno_seq_name(e."systemId", e."book"::text) AS sequencename,
                  public.account_jno_floor(e."systemId", e."book"::text) AS mx
           FROM (SELECT DISTINCT "systemId", "book" FROM "AccountJournalEntry") e)
SELECT t.sequencename, s.lv, t.mx FROM t JOIN s USING (sequencename) WHERE s.lv < t.mx;   -- with M1: harmless, healed on the next posting
-- re-floor (only without M1): forward-only
DO $$ DECLARE r record; q regclass; v bigint; f bigint; BEGIN
  FOR r IN SELECT DISTINCT "systemId" s, "book"::text b FROM "AccountJournalEntry" LOOP
    q := public.account_jno_ensure(r.s, r.b); f := public.account_jno_floor(r.s, r.b);
    EXECUTE format('SELECT last_value FROM %s', q) INTO v; IF v < f THEN PERFORM setval(q, f, true); END IF;
  END LOOP; END $$;
```
- (f) watch for 1 h: Vercel logs for `[account/gl] journal number allocation failed` and `journal sequences not created at setup` (both 0),
  and P2002 on "AccountJournalEntry" (0).

**Rollback rule (M2):** NEVER use Vercel Instant Rollback to a release before this deploy — old code's count+1 lands on the new gap-ful,
non-resetting numbers and freezes a book for the rest of the month (review R2-C2, still true: `r2/GREEN-r2-money.log` C2).
Prepare the rollback build BEFORE deploying = previous release + these C5.4-N parts cherry-picked:
`gl.ts` (journalNoParts / journalNoDisplay / allocateJournalNo / peekJournalNo / ensureJournalSequences + the ensureAccounting hook) and
`journal/page.tsx` (peek). The legal-tail part (doc-numbering registry, service/wht/expense/cheque/group wrappers) may be reverted safely —
the AccountDocSequence counters are authoritative and shared by both versions. The DB objects stay (additive; nothing to undo); never drop
the sequences while new code runs. No down-migration.

**What M1 removes from the review's checklist:** step (e) re-floor (healed on the next posting, any time) · the "first days of a month"
timing constraint · the urgency of (c) for numbering · the margin-100 reasoning (kept per Q5 but no longer needed for correctness).
Still needed: pre-checks 1–6, smoke (d), watch (f), and the rollback rule (M1 does not protect OLD code).

### R2-CP-3 · QC2 migration + first GREEN (src = round-2 code)
- `migrate deploy` (qc-prisma.sh, QC2) applied `20261104000001_…` (`r2/migrate-deploy-r2.log`); `migrate status` "Database schema is up to date"
  (no warning for the orphan 20261104000000 row). `check-jno-fns-r2` (`r2/check-jno-fns-r2.log`): all 10 functions on QC2 byte-equal to the
  file (prosrc) with `search_path=pg_catalog, public`, no extra function; `_prisma_migrations`: …000000 (round 1, 05:06) + …000001 (07:54).
- R2-E re-measured on the new SQL: migration path `account_jno_create` 500 systems → 2 506 locks (5.01/system), **0 subtransactions**, 3.1 s ·
  ensure path (app fallback) 100 systems → 506 locks, 64 subxacts (overflowed — that is why the migration no longer uses it).
  QC2 bounded-block candidates: 103 systems active in 90 days.
- typecheck rc 0 (`r2/typecheck-r2a.log`) after an ORACLE-EDIT in the reviewer's `r1-db-facts.mts:44` (`1n` → `BigInt(1)`, TS2737).
- GREEN: `r2/GREEN-probe-m1.log` **10/10** (RED 3/10) · `r2/GREEN-r2-money.log` **11/11** (A ×2, B ×2, C1 M1 contract, C2 hazard of old-code
  rollback still shown, C3, D ×2, E, CLEAN).
- Next: full oracle + N6 ×5, r11 Q3, deadlock ×40, run-main-c2 QC2 list, fitness ×2, docs.

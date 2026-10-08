# WO C5.1 — performance at real size (builder · 27 Sep 2026 · worktree `shark-crm-c51` @ d6fcb42a · QC2 only)

Status: DONE (measurement + findings). No product code touched, no migration, no commit. Perf tenant dropped at the end (§7).

## 1. Files
| file | what |
|---|---|
| `scripts/seed-crm-perf.mts` | NEW · tenant `crm-perf-qc` · `--drop` · `--status` · `PERF_SCALE=0.01` for a quick dry run |
| `scripts/qc-crm-perf.mts` | NEW · counts queries via `$on("query")` on the app's own Prisma client (pre-seeded into `globalThis.prisma`), 2 warm + 20 runs/scene, real service functions + real route handlers (`/t/o` `/t/c` `/l` `/t/e` `/api/email/inbound`) · `--runs N --only group,… --out dir` |
| `ledger/wo-notes/crm-C5.1.md` | this file |
| `.qc-shots/crm/perf/` | `summary.json` + `summary.txt` (final 20-run table) · `run-final.log` · `explain/*.txt` (EXPLAIN ANALYZE BUFFERS of the slowest query per scene) · `summary-run20.*` + `explain-run20/` (first 20-run pass, snapshot) · `probe-other/` (3-run probe for extra plans) · `index-trials.json` + `index-trial-email.json` (before/after raw numbers) · `seed.log` · `typecheck-*.log` |

## 2. Dataset (seed)
Built in-database with `INSERT … SELECT generate_series` chunks (≤ 50k rows/statement, md5-deterministic values ⇒ identical data every rebuild, ids `pf<kind>_<n>` + `ON CONFLICT DO NOTHING` ⇒ idempotent; progress in `AppSystem.settings.perfSeed` ⇒ resumable). Structure through real services (`system.createSystem`, `crm.ensureCrm` = pipeline 1 with the 5 default stages, `setCrmSettingsKey`, `setCrmEmailKeys`); no service that emits outbox events.
- 21 users (owner · 2 managers, one restricted to the Phuket unit · 18 staff in 3 teams of 6, first = LEAD) · STAFF perms = `CRM_ROLE_DEFAULTS.STAFF`
- 200,000 contacts (owner skew pow 1.3 · lifecycle 55/30/12/2/1 · 60% linked to a company, big companies skewed · 85% e-mail · 1% archived) · 119,835 company links
- 50,000 companies + 50,000 Party · 26,000 deals = **20,000 open** (70/30 over 2 pipelines, early stages favoured) + 4,000 WON + 2,000 LOST (so funnel/forecast/"closed" have real data) · 61,416 stage-history rows
- **1,000,000 activities** (400k on deals, 600k on contacts; 30% of the contact ones piled on a few hundred "heavy" contacts — top contact 3,153) over 2 years; caches (contact last/next activity, company open/won/last) recomputed
- 30 contact fields (10 filterable: SELECT×2, NUMBER×3, DATE×2, BOOLEAN, TEXT×2) · values 40% filled for filterable, 5% for the rest → 1.0M values
- 3 custom objects (car→CONTACT, contract→COMPANY, pet→CONTACT) × 100,000 records + 2 filterable values each (600k)
- 30,000 e-mails (+24k events, deterministic open/click tokens) · 200 tracked links + 50k clicks · 30,000 web sessions + 150k events · inbound key `crm+perfqcab@shark.in.th` · web site key `perfqcsite0001`
- **Seed time 261 s** (DB 193 MB → 2,010 MB) · re-run = 53 phases skipped in 6 s · `--drop` verified with a count over every table that has `tenantId` (+ Tenant + User) = 0 (twice during development + final).

## 3. Budget vs measured (final run, 20 runs, `summary.txt`) — RTT VPS→Neon SG p50 9.8 ms; every time includes it
| §12 budget | scene | p95 ms | queries (data*) | verdict |
|---|---|---|---|---|
| board ≤ 8 q ≤ 400 ms | getBoard P1 5 stages · owner / lead / staff / mgr-restricted | 278 / 300 / 309 / 264 | 25 / 33 / 33 / 31 (21) | time PASS · **queries FAIL** |
| | getBoard P2 6 stages · owner | 195–489 (one network spike) | 28 (24) | queries FAIL (+3 per column) |
| contacts 50 rows + 5 filters (2 custom) ≤ 12 q | wide custom filters (industry=tech,retail · budget ≥ 5000) | — | 7–11 then **throws P2029** | **FAIL — page crashes** |
| | narrow custom filters (nps=10 · segment=gov) owner / lead / staff / mgr | 229 / 320 / 377 / 308 | 13 / 21 / 21 / 19 (5) | **queries FAIL** (visibility ×2) |
| forecast 12 mo × 4 cat ≤ 2 q | reports.forecast · owner / lead / mgr-restricted | 58 / 104 / 163 | 2 / 7 / 12 (1 / 1 / 3) | owner PASS · others FAIL on guard queries (1 aggregate each) |
| | deals.forecast (deals page) · owner / lead | 132 / 132 | 4 / 8 (2) | FAIL (id round-trip + guards) |
| funnel ≤ 1 q/stage | P1 (4 shown stages) owner / lead · P2 owner | 175 / 210 / 377 | 4 / 9 / 4 (2) | owner PASS · lead FAIL (9 > 4); data side = 1 statement for all stages |
| tracking ≤ 50 ms | `/l/<code>` | 44 | 4 | PASS |
| | `/t/e` page view | 66 p50 / 148 p95 | 6 | FAIL |
| | `/t/o/<token>.gif` open | 114 | 9 | FAIL |
| | `/t/c/<token>` click | 142 | 12 | FAIL |
| inbound ≤ 1.5 s | known contact / company domain / stranger→lead / reply | 271 / 348 / 793 / 421 | 13 / 11 / 38 / 14 | PASS all |
| (C3.1 cap) report overview ≤ 12 q | reports overview | 173 | 2 | PASS |
| §12 indexes | CrmDeal(systemId,ownerUserId,kind,expectedCloseAt) · CrmEmailMessage(threadKey,sentAt) · CrmWebSession(systemId,visitorId) · CustomRecordValue(fieldId,valueDate) | | | all present |
| cron "loops until quiet ≤ 20 s" | — | | | DEFERRED: cron workers are not tenant-scoped; running them on shared QC2 would process other tenants' rows |

\* data = queries minus system/visibility/team/field-definition guard lookups. Positive control: tracking scenes really wrote (22 web events, e-mail opens/clicks rows grew); inbound asserts `handled:true` on every run.

Other scenes (no §12 number; p95 ms / queries): contact 360 heavy 418/34 · light 384/34 · company 360 461/27 · deal 360 181/22 · home 405/32 (staff 245/37) · listActivities staff 286/26 · calendar month 423/16 · custom-object list (staff) 705/16 · listCompanies 50/4 · listDeals 101–131/9 · reports: reps 173, activities 298, sources 267, scores 642 (all 2–3 queries).

## 4. Findings (file:line) — ordered by severity
**F1 · HIGH · contacts/objects/deals/companies list crash with a broad custom-field filter (P2029 "query parameter limit exceeded").** `src/lib/modules/member/fields.ts:2402-2407` (`recordFilterWhere`) reads every matching `recordId` into JS and pushes `id: { in: ids }`; > 32,766 ids ⇒ Prisma P2029 ⇒ the list page errors. Reached from `contacts.ts:1432`, `objects.ts:1029/1065`, `deals.ts:1644`, `companies.ts:1276`. Hit here with a 2-choice SELECT filter (≈27k) and `budget 5000..` (≈66k); also `records.car.filter` (brand+year). Even below the limit it ships tens of thousands of ids both ways (122 ms per filter query + the IN list). Fix direction: filter in SQL (`id IN (SELECT "recordId" FROM "CustomRecordValue" WHERE …)` via a raw EXISTS fragment like `objects.ts` already does for visibility, or intersect the id sets in one SQL statement).
**F2 · HIGH · e-mail thread list crashes and silently truncates.** `src/lib/modules/crm/emails.ts:2086-2096` (`visibleThreadWhere`) loads up to 20,000 contact ids + 20,000 company ids into an `IN` list ⇒ 40k params ⇒ P2029 on every `listThreads` call for an owner in this shop. Below the limit it is still wrong: contacts past the 20,000th are invisible in the inbox. Fix: EXISTS against contactWhere/companyWhere in SQL (or join).
**F3 · MEDIUM · deal board N+1 per column + double visibility.** `deals.ts:1755` runs one `findMany` per stage with `include: CARD_INCLUDE` (`deals.ts:1693`: contact + stage relations) — Prisma 7 here issues relations as separate queries ⇒ 3 queries × columns (15 of 25 for 5 stages; +3 per extra stage: P2 = 28). `deals.ts:1740` builds `dealWhere` twice (directly and inside `listWhere`, `deals.ts:1617`) ⇒ visibility snapshot (TeamMember ×2, Team, CrmVisibilityPolicy, AppSystem settings) runs twice for non-owners (+8). `deals.ts:1726-1742` `scopedDealIds` pulls every visible deal id (≈14k in P1) to the app and sends them back as `ANY($ids)` for the aggregate (22 ms + 60 ms). Time is still under 400 ms because the per-stage queries run in parallel; the ≤ 8-query budget needs: one window-function SQL for cards (`row_number() over (partition by "stageId" order by "stageEnteredAt" desc, id desc) <= 60`, joined to contact/stage) using the SQL form of the visibility rule (`visibility.ts` already has `dealSql`), aggregate in the same or one more statement with the where inlined, visibility computed once. Same double `dealWhere` in `listDeals` (`deals.ts:1712`) and `exportDeals` (`deals.ts:1932`); `deals.forecast` (`deals.ts:1801`) uses the same id round-trip.
**F4 · MEDIUM · contact/company 360 activity query scans all activities of the shop.** `contacts.ts:1300` and `companies.ts:1148`: `OR: [{ contactId }, { deal: { contactId } }]` compiles to `LEFT JOIN CrmDeal … WHERE contactId = X OR j0.contactId = X` ⇒ parallel seq scan of 1,000,000 activities + hash of all deals on every 360 open (212–340 ms server time, grows linearly with the shop's total activity count, not with the contact's). Fix: resolve the contact's/company's deal ids first (index `CrmDeal(contactId)` / `(systemId, companyId)`) and use `OR: [{ contactId }, { dealId: { in: dealIds } }]` ⇒ BitmapOr on existing indexes.
**F5 · MEDIUM · tracking endpoints are not "write-only".** `/t/o` = 9 sequential round-trips (2 rate-limit upserts `emails.ts:2324-2330`, message lookup, contact opt-out lookup, tx: UPDATE + event INSERT + outbox exists-check + INSERT + COMMIT, `emails.ts:2352-2385`); `/t/c` = 12 (adds `tracking.ts:1239-1255` ticket: message + contact + AppSystem lookups again); `/t/e` = 6 (`resolveSite` JSON scan of AppSystem runs twice — once in the route's `corsOriginForPayload`, once in `collect`'s `gate`, `tracking.ts:577-598,718-744`). Server work per query is < 1 ms; the budget miss is round-trips × 9.8 ms. At an in-region RTT of ~1–2 ms they would land ≈ 20–30 ms, but §12's design (queue + batch insert, no reads) is not what the code does. Cheapest wins: resolve the site once per request; fold the two rate-limit keys into one statement; move open/click counting to an outbox/batch.
**F6 · LOW · missing sort indexes on the two default list orders** (see §5 I1/I2): contacts list `-createdAt` (`contacts.ts:1466`) = parallel seq scan + top-N sort of all 200k contacts; custom-object list `-createdAt` (`objects.ts:1104`) same on `CustomRecord`.
**F7 · LOW · inbound e-mail contact match is a seq scan.** `emails.ts:1646-1655` `email equals … mode: insensitive` ⇒ `ILIKE` ⇒ seq scan of the system's contacts (~95 ms); `previousEmails hasSome` fallback = another seq scan (~70 ms) for every unknown sender. Within budget today (inbound p95 271–793 ms).
**F8 · LOW · report "scores" 640 ms** (`reports.ts:660`): two correlated `EXISTS` sub-plans per contact (≈400k index probes) + external merge sort; rewrite with one grouped join of open/won deals per contact. Calendar month (`activities.ts:988`) sorts ~156k matching rows to return 1,000 (247 ms) — acceptable, noted.
**Guards everywhere:** every service re-resolves the CRM system (`AppSystem` id lookup + settings lookup) and non-owner actors rebuild the visibility snapshot per call (4–5 queries); pages that call 6–8 services in parallel pay this per service (board page 48 queries, contact 360 34). Not an N+1 by page size, but it is why every non-owner scene misses the query budgets. A per-request memo of `sysInfo`/snapshot (request-scoped, not a cross-request cache — visibility rule says "no cache") would remove most of it.

**N+1 by page size: none.** Query counts are constant across pageSize 10/50/200 for listDeals (9), listContacts (8; the `ps10`=4 reading is a data artifact — the newest 10 contacts are owner-less, company-less leads created by the inbound scenes, so the two lookups were skipped), listCompanies (4), listActivities (26), custom records (16), listThreads (6). The only N+1 is F3 (queries grow with board columns).

## 5. Index proposals (additive · controller approval needed · NOT migrated)
Tested on QC2 with `CREATE INDEX CONCURRENTLY` → ANALYZE → before/after → `DROP INDEX CONCURRENTLY` (dropped verified in `pg_indexes`). Raw numbers: `.qc-shots/crm/perf/index-trials.json`, `index-trial-email.json`.
```sql
-- I1 (recommend) — contacts list default order "-createdAt"
CREATE INDEX CONCURRENTLY IF NOT EXISTS "CrmContact_systemId_createdAt_id_idx" ON "CrmContact" ("systemId", "createdAt" DESC, "id" DESC);
--   build 336 ms · 15 MB @ 200k rows · plan: seq scan+sort 96.7 ms → index scan 0.12 ms
--   listContacts ps50 owner p50 210 → 58 ms (p95 468 → 63) · staff p50 319 → 137 ms
-- I2 (recommend) — custom-object list default order "-createdAt"
CREATE INDEX CONCURRENTLY IF NOT EXISTS "CustomRecord_objectId_createdAt_id_idx" ON "CustomRecord" ("objectId", "createdAt" DESC, "id" DESC);
--   build 419 ms · 22 MB @ 300k rows · plan 140.5 ms → 0.13 ms · records.list owner p50 172 → 125 ms; staff 648 → 465 ms (rest = visibility EXISTS + count(*))
```
Tried and **not** proposed: I3 `CrmDeal("stageId","stageEnteredAt" DESC,"id" DESC)` — per-column card query 7.0 → 0.16 ms but getBoard p50 only 248 → 233 ms (round-trips dominate; fix F3 instead). I4 `CrmContact("systemId", lower("email"))` — unused by Prisma's `ILIKE` (95 → 89 ms); only helps if F7's lookup is rewritten to `lower(email) = lower($1)` (then 0.04 ms) — code change first.
Prod notes: both are plain btree, additive, no constraint ⇒ cannot fail on existing rows. Prisma migrations run in a transaction, where `CONCURRENTLY` is not allowed: either ship them as a normal `CREATE INDEX` in a tiny migration (locks writes on `CrmContact`/`CustomRecord` for the build — seconds at prod size, prod CRM tables are far smaller than this dataset) or create them `CONCURRENTLY` by hand first and add a migration with `IF NOT EXISTS` so `migrate deploy` is a no-op (memory note: prior `migrate deploy` incident — prefer the hand-built CONCURRENTLY route). Schema lines to add: `@@index([systemId, createdAt(sort: Desc), id(sort: Desc)])` on CrmContact · `@@index([objectId, createdAt(sort: Desc), id(sort: Desc)])` on CustomRecord.

## 6. Decisions for the controller
1. F1/F2 are correctness bugs (page error at scale), not just speed — suggest they enter C5.3 as HIGH with oracles built on this seed (`PERF_SCALE` makes a smaller tenant, but the bug needs > 32,766 matching rows: full scale or ≥ 0.2).
2. Budget interpretation: §12 query budgets are met only for OWNER on reports/funnel; for every non-owner actor the per-service guard/visibility lookups alone exceed "≤ 2" / "≤ 4". Decide whether §12 counts data queries only (then forecast/funnel PASS, board/contacts still FAIL) or whether request-scoped memoisation is in scope for C5.4.
3. Tracking ≤ 50 ms: measured from the VPS (RTT 9.8 ms). Decide whether to re-measure from an in-region runtime or accept "round-trips ≤ 3" as the proxy budget.
4. Approve / reject I1, I2 (and the CONCURRENTLY route).

## 7. Commands / cleanup
- seed: `systemd-run --unit=crm-c51-seed … bash scripts/qc2.sh pnpm exec tsx scripts/seed-crm-perf.mts` → `SEED_SUMMARY … "seconds":261,"dbSize":"2010 MB"` · re-run → 53 phases skipped, 6 s
- measure: `bash scripts/iso.sh bash scripts/qc2.sh pnpm exec tsx scripts/qc-crm-perf.mts` → `JSON_SUMMARY {"pass":9,"fail":31,"info":32,"rttP50":9.8,…}` (fail count = scenes × actors; distinct causes = F1–F5 + guards)
- drop: `… seed-crm-perf.mts --drop` → `DROP_SUMMARY` leftover {} (see §8 of the handback) · rate-limit buckets created by the tracking scenes deleted by exact key in the suite's `finally` (31/31, 133/133, 133/133)
- temp probes `scripts/_perf-*.mts` deleted · typecheck exit 0
- Temp data left behind: none (tenant dropped; indexes dropped; buckets deleted).

---

# C5.1-fix — builder (27 Sep 2026 · same worktree · QC2 only · not committed)

## A. What changed (file → finding)
| file | change |
|---|---|
| `crm/request-scope.ts` NEW | per-request memo: React `cache()` Map (= 1 RSC request) or `crmScope(fn)` (ALS, 1 service call). Key = tenant+system+userId; never memo on a tx client; failed promises dropped; no module Map / TTL ⇒ "no cross-request cache" (X1) still true. Read entrypoints wrapped: getBoard, listDeals, forecast, get*360, listContacts, listCompanies, listThreads, reports.*/getReport |
| `crm/visibility.ts` | `crmAccess()` = AppSystem + my teams + mates + policies + tenant teams in **1 SQL** (was 4–5 per service call) · `crmSystemRow()` · `visibleSql()` = visibleWhere in SQL (same helpers ownedSql/dealSql/levelOf) |
| `crm/where.ts` | `contactSql/companySql/dealSql` |
| `crm/list-sql.ts` NEW | Prisma-identical ORDER BY / cursor predicate (copied from Prisma 7.8's own SQL) · `contains` = unescaped LIKE like Prisma · typed enum compare |
| `member/fields.ts` | `planRecordFilters` (validation shared) → `recordFilterWhere` (unchanged output) + NEW `fieldFilterSql` = EXISTS on CustomRecordValue (F1) · enum system columns compared as enum (stats) |
| contacts/companies/deals/objects | F1: `f.<key>` present ⇒ page ids via SQL (EXISTS) + rows via Prisma by id (list, export, probe); no `f` ⇒ old Prisma path byte-identical · F3 board = 1 aggregate + 1 window-function card query (row_number per stage) · deals.forecast SQL with visibility inline (no id round-trip) · double dealWhere removed · F4 360 activities = 2 indexed branches in parallel, merged/deduped (createdAt desc, id desc) · owner names 1 query (User + memberships.some) |
| `crm/emails.ts` | F2 listThreads = EXISTS on visible contact/company (no 20k cap, no IN list) · F7 inbound match `lower(email)=lower($1)` + previousEmails GIN, MATERIALIZED CTEs · F5 trackGate 1 statement, trackOpen/trackClick 1 statement each (count + event + outbox with same idempotencyKey/payload, ON CONFLICT = emitOutbox) |
| `crm/tracking.ts`, `app/t/c`, `app/t/e` | F5 `/l` link+system 1 query, rate+count 1 query · `/t/e` site resolved once (CORS+collect), rate(IP→site chained, same order as gate)+session+opt-out+PAGEVIEW write in 1 statement; idle/new session/event/identify fall back to old code (no double rate count) · `/t/c` ticket reuses rows read by the count statement |
| `core/rate-limit-db.ts` | `rateBucketCte` + `checkRateLimitDbMany` (same fixed-window semantics per bucket, one statement) |
| `crm/reports.ts` | system/teams/mates/allowedTeams from crmAccess (0 extra queries) · orphan-activity list lazy (only overview/reps/activities; activityScope throws if not loaded) |
| other crm modules (views, home-data, pipelines, lost-reasons, sequences, activities) | AppSystem lookup → `crmSystemRow` (shares the memo) |
| `prisma/migrations/20261103000000_crm_perf_indexes` + `crm.prisma` | I1, I2, F7 expression index (SQL-only — Prisma can't express it; next `migrate diff` will propose DROP → delete that line), F7 GIN previousEmails |
| `scripts/qc-crm-c51fix-equiv.mts` NEW | old-vs-new oracle (see C) · `scripts/qc-crm-perf.mts` wraps each run in `crmScope` (= one request) |

QC2: the 4 indexes were created by hand (`CREATE INDEX IF NOT EXISTS`, log `.qc-shots/c51fix/qc2-indexes-applied.log`) — migration deploy is idempotent.

## B. Budgets before → after (20 runs, `.qc-shots/crm/perf/summary-before.json` vs `summary-after.json`; RTT 9.8 → 8.6 ms) — full table `.qc-shots/c51fix/before-after.md`
| scene | budget | before p95/q | after p95/q |
|---|---|---|---|
| board P1 owner/lead/staff/mgrHkt | ≤8q ≤400ms | 278/25 · 300/33 · 309/33 · 264/31 | 225/7 · 191/7 · 182/7 · 93/7 |
| board P2 owner · filtered | ≤8q | 489/28 · 148/25 | 92/7 · 70/7 |
| contacts f5 owner/lead/staff/mgrHkt | ≤12q | **P2029** (7–11q) | 213/8 · 152/8 · 150/8 · 148/8 |
| contacts f5 wide · narrow ×4 | ≤12q | **P2029** · 229–377 / 13–21 | 323/8 · 93–102/8 |
| forecast report owner/lead/mgrHkt | ≤2q | 58/2 · 104/7 · 163/12 | 57/2 · 50/2 · 47/2 |
| deals.forecast owner/lead | ≤2q | 132/4 · 132/8 | 52/2 · 48/2 |
| funnel P1 owner/lead · P2 | ≤1q/stage | 175/4 · 210/9 · 377/4 | 171/4 · 155/4 · 194/4 |
| /t/o · /t/c · /l · /t/e | ≤50ms · ≤2 RT | 114/9 · 142/12 · 44/4 · 148/6 | 37/2 · 29/2 · 29/2 · 29/2 |
| inbound known/domain/stranger/reply | ≤1.5s | 271 · 348 · 793 · 421 | p50 186 (p95 546 = one network spike, max 860, every query ≤12 ms) · 162 · 674 · 196 |
| threads ps10/50/100 · records.car.filter | info | **P2029** | 265 · 193 · 308 /3q · 397/15q |
| 360 contact heavy/light · company · deal | info | 418/34 · 384/34 · 461/27 · 181/22 | 130/26 · 84/26 · 121/20 · 142/16 |
JSON_SUMMARY after: pass 32 · fail 0 (before: pass 9 · fail 31). N+1: none (all lists constant over page size).

## C. Equivalence (old code = HEAD d6fcb42a files restored in place, run, restored; `sha256` + `git diff` identical after restore)
`qc-crm-c51fix-equiv.mts` calls only public functions present in both versions (listContacts/Companies/Deals + page 2, getBoard ± filters ± f, deals.forecast ×4, getReport 8 tabs ± pipeline, listThreads, contact/company 360, records.list ± f ± page 2, probe*Filters) for every actor, then `--compare`.
- QC seed (`siam-dive-member-qc`, 8 actors): **422/422 identical** (incl. 136 identical FORBIDDEN/NOT_FOUND). `visibleSql` = `visibleWhere` id sets: 24/24.
- perf tenant (6 actors: owner, manager, mgrHkt, lead, staff ×2; `--prep` added system-field templates + company/deal custom fields incl. 35k-row broad ones): **443 identical · 0 diff · 104 scenes where old code crashed (P2029 / "Expected zero or one element, got 2" = Prisma chunking in findFirst) match an independent reference** (hand-written SQL of the filters ∩ ids from old `visibleWhere`, same order, page 1/2 + totals; threads = old algorithm without the 20k cap). visibleSql = visibleWhere: 18/18 (200k/50k/26k id sets). 144 checks, 0 fail.
Files: `.qc-shots/c51fix/equiv-{qc,perf}-{old,new}.json`, `equiv-*-compare.txt`.
Intended differences (documented, not exercised by the seeds): 360 timeline ties on identical createdAt now ordered by id (was undefined) · inbound match no longer treats `_`/`%` in an address as wildcards (old ILIKE could attach mail to the wrong contact) · object-list `q` with `%`/`_` on the SQL path is escaped (existing C1.7 SQL-path behaviour) · tracking statements fail closed on DB error (old limiter fail-open then counted).

## D. Open / notes for controller
- Board is 7 queries without custom-field filters; with `f` it is 9–10 (field-definition + sensitive-section lookups of the engine) — §12 budget scene has no `f`.
- I1 changes plans for `CrmContact … ORDER BY createdAt LIMIT n` with non-indexed filters (found: inbound previousEmails fallback → fixed with MATERIALIZED). Worth a glance in other `take`-with-createdAt Prisma queries on contacts after deploy.
- Not fixed (out of scope / info): phone substring search seq scan (qphone 334 ms, needs trigram), calendar month sort (F8), report scores 650 ms (F8), inbound stranger dup-check scans.
- member-side `fieldFilterWhere` (customer scope, `member/list.ts`) still uses the id-list pattern — not in this WO, same P2029 risk for member shops with > 32k matching customers.

## E. STATE AT QUOTA STOP (27 Sep ~17:40 UTC) — resume here
- Code: F1–F7 + guards + I1/I2/F7 indexes DONE (tree = final code; backup `.qc-shots/c51fix/backup2/` = patch + tgz + sha). After the perf run in §B and equivalence in §C, one more code change went in (stop: an oracle flagged it). getBoard/listDeals/forecast/getDeal360 now scope inline and pass `visibleDealSql`/`dealWhere` explicitly, `visible*Sql` renames, and the thread-visibility SQL moved to where.ts `visibleEmailRowSql` (for oracles C1.3-S0.3/C1.5-S0.9, now green). Typecheck after it: exit 0 (`typecheck-3.log`, run under iso.sh because in-session tsc was OOM-killed). **§B perf + §C equivalence were measured BEFORE that change → re-run both (next commands).**
- Fitness: both modes exit 0 (33/33) — run before that last change; re-run.
- Suites on final code (`.qc-shots/c51fix/suites/after*/_summary.txt`): green c1.3 89/89 · c1.4 110 · c1.5 103 · c1.6 79 · c1.7 57 · c1.9 45 · c2.11 47 · c3.1 56 · c0.4 72 · c1.2a 91 · c2.3 80 · c2.9 52 · c2.10 41.
  Red: c1.10 H.1 (HTTP :3215 key) · c1.11 S6.* (pages :3215) · c1.2b S8.2 · c2.0 S3.8 (**perf tenant pfco_* rows: 2+ primary contacts** → re-check after --drop) + S6.1 (m1.2) · c2.2 S6.5 / c2.5 S8.5 / c2.6 S8.4 / c2.7 S8.3 / c3.2 S5.1 (crm-ui-inventory rows) · c2.6-web (browser vs :3215) · m1.2/m1.3/m1.4/m3.8/m3.9 (member seed/answer key ≠ QC2).
  **Caused by this WO: C3.2-S0.4 + C3.6-S0.2 (+ C3.3 same rule, not run): `readdirSync(MIG_DIR).filter(d => /crm/i.test(d) && d > C30_MIG)` — any new migration folder whose name contains "crm" is red.** The controller's required name `_crm_perf_indexes` trips it → decide: ORACLE-EDIT (exclude `_crm_perf_indexes`) or rename the folder to e.g. `20261103000000_perf_indexes_c51`.
  Baseline (old code, migration moved aside) finished only 4/16 before the stop: c1.10 H.1, c1.11 S6.*, c1.2b S8.2 and c2.0 S3.8+S6.1 are **identical reds on the old code**. Still to run: c2.2 c2.5 c2.6 c2.6-web c2.7 c3.2 c3.6 m1.2 m1.3 m1.4 m3.8 m3.9.
- QC2 state: perf tenant `crm-perf-qc` still present (+ `--prep` fields). The 4 hand-made indexes are still on QC2.
- Next commands, in order:
  1. `bash scripts/iso.sh bash scripts/qc2.sh pnpm exec tsx scripts/qc-crm-perf.mts --out .qc-shots/c51fix/perf-after` (re-measure)
  2. equivalence: `…qc-crm-c51fix-equiv.mts --tenant qc|perf --out .qc-shots/c51fix/equiv-{qc,perf}-new.json`, then `--compare` against the `-old.json` files (the old files are kept).
  3. baseline for the remaining reds: `bash .qc-shots/c51fix/backup2`-style swap (patch → `git checkout HEAD -- $(cat .qc-shots/c51fix/backup2/files.txt)`, move the migration aside) + `run-suites.sh before …`, then restore from `backup2/new.tgz` and check `sha.txt`.
  4. `pnpm fitness` ×2 · `seed-crm-perf.mts --drop` (verify 0) · re-run c2.0 · drop the QC2 indexes only if `_prisma_migrations` has no `crm_perf_indexes` row.

### Controller ruling (Fable · 27 Sep ~17:25 UTC) — BINDING on resume
- Migration folder name stays `_crm_perf_indexes` (renaming to dodge a check = gaming the oracle). Apply ORACLE-EDIT to C3.2-S0.4 / C3.6-S0.2 / C3.3 (same rule): allowlist exactly this folder, and only while its SQL is index-only (the edit must assert every statement is `CREATE INDEX IF NOT EXISTS …` — any other statement ⇒ still red). Comment `// ORACLE-EDIT <id> (C5.1-fix · controller-approved index-only migration)`.
- The controller reads the migration SQL line by line (incl. the GIN index — say in the handback which query it serves and its size/build time on the perf tenant) and deploys it to QC via qc-prisma.sh; do not deploy.
- Resume order: re-run perf + equivalence + fitness on the final code → 12 baselines → --drop perf tenant → keep the QC2 hand-made indexes until the controller deploys (IF NOT EXISTS makes the deploy idempotent).

## F. Resume after quota (27 Sep ~18:45 UTC)
- **F.1 rebase onto main HEAD 130ca0c1 — DONE.** Overlap with c236a490/130ca0c1 = activities.ts · emails.ts · lost-reasons.ts only. My hunks there (import line + `crmSystemRow` in resolveSystem/enter · emails: import, resolveSystem, contactByAddress, listThreads, trackGate/Open/Click) sit in regions main didn't touch; applied with `patch -F0` (no fuzz, offsets ≤ 6), then verified: the +/- lines of `git diff 130ca0c1` equal my original patch byte-for-byte per file and in total (3,035 changed lines both), and main's C4.3-fix hunks (`failCode`, `lockLostReasons`, `stripInvisibleChars`) are intact. Worktree is now detached at **130ca0c1** + my uncommitted diff (backup `.qc-shots/c51fix/rebase/`).
- **F.2 ORACLE-EDIT (controller ruling) — DONE**: C3.2-S0.4 · C3.6-S0.2 · C3.3-S0.4 allowlist exactly `20261103000000_crm_perf_indexes` via `c51IndexOnly()` (every statement, comments stripped, must match `CREATE INDEX IF NOT EXISTS "…" ON "…" [USING x] (…)`). Controls (`.qc-shots/c51fix/oracle-edit-controls.json`): real file → allowed · +ADD COLUMN / +DROP INDEX / plain `CREATE INDEX` without IF NOT EXISTS / +UPDATE / other folder name → NOT allowed (still red).
- **F.3 GIN / F7 index facts (perf tenant, 200,190 contacts):** `CrmContact_previousEmails_idx` (GIN on "previousEmails") serves `emails.ts contactByAddress` fallback — `c."previousEmails" && $variants::text[]` (inbound mail from an address a contact used before; runs for every sender with no current-email match, i.e. every stranger). Without it: 269–320 ms (walks the whole system); with it + MATERIALIZED CTE: Bitmap Index Scan 0.9 ms. Size 312 kB (perf data has 0 previousEmails — grows with real ones) · build 944 ms (CONCURRENTLY copy, dropped). `CrmContact_systemId_lower_email_idx`: 12 MB · build 553 ms · direct match 0.05 ms (was ILIKE seq scan ~95 ms). I1 15 MB · I2 22 MB (C5.1 §5). Log `.qc-shots/c51fix/index-build-times.log`.
- **F.4 running** unit `crm-c51fix-phase-new` (`.qc-shots/c51fix/run-new-phase.sh` → `phase-new.log`): typecheck · fitness ×2 · perf (`perf-final/`) · equivalence new (`equiv-*-final-new.json`) · suites on final code (`suites/final-new/`). Next: old-code phase at main HEAD (equiv old + baselines), then compare, `--drop`.
- **F.5 (22:45 UTC, after container restart)** phase-new finished 19:47. Results on final code rebased on 130ca0c1: typecheck exit 0 (`typecheck-4.log`) · fitness 33/33 both modes · perf `perf-final/` pass 32 fail 0 · equiv new qc 422 scenes / 44 checks 0 fail · perf 547 / 144 checks 0 fail · suites `suites/final-new/_summary.txt` (C3.2 47/47 · C3.3 90/90 · C3.6 29/29 with ORACLE-EDIT; c2.5/c2.6/c2.7 now green on main's oracle sweep; NEW red C2.2-X8.6 = 11 real Resend calls from the real minute job — needs baseline). Now swapped to clean 130ca0c1 (backup `.qc-shots/c51fix/backup3/` patch+tgz+sha, oracles/harness kept) → unit `crm-c51fix-phase-old` (`run-old-phase.sh`, log `phase-old.log`): equivalence old + 16 baselines.
- **F.6 equivalence on the rebased base (old = clean 130ca0c1, new = final):** QC seed 422/422 identical · perf 443 identical + 104 old-crash scenes = reference · 0 diff · checks 44 + 144 all ok (`equiv-*-final-compare.txt`). Perf table vs C5.1 baseline: `.qc-shots/c51fix/before-after-final.md` (32 pass / 0 fail; `summary-after.json` refreshed). N+1 note "contacts.list 10:2 / 50:4" = same data artifact as C5.1 §4 (newest 10 contacts are owner-less, company-less inbound leads ⇒ the two name lookups are skipped) — constant 4 at 50/200.
- C2.2-X8.6 investigation: the 11 real Resend calls = 11 `CrmEmailMessage` SENT rows in the suite's own tenant `qc-c22-wqpbty-a` (subjects "ข่าว พร้อม1-0..10" = X5 round 1 contacts) at 19:26:58, i.e. sent in-process through the default sender (not the injected fake); X5.1/S5.2 still green (fake sends = 1 per contact, stats 24). Waiting for the clean-base result of c2.2 to classify.
- **F.7 baselines (clean 130ca0c1, same QC2, same perf tenant) vs final code — `suites/final-base` vs `suites/final-new`:** 15 of 16 suites have IDENTICAL finding ids (c1.10 H.1 · c1.11 S6.* · c1.2b S8.2 · c2.0 S3.8+S6.1 · c2.6-web 25 browser reds · m1.2/m1.3/m1.4/m3.8/m3.9 = environment/seed, red on main too; c2.5 · c2.6 · c2.7 · c3.2 · c3.6 green on both). Only difference: C2.2-X8.6 (base 73/73, new 72/73) → rerunning c2.2 ×2 on the final code (unit `crm-c51fix-c22`, `suites/c22-rerun/`). Final code restored, sha + patch identical to backup3.
- **F.8 C2.2-X8.6 classified as a non-reproducible transient:** final code c2.2 = 73/73 twice in a row (`suites/c22-rerun/`, 0 real fetches) and was also 73/73 in the pre-rebase run; red once (final-new) with 11 in-process real Resend calls for X5 round-1 fixtures (tenant `qc-c22-wqpbty-a`, rows left because the suite did not clean up on red). No code path of this WO chooses the sender (sequences.ts change = `crmSystemRow` only). Controller: those 11 calls reached Resend with fixture addresses — check the QC2 Resend key/domain if that matters.
- **F.9 perf tenant dropped** (`drop.log`: DROP_SUMMARY leftover {} · re-check: tenant 0 · pf* contacts 0 · pf*/c51f_* values 0 · fields 0). The 4 hand-made QC2 indexes KEPT (verified present). c2.0 after the drop: S3.8 green (it was the perf tenant's multi-primary rows) · S6.1 (m1.2 regression) still red = red on main too.
- **STATUS: DONE.** Worktree = detached at main HEAD 130ca0c1 + uncommitted diff (backup3 = exact copy). Not committed, migration not deployed.

## ✅ C5.1 ACCEPTED by controller (28 Sep 2026 01:47 UTC)
- C5.1 oracle (seed-crm-perf + qc-crm-perf) + C5.1-fix (F1–F7 · per-request crmAccess memo · list-sql.ts · migration 20261103000000_crm_perf_indexes index-only) · independent reviewer MERGEABLE (visibility SQL = same rules, all values bound, request-scope keyed tenant|system|user, no cross-request cache).
- Builder evidence (QC2, rebased on 130ca0c1): perf 32/32 budgets (was 9/32) · equivalence 422/422 QC seed + 443 perf + 104 crash scenes = 0 diffs · 15/16 suites identical to main.
- Controller main gate (`.qc-shots/crm/c51fix-main.log`): migrate deploy + status QC2/QC1/QC3 green · c1.3 c1.4 c1.5 c1.6 c1.7 c1.9 c2.2 c2.5 c2.6 c2.7 c2.11 c3.1 c3.2 c3.3 c3.6 c3.9 c3.0 m1.2 all exit 0 · typecheck 0 · fitness ×2 · (qc-crm-c51fix-equiv refuses non-QC2 by design — proven on QC2 by builder + reviewer).
- Open: C2.2-X8.6 intermittent (sequence runner outside the suite's fetch stub via runMinuteJobs) — own ticket · deal cursor hardening via dealWhere (reviewer NOTE).

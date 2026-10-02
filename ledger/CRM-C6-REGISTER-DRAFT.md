# CRM v2 — C6 handover register (DRAFT)

Started 2026-10-01 08:55 UTC · **DEADLINE 09:35 UTC** (40-min time box) · read-only analyst · no DB/tests/builds/typecheck run · only `git` reads.
Paths: main = `/root/projects/shark-crm` (branch `session/crm` @ 2629997c). Worktree paths abbreviated `c54c:` = `/root/projects/shark-crm-c54c/` etc. "N" = C5.4-N note (`c54c:ledger/wo-notes/crm-C5.4-N.md`).

**Branch fact found while reading (affects everything below):** `origin/main` = 04d2ade9 (12 non-CRM design/ledger commits after prod 3677d983, pushed by the POS/HR design session) — `session/crm` does **not** contain them (`git rev-list HEAD..origin/main` = 12; `origin/main..HEAD` = 96). The prod push needs a merge, not a fast-forward. Also: migration `20261103000000_crm_perf_indexes` (C5.1, commit 98fd480a) is **not on origin/main** ⇒ it is NOT on prod yet and ships with the next push (together with C5.4-N's migration if N is merged by then).

## 1. C6.1 candidates (schema / index / column / crontab / env)

| # | item | why | source | owner go? | risk if skipped |
|---|---|---|---|---|---|
| 1.1 | Install the 3 crontab lines of `scripts/crm-cron.mts` on the VPS (`* * * * *` minute · `7 * * * *` hourly · `40 20 * * *` daily = 03:40 TH; each `flock -n`, `cd /root/projects/shark-in-th`, log `/var/log/shark-crm-cron.log`) | Only runner of hourly/daily CRM cadences (Vercel `/api/cron/outbox` runs minute cadence only; no `/api/cron/daily`) | `scripts/crm-cron.mts:14-18`; MASTER-PLAN §9 C6.1 (l.243); c54d:`crm-C5.4-D-review.md:145-160` (N7); `crm-C2.1.md:81,88` | YES (P7) | v2 WAIT steps, time-based rules, stale-deal/overdue sweeps, PDPA purges, scheduled reports never run. **Hard gate: no pilot before crontab** (RESUME §4 l.299) |
| 1.2 | VPS checkout `/root/projects/shark-in-th` must be at the **deployed commit** before/while crontab runs | crm-cron minute = platform-wide outbox drainer (every tenant, every module) | c54d:`crm-C5.4-D-review.md:138-143` (N6) | YES (with 1.1) | consumers of a different code version process prod events |
| 1.3 | Env parity VPS `.env` ↔ Vercel prod: **SESSION_SECRET and APP_URL byte-identical**; plus consumer secrets (Resend, LINE, Ably, Blob) | D2 tokens = HMAC over SESSION_SECRET; redelivery on the other host ⇒ `NOT_REPRODUCIBLE` (step SKIPPED) | cd2:`crm-C5.4-D2.md:45-46`; cd2:`crm-C5.4-D2-review.md:26,43`; c54d D-review N6 | YES (owner holds `.env`) | sequence steps skipped / unsubscribe & tracking links break across hosts |
| 1.4 | `@@index([providerId])` on `CrmEmailMessage` + stored indexed RFC Message-ID column (replace `lower(right("messageId",n))` scan) | every Resend webhook = seq scan; F2 fallback = second scan | cd2:`crm-C5.4-D2.md:47`; cd2:`crm-C5.4-D2-review.md:76-80` (N2) | migration ⇒ yes | webhook latency grows with mail volume; no correctness loss |
| 1.5 | Index `OutboxEvent(tenantId, type, createdAt)` | integrations page 90-day scan (statement_timeout 8 s) | `crm-C3.6.md:54,83` | migration ⇒ yes | page times out on big tenants |
| 1.6 | Unique `AccountContact(systemId, partyId)` — count duplicates read-only on prod first | C1.1 deferred constraint | `crm-C1.1.md:52`; `crm-C3.0.md:40` | yes | duplicate account contacts per party possible |
| 1.7 | Unique "one primary per company" on `CrmCompanyContact` (after `crm-backfill-companies-from-text`) | C2.0 R1 deferred | `crm-C2.0.md:12,16`; `crm-C3.0.md:40` | yes | two primaries per company |
| 1.8 | Make previously-nullable columns NOT NULL (unspecified list) | C3.0 deferral | `crm-C3.0.md:40` | yes | none immediate; open item without a list |
| 1.9 | FK `HrPayAdjustment.crmCommissionId → CrmCommission` ("if wanted") — today a soft two-way link + partial unique | validation reads the whole table | `crm-C3.0.md:41`; `prisma/schema/crm.prisma:1252`; RESUME l.41 | yes | orphan links possible (HR deliberately independent of CRM) |
| 1.10 | AppNotification columns `dedupeKey` / `deferredUntil` / `channels` (C2.10 B1) | listed as C6.1 candidate; grep finds no such columns in `prisma/schema` | RESUME l.41; `crm-C2.10.md` | yes | digest/defer behaviour stays as built in C2.10 (status unclear — see §7) |
| 1.11 | C5.4-N migration `20261104000001_account_journal_no_sequence` (5 sequences/system, 10 SQL functions, DO block pre-creates ≤500 systems active in 90 d, `search_path` pinned) | JV numbering race P20 | N l.338-352, 431-499; c54c:`crm-C5.4-N-review.md` §R | YES (P20 + push) | without it: 3 cashiers ⇒ 80 % single payments fail (pre-existing on prod) |
| 1.12 | Prod app DB role needs `CREATE` on schema `public` (or app role = migrate role) | new systems create their `acc_jno_*` sequences at accounting setup / first posting | N runbook pre-check 3 (l.~445); RESUME §0.21 N DONE line | YES | new shops' FIRST posting refused "ออกเลขที่ใบสำคัญไม่ได้…" |
| 1.13 | `crm_perf_indexes` (I1/I2/F7a/F7b; `CREATE INDEX IF NOT EXISTS`, NOT concurrently ⇒ write lock while building) | already merged on session/crm, not on prod | `prisma/migrations/20261103000000_crm_perf_indexes/migration.sql:1-3` | rides with push | none if prod tables small (author's claim); check row counts first |
| 1.14 | Rest of N5 (write paths that do not wake the drain: chat CRM panel, mobile POST routes, portal actions, public `/t` `/l` `/u`, `/api/email/inbound`) | picked up ≤1 min by crm-cron minute drain once crontab exists, else hourly | c54d D-review N5 l.127-136; cd2 D2 l.21,49 | no (follows 1.1) | ≤1 h delay of their events without crontab |
| 1.15 | Cadence notes N7: killed daily job loses its window (cut-off recorded as run); up to 4 cut-off jobs run concurrently; minute run ≤110 s, `flock -n` skips ticks | design notes for runbook | c54d D-review N7 l.145-160 | no | a purge/retention job can silently skip a day |
| 1.16 | L55-5 after-drain coalescing decision (a) request-scoped store (b) one `after()` per request (c) accept minute drainer as SLO | debt, see §4 | c54e:`crm-C5.5-fix1.md:49-52` | controller | events of other requests delayed ≤15 s / ≤1 min |
| 1.17 | `CRM_INBOUND_AUTHSERV_ID` (Vercel prod env) — only after a live forged-twin test | P14 | OWNER-PENDING P14 | YES | unset = staff BCC copies stored as incoming (safe) |
| 1.18 | `RESEND_WEBHOOK_SECRET` on prod | P9 | OWNER-PENDING P9 | YES | unset = webhook 401 (safe, but no delivery/bounce/complaint events) |
| 1.19 | C6.1 read-only probe: extend `scripts/prodmig.cjs` to list `%crm_v2%`; check every tenant `uiVersion`=1; outbox ERROR `crm.*` 24 h = 0 | brief | `crm-briefs/crm-brief-C6.md:5` | read-only | — |
| 1.20 | Pending gate D-review F1–F6 "before any shop runs v2 sequences with the crontab" — closed by D2 if D2 r2 merges | gate | c54d D-review l.486, 581 | — | D2 not merged ⇒ sequences must not run on prod |

## 2. Production runbook inputs (deduplicated)

| # | instruction | source |
|---|---|---|
| R1 | Prod is touched only by (a) normal Vercel deploy of `main`, (b) read-only checks, (c) C6.2 backfills after dry-run + explicit owner "ทำ" on Telegram. Never edit/source `.env`. | brief C6 l.2; MASTER-PLAN l.42 |
| R2 | `git push origin HEAD:main` = prod deploy = owner approval every time (and costs Vercel build CPU). session/crm must first absorb origin/main's 12 design commits (see header). | RESUME §0.20/§0.21; memory |
| R3 | Vercel prod build = `scripts/vercel-build.sh`: `prisma migrate deploy` + `migrate status` BEFORE `tsc --noEmit` and `next build` ⇒ **merge to main = migrate prod**; migrations must be additive (old code serves on the migrated DB during build). A failed build after migrate leaves old code on new schema. | `scripts/vercel-build.sh:12-27`; N l.432 |
| R4 | N pre-checks on prod (read-only SQL, copy-paste in N l.434-455): lock capacity (`max_locks_per_transaction × (max_connections+max_prepared)` ≥ 2× 500×5.1); journal docNo shapes (both counts 0); `current_user` + `has_schema_privilege(...,'public','CREATE')` over DATABASE_URL **and** DIRECT_URL; `acc_jno_%` = 0 and `_prisma_migrations LIKE '2026110400000%'` = 0; CI of merge commit green incl. `migrate deploy` on fresh Neon branch (note duration) and `pnpm drift` (first standalone sequences/functions — unverified, review n4); owner answered Q1. | N l.431-457 |
| R5 | Timing: quiet hour, not month-end close, no other migration in the same deploy, someone watching migrate→tsc→build (5–40 min). ⚠ conflicts with fact that `crm_perf_indexes` is also unshipped ⇒ ship it in a separate earlier deploy or accept two migrations. | N l.459-460 + header fact |
| R6 | Smoke after N live: service invoice 3 % WHT (TI+WTI numbered, `RV-yyyy-mm-…`); vendor payment 3 % WHT (50 ทวิ numbered); journal "สร้าง JV" preview stable on reopen; new ACCOUNT system ⇒ 5 `acc_jno_<id>_%` sequences. Watch 1 h: logs `[account/gl] journal number allocation failed`, `journal sequences not created at setup`, P2002 on AccountJournalEntry — all 0. | N l.466-476, 491-492 |
| R7 | **Rollback rule (M2): never Vercel Instant Rollback to a pre-N release** (old count+1 freezes a book for the month). Prepare rollback build beforehand = previous release + N's `gl.ts` parts + `journal/page.tsx` peek. Legal-tail part may be reverted. Never drop the sequences; no down-migration. | N l.484-489; N-review M2 |
| R8 | Re-floor SQL only for a build without M1 (diagnostic query read-only first). | N l.477-483 |
| R9 | General CRM rollback = set `uiVersion` 1 (+ `bridgesEnabled` false if consumers misbehave); data stays (all migrations additive). | brief C6 l.11 |
| R10 | C6.1 checks: `_prisma_migrations` has crm_v2_a/b/c (+ perf_indexes, N after deploy); all tenants `uiVersion`=1; outbox ERROR `crm.*` 24 h = 0; v1 pages visually OK via prod visual method (memory `reference_shark_prod_visual_qc`; dev does not hydrate). | brief C6 l.5; MASTER-PLAN l.243 |
| R11 | C6.2 backfills: every `scripts/crm-backfill-*.mts` (companies-from-text, contact-names, lost-reasons, party-links, stage-history, visibility) with `ALLOW_PROD_BACKFILL=1 … --dry-run` → numbers per tenant to owner via `tg` → "ทำ" → real run tenant by tenant → 2nd run = 0 changes. Plus P15 scripts (`scripts/pending/c54b/backfill-revoke-ended-portal.mts`, `scripts/pending/c54c/backfill-invoice-status.mts` — live in worktrees, check they are on session/crm) and the API-key-without-creator count. `crm-backfill-companies-from-text` must precede unique 1.7. | brief C6 l.8; OWNER-PENDING P15; `crm-C2.0.md:12` |
| R12 | C6.3 pilot: owner names tenant → `uiVersion` 2 for that CRM system only → 5-role walk-through over blueprint §3 with temp contacts tagged `qc-prod-` (deleted after) → no real e-mail/LINE except owner's own address → watch OpsEvent/outbox 24 h. Include P19 real Resend send (Message-ID kept?). **Not before crontab (1.1).** | brief C6 l.11; P19; RESUME l.299 |
| R13 | crm-cron env: uses project `.env` (prod). Never combine `QC_ENV_FILE` with prod DATABASE_URL; source `.env` with `&` in URL leaks to prod — use grep|cut. | `scripts/crm-cron.mts:20-23`; memory `reference_env_sourcing_ampersand_prod_leak` |
| R14 | Vercel build memory: tsc split step + `NODE_OPTIONS=--max-old-space-size=6144` already in vercel-build.sh; build has hung at "Running TypeScript" before (28 Sep). | `scripts/vercel-build.sh:29-37` |
| R15 | Index migrations here are not CONCURRENTLY ⇒ brief write lock on CrmContact/CustomRecord during build; read row counts first. | perf_indexes migration header |
| R16 | C6.4: `ledger/HANDOVER-<date>-CRM.md` (per-WO table + commits · real bugs · every ORACLE-EDIT with evidence · debts · owner-pending · rollback) + evidence pack MASTER-PLAN §10 + memory + Telegram → STOP for Fable audit. | brief C6 l.14 |

## 3. Owner-pending decisions (P-numbers + new on 1 Oct)

Source for P1–P21 = `ledger/CRM-OWNER-PENDING.md` (line = P#+6). Status as of 1 Oct.

| # | decision | default taken now | consequence of default |
|---|---|---|---|
| P1 | prod push 28 Sep | ✅ done (3677d983) | — |
| P2 | CP3 owner tries QC shop (portal + commission→payroll) | wait (after C3.10) | blocks C3.10 close |
| P3 | Q7 unsubscribe line in 1:1 sales mail | YES both kinds | every sales mail has an unsubscribe line |
| P4 | Q8 v1-era payments counted into deals | NO catch-up | old v1 payments not shown as deal revenue |
| P5 | Q9–Q12 commission (drafts in `crm-C3.3.md`) | draft defaults | — (still not moved into OWNER-QUESTIONS) |
| P6 | Q13 who presses AI buttons | everyone who can read CRM | AI credit spend by any CRM reader |
| P7 | approve prod backfill · pilot shop name · install crontab | wait | **no pilot possible** |
| P8 | quota warnings | — | — |
| P9 | `RESEND_WEBHOOK_SECRET` on prod | leave unset | webhook 401 ⇒ no delivered/bounce/complaint events (sequences cannot stop on bounce) |
| P10 | Q14 won value before/after VAT | before VAT everywhere (one constant `payments-shared.WON_VALUE_BASIS`) | invoice-won deals show pre-VAT |
| P11 | Q15 `/l/<code>` open redirect | default (ข) destination policy + Safe Browsing — **NOT built**: `linkDestinationAllowed()` returns `true` (`src/lib/modules/crm/tracking.ts:1502`; `crm-C5.4-F.md:7`) | any shop can still redirect anywhere via shark.in.th ⇒ domain-reputation risk for every shop's mail |
| P12 | Q16 API key dies with creator's access | yes (C5.4-B keys ⊆ creator) | — |
| P13 | clawback auto-approved | auto | approver cannot reject clawback |
| P14 | `CRM_INBOUND_AUTHSERV_ID` | unset (fail-closed) | staff BCC copies stored as incoming |
| P15 | 3 prod clean-ups (keys w/o creator · revoke ended portal · invoice status) | dry-run first, owner `--apply` | until run: ex-company people keep portal access; some invoices stay "partly paid" |
| P16 | platform "download shop data" w/o reason/audit | add reason + audit (small, platform) | **not built** in CRM RUN (outside scope) — export without audit trail continues |
| P17 | docs of company-linked deals issued to company; backfill old docs? | leave as is | old docs stay on the person; new ones vanish from person's member history/PDPA export |
| P18 | call transcription (no STT provider) | (b) ship without, hide section | no AI transcription in pilot |
| P19 | real Resend send (Message-ID kept?) | controller test send in C6.3 | if Resend rewrites Message-ID: replies not marked, sequences keep sending (code fallback via +t tag promised — verify built) |
| P20 | JV numbering | (a) DB sequence, gaps allowed | JV numbers may have gaps; legal docs stay gapless |
| P21 | company score | keep hidden | — |
| **New-1** | **Q1 of C5.4-N: JV numbers no longer restart monthly** while display keeps `XX-yyyy-mm-nnnn` (e.g. `SV-2026-11-0153` after `SV-2026-10-0152`) | accept (no monthly reset; isolated in one function) | accountants may expect 0001 each month; per-month sequence = DDL monthly in money tx (rejected) · N l.264; RESUME §0.21 |
| **New-2** | **Prod app DB role needs CREATE on schema public** (or app role = migrate role) | recommend grant / same role (told in chat) | otherwise new shops' first posting refused · N runbook pre-check 3 |
| **New-3** | **Deploy window + rollback rule for N**: quiet hour, not month-end, watched build; never Instant Rollback past N | per runbook | rollback freezes a book for the month · N l.459, 484 |
| **New-4** | Q5 of N: one-time visible jump (margin 100) on recently active systems | margin 100 ok (ruling) | JV numbers jump once by ≤100 · N l.268 |
| **New-5** | **Platform webhook page** `/app/settings/webhooks` can subscribe to `crm.*`/all events without CRM visibility rule | ruling 1b: require CRM creator rule for crm.*/all-events (tenants w/o v2 unchanged; **stored endpoints untouched**) | existing endpoints keep receiving all CRM events; events are not filtered to the endpoint's CRM system · `c54e:crm-C5.5-fix1.md:57`; RESUME §0.21 |
| **New-6** | **Automation approval ceilings**: GIVE_POINTS (≤100,000/firing) / ISSUE_VOUCHER not mirroring manual approval | ruling 1b: refuse at save above author's approval-free manual ceiling; reassign/day = debt; enroller not checked | rules saved before the fix keep firing as OWNER until next edit · fix1 l.56 |
| **New-7** | H55-1: same-key retry after transient DB error now answers 409 `idempotency_outcome_unknown` (was 503 + rerun) | built (fix1 r1) | external connectors that auto-retry 5xx will now stop and surface it · fix1 l.55 |
| **New-8** | Release note (UI re-review r2): default STAFF can now reassign contacts (blueprint) | as built | staff can move contacts between owners · RESUME §0.19 ~21:00 |
| **New-9** | J3 visitor tracking residual list (9 items, owner-visible) incl. consent-version bump ⇒ earlier anonymous browsing never linked; form waits ≤1.5 s if visitor has not accepted | accepted by design | see cj3 `crm-C4.4-fix3.md:106-125` |
| **New-10** | Q5 (old): rehearse migrations on a Neon branch of prod? | "additive only + read every SQL line" | N runbook R4 already relies on CI migrate on a prod-branch — needs Q5 = yes in practice · `CRM-OWNER-QUESTIONS.md:15` |
| **New-11** | `BUNNY_ACCOUNT_KEY` (private files fully closed) | waiting | private files not fully locked · `CRM-OWNER-QUESTIONS.md` C0 note 3 |

## 4. Accepted debt / residual risks (by module)

| module | item | owner-facing consequence (plain) | source |
|---|---|---|---|
| Accounting numbering | JV gaps + no monthly reset (P20/New-1) | journal numbers can skip and keep counting across months | N §1a |
| Accounting numbering | C5.4-N2 not built: own doc numbers (TI/expense/goods docs) still held for the whole tx | a long goods invoice can make another cashier's tax invoice wait (no failure measured at 2 s) | N l.354-360 |
| Accounting | Q3: month's `AccountPeriod` created inside money tx | first posting of each month may wait once on another first posting | N l.362-364 |
| Accounting | Q4: POS `TAX_INVOICE_ABB` numbering never reviewed | unknown race risk on POS short tax invoices | N l.365 |
| Accounting | R11-4/R11-5 design notes · deposit part-transfer/part-cheque old-shape rows (R10-4) | a few old deposit receipts behave the old way until unwound | `crm-C5.4-C.md:187` |
| Accounting | cheque-audit "7 legacy audit findings" every run (exit 0) · `qc-tax-print-audit` crashes on its own fixture | that audit area is not actually verified | RESUME §0.21 l.44; `crm-C5.4-C.md:141` |
| Accounting | M2 rollback hazard | rolling back past N freezes a book for the month (runbook rule) | N-review M2 |
| CRM e-mail | D2-N3: redelivery reuses first from-domain even if unverified since | Resend 403 ⇒ shop-wide outage notice + 72 h retries (low) | cd2 review l.81 |
| CRM e-mail | D2-N4: tokens are HMAC(SESSION_SECRET) | whoever holds SESSION_SECRET can mint open/click/unsubscribe tokens (house pattern) | cd2 review l.82-85 |
| CRM e-mail | SESSION_SECRET/APP_URL rotation or host mismatch | in-flight redeliveries skipped as NOT_REPRODUCIBLE | D2 l.46 |
| CRM e-mail | P19 Message-ID assumption unverified | if Resend rewrites Message-ID, follow-up sequences keep sending after a reply | P19; D2 l.48 |
| CRM e-mail | webhook providerId lookup unindexed (until 1.4) | slower bounce/delivery processing as volume grows | D2-review N2 |
| Automation | H55-2 stored rules unchanged until edited; no author column | a demoted/removed author's rule keeps acting with OWNER power | fix1 l.56 |
| Automation | reassign/day ceiling not mirrored; CREATE_ACTIVITY assignTo others; sequence enroller not checked | a rule can reassign/assign more than a person could by hand | fix1 l.56 |
| Platform REST | H55-1 store-failure window | rare: 409 in_progress for 6 min then handler re-runs | fix1 l.55 |
| Platform REST | key-less public signup lane has no idempotency claim | duplicate signups on retries possible (unchanged) | fix1 l.55 |
| Webhooks | L55-4/New-5 stored endpoints + no per-system filter | existing endpoints keep getting every CRM event of the tenant | fix1 l.57 |
| Outbox | L55-5 after-drain coalescing | rare: other requests' events wait ≤15 s, else ≤1 min (crontab) | fix1 l.49-52 |
| Outbox | N5 write paths that do not wake the drain | chat panel/mobile/portal/public/inbound events wait ≤1 min (≤1 h without crontab) | D-review N5 |
| Cron | N7 killed daily job loses its window; ≤4 cut-off jobs concurrent | a purge/retention run can silently skip a day | D-review N7 |
| Notifications | C2.10: fanout lookback 36 h; digest cap 1000+ not probed; 9/10 templates no sender | if crontab is down >36 h deferred notices are lost | `crm-C2.10.md:136` |
| Web tracking/forms | J3 residual 1–9 | see New-9 (forged visitor id can attach history to a fake lead; etc.) | cj3 fix3 l.106-125 |
| Short links | P11 hook not built | open redirect on shark.in.th stays | tracking.ts:1502 |
| UI gating | C4.2 F1: `/companies` list + nav tab not gated by `crm.company.read` | a staff member without company rights still sees the companies page shell/list | c42b `crm-C4.2.md:314` (companies/page.tsx:48-56, nav.ts:30) |
| UI a11y | C4.2 F2 `deal-stage-tab-*` + `crm-notify-tab-mine` no aria state | screen readers cannot tell the active tab | c42b `crm-C4.2.md:146,315` |
| UI v1 | C4.1 D4: v1 UI (`crm/ui.tsx`) outside the button registry | prod v1 pages not covered by the button oracle | `crm-C4.1.md:253` |
| Company | P21 score hidden; lifecycle derived forward-only | company page shows no score | P21 |
| Calls | P18 no STT | no automatic call transcripts | P18 |
| QC data | QC1 3 orphan CrmEmailMessage + 28 Sep residue | test reds only (no prod effect) | RESUME §0.20 |

## 5. Follow-up cards not built

| card | scope (one line) | source |
|---|---|---|
| C5.4-N2 | move `issueDocument`/`issueExpenseDoc`/goods docs/`submitForApproval` doc numbers to the tail (`openDocNumbering`+`deferDocNo`+`finalizeDocNos`) + N6-style oracle | N l.354-360 |
| N-Q3 | create the month's `AccountPeriod` in autocommit before the money tx | N l.362-364 |
| N-Q4 | review POS `TAX_INVOICE_ABB` numbering for the same race | N l.365 |
| Webhook delivery filtering | filter crm.* events per endpoint's CRM system + re-check stored platform endpoints | fix1 l.57 (hunter's 2nd suggestion) |
| L55-5 | after-drain: request-scoped coalescing or one `after()` per request (+ORACLE-EDIT probe-c54d S3/R2N6) or accept SLO | fix1 l.49-52 |
| Automation author column | store rule author; re-validate/disable rules when author demoted; reassign/day ceiling; enroller check | fix1 l.56 |
| D2-N2 index | `@@index([providerId])` + stored indexed Message-ID column (migration) | D2 l.47 |
| N5 rest | wake drain from chat panel, mobile routes, portal, public `/t` `/l` `/u`, inbound | D-review N5; D2 l.49 |
| N7 cadence | do not record cut-off as "run" for hourly/daily jobs | D-review N7 l.153 |
| P11 destination policy | implement `linkDestinationAllowed()` (allowlist/Safe Browsing) or separate short-link domain | P11; `crm-C5.4-F.md:7` |
| P16 | platform shop-data download: reason + audit line | P16 |
| P17 backfill | re-issue/attach old company-deal docs to the company | P17 |
| P18 STT | connect a speech-to-text provider (own card) | P18 |
| P21 company score | real company score (sum/max of contacts or deal-based) | P21 |
| J3 R2-N1 / R2-N2 | tracker answers at once when visitor has not accepted (kill 1.5 s wait) · hashed hosts in the RSC prop | cj3 fix3-review l.179-180 |
| C4.2 F1/F2 fixes | gate `/companies` + nav by `crm.company.read`; aria state on stage/notify tabs | c42b `crm-C4.2.md:146,314-315` |
| C4.2 it4 remainder | run3 (nok/thana/customer not run in run2; manager `/companies` chunk FATAL to re-cover) → accept C4.1/C4.2 | c42b `crm-C4.2.md:327,394` |
| C5.5 part 2 | hunters on N + D2 diffs + second random lens; hunt-2a (portal `/b` IDOR + inbound parser) in progress | RESUME §0.21 |
| C5.5 not covered | account side of L1-M3, connections rotate/revoke (B-H2), C5.4-B erase masking re-probe, browser UI gating, portal IDOR probe, H55-2 run path | `c54e:crm-C5.5-hunt-1.md:68-76` |
| C3.10 | qc:all full on reseeded QC1 + CP3 + phase handover | RESUME §0.20 table |
| D-review F5 (if not done) | owner notice for e-mail outage (E3 `noticeEmailOutage` — D2 says verified) | c54d D-review l.~604; D2 F5 |
| C2.10 | senders for 9/10 notification templates; digest cap probe | `crm-C2.10.md:136` |

## 6. Gate hygiene findings

### 6a. `pnpm docs --check` is a no-op
- `package.json` has **no `docs` script**; pnpm 10.33 runs its built-in `docs` (prints the npm URL, exit 0). Proof in `.qc-shots/crm/main-c2.log:7-10`: `shark-in-th docs available at the following URL: https://www.npmjs.com/package/shark-in-th` · `exit=0`.
- Callers (all gate scripts; **none in CI, package.json, vercel-build.sh or the pre-commit hook**):

| file | line |
|---|---|
| main `scripts/pending/run-main-c2.sh` | 9 |
| main `scripts/pending/run-main-ui.sh` | 15 |
| main `scripts/pending/run-main-e.sh` | 12 (via `scripts/qc3.sh`) |
| cd2 `scripts/pending/cd2/run-regress.sh` | 13 (via iso.sh + qc3.sh) |
| copies of the 3 main scripts in cd2, c54e; `run-main-ui.sh` in c42b | same lines |
| builder unit scripts under `/tmp/*-logs/` (e.g. c54n `r2/full.sh` "docs-check rc 0 (no-op)") | not in repo |

- Real check: `pnpm exec tsx scripts/gen-{crm,member,kanban,account}-api-docs.mts --check` (exit 1 if stale; crm checks `docs/` only, the other three also cover the gitignored `.claude/skills/shark-*-api/` files).
- **Mitigation already in place:** `pnpm fitness` F13.2 (account, `scripts/fitness.mts:850-863`), kanban (:905), member (:952), F13.11 crm (:998-1006) compare `docs/api/*-API.md` with each generator's `renderDocs()`. Every gate ran fitness ×2, so `docs/api/*.md` drift WAS gated; only the skill-folder part of `--check` was never gated (and is gitignored anyway). Earlier "docs --check 0" lines are void as evidence but not a hole in docs/api.
- Fix: replace the step in future gate scripts (copy to new names — never edit a running script) with the 4 generator `--check` calls, or add `"docs": "tsx scripts/gen-crm-api-docs.mts --check && …"` to package.json.

### 6b. Other `pnpm <name>` invocations vs package.json scripts
Distinct `pnpm` verbs used by `scripts/*.sh`, `scripts/pending/**/*.sh`, `.github/workflows/ci.yml`, `scripts/vercel-build.sh`, `.githooks/pre-commit`: `exec` (630) · `fitness` (129) · `typecheck` (72) · `qc:all` (5) · `docs` (3) · `install` (2) · `drift` (1) · `db:generate` (1) · `build` (1).
- All exist in package.json except **`docs`** (only silent no-op found). `exec`/`install` are real pnpm built-ins.
- pre-commit hook (`.githooks/pre-commit`, `core.hooksPath=/root/projects/shark-in-th/.githooks` — absolute path into the other checkout; identical content today) runs `pnpm exec tsx scripts/fitness.mts` — real.
- Soft gates of a related kind (not no-ops, but can pass without checking): (1) CI T1 `qc:all` + `drift` **skip with a warning when `NEON_API_KEY`/`NEON_PROJECT_ID` secrets are missing** (`ci.yml` "ตรวจ secret" step) — whether they are set is unknown from files; (2) `scripts/with-gate-lock.sh:9` runs unlocked when `CI`/`VERCEL` set or flock missing (intended); (3) gate runner `r()` records `exit=` and never stops (by design; the controller must read every `exit=`); (4) qc:all seeds member/CRM only when the seed is **absent** (`scripts/qc-all.mts:176-250`) ⇒ stale QC data is reused silently; (5) `qc-account-api-docs`/m1.11/k1.15 read gitignored skill files ⇒ result depends on which checkout runs them.

### 6c. Known environment reds / time bombs

| red | cause | what clears it | source |
|---|---|---|---|
| ai-skill `E1-K2.3` (`scripts/qc-account-api-ai-skill.mts:65`, overdue tab = 4 invoices) | date roll vs seed due dates | re-seed acc-v2 (dates relative to seed day) — assumed, verify; or fix oracle to compute "overdue" from today | RESUME §0.21 l.44 |
| `qc-acc-v2-recurring` 161/163 (P4.13b/c PP30 reminder dedupe) | date bomb: Bangkok date ≠ UTC date (seen at UTC 30 Sep / TH 1 Oct) | run when TH and UTC dates match (00:00–17:00 UTC) or fix oracle to use the Bangkok day | `crm-C5.4-C.md:141`; c54c N l.397 |
| `qc-account-api-docs` 11/17 (F2.1–F2.7) | gitignored `.claude/skills/shark-account-api/*` absent/different per worktree | run from the main checkout with skills generated (`gen-account-api-docs.mts` without `--check`) | `crm-C5.4-C.md:141`; `crm-C0.3.md:61` |
| c3.1 54/56 (S1.8, X1.1) | 4 orphan REVERSED CrmCommission rows on QC1 (28 Sep journeys) | QC1 reseed | RESUME l.89, l.143 |
| m1.9 25/26 · m1.11 S2.2 (62≠60) | 3 extra members from journeys | QC1 reseed | RESUME l.89; CRM-RUN l.612 |
| c3.7 X1.2/S1.1 (+S1.x/S2.x shots) | missing seed e-mail thread; screenshot artefacts absent in worktrees | QC1 reseed + run visual-crm/shoot in the same tree | RESUME l.89; c54e E-review l.183 |
| c1.10 S7.2 (webhook endpoint receives crm.deal.won + contact.created) | identical on untouched HEAD; **cause not identified** | open (see §7) | E-review l.182; fix1 l.62 |
| c1.10 H.1 (HTTP probe :3215) | probes whatever build serves :3215 (other lane/DB) | rebuild :3215 from the HEAD under test on QC1 | fix1 l.62; `qc-crm-c1.10.mts:1568-1581` |
| m1.11 S3.3 / S5.2 · k1.15 S3.2/S3.4 | gitignored `.claude/skills/shark-{member,kanban}-api/SKILL.md` missing in worktree; S5.2 screenshot parity; S3.2 dnd-kit | run in main checkout with skills + shots | fix1 l.62; `crm-C3.8.md:141-142`; RESUME l.37 |
| c1.2b-S8.2 | pre-existing limits warning at 29 | none needed (pre-existing) | E-review l.181 |
| coa T15 | oracle rots over time | oracle fix | RESUME l.37 |
| cheque-audit "60 checks · fail 7" (exit 0) | 7 legacy audit findings | none — but it means the audit is not a gate | RESUME l.44 |
| `qc-tax-print-audit` crash on own fixture | createContact tax-id validation | fixture fix | `crm-C5.4-C.md:141` |
| promptpay PP16 (QC2) | no staticPending row | reseed acc-v2 on QC2 or fix fixture | RESUME l.183 |
| probe-c54d FATAL | needs SESSION_SECRET (no loadQcEnv) | `scripts/pending/cd2/with-qc3-secret.sh` pattern | cd2 D2 l.29,36 |

### 6d. QC1 reseed before C3.10 — required order (from notes)
0. Stop everything on QC1: `bash scripts/acc-v2-serve.sh stop` (:3215), no units holding `/tmp/shark-gate.lock`; snapshot odd data before reseed (RESUME §4 l.292).
1. Apply any newly merged migration to QC1 first (`qc-prisma.sh` migrate deploy) — N's `20261104000001_…` once N is on session/crm (RESUME §0.21 N-review line: "QC1 needs the migration via qc-prisma.sh first"). Do NOT carry QC2's orphan `20261104000000` record.
2. Run from the **main tree** (`qc-owner-guard.mts`: other worktrees exit 5 on QC1 reseed), env `DATABASE_URL/DIRECT_URL` from `.env.qc` via grep|cut, `QC_ENV_FILE=.env.qc`, `CRM_V2_SWITCH=all` (pattern `scripts/pending/run-qc1-reseed.sh`).
3. `seed-member-qc.mts` → **`qc-member-m1.1.mts` (only here: it re-runs the member seed and wipes CRM)** → `seed-crm-qc.mts` #1 → `seed-crm-qc.mts` #2 (idempotency) → `seed-acc-v2-qc.mts` → (kanban seeded by qc:all if missing) → copy fresh `scripts/{crm,member,acc-v2}-expected.json` to lanes that test on QC1 (script hard-codes c42/c44 — update to live worktrees) → `qc-cron.mts` DRAIN.
4. Refresh `.qc-shots/qc1-expected/` backup from the new seed (old backup = old ids; RESUME l.175) and never commit `scripts/*-expected.json`/`scripts/fixtures`.
5. Rebuild :3215 from HEAD (`scripts/pending/run-rebuild-3215.sh` pattern) before UI/visual suites and c1.10 H.1.
6. Then `pnpm qc:all` (excludes m1.1 by design, `qc-all.mts:67`; seeds only if absent) under the gate lock; run the date-sensitive suites inside 00:00–17:00 UTC.

## 7. Open questions (not resolvable from files)
1. Is `NEON_API_KEY`/`NEON_PROJECT_ID` set in GitHub secrets? If not, CI T1 (`qc:all`, `migrate deploy`, `drift`) has been skipping ⇒ runbook R4 step 5 ("CI of merge commit green incl. migrate on prod-branch") cannot be satisfied. Also: does CI's Neon branch derive from **prod** (`NEON_PROJECT_ID`) — Q5 rehearsal implications?
2. Root cause of c1.10 S7.2 (webhook delivery) red — "identical on base" proves not-a-regression, not that webhooks work on v2. Builder "told to prove"; no proof found.
3. Will `pnpm drift` (prisma migrate diff) stay clean with the first standalone sequences/functions (N review n4)?
4. C2.10 B1 AppNotification `dedupeKey`/`deferredUntil`/`channels`: still NOT in `prisma/schema`; `src/lib/modules/crm/notifications.ts:27` says "real fix needs these columns" (workaround in place). Not built in C3.0 — confirm whether C6.1 should add them or it stays debt.
5. "Make nullable columns NOT NULL" (C3.0 §5) — which columns? No list found.
6. P19 code fallback (match replies by `+t` tag → thread's latest OUT as parent; proposed `crm-C4.4.md:902`, `crm-C4.4-review-r4.md:79`) "controller will add to the fix lane" — no note found saying it was built.
7. ~~P15 scripts on session/crm?~~ RESOLVED: both tracked on session/crm (`scripts/pending/c54b/backfill-revoke-ended-portal.mts`, `scripts/pending/c54c/backfill-invoice-status.mts`). The third P15 item (API keys with no creator — count/revoke) has no script found.
8. Order of the next prod push: `crm_perf_indexes` (unshipped) + N migration + C/D/E/UI/J3/D2/fix1 code in one deploy conflicts with N's "no other migration in the same deploy" — split into two deploys?
9. session/crm vs origin/main divergence (12 design commits on main): merge strategy for the prod push (owner/controller).
10. H55-2 GIVE_POINTS/ISSUE_VOUCHER runtime path only code-read (no fixture) — accept?
11. E1-K2.3 exact clearing condition (reseed vs oracle fix) — not stated in notes.
12. Whether D-review F5 (owner notice on e-mail outage) is fully closed by E3 `noticeEmailOutage` for the pilot.

---
Finished ~09:04 UTC (within time box). `gh` not authenticated here ⇒ open question 1 (CI secrets) unverified. Not read in full: c42b `crm-C4.2.md` (100 KB; grepped), c54d `crm-C5.4-D-review.md` (grepped N5–N7/F-list), N-review (headings + RESUME summary), §0.11–§0.18 of RESUME.

## Added 1 Oct — hunt 2b (`ledger/wo-notes/crm-C5.5-hunt-2b.md`): 0 BLOCKER · 0 HIGH · 1 MED · 4 LOW · 3 INFO

- **H2b-1 MED (controller-verified in text, runbook FIXED in `crm-C5.4-N.md` pre-check 3b):** prod pre-check for N must also cover USAGE/UPDATE on the pre-created `acc_jno_%` sequences when migrate role ≠ app role; smoke an EXISTING active system, not only a new one. Supersedes the wording of 1.12 / New-2 above.
- **Card C5.5-fix3 (to open after fix1/fix2 merge — shares portal.ts/automation.ts with them):**
  - H2b-2 LOW plausible — `account_alloc_journal_no` slow path (gap > 1 000) reads then setval without a lock; add an advisory xact lock + re-read (new additive migration, CREATE OR REPLACE).
  - H2b-3 LOW confirmed — `ai-bridges.ts:211` at-risk uses `expectedCloseAt < now`; compare Thai day keys (deal flagged overdue from 07:00 Thai on its due day).
  - H2b-4 LOW confirmed — `automation.ts:1588-1593` `field_due` window wrong for DATETIME fields (00:00–06:59 Thai fires a day early).
  - H2b-5 LOW confirmed — `portal.ts:803` DATETIME custom values rendered as bare UTC date.
- H2b-3..5 exist on origin/main but only on CRM v2 screens (hidden on prod). C5.4-D2 diff: no new defect.

## Added 1 Oct — C5.5-fix1 merged (42acc952); round-2 review debt

- R2-1 LOW (reproduced): account connections page — a request naming only non-`account.*` events becomes an all-events endpoint (v1 shop not refused). → fix3a.
- R2-2 LOW: webhook guard registry fails open when empty. → fix3a (fail closed for CRM-event endpoints).
- R2-3 LOW: refused webhook toggle-on throws to the error page instead of the Thai reason. → fix3a.
- R2-4 LOW: existing all-events / CRM-event endpoints are never re-checked (no author column). Prod count unknown → C6.1 read-only query + owner decision.
- `ApiIdempotency` has no cleanup job (rows now include stored 409s) → C6.1 cron list.
- Account `import.run` 429 is replayed 24 h though docs say wait-and-retry → fix3a (flag nothingWritten). Some CRM 409s say "refresh and try again" but a same-key retry replays → docs wording, debt.
- Account/kanban/member error tables in docs contradict "errors are stored" → docs debt.
- RV-5: installed skill files under `/root/.claude/skills` still say "reuse the same key" — sentence in `crm-C5.5-fix1.md`; controller/owner.
- Deprecated author-less `createEndpoint` overload stays until `qc-acc-v2-permissions.mts:768` and the seed script pass an author.
- Vercel function max duration vs the 6-min stale-claim window: dashboard setting not verified → C6.1.

## fix3a review debt (2026-10-01)

- **F4** webhook guard fails closed only when the guard registry is EMPTY (`src/lib/webhooks/service.ts:422`); if another module registers a guard and the CRM registration is lost, CRM endpoints are unguarded again. The CRM event-prefix list at `:414` is a copy kept in sync only by a pending probe. → later card: fail closed per event family.
- **F5** `src/lib/modules/crm/ai-bridges.ts:218` `PIPELINE_LATE_MONTH` compares instants (flips at 07:00 Thai) — same class as H2b-3.
- Journal-number allocator residual (migration 20261104000003): a backwards `setval` needs > 1000 lock-free allocations on one book between two adjacent healer statements; reproduced only with 1200 raw `nextval`s in a 600 ms injected window. Accepted, not closed.
- Reviewer probes `scripts/pending/cf3/review/rv3-jno.mts` / `rv4-review.mts` assert "deployed == 000002" → red by design after 000003; use `rv5-r2.mts`.
- `migrate deploy` with an earlier-named pending folder after the POS `20261120*` folders: argued in the N runbook, never run on a throwaway DB.

## fix3b / fix4 review debt (2026-10-01)

- **RV-2 (fix3b) pre-launch check:** H2b-4 changed the field-due dedupe key for DATETIME values (Thai day). A DATETIME rule that already fired under the old key fires once more after deploy (DATE keys byte-identical, no re-fire). Before switching CRM v2 on anywhere that already ran rules: count `AutomationRun` with eventKey like `custom.record.field_due#%`; if > 0 add the ~10-line bridge described in `wo-notes/crm-C5.5-fix3b-review.md`.
- **RV-3 (pre-existing):** `src/lib/modules/crm/contacts.ts:1385` `displayOf` shows DATETIME custom fields as UTC text on the contact page and in the export (`:2514`) — differs from the custom-record staff page and the portal.
- **RV-4 UX:** portal "ขอแก้ข้อมูล" box for DATETIME needs typed ISO (seed text refused before and after fix3b).
- **fix4:** account `contains` searches still treat `%`/`_` as wildcards (sites listed in `wo-notes/crm-C5.5-fix4.md`); hsan `pgtest.mts` reads the wrong SQL block (should read `finder.sql`); `linkSchemeOk` accepts `ht tp://` (harmless relative link, same on prod); `qc-acc-v2-policy` crashes before the product-duplicate checks on QC3 (both trees).
- **fix3b R2-1 (LOW, fix2 rule):** forged mail from an address matching no contact/company is stored without the unverified flag (`crm/emails.ts:2502` flags only mail matched at ingest); a later "attach to contact" (`:2892`) creates an inbound EMAIL activity that is unflagged everywhere. Fix: record "sender not proven" for every inbound mail at ingest.
- **fix3b R2-2 (LOW):** AI assist briefs (`crm/ai-bridges.ts:324,352`) pass forged-mail subjects to the model without the flag; cheap fix = call `unverifiedEmailRefs` and append "(sender not verified)".

## authz sweep review (2026-10-01) — open items

- **F1 HIGH (prod):** legacy `/api/v1/*` ignores key scopes (`/api/v1/customers` → member PII to any shop key; `/api/v1/ai/tools` → recent_leads/financial_summary/kb_auto_save/remember_fact). NOTE: the POS session already built `hotfix/apiv1-scope` (worktree /root/projects/shark-hf, 201d371a "HF-APIV1", 3 rounds) — awaiting the owner's deploy order; check it covers X1.2–X1.4 of `scripts/pending/cf8/review/probe-cf8-review.mts` before building anything new.
- **G1 HIGH (prod):** AI tools run with tenant id only — anyone with `ai.chat.send` gets every tool (CRM leads with phones across systems, month finances, KB writes without kb.article.create, AI memory). Needs its own card: pass the caller's membership into `runTool` at every AI entry point.
- **S4 MED (prod):** member card + POS card on the account contact profile, member badge in the account contact list and member codes on the merge page are shown without a member viewer check. Fix = lookup takes a viewer, fails closed (pattern `findCustomersForLink`). ORACLE-EDIT of `qc-acc-v2-contact-profile` Q7.5 judged legitimate by the reviewer (it asserts the leak): give the loader an OWNER viewer + add negative checks. Needs the acc-v2 seed (QC1).
- LOW: F2 account page mints a scope-less legacy key from a crafted form; F3 key rotation copies old scopes (pre-S1 CRM/member-scoped keys renewable forever); F4 kanban key page accepts any bundle incl. crm.admin/member-admin; F5 REST `webhooks.test` still sends crm.* test events.
- Owner decisions ranked: D11 (platform/account webhook pages need only webhook.endpoint.create, can disable/delete CRM- and member-owned endpoints; add a member family guard) > D3 (DNA interview spends AI credit with no key) > D5 (branch MANAGER can change shop PromptPay ID) > D2 > D9 > D8, D6, D1, D10, D7, D4. Plus RV-3 (CRM AI features vs ai.chat.send). Details: `wo-notes/crm-C5.5-authz-sweep.md` + `-review.md`.
- Owner question: one read-only prod query for API keys bound to an account system carrying non-account scopes.

## fix6 review debt (2026-10-01)

- **R2F-1 LOW (consequence of fix6 r2):** a user who can link companies, on a contact whose PRIMARY company is outside their visibility, still sees the edit-sheet picker but every pick is refused NOT_FOUND (even promoting their own visible secondary); message says "refresh". Fix: hide/explain the picker when the current company is not visible, or a dedicated refusal text.
- **R2F-2 LOW (pre-existing, API only):** clearing an ARCHIVED but visible company half-writes (contact row + audit + outbox, then VALIDATION from `removeContact`).
- **R2F-3 INFO:** import company-step notes share the `errors` list (cap 500, UI shows 50) with real failures → could crowd them out; add a kind field / separate list.
- **R2F-4 INFO (pre-existing):** an import row naming a company the importer cannot see creates a second company with that name.
- F6-5 (echo exception only for users without company read; harmless audit race), F6-6 (`/deals/new` defaults the deal's company from the contact without a visibility check, `deals.ts:722`).

## G1 review (2026-10-01/02) — open items

- **F1 HIGH (prod too) — shared AI conversations:** conversations are shop-wide with no user column; web sheet opens the shop's latest conversation, mobile lists/reads all, `sendMessage` accepts any conversation id and replays the last 40 turns. After G1 a cashier with only `ai.chat.send` is refused the tools but still reads/continues the OWNER's conversation (member phones, leads, finances). → own card "G2": minimum without schema change = record each conversation's creator as an AuditLog row; filter list/read/continue/proposals by it; no-creator conversations OWNER-only; web sheet opens the caller's own latest; REST conversationId only for conversations that key created. (A nullable creator column is cleaner but adding a column has taken prod chat down before.)
- **Owner decisions:** (1) scheduled AI tasks: run as creator (record creator at confirm via AuditLog; notify only them; legacy tasks → OWNER rights, notify OWNERs) vs current least-privileged; (2) proposals need the proposer's own confirm key — reviewer: keep (matches design; "staff drafts, owner confirms" belongs in the approval module); (4) mask phones in legacy member tools — reviewer: yes, low priority.
- LOW: F3 `pending_leaves` open to all vs `upcoming_schedule` needing hr.leave.read (matches the open HR page); form-submission names in recent_leads may be a phone/email, unmasked.
- After the apiv1 hotfix lands: `isGeneralKeyActor` should call its `isGeneralApiKey`; OWNER recent_leads phone masking ships together with C5.4-B.

## fix8 / fix9 review — owner & legal questions (2026-10-02)

- **PDPA export scope (legal):** should the single-person export be limited by what the requesting staff member can see? (today it is; fix9 r2 makes the file say so). Should large exports go through the private-file export lane instead of one in-request JSON string (≈100 MB at the 50,000-row ceiling)?
- **PDPA erase size:** all-or-nothing in one 60 s transaction (~5,600 changed rows on the QC host). Heavy persons now fail loudly instead of being partially erased → need a resumable multi-step erase card?
- **API keys:** who may mint the shop's general `[]` key (today any holder of api.key.create incl. a branch MANAGER; recommendation OWNER-only). Existing prod keys bound to the account system with non-account scopes: one read-only prod query needed.
- **RV-4:** kanban key page revokes any key of the shop — fixed only in `hotfix/apiv1-scope` (shark-hf 201d371a) → ship with/before session/crm.
- **P14 (launch gate):** `CRM_INBOUND_AUTHSERV_ID` set AND the inbound provider adds its own Authentication-Results header; otherwise an attacker-supplied header carrying our authserv-id is trusted.
- Debt: non-account `contains` wildcard sites in CRM/member/kanban (list in `wo-notes/crm-C5.5-fix8.md`); `emails.ts:450/456` shopMailAddressesInTx caps (over-erasure of shop addresses past 50 systems / 2,000 settings); forged inbound mail updates lastActivityAt (`emails.ts:2592`) → postpones lead retention erase.

# C5.3 — verify & pin the C5.2 hunter findings (oracle writer · Opus 5.5 · 27–28 Sep 2026)

Worktree `shark-crm-c53` @ d60ab051 (detached, not committed) · QC2 only (`ep-cool-shadow`) · one throwaway tenant `qc-c53-<rand>` per run
Suite: `scripts/qc-crm-c5.3.mts` · run `bash scripts/iso.sh bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-c5.3.mts`
(`--only=L1,L6,X` runs a subset; K.1 + CLEAN always run). Inputs: `crm-C5.2-L1…L6.md` + probes `scripts/pending/hunt-l1…l6/` (L4/L6 copied from main).

**Result on d60ab051 (run 3, full): 53 checks · 2 green (K.1 harness, CLEAN) · 51 red — every red is the finding's own reason (ACTUAL lines quoted below were read one by one; every behavioural check carries its fixture/positive control in the message so a broken fixture is visible as such).**
Runtime ≈ 4 min (L3-M3 sleeps 62 s by design; L3-M4 21 s). Typecheck + fitness: see §Gates.

## How the suite stays safe on QC2
- Never drains the global outbox, never runs a real cron: `runDue`/`purgeBodies`/`runExportJobs` get `tenantIds:[T]` (+ `systemIds`).
- L3-M3 (outbox lease) drains through a process-local shim on `prisma.outboxEvent.findMany` that ANDs `tenantId=T AND type=<private type>`; the shim is verified (probe query returns only our rows) before the drain and removed right after.
- L3-M4 swaps the in-process minute-job registry for two fake jobs named after the run, restores it, deletes their `OpsAlertState` rows.
- ChatRateBucket keys, API keys, users/sessions and the tenant are deleted in `finally`; `C5.3-CLEAN` proves 0 rows left (green on every run).
- Network is blocked (`globalThis.fetch` throws); webhook/redirect behaviour is driven by an injected fetch that emulates platform redirect-following.

## Verdict table
Legend: V = VERIFIED (re-traced + reproduced by the suite) · NR = not reproducible · D = disputed · P = hunter PLAUSIBLE, not pinned.
Prod column: all prod shops are uiVersion 1 and CRM v2 is hidden ⇒ "no" = v2-only path; **NOW** = reachable today by a uiVersion-1 shop or platform-wide (subject to which commit prod runs — controller knows).
Fix batch: FB-AUTHZ (L1) · FB-MONEY (L2 + X1) · FB-QUEUE (L3, core outbox/idempotency) · FB-PUBLIC (L4, core webhooks) · FB-PDPA (L5) · FB-UX (L6).

| Finding | Verdict | Check id | Contract (minimal behaviour the fix must meet) | Fix batch | Prod NOW? |
|---|---|---|---|---|---|
| L1-M1 v1 actions on v2 system | V | C5.3-L1-M1 | on a uiVersion-2 system every v1 action (move/complete/add) by a STAFF who can't see the row is refused and changes 0 rows (actual: deal → LOST w/o reason, activity closed, activity added) | FB-AUTHZ | no (v2-only) — exposed at first v2 switch |
| L1-M2 portal survives removeContact | V | C5.3-L1-M2 | ended company link ⇒ old portal session null, new mint refused, co-workers' listContacts excludes (actual: all three still work) | FB-AUTHZ | no |
| L1-M3 account→CRM facade no CRM authz | V | C5.3-L1-M3 | bookkeeper w/o CRM key: 0 CRM rows in suggestions; link to crm refused; partyId unchanged (actual: row listed, partyId OVERWRITTEN) | FB-AUTHZ (+ account lane) | **NOW** (Account V2 + CRM v1 shops; overwritten partyId then feeds the member DEAL_WON bridge, see m5) |
| L1-m1 crm.api.manage mints crm.admin | V (escalation half) | C5.3-L1-m1 | MANAGER with only crm.api.manage cannot create a key ⊄ his keys | FB-AUTHZ | no · "key outlives creator" half = platform API-key design → owner (not pinned) |
| L1-m2 filtered key reads unmatched mailbox | V | C5.3-L1-m2 | team-filtered admin AND operate keys (both hold crm.email.read) get FORBIDDEN/0 on `unmatched` | FB-AUTHZ | no |
| L1-m3 STAFF From override = any address | V (staff half) | C5.3-L1-m3 | override must be on a VERIFIED domain / never a contact's address | FB-AUTHZ | no · outsider half = L4-M1 |
| L1-m4 NOTIFY_STAFF ignores visibility | V | C5.3-L1-m4 | recipient who can't see the contact gets no notification rendering its name | FB-AUTHZ | no |
| L1-m5 customer history shows CRM deal data | V | C5.3-L1-m5 | CUSTOMER read of member timeline shows no module crm/crm.object rows (actual: "ปิดดีล "<title>" สำเร็จ · ฿123,456") | FB-AUTHZ (member lane) | **NOW** — fixture uses a **uiVersion-1** CRM: the member bridge `onCrmDealWon` has no uiVersion gate |
| L1-m6 POS link sale→deal | P | — | — | — | — |
| L2-M1 reps commission gross | V | C5.3-L2-M1 | reps.commissionSatang = commissions.report net (actual 500,000 vs 0) | FB-MONEY | no |
| L2-M2 deposit understates won value | V | C5.3-L2-M2 | wonValue ∈ {10,000,000 pre-VAT, 10,700,000 VAT-incl} (basis in X1) — never 7,490,000 (actual 7,490,000) | FB-MONEY | no |
| L2-M3 credit note invisible | V (CRM side) | C5.3-L2-M3 | CN consumed ⇒ paid −1,070,000 or won −1,000,000/−1,070,000 (actual unchanged); account-side "never PAID" = cross-lane, not verified by me | FB-MONEY (+ACCOUNT lane) | no (CRM) |
| L2-m1 home weighted counts OMITTED | V | C5.3-L2-m1 | home = board = reports = 200,000 (actual home 400,000) | FB-MONEY | no |
| L2-m2 autoWon on pre-VAT value | V | C5.3-L2-m2 | first instalment 100,000 of a 107,000 invoice leaves deal OPEN (actual WON) — exact comparison = Q14 | FB-MONEY | no |
| L2-m3 approval amount Int overflow | P | — | — | — | — |
| L2-m4 REST rejects vatRateBp −1 | V | C5.3-L2-m4 | deals.lines.set schema parses −1 (service already does) | FB-MONEY | no |
| L3-M1 no send-time WON guard / no drain | V | C5.3-L3-M1 (behaviour) · C5.3-L3-M1b (SOURCE) | 0 sends + STOPPED WON after a WON move, with event still PENDING and with bridges off (actual 2 sends, DONE) · some CRM write path / minute cron calls scheduleDrain/drainAll | FB-QUEUE | sequences: no · **NOW (platform)**: `/api/cron/hourly` does not drain although core/outbox.ts:160 says it does ⇒ any module event without scheduleDrain waits ≤24 h |
| L3-M2 failed step skipped | V | C5.3-L3-M2 | failing sender keeps stepIndex 0, later run sends it (actual DONE, never retried) | FB-QUEUE | no |
| L3-M3 outbox lease from round start | V (reproduced, isolated shim) | C5.3-L3-M3 | event claimed after a 62 s handler still holds a future lease (actual −2.2 s: born expired) | FB-QUEUE (core) | **NOW** — core outbox of every module (double webhook delivery / double v1 automation when a round runs >60 s) |
| L3-M4 one 20 s budget per cadence | V | C5.3-L3-M4 | tail daily job runs in the single daily invocation, or crm-cron loops runMinuteJobs (actual cut-off + no-budget, tail never ran) | FB-QUEUE | no (crm-cron crontab not installed until C6.1) |
| L3-m1 REST idempotency sticks / replays 5xx | V | C5.3-L3-m1 | NULL claim >2 min taken over; 5xx not stored (actual 409 in-progress; 503 replayed) | FB-QUEUE (core `src/lib/api`) | **NOW** — shared REST core (member/kanban/crm dispatch); account has its own copy (not checked) |
| L3-m2 complaint after-steps lost on replay | V | C5.3-L3-m2 | replay after crash ⇒ consent withdrawal row + enrollment STOPPED (actual reason "replay", 0 rows, ACTIVE) | FB-QUEUE | no |
| L3-m3 crash-window duplicate mails | P | — | — | — | — |
| L3-m4 v1 automation re-runs per retry | V | C5.3-L3-m4 | same event id fires a v1 rule once (actual 2 notifications) | FB-QUEUE (core) | **NOW** — core engine, every module's v1 rules (retries happen e.g. when the accounting leg fails, AUDIT M10) |
| L4-M1 forged From ⇒ OUT "sent by staff" | V | C5.3-L4-M1 | verified-domain alone / foreign A-R / X-A-R ⇒ IN (actual all three OUT) | FB-PUBLIC | no (inbound handled only for v2) |
| L4-M2 webhook SSRF bypass | V | C5.3-L4-M2 | 6 IPv6 literal forms blocked, NXDOMAIN not "public", 302→internal never followed (actual all allowed, redirect followed, delivered=true) | FB-PUBLIC (core `src/lib/webhooks`) | **NOW** — endpoints created from member/account/generic webhook settings; `withWebhooks` wraps every outbox consumer |
| L4-M3 /l open redirector | objective part V · policy → OWNER | C5.3-L4-M3 (objective part only) | a SUSPENDED/CLOSED tenant's /l/<code> falls back (actual keeps redirecting to the tenant's URL) — destination policy / separate domain / Safe-Browsing = owner decision | FB-PUBLIC | no (links creatable only on v2) |
| L4-m1 /t/c Thai path → homepage | V | C5.3-L4-m1 | 302 to encodeURI(destination) (actual Location = APP_URL home) | FB-PUBLIC | no |
| L4-m2 one-click dropped when IP bucket full | V (contradicts ruling F8) | C5.3-L4-m2 | valid token opts out even at a full IP bucket (control: fresh IP works) | FB-PUBLIC (needs ruling) | no |
| L4-m3 token bucket written when IP blocked | V | C5.3-L4-m3 | IP over limit ⇒ 0 new token-bucket rows (actual 5 rows) | FB-PUBLIC | **NOW** if the v2 code is deployed — `/t/o/<random>` is public, no tenant needed |
| L4-m4/m5/m6 | P | — | — | — | — |
| L5-M1 name survives in deal titles | V | C5.3-L5-M1 | 0 deal titles with the name after erase (actual 2; positive control masked) | FB-PDPA | no |
| L5-M2 automation kanban card not linked | V | C5.3-L5-M2 | 0 card titles with the name after erase (actual 1) | FB-PDPA | no |
| L5-M3 team-room post keeps the name | V | C5.3-L5-M3 | post name-free, or masked by erase (actual 1 body) | FB-PDPA | no |
| L5-M4 trackingOptOut has no writer | V | C5.3-L5-M4 | audited service writer + merge strictest-wins (actual no writer; updateContact VALIDATION; merge drops it) | FB-PDPA | no |
| L5-m3 assistant gets raw PII | V (design call) | C5.3-L5-m3 | present(assistant) masks phone/e-mail/LINE/previousEmails | FB-PDPA | no |
| L5-m5 no retention for e-mail events | V | C5.3-L5-m5 | purgeBodies also deletes OPEN/CLICK events older than retention (actual 2 left) | FB-PDPA | no |
| L5-m6 firstUrl in payload · raw pageUrl | V | C5.3-L5-m6 | crm.web.identified payload w/o firstUrl; sourceDetail.pageUrl keeps utm_* only | FB-PDPA | no |
| L5-m7 system export w/o confirm+reason | V | C5.3-L5-m7 | exportTenant without confirm/reason ⇒ VALIDATION, no job | FB-PDPA | no |
| L5-m1/m2/m4/m8/m9 | P | — | — | — | — |
| L6-M1 stage dialog sends strings | V | C5.3-L6-M1 | the dialog's string payload ("50000", option label, "ใช่") moves the deal (control with typed values moves) | FB-UX | no |
| L6-M2 archived required field locks stage | V | C5.3-L6-M2 | archive refused naming the stage, or archived key no longer required | FB-UX | no |
| L6-M3 merge leaves dependents | V | C5.3-L6-M3 | enrollment/e-mail/score log/web session move to KEEP (+score), company file link + portal access move (or revoke+warning) | FB-UX | no |
| L6-M4 7/11 templates never sent | V | C5.3-L6-M4 (behaviour lead.assigned + SOURCE rest) | assignContact notifies with ?n=lead.assigned; every template key has a sender | FB-UX | no |
| L6-M5 company lifecycle/score never written | V (lifecycle) | C5.3-L6-M5 | company with a WON deal ⇒ lifecycleStage CUSTOMER · score: owner defines or hides (not pinned) | FB-UX (+seed edit) | no |
| L6-m1 two "overdue" definitions | V | C5.3-L6-m1 | task due 60 s ago in exactly one web tab; mobile/widget overdue = web (actual web both tabs, mobile/widget overdue 0) | FB-UX | no |
| L6-m2 BE year in custom DATE | V | C5.3-L6-m2 | "2569-12-31" refused or stored 2026 (actual stored 2569) | FB-UX (member fields) | **NOW** — `member/fields.ts` is the member module's custom-field engine (live) |
| L6-m3 Thai collation / sara am | V | C5.3-L6-m3 | list sort = th-TH-x-icu order computed by the DB; decomposed ํ+า found by ำ search | FB-UX | no (CRM lists) |
| L6-m4 honorific as firstName | V | C5.3-L6-m4 | "นาย สมชาย ใจดี" → firstName สมชาย | FB-UX | **NOW (data)** — v1 add form + public form use createContactFromLegacy; bad firstName is written today, shows in v2 mail later |
| L6-m5 mistaken WON permanent | V | C5.3-L6-m5 | after WON→LOST the contact steps back, or owner setLifecycle PROSPECT works (actual VALIDATION) | FB-UX | no |
| L6-m6 skip template ⇒ 0 lost reasons | V | C5.3-L6-m6 | skipBusinessTemplate seeds ≥1 lost reason | FB-UX | no |
| L6-m7 v1 phone moved into hidden note | V | C5.3-L6-m7 | "02-123-4567 ต่อ 12" and "๐๘๑…" stay in phone (actual both null) | FB-UX | **NOW — v1 regression** (v1 add form / public form, wherever this code is deployed) |
| L6-m8 free-mail company domain | V | C5.3-L6-m8 | gmail.com refused, or stranger not filed under the company (actual filed) | FB-UX | no |
| L6-m9 team archive one click | V (UI) | not pinned — confirm dialog = visual suite | — | FB-UX | no |
| L6-m10 tap targets <24 px | V (hunter measurement, QC1) | not pinned — needs a browser; belongs to visual-crm/parity | — | FB-UX | no |
| L6-m11 saved view breaks on archive | V | C5.3-L6-m11 | view still answers after archive (dead filter skipped) or archive refused (actual VALIDATION) | FB-UX | no |
| L2 meta — cross-surface money | V | C5.3-X1 | see below | FB-MONEY | no |

Nothing was NOT-REPRODUCIBLE or DISPUTED outright. Two refinements: L1-m1 pinned only the escalation half; L4-M3 pinned only the kill-switch half (the rest is policy).
Hunter correction: L2-M1's "clawback in the next free period" also means reps (filters `createdAt`) and commissions.report (filters `periodKey`) will still disagree after the naïve M1 fix — X1 catches that (see below).

### C5.3-X1 — one money truth (fixture: W quotation 107,000 → deposit 32,100 paid → invoice with deposit deducted 74,900 paid → WON → credit note 10,700; V invoice 10,700 paid → WON → payment voided (clawback); O open 20,000 @20 % + OMITTED 10,000 @20 %; rule PAID 10 %)
Expected on the controller default basis **won = BEFORE VAT (Q14 pending — flip `WON_BASIS` at the top of the suite if the owner rules VAT-incl)**: won 10,000,000 · commission (this + next period) 900,000 · weighted 400,000 · paid: equal everywhere (value = owner ruling on CN refunds).
Actual on d60ab051: won home 11,000,000 vs reports/reps/CSV/REST 8,490,000 · paid 10,700,000 everywhere ✓ · commission this period 1,100,000 everywhere (agrees only because REVERSED is dropped by reps AND lands in the next period) · all periods 1,000,000 (CN never clawed back) · weighted home 600,000 vs every other surface 400,000.
Surfaces read: home.kpis · deals.getBoard · deals.forecast · reports.overview · reports.reps · CSV (overview + reps via startExport/runExportJobs of this tenant) · REST `/reports/overview` + `/deals/{id}` (real route, admin key) · commissions.report (this + next period).

## ORACLE-EDIT proposals (NOT applied — controller rules)
1. `scripts/qc-crm-c3.1.mts:409` (reps mirror SQL) — old: `c."status"::text NOT IN ('REVERSED', 'REJECTED') AND ${per('c."createdAt"', f)}` · new: net = `c."status"::text IN ('APPROVED','PAID','REVERSED')` (= commissions.report net) and the period by `c."periodKey"` months of the range (not createdAt) — the controller picks the one definition; C5.3-L2-M1/X1 follow it.
2. `scripts/qc-crm-c3.2.mts:624` + `:659` + comment `:506` — old: weighted = `sum(value × prob)` over all OPEN deals, rounded once (`Math.round(wv/100)`), comment "multiples of 100 ⇒ every rounding scheme agrees" · new: exclude `forecastCategory = 'OMITTED'` and round per deal (`sum(round(value × prob / 100))`) exactly like reports/board; add a fixture value that is NOT a multiple of 100 and one OMITTED deal.
3. `scripts/qc-crm-c3.9.mts:350` (C3.9-S1.4) — old: deals "(title/value/stage/paid/owner) … byte-identical" · new: value/stage/paid/owner byte-identical; **title (and nextStep/lostReason) identical unless it contains an identity token of the erased person, in which case every token is masked** (same masking rule as activity titles). Fixture `qc-crm-c3.9.mts:246` should use a title WITH the name.
4. `scripts/qc-crm-c2.5.mts:2181` (C2.5-S10.8, ruling F8) — old: over the per-IP limit a VALID one-click token is refused and `kU1.emailOptOut === false` · new: a VALID token is honoured at any bucket level (`kU1.emailOptOut === true`, audit only when flipped); unknown/invalid tokens and the webhook keep the refusal + "bad signature writes nothing". Needs a controller re-ruling of F8.
5. `scripts/qc-crm-c2.7.mts:89` (header contract) — old: "`autoWonOnPaid` moves the deal … when Σ COUNTED ≥ deal value" · new: "… when Σ COUNTED ≥ the anchor document total (after deposit correction) for a deal with a document anchor; deal value otherwise" (Q14 decides the basis).
6. `scripts/qc-crm-c1.11.mts:284` + `:1292` (C1.11-S6.10) — old: `crm/actions.ts` (v1) exempt from the gate scan · new: after the L1-M1 fix the v1 action file must read `crmUiVersion`/`assertCrmV1` (refuse on uiVersion 2) — drop the exemption, assert the inverse gate.
7. Self-edits this suite may need (flagged in the check text): C5.3-L3-m4 moves to the consumer level if the fix is "skip automation when attempts > 0"; C5.3-L6-M1 switches to the typed payload if the fix is "dialog renders typed controls" only (no server coercion); C5.3-L6-M4 SOURCE half changes if the dead template rows are hidden instead of sent.
8. Seed (not an oracle, but it hides L6-M5): `scripts/seed-crm-qc.mts:169` writes `lifecycleStage` / `score` on CrmCompany by hand — stop writing them once the product derives them (else every screenshot keeps looking right).

ORACLE-ADD (gaps, no existing assertion is wrong): C0.5-S3.4 hourly/daily twin (L3-M4) · C2.2-X9.5 plain `{ok:false}` sender (L3-M2) · C3.3 reports tab after a clawback (L2-M1) · C2.10 "each template key is sent" (L6-M4) · C1.5-S2.3 NUMBER/SELECT/DATE through the dialog payload + archived required field (L6-M1/M2) · merge oracles with enrollment/e-mail/score/web/file/portal dependents (L6-M3) · C2.5/C2.6 set `trackingOptOut` through the new writer, not prisma (L5-M4) · C3.9 automation card + team-room post + convert-title fixtures (L5-M1..M3) · C2.5 forged A-R / X-A-R / verified-domain spoof twins (L4-M1) · webhook M1/X6 hex-mapped IPv6 + redirecting target + real-resolver NXDOMAIN (L4-M2).

## Prod exposure NOW (uiVersion-1 / platform-wide paths)
L1-M3 (account → CRM contact lookup + partyId overwrite) · L1-m5 (member customer history shows CRM deal title/value — v1 bridge) · L3-M1 platform part (hourly cron never drains; kernel comment false) · L3-M3 (core outbox lease) · L3-m1 (shared REST idempotency) · L3-m4 (core v1 automation re-run per retry) · L4-M2 (core webhook SSRF) · L4-m3 (public /t/o DB-write amplification, if deployed) · L6-m2 (member custom DATE accepts BE year) · L6-m4 (v1/public form writes honorific as firstName) · L6-m7 (v1 regression: phone hidden in note).

## Gates
- `env NODE_OPTIONS=--max-old-space-size=5120 bash scripts/with-gate-lock.sh pnpm typecheck` → exit 0
- `pnpm fitness` (with env) → 33/33 exit 0 · `env -u DATABASE_URL pnpm fitness` → 33/33 exit 0
- Suite run 3 (full, QC2): 53 checks · 2 green (K.1, CLEAN) · 51 red, each for the finding's reason · CLEAN green on all 3 runs
- Round 1 gates (after SHOULD-FIX): typecheck exit 0 · fitness 33/33 with env and without env

## Controller rulings on ORACLE-EDIT proposals (Fable · 28 Sep ~00:00 UTC) — BINDING
1 ✅ reps mirror = net (APPROVED+PAID+REVERSED) by periodKey · 2 ✅ weighted excludes OMITTED + per-deal rounding + non-multiple-of-100 fixture · 3 ✅ erase masks identity tokens in deal title/nextStep/lostReason (fixture title contains the name) · 4 ✅ F8 re-ruled: a valid one-click unsubscribe token is honoured at ANY bucket level (opt-outs must never be dropped; the bucket may only slow non-unsubscribe traffic) · 5 ✅ autoWon compares against the anchor document total (pending Q14 basis) · 6 ✅ drop the crm/actions.ts exemption together with the L1-M1 fix · 7 builder proposes, controller approves at merge · 8 ✅ seed must not hand-write company lifecycle/score once L6-M5 is fixed (same batch).
Owner questions added: L1-m1 "API key outlives its creator" (platform key design) → OWNER-PENDING.

## Review round 1 — SHOULD-FIX 11 + notes (controller rulings applied · 28 Sep)
- SF1 L2-M3 + X1: ONE credit-note rule — CN lowers paid (−grand) AND won (−basis part) AND claws back the PAID commission on its pre-VAT part; X1 adds the **quota** surface (`quotas.progress(USER rep).paid`) and asserts paid = 9,630,000 everywhere.
- SF2 X1 commission expectation decoupled from WON_BASIS: pre-VAT part of each payment ⇒ 900,000.
- SF3 X1: any missing / null / non-number field on an answering surface = ERROR; REST deal 360 no longer falls back to valueSatang (actual: V.wonValueSatang=null, paidSatang absent on both deals ⇒ errors).
- SF4 L2-m2 positive control: the remaining 700,000 ⇒ WON.
- SF5 L3-M3: second handler's remaining lease ≥ first's − 5 s (not satisfiable by raising LEASE_MS).
- SF6 L3-M4: slow job = exported `MINUTE_JOB_BUDGET_MS` + 600 ms; crm-cron regex dropped — purely behavioural.
- SF7 L3-M1b behavioural: moveDealAction (v2 server action, harness now emulates `after()`) and REST PUT /deals/{id}/stage ⇒ crm.deal.won DONE within 15 s, or hourly drains · NEW **C5.3-L3-M1c** (source): hourly drains OR the outbox.ts:148/:193 "hourly pickup" claims are corrected.
- SF8 L6-M4 behaviour for lead.assigned · deal.closed · customer.replied · invoice.paid (real writes + this system's events through the real consumers) + control notifyStaff(commission.status) delivered; SOURCE only for tasks.today · activity.reminder · lead.hot.
- SF9 positive controls: L4-M1 genuine staff copy with our MTA's A-R (`CRM_INBOUND_AUTHSERV_ID=mx.shark.in.th` — hunter's proposed setting name) stays OUT · L1-m4 owner recipient notified · L5-M3 hot-lead post exists after erase · L4-M2 clean public endpoint delivers + public IPv4 literal allowed.
- SF10 L2-m1 values 1,000,003 (per-deal rounding 400,002 vs once 400,001; home actual 600,002).
- SF11 L3-M3 decoy PENDING row of another type stays untouched (status/attempts/lastError/availableAt).
- Notes: L5-M4 writer detection by behaviour (every exported *track*opt* function of contacts/consents/tracking × 3 arg shapes + consents.set TRACKING + updateContact) · L5-M1 fixture adds nextStep + lostReason with the name · L1-m4 now also pins OPEN_KANBAN_CARD titles · L6-m7 adds the e-mail half (two addresses ⇒ first kept) · L6-M2 regex requires the stage name "เสนอราคา" · L6-m2 requires a พ.ศ./ค.ศ. hint · orphan sweep of `qc-c53-*` tenants/users + fake OpsAlertState at suite start · **OUTBOX GUARD** for the whole run (process-local candidate query narrowed to this tenant; installation verified or the suite refuses to run).
- Run 4 (full, QC2 gate lock, systemd unit `crm-c53-run4`): **54 checks · 2 green (K.1, CLEAN) · 52 red, each for its finding's reason** · run 5 (`--only=L6`, after the L6-M4 control) 2/16, CLEAN green.

## Review round 2 — 2 SHOULD-FIX + notes (28 Sep)
- Orphan sweep deletes only `qc-c53-*` tenants/users with createdAt older than 30 min, and fake minute-job state rows only when that job's lease row is released/expired.
- L3-M1b: `|| hourlyDrains` dropped — only a prompt drain after the write passes (the hourly route is C5.3-L3-M1c). M1c now also covers the false hourly-pickup claim in the `scheduleDrain()` doc comment (outbox-consumers.ts).
- L6-M4 source half: requires a real `notifyStaff(…)` call site carrying `key: "<k>"`; scanner control: the 4 live senders are found.
- Run 6 (`--only=L3,L6`, QC2 gate lock): 2/25 · 23 red for their reasons · CLEAN green · typecheck exit 0.

## ✅ ACCEPTED by controller (28 Sep 2026 ~01:00 UTC)
Independent reviewer: round 1 MERGEABLE AFTER SHOULD-FIX (11) → all applied → round 2 MERGEABLE AFTER SHOULD-FIX (2) → applied (orphan sweep age/lease guard · L3-M1b no hourly shortcut) + notes. Final: 54 checks · 52 red for the finding's own reason · K.1 + CLEAN green · positive controls hold · typecheck 0 · fitness 33/33 ×2. Brief notes for fix batches: FB-MONEY must expose REST `paidSatang` + non-null `wonValueSatang`; FB-PUBLIC setting name `CRM_INBOUND_AUTHSERV_ID`.

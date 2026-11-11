# Brief — P5 ล่าบั๊กและช่องโหว่ (3 ใบ · CRM §8): P5.1 เงิน/race/idempotency (hunter เลนเงิน) · P5.2 สิทธิ์/ข้ามร้าน/public endpoints (receipt token · webhook signature · QR โต๊ะ · REST) · P5.3 ประสิทธิภาพ (หน้าขาย <1.0 s · lookup barcode <100 ms · 200 บรรทัด/บิล) · lanes: read-only hunters + oracle writer + builders per fix batch · DRAFT by brief drafter (account B) 22 Oct 2026 01:4xZ — controller rules in §10

Read-only survey of `session/pos` **74484db5** (product tip a58122fc · working tree = ledger only). Plan row `POS-MASTER-PLAN.md:98`. Method = `CRM-MASTER-PLAN.md` §8 (`:219–238`):
- C5.1 perf on real-size data (seed tenant, `$on("query")` counts, p95, N+1, index);
- C5.2 six read-only hunter lenses (≤ 3 parallel);
- C5.3 the controller confirms every finding in code → oracle red on current code (`qc-crm-fix-s<n>`);
- C5.4 fix in batches by owning file;
- C5.5 a second hunter on the fix diff + 2 random full lenses. Exit rule: no HIGH/MED open; LOW → debt table with a reason.

Starts after P4.3 merges (P5.2 may start in parallel with P4.3, read-only). Notes → `ledger/wo-notes/pos-P5.{1,2,3}.md`.

⚠️ Prompt-vs-code (read first):
1. **Money hunters already ran at every S merge since 10 Oct** (LANE-RULES "เพิ่ม 1"). P5.1 is therefore a *cross-card* hunt, not a re-run of card hunts. Per-card reports to dedupe against: `wo-notes/pos-P2.{4,5,6,8,9}-hunt.md` and the hunter sections of `pos-P2.{5,6,7,9,9b,11,12,13,14}-review.md` and `pos-P3.{4,5,6,7,9}-review.md`, `pos-P3-SKEL-review.md`. Classes that recur:
   - lock order / deadlock (P2.6 H2);
   - phantom stock on restore (P2.6 H1);
   - a share refunded as cash (P2.9 H1);
   - lockout races (P2.9 H2);
   - pool exhaustion under one tx (P3.4U F1);
   - a party/contact mismatch leaking the credit limit (P3.6 F1, High);
   - a refund over the remaining amount (P3.6 H2);
   - a slip amount not matched to its intent (P3-SKEL H1);
   - a multi-use tag binding strangers (P3.7 F1).
2. **There is no POS perf tooling.** Timing exists only inside oracles (`qc-pos-p1.1.mts:1640, :1758` SQL spy via `$on("query")` · `:1856` `timed`). CRM has `qc-crm-perf.mts` + `seed-crm-perf.mts`: warm 2 + measure 20 → p50/p95/max, queries per run, N+1 by page size 10/50/200, EXPLAIN to `.qc-shots/crm/perf/explain/`, VPS→Neon RTT reported separately (`qc-crm-perf.mts:1–20`). No design doc states the three thresholds beyond the plan row. The only POS budget in the contracts is member lookup p95 ≤ 300 ms (`POS-CONTRACTS.md:92`).
3. **"barcode lookup" has two paths.**
   - Register scan = **client-side** exact match on the loaded catalog (`components/pos/register/RegisterScreen.tsx:1603`).
   - REST/AI lookup = **server** `GET /products/lookup` (`pos/api/ops/products.ts:69–73`) → `catalog.byBarcode` (`pos/catalog.ts:1327`).

   The <100 ms rule must name which one (or both).
4. **Public surfaces as built** (no session):
   - pages `(store)/r/[token]` · `/q/[linkToken]` · `/q/o/[orderToken]` · `/q/t/[qrToken]` · `/d` · `developers/pos` (+ `.md` route);
   - routes `api/pos/sync` · `api/pos/sync/snapshot` · `api/pos/print-agent/jobs` (+ `[id]/ack`) · `api/pos/platform/[provider]/[channelId]` · `api/payment/beam/webhook` · `api/v1/pos/[...path]` + `openapi.json`;
   - legacy restaurant routes behind the P2.14 LEG door.

   Token makers:
   - receipt = 12 Crockford base32 chars from `randomBytes` (`pos/receipt-token.ts:3, :20`);
   - display = 32 bytes (`display.ts:222`);
   - intent id = 12 bytes (`payment-intent.ts:176`);
   - order link (`order.ts:2044`);
   - print agent `spa_` + 32 bytes (`print-relay.ts:121`).

   Signatures:
   - Beam = hex HMAC with `timingSafeEqual` (`lib/payment/beam.ts:96–104`, format doubt = W20);
   - platform skeleton = `x-shark-signature` hex HMAC (`pos/platform/types.ts:45`; no timestamp/nonce = P3-SKEL H6).
5. **Known open authz items from P3.12 triage**: D1c — shift-open claims any device id from the client (`pos/shift-actions.ts:77–79`; HF-FU2 row S) · D11 legacy setup writers still open on POS-linked units · P3.7U F1 the LINKED rule is client-only.

## 1. Scope / goal
- **P5.1** — find and fix every remaining way money, stock, points or the account book can be wrong, doubled, lost or stuck across all POS entry points and their interactions.
- **P5.2** — find and fix every way a person, key, device or anonymous caller can see or change another shop's/branch's/user's data, or can act beyond their role.
- **P5.3** — measure and meet the three performance budgets, and find N+1 queries and missing indexes on realistic data.

## 2. What exists today (verified)
- **Money oracles** (per card, all in `scripts/pos-gates.json`): `qc-pos-p1.6` (pay) · `p1.8` (refund) · `p2.9`/`p2.9b` (tenders/deposit) · `p2.5` (split) · `p2.6` (KDS stock) · `p3.4` (offline) · `p3.6` (credit) · `qc-hf-tx` · `qc-hf-gc*` (in hf set) · the money set (`qc-pos-account` · `qc-account-cpa` 107 · restaurant/shop/hotel/ticket/subscription money · `POS-MASTER-PLAN.md` §1). The `createSale` contract = `scripts/pos-sale-contract.json` (functions 2 · types CreateSaleInput/MemberSaleChoices/SaleResult · callers registry). X-group rules X1/X4–X6/X9 (`POS-MASTER-PLAN.md` §3).
- **Authz oracles**:
  - `qc-hf-pos-page-authz` — 3 layers: static use of guard results · pure `pos/access` deciders · DB readers per branch (`:1–8`);
  - `qc-hf-reports-authz` — report builder datasets gated by module read rights;
  - `qc-hf-apiv1-scope` — general vs scoped keys;
  - `qc-chat-security` (M9 rate · M10 CSPRNG · M11 unit RBAC · M12 race) + `qc-chat-security-scope` (static);
  - `qc-pos-p2.13` REST: AU1–AU9 auth/scope/system/unit/key-filter · RL1–RL2 rate buckets · ID1–ID5 idempotency incl. a concurrent pair · SA/OR/PR/RP/SH op behaviour;
  - `qc-pos-p1.6` R2 (action files "use server"/no throw — scan set fixed in P3.12 F1).
- **CRM hunt artefacts to copy**: `wo-notes/crm-C5.4-*-hunt*.md`, `crm-C5.5-hunt-*.md` (report shape: finding · severity · file:line · repro · fix).

## 3. Gaps
- G1: no cross-card money threat map.
- G2: no single authz matrix of every POS action/route × role × tenant/branch × key scope.
- G3: public-token entropy/rate/replay is not tested as one set.
- G4: no perf harness, no budgets in code, no perf-size data.
- G5: the follow-ups F8 F11 F15 F19 F20 F24 (P3.12 §4 d) are parked here.

## 4. Proposed oracles + models
- **P5.1 money/race/idempotency** — two hunters (read-only, Opus, parallel = 2 lanes).
  - **Lens M-A**, "the bill": createSale + every caller (registry count in `pos-sale-contract.json` callers) · tenders (cash/transfer/PromptPay intent/card/gift card/store credit/deposit/ON_ACCOUNT/platform) · void · refund (pro-rata, per tender, credit remaining) · tax invoice/ABB/CN numbering · account bridge JV idempotency + P2002 retry (F11) · outbox replay ×2 for every `pos.*` event · tip/service charge · VAT half-up per bill.
  - **Lens M-B**, "around the bill": orders accept/pay/cancel/expire (QR prepaid, platform commission) · tables/split/merge/move · KDS 86 + stock cut/restore + BOM · offline sync (allowlist `offline-shared.ts:15, :115`, F24 check) · shifts/expected cash/force-close cron · staff commission → payroll · CRM deal counting · member points/tiers on order bills · slips vs intents (F15) · every cron in `api/cron/hourly/route.ts:10–14` and `platform/minute-jobs.ts:459–486`.

  Each finding: severity · file:line · two-process repro (child processes, P2.14 Q5/Q6 pattern) · expected vs actual satang.

  Then the controller confirms each one in code → oracle writer `scripts/qc-pos-p5.1.mts` (one check per confirmed finding, **red on current code**, temp tenants `posqc-p51-<rand>`, QC4, Z1/Z2) → fix batches by owning file (builder per batch, R1 each) → second hunter on the fix diff + one random full lens.
- **P5.2 permissions / cross-tenant / public** — matrix first, then hunt.
  - **Matrix** `scripts/pos-authz-matrix.json` (new, data): every `"use server"` POS action (p1.6 scan set) · every page under `sys/[id]/pos/**` · every route of ⚠️4 · every REST op (registry) × {OWNER, MANAGER (unit A), STAFF cashier (unit A), STAFF other unit, other tenant, API key per scope/unit filter, anonymous, device-token holder} → expected allow/refuse code.
  - **Oracle** `scripts/qc-pos-p5.2.mts`:
    - **M1** matrix ⊇ every action/route/op found by scan (no unlisted surface);
    - **M2** each listed row is exercised (in-process action call with a minted session, route handler called directly as `qc-hf-apiv1-scope` does) and gets the expected code;
    - **T1–T6 public tokens**: entropy ≥ 60 bits for receipt, ≥ 96 for the rest · wrong-format = 404 without a DB hit · enumeration rate limits on `/r` `/q` · no PII on public payloads (receipt shows no member phone/e-mail, no CRM contact);
    - **S1–S4 signatures**: Beam / platform / print-agent / sync — bad sig = refused with no write · constant-time compare · replay of a captured body = no second effect (idempotency, H6 note) · secrets never logged;
    - **D1–D3**: device identity (F19 — decision §10.4) · D11 legacy writers on linked units refused (F20) · chat LINKED server check (F8);
    - **X2 cross-branch**: unit A staff against unit B ids on every action (IDOR);
    - **Z1/Z2**.

    Hunters (2, read-only): L1 authz/scope (CRM L1) + L4/L5 public + PDPA (CRM L4/L5: payloads, logs, OpsEvent, AI prompts, RSC props, slips/receipts).
- **P5.3 performance** — `scripts/seed-pos-perf.mts` + `scripts/qc-pos-p5.3.mts` (CRM C5.1 method).
  - **Data**: temp tenant `posqc-perf-<rand>` (server measures on QC4; UI measures on QC5 — §10.7) with 5,000 products × 2 units · 60 categories · 300 option groups · 20,000 bills over 30 days · 2,000 members. Dropped with `--drop`. Never in tenant `coffee`.
  - **Server**: warm 2 + 20 runs, p50/p95/max + query count, VPS→Neon RTT measured and reported:
    - `registerCatalog` / page loader;
    - `quoteRegisterCart` at 1/20/200 lines;
    - `submitRegisterSale`/`createSale` at 1/20/200 lines (+ drain);
    - `catalog.byBarcode` + REST `/products/lookup`;
    - reports daily/products for 30 days;
    - bills list;
    - shift Z.

    N+1 check: queries at 10/50/200 lines must not grow linearly (how lines are written today is not surveyed here — the oracle writer records the query shapes). EXPLAIN of the slowest goes to `.qc-shots/pos/perf/explain/`.
  - **UI (QC5, served `next start` build on tree d, headless Chromium 1024×768 = the iPad target)**:
    - (U1) register ready = navigation start → `pos-register` grid interactive + first product card clickable: **< 1.0 s warm** (2nd load, cache warm) at p95 of 10 loads · cold reported, not gated;
    - (U2) scan → line = keydown of the last wedge char → cart line rendered: **p95 < 100 ms** (client match `RegisterScreen.tsx:1603`) with 5,000 products loaded;
    - (U3) a 200-line bill: adding line 200 < 100 ms · quote round-trip p95 < 1.0 s · pay → done card p95 < 2.0 s · receipt print-preview render < 1.0 s · no overflow at 390.
  - **Thresholds in code** (`PERF_BUDGET` table in the oracle). Each check prints the measured value. Red = over budget on 2 consecutive runs (noise rule).

## 5. Lanes · order · estimate (3-lane cap)
- P5.1: 2 hunters in parallel (≈ 3 h) → controller confirm (≈ 2 h) → oracle writer (≈ 3 h) → fix batches (1–2 days) → second hunter (≈ 2 h).
- P5.2: matrix builder + oracle writer (≈ 1 day) ‖ 2 hunters (≈ 3 h) → fixes (≈ 1 day) → second hunt.
- P5.3: seed + oracle writer (≈ 0.5 day) → controller measure runs (server on QC4 under the POS lock; UI on QC5 after one build) → fixes (index/batching; a migration = `CREATE INDEX CONCURRENTLY` by hand at P6, never in a migration on existing big tables — runbook P6.1 §4) → re-measure.
- Total ≈ 4–5 days. P5.1 and P5.2 hunters can share days; their fix batches must not touch the same files at once.

## 6. Risks
- Hunter overlap with per-card hunts → dedupe table first (⚠️1).
- Race repros are flaky on a loaded 4-vCPU VPS — run race checks alone (POS-MASTER-PLAN §8) with child processes.
- Perf noise from the Neon RTT and other lanes — measure with no other heavy unit running (systemd unit list check).
- Perf data on QC5 grows QC5 — drop after.
- Fixing D1c needs a signed device cookie = new auth surface (its own R1 + hunter).
- Index fixes on prod tables are a deploy-time step (P6.1).

## 7. Owner questions → OP W-items
- **W-next-6**: confirm the budgets — register < 1.0 s **warm** on an iPad-class screen (cold reported only) · barcode < 100 ms on the **register (client)** path (server lookup reported) · 200 lines = responsive UI + pay ≤ 2 s. Default: as stated.
- **W-next-7**: device identity (D1c): signed device cookie bound at pairing by a manager (recommended) vs keep "claimable device id" with an audit only. Default: signed cookie in P5.2.

## 8. Hard rules
COMMON + LANE-RULES:
- Hunters are read-only (no DB writes, no node except `--list`/`--dry` via iso).
- Oracles on QC4 via `qc4.sh` + `/tmp/shark-gate-pos.lock` + with-gate-lock; perf UI on QC5 only.
- Everything via `iso.sh`. Never export CI. No reseed.
- Builders never build/serve (perf UI = CONTROLLER-RUN).
- Every confirmed finding gets a red-before check before its fix.
- Money integer satang · `createSale` signature unchanged (F15.2) · new events need consumers + replay ×2.
- `pos-oracle-check.sh` + `pos-pre-submit.sh` · ORACLE-EDIT rule · `date -u` · ⛔ never push `main`.

## 9. Counters / done-definition
Each card is done when:
- its oracle is green ×2;
- every finding is fixed (HIGH/MED) or in the debt table with a reason (LOW);
- the second hunter is CLEAN on the fix diff;
- the full gate set is green;
- (P5.3) every budget is met, or the owner signs off the measured value as W-next-6.

Counter +1 per card (3).

## 10. PROPOSED rulings for the controller
1. Three cards; P5.1 + P5.2 hunters may run in parallel (≤ 2 hunters + 1 other lane); fixes serialised by owning file. `(confirmed · controller B …)`
2. Severity bar: HIGH/MED must be fixed in the card; LOW = fix if ≤ 5 lines, else debt row (CRM C5.5 rule). `(confirmed · controller B …)`
3. `scripts/pos-authz-matrix.json` is the single source for P5.2; M1 fails on any unlisted surface (new surfaces in P6 must add rows). `(confirmed · controller B …)`
4. D1c = signed device cookie (pairing by MANAGER/OWNER; key source = open question for the builder to propose, never `CHAT_CREDENTIALS_KEY`; R1 + hunter mandatory); D11 = refuse legacy setup writes on linked units (409 POS_LINKED, LEG pattern). `(confirmed · controller B …)`
5. Public tokens: no format change unless entropy < 60 bits; add rate limits where missing (bucket pattern of P2.13). `(confirmed · controller B …)`
6. Platform/Beam signatures: keep the formats; add a replay test (idempotent effect) now; timestamp/nonce = real-adapter cards (W4). `(confirmed · controller B …)`
7. Perf data = temp tenant `posqc-perf-<rand>` (server on QC4, UI on QC5), created by `seed-pos-perf.mts` with module functions only, dropped after; never in `coffee`/`resto`. `(confirmed · controller B …)`
8. Budgets as W-next-6 defaults; red = 2 consecutive over-budget runs; RTT is reported beside each server number. `(confirmed · controller B …)`
9. Index fixes ship as hand `CREATE INDEX CONCURRENTLY` steps in the P6.1 runbook (no migration on big existing tables); new-table indexes may go in a migration. `(confirmed · controller B …)`

### §10 addendum — controller B (22 Oct 01:2xZ) · early rulings for P5.2 only
- Ruling 1 **modified**: the P5.2 **matrix builder + oracle writer** starts now (read-only lane · tree b · `wip/pos-p5.2-oracle` · red-before · no product edits) while P3.6U/P3-SKEL U are still open; the matrix must be re-based (new surfaces added) after each of those merges — M1 "unlisted surface" is the reminder. Hunters and fixes wait for the P4.3 merge as drafted.
- Ruling 3 **confirmed** (`scripts/pos-authz-matrix.json` single source · M1 fails on unlisted surfaces).
- Ruling 4 **deferred** to the P5.2 fix round (D1c key source: a separate env key, never `CHAT_CREDENTIALS_KEY`/`POS_CREDENTIALS_KEY`; unset ⇒ pairing refused with a "ยังไม่ตั้งกุญแจ" card like creds).
- Rulings 5 and 6 **confirmed** (no token format change unless entropy < 60 bits · rate limits where missing · replay test now, nonce/timestamp with the real adapters).
- Rulings 2, 7, 8, 9 (severity bar · perf tenant · budgets · index steps) are confirmed as drafted but apply when P5.1/P5.3 open.


### §10 addendum 2 — controller B (22 Oct 08:4xZ) on P5.3 oracle/seed (`wip/pos-p5.3-oracle` b8d4ad23 · CD-P53-O1…O12)
- O1: the gated barcode number stays the **end-to-end scan on the register ≤ 100 ms**; if it is red in two consecutive QC5 runs the answer is a product fix (client-first match from the loaded catalogue, server call only on a miss) in a P5.3 fix round — not a budget re-ruling.
- O2 accepted: all perf measuring on QC5 (seed + oracle refuse QC4 unless `PERF_ALLOW_QC4=1`); this replaces ruling 7's "server on QC4".
- O3 accepted (200-line bill through the real register UI; never drain the outbox in-process).
- O4 accepted for the first run (5,000 products · 50 categories · 3 price rules · 1 member); bills/members/option groups for reports, bills list and shift Z = **P5.3b** second run before P5 closes.
- O8 accepted (print preview timing and 390-wide overflow are the walker's/parity's job).
- Controller run order on tree d (QC5) after the P3-SKEL U round: `--preflight` → seed → build + serve → oracle run 1 → run 2 → `--drop`.

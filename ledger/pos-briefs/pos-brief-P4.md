# Brief — P4 "ทุกปุ่มทำงาน" (3 ใบ · CRM §7 วิธีเดียวกัน): P4.1 ทะเบียนปุ่ม/ฟอร์มครบทุกจอ (data-testid + F15.3) · P4.2 เดินทุกปุ่มด้วย harness 3 ขนาด · P4.3 แก้ที่พบ + regression · lanes S (P4.1/P4.3 builder) + CONTROLLER-RUN walker (P4.2) · DRAFT by brief drafter (account B) 22 Oct 2026 01:3xZ — controller rules in §10

Read-only survey of `session/pos` **74484db5** (product tip a58122fc · working tree = ledger only). Plan row `POS-MASTER-PLAN.md:97`. Method `CRM-MASTER-PLAN.md` §7 (`:193–218`: registry `crm-ui-inventory.json`, F14.1/F14.2, mockup `*.body.html` completeness, presser `qc-crm-buttons.mts` steps 1–6, `summary.json` passed = total before C5). CRM as built: C4.1 1,066 rows · C4.2 runs 5+6 = 7,805/7,805 · C4.3 forms 669/669 · C4.4 journeys 92/95 (`HANDOVER-2026-10-CRM.md:114–121`). Starts after P3.12 merges. Notes → `ledger/wo-notes/pos-P4.{1,2,3}.md`.

⚠️ Prompt-vs-code (read first):
1. **POS has 3 cards where CRM had 4** (C4.1 registry · C4.2 presser · C4.3 forms · C4.4 journeys). Proposal: forms go into P4.2 (same runner, `kind: form` rows) and the journeys are a small J-set in P4.2 (§10.4).
2. **The registry exists and is gated, but it is thin for a presser.** `scripts/pos-ui-inventory.json` has 1,133 rows (owner 469 · owner+cashier 620 · +manager 44; 238 `*` patterns). `expect.type`: ui 712 · mutation 191 · modal 115 · navigate 84 · inline-error 24 · toast 5 · download 2. Gaps:
   - 214 rows have no `target`;
   - only 49 of the 191 mutations name a `db` effect;
   - `oracle` is empty on 936 rows (`$fields.oracle` says "ว่างได้จนกว่า P4.2 จะเขียนตัวกด");
   - there are no `opener`/`needs`/`viewport` fields, which the CRM presser needed (C4.2 contract, `qc-crm-buttons.mts:1–40`).
3. **Public pages have no "public" role.** `$roles` allows owner · manager · cashier only, yet 60 rows sit on `/r/[token]` · `/q/**` · `/d` · `/developers/pos` with roles owner/cashier.
4. **Baseline debt is 46 untestid elements in 8 files** (`baselineDebt.items`). 27 of them are in the legacy register `src/lib/modules/pos/register-ui.tsx` (22) + `register-legacy-page.tsx` (5), which still exist (still used when `settings.pos.registerV2` is off; `qc-crm-c2.7.mts:166` reads register-ui). The rest are products 12 · close 3+2 · sales 1 · shifts 1.
5. **`visual-pos.mts` is a pinned file** (`qc-hf-fu` ST1 watches it, HF-FU2 brief §3), and it holds all fixtures (11,285 lines). Every edit costs a re-pin. A new runner must not grow inside it.
6. **POS presses write money on QC5.** Bills, receipt numbers, deposits, gift cards and slips cannot be "restored" the way the CRM presser snapshot/restore did (`wo-notes/crm-C4.2.md:41`): receipt counters, outbox and account JVs follow. QC5 is never reseeded.
7. **Per-device/per-key rate rules bite a presser.** Snapshot: 1 per device per 60 s (`visual-pos.mts:8205`; P3.4U fix2 lesson — never touch the rule). REST write bucket: 60/min/key (`qc-pos-p2.13` RL1). Public issue report: ≤ 3 rows/bill/day (`visual-pos.mts:135`).

## 1. Scope / goal
Every clickable or fillable POS control, on every POS screen (14 `POS_PAGES` + exempt price-rules/print/developers · `scripts/pos-qc-env.mts:307`), at 1440×900 · 1024×768 · 390×844 (`POS-MASTER-PLAN.md` §1 X10/X11), for owner · manager · cashier (+ anonymous on public pages):
- it is visible or absent exactly as the registry says;
- when pressed, it does what `expect` says (modal / navigate / mutation with the DB effect / download / toast / inline error / ui state);
- there is no dead button, no console error or hydration warning, no ≥ 400 response (except declared refusals), and no overflow.

Forms: a valid submit succeeds · an empty required field gives an inline Thai error · long/special/`=cmd` input does not break · a double submit = one row · closing mid-way leaves no row (CRM §7 step 5).

## 2. What exists today (verified)
- **F15.3 gate** (`scripts/fitness-pos.mts:554–580`, checks `:778` F15.3a, `:838` F15.3b): `discoverPosFiles` = `src/app/**` with a `pos` segment + `src/lib/modules/pos/**` + `src/components/pos*/**` + their imports inside `register*/pos*` folders. Every clickable testid must be in the registry and every row must exist in code. Kinds `:561`, roles `:562`, expect types `:563`; `$foreign` handles CRM-owned `pos-deal-select`.
- **Visual harness** `scripts/visual-pos.mts`:
  - `--list` (`:136, :212`), `--states`/`--state a,b`, per-card PLAN tables (`STATE_PLAN :317` … `P35U_PLAN :741`, `P34U_PLAN :786`, + P37U/P38U/P39U), `EN_MOBILE_PAGES :1205`;
  - judging = testid-step · console · overflow · 5xx (header `:9–15`);
  - fixtures = find-or-create, kept, QC tenant `coffee` only; fresh browser context per state.
- **P2.14 checks**: V1–V4 (`qc-pos-p2.14.mts:119–122`; V4 = every staff page has registry rows + an authz pin or a refusal testid) · K3 merge-base ban (`:112, :515–528`).
- **Sweep plan** `scripts/pos-visual-sweep.json` (33 runs · `$command` runs on QC5 via `qc5.sh`, `CI=1` inside iso only).
- **Mockups**: 21 `ledger/design-pos/*.body.html` (01 register … 21 approval-plan) = the completeness source (CRM §7).

## 3. Gaps
- G1: registry fields for a presser (target/db/opener/needs/viewport/public role).
- G2: 46 debt elements (⚠️4).
- G3: no POS presser.
- G4: no forms runner.
- G5: no journey script.
- G6: no mockup-vs-registry count.
- G7: no rule for money presses on QC5 (⚠️6).

## 4. Proposed oracles
- **P4.1 — `scripts/qc-pos-p4.1.mts`** (static + `--no-db`; ≈ 14 checks · red-before `wo-notes/P4.1-red.txt`):
  - **R1** every row has `target` (or `expect.type` ui with `state`).
  - **R2** every `mutation` row has `db` (table + field/state), or `oracle` naming a DB check id that exists in a `qc-pos-*` `--list`.
  - **R3** `opener` / `needs` / `viewport` keys are valid when present. The opener chain only uses registry testids; patterns are allowed.
  - **R4** the `$roles` set includes `public`. Rows on `/r` `/q` `/d` `/developers` use `public` only.
  - **R5** `baselineDebt` total = 0 on every file that is **in scope**. The legacy register-ui / legacy-page are in scope only if §10.3 says so.
  - **R6** mockup completeness: per `design-pos/NN.body.html` — buttons/links/inputs counted vs registry rows of the mapped page. A difference > 0 needs a row in `$mockupGaps` with a reason.
  - **R7** F15.3a/b green (fitness-pos PAR).
  - **R8** every testid in `qc-pos-*`/`visual-pos.mts` steps exists in the registry (no ghost testids used by tests).
  - **R9** `hiddenFor` ⊆ roles universe and never equal to `roles`.
  - **R10** every refusal card testid of V4 is in the registry with expect `ui` state "refused".
  - **R11–R12** money rows carry `safety: "money" | "external" | "counter"` (see the P4.2 policy).
  - **R13–R14** th/en: every registry `expect.note` key that names a message key exists in both locales.
- **P4.2 — walker `scripts/qc-pos-buttons.mts`** (port of `qc-crm-buttons.mts`; new file, no edit to `visual-pos.mts`). Fixtures in a new module `scripts/pos-buttons-fixtures.mts` that reuses only exported service functions (find-or-create, kept). `--dry` lists the plan + every SKIP reason. Verdict file `.qc-shots/pos/buttons/summary-<user>-<device>.json` `{total, passed, dead[], wrongExpect[], hiddenLeak[], consoleErrors[], hydration[], http4xx5xx[], overflow[], skippedNeeds[], skippedSafety[], restores[]}` + `JSON_SUMMARY`. Plus a thin static gate `qc-pos-p4.2.mts` that reads the summaries:
  - **W1** summaries exist for users × devices at the recorded head;
  - **W2** `passed == total` and dead/wrongExpect/hiddenLeak = 0;
  - **W3** every `skippedSafety` row has an `oracle`;
  - **W4** the build id and head are recorded;
  - **W5** forms: double-submit = 1 row, cancel = 0 rows;
  - **W6** J-set result.

  "Pressed" is verified by `expect.type`:
  - `modal` → the target testid becomes visible in ≤ 3 s;
  - `navigate` → the URL matches the target pattern (+ HTTP 200);
  - `mutation` → the server action/REST response is ok **and** the `db` query after the press shows the change (read through the QC5 Prisma client with `POS_QC_ALLOW_HOST=ep-fragrant-thunder`);
  - `download` → a non-empty file with the right MIME;
  - `toast` / `inline-error` → the testid is visible with Thai text (en run: English text);
  - `ui` → `state` holds (aria-selected / aria-checked / value) — an idempotent control is not dead (CRM C4.2 lesson `crm-C4.2.md:103`).

  **Dead** = within 3 s: no DOM change, no navigation, no network, no toast.

  **Money policy (⚠️6)**: rows tagged `safety` are pressed only in a dedicated walker branch of tenant `coffee` (unit `posqc-btn` find-or-create, kept, own device codes, own shift), up to the press itself. Then:
  - `counter` rows (receipt/tax/CN numbers) are pressed for real at most once per run on that unit;
  - `external` rows (print · LINE · Beam · e-Tax · LAN agent · webhook) are **not** pressed. They go to `skippedSafety` and need an `oracle` id that covers the same action with a stub.

  Settings toggles are snapshot/restored per row, with the exact value (P3.9U B2 pattern). Shifts are opened and closed by the walker on its own device.

  **Rates**: one device code per state for offline snapshot rows; ≥ 61 s spacing per device; REST rows are not walked (REST = `qc-pos-p2.13`).

  **Run**: CONTROLLER-RUN on QC5 only, served build on tree d, one user × device at a time (P3.5U F1), ≈ 1,133 rows × ~1.7 roles × 3 sizes ≈ 5,800 presses (CRM run6 4,377).

  **J-set** (journeys pressed end to end):
  - J1 open shift → cash sale → Z;
  - J2 MANUAL order → bill → partial refund;
  - J3 table → split 3 ways → pay;
  - J4 offline sale → sync → manager accept;
  - J5 credit bill → AR row in account → receive payment;
  - J6 slip attach → manager confirm.
- **P4.3 — fix rounds + `scripts/qc-pos-p4.3.mts`** (one check per confirmed finding, red-before at the finding head, + Z1/Z2 residue on QC4 if DB):
  - findings are triaged by the controller (presser bug / opener / missing needs-seed / **real bug**, CRM `crm-C4.2.md:97`);
  - real bugs are grouped by owning file (member-fix-COMMON pattern);
  - one builder per group, R1 per round, R2 on fixes;
  - after each round the walker reruns **touched pages only** + `qc-pos-p1.1` + `p1.3` + fitness ±env + typecheck (LANE-RULES ด่านจุด merge);
  - reshoot of touched states (`--states --state …`).

  Also in P4.3 from P3.12 triage: F6 due date · F16 P3.5U tags/reader · F18 card links · F22 RPT-6 print route (own authz check) · "#0" chip if the sweep showed it.

## 5. Lanes · trees · order · estimate
- P4.1: oracle writer (tree e/f, ≈ 2 h) → builder S tree b (registry fields + debt + `$mockupGaps`, ≈ 0.5 day; touches `pos-ui-inventory.json`, testids in UI files = U-type edits) → R1.
- P4.2: walker writer (builder, tree b, ≈ 1 day; `--dry` only — builders never build/serve) → controller chain on tree d: QC5 migrate status → build 10g → serve → walker pass per user × device (≈ 6–9 h of passes, sequential) → summaries.
- P4.3: 1–3 fix rounds (≈ 1–2 days).
- Total ≈ 3–4 days. Hard cap 3 lanes; a walker pass counts as a lane and is heavy (Chromium + server), so lane 3 = light work only.

## 6. Risks
- Walker false-deads: the CRM pilot had 1,327 dead of 1,962, mostly presser bugs. Expect iteration 1 to fail for presser reasons; budget 2 iterations before real-bug triage.
- QC5 drift from QC4 (migrations).
- Money rows on QC5 accumulate (bills/receipts) — acceptable on QC5. Never on QC4 (QC4 = oracles).
- Hydration 418 class (HF-HYDRATION-418 precedent) on 390.
- The PRIVATE kanban board (W26) hides cards from the manager role → walker rows need `needs`.
- `visual-pos.mts` pin (⚠️5).
- Registry edits collide with the P3.12 U round (merge order).

## 7. Owner questions → OP W-items
- **W-next-4**: legacy register (`register-ui.tsx` + legacy page) — retire it at P6 (registerV2 for all) or keep it and pay the 27-element debt? Default: keep it, out of P4 scope (flag off path); debt rows stay documented.
- **W-next-5**: may the walker create a dedicated QC5 branch unit "posqc-btn" in tenant `coffee` (real QC bills/receipt numbers)? Default: yes (QC only).

## 8. Hard rules
COMMON + LANE-RULES:
- QC5 only for the walker and visual; QC4 only for oracles (`qc4.sh` + `/tmp/shark-gate-pos.lock` + with-gate-lock).
- Everything via `iso.sh`. Never export CI outside the iso command. No reseed/reset.
- Builders never build/serve; the walker run is CONTROLLER-RUN.
- No network beyond the local server (`globalThis.fetch` guard for external hosts; LINE/Beam/e-Tax never called).
- No `visual-pos.mts` edits in P4 unless the controller re-pins.
- `pos-oracle-check.sh` before each builder; `pos-pre-submit.sh` for gates.
- ORACLE-EDIT rule. `date -u`. ⛔ never push `main`.

## 9. Counters / done-definition
- **P4.1 done** = `qc-pos-p4.1` green · F15.3 green · debt 0 in scope · `$mockupGaps` reasoned.
- **P4.2 done** = summaries for owner/manager/cashier/public × 3 sizes (th; en = 1440 + EN_MOBILE_PAGES) with passed = total minus reasoned skips · J1–J6 green · `qc-pos-p4.2` green.
- **P4.3 done** = every real-bug finding fixed with a red-before check in `qc-pos-p4.3` · the walker rerun green on touched pages · full gate set green.

Counter +1 per card at merge (3).

## 10. PROPOSED rulings for the controller
1. Three cards as planned; forms + journeys live in P4.2's runner (no fourth card). `(confirmed · controller B …)`
2. Registry schema += `opener` · `needs` · `viewport` · `safety` · role `public`. F15.3b accepts the new keys; ORACLE-EDIT of `fitness-pos.mts` `ROW_ROLES` (`:562`) by the controller. `(confirmed · controller B …)`
3. Legacy register out of scope (flag-off path), unless the owner answers W-next-4 "retire". Its 27 debt rows stay as documented debt. `(confirmed · controller B …)`
4. Walker = new `qc-pos-buttons.mts` + `pos-buttons-fixtures.mts`; `visual-pos.mts` untouched. `(confirmed · controller B …)`
5. Money policy as §4 (dedicated QC5 unit `posqc-btn` · counter rows once per run · external rows never pressed and must cite an oracle · settings exact restore). `(confirmed · controller B …)`
6. Sizes: th at 3 sizes for every staff page; en at 1440 + EN_MOBILE_PAGES; public role at 390 + 1440. `(confirmed · controller B …)`
7. Pass bar: passed = total (reasoned skips excluded), 0 dead/wrongExpect/hiddenLeak, console/hydration 0, overflow 0. `(confirmed · controller B …)`
8. P4.3 fix policy: group by owning file · R1 every round · hunter only if a fix touches money/stock/account paths. `(confirmed · controller B …)`
9. Walker passes run strictly one at a time, never at the same time as a tree-d build or qc:all. `(confirmed · controller B …)`

### §10 addendum — controller B (22 Oct 06:2xZ): rulings 1–9 **confirmed as drafted**. W-next-4 → **W29** (legacy register: default keep · out of P4 scope · 27 debt rows documented) · W-next-5 → **W30** (walker may create QC5 unit `posqc-btn` in tenant `coffee`; default yes, QC only). Ruling 2: the `fitness-pos.mts` ROW_ROLES/F15.3b ORACLE-EDIT is prepared by the P4.1 oracle writer as its own `test(pos)` commit under this ruling (controller reviews the diff). Order: P4.1 oracle writer starts now (lane 3, tree b, scripts only · red-before) while P3-SKEL U builds; the P4.1 builder (registry fill + debt testids) starts after P3-SKEL U merges so the registry rows of SKEL-U are included; P4.2 walker writer after P4.1 merges; walker passes on tree d one at a time, never beside a build or qc:all.

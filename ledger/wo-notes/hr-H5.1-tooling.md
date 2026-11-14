# H5.1 tooling — walk every HR button at 3 sizes (tooling only, dry-checked)

Branch `wip/hr-h5.1`. Files: `scripts/seed-hr-walk.mts` · `scripts/walk-hr.mts` · `scripts/walk-hr-matrix.json` · `.gitignore` (+`scripts/hr-walk-expected.json`). No product code changed. `visual-hr.mts` is untouched: the walker does not import it, because that file runs as soon as it is imported. The walker repeats its login and cookie rules.

## Commands for the controller (in this order)
```
W="bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx"
$W scripts/seed-hr-qc.mts                       # base (34 checks) — only if the lane tenant is missing/stale
$W scripts/seed-hr-walk.mts                     # additive walk data → scripts/hr-walk-expected.json (manifest)
$W scripts/seed-hr-walk.mts                     # optional: 2nd run = no writes, "changedSinceUp: []"
# build + serve (CONTROLLER-RUN, brief §8):
ISO_MEM=16G bash scripts/iso.sh bash scripts/qc-hr.sh env NODE_OPTIONS=--max-old-space-size=14336 ACC_V2_BUILD_FLAGS=--webpack ACC_V2_PORT=3226 bash scripts/acc-v2-serve.sh build
#   serve as own unit hr-qc-serve-3226v on :3226 (… qc-hr.sh env ACC_V2_PORT=3226 bash scripts/acc-v2-serve.sh start)
$W scripts/walk-hr.mts --dry                    # matrix ↔ inventory ↔ routes + Chromium check (no server)
$W scripts/walk-hr.mts --base http://127.0.0.1:3226            # full walk (≈609 shots); add --resume after an interruption
$W scripts/walk-hr.mts --sheets                 # rebuild sheets/summary from results.jsonl (no server/DB)
# optional LINE-off re-shoot of the LINE cards: $W scripts/seed-hr-walk.mts --line off → walk --only 22 / --only 14 → --line on
$W scripts/seed-hr-walk.mts --down              # removes exactly what the walk seed added; reports residue
# stop the serve unit by name
```
Filters: `--only <state id | prefix | brief row>` · `--viewer O|owner` · `--size 1440|1024|390` · `--lang th|en` · `--clicks primary|all|none` (default primary = 1440 th + 390 th) · `--no-refusals` / `--refusals-only` · `--out` (default `/root/qc/hr-h5.1`).
Outputs: `/root/qc/hr-h5.1/<state>/<viewer>-<WxH>-<lang>.png` · `<state>/clicks/*.png` (each dialog/sheet opened, then closed) · `refusals/<id>-<viewer>.png` · `results.jsonl` (one line per cell, appended; the latest line per key wins) · `sheets/<state>.html + .png` (MOCKUP | RENDER per size, then 1440 | 1024 | 390 for each viewer × lang) · `summary.json`.

**Browser:** `playwright` does not resolve from this tree (14 Nov: `require('playwright')` → MODULE_NOT_FOUND; only `playwright-core` exists, under `/root/smilewatchshop-ops`). The walker therefore uses the same browser as visual-hr: `puppeteer-core` 24.43 from `/root/dive3d` with `/usr/bin/chromium-browser` (Chrome 157). Override with `WALK_PUPPETEER` / `WALK_CHROMIUM`.

## Matrix counts (`walk-hr.mts --dry`)
- Brief §4 cells: 84 → 504 shots (× 3 sizes × th/en).
- Refusals: 35 (th 1440). Brief total = 539 ✓.
- Extras, 17 shots:
  - v2 run APPROVED / PAID (O, PB) / REVERSED, and the v1 paid run (th × 3 sizes)
  - Q5 unlinked ของฉัน for O and N (390 th)
- Coverage, 53 shots: acceptance 3 requires every (page, role) pair in inventory `roles ∪ hiddenFor` to be opened. The matrix never opens 53 of those pairs, so the walker adds `cov-*` cells for them at 1440 th. These cells accept HTTP 200 or 404 and still run the INV-LEAK and privacy checks.
- **Total 609 PNG** plus click shots. MOCKUP | RENDER pairs: 27 brief states × 3 = **81**; with x1/x2 the total is 87. The brief said 78 because it counted 26 states; row 19 has three states here.
- TODO states x6 (H4.3 AI, `hr-ai-*`) and x7 (H4.8 API keys, `hr-apikey*`) switch on automatically once inventory rows with those prefixes exist. Confirm their paths when those tickets merge.

## MOCKUP | RENDER pairs (pair viewer, th, all 3 sizes)
| state | brief row | viewer | mockup |
|---|---|---|---|
| 01-hub | 1 | O | ledger/design-hr/01-team-overview.png |
| 02-employees · 03-employee-namfon · 13a-report-register | 2 · 3 · 13a | O | ledger/design-hr/02-employees.png |
| 04-roster | 4 | O | ledger/design-hr/03-roster.png |
| 05-attendance-day · 06-attendance-month | 5 · 6 | O | ledger/design-hr/04-attendance.png |
| 08-kiosk | 8 | K | ledger/design-hr/04-attendance.png |
| 07-corrections · 09-leave · 10-requests | 7 · 9 · 10 | O | ledger/design-hr/05-leave-ot.png |
| 11a-payroll-open · 11b-payroll-bank (+x1, x2) | 11a · 11b | O | ledger/design-hr/06-payroll-run.png |
| 08-kiosk-pin | 8 | K | ledger/design-hr/07-mobile.png |
| 12-slip-admin | 12 | O | ledger/design-hr/07-mobile.png |
| 17 · 18 · 19a · 19b · 19c · 20 · 21 · 22 (me/hr) | 17–22 | S | ledger/design-hr/07-mobile.png |
| 13b-report-payroll · 13c-report-time | 13b · 13c | O | ledger/design-hr/01-team-overview.png |
| 14-settings · 15-law | 14 · 15 | O | ledger/design-hr/08-settings-ai.png |

## Known gaps
- **No mockup:** 16-approvals, x3 (REVERSED), x4 (v1 paid), x5 (unlinked me). Each is judged against the owner rules and the th/en twin.
- **visual-hr has no spec for 3.6 / 3.7 / 3.4-YTD / 4.3 / 4.8.** The matrix covers them as follows:
  - 3.6 filings: 11b (bank/filings/JV section) and x2. The seed makes a ภ.ง.ด.1 for the PAID period, a สปส.1-10 for the PAID run, and one 50 ทวิ for วิว.
  - 3.7 accounting: x1 (accrual JV) and x2 (pay JV). The seed links the book and a pay account.
  - 3.4-YTD: 11a (DRAFT with YTD_OPENING warnings) and x2. วิว has an opening saved; everyone else is missing one.
  - 4.3 / 4.8: TODO hooks (x6/x7 in the matrix; `todo.H4.3` / `todo.H4.8` steps in the seed, which are skipped while the module file is absent).
- **Not delivered, from brief §8:**
  - `visual-hr --lang` and the `"5.1"` spec: the walker replaces both.
  - `hr-walk-sheets.mts`: the walker's `--sheets` mode does this.
  - The static `hr-testid-gaps.mts`: only its runtime twin exists. The walker lists `NO-TESTID` gaps per page in `summary.json` `testidGaps`.
- **PB has no inventory role.** PB cells get no INV presence or leak assertions; privacy checks cover PB (`PRIVACY-BRANCH-MONEY`, `LIMITED-NOTE`).
- **The walker has not run against a live server yet** (there is no server). Only `--dry`, `--sheets` (with a fake results line) and tsc have been exercised. Expect one tuning round on the first real run: the selectors in the false-positive list below, and the click budget (≤ 60 clicks per primary cell).

## Seed facts the controller must know (seed-hr-walk)
- **v2 runs:**
  - REVERSED = this month −4, APPROVED = −3, PAID = −2.
  - DRAFT = **−5 (June)**. A DRAFT for this month or next month is refused (tried 14 Nov): future roster days are REVIEW (`WORK_ENTRIES`), and seed-hr-qc's pending OT gives `OT_OPEN`. The "open period" screen (11a) is therefore `?period=<DRAFT period>`.
  - The DRAFT has YTD_OPENING on 10 people. วิว has none, because her opening is saved as of 31 May.
- **50 ทวิ:** ANNUAL for this year, issued with `now = 5 Jan next year` (ANNUAL is refused before year end). Its issue date is therefore in the future.
- **Salary certificates:** one issued (owner → น้ำฝน, HRSC-…) and one pending request (น้ำฝน, BANK), which is the CERT kind in the inbox.
- **Labour:** POS system linked to หัวหิน, plus 26 raw `PosSale` bills (08–20 h, yesterday and today), written the h4.2 way. Settings: `splh 150000`.
  - PB's keys = payroll keys + `pos.report.view`.
  - The excluded employee for PB is เจ (home สวนผึ้ง, borrowed into หัวหิน).
  - The bills are dated "today" at seed time. **Seed on the walk day.**
- **LINE (faked as in h4.5):** CHAT system + LINE connection + unit setting. Policy ON. น้ำฝน = linked (S); ก้อย = pending code (PS); everyone else = not linked. The pending code expires in about 6 days because the seed uses `now = +6 d`. `--line off|on` flips the policy through the service.
- **Notices:** `planHrNotices` on existing outbox events gives 1 notice. The seed never drains or sends.
- **`--down`:** deletes every tenant row whose id is not in the manifest baseline, restores the HR `AppSystem.settings`, and deletes the `qc-hr-walk:*` law rows, the payroll-branch user, and new rate buckets. It then compares md5 per table (ignoring `updatedAt`) with the baseline.

## Dry checks (14 Nov, lane DB ep-nameless-sea)
- (a) `seed-hr-walk`, run on the lane DB:
  - Attempts 1 and 2 failed at DRAFT. Each re-run removed the partial data first with no residue.
  - Attempt 3: every step ✅ (failed: []), `complete: true`, 54 tables hold walk rows.
  - A second up: "manifest complete — no writes · changedSinceUp: []", exit 0.
  - `--down`: `residue: []`, exit 0, manifest removed.
- (b) Targeted tsc (temp tsconfig, since deleted) over seed-hr-walk.mts + walk-hr.mts: exit 0, 0 errors.
- (c) `walk-hr.mts --dry`:
  - 0 errors.
  - Every path template resolves to a `page.tsx` under src/app (462 routes).
  - 19/20 inventory pages are covered. `(unmounted · H2.10)` is excluded with its reason.
  - Chromium launched against about:blank (Chrome 157 headless).
  - Counts as listed above.

## What the controller must LOOK at (never from JSON)
1. All 81 pairs in `sheets/<state>.png`. Write MATCH/MINOR/MAJOR in `hr-H5.1-walk.md` and open the full PNG through the HTML link (the sheets crop at 1800 px).
2. The en column of every sheet at 1440 + 390 (wording). The th column for Thai wording and classifiers.
3. Every viewer at 390 (density and order). PB on 01-hub / 11a / x2: money only on หัวหิน rows, plus the partial note.
4. `clicks/` shots: every opened dialog or sheet at 1440 and 390. `MODAL-NO-CLOSE` / `POST-BLOCKED` (WARN) items in `summary.json`: a POST on a non-mutation click means the button fires a server action.
5. Expected false-positive classes to triage, not fix blindly:
   - `EN-THAI`: seed-generated Thai text such as notes with dates.
   - `TH-RAW-ENUM`: an unknown acronym; add it to `allow.enumsTh` if legitimate.
   - `PRIVACY-MONEY-TEXT`: the money regex can hit non-money decimals not followed by ชม./วัน/%.
   - `HSCROLL-EL`: undeclared scrollers. Declare them with `data-scroll="x"` in a VIS-5 batch, or add them to the state's `allowScroll`.
6. Refusals: `REFUSAL-BYTES` compares forbidden-id and unknown-id bodies after replacing ids and nonces. If Next embeds anything per-request beyond those, the diff length is reported. Check one pair by hand.

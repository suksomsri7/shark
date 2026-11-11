# P1.17 U — reports UI: 7 report screens · CSV download · dashboard card (controller · 7 Oct 2026 · account B lane 2)

> Server side P1.17 S is ACCEPTED in `session/pos` (12813b8a): `src/lib/modules/pos/reports.ts` + `report-actions.ts` (`posReportAction`, `posReportCsvAction`, `posDashboardCardAction`), permission `pos.report.view`, message block `pos.report.*` in `src/messages/{th,en}/pos.json` (title/from/to/rangeHint/allUnits/downloadCsv/empty/total/unknownSeller/estimated/noCost/kinds.*/card.*). This card = UI only. No server logic changes except where listed in §3.
> Read first: `pos-brief-COMMON.md` · `pos-brief-LANE-RULES.md` · `pos-brief-P1.17.md` (R1–R16: row/total field names per report — the UI shows exactly those) · `ledger/wo-notes/pos-P1.17.md` (§"Rules I invented" 11–13: CSV cell rules, message keys) · `docs/UI_STANDARD.md`. Mockup: `ledger/design-pos/08-reports.png` (+ `08-reports.body.html` for exact layout/labels; PARTIAL — see §2 for what is in scope).
> Patterns to copy: `src/app/app/sys/[id]/pos/shifts/page.tsx` (server page: requireTenant → appSystem POS → posMembership → units → evaluate) + `ShiftsClient.tsx` (client component calling server actions, refusal cards, unit switcher). System home page `src/app/app/sys/[id]/page.tsx:140-165` ("ยอดวันนี้" Section).

## 1. Tree / branch
- Worktree `/root/projects/shark-pos-c` (clean). `node_modules` = READ-ONLY bind mount of `shark-pos-p11` (Prisma client current as of session/pos). Never `pnpm install` / `prisma generate`. If the mount is missing: stop and report.
- `git fetch origin session/pos && git checkout -b wip/pos-p1.17u origin/session/pos`. Push only `wip/pos-p1.17u`. Explicit-path commits; never `git add -A`; never commit `scripts/*-expected.json`, `scripts/fixtures/**`, `.qc-shots`.
- Other sessions (HR, CRM, and the P1.6U builder in `shark-pos-b`) share this machine and GitHub: never touch other worktrees; heavy commands go through the gate-lock wrappers and may wait.

## 2. Scope (what to build)
1. **Route** `src/app/app/sys/[id]/pos/reports/page.tsx` (server) + `ReportsClient.tsx` (client).
   - Page: same gate as shifts page; units = accessible units; if the actor lacks `pos.report.view` on every unit (use `evaluate(m, {module:"pos", action:"pos.report.view", unitId})`) render the page with a refusal card (Thai, from `pos.report.*`/`pos.register.errors.*`; add a key if none fits) — never 500, never redirect loop.
   - Client: kind tabs (7 kinds, labels `pos.report.kinds.*`, order daily · products · staff · payments · margin · shifts · tax) · date range `from`/`to` (`YYYY-MM-DD`, default = last 7 days ending today BKK; hint `rangeHint`; 92-day cap enforced client-side AND server refusals shown) · unit select (`allUnits` + each unit; `unitId` undefined = all) · "ดาวน์โหลด CSV" button → `posReportCsvAction` → Blob download with the returned `filename`/`contentType` (BOM already in body; do not add another) · table per kind with the R5–R10 columns in the brief's order (money via `MoneyText`/baht 2 dp, counts plain, `marginBp` as `%` 2 dp or `—`, null cost → `noCost`, estimated → `estimated` tag, null seller → `unknownSeller`, shift status Thai) · totals row (`total`) · empty state (`empty`) · loading + refusal cards (`VALIDATION`/`NOT_FOUND`/`PERMISSION_DENIED`/`INTERNAL` as data, Thai text). URL state: `?kind=&from=&to=&unit=` (so a screenshot URL reproduces a view).
   - Mobile (390): tabs scroll horizontally, table scrolls horizontally inside its card (no page-level horizontal overflow — visual-pos fails on `scrollWidth > clientWidth` at html/body/main).
   - Daily kind also shows a simple bar chart (7–92 bars, pure CSS/SVG, no chart lib) of `netSalesSatang` per day as in mockup 08 top — optional if time is short; the table is mandatory.
2. **Tab**: add `{ href: `${s}/pos/reports`, label: "รายงาน" }` to `src/lib/modules/pos/tabs.ts` AND the matching entry in `childrenFor("POS")` in `src/app/app/layout.tsx` (they must stay identical — `scripts/qc-pos-catalog.mts` checks it). Place it after "ปิดวัน".
3. **Dashboard card** on `src/app/app/sys/[id]/page.tsx`: replace the body of the "ยอดวันนี้" Section with the card from `posDashboardCardAction` (or call `posDashboardCard` directly server-side with the same ctx/actor the action builds — prefer the direct call, keep `closeDaySummary` import only if still used): `netSalesSatang` large, `billCount`, `avgBillSatang`, `deltaBp` vs yesterday (sign + colour tokens; `—` when null), `openShiftCount`, `voidCount`, `topProduct` (name · qty · sales), tip only when > 0. Keep the "ปิดวัน →" action and add "รายงาน →" to `/pos/reports` when the actor has `pos.report.view` on any accessible unit. Permission of the card itself stays `pos.sale.create` (R12/R16) — do not widen.
4. **Keys**: any new string → `src/messages/{th,en}/pos.json` under `report.*` (append-only; both languages). No hard-coded Thai in TSX except where the repo convention already does so on that page.
5. **visual-pos**: add page `reports` to `POS_PAGES` in `scripts/pos-qc-env.mjs` (+ `PAGE_EXPECT` owner 200 / cashier 200-or-refusal-card) so the controller can shoot it; if `visual-pos.mts` needs a per-page hook (e.g. set `?kind=daily&from=&to=` to the QC fixture's dates), add it behind the `p1.17` wo prefix only. Do not run visual-pos yourself (needs server = CONTROLLER-RUN).

## 3. Server-side touches allowed (smallest hunks)
- `report-actions.ts`: none expected. If the UI needs a combined "page bootstrap" action (units + permissions), add one `export async function posReportsPageAction` in the same file, same session→ctx/actor code path, refusals as data.
- `reports.ts`: read-only; do not change numbers or CSV. If you find a number bug, note it (CONTROLLER) — do not fix.

## 4. Gates before "done"
- Typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck` → 0.
- `pnpm fitness` with and without .env (via iso.sh) → 0. `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/fitness-pos.mts` → 0.
- Suites (QC4, forced and unforced): `qc-pos-p1.17` 35/35 unchanged · `qc-pos-catalog` (tabs parity) · `qc-pos-p1.9` · `qc-hf-pos-page-authz` · `qc-pos-p1.3` unchanged (you do not touch register files — prove it with `git diff --stat origin/session/pos`).
- No residue on QC4 (suites clean up themselves; do not create data by hand).
- Notes `ledger/wo-notes/pos-P1.17U.md`: screens built, keys added, actions used, open questions, exact commands + exit codes. Commit + push after each piece. QUOTA STOP at a clean commit with "next: <step>" in the notes.
- Then stop. No deploy, no build, no server. The controller builds, screenshots 1440/1024/390 + EN, runs parity vs mockup 08, reviewer, then accepts.

## 5. Out of scope
Hourly/category/channel/branch-compare blocks of mockup 08 (P2.11/P2.12) · PDF · refunds columns (P1.8) · day cut-off setting (P1.18) · tenant-wide dashboard widgets (`lib/dashboard/service`) · any change to `reports.ts` numbers or CSV layout.

Commit trailer:
```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

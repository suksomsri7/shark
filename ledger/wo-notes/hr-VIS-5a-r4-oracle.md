# HR VIS-5a round 4 — oracle / tooling (A1 · B1 · B2)

Tree `/root/projects/shark-hr-l3` · branch `wip/hr-vis-5a` · from head 1e56a930e · spec = `/root/projects/shark-hr-merge/ledger/wo-notes/hr-H5.1-visual-review-r4.md` A1, B1, B2 + controller rulings (17 Nov).
No `src/` edit. Files: `scripts/qc-hr-vis-5a.mts`, `scripts/qc-hr-vis-5a-lib.mts` (OWN), `scripts/walk-hr.mts` (TOOL, every hunk `ORACLE-EDIT (HR VIS-5a · controller r4) … ◂`), `scripts/walk-hr-matrix.json` (ALLOW_DATA), this note, `hr-VIS-5a-r4-red.txt`.

## New checks (qc-hr-vis-5a, now 42)
| id | sev | what | status on 1e56a930e |
|---|---|---|---|
| A1 | CRITICAL | TypeScript compiler API over every `page.tsx`/`layout.tsx` under `src/app/app/sys/[id]/hr/**` (+ `sys/[id]/payroll/**`, `me/hr/**` listed as info only): each inline function with a `"use server"` directive nested in another function → free identifiers resolved by the checker to bindings declared inside the enclosing function(s) but outside the action → fail when the binding is an arrow/function expression, a nested function declaration, an object literal with function members, or a binding whose type has call signatures. A captured inline server action (itself `"use server"`) is allowed (server references serialise). | **RED** — 15 captures (list below) |
| A2 | CRITICAL | the build's own transform: Next SWC (`next/dist/build/swc` `transform`, server layer, `serverActions`) on the same files → names inside `encryptActionBoundArgs(id, …)` = what Next ships to the browser as bound args → fail when a bound name is function-valued (classification from A1). Control: payroll page registers ≥7 server references. | **RED** — control ok (9 regs), bound fn args `back2` (payroll ×7), `corrBack` + `msgOf` (attendance ×4) |
| Y1 | MAJOR | B2 per viewer, fixture = 2nd DRAFT v2 run (period −5 months) whose anna row stores `ytdOpening:"MISSING"` (no live opening ⇒ review code YTD_OPENING). owner + new all-branch payroll viewer `payAll` (STAFF, `[]`, hr.payroll.read+pay ⇒ filings gate ⇒ ytd view): `hr-run2-ytd-link` present, its href is `?view=ytd…`, rendering that query shows `hr-ytd-card` with text. branch payroll `payU1`: review text `rv_YTD_OPENING` present (control) and no `hr-run2-ytd-link` / no `href` to `view=ytd` in the run screen (plain text = the pinned hint). | **RED** — owner ✓ payAll ✓ · `payU1: link to ?view=ytd offered (…/hr/payroll?view=ytd#hr-ytd-card) — viewer has no ytd view` |

Previous 39: all green (S2 green with the walker added to TOOL). Forced run ×2 on the lane DB (`qc-hr.sh` → ep-ancient-truth, "QC4 ✓"), residue none, Z1 green: `passed 39/42 · failed A1 A2 Y1` (`ledger/wo-notes/hr-VIS-5a-r4-red.txt`).
Command: `ISO_MEM=14000M NODE_OPTIONS=--max-old-space-size=12288 bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-vis-5a.mts` (A1 builds a TS program over the 19 files: ~50 s, fits 14 GB).

## RED evidence = the missing behaviour
- A1/A2: the hits are exactly the review's cause (`back2` captured by the seven `run2Actions`, server log "Functions cannot be passed directly to Client Components … [function ag]") and the SWC output proves Next binds `back2` as an encrypted argument: `encryptActionBoundArgs("6055…", back2, runSel)`, `…(back2)` ×5, `…(id, period, back2)`. Same mechanism on attendance: `…(corrBack, view, msgOf)` ×2, `…(corrBack, msgOf)` ×2. Non-function captures (`id`, `period`, `runSel`, `path`, `year`, `back` string) are not flagged (settings page: 22 actions, 0 hits — negative control).
- Y1: the only failure is payU1 being offered the link; the owner/payAll legs pass, so the red is not the fixture.

## Full static hit list (A1, all HR pages)
```
src/app/app/sys/[id]/hr/attendance/page.tsx:88  onRequestMine captures corrBack (arrow, :87) + msgOf (arrow, :86)
src/app/app/sys/[id]/hr/attendance/page.tsx:93  onRequestFor  captures corrBack + msgOf
src/app/app/sys/[id]/hr/attendance/page.tsx:98  onDecide      captures corrBack + msgOf
src/app/app/sys/[id]/hr/attendance/page.tsx:103 onCancel      captures corrBack + msgOf
src/app/app/sys/[id]/hr/payroll/page.tsx:78  create   captures back2 (arrow, :76)
src/app/app/sys/[id]/hr/payroll/page.tsx:83  rebuild  captures back2
src/app/app/sys/[id]/hr/payroll/page.tsx:88  approve  captures back2
src/app/app/sys/[id]/hr/payroll/page.tsx:93  pay      captures back2
src/app/app/sys/[id]/hr/payroll/page.tsx:98  reverse  captures back2
src/app/app/sys/[id]/hr/payroll/page.tsx:103 confirm  captures back2
src/app/app/sys/[id]/hr/payroll/page.tsx:108 sync     captures back2
```
Other HR routes (info scope `sys/[id]/payroll/**`, `me/hr/**`): no inline actions with captures. employees/[employeeId] (1 action), settings (22): clean.
The attendance hits are older than VIS-5a (H2.6 corrections block): the corrections buttons (request / decide / cancel) should crash the same way — not seen in the round-4 walk because the walker never presses submit buttons.

## Builder scope
1. `src/app/app/sys/[id]/hr/payroll/page.tsx:76–133` — no function-valued local captured by the seven inline actions (e.g. compute the redirect URL inline / pass only strings, or move the helper to module scope taking `id, period, runSel` as arguments). Behaviour: every run button performs its action and lands on `?period=…&run=…&r2=<code>#hr-run2` with the flash, as today's `back2`. Every hunk `HR VIS-5a … ◂`.
2. `src/app/app/sys/[id]/hr/attendance/page.tsx:86–107` — same for `msgOf`/`corrBack` in `onRequestMine/onRequestFor/onDecide/onCancel` (`msgOf` uses only module data → module scope; `corrBack` → string values). Added to `ALLOW_SRC` here (ORACLE-EDIT r4), every hunk `HR VIS-5a … ◂`.
3. B1 (`payroll-run-ui.tsx`, drawer layout ≈ :300–:395 table frame `overflow-hidden` :156): with `?emp=` open, status column + totals cell fully inside the table frame at 1280 / 1366 / 1440 / 1536, th and en. Judged by the walker (FIT-CLIP), not by qc.
4. B2 (`payroll-run-ui.tsx:462` + the page's prop): `hr-run2-ytd-link` only when the viewer has the ytd view (page already computes `navOn.ytd = filingOk`); others keep the review line as plain text, no link to `?view=ytd`.

## Walker (scripts/walk-hr.mts + matrix) — what changed
- **PAGE-CRASH** (FAIL): Next error page text (`This page couldn't load` / `A server error occurred` / `Application error …` / `Internal Server Error`) on load or after any click; names the control actually under the click point (`elementFromPoint`) plus the inventory id, and whether a request had left.
- **Press probe** (`state.pressProbe`, off with `--no-press`): presses the listed submit buttons one by one, 1440/1024 th only, every POST still aborted at the network. Crash with no request = FAIL PAGE-CRASH (this defect); crash after a blocked request = WARN BLOCKED-BY-WALKER; neither = WARN PRESS-PROBE (inconclusive, e.g. required fields). Native dialogs are dismissed. Probes: 11a (approve · rebuild · sync · branch-*), x1 (pay · reverse), x3 (create · sync).
- **Hidden controls**: before a click the walker opens any closed `<details>` around the element via its `<summary>`, scrolls it to centre and clicks only if `elementFromPoint` is the element (else WARN CLICK-OBSCURED, not pressed). Fixes the 5 × CLICK-ERROR on `hr-run2-ytd-link` (was clicking the hidden link's stale box, which hit `ยืนยันชั่วโมง สาขา`).
- **FIT-CLIP** (`state.fit`): every visible `th/td` of `[data-testid="hr-run2-table"]` inside the frame's box, table scrollWidth ≤ frame width, totals cells not text-clipped. On `11d-payroll-drawer` (1440 th + en) and new `11d-payroll-drawer-widths` (1280x800 · 1366x768 · 1536x864, th). New sizes carry `extra: true` (not in the default size set; sheets use the state's sizes).
- `--dry` also validates state sizes and that fit/pressProbe ids exist in the inventory.

## Verified / not executed
- Typecheck (iso.sh, 14000M): exit 0. `walk-hr.mts --dry`: errors 0, totalShots 727 (extraShots 145 = +3 drawer-width cells), Chromium ok.
- `crashOf` / `reveal` / `fitOf` executed in Chromium against a static control page (scratchpad `a1/ctl.mts`): B1-shaped table 667 > frame 500 → FIT-CLIP lists สุทธิ/สถานะ cells + clipped totals text; widened frame → none. Closed-details link: puppeteer returned a box (x 0, y 115) before reveal — the mechanism the review saw — reveal opened 1 details, hit = the link itself; covered link → `self:false, hit: other "ยืนยันชั่วโมง สาขา"`. Crash text detected / absent correctly.
- **NOT executed:** the walker against a built server (no server in this lane). Unknown until the controller walks: whether the press probe on the fixed build shows "request built (blocked)" for every probe (pay may report PRESS-PROBE inconclusive if its PayFields are required), and the exact FIT-CLIP numbers per width. Expected on today's build: PAGE-CRASH on every probe, FIT-CLIP at 1280/1366/1536 th and 1440 en.
- A1's "render" leg (assert no "Functions cannot be passed" in the rendered log): **not feasible in this harness** — it renders with `renderToStaticMarkup`, which never runs React flight / `encryptActionBoundArgs`, so the error cannot occur there and an assertion would be vacuously green. A2 (the real Next transform) stands in; the live proof is the walker press probe + server log at the controller walk.

## Ambiguous / for the controller
1. Attendance page added to `ALLOW_SRC` (r4 ruling "fix all of them"). Other suites that freeze or mark-check `attendance/page.tsx` (e.g. H2.6 / PRIV-2 S5 style statics) may need their own VIS-5a acceptance — builder to run the picker and report.
2. Y1 pins "plain text" (the existing review line) for the branch payroll viewer; if the design wants a different hint, the check only forbids the link, so any text passes.
3. The press probe presses real submit buttons (POST blocked). The walker header's "never submit" rule is amended in the file header; say if you want it opt-in instead (`--no-press` exists).
4. `qc-hr-vis-5a` B1/B2 ids are pre-existing (13b report checks); the r4 B1/B2 findings map to the walker FIT-CLIP and to Y1.

## r4b — cross-ticket statics after the build (head f38ce5095 → this commit) · controller: press probe stays ON · Y1 plain text accepted
Base for all four = merge-base(HEAD, session/hr) a49f81829. Every VIS-5a hunk was listed (`scratchpad a2/hunks.mts`): all src hunks carry `HR VIS-5a … ◂` (payroll/page 24/24 · attendance/page 6/6 · payroll-run-ui 25/25 · payroll-ui 25/25 · reports-ui 6/6 · pay-run-view + period-label new, marker line 1); the older oracles VIS-5a edited carry `ORACLE-EDIT (HR VIS-5a · controller)` on every hunk (h3.6 2/2 · h3.9 1/1 · h4.3-lib 2/2 · priv-2 3/3 · priv-3 3/3); walk tools `HR VIS-5a … ◂` (walk-hr 17/17 · seed-hr-walk 2/2); JSON files have no comment syntax — messages th/en change 77/78 leaf keys, all under `hr.run2.*` (68/69) and `hr.payview.*` (9); inventory + matrix are already accepted by name in leave-3 (`P3_DATA`). No unmarked code hunk, no behaviour change, no stale pin found ⇒ narrow acceptances added (explicit files, every hunk marked; JSON by changed key path).
- **(a) qc-hr-priv-2 S5** — cause: `outside=src/app/app/sys/[id]/hr/attendance/page.tsx`; `VIS5A_SRC` (priv-2:149) did not list the r4 A1 file. Action: + attendance page to `VIS5A_SRC` (rule unchanged: every hunk `HR VIS-5a` + `◂`). Also + leave-3/preprod-1 to `VIS5A_ORACLES` (S4), because this round edits them.
- **(b) qc-hr-leave-3 ST3** — cause: ST3 wants `HR LEAVE-3` on every src hunk vs the base; it lists every VIS-5a src hunk (output truncated at 8, so the attendance hunks showed first — payroll/page.tsx, payroll-run-ui, payroll-ui, reports-ui, the two new files and messages were red already before r4). Action: `v5Ok` (V5_SRC: the 7 VIS-5a product files, every hunk `HR VIS-5a` + `◂`; messages only when every changed key is `hr.run2.*`/`hr.payview.*`).
- **(c) qc-hr-leave-3 ST2** — cause: outside = the older oracles VIS-5a edited (h3.6, h3.9, h4.3-lib, priv-2, priv-3), VIS-5a's own oracles, walk-hr/seed-hr-walk, messages; frozen (LEAVE-3's `payroll[^/]*`) = payroll-run-ui.tsx, payroll-ui.tsx — all VIS-5a, all marked. Action: same `v5Ok` in the outside and frozen filters (V5_OR: those oracles + preprod-1, every hunk `ORACLE-EDIT (HR VIS-5a · controller)`; tools by `HR VIS-5a … ◂`).
- **(d) qc-hr-preprod-1 PP1-ST2** — cause: PREPROD-1 freezes `reports[^/]*`; reports-ui.tsx has the 6 VIS-5a 13b display hunks (status label, engine column hidden, sticky net), all marked. Action: `v5St2` = exactly reports-ui.tsx, every hunk `HR VIS-5a` + `◂`.
- Knock-on: h4.3-lib S1.6 `VIS5A_ALLOW` + leave-3 · preprod-1 (both edited here). Every new hunk in the four oracle files carries `ORACLE-EDIT (HR VIS-5a · controller)` (vis-5a S2 green).
- **qc-hr-priv-3 S4 (expected red on the lane)** now also lists `scripts/qc-hr-leave-3.mts:oracle-edit unmarked` (this round's edit) beside the earlier VIS-5a entries (h3.6, h3.9, h4.3-lib, priv-2, seed-hr-walk, VIS-5a ledger files); preprod-1 is not listed. Not edited — priv-3 S4/S6 are the controller's known lane reds. S6 unchanged.

Runs (lane DB via qc-hr.sh, forced, residue none each): priv-2 47/47 · leave-3 53/53 · leave-3b 11/11 · preprod-1 57/57 · preprod-1b 25/25 · preprod-1c 16/16 · vis-5a 42/42 · h2.6 56/56 · h3.4 85/85 · h4.3 45/45 · priv-3 26/28 (S4, S6). typecheck exit 0. No suite failed on the re-seeded shop ids (hr-expected.json).
Not done: a negative control for the new acceptances (would need an unmarked src hunk — src edits are out of scope here); they reject by construction (every hunk must carry the marker / every key under hr.run2|hr.payview).

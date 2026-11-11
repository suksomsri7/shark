# HF-INV-1 round 3c — last small items from the 3b review (controller, 1 Oct 2026)

Round 3b was reviewed ACCEPT-WITH-NOTES (no CRITICAL/MAJOR). This round closes the small items so the branch can go to the owner. Keep every hunk minimal; nothing outside the list.

## Where / rules
- Tree `/root/projects/shark-hf5`, branch `hotfix/inventory-atomic`, start at 7e9d70fc. Machine rules: `/root/projects/shark-pos/ledger/pos-briefs/pos-brief-LANE-RULES.md` (QC4 only; never read `.env`; no schema change; no prisma generate/migrate; no pnpm install; no build/server; never touch `/root/projects/shark-crm*` or `shark-in-th`; never sweep `/tmp`).
- DB suites: `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/<file>.mts`. Typecheck ONCE at the very end: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck` (exit 0). Foreground only; report once when everything is finished.
- Method: oracle checks first (RED on 7e9d70fc → `ledger/wo-notes/HF-INV-1-red3c.txt`), fix, GREEN ×2, one control per fix (`-control3c.txt`). Notes: `ledger/wo-notes/HF-INV-1.md` section "Round 3c".
- Do not touch `member/**`, `account/gl.ts`, `account/service.ts`, `ai/**`, `core/csv.ts` (import from it only).

## C1 [MINOR, introduced by 3b] — clinic: a lost `dispenseJson` entry makes a later real dispense reuse a key and skip the cut
`clinic/service.ts:211-224`. Reviewer proof: `[X5] ∥ [Y3]` on one visit ⇒ record keeps 1 of 2 (read-modify-write lost update, pre-existing) ⇒ a later real `[Y3]` returns ok and cuts nothing. Fix the lost update: append to `dispenseJson` atomically in ONE SQL statement (`UPDATE … SET "dispenseJson" = COALESCE("dispenseJson",'[]'::jsonb) || $1::jsonb WHERE id = … AND "tenantId" = …` through the tenant-safe client used in this module; check the column type and how `tenantDb` exposes raw statements — if no tenant-safe raw path exists, use a short transaction with `SELECT … FOR NO KEY UPDATE` on the visit row + re-read + update). After the fix: `[X5] ∥ [Y3]` records both, a later `[Y3]` cuts. Accepted and to be stated in the notes: two truly simultaneous dispenses of the SAME drug and quantity still cut once (indistinguishable from a double click; a form request id is a later work order), and a multi-line retry that drops an already-cut drug leaves that cut unrecorded.
Oracle (atomic AT-22.x): the two reviewer cases above; 5 concurrent single-drug dispenses of 5 different drugs ⇒ 5 entries, 5 cuts; refund restores all.

## C2 [MINOR, pre-existing, security] — report CSV must neutralise spreadsheet formulas
`reports/service.ts:327-331` `toCsv` has its own `esc`; `exportMembers` uses `csvRow`/`neutralizeFormula` from `core/csv.ts`. A member name from public signup such as `=HYPERLINK(...)` or a phone `+66…` reaches the owner's spreadsheet live. Use the core helper for every cell (headers too). Oracle: cells starting with `=`, `+`, `-`, `@`, tab, CR come out neutralised exactly as `exportMembers` writes them; numbers in numeric columns stay numbers (do not prefix a negative amount in a numeric column if the core helper has a numeric path — follow the helper's own rule and say what it does).

## C3 [MINOR, pre-existing, privacy] — saved reports list leaks other people's filter values
`reports/actions.ts:108-114` `listReportsAction` returns every saved report's config to anyone with `reports.report.run` (proved: STAFF with no member key read the owner's saved filter `0811111111`). Rule: a saved report is listed for an actor only if that actor could RUN it right now — dataset readable (`readScope`) and it uses no field that is masked for the actor (filters, groupBy, metric). Same rule for any get-by-id/run-saved/delete/rename action in the file (an actor must not load or run a saved config they could not have typed themselves; deleting: keep today's permission but do not return the config). Oracle: matrix of 4 actors × saved reports on each dataset + one with a phone filter.

## C4 [NOTE→fix, pre-existing] — refusals must reach the user in production
Thrown `Error`s from server actions are replaced by Next's generic message in production builds, so every Thai refusal added in rounds 3–3b ("ไม่มีสิทธิ์ดูข้อมูลสมาชิก…", masked-field refusals, malformed filters) shows as a generic error. For the run / CSV / groupBy / saved-report actions in `reports/actions.ts`: return the refusal as data. Smallest change that keeps existing callers compiling: add an optional `error?: string` on the result the screen already receives (and for CSV return a discriminated result or keep the string and add a sibling action — choose the smaller diff), and make `ReportBuilder.tsx` (~:103-106) show `error` where it shows the caught message today. Only expected refusals (permission, validation, masked field) become data; unexpected errors still throw. `"use server"` files export only async functions (no type exports).
Also `PoReceiveForm`/`receivePoAction`: a failure before the action's `try` (tenant/permission/ctx) must come back as `{status, message}` too, not reach the route error boundary.
Also `reports/service.ts:248-250, :188-189`: non-string `metric` and a filter with no `op` ⇒ Thai validation text (no `undefined`, no `TypeError`).
Oracle: each refusal path returns data with the Thai text (call the actions' inner functions the way the existing oracle does; add a static check that the screen reads `.error`).

## C5 — oracle strength (no product change)
`scripts/qc-hf-reports-authz.mts` RP-5 fixture: add a member whose only activity at u1 is a `clinic` visit (must NOT be visible to a u1-limited actor today — mirrors the member module), a CLOSED and a SUSPENDED member, and a STAFF actor with `unitAccess: []`; the drift comparison with `listMembers`/`exportMembers` must include them.

## C6 — notes
Add to "who loses behaviour": branch-limited users lose members with no home branch in the customers report; the clinic statements from C1. Add to "NOT covered": member list search `q` matches raw phone digits for any member reader and the member 360 page shows the full phone (member module, stricter rule in reports is intentional); customers report CSV writes no audit log.

## Finish
Regression (before 7e9d70fc / after): `qc-hf-inventory-atomic`, `qc-hf-inventory-authz`, `qc-hf-reports-authz`, `qc-clinic`, `qc-clinic-refund`, `qc-clinic-public`, `qc-report-builder`, `qc-procurement`, `qc-member-public`, `qc-member-tier`. Fitness 33/33 both modes. Typecheck exit 0. One commit (Thai subject, usual Co-Authored-By line; `--no-verify` allowed after running fitness through iso.sh because the hook path points into a tree you may not touch), push `hotfix/inventory-atomic`; never push main.
Report (English, compact): head sha + oracle totals first; per item file:line; RED/GREEN/control; regression; who loses behaviour; NOT covered; CONTROLLER-RUN owed; decisions for the controller.

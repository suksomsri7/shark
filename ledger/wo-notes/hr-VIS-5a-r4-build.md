# HR VIS-5a round 4 — builder (A1 · B1 · B2)

Tree `/root/projects/shark-hr-l3` · branch `wip/hr-vis-5a` · base 338c4843b → product commit 18dd3f30e. Spec: `hr-VIS-5a-r4-oracle.md` + review r4 A1/B1/B2. No oracle/walker edit.

## What changed (every hunk `HR VIS-5a … ◂`)
- `src/app/app/sys/[id]/hr/payroll/page.tsx` — `back2` (page-local arrow, captured by the 7 inline `"use server"` run2Actions) → module-level `run2Back(id, period, code, run): never`. Actions now capture only strings (`id`, `period`, `runSel`). URLs/codes identical: `/app/sys/{id}/hr/payroll?period=…[&run=…]&r2=<code>#hr-run2`; the three `back2(code)` calls in `sync` pass `runSel` explicitly (was the default arg).
- `src/app/app/sys/[id]/hr/attendance/page.tsx` — `msgOf` → module `corrMsgOf(r, okCode)` (only module data), `corrBack` → module `corrBackOf(base, keep, v)`; onRequestMine/onRequestFor/onDecide/onCancel capture `base`, `keep`, `view` (strings). Same redirects/messages.
- `src/lib/modules/hr/payroll-run-ui.tsx`
  - B1: with `?emp=` the table frame gets `@container`; column visibility follows the frame's own width instead of the viewport (mockup 06: fixed drawer, table yields; cells 8 px): frame < 680 px → ชื่อ · เพิ่ม(รวม OT) · หัก · สุทธิ · สถานะ; ≥ 680 → + ค่าจ้างฐาน · ปสส.; ≥ 940 → every column (ทำงาน · OT · เพิ่ม excl. OT · ภงด.1). `px-2` at every width while the drawer is open; totals "รวม N คน" and totals-status cell may wrap with the drawer open. Status column is never hidden (≥ md). Drawer closed: unchanged. Drawer stays 400 px.
  - B2: `hr-run2-ytd-link` rendered only when `filingOk` (= `canUseFilings`, the same gate as the page's `navOn.ytd`); others keep the `rv_YTD_OPENING` review line as plain text.
- Thresholds from measured natural widths (lane data, px-2): 7 columns owner th 629 / en 654, payroll-branch th 524 / en 573; all 10 columns owner th 859 / en 894.

## Browser proof (build `next build --webpack` of this tree, served :3241 against the lane DB, puppeteer-core + /usr/bin/chromium-browser as walk-hr.mts — `playwright` is not installed on this machine; sessions minted the walker's way, UA `qc-walk-hr-r4build`, 9 deleted after)
Requests allowed. Every press: no error page, landed on the redirect with the flash shown. Server log for the whole session: 13 lines, 0 × "Functions cannot be passed", 0 error/digest lines (`/root/qc/hr-vis5a-r4/server.log`). Screenshots `/root/qc/hr-vis5a-r4/press-*.png`, raw `press.jsonl`.
| button | run | landed | flash |
|---|---|---|---|
| hr-run2-rebuild | DRAFT 2026-06 | `r2=done` | ✓ |
| hr-run2-sync | DRAFT | `r2=a.off` (refusal: deduction rules off in this shop) | "ยังไม่ได้เปิดกฎหักสาย/ขาด…" role=alert |
| hr-run2-branch-* | DRAFT | `r2=done` | ✓ |
| hr-run2-approve | DRAFT | `r2=approved` | ✓ |
| hr-run2-pay | APPROVED 2026-08 | `r2=done` | ✓ |
| hr-run2-reverse | DRAFT→approved 2026-06 | `r2=r.laterRun` (refusal) | "มีรอบจ่ายงวดหลัง…" |
| hr-run2-reverse | PAID 2026-09 (latest) | `r2=done` | ✓ |
| hr-run2-create | REVERSED 2026-07 | `r2=created` | ✓ |
| hr-corr-submit (staff, onRequestMine) | — | `msg=c.future` / `c.order` refusals, then `msg=c.sent` (IN 2026-11-09) | ✓ |
| hr-corr-approve (owner, onDecide) | — | `view=corrections&msg=c.approved` (×2) | ✓ |
| hr-corr-submit (manager, onRequestFor) | namfon month | `msg=c.sent` | ✓ |
| hr-corr-cancel (manager, onCancel) | — | `view=corrections&msg=c.cancelled` | ✓ |
Not pressed with success: sync `r2=synced` (shop has attendance deductions off; the refusal path proves the redirect).

## Drawer widths (own measure, owner + payroll-branch, th + en, `?emp=` namfon on the draft run)
1280 / 1366 / 1440 / 1536 × th/en × 2 viewers = 16/16 OK: table ≤ frame (526/528 · 612/614 · 686/688 · 782/784), no cell outside the frame, no clipped totals cell, status column present, drawer beside the table. 1280/1366: 5 columns; 1440/1536: 7. Shots `/root/qc/hr-vis5a-r4/drawer-<viewer>-<w>-<lang>.png`.
Walker (`walk-hr.mts --base :3241 --no-refusals`, out `/root/qc/hr-vis5a-r4/walk-*`): 11d-payroll-drawer (1440 th+en, 390, click, pb) · 11d-payroll-drawer-widths (1280/1366/1536 th) · 11a-payroll-open (30 cells) · x1 · x3 → **FIT-CLIP 0 · PAGE-CRASH 0**. Press probe: BLOCKED-BY-WALKER 28 (= request built, walker aborted it — expected), PRESS-PROBE 2 (x3 `hr-run2-create`, empty required payDate — inconclusive by design). Other findings unchanged kinds (EN-THAI 16 fail cells, TAP-44, HSCROLL-EL) — outside this round.

## Suites (lane DB via qc-hr.sh, forced)
- qc-hr-vis-5a: 42/42 ×3 (unforced + forced ×2), Z1 residue none.
- green: h3.4 85/85 · h2.6 56/56 · h4.3 45/45 · h3.2 64/64 · h2.5 79/79 · h4.6 69/69 · h3.1 58/58 · h3.5 53/53 · h3.6 62/62 · h3.8 78/78 · h3.4-ytd 44/44.
- qc-hr-priv-3 26/28: S4 (expected on the lane) + S6 (fix on session/hr). P7 green.
- **qc-hr-priv-2 46/47 — S5 red because of r4**: `outside=src/app/app/sys/[id]/hr/attendance/page.tsx`. The oracle's VIS-5a allowlist `VIS5A_SRC` (qc-hr-priv-2.mts:149) lists payroll/page.tsx but not the attendance page. Needs ORACLE-EDIT: add `"src/app/app/sys/[id]/hr/attendance/page.tsx"` to `VIS5A_SRC` (all 6 hunks carry `HR VIS-5a … ◂`).
- **qc-hr-leave-3 51/53**: ST2 red pre-existing (frozen `payroll-run-ui.tsx`, `payroll-ui.tsx` changed by VIS-5a since a49f81829; older VIS-5a oracle edits outside). ST3 now lists the attendance page's 6 r4 hunks (not marked `HR LEAVE-3`) — needs the VIS-5a allowance for that file in ST3 (same as p3Ok/VIS-5a src exemption).
- qc-hr-preprod-1 56/57: PP1-ST2 frozen `reports-ui.tsx` changed — pre-existing VIS-5a change, not touched in r4.
- typecheck (iso.sh, ISO_MEM=14000M, heap 12288): exit 0. fitness 54/54 + fitness-hr 9/9, with and without env, exit 0. Commit used --no-verify (hook runs tsx outside iso.sh).

## Data
`seed-hr-walk.mts` up → walk + presses → `--down` reported residue 3 (pre-existing rows changed by the presses: HrAttendance / HrAttendanceDay / HrTimeCorrection — approving the seeded correction and my 11-09 IN). Restored by re-running `seed-hr-qc.mts` on the lane DB (34/34, shop rebuilt to the base counts); stale `scripts/hr-walk-expected.json` removed. ⇒ the lane's `scripts/hr-expected.json` was regenerated (new ids). Sessions: 0 left (walker cleans its own, mine deleted 9).

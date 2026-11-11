# WO H2.2 — Roster board UI (week grid · DnD + keyboard + tap · 3 shift kinds · unpublished bar · rule panel · branch chips) + H2.1 counter debts D-R3w/c/a/m

> RUN "HR V2" · worktree `/root/projects/shark-hr` · branch `wip/hr-h2.2` cut from `bd48a23b2` (session/hr 02f41f34f + origin/main + H2.2 oracle + `scripts/qc-hr-lib.mts`) · 11 Nov 2026 · builder: Claude (Opus)
> Brief `ledger/hr-briefs/hr-brief-H2.2.md` (R1–R17 · §10 rulings) + controller delta (D-R3*, roster.ts marked hunks) · oracle `scripts/qc-hr-h2.2.mts` (59 checks · **not edited**) · notes of the oracle `hr-H2.2-oracle.md` (rulings 1–8)
> DB: QC4 only, every DB command `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 [QC_FORCE=1] pnpm exec tsx scripts/<suite>.mts` · base check `git merge-base --is-ancestor afcb9bc3 HEAD` ok

## 0. Checkpoint
- done: step 0 (base: `passed 6/59 (QC_FORCE)` · BASE-EXPECTATION 59/59 · RESIDUE none · exit 1) · engine hunks · shared/board/actions · page + client · nav · messages · tokens · inventory · F16.8 · visual SPECS 2.2 · HQC.roster seed · NM-3 two-way · first forced oracle run 59/59 · 4 commits (f06bad473 · cfe851adb · de6cb9d4d · d796c2f0e)
- next: controller run (visual, reviewer) — builder work complete
- runner (all regressions, one log per suite): scratchpad `runall.sh` → `logs/<suite>.txt` + `summary.txt` (copied into §5)

## 1. Files touched (⊆ brief R1 + controller delta)
| file | new/edited | what |
|---|---|---|
| `src/lib/modules/hr/roster.ts` | edited — **only hunks marked `// HR H2.2 ▸ … ◂`** (7 hunks, all marked — checked with `git diff -U0`) | D-R3w/c/a/m (see §2) |
| `src/lib/modules/hr/roster-board-shared.ts` | new | DTO types · `ROSTER_MSG` (16 codes, th = engine text byte-exact) · `ROSTER_MSG_CODE_OF` · `mondayOf/weekLabel/rangeLabel/rosterTitle/dayLabel` · `shiftKind/shiftLabel/timeRange/hhmm/minOf` · reducer `applyOp/rollback/confirmOp(=confirm)/canDrop/keyTarget` — `import type` only, no clock, no Intl |
| `src/lib/modules/hr/roster-board.ts` | new | `loadRosterBoard` · `rosterLeaveOverlay` · `rosterOpCore` · `canReadRoster` · `rosterRuleLabel` |
| `src/lib/modules/hr/roster-actions.ts` | new | `"use server"` — 6 async wrappers → `requireTenant` → `rosterOpCore` → `revalidatePath` on ok |
| `src/lib/modules/hr/roster-ui.tsx` | new | `"use client"` board (grid ≥768 px · day view <768 px · sheets · pointer DnD · Shift+arrows) |
| `src/app/app/sys/[id]/hr/roster/page.tsx` | new | HR-system lookup → `hrViewerOf` + `hrScopeOf` (F16.3) → `loadRosterBoard` (null ⇒ `notFound()`) · `todayKey` from the server |
| `src/app/app/layout.tsx` | +1 marked line | HR case: `ตารางกะ` after `ลงเวลา` |
| `src/lib/modules/hr/ui.tsx` | +2 marked lines | `hrTabs`: `ตารางกะ` after `ลงเวลา` · `ตั้งค่า` (D9 ruling) |
| `src/messages/{th,en}/common.json` | one hunk each | `hr.roster.*` (incl. `msg.<16 codes>`, `dow.*`, `month.*`) |
| `src/app/globals.css` | one marked block | `--color-shift-1…12` (ruling) |
| `scripts/hr-ui-inventory.json` | +38 rows (append only) | `/hr/roster` rows, wo H2.2, oracle qc-hr-h2.2 |
| `scripts/fitness-hr.mts` | marked section | **F16.8** inventory ↔ testid both ways (Q15 ruling numbering) · baselines = today's gaps (1 code id + 6 rows, all pre-existing) |
| `scripts/visual-hr.mts` | marked | `PageSpec.expect?` (mismatch ⇒ ❌) · `Ids` + `huahin/suanphueng/rosterWeek` · `SPECS["2.2"]` (4 specs) |
| `scripts/hr-qc-env.mts` + `scripts/seed-hr-qc.mts` | marked | `HQC.roster` (Q14) + seed §9d `RS1` + `expected.roster` |
| `scripts/qc-hr-roster.mts` | NM-3 marked | two-directional per the §10 ruling (not my oracle) |

## 2. Engine debts (roster.ts — reviewer-verified items marked ★)
- **D-R3w** (S4.9): `publishRoster` takes `anchorAt = new Date()` **before** the candidate `findMany`; every publish mark carries `after.anchorAt`. The counter treats a mark's time as `anchorAt` (legacy marks without it: `createdAt`). A removal that lands between candidate read and mark write has `createdAt > anchorAt` ⇒ not cleared.
- **D-R3c** (S4.10): `removedSinceLastPublish` is one SQL statement (`$queryRaw` on `tenantDb`, explicit `tenantId`) — removal audits of the system with `wasPublished=true` and `date ∈ [from,to]` for which **NOT EXISTS** a publish mark of the same system with mark-time ≥ removal time, `from ≤ date ≤ to`, and unit coverage (`after.unitId` string ⇒ that unit · `after.scopeUnits` array ⇒ contains the row unit · neither ⇒ all). No 500-mark cap; `floor` shortcut removed (was the cap's companion). Viewer scope + selected unit still filtered in JS with the old `entryInScope`. Date strings compared `COLLATE "C"`; anchor cast `::timestamptz AT TIME ZONE 'UTC'` vs `timestamp(3)` `createdAt` (UTC); anchor only trusted when it matches `^[0-9]{4}-[0-9]{2}-[0-9]{2}T`.
- ★ **D-R3a**: the publish mark is `tx.auditLog.create(...)` inside the publish `$transaction` after `emitOutbox` (same tx client) — a failed insert throws ⇒ rows/event roll back ⇒ `failed` (never "ok + stuck counter"). The post-commit `audit(...)` call is gone (replaced by a marker comment line).
- ★ **D-R3m**: the zero-candidate marker writes the same `anchorAt` (taken before the candidate read, i.e. before the pre-count). It still uses `writeAudit` (no tx exists on that path; a lost marker only leaves the counter where it was, nothing was published).

## 3. Contract notes (where I chose something the brief left open)
- Default branch (Q2): all-branch viewer ⇒ `all` when the tenant has ≥ 2 units; restricted with several units ⇒ `all` (= its units only); one unit ⇒ that unit, no chips. Unit outside scope / garbage ⇒ default silently.
- Rows: active non-ENDED employees employed on ≥ 1 day of the week and in view on that day (home unit or a borrowing overlapping the week) ∪ owners of shown entries (ENDED rows `ended:true`, read-only). Sort: home-in-view first, then borrowed-in, each by `createdAt`, `id`.
- Cell precedence (oracle ruling 9): `past` > `work` (has entries) > `off` (in view + employed) > `out`. `cell.unit` = unit of the day only on work/off cells (picker filter; never a foreign unit id). Leave shows only on non-`out` cells (or under chips).
- Codes: engine texts outside the 14 mapped (entryNotFound · entryChanged · employeeNotFound · range · rangeOrder · date · note · tooMany) ⇒ `failed` (brief list kept as-is — see §8 Q-1).
- `rosterOpCore` also runs `assertCan(hr.employee.create)` before the system lookup (fitness F6.1 needs a proven guard in the action file's import; same key the engine checks) ⇒ non-writers get `noPerm` even for a bogus systemId.
- `canDrop` additionally refuses drops onto ENDED rows (UI only; engine would refuse anyway).
- Header is a page-local `<h1 data-testid="hr-roster-title">` with PageHeader's classes (PageHeader has no testid prop).
- ConfirmDialog has no `disabled`; disabled states render a plain disabled `.btn` with the same testid; dialogs are re-keyed after each action so they close.

## 4. Self-check (COMMON §F)
- [x] 1 nav: `ตารางกะ` in layout HR case + `hrTabs` (after `ลงเวลา`), page exists · `?msg=` not used (results are in-page codes from the allowlist)
- [x] 2 tx client only: the only new tx statement is `tx.auditLog.create` inside `publishRoster`'s tx; `roster-board.ts` opens no tx
- [x] 3 scope `[]` = all branches (oracle S1.2/S1.4 mgr-[]); explicit list refused without leaking ids (S1.5, S2.5, X2.1)
- [x] 4 no dev text: results are codes; th texts = engine constants; thrown ⇒ `failed` (S2.3)
- [x] 5 tx options: unchanged (no new options; publish tx gained one insert)
- [x] 6 no migration (N-A)
- [x] 7 no privileged link/PIN path (N-A)
- [x] 8 no rate limit added (N-A)
- [x] 9 no new event (publish reuses `hr.roster.published` inside the engine)
- [x] 10 files ⊆ brief R1 + controller delta (roster.ts marked hunks, NM-3 ruling, globals.css ruling); hot files only as marked hunks (layout/messages/inventory)

## 5. Results (builder run · full logs in `hr-H2.2-green.txt`)
- oracle unforced `passed 59/59` exit 0 · forced ×2 `passed 59/59 (QC_FORCE)` exit 0 · RESIDUE none ×3
- picker `# LEAN` · oracles picked qc-hr-h0.3 h0.5 h1.1 h2.1 h2.2 (h0.x/h1.x left to the controller) · qc-hr-h2.1 90/90 (QC_FORCE) exit 0
- always-set: qc-hr-attendance 31/31 · qc-hr 9/9 · qc-bulk-ops 13/13 · qc-nav-functions exit 1 = known BOOKING `/booking/calendar,/booking/day` only (HR 8/8 routes) · qc-hf-hr-privacy 194/194 · qc-hr-leave-booking 14/14 · qc-payroll 19/19 · qc-hr-payadjust 27/27 · qc-payroll-reverse 14/14 · qc-hr-roster 24/24 (NM-3 two-way) · qc-booking-hours-hr 13/13 · qc-calendar 9/9 · qc-approval 16/16 · qc-approval-wiring 7/7 · qc-approval-edit 12/12 · qc-crm-c3.3 90/90 · qc-crm-c0.3 88/88 · qc-ai-proposals 16/16 · qc-ai-tools 18/18 · qc-chat-staff-perms 49/49 · qc-account-cpa 107/107
- seed-hr-qc 29/29 (RS1: week 2026-11-16 · 48 shifts · 1 publish/event · 3 unpublished) — run ×1 only (×2 identity not checked)
- fitness 53/53 + fitness-hr 9/9 without env and with env (F16.8 green)
- typecheck (12288/14000M) exit 0 · 0 errors

## 6. Screenshot guide (CONTROLLER-RUN · port of the HR lane e.g. 3226 · run `seed-hr-qc` first — it now writes `HQC.roster`)
- `pnpm exec tsx scripts/visual-hr.mts 2.2 --base http://127.0.0.1:3226 --user <u>` for u = owner · manager · manager-branch · staff · payroll · payrollSelf · kiosk · member (expect statuses are in SPECS: readers 200, others 404).
- URLs: `/app/sys/<HR>/hr/roster?week=<rosterWeek>&unit=<huahin>` (main) · `…&unit=all` · `?week=<rosterWeek+28>&unit=<huahin>` (empty week) · `/app/sys/<HR>/hr/roster` (404 users). `rosterWeek` = next Bangkok Monday from `scripts/hr-expected.json` `roster.week`.
- States worth capturing at 1440×900 / 1024×768 / 390×844: default board (bar `ยังไม่เผยแพร่ (แก้ 3 จุด)`, accent dots on น้ำฝน ส./นัท ส./พี่เก่ง อา., มิ้นท์ row tinted + `56 / เกิน 48`, เจ `ยืมตัว` with 14–20 / 12–18 chips, มิ้นท์ pending leave if it falls in the week) · rule panel with MAX_WEEK/DAY_OFF clicked (`data-highlight`) · picker sheet (tap an `หยุด` cell) · entry sheet (tap a chip) · publish confirm sheet (`hr-roster-publish-confirm-trigger`) · result message after publish (`เผยแพร่แล้ว n กะ`, bar → `เผยแพร่แล้ว`) · 390 day view with day tabs · English once (owner 1440, locale cookie) · manager-branch (no chips, static `สาขาหัวหิน`).
- Parity exceptions vs mockup 03 (declared, Q10/Q13/D10): demand badges `5/6` + hourly demand chart (H4) · swap-request card (H2.3) · AI card (H4) · money footer `ค่าแรงรวม…/labor %` (H3/H4) · subtitle `· รายวัน` (payType is payroll-only) · กิ๊ฟ row → พี่เก่ง row (HQC has no กิ๊ฟ) · เจ Mon–Thu show `หยุด` not `—` (HQC borrowing is open-ended) · header shows `n คน` per day instead of `จัด/ต้องการ` · mid-drag ghost/`วางที่นี่` not screenshot-able (static markup only).

## 7. Debts
D1–D11 as in the brief §8 (D9 fixed here: `hrTabs` has `ตั้งค่า`). New:
- D12 codes for `entryNotFound/entryChanged/employeeNotFound/range` fall into `failed` (generic text) — a wider allowlist is a later decision.
- D13 F16.8 baselines: code id `hr-link-sales-teams` (CRM C3.6 link, no row) · rows `hr-leave-cancel-*`(+trigger/sheet) live on `/app/approvals` (outside the F16.8 roots) · `hr-settings-{shift,policy,holiday}-unit` come through a helper argument the scanner cannot follow.
- D14 `visual-hr` still prints ⚠️ (not ✅) for an expected 404 — pass/fail is correct, only the icon.
- D15 touch DnD on 1024: chips are `touch-action:none` while editable (long-press drag) — scrolling the grid must start outside a chip.

## 8. Questions / decisions for the controller
- Q-1 widen the code allowlist with `entryNotFound`, `entryChanged`, `employeeNotFound`, `range`? (default: no — brief list)
- Q-2 seed §9d changes HQC counts (HrRosterEntry + n, OutboxEvent +1, AuditLog +n). Any suite that pins HQC counts must accept the new expected.json (`seed-hr-qc` itself compares run×2 only).

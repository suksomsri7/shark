# WO H2.7 + H2.8 — leave policies · quota ledger · half-day/hourly · attachments · carry/expire job · hr.leave.decided · Thai holiday preset · day class

> Lane 3 · worktree `/root/projects/shark-hr-l3` · branch `wip/hr-h2.7` (head 3b603781e = session/hr + brief + oracle) · builder 11 Nov 2026
> Brief `ledger/hr-briefs/hr-brief-H2.7.md` (DRAFT lifted by controller rulings Q1–Q18 + additions) · oracle `scripts/qc-hr-h2.7.mts` (68 checks · **not edited**)
> DB: lane QC branch via `scripts/qc-hr.sh` only · no migration (Q1) · `prisma/` untouched

## 0. Checkpoint
- done: leave-rules · holidays + JSON 2569/2570 · leave.ts engine · service.ts hunks (request/decide/cancel) · chain effect · consumer · label · cron job · index re-exports · actions (attach/link) · settings action (preset) + allowHours removed from the form reader · leave form fields + my-balance table · settings policy fields + preset button + movable-holiday note · th/en messages · inventory rows · merge of session/hr @1d17382f8 (H2.2) · final verification (see `hr-H2.7-green.txt`)
- next: controller — rulings below (ORACLE-EDIT ×2 on qc-hr-h1.2 · seed RS2 conflict · HQ23) · visual run (§7) · review/hunt (balance races + reason/attachment privacy)

## 1. Commands (all through the lane wrapper)
- DB: `bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 [QC_FORCE=1] pnpm exec tsx scripts/<suite>.mts`
- fitness no env: `bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL pnpm exec tsx scripts/<f>.mts` · with env: `bash scripts/iso.sh bash scripts/qc-hr.sh pnpm exec tsx scripts/<f>.mts`
- typecheck: `env NODE_OPTIONS=--max-old-space-size=12288 ISO_MEM=14000M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck`
- step 0 (base, forced): `passed 7/68 · BASE-EXPECTATION 68/68 as registered (RED-by-design 61 · GREEN controls 7) · RESIDUE none` (exit 1 = RED as designed)
- seed-hr-qc before merge: `ผ่าน 28/28` · after merging H2.2 seed: `ผ่าน 28/29` — X0 stops at RS2 (see §5 ruling R-2)
- final run (after merge of session/hr @1d17382f8 · H2.2): oracle 68/68 ×3 (unforced exit 0 · forced exit 0 ×2 · RESIDUE none) · qc-hf-hr-privacy 194/194 · qc-hr-h0.7 74/74 · **qc-hr-h1.2 70/73** (S5.7 · S6.4 = ORACLE-EDIT R-1a/b · S7.4 = seed R-2/H2.2 roster rows) · qc-hr-h2.1 90/90 · qc-hr-h2.3 79/79 · qc-hr-leave-booking 14/14 · qc-booking-hours-hr 13/13 · qc-hr-attendance 31/31 · qc-approval 16/16 · qc-approval-wiring 7/7 · qc-calendar 9/9 · qc-ai-tools 18/18 · qc-ai-proposals 16/16 · qc-nav-functions red only BOOKING S5 (known) · qc-kanban-k3.3 14/15 (S9.2 screenshots absent — pre-existing) · qc-hr 9/9 · fitness 53/53 ×2 · fitness-hr 9/9 ×2 · typecheck exit 0, 0 errors — full lines in `hr-H2.7-green.txt`
- merge conflicts: `scripts/hr-ui-inventory.json` only (both lanes appended rows) → kept H2.2 rows + 7 H2.7 rows; ui.tsx (hrTabs) and messages auto-merged; no new migration arrived. After the merge F16.8 (new, H2.2) flagged 9 H2.7 testids without rows → added (commit 6ca39a65c).

## 2. Files
| file | new/edited | hot (§D) |
|---|---|---|
| `src/lib/modules/hr/leave-rules.ts` | new — pure (leaveYearOf/Bounds · countLeaveDays · hourlyLeaveDays · grantDays · carryDays · expireDays · carryExpiryOf · LEAVE_TEXT 20) | |
| `src/lib/modules/hr/leave.ts` | new — plan/reserve (request) · ledger · locks · applyLeaveDecision · runLeaveYearJob · leaveDetail · leaveAttachmentLink · attachLeaveFile · leaveBalances · myLeaveBalances · activeLeavePolicies | |
| `src/lib/modules/hr/holidays.ts` + `holidays-th-2569.json` / `-2570.json` | new — holidayPreset · applyHolidayPreset · holidaysBetween · dayClassOf | |
| `src/lib/modules/hr/service.ts` | marked hunks: imports · RequestLeaveInput fields · requestLeave body · decideLeave (locks · balance · ledger · event) · cancelLeave (emp lock · revert + event) | S11.3 file |
| `src/lib/approval-effects.ts` | one marked block (HrLeave → `hr.applyLeaveDecision`) | yes |
| `src/lib/outbox-consumers.ts` · `src/lib/automation/labels.ts` | consumer `hr.leave.decided` = withAutomation no-op · one label `เมื่อตัดสินใบลา (HR)` (webhooks get it via spread) | yes |
| `src/app/api/cron/hourly/route.ts` | marked block — runLeaveYearJob per HR system, asOf = Bangkok today, 20 s budget, best-effort | S11.3 file |
| `src/lib/modules/hr/index.ts` | re-export applyLeaveDecision · runLeaveYearJob | |
| `src/lib/modules/hr/actions.ts` | requestLeaveAction passes policyId/halfDay/hours · new attachLeaveFileAction · leaveAttachmentLinkAction | |
| `src/lib/modules/hr/settings-actions.ts` | applyHolidayPresetAction · **allowHours no longer read from the form** (ruling Q1/Q6) | |
| `src/lib/modules/hr/ui.tsx` | leave form: `hr-leave-policy` · `hr-leave-halfday` · `hr-leave-hours` (only when an active policy allows hours — unreachable from UI) · `hr-leave-attach` note · pending meta (days · policy · balance +n pending · needs-document flag) · `hr-leave-balance` table (own) | |
| `src/app/app/sys/[id]/hr/settings/page.tsx` | not in the brief's list — needed for the preset button (`hr-holiday-preset`) + Q14 note line (th/en) + policy rule fields (no hourly toggle) | |
| `src/messages/{th,en}/common.json` | `hr.leave.*` (new) · `hr.settings.policies.*` · `hr.settings.holidays.preset*` · stubNote no longer promises the preset | yes |
| `scripts/hr-ui-inventory.json` | 7 rows (wo H2.7) | |

## 3. Decisions (builder)
1. **S11.3 "base + marked hunks"** forbids deleting base lines. requestLeave's two old paths (owner-auto create outside a tx; non-owner tx without the employee lock) are replaced by the marked block and kept **verbatim inside a block comment** opened/closed by marked lines (`/* HR H2.7 ▸ … ◂` … `HR H2.7 */`). In approval-effects.ts (max 1 block) the old `HrLeave` updateMany branch stays below the new block and is unreachable. Both are cleanup for the controller once S11.3 is retired.
2. Lock order (closes H2.3 debt): `hr-leave:<id>` → `hr-leave-emp:<sys>:<emp>` → roster keys `hr:roster:<sys>:<emp>:<day>` (all leave days, via `lockRosterKeysInTx`) in decideLeave and applyLeaveDecision · cancelLeave = hr-leave → emp · requestLeave / attach = emp (attach: hr-leave) · job = emp. Swap stays `hr-swap` → roster. Tx client only.
3. Legacy (Q18): no active policy with category = type ⇒ `days` stored, no ledger; validations (range/≤366 · half/hours · employment window · overlap · zero days) apply to every request. Cross-year + eligibility only with a policy.
4. Employment window = startDate ≤ from and to ≤ (endDate ?? contractEndAt) — same rule as roster.ts `inEmployment`.
5. Eligibility: grantDays + `from < effectiveDate ⇒ notEligible`. NO_START only when minServiceDays > 0 or prorata (vectors).
6. Job writes GRANT only once the effective date is reached; CARRY rows also when 0.0 and EXPIRE rows also when 0.0 (the key records "evaluated" → steady state = no tx per hour). Carry is computed from the ledger of Y−1 only (no lazy Y−1 grant — avoids free carry for years the shop never tracked).
7. used-until-expiry = −Σ(USE + `use-revert:` ADJUST) with effectiveDate ≤ expiry (revert rows carry the leave's fromDate).
8. leaveBalances shows the would-be GRANT when no GRANT row exists yet (display only; never written by a reader). Optional `at` (date) picks each policy's leave year (UI); `year` as in the brief.
9. Owner-auto leave: same checks incl. balance; event `previousStatus: null`.
10. Chain effect: verifies the ApprovalRequest status matches the decision (like applySwapDecision); systemId from the HrLeave row; audit `hr.leave.apply_refused {leaveId, requestId, code:"BALANCE"}` after commit; `hr.leave.decide` audit for applied decisions.
11. Q10: attach/link service + actions exist (attach an already-uploaded private ATTACHMENT FileAsset by id); **no upload control** — `hr-leave-attach` is the flag note. Used-file check is per HR system (tenantDb scope).
12. Q1/Q6 hourly: engine supports it; settings form/action no longer read `allowHours` (existing row values untouched); hours field only renders if some active policy already has allowHours (none can be set from the UI). No ORACLE-EDIT needed (the oracle sets it through the settings service).
13. Q14: JSON = the 15 dates of `crm/sequences-shared.ts` FIXED_THAI_HOLIDAYS (identical names), `status: PARTIAL`, `source` + `verified` note, `pending` lists มาฆบูชา · วิสาขบูชา · อาสาฬหบูชา · เข้าพรรษา · วันหยุดชดเชย · วันหยุดพิเศษ. Nothing computed.
14. Q5 stands (holidays always out even when shopOpen). The brief defines no settings slot ⇒ **HQ23** (consultant): should a policy/system be able to count "shop-open holidays" as leave days?
15. attachmentKey is written/read only in leave.ts (service.ts spreads `r.fields`).

## 4. Who gains / loses access
- Linked employee: sees own balance table (granted/used/left/+pending) on /hr/leave; can attach a private file to own open leave (action only).
- Filer (manager who filed): attach to that leave; reason/attachment link like the employee.
- `hr.leave.decide` staff in branch: leaveDetail row without reason; leaveBalances of employees in branch.
- Reason viewers (OWNER · MANAGER in branch · `hr.leave.read` in branch · linked user · filer): viewer-bound attachment link (≤ 900 s).
- Settings users with all-branch scope: holiday preset. Branch-limited managers: refused (`SETTINGS_TEXT.shopWide`).
- Loses: anyone posting `allowHours` through createLeavePolicyAction/updateLeavePolicyAction (field ignored). Requests that overlap, fall only on holidays/days off, exceed the balance, cross a leave year, fall outside employment or before eligibility are now refused (all callers incl. owner-auto, AI proposal and legacy callers).
- `payroll.read` alone: no balances/detail (balNo/detailNo).

## 5. Rulings requested
- **ORACLE-EDIT R-1a `qc-hr-h1.2` S5.7** — hunk: exclude `days` from the "new HrLeave columns null" count (or n/a when `src/lib/modules/hr/leave.ts` exists) · reason: H2.7 R3/Q18 stores `days` on every new leave by contract (nonNull=5 = the 5 leaves' `days`).
- **ORACLE-EDIT R-1b `qc-hr-h1.2` S6.4** — hunk: allow `src/lib/modules/hr/leave.ts` in the `attachmentKey` reader scan · reason: H2.7 R10/R11 (attach/link) must read/write the column; it never leaves the server (S7.3 asserts no attachmentKey/path in DTOs).
- **R-2 seed (H2.2 lane) vs H2.7 R4** (also behind qc-hr-h1.2 S7.4 `nonZero=HrRosterEntry=48` + stale hr-expected.json): `HQC.roster.pendingLeave` = แพร VACATION Sat–Sun of the roster week, which are her days off in a published week ⇒ 0.0 days ⇒ `zeroDays` refusal; seed stops at X0 (RS2). Proposal: change HQC to a range that contains a rostered day (e.g. fromDow 4–6) or the controller decides an R4 exception. Not changed by me (not my file).
- **HQ23** (§3.14).

## 6. Debts (owner WO)
- D-H27-hourly — ledger minute precision + migration before hourly can be switched on (needs Mig WO · owner H2.10/H4.x by controller).
- D-H27-attach — upload UI + private medical storage (owner: controller / storage RUN).
- D1 part-day still blocks the whole day in C-2/rosterOnDay/swap (H2.5/H4.1) · D2 chain decisions not branch-scoped (H2.11) · D3 no admin ADJUST UI · D4 requester text for BALANCE-cancelled chain leave (H2.10) · D5 timesOverridden → H2.4 · D6 lunar/substitution holidays (owner list, Q14).
- D-H27-carry-late — Y−1 leaves approved after the first job run of Y do not re-carry (first write wins).
- D-H27-cron — 20 s budget per hour, systems in id order (later systems wait for the next hour; idempotent).
- D-H27-dead — commented base in requestLeave + unreachable HrLeave branch in approval-effects (S11.3) — remove when the control is retired.
- D-H27-ui — pending meta / own table only; full quota table parity (mockup 05) H2.10/H2.11.

## 7. Visual (CONTROLLER-RUN) — 1440 / 1024 / 390, th + en
- `/app/sys/<HR id>/hr/leave` as **staff** (hr-qc-staff@shark.local, linked น้ำฝน): form with ประเภทการลา / ช่วงเวลา, attach note (seed SICK policy has attachmentAfterDays), "วันลาคงเหลือของฉัน" table (4 HQ12 policies).
- same page as **owner** and **manager**: pending list meta "N วัน · <policy> · คงเหลือ x วัน (+n รออนุมัติ)".
- `/app/sys/<HR id>/hr/settings?year=2026` as **owner**: policy list with rule details, create form (min service · carry · expiry · document days · year start · half-day · prorata; no hourly), holidays 2026 + "ใส่วันหยุดราชการปี 2026" (`hr-holiday-preset`) + Q14 note; press preset → `?msg=p.ok`, seed already has 04-13 shop-wide ⇒ 14 added, 1 skipped. As **manager-branch**: no preset button, note visible.
- Seed caveat R-2: RS2 pending leave is missing until the seed conflict is ruled.

## 8. Prod runbook
No migration. Deploy code (consumer + label ship together). Old leaves keep `days` null / no ledger (their revoke writes nothing). After deploy the hourly cron writes GRANT rows (current year, eligible), CARRY/EXPIRE from the first cron after year start / expiry (idempotent). Owner per shop: settings → year 2026/2027 → apply preset, then add lunar/substitution days by hand until the official list (Q14). Rollback: revert code; mark pending `hr.leave.decided` outbox rows DONE; ledger rows are inert.

## 9. §F self-check
- [x] F1 no new page/route (settings/leave existing) · `?msg=` codes from allowlist (`p.ok`, `l.presetNone`) · qc-nav-functions HR part green
- [x] F2 inside tenantDb(ctx).$transaction only the tx client (leave.ts helpers take `tx`; holidayRowsInRange gets tx)
- [x] F3 unit list `[]` = all branches (hrScopeOf) on reads/writes; explicit list refused with H1.1 text, no ids
- [x] F4 refusals fixed Thai (S7.7 green) · identical bytes for non-viewers (linkNo/detailNo/balNo)
- [x] F5 tx opts 20 s/60 s ≤ route maxDuration (actions default, cron 300)
- [x] F6 no migration
- [x] F7 privileged paths guarded inside the same tx (attach under hr-leave lock; owner-auto in one tx); no second connection under a lock
- [n/a] F8 no rate-limited surface added
- [x] F9 `hr.leave.decided`: consumer + one label + replay ×4 (S8.3) · emitted inside the state-changing tx
- [~] F10 files ⊆ brief list + settings page (needed for the preset button/Q14 note) + messages + inventory; hot files one marked hunk each

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

## r2 (12 Nov)
> Builder r2 · same tree/branch · inputs: review `hr-H2.7-review.md` (M1–M3, D1–D5) + hunt `hr-H2.7-hunt.md` (P1, P2, P3a, P5) + controller rulings L1–L7, D1, D3, D5, seed, ORACLE-EDITs.
> Merge `origin/session/hr` @c3580a938: no conflicts (only `ledger/hr-ctl/ctl-lane.sh` arrived). **No migration** (`prisma/` untouched): the existing kinds + `sourceKey` prefix + `note` express every row kind unambiguously (below).
> RED proof (new/rewritten checks vs 7fdecbba7 code): `ledger/wo-notes/hr-H2.7-r2-red.txt` — `passed 65/78 (QC_FORCE)` · failed S7.1 S7.2 S7.3 S12.1–S12.10.

### r2.1 Ledger model as built (`hr/leave.ts`)
| ruling row | kind | days | leaveYear | sourceKey (unique per HR system ⇒ exactly once) | note |
|---|---|---|---|---|---|
| GRANT | GRANT | +quota/prorata (0.0 also written) | Y | `grant:<emp>:<pol>:<Y>` | – |
| USE | USE | −days (recounted at approval) | leaveYearOf(fromDate) | `use:<leaveId>` | `carry:N.N` = part paid from carried days (absent = 0) |
| REVERT | ADJUST | +USE days | **USE row's** leaveYear + policyId | `use-revert:<leaveId>` | – |
| CARRY_OUT | CARRY | −c | Y−1 | `carry-out:<emp>:<pol>:<Y>` | – |
| CARRY_IN | CARRY | +c (0.0 also written) | Y | `carry:<emp>:<pol>:<Y>` | `expires:YYYY-MM-DD` (frozen from policy at carry time; none = never expires) |
| EXPIRE | EXPIRE | −(carried-in − carry consumed net of reverts), 0.0 also written | Y | `expire:<emp>:<pol>:<Y>` | – |
| late EXPIRE | EXPIRE | −carry part of the reverted leave | USE row's year | `expire-late:<leaveId>` | – |
| ADJUST (other) | ADJUST | ± | Y | any other key | – |
- CARRY_OUT/CARRY_IN are distinguished by key prefix (and sign/year); `leaveYearStateInTx` reads one year's rows: Σ, carryIn + expiry (from `carry:` note), carry consumed = Σ `carry:` notes of USE rows without a `use-revert:`, expired = −Σ EXPIRE; carryLeft = max(0, carryIn − consumed − expired); nonCarry = Σ − carryLeft.
- Request (`reserveLeaveInTx`): Σ pending(Y) + this ≤ Σ(Y) **and** the part ending after expiry (pending + this) ≤ nonCarry. Approve (`leaveApprovalCheckInTx`): recount days (D1) → 0 ⇒ ZERO_DAYS; end ≤ expiry ⇒ days ≤ Σ(Y); else days ≤ nonCarry. USE takes carry first: carry part = min(days, carryLeft) for eligible leaves.
- Job (`runLeaveYearJob`, per (emp, policy), Y = leaveYearOf(asOf)): GRANT when effective · if no `carry:` row: wait while a PENDING leave of that policy is dated in Y−1; else close Y−1's EXPIRE if still open and past, then CARRY_OUT + CARRY_IN in the same tx · after expiry: wait while a PENDING leave of Y ends ≤ expiry; else EXPIRE. Pre-tx plan from one key read + one pending read; only employees with due, non-blocked work get a tx; ≤ `maxTx`; result `{granted, carried, expired, txs, waited, more}`. Every write re-checked under `hr-leave-emp`.
- `updateLeavePolicy` refuses a `yearStartMonth` change (`SETTINGS_TEXT.yearStartLocked`) when the policy has ledger rows or PENDING/APPROVED leaves (slightly stricter than L5: also open leaves of unlimited policies, which have no GRANT row yet).
- Cron (`api/cron/hourly`, marked block): systems rotated by hour-of-epoch, `maxTx: 50` per system, 20 s budget kept.

### r2.2 Worked scenarios (oracle S12, literal expectations; all quota 10 · cap 5 · expiry 03-31 unless noted)
**S12.1 L2 — hunt P1 A (carry is a transfer)** — A uses 5 in 2030, job 2031-01-05, then back-dated 2030 leave 5 d.
| step | 2030 rows | Σ2030 | 2031 rows | Σ2031 |
|---|---|---|---|---|
| after 2030 use | GRANT +10, USE −5 | 5.0 | – | – |
| job 2031-01-05 | + CARRY_OUT −5 | 0.0 | GRANT +10, CARRY_IN +5 | 15.0 |
| back-dated 23–27 Dec 2030 | refused `balance` (Σ2030 0 < 5) | 0.0 | | 15.0 |
First build: Σ2030 stayed 5.0 ⇒ the same 5 days spendable twice (used 25 of 20).

**S12.1 L2 — hunt P1 B / review M2c (Y−1 pending at job time)** — B uses 4 + 3 PENDING (4–6 Nov 2030).
| step | 2030 | Σ2030 | 2031 | Σ2031 |
|---|---|---|---|---|
| job 2031-01-05 | (B skipped: waits) | 6.0 | GRANT +10 only | 10.0 |
| approve pending | + USE −3 | 3.0 | | 10.0 |
| job 2031-01-06 | + CARRY_OUT −3 | 0.0 | + CARRY_IN +3 | 13.0 |
First build: CARRY 5 at the first run ⇒ 15.0 (2 days gained).

**S12.2 L3 — review M1 / hunt P2a** — C: 2031 = GRANT 10 + CARRY_IN 5 (expires 03-31).
| step | result | Σ2031 |
|---|---|---|
| request 1–15 Oct (15 d) | refused `balance` (late part 15 > nonCarry 10) | 15.0 |
| 1–10 Oct (10 d) approve | USE −10 (no carry note) | 5.0 |
| 2–6 Mar (5 d) approve | USE −5 note carry:5.0 | 0.0 |
| job 2031-04-01 | EXPIRE 0.0 | 0.0 |
First build: 15-d leave accepted, then EXPIRE −5 ⇒ −5.0.

**S12.3 L4a — review M2a** — D: 25–27 Mar PENDING on 1 Apr.
| step | rows | Σ2031 |
|---|---|---|
| start | GRANT +10, CARRY_IN +5 | 15.0 |
| job 04-01 | (D waits: PENDING ends ≤ expiry) | 15.0 |
| approve 25–27 Mar | USE −3 note carry:3.0 | 12.0 |
| job 04-02 | EXPIRE −2 | **10.0** |
First build: EXPIRE −5 then USE −3 ⇒ 7.0 (3 days lost).

**S12.4 L4b — review M2b / hunt P2b** — E: 3–7 Feb approved (carry 5), job 04-01, then revoked.
| step | rows | Σ2031 |
|---|---|---|
| approve | GRANT +10, CARRY_IN +5, USE −5 (carry:5.0) | 10.0 |
| job 04-01 | EXPIRE 0.0 | 10.0 |
| revoke | ADJUST `use-revert` +5, EXPIRE `expire-late:<id>` −5 (same tx) | **10.0** |
| revoke again | refused (stale) — no row | 10.0 |
First build: 15.0 (expired carry came back).

**S12.5 L5 — review M3 / hunt P3a** — policy PERSONAL quota 3, ysm 1; 10–11 Feb 2031 approved (USE −2, leaveYear 2031); ysm forced to 4 straight in the DB (simulates a pre-ruling edit); revoke ⇒ `use-revert` +2 in **2031** (Σ2031 3.0, Σ2030 3.0 = its own GRANT only). Settings `updateLeavePolicy({yearStartMonth:4})` on that policy ⇒ `yearStartLocked`; on a policy with no rows ⇒ ok. First build: revert into 2030 (Σ2031 1.0, Σ2030 5.0).

**S12.8 D1 — review D1** — G (after expiry, nonCarry 10):
| step | result |
|---|---|
| 2–6 Jun requested (5.0), then holiday 06-04 added, approve | leave `days` 4.0 · USE −4.0 |
| 9 Jun requested (1.0), then holiday 06-09 added, approve | leave CANCELLED, no USE, approver gets `zeroDaysDecide` |
| 1–7 Jul requested with holiday 07-03 (6.0 ≤ 6), holiday deleted, approve | recount 7.0 > 6 ⇒ `balanceDecide`, leave stays PENDING with days 6.0 |
| Σ2031 | 6.0 (= 10 + 5 − 5 expired − 4) |
What people see: the **employee** sees the leave with the recounted days once approved; a zero-day leave shows as "ยกเลิกแล้ว" in their list (no event; audit `hr.leave.decide` after `{status: CANCELLED, code: ZERO_DAYS}`). The **direct approver** gets `วันลาในใบนี้เป็นวันหยุดทั้งหมดแล้ว — ระบบยกเลิกใบลานี้ให้ ไม่หักวันลา` (zero) or the existing `balanceDecide` (short, nothing written, the approver can reject or wait). **Chain**: short ⇒ CANCELLED + audit `hr.leave.apply_refused {code: BALANCE}` (unchanged); zero ⇒ CANCELLED + `{code: ZERO_DAYS}`; requester text for those is still debt D4 (H2.10).

**S12.9 D5 — review D5** — I has a published entry on 16 Jun 2031 (shop holiday, shopOpen) ⇒ SICK 16 Jun = 1.0 day; J (no entry) same day ⇒ `zeroDays`.

**S12.10 D3 — review D3 / hunt P5** — attach with a valid private pdf ⇒ `attachOff`, `attachmentKey` stays null; link ⇒ `linkNo`, no url; request with `attachmentFileId` ⇒ `attachOff`, 0 rows; `leave.ts` has no `fileAsset`/`privateFileUrl(` (the file-usability path is deleted, `hasAttachment` is constant false, the column is never read).

**S12.6 L6 property** — own HR system, policy quota 6 · cap 4 · expiry 03-31, 3 employees: a fixed prefix (hunt P1 A + review M1, both now refused) + 60 seeded-random ops (request in 2030–2032 / approve / revoke / job with advancing asOf up to 2032-12-20); after every op one `groupBy (employee, leaveYear)` must show no Σ < 0. First build: `prefix:2031=-3.0`.

**S12.7 L7** — `maxTx: 1` ⇒ `txs 1, more true`; full run ⇒ `more false`; two more runs at the same asOf ⇒ `txs 0` each and the system's ledger unchanged; an employee not yet eligible for a 365-day-service policy gets no GRANT row and no tx.

### r2.3 Oracle edits
- `qc-hr-h2.7.mts` new S12.1–S12.10 (above). Rewritten: **S7.1** (was: attach refusals + one success ⇒ now every call `attachOff`, no `attachmentKey` in the tenant — D3) · **S7.2** (was: 5 viewer-bound links ⇒ now every viewer `linkNo`, no url — D3) · **S7.3** (only `hasAttachment === true` → `false` — D3; keys/reason matrix unchanged). Removed the now-unused `private-links` import. S2.6/S6.x/S4.x untouched (the old carry/expire vectors and S6.1/S6.2 numbers still hold under the transfer model). Oracle is 94 KB (> 60 KB §G; it was 79 KB) — controller may want S12 moved into `qc-hr-lib`.
- `qc-hr-h1.2.mts` **S5.7**: excludes only `HrLeave.days` from the null count · **S7.4**: `HrLeaveBalanceTxn` compared with hr-expected.json (seed writes 1 row: prae's lazy VACATION GRANT at RS2) instead of 0 · **S6.4**: no edit (after D3 `hr/leave.ts` no longer names `attachmentKey` outside comments).
- Seed: `hr-qc-env.mts` `pendingLeave` → `fromDow 4, toDow 4` (Friday, prae rostered `m`, 1.0 day) · `seed-hr-qc.mts` lvA shifted back one day whenever its two days would straddle 1 Jan (m7). Seed ×2: `ผ่าน 30/30` both, counts identical.

### r2.4 Other code
- `service.ts` (marked hunks): owner-auto request also takes the roster keys (review m1); decideLeave uses `leaveApprovalCheckInTx` (recount + L3), writes recounted `days`, zero ⇒ CANCELLED + audit + `zeroDaysDecide` after commit.
- `leave-rules.ts`: `LEAVE_TEXT.zeroDaysDecide`, `LEAVE_TEXT.attachOff`. `settings.ts`: `yearStartLocked` + the check. `actions.ts`: attach action no longer reads `fileId`.
- Dead code left as ruled (commented old `requestLeave`, unreachable HrLeave branch in approval-effects).

### r2.5 Debts (new/changed)
- D-H27-attach (unchanged scope, now with the ruling's spec: HR-scoped upload + tenant-wide uniqueness; attach/link refuse until then).
- D-H27-carry-late — **closed** (L2 wait + transfer).
- D-H27-cron — mitigated (rotation + maxTx); still best-effort within 20 s.
- D-H27-r2-unlimited — a policy switched from unlimited to limited after USE rows exist can start a year below 0 (hunt P3d shape); owner action, not reachable by employee/manager operations. Suggest: refuse quota null→number once USE rows exist (controller).
- D-H27-r2-display — `leaveBalances.carried` is net per year (Y−1 shows −c after carry-out); UI wording in H2.10.
- HQ23 — D5 (rostered holiday counts) to be confirmed with the labour consultant.

### r2.6 Runbook
- No migration; deploy code only. The first build was never deployed, so prod has **no** H2.7 ledger rows; nothing to convert.
- First job run on a shop with existing leave data: old leaves (`days` null / no policy) are ignored; for each active employee × active policy it writes GRANT of the current leave year (if eligible), a 0.0 (or real) CARRY_OUT/CARRY_IN pair from the previous year's ledger (empty ⇒ 0.0 markers), and after the expiry date an EXPIRE row; at most 50 tx per system per hour, rotating systems, so a big shop completes over a few hours. Employees with PENDING leaves of the previous year wait until those are decided.
- Pre-check SQL (run read-only before deploy; expect 0 rows each):
```sql
-- 1. ledger rows from the first build's model (CARRY without a carry-out partner) — must be 0 in prod
SELECT count(*) FROM "HrLeaveBalanceTxn" t WHERE t."sourceKey" LIKE 'carry:%'
  AND NOT EXISTS (SELECT 1 FROM "HrLeaveBalanceTxn" o WHERE o."systemId" = t."systemId" AND o."sourceKey" = 'carry-out:' || substr(t."sourceKey", 7));
-- 2. any negative year (limited policies) — must be 0
SELECT t."systemId", t."employeeId", t."policyId", t."leaveYear", sum(t.days) FROM "HrLeaveBalanceTxn" t
  JOIN "HrLeavePolicy" p ON p.id = t."policyId" WHERE p."quotaDays" IS NOT NULL
  GROUP BY 1,2,3,4 HAVING sum(t.days) < 0;
-- 3. size of the first run (employees × active policies per HR system)
SELECT e."systemId", count(DISTINCT e.id) AS emps FROM "HrEmployee" e WHERE e.active GROUP BY 1 ORDER BY 2 DESC LIMIT 20;
```
- Rollback: revert code; ledger rows are inert; mark pending `hr.leave.decided` outbox rows DONE.

### r2.7 Verification (full output of the last forced oracle run: `hr-H2.7-r2-green.txt`)
- oracle qc-hr-h2.7: unforced `passed 78/78` exit 0 · forced `78/78` ×2 · RESIDUE none ×3
- seed-hr-qc ×2: `ผ่าน 30/30` ×2, counts identical (HrLeaveBalanceTxn 1 · HrLeave 3 · HrRosterEntry 48)
- forced ×1: qc-hr-h1.2 **72/73** (S7.4 red only `nonZero=HrRosterEntry=48` — H2.2 roster rows, needs a ruling; ledger part green) · qc-hf-hr-privacy 194/194 · qc-hr-h0.7 74/74 · qc-hr-h2.1 90/90 · qc-hr-h2.2 60/60 · qc-hr-h2.3 79/79 · qc-hr-leave-booking 14/14 · qc-booking-hours-hr 13/13 · qc-approval 16/16 · qc-approval-wiring 7/7 · qc-calendar 9/9 · qc-ai-tools 18/18 · qc-nav-functions red only S5 BOOKING (known; HR 8/8)
- fitness 53/53 ×2 (± env) · fitness-hr 9/9 ×2 · typecheck exit 0, 0 errors

## r2b (12 Nov)
- Rulings: (1) h1.2 S7.4 compares `HrRosterEntry` with hr-expected.json (ORACLE-EDIT) · (2) oracle size accepted · (3) D-H27-r2-unlimited fixed now · (4) stricter ysm lock, owner-auto roster lock, cron rotation accepted.
- `settings.updateLeavePolicy`: when the new quota is not null and quota/minServiceDays/firstYearProrata change, every (employee, leave year) of that policy that has USE rows but no GRANT row is projected with the GRANT the new settings would write (pure `grantDays`); any projected Σ < 0 ⇒ `SETTINGS_TEXT.quotaBelowUsed`, nothing written. Years that already have a GRANT row are unchanged by a quota edit (rows are append-only), so lowering a quota there is allowed.
- S12.11 (new): K uses 4 under an unlimited policy · quota 3 refused (quota stays null) · 5 ok · 3 refused (no GRANT yet) · +1 day (lazy GRANT 5) · 3 ok · Σ2031 0.0. RED vs cb1ff1f10: `ledger/wo-notes/hr-H2.7-r2b-red.txt` (`passed 78/79`, a/c accepted).
- Verify: oracle forced `79/79` · unforced `79/79` · RESIDUE none ×2 · qc-hr-h1.2 `73/73` · qc-hf-hr-privacy 194/194 · fitness-hr 9/9 (no env). Typecheck not re-run: no exported signature changed (one new `SETTINGS_TEXT` key, internal check only).


## r3 (12 Nov)
> Inputs: reviewer re-check of cb1ff1f10 (R2-M1 MAJOR, R2-M2 MEDIUM, job MINOR) + controller rulings. Merge of `origin/session/hr` (H2.4 clock v2) first.

### r3.1 Merge
- Conflicts: `src/lib/modules/hr/service.ts` (prisma type import — kept H2.4's line without `HrAttendanceKind` + the H2.7 import lines), `settings.ts` (imports — both), `settings-actions.ts` (H2.8 preset action vs H2.4 clock actions — both), `src/app/app/sys/[id]/hr/settings/page.tsx` (imports, msg map, server actions — both), `src/messages/{th,en}/common.json` (deep-merged by key: H2.4 tree + H2.7 keys; `hr.settings.stubNote` keeps the H2.7 wording; both parse), `scripts/hr-ui-inventory.json` (H2.4 rows 134 + 16 H2.7 rows not already present; parses).
- Migrations arrived: `20261228000000_hr_clock_v2`, `…01_hr_clock_break_kinds`, `…02_hr_clock_purge_idx` → `prisma generate` (own node_modules) + `prisma migrate deploy` on the lane DB via qc-hr.sh: applied. H2.7 adds none.

### r3.2 R2-M1 — carry consumed is derived
- `leaveYearStateInTx`: carryIn = Σ positive CARRY rows of the year (`carry:` + `carry-top:`); consumed = min(carryIn, Σ days of USE rows not reverted whose leave **ends ≤ expiry**, read from HrLeave.toDate); expireDue = carryIn − consumed; carryLeft = max(0, expireDue − Σ EXPIRE); nonCarry = Σ − carryLeft (what a leave ending after expiry may use).
- USE rows no longer carry a `carry:N.N` note — it is **not written any more**, and nothing reads `note` of USE rows (rows written by r2 test runs only; never deployed).
- EXPIRE (job) = carryLeft at the expiry run (= expireDue, ≥ 0). Corrections keep Σ EXPIRE(Y) = expireDue at all times once `expire:` exists: a pre-expiry leave approved later ⇒ `expire-use:<leaveId>` (positive, gives the expired carry back to that leave), a pre-expiry leave reverted later ⇒ `expire-late:<leaveId>` (negative); both computed as expireDue − Σ EXPIRE in the same tx, once per leave (key), skipped when 0.
- Worked (S12.12, quota 10 · cap 5 · exp 03-31):

| step | rows (2031) | Σ2030 | Σ2031 |
|---|---|---|---|
| 5–9 Jan approved before the carry | GRANT +10, USE −5 | 10.0 | 5.0 |
| job 2031-01-02 | 2030 CARRY_OUT −5 · CARRY_IN +5 (consumed = min(5, 5) = 5) | 5.0 | 10.0 |
| 6–10 Oct approved (nonCarry = 10 − 0) | USE −5 | | 5.0 |
| job 04-01 | EXPIRE 0.0 | | **5.0** (r2: 0.0) |

### r3.3 R2-M2 — revoke of a Y−1 leave after the carry ran
- In the revert tx: if `carry:<emp>:<pol>:<Y>` exists and `expire:<emp>:<pol>:<Y>` does **not**, write `carry-out-top:<leaveId>` (−t, Y−1) + `carry-top:<leaveId>` (+t, Y), t = min(returned days, cap − Y's carried-in so far, Σ Y−1 after the revert); keyed per leave ⇒ exactly once. **Rule: if Y's carry has already expired (its `expire:` row exists), no top-up is made — the returned days stay in Y−1, which is closed.** If the expiry date has passed but the job has not yet written `expire:`, the top-up is made and then expires with the rest (consumed is derived).
- Worked (S12.13, quota 6 · cap 6): T1 22–26 Dec 2030 approved (2030: 6 − 5 = 1) → job 01-02 carries 1 (2030 0.0 · 2031 6 + 1 = 7.0) → revoke ⇒ 2030 +5 − 5 (carry-out-top) = **0.0**, 2031 + 5 (carry-top) = **12.0**. T2 same leave, but revoked after job 04-01 (carry 1 expired: 2031 6.0) ⇒ 2030 **5.0**, 2031 **6.0**, no top-up rows.

### r3.4 Job MINOR
- Each employee tx failure is caught: `failed++`, first message in `failedError`, loop continues; result type gains `failed`, `failedError?` (signature change ⇒ typecheck run). Cron logs one ops WARN per system when `failed > 0`.
- S12.14: an insert trigger (created and dropped by the check, `finally`) makes the lower-id employee's tx fail ⇒ `failed 1`, the other employee gets its GRANT; after the trigger is gone the next run grants the first one (`failed 0`).

### r3.5 Oracle
- New S12.12, S12.13, S12.14 (above). **S12.6** strengthened: half of the generated requests fall in Jan–Mar (before/after the carry and expiry jobs, approvals interleaved), and after every op, for every year with an `expire:` row, Σ EXPIRE = carried-in − min(carried-in, days of APPROVED leaves of that year ending ≤ expiry); r3 RED caught `op37:2031 x=4 want=2`.
- RED vs 337ded5d5 (+ merge): `ledger/wo-notes/hr-H2.7-r3-red.txt` — `passed 77/82` (S12.6 S12.12 S12.13 S12.14; S7.7 red only from the uncaught failure of S12.14).

### r3.6 Debts
- D-H27-r3-closed-year — returned days of a Y−1 leave revoked after Y's carry expired stay in the closed year Y−1 (ruling).
- Merge also auto-merged `hr/ui.tsx` into a duplicate `getTranslations` import (H2.4 + H2.7 lines) — typecheck caught it (2 × TS2300); the H2.7 line is removed. tsx runs were unaffected.

### r3.7 Verification
- oracle qc-hr-h2.7: forced `82/82` · unforced `82/82` · forced `82/82` · RESIDUE none ×3
- seed-hr-qc ×2 `ผ่าน 30/30`, counts identical · qc-hr-h1.2 `73/73` · qc-hf-hr-privacy 194/194 · qc-hr-h0.7 74/74 · qc-hr-leave-booking 14/14 (all forced)
- fitness-hr 9/9 ± env · typecheck (12288/14000M) exit 0, 0 errors (after the ui.tsx import fix; the first run showed the 2 duplicate-import errors)

## r4 (12 Nov)
> Controller rulings after reviewer + hunter on e71d91bc8. RED vs e71d91bc8: `ledger/wo-notes/hr-H2.7-r4-red.txt` — `passed 81/86` (S12.6 S12.15 S12.16 S12.17 S12.18).
1. **`expire-use` removed.** consumed = min(carried-in, days of non-revoked APPROVED leaves that end ≤ expiry **and were filed (HrLeave.createdAt, Bangkok day) ≤ expiry**). A leave filed after expiry is checked against nonCarry and charged to the normal balance only (request: filed = Bangkok today; approval: the stored createdAt). `expire-late` stays — still needed: revoking a counted leave after `expire:` raises expireDue, the late row keeps Σ EXPIRE = expireDue; it is skipped for leaves that were never counted (filed after expiry or ending after it). S12.15: grant 10 + carry 5 expired ⇒ 10.0 → leave 10–12 Mar filed 5 Apr approved ⇒ 7.0 → revoke ⇒ 10.0; half-day 17 Mar AM ⇒ 9.5 → 10.0; no EXPIRE correction rows. S12.6 property now stamps each generated leave's createdAt with the simulated day and checks Σ EXPIRE = carried-in − min(carried-in, pre-expiry leaves filed ≤ expiry). Hunter cases still green: S12.3 (pending at expiry ⇒ job waits), S12.4 (revoke after expiry = 10.0), S12.2 (leave spanning past expiry charged to quota).
2. **Quota race.** `updateLeavePolicy` takes `SELECT … FROM "HrLeavePolicy" … FOR UPDATE` first in its tx; request (`reserveLeaveInTx`) and approval (`leaveApprovalCheckInTx`) read the policy `FOR SHARE` and use that fresh row. Order on the leave side: `hr-leave:<id>` → `hr-leave-emp` → roster keys → policy row (FOR SHARE). The settings tx holds only the policy row lock and takes no advisory lock, and the leave side never waits for a settings-owned resource other than that one row ⇒ no cycle. (FK inserts into HrLeaveBalanceTxn take KEY SHARE, compatible with FOR SHARE.) S12.18: holder tx locks the row FOR UPDATE and sets quota 3; a concurrent approval of a 4-day leave on the formerly unlimited policy waits, then sees quota 3 ⇒ `balanceDecide`, nothing written. (Note: on e71d91bc8 the approval also waited — on the FK KEY SHARE of the lazy GRANT — but it had already read the policy as unlimited and wrote USE −4 ⇒ Σ −4.0; the check fails on the outcome, not on `waited`.)
3. **End date.** (a) `leaveApprovalCheckInTx` re-checks startDate/endDate ?? contractEndAt ⇒ code OUT_OF_EMPLOYMENT: direct approver gets `LEAVE_TEXT.outOfEmploymentDecide` ("ใบลานี้มีวันลานอกช่วงการจ้างงานของพนักงาน — อนุมัติไม่ได้"), leave stays PENDING, no USE; chain ⇒ CANCELLED + audit `apply_refused {code: OUT_OF_EMPLOYMENT}` (same path as BALANCE). S12.16. (b) the job drops a policy for an employee whose `endDate` is before the start of that policy's current leave year (no GRANT, no carry). S12.17.
4. Oracle start drops any `qc27_fail_%` trigger/function left on the lane DB.
5. `failedError` = error name + code only (≤ 80 chars); full error via `console.error` with systemId/employeeId.
- Debts (controller-recorded, not done): returned days after Y's carry expired stay in closed Y−1; top-up timing between the expiry date and the expiry job run.
- Verify: qc-hr-h2.7 forced `86/86` ×2 · unforced `86/86` · RESIDUE none ×3 · qc-hr-h1.2 73/73 · qc-hf-hr-privacy 194/194 · qc-hr-h0.7 74/74 · qc-hr-leave-booking 14/14 · fitness-hr 9/9 ± env · typecheck (after `rm -rf .next/types`) exit 0, 0 errors. S12.18 literal corrected before the green runs: a refused approval rolls back the lazy GRANT too ⇒ expected Σ 0.0 (nothing written), not 3.0.

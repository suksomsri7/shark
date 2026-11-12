# H4.4 oracle — check list (`scripts/qc-hr-h4.4.mts`, 67 checks · 62 RED by design · 5 GREEN controls)

Brief: `ledger/hr-briefs/hr-brief-H4.4.md` (DRAFT, defaults in force). Base `session/hr` 2e23c8164. Red run: `ledger/wo-notes/hr-H4.4-red.txt` (lane DB l2, forced: BASE-EXPECTATION 67/67, 5/67 pass = the 5 GREEN controls, RESIDUE none; unforced: SKIPPED exit 0).
Run: `bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h4.4.mts` (QC4 confirmation: `qc4.sh` instead of `qc-hr.sh`).
Time: all fixtures in 2031, `opts.now` injected (S3.1 proves no dependence on today). Races: holder on `hr:clock:<emp>` (S10.1), 4 parallel offboards, 2 parallel sweeps, offboard ∥ setPin — ≤ 5 lanes. "vs base" statics (S14 hunk counts, S15.1) become n/a once `hr/lifecycle.ts` is in the base.
Viewers: owner · mgr-all (MANAGER `*` + key) · mgr-u1 (MANAGER [u1] + `hr.employee.create`) · mgr-role (MANAGER [u1], no key) · payroll (STAFF `hr.payroll.read`) · leave-reader (STAFF `hr.leave.read`) · member · linked employees (self) · other-tenant owner.
Controller-run visual gate (not in the oracle): brief §5 list — register / probation profile / ended profile / offboard dialog / settings × owner, manager-u1, staff × 1440×900, 1024×768, 390×844, before the control run. Seed changes (§6) ⇒ FULL controller run.

## S1 — migration / schema (4)
- `H4.4-S1.1` MAJOR · RED · [static] migration last · enum 5 labels · no ALTER TYPE/DROP
- `H4.4-S1.2` MAJOR · RED · [static] 4 columns · CHECK note ≤ 500 · 2 indexes · note FK RESTRICT
- `H4.4-S1.3` MAJOR · RED · [static] hr.prisma enum + fields · note Restrict · task Cascade
- `H4.4-S1.4` CRITICAL · RED · [db] 4 columns on the lane DB
## S2 — settings (AppSystem.settings.hrLifecycle) (4)
- `H4.4-S2.1` MAJOR · RED · policy defaults (14/30 · UNIT_MANAGER · kanban off · revoke ×2 · templates)
- `H4.4-S2.2` MAJOR · RED · owner save ⇒ read back · hrClock kept · audit
- `H4.4-S2.3` MAJOR · RED · settings validation texts
- `H4.4-S2.4` CRITICAL · RED · settings viewers (mgr-all ok · shopWide · noPermission)
## S3 — alert sweep (5)
- `H4.4-S3.1` CRITICAL · RED · sweep now=2030 ⇒ 0 (no today)
- `H4.4-S3.2` CRITICAL · RED · sweep ⇒ exactly P1/P4/C1 · key · payload ids only · systemId
- `H4.4-S3.3` MAJOR · RED · rerun ⇒ 0 + quiet (outbox/audit) · next day ⇒ 0
- `H4.4-S3.4` MAJOR · RED · extension ⇒ one new alert
- `H4.4-S3.5` MAJOR · RED · bounded + fair: 60 ⇒ 50 then 60 · small system 3 in run 1
## S4 — panel + probation (3)
- `H4.4-S4.1` MAJOR · RED · lifecycleDue owner: exact keys · P1/P4/C1 · no ended
- `H4.4-S4.2` CRITICAL · RED · lifecycleDue scope: mgr-u1 u1 only · others null
- `H4.4-S4.3` MAJOR · RED · confirmProbation · notProbation · noAccess
## S5 — offboarding core (one tx) (10)
- `H4.4-S5.1` CRITICAL · RED · offboard result: pinRevoked · cancelled 2/2/2 · spanning 1
- `H4.4-S5.2` CRITICAL · RED · row ENDED + offboard* · PIN null
- `H4.4-S5.3` MAJOR · RED · leaves: future cancelled (+ approval) · spanning/past untouched
- `H4.4-S5.4` MAJOR · RED · swaps closed · roster after end deleted · OT untouched
- `H4.4-S5.5` CRITICAL · RED · 1 event {employeeId,endDate} · no note/reason in outbox/audit
- `H4.4-S5.6` MAJOR · RED · 6 offboarding tasks · pin_revoked + app_access done · access revoked
- `H4.4-S5.7` MAJOR · RED · offboard validation texts · refusals write nothing
- `H4.4-S5.8` CRITICAL · RED · offboard gate: noAccess ×4 (same bytes) · mgr-role in branch ok
- `H4.4-S5.9` MAJOR · RED · autoRevokePin=false: hash kept · verifyPin refused
- `H4.4-S5.10` CRITICAL · RED · loadLifecycleForViewer keys · owner/mgr-u1 only
## S6 — access after offboard + restore (4)
- `H4.4-S6.1` CRITICAL · RED · after: verifyPin ×2 + kiosk refused · clock no row
- `H4.4-S6.2` CRITICAL · RED · after: mobile · POS clockSelf/onShiftToday · kiosk list
- `H4.4-S6.3` CRITICAL · RED · restore two-step: PIN stays null · history kept
- `H4.4-S6.4` MAJOR · RED · re-offboard: 2 events · overwritten
## S7 — review notes + viewer matrix (7)
- `H4.4-S7.1` MAJOR · RED · notes: WRITTEN forced visible · REVIEW · NOTE hidden · ENDED ok
- `H4.4-S7.2` MAJOR · RED · note validation texts
- `H4.4-S7.3` CRITICAL · RED · note non-viewers ×7 same noAccess · self
- `H4.4-S7.4` CRITICAL · RED · listReviewNotes keys · non-viewers null
- `H4.4-S7.5` CRITICAL · RED · myReviewNotes: own visible only · keys · peers none
- `H4.4-S7.6` MAJOR · RED · acknowledge once · hidden/peer noAccess
- `H4.4-S7.7` CRITICAL · RED · note audits clean · no outbox
## S8 — checklists (3)
- `H4.4-S8.1` MAJOR · RED · startChecklist 7 · 1 event · idempotent · race
- `H4.4-S8.2` MAJOR · RED · listChecklist keys · setTaskDone on/off
- `H4.4-S8.3` CRITICAL · RED · checklist non-viewers
## S9 — kanban bridge + replay (4)
- `H4.4-S9.1` CRITICAL · RED · 3 consumers · kanban off ⇒ 0 cards
- `H4.4-S9.2` CRITICAL · RED · milestone replay ×2 ⇒ 1 card (key · title)
- `H4.4-S9.3` MAJOR · RED · checklist replay ×2 ⇒ 1 card per open task · linked
- `H4.4-S9.4` CRITICAL · RED · offboarded replay ×2 ⇒ open tasks once · no leak in cards
## S10 — races (4)
- `H4.4-S10.1` CRITICAL · RED · [race] offboard waits on hr:clock · IN kept · ENDED
- `H4.4-S10.2` CRITICAL · RED · [race] offboard ×4 ⇒ 1 ok · 1 event/audit · 6 tasks
- `H4.4-S10.3` CRITICAL · RED · [race] sweep ∥ sweep ⇒ once each
- `H4.4-S10.4` CRITICAL · RED · [race] offboard ∥ setPin ⇒ PIN null
## S11 — retention (3)
- `H4.4-S11.1` CRITICAL · RED · [db] delete employee with note ⇒ 23503 · note kept
- `H4.4-S11.2` MAJOR · RED · [db] FK actions r/c
- `H4.4-S11.3` MAJOR · GREEN · [static] no hrEmployee.delete in src
## S12 — privacy statics (6)
- `H4.4-S12.1` CRITICAL · RED · [static] lifecycle-actions use server · 7 wrappers · no DB · no now:
- `H4.4-S12.2` CRITICAL · RED · [static] remove + ENDED save → offboardEmployee
- `H4.4-S12.3` CRITICAL · RED · [static] emit/audit blocks free of sensitive keys
- `H4.4-S12.4` CRITICAL · RED · [static] bridge via links only · clean
- `H4.4-S12.5` CRITICAL · RED · [static] AI + client files clean
- `H4.4-S12.6` MAJOR · RED · [static] fitness-hr lists · fitness ×2 no env
## S13 — UI statics (5)
- `H4.4-S13.1` MAJOR · RED · [static] testids 20 + 3 · tokens only · 44 px
- `H4.4-S13.2` MAJOR · RED · [static] inventory rows ⇄ testids
- `H4.4-S13.3` MAJOR · RED · [static] hr.life th = en
- `H4.4-S13.5` MAJOR · GREEN · [static] no new tab (layout + hrTabs as base)
- `H4.4-S13.6` MAJOR · RED · [static] mounts: profile · settings · register
## S14 — hot-file hunks (2)
- `H4.4-S14.1` MAJOR · RED · [static] marked hunks: consumers (3) · cron (now: new Date())
- `H4.4-S14.2` MAJOR · RED · [static] labels: 3 events once each
## S15 — frozen (2)
- `H4.4-S15.1` CRITICAL · GREEN · [static] payroll-rules sha · 8 HR files unchanged
- `H4.4-S15.2` MAJOR · GREEN · [db] setEmployeeActive(false) keeps hash
## Z1 — residue (1)
- `H4.4-Z1` CRITICAL · GREEN · no residue

## Totals
S1 4 · S2 4 · S3 5 · S4 3 · S5 10 · S6 4 · S7 7 · S8 3 · S9 4 · S10 4 · S11 3 · S12 6 · S13 5 · S14 2 · S15 2 · Z1 1 = 67 · GREEN controls: S11.3, S13.5, S15.1, S15.2, Z1.

## ORACLE-EDITs expected elsewhere (controller rules at merge)
- `qc-hr-h1.3` S1.12 / S4.6 expect `HrReviewNote` FK CASCADE — H4.4 R1 makes it RESTRICT (retention).
- `seed-hr-qc` ML1 "notes/tasks = 0" changes with brief §6.

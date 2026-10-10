# C4.3-fix part 2 — strict-b inline errors (builder · worktree shark-crm-c432 @130ca0c1 · 27 Sep 2026)

## Shared pattern
- `src/components/crm/form/field-errors.tsx` — `useFieldErrors(order)` {errors, show(errs)→focus first invalid, set, clear, reset, field(k)→ref+aria-invalid+aria-describedby, errorId} + `<FieldError>` (text-xs danger, under field).
- `src/lib/modules/crm/field-errors-shared.ts` — `withFieldError(fail, {field: bad?})` (server action → `fieldErrors`), `blank()`.
- Objects: `ObjectsError.field` (service tags its own field) → objects-actions `fail(code,msg,field)` → `fieldErrors`. `objectTextProblem`/`titleFieldKeyProblem` moved to objects-shared (same text).

## Progress
- [x] batch 1: company, contact, deal, lr, activity, object view-save, object import, seq bulk, object edit/add/archive, object record
- [x] batch 2: pl-new, st-new, teams-create, team-member-add, visibility-override
- [x] batch 3: seq-new, seq-holiday, email composer, api key, api hook (all 22 forms edited; next = typecheck)
- [x] typecheck exit 0 (.qc-shots/c432/typecheck-2.log · 19:25)
- [x] build ok ~23:05 (systemd unit via .qc-shots/c432/run-fg.sh build · build-2.log) · server :3217 = unit c432-serve (`systemctl stop c432-serve` to stop) · BUILD-STATE restored
- [x] oracle b r1 (build #1): 65/68 — company@1440 + contact@1440/@390 no-focus = REAL bug: blur-validation of the empty required field renders the message on mousedown→blur, pushes the submit button down, mouseup lands outside ⇒ no submit. Fix (source, not yet built): blur skips empty values (required msg on submit only). Parts moved to .qc-shots/c432/parts-aside/
- controller 27 Sep: oracle being hardened (S3: error text must be NEW + VISIBLE, describedby only to the error; S4: whole-table row counts) — final proof must run on the hardened copy the controller drops into c432. Design already complies (errors only after a failed submit; aria-describedby only while an error exists).
- [x] full forms run f1 on build #1: MERGED 648/651 (only the 3 blur no-focus) · positive controls all caught · restore identical all parts · copy .qc-shots/c432/summary-f1-build1.json
- [x] rebuild #2 (blur fix, build-3.log) · server :3217 restarted (unit c432-serve) · b r2 = 68/68 (r2b1 30/30 · r2b2 38/38 · 2 skipped = selects without empty option) · controls 11/11 · restore identical
- restart #2 (00:25): f2q01 finished before it; chain resumed as systemd unit c432-final2 (.qc-shots/c432/run-final2.sh) — merge → shots → suites → fitness
- [x] merge FINAL 651/651 (summary-final.json) · shots 44 png (INDEX.txt, restore identical) — clip bug for scrolled pages fixed in shots.mts → re-run shots after suites
- suites s1 (build #2): c1.3 89/89 · c1.4 110/110 · c1.5 103/103 · c1.6 79/79 · c1.7 57/57 · c1.9 45/45 · c1.10 ? · c1.11 65/66 (S9.1 = my doc comment in field-errors.tsx contained a JSX input snippet → static scan; comment rewritten, needs rebuild+re-run) · c1.2b 92/93 (S8.2 = OpsEvent 'ใกล้ถึงเพดาน objectsWarn (80%)' from C3.9 limits.ts at 29 objects — not from this change; pre-existing C3.9×C1.2b) · c2.2 73/73 · c2.5 105/105 · c2.8 54/54
- controller dropped HARDENED oracle into c432 (runner refuses mixed builds; provenance needs committed src — we are told not to commit ⇒ expect provenanceProblems srcDirty/buildSrc unknown)
- s1 also: c1.10 67/67 · c3.1 56/56 · c3.8 30/31 (S7.1 = .claude/skills absent in this worktree — gitignored, environmental) · fitness env/noenv exit 0 (F14 green, no registry rows added)
- [ ] RUNNING unit c432-v3 (.qc-shots/c432/run-v3.sh · progress v3-progress.log): rebuild #3 → typecheck → hardened full run → merge → c1.11 → shots
- (was) NEXT: after c432-final2 ends → rebuild #3 → typecheck (new oracle files) → hardened full run v3 (all parts) → c1.11 re-run → shots re-run
- (old) chain run-final.sh: f2q01 re-run (company/contact/deal a–e) → merge → shots → suites → fitness ×2 (progress in final-progress.log) → rebuild #2 → b r2 + f1q01 re-run → shots (.qc-shots/c432/shots.mts) → full forms run → suites → fitness

## STOP (quota 81%, controller) — exact state
- Unit `c432-v3` RUNNING (leave it): rebuild #3 → typecheck → hardened oracle i1+q01…q10 on :3217 → merge → c1.11 re-run → shots re-run. Progress: `.qc-shots/c432/v3-progress.log` (ends with `V3DONE`). Server :3217 = unit `c432-serve` (restarted by the chain after build #3).
- If the chain died mid-way: check BUILD-STATE (restore `.qc-shots/c432/BUILD-STATE.prev` if it still says BUILDING c432), then re-launch: `systemd-run --unit=c432-v3b --collect --working-directory=/root/projects/shark-crm-c432 --setenv=PATH="$PATH" --setenv=HOME=/root -p StandardOutput=file:/root/projects/shark-crm-c432/.qc-shots/c432/run-v3b.out -p StandardError=inherit bash .qc-shots/c432/run-v3.sh` (it rebuilds; parts are re-run from scratch).
- On resume: read v3-progress.log + `.qc-shots/c432/summary-v3.json` (expect provenanceProblems = srcDirty/build-src unknown, since the fix is uncommitted by instruction) → look at re-shot pngs (`.qc-shots/c432/shots/`) → handback (≤50 lines). At end: `systemctl stop c432-serve`.
- Already proven on the pre-hardening oracle (build #2): forms 651/651 · b 68/68 both viewports · typecheck 0 · fitness env/noenv 0 · suites green except c1.11 S9.1 (fixed: comment), c1.2b S8.2 (pre-existing C3.9 80% OpsEvent), c3.8 S7.1 (.claude/skills absent in worktree).

## RESUME analysis (28 Sep · after V3DONE)
- v3 (hardened oracle, build #3 yp61t4-7GOQPikodnojZy): 629/635. All 6 failures + all 30 missingPlanned = crm-seq-enroll-form + crm-seq-bulk-form aborted by assertProbes: RUNNER bug — STATE uses `crmSequenceEnrollment where {systemId}` (qc-crm-forms.mts:1005-1006) but CrmSequenceEnrollment has no systemId column → countWhere = -1. Reported to controller (oracle owner c43). Suggested: `{ tenantId: TENANT }` or `{ sequence: { systemId: SYS } }`.
- PH-lock-guard missed ONLY in the merge step (merge ran without the gate lock, like run-qc3-v3.sh does); merge re-run under `qc3.sh with-gate-lock.sh` → 256/256 controls (v3-merge-locked.log · summary-v3-locked.json).
- provenance 21 = 11×srcDirty + 10×server build src unknown (no BUILD-STATE/commit for c432) — only cause is the uncommitted tree; no runner/build mismatch.
- c1.11 re-run 66/66 · shots pass 2 = 44 png, restore identical, 0 POSTs.
- NEXT (after runner fix): re-run i1 + q09 only is NOT enough (merge refuses mixed runner sha) → re-run all parts with the fixed runner on :3217 (server still up, unit c432-serve).
- v4: controller fixed probe (ORACLE-EDIT C4.3-probe); unit c432-v4 = all parts + locked merge on :3217 (build #3, unchanged src) → v4-progress.log / summary-v4.json
- v4 DONE: merged 659/659 · controls all caught · missingPlanned 0 · restore identical · provenance 21 (uncommitted only) → gate false only for provenance
- round 2 (reviewer MERGEABLE AFTER SHOULD-FIX): S1 LogActivityForm 7 onChange → fe.clear(k) ✔ · S2 company/contact required custom field → under-field `cf:<key>` + focus ✔ (form box no longer used for it) · N2 not done (not mechanical — see handback) · unit c432-v5 (run-v5.sh): rebuild #4 → typecheck → fitness×2 → S2 probe (s2-probe.txt + shots/s2-*.png) → all parts + locked merge → summary-v5.json
- v5 stopped after q04 (controller swapped the oracle mid-run ⇒ mixed runner sha) · v5 S2 UI probe PASS ×4 (s2-probe.txt, shots/s2-*.png)
- round 2 scope add: server enforcement of required custom fields on company/contact CREATE — `missingRequiredCustom()` (field-errors-shared.ts, pure) called from createCompany/createContact when `opts.requireCustom` (set by the server actions + REST ops companies.create/contacts.create; automatic paths — calls, chat, imports, lead bridges — not flagged); error carries `field: "cf:<key>"` → action fieldErrors → UI under that field. Update path: engine already refuses blank for a provided required key.
- unit c432-v6 (run-v6.sh): rebuild #5 → typecheck → fitness×2 → S2 probe → oc1 (--only-custom) → all parts → locked merge → suites c1.3 c1.4 c1.10 · progress v6-progress.log (V6DONE)
- STOP (quota 95%): S1+S2 (UI + server enforcement) done; unit c432-v6 still running (oc1 --only-custom 10/10 GREEN on build #5 VKpV4mPTZafsktlsr9fn1; then all parts → locked merge → suites c1.3/c1.4/c1.10) — read v6-progress.log for V6DONE, then handback. N2 not done (not mechanical).

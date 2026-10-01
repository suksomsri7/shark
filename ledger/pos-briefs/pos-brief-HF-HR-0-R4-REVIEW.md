# HF-HR-0 round 4 — independent review + adversarial re-check (controller, 1 Oct 2026)

You are the independent reviewer AND hunter for round 4 of the HR privacy hotfix. You did not write it. Read-only on product code and oracles: throw-away probes ONLY as `scripts/_probe-hr4-*.mts` in the tree (delete before you finish; never commit, never push).

## Where
- Tree `/root/projects/shark-hf3`, branch `hotfix/hr-privacy`. Round-4 diff = `git diff 83989a1e..HEAD` (83989a1e = merge of origin/main; rounds 1–3 were reviewed before).
- Builder's brief: `/root/projects/shark-pos/ledger/pos-briefs/pos-brief-HF-HR-0-R4.md`. Builder notes: `ledger/wo-notes/HF-HR-0.md` section "Round 4" (+ `-red4`, `-control4`, `-green`).
- Machine rules: `/root/projects/shark-pos/ledger/pos-briefs/pos-brief-LANE-RULES.md` (QC4 only; never read `.env`; no prisma generate/migrate; no build/server; never touch `/root/projects/shark-crm*` or `shark-in-th`; never sweep `/tmp`). DB commands: `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/<file>.mts`. Do NOT run typecheck. Foreground only; report once, at the end.

## What the controller already verified
`qc-hf-hr-privacy` 119/119 on QC4 at f711f3eb; then one approved ORACLE-EDIT commit on `scripts/qc-ai-proposals.mts` (PZ-6.1 passes a user id). Rulings: C5 accepted (explicitly empty decider refused; omitted argument keeps legacy behaviour, guarded by static check S-14); R4.1(b), R4.5, C7, C8 deferred. Overturn any of them with evidence.

## Check, by execution where possible
1. **Leave decision without a human (R4.1/R4.2)**: enumerate EVERY path that can change a leave request's status (grep `leaveRequest.update`, `leaveRequest.updateMany`, `decideLeave`, `bulkDecideLeave`, approval effects, cron, outbox consumers, REST `/api/**`, mobile routes, AI tools/proposals/plans, server actions). For each: who is recorded as decider, can the requester approve their own leave through it, and can it run with no user at all? Specifically try: an AI plan containing `hr_decide_leave`; an AI proposal confirmed by the requester themself (web action, mobile route, member assistant); a proposal confirmed by a user from another tenant or a user without the HR permission; `bulkDecideLeave` with a mix of own and others' requests; the approval-engine path (`approval-effects.ts`) — can a requester be their own approver there?
2. **C5**: is "argument omitted = legacy" reachable from any non-test code path today (including dynamic calls, re-exports through `hr/index.ts`, the module registry, AI tool tables)? If yes ⇒ MAJOR.
3. **Grant race (R4.3)**: N concurrent grants of different accounts to one employee ⇒ exactly one wins, losers leave nothing behind (membership rows, audit rows, role changes). One account to two different employees concurrently (builder says still open when the account already has a membership) — measure it, say what an attacker gains, and whether it is a privacy leak (can a person end up reading another employee's payslip/salary?).
4. **Self-link (R4.4)**: OWNER can; holder of `hr.payroll.read` can; MANAGER without it cannot; STAFF cannot; nobody can link themselves to an employee row in another tenant or another unit they cannot access. After linking, what new data does the linked user see — anything they could not already see?
5. **OT refusal (R4.6)**: for a non-payroll-viewer, every refused OT-by-hours request returns byte-identical output (message, shape, timing class — report rough timings for the different refusal causes; a 10× difference is a finding). Payroll viewers unchanged.
6. **Rounds 1–3 still hold after the merge of main**: re-run the oracle yourself and spot-check by your own probe that a STAFF user cannot read another employee's salary/payslip/bank fields through: HR pages' server actions, staff service, AI tools (`ai/tools.ts` HR readers), REST/mobile routes, reports datasets, exports.
7. **R4.7 SQL** in the notes: is it truly read-only (`BEGIN READ ONLY … ROLLBACK`, no `SET` that could leak through a pooler), and does it return what it claims on QC4?
8. Scope creep / missing items vs the brief.

## Report (English, compact)
Verdict: ACCEPT / ACCEPT-WITH-NOTES / REJECT. Findings as `[CRITICAL|MAJOR|MINOR|NOTE] file:line — what — how proved (command + observed result)`. Separate "introduced by round 4" from "pre-existing / still open". End with probes run, confirm they are deleted and `git status` is clean (except untracked `scripts/qc4.sh`).

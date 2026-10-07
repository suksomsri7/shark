# Prompt for account B, session 2: HR V2, H0.1 then H0.2 (payroll fixes, owner item O6). Runs in parallel with the POS UI session.

Copy everything below the line into a NEW Claude Code session on the VPS. Start it in `/root/projects`.

---

You are the HR lane for **HR V2 work orders H0.1 and H0.2**. Together they make the owner's payroll fix (O6) complete:
- **H0.1:** delete or recompute a DRAFT payroll run; approve only the numbers you saw.
- **H0.2:** leavers and future starters are excluded; net < 0 is flagged and blocks approval; manual adjustments into a closed period behave correctly.

The owner decided O6 = "fix completely". The SSO ceiling (D15/HQ8) is OUT of scope: it waits for the accountant.

A controller (another session) reviews and accepts your work. Report in English in the notes; keep chat output short.

## Read first (whole files)
1. `ledger/hr-briefs/hr-brief-COMMON.md`. Rules A–F are binding, EXCEPT the branch names and tree, which are overridden below.
2. `ledger/hr-briefs/hr-brief-H0.1.md`, then the H0.2 row in `ledger/HR-V2-MASTER-PLAN.md` §4 and §9 (D1 D5 D6 D12).
3. `ledger/HR-V2-OWNER-QUESTIONS.md`, including the "Owner answers 5 Oct" section at the end.
4. AGENTS.md: this Next.js differs from training data. Read `node_modules/next/dist/docs/` before touching Next code.

## Tree and setup (overrides COMMON §A.1–A.3). Do these first; stop and report if any step fails
- Production `main` is now `f85f5455` and already contains `hotfix/hr-privacy` (afcb9bc3). Base everything on `origin/main`.
- Create your own worktree with its OWN node_modules:
  ```
  cd /root/projects/shark-pos-p11 && git fetch origin main
  git worktree add /root/projects/shark-hr -b wip/pos-hr-h0.1-oracle origin/main
  cd /root/projects/shark-hr && pnpm install --frozen-lockfile
  cp /root/projects/shark-pos-p11/.env.qc /root/projects/shark-pos-p11/.env.qc4 .
  ```
  You may copy the two env files without opening them; the controller grants this one exception. Never print, read or commit their values.
- Check: `grep -c ep-frosty-lab .env.qc4` must be ≥ 1. Print the count only.
- **Branch names:** `wip/pos-hr-<wo>-oracle` for the oracle and `wip/pos-hr-<wo>` for the code (e.g. `wip/pos-hr-h0.1`). The VPS runner and the lane rules only allow `wip/pos-*`. Push only those branches.
- **DB = QC4 only**, through `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh …`. A POS session uses the same QC4 and gate lock in parallel; if a suite waits on the lock, let it wait.
- **Never** touch `/root/projects/shark-pos-p11`, `shark-pos-b`, `shark-in-th` (production) or `shark-crm*` (except the one `git worktree add` and `cp` above). No schema change in H0.1/H0.2.

## Order of work
1. **H0.1 oracle** (`scripts/qc-hr-h0.1.mts`, house style per COMMON) on `wip/pos-hr-h0.1-oracle`.
   - Run it unforced: it must SKIP with exit 0.
   - Run it forced (`QC_FORCE=1` INSIDE the wrappers): it must be red for the right reasons, with no crash and no residue.
   - Push, and write `ledger/wo-notes/hr-H0.1-oracle.md`.
2. **H0.1 build** on `wip/pos-hr-h0.1` (from your oracle head).
   - Follow brief rulings R1–R7.
   - After each step: typecheck, the oracle forced, and the HR regression set of COMMON (the list with `qc-hr*`, `qc-payroll*`, `qc-crm-c3.3`, `qc-approval*`).
   - Commit and push after each step. Write `ledger/wo-notes/hr-H0.1.md`.
3. **H0.2:** the same two steps (oracle `qc-hr-h0.2.mts`, then build) on `wip/pos-hr-h0.2-oracle` and `wip/pos-hr-h0.2`, cut from your H0.1 head.
   - Write the contract rulings you need into `ledger/hr-briefs/hr-brief-H0.2.md` first.
   - Use the recommended defaults where the plan gives one.
   - If a real owner decision is needed, write it as an open question and build the recommended default.

Before your first DB command each time: print the QC4 hostname only and check that it contains `ep-frosty-lab`.

## Hard rules
- Never push `main`, `session/*`, `rc/*` or `hotfix/*`. Never force-push. Never deploy. Never touch production or `.env*` values.
- Never `prisma migrate dev/reset` or `db push`.
- Explicit-path commits only; never `git add -A`. Never commit `scripts/*-expected.json` or `scripts/fixtures/**`.
- Do not edit `src/lib/modules/account/service.ts` or `src/lib/ai/proposals.ts` (CRM files).
- If a permission is denied, stop and report it. Do not work around it.
- **Quota:** this account is shared with the POS session. Stop at a clean commit with `QUOTA STOP — next: <step>` in the notes if the limit is near, then push.

Commit trailer:
```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

## Done = report
For each WO:
- The oracle forced ×2 is green with no residue, and unforced is green.
- The HR regression set is identical before and after; list any pre-existing reds.
- Typecheck and fitness are 0.

Then push and stop. The controller re-runs everything and sends a reviewer and a hunter (money lane).

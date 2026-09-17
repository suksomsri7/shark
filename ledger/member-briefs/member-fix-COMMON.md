# Member v2 — audit fix run (S1–S4) · common rules (read first)

Source of findings: `ledger/AUDIT-2026-09-16-MEMBER.md` (IDs H1–H7, M1–M15, L1–L15). Each batch brief lists its IDs, the files it OWNS, and acceptance criteria.

## Hard rules
- Worktree `/root/projects/shark-member`, branch `session/member`. Four batches run IN PARALLEL on this one worktree → touch ONLY the files your brief says you own. Need a change elsewhere? Stop and report it; do not edit.
- NEVER touch `.env`. NEVER `source .env*`. QC database only (`.env.qc`, scripts self-load it via `QC_ENV_FILE=.env.qc`).
- NEVER run `next build`, `pnpm build`, `git commit`, `git push`, `prisma migrate`. NO new Prisma migrations and NO schema changes in this run (anything that needs one: report it as DEFERRED with the reason).
- This is a custom Next.js — read `node_modules/next/dist/docs/` before using any Next API you are unsure of. `"use server"` files may export only async functions (no `export type`). `'use client'` files must not import modules that reach prisma (use `*-shared.ts`).
- HEAVY COMMANDS KILL THE SESSION (5 GB cgroup). Every tsx / tsc / pnpm command MUST be run through the wrapper, in the FOREGROUND, one at a time:
  `bash scripts/iso.sh pnpm exec tsx scripts/<file>.mts`
  `bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck`   (typecheck only via gate lock)
  Never background a command and "wait for a monitor" — run it and read the output.
- Do not weaken or edit any existing oracle (`scripts/qc-*.mts`) to make something pass. If an existing oracle legitimately must change because behaviour changed by design, report the exact hunk + reason as `ORACLE-EDIT <suite>-<check>` in your final report; the controller decides.
- Minimal, surgical fixes. Follow the existing code style and Thai comments convention (short `// 🔴 AUDIT <ID>:` comment at each fix site explaining the why).
- Error messages shown to shop staff/customers are Thai and must not blame the user.

## Deliverable of every agent
A final report (English, compact): per finding ID → files/lines changed, how it was fixed (or `DEFERRED` + reason), commands run with their final summary lines, anything the controller must decide.

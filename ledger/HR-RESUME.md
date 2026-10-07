# HR V2 RUN — controller resume (account B · Fable controls · Opus lanes)

> Read first on restart: this file (latest block at the bottom) → `ledger/hr-briefs/hr-prompt-accountB-H0.1-H0.2.md` → `hr-brief-COMMON.md`.
> Controller tree: `/root/projects/shark-hr-c` (branch `session/hr`, accepted HR work lands here). Lane trees: `shark-hr` (lane 1) · `shark-hr-b` (lane 2), each with its OWN node_modules, env copied from `shark-pos-p11` (never printed).
> Branch names in use (VPS runner rule): `wip/pos-hr-<wo>-oracle` → `wip/pos-hr-<wo>`. Never push main/session/pos/rc/hotfix. Push `session/hr` only from the controller.
> DB = QC4 only (`ep-frosty-lab`), shared with the POS session; gate lock `/tmp/shark-gate-qc4.lock`. Other sessions alive on this VPS: POS (account B) and CRM — never touch `shark-pos*`, `shark-crm*`, `shark-in-th`, `shark-hf*`.
> Lane cap = 2 parallel agents (owner's standing rule). Quality rules: oracle first → builder → controller re-run → reviewer → hunter (money WOs).

## Plan of lanes (7 Oct 2026)
- Lane 1 (`shark-hr`): H0.1 oracle → H0.1 build → accept → merge `session/hr`.
- Lane 2 (`shark-hr-b`): H0.2 oracle (allowed in parallel per brief) → then H0.3 oracle/build (lane A, independent) while H0.2 build waits for H0.1 acceptance.
- H0.2 build starts only after H0.1 is accepted (both edit `buildRunRows`).

## Status log (UTC, from `date -u`)
- 2026-10-07T11:06Z START. Quota at start: session 4% (resets 15:30Z) · weekly 1%. Base `origin/main` f85f5455 (contains hotfix/hr-privacy afcb9bc3). Worktrees created; pnpm install in progress. No lane running yet.
- 2026-10-07T11:08:44Z Lanes launched: lane 1 = H0.1 oracle writer (Opus, `shark-hr`, `wip/pos-hr-h0.1-oracle`) · lane 2 = H0.2 oracle writer (Opus, `shark-hr-b`, `wip/pos-hr-h0.2-oracle`). Heartbeat cron every 23 min (session-only). Next: controller re-runs each oracle forced/unforced → builder H0.1 (lane 1) · lane 2 → H0.3 oracle (lane A, independent).
- 2026-10-07T11:11:17Z ⚠️ QC4 env trap: `shark-pos-p11/.env.qc4` (5 Oct) uses role `authenticator` (Neon Data API role, no table grants) → every suite CRASHes "permission denied for table Tenant". Working env = `shark-pos/.env.qc4` (role `neondb_owner`, verified Tenant count 19). Copied it into shark-hr / shark-hr-b / shark-hr-c (values never printed). POS session (p11/pos-b) still carries the authenticator env — told nobody yet (cannot write into their trees). Baseline regression re-run started.

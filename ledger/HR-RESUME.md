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
- 2026-10-07T11:22:54Z 🔴 OWNER ORDER: after the two running oracle writers finish, **lane cap = 1** (one agent at a time) until told otherwise. Order after that: controller re-run H0.1/H0.2 oracles → H0.1 builder → reviewer → hunter → accept → H0.2 builder → … → H0.3.
- 2026-10-07T11:41:25Z Both oracles delivered: H0.1 407131de (50 checks, base 11/50, forced ×1 by writer) · H0.2 6984b9f1 (52 checks, base 16/52; brief H0.2 copied to branch + OW-1..10 appended). Baseline regression on main all green (`wo-notes/hr-baseline-f85f5455.txt`). Controller re-running both oracles now; H0.1 rulings CR1–CR9 appended to hr-brief-H0.1.md (oracle branch). LANE CAP 1 from here. H0.2 OQ-1 (cancelAdjustment refuses rows bound to a DRAFT run ⇒ "แก้รายการหักแล้วกด คำนวณใหม่" impossible) = decide before H0.2 build. Next: builder H0.1 once the re-run confirms.
- 2026-10-07T11:44:27Z Controller re-run H0.1 oracle on base: unforced SKIP exit 0 · forced 50 total / 11 pass / 39 red (all for the right reasons, crashed null) · residue 0 tenants. H0.1 BUILDER launched (single lane) on `wip/pos-hr-h0.1` from d9372189. H0.2 controller re-run queued in background.
- CONTROLLER RE-RUN H0.2 oracle on base (6984b9f1): unforced SKIP exit 0 · forced 52 total / 17 pass / 35 red / crashed null (writer saw 16 — X6.3 is timing-dependent on the base, as the writer noted) · residue 0. Oracle ACCEPTED as the H0.2 spec; builder waits for H0.1 acceptance.
- H0.2 pre-rulings (apply to hr-brief-H0.2.md §7 when the H0.2 builder starts):
  - **CR-H0.2-1 (OQ-1)** `cancelAdjustment` on a row bound to a **DRAFT** run is allowed: one tx under the run's advisory lock (`hr:payroll:run:<systemId>:<periodKey>`), run re-read FOR UPDATE and must still be DRAFT with `journalEntryId NULL`; delete the row (guarded deleteMany, count check) then recompute the draft in the same tx (same internals as `recomputeDraftRun`, so Σ items = totals and the NEGATIVE_NET flag clears); audit `hr.payadjust.delete` + `hr.payroll.recompute`. Rows bound to APPROVED/PAID/REVERSED keep today's refusal. Refusal text of R3 stays as written ("แก้รายการหักแล้วกด 'คำนวณใหม่'"); the oracle may get an added check for this path (controller ORACLE-EDIT, additive only).
  - **CR-H0.2-2 (OQ-2)** no refusal of new manual adjustments for an employee excluded from that period; they stay unbound and appear in `strandedAdjustments` (visibility, not a block). Out of scope otherwise.
  - OW-1…OW-10 of the oracle writer are accepted; OW-7 actor shape = H0.1 CR2.

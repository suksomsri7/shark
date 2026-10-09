# Prompt — P1.18 S fix round 2 (F3 ruling). Controller (account A, 9 Oct 18:5xZ): head = `wip/pos-p1.18` **a0448579** (code 447dacd2) · tree **c**.

---

You are the BUILDER for the **P1.18 S fix round 2** — one finding only. Same rulings as `pos-prompt-accountB-P1.18-S.md` + `-S-fix.md`. English reports, Thai code comments. Read your "## Fix round 1" in `ledger/wo-notes/pos-P1.18.md` first.

## Ruling F3 (K4 self-approval) — final
Your fix-round-1 note is right: a one-owner shop must not strand its own OWNER-step requests. New rule in `approval/service.ts` `decide`/`bulkDecide`:
- requester = approver ⇒ `SELF_APPROVAL` **unless** (a) entity type in the existing `crm.commission` set, or (b) the approver is an **OWNER and the tenant has exactly one active OWNER membership** (count accepted/active `OWNER` memberships of the tenant inside the decision read — one query; no cache). Multi-owner tenants stay protected; a sole owner keeps working as before (`qc-member-m1.7` S6.2/S6.3 green again without editing that suite).
- Keep the K4 oracle semantics: a non-owner requester=approver still gets `SELF_APPROVAL`; add **ORACLE-EDIT K4b** in `qc-pos-p1.18` (own `test(pos P1.18): ORACLE-EDIT K4b — sole-owner self-approval allowed, second owner blocks it (reviewer F3 ruling)` commit): tenant with one OWNER ⇒ owner approves own request `ok:true`; after adding a second accepted OWNER membership (QC temp tenant, direct prisma create allowed) ⇒ the same pattern returns `SELF_APPROVAL`. Count 79 → 80; record in `pos-P1.18-oracle.md`; red-before log kept.
- Rewrite deviation 1 + the approval-owner line in `POS-OWNER-PENDING.md` (sole-owner exemption; suggestion: keep owner requests out of the chain as in O16(c) is for the approval owner to decide).

## Tree / commands
`/root/projects/shark-pos-c` on `wip/pos-p1.18` (a0448579; `git -C /root/projects/shark-pos-c status --short` must be clean). Always `git -C …` / absolute paths; pnpm/tsx inside the tree. DB: `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh <cmd>`. Typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck`. No build/server/deploy/.env/Telegram/seeds/wipes/reseed (if `qc-member-m1.7` fails at **setup** on QC4 the way m2.7/m2.8 do, report it as such and do not reseed). Scratch only under `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p118-fix2/`. Lane b runs suites on `posqc-coffee` — re-run once before calling a suite red.

## Gates before "done"
`qc-pos-p1.18` forced ×2 + unforced **80/80** (ST7 SKIP-until-U) residue 0, K4b red before · `qc-member-m1.7` (S6.x green) · `qc-crm-c3.3` 90 · `qc-approval` 16 · `qc-approval-edit` 12 · `qc-approval-wiring` 7 · `qc-bulk-ops` 13 · `qc-hf-pos-page-authz` 56 · `pnpm fitness` with/without env · `scripts/fitness-pos.mts` · typecheck 0. Logs with `tree=/root/projects/shark-pos-c head=<sha>` headers under `scratchpad/p118-fix2/runs/`.

## Done =
"## Fix round 2" in `ledger/wo-notes/pos-P1.18.md` (F3 change file:line, K4b, deviation 1, gate exit codes) · push `wip/pos-p1.18` · report ≤12 lines with the head SHA. Do not merge, do not touch `session/pos`/`main`/other trees.
Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

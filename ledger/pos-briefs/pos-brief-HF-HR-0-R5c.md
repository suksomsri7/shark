# HF-HR-0 round 5c — closing items from the final review (controller, 1 Oct 2026)

Round 5b was reviewed ACCEPT-WITH-NOTES, "ready for owner deploy decision: yes". Four items are cheap and in the hotfix's own family, so close them before the branch goes to the owner. Minimal hunks; nothing outside the list; this is the last round.

## Where / rules
- Tree `/root/projects/shark-hf3`, branch `hotfix/hr-privacy`, start at 29201662. Machine rules: `/root/projects/shark-pos/ledger/pos-briefs/pos-brief-LANE-RULES.md` (QC4 only; never read `.env`; no schema change; no prisma generate/migrate; no pnpm install; no build/server; never touch `/root/projects/shark-crm*` or `shark-in-th`; never sweep `/tmp`).
- DB suites: `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/<file>.mts`. Typecheck ONCE at the very end: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck` (exit 0). Foreground only; report once when everything is finished.
- Method: oracle checks first in `scripts/qc-hf-hr-privacy.mts` (RED on 29201662 → `ledger/wo-notes/HF-HR-0-red5c.txt`), fix, GREEN ×2, one control per fix (`-control5c.txt`). Notes: `ledger/wo-notes/HF-HR-0.md` section "Round 5c".
- CRM overlap: do not edit `approval/index.ts`; `ai/proposals.ts` not needed this round. CRM helpers write `HrPayAdjustment` (period move, withdraw, create PENDING for commissions) — read them (`crm/commissions.ts` etc.) and make sure your rules do not break their calls (they act as the system, not as a linked approver); say in the notes how each is affected.

## F1 [MAJOR, pre-existing] — a non-OWNER must not reduce what is taken off their own pay, nor delete adjustments unaudited
`hr/payroll.ts:178, :219-223`, `hr/payroll-actions.ts:224-232`, `hr/payroll-ui.tsx:248`. Proved by the reviewer: a linked non-OWNER payroll approver (a) REJECTED a DEDUCTION and an ADVANCE filed against their own row; (b) DELETED via `cancelAdjustment` a 22,000-baht DEDUCTION already approved by the OWNER on their own row (next run: `deductSatang: 0`), a PENDING deduction, and a colleague's APPROVED bonus — no own-row check, no status check, no audit row.
Rules:
1. Own-row rule (decider's account linked to the adjustment's employee row, decider not OWNER) now covers: approve (H1, any kind) AND reject of kinds that take money OFF pay (DEDUCTION, ADVANCE — enumerate the kinds from the schema/enum and classify each as "adds" or "takes off"; a kind you cannot classify is treated as takes-off) AND `cancelAdjustment`/delete of ANY kind on the own row. Same refusal text family as H1.
2. `cancelAdjustment` for everyone: writes an audit row (who, which row, kind, amount, status at deletion, employee) — use the module's existing audit helper; and an APPROVED row may be deleted only by someone who could have approved it (same permission as approve) — check what permission it requires today and say what you changed; rows already bound to a run stay undeletable as today.
3. Requester cancelling their OWN still-PENDING request (if that path exists today through the same function) keeps working for kinds that add pay; for takes-off kinds on their own row rule 1 wins.
Oracle: each reviewer case above ⇒ refused, row unchanged, run amount unchanged; OWNER can still do all; colleague approver can reject/delete the row (with audit row present); CRM commission helpers still work (run the CRM suite that covers them if it exists on this branch: `qc-crm-c3.3` was in the regression list).

## F5 [MINOR, introduced by 5b] — refusals on the payroll page must be visible
`hr/payroll-actions.ts:198-222`: `decideAdjustmentAction` returns nothing and drops `res.reason` ⇒ H1/E1/F1 refusals are silent (click, nothing happens). Return `{ok, reason}` as data and show the reason next to the row in `payroll-ui.tsx` (same pattern as H3). Same for the delete action. `"use server"` files export only async functions. Static check + "CONTROLLER-RUN owed: visual check of payroll page refusal".

## F3 [NOTE→fix, pre-existing] — no raw error text as data
`approval/service.ts:366`: `bulkDecide` returns `e.message` for unexpected errors; because it is returned as data, production does not mask it, and a raw Prisma message (file paths) can reach the screen. Expected refusals keep their Thai reasons; anything else ⇒ `console.error` with the error + a constant Thai "ระบบขัดข้องชั่วคราว ลองใหม่อีกครั้ง". Apply the same rule to any place this branch made return reasons as data (H3 `decideAction`, F5 actions, round-5 AI refusals) — list them.
Oracle: force an unexpected error (e.g. a request id of the wrong type or a stubbed failure the existing oracle style allows) ⇒ reason is the constant text, contains no `/`, no `prisma`, no ids.

## F2 [MINOR, pre-existing] — the leave and its chain request must appear together
`hr/service.ts:392 → :435`: `requestLeave` writes the leave, then the outbox event, then looks up the policy, then submits the chain request as separate statements; a direct decision 0–70 ms after the leave row exists succeeds and the chain request is still created (proved 6/6) ⇒ chain REJECTED + leave APPROVED possible. Fix ONLY if it is small and safe: create the leave and its chain request in one transaction (check whether the approval module's submit accepts a transaction client; do not edit `approval/index.ts`; if `approval/service.ts` needs an optional `client` parameter that is acceptable as a minimal additive hunk). If it needs more than ~30 changed lines or changes the outbox ordering semantics, do NOT do it — record it under "NOT covered" with the reason.
Oracle (if fixed): concurrent direct decision during `requestLeave` ⇒ either refused (chain exists) or it never sees a leave without its chain request; 6 rounds.

## Notes only
Add to "who loses behaviour": non-OWNER payroll approvers cannot reject own DEDUCTION/ADVANCE nor delete own-row adjustments; deleting APPROVED rows needs approve permission (if changed); payroll-page refusals now show a reason. Add to "NOT covered / owner decisions" (E4 widened): editing own salary profile; sole approver of a run containing own item; unlinked "ghost" employee rows with own bank account (needs maker-checker — HR V2, O17).

## Finish
Regression before (29201662) / after: the round-5 list (22 suites; see notes). Any existing check asserting a behaviour this round forbids ⇒ do not edit; list with proposed ORACLE-EDIT. Fitness 33/33 both modes. Typecheck exit 0. One commit (Thai subject, usual Co-Authored-By line; `--no-verify` after running fitness through iso.sh), push `hotfix/hr-privacy`; never push main.
Report (English, compact): head sha + oracle total first; per item file:line; RED/GREEN/control; regression; who loses behaviour; NOT covered; CONTROLLER-RUN owed; decisions for the controller.

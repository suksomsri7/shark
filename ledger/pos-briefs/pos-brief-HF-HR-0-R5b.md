# HF-HR-0 round 5b — last items from the round-5 review (controller, 1 Oct 2026)

Round 5 was reviewed ACCEPT-WITH-NOTES (nothing CRITICAL/MAJOR introduced). One older MAJOR of the same family remains, plus small items. Close them so the branch can go to the owner. Minimal hunks; nothing outside the list.

## Where / rules
- Tree `/root/projects/shark-hf3`, branch `hotfix/hr-privacy`, start at dc9e04c9. Machine rules: `/root/projects/shark-pos/ledger/pos-briefs/pos-brief-LANE-RULES.md` (QC4 only; never read `.env`; no schema change; no prisma generate/migrate; no pnpm install; no build/server; never touch `/root/projects/shark-crm*` or `shark-in-th`; never sweep `/tmp`).
- DB suites: `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/<file>.mts`. Typecheck ONCE at the very end: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck` (exit 0). Foreground only; report once when everything is finished.
- Method: oracle checks first in `scripts/qc-hf-hr-privacy.mts` (RED on dc9e04c9 → `ledger/wo-notes/HF-HR-0-red5b.txt`), fix, GREEN ×2, one control per fix (`-control5b.txt`). Notes: `ledger/wo-notes/HF-HR-0.md` section "Round 5b".
- CRM overlap: do not edit `approval/index.ts`; in `ai/proposals.ts` stay away from ~:960-:1000.

## H1 [MAJOR, pre-existing] — nobody (except the OWNER) approves a pay adjustment for their own employee row
`hr/payroll.ts:167` `decideAdjustment` checks who FILED the adjustment, not whose pay it is. Proved by the reviewer: a payroll approver (STAFF with payroll access) linked to their own employee row approved a 50,000-baht BONUS that a MANAGER filed for that row; it flowed into that row's payroll item. Rule: refuse approve when the adjustment's employee row is linked to the decider, unless the decider's role is OWNER (reject stays allowed for everyone who may decide — rejecting your own bonus harms nobody; say so in the notes). Apply to every path that approves an adjustment (single action, bulk, AI proposal kind if one exists, any other caller of `decideAdjustment` or direct `hrPayAdjustment.update` to APPROVED — enumerate them in the notes). Refusal text in the same family as R5.1 ("อนุมัติรายการของตัวเองไม่ได้ — ให้ผู้อนุมัติคนอื่นหรือเจ้าของร้านตัดสิน"). Also check the payroll RUN approval: can the same person be the only approver of a run that contains their own item? Do not change that here — report it with who-can-do-what so the owner can decide (HR V2).
Oracle: linked payroll approver × own row (filed by a MANAGER) ⇒ refused, row stays PENDING, payroll item unchanged; same approver × colleague's row ⇒ approved; OWNER × own row ⇒ approved; bulk with own + others ⇒ own refused, others approved; self-reject allowed.

## H2 [MINOR, pre-existing] — the direct leave decision must not contradict the approval chain
`hr/service.ts:490-499`: the direct path only refuses while the chain request is PENDING or APPROVED; in the window between a chain decision and the effect that writes the leave, a direct decision can contradict it (proved: chain REJECTED then direct APPROVE ⇒ APPROVED leave). Rule: if a leave has ANY approval request (any status), the chain owns the decision — the direct path refuses with a Thai message pointing to the approvals page. Exception only if the code already has an explicit "chain cancelled / policy removed" state — then say which statuses release the leave and why.
Oracle: chain REJECTED + direct APPROVE ⇒ refused; chain APPROVED + direct REJECT ⇒ refused; leave with no chain request ⇒ direct path works as before.

## H3 [MINOR] — the single approve button must show why it refused (ruling D2)
The single web approve/reject control on the approvals page gives no feedback when `decide` returns `{ok:false, reason}` (the request just stays). Show the reason next to the row (the bulk path already returns reasons — follow its pattern). Server actions must RETURN the refusal as data (thrown errors are replaced by a generic text in production). `"use server"` files export only async functions. No oracle can see the screen ⇒ add a static check that the component reads the reason, and list "CONTROLLER-RUN owed: visual check of approvals page refusal".

## H4 [MINOR, introduced by round 5] — the OT form must not block payroll viewers
`hr/PayAdjustForm.tsx:68` `step="0.25" min="0.25"` makes the browser refuse 0.1 h / 1.3 h, which the server still accepts from payroll viewers. Use `step="any"` (keep a sensible `min`) and a short hint text "กรอกทีละ 0.25 ชม." — the server rule stays the only gate.

## H5 [NOTE] — OT hours upper bound for payroll viewers
Payroll viewers filing 1e6 h get a raw Prisma overflow error. Apply the same 744 h maximum to everyone; viewers get a specific Thai message (they may see specifics), non-viewers keep the constant refusal.

## Notes only (no fix; copy into "NOT covered")
- A requester who cannot view payroll cannot cancel their own pending OT/adjust rows (HR V2: "cancel my request").
- Rates above ~2,886,402 satang/h: 744 h overflows ⇒ rate recoverable to ~0.1% in ~12 requests (accepted under D1; fix = store amounts in bigint, schema change).
- A 1 satang/h rate is distinguishable from "no profile" at 0.5 h (harmless).
- `ai/plans.ts` human-decider list covers HR kinds only; other modules' kinds fail safe.
- R5.1 does not cover `crm.commission` requests (CRM has its own check).
- Double-click grant of the same account to the same employee writes two audit rows.
- D3 / O16 (linked sole OWNER's own leave in a chain) = owner decision.

## Finish
Regression before (dc9e04c9) / after: the same list as round 5 (see notes). Any existing check that asserts a behaviour this round forbids ⇒ do not edit the suite; list it with the proposed ORACLE-EDIT. Fitness 33/33 both modes. Typecheck exit 0. One commit (Thai subject, usual Co-Authored-By line; `--no-verify` allowed after running fitness through iso.sh), push `hotfix/hr-privacy`; never push main.
Report (English, compact): head sha + oracle total first; per item file:line; RED/GREEN/control; regression; who loses behaviour; NOT covered; CONTROLLER-RUN owed; decisions for the controller.

# HF-INV-1 round 3b — close the reviewer's findings (controller, 1 Oct 2026)

Small follow-up round on the inventory hotfix. Round 3 was reviewed ACCEPT-WITH-NOTES; this round closes the one MAJOR (pre-existing, privacy) and three small items. Nothing else.

## Where / rules
- Tree `/root/projects/shark-hf5`, branch `hotfix/inventory-atomic`, start at 13ac174c. Machine rules: `/root/projects/shark-pos/ledger/pos-briefs/pos-brief-LANE-RULES.md` (QC4 only; never read `.env`; no prisma generate/migrate; no pnpm install; no build/server; never touch `/root/projects/shark-crm*` or `shark-in-th`; never sweep `/tmp`).
- DB suites: `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/<file>.mts`. Typecheck ONCE at the very end: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck` (must exit 0). Everything foreground; report once, when all of it is finished.
- Do NOT touch `src/lib/modules/account/gl.ts`, `account/service.ts`, `src/lib/ai/**`, `src/lib/modules/member/**` (read only), or any file outside the list below unless a check forces it (then say so).
- Method as in rounds 1–3: write the new oracle checks FIRST, record RED on 13ac174c (`ledger/wo-notes/HF-INV-1-red3b.txt`), then fix, GREEN ×2, and a control run per fix (revert that fix only ⇒ only its checks go red) in `HF-INV-1-control3b.txt`. Notes in `ledger/wo-notes/HF-INV-1.md` section "Round 3b".

## B1 [MAJOR] — report builder "customers" dataset must not show more than the member module shows
Files: `src/lib/modules/reports/actions.ts`, `src/lib/modules/reports/service.ts`. Reviewer's evidence: a MANAGER limited to branch u1, and a STAFF at u1 holding only `member.loyalty.stamp`, both get every member of the shop (incl. branch u2) with FULL phone numbers on screen, CSV and groupBy; the member module gives them 1 row with `081-xxx-1111`, and `exportMembers` refuses without `member.customer.export`.
Required rule (the member module is the authority — read `member/list.ts` `buildWhere`/`actorScopeWhere`, `maskPhone`, `exportMembers`, and `member/access.ts`):
1. **Row scope**: the customers dataset returns exactly the rows the member list would return for that actor (same branch scope as `actorScopeWhere`, same exclusion of MERGED/other member systems if the list excludes them — say in the notes what you mirrored and what the dataset intentionally still differs in).
2. **Phone (and every other field the member list masks or does not show — enumerate the dataset's projection against the list and say which)**: masked with the member module's own masking unless the actor passes the same test `exportMembers` uses (`member.customer.export`; whatever that helper grants OWNER/MANAGER, mirror it exactly). Applies to screen, CSV and groupBy identically.
3. **No side channel**: while a field is masked for the actor, that field may not be used in `filters`, `groupBy`, sort or aggregates (otherwise `contains "0811"` + row count reads the digits back). Refuse with a Thai message.
4. Prefer calling the member module's exported predicates/mask (through its public entry, if `pnpm fitness` allows the import) over copying them. If fitness forbids the import, mirror them and add an oracle check that compares the report result with the member module's own result for the same actor (rows ids + masked phone strings), so drift between the two is caught.
Oracle (`scripts/qc-hf-reports-authz.mts`): role × path matrix for customers — OWNER; MANAGER all-branch; MANAGER limited u1; STAFF u1 with `member.customer.read`; STAFF u1 with only `member.loyalty.stamp`; STAFF u1 with `member.customer.export`; STAFF without any member key (refused, as today) — × screen / CSV / groupBy: rows = member list rows; phone masked/unmasked per rule; filter/groupBy/sort on phone refused when masked; a limited actor cannot reach u2 members with any filter operator.
Say in the notes who loses a previously working behaviour.

## B2 [MINOR] — clinic dispense key must not depend on line order
File: `src/lib/modules/clinic/service.ts` (~:203-217). Reviewer probe: `[A5,B5]` fails mid-way (A cut), retry `[B5,A5]` ⇒ A cut twice. Replace the position key with a per-drug occurrence key: `clinic-<visit>-<item>-<n>` where n = (number of entries of this item already in `dispenseJson`) + (number of earlier lines of the same item in this call). A retry in any order, or with another drug inserted before, then reuses the same keys; a genuine later dispense of the same drug (already recorded) gets the next n. Check that no other code parses the key (refund uses movement ids — keep). `scripts/qc-clinic.mts` CL-2.3 uses `startsWith: clinic-<visit>-` and stays valid — do not edit that file. Oracle (atomic AT-22): reordered retry, retry with a drug inserted before, same drug twice in one call (two cuts), second dispense after record (cuts), changed-qty retry (typed conflict — unchanged).

## B3 [MINOR] — PO receive result must be visible where the user is looking
File: `src/lib/modules/inventory/PoReceiveForm.tsx` (~:48-59). On the single-warehouse path the result message renders under the trigger button, behind the open confirm dialog, and the dialog stays open. Make the outcome visible: on success close the dialog and show the success message; on failure show the message inside the dialog (or close it and show the message in place) — whichever the existing dialog component supports without changing that shared component. No oracle can see this (needs a browser) ⇒ list it under "CONTROLLER-RUN owed: visual check of PO receive (success, failure, double click)".

## B4 [NOTE] — malformed `filters`
File: `src/lib/modules/reports/service.ts` (~:180). `filters` that is not an array ⇒ Thai validation error, not a raw `TypeError`. One oracle check.

## Recorded only (do NOT fix here; copy into the notes' "NOT covered")
- An account document can hold the period's document-number counter row while waiting up to 15 s for an item; a second document can then reach the 30 s transaction timeout (generic failure, no corruption).
- Voided return + later re-link of the product to another inventory item ⇒ counts 0 against the cap (real fix = O15).
- `account/service.ts:2480` `FOR UPDATE` in `recordPayment` (CRM-owned file).
- Stale comment at `scripts/qc-clinic.mts` ~:46.

## Finish
Regression (before = 13ac174c, after = final): `qc-hf-inventory-atomic`, `qc-hf-inventory-authz`, `qc-hf-reports-authz`, `qc-clinic`, `qc-clinic-refund`, `qc-clinic-public`, `qc-report-builder`, `qc-procurement`, plus every `qc-member*` suite that does not re-seed shared data (read each file header first; skip and say so if it wipes/re-seeds). Fitness 33/33 both modes. Typecheck exit 0. One commit (Thai subject, usual Co-Authored-By line), push `hotfix/inventory-atomic`; never push main.
Report (English, compact): per item file:line, oracle counts before → after, RED/GREEN/control, regression table, who loses behaviour, NOT covered, decisions for the controller.

# P4.3 fix10 — R1 review (authz/money)

## R1 P4.3 fix10 (129aa3bc)
Reviewer: R lane · tree p11 detached `129aa3bc` · range `63116bb2..129aa3bc` (credit.ts, settings/page.tsx, CreditSettingsCard.tsx, messages th/en) · 2026-10-25T14:08:01Z · static review, no build or serve.

### Verdict: MERGEABLE (no src must-fix; G1 is a controller oracle action before the walker rerun)

Checks:
1. **saveCreditAccount is behaviour-identical** (credit.ts:96–102).
   - Before: `actor = actorOf(raw)` → `!canManageCredit(actor)` gives PERMISSION_DENIED → `!(OWNER || MANAGER && unitAccess.includes("*"))` gives PERMISSION_DENIED.
   - Now: the same `actorOf(raw)` → `canEditCreditAccounts(actor)` (:68–71), which runs `actorOf` again and then `!!actor && canManageCredit(actor) && (OWNER || MANAGER && includes("*"))`.
   - `actorOf` (:44–50) is idempotent on its own output: same userId, role, a copy of unitAccess, same permissions object. Extra fields were already dropped by the first call.
   - The refusal code is the same (PERMISSION_DENIED) and the order is the same. NOT_FOUND still comes first.
   - Outcome by actor:
     - null or malformed: denied, as before.
     - STAFF with or without pos.credit.manage: denied (role check), as before.
     - MANAGER with a unit list, including a list that names every branch: denied.
     - MANAGER with "*" plus the permission: allowed.
     - OWNER: allowed when `evaluate` grants pos.credit.manage, as before.
   - No new path: `saveCreditAccountAction` (credit-actions.ts:47–54) is unchanged and is the only caller of `saveCreditAccount`.
2. **listCreditAccounts unchanged** (:138–141, `canManageCredit(actorOf(raw))`). A single-branch MANAGER holding pos.credit.manage can still read.
3. **The page actor matches the action actor end to end:**
   - Page: `requireTenant()` (page.tsx:70) → `m = posMembership(auth.active)` (:74) → `creditActor = {userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions}` (:150).
   - Action: `requireTenant()` → `posMembership(auth.active)` → the same four fields (credit-actions.ts:40–43).
   - `canManageCredit` on the page (`evaluate(m, pos.credit.manage)`, no unitId) is the same call `canEditCreditAccounts` makes. So the page's `canEdit` equals the server's decision for every membership. A role outside OWNER/MANAGER/STAFF gets null from `actorOf`, so false on both sides.
4. **No new information exposure:** the read-only list renders the same `accounts`/`names` the page already sent to these users before fix10 (listCreditAccounts allowed them). Only the edit and add controls and the form are removed. `formNode` is gated on `p.canEdit`, and `form` can't be set without the hidden buttons. The server stays authoritative.
5. **No existing testid or i18n key changed:**
   - New key `settings.credit.allBranchesOnly` in th and en, placed after `noPermission`.
   - New testid `pos-settings-credit-all-branches-only` on `InlineNote tone="ok"`, which renders `<p role="status">` (settings-ui.tsx InlineNote). It is not clickable.
   - Existing testids are only conditionally hidden: `pos-settings-credit-edit-*`, `-add`, `-search` and `-form`.
6. **Markers and scans:** the P5.2 H6b comment is kept, with its text extended. A balanced `POS P4.3 fix10 ▸ … ◂` marker is added and the P3.6 markers are untouched. qc-pos-p5.2's H6b check is a DB behaviour test (scripts/qc-pos-p5.2.mts:1649–1697, calls `saveCreditAccountAction` as a single-branch MANAGER), not a source regex. It is green (55/55). The p3.6 single-writer scan (:582) is unaffected.
7. **pendingOwner is pre-existing:** `/root/pos-runs/tc-fix9-20261025T131926Z/qc-pos-p5.2.log` (before fix10) already reports `"pendingOwner":[{"id":"P5.2-F4","ok":false},{"id":"P5.2-F11","ok":false}]` with `total 55, passed 55, failed []`. That is identical to `/root/pos-runs/p43-fix10/tests/qc-pos-p5.2.log`, and matches the qc-pos-p5.2 header note "F4/F11 = accepted-pending-owner". Not caused by fix10.

### Findings
G1 · Med (oracle/process, not src) · scripts/pos-ui-inventory.json:~30004 (`pos-settings-credit-edit-*`), :~30032 (`pos-settings-credit-add`), and the search/form rows that follow
Why: these rows list `roles: ["owner","manager"]`, but the QC manager in the walker is single-branch (`posqc-btn-unit`), so after fix10 these controls are deliberately absent for that manager. The walker rerun will report them missing or dead for the manager cells unless the inventory changes. The new notice testid is not registered either (the builder lists it, fix10 notes:20).
Fix (controller ORACLE-EDIT before the rerun): add a "needs" line for MANAGER with unitAccess "*", or mark them hidden for single-branch managers, and register `pos-settings-credit-all-branches-only` (kind notice, roles: manager single-branch or STAFF with pos.credit.manage, tab=payments, needs hasCrm).

G2 · Info · CreditSettingsCard.tsx:236–240
Why: a STAFF member holding pos.credit.manage also sees the notice, whose text says "owner or a manager with access to all branches". That is accurate (STAFF can never save), so the wording is fine.
Fix: none.

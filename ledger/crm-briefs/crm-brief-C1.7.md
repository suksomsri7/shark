# C1.7 — Permissions (40 keys) + visibility OWN/TEAM/ALL + Teams UI
Read `crm-brief-COMMON.md` first. Contract: CRM-RUN §2 "C1.7". Spec: blueprint §6 (all), §5.9 visibility, §11.6, mockup 10 (left), decision C9.

## Facts
`src/lib/core/permissions.ts` has module `crm` with 6 keys (keep them working as-is). Membership carries `role`, `unitAccess`, `permissions`. Lesson from the member audit: an authorization answer must never come from a stale cache (team membership changes must apply on the next request); API-key actors must not inherit "implicit read".

## Deliverables
- 40 keys + Thai labels + `PERMISSION_PARAMS` (`crm._maxDealDiscountBp` default 1000, `crm._maxCommissionApproveSatang`, `crm._maxReassignPerDay`) + role defaults per §6.1; implicit read ONLY for human members holding any `crm.*` key — never for API keys (X2).
- `src/lib/modules/crm/visibility.ts`: `resolve(actor, entity, {pipelineId?})` (policy per pipeline+team → per team → per role → settings → default C9; OWNER = ALL), `visibleWhere(actor, entity, opts)`, `canSee(actor, row)`, `policies.*` CRUD. OWN = owner is me OR I am a collaborator; TEAM = teamId ∈ my teams OR owner ∈ members of teams I LEAD/belong to; ALL = unit scope only.
- Replace the local `*Where` helpers of C1.3–C1.6 (companies, contacts, deals, activities, files, objects/records, board, forecast, calendar) with `visibleWhere`; invisible ⇒ 404, visible-but-no-key ⇒ 403 Thai.
- Cross-team reassign needs `crm.deal.reassign`; above `_maxReassignPerDay` → approval `crm.reassign`.
- UI: `/app/settings/teams` (core Teams CRUD, lead, members, units, `acceptingLeads`), `/settings/visibility` (role × entity matrix + per-team/pipeline overrides) with the "transfer deals first?" warning of §11.6.

## Files you own
`src/lib/core/permissions.ts` (crm block only) · `src/lib/modules/crm/visibility.ts`, `access.ts` · the where-helper call sites inside crm services · `src/app/app/settings/teams/**` · `src/app/app/sys/[id]/crm/settings/visibility/**` · `src/components/crm/settings/**` (visibility, teams).

## Acceptance (oracle `qc-crm-c1.7`)
CRM-RUN S1–S7 (26).
X1 — the full matrix: users owner/manager/thana/nok × every list/get/board/forecast/calendar/files/records function of C1.2b–C1.6: thana sees only team phuket; GET of a krabi deal/contact/company/activity/file/record → 404; after nok reassigns a deal out of krabi she no longer sees it; removing a user from a team takes effect immediately (no cache) · X2 an API-key-style actor with no `crm.*` scope gets nothing; with read scope cannot mutate · X9 policy changes + team changes audited.
Parity: owner + nok × 2 sizes.
Regressions: all C1 oracles so far (they must now pass through visibility), `qc-member-m1.5` (saved views), `qc-acc-v2-permissions`.

## Controller addendum (19 Sep · oracle `qc-crm-c1.7` 57 checks)
The CONTRACT BLOCK in the oracle header is the API. Rulings — binding:
1. **STAFF in no team** = strict C9: sees only rows it owns or collaborates on. Earlier oracles whose STAFF fixtures rely on seeing owner-created rows will turn red — the builder REPORTS them (id + evidence); the controller ORACLE-EDITs the fixtures (put the STAFF in a team / make it the owner). Never loosen visibility to keep an old oracle green.
2. Register all 51 keys of §6.1 (the "40" in the title is stale).
3. MANAGER defaults follow §6.1 NOW: without explicit grant MANAGER lacks `crm.settings.manage · crm.api.manage · crm.object.manage · crm.visibility.manage · crm.team.manage`. Route every existing gate through `crm/access.ts` (pipelines/stages/lost-reasons settings pages + actions, objects `assertDesigner`). OWNER can grant them per member. Report any earlier oracle that breaks (same procedure as 1).
4. Signatures `resolve(ctx, actor, entity, opts)` · `canSee(ctx, actor, entity, id)` — accepted.
5. MANAGER activities = ALL (accepted). 6. Unit-restricted MANAGER rule as the oracle defines — confirmed.
7. Reassign approval effect stays with C3.2; over the cap without a policy ⇒ applied. R-C.3 key filters stay in C1.7 (inside `visibleWhere`).
8. Owned files also: `src/components/app-shell/NavDrawer.tsx` (teams link only) · `scripts/pending/probe-uiversion-gate.mts` (add `settings/visibility/page.tsx` to V2_ONLY). `crm.visibility.*` audit rows carry the policy id as `targetId`.
9. C1.7 starts after C1.6 is committed.
uiVersion: new v2 pages use `requireCrmV2Page`; `/app/settings/teams` is core (not CRM v2) — gate by `crm.team.manage`/OWNER only. D7 must include a uiVersion-1 shop check.

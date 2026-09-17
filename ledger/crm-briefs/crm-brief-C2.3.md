# C2.3 — Assignment rules
Read `crm-brief-COMMON.md` first. Contract: CRM-RUN §2 "C2.3". Spec: blueprint §5.7, §11.5, mockup 07 (right).

## Deliverables
`assignment.ts`: ordered rules; conditions on sourceKind/sourceChannel/province (Party address)/interested product (field)/company size/language/custom fields; modes FIXED, ROUND_ROBIN (cursor advanced with ONE statement `UPDATE … SET "rrCursor" = ("rrCursor"+1) % n … RETURNING`), TEAM_LEAD, LEAST_OPEN; skip users with `TeamMember.acceptingLeads=false`, users on approved leave (`hr.isOnLeave`), suspended memberships, users at `maxOpenPerUser`; fallback user from settings; nobody → unassigned + notify MANAGER; `simulate(rows)`; replace the C1.4 stub `assignment.pick`. UI `/settings/assignment`.

## Acceptance (oracle `qc-crm-c2.3`)
CRM-RUN S1–S6 (22).
X3 20 parallel `pick` calls over 4 users → 5 each (exact); LEAST_OPEN under 10 parallel creations never exceeds `maxOpenPerUser` · X1 rule cannot reference users/teams of another tenant; assignee must be able to see the record afterwards · X9 rule changes audited.
Regressions: C1.4, C1.7, `qc-hr-leave-booking`.

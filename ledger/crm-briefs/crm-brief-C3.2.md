# C3.2 — Quotas, home KPIs, leaderboard, saved views
Read `crm-brief-COMMON.md` first. Contract: CRM-RUN §2 "C3.2". Spec: blueprint §3.1 (mockup 01), §5.9 quotas, mockup 10 (quota).

Deliverables: `quotas.ts` set/list/progress (from the ledgers: stage history WON, `CrmDealPayment` COUNTED, activities) / `checkReached` (event `crm.quota.reached` ONCE per owner+period+threshold 80/100 — conditional insert, not check-then-emit) · home page: 6 KPIs, today's tasks, deals to watch, team leaderboard, lead sources, 3 AI buttons (wired in C3.4), filters + saved views for `objectKey` contact/company/deal (`MemberSavedView.objectKey/teamId`; TEAM scope now means the real Team).
Acceptance (oracle `qc-crm-c3.2`): CRM-RUN (20). X3 two payments crossing 100 % in parallel → one `crm.quota.reached` · X1 KPIs/leaderboard respect visibility; saved TEAM view visible only to that team · parity mockup 01 owner/thana × 2 sizes.
Regressions: `qc-member-m1.5` (saved views of members unchanged), C3.1.

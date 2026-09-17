# C3.1 — Reports (8 tabs) + export + schedule
Read `crm-brief-COMMON.md` first. Contract: CRM-RUN §2 "C3.1". Spec: blueprint §5.9 reports, mockup 09.

Deliverables: `reports.ts` overview · forecast (month × category, per owner/team, vs quota placeholder) · funnel from `CrmDealStageHistory` · reps · activities · lost reasons · sources/ROI (`sourceDetail.campaignId`, link/form ids; campaign cost if available) · scores — every number aggregated IN THE DATABASE (`groupBy`/`count`/`aggregate`/raw SQL); no `findMany` without `take` (member audit M13); every tab filtered by `visibleWhere` + `crm.report.view|team|all`; CSV export through `csvRow` (BOM from the response layer) as an async job for large sets; schedule (daily/weekly/monthly e-mail to staff addresses) run by the daily/hourly cron with LEASE; UI 8 tabs + filters.
Acceptance (oracle `qc-crm-c3.1`): CRM-RUN (26) — each tab equals an independent SQL computed in the oracle on the seed.
X1 thana's numbers = only his visibility; team lead = team; OWNER = all; a STAFF without `crm.report.view` gets 404 · X6 CSV neutralised (seed a deal titled `=HYPERLINK(...)`) · X5 scheduled report: overlapping cron → one e-mail · X8 exports exclude sensitive member fields; recipients restricted to staff of the tenant · query-count guard: overview ≤ 12 queries on the seed (spy on prisma).
Regressions: `qc-member-m3.8`, `qc-member-fix-s4`.

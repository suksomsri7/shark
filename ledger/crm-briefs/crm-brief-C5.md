# Phase C5 — bug hunt & security hunt (C5.1–C5.5)
Read `crm-brief-COMMON.md` and MASTER-PLAN §8 first.

## C5.1 — performance at real size (decision C26)
NEW `scripts/seed-crm-perf.mts`: separate tenant `crm-perf-qc`, 1 CRM system, 200,000 contacts, 50,000 companies, 20,000 open deals in 2 pipelines, 1,000,000 activities, 30 custom fields (10 filterable), 3 custom objects × 100,000 records; batched inserts; idempotent; `--drop` removes the tenant. NEW `scripts/qc-crm-perf.mts`: count queries with prisma `$on("query")` and time p95 over 20 runs for the budgets of blueprint §12 (board ≤ 8 queries ≤ 400 ms; contacts list with 5 filters ≤ 12 queries; forecast ≤ 2; funnel ≤ 1/stage; tracking endpoints ≤ 50 ms; inbound e-mail ≤ 1.5 s). Report N+1s and missing indexes; any new index goes through a tiny additive migration approved by the controller. Drop the perf tenant afterwards (it must not stay in the shared QC DB).

## C5.2 — six hunters (read-only agents, prompt MASTER-PLAN §11.5, ≤ 3 in parallel)
L1 authz & scope · L2 money & numbers · L3 queues/cron/redelivery/races · L4 public surface · L5 PDPA & leakage · L6 UI/UX & business correctness (every edge case of blueprint §11).

## C5.3 — verify and pin
Controller opens the code for EVERY finding (never fix from a report alone), rates it, merges duplicates, writes `ledger/AUDIT-CRM-<date>.md` in the format of `ledger/AUDIT-2026-09-16-MEMBER.md`. Independent oracle writers produce `scripts/qc-crm-fix-s<n>.mts` that are RED on current code (positive control), grouped by file ownership.

## C5.4 — fix batches
Same method as the member fix-run (`ledger/member-briefs/member-fix-COMMON.md`): disjoint file ownership per batch, builders in parallel, controller re-runs on a fresh seed, then build + screenshots of touched pages + full `qc:all`. No migrations unless the controller approves an additive one.

## C5.5 — second pass
Hunters re-read only the diff of C5.4 plus two full lenses chosen at random. Exit criteria: zero open HIGH/MEDIUM; every LOW either fixed or listed as debt with a reason and an owner-facing consequence.

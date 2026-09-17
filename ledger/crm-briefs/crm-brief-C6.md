# Phase C6 — production release (C6.1–C6.4) — controller only, no sub-agent touches production
Read MASTER-PLAN §9 first. Absolute rules: never edit `.env`; production is touched only by (a) the normal Vercel deploy of `main`, (b) read-only checks, (c) backfills in C6.2 after a dry-run AND an explicit owner "ทำ" on Telegram.

## C6.1 — production state check (read-only)
`node scripts/prodmig.cjs "<conn>"`-style read-only probe (extend the script to list `%crm_v2%`) → `crm_v2_a/b/c` applied; every tenant's CRM system still has `uiVersion` 1 → v1 pages unchanged in production (open them with the prod visual method in memory note `reference_shark_prod_visual_qc`); outbox ERROR events from `crm.*` in the last 24 h = 0.

## C6.2 — backfills
Every `scripts/crm-backfill-*.mts` with `ALLOW_PROD_BACKFILL=1 … --dry-run` → numbers per tenant to the owner via `tg` → wait for "ทำ" → real run tenant by tenant → second real run must report 0 changes.

## C6.3 — pilot
Owner names the pilot tenant → set `uiVersion` 2 for that CRM system only → production walk-through with the five roles over every page of blueprint §3 using temp contacts tagged `qc-prod-` (deleted afterwards; no real customer data changed; no real e-mail/LINE sent — use the owner's own address) → watch OpsEvent/outbox for 24 h → report. Rollback = `uiVersion` 1 (+ `bridgesEnabled` false if consumers misbehave); data stays because every migration is additive.

## C6.4 — hand-over
`ledger/HANDOVER-<date>-CRM.md` (per-work-order table with commits · real bugs found · every ORACLE-EDIT with evidence · debts · owner-pending items · rollback) + the evidence pack of MASTER-PLAN §10 + memory + Telegram. Then STOP and wait for Fable's audit.

# C2.11 — REST + AI, second set (~30 ops · 10 tools)
Read `crm-brief-COMMON.md` and `crm-brief-C1.10.md` first. Contract: CRM-RUN §2 "C2.11".

Ops for emails (threads, send, schedule, templates, user settings, routing, rotate key), sequences (CRUD, enroll, stop, stats), assignment (rules, simulate), scoring (rules, explain, recompute), tracking (links, stats, web settings), notifications prefs, automation rules (CRUD, dry-run). Tools: `crm_email_thread`, `crm_draft_email` (draft only), `crm_send_email` (proposal), `crm_enroll_sequence` (proposal), `crm_assign` (proposal), `crm_score_explain`, `crm_stale_deals`, `crm_activities_due`, `crm_records_query`, `crm_set_next_step` (proposal). Webhook events of phase C2. Regenerate docs.
Danger ops: send e-mail to >1 recipient / bulk enroll / recompute-all / rotate inbound key / delete template in use.

## Acceptance (oracle `qc-crm-c2.11`)
CRM-RUN (22) + X2 (key without `crm.email.*` cannot read threads; readonly cannot send; assistant as thana cannot read krabi threads) · X8 API-readonly bundle never returns e-mail BODY (headers/snippet only) unless the key holds `crm.email.read` explicitly · X9 danger list enforced · X3 idempotent send (same key twice → one e-mail).
Regressions: C1.10 oracle, `qc-member-m3.10`.

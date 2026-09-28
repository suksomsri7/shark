# CRM v2 — what is waiting on the owner (kept by the controller · summarise on request)

> Owner 27 Sep 2026 ~14:40 UTC: "จดบันทึกไว้ก่อน แล้วสรุปให้ผมอีกที ผมจะถามว่ามีอะไรค้างอีกไหม" — do not push these at him; summarise when he asks.

| # | when | item | default if no answer |
|---|---|---|---|
| P1 | ✅ DONE · prod LIVE 28 Sep 00:40 UTC (3677d983 = c236a490 + Vercel build fix) | approve `git push origin HEAD:main` (prod deploy) | do NOT push |
| P2 | after C3.10 qc:all | CP3 — owner tries QC shop: portal with a customer session · commission → payroll (controller sends link + steps) | wait |
| P3 | any time | Q7 unsubscribe line in 1:1 sales e-mail | YES (both kinds) |
| P4 | any time | Q8 v1-era payments counted into deals after switching to v2 | NO catch-up |
| P5 | any time | Q9–Q12 commission questions — drafts in `wo-notes/crm-C3.3.md` §"ร่าง Q9/Q10…" → move into CRM-OWNER-QUESTIONS.md | defaults in drafts |
| P6 | any time | Q13 who may press in-page AI buttons (each press = 1 AI credit) | everyone who can read CRM |
| P7 | C6 (~3–4 Oct) | approve backfill on prod · pilot shop name · install hourly/daily crontab on prod | wait (no pilot before crontab) |
| P8 | any time | new Claude account quota/weekly % — tell controller if a limit warning appears | — |
| P9 | prod env | `RESEND_WEBHOOK_SECRET` on prod (unset = webhook returns 401, safe) | leave unset |
| P10 | any time (from C5.2 L2 hunt) | Q14 — CRM 'won value': before VAT (= deal value, what quotas/home use today) or VAT-inclusive (what paid-invoice deals use today)? Both surfaces must use one basis | default: **before VAT** everywhere |
| P11 | any time (from C5.2 L4 hunt) | Q15 — `/l/<code>` short links let any shop redirect to any site on shark.in.th (abuse ⇒ whole domain blocklisted ⇒ every shop's CRM mail to spam). Options: (ก) separate short-link domain (ข) destination policy/allowlist + Safe Browsing check (ค) keep as is | default: (ข) destination policy + Safe Browsing |
| P12 | any time (from C5.3) | Q16 — should an API key stop working when the staff member who created it is demoted or removed? (today it keeps working with the creator's old rights) | default: **yes — keys die with their creator's access** |
| P13 | FYI (from C5.4-C review) | Commission clawback after a customer refund (credit note) is recorded as a SYSTEM row, auto-approved with an audit line and shown in the commission report — an approver cannot reject it (else a salesperson keeps commission on refunded money). With payroll link on it becomes a DEDUCTION. Tell me if you prefer approval | default: auto-approved |
| P14 | before batch F goes to prod | Vercel prod env `CRM_INBOUND_AUTHSERV_ID` = the authserv-id our inbound mail server writes in Authentication-Results. **Only set it after a live forged-twin test** (a forged header with our id must stay 'incoming'; a real Gmail BCC must show 'sent by staff') and only if the inbound provider strips incoming headers with our id or always adds its own first. Inbound provider (Resend / Cloudflare Worker) is not live yet — Resend's webhook may not pass headers at all. Until set: staff BCC copies are stored as incoming (safe, fail-closed) | leave unset (safe) |
| P15 | C6.2 (before pilot) | Two prod clean-ups to approve (scripts ready, dry-run by default): (1) count API keys with no recorded creator (they can't be checked against a creator — revoke?) · (2) revoke customer-portal access of people already removed from a company before today's fix (`backfill-revoke-ended-portal.mts`) · (3) re-derive invoices stuck 'partly paid' whose remainder is fully credited → 'paid' (no events sent) (`backfill-invoice-status.mts`) | run dry first, you approve --apply |
| P16 | FYI (outside CRM, from C5.4-B hunt) | The owner-only platform 'download shop data' (pdpa/actions.ts) exports all CRM personal data with no reason and no audit line. The CRM's own exports now require a reason + confirm. Want the same for the platform download? | default: add reason + audit (small, platform) |

Done by owner: 27 Sep — chose **4 lanes**; cleaned worktrees c12a/c20/c23/c110 (0 changes each, verified).

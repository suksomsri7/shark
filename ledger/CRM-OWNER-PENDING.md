# CRM v2 — what is waiting on the owner (kept by the controller · summarise on request)

> Owner 27 Sep 2026 ~14:40 UTC: "จดบันทึกไว้ก่อน แล้วสรุปให้ผมอีกที ผมจะถามว่ามีอะไรค้างอีกไหม" — do not push these at him; summarise when he asks.

| # | when | item | default if no answer |
|---|---|---|---|
| P1 | ✅ DONE 27 Sep 22:55 UTC (owner "push ได้") · pushed c236a490:main | approve `git push origin HEAD:main` (prod deploy) | do NOT push |
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

Done by owner: 27 Sep — chose **4 lanes**; cleaned worktrees c12a/c20/c23/c110 (0 changes each, verified).

# C0.2 — CRM facade (`index.ts`) — zero behaviour change
Read `crm-brief-COMMON.md` first.

## Facts (verified on main 6fff98d)
`src/lib/modules/crm/` has 4 files and NO `index.ts`: `service.ts` (exports: ensureCrm, createContact, createDeal, moveDeal, addActivity, completeActivity, forecast, getBoard, listContacts, listDeals, listPendingActivities, listActivities, issueQuotation, listPartyIdsWithContact, findContactByPartyId, findLatestDealForContact, findContactsForLink, setContactPartyId + types), `actions.ts`, `rules.ts`, `ui.tsx`. Outside importers today: `src/lib/modules/forms/service.ts:4` (`createContact`), the account module ("CRM" badge, F2 edge `account→crm`), `src/lib/ai/tools.ts` (`crm_create_lead`), `src/lib/member-bridges.ts` (`onCrmDealWon` reads deal/contact?). Find every importer with grep before editing.

## Deliverables
1. `src/lib/modules/crm/index.ts` exporting exactly what outside code uses today (+ types). 
2. Point every outside importer at the facade. Inside the crm module keep relative imports.
3. `scripts/fitness.mts`: add rule **F2.3** "other modules touch `crm` only via `crm/index`" (same shape as F2.2 for account).

## Files you own
`src/lib/modules/crm/index.ts` (new) · import lines only in the outside importers · the F2.3 block in `scripts/fitness.mts`.

## Acceptance
- grep proves no file outside `src/lib/modules/crm/` and `src/app/app/sys/[id]/crm/` imports `@/lib/modules/crm/service|rules|actions`.
- fitness (both modes) green incl. F2.3; typecheck clean.
- Regressions green: `qc-crm`, `qc-crm-activity`, `qc-form`, `qc-forms-notify`, `qc-acc-v2-party`, `qc-acc-v2-contacts`, `qc-ai-tools`, `qc-member-fix-s2` (touches onCrmDealWon path).

## X-groups
N/A — pure re-export. Reviewer must confirm no logic moved.

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

## Controller addendum 2026-09-17
Re-verified on `session/crm` (base `efd8452`) with
`grep -rn "modules/crm" src/ --include=*.ts --include=*.tsx | grep -v "^src/lib/modules/crm/" | grep -v "^src/app/app/sys/\[id\]/crm/"`.

**The outside-importer list in "Facts" above is not exactly right. The real list is these SIX lines and nothing else:**
| file:line | imports | note |
|---|---|---|
| `src/app/app/sys/[id]/page.tsx:13` | `{ CrmHub }` from `@/lib/modules/crm/ui` | the system-hub page; a **UI** export, so `index.ts` must re-export `CrmHub` too (or this file keeps a documented exception — decide in the report, do not leave it silently importing `ui`) |
| `src/lib/ai/proposals.ts:25` | `* as crmSvc` from `crm/service` | the `crm_create_lead` proposal path (`proposals.ts:86,160,933`) |
| `src/lib/modules/forms/service.ts:4` | `{ createContact }` | becomes a consumer in C1.8; until then it goes through the facade |
| `src/lib/modules/account/contacts-list.ts:18` | `* as crmSvc` | |
| `src/lib/modules/account/contact-links.ts:19` | `* as crmSvc` | |
| `src/lib/modules/account/contact-profile.ts:16` | `* as crmSvc` | |

Corrections to the brief's "Facts" paragraph:
1. **`src/lib/ai/tools.ts` does NOT import the crm module.** `crm_create_lead` lives in `src/lib/ai/tools.ts:1389` as a tool *definition*; the code that reaches CRM is `src/lib/ai/proposals.ts`. Do not edit `tools.ts`.
2. **`src/lib/member-bridges.ts` does NOT import the crm module either — it reads CRM tables through prisma directly** (`prisma.crmDeal.findFirst` :619, `prisma.crmContact.updateMany` :659, inside `onCrmDealWon`). A facade cannot fix that and C0.2 must NOT try: rewriting `onCrmDealWon` is behaviour change and belongs to **C1.8** (which owns the `crm.deal.won` payload rework). Record it in your report as a known cross-module raw-prisma access that F2.3 will not catch; C1.8 closes it.
3. `* as crmSvc` namespace imports mean `index.ts` must re-export **every** symbol those three account files and `proposals.ts` actually use. List them per file in your report (grep `crmSvc\.` in each) — a missing symbol is a build break, and `next build` is the controller's step, not yours.

Scope confirmation: zero behaviour change. Moving a function, changing a signature, or "tidying" anything inside `service.ts`/`rules.ts`/`actions.ts` is out of scope and will be sent back. `index.ts` is re-exports only.

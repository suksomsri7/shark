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

## Controller addendum 2 — decisions before the builder starts (2026-09-17)
The C0.2 oracle (`scripts/qc-crm-c0.2.mts`, commit `47b0028`) is written and committed; it is SKIPPED today and must not be edited by the builder.

1. **One facade, `CrmHub` included.** `src/app/app/sys/[id]/page.tsx` gets NO exception: `index.ts` re-exports `CrmHub` too and that page imports it from the facade. Do not invent a split facade. If — and only if — re-exporting `./ui` makes the facade unloadable from a plain node/tsx process (oracle check S1.2, which the account/forms/ai server callers depend on), stop, leave it, and report it: the split is a brief change for the controller, not a builder decision.
2. **F2.3 scans all of `src/`, not just `src/lib/modules/**`.** F2.2's file list would miss two of the six real importers (`src/lib/ai/proposals.ts`, `src/app/app/sys/[id]/page.tsx`), which would make the new rule decorative. Keep F2.2's SHAPE (same matcher style, `modules/crm/(?!index)`, self-exclusion of the crm module itself) but widen the scanned files to `src/**` minus the two exempt directories (`src/lib/modules/crm/**`, `src/app/app/sys/[id]/crm/**`), and write the reason in the rule's own text. Oracle check S4.2 asserts "same shape as F2.2" — if your widening makes S4.2 red, do NOT touch the oracle: finish everything else and report it as an ORACLE-EDIT request with the exact hunk; the controller decides.
3. **`src/lib/member-bridges.ts` is out of scope** — it reaches CRM through raw prisma (`prisma.crmDeal.findFirst` :619, `prisma.crmContact.updateMany` :659 in `onCrmDealWon`), not through an import, so no facade and no F2.3 can see it. **C1.8** owns that. Do not touch it.
4. Oracle severities stay as written: S1.6 (exact export surface) and S3.6 (reads over real seed rows) are MINOR — C0.2 runs before C1.1 seeds the CRM data set. They get promoted after C1.1, not now.
5. Zero behaviour change, enforced by oracle S1.4 (`facade[s] === service[s]`, same `typeof`/`length`/`name`) and S1.5 (`index.ts` is re-exports only, no logic). A wrapper function, a bound copy or a re-declared export all fail. Plan for that from the first line.

## Controller addendum 3 — addendum 2 #1 was WRONG, corrected (2026-09-17)
The builder proved that `export { CrmHub } from "./ui"` in `index.ts` drags `ui.tsx → core/context → lib/env` into the
server graph of `ai/tools` and `account/api/registry`; `src/lib/env.ts:27` parses `process.env` at import time, so
`env -u DATABASE_URL pnpm fitness` (gate D5, second mode) goes red (F10.1 + F13 crash). Removing that one line makes
fitness green in both modes again.

I checked the repo's own convention before deciding: `src/app/app/sys/[id]/page.tsx:8–19` imports the Hub of **every**
module from `<module>/ui` — coupon · meeting · kanban · chat · inventory · hr · marketing · member · point · reward.
So the house rule is: **`index.ts` = the server surface · `ui.tsx` = the component entry point.** CRM follows its ten siblings.

**DECISION (replaces addendum 2 #1):**
1. `src/lib/modules/crm/index.ts` exports the SERVER surface only — the six functions + their types. No `CrmHub`, no `./ui` re-export.
2. `src/app/app/sys/[id]/page.tsx` goes back to `import { CrmHub } from "@/lib/modules/crm/ui";` exactly like the other ten modules.
3. F2.3 forbids `@/lib/modules/crm/{service,rules,actions}` from outside the module and ALLOWS `@/lib/modules/crm` and
   `@/lib/modules/crm/ui`. Write that reason into the rule's comment, naming the ten sibling modules as the precedent.
4. The oracle has been corrected by the CONTROLLER (`ORACLE-EDIT C0.2-S1.3/S2.1/S2.2/S2.3/S4.3`, logged in
   `ledger/CRM-RUN.md` §4). `OUTSIDE_IMPORTERS` is five files now; `DEEP` is `service|rules|actions`. Do not touch the oracle.

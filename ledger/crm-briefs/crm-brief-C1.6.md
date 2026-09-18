# C1.6 — Activities v2 + calendar + notes/files/comments + kanban links
Read `crm-brief-COMMON.md` first. Contract: CRM-RUN §2 "C1.6". Spec: blueprint §5.5, §3.8 (mockup 08, calendar part), decision C19.

## Deliverables
- `activities.ts`: logActivity (outcome validated against `settings.crm.activityOutcomes[type]`; `nextTask`; updates `lastActivityAt` of contact/deal/company and clears `stalledAt`) · complete/reschedule/update/delete (MANAGER+ or owner) · listActivities (mine|team; pending|today|week|overdue|done) · calendar(from,to,team?,mine?) — CRM activities only in this work order.
- **Notes, files, comments (C19)**: NOTE activities can be `pinned`; internal comments = NOTE with `mentions[]` (user ids) → in-app notification to mentioned users ONLY if they can see the record; `CrmFileLink` attach/list/remove on contact/company/deal/record — uploads go through the PRIVATE file path of C0.4 (`visibility: "private"`), DTOs carry `privateFileUrl(...)` links, never CDN URLs.
- Kanban: `KanbanCardLink` types DEAL/COMPANY/CRM_CONTACT/CUSTOM_RECORD via `kanban.createCardFromExternal`; cards of a deal listed in deal 360; consumer of `kanban.card.completed` completes the linked activity.
- Pages `/activities`, `/calendar` (day|week|month), files/notes blocks inside the three 360 pages (coordinate: you own only the block components; the 360 page owners from C1.3–C1.5 are done).
- Events `crm.activity.logged/completed` (3 registries).

## Files you own
`src/lib/modules/crm/activities*.ts`, `files.ts` · `src/app/app/sys/[id]/crm/activities/**`, `calendar/**` · `src/components/crm/activity/**`, `src/components/crm/files/**` · registries · kanban link rendering for the 3 new link types (smallest possible edit in the kanban link component).

## Acceptance (oracle `qc-crm-c1.6`)
CRM-RUN S1–S6 (20) + S7 notes/pin/mention + S8 file attach/list/remove.
X1 activity/file of a record the actor cannot see → 404; mention of a user who cannot see the deal produces no notification and no leak · X3 parallel `logActivity` keeps `lastActivityAt` = max; double "complete" → completed once · X4 `kanban.card.completed` consumer twice → one completion · X6 body ≤ 8,000, file mime/size allowlist, filename sanitised · X8 note bodies never in outbox payload/OpsEvent · X10 file DTO has no permanent URL; link of another viewer/tenant fails.
Regressions: `qc-kanban-k3.3`, `qc-kanban-notify`, `qc-crm-activity`, C0.4 oracle.

## Controller addendum (18 Sep · oracle `qc-crm-c1.6` 78 ids)
The CONTRACT BLOCK in the oracle header is the API. Rulings — binding:
1. "week" = rolling window Thai today 00:00 → +7 days (confirmed).
2. The builder may add ONE minimal edit to `crm/deals.ts#getDeal360` (after C1.5 is committed): `kanbanCards[]`, inside a `// CRM C1.6 ▸ … ◂` block.
3. S0.6 exception for the field engine is correct (it refuses governed keys incl. `lastActivityAt`). The company `lastActivityAt` is written through an exported `companies.touchLastActivityInTx` (a `// CRM C1.6` block at the end of `companies.ts`), single-statement `GREATEST`.
4. File removal = uploader or MANAGER+, audit row; no confirm/reason required (not an X9 op in the brief).
5. Outcome on a type without a list ⇒ VALIDATION (confirmed).
6. SVG refusal stays (stored-XSS risk on private links).
7. Mention fixtures as the oracle chose (stable after C1.7).
8. Kanban card source: reuse the closest existing `KanbanCardSourceType` value and document it in code; not checked.
Lock order (binding): tree → engine → tax → party → CrmCompany (sorted) → CrmContact (sorted) → CrmDeal (sorted).

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

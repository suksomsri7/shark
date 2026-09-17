# C1.5 — Deals v2 (service + draggable board + deal 360 + pipeline settings)
Read `crm-brief-COMMON.md` first. Contract: CRM-RUN §2 "C1.5". Spec: blueprint §5.4, §3.2–3.3 (mockups 02, 03), §11.3.

## Facts
v1: `createDeal`, `moveDeal` (emits `crm.deal.won` in tx — keep emitting, payload cleaned in C1.8), `getBoard`, `forecast`, `issueQuotation` (one-line quotation through `account.createExternalQuotation`; after C0.3 it accepts `lines[]`). `dealStateForStage`, `weightedForecast` in `rules.ts`. The kanban board drag is hand-rolled Pointer Events in `src/components/kanban/BoardView.tsx` (`beginCardDrag`, `targetAt`, `DRAG_THRESHOLD_PX`) — NOT dnd-kit. Approval entity type `crm.discount` registered by C0.3.

## Deliverables
- `deals.ts` per §5.4: createDeal · moveDeal with `STAGE_REQUIREMENTS` (requireFields/requireLines/requireQuotation → structured missing[]) · LOST needs `lostReasonId` · history rows (close previous, open next, `durationSec`) · reopen (MANAGER+, bumps `reopenedCount`) · reassign · forecast category · next step · collaborators · lines.set (value = Σ qty×unit×(1−discount); deal-level `discountBp`; above `crm._maxDealDiscountBp` → `submitForApproval(entityType "crm.discount")` and the lines stay pending) · issueQuotation from lines · issueInvoice · getDeal360 · listDeals · getBoard (per-column count/sum/weighted) · forecast aggregate in SQL. Reject `valueSatang > 2_000_000_000` with a Thai message (decision C28).
- Extract the pointer-drag logic of `BoardView.tsx` into a shared hook (e.g. `src/components/shared/usePointerBoardDrag.ts`), make the kanban board use it with NO behaviour change, and build the deals board on it (desktop columns + mobile swipe-per-stage).
- Pages: `/deals` (board | table | forecast, URL state per blueprint §2.3, saved views, bulk: reassign/tag/move/export), `/deals/[dealId]`, `/deals/new`, `/pipelines`, settings `/settings/pipelines|stages|lost-reasons`.

## Files you own
`src/lib/modules/crm/deals*.ts`, `lost-reasons.ts`, `pipelines.ts` · `src/app/app/sys/[id]/crm/deals/**`, `pipelines/**`, `settings/(pipelines|stages|lost-reasons)/**` · `src/components/crm/deal/**` · the shared drag hook + the minimal edit in `src/components/kanban/BoardView.tsx` to consume it · `src/lib/approval-effects.ts` branch `crm.discount`.

## Acceptance (oracle `qc-crm-c1.5`)
CRM-RUN S1–S8 (32).
X1 deal/pipeline/stage of another system → 404; stage must belong to the deal's pipeline; contact↔company consistency enforced · X3 **two parallel `moveDeal` on one deal** → exactly one open history row, consistent `stageId/kind`, both calls return a sane result; parallel `lines.set` → value equals one of the two line sets (never a mix) · X4 re-processing the approval-approved event applies the discount once · X6 numeric bounds (qty, price, bp 0–10000), title/notes caps, export via `csvRow` · X9 delete/archive/bulk move/bulk reassign = confirm + reason; bulk ≤ 200; audit.
Parity: owner, thana (must not see krabi deals — placeholder until C1.7: seed owns), × 2 sizes; drag testids present.
Regressions: `qc-kanban-k1.*` board suites that cover drag (find by grep "drag"), `qc-kanban-k2.1`, `qc-acc-v2-editor`, `qc-account-api-write-docs`, `qc-approval*`, `qc-crm`.

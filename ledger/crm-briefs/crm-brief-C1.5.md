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

## Controller addendum (18 Sep · oracle `qc-crm-c1.5` 103 checks)
The CONTRACT BLOCK in the oracle header (lines 21–73) is the API. Rulings — binding:
1. `crm.deal.won` payload keeps the v1 shape in C1.5 (external webhook subscribers read it); ids-only cleanup stays with **C1.8** as MASTER-PLAN says. All OTHER new `crm.deal.*` events are ids-only now.
2. Delete: no migration here ⇒ `deleteDeal` is a hard delete (lines, history, deal-contacts in the same tx) **refused (Thai) when the deal is WON or has `quotationDocId`/`invoiceDocId`**; the audit row keeps the reason + a snapshot `{title, valueSatang, stageId, companyId, contactId}`. Soft-delete column `CrmDeal.archivedAt` → **C2.0** (`crm_v2_b`) debt.
3. Confirmed as the oracle states: default discount cap 1000 bp · a new approval request per over-cap submission (idempotency key must include a per-submission id) · contact↔company link rule · reopen = confirm + reason · export without confirm · `valueSatang` net pre-VAT · moving into WON snapshots `wonValueSatang = valueSatang` (C2.7 refines).
4. `visual-crm.mts` v2 deal specs: added by the controller.
5. The builder MAY add `// CRM C1.5 ▸ … ◂` blocks to `outbox-consumers.ts`, `automation/labels.ts`, `webhooks/labels.ts`, `approval-effects.ts` (branch `crm.discount`), `crm/nav.ts`, the CRM drawer case in `src/app/app/layout.tsx`, and the crm facade.
6. Checks depending on C1.4 stay red until C1.4 lands (C1.5 builder starts after C1.4 is committed).
Lock order (binding, from `companies.ts` header): tree → engine → tax → party → CrmCompany rows (sorted) → CrmContact rows (sorted) → CrmDeal rows (sorted). Engine refuses governed deal columns — the service writes them.

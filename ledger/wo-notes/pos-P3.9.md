# P3.9 S — builder notes (account A · 17 Oct 2026) · tree `/root/projects/shark-pos-b` · branch `wip/pos-p3.9`

Base `session/pos` **3e0e0214** (product tree 688fc3ed = HF-FU2 + P3.5 S) + oracle `origin/wip/pos-p3.9-oracle` **f6df707c** merged (852f3101, ledger + suite only, no conflict).
Contract = `pos-brief-P3.9.md` §10 rulings 1–13 + CD-P39a + TEAM_SAFE_SECTIONS addendum · names table `wo-notes/pos-P3.9-oracle.md` · suite `scripts/qc-pos-p3.9.mts` (42).

## Status
- see "Gates" below (filled at the end of the card).

## Commits (wip/pos-p3.9)
| commit | what |
|---|---|
| 852f3101 | merge oracle f6df707c |
| 7078d767 | test(pos) ORACLE-EDIT G1 `pos-gates.json` + `qc-pos-p3.9` (forced) · suites 99 → 100 |
| 7a2c5e2d | feat R1 R3 R4 R5 (bridge · adapter · ops `tool` · AI layer hunks · bills.ts token · insights · inventory facade block) |
| ebd9c499 | feat R6–R10 (brief composer/loader/job · settings parser + OWNER writer · cron block · AI integration card) |
| 12028c00 | feat R11 R13 (A11 · labels · messages) |
| (ORACLE-EDIT commits) | listed in §ORACLE-EDIT |

## Files / hunks per ruling
- **R1 (ruling 1) registry tools** — `pos/api/ops/{reports,shifts,products,sales}.ts`: `tool: {name, hint}` on the 11 ops of TOOL_SPEC (op count 48 unchanged · `--check` 0, docs unchanged: the generator does not print tool names).
  - NEW `src/lib/modules/pos/api/tools.ts` (bridge · no `@/lib/ai/*` · tenantDb only): `posToolInfos · runPosTool · dispatchPosKind · posKindAccess · posDestructiveKinds · posToolScope · posToolAllowedForScopes` + `isPosKind · posKindOf · assertLegacySaleAllowed · POS_LEGACY_VOID_REASON`.
    reads = actor `assistant` built from the **asker's own Membership** (role kept · OWNER = `*` · `can` = rbac `evaluate`) → `runOpAsActor` (same scope/unit gates as REST) · API keys = `posApiKeyActor` (key scopes + unit filter) · writes = proposal `pos.<opId>` with `{opId, input, params, systemId}` · confirm = actor `user` (confirmer) · `idempotencyKey = proposalId` · audit via runOpAsActor (`after.proposalId`).
    path args `/sales/{id}`→`saleId` · `/products/{id}`→`productId` · `/shifts/{id}`→`shiftId` · CD-6 `days` mapped to `from/to` for sales_summary/sales_by_day · R2 caps: `reports.products` limit 10 · `reports.anomalies` limit 20 (capPerRule) · arrays ≤ 31 rows then halved until JSON ≤ 8 KB · contact/pay keys dropped.
  - NEW `src/lib/ai/tools-pos.ts` (thin adapter) `posTools()` = 11 registry tools + hand `pos_draft_po`.
  - `ai/tools.ts`: import + `...posTools()` in `registryTools()` · hand `salesSummary` / `salesByDay` / `voidSale` removed (void_sale is now the registry tool — keeping the hand one would duplicate the name; TL1).
  - `ai/skills.ts`: sales = 15 tools · summary text · `toolAllowedForApiKey` POS clause = `posToolAllowedForScopes` (replaces the P2.13 `POS_TOOL_SCOPES` map) · `assertSkillRegistryComplete` gains the POS registry ⊆ sales check.
  - `ai/tool-access.ts`: `SCOPED_MODULES` + `pos` · `moduleToolQuery` + `posToolScope` · OPEN rows `sales_summary`/`sales_by_day` removed · `HAND_ACTION_KIND` − `void_sale` (registry tool now) + `pos_draft_po`.
  - `ai/proposals.ts`: union `pos.${string}` + static `pos_draft_po` · `DESTRUCTIVE_KINDS` + `posDestructiveKinds()` · `STATIC_KIND_ACCESS.pos_draft_po = inventory/inventory.po.create` · `KIND_ACCESS` + `posKindAccess()` · one dispatch block (`isPosKind` → `dispatchPosKind`) · old `void_sale` block (posSvc.voidSale, no audit) removed · R3 guard line in `pos_create_sale`.
- **R3 (ruling 9)** `pos_create_sale` dispatch: `assertLegacySaleAllowed` — confirmer `canAccessUnit` + unit POS-linked to the system + lines that do not match a catalog product **by exact name and catalog price** at that unit (unit or all-branch, not archived) need `pos.sale.priceOverride` at the unit · `createSale(` count in proposals.ts = 1.
- **R4 (ruling 2 · CD-1 · CD-4)** `void_sale` → `sales.void` op → `voidSaleByActor` (reason ≥ 5 · POS_VOID policy · audit `pos.sale.void` ⇒ A1 counts it) · legacy PENDING `void_sale {saleId}` re-routed the same way with reason `"ยกเลิกบิลผ่านผู้ช่วย AI (คำขอเดิม)"` · confirmer userId required · `bills.ts:665` voidable sources `POS · API · AI` (one marked token).
- **R5 (ruling 8)** NEW `pos/ai-insights.ts`: `purchaseSuggestions` (D−14..D−1 by cutoff · velocity from `reportProducts` · listed when (reorderPoint > 0 ∧ onHand ≤ reorderPoint) ∨ cover < 3 days · `qty = max(1, sold14 − onHand)` · supplier = latest PoLine by PO createdAt, same inventory system) · `posStockRisks` (brief) · `draftPurchaseOrder` (confirm → `createPo` DRAFT via facade) · `inventory/index.ts` one re-export block `createPo` + types (owner line in OP).
  `pos_draft_po` proposes **one PO per proposal** = the supplier with most lines; items without supplier are listed in the tool output (`ยังไม่มีผู้ขาย`), other suppliers listed with their supplierId (arg `supplierId` re-proposes for them).
- **R6–R10** NEW `pos/ai-brief-shared.ts` (`composeBrief(input, locale, {sections?})` · `TEAM_SAFE_SECTIONS = sales · top · soldOut · openShifts` · `briefTitle` · `BRIEF_SECTIONS`) · NEW `pos/ai-brief.ts` (`loadBriefInput(ctx, recipient, date, deps?)` · `sendPosDailyBriefs({now, deadline?, tenantId?, post?, pendingApprovals?})`) · `settings-shared.ts posAiSettings` · NEW `pos/ai-settings-actions.ts` (`getPosAiSettingsAction` · `updatePosAiSettingsAction` — OWNER + `assertCan pos.settings.manage` · jsonb_set `{pos,ai}` · managerUserIds must be accepted MANAGERs · audit `pos.settings.updated {section:"ai"}`) · `cron/hourly/route.ts` one block (injects `pendingApprovals` = approval `listPending(...).length` per recipient) · `pos-integrations.ts` AI facts live + card `LINKED` when `ai.enabled` else `OFF`.
- **R11 (ruling 6 · CD-5)** `settings-shared.ts` A11 rule/default `{count:3}` (clamped like A1–A10) · `reports.ts reportAnomalies` A11 block + `ANOMALY_RULE_LABEL_TH.A11` · `report-print-shared.ts` en label · `GeneralSettings.tsx` A11 field row · `ReportsClient.tsx` A11 group.
- **R13** messages th/en: `pos.ai.brief.*` · `pos.ai.tools.*` · `pos.settings.ai.*` · `pos.report.anomaly.rules.A11` · `pos.settings.general.anomaly.{countUnit,hint}.A11`.

## Behaviour changes (announce — OP line added)
- Members **without `pos.report.view`** (cashiers, staff without report rights) and the **scheduled-task** system actor no longer get POS totals from `sales_summary` / `sales_by_day` (refused; tools not offered). Figures are now business-day (shop cutoff), unit-scoped, refunds/voids netted — the old tools summed `grandTotal` of PAID bills by `createdAt` for the whole shop.
- AI voids need a reason (≥ 5 chars), follow the POS_VOID approval policy (over-threshold = approval request, bill stays PAID) and write `pos.sale.void` audit (A1 counts them). AI-opened bills can now be voided (also from the bills drawer path).
- Legacy `pos_create_sale`: the confirmer must have the branch and the branch must be POS-linked; lines whose name+price do not match the branch catalog need `pos.sale.priceOverride`.
- API keys: POS tools are scope-gated by `op.action` (`sales_summary`/`sales_by_day` ⇐ `pos.report.view` — was `pos.sale.read|create`). Scope-less general keys keep `sales_summary`/`sales_by_day`/`void_sale`/`pos_create_sale` (CD-7). Because `pos` is now a SCOPED module, a general key can no longer *propose* `pos_create_sale` through the hand-kind path (`actorCanConfirmKind` → scoped module = false) — `/api/v1/ai/*` route gates unchanged (POS module keys still get `key_not_general` there; opening the route to POS keys = follow-up, not in this card).

## Deviations
- D1 `void_sale` hand tool removed too (not only the two read tools) — the registry provides `void_sale`; two tools of one name break TL1 ("toolRegistry มีทุกชื่อครั้งเดียว").
- D2 A11 unit resolution adds the shape P3.5 actually writes (`staff-pin.ts:458`: targetType `PosStaffPin`, `after {userId, byUserId, reason, deviceId}` with `deviceId` = device **code**, no unitId) → unit via `PosDevice.deviceCode` in the same POS system; `after.unitId` and targetType `PosDevice` (oracle fixture) also handled. P3.5 did not adopt CD-5's `unitId` — no edit to `staff-pin.ts` (forbidden file).
- D3 Facts of the AI card are static `live:true` (capability shipped, like other OFF cards) and the **card state** carries `ai.enabled` (LINKED/OFF) — instead of facts flipping with the setting.
- D4 Brief `pendingApprovals` comes from an injected dep (cron route → approval `listPending`); `approval/index.ts` does not export `listPending` and POS may only use the facade. Callers without the dep (oracle) get `null` (no line). `pendingProposals` = PENDING unexpired AiProposal in rooms `u~<userId>~…` (POS cannot import `ai/conversation-owner`).
- D5 `stockRisks` / purchase suggestions: rule "onHand ≤ reorderPoint" applied only when reorderPoint > 0 (items without a reorder point would flood the list).

## CONTROLLER-DECISION
- **CD-9 (red by fixture, not by code) — PR2 PR3 PR4 PR5**: the oracle's price target `สินค้าตั้งราคา` is an **all-branch** product (`scripts/qc-pos-p3.9.mts:869` `mk("price", …, 5000)` — no `unitId`) in a POS system linked to units A **and** B. Catalog rule `catalog.ts:362–387 rowWriteVerdict`: writing an all-branch row needs the permission at **every** linked branch ⇒ MANAGER(A) is refused (`PERMISSION_DENIED`, proposal FAILED) — correct catalog behaviour (P1.1 security), not something the bridge may bypass. Recommended ORACLE-EDIT (1 line): `await mk("price", "สินค้าตั้งราคา", 5000, { unitId: U.A });`. Verified on a scratch copy with exactly this line: **42/42** (×2, see Gates). Alternative: confirm PR2 as OWNER.
- **CD-10 pin**: suite default `P39_PIN=72669941` predates the P3.5 merge on this base ⇒ ST4 red on `prisma/…p35…`, `register*.ts`, `refund-consumer.ts`, `outbox-consumers.ts` (P3.5 changes, not P3.9). All runs here use `P39_PIN=3e0e0214` (this card's base) — controller re-pin at merge.
- CD-11 `/api/v1/ai/*` `general-key-gate.ts` still treats POS registry tools as "outside the 4 modules" (non-general POS keys get `key_not_general` on the route, as at base). Opening the AI route to `pos-*` keys would be a route hunk outside this card's file list — left for the controller.

## ORACLE-EDIT (each its own `test(pos)` commit · counts before → after)
(filled below)

## Lane-pin reds (expected)
- `qc-pos-p2.13` ST5 lane pin (`ai/tools.ts` diff vs merge-base) — controller re-pin at merge (CD-B1b rule).

## `--state` list for P3.9U
- reports `anomalies` with an A11 group (`pos-reports-anomaly-group-A11`) · settings general → anomaly table A11 row · integrations card AI `OFF` / `LINKED` · (U adds: 08 AI panel brief/empty/refused/AI-off · 10 AI card switch + brief sheet).

## Gates
(filled at the end)

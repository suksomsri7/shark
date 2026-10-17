# P3.9 S — builder notes (account A · 17 Oct 2026) · tree `/root/projects/shark-pos-b` · branch `wip/pos-p3.9`

Base `session/pos` **3e0e0214** (product tree 688fc3ed = HF-FU2 + P3.5 S) + oracle `origin/wip/pos-p3.9-oracle` **f6df707c** merged (852f3101, ledger + suite only, no conflict).
Contract = `pos-brief-P3.9.md` §10 rulings 1–13 + CD-P39a + TEAM_SAFE_SECTIONS addendum · names table `wo-notes/pos-P3.9-oracle.md` · suite `scripts/qc-pos-p3.9.mts` (42).

## Status (17 Oct ~02:1xZ · code head 014a075a = typechecked head · dirty 0)
- `qc-pos-p3.9` forced (QC4 · `SHARK_AI_MOCK=1` · `P39_PIN=3e0e0214`) **38/42 ×2** — red only PR2 PR3 PR4 PR5 = **CD-9** (oracle fixture vs catalog all-branch rule; code-independent). Same suite with the proposed 1-line fixture fix (scratch copy): **42/42 ×2** · `--no-db` **6/6** · residue 0 · fetch-guard 0.
- Red-before on this base (forced, P39_PIN=3e0e0214): **6/42** (ST3 ST4 PV4 PV1 Z1 Z2 green) — same as the oracle writer's red-before.

## Final (after controller rulings · 17 Oct)
- Typecheck run at **781af5d4**, dirty 0: `pnpm typecheck` with heap 8192, ISO 10500M, `/tmp/pos-gate.lock`, **exit 0**. The tree at 781af5d4 is identical to the code after the CD-9 edit c69e3b95. This note was then committed on top as a ledger-only commit.
- `qc-pos-p3.9` forced ×2 (QC4 · `SHARK_AI_MOCK=1` · `P39_PIN=3e0e0214` until the ST4 re-pin, CD-10) = **42/42 ×2**: Z2 green, residue 0, guardHits 0. `--no-db` gave **6/6**.

## Fix round 2 delivered (CD-P39d · 17 Oct) — R2 MERGEABLE · hunter CLEAN · two Lows closed
| item | commit(s) | what |
|---|---|---|
| oracle | f6eb26d8 PR13 (add · 47 → 48) · d526f7b6 BR10 (edit · 48 → 48) | red-before on 857268eb: **46/48** (PR13: proposal created for an all-branch 86 · BR10: no `(…<id8>)` suffix) |
| N6 (= R2-L1) | c60362e7 | `targetOf`: `products.availability` on an all-branch product without `unitId` ⇒ refused at propose ("สินค้านี้ขายทุกสาขา — ระบุสาขา"), no proposal |
| N7 (= R2-L2) | 089ecdb2 | `posBriefSystemName`: shop with ≥ 2 POS systems ⇒ every system's brief title carries `(…<id last 8>)` (not only on name collision) |

**Gates (fix round 2):** `qc-pos-p3.9` forced **48/48 ×2** · `--no-db` 6/6 · `qc-ai-proposals` 16/16 · fitness no-env 53/53 · QC4 53/53 · **typecheck exit 0 at 089ecdb2, dirty 0** (this notes commit on top is ledger only).

## Fix round 1 delivered (CD-P39c · 17 Oct) — R1 F1–F6 + hunter N1–N5
| item | commit(s) | what |
|---|---|---|
| oracle | 509414d4 TL9 · adc3b5e3 TL6 (edit) · f3982c7f PR11 · 817312d6 PR12 · e3bad019 AN5 · 040e33eb BR10 | 42 → 47 checks · red-before on 4b0e3ddf with all six applied: **41/47** (TL6 TL9 PR11 PR12 AN5 BR10 red by reason · Z green) |
| F2 = N1 | 943cfa90 | `ai/plans.ts PLAN_HUMAN_ONLY` + `void_sale` `pos_draft_po` · `pos.*` via `humanOnlyNote` ⇒ refused at createPlan/propose_plan and at plan start · no userId passed into plan runs |
| F1 = N3 | 135f5063 | A11 branch: `after.unitId` → `PosStaffPin.unitId` → PosDevice target → device code **only if it maps to one branch**; ambiguous skipped |
| F3 | 8a8e4919 | `SCOPELESS_LEGACY` = sales_summary · sales_by_day only ⇒ general key refused on void_sale + pos_create_sale (deliberate) · **deviation**: `POS_HAND_TOOL_SCOPES` kept — not dead: it is the scoped-key manifest gate pinned by `qc-pos-p3.9` TL7 (`toolAllowedForApiKey(pos_create_sale, pos-read) = false`) and `qc-pos-p2.13` ST5 (`pos_create_sale ⇐ pos.sale.create`); deleting it makes both red |
| F4 = N4 | 19688ddb | `targetOf()` checks `posActorCanUseUnit(asker, row.unitId)` (+ given unitId) before any summary — not found / other branch = one message, no data · card shows `สาขา <name>` / `ทุกสาขา` |
| F5 = N2 | 340481da · 5294eeea | `posBriefSystemName`: POS systems sharing a name get `(…<id4>)` in the brief title (= dedupe key; AppNotification has no data column, no migration) · empty brief (lines 0) not sent · stock risks + whole brief need `pos.report.view` on a branch linked to that system (found while writing BR10: a manager of another system's branch got a ฿0.00 brief + this system's low stock) |
| N5 | 4fe4a6bc | `pos_draft_po` lists sliced to 10 · JSON through `capPosToolResult` (bridge 8 KB cap) |
| hunter info | 935a1158 | brief job walks AI-enabled systems in id keyset pages of 200 until done / deadline · **BR11 not added** (needs > 200 AI-enabled systems on QC4) |
| F6 | ledger | OP §Inventory line: raw read-only `invItem`/`poLine`/`supplier` reads in `ai-insights.ts` |
| OP §AI | ledger | general key refused on void_sale + pos_create_sale (F3) · POS steps refused in AI plans (F2) |
| qc-ai-plan | 58a3fb19 (test) | ORACLE-EDIT PL-4.1 destructive example void_sale → cancel_appointment (POS steps now refused at createPlan) · 6/7 (CRASH) → 7/7 |

**Gates (fix round 1 · QC4 · POS lock · `P39_PIN=3e0e0214`):** `qc-pos-p3.9` forced **47/47 ×2** (Z1/Z2 green) · `--no-db` 6/6 · `qc-ai-plan` 7/7 · `qc-ai-proposals` 16/16 · `qc-ai-skills` 23/23 · `qc-ai-tools` 18/18 · `qc-ai-tools2` 8/8 · `qc-hf-apiv1-scope` 143/143 · `qc-ai-phase-a` 9/9 · `qc-ai-phase-b1` 9/9 · `qc-pos-p0.2` 56/56 · `qc-pos-p2.12` 32/33 (A11/AN checks all green · ST1 = P3.5 lane pin) · `qc-pos-p2.13` 53/54 (ST5 lane pin) · fitness no-env 53/53 · QC4 53/53 · `gen-pos-api-docs --check` 0 · **typecheck exit 0 at 58a3fb19, dirty 0** (this notes commit on top is ledger only).

## Commits (wip/pos-p3.9)
| commit | what |
|---|---|
| 852f3101 | merge oracle f6df707c |
| 7078d767 | test(pos) ORACLE-EDIT G1 `pos-gates.json` + `qc-pos-p3.9` (forced) · suites 99 → 100 |
| 7a2c5e2d | feat R1 R3 R4 R5 (bridge · adapter · ops `tool` · AI layer hunks · bills.ts token · insights · inventory facade block) |
| ebd9c499 | feat R6–R10 (brief composer/loader/job · settings parser + OWNER writer · cron block · AI integration card) |
| 12028c00 | feat R11 R13 (A11 · labels · messages) |
| d6cabf3e a2ebcf36 b3060e21 649a40d5 866b715c e3bde0b6 17f9c5f1 | test(pos) ORACLE-EDITs (table below) |
| dedd6bd4 | fix R4 legacy void_sale lookup (PosSale is system-axis — search each POS system) |

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
- **CD-9 ✅ APPROVED by the controller 17 Oct → ORACLE-EDIT c69e3b95 (1 line `qc-pos-p3.9.mts:869` · 42 → 42 checks · 38/42 → 42/42).** Was: red by fixture, not by code — PR2 PR3 PR4 PR5: the oracle's price target `สินค้าตั้งราคา` is an **all-branch** product (`scripts/qc-pos-p3.9.mts:869` `mk("price", …, 5000)` — no `unitId`) in a POS system linked to units A **and** B. Catalog rule `catalog.ts:362–387 rowWriteVerdict`: writing an all-branch row needs the permission at **every** linked branch ⇒ MANAGER(A) is refused (`PERMISSION_DENIED`, proposal FAILED) — correct catalog behaviour (P1.1 security), not something the bridge may bypass. Recommended ORACLE-EDIT (1 line): `await mk("price", "สินค้าตั้งราคา", 5000, { unitId: U.A });`. Verified on a scratch copy with exactly this line: **42/42** (×2, see Gates). Alternative: confirm PR2 as OWNER.
- **CD-10 ✅ accepted** (controller re-pins ST4 at merge · until then run with `P39_PIN=3e0e0214`) — pin: suite default `P39_PIN=72669941` predates the P3.5 merge on this base ⇒ ST4 red on `prisma/…p35…`, `register*.ts`, `refund-consumer.ts`, `outbox-consumers.ts` (P3.5 changes, not P3.9). All runs here use `P39_PIN=3e0e0214` (this card's base) — controller re-pin at merge.
- CD-11 ✅ accepted (no change) — `/api/v1/ai/*` `general-key-gate.ts` still treats POS registry tools as "outside the 4 modules" (non-general POS keys get `key_not_general` on the route, as at base). Opening the AI route to `pos-*` keys would be a route hunk outside this card's file list — left for the controller.

## ORACLE-EDIT (each its own `test(pos)` commit · counts on the P3.9 code before → after the edit)
| commit | suite | checks | before → after |
|---|---|---|---|
| 7078d767 | `pos-gates.json` | + `qc-pos-p3.9` forced (G1) | suites 99 → 100 · `qc-pos-p2.14` 60/60 |
| d6cabf3e | `fitness.mts` | F13.15 "no POS op declares tool" → ops with tool ⊆ sales skill · unique | 52/53 → 53/53 |
| a2ebcf36 | `qc-pos-p0.2` | S3.1 (⊆) · S3.5 (= 11 TOOL_SPEC ops) · S3.6 (15 live) | 53/56 → 56/56 |
| b3060e21 | `qc-pos-p1.18` | FACTS.AI true×3 · PLANNED_PHASE − AI · I8 AI OFF | 79/81 → 81/81 |
| 649a40d5 | `qc-pos-p2.13` | ST1 tool allowed on the 11 ops (+ title) · ST5 skills hunk `POS P3.9 ▸`/posToolAllowedForScopes · key cases ⇐ pos.report.view | 52/54 → 53/54 (ST5 lane pin) |
| 866b715c | `qc-pos-p2.12` | RULES + A11 · AN_DEFAULTS.A11 · AN11 unknown-rule probe A11 → A12 | 30/33 → 32/33 (ST1 lane pin) |
| e3bde0b6 | `qc-ai-phase-a` | PA-2.6/2.7 pass confirmer userId (CD-4) | 8/9 → 9/9 |
| 17f9c5f1 | `qc-ai-phase-b1` | B1-1.1 link the unit to the POS system (R3) | 8/9 → 9/9 |
Not needed (green untouched): `qc-ai-tools` TU-1.5 18/18 · `qc-ai-tools2` V2-1.3 8/8 · `qc-hf-apiv1-scope` 143/143 (CD-7 kept) · `qc-ai-skills` 23/23.

## Lane-pin reds (expected)
- `qc-pos-p2.13` ST5 (`scripts/qc-pos-p2.13.mts:534` region): `src/lib/ai/tools.ts` diff vs merge-base 05975437 (this card) **plus** `prisma/…pos_p35_staff_commission` + `outbox-consumers.ts` (already red at base 3e0e0214 = P3.5 merge) — controller re-pin.
- `qc-pos-p2.12` ST1: prisma/ + `register*.ts` + `outbox-consumers.ts` vs pin c5fc223b — P3.5 changes, red at base too (no P3.9 file) — controller re-pin.
- `qc-pos-p3.9` ST4 with the suite default pin 72669941 (CD-10) — green with `P39_PIN=3e0e0214`.
- No P3.9 diff in `prisma/`, `register*.ts`, `service.ts`, `refund*.ts`, `outbox-consumers.ts`, `pos-sale-contract.json` (ST4 green at 3e0e0214).

## `--state` list for P3.9U
- reports `anomalies` with an A11 group (`pos-reports-anomaly-group-A11`) · settings general → anomaly table A11 row · integrations card AI `OFF` / `LINKED` · (U adds: 08 AI panel brief/empty/refused/AI-off · 10 AI card switch + brief sheet).

## Gates (QC4 · POS lock · never CI · logs in scratch `p39b/{runs,final,final2}`)
- `qc-pos-p3.9` forced ×2 = 38/42 (CD-9) · scratch CD-9 copy ×2 = 42/42 · `--no-db` 6/6.
- `qc-pos-p0.2` 56/56 · `qc-pos-p2.13` 53/54 (ST5 lane pin) · `qc-pos-p1.18` 81/81 · `qc-pos-p2.12` 32/33 (ST1 lane pin) · `qc-pos-p2.14` 60/60 (G1) · `qc-pos-api-skill` 12/12.
- `qc-ai-skills` 23/23 · `qc-ai-tools` 18/18 · `qc-ai-tools2` 8/8 · `qc-ai-phase-a` 9/9 · `qc-ai-phase-b1` 9/9 · `qc-ai-plan` 7/7 · `qc-ai-proposals` 16/16 · `qc-ai-proactive` 6/6 · `qc-ai-schedule` 8/8 · `qc-hf-apiv1-scope` 143/143.
- `qc-account-api-ai-skill` 28/33 — the 5 E1-K2.x reds are the manifest's **accepted** seed-only failure ('ยังไม่ได้เปิดระบบบัญชี' on QC4) · `qc-member-m1.11` 7/10 + crash `null.nickname` at S2.2/S2.3 = `// requires: member-seed` (QC4 seed mismatch, same class as the accepted m1.7/m2.8) — it dies before its tool checks; P3.9 does not touch the member bridge; not reseeded (forbidden).
- `qc-pos-inventory` 25/25 · `qc-hf-inventory-atomic` 143/143 · `qc-hf-inventory-authz` 118/118 · `qc-account-cpa` 107/107 · money set: restaurant 6/6 · shop-refund 12/12 · hotel 5/5 · ticket 6/6 · subscription 14/14.
- `pnpm fitness` no-env 53/53 · QC4 env 53/53 · `fitness-pos` 8/8 · `gen-pos-api-docs --check` 0 (48 op) · `pnpm typecheck` (heap 8192 · ISO 10500M · /tmp/pos-gate.lock) **exit 0 at 014a075a dirty 0**.
- Note: one final round (02:05–02:08Z) had Z2 red from **another lane writing QC4** (non-posqc PosSale 503→612 · AuditLog 4068→3800 while my runs held the POS lock); re-run on a quiet DB: Z2 green ×4.

## Hunter targets (ruling 12) — where to look
- replay / concurrent confirm: `executeProposal` atomic claim PENDING→EXECUTED (ai/proposals.ts) + op `idempotencyKey = proposalId` (`posOpServiceKey`) · void vs refund race / approval pending: `voidSaleByActor` (bills.ts) unchanged except the source token · PO twice: claim + one `createPo` per dispatch · brief job vs route: `pg_advisory_xact_lock(hashtext('pos:brief:<system>:<date>'))` + title/recipient re-check inside the tx (ai-brief.ts).

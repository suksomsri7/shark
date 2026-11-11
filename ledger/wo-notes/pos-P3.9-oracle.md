# P3.9 oracle — AI tools (registry) · proposals · anomaly A11 · Daily Brief · `scripts/qc-pos-p3.9.mts`

Oracle writer (account A) · 16 Oct 2026 · tree `/root/projects/shark-pos-e` · branch `wip/pos-p3.9-oracle` from `session/pos` **72669941**.
Contract = `ledger/pos-briefs/pos-brief-P3.9.md` ⚠️1–10 · §0–§7 · **§10 rulings 1–13 (binding)**.
Suite **42 checks** = 40 + Z1–Z2: `TL1–TL8 · PR1–PR10 · AN1–AN4 · BR1–BR9 · PV1–PV4 · ST1–ST5 · Z1–Z2` (ids `P3.9-<id>`, §4 ids exactly).
Red-before = `ledger/wo-notes/P3.9-red.txt`.

## Run
- `pnpm exec tsx scripts/qc-pos-p3.9.mts --list` (no DB, no imports beyond node) · `--no-db` = ST1–ST5 + PV4 by reading files (no prisma in-process).
- QC4: `bash scripts/iso.sh env QC_FORCE=1 SHARK_AI_MOCK=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p3.9.mts`
- Without `QC_FORCE=1` the suite SKIPs (exit 0) while any of `pos/api/tools.ts · ai/tools-pos.ts · pos/ai-insights.ts · pos/ai-brief-shared.ts · pos/ai-brief.ts` is missing.
- Pins: ST4/ST5 compare with `72669941` (override `P39_PIN=<rev>` — controller re-pin at merge).
- The suite sets `process.env.SHARK_AI_MOCK = "1"` itself before any AI import; `globalThis.fetch` is a blocker (503 + counted) for the whole DB phase. No real AI provider, no Expo, no email.

## Fixture plan (temp tenant `posqc-p39-<rand>` + `-t2`, wiped in `finally`)
- T: POS system (units A, B) · INVENTORY (unit A) · T2: POS (unit X) with product "สินค้าร้านอื่น" ฿777 and one sale.
- Users with real Memberships: OWNER · MGR (MANAGER, unit A) · SUP (STAFF, A, `pos.report.view` only) · CASH (STAFF, A, `pos.sale.create` only) · NOPERM (STAFF, A, none) · OWNER2 (T2).
- Settings `pos.shift.required.register=false` (sales without a shift) · `pos.reports.anomaly.rules.A1={count:1}` (AN2) · `pos.ai={enabled:true, brief:{enabled:true, hourBkk:6, email:false, managerUserIds:[MGR, SUP, CASH]}, anomalyInBrief:true}` (SUP/CASH are STAFF ⇒ must never receive).
- Stock items W น้ำ (33 in, reorder 10) · T เสื้อ (50, reorder 60) · Z ของพอ (100, reorder 5); W sold ×2 at 12:00 on each of D−1…D−14 ⇒ onHand 5, velocity 2/day ⇒ suggestion qty `28 − 5 = 23`. Suppliers: SUP_OLD (PO 30 days ago) and SUP_NEW (PO 20 days ago) on W ⇒ latest = SUP_NEW; T has no PO ⇒ supplierId null.
- Non-stock products: ขนม ฿25 · สินค้าตั้งราคา ฿50 (PR1–PR5) · สินค้าหมด ฿30 (PR6) · barcode product (TL3) · m1…m12 (one sale each on D−2 ⇒ > 10 products for TL6).
- D−1: ขนม×2 (refund 1 → refund doc moved to D−1 15:00) · ขนม×1 voided · B ขนม×3 ×2 bills · shift on device A with เสื้อ×1 cash ฿200, closed at ฿50 counted (short ฿150), shift moved to D−1 09:00–22:00 · D−8 ขนม×4 (last week).
- A11: raw `AuditLog` rows `pos.staff.schedule_override` (actorId = approver, targetType `PosDevice`, targetId device id, after `{userId, byUserId, reason:"OUTSIDE_HOURS", deviceId, unitId}`) — MGR ×3 and OWNER ×2 on D−1 (no writer exists until P3.5).
- PushDevice rows (tenantId T) with fake Expo tokens for OWNER/MGR/SUP/CASH; the job gets an injected `post` that records `to` and answers `{status:"ok"}`.
- Today: V1 ขนม×1 (PR7 void target) · BIG เสื้อ×6 ฿1,200 (PR8 approval) — live, not moved.
- AI conversations: one per actor, id from `newConversationId({tenantId, actor})` (`u~<userId>~…`, the real creator tag) inserted with `prisma.aiConversation.create`; API-key room `k~<keyId>~…`. **Proposals are created only through `runTool(...)` with the member actor + its own conversation** (MockProvider is never even needed — no `sendMessage`), except PR4 which copies the real payload of a MGR proposal into CASH's room with `createProposal` to prove the confirmer gate. Confirm = `executeProposal(membership, {tenantId}, id, {userId, confirm2x})`; reject = `rejectProposal({tenantId, actor}, id)`.
- Times: D = today (Bangkok); job `now` = D at 05:10 / 06:10 / 06:20 / 06:40 / 09:10 / 09:20 / 09:30 Bangkok (injected); brief business date = D−1.
- Raw SQL only on temp-tenant rows: move PosSale/PosShift/PurchaseOrder `createdAt` back · insert A11 audit rows · delete brief notifications between job rounds. Z2 fingerprint excludes tenants `posqc-%` (POS suites are serialised by the POS gate lock).

## Names table (the contract the builder implements)
| What | Name / shape |
|---|---|
| bridge | `src/lib/modules/pos/api/tools.ts` — no `@/lib/ai/*` import, no raw `prisma` · exports `posToolInfos()` → `[{name, opId, write, danger, description, parameters}]` (= `POS_OPS.filter(o => o.tool)`) · `runPosTool(ctx, name, args)` → `{mode:"error",error} \| {mode:"read",result} \| {mode:"propose",kind,summary,payload}` · `dispatchPosKind(ctx, kind, payload)` → Thai note (runs the op as actor `user` = confirmer, `idempotencyKey = proposalId`) · `posKindAccess()` · `posDestructiveKinds()` · `posToolScope(name)` (= `op.action` \| null) · `posToolAllowedForScopes(name, scopes)` |
| adapter | `src/lib/ai/tools-pos.ts` `posTools(): AiTool[]` (thin, like `tools-member.ts`) · `ai/tools.ts` `import … from "./tools-pos"` + `...posTools()` in `registryTools()` and the hand-written `salesSummary`/`salesByDay` removed (no duplicate names in `toolRegistry()`) |
| ops with `tool` (11, op count stays 48) | `sales.summary→sales_summary` · `sales.byDay→sales_by_day` · `reports.products→pos_top_products` · `reports.shifts→pos_shift_report` · `shifts.xReport→pos_shift_now` · `reports.anomalies→pos_anomalies` · `reports.hourly→pos_hourly` · `products.lookup→pos_find_product` · `products.setPrice→pos_set_price` (write) · `products.availability→pos_set_availability` (write) · `sales.void→void_sale` (danger) |
| skill `sales` | 15 tools: `sales_summary sales_by_day pos_create_sale void_sale record_expense financial_summary` + `pos_top_products pos_shift_report pos_shift_now pos_anomalies pos_hourly pos_find_product pos_set_price pos_set_availability pos_draft_po` |
| tool args | path params named like the member bridge: `/sales/{id}` → `saleId` · `/products/{id}` → `productId` · `/shifts/{id}` → `shiftId`; the rest = op input (`from to unitId limit` · `priceSatang` · `available note` · `barcode unitId`) · `void_sale {saleId, reason}` — missing reason ⇒ error JSON, **no proposal** |
| kinds | `pos.products.setPrice` → `{module:"pos", action:"pos.product.setPrice"}` · `pos.products.availability` → `pos.sale.create` (ruling 7) · `pos.sales.void` → `pos.sale.void`, risk DESTRUCTIVE · `pos_draft_po` → `{module:"inventory", action:"inventory.po.create"}` (via `kindAccessOf`) · legacy kind `void_sale` still dispatchable (same path) |
| `pos_draft_po` | hand-written (systems POS+INVENTORY), args `{unitId?}` · proposes kind `pos_draft_po` for the suggestions that have a supplier; items without a supplier are **named in the tool output** (the proposal asks for them) · confirm ⇒ `inventory/index.ts` re-exported `createPo` ⇒ one DRAFT PO per confirm; second confirm = "already done" (atomic claim) |
| insights | `src/lib/modules/pos/ai-insights.ts` `purchaseSuggestions({tenantId, systemId, unitId?}, actor: RegisterActor)` → `{ok:true, suggestions:[{itemId, qty, supplierId \| null, …}]}` (array accepted too) · window = the 14 business days ending yesterday (D−14..D−1) from `reportProducts` · velocity = qty/14 · listed when `onHand ≤ reorderPoint` or `onHand / velocity < 3` · `qty = max(1, ceil(14 × velocity) − onHand)` · supplier = supplier of the latest `PoLine` (by PO `createdAt`) of that item, else `null` |
| brief composer | `src/lib/modules/pos/ai-brief-shared.ts` (pure, no prisma/db) `composeBrief(input: BriefInput, locale: "th"\|"en") → {title, lines: string[], sections: string[]}` — exact text = golden below |
| brief loader / job | `src/lib/modules/pos/ai-brief.ts` `loadBriefInput({tenantId, systemId}, recipient: RegisterActor, businessDate "YYYY-MM-DD")` → `BriefInput` (or `{ok:true, input}`) — calls the exported readers only, each refused section = `null` · `sendPosDailyBriefs({now, deadline?, tenantId?, post?})` — `tenantId` = optional filter (the oracle always passes it), `post` = push transport handed to `sendPushToUser(userId, msg, {tenantId, post})` |
| notification | `AppNotification {tenantId, recipientUserId: <recipient>, title: composeBrief.title, body: composeBrief.lines.join("\n")}` (th — no locale preference exists yet) · one per recipient per system per business date |
| settings | `settings-shared.ts` `posAiSettings(settings)` → `{enabled:false, brief:{enabled:true, hourBkk:6, email:false, managerUserIds:[]}, anomalyInBrief:true}` · invalid `hourBkk` (non-integer / outside 0–23) ⇒ 6 · `managerUserIds` = strings only, de-duplicated, order kept · writer `pos/ai-settings-actions.ts` (not driven by this oracle) |
| A11 | `POS_ANOMALY_RULES` = `A1…A11` · `POS_ANOMALY_DEFAULTS.A11 = {count: 3}` (A1–A10 unchanged) · `posAnomalyThresholds` clamps `A11.count` to 1–1000, non-integer ⇒ 3 · row `{rule:"A11", unitId, businessDate, userId: approver, refType:"USER", refId:null, count, value:count}` when ≥ count per approver/unit/day |
| other code | `inventory/index.ts` one block `// POS P3.9 ▸ … ◂` of re-exports incl. `createPo` · `bills.ts` voidable sources `POS · API · AI` · `ai/proposals.ts` `createSale(` count stays 1 · cron hourly block `// POS P3.9 ▸ … ◂` → `sendPosDailyBriefs` (not executed here) |

### BriefInput (oracle-defined)
`{businessDate, systemName, daily {netSalesSatang, billCount, avgBillSatang} | null, lastWeek {…} | null, topProducts [{name, qty, salesSatang}] | null, bottomProducts […] | null, peakHour {hour, netSalesSatang} | null, openShifts number | null, overShort [{label, overShortSatang}] | null, anomalies [{rule, count}] | null, stockRisks [{name, onHand, reorderPoint}] | null, soldOut [{name}] | null, pendingApprovals number | null, pendingProposals number | null}` — `null` = refused/disabled ⇒ no line (never "0").

### Golden rules of `composeBrief` (exact strings in the suite: `GOLDEN.F1/F2/F3`)
- title th `สรุปเช้า POS · <systemName> · <businessDate>` · en `POS morning brief · <systemName> · <businessDate>`.
- money `฿` + en-US thousands + 2 decimals; over/short signed `+฿20.00` / `-฿150.00`; joiner ` · `; anomaly count `A1 ×2`.
- order + section ids: `sales` (daily ≠ null) · `vsLastWeek` (daily and lastWeek.net > 0; `deltaBp = Math.round((net − last) × 10000 / last)` = `posDashboardCard.deltaBp`; text `+12.23%` / `-49.99%` / `0.00%`) · `top` (non-empty) · `bottom` (non-empty) · `peak` (`HH:00-HH+1:00 ฿…`) · `openShifts` (> 0) · `overShort` (non-zero rows only; none ⇒ no line) · `anomalies` (array: empty ⇒ `จุดผิดปกติ: ไม่พบ` / `Anomalies: none`) · `stock` (≤ 5 shown) · `soldOut` · `approvals` (> 0) · `proposals` (> 0).
- en bill count `1 bill` / `12 bills`; th `กะที่ยังไม่ปิด N กะ`, `รออนุมัติ N รายการ`, `ข้อเสนอ AI รอยืนยัน N รายการ`; en `Open shifts: N`, `Pending approvals: N`, `AI proposals awaiting confirmation: N`.

## Drift vs the brief at 72669941
1. **MANAGER = full rights at its units** (`core/rbac.ts:31–33` `evaluate`) ⇒ "MANAGER(A) without `pos.report.anomaly`" (§4 TL5/BR3) cannot exist, and a MANAGER always holds `pos.sale.priceOverride`. Oracle: the "no anomaly key" actor is a STAFF supervisor (A, `pos.report.view` only); the "no priceOverride" confirmer is CASHIER(A) (STAFF + `pos.sale.create`). Brief recipients stay OWNER + opted-in MANAGERs (R7) — a STAFF listed in `managerUserIds` never receives.
2. `sales.void` op input `reason` is `min(5)` (`ops/sales.ts` `voidInput`) vs R4 "≥ 3 chars" — through the op a 3–4 char reason is refused. Oracle uses ≥ 5 chars and tests "no reason ⇒ no proposal" only (CD-1).
3. Notification title per R8 is `สรุปเช้า POS · <date>`; dedupe "title exists for that recipient" would make the second POS system of one shop skip ⇒ oracle pins `· <systemName> ·` in the title (CD-2).
4. `core/user-preferences.ts` has no locale key ⇒ "brief locale = recipient preference" (R13) has nothing to read ⇒ th for everyone now.
5. No POS quiet-hours setting exists (`quiet-hours.ts` is helpers only; quiet windows live in member/CRM notification settings) ⇒ BR7 asserts push at 09:10 only; earlier rounds may be held back (CD-3).
6. `products.lookup` is barcode-only (`registerScan`); R3's "line name matches a catalog product" needs a name lookup at the unit (catalog list), not the lookup op. Oracle matches the exact `PosProduct.name`.
7. Legacy kind `void_sale` payloads are `{saleId}` without reason (`qc-ai-phase-a:71`) and confirmers without `userId` ⇒ "re-routed the same way" needs a default reason (CD-4).
8. A11's source row is written by P3.5 (unbuilt); the oracle fixes the shape it inserts (fixture plan) ⇒ CD-5.
9. `sendPosDailyBriefs` gains `tenantId` (filter) and `post` (injectable push) — needed for an isolated, network-free oracle on the shared QC4.
10. §4 PV1 "channel `commissionSatang` asserted present only in channel data": no P3.9 tool reads channels ⇒ the oracle only asserts the privacy regex is absent everywhere (`commissionSatang` does not match it).
11. Legacy `sales_summary {days}` arg: the op input is strict `{from,to,unitId,limit}`; oracle calls with `from/to` (CD-6).
12. Adding `scripts/qc-pos-p3.9.mts` trips `qc-pos-p2.14` G1 ("pos-gates.json covers every qc-pos-*") until the manifest lists it — builder ORACLE-EDIT below (this lane may not edit it).

## ORACLE-EDIT list (builder prepares each as its own `test(...)` commit · counts before/after · marker `// ORACLE-EDIT ผู้คุม POS 16 ต.ค. (P3.9 <id>)`)
| Suite:line @72669941 | Check | Why it trips | New truth |
|---|---|---|---|
| `qc-pos-p0.2.mts:169` | S3.1 | `POS_LEGACY_AI_TOOLS` = sales tool list | table ⊆ sales list (or the registry-derived set) |
| `qc-pos-p0.2.mts:178–179` | S3.5 | "no op declares tool" | ops with tool = the 11 of TOOL_SPEC |
| `qc-pos-p0.2.mts:181–182` | S3.6 | exactly 6 legacy tools | 15 tools of `sales`, all live |
| `qc-pos-p2.13.mts:65, :429` | ST1 | `hasTool` ⇒ fail | 11 ops with tool allowed (names = TOOL_SPEC) |
| `qc-pos-p2.13.mts:563–564, :1101–1103` | ST5 | hunk `POS P2.13 ▸` replaced; `sales_summary[pos.sale.read]=true` | derived clause; `sales_summary/sales_by_day ⇐ pos.report.view`, `void_sale ⇐ pos.sale.void`, `pos_create_sale ⇐ pos.sale.create` |
| `qc-pos-p2.13.mts:534` | ST5 lane pin | `ai/tools.ts` diff vs 05975437 | **controller re-pin at merge** (CD-B1b rule) |
| `scripts/fitness.mts:1154, :1181–1182` | F13.15 | "no POS op declares tool" | ops with tool == sales-skill names from the registry |
| `qc-pos-p1.18.mts:321, :323, :1475` | AI facts/card | `AI … false "P3.9"` / PLANNED | facts true when `pos.ai.enabled` (card state per brief R10) |
| `qc-pos-p2.12.mts:315, :318–329, :348, :1643` (+ iterations `:1539 :1552 :1604`) | ST3/AN11/CSV | rule list A1–A10 | A1–A11, defaults + `A11 {count:3}`, message key `report.anomaly.rules.A11` |
| `qc-ai-tools.mts:85` | TU-1.5 | raw PosSale on a unit not linked to POS + fake user `qc-owner` ⇒ op-backed read refuses / 0 | link the unit + real membership, or assert the new shape |
| `qc-ai-tools2.mts:46–47` | V2-1.3 | same cause for `sales_by_day` | same |
| `qc-ai-phase-a.mts:71–77` | PA-2.6/2.7 (likely) | legacy `void_sale {saleId}` without reason, no confirmer userId, unit unlinked | per CD-4 |
| `qc-ai-phase-b1.mts:39–44` | B1-1.1 (likely) | R3: unit must be POS-linked (`sys.createSystem` without `linkUnit`) | link the unit |
| `qc-hf-apiv1-scope.mts:284, :290` | HF-12.2/12.3 (only if CD-7 = deny) | general scope-less key on `sales_summary` | per CD-7 |
| `qc-ai-skills.mts` | SK-1.x | self-adapting (counts from registry) — expected untouched; builder re-runs to confirm | — |
| `scripts/pos-gates.json` (+ `qc-pos-p2.14` G1 manifest) | G1 | new suite file | append `qc-pos-p3.9` |
Must stay untripped (ST4 + regression): `qc-pos-p2.7 ST3 · p2.8 ST6 · p2.10 ST2 · p2.11 ST1/ST4 · p2.12 ST1 · qc-hf-fu ST1 · qc-pos-p1.6:398`.

## CONTROLLER-DECISION
- **CD-1** void reason length: R4 says ≥ 3, the op enforces ≥ 5. Rec: keep the op (one door, P2.13 contract) and have the tool refuse < 5 with the same message — oracle only uses ≥ 5 / none.
- **CD-2** notification title includes the POS system name (`สรุปเช้า POS · <system> · <date>`) — otherwise two POS systems of one shop dedupe each other. Rec: accept (golden pinned this way).
- **CD-3** quiet hours for the brief push: no POS setting exists. Rec: no quiet window for the brief (the owner chose the hour) — oracle is neutral (asserts push at 09:10 only).
- **CD-4** legacy `void_sale` PENDING proposals (no reason, maybe no confirmer userId): Rec default reason `"ข้อเสนอเดิมของผู้ช่วย AI"` for the legacy kind only + confirmer userId required (refuse with a note otherwise); ORACLE-EDIT PA-2.7 if it trips.
- **CD-5** A11 source shape (until P3.5 lands): action `pos.staff.schedule_override`, actorId = approver, after `{userId, byUserId, reason, deviceId, unitId}`; unit = `after.unitId` else `PosDevice(targetId).unitId`. P3.5's builder must write `unitId` in `after` (or targetType `PosDevice` + id).
- **CD-6** keep accepting legacy `days` on `sales_summary`/`sales_by_day` (mapped to `from = today − days + 1`)? Rec yes (models in the wild send it); not pinned.
- **CD-7** general (legacy, scope-less, unbound) API key on `sales_summary`: HF-12.2/12.3 pin "works". Rec keep (P2.13 clause `scopes.length === 0` carried into `posToolAllowedForScopes` for the two legacy read names only) ⇒ no ORACLE-EDIT in `qc-hf-apiv1-scope`.
- **CD-8** brief job scope: the oracle needs `sendPosDailyBriefs({tenantId})` as a filter (route passes none). Rec accept.

## `--list`
```
qc-pos-p3.9 — 42 ข้อ: P3.9-TL1…TL8 · P3.9-PR1…PR10 · P3.9-AN1…AN4 · P3.9-BR1…BR9 · P3.9-PV1…PV4 · P3.9-ST1…ST5 · P3.9-Z1 · P3.9-Z2
X-coverage: T=8 P=10 A=4 B=9 V=4 S=5 -=2
```

## Red-before (`ledger/wo-notes/P3.9-red.txt`)
- `--list` exit 0 (42 ids) · `--no-db` exit 1: **3/6** — ST1 (no op declares `tool`; sales skill lacks 9 names; fitness F13.15 still pins "no tool") · ST2 (bridge/adapter missing; hand `sales_summary`/`sales_by_day` still in `ai/tools.ts`) · ST5 (no `createPo` block) red; ST3/ST4/PV4 green (pins that must stay green).
- Forced QC4 (`QC_FORCE=1 SHARK_AI_MOCK=1`, host ep-frosty-lab, POS gate lock) exit 1: **6/42** — green: ST3 ST4 PV4 PV1 (guard, nothing leaks at base) Z1 Z2 · every other check red **by reason**, no crash, fixture notes 0, fetch-guard hits 0, residue 0 (336 tables × 2 tenants).
- Base behaviour the red proves (the gaps of ⚠️2/⚠️4): CASH/NOPERM/scheduled-task read whole-shop `sales_summary` ("7 วันล่าสุด"); MGR(A) gets A+B; legacy `void_sale` voids a ฿1,200 bill with no approval request and no `pos.sale.void` audit (A1 blind); legacy `pos_create_sale` opens a bill at unit B for MGR(A) and a ฿9.99 custom line for CASH without `pos.sale.priceOverride`; `void_sale` without reason still proposes. Positive controls at base: reportDailySales D−14..D−1 owner 88,280 vs manager 73,280 satang · D−1 owner 39,500.
- Typecheck `pnpm typecheck` (iso 10500M · heap 8192 · `/tmp/pos-gate.lock`, got the lock in < 2 min) **exit 0**. The suite got a key-order-insensitive compare (`C()`) after tsc had started ⇒ the final file was re-checked with a single-file `tsc -p` in scratch (extends the project tsconfig) **exit 0**. The red run above predates that edit (affected checks were red by "MISSING" anyway).

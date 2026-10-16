# P3.8 oracle — บอร์ดงาน + ห้องทีม (event → การ์ด / โพสต์ห้องทีม · C-12) · `scripts/qc-pos-p3.8.mts`

Oracle writer (account A) · 16 Oct 2026 · tree `/root/projects/shark-pos-p11` · branch `wip/pos-p3.8-oracle` from `session/pos` **72669941**.
Contract = `ledger/pos-briefs/pos-brief-P3.8.md` ⚠️1–8 · §0–§7 · **§10 rulings 1–11 (binding)**.
Suite **34 checks** = 32 + Z1–Z2: `CF1–CF3 · SD1–SD7 · SO1–SO4 · RF1–RF3 · RM1–RM5 · AN1–AN3 · PV1 · X1–X2 · FC1 · ST1–ST3 · Z1–Z2` (ids `P3.8-<id>`, §4 ids exactly; R8 lives inside RM5 as in §4).
Red-before = `ledger/wo-notes/P3.8-red.txt`.

## Run
- `pnpm exec tsx scripts/qc-pos-p3.8.mts --list` (no DB, node imports only) · `--no-db` = ST1–ST3 by reading files + `git` (no prisma in-process).
- QC4: `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p3.8.mts`
- Without `QC_FORCE=1` the suite SKIPs (exit 0) while `src/lib/pos-board-bridges.ts` or `src/lib/modules/pos/board-settings-shared.ts` is missing.
- ST base = `P38_PIN` › `git merge-base HEAD origin/session/pos` › `72669941` — other P3 cards merged into session/pos before the builder do not trip ST2/ST3 once the builder has merged `origin/session/pos`.
- R8 part of RM5 runs only when `pos/ai-brief-shared.ts` exists **and** the bridge references `ai-brief` (or `P38_R8=1`); otherwise SKIP-with-reason printed + `skippedParts` in JSON_SUMMARY (P3.9 merging later cannot turn RM5 red by itself).
- `globalThis.fetch` = blocker (503 + counted) for the whole DB phase. No LINE/email/push.

## Fixture plan (temp tenants `posqc-p38-<rand>` + `-t2`, wiped in `finally` — no seed, no `seed-kanban*`)
- T: units A, B, C linked to one POS · KANBAN system with boards **A** (central, unitId null; ต้องทำ + เสร็จ[isDoneColumn]) · **B** (unitId B; ต้องทำ + เสร็จ) · **C** (unitId C; ต้องทำ only — no done column) · **ARCH** (status ARCHIVED) — rows created with prisma directly (P1.11 I3 pattern).
- T: MEETING system with rooms **PUB** (PUBLIC, OWNER member) · **PRIV** (PRIVATE, only MGR_A member) · **ARCH** (PUBLIC, archivedAt set).
- T2: unit X + POS + KANBAN board **X** + MEETING room **X**.
- Users (real Memberships, created in this order so `managerOfUnits` is deterministic): OWNER · MGR_A (MANAGER [A]) · MGR_B (MANAGER [B]) · CASH (STAFF [A,B,C] `pos.sale.create · pos.shift.operate · pos.report.view`) · SUP (STAFF [A,B] `pos.report.view · pos.report.anomaly · kanban.board.read`; board member VIEWER on A, EDITOR on B) · OWNER2 (T2). Every user has a Thai full name that PV1 must never find on a card/room post.
- Settings: `pos.shift.required.register=false` · `pos.reports.anomaly.enabled=true` (A8 default ฿100). Board/room settings for behaviour checks are written straight into `AppSystem.settings.pos.board/.teamRoom` (the writer is tested separately in CF3).
- Devices A/B/C/X registered by the owner; shifts opened by CASH (float ฿1,000), closed with `countedCash = xReport.expected + os` (+ note); RM1 shift has one cash sale ฿100 (body compared with the real Z snapshot). Forced close = `openedAt` moved −30 h + `forceCloseStaleShifts({now, tenantId})` (the cron function itself).
- **Events are parked**: right after each close the `pos.shift.closed` OutboxEvent is set DONE (before the ~3 s `scheduleDrain` fallback fires), so background drains never apply it under later settings. The oracle then calls the **registered** consumer `consumers["pos.shift.closed"]` with the real row (fire), and SD2/SD7 replay through the real queue (row → PENDING → `drainAll()` → must end DONE).
- 86: `catalog.setAvailability` (MANUAL) then `markedAt` moved back by SQL; un-86 via `setAvailability(available:true)`.
- refund_needed: raw `PosOrder` (status REJECTED/CANCELLED, PREPAID, customerName/customerPhone fixture strings) + `PosOrderEvent {type:"refund_needed", payload:{cause, intentId, amountSatang}}` — the exact shape `order.ts:2116 addRefundNeededInTx` writes — causes `rejected_prepaid` (A) · `expired_paid` (A) · `late_payment` (B, the event-less path ⚠️3) · one `expired_paid` row 8 days old (outside the 7-day window).
- Sweep calls always pass `tenantId` (T or T2); R8 uses injected `now` (today 06:10 / 10:00 / 10:20 · tomorrow 07:10) and runs last.

## Names table (the contract the builder implements)
| What | Name / shape |
|---|---|
| root | `src/lib/pos-board-bridges.ts` — imports kanban only from `links · moves · integrations · members · templates · notify · types · access`, meeting only from `@/lib/modules/meeting` (index), no `prisma.kanban*/meeting*` writes, no raw SQL into Kanban*/Meeting* |
| consumer | `onShiftClosed(evt)` — registered as `"pos.shift.closed": withAutomation(async (evt) => … (await import("@/lib/pos-board-bridges")).onShiftClosed(evt)) // POS P3.8 ▸ … ◂` on **one line** (main step; config problems swallowed → WARN) |
| sweep | `sweepPosBoard({now, deadline?, tenantId?})` — 86 > N h · 86 cleared ⇒ close · refund_needed (7 days) · R8 brief · `tenantId` = optional filter (route passes none); cron hourly block `// POS P3.8 ▸ … ◂` (additions only) |
| manual card | `createAnomalyCard(ctx{tenantId, systemId}, actor: RegisterActor, {unitId, rule, businessDate, refType, refId})` → `{ok:true, created:boolean, cardNo, cardId?}` · `{ok:false, code}` (PERMISSION_DENIED for missing `pos.report.anomaly` **and** for board role < EDITOR) · re-reads the row from `reportAnomalies` (unknown refId ⇒ refusal) |
| reader | `posCardsForKeys(tenantId, keys[])` → `[{key, cardNo, href, completed}]` (array; `{items}` accepted) · `href = cardLink(systemId, boardId, cardId)` = `/app/sys/<kanbanSys>/kanban/b/<board>?card=<id>` · keys without a card are absent |
| writer | `savePosBoardSettings(ctx{tenantId, systemId}, actor, {board?, teamRoom?})` → `{ok:true}` · OWNER only (`PERMISSION_DENIED` otherwise) · `VALIDATION` for unknown keys, a board not ACTIVE in this tenant, a room not in `listRoomOptions(tenant, owner)` (PRIVATE without the owner / archived / other tenant), a unit not linked to this POS · audit `pos.settings.updated` · sets `teamRoom.enabledByUserId = actor.userId` (CD-4) · pos-module writer file `pos/board-settings.ts` |
| actions | `src/lib/pos-board-actions.ts` `"use server"`, async exports only: `createAnomalyCardAction` · `savePosBoardSettingsAction` (session → the two cores above) |
| parsers | `src/lib/modules/pos/board-settings-shared.ts` (pure) `posBoardSettings(settings)` / `posTeamRoomSettings(settings)` read the whole `AppSystem.settings`; unknown keys dropped · integer out of range ⇒ clamped (minAbsSatang 0–10,000,000 · hours 1–168 · briefHourBkk 0–23) · non-integer ⇒ default · `boardByUnit` ≤ 200 · booleans only `true` counts |
| defaults | `board = {enabled:false, defaultBoardId:null, boardByUnit:{}, assignManager:true, rules:{shiftDiff:{enabled:false, minAbsSatang:10000, everyClose:false, forcedClose:true}, soldOut:{enabled:false, hours:4, sources:["MANUAL","KDS","STOCK"]}, refundNeeded:{enabled:false}}}` · `teamRoom = {enabled:false, defaultRoom:null, roomByUnit:{}, posts:{shiftClose:false, showOverShort:true, dailyBrief:false}, briefHourBkk:7, enabledByUserId:null}` · room ref = `{meetingSystemId, channelId}` |
| card keys | `pos-shift:<shiftId>` · `pos-86:<unitId>:<productId>:<markId>` · `pos-refund:<orderId>` · `pos-anomaly:<rule>:<unitId>:<businessDate>:<refId \| userId>` |
| room dedupe | AuditLog `{action:"pos.teamroom.posted", targetType:"PosTeamRoomPost", targetId:<key>, actorType:SYSTEM}` in the same tx as `postSystemMessage(…, tx)` · keys `pos-room:z:<shiftId>` · `pos-room:brief:<posSystemId>:<channelId>:<businessDate>` · author `system:pos` · refused room ⇒ rollback (0 flag) |
| ops | WARN source **`pos.board`**, tenantId set, once per (system, rule, day) — unusable board (SD7) and refused room (RM4) |
| shift card | title `ตรวจเงินกะ Z#<n> · <unit name> · <deviceLabel> · <ขาด\|เกิน\|ตรงยอด> ฿<abs>` (baht = `฿` + en-US thousands, decimals only if any — kanban-bridges `baht()`) · forced: starts `กะถูกบังคับปิด Z#<n>` + contains `ยังไม่ได้นับเงิน` · description contains expected/counted/over-short/bills/sales (baht) · sourceType AUTOMATION · createdById null · first ACTIVE column · assignee = first MANAGER covering the unit (`KanbanCardAssignee` or `assigneeUserId`) · link URL ending `/app/sys/<posSys>/pos/shifts?shift=<id>` label `กะ Z#<n>` · dueAt = 12:00 of the next Bangkok day |
| 86 card | title `สินค้าหมดนานเกิน <h> ชม.: <product name> · <unit name>` · cleared ⇒ `moveCard` (system actor, force) into the first done column (`completedAt`, activity actor null) · no done column ⇒ one system comment containing `กลับมาขายแล้ว` |
| refund card | title `คืนเงินลูกค้า: ออเดอร์ <code> ฿<amount>` · cause text `ปฏิเสธหลังจ่าย` / `จ่ายแล้วไม่มีคนรับ` / `เงินเข้าหลังยกเลิก` in title or description · link URL ending `/app/sys/<posSys>/pos/orders?id=<orderId>` · board by order unit |
| anomaly card | title starts `ตรวจจุดผิดปกติ <rule label> · <unit name> · <businessDate>` (A8 label `เงินขาด/เกิน`) · description contains `ดูรายละเอียดในรายงานจุดผิดปกติ (ต้องมีสิทธิ์)` · createdById = clicking user |
| Z post | `ปิดกะ Z#<n> · <unit> · <deviceLabel> · ขาย ฿<zReport.salesTotalSatang> (<zReport.billCount> บิล)` + ` · เงินสด <ขาด\|เกิน> ฿<abs>` only when `showOverShort` and overShort ≠ 0 |
| facts | `pos-integrations.ts:60` KANBAN `stockOutShiftDiffCard`, `shiftCloseCashCheck` → `true, null` · KANBAN LINKED also when `settings.pos.board.enabled` with a resolvable board (one hunk at `:209–219`) · no MEETING card (`total: 13`) |

## Drift vs the brief / prompt at 72669941
1. Prompt names `pos-86:<productId>:<unitId>` and `pos-anomaly:<rule>:<date>:<ref>`; brief R5/R9 say `pos-86:<unitId>:<productId>:<markId>` and `pos-anomaly:<rule>:<unitId>:<date>:<refId|userId>`. The oracle follows the brief: without `markId` "re-86 ⇒ new card" is impossible under the unique `sourceKey`, without `unitId` two units' rows of one rule/day collide (CD-1).
2. R1 kanban import list is widened by `types` (type-only) and `access` (error classes) — still no `kanban/service`.
3. CF1 "spy: return before any kanban/meeting read" is not observable from a script (prisma singleton cannot be swapped) ⇒ CF1 asserts effects only (0 cards · 0 messages · 0 flags · 0 `pos.board` WARN · no throw); the R1 reviewer checks the order in code.
4. Brief names only the server action `createAnomalyCardAction` and "board ids validated in the root action"; server actions need a session ⇒ the oracle drives exported cores `createAnomalyCard` / `savePosBoardSettings` / `posCardsForKeys` (CD-2).
5. `sweepPosBoard` gets a `tenantId` filter (P3.9 CD-8 precedent) — required for an isolated oracle on the shared QC4 (CD-3).
6. refund_needed fixtures are raw rows in the writer's exact shape (three real flows need payment intents + channels + 24 h expiry); the sweep only reads the marker row and the order.
7. "drain ×2 + 2 parallel drains" = fire ×2 + `Promise.all` ×2 of the registered consumer + one replay through the real queue (`drainAll`). `drainAll` drains all of QC4 (same as `qc-pos-p1.11` I2/I3).
8. MANAGER = full rights at its units (`core/rbac.ts:31–36`) and implicit EDITOR on unit boards (`kanban/access.ts:103–105`) ⇒ the "board VIEWER" and "no `pos.report.anomaly`" actors are STAFF (SUP, CASH) — same drift as P3.9 #1.
9. R7 body for overShort = 0 is unspecified ⇒ not pinned (RM1 uses ฿120 short). Z post totals are compared with the real `PosShift.zReport` (not hard-coded).
10. "ops WARN `pos.board` once per (system, rule, day)" (R2) and "refused room ⇒ WARN once" (R7) ⇒ one source `pos.board` for both (CD-5).
11. R8 has no own id in §4 ⇒ it is the second half of RM5; until P3.9 S lands (`ai-brief-shared.ts` + bridge wiring) it is SKIP-with-reason.
12. FC1 covers the OFF path (`board.enabled:false`) and LINKED via POS rules; NO_SYSTEM stays covered by `qc-pos-p1.18` I7 (fixture tenant has a KANBAN system).
13. Adding `scripts/qc-pos-p3.8.mts` trips `qc-pos-p2.14` G1 until `pos-gates.json` lists it (ORACLE-EDIT below; this lane may not edit it).

## ORACLE-EDIT list (builder prepares each as its own `test(...)` commit · counts before/after · marker `// ORACLE-EDIT ผู้คุม POS 16 ต.ค. (P3.8 <id>)`)
| Suite:line @72669941 | Check | Why it trips | New truth |
|---|---|---|---|
| `scripts/qc-pos-p1.18.mts:318` (used by I12 `:1521`) | I12 | KANBAN `["stockOutShiftDiffCard", false, "P3.8"], ["shiftCloseCashCheck", false, "P3.8"]` | `[…, true, null]` ×2 (ruling 9) · I7 `:1464–1470` (OFF → LINKED via issueBoardId) must stay as is |
| `scripts/pos-gates.json` (+ `qc-pos-p2.14.mts:536–564` G1) | G1 | new `qc-pos-*` file | append `qc-pos-p3.8` (mode `forced`) |
| `scripts/qc-pos-p2.10.mts:221` (LANE_PIN; list `:335`) | ST2 | `outbox-consumers.ts` hunk | **controller re-pin at merge** (CD-B1b) |
| `scripts/qc-pos-p2.11.mts:267` (LANE_A_FIXED `:309`) | ST4 | same | controller re-pin |
| `scripts/qc-pos-p2.12.mts:270` (list `:359`) | ST1 | same | controller re-pin |
| `scripts/qc-pos-p2.13.mts:350` (`F.outbox :331`) | ST5 | same | controller re-pin |
| U only: `pos-ui-inventory.json` (F15.3 · `:5432` "ทั้ง 8 แท็บ") | — | new settings tab | P3.8U |
Checked untripped by reading: `qc-hf-fu.mts:41` ST1 (rule is ≤ 4 lines above `"pos.sale.voided"`; the P3.8 line is below) · `qc-pos-p1.9.mts:325–329` ST5 (regex `"pos.shift.closed":` still matches; cron still calls `forceCloseStaleShifts`) · `qc-pos-p1.9b` ST8 (no new event) · `qc-kanban-k3.3` S8.2 (hourly route still calls `sweepUnattendedChats`) · `qc-pos-p2.7` ST3 · `qc-pos-p2.8` ST6 · `qc-pos-p1.11` ST4/ST5 (pos-receipt-bridges untouched — ST3 here enforces it).

## CONTROLLER-DECISION
- **CD-1** card keys per brief (with `markId`, with `unitId`) instead of the shorter prompt forms. Rec accept.
- **CD-2** testable cores exported from the root (`createAnomalyCard`, `savePosBoardSettings`, `posCardsForKeys`) + thin `"use server"` wrappers. Rec accept.
- **CD-3** `sweepPosBoard({tenantId})` optional filter. Rec accept (route passes none).
- **CD-4** `teamRoom.enabledByUserId` is server-set to the saving OWNER (client value ignored) — R8 reloads that user and re-checks OWNER. Rec accept.
- **CD-5** single ops source `pos.board` (cards, rooms, brief), once per (system, rule, day). Rec accept.
- **CD-6** manual anomaly card when the board is not resolvable (board off / no board): refusal code not pinned — rec `NO_BOARD` (the U button is hidden then).
- **CD-7** unknown `refId` (row not in `reportAnomalies`) ⇒ any refusal, no card — rec `NOT_FOUND`; board role < EDITOR ⇒ `PERMISSION_DENIED` (pinned).
- **CD-8** R8 gating: active only when `ai-brief-shared.ts` exists and the bridge references it (`P38_R8=1` forces). If P3.9 S is already merged when the P3.8 builder starts, the controller should run with `P38_R8=1` (ruling 4 says R8 then belongs to P3.8 S).
- **W18** (already in OP): `showOverShort:true` default in a shared room — owner ack.

## `--list`
```
qc-pos-p3.8 — 34 ข้อ: P3.8-CF1…CF3 · P3.8-SD1…SD7 · P3.8-SO1…SO4 · P3.8-RF1…RF3 · P3.8-RM1…RM5 · P3.8-AN1…AN3 · P3.8-PV1 · P3.8-X1…X2 · P3.8-FC1 · P3.8-ST1…ST3 · P3.8-Z1 · P3.8-Z2
X-coverage: C=3 K=13 V=2 R=5 A=3 X=2 F=1 S=3 Z=2
```

## Red-before (`ledger/wo-notes/P3.8-red.txt`)
- `--list` exit 0 (34 ids) · `--no-db` exit 1: **1/3** — ST1 (root/actions/parsers/writer missing) · ST2 (`"pos.shift.closed"` still the no-op, no cron block) red; ST3 green (pin that must stay green).
- Forced QC4 (`QC_FORCE=1`, host ep-frosty-lab, POS gate lock) exit 1: **5/34** — green: ST3 · SD3 (฿50 ⇒ no card) · X1 (no card from a T2 board id) · Z1 · Z2; every other check red **by reason** (`MISSING:<fn>` / 0 cards / 0 messages / facts `false "P3.8"` / KANBAN OFF), no crash, fixture notes 0, fetch-guard hits 0, residue 0 (337 tables × 2 tenants, users 0).
- Positive controls at base: the A8 rows of the SD1 (unit A) and SD6 (unit B) shifts are present in `reportAnomalies` (keys printed in AN1/AN3); the RM1 sale is bound to its shift (no fixture note); PV1's detector catches planted phone/tip/commission/name/salary strings.
- Typecheck `pnpm typecheck` (iso 10500M · heap 8192 · `/tmp/pos-gate.lock`, lock free) **exit 0** — run twice (after the first draft and after the final R8-gate edit; final file checked).

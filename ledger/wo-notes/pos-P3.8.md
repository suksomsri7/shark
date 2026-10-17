# P3.8 S — builder notes (account A · lane 2 · 17 Oct 2026) · tree `/root/projects/shark-pos-p11` · branch `wip/pos-p3.8`

Base `session/pos` **42b823e9** (product tree has HF-FU2 + P3.5 S + P3.4 S + P3.9 S + P1.6-R2 fix) + oracle `origin/wip/pos-p3.8-oracle` **6db7150a** merged (c1e3cab6, no conflict).
Contract = `pos-brief-P3.8.md` §10 rulings 1–11 + CD-P38a · names table `wo-notes/pos-P3.8-oracle.md` · suite `scripts/qc-pos-p3.8.mts` (34 = 32 + Z1–Z2).
Code head (typechecked, every gate below) = **ac2f6ce1**, dirty 0. This notes commit on top is ledger-only.

## Result
- **Red-before** on 8f9f1fa1 (base + oracle + gates ORACLE-EDIT, forced, `P38_R8=1`): **5/34** (ST3 SD3 X1 Z1 Z2), RM5's R8 half red by reason (`MISSING:sweepPosBoard`, 0 flags), not SKIP.
- **`qc-pos-p3.8` forced ×2 with `P38_R8=1` at ac2f6ce1: 33/34 ×2.** `skippedParts: []` (R8 ran and is green), residue 0, guardHits 0. Only red = **ST1** with one reason: `bridges เขียน prisma.kanban*/meeting* ตรง` → CONTROLLER-DECISION **CD-P38-B1** below. `--no-db` **2/3** (same ST1).
- Earlier runs on the way: 32/34 (SD6 assignee empty) → fixed e86cdb7b · 33/34 then 32/34 (SD7 WARN +2) → fixed ac2f6ce1. Both were real concurrency gaps: in scripts `scheduleDrain` drains **immediately** (after-drain I4: no request scope), so the background drain often claims the `pos.shift.closed` row before the oracle parks it and runs the consumer in parallel with the oracle's own `fire`.
- **Typecheck** `env NODE_OPTIONS=--max-old-space-size=8192 ISO_MEM=10500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck` at **ac2f6ce1** dirty 0 → **exit 0** (2nd run of the WO; 1st at c4bc3057 found TS2339 ×7 in createAnomalyCard → 1cbc6309).

## Regression (pos-gates-all `--only`, head ac2f6ce1, dirty 0 start/end · QC4 · POS lock)
Green: `qc-pos-p1.18` 81/81 (after ORACLE-EDIT) · `qc-pos-p1.9` 53/53 (ST5) · `qc-pos-p1.9b` 22/22 (ST8) · `qc-pos-p1.11` 38/38 · `qc-pos-p2.7` 42/42 · `qc-pos-p2.8` 61/61 · `qc-pos-p2.9` 62/62 · `qc-hf-fu` 29/29 (ST1) · `qc-account-cpa` 107/107 · money set `qc-restaurant-money` 6/6 · `qc-shop-refund` 12/12 · `qc-hotel-money` 5/5 · `qc-ticket-money` 6/6 · `qc-subscription-money` 14/14 · fitness no-env 53/53 · fitness QC4 53/53 · `fitness-pos` 8/8 · `gen-pos-api-docs --check` 0 (49 op) · `qc-kanban-k3.3` 14/15 — **S8.2 green**; S9.2 red = screenshots missing in `.qc-shots/kanban/3.3` (environment, no code involved).
Lane-pin reds (expected class; every one is the single `outbox-consumers.ts:806` hunk or "new hunk without HF-FU2 marker"):
- `qc-pos-p2.10` 12/13 ST2 — `scripts/qc-pos-p2.10.mts:221` LANE_PIN 0c1a1ad1: "src/lib/outbox-consumers.ts มี hunk (+1 −1) · qc-pos-p1.18 แก้นอกบรรทัด rewardNearCustomerDisplay 1 บรรทัด" (the second part = this card's p1.18 ORACLE-EDIT).
- `qc-pos-p2.11` 33/34 ST4 — `scripts/qc-pos-p2.11.mts:267/309` "ไฟล์เลน A ถูกแตะ: outbox-consumers.ts".
- `qc-pos-p2.12` 32/33 ST1 — `scripts/qc-pos-p2.12.mts:271` "ไฟล์เลน A ถูกแตะ: lib/outbox-consumers.ts".
- `qc-pos-p2.13` 53/54 ST5 — `scripts/qc-pos-p2.13.mts:351` "src/lib/outbox-consumers.ts ถูกแก้".
- `qc-hf-fu2` 30/31 ST1 — `scripts/qc-hf-fu2.mts:191` "outbox-consumers.ts มี hunk (§4 ST1 ห้ามแตะ) · route.ts:133 · outbox-consumers.ts:806 · pos-integrations.ts:23/61/217/224 · 4 new files — ไม่มี HF-FU2".
- **Not in the prompt's list:** `qc-pos-p3.9` 47/48 (forced) and `--no-db` 5/6 — **ST4** `scripts/qc-pos-p3.9.mts:56` PIN 8bded5a7: "แก้ไฟล์ต้องห้าม: src/lib/outbox-consumers.ts" (same one-line hunk; re-pin like the others).
- **Not a pin, not this code:** `qc-pos-p2.14` 59/60 **K3** `scripts/qc-pos-p2.14.mts:515–526`: "ชุดนอกรายการ: qc-pos-p3.8.mts" — the **oracle file itself** reads `git merge-base HEAD origin/session/pos` (`qc-pos-p3.8.mts:194–198`). G1 is green (manifest ORACLE-EDIT). → **CD-P38-B2**.

## Files / hunks per ruling
| ruling | where | what |
|---|---|---|
| R2 · Q2 · CD-4 | `src/lib/modules/pos/board-settings-shared.ts` (new, pure) | `posBoardSettings` / `posTeamRoomSettings` (defaults = names table, clamps, unknown keys dropped, `boardByUnit`/`roomByUnit` ≤ 200, only `true` counts for default-off booleans) · `posBoardKeys` (CD-1 keys) · th/en text builders for every card/post (`posShiftCardText` `posZPostBody` `posSoldOutCardText` `posRefundCardText` `posAnomalyCardText`; locale = `settings.pos.receiptLocale`) |
| R2 · ruling 2 | `src/lib/modules/pos/board-settings.ts` (new) | `updatePosBoardSettings(ctx, actor, input, verify?)`: OWNER only (`PERMISSION_DENIED`), strict `VALIDATION` (unknown keys, ranges, types), units must be linked to this POS, injected id verifier (root), lock FOR UPDATE + `jsonb_set` of `pos.board` / `pos.teamRoom` only, audit `pos.settings.updated` (ids only), `enabledByUserId = actor.userId` |
| R1 R3–R9 · rulings 3–6, 9 | `src/lib/pos-board-bridges.ts` (new root) | `onShiftClosed` (R4 card + R7 Z post, both always attempted, unexpected error rethrown last) · `sweepPosBoard({now, deadline?, tenantId?})` (R5 86 → card / resolve, R6 refund_needed 7 days, R8 brief; pages of 200 systems, 20 s, per-system try/catch → WARN) · `createAnomalyCard` (R9; `NO_BOARD` CD-6, `NOT_FOUND` CD-7, VIEWER `PERMISSION_DENIED`) · `posCardsForKeys` · `savePosBoardSettings` (board ACTIVE in tenant + KANBAN system active; rooms ∈ `listRoomOptions(tenant, owner)`) |
| CD-2 | `src/lib/pos-board-actions.ts` (new, `"use server"`) | `createAnomalyCardAction` · `savePosBoardSettingsAction` (session → cores, no `throw`) |
| R10 · ruling 7 | `src/lib/outbox-consumers.ts:806` | one line `"pos.shift.closed": withAutomation(async (evt) => void (await (await import("@/lib/pos-board-bridges")).onShiftClosed(evt))), // POS P3.8 ▸ … ◂` |
| R10 | `src/app/api/cron/hourly/route.ts:133–142` | one block after the P3.9 block: `sweepPosBoard({now, deadline})` best-effort (additions only) |
| R11 · ruling 9 | `src/lib/pos-integrations.ts:23` (import) · `:61` (facts → `true, null` ×2) · `:217–224` (KANBAN LINKED also via `settings.pos.board` enabled + an ACTIVE board of an active KANBAN system) | no MEETING card (`total: 13`) |
| messages | — | none needed (server texts live in the th/en tables of `board-settings-shared.ts`; U card adds UI keys) |

Concurrency/dedupe: cards = kanban `sourceKey` + `underKeyLock` (advisory xact lock per key, held by a short lock-only tx while `createCardFromExternal` runs) so a duplicate delivery returns only after the winner set assignee + links · room = advisory lock + AuditLog flag + `postSystemMessage(…, tx)` in one tx (refused ⇒ rollback, 0 flag) · ops WARN `pos.board` = check + insert under advisory lock (detail starts with `warn:<posSystemId>:<rule>:<bkkDate> `), rules `shiftDiff · soldOut · refundNeeded · room · brief`.
URL links are absolute (`links.normalizeInput` accepts only http/https): `${APP_URL || https://shark.in.th}/app/sys/<posSys>/pos/shifts?shift=<id>` · `/pos/orders?id=<orderId>` · `/pos/reports?kind=anomalies&from=&to=&unit=` (APP_URL read from `process.env` like `crm/emails.ts`).

## ORACLE-EDITs (own `test(pos)` commits)
- 8f9f1fa1 `scripts/pos-gates.json` + `qc-pos-p3.8` (forced) after `qc-pos-p3.9` · suites **101 → 102** · `qc-pos-p2.14` G1 red (oracle drift 13) → green.
- c4bc3057 `scripts/qc-pos-p1.18.mts:318` KANBAN `stockOutShiftDiffCard`/`shiftCloseCashCheck` → `true, null` · I7 untouched · forced **80/81 (I12) → 81/81**.

## Deviations
- `posZPostBody` / card texts in `board-settings-shared.ts` (pure) instead of message JSON keys — brief R11 allows "server titles via th/en tables in board-settings-shared.ts".
- R8 posts only to `teamRoom.defaultRoom` (system-wide brief = system-wide room); `roomByUnit` rooms get Z posts only — a unit room would otherwise receive every unit's numbers (the loader is per POS system with the owner's rights). Brief date = yesterday's business date (same as P3.9).
- Manual anomaly cards use `sourceType MANUAL` (a person clicked), event/sweep cards `AUTOMATION`; manual cards are not auto-assigned.
- `onShiftClosed` treats `closedByUserId null ∧ countedCash null` as forced even if the payload lacks `forced`.
- `underKeyLock` holds one pool connection idle while `createCardFromExternal` uses others (pg pool max 10, PrismaPg) — chosen over a polling loop; reviewer may prefer otherwise.

## CONTROLLER-DECISION
- **CD-P38-B1 (ST1 red, the only red of this suite).** SO3 requires one KanbanComment `กลับมาขายแล้ว` on a board without a done column, but none of the 8 allowed kanban files exports a comment writer (`comments.addComment` needs a person + EDITOR and is not in the list). `src/lib/pos-board-bridges.ts:399–411` `backOnSaleComment` (writes at :407–408) writes the row directly (copy of `platform/kanban-bridges.ts:140–158 systemComment`, dedupe by body under an advisory lock, activity `COMMENT_ADDED` actor null, no `kanban.comment.added` event) ⇒ ST1 regex `qc-pos-p3.8.mts:226` flags `tx.kanbanComment.create` / `tx.kanbanActivity.create`. I did not hide it behind a renamed client. Options: (a) ORACLE-EDIT ST1 to allow exactly `kanbanComment`/`kanbanActivity` create in `backOnSaleComment` (rec — same precedent as K3.3) · (b) kanban owner adds a system-comment export (kanban-module edit, against ruling 2) · (c) drop the comment (ORACLE-EDIT SO3).
- **CD-P38-B2.** `qc-pos-p2.14` K3 red because the oracle `qc-pos-p3.8.mts:194–198` uses `merge-base HEAD origin/session/pos` (not in `REPIN_PENDING`/`REPIN_ALLOW_AFTER`). Rec: oracle uses a fixed pin like P3.9 (`P38_PIN || "42b823e9"`) or the controller adds it to the allow-list.
- **CD-P38-B3.** `qc-pos-p3.9` ST4 (`qc-pos-p3.9.mts:56`, PIN 8bded5a7) is tripped by the same `outbox-consumers.ts:806` line — add to the re-pin set (p2.10 ST2 · p2.11 ST4 · p2.12 ST1 · p2.13 ST5 · hf-fu2 ST1 · **p3.9 ST4**).
- **CD-P38-B4 (oracle robustness, info).** The oracle's "parked" events are often already claimed by the immediate background drain (scripts have no request scope ⇒ `scheduleDrain` drains at once). The code now serialises cards and WARNs, so the checks are deterministic for the same settings; a drain that is slow enough to run under the *next* step's settings could still add a card in count-based checks (X1 `countCards`). Not seen in 4 runs.
- W18 stays open (showOverShort default true, names never shown).

## U-only handoff (P3.8U)
Settings tab "บอร์ดงาน/ห้องทีม" (states: off · on/no board · on/board+room · read-only rows for K3.3 `cardOnVoidedSale`/`cardFromApproval` and P1.11 `issueBoardId` with links to their owners) wired to `savePosBoardSettingsAction` (refusal codes PERMISSION_DENIED/VALIDATION + `field`) · OWNER button "สร้างบอร์ด 'งานหน้าร้าน'" → `kanban/templates.createBoardFromTemplate` as that owner → save `defaultBoardId` (ruling 1) · board pickers via `kanban/links.visibleBoardOptions` / `integrations.listTaskTargetBoards`, room pickers via `meeting.listRoomOptions` (+ `liveChannelIds` for stale ids) · 08 anomaly rows "สร้างการ์ด" → `createAnomalyCardAction({systemId, row:{unitId, rule, businessDate, refType, refId}})` (hide when board off — `NO_BOARD`) and chip "การ์ด #n" via `posCardsForKeys` (`posBoardKeys.anomaly`) · shifts list chip via `posBoardKeys.shift` · 10 KANBAN card facts now live · `pos-ui-inventory.json` F15.3 (`:5432` "ทั้ง 8 แท็บ" → 9) · th/en UI keys `pos.settings.board.*`, `pos.reports.anomaly.toCard.*`.

## OP lines — §"แจ้งเจ้าของโมดูล Kanban/Meeting"
- Kanban: POS root `src/lib/pos-board-bridges.ts` consumes `links.createCardFromExternal` · `links.canOpenCardOnBoard` · `moves.moveCard` (system actor apiRole ADMIN, `force:true`) · `notify.cardLink` · `types` (KanbanActor/KanbanCtx). sourceKeys `pos-shift:` `pos-86:` `pos-refund:` `pos-anomaly:`. One direct row write: system comment "กลับมาขายแล้ว" (CD-P38-B1). Assignment push follows kanban's per-user push (no quiet hours) — accepted in the brief.
- Meeting: consumes `postSystemMessage(…, tx)` (author `system:pos`) and `listRoomOptions` from the index; dedupe = AuditLog `pos.teamroom.posted` (targetType `PosTeamRoomPost`) in the same tx; no new outbox event.

## Commits (wip/pos-p3.8)
c1e3cab6 merge oracle · 8f9f1fa1 ORACLE-EDIT gates · 70854cc6 step 2 parsers + writer · 05683296 step 3 root + actions · 1208ea4d step 4 consumer + cron · 442a34ac step 6 facts · e86cdb7b card lock · c4bc3057 ORACLE-EDIT p1.18 · 1cbc6309 tsc fix · ac2f6ce1 WARN atomic · (this notes commit).
Logs: `/tmp/claude-0/-root/c597e450-d0cf-5838-9f6d-470b7bf7192c/scratchpad/p38b/` (`red-before-keep.log`, `final-p38-{a,b,nodb}.log`, `gates/`, `k33.log`, `tc{1,2}.log`).

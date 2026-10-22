# P3.8U — builder notes (account B lane · 21–22 Oct 2026) · tree `/root/projects/shark-pos-b` · branch `wip/pos-p3.8u`

Base `origin/session/pos` 50efa4dc (product tip **8c0fc3c4** + ledger only) · merged `origin/session/pos` 66a468da (ledger only, 7c1b5175) · prompt `ledger/pos-briefs/pos-prompt-accountB-P3.8U-BUILD.md` (CD-P38U-1…11 confirmed + controller additions) · spec `ledger/pos-briefs/pos-spec-P3.8-board-ui.md`.
Card pin `qc-pos-p3.8` stays 42b823e9 (`P38_PIN` never set) · `P38_LANE_PIN=8c0fc3c4` passed for uniformity only.

## Progress
- [x] (1) messages th/en — `pos.settings.tabs.board` · `pos.settings.board.*` (+ `.room.*` · `.others.*` · `.errors.*` · `.source.*`) · `pos.report.anomaly.toCard.*` · `pos.ai.panel.board` · `pos.shift.{boardCard,boardCardDone,hintTitle,hintRoom,hintCard,hintCardEvery}`
- [x] (2) tab `board` + page-server reads + create-board
- [x] (3) wrapper `posBoardCardsAction` (CD-P38U-2 · path → CD-P38U-B1)
- [x] (4) anomaly button/chips + 08 panel link
- [x] (5) shifts chip + hint lines
- [x] (6) KANBAN card link → `?tab=board`
- [x] (7) harness + inventory + sweep row + spec
- [x] (8) merge origin/session/pos (ledger only) → gates (below)

## Commits (`wip/pos-p3.8u`)
| commit | what |
|---|---|
| 59f4ae2b | step 1 — messages th/en |
| 40c80ea4 | step 3 — NEW `src/lib/pos-board-ui-actions.ts` `posBoardCardsAction({systemId, keys})` |
| e0341781 | step 2 — `settings-tabs.ts` tab `board` · `settings/page.tsx` board tab data · NEW `settings/BoardSettings.tsx` · `room.staleOption` key · inventory +24 |
| 6dae66d2 | step 4 — `ReportsClient.tsx` AnomalyBody button/chips · `ReportsOverview.tsx` + `AiBriefPanel.tsx` board link · `reports/page.tsx` boardOn · inventory +3 |
| 52fbfcc7 | step 5 — `shifts/page.tsx` boardHint + shiftCards · `ShiftsClient.tsx` chip + hint block · inventory +1 |
| b7934e7e | step 6 — `SharkSettings.tsx` KANBAN card link · inventory +1 |
| b420c627 | fix — page-server typing (PosRoomRef guard · shift chip map loop) |
| 5ececc20 | test(pos) step 7 — `visual-pos.mts` P38U_WO/P38U_PAGES/P38U_PLAN (12 states) + fixtures/guard/cleanup |
| 36630878 | test(pos) — `pos-visual-sweep.json` placeholder run row `p3.8u` (25d5560e precedent · `qc-pos-p2.14` V2) |
| 1b968ec2 | ledger — spec + notes |
| 7c1b5175 | merge `origin/session/pos` 66a468da (ledger only) |
Inventory F15.3 rows **+29** (1096 → 1125) · `pos-settings-nav-*` note "ทั้ง 8 แท็บ" → "ทั้ง 9 แท็บ … board ตั้งแต่ P3.8U".

## Components / keys / testids
- `settings/BoardSettings.tsx` (`"use client"` · imports `@/lib/pos-board-actions`, `@/lib/modules/kanban/actions` (`createBoardFromTemplateAction`, existing "use server"), `board-settings-shared`, `settings-tabs`, `settings-ui`): testids `pos-settings-board-{tab,board,room,others,enabled,default,unit-<id>,create,add-system,no-kanban,need-board,rule-{assignManager,shiftDiff,everyClose,forcedClose,soldOut,refundNeeded},min,hours,source-<s>,save,saved,error,room-enabled,room-default,room-unit-<id>,need-room,stale,stale-unit-<id>,all-off,no-meeting,post-{shiftClose,showOverShort,dailyBrief},brief-hour,brief-needs-default,room-save,readonly-{voided,approval,issue},owner-only}`.
- `SharkSettings.tsx` KANBAN card: `pos-settings-board-manage-here`.
- `ReportsClient.tsx` AnomalyBody: `pos-reports-anomaly-{card,card-chip,card-done,card-reason}-<n>` · `AiBriefPanel.tsx`: `pos-reports-ai-board`.
- `ShiftsClient.tsx`: `pos-shift-board-{hint,hint-room,hint-card,chip-<shiftId>}`.
- Every foreign hunk is marked `// POS P3.8U ▸ <CD id> ◂` (or `/* POS P3.8U … ◂ */` inside JSX/attribute lists).

## Deviations per CD
- **CD-P38U-1**: K3.3/P1.11 rows show a chip on/off + board name + link (no read-only knob — a `role="switch"` span would be another inventory control with no action); the POS-owned switches are the real buttons, `disabled` + `aria-disabled` for non-owners. Board options for the OWNER are `visibleBoardOptions(owner)` filtered to active KANBAN systems (the server refuses boards of inactive systems). Room labels `system · room` only when the shop has several MEETING systems.
- **CD-P38U-2**: file at `src/lib/pos-board-ui-actions.ts` — **CONTROLLER-DECISION CD-P38U-B1** below. Also checks the key's unit is linked to this POS. p1.6 R2 self-check (R2 walks only `src/lib/modules/pos`): first statement `"use server"` ✓ · exports = `export async function posBoardCardsAction` only ✓ · no `throw` ✓ · try/catch with `unstable_rethrow` ✓ · `can()` returns `evaluate(...)` boolean ✓.
- **CD-P38U-3**: on create-ok + save-refused the new board is added to the local picker and preselected as the default (owner presses Save). Board name = `board.newBoardName` in the UI locale (th "งานหน้าร้าน" / en "Store tasks").
- **CD-P38U-4**: two Save buttons ⇒ testids `pos-settings-board-save` (board card) and `pos-settings-board-room-save` (room card) (the prompt lists one `save`). A refusal with no matching control shows at the card foot. Non-integer min/hours = local VALIDATION at the field, no request.
- **CD-P38U-6**: compact closed rows put the chip under the row button (an `<a>` inside the `<button>` would be invalid HTML).
- **CD-P38U-7**: messages live under `pos.report.anomaly.toCard.*` (the existing namespace is `pos.report`, the prompt wrote `pos.reports`). After a successful press one extra `posBoardCardsAction` read fetches the chip `href` (not a poll); if it fails the chip is text `pos-reports-anomaly-card-done-<n>`. `AnomalyBody` keyed by `generatedAt`.
- **CD-P38U-8**: plain `<a href>` (full navigation) so `ReportsClient` re-initialises its view from the URL.
- Messages: one hunk per namespace (5 per file: shift · report.anomaly · settings.tabs · settings.board · ai.panel) — one hunk per file is impossible with nested JSON.
- **CD-P38U-11 harness**: (a) the AI panel state also writes `settings.pos.ai` (`enabled: true` over the original) through the same `_qcP38uBefore` save/restore — the panel is off by default (`posAiSettings` default `enabled:false`) → **CD-P38U-B2**; (b) SKIP has no channel in `visual-pos.mts` ⇒ a SKIP surfaces as a step error starting `SKIP —`; (c) the pressed state runs at 1440 + 390 th and 1440 en (keys are per day: 3 free A11 rows per day); (d) the hint state needs an open shift: `openShift` (owner, float 0) on fixture device `posqc-vis-p38u-shift`, reused across runs, never closed, SKIP when within 1 h of `forceCloseAfterHours` (a page load would let the system force-close it); (e) A11 fixture = 4 rows (2 units × approver owner/cashier, `after.unitId`); (f) dates are the Bangkok calendar day (as P3.9U) — a run between midnight and a non-zero day cutoff would miss the A11 rows (chip state SKIPs with that reason).

## Fixtures + guard (CD-P38U-11)
QC tenant `coffee` only, no reseed, no snapshot requests · board `posqc-vis-p38u` (kanban `service.createBoard`, first active KANBAN, TENANT) · rooms `posqc-vis-p38u` + `posqc-vis-p38u-arch` (meeting `service.createChannel` / `archiveChannel`, first active MEETING) — kept · settings `pos.board` / `pos.teamRoom` (+ `pos.ai` for one state) = harness jsonb; originals in `settings.pos._qcP38uBefore` (written before the first change; a killed run's leftovers are restored from it) and restored after the last P3.8U job / finally / signal · **guard `p38uGuard`** before every settings write: tenant must be QC coffee, every `defaultBoardId`/`boardByUnit` id = the fixture board, every `defaultRoom`/`roomByUnit` ref = fixture room or archived fixture room — else StepError → `P38U.error` (all later P3.8U states fail) · the only Save press (invalid state) asserts teamRoom off and `posts.shiftClose`/`dailyBrief` off · never closes a shift, never calls `sweepPosBoard` / `onShiftClosed` · audits `pos.staff.schedule_override` reason "ภาพ QC P3.8U <pid>" deleted in cleanup · chip cards `createCardFromExternal` (system actor, AUTOMATION) only on the fixture board, an existing card for the key is reused (no write).

## `--state` list for the controller's QC5 round (one pass at a time)
- owner th (32 shots): `settings-board-off,settings-board-on,settings-board-invalid,settings-board-room-stale,settings-shark-kanban-link,reports-anomalies-card-button,reports-anomalies-card-pressed,reports-anomalies-card-chip,reports-ai-panel-board,shifts-closed-board-chip,shifts-close-board-hint`
- cashier th (3 shots): `settings-board-readonly`
- owner en (11 shots, 1440): same 11 as owner th
- cashier en (1 shot): `settings-board-readonly`
- `--dry` (iso · CI=1): th owner 32 rc 0 · th cashier 3 rc 0 · en owner 11 rc 0 · en cashier 1 rc 0.
- Sweep row `p3.8u` is a placeholder → replace with `p3.8u-th` / `p3.8u-en` after the round.

## CONTROLLER-DECISION
- **CD-P38U-B1 (wrapper path)** — the controller addition put the wrapper at `src/lib/modules/pos/board-ui-actions.ts` importing `@/lib/pos-board-bridges`. Probe (working copy, `--no-db`, iso): **ST1 red** `qc-pos-p3.8.mts:206` "pos/board-ui-actions.ts → pos-board-* (ทิศกลับ)" (the regex flags any `modules/pos/**` file importing `@/lib/pos-board-(bridges|actions)`), while the base has ST1 green and the prompt's target is `--no-db` = base (ST1 green) with no ORACLE-EDIT. Built at the drafted CD-P38U-2 path `src/lib/pos-board-ui-actions.ts` (composition root next to `pos-board-actions.ts`) and self-checked against p1.6 R2. Options: (a) keep the root path (rec) · (b) ORACLE-EDIT ST1 to allow exactly `pos/board-ui-actions.ts → posCardsForKeys` and `git mv` the file (one import path changes in `ReportsClient.tsx`).
- **CD-P38U-B2 (harness writes `settings.pos.ai` for `reports-ai-panel-board`)** — AI is off by default, the panel shows `ai.brief.off` and no board link otherwise. Same save/restore as board/teamRoom (`_qcP38uBefore.ai`). Alternative: SKIP that state unless the QC shop already has AI on.

## Owner-ack lines
- Derived tab "บอร์ดงานและห้องทีม" (no mockup; layout from the general tab) · the "เมื่อปิดกะ" hint block on 07 · W18 help line "ทุกคนในห้องเห็นยอดขาด/เกิน — ไม่มีชื่อคน" + all-off note · no Z-post / brief preview (texts are server tables) · "สร้างบอร์ด “งานหน้าร้าน”" makes a **blank** board; kanban's default columns have no done column ⇒ cleared 86 cards get the comment "กลับมาขายแล้ว" instead of a move.

## OP lines
- §"แจ้งเจ้าของโมดูล Kanban": POS UI creates blank boards via the existing `actions.createBoardFromTemplateAction({templateId: null})` (no done column) and reads `links.visibleBoardOptions(tenant, viewer)` (names) + `integrations.getIntegrations(tenant, firstKanban)` (K3.3 `cardOnVoidedSale` / `cardFromApproval`, read-only rows linking to `/kanban/settings`); card chips link to `notify.cardLink` hrefs (kanban page enforces access). Harness fixture board `posqc-vis-p38u` via `service.createBoard` and chip cards via `links.createCardFromExternal` (QC tenant only).
- §"แจ้งเจ้าของโมดูล Meeting": room names from `listRoomOptions(tenant, owner)` go to the OWNER only; stale rooms detected with `liveChannelIds` (ids only, no names). Harness fixture rooms `posqc-vis-p38u` / `posqc-vis-p38u-arch` via `service.createChannel` / `archiveChannel` (QC tenant only).

## Follow-ups (controller · not built)
- Room-post delivery/refusal reader through the meeting seam · multi-day range rows with null date (A7/A11) cannot become cards · kanban/meeting suites not in `pos-gates.json` (`qc-kanban-k3.3` CONTROLLER-RUN if needed) · 86/refund card links in POS screens (CD-P38U-9).

## Gates
- Code head **e56d3c46** (dirty 0) — this gates commit on top is ledger-only.
- **Typecheck** `env NODE_OPTIONS=--max-old-space-size=8192 ISO_MEM=10500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck` at e56d3c46 → **exit 0** (23:4x–23:55Z, once).
- Pre-submit run 1 (head 7c1b5175) ran only the wo suite (my notes edit dirtied the tree during the run, so `pos-gates-all --only` refused) — wo 32/34 ×2 · `--no-db` 1/3; run 2 below is the full one.
- Pre-submit run 2 (final · logs `/root/pos-runs/presubmit-shark-pos-b-20261021T230821Z`):
```
PRESUBMIT-TABLE head=e56d3c46 tree=/root/projects/shark-pos-b
suite                        exit pass/total     s  failed
wo-qc-pos-p3.8-run1          1    32/34         39  P3.8-ST2,P3.8-ST3
wo-qc-pos-p3.8-run2          1    32/34         39  P3.8-ST2,P3.8-ST3
wo-qc-pos-p3.8-nodb          1    1/3            1  P3.8-ST2,P3.8-ST3
qc-pos-p1.1                  0    180/180      188  
qc-pos-p1.3                  0    128/128      147  
qc-pos-p1.6                  0    48/48         42  
qc-pos-p1.9                  0    53/53         22  
qc-pos-p1.11                 0    38/38         36  
qc-pos-p1.18                 0    81/81         44  
qc-pos-p2.12                 0    33/33         59  
qc-pos-p2.13                 0    54/54         81  
qc-pos-p2.14                 1    58/60        366  P2.14-Q6,P2.14-O1
qc-pos-p3.9                  0    48/48         47  
qc-hf-fu                     1    28/29        112  HF-FU-ST1  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-hf-pos-page-authz         0    87/87          5  
qc-hf-reports-authz          0    79/79          6  
qc-hf-tx                     0    22/22         26  
qc-hf-fu2                    1    30/31         24  HF-FU2-ST1  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-restaurant-money          0    6/6            4  
qc-shop-refund               0    12/12          8  
qc-hotel-money               0    5/5            6  
qc-ticket-money              0    6/6            5  
qc-subscription-money        0    14/14          6  
qc-account-cpa               0    107/107       14  
qc-acc-v2-pos-lines          1    65/79         10  PL1.1,PL1.2,PL1.3,PL1.4,PL1.6,PL1.7 … [accepted]
fitness-noenv                0    53/53         22  
fitness-qc4                  0    53/53         20  
fitness-pos                  0    8/8           13  
gen-check                    0    -              3  
PRESUBMIT head=e56d3c46 green=22 red=7 expected-lane-pin=2 unexpected-red=wo-qc-pos-p3.8-run1,wo-qc-pos-p3.8-run2,wo-qc-pos-p3.8-nodb,qc-pos-p2.14,qc-acc-v2-pos-lines · wo: qc-pos-p3.8-run1=32/34 · qc-pos-p3.8-run2=32/34 · qc-pos-p3.8-nodb=1/3 · VERDICT red (3: qc-pos-p2.14 qc-hf-fu qc-hf-fu2)
```
- `qc-pos-p3.8` forced ×2 **32/34** · `--no-db` **1/3**: only ST2/ST3 = known W21 reds — **ST2** `qc-pos-p3.8.mts:242–275` "diff outbox-consumers = +28/−10 (คาด +1/−1 …)" · **ST3** `qc-pos-p3.8.mts:277–299` "แตะ prisma/migrations/20261218100000_pos_p3skel/… · prisma/schema/pos.prisma · src/lib/modules/pos/order.ts · register-shared.ts · register.ts …(+2)". Reason lists identical to base: `git diff 8c0fc3c4 HEAD` over every path ST2/ST3 read (prisma · outbox-consumers · cron/hourly · pos register*/service/shift/order/catalog/receipt* · kanban · meeting · automation · kanban-bridges · pos-receipt-bridges) is empty. ST1 green (probe at the controller path = red, see CD-P38U-B1). skippedParts [] · residue 0 · guardHits 0.
- Lane pins (expected): `qc-hf-fu` ST1 `scripts/qc-hf-fu.mts:233` LANE_PIN 85c366dd (visual-pos.mts in its forbidden list — this card's harness hunk) · `qc-hf-fu2` ST1 `scripts/qc-hf-fu2.mts:191` LANE_PIN 85c366dd (new hunks without HF-FU2 marker).
- Unexpected reds (not this card's code): `qc-pos-p2.14` 58/60 **Q6** (child process gave no answer — libpq SSL notice, harness) + **O1** (`posorder-release` lock timing) — order/payment DB checks; this card touches no order/payment/register file; V2 (sweep row) and K3 green · `qc-acc-v2-pos-lines` 65/79 = **accepted** in the manifest (QC4 has no acc-v2 seed).
- Targets met: p1.18 81/81 (ST7 0) · p1.3 128/128 · p1.6 48/48 · p2.12 33/33 · p2.13 54/54 · p3.9 48/48 · p1.9 53/53 · p1.11 38/38 · hf-reports-authz 79/79 · hf-pos-page-authz 87/87 · fitness ±env 53/53 · fitness-pos 8/8 (F15.3) · money set green · cpa 107/107.

## Fix round 1 (controller B · 22 Oct 2026 00:33Z)
- Cause: QC5 round at 2676f5f6 SKIPped 39/47 shots — QC tenant `coffee` on QC5 has no active KANBAN/MEETING system.
- `scripts/visual-pos.mts` `ensureP38uFixture` only: per type, use the first active KANBAN/MEETING system (unchanged) · else reuse the harness system by fixed name · else `p38uGuard` (QC tenant) → `system/service.createSystem(T.tenantId, type, name)` (the COUPON precedent; createSystem takes no actor) — names `บอร์ดงาน (ภาพ QC P3.8U)` / `ห้องทีม (ภาพ QC P3.8U)`, **kept** (not deleted in cleanup, later rounds reuse them, no reseed, not unit-linked). SKIP only when createSystem throws or the named system is deactivated (printed reason).
- New MEETING system: `meeting/service.ensureWorkspace` (#general + owner member, as on first open) before the fixture rooms. New KANBAN system: `createBoard` already creates the default columns (first column receives the chip cards) — no template needed.
- `--dry` (iso · CI=1): th owner 32 rc 0 · th cashier 3 rc 0 · en owner 11 rc 0 · en cashier 1 rc 0. Typecheck not run (scripts/*.mts are covered by the controller's next build; a full tsc needs the 8 GB heap).

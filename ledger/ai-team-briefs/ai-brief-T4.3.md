# T4.3 — Undo window + action log C6 (Opus · server + app)
Read `ai-brief-COMMON.md` + RESOLUTIONS R-C10, R-E C22/C23 first. Contract: AI-TEAM-RUN §2 T4.3. Mockup `airy-c.jpg` page 6 (+ dark). HTML: "บันทึกการกระทำ · ทุกอย่างที่พนักงาน AI ทำ · ย้อนหลัง 90 วัน" · tabs ทั้งหมด/ส่งลูกค้า/เงิน/แก้ข้อมูล · day groups · rows "9:42 ส่งใบเสนอราคา Q-0012 ทาง LINE · คุณเอก · อนุมัติโดยคุณ 9:41" · "9:12 ออกใบแจ้งหนี้ INV-0231 ฿4,800 · พลอยใส · ทำเองได้ · [ยกเลิกได้]" · "18:00 ส่งคูปองวันเกิด 12 คน · ฟ้า · งานประจำ".

## Verified facts
- `AiActionLog` (T1.1) rows written by T1.9 (DRAFT decisions) and T4.2 (AUTO) with `undoUntil`; `AiSettings.undoWindowSec` (default 600 via `packs.ts`); permission `ai.action.undo` (T1.2; OWNER by default, grantable).
- Inverses available today (REVIEW §2.0, C23): account document void (`account-ops` danger op — use the facade function the op calls, e.g. `voidDocument`), kanban card move/archive reversal (`kanban-ops` / facade), CRM deal stage move (`crm` facade `moveDeal` to the previous stage from `StageHistory`), member voucher revoke (member facade if exists), content schedule unschedule (if a scheduling function exists). Anything without an identified facade inverse is **not** reversible.
- `PACKS.historyDays` (T0.4) bounds the list.

## Deliverables
Server `src/lib/ai/team/undo.ts`: `REVERSIBLE: Record<kind, { inverse: (ctx, log, proposal) => Promise<void>, labelTh }>` (explicit list, one entry per proven inverse; `classOfKind.reversible` now derives from this table — update `kind-class.ts` to import the key list lazily to stay env-free, or keep a static mirror checked by F16.8) · `undoAction(ctx, userId, actionLogId, { reason ≥ 5 })` — `assertCan(ai.action.undo)`; `now < undoUntil` else `undo_expired`; row not undone (conditional `updateMany` sets `undoneAt/undoneById` first — X3); run inverse through the facade; audit `ai.undo.<kind>`; notify starter/grantor · `listActions(ctx, { filter, days ≤ historyDays, cursor })` → rows from `AiActionLog` joined with proposal summary + `AuditLog` for the "by whom/how" line (`อนุมัติโดย <name>` / `ทำเองได้` / `งานประจำ` from task kind) · routes `GET /api/mobile/team/actions`, `POST actions/[id]/undo`.
App `app/(app)/settings/actions.tsx`: tabs by class, day grouping (BKK), row with mode chip, "ยกเลิกได้" button only while `undoUntil > now` (client clock from server `now` in the DTO) → confirm with reason → API → row shows "ยกเลิกแล้ว".
testIDs `act-tab-<k>`, `act-row-<id>`, `act-undo-<id>`, `act-confirm`.

## Acceptance (oracle `qc-ai-t4.3`)
S1 pairs C6 · S2 undo in window → inverse spy + fields + audit · S3 X5 expired · S4 non-reversible kind → no button + refusal · S5 permission matrix · S6 X3 double undo → one inverse · S7 list filters + historyDays bound · S8 X8 DTO · S9 app button visibility by `undoUntil`. Regressions T4.2 `qc-audit-trail` + module suites of the inverses used.

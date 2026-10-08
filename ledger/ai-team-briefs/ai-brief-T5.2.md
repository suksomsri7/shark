# T5.2 — Hand-off between employees in a room E2 (Opus · server + app) 🎯 hunter (delegation in rooms)
Read `ai-brief-COMMON.md` + RESOLUTIONS R-E C27 first. Contract: AI-TEAM-RUN §2 T5.2. Mockup `airy-e.jpg` page 2 (+ dark). HTML: header "ฝ่ายขาย · ปิดดีลร้านดอยช้าง · ขั้น 2 จาก 4" · user bubble "ร้านดอยช้างตกลงซื้อแล้ว ปิดดีล ออกใบแจ้งหนี้ แล้วนัดส่งของให้ด้วย" · step cards per employee: "คุณเอก · เซลส์ ✓ ย้ายดีลเป็น ปิดการขาย ฿11,200 → ส่งต่อให้พลอยใส พร้อมใบเสนอราคา Q-0012" · "พลอยใส · บัญชี ✓ ออกใบแจ้งหนี้จาก Q-0012 · รออนุมัติ · INV-0232 ฿11,200 · [แก้] [อนุมัติและส่งต่อ]" · "น้องมะลิ · แอดมินแชท ○ รอ: ส่งใบแจ้งหนี้ + นัดวันส่งของทาง LINE" · composer "สั่งงานต่อในห้องนี้…".

## Verified facts
- One `AiConversation` per room task (`AiTask.roomId`, `currentEmployeeId`) — T1.1; each turn's prompt/access come from `currentEmployeeId` (T1.4/T1.6 read `ctx.aiEmployeeId`; set it from `currentEmployeeId` when `roomId` is present).
- `AiPlan` stays single-room/single-employee (C27); hand-off is a new async mechanism, not plan steps.
- Charging by `aiEmployeeId` = current employee (X11).

## Deliverables
Server `src/lib/ai/team/handoff.ts`: `startRoomTask(ctx, roomId, { firstMessage })` (lead employee first; `canCommandRoom`) · `handoffTo(ctx | system, taskId, toEmployeeId, { brief, attachProposalIds[] })` — writes a system message `→ ส่งต่อให้ <name>: <brief>` with attached proposal summaries, sets `currentEmployeeId`, runs `sendMessage` as the **original commander** (`startedById` member actor; ∩ the new employee's access) with the brief as the user text; the model decides the next step; a tool `handoff_to_colleague({ employeeId, brief })` is added to the registry (core skill, DRAFT-level, available only inside room tasks, `writesNow:false`) so an employee can hand off by itself — bounded by `MAX_HANDOFFS_PER_TASK = 8`, `MAX_TURNS_PER_TASK = 20` · proposal cards inside room tasks get an extra action "อนุมัติและส่งต่อ" = decide APPROVE then `handoffTo(nextEmployee)` where next = the flow's next step (T5.3) or the employee named by the model's pending `handoff` suggestion stored on the task (`AiTask.nextHandoffJson`? **no column** → store in the proposal `payload.__nextHandoff` written by the hand-off tool before proposing; document) · failure or refusal at any step ⇒ system message "ติดที่ขั้น <n>: <reason> · ถามคนสั่งงาน" + notify commander; never skip.
App: room task screen = `tasks/[id]` with per-employee step cards (`EmployeeStepCard`: orb + name + position + ✓/●/○ + body), "อนุมัติและส่งต่อ" button variant, composer.
testIDs `room-step-<n>`, `room-approve-forward-<id>`.

## Acceptance (oracle `qc-ai-t5.2`)
S1 three-employee chain: prompt builder spy per turn + charge per employee · S2 approval step waits; approve-and-forward continues · S3 X2 next employee lacking a tool ⇒ stop + ask · S4 caps · S5 X3 double approve-and-forward ⇒ one · S6 X1 · S7 pairs E2 · S8 visibility = room commanders. Regressions T1.7 T4.2 `qc-ai-proposals` `qc-ai-plan`.

## Controller rulings
- The commander's identity is used for every turn in a room task (no "AI acting as AI"); AUTO at a step follows T4.2 with the grantor of that employee.
- Hunter lens: can a hand-off smuggle a proposal to an employee with wider AUTO rights (privilege laundering)? The step runs with the commander's rights ∩ that employee's access; AUTO limits are per employee — prove no escalation.

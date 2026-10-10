# T5.1 — Department rooms E1 · E3 (Opus · server + app)
Read `ai-brief-COMMON.md` + RESOLUTIONS R-E C27/C29 first. Contract: AI-TEAM-RUN §2 T5.1. Mockups `airy-e.jpg` pages 1 and 3 (+ dark). HTML: E1 header + segmented "พนักงาน 5 | ห้องแผนก 3" · hint "สั่งครั้งเดียว พนักงานหลายคนส่งงานต่อกันเอง" · room cards (ฝ่ายขาย · ปิดดีลร้านดอยช้าง · ขั้น 2 จาก 4 · 9:41 · badge) · "＋ สร้างห้องแผนก" · "ระบบแนะนำ: 💡 งานที่ส่งต่อกันบ่อย คุณเอก → พลอยใส 6 ครั้งในเดือนนี้ · ตั้งลำดับ". E3: "ห้องแผนกใหม่" · ชื่อห้อง input · "พนักงาน AI ในห้อง" checklist with "รับงานก่อน" tag on the lead · "คนที่สั่งงานห้องนี้ได้" avatar picker · note "แต่ละคนยังใช้สิทธิ์และคู่มือของตัวเอง ห้องแผนกไม่ได้เพิ่มสิทธิ์ให้ใคร" · "สร้าง".

## Verified facts
- `AiRoom(tenantId, name, leadEmployeeId, commanderUserIds, archivedAt?)`, `AiRoomMember(roomId, aiEmployeeId?|userId?, isLead)` (T1.1); never `Team*` (C29).
- Hand-off history for suggestions: `AiTask.roomId` + system messages (T5.2 writes `AiHandoff` rows? no table → T5.2 appends to `AiTask.handoffJson`? not in T1.1 → **suggestion source = `AiActionLog` pairs**: consecutive decided proposals by different employees in the same room within 24 h; before T5.2 exists, suggestions come from tasks of different employees sharing a `title` prefix — document and keep simple).
- Permissions `ai.room.manage` (T1.2).

## Deliverables
Server `src/lib/ai/team/rooms.ts`: `createRoom(ctx, { name, memberIds ≥ 2, leadId ∈ memberIds, commanderUserIds[] })` · `updateRoom` · `archiveRoom(ctx, id, { confirm, reason })` (tasks in the room stay readable) · `listRooms(ctx) → [{ id, name, members: [...], lead, lastTask: { title, step, total, at }, pendingCount }]` · `canCommandRoom(tenantId, userId, roomId)` = room commanders (empty ⇒ intersection of members' commander sets; if any member has an empty set ⇒ `ai.employee.use`) · `suggestHandoffs(tenantId)` · routes `rooms/**` · X2 note in docs: rooms never widen access.
App `app/(app)/rooms/{index,new,[id]/edit}.tsx` + the segmented toggle on A1 (team screen) · `RoomCard` · member checklist with lead radio · commander picker from `GET people` · suggestion card → `/rooms/new?prefill=` (T5.3 "ตั้งลำดับ" lands on the flow editor).
testIDs `rooms-toggle-<k>`, `rooms-card-<id>`, `rooms-new`, `rooms-suggest`, `room-name`, `room-member-<id>`, `room-lead-<id>`, `room-cmd-<id>`, `room-create`.

## Acceptance (oracle `qc-ai-t5.1`)
S1 CRUD + validation · S2 X2 READ member cannot propose in a room where another is DRAFT · S3 commander rule (ruling: empty = intersection) · S4 suggestion from seed · S5 X1 · S6 pairs E1/E3 light/dark + toggle · testIDs/i18n. Regressions T1.2 T1.7 T2.2.

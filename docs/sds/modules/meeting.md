# Meeting / แชทภายในองค์กร (AS-BUILT 2026-07-16)

## หน้าที่ · ผู้ใช้ · ตำแหน่งในชั้น (อ้าง 02)
แชททีมภายในแบบ Slack — ห้อง (public/private) + ข้อความ + เธรด reply. คู่สนทนา = staff↔staff (User ที่มี Membership) ไม่ใช่ลูกค้า. ผู้ใช้: พนักงานใน tenant. **Layer 2: Core** (feature no.11) — scope=system (AppSystem type MEETING = workspace). คนละ inbox กับ Chat (ลูกค้า).
โค้ด: `src/lib/modules/meeting/{service,actions,ui}.ts` · schema `prisma/schema/meeting.prisma`.

## Data model (prisma/schema/meeting.prisma) — tenantId+systemId
- **MeetingChannel** — ห้อง: `name`(unique `[systemId,name]`) `kind`(PUBLIC/PRIVATE) `topic?` `isDefault`(#general — leave/archive ไม่ได้) `createdByUserId` `lastMessageAt?` `archivedAt?`(read-only, unarchive ได้).
- **MeetingChannelMember** — สมาชิกห้อง: `userId` `isAdmin` `joinedAt` `leftAt?`(แถวคงไว้ re-join ล้าง leftAt). unique `[channelId,userId]`.
- **MeetingMessage** — `authorUserId` `body` `threadParentId?`(reply ไม่ซ้อนชั้น) `replyCount`(denormalized บน parent) `editedAt?` `deletedAt?`(soft delete tombstone). index `[channelId,threadParentId,createdAt,id]`.
- userId = String อ้าง User กลาง (ไม่ประกาศ FK ข้ามโดเมน — ตรวจ Membership ที่ service layer).

## Service API (src/lib/modules/meeting/service.ts)
- `listStaff(tenantId)` — User ที่มี Membership (สำหรับเชิญ).
- `ensureWorkspace(...)` — สร้าง workspace + #general default.
- `listVisibleChannels(tenantId, systemId, userId)` — ห้องที่ user เห็น (public + private ที่เป็นสมาชิก).
- `getChannel` · `isChannelMember(channelId, userId)` · `listChannelMembers`.
- `createChannel({...})` — สร้างห้อง (creator เป็น admin+member).
- `joinChannel/leaveChannel/archiveChannel(...)` — จัดการสมาชิก/สถานะ (ตรวจ default+สิทธิ์).
- `listMessages(systemId, channelId, limit=50)` · `listThread(systemId, threadParentId)`.
- `postMessage({...})` — โพสต์ (ตรวจเป็นสมาชิก), reply → replyCount++ บน parent, อัปเดต lastMessageAt.
- `editMessage/deleteMessage({...})` — edit (editedAt) / soft delete (deletedAt, tombstone) — ตรวจ author/admin.

## การเชื่อมต่อ
- **User/Membership กลาง**: ตรวจ Membership ที่ service (ไม่ FK ข้ามโดเมน).
- ไม่เชื่อมโมดูลอื่น (self-contained), ไม่มี outbox event, ไม่มีเส้นเงิน.
- Calendar รวม (Booking/Meeting/HR) = แผน WO-0057.

## Permissions (assertCan ใน actions.ts)
`meeting.channel.create` · `meeting.channel.delete` · `meeting.channel.join` · `meeting.channel.leave` · `meeting.message.post` · `meeting.message.edit` · `meeting.message.delete`.

## UI
- `/app/sys/[id]/meeting` (type=MEETING, MeetingContent) — sidebar ห้อง + main pane + เธรด.

## การทดสอบ
- `scripts/qc-systems.mts` — meeting ในชุด 7 ระบบ (สร้างห้อง/โพสต์/เธรด ผ่าน service จริง).

## ข้อจำกัด/หนี้ที่รู้ + WO อนาคต
- Defer: real-time SSE (ปัจจุบัน poll/refresh), reactions, mention notification, ไฟล์แนบ.
- WO-0057 Calendar รวม.

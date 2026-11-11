# S1-5 — S1.6 ห้องร่วม `secretary/members.ts` (Opus · `wip/sec-s1.6` · หลัง S1.4 merge · ชุดตรวจเข้ม 2 ผู้ตรวจ)

Read `sec-brief-COMMON.md`, `sec-brief-RESOLUTIONS.md` (R-K1 R-K2 §G R-S1.1c), plan row S1.6, แบบ D2/D3 (`ledger/DESIGN-SECRETARY.md`), `docs/modules/31-secretary.md` §5/§6/§7, ใบ `sec-brief-S1.4.md` (rooms.ts ที่มีแล้ว: `roomSightFor` ใน conversations.ts · `getRoom` · `listRooms`), และ oracle `scripts/qc-sec-s1.6.mts`. Verified code: `src/lib/ai/service.ts` `listMessages` (หลัง S1.4 ใช้ roomSightFor) · `sendMessage` (เขียน `authorUserId` ในห้อง AiRoom) · `src/lib/ai/conversations.ts` `roomSightFor` · ตาราง `AiRoomMember(tenantId, roomId, userId, addedById, addedAt, seeHistory)` · `AiMessage.authorUserId`.

## `src/lib/ai/secretary/members.ts`
```ts
export const ROOM_MEMBERS_MAX = 20;
export type RoomMemberRow = { userId: string; name: string; role: "OWNER" | "MANAGER" | "STAFF"; addedById: string; addedAt: Date; seeHistory: boolean };
export async function listMembers(ctx: ConvCtx, roomId: string): Promise<RoomMemberRow[] | null>;        // มองไม่เห็นห้อง = null · เรียง addedAt asc · name จาก User
export async function addMember(ctx: ConvCtx, roomId: string, input: { userId: string; seeHistory?: boolean }): Promise<{ ok: true; member: RoomMemberRow } | { ok: false; error: "not_found" | "forbidden" | "not_member_of_tenant" | "self" | "already" | "limit" | "closed"; message: string }>;
   // ผู้เพิ่ม = ผู้เปิดห้อง (startedById) หรือ OWNER เท่านั้น (คนอื่น/สมาชิกห้อง = forbidden · มองไม่เห็น = not_found) · ผู้ถูกเพิ่มต้องมี Membership กิจการเดียวกัน acceptedAt≠null (ไม่งั้น not_member_of_tenant) · ตัวเอง/ผู้เปิดห้อง = self · ซ้ำ = already · ครบ 20 = limit · ห้องปิด = closed · สำเร็จ: AiRoomMember(tenantId, roomId, userId, addedById=actor, seeHistory ปริยาย false) + ข้อความระบบในห้อง: AiMessage role ASSISTANT content "🔔 <ชื่อผู้เพิ่ม> เพิ่ม <ชื่อผู้ถูกเพิ่ม> เข้าห้อง" authorUserId=null · tokens 0 · อัปเดต AiRoom.updatedAt
export async function removeMember(ctx: ConvCtx, roomId: string, userId: string): Promise<{ ok: true } | { ok: false; error: "not_found" | "forbidden" | "not_a_member"; message: string }>;
   // ผู้เปิดห้อง/OWNER เอาใครออกก็ได้ · สมาชิกเอาตัวเองออกได้ (leave) · ลบแถว + ข้อความระบบ "🔔 <ผู้ทำ> นำ <ชื่อ> ออกจากห้อง" (ออกเอง = "🔔 <ชื่อ> ออกจากห้อง")
export async function visibleMessagesWhere(ctx, room): Prisma.AiMessageWhereInput;  // หรือ ปรับ service.listMessages: ถ้า actor เป็นสมาชิก (ไม่ใช่ผู้เปิดห้อง/OWNER) และ seeHistory=false ⇒ กรอง createdAt ≥ addedAt
```
- `service.ts listMessages(ctx, conversationId, take)`: เพิ่มกติกา seeHistory — สมาชิกที่ `seeHistory=false` เห็นเฉพาะข้อความ `createdAt >= addedAt` · ผู้เปิดห้อง/OWNER/สมาชิก seeHistory=true เห็นทั้งหมด · ห้องเดิม (ไม่มี AiRoom) = เดิม
- X2: ข้อเสนอ/เครื่องมือที่เกิดจากข้อความของสมาชิกใช้ actor ของผู้เขียน (S1.4/S1.5 ทำแล้ว — ใบนี้แค่ยืนยันใน oracle) · ผู้กดอนุมัติต้องผ่าน `actorCanConfirmKind`/`assertCan` เอง (เดิม)
- `listRooms` การ์ดมี `memberIds` อยู่แล้ว · `getRoom` คืน `members` เพิ่ม (ใช้ listMembers)
## Files you own
`src/lib/ai/secretary/members.ts` · `src/lib/ai/service.ts` (hunk seeHistory ใน listMessages) · `src/lib/ai/secretary/rooms.ts` (`getRoom` + members) · `docs/modules/31-secretary.md` §5/§7 · `ledger/wo-notes/sec-s1.6.md`
## Acceptance = `scripts/qc-sec-s1.6.mts` ทั้งหมด PASS + regression `qc-ai-phase-b1` `qc-ai-phase-b2` `qc-ai-proposals` `qc-ai-plan` `qc-mobile-chat` `qc-sec-s1.4` (ต้องยังผ่าน) เท่า baseline · typecheck 0 · fitness ×2 · 2 ผู้ตรวจ

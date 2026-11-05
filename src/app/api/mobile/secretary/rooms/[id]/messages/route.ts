// GET /api/mobile/secretary/rooms/[id]/messages?before&take — ข้อความในห้อง (เก่า→ใหม่ ภายในหน้า) · หน้าแรก = ล่าสุด
//   R-S1.14d: lib `listMessages(ctx, conv, {before, take})` ใหม่→เก่าตัดที่ cursor คู่ `before=<iso>|<id>` แล้วกลับลำดับ · `nextBefore` = cursor ของแถวเก่าสุดเมื่อหน้าเต็ม
//   สมาชิก seeHistory=false เห็นเฉพาะหลัง addedAt (บังคับใน `listMessages`)
import { getRoom } from "@/lib/ai/secretary/rooms";
import { listMessages } from "@/lib/ai/service";
import { messageDto } from "@/lib/ai/secretary/dto";
import { cursorOf, fail, gate, idParam, notFound, ok, pairCursor, takeOf, type RouteCtx } from "../../../_shared";

export async function GET(req: Request, ctx: RouteCtx) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const id = await idParam(ctx, "id");
  const room = id ? await getRoom(a.c.conv, id) : null;
  if (!room) return notFound("ไม่พบห้องงานนี้");
  const q = new URL(req.url).searchParams;
  const before = pairCursor(q.get("before"));
  if (before === null) return fail(400, "invalid", "cursor ต้องเป็น <iso>|<id>", { field: "before" });
  const take = takeOf(q.get("take"), 50, 100);
  const page = await listMessages(a.c.conv, room.conversationId, { before: before ?? null, take });
  const first = page[0];
  return ok({ items: page.map(messageDto), nextBefore: page.length === take && first ? cursorOf(first.createdAt, first.id) : null });
}

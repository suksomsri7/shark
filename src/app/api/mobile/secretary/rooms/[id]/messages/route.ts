// GET /api/mobile/secretary/rooms/[id]/messages?before&take — ข้อความในห้อง (เก่า→ใหม่) · สมาชิก seeHistory=false เห็นเฉพาะหลัง addedAt (บังคับใน `listMessages`)
//   หน้า = `take` ข้อความล่าสุดที่เก่ากว่า `before` (ISO) · `nextBefore` = createdAt ของแถวแรกเมื่อยังมีเก่ากว่านี้
import { getRoom } from "@/lib/ai/secretary/rooms";
import { listMessages } from "@/lib/ai/service";
import { messageDto } from "@/lib/ai/secretary/dto";
import { dateOf, fail, gate, idParam, notFound, ok, takeOf, type RouteCtx } from "../../../_shared";

const SCAN_MAX = 500; // listMessages เรียงเก่า→ใหม่ · ห้องงานยาวไม่เกินนี้ในรุ่นแรก (หนี้: cursor ใน lib)

export async function GET(req: Request, ctx: RouteCtx) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const id = await idParam(ctx, "id");
  const room = id ? await getRoom(a.c.conv, id) : null;
  if (!room) return notFound("ไม่พบห้องงานนี้");
  const q = new URL(req.url).searchParams;
  const before = dateOf(q.get("before"));
  if (before === null) return fail(400, "invalid", "รูปแบบเวลาไม่ถูกต้อง", { field: "before" });
  const take = takeOf(q.get("take"), 50, 100);
  const all = await listMessages(a.c.conv, room.conversationId, SCAN_MAX);
  const older = before ? all.filter((m) => m.createdAt < before) : all;
  const page = older.slice(-take);
  return ok({ items: page.map(messageDto), nextBefore: older.length > page.length && page[0] ? page[0].createdAt.toISOString() : null });
}

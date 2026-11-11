// GET /api/mobile/secretary/rooms/[id] — ห้องเดียว (สถานะ · สมาชิก · บริบทลูกค้า · `plans` PENDING/RUNNING + สถานะต่อขั้นสำหรับการ์ด A3) · มองไม่เห็น/ร้านอื่น = 404 (R-K1)
import { getRoom } from "@/lib/ai/secretary/rooms";
import { roomDto } from "@/lib/ai/secretary/dto";
import { roomPlansFor } from "@/lib/ai/secretary/views";
import { gate, idParam, notFound, ok, type RouteCtx, withErrors } from "../../_shared";

async function GET_(req: Request, ctx: RouteCtx) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const id = await idParam(ctx, "id");
  const room = id ? await getRoom(a.c.conv, id) : null;
  if (!room) return notFound("ไม่พบห้องงานนี้");
  return ok({ ...roomDto(room, { userId: a.c.userId, role: a.c.m.role }), plans: await roomPlansFor(a.c.conv, room.conversationId) });
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const GET = withErrors("secretary/rooms/[id] GET", GET_);

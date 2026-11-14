// GET /api/mobile/secretary/rooms/[id] — ห้องเดียว (สถานะ · สมาชิก · บริบทลูกค้า · `plans` PENDING/RUNNING + สถานะต่อขั้นสำหรับการ์ด A3) · มองไม่เห็น/ร้านอื่น = 404 (R-K1)
import { getRoom } from "@/lib/ai/secretary/rooms";
import { roomDto } from "@/lib/ai/secretary/dto";
import { roomPlansFor } from "@/lib/ai/secretary/views";
import { roomReminders } from "@/lib/modules/calendar/items";
import { roomCards } from "@/lib/modules/calendar/room-cards";
import { gate, idParam, notFound, ok, type RouteCtx, withErrors } from "../../_shared";

async function GET_(req: Request, ctx: RouteCtx) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const id = await idParam(ctx, "id");
  const room = id ? await getRoom(a.c.conv, id) : null;
  if (!room) return notFound("ไม่พบห้องงานนี้");
  // CAL1.6 ▸ R-CAL-20: การ์ดเตือนในห้อง (จอ 5) — เฉพาะ CalItem ของผู้เรียก (userId = โทเค็น) · สมาชิกห้องคนอื่นไม่ได้ ◂
  const viewer = { userId: a.c.userId, tenantId: a.c.tenantId, membership: a.c.m };
  const reminders = await roomReminders(viewer, room.id);
  // calendar_b ▸ review b B1: การ์ด agenda/รายการเตือนที่เครื่องมือเลขาบันทึก (ช่วงวันเท่านั้น) — เฉพาะของผู้เรียก · แอปดึง GET calendar/agenda เอง ◂
  const calendarCards = await roomCards(viewer, room.id);
  return ok({ ...roomDto(room, { userId: a.c.userId, role: a.c.m.role }), plans: await roomPlansFor(a.c.conv, room.conversationId), reminders, calendarCards });
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const GET = withErrors("secretary/rooms/[id] GET", GET_);

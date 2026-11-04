// GET /api/mobile/secretary/rooms/[id]/proposals — ข้อเสนอ + แผนที่รออนุมัติในห้อง (เก่า→ใหม่) · ไม่มี payload ดิบ (dto)
//   สมาชิก seeHistory=false ไม่เห็นของก่อน addedAt (R-S1.6a · บังคับใน lib) · มองไม่เห็นห้อง = 404
import { getRoom } from "@/lib/ai/secretary/rooms";
import { listPendingProposals } from "@/lib/ai/proposals";
import { listPendingPlans } from "@/lib/ai/plans";
import { planDto, proposalDto } from "@/lib/ai/secretary/dto";
import { gate, idParam, notFound, ok, type RouteCtx } from "../../../_shared";

export async function GET(req: Request, ctx: RouteCtx) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const id = await idParam(ctx, "id");
  const room = id ? await getRoom(a.c.conv, id) : null;
  if (!room) return notFound("ไม่พบห้องงานนี้");
  const [props, plans] = await Promise.all([listPendingProposals(a.c.conv, room.conversationId), listPendingPlans(a.c.conv, room.conversationId)]);
  const items = [...props.map(proposalDto), ...plans.map(planDto)].sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime());
  return ok({ items });
}

// DELETE /api/mobile/secretary/rooms/[id]/members/[userId] — เอาออก/ออกจากห้อง (`removeMember` · ผู้เปิดห้อง/OWNER เอาใครออกก็ได้ · สมาชิกออกเองได้)
import { removeMember } from "@/lib/ai/secretary/members";
import { forbidden, gate, idParam, notFound, ok, withRateLimit, type RouteCtx } from "../../../../_shared";

export async function DELETE(req: Request, ctx: RouteCtx<"id" | "userId">) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(a.c.userId, "room-members");
  if (rl) return rl;
  const [id, userId] = [await idParam(ctx, "id"), await idParam(ctx, "userId")];
  if (!id || !userId) return notFound("ไม่พบห้องงานนี้");
  const r = await removeMember(a.c.conv, id, userId);
  if (r.ok) return ok({ ok: true });
  if (r.error === "forbidden") return forbidden(r.message);
  return notFound(r.message); // not_found · not_a_member
}

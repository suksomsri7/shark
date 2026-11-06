// DELETE /api/mobile/secretary/rooms/[id]/members/[userId] — เอาออก/ออกจากห้อง (`removeMember` · ผู้เปิดห้อง/OWNER เอาใครออกก็ได้ · สมาชิกออกเองได้)
import { removeMember } from "@/lib/ai/secretary/members";
import { forbidden, gate, idParam, notFound, ok, withRateLimit, type RouteCtx, withErrors } from "../../../../_shared";

async function DELETE_(req: Request, ctx: RouteCtx<"id" | "userId">) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "room-members");
  if (rl) return rl;
  const [id, userId] = [await idParam(ctx, "id"), await idParam(ctx, "userId")];
  if (!id || !userId) return notFound("ไม่พบห้องงานนี้");
  const r = await removeMember(a.c.conv, id, userId);
  if (r.ok) return ok({ ok: true });
  if (r.error === "forbidden") return forbidden(r.message);
  return notFound(r.message); // not_found · not_a_member
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const DELETE = withErrors("secretary/rooms/[id]/members/[userId] DELETE", DELETE_);

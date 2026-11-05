// DELETE /api/mobile/secretary/staff/invites/[id] — ยกเลิกคำเชิญที่ยังไม่รับ (`cancelInvite` · MANAGER ยกเลิกได้เฉพาะใบ STAFF) · ไม่พบ/ไม่มีสิทธิ์ = 404
import { cancelInvite } from "@/lib/staff/invite";
import { gate, idParam, notFound, ok, withRateLimit, type RouteCtx } from "../../../_shared";

export async function DELETE(req: Request, ctx: RouteCtx) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "staff-invite", 10);
  if (rl) return rl;
  const id = await idParam(ctx, "id");
  return id && (await cancelInvite({ tenantId: a.c.tenantId, actorUserId: a.c.userId, membership: a.c.m }, id)) ? ok({ ok: true }) : notFound("ไม่พบคำเชิญนี้");
}

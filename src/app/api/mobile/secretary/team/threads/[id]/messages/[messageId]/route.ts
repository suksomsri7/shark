// DELETE /api/mobile/secretary/team/threads/[id]/messages/[messageId] — ลบข้อความของตัวเอง (soft) · ไม่ใช่ของเรา/ไม่ใช่สมาชิก = 404 (B27)
import { deleteMessage } from "@/lib/team-chat/service";
import { gate, idParam, notFound, ok, withRateLimit, type RouteCtx, withErrors } from "../../../../../_shared";
import { rlKey, teamCtx } from "../../../../_team";

async function DELETE_(req: Request, ctx: RouteCtx<"id" | "messageId">) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(rlKey(a.c), "team-thread-w");
  if (rl) return rl;
  const id = await idParam(ctx, "id");
  const mid = await idParam(ctx, "messageId");
  if (!id || !mid || !(await deleteMessage(teamCtx(a.c), id, mid))) return notFound("ไม่พบข้อความนี้");
  return ok({ ok: true });
}

export const DELETE = withErrors("secretary/team/threads/[id]/messages/[messageId] DELETE", DELETE_);

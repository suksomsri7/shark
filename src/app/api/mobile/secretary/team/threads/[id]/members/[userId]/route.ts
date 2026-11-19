// DELETE /api/mobile/secretary/team/threads/[id]/members/[userId] — เอาออกจากกลุ่ม (ผู้ดูแล) · userId = ตัวเอง ⇒ ออกจากกลุ่ม
// PUT    /api/mobile/secretary/team/threads/[id]/members/[userId] {admin} — ตั้ง/ถอดผู้ดูแลกลุ่ม (ผู้ดูแลเท่านั้น · เหลือผู้ดูแลอย่างน้อย 1) (B27)
import { z } from "zod";
import { removeGroupMember, setGroupAdmin } from "@/lib/team-chat/service";
import { gate, idParam, notFound, ok, readBody, withRateLimit, type RouteCtx, withErrors } from "../../../../../_shared";
import { rlKey, teamCtx, teamFail } from "../../../../_team";

async function DELETE_(req: Request, ctx: RouteCtx<"id" | "userId">) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(rlKey(a.c), "team-thread-w");
  if (rl) return rl;
  const id = await idParam(ctx, "id");
  const uid = await idParam(ctx, "userId");
  if (!id || !uid) return notFound();
  const r = await removeGroupMember(teamCtx(a.c), id, uid);
  if (!r.ok) return teamFail(r);
  return ok({ ok: true });
}

const Body = z.object({ admin: z.boolean() }).strict();

async function PUT_(req: Request, ctx: RouteCtx<"id" | "userId">) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(rlKey(a.c), "team-thread-w");
  if (rl) return rl;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const id = await idParam(ctx, "id");
  const uid = await idParam(ctx, "userId");
  if (!id || !uid) return notFound();
  const r = await setGroupAdmin(teamCtx(a.c), id, uid, b.v.admin);
  if (!r.ok) return teamFail(r);
  return ok({ ok: true });
}

export const DELETE = withErrors("secretary/team/threads/[id]/members/[userId] DELETE", DELETE_);
export const PUT = withErrors("secretary/team/threads/[id]/members/[userId] PUT", PUT_);

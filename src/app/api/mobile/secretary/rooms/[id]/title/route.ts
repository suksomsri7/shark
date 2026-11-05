// PUT /api/mobile/secretary/rooms/[id]/title {title} — เปลี่ยนชื่อห้อง (ผู้เปิดห้องหรือ OWNER · `renameRoom` · ≤ 60 ตัว ตัดเติม "…")
import { z } from "zod";
import { getRoom, renameRoom, roomTitleFrom } from "@/lib/ai/secretary/rooms";
import { forbidden, gate, idParam, notFound, ok, readBody, withRateLimit, type RouteCtx } from "../../../_shared";

const Body = z.object({ title: z.string().trim().min(1).max(200) }).strict();

export async function PUT(req: Request, ctx: RouteCtx) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "room-title");
  if (rl) return rl;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const id = await idParam(ctx, "id");
  const room = id ? await getRoom(a.c.conv, id) : null;
  if (!room) return notFound("ไม่พบห้องงานนี้");
  if (!(await renameRoom(a.c.conv, room.id, b.v.title))) return forbidden("เปลี่ยนชื่อห้องได้เฉพาะผู้เปิดห้องหรือเจ้าของกิจการ");
  return ok({ ok: true, title: roomTitleFrom(b.v.title) });
}

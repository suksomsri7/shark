// POST /api/mobile/secretary/rooms/[id]/close — ปิดห้อง (ผู้เปิดห้องหรือ OWNER · `closeRoom`) · มองไม่เห็น 404 · ไม่ใช่ผู้ดูแล 403 · ปิดอยู่แล้ว 409
import { z } from "zod";
import { closeRoom, getRoom } from "@/lib/ai/secretary/rooms";
import { fail, forbidden, gate, idParam, notFound, ok, readBody, withRateLimit, type RouteCtx, withErrors } from "../../../_shared";

async function POST_(req: Request, ctx: RouteCtx) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "room-close");
  if (rl) return rl;
  const b = await readBody(req, z.object({}).strict());
  if (!b.ok) return b.res;
  const id = await idParam(ctx, "id");
  const room = id ? await getRoom(a.c.conv, id) : null;
  if (!room) return notFound("ไม่พบห้องงานนี้");
  if (await closeRoom(a.c.conv, room.id)) return ok({ ok: true });
  if (room.closedAt) return fail(409, "closed", "ห้องนี้ปิดไปแล้ว");
  return forbidden("ปิดห้องได้เฉพาะผู้เปิดห้องหรือเจ้าของกิจการ");
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const POST = withErrors("secretary/rooms/[id]/close POST", POST_);

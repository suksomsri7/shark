// PUT/DELETE /api/mobile/secretary/scheduled/[id] — เปิด/ปิด · ลบ งานประจำ (เจ้าของงานหรือ OWNER · งานแบบเดิมที่ไม่มีเจ้าของ = OWNER เท่านั้น)
//   PUT รับ {active} (`setTaskActive`) · การเปลี่ยนเวลา/ความถี่/วัน/ช่องทาง = ยังไม่มีฟังก์ชันใน lib (S1.9) ⇒ 400 not_supported (ลบแล้วตั้งใหม่) — หนี้ใน wo-notes
import { z } from "zod";
import { CHANNELS, deleteTask, FREQUENCIES, listTasks, setTaskActive } from "@/lib/ai/scheduled";
import { fail, forbidden, gate, idParam, notFound, ok, readBody, withRateLimit, type RouteCtx, type SecCtx } from "../../_shared";

const Body = z
  .object({
    active: z.boolean().optional(),
    hourBkk: z.number().int().min(0).max(23).optional(),
    frequency: z.enum(FREQUENCIES).optional(),
    days: z.array(z.number().int().min(0).max(31)).max(31).optional(),
    channels: z.array(z.enum(CHANNELS)).max(2).optional(),
  })
  .strict();

/** งานที่ผู้ใช้นี้จัดการได้ — ไม่มี/ร้านอื่น = "missing" · มีแต่ไม่ใช่ของเขา = "forbidden" (คนอื่นไม่ได้เห็นงานนี้ในรายการ ⇒ ตอบ 404) */
async function ownTask(c: SecCtx, id: string) {
  const t = (await listTasks({ tenantId: c.tenantId })).find((x) => x.id === id);
  if (!t) return null;
  return c.m.role === "OWNER" || (t.ownerUserId !== null && t.ownerUserId === c.userId) ? t : null;
}

export async function PUT(req: Request, ctx: RouteCtx) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(a.c.userId, "scheduled");
  if (rl) return rl;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const id = await idParam(ctx, "id");
  const t = id ? await ownTask(a.c, id) : null;
  if (!t) return notFound("ไม่พบงานประจำนี้");
  const { active, ...rest } = b.v;
  if (Object.keys(rest).length > 0) return fail(400, "not_supported", "รุ่นนี้เปลี่ยนเวลา/ความถี่ของงานประจำไม่ได้ — ลบแล้วตั้งใหม่");
  if (active === undefined) return fail(400, "invalid", "ต้องระบุเปิดหรือปิดงานประจำ", { field: "active" });
  if (!(await setTaskActive({ tenantId: a.c.tenantId }, t.id, active))) return forbidden();
  return ok({ ok: true, active });
}

export async function DELETE(req: Request, ctx: RouteCtx) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(a.c.userId, "scheduled");
  if (rl) return rl;
  const id = await idParam(ctx, "id");
  const t = id ? await ownTask(a.c, id) : null;
  if (!t) return notFound("ไม่พบงานประจำนี้");
  if (!(await deleteTask({ tenantId: a.c.tenantId }, t.id))) return notFound("ไม่พบงานประจำนี้");
  return ok({ ok: true });
}

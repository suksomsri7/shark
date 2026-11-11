// PUT/DELETE /api/mobile/secretary/scheduled/[id] — แก้ · ลบ งานประจำ (เจ้าของงานหรือ OWNER · งานแบบเดิมที่ไม่มีเจ้าของ = OWNER เท่านั้น)
//   PUT {instruction?, hourBkk?, frequency?, days?, channels?, active?} → lib `updateTask` (R-S1.14f · ตรวจด้วยตัวเดียวกับตอนสร้าง · คง ownerUserId/lastRunDay)
import { z } from "zod";
import { CHANNELS, deleteTask, describeFrequency, FREQUENCIES, listTasks, updateTask } from "@/lib/ai/scheduled";
import { taskDto } from "@/lib/ai/secretary/dto";
import { fail, gate, idParam, notFound, ok, readBody, thrown, withRateLimit, type RouteCtx, type SecCtx, withErrors } from "../../_shared";

const Body = z
  .object({
    instruction: z.string().trim().min(1).max(2000).optional(),
    hourBkk: z.number().int().min(0).max(23).optional(),
    frequency: z.enum(FREQUENCIES).optional(),
    days: z.array(z.number().int().min(0).max(31)).max(31).optional(),
    channels: z.array(z.enum(CHANNELS)).min(1).max(2).optional(),
    active: z.boolean().optional(),
  })
  .strict();

/** งานที่ผู้ใช้นี้จัดการได้ (ลบ) — ไม่มี/ร้านอื่น/ไม่ใช่ของเขา = null (คนอื่นไม่เห็นงานนี้ในรายการ ⇒ 404) */
async function ownTask(c: SecCtx, id: string) {
  const t = (await listTasks({ tenantId: c.tenantId })).find((x) => x.id === id);
  if (!t) return null;
  return c.m.role === "OWNER" || (t.ownerUserId !== null && t.ownerUserId === c.userId) ? t : null;
}

async function PUT_(req: Request, ctx: RouteCtx) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "scheduled");
  if (rl) return rl;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  if (Object.keys(b.v).length === 0) return fail(400, "invalid", "ไม่มีช่องที่แก้");
  const id = await idParam(ctx, "id");
  if (!id) return notFound("ไม่พบงานประจำนี้");
  try {
    const r = await updateTask({ tenantId: a.c.tenantId, userId: a.c.userId }, id, b.v);
    if (!r.ok) return notFound("ไม่พบงานประจำนี้"); // forbidden ตอบเหมือนไม่มี (คนอื่นไม่เห็นงานนี้)
    return ok({ ok: true, task: taskDto(r.task, a.c.userId, describeFrequency(r.task.frequency, r.task.days)) });
  } catch (e) {
    return thrown(e, "scheduled.put");
  }
}

async function DELETE_(req: Request, ctx: RouteCtx) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "scheduled");
  if (rl) return rl;
  const id = await idParam(ctx, "id");
  const t = id ? await ownTask(a.c, id) : null;
  if (!t) return notFound("ไม่พบงานประจำนี้");
  if (!(await deleteTask({ tenantId: a.c.tenantId }, t.id))) return notFound("ไม่พบงานประจำนี้");
  return ok({ ok: true });
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const PUT = withErrors("secretary/scheduled/[id] PUT", PUT_);
export const DELETE = withErrors("secretary/scheduled/[id] DELETE", DELETE_);

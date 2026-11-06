// GET/POST /api/mobile/secretary/scheduled — งานประจำของเลขา (S1.9 · R-K5) · GET: OWNER เห็นทั้งร้าน · คนอื่นเห็นงานของตัวเอง
//   POST {instruction, hourBkk, frequency?, days?, channels?} → `createTask` ในนามผู้ตั้ง (ownerUserId = ผู้ใช้ของโทเค็น · เพดาน FREE_PACK.scheduledMax · ตรวจครบใน lib)
import { z } from "zod";
import { CHANNELS, createTask, describeFrequency, FREQUENCIES, listTasks } from "@/lib/ai/scheduled";
import { FREE_PACK } from "@/lib/ai/secretary/pack";
import { taskDto } from "@/lib/ai/secretary/dto";
import { gate, ok, readBody, thrown, withRateLimit, withErrors } from "../_shared";

const Body = z
  .object({
    instruction: z.string().trim().min(1).max(2000),
    hourBkk: z.number().int().min(0).max(23),
    frequency: z.enum(FREQUENCIES).optional(),
    days: z.array(z.number().int().min(0).max(31)).max(31).optional(),
    channels: z.array(z.enum(CHANNELS)).max(2).optional(),
  })
  .strict();

async function GET_(req: Request) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const all = await listTasks({ tenantId: a.c.tenantId });
  const rows = a.c.m.role === "OWNER" ? all : all.filter((t) => t.ownerUserId === a.c.userId);
  return ok({ items: rows.map((t) => taskDto(t, a.c.userId, describeFrequency(t.frequency, t.days))), max: FREE_PACK.scheduledMax });
}

async function POST_(req: Request) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "scheduled");
  if (rl) return rl;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  try {
    const r = await createTask({ tenantId: a.c.tenantId }, { ...b.v, ownerUserId: a.c.userId });
    return ok({ id: r.id });
  } catch (e) {
    return thrown(e, "scheduled.post");
  }
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const GET = withErrors("secretary/scheduled GET", GET_);
export const POST = withErrors("secretary/scheduled POST", POST_);

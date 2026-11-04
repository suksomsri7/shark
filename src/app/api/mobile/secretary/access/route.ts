// GET/PUT /api/mobile/secretary/access — ระดับเลขาต่อระบบ (B3 · S1.3) · PUT {module, level} OWNER เท่านั้น (`setAccess` โหลด Membership จากฐานเอง · AUTO = ปฏิเสธ)
//   รายการ = เฉพาะโมดูลของระบบที่ร้านเปิด + แถว `ai` (ปิดไม่ได้) — `views.accessItemsFor` (R-S1.14j)
import { z } from "zod";
import { ACCESS_LEVELS, getAccess, setAccess } from "@/lib/ai/secretary/access";
import { accessItemsFor } from "@/lib/ai/secretary/views";
import { gate, ok, readBody, thrown, withRateLimit } from "../_shared";

const Body = z.object({ module: z.string().trim().min(1).max(40), level: z.string().trim().min(1).max(10) }).strict();
const view = async (tenantId: string, levels: Awaited<ReturnType<typeof getAccess>>) => ({ items: await accessItemsFor(tenantId, levels), levels: ACCESS_LEVELS });

export async function GET(req: Request) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  return ok(await view(a.c.tenantId, await getAccess(a.c.tenantId)));
}

export async function PUT(req: Request) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "access");
  if (rl) return rl;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  try {
    return ok(await view(a.c.tenantId, await setAccess(a.c.tenantId, { userId: a.c.userId, membership: a.c.m }, b.v.module, b.v.level)));
  } catch (e) {
    return thrown(e, "access.put");
  }
}

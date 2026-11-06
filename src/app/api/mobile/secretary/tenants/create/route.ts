// POST /api/mobile/secretary/tenants/create {name, type?, systems?} — สร้างกิจการจากแอป (S1.25 `createTenantFromApp` · เพดาน 3 ร้าน · ห้องแรกของเลขา)
//   Bearer อย่างเดียว (ผู้ใช้ใหม่ยังไม่มีร้าน) · `TenantRuleError` = 400 ข้อความไทย
import { z } from "zod";
import { createTenantFromApp, TenantRuleError } from "@/lib/mobile/tenants";
import { runRoomJobs } from "@/lib/ai/secretary/worker";
import { fail, ok, readBody, runAfter, thrown, userGate, withRateLimit, withErrors } from "../../_shared";

/** SEC S3a.1-S1 R-Z3/R-Z5: ห้องแรกของร้านมีงานแล้ว — route รัน worker ของงานนั้นใน `after()` (เพดานแพลตฟอร์ม · deadline 240 วิ) */
export const maxDuration = 300;

const Body = z.object({ name: z.string().max(200), type: z.string().max(40).optional(), systems: z.array(z.string().max(40)).max(20).optional() }).strict();

async function POST_(req: Request) {
  const a = await userGate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(a.userId, "tenant-create", 5);
  if (rl) return rl;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  try {
    const start = Date.now();
    const r = await createTenantFromApp(a.userId, { name: b.v.name, type: b.v.type ?? "other", systems: b.v.systems ?? [] });
    const jobId = r.room?.jobId;
    if (jobId) await runAfter(() => runRoomJobs({ jobIds: [jobId], limit: 1, deadline: start + 240_000 }));
    return ok({ tenant: { id: r.tenant.id, name: r.tenant.name, slug: r.tenant.slug }, systems: r.systems, room: r.room ? { roomId: r.room.roomId, conversationId: r.room.conversationId } : null });
  } catch (e) {
    if (e instanceof TenantRuleError) return fail(400, "invalid", e.message);
    return thrown(e, "tenants.create");
  }
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const POST = withErrors("secretary/tenants/create POST", POST_);

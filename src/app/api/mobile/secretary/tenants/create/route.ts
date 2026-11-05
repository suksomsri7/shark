// POST /api/mobile/secretary/tenants/create {name, type?, systems?} — สร้างกิจการจากแอป (S1.25 `createTenantFromApp` · เพดาน 3 ร้าน · ห้องแรกของเลขา)
//   Bearer อย่างเดียว (ผู้ใช้ใหม่ยังไม่มีร้าน) · `TenantRuleError` = 400 ข้อความไทย
import { z } from "zod";
import { createTenantFromApp, TenantRuleError } from "@/lib/mobile/tenants";
import { fail, ok, readBody, thrown, userGate, withRateLimit } from "../../_shared";

const Body = z.object({ name: z.string().max(200), type: z.string().max(40).optional(), systems: z.array(z.string().max(40)).max(20).optional() }).strict();

export async function POST(req: Request) {
  const a = await userGate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(a.userId, "tenant-create", 5);
  if (rl) return rl;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  try {
    const r = await createTenantFromApp(a.userId, { name: b.v.name, type: b.v.type ?? "other", systems: b.v.systems ?? [] });
    return ok({ tenant: { id: r.tenant.id, name: r.tenant.name, slug: r.tenant.slug }, systems: r.systems, room: r.room });
  } catch (e) {
    if (e instanceof TenantRuleError) return fail(400, "invalid", e.message);
    return thrown(e, "tenants.create");
  }
}

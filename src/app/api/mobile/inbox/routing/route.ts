// GET/PUT /api/mobile/inbox/routing — กฎรับเรื่อง + เวร + SLA (อ่าน = สิทธิ์ดูแชท · แก้ = OWNER/MANAGER ใน `setRules` · S1.24)
import { z } from "zod";
import { tenantDb } from "@/lib/core/db";
import { ForbiddenError } from "@/lib/core/rbac";
import { listOnDuty, listRules, setRules } from "@/lib/modules/chat/routing";
import { ruleDto } from "@/lib/mobile/inbox-dto";
import { fail, gate, notFound, READ, readBody, systemOf } from "../_shared";

async function routingDto(tenantId: string, systemId: string) {
  const [rules, onDuty, setting] = await Promise.all([
    listRules(tenantId, systemId),
    listOnDuty(tenantId),
    tenantDb({ tenantId, systemId }).chatSetting.findFirst({ where: { systemId }, select: { slaFirstResponseMin: true, unassignedAlertMin: true } }),
  ]);
  return {
    rules: rules.map(ruleDto),
    onDuty: onDuty.map((d) => ({ userId: d.userId, name: d.name, since: d.since.toISOString() })),
    sla: setting ? { firstResponseMin: setting.slaFirstResponseMin, unassignedAlertMin: setting.unassignedAlertMin } : null,
  };
}

export async function GET(req: Request) {
  const a = await gate(req, [READ]);
  if (!a.ok) return a.res;
  const sid = await systemOf(a.c.tenantId, new URL(req.url).searchParams.get("systemId"));
  if (!sid) return notFound("ไม่พบระบบแชทนี้");
  return Response.json(await routingDto(a.c.tenantId, sid));
}

const Rule = z.object({ channel: z.string().max(32).nullable().optional(), mode: z.string().max(32), enabled: z.boolean(), order: z.number().int().min(0).max(1000).optional() }).strict();
const Body = z.object({ systemId: z.string().max(64).optional(), rules: z.array(Rule).max(20) }).strict();

export async function PUT(req: Request) {
  const a = await gate(req, [READ]);
  if (!a.ok) return a.res;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const sid = await systemOf(a.c.tenantId, b.v.systemId);
  if (!sid) return notFound("ไม่พบระบบแชทนี้");
  try {
    await setRules(a.c.tenantId, { userId: a.c.userId }, sid, b.v.rules);
  } catch (e) {
    if (e instanceof ForbiddenError) return fail(403, "forbidden", "ตั้งกฎรับเรื่องได้เฉพาะเจ้าของร้านหรือผู้จัดการ");
    return fail(422, "invalid", e instanceof Error ? e.message : "บันทึกกฎไม่สำเร็จ");
  }
  return Response.json(await routingDto(a.c.tenantId, sid));
}

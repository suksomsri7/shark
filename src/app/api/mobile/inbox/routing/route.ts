// GET/PUT /api/mobile/inbox/routing — กฎรับเรื่อง + เวร + SLA (อ่าน = สิทธิ์ดูแชท · แก้ = OWNER/MANAGER ใน `setRules` · S1.24)
import { z } from "zod";
import { tenantDb } from "@/lib/core/db";
import { ForbiddenError } from "@/lib/core/rbac";
import { loadTeam, listOnDuty, listRules, respondersOf, setRules } from "@/lib/modules/chat/routing";
import { ruleDto } from "@/lib/mobile/inbox-dto";
import { fail, gate, limited, notFound, READ, readBody, safeMessage, systemOf, type InboxCtx, withErrors } from "../_shared";

/** คนในเวรที่ผู้ดูตอบแทนได้ = ผู้ตอบได้ในหน่วยใดหน่วยหนึ่งที่ผู้ดูเห็น (เห็นทุกหน่วย = ทุกคนที่ตอบได้ · R-S1.21g) */
async function visibleResponders(c: InboxCtx): Promise<Set<string>> {
  const team = await loadTeam(c.tenantId);
  const units: (string | null)[] = c.ua.includes("*") ? [null] : c.ua;
  return new Set(units.flatMap((u) => respondersOf(team, u).map((r) => r.userId)));
}

async function routingDto(c: InboxCtx, systemId: string) {
  const tenantId = c.tenantId;
  const [rules, onDuty, setting] = await Promise.all([
    listRules(tenantId, systemId),
    visibleResponders(c).then((ids) => listOnDuty(tenantId, ids)),
    tenantDb({ tenantId, systemId }).chatSetting.findFirst({ where: { systemId }, select: { slaFirstResponseMin: true, unassignedAlertMin: true } }),
  ]);
  return {
    rules: rules.map(ruleDto),
    onDuty: onDuty.map((d) => ({ userId: d.userId, name: d.name, since: d.since.toISOString() })),
    sla: setting ? { firstResponseMin: setting.slaFirstResponseMin, unassignedAlertMin: setting.unassignedAlertMin } : null,
  };
}

async function GET_(req: Request) {
  const a = await gate(req, [READ]);
  if (!a.ok) return a.res;
  const sid = await systemOf(a.c.tenantId, new URL(req.url).searchParams.get("systemId"));
  if (!sid) return notFound("ไม่พบระบบแชทนี้");
  return Response.json(await routingDto(a.c, sid));
}

const Rule = z.object({ channel: z.string().max(32).nullable().optional(), mode: z.string().max(32), enabled: z.boolean(), order: z.number().int().min(0).max(1000).optional() }).strict();
const Body = z.object({ systemId: z.string().max(64).optional(), rules: z.array(Rule).max(20) }).strict();

async function PUT_(req: Request) {
  const a = await gate(req, [READ]);
  if (!a.ok) return a.res;
  const rl = await limited(a.c, "routing", 30); // SEC S3a.1-S2 ▸ R-Z20 ◂
  if (rl) return rl;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const sid = await systemOf(a.c.tenantId, b.v.systemId);
  if (!sid) return notFound("ไม่พบระบบแชทนี้");
  try {
    await setRules(a.c.tenantId, { userId: a.c.userId }, sid, b.v.rules);
  } catch (e) {
    if (e instanceof ForbiddenError) return fail(403, "forbidden", "ตั้งกฎรับเรื่องได้เฉพาะเจ้าของร้านหรือผู้จัดการ");
    return fail(422, "invalid", await safeMessage(e, "inbox.routing", "บันทึกกฎไม่สำเร็จ — ตรวจข้อมูลแล้วลองใหม่")); // R-Z26: ไม่ส่ง e.message ดิบ ◂
  }
  return Response.json(await routingDto(a.c, sid));
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const GET = withErrors("inbox/routing GET", GET_);
export const PUT = withErrors("inbox/routing PUT", PUT_);

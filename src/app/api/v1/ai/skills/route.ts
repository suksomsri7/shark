// GET /api/v1/ai/skills — สารบัญสกิลของร้านนี้ (manifest สาธารณะ)
//
// เป้าหมาย: ให้ "ลูกค้าเอา AI ของตัวเองมาเสียบ" ได้ — ไม่ว่าจะ Claude / GPT / Gemini / โมเดลเปิด
// วิธีใช้ฝั่งผู้เรียก:
//   1) GET /api/v1/ai/skills            → รู้ว่าร้านนี้ทำอะไรได้บ้าง (สรุปสั้นภาษาอังกฤษ)
//   2) GET /api/v1/ai/skills/<id>       → ได้ JSON Schema ของเครื่องมือในสกิลนั้น (รูปแบบ OpenAI tools)
//   3) POST /api/v1/ai/tools/<name>     → สั่งทำงานจริง (อ่านได้ทันที · เขียนต้องผ่านการยืนยันของเจ้าของ)
//
// ออกแบบตามหลักเดียวกับที่ผู้ช่วยในระบบใช้ — ไม่มีสองมาตรฐาน:
// สกิลที่คืนกรองตามระบบที่ร้านเปิดใช้จริง (ร้านตัดผมไม่เห็นเครื่องมือโรงแรม)
import { prisma } from "@/lib/core/db";
import { apiJson, authenticateApiRequest } from "@/lib/api-keys/route-auth";
import { CORE_TOOLS, skillToolsForApiKey, skillsForTenant } from "@/lib/ai/skills";
import { crmApi } from "@/lib/modules/crm";
import { aiApiKeyActor } from "@/lib/ai/actor";
import { toolVerdict } from "@/lib/ai/tool-access";
import { generalToolGate } from "../general-key-gate";

export async function GET(req: Request): Promise<Response> {
  const auth = await authenticateApiRequest(req);
  if (!auth.ok) return auth.response;

  const systems = await prisma.appSystem.findMany({
    where: { tenantId: auth.tenantId, active: true },
    select: { type: true },
  });
  // กรอง 2 ชั้น: ระบบที่ร้านเปิดจริง × ขอบเขตสิทธิ์ของคีย์ใบนี้
  // (คีย์ที่ถูกจำกัด scope ไว้ ไม่ควรเห็นสกิลที่ตัวเองเรียกไม่ได้เลยแม้แต่ตัวเดียว)
  // CRM C1.10 ▸ ร้าน CRM รุ่นเดิม: `crm_create_lead` ยังอยู่ในสารบัญของทุกคีย์เหมือนก่อน C1.10 ◂
  const opts = { crmLegacyLead: await crmApi.crmLegacyLeadOpen(auth.tenantId, auth.systemId ?? req.headers.get("x-shark-system")?.trim() ?? null) };
  // CRM C5.5-G1 r2 (F4) ▸ + ด่านเดียวกับ executor — สารบัญไม่โฆษณาสิ่งที่คีย์ใบนี้เรียกแล้วโดนปฏิเสธ (แกนกลางด้วย) ◂
  // HF-APIV1 ▸ เครื่องมือนอก 4 โมดูล = คีย์กลางเท่านั้น (กรองทิ้งจากสารบัญเหมือน "ไม่มีสิทธิ์") ◂
  // C6.0 merge ▸ ต้องผ่านทั้งสองด่าน (generalToolGate ของ hotfix และ toolVerdict ของ CRM G1) ◂
  const actor = aiApiKeyActor({ tenantId: auth.tenantId, keyId: auth.keyId, scopes: auth.scopes, systemId: auth.systemId, scopesMalformed: auth.scopesMalformed });
  const usable = (names: readonly string[]) => names.filter((n) => generalToolGate(n, auth) && toolVerdict(actor, n, opts).ok);
  const skills = skillsForTenant(systems.map((s) => s.type)).filter(
    (s) => usable(skillToolsForApiKey(s, auth.scopes, opts)).length > 0,
  );

  return apiJson(
    {
      // เครื่องมือแกนกลาง: ใช้ได้เสมอ ไม่ต้องโหลดสกิล
      core: { tools: usable(CORE_TOOLS) }, // HF-APIV1 + CRM G1
      skills: skills.map((s) => ({
        id: s.id,
        label: s.label,
        summary: s.summary,
        toolCount: usable(skillToolsForApiKey(s, auth.scopes, opts)).length,
        href: `/api/v1/ai/skills/${s.id}`,
      })),
    },
    200,
  );
}

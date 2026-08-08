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
import { CORE_TOOLS, skillsForTenant } from "@/lib/ai/skills";

export async function GET(req: Request): Promise<Response> {
  const auth = await authenticateApiRequest(req);
  if (!auth.ok) return auth.response;

  const systems = await prisma.appSystem.findMany({
    where: { tenantId: auth.tenantId, active: true },
    select: { type: true },
  });
  const skills = skillsForTenant(systems.map((s) => s.type));

  return apiJson(
    {
      // เครื่องมือแกนกลาง: ใช้ได้เสมอ ไม่ต้องโหลดสกิล
      core: { tools: [...CORE_TOOLS] },
      skills: skills.map((s) => ({
        id: s.id,
        label: s.label,
        summary: s.summary,
        toolCount: s.tools.length,
        href: `/api/v1/ai/skills/${s.id}`,
      })),
    },
    200,
  );
}

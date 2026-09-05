// GET /api/v1/ai/skills/<id> — สคีมาเครื่องมือของสกิลนั้น (รูปแบบ OpenAI tools)
//
// คืนโครงที่เสียบเข้า LLM ค่ายไหนก็ได้โดยไม่ต้องแปลง:
//   { "tools": [ { "type": "function", "function": { name, description, parameters } } ] }
// (Anthropic ใช้ { name, description, input_schema } — แปลงได้ด้วยการ map ฟิลด์เดียว)
//
// `write: true` = เครื่องมือที่เปลี่ยนข้อมูล → ระบบไม่ทำทันที แต่สร้างข้อเสนอให้เจ้าของกดยืนยัน
// (กติกาความปลอดภัยเดียวกับผู้ช่วยในระบบ — AI ภายนอกไม่ได้สิทธิ์มากกว่า AI ของเราเอง)
import { prisma } from "@/lib/core/db";
import { apiJson, authenticateApiRequest } from "@/lib/api-keys/route-auth";
import { skillById, skillToolsForApiKey, skillsForTenant } from "@/lib/ai/skills";
import { toolRegistry } from "@/lib/ai/tools";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await authenticateApiRequest(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const skill = skillById(id);
  if (!skill) return apiJson({ error: "ไม่พบสกิลนี้" }, 404);

  // สกิลของระบบที่ร้านยังไม่เปิด = ไม่ควรรู้ว่ามีอยู่ (ตอบ 404 เหมือนไม่มี)
  const systems = await prisma.appSystem.findMany({
    where: { tenantId: auth.tenantId, active: true },
    select: { type: true },
  });
  // สกิลที่คีย์ใบนี้ไม่มีสิทธิ์แตะเลย (scope ไม่ถึง) ก็ตอบ 404 เหมือนกัน — ไม่บอกใบ้ว่ามีอะไรอยู่หลังกำแพง
  const allowed = skillToolsForApiKey(skill, auth.scopes);
  if (!skillsForTenant(systems.map((s) => s.type)).some((s) => s.id === id) || allowed.length === 0) {
    return apiJson({ error: "ร้านนี้ยังไม่ได้เปิดระบบที่รองรับสกิลนี้" }, 404);
  }

  const reg = toolRegistry();
  const tools = allowed
    .map((name) => reg.find((t) => t.def.name === name))
    .filter((t): t is NonNullable<typeof t> => Boolean(t))
    .map((t) => ({
      type: "function" as const,
      function: { name: t.def.name, description: t.def.description, parameters: t.def.parameters },
      write: Boolean(t.action),
    }));

  return apiJson({ id: skill.id, label: skill.label, summary: skill.summary, tools }, 200);
}

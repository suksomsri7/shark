// POST /api/v1/ai/tools/<name> — สั่งทำงานเครื่องมือ 1 ตัวจาก AI ภายนอก
//
// 🔴 กติกาความปลอดภัย (เท่ากับผู้ช่วยในระบบ ไม่มากกว่า):
// - เครื่องมือ "อ่าน" → ทำงานทันที คืนผลเป็น string เดียวกับที่ผู้ช่วยได้รับ
// - เครื่องมือ "เขียน" (action=true) → **ไม่ทำทันที** สร้างข้อเสนอผูกห้องแชท แล้วเจ้าของต้องกดยืนยันในแอป/เว็บ
//   AI ภายนอกจึงเปลี่ยนข้อมูลร้านเองไม่ได้เลย แม้จะถือ API key
// - tenantId มาจากคีย์เสมอ (ไม่รับจาก body) — กันข้ามร้าน
import { apiJson, authenticateApiRequest } from "@/lib/api-keys/route-auth";
import { runTool, toolRegistry } from "@/lib/ai/tools";
import { skillOfTool } from "@/lib/ai/skills";
import { prisma } from "@/lib/core/db";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<Response> {
  const auth = await authenticateApiRequest(req);
  if (!auth.ok) return auth.response;

  const { name } = await params;
  const tool = toolRegistry().find((t) => t.def.name === name);
  if (!tool) return apiJson({ error: `ไม่รู้จักเครื่องมือ "${name}"` }, 404);

  let body: { args?: unknown; conversationId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return apiJson({ error: "body ต้องเป็น JSON" }, 400);
  }

  // เครื่องมือเขียนต้องผูกห้องแชท เพราะข้อเสนอจะไปโผล่ให้เจ้าของกดยืนยันในห้องนั้น
  // ไม่ได้ระบุมา → เปิดห้องให้อัตโนมัติ เจ้าของจะเห็นเป็นบทสนทนาใหม่พร้อมการ์ดยืนยัน
  let conversationId = body.conversationId;
  if (tool.action && !conversationId) {
    const conv = await prisma.aiConversation.create({
      data: { tenantId: auth.tenantId, title: "คำขอจากผู้ช่วยภายนอก" },
    });
    conversationId = conv.id;
  }

  const result = await runTool(
    { tenantId: auth.tenantId, ...(conversationId ? { conversationId } : {}) },
    name,
    body.args ?? {},
  );

  return apiJson(
    {
      tool: name,
      skill: skillOfTool(name)?.id ?? "core",
      write: Boolean(tool.action),
      // เขียน = ยังไม่เกิดผล ต้องรอเจ้าของยืนยันในห้องนี้
      ...(tool.action ? { pendingConfirmation: true, conversationId } : {}),
      result,
    },
    200,
  );
}

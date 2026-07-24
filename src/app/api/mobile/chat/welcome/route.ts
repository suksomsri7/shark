// POST first-tap welcome (คำสั่งเจ้าของ 24 ก.ค.: กด orb ครั้งแรก = AI ทักพาตั้งค่า) — qc MC-8.x
// มีห้องแล้ว → {existing:true} ไม่สร้างเพิ่ม · ยังไม่มี → สร้างห้อง + ข้อความทัก deterministic (ห้ามยิง LLM) + choices
import { requireMobile, mobileError } from "@/lib/mobile/auth";
import { tenantDb } from "@/lib/core/db";
import { onboardingChecklist } from "@/lib/platform/onboarding-drip";
import { dnaFactsSummary } from "@/lib/ai/service";

const WELCOME_TITLE = "เริ่มต้นกับผู้ช่วย AI";

// ข้อ checklist ที่ยังไม่ทำ → ประโยคสั่ง AI (ตัด hasSystem/triedAi ออก)
const CHOICE_MAP: Record<string, string> = {
  hasPromptpay: "ช่วยตั้งค่าพร้อมเพย์รับเงิน",
  hasProduct: "ช่วยเพิ่มสินค้าตัวแรกให้หน่อย",
  hasTeam: "ช่วยเพิ่มพนักงานเข้าระบบ",
  hasUnit: "ช่วยสร้างสาขาแรกให้หน่อย",
};

export async function POST(req: Request) {
  const g = await requireMobile(req);
  if (!g.ok) return mobileError(g);

  const ctx = g.ctx;
  const db = tenantDb(ctx);

  // มีห้องอยู่แล้ว (ยังไม่ลบ) → ไม่สร้างเพิ่ม
  const existingRoom = await db.aiConversation.findFirst({
    where: { deletedAt: null },
    select: { id: true },
  });
  if (existingRoom) return Response.json({ existing: true });

  // เช็กลิสต์ก่อนสร้างห้อง (ให้ triedAi/จำนวนที่เหลือสะท้อนสภาพก่อนกดครั้งแรก)
  const checklist = await onboardingChecklist({ tenantId: ctx.tenantId });
  const undone = checklist.filter((x) => !x.done);
  const choices = undone
    .map((x) => CHOICE_MAP[x.key])
    .filter((s): s is string => !!s)
    .slice(0, 3);
  // ครบทุกข้อแล้ว → เสนอถามภาพรวมระบบ
  if (choices.length === 0) choices.push("ร้านเราทำอะไรได้บ้างในระบบนี้");

  const shopName = g.membership.tenant.name;
  const dna = await dnaFactsSummary(ctx.tenantId);

  const lines: string[] = [`สวัสดีค่ะ ยินดีต้อนรับสู่ ${shopName}`];
  if (dna) lines.push("", dna);
  lines.push("");
  if (undone.length > 0) {
    lines.push(`ตอนนี้ยังเหลืออีก ${undone.length} ขั้นที่จะช่วยให้ร้านพร้อมใช้งานเต็มที่`);
  } else {
    lines.push("ร้านของคุณตั้งค่าครบแล้ว พร้อมใช้งานเต็มที่");
  }
  lines.push("อยากให้ช่วยข้อไหน แตะปุ่มด้านล่าง หรือพิมพ์ถามเรื่องอื่นได้เลย");
  const content = lines.join("\n");

  // สร้างห้อง + ข้อความทัก (tenantId ใส่ตรง ๆ ตาม convention repo)
  const conv = await db.aiConversation.create({
    data: { tenantId: ctx.tenantId, title: WELCOME_TITLE },
  });
  await db.aiMessage.create({
    data: { tenantId: ctx.tenantId, conversationId: conv.id, role: "ASSISTANT", content },
  });

  return Response.json({ existing: false, conversationId: conv.id, choices });
}

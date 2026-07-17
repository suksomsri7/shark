// AI Prompt Tuning (self-improving item 4) — วงจรปรับปรุง prompt ระดับแพลตฟอร์ม (ทุกร้าน)
// AiPromptTweak = platform axis (ไม่มี tenantId) → อ่าน/เขียนผ่าน base prisma จาก @/lib/core/db เท่านั้น
// วงจร: AI เสนอ (PENDING) → แอดมิน backoffice อนุมัติ (APPROVED=ฉีดเข้า persona ทุกร้าน) / ปฏิเสธ

import type { AiPromptTweak } from "@prisma/client";
import { prisma } from "@/lib/core/db";

// เสนอคำปรับปรุง prompt ใหม่ → บันทึกสถานะ PENDING รอแอดมินตัดสิน
export async function proposeTweak(input: {
  content: string;
  rationale: string;
}): Promise<{ id: string }> {
  const row = await prisma.aiPromptTweak.create({
    data: { content: input.content, rationale: input.rationale, status: "PENDING" },
    select: { id: true },
  });
  return { id: row.id };
}

// รายการคำปรับปรุง — ระบุ status = กรอง, ไม่ระบุ = ทั้งหมด · เรียงใหม่สุดก่อน
export async function listPromptTweaks(status?: string): Promise<AiPromptTweak[]> {
  return prisma.aiPromptTweak.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
  });
}

// ตัดสินคำปรับปรุง (อนุมัติ/ปฏิเสธ) — updateMany where PENDING เพื่อกัน race/ตัดสินซ้ำ
// ถ้าไม่มีแถวที่ยัง PENDING ให้เปลี่ยน (count=0) → throw ไทย
export async function decidePromptTweak(
  id: string,
  decision: "APPROVED" | "REJECTED",
  byId: string,
): Promise<void> {
  const res = await prisma.aiPromptTweak.updateMany({
    where: { id, status: "PENDING" },
    data: { status: decision, decidedById: byId, decidedAt: new Date() },
  });
  if (res.count === 0) {
    throw new Error("รายการนี้ถูกตัดสินไปแล้ว ไม่สามารถตัดสินซ้ำได้");
  }
}

// รวม content ของรายการ APPROVED เป็นข้อความเดียว (ขึ้นบรรทัดด้วย "- ") · ไม่มี = ""
export async function approvedPromptTweaksText(): Promise<string> {
  const rows = await prisma.aiPromptTweak.findMany({
    where: { status: "APPROVED" },
    orderBy: { createdAt: "desc" },
    select: { content: true },
  });
  if (rows.length === 0) return "";
  return rows.map((r) => `- ${r.content}`).join("\n");
}

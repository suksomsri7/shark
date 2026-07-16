// AI ช่วยทีมซัพพอร์ต (WO-0047) — ร่างคำตอบ + สรุปเคส
// - อ่าน SupportCase + SupportMessage ทั้งเธรดด้วย prisma ตรง (platform layer อ่านข้ามร้าน)
// - LLM ผ่าน deps.provider ?? resolveProvider() จาก env
// - จุดตาย: ห้ามเขียน DB ใด ๆ (ร่างเฉย ๆ คนกดส่งเอง) · ทุกทางที่ผิดปกติ → null เงียบ ๆ ห้าม throw
// - system prompt ต้องมีกติกา "ห้ามแต่ง/ห้ามสัญญาเกินจริง" เสมอ

import type { SupportCase, SupportMessage } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { resolveProvider, type AiProvider } from "@/lib/ai/provider";

type Deps = { provider?: AiProvider };

// system prompt ร่วม — ทีมซัพพอร์ต SHARK สุภาพ + กติกาเหล็กห้ามแต่ง/ห้ามสัญญาเกินจริง
const SUPPORT_RULES = [
  "คุณคือผู้ช่วยของทีมซัพพอร์ต SHARK ช่วยร่างข้อความตอบร้านค้า SME ไทย",
  "น้ำเสียงสุภาพ เป็นกันเอง กระชับ ใช้ภาษาไทยที่เข้าใจง่าย",
  "กติกาเหล็ก: ห้ามแต่งฟีเจอร์หรือข้อมูลที่ไม่มีจริง และห้ามสัญญาสิ่งที่ระบบทำไม่ได้",
  "ถ้ายังไม่มีข้อมูลพอจะแก้ปัญหา ให้บอกอย่างสุภาพว่ากำลังตรวจสอบ อย่าคาดเดาสาเหตุหรือกำหนดเวลาที่ไม่แน่นอน",
].join("\n");

// อ่านเคส + เธรดทั้งหมดด้วย prisma ตรง — เคสไม่มีจริง → null
async function loadThread(
  caseId: string,
): Promise<{ case: SupportCase; messages: SupportMessage[] } | null> {
  const c = await prisma.supportCase.findUnique({ where: { id: caseId } });
  if (!c) return null;
  const messages = await prisma.supportMessage.findMany({
    where: { caseId },
    orderBy: { createdAt: "asc" },
  });
  return { case: c, messages };
}

// เรียบเรียงเธรดเป็นข้อความให้ LLM อ่าน — ระบุฝั่งผู้พูดชัดเจน
function renderThread(c: SupportCase, messages: SupportMessage[]): string {
  const lines = messages.map(
    (m) => `${m.authorSide === "PLATFORM" ? "ทีมงาน" : "ร้าน"}: ${m.body}`,
  );
  return [`เรื่อง: ${c.subject}`, "", "บทสนทนา:", ...lines].join("\n");
}

/**
 * ร่างคำตอบถึงร้านจากบริบทเธรดทั้งหมด — คืนข้อความร่าง (คนกดส่งเอง)
 * - ไม่มี provider (ยังไม่เปิด AI) → null · เคสไม่มีจริง / เกิดข้อผิดพลาด → null (ไม่ throw)
 * - ไม่เขียน DB ใด ๆ
 */
export async function draftCaseReply(caseId: string, deps?: Deps): Promise<string | null> {
  try {
    const provider = deps?.provider ?? resolveProvider();
    if (!provider) return null; // ยังไม่เปิดใช้ AI — เงียบ ๆ

    const thread = await loadThread(caseId);
    if (!thread) return null;

    const userPrompt = [
      renderThread(thread.case, thread.messages),
      "",
      "ช่วยร่างข้อความตอบกลับถึงร้านเป็นภาษาไทย สุภาพและตรงประเด็น (ข้อความร่างเท่านั้น ทีมงานจะตรวจก่อนกดส่ง)",
    ].join("\n");

    const reply = await provider.chat([
      { role: "system", content: SUPPORT_RULES },
      { role: "user", content: userPrompt },
    ]);
    const text = reply.text.trim();
    return text.length > 0 ? text : null;
  } catch {
    return null; // ทุกทางที่ผิดปกติ → null (ห้าม throw)
  }
}

/**
 * สรุปเคสสั้น ๆ สำหรับหัวตาราง/ภาพรวม — กติกาเดียวกับร่างคำตอบ
 * - ไม่มี provider / เคสไม่มีจริง / error → null (ไม่ throw) · ไม่เขียน DB
 */
export async function summarizeCase(caseId: string, deps?: Deps): Promise<string | null> {
  try {
    const provider = deps?.provider ?? resolveProvider();
    if (!provider) return null;

    const thread = await loadThread(caseId);
    if (!thread) return null;

    const userPrompt = [
      renderThread(thread.case, thread.messages),
      "",
      "ช่วยสรุปเคสนี้เป็นภาษาไทยสั้น ๆ 1 ประโยค สำหรับให้ทีมงานเห็นภาพรวมอย่างรวดเร็ว (ห้ามแต่งข้อมูลที่ไม่มีในบทสนทนา)",
    ].join("\n");

    const reply = await provider.chat([
      { role: "system", content: SUPPORT_RULES },
      { role: "user", content: userPrompt },
    ]);
    const text = reply.text.trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

// assistant.ts — ข้อมูลของหน้า "ผู้ช่วย AI — สมาชิก" (M3.10 · ภาพ 27 ซ้าย)
//
// ผู้เรียก: หน้า `/app/sys/[id]/member/assistant` (โหลดครั้งแรก) + `assistant-actions.ts` (หลังส่ง/ยืนยัน/ยกเลิก)
// 🔴 ไฟล์นี้ไม่ใช่ `"use server"` โดยตั้งใจ — ฟังก์ชันรับ tenantId ตรง ๆ ถ้าอยู่ในไฟล์ server action
//    จะกลายเป็น endpoint ที่ใครก็เรียกด้วย tenantId ของร้านอื่นได้ · ด่านสิทธิ์อยู่ที่ action/หน้าเท่านั้น
// 🔴 ตัวผู้ช่วยจริง = `ai/service.sendMessage` (ตัวเดียวกับแชทผู้ช่วยทั้งแอป) · ข้อเสนอ = `ai/proposals`
//    หน้านี้ไม่มีตรรกะ AI ของตัวเอง — แค่แสดงบทสนทนา + ข้อเสนอที่ค้าง + บรรทัดเครื่องมือที่ใช้

import { listMessages } from "@/lib/ai/service";
import { listPendingProposals } from "@/lib/ai/proposals";
import { toolRegistry } from "@/lib/ai/tools";
import { tenantDb } from "@/lib/core/db";
import type { MemberActor } from "./access";
import { memberCodeCandidates, toolsLine, type AssistantStateDto, type AssistantToolRef } from "./assistant-shared";
import { briefFor } from "./profile";

/** คนที่กำลังเปิดหน้า — ใช้ resolve ชื่อสมาชิกในตารางด้วยสิทธิ์ของเขาเอง (นอกสาขา = ไม่เห็นชื่อ) */
export type AssistantViewer = { systemId: string; actor: MemberActor; userId: string };

/**
 * รหัสสมาชิกในตารางของคำตอบ → ชื่อที่แสดง (ตีกลับรอบ 1)
 * 🔴 ทำตอนเรนเดอร์เท่านั้น — ชื่อไม่ถูกเขียนกลับลงข้อความ และไม่เข้า prompt ของผู้ช่วยในรอบถัดไป
 * 🔴 ผ่าน `briefFor` (ขอบเขตสาขาของคนเปิดหน้า) — มองไม่เห็นใคร = รหัสเดิมบนจอ
 */
async function namesFor(tenantId: string, viewer: AssistantViewer, contents: string[]): Promise<Record<string, string>> {
  const codes = memberCodeCandidates(contents);
  if (codes.length === 0) return {};
  const rows = await tenantDb({ tenantId, systemId: viewer.systemId }).customer.findMany({
    where: { memberSystemId: viewer.systemId, memberCode: { in: codes } },
    select: { id: true },
  });
  if (rows.length === 0) return {};
  const briefs = await briefFor({ tenantId, systemId: viewer.systemId, actorUserId: viewer.userId }, viewer.actor, rows.map((r) => r.id));
  const out: Record<string, string> = {};
  for (const b of briefs) if (b.memberCode && b.name) out[b.memberCode] = b.name;
  return out;
}

/** สถานะหน้าจอของบทสนทนาหนึ่ง (ไม่มี/ไม่ใช่ของร้านนี้ = บทสนทนาว่าง) */
export async function assistantState(tenantId: string, conversationId: string | null, viewer?: AssistantViewer): Promise<AssistantStateDto> {
  const id = String(conversationId ?? "").trim();
  if (!id) return { conversationId: null, messages: [], proposals: [], memberNames: {} };
  const conv = await tenantDb({ tenantId }).aiConversation.findFirst({ where: { id }, select: { id: true } });
  if (!conv) return { conversationId: null, messages: [], proposals: [], memberNames: {} };
  const [messages, proposals] = await Promise.all([listMessages({ tenantId }, conv.id, 60), listPendingProposals({ tenantId }, conv.id)]);
  const memberNames = viewer
    ? await namesFor(tenantId, viewer, messages.filter((m) => m.role !== "USER").map((m) => m.content)).catch(() => ({}))
    : {};
  return {
    memberNames,
    conversationId: conv.id,
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role === "USER" ? "USER" : "ASSISTANT",
      content: m.content,
      at: m.createdAt.toISOString(),
    })),
    proposals: proposals.map((p) => ({
      id: p.id,
      kind: p.kind,
      summary: p.summary,
      risk: p.risk === "DESTRUCTIVE" ? "DESTRUCTIVE" : "NORMAL",
      createdAt: p.createdAt.toISOString(),
    })),
  };
}

/** ชื่อเครื่องมือ → เป็นเครื่องมือเขียน (ข้อเสนอรอยืนยัน) ไหม */
export function toolRefs(names: string[]): AssistantToolRef[] {
  const reg = toolRegistry();
  const seen = new Set<string>();
  const out: AssistantToolRef[] = [];
  for (const name of names) {
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ name, pending: Boolean(reg.find((t) => t.def.name === name)?.action) });
  }
  return out;
}

/**
 * ต่อบรรทัด "เครื่องมือที่ใช้" ท้ายคำตอบล่าสุดของผู้ช่วยในบทสนทนานี้
 * (`sendMessage` เก็บแค่ข้อความสุดท้าย ไม่เก็บการเรียกเครื่องมือ — หน้านี้อยากให้เจ้าของเห็นว่าผู้ช่วยดูข้อมูลจากไหน)
 */
export async function appendToolsLine(tenantId: string, conversationId: string, names: string[]): Promise<void> {
  if (names.length === 0) return;
  const db = tenantDb({ tenantId });
  const last = await db.aiMessage.findFirst({
    where: { conversationId, role: "ASSISTANT" },
    orderBy: { createdAt: "desc" },
    select: { id: true, content: true },
  });
  if (!last) return;
  await db.aiMessage.update({ where: { id: last.id }, data: { content: `${last.content}\n\n${toolsLine(toolRefs(names))}` } });
}

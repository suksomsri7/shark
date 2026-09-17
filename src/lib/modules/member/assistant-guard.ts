// assistant-guard.ts — ด่านของ "ข้อเสนอ" บนหน้าผู้ช่วย AI ของระบบสมาชิก (AUDIT L10)
//
// 🔴 ปัญหาที่แก้: `cancelMemberProposalAction` เดิมเรียก `rejectProposal({ tenantId }, proposalId)` ตรง ๆ
//    ⇒ ใครก็ตามที่ "เข้าโมดูลสมาชิกได้" (สิทธิ์อ่านล้วน) ยิง id ของข้อเสนอใบไหนก็ได้ในร้าน แล้วปิดทิ้งได้
//    รวมถึงข้อเสนอของบทสนทนาอื่น ของระบบสมาชิกอื่น หรือของสกิลอื่นทั้งหมด
//    ⇒ ที่นี่บังคับ 3 ชั้นก่อนยกเลิก:
//       1) ข้อเสนอต้องเป็นของ **ร้านนี้** และของ **บทสนทนาที่หน้าจอเปิดอยู่** (`conversationId`)
//       2) ถ้าเป็นคำสั่งของระบบสมาชิก ต้องเป็น **ระบบสมาชิกใบนี้** (payload.systemId)
//       3) ผู้กดต้องมีสิทธิ์ตัวเดียวกับที่ "กดยืนยัน" ต้องใช้ (`memberKindAccess()` = `op.action`)
// 🔴 ยกเลิกไม่เปลี่ยนข้อมูลของร้าน แต่มัน "ทำให้งานของคนอื่นหายไป" จึงต้องมีเจ้าของ — AiConversation
//    ยังไม่มีคอลัมน์เจ้าของบทสนทนา (ดู prisma/schema/ai.prisma) จึงยังใช้กติกาสิทธิ์อย่างเดียว
//    (หนี้: ถ้าเพิ่ม `AiConversation.createdById` เมื่อไหร่ ให้ยอมให้เจ้าของบทสนทนายกเลิกได้ด้วย)
// 🔴 ไฟล์นี้ไม่ใช่ `"use server"` โดยตั้งใจ — เป็นตัวช่วยของ action ไม่ใช่ endpoint

import { tenantDb } from "@/lib/core/db";
import type { MembershipCtx } from "@/lib/core/rbac";
import { assertCan } from "@/lib/core/rbac";
import { memberKindAccess } from "./api/tools";

const NOT_FOUND = "ไม่พบข้อเสนอนี้ในบทสนทนานี้ — รีเฟรชหน้าแล้วลองใหม่อีกครั้ง";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * ข้อเสนอใบนี้ "ของหน้าจอนี้" จริงไหม และคนกดมีสิทธิ์พอไหม — ไม่ผ่าน = โยนข้อความไทย
 * คืน kind ของข้อเสนอให้ผู้เรียกเอาไปบันทึก/แสดงต่อได้
 */
export async function assertProposalInScope(
  input: { tenantId: string; systemId: string; conversationId: string; proposalId: string },
  membership: MembershipCtx,
): Promise<{ kind: string }> {
  const conversationId = String(input.conversationId ?? "").trim();
  const id = String(input.proposalId ?? "").trim();
  if (!conversationId || !id) throw new Error(NOT_FOUND);

  // (1) ร้านนี้ + บทสนทนานี้ (tenantDb ผูก tenantId ให้แล้ว ⇒ id ของร้านอื่นหาไม่เจอ)
  const row = await tenantDb({ tenantId: input.tenantId }).aiProposal.findFirst({
    where: { id, conversationId },
    select: { id: true, kind: true, payload: true },
  });
  if (!row) throw new Error(NOT_FOUND);

  // (2) ระบบสมาชิกใบนี้ (ข้อเสนอของระบบสมาชิกทุกใบพก systemId มาใน payload — ดู `runMemberTool`)
  const access = memberKindAccess()[row.kind];
  if (access) {
    const payload = isRecord(row.payload) ? row.payload : {};
    if (typeof payload.systemId === "string" && payload.systemId !== input.systemId) throw new Error(NOT_FOUND);
    // (3) สิทธิ์เดียวกับตอนกดยืนยัน — `assertCan` โยน ForbiddenError ที่ `safeReason` แปลงเป็นข้อความไทย
    assertCan(membership, access);
  }
  return { kind: row.kind };
}

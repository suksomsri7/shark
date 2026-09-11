"use server";

// assistant-actions.ts — server action ของหน้า "ผู้ช่วย AI — สมาชิก" (M3.10 · ภาพ 27 ซ้าย)
//
// ส่งข้อความ → `ai/service.sendMessage` (source MEMBER_ASSIST · ตัวเดียวกับแชทผู้ช่วยทั้งแอป — เครื่องมือของสกิล
// `members` ถูกโหลดเมื่อผู้ช่วยต้องใช้) · ยืนยัน/ยกเลิกข้อเสนอ → `ai/proposals` ด้วย **สิทธิ์ของคนกด** (K3.5)
//
// 🔴 ไฟล์ `"use server"` export ได้เฉพาะ async function — ชนิดผลลัพธ์อยู่ที่ `assistant-shared.ts` (บทเรียน M2.2)
// 🔴 ด่าน: ต้องเข้าโมดูลสมาชิกได้ (`canReadMember` · ไม่ผ่าน = `assertCan` โยน ForbiddenError แบบเดียวกับทุกโมดูล)
//    การยืนยันข้อเสนอตรวจสิทธิ์ของงานนั้นอีกชั้นใน `executeProposal` (KIND_ACCESS) — ผู้ช่วยไม่เคยได้สิทธิ์เกินคนกด
// 🔴 prompt ของผู้ช่วยเป็นภาษาอังกฤษอยู่แล้ว (persona/สกิลของ ai/service) · หน้านี้ไม่แนบข้อมูลสมาชิกเข้าไปเอง

import { assertCan } from "@/lib/core/rbac";
import { requireTenant } from "@/lib/core/context";
import { safeReason } from "@/lib/core/errors";
import { sendMessage } from "@/lib/ai/service";
import { executeProposal, rejectProposal } from "@/lib/ai/proposals";
import { prisma } from "./db";
import { canReadMember, toMemberActor } from "./access";
import { appendToolsLine, assistantState } from "./assistant";
import type { AssistantActionResult, AssistantConfirmResult, AssistantStateDto } from "./assistant-shared";

const TEXT_MAX = 2000;

async function gate(systemId: string) {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const actor = toMemberActor(auth.user.id, auth.active);
  const mc = { role: auth.active.role, unitAccess: actor.unitAccess, permissions: actor.permissions };
  if (!canReadMember(actor)) {
    assertCan(mc, { module: "member", action: "member.customer.read" });
  }
  const system = await prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "MEMBER" }, select: { id: true } });
  if (!system) throw new Error("ไม่พบระบบสมาชิกนี้ในร้านนี้ — รีเฟรชหน้าแล้วลองใหม่");
  return { tenantId, userId: auth.user.id, mc, viewer: { systemId, actor, userId: auth.user.id } };
}

const DISABLED = "ผู้ช่วย AI ยังไม่เปิดให้ใช้ในร้านนี้ — ติดต่อผู้ดูแลระบบเพื่อเปิดใช้งาน";
const OVER_CREDIT = "เครดิตผู้ช่วย AI ของร้านหมดแล้ว — เติมเครดิตที่หน้าตั้งค่าร้านแล้วถามใหม่ได้เลย";
const OVER_DAY = "วันนี้ใช้ผู้ช่วย AI ครบโควตาของร้านแล้ว — ถามใหม่ได้พรุ่งนี้";

/** ส่งคำถามถึงผู้ช่วย แล้วคืนบทสนทนาทั้งหมดของหน้าจอ (ข้อความ + ข้อเสนอที่รอยืนยัน) */
export async function sendMemberAssistantAction(
  systemId: string,
  conversationId: string | null,
  text: string,
): Promise<AssistantActionResult<AssistantStateDto>> {
  try {
    const { tenantId, viewer } = await gate(systemId);
    const body = String(text ?? "").trim();
    if (!body) return { ok: false, reason: "พิมพ์คำถามก่อนกดส่ง" };
    if (body.length > TEXT_MAX) return { ok: false, reason: `คำถามยาวได้ไม่เกิน ${TEXT_MAX.toLocaleString("th-TH")} ตัวอักษร` };
    const current = conversationId ? await assistantState(tenantId, conversationId) : null;
    const used: string[] = [];
    const res = await sendMessage(
      { tenantId },
      { text: body, ...(current?.conversationId ? { conversationId: current.conversationId } : {}) },
      { source: "MEMBER_ASSIST", onToolCall: (name) => used.push(name) },
    );
    if (!res.ok) {
      return { ok: false, reason: res.error === "ai_disabled" ? DISABLED : res.error === "over_budget" ? (res.scope === "day" ? OVER_DAY : OVER_CREDIT) : "พิมพ์คำถามก่อนกดส่ง" };
    }
    await appendToolsLine(tenantId, res.conversationId, used);
    return { ok: true, data: await assistantState(tenantId, res.conversationId, viewer) };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ผู้ช่วยตอบไม่สำเร็จในตอนนี้ — ลองถามใหม่อีกครั้ง") };
  }
}

/** ยืนยันข้อเสนอ — ลงมือด้วยสิทธิ์ของคนกด · รายการลบถาวรต้องกดยืนยันซ้ำ (`confirm2x`) */
export async function confirmMemberProposalAction(
  systemId: string,
  conversationId: string,
  proposalId: string,
  confirm2x: boolean,
): Promise<AssistantConfirmResult> {
  try {
    const { tenantId, userId, mc, viewer } = await gate(systemId);
    const res = await executeProposal(mc, { tenantId }, String(proposalId ?? ""), { confirm2x: confirm2x === true, userId });
    return { ok: res.ok, note: res.note, ...(res.needsSecondConfirm ? { needsSecondConfirm: true } : {}), state: await assistantState(tenantId, conversationId, viewer) };
  } catch (e) {
    return {
      ok: false,
      note: safeReason(e, "ยืนยันไม่สำเร็จในตอนนี้ — ลองใหม่อีกครั้ง"),
      state: { conversationId: conversationId || null, messages: [], proposals: [], memberNames: {} },
    };
  }
}

/** ยกเลิกข้อเสนอ (ไม่มีอะไรเกิดขึ้นกับข้อมูลของร้าน) — ปุ่ม "ยกเลิก" และ "แก้ไข" (ยกเลิกแล้วเอาคำสั่งเดิมกลับไปแก้) */
export async function cancelMemberProposalAction(
  systemId: string,
  conversationId: string,
  proposalId: string,
): Promise<AssistantActionResult<AssistantStateDto>> {
  try {
    const { tenantId, viewer } = await gate(systemId);
    await rejectProposal({ tenantId }, String(proposalId ?? ""));
    return { ok: true, data: await assistantState(tenantId, conversationId, viewer) };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ยกเลิกไม่สำเร็จในตอนนี้ — ลองใหม่อีกครั้ง") };
  }
}

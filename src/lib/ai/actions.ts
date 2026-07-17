"use server";

import { requireTenant } from "@/lib/core/context";
import { assertCan, type MembershipCtx } from "@/lib/core/rbac";
import { aiEnabled, latestConversation, listMessages, sendMessage, type Clarify } from "./service";
import { executeProposal, listPendingProposals, rejectProposal } from "./proposals";

// convention action = "ai.<entity>.<verb>" — OWNER/MANAGER ผ่าน · STAFF ต้องมี ai.chat.send หรือ ai.*
function assertAiCan(auth: Awaited<ReturnType<typeof requireTenant>>, action: string) {
  assertCan(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "ai", action },
  );
}

/** ข้อเสนอที่รอ user ยืนยัน (การ์ดใต้แชท) · risk=DESTRUCTIVE → การ์ดยืนยัน 2 ชั้น */
export type PendingProposal = { id: string; summary: string; risk: "NORMAL" | "DESTRUCTIVE" };

// map risk string จาก DB → union แคบ (ค่าอื่น = NORMAL)
function toRisk(v: unknown): "NORMAL" | "DESTRUCTIVE" {
  return v === "DESTRUCTIVE" ? "DESTRUCTIVE" : "NORMAL";
}

export type AiChatState = {
  enabled: boolean;
  conversationId: string | null;
  messages: { id: string; role: "USER" | "ASSISTANT"; content: string }[];
  pendingProposals: PendingProposal[];
};

/** MembershipCtx ของคนกด — ใช้ตรวจสิทธิ์จริง ณ ตอน execute proposal */
function membershipOf(auth: Awaited<ReturnType<typeof requireTenant>>): MembershipCtx {
  return {
    role: auth.active.role,
    unitAccess: auth.active.unitAccess as string[],
    permissions: auth.active.permissions as Record<string, unknown>,
  };
}

/** โหลดสถานะแชท (บทสนทนาล่าสุด + ข้อเสนอที่รอยืนยัน) สำหรับเปิด sheet */
export async function loadAiChatAction(): Promise<AiChatState> {
  const auth = await requireTenant();
  assertAiCan(auth, "ai.chat.send");
  const ctx = { tenantId: auth.active.tenantId };
  const conv = await latestConversation(ctx);
  const messages = conv ? await listMessages(ctx, conv.id) : [];
  const pending = conv ? await listPendingProposals(ctx, conv.id) : [];
  return {
    enabled: aiEnabled(),
    conversationId: conv?.id ?? null,
    messages: messages.map((m) => ({ id: m.id, role: m.role, content: m.content })),
    pendingProposals: pending.map((p) => ({ id: p.id, summary: p.summary, risk: toRisk(p.risk) })),
  };
}

/** ดึงข้อเสนอที่รอยืนยันของบทสนทนา (refresh หลังส่งข้อความทุกครั้ง — LLM อาจสร้างใหม่) */
export async function listPendingProposalsAction(conversationId: string): Promise<PendingProposal[]> {
  const auth = await requireTenant();
  assertAiCan(auth, "ai.chat.send");
  const pending = await listPendingProposals({ tenantId: auth.active.tenantId }, conversationId);
  return pending.map((p) => ({ id: p.id, summary: p.summary, risk: toRisk(p.risk) }));
}

export type ProposalResult = { ok: boolean; note: string; needsSecondConfirm?: boolean };

/**
 * ยืนยันข้อเสนอ → ลงมือทำจริง (ตรวจสิทธิ์คนกด ภายใน executeProposal)
 * opts.confirm2x = การยืนยันชั้นที่สองของรายการลบ/ยกเลิกถาวร (DESTRUCTIVE)
 */
export async function confirmProposalAction(
  proposalId: string,
  opts?: { confirm2x?: boolean },
): Promise<ProposalResult> {
  const auth = await requireTenant();
  const ctx = { tenantId: auth.active.tenantId };
  try {
    return await executeProposal(membershipOf(auth), ctx, proposalId, opts);
  } catch {
    return { ok: false, note: "ทำรายการไม่สำเร็จชั่วคราว ลองใหม่อีกครั้ง" };
  }
}

/** ยกเลิกข้อเสนอ (PENDING → REJECTED) */
export async function rejectProposalAction(proposalId: string): Promise<ProposalResult> {
  const auth = await requireTenant();
  const ctx = { tenantId: auth.active.tenantId };
  const ok = await rejectProposal(ctx, proposalId);
  return { ok, note: ok ? "ยกเลิกข้อเสนอแล้ว" : "ข้อเสนอนี้ถูกดำเนินการไปแล้ว" };
}

export type SendAiResult =
  | { ok: true; conversationId: string; reply: string; clarify?: Clarify }
  | { ok: false; message: string };

/** ส่งข้อความหา AI — error ทุกแบบคืนข้อความไทยสุภาพ (UI แสดงตรง ๆ ได้) */
export async function sendAiMessageAction(input: {
  conversationId?: string;
  text: string;
  imageUrls?: string[];
}): Promise<SendAiResult> {
  const auth = await requireTenant();
  assertAiCan(auth, "ai.chat.send");
  try {
    const res = await sendMessage({ tenantId: auth.active.tenantId }, input);
    if (res.ok) return res;
    const msg: Record<typeof res.error, string> = {
      ai_disabled: "ผู้ช่วย AI ยังไม่เปิดใช้งานในระบบ — เร็ว ๆ นี้",
      over_budget: "วันนี้ใช้ผู้ช่วย AI ครบโควตาแล้ว พรุ่งนี้กลับมาคุยกันใหม่ได้เลย",
      empty: "พิมพ์ข้อความก่อนส่งนะครับ",
    };
    return { ok: false, message: msg[res.error] };
  } catch {
    return { ok: false, message: "ผู้ช่วย AI ตอบไม่ได้ชั่วคราว ลองใหม่อีกครั้ง" };
  }
}

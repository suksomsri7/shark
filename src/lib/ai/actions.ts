"use server";

import { requireTenant } from "@/lib/core/context";
import { assertCan, type MembershipCtx } from "@/lib/core/rbac";
import { aiEnabled, latestConversation, listMessages, sendMessage, type Clarify } from "./service";
import { executeProposal, listPendingProposals, rejectProposal } from "./proposals";
import { executePlan, listPendingPlans, rejectPlan } from "./plans";
import { recordFeedback, type FeedbackRating } from "./feedback";

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

/** แผนหลายขั้นที่รอ user ยืนยัน (การ์ดแผนใต้แชท) · hasDestructive → ยืนยัน 2 จังหวะ */
export type PendingPlanStep = { summary: string; kind: string };
export type PendingPlan = { id: string; title: string; hasDestructive: boolean; steps: PendingPlanStep[] };

// map stepsJson (Json) → รายการขั้นแบบแคบสำหรับ UI (best-effort · โครงผิด = ข้าม)
function toPlanSteps(v: unknown): PendingPlanStep[] {
  if (!Array.isArray(v)) return [];
  return v.map((s) => {
    const o = (s ?? {}) as Record<string, unknown>;
    return { summary: String(o.summary ?? ""), kind: String(o.kind ?? "") };
  });
}

export type AiChatState = {
  enabled: boolean;
  conversationId: string | null;
  messages: { id: string; role: "USER" | "ASSISTANT"; content: string }[];
  pendingProposals: PendingProposal[];
  pendingPlans: PendingPlan[];
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
  // โหลด messages + proposals + plans พร้อมกัน (ลด round-trip)
  const [messages, pending, plans] = conv
    ? await Promise.all([listMessages(ctx, conv.id), listPendingProposals(ctx, conv.id), listPendingPlans(ctx, conv.id)])
    : [[], [], []];
  return {
    enabled: aiEnabled(),
    conversationId: conv?.id ?? null,
    messages: messages.map((m) => ({ id: m.id, role: m.role, content: m.content })),
    pendingProposals: pending.map((p) => ({ id: p.id, summary: p.summary, risk: toRisk(p.risk) })),
    pendingPlans: plans.map((p) => ({ id: p.id, title: p.title, hasDestructive: p.hasDestructive, steps: toPlanSteps(p.stepsJson) })),
  };
}

/** ดึงแผนที่รอยืนยันของบทสนทนา (refresh หลังส่งข้อความทุกครั้ง — LLM อาจเสนอแผนใหม่) */
export async function loadPlansAction(conversationId: string): Promise<PendingPlan[]> {
  const auth = await requireTenant();
  assertAiCan(auth, "ai.chat.send");
  const plans = await listPendingPlans({ tenantId: auth.active.tenantId }, conversationId);
  return plans.map((p) => ({ id: p.id, title: p.title, hasDestructive: p.hasDestructive, steps: toPlanSteps(p.stepsJson) }));
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

export type PlanResult = { ok: boolean; note: string; needsSecondConfirm?: boolean; doneCount?: number };

/**
 * ยืนยันแผน → ลงมือทำทุกขั้นต่อเนื่อง (ตรวจสิทธิ์คนกดต่อ step ภายใน executePlan)
 * opts.confirm2x = ยืนยันชั้นที่สองของแผนที่มีรายการลบ/ยกเลิกถาวร (hasDestructive)
 */
export async function confirmPlanAction(
  planId: string,
  opts?: { confirm2x?: boolean },
): Promise<PlanResult> {
  const auth = await requireTenant();
  const ctx = { tenantId: auth.active.tenantId };
  try {
    const res = await executePlan(membershipOf(auth), ctx, planId, opts);
    if (res.needsSecondConfirm) {
      return { ok: false, needsSecondConfirm: true, note: "แผนนี้มีรายการลบ/ยกเลิกถาวร ต้องยืนยันอีกครั้งก่อนทำจริง" };
    }
    if (res.ok) {
      return { ok: true, doneCount: res.doneCount, note: `ทำครบทั้ง ${res.doneCount} ขั้นเรียบร้อยแล้ว` };
    }
    // ล้ม/ปิดไปแล้ว — สร้างข้อความไทยจากผลลัพธ์ที่มี
    if (res.results.length === 0) {
      return { ok: false, doneCount: 0, note: "แผนนี้ถูกดำเนินการหรือปิดไปแล้ว" };
    }
    const failedStep = res.results.find((r) => !r.ok);
    const note = failedStep
      ? `ทำได้ ${res.doneCount} ขั้น แล้วติดที่ "${failedStep.summary}": ${failedStep.note}`
      : "ทำแผนไม่สำเร็จ";
    return { ok: false, doneCount: res.doneCount, note };
  } catch {
    return { ok: false, note: "ทำแผนไม่สำเร็จชั่วคราว ลองใหม่อีกครั้ง" };
  }
}

/** ยกเลิกแผน (PENDING → REJECTED) */
export async function rejectPlanAction(planId: string): Promise<PlanResult> {
  const auth = await requireTenant();
  const ctx = { tenantId: auth.active.tenantId };
  const ok = await rejectPlan(ctx, planId);
  return { ok, note: ok ? "ยกเลิกแผนแล้ว" : "แผนนี้ถูกดำเนินการไปแล้ว" };
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

export type SendAiFeedbackResult = { ok: boolean; message: string };

/**
 * ส่ง feedback 👍/👎 ของคำตอบ AI (self-improving item 3)
 * - UP = ส่งทันที · DOWN = แนบ note เหตุผล (optional)
 * - error ทุกแบบคืนข้อความไทยสุภาพ (UI แสดงตรง ๆ ได้)
 */
export async function sendAiFeedbackAction(input: {
  conversationId?: string;
  userText: string;
  replyText: string;
  rating: FeedbackRating;
  note?: string;
}): Promise<SendAiFeedbackResult> {
  const auth = await requireTenant();
  assertAiCan(auth, "ai.chat.send");
  try {
    await recordFeedback({ tenantId: auth.active.tenantId }, input);
    return { ok: true, message: "ขอบคุณครับ" };
  } catch {
    return { ok: false, message: "บันทึกความเห็นไม่สำเร็จชั่วคราว ลองใหม่อีกครั้ง" };
  }
}

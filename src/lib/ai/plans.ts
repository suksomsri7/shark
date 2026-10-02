// AI Plan L2 (agentic-2) — แผนหลายขั้น: user สั่งงานหลายอย่างพร้อมกัน → AI เสนอทั้งชุด → ยืนยันครั้งเดียว → ทำต่อเนื่อง รายงานทีละขั้น
// วิสัยทัศน์: แทนที่จะเสนอทีละ proposal หลายรอบ ผู้ช่วยรวบทุกงานเป็น "แผนเดียว" ให้ผู้ใช้เห็นภาพรวมแล้วกดยืนยันครั้งเดียว
//
// กฎเหล็ก:
// - execute อ่าน step จากแถว DB เท่านั้น (planId คือ input เดียว) — ห้ามเชื่อ client
// - รันแต่ละ step ผ่าน runKind (proposals.ts) = assertCan สิทธิ์ "คนกดยืนยัน" ต่อ step + dispatch เดิม (ไม่แตะ DB ข้าม service)
// - claim PENDING→RUNNING แบบอะตอมมิก (updateMany) กันกดซ้ำ · step ล้ม = หยุด ไม่รันต่อ step ที่เหลือคง PENDING · plan = FAILED
// - AiPlan เป็น tenant-scoped → tenantDb({ tenantId }) inject tenantId ให้ทุก query

import { tenantDb } from "@/lib/core/db";
import { type MembershipCtx } from "@/lib/core/rbac";
import type { Prisma } from "@prisma/client";
import { DESTRUCTIVE_KINDS, isKnownKind, runKind, type ProposalKind } from "./proposals";
import { canSeeConversationId, sightOf, sightOfConfirmer, type ConvCtx } from "./conversation-owner";
import { findVisibleConversation } from "./conversations";

type Ctx = { tenantId: string };

const TTL_MS = 24 * 60 * 60 * 1000; // 24 ชม.
const MAX_STEPS = 8;

// step ที่ผู้ใช้/LLM ส่งเข้ามาตอนสร้างแผน
type StepInput = { kind: string; summary: string; payload?: Record<string, unknown> };
// step ที่เก็บใน stepsJson (มีสถานะ/หมายเหตุต่อขั้น)
type StepState = {
  kind: ProposalKind;
  summary: string;
  payload: Record<string, unknown>;
  status: "PENDING" | "DONE" | "FAILED";
  note?: string;
};

// ── สร้างแผน (PENDING + TTL 24 ชม.) — steps ว่าง/เกิน 8 หรือ kind ปลอม → throw ไทย ──
export async function createPlan(
  ctx: Ctx,
  input: { conversationId: string; title: string; steps: StepInput[] },
): Promise<{ id: string }> {
  const steps = Array.isArray(input.steps) ? input.steps : [];
  if (steps.length === 0) throw new Error("แผนต้องมีอย่างน้อย 1 ขั้น");
  if (steps.length > MAX_STEPS) throw new Error(`แผนมีได้มากที่สุด ${MAX_STEPS} ขั้น`);
  for (const s of steps) {
    if (!isKnownKind(String(s.kind ?? ""))) throw new Error(`ไม่รู้จักประเภทงาน "${s.kind}" ในแผน`);
  }
  // hasDestructive = มี step ใด ๆ เป็น kind ที่ลบ/ยกเลิกถาวร → ยืนยัน 2 ชั้นระดับแผน (ใช้ค่าเดียวกับ proposal เดี่ยว)
  const hasDestructive = steps.some((s) => DESTRUCTIVE_KINDS.has(s.kind as ProposalKind));
  const stepsJson: StepState[] = steps.map((s) => ({
    kind: s.kind as ProposalKind,
    summary: String(s.summary ?? "").trim() || "ทำรายการ",
    payload: (s.payload ?? {}) as Record<string, unknown>,
    status: "PENDING",
  }));
  const row = await tenantDb(ctx).aiPlan.create({
    data: {
      tenantId: ctx.tenantId,
      conversationId: input.conversationId,
      title: String(input.title ?? "").trim() || "แผนงาน",
      hasDestructive,
      stepsJson: stepsJson as unknown as Prisma.InputJsonValue,
      expiresAt: new Date(Date.now() + TTL_MS),
    },
  });
  return { id: row.id };
}

export type PlanStepResult = { summary: string; ok: boolean; note: string };
export type PlanExecResult = {
  ok: boolean;
  results: PlanStepResult[];
  doneCount: number;
  needsSecondConfirm?: boolean;
};

// ── ลงมือทำแผนจริง — อ่าน step จาก DB, ตรวจสิทธิ์คนกดต่อ step, รันต่อเนื่องผ่าน runKind ──
// CRM C5.5-G2 ▸ `opts.userId` = คนกด — แผนเป็นของบทสนทนาที่มันเกิด: คนกดต้องเห็นบทสนทนานั้น (ไม่เห็น = เหมือนไม่มีแผนนี้) ◂
export async function executePlan(
  m: MembershipCtx,
  ctx: Ctx,
  planId: string,
  opts?: { confirm2x?: boolean; userId?: string | null },
): Promise<PlanExecResult> {
  const row = await tenantDb(ctx).aiPlan.findFirst({ where: { id: planId } });
  if (!row) return { ok: false, results: [], doneCount: 0 };
  if (!canSeeConversationId(sightOfConfirmer(m, opts?.userId ?? null), row.conversationId)) return { ok: false, results: [], doneCount: 0 };

  // ไม่ใช่ PENDING (ทำไปแล้ว/ถูกปิด) → ไม่ทำซ้ำ
  if (row.status !== "PENDING") return { ok: false, results: [], doneCount: 0 };

  // หมดอายุ → EXPIRED (กันกดของเก่า)
  if (row.expiresAt.getTime() <= Date.now()) {
    await tenantDb(ctx).aiPlan.updateMany({ where: { id: planId, status: "PENDING" }, data: { status: "EXPIRED" } });
    return { ok: false, results: [], doneCount: 0 };
  }

  // ── ยืนยัน 2 ชั้นระดับแผน เมื่อมี step ลบ/ยกเลิกถาวร ──
  // ชั้นแรก (ไม่มี confirm2x) → คง PENDING ไม่ทำจริง แจ้ง UI ให้ถามยืนยันอีกครั้ง
  if (row.hasDestructive && !opts?.confirm2x) {
    return { ok: false, results: [], doneCount: 0, needsSecondConfirm: true };
  }

  // กันแข่งกันกด: claim อะตอมมิก PENDING→RUNNING ก่อนลงมือ (ผู้ชนะเท่านั้นได้ทำ)
  const claim = await tenantDb(ctx).aiPlan.updateMany({
    where: { id: planId, status: "PENDING" },
    data: { status: "RUNNING" },
  });
  if (claim.count !== 1) return { ok: false, results: [], doneCount: 0 };

  const steps = (Array.isArray(row.stepsJson) ? row.stepsJson : []) as unknown as StepState[];
  // CRM C5.5-fix13 r2 ▸ ค่าที่อ่านตอนเริ่ม (ก่อน steps ถูกแก้ในที่) — ใช้เป็นเงื่อนไขของการเขียนกลับ ◂
  const original = JSON.parse(JSON.stringify(row.stepsJson ?? [])) as Prisma.InputJsonValue;
  const results: PlanStepResult[] = [];
  let doneCount = 0;
  let failed = false;

  for (const st of steps) {
    if (failed) break; // step ที่เหลือคง PENDING (ไม่รันต่อ)
    try {
      const idx = steps.indexOf(st);
      const note = await runKind(m, ctx.tenantId, st.kind, st.payload, `plan-${planId}-${idx}`);
      st.status = "DONE";
      st.note = note;
      results.push({ summary: st.summary, ok: true, note });
      doneCount += 1;
    } catch (e) {
      const note = e instanceof Error && e.message ? e.message : "ทำรายการไม่สำเร็จ";
      st.status = "FAILED";
      st.note = note;
      results.push({ summary: st.summary, ok: false, note });
      failed = true;
    }
  }

  // เขียนสถานะทุก step + สถานะแผน กลับ DB (สำเร็จครบ → DONE + executedAt · ล้ม → FAILED)
  // CRM C5.5-fix13 r2 ▸ (RV13-4 · race ของแผนที่กำลังทำ): เขียนแบบมีเงื่อนไข "stepsJson ยังเป็นค่าที่อ่านตอนเริ่ม" — ถ้าระหว่างทำมีคนแก้ขั้น (การลบตาม PDPA
  //   ปิดคำในแผนนี้) ⇒ ไม่เขียนค่าเดิมทับ: เอาขั้นปัจจุบันในฐาน + สถานะของแต่ละขั้นจากรอบนี้ (ไม่ใส่ note ใหม่ — note มาจากข้อมูลก่อนถูกแก้) ◂
  const status = failed ? "FAILED" : "DONE";
  const executedAt = failed ? null : new Date();
  const wrote = await tenantDb(ctx).aiPlan.updateMany({
    where: { id: planId, stepsJson: { equals: original } },
    data: { status, stepsJson: steps as unknown as Prisma.InputJsonValue, executedAt },
  });
  if (wrote.count === 0) {
    const cur = await tenantDb(ctx).aiPlan.findFirst({ where: { id: planId }, select: { stepsJson: true } });
    const now = (Array.isArray(cur?.stepsJson) ? cur.stepsJson : []) as unknown as Record<string, unknown>[];
    const merged = now.map((st, i) => (steps[i] ? { ...st, status: steps[i]!.status } : st));
    await tenantDb(ctx).aiPlan.update({ where: { id: planId }, data: { status, stepsJson: merged as unknown as Prisma.InputJsonValue, executedAt } });
  }

  return { ok: !failed, results, doneCount };
}

// ── ยกเลิกแผน — PENDING→REJECTED เท่านั้น (สถานะอื่น/ไม่พบ → false) ──
// CRM C5.5-G2 ▸ เฉพาะแผนในบทสนทนาที่ผู้กดเห็น ◂
export async function rejectPlan(ctx: ConvCtx, id: string): Promise<boolean> {
  const row = await tenantDb({ tenantId: ctx.tenantId }).aiPlan.findFirst({ where: { id }, select: { conversationId: true } });
  if (!row || !canSeeConversationId(sightOf(ctx), row.conversationId)) return false;
  const res = await tenantDb({ tenantId: ctx.tenantId }).aiPlan.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "REJECTED" },
  });
  return res.count > 0;
}

// ── แผนที่ยังรออยู่ของบทสนทนา (PENDING + ยังไม่หมดอายุ) เรียงเก่า→ใหม่ — CRM C5.5-G2 ▸ เฉพาะบทสนทนาที่ผู้ดูเห็น ◂ ──
export async function listPendingPlans(ctx: ConvCtx, conversationId: string) {
  const conv = await findVisibleConversation(ctx, conversationId);
  if (!conv) return [];
  return tenantDb({ tenantId: ctx.tenantId }).aiPlan.findMany({
    where: { conversationId: conv.id, status: "PENDING", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "asc" },
  });
}

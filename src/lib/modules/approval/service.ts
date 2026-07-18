// Approval Engine v1 (WO-0049) — core service กลาง "สายอนุมัติ" (maker-checker) tenant-scoped
// สเปค docs/sds/modules/future-approval.md · ข้อสอบ scripts/qc-approval.mts
//
// หลักการ:
// - ทุก read/CRUD ธรรมดา ผ่าน tenantDb(ctx) → inject tenantId อัตโนมัติ (กันข้ามร้าน)
// - งานที่ต้อง atomic กับ outbox (submit/decide) ห่อใน prisma.$transaction + emitOutbox(tx, …)
//   (เหมือน POS createSale) — ใส่ tenantId ตรง ๆ ในทุก data/where ภายใน tx
// - Decision = append-only (ห้าม update ย้อน) · claim อะตอมมิก updateMany เงื่อนไข currentStepOrder (กันแข่งกด)
// - resolvePolicy เจาะจงสุดชนะ: unitId ตรง (2) > systemId ตรง (1) > global (0)

import type { ApprovalDecisionValue, ApprovalPolicy, ApprovalRequest } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma, tenantDb } from "@/lib/core/db";
import { emitOutbox } from "@/lib/core/outbox";
import type { MembershipCtx } from "@/lib/core/rbac";

export type Ctx = { tenantId: string };

export type StepInput = { order: number; approverRole: "MANAGER" | "OWNER"; approverUserId?: string | null };

export type CreatePolicyInput = {
  name: string;
  entityType: string;
  thresholdSatang?: number | null;
  unitId?: string | null;
  systemId?: string | null;
  steps: StepInput[];
};

// แก้กติกาที่มีอยู่ — เปลี่ยนได้ทุกอย่างยกเว้น entityType (ชนิดเอกสารคงเดิม)
// steps = แทนที่ทั้งชุด (ไม่ใช่ merge) → ส่ง steps ที่ต้องการทั้งหมดมาเสมอ
export type UpdatePolicyInput = {
  name: string;
  thresholdSatang?: number | null;
  unitId?: string | null;
  systemId?: string | null;
  steps: StepInput[];
};

export type ResolveInput = {
  entityType: string;
  unitId?: string | null;
  systemId?: string | null;
  amountSatang?: number | null;
};

export type SubmitInput = {
  entityType: string;
  entityId: string;
  unitId?: string | null;
  systemId?: string | null;
  amountSatang?: number | null;
  requestedById: string;
};

export type DecideInput = { decision: "APPROVED" | "REJECTED"; note?: string | null };
export type DecideResult = { ok: boolean; status: string; note: string | null };

// ── กติกา (policy) ──────────────────────────────────────────────

// สร้างสายอนุมัติ + ขั้นในสาย ใน nested create เดียว (atomic)
// steps ว่าง = ไม่มีความหมาย → throw ไทย · tenantId ใส่ทั้ง policy และทุก step (nested ไม่ถูก guard inject ให้)
export async function createPolicy(ctx: Ctx, input: CreatePolicyInput): Promise<{ id: string }> {
  if (!input.steps || input.steps.length === 0) {
    throw new Error("ต้องมีขั้นอนุมัติอย่างน้อย 1 ขั้น");
  }
  const row = await tenantDb(ctx).approvalPolicy.create({
    data: {
      tenantId: ctx.tenantId,
      name: input.name.trim(),
      entityType: input.entityType,
      thresholdSatang: input.thresholdSatang ?? null,
      unitId: input.unitId ?? null,
      systemId: input.systemId ?? null,
      steps: {
        create: input.steps.map((s) => ({
          tenantId: ctx.tenantId,
          order: s.order,
          approverRole: s.approverRole,
          approverUserId: s.approverUserId ?? null,
        })),
      },
    },
  });
  return { id: row.id };
}

// เปิด/ปิดกติกา (ปิดแล้ว resolvePolicy ข้าม)
export async function setPolicyActive(ctx: Ctx, policyId: string, active: boolean): Promise<ApprovalPolicy> {
  return tenantDb(ctx).approvalPolicy.update({ where: { id: policyId }, data: { active } });
}

// แก้กติกา + แทนที่ steps ทั้งชุด แบบ atomic ($transaction)
// - guard tenant: อ่านผ่าน tenantDb ก่อน (cross-tenant → ไม่พบ → throw → ไม่แตะข้อมูลเลย)
// - steps ว่าง → throw เหมือน createPolicy
// - entityType ไม่แก้ (คงเดิม) → ApprovalRequest ที่ยื่นไปแล้วอ้าง policyId เดิมและใช้ claim ของตัวเอง
//   (decide โหลด steps สด ๆ ทุกครั้ง — in-flight ที่ค้างยังไม่ถูกกดจะเริ่มใช้ steps ชุดใหม่ · ตามสเปค)
export async function updatePolicy(ctx: Ctx, policyId: string, input: UpdatePolicyInput): Promise<{ id: string }> {
  if (!input.steps || input.steps.length === 0) {
    throw new Error("ต้องมีขั้นอนุมัติอย่างน้อย 1 ขั้น");
  }
  const existing = await tenantDb(ctx).approvalPolicy.findFirst({ where: { id: policyId } });
  if (!existing) throw new Error("ไม่พบสายอนุมัติในร้านนี้");

  await prisma.$transaction(async (tx) => {
    await tx.approvalPolicy.update({
      where: { id: policyId },
      data: {
        name: input.name.trim(),
        thresholdSatang: input.thresholdSatang ?? null,
        unitId: input.unitId ?? null,
        systemId: input.systemId ?? null,
      },
    });
    // แทนที่ steps ทั้งชุด: ลบเดิม (scope tenant+policy) แล้วสร้างใหม่
    await tx.approvalStep.deleteMany({ where: { tenantId: ctx.tenantId, policyId } });
    await tx.approvalStep.createMany({
      data: input.steps.map((s) => ({
        tenantId: ctx.tenantId,
        policyId,
        order: s.order,
        approverRole: s.approverRole,
        approverUserId: s.approverUserId ?? null,
      })),
    });
  });
  return { id: policyId };
}

// รายการกติกาของร้านนี้ (ใหม่สุดก่อน) + ขั้นอนุมัติเรียงลำดับ
export async function listPolicies(ctx: Ctx) {
  return tenantDb(ctx).approvalPolicy.findMany({
    orderBy: { createdAt: "desc" },
    include: { steps: { orderBy: { order: "asc" } } },
  });
}

// เลือกกติกาที่ตรงกับคำขอ — เจาะจงสุดชนะ · null = ไม่ต้องอนุมัติ
export async function resolvePolicy(ctx: Ctx, input: ResolveInput): Promise<ApprovalPolicy | null> {
  const policies = await tenantDb(ctx).approvalPolicy.findMany({
    where: { entityType: input.entityType, active: true },
  });
  const amount = input.amountSatang ?? null;
  const reqUnit = input.unitId ?? null;
  const reqSystem = input.systemId ?? null;

  const matches = policies.filter((p) => {
    if (p.unitId != null && p.unitId !== reqUnit) return false;
    if (p.systemId != null && p.systemId !== reqSystem) return false;
    // threshold: null = ทุกจำนวน · มี threshold แต่ยอด null = ไม่เข้า · ยอด < threshold = ไม่เข้า
    if (p.thresholdSatang != null && (amount == null || amount < p.thresholdSatang)) return false;
    return true;
  });
  if (matches.length === 0) return null;

  // เจาะจงสุดชนะ: unit (2) > system (1) > global (0) · เสมอ = ใหม่สุดก่อน
  matches.sort((a, b) => specificity(b) - specificity(a) || b.createdAt.getTime() - a.createdAt.getTime());
  return matches[0];
}

const specificity = (p: ApprovalPolicy): number => (p.unitId != null ? 2 : 0) + (p.systemId != null ? 1 : 0);

// ── ยื่นคำขอ (submit) ────────────────────────────────────────────

// ยื่น entity เข้าสายอนุมัติ · ไม่มี policy → autoApproved (ต้นทางเดินต่อ)
// มี policy → สร้าง ApprovalRequest (PENDING step 1) + outbox "approval.request.submitted"
// idempotent: ยื่นซ้ำ entity เดิม (idempotencyKey) → คืน requestId เดิม
export async function submitForApproval(
  ctx: Ctx,
  input: SubmitInput,
): Promise<{ autoApproved: true } | { requestId: string }> {
  const policy = await resolvePolicy(ctx, {
    entityType: input.entityType,
    unitId: input.unitId ?? null,
    systemId: input.systemId ?? null,
    amountSatang: input.amountSatang ?? null,
  });
  if (!policy) return { autoApproved: true };

  const idempotencyKey = `approval-${input.entityType}-${input.entityId}`;
  const existing = await tenantDb(ctx).approvalRequest.findFirst({ where: { idempotencyKey } });
  if (existing) return { requestId: existing.id };

  try {
    const requestId = await prisma.$transaction(async (tx) => {
      const req = await tx.approvalRequest.create({
        data: {
          tenantId: ctx.tenantId,
          policyId: policy.id,
          entityType: input.entityType,
          entityId: input.entityId,
          unitId: input.unitId ?? null,
          systemId: input.systemId ?? null,
          amountSatang: input.amountSatang ?? null,
          requestedById: input.requestedById,
          currentStepOrder: 1,
          idempotencyKey,
        },
      });
      await emitOutbox(tx, {
        tenantId: ctx.tenantId,
        type: "approval.request.submitted",
        idempotencyKey: `approval.request.submitted#${req.id}`,
        payload: { requestId: req.id, entityType: input.entityType, entityId: input.entityId },
        unitId: input.unitId ?? null,
        systemId: input.systemId ?? null,
      });
      return req.id;
    });
    return { requestId };
  } catch (e) {
    // แข่งกันยื่นพร้อมกัน → ชน @@unique(tenantId, idempotencyKey) → คืนของที่มีอยู่
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const row = await tenantDb(ctx).approvalRequest.findFirst({ where: { idempotencyKey } });
      if (row) return { requestId: row.id };
    }
    throw e;
  }
}

// ── ตัดสิน (decide) ──────────────────────────────────────────────

// step ปัจจุบันนี้ ผู้ใช้ m ตัดสินได้ไหม:
//   approverUserId ตรง userId → ได้ · OWNER → ได้ทุก step · MANAGER → เฉพาะ step ที่ role = MANAGER
function canDecideStep(m: MembershipCtx & { userId: string }, step: { approverRole: string; approverUserId: string | null }): boolean {
  if (step.approverUserId && step.approverUserId === m.userId) return true;
  if (m.role === "OWNER") return true;
  if (m.role === "MANAGER") return step.approverRole === "MANAGER";
  return false;
}

// ตัดสินคำขอที่ step ปัจจุบัน — บันทึก Decision (append-only) + เลื่อน/ปิดสถานะ
// APPROVED ขั้นสุดท้าย → APPROVED + emit approved · REJECT ขั้นใด → REJECTED ทันที + emit rejected
export async function decide(
  m: MembershipCtx & { userId: string },
  ctx: Ctx,
  requestId: string,
  input: DecideInput,
): Promise<DecideResult> {
  const req = await tenantDb(ctx).approvalRequest.findFirst({ where: { id: requestId } });
  if (!req || req.status !== "PENDING") {
    return { ok: false, status: req?.status ?? "NOT_FOUND", note: null };
  }
  const steps = await tenantDb(ctx).approvalStep.findMany({
    where: { policyId: req.policyId },
    orderBy: { order: "asc" },
  });
  const idx = steps.findIndex((s) => s.order === req.currentStepOrder);
  const step = steps[idx];
  if (!step) return { ok: false, status: req.status, note: null };

  // สิทธิ์ไม่ผ่าน → คง PENDING (คนมีสิทธิ์มากดทีหลังได้)
  if (!canDecideStep(m, step)) return { ok: false, status: req.status, note: null };

  const decision: ApprovalDecisionValue = input.decision === "REJECTED" ? "REJECTED" : "APPROVED";
  const note = input.note?.trim() ? input.note.trim() : null;
  const isFinal = idx === steps.length - 1;
  const curOrder = req.currentStepOrder;

  return prisma.$transaction(async (tx) => {
    // ── REJECT: ปิดทันที ──
    if (decision === "REJECTED") {
      const claim = await tx.approvalRequest.updateMany({
        where: { id: requestId, tenantId: ctx.tenantId, status: "PENDING", currentStepOrder: curOrder },
        data: { status: "REJECTED", decidedAt: new Date() },
      });
      if (claim.count !== 1) return { ok: false, status: "PENDING", note: null };
      await tx.approvalDecision.create({
        data: { tenantId: ctx.tenantId, requestId, stepOrder: step.order, decidedById: m.userId, decision: "REJECTED", note },
      });
      await emitOutbox(tx, {
        tenantId: ctx.tenantId,
        type: "approval.request.rejected",
        idempotencyKey: `approval.request.rejected#${requestId}`,
        payload: { requestId, entityType: req.entityType, entityId: req.entityId },
        unitId: req.unitId,
        systemId: req.systemId,
      });
      return { ok: true, status: "REJECTED", note };
    }

    // ── APPROVED ขั้นสุดท้าย → อนุมัติสมบูรณ์ ──
    if (isFinal) {
      const claim = await tx.approvalRequest.updateMany({
        where: { id: requestId, tenantId: ctx.tenantId, status: "PENDING", currentStepOrder: curOrder },
        data: { status: "APPROVED", decidedAt: new Date() },
      });
      if (claim.count !== 1) return { ok: false, status: "PENDING", note: null };
      await tx.approvalDecision.create({
        data: { tenantId: ctx.tenantId, requestId, stepOrder: step.order, decidedById: m.userId, decision: "APPROVED", note },
      });
      await emitOutbox(tx, {
        tenantId: ctx.tenantId,
        type: "approval.request.approved",
        idempotencyKey: `approval.request.approved#${requestId}`,
        payload: { requestId, entityType: req.entityType, entityId: req.entityId },
        unitId: req.unitId,
        systemId: req.systemId,
      });
      return { ok: true, status: "APPROVED", note };
    }

    // ── APPROVED ขั้นกลาง → เลื่อนไป step ถัดไป (ยัง PENDING) ──
    const next = steps[idx + 1];
    const claim = await tx.approvalRequest.updateMany({
      where: { id: requestId, tenantId: ctx.tenantId, status: "PENDING", currentStepOrder: curOrder },
      data: { currentStepOrder: next.order },
    });
    if (claim.count !== 1) return { ok: false, status: "PENDING", note: null };
    await tx.approvalDecision.create({
      data: { tenantId: ctx.tenantId, requestId, stepOrder: step.order, decidedById: m.userId, decision: "APPROVED", note },
    });
    return { ok: true, status: "PENDING", note };
  });
}

// ── รายการ + ยกเลิก ─────────────────────────────────────────────

// คำขอ PENDING ที่ step ปัจจุบันรอ "คนแบบนี้" (role/userId) ตัดสิน
export async function listPending(ctx: Ctx, m: MembershipCtx & { userId: string }): Promise<ApprovalRequest[]> {
  const requests = await tenantDb(ctx).approvalRequest.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
  if (requests.length === 0) return [];
  // โหลด step ปัจจุบันของแต่ละ policy (ครั้งเดียวต่อ policy)
  const policyIds = [...new Set(requests.map((r) => r.policyId))];
  const steps = await tenantDb(ctx).approvalStep.findMany({ where: { policyId: { in: policyIds } } });
  return requests.filter((r) => {
    const step = steps.find((s) => s.policyId === r.policyId && s.order === r.currentStepOrder);
    return !!step && canDecideStep(m, step);
  });
}

// คำขอที่ "ฉันเป็นผู้ยื่น" (requestedById=userId) — ใหม่สุดก่อน + ชื่อสาย + จำนวนขั้นรวม
// (ผู้ยื่นดูสถานะคำขอตัวเองได้ · totalSteps ไว้แสดง "ขั้น x/y")
export type MyRequest = ApprovalRequest & { policyName: string; totalSteps: number };
export async function listMyRequests(ctx: Ctx, userId: string): Promise<MyRequest[]> {
  const requests = await tenantDb(ctx).approvalRequest.findMany({
    where: { requestedById: userId },
    orderBy: { createdAt: "desc" },
  });
  if (requests.length === 0) return [];
  const policyIds = [...new Set(requests.map((r) => r.policyId))];
  const policies = await tenantDb(ctx).approvalPolicy.findMany({
    where: { id: { in: policyIds } },
    include: { steps: true },
  });
  return requests.map((r) => {
    const p = policies.find((x) => x.id === r.policyId);
    return { ...r, policyName: p?.name ?? "", totalSteps: p?.steps.length ?? 0 };
  });
}

// ต้นทางยกเลิก entity → PENDING→CANCELLED (สถานะอื่น/ไม่พบ → false)
export async function cancelRequest(ctx: Ctx, requestId: string): Promise<boolean> {
  const res = await tenantDb(ctx).approvalRequest.updateMany({
    where: { id: requestId, status: "PENDING" },
    data: { status: "CANCELLED", decidedAt: new Date() },
  });
  return res.count > 0;
}

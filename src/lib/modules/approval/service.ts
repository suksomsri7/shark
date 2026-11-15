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
import { canAccessUnit, type MembershipCtx } from "@/lib/core/rbac";

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

// HR LEAVE-3 ▸ R2: expectedStep = ขั้นที่ผู้ตัดสินเห็นบนจอ/ข้อเสนอ — ไม่ตรงขั้นปัจจุบัน ⇒ ไม่ตัดสินอะไร (ผลเดียวกับกดแข่งแพ้) · ไม่ส่ง = ขั้นปัจจุบัน (เดิม) ◂
export type DecideInput = { decision: "APPROVED" | "REJECTED"; note?: string | null; expectedStep?: number };
export type DecideResult = { ok: boolean; status: string; note: string | null; code?: string; message?: string; reason?: string }; // POS P1.18 code/message (SELF_APPROVAL) + HF-HR-0 ▸ รอบ 5: reason = เหตุผลไทยเมื่อปฏิเสธ ◂

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

// HR LEAVE-3 ▸ R3: ข้อความคงที่ + จำนวนคำขอที่จะค้าง (ไม่มีชื่อ/รหัส) ◂
const STEP_EDIT_STRANDS = (n: number) => `แก้ขั้นอนุมัติของสายนี้ไม่ได้ เพราะมีคำขอรอตัดสินอยู่ ${n} รายการ — ตัดสินหรือยกเลิกคำขอเหล่านั้นก่อน หรือปิดสายนี้แล้วสร้างสายใหม่`;

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
    // HR LEAVE-3 ▸ R3 (F3): ล็อกแถวสาย แล้วนับคำขอที่รอตัดสินซึ่ง "ขั้นปัจจุบัน" จะไม่มีในชุดขั้นใหม่ (คำขอค้างตัดสินไม่ได้) —
    //   มี ⇒ ปฏิเสธด้วยจำนวน ไม่เขียนอะไร · แก้ขั้นที่ไม่ทำให้คำขอค้าง (ชื่อ · วงเงิน · บทบาทของขั้น · เพิ่ม/ลบขั้นอื่น) ทำได้เหมือนเดิม ◂
    await tx.$queryRaw`SELECT id FROM "ApprovalPolicy" WHERE id = ${policyId} AND "tenantId" = ${ctx.tenantId} FOR UPDATE`;
    const stranded = await tx.approvalRequest.count({ where: { tenantId: ctx.tenantId, policyId, status: "PENDING", currentStepOrder: { notIn: input.steps.map((s) => s.order) } } });
    if (stranded > 0) throw new Error(STEP_EDIT_STRANDS(stranded));
    // ◂ HR LEAVE-3
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
// HF-HR-0 ▸ รอบ 5d (N1): `tx` = อ่านผ่านธุรกรรมของผู้เรียก (ห้ามยืม connection ที่สองจาก pool ระหว่างธุรกรรมเปิด) · ไม่ส่ง = เหมือนเดิม ◂
export async function resolvePolicy(ctx: Ctx, input: ResolveInput, tx?: Prisma.TransactionClient): Promise<ApprovalPolicy | null> {
  const policies = tx
    ? await tx.approvalPolicy.findMany({ where: { tenantId: ctx.tenantId, entityType: input.entityType, active: true } })
    : await tenantDb(ctx).approvalPolicy.findMany({
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
  // HF-HR-0 ▸ รอบ 5c (F2): `tx` = ผู้เรียกเขียน entity ในธุรกรรมนี้ (hr requestLeave) ⇒ คำขอ + outbox เกิดพร้อม entity (ไม่ส่ง = เหมือนเดิม) ◂
  opts: { tx?: Prisma.TransactionClient } = {},
): Promise<{ autoApproved: true } | { requestId: string }> {
  const policy = await resolvePolicy(ctx, {
    entityType: input.entityType,
    unitId: input.unitId ?? null,
    systemId: input.systemId ?? null,
    amountSatang: input.amountSatang ?? null,
  }, opts.tx); // HF-HR-0 ▸ รอบ 5d (N1): มี tx ⇒ ทุกคำสั่งของฟังก์ชันนี้ผ่าน tx ◂
  if (!policy) return { autoApproved: true };

  const idempotencyKey = `approval-${input.entityType}-${input.entityId}`;
  const existing = opts.tx
    ? await opts.tx.approvalRequest.findFirst({ where: { tenantId: ctx.tenantId, idempotencyKey } })
    : await tenantDb(ctx).approvalRequest.findFirst({ where: { idempotencyKey } });
  if (existing) return { requestId: existing.id };

  try {
    const write = async (tx: Prisma.TransactionClient) => {
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
    };
    const requestId = opts.tx ? await write(opts.tx) : await prisma.$transaction(write);
    return { requestId };
  } catch (e) {
    // แข่งกันยื่นพร้อมกัน → ชน @@unique(tenantId, idempotencyKey) → คืนของที่มีอยู่ (ใน tx ของผู้เรียก ธุรกรรมพังแล้ว ⇒ โยนต่อ)
    if (!opts.tx && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const row = await tenantDb(ctx).approvalRequest.findFirst({ where: { idempotencyKey } });
      if (row) return { requestId: row.id };
    }
    throw e;
  }
}

// ── ตัดสิน (decide) ──────────────────────────────────────────────

/** POS P1.18 ▸ K4: ชนิดคำขอที่โมดูลต้นทางจัดการกรณี "ผู้ยื่นตัดสินเอง" ด้วยกติกาของตัวเอง (แกนไม่ปฏิเสธให้) ◂ */
const SELF_DECISION_HANDLED_BY_SOURCE: ReadonlySet<string> = new Set(["crm.commission"]);

// step ปัจจุบันนี้ ผู้ใช้ m ตัดสินได้ไหม:
//   approverUserId ตรง userId → ได้ · OWNER → ได้ทุก step · MANAGER → เฉพาะ step ที่ role = MANAGER
// POS P5.2 ▸ fix A (F1 · X4): คำขอที่ผูกสาขา (req.unitId) ตัดสินได้เฉพาะผู้ที่เข้าสาขานั้นได้ (canAccessUnit · OWNER ทุกสาขา) —
//   ใช้ทุกทาง: listPending (หน้าอนุมัติ · approvals_pending ของผู้ช่วย) · decide · bulkDecide · ผู้ช่วย AI (proposals approval_decide) ◂
function canDecideStep(
  m: MembershipCtx & { userId: string },
  step: { approverRole: string; approverUserId: string | null },
  req: { unitId: string | null },
): boolean {
  if (req.unitId && !canAccessUnit(m, req.unitId)) return false;
  if (step.approverUserId && step.approverUserId === m.userId) return true;
  if (m.role === "OWNER") return true;
  if (m.role === "MANAGER") return step.approverRole === "MANAGER";
  return false;
}

// HF-HR-0 ▸ รอบ 5 (R5.1): ห้ามตัดสิน (อนุมัติ/ปฏิเสธ · ทุกขั้น · รายใบ/หลายใบ/ผู้ช่วย AI) คำขอที่เป็นเรื่อง HR ของ "แถวพนักงานที่ผูกกับบัญชีผู้ตัดสินเอง"
//   ตรวจก่อนเปิดธุรกรรมเขียนการตัดสิน (ไม่ใช่ใน effect — คำขอต้องไม่จบ APPROVED ขณะใบลายังรอ) · ApprovalRequest.requestedById ของใบลา
//   = id พนักงาน (ไม่ใช่ user) ⇒ หาเจ้าของจาก entity เอง · ชนิด HR ที่เข้าสายอนุมัติวันนี้มีชนิดเดียว = HrLeave (hr/service.ts requestLeave)
//   อ่านด้วย prisma + tenantId เอง: HrLeave เป็นตาราง system-scoped แต่คำขอไม่บังคับ systemId · พนักงานที่ไม่ผูกบัญชี = ตรวจไม่ได้ (ข้อจำกัดเดิม)
export const SELF_DECIDE_REFUSED = "อนุมัติคำขอของตัวเองไม่ได้ — ให้ผู้อนุมัติคนอื่นตัดสิน";
export const TWO_PERSON_REFUSED = "คุณตัดสินขั้นก่อนหน้าของคำขอนี้แล้ว — ขั้นนี้ต้องให้ผู้อนุมัติคนอื่นตัดสิน"; // HR LEAVE-3 ▸ R2 ◂
async function isOwnHrSubject(ctx: Ctx, req: Pick<ApprovalRequest, "entityType" | "entityId">, userId: string): Promise<boolean> {
  if (!userId) return false;
  if (req.entityType === "HrLeave") {
    const leave = await prisma.hrLeave.findFirst({
      where: { id: req.entityId, tenantId: ctx.tenantId },
      select: { employee: { select: { linkedUserId: true } } },
    });
    return !!leave && leave.employee.linkedUserId === userId;
  }
  // HR H2.3 ▸ คำขอสลับกะ: ผู้ขอและเพื่อนผู้รับกะ (ผ่านพนักงานที่ผูกบัญชี) ตัดสินคำขอนี้ไม่ได้ — อ่านด้วย prisma + tenantId แบบกิ่งใบลา
  if (req.entityType === "HrShiftSwapRequest") {
    const swap = await prisma.hrShiftSwapRequest.findFirst({ where: { id: req.entityId, tenantId: ctx.tenantId }, select: { requesterEmployeeId: true, targetEmployeeId: true } });
    if (!swap) return false;
    const ids = [swap.requesterEmployeeId, swap.targetEmployeeId].filter((x): x is string => !!x);
    return (await prisma.hrEmployee.count({ where: { tenantId: ctx.tenantId, id: { in: ids }, linkedUserId: userId } })) > 0;
  }
  // ◂ HR H2.3
  // HR H2.6 ▸ คำขอแก้เวลา: พนักงานเจ้าของเวลา (ผ่านบัญชีที่ผูก) และผู้ยื่นแทน ตัดสินคำขอนี้ไม่ได้ — อ่านด้วย prisma + tenantId แบบกิ่งใบลา ◂
  if (req.entityType === "HrTimeCorrection") {
    const c = await prisma.hrTimeCorrection.findFirst({ where: { id: req.entityId, tenantId: ctx.tenantId }, select: { requestedByUserId: true, employee: { select: { linkedUserId: true } } } }); // HR H2.6 ◂
    return !!c && (c.employee.linkedUserId === userId || c.requestedByUserId === userId); // HR H2.6 ◂
  }
  return false;
}
// ◂ HF-HR-0

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
  if (input.expectedStep !== undefined && input.expectedStep !== req.currentStepOrder) return { ok: false, status: "PENDING", note: null }; // HR LEAVE-3 ▸ R2: ขั้นที่เห็นผ่านไปแล้ว = กดแข่งแพ้ ◂
  // POS P1.18 ▸ K4 (P1.15 close item): ผู้ยื่นตัดสินคำขอของตัวเองไม่ได้ — ที่แกน (ทุกทาง: หน้าอนุมัติ · bulkDecide · ผู้ช่วย AI) ·
  //   คำขอคง PENDING · ไม่มีแถวตัดสิน · ไม่มี outbox · ยกเว้น 2 กรณี:
  //   (a) ชนิดที่ต้นทางจัดการ "ตัดสินของตัวเอง" เองแล้ว (crm.commission: มติ C3.3 S3 — คง PENDING + โน้ต + แจ้งเจ้าของ · qc-crm-c3.3 S4.8)
  //   (b) แก้รอบ 2 F3: ผู้ตัดสินเป็น OWNER และร้านมีเจ้าของ (OWNER ที่รับคำเชิญแล้ว) คนเดียว — ร้านเจ้าของคนเดียวไม่มีใครอื่นตัดสินให้
  //       จึงไม่ค้างคำขอของตัวเอง · ร้านหลายเจ้าของยังต้องให้เจ้าของอีกคนตัดสิน · นับสดทุกครั้ง 1 query (ไม่แคช) ◂
  if (req.requestedById === m.userId && !SELF_DECISION_HANDLED_BY_SOURCE.has(req.entityType)) {
    const soleOwner =
      m.role === "OWNER" &&
      (await prisma.membership.count({ where: { tenantId: ctx.tenantId, role: "OWNER", acceptedAt: { not: null } } })) === 1;
    if (!soleOwner) {
      // HR SYNC ▸ + reason (สัญญา HF-HR-0 รอบ 5: reason = เหตุผลไทยเมื่อปฏิเสธ) — ผู้ช่วย AI (proposals approval_decide) อ่าน reason
      //   ไม่งั้นผู้ใช้เห็นข้อความกลางแทน "อนุมัติคำขอของตัวเองไม่ได้" · ข้อความไบต์เดียวกับ message ◂
      return { ok: false, status: req.status, note: null, code: "SELF_APPROVAL", message: "อนุมัติคำขอของตัวเองไม่ได้ — ให้ผู้อนุมัติคนอื่นตัดสิน", reason: SELF_DECIDE_REFUSED };
    }
  }
  const steps = await tenantDb(ctx).approvalStep.findMany({
    where: { policyId: req.policyId },
    orderBy: { order: "asc" },
  });
  const idx = steps.findIndex((s) => s.order === req.currentStepOrder);
  const step = steps[idx];
  if (!step) return { ok: false, status: req.status, note: null };

  // สิทธิ์ไม่ผ่าน → คง PENDING (คนมีสิทธิ์มากดทีหลังได้)
  if (!canDecideStep(m, step, req)) return { ok: false, status: req.status, note: null };
  if (await isOwnHrSubject(ctx, req, m.userId)) return { ok: false, status: req.status, note: null, reason: SELF_DECIDE_REFUSED }; // HF-HR-0 ▸ R5.1 ◂

  const decision: ApprovalDecisionValue = input.decision === "REJECTED" ? "REJECTED" : "APPROVED";
  const note = input.note?.trim() ? input.note.trim() : null;
  const curOrder = req.currentStepOrder; // HR LEAVE-3 ▸ W1: isFinal คิดจากขั้นสดในธุรกรรม ◂

  return prisma.$transaction(async (tx) => {
    // HR LEAVE-3 ▸ W1 (r3): ล็อกแถวสายแบบ FOR SHARE แล้วอ่านขั้น "สด" ในธุรกรรม — updatePolicy (FOR UPDATE แถวเดียวกัน) แทรกระหว่างอ่านขั้นกับ claim ไม่ได้ ·
    //   วางแผนการตัดสินบนขั้นสด (ขั้นนี้กลายเป็นขั้นสุดท้าย ⇒ จบ APPROVED) · ขั้นปัจจุบันไม่มีแล้ว/สิทธิ์เปลี่ยน = ไม่ตัดสินอะไร (ผลเดียวกับกดแข่งแพ้) ·
    //   ลำดับล็อก: แถวสาย (SHARE) → แถวคำขอ (claim) — ไม่มีทางไหนถือแถวคำขอแล้วรอแถวสาย ◂
    await tx.$queryRaw`SELECT id FROM "ApprovalPolicy" WHERE id = ${req.policyId} AND "tenantId" = ${ctx.tenantId} FOR SHARE`;
    const live = await tx.approvalStep.findMany({ where: { tenantId: ctx.tenantId, policyId: req.policyId }, orderBy: { order: "asc" } });
    const li = live.findIndex((s) => s.order === curOrder);
    const step = live[li]; // ขั้นสด (บังเงา step ที่อ่านนอกธุรกรรม) — HR LEAVE-3 ◂
    if (!step || !canDecideStep(m, step, req)) return { ok: false, status: "PENDING", note: null };
    const isFinal = li === live.length - 1; // HR LEAVE-3 ▸ W1 ◂
    // HR LEAVE-3 ▸ R2 (F2) สองคน: ผู้ที่ตัดสินขั้นก่อนหน้าของคำขอนี้แล้ว ตัดสินขั้นถัดไปไม่ได้ (ไม่เขียนอะไร) · ยกเว้น OWNER = เขียนได้ + AuditLog approval.owner_override
    //   ในธุรกรรมเดียวกับการตัดสิน · การตัดสินขั้นก่อนหน้า commit แล้วก่อนคำขอเลื่อนมาขั้นนี้ ⇒ อ่านก่อน claim ได้ (claim เงื่อนไขขั้นเดิมกันกดแข่ง) ·
    //   สายขั้นเดียว: ไม่มีขั้นก่อนหน้า ⇒ ผลเหมือนเดิมทุกไบต์ ◂
    const earlier = await tx.approvalDecision.findFirst({ where: { tenantId: ctx.tenantId, requestId, decidedById: m.userId, stepOrder: { lt: step.order } }, orderBy: { stepOrder: "desc" }, select: { stepOrder: true } });
    if (earlier && m.role !== "OWNER") return { ok: false, status: "PENDING", note: null, code: "TWO_PERSON", reason: TWO_PERSON_REFUSED };
    const override = earlier
      ? () => tx.auditLog.create({ data: { tenantId: ctx.tenantId, actorType: "USER", actorId: m.userId, action: "approval.owner_override", targetType: "ApprovalRequest", targetId: requestId, after: { step: step.order, previousDeciderStep: earlier.stepOrder } } })
      : async () => null;
    // ◂ HR LEAVE-3
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
      await override(); // HR LEAVE-3 ▸ R2 ◂
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
      await override(); // HR LEAVE-3 ▸ R2 ◂
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
    const next = live[li + 1]; // HR LEAVE-3 ▸ W1: ขั้นถัดไปจากขั้นสด ◂
    const claim = await tx.approvalRequest.updateMany({
      where: { id: requestId, tenantId: ctx.tenantId, status: "PENDING", currentStepOrder: curOrder },
      data: { currentStepOrder: next.order },
    });
    if (claim.count !== 1) return { ok: false, status: "PENDING", note: null };
    await tx.approvalDecision.create({
      data: { tenantId: ctx.tenantId, requestId, stepOrder: step.order, decidedById: m.userId, decision: "APPROVED", note },
    });
    await override(); // HR LEAVE-3 ▸ R2 ◂
    return { ok: true, status: "PENDING", note };
  });
}

// ── ตัดสินหลายใบพร้อมกัน (bulk) ──────────────────────────────────

export type BulkDecideResult = { done: number; failed: { id: string; reason: string }[] };
export const UNEXPECTED_REFUSAL = "ระบบขัดข้องชั่วคราว ลองใหม่อีกครั้ง"; // HF-HR-0 ▸ รอบ 5c (F3) ◂

// เหตุผลไทยที่ decide คืน ok:false — status ไม่ใช่ PENDING หรือสิทธิ์/สถานะเปลี่ยนระหว่างกด
function bulkFailReason(status: string): string {
  if (status === "NOT_FOUND") return "ไม่พบคำขอในร้านนี้";
  if (status === "APPROVED") return "อนุมัติไปแล้ว";
  if (status === "REJECTED") return "ปฏิเสธไปแล้ว";
  if (status === "CANCELLED") return "ถูกยกเลิกแล้ว";
  return "ไม่มีสิทธิ์ตัดสินขั้นนี้ หรือถูกตัดสินไปแล้ว";
}

// อนุมัติ/ปฏิเสธหลายคำขอพร้อมกัน — วน decide() ทีละใบ (แต่ละใบ assertCan/claim/atomic เดิม)
// ไม่ atomic ทั้งชุด: ใบไหนพลาด (สิทธิ์ไม่พอ/สถานะเปลี่ยน/ไม่พบ/ข้ามร้าน) → บันทึกใน failed แล้วทำใบต่อไป
// note ใช้ร่วมทุกใบที่เลือก (เช่น เหตุผลปฏิเสธชุดเดียว)
export async function bulkDecide(
  m: MembershipCtx & { userId: string },
  ctx: Ctx,
  requestIds: string[],
  decision: "APPROVED" | "REJECTED",
  note?: string | null,
  steps?: Record<string, number>, // HR LEAVE-3 ▸ R2: ขั้นที่ผู้ตัดสินเห็นต่อคำขอ (ไม่มี = ขั้นปัจจุบัน) ◂
): Promise<BulkDecideResult> {
  const result: BulkDecideResult = { done: 0, failed: [] };
  for (const id of [...new Set(requestIds)]) { // HR LEAVE-3 ▸ R2: id ซ้ำในชุด = ตัดทิ้งเงียบ ๆ (Q4) ◂
    try {
      const st = steps && Object.prototype.hasOwnProperty.call(steps, id) ? steps[id] : undefined; // HR LEAVE-3 ▸ R2 ◂
      const r = await decide(m, ctx, id, { decision, note: note ?? null, ...(st === undefined ? {} : { expectedStep: st }) }); // HR LEAVE-3 ▸ R2 ◂
      if (r.ok) result.done += 1;
      else result.failed.push({ id, reason: r.code === "SELF_APPROVAL" && r.message ? r.message : (r.reason ?? bulkFailReason(r.status)) }); // POS P1.18 ▸ K4 ◂ · HF-HR-0 ▸ R5.1 ◂
    } catch (e) {
      // HF-HR-0 ▸ รอบ 5c (F3): decide ไม่โยนเหตุผลที่คาดไว้ (คืนเป็น reason) ⇒ ที่หลุดมาถึงนี่ = ข้อผิดพลาดที่ไม่คาดคิด (เช่น Prisma — มี path ไฟล์/รหัส)
      //   ผลนี้คืนเป็นข้อมูล production ไม่ปิดให้ ⇒ log ฝั่ง server + ข้อความกลาง ◂
      console.error("[approval.bulkDecide]", e);
      result.failed.push({ id, reason: UNEXPECTED_REFUSAL });
    }
  }
  return result;
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
  // HR LEAVE-3 ▸ W6 (r3): ผู้ที่ไม่ใช่ OWNER ซึ่งตัดสินขั้นก่อนหน้าของคำขอแล้ว ไม่เห็นคำขอนั้นในขั้นถัดไป (กติกาสองคนของ decide) · OWNER เห็นเหมือนเดิม ◂
  const mine = m.role === "OWNER" ? [] : await tenantDb(ctx).approvalDecision.findMany({ where: { requestId: { in: requests.map((r) => r.id) }, decidedById: m.userId }, select: { requestId: true, stepOrder: true } });
  return requests.filter((r) => {
    const step = steps.find((s) => s.policyId === r.policyId && s.order === r.currentStepOrder);
    return !!step && canDecideStep(m, step, r) && !mine.some((d) => d.requestId === r.id && d.stepOrder < r.currentStepOrder); // HR LEAVE-3 ▸ W6 ◂
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

// CRM C5.5-fix9 r2 (review M3): ยกเลิกหลายคำขอในคราวเดียว — semantics เดียวกับ cancelRequest (สถานะ PENDING→CANCELLED เท่านั้น ·
//   ไม่มี event/แจ้งเตือนเพิ่ม) แต่คำสั่งละ ≤ 1,000 id · เฉพาะแถวที่ยัง PENDING ⇒ ทำซ้ำ/ทำต่อได้ (idempotent) · คืนจำนวนที่เพิ่งยกเลิก
const CANCEL_CHUNK = 1_000;
export async function cancelRequests(ctx: Ctx, requestIds: readonly string[]): Promise<number> {
  const ids = [...new Set(requestIds.filter((x) => typeof x === "string" && !!x))];
  let n = 0;
  const at = new Date();
  for (let i = 0; i < ids.length; i += CANCEL_CHUNK) {
    const res = await tenantDb(ctx).approvalRequest.updateMany({
      where: { id: { in: ids.slice(i, i + CANCEL_CHUNK) }, status: "PENDING" },
      data: { status: "CANCELLED", decidedAt: at },
    });
    n += res.count;
  }
  return n;
}

// ต้นทางยกเลิก entity → PENDING→CANCELLED (สถานะอื่น/ไม่พบ → false)
// HR H0.7 R11 ▸ `tx` = ผู้เรียกยกเลิก entity ในธุรกรรมนี้ (hr cancelLeave · ล็อกต่อใบลา) ⇒ คำขอ + entity เปลี่ยนพร้อมกัน (ไม่ส่ง = เหมือนเดิม) ◂
export async function cancelRequest(ctx: Ctx, requestId: string, opts: { tx?: Prisma.TransactionClient } = {}): Promise<boolean> {
  const res = await (opts.tx ? opts.tx.approvalRequest : tenantDb(ctx).approvalRequest).updateMany({
    where: { id: requestId, tenantId: ctx.tenantId, status: "PENDING" },
    data: { status: "CANCELLED", decidedAt: new Date() },
  });
  return res.count > 0;
}

// CRM C3.3 ▸ ผู้ตัดสินขั้นสุดท้ายของคำขอ (อ่านล้วน · ผูกร้าน) — ผู้เรียก: crm/commissions.ts (รีวิวเงินรอบ 2 S-d: ห้ามอนุมัติของตัวเองผ่านสาย)
export async function lastDecisionOf(ctx: Ctx, requestId: string): Promise<{ decidedById: string; decision: string } | null> {
  if (!requestId) return null;
  const d = await tenantDb(ctx).approvalDecision.findFirst({ where: { requestId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { decidedById: true, decision: true } });
  return d ? { decidedById: d.decidedById, decision: String(d.decision) } : null;
}
// ◂ CRM C3.3

// CRM C3.3 ▸ สถานะของคำขอหลายใบ (อ่านล้วน · ผูกร้าน) — ผู้เรียก: งานรายนาทีของคอมมิชชัน (ใช้ผลสายซ้ำเมื่อการแจ้งเจ้าของร้านล้ม)
export async function requestStatuses(ctx: Ctx, requestIds: string[]): Promise<Record<string, string>> {
  const ids = [...new Set(requestIds.filter(Boolean))].slice(0, 500);
  if (ids.length === 0) return {};
  const rows = await tenantDb(ctx).approvalRequest.findMany({ where: { id: { in: ids } }, select: { id: true, status: true }, take: ids.length });
  return Object.fromEntries(rows.map((r) => [r.id, String(r.status)]));
}
// ◂ CRM C3.3

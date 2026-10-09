// pos-approval.ts — POS × สายอนุมัติกลาง (POS P1.15 · R5 · CD3 CD4 · มติผู้คุมงาน 5 7 9 10 11)
// สัญญา = scripts/qc-pos-p1.15.mts (AP0–AP10) · brief ledger/pos-briefs/pos-brief-P1.15.md
//
// 🔴 POS แตะสายอนุมัติผ่าน facade `@/lib/modules/approval` เท่านั้น (fitness "pos→approval" · AP0) — approval/service.ts ไม่ถูกแก้ (CD6)
// 🔴 ผู้เขียนตาราง PosApprovalPayload ที่เดียว (snapshot ของคำขอ — แกนกลางไม่มีคอลัมน์ payload/title · CD3) ·
//    payload = { ref, entityId, requestedById, amountSatang, title, …snapshot, outcome? } · ref = saleId (VOID/REFUND) / heldCartId (DISCOUNT)
// 🔴 คำขอเปิดต่อ ref มีได้ใบเดียว: PENDING · หรือ APPROVED ที่ตัวรับคิวยังไม่ได้บันทึกผล (outcome) = "รออยู่" ⇒ PENDING_APPROVAL requestId เดิม
// 🔴 entityId (มติ 9): VOID = saleId ครั้งแรก · หลังถูกปฏิเสธ/ยกเลิก = saleId:<n> (n = คำขอที่ปิดแล้วของบิลนี้ + 1) ·
//    REFUND = <saleId>:<คีย์ของการคืน> · DISCOUNT = heldCartId — แกนกลางกันซ้ำด้วย approval-<entityType>-<entityId> ตลอดกาล
// 🔴 outcome (ตัวรับคิวเขียนครั้งเดียว): EXECUTED · BLOCKED_SELF_APPROVAL · FAILED:<code> · CONSUMED (ส่วนลดที่ใช้แล้ว)
import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/core/audit";
import { evaluate } from "@/lib/core/rbac";
import { cancelRequest, lastDecisionOf, requestStatuses, resolvePolicy, submitForApproval } from "@/lib/modules/approval";
import { prisma } from "./db";
import { POS_APPROVAL_WAIT_MS, type PosApprovalView, type PosApprovalWaitStatus } from "./register-shared";

export const POS_APPROVAL_KINDS = ["POS_VOID", "POS_REFUND", "POS_DISCOUNT_OVER"] as const;
export type PosApprovalKind = (typeof POS_APPROVAL_KINDS)[number];
export const isPosApprovalKind = (v: unknown): v is PosApprovalKind => typeof v === "string" && (POS_APPROVAL_KINDS as readonly string[]).includes(v);

/** ข้อความของคำปฏิเสธเชิงสายอนุมัติ (ไทย · จอใช้ refusalMessageKey) */
export const POS_APPROVAL_MESSAGE = {
  APPROVAL_REQUIRED: "รายการนี้ต้องรออนุมัติ — ส่งคำขอให้ผู้อนุมัติแล้ว หรือใส่ PIN ผู้จัดการที่เครื่องนี้",
  PENDING_APPROVAL: "มีคำขออนุมัติของรายการนี้รออยู่แล้ว — รอผลอนุมัติ หรือใส่ PIN ผู้จัดการที่เครื่องนี้",
  APPROVAL_MISMATCH: "บิลนี้ไม่ตรงกับที่ได้รับอนุมัติ (รายการ/ยอด/ผู้ขาย) — ขออนุมัติใหม่ หรือใส่ PIN ผู้จัดการ",
} as const;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
type Row = { requestId: string; tenantId: string; kind: string; payload: Prisma.JsonValue; createdAt: Date };
export const payloadOutcome = (payload: unknown): string | null => (isRecord(payload) && typeof payload.outcome === "string" ? payload.outcome : null);

/** snapshot ทุกใบของ ref นี้ (เก่าสุดก่อน) */
async function rowsFor(tenantId: string, kind: PosApprovalKind, ref: string): Promise<Row[]> {
  return prisma.posApprovalPayload.findMany({ where: { tenantId, kind, payload: { path: ["ref"], equals: ref } }, orderBy: [{ createdAt: "asc" }, { requestId: "asc" }] });
}

/** snapshot ของคำขอใบนี้ (ร้านเดียวกันเท่านั้น) */
export async function posApprovalPayload(tenantId: string, requestId: string): Promise<{ kind: PosApprovalKind; payload: Record<string, unknown> } | null> {
  const row = await prisma.posApprovalPayload.findUnique({ where: { requestId } });
  if (!row || row.tenantId !== tenantId || !isPosApprovalKind(row.kind) || !isRecord(row.payload)) return null;
  return { kind: row.kind, payload: row.payload };
}

/**
 * คำขอที่ "ยังเปิด" ของ ref นี้ (ใหม่สุดก่อน): PENDING เสมอ · APPROVED ที่ยังไม่มี outcome (ตัวรับคิวยังไม่วิ่ง — มติ 9) สำหรับ VOID/REFUND ·
 * ส่วนลดที่ APPROVED แล้ว = ปิด (ไปใช้ด้วย heldCartId)
 */
export async function openPosRequest(tenantId: string, kind: PosApprovalKind, ref: string): Promise<{ requestId: string; status: string } | null> {
  const rows = await rowsFor(tenantId, kind, ref);
  if (!rows.length) return null;
  const st = await requestStatuses({ tenantId }, rows.map((r) => r.requestId));
  for (const r of [...rows].reverse()) {
    const s = st[r.requestId];
    if (s === "PENDING") return { requestId: r.requestId, status: s };
    if (s === "APPROVED" && kind !== "POS_DISCOUNT_OVER" && !payloadOutcome(r.payload)) return { requestId: r.requestId, status: s };
  }
  return null;
}

export type SubmitPosApprovalInput = {
  tenantId: string;
  unitId: string;
  systemId: string;
  kind: PosApprovalKind;
  ref: string;
  /** entityId ของครั้งที่ n (1 = ครั้งแรก) */
  entityIdOf: (n: number) => string;
  amountSatang: number;
  requestedById: string;
  payload: Record<string, unknown>;
};
export type SubmitPosApprovalResult = { status: "AUTO" } | { status: "REQUIRED"; requestId: string } | { status: "PENDING"; requestId: string };

/**
 * ยื่นคำขอ POS เข้าสายกลาง: มีคำขอเปิดของ ref นี้ = PENDING (id เดิม) · ไม่มีกติกาที่เข้าเงื่อนไข = AUTO (ทำตามทางเดิม) ·
 * ใบใหม่ = REQUIRED + snapshot (สร้างคู่กับ requestId · แข่งกันยื่น = ผู้แพ้ได้ PENDING ของใบเดียวกัน)
 */
export async function submitPosApproval(input: SubmitPosApprovalInput): Promise<SubmitPosApprovalResult> {
  const { tenantId, kind, ref } = input;
  const open = await openPosRequest(tenantId, kind, ref);
  if (open) return { status: "PENDING", requestId: open.requestId };
  const prior = (await rowsFor(tenantId, kind, ref)).length;
  for (let n = prior + 1; n <= prior + 20; n++) {
    const entityId = input.entityIdOf(n);
    const r = await submitForApproval({ tenantId }, { entityType: kind, entityId, unitId: input.unitId, systemId: input.systemId, amountSatang: input.amountSatang, requestedById: input.requestedById });
    if ("autoApproved" in r) return { status: "AUTO" };
    const st = (await requestStatuses({ tenantId }, [r.requestId]))[r.requestId];
    // entityId นี้มีคำขอที่ปิดแล้ว (ไม่มี snapshot — เช่น ล้มระหว่างยื่นรอบก่อน) ⇒ ข้ามไปเลขถัดไป
    if (st !== "PENDING") continue;
    try {
      await prisma.posApprovalPayload.create({
        data: {
          requestId: r.requestId,
          tenantId,
          kind,
          payload: { ...input.payload, ref, entityId, requestedById: input.requestedById, amountSatang: input.amountSatang, unitId: input.unitId, systemId: input.systemId } as Prisma.InputJsonValue,
        },
      });
      return { status: "REQUIRED", requestId: r.requestId };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { status: "PENDING", requestId: r.requestId };
      throw e;
    }
  }
  throw new Error("ยื่นคำขออนุมัติไม่สำเร็จ — คำขอของรายการนี้ปิดไปแล้วหลายครั้งเกินไป");
}

/** มีกติกาของชนิดนี้ที่เข้าเงื่อนไขไหม (ไม่ยื่นอะไร) — ใช้ก่อนพักบิลส่วนลดเกินสิทธิ์ (มติ 7) */
export async function posApprovalPolicyExists(tenantId: string, kind: PosApprovalKind, unitId: string, systemId: string, amountSatang: number): Promise<boolean> {
  return !!(await resolvePolicy({ tenantId }, { entityType: kind, unitId, systemId, amountSatang }));
}

/** PIN ผู้จัดการชนะคำขอที่รอ (CD4): ยกเลิกคำขอ PENDING ของ ref นี้ (ถ้ามี) → requestId ที่ยกเลิก | null */
export async function cancelOpenPosRequest(tenantId: string, kind: PosApprovalKind, ref: string): Promise<string | null> {
  const open = await openPosRequest(tenantId, kind, ref);
  if (!open || open.status !== "PENDING") return null;
  return (await cancelRequest({ tenantId }, open.requestId)) ? open.requestId : null;
}

/** audit pos.approval.pin_override — ไม่มี PIN ในบันทึก */
export async function auditPinOverride(input: { tenantId: string; action: PosApprovalKind; requestId: string | null; byUserId: string; forUserId: string; targetType: string; targetId: string; extra?: Record<string, unknown> }): Promise<void> {
  await writeAudit({
    tenantId: input.tenantId,
    actorId: input.byUserId,
    action: "pos.approval.pin_override",
    targetType: input.targetType,
    targetId: input.targetId,
    after: { requestId: input.requestId, action: input.action, byUserId: input.byUserId, forUserId: input.forUserId, ...(input.extra ?? {}) },
  });
}

/** ผู้ตัดสินขั้นสุดท้าย (อ่านล้วนผ่าน facade) */
export async function posApprovalDecider(tenantId: string, requestId: string): Promise<string | null> {
  return (await lastDecisionOf({ tenantId }, requestId))?.decidedById ?? null;
}

/** สถานะของคำขอ (อ่านล้วนผ่าน facade) */
export async function posApprovalStatus(tenantId: string, requestId: string): Promise<string | null> {
  return (await requestStatuses({ tenantId }, [requestId]))[requestId] ?? null;
}

/**
 * บันทึกผลของคำขอครั้งเดียว (ไม่มี outcome อยู่ก่อน) — คืน true เมื่อเป็นผู้เขียนคนแรก ·
 * extra = ฟิลด์ประกอบ (เช่น consumedBySaleKey) · เขียนด้วย jsonb || ในคำสั่งเดียว (อะตอมมิก)
 */
export async function markPosApprovalOutcome(tenantId: string, requestId: string, outcome: string, extra: Record<string, string> = {}): Promise<boolean> {
  const patch = JSON.stringify({ outcome, outcomeAt: new Date().toISOString(), ...extra });
  const n = await prisma.$executeRaw`
    UPDATE "PosApprovalPayload" SET "payload" = "payload" || ${patch}::jsonb
    WHERE "requestId" = ${requestId} AND "tenantId" = ${tenantId} AND NOT ("payload" ? 'outcome')`;
  return n === 1;
}

/** คืนสิทธิ์ส่วนลดที่ยึดไว้ (บิลไม่เกิด) — เฉพาะเมื่อผู้ยึดคือคีย์นี้ */
export async function releasePosApprovalClaim(tenantId: string, requestId: string, saleKey: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "PosApprovalPayload" SET "payload" = "payload" - 'outcome' - 'outcomeAt' - 'consumedBySaleKey'
    WHERE "requestId" = ${requestId} AND "tenantId" = ${tenantId} AND "payload"->>'outcome' = 'CONSUMED' AND "payload"->>'consumedBySaleKey' = ${saleKey}`;
}

/**
 * ส่วนลดที่อนุมัติแล้วของบิลพักนี้ (ยังไม่ถูกใช้): คำขอ APPROVED · snapshot ยังไม่มี outcome (หรือถูกยึดด้วยคีย์นี้เอง — ส่งซ้ำพร้อมกัน) ·
 * คืน discountBp ที่อนุมัติ + ผู้ตัดสิน · อื่น = null (มติ 5: ใช้แล้ว/ไม่ได้อนุมัติ ⇒ DISCOUNT_EXCEEDS_LIMIT ไม่ยื่นใหม่)
 */
export async function approvedDiscountOf(
  tenantId: string,
  approvedRequestId: string | null,
  saleKey: string,
): Promise<{ requestId: string; discountBp: number; discountSatang: number; cartHash: string; deciderId: string } | null> {
  if (!approvedRequestId) return null;
  const snap = await posApprovalPayload(tenantId, approvedRequestId);
  if (!snap || snap.kind !== "POS_DISCOUNT_OVER") return null;
  const out = payloadOutcome(snap.payload);
  if (out && !(out === "CONSUMED" && snap.payload.consumedBySaleKey === saleKey)) return null;
  if ((await posApprovalStatus(tenantId, approvedRequestId)) !== "APPROVED") return null;
  const bp = snap.payload.discountBp;
  const satang = snap.payload.discountSatang;
  const cartHash = snap.payload.cartHash;
  const deciderId = await posApprovalDecider(tenantId, approvedRequestId);
  if (typeof bp !== "number" || !Number.isInteger(bp) || bp < 0 || !deciderId) return null;
  if (typeof satang !== "number" || !Number.isInteger(satang) || satang < 0 || typeof cartHash !== "string" || !cartHash) return null; // snapshot ก่อน fix รอบ 1 = ใช้ไม่ได้
  return { requestId: approvedRequestId, discountBp: bp, discountSatang: satang, cartHash, deciderId };
}

/** fix รอบ 1 F5: คำขอส่วนลดเกินสิทธิ์ที่ยื่นจาก submit คีย์นี้แล้ว (ส่งซ้ำ = คำขอ/บิลพักเดิม) */
export async function discountRequestBySubmitKey(tenantId: string, submitKey: string): Promise<{ requestId: string; heldCartId: string } | null> {
  const row = await prisma.posApprovalPayload.findFirst({
    where: { tenantId, kind: "POS_DISCOUNT_OVER", payload: { path: ["submitKey"], equals: submitKey } },
    orderBy: [{ createdAt: "asc" }, { requestId: "asc" }],
  });
  const held = row && isRecord(row.payload) && typeof row.payload.heldCartId === "string" ? row.payload.heldCartId : null;
  return row && held ? { requestId: row.requestId, heldCartId: held } : null;
}

/** ยึดส่วนลดที่อนุมัติไว้ให้บิลคีย์นี้ (ครั้งเดียว) — ถูกยึดด้วยคีย์เดียวกันอยู่แล้ว = true (ส่งซ้ำ) */
export async function claimApprovedDiscount(tenantId: string, requestId: string, saleKey: string): Promise<boolean> {
  if (await markPosApprovalOutcome(tenantId, requestId, "CONSUMED", { consumedBySaleKey: saleKey })) return true;
  const snap = await posApprovalPayload(tenantId, requestId);
  return !!snap && payloadOutcome(snap.payload) === "CONSUMED" && snap.payload.consumedBySaleKey === saleKey;
}

// ═══════════ POS P1.15U ▸ อ่านสถานะคำขอสำหรับจอรออนุมัติ 21B (อ่านล้วน · ผูกร้าน+ระบบ+สาขาจาก snapshot) ◂ ═══════════
/**
 * requestId (ของจอนี้) หรือ saleId (คำขอยกเลิก/คืนเงินที่ยังเปิดของบิลนี้) → มุมมองของจอ · ไม่พบ/ร้าน-สาขาอื่น = null ·
 * อ่านแถวสายอนุมัติตรง (ApprovalRequest/Step/Decision · อ่านอย่างเดียว แบบ crm/portal) เพราะ facade ไม่มีตัวอ่าน note/ขั้น
 */
export async function posApprovalView(scope: { tenantId: string; systemId: string; unitId: string }, ref: { requestId?: string | null; saleId?: string | null }): Promise<PosApprovalView | null> {
  let requestId = ref.requestId ?? null;
  for (const kind of ["POS_VOID", "POS_REFUND"] as const) if (!requestId && ref.saleId) requestId = (await openPosRequest(scope.tenantId, kind, ref.saleId))?.requestId ?? null;
  const snap = requestId ? await posApprovalPayload(scope.tenantId, requestId) : null;
  if (!requestId || !snap || snap.payload.unitId !== scope.unitId || snap.payload.systemId !== scope.systemId) return null;
  const req = await prisma.approvalRequest.findFirst({ where: { id: requestId, tenantId: scope.tenantId }, select: { status: true, createdAt: true, policyId: true, currentStepOrder: true, amountSatang: true } });
  if (!req) return null;
  const [step, dec] = await Promise.all([
    prisma.approvalStep.findFirst({ where: { policyId: req.policyId, order: req.currentStepOrder }, select: { approverRole: true, approverUserId: true } }),
    prisma.approvalDecision.findFirst({ where: { requestId, tenantId: scope.tenantId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { decidedById: true, note: true } }),
  ]);
  const ids = [step?.approverUserId, dec?.decidedById].filter((x): x is string => !!x);
  const names = new Map((ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : []).map((u) => [u.id, u.name]));
  const out = payloadOutcome(snap.payload);
  const st = String(req.status);
  const status: PosApprovalWaitStatus =
    st === "PENDING"
      ? Date.now() - req.createdAt.getTime() >= POS_APPROVAL_WAIT_MS ? "EXPIRED" : "PENDING"
      : st === "APPROVED"
        ? out && (out.startsWith("FAILED") || out === "BLOCKED_SELF_APPROVAL") ? "FAILED" : snap.kind === "POS_DISCOUNT_OVER" || out ? "APPROVED" : "PENDING"
        : st === "REJECTED" || st === "CANCELLED" ? st : "FAILED";
  const s = (v: unknown) => (typeof v === "string" && v ? v : null);
  return {
    requestId,
    kind: snap.kind,
    status,
    createdAt: req.createdAt.toISOString(),
    title: s(snap.payload.title),
    reason: s(snap.payload.reason),
    amountSatang: req.amountSatang ?? null,
    approverName: step?.approverUserId ? (names.get(step.approverUserId) ?? null) : null,
    approverRole: step ? String(step.approverRole) : null,
    deciderName: dec ? (names.get(dec.decidedById) ?? null) : null,
    note: dec?.note ?? null,
    outcome: out,
    heldCartId: s(snap.payload.heldCartId),
    saleId: s(snap.payload.saleId),
  };
}

/**
 * ยกเลิกคำขอที่ยัง PENDING (facade cancelRequest) — fix รอบ 1 F7: เฉพาะผู้ขอเอง (actor = คนในโทเคน/ผู้ใช้ session) หรือผู้มี pos.staff.manage ·
 * คำขอของสาขาอื่น/ไม่ใช่ POS/ปิดแล้ว = NOT_FOUND · audit pos.approval.cancel {requestId, saleId, byUserId}
 */
export async function cancelPosApprovalRequest(
  scope: { tenantId: string; systemId: string; unitId: string },
  requestId: string,
  actor: { userId: string; role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown> },
): Promise<"OK" | "NOT_FOUND" | "PERMISSION_DENIED"> {
  const snap = await posApprovalPayload(scope.tenantId, requestId);
  if (!snap || snap.payload.unitId !== scope.unitId || snap.payload.systemId !== scope.systemId) return "NOT_FOUND";
  if (snap.payload.requestedById !== actor.userId && !evaluate(actor, { module: "pos", action: "pos.staff.manage", unitId: scope.unitId })) return "PERMISSION_DENIED";
  if (!(await cancelRequest({ tenantId: scope.tenantId }, requestId))) return "NOT_FOUND";
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  await writeAudit({
    tenantId: scope.tenantId,
    actorId: actor.userId,
    action: "pos.approval.cancel",
    targetType: "ApprovalRequest",
    targetId: requestId,
    after: { requestId, kind: snap.kind, saleId: str(snap.payload.saleId), heldCartId: str(snap.payload.heldCartId), byUserId: actor.userId },
  });
  return "OK";
}


// ═══════════ POS P1.15U ▸ การ์ดคำขอ POS บนหน้าอนุมัติ 21A (อ่านล้วน · ผูกร้าน) ◂ ═══════════
/** ข้อมูลประกอบการ์ดของคำขอ POS (ประกอบตอนแสดง — snapshot เก็บ title · ชื่อคน/เครื่องอ่านสด) */
export type PosApprovalCard = {
  kind: PosApprovalKind;
  title: string | null;
  requesterName: string | null;
  requesterRole: string | null;
  deviceName: string | null;
  reason: string | null;
  /** เพดานของผู้ขอ (bp) ถ้า snapshot มี — ไม่มี = ไม่แสดงชิป "เกินเพดาน" */
  capBp: number | null;
  receiptNo: string | null;
  refundSatang: number | null;
  /** ส่วนลด: bp + สตางค์ · คืนเงิน: บรรทัด "ชื่อ ×จำนวน" */
  discountBp: number | null;
  discountSatang: number | null;
  refundLines: string[];
};
export async function posApprovalCards(tenantId: string, requestIds: string[]): Promise<Map<string, PosApprovalCard>> {
  const out = new Map<string, PosApprovalCard>();
  const ids = [...new Set(requestIds.filter(Boolean))].slice(0, 200);
  if (!ids.length) return out;
  const rows = (await prisma.posApprovalPayload.findMany({ where: { tenantId, requestId: { in: ids } } })).filter((r) => isPosApprovalKind(r.kind) && isRecord(r.payload));
  if (!rows.length) return out;
  const s = (v: unknown) => (typeof v === "string" && v ? v : null);
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const pl = (r: (typeof rows)[number]) => r.payload as Record<string, unknown>;
  const userIds = [...new Set(rows.map((r) => s(pl(r).requestedById)).filter((x): x is string => !!x))];
  const devices = rows.map((r) => ({ unitId: s(pl(r).unitId), code: s(pl(r).deviceId) })).filter((d): d is { unitId: string; code: string } => !!d.unitId && !!d.code);
  const saleIds = [...new Set(rows.map((r) => s(pl(r).saleId)).filter((x): x is string => !!x))];
  const lineIds = rows.flatMap((r) => (Array.isArray(pl(r).lines) ? (pl(r).lines as unknown[]).flatMap((l) => (isRecord(l) && typeof l.lineId === "string" ? [l.lineId] : [])) : []));
  const [users, members, devs, sales, lines] = await Promise.all([
    userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [],
    userIds.length ? prisma.membership.findMany({ where: { tenantId, userId: { in: userIds } }, select: { userId: true, role: true } }) : [],
    devices.length ? prisma.posDevice.findMany({ where: { tenantId, OR: devices.map((d) => ({ unitId: d.unitId, deviceCode: d.code })) }, select: { unitId: true, deviceCode: true, name: true } }) : [],
    saleIds.length ? prisma.posSale.findMany({ where: { tenantId, id: { in: saleIds } }, select: { id: true, receiptNo: true } }) : [],
    lineIds.length ? prisma.posSaleLine.findMany({ where: { tenantId, id: { in: [...new Set(lineIds)] } }, select: { id: true, name: true } }) : [],
  ]);
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  const roleOf = new Map(members.map((m) => [m.userId, String(m.role)]));
  const devOf = new Map(devs.map((d) => [`${d.unitId}|${d.deviceCode}`, d.name]));
  const receiptOf = new Map(sales.map((x) => [x.id, x.receiptNo]));
  const lineOf = new Map(lines.map((l) => [l.id, l.name]));
  for (const r of rows) {
    const p = pl(r);
    const by = s(p.requestedById);
    const sale = s(p.saleId);
    out.set(r.requestId, {
      kind: r.kind as PosApprovalKind,
      title: s(p.title),
      requesterName: by ? (nameOf.get(by) ?? null) : null,
      requesterRole: by ? (roleOf.get(by) ?? null) : null,
      deviceName: s(p.unitId) && s(p.deviceId) ? (devOf.get(`${s(p.unitId)}|${s(p.deviceId)}`) ?? null) : null,
      reason: s(p.reason),
      capBp: n(p.capBp),
      receiptNo: sale ? (receiptOf.get(sale) ?? null) : null,
      refundSatang: n(p.refundSatang),
      discountBp: n(p.discountBp),
      discountSatang: n(p.discountSatang),
      refundLines: Array.isArray(p.lines)
        ? (p.lines as unknown[]).flatMap((l) => (isRecord(l) && typeof l.lineId === "string" ? [`${lineOf.get(l.lineId) ?? "-"} ×${typeof l.qty === "number" ? l.qty : 1}`] : []))
        : [],
    });
  }
  return out;
}

// ข้อเสนอการกระทำของผู้ช่วย AI (Phase 3.5 — WO-0020) — proposal → user ยืนยัน → execute
// วิสัยทัศน์เจ้าของ: user บางคนไม่รู้วิธีใช้ระบบ → ถาม AI แล้วสั่งให้ทำแทน
//   AI "เสนอ" การกระทำ (สร้าง proposal) · user "ตัดสินใจ" (กดยืนยัน/ยกเลิก) · AI "ลงมือแทน" (execute ผ่าน service เดิม)
//
// กฎเหล็ก:
// - execute อ่าน payload จากแถว DB เท่านั้น (id คือ input เดียว) — ห้ามเชื่อ client
// - assertCan สิทธิ์ของ "คนที่กดยืนยัน" ณ ตอน execute (ไม่ใช่ของ AI) ด้วย action string เดียวกับปุ่มจริงใน UI
// - ต้องเรียก service เดิมเท่านั้น (invSvc.receive / hrSvc.decideLeave / mktSvc.createCampaign) — ห้ามแตะ DB ข้าม service เพื่อ mutate
// - AiProposal เป็น tenant-scoped → tenantDb({ tenantId }) inject tenantId ให้ทุก query (กันข้ามร้าน)

import { prisma, tenantDb } from "@/lib/core/db";
import { assertCan, ForbiddenError, type MembershipCtx } from "@/lib/core/rbac";
import type { Prisma, SystemType } from "@prisma/client";
import * as invSvc from "@/lib/modules/inventory/service";
import * as hrSvc from "@/lib/modules/hr/service";
import * as mktSvc from "@/lib/modules/marketing/service";
import * as memberSvc from "@/lib/modules/member/service";
import { createSystem } from "@/lib/modules/system/service";
import { AVAILABLE_FEATURE, systemDef } from "@/lib/systems";

export type ProposalKind =
  | "inventory_receive"
  | "hr_decide_leave"
  | "marketing_create_campaign"
  | "member_create"
  | "open_system";

type Ctx = { tenantId: string };

const TTL_MS = 24 * 60 * 60 * 1000; // 24 ชม.

// action string ต่อ kind — ต้องตรงกับ assertCan ของปุ่มจริงในแต่ละโมดูล (ดู */actions.ts)
const KIND_ACCESS: Record<ProposalKind, { module: string; action: string }> = {
  inventory_receive: { module: "inventory", action: "inventory.movement.receive" },
  hr_decide_leave: { module: "hr", action: "hr.leave.decide" },
  marketing_create_campaign: { module: "marketing", action: "marketing.campaign.create" },
  member_create: { module: "member", action: "member.customer.create" },
  open_system: { module: "system", action: "system.system.create" },
};

// ── payload ต่อ kind (server-side เท่านั้น) ──
type ReceivePayload = { sku: string; qty: number; costSatang?: number };
type DecideLeavePayload = { leaveId: string; decision: "APPROVED" | "REJECTED" };
type CreateCampaignPayload = { name: string; channel: string; segment?: Record<string, unknown> };
type MemberCreatePayload = { name: string; phone?: string; email?: string };
type OpenSystemPayload = { type: string; name?: string };

// ── สร้างข้อเสนอ (PENDING + TTL 24 ชม.) ──
export async function createProposal(
  ctx: Ctx,
  input: { conversationId: string; kind: ProposalKind; summary: string; payload: Record<string, unknown> },
): Promise<{ id: string }> {
  // tenantId ใส่ตรง ๆ ให้ตรง type (guard inject ค่าเดียวกันซ้ำ — convention repo นี้) · status = PENDING (default schema)
  const row = await tenantDb(ctx).aiProposal.create({
    data: {
      tenantId: ctx.tenantId,
      conversationId: input.conversationId,
      kind: input.kind,
      summary: input.summary,
      payload: input.payload as Prisma.InputJsonValue,
      expiresAt: new Date(Date.now() + TTL_MS),
    },
  });
  return { id: row.id };
}

// ── ข้อเสนอที่ยังรออยู่ของบทสนทนา (PENDING + ยังไม่หมดอายุ) เรียงเก่า→ใหม่ ──
export async function listPendingProposals(ctx: Ctx, conversationId: string) {
  return tenantDb(ctx).aiProposal.findMany({
    where: { conversationId, status: "PENDING", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "asc" },
  });
}

// ── ยกเลิกข้อเสนอ — PENDING→REJECTED เท่านั้น (สถานะอื่น/ไม่พบ → false) ──
export async function rejectProposal(ctx: Ctx, id: string): Promise<boolean> {
  const res = await tenantDb(ctx).aiProposal.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "REJECTED" },
  });
  return res.count > 0;
}

// ── ลงมือทำจริง — อ่าน proposal จาก DB, ตรวจสิทธิ์คนกด, เรียก service เดิม ──
export async function executeProposal(
  m: MembershipCtx,
  ctx: Ctx,
  id: string,
): Promise<{ ok: boolean; note: string }> {
  const row = await tenantDb(ctx).aiProposal.findFirst({ where: { id } });
  if (!row) return { ok: false, note: "ไม่พบข้อเสนอนี้ (อาจถูกลบไปแล้ว)" };

  // ทำไปแล้ว/ปิดไปแล้ว (ไม่ใช่ PENDING) → ไม่ทำซ้ำ
  if (row.status !== "PENDING") {
    return { ok: false, note: "รายการนี้ถูกดำเนินการหรือปิดไปแล้ว" };
  }

  // หมดอายุ → ตั้งสถานะ EXPIRED (กันกดของเก่า)
  if (row.expiresAt.getTime() <= Date.now()) {
    await tenantDb(ctx).aiProposal.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "EXPIRED" },
    });
    return { ok: false, note: "ข้อเสนอนี้หมดอายุแล้ว ลองสั่งใหม่อีกครั้งได้เลย" };
  }

  // ตรวจสิทธิ์ของคนที่กดยืนยัน ณ ตอนนี้ — ไม่ผ่าน = คง PENDING (คนมีสิทธิ์มากดทีหลังได้)
  const access = KIND_ACCESS[row.kind as ProposalKind];
  if (!access) return { ok: false, note: "ไม่รู้จักประเภทข้อเสนอนี้" };
  try {
    assertCan(m, access);
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { ok: false, note: "คุณยังไม่มีสิทธิ์ทำรายการนี้ ให้ผู้มีสิทธิ์เป็นผู้กดยืนยัน" };
    }
    throw e;
  }

  // กันแข่งกันกด: claim แบบอะตอมมิก PENDING→EXECUTED ก่อนลงมือ (ผู้ชนะเท่านั้นได้ทำ)
  const claim = await tenantDb(ctx).aiProposal.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "EXECUTED", executedAt: new Date() },
  });
  if (claim.count !== 1) return { ok: false, note: "รายการนี้ถูกดำเนินการหรือปิดไปแล้ว" };

  try {
    const note = await dispatch(ctx.tenantId, row.id, row.kind as ProposalKind, row.payload);
    await tenantDb(ctx).aiProposal.update({ where: { id }, data: { resultNote: note } });
    return { ok: true, note };
  } catch (e) {
    // service โยน → FAILED + เหตุผลไทย (rollback สถานะจาก EXECUTED)
    const note = e instanceof Error && e.message ? e.message : "ทำรายการไม่สำเร็จ";
    await tenantDb(ctx).aiProposal.update({
      where: { id },
      data: { status: "FAILED", executedAt: null, resultNote: note },
    });
    return { ok: false, note };
  }
}

// ── dispatch ตาม kind → service เดิม (คืนข้อความผลลัพธ์ภาษาไทย) ──
async function dispatch(
  tenantId: string,
  proposalId: string,
  kind: ProposalKind,
  rawPayload: unknown,
): Promise<string> {
  const payload = (rawPayload ?? {}) as Record<string, unknown>;

  if (kind === "inventory_receive") {
    const p = payload as ReceivePayload;
    const system = await resolveSystem(tenantId, "INVENTORY");
    if (!system) throw new Error("ยังไม่ได้เปิดระบบคลังสินค้า");
    // resolve item จาก sku (อ่านในขอบเขตระบบเดิม — mutate จริงยังผ่าน invSvc.receive)
    const item = await tenantDb({ tenantId, systemId: system.id }).invItem.findFirst({
      where: { sku: String(p.sku ?? "").trim() },
    });
    if (!item) throw new Error(`ไม่พบสินค้ารหัส ${p.sku} ในคลัง`);
    const qty = Math.max(1, Math.round(Number(p.qty)));
    await invSvc.receive(
      { tenantId, systemId: system.id },
      {
        itemId: item.id,
        qty,
        costSatang: Number.isFinite(Number(p.costSatang)) ? Number(p.costSatang) : item.costSatang,
        idempotencyKey: `ai-${proposalId}`, // execute ซ้ำ = กันโดยธรรมชาติ
        sourceModule: "ai",
        refType: "AiProposal",
        refId: proposalId,
        note: "รับเข้าโดยผู้ช่วย AI",
      },
    );
    return `รับ ${qty} ${item.unitLabel} เข้าคลัง "${item.name}" เรียบร้อยแล้ว`;
  }

  if (kind === "hr_decide_leave") {
    const p = payload as DecideLeavePayload;
    const system = await resolveSystem(tenantId, "HR");
    if (!system) throw new Error("ยังไม่ได้เปิดระบบพนักงาน");
    const decision = p.decision === "REJECTED" ? "REJECTED" : "APPROVED";
    await hrSvc.decideLeave({ tenantId, systemId: system.id }, String(p.leaveId ?? ""), decision, null);
    return decision === "APPROVED" ? "อนุมัติใบลาเรียบร้อยแล้ว" : "ไม่อนุมัติใบลาเรียบร้อยแล้ว";
  }

  if (kind === "marketing_create_campaign") {
    const p = payload as CreateCampaignPayload;
    // เปิดระบบการตลาดให้อัตโนมัติถ้ายังไม่มี (แคมเปญ system-scoped ต้องมีระบบก่อน)
    const system =
      (await resolveSystem(tenantId, "MARKETING")) ?? (await createSystem(tenantId, "MARKETING", "การตลาด"));
    const member = await resolveSystem(tenantId, "MEMBER");
    await mktSvc.createCampaign(
      { tenantId, systemId: system.id },
      {
        name: String(p.name ?? "").trim() || "แคมเปญใหม่",
        channel: String(p.channel ?? "LINE"),
        message: "",
        segment: (p.segment ?? {}) as Record<string, unknown>,
        memberSystemId: member?.id ?? "", // DRAFT — ยังไม่ส่ง จึงยังไม่ต้องผูกสมาชิก
      },
    );
    return `สร้างแคมเปญ "${p.name}" เป็นฉบับร่างแล้ว — ตรวจแล้วกดส่งเองในระบบการตลาด`;
  }

  if (kind === "member_create") {
    const p = payload as MemberCreatePayload;
    const system = await resolveSystem(tenantId, "MEMBER");
    if (!system) throw new Error("ยังไม่ได้เปิดระบบสมาชิก");
    // สมัครสมาชิกผ่าน service เดิม (dedup by phone→email) · source STAFF = พนักงานสมัครให้
    const c = await memberSvc.findOrCreate({
      tenantId,
      memberSystemId: system.id,
      name: String(p.name ?? "").trim() || undefined,
      phone: p.phone ? String(p.phone).trim() : undefined,
      email: p.email ? String(p.email).trim() : undefined,
      source: "STAFF",
    });
    const who = c.name ?? (String(p.name ?? "").trim() || "ลูกค้า");
    return `สมัครสมาชิกให้ "${who}" เรียบร้อยแล้ว${c.memberCode ? ` (รหัสสมาชิก ${c.memberCode})` : ""}`;
  }

  if (kind === "open_system") {
    const p = payload as OpenSystemPayload;
    const type = String(p.type ?? "").trim().toUpperCase();
    const def = systemDef(type);
    // validate กับทะเบียน systems.ts — ต้องเป็น feature ที่เปิดให้ใช้งาน
    if (!def || !AVAILABLE_FEATURE.has(type as SystemType)) throw new Error("ไม่รู้จักระบบที่จะเปิด");
    // มีระบบประเภทนี้อยู่แล้ว → ไม่เปิดซ้ำ (→ FAILED)
    const existing = await resolveSystem(tenantId, type as SystemType);
    if (existing) throw new Error(`ระบบ${def.label}เปิดอยู่แล้ว`);
    const name = String(p.name ?? "").trim() || def.label;
    await createSystem(tenantId, type as SystemType, name);
    return `เปิดระบบ${def.label}ให้ร้านเรียบร้อยแล้ว`;
  }

  throw new Error("ไม่รู้จักประเภทข้อเสนอนี้");
}

// resolve ระบบของ tenant ตามประเภท (null = ยังไม่เปิด) — AppSystem เป็น tenant-scoped
async function resolveSystem(tenantId: string, type: SystemType): Promise<{ id: string } | null> {
  return prisma.appSystem.findFirst({
    where: { tenantId, type },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
}

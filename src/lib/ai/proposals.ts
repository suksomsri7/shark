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
import type { Prisma, SystemType, UnitType, PosPayType } from "@prisma/client";
import * as invSvc from "@/lib/modules/inventory/service";
import * as hrSvc from "@/lib/modules/hr/service";
import * as mktSvc from "@/lib/modules/marketing/service";
import * as memberSvc from "@/lib/modules/member/service";
import * as couponSvc from "@/lib/modules/coupon/service";
import * as kanbanSvc from "@/lib/modules/kanban/service";
import * as posSvc from "@/lib/modules/pos/service";
import * as bookingSvc from "@/lib/modules/booking/service";
import * as hotelSvc from "@/lib/modules/hotel/service";
import * as queueSvc from "@/lib/modules/queue/service";
import * as shopSvc from "@/lib/modules/shop/service";
import * as accountFacade from "@/lib/modules/account";
import { createSystem } from "@/lib/modules/system/service";
import { AVAILABLE_FEATURE, systemDef } from "@/lib/systems";

export type ProposalKind =
  | "inventory_receive"
  | "hr_decide_leave"
  | "marketing_create_campaign"
  | "member_create"
  | "open_system"
  | "inventory_create_item"
  | "inventory_adjust"
  | "hr_create_employee"
  | "coupon_create"
  | "kanban_create_card"
  | "kanban_create_board"
  | "record_expense"
  // ── Phase B1: ทำแทนโมดูลเงินเดิน (proposal NORMAL ทั้งหมด) ──
  | "pos_create_sale"
  | "booking_create_appointment"
  | "hotel_create_reservation"
  | "queue_issue_ticket"
  | "shop_confirm_order"
  // ── destructive (ลบ/void/ยกเลิก — ต้องยืนยัน 2 ชั้น) ──
  | "void_sale"
  | "cancel_appointment"
  | "cancel_reservation"
  | "kanban_archive_card";

type Ctx = { tenantId: string };

const TTL_MS = 24 * 60 * 60 * 1000; // 24 ชม.

// kind ที่ "ลบข้อมูล/ยกเลิกถาวร" → risk=DESTRUCTIVE (ยืนยัน 2 ชั้นก่อนทำจริง)
const DESTRUCTIVE_KINDS = new Set<ProposalKind>([
  "void_sale",
  "cancel_appointment",
  "cancel_reservation",
  "kanban_archive_card",
]);

// action string ต่อ kind — ต้องตรงกับ assertCan ของปุ่มจริงในแต่ละโมดูล (ดู */actions.ts)
const KIND_ACCESS: Record<ProposalKind, { module: string; action: string }> = {
  inventory_receive: { module: "inventory", action: "inventory.movement.receive" },
  hr_decide_leave: { module: "hr", action: "hr.leave.decide" },
  marketing_create_campaign: { module: "marketing", action: "marketing.campaign.create" },
  member_create: { module: "member", action: "member.customer.create" },
  open_system: { module: "system", action: "system.system.create" },
  inventory_create_item: { module: "inventory", action: "inventory.item.create" },
  inventory_adjust: { module: "inventory", action: "inventory.movement.adjust" },
  hr_create_employee: { module: "hr", action: "hr.employee.create" },
  coupon_create: { module: "coupon", action: "coupon.coupon.create" },
  kanban_create_card: { module: "kanban", action: "kanban.card.create" },
  kanban_create_board: { module: "kanban", action: "kanban.board.create" },
  // บันทึกค่าใช้จ่ายเข้าบัญชี → ใช้ action จริงของโมดูลบัญชี (สร้างเอกสาร) = account.doc.create
  record_expense: { module: "account", action: "account.doc.create" },
  // Phase B1 — action string ตรงกับปุ่มจริง (ดู */actions.ts)
  pos_create_sale: { module: "pos", action: "pos.sale.create" },
  booking_create_appointment: { module: "booking", action: "booking.appointment.create" },
  hotel_create_reservation: { module: "hotel", action: "hotel.reservation.create" },
  queue_issue_ticket: { module: "queue", action: "queue.ticket.issue" },
  shop_confirm_order: { module: "shop", action: "shop.order.confirm" },
  // destructive — action string ตรงกับปุ่มจริงในแต่ละโมดูล (ดู */actions.ts)
  void_sale: { module: "pos", action: "pos.sale.void" },
  cancel_appointment: { module: "booking", action: "booking.appointment.setStatus" },
  cancel_reservation: { module: "hotel", action: "hotel.reservation.cancel" },
  kanban_archive_card: { module: "kanban", action: "kanban.card.delete" },
};

// ── payload ต่อ kind (server-side เท่านั้น) ──
type ReceivePayload = { sku: string; qty: number; costSatang?: number };
type DecideLeavePayload = { leaveId: string; decision: "APPROVED" | "REJECTED" };
type CreateCampaignPayload = { name: string; channel: string; segment?: Record<string, unknown> };
type MemberCreatePayload = { name: string; phone?: string; email?: string };
type OpenSystemPayload = { type: string; name?: string };
type CreateItemPayload = { sku: string; name: string; reorderPoint?: number; costSatang?: number };
type AdjustPayload = { sku: string; newQty: number; note?: string };
type CreateEmployeePayload = { name: string; position?: string; phone?: string };
type CouponCreatePayload = {
  code: string;
  type: "PERCENT" | "FIXED";
  percent?: number;
  valueSatang?: number;
  usageLimit?: number;
};
type KanbanCreateCardPayload = { title: string; detail?: string; boardName?: string };
type KanbanCreateBoardPayload = { name: string; description?: string };
type RecordExpensePayload = { vendor?: string; note: string; amountSatang: number; date?: string };
type PosCreateSalePayload = {
  unitName?: string;
  lines: { name: string; qty: number; unitPriceSatang: number }[];
  payType: "CASH" | "TRANSFER" | "PROMPTPAY";
};
type BookingCreateApptPayload = {
  unitName?: string;
  serviceName: string;
  staffName?: string;
  dateStr: string;
  startMin: number;
  customerName: string;
  customerPhone: string;
};
type HotelCreateReservationPayload = {
  unitName?: string;
  roomTypeName: string;
  guestName: string;
  guestPhone?: string;
  checkInDate: string;
  checkOutDate: string;
};
type QueueIssueTicketPayload = { unitName?: string; typeName?: string; customerName?: string };
type ShopConfirmOrderPayload = { orderCode: string };
type VoidSalePayload = { saleId: string };
type CancelAppointmentPayload = { appointmentId: string };
type CancelReservationPayload = { reservationId: string; reason?: string };
type KanbanArchiveCardPayload = { cardId: string };

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
      // ลบ/void/ยกเลิก → DESTRUCTIVE (ยืนยัน 2 ชั้น) · อื่น ๆ NORMAL (ชั้นเดียว เหมือนเดิม)
      risk: DESTRUCTIVE_KINDS.has(input.kind) ? "DESTRUCTIVE" : "NORMAL",
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
  opts?: { confirm2x?: boolean },
): Promise<{ ok: boolean; note: string; needsSecondConfirm?: boolean }> {
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

  // ── ยืนยัน 2 ชั้น สำหรับรายการลบ/ยกเลิกถาวร (DESTRUCTIVE) ──
  // ชั้นแรก (ไม่มี confirm2x) → คง PENDING ไม่ทำจริง แจ้ง UI ให้ถามยืนยันอีกครั้ง
  if (row.risk === "DESTRUCTIVE" && !opts?.confirm2x) {
    return {
      ok: false,
      note: "ต้องยืนยันอีกครั้งเพื่อดำเนินการที่ลบข้อมูลถาวร",
      needsSecondConfirm: true,
    };
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

  if (kind === "inventory_create_item") {
    const p = payload as CreateItemPayload;
    const system = await resolveSystem(tenantId, "INVENTORY");
    if (!system) throw new Error("ยังไม่ได้เปิดระบบคลังสินค้า");
    const sku = String(p.sku ?? "").trim();
    const name = String(p.name ?? "").trim();
    if (!sku || !name) throw new Error("ต้องระบุรหัสสินค้าและชื่อสินค้า");
    // กัน sku ซ้ำ (อ่านในขอบเขตระบบเดิม) — ซ้ำ = FAILED ไทย
    const dup = await tenantDb({ tenantId, systemId: system.id }).invItem.findFirst({ where: { sku } });
    if (dup) throw new Error(`มีสินค้ารหัส ${sku} อยู่แล้วในคลัง`);
    await invSvc.createItem(
      { tenantId, systemId: system.id },
      {
        sku,
        name,
        reorderPoint: Number.isFinite(Number(p.reorderPoint)) ? Number(p.reorderPoint) : null,
        costSatang: Number.isFinite(Number(p.costSatang)) ? Number(p.costSatang) : null,
      },
    );
    return `เพิ่มสินค้า "${name}" (รหัส ${sku}) เข้าคลังเรียบร้อยแล้ว`;
  }

  if (kind === "inventory_adjust") {
    const p = payload as AdjustPayload;
    const system = await resolveSystem(tenantId, "INVENTORY");
    if (!system) throw new Error("ยังไม่ได้เปิดระบบคลังสินค้า");
    const sku = String(p.sku ?? "").trim();
    const item = await tenantDb({ tenantId, systemId: system.id }).invItem.findFirst({ where: { sku } });
    if (!item) throw new Error(`ไม่พบสินค้ารหัส ${sku} ในคลัง`);
    const newQty = Math.round(Number(p.newQty));
    if (!Number.isFinite(newQty)) throw new Error("ยอดคงเหลือใหม่ไม่ถูกต้อง");
    await invSvc.adjust(
      { tenantId, systemId: system.id },
      {
        itemId: item.id,
        newQty,
        idempotencyKey: `ai-${proposalId}`, // execute ซ้ำ = กันโดยธรรมชาติ
        note: p.note ? String(p.note).trim() : "ปรับสต็อกโดยผู้ช่วย AI",
      },
    );
    return `ปรับสต็อก "${item.name}" เป็น ${newQty} ${item.unitLabel} เรียบร้อยแล้ว`;
  }

  if (kind === "hr_create_employee") {
    const p = payload as CreateEmployeePayload;
    const system = await resolveSystem(tenantId, "HR");
    if (!system) throw new Error("ยังไม่ได้เปิดระบบพนักงาน");
    const name = String(p.name ?? "").trim();
    if (!name) throw new Error("ต้องระบุชื่อพนักงาน");
    await hrSvc.createEmployee(
      { tenantId, systemId: system.id },
      {
        name,
        position: p.position ? String(p.position).trim() : null,
        phone: p.phone ? String(p.phone).trim() : null,
      },
    );
    return `เพิ่มพนักงาน "${name}" เข้าระบบเรียบร้อยแล้ว`;
  }

  if (kind === "coupon_create") {
    const p = payload as CouponCreatePayload;
    const system = await resolveSystem(tenantId, "COUPON");
    if (!system) throw new Error("ยังไม่ได้เปิดระบบคูปอง");
    const code = String(p.code ?? "").trim();
    const type = p.type === "FIXED" ? "FIXED" : "PERCENT";
    // service คืน { ok:false, reason } เมื่อโค้ดซ้ำ/ค่าผิด → โยน Error(reason) ให้กลไก FAILED เดิมจัดการ
    const res = await couponSvc.createCoupon({
      tenantId,
      systemId: system.id,
      code,
      name: code, // ผู้ช่วยไม่ถามชื่อคูปอง — ใช้โค้ดเป็นชื่อ
      type,
      percent: type === "PERCENT" && Number.isFinite(Number(p.percent)) ? Number(p.percent) : null,
      valueSatang: type === "FIXED" && Number.isFinite(Number(p.valueSatang)) ? Number(p.valueSatang) : null,
      usageLimit: Number.isFinite(Number(p.usageLimit)) ? Number(p.usageLimit) : null,
    });
    if (!res.ok) throw new Error(res.reason);
    return `สร้างคูปอง "${code}" เรียบร้อยแล้ว`;
  }

  if (kind === "kanban_create_board") {
    const p = payload as KanbanCreateBoardPayload;
    const system = await resolveSystem(tenantId, "KANBAN");
    if (!system) throw new Error("ยังไม่ได้เปิดระบบบอร์ดงาน (Kanban)");
    const name = String(p.name ?? "").trim();
    if (!name) throw new Error("ต้องระบุชื่อบอร์ด");
    const board = await kanbanSvc.createBoard({
      tenantId,
      systemId: system.id,
      name,
      description: p.description ? String(p.description).trim() : null,
    });
    return `สร้างบอร์ด "${board.name}" เรียบร้อยแล้ว (มีคอลัมน์เริ่มต้นให้พร้อมใช้งาน)`;
  }

  if (kind === "kanban_create_card") {
    const p = payload as KanbanCreateCardPayload;
    const system = await resolveSystem(tenantId, "KANBAN");
    if (!system) throw new Error("ยังไม่มีบอร์ด");
    const title = String(p.title ?? "").trim();
    if (!title) throw new Error("ต้องระบุหัวข้อการ์ด");
    // หาบอร์ด: ชื่อตรง (boardName) หรือบอร์ดแรกถ้าไม่ระบุ
    const boards = await kanbanSvc.listBoards(tenantId, system.id);
    const wanted = String(p.boardName ?? "").trim();
    const board = wanted ? boards.find((b) => b.name.trim() === wanted) : boards[0];
    if (!board) throw new Error(wanted ? `ไม่พบบอร์ดชื่อ "${wanted}"` : "ยังไม่มีบอร์ด");
    // คอลัมน์แรกของบอร์ด (โหลดเต็มเพื่อได้คอลัมน์ active เรียงซ้าย→ขวา)
    const full = await kanbanSvc.getBoard(tenantId, system.id, board.id);
    const column = full?.columns[0];
    if (!column) throw new Error(`บอร์ด "${board.name}" ยังไม่มีคอลัมน์`);
    const card = await kanbanSvc.createCard({
      tenantId,
      systemId: system.id,
      columnId: column.id,
      title,
      description: p.detail ? String(p.detail).trim() : null,
    });
    if (!card) throw new Error("สร้างการ์ดไม่สำเร็จ");
    return `เพิ่มการ์ด "${title}" ลงบอร์ด "${board.name}" เรียบร้อยแล้ว`;
  }

  if (kind === "record_expense") {
    const p = payload as RecordExpensePayload;
    const system = await resolveSystem(tenantId, "ACCOUNT");
    if (!system) throw new Error("ยังไม่ได้เปิดระบบบัญชี");
    const amountSatang = Math.round(Number(p.amountSatang));
    if (!Number.isFinite(amountSatang) || amountSatang <= 0) throw new Error("ยอดเงินไม่ถูกต้อง");
    const note = String(p.note ?? "").trim() || "ค่าใช้จ่าย";
    const vendor = p.vendor ? String(p.vendor).trim() : "";
    // ผ่าน facade account/index เท่านั้น (สร้างเอกสาร EXPENSE เป็น DRAFT — ไม่แตะเลขบัญชี/gl ตรง)
    await accountFacade.createExpenseDoc({
      tenantId,
      systemId: system.id,
      vendor: vendor || null,
      note,
      amountSatang,
      date: p.date ? String(p.date) : undefined,
    });
    const baht = (amountSatang / 100).toLocaleString("th-TH");
    return `บันทึกค่าใช้จ่าย${vendor ? ` "${vendor}"` : ""} ${baht} บาท เข้าบัญชีเป็นฉบับร่างแล้ว — ตรวจแล้วออกเอกสารในระบบบัญชีได้เลย`;
  }

  if (kind === "pos_create_sale") {
    const p = payload as PosCreateSalePayload;
    const system = await resolveSystem(tenantId, "POS");
    if (!system) throw new Error("ยังไม่ได้เปิดระบบขายหน้าร้าน (POS)");
    // resolve unit ที่ผูก POS ได้ (ทุก type) — หน่วยเดียวใช้เลย · หลายหน่วยไม่ระบุ = throw ไทย + รายชื่อ
    const unit = await resolveUnit(tenantId, { unitName: p.unitName, label: "จุดขาย" });
    const lines = (Array.isArray(p.lines) ? p.lines : []).map((l) => ({
      name: String(l?.name ?? "").trim() || "รายการ",
      qty: Math.round(Number(l?.qty)),
      unitPriceSatang: Math.round(Number(l?.unitPriceSatang)),
    }));
    if (lines.length === 0) throw new Error("ไม่มีรายการสินค้าในบิล");
    for (const l of lines) {
      if (!Number.isFinite(l.qty) || l.qty <= 0) throw new Error(`จำนวนของ "${l.name}" ต้องมากกว่า 0`);
      if (!Number.isFinite(l.unitPriceSatang) || l.unitPriceSatang < 0) throw new Error(`ราคาของ "${l.name}" ติดลบไม่ได้`);
    }
    const grand = lines.reduce((s, l) => s + l.unitPriceSatang * l.qty, 0);
    let payType: PosPayType = "CASH";
    if (p.payType === "TRANSFER") payType = "TRANSFER";
    else if (p.payType === "PROMPTPAY") payType = "PROMPTPAY";
    await posSvc.createSale({
      tenantId,
      unitId: unit.id,
      systemId: system.id,
      sourceModule: "AI",
      sourceId: proposalId,
      idempotencyKey: `ai-${proposalId}`, // execute ซ้ำ = กันโดยธรรมชาติ
      lines,
      payMethods: [{ type: payType, amountSatang: grand }],
    });
    const baht = (grand / 100).toLocaleString("th-TH");
    return `เปิดบิลขาย ${baht} บาท ที่ "${unit.name}" เรียบร้อยแล้ว`;
  }

  if (kind === "booking_create_appointment") {
    const p = payload as BookingCreateApptPayload;
    const unit = await resolveUnit(tenantId, { type: "BOOKING", unitName: p.unitName, label: "ร้านรับจองนัด" });
    const wantSvc = String(p.serviceName ?? "").trim();
    const services = await prisma.bookingService.findMany({
      where: { tenantId, unitId: unit.id, active: true },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    });
    const service = services.find((s) => s.name.includes(wantSvc)) ?? (wantSvc ? undefined : services[0]);
    if (!service) {
      const list = services.map((s) => s.name).join(", ") || "ยังไม่มีบริการ";
      throw new Error(`ไม่พบบริการ "${wantSvc}" — บริการที่มี: ${list}`);
    }
    const wantStaff = String(p.staffName ?? "").trim();
    const staffs = await prisma.bookingStaff.findMany({
      where: { tenantId, unitId: unit.id, active: true },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    });
    const staff = wantStaff ? staffs.find((s) => s.name.includes(wantStaff)) : staffs[0];
    if (!staff) throw new Error(wantStaff ? `ไม่พบช่างชื่อ "${wantStaff}"` : "ยังไม่มีช่างที่พร้อมรับงาน");
    const res = await bookingSvc.createAppointment({
      tenantId,
      unitId: unit.id,
      serviceId: service.id,
      staffId: staff.id,
      dateStr: String(p.dateStr ?? ""),
      startMin: Math.round(Number(p.startMin)),
      customerName: String(p.customerName ?? "").trim() || "ลูกค้า",
      customerPhone: String(p.customerPhone ?? "").trim(),
      source: "STAFF",
    });
    if (!res.ok) throw new Error(res.reason);
    return `จองนัด "${service.name}" ให้ ${String(p.customerName ?? "").trim() || "ลูกค้า"} กับ ${staff.name} เรียบร้อยแล้ว`;
  }

  if (kind === "hotel_create_reservation") {
    const p = payload as HotelCreateReservationPayload;
    const unit = await resolveUnit(tenantId, { type: "HOTEL", unitName: p.unitName, label: "โรงแรม/ที่พัก" });
    const wantRt = String(p.roomTypeName ?? "").trim();
    const roomTypes = await prisma.hotelRoomType.findMany({
      where: { tenantId, unitId: unit.id, active: true },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    });
    const rt = roomTypes.find((r) => r.name.includes(wantRt)) ?? (wantRt ? undefined : roomTypes[0]);
    if (!rt) {
      const list = roomTypes.map((r) => r.name).join(", ") || "ยังไม่มีประเภทห้อง";
      throw new Error(`ไม่พบประเภทห้อง "${wantRt}" — ประเภทห้องที่มี: ${list}`);
    }
    // ห้าม auto-เปิดห้องแทนร้าน (จองทั้งที่ไม่มีห้องจริง = จองผี) — บอกให้ตั้งห้องก่อน
    const roomCount = await prisma.hotelRoom.count({
      where: { tenantId, unitId: unit.id, roomTypeId: rt.id, active: true },
    });
    if (roomCount === 0) {
      throw new Error(`ประเภทห้อง "${rt.name}" ยังไม่มีห้องจริงในระบบ — เพิ่มห้องในเมนูที่พักก่อน แล้วค่อยจอง`);
    }
    const res = await hotelSvc.createReservation({
      tenantId,
      unitId: unit.id,
      roomTypeId: rt.id,
      guestName: String(p.guestName ?? "").trim() || "ผู้เข้าพัก",
      guestPhone: p.guestPhone ? String(p.guestPhone).trim() : undefined,
      checkInDate: String(p.checkInDate ?? ""),
      checkOutDate: String(p.checkOutDate ?? ""),
    });
    if (!res.ok) throw new Error(res.reason);
    return `จองห้อง "${rt.name}" ให้ ${String(p.guestName ?? "").trim() || "ผู้เข้าพัก"} เรียบร้อยแล้ว (รหัสจอง ${res.code})`;
  }

  if (kind === "queue_issue_ticket") {
    const p = payload as QueueIssueTicketPayload;
    const unit = await resolveUnit(tenantId, { type: "QUEUE", unitName: p.unitName, label: "จุดออกบัตรคิว" });
    const wantType = String(p.typeName ?? "").trim();
    const types = await prisma.queueType.findMany({
      where: { tenantId, unitId: unit.id, status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { priority: "desc" },
    });
    const qType = wantType ? types.find((t) => t.name.includes(wantType)) : types[0];
    if (!qType) {
      const list = types.map((t) => t.name).join(", ") || "ยังไม่มีประเภทคิว";
      throw new Error(wantType ? `ไม่พบประเภทคิว "${wantType}" — ที่มี: ${list}` : "ยังไม่มีประเภทคิวในจุดนี้");
    }
    const customerName = String(p.customerName ?? "").trim();
    const res = await queueSvc.issueTicket({
      tenantId,
      unitId: unit.id,
      typeId: qType.id,
      channel: "STAFF",
      contact: customerName ? { name: customerName } : undefined,
      actorType: "STAFF",
    });
    if (!res.ok) throw new Error(res.reason);
    return `ออกบัตรคิว ${res.ticket.number} (${qType.name})${customerName ? ` ให้ ${customerName}` : ""} เรียบร้อยแล้ว`;
  }

  if (kind === "shop_confirm_order") {
    const p = payload as ShopConfirmOrderPayload;
    const code = String(p.orderCode ?? "").trim();
    if (!code) throw new Error("ต้องระบุรหัสออเดอร์");
    // หาออเดอร์จาก code ทุก unit ของ tenant (code รันต่อ unit) — mutate จริงผ่าน shopSvc.confirmOrderPaid
    const order = await prisma.shopOrder.findFirst({
      where: { tenantId, code },
      select: { id: true, unitId: true, status: true },
    });
    if (!order) throw new Error(`ไม่พบออเดอร์รหัส ${code}`);
    if (order.status !== "PENDING_PAYMENT") throw new Error(`ออเดอร์ ${code} ไม่ได้อยู่ในสถานะรอชำระ (สถานะปัจจุบัน: ${order.status})`);
    const res = await shopSvc.confirmOrderPaid({ tenantId, unitId: order.unitId }, order.id);
    if (!res.ok) throw new Error(`ยืนยันรับเงินออเดอร์ ${code} ไม่สำเร็จ`);
    return `ยืนยันรับเงินออเดอร์ ${code} เรียบร้อยแล้ว — บันทึกเป็นยอดขายให้อัตโนมัติ`;
  }

  if (kind === "void_sale") {
    const p = payload as VoidSalePayload;
    const saleId = String(p.saleId ?? "").trim();
    if (!saleId) throw new Error("ต้องระบุรหัสบิลที่จะยกเลิก");
    // อ่าน unitId ของบิล (mutate จริงผ่าน posSvc.voidSale เท่านั้น) — ไม่พบ = FAILED ไทย
    const sale = await prisma.posSale.findFirst({ where: { tenantId, id: saleId }, select: { unitId: true } });
    if (!sale) throw new Error("ไม่พบบิลนี้");
    await posSvc.voidSale(tenantId, sale.unitId, saleId);
    return "ยกเลิก (void) บิลเรียบร้อยแล้ว";
  }

  if (kind === "cancel_appointment") {
    const p = payload as CancelAppointmentPayload;
    const appointmentId = String(p.appointmentId ?? "").trim();
    if (!appointmentId) throw new Error("ต้องระบุรหัสนัดหมายที่จะยกเลิก");
    const appt = await prisma.appointment.findFirst({
      where: { tenantId, id: appointmentId },
      select: { unitId: true },
    });
    if (!appt) throw new Error("ไม่พบนัดหมายนี้");
    await bookingSvc.setAppointmentStatus(tenantId, appt.unitId, appointmentId, "CANCELLED");
    return "ยกเลิกนัดหมายเรียบร้อยแล้ว";
  }

  if (kind === "cancel_reservation") {
    const p = payload as CancelReservationPayload;
    const reservationId = String(p.reservationId ?? "").trim();
    if (!reservationId) throw new Error("ต้องระบุรหัสการจองที่จะยกเลิก");
    const rsv = await prisma.hotelReservation.findFirst({
      where: { tenantId, id: reservationId },
      select: { unitId: true },
    });
    if (!rsv) throw new Error("ไม่พบการจองนี้");
    const res = await hotelSvc.cancelReservation(
      tenantId,
      rsv.unitId,
      reservationId,
      p.reason ? String(p.reason).trim() : undefined,
    );
    if (!res.ok) throw new Error(res.reason);
    return "ยกเลิกการจองห้องพักเรียบร้อยแล้ว";
  }

  if (kind === "kanban_archive_card") {
    const p = payload as KanbanArchiveCardPayload;
    const system = await resolveSystem(tenantId, "KANBAN");
    if (!system) throw new Error("ยังไม่ได้เปิดระบบบอร์ดงาน (Kanban)");
    const cardId = String(p.cardId ?? "").trim();
    if (!cardId) throw new Error("ต้องระบุการ์ดที่จะลบ");
    // ชื่อการ์ดสำหรับข้อความผล (best-effort) — mutate จริงผ่าน kanbanSvc.archiveCard
    const card = await tenantDb({ tenantId, systemId: system.id }).kanbanCard.findFirst({
      where: { id: cardId },
      select: { title: true },
    });
    await kanbanSvc.archiveCard(tenantId, system.id, cardId);
    return `ลบการ์ด${card?.title ? ` "${card.title}"` : ""} เรียบร้อยแล้ว`;
  }

  throw new Error("ไม่รู้จักประเภทข้อเสนอนี้");
}

// resolve หน่วยธุรกิจ (BusinessUnit) ที่จะทำรายการ — Phase B1
// - type ไม่ระบุ = ทุกประเภท (เช่น POS ผูกกับหน่วยประเภทไหนก็ได้) · ระบุ = กรองเฉพาะประเภทนั้น
// - ระบุ unitName → match ชื่อบางส่วน (contains) หรือชื่อตรง · ไม่เจอ = throw ไทย + รายชื่อที่มี
// - ไม่ระบุ unitName และมีหน่วยเดียว → ใช้เลย · หลายหน่วย → throw ไทยชวนระบุ + รายชื่อ (LLM เอาไป ask_clarify ต่อ)
async function resolveUnit(
  tenantId: string,
  opts: { type?: UnitType; unitName?: string; label: string },
): Promise<{ id: string; name: string }> {
  const units = await prisma.businessUnit.findMany({
    where: { tenantId, status: "ACTIVE", ...(opts.type ? { type: opts.type } : {}) },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  if (units.length === 0) throw new Error(`ยังไม่มี${opts.label}ในร้าน`);
  const wanted = String(opts.unitName ?? "").trim();
  if (wanted) {
    const hit = units.find((u) => u.name.includes(wanted)) ?? units.find((u) => u.name.trim() === wanted);
    if (!hit) throw new Error(`ไม่พบ${opts.label} "${wanted}" — ที่มี: ${units.map((u) => u.name).join(", ")}`);
    return hit;
  }
  if (units.length === 1) return units[0];
  throw new Error(`มีหลายสาขา กรุณาระบุ${opts.label} — ที่มี: ${units.map((u) => u.name).join(", ")}`);
}

// resolve ระบบของ tenant ตามประเภท (null = ยังไม่เปิด) — AppSystem เป็น tenant-scoped
async function resolveSystem(tenantId: string, type: SystemType): Promise<{ id: string } | null> {
  return prisma.appSystem.findFirst({
    where: { tenantId, type },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
}

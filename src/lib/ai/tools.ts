// เครื่องมือของผู้ช่วย AI
// - read-only 5 ตัว (Phase 3 v1 — WO-0018): ผู้ช่วย "ดู" ข้อมูลจริงของร้าน (ยอดขาย/สต็อก/สมาชิก/ใบลา/ระบบ)
// - action 3 ตัว (Phase 3.5 — WO-0020): "เสนอ" การกระทำให้ user ยืนยัน (สร้าง proposal ไม่ execute ทันที)
//
// กติกา:
// - ทุก tool คืน JSON string ภาษาไทยอ่านรู้เรื่อง — LLM เอาไปเรียบเรียงตอบต่อ
// - runTool กันพังทุกทาง: tool ไม่รู้จัก / args เพี้ยน / DB error → คืน JSON {"error":"..."} ห้าม throw
// - model แบบ system-scoped (Customer/InvItem/HrLeave/PosSale) ต้องหา AppSystem ประเภทนั้นก่อน
//   แล้วเปิด tenantDb({ tenantId, systemId }) ให้ guard inject ตัวกรองให้ (ดู pattern marketing/service.ts)
// - action tool ต้องมี conversationId (proposal ผูกบทสนทนา) — ไม่มี → คืน error JSON

import { tenantDb } from "@/lib/core/db";
import type { SystemType } from "@prisma/client";
import { lowStock as invLowStock } from "@/lib/modules/inventory/service";
import { pendingLeaves as hrPendingLeaves } from "@/lib/modules/hr/service";
import { listCustomers as memberListCustomers } from "@/lib/modules/member/service";
import { createProposal, type ProposalKind } from "./proposals";
import { dayKeyBangkok } from "./rules";

export type ToolCtx = { tenantId: string; conversationId?: string };

export type AiTool = {
  def: { name: string; description: string; parameters: object };
  /** action = mutation ผ่าน proposal (ต้องมี conversationId) · undefined = read-only */
  action?: boolean;
  execute(ctx: ToolCtx, args: unknown): Promise<string>;
};

// สคีมาว่าง (ไม่รับอาร์กิวเมนต์) — ใช้ซ้ำหลาย tool
const NO_ARGS = { type: "object", properties: {}, additionalProperties: false } as const;

const asRecord = (args: unknown): Record<string, unknown> =>
  args && typeof args === "object" ? (args as Record<string, unknown>) : {};

// หา system instance ของประเภทที่ต้องการ (tenant-scoped) — null = ยังไม่ได้เปิดระบบนั้น
async function findSystem(tenantId: string, type: SystemType): Promise<{ id: string } | null> {
  return tenantDb({ tenantId }).appSystem.findFirst({
    where: { type },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
}

// วันที่แบบปลอดภัย — Invalid Date → null (กัน toISOString throw)
const safeDate = (d: Date | null | undefined): string | null => {
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};

// ── 1) list_systems — ระบบที่ร้านเปิดใช้อยู่ ──
const listSystems: AiTool = {
  def: {
    name: "list_systems",
    description: "ดูรายชื่อระบบที่กิจการนี้เปิดใช้อยู่ (เช่น สมาชิก คลังสินค้า พนักงาน ขายหน้าร้าน)",
    parameters: NO_ARGS,
  },
  async execute(ctx) {
    const systems = await tenantDb({ tenantId: ctx.tenantId }).appSystem.findMany({
      select: { type: true, name: true },
      orderBy: { createdAt: "asc" },
    });
    return JSON.stringify({
      ระบบที่เปิดใช้: systems.map((s) => ({ ชื่อ: s.name, ประเภท: s.type })),
    });
  },
};

// ── 2) sales_summary — สรุปยอดขาย N วันล่าสุด (POS) ──
const salesSummary: AiTool = {
  def: {
    name: "sales_summary",
    description: "สรุปยอดขายหน้าร้าน (POS) ในช่วงกี่วันล่าสุด — คืนจำนวนบิลที่ชำระแล้วและยอดรวมเป็นบาท",
    parameters: {
      type: "object",
      properties: {
        days: { type: "integer", minimum: 1, maximum: 365, description: "จำนวนวันย้อนหลัง (ค่าเริ่มต้น 7)" },
      },
      additionalProperties: false,
    },
  },
  async execute(ctx, args) {
    const raw = asRecord(args).days;
    const n = Number(raw);
    const days = Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 365) : 7;

    const pos = await findSystem(ctx.tenantId, "POS");
    if (!pos) return JSON.stringify({ error: "ร้านนี้ยังไม่ได้เปิดระบบขายหน้าร้าน (POS)" });

    const since = new Date(Date.now() - days * 86_400_000);
    const sales = await tenantDb({ tenantId: ctx.tenantId, systemId: pos.id }).posSale.findMany({
      where: { status: "PAID", createdAt: { gte: since } },
      select: { grandTotalSatang: true },
    });
    const totalSatang = sales.reduce((s, x) => s + (x.grandTotalSatang ?? 0), 0);
    return JSON.stringify({
      ช่วงเวลา: `${days} วันล่าสุด`,
      จำนวนบิลที่ชำระแล้ว: sales.length,
      ยอดขายรวมบาท: Math.round(totalSatang) / 100,
    });
  },
};

// ── 3) low_stock — สินค้าใกล้หมด/หมด (คลังสินค้า) ──
const lowStock: AiTool = {
  def: {
    name: "low_stock",
    description: "ดูรายการสินค้าในคลังที่คงเหลือถึงหรือต่ำกว่าจุดสั่งซื้อ (ต้องเติม)",
    parameters: NO_ARGS,
  },
  async execute(ctx) {
    const inv = await findSystem(ctx.tenantId, "INVENTORY");
    if (!inv) return JSON.stringify({ error: "ร้านนี้ยังไม่ได้เปิดระบบคลังสินค้า" });

    const items = await invLowStock({ tenantId: ctx.tenantId, systemId: inv.id });
    return JSON.stringify({
      สินค้าใกล้หมด: items.map((i) => ({
        ชื่อ: i.name,
        รหัส: i.sku,
        คงเหลือ: i.onHand,
        จุดสั่งซื้อ: i.reorderPoint,
      })),
    });
  },
};

// ── 4) pending_leaves — ใบลาที่รออนุมัติ (พนักงาน/HR) ──
const pendingLeaves: AiTool = {
  def: {
    name: "pending_leaves",
    description: "ดูใบลาของพนักงานที่ยังรออนุมัติ พร้อมชื่อพนักงานและช่วงวันลา",
    parameters: NO_ARGS,
  },
  async execute(ctx) {
    const hr = await findSystem(ctx.tenantId, "HR");
    if (!hr) return JSON.stringify({ error: "ร้านนี้ยังไม่ได้เปิดระบบพนักงาน (HR)" });

    const leaves = await hrPendingLeaves({ tenantId: ctx.tenantId, systemId: hr.id });
    return JSON.stringify({
      ใบลารออนุมัติ: leaves.map((l) => ({
        พนักงาน: l.employee?.name ?? "ไม่ทราบชื่อ",
        ประเภท: l.type,
        ตั้งแต่: safeDate(l.fromDate),
        ถึง: safeDate(l.toDate),
        เหตุผล: l.reason ?? null,
      })),
    });
  },
};

// ── 5) member_count — จำนวนสมาชิก (ระบบสมาชิก) ──
const memberCount: AiTool = {
  def: {
    name: "member_count",
    description: "นับจำนวนสมาชิก (ลูกค้า) ทั้งหมดของร้าน",
    parameters: NO_ARGS,
  },
  async execute(ctx) {
    const member = await findSystem(ctx.tenantId, "MEMBER");
    if (!member) return JSON.stringify({ error: "ร้านนี้ยังไม่ได้เปิดระบบสมาชิก" });

    // Customer ใช้ฟิลด์ memberSystemId — guard inject ให้เองเมื่อส่ง systemId
    const count = await tenantDb({ tenantId: ctx.tenantId, systemId: member.id }).customer.count();
    return JSON.stringify({ จำนวนสมาชิก: count });
  },
};

// ── 5b) customer_search — ค้นหาลูกค้า/สมาชิกจากชื่อ/เบอร์/รหัส (Phase 3 v2 — WO-0022) ──
const customerSearch: AiTool = {
  def: {
    name: "customer_search",
    description:
      "ค้นหาลูกค้า/สมาชิกของร้านจากชื่อ เบอร์โทร หรือรหัสสมาชิก — คืนรายชื่อสูงสุด 10 ราย (ชื่อ เบอร์ ระดับสมาชิก)",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "คำค้น เช่น ชื่อลูกค้า เบอร์โทร หรือรหัสสมาชิก" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  async execute(ctx, args) {
    const query = String(asRecord(args).query ?? "").trim();
    // listCustomers เป็น tenant-scoped อยู่แล้ว (กรอง tenantId ให้) — ค้นชื่อ/เบอร์/รหัสสมาชิก
    const rows = await memberListCustomers(ctx.tenantId, query);
    return JSON.stringify({
      ลูกค้า: rows.slice(0, 10).map((c) => ({
        ชื่อ: c.name ?? "ไม่ระบุชื่อ",
        เบอร์: c.phone ?? null,
        ระดับ: c.tier,
        รหัสสมาชิก: c.memberCode,
      })),
    });
  },
};

// ── 5c) sales_by_day — ยอดขาย PAID แยกรายวัน (วัน BKK) ย้อนหลัง N วัน ──
const salesByDay: AiTool = {
  def: {
    name: "sales_by_day",
    description:
      "ยอดขายหน้าร้าน (POS) ที่ชำระแล้ว แยกเป็นรายวันตามเวลาไทย ย้อนหลังกี่วันล่าสุด — คืนแต่ละวันพร้อมยอดบาทและจำนวนบิล",
    parameters: {
      type: "object",
      properties: {
        days: { type: "integer", minimum: 1, maximum: 90, description: "จำนวนวันย้อนหลัง (ค่าเริ่มต้น 7)" },
      },
      additionalProperties: false,
    },
  },
  async execute(ctx, args) {
    const raw = asRecord(args).days;
    const n = Number(raw);
    const days = Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 90) : 7;

    const pos = await findSystem(ctx.tenantId, "POS");
    if (!pos) return JSON.stringify({ error: "ร้านนี้ยังไม่ได้เปิดระบบขายหน้าร้าน (POS)" });

    const since = new Date(Date.now() - days * 86_400_000);
    const sales = await tenantDb({ tenantId: ctx.tenantId, systemId: pos.id }).posSale.findMany({
      where: { status: "PAID", createdAt: { gte: since } },
      select: { grandTotalSatang: true, createdAt: true },
    });

    // จัดกลุ่มตามวันแบบเวลาไทย (dayKeyBangkok) — สะสมยอดสตางค์ + นับบิล
    const byDay = new Map<string, { satang: number; count: number }>();
    for (const s of sales) {
      const day = dayKeyBangkok(s.createdAt);
      const g = byDay.get(day) ?? { satang: 0, count: 0 };
      g.satang += s.grandTotalSatang ?? 0;
      g.count += 1;
      byDay.set(day, g);
    }
    const รายวัน = [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1)) // ใหม่→เก่า
      .map(([day, g]) => ({ วัน: day, ยอดบาท: Math.round(g.satang) / 100, จำนวนบิล: g.count }));
    return JSON.stringify({ ช่วงเวลา: `${days} วันล่าสุด`, รายวัน });
  },
};

// ── action tools (Phase 3.5) — "เสนอ" การกระทำ ไม่ execute · คืน proposal ให้ user ยืนยัน ──
// helper: สร้าง proposal แล้วคืน JSON มาตรฐานให้ LLM (UI แสดง summary + ปุ่มยืนยันจาก proposal นี้)
async function propose(
  ctx: ToolCtx,
  kind: ProposalKind,
  summary: string,
  payload: Record<string, unknown>,
): Promise<string> {
  if (!ctx.conversationId) {
    return JSON.stringify({ error: "ต้องอยู่ในบทสนทนาก่อนจึงจะเสนอการกระทำได้" });
  }
  const p = await createProposal(
    { tenantId: ctx.tenantId },
    { conversationId: ctx.conversationId, kind, summary, payload },
  );
  // waiting: user_confirm = ยังไม่ทำ ต้องรอ user กดยืนยันในการ์ดใต้แชท
  return JSON.stringify({ proposalId: p.id, summary, waiting: "user_confirm" });
}

// ── 6) inventory_receive — เสนอรับสินค้าเข้าคลัง ──
const inventoryReceive: AiTool = {
  action: true,
  def: {
    name: "inventory_receive",
    description:
      "เสนอการรับสินค้าเข้าคลัง (ยังไม่ทำทันที — สร้างข้อเสนอให้ผู้ใช้กดยืนยันก่อน) ระบุ sku, จำนวน และต้นทุนต่อหน่วยเป็นบาทถ้ามี",
    parameters: {
      type: "object",
      properties: {
        sku: { type: "string", description: "รหัสสินค้า (SKU)" },
        qty: { type: "integer", minimum: 1, description: "จำนวนที่รับเข้า" },
        costBaht: { type: "number", minimum: 0, description: "ต้นทุนต่อหน่วยเป็นบาท (ถ้ามี)" },
      },
      required: ["sku", "qty"],
      additionalProperties: false,
    },
  },
  async execute(ctx, args) {
    const a = asRecord(args);
    const sku = String(a.sku ?? "").trim();
    const qty = Math.floor(Number(a.qty));
    if (!sku || !Number.isFinite(qty) || qty <= 0) {
      return JSON.stringify({ error: "ต้องระบุรหัสสินค้าและจำนวนที่ถูกต้อง (มากกว่า 0)" });
    }
    const costBaht = Number(a.costBaht);
    const hasCost = Number.isFinite(costBaht) && costBaht >= 0;
    const payload: Record<string, unknown> = { sku, qty };
    if (hasCost) payload.costSatang = Math.round(costBaht * 100);
    const summary =
      `รับสินค้ารหัส ${sku} เข้าคลัง ${qty} หน่วย` + (hasCost ? ` (ต้นทุน ${costBaht} บาท/หน่วย)` : "");
    return propose(ctx, "inventory_receive", summary, payload);
  },
};

// ── 7) hr_decide_leave — เสนออนุมัติ/ไม่อนุมัติใบลา ──
const hrDecideLeave: AiTool = {
  action: true,
  def: {
    name: "hr_decide_leave",
    description:
      "เสนอการอนุมัติหรือไม่อนุมัติใบลาของพนักงาน (ยังไม่ทำทันที — สร้างข้อเสนอให้ผู้ใช้ยืนยันก่อน) ระบุ leaveId และ decision (APPROVED หรือ REJECTED). ดู leaveId ได้จากเครื่องมือ pending_leaves",
    parameters: {
      type: "object",
      properties: {
        leaveId: { type: "string", description: "รหัสใบลา" },
        decision: { type: "string", enum: ["APPROVED", "REJECTED"], description: "ผลการพิจารณา" },
      },
      required: ["leaveId", "decision"],
      additionalProperties: false,
    },
  },
  async execute(ctx, args) {
    const a = asRecord(args);
    const leaveId = String(a.leaveId ?? "").trim();
    const decision = a.decision === "REJECTED" ? "REJECTED" : "APPROVED";
    if (!leaveId) return JSON.stringify({ error: "ต้องระบุรหัสใบลา" });
    // เติมชื่อพนักงานในสรุปถ้าหาเจอ (best-effort — ไม่เจอก็ใช้รหัสแทน)
    const who = await employeeNameForLeave(ctx.tenantId, leaveId);
    const verb = decision === "APPROVED" ? "อนุมัติ" : "ไม่อนุมัติ";
    const summary = who ? `${verb}ใบลาของ ${who}` : `${verb}ใบลา (รหัส ${leaveId})`;
    return propose(ctx, "hr_decide_leave", summary, { leaveId, decision });
  },
};

// ── 8) marketing_create_campaign — เสนอสร้างแคมเปญ (ฉบับร่างเสมอ) ──
const marketingCreateCampaign: AiTool = {
  action: true,
  def: {
    name: "marketing_create_campaign",
    description:
      "เสนอการสร้างแคมเปญการตลาดเป็นฉบับร่าง (ยังไม่ส่งจริง — สร้างข้อเสนอให้ผู้ใช้ยืนยันก่อน แล้วผู้ใช้กดส่งเองในระบบ) ระบุ name และ channel (เช่น LINE/SMS/EMAIL)",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "ชื่อแคมเปญ" },
        channel: { type: "string", description: "ช่องทางส่ง เช่น LINE, SMS, EMAIL" },
      },
      required: ["name", "channel"],
      additionalProperties: false,
    },
  },
  async execute(ctx, args) {
    const a = asRecord(args);
    const name = String(a.name ?? "").trim();
    const channel = String(a.channel ?? "").trim() || "LINE";
    if (!name) return JSON.stringify({ error: "ต้องระบุชื่อแคมเปญ" });
    const summary = `สร้างแคมเปญ "${name}" ผ่านช่องทาง ${channel} (ฉบับร่าง — ยังไม่ส่ง)`;
    return propose(ctx, "marketing_create_campaign", summary, { name, channel });
  },
};

// ── 9) member_create — เสนอสมัครสมาชิกให้ลูกค้า (Phase 3 v2 — WO-0022) ──
const memberCreate: AiTool = {
  action: true,
  def: {
    name: "member_create",
    description:
      "เสนอการสมัครสมาชิกให้ลูกค้าใหม่ (ยังไม่ทำทันที — สร้างข้อเสนอให้ผู้ใช้กดยืนยันก่อน) ระบุชื่อ และเบอร์โทร/อีเมลถ้ามี",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "ชื่อลูกค้า" },
        phone: { type: "string", description: "เบอร์โทร (ถ้ามี)" },
        email: { type: "string", description: "อีเมล (ถ้ามี)" },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  async execute(ctx, args) {
    const a = asRecord(args);
    const name = String(a.name ?? "").trim();
    const phone = String(a.phone ?? "").trim();
    const email = String(a.email ?? "").trim();
    if (!name) return JSON.stringify({ error: "ต้องระบุชื่อลูกค้า" });
    const payload: Record<string, unknown> = { name };
    if (phone) payload.phone = phone;
    if (email) payload.email = email;
    const contact = phone ? ` (เบอร์ ${phone})` : email ? ` (อีเมล ${email})` : "";
    const summary = `สมัครสมาชิกให้ '${name}'${contact}`;
    return propose(ctx, "member_create", summary, payload);
  },
};

// หาชื่อพนักงานของใบลา (best-effort สำหรับ summary) — พังก็คืน null ไม่โยน
async function employeeNameForLeave(tenantId: string, leaveId: string): Promise<string | null> {
  try {
    const hr = await findSystem(tenantId, "HR");
    if (!hr) return null;
    const leave = await tenantDb({ tenantId, systemId: hr.id }).hrLeave.findFirst({
      where: { id: leaveId },
      include: { employee: { select: { name: true } } },
    });
    return leave?.employee?.name ?? null;
  } catch {
    return null;
  }
}

export function toolRegistry(): AiTool[] {
  return [
    // read-only (7)
    listSystems,
    salesSummary,
    lowStock,
    pendingLeaves,
    memberCount,
    customerSearch,
    salesByDay,
    // action / ทำแทน (4)
    inventoryReceive,
    hrDecideLeave,
    marketingCreateCampaign,
    memberCreate,
  ];
}

// เรียกเครื่องมือตามชื่อ — กันพังทุกทาง: ไม่รู้จัก/execute พัง → JSON {"error":"..."} ห้าม throw
export async function runTool(ctx: ToolCtx, name: string, args: unknown): Promise<string> {
  const tool = toolRegistry().find((t) => t.def.name === name);
  if (!tool) return JSON.stringify({ error: `ไม่รู้จักเครื่องมือ "${name}"` });
  try {
    return await tool.execute(ctx, args);
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : "เครื่องมือทำงานผิดพลาด" });
  }
}

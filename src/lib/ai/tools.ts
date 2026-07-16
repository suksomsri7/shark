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

import { prisma, tenantDb } from "@/lib/core/db";
import type { SystemType } from "@prisma/client";
import { lowStock as invLowStock } from "@/lib/modules/inventory/service";
import { pendingLeaves as hrPendingLeaves } from "@/lib/modules/hr/service";
import { listCustomers as memberListCustomers } from "@/lib/modules/member/service";
import { searchKb as kbSearchArticles } from "@/lib/modules/kb/service";
import { AVAILABLE_FEATURE, systemDef } from "@/lib/systems";
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

// ── 5d) growth_recommendations — แนะนำระบบที่ควรเปิดเมื่อธุรกิจโต (WO-0033) ──
// กติกา deterministic (ไม่ใช้ LLM ใน tool) — ระบบที่เปิดแล้วห้ามแนะนำซ้ำ:
//   R1: ลูกค้า > 20 คน และยังไม่เปิด MARKETING → แนะนำ MARKETING
//   R2: บิล POS ที่ชำระแล้ว > 50 ใบ และยังไม่เปิด INVENTORY → แนะนำ INVENTORY
//   R3: ลูกค้า > 20 คน และยังไม่เปิด CRM → แนะนำ CRM
const growthRecommendations: AiTool = {
  def: {
    name: "growth_recommendations",
    description:
      "วิเคราะห์ข้อมูลจริงของร้าน (จำนวนลูกค้า / จำนวนบิลขาย) แล้วแนะนำระบบที่ควรเปิดเพิ่มเมื่อธุรกิจเติบโต — คืนรายการคำแนะนำพร้อมเหตุผลภาษาไทย (ระบบที่เปิดไว้แล้วจะไม่ถูกแนะนำซ้ำ)",
    parameters: NO_ARGS,
  },
  async execute(ctx) {
    const { tenantId } = ctx;
    // metric ระดับร้าน (รวมทุกระบบย่อย) — ใช้ตัดสินใจเชิงเติบโต · อ่านตรงแบบเดียวกับ resolveSystem ใน proposals
    const [customers, posPaid, systems] = await Promise.all([
      prisma.customer.count({ where: { tenantId } }),
      prisma.posSale.count({ where: { tenantId, status: "PAID" } }),
      prisma.appSystem.findMany({ where: { tenantId }, select: { type: true } }),
    ]);
    const open = new Set<SystemType>(systems.map((s) => s.type));

    const rules: { type: SystemType; when: boolean; reason: string }[] = [
      {
        type: "MARKETING",
        when: customers > 20,
        reason: `ร้านมีลูกค้าแล้ว ${customers} คน ถึงเวลาเปิดระบบการตลาดเพื่อทำแคมเปญและส่งข้อความชวนลูกค้ากลับมาซื้อซ้ำ`,
      },
      {
        type: "INVENTORY",
        when: posPaid > 50,
        reason: `มีบิลขายแล้ว ${posPaid} ใบ ควรเปิดระบบคลังเพื่อคุมสต็อกและรู้ตัวเมื่อของใกล้หมด`,
      },
      {
        type: "CRM",
        when: customers > 20,
        reason: `ร้านมีลูกค้าแล้ว ${customers} คน ควรเปิดระบบดูแลลูกค้าเพื่อติดตามดีลและความสัมพันธ์อย่างเป็นระบบ`,
      },
    ];

    const recs = rules
      .filter((r) => r.when && !open.has(r.type))
      .map((r) => ({ ระบบ: r.type, ชื่อ: systemDef(r.type)?.label ?? r.type, เหตุผล: r.reason }));

    if (recs.length === 0) {
      return JSON.stringify({
        คำแนะนำ: [],
        สรุป: "ยังไม่มีคำแนะนำให้เปิดระบบเพิ่มตอนนี้ — ธุรกิจยังไม่ถึงเกณฑ์ หรือเปิดระบบที่จำเป็นครบแล้ว",
      });
    }
    return JSON.stringify({ คำแนะนำ: recs });
  },
};

// ── 5e) kb_search — ค้นคลังความรู้/นโยบาย/FAQ ของร้าน (WO-0073) ──
// ให้ AI ค้น "ความรู้ร้าน" ก่อนตอบคำถามเฉพาะร้าน (นโยบายคืนสินค้า/เวลาเปิด/เงื่อนไขบริการ ฯลฯ)
// คืนข้อความไทยรวม title+เนื้อหา (ไม่ใช่ JSON) ให้ LLM เอาไปเรียบเรียงตอบจากข้อมูลจริง · ไม่เจอ → "ไม่พบ..." ห้าม throw
const kbSearch: AiTool = {
  def: {
    name: "kb_search",
    description:
      "ค้นคลังความรู้ของร้าน (FAQ / นโยบาย / ขั้นตอน / ความรู้เฉพาะร้าน) ด้วยคำค้น — ใช้ก่อนตอบคำถามที่ขึ้นกับร้านนี้โดยเฉพาะ เช่น นโยบายคืนสินค้า เวลาเปิด-ปิด เงื่อนไขบริการ วิธีทำสิ่งต่าง ๆ เพื่อตอบจากข้อมูลจริงของร้าน (ไม่เดา). คืนหัวข้อและเนื้อหาบทความที่เกี่ยวข้อง",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "คำค้น เช่น 'คืนสินค้า' 'เวลาเปิด' 'จัดส่ง'" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  async execute(ctx, args) {
    const query = String(asRecord(args).query ?? "").trim();
    if (!query) return `ไม่พบข้อมูลในคลังความรู้ — ยังไม่ได้ระบุคำค้น`;
    const hits = await kbSearchArticles({ tenantId: ctx.tenantId }, query, 5);
    if (hits.length === 0) {
      return `ไม่พบข้อมูลในคลังความรู้ของร้านที่ตรงกับ "${query}"`;
    }
    const parts = hits.map(
      (h, i) => `${i + 1}. ${h.title}${h.category ? ` [${h.category}]` : ""}\n${h.snippet}`,
    );
    return `พบ ${hits.length} บทความในคลังความรู้ของร้าน:\n\n${parts.join("\n\n")}`;
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

// ── 10) open_system — เสนอเปิดระบบใหม่ให้ร้าน (WO-0033) ──
// validate type กับทะเบียน systems.ts ก่อนเสนอ (ต้องเป็น feature ที่เปิดให้ใช้งาน) · เปิดจริงเมื่อ user ยืนยัน
const openSystem: AiTool = {
  action: true,
  def: {
    name: "open_system",
    description:
      "เสนอการเปิดระบบใหม่ให้ร้าน (ยังไม่เปิดทันที — สร้างข้อเสนอให้ผู้ใช้กดยืนยันก่อน) ระบุ type เป็นรหัสระบบ เช่น MARKETING, INVENTORY, CRM, HR และตั้ง name เองได้ถ้าต้องการ",
    parameters: {
      type: "object",
      properties: {
        type: { type: "string", description: "รหัสระบบที่จะเปิด เช่น MARKETING, INVENTORY, CRM, HR" },
        name: { type: "string", description: "ชื่อระบบที่ต้องการ (ถ้าไม่ระบุจะใช้ชื่อเริ่มต้นภาษาไทย)" },
      },
      required: ["type"],
      additionalProperties: false,
    },
  },
  async execute(ctx, args) {
    const a = asRecord(args);
    const type = String(a.type ?? "").trim().toUpperCase();
    const def = systemDef(type);
    if (!def || !AVAILABLE_FEATURE.has(type as SystemType)) {
      return JSON.stringify({
        error: `เปิดระบบ "${type}" ไม่ได้ — ไม่พบระบบนี้ในทะเบียน หรือยังไม่เปิดให้ใช้งาน`,
      });
    }
    const name = String(a.name ?? "").trim();
    const payload: Record<string, unknown> = { type };
    if (name) payload.name = name;
    const summary = `เปิดระบบ${def.label}ให้ร้านคุณ`;
    return propose(ctx, "open_system", summary, payload);
  },
};

// ── 11) inventory_create_item — เสนอเพิ่มสินค้าใหม่เข้าคลัง (WO-0045) ──
const inventoryCreateItem: AiTool = {
  action: true,
  def: {
    name: "inventory_create_item",
    description:
      "เสนอการเพิ่มสินค้าใหม่เข้าคลัง (ยังไม่ทำทันที — สร้างข้อเสนอให้ผู้ใช้กดยืนยันก่อน) ระบุ sku, ชื่อสินค้า และจุดสั่งซื้อ/ต้นทุนต่อหน่วยเป็นบาทถ้ามี — ยอดคงเหลือเริ่มต้นเป็น 0 (รับของเข้าจริงผ่านการรับสินค้า)",
    parameters: {
      type: "object",
      properties: {
        sku: { type: "string", description: "รหัสสินค้า (SKU)" },
        name: { type: "string", description: "ชื่อสินค้า" },
        reorderPoint: { type: "integer", minimum: 0, description: "จุดสั่งซื้อ (แจ้งเตือนเมื่อต่ำกว่านี้) ถ้ามี" },
        costBaht: { type: "number", minimum: 0, description: "ต้นทุนต่อหน่วยเป็นบาท (ถ้ามี)" },
      },
      required: ["sku", "name"],
      additionalProperties: false,
    },
  },
  async execute(ctx, args) {
    const a = asRecord(args);
    const sku = String(a.sku ?? "").trim();
    const name = String(a.name ?? "").trim();
    if (!sku || !name) return JSON.stringify({ error: "ต้องระบุรหัสสินค้าและชื่อสินค้า" });
    const payload: Record<string, unknown> = { sku, name };
    const reorderPoint = Number(a.reorderPoint);
    if (Number.isFinite(reorderPoint) && reorderPoint >= 0) payload.reorderPoint = Math.floor(reorderPoint);
    const costBaht = Number(a.costBaht);
    if (Number.isFinite(costBaht) && costBaht >= 0) payload.costSatang = Math.round(costBaht * 100);
    const summary = `เพิ่มสินค้าใหม่ "${name}" (รหัส ${sku}) เข้าคลัง`;
    return propose(ctx, "inventory_create_item", summary, payload);
  },
};

// ── 12) inventory_adjust — เสนอปรับยอดสต็อกเป็นค่านับจริง (WO-0045) ──
const inventoryAdjust: AiTool = {
  action: true,
  def: {
    name: "inventory_adjust",
    description:
      "เสนอการปรับยอดคงเหลือของสินค้าในคลังให้ตรงกับที่นับจริง (ยังไม่ทำทันที — สร้างข้อเสนอให้ผู้ใช้กดยืนยันก่อน) ระบุ sku และ newQty (ยอดที่นับได้จริง)",
    parameters: {
      type: "object",
      properties: {
        sku: { type: "string", description: "รหัสสินค้า (SKU)" },
        newQty: { type: "integer", description: "ยอดคงเหลือใหม่ที่นับได้จริง" },
        note: { type: "string", description: "หมายเหตุ เช่น สาเหตุการปรับ (ถ้ามี)" },
      },
      required: ["sku", "newQty"],
      additionalProperties: false,
    },
  },
  async execute(ctx, args) {
    const a = asRecord(args);
    const sku = String(a.sku ?? "").trim();
    const newQty = Math.round(Number(a.newQty));
    if (!sku || !Number.isFinite(newQty)) {
      return JSON.stringify({ error: "ต้องระบุรหัสสินค้าและยอดคงเหลือใหม่ที่ถูกต้อง" });
    }
    const note = String(a.note ?? "").trim();
    const payload: Record<string, unknown> = { sku, newQty };
    if (note) payload.note = note;
    // ดึงยอดคงเหลือปัจจุบัน + ชื่อสินค้า เพื่อทำสรุปที่อ่านเข้าใจง่าย (best-effort — ไม่เจอก็ใช้ sku)
    let label = sku;
    let fromText = "";
    const inv = await findSystem(ctx.tenantId, "INVENTORY");
    if (inv) {
      const item = await tenantDb({ tenantId: ctx.tenantId, systemId: inv.id }).invItem.findFirst({
        where: { sku },
        select: { name: true, onHand: true },
      });
      if (item) {
        label = item.name;
        fromText = `จาก ${item.onHand} `;
      }
    }
    const summary = `ปรับสต็อก "${label}" ${fromText}→ ${newQty}${note ? ` (${note})` : ""}`;
    return propose(ctx, "inventory_adjust", summary, payload);
  },
};

// ── 13) hr_create_employee — เสนอเพิ่มพนักงานใหม่ (WO-0045) ──
const hrCreateEmployee: AiTool = {
  action: true,
  def: {
    name: "hr_create_employee",
    description:
      "เสนอการเพิ่มพนักงานใหม่เข้าระบบพนักงาน (ยังไม่ทำทันที — สร้างข้อเสนอให้ผู้ใช้กดยืนยันก่อน) ระบุชื่อ และตำแหน่ง/เบอร์โทรถ้ามี",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "ชื่อพนักงาน" },
        position: { type: "string", description: "ตำแหน่งงาน (ถ้ามี)" },
        phone: { type: "string", description: "เบอร์โทร (ถ้ามี)" },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  async execute(ctx, args) {
    const a = asRecord(args);
    const name = String(a.name ?? "").trim();
    if (!name) return JSON.stringify({ error: "ต้องระบุชื่อพนักงาน" });
    const position = String(a.position ?? "").trim();
    const phone = String(a.phone ?? "").trim();
    const payload: Record<string, unknown> = { name };
    if (position) payload.position = position;
    if (phone) payload.phone = phone;
    const summary = `เพิ่มพนักงานใหม่ "${name}"${position ? ` (${position})` : ""}`;
    return propose(ctx, "hr_create_employee", summary, payload);
  },
};

// ── 14) coupon_create — เสนอสร้างคูปองส่วนลด (WO-0045) ──
const couponCreate: AiTool = {
  action: true,
  def: {
    name: "coupon_create",
    description:
      "เสนอการสร้างคูปองส่วนลด (ยังไม่ทำทันที — สร้างข้อเสนอให้ผู้ใช้กดยืนยันก่อน) ระบุ code, type (PERCENT=ลดเป็นเปอร์เซ็นต์ หรือ FIXED=ลดเป็นบาท), percent (ถ้า PERCENT), valueBaht (ถ้า FIXED) และ maxUses (จำกัดจำนวนครั้งใช้) ถ้ามี",
    parameters: {
      type: "object",
      properties: {
        code: { type: "string", description: "โค้ดคูปอง (A-Z 0-9 - _ อย่างน้อย 3 ตัว)" },
        type: { type: "string", enum: ["PERCENT", "FIXED"], description: "ชนิดส่วนลด" },
        percent: { type: "integer", minimum: 1, maximum: 100, description: "เปอร์เซ็นต์ที่ลด (ถ้า type=PERCENT)" },
        valueBaht: { type: "number", minimum: 0, description: "มูลค่าที่ลดเป็นบาท (ถ้า type=FIXED)" },
        maxUses: { type: "integer", minimum: 1, description: "จำกัดจำนวนครั้งที่ใช้ได้ทั้งหมด (ถ้ามี)" },
      },
      required: ["code", "type"],
      additionalProperties: false,
    },
  },
  async execute(ctx, args) {
    const a = asRecord(args);
    const code = String(a.code ?? "").trim();
    const type = a.type === "FIXED" ? "FIXED" : "PERCENT";
    if (!code) return JSON.stringify({ error: "ต้องระบุโค้ดคูปอง" });
    const payload: Record<string, unknown> = { code, type };
    const percent = Math.round(Number(a.percent));
    const valueBaht = Number(a.valueBaht);
    if (type === "PERCENT") {
      if (Number.isFinite(percent)) payload.percent = percent;
    } else if (Number.isFinite(valueBaht) && valueBaht >= 0) {
      payload.valueSatang = Math.round(valueBaht * 100);
    }
    const maxUses = Math.round(Number(a.maxUses));
    if (Number.isFinite(maxUses) && maxUses > 0) payload.usageLimit = maxUses;
    const discountText =
      type === "PERCENT"
        ? `ลด ${Number.isFinite(percent) ? percent : "?"}%`
        : `ลด ${Number.isFinite(valueBaht) ? valueBaht : "?"} บาท`;
    const summary = `สร้างคูปอง "${code}" (${discountText})`;
    return propose(ctx, "coupon_create", summary, payload);
  },
};

// ── 15) kanban_create_card — เสนอเพิ่มการ์ดงานลงบอร์ด (WO-0045) ──
const kanbanCreateCard: AiTool = {
  action: true,
  def: {
    name: "kanban_create_card",
    description:
      "เสนอการเพิ่มการ์ดงานลงบอร์ดงาน (ยังไม่ทำทันที — สร้างข้อเสนอให้ผู้ใช้กดยืนยันก่อน) ระบุ title, รายละเอียด (detail) ถ้ามี และ boardName ถ้าต้องการเจาะจงบอร์ด (ไม่ระบุ = บอร์ดแรก) — การ์ดจะถูกวางในคอลัมน์แรกของบอร์ด",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "หัวข้อการ์ด/งาน" },
        detail: { type: "string", description: "รายละเอียดงาน (ถ้ามี)" },
        boardName: { type: "string", description: "ชื่อบอร์ดที่ต้องการ (ถ้าไม่ระบุจะใช้บอร์ดแรก)" },
      },
      required: ["title"],
      additionalProperties: false,
    },
  },
  async execute(ctx, args) {
    const a = asRecord(args);
    const title = String(a.title ?? "").trim();
    if (!title) return JSON.stringify({ error: "ต้องระบุหัวข้อการ์ด" });
    const detail = String(a.detail ?? "").trim();
    const boardName = String(a.boardName ?? "").trim();
    const payload: Record<string, unknown> = { title };
    if (detail) payload.detail = detail;
    if (boardName) payload.boardName = boardName;
    const summary = `เพิ่มการ์ด "${title}" ลงบอร์ด${boardName ? ` "${boardName}"` : "แรก"}`;
    return propose(ctx, "kanban_create_card", summary, payload);
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
    // read-only (8)
    listSystems,
    salesSummary,
    lowStock,
    pendingLeaves,
    memberCount,
    customerSearch,
    salesByDay,
    growthRecommendations,
    kbSearch,
    // action / ทำแทน (10)
    inventoryReceive,
    hrDecideLeave,
    marketingCreateCampaign,
    memberCreate,
    openSystem,
    inventoryCreateItem,
    inventoryAdjust,
    hrCreateEmployee,
    couponCreate,
    kanbanCreateCard,
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

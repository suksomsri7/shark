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
    // validate-explain: ต้นทุนติดลบไม่สมเหตุสมผล → อธิบาย ไม่สร้าง proposal
    if (a.costBaht !== undefined && Number.isFinite(costBaht) && costBaht < 0) {
      return JSON.stringify({ error: "ต้นทุนต่อหน่วยติดลบไม่ได้", suggestion: "ตรวจตัวเลขต้นทุนอีกครั้ง หรือเว้นว่างถ้าไม่ทราบ" });
    }
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
    // validate-explain: ยอดติดลบทำไม่ได้ → อธิบาย + เสนอทางออก ไม่สร้าง proposal
    if (newQty < 0) {
      return JSON.stringify({ error: "ปรับสต็อกเป็นจำนวนติดลบไม่ได้", suggestion: "ต้องการตั้งเป็น 0 ไหม?" });
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
    // validate-explain: ค่าส่วนลดต้องสมเหตุสมผลก่อนเสนอ
    if (type === "PERCENT" && a.percent !== undefined && Number.isFinite(percent) && (percent < 1 || percent > 100)) {
      return JSON.stringify({ error: "ส่วนลดเป็นเปอร์เซ็นต์ต้องอยู่ระหว่าง 1-100", suggestion: "ระบุเปอร์เซ็นต์ใหม่ เช่น 10 หรือ 20" });
    }
    if (type === "FIXED" && a.valueBaht !== undefined && Number.isFinite(valueBaht) && valueBaht < 0) {
      return JSON.stringify({ error: "มูลค่าส่วนลดติดลบไม่ได้", suggestion: "ระบุจำนวนบาทที่มากกว่า 0" });
    }
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

// ── 15b) kanban_create_board — เสนอสร้างบอร์ดงานใหม่ (feedback เจ้าของ 2026-07-17) ──
const kanbanCreateBoard: AiTool = {
  action: true,
  def: {
    name: "kanban_create_board",
    description:
      "เสนอการสร้างบอร์ดงานใหม่ในระบบบอร์ดงาน (Kanban) — ยังไม่ทำทันที สร้างข้อเสนอให้ผู้ใช้กดยืนยันก่อน ระบุ name (ชื่อบอร์ด) และ description ถ้ามี · บอร์ดจะมีคอลัมน์เริ่มต้นให้พร้อมใช้ · ใช้เมื่อผู้ใช้ขอ 'สร้างบอร์ด/เปิดบอร์ดงานใหม่'",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "ชื่อบอร์ดงาน" },
        description: { type: "string", description: "คำอธิบายบอร์ด (ถ้ามี)" },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  async execute(ctx, args) {
    const a = asRecord(args);
    const name = String(a.name ?? "").trim();
    if (!name) return JSON.stringify({ error: "ต้องระบุชื่อบอร์ด" });
    const description = String(a.description ?? "").trim();
    const payload: Record<string, unknown> = { name };
    if (description) payload.description = description;
    return propose(ctx, "kanban_create_board", `สร้างบอร์ดงาน "${name}"`, payload);
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

// ── 16) record_expense — เสนอบันทึกค่าใช้จ่าย/ใบเสร็จเข้าบัญชี (feedback เจ้าของ #4) ──
// ใช้หลัง AI อ่านใบเสร็จจากรูป → เสนอบันทึกเป็นค่าใช้จ่าย (DRAFT) ให้ user ยืนยันก่อน
const recordExpense: AiTool = {
  action: true,
  def: {
    name: "record_expense",
    description:
      "เสนอบันทึกค่าใช้จ่าย/ใบเสร็จเข้าบัญชี (ยังไม่ทำทันที — สร้างข้อเสนอให้ผู้ใช้กดยืนยันก่อน) เหมาะกับการอ่านใบเสร็จจากรูปแล้วบันทึกเป็นค่าใช้จ่าย ระบุ note (รายละเอียดว่าเป็นค่าอะไร), amountSatang (ยอดเงินรวมเป็นสตางค์ = บาท × 100), vendor (ชื่อร้าน/ผู้ขาย ถ้ามี) และ date (วันที่ในใบเสร็จ รูปแบบ YYYY-MM-DD ถ้ามี)",
    parameters: {
      type: "object",
      properties: {
        vendor: { type: "string", description: "ชื่อร้าน/ผู้ขายในใบเสร็จ (ถ้ามี)" },
        note: { type: "string", description: "รายละเอียดค่าใช้จ่าย เช่น ค่าอะไร ซื้ออะไร" },
        amountSatang: { type: "integer", minimum: 1, description: "ยอดเงินรวมเป็นสตางค์ (บาท × 100)" },
        date: { type: "string", description: "วันที่ในใบเสร็จ รูปแบบ YYYY-MM-DD (ถ้ามี)" },
      },
      required: ["note", "amountSatang"],
      additionalProperties: false,
    },
  },
  async execute(ctx, args) {
    const a = asRecord(args);
    const note = String(a.note ?? "").trim();
    const amountSatang = Math.round(Number(a.amountSatang));
    if (!note) return JSON.stringify({ error: "ต้องระบุรายละเอียดค่าใช้จ่าย" });
    if (!Number.isFinite(amountSatang) || amountSatang <= 0) {
      return JSON.stringify({ error: "ต้องระบุยอดเงินที่ถูกต้อง (มากกว่า 0)" });
    }
    const vendor = String(a.vendor ?? "").trim();
    const date = String(a.date ?? "").trim();
    const payload: Record<string, unknown> = { note, amountSatang };
    if (vendor) payload.vendor = vendor;
    if (date) payload.date = date;
    const baht = (amountSatang / 100).toLocaleString("th-TH");
    const summary = `บันทึกค่าใช้จ่าย${vendor ? ` "${vendor}"` : ""} ${baht} บาท (${note})`;
    return propose(ctx, "record_expense", summary, payload);
  },
};

// ── ask_clarify — ถามกลับพร้อมตัวเลือกให้กด เมื่อคำสั่งกำกวม (feedback เจ้าของ: ถามกลับเมื่อกำกวม) ──
// def เท่านั้น — ไม่มีผลข้างเคียง · agent loop ใน service.ts ดักชื่อนี้ก่อนถึง execute แล้วจบเทิร์นด้วยคำถาม+ตัวเลือก
const askClarify: AiTool = {
  def: {
    name: "ask_clarify",
    description:
      "ถามกลับผู้ใช้พร้อมตัวเลือกให้กด เมื่อคำสั่งกำกวมหรือขาดข้อมูลจำเป็น (เช่น ไม่บอกจำนวน ไม่บอกว่าบอร์ด/สินค้า/บิลไหน) — อย่าเดา ให้เรียกเครื่องมือนี้เพื่อให้ผู้ใช้เลือก ระบุ question (คำถามสั้น ๆ) และ options 2-4 ตัวเลือก แต่ละตัวมี label (ข้อความบนปุ่ม) และ value (ข้อความที่จะส่งกลับเมื่อผู้ใช้กดปุ่มนั้น)",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string", description: "คำถามที่จะถามผู้ใช้" },
        options: {
          type: "array",
          description: "ตัวเลือกให้ผู้ใช้กด (2-4 ตัว)",
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "ข้อความบนปุ่ม" },
              value: { type: "string", description: "ข้อความที่ส่งกลับเมื่อกดปุ่มนี้" },
            },
            required: ["label", "value"],
            additionalProperties: false,
          },
        },
      },
      required: ["question", "options"],
      additionalProperties: false,
    },
  },
  // ไม่มีผลข้างเคียง (service loop จัดการก่อนถึงตรงนี้) — คืน marker เผื่อถูกเรียกตรง
  async execute() {
    return JSON.stringify({ clarify: true });
  },
};

// ── void_sale — เสนอยกเลิก (void) บิลขายที่ชำระแล้ว (destructive — ยืนยัน 2 ชั้น) ──
const voidSale: AiTool = {
  action: true,
  def: {
    name: "void_sale",
    description:
      "เสนอยกเลิก (void) บิลขายหน้าร้านที่ชำระแล้ว (ยังไม่ทำทันที — สร้างข้อเสนอให้ผู้ใช้ยืนยัน 2 ชั้นก่อน เพราะเป็นการลบถาวรที่ย้อนกลับไม่ได้) ระบุ saleId (รหัสบิล)",
    parameters: {
      type: "object",
      properties: {
        saleId: { type: "string", description: "รหัสบิลที่จะยกเลิก" },
      },
      required: ["saleId"],
      additionalProperties: false,
    },
  },
  async execute(ctx, args) {
    const saleId = String(asRecord(args).saleId ?? "").trim();
    if (!saleId) return JSON.stringify({ error: "ต้องระบุรหัสบิลที่จะยกเลิก" });
    return propose(ctx, "void_sale", `ยกเลิก (void) บิลรหัส ${saleId}`, { saleId });
  },
};

// ══════════════════════════════════════════════════════════════════
// Phase B1 — ทำแทนโมดูลเงินเดิน (action 5) + ดูข้อมูล (read 3)
// resolve unit อยู่ใน dispatch (proposals.ts) — tool แค่รวบ payload แล้ว propose
// ══════════════════════════════════════════════════════════════════

// ── B1-A1) pos_create_sale — เสนอเปิดบิลขายหน้าร้าน (POS) ──
const posCreateSale: AiTool = {
  action: true,
  def: {
    name: "pos_create_sale",
    description:
      "เสนอเปิดบิลขายหน้าร้าน (POS) — ยังไม่ทำทันที สร้างข้อเสนอให้ผู้ใช้กดยืนยันก่อน · ระบุ lines (แต่ละรายการมี name=ชื่อสินค้า, qty=จำนวน, unitPriceSatang=ราคาต่อหน่วยเป็นสตางค์ คือบาท×100) และ payType (CASH=เงินสด / TRANSFER=โอน / PROMPTPAY=พร้อมเพย์) · ระบุ unitName ถ้าร้านมีหลายสาขา",
    parameters: {
      type: "object",
      properties: {
        unitName: { type: "string", description: "ชื่อสาขา/จุดขาย (ถ้ามีหลายสาขา)" },
        lines: {
          type: "array",
          description: "รายการสินค้าในบิล (อย่างน้อย 1 รายการ)",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "ชื่อสินค้า/รายการ" },
              qty: { type: "integer", minimum: 1, description: "จำนวน" },
              unitPriceSatang: { type: "integer", minimum: 0, description: "ราคาต่อหน่วยเป็นสตางค์ (บาท×100)" },
            },
            required: ["name", "qty", "unitPriceSatang"],
            additionalProperties: false,
          },
        },
        payType: { type: "string", enum: ["CASH", "TRANSFER", "PROMPTPAY"], description: "วิธีชำระเงิน" },
      },
      required: ["lines", "payType"],
      additionalProperties: false,
    },
  },
  async execute(ctx, args) {
    const a = asRecord(args);
    const rawLines = Array.isArray(a.lines) ? a.lines : [];
    // validate-explain: ก่อน propose — lines ว่าง/qty≤0/ราคาติดลบ → คืน {error,suggestion} ไม่สร้าง proposal
    if (rawLines.length === 0) {
      return JSON.stringify({ error: "ยังไม่มีรายการสินค้าในบิล", suggestion: "ระบุอย่างน้อย 1 รายการ (ชื่อ จำนวน ราคาต่อหน่วย)" });
    }
    const lines: { name: string; qty: number; unitPriceSatang: number }[] = [];
    for (const raw of rawLines) {
      const l = asRecord(raw);
      const name = String(l.name ?? "").trim();
      const qty = Math.round(Number(l.qty));
      const unitPriceSatang = Math.round(Number(l.unitPriceSatang));
      if (!name) return JSON.stringify({ error: "แต่ละรายการต้องมีชื่อสินค้า", suggestion: "ระบุชื่อสินค้าให้ครบทุกบรรทัด" });
      if (!Number.isFinite(qty) || qty <= 0) {
        return JSON.stringify({ error: `จำนวนของ "${name}" ต้องมากกว่า 0`, suggestion: "ตรวจจำนวนอีกครั้ง (ต้องเป็นจำนวนเต็มบวก)" });
      }
      if (!Number.isFinite(unitPriceSatang) || unitPriceSatang < 0) {
        return JSON.stringify({ error: `ราคาของ "${name}" ติดลบไม่ได้`, suggestion: "ตรวจราคาต่อหน่วยอีกครั้ง" });
      }
      lines.push({ name, qty, unitPriceSatang });
    }
    let payType = "CASH";
    if (a.payType === "TRANSFER") payType = "TRANSFER";
    else if (a.payType === "PROMPTPAY") payType = "PROMPTPAY";
    const payload: Record<string, unknown> = { lines, payType };
    const unitName = String(a.unitName ?? "").trim();
    if (unitName) payload.unitName = unitName;
    const grand = lines.reduce((s, l) => s + l.unitPriceSatang * l.qty, 0);
    const baht = (grand / 100).toLocaleString("th-TH");
    const payLabel = payType === "TRANSFER" ? "โอน" : payType === "PROMPTPAY" ? "พร้อมเพย์" : "เงินสด";
    const summary = `เปิดบิลขาย ${baht} บาท (${lines.length} รายการ · ${payLabel})`;
    return propose(ctx, "pos_create_sale", summary, payload);
  },
};

// ── B1-A2) booking_create_appointment — เสนอจองนัดบริการ ──
const bookingCreateAppointment: AiTool = {
  action: true,
  def: {
    name: "booking_create_appointment",
    description:
      "เสนอจองนัดหมายบริการให้ลูกค้า (ยังไม่ทำทันที — สร้างข้อเสนอให้ผู้ใช้กดยืนยันก่อน) · ระบุ serviceName (ชื่อบริการ), dateStr (YYYY-MM-DD), startMin (เวลาเริ่มเป็นนาทีจากเที่ยงคืน เช่น 10:00=600), customerName, customerPhone · staffName ถ้าเจาะจงช่าง (ไม่ระบุ=ช่างว่างคนแรก) · unitName ถ้ามีหลายสาขา",
    parameters: {
      type: "object",
      properties: {
        unitName: { type: "string", description: "ชื่อร้าน/สาขา (ถ้ามีหลายสาขา)" },
        serviceName: { type: "string", description: "ชื่อบริการ (จับคู่แบบบางส่วนได้)" },
        staffName: { type: "string", description: "ชื่อช่าง/พนักงาน (ถ้าเจาะจง)" },
        dateStr: { type: "string", description: "วันที่นัด รูปแบบ YYYY-MM-DD" },
        startMin: { type: "integer", minimum: 0, maximum: 1439, description: "เวลาเริ่มเป็นนาทีจากเที่ยงคืน (เช่น 10:00 = 600)" },
        customerName: { type: "string", description: "ชื่อลูกค้า" },
        customerPhone: { type: "string", description: "เบอร์โทรลูกค้า" },
      },
      required: ["serviceName", "dateStr", "startMin", "customerName", "customerPhone"],
      additionalProperties: false,
    },
  },
  async execute(ctx, args) {
    const a = asRecord(args);
    const serviceName = String(a.serviceName ?? "").trim();
    const dateStr = String(a.dateStr ?? "").trim();
    const startMin = Math.round(Number(a.startMin));
    const customerName = String(a.customerName ?? "").trim();
    const customerPhone = String(a.customerPhone ?? "").trim();
    if (!serviceName) return JSON.stringify({ error: "ต้องระบุชื่อบริการ" });
    if (!dateStr) return JSON.stringify({ error: "ต้องระบุวันที่นัด (YYYY-MM-DD)" });
    if (!Number.isFinite(startMin) || startMin < 0 || startMin > 1439) {
      return JSON.stringify({ error: "เวลาเริ่มไม่ถูกต้อง", suggestion: "ระบุเป็นนาทีจากเที่ยงคืน เช่น 10:00 = 600" });
    }
    if (!customerName) return JSON.stringify({ error: "ต้องระบุชื่อลูกค้า" });
    if (!customerPhone) return JSON.stringify({ error: "ต้องระบุเบอร์โทรลูกค้า" });
    const payload: Record<string, unknown> = { serviceName, dateStr, startMin, customerName, customerPhone };
    const staffName = String(a.staffName ?? "").trim();
    if (staffName) payload.staffName = staffName;
    const unitName = String(a.unitName ?? "").trim();
    if (unitName) payload.unitName = unitName;
    const hhmm = `${String(Math.floor(startMin / 60)).padStart(2, "0")}:${String(startMin % 60).padStart(2, "0")}`;
    const summary = `จองนัด "${serviceName}" ${dateStr} ${hhmm} น. ให้ ${customerName}`;
    return propose(ctx, "booking_create_appointment", summary, payload);
  },
};

// ── B1-A3) hotel_create_reservation — เสนอจองห้องพัก ──
const hotelCreateReservation: AiTool = {
  action: true,
  def: {
    name: "hotel_create_reservation",
    description:
      "เสนอจองห้องพักให้ลูกค้า (ยังไม่ทำทันที — สร้างข้อเสนอให้ผู้ใช้กดยืนยันก่อน) · ระบุ roomTypeName (ชื่อประเภทห้อง จับคู่บางส่วนได้), guestName, checkInDate (YYYY-MM-DD), checkOutDate (YYYY-MM-DD) · guestPhone ถ้ามี · unitName ถ้ามีหลายที่พัก",
    parameters: {
      type: "object",
      properties: {
        unitName: { type: "string", description: "ชื่อโรงแรม/ที่พัก (ถ้ามีหลายที่)" },
        roomTypeName: { type: "string", description: "ชื่อประเภทห้อง เช่น Deluxe (จับคู่บางส่วนได้)" },
        guestName: { type: "string", description: "ชื่อผู้เข้าพัก" },
        guestPhone: { type: "string", description: "เบอร์โทรผู้เข้าพัก (ถ้ามี)" },
        checkInDate: { type: "string", description: "วันเช็คอิน รูปแบบ YYYY-MM-DD" },
        checkOutDate: { type: "string", description: "วันเช็คเอาต์ รูปแบบ YYYY-MM-DD" },
      },
      required: ["roomTypeName", "guestName", "checkInDate", "checkOutDate"],
      additionalProperties: false,
    },
  },
  async execute(ctx, args) {
    const a = asRecord(args);
    const roomTypeName = String(a.roomTypeName ?? "").trim();
    const guestName = String(a.guestName ?? "").trim();
    const checkInDate = String(a.checkInDate ?? "").trim();
    const checkOutDate = String(a.checkOutDate ?? "").trim();
    if (!roomTypeName) return JSON.stringify({ error: "ต้องระบุประเภทห้อง" });
    if (!guestName) return JSON.stringify({ error: "ต้องระบุชื่อผู้เข้าพัก" });
    if (!checkInDate || !checkOutDate) return JSON.stringify({ error: "ต้องระบุวันเช็คอินและเช็คเอาต์ (YYYY-MM-DD)" });
    const payload: Record<string, unknown> = { roomTypeName, guestName, checkInDate, checkOutDate };
    const guestPhone = String(a.guestPhone ?? "").trim();
    if (guestPhone) payload.guestPhone = guestPhone;
    const unitName = String(a.unitName ?? "").trim();
    if (unitName) payload.unitName = unitName;
    const summary = `จองห้อง "${roomTypeName}" ให้ ${guestName} (${checkInDate} → ${checkOutDate})`;
    return propose(ctx, "hotel_create_reservation", summary, payload);
  },
};

// ── B1-A4) queue_issue_ticket — เสนอออกบัตรคิว ──
const queueIssueTicket: AiTool = {
  action: true,
  def: {
    name: "queue_issue_ticket",
    description:
      "เสนอออกบัตรคิวให้ลูกค้า (ยังไม่ทำทันที — สร้างข้อเสนอให้ผู้ใช้กดยืนยันก่อน) · typeName ถ้าเจาะจงประเภทคิว (ไม่ระบุ=ประเภทแรก) · customerName ถ้ามี · unitName ถ้ามีหลายจุด",
    parameters: {
      type: "object",
      properties: {
        unitName: { type: "string", description: "ชื่อจุดออกบัตรคิว (ถ้ามีหลายจุด)" },
        typeName: { type: "string", description: "ชื่อประเภทคิว เช่น ทั่วไป/พรีเมียม (ถ้าเจาะจง)" },
        customerName: { type: "string", description: "ชื่อลูกค้า (ถ้ามี)" },
      },
      required: [],
      additionalProperties: false,
    },
  },
  async execute(ctx, args) {
    const a = asRecord(args);
    const payload: Record<string, unknown> = {};
    const typeName = String(a.typeName ?? "").trim();
    if (typeName) payload.typeName = typeName;
    const customerName = String(a.customerName ?? "").trim();
    if (customerName) payload.customerName = customerName;
    const unitName = String(a.unitName ?? "").trim();
    if (unitName) payload.unitName = unitName;
    const summary = `ออกบัตรคิว${typeName ? ` "${typeName}"` : ""}${customerName ? ` ให้ ${customerName}` : ""}`;
    return propose(ctx, "queue_issue_ticket", summary, payload);
  },
};

// ── B1-A5) shop_confirm_order — เสนอยืนยันรับเงินออเดอร์ร้านออนไลน์ ──
const shopConfirmOrder: AiTool = {
  action: true,
  def: {
    name: "shop_confirm_order",
    description:
      "เสนอยืนยันรับเงินออเดอร์ร้านค้าออนไลน์ (ยังไม่ทำทันที — สร้างข้อเสนอให้ผู้ใช้กดยืนยันก่อน) · ระบุ orderCode (รหัสออเดอร์ เช่น SO-0001) · เมื่อยืนยันจะบันทึกเป็นยอดขายให้อัตโนมัติ",
    parameters: {
      type: "object",
      properties: {
        orderCode: { type: "string", description: "รหัสออเดอร์ เช่น SO-0001" },
      },
      required: ["orderCode"],
      additionalProperties: false,
    },
  },
  async execute(ctx, args) {
    const orderCode = String(asRecord(args).orderCode ?? "").trim();
    if (!orderCode) return JSON.stringify({ error: "ต้องระบุรหัสออเดอร์" });
    return propose(ctx, "shop_confirm_order", `ยืนยันรับเงินออเดอร์ ${orderCode}`, { orderCode });
  },
};

// ── B1-R1) today_appointments — นัดหมายวันนี้ (เวลาไทย) ทุกสาขา ──
const todayAppointments: AiTool = {
  def: {
    name: "today_appointments",
    description: "ดูรายการนัดหมายบริการของวันนี้ (ตามเวลาไทย) ทุกสาขา — คืนเวลา ชื่อลูกค้า บริการ และช่าง",
    parameters: NO_ARGS,
  },
  async execute(ctx) {
    const today = dayKeyBangkok(new Date()); // YYYY-MM-DD (BKK)
    const start = new Date(`${today}T00:00:00+07:00`);
    const end = new Date(`${today}T00:00:00+07:00`);
    end.setDate(end.getDate() + 1);
    const appts = await prisma.appointment.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
        startAt: { gte: start, lt: end },
      },
      orderBy: { startAt: "asc" },
      include: { service: { select: { name: true } }, staff: { select: { name: true } } },
    });
    return JSON.stringify({
      วันที่: today,
      นัดวันนี้: appts.map((ap) => ({
        เวลา: ap.startAt.toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" }),
        ลูกค้า: ap.customerName,
        บริการ: ap.service?.name ?? null,
        ช่าง: ap.staff?.name ?? null,
      })),
    });
  },
};

// ── B1-R2) queue_waiting — บัตรคิวที่กำลังรอ แยกตามประเภท ──
const queueWaiting: AiTool = {
  def: {
    name: "queue_waiting",
    description: "ดูบัตรคิวที่กำลังรอเรียกตอนนี้ แยกตามประเภทคิว — คืนจำนวนที่รอและหมายเลขบัตร",
    parameters: NO_ARGS,
  },
  async execute(ctx) {
    const tickets = await prisma.queueTicket.findMany({
      where: { tenantId: ctx.tenantId, status: "WAITING" },
      orderBy: { seq: "asc" },
      include: { type: { select: { name: true } } },
    });
    const byType = new Map<string, string[]>();
    for (const t of tickets) {
      const name = t.type?.name ?? "ไม่ระบุประเภท";
      const arr = byType.get(name) ?? [];
      arr.push(t.number);
      byType.set(name, arr);
    }
    return JSON.stringify({
      คิวที่รอทั้งหมด: tickets.length,
      แยกตามประเภท: [...byType.entries()].map(([ประเภท, numbers]) => ({
        ประเภท,
        จำนวนที่รอ: numbers.length,
        หมายเลข: numbers,
      })),
    });
  },
};

// ── B1-R3) shop_pending_orders — ออเดอร์ร้านออนไลน์ที่รอชำระ/รอยืนยัน ──
const shopPendingOrders: AiTool = {
  def: {
    name: "shop_pending_orders",
    description: "ดูออเดอร์ร้านค้าออนไลน์ที่รอชำระ/รอยืนยันรับเงิน — คืนรหัสออเดอร์ ยอดเงิน และชื่อลูกค้า",
    parameters: NO_ARGS,
  },
  async execute(ctx) {
    const orders = await prisma.shopOrder.findMany({
      where: { tenantId: ctx.tenantId, status: "PENDING_PAYMENT" },
      orderBy: { createdAt: "desc" },
      select: { code: true, totalSatang: true, customerName: true },
    });
    return JSON.stringify({
      ออเดอร์รอชำระ: orders.map((o) => ({
        รหัส: o.code,
        ยอดบาท: Math.round(o.totalSatang) / 100,
        ลูกค้า: o.customerName,
      })),
    });
  },
};

// ══════════════════════════════════════════════════════════════════
// Phase B2 (ชุดปิด) — ทำแทน CRM·KB·โรงเรียน·คลินิก·เช่า·สายอนุมัติ·คลังตัดออก (action 8) + ดูข้อมูล (read 2)
// resolve unit/course/asset/enrollment อยู่ใน dispatch (proposals.ts) — tool แค่รวบ payload แล้ว propose
// ══════════════════════════════════════════════════════════════════

// ── B2-A1) crm_create_lead — เสนอบันทึกลูกค้ามุ่งหวัง (lead) เข้า CRM ──
const crmCreateLead: AiTool = {
  action: true,
  def: {
    name: "crm_create_lead",
    description:
      "เสนอบันทึกลูกค้ามุ่งหวัง (lead) เข้าระบบ CRM (ยังไม่ทำทันที — สร้างข้อเสนอให้ผู้ใช้กดยืนยันก่อน) · ระบุ name (ชื่อผู้ติดต่อ) และ phone/email/note ถ้ามี",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "ชื่อผู้ติดต่อ/ลูกค้ามุ่งหวัง" },
        phone: { type: "string", description: "เบอร์โทร (ถ้ามี)" },
        email: { type: "string", description: "อีเมล (ถ้ามี)" },
        note: { type: "string", description: "บันทึกย่อ (ถ้ามี)" },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  async execute(ctx, args) {
    const a = asRecord(args);
    const name = String(a.name ?? "").trim();
    if (!name) return JSON.stringify({ error: "ต้องระบุชื่อผู้ติดต่อ" });
    const payload: Record<string, unknown> = { name };
    const phone = String(a.phone ?? "").trim();
    const email = String(a.email ?? "").trim();
    const note = String(a.note ?? "").trim();
    if (phone) payload.phone = phone;
    if (email) payload.email = email;
    if (note) payload.note = note;
    const contact = phone ? ` (เบอร์ ${phone})` : email ? ` (อีเมล ${email})` : "";
    return propose(ctx, "crm_create_lead", `บันทึกลูกค้ามุ่งหวัง "${name}"${contact}`, payload);
  },
};

// ── B2-A2) kb_create_article — เสนอเพิ่มบทความคลังความรู้ ──
const kbCreateArticle: AiTool = {
  action: true,
  def: {
    name: "kb_create_article",
    description:
      "เสนอเพิ่มบทความเข้าคลังความรู้ของร้าน (FAQ/นโยบาย/ขั้นตอน) — ยังไม่ทำทันที สร้างข้อเสนอให้ผู้ใช้กดยืนยันก่อน · ระบุ title, body และ category ถ้ามี",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "หัวข้อบทความ" },
        body: { type: "string", description: "เนื้อหาบทความ" },
        category: { type: "string", description: "หมวดหมู่ (ถ้ามี)" },
      },
      required: ["title", "body"],
      additionalProperties: false,
    },
  },
  async execute(ctx, args) {
    const a = asRecord(args);
    const title = String(a.title ?? "").trim();
    const body = String(a.body ?? "").trim();
    if (!title) return JSON.stringify({ error: "ต้องระบุหัวข้อบทความ" });
    if (!body) return JSON.stringify({ error: "ต้องระบุเนื้อหาบทความ" });
    const payload: Record<string, unknown> = { title, body };
    const category = String(a.category ?? "").trim();
    if (category) payload.category = category;
    return propose(ctx, "kb_create_article", `เพิ่มบทความ "${title}" เข้าคลังความรู้`, payload);
  },
};

// ── B2-A3) school_enroll — เสนอสมัครนักเรียนเข้าคอร์ส/รอบเรียน ──
const schoolEnroll: AiTool = {
  action: true,
  def: {
    name: "school_enroll",
    description:
      "เสนอสมัครนักเรียนเข้าคอร์ส (ยังไม่ทำทันที — สร้างข้อเสนอให้ผู้ใช้กดยืนยันก่อน) · ระบุ courseName (ชื่อคอร์ส จับคู่บางส่วนได้), studentName, studentPhone · className ถ้าเจาะจงรอบเรียน (ไม่ระบุ=รอบแรก) · unitName ถ้ามีหลายสาขา",
    parameters: {
      type: "object",
      properties: {
        unitName: { type: "string", description: "ชื่อโรงเรียน/สาขา (ถ้ามีหลายสาขา)" },
        courseName: { type: "string", description: "ชื่อคอร์ส (จับคู่บางส่วนได้)" },
        className: { type: "string", description: "ชื่อรอบเรียน (ถ้าเจาะจง)" },
        studentName: { type: "string", description: "ชื่อนักเรียน" },
        studentPhone: { type: "string", description: "เบอร์โทรนักเรียน/ผู้ปกครอง" },
      },
      required: ["courseName", "studentName", "studentPhone"],
      additionalProperties: false,
    },
  },
  async execute(ctx, args) {
    const a = asRecord(args);
    const courseName = String(a.courseName ?? "").trim();
    const studentName = String(a.studentName ?? "").trim();
    const studentPhone = String(a.studentPhone ?? "").trim();
    if (!courseName) return JSON.stringify({ error: "ต้องระบุชื่อคอร์ส" });
    if (!studentName) return JSON.stringify({ error: "ต้องระบุชื่อนักเรียน" });
    if (!studentPhone) return JSON.stringify({ error: "ต้องระบุเบอร์โทรนักเรียน" });
    const payload: Record<string, unknown> = { courseName, studentName, studentPhone };
    const className = String(a.className ?? "").trim();
    if (className) payload.className = className;
    const unitName = String(a.unitName ?? "").trim();
    if (unitName) payload.unitName = unitName;
    const summary = `สมัคร ${studentName} เข้าคอร์ส "${courseName}"${className ? ` (${className})` : ""}`;
    return propose(ctx, "school_enroll", summary, payload);
  },
};

// ── B2-A4) school_mark_paid — เสนอรับชำระค่าเรียน (เข้าเส้นเงิน) ──
const schoolMarkPaid: AiTool = {
  action: true,
  def: {
    name: "school_mark_paid",
    description:
      "เสนอรับชำระค่าเรียนของนักเรียนที่สมัครแล้วรอชำระ (ยังไม่ทำทันที — สร้างข้อเสนอให้ผู้ใช้กดยืนยันก่อน · เมื่อยืนยันจะบันทึกเป็นยอดขายให้อัตโนมัติ) · ระบุ studentPhone (เบอร์ — แม่นสุด) หรือ studentName",
    parameters: {
      type: "object",
      properties: {
        studentName: { type: "string", description: "ชื่อนักเรียน" },
        studentPhone: { type: "string", description: "เบอร์โทรนักเรียน (แม่นกว่าชื่อ)" },
      },
      required: [],
      additionalProperties: false,
    },
  },
  async execute(ctx, args) {
    const a = asRecord(args);
    const studentName = String(a.studentName ?? "").trim();
    const studentPhone = String(a.studentPhone ?? "").trim();
    if (!studentName && !studentPhone) {
      return JSON.stringify({ error: "ต้องระบุชื่อหรือเบอร์นักเรียน", suggestion: "ระบุเบอร์โทรจะแม่นที่สุด" });
    }
    const payload: Record<string, unknown> = {};
    if (studentName) payload.studentName = studentName;
    if (studentPhone) payload.studentPhone = studentPhone;
    const who = studentPhone ? `เบอร์ ${studentPhone}` : studentName;
    return propose(ctx, "school_mark_paid", `รับชำระค่าเรียนของ ${who}`, payload);
  },
};

// ── B2-A5) clinic_create_patient — เสนอเพิ่มผู้ป่วยใหม่ ──
const clinicCreatePatient: AiTool = {
  action: true,
  def: {
    name: "clinic_create_patient",
    description:
      "เสนอเพิ่มผู้ป่วยใหม่เข้าคลินิก (ยังไม่ทำทันที — สร้างข้อเสนอให้ผู้ใช้กดยืนยันก่อน) · ระบุ name, phone · allergies (ประวัติแพ้ยา) ถ้ามี · unitName ถ้ามีหลายสาขา",
    parameters: {
      type: "object",
      properties: {
        unitName: { type: "string", description: "ชื่อคลินิก/สาขา (ถ้ามีหลายสาขา)" },
        name: { type: "string", description: "ชื่อผู้ป่วย" },
        phone: { type: "string", description: "เบอร์โทรผู้ป่วย" },
        allergies: { type: "string", description: "ประวัติแพ้ยา (ถ้ามี)" },
      },
      required: ["name", "phone"],
      additionalProperties: false,
    },
  },
  async execute(ctx, args) {
    const a = asRecord(args);
    const name = String(a.name ?? "").trim();
    const phone = String(a.phone ?? "").trim();
    if (!name) return JSON.stringify({ error: "ต้องระบุชื่อผู้ป่วย" });
    if (!phone) return JSON.stringify({ error: "ต้องระบุเบอร์โทรผู้ป่วย" });
    const payload: Record<string, unknown> = { name, phone };
    const allergies = String(a.allergies ?? "").trim();
    if (allergies) payload.allergies = allergies;
    const unitName = String(a.unitName ?? "").trim();
    if (unitName) payload.unitName = unitName;
    return propose(ctx, "clinic_create_patient", `เพิ่มผู้ป่วย "${name}" (${phone})`, payload);
  },
};

// ── B2-A6) rental_create_booking — เสนอจองเช่าของ ──
const rentalCreateBooking: AiTool = {
  action: true,
  def: {
    name: "rental_create_booking",
    description:
      "เสนอจองเช่าของให้ลูกค้า (ยังไม่ทำทันที — สร้างข้อเสนอให้ผู้ใช้กดยืนยันก่อน) · ระบุ assetName (ชื่อของที่เช่า จับคู่บางส่วนได้), customerName, customerPhone, startDate (YYYY-MM-DD), endDate (YYYY-MM-DD — วันคืน ไม่นับวันนั้น) · unitName ถ้ามีหลายจุด",
    parameters: {
      type: "object",
      properties: {
        unitName: { type: "string", description: "ชื่อจุดให้เช่า (ถ้ามีหลายจุด)" },
        assetName: { type: "string", description: "ชื่อของที่เช่า (จับคู่บางส่วนได้)" },
        customerName: { type: "string", description: "ชื่อลูกค้า" },
        customerPhone: { type: "string", description: "เบอร์โทรลูกค้า" },
        startDate: { type: "string", description: "วันเริ่มเช่า รูปแบบ YYYY-MM-DD" },
        endDate: { type: "string", description: "วันคืน รูปแบบ YYYY-MM-DD (ไม่นับวันคืน)" },
      },
      required: ["assetName", "customerName", "customerPhone", "startDate", "endDate"],
      additionalProperties: false,
    },
  },
  async execute(ctx, args) {
    const a = asRecord(args);
    const assetName = String(a.assetName ?? "").trim();
    const customerName = String(a.customerName ?? "").trim();
    const customerPhone = String(a.customerPhone ?? "").trim();
    const startDate = String(a.startDate ?? "").trim();
    const endDate = String(a.endDate ?? "").trim();
    if (!assetName) return JSON.stringify({ error: "ต้องระบุชื่อของที่เช่า" });
    if (!customerName) return JSON.stringify({ error: "ต้องระบุชื่อลูกค้า" });
    if (!customerPhone) return JSON.stringify({ error: "ต้องระบุเบอร์โทรลูกค้า" });
    if (!startDate || !endDate) return JSON.stringify({ error: "ต้องระบุวันเริ่มเช่าและวันคืน (YYYY-MM-DD)" });
    const payload: Record<string, unknown> = { assetName, customerName, customerPhone, startDate, endDate };
    const unitName = String(a.unitName ?? "").trim();
    if (unitName) payload.unitName = unitName;
    const summary = `จองเช่า "${assetName}" ให้ ${customerName} (${startDate} → ${endDate})`;
    return propose(ctx, "rental_create_booking", summary, payload);
  },
};

// ── B2-A7) approval_decide — เสนออนุมัติ/ปฏิเสธคำขอในสายอนุมัติ (สิทธิ์ของคนกดยืนยัน) ──
const approvalDecide: AiTool = {
  action: true,
  def: {
    name: "approval_decide",
    description:
      "เสนออนุมัติหรือปฏิเสธคำขอที่รออยู่ในสายอนุมัติ (ยังไม่ทำทันที — สร้างข้อเสนอให้ผู้ใช้กดยืนยันก่อน · ระบบตัดสินด้วยสิทธิ์ของคนที่กดยืนยัน) · ระบุ decision (APPROVED/REJECTED) และ requestId (ถ้าทราบ) หรือ requestSummary (คำค้นชนิดเอกสาร) · note ถ้ามี · ดูคำขอที่รอได้จากเครื่องมือ approvals_pending",
    parameters: {
      type: "object",
      properties: {
        requestId: { type: "string", description: "รหัสคำขอ (ถ้าทราบ)" },
        requestSummary: { type: "string", description: "คำค้นระบุคำขอ เช่น ชนิดเอกสาร (ถ้าไม่ทราบรหัส)" },
        decision: { type: "string", enum: ["APPROVED", "REJECTED"], description: "ผลการพิจารณา" },
        note: { type: "string", description: "หมายเหตุ (ถ้ามี)" },
      },
      required: ["decision"],
      additionalProperties: false,
    },
  },
  async execute(ctx, args) {
    const a = asRecord(args);
    const decision = a.decision === "REJECTED" ? "REJECTED" : "APPROVED";
    const requestId = String(a.requestId ?? "").trim();
    const requestSummary = String(a.requestSummary ?? "").trim();
    if (!requestId && !requestSummary) {
      return JSON.stringify({ error: "ต้องระบุคำขอ (requestId หรือ requestSummary)", suggestion: "ดูคำขอที่รอได้จากเครื่องมือ approvals_pending" });
    }
    const payload: Record<string, unknown> = { decision };
    if (requestId) payload.requestId = requestId;
    if (requestSummary) payload.requestSummary = requestSummary;
    const note = String(a.note ?? "").trim();
    if (note) payload.note = note;
    const verb = decision === "APPROVED" ? "อนุมัติ" : "ปฏิเสธ";
    const which = requestId ? `รหัส ${requestId}` : `"${requestSummary}"`;
    return propose(ctx, "approval_decide", `${verb}คำขอ ${which}`, payload);
  },
};

// ── B2-A8) inventory_consume — เสนอตัดสินค้าออกจากคลัง (เบิกใช้/ของเสีย) ──
const inventoryConsume: AiTool = {
  action: true,
  def: {
    name: "inventory_consume",
    description:
      "เสนอตัดสินค้าออกจากคลัง (เบิกใช้/ของเสีย) — ยังไม่ทำทันที สร้างข้อเสนอให้ผู้ใช้กดยืนยันก่อน · ระบุ sku และ qty (จำนวนที่ตัดออก) · note เหตุผลถ้ามี",
    parameters: {
      type: "object",
      properties: {
        sku: { type: "string", description: "รหัสสินค้า (SKU)" },
        qty: { type: "integer", minimum: 1, description: "จำนวนที่ตัดออก" },
        note: { type: "string", description: "เหตุผล เช่น เบิกใช้/ของเสีย (ถ้ามี)" },
      },
      required: ["sku", "qty"],
      additionalProperties: false,
    },
  },
  async execute(ctx, args) {
    const a = asRecord(args);
    const sku = String(a.sku ?? "").trim();
    const qty = Math.round(Number(a.qty));
    if (!sku) return JSON.stringify({ error: "ต้องระบุรหัสสินค้า" });
    // validate-explain: ตัด qty ≤ 0 ไม่ได้ → อธิบาย ไม่สร้าง proposal
    if (!Number.isFinite(qty) || qty <= 0) {
      return JSON.stringify({ error: "จำนวนที่ตัดออกต้องมากกว่า 0", suggestion: "ระบุจำนวนเป็นจำนวนเต็มบวก" });
    }
    const note = String(a.note ?? "").trim();
    const payload: Record<string, unknown> = { sku, qty };
    if (note) payload.note = note;
    const summary = `ตัดสินค้ารหัส ${sku} ออกจากคลัง ${qty} หน่วย${note ? ` (${note})` : ""}`;
    return propose(ctx, "inventory_consume", summary, payload);
  },
};

// ── B2-R1) approvals_pending — คำขอที่รออนุมัติทั้งหมด แยกตามชนิดเอกสาร ──
const approvalsPending: AiTool = {
  def: {
    name: "approvals_pending",
    description: "ดูคำขอที่รออนุมัติทั้งหมดของร้าน แยกตามชนิดเอกสาร — คืนจำนวนและรายการล่าสุดในแต่ละชนิด",
    parameters: NO_ARGS,
  },
  async execute(ctx) {
    const rows = await prisma.approvalRequest.findMany({
      where: { tenantId: ctx.tenantId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      select: { entityType: true, entityId: true, amountSatang: true, createdAt: true },
    });
    const byType = new Map<string, { เอกสาร: string; ยอดบาท: number | null; วันที่: string | null }[]>();
    for (const r of rows) {
      const arr = byType.get(r.entityType) ?? [];
      arr.push({
        เอกสาร: r.entityId,
        ยอดบาท: r.amountSatang != null ? Math.round(r.amountSatang) / 100 : null,
        วันที่: safeDate(r.createdAt),
      });
      byType.set(r.entityType, arr);
    }
    return JSON.stringify({
      คำขอรออนุมัติทั้งหมด: rows.length,
      แยกตามชนิดเอกสาร: [...byType.entries()].map(([ชนิดเอกสาร, items]) => ({
        ชนิดเอกสาร,
        จำนวน: items.length,
        ล่าสุด: items.slice(0, 5),
      })),
    });
  },
};

// ── B2-R2) rental_active — สัญญาเช่าที่ยังค้างคืน (จองแล้ว/รับของไปแล้ว) ทุกจุดให้เช่า ──
const rentalActive: AiTool = {
  def: {
    name: "rental_active",
    description: "ดูสัญญาเช่าที่ยังค้างคืน (จองแล้ว/รับของไปแล้ว) ทุกจุดให้เช่า — คืนของที่เช่า ลูกค้า และช่วงวันเช่า",
    parameters: NO_ARGS,
  },
  async execute(ctx) {
    const rows = await prisma.rentalBooking.findMany({
      where: { tenantId: ctx.tenantId, status: { in: ["BOOKED", "PICKED_UP"] } },
      orderBy: { startDate: "asc" },
      include: { asset: { select: { name: true } } },
    });
    return JSON.stringify({
      สัญญาเช่าที่ค้างคืน: rows.map((r) => ({
        ของ: r.asset?.name ?? null,
        ลูกค้า: r.customerName,
        เบอร์: r.customerPhone,
        ตั้งแต่: safeDate(r.startDate),
        ถึง: safeDate(r.endDate),
        สถานะ: r.status,
      })),
    });
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
    askClarify,
    // Phase B1 read — เงินเดิน (นัดวันนี้ / คิวที่รอ / ออเดอร์รอชำระ)
    todayAppointments,
    queueWaiting,
    shopPendingOrders,
    // Phase B2 read — คำขอรออนุมัติ / สัญญาเช่าค้างคืน
    approvalsPending,
    rentalActive,
    // action / ทำแทน
    inventoryReceive,
    hrDecideLeave,
    marketingCreateCampaign,
    memberCreate,
    openSystem,
    inventoryCreateItem,
    inventoryAdjust,
    hrCreateEmployee,
    couponCreate,
    kanbanCreateBoard,
    kanbanCreateCard,
    recordExpense,
    voidSale,
    // Phase B1 action — เงินเดิน (เปิดบิล / จองบริการ / จองห้อง / บัตรคิว / ยืนยันออเดอร์)
    posCreateSale,
    bookingCreateAppointment,
    hotelCreateReservation,
    queueIssueTicket,
    shopConfirmOrder,
    // Phase B2 action — CRM / KB / โรงเรียน / คลินิก / เช่า / สายอนุมัติ / คลังตัดออก
    crmCreateLead,
    kbCreateArticle,
    schoolEnroll,
    schoolMarkPaid,
    clinicCreatePatient,
    rentalCreateBooking,
    approvalDecide,
    inventoryConsume,
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

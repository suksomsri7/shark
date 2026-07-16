// เครื่องมือ read-only ของผู้ช่วย AI (Phase 3 v1 — WO-0018)
// ผู้ช่วย "ดู" ข้อมูลจริงของร้านได้ (ยอดขาย/สต็อก/สมาชิก/ใบลา/ระบบที่เปิด) แต่ยัง "แก้ไข" ไม่ได้
//
// กติกา:
// - ทุก tool คืน JSON string ภาษาไทยอ่านรู้เรื่อง — LLM เอาไปเรียบเรียงตอบต่อ
// - runTool กันพังทุกทาง: tool ไม่รู้จัก / args เพี้ยน / DB error → คืน JSON {"error":"..."} ห้าม throw
// - model แบบ system-scoped (Customer/InvItem/HrLeave/PosSale) ต้องหา AppSystem ประเภทนั้นก่อน
//   แล้วเปิด tenantDb({ tenantId, systemId }) ให้ guard inject ตัวกรองให้ (ดู pattern marketing/service.ts)

import { tenantDb } from "@/lib/core/db";
import type { SystemType } from "@prisma/client";
import { lowStock as invLowStock } from "@/lib/modules/inventory/service";
import { pendingLeaves as hrPendingLeaves } from "@/lib/modules/hr/service";

export type ToolCtx = { tenantId: string };

export type AiTool = {
  def: { name: string; description: string; parameters: object };
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

export function toolRegistry(): AiTool[] {
  return [listSystems, salesSummary, lowStock, pendingLeaves, memberCount];
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

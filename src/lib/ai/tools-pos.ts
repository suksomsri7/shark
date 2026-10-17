// tools-pos.ts — เครื่องมือของสกิล `sales` ที่มาจากทะเบียน op ของ REST ขายหน้าร้าน (POS P3.9 ▸ R1 R5 มติ 1 8 ◂)
//
// ไฟล์นี้บาง ๆ โดยตั้งใจ (แบบเดียวกับ tools-member.ts): ไม่มีความรู้เรื่อง POS เลย
//   - รายชื่อ/สคีมา/การรัน = `@/lib/modules/pos/api/tools` (สร้างจาก `POS_OPS.filter(o => o.tool)` — 11 ตัว)
//   - การเก็บข้อเสนอ = `./proposals` (createProposal ตัวเดิม · kind `pos.<op id>`)
//   - เครื่องมือเขียนมือ 1 ตัว: `pos_draft_po` (ร่างใบสั่งซื้อจากยอดขาย — ไม่มี op REST คู่ · ต้องมีระบบ POS + คลังสินค้า)
// กติกา 3 ชั้นเหมือนทุกโมดูล: read = ทำทันทีด้วยสิทธิ์ของคนถาม · write = ข้อเสนอ · danger = ข้อเสนอ DESTRUCTIVE (ยืนยัน 2 ชั้น)

import { posToolInfos, runPosTool, type PosToolCtx } from "@/lib/modules/pos/api/tools";
import { purchaseSuggestions } from "@/lib/modules/pos/ai-insights";
import { tenantDb } from "@/lib/core/db";
import { createProposal, type ProposalKind } from "./proposals";
import type { AiTool, ToolCtx } from "./tools";
import { actorProblem, aiActorMembership, aiActorUserId, isGeneralKeyActor } from "./actor";

const pendingConfirmation = "user_confirm" as const;

/** ผู้กระทำของ AI → ผู้กระทำของสะพาน POS (คน = Membership ของเขา · คีย์ = scope ของคีย์ · งานภายใน = ผู้อ่านสิทธิ์น้อยสุด) */
function bridgeCtx(ctx: ToolCtx): PosToolCtx {
  const a = ctx.actor;
  if (a.kind === "apiKey") return { tenantId: ctx.tenantId, systemId: ctx.systemId ?? a.systemId, key: { keyId: a.keyId, scopes: [...a.scopes], systemId: ctx.systemId ?? a.systemId, general: isGeneralKeyActor(a) } };
  const m = aiActorMembership(a);
  return { tenantId: ctx.tenantId, systemId: ctx.systemId ?? null, person: m ? { userId: aiActorUserId(a) ?? "", role: m.role, unitAccess: m.unitAccess, permissions: m.permissions } : null };
}

async function propose(ctx: ToolCtx, kind: string, summary: string, payload: Record<string, unknown>, extra: Record<string, unknown> = {}): Promise<string> {
  if (!ctx.conversationId) return JSON.stringify({ error: "ต้องอยู่ในบทสนทนาก่อนจึงจะเสนอการกระทำได้" });
  const p = await createProposal({ tenantId: ctx.tenantId }, { conversationId: ctx.conversationId, kind: kind as ProposalKind, summary, payload });
  return JSON.stringify({ proposalId: p.id, summary, waiting: pendingConfirmation, ...extra });
}

/** R5 — เครื่องมือเขียนมือ: ร่างใบสั่งซื้อจากความเร็วขาย 14 วัน (ข้อเสนอ kind `pos_draft_po` · สิทธิ์คนกด = inventory.po.create) */
const posDraftPo: AiTool = {
  action: true,
  def: {
    name: "pos_draft_po",
    description:
      "Propose a DRAFT purchase order for stock that sells out soon: items linked to POS products whose stock is at or below the reorder point, or covers less than 3 days of the last 14 days of sales. Quantity = 14 days of sales minus stock on hand (at least 1); supplier = the supplier of the item's latest purchase order. Items with no supplier yet are listed so you can ask the user. Nothing is ordered: a person confirms the draft, and ordering stays in the inventory app.",
    parameters: {
      type: "object",
      properties: {
        unitId: { type: "string", description: "Branch (BusinessUnit id) to look at. Absent = every branch you can read." },
        supplierId: { type: "string", description: "Only this supplier's items (when the suggestions span several suppliers)." },
      },
      additionalProperties: false,
    },
  },
  async execute(ctx: ToolCtx, args: unknown): Promise<string> {
    const bad = actorProblem(ctx);
    if (bad) return JSON.stringify({ error: bad });
    const b = bridgeCtx(ctx);
    if (!b.person || !b.person.userId) return JSON.stringify({ error: "ร่างใบสั่งซื้อจากผู้ช่วยใช้ได้เฉพาะคนในร้านที่เปิดผู้ช่วยในแอป" });
    const a = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
    const db = tenantDb({ tenantId: ctx.tenantId });
    const pos = await db.appSystem.findFirst({ where: { type: "POS", ...(ctx.systemId ? { id: ctx.systemId } : {}) }, orderBy: { createdAt: "asc" }, select: { id: true } });
    if (!pos) return JSON.stringify({ error: "ร้านนี้ยังไม่ได้เปิดระบบขายหน้าร้าน (POS)" });
    if (!(await db.appSystem.findFirst({ where: { type: "INVENTORY" }, select: { id: true } }))) return JSON.stringify({ error: "ร้านนี้ยังไม่ได้เปิดระบบคลังสินค้า — ร่างใบสั่งซื้อไม่ได้" });
    const unitId = typeof a.unitId === "string" && a.unitId.trim() ? a.unitId.trim() : undefined;
    const r = await purchaseSuggestions({ tenantId: ctx.tenantId, systemId: pos.id, ...(unitId ? { unitId } : {}) }, b.person);
    if (r.ok !== true) return JSON.stringify({ error: r.message });
    const noSupplier = r.suggestions.filter((s) => !s.supplierId).map((s) => ({ สินค้า: s.name, จำนวนที่ควรสั่ง: s.qty, คงเหลือ: s.onHand }));
    const withSup = r.suggestions.filter((s) => s.supplierId && (typeof a.supplierId !== "string" || s.supplierId === a.supplierId));
    if (!withSup.length) {
      return JSON.stringify(
        noSupplier.length
          ? { error: "ยังไม่มีผู้ขายของสินค้าที่ควรสั่ง — ถามผู้ใช้ว่าจะสั่งจากผู้ขายรายไหน แล้วสร้างใบสั่งซื้อในระบบคลังสินค้า", ยังไม่มีผู้ขาย: noSupplier }
          : { ผล: `ไม่มีสินค้าที่ต้องสั่งเพิ่ม (ยอดขาย ${r.from} ถึง ${r.to})` },
      );
    }
    // ใบสั่งซื้อ 1 ใบต่อผู้ขาย 1 ราย ⇒ เลือกผู้ขายที่มีรายการมากสุด (ที่เหลือแจ้งให้เสนอใหม่ด้วย supplierId)
    const bySup = new Map<string, typeof withSup>();
    for (const s of withSup) bySup.set(`${s.inventorySystemId}|${s.supplierId}`, [...(bySup.get(`${s.inventorySystemId}|${s.supplierId}`) ?? []), s]);
    const groups = [...bySup.values()].sort((x, y) => y.length - x.length);
    const g = groups[0]!;
    const lines = g.map((s) => ({ itemId: s.itemId, qty: s.qty, costSatang: s.costSatang }));
    const total = g.reduce((t, s) => t + s.qty * s.costSatang, 0);
    const summary = `ร่างใบสั่งซื้อถึง "${g[0]!.supplierName ?? "ผู้ขาย"}" ${g.length} รายการ (${g.map((s) => `${s.name} ×${s.qty}`).join(", ")}) · ประมาณ ฿${(total / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const payload = { inventorySystemId: g[0]!.inventorySystemId, supplierId: g[0]!.supplierId, lines, posSystemId: pos.id, window: { from: r.from, to: r.to } };
    return propose(ctx, "pos_draft_po", summary, payload, {
      ...(noSupplier.length ? { ยังไม่มีผู้ขาย: noSupplier } : {}),
      ...(groups.length > 1 ? { ผู้ขายอื่นที่ควรสั่งด้วย: groups.slice(1).map((x) => ({ supplierId: x[0]!.supplierId, ผู้ขาย: x[0]!.supplierName, รายการ: x.length })) } : {}),
    });
  },
};

/**
 * เครื่องมือของสกิล sales ที่มาจากทะเบียน POS (11 ตัว · ชื่อเดิม sales_summary/sales_by_day/void_sale คงไว้) + pos_draft_po
 */
export function posTools(): AiTool[] {
  return [
    ...posToolInfos().map(
      (info): AiTool => ({
        ...(info.write ? { action: true as const } : {}),
        def: { name: info.name, description: info.description, parameters: info.parameters },
        async execute(ctx: ToolCtx, args: unknown): Promise<string> {
          const bad = actorProblem(ctx);
          if (bad) return JSON.stringify({ error: bad });
          const outcome = await runPosTool(bridgeCtx(ctx), info.name, args);
          if (outcome.mode === "error") return JSON.stringify({ error: outcome.error });
          if (outcome.mode === "read") return JSON.stringify(outcome.result);
          return propose(ctx, outcome.kind, outcome.summary, outcome.payload);
        },
      }),
    ),
    posDraftPo,
  ];
}

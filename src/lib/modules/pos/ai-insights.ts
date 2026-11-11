// ai-insights.ts — ข้อเสนอสั่งซื้อจากยอดขาย POS (POS P3.9 ▸ R5 มติ 8 ◂) · อ่านอย่างเดียว ยกเว้น `draftPurchaseOrder` (หลังคนกดยืนยัน)
//
// purchaseSuggestions = สินค้าคลังที่ผูกสินค้า POS ซึ่ง "ควรสั่งเพิ่ม":
//   หน้าต่าง = 14 วันธุรกิจที่จบเมื่อวาน (D−14..D−1 · ตัดวันตามค่าตั้งของระบบ) จาก `reportProducts` (ตัวอ่านเดียวกับหน้ารายงาน — ไม่มี SQL ยอดขายใหม่)
//   velocity = จำนวนขายสุทธิ / 14 · เข้ารายการเมื่อ (จุดสั่งซื้อ > 0 และ onHand ≤ จุดสั่งซื้อ) หรือ (velocity > 0 และ onHand / velocity < 3 วัน)
//   qty = max(1, ⌈14 × velocity⌉ − onHand) = max(1, ขาย 14 วัน − onHand) (จำนวนเต็ม ไม่มีทศนิยมลอย)
//   ผู้ขาย = ผู้ขายของบรรทัด PO ล่าสุด (ตาม createdAt ของ PO) ของสินค้านั้น · ไม่เคยสั่ง = null (ข้อเสนอถามผู้ใช้)
// 🔴 สิทธิ์: ตัวอ่านรายงาน (pos.report.view ต่อสาขา) + อ่านคลังได้ (`canReadInventory`) · ไม่ผ่าน = คำปฏิเสธ ไม่ใช่ "ไม่มีอะไรต้องสั่ง"
// 🔴 ร่าง PO = DRAFT เท่านั้นผ่าน facade คลัง (`createPo` · inventory/index.ts) — การสั่งจริง/สายอนุมัติอยู่ที่หน้าคลัง

import { canGrantUnitAccess, canReadInventory, evaluate, type MembershipCtx } from "@/lib/core/rbac";
import type { Prisma } from "@prisma/client";
import { createPo } from "@/lib/modules/inventory";
import { prisma } from "./db";
import { bkkBusinessDate, reportProducts, type ReportRefusal } from "./reports";
import type { RegisterActor } from "./register-shared";
import { posDayCutoffMinutes } from "./settings-shared";

const DAY_MS = 86_400_000;
export const SUGGEST_WINDOW_DAYS = 14;
const COVER_DAYS = 3;
const MAX_SUGGESTIONS = 50;

export type PurchaseSuggestion = {
  itemId: string;
  name: string;
  inventorySystemId: string;
  onHand: number;
  reorderPoint: number;
  sold14: number;
  /** จำนวนต่อวัน (ทศนิยม 2 ตำแหน่ง · แสดงผลเท่านั้น) */
  velocityPerDay: number;
  /** วันที่ของเหลือพอขาย (null = ยังไม่มียอดขายในหน้าต่าง) */
  daysOfCover: number | null;
  qty: number;
  supplierId: string | null;
  supplierName: string | null;
  costSatang: number;
};
export type PurchaseSuggestionsResult = { ok: true; from: string; to: string; suggestions: PurchaseSuggestion[] } | ReportRefusal;
export type StockRisk = { itemId: string; name: string; onHand: number; reorderPoint: number };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const memOf = (a: RegisterActor): MembershipCtx => ({ role: a.role, unitAccess: a.unitAccess, permissions: a.permissions });
const refuse = (code: ReportRefusal["code"], message: string): ReportRefusal => ({ ok: false, code, message });

type Ctx = { tenantId: string; systemId: string; unitId?: string | null };

/**
 * POS P5.2 ▸ fix F (F10b): ไม่ระบุสาขา ⇒ สินค้าเฉพาะสาขาเห็นได้เฉพาะสาขาที่ผู้ถามดูรายงานได้ (pos.report.view ต่อสาขาที่ผูกระบบนี้) ·
 * ผู้กระทำทุกสาขา (OWNER / unitAccess ["*"]) = ไม่กรอง (เดิม) · ระบุสาขา = สาขานั้น (ผ่านด่าน pos.report.view ของผู้เรียกแล้ว) ◂
 */
async function unitFilterOf(ctx: Ctx, m: MembershipCtx): Promise<Prisma.PosProductWhereInput> {
  if (ctx.unitId) return { OR: [{ unitId: null }, { unitId: ctx.unitId }] };
  if (canGrantUnitAccess(m, ["*"])) return {};
  const links = await prisma.appSystemUnit.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, type: "POS" }, select: { unitId: true } });
  const readable = links.map((l) => l.unitId).filter((unitId) => evaluate(m, { module: "pos", action: "pos.report.view", unitId }));
  return { OR: [{ unitId: null }, { unitId: { in: readable } }] };
}

/** สินค้าคลังที่ผูกสินค้า POS ของระบบนี้ (สาขาที่ระบุ/สาขาที่ผู้ถามดูได้ + สินค้าทุกสาขา) — ไม่เก็บถาวร · เฉพาะ PRODUCT */
async function linkedItems(ctx: Ctx, m: MembershipCtx) {
  const prods = await prisma.posProduct.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, archivedAt: null, invItemId: { not: null }, ...(await unitFilterOf(ctx, m)) },
    select: { invItemId: true },
  });
  const ids = [...new Set(prods.map((p) => p.invItemId).filter((x): x is string => !!x))];
  if (!ids.length) return [];
  return prisma.invItem.findMany({
    where: { tenantId: ctx.tenantId, id: { in: ids }, kind: "PRODUCT", archivedAt: null },
    select: { id: true, name: true, systemId: true, onHand: true, reorderPoint: true, costSatang: true },
    orderBy: { id: "asc" },
  });
}

/** สินค้าที่ต่ำกว่า/เท่าจุดสั่งซื้อ (สรุปเช้า "ใกล้หมด") — สิทธิ์อ่านคลังเท่านั้น · ไม่ได้ = null (ส่วนนั้นถูกปฏิเสธ) */
export async function posStockRisks(ctx: Ctx, actor: RegisterActor): Promise<StockRisk[] | null> {
  if (!canReadInventory(memOf(actor))) return null;
  if (ctx.unitId && !evaluate(memOf(actor), { module: "pos", action: "pos.report.view", unitId: ctx.unitId })) return null;
  // POS P3.9 ▸ fix1 F5: ไม่ระบุสาขา = ต้องดูรายงานได้อย่างน้อยหนึ่งสาขาของระบบ POS นี้ (ผู้จัดการของสาขาระบบอื่นไม่เห็นสต็อกของระบบนี้ · สรุปที่ทุกส่วนถูกปฏิเสธจึงว่างจริง) ◂
  if (!ctx.unitId) {
    const links = await prisma.appSystemUnit.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, type: "POS" }, select: { unitId: true } });
    if (!links.some((l) => evaluate(memOf(actor), { module: "pos", action: "pos.report.view", unitId: l.unitId }))) return null;
  }
  const items = await linkedItems(ctx, memOf(actor));
  return items
    .filter((i) => i.reorderPoint > 0 && i.onHand <= i.reorderPoint)
    .sort((a, b) => a.onHand - a.reorderPoint - (b.onHand - b.reorderPoint) || (a.id < b.id ? -1 : 1))
    .map((i) => ({ itemId: i.id, name: i.name, onHand: i.onHand, reorderPoint: i.reorderPoint }));
}

/** R5 — ข้อเสนอสั่งซื้อจากความเร็วขาย 14 วัน · คืนคำปฏิเสธของตัวอ่านรายงานตรงตัว */
export async function purchaseSuggestions(ctx: Ctx, actor: RegisterActor, opts: { now?: Date } = {}): Promise<PurchaseSuggestionsResult> {
  if (!isRecord(ctx) || typeof ctx.tenantId !== "string" || typeof ctx.systemId !== "string") return refuse("NOT_FOUND", "ไม่พบระบบขายหน้าร้านนี้");
  const sys = await prisma.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "POS" }, select: { settings: true } });
  if (!sys) return refuse("NOT_FOUND", "ไม่พบระบบขายหน้าร้านนี้");
  if (!canReadInventory(memOf(actor))) return refuse("PERMISSION_DENIED", "บัญชีนี้ยังไม่มีสิทธิ์ดูข้อมูลคลังสินค้า — ขอสิทธิ์จากเจ้าของร้าน");
  const today = bkkBusinessDate(opts.now ?? new Date(), posDayCutoffMinutes(sys.settings));
  const from = addDays(today, -SUGGEST_WINDOW_DAYS);
  const to = addDays(today, -1);
  const rc = { tenantId: ctx.tenantId, systemId: ctx.systemId, ...(ctx.unitId ? { unitId: ctx.unitId } : {}) };
  const rp = await reportProducts(rc, actor, { from, to, limit: 1000 });
  if (rp.ok !== true) return rp;
  const sold = new Map<string, number>();
  const byProduct = new Map<string, number>();
  for (const r of rp.report.rows) {
    if (r.itemId) sold.set(r.itemId, (sold.get(r.itemId) ?? 0) + r.qty);
    else if (r.productId) byProduct.set(r.productId, (byProduct.get(r.productId) ?? 0) + r.qty);
  }
  // บรรทัดที่ไม่มี itemId (บิลเก่าก่อนผูกคลัง) — แปลงผ่าน PosProduct.invItemId
  if (byProduct.size) {
    for (const p of await prisma.posProduct.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, id: { in: [...byProduct.keys()] }, invItemId: { not: null } }, select: { id: true, invItemId: true } })) {
      sold.set(p.invItemId!, (sold.get(p.invItemId!) ?? 0) + (byProduct.get(p.id) ?? 0));
    }
  }
  const items = await linkedItems(ctx, memOf(actor));
  const picked = items
    .map((i) => {
      const s = Math.max(0, sold.get(i.id) ?? 0);
      const cover = s > 0 ? (i.onHand * SUGGEST_WINDOW_DAYS) / s : null;
      const due = (i.reorderPoint > 0 && i.onHand <= i.reorderPoint) || (cover !== null && cover < COVER_DAYS);
      return { i, s, cover, due };
    })
    .filter((x) => x.due)
    .slice(0, MAX_SUGGESTIONS);
  // ผู้ขายล่าสุดต่อสินค้า (PO ใหม่สุดก่อน) + ต้นทุนของบรรทัดนั้น
  const last = new Map<string, { supplierId: string; costSatang: number }>();
  if (picked.length) {
    const lines = await prisma.poLine.findMany({
      where: { tenantId: ctx.tenantId, itemId: { in: picked.map((x) => x.i.id) } },
      select: { itemId: true, costSatang: true, po: { select: { supplierId: true, createdAt: true, id: true } } },
    });
    lines.sort((a, b) => b.po.createdAt.getTime() - a.po.createdAt.getTime() || (a.po.id < b.po.id ? 1 : -1));
    for (const l of lines) if (!last.has(l.itemId)) last.set(l.itemId, { supplierId: l.po.supplierId, costSatang: l.costSatang });
  }
  const supIds = [...new Set([...last.values()].map((x) => x.supplierId))];
  const sups = supIds.length ? await prisma.supplier.findMany({ where: { tenantId: ctx.tenantId, id: { in: supIds } }, select: { id: true, name: true, systemId: true } }) : [];
  const supById = new Map(sups.map((s) => [s.id, s]));
  const suggestions: PurchaseSuggestion[] = picked.map(({ i, s, cover }) => {
    const l = last.get(i.id);
    const sup = l ? supById.get(l.supplierId) : undefined;
    const okSup = sup && sup.systemId === i.systemId ? sup : undefined;
    return {
      itemId: i.id,
      name: i.name,
      inventorySystemId: i.systemId,
      onHand: i.onHand,
      reorderPoint: i.reorderPoint,
      sold14: s,
      velocityPerDay: Math.round((s * 100) / SUGGEST_WINDOW_DAYS) / 100,
      daysOfCover: cover === null ? null : Math.round(cover * 10) / 10,
      qty: Math.max(1, s - i.onHand),
      supplierId: okSup?.id ?? null,
      supplierName: okSup?.name ?? null,
      costSatang: okSup && l ? l.costSatang : i.costSatang,
    };
  });
  return { ok: true, from, to, suggestions };
}

/**
 * ลงมือหลังคนกดยืนยันข้อเสนอ `pos_draft_po` (ai/proposals.ts → api/tools.ts dispatchPosKind) — ใบสั่งซื้อ DRAFT 1 ใบต่อข้อเสนอ
 * payload = {inventorySystemId, supplierId, lines:[{itemId, qty, costSatang}]} (จากแถวข้อเสนอเท่านั้น) · สิทธิ์ inventory.po.create ตรวจที่ executeProposal แล้ว
 * กดซ้ำ = กันที่การจองข้อเสนอ (PENDING→EXECUTED แบบอะตอมมิก) · ผู้ขาย/สินค้าต้องเป็นของคลังนั้น (createPo ตรวจซ้ำ)
 */
export async function draftPurchaseOrder(ctx: { tenantId: string; proposalId: string }, actor: RegisterActor, payload: Record<string, unknown>): Promise<string> {
  const inv = typeof payload.inventorySystemId === "string" ? payload.inventorySystemId : "";
  const supplierId = typeof payload.supplierId === "string" ? payload.supplierId : "";
  const raw = Array.isArray(payload.lines) ? payload.lines : [];
  const lines = raw
    .filter(isRecord)
    .map((l) => ({ itemId: String(l.itemId ?? ""), qty: Math.round(Number(l.qty)), costSatang: Math.max(0, Math.round(Number(l.costSatang) || 0)) }))
    .filter((l) => l.itemId && Number.isFinite(l.qty) && l.qty >= 1);
  if (!inv || !supplierId || !lines.length) throw new Error("ข้อเสนอสั่งซื้อนี้ไม่ครบ (ระบบคลัง/ผู้ขาย/รายการ) — ขอให้ผู้ช่วยเสนอใหม่");
  const sys = await prisma.appSystem.findFirst({ where: { id: inv, tenantId: ctx.tenantId, type: "INVENTORY" }, select: { id: true } });
  if (!sys) throw new Error("ไม่พบระบบคลังสินค้าของข้อเสนอนี้");
  if (!evaluate(memOf(actor), { module: "inventory", action: "inventory.po.create" })) throw new Error("คุณยังไม่มีสิทธิ์สร้างใบสั่งซื้อ ให้ผู้มีสิทธิ์เป็นผู้กดยืนยัน");
  const po = await createPo({ tenantId: ctx.tenantId, systemId: inv }, { supplierId, note: `ร่างจากผู้ช่วย AI ของหน้าขาย (ข้อเสนอ ${ctx.proposalId.slice(-8)})`, lines });
  return `สร้างใบสั่งซื้อ ${po.code} (ฉบับร่าง) ${lines.length} รายการแล้ว — ตรวจแล้วกดสั่งซื้อในระบบคลังสินค้า`;
}
